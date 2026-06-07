from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_session_factory
from app.models import ArtistArchiveTerm


def normalize_search_text(value: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]+", "", value.lower())


@dataclass(frozen=True)
class ArchiveTermMatch:
    id: int
    term_type: str
    title: str
    aliases: tuple[str, ...]
    raw_aliases: tuple[str, ...]


@dataclass(frozen=True)
class SearchIntent:
    question: str
    artist_id: int
    route: str = "archive"
    temporal: str | None = None
    media_type: str | None = None
    archive_terms: list[ArchiveTermMatch] = field(default_factory=list)


def _unique_normalized(values: Iterable[str]) -> tuple[str, ...]:
    seen: dict[str, None] = {}
    for value in values:
        normalized = normalize_search_text(value)
        if normalized:
            seen.setdefault(normalized, None)
    return tuple(seen)


def _media_type(question: str) -> str | None:
    normalized = normalize_search_text(question)
    video_terms = (
        "youtube",
        "유튜브",
        "영상",
        "쇼츠",
        "shorts",
        "직캠",
        "무대",
        "dancepractice",
        "라이브",
    )
    if any(term in normalized for term in video_terms):
        return "youtube"
    return None


def _temporal(question: str) -> str | None:
    normalized = normalize_search_text(question)
    if any(term in normalized for term in ("오늘", "금일")):
        return "today"
    if any(
        term in normalized
        for term in (
            "최근",
            "이번주",
            "이번주간",
            "새소식",
            "최신",
            "업데이트",
        )
    ):
        return "recent"
    return None


def _load_archive_terms(
    db: Session,
    artist_id: int,
    question: str,
) -> list[ArchiveTermMatch]:
    normalized_question = normalize_search_text(question)
    rows = db.scalars(
        select(ArtistArchiveTerm).where(ArtistArchiveTerm.artist_id == artist_id)
    ).all()
    matches: list[ArchiveTermMatch] = []
    for row in rows:
        raw_aliases = tuple(dict.fromkeys([row.title, *(row.aliases or [])]))
        aliases = _unique_normalized(raw_aliases)
        if any(alias in normalized_question for alias in aliases):
            matches.append(
                ArchiveTermMatch(
                    id=row.id,
                    term_type=row.term_type,
                    title=row.title,
                    aliases=aliases,
                    raw_aliases=raw_aliases,
                )
            )
    return matches


def parse_search_intent(
    question: str,
    *,
    artist_id: int,
    db: Session | None = None,
) -> SearchIntent:
    def build(session: Session) -> SearchIntent:
        temporal = _temporal(question)
        route = "updates" if temporal else "archive"
        return SearchIntent(
            question=question,
            artist_id=artist_id,
            route=route,
            temporal=temporal,
            media_type=_media_type(question),
            archive_terms=_load_archive_terms(session, artist_id, question),
        )

    if db is not None:
        return build(db)

    with get_session_factory()() as session:
        return build(session)
