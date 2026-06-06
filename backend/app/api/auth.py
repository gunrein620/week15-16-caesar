from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies import get_current_user
from app.models import User
from app.schemas import AuthLogin, AuthSignup, AuthToken, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthToken, status_code=status.HTTP_201_CREATED)
def signup(payload: AuthSignup, db: Annotated[Session, Depends(get_db)]) -> AuthToken:
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


@router.post("/login", response_model=AuthToken)
def login(payload: AuthLogin, db: Annotated[Session, Depends(get_db)]) -> AuthToken:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return AuthToken(access_token=create_access_token(user.id), user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user
