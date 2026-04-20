/* ═══ State ═══ */
const state = {
  mode: 'roads',
  userLocation: null,
  from: null,
  to: null,
  clickTarget: null,
};

/* ═══ Map ═══ */
let map, userMarker, bikeRoadsLayer, routeLayer, fromMarker, toMarker;

/* ═══ Init ═══ */
function initMap() {
  map = L.map('map', { zoomControl: true }).setView([37.5665, 126.9780], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19,
  }).addTo(map);
  map.on('click', onMapClick);
  document.addEventListener('click', e => {
    ['from','to'].forEach(f => {
      if (!e.target.closest(`#${f}-input`) && !e.target.closest(`#${f}-results`))
        hideResults(f);
    });
  });
  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchMode(t.dataset.mode))
  );
  document.getElementById('find-btn').addEventListener('click', findBikeRoads);
  document.getElementById('route-btn').addEventListener('click', findRoute);
  document.getElementById('clear-btn').addEventListener('click', clearRoute);
  document.getElementById('from-input').addEventListener('focus', () => onInputFocus('from'));
  document.getElementById('from-input').addEventListener('input', () => onInputChange('from'));
  document.getElementById('to-input').addEventListener('focus', () => onInputFocus('to'));
  document.getElementById('to-input').addEventListener('input', () => onInputChange('to'));
  document.getElementById('radius').addEventListener('input', e => {
    document.getElementById('radius-value').textContent = `${e.target.value} km`;
  });
  getUserLocation();
}

/* ═══ Geolocation ═══ */
function getUserLocation() {
  if (!navigator.geolocation) { setStatus('GPS 미지원'); return; }
  setStatus('GPS 탐색 중...');
  navigator.geolocation.getCurrentPosition(p => {
    state.userLocation = { lat: p.coords.latitude, lng: p.coords.longitude };
    map.setView([state.userLocation.lat, state.userLocation.lng], 15);
    updateUserMarker();
    setStatus('✅ 위치 확인 완료');
  }, () => setStatus('❌ 위치 권한 거부'), { enableHighAccuracy: true });
  navigator.geolocation.watchPosition(p => {
    state.userLocation = { lat: p.coords.latitude, lng: p.coords.longitude };
    updateUserMarker();
  });
}
function updateUserMarker() {
  if (!state.userLocation) return;
  const { lat, lng } = state.userLocation;
  userMarker && map.removeLayer(userMarker);
  userMarker = L.circleMarker([lat, lng], { radius:10, fillColor:'#4285F4', color:'white', weight:3, fillOpacity:1 })
    .addTo(map).bindPopup('📍 현재 위치');
}

/* ═══ Mode ═══ */
function switchMode(mode) {
  state.mode = mode;
  state.clickTarget = null;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  document.getElementById('roads-panel').classList.toggle('hidden', mode !== 'roads');
  document.getElementById('route-panel').classList.toggle('hidden', mode !== 'route');
  document.getElementById('map-hint').classList.add('hidden');
  setStatus(mode === 'route' ? '출발지/목적지를 입력하세요' : '');
}

/* ═══ Bike Roads ═══ */
async function findBikeRoads() {
  if (!state.userLocation) { setStatus('위치 정보 없음'); return; }
  const r = document.getElementById('radius').value;
  setStatus(`반경 ${r}km 탐색 중...`);
  document.getElementById('find-btn').disabled = true;
  try {
    const res = await fetch(`/api/cycleways?lat=${state.userLocation.lat}&lon=${state.userLocation.lng}&dist=${r*1000}`);
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    bikeRoadsLayer && map.removeLayer(bikeRoadsLayer);
    bikeRoadsLayer = L.geoJSON(d.geojson, {
      style: f => ({ color: getRoadColor(f.properties.highway), weight: getRoadWeight(f.properties.highway), opacity: 0.85 }),
      onEachFeature: (f, layer) => {
        const p = f.properties;
        layer.bindPopup(`<b>${p.name||'이름없음'}</b><br>${getRoadLabel(p.highway)}<br>${p.length?Math.round(p.length)+'m':'-'}`);
      },
    }).addTo(map);
    setStatus(`✅ ${d.count}개 구간 발견`);
    buildLegend();
  } catch(e) { setStatus(`❌ ${e.message}`); }
  finally { document.getElementById('find-btn').disabled = false; }
}

