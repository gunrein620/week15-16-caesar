from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AppSetting

PUBLIC_SIGNUP_SETTING_KEY = "public_signup_enabled"


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _serialize_bool(value: bool) -> str:
    return "true" if value else "false"


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
