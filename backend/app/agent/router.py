"""Chat with the agent over HTTP; what it is doing streams to the caller's WebSocket."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.agent.service import AgentUnavailable, run_turn
from app.auth.deps import CurrentUserId

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=8000)


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user_id: CurrentUserId) -> ChatResponse:
    """One turn. Connect to /ws first to watch the tool calls arrive live."""
    try:
        reply = await run_turn(user_id, request.session_id, request.message)
    except AgentUnavailable as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from None
    return ChatResponse(reply=reply)
