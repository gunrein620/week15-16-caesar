from mcp.server.fastmcp import FastMCP

from app.core.db import get_session_factory
from app.services.mcp_client import McpToolClient
from app.services.naver import naver_news_search as naver_news_search_service

mcp = FastMCP("week15-16-caesar")


@mcp.tool()
def youtube_get_cached(artist_id: int) -> dict:
    with get_session_factory()() as db:
        return McpToolClient(db).call_tool("youtube_get_cached", {"artist_id": artist_id})


@mcp.tool()
def youtube_sync_if_stale(artist_id: int) -> dict:
    with get_session_factory()() as db:
        result = McpToolClient(db).call_tool("youtube_sync_if_stale", {"artist_id": artist_id})
        db.commit()
        return result


@mcp.tool()
def naver_news_search(query: str, display: int = 5) -> dict:
    return {"items": naver_news_search_service(query, display)}


if __name__ == "__main__":
    mcp.run()
