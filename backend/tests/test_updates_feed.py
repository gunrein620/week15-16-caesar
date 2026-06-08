from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.db import get_session_factory
from app.models import (
    AgentRun,
    Briefing,
    ExternalUpdate,
    Post,
    Tag,
    User,
    YoutubeSource,
    YoutubeVideo,
    YoutubeVideoSource,
)
from app.services.rag import refresh_post_chunks


def _admin_id() -> int:
    with get_session_factory()() as db:
        return db.query(User).filter(User.email == "admin@example.com").one().id


def test_updates_feed_merges_recent_sources_and_marks_briefings(client):
    admin_id = _admin_id()

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
        db.add_all(
            [
                ExternalUpdate(
                    artist_id=1,
                    source_type="naver_news",
                    external_id="news-1",
                    title="RESCENE comeback article",
                    description="Love Attack 기사",
                    url="https://news.example.com/rescene",
                    thumbnail_url="https://thumb.example.com/news.jpg",
                    source_label="Naver News",
                    published_at=datetime(2030, 6, 6, 12, tzinfo=UTC),
                    content_hash="news-hash",
                    raw_payload={},
                ),
                ExternalUpdate(
                    artist_id=1,
                    source_type="naver_blog",
                    external_id="blog-1",
                    title="Woni radio blog",
                    description="원이 라디오 후기",
                    url="https://blog.example.com/woni",
                    thumbnail_url="https://thumb.example.com/blog.jpg",
                    source_label="Naver Blog",
                    published_at=datetime(2030, 6, 6, 12, tzinfo=UTC),
                    content_hash="blog-hash",
                    raw_payload={},
                ),
            ]
        )

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
    assert news["thumbnail_url"] == "https://thumb.example.com/news.jpg"


def test_update_highlight_scans_beyond_first_updates_page(client):
    seoul_today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    base = datetime.combine(seoul_today, time(12), tzinfo=ZoneInfo("Asia/Seoul")).astimezone(UTC)

    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="keyword_search",
            source_value="highlight scan",
            title="highlight scan",
        )
        db.add(source)
        db.flush()
        videos: list[YoutubeVideo] = []
        for index in range(55):
            videos.append(
                YoutubeVideo(
                    id=f"highlight-low-{index}",
                    title=f"newer low view {index}",
                    description="리센느",
                    channel_title="RESCENE",
                    published_at=base + timedelta(minutes=index + 1),
                    thumbnail_url="",
                    url=f"https://youtube.example.com/highlight-low-{index}",
                    view_count=1,
                    content_hash=f"highlight-low-{index}-hash",
                )
            )
        high_video = YoutubeVideo(
            id="highlight-high",
            title="today highest view highlight",
            description="리센느",
            channel_title="RESCENE",
            published_at=base,
            thumbnail_url="",
            url="https://youtube.example.com/highlight-high",
            view_count=999_999,
            content_hash="highlight-high-hash",
        )
        db.add_all([*videos, high_video])
        db.flush()
        db.add_all(
            [YoutubeVideoSource(video_id=video.id, source_id=source.id) for video in [*videos, high_video]]
        )
        db.commit()

    first_page = client.get("/artists/1/updates", params={"limit": 50})
    highlight = client.get("/artists/1/updates/highlight")

    assert first_page.status_code == 200, first_page.text
    assert "youtube:highlight-high" not in {item["id"] for item in first_page.json()["items"]}
    assert highlight.status_code == 200, highlight.text
    assert highlight.json()["id"] == "youtube:highlight-high"


def test_updates_feed_filters_by_member_keyword_and_source(client):
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


def test_updates_feed_member_filter_does_not_match_liv_inside_live(client):
    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="curated_video",
            source_value="member-boundary-video",
            title="official",
        )
        live_video = YoutubeVideo(
            id="member-boundary-live",
            title="Woni radio live",
            description="원이 라디오 라이브",
            channel_title="RESCENE",
            published_at=datetime(2030, 6, 6, 13, tzinfo=UTC),
            thumbnail_url="",
            url="https://youtube.example.com/member-boundary-live",
            view_count=77,
            content_hash="member-boundary-live-hash",
        )
        liv_video = YoutubeVideo(
            id="member-boundary-liv",
            title="리브 radio clip",
            description="RESCENE Liv solo moment",
            channel_title="RESCENE",
            published_at=datetime(2030, 6, 6, 12, tzinfo=UTC),
            thumbnail_url="",
            url="https://youtube.example.com/member-boundary-liv",
            view_count=55,
            content_hash="member-boundary-liv-hash",
        )
        title_member_video = YoutubeVideo(
            id="member-boundary-woni-title",
            title="리센느 원이 데자부",
            description="#LIV #리브 #MAY #메이 #ZENA #제나",
            channel_title="RESCENE",
            published_at=datetime(2030, 6, 6, 11, tzinfo=UTC),
            thumbnail_url="",
            url="https://youtube.example.com/member-boundary-woni-title",
            view_count=44,
            content_hash="member-boundary-woni-title-hash",
        )
        db.add_all([source, live_video, liv_video, title_member_video])
        db.flush()
        db.add_all(
            [
                YoutubeVideoSource(video_id=live_video.id, source_id=source.id),
                YoutubeVideoSource(video_id=liv_video.id, source_id=source.id),
                YoutubeVideoSource(video_id=title_member_video.id, source_id=source.id),
            ]
        )
        db.commit()

    response = client.get("/artists/1/updates", params={"member": "Liv"})
    woni_response = client.get("/artists/1/updates", params={"member": "Woni"})

    assert response.status_code == 200, response.text
    ids = {item["id"] for item in response.json()["items"]}
    assert "youtube:member-boundary-liv" in ids
    assert "youtube:member-boundary-live" not in ids
    assert "youtube:member-boundary-woni-title" not in ids
    assert woni_response.status_code == 200, woni_response.text
    assert "youtube:member-boundary-woni-title" in {
        item["id"] for item in woni_response.json()["items"]
    }


