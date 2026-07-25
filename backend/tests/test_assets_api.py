"""Assets are the one endpoint that writes bytes to disk — ownership and quota must hold."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.assets import router as assets_router
from app.auth.service import AuthService
from app.core.config import get_settings
from app.db.base import get_session
from app.db.models import User

PASSWORD = "correct-horse-battery"
PNG = b"\x89PNG\r\n\x1a\n" + b"pretend pixels"


@pytest.fixture
def assets_dir(tmp_path, monkeypatch):
    """Point the configured assets directory at a scratch path for the whole test."""
    directory = tmp_path / "assets"
    monkeypatch.setattr(get_settings(), "assets_dir", str(directory))
    return directory


@pytest.fixture
def client(session, assets_dir):
    app = FastAPI()
    app.include_router(assets_router)
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as test_client:
        yield test_client


def _register(session, email: str) -> tuple[dict[str, str], User]:
    service = AuthService(session)
    user = service.register(email, PASSWORD)
    return {"Authorization": f"Bearer {service.issue_token(user)}"}, user


@pytest.fixture
def owner(session):
    return _register(session, "owner@example.com")


@pytest.fixture
def stranger(session):
    return _register(session, "stranger@example.com")


def _upload(client, headers, content=PNG, name="diagram.png", mime="image/png"):
    return client.post("/assets", headers=headers, files={"file": (name, content, mime)})


def test_uploading_requires_a_token(client):
    assert _upload(client, {}).status_code == 401


def test_upload_then_fetch_returns_the_same_bytes(client, owner, assets_dir):
    headers, _ = owner
    created = _upload(client, headers)
    assert created.status_code == 201
    body = created.json()
    assert body["url"] == f"/assets/{body['id']}"
    assert body["mimeType"] == "image/png"
    assert body["size"] == len(PNG)

    fetched = client.get(body["url"], headers=headers)
    assert fetched.status_code == 200
    assert fetched.content == PNG
    assert fetched.headers["content-type"] == "image/png"
    assert [path.name for path in assets_dir.iterdir()] == [body["id"]]


def test_the_client_filename_never_names_the_file_on_disk(client, owner, assets_dir):
    headers, _ = owner
    body = _upload(client, headers, name="../../etc/passwd.png").json()
    assert [path.name for path in assets_dir.iterdir()] == [body["id"]]


def test_a_non_image_is_rejected(client, owner, assets_dir):
    headers, _ = owner
    response = _upload(
        client, headers, content=b"%PDF-1.7", name="paper.pdf", mime="application/pdf"
    )
    assert response.status_code == 415
    assert not assets_dir.exists()


def test_an_oversized_upload_is_rejected(client, owner, monkeypatch):
    headers, user = owner
    monkeypatch.setattr(get_settings(), "max_asset_bytes", 4)
    assert _upload(client, headers).status_code == 413
    assert user.storage_bytes == 0


def test_an_over_quota_upload_writes_no_file_and_leaves_the_counter(
    client, owner, assets_dir, monkeypatch
):
    headers, user = owner
    monkeypatch.setattr(get_settings(), "storage_quota_bytes", len(PNG) - 1)
    assert _upload(client, headers).status_code == 413
    assert user.storage_bytes == 0
    assert not assets_dir.exists()


def test_upload_charges_the_quota(client, owner):
    headers, user = owner
    _upload(client, headers)
    assert user.storage_bytes == len(PNG)


def test_a_stranger_gets_404_on_get_and_delete(client, owner, stranger):
    url = _upload(client, owner[0]).json()["url"]
    assert client.get(url, headers=stranger[0]).status_code == 404
    assert client.delete(url, headers=stranger[0]).status_code == 404


def test_delete_removes_the_row_the_file_and_the_charge(client, owner, assets_dir):
    headers, user = owner
    url = _upload(client, headers).json()["url"]
    assert client.delete(url, headers=headers).status_code == 204
    assert client.get(url, headers=headers).status_code == 404
    assert list(assets_dir.iterdir()) == []
    assert user.storage_bytes == 0
