"""WebSocket connection manager — singleton shared across routers."""

from __future__ import annotations
import json, logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Tracks active WebSocket connections per session_id and broadcasts messages."""

    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)
        logger.info(f"[Manager] Connected to {session_id[:8]}, total connections: {len(self.active_connections[session_id])}")

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_connections:
            try:
                self.active_connections[session_id].remove(websocket)
                logger.info(f"[Manager] Disconnected from {session_id[:8]}, remaining: {len(self.active_connections[session_id])}")
            except ValueError:
                pass
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
                logger.info(f"[Manager] No connections left for {session_id[:8]}, removed channel")

    async def broadcast(self, session_id: str, message: dict):
        if session_id not in self.active_connections:
            logger.warning(f"[Manager] ⚠️ Cannot broadcast to {session_id[:8]} - no active connections!")
            return
        conns = self.active_connections[session_id]
        logger.info(f"[Manager] 📡 Broadcasting '{message.get('type')}' to {len(conns)} connection(s) in {session_id[:8]}")
        dead: list[WebSocket] = []
        success_count = 0
        for conn in conns:
            try:
                await conn.send_json(message)
                success_count += 1
            except Exception as e:
                logger.error(f"[Manager] Failed to send to connection: {e}")
                dead.append(conn)
        logger.info(f"[Manager] ✅ Sent to {success_count}/{len(conns)} connections, {len(dead)} dead")
        for d in dead:
            self.disconnect(session_id, d)

    def count(self, session_id: str) -> int:
        return len(self.active_connections.get(session_id, []))


# Singleton — import this in any router that needs it
manager = ConnectionManager()
