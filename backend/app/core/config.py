from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Service configuration, loaded from the environment / `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str
    host: str = "127.0.0.1"
    port: int = 8000

    # No default: the service must refuse to boot rather than sign tokens with a known secret.
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 24

    # Per-user ceiling on stored asset + artifact bytes.
    storage_quota_bytes: int = 500 * 1024 * 1024

    # Leaf sections shorter than this merge up into their parent during segmentation, so a
    # page's short steps coalesce into it instead of becoming shallow standalone entries.
    min_artifact_chars: int = 600
    # Headings deeper than this fold into their ancestor entry's body (keeps entries substantial).
    max_split_level: int = 2

    # Service-owned job state (no Redis, no extra Postgres tables).
    jobs_db_path: str = "jobs.db"
    uploads_dir: str = "uploads"

    # If set, every import is ALSO mirrored into this Obsidian vault (folder of markdown
    # notes) alongside the Postgres write. Leave unset to write only to Atlas.
    obsidian_vault_dir: str | None = None

    # Optional LLM enrichment (DeepSeek). Off by default: the pipeline is fully deterministic
    # unless this is enabled AND a key is present. It only ever upgrades entries, never blocks.
    llm_enrichment: bool = False
    deepseek_api_key: str | None = None
    llm_model: str = "deepseek-chat"
    llm_base_url: str = "https://api.deepseek.com"
    llm_max_entries: int = 60  # cost cap: only the largest N entries get an LLM summary
    llm_timeout: float = 30.0


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so config (and its env validation) is resolved lazily, once."""
    # Fields are populated from the environment / .env by pydantic-settings, not passed in.
    return Settings()  # pyright: ignore[reportCallIssue]
