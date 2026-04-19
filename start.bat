@echo off
cd /d "%~dp0backend"

if not exist ".venv" (
    echo Creating virtual environment...
    uv venv .venv
)

echo Installing packages...
uv pip install -r requirements.txt --python .venv\Scripts\python.exe -q

echo Starting server at http://localhost:8000
echo Press Ctrl+C to stop.
.venv\Scripts\uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause
