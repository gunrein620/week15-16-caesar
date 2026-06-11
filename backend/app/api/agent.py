from datetime import UTC, datetime, timedelta
from html import unescape
import re
from typing import Annotated, Any, TypedDict

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from langgraph.graph import END, START, StateGraph
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.posts import _post_read, _post_query
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.dependencies import require_admin
from app.models import AgentRun, Artist, Briefing, McpCallLog, Post, User, YoutubeSource
from app.schemas import AgentRunRead, BriefingPreviewResponse, PostRead
from app.services.mcp_client import McpToolClient
from app.services.quota import ai_rate_limit_cost, consume_ai_quota
from app.services.rag import refresh_post_chunks
from app.services.rag_context import build_rag_context, dedupe_sources
from app.services.updates import get_artist_updates

router = APIRouter(tags=["agent"])
HTML_RE = re.compile(r"<[^>]+>")


class BriefingState(TypedDict):
    db: Any
    artist_id: int
    refresh: bool
    agent_run_id: int | None
    markdown: str


def _youtube_sources_are_stale(
    db: Session, artist_id: int, max_age_seconds: int = 300
) -> bool:
    sources = db.scalars(
        select(YoutubeSource).where(
            YoutubeSource.artist_id == artist_id,
            YoutubeSource.enabled.is_(True),
        )
    ).all()
    if not sources:
        return False
    now = datetime.now(UTC)
    max_age = timedelta(seconds=max_age_seconds)
    for source in sources:
        if source.last_synced_at is None:
            return True
        synced_at = source.last_synced_at
        if synced_at.tzinfo is None:
            synced_at = synced_at.replace(tzinfo=UTC)
        if now - synced_at > max_age:
            return True
    return False


def _clean_external_text(value: str | None) -> str:
    return HTML_RE.sub("", unescape(value or "")).replace("\n", " ").strip()


def _clip(value: str, max_length: int = 180) -> str:
    normalized = " ".join(value.split())
    if len(normalized) <= max_length:
        return normalized
    return f"{normalized[:max_length].rstrip()}..."


def _briefing_feed_sections(db: Session, artist_id: int) -> tuple[list[Any], list[Any], list[Any]]:
    videos = get_artist_updates(db, artist_id, source="youtube", limit=5).items
    fan_posts = get_artist_updates(db, artist_id, source="post", limit=3).items
    naver_items = get_artist_updates(db, artist_id, source="naver", limit=3).items
    return videos, fan_posts, naver_items


def _source_card_from_update(item: Any) -> dict[str, Any]:
    return {
        "type": "source_card",
        "item_type": item.item_type,
        "title": item.title,
        "description": _clip(item.description, 140),
        "url": item.url,
        "thumbnail_url": item.thumbnail_url,
        "source_label": item.source_label,
        "published_at": item.published_at.isoformat(),
    }


def _display_description_from_rag_source(source: dict[str, Any]) -> str:
    description = _clean_external_text(source.get("description"))
    if description:
        return _clip(description, 140)

    raw_content = source.get("content") or ""
    lines = [_clean_external_text(line) for line in raw_content.splitlines()]
    for line in lines:
        key, separator, value = line.partition(":")
        if separator and key.strip().lower() == "description" and value.strip():
            return _clip(value.strip(), 140)

    visible_lines = [
        line
        for line in lines
        if line and not re.match(r"^(title|channel|published_at|views|members|keywords|description):", line, re.I)
    ]
    return _clip(" ".join(visible_lines), 140)


def _source_card_from_rag_source(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "source_card",
        "item_type": source.get("source_type") or "post",
        "title": source.get("title") or "",
        "description": _display_description_from_rag_source(source),
        "url": source.get("url") or "",
        "thumbnail_url": source.get("thumbnail_url") or "",
        "source_label": source.get("source_label") or source.get("channel_title") or "",
        "published_at": source.get("published_at") or datetime.now(UTC).isoformat(),
    }


def _briefing_context_query(items: list[Any]) -> str:
    return " ".join(
        " ".join([getattr(item, "title", ""), getattr(item, "description", "")])
        for item in items
    )


