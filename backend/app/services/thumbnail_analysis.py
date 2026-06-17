from __future__ import annotations

from datetime import UTC, datetime, timedelta
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Member, YoutubeSource, YoutubeVideo, YoutubeVideoSource


def _member_set(known_members: list[str]) -> set[str]:
    names = set(known_members)
    aliases = {
        "Woni": {"Woni", "원이"},
        "Liv": {"Liv", "리브"},
        "Minami": {"Minami", "미나미"},
        "May": {"May", "메이"},
        "Zena": {"Zena", "제나"},
    }
    for canonical, values in aliases.items():
        if canonical in names or values & names:
            names.add(canonical)
            names.update(values)
    return names


def _canonical_member(value: str) -> str | None:
    normalized = "".join(ch for ch in value.strip().lower() if ch.isalnum())
    aliases = {
        "woni": "Woni",
        "원이": "Woni",
        "liv": "Liv",
        "리브": "Liv",
        "minami": "Minami",
        "미나미": "Minami",
        "may": "May",
        "메이": "May",
        "zena": "Zena",
        "제나": "Zena",
    }
    return aliases.get(normalized)


def _normalized_members(values: Any, known_members: list[str]) -> list[str]:
    if not isinstance(values, list):
        return []
    allowed = _member_set(known_members)
    members: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        canonical = _canonical_member(value)
        if canonical and canonical in allowed and canonical not in members:
            members.append(canonical)
    return members


def _normalized_person_count(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if 0 <= parsed <= 20 else None


def _normalized_confidence(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < 0 or parsed > 1:
        return None
    return parsed


def _response_content(response: Any) -> str:
    choices = response.get("choices", []) if isinstance(response, dict) else getattr(response, "choices", [])
    if not choices:
        return ""
    choice = choices[0]
    message = choice.get("message", {}) if isinstance(choice, dict) else getattr(choice, "message", {})
    content = message.get("content", "") if isinstance(message, dict) else getattr(message, "content", "")
    return content or ""


def parse_thumbnail_analysis(content: str, *, known_members: list[str], model: str) -> dict[str, Any]:
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return {
            "status": "failed",
            "person_count": None,
            "detected_members": [],
            "confidence": None,
            "error": "invalid_json",
            "model": model,
        }
    if not isinstance(payload, dict):
        return {
            "status": "failed",
            "person_count": None,
            "detected_members": [],
            "confidence": None,
            "error": "invalid_payload",
            "model": model,
        }
    return {
        "status": "analyzed",
        "person_count": _normalized_person_count(payload.get("person_count")),
        "detected_members": _normalized_members(payload.get("detected_members"), known_members),
        "confidence": _normalized_confidence(payload.get("confidence")),
        "error": "",
        "model": model,
    }


def analyze_thumbnail_url(thumbnail_url: str, *, known_members: list[str]) -> dict[str, Any]:
    settings = get_settings()
    model = settings.thumbnail_analysis_model
    if not settings.openai_api_key:
        return {
            "status": "failed",
            "person_count": None,
            "detected_members": [],
            "confidence": None,
            "error": "missing_openai_api_key",
            "model": model,
        }
    if not thumbnail_url.strip():
        return {
            "status": "unavailable",
            "person_count": None,
            "detected_members": [],
            "confidence": None,
            "error": "missing_thumbnail_url",
            "model": model,
        }
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    member_text = ", ".join(known_members)
    try:
        response = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You analyze RESCENE YouTube thumbnails for search metadata. "
                        "Return JSON only. Count visible people when possible. "
                        "List member names only when visible thumbnail text or non-face context explicitly names them; "
                        "do not identify a real person solely from their face. "
                        "Schema: {\"person_count\": number|null, \"detected_members\": [\"...\"], "
                        "\"confidence\": number|null}."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"Known RESCENE members: {member_text}. Analyze this thumbnail.",
                        },
                        {"type": "image_url", "image_url": {"url": thumbnail_url, "detail": "high"}},
                    ],
                },
            ],
        )
    except Exception as exc:
        return {
            "status": "failed",
            "person_count": None,
            "detected_members": [],
            "confidence": None,
            "error": f"openai_error:{type(exc).__name__}",
            "model": model,
        }
    return parse_thumbnail_analysis(_response_content(response), known_members=known_members, model=model)


def _known_members(db: Session, artist_id: int) -> list[str]:
    return [item.name for item in db.scalars(select(Member).where(Member.artist_id == artist_id)).all()]


def _thumbnail_candidates(
    db: Session,
    artist_id: int,
    *,
    days: int | None,
    force: bool,
) -> list[YoutubeVideo]:
    statement = (
        select(YoutubeVideo)
        .join(YoutubeVideoSource, YoutubeVideoSource.video_id == YoutubeVideo.id)
        .join(YoutubeSource, YoutubeSource.id == YoutubeVideoSource.source_id)
        .where(YoutubeSource.artist_id == artist_id)
        .where(YoutubeVideo.thumbnail_url != "")
        .order_by(YoutubeVideo.published_at.desc().nullslast(), YoutubeVideo.id.asc())
    )
    if days is not None:
        statement = statement.where(YoutubeVideo.published_at >= datetime.now(UTC) - timedelta(days=days))
    if not force:
        statement = statement.where(YoutubeVideo.thumbnail_analysis_status == "pending")
    return list(db.scalars(statement).unique().all())


def analyze_thumbnail_batch(
    db: Session,
    artist_id: int,
    *,
    limit: int,
    days: int | None = None,
    force: bool = False,
) -> dict[str, int]:
    known_members = _known_members(db, artist_id)
    candidates = _thumbnail_candidates(db, artist_id, days=days, force=force)
    processed = analyzed = unavailable = failed = 0
    for video in candidates[:limit]:
        processed += 1
        result = analyze_thumbnail_url(video.thumbnail_url, known_members=known_members)
        status = str(result.get("status") or "failed")
        video.thumbnail_analysis_status = status if status in {"analyzed", "failed", "unavailable"} else "failed"
        video.thumbnail_analyzed_at = datetime.now(UTC)
        video.thumbnail_analysis_model = str(result.get("model") or "")
        video.thumbnail_analysis_error = str(result.get("error") or "")[:1000]
        video.thumbnail_detected_members = json.dumps(
            result.get("detected_members") or [],
            ensure_ascii=False,
        )
        video.thumbnail_person_count = result.get("person_count")
        video.thumbnail_analysis_confidence = result.get("confidence")
        if video.thumbnail_analysis_status == "analyzed":
            analyzed += 1
        elif video.thumbnail_analysis_status == "unavailable":
            unavailable += 1
        else:
            failed += 1
    return {
        "processed": processed,
        "analyzed": analyzed,
        "unavailable": unavailable,
        "failed": failed,
        "remaining": max(len(candidates) - processed, 0),
    }
