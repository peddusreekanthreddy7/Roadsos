/* ── RoadSoS Drive Mode — Google-Maps-style navigation ─────────────
   Implements the blueprint's "Trojan Horse" approach: app works as a
   daily-driving navigation companion so it's already open when an
   emergency happens.

   Uses 100% free services (per Blueprint §6):
   - Nominatim (OSM geocoding)  https://nominatim.openstreetmap.org
   - OSRM public demo (routing) https://router.project-osrm.org
*/

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM      = 'https://router.project-osrm.org/route/v1/driving';

let routeLayer = null;
let destMarker = null;
let currentRoute = null;
let navWatchId = null;
let navStartedAt = null;

/* ── Search (geocoding) ─────────────────────────────────────────── */
let searchTimer = null;
function onSearchInput(e) {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (q.length < 3) {
    document.getElementById('searchResults').classList.add('hidden');
    return;
  }
  searchTimer = setTimeout(() => doSearch(q), 350);
}

async function doSearch(q) {
  const box = document.getElementById('searchResults');
  box.innerHTML = '<div class="sr-loading">🔍 Searching…</div>';
  box.classList.remove('hidden');

  // Cache key — last-mile offline
  const cacheKey = `roadsos_geo_${q.toLowerCase()}`;
  let results;
  try {
    if (navigator.onLine) {
      const lat = window.currentLat || 20;
      const lon = window.currentLon || 78;
      const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=6&viewbox=${lon-1},${lat+1},${lon+1},${lat-1}&bounded=0`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      results = await res.json();
      try { localStorage.setItem(cacheKey, JSON.stringify({ results, ts: Date.now() })); } catch(e){}
    } else {
      const raw = localStorage.getItem(cacheKey);
      results = raw ? JSON.parse(raw).results : [];
    }
  } catch (e) {
    // Network died — try cache
    const raw = localStorage.getItem(cacheKey);
    results = raw ? JSON.parse(raw).results : [];
  }

  if (!results?.length) {
    box.innerHTML = '<div class="sr-empty">No places found. Try a different name.</div>';
    return;
  }

  box.innerHTML = results.map((r, i) => `
    <div class="sr-item" onclick="pickDestination(${i})">
      <span class="sr-ico">📍</span>
      <div class="sr-body">
        <strong>${escapeHtml(r.display_name.split(',')[0])}</strong>
        <span>${escapeHtml(r.display_name.split(',').slice(1).join(',').trim())}</span>
      </div>
    </div>`).join('');
  window._lastSearch = results;
}

function pickDestination(idx) {
  const r = window._lastSearch?.[idx];
  if (!r) return;
  document.getElementById('searchInput').value = r.display_name.split(',')[0];
  document.getElementById('searchResults').classList.add('hidden');
  setDestination(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').classList.add('hidden');
  clearRoute();
  document.getElementById('routeInfo')?.classList.add('hidden');
}

/* ── Routing (OSRM) ─────────────────────────────────────────────── */
async function setDestination(lat, lon, label) {
  if (!window.currentLat || !window.currentLon) {
    showToast?.('Waiting for your location…');
    return;
  }
  // Drop pin
  if (destMarker) window.map.removeLayer(destMarker);
  destMarker = L.marker([lat, lon], {
    icon: L.divIcon({
      className: '',
      html: '<div class="dest-pin">📍</div>',
      iconSize: [40, 40], iconAnchor: [20, 36],
    })
  }).addTo(window.map).bindPopup(`<strong>${escapeHtml(label)}</strong>`);

  await calculateAndDrawRoute(window.currentLat, window.currentLon, lat, lon, label);
}

async function calculateAndDrawRoute(fromLat, fromLon, toLat, toLon, label) {
  const cacheKey = `roadsos_route_${fromLat.toFixed(3)}_${fromLon.toFixed(3)}_${toLat.toFixed(3)}_${toLon.toFixed(3)}`;
  let data;

  try {
    if (navigator.onLine) {
      const url = `${OSRM}/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      data = await res.json();
      try { localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })); } catch(e){}
    } else {
      const raw = localStorage.getItem(cacheKey);
      data = raw ? JSON.parse(raw).data : null;
      if (!data) { showToast?.('No cached route — connect to internet once'); return; }
    }
  } catch (e) {
    const raw = localStorage.getItem(cacheKey);
    if (raw) data = JSON.parse(raw).data;
    else { showToast?.('Could not get route'); return; }
  }

  const route = data?.routes?.[0];
  if (!route) { showToast?.('No route found'); return; }
  currentRoute = { ...route, destination: label, destLat: toLat, destLon: toLon };

  drawRoute(route.geometry);
  showRouteInfo(route, label);
}

