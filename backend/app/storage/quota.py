"""Per-user storage quota, enforced by the database so concurrent requests cannot both pass."""

from sqlalchemy import func, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import User


class QuotaExceeded(Exception):
    """Raised when a reservation would breach the user's storage quota."""

    def __init__(self, requested: int, available: int) -> None:
        super().__init__(f"requested {requested} bytes, {available} available")
        self.requested = requested
        self.available = available


class QuotaService:
    """Reserves and releases quota inside the caller's transaction."""

    def __init__(self, session: Session, user: User) -> None:
        self.session = session
        self.user = user
        self.limit = get_settings().storage_quota_bytes

    def remaining(self) -> int:
        return max(self.limit - self.user.storage_bytes, 0)

    def reserve(self, nbytes: int) -> None:
        """Claims bytes under a guarded UPDATE, so two racing requests cannot both pass."""
        statement = (
            update(User)
            .where(User.id == self.user.id, User.storage_bytes + nbytes <= self.limit)
            .values(storage_bytes=User.storage_bytes + nbytes)
            .execution_options(synchronize_session="fetch")
        )
        if self.session.execute(statement).rowcount != 1:
            raise QuotaExceeded(nbytes, self.remaining())

    def release(self, nbytes: int) -> None:
        """Gives bytes back, clamped in SQL so the counter can never go negative."""
        statement = (
            update(User)
            .where(User.id == self.user.id)
            .values(storage_bytes=func.greatest(User.storage_bytes - nbytes, 0))
            .execution_options(synchronize_session="fetch")
        )
        self.session.execute(statement)


def text_bytes(*parts: str | None) -> int:
    """Stored text size in UTF-8 bytes."""
    return sum(len(part.encode()) for part in parts if part)
