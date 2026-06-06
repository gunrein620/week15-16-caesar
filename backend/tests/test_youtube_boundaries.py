from tests.conftest import login


def test_get_videos_reads_cache_without_youtube_key(client):
    response = client.get("/artists/1/videos")
    assert response.status_code == 200
    assert response.json() == []


def test_admin_sync_gracefully_errors_without_youtube_key(client):
    token = login(client, "admin@example.com", "admin-password")
    response = client.post("/artists/1/sync", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 503
    assert "YOUTUBE_API_KEY" in response.json()["detail"]
