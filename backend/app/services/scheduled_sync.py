import asyncio
from datetime import UTC, datetime, timedelta
import logging

from fastapi import FastAPI
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_session_factory
from app.services.app_settings import (
    SYNC_LAST_CURATED_KEY,
    SYNC_LAST_FAN_KEY,
    SYNC_LAST_KEYWORD_KEY,
    SYNC_LAST_MEMBER_KEY,
    SYNC_LAST_NAVER_KEY,
    SYNC_LAST_OFFICIAL_KEY,
    get_sync_settings,
    set_sync_last_run,
)
from app.services.external_updates import sync_external_updates
from app.services.infra_budget import infra_hard_stop_active
from app.services.product_workflows import (
    build_data_quality_tasks,
    create_auto_briefing_draft,
    generate_subscription_notifications,
)
from app.services.youtube import sync_artist_videos

logger = logging.getLogger(__name__)

SOURCE_SYNC_JOBS = [
    ("official", "official_interval_minutes", "last_official_sync_at", SYNC_LAST_OFFICIAL_KEY, {"official_channel"}),
    ("member", "member_interval_minutes", "last_member_sync_at", SYNC_LAST_MEMBER_KEY, {"member_channel"}),
    ("fan", "fan_interval_minutes", "last_fan_sync_at", SYNC_LAST_FAN_KEY, {"fan_channel"}),
    ("curated", "curated_interval_minutes", "last_curated_sync_at", SYNC_LAST_CURATED_KEY, {"curated_video"}),
]
KEYWORD_SOURCE_TYPES = {"keyword_search"}
SCHEDULER_POLL_SECONDS = 60


def _parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _due(last_run: object, interval_minutes: int, now: datetime) -> bool:
    last = _parse_timestamp(last_run)
    if last is None:
        return True
    return now - last >= timedelta(minutes=interval_minutes)


def _mark(db: Session, key: str, now: datetime) -> None:
    set_sync_last_run(db, key, now.isoformat())
    db.commit()


def run_due_syncs_once(db: Session, artist_id: int = 1, now: datetime | None = None) -> dict[str, list[str]]:
    now = now or datetime.now(UTC)
    settings = get_sync_settings(db)
    if not settings["enabled"]:
        return {"ran": []}

    ran: list[str] = []
    for job_name, interval_key, last_value_key, last_setting_key, source_types in SOURCE_SYNC_JOBS:
        try:
            if _due(settings[last_value_key], int(settings[interval_key]), now):
                sync_artist_videos(db, artist_id, source_types=source_types)
                ran.append(job_name)
                _mark(db, last_setting_key, now)
        except HTTPException as exc:
            if exc.status_code != 409:
                raise

    if _due(settings["last_naver_sync_at"], int(settings["naver_interval_minutes"]), now):
        sync_external_updates(db, artist_id)
        ran.append("naver")
        _mark(db, SYNC_LAST_NAVER_KEY, now)

    if _due(settings["last_keyword_sync_at"], int(settings["keyword_interval_minutes"]), now):
        try:
            sync_artist_videos(db, artist_id, source_types=KEYWORD_SOURCE_TYPES)
            ran.append("keyword")
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
        _mark(db, SYNC_LAST_KEYWORD_KEY, now)

    return {"ran": ran}


def run_due_workflows_once(
    db: Session,
    artist_id: int = 1,
    now: datetime | None = None,
) -> dict[str, list[str]]:
    now = now or datetime.now(UTC)
    ran: list[str] = []
    notifications = generate_subscription_notifications(db, artist_id=artist_id, now=now)
    if notifications["created"]:
        ran.append("notifications")

    quality = build_data_quality_tasks(db, artist_id=artist_id)
    if quality["created"]:
        ran.append("data_quality")

    try:
        _, created = create_auto_briefing_draft(db, artist_id=artist_id, now=now)
    except RuntimeError:
        created = False
    if created:
        ran.append("auto_briefing")
    db.commit()
    return {"ran": ran}


async def _scheduled_sync_loop(stop_event: asyncio.Event) -> None:
    await asyncio.sleep(1)
    while not stop_event.is_set():
        try:
            with get_session_factory()() as db:
                if not infra_hard_stop_active(db):
                    result = run_due_syncs_once(db)
                    workflow_result = run_due_workflows_once(db)
                    if result["ran"]:
                        logger.info("scheduled sync ran: %s", ",".join(result["ran"]))
                    if workflow_result["ran"]:
                        logger.info(
                            "scheduled workflows ran: %s",
                            ",".join(workflow_result["ran"]),
                        )
        except Exception:
            logger.exception("scheduled sync failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=SCHEDULER_POLL_SECONDS)
        except TimeoutError:
            continue


def install_scheduled_sync(app: FastAPI) -> None:
    if get_settings().environment != "production":
        return

    @app.on_event("startup")
    async def start_scheduled_sync() -> None:
        stop_event = asyncio.Event()
        app.state.scheduled_sync_stop_event = stop_event
        app.state.scheduled_sync_task = asyncio.create_task(_scheduled_sync_loop(stop_event))

    @app.on_event("shutdown")
    async def stop_scheduled_sync() -> None:
        stop_event = getattr(app.state, "scheduled_sync_stop_event", None)
        task = getattr(app.state, "scheduled_sync_task", None)
        if stop_event is not None:
            stop_event.set()
        if task is not None:
            await task
