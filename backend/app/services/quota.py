from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_session_factory
from app.core.security import decode_access_token
from app.models import AiUsageCounter, User


def _today() -> date:
    return datetime.now(UTC).date()


def _counter(db: Session, scope: str, scope_id: str, feature: str) -> AiUsageCounter:
    day = _today()
    counter = db.scalar(
        select(AiUsageCounter).where(
            AiUsageCounter.scope == scope,
            AiUsageCounter.scope_id == scope_id,
            AiUsageCounter.feature == feature,
            AiUsageCounter.day == day,
        )
    )
    if counter is None:
        counter = AiUsageCounter(scope=scope, scope_id=scope_id, feature=feature, day=day, count=0)
        db.add(counter)
        db.flush()
    return counter


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def ai_rate_limit_cost(request) -> int:
    token = _bearer_token(request.headers.get("authorization"))
    if token is None:
        return 1
    user_id = decode_access_token(token)
    if user_id is None:
        return 1
    with get_session_factory()() as db:
        user = db.get(User, user_id)
        if user is not None and user.role == "admin":
            return 0
    return 1


def consume_ai_quota(db: Session, user: User, feature: str) -> None:
    if user.role == "admin":
        return
    settings = get_settings()
    user_limit = settings.chat_daily_user_limit if feature == "chat" else settings.ai_daily_user_limit
    global_limit = settings.chat_daily_global_limit if feature == "chat" else settings.ai_daily_global_limit
    user_counter = _counter(db, "user", str(user.id), feature)
    global_counter = _counter(db, "global", "global", feature)
    if user_counter.count >= user_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="오늘 AI 검색 한도를 초과했습니다.",
        )
    if global_counter.count >= global_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="오늘 전체 AI 사용량 한도를 초과했습니다.",
        )
    user_counter.count += 1
    global_counter.count += 1
    db.commit()
