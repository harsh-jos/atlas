"""Running one turn of the agent, and the Vertex configuration it needs."""

import asyncio
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache

from google.adk.agents import Agent
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.agents.invocation_context import LlmCallsLimitExceededError
from google.adk.events.event import Event
from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService
from google.genai import types
from sqlalchemy import cast, func, select, literal
from sqlalchemy.dialects.postgresql import JSONB, JSONPATH
from google.adk.sessions.schemas.v1 import StorageEvent, StorageSession

from app.agent.usage import AgentLimitReached
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.base import database_url, engine_options, observe_engine

EventSink = Callable[[dict], Awaitable[None]]


def configure_vertex() -> None:
    """google-genai reads credentials from the environment, so publish settings into it once."""
    settings = get_settings()
    if not settings.vertex_project:
        return
    if settings.google_application_credentials:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.google_application_credentials
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
    os.environ["GOOGLE_CLOUD_PROJECT"] = settings.vertex_project
    os.environ["GOOGLE_CLOUD_LOCATION"] = settings.vertex_location


@lru_cache
def get_session_service() -> DatabaseSessionService:
    """Conversations live in the app database, so a restart does not lose them."""
    # str(URL) masks the password as ***, which silently fails authentication.
    service = DatabaseSessionService(
        db_url=database_url().render_as_string(hide_password=False), **engine_options()
    )
    observe_engine(service.db_engine.sync_engine)
    return service


@dataclass(frozen=True)
class HistoryMessage:
    """One prior turn, in the two voices the chat UI renders: the reader and Atlas."""

    role: str  # "you" | "atlas"
    text: str


def _event_text(event: Event) -> str | None:
    """The visible text of one event, or None when it carries none (tool calls, etc.)."""
    content = event.content
    if content is None or not content.parts:
        return None
    text = "".join(part.text for part in content.parts if part.text and not part.thought)
    return text or None


async def read_history(
    user_id: str, session_id: str, *, exclude_managed: bool = False,
    limit: int = 200, offset: int = 0
) -> list[HistoryMessage]:
    """Replay a persisted conversation as plain messages, so reloading a chat URL restores it.

    Tool calls, tool responses, and any non-final model chatter carry no text worth showing —
    only the reader's messages and the agent's final replies become visible turns.
    """
    sessions = get_session_service()
    if isinstance(sessions, DatabaseSessionService) and exclude_managed:
        await sessions.prepare_tables()
        data = cast(StorageEvent.event_data, JSONB)
        statement = (
            select(StorageEvent)
            .where(StorageEvent.app_name == get_settings().agent_app_name,
                   StorageEvent.user_id == user_id, StorageEvent.session_id == session_id,
                   data["custom_metadata"]["atlas_turn_id"].astext.is_(None),
                   data["partial"].astext.is_distinct_from("true"),
                   func.jsonb_path_exists(
                       data, cast(literal('$.content.parts[*] ? (exists(@.text) && (@.thought == false || !exists(@.thought)))'), JSONPATH)),
                   ~func.jsonb_path_exists(data, cast(literal('$.content.parts[*].function_call'), JSONPATH)),
                   ~func.jsonb_path_exists(data, cast(literal('$.content.parts[*].function_response'), JSONPATH)),
                   (data["content"]["role"].astext == "user") | (data["author"].astext == "atlas"))
            .order_by(StorageEvent.timestamp.desc(), StorageEvent.id.desc())
            .limit(limit).offset(offset)
        )
        async with sessions.database_session_factory() as db:
            events = [row.to_event() for row in (await db.scalars(statement)).all()][::-1]
    else:
        session = await sessions.get_session(
            app_name=get_settings().agent_app_name, user_id=user_id, session_id=session_id
        )
        if session is None:
            return []
        events = session.events

    messages: list[HistoryMessage] = []
    for event in events:
        if exclude_managed and (event.custom_metadata or {}).get("atlas_turn_id"):
            continue
        text = _event_text(event)
        if text is None:
            continue
        if event.content.role == "user":
            messages.append(HistoryMessage("you", text))
        elif event.author == "atlas" and event.is_final_response():
            messages.append(HistoryMessage("atlas", text))
    return messages


@dataclass(frozen=True)
class SessionSummary:
    """One past conversation: enough to list it in a sidebar and reopen it."""

    session_id: str
    first_message: str | None
    updated_at: datetime


