from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.segment import DEFAULT_MAX_ENTRY_CHARS


class Settings(BaseSettings):
    """Service configuration, loaded from the environment / `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str
    host: str = "127.0.0.1"
    port: int = 8000

    # Leaf sections shorter than this merge up into their parent during segmentation.
    min_entry_chars: int = 200
    # Entries longer than this split into PART_OF continuations (readable + embeddable chunks).
    max_entry_chars: int = DEFAULT_MAX_ENTRY_CHARS

    # Service-owned job state (no Redis, no extra Postgres tables).
    jobs_db_path: str = "jobs.db"
    uploads_dir: str = "uploads"


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so config (and its env validation) is resolved lazily, once."""
    # Fields are populated from the environment / .env by pydantic-settings, not passed in.
    return Settings()  # pyright: ignore[reportCallIssue]
