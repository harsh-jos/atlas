"""A lifespan-owned worker for the private app; no broker or automatic model retries."""

import asyncio
import logging

from app.agent.service import AgentUnavailable, run_turn
from app.agent.turns import INTERRUPTED, TurnStore
from app.core.config import get_settings
from app.db.base import get_session_scope

log = logging.getLogger(__name__)


async def execute(store: TurnStore, turn: dict) -> None:
    async def progress(event: dict) -> None:
        await asyncio.to_thread(store.progress, turn["id"], event)

    try:
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
        await asyncio.to_thread(store.finish, turn["id"], "completed", reply=reply)
    except asyncio.CancelledError:
        await asyncio.to_thread(store.finish, turn["id"], "interrupted", error=INTERRUPTED)
        raise
    except AgentUnavailable as error:
        await asyncio.to_thread(store.finish, turn["id"], "failed", error=str(error))
    except Exception:
        # ADK can consume cancellation while closing its root node. Shutdown must still stop
        # this worker rather than accidentally starting another queued request.
        if asyncio.current_task().cancelling():
            await asyncio.to_thread(store.finish, turn["id"], "interrupted", error=INTERRUPTED)
            raise asyncio.CancelledError() from None
        log.exception("agent turn %s failed", turn["id"])
        await asyncio.to_thread(
            store.finish,
            turn["id"],
            "failed",
            error="Atlas could not finish this reply. Already saved work remains. No automatic retry was made.",
        )


async def run_worker() -> None:
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
                await execute(store, turn)
            else:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("turn worker unavailable; retrying database access")
            await asyncio.sleep(2)
