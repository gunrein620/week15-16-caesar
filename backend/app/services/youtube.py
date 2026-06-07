from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import is_postgres
from app.models import ArtistKeyword, YoutubeSource, YoutubeVideo, YoutubeVideoSource
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
    channel_or_playlist_id = channel_or_playlist_id.strip()
    if channel_or_playlist_id.startswith("UU"):
        return channel_or_playlist_id
    parsed = urlparse(channel_or_playlist_id)
    if parsed.scheme and "youtube.com" in parsed.netloc:
        path_parts = [part for part in parsed.path.split("/") if part]
        if len(path_parts) >= 2 and path_parts[0] == "channel":
            channel_or_playlist_id = path_parts[1]
        elif path_parts and path_parts[0].startswith("@"):
            channel_or_playlist_id = path_parts[0]
        else:
            playlist_id = parse_qs(parsed.query).get("list", [None])[0]
            if playlist_id and playlist_id.startswith("UU"):
                return playlist_id
    channel_params: dict[str, Any]
    if channel_or_playlist_id.startswith("@"):
        channel_params = {
            "part": "contentDetails",
            "forHandle": channel_or_playlist_id.removeprefix("@"),
            "maxResults": 1,
        }
    else:
        channel_params = {
            "part": "contentDetails",
            "id": channel_or_playlist_id,
            "maxResults": 1,
        }
    data = _youtube_get(
        "channels",
        channel_params,
    )
    items = data.get("items", [])
    if not items:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="YouTube channel not found")
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]


def _int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _batched(values: list[str], size: int) -> Iterator[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def _playlist_video_ids(playlist_id: str, max_results: int) -> list[str]:
    ids: list[str] = []
    page_token: str | None = None
    while len(ids) < max_results:
        params: dict[str, Any] = {
            "part": "snippet",
            "playlistId": playlist_id,
            "maxResults": min(50, max_results - len(ids)),
        }
        if page_token:
            params["pageToken"] = page_token
        data = _youtube_get("playlistItems", params)
        for item in data.get("items", []):
            video_id = item.get("snippet", {}).get("resourceId", {}).get("videoId")
            if video_id:
                ids.append(video_id)
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return ids


def _search_video_ids(query: str, max_results: int) -> list[str]:
    data = _youtube_get(
        "search",
        {
            "part": "snippet",
            "type": "video",
            "q": query,
            "order": "date",
            "maxResults": min(max_results, 50),
        },
    )
    ids: list[str] = []
    for item in data.get("items", []):
        video_id = item.get("id", {}).get("videoId")
        if video_id:
            ids.append(video_id)
    return ids


def _video_details(video_ids: list[str]) -> list[dict[str, Any]]:
    videos: list[dict[str, Any]] = []
    for batch in _batched(video_ids, 50):
        data = _youtube_get(
            "videos",
            {"part": "snippet,statistics", "id": ",".join(batch), "maxResults": len(batch)},
        )
        videos.extend(data.get("items", []))
    return videos


def fetch_source_videos(source: YoutubeSource, max_results: int = 25) -> list[dict[str, Any]]:
    if source.source_type == "curated_video":
        items = _video_details([source.source_value])
    elif source.source_type == "keyword_search":
        items = _video_details(_search_video_ids(source.source_value, max_results))
    else:
        playlist_id = _uploads_playlist_id(source.source_value)
        items = _video_details(_playlist_video_ids(playlist_id, max_results))

    videos: list[dict[str, Any]] = []
    for item in items:
        snippet = item.get("snippet", {})
        statistics = item.get("statistics", {})
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
                "view_count": _int_or_none(statistics.get("viewCount")),
                "like_count": _int_or_none(statistics.get("likeCount")),
                "comment_count": _int_or_none(statistics.get("commentCount")),
            }
        )
    return videos


def _matches_fan_channel_keywords(db: Session, artist_id: int, item: dict[str, Any]) -> bool:
    keywords = [
        keyword.lower()
        for keyword in db.scalars(
            select(ArtistKeyword.keyword).where(ArtistKeyword.artist_id == artist_id)
        ).all()
    ]
    if not keywords:
        return False
    haystack = f"{item.get('title', '')}\n{item.get('description', '')}".lower()
    return any(keyword in haystack for keyword in keywords)


def sync_artist_videos(
    db: Session,
    artist_id: int,
    *,
    source_types: set[str] | None = None,
) -> dict[str, int]:
    _require_youtube_key()
    lock_key = 50_000 + artist_id
    with advisory_lock(db, lock_key) as acquired:
        if not acquired:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sync already running")

        statement = select(YoutubeSource).where(
            YoutubeSource.artist_id == artist_id,
            YoutubeSource.enabled.is_(True),
        )
        if source_types is not None:
            statement = statement.where(YoutubeSource.source_type.in_(source_types))
        sources = db.scalars(statement).all()
        now = datetime.now(UTC)
        for source in sources:
            if source.last_synced_at and now - source.last_synced_at < SYNC_COOLDOWN:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sync cooldown")

        created = 0
        updated = 0
        linked = 0
        for source in sources:
            for item in fetch_source_videos(source):
                if source.source_type == "fan_channel" and not _matches_fan_channel_keywords(
                    db, artist_id, item
                ):
                    continue
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
                        view_count=item.get("view_count"),
                        like_count=item.get("like_count"),
                        comment_count=item.get("comment_count"),
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
                    video.view_count = item.get("view_count")
                    video.like_count = item.get("like_count")
                    video.comment_count = item.get("comment_count")
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
