import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    monkeypatch.setenv("AI_DAILY_USER_LIMIT", "2")
    monkeypatch.setenv("AI_DAILY_GLOBAL_LIMIT", "20")
    monkeypatch.setenv("SEED_ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("SEED_ADMIN_PASSWORD", "admin-password")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    from app.core.config import reset_settings_cache
    from app.core.db import Base, get_engine, get_session_factory, reset_engine
    from app.core.rate_limit import limiter
    from app.main import create_app
    from app.services.seed import ensure_minimal_rag_seed
    import app.models  # noqa: F401

    reset_settings_cache()
    reset_engine()
    limiter.reset()
    Base.metadata.create_all(get_engine())
    with get_session_factory()() as db:
        ensure_minimal_rag_seed(db)

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client

    reset_engine()
    limiter.reset()
    reset_settings_cache()


def signup(client: TestClient, email: str = "user@example.com") -> str:
    response = client.post(
        "/auth/signup",
        json={"email": email, "password": "Password123!", "display_name": "User"},
    )
    assert response.status_code == 201, response.text
    from app.core.db import get_session_factory
    from app.core.security import utc_now
    from app.models import User

    with get_session_factory()() as db:
        user = db.query(User).filter(User.email == email).one()
        user.email_verified_at = utc_now()
        db.commit()
    return response.json()["access_token"]


def login(client: TestClient, email: str, password: str) -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]
