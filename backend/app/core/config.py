"""The one home for configuration: every tunable value is defined here.

Anything secret or deployment-specific comes from the environment / `.env`; everything else
carries a default in this file. Nothing else in the codebase hardcodes a tunable value.
"""

from functools import lru_cache

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

    # No default: the service must refuse to boot rather than sign tokens with a known secret.
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 24
    # A browser cannot read the httpOnly session cookie, so sockets open with a brief ticket
    # instead of the long-lived token ever reaching JavaScript.
    socket_ticket_ttl_minutes: int = 2

    # Per-user ceiling on stored asset + artifact bytes.
    storage_quota_bytes: int = 500 * 1024 * 1024

    # Vertex/Gemini. Credentials come from ADC; only the project is required to enable the agent.
    # Gemini 3.x is served from the `global` endpoint — regional locations 404 on those models.
    vertex_project: str | None = None
    vertex_location: str = "global"
    agent_model: str = "gemini-3.5-flash"
    agent_search_model: str = "gemini-3.5-flash"
    agent_app_name: str = "atlas"

    # Full-text search over a user's own artifacts.
    search_limit: int = 8
    search_language: str = "english"

    # Uploaded images, one file per asset id.
    assets_dir: str = "uploads/assets"
    max_asset_bytes: int = 10 * 1024 * 1024

@lru_cache
def get_settings() -> Settings:
    """Cached accessor so config (and its env validation) is resolved lazily, once."""
    # Fields are populated from the environment / .env by pydantic-settings, not passed in.
    return Settings()  # pyright: ignore[reportCallIssue]
