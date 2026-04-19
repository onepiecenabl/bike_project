from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import osmnx as ox
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="자전거 네비게이션")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


@app.get("/api/bike-roads")
async def get_bike_roads(lat: float, lng: float, radius: int = 3000):
    try:
        logger.info(f"자전거 도로 탐색: ({lat}, {lng}), 반경={radius}m")
        G = ox.graph_from_point((lat, lng), dist=radius, network_type="bike", simplify=True)
        _, edges = ox.graph_to_gdfs(G)

        keep_cols = [c for c in ["highway", "name", "length", "geometry"] if c in edges.columns]
        edges = edges[keep_cols]

        geojson = json.loads(edges.to_json())
        logger.info(f"도로 구간 {len(geojson['features'])}개 발견")
        return geojson

    except Exception as e:
        logger.error(f"오류 발생: {e}")
        raise HTTPException(status_code=500, detail=str(e))


app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
