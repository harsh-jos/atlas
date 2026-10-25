"""Submit owned turns, stream durable events, and restore conversation snapshots."""

import asyncio
from dataclasses import asdict
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.agent.service import load_chat_sessions, load_history
from app.agent.turns import TurnConflict, TurnStore
from app.agent.stream import events as stream_events
from app.auth.deps import CurrentUserId, SessionScopeDep
from app.agent.usage import UsageStore
from app.agent.models import ChatModel
from app.core.config import get_settings

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=8000)
    request_id: UUID
    model: ChatModel | None = None


class ToolError(BaseModel):
    name: str
    code: str
    message: str


class ChatTurn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: UUID
    request_id: UUID
    model: str | None = None
    session_id: str
    message: str
    status: Literal["queued", "running", "completed", "failed", "interrupted", "cancelled", "incomplete"]
    credits_used: float | None = None
    credits_pending: bool = False
    cancel_requested: bool
    reply: str | None
    response_document: dict | None = None
    enrichment_status: str | None = None
    enrichment_error: str | None = None
    error: str | None
    error_code: str | None = None
    tool_errors: list[ToolError] = Field(default_factory=list)
    tool_name: str | None
    created_at: datetime
    updated_at: datetime


class ChatMessage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    role: Literal["you", "atlas"]
    text: str
    document: dict | None = None
    turn_id: UUID | None = None
    credits_used: float | None = None
    credits_pending: bool = False


class AccountUsage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: UUID
    email: str
    role: Literal["NORMAL", "SUPERUSER"]
    created_at: datetime
    credits_used: float
    credit_limit: float | None
    credits_remaining: float | None
    credits_pending: bool
    can_chat: bool


@router.get("/account", response_model=AccountUsage)
async def account(user_id: CurrentUserId, scope: SessionScopeDep):
    return await asyncio.to_thread(UsageStore(scope, user_id).account_summary, get_settings())


class ChatHistory(BaseModel):
    # The frontend reads camelCase, as everywhere else the API is consumed.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str
    messages: list[ChatMessage]
    credits_used: float = 0
    account: AccountUsage
    credits_pending: bool = False
    latest_turn: ChatTurn | None = None
    has_more: bool = False
    next_before: UUID | None = None
    next_legacy_offset: int = 0


class ChatSessionSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str
    first_message: str | None
    updated_at: datetime


class ConversationAllowance(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    used: int
    limit: int | None
    can_start: bool


@router.get("/conversations/allowance", response_model=ConversationAllowance)
async def conversation_allowance(user_id: CurrentUserId, scope: SessionScopeDep):
    return await asyncio.to_thread(TurnStore(scope).conversation_allowance, user_id)


@router.post("/chat", response_model=ChatTurn, status_code=status.HTTP_202_ACCEPTED)
async def chat(request: ChatRequest, user_id: CurrentUserId, scope: SessionScopeDep) -> ChatTurn:
    """Commit before acknowledging. Retrying the same request ID returns the same turn."""
    if not get_settings().vertex_project:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "the agent is not configured: set VERTEX_PROJECT"
        )
    try:
        row = await asyncio.to_thread(
            TurnStore(scope).submit,
            user_id,
            request.session_id,
            request.request_id,
            request.message,
            request.model,
        )
    except TurnConflict as error:
        raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from None
    return ChatTurn(**row)


@router.get("/turns/{turn_id}", response_model=ChatTurn)
async def turn(turn_id: UUID, user_id: CurrentUserId, scope: SessionScopeDep) -> ChatTurn:
    row = await asyncio.to_thread(TurnStore(scope).get, user_id, turn_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "turn not found")
    return ChatTurn(**row)


