from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AppSetting

INFRA_HARD_STOP_ENABLED_KEY = "infra_hard_stop_enabled"
INFRA_MANUAL_HARD_STOP_KEY = "infra_manual_hard_stop"
INFRA_MONTHLY_BUDGET_KEY = "infra_monthly_budget_usd"
RAILWAY_SUBSCRIPTION_KEY = "railway_subscription_monthly_usd"
RAILWAY_BACKEND_KEY = "railway_backend_estimated_monthly_usd"
RAILWAY_DB_KEY = "railway_db_estimated_monthly_usd"
VERCEL_KEY = "vercel_estimated_monthly_usd"

INFRA_SETTING_KEYS = {
    INFRA_HARD_STOP_ENABLED_KEY,
    INFRA_MANUAL_HARD_STOP_KEY,
    INFRA_MONTHLY_BUDGET_KEY,
    RAILWAY_SUBSCRIPTION_KEY,
    RAILWAY_BACKEND_KEY,
    RAILWAY_DB_KEY,
    VERCEL_KEY,
}

UPDATE_FIELD_TO_SETTING_KEY = {
    "monthly_budget_usd": INFRA_MONTHLY_BUDGET_KEY,
    "railway_subscription_monthly_usd": RAILWAY_SUBSCRIPTION_KEY,
    "railway_backend_estimated_monthly_usd": RAILWAY_BACKEND_KEY,
    "railway_db_estimated_monthly_usd": RAILWAY_DB_KEY,
    "vercel_estimated_monthly_usd": VERCEL_KEY,
}


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _format_bool(value: bool) -> str:
    return "true" if value else "false"


def _parse_float(value: str) -> float:
    return max(0.0, float(value))


def _setting(db: Session, key: str, default: str) -> str:
    row = db.get(AppSetting, key)
    if row is None:
        return default
    return row.value


def _set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def _month_progress(now: datetime) -> tuple[str, str, float]:
    current = now.astimezone(UTC)
    start = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if current.month == 12:
        next_month = start.replace(year=current.year + 1, month=1)
    else:
        next_month = start.replace(month=current.month + 1)
    total_seconds = max(1.0, (next_month - start).total_seconds())
    elapsed_seconds = min(total_seconds, max(0.0, (current - start).total_seconds()))
    return start.date().isoformat(), next_month.date().isoformat(), elapsed_seconds / total_seconds


def get_infra_cost_snapshot(db: Session, now: datetime | None = None) -> dict[str, float | bool | str]:
    settings = get_settings()
    current = now or datetime.now(UTC)
    period_start, next_reset, month_ratio = _month_progress(current)
    hard_stop_enabled = _parse_bool(
        _setting(db, INFRA_HARD_STOP_ENABLED_KEY, _format_bool(settings.infra_budget_hard_stop_enabled))
    )
    manual_hard_stop = _parse_bool(_setting(db, INFRA_MANUAL_HARD_STOP_KEY, "false"))
    monthly_budget = _parse_float(
        _setting(db, INFRA_MONTHLY_BUDGET_KEY, str(settings.infra_monthly_budget_usd))
    )
    railway_subscription = _parse_float(
        _setting(
            db,
            RAILWAY_SUBSCRIPTION_KEY,
            str(settings.railway_subscription_monthly_usd),
        )
    )
    railway_backend = _parse_float(
        _setting(db, RAILWAY_BACKEND_KEY, str(settings.railway_backend_estimated_monthly_usd))
    )
    railway_db = _parse_float(
        _setting(db, RAILWAY_DB_KEY, str(settings.railway_db_estimated_monthly_usd))
    )
    vercel = _parse_float(_setting(db, VERCEL_KEY, str(settings.vercel_estimated_monthly_usd)))
    estimated_monthly = railway_subscription + railway_backend + railway_db + vercel
    elapsed_estimated = estimated_monthly * month_ratio
    budget_ratio = elapsed_estimated / monthly_budget if monthly_budget > 0 else (1.0 if elapsed_estimated > 0 else 0.0)
    hard_stopped = manual_hard_stop or (hard_stop_enabled and budget_ratio >= 1.0)
    return {
        "hard_stop_enabled": hard_stop_enabled,
        "manual_hard_stop": manual_hard_stop,
        "hard_stopped": hard_stopped,
        "monthly_budget_usd": round(monthly_budget, 4),
        "estimated_monthly_usd": round(estimated_monthly, 4),
        "elapsed_estimated_usd": round(elapsed_estimated, 4),
        "budget_ratio": round(budget_ratio, 6),
        "railway_subscription_monthly_usd": round(railway_subscription, 4),
        "railway_backend_estimated_monthly_usd": round(railway_backend, 4),
        "railway_db_estimated_monthly_usd": round(railway_db, 4),
        "vercel_estimated_monthly_usd": round(vercel, 4),
        "period_start": period_start,
        "next_reset": next_reset,
    }


def update_infra_cost_settings(db: Session, payload: dict[str, float | bool]) -> dict[str, float | bool | str]:
    _set_setting(db, INFRA_HARD_STOP_ENABLED_KEY, _format_bool(bool(payload["hard_stop_enabled"])))
    _set_setting(db, INFRA_MANUAL_HARD_STOP_KEY, _format_bool(bool(payload["manual_hard_stop"])))
    for field_name, setting_key in UPDATE_FIELD_TO_SETTING_KEY.items():
        _set_setting(db, setting_key, str(_parse_float(str(payload[field_name]))))
    db.flush()
    return get_infra_cost_snapshot(db)


def infra_hard_stop_active(db: Session) -> bool:
    return bool(get_infra_cost_snapshot(db)["hard_stopped"])
