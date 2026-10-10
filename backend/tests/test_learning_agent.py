"""Exercise the real ADK runner with local sessions and scripted provider responses."""

import asyncio

import pytest
from google.adk.models import LlmResponse
from google.adk.sessions import InMemorySessionService
from google.genai import types

from agent_fixtures import ScriptedModel, answer
from app.agent import session as sessions_module
from app.agent.limits import INCOMPLETE_NOTICE, RequestLimits
from app.agent.root import build_agent
from app.core.errors import AppError


@pytest.fixture
def local_sessions(monkeypatch, agent_settings):
    sessions = InMemorySessionService()
    monkeypatch.setattr(sessions_module, "get_session_service", lambda: sessions)
    monkeypatch.setattr(sessions_module, "configure_vertex", lambda: None)
    monkeypatch.setattr(sessions_module, "get_settings", lambda: agent_settings)
    monkeypatch.setattr("app.agent.root.get_settings", lambda: agent_settings)
    return sessions


def make_agent(store, settings, responses):
    agent = build_agent([], RequestLimits(store, settings))
    agent.model = ScriptedModel(responses=responses)
    return agent


def test_reopened_session_retains_history(local_sessions, usage_factory, agent_settings):
    store = usage_factory()

    async def run():
        first = make_agent(store, agent_settings, [answer("A tensor holds values with a shape.")])
        reply = await sessions_module.ask(first, "u1", "s1", "I want to learn PyTorch.")
        assert "tensor" in reply
        second = make_agent(
            store, agent_settings, [answer("A gradient describes how an output changes.")]
        )
        await sessions_module.ask(second, "u1", "s1", "What is a gradient?")
        history = await sessions_module.read_history("u1", "s1")
        assert [message.role for message in history] == ["you", "atlas", "you", "atlas"]
        assert any(
            "PyTorch" in part.text
            for content in second.model.requests[0].contents
            for part in content.parts or []
            if part.text
        )
        assert await sessions_module.read_history("other-user", "s1") == []

    asyncio.run(run())
    assert store.totals().model_requests == 2
    assert store.totals().thought_tokens == 20


def test_managed_turns_are_tagged_without_duplicating_legacy_history(
    local_sessions, usage_factory, agent_settings
):
    store = usage_factory()

    async def run():
        legacy = make_agent(store, agent_settings, [answer("A legacy reply.")])
        await sessions_module.ask(legacy, "u1", "s1", "Old question.")
        managed = make_agent(store, agent_settings, [answer("A managed reply.")])
        await sessions_module.ask(managed, "u1", "s1", "New question.", turn_id="turn-1")
        visible = await sessions_module.read_history("u1", "s1", exclude_managed=True)
        assert [message.text for message in visible] == ["Old question.", "A legacy reply."]
        assert len(await sessions_module.read_history("u1", "s1")) == 4

    asyncio.run(run())


def test_tool_loop_stops_and_saves_the_notice(local_sessions, usage_factory, agent_settings):
    agent_settings.agent_max_calls_per_turn = 1

    async def search_knowledge_base(query: str):
        return {"results": []}

    response = LlmResponse(
        content=types.Content(
            role="model",
            parts=[
                types.Part(
                    function_call=types.FunctionCall(
                        name="search_knowledge_base", args={"query": "tensors"}
                    )
                )
            ],
        )
    )
    store = usage_factory()
    agent = build_agent([search_knowledge_base], RequestLimits(store, agent_settings))
    agent.model = ScriptedModel(responses=[response, answer("Must not be called")])

    async def run():
        reply = await sessions_module.ask(agent, "u1", "s1", "PyTorch")
        assert "limit" in reply and "incomplete" in reply
        assert len(agent.model.requests) == 1
        history = await sessions_module.read_history("u1", "s1")
        assert "incomplete" in history[-1].text

    asyncio.run(run())
    assert store.totals().model_requests == 1


