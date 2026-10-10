"""Request slots survive failure, concurrent calls, session reopening, and user isolation."""

from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy.exc import NoResultFound

from app.agent.usage import AgentLimitReached


def test_limits_survive_reopening(usage_factory, agent_settings):
    agent_settings.agent_max_calls_per_session = 1
    store = usage_factory()
    store.reserve("turn1", "gemini", False, agent_settings)
    with pytest.raises(AgentLimitReached, match="conversation"):
        usage_factory().reserve("turn2", "gemini", False, agent_settings)
    assert usage_factory().totals().model_requests == 1
    assert usage_factory().totals().unreported_requests == 1


def test_research_counts_towards_both_limits(usage_factory, agent_settings):
    agent_settings.agent_max_research_per_turn = 1
    store = usage_factory()
    store.reserve("turn1", "gemini", True, agent_settings)
    with pytest.raises(AgentLimitReached, match="research"):
        store.reserve("turn1", "gemini", True, agent_settings)
    store.reserve("turn1", "gemini", False, agent_settings)
    assert store.totals().model_requests == 2
    assert store.totals().research_requests == 1


def test_turn_limit_does_not_reset_session_limit(usage_factory, agent_settings):
    agent_settings.agent_max_calls_per_turn = 1
    store = usage_factory()
    store.reserve("turn1", "gemini", False, agent_settings)
    with pytest.raises(AgentLimitReached, match="reply"):
        store.reserve("turn1", "gemini", False, agent_settings)
    store.reserve("turn2", "gemini", False, agent_settings)
    assert store.totals().model_requests == 2


def test_usage_is_owned_and_session_scoped(usage_factory, agent_settings):
    store = usage_factory()
    request = store.reserve("turn1", "gemini", True, agent_settings)
    store.record(
        request,
        reported=True,
        input_tokens=100,
        output_tokens=20,
        thought_tokens=10,
        total_tokens=130,
        search_queries=3,
    )
    assert store.totals().total_tokens == 130
    assert store.totals().search_queries == 3
    assert store.totals().unreported_requests == 0
    assert usage_factory(owner=1).totals().model_requests == 0
    assert usage_factory(session_id="s2").totals().model_requests == 0
    with pytest.raises(NoResultFound):
        usage_factory(owner=1).record(request, reported=True)


def test_concurrent_reservations_cannot_overspend_slots(usage_factory, agent_settings):
    agent_settings.agent_max_calls_per_session = 1

    def reserve(turn):
        try:
            usage_factory().reserve(turn, "gemini", False, agent_settings)
            return True
        except AgentLimitReached:
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(reserve, ["turn1", "turn2"]))
    assert sorted(results) == [False, True]
    assert usage_factory().totals().model_requests == 1


def test_research_can_be_disabled(usage_factory, agent_settings):
    agent_settings.agent_max_research_per_session = 0
    with pytest.raises(AgentLimitReached, match="research"):
        usage_factory().reserve("turn1", "gemini", True, agent_settings)
    assert usage_factory().totals().model_requests == 0
