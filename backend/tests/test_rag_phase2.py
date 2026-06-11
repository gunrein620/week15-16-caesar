from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.db import get_session_factory
from app.models import ExternalUpdate, RagChunk, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.services.rag import (
    _chunk_source_payload,
    refresh_external_update_chunks,
    refresh_video_chunks,
    search_chunks,
)
from app.services.rag_admin import _chunks_are_stale, cleanup_rag_chunks, get_rag_coverage
from app.services.transcripts import build_transcript_windows, refresh_video_transcript_chunks
from tests.conftest import login


def _video(video_id: str, *, published_at: datetime | None = None, status: str = "pending") -> YoutubeVideo:
    return YoutubeVideo(
        id=video_id,
        title=f"RESCENE {video_id}",
        description=f"{video_id} transcript marker",
        channel_title="RESCENE",
        published_at=published_at or datetime(2026, 6, 1, tzinfo=UTC),
        thumbnail_url=f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
        url=f"https://www.youtube.com/watch?v={video_id}",
        view_count=100,
        content_hash=f"{video_id}-hash",
        transcript_status=status,
    )


def _add_source_with_videos(db, videos: list[YoutubeVideo]) -> None:
    source = YoutubeSource(
        artist_id=1,
        source_type="official_channel",
        source_value=f"UU-{videos[0].id}",
        title="Phase 2 source",
    )
    db.add(source)
    db.add_all(videos)
    db.flush()
    db.add_all(YoutubeVideoSource(video_id=video.id, source_id=source.id) for video in videos)


def test_build_transcript_windows_merges_by_size_time_and_caps_at_40():
    segments = [
        {"start": 0, "duration": 20, "text": "  첫 문장입니다.  "},
        {"start": 20, "duration": 20, "text": "둘째 문장입니다."},
        {"start": 50, "duration": 15, "text": "셋째 문장입니다."},
        {"start": 80, "duration": 10, "text": "새 윈도우입니다."},
        {"start": 95, "duration": 5, "text": ""},
    ]

    windows = build_transcript_windows(segments)
    capped = build_transcript_windows(
        [{"start": index * 80, "duration": 1, "text": f"윈도우 {index}"} for index in range(60)]
    )

    assert windows == [
        (0, "첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다."),
        (80, "새 윈도우입니다."),
    ]
    assert len(capped) == 40
    assert capped[0] == (0, "윈도우 0")
    assert capped[-1] == (3120, "윈도우 39")


def test_video_metadata_refresh_and_transcript_refresh_preserve_each_other(client, monkeypatch):
    segments = [
        {"start": 5, "duration": 10, "text": "첫 자막입니다."},
        {"start": 20, "duration": 10, "text": "둘째 자막입니다."},
    ]
    monkeypatch.setattr(
        "app.services.transcripts.fetch_video_transcript",
        lambda video_id: ("fetched", "ko", segments),
    )

    with get_session_factory()() as db:
        video = _video("transcript-preserve")
        db.add(video)
        db.flush()
        assert refresh_video_chunks(db, video, artist_id=1) == 1
        assert refresh_video_transcript_chunks(db, video, artist_id=1) == 1
        assert refresh_video_chunks(db, video, artist_id=1) == 1
        chunks = db.scalars(
            select(RagChunk)
            .where(RagChunk.youtube_video_id == video.id)
            .order_by(RagChunk.chunk_index)
        ).all()
        chunk_indexes = [chunk.chunk_index for chunk in chunks]
        transcript_content = chunks[1].content
        db.commit()

    assert chunk_indexes == [0, 1]
    assert transcript_content.startswith("[0:05] ")


def test_chunks_are_stale_ignores_extra_transcript_chunks(client):
    with get_session_factory()() as db:
        video = _video("stale-ignore-transcript")
        db.add(video)
        db.flush()
        refresh_video_chunks(db, video, artist_id=1)
        db.add(
            RagChunk(
                artist_id=1,
                youtube_video_id=video.id,
                chunk_index=1,
                content="[0:01] 자막 청크",
                content_hash="transcript-hash",
                embedding=[0.0] * 1536,
            )
        )
        db.flush()
        chunks = db.scalars(
            select(RagChunk)
            .where(RagChunk.youtube_video_id == video.id)
            .order_by(RagChunk.chunk_index.desc())
        ).all()

        assert _chunks_are_stale(db, video, 1, chunks) is False


def test_cleanup_does_not_delete_transcript_chunk_as_duplicate(client):
    with get_session_factory()() as db:
        video = _video("cleanup-transcript-preserve")
        _add_source_with_videos(db, [video])
        db.flush()
        refresh_video_chunks(db, video, artist_id=1)
        db.add(
            RagChunk(
                artist_id=1,
                youtube_video_id=video.id,
                chunk_index=1,
                content="[0:02] 보존될 자막",
                content_hash="transcript-hash",
                embedding=[0.0] * 1536,
            )
        )
        db.commit()

    with get_session_factory()() as db:
        result = cleanup_rag_chunks(db, artist_id=1)
        chunks = db.scalars(
            select(RagChunk)
            .where(RagChunk.youtube_video_id == "cleanup-transcript-preserve")
            .order_by(RagChunk.chunk_index)
        ).all()

    assert result["duplicate_deleted"] == 0
    assert [chunk.chunk_index for chunk in chunks] == [0, 1]


