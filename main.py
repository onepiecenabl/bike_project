"""
Bike Path Finder - Main Entry Point
Phase 1: Current Location + Nearby Cycleway Visualization
"""
import uvicorn
import subprocess
import os
import threading
import webbrowser

def run_fastapi():
    print("🚀 FastAPI server starting at http://localhost:8000")
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True, log_level="info")

# If you have a simple http server for frontend:
# python -m http.server 3000 --directory frontend

if __name__ == "__main__":
    # Simple logic: just run backend. Frontend can be opened manually or via python -m http.server
    run_fastapi()
