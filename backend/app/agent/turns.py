"""Small database queue. Accepted messages survive disconnects and process restarts."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, update

from app.db.base import SessionScope
from app.db.models import AgentTurn, User

ACTIVE = ("queued", "running")
INTERRUPTED = (
    "This reply was interrupted. It was not automatically retried; already saved work remains."
)


class TurnConflict(ValueError):
    pass


def turn_data(row: AgentTurn) -> dict:
    return {
        name: getattr(row, name)
        for name in (
            "id",
            "request_id",
            "session_id",
            "message",
            "status",
            "reply",
            "error",
            "tool_name",
            "created_at",
            "updated_at",
        )
    }


class TurnStore:
    def __init__(self, scope: SessionScope):
        self.scope = scope

    def submit(self, user_id: UUID, session_id: str, request_id: UUID, message: str) -> dict:
        with self.scope() as session:
            if session.get_bind().dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            # Serialize submissions, not execution. The partial unique index is a second guard.
            session.execute(select(User.id).where(User.id == user_id).with_for_update()).one()
            owned = select(AgentTurn).where(
                AgentTurn.user_id == user_id, AgentTurn.session_id == session_id
            )
            existing = session.scalar(owned.where(AgentTurn.request_id == request_id))
            if existing:
                if existing.message != message:
                    raise TurnConflict("This request ID was already used for a different message.")
                return turn_data(existing)
            if session.scalar(owned.where(AgentTurn.status.in_(ACTIVE))):
                raise TurnConflict("A reply is already queued or running in this conversation.")
            row = AgentTurn(
                user_id=user_id, session_id=session_id, request_id=request_id, message=message
            )
            session.add(row)
            session.flush()
            return turn_data(row)

    def conversation(self, user_id: UUID, session_id: str) -> list[dict]:
        with self.scope() as session:
            rows = session.scalars(
                select(AgentTurn)
                .where(AgentTurn.user_id == user_id, AgentTurn.session_id == session_id)
                .order_by(AgentTurn.created_at, AgentTurn.id)
            )
            return [turn_data(row) for row in rows]

    def get(self, user_id: UUID, turn_id: UUID) -> dict | None:
        with self.scope() as session:
            row = session.scalar(
                select(AgentTurn).where(AgentTurn.user_id == user_id, AgentTurn.id == turn_id)
            )
            return turn_data(row) if row else None

    def summaries(self, user_id: UUID) -> list[dict]:
        with self.scope() as session:
            rows = session.execute(
                select(AgentTurn.session_id, AgentTurn.message, AgentTurn.updated_at)
                .where(AgentTurn.user_id == user_id)
                .order_by(AgentTurn.created_at, AgentTurn.id)
            )
            summaries = {}
            for session_id, message, updated_at in rows:
                summary = summaries.setdefault(
                    session_id,
                    {
                        "session_id": session_id,
                        "first_message": message,
                        "updated_at": updated_at,
                    },
                )
                summary["updated_at"] = max(summary["updated_at"], updated_at)
            return list(summaries.values())

    def claim(self, timeout_seconds: int) -> dict | None:
        now = datetime.now(timezone.utc)
        with self.scope() as session:
            if session.get_bind().dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            session.execute(
                update(AgentTurn)
                .where(AgentTurn.status == "running", AgentTurn.lease_until < now)
                .values(status="interrupted", error=INTERRUPTED, lease_until=None, tool_name=None)
            )
            row = session.scalar(
                select(AgentTurn)
                .where(AgentTurn.status == "queued")
                .order_by(AgentTurn.created_at, AgentTurn.id)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            if row is None:
                return None
            row.status = "running"
            row.lease_until = now + timedelta(seconds=timeout_seconds + 30)
            session.flush()
            return {**turn_data(row), "user_id": row.user_id}

    def progress(self, turn_id: UUID, event: dict) -> None:
        with self.scope() as session:
            row = session.scalar(
                select(AgentTurn)
                .where(AgentTurn.id == turn_id, AgentTurn.status == "running")
                .with_for_update()
            )
            if row is None:
                return
            if event["type"] == "agent.tool":
                row.tool_name = event["name"]
            elif event["type"] == "agent.message":
                row.reply = "\n\n".join(filter(None, [row.reply, event["text"]]))

    def finish(
        self, turn_id: UUID, status: str, *, reply: str | None = None, error: str | None = None
    ) -> None:
        with self.scope() as session:
            values = {"status": status, "error": error, "lease_until": None, "tool_name": None}
            if reply is not None:
                values["reply"] = reply
            session.execute(
                update(AgentTurn)
                .where(AgentTurn.id == turn_id, AgentTurn.status == "running")
                .values(**values)
            )
