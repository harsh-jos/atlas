"""The one home for configuration: every tunable value is defined here.

Anything secret or deployment-specific comes from the environment / `.env`; everything else
carries a default in this file. Nothing else in the codebase hardcodes a tunable value.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Schema-bound, so deliberately NOT environment-driven: changing it needs a migration and a
# full re-embed, which an env var would silently skip.
EMBEDDING_DIMENSIONS = 1536

# Assets exist to be embedded in artifact bodies, so only images are ever accepted.
ALLOWED_ASSET_TYPES = frozenset(
    {"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"}
)


class Settings(BaseSettings):
    """Service configuration, loaded from the environment / `.env`."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    host: str = "127.0.0.1"
    port: int = 8000
    db_pool_size: int = Field(default=5, ge=1, le=100)
    db_max_overflow: int = Field(default=10, ge=0, le=100)
    db_pool_recycle_seconds: int = Field(default=1800, ge=60)
    db_slow_query_seconds: float = Field(default=1.0, gt=0)
    db_connect_timeout_seconds: int = Field(default=5, ge=1, le=60)
    db_statement_timeout_seconds: int = Field(default=30, ge=1, le=120)
    db_lock_timeout_seconds: int = Field(default=5, ge=1, le=60)

    # Local signing requires an explicit secret; hosted auth validates Supabase JWKS.
    auth_provider: Literal["local", "supabase"] = "local"
    supabase_url: str | None = None
    supabase_jwt_audience: str = "authenticated"
    supabase_service_key: str | None = None
    storage_backend: Literal["local", "supabase"] = "local"
    supabase_storage_bucket: str = "atlas-assets"
    jwt_secret: str | None = None
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 24

    # Per-user ceiling on stored asset + artifact bytes.
    storage_quota_bytes: int = 500 * 1024 * 1024

    # Vertex/Gemini. Credentials come from ADC; only the project is required to enable the agent.
    # Use the global endpoint for the default model.
    vertex_project: str | None = None
    google_application_credentials: str | None = None
    vertex_location: str = "global"
    agent_model: str = "gemini-4-argon"
    agent_search_model: str = "gemini-4-argon"
    agent_app_name: str = "atlas"

    # Loop guards, not lesson-length targets. Both guide and research calls count.
    agent_max_calls_per_turn: int = Field(default=12, ge=1, le=100)
    agent_max_calls_per_session: int = Field(default=256, ge=1)
    agent_max_research_per_turn: int = Field(default=3, ge=0, le=20)
    agent_max_research_per_session: int = Field(default=48, ge=0)
    agent_max_request_bytes: int = Field(default=2_000_000, ge=1024)
    agent_turn_timeout_seconds: int = Field(default=300, ge=1, le=1800)
    agent_max_active_turns: int = Field(default=100, ge=1)
    agent_max_active_turns_per_user: int = Field(default=3, ge=1)
    # Admission guard in millionths of USD. Zero explicitly disables it.
    # The last provider call can exceed the remaining amount; this is not a billing cap.
    agent_session_budget_microusd: int = Field(default=5_000_000, ge=0)

    # Full-text search over a user's own artifacts.
    search_limit: int = 8
    # Matches the generated search vector; changing language requires a migration.
    search_language: Literal["english"] = "english"

    # Uploaded images, one file per asset id.
    assets_dir: str = "uploads/assets"
    agent_stream_start_timeout_seconds: int = Field(default=60, ge=10, le=300)
    max_asset_bytes: int = 10 * 1024 * 1024

    @model_validator(mode="after")
    def deployment_requirements(self):
        if self.auth_provider == "local" and not self.jwt_secret:
            raise ValueError("JWT_SECRET is required for local auth")
        if self.auth_provider == "supabase" or self.storage_backend == "supabase":
            if not self.supabase_url or not self.supabase_url.startswith("https://"):
                raise ValueError("SUPABASE_URL must be an HTTPS project URL")
            self.supabase_url = self.supabase_url.rstrip("/")
        if self.storage_backend == "supabase" and not self.supabase_service_key:
            raise ValueError("SUPABASE_SERVICE_KEY is required for private object storage")
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so config (and its env validation) is resolved lazily, once."""
    # Fields are populated from the environment / .env by pydantic-settings, not passed in.
    return Settings()  # pyright: ignore[reportCallIssue]
