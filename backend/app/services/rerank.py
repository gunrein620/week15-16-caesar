from __future__ import annotations

import json

from app.core.config import get_settings


def rerank_sources(question: str, candidates: list[dict], top_k: int) -> list[int] | None:
    settings = get_settings()
    if not settings.openai_api_key:
        return None

    payload = {
        "question": question,
        "top_k": top_k,
        "candidates": [
            {
                "id": item.get("id"),
                "title": item.get("title", ""),
                "snippet": str(item.get("snippet", ""))[:200],
            }
            for item in candidates
        ],
    }
    system = (
        "한국어 팬 아카이브 질문에 대한 후보 자료의 관련도 순위를 "
        "매기세요. "
        "관련도 내림차순으로 {\"ranking\": [id, ...]} JSON만 반환하세요. "
        "관련 없는 후보는 생략할 수 있습니다."
    )
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.rerank_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
        )
        content = response.choices[0].message.content if response.choices else None
        if not content:
            return None
        parsed = json.loads(content)
    except Exception:
        return None

    if not isinstance(parsed, dict):
        return None
    ranking = parsed.get("ranking")
    if not isinstance(ranking, list):
        return None
    if not all(isinstance(item, int) and not isinstance(item, bool) for item in ranking):
        return None
    return ranking
