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


def create_access_token(subject: UUID) -> str:
    settings = get_settings()
    issued_at = datetime.now(UTC)
    payload = {
        "sub": str(subject),
        "iat": issued_at,
        "exp": issued_at + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def read_access_token(token: str) -> UUID:
    """Return the subject of a valid token; raises for anything expired or tampered with."""
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    return UUID(payload["sub"])
