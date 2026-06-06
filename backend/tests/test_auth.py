from tests.conftest import signup


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
