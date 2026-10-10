"""One deployment job owns migrations and ADK DDL; replicas validate before serving."""

import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from app.agent.session import get_session_service
from app.db.base import get_engine

_CONFIG = Path(__file__).resolve().parents[2] / 'alembic.ini'
_ADK_TABLES = {'adk_internal_metadata', 'app_states', 'events', 'sessions', 'user_states'}


def validate_schema() -> None:
    with get_engine().connect() as connection:
        current = connection.scalar(text('SELECT version_num FROM alembic_version'))
        if current != ScriptDirectory.from_config(Config(str(_CONFIG))).get_current_head():
            raise RuntimeError('Database migrations are pending. Run python -m app.db.bootstrap.')
        schema = inspect(connection)
        if not _ADK_TABLES.issubset(schema.get_table_names()):
            raise RuntimeError('Chat schema is missing. Run python -m app.db.bootstrap.')
        if 'event_data' not in {column['name'] for column in schema.get_columns('events')}:
            raise RuntimeError('This backend requires the pinned ADK v1 schema. Migrate legacy ADK storage first.')


async def prepare_database() -> None:
    await asyncio.to_thread(validate_schema)
    await get_session_service().prepare_tables()


async def prepare_chat_schema() -> None:
    service = get_session_service()
    try:
        await service.prepare_tables()
    finally:
        await service.close()
        get_session_service.cache_clear()


def bootstrap() -> None:
    engine = get_engine()
    try:
        # A session-level lock spans Alembic's transaction and ADK's separate engine.
        with engine.connect() as lock:
            lock.execute(text('SELECT pg_advisory_lock(817234602)'))
            lock.commit()
            try:
                with engine.begin() as connection:
                    config = Config(str(_CONFIG))
                    config.attributes['connection'] = connection
                    command.upgrade(config, 'head')
                    command.check(config)
                asyncio.run(prepare_chat_schema())
                validate_schema()
            finally:
                lock.execute(text('SELECT pg_advisory_unlock(817234602)'))
                lock.commit()
    finally:
        engine.dispose()


if __name__ == '__main__':
    bootstrap()
