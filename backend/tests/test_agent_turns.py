"""Durable submissions and recovery; no model or network calls."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import update

from app.agent import worker
from app.agent.service import AgentUnavailable
from app.agent.turns import TurnConflict, TurnStore
from app.db.models import AgentTurn


@pytest.fixture
def turns(usage_factory):
    return TurnStore(usage_factory().scope)


def submit(turns, usage_factory, session_id="s1", request_id=None):
    return turns.submit(
        usage_factory().user_id, session_id, request_id or uuid4(), "Explain a tensor."
    )


def test_submission_is_owned_idempotent_and_survives_reopening(turns, usage_factory):
    request_id = uuid4()
    first = submit(turns, usage_factory, request_id=request_id)
    reopened = TurnStore(turns.scope)
    assert submit(reopened, usage_factory, request_id=request_id) == first
    assert reopened.get(usage_factory(owner=1).user_id, first["id"]) is None
    assert reopened.conversation(usage_factory(owner=1).user_id, "s1") == []
    assert reopened.conversation(usage_factory().user_id, "s1") == [first]
    with pytest.raises(TurnConflict, match="different message"):
        reopened.submit(usage_factory().user_id, "s1", request_id, "Different.")


def test_only_one_active_turn_per_conversation(turns, usage_factory):
    submit(turns, usage_factory)
    with pytest.raises(TurnConflict, match="already queued"):
        submit(turns, usage_factory)
    submit(turns, usage_factory, session_id="other")


def test_concurrent_submissions_cannot_create_two_active_turns(turns, usage_factory):
    def attempt(_):
        try:
            submit(TurnStore(turns.scope), usage_factory)
            return True
        except TurnConflict:
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, range(2))) == [False, True]


def test_concurrent_workers_claim_once(turns, usage_factory):
    accepted = submit(turns, usage_factory)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: TurnStore(turns.scope).claim(300), range(2)))
    assert [row["id"] for row in results if row] == [accepted["id"]]


def test_crash_recovery_retains_partial_reply_and_never_replays(turns, usage_factory):
    accepted = submit(turns, usage_factory)
    turn = turns.claim(300)
    turns.progress(turn["id"], {"type": "agent.message", "text": "Already saved text."})
    with turns.scope() as session:
        session.execute(
            update(AgentTurn)
            .where(AgentTurn.id == turn["id"])
            .values(lease_until=datetime.now(timezone.utc) - timedelta(seconds=1))
        )
    reopened = TurnStore(turns.scope)
    assert reopened.claim(300) is None
    state = reopened.get(usage_factory().user_id, accepted["id"])
    assert state["status"] == "interrupted"
    assert state["reply"] == "Already saved text."
    assert "not automatically retried" in state["error"]
    # A late callback from an expired execution cannot overwrite its terminal state.
    turns.finish(turn["id"], "completed", reply="Late reply.")
    assert reopened.get(usage_factory().user_id, accepted["id"]) == state
    submit(turns, usage_factory)


def test_execution_and_progress_do_not_require_a_connected_client(
    turns, usage_factory, monkeypatch
):
    accepted = submit(turns, usage_factory)

    async def fake_turn(user_id, session_id, message, *, on_event, turn_id):
        assert turn_id == str(accepted["id"])
        await on_event({"type": "agent.tool", "name": "researcher"})
        assert turns.get(user_id, accepted["id"])["tool_name"] == "researcher"
        await on_event({"type": "agent.message", "text": "A tensor holds values."})
        return "A tensor holds values."

    monkeypatch.setattr(worker, "run_turn", fake_turn)
    asyncio.run(worker.execute(turns, turns.claim(300)))
    result = TurnStore(turns.scope).get(usage_factory().user_id, accepted["id"])
    assert result["status"] == "completed" and result["reply"] == "A tensor holds values."
    assert result["tool_name"] is None


@pytest.mark.parametrize("unavailable", [False, True])
def test_failed_execution_is_persisted_without_retries(
    turns, usage_factory, monkeypatch, unavailable
):
    accepted = submit(turns, usage_factory)
    calls = []

    async def fail(*args, **kwargs):
        calls.append(True)
        if unavailable:
            raise AgentUnavailable("Vertex AI quota unavailable.")
        raise RuntimeError("sensitive provider internals")

    monkeypatch.setattr(worker, "run_turn", fail)
    asyncio.run(worker.execute(turns, turns.claim(300)))
    state = turns.get(usage_factory().user_id, accepted["id"])
    assert state["status"] == "failed"
    assert "sensitive" not in state["error"]
    assert turns.claim(300) is None and len(calls) == 1


def test_graceful_shutdown_marks_the_active_reply_interrupted(turns, usage_factory, monkeypatch):
    accepted = submit(turns, usage_factory)

    async def run():
        started = asyncio.Event()

        async def wait(*args, **kwargs):
            started.set()
            await asyncio.Event().wait()

        monkeypatch.setattr(worker, "run_turn", wait)
        task = asyncio.create_task(worker.execute(turns, turns.claim(300)))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run())
    assert turns.get(usage_factory().user_id, accepted["id"])["status"] == "interrupted"


def test_sessions_include_queued_messages_before_adk_starts(turns, usage_factory):
    submit(turns, usage_factory)
    summaries = turns.summaries(usage_factory().user_id)
    assert summaries[0]["first_message"] == "Explain a tensor."
    assert summaries[0]["session_id"] == "s1"
    assert turns.summaries(usage_factory(owner=1).user_id) == []


def test_restarted_worker_loads_the_persisted_queue(turns, usage_factory, monkeypatch):
    accepted = submit(turns, usage_factory)
    calls = []

    async def fake_turn(*args, **kwargs):
        calls.append(kwargs["turn_id"])
        return "Recovered from the queue."

    monkeypatch.setattr(worker, "get_session_scope", lambda: turns.scope)
    monkeypatch.setattr(worker, "run_turn", fake_turn)

    async def run():
        task = asyncio.create_task(worker.run_worker())
        try:
            async with asyncio.timeout(2):
                while turns.get(usage_factory().user_id, accepted["id"])["status"] != "completed":
                    await asyncio.sleep(0.01)
        finally:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

    asyncio.run(run())
    assert calls == [str(accepted["id"])]
