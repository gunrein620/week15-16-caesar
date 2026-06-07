import pytest
from sqlalchemy.exc import IntegrityError

from app.core.db import get_session_factory
from app.models import ArtistKeyword, Member
from tests.conftest import login, signup


def test_keywords_and_members_can_be_managed_by_admin(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}

    keywords = client.get("/artists/1/keywords")
    assert keywords.status_code == 200
    assert {"RESCENE", "리센느"} <= {item["keyword"] for item in keywords.json()}

    created_keyword = client.post(
        "/artists/1/keywords",
        json={"keyword": "  stage-test  "},
        headers=headers,
    )
    assert created_keyword.status_code == 201, created_keyword.text
    assert created_keyword.json()["keyword"] == "stage-test"

    duplicate_keyword = client.post(
        "/artists/1/keywords",
        json={"keyword": "stage-test"},
        headers=headers,
    )
    assert duplicate_keyword.status_code == 201
    assert duplicate_keyword.json()["id"] == created_keyword.json()["id"]

    members = client.get("/artists/1/members")
    assert members.status_code == 200
    assert "Woni" in {item["name"] for item in members.json()}

    created_member = client.post(
        "/artists/1/members",
        json={"name": "  TestMember  ", "position": " vocalist "},
        headers=headers,
    )
    assert created_member.status_code == 201, created_member.text
    assert created_member.json()["name"] == "TestMember"
    assert created_member.json()["position"] == "vocalist"

    updated_member = client.post(
        "/artists/1/members",
        json={"name": "TestMember", "position": "leader"},
        headers=headers,
    )
    assert updated_member.status_code == 201
    assert updated_member.json()["id"] == created_member.json()["id"]
    assert updated_member.json()["position"] == "leader"


def test_archive_terms_can_be_managed_by_admin(client):
    user_token = signup(client, "archive-term-user@example.com")
    user_headers = {"Authorization": f"Bearer {user_token}"}
    admin_token = login(client, "admin@example.com", "admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    seeded = client.get("/artists/1/archive-terms")
    assert seeded.status_code == 200
    assert "Love Attack" in {item["title"] for item in seeded.json()}

    blocked = client.post(
        "/artists/1/archive-terms",
        json={
            "term_type": "song",
            "title": "Dream Signal",
            "aliases": ["드림시그널"],
        },
        headers=user_headers,
    )
    assert blocked.status_code == 403

    created = client.post(
        "/artists/1/archive-terms",
        json={
            "term_type": "song",
            "title": "  Dream Signal  ",
            "aliases": ["드림시그널", "Dream Signal", " "],
        },
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    assert created.json()["term_type"] == "song"
    assert created.json()["title"] == "Dream Signal"
    assert created.json()["aliases"] == ["드림시그널", "Dream Signal"]

    duplicate = client.post(
        "/artists/1/archive-terms",
        json={
            "term_type": "song",
            "title": "Dream Signal",
            "aliases": ["드림 시그널"],
        },
        headers=admin_headers,
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["id"] == created.json()["id"]
    assert duplicate.json()["aliases"] == ["드림 시그널"]

    updated = client.put(
        f"/artist-archive-terms/{created.json()['id']}",
        json={
            "term_type": "activity",
            "title": "Dream Signal era",
            "aliases": ["드림시그널 활동"],
        },
        headers=admin_headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["term_type"] == "activity"
    assert updated.json()["title"] == "Dream Signal era"

    deleted = client.delete(f"/artist-archive-terms/{created.json()['id']}", headers=admin_headers)
    assert deleted.status_code == 204


def test_keyword_and_member_create_are_admin_only(client):
    user_token = signup(client)
    headers = {"Authorization": f"Bearer {user_token}"}

    keyword = client.post("/artists/1/keywords", json={"keyword": "blocked"}, headers=headers)
    member = client.post("/artists/1/members", json={"name": "Blocked"}, headers=headers)

    assert keyword.status_code == 403
    assert member.status_code == 403


def test_keyword_and_member_reject_blank_values(client):
    admin_token = login(client, "admin@example.com", "admin-password")
    headers = {"Authorization": f"Bearer {admin_token}"}

    keyword = client.post("/artists/1/keywords", json={"keyword": "   "}, headers=headers)
    member = client.post("/artists/1/members", json={"name": "   "}, headers=headers)

    assert keyword.status_code == 422
    assert member.status_code == 422


def test_metadata_db_constraints_reject_blank_and_duplicate_member(client):
    with get_session_factory()() as db:
        db.add(Member(artist_id=1, name="   "))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        db.add(ArtistKeyword(artist_id=1, keyword="   "))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        db.add(Member(artist_id=1, name="Woni"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
