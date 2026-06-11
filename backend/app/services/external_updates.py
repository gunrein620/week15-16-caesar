from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from hashlib import sha256
from html import unescape
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Artist, ArtistKeyword, ExternalUpdate, Member
from app.services.link_preview import resolve_link_preview
from app.services.naver import naver_blog_search, naver_news_search
from app.services.rag import refresh_external_update_chunks

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


def _hash_content(*parts: str) -> str:
    digest = sha256()
    for part in parts:
        digest.update(part.encode("utf-8"))
        digest.update(b"\0")
    return digest.hexdigest()


def _external_id(source_type: str, item: dict[str, Any], url: str, title: str) -> str:
    candidate = item.get("link") or item.get("originallink") or url or title
    return f"{source_type}:{candidate}"


def _has_any_term(text: str, terms: list[str]) -> bool:
    lowered = text.lower()
    return any(term.lower() in lowered for term in terms if term)


def _is_relevant_item(source_type: str, title: str, description: str, terms: list[str]) -> bool:
    if source_type == "naver_blog":
        return _has_any_term(title, terms)
    return _has_any_term(f"{title}\n{description}", terms)


def _sync_naver_items(
    db: Session,
    artist_id: int,
    *,
    source_type: str,
    source_label: str,
    items: list[dict[str, Any]],
    relevance_terms: list[str],
) -> dict[str, int]:
    created = 0
    updated = 0
    for item in items:
        title = _clean(item.get("title"))
        description = _clean(item.get("description"))
        url = item.get("originallink") or item.get("link") or ""
        if not title or not url:
            continue
        if not _is_relevant_item(source_type, title, description, relevance_terms):
            continue
        preview = resolve_link_preview(url)
        thumbnail_url = preview.get("thumbnail_url", "")
        content_hash = _hash_content(title, description, url, thumbnail_url)
        external_id = _external_id(source_type, item, url, title)
        existing = db.scalar(
            select(ExternalUpdate).where(
                ExternalUpdate.artist_id == artist_id,
                ExternalUpdate.source_type == source_type,
                ExternalUpdate.external_id == external_id,
            )
        )
        if existing is None:
            row = ExternalUpdate(
                artist_id=artist_id,
                source_type=source_type,
                external_id=external_id,
                title=title,
                description=description,
                url=url,
                thumbnail_url=thumbnail_url,
                source_label=source_label,
                published_at=_parse_naver_date(item),
                content_hash=content_hash,
                raw_payload=item,
            )
            db.add(row)
            db.flush()
            refresh_external_update_chunks(db, row)
            created += 1
            continue
        if existing.content_hash != content_hash:
            existing.title = title
            existing.description = description
            existing.url = url
            existing.thumbnail_url = thumbnail_url
            existing.source_label = source_label
            existing.published_at = _parse_naver_date(item)
            existing.content_hash = content_hash
            existing.raw_payload = item
            refresh_external_update_chunks(db, existing)
            updated += 1
    return {"created": created, "updated": updated}


def sync_external_updates(db: Session, artist_id: int, *, display: int = 20) -> dict[str, int | bool | str]:
    artist = db.get(Artist, artist_id)
    if artist is None:
        return {"naver_available": False, "naver_created": 0, "naver_updated": 0, "error": "Artist not found"}
    relevance_terms = [
        keyword
        for keyword in db.scalars(
            select(ArtistKeyword.keyword).where(ArtistKeyword.artist_id == artist_id)
        ).all()
    ] + [
        member
        for member in db.scalars(select(Member.name).where(Member.artist_id == artist_id)).all()
    ]
    try:
        news_result = _sync_naver_items(
            db,
            artist_id,
            source_type="naver_news",
            source_label="Naver News",
            items=naver_news_search(artist.name, display=display),
            relevance_terms=relevance_terms,
        )
        blog_result = _sync_naver_items(
            db,
            artist_id,
            source_type="naver_blog",
            source_label="Naver Blog",
            items=naver_blog_search(artist.name, display=display),
            relevance_terms=relevance_terms,
        )
    except Exception as exc:
        db.rollback()
        return {
            "naver_available": False,
            "naver_created": 0,
            "naver_updated": 0,
            "error": str(exc),
        }
    db.commit()
    return {
        "naver_available": True,
        "naver_created": news_result["created"] + blog_result["created"],
        "naver_updated": news_result["updated"] + blog_result["updated"],
    }
