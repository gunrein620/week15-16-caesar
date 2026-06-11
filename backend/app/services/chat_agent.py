from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime
from email.utils import parsedate_to_datetime
from html import unescape
import json
import re
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_session_factory
from app.models import AgentRun
from app.schemas import ChatMessage, ChatRequest
from app.services.mcp_client import McpToolClient
from app.services.rag_context import dedupe_sources


TAG_RE = re.compile(r"<[^>]+>")

SYSTEM_PROMPT = (
    "You are a RESCENE(리센느) girl group fan archive guide. Answer in Korean. "
    "You must gather evidence with tools before answering. If there is no evidence, say so honestly. "
    "Members: 원이, 리브, 미나미, 메이, 제나. Cite sources as [1], [2] using the order in the provided sources list. "
    "Start with the conclusion, answer with enough detail when needed, and do not list raw URLs because source cards are shown separately."
)

CHAT_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_archive",
            "description": "Search saved RESCENE archive posts, videos, transcripts, and cached external updates.",
            "parameters": {
                "type": "object",
                "properties": {
                    "artist_id": {"type": "integer", "default": 1},
                    "query": {"type": "string"},
                    "media_type": {"type": "string", "enum": ["youtube"]},
                    "source_types": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["youtube", "post", "briefing", "naver_news", "naver_blog"],
                        },
                    },
                    "include_terms": {"type": "array", "items": {"type": "string"}},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 12, "default": 8},
                },
                "required": ["artist_id", "query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_updates",
            "description": "Fetch recent or today RESCENE updates from the cached update feed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "artist_id": {"type": "integer", "default": 1},
                    "temporal": {"type": "string", "enum": ["today", "recent"], "default": "recent"},
                    "source": {"type": "string", "enum": ["youtube"]},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 12, "default": 8},
                },
                "required": ["artist_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_video_detail",
            "description": "Get metadata and transcript preview for one cached YouTube video.",
            "parameters": {
                "type": "object",
                "properties": {"video_id": {"type": "string"}},
                "required": ["video_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "naver_news_search",
            "description": "Search Naver News for current RESCENE news when cached archive data is insufficient.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "display": {"type": "integer", "minimum": 1, "maximum": 5, "default": 5},
                },
                "required": ["query"],
            },
        },
    },
]


def _chat_completion(client: Any, **kwargs: Any) -> Any:
    return client.chat.completions.create(**kwargs)


def _chat_completion_stream(client: Any, **kwargs: Any) -> Any:
    return client.chat.completions.create(stream=True, **kwargs)


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=_json_default)}\n\n"


