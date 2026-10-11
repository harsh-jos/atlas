"""Scale-to-zero readiness does not depend on a background process."""

import pytest
from fastapi.testclient import TestClient
from app import main


def test_health_refuses_unprepared_schema(monkeypatch):
    monkeypatch.setattr(main.app.state, "schema_ready", False, raising=False)
    client = TestClient(main.app)
    result = client.get("/healthz")
    assert result.status_code == 503
    assert result.json()["code"] == "schema_unavailable"
    assert client.get("/livez").status_code == 200


def test_lifespan_prepares_without_a_worker(monkeypatch):
    async def prepared():
        pass
    monkeypatch.setattr(main, "prepare_database", prepared)
    with TestClient(main.app):
        assert main.app.state.schema_ready
        assert not hasattr(main.app.state, "worker")
    assert not main.app.state.schema_ready


def test_failed_schema_setup_prevents_startup(monkeypatch):
    async def failed():
        raise RuntimeError("schema not ready")
    monkeypatch.setattr(main, "prepare_database", failed)
    with pytest.raises(RuntimeError, match="schema not ready"):
        with TestClient(main.app):
            pass
    assert not main.app.state.schema_ready
