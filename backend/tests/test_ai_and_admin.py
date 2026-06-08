from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.core.db import get_session_factory
from app.models import (
    AiUsageCounter,
    ExternalUpdate,
    McpCallLog,
    Post,
    RagChunk,
    User,
    YoutubeSource,
    YoutubeVideo,
    YoutubeVideoSource,
)
from app.services.mcp_client import McpToolClient
from app.services.rag import refresh_video_chunks
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


def test_admin_can_manage_live_feed_sync_settings(client):
    user_token = signup(client)
    admin_token = login(client, "admin@example.com", "admin-password")
    user_headers = {"Authorization": f"Bearer {user_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    forbidden = client.get("/admin/settings/sync", headers=user_headers)
    current = client.get("/admin/settings/sync", headers=admin_headers)
    updated = client.put(
        "/admin/settings/sync",
        json={
            "enabled": True,
            "official_interval_minutes": 240,
            "member_interval_minutes": 180,
            "fan_interval_minutes": 45,
            "curated_interval_minutes": 1440,
            "naver_interval_minutes": 90,
            "keyword_interval_minutes": 180,
        },
        headers=admin_headers,
    )
    invalid_keyword = client.put(
        "/admin/settings/sync",
        json={
            "enabled": True,
            "official_interval_minutes": 180,
            "member_interval_minutes": 120,
            "fan_interval_minutes": 60,
            "curated_interval_minutes": 720,
            "naver_interval_minutes": 60,
            "keyword_interval_minutes": 30,
        },
        headers=admin_headers,
    )

    assert forbidden.status_code == 403
    assert current.status_code == 200, current.text
    assert current.json()["enabled"] is True
    assert current.json()["official_interval_minutes"] == 180
    assert current.json()["member_interval_minutes"] == 120
    assert current.json()["fan_interval_minutes"] == 60
    assert current.json()["curated_interval_minutes"] == 720
    assert current.json()["naver_interval_minutes"] == 60
    assert current.json()["keyword_interval_minutes"] == 120
    assert updated.status_code == 200, updated.text
    assert updated.json()["official_interval_minutes"] == 240
    assert updated.json()["member_interval_minutes"] == 180
    assert updated.json()["fan_interval_minutes"] == 45
    assert updated.json()["curated_interval_minutes"] == 1440
    assert updated.json()["naver_interval_minutes"] == 90
    assert updated.json()["keyword_interval_minutes"] == 180
    assert invalid_keyword.status_code == 422


def test_admin_rag_coverage_reports_missing_and_stale_youtube_chunks(client):
    user_token = signup(client)
    admin_token = login(client, "admin@example.com", "admin-password")
    user_headers = {"Authorization": f"Bearer {user_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="official_channel",
            source_value="UU-rag-admin",
            title="RAG admin source",
        )
        embedded = YoutubeVideo(
            id="rag-admin-embedded",
            title="RESCENE embedded video",
            description="리센느 임베딩 완료 영상",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 1, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/rag-admin-embedded/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=rag-admin-embedded",
            view_count=100,
            content_hash="embedded-video-hash",
        )
        missing = YoutubeVideo(
            id="rag-admin-missing",
            title="RESCENE missing video",
            description="리센느 임베딩 누락 영상",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 2, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/rag-admin-missing/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=rag-admin-missing",
            view_count=200,
            content_hash="missing-video-hash",
        )
        stale = YoutubeVideo(
            id="rag-admin-stale",
            title="RESCENE stale video",
            description="리센느 오래된 chunk 영상",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 3, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/rag-admin-stale/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=rag-admin-stale",
            view_count=300,
            content_hash="stale-video-hash",
        )
        db.add_all([source, embedded, missing, stale])
        db.flush()
        db.add_all(
            [
                YoutubeVideoSource(video_id=embedded.id, source_id=source.id),
                YoutubeVideoSource(video_id=missing.id, source_id=source.id),
                YoutubeVideoSource(video_id=stale.id, source_id=source.id),
            ]
        )
        refresh_video_chunks(db, embedded, artist_id=1)
        db.add(
            RagChunk(
                artist_id=1,
                youtube_video_id=stale.id,
                chunk_index=0,
                content="old stale content",
                content_hash="old-hash",
                embedding=[0.0] * 1536,
            )
        )
        db.commit()

    forbidden = client.get("/admin/rag/coverage", headers=user_headers)
    coverage = client.get("/admin/rag/coverage", headers=admin_headers)

    assert forbidden.status_code == 403
    assert coverage.status_code == 200, coverage.text
    body = coverage.json()
    assert body["youtube_videos"] == 3
    assert body["youtube_embedded_videos"] == 2
    assert body["youtube_missing_videos"] == 1
    assert body["youtube_stale_videos"] == 1
    assert body["estimated_tokens"] > 0
    assert body["estimated_standard_cost_usd"] > 0


def test_admin_rag_cleanup_deletes_stale_youtube_chunks(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="official_channel",
            source_value="UU-rag-cleanup",
            title="RAG cleanup source",
        )
        stale = YoutubeVideo(
            id="rag-cleanup-stale",
            title="RESCENE cleanup stale video",
            description="정리되어야 하는 오래된 chunk",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 4, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/rag-cleanup-stale/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=rag-cleanup-stale",
            view_count=400,
            content_hash="cleanup-stale-video-hash",
        )
        db.add_all([source, stale])
        db.flush()
        db.add(YoutubeVideoSource(video_id=stale.id, source_id=source.id))
        db.add(
            RagChunk(
                artist_id=1,
                youtube_video_id=stale.id,
                chunk_index=0,
                content="stale content",
                content_hash="stale-hash",
                embedding=[0.0] * 1536,
            )
        )
        db.commit()

    cleanup = client.post("/admin/rag/cleanup", json={"artist_id": 1}, headers=admin_headers)
    coverage = client.get("/admin/rag/coverage", headers=admin_headers)

    assert cleanup.status_code == 200, cleanup.text
    assert cleanup.json()["stale_deleted"] == 1
    with get_session_factory()() as db:
        assert db.scalar(select(RagChunk).where(RagChunk.youtube_video_id == "rag-cleanup-stale")) is None
    assert coverage.json()["youtube_stale_videos"] == 0
    assert coverage.json()["youtube_missing_videos"] == 1


def test_admin_rag_embed_youtube_processes_limited_missing_batch(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="keyword_search",
            source_value="리센느 임베딩",
            title="RAG embed source",
        )
        first = YoutubeVideo(
            id="rag-embed-first",
            title="RESCENE first embed video",
            description="첫 번째 임베딩 대상",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 5, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/rag-embed-first/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=rag-embed-first",
            view_count=500,
            content_hash="first-video-hash",
        )
        second = YoutubeVideo(
            id="rag-embed-second",
            title="RESCENE second embed video",
            description="두 번째 임베딩 대상",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 6, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/rag-embed-second/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=rag-embed-second",
            view_count=600,
            content_hash="second-video-hash",
        )
        db.add_all([source, first, second])
        db.flush()
        db.add_all(
            [
                YoutubeVideoSource(video_id=first.id, source_id=source.id),
                YoutubeVideoSource(video_id=second.id, source_id=source.id),
            ]
        )
        db.commit()

    first_batch = client.post(
        "/admin/rag/embed-youtube",
        json={"artist_id": 1, "limit": 1, "days": 30},
        headers=admin_headers,
    )
    second_batch = client.post(
        "/admin/rag/embed-youtube",
        json={"artist_id": 1, "limit": 10, "days": 30},
        headers=admin_headers,
    )

    assert first_batch.status_code == 200, first_batch.text
    assert first_batch.json()["processed"] == 1
    assert first_batch.json()["embedded"] == 1
    assert first_batch.json()["created_chunks"] == 1
    assert first_batch.json()["remaining_missing"] == 1
    assert second_batch.status_code == 200, second_batch.text
    assert second_batch.json()["embedded"] == 1
    assert second_batch.json()["remaining_missing"] == 0
    with get_session_factory()() as db:
        chunks = db.scalars(
            select(RagChunk)
            .where(RagChunk.youtube_video_id.in_(["rag-embed-first", "rag-embed-second"]))
            .order_by(RagChunk.youtube_video_id)
        ).all()
    assert len(chunks) == 2
    assert all(chunk.chunk_index == 0 for chunk in chunks)
    assert "channel:" in chunks[0].content


def test_admin_rag_job_processes_missing_and_stale_videos_without_duplicate_chunks(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    with get_session_factory()() as db:
        first_source = YoutubeSource(
            artist_id=1,
            source_type="keyword_search",
            source_value="리센느 job",
            title="RAG job source",
        )
        second_source = YoutubeSource(
            artist_id=1,
            source_type="fan_channel",
            source_value="UU-job-fan",
            title="RAG job duplicate source",
        )
        missing = YoutubeVideo(
            id="rag-job-missing",
            title="RESCENE job missing video",
            description="job 임베딩 누락 대상",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 7, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/rag-job-missing/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=rag-job-missing",
            view_count=700,
            content_hash="missing-video-hash",
        )
        stale = YoutubeVideo(
            id="rag-job-stale",
            title="RESCENE job stale video",
            description="job 임베딩 갱신 대상",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 6, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/rag-job-stale/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=rag-job-stale",
            view_count=800,
            content_hash="stale-video-hash",
        )
        db.add_all([first_source, second_source, missing, stale])
        db.flush()
        db.add_all(
            [
                YoutubeVideoSource(video_id=missing.id, source_id=first_source.id),
                YoutubeVideoSource(video_id=missing.id, source_id=second_source.id),
                YoutubeVideoSource(video_id=stale.id, source_id=first_source.id),
            ]
        )
        refresh_video_chunks(db, stale, artist_id=1)
        stale.description = "job 임베딩 갱신 대상 - 변경됨"
        stale.content_hash = "changed-stale-video-hash"
        db.commit()

    created = client.post(
        "/admin/rag/jobs",
        json={"artist_id": 1, "scope": "all", "batch_size": 2, "force": False},
        headers=admin_headers,
    )
    current = client.get("/admin/rag/jobs/current", headers=admin_headers)

    assert created.status_code == 201, created.text
    body = created.json()
    assert body["processed"] >= 2
    assert body["embedded"] >= 2
    assert body["failed"] == 0
    assert current.status_code == 200, current.text
    assert current.json()["id"] == body["id"]
    while body["status"] != "completed":
        continued = client.post(f"/admin/rag/jobs/{body['id']}/run", headers=admin_headers)
        assert continued.status_code == 200, continued.text
        body = continued.json()
    with get_session_factory()() as db:
        chunks = db.scalars(
            select(RagChunk)
            .where(RagChunk.youtube_video_id.in_(["rag-job-missing", "rag-job-stale"]))
            .order_by(RagChunk.youtube_video_id)
        ).all()
    assert len(chunks) == 2
    assert {chunk.youtube_video_id for chunk in chunks} == {"rag-job-missing", "rag-job-stale"}
    assert all(chunk.chunk_index == 0 for chunk in chunks)
    assert any("변경됨" in chunk.content for chunk in chunks)


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
    assert "팬 게시글" in preview_markdown
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


def test_briefing_uses_linked_fan_posts_instead_of_raw_rag_text(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    with get_session_factory()() as db:
        admin = db.scalar(select(User).where(User.email == "admin@example.com"))
        fan_post = Post(
            category="후기",
            title="팬들이 남긴 원이 무대 후기",
            content="원이가 무대에서 좋았다는 팬 후기입니다.",
            author_id=admin.id,
            artist_id=1,
        )
        db.add(fan_post)
        db.commit()
        db.refresh(fan_post)
        fan_post_id = fan_post.id

    preview = client.post("/ai/briefing/preview", headers=admin_headers)

    assert preview.status_code == 200, preview.text
    markdown = preview.json()["preview_markdown"]
    source_cards = preview.json()["source_cards"]
    assert "팬 게시글" in markdown
    assert "팬들이 남긴 원이 무대 후기" in markdown
    assert f"링크: /posts/{fan_post_id}" in markdown
    assert "channel:" not in markdown
    assert any(
        card["item_type"] == "post" and card["url"] == f"/posts/{fan_post_id}"
        for card in source_cards
    )


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
