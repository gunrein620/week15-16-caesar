import os
import sys

import pytest
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

from app.core.config import reset_settings_cache
from app.core.db import Base, get_engine, get_session_factory, reset_engine
from app.services.seed import ensure_minimal_rag_seed
import app.models  # noqa: F401


@pytest.mark.asyncio
async def test_mcp_initialize_list_tools_and_call(tmp_path, monkeypatch):
    db_path = tmp_path / "mcp.db"
    database_url = f"sqlite:///{db_path}"

    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    reset_settings_cache()
    reset_engine()
    Base.metadata.create_all(get_engine())
    with get_session_factory()() as db:
        ensure_minimal_rag_seed(db)
    reset_engine()
    reset_settings_cache()

    env = {
        **os.environ,
        "DATABASE_URL": database_url,
        "ENVIRONMENT": "test",
        "JWT_SECRET_KEY": "test-secret",
    }
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "app.mcp_server.server"],
        cwd=os.getcwd(),
        env=env,
    )

    async with stdio_client(params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            initialized = await session.initialize()
            assert initialized.serverInfo.name == "week15-16-caesar"

            tools = await session.list_tools()
            names = {tool.name for tool in tools.tools}
            assert {"youtube_get_cached", "youtube_sync_if_stale", "naver_news_search"} <= names

            result = await session.call_tool("youtube_get_cached", {"artist_id": 1})
            assert result.isError is False
            assert result.content

            naver = await session.call_tool("naver_news_search", {"query": "RESCENE", "display": 1})
            assert naver.isError is False
            assert naver.content

    reset_engine()
    reset_settings_cache()
