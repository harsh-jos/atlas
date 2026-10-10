"""The write API mutates the knowledge base — it must scope by owner and charge honestly."""

from contextlib import contextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from knowledge_seed import seed_knowledge

from app.api.library import router as library_router
from app.api.writes import router as writes_router
from app.auth.service import AuthService
from app.core.config import get_settings
from app.db.base import get_session, get_session_scope

PASSWORD = "correct-horse-battery"


@pytest.fixture
def client(session):
    @contextmanager
    def scope():
        yield session

    app = FastAPI()
    app.include_router(library_router)
    app.include_router(writes_router)
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_session_scope] = lambda: scope
    with TestClient(app) as test_client:
        yield test_client


def _register(session, email: str) -> tuple[str, object]:
    service = AuthService(session)
    user = service.register(email, PASSWORD)
    return service.issue_token(user), user

@pytest.fixture
def owner_user(session, client):
    token, user = _register(session, "owner@example.com")
    seed_knowledge(session, user)
    return user, {"Authorization": f"Bearer {token}"}


@pytest.fixture
def owner(owner_user):
    return owner_user[1]


@pytest.fixture
def stranger_user(session):
    token, user = _register(session, "stranger@example.com")
    return user, {"Authorization": f"Bearer {token}"}


@pytest.fixture
def stranger(stranger_user):
    return stranger_user[1]


def _slugs(client, headers) -> list[str]:
    body = client.get("/concepts/vector-search", headers=headers).json()
    return [artifact["slug"] for artifact in body["artifacts"]]


def _slug(client, headers) -> str:
    return _slugs(client, headers)[0]


def test_every_write_endpoint_requires_a_token(client):
    calls = [
        ("PATCH", "/artifacts/x", {}),
        ("DELETE", "/artifacts/x", None),
        ("PATCH", "/concepts/x", {}),
        ("DELETE", "/concepts/x", None),
        ("PUT", "/artifacts/x/sources", []),
        ("POST", "/artifacts/x/relations", {"toSlug": "y", "relationType": "SEE_ALSO"}),
        ("DELETE", "/artifacts/x/relations", {"toSlug": "y", "relationType": "SEE_ALSO"}),
        ("GET", "/artifacts", None),
    ]
    for method, path, body in calls:
        assert client.request(method, path, json=body).status_code == 401, path


def test_editing_an_artifact_updates_its_fields(client, owner):
    slug = _slug(client, owner)
    body = client.patch(
        f"/artifacts/{slug}",
        json={"title": "Rewritten", "summary": "New summary", "tags": ["edited"]},
        headers=owner,
    ).json()
    assert body["title"] == "Rewritten"
    assert body["summary"] == "New summary"
    assert body["tags"] == ["edited"]


def test_renaming_an_artifact_keeps_its_slug(client, owner):
    slug = _slug(client, owner)
    body = client.patch(f"/artifacts/{slug}", json={"title": "A Whole New Name"}, headers=owner)
    assert body.json()["slug"] == slug
    assert client.get(f"/artifacts/{slug}", headers=owner).status_code == 200


def test_an_artifact_can_be_moved_to_another_concept(client, session, owner_user):
    user, headers = owner_user
    seed_knowledge(session, user, "Indexing")
    concept = client.get("/concepts/indexing", headers=headers).json()["concept"]
    slug = _slug(client, headers)
    body = client.patch(f"/artifacts/{slug}", json={"conceptId": concept["id"]}, headers=headers)
    assert body.json()["concept"]["slug"] == "indexing"


def test_moving_an_artifact_into_another_users_concept_is_not_found(
    client, session, owner, stranger_user
):
    stranger, stranger_headers = stranger_user
    seed_knowledge(session, stranger, "Theirs")
    concept = client.get("/concepts/theirs", headers=stranger_headers).json()["concept"]
    slug = _slug(client, owner)
    response = client.patch(f"/artifacts/{slug}", json={"conceptId": concept["id"]}, headers=owner)
    assert response.status_code == 404


def test_an_edit_over_quota_is_rejected_and_writes_nothing(client, owner, monkeypatch):
    monkeypatch.setattr(get_settings(), "storage_quota_bytes", 1)
    slug = _slug(client, owner)
    before = client.get(f"/artifacts/{slug}", headers=owner).json()

    response = client.patch(f"/artifacts/{slug}", json={"body": "x" * 5000}, headers=owner)
    assert response.status_code == 413
    assert "available" in response.json()["detail"]
    assert client.get(f"/artifacts/{slug}", headers=owner).json()["body"] == before["body"]


