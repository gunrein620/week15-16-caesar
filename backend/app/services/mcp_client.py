from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import McpCallLog, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.naver import naver_news_search
from app.services.youtube import sync_artist_videos


class McpToolClient:
    def __init__(self, db: Session) -> None:
        self.db = db

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
        self.db.add(McpCallLog(tool_name=tool_name, input_json=arguments, output_json=output))
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

    def youtube_sync_if_stale(self, artist_id: int) -> dict:
        return sync_artist_videos(self.db, artist_id)
