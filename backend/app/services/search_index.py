from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    ArtistArchiveTerm,
    ContentSource,
    ExternalUpdate,
    Member,
    Post,
    RagChunk,
    SearchItem,
    SearchItemMember,
    SearchItemSource,
    SearchItemTerm,
    YoutubeSource,
    YoutubeVideo,
)
from app.services.search_intent import archive_alias_matches_text, normalize_search_text
from app.services.updates import _contains_alias, _member_aliases


OFFICIAL_SOURCE_TYPES = {"official_channel"}
BRIEFING_POST_CATEGORY = "브리핑"


def _source_is_official(source_type: str) -> bool:
    return source_type in OFFICIAL_SOURCE_TYPES


def _json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [item.strip() for item in parsed if isinstance(item, str) and item.strip()]


def _content_source_for_youtube_source(db: Session, source: YoutubeSource) -> ContentSource:
    original_match = db.scalar(
        select(ContentSource).where(ContentSource.original_youtube_source_id == source.id)
    )
    identity_match = db.scalar(
        select(ContentSource).where(
            ContentSource.artist_id == source.artist_id,
            ContentSource.platform == "youtube",
            ContentSource.source_type == source.source_type,
            ContentSource.source_value == source.source_value,
        )
    )
    if (
        original_match is not None
        and identity_match is not None
        and original_match.id != identity_match.id
    ):
        original_match.original_youtube_source_id = None
        db.flush()
    existing = identity_match or original_match
    if existing is None:
        existing = ContentSource(
            artist_id=source.artist_id,
            platform="youtube",
            source_type=source.source_type,
            source_value=source.source_value,
            title=source.title,
            is_official=_source_is_official(source.source_type),
            original_youtube_source_id=source.id,
        )
        db.add(existing)
    else:
        existing.artist_id = source.artist_id
        existing.platform = "youtube"
        existing.source_type = source.source_type
        existing.source_value = source.source_value
        existing.title = source.title
        existing.is_official = _source_is_official(source.source_type)
        existing.original_youtube_source_id = source.id
    db.flush()
    return existing


def _content_source_for_post(db: Session, post: Post) -> ContentSource:
    is_briefing = post.category == BRIEFING_POST_CATEGORY
    source_type = "briefing" if is_briefing else "community_post"
    source_value = f"artist:{post.artist_id}:{source_type}"
    existing = db.scalar(
        select(ContentSource).where(
            ContentSource.artist_id == post.artist_id,
            ContentSource.platform == "community",
            ContentSource.source_type == source_type,
            ContentSource.source_value == source_value,
        )
    )
    title = "Briefing" if is_briefing else "Fan post"
    if existing is None:
        existing = ContentSource(
            artist_id=post.artist_id,
            platform="community",
            source_type=source_type,
            source_value=source_value,
            title=title,
            is_official=False,
        )
        db.add(existing)
    else:
        existing.title = title
    db.flush()
    return existing


def _content_source_for_external_update(db: Session, item: ExternalUpdate) -> ContentSource:
    existing = db.scalar(
        select(ContentSource).where(
            ContentSource.artist_id == item.artist_id,
            ContentSource.platform == "naver",
            ContentSource.source_type == item.source_type,
            ContentSource.source_value == item.source_label,
        )
    )
    if existing is None:
        existing = ContentSource(
            artist_id=item.artist_id,
            platform="naver",
            source_type=item.source_type,
            source_value=item.source_label,
            title=item.source_label,
            is_official=False,
        )
        db.add(existing)
    else:
        existing.title = item.source_label
    db.flush()
    return existing


def _youtube_search_item(db: Session, video: YoutubeVideo, artist_id: int) -> SearchItem:
    item = db.scalar(select(SearchItem).where(SearchItem.youtube_video_id == video.id))
    metadata = {
        "channel_title": video.channel_title or "",
        "thumbnail_analysis_status": video.thumbnail_analysis_status,
        "thumbnail_detected_members": _json_list(video.thumbnail_detected_members),
        "thumbnail_person_count": video.thumbnail_person_count,
        "thumbnail_analysis_confidence": video.thumbnail_analysis_confidence,
    }
    if item is None:
        item = SearchItem(
            artist_id=artist_id,
            item_type="youtube",
            youtube_video_id=video.id,
            title=video.title,
            description=video.description or "",
            url=video.url,
            thumbnail_url=video.thumbnail_url or "",
            published_at=video.published_at,
            view_count=video.view_count,
            like_count=video.like_count,
            comment_count=video.comment_count,
            has_transcript=video.transcript_status == "fetched",
            metadata_json=metadata,
        )
        db.add(item)
    else:
        item.artist_id = artist_id
        item.item_type = "youtube"
        item.title = video.title
        item.description = video.description or ""
        item.url = video.url
        item.thumbnail_url = video.thumbnail_url or ""
        item.published_at = video.published_at
        item.view_count = video.view_count
        item.like_count = video.like_count
        item.comment_count = video.comment_count
        item.has_transcript = video.transcript_status == "fetched"
        item.metadata_json = metadata
    db.flush()
    return item


