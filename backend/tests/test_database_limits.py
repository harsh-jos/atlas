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


def test_hosted_session_deadlines_do_not_depend_on_pooler_startup_options(engine, monkeypatch):
    from app.db.base import observe_engine
    settings = get_settings()
    monkeypatch.setattr(settings, 'auth_provider', 'supabase')
    monkeypatch.setattr(settings, 'db_statement_timeout_seconds', 1)
    options = engine_options()
    assert 'options' not in options['connect_args']
    configured = create_engine(engine.url, **options)
    observe_engine(configured)
    try:
        with configured.connect() as connection:
            assert connection.scalar(text('SHOW statement_timeout')) == '1s'
            assert connection.scalar(text('SHOW lock_timeout')) == '5s'
            assert connection.scalar(text('SHOW search_path')) == 'public, extensions'
            with pytest.raises(OperationalError):
                connection.execute(text('SELECT pg_sleep(2)'))
    finally:
        configured.dispose()


def test_hosted_adk_async_connection_supports_session_configuration(engine, monkeypatch):
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine
    from app.db.base import observe_engine
    monkeypatch.setattr(get_settings(), 'auth_provider', 'supabase')
    configured = create_async_engine(engine.url, **engine_options())
    observe_engine(configured.sync_engine)

    async def check():
        try:
            async with configured.connect() as connection:
                assert await connection.scalar(text('SHOW statement_timeout')) == '30s'
                assert await connection.scalar(text('SHOW search_path')) == 'public, extensions'
        finally:
            await configured.dispose()

    asyncio.run(check())
