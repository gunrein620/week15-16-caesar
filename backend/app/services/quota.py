from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
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


def consume_ai_quota(db: Session, user: User, feature: str) -> None:
    settings = get_settings()
    user_counter = _counter(db, "user", str(user.id), feature)
    global_counter = _counter(db, "global", "global", feature)
    if user_counter.count >= settings.ai_daily_user_limit:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Daily AI limit")
    if global_counter.count >= settings.ai_daily_global_limit:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Daily AI limit")
    user_counter.count += 1
    global_counter.count += 1
    db.commit()
