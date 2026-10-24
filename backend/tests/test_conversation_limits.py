"""Account-wide conversation admission, including legacy chats and concurrent starts."""

from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from google.adk.sessions.schemas.v1 import StorageSession
from sqlalchemy import select

from app.agent.turns import TurnStore
from app.auth.roles import set_role
from app.core.config import get_settings
from app.core.enums import Role
from app.core.errors import AppError
from app.db.models import User


@pytest.fixture
def store(usage_factory):
    return TurnStore(usage_factory().scope)


def start(store, user_id, session_id):
    return store.submit(user_id, session_id, uuid4(), "Explain a tensor.")


def fill(store, user_id, count):
    turns = []
    for index in range(count):
        turn = start(store, user_id, f"s{index}")
        claimed = store.claim(300, turn["id"], user_id)
        store.finish(claimed["id"], "completed", reply="A tensor holds values.")
        turns.append(turn)
    return turns


def test_normal_account_can_start_three_and_continue_existing_chats(store, usage_factory):
    user_id = usage_factory().user_id
    turns = fill(store, user_id, 3)
    assert store.conversation_allowance(user_id) == {"used": 3, "limit": 3, "can_start": False}
    with pytest.raises(AppError) as error:
        start(store, user_id, "fourth")
    assert error.value.code == "conversation_limit" and error.value.status == 403
    assert store.conversation(user_id, "fourth") == []
    # Request-ID recovery and further turns remain possible at the account limit.
    assert store.submit(user_id, "s2", turns[-1]["request_id"], turns[-1]["message"])["id"] == turns[-1]["id"]
    assert start(store, user_id, "s0")["session_id"] == "s0"


def test_counts_are_owned_and_include_unopened_or_failed_chats(store, usage_factory):
    first, other = usage_factory().user_id, usage_factory(owner=1).user_id
    for index in range(3):
        turn = start(store, first, f"s{index}")
        if index == 0:
            store.claim(300, turn["id"], first)
            store.finish(turn["id"], "failed", error="Provider unavailable.")
        elif index == 1:
            store.cancel(first, turn["id"])
    assert store.conversation_allowance(other) == {"used": 0, "limit": 3, "can_start": True}
    assert start(store, other, "s0")["session_id"] == "s0"
    with pytest.raises(AppError, match="3 conversations"):
        start(store, first, "fourth")


def test_legacy_chats_count_once_and_are_scoped_to_owner_and_app(store, usage_factory):
    user_id, other = usage_factory().user_id, usage_factory(owner=1).user_id
    fill(store, user_id, 1)
    with store.scope() as session:
        session.add_all([
            StorageSession(app_name=get_settings().agent_app_name, user_id=str(user_id), id=key)
            for key in ("s0", "legacy1", "legacy2")
        ] + [
            StorageSession(app_name="another-app", user_id=str(user_id), id="other-app"),
            StorageSession(app_name=get_settings().agent_app_name, user_id=str(other), id="other-user"),
        ])
    assert store.conversation_allowance(user_id)["used"] == 3
    assert start(store, user_id, "legacy1")["session_id"] == "legacy1"
    for key in ("other-user", "other-app", "new"):
        with pytest.raises(AppError) as error:
            start(store, user_id, key)
        assert error.value.code == "conversation_limit"


def test_two_simultaneous_starts_cannot_take_the_last_slot(store, usage_factory):
    user_id = usage_factory().user_id
    fill(store, user_id, 2)

    def attempt(index):
        try:
            start(TurnStore(store.scope), user_id, f"new{index}")
            return True
        except AppError as error:
            assert error.code == "conversation_limit"
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, range(2))) == [False, True]
    assert store.conversation_allowance(user_id)["used"] == 3


def test_superusers_have_no_conversation_limit_and_demotion_takes_effect(store, usage_factory):
    user_id = usage_factory().user_id
    with store.scope() as session:
        email = session.get(User, user_id).email
    set_role(store.scope, email, Role.SUPERUSER)
    fill(store, user_id, 5)
    assert store.conversation_allowance(user_id) == {"used": 5, "limit": None, "can_start": True}
    set_role(store.scope, email, Role.NORMAL)
    with pytest.raises(AppError, match="3 conversations"):
        start(store, user_id, "sixth")
    assert start(store, user_id, "s4")["session_id"] == "s4"
    assert len(store.summaries(user_id)) == 5


def test_role_admin_refuses_unknown_accounts_without_creating_one(store):
    with pytest.raises(ValueError, match="No account"):
        set_role(store.scope, "unknown@example.com", Role.SUPERUSER)
    with store.scope() as session:
        assert len(session.scalars(select(User)).all()) == 2
