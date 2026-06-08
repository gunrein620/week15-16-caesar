from datetime import timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import ensure_aware, new_secret_token, token_hash, utc_now
from app.models import EmailVerificationToken, User


def create_email_verification_token(db: Session, user: User) -> str:
    db.query(EmailVerificationToken).filter(
        EmailVerificationToken.user_id == user.id,
        EmailVerificationToken.used_at.is_(None),
    ).delete()
    raw = new_secret_token()
    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=token_hash(raw),
            expires_at=utc_now() + timedelta(hours=24),
        )
    )
    return raw


def verify_email_token(db: Session, raw_token: str) -> User | None:
    token = db.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_hash(raw_token),
            EmailVerificationToken.used_at.is_(None),
        )
    )
    if token is None or ensure_aware(token.expires_at) <= utc_now():
        return None
    user = db.get(User, token.user_id)
    if user is None:
        return None
    token.used_at = utc_now()
    user.email_verified_at = utc_now()
    return user


def send_verification_email(email: str, token: str) -> None:
    settings = get_settings()
    if not settings.resend_api_key:
        return
    verify_url = f"{settings.frontend_origin.rstrip('/')}/?verify_email={token}"
    httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        json={
            "from": settings.email_from,
            "to": [email],
            "subject": "RESCENE 이메일 인증",
            "html": f'<p>RESCENE 이메일 인증 링크입니다.</p><p><a href="{verify_url}">이메일 인증하기</a></p>',
        },
        timeout=10,
    ).raise_for_status()
