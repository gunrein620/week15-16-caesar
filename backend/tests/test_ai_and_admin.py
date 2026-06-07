from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.core.db import get_session_factory
from app.models import (
    AiUsageCounter,
    ExternalUpdate,
    McpCallLog,
    Post,
    YoutubeSource,
    YoutubeVideo,
    YoutubeVideoSource,
)
from app.services.mcp_client import McpToolClient
from tests.conftest import login, signup


def test_ai_requires_auth_and_enforces_daily_quota(client):
    unauthorized = client.post("/ai/qa", json={"question": "리센느는?", "artist_id": 1})
    assert unauthorized.status_code == 401

    token = signup(client)
    headers = {"Authorization": f"Bearer {token}"}
    first = client.post(
        "/ai/qa", json={"question": "리센느 입덕 포인트는?", "artist_id": 1}, headers=headers
    )
    assert first.status_code == 200, first.text
    second = client.post("/ai/qa", json={"question": "한 번 더", "artist_id": 1}, headers=headers)
    assert second.status_code == 200
    third = client.post("/ai/qa", json={"question": "세 번째", "artist_id": 1}, headers=headers)
    assert third.status_code == 429


def test_infra_budget_hard_stop_blocks_public_api_but_allows_admin_recovery(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    stopped = client.put(
        "/admin/settings/infra-cost",
        json={
            "hard_stop_enabled": True,
            "manual_hard_stop": False,
            "monthly_budget_usd": 0,
            "railway_subscription_monthly_usd": 1,
            "railway_backend_estimated_monthly_usd": 1,
            "railway_db_estimated_monthly_usd": 1,
            "vercel_estimated_monthly_usd": 0,
        },
        headers=admin_headers,
    )
    assert stopped.status_code == 200, stopped.text
    assert stopped.json()["hard_stopped"] is True

    blocked = client.get("/posts")
    login_response = client.post(
        "/auth/login", json={"email": "admin@example.com", "password": "admin-password"}
    )
    me_response = client.get("/auth/me", headers=admin_headers)
    status_response = client.get("/admin/settings/infra-cost", headers=admin_headers)

    assert blocked.status_code == 503
    assert blocked.json()["detail"] == "Infrastructure budget hard stop"
    assert login_response.status_code == 200
    assert me_response.status_code == 200
    assert status_response.status_code == 200

    recovered = client.put(
        "/admin/settings/infra-cost",
        json={
            "hard_stop_enabled": False,
            "manual_hard_stop": False,
            "monthly_budget_usd": 10,
            "railway_subscription_monthly_usd": 1,
            "railway_backend_estimated_monthly_usd": 1,
            "railway_db_estimated_monthly_usd": 1,
            "vercel_estimated_monthly_usd": 0,
        },
        headers=admin_headers,
    )
    assert recovered.status_code == 200, recovered.text
    assert client.get("/posts").status_code == 200


def test_sync_and_briefing_are_admin_only(client):
    user_token = signup(client)
    user_headers = {"Authorization": f"Bearer {user_token}"}
    assert client.post("/artists/1/sync", headers=user_headers).status_code == 403
    assert client.post("/ai/briefing/preview", headers=user_headers).status_code == 403

    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="curated_video",
            source_value="briefing-video",
            title="official",
            last_synced_at=datetime.now(UTC),
        )
        video = YoutubeVideo(
            id="briefing-video",
            title="RESCENE briefing video",
            description="오늘 볼 영상",
            channel_title="RESCENE",
            published_at=datetime.now(UTC),
            thumbnail_url="https://img.example.com/briefing.jpg",
            url="https://youtube.example.com/briefing-video",
            view_count=100,
            content_hash="briefing-video-hash",
        )
        db.add_all(
            [
                source,
                video,
                ExternalUpdate(
                    artist_id=1,
                    source_type="naver_news",
                    external_id="briefing-news",
                    title="RESCENE briefing news",
                    description="읽기 좋은 기사 요약",
                    url="https://news.example.com/briefing",
                    thumbnail_url="https://img.example.com/news.jpg",
                    source_label="Naver News",
                    published_at=datetime.now(UTC),
                    content_hash="briefing-news-hash",
                    raw_payload={},
                ),
            ]
        )
        db.flush()
        db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))
        db.commit()

    preview = client.post("/ai/briefing/preview", headers=admin_headers)
    assert preview.status_code == 200, preview.text
    preview_markdown = preview.json()["preview_markdown"]
    source_cards = preview.json()["source_cards"]
    assert "핵심 요약" in preview_markdown
    assert "최근 영상" in preview_markdown
    assert "팬 반응" in preview_markdown
    assert "Naver 소식" in preview_markdown
    assert not any(line.startswith("#") for line in preview_markdown.splitlines())
    assert {"youtube", "naver_news"} <= {card["item_type"] for card in source_cards}
    assert all(card["url"] for card in source_cards)
    run_id = preview.json()["run_id"]

    publish = client.post(f"/ai/briefing/{run_id}/publish", headers=admin_headers)
    assert publish.status_code == 200, publish.text
    published_body = publish.json()
    assert published_body["category"] == "브리핑"
    assert any(embed["type"] == "source_card" for embed in published_body["embeds"])
    with get_session_factory()() as db:
        publish_features = set(db.scalars(select(AiUsageCounter.feature)).all())
    assert "briefing_publish" in publish_features

    duplicate_preview = client.post("/ai/briefing/preview", headers=admin_headers)
    duplicate = client.post(
        f"/ai/briefing/{duplicate_preview.json()['run_id']}/publish", headers=admin_headers
    )
    assert duplicate.status_code == 409


