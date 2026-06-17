from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    ContentSource,
    RagChunk,
    SearchItem,
    SearchItemMember,
    SearchItemSource,
    SearchItemTerm,
)
from app.services.search_index import ensure_search_index_for_artist
from app.services.search_intent import normalize_search_text
from app.services.text import cosine_similarity


CatalogSort = Literal["latest", "popular", "relevance"]


@dataclass(frozen=True)
class SearchFilters:
    artist_id: int
    content_types: tuple[str, ...] = ()
    source_types: tuple[str, ...] = ()
    member_names: tuple[str, ...] = ()
    member_count: int | None = None
    archive_term_ids: tuple[int, ...] = ()
    published_after: datetime | None = None
    published_before: datetime | None = None
    sort: CatalogSort | None = None
    has_transcript: bool | None = None
    include_terms: tuple[str, ...] = ()
    exclude_terms: tuple[str, ...] = ()
    limit: int = 10
    offset: int = 0
    semantic_query: str | None = None
    query_embedding: list[float] | None = None


@dataclass(frozen=True)
class CatalogSearchResult:
    sources: list[dict]
    has_more: bool
    next_offset: int | None


def _aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _iso(value: datetime | None) -> str | None:
    aware = _aware_utc(value)
    return aware.isoformat() if aware is not None else None


def _source_rows(item: SearchItem) -> list[ContentSource]:
    return [link.source for link in item.sources if link.source is not None]


def _primary_source(sources: list[ContentSource]) -> ContentSource | None:
    if not sources:
        return None
    official = next((source for source in sources if source.is_official), None)
    return official or sources[0]


def _member_names(item: SearchItem) -> list[str]:
    seen: dict[str, None] = {}
    for link in item.members:
        if link.member_name:
            seen.setdefault(link.member_name, None)
    return list(seen)


def _archive_terms(item: SearchItem) -> list[dict]:
    return [
        {
            "id": link.archive_term_id,
            "title": link.term_title,
        }
        for link in item.terms
    ]


def _base_payload(item: SearchItem) -> dict:
    sources = _source_rows(item)
    primary = _primary_source(sources)
    source_types = [source.source_type for source in sources]
    metadata = item.metadata_json or {}
    source_label = ""
    channel_title = ""
    if item.item_type == "youtube":
        channel_title = str(metadata.get("channel_title") or "")
        source_label = channel_title or (primary.title if primary else "YouTube")
    elif item.item_type == "briefing":
        source_label = "Briefing"
    elif item.item_type == "post":
        source_label = "Fan post"
    else:
        source_label = str(metadata.get("source_label") or (primary.title if primary else ""))
    return {
        "chunk_id": None,
        "post_id": item.post_id,
        "youtube_video_id": item.youtube_video_id,
        "external_update_id": item.external_update_id,
        "source_type": item.item_type,
        "title": item.title,
        "url": item.url,
        "thumbnail_url": item.thumbnail_url,
        "channel_title": channel_title,
        "source_label": source_label,
        "published_at": _iso(item.published_at),
        "view_count": item.view_count,
        "like_count": item.like_count,
        "comment_count": item.comment_count,
        "content": item.description,
        "description": item.description,
        "search_item_id": item.id,
        "source_types": source_types,
        "primary_source_type": primary.source_type if primary else None,
        "source_title": primary.title if primary else source_label,
        "is_official": any(source.is_official for source in sources),
        "member_names": _member_names(item),
        "archive_terms": _archive_terms(item),
        "has_transcript": item.has_transcript,
        "thumbnail_analysis_status": metadata.get("thumbnail_analysis_status", "pending"),
        "thumbnail_detected_members": metadata.get("thumbnail_detected_members", []),
        "thumbnail_person_count": metadata.get("thumbnail_person_count"),
        "thumbnail_analysis_confidence": metadata.get("thumbnail_analysis_confidence"),
    }


def search_item_to_source_payload(item: SearchItem) -> dict:
    return _base_payload(item)


def _apply_filters(stmt, filters: SearchFilters):
    stmt = stmt.where(SearchItem.artist_id == filters.artist_id)
    if filters.content_types:
        stmt = stmt.where(SearchItem.item_type.in_(filters.content_types))
    if filters.source_types:
        stmt = stmt.where(
            select(SearchItemSource.search_item_id)
            .join(ContentSource, ContentSource.id == SearchItemSource.source_id)
            .where(
                SearchItemSource.search_item_id == SearchItem.id,
                ContentSource.source_type.in_(filters.source_types),
            )
            .exists()
        )
    if filters.member_names:
        stmt = stmt.where(
            select(SearchItemMember.search_item_id)
            .where(
                SearchItemMember.search_item_id == SearchItem.id,
                SearchItemMember.member_name.in_(filters.member_names),
            )
            .exists()
        )
    if filters.member_count is not None:
        if filters.member_count == 0:
            stmt = stmt.where(
                ~select(SearchItemMember.search_item_id)
                .where(SearchItemMember.search_item_id == SearchItem.id)
                .exists()
            )
        # For count > 0, the final hydrated payload pass can use thumbnail person_count
        # when available and otherwise falls back to distinct matched member names.
    if filters.archive_term_ids:
        stmt = stmt.where(
            select(SearchItemTerm.search_item_id)
            .where(
                SearchItemTerm.search_item_id == SearchItem.id,
                SearchItemTerm.archive_term_id.in_(filters.archive_term_ids),
            )
            .exists()
        )
    if filters.published_after is not None:
        stmt = stmt.where(SearchItem.published_at >= filters.published_after)
    if filters.published_before is not None:
        stmt = stmt.where(SearchItem.published_at <= filters.published_before)
    if filters.has_transcript is not None:
        stmt = stmt.where(SearchItem.has_transcript.is_(filters.has_transcript))
    return stmt


