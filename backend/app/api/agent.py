from datetime import UTC, datetime
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
from app.models import AgentRun, Artist, Briefing, Post, User
from app.schemas import AgentRunRead, BriefingPreviewResponse, PostRead
from app.services.mcp_client import McpToolClient
from app.services.rag import refresh_post_chunks, search_chunks

router = APIRouter(tags=["agent"])


class BriefingState(TypedDict):
    db: Any
    artist_id: int
    refresh: bool
    markdown: str


def _render_briefing_markdown(db: Session, artist_id: int, refresh: bool) -> str:
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    mcp = McpToolClient(db)
    if refresh:
        sync_result = mcp.call_tool("youtube_sync_if_stale", {"artist_id": artist_id})
        if sync_result.get("status_code") == 409:
            mcp.call_tool("youtube_get_cached", {"artist_id": artist_id})
    cached = mcp.call_tool("youtube_get_cached", {"artist_id": artist_id})
    news = mcp.call_tool("naver_news_search", {"query": artist.name, "display": 3})
    chunks = search_chunks(db, f"{artist.name} 최근 반응", artist_id, limit=3)
    lines = [f"# {artist.name} 활동 브리핑", ""]
    lines.append("## 팬 커뮤니티 반응")
    if chunks:
        lines.extend([f"- {chunk.content}" for chunk in chunks])
    else:
        lines.append("- 아직 게시판 반응 데이터가 충분하지 않습니다.")
    lines.append("")
    lines.append("## YouTube 캐시")
    videos = cached.get("videos", [])
    if videos:
        lines.extend([f"- [{video['title']}]({video['url']})" for video in videos[:5]])
    else:
        lines.append("- 아직 동기화된 영상이 없습니다.")
    lines.append("")
    lines.append("## Naver 검색")
    if "items" in news:
        lines.extend([f"- {item.get('title', '').replace('<b>', '').replace('</b>', '')}" for item in news["items"][:3]])
    else:
        lines.append("- Naver API 키가 없어 검색을 건너뜁니다.")
    return "\n".join(lines)


def _briefing_markdown(db: Session, artist_id: int, refresh: bool) -> str:
    graph = StateGraph(BriefingState)

    def render_node(state: BriefingState) -> dict[str, str]:
        return {
            "markdown": _render_briefing_markdown(
                state["db"],
                state["artist_id"],
                state["refresh"],
            )
        }

    graph.add_node("render", render_node)
    graph.add_edge(START, "render")
    graph.add_edge("render", END)
    result = graph.compile().invoke(
        {"db": db, "artist_id": artist_id, "refresh": refresh, "markdown": ""}
    )
    return result["markdown"]


@router.post("/ai/briefing/preview", response_model=BriefingPreviewResponse)
@limiter.limit("10/day")
def preview_briefing(
    request: Request,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    artist_id: int = 1,
    refresh: bool = Query(default=False),
    briefing_type: str = "daily",
) -> BriefingPreviewResponse:
    today = datetime.now(UTC).date()
    markdown = _briefing_markdown(db, artist_id, refresh)
    run = AgentRun(
        artist_id=artist_id,
        user_id=user.id,
        status="previewed",
        briefing_type=briefing_type,
        briefing_date=today,
        preview_markdown=markdown,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return BriefingPreviewResponse(
        run_id=run.id,
        preview_markdown=run.preview_markdown,
        briefing_date=run.briefing_date,
        briefing_type=run.briefing_type,
    )


@router.post("/ai/briefing/{run_id}/publish", response_model=PostRead)
@limiter.limit("10/day")
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
    artist = db.get(Artist, run.artist_id)
    title = f"{artist.name if artist else 'Artist'} {run.briefing_date} 브리핑"
    post = Post(title=title, content=run.preview_markdown, author_id=user.id, artist_id=run.artist_id)
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
) -> AgentRun:
    run = db.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run
