"""Gemini vision service — extracts structured menu data from images / PDFs.

Uses the free-tier of Google Gemini (gemini-1.5-flash) which supports image input.
For PDFs → pages are rasterised with PyMuPDF first, then sent as images.
"""

from __future__ import annotations

import io
import json
import re
from typing import Any

import google.generativeai as genai
from PIL import Image

from config import GEMINI_API_KEY

# ── Configure Gemini ──────────────────────────────────────
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

_model = None


def _get_model():
    global _model
    if _model is None:
        _model = genai.GenerativeModel("gemini-2.5-flash")
    return _model


# ── Prompt ────────────────────────────────────────────────
MENU_PROMPT = """You are an expert restaurant-menu digitiser.

Analyse the menu image(s) below and extract **every** dish you can see.

Return ONLY valid JSON (no markdown fences, no explanation) in this exact format:

{
  "restaurant_name": "Name if visible, else empty string",
  "categories": [
    {
      "category": "Category Name (e.g. Starters, Main Course, Beverages)",
      "items": [
        {
          "name": "Dish Name",
          "description": "Brief description if visible, else empty string",
          "variants": [
            { "variant_name": "Half", "price": 150 },
            { "variant_name": "Full", "price": 250 }
          ]
        }
      ]
    }
  ]
}

Rules:
- If a dish has only one price, use variant_name "Regular".
- Price must be a number (no currency symbols).
- Include ALL dishes visible in the menu.
- Group dishes logically by category — use "General" if unclear.
- If the same dish has sizes (Half / Full / Regular / Large), list them as variants.
- Keep names concise, preserve original language if non-English.
"""


# ── PDF → images ─────────────────────────────────────────
def _pdf_to_pil_images(pdf_bytes: bytes) -> list[Image.Image]:
    """Convert every page of a PDF to a PIL Image via PyMuPDF (fitz)."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise RuntimeError(
            "PyMuPDF is required for PDF menu parsing. "
            "Install it with: pip install PyMuPDF"
        )

    images: list[Image.Image] = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    for page in doc:
        pix = page.get_pixmap(dpi=150)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        images.append(img)
    doc.close()
    return images


# ── Parse Gemini response ─────────────────────────────────
def _extract_json(text: str) -> dict[str, Any]:
    """Best-effort JSON extraction — handles markdown code-fences."""
    # Try stripping ```json ... ``` first
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    raw = m.group(1) if m else text.strip()
    return json.loads(raw)


# ── Main entry point ──────────────────────────────────────
async def parse_menu_images(
    file_data: list[tuple[bytes, str]],
) -> dict[str, Any]:
    """
    Accepts a list of (raw_bytes, content_type) tuples.
    Returns the structured menu dict.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured — see .env.example")

    model = _get_model()
    parts: list[Any] = [MENU_PROMPT]

    for raw, ct in file_data:
        if ct == "application/pdf":
            for img in _pdf_to_pil_images(raw):
                parts.append(img)
        elif ct.startswith("image/"):
            img = Image.open(io.BytesIO(raw))
            parts.append(img)
        else:
            # Try to open as image anyway (some browsers send generic MIME)
            try:
                img = Image.open(io.BytesIO(raw))
                parts.append(img)
            except Exception:
                continue  # skip unsupported files

    if len(parts) <= 1:
        raise ValueError("No valid images found in the uploaded files")

    response = model.generate_content(parts)
    text = response.text
    if not text:
        raise ValueError("Gemini returned an empty response")

    menu = _extract_json(text)
    return menu
