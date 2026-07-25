"""Data access: a generic repository plus the scoped one that enforces ownership."""

from collections.abc import Sequence
from typing import Generic, TypeVar
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.db.models import OwnedRecord, Record

RecordT = TypeVar("RecordT", bound=Record)
OwnedT = TypeVar("OwnedT", bound=OwnedRecord)


class NotOwned(PermissionError):
    """Raised when a caller reaches a row belonging to somebody else."""


class Repository(Generic[RecordT]):
    """Session-scoped CRUD for one model."""

    model: type[RecordT]

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, record_id: UUID) -> RecordT | None:
        return self.session.scalars(self._select().where(self.model.id == record_id)).one_or_none()

    def list(self) -> Sequence[RecordT]:
        return self.session.scalars(self._select()).all()

    def add(self, record: RecordT) -> RecordT:
        self.session.add(record)
        self.session.flush()
        return record

    def delete(self, record: RecordT) -> None:
        self.session.delete(record)

    def _select(self) -> Select[tuple[RecordT]]:
        return select(self.model)


class OwnedRepository(Repository[OwnedT]):
    """Scopes every read and stamps every write, so ownership lives in exactly one place."""

    model: type[OwnedT]

    def __init__(self, session: Session, user_id: UUID) -> None:
        super().__init__(session)
        self.user_id = user_id

    def add(self, record: OwnedT) -> OwnedT:
        record.user_id = self.user_id
        return super().add(record)

    def delete(self, record: OwnedT) -> None:
        if record.user_id != self.user_id:
            raise NotOwned(f"{type(record).__name__} {record.id} belongs to another user")
        super().delete(record)

    def _select(self) -> Select[tuple[OwnedT]]:
        return super()._select().where(self.model.user_id == self.user_id)
