"""Both backend and ADK connections use private, bounded database operations."""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.db.base import engine_options
from app.agent.session import get_session_service


def test_database_deadline_is_enforced_and_parameters_are_hidden(engine, monkeypatch):
    monkeypatch.setattr(get_settings(), "db_statement_timeout_seconds", 1)
    configured = create_engine(engine.url, **engine_options())
    try:
        with configured.connect() as connection:
            assert connection.scalar(text("SHOW statement_timeout")) == "1s"
            assert connection.scalar(text("SHOW lock_timeout")) == "5s"
            with pytest.raises(OperationalError) as error:
                connection.execute(text("SELECT pg_sleep(:seconds)"), {"seconds": 2})
            assert "parameters hidden" in str(error.value)
    finally:
        configured.dispose()


def test_adk_engine_uses_the_same_safety_options():
    service = get_session_service()
    assert service.db_engine.sync_engine.hide_parameters
