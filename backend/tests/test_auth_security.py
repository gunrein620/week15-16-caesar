from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import reset_settings_cache
from app.core.db import get_session_factory
from app.models import AuthIdentity, EmailVerificationToken, User, UserSession
from tests.conftest import login


def test_login_sets_refresh_cookie_and_refresh_rotates_session(client):
    login_response = client.post(
        "/auth/login", json={"email": "admin@example.com", "password": "admin-password"}
    )
    first_token = login_response.json()["access_token"]

    refresh_response = client.post("/auth/refresh")

    assert login_response.status_code == 200, login_response.text
    assert "refresh_token=" in login_response.headers["set-cookie"]
    assert refresh_response.status_code == 200, refresh_response.text
    assert refresh_response.json()["access_token"] != first_token
    with get_session_factory()() as db:
        sessions = db.query(UserSession).all()
        assert len(sessions) == 1
        assert sessions[0].last_used_at is not None
        assert sessions[0].revoked_at is None


def test_logout_revokes_refresh_session_and_clears_cookie(client):
    client.post("/auth/login", json={"email": "admin@example.com", "password": "admin-password"})

    logout_response = client.post("/auth/logout")
    refresh_response = client.post("/auth/refresh")

    assert logout_response.status_code == 204
    assert "Max-Age=0" in logout_response.headers["set-cookie"]
    assert refresh_response.status_code == 401
    with get_session_factory()() as db:
        assert db.query(UserSession).one().revoked_at is not None


def test_email_verification_disabled_allows_unverified_user_to_write_save_or_use_ai(client, monkeypatch):
    monkeypatch.setenv("EMAIL_VERIFICATION_ENABLED", "false")
    reset_settings_cache()
    signup_response = client.post(
        "/auth/signup",
        json={"email": "unverified-allowed@example.com", "password": "Password123!", "display_name": "Allowed"},
    )
    headers = {"Authorization": f"Bearer {signup_response.json()['access_token']}"}

    post = client.post("/posts", json={"title": "allowed", "content": "allowed"}, headers=headers)
    save = client.post(
        "/saved-items",
        json={"item_type": "youtube", "item_id": "allowed", "title": "allowed"},
        headers=headers,
    )
    ai = client.post(
        "/ai/qa",
        json={"question": "리센느", "artist_id": 1, "include_answer": False},
        headers=headers,
    )

    assert signup_response.status_code == 201, signup_response.text
    assert signup_response.json()["user"]["email_verified_at"] is None
    assert post.status_code == 201, post.text
    assert save.status_code == 201, save.text
    assert ai.status_code == 200, ai.text
    reset_settings_cache()


def test_email_verification_enabled_blocks_unverified_user_write_save_or_ai(client, monkeypatch):
    monkeypatch.setenv("EMAIL_VERIFICATION_ENABLED", "true")
    reset_settings_cache()
    signup_response = client.post(
        "/auth/signup",
        json={"email": "unverified@example.com", "password": "Password123!", "display_name": "Unverified"},
    )
    headers = {"Authorization": f"Bearer {signup_response.json()['access_token']}"}

    post = client.post("/posts", json={"title": "blocked", "content": "blocked"}, headers=headers)
    save = client.post(
        "/saved-items",
        json={"item_type": "youtube", "item_id": "x", "title": "x"},
        headers=headers,
    )
    ai = client.post("/ai/qa", json={"question": "리센느", "artist_id": 1}, headers=headers)

    assert signup_response.status_code == 201, signup_response.text
    assert signup_response.json()["user"]["email_verified_at"] is None
    assert post.status_code == 403
    assert save.status_code == 403
    assert ai.status_code == 403
    reset_settings_cache()


def test_email_verification_token_is_hashed_single_use_and_verifies_user(client, monkeypatch):
    sent_tokens: list[str] = []
    monkeypatch.setenv("EMAIL_VERIFICATION_ENABLED", "true")
    monkeypatch.setenv("RESEND_API_KEY", "test-resend-key")
    reset_settings_cache()
    monkeypatch.setattr(
        "app.services.email_verification.send_verification_email",
        lambda email, token: sent_tokens.append(token) or True,
    )
    signup_response = client.post(
        "/auth/signup",
        json={"email": "verify@example.com", "password": "Password123!", "display_name": "Verify"},
    )
    headers = {"Authorization": f"Bearer {signup_response.json()['access_token']}"}

    raw_token = sent_tokens[-1]
    verify_response = client.post("/auth/email/verify", json={"token": raw_token}, headers=headers)
    second_response = client.post("/auth/email/verify", json={"token": raw_token}, headers=headers)

    assert signup_response.status_code == 201, signup_response.text
    assert raw_token
    with get_session_factory()() as db:
        stored = db.query(EmailVerificationToken).one()
        assert stored.token_hash != raw_token
        user = db.query(User).filter(User.email == "verify@example.com").one()
        assert user.email_verified_at is not None
    assert verify_response.status_code == 200, verify_response.text
    assert verify_response.json()["email_verified_at"] is not None
    assert second_response.status_code == 400
    reset_settings_cache()


