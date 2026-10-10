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


def test_stop_queued_is_owned_idempotent_and_never_claimed(turns, usage_factory):
    accepted = submit(turns, usage_factory)
    owner = usage_factory().user_id
    assert turns.cancel(usage_factory(owner=1).user_id, accepted['id']) is None
    stopped = turns.cancel(owner, accepted['id'])
    assert stopped['status'] == 'cancelled'
    assert turns.cancel(owner, accepted['id']) == stopped
    assert turns.claim(300) is None
    submit(turns, usage_factory)


def test_stop_running_waits_for_worker_and_retains_partial_reply(turns, usage_factory, monkeypatch):
    accepted = submit(turns, usage_factory)
    owner = usage_factory().user_id

    async def run():
        started = asyncio.Event()
        cancelled = asyncio.Event()

        async def tool(*args, on_event, **kwargs):
            await on_event({'type': 'agent.message', 'text': 'Partial explanation.'})
            await on_event({'type': 'agent.tool', 'name': 'researcher'})
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        monkeypatch.setattr(worker, 'run_turn', tool)
        task = asyncio.create_task(worker.execute(turns, turns.claim(300)))
        await started.wait()
        state = turns.cancel(owner, accepted['id'])
        assert state['status'] == 'running' and state['cancel_requested']
        with pytest.raises(TurnConflict):
            submit(turns, usage_factory)
        async with asyncio.timeout(2):
            await task
        assert cancelled.is_set()

    asyncio.run(run())
    state = turns.get(owner, accepted['id'])
    assert state['status'] == 'cancelled' and state['reply'] == 'Partial explanation.'
    assert state['tool_name'] is None
    turns.finish(accepted['id'], 'completed', reply='Late reply')
    assert turns.get(owner, accepted['id']) == state
    submit(turns, usage_factory)


def test_stop_before_execution_makes_no_model_call(turns, usage_factory, monkeypatch):
    accepted = submit(turns, usage_factory)
    claimed = turns.claim(300)
    turns.cancel(usage_factory().user_id, accepted['id'])

    async def unexpected(*args, **kwargs):
        pytest.fail('Stopped work must not start a model call')

    monkeypatch.setattr(worker, 'run_turn', unexpected)
    asyncio.run(worker.execute(turns, claimed))
    assert turns.get(usage_factory().user_id, accepted['id'])['status'] == 'cancelled'


def test_stop_does_not_change_a_completed_turn(turns, usage_factory):
    accepted = submit(turns, usage_factory)
    turns.claim(300)
    turns.finish(accepted['id'], 'completed', reply='Done.')
    owner = usage_factory().user_id
    completed = turns.get(owner, accepted['id'])
    assert turns.cancel(owner, accepted['id']) == completed


def test_stop_wins_race_with_completion(turns, usage_factory):
    accepted = submit(turns, usage_factory)
    turns.claim(300)
    owner = usage_factory().user_id
    turns.cancel(owner, accepted['id'])
    turns.finish(accepted['id'], 'completed', reply='Output already produced.')
    assert turns.get(owner, accepted['id'])['status'] == 'cancelled'


def test_stop_still_cancels_when_provider_consumes_cancellation(turns, usage_factory, monkeypatch):
    accepted = submit(turns, usage_factory)
    owner = usage_factory().user_id

    async def run():
        started = asyncio.Event()

        async def consume(*args, **kwargs):
            started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                return 'Provider returned during cleanup.'

        monkeypatch.setattr(worker, 'run_turn', consume)
        task = asyncio.create_task(worker.execute(turns, turns.claim(300)))
        await started.wait()
        turns.cancel(owner, accepted['id'])
        async with asyncio.timeout(2):
            await task

    asyncio.run(run())
    assert turns.get(owner, accepted['id'])['status'] == 'cancelled'


def test_stop_drains_an_inflight_database_tool(turns, usage_factory, monkeypatch):
    from threading import Event
    from app.agent.toolkit import build_toolkit

    started, release, finished = Event(), Event(), Event()

    def save(*args):
        started.set()
        assert release.wait(2)
        finished.set()
        return {'saved': True}

    monkeypatch.setattr('app.agent.toolkit.knowledge.remember_concept', save)
    tool = next(t for t in build_toolkit(turns.scope, usage_factory().user_id)
                if t.__name__ == 'remember_concept')

    async def run():
        task = asyncio.create_task(tool('Tensor', 'Values.'))
        try:
            assert await asyncio.to_thread(started.wait, 2)
            task.cancel()
            await asyncio.sleep(0.01)
            assert not task.done()
        finally:
            release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert finished.is_set()

    asyncio.run(run())


