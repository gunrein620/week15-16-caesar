from dataclasses import dataclass
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import SavedItem, User
from app.services.rag import _chunk_source_payload, search_chunks


MIN_CONTEXT_QUERY_LENGTH = 8


@dataclass(frozen=True)
class RagContextResult:
    summary: str
    sources: list[dict]
    insert_text: str = ""


def _source_key(source: dict) -> tuple[str, str]:
    if source.get("youtube_video_id"):
        return ("youtube", str(source["youtube_video_id"]))
    if source.get("post_id"):
        return ("post", str(source["post_id"]))
    if source.get("external_update_id"):
        return ("external", str(source["external_update_id"]))
    return (str(source.get("source_type") or ""), str(source.get("url") or source.get("title") or ""))


def dedupe_sources(sources: list[dict]) -> list[dict]:
    deduped: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for source in sources:
        key = _source_key(source)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(source)
    return deduped


def build_insert_text(source: dict | None) -> str:
    if not source:
        return ""
    title = (source.get("title") or "").strip()
    url = (source.get("url") or "").strip()
    if not title or not url:
        return ""
    return f"\n\n참고자료: {title}\n{url}"


def _summary_for(mode: str, query: str, sources: list[dict]) -> str:
    if not sources:
        if mode == "writing_assist":
            return "관련 자료를 아직 찾지 못했습니다. 제목이나 본문에 멤버명, 곡명, 활동명을 더 구체적으로 넣어보세요."
        if mode == "saved_summary":
            return "저장한 자료와 연결되는 아카이브 자료를 아직 찾지 못했습니다."
        return "과거 아카이브에서 연결할 만한 맥락을 아직 찾지 못했습니다."
    titles = ", ".join(source["title"] for source in sources[:3] if source.get("title"))
    if mode == "writing_assist":
        return f"작성 중인 글과 연결할 만한 자료 {len(sources)}개를 찾았습니다: {titles}"
    if mode == "saved_summary":
        return f"저장한 자료를 기준으로 관련 아카이브 {len(sources)}개를 찾았습니다: {titles}"
    return f"오늘 자료와 이어지는 과거 맥락 {len(sources)}개를 찾았습니다: {titles}"


def _response_message_content(response: object) -> str:
    choices = response.get("choices", []) if isinstance(response, dict) else getattr(response, "choices", [])
    if not choices:
        return ""
    choice = choices[0]
    message = choice.get("message", {}) if isinstance(choice, dict) else getattr(choice, "message", {})
    content = message.get("content", "") if isinstance(message, dict) else getattr(message, "content", "")
    return content or ""


def _llm_context_summary(mode: str, query: str, sources: list[dict]) -> str | None:
    settings = get_settings()
    if not settings.openai_api_key:
        return None

    instructions = {
        "writing_assist": "작성 중인 글과 연결되는 자료들을 1~2문장 한국어로 소개하세요.",
        "saved_summary": "저장한 자료들의 공통 주제를 1~2문장으로 요약하세요.",
    }
    instruction = instructions.get(mode, "자료들이 보여주는 과거 맥락을 1~2문장으로 요약하세요.")
    payload = {
        "mode": mode,
        "query": query,
        "sources": [
            {
                "title": source.get("title") or "",
                "source_type": source.get("source_type") or "",
            }
            for source in sources[:5]
        ],
    }
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.rerank_model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": f"{instruction} JSON {{\"summary\": \"...\"}}만 반환하세요.",
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
        )
        parsed = json.loads(_response_message_content(response))
    except Exception:
        return None

    if not isinstance(parsed, dict):
        return None
    summary = parsed.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        return None
    return summary.strip()


def build_rag_context(
    db: Session,
    *,
    artist_id: int,
    query: str,
    mode: str,
    limit: int = 5,
) -> RagContextResult:
    normalized = " ".join(query.split())
    if len(normalized) < MIN_CONTEXT_QUERY_LENGTH:
        if mode == "writing_assist":
            return RagContextResult("제목이나 본문을 조금 더 입력하면 관련 자료를 추천합니다.", [])
        return RagContextResult("요약할 기준 자료가 아직 충분하지 않습니다.", [])
    chunks = search_chunks(db, normalized, artist_id=artist_id, limit=limit)
    sources = dedupe_sources([_chunk_source_payload(db, chunk) for chunk in chunks])[:limit]
    summary = _llm_context_summary(mode, normalized, sources) if sources else None
    return RagContextResult(
        summary=summary or _summary_for(mode, normalized, sources),
        sources=sources,
        insert_text=build_insert_text(sources[0] if sources else None) if mode == "writing_assist" else "",
    )


def saved_summary_context(
    db: Session,
    *,
    user: User,
    artist_id: int,
    limit: int = 5,
) -> RagContextResult:
    saved_items = db.scalars(
        select(SavedItem)
        .where(SavedItem.user_id == user.id)
        .order_by(SavedItem.saved_at.desc(), SavedItem.id.desc())
    ).all()
    if not saved_items:
        return RagContextResult("저장한 자료가 아직 없습니다. 먼저 마음에 드는 자료를 저장해 주세요.", [])
    query = " ".join(
        " ".join([item.title, item.source_label, item.url])
        for item in saved_items[:10]
    )
    result = build_rag_context(db, artist_id=artist_id, query=query, mode="saved_summary", limit=limit)
    saved_titles = ", ".join(item.title for item in saved_items[:3])
    return RagContextResult(
        summary=f"저장한 자료 {len(saved_items)}개를 기준으로 정리했습니다: {saved_titles}. {result.summary}",
        sources=result.sources,
        insert_text="",
    )
