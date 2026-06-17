from datetime import UTC, date, datetime

from sqlalchemy import func, select

from app.core.db import get_session_factory
from app.models import AgentRun, RagChunk, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.rag import refresh_video_chunks
from app.services.search_index import upsert_youtube_video_search_item
from tests.conftest import login, signup


def _create_official_video(
    video_id: str,
    *,
    title: str,
    with_chunks: bool = True,
) -> int:
    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="official_channel",
            source_value=f"official-{video_id}",
            title="RESCENE Official",
        )
        video = YoutubeVideo(
            id=video_id,
            title=title,
            description="Official RESCENE update",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 16, 2, 0, tzinfo=UTC),
            thumbnail_url=f"https://img.example.com/{video_id}.jpg",
            url=f"https://youtube.example.com/{video_id}",
            view_count=100,
            content_hash=f"{video_id}-hash",
        )
        db.add_all([source, video])
        db.flush()
        db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))
        db.flush()
        if with_chunks:
            refresh_video_chunks(db, video, artist_id=1)
        item = upsert_youtube_video_search_item(db, video, artist_id=1)
        search_item_id = item.id
        db.commit()
        return search_item_id


def test_subscriptions_generate_deduplicated_notifications_from_search_items(client):
    token = signup(client, "subscription@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    search_item_id = _create_official_video(
        "subscription-official-woni",
        title="RESCENE Woni official behind",
    )

    create_response = client.post(
        "/subscriptions",
        json={
            "artist_id": 1,
            "name": "Woni official videos",
            "content_types": ["youtube"],
            "source_types": ["official_channel"],
            "member_names": ["Woni"],
        },
        headers=headers,
    )
    assert create_response.status_code == 201, create_response.text

    from app.services.product_workflows import generate_subscription_notifications

    with get_session_factory()() as db:
        first = generate_subscription_notifications(db, artist_id=1)
        second = generate_subscription_notifications(db, artist_id=1)
        db.commit()

    assert first["created"] == 1
    assert second["created"] == 0

    list_response = client.get("/notifications?unread_only=true", headers=headers)
    assert list_response.status_code == 200, list_response.text
    notifications = list_response.json()
    assert len(notifications) == 1
    assert notifications[0]["search_item_id"] == search_item_id
    assert notifications[0]["title"] == "RESCENE Woni official behind"

    read_response = client.post(f"/notifications/{notifications[0]['id']}/read", headers=headers)
    assert read_response.status_code == 200, read_response.text
    assert read_response.json()["read_at"] is not None


def test_collections_store_search_items_and_summarize_without_duplicate_items(client):
    token = signup(client, "collection@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    search_item_id = _create_official_video(
        "collection-love-attack",
        title="RESCENE Love Attack stage",
    )

    collection_response = client.post(
        "/collections",
        json={"artist_id": 1, "title": "Stage queue", "description": "Videos to rewatch"},
        headers=headers,
    )
    assert collection_response.status_code == 201, collection_response.text
    collection_id = collection_response.json()["id"]

    first_add = client.post(
        f"/collections/{collection_id}/items",
        json={"search_item_id": search_item_id, "note": "공식 무대"},
        headers=headers,
    )
    duplicate_add = client.post(
        f"/collections/{collection_id}/items",
        json={"search_item_id": search_item_id, "note": "중복 추가"},
        headers=headers,
    )
    assert first_add.status_code == 201, first_add.text
    assert duplicate_add.status_code == 200, duplicate_add.text

    detail_response = client.get(f"/collections/{collection_id}", headers=headers)
    assert detail_response.status_code == 200, detail_response.text
    detail = detail_response.json()
    assert detail["title"] == "Stage queue"
    assert len(detail["items"]) == 1
    assert detail["items"][0]["search_item_id"] == search_item_id

    summary_response = client.post(f"/collections/{collection_id}/summary", headers=headers)
    assert summary_response.status_code == 200, summary_response.text
    summary = summary_response.json()["ai_summary"]
    assert "RESCENE Love Attack stage" in summary


def test_admin_data_quality_queue_builds_embedding_tasks_for_unindexed_items(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}
    search_item_id = _create_official_video(
        "quality-missing-chunks",
        title="RESCENE data quality target",
        with_chunks=False,
    )

    build_response = client.post("/admin/data-quality/tasks/build?artist_id=1", headers=headers)
    assert build_response.status_code == 200, build_response.text
    assert build_response.json()["created"] >= 1

    list_response = client.get("/admin/data-quality/tasks?artist_id=1", headers=headers)
    assert list_response.status_code == 200, list_response.text
    tasks = list_response.json()
    embedding_task = next(
        task
        for task in tasks
        if task["search_item_id"] == search_item_id and task["task_type"] == "embedding_missing"
    )
    assert embedding_task["status"] == "pending"

    run_response = client.post(f"/admin/data-quality/tasks/{embedding_task['id']}/run", headers=headers)
    assert run_response.status_code == 200, run_response.text
    assert run_response.json()["status"] == "resolved"

    with get_session_factory()() as db:
        chunk_count = db.scalar(
            select(func.count())
            .select_from(RagChunk)
            .where(RagChunk.search_item_id == search_item_id)
        )
    assert chunk_count == 1


def test_admin_auto_briefing_creates_one_daily_draft(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}

    first = client.post("/admin/briefing/auto-drafts/run?artist_id=1", headers=headers)
    second = client.post("/admin/briefing/auto-drafts/run?artist_id=1", headers=headers)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["created"] is True
    assert second.json()["created"] is False
    assert first.json()["run"]["status"] == "auto_draft"
    briefing_date = date.fromisoformat(first.json()["run"]["briefing_date"])

    with get_session_factory()() as db:
        draft_count = db.scalar(
            select(func.count())
            .select_from(AgentRun)
            .where(
                AgentRun.artist_id == 1,
                AgentRun.briefing_type == "daily",
                AgentRun.briefing_date == briefing_date,
                AgentRun.status == "auto_draft",
            )
        )
    assert draft_count == 1


def test_writing_assist_returns_catalog_suggestions(client):
    token = signup(client, "writing-product@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    _create_official_video(
        "writing-product-woni-love-attack",
        title="RESCENE Woni Love Attack practice",
    )

    response = client.post(
        "/ai/writing-assist",
        json={
            "artist_id": 1,
            "category": "영상",
            "title": "Woni Love Attack 글",
            "content": "Woni Love Attack 연습 영상으로 글을 쓰고 싶어요.",
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert "Woni" in body["suggested_members"]
    assert any(term["title"] == "Love Attack" for term in body["suggested_archive_terms"])
    assert body["suggested_collection_targets"]
