import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings


def naver_news_search(query: str, display: int = 5) -> list[dict]:
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
            "https://openapi.naver.com/v1/search/news.json",
            params={"query": query, "display": display, "sort": "date"},
            headers=headers,
        )
    response.raise_for_status()
    return response.json().get("items", [])
