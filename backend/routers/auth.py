"""Auth router — create_user endpoint.

The actual email-OTP / Google-OAuth flows happen client-side via @supabase/supabase-js.
This endpoint is called *after* the user has already authenticated with Supabase to
create (or retrieve) an application-level profile row in the `accounts` table.
"""

from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase_client import get_supabase

router = APIRouter(tags=["auth"])


# ── Request / Response models ──────────────────────────────
class CreateUserRequest(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    supabase_uid: str | None = None


class CreateUserResponse(BaseModel):
    user_id: str
    message: str = "ok"


# ── Endpoint ──────────────────────────────────────────────
@router.post("/create_user", response_model=CreateUserResponse)
async def create_user(req: CreateUserRequest):
    """Create or return an existing account row."""
    sb = get_supabase()

    # 1. Look-up by Supabase UID first (most reliable after OAuth)
    if req.supabase_uid:
        existing = (
            sb.table("accounts")
            .select("id")
            .eq("supabase_uid", req.supabase_uid)
            .execute()
        )
        if existing.data:
            return CreateUserResponse(user_id=str(existing.data[0]["id"]))

    # 2. Fallback: look-up by email
    if req.email:
        existing = (
            sb.table("accounts")
            .select("id")
            .eq("email", req.email)
            .execute()
        )
        if existing.data:
            # Patch supabase_uid if it was missing
            if req.supabase_uid:
                sb.table("accounts").update({"supabase_uid": req.supabase_uid}).eq(
                    "id", existing.data[0]["id"]
                ).execute()
            return CreateUserResponse(user_id=str(existing.data[0]["id"]))

    # 3. Fallback: look-up by phone
    if req.phone:
        existing = (
            sb.table("accounts")
            .select("id")
            .eq("mob_number", req.phone)
            .execute()
        )
        if existing.data:
            if req.supabase_uid:
                sb.table("accounts").update({"supabase_uid": req.supabase_uid}).eq(
                    "id", existing.data[0]["id"]
                ).execute()
            return CreateUserResponse(user_id=str(existing.data[0]["id"]))

    # 4. No match → create
    insert_data: dict = {"name": req.name[:25]}
    if req.email:
        insert_data["email"] = req.email
    if req.phone:
        insert_data["mob_number"] = req.phone
    if req.supabase_uid:
        insert_data["supabase_uid"] = req.supabase_uid

    result = sb.table("accounts").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create account")

    return CreateUserResponse(user_id=str(result.data[0]["id"]))
