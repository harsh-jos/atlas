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

    # Enrichment: "deterministic" (default, no model) or "llm" (calls an external model server).
    enricher: str = "deterministic"
    # The model runs separately; this service only holds its URL. OpenAI-compatible
    # /v1/chat/completions — works for DeepSeek (https://api.deepseek.com/v1) and local servers
    # (Ollama/vLLM/LM Studio, e.g. http://localhost:11434/v1).
    llm_base_url: str | None = None
    llm_api_key: str | None = None  # optional — local servers usually need none
    llm_model: str = "deepseek-chat"
    llm_timeout_s: float = 60.0
    llm_max_concurrency: int = 4  # parallel in-flight enrichment calls
    llm_max_entries: int | None = None  # per-import cost cap; None = no cap

    # Service-owned job state (no Redis, no extra Postgres tables).
    jobs_db_path: str = "jobs.db"
    uploads_dir: str = "uploads"


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so config (and its env validation) is resolved lazily, once."""
    # Fields are populated from the environment / .env by pydantic-settings, not passed in.
    return Settings()  # pyright: ignore[reportCallIssue]
