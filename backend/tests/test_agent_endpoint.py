"""The chat route must refuse strangers and fail honestly when the agent is not configured."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.agent import service as service_module
from app.agent.router import router as agent_router
from app.auth.service import AuthService
from app.core.config import get_settings
from app.db.base import get_session_scope

EMAIL = "chat@example.com"
PASSWORD = "correct-horse-battery"
BODY = {"session_id": "s1", "message": "hello"}


@pytest.fixture
def client(session):
    from contextlib import contextmanager

    @contextmanager
    def scope():
        yield session

    app = FastAPI()
    app.include_router(agent_router)
    app.dependency_overrides[get_session_scope] = lambda: scope
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def token(session) -> str:
    service = AuthService(session)
    return service.issue_token(service.register(EMAIL, PASSWORD))


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_chat_requires_a_token(client):
    assert client.post("/agent/chat", json=BODY).status_code == 401


def test_chat_rejects_a_forged_token(client):
    response = client.post("/agent/chat", json=BODY, headers=_auth("not-a-token"))
    assert response.status_code == 401


def test_chat_validates_the_request(client, token):
    response = client.post(
        "/agent/chat", json={"session_id": "", "message": ""}, headers=_auth(token)
    )
    assert response.status_code == 422


def test_chat_reports_an_unconfigured_agent_instead_of_failing_mid_turn(client, token, monkeypatch):
    monkeypatch.setattr(get_settings(), "vertex_project", None)
    response = client.post("/agent/chat", json=BODY, headers=_auth(token))
    assert response.status_code == 503
    assert "VERTEX_PROJECT" in response.json()["detail"]


def test_chat_returns_the_agents_reply(client, token, monkeypatch):
    async def fake_turn(user_id, session_id, message):
        return f"echo:{message}"

    monkeypatch.setattr(service_module, "run_turn", fake_turn)
    monkeypatch.setattr("app.agent.router.run_turn", fake_turn)

    response = client.post("/agent/chat", json=BODY, headers=_auth(token))
    assert response.status_code == 200
    assert response.json() == {"reply": "echo:hello"}