def test_research_uses_shared_budget_and_keeps_sources(
    local_sessions, usage_factory, agent_settings
):
    store = usage_factory()
    tool_call = LlmResponse(
        content=types.Content(
            role="model",
            parts=[
                types.Part(
                    function_call=types.FunctionCall(
                        name="researcher", args={"request": "How does autograd work?"}
                    )
                )
            ],
        )
    )
    agent = make_agent(
        store, agent_settings, [tool_call, answer("PyTorch records tensor operations.")]
    )
    researcher = agent.tools[0].agent
    researcher.model = ScriptedModel(
        responses=[
            answer(
                "Autograd records operations.",
                grounding_metadata=types.GroundingMetadata(
                    web_search_queries=["PyTorch autograd"],
                    grounding_chunks=[
                        types.GroundingChunk(
                            web=types.GroundingChunkWeb(
                                uri="https://docs.pytorch.org/docs/stable/notes/autograd.html",
                                title="Autograd",
                            )
                        )
                    ],
                ),
            )
        ]
    )

    async def run():
        reply = await sessions_module.ask(agent, "u1", "s1", "Explain autograd.")
        assert "Sources: [Autograd]" in reply
        assert "docs.pytorch.org" in reply
        history = await sessions_module.read_history("u1", "s1")
        assert len(history) == 2
        assert "docs.pytorch.org" in history[-1].text

    asyncio.run(run())
    totals = store.totals()
    assert totals.model_requests == 3
    assert totals.research_requests == 1
    assert totals.search_queries == 1
    assert totals.unreported_requests == 1  # Scripted tool-call response omitted usage.


def test_output_limit_is_reported(local_sessions, usage_factory, agent_settings):
    agent = make_agent(
        usage_factory(),
        agent_settings,
        [answer("A tensor", finish_reason=types.FinishReason.MAX_TOKENS)],
    )
    reply = asyncio.run(sessions_module.ask(agent, "u1", "s1", "PyTorch"))
    assert INCOMPLETE_NOTICE in reply
    assert agent.model.requests[0].config.max_output_tokens is None


def test_provider_failure_does_not_refund_request(local_sessions, usage_factory, agent_settings):
    store = usage_factory()
    agent = make_agent(store, agent_settings, [])
    with pytest.raises(RuntimeError, match="Scripted provider"):
        asyncio.run(sessions_module.ask(agent, "u1", "s1", "PyTorch"))
    assert store.totals().model_requests == 1
    assert store.totals().unreported_requests == 1


def test_spending_limit_saves_notice_without_another_provider_call(
    local_sessions, usage_factory, agent_settings
):
    agent_settings.agent_session_budget_microusd = 100
    store = usage_factory()
    agent = make_agent(store, agent_settings, [answer("A tensor holds values.")])
    agent.model.model = "gemini-3.8-flash"

    async def run():
        await sessions_module.ask(agent, "u1", "s1", "Explain a tensor.")
        reply = await sessions_module.ask(agent, "u1", "s1", "More?")
        assert "spending limit" in reply and "incomplete" in reply
        assert len(agent.model.requests) == 1
        assert "spending limit" in (await sessions_module.read_history("u1", "s1"))[-1].text

    asyncio.run(run())


def test_interrupted_request_keeps_unknown_cost_and_blocks_retry(
    local_sessions, usage_factory, agent_settings
):
    class InterruptedModel(ScriptedModel):
        async def generate_content_async(self, llm_request, stream=False):
            raise asyncio.CancelledError()
            yield  # Make this an async generator, like the real provider.

    agent_settings.agent_session_budget_microusd = 5_000_000
    store = usage_factory()
    agent = make_agent(store, agent_settings, [])
    agent.model = InterruptedModel(model="gemini-3.8-flash")

    async def run():
        # ADK consumes a provider cancellation and ends its event stream without a reply.
        with pytest.raises(AppError, match="no explanation") as failure:
            await sessions_module.ask(agent, "u1", "s1", "Explain.")
        assert failure.value.code == "provider_no_reply"
        retry = make_agent(store, agent_settings, [answer("Must not be sent.")])
        retry.model.model = "gemini-3.8-flash"
        reply = await sessions_module.ask(retry, "u1", "s1", "Try again.")
        assert "unknown cost" in reply and not retry.model.requests

    asyncio.run(run())
    assert store.totals().unpriced_requests == 1


def test_research_spend_stops_the_guide_before_another_call(
    local_sessions, usage_factory, agent_settings
):
    agent_settings.agent_session_budget_microusd = 20_000
    store = usage_factory()
    tool_call = answer("")
    tool_call.content.parts = [types.Part(function_call=types.FunctionCall(
        name="researcher", args={"request": "Check autograd."}
    ))]
    agent = make_agent(store, agent_settings, [tool_call, answer("Must not be called.")])
    agent.model.model = "gemini-3.8-flash"
    researcher = agent.tools[0].agent
    researcher.model = ScriptedModel(model="gemini-3.8-flash", responses=[answer(
        "Evidence.", grounding_metadata=types.GroundingMetadata(
            web_search_queries=["autograd", "gradient"]
        )
    )])

    reply = asyncio.run(sessions_module.ask(agent, "u1", "s1", "Explain autograd."))
    assert "spending limit" in reply and "incomplete" in reply
    assert len(agent.model.requests) == 1
    assert len(researcher.model.requests) == 1
    assert store.totals().estimated_cost_microusd == 28_376


