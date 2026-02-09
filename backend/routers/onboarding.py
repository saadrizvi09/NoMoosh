"""Onboarding router — multi-step restaurant registration.

Endpoints:
  POST /register-restaurant_pg1   → save restaurant details & location (step 1)
  POST /save-cuisines-and-times   → save cuisines + operating hours   (step 3)
  POST /save-documents            → save bank/PAN + finalise          (step 4)
"""

from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase_client import get_supabase

router = APIRouter(tags=["onboarding"])


# ═══════════════════════════════════════════════════════════
# MODELS
# ═══════════════════════════════════════════════════════════

class RestaurantPg1(BaseModel):
    usr_id: str | None = None
    rest_name: str
    rest_phone: str = ""
    rest_intro: str = ""
    ownr_name: str
    ownr_email: str
    ownr_mobile: str
    strret: str = ""
    localty: str = ""
    cty: str = ""
    pincde: str = ""
    landmrk: str = ""
    latitude: str | None = None
    longitude: str | None = None


class Slot(BaseModel):
    open: str
    close: str


class CuisineTimesRequest(BaseModel):
    restaurant_id: str | None = None
    cuisines: list[str] = []
    open_days: dict[str, bool] = {}
    timings: dict[str, list[Slot]] = {}


class DocumentsPayload(BaseModel):
    pan: str = ""
    account_holder: str = ""
    account_number: str = ""
    ifsc: str = ""


class SaveDocumentsRequest(BaseModel):
    restaurantId: str | None = None
    documents: DocumentsPayload


# ═══════════════════════════════════════════════════════════
# STEP 1 — Restaurant details & location
# ═══════════════════════════════════════════════════════════

@router.post("/register-restaurant_pg1")
async def register_restaurant_pg1(data: RestaurantPg1):
    sb = get_supabase()

    user_id = data.usr_id
    if not user_id:
        raise HTTPException(status_code=400, detail="usr_id is required")

    user_id_int = int(user_id)

    # Ensure temp row exists (upsert)
    existing = sb.table("temp").select("user_id").eq("user_id", user_id_int).execute()

    row = {
        "user_id": user_id_int,
        "restaurant_name": data.rest_name[:100],
        "owner_name": data.ownr_name[:25],
        "owner_email": data.ownr_email,
        "owner_mobile": data.ownr_mobile,
        "rest_mob_number": data.rest_phone,
        "description": data.rest_intro,
        "street": data.strret,
        "locality": data.localty,
        "city": data.cty,
        "pincode": data.pincde,
        "landmark": data.landmrk,
        "latitude": data.latitude or "0",
        "longitude": data.longitude or "0",
    }

    if existing.data:
        sb.table("temp").update(row).eq("user_id", user_id_int).execute()
    else:
        sb.table("temp").insert(row).execute()

    return {"message": "Restaurant details saved", "restaurant_id": str(user_id_int)}


# ═══════════════════════════════════════════════════════════
# STEP 3 — Cuisines & timings
# ═══════════════════════════════════════════════════════════

@router.post("/save-cuisines-and-times")
async def save_cuisines_and_times(data: CuisineTimesRequest):
    sb = get_supabase()

    user_id_str = data.restaurant_id
    if not user_id_str:
        raise HTTPException(status_code=400, detail="restaurant_id is required")

    user_id = int(user_id_str)

    # Verify temp row exists
    temp_check = sb.table("temp").select("user_id").eq("user_id", user_id).execute()
    if not temp_check.data:
        raise HTTPException(status_code=404, detail="Onboarding session not found. Complete step 1 first.")

    # ── Cuisines ──────────────────────────────────────────
    # Clear old selections
    sb.table("temp_rest_cuisines").delete().eq("user_id", user_id).execute()

    for cuisine_name in data.cuisines:
        cuis = sb.table("cuisines").select("id").eq("cuisine", cuisine_name).execute()
        if cuis.data:
            sb.table("temp_rest_cuisines").insert({
                "user_id": user_id,
                "cuisine_id": cuis.data[0]["id"],
            }).execute()

    # ── Timings ───────────────────────────────────────────
    sb.table("temp_rest_timing").delete().eq("user_id", user_id).execute()

    for day, slots in data.timings.items():
        for slot in slots:
            sb.table("temp_rest_timing").insert({
                "user_id": user_id,
                "day": day,
                "open_time": slot.open,
                "close_time": slot.close,
            }).execute()

    return {"message": "Cuisines and timings saved"}


