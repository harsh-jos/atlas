"""Request-scoped identity: resolve a bearer token to a user, or refuse the request."""

from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.auth.repository import UserRepository
from app.core.enums import Role
from app.core.security import read_access_token, read_supabase_identity
from app.core.config import get_settings
from app.db.base import SessionScope, get_session, get_session_scope
from app.db.models import User

SessionDep = Annotated[Session, Depends(get_session, scope="function")]
SessionScopeDep = Annotated[SessionScope, Depends(get_session_scope)]

_bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise _unauthorized()
    try:
        return user_for_token(session, credentials.credentials)
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _unauthorized() from None


def user_for_token(session: Session, token: str) -> User:
    if get_settings().auth_provider == "local":
        user = UserRepository(session).get(read_access_token(token))
    else:
        identity = read_supabase_identity(token)
        subject = UUID(identity["sub"])
        statement = select(User).where(User.supabase_user_id == subject)
        user = session.scalar(statement)
        if user is None:
            try:
                with session.begin_nested():
                    user = User(email=identity["email"], supabase_user_id=subject)
                    session.add(user)
                    session.flush()
            except IntegrityError:
                # Concurrent first requests can provision the same subject. Never link by
                # email: an existing local account needs an explicit data migration.
                user = session.scalar(statement)
                if user is None:
                    raise jwt.InvalidTokenError("Account migration required") from None
    if user is None:
        raise jwt.InvalidTokenError("Unknown account")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def resolve_user_id(token: str | None, scope: SessionScope) -> UUID | None:
    """Token to user id, confirming the row still exists, without holding a session open."""
    if token is None:
        return None
    try:
        with scope() as session:
            return user_for_token(session, token).id
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def get_current_user_id(
    scope: SessionScopeDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> UUID:
    """Identifies the caller for long-running routes that must not pin a connection."""
    user_id = resolve_user_id(credentials.credentials if credentials else None, scope)
    if user_id is None:
        raise _unauthorized()
    return user_id


CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]


def require_role(*allowed: Role):
    """Gate a route on the caller's database-assigned account role."""

    def guard(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user

    return Depends(guard)
