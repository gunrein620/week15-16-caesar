from datetime import UTC, datetime, timedelta

from app.core.db import get_session_factory
from app.models import AiUsageCounter, AnalyticsEvent, Comment, Post, SavedItem, User
from tests.conftest import login, signup


def test_analytics_event_collection_is_anonymous_and_links_logged_in_user(client):
    token = signup(client)
    headers = {"Authorization": f"Bearer {token}"}

    anonymous = client.post(
        "/analytics/events",
        json={
            "events": [
                {
                    "event_name": "app_open",
                    "anonymous_session_id": "anon-session-1",
                    "path": "/",
                    "panel": "home",
                    "source": "frontend",
                    "metadata": {
                        "email": "private@example.com",
                        "token": "secret-token",
                        "query": "러브어택 무대 영상",
                    },
                }
            ]
        },
    )
    logged_in = client.post(
        "/analytics/events",
        json={
            "event_name": "archive_search_submit",
            "anonymous_session_id": "anon-session-1",
            "path": "/",
            "panel": "rag",
            "metadata": {"query": "원이 최근 영상"},
        },
        headers=headers,
    )

    assert anonymous.status_code == 201, anonymous.text
    assert anonymous.json()["accepted"] == 1
    assert logged_in.status_code == 201, logged_in.text

    with get_session_factory()() as db:
        events = db.query(AnalyticsEvent).order_by(AnalyticsEvent.id).all()
        user = db.query(User).filter(User.email == "user@example.com").one()

    assert len(events) == 2
    assert events[0].user_id is None
    assert events[1].user_id == user.id
    assert events[0].metadata_json == {"query": "러브어택 무대 영상"}
    assert "private@example.com" not in str(events[0].metadata_json)
    assert "secret-token" not in str(events[0].metadata_json)


def test_analytics_rejects_bad_event_name_large_payload_and_large_batch(client):
    base_event = {
        "event_name": "app_open",
        "anonymous_session_id": "anon-session-2",
        "path": "/",
        "metadata": {},
    }

    bad_name = client.post(
        "/analytics/events",
        json={**base_event, "event_name": "unknown_event"},
    )
    large_query = client.post(
        "/analytics/events",
        json={**base_event, "metadata": {"query": "가" * 121}},
    )
    large_batch = client.post(
        "/analytics/events",
        json={"events": [base_event for _ in range(21)]},
    )

    assert bad_name.status_code == 422
    assert large_query.status_code == 422
    assert large_batch.status_code == 422


def test_admin_analytics_summary_counts_visitors_and_operational_activity(client):
    user_token = signup(client)
    admin_token = login(client, "admin@example.com", "admin-password")
    user_headers = {"Authorization": f"Bearer {user_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    client.post(
        "/analytics/events",
        json={"event_name": "app_open", "anonymous_session_id": "anon-a", "path": "/"},
    )
    client.post(
        "/analytics/events",
        json={
            "event_name": "archive_search_submit",
            "anonymous_session_id": "anon-a",
            "path": "/",
            "panel": "rag",
            "metadata": {"query": "러브어택"},
        },
        headers=user_headers,
    )
    client.post(
        "/analytics/events",
        json={
            "event_name": "feed_card_open",
            "anonymous_session_id": "anon-b",
            "path": "/",
            "panel": "home",
            "metadata": {"title": "Love Attack", "item_type": "youtube", "item_key": "yt-1"},
        },
    )

    with get_session_factory()() as db:
        user = db.query(User).filter(User.email == "user@example.com").one()
        db.add(
            AiUsageCounter(
                scope="user",
                scope_id=str(user.id),
                feature="qa",
                day=datetime.now(UTC).date(),
                count=2,
            )
        )
        post = Post(title="팬글", content="내용", author_id=user.id, artist_id=1)
        db.add(post)
        db.flush()
        db.add(Comment(post_id=post.id, author_id=user.id, content="댓글"))
        db.add(
            SavedItem(
                user_id=user.id,
                item_type="youtube",
                item_key="yt-1",
                title="Love Attack",
            )
        )
        old_event = AnalyticsEvent(
            event_name="app_open",
            anonymous_session_id="old-session",
            path="/",
            created_at=datetime.now(UTC) - timedelta(days=10),
        )
        db.add(old_event)
        db.commit()

    forbidden = client.get("/admin/analytics/summary?days=7", headers=user_headers)
    summary = client.get("/admin/analytics/summary?days=7", headers=admin_headers)

    assert forbidden.status_code == 403
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["days"] == 7
    assert body["visitors"] == 2
    assert body["logged_in_users"] == 1
    assert body["events"] == 3
    assert body["searches"] == 1
    assert body["saves"] == 1
    assert body["posts"] >= 1
    assert body["comments"] == 1
    assert body["ai_questions"] == 2
    assert body["popular_queries"][0]["query"] == "러브어택"
    assert body["popular_cards"][0]["title"] == "Love Attack"


def test_admin_analytics_recent_events_and_cleanup(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    client.post(
        "/analytics/events",
        json={"event_name": "panel_view", "anonymous_session_id": "anon-c", "path": "/", "panel": "home"},
    )
    with get_session_factory()() as db:
        db.add(
            AnalyticsEvent(
                event_name="app_open",
                anonymous_session_id="old-cleanup",
                path="/",
                created_at=datetime.now(UTC) - timedelta(days=100),
            )
        )
        db.commit()

    events = client.get("/admin/analytics/events?days=7&event_name=panel_view", headers=admin_headers)
    cleanup = client.post("/admin/analytics/cleanup", headers=admin_headers)

    assert events.status_code == 200, events.text
    assert len(events.json()) == 1
    assert events.json()[0]["event_name"] == "panel_view"
    assert cleanup.status_code == 200, cleanup.text
    assert cleanup.json()["deleted"] == 1
