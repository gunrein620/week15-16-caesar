from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rate_limit import limiter
from app.dependencies import require_verified_user
from app.models import ArtistArchiveTerm, Collection, Member, Post, User
from app.schemas import (
    ChatRequest,
    QaRequest,
    QaResponse,
    RagContextRequest,
    RagContextResponse,
    SavedSummaryRequest,
    SimilarRequest,
    PostRead,
    WritingAssistRequest,
)
from app.api.posts import _post_read, _post_query
from app.services.chat_agent import stream_chat_events
from app.services.quota import ai_rate_limit_cost, consume_ai_quota
from app.services.rag import answer_question, similar_posts
from app.services.rag_context import build_rag_context, saved_summary_context
from app.services.search_intent import archive_alias_matches_text, intent_to_payload, normalize_search_text
from app.services.updates import _contains_alias, _member_aliases

router = APIRouter(prefix="/ai", tags=["ai"])


def _writing_suggestions(
    db: Session,
    *,
    user: User,
    artist_id: int,
    query: str,
) -> tuple[list[str], list[dict], list[dict]]:
    normalized_query = normalize_search_text(query)
    members = db.scalars(select(Member).where(Member.artist_id == artist_id)).all()
    suggested_members = [
        member.name
        for member in members
        if any(_contains_alias(query, alias) for alias in _member_aliases(member.name))
    ]

    archive_terms: list[dict] = []
    for term in db.scalars(
        select(ArtistArchiveTerm)
        .where(ArtistArchiveTerm.artist_id == artist_id)
        .order_by(ArtistArchiveTerm.term_type.asc(), ArtistArchiveTerm.title.asc())
    ).all():
        aliases = tuple(dict.fromkeys([term.title, *(term.aliases or [])]))
        if any(archive_alias_matches_text(query, alias, normalized_query) for alias in aliases):
            archive_terms.append(
                {
                    "id": term.id,
                    "title": term.title,
                    "term_type": term.term_type,
                }
            )

    collections = db.scalars(
        select(Collection)
        .where(Collection.user_id == user.id, Collection.artist_id == artist_id)
        .order_by(Collection.updated_at.desc(), Collection.id.desc())
        .limit(5)
    ).all()
    collection_targets = [
        {
            "id": collection.id,
            "title": collection.title,
            "reason": "이 글의 참고자료를 기존 컬렉션에 이어 담을 수 있습니다.",
        }
        for collection in collections
    ]
    if not collection_targets:
        collection_targets.append(
            {
                "id": None,
                "title": "참고자료 큐",
                "reason": "글에 쓴 영상과 자료를 새 컬렉션으로 묶기 좋습니다.",
            }
        )
    return suggested_members, archive_terms[:10], collection_targets


@router.post("/qa", response_model=QaResponse)
@limiter.limit("20/day", cost=ai_rate_limit_cost)
def qa(
    request: Request,
    payload: QaRequest,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> QaResponse:
    if payload.offset == 0 and payload.include_answer:
        consume_ai_quota(db, user, "qa")
    answer, sources, has_more, next_offset, intent = answer_question(
        db,
        payload.question,
        payload.artist_id,
        limit=payload.limit,
        offset=payload.offset,
        include_answer=payload.include_answer,
        search_intent_payload=payload.search_intent,
    )
    return QaResponse(
        answer=answer,
        sources=sources,
        has_more=has_more,
        next_offset=next_offset,
        search_intent=intent_to_payload(intent),
    )


@router.post("/chat")
@limiter.limit("80/day", cost=ai_rate_limit_cost)
def chat(
    request: Request,
    payload: ChatRequest,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    consume_ai_quota(db, user, "chat")
    return StreamingResponse(
        stream_chat_events(payload, user_id=user.id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/context", response_model=RagContextResponse)
@limiter.limit("20/day", cost=ai_rate_limit_cost)
def rag_context(
    request: Request,
    payload: RagContextRequest,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> RagContextResponse:
    consume_ai_quota(db, user, "rag_context")
    if payload.saved_only or payload.mode == "saved_summary":
        result = saved_summary_context(db, user=user, artist_id=payload.artist_id, limit=payload.limit)
    else:
        result = build_rag_context(
            db,
            artist_id=payload.artist_id,
            query=payload.query,
            mode=payload.mode,
            limit=payload.limit,
        )
    return RagContextResponse(
        summary=result.summary,
        sources=result.sources,
        insert_text=result.insert_text,
    )


@router.post("/saved-summary", response_model=RagContextResponse)
@limiter.limit("20/day", cost=ai_rate_limit_cost)
def saved_summary(
    request: Request,
    payload: SavedSummaryRequest,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> RagContextResponse:
    consume_ai_quota(db, user, "saved_summary")
    result = saved_summary_context(db, user=user, artist_id=payload.artist_id, limit=payload.limit)
    return RagContextResponse(
        summary=result.summary,
        sources=result.sources,
        insert_text=result.insert_text,
    )


@router.post("/writing-assist", response_model=RagContextResponse)
@limiter.limit("20/day", cost=ai_rate_limit_cost)
def writing_assist(
    request: Request,
    payload: WritingAssistRequest,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> RagContextResponse:
    consume_ai_quota(db, user, "writing_assist")
    query = " ".join([payload.category, payload.title, payload.content])
    result = build_rag_context(
        db,
        artist_id=payload.artist_id,
        query=query,
        mode="writing_assist",
        limit=payload.limit,
    )
    members, archive_terms, collection_targets = _writing_suggestions(
        db,
        user=user,
        artist_id=payload.artist_id,
        query=query,
    )
    return RagContextResponse(
        summary=result.summary,
        sources=result.sources,
        insert_text=result.insert_text,
        suggested_members=members,
        suggested_archive_terms=archive_terms,
        suggested_collection_targets=collection_targets,
    )


@router.post("/similar", response_model=list[PostRead])
@limiter.limit("20/day", cost=ai_rate_limit_cost)
def similar(
    request: Request,
    payload: SimilarRequest,
    user: Annotated[User, Depends(require_verified_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[PostRead]:
    consume_ai_quota(db, user, "similar")
    posts = similar_posts(db, payload.post_id, payload.limit)
    if not posts:
        return []
    ids = [post.id for post in posts]
    hydrated = db.scalars(_post_query().where(Post.id.in_(ids))).unique().all()
    lookup = {post.id: post for post in hydrated}
    return [_post_read(lookup.get(post.id, post)) for post in posts]
