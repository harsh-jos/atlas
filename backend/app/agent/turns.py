"""Small database queue. Accepted messages survive disconnects and process restarts."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import case, func, select, update

from app.db.base import SessionScope
from app.db.models import AgentTurn, User
from app.core.config import get_settings
from app.core.errors import AppError

ACTIVE = ("queued", "running")
STOPPED = "Stopped. Already saved work remains."
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
            "cancel_requested",
            "reply",
            "error",
            "error_code",
            "tool_errors",
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
            # Serialize global admission only; execution and reads never hold this lock.
            if session.get_bind().dialect.name == "postgresql":
                session.execute(select(func.pg_advisory_xact_lock(817234601)))
            settings = get_settings()
            active = select(func.count()).select_from(AgentTurn).where(AgentTurn.status.in_(ACTIVE))
            if session.scalar(active.where(AgentTurn.user_id == user_id)) >= settings.agent_max_active_turns_per_user:
                raise AppError("You already have several replies waiting. Stop one or wait for it to finish.", "user_queue_full", 429)
            if session.scalar(active) >= settings.agent_max_active_turns:
                raise AppError("Atlas is busy. Try again after a reply finishes.", "queue_full", 503)
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

    def cancel(self, user_id: UUID, turn_id: UUID) -> dict | None:
        with self.scope() as session:
            if session.get_bind().dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            row = session.scalar(
                select(AgentTurn)
                .where(AgentTurn.user_id == user_id, AgentTurn.id == turn_id)
                .with_for_update()
            )
            if row is None:
                return None
            if row.status in ACTIVE:
                row.cancel_requested = True
                if row.status == "queued":
                    row.status, row.error = "cancelled", STOPPED
                    row.error_code = "cancelled"
                session.flush()
            return turn_data(row)

    def claim(self, timeout_seconds: int) -> dict | None:
        now = datetime.now(timezone.utc)
        with self.scope() as session:
            if session.get_bind().dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            session.execute(
                update(AgentTurn)
                .where(AgentTurn.status == "running", AgentTurn.lease_until < now)
                .values(
                    status=case((AgentTurn.cancel_requested, "cancelled"), else_="interrupted"),
                    error=case((AgentTurn.cancel_requested, STOPPED), else_=INTERRUPTED),
                    error_code=case((AgentTurn.cancel_requested, "cancelled"), else_="interrupted"),
                    lease_until=None,
                    tool_name=None,
                )
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
            elif event["type"] == "agent.tool_error":
                row.tool_errors = [*row.tool_errors, {
                    "name": event["name"], "code": event["code"], "message": event["message"]
                }][-10:]

    def finish(
        self, turn_id: UUID, status: str, *, reply: str | None = None, error: str | None = None,
        error_code: str | None = None,
    ) -> None:
        with self.scope() as session:
            if session.get_bind().dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            row = session.scalar(
                select(AgentTurn)
                .where(AgentTurn.id == turn_id, AgentTurn.status == "running")
                .with_for_update()
            )
            if row is None:
                return
            row.status = "cancelled" if row.cancel_requested else status
            row.error = STOPPED if row.cancel_requested else error
            row.error_code = "cancelled" if row.cancel_requested else (
                error_code or ("interrupted" if status == "interrupted" else None)
            )
            row.lease_until = row.tool_name = None
            if reply is not None:
                row.reply = reply
