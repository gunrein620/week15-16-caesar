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
from app.models import ArtistArchiveTerm, Member


KST = timezone(timedelta(hours=9))
SHORT_LATIN_ARCHIVE_ALIAS_RE = re.compile(r"^[0-9a-z]{1,3}$")


def normalize_search_text(value: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]+", "", value.lower())


def archive_alias_matches_text(
    text: str,
    alias: str,
    normalized_text: str | None = None,
) -> bool:
    normalized_alias = normalize_search_text(alias)
    if not normalized_alias:
        return False
    if SHORT_LATIN_ARCHIVE_ALIAS_RE.fullmatch(normalized_alias):
        return (
            re.search(
                rf"(?<![0-9a-z]){re.escape(normalized_alias)}(?![0-9a-z])",
                text.lower(),
            )
            is not None
        )
    return normalized_alias in (normalized_text or normalize_search_text(text))


def expand_source_types(source_types: Iterable[str]) -> frozenset[str]:
    expanded: set[str] = set()
    for source_type in source_types:
        expanded.add(source_type)
        # briefings are posts, so a "post" filter must keep briefing items
        if source_type == "post":
            expanded.add("briefing")
    return frozenset(expanded)


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
    boost_terms: tuple[str, ...] = ()
    exclude_terms: tuple[str, ...] = ()
    source_types: tuple[str, ...] = ()
    content_source_types: tuple[str, ...] = ()
    sort: str | None = None
    member_count: int | None = None
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
        "나오는",
        "나온",
        "등장",
        "출연",
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


DATE_RANGE_RE = re.compile(
    r"(?<!\d)"
    r"(?:(?P<start_month>\d{1,2})\s*월\s*)?"
    r"(?P<start_day>\d{1,2})\s*일?\s*"
    r"(?:부터|에서|~|-)"
    r"\s*(?:(?P<end_month>\d{1,2})\s*월\s*)?"
    r"(?P<end_day>\d{1,2})\s*일?"
    r"(?:\s*(?:까지|사이|간))?"
)


def _popular_sort(question: str) -> str | None:
    normalized = normalize_search_text(question)
    if any(term in normalized for term in ("최신순", "최근순", "새로운순")):
        return "latest"
    if any(
        term in normalized
        for term in (
            "조회수",
            "인기순",
            "인기",
            "많이본",
            "많이본영상",
            "최다조회",
            "높은조회",
            "내림차순",
        )
    ):
        return "popular"
    return None


def _date_range(question: str) -> tuple[datetime, datetime] | None:
    match = DATE_RANGE_RE.search(question)
    if match is None:
        return None

    now_kst = datetime.now(KST)
    start_month = int(match.group("start_month") or now_kst.month)
    end_month = int(match.group("end_month") or match.group("start_month") or now_kst.month)
    start_day = int(match.group("start_day"))
    end_day = int(match.group("end_day"))
    try:
        start_local = datetime(now_kst.year, start_month, start_day, tzinfo=KST)
        end_local = datetime(now_kst.year, end_month, end_day, tzinfo=KST)
    except ValueError:
        return None
    if end_local < start_local:
        if match.group("start_month") and match.group("end_month") and end_month < start_month:
            end_local = datetime(now_kst.year + 1, end_month, end_day, tzinfo=KST)
        else:
            return None
    return start_local.astimezone(UTC), (end_local + timedelta(days=1)).astimezone(UTC)


def _fallback_source_types(media_type: str | None) -> tuple[str, ...]:
    return ("youtube",) if media_type == "youtube" else ()


def _fallback_content_source_types(question: str) -> tuple[str, ...]:
    normalized = normalize_search_text(question)
    if any(term in normalized for term in ("공식", "공계", "official", "오피셜")):
        return ("official_channel",)
    return ()


def _matched_member_terms(db: Session, artist_id: int, question: str) -> tuple[str, ...]:
    from app.services.updates import _contains_alias, _member_aliases

    rows = db.scalars(select(Member).where(Member.artist_id == artist_id)).all()
    matched: list[str] = []
    for member in rows:
        if any(_contains_alias(question, alias) for alias in _member_aliases(member.name)):
            matched.append(member.name)
    return tuple(dict.fromkeys(matched))


