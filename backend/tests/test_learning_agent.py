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
        with pytest.raises(RuntimeError, match="no final explanation"):
            await sessions_module.ask(agent, "u1", "s1", "Explain.")
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
