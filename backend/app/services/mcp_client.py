from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import McpCallLog, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.naver import naver_news_search
from app.services.youtube import sync_artist_videos


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
        ).all()
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
