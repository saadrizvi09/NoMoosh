@echo off
echo ========================================
echo  Deploying Nomoosh Backend to Hugging Face
echo ========================================
echo.

:: Check if HF_USERNAME is set
if "%HF_USERNAME%"=="" (
    echo ERROR: Please set your Hugging Face username first:
    echo   set HF_USERNAME=your_username
    echo.
    pause
    exit /b 1
)

:: Set space name
set SPACE_NAME=nomoosh-api

echo Step 1: Creating temporary deployment folder...
if exist "hf_deploy" rmdir /s /q hf_deploy
mkdir hf_deploy
cd hf_deploy

echo.
echo Step 2: Cloning Hugging Face Space...
echo   Space URL: https://huggingface.co/spaces/%HF_USERNAME%/%SPACE_NAME%
echo.
echo   If the space doesn't exist, create it first at:
echo   https://huggingface.co/new-space
echo   - Select Docker SDK
echo   - Name it: %SPACE_NAME%
echo.
pause

git clone https://huggingface.co/spaces/%HF_USERNAME%/%SPACE_NAME% space
if errorlevel 1 (
    echo ERROR: Failed to clone space. Make sure:
    echo 1. You've created the space on Hugging Face
    echo 2. You're logged in to git with: huggingface-cli login
    cd ..
    pause
    exit /b 1
)

cd space

echo.
echo Step 3: Copying backend files...
robocopy ..\..\backend . /E /XD venv __pycache__ .git node_modules .next /XF .env *.pyc package-lock.json

:: Rename README for Hugging Face
if exist README_HF.md (
    del README.md 2>nul
    ren README_HF.md README.md
)

echo.
echo Step 4: Committing and pushing...
git add .
git commit -m "Deploy Nomoosh API"
git push

echo.
echo ========================================
echo  Deployment initiated!
echo ========================================
echo.
echo Your API will be available at:
echo   https://%HF_USERNAME%-%SPACE_NAME%.hf.space
echo.
echo Next steps:
echo 1. Go to: https://huggingface.co/spaces/%HF_USERNAME%/%SPACE_NAME%/settings
echo 2. Add these Repository secrets:
echo    - SUPABASE_URL
echo    - SUPABASE_SERVICE_KEY
echo    - SUPABASE_ANON_KEY
echo    - GEMINI_API_KEY
echo    - FRONTEND_URL
echo 3. Wait for build to complete (check Logs tab)
echo.
echo Build logs: https://huggingface.co/spaces/%HF_USERNAME%/%SPACE_NAME%/logs
echo.
pause

cd ..\..
