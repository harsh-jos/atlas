"""Streaming delivery, replay and provider chunks without any live model calls."""

import asyncio
import json
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.adk.models import LlmResponse
from google.adk.sessions import InMemorySessionService
from google.genai import types

from agent_fixtures import ScriptedModel, answer
from app.agent import session as sessions_module, stream
from app.agent.limits import RequestLimits
from app.agent.root import build_agent
from app.agent.router import ChatTurn, router
from app.agent.turns import TurnStore
from app.core.security import create_access_token
from app.db.base import get_session_scope


@pytest.fixture
def owned(usage_factory):
    usage = usage_factory()
    store = TurnStore(usage.scope)
    row = store.submit(usage.user_id, "stream", uuid4(), "Explain a tensor.")
    return usage, store, row


def snapshot(row, tools):
    return {"type": "turn.snapshot", "turn": ChatTurn(**row).model_dump(mode="json", by_alias=True),
            "tools": tools}


def decode(frames):
    return [json.loads(frame.split("data: ", 1)[1]) for frame in frames if "data: " in frame]


def test_chunks_and_final_aggregate_do_not_duplicate_reply(owned):
    usage, store, row = owned
    store.claim(300)
    store.progress(row["id"], {"type": "agent.delta", "text": "A ten"})
    store.progress(row["id"], {"type": "agent.delta", "text": "sor."})
    store.progress(row["id"], {"type": "agent.message", "text": "A tensor.", "reply": "A tensor."})
    store.finish(row["id"], "completed", reply="A tensor.")
    assert store.get(usage.user_id, row["id"])["reply"] == "A tensor."
    log = store.events(usage.user_id, row["id"], 0)
    assert [event["id"] for event in log] == [1, 2, 3, 4, 5]
    assert store.events(uuid4(), row["id"], 0) == []
    store.progress(row["id"], {"type": "agent.delta", "text": "Too late"})
    assert store.events(usage.user_id, row["id"], 0) == log


def test_reconnect_replays_only_missing_frames_and_terminal_snapshot(owned):
    usage, store, row = owned
    store.claim(300)
    store.progress(row["id"], {"type": "agent.tool", "name": "researcher", "callId": "tool1"})
    store.progress(row["id"], {"type": "agent.tool_result", "name": "researcher", "callId": "tool1"})
    store.progress(row["id"], {"type": "agent.delta", "text": "A tensor."})
    store.finish(row["id"], "completed", reply="A tensor.")

    async def collect(after):
        return [item async for item in stream.events(store, usage.user_id, row["id"], after, snapshot)]

    resumed = decode(asyncio.run(collect(2)))
    assert [item["type"] for item in resumed] == [
        "agent.tool_result", "agent.delta", "turn.status", "turn.snapshot"
    ]
    assert resumed[-1]["turn"]["reply"] == "A tensor."
    fresh = decode(asyncio.run(collect(None)))
    assert len(fresh) == 1 and fresh[0]["type"] == "turn.snapshot"
    assert len(fresh[0]["tools"]) == 2


def test_stream_starts_only_its_owned_turn_and_streams_progress(owned, monkeypatch):
    from app.agent import execution
    usage, store, row = owned
    other = store.submit(usage.user_id, "other", uuid4(), "Do not execute me.")
    calls = []

    async def respond(*args, on_event, turn_id, **kwargs):
        calls.append(turn_id)
        await on_event({"type": "agent.delta", "text": "Live reply."})
        return "Live reply."

    monkeypatch.setattr(execution, "run_turn", respond)

    async def collect():
        return [item async for item in stream.events(store, usage.user_id, row["id"], None, snapshot)]

    delivered = decode(asyncio.run(collect()))
    assert calls == [str(row["id"])]
    assert any(item["type"] == "agent.delta" for item in delivered)
    assert delivered[-1]["turn"]["status"] == "completed"
    assert store.get(usage.user_id, other["id"])["status"] == "queued"


def test_stream_http_authentication_cursor_validation_and_completed_replay(owned, usage_factory):
    usage, store, row = owned
    store.claim(300)
    store.finish(row["id"], "completed", reply="Done.")
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_session_scope] = lambda: usage.scope
    headers = {"Authorization": f"Bearer {create_access_token(usage.user_id)}"}
    path = f'/agent/turns/{row["id"]}/events'
    with TestClient(app) as client:
        assert client.get(path).status_code == 401
        stranger = {"Authorization": f"Bearer {create_access_token(usage_factory(owner=1).user_id)}"}
        assert client.get(path, headers=stranger).status_code == 404
        for cursor in ["-1", "no", "999", "1\n2"]:
            assert client.get(path, headers={**headers, "Last-Event-ID": cursor}).status_code == 400
        response = client.get(path, headers={**headers, "Last-Event-ID": "1"})
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert "no-transform" in response.headers["cache-control"]
        assert response.headers["x-accel-buffering"] == "no"
        assert decode(response.text.split("\n\n"))[-1]["turn"]["reply"] == "Done."


