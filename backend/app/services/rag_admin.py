from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import RagChunk, RagEmbeddingJob, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.rag import build_video_embedding_text, embed_texts, refresh_video_chunks, video_embedding_hash
from app.services.text import content_hash

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
    metadata_chunk = next((chunk for chunk in chunks if chunk.chunk_index == 0), None)
    if metadata_chunk is None:
        return True
    expected_hash = video_embedding_hash(db, video, artist_id)
    return metadata_chunk.content_hash != expected_hash


def _has_metadata_chunk(chunks: list[RagChunk]) -> bool:
    return any(chunk.chunk_index == 0 for chunk in chunks)


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
        if force or not _has_metadata_chunk(chunks) or _chunks_are_stale(db, video, artist_id, chunks):
            candidates.append(video)
    return candidates, chunks_by_video


def get_rag_coverage(db: Session, artist_id: int) -> dict:
    videos = _artist_youtube_videos(db, artist_id)
    video_ids = [video.id for video in videos]
    chunks_by_video = _chunks_for_videos(db, video_ids)
    embedded = sum(1 for video in videos if _has_metadata_chunk(chunks_by_video.get(video.id, [])))
    stale = sum(
        1
        for video in videos
        if _chunks_are_stale(db, video, artist_id, chunks_by_video.get(video.id, []))
    )
    missing = len(videos) - embedded
    candidates = [
        video
        for video in videos
        if not _has_metadata_chunk(chunks_by_video.get(video.id, []))
        or _chunks_are_stale(db, video, artist_id, chunks_by_video.get(video.id, []))
    ]
    estimated_tokens = sum(_approx_tokens(build_video_embedding_text(db, video, artist_id)) for video in candidates)
    recent_cutoff = datetime.now(UTC) - timedelta(days=90)
    recent = [
        video
        for video in videos
        if video.published_at and _aware_utc(video.published_at) >= recent_cutoff
    ]
    recent_missing = sum(
        1 for video in recent if not _has_metadata_chunk(chunks_by_video.get(video.id, []))
    )
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
    transcript_chunks = db.scalar(
        select(func.count())
        .select_from(RagChunk)
        .where(
            RagChunk.artist_id == artist_id,
            RagChunk.youtube_video_id.is_not(None),
            RagChunk.chunk_index >= 1,
        )
    )
    external_update_chunks = db.scalar(
        select(func.count())
        .select_from(RagChunk)
        .where(RagChunk.artist_id == artist_id, RagChunk.external_update_id.is_not(None))
    )
    transcript_fetched = sum(1 for video in videos if video.transcript_status == "fetched")
    transcript_unavailable = sum(1 for video in videos if video.transcript_status == "unavailable")
    transcript_pending = sum(1 for video in videos if video.transcript_status == "pending")
    return {
        "artist_id": artist_id,
        "youtube_videos": len(videos),
        "youtube_embedded_videos": embedded,
        "youtube_missing_videos": missing,
        "youtube_stale_videos": stale,
        "post_chunks": int(post_chunks or 0),
        "youtube_chunks": int(youtube_chunks or 0),
        "transcript_fetched_videos": transcript_fetched,
        "transcript_unavailable_videos": transcript_unavailable,
        "transcript_pending_videos": transcript_pending,
        "transcript_chunks": int(transcript_chunks or 0),
        "external_update_chunks": int(external_update_chunks or 0),
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
            .filter(RagChunk.youtube_video_id.in_(stale_video_ids), RagChunk.chunk_index == 0)
            .delete(synchronize_session=False)
        )

    duplicate_ids: list[int] = []
    groups: dict[tuple[str, int], list[RagChunk]] = defaultdict(list)
    stale_video_id_set = set(stale_video_ids)
    for chunks in chunks_by_video.values():
        for chunk in chunks:
            if chunk.youtube_video_id:
                if chunk.youtube_video_id in stale_video_id_set and chunk.chunk_index == 0:
                    continue
                groups[(chunk.youtube_video_id, chunk.chunk_index)].append(chunk)
    for chunks in groups.values():
        if len(chunks) <= 1:
            continue
        keep = min(chunks, key=lambda chunk: chunk.id)
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


