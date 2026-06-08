from app.core.config import Settings


def test_cors_allowed_origins_accepts_comma_separated_env(monkeypatch):
    monkeypatch.setenv(
        "CORS_ALLOWED_ORIGINS",
        "https://frontend-coral-six-al1fy1xeup.vercel.app, https://example.com",
    )

    settings = Settings()

    assert settings.cors_allowed_origins == [
        "https://frontend-coral-six-al1fy1xeup.vercel.app",
        "https://example.com",
    ]


def test_cors_allowed_origins_accepts_json_array_env(monkeypatch):
    monkeypatch.setenv(
        "CORS_ALLOWED_ORIGINS",
        '["https://frontend-coral-six-al1fy1xeup.vercel.app"]',
    )

    settings = Settings()

    assert settings.cors_allowed_origins == ["https://frontend-coral-six-al1fy1xeup.vercel.app"]
