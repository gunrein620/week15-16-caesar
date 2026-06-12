from __future__ import annotations

from datetime import UTC, datetime, timedelta
import re
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import RagChunk, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.rag import embed_texts
from app.services.text import content_hash

WINDOW_MAX_CHARS = 450
WINDOW_MAX_SECONDS = 75
MAX_WINDOWS_PER_VIDEO = 40
UNAVAILABLE_EXCEPTION_NAMES = {
    "TranscriptsDisabled",
    "NoTranscriptFound",
    "VideoUnavailable",
    "NoTranscriptAvailable",
}


def _normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _segment_value(segment: Any, key: str, default: Any = None) -> Any:
    if isinstance(segment, dict):
        return segment.get(key, default)
    return getattr(segment, key, default)


def _segment_text(segment: Any) -> str:
    return _normalize_space(str(_segment_value(segment, "text", "") or ""))


def _segment_start(segment: Any) -> float:
    try:
        return float(_segment_value(segment, "start", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def _segment_duration(segment: Any) -> float:
    try:
        return float(_segment_value(segment, "duration", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def _lang_matches(language_code: str, target: str) -> bool:
    code = language_code.lower().replace("_", "-")
    return code == target or code.startswith(f"{target}-")


def _to_raw_segments(fetched: Any) -> list[Any]:
    if hasattr(fetched, "to_raw_data"):
        return list(fetched.to_raw_data())
    return list(fetched or [])


def _normalize_segments(segments: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for segment in segments:
        text = _segment_text(segment)
        if not text:
            continue
        normalized.append(
            {
                "text": text,
                "start": _segment_start(segment),
                "duration": _segment_duration(segment),
            }
        )
    return normalized


def _exception_name(exc: Exception) -> str:
    return exc.__class__.__name__


def _is_unavailable_exception(exc: Exception) -> bool:
    return _exception_name(exc) in UNAVAILABLE_EXCEPTION_NAMES


def fetch_video_transcript(video_id: str) -> tuple[str, str, list]:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi

        transcript_list = YouTubeTranscriptApi().list(video_id)
        transcripts = list(transcript_list)
        for target_lang, generated in [
            ("ko", False),
            ("ko", True),
            ("en", False),
            ("en", True),
        ]:
            for transcript in transcripts:
                language_code = str(getattr(transcript, "language_code", "") or "")
                is_generated = bool(getattr(transcript, "is_generated", False))
                if is_generated != generated or not _lang_matches(language_code, target_lang):
                    continue
                fetched = transcript.fetch()
                return "fetched", language_code, _normalize_segments(_to_raw_segments(fetched))
        return "unavailable", "", []
    except Exception as exc:
        if _is_unavailable_exception(exc):
            return "unavailable", "", []
        return "failed", "", []


def build_transcript_windows(segments) -> list[tuple[int, str]]:
    windows: list[tuple[int, str]] = []
    current_parts: list[str] = []
    current_start: float | None = None
    current_end: float = 0.0

    def flush() -> None:
        nonlocal current_parts, current_start, current_end
        if current_start is not None and current_parts:
            text = _normalize_space(" ".join(current_parts))
            if text:
                windows.append((max(0, int(current_start)), text))
        current_parts = []
        current_start = None
        current_end = 0.0

    for segment in segments:
        text = _segment_text(segment)
        if not text:
            continue
        start = _segment_start(segment)
        end = start + max(_segment_duration(segment), 0.0)
        if current_start is None:
            current_start = start
        next_length = len(" ".join([*current_parts, text])) if current_parts else len(text)
        next_duration = max(current_end, end) - current_start
        if current_parts and (next_length > WINDOW_MAX_CHARS or next_duration > WINDOW_MAX_SECONDS):
            flush()
            current_start = start
        current_parts.append(text)
        current_end = max(current_end, end)
        if len(windows) >= MAX_WINDOWS_PER_VIDEO:
            break

    if len(windows) < MAX_WINDOWS_PER_VIDEO:
        flush()
    return windows[:MAX_WINDOWS_PER_VIDEO]


def _timestamp_label(seconds: int) -> str:
    seconds = max(0, seconds)
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"[{hours}:{minutes:02d}:{secs:02d}]"
    return f"[{minutes}:{secs:02d}]"


def replace_video_transcript_chunks(
    db: Session,
    video: YoutubeVideo,
    artist_id: int,
    segments: list,
) -> int:
    db.flush()
    db.execute(
        delete(RagChunk).where(
            RagChunk.youtube_video_id == video.id,
            RagChunk.chunk_index >= 1,
        )
    )
    windows = build_transcript_windows(segments)
    if not windows:
        db.flush()
        return 0
    transcript_text = _normalize_space(" ".join(_segment_text(segment) for segment in segments))
    hashed = content_hash(transcript_text)
    contents = [f"{_timestamp_label(start)} {text}" for start, text in windows]
    embeddings = embed_texts(contents)
    db.add_all(
        [
            RagChunk(
                artist_id=artist_id,
                youtube_video_id=video.id,
                chunk_index=index,
                content=content,
                content_hash=hashed,
                embedding=embedding,
            )
            for index, (content, embedding) in enumerate(
                zip(contents, embeddings, strict=True),
                start=1,
            )
        ]
    )
    db.flush()
    return len(contents)


def refresh_video_transcript_chunks(db: Session, video: YoutubeVideo, artist_id: int) -> int:
    status, _, segments = fetch_video_transcript(video.id)
    if status != "fetched":
        return 0
    return replace_video_transcript_chunks(db, video, artist_id, segments)


def _artist_id_for_video(db: Session, video_id: str) -> int:
    artist_id = db.scalar(
        select(YoutubeSource.artist_id)
        .join(YoutubeVideoSource, YoutubeVideoSource.source_id == YoutubeSource.id)
        .where(YoutubeVideoSource.video_id == video_id)
        .order_by(YoutubeSource.artist_id.asc())
        .limit(1)
    )
    if artist_id is not None:
        return int(artist_id)
    chunk_artist_id = db.scalar(
        select(RagChunk.artist_id)
        .where(RagChunk.youtube_video_id == video_id)
        .order_by(RagChunk.chunk_index.asc(), RagChunk.id.asc())
        .limit(1)
    )
    return int(chunk_artist_id or 1)


def upload_video_transcript(
    db: Session,
    *,
    video_id: str,
    lang: str,
    segments: list[dict[str, Any]],
    mark_unavailable: bool,
) -> dict[str, int | str] | None:
    video = db.get(YoutubeVideo, video_id)
    if video is None:
        return None
    if mark_unavailable or not segments:
        video.transcript_status = "unavailable"
        video.transcript_fetched_at = datetime.now(UTC)
        db.flush()
        return {"video_id": video.id, "created_chunks": 0, "status": "unavailable"}

    artist_id = _artist_id_for_video(db, video.id)
    created_chunks = replace_video_transcript_chunks(db, video, artist_id, segments)
    video.transcript_status = "fetched"
    video.transcript_lang = lang.strip()
    video.transcript_fetched_at = datetime.now(UTC)
    db.flush()
    return {"video_id": video.id, "created_chunks": created_chunks, "status": "fetched"}


def _candidate_statement(
    artist_id: int,
    *,
    days: int | None,
    force: bool,
):
    statement = (
        select(YoutubeVideo)
        .join(YoutubeVideoSource, YoutubeVideoSource.video_id == YoutubeVideo.id)
        .join(YoutubeSource, YoutubeSource.id == YoutubeVideoSource.source_id)
        .where(YoutubeSource.artist_id == artist_id)
        .order_by(YoutubeVideo.published_at.desc().nullslast(), YoutubeVideo.id.asc())
    )
    if not force:
        statement = statement.where(YoutubeVideo.transcript_status == "pending")
    if days is not None:
        statement = statement.where(YoutubeVideo.published_at >= datetime.now(UTC) - timedelta(days=days))
    return statement


def list_pending_transcript_videos(
    db: Session,
    artist_id: int,
    *,
    limit: int,
    days: int | None = None,
    include_failed: bool = False,
) -> list[YoutubeVideo]:
    statuses = ["pending", "failed"] if include_failed else ["pending"]
    statement = (
        select(YoutubeVideo)
        .join(YoutubeVideoSource, YoutubeVideoSource.video_id == YoutubeVideo.id)
        .join(YoutubeSource, YoutubeSource.id == YoutubeVideoSource.source_id)
        .where(
            YoutubeSource.artist_id == artist_id,
            YoutubeVideo.transcript_status.in_(statuses),
        )
        .order_by(YoutubeVideo.published_at.desc().nullslast(), YoutubeVideo.id.asc())
        .limit(limit)
    )
    if days is not None:
        statement = statement.where(YoutubeVideo.published_at >= datetime.now(UTC) - timedelta(days=days))
    return list(db.scalars(statement).unique().all())


def fetch_transcripts_batch(
    db: Session,
    artist_id: int,
    *,
    limit: int = 25,
    days: int | None = None,
    force: bool = False,
) -> dict:
    videos = (
        db.scalars(_candidate_statement(artist_id, days=days, force=force).limit(limit))
        .unique()
        .all()
    )
    stats = {
        "processed": 0,
        "fetched": 0,
        "unavailable": 0,
        "failed": 0,
        "created_chunks": 0,
    }
    for video in videos:
        stats["processed"] += 1
        try:
            status, lang, segments = fetch_video_transcript(video.id)
            if status == "fetched":
                stats["created_chunks"] += replace_video_transcript_chunks(
                    db,
                    video,
                    artist_id,
                    segments,
                )
            elif status not in {"unavailable", "failed"}:
                status = "failed"
            video.transcript_status = status
            video.transcript_lang = lang if status == "fetched" else ""
            video.transcript_fetched_at = datetime.now(UTC)
            stats[status] += 1
            db.flush()
        except Exception:
            video.transcript_status = "failed"
            video.transcript_lang = ""
            video.transcript_fetched_at = datetime.now(UTC)
            stats["failed"] += 1
            try:
                db.flush()
            except Exception:
                db.rollback()
    return stats
