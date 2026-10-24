"""Request slots survive failure, concurrent calls, session reopening, and user isolation."""

from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy.exc import NoResultFound

from app.agent.usage import AgentLimitReached


def test_conversation_has_no_lifetime_request_limit(usage_factory, agent_settings):
    store = usage_factory()
    for index in range(260):
        store.reserve(f"turn{index}", "gemini", False, agent_settings)
    assert usage_factory().totals().model_requests == 260


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
        agent_settings,
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
        usage_factory(owner=1).record(request, agent_settings, reported=True)


def test_concurrent_reservations_cannot_overspend_slots(usage_factory, agent_settings):
    agent_settings.agent_max_calls_per_turn = 1

    def reserve(turn):
        try:
            usage_factory().reserve("same-turn", "gemini", False, agent_settings)
            return True
        except AgentLimitReached:
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(reserve, ["turn1", "turn2"]))
    assert sorted(results) == [False, True]
    assert usage_factory().totals().model_requests == 1


def test_research_can_be_disabled(usage_factory, agent_settings):
    agent_settings.agent_max_research_per_turn = 0
    with pytest.raises(AgentLimitReached, match="research"):
        usage_factory().reserve("turn1", "gemini", True, agent_settings)
    assert usage_factory().totals().model_requests == 0


@pytest.mark.parametrize(("model", "expected_cost"), [
    ("gemini-3.8-flash", 1_682_000),
    ("gemini-4-argon", 4_182_000),
])
def test_cost_includes_reasoning_and_each_search_query(
    usage_factory, agent_settings, model, expected_cost
):
    agent_settings.agent_account_budget_microusd = 20_000_000
    store = usage_factory()
    request = store.reserve("turn", model, True, agent_settings)
    store.record(
        request, agent_settings, reported=True, input_tokens=1_000_000,
        output_tokens=100_000, thought_tokens=100_000, total_tokens=1_200_000,
        search_queries=13,
    )
    assert store.totals().estimated_cost_microusd == expected_cost
    assert store.totals().unpriced_requests == 0


def test_cost_budget_survives_reopening_and_blocks_after_overrun(usage_factory, agent_settings):
    agent_settings.agent_account_budget_microusd = 100
    store = usage_factory()
    request = store.reserve("turn", "gemini-3.8-flash", False, agent_settings)
    store.record(
        request, agent_settings, reported=True, input_tokens=100,
        output_tokens=20, thought_tokens=10, total_tokens=130,
    )
    assert store.totals().estimated_cost_microusd == 188
    with pytest.raises(AgentLimitReached, match="used all its credits"):
        usage_factory().reserve("next", "gemini-3.8-flash", False, agent_settings)
    assert usage_factory(owner=1).totals().estimated_cost_microusd == 0
    with pytest.raises(AgentLimitReached, match="used all its credits"):
        usage_factory(session_id="new").reserve("turn", "gemini-3.8-flash", False, agent_settings)


@pytest.mark.parametrize("reported", [False, True])
def test_pending_or_unknown_cost_blocks_further_calls(usage_factory, agent_settings, reported):
    agent_settings.agent_account_budget_microusd = 5_000_000
    store = usage_factory()
    request = store.reserve("turn", "gemini-3.8-flash", True, agent_settings)
    if reported:
        # Token usage alone cannot settle a research request without query metadata.
        store.record(request, agent_settings, reported=True, total_tokens=130, search_reported=False)
    with pytest.raises(AgentLimitReached, match="unknown cost"):
        usage_factory().reserve("next", "gemini-3.8-flash", False, agent_settings)
    assert store.totals().unpriced_requests == 1


def test_settling_known_cost_releases_the_budget_hold(usage_factory, agent_settings):
    agent_settings.agent_account_budget_microusd = 1_000
    store = usage_factory()
    request = store.reserve("turn", "gemini-3.8-flash", False, agent_settings)
    store.record(request, agent_settings, reported=True, total_tokens=100)
    assert store.totals().estimated_cost_microusd == 375
    store.reserve("next", "gemini-3.8-flash", False, agent_settings)


def test_concurrent_requests_cannot_both_claim_remaining_budget(usage_factory, agent_settings):
    agent_settings.agent_account_budget_microusd = 1_000

    def reserve(turn):
        try:
            usage_factory(session_id=turn).reserve(turn, "gemini-3.8-flash", False, agent_settings)
            return True
        except AgentLimitReached:
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(reserve, ["first", "second"])) == [False, True]


def test_unpriced_models_are_rejected_before_request(usage_factory, agent_settings):
    agent_settings.agent_account_budget_microusd = 1_000
    with pytest.raises(AgentLimitReached, match="verified price"):
        usage_factory().reserve("turn", "different-model", False, agent_settings)
    assert usage_factory().totals().model_requests == 0


def test_price_rounding_region_and_scheduled_change():
    from datetime import date
    from app.agent.pricing import estimate_cost, token_rates

    assert estimate_cost((750_000, 3_750_000), 1, 0, 0, 1, 0) == 1
    assert estimate_cost((750_000, 3_750_000), 1, 1, 0, 1, 0) is None
    assert estimate_cost((750_000, 3_750_000), -1, 0, 0, 0, 0) is None
    assert token_rates("gemini-3.8-flash", "global", date(2027, 1, 1)) == (1_500_000, 7_500_000)
    assert token_rates("gemini-3.8-flash", "us-central1", date(2026, 10, 10)) == (825_000, 4_125_000)


@pytest.mark.parametrize("day", ["2026-10-24", "2026-11-30", "2026-12-01"])
def test_argon_uses_dated_public_introductory_prices(day):
    from datetime import date
    from app.agent.pricing import token_rates

    factor = 1 if day < "2026-12-01" else 2
    assert token_rates("gemini-4-argon", "global", date.fromisoformat(day)) == (
        2_000_000 * factor, 10_000_000 * factor
    )
    assert token_rates("gemini-4-argon", "us", date.fromisoformat(day)) == (
        2_200_000 * factor, 11_000_000 * factor
    )


def test_rejection_is_owned_and_still_consumes_request_allowance(usage_factory, agent_settings):
    store = usage_factory()
    agent_settings.agent_account_budget_microusd = 5_000_000
    request = store.reserve("first", "gemini-3.8-flash", False, agent_settings)
    with pytest.raises(NoResultFound):
        usage_factory(owner=1).reject(request)
    store.reject(request)
    assert store.totals().rejected_requests == 1
    assert store.totals().unreported_requests == store.totals().unpriced_requests == 0
    agent_settings.agent_max_calls_per_turn = 1
    with pytest.raises(AgentLimitReached, match="reply"):
        store.reserve("first", "gemini-3.8-flash", False, agent_settings)


def test_completed_usage_cannot_be_reclassified_as_rejected(usage_factory, agent_settings):
    store = usage_factory()
    request = store.reserve("first", "gemini-3.8-flash", False, agent_settings)
    store.record(request, agent_settings, reported=True, total_tokens=100)
    with pytest.raises(ValueError, match="reported usage"):
        store.reject(request)
    assert store.totals().rejected_requests == 0
    assert store.totals().estimated_cost_microusd == 375
