---
title: Nomoosh API
emoji: 🍽️
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
license: mit
---

# Nomoosh Backend API

FastAPI backend for the Nomoosh restaurant onboarding and ordering platform.

## Features

- 🔐 Authentication with Supabase
- 📋 Multi-step restaurant onboarding
- 🤖 AI-powered menu digitization using Google Gemini
- 📍 Geocoding and location services
- ☁️ File storage with Supabase Storage
- 🗄️ PostgreSQL database via Supabase

## Environment Variables

This Space requires the following environment variables to be set in Settings → Variables and secrets:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
SUPABASE_ANON_KEY=your_supabase_anon_key
GEMINI_API_KEY=your_google_gemini_api_key
FRONTEND_URL=your_frontend_url
```

## API Documentation

Once deployed, visit:
- `/docs` - Interactive Swagger UI
- `/redoc` - ReDoc documentation
- `/health` - Health check endpoint

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Create .env file with your credentials
cp .env.example .env

# Run the server
uvicorn main:app --reload
```

## Deployment

This backend is designed to be deployed on Hugging Face Spaces using Docker SDK.

## License

MIT
