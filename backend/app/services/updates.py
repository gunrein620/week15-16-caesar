from collections.abc import Collection
from datetime import UTC, date, datetime
from html import unescape
import json
import re
from zoneinfo import ZoneInfo

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
SEOUL_TIME_ZONE = ZoneInfo("Asia/Seoul")

MEMBER_ALIASES = {
    "Woni": (
        "Woni",
        "WONI",
        "원이",
        "ウォニ",
        "Jeong Woni",
        "Jeong Won-i",
        "Jung Woni",
        "정원이",
        "RESCENE WONI",
        "rescenewoni",
        "리센느원이",
        "helloiamwoninicetomeetyou",
        "원이입니다",
        "인간 파이리상",
        "파이리상",
    ),
    "Liv": (
        "Liv",
        "LIV",
        "리브",
        "リブ",
        "Jin Kyung-eun",
        "Jin Kyungeun",
        "진경은",
        "RESCENE LIV",
        "resceneliv",
        "리센느리브",
        "Voice Fairy",
        "보이스 페어리",
        "보이스페어리",
        "음색요정",
        "Just Liv",
        "그냥리브",
    ),
    "Minami": (
        "Minami",
        "MINAMI",
        "미나미",
        "ミナミ",
        "Ito Minami",
        "Itō Minami",
        "이토 미나미",
        "伊藤 南美",
        "RESCENE MINAMI",
        "resceneminami",
        "리센느미나미",
        "나미",
        "미나미나",
        "My Teenage Girl",
        "방과후 설렘",
    ),
    "May": (
        "May",
        "MAY",
        "메이",
        "メイ",
        "Lee Ye-bin",
        "Lee Yebin",
        "이예빈",
        "RESCENE MAY",
        "rescenemay",
        "리센느메이",
        "꼬맹이",
        "Kkomaeng-ie",
        "sunshine",
        "햇살",
        "메이메이",
    ),
    "Zena": (
        "Zena",
        "ZENA",
        "제나",
        "ゼナ",
        "Kim Ga-young",
        "Kim Gayoung",
        "김가영",
        "RESCENE ZENA",
        "rescenezena",
        "리센느제나",
        "신라공주",
        "신라 공주",
        "경주공주",
        "경주 공주",
        "MAVE",
        "MAVE:",
        "마브",
        "마베",
    ),
}

KEYWORD_ALIASES = {
    "컴백": ("컴백", "comeback"),
    "무대": ("무대", "stage", "performance"),
    "직캠": ("직캠", "fancam"),
    "라디오": ("라디오", "radio"),
    "Love Attack": ("Love Attack", "러브어택", "러브 어택", "loveattack"),
    "Runaway": ("Runaway", "Run Away", "런어웨이", "런 어웨이", "runaway"),
    "Deja Vu": ("Deja Vu", "DejaVu", "Deja-Vu", "데자부", "데자뷰"),
    "Glow Up": ("Glow Up", "GlowUp", "글로우업", "글로우 업"),
    "Pinball": ("Pinball", "핀볼", "ピンボール"),
    "UhUh": ("UhUh", "Uh Uh", "Uh-Uh", "Uhuh"),
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


def _published_timestamp(item: UpdateFeedItem) -> float:
    return _aware(item.published_at).timestamp()


def _seoul_date(value: datetime) -> date:
    return _aware(value).astimezone(SEOUL_TIME_ZONE).date()


def _view_count(value: int | None) -> int:
    return value if value is not None else -1


def _thumbnail_members(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, str) and item.strip()]


def select_home_highlight_item(
    items: list[UpdateFeedItem],
    now: datetime | None = None,
) -> UpdateFeedItem | None:
    if not items:
        return None
    today = _seoul_date(now or datetime.now(UTC))
    todays_items = [item for item in items if _seoul_date(item.published_at) == today]
    candidates = todays_items or items
    return max(
        candidates, key=lambda item: (_view_count(item.view_count), _published_timestamp(item))
    )


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
    normalized_alias = _normalize_match_text(alias)
    return alias_lowered in lowered or (
        bool(normalized_alias) and normalized_alias in _normalize_match_text(text)
    )


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
    left_values = {
        normalized
        for alias in left
        if alias.strip()
        for normalized in [_normalize_match_text(alias)]
        if normalized
    }
    right_values = {
        normalized
        for alias in right
        if alias.strip()
        for normalized in [_normalize_match_text(alias)]
        if normalized
    }
    return bool(left_values & right_values)


