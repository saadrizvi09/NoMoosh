"""Geocode router — free reverse-geocoding via OpenStreetMap Nominatim."""

from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

router = APIRouter(tags=["geocode"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "NomooshApp/1.0 (support@nomoosh.com)"   # Nominatim requires a User-Agent


class ReverseGeocodeRequest(BaseModel):
    lat: float
    lng: float
    language: str = "en"


@router.post("/geocode/reverse")
async def reverse_geocode(data: ReverseGeocodeRequest):
    """
    Reverse-geocode latitude/longitude → address components.
    Uses the free Nominatim (OpenStreetMap) API.
    """
    params = {
        "lat": data.lat,
        "lon": data.lng,
        "format": "jsonv2",
        "addressdetails": 1,
        "accept-language": data.language,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params=params,
                headers={"User-Agent": USER_AGENT},
            )
            resp.raise_for_status()
            body = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Nominatim error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Geocoding failed: {e}")

    addr = body.get("address", {})

    # Map Nominatim fields → our schema
    street = " ".join(filter(None, [
        addr.get("house_number"),
        addr.get("road"),
        addr.get("neighbourhood"),
    ]))
    locality = addr.get("suburb") or addr.get("village") or addr.get("town") or ""
    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("municipality")
        or addr.get("county")
        or ""
    )
    pincode = addr.get("postcode") or ""

    return {
        "latitude": data.lat,
        "longitude": data.lng,
        "street": street,
        "locality": locality,
        "city": city,
        "pincode": pincode,
        "display_name": body.get("display_name", ""),
        "raw": addr,
    }
