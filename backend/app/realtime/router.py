"""The /ws endpoint: a browser cannot set an Authorization header, so the token comes by query."""

from uuid import UUID

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.auth.deps import SessionDep
from app.auth.repository import UserRepository
from app.core.security import read_access_token
from app.realtime.hub import ConnectionHub

router = APIRouter()
hub = ConnectionHub()


def _authenticate(token: str | None, session: Session) -> UUID | None:
    """Return the caller's id, or None if the token is missing, bad, or names a gone user."""
    if token is None:
        return None
    try:
        user_id = read_access_token(token)
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    return user_id if UserRepository(session).get(user_id) is not None else None


@router.websocket("/ws")
async def stream(websocket: WebSocket, session: SessionDep, token: str | None = None) -> None:
    """Hold the socket open for job events; the client is a listener, not a sender."""
    user_id = _authenticate(token, session)
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
