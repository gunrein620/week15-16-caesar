from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import is_postgres
from app.models import YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.rag import refresh_video_chunks
from app.services.text import content_hash

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
SYNC_COOLDOWN = timedelta(minutes=5)


@contextmanager
def advisory_lock(db: Session, key: int) -> Iterator[bool]:
    if not is_postgres():
        yield True
        return
    acquired = db.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": key}).scalar_one()
    if not acquired:
        yield False
        return
    try:
        yield True
    finally:
        db.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": key})


def _require_youtube_key() -> str:
    key = get_settings().youtube_api_key
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="YOUTUBE_API_KEY is not configured",
        )
    return key


def _youtube_get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    params = {**params, "key": _require_youtube_key()}
    with httpx.Client(timeout=20) as client:
        response = client.get(f"{YOUTUBE_API_BASE}/{path}", params=params)
    response.raise_for_status()
    return response.json()


def _uploads_playlist_id(channel_or_playlist_id: str) -> str:
    if channel_or_playlist_id.startswith("UU"):
        return channel_or_playlist_id
    data = _youtube_get(
        "channels",
        {"part": "contentDetails", "id": channel_or_playlist_id, "maxResults": 1},
    )
    items = data.get("items", [])
    if not items:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="YouTube channel not found")
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]


def fetch_source_videos(source: YoutubeSource, max_results: int = 10) -> list[dict[str, Any]]:
    if source.source_type == "curated_video":
        data = _youtube_get(
            "videos",
            {"part": "snippet", "id": source.source_value, "maxResults": 1},
        )
        items = data.get("items", [])
    else:
        playlist_id = _uploads_playlist_id(source.source_value)
        data = _youtube_get(
            "playlistItems",
            {"part": "snippet", "playlistId": playlist_id, "maxResults": max_results},
        )
        items = data.get("items", [])

    videos: list[dict[str, Any]] = []
    for item in items:
        snippet = item.get("snippet", {})
        resource = snippet.get("resourceId", {})
        video_id = item.get("id") if source.source_type == "curated_video" else resource.get("videoId")
        if source.source_type == "curated_video":
            video_id = item.get("id")
        if not video_id:
            continue
        thumbnails = snippet.get("thumbnails", {})
        best_thumbnail = (
            thumbnails.get("maxres")
            or thumbnails.get("high")
            or thumbnails.get("medium")
            or thumbnails.get("default")
            or {}
        )
        videos.append(
            {
                "id": video_id,
                "title": snippet.get("title", ""),
                "description": snippet.get("description", ""),
                "channel_title": snippet.get("channelTitle", ""),
                "published_at": snippet.get("publishedAt"),
                "thumbnail_url": best_thumbnail.get("url", ""),
                "url": f"https://www.youtube.com/watch?v={video_id}",
            }
        )
    return videos


def sync_artist_videos(db: Session, artist_id: int) -> dict[str, int]:
    _require_youtube_key()
    lock_key = 50_000 + artist_id
    with advisory_lock(db, lock_key) as acquired:
        if not acquired:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sync already running")

        sources = db.scalars(
            select(YoutubeSource).where(YoutubeSource.artist_id == artist_id, YoutubeSource.enabled.is_(True))
        ).all()
        now = datetime.now(UTC)
        for source in sources:
            if source.last_synced_at and now - source.last_synced_at < SYNC_COOLDOWN:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sync cooldown")

        created = 0
        updated = 0
        linked = 0
        for source in sources:
            for item in fetch_source_videos(source):
                hashed = content_hash(f"{item['title']}\n{item['description']}")
                video = db.get(YoutubeVideo, item["id"])
                is_new = video is None
                changed = video is not None and video.content_hash != hashed
                should_refresh = is_new or changed
                if video is None:
                    video = YoutubeVideo(
                        id=item["id"],
                        title=item["title"],
                        description=item["description"],
                        channel_title=item["channel_title"],
                        thumbnail_url=item["thumbnail_url"],
                        url=item["url"],
                        content_hash=hashed,
                    )
                    created += 1
                    db.add(video)
                else:
                    video.title = item["title"]
                    video.description = item["description"]
                    video.channel_title = item["channel_title"]
                    video.thumbnail_url = item["thumbnail_url"]
                    video.url = item["url"]
                    if changed:
                        video.content_hash = hashed
                        updated += 1
                if item.get("published_at"):
                    video.published_at = datetime.fromisoformat(
                        item["published_at"].replace("Z", "+00:00")
                    )
                db.flush()
                link = db.get(YoutubeVideoSource, {"video_id": video.id, "source_id": source.id})
                if link is None:
                    db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))
                    linked += 1
                if should_refresh:
                    refresh_video_chunks(db, video, artist_id)
            source.last_synced_at = now
        db.commit()
        return {"created": created, "updated": updated, "linked": linked}