function drawRoute(geojson) {
  if (routeLayer) window.map.removeLayer(routeLayer);
  routeLayer = L.geoJSON(geojson, {
    style: { color: '#1d3557', weight: 6, opacity: 0.85 }
  }).addTo(window.map);
  // Add white outline for visibility
  const outline = L.geoJSON(geojson, {
    style: { color: '#fff', weight: 10, opacity: 0.9 }
  });
  routeLayer.bringToFront();
  // Fit map to route
  window.map.fitBounds(routeLayer.getBounds(), { padding: [60, 60] });
}

function clearRoute() {
  if (routeLayer) { window.map.removeLayer(routeLayer); routeLayer = null; }
  if (destMarker) { window.map.removeLayer(destMarker); destMarker = null; }
  currentRoute = null;
}

function showRouteInfo(route, label) {
  const km   = (route.distance / 1000).toFixed(1);
  const mins = Math.round(route.duration / 60);
  const eta  = new Date(Date.now() + route.duration * 1000)
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const info = document.getElementById('routeInfo');
  info.innerHTML = `
    <div class="ri-row">
      <div class="ri-stats">
        <span class="ri-time">${mins} min</span>
        <span class="ri-dist">${km} km · arrives ${eta}</span>
        <span class="ri-dest">to ${escapeHtml(label.split(',')[0])}</span>
      </div>
      <div class="ri-actions">
        <button class="ri-start" onclick="startNavigation()">▶ Start</button>
        <button class="ri-clear" onclick="clearSearch()">✕</button>
      </div>
    </div>
  `;
  info.classList.remove('hidden');
}

/* ── Turn-by-Turn Navigation ────────────────────────────────────── */
function startNavigation() {
  if (!currentRoute) return;
  navStartedAt = Date.now();
  document.body.classList.add('navigating');
  document.getElementById('navTurn').classList.remove('hidden');
  showToast?.('🧭 Navigation started — drive safe');
  logHandoffEvent?.(`Navigation started to ${currentRoute.destination}`);

  // Speak first instruction
  const firstStep = currentRoute.legs?.[0]?.steps?.[0];
  if (firstStep) announceStep(firstStep);
  updateTurnByTurn(0);

  // Watch position to step through instructions
  if (navigator.geolocation) {
    if (navWatchId) navigator.geolocation.clearWatch(navWatchId);
    navWatchId = navigator.geolocation.watchPosition(
      onNavPosition,
      () => {},
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
  }
}

function stopNavigation() {
  document.body.classList.remove('navigating');
  document.getElementById('navTurn').classList.add('hidden');
  if (navWatchId) { navigator.geolocation.clearWatch(navWatchId); navWatchId = null; }
  showToast?.('Navigation ended');
}

function onNavPosition(pos) {
  window.currentLat = pos.coords.latitude;
  window.currentLon = pos.coords.longitude;

  // Find closest upcoming step
  const steps = currentRoute?.legs?.[0]?.steps;
  if (!steps?.length) return;

  let bestIdx = 0, bestDist = Infinity;
  steps.forEach((s, i) => {
    const sLat = s.maneuver.location[1];
    const sLon = s.maneuver.location[0];
    const d = haversine(window.currentLat, window.currentLon, sLat, sLon);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  });

  // If within 30m of a step we haven't announced, announce it
  const step = steps[bestIdx];
  if (bestDist < 50 && step._announced !== true) {
    step._announced = true;
    announceStep(step);
  }
  updateTurnByTurn(bestIdx, bestDist);

  // Reached destination
  if (bestIdx === steps.length - 1 && bestDist < 30) {
    showToast?.('🏁 You have arrived');
    speakWarning?.('You have arrived at your destination.');
    stopNavigation();
  }
}

function updateTurnByTurn(stepIdx, distToStep) {
  const steps = currentRoute?.legs?.[0]?.steps;
  const step = steps?.[stepIdx];
  if (!step) return;
  const next = steps[stepIdx + 1];
  const arrow = maneuverArrow(step.maneuver?.modifier, step.maneuver?.type);
  const distText = distToStep ? `${Math.round(distToStep)} m` : '';
  document.getElementById('navTurn').innerHTML = `
    <div class="nt-arrow">${arrow}</div>
    <div class="nt-body">
      <div class="nt-instr">${escapeHtml(step.maneuver?.instruction || stepDescription(step))}</div>
      <div class="nt-meta">${distText}${next ? ' · next: ' + escapeHtml(stepDescription(next).slice(0, 40)) : ''}</div>
    </div>
    <button class="nt-stop" onclick="stopNavigation()">✕</button>
  `;
}

function announceStep(step) {
  const text = step.maneuver?.instruction || stepDescription(step);
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0; u.volume = 1.0;
    speechSynthesis.speak(u);
  }
}

