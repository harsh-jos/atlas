"""The /ws endpoint: a browser cannot set an Authorization header, so the token comes by query."""

import asyncio
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status

from app.auth.repository import UserRepository
from app.core.security import read_access_token
from app.db.base import SessionScope, get_session_scope
from app.realtime.hub import ConnectionHub

router = APIRouter()
hub = ConnectionHub()

SessionScopeDep = Annotated[SessionScope, Depends(get_session_scope)]


def _authenticate(token: str | None, scope: SessionScope) -> UUID | None:
    """Return the caller's id, or None if the token is missing, bad, or names a gone user."""
    if token is None:
        return None
    try:
        user_id = read_access_token(token)
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    with scope() as session:
        return user_id if UserRepository(session).get(user_id) is not None else None


@router.websocket("/ws")
async def stream(websocket: WebSocket, scope: SessionScopeDep, token: str | None = None) -> None:
    """Hold the socket open for job events; the client is a listener, not a sender."""
    # Authenticate in a scoped session so a socket open for hours never pins a connection.
    user_id = await asyncio.to_thread(_authenticate, token, scope)
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
