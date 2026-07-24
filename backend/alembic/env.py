"""Alembic environment: migrations run against the app's own engine and metadata."""

from alembic import context

from app.db import models  # noqa: F401  -- importing registers every model on Base.metadata
from app.db.base import Base, get_engine

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    """Manage only tables this metadata declares, so foreign ones are never auto-dropped."""
    return not (type_ == "table" and reflected and name not in target_metadata.tables)


def run_migrations_offline() -> None:
    context.configure(
        url=str(get_engine().url),
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with get_engine().connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
