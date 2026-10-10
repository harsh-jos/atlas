"""A reachable API alone must not advertise that chat execution is ready."""

import asyncio
from time import monotonic
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app import main
from app.agent.worker import WorkerHealth


def test_worker_health_expires_and_can_recover():
    health = WorkerHealth()
    assert not health.ready()
    health.tick()
    assert health.ready()
    health.last_seen = monotonic() - 1000
    assert not health.ready()
    health.tick()
    health.available = False
    assert not health.ready()
    health.tick()
    assert health.ready()


def test_health_refuses_dead_or_unready_worker(monkeypatch):
    client = TestClient(main.app)
    monkeypatch.setattr(main.app.state, "worker", SimpleNamespace(done=lambda: True), raising=False)
    monkeypatch.setattr(main.app.state, "worker_health", WorkerHealth(), raising=False)
    result = client.get("/healthz")
    assert result.status_code == 503
    assert result.json()["code"] == "worker_unavailable"
    assert client.get("/livez").status_code == 200


def test_lifespan_starts_and_stops_worker(monkeypatch):
    stopped = []

    async def idle(health):
        health.tick()
        try:
            await asyncio.Event().wait()
        finally:
            stopped.append(True)

    async def prepared():
        pass

    monkeypatch.setattr(main, "prepare_database", prepared)
    monkeypatch.setattr(main, "run_worker", idle)
    with TestClient(main.app):
        assert main.app.state.worker_health.ready()
        assert not main.app.state.worker.done()
    assert stopped and main.app.state.worker.done()


def test_failed_schema_setup_prevents_startup(monkeypatch):
    async def failed():
        raise RuntimeError("schema not ready")
    monkeypatch.setattr(main, "prepare_database", failed)
    import pytest
    with pytest.raises(RuntimeError, match="schema not ready"):
        with TestClient(main.app):
            pass
    assert not main.app.state.schema_ready
