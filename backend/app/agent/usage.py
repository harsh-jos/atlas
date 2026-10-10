"""Durable model-request accounting. A failed request still consumes a request slot."""

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import case, func, select

from app.agent.pricing import estimate_cost, token_rates
from app.core.config import Settings
from app.db.base import SessionScope
from app.db.models import AgentRequest


class AgentLimitReached(RuntimeError):
    """A request was stopped before another model call was sent."""

    def __init__(self, message: str, code: str = "model_limit"):
        super().__init__(message)
        self.code = code


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
    estimated_cost_microusd: int
    unpriced_requests: int


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
            current_turn = AgentRequest.invocation_id == invocation_id
            stats = session.execute(self._owned().with_only_columns(
                func.count().label("total"),
                func.coalesce(func.sum(case((current_turn, 1), else_=0)), 0).label("turn"),
                func.coalesce(func.sum(case((AgentRequest.research, 1), else_=0)), 0).label("research"),
                func.coalesce(func.sum(case((current_turn & AgentRequest.research, 1), else_=0)), 0).label("turn_research"),
                func.coalesce(func.sum(case((AgentRequest.estimated_cost_microusd.is_(None), 1), else_=0)), 0).label("unknown"),
                func.coalesce(func.sum(AgentRequest.estimated_cost_microusd), 0).label("spent"),
            )).one()
            if stats.turn >= settings.agent_max_calls_per_turn:
                raise AgentLimitReached("The model-call limit for this reply was reached.")
            if stats.total >= settings.agent_max_calls_per_session:
                raise AgentLimitReached("The model-call limit for this conversation was reached.")
            if research and (
                stats.turn_research >= settings.agent_max_research_per_turn
                or stats.research >= settings.agent_max_research_per_session
            ):
                raise AgentLimitReached("The research-request limit was reached.", "research_limit")
            if settings.agent_session_budget_microusd:
                rates = token_rates(
                    model, settings.vertex_location, datetime.now(timezone.utc).date()
                )
                if rates is None:
                    raise AgentLimitReached("No verified price is configured for this model.", "price_unknown")
                # A pending request holds the session's remaining budget. Failed or interrupted
                # requests retain that hold instead of silently being treated as free.
                if stats.unknown:
                    raise AgentLimitReached(
                        "A previous model request has pending or unknown cost. "
                        "Further spending in this conversation is blocked.", "cost_unknown"
                    )
                if stats.spent >= settings.agent_session_budget_microusd:
                    raise AgentLimitReached("The spending limit for this conversation was reached.", "budget_limit")
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

    def record(
        self,
        request_id: UUID,
        settings: Settings,
        *,
        search_reported: bool = True,
        **usage: int | bool,
    ) -> None:
        with self.scope() as session:
            row = session.scalars(self._owned().where(AgentRequest.id == request_id)).one()
            for key, value in usage.items():
                setattr(row, key, value)
            rates = token_rates(row.model, settings.vertex_location, row.created_at.date())
            if rates and row.reported and (not row.research or search_reported):
                row.estimated_cost_microusd = estimate_cost(
                    rates,
                    row.input_tokens,
                    row.output_tokens,
                    row.thought_tokens,
                    row.total_tokens,
                    row.search_queries if row.research else 0,
                )

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
                    func.coalesce(func.sum(rows.c.estimated_cost_microusd), 0),
                    func.coalesce(
                        func.sum(case((rows.c.estimated_cost_microusd.is_(None), 1), else_=0)), 0
                    ),
                )
            ).one()
            return UsageTotals(*(int(value) for value in values))
