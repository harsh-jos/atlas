"""The chat route must refuse strangers and fail honestly when the agent is not configured."""

import pytest
from uuid import uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.agent.router import router as agent_router
from app.auth.service import AuthService
from app.core.config import get_settings
from app.db.base import get_session_scope

EMAIL = "chat@example.com"
PASSWORD = "correct-horse-battery"
BODY = {"session_id": "s1", "message": "hello", "request_id": str(uuid4())}


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


def test_chat_accepts_and_persists_before_reply(client, token, monkeypatch):
    monkeypatch.setattr(get_settings(), "vertex_project", "test-only")
    response = client.post("/agent/chat", json=BODY, headers=_auth(token))
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued" and data["reply"] is None
    assert client.get(f'/agent/turns/{data["id"]}', headers=_auth(token)).json() == data


def test_retry_returns_same_turn_and_conflicting_message_is_rejected(client, token, monkeypatch):
    monkeypatch.setattr(get_settings(), "vertex_project", "test-only")
    first = client.post("/agent/chat", json=BODY, headers=_auth(token)).json()
    assert client.post("/agent/chat", json=BODY, headers=_auth(token)).json() == first
    changed = {**BODY, "message": "different"}
    assert client.post("/agent/chat", json=changed, headers=_auth(token)).status_code == 409
    second = {**BODY, "request_id": str(uuid4())}
    assert client.post("/agent/chat", json=second, headers=_auth(token)).status_code == 409


def test_turn_status_requires_auth_and_hides_other_owners(client, session, token, monkeypatch):
    monkeypatch.setattr(get_settings(), "vertex_project", "test-only")
    turn = client.post("/agent/chat", json=BODY, headers=_auth(token)).json()
    path = f'/agent/turns/{turn["id"]}'
    assert client.get(path).status_code == 401
    auth = AuthService(session)
    stranger = auth.issue_token(auth.register("other-chat@example.com", PASSWORD))
    assert client.get(path, headers=_auth(stranger)).status_code == 404


def test_reopened_chat_shows_queued_message_then_completed_reply(client, token, monkeypatch):
    from app.agent.turns import TurnStore
    from app.agent.session import HistoryMessage

    monkeypatch.setattr(get_settings(), "vertex_project", "test-only")

    async def legacy(*args):
        return [HistoryMessage("you", "Old question."), HistoryMessage("atlas", "Old reply.")]

    monkeypatch.setattr("app.agent.router.load_history", legacy)
    accepted = client.post("/agent/chat", json=BODY, headers=_auth(token)).json()
    snapshot = client.get("/agent/chat/s1", headers=_auth(token)).json()
    assert snapshot["latestTurn"]["status"] == "queued"
    assert snapshot["messages"][-1] == {"role": "you", "text": "hello"}
    store = TurnStore(client.app.dependency_overrides[get_session_scope]())
    claimed = store.claim(300)
    assert str(claimed["id"]) == accepted["id"]
    store.finish(claimed["id"], "completed", reply="A recovered reply.")
    snapshot = client.get("/agent/chat/s1", headers=_auth(token)).json()
    assert snapshot["latestTurn"]["status"] == "completed"
    assert [message["text"] for message in snapshot["messages"]] == [
        "Old question.", "Old reply.", "hello", "A recovered reply."
    ]


def test_history_requires_a_token(client):
    assert client.get("/agent/chat/s1").status_code == 401


def test_history_of_an_unknown_session_is_empty(client, token, monkeypatch):
    async def none(user_id, session_id):
        return []

    monkeypatch.setattr("app.agent.router.load_history", none)

    response = client.get("/agent/chat/never-started", headers=_auth(token))
    assert response.status_code == 200
    assert response.json() == {"sessionId": "never-started", "messages": [], "latestTurn": None}


def test_history_replays_prior_turns(client, token, monkeypatch):
    from app.agent.session import HistoryMessage

    async def stored(user_id, session_id):
        return [HistoryMessage("you", "what is a monad"), HistoryMessage("atlas", "a burrito")]

    monkeypatch.setattr("app.agent.router.load_history", stored)

    response = client.get("/agent/chat/s1", headers=_auth(token))
    assert response.status_code == 200
    assert response.json() == {
        "sessionId": "s1",
        "messages": [
            {"role": "you", "text": "what is a monad"},
            {"role": "atlas", "text": "a burrito"},
        ],
        "latestTurn": None,
    }


def test_sessions_requires_a_token(client):
    assert client.get("/agent/sessions").status_code == 401


def test_sessions_lists_past_conversations_latest_first(client, token, monkeypatch):
    from datetime import datetime, timezone

    from app.agent.session import SessionSummary

    async def stored(user_id):
        return [
            SessionSummary("s2", "second question", datetime(2026, 1, 2, tzinfo=timezone.utc)),
            SessionSummary("s1", "what is a monad", datetime(2026, 1, 1, tzinfo=timezone.utc)),
        ]

    monkeypatch.setattr("app.agent.router.load_chat_sessions", stored)

    response = client.get("/agent/sessions", headers=_auth(token))
    assert response.status_code == 200
    assert response.json() == [
        {"sessionId": "s2", "firstMessage": "second question", "updatedAt": "2026-01-02T00:00:00Z"},
        {"sessionId": "s1", "firstMessage": "what is a monad", "updatedAt": "2026-01-01T00:00:00Z"},
    ]


def test_sessions_reports_a_session_with_no_messages_yet(client, token, monkeypatch):
    from datetime import datetime, timezone

    from app.agent.session import SessionSummary

    async def stored(user_id):
        return [SessionSummary("s1", None, datetime(2026, 1, 1, tzinfo=timezone.utc))]

    monkeypatch.setattr("app.agent.router.load_chat_sessions", stored)

    response = client.get("/agent/sessions", headers=_auth(token))
    assert response.status_code == 200
    assert response.json() == [
        {"sessionId": "s1", "firstMessage": None, "updatedAt": "2026-01-01T00:00:00Z"}
    ]


def test_cancel_requires_auth_hides_other_owners_and_is_idempotent(client, session, token, monkeypatch):
    monkeypatch.setattr(get_settings(), 'vertex_project', 'test-only')
    turn = client.post('/agent/chat', json=BODY, headers=_auth(token)).json()
    path = f'/agent/turns/{turn["id"]}/cancel'
    assert client.post(path).status_code == 401
    auth = AuthService(session)
    stranger = auth.issue_token(auth.register('stop-stranger@example.com', PASSWORD))
    assert client.post(path, headers=_auth(stranger)).status_code == 404
    stopped = client.post(path, headers=_auth(token))
    assert stopped.status_code == 200
    assert stopped.json()['status'] == 'cancelled'
    assert stopped.json()['cancelRequested'] is True
    assert client.post(path, headers=_auth(token)).json() == stopped.json()
