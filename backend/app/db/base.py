"""Engine, session factory, and the declarative base every model inherits."""

from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
from functools import lru_cache
import logging
from time import monotonic

from sqlalchemy import Engine, MetaData, create_engine, event
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

log = logging.getLogger(__name__)

_NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base with named constraints so Alembic autogenerate stays stable."""

    metadata = MetaData(naming_convention=_NAMING_CONVENTION)


@lru_cache
def database_url() -> URL:
    """The configured URL pinned to psycopg3; a bare postgresql:// would resolve to psycopg2."""
    url = make_url(get_settings().database_url)
    return url.set(drivername="postgresql+psycopg") if url.drivername == "postgresql" else url


@lru_cache
def get_engine() -> Engine:
    """Process-wide pooled engine."""
    engine = create_engine(database_url(), **engine_options())
    observe_engine(engine)
    return engine


def observe_engine(engine: Engine) -> None:
    """Log slow operations without SQL text or parameters, including the ADK engine."""
    @event.listens_for(engine, "before_cursor_execute")
    def started(connection, cursor, statement, parameters, context, executemany):
        context.atlas_started = monotonic()

    @event.listens_for(engine, "after_cursor_execute")
    def finished(connection, cursor, statement, parameters, context, executemany):
        elapsed = monotonic() - context.atlas_started
        if elapsed >= get_settings().db_slow_query_seconds:
            log.warning("db_slow_query duration_ms=%d", elapsed * 1000)


def engine_options() -> dict:
    """Share privacy and bounded database waits with ADK's separate session engine."""
    settings = get_settings()
    options = {"pool_pre_ping": True, "hide_parameters": True}
    if database_url().get_backend_name() == "postgresql":
        options.update(
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_recycle=settings.db_pool_recycle_seconds,
            pool_timeout=settings.db_connect_timeout_seconds,
            connect_args={
                "connect_timeout": settings.db_connect_timeout_seconds,
                "options": (
                    f"-c statement_timeout={settings.db_statement_timeout_seconds * 1000} "
                    f"-c lock_timeout={settings.db_lock_timeout_seconds * 1000}"
                ),
            },
        )
    return options


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """Request-scoped session; commits on success, rolls back on failure."""
    with session_scope() as session:
        yield session


SessionScope = Callable[[], AbstractContextManager[Session]]


def get_session_scope() -> SessionScope:
    """A session factory, for long-lived callers that must not hold a connection open."""
    return session_scope


@contextmanager
def session_scope() -> Iterator[Session]:
    started = monotonic()
    with get_engine().connect() as connection:
        elapsed = monotonic() - started
        if elapsed >= get_settings().db_slow_query_seconds:
            log.warning("db_pool_wait duration_ms=%d", elapsed * 1000)
        with Session(bind=connection, expire_on_commit=False) as session, session.begin():
            yield session
