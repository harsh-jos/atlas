"""Password hashing and access-token signing — no database, no framework."""

from datetime import UTC, datetime, timedelta
from functools import lru_cache
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


@lru_cache
def _absent_user_hash() -> str:
    return hash_password("no-such-user")


def verify_password(password: str, password_hash: str | None) -> bool:
    """Costs the same whether or not the account exists, so timing can't enumerate emails."""
    return _hasher.verify(password, password_hash or _absent_user_hash())


def create_access_token(subject: UUID, ttl_minutes: int | None = None) -> str:
    settings = get_settings()
    if settings.auth_provider != "local":
        raise ValueError("Local token issuance is disabled")
    issued_at = datetime.now(UTC)
    payload = {
        "sub": str(subject),
        "iat": issued_at,
        "exp": issued_at + timedelta(minutes=ttl_minutes or settings.access_token_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def read_access_token(token: str) -> UUID:
    """Return the subject of a valid token; raises for anything expired or tampered with."""
    settings = get_settings()
    if settings.auth_provider != "local":
        return UUID(read_supabase_identity(token)["sub"])
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    return UUID(payload["sub"])


@lru_cache
def supabase_jwks(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{url}/auth/v1/.well-known/jwks.json", timeout=5)


def read_supabase_identity(token: str) -> dict:
    """Only user access tokens signed by this project's asymmetric keys are accepted."""
    settings = get_settings()
    key = supabase_jwks(settings.supabase_url).get_signing_key_from_jwt(token)
    payload = jwt.decode(
        token, key.key, algorithms=["ES256", "RS256"],
        audience=settings.supabase_jwt_audience,
        issuer=f"{settings.supabase_url}/auth/v1",
        options={"require": ["exp", "iat", "sub", "iss", "aud"]},
    )
    UUID(payload["sub"])
    if payload.get("role") != "authenticated" or not payload.get("email"):
        raise jwt.InvalidTokenError("A signed-in email account is required")
    return payload
