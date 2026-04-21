"""
Bike Path Finder - Main Entry Point
Phase 1: Current Location + Nearby Cycleway Visualization
"""
import uvicorn

def main():
    print("🚀 FastAPI server starting at http://localhost:8000")
    print("📱 Frontend served at http://localhost:8000")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")

if __name__ == "__main__":
    main()
