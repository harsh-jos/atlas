"""Database fixtures: one scratch database per run, one rolled-back transaction per test."""

import asyncio
import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from google.adk.sessions import DatabaseSessionService

from agent_fixtures import agent_settings, usage_factory  # noqa: F401
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.db import models  # noqa: F401  -- importing registers every model on Base.metadata
from app.db.base import get_session

_TEST_DATABASE = "atlas_test"


@pytest.fixture(scope="session")
def engine():
    url = make_url(get_settings().database_url).set(drivername="postgresql+psycopg")
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE IF EXISTS "{_TEST_DATABASE}" WITH (FORCE)'))
            connection.execute(text(f'CREATE DATABASE "{_TEST_DATABASE}"'))
    except OperationalError as error:
        if os.environ.get("ATLAS_REQUIRE_POSTGRES") == "1":
            raise
        pytest.skip(f"Postgres unavailable for database tests: {error}")
    finally:
        admin.dispose()

    test_engine = create_engine(url.set(database=_TEST_DATABASE))
    with test_engine.begin() as connection:
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        command.upgrade(config, "head")
        command.check(config)
    async def prepare_chat():
        service = DatabaseSessionService(db_url=test_engine.url.render_as_string(hide_password=False))
        try:
            await service.prepare_tables()
        finally:
            await service.close()
    asyncio.run(prepare_chat())
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def session(engine):
    """An outer transaction rolled back afterwards, so cases never leak into each other."""
    connection = engine.connect()
    transaction = connection.begin()
    db = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield db
    finally:
        db.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(session):
    """The routed app on the test session — no lifespan, so the import worker stays out."""
    app = FastAPI()
    app.include_router(auth_router)
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as test_client:
        yield test_client
