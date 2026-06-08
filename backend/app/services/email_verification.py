from dataclasses import dataclass
from datetime import timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import ensure_aware, new_secret_token, token_hash, utc_now
from app.models import EmailVerificationToken, User

EMAIL_VERIFICATION_COOLDOWN_SECONDS = 5 * 60
EMAIL_VERIFICATION_DAILY_LIMIT = 3
EMAIL_VERIFICATION_WINDOW_SECONDS = 24 * 60 * 60


@dataclass(frozen=True)
class EmailVerificationSendResult:
    status: str
    retry_after_seconds: int | None = None


class EmailVerificationRateLimitError(Exception):
    def __init__(self, message: str, retry_after_seconds: int) -> None:
        super().__init__(message)
        self.message = message
        self.retry_after_seconds = max(1, retry_after_seconds)


def is_email_verification_configured() -> bool:
    settings = get_settings()
    return settings.email_verification_enabled and bool(settings.resend_api_key)


def _seconds_until(target) -> int:
    return max(1, int((target - utc_now()).total_seconds()))


def assert_email_verification_send_allowed(db: Session, user: User) -> None:
    now = utc_now()
    window_start = now - timedelta(seconds=EMAIL_VERIFICATION_WINDOW_SECONDS)
    recent_tokens = list(
        db.scalars(
            select(EmailVerificationToken)
            .where(
                EmailVerificationToken.user_id == user.id,
                EmailVerificationToken.created_at >= window_start,
            )
            .order_by(EmailVerificationToken.created_at.desc())
        )
    )
    if len(recent_tokens) >= EMAIL_VERIFICATION_DAILY_LIMIT:
        oldest_counted = ensure_aware(recent_tokens[-1].created_at)
        retry_at = oldest_counted + timedelta(seconds=EMAIL_VERIFICATION_WINDOW_SECONDS)
        raise EmailVerificationRateLimitError(
            "인증 메일은 하루 3회까지만 보낼 수 있습니다.",
            _seconds_until(retry_at),
        )
    if recent_tokens:
        latest_created_at = ensure_aware(recent_tokens[0].created_at)
        cooldown_until = latest_created_at + timedelta(seconds=EMAIL_VERIFICATION_COOLDOWN_SECONDS)
        if cooldown_until > now:
            raise EmailVerificationRateLimitError(
                "인증 메일은 5분마다 재전송할 수 있습니다.",
                _seconds_until(cooldown_until),
            )


def create_email_verification_token(db: Session, user: User) -> str:
    now = utc_now()
    db.query(EmailVerificationToken).filter(
        EmailVerificationToken.user_id == user.id,
        EmailVerificationToken.used_at.is_(None),
    ).update({EmailVerificationToken.used_at: now})
    raw = new_secret_token()
    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=token_hash(raw),
            expires_at=now + timedelta(hours=24),
            created_at=now,
        )
    )
    return raw


def send_email_verification(
    db: Session,
    user: User,
    *,
    enforce_limits: bool = True,
) -> EmailVerificationSendResult:
    if user.email_verified_at is not None:
        return EmailVerificationSendResult(status="already_verified")
    if not is_email_verification_configured():
        return EmailVerificationSendResult(status="email_disabled")
    if enforce_limits:
        assert_email_verification_send_allowed(db, user)
    raw_token = create_email_verification_token(db, user)
    if not send_verification_email(user.email, raw_token):
        return EmailVerificationSendResult(status="email_disabled")
    return EmailVerificationSendResult(status="sent")


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


def send_verification_email(email: str, token: str) -> bool:
    settings = get_settings()
    if not settings.email_verification_enabled or not settings.resend_api_key:
        return False
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
    return True
