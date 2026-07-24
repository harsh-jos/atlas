"""Database fixtures: one scratch database per run, one rolled-back transaction per test."""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import models  # noqa: F401  -- importing registers every model on Base.metadata
from app.db.base import Base

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
        pytest.skip(f"Postgres unavailable for database tests: {error}")
    finally:
        admin.dispose()

    test_engine = create_engine(url.set(database=_TEST_DATABASE))
    with test_engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(test_engine)
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
