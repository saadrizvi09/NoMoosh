# Quick Start: Deploy to Hugging Face

## Option 1: Automated Deployment (Recommended)

1. **Install Hugging Face CLI** (if not already installed):
```bash
pip install huggingface_hub
huggingface-cli login
```

2. **Set your username**:
```bash
set HF_USERNAME=your_huggingface_username
```

3. **Create a new Space on Hugging Face**:
   - Go to: https://huggingface.co/new-space
   - Name: `nomoosh-api`
   - SDK: Select **Docker**
   - Click **Create Space**

4. **Run the deployment script**:
```bash
cd C:\Nomoosh
deploy_to_hf.bat
```

5. **Configure secrets** in your Space settings:
   - Go to: https://huggingface.co/spaces/YOUR_USERNAME/nomoosh-api/settings
   - Under "Repository secrets", add:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_KEY`
     - `SUPABASE_ANON_KEY`
     - `GEMINI_API_KEY`
     - `FRONTEND_URL`

## Option 2: Manual Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed step-by-step instructions.

## After Deployment

Your API will be live at:
```
https://YOUR_USERNAME-nomoosh-api.hf.space
```

Test it:
- Health: `https://YOUR_USERNAME-nomoosh-api.hf.space/health`
- Docs: `https://YOUR_USERNAME-nomoosh-api.hf.space/docs`

Update your frontend `.env.local`:
```env
NEXT_PUBLIC_API_BASE=https://YOUR_USERNAME-nomoosh-api.hf.space
```

## Test Locally First (Optional)

Build and test the Docker image locally:

```bash
cd C:\Nomoosh\backend

# Build
docker build -t nomoosh-api .

# Run
docker run -p 7860:7860 --env-file .env nomoosh-api

# Test
curl http://localhost:7860/health
```

## Files Created for Deployment

- ✅ `backend/Dockerfile` - Container configuration
- ✅ `backend/.dockerignore` - Excludes unnecessary files
- ✅ `backend/README_HF.md` - Hugging Face Space documentation
- ✅ `deploy_to_hf.bat` - Automated deployment script
- ✅ `DEPLOYMENT_GUIDE.md` - Comprehensive manual guide

## Troubleshooting

**Build fails?**
- Check Logs tab in your Space
- Verify all environment variables are set

**API errors?**
- Ensure secrets are configured correctly
- Check Space logs for Python errors

**First request slow?**
- Free tier Spaces sleep after inactivity
- First wake-up takes ~30 seconds