def test_shrinking_an_artifact_gives_bytes_back(client, owner_user, session):
    user, headers = owner_user
    slug = _slug(client, headers)
    session.refresh(user)
    before = user.storage_bytes

    edit = client.patch(f"/artifacts/{slug}", json={"body": "tiny"}, headers=headers)
    assert edit.status_code == 200
    session.refresh(user)
    assert user.storage_bytes < before


def test_deleting_an_artifact_removes_it_and_releases_its_bytes(client, owner_user, session):
    user, headers = owner_user
    slug = _slug(client, headers)
    session.refresh(user)
    before = user.storage_bytes

    assert client.delete(f"/artifacts/{slug}", headers=headers).status_code == 204
    assert client.get(f"/artifacts/{slug}", headers=headers).status_code == 404
    session.refresh(user)
    assert user.storage_bytes < before


def test_editing_a_concept_updates_it_and_keeps_its_slug(client, owner):
    body = client.patch(
        "/concepts/vector-search",
        json={"name": "Vectors", "overview": "How search by meaning works."},
        headers=owner,
    ).json()
    assert body["name"] == "Vectors"
    assert body["overview"] == "How search by meaning works."
    assert body["slug"] == "vector-search"
    assert body["artifactCount"] > 0


def test_deleting_a_concept_takes_its_artifacts_and_their_bytes(client, owner_user, session):
    user, headers = owner_user
    slug = _slug(client, headers)

    assert client.delete("/concepts/vector-search", headers=headers).status_code == 204
    assert client.get("/concepts/vector-search", headers=headers).status_code == 404
    assert client.get(f"/artifacts/{slug}", headers=headers).status_code == 404
    session.refresh(user)
    assert user.storage_bytes == 0


def test_putting_sources_replaces_the_whole_set(client, owner):
    slug = _slug(client, owner)
    sources = [
        {"sourceType": "PAPER", "title": "HNSW", "author": "Malkov", "url": "https://x.test"},
        {"sourceType": "DOCS", "title": "pgvector"},
    ]
    body = client.put(f"/artifacts/{slug}/sources", json=sources, headers=owner).json()
    assert [source["title"] for source in body["sources"]] == ["HNSW", "pgvector"]

    replaced = client.put(f"/artifacts/{slug}/sources", json=sources[:1], headers=owner).json()
    assert [source["title"] for source in replaced["sources"]] == ["HNSW"]


def test_a_hand_made_relation_is_human_and_shows_on_both_ends(client, owner):
    first, second = _slugs(client, owner)[:2]
    created = client.post(
        f"/artifacts/{first}/relations",
        json={"toSlug": second, "relationType": "SEE_ALSO", "note": "related"},
        headers=owner,
    )
    assert created.status_code == 201
    assert created.json()["origin"] == "HUMAN"
    assert created.json()["artifact"]["slug"] == second

    outgoing = client.get(f"/artifacts/{first}", headers=owner).json()["relationsFrom"]
    incoming = client.get(f"/artifacts/{second}", headers=owner).json()["relationsTo"]
    assert any(edge["artifact"]["slug"] == second for edge in outgoing)
    assert any(edge["artifact"]["slug"] == first for edge in incoming)


def test_relating_an_artifact_to_itself_is_rejected(client, owner):
    slug = _slug(client, owner)
    response = client.post(
        f"/artifacts/{slug}/relations",
        json={"toSlug": slug, "relationType": "SEE_ALSO"},
        headers=owner,
    )
    assert response.status_code == 400


def test_repeating_a_relation_is_a_no_op(client, owner):
    first, second = _slugs(client, owner)[:2]
    payload = {"toSlug": second, "relationType": "SEE_ALSO"}
    for _ in range(2):
        repeat = client.post(f"/artifacts/{first}/relations", json=payload, headers=owner)
        assert repeat.status_code == 201

    edges = client.get(f"/artifacts/{first}", headers=owner).json()["relationsFrom"]
    assert len([edge for edge in edges if edge["artifact"]["slug"] == second]) == 1


def test_relating_to_another_users_artifact_is_not_found(client, owner, stranger, session):
    _, stranger_user = _register(session, "third@example.com")
    seed_knowledge(session, stranger_user, name="Their Notes")
    mine = _slug(client, owner)
    theirs = client.get("/concepts/their-notes", headers=stranger).status_code

    assert theirs == 404
    response = client.post(
        f"/artifacts/{mine}/relations",
        json={"toSlug": "their-notes", "relationType": "SEE_ALSO"},
        headers=owner,
    )
    assert response.status_code == 404


