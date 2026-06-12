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
from app.services.transcripts import (
    build_transcript_windows,
    fetch_transcripts_batch,
    refresh_video_transcript_chunks,
)
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


def test_upload_transcript_endpoint_replaces_chunks_marks_empty_and_404s(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}

    with get_session_factory()() as db:
        normal = _video("upload-normal")
        empty = _video("upload-empty", status="fetched")
        empty.transcript_lang = "ko"
        _add_source_with_videos(db, [normal, empty])
        db.flush()
        refresh_video_chunks(db, normal, artist_id=1)
        db.add_all(
            [
                RagChunk(
                    artist_id=1,
                    youtube_video_id=normal.id,
                    chunk_index=1,
                    content="[0:01] 이전 자막",
                    content_hash="old-normal-transcript",
                    embedding=[0.0] * 1536,
                ),
                RagChunk(
                    artist_id=1,
                    youtube_video_id=empty.id,
                    chunk_index=1,
                    content="[0:02] 보존될 자막",
                    content_hash="old-empty-transcript",
                    embedding=[0.0] * 1536,
                ),
            ]
        )
        db.commit()

    uploaded = client.post(
        "/admin/rag/transcripts/upload",
        json={
            "video_id": "upload-normal",
            "lang": "ko",
            "segments": [
                {"start": 3, "text": "첫 업로드 자막"},
                {"start": 20, "text": "둘째 업로드 자막"},
            ],
        },
        headers=headers,
    )
    emptied = client.post(
        "/admin/rag/transcripts/upload",
        json={"video_id": "upload-empty", "segments": []},
        headers=headers,
    )
    missing = client.post(
        "/admin/rag/transcripts/upload",
        json={"video_id": "upload-missing", "segments": []},
        headers=headers,
    )

    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json() == {
        "video_id": "upload-normal",
        "created_chunks": 1,
        "status": "fetched",
    }
    assert emptied.status_code == 200, emptied.text
    assert emptied.json() == {
        "video_id": "upload-empty",
        "created_chunks": 0,
        "status": "unavailable",
    }
    assert missing.status_code == 404
    with get_session_factory()() as db:
        normal_video = db.get(YoutubeVideo, "upload-normal")
        empty_video = db.get(YoutubeVideo, "upload-empty")
        normal_chunks = db.scalars(
            select(RagChunk)
            .where(RagChunk.youtube_video_id == "upload-normal")
            .order_by(RagChunk.chunk_index)
        ).all()
        empty_chunk = db.scalar(
            select(RagChunk).where(
                RagChunk.youtube_video_id == "upload-empty",
                RagChunk.chunk_index == 1,
            )
        )

    assert normal_video is not None
    assert normal_video.transcript_status == "fetched"
    assert normal_video.transcript_lang == "ko"
    assert normal_video.transcript_fetched_at is not None
    assert [chunk.chunk_index for chunk in normal_chunks] == [0, 1]
    assert normal_chunks[1].content == "[0:03] 첫 업로드 자막 둘째 업로드 자막"
    assert empty_video is not None
    assert empty_video.transcript_status == "unavailable"
    assert empty_video.transcript_lang == "ko"
    assert empty_video.transcript_fetched_at is not None
    assert empty_chunk is not None
    assert empty_chunk.content == "[0:02] 보존될 자막"


def test_pending_transcripts_endpoint_filters_status_days_and_include_failed(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}
    now = datetime.now(UTC)

    with get_session_factory()() as db:
        videos = [
            _video("pending-recent", published_at=now - timedelta(days=1), status="pending"),
            _video("pending-old", published_at=now - timedelta(days=10), status="pending"),
            _video("failed-recent", published_at=now - timedelta(days=2), status="failed"),
            _video("unavailable-recent", published_at=now, status="unavailable"),
        ]
        _add_source_with_videos(db, videos)
        db.commit()

    pending_only = client.get(
        "/admin/rag/transcripts/pending?artist_id=1&limit=10&days=3",
        headers=headers,
    )
    with_failed = client.get(
        "/admin/rag/transcripts/pending?artist_id=1&limit=10&days=3&include_failed=true",
        headers=headers,
    )

    assert pending_only.status_code == 200, pending_only.text
    assert [item["id"] for item in pending_only.json()] == ["pending-recent"]
    assert with_failed.status_code == 200, with_failed.text
    assert [item["id"] for item in with_failed.json()] == ["pending-recent", "failed-recent"]