function stepDescription(step) {
  const m = step.maneuver || {};
  const type = m.type || 'continue';
  const mod = m.modifier ? ` ${m.modifier}` : '';
  const road = step.name ? ` onto ${step.name}` : '';
  return `${type[0].toUpperCase()}${type.slice(1)}${mod}${road}`;
}

function maneuverArrow(modifier, type) {
  if (type === 'arrive') return '🏁';
  if (type === 'depart') return '🟢';
  switch (modifier) {
    case 'left':         return '⬅️';
    case 'right':        return '➡️';
    case 'sharp left':   return '↩️';
    case 'sharp right':  return '↪️';
    case 'slight left':  return '↖️';
    case 'slight right': return '↗️';
    case 'uturn':        return '🔄';
    case 'straight':     return '⬆️';
    default:             return '➡️';
  }
}

/* ── Tiny helper ────────────────────────────────────────────────── */
function escapeHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Drawer toggle (hide emergency UI by default) ───────────────── */
function toggleDrawer() {
  document.body.classList.toggle('drawer-open');
}
function closeDrawer() {
  document.body.classList.remove('drawer-open');
}

/* ── PWA Install prompt (Android/Chrome) ─────────────────────────── */
let _installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _installPrompt = e;
  // Show our custom install banner unless user dismissed it before
  if (!localStorage.getItem('roadsos_install_dismissed')) {
    document.getElementById('installBanner')?.classList.remove('hidden');
  }
});
function installPwa() {
  if (!_installPrompt) {
    showToast?.('Tap the browser menu → "Install app" or "Add to Home screen"');
    return;
  }
  _installPrompt.prompt();
  _installPrompt.userChoice.then((choice) => {
    if (choice.outcome === 'accepted') {
      showToast?.('🎉 Installing RoadSoS...');
      document.getElementById('installBanner')?.classList.add('hidden');
    }
    _installPrompt = null;
  });
}
function dismissInstall() {
  localStorage.setItem('roadsos_install_dismissed', '1');
  document.getElementById('installBanner')?.classList.add('hidden');
}

// Listen for ?action=sos / ?action=drive / ?action=firstaid (PWA shortcuts)
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const action = params.get('action');
  if (action === 'sos')      setTimeout(() => triggerSOS?.(), 600);
  if (action === 'firstaid') setTimeout(() => openFirstAid?.(), 600);
  if (action === 'drive')    setTimeout(() => document.getElementById('searchInput')?.focus(), 400);
});
