"""The agent's durable memory preserves ownership, quota, and retry semantics."""

import asyncio
from contextlib import contextmanager

import pytest
from sqlalchemy import func, select

from app.agent import knowledge as kb
from app.agent.toolkit import build_toolkit
from app.core.config import get_settings
from app.db.models import Artifact, Concept, ConceptConnection, User
from app.storage.quota import QuotaExceeded, text_bytes


@pytest.fixture
def owners(session):
    users = [User(email=f"knowledge-{i}@example.com", password_hash="unused") for i in range(2)]
    session.add_all(users)
    session.flush()
    return users


def seed(session, owner):
    a = kb.remember_concept(session, owner.id, "Autograd", "Records operations.")
    b = kb.remember_concept(session, owner.id, "Gradient", "How an output changes.")
    return a, b


def save(session, owner, slug):
    return kb.save_explanation(
        session,
        owner.id,
        slug,
        "What does autograd record?",
        "It records operations.",
        "For example, y = x * x.",
        ["https://docs.pytorch.org/docs/stable/notes/autograd.html"],
        user_requested=True,
    )


def test_concept_connections_are_owned_directional_and_retry_safe(session, owners):
    owner, stranger = owners
    a, b = seed(session, owner)
    assert not kb.remember_concept(session, owner.id, "Autograd", "Different text.")["created"]
    edge = kb.connect_concepts(
        session, owner.id, a["slug"], b["slug"], "requires", "A gradient is the result."
    )
    assert not kb.connect_concepts(session, owner.id, a["slug"], b["slug"], "requires", "Again.")[
        "created"
    ]
    graph = kb.neighbourhood(session, owner.id, b["slug"])
    assert graph["connections"][0]["direction"] == "incoming"
    assert graph["connections"][0]["connection_id"] == edge["id"]
    assert kb.neighbourhood(session, stranger.id)["concepts"] == []
    with pytest.raises(ValueError, match="not found"):
        kb.neighbourhood(session, stranger.id, a["slug"])
    with pytest.raises(ValueError, match="not found"):
        kb.connect_concepts(session, stranger.id, a["slug"], b["slug"], "requires", "No.")
    with pytest.raises(ValueError, match="itself"):
        kb.connect_concepts(session, owner.id, a["slug"], a["slug"], "requires", "No.")
    with pytest.raises(ValueError, match="kind"):
        kb.connect_concepts(session, owner.id, a["slug"], b["slug"], "mastered", "No.")
    kb.connect_concepts(session, owner.id, a["slug"], b["slug"], "related_to", "Nearby ideas.")
    reverse = kb.connect_concepts(session, owner.id, b["slug"], a["slug"], "related_to", "Again.")
    assert not reverse["created"]
    assert session.scalar(select(func.count()).select_from(ConceptConnection)) == 2


def test_save_read_revise_reuses_reader_and_charges_quota(session, owners):
    owner, stranger = owners
    a, _ = seed(session, owner)
    first = save(session, owner, a["slug"])
    assert first["created"]
    assert not save(session, owner, a["slug"])["created"]
    assert session.scalar(select(func.count()).select_from(Artifact)) == 1
    original = kb.read_explanation(session, owner.id, first["slug"])
    assert len(original["sources"]) == 1
    assert original["url"] == first["url"]
    assert kb.neighbourhood(session, owner.id, a["slug"])["explanations"][0]["kind"] == "explains"
    session.refresh(owner)
    assert owner.storage_bytes == text_bytes(original["body"], original["summary"])
    result = kb.revise_explanation(
        session, owner.id, first["slug"], original["updated_at"], "New example.", "Short.", True
    )
    assert result["updated_at"] != original["updated_at"]
    with pytest.raises(ValueError, match="changed"):
        kb.revise_explanation(
            session, owner.id, first["slug"], original["updated_at"], "Stale.", "Stale.", True
        )
    with pytest.raises(ValueError, match="not found"):
        kb.read_explanation(session, stranger.id, first["slug"])
    with pytest.raises(ValueError, match="not found"):
        kb.revise_explanation(
            session, stranger.id, first["slug"], result["updated_at"], "No.", "No.", True
        )
    session.refresh(owner)
    assert owner.storage_bytes == text_bytes("New example.", "Short.")


