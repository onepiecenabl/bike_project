from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import osmnx as ox
import geopandas as gpd
from shapely.geometry import LineString

app = FastAPI(title="Bike Pathfinder PWA")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/cycleways")
def get_nearby_cycleways(lat: float = Query(...), lon: float = Query(...), dist: int = 500):
    try:
        # bike 네트워크로 로드 (보행자/자전거 전용 경로 우선)
        G = ox.graph_from_point((lat, lon), dist=dist, network_type='bike')
        edges = ox.graph_to_gdfs(G, nodes=False, edges=True)

        # 안전한 유형만 필터
        safe_types = ['cycleway', 'path', 'footway', 'pedestrian',
                      'residential', 'living_street', 'service']
        cycle_edges = edges[edges['highway'].isin(safe_types)]

        geojson = gpd.GeoDataFrame(cycle_edges).to_crs("EPSG:4326").__geo_interface__
        return {
            'center': {'lat': lat, 'lon': lon},
            'count': len(geojson['features']),
            'geojson': geojson,
        }
    except Exception as e:
        return {'error': str(e)}


@app.get("/api/route")
def get_route(from_lat: float = Query(...), from_lng: float = Query(...),
              to_lat: float = Query(...), to_lng: float = Query(...)):
    try:
        G = ox.graph_from_point((from_lat, from_lng), dist=5000, network_type='bike')
        origin_node = ox.nearest_nodes(G, from_lng, from_lat)
        destination_node = ox.nearest_nodes(G, to_lng, to_lat)

        if origin_node not in G or destination_node not in G:
            return {'error': '지점에 연결된 노드를 찾을 수 없습니다.'}

        # shortest_path (가중치=time)
        route = ox.shortest_path(G, origin_node, destination_node, weight='time')

        # 좌표 수집
        coords = []
        for node in route:
            lat = G.nodes[node]['y']
            lng = G.nodes[node]['x']
            coords.append([lng, lat])  # GeoJSON: [lon, lat]

        # 거리/시간
        total_dist = 0
        total_time = 0
        for u, v in zip(route[:-1], route[1:]):
            edge_data = G.get_edge_data(u, v)
            if edge_data:
                for k, data in edge_data.items():
                    total_dist += data.get('length', 0)
                    total_time += data.get('time', 0)

        # 길안내 (segment별 단순 지시)
        steps = []
        cum = 0
        for i, (u, v) in enumerate(zip(route[:-1], route[1:])):
            edge_data = G.get_edge_data(u, v)
            seg_dist = 0
            seg_name = ''
            seg_type = ''
            if edge_data:
                for k, d in edge_data.items():
                    seg_dist += d.get('length', 0)
                    seg_name = d.get('name', '')
                    seg_type = d.get('highway', '')
            cum += seg_dist
            instruction = '직진'
            if i == 0:
                instruction = '출발하세요'
            elif i == len(route) - 2:
                instruction = '목적지 도착'
            elif seg_name:
                instruction = f'{seg_name}으로 직진'
            steps.append({
                'instruction': instruction,
                'distance': max(10, int(seg_dist)),
            })

        return {
            'route': {
                'type': 'Feature',
                'geometry': {
                    'type': 'LineString',
                    'coordinates': coords,
                },
                'properties': {},
            },
            'distance': total_dist,
            'duration': total_time,
            'steps': steps,
        }
    except Exception as e:
        return {'error': str(e)}


@app.get("/api/geocode")
def geocode(q: str = Query(...)):
    try:
        # Nominatim geocoding
        import requests
        url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=5&countrycodes=kr"
        resp = requests.get(url, headers={'User-Agent': 'BikePathFinder/1.0'})
        results = []
        for r in resp.json():
            results.append({
                'lat': float(r.get('lat', 0)),
                'lon': float(r.get('lon', 0)),
                'display_name': r.get('display_name', ''),
                'type': r.get('type', 'place'),
                'class': r.get('class', ''),
            })
        return results
    except Exception as e:
        return []


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
