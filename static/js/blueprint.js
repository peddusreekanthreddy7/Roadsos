/* ── RoadSoS Blueprint Features ───────────────────────────────────
   Implements features from RoadSOS Product Architecture Blueprint:
   - Auto-SOS Night Beacon (red screen strobe + wake-lock after sunset)
   - Paramedic Handoff Card (structured medical log)
   - Hazmat / EV Fire Protocol (keyword override)
   - Mass Casualty Incident (MCI) Mode
   - Geo-Fenced Hazard Broadcast (2km proximity alerts)
   - Trojan Horse Navigation mode
*/

/* ════════════════════════════════════════════════════════════════
   1. AUTO-SOS NIGHT BEACON
   ════════════════════════════════════════════════════════════════ */
let beaconActive = false;
let beaconInterval = null;
let beaconWakeLock = null;
let beaconTorchTrack = null;

function isAfterSunset() {
  const h = new Date().getHours();
  return h >= 18 || h < 6;
}

function activateNightBeaconIfDark() {
  if (isAfterSunset()) activateNightBeacon();
}

async function activateNightBeacon() {
  if (beaconActive) return;
  beaconActive = true;

  // Try torch (rear camera LED) — best-effort
  startTorchStrobe();

  // Acquire wake-lock so screen stays on
  if ('wakeLock' in navigator) {
    try { beaconWakeLock = await navigator.wakeLock.request('screen'); }
    catch (e) { console.warn('wake-lock failed', e); }
  }

  // Full-screen red strobe overlay
  let overlay = document.getElementById('nightBeacon');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'nightBeacon';
    overlay.className = 'night-beacon';
    overlay.innerHTML = `
      <div class="beacon-content">
        <div class="beacon-icon">🚨</div>
        <div class="beacon-title">EMERGENCY BEACON ACTIVE</div>
        <div class="beacon-sub">Phone visible as roadside warning flare</div>
        <button class="beacon-stop" onclick="deactivateNightBeacon()">Stop Beacon</button>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.classList.remove('hidden');

  // Flash red ↔ white every 400ms
  let flip = false;
  beaconInterval = setInterval(() => {
    flip = !flip;
    overlay.style.background = flip ? '#e63946' : '#ffffff';
    overlay.style.color = flip ? '#ffffff' : '#e63946';
  }, 400);

  // Continuous vibration pattern
  if (navigator.vibrate) {
    const pulseVibe = () => navigator.vibrate([300, 100, 300, 100, 800]);
    pulseVibe();
    overlay._vibeTimer = setInterval(pulseVibe, 2000);
  }

  showToast?.('🚨 Night Beacon ON — phone is now a warning flare');
  logHandoffEvent('Auto-SOS Night Beacon activated');
}

async function startTorchStrobe() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.();
    if (!caps?.torch) { track.stop(); return; }
    beaconTorchTrack = track;
    let on = false;
    beaconTorchTrack._timer = setInterval(async () => {
      on = !on;
      try { await track.applyConstraints({ advanced: [{ torch: on }] }); } catch(e){}
    }, 250);
  } catch (e) { /* permission denied / no camera */ }
}

function deactivateNightBeacon() {
  beaconActive = false;
  clearInterval(beaconInterval);
  const overlay = document.getElementById('nightBeacon');
  if (overlay) {
    overlay.classList.add('hidden');
    if (overlay._vibeTimer) clearInterval(overlay._vibeTimer);
  }
  if (beaconWakeLock) {
    beaconWakeLock.release().catch(()=>{});
    beaconWakeLock = null;
  }
  if (beaconTorchTrack) {
    clearInterval(beaconTorchTrack._timer);
    beaconTorchTrack.applyConstraints({ advanced: [{ torch: false }] }).catch(()=>{});
    beaconTorchTrack.stop();
    beaconTorchTrack = null;
  }
  if (navigator.vibrate) navigator.vibrate(0);
}

/* ════════════════════════════════════════════════════════════════
   2. PARAMEDIC HANDOFF CARD
   ════════════════════════════════════════════════════════════════ */
let handoffLog = {
  incidentStart: null,
  consciousState: 'Unknown',
  events: [],
  firstAid: [],
};

function ensureIncidentStarted() {
  if (!handoffLog.incidentStart) {
    handoffLog.incidentStart = Date.now();
  }
}

function logHandoffEvent(text) {
  ensureIncidentStarted();
  const time = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  handoffLog.events.push({ time, text });
  // Persist so paramedics can recover after page reload
  try { localStorage.setItem('roadsos_handoff', JSON.stringify(handoffLog)); } catch(e){}
}

function logFirstAid(text) {
  ensureIncidentStarted();
  const time = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  handoffLog.firstAid.push({ time, text });
  try { localStorage.setItem('roadsos_handoff', JSON.stringify(handoffLog)); } catch(e){}
}

function setConsciousState(state) {
  ensureIncidentStarted();
  handoffLog.consciousState = state;
  try { localStorage.setItem('roadsos_handoff', JSON.stringify(handoffLog)); } catch(e){}
}

function restoreHandoff() {
  try {
    const raw = localStorage.getItem('roadsos_handoff');
    if (raw) handoffLog = JSON.parse(raw);
  } catch(e){}
}

function openHandoffCard() {
  ensureIncidentStarted();
  const modal = document.getElementById('handoffModal');
  const start = handoffLog.incidentStart ? new Date(handoffLog.incidentStart) : new Date();
  const startStr = start.toLocaleString();
  const elapsed = Math.floor((Date.now() - start.getTime()) / 60000);
  const lat = (window.currentLat ?? '—');
  const lon = (window.currentLon ?? '—');
  const loc = window.locationInfo?.location || {};

  modal.querySelector('.handoff-body').innerHTML = `
    <div class="handoff-card-print">
      <div class="ho-row"><span class="ho-k">Incident Started</span><span class="ho-v">${startStr}</span></div>
      <div class="ho-row"><span class="ho-k">Elapsed</span><span class="ho-v">${elapsed} min</span></div>
      <div class="ho-row"><span class="ho-k">Conscious State</span><span class="ho-v">${handoffLog.consciousState}</span></div>
      <div class="ho-row"><span class="ho-k">GPS</span><span class="ho-v">${lat}, ${lon}</span></div>
      <div class="ho-row"><span class="ho-k">Location</span><span class="ho-v">${[loc.city, loc.country].filter(Boolean).join(', ') || '—'}</span></div>

      <div class="ho-section">First Aid Conducted</div>
      ${handoffLog.firstAid.length
        ? handoffLog.firstAid.map(e=>`<div class="ho-event">• <strong>${e.time}</strong> — ${escHtml(e.text)}</div>`).join('')
        : '<div class="ho-event ho-empty">None recorded</div>'}

      <div class="ho-section">Timeline</div>
      ${handoffLog.events.length
        ? handoffLog.events.map(e=>`<div class="ho-event">• <strong>${e.time}</strong> — ${escHtml(e.text)}</div>`).join('')
        : '<div class="ho-event ho-empty">No events logged</div>'}
    </div>
  `;
  modal.classList.remove('hidden');
}

function closeHandoffCard() {
  document.getElementById('handoffModal').classList.add('hidden');
}

function setHandoffConscious(state, btn) {
  setConsciousState(state);
  logHandoffEvent(`Conscious state updated: ${state}`);
  document.querySelectorAll('.cs-btn').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');
  openHandoffCard();
}

function resetHandoff() {
  handoffLog = { incidentStart: null, consciousState: 'Unknown', events: [], firstAid: [] };
  try { localStorage.removeItem('roadsos_handoff'); } catch(e){}
  closeHandoffCard();
  showToast?.('Handoff log cleared');
}

/* ════════════════════════════════════════════════════════════════
   3. HAZMAT / EV FIRE PROTOCOL  +  4. MCI MODE
   ════════════════════════════════════════════════════════════════ */
const HAZMAT_KEYWORDS = /\b(tanker|hazmat|chemical|fuel\s+spill|gas\s+leak|ev\s+fire|electric\s+vehicle.*fire|lithium|battery\s+fire|thermal\s+runaway|explosion|leaking\s+(petrol|diesel|gas|fuel))\b/i;
const MCI_KEYWORDS = /\b(bus\s+(rollover|crash|overturn)|pile.?up|pileup|multiple\s+(vehicles|cars|victims|casualties)|mass\s+casualty|many\s+injured|train\s+(crash|derailment))\b/i;

function checkProtocolOverrides(text) {
  if (HAZMAT_KEYWORDS.test(text)) { showHazmatOverride(); return 'hazmat'; }
  if (MCI_KEYWORDS.test(text))    { showMciOverride();    return 'mci'; }
  return null;
}

function showHazmatOverride() {
  const modal = document.getElementById('hazmatOverride');
  if (!modal) return;
  modal.classList.remove('hidden');
  if (navigator.vibrate) navigator.vibrate([400, 100, 400, 100, 400]);
  logHandoffEvent('HAZMAT/EV-fire protocol triggered');
}
function closeHazmatOverride() {
  document.getElementById('hazmatOverride').classList.add('hidden');
}

function showMciOverride() {
  const modal = document.getElementById('mciOverride');
  if (!modal) return;
  modal.classList.remove('hidden');
  if (navigator.vibrate) navigator.vibrate([400, 100, 400]);
  logHandoffEvent('Mass-Casualty Incident protocol triggered');
}
function closeMciOverride() {
  document.getElementById('mciOverride').classList.add('hidden');
}

/* ════════════════════════════════════════════════════════════════
   5. GEO-FENCED HAZARD BROADCAST (2 km proximity)
   ════════════════════════════════════════════════════════════════ */
const GEOFENCE_RADIUS_M = 2000;
const seenHazards = new Set();
let geofenceTimer = null;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function pollGeofenceHazards() {
  if (!window.currentLat || !window.currentLon) return;
  try {
    const res = await fetch('/api/hazards');
    if (!res.ok) return;
    const list = await res.json();
    for (const h of list) {
      if (seenHazards.has(h.id)) continue;
      const dist = haversine(window.currentLat, window.currentLon, h.lat, h.lon);
      const ageMin = (Date.now()/1000 - h.created_at) / 60;
      if (dist <= GEOFENCE_RADIUS_M && ageMin <= 60) {
        seenHazards.add(h.id);
        showProximityAlert(h, dist);
      } else if (dist > GEOFENCE_RADIUS_M * 3) {
        // far away — mark as seen so we never alert
        seenHazards.add(h.id);
      }
    }
  } catch (e) {}
}

function showProximityAlert(hazard, distMeters) {
  const km = (distMeters / 1000).toFixed(1);
  const banner = document.getElementById('proximityAlert');
  if (!banner) return;
  const icon = { accident:'💥', pothole:'🕳', flooding:'🌊', animal:'🐄', debris:'🪨', breakdown:'🔧' }[hazard.type] || '⚠️';
  banner.innerHTML = `
    <span class="prox-icon">${icon}</span>
    <div class="prox-body">
      <strong>Hazard ${km} km ahead</strong>
      <span>${hazard.type.toUpperCase()} reported nearby. Slow down.</span>
    </div>
    <button onclick="document.getElementById('proximityAlert').classList.add('hidden')">✕</button>
  `;
  banner.classList.remove('hidden');

  // Voice warning ("audio warning" per blueprint)
  speakWarning(`Warning. ${hazard.type} reported ${km} kilometers ahead. Slow down immediately.`);

  if (navigator.vibrate) navigator.vibrate([200, 80, 200]);

  // Auto-hide after 12s
  clearTimeout(banner._timer);
  banner._timer = setTimeout(() => banner.classList.add('hidden'), 12000);
}

function speakWarning(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.volume = 1.0; u.pitch = 1.0;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch(e){}
}

function startGeofencePolling() {
  pollGeofenceHazards();
  clearInterval(geofenceTimer);
  geofenceTimer = setInterval(pollGeofenceHazards, 30000); // every 30s
}

/* ════════════════════════════════════════════════════════════════
   6. TROJAN HORSE — NAVIGATION MODE
   ════════════════════════════════════════════════════════════════ */
let navMode = false;
const BLACKSPOT_RADIUS_M = 500; // distance to existing hazards counts as blackspot
let blackspotLayer = null;

function toggleNavMode() {
  navMode = !navMode;
  const btn = document.getElementById('navModeBtn');
  if (btn) {
    btn.textContent = navMode ? '🧭 Driving Mode ON' : '🧭 Driving Mode';
    btn.classList.toggle('active', navMode);
  }
  document.body.classList.toggle('nav-mode', navMode);

  if (navMode) {
    showToast?.('🧭 Driving mode — accident blackspots highlighted');
    highlightBlackspots();
    if (window.map && window.currentLat) window.map.setView([window.currentLat, window.currentLon], 16);
  } else {
    clearBlackspots();
  }
}

async function highlightBlackspots() {
  try {
    const res = await fetch('/api/hazards');
    if (!res.ok) return;
    const hazards = await res.json();
    clearBlackspots();
    blackspotLayer = L.layerGroup().addTo(window.map);
    // Cluster hazards into blackspot zones
    const used = new Set();
    hazards.forEach((h, i) => {
      if (used.has(i)) return;
      const cluster = [h];
      hazards.forEach((other, j) => {
        if (i === j || used.has(j)) return;
        if (haversine(h.lat, h.lon, other.lat, other.lon) < BLACKSPOT_RADIUS_M) {
          cluster.push(other);
          used.add(j);
        }
      });
      if (cluster.length >= 2) {
        L.circle([h.lat, h.lon], {
          radius: BLACKSPOT_RADIUS_M,
          color: '#e63946', fillColor: '#e63946',
          fillOpacity: 0.18, weight: 2, dashArray: '8 4',
        }).addTo(blackspotLayer).bindPopup(
          `<strong>⚠️ Accident Blackspot</strong><br>${cluster.length} incidents reported here`
        );
      }
      used.add(i);
    });
  } catch(e){}
}

function clearBlackspots() {
  if (blackspotLayer && window.map) {
    window.map.removeLayer(blackspotLayer);
    blackspotLayer = null;
  }
}

/* ════════════════════════════════════════════════════════════════
   BOOT: wire into existing app
   ════════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  restoreHandoff();
  // Start geofence polling once location is known
  const check = setInterval(() => {
    if (window.currentLat && window.currentLon) {
      clearInterval(check);
      startGeofencePolling();
    }
  }, 1000);
});

// Helper used by handoff card
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