def test_updates_feed_keyword_filter_supports_korean_ui_aliases(client):
    with get_session_factory()() as db:
        source = YoutubeSource(
            artist_id=1,
            source_type="curated_video",
            source_value="keyword-alias-video",
            title="official",
        )
        video = YoutubeVideo(
            id="keyword-alias-video",
            title="RESCENE comeback stage fancam",
            description="radio performance",
            channel_title="RESCENE",
            published_at=datetime(2030, 6, 6, 13, tzinfo=UTC),
            thumbnail_url="",
            url="https://youtube.example.com/keyword-alias-video",
            view_count=77,
            content_hash="keyword-alias-video-hash",
        )
        db.add_all([source, video])
        db.flush()
        db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))
        db.commit()

    comeback_response = client.get("/artists/1/updates", params={"keyword": "컴백"})
    fancam_response = client.get("/artists/1/updates", params={"keyword": "직캠"})

    assert comeback_response.status_code == 200, comeback_response.text
    assert "youtube:keyword-alias-video" in {
        item["id"] for item in comeback_response.json()["items"]
    }
    assert fancam_response.status_code == 200, fancam_response.text
    assert "youtube:keyword-alias-video" in {
        item["id"] for item in fancam_response.json()["items"]
    }


def test_updates_feed_filters_loose_naver_blog_snippet_matches(client):
    with get_session_factory()() as db:
        db.add_all(
            [
                ExternalUpdate(
                    artist_id=1,
                    source_type="naver_blog",
                    external_id="irrelevant-blog",
                    title="soft haze",
                    description="ATTACK RESCENE(리센느) 단어가 본문 주변 스니펫에만 걸린 일상 글",
                    url="https://blog.example.com/soft-haze",
                    thumbnail_url="",
                    source_label="Naver Blog",
                    published_at=datetime(2030, 6, 7, 12, tzinfo=UTC),
                    content_hash="irrelevant-blog-hash",
                    raw_payload={},
                ),
                ExternalUpdate(
                    artist_id=1,
                    source_type="naver_blog",
                    external_id="relevant-blog",
                    title="사람들이 이제야 리센느를 알아본다",
                    description="리센느 원이 반응 정리",
                    url="https://blog.example.com/rescene",
                    thumbnail_url="",
                    source_label="Naver Blog",
                    published_at=datetime(2030, 6, 7, 11, tzinfo=UTC),
                    content_hash="relevant-blog-hash",
                    raw_payload={},
                ),
            ]
        )
        db.commit()

    response = client.get("/artists/1/updates", params={"source": "naver_blog"})

    assert response.status_code == 200, response.text
    titles = [item["title"] for item in response.json()["items"]]
    assert "soft haze" not in titles
    assert "사람들이 이제야 리센느를 알아본다" in titles


def test_updates_feed_deduplicates_video_linked_to_multiple_sources(client):
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
            id="shared-feed-video",
            title="Shared feed video",
            description="same video from two sources",
            channel_title="RESCENE",
            published_at=datetime(2026, 6, 6, 13, tzinfo=UTC),
            thumbnail_url="",
            url="https://youtube.example.com/shared-feed-video",
            view_count=100,
            content_hash="shared-feed-video-hash",
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

    response = client.get("/artists/1/updates", params={"source": "youtube"})

    assert response.status_code == 200, response.text
    assert [item["id"] for item in response.json()["items"]].count("youtube:shared-feed-video") == 1


def test_updates_feed_stays_public_without_naver_cache(client):
    response = client.get("/artists/1/updates")

    assert response.status_code == 200
    assert response.json()["naver_available"] is True
