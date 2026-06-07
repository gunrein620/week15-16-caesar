from functools import lru_cache
from html.parser import HTMLParser
from html import unescape
from urllib.parse import urljoin

import httpx


class _PreviewParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.image = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.image or tag.lower() not in {"meta", "link"}:
            return
        values = {key.lower(): value or "" for key, value in attrs}
        name = (values.get("property") or values.get("name") or "").lower()
        if tag.lower() == "meta" and name in {"og:image", "twitter:image"}:
            self.image = unescape(values.get("content", "")).strip()
        if tag.lower() == "link" and values.get("rel", "").lower() == "image_src":
            self.image = unescape(values.get("href", "")).strip()


@lru_cache(maxsize=256)
def resolve_page_thumbnail(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        return ""
    try:
        response = httpx.get(
            url,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 RESCENE-Board/1.0"},
            timeout=3,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        return ""
    content_type = response.headers.get("content-type", "")
    if "html" not in content_type:
        return ""
    parser = _PreviewParser()
    parser.feed(response.text[:120_000])
    return urljoin(str(response.url), parser.image) if parser.image else ""
