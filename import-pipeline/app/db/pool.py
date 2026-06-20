from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import get_settings

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    """Lazily-opened process-wide connection pool to the Atlas Postgres database."""
    global _pool
    if _pool is None:
        pool = ConnectionPool(
            conninfo=get_settings().database_url,
            min_size=1,
            max_size=4,
            open=False,
            # dict_row everywhere so repository functions return mappings, not tuples.
            kwargs={"row_factory": dict_row},
        )
        pool.open()
        pool.wait()
        _pool = pool
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
