from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import utc_now
from app.models import (
    AgentRun,
    Collection,
    CollectionItem,
    DataQualityTask,
    RagChunk,
    SearchItem,
    User,
    UserNotification,
    UserSubscription,
)
from app.services.catalog_search import SearchFilters, search_catalog, search_item_to_source_payload
from app.services.rag import (
    refresh_external_update_chunks,
    refresh_post_chunks,
    refresh_video_chunks,
)
from app.services.search_index import (
    ensure_search_index_for_artist,
    upsert_external_update_search_item,
    upsert_post_search_item,
    upsert_youtube_video_search_item,
)


LOCAL_DATA_QUALITY_TASKS = {"embedding_missing", "source_missing"}


def _str_list(value: list[Any] | None) -> tuple[str, ...]:
    if not value:
        return ()
    cleaned: list[str] = []
    for item in value:
        text = str(item).strip()
        if text:
            cleaned.append(text)
    return tuple(dict.fromkeys(cleaned))


def _int_list(value: list[Any] | None) -> tuple[int, ...]:
    if not value:
        return ()
    cleaned: list[int] = []
    for item in value:
        try:
            cleaned.append(int(item))
        except (TypeError, ValueError):
            continue
    return tuple(dict.fromkeys(cleaned))


def _search_filters_from_subscription(subscription: UserSubscription) -> SearchFilters:
    return SearchFilters(
        artist_id=subscription.artist_id,
        content_types=_str_list(subscription.content_types),
        source_types=_str_list(subscription.source_types),
        member_names=_str_list(subscription.member_names),
        archive_term_ids=_int_list(subscription.archive_term_ids),
        published_after=subscription.last_checked_at,
        sort="latest",
        limit=50,
    )


def generate_subscription_notifications(
    db: Session,
    *,
    artist_id: int | None = None,
    now: datetime | None = None,
) -> dict[str, int]:
    checked_at = now or utc_now()
    stmt = (
        select(UserSubscription)
        .where(UserSubscription.enabled.is_(True))
        .order_by(UserSubscription.id.asc())
    )
    if artist_id is not None:
        stmt = stmt.where(UserSubscription.artist_id == artist_id)

    created = 0
    checked = 0
    for subscription in db.scalars(stmt).all():
        checked += 1
        ensure_search_index_for_artist(db, subscription.artist_id)
        result = search_catalog(db, _search_filters_from_subscription(subscription))
        for source in result.sources:
            search_item_id = source.get("search_item_id")
            if not isinstance(search_item_id, int):
                continue
            existing = db.scalar(
                select(UserNotification.id).where(
                    UserNotification.user_id == subscription.user_id,
                    UserNotification.subscription_id == subscription.id,
                    UserNotification.search_item_id == search_item_id,
                    UserNotification.notification_type == "subscription_match",
                )
            )
            if existing is not None:
                continue
            notification = UserNotification(
                user_id=subscription.user_id,
                artist_id=subscription.artist_id,
                subscription_id=subscription.id,
                search_item_id=search_item_id,
                notification_type="subscription_match",
                title=str(source.get("title") or "새 검색 결과"),
                body=str(source.get("description") or source.get("content") or "")[:500],
                url=str(source.get("url") or ""),
                thumbnail_url=str(source.get("thumbnail_url") or ""),
            )
            db.add(notification)
            created += 1
        subscription.last_checked_at = checked_at
    db.flush()
    return {"checked": checked, "created": created}


def collection_summary_text(collection: Collection) -> str:
    items = sorted(collection.items, key=lambda item: (item.position, item.id))
    if not items:
        return f"{collection.title}: 아직 담긴 자료가 없습니다."
    titles = [item.title for item in items[:8]]
    title_text = ", ".join(titles)
    return f"{collection.title} 컬렉션 요약: {title_text}"


def add_collection_item(
    db: Session,
    *,
    collection: Collection,
    search_item: SearchItem,
    note: str = "",
) -> tuple[CollectionItem, bool]:
    existing = db.scalar(
        select(CollectionItem).where(
            CollectionItem.collection_id == collection.id,
            CollectionItem.search_item_id == search_item.id,
        )
    )
    if existing is not None:
        return existing, False

    max_position = db.scalar(
        select(func.max(CollectionItem.position)).where(
            CollectionItem.collection_id == collection.id
        )
    )
    payload = search_item_to_source_payload(search_item)
    item = CollectionItem(
        collection_id=collection.id,
        search_item_id=search_item.id,
        title=search_item.title,
        url=search_item.url,
        thumbnail_url=search_item.thumbnail_url,
        source_type=str(payload.get("source_type") or search_item.item_type),
        position=int(max_position or 0) + 1,
        note=note.strip(),
    )
    db.add(item)
    db.flush()
    return item, True


def _task_priority(task_type: str) -> int:
    return {
        "embedding_missing": 100,
        "source_missing": 90,
        "transcript_pending": 70,
        "thumbnail_pending": 60,
    }.get(task_type, 0)


