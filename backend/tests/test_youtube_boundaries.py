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

    source_types = [
        "official_channel",
        "member_channel",
        "fan_channel",
        "curated_video",
        "keyword_search",
    ]
    for source_type in source_types:
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
    assert synced.json()["created"] == len(source_types)
    assert synced.json()["linked"] == len(source_types)

    def fail_if_called(source: YoutubeSource, max_results: int = 10):
        raise AssertionError("GET /videos must not call external fetch")

    monkeypatch.setattr("app.services.youtube.fetch_source_videos", fail_if_called)
    videos = client.get("/artists/1/videos")
    assert videos.status_code == 200
    assert {item["id"] for item in videos.json()} == {
        "video-official_channel",
        "video-member_channel",
        "video-fan_channel",
        "video-curated_video",
        "video-keyword_search",
    }
    assert all(item["published_at"] is not None for item in videos.json())

    with get_session_factory()() as db:
        link_count = db.scalar(select(func.count()).select_from(YoutubeVideoSource))
        chunk_count = db.scalar(select(func.count()).select_from(RagChunk))
    assert link_count == len(source_types)
    assert chunk_count >= len(source_types)


def test_get_videos_deduplicates_video_linked_to_multiple_sources(client):
    with get_session_factory()() as db:
        first_source = YoutubeSource(
            artist_id=1,
            source_type="official_channel",
            source_value="official",
            title="official",
        )
        second_source = YoutubeSource(
            artist_id=1,
            source_type="fan_channel",
            source_value="fan",
            title="fan",
        )
        video = YoutubeVideo(
            id="shared-video",
            title="Shared video",
            description="same video from two sources",
            channel_title="RESCENE",
            published_at=None,
            thumbnail_url="",
            url="https://www.youtube.com/watch?v=shared-video",
            view_count=100,
            content_hash="shared-video-hash",
        )
        db.add_all([first_source, second_source, video])
        db.flush()
        db.add_all(
            [
                YoutubeVideoSource(video_id=video.id, source_id=first_source.id),
                YoutubeVideoSource(video_id=video.id, source_id=second_source.id),
            ]
        )
        db.commit()

    videos = client.get("/artists/1/videos")

    assert videos.status_code == 200, videos.text
    assert [item["id"] for item in videos.json()] == ["shared-video"]


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


def test_channel_source_accepts_youtube_handle_url(monkeypatch):
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
                                "uploads": "UUwoniuploads",
                            }
                        }
                    }
                ]
            }
        if path == "playlistItems":
            return {"items": [{"snippet": {"resourceId": {"videoId": "woni-video"}}}]}
        if path == "videos":
            return {
                "items": [
                    {
                        "id": "woni-video",
                        "snippet": {
                            "title": "원이 개인 채널 업데이트",
                            "description": "RESCENE Woni",
                            "channelTitle": "안녕하세요원이입니다잘부탁드립니다",
                            "publishedAt": "2026-06-06T00:00:00Z",
                            "thumbnails": {"high": {"url": "thumb"}},
                        },
                        "statistics": {"viewCount": "1000"},
                    }
                ]
            }
        raise AssertionError(path)

    monkeypatch.setattr("app.services.youtube._youtube_get", fake_youtube_get)
    source = YoutubeSource(
        artist_id=1,
        source_type="member_channel",
        source_value="https://www.youtube.com/@helloiamwoninicetomeetyou",
        title="원이 개인 채널",
    )

    videos = fetch_source_videos(source, max_results=1)

    assert [path for path, _ in calls] == ["channels", "playlistItems", "videos"]
    assert calls[0][1]["forHandle"] == "helloiamwoninicetomeetyou"
    assert "id" not in calls[0][1]
    assert videos[0]["id"] == "woni-video"


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


