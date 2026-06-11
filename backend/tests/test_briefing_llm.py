from datetime import UTC, datetime
import re

from sqlalchemy import select

from app.core.db import get_session_factory
from app.models import ExternalUpdate, Post, User, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.rag import refresh_post_chunks
from tests.conftest import login


def _admin_headers(client) -> dict[str, str]:
    token = login(client, "admin@example.com", "admin-password")
    return {"Authorization": f"Bearer {token}"}


def _seed_briefing_sources() -> None:
    now = datetime.now(UTC)
    with get_session_factory()() as db:
        admin = db.scalar(select(User).where(User.email == "admin@example.com"))
        source = YoutubeSource(
            artist_id=1,
            source_type="curated_video",
            source_value="llm-briefing-video",
            title="official",
            last_synced_at=now,
        )
        video = YoutubeVideo(
            id="llm-briefing-video",
            title="RESCENE Love Attack 오늘 영상",
            description="리센느 오늘 무대 영상입니다.",
            channel_title="RESCENE",
            published_at=now,
            thumbnail_url="https://img.example.com/llm-briefing.jpg",
            url="https://youtube.example.com/llm-briefing-video",
            view_count=100,
            content_hash="llm-briefing-video-hash",
        )
        fan_post = Post(
            category="후기",
            title="팬들이 남긴 Love Attack 후기",
            content="오늘 Love Attack 무대를 보고 남긴 팬 후기입니다.",
            author_id=admin.id,
            artist_id=1,
        )
        context_post = Post(
            category="정보",
            title="Love Attack 과거 아카이브",
            content="Love Attack 활동의 과거 맥락을 정리한 자료입니다.",
            author_id=admin.id,
            artist_id=1,
        )
        naver_item = ExternalUpdate(
            artist_id=1,
            source_type="naver_news",
            external_id="llm-briefing-news",
            title="RESCENE Love Attack 뉴스",
            description="리센느 관련 최신 기사입니다.",
            url="https://news.example.com/llm-briefing",
            thumbnail_url="https://img.example.com/llm-news.jpg",
            source_label="Naver News",
            published_at=now,
            content_hash="llm-briefing-news-hash",
            raw_payload={},
        )
        db.add_all([source, video, fan_post, context_post, naver_item])
        db.flush()
        db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))
        refresh_post_chunks(db, context_post)
        db.commit()


def test_briefing_preview_uses_llm_highlights_without_breaking_markdown_contract(
    client,
    monkeypatch,
):
    import app.api.agent as agent

    monkeypatch.setattr(agent, "_briefing_highlights", lambda *args: ["하이라이트1", "하이라이트2"])
    _seed_briefing_sources()

    response = client.post(
        "/ai/briefing/preview?briefing_type=llm-highlight",
        headers=_admin_headers(client),
    )

    assert response.status_code == 200, response.text
    markdown = response.json()["preview_markdown"]
    lines = markdown.splitlines()
    assert "- 하이라이트1" in lines
    assert "- 하이라이트2" in lines
    assert any(line.startswith("기준일: ") for line in lines)

    sections = ["핵심 요약", "최근 영상", "팬 게시글", "Naver 소식", "과거 맥락"]
    section_indexes = [lines.index(section) for section in sections]
    assert section_indexes == sorted(section_indexes)

    numbered_indexes = [
        index for index, line in enumerate(lines) if re.match(r"^\d+\. ", line)
    ]
    assert numbered_indexes
    assert all(lines[index + 1].startswith("   링크: ") for index in numbered_indexes)


def test_briefing_preview_keeps_template_highlights_without_openai_key(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from app.core.config import reset_settings_cache

    reset_settings_cache()
    _seed_briefing_sources()

    response = client.post(
        "/ai/briefing/preview?briefing_type=no-openai-highlight",
        headers=_admin_headers(client),
    )

    assert response.status_code == 200, response.text
    lines = response.json()["preview_markdown"].splitlines()
    assert any(line.startswith("- 최근 영상 ") and "개," in line for line in lines)
    assert "- 자세히 볼 만한 링크를 아래에 모았습니다." in lines


def test_ai_context_uses_llm_summary_and_falls_back_to_template(client, monkeypatch):
    headers = _admin_headers(client)
    with get_session_factory()() as db:
        admin = db.scalar(select(User).where(User.email == "admin@example.com"))
        post = Post(
            category="정보",
            title="LLM 컨텍스트 Love Attack 원이 자료",
            content="Love Attack 무대 이야기와 원이 리센느 자료를 연결해 둔 테스트 아카이브입니다.",
            author_id=admin.id,
            artist_id=1,
        )
        db.add(post)
        db.flush()
        refresh_post_chunks(db, post)
        db.commit()

    monkeypatch.setattr(
        "app.services.rag_context._llm_context_summary",
        lambda mode, query, sources: "LLM이 작성한 컨텍스트 요약",
    )
    query = "Love Attack 원이 리센느 자료"
    llm_response = client.post(
        "/ai/context",
        json={
            "artist_id": 1,
            "mode": "writing_assist",
            "query": query,
        },
        headers=headers,
    )

    assert llm_response.status_code == 200, llm_response.text
    assert llm_response.json()["summary"] == "LLM이 작성한 컨텍스트 요약"

    monkeypatch.setattr(
        "app.services.rag_context._llm_context_summary",
        lambda mode, query, sources: None,
    )
    fallback_response = client.post(
        "/ai/context",
        json={
            "artist_id": 1,
            "mode": "writing_assist",
            "query": query,
        },
        headers=headers,
    )

    assert fallback_response.status_code == 200, fallback_response.text
    assert fallback_response.json()["summary"].startswith("작성 중인 글과 연결할 만한 자료")