@router.get("/turns/{turn_id}/events")
async def turn_events(turn_id: UUID, user_id: CurrentUserId, scope: SessionScopeDep,
                      last_event_id: str | None = Header(None)):
    store = TurnStore(scope)
    state = await asyncio.to_thread(store.stream_snapshot, user_id, turn_id)
    if state is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "turn not found")
    after = None
    if last_event_id is not None:
        try:
            after = int(last_event_id)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid event cursor") from None
        if after < 0 or after > state[1]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid event cursor")

    def snapshot(row, tools):
        return {"type": "turn.snapshot", "turn": ChatTurn(**row).model_dump(
            mode="json", by_alias=True), "tools": tools}

    return StreamingResponse(
        stream_events(store, user_id, turn_id, after, snapshot),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.get("/chat/{session_id}", response_model=ChatHistory)
async def history(session_id: str, user_id: CurrentUserId, scope: SessionScopeDep,
                  before: UUID | None = None,
                  legacy_offset: int = Query(0, ge=0, le=1000000)) -> ChatHistory:
    """A bounded page, newest first in storage and chronological on the wire."""
    rows = await asyncio.to_thread(TurnStore(scope).conversation, user_id, session_id, 101, before)
    managed_more = len(rows) > 100
    if managed_more:
        rows = rows[1:]
    messages = []
    if not managed_more:
        messages = (await load_history(user_id, session_id) if legacy_offset == 0
                    else await load_history(user_id, session_id, offset=legacy_offset))
    legacy_more = len(messages) > 200
    if legacy_more:
        messages = messages[1:]
    visible = [ChatMessage(role=message.role, text=message.text) for message in messages]
    for row in rows:
        visible.append(ChatMessage(role="you", text=row["message"], turn_id=row["id"],
            credits_used=row["credits_used"] if not row["reply"] else None,
            credits_pending=row["credits_pending"] if not row["reply"] else False))
        if row["reply"]:
            visible.append(ChatMessage(role="atlas", text=row["reply"], turn_id=row["id"], document=row.get("response_document"),
                credits_used=row["credits_used"], credits_pending=row["credits_pending"]))
    totals = await asyncio.to_thread(UsageStore(scope, user_id, session_id).totals)
    account_usage = await asyncio.to_thread(UsageStore(scope, user_id).account_summary, get_settings())
    return ChatHistory(
        credits_used=totals.estimated_cost_microusd / 10_000,
        account=AccountUsage(**account_usage),
        credits_pending=totals.unpriced_requests > 0,
        session_id=session_id, messages=visible,
        latest_turn=ChatTurn(**rows[-1]) if rows else None,
        has_more=managed_more or legacy_more,
        next_before=rows[0]["id"] if rows else before,
        next_legacy_offset=legacy_offset + len(messages),
    )


@router.get("/sessions", response_model=list[ChatSessionSummary])
async def sessions(user_id: CurrentUserId, limit: int = Query(100, ge=1, le=100),
                   offset: int = Query(0, ge=0, le=10000)) -> list[ChatSessionSummary]:
    """Every conversation this user has had, most recently active first."""
    summaries = (await load_chat_sessions(user_id) if limit == 100 and offset == 0
                 else await load_chat_sessions(user_id, limit=limit, offset=offset))
    return [
        ChatSessionSummary(
            session_id=summary.session_id,
            first_message=summary.first_message,
            updated_at=summary.updated_at,
        )
        for summary in summaries
    ]


class AgentUsage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

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
    account_budget_microusd: int
    cached_input_tokens: int
    cache_unreported_requests: int
    rejected_requests: int


@router.get("/chat/{session_id}/usage", response_model=AgentUsage)
async def usage(session_id: str, user_id: CurrentUserId, scope: SessionScopeDep) -> AgentUsage:
    """Owned provider usage. Unreported requests are unknown, not free."""
    totals = await asyncio.to_thread(UsageStore(scope, user_id, session_id).totals)
    return AgentUsage(
        **asdict(totals), account_budget_microusd=get_settings().agent_account_budget_microusd
    )


@router.get("/chat/{session_id}/turn/{turn_id}", response_model=list[ChatMessage])
async def focused_turn(session_id: str, turn_id: UUID, user_id: CurrentUserId, scope: SessionScopeDep):
    row = await asyncio.to_thread(TurnStore(scope).get, user_id, turn_id)
    if not row or row["session_id"] != session_id:
        raise HTTPException(404, "turn not found")
    result = [ChatMessage(role="you", text=row["message"], turn_id=turn_id)]
    if row["reply"]:
        result.append(ChatMessage(role="atlas", text=row["reply"], turn_id=turn_id, document=row.get("response_document")))
    return result
