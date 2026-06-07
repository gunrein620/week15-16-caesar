from datetime import UTC, datetime
from html import unescape
import re

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Artist,
    ArtistKeyword,
    Briefing,
    ExternalUpdate,
    Member,
    Post,
    PostTag,
    YoutubeSource,
    YoutubeVideo,
    YoutubeVideoSource,
)
from app.schemas import UpdateFeedItem, UpdateFeedResponse


TAG_RE = re.compile(r"<[^>]+>")
LATIN_ALIAS_RE = re.compile(r"^[0-9a-z]+$")
HANGUL_RE = re.compile(r"[가-힣]")

MEMBER_ALIASES = {
    "Woni": ("Woni", "원이", "RESCENE WONI", "rescenewoni", "리센느원이"),
    "Liv": ("Liv", "리브", "RESCENE LIV", "resceneliv", "리센느리브"),
    "Minami": ("Minami", "미나미", "RESCENE MINAMI", "resceneminami", "리센느미나미"),
    "May": ("May", "메이", "RESCENE MAY", "rescenemay", "리센느메이"),
    "Zena": ("Zena", "제나", "RESCENE ZENA", "rescenezena", "리센느제나"),
}

KEYWORD_ALIASES = {
    "컴백": ("컴백", "comeback"),
    "무대": ("무대", "stage", "performance"),
    "직캠": ("직캠", "fancam"),
    "라디오": ("라디오", "radio"),
    "Love Attack": ("Love Attack", "러브어택", "러브 어택", "loveattack"),
}


def _clean(value: str | None) -> str:
    return TAG_RE.sub("", unescape(value or "")).strip()


def _excerpt(value: str, max_length: int = 260) -> str:
    normalized = " ".join(_clean(value).split())
    if len(normalized) <= max_length:
        return normalized
    return f"{normalized[:max_length].rstrip()}..."