def _single_member_only_count(question: str, member_terms: tuple[str, ...]) -> int | None:
    from app.services.updates import _member_aliases

    normalized = normalize_search_text(question)
    if any(
        term in normalized
        for term in (
            "멤버한명",
            "한명만",
            "1명만",
            "혼자",
            "단독",
            "개인직캠",
            "솔로직캠",
            "solo",
        )
    ):
        return 1
    for member in member_terms:
        for alias in _member_aliases(member):
            alias_normalized = normalize_search_text(alias)
            if alias_normalized and f"{alias_normalized}만" in normalized:
                return 1
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


def _valid_source_types(value: Any) -> tuple[str, ...]:
    allowed = {"youtube", "post", "briefing", "naver_news", "naver_blog"}
    return tuple(item for item in _string_tuple(value) if item in allowed)


def _valid_content_source_types(value: Any) -> tuple[str, ...]:
    allowed = {
        "official_channel",
        "member_channel",
        "fan_channel",
        "curated_video",
        "keyword_search",
        "community_post",
        "briefing",
        "naver_news",
        "naver_blog",
    }
    return tuple(item for item in _string_tuple(value) if item in allowed)


def _valid_sort(value: Any) -> str | None:
    if value in {"latest", "popular", "relevance"}:
        return value
    return None


