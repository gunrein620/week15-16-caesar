from datetime import timedelta
from uuid import uuid4

from fastapi import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import ensure_aware, new_secret_token, token_hash, utc_now
from app.models import User, UserSession

REFRESH_COOKIE_NAME = "refresh_token"


def _cookie_secure() -> bool:
    return get_settings().environment in {"production", "preview"}


def _cookie_samesite() -> str:
    if _cookie_secure():
        return "none"
    return "lax"


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        httponly=True,
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),
        max_age=get_settings().refresh_token_expire_days * 24 * 60 * 60,
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        httponly=True,
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),
        path="/",
    )


def create_user_session(db: Session, user: User, provider: str = "password") -> tuple[UserSession, str]:
    raw = new_secret_token()
    session = UserSession(
        user_id=user.id,
        refresh_token_hash=token_hash(raw),
        jti=uuid4().hex,
        provider=provider,
        expires_at=utc_now() + timedelta(days=get_settings().refresh_token_expire_days),
        last_used_at=utc_now(),
    )
    db.add(session)
    return session, raw


def find_active_session(db: Session, refresh_token: str) -> UserSession | None:
    session = db.scalar(
        select(UserSession).where(UserSession.refresh_token_hash == token_hash(refresh_token))
    )
    if session is None or session.revoked_at is not None:
        return None
    if ensure_aware(session.expires_at) <= utc_now():
        session.revoked_at = utc_now()
        return None
    if session.user_id is None:
        session.revoked_at = utc_now()
        return None
    return session


def touch_session(db: Session, session: UserSession) -> tuple[UserSession, str]:
    raw = new_secret_token()
    session.refresh_token_hash = token_hash(raw)
    session.jti = uuid4().hex
    session.last_used_at = utc_now()
    db.add(session)
    return session, raw


def revoke_session(session: UserSession) -> None:
    if session.revoked_at is None:
        session.revoked_at = utc_now()


def revoke_user_sessions(db: Session, user_id: int) -> int:
    sessions = db.scalars(
        select(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
    ).all()
    for session in sessions:
        revoke_session(session)
    return len(sessions)
