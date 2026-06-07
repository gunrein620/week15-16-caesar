from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AppSetting

PUBLIC_SIGNUP_SETTING_KEY = "public_signup_enabled"
SYNC_ENABLED_KEY = "sync.enabled"
SYNC_OFFICIAL_INTERVAL_KEY = "sync.official_interval_minutes"
SYNC_MEMBER_INTERVAL_KEY = "sync.member_interval_minutes"
SYNC_FAN_INTERVAL_KEY = "sync.fan_interval_minutes"
SYNC_CURATED_INTERVAL_KEY = "sync.curated_interval_minutes"
SYNC_NAVER_INTERVAL_KEY = "sync.naver_interval_minutes"
SYNC_KEYWORD_INTERVAL_KEY = "sync.keyword_interval_minutes"
SYNC_LAST_OFFICIAL_KEY = "sync.last_official_sync_at"
SYNC_LAST_MEMBER_KEY = "sync.last_member_sync_at"
SYNC_LAST_FAN_KEY = "sync.last_fan_sync_at"
SYNC_LAST_CURATED_KEY = "sync.last_curated_sync_at"
SYNC_LAST_NAVER_KEY = "sync.last_naver_sync_at"
SYNC_LAST_KEYWORD_KEY = "sync.last_keyword_sync_at"

DEFAULT_SYNC_ENABLED = True
DEFAULT_OFFICIAL_INTERVAL_MINUTES = 180
DEFAULT_MEMBER_INTERVAL_MINUTES = 120
DEFAULT_FAN_INTERVAL_MINUTES = 60
DEFAULT_CURATED_INTERVAL_MINUTES = 720
DEFAULT_NAVER_INTERVAL_MINUTES = 60
DEFAULT_KEYWORD_INTERVAL_MINUTES = 120


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _serialize_bool(value: bool) -> str:
    return "true" if value else "false"


def _parse_int(value: str | None, default: int) -> int:
    try:
        return int(value or "")
    except ValueError:
        return default


def _setting(db: Session, key: str, default: str) -> str:
    row = db.get(AppSetting, key)
    return row.value if row is not None else default


def _set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
        return
    row.value = value


def get_public_signup_enabled(db: Session) -> bool:
    setting = db.get(AppSetting, PUBLIC_SIGNUP_SETTING_KEY)
    if setting is None:
        return get_settings().public_signup_enabled
    return _parse_bool(setting.value)


def set_public_signup_enabled(db: Session, enabled: bool) -> bool:
    setting = db.get(AppSetting, PUBLIC_SIGNUP_SETTING_KEY)
    if setting is None:
        setting = AppSetting(key=PUBLIC_SIGNUP_SETTING_KEY, value=_serialize_bool(enabled))
        db.add(setting)
    else:
        setting.value = _serialize_bool(enabled)
    db.flush()
    return enabled


def get_sync_settings(db: Session) -> dict[str, int | bool | str | None]:
    return {
        "enabled": _parse_bool(_setting(db, SYNC_ENABLED_KEY, _serialize_bool(DEFAULT_SYNC_ENABLED))),
        "official_interval_minutes": _parse_int(
            _setting(db, SYNC_OFFICIAL_INTERVAL_KEY, str(DEFAULT_OFFICIAL_INTERVAL_MINUTES)),
            DEFAULT_OFFICIAL_INTERVAL_MINUTES,
        ),
        "member_interval_minutes": _parse_int(
            _setting(db, SYNC_MEMBER_INTERVAL_KEY, str(DEFAULT_MEMBER_INTERVAL_MINUTES)),
            DEFAULT_MEMBER_INTERVAL_MINUTES,
        ),
        "fan_interval_minutes": _parse_int(
            _setting(db, SYNC_FAN_INTERVAL_KEY, str(DEFAULT_FAN_INTERVAL_MINUTES)),
            DEFAULT_FAN_INTERVAL_MINUTES,
        ),
        "curated_interval_minutes": _parse_int(
            _setting(db, SYNC_CURATED_INTERVAL_KEY, str(DEFAULT_CURATED_INTERVAL_MINUTES)),
            DEFAULT_CURATED_INTERVAL_MINUTES,
        ),
        "naver_interval_minutes": _parse_int(
            _setting(db, SYNC_NAVER_INTERVAL_KEY, str(DEFAULT_NAVER_INTERVAL_MINUTES)),
            DEFAULT_NAVER_INTERVAL_MINUTES,
        ),
        "keyword_interval_minutes": _parse_int(
            _setting(db, SYNC_KEYWORD_INTERVAL_KEY, str(DEFAULT_KEYWORD_INTERVAL_MINUTES)),
            DEFAULT_KEYWORD_INTERVAL_MINUTES,
        ),
        "last_official_sync_at": _setting(db, SYNC_LAST_OFFICIAL_KEY, "") or None,
        "last_member_sync_at": _setting(db, SYNC_LAST_MEMBER_KEY, "") or None,
        "last_fan_sync_at": _setting(db, SYNC_LAST_FAN_KEY, "") or None,
        "last_curated_sync_at": _setting(db, SYNC_LAST_CURATED_KEY, "") or None,
        "last_naver_sync_at": _setting(db, SYNC_LAST_NAVER_KEY, "") or None,
        "last_keyword_sync_at": _setting(db, SYNC_LAST_KEYWORD_KEY, "") or None,
    }


def set_sync_settings(db: Session, payload: dict[str, int | bool]) -> dict[str, int | bool | str | None]:
    _set_setting(db, SYNC_ENABLED_KEY, _serialize_bool(bool(payload["enabled"])))
    _set_setting(db, SYNC_OFFICIAL_INTERVAL_KEY, str(payload["official_interval_minutes"]))
    _set_setting(db, SYNC_MEMBER_INTERVAL_KEY, str(payload["member_interval_minutes"]))
    _set_setting(db, SYNC_FAN_INTERVAL_KEY, str(payload["fan_interval_minutes"]))
    _set_setting(db, SYNC_CURATED_INTERVAL_KEY, str(payload["curated_interval_minutes"]))
    _set_setting(db, SYNC_NAVER_INTERVAL_KEY, str(payload["naver_interval_minutes"]))
    _set_setting(db, SYNC_KEYWORD_INTERVAL_KEY, str(payload["keyword_interval_minutes"]))
    db.flush()
    return get_sync_settings(db)


def set_sync_last_run(db: Session, key: str, value: str) -> None:
    _set_setting(db, key, value)
    db.flush()
