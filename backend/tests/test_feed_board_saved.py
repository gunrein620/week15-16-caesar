from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.core.db import get_session_factory
from app.models import ExternalUpdate, SavedItem
from tests.conftest import login, signup


def test_post_create_extracts_url_embeds_and_thumbnail(client, monkeypatch):
    monkeypatch.setattr(
        "app.services.embeds.resolve_link_preview",
        lambda url: {
            "title": "Article title",
            "description": "Article description",
            "thumbnail_url": "https://cdn.example.com/article.jpg",
        },
    )
    token = signup(client)
    headers = {"Authorization": f"Bearer {token}"}
    content = "\n".join(
        [
            "오늘 원이 영상이랑 사진 같이 봐.",
            "https://img.example.com/woni.jpg",
            "https://www.youtube.com/watch?v=ZZRcStcyalM",
            "https://news.example.com/rescene",
        ]
    )

    response = client.post(
        "/posts",
        json={
            "title": "원이 사진과 영상",
            "content": content,
            "artist_id": 1,
            "category": "영상",
            "tags": ["woni", "video"],
        },
        headers=headers,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["category"] == "영상"
    assert body["thumbnail_url"] == "https://img.example.com/woni.jpg"
    assert [embed["type"] for embed in body["embeds"]] == ["image", "youtube", "link"]
    assert body["embeds"][1]["thumbnail_url"].endswith("/ZZRcStcyalM/hqdefault.jpg")
    assert body["embeds"][2]["title"] == "Article title"

    listed = client.get("/posts").json()["items"][0]
    assert listed["thumbnail_url"] == "https://img.example.com/woni.jpg"
    assert listed["embeds"][0]["type"] == "image"


def test_updates_feed_reads_cached_naver_and_pages_with_cursor(client, monkeypatch):
    def fail_external(*args, **kwargs):
        raise AssertionError("GET /updates must not call Naver API")

    monkeypatch.setattr("app.services.updates.naver_news_search", fail_external, raising=False)
    monkeypatch.setattr("app.services.updates.naver_blog_search", fail_external, raising=False)
    now = datetime(2030, 6, 7, 12, tzinfo=UTC)
    with get_session_factory()() as db:
        for index in range(3):
            db.add(
                ExternalUpdate(
                    artist_id=1,
                    source_type="naver_news",
                    external_id=f"news-{index}",
                    title=f"RESCENE news {index}",
                    description="원이 기사",
                    url=f"https://news.example.com/{index}",
                    thumbnail_url=f"https://img.example.com/{index}.jpg",
                    source_label="Naver News",
                    published_at=now - timedelta(minutes=index),
                    content_hash=f"hash-{index}",
                    raw_payload={"index": index},
                )
            )
        db.commit()

    first = client.get("/artists/1/updates", params={"source": "naver", "limit": 2})
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["has_more"] is True
    assert body["next_cursor"]
    assert [item["title"] for item in body["items"]] == ["RESCENE news 0", "RESCENE news 1"]

    second = client.get(
        "/artists/1/updates",
        params={"source": "naver", "limit": 2, "cursor": body["next_cursor"]},
    )
    assert second.status_code == 200, second.text
    assert second.json()["has_more"] is False
    assert [item["title"] for item in second.json()["items"]] == ["RESCENE news 2"]


def test_admin_sync_updates_populates_naver_cache(client, monkeypatch):
    monkeypatch.setattr(
        "app.services.external_updates.naver_news_search",
        lambda query, display=5: [
            {
                "title": "<b>RESCENE</b> article",
                "description": "컴백 기사",
                "originallink": "https://news.example.com/rescene",
                "link": "https://search.naver.com/news",
                "pubDate": "Sat, 07 Jun 2030 12:00:00 +0900",
            }
        ],
    )
    monkeypatch.setattr("app.services.external_updates.naver_blog_search", lambda query, display=5: [])
    monkeypatch.setattr(
        "app.services.external_updates.resolve_link_preview",
        lambda url: {"thumbnail_url": "https://img.example.com/news.jpg"},
    )

    user_token = signup(client)
    assert (
        client.post("/artists/1/sync-updates", headers={"Authorization": f"Bearer {user_token}"}).status_code
        == 403
    )
    admin_token = login(client, "admin@example.com", "admin-password")
    response = client.post(
        "/artists/1/sync-updates",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["naver_created"] == 1
    cached = client.get("/artists/1/updates", params={"source": "naver"}).json()["items"]
    assert cached[0]["title"] == "RESCENE article"
    assert cached[0]["thumbnail_url"] == "https://img.example.com/news.jpg"


def test_saved_items_are_user_scoped_and_deduplicated(client):
    first_token = signup(client, "first@example.com")
    second_token = signup(client, "second@example.com")
    payload = {
        "item_type": "youtube",
        "item_key": "youtube:abc",
        "title": "Saved video",
        "url": "https://youtube.com/watch?v=abc",
        "thumbnail_url": "https://img.youtube.com/vi/abc/hqdefault.jpg",
        "source_label": "YouTube",
    }

    first = client.post("/saved-items", json=payload, headers={"Authorization": f"Bearer {first_token}"})
    duplicate = client.post(
        "/saved-items",
        json=payload,
        headers={"Authorization": f"Bearer {first_token}"},
    )
    second = client.post(
        "/saved-items",
        json=payload,
        headers={"Authorization": f"Bearer {second_token}"},
    )

    assert first.status_code == 201, first.text
    assert duplicate.status_code == 200, duplicate.text
    assert duplicate.json()["id"] == first.json()["id"]
    assert second.status_code == 201, second.text
    assert len(client.get("/saved-items", headers={"Authorization": f"Bearer {first_token}"}).json()) == 1
    assert len(client.get("/saved-items", headers={"Authorization": f"Bearer {second_token}"}).json()) == 1

    deleted = client.delete(
        f"/saved-items/{first.json()['id']}",
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert deleted.status_code == 204
    with get_session_factory()() as db:
        assert db.scalar(select(func.count(SavedItem.id))) == 1
