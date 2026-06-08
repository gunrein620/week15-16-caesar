import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "RESCENE Board"
    environment: Literal["local", "test", "production", "preview"] = "local"
    database_url: str = "postgresql+psycopg://caesar:caesar@localhost:5432/caesar"
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    login_lockout_max_attempts: int = 5
    login_lockout_window_minutes: int = 15
    login_lockout_minutes: int = 15
    frontend_origin: str = "http://localhost:5173"
    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    cors_allow_origin_regex: str | None = None
    openai_api_key: str | None = None
    youtube_api_key: str | None = None
    naver_client_id: str | None = None
    naver_client_secret: str | None = None
    resend_api_key: str | None = None
    email_from: str = "RESCENE <noreply@example.com>"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    kakao_client_id: str | None = None
    kakao_client_secret: str | None = None
    oauth_redirect_base_url: str | None = None
    ai_daily_user_limit: int = 20
    ai_daily_global_limit: int = 200
    public_signup_enabled: bool = True
    infra_budget_hard_stop_enabled: bool = True
    infra_monthly_budget_usd: float = 10.0
    railway_subscription_monthly_usd: float = 5.0
    railway_backend_estimated_monthly_usd: float = 3.0
    railway_db_estimated_monthly_usd: float = 2.0
    vercel_estimated_monthly_usd: float = 0.0
    seed_admin_email: str = "admin@example.com"
    seed_admin_password: str = "change-me-admin"
    embedding_model: str = "text-embedding-3-small"
    chat_model: str = "gpt-4o-mini"

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        raw_value = value.strip()
        if raw_value.startswith("["):
            parsed_value = json.loads(raw_value)
            if isinstance(parsed_value, list):
                return parsed_value
        return [origin.strip() for origin in raw_value.split(",") if origin.strip()]

    @field_validator("cors_allow_origin_regex", mode="before")
    @classmethod
    def empty_regex_to_none(cls, value: str | None) -> str | None:
        return value or None


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
