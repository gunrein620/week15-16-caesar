from sqlalchemy import select

from app.core.db import get_session_factory
from app.models import RagChunk
from tests.conftest import signup


def test_post_crud_comments_tags_and_rag_chunk_lifecycle(client):
    token = signup(client)
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post(
        "/posts",
        json={
            "title": "리센느 테스트 글",
            "content": "처음 내용입니다. Love Attack 이야기를 합니다.",
            "artist_id": 1,
            "tags": ["stage", "Fan"],
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    post_id = created.json()["id"]
    assert created.json()["tags"] == ["fan", "stage"]

    listed = client.get("/posts", params={"search": "Love Attack", "tag": "stage"})
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1

    comment = client.post(
        f"/posts/{post_id}/comments",
        json={"content": "댓글입니다."},
        headers=headers,
    )
    assert comment.status_code == 201

    with get_session_factory()() as db:
        assert db.scalar(select(RagChunk).where(RagChunk.post_id == post_id)) is not None

    updated = client.put(
        f"/posts/{post_id}",
        json={"content": "수정된 내용입니다. 이전 키워드는 제거합니다.", "tags": ["updated"]},
        headers=headers,
    )
    assert updated.status_code == 200
    with get_session_factory()() as db:
        chunks = db.scalars(select(RagChunk).where(RagChunk.post_id == post_id)).all()
        assert chunks
        assert all("Love Attack" not in chunk.content for chunk in chunks)

    deleted = client.delete(f"/posts/{post_id}", headers=headers)
    assert deleted.status_code == 204
    with get_session_factory()() as db:
        assert db.scalar(select(RagChunk).where(RagChunk.post_id == post_id)) is None
