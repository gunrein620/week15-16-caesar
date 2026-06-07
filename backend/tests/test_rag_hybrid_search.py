from datetime import UTC, datetime, timedelta

from app.core.db import get_session_factory
from app.models import YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.rag import refresh_video_chunks
from tests.conftest import signup


def test_parse_temporal_update_intent(client):
    from app.services.search_intent import parse_search_intent

    intent = parse_search_intent("오늘 리센느 새 소식 찾아줘", artist_id=1)

    assert intent.temporal == "today"
    assert intent.route == "updates"
    assert intent.media_type is None


def test_parse_archive_song_video_intent(client):
    from app.services.search_intent import parse_search_intent

    intent = parse_search_intent("러브어택 무대 영상 찾아줘", artist_id=1)

    assert intent.temporal is None
    assert intent.route == "archive"
    assert intent.media_type == "youtube"
    assert any("loveattack" in group.aliases for group in intent.archive_terms)


def test_parse_song_summary_stays_archive_intent(client):
    from app.services.search_intent import parse_search_intent

    intent = parse_search_intent("러브어택 요약해줘", artist_id=1)

    assert intent.route == "archive"
    assert intent.temporal is None
    assert any("loveattack" in group.aliases for group in intent.archive_terms)


def test_archive_search_prefers_song_title_match_over_description_only(client):
    from app.services.archive_search import search_archive_candidates

    with get_session_factory()() as db:
        title_match = YoutubeVideo(
            id="love-title",
            title="RESCENE LOVE ATTACK Dance Practice",
            description="리센느 무대 영상",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/love-title/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=love-title",
            view_count=100,
            like_count=10,
            comment_count=1,
            content_hash="love-title-hash",
        )
        description_only = YoutubeVideo(
            id="deja-description",
            title="RESCENE Deja Vu Stage",
            description="타임스탬프에 Love Attack 이야기가 짧게 포함됩니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/deja-description/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=deja-description",
            view_count=1000,
            like_count=100,
            comment_count=10,
            content_hash="deja-description-hash",
        )
        db.add_all([title_match, description_only])
        db.flush()
        refresh_video_chunks(db, title_match, artist_id=1)
        refresh_video_chunks(db, description_only, artist_id=1)
        db.commit()

        candidates = search_archive_candidates(db, "러브어택 영상 찾아줘", artist_id=1, limit=5)

    assert candidates
    assert candidates[0].youtube_video_id == "love-title"
    assert "deja-description" not in [candidate.youtube_video_id for candidate in candidates]


def test_today_query_uses_recent_update_sources_not_old_vector_match(client):
    token = signup(client, "today-routing@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    now = datetime.now(UTC)

    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="official_channel",
            source_value="UU-test",
            title="RESCENE official",
        )
        recent = YoutubeVideo(
            id="today-video",
            title="RESCENE today update",
            description="오늘 올라온 리센느 새 소식입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/today-video/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=today-video",
            published_at=now,
            view_count=100,
            like_count=10,
            comment_count=1,
            content_hash="today-video-hash",
        )
        old = YoutubeVideo(
            id="old-video",
            title="RESCENE old update",
            description="오늘이라는 단어가 있지만 오래된 설명입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/old-video/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=old-video",
            published_at=now - timedelta(days=13),
            view_count=1000,
            like_count=100,
            comment_count=10,
            content_hash="old-video-hash",
        )
        db.add_all([source, recent, old])
        db.flush()
        db.add_all(
            [
                YoutubeVideoSource(video_id=recent.id, source_id=source.id),
                YoutubeVideoSource(video_id=old.id, source_id=source.id),
            ]
        )
        refresh_video_chunks(db, recent, artist_id=1)
        refresh_video_chunks(db, old, artist_id=1)
        db.commit()

    response = client.post(
        "/ai/qa",
        json={"question": "오늘 리센느 새 소식 찾아줘", "artist_id": 1},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    ids = [source["youtube_video_id"] for source in response.json()["sources"]]
    assert "today-video" in ids
    assert "old-video" not in ids


def test_answer_context_includes_metadata(client):
    from app.services.rag import format_context_for_answer

    payloads = [
        {
            "source_type": "youtube",
            "title": "RESCENE LOVE ATTACK Dance Practice",
            "published_at": "2026-06-07T00:00:00+00:00",
            "url": "https://www.youtube.com/watch?v=abc",
            "content": "영상 설명",
        }
    ]

    context = format_context_for_answer(payloads)

    assert "title: RESCENE LOVE ATTACK Dance Practice" in context
    assert "published_at: 2026-06-07T00:00:00+00:00" in context
    assert "url: https://www.youtube.com/watch?v=abc" in context