/* ═══ Legend ═══ */
function buildLegend() {
  const types = ['cycleway','path','footway','residential','living_street','service'];
  const legend = document.getElementById('legend');
  legend.innerHTML = types.map(t =>
    `<div class="legend-item"><div class="dot" style="background:${getRoadColor(t)}"></div>${getRoadLabel(t)}</div>`
  ).join('');
}

/* ═══ Route ═══ */
function applyWaypoint(field, loc) {
  state[field] = loc;
  placeWaypointMarker(field, loc);
  checkRouteReady();
  if (state.clickTarget === field) {
    state.clickTarget = field === 'from' ? 'to' : null;
    state.clickTarget ? showMapHint(state.clickTarget) : document.getElementById('map-hint').classList.add('hidden');
  }
}
function placeWaypointMarker(field, loc) {
  const icon = makeLetterIcon(field==='from'?'#00C853':'#F44336', field==='from'?'A':'B');
  (field==='from'?fromMarker:toMarker) && map.removeLayer(field==='from'?fromMarker:toMarker);
  const m = L.marker([loc.lat, loc.lng], {icon}).addTo(map).bindPopup(`${field==='from'?'출발':'도착'}: ${loc.label}`);
  field==='from'? fromMarker=m : toMarker=m;
}
function makeLetterIcon(c, l) {
  return L.divIcon({html:`<div class="wp-icon" style="background:${c}" data-letter="${l}"></div>`,
    iconSize:[28,36], iconAnchor:[14,36], className:''});
}
function checkRouteReady() {
  const btn = document.getElementById('route-btn');
  btn.classList.toggle('hidden', !(state.from&&state.to));
  btn.disabled = !(state.from&&state.to);
  document.getElementById('clear-btn').classList.toggle('hidden', !(state.from&&state.to));
}
function clearRoute() {
  state.from = null; state.to = null; state.clickTarget = null;
  ['from-input','to-input'].forEach(id => document.getElementById(id).value='');
  ['from','to'].forEach(f => hideResults(f));
  [fromMarker,toMarker,routeLayer].forEach(m => { if(m){ map.removeLayer(m); m=null; }});
  document.getElementById('route-stats').classList.add('hidden');
  document.getElementById('directions-panel').classList.add('hidden');
  document.getElementById('dir-toggle-btn').classList.add('hidden');
  checkRouteReady(); setStatus('');
}

async function findRoute() {
  if (!state.from||!state.to) return;
  setStatus('경로 계산 중...');
  document.getElementById('route-btn').disabled = true;
  document.getElementById('route-stats').classList.add('hidden');
  document.getElementById('directions-panel').classList.add('hidden');
  document.getElementById('dir-toggle-btn').classList.add('hidden');
  try {
    const u = `/api/route?from_lat=${state.from.lat}&from_lng=${state.from.lng}&to_lat=${state.to.lat}&to_lng=${state.to.lng}`;
    const res = await fetch(u);
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    routeLayer && map.removeLayer(routeLayer);
    routeLayer = L.layerGroup([
      L.geoJSON(d.route, { style: { color:'#FF6D00', weight:8, opacity:0.9 } }),
    ]).addTo(map);
    map.fitBounds(routeLayer.getLayers().length ? routeLayer.getBounds() : [[state.from.lat,state.from.lng],[state.to.lat,state.to.lng]], {padding:[50,50]});
    const dk = (d.distance/1000).toFixed(1), mn = Math.round(d.duration/60);
    document.getElementById('stat-dist').textContent = `${dk} km`;
    document.getElementById('stat-time').textContent = `약 ${mn}분`;
    document.getElementById('route-stats').classList.remove('hidden');
    if (d.steps?.length) {
      renderDirections(d.steps);
      document.getElementById('dir-toggle-btn').classList.remove('hidden');
    }
    setStatus(`✅ ${dk}km · 약 ${mn}분`);
  } catch(e) { setStatus(`❌ ${e.message}`); }
  finally { document.getElementById('route-btn').disabled = false; }
}

