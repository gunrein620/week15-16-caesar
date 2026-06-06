import pytest
from fastapi import HTTPException

from app.core.config import reset_settings_cache
from app.services.naver import naver_news_search


def test_naver_missing_keys_returns_structured_unavailable(monkeypatch):
    monkeypatch.delenv("NAVER_CLIENT_ID", raising=False)
    monkeypatch.delenv("NAVER_CLIENT_SECRET", raising=False)
    reset_settings_cache()

    with pytest.raises(HTTPException) as exc:
        naver_news_search("RESCENE")

    assert exc.value.status_code == 503
    assert "Naver credentials" in exc.value.detail


def test_naver_present_keys_send_required_headers(monkeypatch):
    monkeypatch.setenv("NAVER_CLIENT_ID", "client-id")
    monkeypatch.setenv("NAVER_CLIENT_SECRET", "client-secret")
    reset_settings_cache()
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"items": [{"title": "RESCENE news"}]}

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def get(self, url, params, headers):
            captured["url"] = url
            captured["params"] = params
            captured["headers"] = headers
            return FakeResponse()

    monkeypatch.setattr("app.services.naver.httpx.Client", FakeClient)

    items = naver_news_search("RESCENE", display=3)

    assert items == [{"title": "RESCENE news"}]
    assert captured["url"] == "https://openapi.naver.com/v1/search/news.json"
    assert captured["params"] == {"query": "RESCENE", "display": 3, "sort": "date"}
    assert captured["headers"] == {
        "X-Naver-Client-Id": "client-id",
        "X-Naver-Client-Secret": "client-secret",
    }