def test_signup_auto_sends_email_verification_when_email_is_configured(client, monkeypatch):
    sent_tokens: list[str] = []
    monkeypatch.setenv("EMAIL_VERIFICATION_ENABLED", "true")
    monkeypatch.setenv("RESEND_API_KEY", "test-resend-key")
    reset_settings_cache()
    monkeypatch.setattr(
        "app.services.email_verification.send_verification_email",
        lambda email, token: sent_tokens.append(token) or True,
    )

    signup_response = client.post(
        "/auth/signup",
        json={"email": "auto-verify@example.com", "password": "Password123!", "display_name": "Auto"},
    )

    assert signup_response.status_code == 201, signup_response.text
    assert len(sent_tokens) == 1
    with get_session_factory()() as db:
        stored = db.query(EmailVerificationToken).filter(EmailVerificationToken.used_at.is_(None)).one()
        assert stored.token_hash != sent_tokens[0]
    reset_settings_cache()


def test_email_verification_resend_is_limited_by_cooldown_and_daily_count(client, monkeypatch):
    sent_tokens: list[str] = []
    monkeypatch.setenv("EMAIL_VERIFICATION_ENABLED", "true")
    monkeypatch.setenv("RESEND_API_KEY", "test-resend-key")
    reset_settings_cache()
    monkeypatch.setattr(
        "app.services.email_verification.send_verification_email",
        lambda email, token: sent_tokens.append(token) or True,
    )
    signup_response = client.post(
        "/auth/signup",
        json={"email": "limited-verify@example.com", "password": "Password123!", "display_name": "Limited"},
    )
    headers = {"Authorization": f"Bearer {signup_response.json()['access_token']}"}

    cooldown = client.post("/auth/email/verification", headers=headers)
    with get_session_factory()() as db:
        user = db.scalar(select(User).where(User.email == "limited-verify@example.com"))
        assert user is not None
        db.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).update(
            {EmailVerificationToken.created_at: datetime.now(UTC) - timedelta(minutes=10)}
        )
        db.commit()
    resend = client.post("/auth/email/verification", headers=headers)
    with get_session_factory()() as db:
        user = db.scalar(select(User).where(User.email == "limited-verify@example.com"))
        assert user is not None
        db.add_all(
            [
                EmailVerificationToken(
                    user_id=user.id,
                    token_hash=f"extra_hash_{index}",
                    expires_at=datetime.now(UTC) + timedelta(hours=1),
                    used_at=datetime.now(UTC),
                    created_at=datetime.now(UTC) - timedelta(minutes=15 + index),
                )
                for index in range(2)
            ]
        )
        db.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).update(
            {EmailVerificationToken.created_at: datetime.now(UTC) - timedelta(minutes=10)}
        )
        db.commit()
    daily_limit = client.post("/auth/email/verification", headers=headers)

    assert cooldown.status_code == 429
    assert "5분" in cooldown.json()["detail"]
    assert resend.status_code == 202, resend.text
    assert daily_limit.status_code == 429
    assert "하루 3회" in daily_limit.json()["detail"]
    assert len(sent_tokens) == 2
    reset_settings_cache()


