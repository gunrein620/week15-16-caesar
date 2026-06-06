from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.dependencies import require_admin
from app.models import Artist, ArtistKeyword, Member, User, YoutubeSource, YoutubeVideo, YoutubeVideoSource
from app.schemas import ArtistRead, YoutubeSourceCreate, YoutubeSourceRead, YoutubeVideoRead
from app.services.youtube import sync_artist_videos

router = APIRouter(tags=["artists"])


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
def sync_videos(
    artist_id: int,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, int]:
    if db.get(Artist, artist_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
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
    if payload.source_type not in {"official_channel", "fan_channel", "curated_video"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid source_type")
    if db.get(Artist, artist_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    source = YoutubeSource(
        artist_id=artist_id,
        source_type=payload.source_type,
        source_value=payload.source_value,
        title=payload.title,
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
    if payload.source_type not in {"official_channel", "fan_channel", "curated_video"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid source_type")
    source.source_type = payload.source_type
    source.source_value = payload.source_value
    source.title = payload.title
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


@router.get("/artists/{artist_id}/keywords")
def list_keywords(artist_id: int, db: Annotated[Session, Depends(get_db)]) -> list[str]:
    return [
        item.keyword
        for item in db.scalars(select(ArtistKeyword).where(ArtistKeyword.artist_id == artist_id)).all()
    ]


@router.post("/artists/{artist_id}/keywords", status_code=status.HTTP_201_CREATED)
def add_keyword(
    artist_id: int,
    keyword: str,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    if db.get(Artist, artist_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    db.add(ArtistKeyword(artist_id=artist_id, keyword=keyword))
    db.commit()
    return {"keyword": keyword}


@router.get("/artists/{artist_id}/members")
def list_members(artist_id: int, db: Annotated[Session, Depends(get_db)]) -> list[dict[str, str]]:
    return [
        {"name": item.name, "position": item.position}
        for item in db.scalars(select(Member).where(Member.artist_id == artist_id)).all()
    ]