/* ═══ Directions ═══ */
function toggleDirections() {
  const p = document.getElementById('directions-panel');
  const b = document.getElementById('dir-toggle-btn');
  const s = p.classList.toggle('hidden');
  b.textContent = s ? '길안내 ▼' : '길안내 ▲';
}
function renderDirections(steps) {
  const icons = {'출발':'🚀','직진':'⬆️','우회전':'↪️','좌회전':'↩️','목적지':'🏁'};
  document.getElementById('directions-list').innerHTML = steps.map(s => {
    const icon = Object.entries(icons).find(([k]) => s.instruction.includes(k))?.[1] || '•';
    const dist = s.distance>=1000 ? `${(s.distance/1000).toFixed(1)}km`:s.distance?`${s.distance}m`:'';
    return `<div class="step-item"><div class="step-icon">${icon}</div><div class="step-body"><div class="step-instr">${s.instruction}</div>${dist?`<div class="step-dist">${dist}</div>`:''}</div></div>`;
  }).join('');
}

/* ═══ Geocoding ═══ */
const geoTimers = {};
function onInputFocus(f) { state.clickTarget=f; showMapHint(f); }
function onInputChange(f) {
  clearTimeout(geoTimers[f]);
  const q = document.getElementById(f+'-input').value.trim();
  if(q.length<2) { hideResults(f); return; }
  geoTimers[f] = setTimeout(() => doGeocode(f,q), 400);
}
async function doGeocode(f,q) {
  try {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    renderResults(f, await r.json());
  } catch {}
}
function renderResults(f, places) {
  const div = document.getElementById(f+'-results');
  if(!Array.isArray(places)||!places.length){ div.classList.add('hidden'); return; }
  div.innerHTML = places.slice(0,6).map(p => {
    const name=p.display_name||'', short=name.split(',')[0].trim(), sub=name.split(',').slice(1,3).join(',');
    const esc = s => s.replace(/'/g,'&apos;');
    return `<div class="result-item" onclick="selectPlace(${p.lat},${p.lon},'${esc(short)}','${f}')">
      <span class="result-ico">${getTypeIcon(p.type,p.class)}</span>
      <div class="result-text"><div class="result-name">${esc(short)}</div>${sub?`<div class="result-sub">${esc(sub)}</div>`:''}</div></div>`;
  }).join('');
  div.classList.remove('hidden');
}
function selectPlace(lat,lon,label,f) {
  applyWaypoint(f, {lat,lng:parseFloat(lon),label});
  document.getElementById(f+'-input').value=label; hideResults(f); map.setView([lat,parseFloat(lon)],16);
}
function hideResults(f) { document.getElementById(f+'-results').classList.add('hidden'); }
function getTypeIcon(t,c) {
  if(c==='railway'||t==='station') return '🚉';
  if(c==='amenity'){const m={restaurant:'🍽',cafe:'☕',hospital:'🏥',school:'🏫'};return m[t]||'🏢';}
  if(c==='leisure'||t==='park') return '🌳';
  if(c==='highway') return '🛣';
  return '📍';
}

/* ═══ Map Click ═══ */
function onMapClick(e) {
  if(state.mode!=='route') return;
  const {lat,lng}=e.latlng;
  const f=state.clickTarget||(state.from?'to':'from');
  applyWaypoint(f,{lat,lng,label:`${lat.toFixed(5)}, ${lng.toFixed(5)}`});
  document.getElementById(f+'-input').value=`${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  hideResults(f);
}
function showMapHint(f) {
  document.getElementById('map-hint-text').textContent=`지도를 클릭하여 ${f==='from'?'출발지':'목적지'} 설정`;
  document.getElementById('map-hint').classList.remove('hidden');
}
function cancelMapClick(){ state.clickTarget=null; document.getElementById('map-hint').classList.add('hidden'); }

/* ═══ Helpers ═══ */
function getRoadColor(h){return({'cycleway':'#00C853','path':'#64DD17','residential':'#2196F3','living_street':'#2196F3','service':'#FF9800','footway':'#AB47BC'}[h])||'#9E9E9E';}
function getRoadWeight(h){return h==='cycleway'?5:3;}
function getRoadLabel(h){return({'cycleway':'자전거전용도로','path':'자전거가능','residential':'주거도로','living_street':'생활도로','service':'서비스도로','footway':'보행자겸용'}[h])||h||'기타';}
function setStatus(m){ document.getElementById('status').textContent=m; }
function useMyLocation(f){
  if(!state.userLocation){setStatus('위치 정보 없음');return;}
  applyWaypoint(f,{...state.userLocation,label:'현재 위치'});
  document.getElementById(f+'-input').value='현재 위치';
}
initMap();