def test_deleting_a_relation_removes_the_edge(client, owner):
    first, second = _slugs(client, owner)[:2]
    payload = {"toSlug": second, "relationType": "SEE_ALSO"}
    client.post(f"/artifacts/{first}/relations", json=payload, headers=owner)

    deleted = client.request("DELETE", f"/artifacts/{first}/relations", json=payload, headers=owner)
    assert deleted.status_code == 204
    edges = client.get(f"/artifacts/{first}", headers=owner).json()["relationsFrom"]
    assert not [edge for edge in edges if edge["artifact"]["slug"] == second]


def test_the_relation_picker_lists_and_filters_the_callers_artifacts(client, owner, stranger):
    options = client.get("/artifacts", headers=owner).json()
    assert options and all(option["conceptName"] == "Vector Search" for option in options)

    filtered = client.get("/artifacts", params={"q": "hnsw", "limit": 5}, headers=owner).json()
    assert [option["title"] for option in filtered] == ["HNSW"]
    assert client.get("/artifacts", headers=stranger).json() == []


def test_no_mutation_reaches_another_users_rows(client, owner, stranger):
    slug = _slug(client, owner)
    edge = {"toSlug": slug, "relationType": "SEE_ALSO"}
    calls = [
        ("PATCH", f"/artifacts/{slug}", {"title": "hijacked"}),
        ("DELETE", f"/artifacts/{slug}", None),
        ("PATCH", "/concepts/vector-search", {"name": "hijacked"}),
        ("DELETE", "/concepts/vector-search", None),
        ("PUT", f"/artifacts/{slug}/sources", []),
        ("POST", f"/artifacts/{slug}/relations", edge),
        ("DELETE", f"/artifacts/{slug}/relations", edge),
    ]
    for method, path, body in calls:
        response = client.request(method, path, json=body, headers=stranger)
        assert response.status_code == 404, f"{method} {path}"

    assert client.get(f"/artifacts/{slug}", headers=owner).json()["title"] != "hijacked"


def test_concept_neighbourhood_and_removal_are_owned(client, session, owner_user, stranger_user):
    from app.agent.knowledge import remember_concept, connect_concepts

    user, headers = owner_user
    _, other_headers = stranger_user
    a = remember_concept(session, user.id, "Autograd", "Records operations.")
    b = remember_concept(session, user.id, "Gradient", "Describes change.")
    edge = connect_concepts(session, user.id, a["slug"], b["slug"], "requires", "Autograd computes gradients.")
    path = f'/concepts/{a["slug"]}/neighbourhood'
    assert client.get(path, headers=other_headers).status_code == 404
    data = client.get(path, headers=headers).json()
    assert data["connections"][0]["slug"] == b["slug"]
    delete_path = f'/concept-connections/{edge["id"]}'
    assert client.delete(delete_path, headers=other_headers).status_code == 404
    assert client.delete(delete_path, headers=headers).status_code == 204
    assert client.get(path, headers=headers).json()["connections"] == []


def test_graph_shows_concepts_explanations_and_prerequisite_direction(client, session, owner_user):
    from app.agent.knowledge import remember_concept, connect_concepts, save_explanation

    user, headers = owner_user
    a = remember_concept(session, user.id, "Autograd", "Records operations.")
    b = remember_concept(session, user.id, "Gradient", "Describes change.")
    connect_concepts(session, user.id, a["slug"], b["slug"], "requires", "Computes gradients.")
    saved = save_explanation(session, user.id, a["slug"], "How does autograd work?", "Records operations.", "Example.", [])
    graph = client.get('/graph', headers=headers).json()
    by_slug = {node['slug']: node for node in graph['nodes']}
    assert by_slug[a['slug']]['nodeKind'] == 'concept'
    assert by_slug[saved['slug']]['nodeKind'] == 'explanation'
    assert any(edge['source'] == by_slug[a['slug']]['id'] and edge['target'] == by_slug[b['slug']]['id']
               and edge['relationType'] == 'requires' for edge in graph['links'])
    assert any(edge['source'] == by_slug[saved['slug']]['id'] and edge['target'] == by_slug[a['slug']]['id']
               and edge['relationType'] == 'explains' for edge in graph['links'])
