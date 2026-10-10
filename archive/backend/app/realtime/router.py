"""The /ws endpoint: a browser cannot set an Authorization header, so the token comes by query."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status

from app.auth.deps import resolve_user_id
from app.db.base import SessionScope, get_session_scope
from app.realtime.hub import hub

router = APIRouter()

SessionScopeDep = Annotated[SessionScope, Depends(get_session_scope)]


@router.websocket("/ws")
async def stream(websocket: WebSocket, scope: SessionScopeDep, token: str | None = None) -> None:
    """Hold the socket open for job and agent events; the client is a listener, not a sender."""
    # Authenticate in a scoped session so a socket open for hours never pins a connection.
    user_id = await asyncio.to_thread(resolve_user_id, token, scope)
    if user_id is None:
        await websocket.close(status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    await hub.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(user_id, websocket)
