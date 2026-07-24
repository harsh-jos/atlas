"""Auth is the gate on every owned row, so test what it refuses as much as what it allows."""

from uuid import uuid4

import pytest

from app.auth.service import AuthService, EmailTaken, InvalidCredentials
from app.core.security import create_access_token, hash_password, verify_password

EMAIL = "reader@example.com"
PASSWORD = "correct-horse-battery"


@pytest.fixture
def registered(client):
    response = client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 201
    return response.json()


def _token(client) -> str:
    response = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_password_is_never_stored_in_the_clear(session):
    user = AuthService(session).register(EMAIL, PASSWORD)
    assert PASSWORD not in user.password_hash
    assert verify_password(PASSWORD, user.password_hash)


def test_register_returns_the_user_without_the_hash(registered):
    assert registered["email"] == EMAIL
    assert registered["role"] == "OWNER"
    assert "password_hash" not in registered


def test_duplicate_email_is_rejected(client, registered):
    response = client.post("/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 409


def test_short_passwords_are_rejected(client):
    response = client.post("/auth/register", json={"email": EMAIL, "password": "short"})
    assert response.status_code == 422


def test_login_wrong_password_is_unauthorized(client, registered):
    response = client.post("/auth/login", json={"email": EMAIL, "password": "wrong-" + PASSWORD})
    assert response.status_code == 401


def test_login_unknown_email_is_unauthorized(client, registered):
    response = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}
    )
    assert response.status_code == 401


def test_authenticate_raises_for_unknown_account(session):
    with pytest.raises(InvalidCredentials):
        AuthService(session).authenticate("nobody@example.com", PASSWORD)


def test_register_raises_on_duplicate(session):
    service = AuthService(session)
    service.register(EMAIL, PASSWORD)
    with pytest.raises(EmailTaken):
        service.register(EMAIL, PASSWORD)


def test_me_requires_a_token(client, registered):
    assert client.get("/auth/me").status_code == 401


def test_me_rejects_a_forged_token(client, registered):
    response = client.get("/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert response.status_code == 401


def test_me_rejects_a_token_for_a_user_that_no_longer_exists(client, registered):
    stale = create_access_token(uuid4())
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {stale}"})
    assert response.status_code == 401


def test_me_returns_the_caller(client, registered):
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {_token(client)}"})
    assert response.status_code == 200
    assert response.json()["email"] == EMAIL


def test_absent_account_still_costs_a_verification(session):
    assert verify_password("anything", None) is False
    assert verify_password(PASSWORD, hash_password(PASSWORD)) is True
