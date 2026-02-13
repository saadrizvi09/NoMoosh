"""WebSocket endpoints — WhatsApp-style push architecture.

Three channels:
  /ws/{session_id}              → Customer session (cart, payment, ETA)
  /ws/staff/{restaurant_id}     → Staff dashboards (tables, orders)
  /ws/table/{qr_token}          → Waiting customers (table activation)

On connect, server pushes FULL current state immediately.
All mutations broadcast incremental updates — zero polling needed.
"""

from __future__ import annotations
import json, logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ws_manager import manager
from supabase_client import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)

# Import in-memory lock owners from orders module (lazy to avoid circular)
def _get_lock_owner(session_id: str) -> str | None:
    try:
        from routers.orders import _payment_lock_owners
        return _payment_lock_owners.get(session_id)
    except Exception:
        return None


# ── Shared helpers: build state payloads ───────────────────

def _get_cart_state(session_id: str) -> dict:
    """Full enriched cart for a session."""
    sb = get_supabase()
    cart = sb.table("carts").select("id, version").eq("session_id", session_id).execute()
    if not cart.data:
        return {"items": [], "version": 0, "total": 0}

    cart_id = cart.data[0]["id"]
    items = (
        sb.table("cart_items")
        .select("id, menu_item_id, quantity, added_by, notes, created_at")
        .eq("cart_id", cart_id)
        .order("created_at")
        .execute()
    )
    if not items.data:
        return {"items": [], "version": cart.data[0]["version"], "total": 0}

    menu_ids = list({i["menu_item_id"] for i in items.data})
    menu_rows = (
        sb.table("menu")
        .select("id, dish_name, price, category, image_link, variant_name")
        .in_("id", menu_ids)
        .execute()
    )
    menu_map = {m["id"]: m for m in (menu_rows.data or [])}

    enriched = []
    for item in items.data:
        m = menu_map.get(item["menu_item_id"])
        if m:
            enriched.append({
                **item,
                "dish_name": m["dish_name"],
                "price": m["price"],
                "category": m.get("category"),
                "image_link": m.get("image_link"),
                "variant_name": m.get("variant_name", "Regular"),
            })

    total = sum(i["price"] * i["quantity"] for i in enriched)
    return {"items": enriched, "version": cart.data[0]["version"], "total": total}


