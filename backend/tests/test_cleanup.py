"""Checks that retained entry points work without retired import services."""

import asyncio
from contextlib import contextmanager
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.agent import toolkit
from app.main import app


@pytest.mark.parametrize("path", ["/kb/builds", "/llm/providers", "/imports", "/previews", "/links/propose"])
def test_retired_endpoints_are_not_served(path):
    client = TestClient(app)
    assert client.get(path).status_code == 404
    assert client.post(path, json={}).status_code == 404


def test_saved_search_is_scoped_to_the_current_user(monkeypatch):
    user_id = uuid4()
    database = object()

    @contextmanager
    def scope():
        yield database

    def search(session, owner, query):
        assert session is database
        assert owner == user_id
        assert query == "tensors"
        return [{"title": "Tensors"}]

    monkeypatch.setattr(toolkit, "search_artifacts", search)
    tool, = toolkit.build_toolkit(scope, user_id)
    assert asyncio.run(tool("tensors")) == {"results": [{"title": "Tensors"}]}


def test_saved_search_failure_is_not_reported_as_empty_results(monkeypatch):
    @contextmanager
    def scope():
        raise RuntimeError("private database details")
        yield

    tool, = toolkit.build_toolkit(scope, uuid4())
    result = asyncio.run(tool("tensors"))
    assert "error" in result
    assert "results" not in result
    assert "private database details" not in result["error"]
