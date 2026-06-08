from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.dependencies import require_admin
from app.models import User
from app.schemas import (
    InfraCostSettings,
    InfraCostSettingsUpdate,
    RagCleanupRequest,
    RagCleanupResult,
    RagCoverageRead,
    RagEmbedYoutubeRequest,
    RagEmbedYoutubeResult,
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
from app.services.rag_admin import cleanup_rag_chunks, embed_youtube_batch, get_rag_coverage

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


@router.get("/rag/coverage", response_model=RagCoverageRead)
def get_rag_embedding_coverage(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    artist_id: int = 1,
) -> dict:
    return get_rag_coverage(db, artist_id)


@router.post("/rag/cleanup", response_model=RagCleanupResult)
def cleanup_rag_embedding_chunks(
    payload: RagCleanupRequest,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, int]:
    result = cleanup_rag_chunks(db, payload.artist_id)
    db.commit()
    return result


@router.post("/rag/embed-youtube", response_model=RagEmbedYoutubeResult)
def embed_youtube_rag_chunks(
    payload: RagEmbedYoutubeRequest,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, int]:
    result = embed_youtube_batch(
        db,
        payload.artist_id,
        limit=payload.limit,
        days=payload.days,
        source_type=payload.source_type,
        force=payload.force,
    )
    db.commit()
    return result
