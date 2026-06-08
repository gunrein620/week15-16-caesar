from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import hash_password
from app.dependencies import require_admin
from app.models import (
    AgentRun,
    AiUsageCounter,
    AuthIdentity,
    Briefing,
    Comment,
    McpCallLog,
    Post,
    PostTag,
    RagChunk,
    RagEmbeddingJob,
    SavedItem,
    User,
)
from app.schemas import (
    AdminUserCreate,
    AdminUserUpdate,
    InfraCostSettings,
    InfraCostSettingsUpdate,
    RagCleanupRequest,
    RagCleanupResult,
    RagCoverageRead,
    RagEmbeddingJobCreate,
    RagEmbeddingJobRead,
    RagEmbedYoutubeRequest,
    RagEmbedYoutubeResult,
    SignupSettingsRead,
    SignupSettingsUpdate,
    SyncSettings,
    SyncSettingsUpdate,
    UserRead,
)
from app.services.app_settings import (
    get_public_signup_enabled,
    get_sync_settings,
    set_public_signup_enabled,
    set_sync_settings,
)
from app.services.infra_budget import get_infra_cost_snapshot, update_infra_cost_settings
from app.services.rag_admin import (
    cleanup_rag_chunks,
    create_rag_embedding_job,
    embed_youtube_batch,
    get_rag_coverage,
    latest_rag_embedding_job,
    process_rag_embedding_job_batch,
)

router = APIRouter(prefix="/admin", tags=["admin"])
ADMIN_ROLES = {"user", "admin"}


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _require_role(role: str) -> str:
    if role not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid role")
    return role


def _delete_user_owned_data(db: Session, user_id: int) -> None:
    post_ids = list(db.scalars(select(Post.id).where(Post.author_id == user_id)).all())
    run_ids = list(db.scalars(select(AgentRun.id).where(AgentRun.user_id == user_id)).all())
    if run_ids:
        db.execute(delete(McpCallLog).where(McpCallLog.agent_run_id.in_(run_ids)))
        db.execute(delete(Briefing).where(Briefing.run_id.in_(run_ids)))
        db.execute(delete(AgentRun).where(AgentRun.id.in_(run_ids)))
    if post_ids:
        db.execute(delete(Briefing).where(Briefing.post_id.in_(post_ids)))
        db.execute(delete(RagChunk).where(RagChunk.post_id.in_(post_ids)))
        db.execute(delete(Comment).where(Comment.post_id.in_(post_ids)))
        db.execute(delete(PostTag).where(PostTag.post_id.in_(post_ids)))
        db.execute(delete(Post).where(Post.id.in_(post_ids)))
    db.execute(delete(Comment).where(Comment.author_id == user_id))
    db.execute(delete(SavedItem).where(SavedItem.user_id == user_id))
    db.execute(delete(AuthIdentity).where(AuthIdentity.user_id == user_id))
    db.execute(delete(AiUsageCounter).where(AiUsageCounter.scope == "user", AiUsageCounter.scope_id == str(user_id)))
    db.query(RagEmbeddingJob).filter(RagEmbeddingJob.user_id == user_id).update(
        {RagEmbeddingJob.user_id: None}, synchronize_session=False
    )


def _admin_count(db: Session) -> int:
    return int(db.scalar(select(func.count()).select_from(User).where(User.role == "admin")) or 0)


@router.get("/users", response_model=list[UserRead])
def list_users(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[User]:
    return db.scalars(select(User).order_by(User.id.asc())).all()


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreate,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    email = _normalize_email(str(payload.email))
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    user = User(
        email=email,
        display_name=payload.display_name.strip(),
        hashed_password=hash_password(payload.password),
        role=_require_role(payload.role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if payload.email is not None:
        email = _normalize_email(str(payload.email))
        exists = db.scalar(select(User).where(User.email == email, User.id != user.id))
        if exists is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
        user.email = email
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()
    if payload.password is not None:
        user.hashed_password = hash_password(payload.password)
    if payload.role is not None:
        role = _require_role(payload.role)
        if user.id == admin.id and role != "admin":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot demote yourself")
        if user.role == "admin" and role != "admin" and _admin_count(db) <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one admin is required")
        user.role = role
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")
    if user.role == "admin" and _admin_count(db) <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one admin is required")
    _delete_user_owned_data(db, user.id)
    db.delete(user)
    db.commit()


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


@router.post("/rag/jobs", response_model=RagEmbeddingJobRead, status_code=status.HTTP_201_CREATED)
def create_rag_embedding_job_endpoint(
    payload: RagEmbeddingJobCreate,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> RagEmbeddingJob:
    job = create_rag_embedding_job(
        db,
        artist_id=payload.artist_id,
        user_id=admin.id,
        scope=payload.scope,
        source_type=payload.source_type,
        batch_size=payload.batch_size,
        force=payload.force,
    )
    db.commit()
    db.refresh(job)
    return job


@router.get("/rag/jobs/current", response_model=RagEmbeddingJobRead | None)
def get_current_rag_embedding_job(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    artist_id: int = 1,
) -> RagEmbeddingJob | None:
    return latest_rag_embedding_job(db, artist_id)


@router.get("/rag/jobs/{job_id}", response_model=RagEmbeddingJobRead)
def get_rag_embedding_job(
    job_id: int,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> RagEmbeddingJob:
    job = db.get(RagEmbeddingJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RAG embedding job not found")
    return job


@router.post("/rag/jobs/{job_id}/run", response_model=RagEmbeddingJobRead)
def run_rag_embedding_job_batch(
    job_id: int,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> RagEmbeddingJob:
    job = db.get(RagEmbeddingJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RAG embedding job not found")
    process_rag_embedding_job_batch(db, job)
    db.commit()
    db.refresh(job)
    return job


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
