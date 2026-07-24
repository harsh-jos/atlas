"""Running one turn of the agent, and the Vertex configuration it needs."""

import os
from collections.abc import Awaitable, Callable
from functools import lru_cache

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import BaseSessionService, InMemorySessionService
from google.genai import types

from app.core.config import get_settings

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
    """In-memory for now: conversations do not yet survive a restart."""
    return InMemorySessionService()


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
        if event.is_final_response() and event.content and event.content.parts:
            text = "".join(part.text for part in event.content.parts if part.text)
            if text:
                reply.append(text)
                if on_event:
                    await on_event({"type": "agent.message", "text": text})
    return "".join(reply)
