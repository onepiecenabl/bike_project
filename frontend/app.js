// ── State ─────────────────────────────────────────────────────────────────────

const state = {
    mode: 'roads',
    userLocation: null,
    from: null,   // { lat, lng, label }
    to:   null,   // { lat, lng, label }
    clickTarget: null, // 'from' | 'to' | null — which field receives next map click
};

// ── Map Layers ────────────────────────────────────────────────────────────────

let map, userMarker, bikeRoadsLayer, routeLayer, fromMarker, toMarker;

// ── Geocode Debounce Timers ───────────────────────────────────────────────────

const geoTimers = { from: null, to: null };

// ── Initialization ────────────────────────────────────────────────────────────

function initMap() {
    map = L.map('map', { zoomControl: true }).setView([37.5665, 126.9780], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
    }).addTo(map);

    map.on('click', onMapClick);

    // Close search dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        ['from', 'to'].forEach(f => {
            if (!e.target.closest(`#${f}-input`) && !e.target.closest(`#${f}-results`)) {
                hideResults(f);
            }
        });
    });

    getUserLocation();
}

// ── Geolocation ───────────────────────────────────────────────────────────────

function getUserLocation() {
    if (!navigator.geolocation) {
        setStatus('이 브라우저는 GPS를 지원하지 않습니다.');
        return;
    }
    setStatus('GPS 위치를 가져오는 중...');

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            map.setView([state.userLocation.lat, state.userLocation.lng], 15);
            updateUserMarker();
            setStatus('위치 확인 완료. 자전거도로를 탐색하거나 경로를 찾아보세요.');
        },
        () => {
            setStatus('위치 권한이 거부되었습니다. 지도에서 직접 위치를 선택하세요.');
        },
        { enableHighAccuracy: true }
    );

    // Live tracking
    navigator.geolocation.watchPosition((pos) => {
        state.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        updateUserMarker();
    });
}

function updateUserMarker() {
    if (!state.userLocation) return;
    const { lat, lng } = state.userLocation;
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([lat, lng], {
        radius: 10, fillColor: '#4285F4', color: 'white', weight: 3, fillOpacity: 1,
    }).addTo(map).bindPopup('📍 현재 위치');
}

function useMyLocation(field) {
    if (!state.userLocation) { setStatus('아직 위치 정보가 없습니다.'); return; }
    const loc = { ...state.userLocation, label: '현재 위치' };
    applyWaypoint(field, loc);
    document.getElementById(field + '-input').value = '현재 위치';
}

// ── Mode Switching ────────────────────────────────────────────────────────────

function switchMode(mode) {
    state.mode = mode;
    state.clickTarget = null;
    document.querySelectorAll('.tab').forEach(t =>
        t.classList.toggle('active', t.dataset.mode === mode)
    );
    document.getElementById('roads-panel').classList.toggle('hidden', mode !== 'roads');
    document.getElementById('route-panel').classList.toggle('hidden', mode !== 'route');
    document.getElementById('map-hint').classList.add('hidden');

    if (mode === 'route') {
        setStatus('출발지와 목적지를 입력하거나 지도를 클릭해 설정하세요.');
    } else {
        setStatus('');
    }
}

// ── Roads Mode ────────────────────────────────────────────────────────────────

async function findBikeRoads() {
    if (!state.userLocation) {
        setStatus('위치 정보가 없습니다. 잠시 후 다시 시도해주세요.');
        return;
    }
    const radiusKm = document.getElementById('radius').value;
    const radiusM  = radiusKm * 1000;
    setStatus(`반경 ${radiusKm}km 내 자전거 도로 불러오는 중... (최대 1분 소요)`);
    const btn = document.getElementById('find-btn');
    btn.disabled = true;

    try {
        const res = await fetch(`/api/bike-roads?lat=${state.userLocation.lat}&lng=${state.userLocation.lng}&radius=${radiusM}`);
        if (!res.ok) throw new Error((await res.json()).detail || `서버 오류 ${res.status}`);
        const geojson = await res.json();

        if (bikeRoadsLayer) map.removeLayer(bikeRoadsLayer);
        bikeRoadsLayer = L.geoJSON(geojson, {
            style: f => ({
                color:   getRoadColor(f.properties.highway),
                weight:  getRoadWeight(f.properties.highway),
                opacity: 0.85,
            }),
            onEachFeature: (f, layer) => {
                const p = f.properties;
                const name = p.name || '이름 없는 도로';
                const type = getRoadLabel(p.highway);
                const len  = p.length ? Math.round(p.length) + 'm' : '-';
                layer.bindPopup(`<b>${name}</b><br>${type}<br>${len}`);
            },
        }).addTo(map);

        setStatus(`✅ ${geojson.features.length}개 구간의 자전거 도로를 찾았습니다.`);
    } catch (e) {
        setStatus(`오류: ${e.message}`);
    } finally {
        btn.disabled = false;
    }
}

