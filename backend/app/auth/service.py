"""Registration and login — the only place a password becomes a session."""

from sqlalchemy.orm import Session

from app.auth.repository import UserRepository
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User


class EmailTaken(ValueError):
    """Raised when registering an address that already exists."""


class InvalidCredentials(ValueError):
    """Raised when an email and password do not authenticate."""


class AuthService:
    def __init__(self, session: Session) -> None:
        self.users = UserRepository(session)

    def register(self, email: str, password: str) -> User:
        if self.users.get_by_email(email) is not None:
            raise EmailTaken(email)
        return self.users.add(User(email=email, password_hash=hash_password(password)))

    def authenticate(self, email: str, password: str) -> User:
        """Verifies unconditionally so a missing account costs the same as a wrong password."""
        user = self.users.get_by_email(email)
        matched = verify_password(password, user.password_hash if user else None)
        if user is None or not matched:
            raise InvalidCredentials(email)
        return user

    def issue_token(self, user: User) -> str:
        return create_access_token(user.id)
