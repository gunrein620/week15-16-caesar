from datetime import UTC, datetime, time, timedelta

from app.core.db import get_session_factory
from app.models import YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.rag import KST, refresh_video_chunks
from tests.conftest import signup


def test_parse_temporal_update_intent(client):
    from app.services.search_intent import parse_search_intent

    intent = parse_search_intent("오늘 리센느 새 소식 찾아줘", artist_id=1)

    assert intent.temporal == "today"
    assert intent.route == "updates"
    assert intent.media_type is None


def test_parse_today_after_time_intent(client):
    from app.services.search_intent import parse_search_intent

    intent = parse_search_intent("오늘 12시 이후 영상만 찾아줘", artist_id=1)

    assert intent.temporal == "today"
    assert intent.route == "updates"
    assert intent.media_type == "youtube"
    assert intent.time_after == time(12, 0)


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


def test_today_after_time_query_filters_youtube_sources_by_time(client):
    token = signup(client, "today-after-time@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    today_kst = datetime.now(KST).date()
    before_noon = datetime(
        today_kst.year,
        today_kst.month,
        today_kst.day,
        11,
        30,
        tzinfo=KST,
    ).astimezone(UTC)
    after_noon = datetime(
        today_kst.year,
        today_kst.month,
        today_kst.day,
        12,
        30,
        tzinfo=KST,
    ).astimezone(UTC)

    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="official_channel",
            source_value="UU-time-test",
            title="RESCENE time official",
        )
        before = YoutubeVideo(
            id="today-before-noon",
            title="RESCENE morning update",
            description="오늘 오전 영상입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/today-before-noon/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=today-before-noon",
            published_at=before_noon,
            view_count=100,
            like_count=10,
            comment_count=1,
            content_hash="today-before-noon-hash",
        )
        after = YoutubeVideo(
            id="today-after-noon",
            title="RESCENE noon update",
            description="오늘 12시 이후 영상입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/today-after-noon/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=today-after-noon",
            published_at=after_noon,
            view_count=100,
            like_count=10,
            comment_count=1,
            content_hash="today-after-noon-hash",
        )
        db.add_all([source, before, after])
        db.flush()
        db.add_all(
            [
                YoutubeVideoSource(video_id=before.id, source_id=source.id),
                YoutubeVideoSource(video_id=after.id, source_id=source.id),
            ]
        )
        refresh_video_chunks(db, before, artist_id=1)
        refresh_video_chunks(db, after, artist_id=1)
        db.commit()

    response = client.post(
        "/ai/qa",
        json={"question": "오늘 12시 이후 영상만 찾아줘", "artist_id": 1},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    ids = [source["youtube_video_id"] for source in response.json()["sources"]]
    assert "today-after-noon" in ids
    assert "today-before-noon" not in ids


def test_llm_intent_filters_updates_with_structured_conditions(client, monkeypatch):
    token = signup(client, "llm-structured-search@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    monkeypatch.setattr(
        "app.services.search_intent._llm_payload",
        lambda question, archive_terms: {
            "route": "updates",
            "temporal": "custom",
            "media_type": "youtube",
            "published_after": "2026-06-09T00:00:00+09:00",
            "published_before": "2026-06-11T00:00:00+09:00",
            "include_terms": ["원이"],
            "exclude_terms": ["쇼츠"],
            "sort": "latest",
        },
    )

    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="official_channel",
            source_value="UU-llm-structured",
            title="RESCENE LLM official",
        )
        older = YoutubeVideo(
            id="llm-older-woni",
            title="RESCENE 원이 older update",
            description="원이 영상입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/llm-older-woni/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=llm-older-woni",
            published_at=datetime(2026, 6, 8, 12, tzinfo=UTC),
            view_count=300,
            like_count=10,
            comment_count=1,
            content_hash="llm-older-woni-hash",
        )
        matched = YoutubeVideo(
            id="llm-matched-woni",
            title="RESCENE 원이 update",
            description="원이 직캠 영상입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/llm-matched-woni/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=llm-matched-woni",
            published_at=datetime(2026, 6, 10, 12, tzinfo=UTC),
            view_count=200,
            like_count=10,
            comment_count=1,
            content_hash="llm-matched-woni-hash",
        )
        excluded = YoutubeVideo(
            id="llm-excluded-shorts",
            title="RESCENE 원이 쇼츠",
            description="원이 쇼츠 영상입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/llm-excluded-shorts/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=llm-excluded-shorts",
            published_at=datetime(2026, 6, 10, 13, tzinfo=UTC),
            view_count=1000,
            like_count=10,
            comment_count=1,
            content_hash="llm-excluded-shorts-hash",
        )
        db.add_all([source, older, matched, excluded])
        db.flush()
        db.add_all(
            [
                YoutubeVideoSource(video_id=older.id, source_id=source.id),
                YoutubeVideoSource(video_id=matched.id, source_id=source.id),
                YoutubeVideoSource(video_id=excluded.id, source_id=source.id),
            ]
        )
        refresh_video_chunks(db, older, artist_id=1)
        refresh_video_chunks(db, matched, artist_id=1)
        refresh_video_chunks(db, excluded, artist_id=1)
        db.commit()

    response = client.post(
        "/ai/qa",
        json={"question": "원이 영상 찾아줘. 쇼츠는 빼고", "artist_id": 1},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    ids = [source["youtube_video_id"] for source in response.json()["sources"]]
    assert "llm-matched-woni" in ids
    assert "llm-older-woni" not in ids
    assert "llm-excluded-shorts" not in ids


def test_load_more_reuses_search_intent_without_llm_reparse(client, monkeypatch):
    token = signup(client, "intent-reuse@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    calls = {"count": 0}

    def fake_llm_payload(question, archive_terms):
        calls["count"] += 1
        return {
            "route": "updates",
            "temporal": "recent",
            "media_type": "youtube",
            "published_after": None,
            "published_before": None,
            "include_terms": [],
            "boost_terms": [],
            "exclude_terms": [],
            "source_types": ["youtube"],
            "sort": "latest",
        }

    monkeypatch.setattr("app.services.search_intent._llm_payload", fake_llm_payload)

    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="official_channel",
            source_value="UU-intent-reuse",
            title="RESCENE intent reuse",
        )
        db.add(source)
        db.flush()
        for index in range(12):
            video = YoutubeVideo(
                id=f"intent-reuse-{index:02d}",
                title=f"RESCENE intent reuse {index:02d}",
                description="더보기 intent 재사용 테스트 영상",
                channel_title="RESCENE",
                thumbnail_url=f"https://img.youtube.com/vi/intent-reuse-{index:02d}/hqdefault.jpg",
                url=f"https://www.youtube.com/watch?v=intent-reuse-{index:02d}",
                published_at=datetime.now(UTC) - timedelta(minutes=index),
                view_count=100,
                like_count=10,
                comment_count=1,
                content_hash=f"intent-reuse-hash-{index:02d}",
            )
            db.add(video)
            db.flush()
            db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))
            refresh_video_chunks(db, video, artist_id=1)
        db.commit()

    first = client.post(
        "/ai/qa",
        json={"question": "최근 영상 찾아줘", "artist_id": 1},
        headers=headers,
    )
    assert first.status_code == 200, first.text
    assert calls["count"] == 1
    first_body = first.json()
    assert first_body["search_intent"]

    second = client.post(
        "/ai/qa",
        json={
            "question": "최근 영상 찾아줘",
            "artist_id": 1,
            "offset": first_body["next_offset"],
            "include_answer": False,
            "search_intent": first_body["search_intent"],
        },
        headers=headers,
    )
    assert second.status_code == 200, second.text
    assert calls["count"] == 1