def _aware(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _normalize_match_text(value: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]+", "", value.lower())


def _contains_alias(text: str, alias: str) -> bool:
    alias = alias.strip()
    if not alias:
        return False
    lowered = text.lower()
    alias_lowered = alias.lower()
    if LATIN_ALIAS_RE.fullmatch(alias_lowered):
        pattern = rf"(?<![0-9a-z]){re.escape(alias_lowered)}(?![0-9a-z])"
        return re.search(pattern, lowered) is not None
    if HANGUL_RE.search(alias):
        return _normalize_match_text(alias) in _normalize_match_text(text)
    return alias_lowered in lowered or _normalize_match_text(alias) in _normalize_match_text(text)


def _member_aliases(member: str) -> tuple[str, ...]:
    return tuple(dict.fromkeys((member, *MEMBER_ALIASES.get(member, ()))))


def _keyword_aliases(keyword: str) -> tuple[str, ...]:
    return tuple(dict.fromkeys((keyword, *KEYWORD_ALIASES.get(keyword, ()))))


def _matches_members(text: str, members: list[str]) -> list[str]:
    return [
        member
        for member in members
        if any(_contains_alias(text, alias) for alias in _member_aliases(member))
    ]


def _matches_youtube_members(
    title: str,
    description: str,
    channel_title: str,
    members: list[str],
) -> list[str]:
    title_matches = _matches_members(title, members)
    if title_matches:
        return title_matches
    return _matches_members(f"{title}\n{description}\n{channel_title}", members)


def _matches_keywords(text: str, candidates: list[str]) -> list[str]:
    return [
        candidate
        for candidate in candidates
        if any(_contains_alias(text, alias) for alias in _keyword_aliases(candidate))
    ]


def _alias_sets_overlap(left: tuple[str, ...], right: tuple[str, ...]) -> bool:
    left_values = {_normalize_match_text(alias) for alias in left if alias.strip()}
    right_values = {_normalize_match_text(alias) for alias in right if alias.strip()}
    return bool(left_values & right_values)


def _member_filter_matches(member_names: list[str], member: str) -> bool:
    return any(
        _alias_sets_overlap(_member_aliases(name), _member_aliases(member))
        for name in member_names
    )


def _keyword_filter_matches(values: list[str], keyword: str) -> bool:
    return any(
        _alias_sets_overlap(_keyword_aliases(value), _keyword_aliases(keyword))
        for value in values
    )


def _has_any_term(text: str, candidates: list[str]) -> bool:
    return any(
        any(_contains_alias(text, alias) for alias in _keyword_aliases(candidate))
        or any(_contains_alias(text, alias) for alias in _member_aliases(candidate))
        for candidate in candidates
        if candidate
    )


def _external_update_is_relevant(
    row: ExternalUpdate,
    *,
    artist_keywords: list[str],
    members: list[str],
) -> bool:
    terms = artist_keywords + members
    if row.source_type == "naver_blog":
        return _has_any_term(row.title, terms)
    return _has_any_term(f"{row.title}\n{row.description}", terms)


def _item_passes(
    item: UpdateFeedItem,
    *,
    source: str | None,
    member: str | None,
    keyword: str | None,
    query: str | None,
) -> bool:
    haystack = " ".join(
        [
            item.title,
            item.description,
            item.source_label,
            " ".join(item.matched_keywords),
            " ".join(item.member_names),
            " ".join(item.tags),
        ]
    ).lower()
    if source:
        normalized = source.lower()
        if normalized == "naver":
            if item.item_type not in {"naver_news", "naver_blog"}:
                return False
        elif item.item_type != normalized:
            return False
    if member and not _member_filter_matches(item.member_names, member):
        return False
    if keyword and not _keyword_filter_matches(
        [*item.matched_keywords, *item.tags],
        keyword,
    ):
        return False
    if query and query.lower() not in haystack:
        return False
    return True


def _post_tags(post: Post) -> list[str]:
    return sorted(post_tag.tag.name for post_tag in post.tags)


def get_artist_updates(
    db: Session,
    artist_id: int,
    *,
    source: str | None = None,
    member: str | None = None,
    keyword: str | None = None,
    query: str | None = None,
    limit: int = 30,
    cursor: str | None = None,
) -> UpdateFeedResponse:
    artist = db.get(Artist, artist_id)
    if artist is None:
        return UpdateFeedResponse(artist_id=artist_id, items=[], naver_available=False)

    members = [item.name for item in db.scalars(select(Member).where(Member.artist_id == artist_id)).all()]
    artist_keywords = [
        item.keyword
        for item in db.scalars(select(ArtistKeyword).where(ArtistKeyword.artist_id == artist_id)).all()
    ]
    items: list[UpdateFeedItem] = []

    videos = db.scalars(
        select(YoutubeVideo)
        .join(YoutubeVideoSource)
        .join(YoutubeSource)
        .where(YoutubeSource.artist_id == artist_id)
        .order_by(YoutubeVideo.published_at.desc().nullslast())
        .limit(200)
    ).unique().all()
    for video in videos:
        text = f"{video.title}\n{video.description}\n{video.channel_title}"
        items.append(
            UpdateFeedItem(
                id=f"youtube:{video.id}",
                item_type="youtube",
                title=video.title,
                description=_clean(video.description),
                url=video.url,
                thumbnail_url=video.thumbnail_url,
                source_label="YouTube",
                published_at=_aware(video.published_at),
                view_count=video.view_count,
                matched_keywords=sorted(
                    set(_matches_keywords(text, artist_keywords + ([keyword] if keyword else [])))
                ),
                member_names=_matches_youtube_members(
                    video.title,
                    video.description,
                    video.channel_title,
                    members,
                ),
            )
        )

    briefing_rows = db.execute(
        select(Briefing, Post)
        .join(Post, Post.id == Briefing.post_id)
        .where(Briefing.artist_id == artist_id)
        .order_by(Post.created_at.desc())
        .limit(10)
    ).all()
    briefing_post_ids = {post.id for _, post in briefing_rows}
    for briefing, post in briefing_rows:
        text = f"{post.title}\n{post.content}"
        items.append(
            UpdateFeedItem(
                id=f"briefing:{briefing.id}",
                item_type="briefing",
                title="오늘의 리센느 요약",
                description=_excerpt(post.content),
                url=f"/posts/{post.id}",
                thumbnail_url=post.thumbnail_url,
                source_label="Briefing",
                published_at=_aware(post.created_at),
                comment_count=len(post.comments),
                matched_keywords=_matches_keywords(text, artist_keywords + _post_tags(post)),
                member_names=_matches_members(text, members),
                tags=_post_tags(post),
            )
        )

    posts = (
        db.scalars(
            select(Post)
            .options(
                joinedload(Post.comments),
                joinedload(Post.tags).joinedload(PostTag.tag),
            )
            .where(Post.artist_id == artist_id)
            .order_by(Post.created_at.desc())
            .limit(200)
        )
        .unique()
        .all()
    )
    for post in posts:
        if post.id in briefing_post_ids:
            continue
        tags = _post_tags(post)
        text = f"{post.title}\n{post.content}\n{' '.join(tags)}"
        items.append(
            UpdateFeedItem(
                id=f"post:{post.id}",
                item_type="post",
                title=post.title,
                description=_excerpt(post.content),
                url=f"/posts/{post.id}",
                thumbnail_url=post.thumbnail_url,
                source_label="Fan post",
                published_at=_aware(post.created_at),
                comment_count=len(post.comments),
                matched_keywords=sorted(
                    set(
                        _matches_keywords(
                            text,
                            artist_keywords + tags + ([keyword] if keyword else []),
                        )
                    )
                ),
                member_names=_matches_members(text, members),
                tags=tags,
            )
        )

    if source in {None, "naver", "naver_news", "naver_blog"}:
        external_rows = db.scalars(
            select(ExternalUpdate)
            .where(ExternalUpdate.artist_id == artist_id)
            .order_by(ExternalUpdate.published_at.desc())
            .limit(200)
        ).all()
        for row in external_rows:
            if not _external_update_is_relevant(
                row,
                artist_keywords=artist_keywords,
                members=members,
            ):
                continue
            text = f"{row.title}\n{row.description}\n{row.source_label}"
            items.append(
                UpdateFeedItem(
                    id=f"{row.source_type}:{row.id}",
                    item_type=row.source_type,
                    title=row.title,
                    description=_excerpt(row.description),
                    url=row.url,
                    thumbnail_url=row.thumbnail_url,
                    source_label=row.source_label,
                    published_at=_aware(row.published_at),
                    matched_keywords=_matches_keywords(
                        text,
                        artist_keywords + ([keyword] if keyword else []),
                    ),
                    member_names=_matches_members(text, members),
                )
            )

    filtered = [
        item
        for item in items
        if _item_passes(item, source=source, member=member, keyword=keyword, query=query)
    ]
    filtered.sort(key=lambda item: item.published_at, reverse=True)
    if cursor:
        try:
            cursor_index = next(index for index, item in enumerate(filtered) if item.id == cursor)
            filtered = filtered[cursor_index + 1 :]
        except StopIteration:
            filtered = []
    page_items = filtered[:limit]
    return UpdateFeedResponse(
        artist_id=artist_id,
        items=page_items,
        naver_available=True,
        next_cursor=page_items[-1].id if len(filtered) > limit and page_items else None,
        has_more=len(filtered) > limit,
    )