def _get(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def _message_dict(message: ChatMessage) -> dict[str, str]:
    return {"role": message.role, "content": message.content}


def _response_message(response: Any) -> Any:
    choices = _get(response, "choices", []) or []
    if not choices:
        return {}
    return _get(choices[0], "message", {})


def _message_content(message: Any) -> str:
    return _get(message, "content", "") or ""


def _message_tool_calls(message: Any) -> list[Any]:
    return list(_get(message, "tool_calls", []) or [])


def _parse_tool_arguments(raw_arguments: Any) -> dict[str, Any]:
    if isinstance(raw_arguments, dict):
        return raw_arguments
    if not isinstance(raw_arguments, str) or not raw_arguments.strip():
        return {}
    try:
        parsed = json.loads(raw_arguments)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _tool_call_parts(tool_call: Any) -> tuple[str, str, dict[str, Any]]:
    function = _get(tool_call, "function", {}) or {}
    name = _get(function, "name", "")
    arguments = _parse_tool_arguments(_get(function, "arguments", "{}"))
    call_id = _get(tool_call, "id", "") or f"call_{name or 'tool'}"
    return call_id, name, arguments


def _assistant_tool_call(call_id: str, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": call_id,
        "type": "function",
        "function": {
            "name": name,
            "arguments": json.dumps(arguments, ensure_ascii=False),
        },
    }


def _normalize_tool_arguments(name: str, arguments: dict[str, Any], artist_id: int) -> dict[str, Any]:
    normalized = dict(arguments)
    if name in {"search_archive", "get_recent_updates"}:
        normalized["artist_id"] = int(normalized.get("artist_id") or artist_id)
        try:
            normalized["limit"] = min(max(int(normalized.get("limit") or 8), 1), 12)
        except (TypeError, ValueError):
            normalized["limit"] = 8
    if name == "search_archive":
        query = str(normalized.get("query") or "").strip()
        normalized["query"] = query
    if name == "naver_news_search":
        try:
            normalized["display"] = min(max(int(normalized.get("display") or 5), 1), 5)
        except (TypeError, ValueError):
            normalized["display"] = 5
    return normalized


def _clean_external_text(value: str | None) -> str:
    return " ".join(TAG_RE.sub("", unescape(value or "")).split())


def _naver_published_at(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


def _naver_item_source(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "chunk_id": None,
        "post_id": None,
        "youtube_video_id": None,
        "external_update_id": None,
        "source_type": "naver_news",
        "title": _clean_external_text(item.get("title")),
        "url": item.get("originallink") or item.get("link") or "",
        "thumbnail_url": "",
        "channel_title": "",
        "source_label": "Naver News",
        "published_at": _naver_published_at(item.get("pubDate")),
        "view_count": None,
        "content": _clean_external_text(item.get("description")),
        "description": _clean_external_text(item.get("description")),
    }


def _video_detail_source(result: dict[str, Any]) -> dict[str, Any] | None:
    video = result.get("video")
    if not isinstance(video, dict):
        return None
    preview = result.get("transcript_preview")
    content = "\n".join(item for item in preview if isinstance(item, str)) if isinstance(preview, list) else ""
    return {
        "chunk_id": None,
        "post_id": None,
        "youtube_video_id": video.get("id"),
        "external_update_id": None,
        "source_type": "youtube",
        "title": video.get("title") or "YouTube video",
        "url": video.get("url") or "",
        "thumbnail_url": video.get("thumbnail_url") or "",
        "channel_title": video.get("channel_title") or "",
        "source_label": "YouTube",
        "published_at": video.get("published_at"),
        "view_count": video.get("view_count"),
        "content": content,
    }


def _sources_from_tool_result(name: str, result: dict[str, Any]) -> list[dict[str, Any]]:
    if name in {"search_archive", "get_recent_updates"}:
        sources = result.get("sources")
        return [source for source in sources if isinstance(source, dict)] if isinstance(sources, list) else []
    if name == "naver_news_search":
        items = result.get("items")
        return [_naver_item_source(item) for item in items if isinstance(item, dict)] if isinstance(items, list) else []
    if name == "get_video_detail":
        source = _video_detail_source(result)
        return [source] if source else []
    return []


def _tool_result_count(name: str, result: dict[str, Any]) -> int:
    if name in {"search_archive", "get_recent_updates"} and isinstance(result.get("sources"), list):
        return len(result["sources"])
    if name == "naver_news_search" and isinstance(result.get("items"), list):
        return len(result["items"])
    if name == "get_video_detail":
        return 0 if result.get("error") else 1
    return 0


def _source_type_label(source: dict[str, Any]) -> str:
    labels = {
        "youtube": "YouTube",
        "post": "게시글",
        "briefing": "브리핑",
        "naver_news": "Naver News",
        "naver_blog": "Naver Blog",
    }
    return labels.get(str(source.get("source_type") or ""), str(source.get("source_type") or "source"))


def _source_list_system_message(sources: list[dict[str, Any]]) -> dict[str, str]:
    if not sources:
        content = "No numbered sources were found. Do not invent citations."
    else:
        lines = [
            f"[{index}] {source.get('title') or 'Untitled'} — {_source_type_label(source)}"
            for index, source in enumerate(sources, start=1)
        ]
        content = (
            "Use only these numbered sources for citations. Match citation numbers exactly to this list:\n"
            + "\n".join(lines)
        )
    return {"role": "system", "content": content}


def _openai_client(settings: Any) -> Any:
    from openai import OpenAI

    return OpenAI(api_key=settings.openai_api_key)


def _complete_suggestions(client: Any, settings: Any, question: str, answer: str) -> list[str]:
    if not settings.chat_suggestions_enabled:
        return []
    try:
        response = _chat_completion(
            client,
            model=settings.rerank_model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "Return JSON only: {\"suggestions\":[\"...\",\"...\",\"...\"]}. Use Korean.",
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "question": question,
                            "answer_summary": answer[:800],
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
        )
        content = _message_content(_response_message(response))
        parsed = json.loads(content)
    except Exception:
        return []
    suggestions = parsed.get("suggestions") if isinstance(parsed, dict) else None
    if not isinstance(suggestions, list):
        return []
    return [item.strip() for item in suggestions if isinstance(item, str) and item.strip()][:3]


def _create_run(db: Session, *, artist_id: int, user_id: int, question: str) -> AgentRun:
    run = AgentRun(
        artist_id=artist_id,
        user_id=user_id,
        status="chat",
        briefing_type="chat",
        briefing_date=datetime.now(UTC).date(),
        preview_markdown=question,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _finish_run(db: Session, run_id: int, *, status: str, question: str, answer: str) -> None:
    run = db.get(AgentRun, run_id)
    if run is None:
        return
    run.status = status
    if answer:
        run.preview_markdown = f"{question}\n\n---\n\n{answer}"
    db.commit()


def stream_chat_events(payload: ChatRequest, *, user_id: int) -> Iterator[str]:
    run_id: int | None = None
    question = payload.messages[-1].content
    answer_parts: list[str] = []
    session_factory = get_session_factory()
    try:
        with session_factory() as db:
            settings = get_settings()
            run = _create_run(db, artist_id=payload.artist_id, user_id=user_id, question=question)
            run_id = run.id
            yield _sse({"type": "run", "run_id": run.id})

            mcp = McpToolClient(db, agent_run_id=run.id)
            sources: list[dict[str, Any]] = []
            if not settings.openai_api_key:
                arguments = {"artist_id": payload.artist_id, "query": question, "limit": 8}
                yield _sse({"type": "tool_call", "name": "search_archive", "arguments": arguments})
                result = mcp.call_tool("search_archive", arguments)
                db.commit()
                sources.extend(_sources_from_tool_result("search_archive", result))
                yield _sse(
                    {
                        "type": "tool_result",
                        "name": "search_archive",
                        "count": _tool_result_count("search_archive", result),
                    }
                )
                visible_sources = dedupe_sources(sources)[:12]
                yield _sse({"type": "sources", "sources": visible_sources})
                fallback = "OpenAI 키가 설정되지 않아 검색 결과만 제공합니다."
                answer_parts.append(fallback)
                yield _sse({"type": "delta", "text": fallback})
                _finish_run(db, run.id, status="chat", question=question, answer="".join(answer_parts))
                yield _sse({"type": "done"})
                return

            client = _openai_client(settings)
            messages: list[dict[str, Any]] = [
                {"role": "system", "content": SYSTEM_PROMPT},
                *[_message_dict(message) for message in payload.messages[-12:]],
            ]
            direct_content = ""
            for iteration in range(settings.chat_max_tool_iterations):
                response = _chat_completion(
                    client,
                    model=settings.chat_model,
                    stream=False,
                    messages=messages,
                    tools=CHAT_TOOLS,
                )
                message = _response_message(response)
                tool_calls = _message_tool_calls(message)
                if not tool_calls:
                    if iteration == 0:
                        direct_content = _message_content(message)
                    break

                assistant_calls: list[dict[str, Any]] = []
                for tool_call in tool_calls:
                    call_id, name, arguments = _tool_call_parts(tool_call)
                    arguments = _normalize_tool_arguments(name, arguments, payload.artist_id)
                    assistant_calls.append(_assistant_tool_call(call_id, name, arguments))
                    yield _sse({"type": "tool_call", "name": name, "arguments": arguments})
                    result = mcp.call_tool(name, arguments)
                    db.commit()
                    sources.extend(_sources_from_tool_result(name, result))
                    yield _sse(
                        {
                            "type": "tool_result",
                            "name": name,
                            "count": _tool_result_count(name, result),
                        }
                    )
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call_id,
                            "content": json.dumps(result, ensure_ascii=False, default=_json_default),
                        }
                    )
                messages.insert(
                    len(messages) - len(tool_calls),
                    {
                        "role": "assistant",
                        "content": _message_content(message),
                        "tool_calls": assistant_calls,
                    },
                )

            visible_sources = dedupe_sources(sources)[:12]
            yield _sse({"type": "sources", "sources": visible_sources})
            if direct_content:
                answer_parts.append(direct_content)
                yield _sse({"type": "delta", "text": direct_content})
            else:
                final_messages = [
                    *messages,
                    _source_list_system_message(visible_sources),
                ]
                stream = _chat_completion_stream(
                    client,
                    model=settings.chat_model,
                    messages=final_messages,
                    tools=CHAT_TOOLS,
                    tool_choice="none",
                )
                for chunk in stream:
                    choices = _get(chunk, "choices", []) or []
                    if not choices:
                        continue
                    delta = _get(choices[0], "delta", {}) or {}
                    text = _get(delta, "content", "") or ""
                    if not text:
                        continue
                    answer_parts.append(text)
                    yield _sse({"type": "delta", "text": text})

            answer_text = "".join(answer_parts)
            suggestions = _complete_suggestions(client, settings, question, answer_text)
            if suggestions:
                yield _sse({"type": "suggestions", "items": suggestions})
            _finish_run(db, run.id, status="chat", question=question, answer=answer_text)
            yield _sse({"type": "done"})
    except Exception as exc:
        if run_id is not None:
            try:
                with session_factory() as db:
                    _finish_run(db, run_id, status="chat_failed", question=question, answer="".join(answer_parts))
            except Exception:
                pass
        yield _sse({"type": "error", "message": str(exc)})
        yield _sse({"type": "done"})