def _render_briefing_markdown(
    db: Session, artist_id: int, refresh: bool, agent_run_id: int | None = None
) -> str:
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    mcp = McpToolClient(db, agent_run_id=agent_run_id)
    sync_max_age_seconds = 300
    if refresh or _youtube_sources_are_stale(db, artist_id, sync_max_age_seconds):
        sync_result = mcp.call_tool(
            "youtube_sync_if_stale",
            {"artist_id": artist_id, "max_age_seconds": sync_max_age_seconds},
        )
        if sync_result.get("status_code") == 409:
            mcp.call_tool("youtube_get_cached", {"artist_id": artist_id})
    mcp.call_tool("youtube_get_cached", {"artist_id": artist_id})
    mcp.call_tool("naver_news_search", {"query": artist.name, "display": 3})
    videos, fan_posts, naver_items = _briefing_feed_sections(db, artist_id)
    context = build_rag_context(
        db,
        artist_id=artist_id,
        query=_briefing_context_query([*videos[:5], *fan_posts[:3], *naver_items[:3]]),
        mode="briefing",
        limit=3,
    )
    lines = [
        f"{artist.name} 오늘의 요약",
        f"기준일: {datetime.now(UTC).date().isoformat()}",
        "",
        "핵심 요약",
        f"- 최근 영상 {len(videos[:5])}개, Naver 소식 {len(naver_items[:3])}개, 팬 게시글 {len(fan_posts[:3])}개를 확인했습니다.",
        "- 자세히 볼 만한 링크를 아래에 모았습니다.",
        "",
        "최근 영상",
    ]
    if videos:
        for index, video in enumerate(videos[:5], start=1):
            title = _clip(_clean_external_text(video.title), 90)
            lines.append(f"{index}. {title}")
            if video.url:
                lines.append(f"   링크: {video.url}")
    else:
        lines.append("- 아직 동기화된 영상이 없습니다.")
    lines.append("")
    lines.append("팬 게시글")
    if fan_posts:
        for index, post in enumerate(fan_posts[:3], start=1):
            title = _clip(_clean_external_text(post.title), 90)
            lines.append(f"{index}. {title}")
            if post.url:
                lines.append(f"   링크: {post.url}")
    else:
        lines.append("- 아직 최근 팬 게시글이 충분하지 않습니다.")
    lines.append("")
    lines.append("Naver 소식")
    if naver_items:
        for index, item in enumerate(naver_items[:3], start=1):
            title = _clip(_clean_external_text(item.title), 90)
            lines.append(f"{index}. {title}")
            if item.url:
                lines.append(f"   링크: {item.url}")
    else:
        lines.append("- 아직 동기화된 Naver 소식이 없습니다.")
    lines.append("")
    lines.append("과거 맥락")
    if context.sources:
        for index, source in enumerate(context.sources[:3], start=1):
            title = _clip(_clean_external_text(source.get("title")), 90)
            lines.append(f"{index}. {title}")
            if source.get("url"):
                lines.append(f"   링크: {source['url']}")
    else:
        lines.append("- 연결할 만한 과거 아카이브 자료를 아직 찾지 못했습니다.")
    return "\n".join(lines)


def _briefing_markdown(
    db: Session, artist_id: int, refresh: bool, agent_run_id: int | None = None
) -> str:
    graph = StateGraph(BriefingState)

    def render_node(state: BriefingState) -> dict[str, str]:
        return {
            "markdown": _render_briefing_markdown(
                state["db"],
                state["artist_id"],
                state["refresh"],
                state["agent_run_id"],
            )
        }

    graph.add_node("render", render_node)
    graph.add_edge(START, "render")
    graph.add_edge("render", END)
    result = graph.compile().invoke(
        {
            "db": db,
            "artist_id": artist_id,
            "refresh": refresh,
            "agent_run_id": agent_run_id,
            "markdown": "",
        }
    )
    return result["markdown"]


