import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.db import get_session_factory
from app.models import RagChunk, YoutubeVideo
from app.services.rag import refresh_video_chunks
from tests.conftest import login, signup


def test_post_crud_comments_tags_and_rag_chunk_lifecycle(client):
    token = signup(client)
    headers = {"Authorization": f"Bearer {token}"}
    old_marker = "old-rag-marker-qa"
    new_marker = "new-rag-marker-qa"

    created = client.post(
        "/posts",
        json={
            "title": "리센느 테스트 글",
            "content": f"처음 내용입니다. {old_marker} 이야기를 합니다.",
            "artist_id": 1,
            "tags": ["stage", "Fan"],
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    post_id = created.json()["id"]
    assert created.json()["tags"] == ["fan", "stage"]

    listed = client.get("/posts", params={"search": old_marker, "tag": "stage"})
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1

    first_qa = client.post(
        "/ai/qa",
        json={"question": f"{old_marker} 내용은?", "artist_id": 1},
        headers=headers,
    )
    assert first_qa.status_code == 200, first_qa.text
    assert old_marker in first_qa.json()["answer"]
    post_sources = [source for source in first_qa.json()["sources"] if source["post_id"] == post_id]
    assert post_sources
    assert post_sources[0]["source_type"] == "post"
    assert post_sources[0]["title"] == "리센느 테스트 글"
    assert post_sources[0]["url"] == f"/posts/{post_id}"

    comment = client.post(
        f"/posts/{post_id}/comments",
        json={"content": "댓글입니다."},
        headers=headers,
    )
    assert comment.status_code == 201

    with get_session_factory()() as db:
        chunks = db.scalars(
            select(RagChunk).where(RagChunk.post_id == post_id).order_by(RagChunk.chunk_index)
        ).all()
        assert chunks
        assert [chunk.chunk_index for chunk in chunks] == list(range(len(chunks)))
        db.add(
            RagChunk(
                artist_id=chunks[0].artist_id,
                post_id=post_id,
                chunk_index=chunks[0].chunk_index,
                content="duplicate index",
                content_hash="duplicate",
                embedding=[0.0] * 1536,
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    updated = client.put(
        f"/posts/{post_id}",
        json={"content": f"수정된 내용입니다. {new_marker}만 남깁니다.", "tags": ["updated"]},
        headers=headers,
    )
    assert updated.status_code == 200
    with get_session_factory()() as db:
        chunks = db.scalars(select(RagChunk).where(RagChunk.post_id == post_id)).all()
        assert chunks
        assert all(old_marker not in chunk.content for chunk in chunks)

    second_qa = client.post(
        "/ai/qa",
        json={"question": f"{new_marker} 내용은?", "artist_id": 1},
        headers=headers,
    )
    assert second_qa.status_code == 200, second_qa.text
    assert new_marker in second_qa.json()["answer"]
    assert old_marker not in second_qa.json()["answer"]

    deleted = client.delete(f"/posts/{post_id}", headers=headers)
    assert deleted.status_code == 204
    with get_session_factory()() as db:
        assert db.scalar(select(RagChunk).where(RagChunk.post_id == post_id)) is None


def test_admin_can_update_and_delete_any_post(client):
    owner_token = signup(client, "post-owner@example.com")
    other_token = signup(client, "post-other@example.com")
    admin_token = login(client, "admin@example.com", "admin-password")

    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    created = client.post(
        "/posts",
        json={
            "title": "작성자 글",
            "content": "작성자만 쓴 글입니다.",
            "artist_id": 1,
            "tags": ["owner"],
        },
        headers=owner_headers,
    )
    assert created.status_code == 201, created.text
    post_id = created.json()["id"]

    forbidden_update = client.put(
        f"/posts/{post_id}",
        json={"title": "다른 사용자의 수정"},
        headers=other_headers,
    )
    forbidden_delete = client.delete(f"/posts/{post_id}", headers=other_headers)

    assert forbidden_update.status_code == 403
    assert forbidden_delete.status_code == 403

    admin_update = client.put(
        f"/posts/{post_id}",
        json={"title": "관리자가 수정한 글", "content": "관리자 수정 내용입니다."},
        headers=admin_headers,
    )
    assert admin_update.status_code == 200, admin_update.text
    assert admin_update.json()["title"] == "관리자가 수정한 글"
    assert admin_update.json()["author"]["email"] == "post-owner@example.com"

    admin_delete = client.delete(f"/posts/{post_id}", headers=admin_headers)
    assert admin_delete.status_code == 204
    assert client.get(f"/posts/{post_id}").status_code == 404


def test_minimal_seed_posts_have_rag_chunks(client):
    with get_session_factory()() as db:
        seeded_chunks = db.scalars(select(RagChunk).where(RagChunk.post_id.is_not(None))).all()
    assert len(seeded_chunks) >= 3

    page_one = client.get("/posts", params={"page": 1, "page_size": 2})
    page_two = client.get("/posts", params={"page": 2, "page_size": 2})
    assert page_one.status_code == 200
    assert page_two.status_code == 200
    assert page_one.json()["total"] >= 3
    assert len(page_one.json()["items"]) == 2
    assert len(page_two.json()["items"]) >= 1


def test_rag_youtube_sources_include_card_metadata(client):
    token = signup(client, "rag-youtube@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    marker = "special-youtube-source-marker"

    with get_session_factory()() as db:
        video = YoutubeVideo(
            id="source-video",
            title="RESCENE source video",
            description=f"RAG source description {marker}",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/source-video/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=source-video",
            view_count=1234,
            like_count=100,
            comment_count=12,
            content_hash="source-video-hash",
        )
        db.add(video)
        db.flush()
        refresh_video_chunks(db, video, artist_id=1)
        db.commit()

    response = client.post(
        "/ai/qa",
        json={"question": marker, "artist_id": 1},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    source = next(
        item for item in response.json()["sources"] if item["youtube_video_id"] == "source-video"
    )
    assert source["source_type"] == "youtube"
    assert source["title"] == "RESCENE source video"
    assert source["url"] == "https://www.youtube.com/watch?v=source-video"
    assert source["thumbnail_url"].endswith("/hqdefault.jpg")
    assert source["channel_title"] == "RESCENE"
    assert source["view_count"] == 1234


def test_rag_song_title_query_excludes_other_song_sources(client):
    token = signup(client, "rag-song-filter@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    with get_session_factory()() as db:
        love_attack = YoutubeVideo(
            id="love-attack-stage",
            title="RESCENE LOVE ATTACK Dance Practice",
            description="리센느 러브어택 무대 영상입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/love-attack-stage/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=love-attack-stage",
            view_count=1000,
            like_count=100,
            comment_count=10,
            content_hash="love-attack-stage-hash",
        )
        deja_vu = YoutubeVideo(
            id="deja-vu-stage",
            title="RESCENE Deja Vu Stage",
            description="리센느 원이 무대 영상입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/deja-vu-stage/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=deja-vu-stage",
            view_count=900,
            like_count=90,
            comment_count=9,
            content_hash="deja-vu-stage-hash",
        )
        db.add_all([love_attack, deja_vu])
        db.flush()
        refresh_video_chunks(db, love_attack, artist_id=1)
        refresh_video_chunks(db, deja_vu, artist_id=1)
        db.commit()

    response = client.post(
        "/ai/qa",
        json={"question": "러브어택 무대 영상 모아줘", "artist_id": 1},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    source_ids = {source["youtube_video_id"] for source in response.json()["sources"]}
    assert "love-attack-stage" in source_ids
    assert "deja-vu-stage" not in source_ids


def test_rag_song_title_filter_uses_admin_archive_terms(client):
    token = signup(client, "rag-dictionary-filter@example.com")
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    term = client.post(
        "/artists/1/archive-terms",
        json={
            "term_type": "song",
            "title": "Dream Signal",
            "aliases": ["드림시그널"],
        },
        headers=admin_headers,
    )
    assert term.status_code == 201, term.text

    with get_session_factory()() as db:
        dream_signal = YoutubeVideo(
            id="dream-signal-stage",
            title="RESCENE Dream Signal Stage",
            description="리센느 드림시그널 무대 영상입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/dream-signal-stage/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=dream-signal-stage",
            view_count=1000,
            like_count=100,
            comment_count=10,
            content_hash="dream-signal-stage-hash",
        )
        other_stage = YoutubeVideo(
            id="other-stage",
            title="RESCENE Other Stage",
            description="리센느 원이 무대 영상입니다.",
            channel_title="RESCENE",
            thumbnail_url="https://img.youtube.com/vi/other-stage/hqdefault.jpg",
            url="https://www.youtube.com/watch?v=other-stage",
            view_count=900,
            like_count=90,
            comment_count=9,
            content_hash="other-stage-hash",
        )
        db.add_all([dream_signal, other_stage])
        db.flush()
        refresh_video_chunks(db, dream_signal, artist_id=1)
        refresh_video_chunks(db, other_stage, artist_id=1)
        db.commit()

    response = client.post(
        "/ai/qa",
        json={"question": "드림시그널 무대 영상 모아줘", "artist_id": 1},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    source_ids = {source["youtube_video_id"] for source in response.json()["sources"]}
    assert "dream-signal-stage" in source_ids
    assert "other-stage" not in source_ids
