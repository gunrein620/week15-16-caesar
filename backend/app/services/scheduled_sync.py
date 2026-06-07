import asyncio
from datetime import UTC, datetime, timedelta
import logging

from fastapi import FastAPI
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_session_factory
from app.services.app_settings import (
    SYNC_LAST_CHANNEL_KEY,
    SYNC_LAST_KEYWORD_KEY,
    SYNC_LAST_NAVER_KEY,
    get_sync_settings,
    set_sync_last_run,
)
from app.services.external_updates import sync_external_updates
from app.services.infra_budget import infra_hard_stop_active
from app.services.youtube import sync_artist_videos

logger = logging.getLogger(__name__)

CHANNEL_SOURCE_TYPES = {"official_channel", "member_channel", "fan_channel", "curated_video"}
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
    if _due(settings["last_channel_sync_at"], int(settings["channel_interval_minutes"]), now):
        try:
            sync_artist_videos(db, artist_id, source_types=CHANNEL_SOURCE_TYPES)
            ran.append("channel")
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
        _mark(db, SYNC_LAST_CHANNEL_KEY, now)

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


async def _scheduled_sync_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            with get_session_factory()() as db:
                if not infra_hard_stop_active(db):
                    result = run_due_syncs_once(db)
                    if result["ran"]:
                        logger.info("scheduled sync ran: %s", ",".join(result["ran"]))
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
