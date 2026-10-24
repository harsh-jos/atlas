"""Durable model-request accounting. A failed request still consumes a request slot."""

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, case, func, select

from app.agent.pricing import estimate_cost, token_rates
from app.core.config import Settings
from app.db.base import SessionScope
from app.db.models import AgentRequest, User
from app.core.enums import Role


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
    cached_input_tokens: int
    cache_unreported_requests: int
    rejected_requests: int


class UsageStore:
    def __init__(self, scope: SessionScope, user_id: UUID, session_id: str | None = None):
        self.scope = scope
        self.user_id = user_id
        self.session_id = session_id

    def _owned(self):
        statement = select(AgentRequest).where(AgentRequest.user_id == self.user_id)
        return statement.where(AgentRequest.session_id == self.session_id) if self.session_id is not None else statement

    def reserve(self, invocation_id: str, model: str, research: bool, settings: Settings) -> UUID:
        with self.scope() as session:
            # Lock the account across all conversations before admitting any spending.
            if session.get_bind().dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            role = session.scalar(select(User.role).where(User.id == self.user_id).with_for_update())
            current_turn = AgentRequest.invocation_id == invocation_id
            stats = session.execute(select(AgentRequest).where(AgentRequest.user_id == self.user_id).with_only_columns(
                func.coalesce(func.sum(case((current_turn, 1), else_=0)), 0).label("turn"),
                func.coalesce(func.sum(case((current_turn & AgentRequest.research, 1), else_=0)), 0).label("turn_research"),
                func.coalesce(func.sum(case((and_(AgentRequest.estimated_cost_microusd.is_(None), ~AgentRequest.rejected), 1), else_=0)), 0).label("unknown"),
                func.coalesce(func.sum(AgentRequest.estimated_cost_microusd), 0).label("spent"),
            )).one()
            if stats.turn >= settings.agent_max_calls_per_turn:
                raise AgentLimitReached("The model-call limit for this reply was reached.")
            if research and stats.turn_research >= settings.agent_max_research_per_turn:
                raise AgentLimitReached("The research-request limit was reached.", "research_limit")
            if role != Role.SUPERUSER and settings.agent_account_budget_microusd:
                rates = token_rates(
                    model, settings.vertex_location, datetime.now(timezone.utc).date()
                )
                if rates is None:
                    raise AgentLimitReached("No verified price is configured for this model.", "price_unknown")
                # A pending request holds the account's remaining budget. Failed or interrupted
                # requests retain that hold instead of silently being treated as free.
                if stats.unknown:
                    raise AgentLimitReached(
                        "A previous model request has pending or unknown cost. "
                        "Further spending on this account is blocked.", "cost_unknown"
                    )
                if stats.spent >= settings.agent_account_budget_microusd:
                    raise AgentLimitReached("Your free account has used all its credits.", "budget_limit")
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

    def reject(self, request_id: UUID) -> None:
        """Release a confirmed capacity rejection without inventing token usage or cost."""
        with self.scope() as session:
            row = session.scalars(self._owned().where(AgentRequest.id == request_id).with_for_update()).one()
            if row.reported or row.estimated_cost_microusd is not None:
                raise ValueError("A request with reported usage cannot be marked rejected.")
            row.rejected = True

    def record(
        self,
        request_id: UUID,
        settings: Settings,
        *,
        search_reported: bool = True,
        **usage: int | bool | None,
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
                    cached_input_tokens=row.cached_input_tokens or 0,
                    cached_input_rate=rates[0] // (20 if row.model == "gemini-4-argon" else 10),
                )

    def account_summary(self, settings: Settings) -> dict:
        totals = UsageStore(self.scope, self.user_id).totals()
        with self.scope() as session:
            user = session.get(User, self.user_id)
            limit = None if user.role == Role.SUPERUSER or not settings.agent_account_budget_microusd else settings.agent_account_budget_microusd / 10_000
            used = totals.estimated_cost_microusd / 10_000
            return {
                "id": user.id, "email": user.email, "role": user.role,
                "created_at": user.created_at,
                "credits_used": used, "credit_limit": limit,
                "credits_remaining": None if limit is None else max(0, limit - used),
                "credits_pending": totals.unpriced_requests > 0,
                "can_chat": limit is None or (used < limit and totals.unpriced_requests == 0),
            }

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
                    func.coalesce(func.sum(case((and_(~rows.c.reported, ~rows.c.rejected), 1), else_=0)), 0),
                    func.coalesce(func.sum(rows.c.search_queries), 0),
                    func.coalesce(func.sum(rows.c.estimated_cost_microusd), 0),
                    func.coalesce(
                        func.sum(case((and_(rows.c.estimated_cost_microusd.is_(None), ~rows.c.rejected), 1), else_=0)), 0
                    ),
                    func.coalesce(func.sum(rows.c.cached_input_tokens), 0),
                    func.coalesce(func.sum(case((and_(rows.c.cached_input_tokens.is_(None), ~rows.c.rejected), 1), else_=0)), 0),
                    func.coalesce(func.sum(case((rows.c.rejected, 1), else_=0)), 0),
                )
            ).one()
            return UsageTotals(*(int(value) for value in values))