def test_oversized_context_stops_before_provider_call(
    local_sessions, usage_factory, agent_settings
):
    agent_settings.agent_max_request_bytes = 1024
    store = usage_factory()
    agent = make_agent(store, agent_settings, [answer("Must not be called")])
    reply = asyncio.run(sessions_module.ask(agent, "u1", "s1", "PyTorch " * 200))
    assert "too large" in reply and "incomplete" in reply
    assert not agent.model.requests
    assert store.totals().model_requests == 0


def test_internal_thoughts_are_not_visible(local_sessions, usage_factory, agent_settings):
    response = answer("A tensor holds values.")
    response.content.parts.insert(0, types.Part(text="Private model reasoning.", thought=True))
    agent = make_agent(usage_factory(), agent_settings, [response])

    async def run():
        reply = await sessions_module.ask(agent, "u1", "s1", "PyTorch")
        history = await sessions_module.read_history("u1", "s1")
        assert "Private model reasoning" not in reply
        assert "Private model reasoning" not in history[-1].text

    asyncio.run(run())


def test_timeout_is_saved_as_incomplete(local_sessions, usage_factory, agent_settings):
    class SlowModel(ScriptedModel):
        async def generate_content_async(self, llm_request, stream=False):
            await asyncio.sleep(1)
            yield answer("Too late")

    agent_settings.agent_turn_timeout_seconds = 0.01
    store = usage_factory()
    agent = make_agent(store, agent_settings, [])
    agent.model = SlowModel()

    async def run():
        reply = await sessions_module.ask(agent, "u1", "s1", "PyTorch")
        assert "time limit" in reply
        assert "incomplete" in (await sessions_module.read_history("u1", "s1"))[-1].text

    asyncio.run(run())
    assert store.totals().unreported_requests == 1


@pytest.mark.parametrize("cited", [False, True])
def test_sources_are_bounded_and_do_not_duplicate_inline_citations(
    local_sessions, usage_factory, agent_settings, cited
):
    limits = RequestLimits(usage_factory(), agent_settings)
    limits.sources = {f"https://example.com/{i}": f"Reference {i}" for i in range(18)}
    agent = build_agent([], limits)
    text = "See [the documentation](https://example.com/2)." if cited else "An explanation."
    agent.model = ScriptedModel(responses=[answer(text)])
    reply = asyncio.run(sessions_module.ask(agent, "u1", "s1", "Explain."))
    assert reply.count("https://") == (1 if cited else 3)
    assert ("Sources:" in reply) is not cited


def test_timeout_reports_a_machine_readable_outcome(local_sessions, usage_factory, agent_settings):
    class SlowModel(ScriptedModel):
        async def generate_content_async(self, llm_request, stream=False):
            await asyncio.sleep(1)
            yield answer('Too late')
    agent_settings.agent_turn_timeout_seconds = 0.01
    agent = make_agent(usage_factory(), agent_settings, [])
    agent.model = SlowModel()
    events = []
    async def capture(event):
        events.append(event)
    asyncio.run(sessions_module.ask(agent, 'u1', 's1', 'Tensor?', on_event=capture))
    assert {'type': 'agent.incomplete', 'code': 'timeout'} in events


def test_truncation_reports_a_machine_readable_outcome(local_sessions, usage_factory, agent_settings):
    agent = make_agent(usage_factory(), agent_settings,
                       [answer('A tensor', finish_reason=types.FinishReason.MAX_TOKENS)])
    events = []
    async def capture(event):
        events.append(event)
    asyncio.run(sessions_module.ask(agent, 'u1', 's1', 'Tensor?', on_event=capture))
    assert {'type': 'agent.incomplete', 'code': 'provider_truncated'} in events


def call_tool(tool_name, **args):
    return LlmResponse(content=types.Content(role="model", parts=[
        types.Part(function_call=types.FunctionCall(name=tool_name, args=args))
    ]))


