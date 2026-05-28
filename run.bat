@echo off
echo ==========================================
echo  RoadSoS - Emergency Road Safety App
echo ==========================================

cd /d "%~dp0\app"

if not exist ".env" (
  copy .env.example .env
  echo Created .env from template. Edit it to set LLM_PROVIDER and API keys.
)

echo Installing dependencies...
pip install -r requirements.txt --quiet

echo.
echo Starting RoadSoS server on http://localhost:8000
echo Press Ctrl+C to stop.
echo.

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
