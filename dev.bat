@echo off
echo Starting Full Stack Development Environment...

:: Start the FastAPI Backend
:: Opens a new window, enters the 'backend' folder, activates venv, and runs uvicorn
start "FastAPI Backend" cmd /k "cd backend && venv\Scripts\activate && uvicorn main:app --reload"

:: Start the Next.js Frontend
:: Opens a new window, enters the 'frontend' folder, and runs the dev server
start "Next.js Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================================
echo  Both servers are launching in separate windows.
echo  Backend: http://127.0.0.1:8000
echo  Frontend: http://localhost:3000
echo ========================================================