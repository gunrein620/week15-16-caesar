from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_session_factory
from app.models import ArtistArchiveTerm


KST = timezone(timedelta(hours=9))


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
    time_after: time | None = None
    published_after: datetime | None = None
    published_before: datetime | None = None
    media_type: str | None = None
    include_terms: tuple[str, ...] = ()
    exclude_terms: tuple[str, ...] = ()
    sort: str | None = None
    llm_used: bool = False
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


def _time_after(question: str) -> time | None:
    if not any(term in question for term in ("이후", "부터")):
        return None

    match = re.search(
        r"(?P<meridiem>오전|오후|낮|밤|새벽)?\s*"
        r"(?P<hour>\d{1,2})"
        r"(?:(?:\s*:\s*(?P<colon_minute>\d{1,2}))|(?:\s*시(?:\s*(?P<si_minute>\d{1,2})\s*분?)?))?"
        r"\s*(?:이후|부터)",
        question,
    )
    if match is None:
        return None

    hour = int(match.group("hour"))
    minute = int(match.group("colon_minute") or match.group("si_minute") or 0)
    meridiem = match.group("meridiem")
    if hour > 24 or minute > 59:
        return None
    if hour == 24 and minute != 0:
        return None

    if meridiem in {"오후", "낮"} and hour < 12:
        hour += 12
    elif meridiem in {"오전", "새벽"} and hour == 12:
        hour = 0
    elif meridiem is None and hour == 12:
        hour = 12

    if hour == 24:
        hour = 0
    return time(hour=hour, minute=minute)


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=KST)
    return parsed.astimezone(UTC)


def _string_tuple(value: Any) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    normalized: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            normalized.append(item.strip())
    return tuple(dict.fromkeys(normalized))


def _valid_route(value: Any) -> str | None:
    if value in {"archive", "updates"}:
        return value
    return None


def _valid_temporal(value: Any) -> str | None:
    if value in {"today", "recent", "custom"}:
        return value
    return None


def _valid_media_type(value: Any) -> str | None:
    if value == "youtube":
        return "youtube"
    return None


def _valid_sort(value: Any) -> str | None:
    if value in {"latest", "popular", "relevance"}:
        return value
    return None


def _llm_payload(question: str, archive_terms: list[ArchiveTermMatch]) -> dict[str, Any] | None:
    settings = get_settings()
    if not settings.openai_api_key:
        return None

    archive_dictionary = [
        {
            "type": term.term_type,
            "title": term.title,
            "aliases": list(term.raw_aliases),
        }
        for term in archive_terms[:80]
    ]
    now_kst = datetime.now(KST)
    system = (
        "You extract structured search intent for a RESCENE fan archive. "
        "Return JSON only. Do not answer the user. "
        "Use route='updates' for recent/live/time-bounded news, videos, posts, or feeds. "
        "Use route='archive' for older reference lookup, song/activity summaries, or semantic archive search. "
        "Use ISO 8601 timestamps with timezone for date filters. Interpret relative dates in Asia/Seoul. "
        "Set media_type='youtube' only when the user asks for videos, YouTube, fancams, stages, shorts, lives, or clips. "
        "Use include_terms and exclude_terms for explicit required or excluded words, members, channels, songs, or topics. "
        "Output schema: {"
        "\"route\":\"archive|updates\","
        "\"temporal\":\"today|recent|custom|null\","
        "\"media_type\":\"youtube|null\","
        "\"published_after\":\"ISO|null\","
        "\"published_before\":\"ISO|null\","
        "\"include_terms\":[\"...\"],"
        "\"exclude_terms\":[\"...\"],"
        "\"sort\":\"latest|popular|relevance|null\""
        "}."
    )
    user = {
        "now": now_kst.isoformat(),
        "timezone": "Asia/Seoul",
        "question": question,
        "known_archive_terms": archive_dictionary,
    }
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.chat_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
            ],
        )
    except Exception:
        return None

    content = response.choices[0].message.content if response.choices else None
    if not content:
        return None
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


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
        archive_terms = _load_archive_terms(session, artist_id, question)
        llm_payload = _llm_payload(question, archive_terms)
        if llm_payload is not None:
            route = _valid_route(llm_payload.get("route"))
            media_type = _valid_media_type(llm_payload.get("media_type"))
            temporal = _valid_temporal(llm_payload.get("temporal"))
            published_after = _parse_datetime(llm_payload.get("published_after"))
            published_before = _parse_datetime(llm_payload.get("published_before"))
            if route is not None:
                if route == "archive" and (published_after or published_before or temporal):
                    route = "updates"
                return SearchIntent(
                    question=question,
                    artist_id=artist_id,
                    route=route,
                    temporal=temporal,
                    time_after=_time_after(question) if temporal == "today" else None,
                    published_after=published_after,
                    published_before=published_before,
                    media_type=media_type,
                    include_terms=_string_tuple(llm_payload.get("include_terms")),
                    exclude_terms=_string_tuple(llm_payload.get("exclude_terms")),
                    sort=_valid_sort(llm_payload.get("sort")),
                    llm_used=True,
                    archive_terms=archive_terms,
                )

        temporal = _temporal(question)
        route = "updates" if temporal else "archive"
        return SearchIntent(
            question=question,
            artist_id=artist_id,
            route=route,
            temporal=temporal,
            time_after=_time_after(question) if temporal == "today" else None,
            media_type=_media_type(question),
            archive_terms=archive_terms,
        )

    if db is not None:
        return build(db)

    with get_session_factory()() as session:
        return build(session)
