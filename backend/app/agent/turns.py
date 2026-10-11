"""Small database queue. Accepted messages survive disconnects and process restarts."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select, tuple_

from app.db.base import SessionScope
from app.db.models import AgentTurn, AgentTurnEvent, User
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

    @staticmethod
    def _event(session, row: AgentTurn, data: dict) -> None:
        # Callers hold the turn lock. The log, snapshot and notification commit together.
        row.event_sequence += 1
        session.add(AgentTurnEvent(turn_id=row.id, sequence=row.event_sequence, data=data))
        if session.get_bind().dialect.name == "postgresql":
            session.execute(select(func.pg_notify(f"atlas_turn_{row.id.hex}", "changed")))

    def stream_snapshot(self, user_id: UUID, turn_id: UUID) -> tuple[dict, int, list] | None:
        with self.scope() as session:
            row = session.scalar(select(AgentTurn).where(
                AgentTurn.user_id == user_id, AgentTurn.id == turn_id
            ).with_for_update(read=True))
            if row is None:
                return None
            # Lock prevents a writer advancing the snapshot between reading it and its cursor.
            tools = session.scalars(select(AgentTurnEvent).where(
                AgentTurnEvent.turn_id == turn_id,
                AgentTurnEvent.data["type"].as_string().in_(
                    ("agent.tool", "agent.tool_result", "agent.tool_error")
                ),
            ).order_by(AgentTurnEvent.sequence.desc()).limit(100)).all()
            return turn_data(row), row.event_sequence, [event.data for event in reversed(tools)]

    def events(self, user_id: UUID, turn_id: UUID, after: int) -> list[dict]:
        with self.scope() as session:
            rows = session.scalars(select(AgentTurnEvent).join(AgentTurn).where(
                AgentTurn.user_id == user_id, AgentTurnEvent.turn_id == turn_id,
                AgentTurnEvent.sequence > after,
            ).order_by(AgentTurnEvent.sequence).limit(250)).all()
            return [{"id": row.sequence, "data": row.data} for row in rows]

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

    def conversation(self, user_id: UUID, session_id: str, limit: int = 101,
                     before: UUID | None = None) -> list[dict]:
        with self.scope() as session:
            statement = select(AgentTurn).where(
                AgentTurn.user_id == user_id, AgentTurn.session_id == session_id)
            if before is not None:
                cursor = session.scalar(statement.where(AgentTurn.id == before))
                if cursor is None:
                    return []
                statement = statement.where(
                    tuple_(AgentTurn.created_at, AgentTurn.id) < (cursor.created_at, cursor.id))
            rows = session.scalars(statement.order_by(
                AgentTurn.created_at.desc(), AgentTurn.id.desc()).limit(limit)).all()
            return [turn_data(row) for row in reversed(rows)]

    def get(self, user_id: UUID, turn_id: UUID) -> dict | None:
        with self.scope() as session:
            row = session.scalar(
                select(AgentTurn).where(AgentTurn.user_id == user_id, AgentTurn.id == turn_id)
            )
            return turn_data(row) if row else None

    def summaries(self, user_id: UUID, limit: int = 100) -> list[dict]:
        with self.scope() as session:
            ranked = (
                select(AgentTurn.session_id, AgentTurn.message,
                       func.max(AgentTurn.updated_at).over(
                           partition_by=AgentTurn.session_id).label("updated_at"),
                       func.row_number().over(
                           partition_by=AgentTurn.session_id,
                           order_by=(AgentTurn.created_at, AgentTurn.id)).label("position"))
                .where(AgentTurn.user_id == user_id).subquery()
            )
            rows = session.execute(
                select(ranked.c.session_id, ranked.c.message.label("first_message"), ranked.c.updated_at)
                .where(ranked.c.position == 1)
                .order_by(ranked.c.updated_at.desc(), ranked.c.session_id).limit(limit)
            )
            return [dict(row._mapping) for row in rows]

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
                self._event(session, row, {"type": "turn.status", "status": row.status,
                                           "cancelRequested": True})
                session.flush()
            return turn_data(row)

    def claim(self, timeout_seconds: int) -> dict | None:
        now = datetime.now(timezone.utc)
        with self.scope() as session:
            if session.get_bind().dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            expired = session.scalars(select(AgentTurn).where(
                AgentTurn.status == "running", AgentTurn.lease_until < now
            ).with_for_update(skip_locked=True)).all()
            for stale in expired:
                stale.status = "cancelled" if stale.cancel_requested else "interrupted"
                stale.error = STOPPED if stale.cancel_requested else INTERRUPTED
                stale.error_code = stale.status
                stale.lease_until = stale.tool_name = None
                self._event(session, stale, {"type": "turn.status", "status": stale.status})
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
            self._event(session, row, {"type": "turn.status", "status": "running"})
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
            elif event["type"] == "agent.tool_result":
                if row.tool_name == event["name"]:
                    row.tool_name = None
            elif event["type"] == "agent.delta":
                row.tool_name = None
                row.reply = (row.reply or "") + event["text"]
            elif event["type"] == "agent.message":
                row.tool_name = None
                row.reply = event.get("reply", "\n\n".join(filter(None, [row.reply, event["text"]])))
            elif event["type"] == "agent.tool_error":
                row.tool_errors = [*row.tool_errors, {
                    "name": event["name"], "code": event["code"], "message": event["message"]
                }][-10:]
            self._event(session, row, event)

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
            self._event(session, row, {"type": "turn.status", "status": row.status})
