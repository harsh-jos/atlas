"""Build and run the owned guide. Execution does not depend on a browser connection."""

import asyncio
from uuid import UUID

from google.auth.exceptions import DefaultCredentialsError, RefreshError
from google.genai.errors import ClientError

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
from app.core.config import get_settings
from app.db.base import get_session_scope


class AgentUnavailable(RuntimeError):
    """Raised when the agent is not configured, rather than failing mid-conversation."""


async def run_turn(
    user_id: UUID,
    session_id: str,
    message: str,
    *,
    on_event: EventSink | None = None,
    turn_id: str | None = None,
) -> str:
    """Run one turn, reporting progress to its persisted turn record."""
    if not get_settings().vertex_project:
        raise AgentUnavailable("the agent is not configured: set VERTEX_PROJECT")

    limits = RequestLimits(UsageStore(get_session_scope(), user_id, session_id), get_settings())
    agent = build_agent(build_toolkit(get_session_scope(), user_id), limits)
    try:
        return await ask(
            agent, str(user_id), session_id, message, on_event=on_event, turn_id=turn_id
        )
    except (DefaultCredentialsError, RefreshError):
        raise AgentUnavailable(
            "Google credentials are missing or expired. Configure Application Default Credentials."
        ) from None
    except ClientError as error:
        messages = {
            401: "Vertex AI refused the credentials. Check Application Default Credentials.",
            403: "Vertex AI refused access. Check the project, billing, API access, and permissions.",
            404: "The configured Vertex AI model is not available to this project or location.",
            429: "Vertex AI quota or capacity is unavailable. Try again later.",
        }
        if error.code in messages:
            raise AgentUnavailable(messages[error.code]) from None
        raise


async def load_history(user_id: UUID, session_id: str) -> list[HistoryMessage]:
    """The prior turns of one conversation, so a chat URL reopens where it left off."""
    return await read_history(str(user_id), session_id, exclude_managed=True)


async def load_chat_sessions(user_id: UUID) -> list[SessionSummary]:
    """Every conversation this user has had, most recently active first."""
    summaries = {row.session_id: row for row in await list_chat_sessions(str(user_id))}
    rows = await asyncio.to_thread(TurnStore(get_session_scope()).summaries, user_id)
    for row in rows:
        existing = summaries.get(row["session_id"])
        summaries[row["session_id"]] = SessionSummary(
            session_id=row["session_id"],
            first_message=existing.first_message if existing else row["first_message"],
            updated_at=max(existing.updated_at, row["updated_at"])
            if existing
            else row["updated_at"],
        )
    return sorted(summaries.values(), key=lambda row: row.updated_at, reverse=True)
