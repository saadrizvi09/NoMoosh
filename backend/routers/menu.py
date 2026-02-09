"""Menu router — digitise menu images via Gemini, upload dish photos, save menu items.

Endpoints:
  POST /digitize-menu          → parse menu from images/PDFs (Gemini AI)
  POST /upload-image           → upload a single dish photo to Supabase Storage
  POST /upload-restaurant-media→ upload restaurant photos/videos
  POST /register-restaurant_pg2→ save finalised menu items to temp_menu
"""

from __future__ import annotations

import json
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from supabase_client import get_supabase
from services.gemini_service import parse_menu_images
from services.storage_service import upload_to_storage

router = APIRouter(tags=["menu"])


# ═══════════════════════════════════════════════════════════
# MODELS
# ═══════════════════════════════════════════════════════════

class VariantPayload(BaseModel):
    variant_name: str = "Regular"
    price: int | float = 0


class ItemPayload(BaseModel):
    name: str
    variants: list[VariantPayload] = []
    description: str = ""
    image_link: str = ""


class CategoryPayload(BaseModel):
    category: str
    items: list[ItemPayload] = []


class MenuPayload(BaseModel):
    restaurant_name: str = ""
    categories: list[CategoryPayload] = []


class RegisterPg2Request(BaseModel):
    user_id: int
    menu: MenuPayload


# ═══════════════════════════════════════════════════════════
# POST /digitize-menu
# ═══════════════════════════════════════════════════════════

@router.post("/digitize-menu")
async def digitize_menu(files: list[UploadFile] = File(...)):
    """Accept menu image(s) / PDF, run Gemini vision to extract structured menu JSON."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    file_data: list[tuple[bytes, str]] = []
    for f in files:
        content = await f.read()
        ct = f.content_type or "application/octet-stream"
        file_data.append((content, ct))

    try:
        result = await parse_menu_images(file_data)
        return {"menu": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Menu parsing failed: {e}")


# ═══════════════════════════════════════════════════════════
# POST /upload-image  (single dish photo)
# ═══════════════════════════════════════════════════════════

@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    itemId: str = Form(""),
):
    """Upload a dish photo → Supabase Storage, return public URL."""
    content = await file.read()
    ct = file.content_type or "image/jpeg"
    filename = file.filename or "photo.jpg"
    try:
        url = await upload_to_storage(content, filename, ct, folder="dishes")
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")


# ═══════════════════════════════════════════════════════════
# POST /upload-restaurant-media  (bulk restaurant photos/videos)
# ═══════════════════════════════════════════════════════════

@router.post("/upload-restaurant-media")
async def upload_restaurant_media(request: Request):
    """
    Accepts multipart form with keys like:
        menu_files[], exterior_photos[], interior_photos[], etc.
    Uploads each to Supabase Storage and records in temp_media.
    """
    form = await request.form()
    user_id_raw = form.get("user_id")

    sb = get_supabase()
    uploaded: list[dict] = []

    for key, value in form.multi_items():
        if key == "user_id":
            continue

        # Only process file-like values
        if not hasattr(value, "read"):
            continue

        content = await value.read()  # type: ignore[union-attr]
        ct = getattr(value, "content_type", "application/octet-stream") or "application/octet-stream"
        fname = getattr(value, "filename", "file") or "file"

        url = await upload_to_storage(content, fname, ct, folder="restaurant")
        uploaded.append({"key": key, "url": url})

        # Persist in temp_media if we have a user_id
        if user_id_raw:
            is_ext = "exterior" in key
            is_int = "interior" in key
            is_kit = "kitchen" in key
            is_menu = "menu" in key
            is_video = "video" in key

            sb.table("temp_media").insert({
                "user_id":  int(user_id_raw),
                "file_link": url,
                "exterior": is_ext,
                "interior": is_int,
                "kitchen":  is_kit,
                "menu":     is_menu,
                "video":    is_video,
            }).execute()

    return {"message": "Media uploaded", "count": len(uploaded), "files": uploaded}


# ═══════════════════════════════════════════════════════════
# POST /register-restaurant_pg2  (save parsed/edited menu items)
# ═══════════════════════════════════════════════════════════

@router.post("/register-restaurant_pg2")
async def register_restaurant_pg2(data: RegisterPg2Request):
    """Persist the (possibly edited) menu items into temp_menu."""
    sb = get_supabase()
    user_id = data.user_id

    # Verify temp row exists
    temp_check = sb.table("temp").select("user_id").eq("user_id", user_id).execute()
    if not temp_check.data:
        raise HTTPException(
            status_code=404,
            detail="Onboarding session not found — complete step 1 first.",
        )

    # Clear previous menu drafts
    sb.table("temp_menu").delete().eq("user_id", user_id).execute()

    # Insert each item (one row per variant)
    for cat in data.menu.categories:
        for item in cat.items:
            if not item.variants:
                # Single-price dish
                sb.table("temp_menu").insert({
                    "user_id":      user_id,
                    "dish_name":    item.name[:100],
                    "price":        0,
                    "category":     cat.category,
                    "variant_name": "Regular",
                    "image_link":   item.image_link or None,
                    "description":  item.description or None,
                }).execute()
            else:
                for v in item.variants:
                    sb.table("temp_menu").insert({
                        "user_id":      user_id,
                        "dish_name":    item.name[:100],
                        "price":        int(v.price) if v.price else 0,
                        "category":     cat.category,
                        "variant_name": v.variant_name or "Regular",
                        "image_link":   item.image_link or None,
                        "description":  item.description or None,
                    }).execute()

    return {"message": "Menu saved", "user_id": user_id}