def _job_days(scope: str) -> int | None:
    return 90 if scope == "recent_90d" else None


def _unique_videos(videos: list[YoutubeVideo]) -> list[YoutubeVideo]:
    unique: list[YoutubeVideo] = []
    seen: set[str] = set()
    for video in videos:
        if video.id in seen:
            continue
        seen.add(video.id)
        unique.append(video)
    return unique


def _refresh_job_snapshot(db: Session, job: RagEmbeddingJob) -> list[YoutubeVideo]:
    days = _job_days(job.scope)
    all_videos = _artist_youtube_videos(
        db,
        job.artist_id,
        days=days,
        source_type=job.source_type,
    )
    candidates, _ = _embedding_candidates(
        db,
        job.artist_id,
        days=days,
        source_type=job.source_type,
        force=job.force,
    )
    candidates = _unique_videos(candidates)
    job.total_videos = len(_unique_videos(all_videos))
    job.total_candidates = max(job.processed + len(candidates), job.total_candidates, len(candidates))
    job.remaining_missing = len(candidates)
    job.estimated_tokens = sum(
        _approx_tokens(build_video_embedding_text(db, video, job.artist_id)) for video in candidates
    )
    return candidates


def process_rag_embedding_job_batch(db: Session, job: RagEmbeddingJob) -> RagEmbeddingJob:
    if job.status == "completed":
        _refresh_job_snapshot(db, job)
        return job
    job.status = "running"
    job.started_at = job.started_at or datetime.now(UTC)
    candidates = _refresh_job_snapshot(db, job)
    batch = candidates[: job.batch_size]
    if not batch:
        job.status = "completed"
        job.completed_at = datetime.now(UTC)
        job.remaining_missing = 0
        job.estimated_tokens = 0
        job.last_error = ""
        return job

    prepared: list[tuple[str, str, str]] = []
    for video in batch:
        body = build_video_embedding_text(db, video, job.artist_id)
        if body:
            prepared.append((video.id, body, content_hash(body)))
        else:
            job.processed += 1
    if not prepared:
        job.status = "failed"
        job.last_error = "No embeddable text in current batch"
        return job

    try:
        embeddings = embed_texts([item[1] for item in prepared])
        video_ids = [item[0] for item in prepared]
        db.execute(
            delete(RagChunk).where(
                RagChunk.youtube_video_id.in_(video_ids),
                RagChunk.chunk_index == 0,
            )
        )
        rows = []
        for (video_id, body, hashed), embedding in zip(prepared, embeddings, strict=True):
            rows.append(
                RagChunk(
                    artist_id=job.artist_id,
                    youtube_video_id=video_id,
                    chunk_index=0,
                    content=body,
                    content_hash=hashed,
                    embedding=embedding,
                )
            )
        db.add_all(rows)
        db.flush()
        job.processed += len(prepared)
        job.embedded += len(prepared)
        job.created_chunks += len(prepared)
        job.last_error = ""
    except Exception as exc:
        job.failed += len(prepared)
        job.last_error = str(exc)
        job.status = "failed"
        return job

    remaining = _refresh_job_snapshot(db, job)
    if not remaining:
        job.status = "completed"
        job.completed_at = datetime.now(UTC)
        job.remaining_missing = 0
        job.estimated_tokens = 0
    return job


def create_rag_embedding_job(
    db: Session,
    *,
    artist_id: int,
    user_id: int | None,
    scope: str,
    source_type: str | None,
    batch_size: int,
    force: bool,
) -> RagEmbeddingJob:
    job = RagEmbeddingJob(
        artist_id=artist_id,
        user_id=user_id,
        scope=scope,
        source_type=source_type,
        batch_size=batch_size,
        force=force,
        status="running",
    )
    db.add(job)
    db.flush()
    process_rag_embedding_job_batch(db, job)
    return job


def latest_rag_embedding_job(db: Session, artist_id: int) -> RagEmbeddingJob | None:
    return db.scalars(
        select(RagEmbeddingJob)
        .where(RagEmbeddingJob.artist_id == artist_id)
        .order_by(RagEmbeddingJob.created_at.desc(), RagEmbeddingJob.id.desc())
    ).first()
