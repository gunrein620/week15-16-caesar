from datetime import UTC, date, datetime

from app.core.db import get_session_factory
from app.models import AgentRun, Briefing, Post, Tag, User, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.rag import refresh_post_chunks


def _admin_id() -> int:
    with get_session_factory()() as db:
        return db.query(User).filter(User.email == "admin@example.com").one().id


def test_updates_feed_merges_recent_sources_and_marks_briefings(client, monkeypatch):
    admin_id = _admin_id()

    def fake_news(query: str, display: int = 5):
        return [
            {
                "title": "<b>RESCENE</b> comeback article",
                "description": "Love Attack 기사",
                "originallink": "https://news.example.com/rescene",
                "link": "https://search.naver.com/news",
                "pubDate": "Sat, 06 Jun 2030 12:00:00 +0900",
            }
        ]

    def fake_blog(query: str, display: int = 5):
        return [
            {
                "title": "Woni radio blog",
                "description": "원이 라디오 후기",
                "link": "https://blog.example.com/woni",
                "postdate": "20300606",
            }
        ]

    monkeypatch.setattr("app.services.updates.naver_news_search", fake_news)
    monkeypatch.setattr("app.services.updates.naver_blog_search", fake_blog)
    monkeypatch.setattr(
        "app.services.updates.resolve_page_thumbnail",
        lambda url: f"https://thumb.example.com/?url={url}",
    )

    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="curated_video",
            source_value="feed-video",
            title="official",
        )
        video = YoutubeVideo(
            id="feed-video",
            title="Woni stage fancam",
            description="컴백 무대",
            channel_title="RESCENE",
            published_at=datetime(2030, 6, 6, 13, tzinfo=UTC),
            thumbnail_url="https://img.example.com/feed.jpg",
            url="https://youtube.example.com/feed-video",
            view_count=123,
            content_hash="feed-video-hash",
        )
        db.add_all([source, video])
        db.flush()
        db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))

        fan_post = Post(
            title="Liv comeback 후기",
            content="리브 컴백 무대가 좋았습니다.",
            author_id=admin_id,
            artist_id=1,
            created_at=datetime(2030, 6, 6, 11, tzinfo=UTC),
        )
        briefing_post = Post(
            title="RESCENE 2026-06-06 브리핑",
            content="오늘의 리센느 요약입니다.",
            author_id=admin_id,
            artist_id=1,
            created_at=datetime(2030, 6, 6, 10, tzinfo=UTC),
        )
        db.add_all([fan_post, briefing_post])
        db.flush()
        tag = Tag(name="comeback")
        db.add(tag)
        db.flush()
        from app.models import PostTag

        db.add(PostTag(post_id=fan_post.id, tag_id=tag.id, tag=tag))
        refresh_post_chunks(db, fan_post)
        refresh_post_chunks(db, briefing_post)
        run = AgentRun(
            artist_id=1,
            user_id=admin_id,
            status="published",
            briefing_date=date(2030, 6, 6),
            preview_markdown=briefing_post.content,
            created_post_id=briefing_post.id,
            published_at=datetime(2030, 6, 6, 10, tzinfo=UTC),
        )
        db.add(run)
        db.flush()
        db.add(
            Briefing(
                artist_id=1,
                run_id=run.id,
                post_id=briefing_post.id,
                briefing_date=run.briefing_date,
            )
        )
        db.commit()

    response = client.get("/artists/1/updates")

    assert response.status_code == 200, response.text
    body = response.json()
    item_types = [item["item_type"] for item in body["items"]]
    assert {"youtube", "naver_news", "naver_blog", "post", "briefing"} <= set(item_types)
    assert item_types.count("briefing") == 1
    assert all(
        not (item["item_type"] == "post" and item["title"] == "RESCENE 2026-06-06 브리핑")
        for item in body["items"]
    )
    youtube = next(item for item in body["items"] if item["item_type"] == "youtube")
    assert youtube["thumbnail_url"].endswith("feed.jpg")
    assert youtube["source_label"] == "YouTube"
    assert "Woni" in youtube["member_names"]
    news = next(item for item in body["items"] if item["item_type"] == "naver_news")
    assert news["title"] == "RESCENE comeback article"
    assert news["url"] == "https://news.example.com/rescene"
    assert news["thumbnail_url"] == "https://thumb.example.com/?url=https://news.example.com/rescene"


def test_updates_feed_filters_by_member_keyword_and_source(client, monkeypatch):
    monkeypatch.setattr("app.services.updates.naver_news_search", lambda query, display=5: [])
    monkeypatch.setattr("app.services.updates.naver_blog_search", lambda query, display=5: [])
    admin_id = _admin_id()
    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="curated_video",
            source_value="filter-video",
            title="official",
        )
        video = YoutubeVideo(
            id="filter-video",
            title="Woni radio live",
            description="원이 라디오",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 6, 13, tzinfo=UTC),
            thumbnail_url="",
            url="https://youtube.example.com/filter-video",
            view_count=77,
            content_hash="filter-video-hash",
        )
        post = Post(
            title="Liv comeback post",
            content="리브 comeback 후기",
            author_id=admin_id,
            artist_id=1,
            created_at=datetime(2026, 6, 6, 12, tzinfo=UTC),
        )
        db.add_all([source, video, post])
        db.flush()
        db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))
        refresh_post_chunks(db, post)
        db.commit()

    member_response = client.get("/artists/1/updates", params={"member": "Woni"})
    keyword_response = client.get("/artists/1/updates", params={"keyword": "comeback"})
    source_response = client.get("/artists/1/updates", params={"source": "youtube"})

    assert member_response.status_code == 200
    assert {item["item_type"] for item in member_response.json()["items"]} == {"youtube"}
    assert keyword_response.status_code == 200
    assert all("comeback" in " ".join(item["matched_keywords"]).lower() for item in keyword_response.json()["items"])
    assert source_response.status_code == 200
    assert {item["item_type"] for item in source_response.json()["items"]} == {"youtube"}


def test_updates_feed_stays_public_when_naver_is_unavailable(client, monkeypatch):
    def fail_naver(query: str, display: int = 5):
        raise RuntimeError("naver unavailable")

    monkeypatch.setattr("app.services.updates.naver_news_search", fail_naver)
    monkeypatch.setattr("app.services.updates.naver_blog_search", fail_naver)

    response = client.get("/artists/1/updates")

    assert response.status_code == 200
    assert response.json()["naver_available"] is False
