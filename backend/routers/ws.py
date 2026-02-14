"""WebSocket endpoints — Redis-backed cart state machine.

Three channels:
  /ws/{session_id}              → Customer session (cart via Redis, payment, ETA)
  /ws/staff/{restaurant_id}     → Staff dashboards (tables, orders)
  /ws/table/{qr_token}          → Waiting customers (table activation)

Cart mutations flow through WebSocket → Redis HINCRBY (atomic) → broadcast.
On connect, server pushes FULL current state from Redis immediately.
"""

from __future__ import annotations
import asyncio, json, logging, time as _time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ws_manager import manager
from supabase_client import get_supabase
from redis_client import (
    cart_incr, cart_set_qty, cart_remove_item,
    cart_get_all, cart_bump_version, cart_get_version, cart_clear,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Menu cache (shared enrichment) ─────────────────────────

_menu_cache: dict[int, dict] = {}
_MENU_CACHE_TTL = 120


def _get_menu_map(sb, restaurant_id: int) -> dict[int, dict]:
    """Menu items indexed by id, cached in-memory for 120s."""
    cached = _menu_cache.get(restaurant_id)
    if cached and (_time.time() - cached["ts"]) < _MENU_CACHE_TTL:
        return cached["data"]
    rows = (
        sb.table("menu")
        .select("id, dish_name, price, category, image_link, variant_name")
        .eq("restaurant_id", restaurant_id)
        .execute()
    )
    menu_map = {m["id"]: m for m in (rows.data or [])}
    _menu_cache[restaurant_id] = {"data": menu_map, "ts": _time.time()}
    return menu_map


def invalidate_menu_cache(restaurant_id: int):
    _menu_cache.pop(restaurant_id, None)


# ── Cart enrichment from Redis ─────────────────────────────

async def get_enriched_cart(session_id: str, restaurant_id: int) -> dict:
    """Read cart from Redis, enrich with cached menu data."""
    raw = await cart_get_all(session_id)
    ver = await cart_get_version(session_id)

    if not raw:
        return {"items": [], "total": 0, "version": ver}

    sb = get_supabase()
    menu_map = _get_menu_map(sb, restaurant_id)

    items = []
    total = 0
    for item_id, qty in raw.items():
        m = menu_map.get(item_id, {})
        price = m.get("price", 0)
        items.append({
            "menu_item_id": item_id,
            "quantity": qty,
            "dish_name": m.get("dish_name", "Unknown"),
            "price": price,
            "category": m.get("category"),
            "image_link": m.get("image_link"),
            "variant_name": m.get("variant_name", "Regular"),
        })
        total += price * qty

    return {"items": items, "total": total, "version": ver}


# ── Helpers: build state payloads ──────────────────────────

# Import in-memory lock owners from orders module (lazy to avoid circular)
def _get_lock_owner(session_id: str) -> str | None:
    try:
        from routers.orders import _payment_lock_owners
        return _payment_lock_owners.get(session_id)
    except Exception:
        return None


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
    """Customer WS — cart mutations go through here → Redis → broadcast."""
    await manager.connect(session_id, websocket)
    logger.info(f"[WS] Customer connected: session={session_id[:8]}, total connections: {manager.count(session_id)}")

    # Always get sb outside try so it's defined for cart handlers
    sb = get_supabase()

    # Resolve restaurant_id for menu enrichment
    restaurant_id: int | None = None
    try:
        sess = sb.table("sessions").select("restaurant_id").eq("id", session_id).execute()
        if sess.data:
            restaurant_id = sess.data[0]["restaurant_id"]
            logger.info(f"[WS] Resolved restaurant_id={restaurant_id} for session={session_id[:8]}")
        else:
            logger.error(f"[WS] Session {session_id[:8]} not found in DB")
    except Exception as e:
        logger.error(f"[WS] Failed to load restaurant_id for session {session_id[:8]}: {e}")

    # Push full state immediately on connect
    try:
        if restaurant_id:
            cart_state = await get_enriched_cart(session_id, restaurant_id)
        else:
            cart_state = {"items": [], "total": 0, "version": 0}
        session_state = _get_session_state(session_id)
        await websocket.send_json({"type": "init", "cart": cart_state, "session": session_state})
    except Exception as e:
        logger.error(f"[WS] Init push failed {session_id[:8]}: {e}")

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type", "")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "sync":
                    if restaurant_id:
                        cart_state = await get_enriched_cart(session_id, restaurant_id)
                    else:
                        cart_state = {"items": [], "total": 0, "version": 0}
                    session_state = _get_session_state(session_id)
                    await websocket.send_json({"type": "init", "cart": cart_state, "session": session_state})

                # ── Cart mutations via Redis (atomic) ─────
                elif msg_type == "cart_add":
                    if not restaurant_id:
                        await websocket.send_json({"type": "error", "message": "Session error"})
                        continue

                    item_id = int(msg["item_id"])
                    delta = int(msg.get("delta", 1))
                    await cart_incr(session_id, item_id, delta)
                    await cart_bump_version(session_id)
                    enriched = await get_enriched_cart(session_id, restaurant_id)
                    asyncio.create_task(
                        manager.broadcast(session_id, {"type": "cart_update", "cart": enriched})
                    )
                    logger.info(f"[WS] cart_add item={item_id} session={session_id[:8]} → broadcast to {manager.count(session_id)} users")

                elif msg_type == "cart_remove":
                    if not restaurant_id:
                        await websocket.send_json({"type": "error", "message": "Session error"})
                        continue

                    item_id = int(msg["item_id"])
                    await cart_remove_item(session_id, item_id)
                    await cart_bump_version(session_id)
                    enriched = await get_enriched_cart(session_id, restaurant_id)
                    asyncio.create_task(
                        manager.broadcast(session_id, {"type": "cart_update", "cart": enriched})
                    )
                    logger.info(f"[WS] cart_remove item={item_id} session={session_id[:8]} → broadcast to {manager.count(session_id)} users")

                elif msg_type == "cart_set_qty":
                    if not restaurant_id:
                        await websocket.send_json({"type": "error", "message": "Session error"})
                        continue

                    item_id = int(msg["item_id"])
                    qty = int(msg["quantity"])
                    if qty <= 0:
                        await cart_remove_item(session_id, item_id)
                    else:
                        await cart_set_qty(session_id, item_id, qty)
                    await cart_bump_version(session_id)
                    enriched = await get_enriched_cart(session_id, restaurant_id)
                    asyncio.create_task(
                        manager.broadcast(session_id, {"type": "cart_update", "cart": enriched})
                    )
                    logger.info(f"[WS] cart_set_qty item={item_id} qty={qty} session={session_id[:8]} → broadcast to {manager.count(session_id)} users")

            except json.JSONDecodeError:
                logger.warning(f"[WS] Bad JSON from {session_id[:8]}")
            except Exception as e:
                logger.error(f"[WS] Message handler error session={session_id[:8]}: {e}", exc_info=True)
    except WebSocketDisconnect:
        logger.info(f"[WS] Customer disconnected: session={session_id[:8]}, remaining: {manager.count(session_id) - 1}")
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