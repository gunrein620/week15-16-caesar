from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies import get_current_user
from app.models import User
from app.schemas import AuthLogin, AuthSignup, AuthToken, SignupSettingsRead, UserRead
from app.services.app_settings import get_public_signup_enabled
from app.services.auth_lockout import (
    assert_login_allowed,
    clear_login_failures,
    record_login_failure,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthToken, status_code=status.HTTP_201_CREATED)
def signup(payload: AuthSignup, db: Annotated[Session, Depends(get_db)]) -> AuthToken:
    if not get_public_signup_enabled(db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Public signup is closed")
    exists = db.scalar(select(User).where(User.email == payload.email))
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    user = User(
        email=payload.email,
        display_name=payload.display_name,
        hashed_password=hash_password(payload.password),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthToken(access_token=create_access_token(user.id), user=UserRead.model_validate(user))


@router.get("/signup-status", response_model=SignupSettingsRead)
def signup_status(db: Annotated[Session, Depends(get_db)]) -> SignupSettingsRead:
    return SignupSettingsRead(public_signup_enabled=get_public_signup_enabled(db))


@router.post("/login", response_model=AuthToken)
def login(
    payload: AuthLogin,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> AuthToken:
    ip_address = request.client.host if request.client else None
    assert_login_allowed(db, payload.email, ip_address)
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        record_login_failure(db, payload.email, ip_address)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    clear_login_failures(db, payload.email, ip_address)
    return AuthToken(access_token=create_access_token(user.id), user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user
