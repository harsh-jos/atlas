"""Verify signatures and project boundaries, then provision a distinct app identity."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select

from app.auth.deps import user_for_token
from app.core import security
from app.core.config import get_settings, Settings
from app.db.models import User


@pytest.fixture
def supabase(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "auth_provider", "supabase")
    monkeypatch.setattr(settings, "supabase_url", "https://project.supabase.co")
    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(security, "supabase_jwks", lambda url: SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())))

    def token(**overrides):
        now = datetime.now(timezone.utc)
        payload = {"sub": str(uuid4()), "email": "new@example.com", "role": "authenticated",
                   "iss": f"{settings.supabase_url}/auth/v1", "aud": "authenticated",
                   "iat": now, "exp": now + timedelta(minutes=5), **overrides}
        return jwt.encode(payload, key, algorithm="ES256")
    return token


def test_verified_subject_provisions_once_without_password(session, supabase):
    token = supabase()
    first = user_for_token(session, token)
    assert first.password_hash is None and first.supabase_user_id is not None
    assert user_for_token(session, token).id == first.id
    assert session.scalar(select(User).where(User.id == first.id)).email == "new@example.com"


@pytest.mark.parametrize("overrides", [
    {"iss": "https://other.supabase.co/auth/v1"}, {"aud": "other"},
    {"exp": 0}, {"role": "service_role"}, {"sub": "bad"}, {"email": ""},
])
def test_wrong_project_audience_expiry_or_subject_cannot_provision(session, supabase, overrides):
    with pytest.raises((jwt.PyJWTError, ValueError)):
        user_for_token(session, supabase(**overrides))
    assert session.scalar(select(User)) is None


def test_wrong_signature_is_rejected(supabase):
    key = ec.generate_private_key(ec.SECP256R1())
    payload = jwt.decode(supabase(), options={"verify_signature": False})
    with pytest.raises(jwt.InvalidSignatureError):
        security.read_supabase_identity(jwt.encode(payload, key, algorithm="ES256"))


def test_email_match_never_links_an_existing_local_account(session, supabase):
    local = User(email="new@example.com", password_hash="existing")
    session.add(local)
    session.flush()
    with pytest.raises(jwt.InvalidTokenError):
        user_for_token(session, supabase())
    assert local.supabase_user_id is None


def test_local_endpoints_and_token_issuance_disabled(client, supabase):
    data = {"email": "new@example.com", "password": "long-enough-password"}
    assert client.post("/auth/register", json=data).status_code == 404
    assert client.post("/auth/login", json=data).status_code == 404
    with pytest.raises(ValueError):
        security.create_access_token(uuid4())


def test_supabase_configuration_does_not_require_local_signing_secret():
    config = Settings(_env_file=None, database_url="postgresql://localhost/atlas",
                      auth_provider="supabase", supabase_url="https://project.supabase.co",
                      storage_backend="supabase", supabase_service_key="test-key")
    assert config.auth_provider == "supabase"
