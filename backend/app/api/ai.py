from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rate_limit import limiter
from app.dependencies import require_verified_user
from app.models import Post, User
from app.schemas import (
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
from app.services.quota import ai_rate_limit_cost, consume_ai_quota
from app.services.rag import answer_question, similar_posts
from app.services.rag_context import build_rag_context, saved_summary_context
from app.services.search_intent import intent_to_payload

router = APIRouter(prefix="/ai", tags=["ai"])


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
    return RagContextResponse(summary=result.summary, sources=result.sources, insert_text=result.insert_text)


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
    return RagContextResponse(summary=result.summary, sources=result.sources, insert_text=result.insert_text)


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
    return RagContextResponse(summary=result.summary, sources=result.sources, insert_text=result.insert_text)


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
