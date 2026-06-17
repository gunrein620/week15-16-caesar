from __future__ import annotations

from dataclasses import dataclass
import json

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import is_postgres
from app.models import ExternalUpdate, Member, Post, RagChunk, YoutubeVideo
from app.services.search_intent import (
    SearchIntent,
    archive_alias_matches_text,
    normalize_search_text,
    parse_search_intent,
)
from app.services.text import cosine_similarity
from app.services.updates import _matches_youtube_members, _member_filter_matches


@dataclass(frozen=True)
class _ChunkSource:
    key: tuple[str, str]
    title: str
    tags: tuple[str, ...]
    source_type: str
    member_names: tuple[str, ...] = ()
    thumbnail_member_names: tuple[str, ...] = ()
    thumbnail_person_count: int | None = None
    thumbnail_analyzed: bool = False


def _thumbnail_members(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return ()
    if not isinstance(parsed, list):
        return ()
    return tuple(item for item in parsed if isinstance(item, str) and item.strip())


def _effective_member_names(source: _ChunkSource) -> tuple[str, ...]:
    if source.thumbnail_analyzed and source.thumbnail_member_names:
        return source.thumbnail_member_names
    return source.member_names


def _effective_member_count(source: _ChunkSource) -> int:
    if source.thumbnail_analyzed and source.thumbnail_person_count is not None:
        return source.thumbnail_person_count
    return len(set(_effective_member_names(source)))


def _source_for_chunk(db: Session, chunk: RagChunk, members: list[str]) -> _ChunkSource | None:
    if chunk.youtube_video_id:
        video = chunk.youtube_video or db.get(YoutubeVideo, chunk.youtube_video_id)
        if video is None:
            return None
        return _ChunkSource(
            key=("youtube", video.id),
            title=video.title,
            tags=(),
            source_type="youtube",
            member_names=tuple(
                _matches_youtube_members(
                    video.title,
                    video.description,
                    video.channel_title,
                    members,
                )
            ),
            thumbnail_member_names=_thumbnail_members(video.thumbnail_detected_members),
            thumbnail_person_count=video.thumbnail_person_count,
            thumbnail_analyzed=video.thumbnail_analysis_status == "analyzed",
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
    if chunk.external_update_id:
        item = chunk.external_update or db.get(ExternalUpdate, chunk.external_update_id)
        if item is None:
            return None
        return _ChunkSource(
            key=("external", str(item.id)),
            title=item.title,
            tags=(),
            source_type=item.source_type,
        )
    return None


def _matches_archive_terms(source: _ChunkSource, intent: SearchIntent) -> bool:
    if not intent.archive_terms:
        return True
    primary_raw_text = " ".join([source.title, *source.tags])
    primary_text = normalize_search_text(primary_raw_text)
    return any(
        any(
            archive_alias_matches_text(primary_raw_text, alias, primary_text)
            for alias in term.raw_aliases
        )
        for term in intent.archive_terms
    )


def _matches_structured_terms(source: _ChunkSource, chunk: RagChunk, intent: SearchIntent) -> bool:
    if not intent.include_terms and not intent.exclude_terms and intent.member_count is None:
        return True
    if intent.member_count is not None and _effective_member_count(source) != intent.member_count:
        return False
    haystack = normalize_search_text(" ".join([source.title, *source.tags, chunk.content]))
    member_names = list(_effective_member_names(source))

    def term_matches(raw_term: str) -> bool:
        normalized = normalize_search_text(raw_term)
        if not normalized:
            return True
        return normalized in haystack or _member_filter_matches(member_names, raw_term)

    return all(term_matches(term) for term in intent.include_terms) and not any(
        term_matches(term) for term in intent.exclude_terms
    )


def _source_type_matches(source: _ChunkSource, intent: SearchIntent) -> bool:
    if intent.media_type == "youtube" and source.source_type != "youtube":
        return False
    if intent.source_types and source.source_type not in intent.source_types:
        return False
    return True


def _content_source_type_matches(chunk: RagChunk, intent: SearchIntent) -> bool:
    if not intent.content_source_types:
        return True
    if chunk.search_item is None:
        return False
    return any(
        link.source is not None and link.source.source_type in intent.content_source_types
        for link in chunk.search_item.sources
    )


def _source_boost(source: _ChunkSource, intent: SearchIntent) -> float:
    boost = 0.0
    primary_raw_text = " ".join([source.title, *source.tags])
    primary_text = normalize_search_text(primary_raw_text)
    archive_boost = 0.0
    for term in intent.archive_terms:
        if any(
            archive_alias_matches_text(primary_raw_text, alias, primary_text)
            for alias in term.raw_aliases
        ):
            archive_boost += 0.10
            if term.term_type == "song":
                archive_boost += 0.02
    boost += min(archive_boost, 0.20)
    if intent.media_type == "youtube" and source.source_type == "youtube":
        boost += 0.04
    include_boost = 0.0
    for term in intent.include_terms:
        normalized = normalize_search_text(term)
        if normalized and normalized in primary_text:
            include_boost += 0.06
    boost += min(include_boost, 0.12)
    term_boost = 0.0
    for term in intent.boost_terms:
        normalized = normalize_search_text(term)
        if normalized and normalized in primary_text:
            term_boost += 0.03
    boost += min(term_boost, 0.06)
    return min(boost, 0.35)


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


def _embedding_query(question: str, intent: SearchIntent) -> str:
    terms = [*intent.include_terms, *intent.boost_terms]
    for term in intent.archive_terms:
        terms.extend(term.raw_aliases)
    seen: dict[str, None] = {}
    for term in terms:
        normalized = term.strip()
        if normalized:
            seen.setdefault(normalized, None)
        if len(seen) >= 8:
            break
    if not seen:
        return question
    return f"{question}\n핵심 키워드: {', '.join(seen)}"


def _lexical_filter(term: str):
    compact_term = term.lower().replace(" ", "")
    compact_content = func.replace(func.lower(RagChunk.content), " ", "")
    return or_(
        RagChunk.content.ilike(f"%{term}%"),
        compact_content.ilike(f"%{compact_term}%"),
    )


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
    from app.services.search_index import ensure_search_index_for_artist

    intent = intent or parse_search_intent(question, artist_id=artist_id, db=db)
    ensure_search_index_for_artist(db, artist_id)
    query_embedding = embed_text(_embedding_query(question, intent))
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
        lexical_filters = [_lexical_filter(term) for term in lexical_terms]
        lexical_chunks = db.scalars(
            select(RagChunk)
            .where(RagChunk.artist_id == artist_id)
            .where(or_(*lexical_filters))
            .limit(fetch_limit)
        ).all()
        chunks = list({chunk.id: chunk for chunk in [*chunks, *lexical_chunks]}.values())
    members = [
        item.name for item in db.scalars(select(Member).where(Member.artist_id == artist_id)).all()
    ]
    ranked: list[tuple[float, RagChunk, _ChunkSource]] = []
    for chunk in chunks:
        source = _source_for_chunk(db, chunk, members)
        if source is None:
            continue
        if not _source_type_matches(source, intent):
            continue
        if not _content_source_type_matches(chunk, intent):
            continue
        if not _matches_archive_terms(source, intent):
            continue
        if not _matches_structured_terms(source, chunk, intent):
            continue
        content_text = normalize_search_text(chunk.content)
        lexical_boost = min(
            sum(
                0.02
                for term in _lexical_terms(intent)
                if normalize_search_text(term) and normalize_search_text(term) in content_text
            ),
            0.06,
        )
        boost = min(_source_boost(source, intent) + lexical_boost, 0.35)
        score = cosine_similarity(query_embedding, chunk.embedding) + boost
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
