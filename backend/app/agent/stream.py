"""SSE observes committed events; generation belongs to a durable worker."""
import asyncio
import json
from app.agent.turns import ACTIVE


def frame(sequence: int, event: dict) -> str:
    return f"id: {sequence}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"


async def events(store, user_id, turn_id, after, snapshot_event):
    state = await asyncio.to_thread(store.stream_snapshot, user_id, turn_id)
    if not state:
        return
    row, sequence, tools = state
    if after is None:
        after = sequence
        yield frame(sequence, snapshot_event(row, tools))
        if row["status"] not in ACTIVE:
            return
    ticks = 0
    while True:
        batch = await asyncio.to_thread(store.events, user_id, turn_id, after)
        for item in batch:
            after = item["id"]
            yield frame(after, item["data"])
        if len(batch) == 250:
            continue
        # The small row read checks lease expiry as well as terminal state. No execution
        # is started or cancelled by opening/closing this iterator.
        row = await asyncio.to_thread(store.get, user_id, turn_id)
        if not row:
            return
        if row["status"] not in ACTIVE:
            state = await asyncio.to_thread(store.stream_snapshot, user_id, turn_id)
            if state and state[1] > after:
                continue
            if state:
                yield frame(state[1], snapshot_event(state[0], state[2]))
            return
        ticks += 1
        if ticks % 20 == 0:
            yield ": heartbeat\n\n"
        await asyncio.sleep(0.75)
