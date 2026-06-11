from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import McpCallLog, RagChunk, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.archive_search import search_archive_candidates
from app.services.naver import naver_news_search
from app.services.rag import _chunk_source_payload, _temporal_update_sources
from app.services.search_intent import SearchIntent, _load_archive_terms
from app.services.youtube import sync_artist_videos


def _limit(value: int, *, default: int = 8, maximum: int = 12) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, maximum))


def _string_tuple(value: list[str] | tuple[str, ...] | str | None) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value.strip(),) if value.strip() else ()
    if not isinstance(value, (list, tuple)):
        return ()
    return tuple(dict.fromkeys(item.strip() for item in value if isinstance(item, str) and item.strip()))


class McpToolClient:
    def __init__(self, db: Session, agent_run_id: int | None = None) -> None:
        self.db = db
        self.agent_run_id = agent_run_id

    def call_tool(self, tool_name: str, arguments: dict) -> dict:
        try:
            if tool_name == "youtube_get_cached":
                output = self.youtube_get_cached(**arguments)
            elif tool_name == "youtube_sync_if_stale":
                output = self.youtube_sync_if_stale(**arguments)
            elif tool_name == "naver_news_search":
                output = {"items": naver_news_search(**arguments)}
            elif tool_name == "search_archive":
                output = self.search_archive(**arguments)
            elif tool_name == "get_recent_updates":
                output = self.get_recent_updates(**arguments)
            elif tool_name == "get_video_detail":
                output = self.get_video_detail(**arguments)
            else:
                raise ValueError(f"Unknown MCP tool: {tool_name}")
        except HTTPException as exc:
            output = {"error": exc.detail, "status_code": exc.status_code}
        self.db.add(
            McpCallLog(
                agent_run_id=self.agent_run_id,
                tool_name=tool_name,
                input_json=arguments,
                output_json=output,
            )
        )
        self.db.flush()
        return output

    def youtube_get_cached(self, artist_id: int) -> dict:
        videos = self.db.scalars(
            select(YoutubeVideo)
            .join(YoutubeVideoSource)
            .join(YoutubeSource)
            .where(YoutubeSource.artist_id == artist_id)
            .order_by(YoutubeVideo.published_at.desc().nullslast())
            .limit(10)
        ).unique().all()
        return {
            "videos": [
                {
                    "id": video.id,
                    "title": video.title,
                    "description": video.description,
                    "url": video.url,
                }
                for video in videos
            ]
        }

    def youtube_sync_if_stale(self, artist_id: int, max_age_seconds: int = 300) -> dict:
        sources = self.db.scalars(
            select(YoutubeSource).where(
                YoutubeSource.artist_id == artist_id,
                YoutubeSource.enabled.is_(True),
            )
        ).all()
        if not sources:
            return {
                "skipped": True,
                "reason": "no_sources",
                **self.youtube_get_cached(artist_id),
            }
        now = datetime.now(UTC)
        max_age = timedelta(seconds=max_age_seconds)
        stale = False
        for source in sources:
            if source.last_synced_at is None:
                stale = True
                break
            synced_at = source.last_synced_at
            if synced_at.tzinfo is None:
                synced_at = synced_at.replace(tzinfo=UTC)
            if now - synced_at > max_age:
                stale = True
                break
        if not stale:
            return {
                "skipped": True,
                "reason": "fresh",
                **self.youtube_get_cached(artist_id),
            }
        return sync_artist_videos(self.db, artist_id)

    def search_archive(
        self,
        artist_id: int,
        query: str,
        media_type: str | None = None,
        source_types: list[str] | tuple[str, ...] | str | None = None,
        include_terms: list[str] | tuple[str, ...] | str | None = None,
        limit: int = 8,
    ) -> dict:
        capped_limit = _limit(limit)
        intent = SearchIntent(
            question=query,
            artist_id=artist_id,
            route="archive",
            media_type="youtube" if media_type == "youtube" else None,
            source_types=_string_tuple(source_types),
            include_terms=_string_tuple(include_terms),
            archive_terms=_load_archive_terms(self.db, artist_id, query),
        )
        chunks = search_archive_candidates(
            self.db,
            query,
            artist_id=artist_id,
            limit=capped_limit,
            intent=intent,
        )
        return {"sources": [_chunk_source_payload(self.db, chunk) for chunk in chunks]}

    def get_recent_updates(
        self,
        artist_id: int,
        temporal: str = "recent",
        source: str | None = None,
        limit: int = 8,
    ) -> dict:
        capped_limit = _limit(limit)
        intent = SearchIntent(
            question="recent updates",
            artist_id=artist_id,
            route="updates",
            temporal=temporal if temporal in {"today", "recent"} else "recent",
            media_type="youtube" if source == "youtube" else None,
        )
        return {"sources": _temporal_update_sources(self.db, intent, limit=capped_limit)}

    def get_video_detail(self, video_id: str) -> dict:
        video = self.db.get(YoutubeVideo, video_id)
        if video is None:
            return {"error": "not_found"}
        chunks = self.db.scalars(
            select(RagChunk)
            .where(
                RagChunk.youtube_video_id == video_id,
                RagChunk.chunk_index >= 1,
            )
            .order_by(RagChunk.chunk_index.asc())
            .limit(3)
        ).all()
        return {
            "video": {
                "id": video.id,
                "title": video.title,
                "channel_title": video.channel_title,
                "published_at": video.published_at.isoformat() if video.published_at else None,
                "view_count": video.view_count,
                "url": video.url,
                "thumbnail_url": video.thumbnail_url,
            },
            "transcript_preview": [chunk.content for chunk in chunks],
        }