def test_stop_request_survives_worker_crash(turns, usage_factory):
    accepted = submit(turns, usage_factory)
    turns.claim(300)
    owner = usage_factory().user_id
    turns.cancel(owner, accepted['id'])
    with turns.scope() as session:
        session.execute(update(AgentTurn).where(AgentTurn.id == accepted['id']).values(
            lease_until=datetime.now(timezone.utc) - timedelta(seconds=1)))
    reopened = TurnStore(turns.scope)
    assert reopened.claim(300) is None
    assert reopened.get(owner, accepted['id'])['status'] == 'cancelled'


def test_worker_continues_after_user_stop(turns, usage_factory, monkeypatch):
    first = submit(turns, usage_factory)
    second = submit(turns, usage_factory, session_id='s2')
    owner = usage_factory().user_id
    monkeypatch.setattr(worker, 'get_session_scope', lambda: turns.scope)

    async def run():
        started = asyncio.Event()

        async def respond(user_id, session_id, *args, **kwargs):
            if session_id == 's1':
                started.set()
                await asyncio.Event().wait()
            return 'Second conversation completed.'

        monkeypatch.setattr(worker, 'run_turn', respond)
        task = asyncio.create_task(worker.run_worker())
        try:
            async with asyncio.timeout(3):
                await started.wait()
                turns.cancel(owner, first['id'])
                while turns.get(owner, second['id'])['status'] != 'completed':
                    await asyncio.sleep(0.01)
            assert turns.get(owner, first['id'])['status'] == 'cancelled'
        finally:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

    asyncio.run(run())


def test_queue_admission_is_bounded_and_retries_still_work(turns, usage_factory, monkeypatch):
    from app.core.config import get_settings
    from app.core.errors import AppError
    settings = get_settings()
    monkeypatch.setattr(settings, 'agent_max_active_turns_per_user', 1)
    monkeypatch.setattr(settings, 'agent_max_active_turns', 2)
    first = submit(turns, usage_factory)
    assert submit(turns, usage_factory, request_id=first['request_id']) == first
    with pytest.raises(AppError) as error:
        submit(turns, usage_factory, session_id='other')
    assert error.value.code == 'user_queue_full'
    turns.submit(usage_factory(owner=1).user_id, 's2', uuid4(), 'Other owner.')
    monkeypatch.setattr(settings, 'agent_max_active_turns_per_user', 3)
    with pytest.raises(AppError) as error:
        submit(turns, usage_factory, session_id='other')
    assert error.value.code == 'queue_full'
    turns.cancel(usage_factory().user_id, first['id'])
    submit(turns, usage_factory, session_id='other')


def test_concurrent_admission_cannot_exceed_global_capacity(turns, usage_factory, monkeypatch):
    from app.core.config import get_settings
    from app.core.errors import AppError
    monkeypatch.setattr(get_settings(), 'agent_max_active_turns', 1)
    def attempt(index):
        try:
            turns.submit(usage_factory(owner=index).user_id, 's1', uuid4(), 'Hello')
            return True
        except AppError as error:
            assert error.code == 'queue_full'
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, range(2))) == [False, True]


def test_incomplete_and_tool_errors_are_durable_without_parsing_reply(turns, usage_factory, monkeypatch):
    first = submit(turns, usage_factory)
    async def incomplete(*args, on_event, **kwargs):
        await on_event({'type': 'agent.tool_error', 'name': 'save_explanation',
                        'code': 'storage_quota', 'message': 'Storage is full.'})
        await on_event({'type': 'agent.incomplete', 'code': 'budget_limit'})
        return 'Useful partial explanation.'
    monkeypatch.setattr(worker, 'run_turn', incomplete)
    asyncio.run(worker.execute(turns, turns.claim(300)))
    state = turns.get(usage_factory().user_id, first['id'])
    assert state['status'] == 'incomplete' and state['error_code'] == 'budget_limit'
    assert state['reply'] == 'Useful partial explanation.'
    assert state['tool_errors'][0]['code'] == 'storage_quota'


def test_tool_failure_does_not_disappear_when_the_model_reports_success(turns, usage_factory, monkeypatch):
    from contextlib import contextmanager
    from app.agent.toolkit import build_toolkit
    first = submit(turns, usage_factory)
    @contextmanager
    def broken_scope():
        raise RuntimeError('private database details')
        yield
    async def explanation(*args, on_event, **kwargs):
        tool = build_toolkit(broken_scope, usage_factory().user_id, on_event=on_event)[0]
        result = await tool('tensors')
        assert result['code'] == 'internal_error'
        return 'A tensor stores values.'
    monkeypatch.setattr(worker, 'run_turn', explanation)
    asyncio.run(worker.execute(turns, turns.claim(300)))
    state = turns.get(usage_factory().user_id, first['id'])
    assert state['status'] == 'completed'
    assert state['tool_errors'] and 'private' not in str(state['tool_errors'])