def _briefing_source_cards(db: Session, artist_id: int, limit: int = 12) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    videos, fan_posts, naver_items = _briefing_feed_sections(db, artist_id)
    context = build_rag_context(
        db,
        artist_id=artist_id,
        query=_briefing_context_query([*videos[:5], *fan_posts[:3], *naver_items[:3]]),
        mode="briefing",
        limit=5,
    )
    for item in [*videos[:5], *fan_posts[:3], *naver_items[:3]]:
        cards.append(_source_card_from_update(item))
    cards.extend(_source_card_from_rag_source(source) for source in context.sources)
    deduped = dedupe_sources(
        [
            {
                **card,
                "source_type": card.get("item_type"),
                "post_id": None,
                "youtube_video_id": None,
                "content": card.get("description", ""),
            }
            for card in cards
        ]
    )
    return [
        {
            "type": card.get("type", "source_card"),
            "item_type": card.get("item_type") or card.get("source_type"),
            "title": card.get("title", ""),
            "description": card.get("description", ""),
            "url": card.get("url", ""),
            "thumbnail_url": card.get("thumbnail_url", ""),
            "source_label": card.get("source_label", ""),
            "published_at": card.get("published_at", datetime.now(UTC).isoformat()),
        }
        for card in deduped[:limit]
    ]


@router.post("/ai/briefing/preview", response_model=BriefingPreviewResponse)
@limiter.limit("10/day", cost=ai_rate_limit_cost)
def preview_briefing(
    request: Request,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    artist_id: int = 1,
    refresh: bool = Query(default=False),
    briefing_type: str = "daily",
) -> BriefingPreviewResponse:
    consume_ai_quota(db, user, "briefing_preview")
    today = datetime.now(UTC).date()
    run = AgentRun(
        artist_id=artist_id,
        user_id=user.id,
        status="previewed",
        briefing_type=briefing_type,
        briefing_date=today,
        preview_markdown="",
    )
    db.add(run)
    db.flush()
    run.preview_markdown = _briefing_markdown(db, artist_id, refresh, run.id)
    db.commit()
    db.refresh(run)
    return BriefingPreviewResponse(
        run_id=run.id,
        preview_markdown=run.preview_markdown,
        briefing_date=run.briefing_date,
        briefing_type=run.briefing_type,
        source_cards=_briefing_source_cards(db, artist_id),
    )


@router.post("/ai/briefing/{run_id}/publish", response_model=PostRead)
@limiter.limit("10/day", cost=ai_rate_limit_cost)
def publish_briefing(
    request: Request,
    run_id: int,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> PostRead:
    run = db.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    exists = db.scalar(
        select(Briefing).where(
            Briefing.artist_id == run.artist_id,
            Briefing.briefing_date == run.briefing_date,
            Briefing.briefing_type == run.briefing_type,
        )
    )
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Briefing already published")
    consume_ai_quota(db, user, "briefing_publish")
    artist = db.get(Artist, run.artist_id)
    title = f"{artist.name if artist else 'Artist'} {run.briefing_date} 브리핑"
    source_cards = _briefing_source_cards(db, run.artist_id)
    post = Post(
        category="브리핑",
        title=title,
        content=run.preview_markdown,
        thumbnail_url=source_cards[0]["thumbnail_url"] if source_cards else "",
        embeds=source_cards,
        author_id=user.id,
        artist_id=run.artist_id,
    )
    db.add(post)
    db.flush()
    refresh_post_chunks(db, post)
    db.add(
        Briefing(
            artist_id=run.artist_id,
            run_id=run.id,
            post_id=post.id,
            briefing_date=run.briefing_date,
            briefing_type=run.briefing_type,
        )
    )
    run.status = "published"
    run.created_post_id = post.id
    run.published_at = datetime.now(UTC)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Briefing already published"
        ) from None
    post = db.scalars(_post_query().where(Post.id == post.id)).unique().one()
    return _post_read(post)


@router.get("/agent-runs/{run_id}", response_model=AgentRunRead)
def get_agent_run(
    run_id: int,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> AgentRunRead:
    run = db.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    tool_calls = db.scalars(
        select(McpCallLog).where(McpCallLog.agent_run_id == run.id).order_by(McpCallLog.id.asc())
    ).all()
    return AgentRunRead(
        id=run.id,
        artist_id=run.artist_id,
        user_id=run.user_id,
        status=run.status,
        briefing_type=run.briefing_type,
        briefing_date=run.briefing_date,
        preview_markdown=run.preview_markdown,
        created_post_id=run.created_post_id,
        tool_calls=[
            {
                "id": call.id,
                "tool_name": call.tool_name,
                "input_json": call.input_json,
                "output_json": call.output_json,
            }
            for call in tool_calls
        ],
    )
