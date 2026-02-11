"""WebSocket endpoint for real-time table session updates."""

from __future__ import annotations
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ws_manager import manager

router = APIRouter()


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                # Clients can trigger broadcasts for custom events
                elif msg_type in ("cart_update", "payment_locked", "payment_unlocked",
                                  "order_confirmed", "chef_eta"):
                    await manager.broadcast(session_id, msg)

            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