def test_adk_streams_visible_chunks_and_filters_thoughts(
    usage_factory, agent_settings, monkeypatch
):
    monkeypatch.setattr(sessions_module, "get_settings", lambda: agent_settings)
    monkeypatch.setattr(sessions_module, "get_session_service", lambda: InMemorySessionService())

    class StreamingModel(ScriptedModel):
        async def generate_content_async(self, llm_request, stream=False):
            assert stream
            yield LlmResponse(content=types.Content(role="model", parts=[
                types.Part(text="Private reasoning", thought=True), types.Part(text="A ten")
            ]), partial=True)
            yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text="sor.")]), partial=True)
            yield answer("A tensor.")

    agent = build_agent([], RequestLimits(usage_factory(), agent_settings))
    agent.model = StreamingModel()
    captured = []

    async def capture(event):
        captured.append(event)

    result = asyncio.run(sessions_module.ask(agent, "u1", "s1", "Explain.", on_event=capture))
    assert result == "A tensor."
    assert [item["text"] for item in captured if item["type"] == "agent.delta"] == ["A ten", "sor."]
    assert captured[-1]["reply"] == "A tensor."
    assert "Private reasoning" not in json.dumps(captured)


def test_adk_streams_tool_start_and_result_without_exposing_researcher_reply(
    usage_factory, agent_settings, monkeypatch
):
    sessions = InMemorySessionService()
    monkeypatch.setattr(sessions_module, "get_settings", lambda: agent_settings)
    monkeypatch.setattr(sessions_module, "get_session_service", lambda: sessions)
    agent = build_agent([], RequestLimits(usage_factory(), agent_settings))
    agent.model = ScriptedModel(responses=[LlmResponse(content=types.Content(role="model", parts=[
        types.Part(function_call=types.FunctionCall(name="researcher", id="research1",
                                                  args={"request": "Check tensors"}))
    ])), answer("A tensor holds values.")])
    agent.tools[0].agent.model = ScriptedModel(responses=[answer("Internal research report.")])
    captured = []

    async def capture(event):
        captured.append(event)

    result = asyncio.run(sessions_module.ask(agent, "u1", "s1", "Explain.", on_event=capture))
    assert result == "A tensor holds values."
    assert any(item["type"] == "agent.tool" and item["name"] == "researcher" for item in captured)
    assert any(item["type"] == "agent.tool_result" and item["name"] == "researcher" for item in captured)
    assert "Internal research report" not in json.dumps(captured)


def test_disconnect_interrupts_owned_execution_and_reconnect_never_reruns(owned, monkeypatch):
    from app.agent import execution
    usage, store, row = owned
    stopped = []
    calls = []

    async def respond(*args, on_event, **kwargs):
        calls.append(True)
        try:
            await on_event({"type": "agent.delta", "text": "Partial."})
            await asyncio.Event().wait()
        finally:
            stopped.append(True)

    monkeypatch.setattr(execution, "run_turn", respond)

    async def observe():
        iterator = stream.events(store, usage.user_id, row["id"], None, snapshot)
        async for item in iterator:
            if '"type": "agent.delta"' in item:
                break
        await iterator.aclose()
        return [item async for item in stream.events(store, usage.user_id, row["id"], 1, snapshot)]

    replayed = decode(asyncio.run(observe()))
    assert stopped == [True] and calls == [True]
    assert replayed[-1]["turn"]["status"] == "interrupted"
    assert replayed[-1]["turn"]["reply"] == "Partial."


def test_disconnect_before_execution_releases_claim(owned):
    usage, store, row = owned

    async def observe():
        iterator = stream.events(store, usage.user_id, row["id"], None, snapshot)
        await anext(iterator)
        await iterator.aclose()

    asyncio.run(observe())
    assert store.get(usage.user_id, row["id"])["status"] == "interrupted"


def test_second_connection_cannot_execute_a_running_turn(owned):
    usage, store, row = owned
    store.claim(300, row["id"], usage.user_id)

    async def collect():
        return [item async for item in stream.events(store, usage.user_id, row["id"], None, snapshot)]

    assert decode(asyncio.run(collect())) == [{"type": "stream.conflict"}]


def test_partial_text_survives_timeout_without_aggregate(usage_factory, agent_settings, monkeypatch):
    sessions = InMemorySessionService()
    monkeypatch.setattr(sessions_module, "get_settings", lambda: agent_settings)
    monkeypatch.setattr(sessions_module, "get_session_service", lambda: sessions)
    agent_settings.agent_turn_timeout_seconds = 0.05

    class HangingModel(ScriptedModel):
        async def generate_content_async(self, llm_request, stream=False):
            yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text="Partial answer.")]), partial=True)
            await asyncio.sleep(10)

    agent = build_agent([], RequestLimits(usage_factory(), agent_settings))
    agent.model = HangingModel()
    result = asyncio.run(sessions_module.ask(agent, "u1", "s1", "Explain."))
    assert result.startswith("Partial answer.\n\n")
    assert "incomplete" in result


def test_asgi_disconnect_drains_execution_and_commits_interruption(owned, monkeypatch):
    from starlette.responses import StreamingResponse
    from app.agent import execution
    usage, store, row = owned
    stopped = []

    async def respond(*args, on_event, **kwargs):
        try:
            await on_event({'type': 'agent.delta', 'text': 'Before disconnect.'})
            await asyncio.Event().wait()
        finally:
            stopped.append(True)

    monkeypatch.setattr(execution, 'run_turn', respond)

    async def run():
        disconnected = asyncio.Event()

        async def send(message):
            if b'"type": "agent.delta"' in message.get('body', b''):
                disconnected.set()

        async def receive():
            await disconnected.wait()
            return {'type': 'http.disconnect'}

        response = StreamingResponse(stream.events(store, usage.user_id, row['id'], None, snapshot))
        async with asyncio.timeout(3):
            await response({'type': 'http', 'asgi': {'spec_version': '2.3'}}, receive, send)

    asyncio.run(run())
    assert stopped == [True]
    state = store.get(usage.user_id, row['id'])
    assert state['status'] == 'interrupted' and state['reply'] == 'Before disconnect.'
