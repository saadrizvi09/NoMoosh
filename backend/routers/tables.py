"""Table management — CRUD, QR scanning, activation/deactivation.

Endpoints:
  POST   /tables                          → Create table (owner)
  GET    /tables/restaurant/{id}          → List tables (staff)
  POST   /tables/{table_id}/activate      → Activate (waiter/owner)
  POST   /tables/{table_id}/deactivate    → Deactivate / reset (waiter/owner)
  DELETE /tables/{table_id}               → Delete (owner)
  GET    /tables/scan/{qr_token}          → Public QR scan endpoint
"""

from __future__ import annotations
import uuid
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from supabase_client import get_supabase
from routers.staff import get_staff_from_token
from ws_manager import manager as ws_manager

router = APIRouter(prefix="/tables", tags=["tables"])


# ── Models ──────────────────────────────────────────────────
class CreateTableRequest(BaseModel):
    restaurant_id: int
    number: str
    capacity: int = 4


# ── CRUD ────────────────────────────────────────────────────

@router.post("")
async def create_table(data: CreateTableRequest, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create tables")
    if payload["restaurant_id"] != data.restaurant_id:
        raise HTTPException(status_code=403, detail="Not your restaurant")

    sb = get_supabase()
    qr_token = str(uuid.uuid4())

    result = sb.table("restaurant_tables").insert({
        "restaurant_id": data.restaurant_id,
        "number": data.number,
        "capacity": data.capacity,
        "qr_token": qr_token,
        "status": "inactive",
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create table")

    # Broadcast to staff dashboards
    await ws_manager.broadcast(f"staff:{data.restaurant_id}", {
        "type": "table_created", "table": result.data[0],
    })

    return result.data[0]


@router.get("/restaurant/{restaurant_id}")
async def list_tables(restaurant_id: int, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["restaurant_id"] != restaurant_id:
        raise HTTPException(status_code=403, detail="Not your restaurant")

    sb = get_supabase()
    result = (
        sb.table("restaurant_tables")
        .select("*")
        .eq("restaurant_id", restaurant_id)
        .order("number")
        .execute()
    )
    return result.data or []


@router.delete("/{table_id}")
async def delete_table(table_id: str, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can delete tables")

    sb = get_supabase()
    table = sb.table("restaurant_tables").select("*").eq("id", table_id).execute()
    if not table.data:
        raise HTTPException(status_code=404, detail="Table not found")
    if table.data[0]["restaurant_id"] != payload["restaurant_id"]:
        raise HTTPException(status_code=403, detail="Not your restaurant")

    # Get all sessions for this table
    sessions = sb.table("sessions").select("id").eq("table_id", table_id).execute()
    session_ids = [s["id"] for s in sessions.data] if sessions.data else []
    
    if session_ids:
        # Get all carts for these sessions
        carts = sb.table("carts").select("id").in_("session_id", session_ids).execute()
        cart_ids = [c["id"] for c in carts.data] if carts.data else []
        
        # Get all orders for these sessions
        orders = sb.table("orders").select("id").in_("session_id", session_ids).execute()
        order_ids = [o["id"] for o in orders.data] if orders.data else []
        
        # Cascade delete in proper order:
        # 1. Delete cart_items
        if cart_ids:
            sb.table("cart_items").delete().in_("cart_id", cart_ids).execute()
        # 2. Delete order_items
        if order_ids:
            sb.table("order_items").delete().in_("order_id", order_ids).execute()
        # 3. Delete orders
        if order_ids:
            sb.table("orders").delete().in_("id", order_ids).execute()
        # 4. Delete carts
        if cart_ids:
            sb.table("carts").delete().in_("id", cart_ids).execute()
        # 5. Delete participants
        sb.table("participants").delete().in_("session_id", session_ids).execute()
        # 6. Delete sessions
        sb.table("sessions").delete().in_("id", session_ids).execute()
    
    # Finally delete the table
    sb.table("restaurant_tables").delete().eq("id", table_id).execute()

    # Broadcast to staff dashboards
    await ws_manager.broadcast(f"staff:{payload['restaurant_id']}", {
        "type": "table_deleted", "table_id": table_id,
    })

    return {"message": "Table deleted"}


# ── Activate / Deactivate ──────────────────────────────────

@router.post("/{table_id}/activate")
async def activate_table(table_id: str, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["role"] not in ("waiter", "owner"):
        raise HTTPException(status_code=403, detail="Only waiters/owners can activate tables")

    sb = get_supabase()
    table = sb.table("restaurant_tables").select("*").eq("id", table_id).execute()
    if not table.data:
        raise HTTPException(status_code=404, detail="Table not found")
    if table.data[0]["restaurant_id"] != payload["restaurant_id"]:
        raise HTTPException(status_code=403, detail="Not your restaurant")

    # Activate table
    sb.table("restaurant_tables").update({"status": "active"}).eq("id", table_id).execute()

    # Create a new session
    session_id = str(uuid.uuid4())
    sb.table("sessions").insert({
        "id": session_id,
        "table_id": table_id,
        "restaurant_id": payload["restaurant_id"],
        "status": "active",
    }).execute()

    # Create a cart for the session
    sb.table("carts").insert({"session_id": session_id}).execute()

    t = table.data[0]

    # Notify waiting customers via table WS channel
    await ws_manager.broadcast(f"table:{t['qr_token']}", {
        "type": "table_activated", "session_id": session_id,
    })

    # Notify staff dashboards
    await ws_manager.broadcast(f"staff:{payload['restaurant_id']}", {
        "type": "table_status", "table_id": table_id, "status": "active",
    })

    return {"message": "Table activated", "session_id": session_id}


@router.post("/{table_id}/deactivate")
async def deactivate_table(table_id: str, authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    if payload["role"] not in ("waiter", "owner"):
        raise HTTPException(status_code=403, detail="Only waiters/owners can deactivate tables")

    sb = get_supabase()
    table = sb.table("restaurant_tables").select("*").eq("id", table_id).execute()
    if not table.data:
        raise HTTPException(status_code=404, detail="Table not found")
    if table.data[0]["restaurant_id"] != payload["restaurant_id"]:
        raise HTTPException(status_code=403, detail="Not your restaurant")

    # Deactivate
    sb.table("restaurant_tables").update({"status": "inactive"}).eq("id", table_id).execute()

    # Expire any active sessions for this table
    sb.table("sessions").update({"status": "expired"}).eq("table_id", table_id).eq("status", "active").execute()

    # Notify staff dashboards
    await ws_manager.broadcast(f"staff:{payload['restaurant_id']}", {
        "type": "table_status", "table_id": table_id, "status": "inactive",
    })

    return {"message": "Table deactivated"}


# ── Public QR endpoint ──────────────────────────────────────

@router.get("/scan/{qr_token}")
async def scan_table(qr_token: str):
    """Called when a customer scans the QR code on a table. No auth required."""
    sb = get_supabase()

    table = sb.table("restaurant_tables").select("*").eq("qr_token", qr_token).execute()
    if not table.data:
        raise HTTPException(status_code=404, detail="Invalid QR code")

    t = table.data[0]
    restaurant_id = t["restaurant_id"]

    # Restaurant info
    rest = sb.table("restaurants").select("name, description").eq("id", restaurant_id).execute()
    rest_info = rest.data[0] if rest.data else {"name": "Unknown", "description": ""}

    if t.get("status") != "active":
        return {
            "status": "inactive",
            "table_number": t["number"],
            "restaurant_name": rest_info["name"],
            "message": "Welcome! Waiting for activation...",
        }

    # Get active session
    session = (
        sb.table("sessions")
        .select("*")
        .eq("table_id", t["id"])
        .eq("status", "active")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    session_data = session.data[0] if session.data else None

    # Get restaurant menu
    menu = (
        sb.table("menu")
        .select("*")
        .eq("restaurant_id", restaurant_id)
        .eq("availability", True)
        .order("category")
        .execute()
    )

    return {
        "status": "active",
        "table_id": t["id"],
        "table_number": t["number"],
        "restaurant_id": restaurant_id,
        "restaurant_name": rest_info["name"],
        "restaurant_description": rest_info.get("description", ""),
        "session_id": session_data["id"] if session_data else None,
        "payment_lock": session_data.get("payment_lock", False) if session_data else False,
        "chef_eta_minutes": session_data.get("chef_eta_minutes") if session_data else None,
        "chef_eta_set_at": session_data.get("chef_eta_set_at") if session_data else None,
        "menu": menu.data or [],
    }
