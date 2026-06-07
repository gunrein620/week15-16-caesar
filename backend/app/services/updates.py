from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from html import unescape
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Artist,
    ArtistKeyword,
    Briefing,
    Member,
    Post,
    PostTag,
    YoutubeSource,
    YoutubeVideo,
    YoutubeVideoSource,
)
from app.schemas import UpdateFeedItem, UpdateFeedResponse
from app.services.link_preview import resolve_page_thumbnail
from app.services.naver import naver_blog_search, naver_news_search


TAG_RE = re.compile(r"<[^>]+>")


def _clean(value: str | None) -> str:
    return TAG_RE.sub("", unescape(value or "")).strip()


def _aware(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _parse_naver_date(item: dict[str, Any]) -> datetime:
    if item.get("pubDate"):
        return _aware(parsedate_to_datetime(item["pubDate"]))
    if item.get("postdate"):
        return datetime.strptime(item["postdate"], "%Y%m%d").replace(tzinfo=UTC)
    return datetime.now(UTC)


def _matches(text: str, candidates: list[str]) -> list[str]:
    lowered = text.lower()
    return [candidate for candidate in candidates if candidate.lower() in lowered]


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
    if member and member.lower() not in haystack:
        return False
    if keyword and keyword.lower() not in haystack:
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
        .limit(30)
    ).all()
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
                matched_keywords=sorted(set(_matches(text, artist_keywords + ([keyword] if keyword else [])))),
                member_names=_matches(text, members),
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
                description=_clean(post.content),
                url=f"/posts/{post.id}",
                source_label="Briefing",
                published_at=_aware(post.created_at),
                comment_count=len(post.comments),
                matched_keywords=_matches(text, artist_keywords + _post_tags(post)),
                member_names=_matches(text, members),
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
            .limit(30)
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
                description=_clean(post.content),
                url=f"/posts/{post.id}",
                source_label="Fan post",
                published_at=_aware(post.created_at),
                comment_count=len(post.comments),
                matched_keywords=sorted(set(_matches(text, artist_keywords + tags + ([keyword] if keyword else [])))),
                member_names=_matches(text, members),
                tags=tags,
            )
        )

    naver_available = True
    if source in {None, "naver", "naver_news", "naver_blog"}:
        try:
            for item in naver_news_search(artist.name, display=3):
                title = _clean(item.get("title"))
                description = _clean(item.get("description"))
                url = item.get("originallink") or item.get("link") or ""
                text = f"{title}\n{description}"
                items.append(
                    UpdateFeedItem(
                        id=f"naver_news:{item.get('link', title)}",
                        item_type="naver_news",
                        title=title,
                        description=description,
                        url=url,
                        thumbnail_url=resolve_page_thumbnail(url),
                        source_label="Naver News",
                        published_at=_parse_naver_date(item),
                        matched_keywords=_matches(text, artist_keywords + ([keyword] if keyword else [])),
                        member_names=_matches(text, members),
                    )
                )
            for item in naver_blog_search(artist.name, display=3):
                title = _clean(item.get("title"))
                description = _clean(item.get("description"))
                url = item.get("link") or ""
                text = f"{title}\n{description}"
                items.append(
                    UpdateFeedItem(
                        id=f"naver_blog:{item.get('link', title)}",
                        item_type="naver_blog",
                        title=title,
                        description=description,
                        url=url,
                        thumbnail_url=resolve_page_thumbnail(url),
                        source_label="Naver Blog",
                        published_at=_parse_naver_date(item),
                        matched_keywords=_matches(text, artist_keywords + ([keyword] if keyword else [])),
                        member_names=_matches(text, members),
                    )
                )
        except Exception:
            naver_available = False

    filtered = [
        item
        for item in items
        if _item_passes(item, source=source, member=member, keyword=keyword, query=query)
    ]
    filtered.sort(key=lambda item: item.published_at, reverse=True)
    return UpdateFeedResponse(
        artist_id=artist_id,
        items=filtered[:limit],
        naver_available=naver_available,
    )
