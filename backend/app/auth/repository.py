"""User lookups; users own rows rather than being owned, so the plain repository fits."""

from app.db.models import User
from app.db.repository import Repository


class UserRepository(Repository[User]):
    model = User

    def get_by_email(self, email: str) -> User | None:
        return self.session.scalars(self._select().where(User.email == email)).one_or_none()
