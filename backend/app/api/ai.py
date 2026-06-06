from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rate_limit import limiter
from app.dependencies import get_current_user
from app.models import Post, User
from app.schemas import QaRequest, QaResponse, SimilarRequest, PostRead
from app.api.posts import _post_read, _post_query
from app.services.quota import consume_ai_quota
from app.services.rag import answer_question, similar_posts

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/qa", response_model=QaResponse)
@limiter.limit("20/day")
def qa(
    request: Request,
    payload: QaRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> QaResponse:
    consume_ai_quota(db, user, "qa")
    answer, sources = answer_question(db, payload.question, payload.artist_id)
    return QaResponse(answer=answer, sources=sources)


@router.post("/similar", response_model=list[PostRead])
@limiter.limit("20/day")
def similar(
    request: Request,
    payload: SimilarRequest,
    user: Annotated[User, Depends(get_current_user)],
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