async def list_chat_sessions(user_id: str, limit: int = 100) -> list[SessionSummary]:
    """Read bounded sidebar projections without loading event histories or SDK state."""
    service = get_session_service()
    app_name = get_settings().agent_app_name
    if not isinstance(service, DatabaseSessionService):
        listed = await service.list_sessions(app_name=app_name, user_id=user_id)
        return sorted([
            SessionSummary(row.id, row.state.get("atlas_first_message"),
                           datetime.fromtimestamp(row.last_update_time, tz=timezone.utc))
            for row in listed.sessions
        ], key=lambda row: row.updated_at, reverse=True)[:limit]
    await service.prepare_tables()
    data = cast(StorageEvent.event_data, JSONB)
    first = (
        select(data["content"]["parts"][0]["text"].astext)
        .where(StorageEvent.app_name == StorageSession.app_name,
               StorageEvent.user_id == StorageSession.user_id,
               StorageEvent.session_id == StorageSession.id,
               data["content"]["role"].astext == "user")
        .order_by(StorageEvent.timestamp, StorageEvent.id).limit(1).scalar_subquery()
    )
    statement = (
        select(StorageSession.id,
               func.coalesce(cast(StorageSession.state, JSONB)["atlas_first_message"].astext, first),
               StorageSession.update_time)
        .where(StorageSession.app_name == app_name, StorageSession.user_id == user_id)
        .order_by(StorageSession.update_time.desc(), StorageSession.id).limit(limit)
    )
    async with service.database_session_factory() as db:
        rows = (await db.execute(statement)).all()
    return [SessionSummary(id, title, updated.replace(tzinfo=timezone.utc)
                           if updated.tzinfo is None else updated) for id, title, updated in rows]


async def ask(
    agent: Agent,
    user_id: str,
    session_id: str,
    message: str,
    on_event: EventSink | None = None,
    turn_id: str | None = None,
    state_delta: dict | None = None,
) -> str:
    """Send one message and return the agent's final reply, reporting progress as it goes."""
    configure_vertex()
    app_name = get_settings().agent_app_name
    sessions = get_session_service()
    if (
        await sessions.get_session(app_name=app_name, user_id=user_id, session_id=session_id)
        is None
    ):
        await sessions.create_session(
            app_name=app_name, user_id=user_id, session_id=session_id,
            state={"atlas_first_message": message},
        )

    runner = Runner(app_name=app_name, agent=agent, session_service=sessions)
    reply: list[str] = []
    partial = ""
    settings = get_settings()
    try:
        async with asyncio.timeout(settings.agent_turn_timeout_seconds):
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=types.Content(role="user", parts=[types.Part(text=message)]),
                state_delta=state_delta,
                run_config=RunConfig(
                    streaming_mode=StreamingMode.SSE,
                    max_llm_calls=settings.agent_max_calls_per_turn + 1,
                    custom_metadata={"atlas_turn_id": turn_id} if turn_id else None,
                ),
            ):
                if on_event:
                    if event.finish_reason == types.FinishReason.MAX_TOKENS:
                        await on_event({"type": "agent.incomplete", "code": "provider_truncated"})
                    if not event.partial:
                        for call in event.get_function_calls():
                            await on_event({"type": "agent.tool", "name": call.name,
                                            "callId": call.id})
                        for result in event.get_function_responses():
                            await on_event({"type": "agent.tool_result", "name": result.name,
                                            "callId": result.id})
                if event.author == "atlas":
                    text = _event_text(event)
                    if text:
                        if event.partial:
                            delta = ("\n\n" if reply and not partial else "") + text
                            partial += text
                            if on_event:
                                await on_event({"type": "agent.delta", "text": delta})
                        else:
                            # ADK yields an aggregate after the chunks. Replace, never append
                            # that aggregate to the already-streamed snapshot a second time.
                            reply.append(text)
                            partial = ""
                            if on_event:
                                await on_event({"type": "agent.message", "text": text,
                                                "reply": "\n\n".join(reply)})
    except (AgentLimitReached, TimeoutError, LlmCallsLimitExceededError) as error:
        code = error.code if isinstance(error, AgentLimitReached) else (
            "timeout" if isinstance(error, TimeoutError) else "model_limit"
        )
        if on_event:
            await on_event({"type": "agent.incomplete", "code": code})
        reason = "The model-call limit for this reply was reached."
        if isinstance(error, AgentLimitReached):
            reason = str(error)
        elif isinstance(error, TimeoutError):
            reason = "The reply time limit was reached."
        notice = f"{reason} This reply is incomplete. Your conversation history is saved."
        current = await sessions.get_session(
            app_name=app_name, user_id=user_id, session_id=session_id
        )
        if current is not None:
            await sessions.append_event(
                current,
                Event(
                    author="atlas",
                    custom_metadata={"atlas_turn_id": turn_id} if turn_id else None,
                    content=types.Content(role="model", parts=[types.Part(text=notice)]),
                ),
            )
        if partial:
            reply.append(partial)
            partial = ""
        reply.append(notice)
        if on_event:
            await on_event({"type": "agent.message", "text": notice, "reply": "\n\n".join(reply)})
    finally:
        await runner.close()
    if partial:
        # A stream without its aggregate is not a confirmed complete model response.
        if on_event:
            await on_event({"type": "agent.incomplete", "code": "provider_stream_interrupted"})
        reply.append(partial)
    if not reply:
        raise AppError("The model returned no explanation. Try a different question.", "provider_no_reply", 502)
    return "\n\n".join(reply)
