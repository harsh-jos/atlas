"""Unlimited conversation starts and server-enforced immutable models."""
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from app.agent.turns import TurnStore, TurnConflict
from app.agent.models import CHAT_MODELS
from app.auth.roles import set_role
from app.core.enums import Role
from app.core.errors import AppError
from app.db.models import User


def test_free_account_can_start_and_continue_unlimited_conversations(usage_factory):
    usage = usage_factory()
    store = TurnStore(usage.scope)
    for index in range(8):
        turn = store.submit(usage.user_id, f"s{index}", uuid4(), "Hello")
        store.cancel(usage.user_id, turn["id"])
    assert store.conversation_allowance(usage.user_id) == {"used": 8, "limit": None, "can_start": True}
    assert store.submit(usage.user_id, "s0", uuid4(), "More")["session_id"] == "s0"
    assert store.conversation_allowance(usage_factory(owner=1).user_id)["used"] == 0


@pytest.mark.parametrize("model", CHAT_MODELS)
def test_selected_model_is_durable_and_cannot_be_changed(usage_factory, model):
    usage = usage_factory()
    store = TurnStore(usage.scope)
    request = uuid4()
    first = store.submit(usage.user_id, "s1", request, "Hello", model)
    assert first["model"] == model
    assert store.submit(usage.user_id, "s1", request, "Hello", model)["id"] == first["id"]
    store.cancel(usage.user_id, first["id"])
    other = next(candidate for candidate in CHAT_MODELS if candidate != model)
    with pytest.raises(TurnConflict, match="cannot be changed"):
        store.submit(usage.user_id, "s1", uuid4(), "More", other)
    reopened = TurnStore(usage.scope)
    assert reopened.submit(usage.user_id, "s1", uuid4(), "More")["model"] == model


def test_concurrent_model_selections_cannot_change_the_winning_model(usage_factory):
    usage = usage_factory()
    def submit(model):
        try:
            return TurnStore(usage.scope).submit(usage.user_id, "s1", uuid4(), "Hello", model)["model"]
        except TurnConflict:
            return None
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(submit, CHAT_MODELS[:2]))
    assert len([result for result in results if result]) == 1


def test_invalid_model_is_rejected_before_creating_a_turn(usage_factory):
    usage = usage_factory()
    store = TurnStore(usage.scope)
    with pytest.raises(AppError, match="supported"):
        store.submit(usage.user_id, "s1", uuid4(), "Hello", "made-up")
    assert store.conversation(usage.user_id, "s1") == []


def test_role_admin_refuses_unknown_accounts_without_creating_one(usage_factory):
    store = TurnStore(usage_factory().scope)
    with pytest.raises(ValueError, match="No account"):
        set_role(store.scope, "unknown@example.com", Role.SUPERUSER)
    with store.scope() as session:
        from sqlalchemy import select
        assert len(session.scalars(select(User)).all()) == 2


def test_legacy_conversation_pins_model_on_first_new_turn(usage_factory, monkeypatch):
    from app.agent import turns as turns_module
    from app.core.config import get_settings
    from app.db.models import AgentTurn
    usage = usage_factory()
    store = TurnStore(usage.scope)
    settings = get_settings().model_copy()
    monkeypatch.setattr(turns_module, 'get_settings', lambda: settings)
    with usage.scope() as session:
        session.add(AgentTurn(user_id=usage.user_id, session_id='legacy', request_id=uuid4(),
                              message='Old message', status='completed', reply='Old reply'))
    first = store.submit(usage.user_id, 'legacy', uuid4(), 'Continue')
    store.cancel(usage.user_id, first['id'])
    settings.agent_model = 'gemini-3.6-flash'
    assert store.submit(usage.user_id, 'legacy', uuid4(), 'Continue again')['model'] == first['model']