def test_admin_user_delete_revokes_user_sessions(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    created = client.post(
        "/admin/users",
        json={
            "email": "session-delete@example.com",
            "password": "Password123!",
            "display_name": "Session Delete",
            "role": "user",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    client.post("/auth/login", json={"email": "session-delete@example.com", "password": "Password123!"})
    user_id = created.json()["id"]

    deleted = client.delete(f"/admin/users/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})

    assert deleted.status_code == 204, deleted.text
    with get_session_factory()() as db:
        deleted_user_sessions = db.query(UserSession).filter(UserSession.provider == "password").all()
        assert any(session.revoked_at is not None for session in deleted_user_sessions)


def test_admin_can_revoke_user_sessions_without_deleting_user(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    created = client.post(
        "/admin/users",
        json={
            "email": "revoke-session@example.com",
            "password": "Password123!",
            "display_name": "Revoke Session",
            "role": "user",
        },
        headers=admin_headers,
    )
    client.post("/auth/login", json={"email": "revoke-session@example.com", "password": "Password123!"})
    user_id = created.json()["id"]

    response = client.delete(f"/admin/users/{user_id}/sessions", headers=admin_headers)
    listed = client.get("/admin/users", headers=admin_headers)

    assert response.status_code == 200, response.text
    assert response.json()["revoked"] == 1
    listed_user = next(item for item in listed.json() if item["id"] == user_id)
    assert listed_user["active_session_count"] == 0


def test_oauth_callback_creates_and_reuses_identity(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv("OAUTH_REDIRECT_BASE_URL", "https://backend.example.com")
    from app.core.config import reset_settings_cache

    reset_settings_cache()
    monkeypatch.setattr(
        "app.api.auth.exchange_oauth_code",
        lambda provider, code, redirect_uri: {
            "provider_subject": "google-123",
            "email": "google@example.com",
            "email_verified": True,
            "display_name": "Google User",
        },
    )
    state = client.get("/auth/oauth/google/start", follow_redirects=False).headers["location"].split("state=")[1].split("&")[0]

    first = client.get(f"/auth/oauth/google/callback?code=ok&state={state}", follow_redirects=False)
    second_state = client.get("/auth/oauth/google/start", follow_redirects=False).headers["location"].split("state=")[1].split("&")[0]
    second = client.get(f"/auth/oauth/google/callback?code=ok&state={second_state}", follow_redirects=False)

    reset_settings_cache()
    assert first.status_code == 307, first.text
    assert second.status_code == 307, second.text
    with get_session_factory()() as db:
        assert db.query(User).filter(User.email == "google@example.com").count() == 1
        assert db.query(AuthIdentity).filter(AuthIdentity.provider == "google").count() == 1


def test_oauth_callback_creates_kakao_identity_without_email(client, monkeypatch):
    monkeypatch.setenv("KAKAO_CLIENT_ID", "kakao-client")
    monkeypatch.setenv("KAKAO_CLIENT_SECRET", "kakao-secret")
    monkeypatch.setenv("OAUTH_REDIRECT_BASE_URL", "https://backend.example.com")
    from app.core.config import reset_settings_cache

    reset_settings_cache()
    monkeypatch.setattr(
        "app.api.auth.exchange_oauth_code",
        lambda provider, code, redirect_uri: {
            "provider_subject": "987654321",
            "email": None,
            "email_verified": False,
            "display_name": "Kakao User",
        },
    )
    state = client.get("/auth/oauth/kakao/start", follow_redirects=False).headers["location"].split("state=")[1].split("&")[0]

    response = client.get(f"/auth/oauth/kakao/callback?code=ok&state={state}", follow_redirects=False)

    reset_settings_cache()
    assert response.status_code == 307, response.text
    with get_session_factory()() as db:
        user = db.query(User).filter(User.email == "kakao_987654321@oauth.local").one()
        identity = db.query(AuthIdentity).filter(AuthIdentity.provider == "kakao").one()
        assert user.display_name == "Kakao User"
        assert user.email_verified_at is not None
        assert identity.user_id == user.id
        assert identity.email is None


def test_kakao_oauth_exchange_allows_profile_without_email(monkeypatch):
    monkeypatch.setenv("KAKAO_CLIENT_ID", "kakao-client")
    monkeypatch.setenv("KAKAO_CLIENT_SECRET", "kakao-secret")
    from app.core.config import reset_settings_cache
    from app.services.oauth import exchange_oauth_code

    class JsonResponse:
        def __init__(self, payload):
            self.payload = payload

        def json(self):
            return self.payload

    reset_settings_cache()
    monkeypatch.setattr("app.services.oauth.httpx.post", lambda *args, **kwargs: JsonResponse({"access_token": "token"}))
    monkeypatch.setattr(
        "app.services.oauth.httpx.get",
        lambda *args, **kwargs: JsonResponse({"id": 987654321, "properties": {"nickname": "Kakao User"}}),
    )

    profile = exchange_oauth_code("kakao", "code", "https://backend.example.com/auth/oauth/kakao/callback")

    reset_settings_cache()
    assert profile == {
        "provider_subject": "987654321",
        "email": None,
        "email_verified": False,
        "display_name": "Kakao User",
    }


def test_oauth_status_reports_configured_providers(client, monkeypatch):
    default_status = client.get("/auth/oauth/status")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    from app.core.config import reset_settings_cache

    reset_settings_cache()
    google_status = client.get("/auth/oauth/status")
    reset_settings_cache()

    assert default_status.status_code == 200, default_status.text
    assert default_status.json() == {"google": False, "kakao": False}
    assert google_status.status_code == 200, google_status.text
    assert google_status.json() == {"google": True, "kakao": False}


def test_expired_refresh_token_is_rejected(client):
    client.post("/auth/login", json={"email": "admin@example.com", "password": "admin-password"})
    with get_session_factory()() as db:
        session = db.query(UserSession).one()
        session.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()

    response = client.post("/auth/refresh")

    assert response.status_code == 401
