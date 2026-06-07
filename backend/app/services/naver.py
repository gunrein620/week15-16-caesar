from typing import Literal

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings


def _naver_search(kind: Literal["news", "blog"], query: str, display: int = 5) -> list[dict]:
    settings = get_settings()
    if not settings.naver_client_id or not settings.naver_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Naver credentials are not configured",
        )
    headers = {
        "X-Naver-Client-Id": settings.naver_client_id,
        "X-Naver-Client-Secret": settings.naver_client_secret,
    }
    with httpx.Client(timeout=15) as client:
        response = client.get(
            f"https://openapi.naver.com/v1/search/{kind}.json",
            params={"query": query, "display": display, "sort": "date"},
            headers=headers,
        )
    response.raise_for_status()
    return response.json().get("items", [])


def naver_news_search(query: str, display: int = 5) -> list[dict]:
    return _naver_search("news", query, display)


def naver_blog_search(query: str, display: int = 5) -> list[dict]:
    return _naver_search("blog", query, display)
