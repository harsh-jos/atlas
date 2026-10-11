"""Durable SSE replay with PostgreSQL notifications for live delivery."""

import asyncio
import json
from contextlib import asynccontextmanager
from uuid import UUID

import psycopg
from psycopg import sql

from app.agent.turns import ACTIVE, TurnStore
from app.core.config import get_settings
from app.db.base import database_url


def frame(sequence: int, event: dict) -> str:
    return f"id: {sequence}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"


@asynccontextmanager
async def notifications(turn_id: UUID):
    # LISTEN needs a session connection, not a transaction-mode pooler.
    url = get_settings().database_listen_url or database_url().set(
        drivername="postgresql"
    ).render_as_string(hide_password=False)
    async with await psycopg.AsyncConnection.connect(
        url, autocommit=True, connect_timeout=get_settings().db_connect_timeout_seconds
    ) as connection:
        await connection.execute(sql.SQL("LISTEN {}").format(
            sql.Identifier(f"atlas_turn_{turn_id.hex}")
        ))

        async def wait():
            async for _ in connection.notifies(timeout=15, stop_after=1):
                break

        yield wait


async def events(store: TurnStore, user_id: UUID, turn_id: UUID, after: int | None,
                 snapshot_event):
    """Subscribe before reading, so events committed during connection setup aren't lost."""
    initial = await asyncio.to_thread(store.stream_snapshot, user_id, turn_id)
    if initial is None:
        return
    if initial[0]["status"] not in ACTIVE:
        # Replay completed streams too, without allocating a LISTEN connection.
        async def no_wait():
            return
        async for item in _deliver(store, user_id, turn_id, after, snapshot_event, no_wait):
            yield item
        return
    async with notifications(turn_id) as wait:
        async for item in _deliver(store, user_id, turn_id, after, snapshot_event, wait):
            yield item


async def _deliver(store, user_id, turn_id, after, snapshot_event, wait):
    if after is None:
        state = await asyncio.to_thread(store.stream_snapshot, user_id, turn_id)
        if state is None:
            return
        row, after, tools = state
        yield frame(after, snapshot_event(row, tools))
        if row["status"] not in ACTIVE:
            return
    while True:
        batch = await asyncio.to_thread(store.events, user_id, turn_id, after)
        for item in batch:
            after = item["id"]
            yield frame(after, item["data"])
        if len(batch) == 250:
            continue
        state = await asyncio.to_thread(store.stream_snapshot, user_id, turn_id)
        if state is None:
            return
        row, sequence, tools = state
        # A terminal commit may have raced the read of the log. Drain it first.
        if sequence > after:
            continue
        if row["status"] not in ACTIVE:
            yield frame(sequence, snapshot_event(row, tools))
            return
        yield ": heartbeat\n\n"
        # The timeout is a recovery check for lost notifications, not a token polling loop.
        await wait()
