from mcp.server.fastmcp import FastMCP

from app.core.db import get_session_factory
from app.services.mcp_client import McpToolClient

mcp = FastMCP("week15-16-caesar")


@mcp.tool()
def youtube_get_cached(artist_id: int) -> dict:
    with get_session_factory()() as db:
        return McpToolClient(db).call_tool("youtube_get_cached", {"artist_id": artist_id})


@mcp.tool()
def youtube_sync_if_stale(artist_id: int, max_age_seconds: int = 300) -> dict:
    with get_session_factory()() as db:
        result = McpToolClient(db).call_tool(
            "youtube_sync_if_stale",
            {"artist_id": artist_id, "max_age_seconds": max_age_seconds},
        )
        db.commit()
        return result


@mcp.tool()
def naver_news_search(query: str, display: int = 5) -> dict:
    with get_session_factory()() as db:
        result = McpToolClient(db).call_tool(
            "naver_news_search", {"query": query, "display": display}
        )
        db.commit()
        return result


if __name__ == "__main__":
    mcp.run()
