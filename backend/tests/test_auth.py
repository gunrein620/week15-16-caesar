import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.db import Base, get_session_factory
from app.models import Post, User
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
        json={"email": "user@example.com", "password": "Password123!", "display_name": "Again"},
    )
    assert response.status_code == 409


def test_signup_rejects_password_without_required_mix(client):
    response = client.post(
        "/auth/signup",
        json={"email": "weak@example.com", "password": "password123", "display_name": "Weak"},
    )

    assert response.status_code == 422
    assert "special character" in response.text


def test_signup_can_be_disabled(client, monkeypatch):
    from app.core.config import reset_settings_cache

    monkeypatch.setenv("PUBLIC_SIGNUP_ENABLED", "false")
    reset_settings_cache()
    response = client.post(
        "/auth/signup",
        json={"email": "closed@example.com", "password": "Password123!", "display_name": "Closed"},
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
        json={"email": "blocked@example.com", "password": "Password123!", "display_name": "Blocked"},
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
        json={"email": "opened@example.com", "password": "Password123!", "display_name": "Opened"},
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
        json={"email": "blocked-again@example.com", "password": "Password123!", "display_name": "Blocked"},
    )
    reset_settings_cache()

    assert forbidden.status_code == 403
    assert disabled.status_code == 200
    assert disabled.json()["public_signup_enabled"] is False
    assert blocked_again.status_code == 403


def test_admin_can_manage_user_accounts_when_public_signup_is_closed(client, monkeypatch):
    from app.core.config import reset_settings_cache

    monkeypatch.setenv("PUBLIC_SIGNUP_ENABLED", "false")
    reset_settings_cache()
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    created = client.post(
        "/admin/users",
        json={
            "email": "managed@example.com",
            "password": "Password123!",
            "display_name": "Managed User",
            "role": "user",
        },
        headers=admin_headers,
    )
    duplicate = client.post(
        "/admin/users",
        json={
            "email": "managed@example.com",
            "password": "Password123!",
            "display_name": "Duplicate",
            "role": "user",
        },
        headers=admin_headers,
    )

    reset_settings_cache()
    assert created.status_code == 201, created.text
    assert duplicate.status_code == 409
    user_id = created.json()["id"]
    user_login = client.post(
        "/auth/login", json={"email": "managed@example.com", "password": "Password123!"}
    )
    assert user_login.status_code == 200, user_login.text
    user_headers = {"Authorization": f"Bearer {user_login.json()['access_token']}"}
    assert client.get("/admin/users", headers=user_headers).status_code == 403

    listed = client.get("/admin/users", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    assert "managed@example.com" in {item["email"] for item in listed.json()}

    updated = client.put(
        f"/admin/users/{user_id}",
        json={"display_name": "Managed Admin", "role": "admin", "password": "newPassword123!"},
        headers=admin_headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["display_name"] == "Managed Admin"
    assert updated.json()["role"] == "admin"
    assert (
        client.post(
            "/auth/login", json={"email": "managed@example.com", "password": "newPassword123!"}
        ).status_code
        == 200
    )

    self_delete = client.delete("/admin/users/1", headers=admin_headers)
    self_demote = client.put(
        "/admin/users/1",
        json={"display_name": "Admin", "role": "user"},
        headers=admin_headers,
    )
    assert self_delete.status_code == 400
    assert self_demote.status_code == 400


def test_admin_delete_user_removes_owned_posts_and_blocks_login(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    user_token = signup(client, "delete-me@example.com")
    user_headers = {"Authorization": f"Bearer {user_token}"}
    post = client.post(
        "/posts",
        json={"title": "삭제될 글", "content": "계정 삭제와 함께 삭제됩니다.", "tags": []},
        headers=user_headers,
    )
    assert post.status_code == 201, post.text
    post_id = post.json()["id"]
    with get_session_factory()() as db:
        user = db.scalar(select(User).where(User.email == "delete-me@example.com"))
        assert user is not None
        user_id = user.id

    deleted = client.delete(f"/admin/users/{user_id}", headers=admin_headers)

    assert deleted.status_code == 204, deleted.text
    assert client.get(f"/posts/{post_id}").status_code == 404
    assert (
        client.post(
            "/auth/login", json={"email": "delete-me@example.com", "password": "Password123!"}
        ).status_code
        == 401
    )
    with get_session_factory()() as db:
        assert db.get(User, user_id) is None
        assert db.get(Post, post_id) is None


def test_admin_user_list_allows_legacy_local_email_accounts(client):
    from app.core.security import hash_password

    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    with get_session_factory()() as db:
        db.add(
            User(
                email="admin@week15-16-caesar.local",
                display_name="Legacy Admin",
                hashed_password=hash_password("Password123!"),
                role="admin",
            )
        )
        db.commit()

    listed = client.get("/admin/users", headers=admin_headers)

    assert listed.status_code == 200, listed.text
    assert "admin@week15-16-caesar.local" in {item["email"] for item in listed.json()}


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