// ── Route Mode: Waypoints ─────────────────────────────────────────────────────

function applyWaypoint(field, loc) {
    state[field] = loc;
    placeWaypointMarker(field, loc);
    checkRouteReady();
    // Auto-advance click target
    if (state.clickTarget === field) {
        state.clickTarget = field === 'from' ? 'to' : null;
        if (state.clickTarget) {
            showMapHint(state.clickTarget);
        } else {
            document.getElementById('map-hint').classList.add('hidden');
        }
    }
}

function placeWaypointMarker(field, loc) {
    if (field === 'from') {
        if (fromMarker) map.removeLayer(fromMarker);
        fromMarker = L.marker([loc.lat, loc.lng], { icon: makeLetterIcon('#00C853', 'A') })
            .addTo(map).bindPopup(`출발: ${loc.label}`);
    } else {
        if (toMarker) map.removeLayer(toMarker);
        toMarker = L.marker([loc.lat, loc.lng], { icon: makeLetterIcon('#F44336', 'B') })
            .addTo(map).bindPopup(`도착: ${loc.label}`);
    }
}

function makeLetterIcon(color, letter) {
    return L.divIcon({
        html: `<div class="wp-icon" style="background:${color}"><span>${letter}</span></div>`,
        iconSize:   [28, 36],
        iconAnchor: [14, 36],
        className:  '',
    });
}

function checkRouteReady() {
    document.getElementById('route-btn').disabled = !(state.from && state.to);
}

function clearRoute() {
    state.from = null;
    state.to   = null;
    state.clickTarget = null;
    ['from-input', 'to-input'].forEach(id => { document.getElementById(id).value = ''; });
    ['from-results', 'to-results'].forEach(id => hideResults(id.replace('-results', '')));
    if (fromMarker)  { map.removeLayer(fromMarker); fromMarker = null; }
    if (toMarker)    { map.removeLayer(toMarker);   toMarker   = null; }
    if (routeLayer)  { map.removeLayer(routeLayer); routeLayer = null; }
    document.getElementById('route-stats').classList.add('hidden');
    document.getElementById('directions-panel').classList.add('hidden');
    document.getElementById('map-hint').classList.add('hidden');
    checkRouteReady();
    setStatus('');
}

// ── Route Calculation ─────────────────────────────────────────────────────────

