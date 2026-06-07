from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.dependencies import get_current_user
from app.models import SavedItem, User
from app.schemas import SavedItemCreate, SavedItemRead

router = APIRouter(tags=["saved-items"])


def _item_key(payload: SavedItemCreate) -> str:
    key = (payload.item_id or payload.url or "").strip()
    if not key:
        raise HTTPException(status_code=422, detail="item_id or url is required")
    return key[:500]


@router.post("/saved-items", response_model=SavedItemRead, status_code=status.HTTP_201_CREATED)
def save_item(
    payload: SavedItemCreate,
    response: Response,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SavedItem:
    item_type = payload.item_type.strip()
    item_key = _item_key(payload)
    existing = db.scalar(
        select(SavedItem).where(
            SavedItem.user_id == user.id,
            SavedItem.item_type == item_type,
            SavedItem.item_key == item_key,
        )
    )
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return existing
    item = SavedItem(
        user_id=user.id,
        item_type=item_type,
        item_key=item_key,
        title=payload.title.strip(),
        url=(payload.url or "").strip(),
        thumbnail_url=payload.thumbnail_url.strip(),
        source_label=payload.source_label.strip(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/saved-items", response_model=list[SavedItemRead])
def list_saved_items(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[SavedItem]:
    return db.scalars(
        select(SavedItem)
        .where(SavedItem.user_id == user.id)
        .order_by(SavedItem.saved_at.desc(), SavedItem.id.desc())
    ).all()


@router.delete("/saved-items/{saved_item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_item(
    saved_item_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    item = db.get(SavedItem, saved_item_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved item not found")
    db.delete(item)
    db.commit()
