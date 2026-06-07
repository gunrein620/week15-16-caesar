import re
from urllib.parse import parse_qs, urlparse

from app.services.link_preview import resolve_link_preview

URL_RE = re.compile(r"https?://[^\s<>\]\)\"']+")
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif")


def _clean_url(url: str) -> str:
    return url.rstrip(".,!?;:")


def _youtube_video_id(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower().removeprefix("www.")
    if host == "youtu.be":
        return parsed.path.strip("/").split("/")[0]
    if host.endswith("youtube.com"):
        if parsed.path == "/watch":
            return parse_qs(parsed.query).get("v", [""])[0]
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 2 and parts[0] in {"shorts", "embed", "live"}:
            return parts[1]
    return ""


def _is_image_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    return path.endswith(IMAGE_EXTENSIONS)


def extract_urls(content: str) -> list[str]:
    seen: set[str] = set()
    urls: list[str] = []
    for match in URL_RE.finditer(content):
        url = _clean_url(match.group(0))
        if url and url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def build_post_embeds(content: str) -> tuple[list[dict], str]:
    embeds: list[dict] = []
    thumbnail_url = ""
    for url in extract_urls(content):
        youtube_id = _youtube_video_id(url)
        if youtube_id:
            youtube_thumbnail = f"https://img.youtube.com/vi/{youtube_id}/hqdefault.jpg"
            embeds.append(
                {
                    "type": "youtube",
                    "url": url,
                    "video_id": youtube_id,
                    "title": "",
                    "description": "",
                    "thumbnail_url": youtube_thumbnail,
                    "provider": "YouTube",
                }
            )
            thumbnail_url = thumbnail_url or youtube_thumbnail
            continue

        if _is_image_url(url):
            embeds.append(
                {
                    "type": "image",
                    "url": url,
                    "title": "",
                    "description": "",
                    "thumbnail_url": url,
                    "provider": "Image",
                }
            )
            thumbnail_url = thumbnail_url or url
            continue

        preview = resolve_link_preview(url)
        link_thumbnail = preview.get("thumbnail_url", "")
        embeds.append(
            {
                "type": "link",
                "url": preview.get("url") or url,
                "title": preview.get("title") or urlparse(url).netloc,
                "description": preview.get("description") or "",
                "thumbnail_url": link_thumbnail,
                "provider": urlparse(url).netloc,
            }
        )
        thumbnail_url = thumbnail_url or link_thumbnail
    return embeds, thumbnail_url
