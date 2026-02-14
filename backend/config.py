"""Centralised configuration — reads from .env via python-dotenv."""

import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
JWT_SECRET: str = os.getenv("JWT_SECRET", "nomoosh-secret-change-in-production")
REDIS_URL: str = os.getenv("REDIS_URL", "")  # e.g. rediss://default:xxx@xxx.upstash.io:6379

# Storage bucket name in Supabase
STORAGE_BUCKET: str = "restaurant-media"
