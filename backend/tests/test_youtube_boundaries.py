import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.config import reset_settings_cache
from app.core.db import get_session_factory
from app.models import RagChunk, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.youtube import advisory_lock, fetch_source_videos
from tests.conftest import login


def test_get_videos_reads_cache_without_youtube_key(client):
    response = client.get("/artists/1/videos")
    assert response.status_code == 200
    assert response.json() == []


def test_admin_sync_gracefully_errors_without_youtube_key(client):
    token = login(client, "admin@example.com", "admin-password")
    response = client.post("/artists/1/sync", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 503
    assert "YOUTUBE_API_KEY" in response.json()["detail"]


def test_source_create_rejects_blank_shape_values(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}

    blank_value = client.post(
        "/artists/1/youtube-sources",
        json={"source_type": "official_channel", "source_value": "   ", "title": "official"},
        headers=headers,
    )
    assert blank_value.status_code == 422

    blank_title = client.post(
        "/artists/1/youtube-sources",
        json={"source_type": "official_channel", "source_value": "channel", "title": "   "},
        headers=headers,
    )
    assert blank_title.status_code == 422


def test_source_db_constraint_rejects_invalid_source_type(client):
    with get_session_factory()() as db:
        db.add(
            YoutubeSource(
                artist_id=1,
                source_type="invalid",
                source_value="channel",
                title="invalid",
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_sync_handles_each_source_type_and_get_videos_is_cache_only(client, monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    reset_settings_cache()
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}

    for source_type in ["official_channel", "fan_channel", "curated_video"]:
        created = client.post(
            "/artists/1/youtube-sources",
            json={
                "source_type": source_type,
                "source_value": f"{source_type}-id",
                "title": source_type,
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text

    def fake_fetch(source: YoutubeSource, max_results: int = 10):
        keyword = "RESCENE" if source.source_type == "fan_channel" else ""
        return [
            {
                "id": f"video-{source.source_type}",
                "title": f"{source.source_type} {keyword} title",
                "description": f"{source.source_type} description",
                "channel_title": "RESCENE test",
                "published_at": "2026-06-06T00:00:00Z",
                "thumbnail_url": "",
                "url": f"https://www.youtube.com/watch?v=video-{source.source_type}",
            }
        ]

    monkeypatch.setattr("app.services.youtube.fetch_source_videos", fake_fetch)

    synced = client.post("/artists/1/sync", headers=headers)
    assert synced.status_code == 200, synced.text
    assert synced.json()["created"] == 3
    assert synced.json()["linked"] == 3

    def fail_if_called(source: YoutubeSource, max_results: int = 10):
        raise AssertionError("GET /videos must not call external fetch")

    monkeypatch.setattr("app.services.youtube.fetch_source_videos", fail_if_called)
    videos = client.get("/artists/1/videos")
    assert videos.status_code == 200
    assert {item["id"] for item in videos.json()} == {
        "video-official_channel",
        "video-fan_channel",
        "video-curated_video",
    }
    assert all(item["published_at"] is not None for item in videos.json())

    with get_session_factory()() as db:
        link_count = db.scalar(select(func.count()).select_from(YoutubeVideoSource))
        chunk_count = db.scalar(select(func.count()).select_from(RagChunk))
    assert link_count == 3
    assert chunk_count >= 3


def test_sync_skips_reembedding_when_content_hash_is_unchanged(client, monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    reset_settings_cache()
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}
    client.post(
        "/artists/1/youtube-sources",
        json={"source_type": "curated_video", "source_value": "video-id", "title": "curated"},
        headers=headers,
    )

    call_count = 0

    def fake_fetch(source: YoutubeSource, max_results: int = 10):
        nonlocal call_count
        call_count += 1
        return [
            {
                "id": "same-video",
                "title": "Stable title",
                "description": "Stable description",
                "channel_title": "RESCENE test",
                "published_at": "2026-06-06T00:00:00Z",
                "thumbnail_url": "",
                "url": "https://www.youtube.com/watch?v=same-video",
                "view_count": 100 + call_count,
                "like_count": 10,
                "comment_count": 5,
            }
        ]

    monkeypatch.setattr("app.services.youtube.fetch_source_videos", fake_fetch)
    first = client.post("/artists/1/sync", headers=headers)
    assert first.status_code == 200
    with get_session_factory()() as db:
        first_chunk_count = db.scalar(select(func.count()).select_from(RagChunk))
        for source in db.scalars(select(YoutubeSource)).all():
            source.last_synced_at = None
        db.commit()

    second = client.post("/artists/1/sync", headers=headers)
    assert second.status_code == 200
    assert second.json()["created"] == 0
    assert second.json()["updated"] == 0
    with get_session_factory()() as db:
        second_chunk_count = db.scalar(select(func.count()).select_from(RagChunk))
        video = db.get(YoutubeVideo, "same-video")
    assert second_chunk_count == first_chunk_count
    assert video is not None
    assert video.view_count == 102


def test_advisory_lock_uses_one_connection_for_lock_and_unlock(monkeypatch):
    class ScalarResult:
        def __init__(self, value: bool):
            self.value = value

        def scalar_one(self):
            return self.value

    class FakeSession:
        def __init__(self):
            self.statements: list[str] = []

        def execute(self, statement, params):
            self.statements.append(str(statement))
            return ScalarResult(True)

    fake = FakeSession()
    monkeypatch.setattr("app.services.youtube.is_postgres", lambda: True)

    with advisory_lock(fake, 123) as acquired:
        assert acquired is True

    assert len(fake.statements) == 2
    assert "pg_try_advisory_lock" in fake.statements[0]
    assert "pg_advisory_unlock" in fake.statements[1]


def test_fan_channel_requires_artist_keyword_match(client, monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    reset_settings_cache()
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}

    created = client.post(
        "/artists/1/youtube-sources",
        json={"source_type": "fan_channel", "source_value": "fan-channel", "title": "fan"},
        headers=headers,
    )
    assert created.status_code == 201, created.text

    def fake_fetch(source: YoutubeSource, max_results: int = 10):
        return [
            {
                "id": "fan-match",
                "title": "RESCENE stage reaction",
                "description": "keyword matched fan upload",
                "channel_title": "fan",
                "published_at": "2026-06-06T00:00:00Z",
                "thumbnail_url": "",
                "url": "https://www.youtube.com/watch?v=fan-match",
            },
            {
                "id": "fan-miss",
                "title": "unrelated stage reaction",
                "description": "no artist keyword here",
                "channel_title": "fan",
                "published_at": "2026-06-06T00:00:00Z",
                "thumbnail_url": "",
                "url": "https://www.youtube.com/watch?v=fan-miss",
            },
        ]

    monkeypatch.setattr("app.services.youtube.fetch_source_videos", fake_fetch)

    synced = client.post("/artists/1/sync", headers=headers)
    assert synced.status_code == 200, synced.text
    assert synced.json()["created"] == 1

    with get_session_factory()() as db:
        assert db.get(YoutubeVideo, "fan-match") is not None
        assert db.get(YoutubeVideo, "fan-miss") is None


def test_same_video_from_multiple_sources_accumulates_source_links(client, monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    reset_settings_cache()
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}

    for source_type in ["official_channel", "curated_video"]:
        response = client.post(
            "/artists/1/youtube-sources",
            json={
                "source_type": source_type,
                "source_value": f"{source_type}-id",
                "title": source_type,
            },
            headers=headers,
        )
        assert response.status_code == 201, response.text

    def fake_fetch(source: YoutubeSource, max_results: int = 10):
        return [
            {
                "id": "shared-video",
                "title": "Shared RESCENE video",
                "description": "same video from two source definitions",
                "channel_title": "RESCENE",
                "published_at": "2026-06-06T00:00:00Z",
                "thumbnail_url": "",
                "url": "https://www.youtube.com/watch?v=shared-video",
            }
        ]

    monkeypatch.setattr("app.services.youtube.fetch_source_videos", fake_fetch)

    synced = client.post("/artists/1/sync", headers=headers)
    assert synced.status_code == 200, synced.text
    assert synced.json()["created"] == 1
    assert synced.json()["linked"] == 2

    with get_session_factory()() as db:
        video_count = db.scalar(select(func.count()).select_from(YoutubeVideo))
        link_count = db.scalar(select(func.count()).select_from(YoutubeVideoSource))
    assert video_count == 1
    assert link_count == 2


def test_channel_sources_resolve_playlist_then_fetch_video_details(monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    reset_settings_cache()
    calls: list[tuple[str, dict]] = []

    def fake_youtube_get(path: str, params: dict):
        calls.append((path, params))
        if path == "channels":
            return {
                "items": [
                    {
                        "contentDetails": {
                            "relatedPlaylists": {
                                "uploads": "UUuploads",
                            }
                        }
                    }
                ]
            }
        if path == "playlistItems":
            return {
                "items": [
                    {"snippet": {"resourceId": {"videoId": "video-a"}}},
                    {"snippet": {"resourceId": {"videoId": "video-b"}}},
                ]
            }
        if path == "videos":
            return {
                "items": [
                    {
                        "id": "video-a",
                        "snippet": {
                            "title": "RESCENE A",
                            "description": "first",
                            "channelTitle": "Official",
                            "publishedAt": "2026-06-06T00:00:00Z",
                            "thumbnails": {"default": {"url": "thumb-a"}},
                        },
                        "statistics": {"viewCount": "100", "likeCount": "10", "commentCount": "1"},
                    },
                    {
                        "id": "video-b",
                        "snippet": {
                            "title": "RESCENE B",
                            "description": "second",
                            "channelTitle": "Official",
                            "publishedAt": "2026-06-06T00:00:00Z",
                            "thumbnails": {"default": {"url": "thumb-b"}},
                        },
                        "statistics": {"viewCount": "200", "likeCount": "20", "commentCount": "2"},
                    },
                ]
            }
        raise AssertionError(path)

    monkeypatch.setattr("app.services.youtube._youtube_get", fake_youtube_get)
    source = YoutubeSource(
        artist_id=1,
        source_type="official_channel",
        source_value="channel-id",
        title="official",
    )

    videos = fetch_source_videos(source, max_results=2)

    assert [path for path, _ in calls] == ["channels", "playlistItems", "videos"]
    assert calls[2][1]["part"] == "snippet,statistics"
    assert calls[2][1]["id"] == "video-a,video-b"
    assert videos[0]["view_count"] == 100
    assert videos[1]["like_count"] == 20


def test_curated_source_uses_videos_list_only(monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    reset_settings_cache()
    calls: list[tuple[str, dict]] = []

    def fake_youtube_get(path: str, params: dict):
        calls.append((path, params))
        assert path == "videos"
        return {
            "items": [
                {
                    "id": "curated-id",
                    "snippet": {
                        "title": "Curated RESCENE",
                        "description": "single video",
                        "channelTitle": "Curator",
                        "publishedAt": "2026-06-06T00:00:00Z",
                        "thumbnails": {},
                    },
                    "statistics": {"viewCount": "300"},
                }
            ]
        }

    monkeypatch.setattr("app.services.youtube._youtube_get", fake_youtube_get)
    source = YoutubeSource(
        artist_id=1,
        source_type="curated_video",
        source_value="curated-id",
        title="curated",
    )

    videos = fetch_source_videos(source)

    assert [path for path, _ in calls] == ["videos"]
    assert calls[0][1]["id"] == "curated-id"
    assert videos[0]["view_count"] == 300
