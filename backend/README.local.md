# Nomoosh Backend

FastAPI backend for the Nomoosh restaurant onboarding & ordering platform.

## Tech Stack
- **FastAPI** — Python web framework
- **Supabase** — Auth (email OTP + Google OAuth) + PostgreSQL database + Storage
- **Google Gemini** — AI-powered menu parsing from images/PDFs (free tier)
- **Nominatim** — Free reverse geocoding (OpenStreetMap)

## Prerequisites
- Python 3.11+
- A [Supabase](https://supabase.com) project (free tier)
- A [Google AI Studio](https://aistudio.google.com/apikey) API key (free)

---

## Setup

### 1. Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in your `.env`:

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → API → URL |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Project Settings → API → `service_role` key |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → `anon` key |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) → Create API Key |
| `FRONTEND_URL` | Default: `http://localhost:3000` |

### 3. Set up the database

1. Go to **Supabase Dashboard → SQL Editor → New Query**
2. Paste the contents of `schema.sql` and click **Run**
3. This creates all tables and seeds the cuisines list

### 4. Set up Supabase Storage

1. Go to **Supabase Dashboard → Storage → New Bucket**
2. Create a bucket named `restaurant-media`
3. Set it to **Public** (allows public read access for images)

### 5. Enable authentication providers

#### Email OTP (magic link)
1. Go to **Supabase Dashboard → Authentication → Providers → Email**
2. Enable **Email** provider
3. Ensure "Confirm email" is toggled ON

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web Application)
3. Add `https://<your-supabase-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI
4. Go to **Supabase Dashboard → Authentication → Providers → Google**
5. Enable Google and paste your Client ID + Client Secret

### 6. Run the server

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
API docs at `http://localhost:8000/docs`.

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/create_user` | Create or retrieve a user profile |

### Onboarding (multi-step registration)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/register-restaurant_pg1` | Save restaurant details & location |
| POST | `/save-cuisines-and-times` | Save cuisines & operating hours |
| POST | `/save-documents` | Save bank details & finalise registration |

### Menu
| Method | Path | Description |
|--------|------|-------------|
| POST | `/digitize-menu` | Parse menu from images/PDF via Gemini AI |
| POST | `/upload-image` | Upload a single dish photo |
| POST | `/upload-restaurant-media` | Upload restaurant photos & videos |
| POST | `/register-restaurant_pg2` | Save finalised menu items |

### Geocoding
| Method | Path | Description |
|--------|------|-------------|
| POST | `/geocode/reverse` | Reverse geocode lat/lng → address (Nominatim) |

---

## Frontend Setup

```bash
cd frontend
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_BASE
npm install
npm run dev
```

---

## Cost

All services used are **free**:
- Supabase Free Tier: 500 MB storage, 1 GB bandwidth, 2 GB database
- Gemini Free Tier: 15 RPM, 1,500 requests/day
- Nominatim: Free (no API key, 1 req/sec rate limit)
- Google Maps iframe embed: Free (no API key)
