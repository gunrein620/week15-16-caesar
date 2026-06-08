from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import AiUsageCounter, AnalyticsEvent, Comment, Post, SavedItem
from app.schemas import AnalyticsEventCreate, AnalyticsEventRead

SENSITIVE_METADATA_KEYS = {
    "email",
    "token",
    "access_token",
    "authorization",
    "password",
    "api_key",
    "secret",
    "result_body",
}
ALLOWED_METADATA_KEYS = {
    "query",
    "item_type",
    "item_key",
    "title",
    "source_label",
    "panel",
    "source",
    "filter",
    "member",
    "keyword",
    "limit",
    "offset",
    "post_id",
    "video_id",
}


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def analytics_cutoff(days: int) -> datetime:
    return _now() - timedelta(days=days)


def sanitize_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, value in metadata.items():
        normalized_key = str(key).lower()
        if normalized_key in SENSITIVE_METADATA_KEYS or normalized_key not in ALLOWED_METADATA_KEYS:
            continue
        if value is None:
            continue
        if isinstance(value, str):
            max_length = 120 if normalized_key == "query" else 180
            clean[normalized_key] = value.strip()[:max_length]
        elif isinstance(value, bool | int | float):
            clean[normalized_key] = value
    return clean


def create_analytics_events(
    db: Session,
    events: list[AnalyticsEventCreate],
    user_id: int | None,
) -> list[AnalyticsEvent]:
    rows = [
        AnalyticsEvent(
            event_name=event.event_name,
            anonymous_session_id=event.anonymous_session_id,
            user_id=user_id,
            path=event.path,
            panel=event.panel,
            source=event.source,
            metadata_json=sanitize_metadata(event.metadata),
        )
        for event in events
    ]
    db.add_all(rows)
    return rows


def analytics_event_read(event: AnalyticsEvent) -> AnalyticsEventRead:
    return AnalyticsEventRead(
        id=event.id,
        event_name=event.event_name,
        anonymous_session_id=event.anonymous_session_id,
        user_id=event.user_id,
        path=event.path,
        panel=event.panel,
        source=event.source,
        metadata=event.metadata_json,
        created_at=event.created_at,
    )


def analytics_summary(db: Session, days: int) -> dict[str, Any]:
    cutoff = analytics_cutoff(days)
    today_cutoff = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    events = list(
        db.scalars(
            select(AnalyticsEvent)
            .where(AnalyticsEvent.created_at >= cutoff)
            .order_by(AnalyticsEvent.created_at.desc())
        ).all()
    )
    visitor_ids = {event.anonymous_session_id for event in events}
    today_visitor_ids = {
        event.anonymous_session_id for event in events if _aware(event.created_at) >= today_cutoff
    }
    logged_in_user_ids = {event.user_id for event in events if event.user_id is not None}
    panel_counts = Counter(event.panel for event in events if event.panel)
    path_counts = Counter(event.path for event in events if event.path)
    query_counts = Counter(
        str(event.metadata_json.get("query", "")).strip()
        for event in events
        if event.event_name == "archive_search_submit" and event.metadata_json.get("query")
    )
    card_counts: Counter[tuple[str, str, str]] = Counter()
    for event in events:
        if event.event_name != "feed_card_open":
            continue
        metadata = event.metadata_json
        title = str(metadata.get("title", "")).strip()
        if not title:
            continue
        card_counts[
            (
                title,
                str(metadata.get("item_type", "")).strip(),
                str(metadata.get("item_key", "")).strip(),
            )
        ] += 1

    ai_questions = int(
        db.scalar(
            select(func.coalesce(func.sum(AiUsageCounter.count), 0)).where(
                AiUsageCounter.feature == "qa",
                AiUsageCounter.day >= cutoff.date(),
            )
        )
        or 0
    )

    return {
        "days": days,
        "visitors": len(visitor_ids),
        "today_visitors": len(today_visitor_ids),
        "logged_in_users": len(logged_in_user_ids),
        "events": len(events),
        "searches": sum(1 for event in events if event.event_name == "archive_search_submit"),
        "saves": int(
            db.scalar(select(func.count()).select_from(SavedItem).where(SavedItem.saved_at >= cutoff))
            or 0
        ),
        "posts": int(
            db.scalar(select(func.count()).select_from(Post).where(Post.created_at >= cutoff)) or 0
        ),
        "comments": int(
            db.scalar(select(func.count()).select_from(Comment).where(Comment.created_at >= cutoff))
            or 0
        ),
        "ai_questions": ai_questions,
        "popular_panels": [
            {"label": label, "count": count} for label, count in panel_counts.most_common(10)
        ],
        "popular_paths": [
            {"label": label, "count": count} for label, count in path_counts.most_common(10)
        ],
        "popular_queries": [
            {"query": query, "count": count} for query, count in query_counts.most_common(10)
        ],
        "popular_cards": [
            {"title": title, "item_type": item_type, "item_key": item_key, "count": count}
            for (title, item_type, item_key), count in card_counts.most_common(10)
        ],
    }


def recent_analytics_events(
    db: Session,
    days: int,
    event_name: str | None = None,
    limit: int = 100,
) -> list[AnalyticsEvent]:
    statement = select(AnalyticsEvent).where(AnalyticsEvent.created_at >= analytics_cutoff(days))
    if event_name:
        statement = statement.where(AnalyticsEvent.event_name == event_name)
    return list(db.scalars(statement.order_by(AnalyticsEvent.created_at.desc()).limit(limit)).all())


def cleanup_old_analytics_events(db: Session, retention_days: int = 90) -> int:
    result = db.execute(delete(AnalyticsEvent).where(AnalyticsEvent.created_at < analytics_cutoff(retention_days)))
    return int(result.rowcount or 0)
