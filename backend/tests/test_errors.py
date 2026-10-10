"""Errors retain useful references and locations without retaining private inputs."""

import logging
from uuid import UUID

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError, StatementError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.auth.router import router
from app.core.errors import describe
from app.core.http_errors import ErrorMiddleware, http_error, validation_error
from app.db.base import get_session


@pytest.fixture
def client():
    app = FastAPI()
    app.add_middleware(ErrorMiddleware)
    app.add_exception_handler(StarletteHTTPException, http_error)
    app.add_exception_handler(RequestValidationError, validation_error)
    app.include_router(router)

    def session_stub():
        yield object()

    app.dependency_overrides[get_session] = session_stub

    @app.get("/broken")
    def broken():
        raise StatementError(
            "PRIVATE_EXCEPTION",
            "INSERT private",
            {"body": "PRIVATE_BODY"},
            ValueError("PRIVATE_ORIGIN"),
        )

    @app.get("/refused")
    def refused():
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})

    @app.get("/database")
    def database():
        raise OperationalError("PRIVATE_SQL", {}, ValueError("PRIVATE_CONNECTION"))

    return TestClient(app)


def test_validation_does_not_echo_password_or_body(client):
    result = client.post("/auth/login", json={"email": "private-email", "password": "secret"})
    assert result.status_code == 422
    data = result.json()
    assert data["code"] == "validation_error"
    assert data["fields"]
    assert "secret" not in result.text and "private-email" not in result.text
    assert data["requestId"] == result.headers["X-Request-ID"]
    UUID(data["requestId"])


def test_unexpected_error_is_safe_in_response_and_logs(client, caplog):
    with caplog.at_level(logging.ERROR):
        result = client.get("/broken")
    assert result.status_code == 500
    reference = result.json()["requestId"]
    assert reference == result.headers["X-Request-ID"]
    assert reference in caplog.text and "StatementError" in caplog.text
    assert "test_errors.py" in caplog.text and "broken" in caplog.text
    assert "PRIVATE" not in caplog.text and "PRIVATE" not in result.text
    assert all(record.exc_info is None for record in caplog.records)


def test_http_status_headers_and_distinct_references_are_preserved(client):
    first, second = client.get("/refused"), client.get("/refused")
    assert first.status_code == 401
    assert first.headers["WWW-Authenticate"] == "Bearer"
    assert first.json()["code"] == "not_authenticated"
    assert first.json()["requestId"] != second.json()["requestId"]


def test_database_failure_is_reported_as_unavailable(client):
    result = client.get("/database")
    assert result.status_code == 503 and result.json()["code"] == "database_unavailable"
    assert "PRIVATE" not in result.text


def test_network_and_timeout_failures_are_distinct():
    import httpx

    assert describe(httpx.ConnectError("private host")).code == "network_error"
    assert describe(httpx.ReadTimeout("private request")).code == "timeout"
