from tests.conftest import login, signup


def test_ai_requires_auth_and_enforces_daily_quota(client):
    unauthorized = client.post("/ai/qa", json={"question": "리센느는?", "artist_id": 1})
    assert unauthorized.status_code == 401

    token = signup(client)
    headers = {"Authorization": f"Bearer {token}"}
    first = client.post("/ai/qa", json={"question": "리센느 입덕 포인트는?", "artist_id": 1}, headers=headers)
    assert first.status_code == 200, first.text
    second = client.post("/ai/qa", json={"question": "한 번 더", "artist_id": 1}, headers=headers)
    assert second.status_code == 429


def test_sync_and_briefing_are_admin_only(client):
    user_token = signup(client)
    user_headers = {"Authorization": f"Bearer {user_token}"}
    assert client.post("/artists/1/sync", headers=user_headers).status_code == 403
    assert client.post("/ai/briefing/preview", headers=user_headers).status_code == 403

    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    preview = client.post("/ai/briefing/preview", headers=admin_headers)
    assert preview.status_code == 200, preview.text
    run_id = preview.json()["run_id"]

    publish = client.post(f"/ai/briefing/{run_id}/publish", headers=admin_headers)
    assert publish.status_code == 200, publish.text

    duplicate_preview = client.post("/ai/briefing/preview", headers=admin_headers)
    duplicate = client.post(
        f"/ai/briefing/{duplicate_preview.json()['run_id']}/publish", headers=admin_headers
    )
    assert duplicate.status_code == 409
