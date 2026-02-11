"""
Nomoosh Backend — FastAPI entry point.

Run with:
    uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import FRONTEND_URL
from routers import auth, onboarding, menu, geocode
from routers import staff, tables, orders, ws

app = FastAPI(
    title="Nomoosh API",
    description="Restaurant onboarding & ordering platform",
    version="2.0.0",
)

# ── CORS ──────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(onboarding.router)
app.include_router(menu.router)
app.include_router(geocode.router)
app.include_router(staff.router)
app.include_router(tables.router)
app.include_router(orders.router)
app.include_router(ws.router)


# ── Health & root ─────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "service": "Nomoosh API"}


@app.get("/health")
def health():
    return {"status": "healthy"}