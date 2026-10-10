"""Durable model-request accounting. A failed request still consumes a request slot."""

import hashlib
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import case, func, select

from app.core.config import Settings
from app.db.base import SessionScope
from app.db.models import AgentRequest


class AgentLimitReached(RuntimeError):
    """A request was stopped before another model call was sent."""


@dataclass(frozen=True)
class UsageTotals:
    model_requests: int
    research_requests: int
    input_tokens: int
    output_tokens: int
    thought_tokens: int
    total_tokens: int
    unreported_requests: int
    search_queries: int


class UsageStore:
    def __init__(self, scope: SessionScope, user_id: UUID, session_id: str):
        self.scope = scope
        self.user_id = user_id
        self.session_id = session_id

    def _owned(self):
        return select(AgentRequest).where(
            AgentRequest.user_id == self.user_id, AgentRequest.session_id == self.session_id
        )

    def reserve(self, invocation_id: str, model: str, research: bool, settings: Settings) -> UUID:
        with self.scope() as session:
            # Serialize only the short reservation transaction, not the model/network call.
            if session.get_bind().dialect.name == "postgresql":
                key = f"{self.user_id}:{self.session_id}".encode()
                lock_id = int.from_bytes(hashlib.blake2b(key, digest_size=8).digest(), signed=True)
                session.execute(select(func.pg_advisory_xact_lock(lock_id)))
            elif session.get_bind().dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            rows = list(session.scalars(self._owned()))
            turn = [row for row in rows if row.invocation_id == invocation_id]
            if len(turn) >= settings.agent_max_calls_per_turn:
                raise AgentLimitReached("The model-call limit for this reply was reached.")
            if len(rows) >= settings.agent_max_calls_per_session:
                raise AgentLimitReached("The model-call limit for this conversation was reached.")
            if research and (
                sum(row.research for row in turn) >= settings.agent_max_research_per_turn
                or sum(row.research for row in rows) >= settings.agent_max_research_per_session
            ):
                raise AgentLimitReached("The research-request limit was reached.")
            row = AgentRequest(
                user_id=self.user_id,
                session_id=self.session_id,
                invocation_id=invocation_id,
                model=model,
                research=research,
            )
            session.add(row)
            session.flush()
            return row.id

    def record(self, request_id: UUID, **usage: int | bool) -> None:
        with self.scope() as session:
            row = session.scalars(self._owned().where(AgentRequest.id == request_id)).one()
            for key, value in usage.items():
                setattr(row, key, value)

    def totals(self) -> UsageTotals:
        with self.scope() as session:
            rows = self._owned().subquery()
            values = session.execute(
                select(
                    func.count(rows.c.id),
                    func.coalesce(func.sum(case((rows.c.research, 1), else_=0)), 0),
                    *[
                        func.coalesce(func.sum(rows.c[name]), 0)
                        for name in (
                            "input_tokens",
                            "output_tokens",
                            "thought_tokens",
                            "total_tokens",
                        )
                    ],
                    func.coalesce(func.sum(case((rows.c.reported, 0), else_=1)), 0),
                    func.coalesce(func.sum(rows.c.search_queries), 0),
                )
            ).one()
            return UsageTotals(*(int(value) for value in values))
