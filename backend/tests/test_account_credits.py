"""Account-wide credits, durable per-message usage, and owned profile projections."""
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.agent import router as routes
from app.agent.limits import RequestLimits
from app.agent.root import build_agent
from app.agent.turns import TurnStore
from app.agent.usage import AgentLimitReached
from app.auth.deps import get_current_user_id
from app.core.enums import Role
from app.db.base import get_session_scope
from app.db.models import User


def record(store, settings, invocation, *, tokens=100, research=False):
    request = store.reserve(invocation, "gemini-3.8-flash", research, settings)
    store.record(request, settings, reported=True, input_tokens=tokens, total_tokens=tokens,
                 cached_input_tokens=0, search_queries=1 if research else 0)
    return request


def test_account_allowance_is_shared_and_other_accounts_are_isolated(usage_factory, agent_settings):
    agent_settings.agent_account_budget_microusd = 150
    first = usage_factory(session_id="first")
    record(first, agent_settings, "one")
    second = usage_factory(session_id="second")
    record(second, agent_settings, "two")
    summary = first.account_summary(agent_settings)
    assert summary["credits_used"] == 0.015
    assert summary["credits_remaining"] == 0
    assert not summary["can_chat"]
    with pytest.raises(AgentLimitReached, match="used all its credits"):
        usage_factory(session_id="brand-new").reserve("three", "gemini-3.8-flash", False, agent_settings)
    assert usage_factory(owner=1).account_summary(agent_settings)["credits_used"] == 0
    record(usage_factory(owner=1), agent_settings, "other")


def test_superusers_bypass_credits_and_demotion_rechecks_existing_spend(usage_factory, agent_settings):
    store = usage_factory()
    agent_settings.agent_account_budget_microusd = 1
    with store.scope() as session:
        session.get(User, store.user_id).role = Role.SUPERUSER
    record(store, agent_settings, "one")
    record(usage_factory(session_id="second"), agent_settings, "two")
    summary = store.account_summary(agent_settings)
    assert summary["role"] == "SUPERUSER"
    assert summary["credit_limit"] is None and summary["credits_remaining"] is None
    assert summary["can_chat"]
    with store.scope() as session:
        session.get(User, store.user_id).role = Role.NORMAL
    with pytest.raises(AgentLimitReached):
        store.reserve("three", "gemini-3.8-flash", False, agent_settings)
    assert store.account_summary(agent_settings)["credit_limit"] == 0.0001


@pytest.mark.parametrize("status", ["completed", "failed", "interrupted", "cancelled"])
def test_per_message_credits_include_all_model_calls_and_survive_reopen(usage_factory, agent_settings, status):
    usage = usage_factory()
    store = TurnStore(usage.scope)
    turn = store.submit(usage.user_id, "s1", uuid4(), "Hello", "gemini-3.8-flash")
    store.claim(300, turn["id"], usage.user_id)
    record(usage, agent_settings, str(turn["id"]))
    record(usage, agent_settings, str(turn["id"]), research=True)
    # An unrelated turn must not be attributed to this message.
    record(usage, agent_settings, "other")
    store.finish(turn["id"], status, reply="Saved reply.")
    saved = TurnStore(usage.scope).get(usage.user_id, turn["id"])
    assert saved["credits_used"] == 1.415
    assert not saved["credits_pending"]
    assert saved["status"] == status
    assert store.get(usage_factory(owner=1).user_id, turn["id"]) is None


def test_unknown_usage_is_visible_and_rejected_requests_are_not_charged(usage_factory, agent_settings):
    usage = usage_factory()
    store = TurnStore(usage.scope)
    turn = store.submit(usage.user_id, "s1", uuid4(), "Hello")
    store.claim(300, turn["id"], usage.user_id)
    usage.reserve(str(turn["id"]), "gemini-3.8-flash", False, agent_settings)
    rejected = usage.reserve(str(turn["id"]), "gemini-3.8-flash", False, agent_settings)
    usage.reject(rejected)
    store.finish(turn["id"], "failed")
    saved = store.get(usage.user_id, turn["id"])
    assert saved["credits_used"] == 0 and saved["credits_pending"]
    assert usage.account_summary(agent_settings)["credits_pending"]


def test_profile_and_history_use_camelcase_credits_without_currency_fields(usage_factory, agent_settings, monkeypatch):
    usage = usage_factory()
    store = TurnStore(usage.scope)
    turn = store.submit(usage.user_id, "s1", uuid4(), "Hello", "gemini-3.7-flash")
    store.claim(300, turn["id"], usage.user_id)
    record(usage, agent_settings, str(turn["id"]))
    store.finish(turn["id"], "completed", reply="Hello back.")
    async def empty(*args, **kwargs):
        return []
    monkeypatch.setattr(routes, "load_history", empty)
    monkeypatch.setattr(routes, "get_settings", lambda: agent_settings)
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[get_session_scope] = lambda: usage.scope
    client = TestClient(app)
    assert client.get('/agent/account').status_code == 401
    app.dependency_overrides[get_current_user_id] = lambda: usage.user_id
    profile = client.get('/agent/account').json()
    assert profile['creditsUsed'] == 0.0075
    assert profile['email'] == 'test0@example.com'
    assert 'estimatedCostMicrousd' not in profile
    history = client.get('/agent/chat/s1').json()
    assert history['messages'][-1]['creditsUsed'] == 0.0075
    assert history['latestTurn']['model'] == 'gemini-3.7-flash'
    assert history['account'] == profile
    app.dependency_overrides[get_current_user_id] = lambda: usage_factory(owner=1).user_id
    assert client.get('/agent/account').json()['creditsUsed'] == 0
    assert client.get('/agent/chat/s1').json()['messages'] == []


@pytest.mark.parametrize('model', ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'])
def test_model_choice_applies_to_guide_and_researcher(usage_factory, agent_settings, model):
    limits = RequestLimits(usage_factory(), agent_settings, 'turn-id')
    agent = build_agent([], limits, model)
    assert agent.model == agent.tools[0].agent.model == model
    assert limits.invocation_id == 'turn-id'
