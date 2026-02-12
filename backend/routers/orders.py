"""Order / Cart / Payment / Chef / Menu-management endpoints.

Endpoints:
  POST /cart/add                          → Add item to shared cart
  POST /cart/remove                       → Remove cart item
  GET  /cart/{session_id}                 → Get enriched cart
  POST /sessions/join/{qr_token}          → Join table session (guest)
  GET  /sessions/{session_id}/status      → Session status (lock, ETA)
  POST /payment/lock                      → Lock cart for payment
  POST /payment/confirm                   → Confirm payment → create order
  GET  /orders/restaurant/{restaurant_id} → Chef: all orders
  POST /orders/{order_id}/eta             → Chef: set ETA
  POST /menu/create                       → Owner: add dish
  PUT  /menu/{item_id}                    → Owner: edit dish
  DELETE /menu/{item_id}                  → Owner: delete dish
  GET  /menu/restaurant/{restaurant_id}   → Staff: full menu
"""

from __future__ import annotations
import uuid, asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from supabase_client import get_supabase
from routers.staff import get_staff_from_token
from ws_manager import manager as ws_manager

router = APIRouter(tags=["orders"])

# In-memory payment auto-unlock timers
_payment_timers: dict[str, asyncio.Task] = {}


# ═══════════════════════════════════════════════════════════
# MODELS
# ═══════════════════════════════════════════════════════════

class AddToCartRequest(BaseModel):
    session_id: str
    menu_item_id: int
    quantity: int = 1
    participant_id: str | None = None
    notes: str = ""


class RemoveFromCartRequest(BaseModel):
    session_id: str
    cart_item_id: str


class UpdateCartQtyRequest(BaseModel):
    session_id: str
    cart_item_id: str
    quantity: int


class PaymentLockRequest(BaseModel):
    session_id: str
    participant_id: str


class PaymentConfirmRequest(BaseModel):
    session_id: str
    participant_id: str | None = None
    method: str = "upi"


class ChefETARequest(BaseModel):
    minutes: int


class MenuItemCreate(BaseModel):
    restaurant_id: int
    dish_name: str
    price: int = 0
    category: str = ""
    description: str = ""
    category_veg: bool | None = None
    variant_name: str = "Regular"
    availability: bool = True


class MenuItemUpdate(BaseModel):
    dish_name: str | None = None
    price: int | None = None
    category: str | None = None
    description: str | None = None
    availability: bool | None = None
    variant_name: str | None = None
    category_veg: bool | None = None


# ═══════════════════════════════════════════════════════════
# CART
# ═══════════════════════════════════════════════════════════

def _enrich_cart(sb, session_id: str) -> dict:
    """Return enriched cart data for a session (single batch query)."""
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

    # Batch-fetch all menu items at once instead of N queries
    menu_ids = list({i["menu_item_id"] for i in items.data})
    menu_rows = sb.table("menu").select("id, dish_name, price, category, image_link, variant_name").in_("id", menu_ids).execute()
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