def _sort_key(item: SearchItem, relevance: dict[int, float], sort: str | None) -> tuple:
    published = _aware_utc(item.published_at) or datetime.min.replace(tzinfo=UTC)
    if sort == "popular":
        return (item.view_count or -1, published.timestamp())
    if sort == "relevance" and relevance:
        return (relevance.get(item.id, 0.0), published.timestamp())
    return (published.timestamp(), item.view_count or -1)


def _candidate_relevance(db: Session, filters: SearchFilters) -> dict[int, float]:
    if filters.query_embedding is None:
        return {}
    rows = db.execute(
        select(RagChunk.search_item_id, RagChunk.embedding)
        .join(SearchItem, SearchItem.id == RagChunk.search_item_id)
        .where(SearchItem.artist_id == filters.artist_id, RagChunk.search_item_id.is_not(None))
    ).all()
    scores: dict[int, float] = {}
    for search_item_id, embedding in rows:
        if search_item_id is None:
            continue
        score = cosine_similarity(filters.query_embedding, embedding)
        scores[search_item_id] = max(score, scores.get(search_item_id, -1.0))
    return scores


def _payload_passes_member_count(payload: dict, filters: SearchFilters) -> bool:
    if filters.member_count is None:
        return True
    detected_count = payload.get("thumbnail_person_count")
    if isinstance(detected_count, int):
        return detected_count == filters.member_count
    return len(set(payload.get("member_names") or [])) == filters.member_count


def _payload_haystack(payload: dict) -> str:
    archive_terms = payload.get("archive_terms") or []
    archive_titles = [
        str(term.get("title") or "") for term in archive_terms if isinstance(term, dict)
    ]
    return normalize_search_text(
        " ".join(
            [
                str(payload.get("title") or ""),
                str(payload.get("description") or payload.get("content") or ""),
                str(payload.get("source_label") or ""),
                str(payload.get("channel_title") or ""),
                *[str(name) for name in payload.get("member_names") or []],
                *archive_titles,
            ]
        )
    )


def _payload_passes_terms(payload: dict, filters: SearchFilters) -> bool:
    haystack = _payload_haystack(payload)
    include_terms = [normalize_search_text(term) for term in filters.include_terms]
    include_terms = [term for term in include_terms if term]
    exclude_terms = [normalize_search_text(term) for term in filters.exclude_terms]
    exclude_terms = [term for term in exclude_terms if term]
    if any(term in haystack for term in exclude_terms):
        return False
    return all(term in haystack for term in include_terms)


def search_catalog(db: Session, filters: SearchFilters) -> CatalogSearchResult:
    ensure_search_index_for_artist(db, filters.artist_id)
    limit = max(1, min(filters.limit, 100))
    offset = max(0, filters.offset)
    relevance = _candidate_relevance(db, filters)

    stmt = select(SearchItem).options(
        selectinload(SearchItem.sources).selectinload(SearchItemSource.source),
        selectinload(SearchItem.members),
        selectinload(SearchItem.terms),
    )
    stmt = _apply_filters(stmt, filters)

    if filters.sort == "popular":
        stmt = stmt.order_by(SearchItem.view_count.desc().nullslast(), SearchItem.published_at.desc())
    elif filters.sort != "relevance" or not relevance:
        stmt = stmt.order_by(SearchItem.published_at.desc().nullslast(), SearchItem.id.desc())

    fetch_limit = max((limit + offset + 1) * 4, limit + offset + 20)
    items = db.scalars(stmt).all() if relevance else db.scalars(stmt.limit(fetch_limit)).all()
    if relevance:
        allowed_ids = set(relevance)
        if filters.sort == "relevance" or filters.semantic_query:
            items = [item for item in items if item.id in allowed_ids]
        items = sorted(
            items,
            key=lambda item: _sort_key(item, relevance, filters.sort),
            reverse=True,
        )
    elif filters.sort == "popular":
        items = sorted(
            items,
            key=lambda item: _sort_key(item, relevance, filters.sort),
            reverse=True,
        )

    payloads = [_base_payload(item) for item in items]
    payloads = [payload for payload in payloads if _payload_passes_member_count(payload, filters)]
    payloads = [payload for payload in payloads if _payload_passes_terms(payload, filters)]
    visible = payloads[offset : offset + limit]
    has_more = len(payloads) > offset + limit
    return CatalogSearchResult(
        sources=visible,
        has_more=has_more,
        next_offset=offset + limit if has_more else None,
    )