def test_qa_returns_ten_sources_and_supports_offset_without_new_answer(client):
    token = signup(client, "qa-pagination@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="keyword_search",
            source_value="리센느 페이지네이션",
            title="QA pagination source",
        )
        db.add(source)
        db.flush()
        for index in range(12):
            video = YoutubeVideo(
                id=f"qa-page-{index:02d}",
                title=f"RESCENE pagination marker {index:02d}",
                description="pagination marker 검색 전용 영상",
                channel_title="RESCENE",
                thumbnail_url=f"https://img.youtube.com/vi/qa-page-{index:02d}/hqdefault.jpg",
                url=f"https://www.youtube.com/watch?v=qa-page-{index:02d}",
                published_at=datetime(2026, 6, index + 1, tzinfo=UTC),
                view_count=100 + index,
                like_count=10,
                comment_count=1,
                content_hash=f"qa-page-hash-{index:02d}",
            )
            db.add(video)
            db.flush()
            db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))
            refresh_video_chunks(db, video, artist_id=1)
        db.commit()

    first = client.post(
        "/ai/qa",
        json={
            "question": "pagination marker 영상 찾아줘",
            "artist_id": 1,
            "include_answer": False,
        },
        headers=headers,
    )
    second = client.post(
        "/ai/qa",
        json={
            "question": "pagination marker 영상 찾아줘",
            "artist_id": 1,
            "limit": 10,
            "offset": 10,
            "include_answer": False,
        },
        headers=headers,
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    first_body = first.json()
    second_body = second.json()
    assert first_body["answer"] == ""
    assert len(first_body["sources"]) == 10
    assert first_body["has_more"] is True
    assert first_body["next_offset"] == 10
    assert second_body["answer"] == ""
    assert len(second_body["sources"]) >= 2
    assert not {
        source["youtube_video_id"] for source in first_body["sources"]
    } & {source["youtube_video_id"] for source in second_body["sources"]}


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
