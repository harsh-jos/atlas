"""Engine, session factory, and the declarative base every model inherits."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, MetaData, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

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
def get_engine() -> Engine:
    """Process-wide pooled engine, pinned to psycopg3 (bare postgresql:// means psycopg2)."""
    url = make_url(get_settings().database_url)
    if url.drivername == "postgresql":
        url = url.set(drivername="postgresql+psycopg")
    return create_engine(url, pool_pre_ping=True)


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """Request-scoped session; commits on success, rolls back on failure."""
    with get_session_factory().begin() as session:
        yield session
