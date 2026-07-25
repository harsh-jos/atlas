"""Running one turn of the agent, and the Vertex configuration it needs."""

import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import lru_cache

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import BaseSessionService, DatabaseSessionService
from google.genai import types

from app.core.config import get_settings
from app.db.base import database_url

EventSink = Callable[[dict], Awaitable[None]]


def configure_vertex() -> None:
    """google-genai reads credentials from the environment, so publish settings into it once."""
    settings = get_settings()
    if not settings.vertex_project:
        return
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", settings.vertex_project)
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", settings.vertex_location)


@lru_cache
def get_session_service() -> BaseSessionService:
    """Conversations live in the app database, so a restart does not lose them."""
    # str(URL) masks the password as ***, which silently fails authentication.
    return DatabaseSessionService(db_url=database_url().render_as_string(hide_password=False))


@dataclass(frozen=True)
class HistoryMessage:
    """One prior turn, in the two voices the chat UI renders: the reader and Atlas."""

    role: str  # "you" | "atlas"
    text: str


async def read_history(user_id: str, session_id: str) -> list[HistoryMessage]:
    """Replay a persisted conversation as plain messages, so reloading a chat URL restores it.

    Tool calls, tool responses, and any non-final model chatter carry no text worth showing —
    only the reader's messages and the agent's final replies become visible turns.
    """
    sessions = get_session_service()
    session = await sessions.get_session(
        app_name=get_settings().agent_app_name, user_id=user_id, session_id=session_id
    )
    if session is None:
        return []

    messages: list[HistoryMessage] = []
    for event in session.events:
        content = event.content
        if content is None or not content.parts:
            continue
        text = "".join(part.text for part in content.parts if part.text)
        if not text:
            continue
        if content.role == "user":
            messages.append(HistoryMessage("you", text))
        elif event.is_final_response():
            messages.append(HistoryMessage("atlas", text))
    return messages


def _preview_id(response: types.FunctionResponse) -> str | None:
    """A preview the agent just built, so the UI can offer the choice instead of prose."""
    if response.name != "preview_source" or not isinstance(response.response, dict):
        return None
    payload = response.response
    inner = payload.get("result")
    if isinstance(inner, dict):
        payload = inner
    found = payload.get("previewId")
    return found if isinstance(found, str) else None


async def ask(
    agent: Agent,
    user_id: str,
    session_id: str,
    message: str,
    on_event: EventSink | None = None,
) -> str:
    """Send one message and return the agent's final reply, reporting progress as it goes."""
    configure_vertex()
    app_name = get_settings().agent_app_name
    sessions = get_session_service()
    if await sessions.get_session(app_name=app_name, user_id=user_id, session_id=session_id) is None:
        await sessions.create_session(app_name=app_name, user_id=user_id, session_id=session_id)

    runner = Runner(app_name=app_name, agent=agent, session_service=sessions)
    reply: list[str] = []
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=types.Content(role="user", parts=[types.Part(text=message)]),
    ):
        if on_event:
            for call in event.get_function_calls():
                await on_event({"type": "agent.tool", "name": call.name})
            for response in event.get_function_responses():
                preview_id = _preview_id(response)
                if preview_id:
                    await on_event({"type": "agent.preview", "previewId": preview_id})
        if event.is_final_response() and event.content and event.content.parts:
            text = "".join(part.text for part in event.content.parts if part.text)
            if text:
                reply.append(text)
                if on_event:
                    await on_event({"type": "agent.message", "text": text})
    return "".join(reply)
