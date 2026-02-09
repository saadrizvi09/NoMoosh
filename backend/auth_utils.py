"""Helpers to extract / verify the Supabase JWT from incoming requests."""

from __future__ import annotations
from fastapi import Header, HTTPException
from supabase_client import get_supabase


async def get_current_user_id(authorization: str = Header(None)) -> str:
    """Require a valid Supabase access-token. Returns the Supabase user-id (UUID)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        sb = get_supabase()
        user_resp = sb.auth.get_user(token)
        if not user_resp or not user_resp.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_resp.user.id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {e}")


async def get_optional_user_id(authorization: str = Header(None)) -> str | None:
    """Same as above but returns *None* instead of 401 when token is absent/invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user_id(authorization)
    except Exception:
        return None
