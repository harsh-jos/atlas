"""The usage endpoint scopes every request to the authenticated owner."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.agent.router import router
from app.auth.deps import get_current_user_id
from app.db.base import get_session_scope


def test_usage_endpoint_returns_only_the_callers_counts(usage_factory, agent_settings):
    store = usage_factory()
    store.reserve("turn1", "gemini", True, agent_settings)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user_id] = lambda: store.user_id
    app.dependency_overrides[get_session_scope] = lambda: store.scope
    client = TestClient(app)
    body = client.get("/agent/chat/s1/usage").json()
    assert body["modelRequests"] == 1
    assert body["unreportedRequests"] == 1
    assert body["unpricedRequests"] == 1
    assert body["estimatedCostMicrousd"] == 0  # Unknown is indicated separately, not priced as free.
    assert "sessionBudgetMicrousd" in body
    app.dependency_overrides[get_current_user_id] = lambda: usage_factory(owner=1).user_id
    assert client.get("/agent/chat/s1/usage").json()["modelRequests"] == 0


def test_usage_requires_authentication(usage_factory):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_session_scope] = lambda: usage_factory().scope
    assert TestClient(app).get("/agent/chat/s1/usage").status_code == 401
