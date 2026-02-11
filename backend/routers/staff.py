"""Staff authentication — signup, login, profile.

Endpoints:
  POST /staff/signup  → Create staff account (owner/chef/waiter)
  POST /staff/login   → Login, return JWT
  GET  /staff/me      → Current staff profile
"""

from __future__ import annotations
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
import jwt
from passlib.hash import bcrypt

from config import JWT_SECRET
from supabase_client import get_supabase

router = APIRouter(prefix="/staff", tags=["staff"])


# ── Models ──────────────────────────────────────────────────
class StaffSignup(BaseModel):
    restaurant_id: int
    email: str
    password: str
    name: str
    role: str  # owner | chef | waiter


class StaffLogin(BaseModel):
    email: str
    password: str
    restaurant_id: int


class StaffResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    restaurant_id: int
    token: str


# ── Token helpers ───────────────────────────────────────────
def create_token(staff_id: str, restaurant_id: int, role: str) -> str:
    payload = {
        "sub": staff_id,
        "restaurant_id": restaurant_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_staff_from_token(authorization: str = Header(None)) -> dict:
    """Extract and verify staff JWT from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization header")
    token = authorization.split(" ", 1)[1]
    return verify_token(token)


# ── Endpoints ───────────────────────────────────────────────

@router.post("/signup", response_model=StaffResponse)
async def signup(data: StaffSignup):
    sb = get_supabase()

    # Verify restaurant exists
    rest = sb.table("restaurants").select("id").eq("id", data.restaurant_id).execute()
    if not rest.data:
        raise HTTPException(status_code=404, detail="Restaurant not found. Complete restaurant registration first.")

    # Check for duplicate
    existing = (
        sb.table("staff")
        .select("id")
        .eq("restaurant_id", data.restaurant_id)
        .eq("email", data.email)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Staff member with this email already exists")

    if data.role not in ("owner", "chef", "waiter"):
        raise HTTPException(status_code=400, detail="Role must be owner, chef, or waiter")

    password_hash = bcrypt.hash(data.password)
    staff_id = str(uuid.uuid4())

    sb.table("staff").insert({
        "id": staff_id,
        "restaurant_id": data.restaurant_id,
        "email": data.email,
        "password_hash": password_hash,
        "name": data.name,
        "role": data.role,
    }).execute()

    token = create_token(staff_id, data.restaurant_id, data.role)

    return StaffResponse(
        id=staff_id, name=data.name, email=data.email,
        role=data.role, restaurant_id=data.restaurant_id, token=token,
    )


@router.post("/login", response_model=StaffResponse)
async def login(data: StaffLogin):
    sb = get_supabase()

    result = (
        sb.table("staff")
        .select("*")
        .eq("restaurant_id", data.restaurant_id)
        .eq("email", data.email)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    staff = result.data[0]

    if not bcrypt.verify(data.password, staff["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(staff["id"], staff["restaurant_id"], staff["role"])

    return StaffResponse(
        id=staff["id"], name=staff["name"], email=staff["email"],
        role=staff["role"], restaurant_id=staff["restaurant_id"], token=token,
    )


@router.get("/me")
async def get_me(authorization: str = Header(None)):
    payload = await get_staff_from_token(authorization)
    sb = get_supabase()

    staff = sb.table("staff").select("*").eq("id", payload["sub"]).execute()
    if not staff.data:
        raise HTTPException(status_code=404, detail="Staff not found")

    s = staff.data[0]
    rest = sb.table("restaurants").select("name").eq("id", s["restaurant_id"]).execute()

    return {
        "id": s["id"],
        "name": s["name"],
        "email": s["email"],
        "role": s["role"],
        "restaurant_id": s["restaurant_id"],
        "restaurant_name": rest.data[0]["name"] if rest.data else "Unknown",
    }
