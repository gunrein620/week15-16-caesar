from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.db import is_postgres
from app.models import Post, RagChunk, YoutubeVideo
from app.services.search_intent import (
    SearchIntent,
    normalize_search_text,
    parse_search_intent,
)
from app.services.text import cosine_similarity


@dataclass(frozen=True)
class _ChunkSource:
    key: tuple[str, str]
    title: str
    tags: tuple[str, ...]
    source_type: str


def _source_for_chunk(db: Session, chunk: RagChunk) -> _ChunkSource | None:
    if chunk.youtube_video_id:
        video = chunk.youtube_video or db.get(YoutubeVideo, chunk.youtube_video_id)
        if video is None:
            return None
        return _ChunkSource(
            key=("youtube", video.id),
            title=video.title,
            tags=(),
            source_type="youtube",
        )

    if chunk.post_id:
        post = chunk.post or db.get(Post, chunk.post_id)
        if post is None:
            return None
        return _ChunkSource(
            key=("post", str(post.id)),
            title=post.title,
            tags=tuple(post_tag.tag.name for post_tag in post.tags),
            source_type="post",
        )
    return None


def _matches_archive_terms(source: _ChunkSource, intent: SearchIntent) -> bool:
    if not intent.archive_terms:
        return True
    primary_text = normalize_search_text(" ".join([source.title, *source.tags]))
    return all(
        any(alias in primary_text for alias in term.aliases)
        for term in intent.archive_terms
    )


def _matches_structured_terms(source: _ChunkSource, chunk: RagChunk, intent: SearchIntent) -> bool:
    if not intent.include_terms and not intent.exclude_terms:
        return True
    haystack = normalize_search_text(" ".join([source.title, *source.tags, chunk.content]))
    includes = [normalize_search_text(term) for term in intent.include_terms if normalize_search_text(term)]
    excludes = [normalize_search_text(term) for term in intent.exclude_terms if normalize_search_text(term)]
    return all(term in haystack for term in includes) and not any(
        term in haystack for term in excludes
    )


def _source_type_matches(source: _ChunkSource, intent: SearchIntent) -> bool:
    if intent.media_type == "youtube" and source.source_type != "youtube":
        return False
    if intent.source_types and source.source_type not in intent.source_types:
        return False
    return True


def _source_boost(source: _ChunkSource, intent: SearchIntent) -> float:
    boost = 0.0
    primary_text = normalize_search_text(" ".join([source.title, *source.tags]))
    for term in intent.archive_terms:
        if any(alias in primary_text for alias in term.aliases):
            boost += 2.0
            if term.term_type == "song":
                boost += 0.4
    if intent.media_type == "youtube" and source.source_type == "youtube":
        boost += 0.4
    for term in intent.include_terms:
        normalized = normalize_search_text(term)
        if normalized and normalized in primary_text:
            boost += 1.0
    for term in intent.boost_terms:
        normalized = normalize_search_text(term)
        if normalized and normalized in primary_text:
            boost += 0.5
    return boost


def _lexical_terms(intent: SearchIntent) -> list[str]:
    terms = [*intent.include_terms, *intent.boost_terms]
    for term in intent.archive_terms:
        terms.extend(term.raw_aliases)
    seen: dict[str, None] = {}
    for term in terms:
        normalized = term.strip()
        if normalized:
            seen.setdefault(normalized, None)
    return list(seen)[:12]


def search_archive_candidates(
    db: Session,
    question: str,
    *,
    artist_id: int,
    limit: int = 10,
    offset: int = 0,
    intent: SearchIntent | None = None,
) -> list[RagChunk]:
    from app.services.rag import embed_text

    intent = intent or parse_search_intent(question, artist_id=artist_id, db=db)
    query_embedding = embed_text(question)
    fetch_limit = max((limit + offset) * 8, 120)
    if is_postgres():
        chunks = db.scalars(
            select(RagChunk)
            .where(RagChunk.artist_id == artist_id)
            .order_by(RagChunk.embedding.op("<=>")(query_embedding))
            .limit(fetch_limit)
        ).all()
    else:
        chunks = db.scalars(select(RagChunk).where(RagChunk.artist_id == artist_id)).all()
    lexical_terms = _lexical_terms(intent)
    if lexical_terms:
        lexical_filters = [RagChunk.content.ilike(f"%{term}%") for term in lexical_terms]
        lexical_chunks = db.scalars(
            select(RagChunk)
            .where(RagChunk.artist_id == artist_id)
            .where(or_(*lexical_filters))
            .limit(fetch_limit)
        ).all()
        chunks = list({chunk.id: chunk for chunk in [*chunks, *lexical_chunks]}.values())
    ranked: list[tuple[float, RagChunk, _ChunkSource]] = []
    for chunk in chunks:
        source = _source_for_chunk(db, chunk)
        if source is None:
            continue
        if not _source_type_matches(source, intent):
            continue
        if not _matches_archive_terms(source, intent):
            continue
        if not _matches_structured_terms(source, chunk, intent):
            continue
        content_text = normalize_search_text(chunk.content)
        lexical_boost = sum(
            0.25
            for term in _lexical_terms(intent)
            if normalize_search_text(term) and normalize_search_text(term) in content_text
        )
        score = cosine_similarity(query_embedding, chunk.embedding) + _source_boost(source, intent) + lexical_boost
        ranked.append((score, chunk, source))

    ranked.sort(key=lambda item: item[0], reverse=True)
    deduped: list[RagChunk] = []
    seen_sources: set[tuple[str, str]] = set()
    for _, chunk, source in ranked:
        if source.key in seen_sources:
            continue
        seen_sources.add(source.key)
        deduped.append(chunk)
        if len(deduped) >= limit + offset:
            break
    return deduped[offset : offset + limit]
