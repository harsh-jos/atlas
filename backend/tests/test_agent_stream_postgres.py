"""Exercise worker-owned streaming with real committed Postgres state."""

import asyncio
from uuid import uuid4

from sqlalchemy import delete
from sqlalchemy.orm import sessionmaker

from app.agent.stream import events
from app.agent.turns import TurnStore
from app.db.models import User


def test_request_stream_persists_progress_in_postgres(engine, monkeypatch):
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as session:
        user = User(email=f"stream-{uuid4()}@example.com", password_hash="test-only")
        session.add(user)
        session.flush()
        user_id = user.id
    store = TurnStore(factory.begin)
    turn = store.submit(user_id, "live-stream", uuid4(), "Explain.")
    from app.agent import execution

    async def respond(*args, on_event, **kwargs):
        await on_event({"type": "agent.delta", "text": "Live text."})
        return "Live text."

    monkeypatch.setattr(execution, "run_turn", respond)

    async def run():
        worker = asyncio.create_task(execution.execute(store, store.claim(300)))
        received = [frame async for frame in events(
            store, user_id, turn["id"], None,
            lambda row, tools: {"type": "snapshot", "status": row["status"], "reply": row["reply"]})]
        await worker
        assert any("Live text." in frame for frame in received)
        assert '"status": "completed"' in received[-1]
        assert '"reply": "Live text."' in received[-1]

    try:
        asyncio.run(run())
    finally:
        with factory.begin() as session:
            session.execute(delete(User).where(User.id == user_id))
