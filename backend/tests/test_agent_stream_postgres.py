"""Exercise real LISTEN/NOTIFY delivery across independent database connections."""

import asyncio
from uuid import uuid4

from sqlalchemy import delete
from sqlalchemy.orm import sessionmaker

from app.agent.stream import events
from app.agent.turns import TurnStore
from app.core.config import get_settings
from app.db.models import User


def test_committed_worker_events_wake_a_live_postgres_stream(engine, monkeypatch):
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as session:
        user = User(email=f"stream-{uuid4()}@example.com", password_hash="test-only")
        session.add(user)
        session.flush()
        user_id = user.id
    store = TurnStore(factory.begin)
    turn = store.submit(user_id, "live-stream", uuid4(), "Explain.")
    monkeypatch.setattr(get_settings(), "database_listen_url", engine.url.set(
        drivername="postgresql").render_as_string(hide_password=False))

    async def run():
        waiting = asyncio.Event()
        received = []

        async def collect():
            async for frame in events(store, user_id, turn["id"], None,
                                      lambda row, tools: {"type": "snapshot", "status": row["status"],
                                                          "reply": row["reply"]}):
                received.append(frame)
                if frame.startswith(": heartbeat"):
                    waiting.set()

        task = asyncio.create_task(collect())
        try:
            await asyncio.wait_for(waiting.wait(), timeout=3)

            def work():
                claimed = store.claim(300)
                assert claimed["id"] == turn["id"]
                store.progress(turn["id"], {"type": "agent.delta", "text": "Live text."})
                store.finish(turn["id"], "completed", reply="Live text.")

            await asyncio.to_thread(work)
            # Must wake via notification, well before the 15-second heartbeat timeout.
            await asyncio.wait_for(task, timeout=3)
            assert any('"type": "agent.delta"' in frame for frame in received)
            assert '"status": "completed"' in received[-1]
            assert '"reply": "Live text."' in received[-1]
        finally:
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    try:
        asyncio.run(run())
    finally:
        with factory.begin() as session:
            session.execute(delete(User).where(User.id == user_id))
