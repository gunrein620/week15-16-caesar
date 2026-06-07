from datetime import UTC, datetime, timedelta

from app.core.db import get_session_factory
from app.services.scheduled_sync import run_due_syncs_once


def test_scheduled_sync_runs_due_jobs_on_separate_intervals(client, monkeypatch):
    calls: list[tuple[str, object]] = []
    now = datetime(2030, 6, 7, 12, tzinfo=UTC)

    def fake_sync_artist_videos(db, artist_id, *, source_types=None):
        calls.append(("youtube", tuple(sorted(source_types or []))))
        return {"created": 0, "updated": 0, "linked": 0}

    def fake_sync_external_updates(db, artist_id):
        calls.append(("naver", artist_id))
        return {"naver_available": True, "naver_created": 0, "naver_updated": 0}

    monkeypatch.setattr("app.services.scheduled_sync.sync_artist_videos", fake_sync_artist_videos)
    monkeypatch.setattr("app.services.scheduled_sync.sync_external_updates", fake_sync_external_updates)

    with get_session_factory()() as db:
        first = run_due_syncs_once(db, artist_id=1, now=now)
        calls_after_first = list(calls)
        second = run_due_syncs_once(db, artist_id=1, now=now + timedelta(minutes=59))
        third = run_due_syncs_once(db, artist_id=1, now=now + timedelta(minutes=60))
        fourth = run_due_syncs_once(db, artist_id=1, now=now + timedelta(minutes=120))
        fifth = run_due_syncs_once(db, artist_id=1, now=now + timedelta(minutes=180))
        sixth = run_due_syncs_once(db, artist_id=1, now=now + timedelta(minutes=720))

    assert first["ran"] == ["official", "member", "fan", "curated", "naver", "keyword"]
    assert calls_after_first == [
        ("youtube", ("official_channel",)),
        ("youtube", ("member_channel",)),
        ("youtube", ("fan_channel",)),
        ("youtube", ("curated_video",)),
        ("naver", 1),
        ("youtube", ("keyword_search",)),
    ]
    assert second["ran"] == []
    assert third["ran"] == ["fan", "naver"]
    assert fourth["ran"] == ["member", "fan", "naver", "keyword"]
    assert fifth["ran"] == ["official", "fan", "naver"]
    assert sixth["ran"] == ["official", "member", "fan", "curated", "naver", "keyword"]