def _member_filter_matches(member_names: list[str], member: str) -> bool:
    return any(
        _alias_sets_overlap(_member_aliases(name), _member_aliases(member)) for name in member_names
    )


def _keyword_filter_matches(values: list[str], keyword: str) -> bool:
    return any(
        _alias_sets_overlap(_keyword_aliases(value), _keyword_aliases(keyword)) for value in values
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
    source_types: Collection[str] | None = None,
    published_after: datetime | None = None,
    published_before: datetime | None = None,
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
    if source_types and item.item_type not in source_types:
        return False
    published_at = _aware(item.published_at)
    if published_after is not None and published_at < _aware(published_after):
        return False
    if published_before is not None and published_at > _aware(published_before):
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
    source_types: Collection[str] | None = None,
    published_after: datetime | None = None,
    published_before: datetime | None = None,
    sort: str | None = None,
    limit: int = 30,
    cursor: str | None = None,
) -> UpdateFeedResponse:
    artist = db.get(Artist, artist_id)
    if artist is None:
        return UpdateFeedResponse(artist_id=artist_id, items=[], naver_available=False)

    members = [
        item.name for item in db.scalars(select(Member).where(Member.artist_id == artist_id)).all()
    ]
    artist_keywords = [
        item.keyword
        for item in db.scalars(
            select(ArtistKeyword).where(ArtistKeyword.artist_id == artist_id)
        ).all()
    ]
    items: list[UpdateFeedItem] = []

    video_stmt = (
        select(YoutubeVideo)
        .join(YoutubeVideoSource)
        .join(YoutubeSource)
        .where(YoutubeSource.artist_id == artist_id)
    )
    if published_after is not None:
        video_stmt = video_stmt.where(YoutubeVideo.published_at >= _aware(published_after))
    if published_before is not None:
        video_stmt = video_stmt.where(YoutubeVideo.published_at <= _aware(published_before))
    if sort == "popular":
        video_stmt = video_stmt.order_by(
            YoutubeVideo.view_count.desc().nullslast(),
            YoutubeVideo.published_at.desc().nullslast(),
        )
    else:
        video_stmt = video_stmt.order_by(YoutubeVideo.published_at.desc().nullslast())
    videos = db.scalars(video_stmt.limit(max(200, limit))).unique().all()
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
                thumbnail_analysis_status=video.thumbnail_analysis_status,
                thumbnail_detected_members=_thumbnail_members(video.thumbnail_detected_members),
                thumbnail_person_count=video.thumbnail_person_count,
                thumbnail_analysis_confidence=video.thumbnail_analysis_confidence,
            )
        )

    briefing_rows = db.execute(
        select(Briefing, Post)
        .join(Post, Post.id == Briefing.post_id)
        .where(Briefing.artist_id == artist_id)
        .order_by(Post.created_at.desc(), Post.id.desc())
        .limit(10)
    ).all()
    briefing_post_ids = {post.id for _, post in briefing_rows}
    for briefing, post in briefing_rows:
        text = f"{post.title}\n{post.content}"
        items.append(
            UpdateFeedItem(
                id=f"briefing:{briefing.id}",
                item_type="briefing",
                title=post.title or "오늘의 리센느 요약",
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
            .order_by(Post.created_at.desc(), Post.id.desc())
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
        if _item_passes(
            item,
            source=source,
            member=member,
            keyword=keyword,
            query=query,
            source_types=source_types,
            published_after=published_after,
            published_before=published_before,
        )
    ]
    if sort == "popular":
        filtered.sort(
            key=lambda item: (_view_count(item.view_count), item.published_at), reverse=True
        )
    else:
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
