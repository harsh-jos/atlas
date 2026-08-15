"""Chat with the agent over HTTP; what it is doing streams to the caller's WebSocket."""

import logging
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.agent.service import AgentUnavailable, load_chat_sessions, load_history, run_turn
from app.auth.deps import CurrentUserId

log = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=8000)


class ChatResponse(BaseModel):
    reply: str


class ChatMessage(BaseModel):
    role: Literal["you", "atlas"]
    text: str


class ChatHistory(BaseModel):
    # The frontend reads camelCase, as everywhere else the API is consumed.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str
    messages: list[ChatMessage]


class ChatSessionSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str
    first_message: str | None
    updated_at: datetime


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user_id: CurrentUserId) -> ChatResponse:
    """One turn. Connect to /ws first to watch the tool calls arrive live."""
    try:
        reply = await run_turn(user_id, request.session_id, request.message)
    except AgentUnavailable as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from None
    except Exception:
        # One failed turn must not read as a broken app; the trace goes to the log, not the user.
        log.exception("agent turn failed")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "The agent could not finish that turn. Try again."
        ) from None
    return ChatResponse(reply=reply)


@router.get("/chat/{session_id}", response_model=ChatHistory)
async def history(session_id: str, user_id: CurrentUserId) -> ChatHistory:
    """Prior turns for one session — an unknown id is an empty, not-yet-started conversation."""
    messages = await load_history(user_id, session_id)
    return ChatHistory(
        session_id=session_id,
        messages=[ChatMessage(role=message.role, text=message.text) for message in messages],
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
