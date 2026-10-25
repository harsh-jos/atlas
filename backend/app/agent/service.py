"""Build and run the owned guide. Execution does not depend on a browser connection."""

import asyncio
from uuid import UUID

from google.auth.exceptions import DefaultCredentialsError, RefreshError
from google.genai.errors import APIError

from app.agent.root import build_agent
from app.agent.limits import RequestLimits
from app.agent.usage import UsageStore
from app.agent.session import (
    EventSink,
    HistoryMessage,
    SessionSummary,
    ask,
    list_chat_sessions,
    read_history,
)
from app.agent.turns import TurnStore
from app.agent.toolkit import build_toolkit
from app.agent.context import PREFERENCES_KEY, CONTEXT_KEY
from app.db.models import AgentTurn
from sqlalchemy import select
from app.agent.knowledge import preferences
from app.core.config import get_settings
from app.db.base import get_session_scope
from app.core.errors import AppError


class AgentUnavailable(AppError):
    """Raised when the agent is not configured, rather than failing mid-conversation."""

    def __init__(self, message: str, code: str = "agent_unavailable"):
        super().__init__(message, code, 503)


async def run_turn(
    user_id: UUID,
    session_id: str,
    message: str,
    *,
    on_event: EventSink | None = None,
    turn_id: str | None = None,
    model: str | None = None,
) -> str:
    """Run one turn, reporting progress to its persisted turn record."""
    if not get_settings().vertex_project:
        raise AgentUnavailable("the agent is not configured: set VERTEX_PROJECT")

    limits = RequestLimits(UsageStore(get_session_scope(), user_id, session_id), get_settings(), turn_id)
    agent = build_agent(build_toolkit(get_session_scope(), user_id, on_event=on_event), limits, model)
    def load_preferences():
        with get_session_scope()() as db:
            current = preferences(db, user_id)
            notes = db.scalar(select(AgentTurn.learning_context).where(AgentTurn.user_id == user_id, AgentTurn.session_id == session_id, AgentTurn.learning_context.is_not(None)).order_by(AgentTurn.created_at.desc()).limit(1))
            return current, notes or {}

    current_preferences, notes = await asyncio.to_thread(load_preferences)
    try:
        reply = await ask(
            agent, str(user_id), session_id, message, on_event=on_event, turn_id=turn_id,
            state_delta={PREFERENCES_KEY: current_preferences, CONTEXT_KEY: notes if current_preferences["memory_enabled"] else {}},
        )
        if limits.truncated and on_event:
            await on_event({"type": "agent.incomplete", "code": "provider_truncated"})
        return reply
    except (DefaultCredentialsError, RefreshError):
        raise AgentUnavailable(
            "Google credentials are missing or expired. Configure Application Default Credentials.",
            "provider_credentials",
        ) from None
    except APIError as error:
        messages = {
            401: (
                "provider_credentials",
                "Vertex AI refused the credentials. Check Application Default Credentials.",
            ),
            403: (
                "provider_access",
                "Vertex AI refused access. Check the project, billing, API access, and permissions.",
            ),
            404: (
                "provider_model",
                "The configured Vertex AI model is not available to this project or location.",
            ),
            429: (
                "provider_capacity",
                "Vertex AI quota or capacity is unavailable. Try again later.",
            ),
        }
        if error.code in messages:
            code, message = messages[error.code]
            raise AgentUnavailable(message, code) from None
        if error.code and error.code >= 500:
            raise AgentUnavailable(
                "Vertex AI is temporarily unavailable. Try again later.", "provider_unavailable"
            ) from None
        raise AgentUnavailable(
            "Vertex AI could not accept this request.", "provider_request"
        ) from None


async def load_history(user_id: UUID, session_id: str, offset: int = 0) -> list[HistoryMessage]:
    """The prior turns of one conversation, so a chat URL reopens where it left off."""
    return await read_history(str(user_id), session_id, exclude_managed=True, limit=201, offset=offset)


async def load_chat_sessions(user_id: UUID, limit: int = 100, offset: int = 0) -> list[SessionSummary]:
    """Every conversation this user has had, most recently active first."""
    summaries = {row.session_id: row for row in await list_chat_sessions(str(user_id), limit=limit + offset)}
    rows = await asyncio.to_thread(TurnStore(get_session_scope()).summaries, user_id, limit + offset)
    for row in rows:
        existing = summaries.get(row["session_id"])
        summaries[row["session_id"]] = SessionSummary(
            session_id=row["session_id"],
            first_message=existing.first_message if existing else row["first_message"],
            updated_at=max(existing.updated_at, row["updated_at"])
            if existing
            else row["updated_at"],
        )
    return sorted(summaries.values(), key=lambda row: (row.updated_at, row.session_id), reverse=True)[offset:offset + limit]
