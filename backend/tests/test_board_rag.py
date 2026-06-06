import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.db import get_session_factory
from app.models import RagChunk, YoutubeVideo
from app.services.rag import refresh_video_chunks
from tests.conftest import signup


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
