from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import ArtistKeyword, Member, Post, RagChunk, YoutubeVideo
from app.schemas import UpdateFeedItem
from app.services.search_intent import SearchIntent, intent_from_payload, parse_search_intent
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


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    settings = get_settings()
    if settings.openai_api_key:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.embeddings.create(model=settings.embedding_model, input=texts)
        return [item.embedding for item in response.data]
    return [deterministic_embedding(text) for text in texts]


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


def search_chunks(
    db: Session,
    question: str,
    artist_id: int,
    limit: int = 10,
    offset: int = 0,
    intent: SearchIntent | None = None,
) -> list[RagChunk]:
    from app.services.archive_search import search_archive_candidates

    return search_archive_candidates(
        db,
        question,
        artist_id=artist_id,
        limit=limit,
        offset=offset,
        intent=intent,
    )


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
    if intent.published_after is not None:
        return intent.published_after
    if intent.temporal == "today":
        now_kst = datetime.now(KST)
        cutoff_time = intent.time_after
        if cutoff_time is not None:
            return now_kst.replace(
                hour=cutoff_time.hour,
                minute=cutoff_time.minute,
                second=0,
                microsecond=0,
            ).astimezone(UTC)
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
    return any(
        any(alias in haystack for alias in term.aliases)
        for term in intent.archive_terms
    )


def _matches_structured_terms(item: UpdateFeedItem, intent: SearchIntent) -> bool:
    if not intent.include_terms and not intent.exclude_terms and not intent.source_types:
        return True
    if intent.source_types and item.item_type not in intent.source_types:
        return False
    from app.services.search_intent import normalize_search_text

    haystack = normalize_search_text(
        " ".join(
            [
                item.title,
                item.description,
                item.source_label,
                *item.tags,
                *item.matched_keywords,
                *item.member_names,
            ]
        )
    )
    includes = [normalize_search_text(term) for term in intent.include_terms if normalize_search_text(term)]
    excludes = [normalize_search_text(term) for term in intent.exclude_terms if normalize_search_text(term)]
    return all(term in haystack for term in includes) and not any(
        term in haystack for term in excludes
    )


def _sort_temporal_items(items: list[UpdateFeedItem], intent: SearchIntent) -> list[UpdateFeedItem]:
    if intent.sort == "popular":
        return sorted(
            items,
            key=lambda item: (
                item.view_count if item.view_count is not None else -1,
                _aware_utc(item.published_at),
            ),
            reverse=True,
        )
    return items


def _intent_for_question(
    db: Session,
    question: str,
    artist_id: int,
    payload: dict | None,
) -> SearchIntent:
    if payload:
        reused = intent_from_payload(payload, question=question, artist_id=artist_id, db=db)
        if reused is not None:
            return reused
    return parse_search_intent(question, artist_id=artist_id, db=db)


def _temporal_update_sources(
    db: Session,
    intent: SearchIntent,
    *,
    limit: int = 10,
    offset: int = 0,
) -> list[dict]:
    source = "youtube" if intent.media_type == "youtube" else None
    response = get_artist_updates(db, intent.artist_id, source=source, limit=max(80, limit + offset + 10))
    cutoff = _temporal_cutoff(intent)
    items = response.items
    if cutoff is not None:
        items = [item for item in items if _aware_utc(item.published_at) >= cutoff]
    if intent.published_before is not None:
        items = [
            item
            for item in items
            if _aware_utc(item.published_at) <= intent.published_before
        ]
    items = [item for item in items if _matches_temporal_archive_terms(item, intent)]
    items = [item for item in items if _matches_structured_terms(item, intent)]
    items = _sort_temporal_items(items, intent)
    return [_update_source_payload(item) for item in items[offset : offset + limit]]


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


def answer_question(
    db: Session,
    question: str,
    artist_id: int,
    *,
    limit: int = 10,
    offset: int = 0,
    include_answer: bool = True,
    search_intent_payload: dict | None = None,
) -> tuple[str, list[dict], bool, int | None, SearchIntent]:
    intent = _intent_for_question(db, question, artist_id, search_intent_payload)
    if intent.route == "updates":
        sources = _temporal_update_sources(db, intent, limit=limit + 1, offset=offset)
        has_more = len(sources) > limit
        visible = sources[:limit]
        answer = _temporal_answer(intent, visible) if include_answer else ""
        return answer, visible, has_more, offset + limit if has_more else None, intent

    settings = get_settings()
    if offset == 0:
        candidate_limit = max(settings.rerank_candidates, limit + 1)
        chunks = search_chunks(
            db,
            question,
            artist_id,
            limit=candidate_limit,
            offset=0,
            intent=intent,
        )
        if settings.rerank_enabled and settings.openai_api_key and chunks:
            from app.services.rerank import rerank_sources

            rerank_candidates = []
            for chunk in chunks:
                source = _chunk_source_payload(db, chunk)
                rerank_candidates.append(
                    {
                        "id": chunk.id,
                        "title": source.get("title", ""),
                        "snippet": chunk.content[:200],
                    }
                )
            ranking = rerank_sources(question, rerank_candidates, top_k=limit)
            if ranking is not None:
                chunk_by_id = {chunk.id: chunk for chunk in chunks}
                ranked_chunks = [
                    chunk_by_id[chunk_id]
                    for chunk_id in ranking
                    if chunk_id in chunk_by_id
                ]
                ranked_ids = {chunk.id for chunk in ranked_chunks}
                chunks = [
                    *ranked_chunks,
                    *(chunk for chunk in chunks if chunk.id not in ranked_ids),
                ]
    else:
        chunks = search_chunks(
            db,
            question,
            artist_id,
            limit=limit + 1,
            offset=offset,
            intent=intent,
        )
    has_more = len(chunks) > limit
    chunks = chunks[:limit]
    sources = [_chunk_source_payload(db, chunk) for chunk in chunks]
    if not chunks:
        answer = "아직 참고할 게시글이나 영상 데이터가 없습니다." if include_answer else ""
        return answer, sources, False, None, intent
    if not include_answer:
        return "", sources, has_more, offset + limit if has_more else None, intent

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
        return (
            response.choices[0].message.content or "",
            sources,
            has_more,
            offset + limit if has_more else None,
            intent,
        )

    return (
        f"관련 근거를 찾았습니다: {chunks[0].content}",
        sources,
        has_more,
        offset + limit if has_more else None,
        intent,
    )


def similar_posts(db: Session, post_id: int, limit: int = 5) -> list[Post]:
    source_post = db.get(Post, post_id)
    if source_post is None:
        return []
    source_chunk = db.scalar(
        select(RagChunk).where(RagChunk.post_id == post_id, RagChunk.chunk_index == 0)
    )
    if source_chunk is not None:
        source_embedding = source_chunk.embedding
    else:
        source_embedding = embed_text(f"{source_post.title}\n\n{source_post.content}")
    rows = db.execute(
        select(Post, RagChunk)
        .join(RagChunk, RagChunk.post_id == Post.id)
        .where(
            Post.id != post_id,
            Post.artist_id == source_post.artist_id,
            RagChunk.chunk_index == 0,
        )
    ).all()
    ranked = sorted(
        rows,
        key=lambda row: cosine_similarity(source_embedding, row[1].embedding),
        reverse=True,
    )
    return [row[0] for row in ranked[:limit]]
