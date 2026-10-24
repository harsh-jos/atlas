"""Request-owned execution; no background worker or automatic model retries."""

import asyncio
import logging

from app.agent.service import AgentUnavailable, run_turn
from app.agent.turns import INTERRUPTED, TurnStore
from app.core.config import get_settings
from app.core.errors import describe, report, turn_id

log = logging.getLogger(__name__)


async def execute(store: TurnStore, turn: dict, on_progress=None) -> None:
    """Execute only the turn attached to the caller's SSE request."""
    token = turn_id.set(str(turn["id"]))
    try:
        await _execute(store, turn, on_progress)
    finally:
        turn_id.reset(token)


async def _execute(store: TurnStore, turn: dict, on_progress=None) -> None:
    incomplete_code = None

    async def progress(event: dict) -> None:
        nonlocal incomplete_code
        if event["type"] == "agent.incomplete":
            incomplete_code = event["code"]
        await asyncio.to_thread(store.progress, turn["id"], event)
        if on_progress:
            on_progress()

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
                model=turn.get("model"),
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
        # ADK can consume cancellation while closing its root node; a disconnected
        # request must still finish as interrupted.
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