def _post_search_item(db: Session, post: Post) -> SearchItem:
    item = db.scalar(select(SearchItem).where(SearchItem.post_id == post.id))
    item_type = "briefing" if post.category == BRIEFING_POST_CATEGORY else "post"
    if item is None:
        item = SearchItem(
            artist_id=post.artist_id,
            item_type=item_type,
            post_id=post.id,
            title=post.title,
            description=post.content or "",
            url=f"/posts/{post.id}",
            thumbnail_url=post.thumbnail_url or "",
            published_at=post.created_at,
            metadata_json={"category": post.category},
        )
        db.add(item)
    else:
        item.artist_id = post.artist_id
        item.item_type = item_type
        item.title = post.title
        item.description = post.content or ""
        item.url = f"/posts/{post.id}"
        item.thumbnail_url = post.thumbnail_url or ""
        item.published_at = post.created_at
        item.metadata_json = {"category": post.category}
    db.flush()
    return item


def _external_update_search_item(db: Session, update: ExternalUpdate) -> SearchItem:
    item = db.scalar(select(SearchItem).where(SearchItem.external_update_id == update.id))
    if item is None:
        item = SearchItem(
            artist_id=update.artist_id,
            item_type=update.source_type,
            external_update_id=update.id,
            title=update.title,
            description=update.description or "",
            url=update.url,
            thumbnail_url=update.thumbnail_url or "",
            published_at=update.published_at,
            metadata_json={"source_label": update.source_label},
        )
        db.add(item)
    else:
        item.artist_id = update.artist_id
        item.item_type = update.source_type
        item.title = update.title
        item.description = update.description or ""
        item.url = update.url
        item.thumbnail_url = update.thumbnail_url or ""
        item.published_at = update.published_at
        item.metadata_json = {"source_label": update.source_label}
    db.flush()
    return item


def _clear_search_item_links(db: Session, item: SearchItem) -> None:
    db.execute(delete(SearchItemSource).where(SearchItemSource.search_item_id == item.id))
    db.execute(delete(SearchItemMember).where(SearchItemMember.search_item_id == item.id))
    db.execute(delete(SearchItemTerm).where(SearchItemTerm.search_item_id == item.id))


def _add_sources(db: Session, item: SearchItem, sources: list[ContentSource]) -> None:
    seen: set[int] = set()
    for source in sources:
        if source.id in seen:
            continue
        seen.add(source.id)
        db.add(SearchItemSource(search_item_id=item.id, source_id=source.id))


def _member_match_evidence(member: Member, title: str, description: str) -> tuple[str, str] | None:
    if any(_contains_alias(title, alias) for alias in _member_aliases(member.name)):
        return "title", title
    if any(_contains_alias(description, alias) for alias in _member_aliases(member.name)):
        return "description", description[:500]
    return None


def _thumbnail_member_match(member: Member, names: list[str]) -> str | None:
    for name in names:
        if any(_contains_alias(name, alias) for alias in _member_aliases(member.name)):
            return name
    return None


def _add_members(
    db: Session,
    item: SearchItem,
    *,
    title: str,
    description: str,
    thumbnail_members: list[str] | None = None,
) -> None:
    members = db.scalars(select(Member).where(Member.artist_id == item.artist_id)).all()
    for member in members:
        evidence = _member_match_evidence(member, title, description)
        if evidence is not None:
            evidence_type, evidence_text = evidence
            db.add(
                SearchItemMember(
                    search_item_id=item.id,
                    member_id=member.id,
                    member_name=member.name,
                    evidence_type=evidence_type,
                    evidence_text=evidence_text,
                )
            )
        thumbnail_match = _thumbnail_member_match(member, thumbnail_members or [])
        if thumbnail_match is not None:
            db.add(
                SearchItemMember(
                    search_item_id=item.id,
                    member_id=member.id,
                    member_name=member.name,
                    evidence_type="thumbnail",
                    evidence_text=thumbnail_match,
                )
            )


def _add_archive_terms(db: Session, item: SearchItem, text: str) -> None:
    normalized = normalize_search_text(text)
    terms = db.scalars(
        select(ArtistArchiveTerm).where(ArtistArchiveTerm.artist_id == item.artist_id)
    ).all()
    for term in terms:
        aliases = tuple(dict.fromkeys([term.title, *(term.aliases or [])]))
        if any(archive_alias_matches_text(text, alias, normalized) for alias in aliases):
            db.add(
                SearchItemTerm(
                    search_item_id=item.id,
                    archive_term_id=term.id,
                    term_title=term.title,
                    evidence_text=text[:500],
                )
            )


