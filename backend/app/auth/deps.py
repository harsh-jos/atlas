"""Request-scoped identity: resolve a bearer token to a user, or refuse the request."""

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.repository import UserRepository
from app.core.enums import Role
from app.core.security import read_access_token
from app.db.base import get_session
from app.db.models import User

SessionDep = Annotated[Session, Depends(get_session)]

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
        user_id = read_access_token(credentials.credentials)
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _unauthorized() from None
    user = UserRepository(session).get(user_id)
    if user is None:
        raise _unauthorized()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*allowed: Role):
    """Gate a route on the caller's role; the matrix stays out until sharing exists."""

    def guard(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user

    return Depends(guard)
