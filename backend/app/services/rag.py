from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import ArtistKeyword, Member, Post, RagChunk, YoutubeVideo
from app.schemas import UpdateFeedItem
from app.services.search_intent import SearchIntent, parse_search_intent
from app.services.text import chunk_text, content_hash, cosine_similarity, deterministic_embedding
from app.services.updates import _matches_keywords, _matches_youtube_members, get_artist_updates


KST = timezone(timedelta(hours=9))


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


def _published_at_text(value: datetime | None) -> str:
    if value is None:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def build_video_embedding_text(db: Session, video: YoutubeVideo, artist_id: int) -> str:
    members = [item.name for item in db.scalars(select(Member).where(Member.artist_id == artist_id)).all()]
    keywords = [
        item.keyword
        for item in db.scalars(select(ArtistKeyword).where(ArtistKeyword.artist_id == artist_id)).all()
    ]
    description = video.description or ""
    matched_members = _matches_youtube_members(
        video.title or "",
        description,
        video.channel_title or "",
        members,
    )
    matched_keywords = _matches_keywords(
        "\n".join([video.title or "", description, video.channel_title or ""]),
        keywords,
    )
    lines = [
        f"title: {video.title or ''}",
        f"channel: {video.channel_title or ''}",
        f"published_at: {_published_at_text(video.published_at)}",
        f"views: {video.view_count if video.view_count is not None else ''}",
        f"members: {', '.join(matched_members)}",
        f"keywords: {', '.join(matched_keywords)}",
        f"description: {description[:700]}",
    ]
    return "\n".join(line for line in lines if line.split(": ", 1)[-1].strip()).strip()


def video_embedding_hash(db: Session, video: YoutubeVideo, artist_id: int) -> str:
    return content_hash(build_video_embedding_text(db, video, artist_id))


def refresh_video_chunks(db: Session, video: YoutubeVideo, artist_id: int) -> int:
    db.execute(delete(RagChunk).where(RagChunk.youtube_video_id == video.id))
    body = build_video_embedding_text(db, video, artist_id)
    hashed = content_hash(body)
    if not body:
        return 0
    db.add(
        RagChunk(
            artist_id=artist_id,
            youtube_video_id=video.id,
            chunk_index=0,
            content=body,
            content_hash=hashed,
            embedding=embed_text(body),
        )
    )
    return 1


def search_chunks(db: Session, question: str, artist_id: int, limit: int = 5) -> list[RagChunk]:
    from app.services.archive_search import search_archive_candidates

    return search_archive_candidates(db, question, artist_id=artist_id, limit=limit)


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
            "source_label": "YouTube",
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
        "source_label": "Fan post",
        "published_at": post.created_at.isoformat() if post and post.created_at else None,
        "view_count": None,
    }


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _temporal_cutoff(intent: SearchIntent) -> datetime | None:
    if intent.temporal == "today":
        now_kst = datetime.now(KST)
        return now_kst.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
    if intent.temporal == "recent":
        return datetime.now(UTC) - timedelta(days=7)
    return None


def _post_id_from_url(url: str) -> int | None:
    if not url.startswith("/posts/"):
        return None
    try:
        return int(url.removeprefix("/posts/").split("/", 1)[0])
    except ValueError:
        return None


def _update_source_payload(item: UpdateFeedItem) -> dict:
    item_type, _, raw_id = item.id.partition(":")
    post_id = _post_id_from_url(item.url)
    return {
        "chunk_id": None,
        "post_id": post_id,
        "youtube_video_id": raw_id if item_type == "youtube" else None,
        "source_type": item.item_type,
        "title": item.title,
        "url": item.url,
        "thumbnail_url": item.thumbnail_url,
        "channel_title": item.source_label,
        "source_label": item.source_label,
        "published_at": item.published_at.isoformat(),
        "view_count": item.view_count,
        "comment_count": item.comment_count,
        "content": item.description,
        "description": item.description,
    }


def _matches_temporal_archive_terms(item: UpdateFeedItem, intent: SearchIntent) -> bool:
    if not intent.archive_terms:
        return True
    from app.services.search_intent import normalize_search_text

    haystack = normalize_search_text(
        " ".join([item.title, item.description, *item.tags, *item.matched_keywords])
    )
    return all(
        any(alias in haystack for alias in term.aliases)
        for term in intent.archive_terms
    )


def _temporal_update_sources(
    db: Session,
    intent: SearchIntent,
    *,
    limit: int = 5,
) -> list[dict]:
    source = "youtube" if intent.media_type == "youtube" else None
    response = get_artist_updates(db, intent.artist_id, source=source, limit=80)
    cutoff = _temporal_cutoff(intent)
    items = response.items
    if cutoff is not None:
        items = [item for item in items if _aware_utc(item.published_at) >= cutoff]
    items = [item for item in items if _matches_temporal_archive_terms(item, intent)]
    return [_update_source_payload(item) for item in items[:limit]]


def _temporal_answer(intent: SearchIntent, sources: list[dict]) -> str:
    if not sources:
        if intent.temporal == "today":
            return "오늘 올라온 캐시 업데이트를 아직 찾지 못했습니다. 관리자 동기화 후 다시 확인해 주세요."
        return "최근 캐시 업데이트를 아직 찾지 못했습니다. 관리자 동기화 후 다시 확인해 주세요."
    label = "오늘" if intent.temporal == "today" else "최근"
    return f"{label} 업데이트를 시간순으로 찾았습니다. 아래 카드에서 영상, 글, 뉴스 원문을 바로 확인해 주세요."


def format_context_for_answer(payloads: list[dict]) -> str:
    blocks: list[str] = []
    for index, source in enumerate(payloads, start=1):
        lines = [
            f"[source {index}]",
            f"source_type: {source.get('source_type') or ''}",
            f"title: {source.get('title') or ''}",
            f"published_at: {source.get('published_at') or ''}",
            f"url: {source.get('url') or ''}",
            f"content: {source.get('content') or source.get('description') or ''}",
        ]
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def answer_question(db: Session, question: str, artist_id: int) -> tuple[str, list[dict]]:
    intent = parse_search_intent(question, artist_id=artist_id, db=db)
    if intent.route == "updates":
        sources = _temporal_update_sources(db, intent)
        return _temporal_answer(intent, sources), sources

    chunks = search_chunks(db, question, artist_id)
    sources = [_chunk_source_payload(db, chunk) for chunk in chunks]
    if not chunks:
        return "아직 참고할 게시글이나 영상 데이터가 없습니다.", sources

    settings = get_settings()
    context = format_context_for_answer(sources)
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
