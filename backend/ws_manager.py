"""WebSocket connection manager — singleton shared across routers."""

from __future__ import annotations
import json
from fastapi import WebSocket


class ConnectionManager:
    """Tracks active WebSocket connections per session_id and broadcasts messages."""

    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_connections:
            try:
                self.active_connections[session_id].remove(websocket)
            except ValueError:
                pass
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def broadcast(self, session_id: str, message: dict):
        if session_id not in self.active_connections:
            return
        dead: list[WebSocket] = []
        for conn in self.active_connections[session_id]:
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for d in dead:
            self.disconnect(session_id, d)

    def count(self, session_id: str) -> int:
        return len(self.active_connections.get(session_id, []))


# Singleton — import this in any router that needs it
manager = ConnectionManager()
