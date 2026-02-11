# Deploying Nomoosh Backend to Hugging Face Spaces

## Prerequisites

1. A Hugging Face account (create one at https://huggingface.co/join)
2. Your Supabase credentials
3. Your Google Gemini API key
4. Git installed on your system

## Step-by-Step Deployment Guide

### 1. Create a New Space on Hugging Face

1. Go to https://huggingface.co/spaces
2. Click **"Create new Space"**
3. Fill in the details:
   - **Space name**: `nomoosh-api` (or your preferred name)
   - **License**: MIT
   - **Select SDK**: Choose **Docker**
   - **Space hardware**: CPU basic (free tier) or upgrade if needed
   - **Visibility**: Public or Private (your choice)
4. Click **"Create Space"**

### 2. Clone Your New Space

```bash
# Install Git LFS if you haven't
git lfs install

# Clone the empty space (replace YOUR_USERNAME)
git clone https://huggingface.co/spaces/YOUR_USERNAME/nomoosh-api
cd nomoosh-api
```

### 3. Copy Backend Files to the Space

Copy all files from `C:\Nomoosh\backend\` to your cloned space folder **except**:
- Do NOT copy `.env` (contains secrets)
- Do NOT copy `venv/` folder
- Do NOT copy `__pycache__/` folders

```bash
# From the backend directory
# Copy all files except excluded ones
robocopy C:\Nomoosh\backend . /E /XD venv __pycache__ .git /XF .env
```

### 4. Rename README

Rename `README_HF.md` to `README.md`:

```bash
# Delete existing README.md if present
del README.md

# Rename the Hugging Face README
ren README_HF.md README.md
```

### 5. Configure Environment Variables (IMPORTANT!)

In your Hugging Face Space:

1. Go to **Settings** → **Variables and secrets**
2. Add the following **Repository secrets** (NOT public variables):

   ```
   SUPABASE_URL = https://zufvxlotxhnqdnzhriuy.supabase.co
   SUPABASE_SERVICE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1ZnZ4bG90eGhucWRuemhyaXV5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDY0Njc2NCwiZXhwIjoyMDg2MjIyNzY0fQ.UtCdW9DZQ86cW2qf6AVDlks2pNCqsZ1OosBjT4KdH3w
   SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1ZnZ4bG90eGhucWRuemhyaXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NDY3NjQsImV4cCI6MjA4NjIyMjc2NH0.SdwZfDR_FTPP-sPgeAEZMdZYcSv1Am1uBZpm-Ri3tOU
   GEMINI_API_KEY = AIzaSyAxLP4yiYqxFsMaSjoKYdf_10MS4X10hvQ
   FRONTEND_URL = https://nomoosh.vercel.app
   ```

   **⚠️ CRITICAL**: These MUST be added as **secrets**, not public variables!

### 6. Push to Hugging Face

```bash
# Add all files
git add .

# Commit
git commit -m "Initial deployment"

# Push to Hugging Face
git push
```

### 7. Wait for Build

- Hugging Face will automatically build your Docker container
- This may take 5-10 minutes for the first build
- Watch the build logs in the Space's **Logs** tab
- Once complete, your space will be **Running** (green status)

### 8. Update Frontend Configuration

Once deployed, your API will be available at:
```
https://YOUR_USERNAME-nomoosh-api.hf.space
```

Update your frontend `.env.local`:
```env
NEXT_PUBLIC_API_BASE=https://YOUR_USERNAME-nomoosh-api.hf.space
```

### 9. Test Your Deployed API

Visit these URLs to verify:
- Health check: `https://YOUR_USERNAME-nomoosh-api.hf.space/health`
- API docs: `https://YOUR_USERNAME-nomoosh-api.hf.space/docs`
- ReDoc: `https://YOUR_USERNAME-nomoosh-api.hf.space/redoc`

## Troubleshooting

### Build Fails

- Check the **Logs** tab for error messages
- Ensure all files are pushed correctly
- Verify `requirements.txt` has no syntax errors

### API Returns 500 Errors

- Check that all environment variables are set correctly in **Settings**
- Verify Supabase credentials are valid
- Check Space logs for Python errors

### CORS Issues

- Update `FRONTEND_URL` environment variable to match your deployed frontend
- Redeploy the Space after changing environment variables

### Space Sleeps (Free Tier)

- Free tier Spaces sleep after inactivity
- First request after sleep will take ~30 seconds to wake up
- Consider upgrading to persistent hardware for production

## Updating Your Deployment

To update the API after changes:

```bash
cd your-space-folder
git add .
git commit -m "Update message"
git push
```

Hugging Face will automatically rebuild and redeploy.

## Cost

- **CPU basic (free)**: Limited compute, sleeps after inactivity
- **CPU upgrade**: ~$0.03/hour for persistent runtime
- **GPU**: Available for compute-intensive tasks

## Support

- Hugging Face Docs: https://huggingface.co/docs/hub/spaces
- Hugging Face Community: https://discuss.huggingface.co/

---

**Need help?** Open an issue or contact support.