# ═══════════════════════════════════════════════════════════
# STEP 4 — Documents + FINALISE registration
# ═══════════════════════════════════════════════════════════

@router.post("/save-documents")
async def save_documents(data: SaveDocumentsRequest):
    sb = get_supabase()

    user_id_str = data.restaurantId
    if not user_id_str:
        raise HTTPException(status_code=400, detail="restaurantId is required")

    user_id = int(user_id_str)

    # ── 1. Update temp with bank/PAN info ─────────────────
    sb.table("temp").update({
        "pan": data.documents.pan,
        "account_holder": data.documents.account_holder,
        "account_no": data.documents.account_number,
        "ifsc": data.documents.ifsc,
    }).eq("user_id", user_id).execute()

    # ── 2. Finalise: move everything from temp → permanent tables
    temp_res = sb.table("temp").select("*").eq("user_id", user_id).single().execute()
    if not temp_res.data:
        raise HTTPException(status_code=404, detail="Onboarding data not found")
    t = temp_res.data

    # 2a. rest_location
    loc = sb.table("rest_location").insert({
        "street":    t.get("street") or "",
        "locality":  t.get("locality") or "",
        "city":      t.get("city") or "",
        "pincode":   t.get("pincode") or "",
        "landmark":  t.get("landmark"),
        "latitude":  t.get("latitude") or "0",
        "longitude": t.get("longitude") or "0",
    }).execute()
    location_id = loc.data[0]["id"]

    # 2b. bank_details
    bank = sb.table("bank_details").insert({
        "pan":            t.get("pan"),
        "account_holder": t.get("account_holder"),
        "account_no":     t.get("account_no"),
        "ifsc":           t.get("ifsc"),
    }).execute()
    bank_id = bank.data[0]["id"]

    # 2c. restaurants
    rest = sb.table("restaurants").insert({
        "name":        t.get("restaurant_name") or "Unnamed",
        "accounts_id": user_id,
        "location_id": location_id,
        "bank_id":     bank_id,
        "mob_number":  t.get("rest_mob_number") or "",
        "description": t.get("description"),
    }).execute()
    restaurant_id = rest.data[0]["id"]

    # 2d. menu (from temp_menu)
    temp_menu = sb.table("temp_menu").select("*").eq("user_id", user_id).execute()
    for item in (temp_menu.data or []):
        sb.table("menu").insert({
            "restaurant_id": restaurant_id,
            "dish_name":     item["dish_name"],
            "price":         item.get("price", 0),
            "category_veg":  item.get("category_veg"),
            "description":   item.get("description"),
            "image_link":    item.get("image_link"),
            "cuisine":       item.get("cuisine"),
            "category":      item.get("category"),
            "variant_name":  item.get("variant_name", "Regular"),
        }).execute()

    # 2e. rest_cuisines (from temp_rest_cuisines)
    temp_cuis = sb.table("temp_rest_cuisines").select("*").eq("user_id", user_id).execute()
    for c in (temp_cuis.data or []):
        sb.table("rest_cuisines").insert({
            "restaurant_id": restaurant_id,
            "cuisine_id":    c["cuisine_id"],
        }).execute()

    # 2f. rest_timing (from temp_rest_timing)
    temp_timing = sb.table("temp_rest_timing").select("*").eq("user_id", user_id).execute()
    for tt in (temp_timing.data or []):
        sb.table("rest_timing").insert({
            "restaurant_id": restaurant_id,
            "day":           tt["day"],
            "open_time":     tt["open_time"],
            "close_time":    tt["close_time"],
        }).execute()

    # 2g. rest_media (from temp_media)
    temp_media = sb.table("temp_media").select("*").eq("user_id", user_id).execute()
    for m in (temp_media.data or []):
        sb.table("rest_media").insert({
            "restaurant_id": restaurant_id,
            "image_link":    m["file_link"],
            "exterior":      m.get("exterior", False),
            "interior":      m.get("interior", False),
            "kitchen":       m.get("kitchen", False),
            "video":         m.get("video", False),
        }).execute()

    # ── 3. Cleanup temp tables ────────────────────────────
    sb.table("temp_media").delete().eq("user_id", user_id).execute()
    sb.table("temp_menu").delete().eq("user_id", user_id).execute()
    sb.table("temp_rest_cuisines").delete().eq("user_id", user_id).execute()
    sb.table("temp_rest_timing").delete().eq("user_id", user_id).execute()
    sb.table("temp").delete().eq("user_id", user_id).execute()

    return {
        "message": "Registration complete!",
        "restaurant_id": restaurant_id,
    }