def test_external_updates_backfill_endpoint_embeds_missing_and_stale_chunks(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}
    now = datetime.now(UTC)

    with get_session_factory()() as db:
        skip = ExternalUpdate(
            artist_id=1,
            source_type="naver_news",
            external_id="backfill-skip",
            title="RESCENE backfill skip",
            description="이미 임베딩된 뉴스",
            url="https://news.example.com/backfill-skip",
            thumbnail_url="",
            source_label="Naver News",
            published_at=now,
            content_hash="backfill-skip-hash",
            raw_payload={},
        )
        missing = ExternalUpdate(
            artist_id=1,
            source_type="naver_blog",
            external_id="backfill-missing",
            title="RESCENE backfill missing",
            description="새로 임베딩할 블로그",
            url="https://blog.example.com/backfill-missing",
            thumbnail_url="",
            source_label="Naver Blog",
            published_at=now - timedelta(minutes=1),
            content_hash="backfill-missing-hash",
            raw_payload={},
        )
        stale = ExternalUpdate(
            artist_id=1,
            source_type="naver_news",
            external_id="backfill-stale",
            title="RESCENE backfill stale",
            description="이전 뉴스",
            url="https://news.example.com/backfill-stale",
            thumbnail_url="",
            source_label="Naver News",
            published_at=now - timedelta(minutes=2),
            content_hash="backfill-stale-hash",
            raw_payload={},
        )
        db.add_all([skip, missing, stale])
        db.flush()
        refresh_external_update_chunks(db, skip)
        refresh_external_update_chunks(db, stale)
        stale.description = "변경된 뉴스"
        stale.content_hash = "backfill-stale-changed-hash"
        db.commit()

    response = client.post(
        "/admin/rag/external-updates/backfill",
        json={"artist_id": 1, "limit": 2},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"processed": 3, "embedded": 2, "skipped": 1}
    with get_session_factory()() as db:
        chunks = {
            item.external_id: db.scalar(
                select(RagChunk).where(
                    RagChunk.external_update_id == item.id,
                    RagChunk.chunk_index == 0,
                )
            )
            for item in db.scalars(select(ExternalUpdate)).all()
            if item.external_id.startswith("backfill-")
        }

    assert set(chunks) == {"backfill-skip", "backfill-missing", "backfill-stale"}
    assert all(chunk is not None for chunk in chunks.values())
    assert "변경된 뉴스" in chunks["backfill-stale"].content


def test_fetch_transcripts_batch_defaults_to_pending_only_and_force_includes_all(client, monkeypatch):
    now = datetime.now(UTC)
    calls: list[str] = []

    with get_session_factory()() as db:
        videos = [
            _video("candidate-pending", published_at=now, status="pending"),
            _video("candidate-failed", published_at=now - timedelta(minutes=1), status="failed"),
            _video("candidate-unavailable", published_at=now - timedelta(minutes=2), status="unavailable"),
            _video("candidate-fetched", published_at=now - timedelta(minutes=3), status="fetched"),
        ]
        _add_source_with_videos(db, videos)
        db.commit()

    def fake_fetch(video_id: str):
        calls.append(video_id)
        return "unavailable", "", []

    monkeypatch.setattr("app.services.transcripts.fetch_video_transcript", fake_fetch)

    with get_session_factory()() as db:
        default_result = fetch_transcripts_batch(db, 1, limit=10)
        db.commit()
    default_calls = list(calls)
    calls.clear()
    with get_session_factory()() as db:
        force_result = fetch_transcripts_batch(db, 1, limit=10, force=True)
        db.commit()

    assert default_result["processed"] == 1
    assert default_calls == ["candidate-pending"]
    assert force_result["processed"] == 4
    assert set(calls) == {
        "candidate-pending",
        "candidate-failed",
        "candidate-unavailable",
        "candidate-fetched",
    }


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
