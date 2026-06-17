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
from app.services.rag import refresh_post_chunks, refresh_video_chunks
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
    page = client.post(
        "/ai/qa",
        json={
            "question": "리센느 입덕 포인트는?",
            "artist_id": 1,
            "offset": 10,
            "include_answer": False,
        },
        headers=headers,
    )
    assert page.status_code == 200, page.text
    second = client.post("/ai/qa", json={"question": "한 번 더", "artist_id": 1}, headers=headers)
    assert second.status_code == 200
    third = client.post("/ai/qa", json={"question": "세 번째", "artist_id": 1}, headers=headers)
    assert third.status_code == 429
    assert third.json()["detail"] == "오늘 AI 검색 한도를 초과했습니다."


def test_admin_bypasses_ai_quota_and_rate_limit(client):
    token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {token}"}

    for index in range(25):
        response = client.post(
            "/ai/qa",
            json={"question": f"관리자 테스트 {index}", "artist_id": 1},
            headers=headers,
        )
        assert response.status_code == 200, response.text


def test_ai_quota_reports_global_limit_separately(client):
    token = signup(client, "global-limit@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    with get_session_factory()() as db:
        db.add(
            AiUsageCounter(
                scope="global",
                scope_id="global",
                feature="qa",
                day=datetime.now(UTC).date(),
                count=20,
            )
        )
        db.commit()

    response = client.post(
        "/ai/qa",
        json={"question": "전체 한도 테스트", "artist_id": 1},
        headers=headers,
    )

    assert response.status_code == 429
    assert response.json()["detail"] == "오늘 전체 AI 사용량 한도를 초과했습니다."


def test_writing_assist_returns_empty_response_for_short_draft(client):
    token = signup(client, "writing-short@example.com")
    response = client.post(
        "/ai/writing-assist",
        json={"title": "원", "content": "", "category": "자유", "artist_id": 1},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"] == "제목이나 본문을 조금 더 입력하면 관련 자료를 추천합니다."
    assert body["sources"] == []
    assert body["insert_text"] == ""


def test_writing_assist_recommends_sources_with_insert_text(client):
    token = signup(client, "writing-assist@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    with get_session_factory()() as db:
        video = YoutubeVideo(
            id="writing-woni-video",
            title="RESCENE 원이 직캠",
            description="원이 무대 영상 참고자료",
            channel_title="RESCENE",
            published_at=datetime.now(UTC),
            thumbnail_url="https://img.example.com/writing.jpg",
            url="https://youtube.example.com/writing-woni-video",
            view_count=100,
            content_hash="writing-woni-video-hash",
        )
        db.add(video)
        db.flush()
        refresh_video_chunks(db, video, artist_id=1)
        db.commit()

    response = client.post(
        "/ai/writing-assist",
        json={
            "title": "원이 직캠 이야기",
            "content": "오늘 원이 무대 영상 관련해서 같이 보고 싶어요",
            "category": "영상",
            "artist_id": 1,
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["sources"]
    assert body["sources"][0]["youtube_video_id"] == "writing-woni-video"
    assert body["insert_text"] == "\n\n참고자료: RESCENE 원이 직캠\nhttps://youtube.example.com/writing-woni-video"


def test_saved_summary_only_uses_current_users_saved_items(client):
    first_token = signup(client, "saved-first@example.com")
    second_token = signup(client, "saved-second@example.com")
    first_headers = {"Authorization": f"Bearer {first_token}"}
    second_headers = {"Authorization": f"Bearer {second_token}"}

    first_save = client.post(
        "/saved-items",
        json={
            "item_type": "youtube",
            "item_id": "first-video",
            "title": "원이 저장 영상",
            "url": "https://youtube.example.com/first-video",
            "thumbnail_url": "",
            "source_label": "YouTube",
        },
        headers=first_headers,
    )
    second_save = client.post(
        "/saved-items",
        json={
            "item_type": "youtube",
            "item_id": "second-video",
            "title": "다른 사용자 저장 영상",
            "url": "https://youtube.example.com/second-video",
            "thumbnail_url": "",
            "source_label": "YouTube",
        },
        headers=second_headers,
    )
    assert first_save.status_code == 201
    assert second_save.status_code == 201

    response = client.post("/ai/saved-summary", json={"artist_id": 1}, headers=first_headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert "원이 저장 영상" in body["summary"]
    assert "다른 사용자 저장 영상" not in body["summary"]


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
    assert "RESCENE 채널의 YouTube 영상" in chunks[0].content


def test_admin_thumbnail_analysis_batch_updates_youtube_videos(client, monkeypatch):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    def fake_analyze_thumbnail_url(thumbnail_url, *, known_members):
        assert "Woni" in known_members
        return {
            "status": "analyzed",
            "person_count": 1,
            "detected_members": ["Woni"],
            "confidence": 0.82,
            "error": "",
            "model": "test-vision",
        }

    monkeypatch.setattr(
        "app.services.thumbnail_analysis.analyze_thumbnail_url",
        fake_analyze_thumbnail_url,
    )
    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="keyword_search",
            source_value="thumbnail analysis",
            title="thumbnail analysis source",
        )
        video = YoutubeVideo(
            id="thumb-analysis-woni",
            title="RESCENE WONI thumbnail",
            description="썸네일 분석 대상",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 10, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/thumb-analysis-woni/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=thumb-analysis-woni",
            view_count=100,
            content_hash="thumb-analysis-woni-hash",
        )
        db.add_all([source, video])
        db.flush()
        db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))
        db.commit()

    response = client.post(
        "/admin/rag/thumbnail-analysis",
        json={"artist_id": 1, "limit": 1},
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["processed"] == 1
    assert response.json()["analyzed"] == 1
    assert response.json()["failed"] == 0
    with get_session_factory()() as db:
        video = db.get(YoutubeVideo, "thumb-analysis-woni")
        assert video.thumbnail_analysis_status == "analyzed"
        assert video.thumbnail_person_count == 1
        assert video.thumbnail_detected_members == '["Woni"]'
        assert video.thumbnail_analysis_confidence == 0.82
        assert video.thumbnail_analysis_model == "test-vision"


def test_admin_thumbnail_analysis_skips_failed_without_force(client, monkeypatch):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    analyzed_ids: list[str] = []

    def fake_analyze_thumbnail_url(thumbnail_url, *, known_members):
        analyzed_ids.append(thumbnail_url.rsplit("/", 2)[-2])
        return {
            "status": "analyzed",
            "person_count": 1,
            "detected_members": ["Woni"],
            "confidence": 0.7,
            "error": "",
            "model": "test-vision",
        }

    monkeypatch.setattr(
        "app.services.thumbnail_analysis.analyze_thumbnail_url",
        fake_analyze_thumbnail_url,
    )
    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="keyword_search",
            source_value="thumbnail failed skip",
            title="thumbnail failed skip source",
        )
        failed = YoutubeVideo(
            id="thumb-analysis-failed",
            title="RESCENE failed thumbnail",
            description="이미 실패한 썸네일",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 11, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/thumb-analysis-failed/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=thumb-analysis-failed",
            view_count=100,
            content_hash="thumb-analysis-failed-hash",
            thumbnail_analysis_status="failed",
        )
        pending = YoutubeVideo(
            id="thumb-analysis-pending",
            title="RESCENE pending thumbnail",
            description="아직 분석 전 썸네일",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 10, tzinfo=UTC),
            thumbnail_url="https://img.youtube.com/vi/thumb-analysis-pending/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=thumb-analysis-pending",
            view_count=100,
            content_hash="thumb-analysis-pending-hash",
        )
        db.add_all([source, failed, pending])
        db.flush()
        db.add_all(
            [
                YoutubeVideoSource(video_id=failed.id, source_id=source.id),
                YoutubeVideoSource(video_id=pending.id, source_id=source.id),
            ]
        )
        db.commit()

    response = client.post(
        "/admin/rag/thumbnail-analysis",
        json={"artist_id": 1, "limit": 10},
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["processed"] == 1
    assert analyzed_ids == ["thumb-analysis-pending"]
    with get_session_factory()() as db:
        assert db.get(YoutubeVideo, "thumb-analysis-failed").thumbnail_analysis_status == "failed"
        assert db.get(YoutubeVideo, "thumb-analysis-pending").thumbnail_analysis_status == "analyzed"


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
    assert "briefing_publish" not in publish_features

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


def test_briefing_preview_adds_rag_context_section_and_deduped_cards(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    with get_session_factory()() as db:
        admin = db.scalar(select(User).where(User.email == "admin@example.com"))
        recent_post = Post(
            category="후기",
            title="원이 무대 오늘 후기",
            content="오늘 원이 무대를 보고 남긴 최신 팬 게시글입니다.",
            author_id=admin.id,
            artist_id=1,
        )
        context_post = Post(
            category="정보",
            title="원이 무대 아카이브 정리",
            content="원이 무대 흐름과 직캠 자료를 정리한 과거 아카이브 글입니다.",
            author_id=admin.id,
            artist_id=1,
        )
        db.add_all([recent_post, context_post])
        db.flush()
        refresh_post_chunks(db, recent_post)
        refresh_post_chunks(db, context_post)
        db.commit()

    preview = client.post("/ai/briefing/preview", headers=admin_headers)

    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert "\n과거 맥락\n" in body["preview_markdown"]
    urls = [card["url"] for card in body["source_cards"]]
    assert len(urls) == len(set(urls))
    assert any(card["url"].startswith("/posts/") for card in body["source_cards"])


def test_briefing_rag_source_card_hides_embedding_metadata():
    from app.api.agent import _source_card_from_rag_source

    card = _source_card_from_rag_source(
        {
            "source_type": "youtube",
            "title": "항상 퀸의 마인드로 #리센느 #loveattack",
            "url": "https://www.youtube.com/watch?v=abc",
            "content": "\n".join(
                [
                    "title: 항상 퀸의 마인드로 #리센느 #loveattack",
                    "channel: 현실웃음",
                    "published_at: 2026-06-07T08:06:40+00:00",
                    "views: 2698",
                    "members: Woni",
                    "description: 리센느 무대 영상입니다.",
                ]
            ),
        }
    )

    assert card["description"] == "리센느 무대 영상입니다."
    assert "title:" not in card["description"]
    assert "channel:" not in card["description"]


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

    assert "briefing_preview" not in features
    assert "youtube_sync" not in features
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