def test_fetch_transcripts_batch_status_transitions_through_admin(client, monkeypatch):
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}
    now = datetime(2026, 6, 11, tzinfo=UTC)

    with get_session_factory()() as db:
        videos = [
            _video("transcript-fetched", published_at=now),
            _video("transcript-unavailable", published_at=now - timedelta(days=1)),
            _video("transcript-failed", published_at=now - timedelta(days=2)),
        ]
        _add_source_with_videos(db, videos)
        db.commit()

    def fake_fetch(video_id: str):
        if video_id == "transcript-fetched":
            return (
                "fetched",
                "ko",
                [{"start": 125, "duration": 5, "text": "관리자 배치 자막입니다."}],
            )
        if video_id == "transcript-unavailable":
            return "unavailable", "", []
        return "failed", "", []

    monkeypatch.setattr("app.services.transcripts.fetch_video_transcript", fake_fetch)

    response = client.post(
        "/admin/rag/transcripts/batch",
        json={"artist_id": 1, "limit": 3},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "processed": 3,
        "fetched": 1,
        "unavailable": 1,
        "failed": 1,
        "created_chunks": 1,
    }
    with get_session_factory()() as db:
        rows = {video.id: video for video in db.scalars(select(YoutubeVideo)).all()}
        chunk = db.scalar(
            select(RagChunk).where(
                RagChunk.youtube_video_id == "transcript-fetched",
                RagChunk.chunk_index == 1,
            )
        )

    assert rows["transcript-fetched"].transcript_status == "fetched"
    assert rows["transcript-fetched"].transcript_lang == "ko"
    assert rows["transcript-unavailable"].transcript_status == "unavailable"
    assert rows["transcript-failed"].transcript_status == "failed"
    assert chunk is not None
    assert chunk.content.startswith("[2:05] ")


def test_external_update_chunks_are_searchable_and_expose_naver_payload(client):
    marker = "phase2navermarker"
    with get_session_factory()() as db:
        item = ExternalUpdate(
            artist_id=1,
            source_type="naver_news",
            external_id="phase2-news",
            title=f"<b>RESCENE</b> {marker}",
            description=f"<b>{marker}</b> 뉴스 본문입니다.",
            url="https://news.example.com/phase2",
            thumbnail_url="https://img.example.com/phase2.jpg",
            source_label="Naver News",
            published_at=datetime(2026, 6, 11, tzinfo=UTC),
            content_hash="phase2-news-hash",
            raw_payload={},
        )
        db.add(item)
        db.flush()
        assert refresh_external_update_chunks(db, item) == 1
        chunks = search_chunks(db, marker, artist_id=1, limit=5)
        payloads = [_chunk_source_payload(db, chunk) for chunk in chunks]

    payload = next(source for source in payloads if source["external_update_id"] == item.id)
    assert payload["source_type"] == "naver_news"
    assert payload["post_id"] is None
    assert payload["youtube_video_id"] is None
    assert payload["title"] == f"<b>RESCENE</b> {marker}"
    assert payload["url"] == "https://news.example.com/phase2"
    assert "<b>" not in next(chunk.content for chunk in chunks if chunk.external_update_id == item.id)


def test_youtube_transcript_chunk_source_payload_adds_timestamp_deeplink(client):
    with get_session_factory()() as db:
        video = _video("deeplink-video")
        db.add(video)
        db.flush()
        chunk = RagChunk(
            artist_id=1,
            youtube_video_id=video.id,
            chunk_index=1,
            content="[3:25] 타임스탬프 자막",
            content_hash="deeplink-transcript-hash",
            embedding=[0.0] * 1536,
        )
        db.add(chunk)
        db.flush()
        payload = _chunk_source_payload(db, chunk)

    assert payload["url"] == "https://www.youtube.com/watch?v=deeplink-video&t=205s"
    assert payload["timestamp_seconds"] == 205
    assert payload["snippet"] == "[3:25] 타임스탬프 자막"
    assert payload["title"] == "RESCENE deeplink-video"


def test_rag_coverage_reports_transcript_and_external_fields(client):
    with get_session_factory()() as db:
        videos = [
            _video("coverage-fetched", status="fetched"),
            _video("coverage-unavailable", status="unavailable"),
            _video("coverage-pending", status="pending"),
            _video("coverage-failed", status="failed"),
        ]
        _add_source_with_videos(db, videos)
        db.flush()
        refresh_video_chunks(db, videos[0], artist_id=1)
        db.add(
            RagChunk(
                artist_id=1,
                youtube_video_id=videos[0].id,
                chunk_index=1,
                content="[0:01] 커버리지 자막",
                content_hash="coverage-transcript-hash",
                embedding=[0.0] * 1536,
            )
        )
        item = ExternalUpdate(
            artist_id=1,
            source_type="naver_blog",
            external_id="coverage-blog",
            title="RESCENE coverage blog",
            description="커버리지 블로그",
            url="https://blog.example.com/coverage",
            thumbnail_url="",
            source_label="Naver Blog",
            published_at=datetime(2026, 6, 11, tzinfo=UTC),
            content_hash="coverage-blog-hash",
            raw_payload={},
        )
        db.add(item)
        db.flush()
        refresh_external_update_chunks(db, item)
        coverage = get_rag_coverage(db, artist_id=1)

    assert coverage["transcript_fetched_videos"] == 1
    assert coverage["transcript_unavailable_videos"] == 1
    assert coverage["transcript_pending_videos"] == 1
    assert coverage["transcript_chunks"] == 1
    assert coverage["external_update_chunks"] == 1
    assert coverage["youtube_embedded_videos"] == 1
    assert coverage["youtube_missing_videos"] == 3