def test_keyword_search_source_searches_then_fetches_video_details(monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    reset_settings_cache()
    calls: list[tuple[str, dict]] = []

    def fake_youtube_get(path: str, params: dict):
        calls.append((path, params))
        if path == "search":
            return {
                "items": [
                    {"id": {"videoId": "search-video-a"}},
                    {"id": {"videoId": "search-video-b"}},
                ]
            }
        if path == "videos":
            return {
                "items": [
                    {
                        "id": "search-video-a",
                        "snippet": {
                            "title": "원이 브이로그",
                            "description": "RESCENE Woni update",
                            "channelTitle": "안녕하세요원이입니다잘부탁드립니다",
                            "publishedAt": "2026-06-06T00:00:00Z",
                            "thumbnails": {"high": {"url": "thumb-a"}},
                        },
                        "statistics": {"viewCount": "300"},
                    },
                    {
                        "id": "search-video-b",
                        "snippet": {
                            "title": "리센느 원이 쇼츠",
                            "description": "RESCENE Woni short",
                            "channelTitle": "fan",
                            "publishedAt": "2026-06-05T00:00:00Z",
                            "thumbnails": {"medium": {"url": "thumb-b"}},
                        },
                        "statistics": {"viewCount": "200"},
                    },
                ]
            }
        raise AssertionError(path)

    monkeypatch.setattr("app.services.youtube._youtube_get", fake_youtube_get)
    source = YoutubeSource(
        artist_id=1,
        source_type="keyword_search",
        source_value="리센느 원이",
        title="원이 키워드 검색",
    )

    videos = fetch_source_videos(source, max_results=2)

    assert [path for path, _ in calls] == ["search", "videos"]
    assert calls[0][1]["part"] == "snippet"
    assert calls[0][1]["type"] == "video"
    assert calls[0][1]["q"] == "리센느 원이"
    assert calls[0][1]["order"] == "date"
    assert calls[1][1]["id"] == "search-video-a,search-video-b"
    assert [video["id"] for video in videos] == ["search-video-a", "search-video-b"]


def test_backfill_channel_sources_pages_until_debut_cutoff(client, monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    reset_settings_cache()
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}
    created = client.post(
        "/artists/1/youtube-sources",
        json={"source_type": "official_channel", "source_value": "channel-id", "title": "official"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    source_id = created.json()["id"]
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
            if params.get("pageToken") == "older":
                return {
                    "items": [
                        {"snippet": {"resourceId": {"videoId": "predebut-video"}}},
                    ],
                    "nextPageToken": "should-stop",
                }
            return {
                "items": [
                    {"snippet": {"resourceId": {"videoId": "debut-video"}}},
                ],
                "nextPageToken": "older",
            }
        if path == "videos":
            if params["id"] == "debut-video":
                return {
                    "items": [
                        {
                            "id": "debut-video",
                            "snippet": {
                                "title": "RESCENE debut day",
                                "description": "debut content",
                                "channelTitle": "RESCENE",
                                "publishedAt": "2024-03-26T09:00:00Z",
                                "thumbnails": {"high": {"url": "thumb"}},
                            },
                            "statistics": {"viewCount": "100"},
                        }
                    ]
                }
            return {
                "items": [
                    {
                        "id": "predebut-video",
                        "snippet": {
                            "title": "pre debut",
                            "description": "before debut cutoff",
                            "channelTitle": "RESCENE",
                            "publishedAt": "2024-03-25T14:59:00Z",
                            "thumbnails": {"high": {"url": "old-thumb"}},
                        },
                        "statistics": {"viewCount": "50"},
                    }
                ]
            }
        raise AssertionError(path)

    monkeypatch.setattr("app.services.youtube._youtube_get", fake_youtube_get)

    response = client.post(
        "/artists/1/youtube-backfill",
        json={"source_id": source_id, "pages_per_source": 5, "reset": True},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["created"] == 1
    assert response.json()["pages_fetched"] == 2
    assert response.json()["sources_completed"] == 1
    assert response.json()["has_more"] is False
    playlist_calls = [params for path, params in calls if path == "playlistItems"]
    assert playlist_calls[0].get("pageToken") is None
    assert playlist_calls[1]["pageToken"] == "older"
    with get_session_factory()() as db:
        source = db.get(YoutubeSource, source_id)
        assert source is not None
        assert source.backfill_status == "completed"
        assert source.backfill_cursor is None
        assert source.last_synced_at is None
        assert db.get(YoutubeVideo, "debut-video") is not None
        assert db.get(YoutubeVideo, "predebut-video") is None


def test_backfill_resumes_from_saved_cursor(client, monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "test-key")
    reset_settings_cache()
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}
    created = client.post(
        "/artists/1/youtube-sources",
        json={"source_type": "member_channel", "source_value": "channel-id", "title": "member"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    source_id = created.json()["id"]
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
            if params.get("pageToken") == "page-2":
                return {"items": [{"snippet": {"resourceId": {"videoId": "video-b"}}}]}
            return {
                "items": [{"snippet": {"resourceId": {"videoId": "video-a"}}}],
                "nextPageToken": "page-2",
            }
        if path == "videos":
            video_id = params["id"]
            return {
                "items": [
                    {
                        "id": video_id,
                        "snippet": {
                            "title": f"RESCENE {video_id}",
                            "description": "backfill page",
                            "channelTitle": "member",
                            "publishedAt": "2024-04-01T00:00:00Z",
                            "thumbnails": {},
                        },
                        "statistics": {"viewCount": "10"},
                    }
                ]
            }
        raise AssertionError(path)

    monkeypatch.setattr("app.services.youtube._youtube_get", fake_youtube_get)

    first = client.post(
        "/artists/1/youtube-backfill",
        json={"source_id": source_id, "pages_per_source": 1, "reset": True},
        headers=headers,
    )
    second = client.post(
        "/artists/1/youtube-backfill",
        json={"source_id": source_id, "pages_per_source": 1},
        headers=headers,
    )

    assert first.status_code == 200, first.text
    assert first.json()["has_more"] is True
    assert second.status_code == 200, second.text
    assert second.json()["has_more"] is False
    playlist_calls = [params for path, params in calls if path == "playlistItems"]
    assert playlist_calls[0].get("pageToken") is None
    assert playlist_calls[1]["pageToken"] == "page-2"
    with get_session_factory()() as db:
        source = db.get(YoutubeSource, source_id)
        assert source is not None
        assert source.backfill_status == "completed"
        assert {video.id for video in db.scalars(select(YoutubeVideo)).all()} >= {
            "video-a",
            "video-b",
        }
