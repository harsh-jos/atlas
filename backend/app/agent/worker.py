"""A lifespan-owned worker for the private app; no broker or automatic model retries."""

import asyncio
import logging
from dataclasses import dataclass
from time import monotonic

from app.agent.service import AgentUnavailable, run_turn
from app.agent.turns import INTERRUPTED, TurnStore
from app.core.config import get_settings
from app.db.base import get_session_scope
from app.core.errors import describe, report, turn_id

log = logging.getLogger(__name__)


@dataclass
class WorkerHealth:
    last_seen: float = 0
    available: bool = False

    def tick(self):
        self.last_seen, self.available = monotonic(), True

    def ready(self) -> bool:
        settings = get_settings()
        deadline = settings.db_statement_timeout_seconds + settings.db_connect_timeout_seconds + 10
        return self.available and monotonic() - self.last_seen < deadline


async def execute(store: TurnStore, turn: dict, health: WorkerHealth | None = None) -> None:
    token = turn_id.set(str(turn["id"]))
    started = monotonic()
    log.info("turn_started turn_id=%s", turn["id"])
    try:
        await _watch_execution(store, turn, health)
    finally:
        log.info(
            "turn_execution_ended turn_id=%s duration_ms=%d",
            turn["id"],
            (monotonic() - started) * 1000,
        )
        turn_id.reset(token)


async def _watch_execution(store: TurnStore, turn: dict, health: WorkerHealth | None) -> None:
    # The database signal works across processes and survives API/worker restarts.
    task = asyncio.create_task(_execute(store, turn))
    try:
        while not task.done():
            state = await asyncio.to_thread(store.get, turn["user_id"], turn["id"])
            if health:
                health.tick()
            if state and state["cancel_requested"]:
                task.cancel()
                break
            await asyncio.wait({task}, timeout=0.5)
        try:
            await task
        except asyncio.CancelledError:
            if asyncio.current_task().cancelling():
                raise
    finally:
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        # Covers cancellation before the child had a chance to start its try/finally.
        await asyncio.to_thread(store.finish, turn["id"], "interrupted", error=INTERRUPTED)


async def _execute(store: TurnStore, turn: dict) -> None:
    incomplete_code = None

    async def progress(event: dict) -> None:
        nonlocal incomplete_code
        if event["type"] == "agent.incomplete":
            incomplete_code = event["code"]
        await asyncio.to_thread(store.progress, turn["id"], event)

    try:
        state = await asyncio.to_thread(store.get, turn["user_id"], turn["id"])
        if state and state["cancel_requested"]:
            await asyncio.to_thread(store.finish, turn["id"], "cancelled")
            return
        async with asyncio.timeout(get_settings().agent_turn_timeout_seconds + 5):
            reply = await run_turn(
                turn["user_id"],
                turn["session_id"],
                turn["message"],
                on_event=progress,
                turn_id=str(turn["id"]),
            )
        if asyncio.current_task().cancelling():
            raise asyncio.CancelledError()
        status = "incomplete" if incomplete_code else "completed"
        await asyncio.to_thread(
            store.finish, turn["id"], status, reply=reply, error_code=incomplete_code
        )
        log.info("turn_finished turn_id=%s status=%s code=%s", turn["id"], status, incomplete_code)
    except asyncio.CancelledError:
        await asyncio.to_thread(store.finish, turn["id"], "interrupted", error=INTERRUPTED)
        raise
    except AgentUnavailable as error:
        report(log, error, error.code)
        await asyncio.to_thread(
            store.finish, turn["id"], "failed", error=str(error), error_code=error.code
        )
    except Exception as error:
        # ADK can consume cancellation while closing its root node. Shutdown must still stop
        # this worker rather than accidentally starting another queued request.
        if asyncio.current_task().cancelling():
            await asyncio.to_thread(store.finish, turn["id"], "interrupted", error=INTERRUPTED)
            raise asyncio.CancelledError() from None
        failure = describe(error)
        report(log, error, failure.code)
        await asyncio.to_thread(
            store.finish,
            turn["id"],
            "failed",
            error=f"{failure.message} Already saved work remains. No automatic retry was made.",
            error_code=failure.code,
        )


async def run_worker(health: WorkerHealth | None = None) -> None:
    store = TurnStore(get_session_scope())
    while True:
        try:
            # Cancellation cannot discard the ID of a claim still committing in a thread.
            claim = asyncio.create_task(
                asyncio.to_thread(store.claim, get_settings().agent_turn_timeout_seconds)
            )
            try:
                turn = await asyncio.shield(claim)
            except asyncio.CancelledError:
                turn = await claim
                if turn:
                    await asyncio.to_thread(
                        store.finish, turn["id"], "interrupted", error=INTERRUPTED
                    )
                raise
            if turn:
                await execute(store, turn, health)
            else:
                if health:
                    health.tick()
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            if health:
                health.available = False
            report(log, error, "worker_unavailable")
            await asyncio.sleep(2)
