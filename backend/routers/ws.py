"""WebSocket endpoint for real-time table session updates."""

from __future__ import annotations
import json, asyncio, logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ws_manager import manager

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)
    
    try:
        while True:
            # Non-blocking receive - responds immediately when data arrives
            data = await websocket.receive_text()
            
            try:
                msg = json.loads(data)
                msg_type = msg.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "message":
                    # Handle actual messages
                    await manager.broadcast(session_id, msg)
                else:
                    logger.warning(f"Unknown message type: {msg_type}")
                    
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON from {session_id}: {e}")
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                
    except WebSocketDisconnect:
        logger.info(f"Client {session_id} disconnected normally")
    except Exception as e:
        logger.error(f"WebSocket error for {session_id}: {e}")
    finally:
        manager.disconnect(session_id, websocket)