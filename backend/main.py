from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import osmnx as ox
import networkx as nx
import json
import logging
import math
import requests as req_lib

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

# In-memory graph cache keyed by rounded bbox tuple
_graph_cache: dict = {}


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _get_graph(north, south, east, west):
    key = (round(north, 3), round(south, 3), round(east, 3), round(west, 3))
    if key not in _graph_cache:
        logger.info(f"그래프 다운로드: {key}")
        _graph_cache[key] = ox.graph_from_bbox(
            (north, south, east, west), network_type="bike", simplify=True
        )
    return _graph_cache[key]


def _bearing(lat1, lng1, lat2, lng2) -> float:
    d = math.radians(lng2 - lng1)
    la1, la2 = math.radians(lat1), math.radians(lat2)
    x = math.sin(d) * math.cos(la2)
    y = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(d)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _turn_label(b1, b2) -> str:
    diff = (b2 - b1 + 360) % 360
    if diff < 30 or diff > 330:
        return "직진"
    elif diff < 80:
        return "우측으로"
    elif diff < 150:
        return "우회전"
    elif diff < 210:
        return "유턴"
    elif diff < 280:
        return "좌회전"
    else:
        return "좌측으로"


def _edge_name(row) -> str:
    n = row.get("name", "") or ""
    if isinstance(n, list):
        return n[0] if n else ""
    return n


def _build_steps(G, route_nodes, route_gdf) -> list:
    rows = list(route_gdf.iterrows())
    if not rows:
        return []

    # Group consecutive edges by street name
    groups = []
    cur_name = _edge_name(rows[0][1])
    cur_dist = 0.0
    cur_node_idx = 0

    for i, (_, row) in enumerate(rows):
        name = _edge_name(row)
        dist = float(row.get("length", 0) or 0)
        if name != cur_name:
            groups.append({"name": cur_name, "distance": cur_dist, "node_idx": cur_node_idx})
            cur_name = name
            cur_dist = dist
            cur_node_idx = i
        else:
            cur_dist += dist
    groups.append({"name": cur_name, "distance": cur_dist, "node_idx": cur_node_idx})

    steps = []
    for i, g in enumerate(groups):
        ni = g["node_idx"]
        if i == 0:
            turn = "출발"
        elif 0 < ni < len(route_nodes) - 1:
            n_prev = route_nodes[ni - 1]
            n_curr = route_nodes[ni]
            n_next = route_nodes[ni + 1]
            b1 = _bearing(
                G.nodes[n_prev]["y"], G.nodes[n_prev]["x"],
                G.nodes[n_curr]["y"], G.nodes[n_curr]["x"],
            )
            b2 = _bearing(
                G.nodes[n_curr]["y"], G.nodes[n_curr]["x"],
                G.nodes[n_next]["y"], G.nodes[n_next]["x"],
            )
            turn = _turn_label(b1, b2)
        else:
            turn = "계속"

        steps.append({
            "instruction": f"{turn}: {g['name'] or '이름 없는 도로'}",
            "distance": round(g["distance"]),
            "street_name": g["name"] or "",
        })

    steps.append({"instruction": "목적지 도착", "distance": 0, "street_name": ""})
    return steps


# ── API Endpoints ──────────────────────────────────────────────────────────────

@app.get("/api/bike-roads")
async def get_bike_roads(lat: float, lng: float, radius: int = 3000):
    try:
        logger.info(f"자전거 도로 탐색: ({lat}, {lng}), 반경={radius}m")
        G = ox.graph_from_point((lat, lng), dist=radius, network_type="bike", simplify=True)
        _, edges = ox.graph_to_gdfs(G)
        keep = [c for c in ["highway", "name", "length", "geometry"] if c in edges.columns]
        geojson = json.loads(edges[keep].to_json())
        logger.info(f"도로 구간 {len(geojson['features'])}개 발견")
        return geojson
    except Exception as e:
        logger.error(f"bike-roads 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/route")
async def get_route(from_lat: float, from_lng: float, to_lat: float, to_lng: float):
    dist_m = _haversine_m(from_lat, from_lng, to_lat, to_lng)
    if dist_m > 60_000:
        raise HTTPException(status_code=400, detail="두 지점 거리가 너무 멉니다 (최대 60km).")

    try:
        pad_lat = max(0.015, abs(from_lat - to_lat) * 0.25)
        pad_lng = max(0.015, abs(from_lng - to_lng) * 0.25)
        north = max(from_lat, to_lat) + pad_lat
        south = min(from_lat, to_lat) - pad_lat
        east  = max(from_lng, to_lng) + pad_lng
        west  = min(from_lng, to_lng) - pad_lng

        logger.info(f"경로 계산: ({from_lat},{from_lng}) → ({to_lat},{to_lng}), 직선 {dist_m/1000:.1f}km")
        G = _get_graph(north, south, east, west)

        orig = ox.nearest_nodes(G, from_lng, from_lat)
        dest = ox.nearest_nodes(G, to_lng, to_lat)

        route_nodes = nx.shortest_path(G, orig, dest, weight="length")
        route_gdf = ox.routing.route_to_gdf(G, route_nodes)

        total_dist = float(route_gdf["length"].sum())
        duration_sec = total_dist / (15_000 / 3600)  # 15 km/h 기준

        steps = _build_steps(G, route_nodes, route_gdf)
        route_geojson = json.loads(route_gdf.to_json())

        return {
            "route": route_geojson,
            "distance": round(total_dist),
            "duration": round(duration_sec),
            "steps": steps,
        }

    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail="두 지점 사이의 자전거 경로를 찾을 수 없습니다.")
    except nx.NodeNotFound:
        raise HTTPException(status_code=404, detail="해당 위치 근처에서 자전거 도로를 찾을 수 없습니다.")
    except Exception as e:
        logger.error(f"route 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/geocode")
async def geocode(q: str):
    try:
        resp = req_lib.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "format": "json", "limit": 6, "countrycodes": "kr", "accept-language": "ko"},
            headers={"User-Agent": "BikeNavApp/1.0"},
            timeout=6,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
