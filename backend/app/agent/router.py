"""Submit an owned turn, then read durable status and conversation snapshots over HTTP."""

import asyncio
from dataclasses import asdict
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.agent.service import load_chat_sessions, load_history
from app.agent.turns import TurnConflict, TurnStore
from app.auth.deps import CurrentUserId, SessionScopeDep
from app.agent.usage import UsageStore
from app.core.config import get_settings

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=8000)
    request_id: UUID


class ChatTurn(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: UUID
    request_id: UUID
    session_id: str
    message: str
    status: Literal["queued", "running", "completed", "failed", "interrupted"]
    reply: str | None
    error: str | None
    tool_name: str | None
    created_at: datetime
    updated_at: datetime


class ChatMessage(BaseModel):
    role: Literal["you", "atlas"]
    text: str


class ChatHistory(BaseModel):
    # The frontend reads camelCase, as everywhere else the API is consumed.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str
    messages: list[ChatMessage]
    latest_turn: ChatTurn | None = None


class ChatSessionSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str
    first_message: str | None
    updated_at: datetime


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


@router.get("/chat/{session_id}", response_model=ChatHistory)
async def history(session_id: str, user_id: CurrentUserId, scope: SessionScopeDep) -> ChatHistory:
    """Prior turns for one session — an unknown id is an empty, not-yet-started conversation."""
    messages = await load_history(user_id, session_id)
    rows = await asyncio.to_thread(TurnStore(scope).conversation, user_id, session_id)
    visible = [ChatMessage(role=message.role, text=message.text) for message in messages]
    for row in rows:
        visible.append(ChatMessage(role="you", text=row["message"]))
        if row["reply"]:
            visible.append(ChatMessage(role="atlas", text=row["reply"]))
    return ChatHistory(
        session_id=session_id,
        messages=visible,
        latest_turn=ChatTurn(**rows[-1]) if rows else None,
    )


@router.get("/sessions", response_model=list[ChatSessionSummary])
async def sessions(user_id: CurrentUserId) -> list[ChatSessionSummary]:
    """Every conversation this user has had, most recently active first."""
    return [
        ChatSessionSummary(
            session_id=summary.session_id,
            first_message=summary.first_message,
            updated_at=summary.updated_at,
        )
        for summary in await load_chat_sessions(user_id)
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
    session_budget_microusd: int


@router.get("/chat/{session_id}/usage", response_model=AgentUsage)
async def usage(session_id: str, user_id: CurrentUserId, scope: SessionScopeDep) -> AgentUsage:
    """Owned provider usage. Unreported requests are unknown, not free."""
    totals = await asyncio.to_thread(UsageStore(scope, user_id, session_id).totals)
    return AgentUsage(
        **asdict(totals), session_budget_microusd=get_settings().agent_session_budget_microusd
    )
