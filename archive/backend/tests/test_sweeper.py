"""Housekeeping runs beside the app, so it must never hold shutdown open."""

import asyncio
from contextlib import contextmanager

from app.jobs.sweeper import run_sweeper


def _scope(session):
    @contextmanager
    def scope():
        yield session

    return scope


def test_the_sweeper_stops_promptly_when_asked(session):
    async def scenario() -> None:
        stop = asyncio.Event()
        sweeper = asyncio.create_task(run_sweeper(_scope(session), stop))
        stop.set()
        await asyncio.wait_for(sweeper, timeout=2)

    asyncio.run(scenario())


def test_a_failing_sweep_does_not_kill_the_loop(session, monkeypatch):
    calls: list[int] = []

    def explode(scope):
        calls.append(1)
        raise RuntimeError("database went away")

    monkeypatch.setattr("app.jobs.sweeper._sweep", explode)
    monkeypatch.setattr("app.jobs.sweeper.get_settings", lambda: _Interval())

    async def scenario() -> None:
        stop = asyncio.Event()
        sweeper = asyncio.create_task(run_sweeper(_scope(session), stop))
        await asyncio.sleep(0.15)
        stop.set()
        await asyncio.wait_for(sweeper, timeout=2)

    asyncio.run(scenario())
    assert calls, "the sweep should have run and failed at least once"


class _Interval:
    preview_sweep_seconds = 0.01