def test_learning_context_survives_reopening_without_leaking_to_another_chat(
    local_sessions, usage_factory, agent_settings
):
    from app.agent.context import CONTEXT_KEY
    from app.agent.toolkit import build_toolkit

    store = usage_factory()
    notes = {"question": "Why cache?", "background": "Knows dictionaries",
             "confusion": "", "next_connection": "Stale entries"}

    def guide(responses):
        agent = build_agent(build_toolkit(store.scope, store.user_id), RequestLimits(store, agent_settings))
        agent.model = ScriptedModel(responses=responses)
        return agent

    async def run():
        first = guide([call_tool("update_learning_context", **notes), answer("A cache reuses results.")])
        await sessions_module.ask(first, "u1", "s1", "Explain caching. I know dictionaries.")
        saved = await local_sessions.get_session(app_name=agent_settings.agent_app_name, user_id="u1", session_id="s1")
        assert saved.state[CONTEXT_KEY] == notes
        reopened = guide([answer("We explored reuse.")])
        await sessions_module.ask(reopened, "u1", "s1", "Where were we?")
        assert "Knows dictionaries" in str(reopened.model.requests[0].config.system_instruction)
        fresh = guide([answer("Let us start with a lookup.")])
        await sessions_module.ask(fresh, "u1", "s2", "Caching?")
        assert "Knows dictionaries" not in str(fresh.model.requests[0].config.system_instruction)
        other = guide([answer("A cache holds results.")])
        await sessions_module.ask(other, "u2", "s1", "Caching?")
        assert "Knows dictionaries" not in str(other.model.requests[0].config.system_instruction)

    asyncio.run(run())


def test_preference_tool_clears_notes_and_blocks_subsequent_memory_tools(
    local_sessions, usage_factory, agent_settings
):
    from app.agent.context import CONTEXT_KEY, PREFERENCES_KEY
    from app.agent.knowledge import preferences
    from app.agent.toolkit import build_toolkit

    store = usage_factory()
    agent = build_agent(build_toolkit(store.scope, store.user_id), RequestLimits(store, agent_settings))
    agent.model = ScriptedModel(responses=[
        call_tool("set_learning_preferences", memory_enabled=False),
        call_tool("update_learning_context", question="Must not persist", background="", confusion="", next_connection=""),
        call_tool("remember_concept", name="Must not persist", description="Blocked before any concept query."),
        answer("Concept memory is off. Chat history still persists."),
    ])

    async def run():
        await sessions_module.ask(agent, "u1", "s1", "Do not remember concepts or learning notes.",
                                  state_delta={CONTEXT_KEY: {"question": "Old notes"}})
        saved = await local_sessions.get_session(app_name=agent_settings.agent_app_name, user_id="u1", session_id="s1")
        assert saved.state[CONTEXT_KEY] == {}
        assert saved.state.get(PREFERENCES_KEY, {}).get("memory_enabled", False) is False
        responses = [part.function_response.response for content in agent.model.requests[-1].contents
                     for part in content.parts or [] if part.function_response]
        assert sum("disabled" in str(result) for result in responses) == 2
        assert "Old notes" not in str(agent.model.requests[-1].config.system_instruction)
        with store.scope() as db:
            persisted = preferences(db, store.user_id)
        assert persisted == {"memory_enabled": False, "auto_save": False}
        fresh = build_agent([], RequestLimits(store, agent_settings))
        fresh.model = ScriptedModel(responses=[answer("Memory remains off.")])
        await sessions_module.ask(fresh, "u1", "s2", "Is memory enabled?",
                                  state_delta={PREFERENCES_KEY: persisted})
        assert '"memory_enabled": false' in str(fresh.model.requests[0].config.system_instruction)
        assert (await sessions_module.read_history("u1", "s1"))[-1].text.startswith("Concept memory is off")

    asyncio.run(run())


def test_context_bounds_and_connection_inspection_fail_explicitly(
    local_sessions, usage_factory, agent_settings
):
    from app.agent.context import CONTEXT_KEY
    from app.agent.toolkit import build_toolkit

    store = usage_factory()
    events = []

    async def capture(event):
        events.append(event)

    agent = build_agent(build_toolkit(store.scope, store.user_id, on_event=capture), RequestLimits(store, agent_settings))
    agent.model = ScriptedModel(responses=[
        call_tool("update_learning_context", question="x" * 501, background="", confusion="", next_connection=""),
        call_tool("remove_concept_connection", connection_id="unseen", user_requested=True),
        call_tool("remove_concept_connection", connection_id="unseen"),
        answer("No changes were made."),
    ])

    async def run():
        await sessions_module.ask(agent, "u1", "s1", "Change these notes and remove that connection.")
        saved = await local_sessions.get_session(app_name=agent_settings.agent_app_name, user_id="u1", session_id="s1")
        assert not saved.state.get(CONTEXT_KEY)

    asyncio.run(run())
    errors = [event for event in events if event["type"] == "agent.tool_error"]
    assert len(errors) == 3
    assert "500" in errors[0]["message"]
    assert "Inspect" in errors[1]["message"]
    assert "user request" in errors[2]["message"]