async function findRoute() {
    if (!state.from || !state.to) return;

    setStatus('경로 계산 중... (처음 요청 시 1~2분 소요될 수 있습니다)');
    const btn = document.getElementById('route-btn');
    btn.disabled = true;
    document.getElementById('route-stats').classList.add('hidden');
    document.getElementById('directions-panel').classList.add('hidden');

    try {
        const { lat: fLat, lng: fLng } = state.from;
        const { lat: tLat, lng: tLng } = state.to;
        const url = `/api/route?from_lat=${fLat}&from_lng=${fLng}&to_lat=${tLat}&to_lng=${tLng}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json()).detail || `서버 오류 ${res.status}`);

        const data = await res.json();

        // Draw route
        if (routeLayer) map.removeLayer(routeLayer);
        routeLayer = L.geoJSON(data.route, {
            style: { color: '#FF6D00', weight: 7, opacity: 0.9 },
        }).addTo(map);
        map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });

        // Stats
        const distKm = (data.distance / 1000).toFixed(1);
        const mins   = Math.round(data.duration / 60);
        document.getElementById('stat-dist').textContent = `${distKm} km`;
        document.getElementById('stat-time').textContent = `약 ${mins}분`;
        document.getElementById('route-stats').classList.remove('hidden');

        // Directions
        renderDirections(data.steps);
        setStatus(`✅ 경로 완료 · ${distKm}km · 약 ${mins}분`);

    } catch (e) {
        setStatus(`오류: ${e.message}`);
    } finally {
        btn.disabled = false;
    }
}

// ── Directions Panel ──────────────────────────────────────────────────────────

const TURN_ICONS = {
    '출발':     '🚀',
    '직진':     '⬆️',
    '우회전':   '↪️',
    '우측으로': '↗️',
    '좌회전':   '↩️',
    '좌측으로': '↖️',
    '유턴':     '🔄',
    '목적지 도착': '🏁',
};

function getTurnIcon(instruction) {
    for (const [key, icon] of Object.entries(TURN_ICONS)) {
        if (instruction.startsWith(key)) return icon;
    }
    return '•';
}

function renderDirections(steps) {
    const list = document.getElementById('directions-list');
    list.innerHTML = steps.map((s, i) => {
        const icon    = getTurnIcon(s.instruction);
        const distStr = s.distance >= 1000
            ? `${(s.distance / 1000).toFixed(1)} km`
            : s.distance > 0 ? `${s.distance} m` : '';
        return `
        <div class="step-item">
            <div class="step-icon">${icon}</div>
            <div class="step-body">
                <div class="step-instr">${s.instruction}</div>
                ${distStr ? `<div class="step-dist">${distStr} 이동</div>` : ''}
            </div>
        </div>`;
    }).join('');
}

function toggleDirections() {
    const panel = document.getElementById('directions-panel');
    const btn   = document.getElementById('dir-toggle-btn');
    const show  = panel.classList.toggle('hidden');
    if (btn) btn.textContent = show ? '길안내 ▲' : '길안내 ▼';
}

// ── Geocoding / Address Search ─────────────────────────────────────────────────

function onInputFocus(field) {
    if (state.mode !== 'route') return;
    state.clickTarget = field;
    showMapHint(field);
}

function onInputChange(field) {
    clearTimeout(geoTimers[field]);
    const q = document.getElementById(field + '-input').value.trim();
    if (q.length < 2) { hideResults(field); return; }
    geoTimers[field] = setTimeout(() => doGeocode(field, q), 400);
}

async function doGeocode(field, q) {
    try {
        const res    = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const places = await res.json();
        renderResults(field, places);
    } catch { /* silent */ }
}

function renderResults(field, places) {
    const div = document.getElementById(field + '-results');
    if (!Array.isArray(places) || !places.length) { div.classList.add('hidden'); return; }

    div.innerHTML = places.slice(0, 6).map(p => {
        const name    = p.display_name || '';
        const short   = name.split(',')[0].trim();
        const sub     = name.split(',').slice(1, 3).join(',').trim();
        const safeN   = short.replace(/'/g, '&#39;');
        const safeFull = name.replace(/'/g, '&#39;');
        return `
        <div class="result-item" onclick="selectPlace(${p.lat}, ${p.lon}, '${safeN}', '${field}')">
            <span class="result-ico">${getTypeIcon(p.type, p.class)}</span>
            <div class="result-text">
                <div class="result-name">${short}</div>
                ${sub ? `<div class="result-sub">${sub}</div>` : ''}
            </div>
        </div>`;
    }).join('');
    div.classList.remove('hidden');
}

function selectPlace(lat, lon, label, field) {
    const loc = { lat: parseFloat(lat), lng: parseFloat(lon), label };
    applyWaypoint(field, loc);
    document.getElementById(field + '-input').value  = label;
    hideResults(field);
    map.setView([lat, lon], 16);
}

function hideResults(field) {
    document.getElementById(field + '-results').classList.add('hidden');
}

function getTypeIcon(type, cls) {
    if (cls === 'railway' || type === 'station') return '🚉';
    if (cls === 'amenity') {
        const m = { restaurant: '🍽', cafe: '☕', hospital: '🏥', school: '🏫', pharmacy: '💊' };
        return m[type] || '🏢';
    }
    if (cls === 'leisure' || type === 'park') return '🌳';
    if (cls === 'highway') return '🛣';
    return '📍';
}

// ── Map Click ─────────────────────────────────────────────────────────────────

function onMapClick(e) {
    if (state.mode !== 'route') return;
    const { lat, lng } = e.latlng;
    const field  = state.clickTarget || (state.from ? 'to' : 'from');
    const label  = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    applyWaypoint(field, { lat, lng, label });
    document.getElementById(field + '-input').value = label;
    hideResults(field);
}

function showMapHint(field) {
    const hint = document.getElementById('map-hint');
    document.getElementById('map-hint-text').textContent =
        `지도를 클릭하여 ${field === 'from' ? '출발지' : '목적지'}를 설정하세요`;
    hint.classList.remove('hidden');
}

function cancelMapClick() {
    state.clickTarget = null;
    document.getElementById('map-hint').classList.add('hidden');
}

// ── Road Color Helpers ────────────────────────────────────────────────────────

function getRoadColor(h) {
    return ({ cycleway: '#00C853', path: '#64DD17', residential: '#2196F3',
               living_street: '#2196F3', service: '#FF9800', track: '#FF9800',
               footway: '#AB47BC' })[h] || '#9E9E9E';
}

function getRoadWeight(h) { return h === 'cycleway' ? 5 : 3; }

function getRoadLabel(h) {
    return ({ cycleway: '자전거전용도로', path: '자전거가능 경로',
               residential: '주거지 도로', living_street: '생활도로',
               service: '서비스 도로', track: '비포장 트랙', footway: '보행자/자전거 겸용' })[h]
           || h || '기타';
}

// ── Status ────────────────────────────────────────────────────────────────────

function setStatus(msg) {
    document.getElementById('status').textContent = msg;
}

// ── Listeners & Boot ──────────────────────────────────────────────────────────

document.getElementById('radius').addEventListener('input', e => {
    document.getElementById('radius-value').textContent = `${e.target.value} km`;
});

initMap();
