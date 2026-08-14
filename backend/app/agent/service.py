"""One agent turn for one user, with progress streamed to whatever sockets they have open."""

from uuid import UUID

from app.agent.root import build_agent
from app.agent.session import HistoryMessage, SessionSummary, ask, list_chat_sessions, read_history
from app.agent.toolkit import build_toolkit
from app.core.config import get_settings
from app.db.base import get_session_scope
from app.realtime.hub import hub


class AgentUnavailable(RuntimeError):
    """Raised when the agent is not configured, rather than failing mid-conversation."""


async def run_turn(user_id: UUID, session_id: str, message: str) -> str:
    """Run one turn; tool calls and the reply are published to the user's sockets as they happen."""
    if not get_settings().vertex_project:
        raise AgentUnavailable("the agent is not configured: set VERTEX_PROJECT")

    async def publish(event: dict) -> None:
        await hub.publish(user_id, event)

    agent = build_agent(build_toolkit(get_session_scope(), user_id))
    return await ask(agent, str(user_id), session_id, message, on_event=publish)


async def load_history(user_id: UUID, session_id: str) -> list[HistoryMessage]:
    """The prior turns of one conversation, so a chat URL reopens where it left off."""
    return await read_history(str(user_id), session_id)


async def load_chat_sessions(user_id: UUID) -> list[SessionSummary]:
    """Every conversation this user has had, most recently active first."""
    return await list_chat_sessions(str(user_id))