@router.post("/cart/add")
async def add_to_cart(data: AddToCartRequest):
    sb = get_supabase()

    # Check payment lock
    session = sb.table("sessions").select("payment_lock").eq("id", data.session_id).execute()
    if session.data and session.data[0].get("payment_lock"):
        raise HTTPException(status_code=423, detail="Cart is locked — payment in progress")

    cart = sb.table("carts").select("id, version").eq("session_id", data.session_id).execute()
    if not cart.data:
        raise HTTPException(status_code=404, detail="Cart not found for this session")

    cart_id = cart.data[0]["id"]

    # Upsert: if same item already in cart, bump quantity
    existing = (
        sb.table("cart_items")
        .select("id, quantity")
        .eq("cart_id", cart_id)
        .eq("menu_item_id", data.menu_item_id)
        .execute()
    )
    if existing.data:
        new_qty = existing.data[0]["quantity"] + data.quantity
        sb.table("cart_items").update({"quantity": new_qty}).eq("id", existing.data[0]["id"]).execute()
    else:
        sb.table("cart_items").insert({
            "cart_id": cart_id,
            "menu_item_id": data.menu_item_id,
            "quantity": data.quantity,
            "added_by": data.participant_id,
            "notes": data.notes,
        }).execute()

    # Bump version
    new_ver = cart.data[0]["version"] + 1
    sb.table("carts").update({"version": new_ver, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", cart_id).execute()

    result = _enrich_cart(sb, data.session_id)

    # Broadcast via WebSocket
    await ws_manager.broadcast(data.session_id, {"type": "cart_update", "cart": result})

    return result


@router.post("/cart/remove")
async def remove_from_cart(data: RemoveFromCartRequest):
    sb = get_supabase()
    session = sb.table("sessions").select("payment_lock").eq("id", data.session_id).execute()
    if session.data and session.data[0].get("payment_lock"):
        raise HTTPException(status_code=423, detail="Cart is locked — payment in progress")

    sb.table("cart_items").delete().eq("id", data.cart_item_id).execute()
    result = _enrich_cart(sb, data.session_id)
    await ws_manager.broadcast(data.session_id, {"type": "cart_update", "cart": result})
    return result


@router.post("/cart/update-quantity")
async def update_cart_quantity(data: UpdateCartQtyRequest):
    sb = get_supabase()
    session = sb.table("sessions").select("payment_lock").eq("id", data.session_id).execute()
    if session.data and session.data[0].get("payment_lock"):
        raise HTTPException(status_code=423, detail="Cart is locked — payment in progress")

    if data.quantity <= 0:
        sb.table("cart_items").delete().eq("id", data.cart_item_id).execute()
    else:
        sb.table("cart_items").update({"quantity": data.quantity}).eq("id", data.cart_item_id).execute()

    result = _enrich_cart(sb, data.session_id)
    await ws_manager.broadcast(data.session_id, {"type": "cart_update", "cart": result})
    return result


@router.get("/cart/{session_id}")
async def get_cart(session_id: str):
    sb = get_supabase()
    return _enrich_cart(sb, session_id)


# ═══════════════════════════════════════════════════════════
# SESSION JOIN (customer scans QR)
# ═══════════════════════════════════════════════════════════

@router.post("/sessions/join/{qr_token}")
async def join_session(qr_token: str):
    sb = get_supabase()

    table = sb.table("restaurant_tables").select("*").eq("qr_token", qr_token).execute()
    if not table.data:
        raise HTTPException(status_code=404, detail="Invalid QR code")

    t = table.data[0]
    if t.get("status") != "active":
        raise HTTPException(status_code=400, detail="Table is not active yet")

    # Find the active session
    session = (
        sb.table("sessions")
        .select("*")
        .eq("table_id", t["id"])
        .eq("status", "active")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not session.data:
        raise HTTPException(status_code=404, detail="No active session for this table")

    session_id = session.data[0]["id"]

    # Create a participant
    participant_id = str(uuid.uuid4())
    sb.table("participants").insert({
        "id": participant_id,
        "session_id": session_id,
    }).execute()

    return {
        "session_id": session_id,
        "participant_id": participant_id,
        "table_number": t["number"],
        "restaurant_id": t["restaurant_id"],
    }


# ═══════════════════════════════════════════════════════════
# SESSION STATUS (polled by customer)
# ═══════════════════════════════════════════════════════════

@router.get("/sessions/{session_id}/status")
async def get_session_status(session_id: str):
    sb = get_supabase()
    session = sb.table("sessions").select("*").eq("id", session_id).execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    s = session.data[0]
    order = (
        sb.table("orders")
        .select("id, status, total_amount, created_at")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    return {
        "session_status": s["status"],
        "payment_lock": s.get("payment_lock", False),
        "payment_lock_at": s.get("payment_lock_at"),
        "chef_eta_minutes": s.get("chef_eta_minutes"),
        "chef_eta_set_at": s.get("chef_eta_set_at"),
        "order": order.data[0] if order.data else None,
    }


# ═══════════════════════════════════════════════════════════
# PAYMENT
# ═══════════════════════════════════════════════════════════

@router.post("/payment/lock")
async def lock_payment(data: PaymentLockRequest):
    sb = get_supabase()
    session = sb.table("sessions").select("*").eq("id", data.session_id).execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.data[0].get("payment_lock"):
        raise HTTPException(status_code=423, detail="Payment already locked")

    now = datetime.now(timezone.utc).isoformat()
    sb.table("sessions").update({
        "payment_lock": True,
        "payment_lock_at": now,
    }).eq("id", data.session_id).execute()

    # Broadcast lock
    await ws_manager.broadcast(data.session_id, {
        "type": "payment_locked",
        "locked_by": data.participant_id,
        "locked_at": now,
    })

    # Auto-unlock after 2 minutes
    async def auto_unlock():
        await asyncio.sleep(120)
        sb2 = get_supabase()
        s = sb2.table("sessions").select("payment_lock, status").eq("id", data.session_id).execute()
        if s.data and s.data[0].get("payment_lock") and s.data[0]["status"] == "active":
            sb2.table("sessions").update({"payment_lock": False, "payment_lock_at": None}).eq("id", data.session_id).execute()
            await ws_manager.broadcast(data.session_id, {"type": "payment_unlocked"})

    if data.session_id in _payment_timers:
        _payment_timers[data.session_id].cancel()
    _payment_timers[data.session_id] = asyncio.create_task(auto_unlock())

    return {"message": "Cart locked for payment", "timeout_seconds": 120}


@router.post("/payment/confirm")
async def confirm_payment(data: PaymentConfirmRequest):
    sb = get_supabase()

    session = sb.table("sessions").select("*").eq("id", data.session_id).execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")
    s = session.data[0]

    # Get cart
    cart = sb.table("carts").select("id").eq("session_id", data.session_id).execute()
    if not cart.data:
        raise HTTPException(status_code=404, detail="Cart not found")

    cart_items = sb.table("cart_items").select("*").eq("cart_id", cart.data[0]["id"]).execute()
    if not cart_items.data:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # Batch-fetch all menu prices at once
    menu_ids = list({ci["menu_item_id"] for ci in cart_items.data})
    menu_rows = sb.table("menu").select("id, price").in_("id", menu_ids).execute()
    price_map = {m["id"]: m["price"] for m in (menu_rows.data or [])}

    total = 0
    order_items_data = []
    for ci in cart_items.data:
        price = price_map.get(ci["menu_item_id"], 0)
        total += price * ci["quantity"]
        order_items_data.append({
            "menu_item_id": ci["menu_item_id"],
            "quantity": ci["quantity"],
            "price_at_time": price,
        })

    # Table number
    table = sb.table("restaurant_tables").select("number").eq("id", s["table_id"]).execute()
    table_number = table.data[0]["number"] if table.data else "?"

    # Create order
    order_id = str(uuid.uuid4())
    sb.table("orders").insert({
        "id": order_id,
        "session_id": data.session_id,
        "total_amount": total,
        "status": "paid",
        "table_number": table_number,
        "restaurant_id": s["restaurant_id"],
    }).execute()

    for oi in order_items_data:
        sb.table("order_items").insert({"order_id": order_id, **oi}).execute()

    # Payment record
    sb.table("payments").insert({
        "order_id": order_id,
        "participant_id": data.participant_id,
        "amount": total,
        "method": data.method,
        "status": "success",
    }).execute()

    # Complete session
    sb.table("sessions").update({
        "status": "completed",
        "payment_lock": False,
    }).eq("id", data.session_id).execute()

    # Table → dirty
    sb.table("restaurant_tables").update({"status": "dirty"}).eq("id", s["table_id"]).execute()

    # Cancel timer
    if data.session_id in _payment_timers:
        _payment_timers[data.session_id].cancel()
        del _payment_timers[data.session_id]

    # Broadcast
    await ws_manager.broadcast(data.session_id, {
        "type": "order_confirmed",
        "order_id": order_id,
        "total": total,
    })

    return {"message": "Payment confirmed", "order_id": order_id, "total": total}


# ═══════════════════════════════════════════════════════════
# CHEF — orders & ETA
# ═══════════════════════════════════════════════════════════

@router.get("/orders/restaurant/{restaurant_id}")
async def get_restaurant_orders(restaurant_id: int, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["restaurant_id"] != restaurant_id:
        raise HTTPException(status_code=403, detail="Not your restaurant")

    sb = get_supabase()
    orders = (
        sb.table("orders")
        .select("*")
        .eq("restaurant_id", restaurant_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )

    if not orders.data:
        return []

    # Batch-fetch all order_items, sessions, and menu items in bulk
    order_ids = [o["id"] for o in orders.data]
    session_ids = list({o["session_id"] for o in orders.data})

    all_items = sb.table("order_items").select("*").in_("order_id", order_ids).execute()
    all_sessions = sb.table("sessions").select("id, chef_eta_minutes, chef_eta_set_at, status").in_("id", session_ids).execute()

    # Build lookup maps
    items_by_order: dict[str, list] = {}
    menu_ids_needed: set[int] = set()
    for it in (all_items.data or []):
        items_by_order.setdefault(it["order_id"], []).append(it)
        menu_ids_needed.add(it["menu_item_id"])

    menu_rows = sb.table("menu").select("id, dish_name, category, variant_name").in_("id", list(menu_ids_needed)).execute() if menu_ids_needed else type("R", (), {"data": []})()
    menu_map = {m["id"]: m for m in (menu_rows.data or [])}
    session_map = {s["id"]: s for s in (all_sessions.data or [])}

    enriched = []
    for order in orders.data:
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
        enriched.append({
            **order,
            "items": item_details,
            "chef_eta_minutes": s.get("chef_eta_minutes") if s else None,
            "chef_eta_set_at": s.get("chef_eta_set_at") if s else None,
            "session_status": s.get("status") if s else None,
        })

    return enriched


@router.post("/orders/{order_id}/eta")
async def set_chef_eta(order_id: str, data: ChefETARequest, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["role"] not in ("chef", "owner"):
        raise HTTPException(status_code=403, detail="Only chefs/owners can set ETA")

    sb = get_supabase()
    order = sb.table("orders").select("session_id").eq("id", order_id).execute()
    if not order.data:
        raise HTTPException(status_code=404, detail="Order not found")

    session_id = order.data[0]["session_id"]
    now = datetime.now(timezone.utc).isoformat()

    sb.table("sessions").update({
        "chef_eta_minutes": data.minutes,
        "chef_eta_set_at": now,
    }).eq("id", session_id).execute()

    # Broadcast ETA to customers at the table
    await ws_manager.broadcast(session_id, {
        "type": "chef_eta",
        "minutes": data.minutes,
        "set_at": now,
    })

    return {"message": f"ETA set to {data.minutes} minutes", "session_id": session_id}


# ═══════════════════════════════════════════════════════════
# OWNER — Menu management
# ═══════════════════════════════════════════════════════════

@router.get("/menu/restaurant/{restaurant_id}")
async def get_restaurant_menu(restaurant_id: int, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["restaurant_id"] != restaurant_id:
        raise HTTPException(status_code=403, detail="Not your restaurant")

    sb = get_supabase()
    result = sb.table("menu").select("*").eq("restaurant_id", restaurant_id).order("category").execute()
    return result.data or []


@router.post("/menu/create")
async def create_menu_item(data: MenuItemCreate, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can add menu items")
    if payload["restaurant_id"] != data.restaurant_id:
        raise HTTPException(status_code=403, detail="Not your restaurant")

    sb = get_supabase()
    result = sb.table("menu").insert({
        "restaurant_id": data.restaurant_id,
        "dish_name": data.dish_name,
        "price": data.price,
        "category": data.category,
        "description": data.description,
        "category_veg": data.category_veg,
        "variant_name": data.variant_name,
        "availability": data.availability,
    }).execute()

    return result.data[0] if result.data else {"message": "Created"}


@router.put("/menu/{item_id}")
async def update_menu_item(item_id: int, data: MenuItemUpdate, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can edit menu")

    sb = get_supabase()
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")

    sb.table("menu").update(update_data).eq("id", item_id).execute()
    return {"message": "Updated"}


@router.delete("/menu/{item_id}")
async def delete_menu_item(item_id: int, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can delete items")

    sb = get_supabase()
    sb.table("menu").delete().eq("id", item_id).execute()
    return {"message": "Deleted"}
