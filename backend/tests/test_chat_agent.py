from datetime import UTC, datetime
import json

from sqlalchemy import select

from app.core.db import get_session_factory
from app.models import AgentRun, AiUsageCounter, McpCallLog, User, YoutubeVideo
from app.services.mcp_client import McpToolClient
from app.services.rag import refresh_video_chunks
from tests.conftest import signup


def _events(body: str) -> list[dict]:
    events = []
    for block in body.strip().split("\n\n"):
        for line in block.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line.removeprefix("data: ")))
    return events


def test_chat_falls_back_to_search_without_openai_key(client):
    token = signup(client, "chat-fallback@example.com")
    response = client.post(
        "/ai/chat",
        json={"messages": [{"role": "user", "content": "리센느 입덕 포인트"}], "artist_id": 1},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200, response.text
    event_types = [event["type"] for event in _events(response.text)]
    assert "sources" in event_types
    assert "delta" in event_types
    assert event_types[-1] == "done"
    with get_session_factory()() as db:
        run = db.scalar(select(AgentRun).where(AgentRun.briefing_type == "chat"))
        assert run is not None
        assert run.status == "chat"


def test_chat_streams_tool_call_and_logs_mcp(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("CHAT_SUGGESTIONS_ENABLED", "false")
    from app.core.config import reset_settings_cache
    import app.services.chat_agent as chat_agent
    from app.services.text import deterministic_embedding

    reset_settings_cache()
    monkeypatch.setattr(chat_agent, "_openai_client", lambda settings: object())
    monkeypatch.setattr("app.services.rag.embed_text", deterministic_embedding)

    completion_calls = []

    def fake_completion(client, **kwargs):
        completion_calls.append(kwargs)
        if len(completion_calls) == 1:
            return {
                "choices": [
                    {
                        "message": {
                            "content": "",
                            "tool_calls": [
                                {
                                    "id": "call_search",
                                    "function": {
                                        "name": "search_archive",
                                        "arguments": json.dumps(
                                            {"artist_id": 1, "query": "Love Attack 무대", "limit": 3},
                                            ensure_ascii=False,
                                        ),
                                    },
                                }
                            ],
                        }
                    }
                ]
            }
        return {"choices": [{"message": {"content": "도구 결과를 확인했습니다."}}]}

    def fake_stream(client, **kwargs):
        assert kwargs["tool_choice"] == "none"
        return [{"choices": [{"delta": {"content": "Love Attack 근거 답변입니다. [1]"}}]}]

    monkeypatch.setattr(chat_agent, "_chat_completion", fake_completion)
    monkeypatch.setattr(chat_agent, "_chat_completion_stream", fake_stream)
    token = signup(client, "chat-tool@example.com")

    response = client.post(
        "/ai/chat",
        json={"messages": [{"role": "user", "content": "Love Attack 무대 알려줘"}], "artist_id": 1},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200, response.text
    events = _events(response.text)
    event_types = [event["type"] for event in events]
    assert event_types == ["run", "tool_call", "tool_result", "sources", "delta", "done"]
    assert events[1]["name"] == "search_archive"
    assert events[2]["count"] >= 1
    assert events[3]["sources"]
    assert events[4]["text"] == "Love Attack 근거 답변입니다. [1]"
    with get_session_factory()() as db:
        run_id = events[0]["run_id"]
        logged = db.scalar(
            select(McpCallLog).where(
                McpCallLog.agent_run_id == run_id,
                McpCallLog.tool_name == "search_archive",
            )
        )
        assert logged is not None


def test_chat_requires_last_message_to_be_user(client):
    token = signup(client, "chat-invalid@example.com")
    response = client.post(
        "/ai/chat",
        json={
            "messages": [
                {"role": "user", "content": "질문"},
                {"role": "assistant", "content": "답변"},
            ],
            "artist_id": 1,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


def test_chat_quota_uses_chat_daily_limit(client):
    token = signup(client, "chat-quota@example.com")
    with get_session_factory()() as db:
        signed_up = db.scalar(select(User).where(User.email == "chat-quota@example.com"))
        assert signed_up is not None
        db.add(
            AiUsageCounter(
                scope="user",
                scope_id=str(signed_up.id),
                feature="chat",
                day=datetime.now(UTC).date(),
                count=40,
            )
        )
        db.commit()

    response = client.post(
        "/ai/chat",
        json={"messages": [{"role": "user", "content": "한도 테스트"}], "artist_id": 1},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 429


def test_mcp_search_archive_respects_media_type_and_limit(client):
    with get_session_factory()() as db:
        for index in range(3):
            video = YoutubeVideo(
                id=f"chat-video-{index}",
                title=f"RESCENE 원이 영상 {index}",
                description="원이 무대 영상",
                channel_title="RESCENE",
                published_at=datetime.now(UTC),
                thumbnail_url=f"https://img.example.com/chat-{index}.jpg",
                url=f"https://youtube.example.com/chat-video-{index}",
                view_count=100 + index,
                content_hash=f"chat-video-{index}-hash",
            )
            db.add(video)
            db.flush()
            refresh_video_chunks(db, video, artist_id=1)
        db.commit()

        result = McpToolClient(db).call_tool(
            "search_archive",
            {"artist_id": 1, "query": "원이 영상", "media_type": "youtube", "limit": 20},
        )

    assert 1 <= len(result["sources"]) <= 12
    assert all(source["source_type"] == "youtube" for source in result["sources"])
