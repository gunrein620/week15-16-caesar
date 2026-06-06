import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.db import Base, get_session_factory
from app.models import User
from app.services.auth_lockout import login_attempt_identifier
from tests.conftest import login, signup


def test_signup_login_me_uses_display_name_and_role(client):
    token = signup(client)
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "user@example.com"
    assert body["display_name"] == "User"
    assert body["role"] == "user"
    assert "nickname" not in body


def test_duplicate_signup_returns_409(client):
    signup(client)
    response = client.post(
        "/auth/signup",
        json={"email": "user@example.com", "password": "password123", "display_name": "Again"},
    )
    assert response.status_code == 409


def test_signup_can_be_disabled(client, monkeypatch):
    from app.core.config import reset_settings_cache

    monkeypatch.setenv("PUBLIC_SIGNUP_ENABLED", "false")
    reset_settings_cache()
    response = client.post(
        "/auth/signup",
        json={"email": "closed@example.com", "password": "password123", "display_name": "Closed"},
    )
    reset_settings_cache()

    assert response.status_code == 403
    assert response.json()["detail"] == "Public signup is closed"


def test_admin_can_toggle_public_signup(client, monkeypatch):
    from app.core.config import reset_settings_cache

    monkeypatch.setenv("PUBLIC_SIGNUP_ENABLED", "false")
    reset_settings_cache()

    admin_token = login(client, "admin@example.com", "admin-password")
    blocked = client.post(
        "/auth/signup",
        json={"email": "blocked@example.com", "password": "password123", "display_name": "Blocked"},
    )
    status = client.get("/auth/signup-status")

    assert blocked.status_code == 403
    assert status.status_code == 200
    assert status.json()["public_signup_enabled"] is False

    enabled = client.put(
        "/admin/settings/signup",
        json={"public_signup_enabled": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    created = client.post(
        "/auth/signup",
        json={"email": "opened@example.com", "password": "password123", "display_name": "Opened"},
    )

    assert enabled.status_code == 200, enabled.text
    assert enabled.json()["public_signup_enabled"] is True
    assert created.status_code == 201, created.text

    user_token = created.json()["access_token"]
    forbidden = client.put(
        "/admin/settings/signup",
        json={"public_signup_enabled": False},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    disabled = client.put(
        "/admin/settings/signup",
        json={"public_signup_enabled": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    blocked_again = client.post(
        "/auth/signup",
        json={"email": "blocked-again@example.com", "password": "password123", "display_name": "Blocked"},
    )
    reset_settings_cache()

    assert forbidden.status_code == 403
    assert disabled.status_code == 200
    assert disabled.json()["public_signup_enabled"] is False
    assert blocked_again.status_code == 403


def test_seed_admin_password_is_synchronized(client):
    response = client.post(
        "/auth/login", json={"email": "admin@example.com", "password": "admin-password"}
    )
    assert response.status_code == 200, response.text


def test_repeated_login_failures_lock_identifier_before_password_check(client):
    for _ in range(5):
        response = client.post(
            "/auth/login", json={"email": "admin@example.com", "password": "wrong-password"}
        )
        assert response.status_code == 401

    locked = client.post(
        "/auth/login", json={"email": "admin@example.com", "password": "admin-password"}
    )

    assert locked.status_code == 429
    assert "Too many failed login attempts" in locked.json()["detail"]


def test_login_lockout_identifier_is_stable_across_proxy_ips():
    assert login_attempt_identifier(" Admin@Example.com ", "100.64.0.1") == login_attempt_identifier(
        "admin@example.com", "100.64.0.2"
    )


def test_social_login_schema_allows_passwordless_external_identity(client):
    assert "auth_identities" in Base.metadata.tables
    identity_table = Base.metadata.tables["auth_identities"]

    with get_session_factory()() as db:
        user = User(
            email="social@example.com",
            display_name="Social User",
            hashed_password=None,
            role="user",
        )
        db.add(user)
        db.flush()
        db.execute(
            identity_table.insert().values(
                user_id=user.id,
                provider="google",
                provider_subject="google-subject-1",
                email="social@example.com",
            )
        )
        db.commit()

        saved = db.scalar(select(User).where(User.email == "social@example.com"))
        assert saved is not None
        assert saved.hashed_password is None

        other_user = User(
            email="other-social@example.com",
            display_name="Other Social",
            hashed_password=None,
            role="user",
        )
        db.add(other_user)
        db.flush()
        with pytest.raises(IntegrityError):
            db.execute(
                identity_table.insert().values(
                    user_id=other_user.id,
                    provider="google",
                    provider_subject="google-subject-1",
                    email="other-social@example.com",
                )
            )
            db.commit()