def test_invalid_sources_and_quota_leave_no_artifact(session, owners, monkeypatch):
    owner = owners[0]
    a, _ = seed(session, owner)
    with pytest.raises(ValueError, match="HTTP"):
        kb.save_explanation(session, owner.id, a["slug"], "Q", "S", "B", ["javascript:alert(1)"])
    monkeypatch.setattr(get_settings(), "storage_quota_bytes", 1)
    with pytest.raises(QuotaExceeded):
        save(session, owner, a["slug"])
    assert session.scalar(select(func.count()).select_from(Artifact)) == 0
    assert owner.storage_bytes == 0


def test_bounded_graph_and_non_latin_concepts(session, owners):
    owner = owners[0]
    for i in range(22):
        kb.remember_concept(session, owner.id, f"概念 {i}", "Description.")
    graph = kb.neighbourhood(session, owner.id)
    assert len(graph["concepts"]) == 20
    assert graph["has_more"]
    assert session.scalar(select(func.count()).select_from(Concept)) == 22


def test_tool_errors_are_explicit_and_all_tools_have_adk_schemas(session, owners):
    from google.adk.tools import FunctionTool

    @contextmanager
    def scope():
        yield session

    toolkit = build_toolkit(scope, owners[0].id)
    for tool in toolkit:
        declaration = FunctionTool(tool)._get_declaration()
        assert declaration.parameters is not None or declaration.parameters_json_schema
    tools = {tool.__name__: tool for tool in toolkit}
    result = asyncio.run(tools["read_saved_explanation"]("missing"))
    assert "error" in result


def test_memory_opt_out_blocks_writes_but_keeps_inspection_and_explicit_saves(session, owners):
    owner, stranger = owners
    a, b = seed(session, owner)
    kb.set_preferences(session, owner.id, False, None)
    session.expire_all()
    assert kb.preferences(session, owner.id) == {"memory_enabled": False, "auto_save": False}
    assert kb.preferences(session, stranger.id) == {"memory_enabled": True, "auto_save": False}
    with pytest.raises(ValueError, match="disabled"):
        kb.remember_concept(session, owner.id, "Tensor", "An array.")
    with pytest.raises(ValueError, match="disabled"):
        kb.connect_concepts(session, owner.id, a["slug"], b["slug"], "requires", "Reason.")
    assert len(kb.neighbourhood(session, owner.id)["concepts"]) == 2
    assert save(session, owner, a["slug"])["created"]
    kb.set_preferences(session, owner.id, True, None)
    assert kb.remember_concept(session, owner.id, "Tensor", "An array.")["created"]


def test_saving_agreement_is_separate_from_one_time_consent_and_can_be_revoked(session, owners):
    owner = owners[0]
    a, _ = seed(session, owner)
    args = (session, owner.id, a["slug"], "One question", "Summary", "Example", [])
    with pytest.raises(ValueError, match="user request"):
        kb.save_explanation(*args)
    saved = kb.save_explanation(*args, user_requested=True)
    assert not kb.preferences(session, owner.id)["auto_save"]
    original = kb.read_explanation(session, owner.id, saved["slug"])
    with pytest.raises(ValueError, match="user request"):
        kb.revise_explanation(session, owner.id, saved["slug"], original["updated_at"], "New", "Short")
    kb.set_preferences(session, owner.id, None, True)
    assert not kb.save_explanation(*args)["created"]
    kb.revise_explanation(session, owner.id, saved["slug"], original["updated_at"], "New", "Short")
    kb.set_preferences(session, owner.id, None, False)
    with pytest.raises(ValueError, match="user request"):
        kb.save_explanation(*args)


def test_connection_removal_is_owned_and_remains_available_when_memory_disabled(session, owners):
    owner, stranger = owners
    a, b = seed(session, owner)
    edge = kb.connect_concepts(session, owner.id, a["slug"], b["slug"], "related_to", "Reason")
    with pytest.raises(ValueError, match="not found"):
        kb.remove_connection(session, stranger.id, edge["id"])
    kb.set_preferences(session, owner.id, False, None)
    assert kb.remove_connection(session, owner.id, edge["id"])["removed"]
    assert kb.neighbourhood(session, owner.id, a["slug"])["connections"] == []
    assert len(kb.neighbourhood(session, owner.id)["concepts"]) == 2
