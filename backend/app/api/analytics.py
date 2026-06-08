from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rate_limit import limiter
from app.dependencies import get_optional_current_user, require_admin
from app.models import User
from app.schemas import (
    AnalyticsCleanupResponse,
    AnalyticsCollectResponse,
    AnalyticsEventRead,
    AnalyticsEventsCreate,
    AnalyticsSummary,
)
from app.services.analytics import (
    analytics_event_read,
    analytics_summary,
    cleanup_old_analytics_events,
    create_analytics_events,
    recent_analytics_events,
)

router = APIRouter(tags=["analytics"])


@router.post(
    "/analytics/events",
    response_model=AnalyticsCollectResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("120/minute")
def collect_analytics_events(
    request: Request,
    payload: AnalyticsEventsCreate,
    user: Annotated[User | None, Depends(get_optional_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AnalyticsCollectResponse:
    events = payload.events or []
    create_analytics_events(db, events, user.id if user else None)
    db.commit()
    return AnalyticsCollectResponse(accepted=len(events))


@router.get("/admin/activity/summary", response_model=AnalyticsSummary)
@router.get("/admin/analytics/summary", response_model=AnalyticsSummary)
def get_admin_analytics_summary(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    days: int = Query(default=7, ge=1, le=30),
) -> dict:
    return analytics_summary(db, days)


@router.get("/admin/activity/events", response_model=list[AnalyticsEventRead])
@router.get("/admin/analytics/events", response_model=list[AnalyticsEventRead])
def get_admin_analytics_events(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    days: int = Query(default=7, ge=1, le=30),
    event_name: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=100, ge=1, le=200),
) -> list[AnalyticsEventRead]:
    return [
        analytics_event_read(event)
        for event in recent_analytics_events(db, days=days, event_name=event_name, limit=limit)
    ]


@router.post("/admin/analytics/cleanup", response_model=AnalyticsCleanupResponse)
def cleanup_admin_analytics_events(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> AnalyticsCleanupResponse:
    deleted = cleanup_old_analytics_events(db)
    db.commit()
    return AnalyticsCleanupResponse(deleted=deleted)
