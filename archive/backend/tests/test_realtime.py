"""The socket carries job progress, so prove it refuses strangers and survives closed tabs."""

import asyncio
from contextlib import contextmanager
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.auth.service import AuthService
from app.core.security import create_access_token
from app.db.base import get_session_scope
from app.realtime.hub import ConnectionHub, hub
from app.realtime.router import router as realtime_router

EMAIL = "socket@example.com"
PASSWORD = "correct-horse-battery"
MESSAGE = {"type": "import.progress", "percent": 42}


@pytest.fixture
def client(session):
    """The socket app plus a publish hook, so a job can be simulated on the server's own loop."""
    app = FastAPI()
    app.include_router(realtime_router)

    @contextmanager
    def scope():
        yield session

    app.dependency_overrides[get_session_scope] = lambda: scope

    @app.post("/publish/{user_id}")
    async def publish(user_id: UUID) -> dict[str, int]:
        await hub.publish(user_id, MESSAGE)
        return {"connections": hub.count(user_id)}

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def user(session):
    return AuthService(session).register(EMAIL, PASSWORD)


@pytest.fixture
def token(session, user) -> str:
    return AuthService(session).issue_token(user)


def _assert_rejected(client, url: str) -> None:
    with pytest.raises(WebSocketDisconnect) as rejection:
        with client.websocket_connect(url):
            pass
    assert rejection.value.code == 1008


def test_connection_without_a_token_is_rejected(client):
    _assert_rejected(client, "/ws")


def test_connection_with_a_garbage_token_is_rejected(client):
    _assert_rejected(client, "/ws?token=not-a-token")


def test_connection_for_a_user_that_no_longer_exists_is_rejected(client):
    _assert_rejected(client, f"/ws?token={create_access_token(uuid4())}")


def test_a_valid_token_receives_published_messages(client, user, token):
    with client.websocket_connect(f"/ws?token={token}") as socket:
        assert client.post(f"/publish/{user.id}").json() == {"connections": 1}
        assert socket.receive_json() == MESSAGE


def test_every_tab_of_the_same_user_receives_the_message(client, user, token):
    url = f"/ws?token={token}"
    with client.websocket_connect(url) as first, client.websocket_connect(url) as second:
        assert client.post(f"/publish/{user.id}").json() == {"connections": 2}
        assert first.receive_json() == MESSAGE
        assert second.receive_json() == MESSAGE


def test_publishing_to_a_user_with_no_connections_is_a_noop(client):
    assert client.post(f"/publish/{uuid4()}").json() == {"connections": 0}


def test_a_closed_socket_leaves_the_registry(client, user, token):
    with client.websocket_connect(f"/ws?token={token}"):
        assert hub.count(user.id) == 1
    assert hub.count(user.id) == 0


def test_publish_drops_a_socket_that_cannot_be_written_to():
    class DeadSocket:
        async def send_json(self, message: dict[str, int]) -> None:
            raise RuntimeError("socket is closing")

    async def scenario() -> int:
        local = ConnectionHub()
        user_id = uuid4()
        await local.connect(user_id, DeadSocket())  # type: ignore[arg-type]
        await local.publish(user_id, MESSAGE)
        return local.count(user_id)

    assert asyncio.run(scenario()) == 0


def test_the_session_is_released_before_the_socket_loop(session, user, token):
    """The point of the scope: a socket open for hours must not pin a pooled connection."""
    events: list[str] = []

    @contextmanager
    def scope():
        events.append("enter")
        try:
            yield session
        finally:
            events.append("exit")

    app = FastAPI()
    app.include_router(realtime_router)
    app.dependency_overrides[get_session_scope] = lambda: scope

    with TestClient(app) as socket_client, socket_client.websocket_connect(f"/ws?token={token}"):
        assert events == ["enter", "exit"]
