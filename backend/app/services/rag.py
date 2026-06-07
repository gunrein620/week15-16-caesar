import re

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import ArtistArchiveTerm, Post, RagChunk, YoutubeVideo
from app.services.text import chunk_text, content_hash, cosine_similarity, deterministic_embedding


def _normalize_keyword_text(value: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]+", "", value.lower())


def _required_alias_groups(db: Session, artist_id: int, question: str) -> list[tuple[str, ...]]:
    normalized_question = _normalize_keyword_text(question)
    groups: list[tuple[str, ...]] = []
    archive_terms = db.scalars(
        select(ArtistArchiveTerm).where(ArtistArchiveTerm.artist_id == artist_id)
    ).all()
    for term in archive_terms:
        aliases = [term.title, *(term.aliases or [])]
        normalized_aliases = tuple(
            dict.fromkeys(
                alias
                for alias in (_normalize_keyword_text(value) for value in aliases)
                if alias
            )
        )
        if any(alias and alias in normalized_question for alias in normalized_aliases):
            groups.append(normalized_aliases)
    return groups


def _matches_required_aliases(chunk: RagChunk, required_groups: list[tuple[str, ...]]) -> bool:
    if not required_groups:
        return True
    normalized_content = _normalize_keyword_text(chunk.content)
    return all(any(alias and alias in normalized_content for alias in aliases) for aliases in required_groups)


def embed_text(text: str) -> list[float]:
    settings = get_settings()
    if settings.openai_api_key:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.embeddings.create(model=settings.embedding_model, input=text)
        return response.data[0].embedding
    return deterministic_embedding(text)


def refresh_post_chunks(db: Session, post: Post) -> None:
    db.execute(delete(RagChunk).where(RagChunk.post_id == post.id))
    body = f"{post.title}\n\n{post.content}"
    hashed = content_hash(body)
    for index, chunk in enumerate(chunk_text(body)):
        db.add(
            RagChunk(
                artist_id=post.artist_id,
                post_id=post.id,
                chunk_index=index,
                content=chunk,
                content_hash=hashed,
                embedding=embed_text(chunk),
            )
        )


def refresh_video_chunks(db: Session, video: YoutubeVideo, artist_id: int) -> None:
    db.execute(delete(RagChunk).where(RagChunk.youtube_video_id == video.id))
    body = f"{video.title}\n\n{video.description}"
    hashed = content_hash(body)
    for index, chunk in enumerate(chunk_text(body)):
        db.add(
            RagChunk(
                artist_id=artist_id,
                youtube_video_id=video.id,
                chunk_index=index,
                content=chunk,
                content_hash=hashed,
                embedding=embed_text(chunk),
            )
        )


def search_chunks(db: Session, question: str, artist_id: int, limit: int = 5) -> list[RagChunk]:
    query_embedding = embed_text(question)
    chunks = db.scalars(select(RagChunk).where(RagChunk.artist_id == artist_id)).all()
    ranked = sorted(
        chunks,
        key=lambda chunk: cosine_similarity(query_embedding, chunk.embedding),
        reverse=True,
    )
    required_groups = _required_alias_groups(db, artist_id, question)
    if required_groups:
        ranked = [chunk for chunk in ranked if _matches_required_aliases(chunk, required_groups)]
    return ranked[:limit]


def _chunk_source_payload(db: Session, chunk: RagChunk) -> dict:
    base = {
        "chunk_id": chunk.id,
        "post_id": chunk.post_id,
        "youtube_video_id": chunk.youtube_video_id,
        "content": chunk.content,
    }
    if chunk.youtube_video_id:
        video = chunk.youtube_video or db.get(YoutubeVideo, chunk.youtube_video_id)
        return {
            **base,
            "source_type": "youtube",
            "title": video.title if video else "YouTube video",
            "url": video.url if video else "",
            "thumbnail_url": video.thumbnail_url if video else "",
            "channel_title": video.channel_title if video else "",
            "published_at": video.published_at.isoformat() if video and video.published_at else None,
            "view_count": video.view_count if video else None,
        }
    post = chunk.post or (db.get(Post, chunk.post_id) if chunk.post_id else None)
    return {
        **base,
        "source_type": "post",
        "title": post.title if post else "Board post",
        "url": f"/posts/{post.id}" if post else "",
        "thumbnail_url": "",
        "channel_title": "",
        "published_at": post.created_at.isoformat() if post and post.created_at else None,
        "view_count": None,
    }


def answer_question(db: Session, question: str, artist_id: int) -> tuple[str, list[dict]]:
    chunks = search_chunks(db, question, artist_id)
    sources = [_chunk_source_payload(db, chunk) for chunk in chunks]
    if not chunks:
        return "아직 참고할 게시글이나 영상 데이터가 없습니다.", sources

    settings = get_settings()
    context = "\n\n".join(chunk.content for chunk in chunks)
    if settings.openai_api_key:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.chat_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Answer in Korean using only the provided RESCENE community context. "
                        "Keep it to two short sentences and do not list raw URLs because source cards are shown separately."
                    ),
                },
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
            ],
        )
        return response.choices[0].message.content or "", sources

    return f"관련 근거를 찾았습니다: {chunks[0].content}", sources


def similar_posts(db: Session, post_id: int, limit: int = 5) -> list[Post]:
    source_post = db.get(Post, post_id)
    if source_post is None:
        return []
    source_embedding = embed_text(f"{source_post.title}\n\n{source_post.content}")
    posts = db.scalars(select(Post).where(Post.id != post_id, Post.artist_id == source_post.artist_id)).all()
    ranked = sorted(
        posts,
        key=lambda post: cosine_similarity(
            source_embedding, embed_text(f"{post.title}\n\n{post.content}")
        ),
        reverse=True,
    )
    return ranked[:limit]
