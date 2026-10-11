"""Request-owned generation with durable SSE replay and event-driven delivery."""

import asyncio
import json
import anyio
from contextlib import suppress
from uuid import UUID

from app.agent.execution import execute
from app.agent.turns import ACTIVE, INTERRUPTED, TurnStore
from app.core.config import get_settings


def frame(sequence: int, event: dict) -> str:
    return f"id: {sequence}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"


async def events(store: TurnStore, user_id: UUID, turn_id: UUID, after: int | None,
                 snapshot_event):
    task = None
    claimed = None
    wake = asyncio.Event()
    # Shield the claim so a disconnect cannot discard a successful database commit.
    claim = asyncio.create_task(asyncio.to_thread(
        store.claim, get_settings().agent_turn_timeout_seconds, turn_id, user_id))
    try:
        try:
            claimed = await asyncio.shield(claim)
        except asyncio.CancelledError:
            claimed = await claim
            raise
        state = await asyncio.to_thread(store.stream_snapshot, user_id, turn_id)
        if state is None:
            return
        row, sequence, tools = state
        if claimed is None and row["status"] in ACTIVE:
            yield frame(sequence, {"type": "stream.conflict"})
            return
        if after is None:
            after = sequence
            yield frame(after, snapshot_event(row, tools))
            if row["status"] not in ACTIVE:
                return
        if claimed:
            async def run():
                try:
                    await execute(store, claimed, wake.set)
                finally:
                    wake.set()
            task = asyncio.create_task(run())
        while True:
            wake.clear()
            batch = await asyncio.to_thread(store.events, user_id, turn_id, after)
            for item in batch:
                after = item["id"]
                yield frame(after, item["data"])
            if len(batch) == 250:
                continue
            if task is None or task.done():
                if task:
                    await task
                state = await asyncio.to_thread(store.stream_snapshot, user_id, turn_id)
                if state and state[1] > after:
                    continue
                if state:
                    yield frame(state[1], snapshot_event(state[0], state[2]))
                return
            # Heartbeats do not query the database. Only committed progress wakes delivery.
            while not wake.is_set():
                try:
                    await asyncio.wait_for(wake.wait(), timeout=15)
                except TimeoutError:
                    yield ": heartbeat\n\n"
    finally:
        # Starlette cancels the response's AnyIO scope on disconnect. Shield cleanup so
        # the child is drained and the terminal state commits before ownership is released.
        with anyio.CancelScope(shield=True):
            if task and not task.done():
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            if claimed:
                await asyncio.to_thread(store.finish, turn_id, "interrupted", error=INTERRUPTED)
