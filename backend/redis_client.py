"""Redis-backed cart state machine.

Uses Redis Hash Maps for O(1) atomic cart operations.
HINCRBY ensures perfect concurrency — no race conditions.

Keys:
  cart:{session_id}       → Hash  { "item_id": quantity, ... }
  cart:{session_id}:ver   → String  auto-incrementing version

All keys auto-expire after 4 hours (14400s) for cleanup.
"""

from __future__ import annotations
import logging
import redis.asyncio as aioredis
from config import REDIS_URL

logger = logging.getLogger(__name__)

_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        if not REDIS_URL:
            raise RuntimeError(
                "REDIS_URL must be set in .env  "
                "→ Get free Redis at https://upstash.com"
            )
        _pool = aioredis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
        )
    return _pool


# ── Atomic Cart Operations ────────────────────────────────

_CART_TTL = 14400  # 4 hours


async def cart_incr(session_id: str, item_id: int, delta: int = 1) -> int:
    """Atomically increment item quantity via HINCRBY.
    If result ≤ 0, removes the field. Returns new quantity."""
    r = await get_redis()
    key = f"cart:{session_id}"
    new_qty = await r.hincrby(key, str(item_id), delta)
    if new_qty <= 0:
        await r.hdel(key, str(item_id))
        new_qty = 0
    await r.expire(key, _CART_TTL)
    return new_qty


async def cart_set_qty(session_id: str, item_id: int, quantity: int):
    """Set exact quantity for an item (for explicit qty changes)."""
    r = await get_redis()
    key = f"cart:{session_id}"
    if quantity <= 0:
        await r.hdel(key, str(item_id))
    else:
        await r.hset(key, str(item_id), quantity)
        await r.expire(key, _CART_TTL)


async def cart_remove_item(session_id: str, item_id: int):
    """Remove item entirely from cart."""
    r = await get_redis()
    await r.hdel(f"cart:{session_id}", str(item_id))


async def cart_get_all(session_id: str) -> dict[int, int]:
    """HGETALL — returns {item_id: quantity} for all items."""
    r = await get_redis()
    raw = await r.hgetall(f"cart:{session_id}")
    return {int(k): int(v) for k, v in raw.items() if int(v) > 0}


async def cart_bump_version(session_id: str) -> int:
    """Atomically increment and return cart version."""
    r = await get_redis()
    ver_key = f"cart:{session_id}:ver"
    ver = await r.incr(ver_key)
    await r.expire(ver_key, _CART_TTL)
    return ver


async def cart_get_version(session_id: str) -> int:
    """Get current cart version without bumping."""
    r = await get_redis()
    val = await r.get(f"cart:{session_id}:ver")
    return int(val) if val else 0


async def cart_clear(session_id: str):
    """Delete cart and version (after order confirmed)."""
    r = await get_redis()
    await r.delete(f"cart:{session_id}", f"cart:{session_id}:ver")