def _link_rag_chunks(db: Session, item: SearchItem) -> None:
    conditions = []
    if item.post_id is not None:
        conditions.append(RagChunk.post_id == item.post_id)
    if item.youtube_video_id is not None:
        conditions.append(RagChunk.youtube_video_id == item.youtube_video_id)
    if item.external_update_id is not None:
        conditions.append(RagChunk.external_update_id == item.external_update_id)
    if not conditions:
        return
    chunks = db.scalars(select(RagChunk).where(*conditions)).all()
    for chunk in chunks:
        chunk.search_item_id = item.id
        if chunk.chunk_index == 0 and not chunk.chunk_type:
            chunk.chunk_type = "metadata"
        elif chunk.chunk_index >= 1:
            chunk.chunk_type = "transcript"


def upsert_youtube_source_content_source(db: Session, source: YoutubeSource) -> ContentSource:
    return _content_source_for_youtube_source(db, source)


def upsert_youtube_video_search_item(
    db: Session,
    video: YoutubeVideo,
    *,
    artist_id: int,
) -> SearchItem:
    item = _youtube_search_item(db, video, artist_id)
    _clear_search_item_links(db, item)
    sources = [
        _content_source_for_youtube_source(db, link.source)
        for link in video.sources
        if link.source is not None
    ]
    _add_sources(db, item, sources)
    text = "\n".join([video.title or "", video.description or "", video.channel_title or ""])
    _add_members(
        db,
        item,
        title=video.title or "",
        description="\n".join([video.description or "", video.channel_title or ""]),
        thumbnail_members=_json_list(video.thumbnail_detected_members),
    )
    _add_archive_terms(db, item, text)
    _link_rag_chunks(db, item)
    db.flush()
    return item


def upsert_post_search_item(db: Session, post: Post) -> SearchItem:
    item = _post_search_item(db, post)
    _clear_search_item_links(db, item)
    _add_sources(db, item, [_content_source_for_post(db, post)])
    text = f"{post.title}\n{post.content}"
    _add_members(db, item, title=post.title, description=post.content or "")
    _add_archive_terms(db, item, text)
    _link_rag_chunks(db, item)
    db.flush()
    return item


def upsert_external_update_search_item(db: Session, update: ExternalUpdate) -> SearchItem:
    item = _external_update_search_item(db, update)
    _clear_search_item_links(db, item)
    _add_sources(db, item, [_content_source_for_external_update(db, update)])
    text = f"{update.title}\n{update.description}\n{update.source_label}"
    _add_members(db, item, title=update.title, description=f"{update.description}\n{update.source_label}")
    _add_archive_terms(db, item, text)
    _link_rag_chunks(db, item)
    db.flush()
    return item


def backfill_search_index(db: Session, artist_id: int | None = None) -> int:
    count = 0
    source_query = select(YoutubeSource)
    if artist_id is not None:
        source_query = source_query.where(YoutubeSource.artist_id == artist_id)
    for source in db.scalars(source_query).all():
        upsert_youtube_source_content_source(db, source)

    video_query = select(YoutubeVideo)
    if artist_id is not None:
        video_query = (
            select(YoutubeVideo)
            .join(YoutubeVideo.sources)
            .join(YoutubeSource)
            .where(YoutubeSource.artist_id == artist_id)
            .distinct()
        )
    for video in db.scalars(video_query).all():
        resolved_artist_id = artist_id
        if resolved_artist_id is None:
            linked_source = next((link.source for link in video.sources if link.source), None)
            if linked_source is None:
                continue
            resolved_artist_id = linked_source.artist_id
        upsert_youtube_video_search_item(db, video, artist_id=resolved_artist_id)
        count += 1

    post_query = select(Post)
    if artist_id is not None:
        post_query = post_query.where(Post.artist_id == artist_id)
    for post in db.scalars(post_query).all():
        upsert_post_search_item(db, post)
        count += 1

    update_query = select(ExternalUpdate)
    if artist_id is not None:
        update_query = update_query.where(ExternalUpdate.artist_id == artist_id)
    for update in db.scalars(update_query).all():
        upsert_external_update_search_item(db, update)
        count += 1
    db.flush()
    return count


def ensure_search_index_for_artist(db: Session, artist_id: int) -> None:
    exists = db.scalar(select(SearchItem.id).where(SearchItem.artist_id == artist_id).limit(1))
    if exists is None:
        backfill_search_index(db, artist_id=artist_id)


def utc_sort_value(item: SearchItem):
    published_at = item.published_at
    if published_at is None:
        return datetime.min.replace(tzinfo=UTC)
    if published_at.tzinfo is None:
        return published_at.replace(tzinfo=UTC)
    return published_at.astimezone(UTC)
