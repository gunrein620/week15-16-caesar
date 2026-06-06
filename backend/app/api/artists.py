from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rate_limit import limiter
from app.dependencies import require_admin
from app.models import Artist, ArtistKeyword, Member, User, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.schemas import (
    ArtistKeywordCreate,
    ArtistKeywordRead,
    ArtistRead,
    MemberCreate,
    MemberRead,
    YoutubeSourceCreate,
    YoutubeSourceRead,
    YoutubeVideoRead,
)
from app.services.quota import consume_ai_quota
from app.services.youtube import sync_artist_videos

router = APIRouter(tags=["artists"])
YOUTUBE_SOURCE_TYPES = {"official_channel", "fan_channel", "curated_video"}


def _validated_source_payload(payload: YoutubeSourceCreate) -> tuple[str, str, str]:
    source_type = payload.source_type.strip()
    source_value = payload.source_value.strip()
    title = payload.title.strip()
    if source_type not in YOUTUBE_SOURCE_TYPES:
        raise HTTPException(status_code=422, detail="Invalid source_type")
    if not source_value:
        raise HTTPException(status_code=422, detail="source_value is required")
    if not title:
        raise HTTPException(status_code=422, detail="title is required")
    return source_type, source_value, title


@router.get("/artists", response_model=list[ArtistRead])
def list_artists(db: Annotated[Session, Depends(get_db)]) -> list[Artist]:
    return db.scalars(select(Artist).order_by(Artist.name.asc())).all()


@router.get("/artists/{artist_id}/videos", response_model=list[YoutubeVideoRead])
def list_videos(artist_id: int, db: Annotated[Session, Depends(get_db)]) -> list[YoutubeVideo]:
    if db.get(Artist, artist_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    return db.scalars(
        select(YoutubeVideo)
        .join(YoutubeVideoSource)
        .join(YoutubeSource)
        .where(YoutubeSource.artist_id == artist_id)
        .order_by(YoutubeVideo.published_at.desc().nullslast())
    ).all()


@router.post("/artists/{artist_id}/sync")
@limiter.limit("10/day")
def sync_videos(
    request: Request,
    artist_id: int,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, int]:
    if db.get(Artist, artist_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    consume_ai_quota(db, user, "youtube_sync")
    return sync_artist_videos(db, artist_id)


@router.get("/artists/{artist_id}/youtube-sources", response_model=list[YoutubeSourceRead])
def list_sources(artist_id: int, db: Annotated[Session, Depends(get_db)]) -> list[YoutubeSource]:
    return db.scalars(select(YoutubeSource).where(YoutubeSource.artist_id == artist_id)).all()


@router.post(
    "/artists/{artist_id}/youtube-sources",
    response_model=YoutubeSourceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_source(
    artist_id: int,
    payload: YoutubeSourceCreate,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> YoutubeSource:
    source_type, source_value, title = _validated_source_payload(payload)
    if db.get(Artist, artist_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    source = YoutubeSource(
        artist_id=artist_id,
        source_type=source_type,
        source_value=source_value,
        title=title,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.put("/youtube-sources/{source_id}", response_model=YoutubeSourceRead)
def update_source(
    source_id: int,
    payload: YoutubeSourceCreate,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> YoutubeSource:
    source = db.get(YoutubeSource, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    source_type, source_value, title = _validated_source_payload(payload)
    source.source_type = source_type
    source.source_value = source_value
    source.title = title
    db.commit()
    db.refresh(source)
    return source


@router.delete("/youtube-sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(
    source_id: int,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    source = db.get(YoutubeSource, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    db.delete(source)
    db.commit()


def _require_artist(db: Session, artist_id: int) -> Artist:
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    return artist


@router.get("/artists/{artist_id}/keywords", response_model=list[ArtistKeywordRead])
def list_keywords(artist_id: int, db: Annotated[Session, Depends(get_db)]) -> list[ArtistKeyword]:
    _require_artist(db, artist_id)
    return db.scalars(
        select(ArtistKeyword)
        .where(ArtistKeyword.artist_id == artist_id)
        .order_by(ArtistKeyword.keyword.asc())
    ).all()


@router.post(
    "/artists/{artist_id}/keywords",
    response_model=ArtistKeywordRead,
    status_code=status.HTTP_201_CREATED,
)
def add_keyword(
    artist_id: int,
    payload: ArtistKeywordCreate,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> ArtistKeywordRead:
    _require_artist(db, artist_id)
    keyword = payload.keyword.strip()
    if not keyword:
        raise HTTPException(status_code=422, detail="keyword is required")
    existing = db.scalar(
        select(ArtistKeyword).where(
            ArtistKeyword.artist_id == artist_id,
            ArtistKeyword.keyword == keyword,
        )
    )
    if existing is not None:
        return ArtistKeywordRead.model_validate(existing)
    item = ArtistKeyword(artist_id=artist_id, keyword=keyword)
    db.add(item)
    db.commit()
    db.refresh(item)
    return ArtistKeywordRead.model_validate(item)


@router.get("/artists/{artist_id}/members", response_model=list[MemberRead])
def list_members(artist_id: int, db: Annotated[Session, Depends(get_db)]) -> list[Member]:
    _require_artist(db, artist_id)
    return db.scalars(
        select(Member).where(Member.artist_id == artist_id).order_by(Member.id.asc())
    ).all()


@router.post(
    "/artists/{artist_id}/members",
    response_model=MemberRead,
    status_code=status.HTTP_201_CREATED,
)
def add_member(
    artist_id: int,
    payload: MemberCreate,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> Member:
    _require_artist(db, artist_id)
    name = payload.name.strip()
    position = payload.position.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    existing = db.scalar(select(Member).where(Member.artist_id == artist_id, Member.name == name))
    if existing is not None:
        existing.position = position
        db.commit()
        db.refresh(existing)
        return existing
    member = Member(artist_id=artist_id, name=name, position=position)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member