def test_admin_can_manage_home_keywords(client):
    user_token = signup(client)
    user_headers = {"Authorization": f"Bearer {user_token}"}
    blocked = client.post("/artists/1/keywords", json={"keyword": "라디오"}, headers=user_headers)
    assert blocked.status_code == 403

    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    created = client.post("/artists/1/keywords", json={"keyword": "라디오"}, headers=admin_headers)
    assert created.status_code == 201, created.text
    keyword_id = created.json()["id"]

    listed = client.get("/artists/1/keywords")
    assert listed.status_code == 200
    assert "라디오" in {item["keyword"] for item in listed.json()}

    deleted = client.delete(f"/artist-keywords/{keyword_id}", headers=admin_headers)
    assert deleted.status_code == 204
    listed_after = client.get("/artists/1/keywords")
    assert "라디오" not in {item["keyword"] for item in listed_after.json()}


def test_preview_does_not_create_post_and_agent_logs_mcp_tool_calls(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    with get_session_factory()() as db:
        post_count_before = db.scalar(select(func.count(Post.id)))

    preview = client.post("/ai/briefing/preview?refresh=true", headers=admin_headers)
    assert preview.status_code == 200, preview.text

    sync = client.post("/artists/1/sync", headers=admin_headers)
    assert sync.status_code == 503

    with get_session_factory()() as db:
        features = set(db.scalars(select(AiUsageCounter.feature)).all())
        tool_names = set(
            db.scalars(select(McpCallLog.tool_name).where(McpCallLog.agent_run_id == preview.json()["run_id"])).all()
        )
        post_count_after = db.scalar(select(func.count(Post.id)))

    assert {"briefing_preview", "youtube_sync"} <= features
    assert {"youtube_sync_if_stale", "youtube_get_cached", "naver_news_search"} <= tool_names
    assert post_count_after == post_count_before

    run = client.get(f"/agent-runs/{preview.json()['run_id']}", headers=admin_headers)
    assert run.status_code == 200, run.text
    run_tool_names = {item["tool_name"] for item in run.json()["tool_calls"]}
    assert {"youtube_sync_if_stale", "youtube_get_cached", "naver_news_search"} <= run_tool_names


def test_preview_syncs_stale_sources_without_refresh_flag(client, monkeypatch):
    def fake_sync(db, artist_id):
        return {"created": 0, "updated": 0, "linked": 0}

    monkeypatch.setattr("app.services.mcp_client.sync_artist_videos", fake_sync)
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    with get_session_factory()() as db:
        db.add(
            YoutubeSource(
                artist_id=1,
                source_type="curated_video",
                source_value="stale-preview-video",
                title="stale preview",
                last_synced_at=datetime.now(UTC) - timedelta(minutes=10),
            )
        )
        db.commit()

    preview = client.post(
        "/ai/briefing/preview?briefing_type=stale-preview", headers=admin_headers
    )
    assert preview.status_code == 200, preview.text

    with get_session_factory()() as db:
        tool_names = set(
            db.scalars(
                select(McpCallLog.tool_name).where(
                    McpCallLog.agent_run_id == preview.json()["run_id"]
                )
            ).all()
        )

    assert {"youtube_sync_if_stale", "youtube_get_cached", "naver_news_search"} <= tool_names


def test_preview_skips_sync_for_fresh_sources_without_refresh_flag(client, monkeypatch):
    called = False

    def fake_sync(db, artist_id):
        nonlocal called
        called = True
        return {"created": 0, "updated": 0, "linked": 0}

    monkeypatch.setattr("app.services.mcp_client.sync_artist_videos", fake_sync)
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    with get_session_factory()() as db:
        db.add(
            YoutubeSource(
                artist_id=1,
                source_type="curated_video",
                source_value="fresh-preview-video",
                title="fresh preview",
                last_synced_at=datetime.now(UTC),
            )
        )
        db.commit()

    preview = client.post(
        "/ai/briefing/preview?briefing_type=fresh-preview", headers=admin_headers
    )
    assert preview.status_code == 200, preview.text

    with get_session_factory()() as db:
        tool_names = set(
            db.scalars(
                select(McpCallLog.tool_name).where(
                    McpCallLog.agent_run_id == preview.json()["run_id"]
                )
            ).all()
        )

    assert called is False
    assert "youtube_sync_if_stale" not in tool_names
    assert {"youtube_get_cached", "naver_news_search"} <= tool_names


def test_mcp_youtube_sync_if_stale_skips_when_no_sources(client, monkeypatch):
    called = False

    def fake_sync(db, artist_id):
        nonlocal called
        called = True
        return {"created": 1, "updated": 0, "linked": 0}

    monkeypatch.setattr("app.services.mcp_client.sync_artist_videos", fake_sync)
    with get_session_factory()() as db:
        result = McpToolClient(db).call_tool(
            "youtube_sync_if_stale", {"artist_id": 1, "max_age_seconds": 300}
        )

    assert called is False
    assert result["skipped"] is True
    assert result["reason"] == "no_sources"


def test_mcp_youtube_sync_if_stale_skips_fresh_sources(client, monkeypatch):
    called = False

    def fake_sync(db, artist_id):
        nonlocal called
        called = True
        return {"created": 1, "updated": 0, "linked": 0}

    monkeypatch.setattr("app.services.mcp_client.sync_artist_videos", fake_sync)
    with get_session_factory()() as db:
        db.add(
            YoutubeSource(
                artist_id=1,
                source_type="curated_video",
                source_value="fresh-video",
                title="fresh",
                last_synced_at=datetime.now(UTC),
            )
        )
        db.commit()
        result = McpToolClient(db).call_tool(
            "youtube_sync_if_stale", {"artist_id": 1, "max_age_seconds": 300}
        )

    assert called is False
    assert result["skipped"] is True
    assert result["reason"] == "fresh"


def test_mcp_youtube_sync_if_stale_calls_sync_for_stale_sources(client, monkeypatch):
    called = False

    def fake_sync(db, artist_id):
        nonlocal called
        called = True
        return {"created": 0, "updated": 1, "linked": 0}

    monkeypatch.setattr("app.services.mcp_client.sync_artist_videos", fake_sync)
    with get_session_factory()() as db:
        db.add(
            YoutubeSource(
                artist_id=1,
                source_type="curated_video",
                source_value="stale-video",
                title="stale",
                last_synced_at=datetime.now(UTC) - timedelta(minutes=10),
            )
        )
        db.commit()
        result = McpToolClient(db).call_tool(
            "youtube_sync_if_stale", {"artist_id": 1, "max_age_seconds": 300}
        )

    assert called is True
    assert result == {"created": 0, "updated": 1, "linked": 0}
