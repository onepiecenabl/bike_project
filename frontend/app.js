let map, userMarker, bikeRoadsLayer;
let userLocation = null;

function initMap() {
    map = L.map('map').setView([37.5665, 126.9780], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
}

function getUserLocation() {
    if (!navigator.geolocation) {
        setStatus('이 브라우저는 GPS를 지원하지 않습니다.');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            map.setView([userLocation.lat, userLocation.lng], 15);

            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
                radius: 10,
                fillColor: '#4285F4',
                color: 'white',
                weight: 3,
                fillOpacity: 1
            }).addTo(map).bindPopup('📍 현재 위치').openPopup();

            setStatus('위치 확인 완료. 버튼을 눌러 주변 자전거도로를 탐색하세요.');
        },
        () => {
            setStatus('위치 권한이 거부되었습니다. 브라우저 설정에서 위치 접근을 허용해주세요.');
        }
    );
}

async function findBikeRoads() {
    if (!userLocation) {
        setStatus('위치 정보가 없습니다. 잠시 후 다시 시도해주세요.');
        return;
    }

    const radiusKm = document.getElementById('radius').value;
    const radiusM = radiusKm * 1000;

    setStatus(`반경 ${radiusKm}km 내 자전거 도로를 불러오는 중... (최대 1분 소요)`);
    document.getElementById('find-btn').disabled = true;

    try {
        const res = await fetch(`/api/bike-roads?lat=${userLocation.lat}&lng=${userLocation.lng}&radius=${radiusM}`);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || `서버 오류 (${res.status})`);
        }

        const geojson = await res.json();

        if (bikeRoadsLayer) map.removeLayer(bikeRoadsLayer);

        bikeRoadsLayer = L.geoJSON(geojson, {
            style: (feature) => ({
                color: getRoadColor(feature.properties.highway),
                weight: getRoadWeight(feature.properties.highway),
                opacity: 0.85
            }),
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                const name = p.name || '이름 없는 도로';
                const type = getRoadLabel(p.highway);
                const len = p.length ? `${Math.round(p.length)}m` : '-';
                layer.bindPopup(`<b>${name}</b><br>유형: ${type}<br>길이: ${len}`);
            }
        }).addTo(map);

        const count = geojson.features.length;
        setStatus(`✅ ${count}개 구간의 자전거 도로를 찾았습니다.`);

    } catch (e) {
        setStatus(`오류: ${e.message}`);
    } finally {
        document.getElementById('find-btn').disabled = false;
    }
}

function getRoadColor(highway) {
    const map = {
        cycleway: '#00C853',
        path: '#64DD17',
        residential: '#2196F3',
        living_street: '#2196F3',
        service: '#FF9800',
        track: '#FF9800',
        footway: '#AB47BC',
    };
    return map[highway] || '#9E9E9E';
}

function getRoadWeight(highway) {
    return highway === 'cycleway' ? 5 : 3;
}

function getRoadLabel(highway) {
    const labels = {
        cycleway: '자전거전용도로',
        path: '자전거가능 경로',
        residential: '주거지 도로',
        living_street: '생활도로',
        service: '서비스 도로',
        track: '비포장 트랙',
        footway: '보행자/자전거 겸용',
    };
    return labels[highway] || highway || '기타';
}

function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}

document.getElementById('radius').addEventListener('input', (e) => {
    document.getElementById('radius-value').textContent = `${e.target.value} km`;
});

initMap();
getUserLocation();
