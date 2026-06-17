from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.db import get_session_factory
from app.models import (
    ContentSource,
    SearchItem,
    SearchItemSource,
    YoutubeSource,
    YoutubeVideo,
    YoutubeVideoSource,
)
from app.services.catalog_search import SearchFilters, search_catalog
from app.services.rag import refresh_video_chunks
from app.services.search_index import upsert_youtube_video_search_item
from tests.conftest import signup


def _video(video_id: str, title: str, published_at: datetime, view_count: int) -> YoutubeVideo:
    return YoutubeVideo(
        id=video_id,
        title=title,
        description=f"{title} 설명",
        channel_title="RESCENE",
        thumbnail_url=f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
        url=f"https://www.youtube.com/watch?v={video_id}",
        published_at=published_at,
        view_count=view_count,
        like_count=10,
        comment_count=1,
        content_hash=f"{video_id}-hash",
    )


def test_youtube_backfill_creates_search_item_sources_and_links_rag_chunks(client):
    with get_session_factory()() as db:
        official = YoutubeSource(
            artist_id=1,
            source_type="official_channel",
            source_value="UC-official-search-index",
            title="RESCENE official",
        )
        keyword = YoutubeSource(
            artist_id=1,
            source_type="keyword_search",
            source_value="RESCENE keyword",
            title="Keyword search",
        )
        video = _video("search-index-video", "RESCENE official upload", datetime.now(UTC), 100)
        db.add_all([official, keyword, video])
        db.flush()
        db.add_all(
            [
                YoutubeVideoSource(video_id=video.id, source_id=official.id),
                YoutubeVideoSource(video_id=video.id, source_id=keyword.id),
            ]
        )
        refresh_video_chunks(db, video, artist_id=1)

        item = upsert_youtube_video_search_item(db, video, artist_id=1)
        db.commit()

        source_types = sorted(
            row[0]
            for row in db.execute(
                select(ContentSource.source_type)
                .join(SearchItemSource, SearchItemSource.source_id == ContentSource.id)
                .where(SearchItemSource.search_item_id == item.id)
            )
        )
        chunk_item_id = db.scalar(
            select(SearchItem.id)
            .join(SearchItem.rag_chunks)
            .where(SearchItem.youtube_video_id == video.id)
        )

    assert item.item_type == "youtube"
    assert item.youtube_video_id == "search-index-video"
    assert source_types == ["keyword_search", "official_channel"]
    assert chunk_item_id == item.id


def test_catalog_search_filters_official_youtube_recent_first(client):
    token = signup(client, "official-catalog@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    now = datetime.now(UTC)

    with get_session_factory()() as db:
        official = YoutubeSource(
            artist_id=1,
            source_type="official_channel",
            source_value="UC-official-catalog",
            title="RESCENE official",
        )
        fan = YoutubeSource(
            artist_id=1,
            source_type="fan_channel",
            source_value="UC-fan-catalog",
            title="Fan channel",
        )
        db.add_all([official, fan])
        db.flush()
        videos = [
            (_video("official-new", "Official new", now, 10), official),
            (_video("fan-newer", "Fan newer", now + timedelta(minutes=1), 999), fan),
            (_video("official-old", "Official old", now - timedelta(days=1), 20), official),
        ]
        for video, source in videos:
            db.add(video)
            db.flush()
            db.add(YoutubeVideoSource(video_id=video.id, source_id=source.id))
            refresh_video_chunks(db, video, artist_id=1)
            upsert_youtube_video_search_item(db, video, artist_id=1)
        db.commit()

    with get_session_factory()() as db:
        result = search_catalog(
            db,
            SearchFilters(
                artist_id=1,
                content_types=("youtube",),
                source_types=("official_channel",),
                sort="latest",
                limit=5,
            ),
        )

    assert [source["youtube_video_id"] for source in result.sources] == [
        "official-new",
        "official-old",
    ]
    assert all(source["primary_source_type"] == "official_channel" for source in result.sources)
    assert all(source["is_official"] for source in result.sources)

    response = client.post(
        "/ai/qa",
        json={"question": "공식 유튜브에서 최근에 올라온 영상 5개만 찾아줘", "artist_id": 1},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    source_ids = [source["youtube_video_id"] for source in response.json()["sources"]]
    assert source_ids[:2] == ["official-new", "official-old"]
    assert "fan-newer" not in source_ids