def _valid_member_count(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if 1 <= parsed <= 5 else None


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
        "For Korean ranges like '10일부터 15일 사이', use the current month/year when omitted, "
        "set published_after to the start day 00:00 Asia/Seoul, and set published_before to the day after the end day 00:00 Asia/Seoul. "
        "Set media_type='youtube' only when the user asks for videos, YouTube, fancams, stages, shorts, lives, or clips. "
        "For official, official account, official channel, 공식, or 공계 requests, set content_source_types=['official_channel']. "
        "For view-count, popularity, '많이 본', or descending ranking requests, set route='updates' and sort='popular'. "
        "Use include_terms and exclude_terms for explicit required or excluded words, members, channels, songs, or topics. "
        "If the user asks for only one member/person, solo, individual, or a single-member video, set member_count=1. "
        "Use boost_terms for helpful but not mandatory ranking hints. "
        "Output schema: {"
        '"route":"archive|updates",'
        '"temporal":"today|recent|custom|null",'
        '"media_type":"youtube|null",'
        '"source_types":["youtube|post|briefing|naver_news|naver_blog"],'
        '"content_source_types":["official_channel|member_channel|fan_channel|curated_video|keyword_search"],'
        '"published_after":"ISO|null",'
        '"published_before":"ISO|null",'
        '"include_terms":["..."],'
        '"boost_terms":["..."],'
        '"exclude_terms":["..."],'
        '"sort":"latest|popular|relevance|null",'
        '"member_count":"number|null"'
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


def intent_to_payload(intent: SearchIntent) -> dict[str, Any]:
    return {
        "route": intent.route,
        "temporal": intent.temporal,
        "time_after": intent.time_after.isoformat() if intent.time_after else None,
        "published_after": intent.published_after.isoformat() if intent.published_after else None,
        "published_before": intent.published_before.isoformat()
        if intent.published_before
        else None,
        "media_type": intent.media_type,
        "include_terms": list(intent.include_terms),
        "boost_terms": list(intent.boost_terms),
        "exclude_terms": list(intent.exclude_terms),
        "source_types": list(intent.source_types),
        "content_source_types": list(intent.content_source_types),
        "sort": intent.sort,
        "member_count": intent.member_count,
        "llm_used": intent.llm_used,
    }


def _parse_time(value: Any) -> time | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return time.fromisoformat(value.strip())
    except ValueError:
        return None


def intent_from_payload(
    payload: dict[str, Any],
    *,
    question: str,
    artist_id: int,
    db: Session,
) -> SearchIntent | None:
    route = _valid_route(payload.get("route"))
    if route is None:
        return None
    temporal = _valid_temporal(payload.get("temporal"))
    published_after = _parse_datetime(payload.get("published_after"))
    published_before = _parse_datetime(payload.get("published_before"))
    if route == "archive" and (published_after or published_before or temporal):
        route = "updates"
    return SearchIntent(
        question=question,
        artist_id=artist_id,
        route=route,
        temporal=temporal,
        time_after=_parse_time(payload.get("time_after")),
        published_after=published_after,
        published_before=published_before,
        media_type=_valid_media_type(payload.get("media_type")),
        include_terms=_string_tuple(payload.get("include_terms")),
        boost_terms=_string_tuple(payload.get("boost_terms")),
        exclude_terms=_string_tuple(payload.get("exclude_terms")),
        source_types=_valid_source_types(payload.get("source_types")),
        content_source_types=_valid_content_source_types(payload.get("content_source_types")),
        sort=_valid_sort(payload.get("sort")),
        member_count=_valid_member_count(payload.get("member_count")),
        llm_used=bool(payload.get("llm_used")),
        archive_terms=_load_archive_terms(db, artist_id, question),
    )


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
        if any(
            archive_alias_matches_text(question, raw_alias, normalized_question)
            for raw_alias in raw_aliases
        ):
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
        fallback_media_type = _media_type(question)
        fallback_temporal = _temporal(question)
        fallback_range = _date_range(question)
        fallback_published_after = fallback_range[0] if fallback_range else None
        fallback_published_before = fallback_range[1] if fallback_range else None
        fallback_sort = _popular_sort(question)
        fallback_member_terms = _matched_member_terms(session, artist_id, question)
        fallback_member_count = _single_member_only_count(question, fallback_member_terms)
        fallback_content_source_types = _fallback_content_source_types(question)
        fallback_include_terms = (
            fallback_member_terms
            if fallback_media_type == "youtube" or fallback_member_count is not None
            else ()
        )
        llm_payload = _llm_payload(question, archive_terms)
        if llm_payload is not None:
            route = _valid_route(llm_payload.get("route"))
            media_type = _valid_media_type(llm_payload.get("media_type")) or fallback_media_type
            temporal = _valid_temporal(llm_payload.get("temporal"))
            published_after = (
                _parse_datetime(llm_payload.get("published_after")) or fallback_published_after
            )
            published_before = (
                _parse_datetime(llm_payload.get("published_before")) or fallback_published_before
            )
            sort = _valid_sort(llm_payload.get("sort")) or fallback_sort
            member_count = (
                _valid_member_count(llm_payload.get("member_count")) or fallback_member_count
            )
            if temporal is None and fallback_range is not None:
                temporal = "custom"
            source_types = _valid_source_types(llm_payload.get("source_types"))
            if not source_types:
                source_types = _fallback_source_types(media_type)
            content_source_types = _valid_content_source_types(
                llm_payload.get("content_source_types")
            )
            if not content_source_types:
                content_source_types = fallback_content_source_types
            include_terms = _string_tuple(llm_payload.get("include_terms"))
            if fallback_include_terms:
                include_terms = tuple(dict.fromkeys([*include_terms, *fallback_include_terms]))
            if route is not None:
                if route == "archive" and (
                    published_after
                    or published_before
                    or temporal
                    or (sort == "popular" and media_type == "youtube")
                    or (member_count is not None and media_type == "youtube")
                ):
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
                    include_terms=include_terms,
                    boost_terms=_string_tuple(llm_payload.get("boost_terms")),
                    exclude_terms=_string_tuple(llm_payload.get("exclude_terms")),
                    source_types=source_types,
                    content_source_types=content_source_types,
                    sort=sort,
                    member_count=member_count,
                    llm_used=True,
                    archive_terms=archive_terms,
                )

        temporal = "custom" if fallback_range is not None else fallback_temporal
        route = (
            "updates"
            if (
                temporal
                or fallback_published_after is not None
                or fallback_published_before is not None
                or (fallback_sort == "popular" and fallback_media_type == "youtube")
                or (fallback_member_count is not None and fallback_media_type == "youtube")
            )
            else "archive"
        )
        return SearchIntent(
            question=question,
            artist_id=artist_id,
            route=route,
            temporal=temporal,
            time_after=_time_after(question) if temporal == "today" else None,
            published_after=fallback_published_after,
            published_before=fallback_published_before,
            media_type=fallback_media_type,
            include_terms=fallback_include_terms,
            source_types=_fallback_source_types(fallback_media_type),
            content_source_types=fallback_content_source_types,
            sort=fallback_sort,
            member_count=fallback_member_count,
            archive_terms=archive_terms,
        )

    if db is not None:
        return build(db)

    with get_session_factory()() as session:
        return build(session)
