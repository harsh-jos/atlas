"""Assets are the one endpoint that writes bytes to disk — ownership and quota must hold."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.assets import router as assets_router
from app.auth.service import AuthService
from app.core.config import get_settings
from app.db.base import get_session
from app.db.models import User
from app.core.http_errors import ErrorMiddleware, http_error
from starlette.exceptions import HTTPException

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
    app.add_middleware(ErrorMiddleware)
    app.add_exception_handler(HTTPException, http_error)
    app.include_router(assets_router)
    def request_session():
        # Commit fixture setup, then mirror the production dependency's transaction boundary.
        session.commit()
        try:
            yield session
            session.commit()
        except BaseException:
            session.rollback()
            raise
    app.dependency_overrides[get_session] = request_session
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


def test_missing_file_has_an_actionable_owned_error(client, owner, assets_dir):
    url = _upload(client, owner[0]).json()['url']
    next(assets_dir.iterdir()).unlink()
    response = client.get(url, headers=owner[0])
    assert response.status_code == 404 and response.json()['code'] == 'asset_missing'


def test_file_is_removed_when_database_transaction_rolls_back(session, assets_dir):
    from uuid import uuid4
    from app.storage.assets import write
    path = assets_dir / str(uuid4())
    write(session, path, PNG)
    assert path.exists()
    session.rollback()
    assert not path.exists() and not path.with_suffix('.part').exists()


def test_failed_delete_keeps_the_file_when_database_rolls_back(session, assets_dir):
    from uuid import uuid4
    from app.storage.assets import delete_after_commit
    path = assets_dir / str(uuid4())
    assets_dir.mkdir()
    path.write_bytes(PNG)
    delete_after_commit(session, path)
    session.rollback()
    assert path.read_bytes() == PNG


def test_partial_file_write_is_cleaned_up(session, assets_dir, monkeypatch):
    from pathlib import Path
    from uuid import uuid4
    from app.storage.assets import write
    path = assets_dir / str(uuid4())
    def fail(*args):
        raise OSError('disk failure')
    monkeypatch.setattr(Path, 'replace', fail)
    with pytest.raises(OSError):
        write(session, path, PNG)
    assert list(assets_dir.iterdir()) == []


def test_reconciliation_is_dry_by_default_and_preserves_recent_and_referenced_files(
    client, owner, assets_dir, session, monkeypatch
):
    import os
    from contextlib import contextmanager
    from time import time
    from uuid import uuid4
    from app.storage import assets
    url = _upload(client, owner[0]).json()['url']
    referenced = assets_dir / url.rsplit('/', 1)[-1]
    orphan, recent = assets_dir / str(uuid4()), assets_dir / str(uuid4())
    orphan.write_bytes(PNG)
    recent.write_bytes(PNG)
    os.utime(orphan, (time() - 90000, time() - 90000))
    os.utime(referenced, (time() - 90000, time() - 90000))
    @contextmanager
    def scope():
        yield session
    monkeypatch.setattr(assets, 'get_session_scope', lambda: scope)
    result = assets.reconcile()
    assert result['orphanFiles'] == [orphan.name] and result['missingFiles'] == 0
    assert orphan.exists()
    assets.reconcile(apply=True)
    assert not orphan.exists() and recent.exists() and referenced.exists()


def test_commit_failure_returns_unavailable_and_removes_new_file(client, owner, assets_dir, session, monkeypatch):
    from sqlalchemy import func, select
    from sqlalchemy.exc import OperationalError
    from app.db.models import Asset
    original = session.commit
    calls = []
    def fail_commit():
        calls.append(True)
        if len(calls) == 1:
            return original()  # The fixture's setup boundary.
        raise OperationalError('private SQL', {}, RuntimeError('private DB failure'))
    monkeypatch.setattr(session, 'commit', fail_commit)
    response = _upload(client, owner[0])
    assert response.status_code == 503 and response.json()['code'] == 'database_unavailable'
    assert not list(assets_dir.iterdir())
    assert session.scalar(select(func.count()).select_from(Asset)) == 0
    assert owner[1].storage_bytes == 0
