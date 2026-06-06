from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AuthLoginAttempt


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


def login_attempt_identifier(email: str, _ip_address: str | None) -> str:
    return email.strip().lower()


def assert_login_allowed(db: Session, email: str, ip_address: str | None) -> None:
    identifier = login_attempt_identifier(email, ip_address)
    attempt = db.scalar(select(AuthLoginAttempt).where(AuthLoginAttempt.identifier == identifier))
    if attempt is None:
        return

    now = _now()
    locked_until = _aware(attempt.locked_until)
    if locked_until is not None and locked_until > now:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
        )
    if locked_until is not None:
        db.execute(delete(AuthLoginAttempt).where(AuthLoginAttempt.id == attempt.id))
        db.flush()


def record_login_failure(db: Session, email: str, ip_address: str | None) -> None:
    settings = get_settings()
    now = _now()
    identifier = login_attempt_identifier(email, ip_address)
    attempt = db.scalar(select(AuthLoginAttempt).where(AuthLoginAttempt.identifier == identifier))
    window = timedelta(minutes=settings.login_lockout_window_minutes)

    if attempt is None:
        attempt = AuthLoginAttempt(
            identifier=identifier,
            failed_count=0,
            window_started_at=now,
        )
        db.add(attempt)
    elif now - (_aware(attempt.window_started_at) or now) > window:
        attempt.failed_count = 0
        attempt.window_started_at = now
        attempt.locked_until = None

    attempt.failed_count += 1
    attempt.last_failed_at = now
    if attempt.failed_count >= settings.login_lockout_max_attempts:
        attempt.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
    db.commit()


def clear_login_failures(db: Session, email: str, ip_address: str | None) -> None:
    identifier = login_attempt_identifier(email, ip_address)
    db.execute(delete(AuthLoginAttempt).where(AuthLoginAttempt.identifier == identifier))
    db.commit()
