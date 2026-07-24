"""The agent's tools must work — and refuse — without any model in the loop."""

import asyncio
from contextlib import contextmanager
from uuid import uuid4

import pytest

from app.agent import toolkit as toolkit_module
from app.agent.toolkit import build_toolkit
from app.core.enums import SourceType
from app.db.models import Artifact, User
from app.pipeline.parsing.markdown_parser import parse_markdown
from app.pipeline.sources.base import SourceResult

SAMPLE = """# Vector Search

An overview of searching by meaning rather than by exact keyword matching alone.

## HNSW

Hierarchical navigable small worlds, the index most vector databases reach for by default.

## IVF

Inverted file indexes partition the space into cells and search only the nearest few of them.
"""


@pytest.fixture
def user(session):
    record = User(email="agent@example.com", password_hash="x")
    session.add(record)
    session.flush()
    return record


@pytest.fixture
def tools(session, user, monkeypatch):
    @contextmanager
    def scope():
        yield session

    def fake_load_source(kind: str, params: dict) -> SourceResult:
        doc = parse_markdown(SAMPLE, fallback_title="Vector Search", source_type=SourceType.DOCS)
        return SourceResult(doc=doc, scope="test-scope", suggested_concept="Vector Search")

    monkeypatch.setattr(toolkit_module, "load_source", fake_load_source)
    monkeypatch.setattr(toolkit_module.get_settings(), "min_artifact_chars", 1, raising=False)

    def synchronous(tool):
        def call(*args, **kwargs):
            return asyncio.run(tool(*args, **kwargs))

        call.__doc__ = tool.__doc__
        return call

    search, preview, commit = (synchronous(tool) for tool in build_toolkit(scope, user.id))
    return {"search": search, "preview": preview, "commit": commit}


def test_every_tool_is_documented_for_the_model(tools):
    for tool in tools.values():
        assert tool.__doc__ and len(tool.__doc__.strip()) > 40


def test_search_of_an_empty_knowledge_base_returns_nothing(tools):
    assert tools["search"]("vector index") == {"results": []}


def test_preview_writes_nothing_and_lists_the_artifacts(session, tools, user):
    result = tools["preview"]("https://example.com/docs", "Vector Search")

    assert result["previewId"]
    assert result["artifacts"] and result["totalBytes"] > 0
    assert all("sourceKey" in item for item in result["artifacts"])
    assert session.query(Artifact).filter_by(user_id=user.id).count() == 0


def test_commit_writes_only_the_chosen_artifacts(session, tools, user):
    preview = tools["preview"]("https://example.com/docs", "Vector Search")
    chosen = [preview["artifacts"][0]["sourceKey"]]

    summary = tools["commit"](preview["previewId"], chosen)

    assert summary["artifacts"] == 1
    assert session.query(Artifact).filter_by(user_id=user.id).count() == 1


def test_search_finds_what_was_committed(session, tools):
    preview = tools["preview"]("https://example.com/docs", "Vector Search")
    tools["commit"](preview["previewId"], [])

    hits = tools["search"]("hierarchical navigable small worlds")["results"]
    assert hits
    assert all({"slug", "title", "concept"} <= set(hit) for hit in hits)


def test_commit_refuses_an_unknown_preview(tools, session, user):
    """Refused, but as a value — see test_a_tool_failure_comes_back_as_something_to_say."""
    result = tools["commit"](str(uuid4()), [])
    assert "error" in result
    assert session.query(Artifact).filter_by(user_id=user.id).count() == 0


def test_preview_returns_the_artifact_list_not_just_a_count(tools):
    """A splat once overwrote the list with its length, leaving nothing to curate."""
    result = tools["preview"]("https://example.com/docs", "Vector Search")
    assert isinstance(result["artifacts"], list)
    assert isinstance(result["totalBytes"], int)


def test_preview_reports_what_the_person_already_knows(session, tools):
    """Guaranteed in code, because the model demonstrably skips the separate search tool."""
    first = tools["preview"]("https://example.com/docs", "Vector Search")
    assert first["alreadyKnown"] == []
    tools["commit"](first["previewId"], [])

    second = tools["preview"]("https://example.com/docs", "Vector Search")
    assert second["alreadyKnown"]


def test_a_tool_failure_comes_back_as_something_to_say(tools):
    """A raising tool kills the whole turn, so failure has to be a value the model can relay."""
    result = tools["commit"](str(uuid4()), ["anything"])
    assert result.get("alreadyResolved") is True
    assert "already resolved" in result["error"].lower()


def test_an_unexpected_tool_failure_is_captured_too(tools, monkeypatch):
    monkeypatch.setattr(
        toolkit_module,
        "search_artifacts",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("db gone")),
    )
    result = tools["search"]("anything")
    assert "db gone" in result["error"]
