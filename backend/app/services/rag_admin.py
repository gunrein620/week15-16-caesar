from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import RagChunk, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.rag import build_video_embedding_text, refresh_video_chunks, video_embedding_hash

STANDARD_EMBEDDING_USD_PER_1M = 0.02
BATCH_EMBEDDING_USD_PER_1M = 0.01


def _approx_tokens(text: str) -> int:
    return max(1, (len(text) + 1) // 2)


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _youtube_video_statement(
    artist_id: int,
    *,
    days: int | None = None,
    source_type: str | None = None,
):
    statement = (
        select(YoutubeVideo)
        .join(YoutubeVideoSource, YoutubeVideoSource.video_id == YoutubeVideo.id)
        .join(YoutubeSource, YoutubeSource.id == YoutubeVideoSource.source_id)
        .where(YoutubeSource.artist_id == artist_id)
        .order_by(YoutubeVideo.published_at.desc().nullslast(), YoutubeVideo.id.asc())
    )
    if source_type:
        statement = statement.where(YoutubeSource.source_type == source_type)
    if days is not None:
        statement = statement.where(YoutubeVideo.published_at >= datetime.now(UTC) - timedelta(days=days))
    return statement


def _artist_youtube_videos(
    db: Session,
    artist_id: int,
    *,
    days: int | None = None,
    source_type: str | None = None,
) -> list[YoutubeVideo]:
    videos = db.scalars(
        _youtube_video_statement(artist_id, days=days, source_type=source_type)
    ).unique().all()
    return list(videos)


def _chunks_for_videos(db: Session, video_ids: list[str]) -> dict[str, list[RagChunk]]:
    if not video_ids:
        return {}
    chunks = db.scalars(
        select(RagChunk)
        .where(RagChunk.youtube_video_id.in_(video_ids))
        .order_by(RagChunk.youtube_video_id.asc(), RagChunk.chunk_index.asc(), RagChunk.id.asc())
    ).all()
    grouped: dict[str, list[RagChunk]] = defaultdict(list)
    for chunk in chunks:
        if chunk.youtube_video_id:
            grouped[chunk.youtube_video_id].append(chunk)
    return grouped


def _chunks_are_stale(
    db: Session,
    video: YoutubeVideo,
    artist_id: int,
    chunks: list[RagChunk],
) -> bool:
    if not chunks:
        return False
    expected_hash = video_embedding_hash(db, video, artist_id)
    return len(chunks) != 1 or chunks[0].chunk_index != 0 or chunks[0].content_hash != expected_hash


def _embedding_candidates(
    db: Session,
    artist_id: int,
    *,
    days: int | None = None,
    source_type: str | None = None,
    force: bool = False,
) -> tuple[list[YoutubeVideo], dict[str, list[RagChunk]]]:
    videos = _artist_youtube_videos(db, artist_id, days=days, source_type=source_type)
    chunks_by_video = _chunks_for_videos(db, [video.id for video in videos])
    candidates: list[YoutubeVideo] = []
    for video in videos:
        chunks = chunks_by_video.get(video.id, [])
        if force or not chunks or _chunks_are_stale(db, video, artist_id, chunks):
            candidates.append(video)
    return candidates, chunks_by_video


def get_rag_coverage(db: Session, artist_id: int) -> dict:
    videos = _artist_youtube_videos(db, artist_id)
    video_ids = [video.id for video in videos]
    chunks_by_video = _chunks_for_videos(db, video_ids)
    embedded = sum(1 for video in videos if chunks_by_video.get(video.id))
    stale = sum(
        1
        for video in videos
        if _chunks_are_stale(db, video, artist_id, chunks_by_video.get(video.id, []))
    )
    missing = len(videos) - embedded
    candidates = [
        video
        for video in videos
        if not chunks_by_video.get(video.id)
        or _chunks_are_stale(db, video, artist_id, chunks_by_video.get(video.id, []))
    ]
    estimated_tokens = sum(_approx_tokens(build_video_embedding_text(db, video, artist_id)) for video in candidates)
    recent_cutoff = datetime.now(UTC) - timedelta(days=90)
    recent = [
        video
        for video in videos
        if video.published_at and _aware_utc(video.published_at) >= recent_cutoff
    ]
    recent_missing = sum(1 for video in recent if not chunks_by_video.get(video.id))
    post_chunks = db.scalar(
        select(func.count())
        .select_from(RagChunk)
        .where(RagChunk.artist_id == artist_id, RagChunk.post_id.is_not(None))
    )
    youtube_chunks = db.scalar(
        select(func.count())
        .select_from(RagChunk)
        .where(RagChunk.artist_id == artist_id, RagChunk.youtube_video_id.is_not(None))
    )
    return {
        "artist_id": artist_id,
        "youtube_videos": len(videos),
        "youtube_embedded_videos": embedded,
        "youtube_missing_videos": missing,
        "youtube_stale_videos": stale,
        "post_chunks": int(post_chunks or 0),
        "youtube_chunks": int(youtube_chunks or 0),
        "estimated_tokens": estimated_tokens,
        "estimated_standard_cost_usd": round(
            estimated_tokens / 1_000_000 * STANDARD_EMBEDDING_USD_PER_1M,
            6,
        ),
        "estimated_batch_cost_usd": round(
            estimated_tokens / 1_000_000 * BATCH_EMBEDDING_USD_PER_1M,
            6,
        ),
        "recent_90d_youtube_videos": len(recent),
        "recent_90d_missing_videos": recent_missing,
    }


def cleanup_rag_chunks(db: Session, artist_id: int) -> dict[str, int]:
    all_youtube_ids = set(db.scalars(select(YoutubeVideo.id)).all())
    youtube_chunks = db.scalars(
        select(RagChunk).where(RagChunk.artist_id == artist_id, RagChunk.youtube_video_id.is_not(None))
    ).all()
    orphan_ids = [
        chunk.id
        for chunk in youtube_chunks
        if chunk.youtube_video_id and chunk.youtube_video_id not in all_youtube_ids
    ]
    if orphan_ids:
        db.execute(delete(RagChunk).where(RagChunk.id.in_(orphan_ids)))

    videos = _artist_youtube_videos(db, artist_id)
    chunks_by_video = _chunks_for_videos(db, [video.id for video in videos])
    stale_video_ids = [
        video.id
        for video in videos
        if _chunks_are_stale(db, video, artist_id, chunks_by_video.get(video.id, []))
    ]
    stale_deleted = 0
    if stale_video_ids:
        stale_deleted = int(
            db.query(RagChunk)
            .filter(RagChunk.youtube_video_id.in_(stale_video_ids))
            .delete(synchronize_session=False)
        )

    duplicate_ids: list[int] = []
    if stale_video_ids:
        chunks_by_video = {
            video_id: chunks
            for video_id, chunks in chunks_by_video.items()
            if video_id not in set(stale_video_ids)
        }
    for chunks in chunks_by_video.values():
        if len(chunks) <= 1:
            continue
        keep = next((chunk for chunk in chunks if chunk.chunk_index == 0), chunks[0])
        duplicate_ids.extend(chunk.id for chunk in chunks if chunk.id != keep.id)
    if duplicate_ids:
        db.execute(delete(RagChunk).where(RagChunk.id.in_(duplicate_ids)))

    return {
        "orphan_deleted": len(orphan_ids),
        "stale_deleted": stale_deleted,
        "duplicate_deleted": len(duplicate_ids),
    }


def embed_youtube_batch(
    db: Session,
    artist_id: int,
    *,
    limit: int,
    days: int | None = None,
    source_type: str | None = None,
    force: bool = False,
) -> dict[str, int]:
    candidates, _ = _embedding_candidates(
        db,
        artist_id,
        days=days,
        source_type=source_type,
        force=force,
    )
    batch = candidates[:limit]
    processed = 0
    embedded = 0
    skipped = 0
    failed = 0
    created_chunks = 0
    estimated_tokens = 0
    for video in batch:
        processed += 1
        try:
            estimated_tokens += _approx_tokens(build_video_embedding_text(db, video, artist_id))
            created_chunks += refresh_video_chunks(db, video, artist_id)
            embedded += 1
        except Exception:
            failed += 1
    remaining_missing = max(len(candidates) - processed, 0)
    if not force:
        skipped = len(_artist_youtube_videos(db, artist_id, days=days, source_type=source_type)) - len(candidates)
    return {
        "processed": processed,
        "embedded": embedded,
        "skipped": skipped,
        "failed": failed,
        "created_chunks": created_chunks,
        "remaining_missing": remaining_missing,
        "estimated_tokens": estimated_tokens,
    }
