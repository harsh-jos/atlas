"""Curation is the spine: choosing a subset must be honoured exactly, and scoped to its owner."""

from contextlib import contextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.api.previews import router as previews_router
from app.auth.service import AuthService
from app.core.enums import SourceType
from app.db.base import get_session, get_session_scope
from app.db.models import Artifact, Preview
from app.pipeline.build import build_import
from app.pipeline.parsing.markdown_parser import parse_markdown
from app.pipeline.preview import PreviewService

PASSWORD = "correct-horse-battery"
SAMPLE = """# Vector Search

An overview of searching by meaning rather than by exact keyword matching alone.

## HNSW

Hierarchical navigable small worlds, the index most vector databases reach for by default.

## IVF

Inverted file indexes partition the space into cells and search only the nearest few of them.

## PQ

Product quantisation compresses vectors into codes so far more of them fit in memory at once.
"""


@pytest.fixture
def client(session):
    @contextmanager
    def scope():
        yield session

    app = FastAPI()
    app.include_router(previews_router)
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_session_scope] = lambda: scope
    with TestClient(app) as test_client:
        yield test_client


def _account(session, email: str):
    service = AuthService(session)
    user = service.register(email, PASSWORD)
    return {"Authorization": f"Bearer {service.issue_token(user)}"}, user


def _park(session, user) -> Preview:
    doc = parse_markdown(SAMPLE, fallback_title="Vector Search", source_type=SourceType.DOCS)
    mapped = build_import(
        doc, concept_name="Vector Search", scope="test-scope", min_artifact_chars=1
    )
    return PreviewService(session, user).park(mapped, scope="test-scope")


@pytest.fixture
def owner(session):
    return _account(session, "curator@example.com")


@pytest.fixture
def stranger(session):
    headers, _ = _account(session, "stranger@example.com")
    return headers


def _count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model))


def test_curation_requires_a_session(client, session, owner):
    preview = _park(session, owner[1])
    assert client.get("/previews").status_code == 401
    assert client.get(f"/previews/{preview.id}").status_code == 401


def test_pending_previews_are_listed(client, session, owner):
    _park(session, owner[1])
    body = client.get("/previews", headers=owner[0]).json()
    assert len(body) == 1
    assert body[0]["conceptName"] == "Vector Search"
    assert body[0]["artifactCount"] > 1
    assert body[0]["totalBytes"] > 0


def test_detail_lists_every_proposed_artifact(client, session, owner):
    preview = _park(session, owner[1])
    body = client.get(f"/previews/{preview.id}", headers=owner[0]).json()
    assert len(body["artifacts"]) > 1
    assert all(item["sourceKey"] and item["title"] for item in body["artifacts"])
    assert body["alreadyKnown"] == []


def test_committing_a_subset_writes_only_the_chosen(client, session, owner):
    preview = _park(session, owner[1])
    artifacts = client.get(f"/previews/{preview.id}", headers=owner[0]).json()["artifacts"]
    chosen = [artifacts[0]["sourceKey"], artifacts[1]["sourceKey"]]

    summary = client.post(
        f"/previews/{preview.id}/commit", json={"source_keys": chosen}, headers=owner[0]
    ).json()

    assert summary["artifacts"] == 2
    assert _count(session, Artifact) == 2
    assert _count(session, Preview) == 0


def test_an_empty_selection_is_refused_rather_than_read_as_all(client, session, owner):
    preview = _park(session, owner[1])
    response = client.post(
        f"/previews/{preview.id}/commit", json={"source_keys": []}, headers=owner[0]
    )
    assert response.status_code == 400
    assert _count(session, Artifact) == 0
    assert _count(session, Preview) == 1


def test_discarding_writes_nothing(client, session, owner):
    preview = _park(session, owner[1])
    assert client.delete(f"/previews/{preview.id}", headers=owner[0]).status_code == 204
    assert _count(session, Preview) == 0
    assert _count(session, Artifact) == 0


def test_already_known_surfaces_on_a_second_preview(client, session, owner):
    first = _park(session, owner[1])
    keys = [
        a["sourceKey"]
        for a in client.get(f"/previews/{first.id}", headers=owner[0]).json()["artifacts"]
    ]
    client.post(f"/previews/{first.id}/commit", json={"source_keys": keys}, headers=owner[0])

    second = _park(session, owner[1])
    body = client.get(f"/previews/{second.id}", headers=owner[0]).json()
    assert body["alreadyKnown"], "a repeat import must warn about what is already held"


def test_a_stranger_cannot_see_or_commit_another_users_preview(client, session, owner, stranger):
    preview = _park(session, owner[1])

    assert client.get("/previews", headers=stranger).json() == []
    assert client.get(f"/previews/{preview.id}", headers=stranger).status_code == 404
    assert client.delete(f"/previews/{preview.id}", headers=stranger).status_code == 404
    assert (
        client.post(
            f"/previews/{preview.id}/commit", json={"source_keys": ["x"]}, headers=stranger
        ).status_code
        == 404
    )
    assert _count(session, Preview) == 1
