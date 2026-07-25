"""In-memory registry of live sockets, so a job can reach every tab one user has open."""

from typing import Any
from uuid import UUID

from fastapi import WebSocket


class ConnectionHub:
    """Fan-out from background work to a user's connections; process-local by design."""

    def __init__(self) -> None:
        self._connections: dict[UUID, set[WebSocket]] = {}

    async def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        self._connections.setdefault(user_id, set()).add(websocket)

    async def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        sockets = self._connections.get(user_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            del self._connections[user_id]

    async def publish(self, user_id: UUID, message: dict[str, Any]) -> None:
        """Reporting progress must never fail because a tab closed, so dead sockets are dropped."""
        for websocket in list(self._connections.get(user_id, ())):
            try:
                await websocket.send_json(message)
            except Exception:
                await self.disconnect(user_id, websocket)

    def count(self, user_id: UUID) -> int:
        return len(self._connections.get(user_id, ()))


hub = ConnectionHub()