def _create_task_if_needed(db: Session, item: SearchItem, task_type: str) -> bool:
    existing = db.scalar(
        select(DataQualityTask).where(
            DataQualityTask.search_item_id == item.id,
            DataQualityTask.task_type == task_type,
        )
    )
    if existing is not None:
        if existing.status in {"resolved", "skipped", "failed"}:
            existing.status = "pending"
            existing.error_message = ""
            existing.resolved_at = None
        return False
    db.add(
        DataQualityTask(
            artist_id=item.artist_id,
            search_item_id=item.id,
            task_type=task_type,
            status="pending",
            priority=_task_priority(task_type),
        )
    )
    return True


def build_data_quality_tasks(db: Session, *, artist_id: int) -> dict[str, int]:
    ensure_search_index_for_artist(db, artist_id)
    items = db.scalars(
        select(SearchItem)
        .where(SearchItem.artist_id == artist_id)
        .options(
            selectinload(SearchItem.sources),
            selectinload(SearchItem.rag_chunks),
            selectinload(SearchItem.youtube_video),
        )
    ).all()
    created = 0
    for item in items:
        if not item.rag_chunks:
            created += int(_create_task_if_needed(db, item, "embedding_missing"))
        if not item.sources:
            created += int(_create_task_if_needed(db, item, "source_missing"))
        if item.item_type == "youtube" and item.youtube_video is not None:
            if item.youtube_video.transcript_status == "pending":
                created += int(_create_task_if_needed(db, item, "transcript_pending"))
            if item.youtube_video.thumbnail_analysis_status == "pending":
                created += int(_create_task_if_needed(db, item, "thumbnail_pending"))
    db.flush()
    pending = int(
        db.scalar(
            select(func.count())
            .select_from(DataQualityTask)
            .where(DataQualityTask.artist_id == artist_id, DataQualityTask.status == "pending")
        )
        or 0
    )
    return {"created": created, "pending": pending}


def _refresh_search_item_sources(db: Session, item: SearchItem) -> None:
    if item.youtube_video is not None:
        upsert_youtube_video_search_item(db, item.youtube_video, artist_id=item.artist_id)
    elif item.post is not None:
        upsert_post_search_item(db, item.post)
    elif item.external_update is not None:
        upsert_external_update_search_item(db, item.external_update)


def run_data_quality_task(db: Session, task: DataQualityTask) -> DataQualityTask:
    task.status = "running"
    task.error_message = ""
    db.flush()
    item = task.search_item
    try:
        if task.task_type == "embedding_missing":
            if item.youtube_video is not None:
                refresh_video_chunks(db, item.youtube_video, artist_id=item.artist_id)
            elif item.post is not None:
                refresh_post_chunks(db, item.post)
            elif item.external_update is not None:
                refresh_external_update_chunks(db, item.external_update)
            has_chunks = db.scalar(
                select(RagChunk.id).where(RagChunk.search_item_id == item.id).limit(1)
            )
            if has_chunks is None:
                raise RuntimeError("No RAG chunk was created")
            task.status = "resolved"
            task.resolved_at = utc_now()
        elif task.task_type == "source_missing":
            _refresh_search_item_sources(db, item)
            db.refresh(item)
            if not item.sources:
                raise RuntimeError("No source facet was created")
            task.status = "resolved"
            task.resolved_at = utc_now()
        else:
            task.status = "skipped"
            task.error_message = "This task requires an external sync job."
            task.resolved_at = utc_now()
    except Exception as exc:
        task.status = "failed"
        task.error_message = str(exc)[:1000]
    db.flush()
    return task


def create_auto_briefing_draft(
    db: Session,
    *,
    artist_id: int,
    now: datetime | None = None,
    briefing_type: str = "daily",
) -> tuple[AgentRun, bool]:
    briefing_date = (now or utc_now()).date()
    existing = db.scalar(
        select(AgentRun)
        .where(
            AgentRun.artist_id == artist_id,
            AgentRun.briefing_type == briefing_type,
            AgentRun.briefing_date == briefing_date,
            AgentRun.status == "auto_draft",
        )
        .order_by(AgentRun.id.desc())
    )
    if existing is not None:
        return existing, False

    admin = db.scalar(select(User).where(User.role == "admin").order_by(User.id.asc()))
    if admin is None:
        raise RuntimeError("Admin user is required for auto briefing drafts")

    run = AgentRun(
        artist_id=artist_id,
        user_id=admin.id,
        status="auto_draft",
        briefing_type=briefing_type,
        briefing_date=briefing_date,
        preview_markdown="",
    )
    db.add(run)
    db.flush()
    try:
        from app.api.agent import _briefing_markdown

        run.preview_markdown = _briefing_markdown(db, artist_id, False, run.id)
    except Exception as exc:
        run.preview_markdown = (
            f"# {briefing_date.isoformat()} 자동 브리핑 초안\n\n"
            f"자동 브리핑 초안 생성 중 일부 단계가 실패했습니다: {str(exc)[:300]}"
        )
    db.flush()
    return run, True
