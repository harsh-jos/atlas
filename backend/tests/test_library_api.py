"""The read API is the frontend's only door to the knowledge base — it must scope by owner."""

from contextlib import contextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from knowledge_seed import seed_knowledge

from app.api.library import router as library_router
from app.auth.service import AuthService
from app.db.base import get_session, get_session_scope

PASSWORD = "correct-horse-battery"


@pytest.fixture
def client(session):
    @contextmanager
    def scope():
        yield session

    app = FastAPI()
    app.include_router(library_router)
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_session_scope] = lambda: scope
    with TestClient(app) as test_client:
        yield test_client


def _register(session, email: str) -> tuple[str, object]:
    service = AuthService(session)
    user = service.register(email, PASSWORD)
    return service.issue_token(user), user

@pytest.fixture
def owner(session, client):
    token, user = _register(session, "owner@example.com")
    seed_knowledge(session, user)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def stranger(session):
    token, _ = _register(session, "stranger@example.com")
    return {"Authorization": f"Bearer {token}"}


def test_every_read_endpoint_requires_a_token(client):
    for path in ["/concepts", "/concepts/vector-search", "/artifacts/x", "/graph", "/search?q=a"]:
        assert client.get(path).status_code == 401, path


def test_concepts_are_listed_with_their_size(client, owner):
    body = client.get("/concepts", headers=owner).json()
    assert len(body) == 1
    assert body[0]["slug"] == "vector-search"
    assert body[0]["artifactCount"] > 0
    assert body[0]["recentArtifactTitle"]


def test_concept_detail_paginates_and_lists_tags(client, owner):
    body = client.get("/concepts/vector-search", headers=owner).json()
    assert body["concept"]["slug"] == "vector-search"
    assert body["artifacts"] and body["matched"] == body["concept"]["artifactCount"]
    assert isinstance(body["tags"], list)
    assert body["page"] == 1


def test_artifact_detail_carries_sources_and_relations(client, owner):
    slug = client.get("/concepts/vector-search", headers=owner).json()["artifacts"][0]["slug"]
    body = client.get(f"/artifacts/{slug}", headers=owner).json()
    assert body["slug"] == slug
    assert body["concept"]["name"] == "Vector Search"
    assert isinstance(body["sources"], list)
    assert isinstance(body["relationsFrom"], list)
    assert isinstance(body["relationsTo"], list)


def test_graph_returns_nodes_and_links(client, owner):
    body = client.get("/graph", headers=owner).json()
    assert body["nodes"]
    node_ids = {node["id"] for node in body["nodes"]}
    for link in body["links"]:
        assert link["source"] in node_ids and link["target"] in node_ids


def test_search_finds_the_users_own_artifacts(client, owner):
    hits = client.get("/search", params={"q": "hierarchical navigable"}, headers=owner).json()
    assert hits and hits[0]["concept"] == "Vector Search"


def test_a_stranger_sees_an_empty_knowledge_base(client, owner, stranger):
    assert client.get("/concepts", headers=stranger).json() == []
    assert client.get("/graph", headers=stranger).json()["nodes"] == []
    assert client.get("/search", params={"q": "hierarchical"}, headers=stranger).json() == []


def test_a_stranger_cannot_read_another_users_concept(client, owner, stranger):
    assert client.get("/concepts/vector-search", headers=stranger).status_code == 404


def test_a_stranger_cannot_read_another_users_artifact(client, owner, stranger):
    slug = client.get("/concepts/vector-search", headers=owner).json()["artifacts"][0]["slug"]
    assert client.get(f"/artifacts/{slug}", headers=stranger).status_code == 404


def test_graph_links_say_who_drew_them(client, owner):
    """The graph is where automatic edges get removed, so it must distinguish them."""
    body = client.get("/graph", headers=owner).json()
    assert body["links"]
    assert all(link["origin"] in {"HUMAN", "AI"} for link in body["links"])


def test_search_results_carry_what_a_row_needs_to_render(client, owner):
    """Migrating to the API stripped these; a bare title and summary is not a result row."""
    hit = client.get("/search", params={"q": "hierarchical navigable"}, headers=owner).json()[0]
    assert hit["excerpt"], "the reader should see why a result matched"
    assert isinstance(hit["tags"], list)
    assert isinstance(hit["sourceCount"], int)
    assert hit["updatedAt"]
    assert "conceptColor" in hit
