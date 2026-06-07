import httpx

from app.services.link_preview import resolve_page_thumbnail


def test_resolve_page_thumbnail_reads_open_graph_image(monkeypatch):
    resolve_page_thumbnail.cache_clear()

    class FakeResponse:
        url = "https://news.example.com/article"
        headers = {"content-type": "text/html; charset=utf-8"}
        text = """
        <html>
          <head><meta property="og:image" content="/thumb.jpg"></head>
        </html>
        """

        def raise_for_status(self):
            return None

    def fake_get(url, follow_redirects, headers, timeout):
        return FakeResponse()

    monkeypatch.setattr("app.services.link_preview.httpx.get", fake_get)

    assert resolve_page_thumbnail("https://news.example.com/article") == "https://news.example.com/thumb.jpg"


def test_resolve_page_thumbnail_returns_blank_on_http_error(monkeypatch):
    resolve_page_thumbnail.cache_clear()

    def fake_get(url, follow_redirects, headers, timeout):
        raise httpx.ConnectError("network")

    monkeypatch.setattr("app.services.link_preview.httpx.get", fake_get)

    assert resolve_page_thumbnail("https://news.example.com/article") == ""
