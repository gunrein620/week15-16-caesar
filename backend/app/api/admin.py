from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.dependencies import require_admin
from app.models import User
from app.schemas import (
    InfraCostSettings,
    InfraCostSettingsUpdate,
    SignupSettingsRead,
    SignupSettingsUpdate,
    SyncSettings,
    SyncSettingsUpdate,
)
from app.services.app_settings import (
    get_public_signup_enabled,
    get_sync_settings,
    set_public_signup_enabled,
    set_sync_settings,
)
from app.services.infra_budget import get_infra_cost_snapshot, update_infra_cost_settings

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/settings/signup", response_model=SignupSettingsRead)
def get_signup_settings(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> SignupSettingsRead:
    return SignupSettingsRead(public_signup_enabled=get_public_signup_enabled(db))


@router.put("/settings/signup", response_model=SignupSettingsRead)
def update_signup_settings(
    payload: SignupSettingsUpdate,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> SignupSettingsRead:
    enabled = set_public_signup_enabled(db, payload.public_signup_enabled)
    db.commit()
    return SignupSettingsRead(public_signup_enabled=enabled)


@router.get("/settings/infra-cost", response_model=InfraCostSettings)
def get_infra_cost_settings(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    return get_infra_cost_snapshot(db)


@router.put("/settings/infra-cost", response_model=InfraCostSettings)
def update_infra_cost_settings_endpoint(
    payload: InfraCostSettingsUpdate,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    snapshot = update_infra_cost_settings(db, payload.model_dump())
    db.commit()
    return snapshot


@router.get("/settings/sync", response_model=SyncSettings)
def get_live_feed_sync_settings(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    return get_sync_settings(db)


@router.put("/settings/sync", response_model=SyncSettings)
def update_live_feed_sync_settings(
    payload: SyncSettingsUpdate,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    settings = set_sync_settings(db, payload.model_dump())
    db.commit()
    return settings
