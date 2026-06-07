from functools import lru_cache
from html.parser import HTMLParser
from html import unescape
from urllib.parse import urljoin

import httpx


class _PreviewParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.image = ""
        self.title = ""
        self.description = ""
        self._inside_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        if normalized_tag == "title":
            self._inside_title = True
            return
        if normalized_tag not in {"meta", "link"}:
            return
        values = {key.lower(): value or "" for key, value in attrs}
        name = (values.get("property") or values.get("name") or "").lower()
        if normalized_tag == "meta" and name in {"og:title", "twitter:title"} and not self.title:
            self.title = unescape(values.get("content", "")).strip()
        if (
            normalized_tag == "meta"
            and name in {"description", "og:description", "twitter:description"}
            and not self.description
        ):
            self.description = unescape(values.get("content", "")).strip()
        if normalized_tag == "meta" and name in {"og:image", "twitter:image"} and not self.image:
            self.image = unescape(values.get("content", "")).strip()
        if normalized_tag == "link" and values.get("rel", "").lower() == "image_src" and not self.image:
            self.image = unescape(values.get("href", "")).strip()

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._inside_title = False

    def handle_data(self, data: str) -> None:
        if self._inside_title and not self.title:
            self.title = unescape(data).strip()


def resolve_link_preview(url: str) -> dict[str, str]:
    if not url.startswith(("http://", "https://")):
        return {"title": "", "description": "", "thumbnail_url": "", "url": url}
    try:
        response = httpx.get(
            url,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 RESCENE-Board/1.0"},
            timeout=3,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        return {"title": "", "description": "", "thumbnail_url": "", "url": url}
    content_type = response.headers.get("content-type", "")
    if "html" not in content_type:
        return {"title": "", "description": "", "thumbnail_url": "", "url": str(response.url)}
    parser = _PreviewParser()
    parser.feed(response.text[:120_000])
    thumbnail_url = urljoin(str(response.url), parser.image) if parser.image else ""
    return {
        "title": parser.title,
        "description": parser.description,
        "thumbnail_url": thumbnail_url,
        "url": str(response.url),
    }


@lru_cache(maxsize=256)
def resolve_page_thumbnail(url: str) -> str:
    return resolve_link_preview(url).get("thumbnail_url", "")