def _get_session_state(session_id: str) -> dict:
    """Session status, payment lock, ETA, latest order."""
    sb = get_supabase()
    session = sb.table("sessions").select("*").eq("id", session_id).execute()
    if not session.data:
        return {}
    s = session.data[0]
    order = (
        sb.table("orders")
        .select("id, status, total_amount, created_at")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    # Count participants
    participants = sb.table("participants").select("id", count="exact").eq("session_id", session_id).execute()
    participant_count = participants.count if participants.count else 1
    return {
        "session_status": s["status"],
        "payment_lock": s.get("payment_lock", False),
        "payment_locked_by": s.get("payment_locked_by") or _get_lock_owner(session_id),
        "chef_eta_minutes": s.get("chef_eta_minutes"),
        "chef_eta_set_at": s.get("chef_eta_set_at"),
        "order": order.data[0] if order.data else None,
        "participant_count": participant_count,
    }


def _get_staff_state(restaurant_id: int) -> dict:
    """Full tables + enriched orders for a restaurant."""
    sb = get_supabase()
    tables = (
        sb.table("restaurant_tables")
        .select("*")
        .eq("restaurant_id", restaurant_id)
        .order("number")
        .execute()
    )

    orders_raw = (
        sb.table("orders")
        .select("*")
        .eq("restaurant_id", restaurant_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )

    orders: list[dict] = []
    if orders_raw.data:
        order_ids = [o["id"] for o in orders_raw.data]
        session_ids = list({o["session_id"] for o in orders_raw.data})

        all_items = sb.table("order_items").select("*").in_("order_id", order_ids).execute()
        all_sessions = (
            sb.table("sessions")
            .select("id, chef_eta_minutes, chef_eta_set_at, status")
            .in_("id", session_ids)
            .execute()
        )

        items_by_order: dict[str, list] = {}
        menu_ids_needed: set[int] = set()
        for it in (all_items.data or []):
            items_by_order.setdefault(it["order_id"], []).append(it)
            menu_ids_needed.add(it["menu_item_id"])

        menu_map: dict[int, dict] = {}
        if menu_ids_needed:
            menu_rows = (
                sb.table("menu")
                .select("id, dish_name, category, variant_name")
                .in_("id", list(menu_ids_needed))
                .execute()
            )
            menu_map = {m["id"]: m for m in (menu_rows.data or [])}

        session_map = {s["id"]: s for s in (all_sessions.data or [])}

        for order in orders_raw.data:
            item_details = []
            for it in items_by_order.get(order["id"], []):
                m = menu_map.get(it["menu_item_id"])
                item_details.append({
                    **it,
                    "dish_name": m["dish_name"] if m else "Unknown",
                    "category": m.get("category") if m else None,
                    "variant_name": m.get("variant_name") if m else "Regular",
                })
            s = session_map.get(order["session_id"])
            orders.append({
                **order,
                "items": item_details,
                "chef_eta_minutes": s.get("chef_eta_minutes") if s else None,
                "chef_eta_set_at": s.get("chef_eta_set_at") if s else None,
                "session_status": s.get("status") if s else None,
            })

    return {"tables": tables.data or [], "orders": orders}


# ── Customer session WebSocket ─────────────────────────────

@router.websocket("/ws/{session_id}")
async def session_ws(websocket: WebSocket, session_id: str):
    """Customer WS — pushes cart/payment/ETA updates instantly."""
    await manager.connect(session_id, websocket)
    logger.info(f"[WS] Customer connected: session={session_id[:8]}")

    # Push full state immediately on connect (like WhatsApp message sync)
    try:
        cart = _get_cart_state(session_id)
        session = _get_session_state(session_id)
        await websocket.send_json({"type": "init", "cart": cart, "session": session})
    except Exception as e:
        logger.error(f"[WS] Init push failed {session_id[:8]}: {e}")

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg.get("type") == "sync":
                    # Client requests full re-sync (e.g. after wake from sleep)
                    cart = _get_cart_state(session_id)
                    session = _get_session_state(session_id)
                    await websocket.send_json({"type": "init", "cart": cart, "session": session})
            except json.JSONDecodeError:
                logger.warning(f"[WS] Bad JSON from {session_id[:8]}")
    except WebSocketDisconnect:
        logger.info(f"[WS] Customer disconnected: session={session_id[:8]}")
    except Exception as e:
        logger.error(f"[WS] Session error {session_id[:8]}: {e}")
    finally:
        manager.disconnect(session_id, websocket)


# ── Staff dashboard WebSocket ──────────────────────────────

@router.websocket("/ws/staff/{restaurant_id}")
async def staff_ws(websocket: WebSocket, restaurant_id: int):
    """Staff WS — pushes tables/orders updates instantly."""
    # Auth via query param (browser WS API doesn't support headers)
    token = websocket.query_params.get("token", "")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        from routers.staff import get_staff_from_token
        payload = await get_staff_from_token(f"Bearer {token}")
        if payload["restaurant_id"] != restaurant_id:
            await websocket.close(code=4003, reason="Wrong restaurant")
            return
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    channel = f"staff:{restaurant_id}"
    await manager.connect(channel, websocket)
    logger.info(f"[WS] Staff connected: restaurant={restaurant_id}, role={payload.get('role')}")

    # Push full state immediately on connect
    try:
        state = _get_staff_state(restaurant_id)
        await websocket.send_json({"type": "init", **state})
    except Exception as e:
        logger.error(f"[WS] Staff init push failed restaurant={restaurant_id}: {e}")

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg.get("type") == "sync":
                    state = _get_staff_state(restaurant_id)
                    await websocket.send_json({"type": "init", **state})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        logger.info(f"[WS] Staff disconnected: restaurant={restaurant_id}")
    except Exception as e:
        logger.error(f"[WS] Staff error restaurant={restaurant_id}: {e}")
    finally:
        manager.disconnect(channel, websocket)


# ── Waiting table WebSocket ────────────────────────────────

@router.websocket("/ws/table/{qr_token}")
async def table_ws(websocket: WebSocket, qr_token: str):
    """Waiting customer WS — notified instantly when table is activated."""
    channel = f"table:{qr_token}"
    await manager.connect(channel, websocket)
    logger.info(f"[WS] Customer waiting: qr={qr_token[:8]}")

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        logger.info(f"[WS] Waiting customer left: qr={qr_token[:8]}")
    except Exception as e:
        logger.error(f"[WS] Table WS error qr={qr_token[:8]}: {e}")
    finally:
        manager.disconnect(channel, websocket)