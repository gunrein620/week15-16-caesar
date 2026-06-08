from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import create_access_token, hash_password, utc_now, verify_password
from app.dependencies import get_current_user
from app.models import AuthIdentity, User, UserSession
from app.schemas import (
    AuthLogin,
    AuthSignup,
    AuthToken,
    EmailVerificationRequest,
    SignupSettingsRead,
    UserRead,
    UserSessionRead,
)
from app.services.app_settings import get_public_signup_enabled
from app.services.auth_sessions import (
    REFRESH_COOKIE_NAME,
    clear_refresh_cookie,
    create_user_session,
    find_active_session,
    revoke_session,
    set_refresh_cookie,
    touch_session,
)
from app.services.auth_lockout import (
    assert_login_allowed,
    clear_login_failures,
    record_login_failure,
)
from app.services.email_verification import (
    create_email_verification_token,
    send_verification_email,
    verify_email_token,
)
from app.services.oauth import exchange_oauth_code, oauth_authorize_url, oauth_redirect_uri

router = APIRouter(prefix="/auth", tags=["auth"])
OAUTH_STATE_COOKIE_PREFIX = "oauth_state_"


def _auth_token_for(response: Response, db: Session, user: User, provider: str = "password") -> AuthToken:
    _, refresh_token = create_user_session(db, user, provider=provider)
    set_refresh_cookie(response, refresh_token)
    return AuthToken(access_token=create_access_token(user.id), user=UserRead.model_validate(user))


@router.post("/signup", response_model=AuthToken, status_code=status.HTTP_201_CREATED)
def signup(
    payload: AuthSignup,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> AuthToken:
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
    token = _auth_token_for(response, db, user)
    db.commit()
    return token


@router.get("/signup-status", response_model=SignupSettingsRead)
def signup_status(db: Annotated[Session, Depends(get_db)]) -> SignupSettingsRead:
    return SignupSettingsRead(public_signup_enabled=get_public_signup_enabled(db))


@router.post("/login", response_model=AuthToken)
def login(
    payload: AuthLogin,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> AuthToken:
    ip_address = request.client.host if request.client else None
    assert_login_allowed(db, payload.email, ip_address)
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        record_login_failure(db, payload.email, ip_address)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    clear_login_failures(db, payload.email, ip_address)
    token = _auth_token_for(response, db, user)
    db.commit()
    return token


@router.post("/refresh", response_model=AuthToken)
def refresh(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> AuthToken:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required")
    session = find_active_session(db, refresh_token)
    if session is None or session.user is None:
        clear_refresh_cookie(response)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    _, next_refresh = touch_session(db, session)
    set_refresh_cookie(response, next_refresh)
    db.commit()
    return AuthToken(access_token=create_access_token(session.user.id), user=UserRead.model_validate(session.user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> None:
    if refresh_token:
        session = find_active_session(db, refresh_token)
        if session is not None:
            revoke_session(session)
    clear_refresh_cookie(response)
    db.commit()


@router.get("/sessions", response_model=list[UserSessionRead])
def sessions(user: Annotated[User, Depends(get_current_user)]) -> list:
    return [session for session in user.sessions if session.revoked_at is None]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    session = db.get(UserSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    revoke_session(session)
    db.commit()


@router.post("/email/verification", status_code=status.HTTP_202_ACCEPTED)
def request_email_verification(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    if user.email_verified_at is not None:
        return {"status": "already_verified"}
    raw_token = create_email_verification_token(db, user)
    send_verification_email(user.email, raw_token)
    db.commit()
    return {"status": "sent"}


@router.post("/email/verify", response_model=UserRead)
def verify_email(
    payload: EmailVerificationRequest,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user = verify_email_token(db, payload.token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token")
    db.commit()
    db.refresh(user)
    return user


@router.get("/oauth/{provider}/start")
def oauth_start(provider: str) -> RedirectResponse:
    state = uuid4().hex
    redirect = RedirectResponse(oauth_authorize_url(provider, state))
    redirect.set_cookie(
        f"{OAUTH_STATE_COOKIE_PREFIX}{provider}",
        state,
        httponly=True,
        secure=get_settings().environment in {"production", "preview"},
        samesite="lax",
        max_age=600,
        path="/auth/oauth",
    )
    return redirect


@router.get("/oauth/{provider}/callback")
def oauth_callback(
    provider: str,
    code: str,
    state: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> RedirectResponse:
    expected_state = request.cookies.get(f"{OAUTH_STATE_COOKIE_PREFIX}{provider}")
    if not expected_state or expected_state != state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")
    profile = exchange_oauth_code(provider, code, oauth_redirect_uri(provider))
    identity = db.scalar(
        select(AuthIdentity).where(
            AuthIdentity.provider == provider,
            AuthIdentity.provider_subject == profile["provider_subject"],
        )
    )
    if identity is not None:
        user = identity.user
    else:
        email = str(profile["email"]).strip().lower()
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                display_name=profile.get("display_name") or email.split("@")[0],
                hashed_password=None,
                role="user",
                email_verified_at=utc_now() if profile.get("email_verified") else None,
            )
            db.add(user)
            db.flush()
        elif user.email_verified_at is None and not profile.get("email_verified"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Verified provider email is required")
        if profile.get("email_verified") and user.email_verified_at is None:
            user.email_verified_at = utc_now()
        db.add(
            AuthIdentity(
                user_id=user.id,
                provider=provider,
                provider_subject=profile["provider_subject"],
                email=email,
            )
        )
    redirect = RedirectResponse(get_settings().frontend_origin)
    _, refresh_token = create_user_session(db, user, provider=provider)
    set_refresh_cookie(redirect, refresh_token)
    redirect.delete_cookie(f"{OAUTH_STATE_COOKIE_PREFIX}{provider}", path="/auth/oauth")
    db.commit()
    return redirect


@router.get("/me", response_model=UserRead)
def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user
