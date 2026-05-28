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
   SCENARIO ENGINE — three blueprint categories
   ════════════════════════════════════════════════════════════════ */

const SCENARIOS = {
  // ── Category A: Conscious Victim Operations ──
  trapped: {
    cat: 'A', title: 'Trapped Victim', icon: '🚪',
    keywords: /\b(trapped|jammed|stuck|pinned|can.?t\s+get\s+out|door\s+won.?t\s+open|crushed)\b/i,
    filters: ['ambulance', 'police'],  // fire rescue is not a separate filter type, ambulance/police nearest
    aiPrompt: "I'm trapped in my car after a crash. Doors are jammed. What do I do?",
    voiceGuide: [
      "Stay calm. Help is on the way.",
      "Turn off the engine if you can reach it.",
      "Roll down a window or break it with the headrest if you can.",
      "Cover your nose if you smell fuel.",
      "Do not move if you have neck or back pain.",
    ],
    callPriority: 'fire', // calls fire/heavy rescue
  },
  breakdown: {
    cat: 'A', title: 'Remote Breakdown', icon: '🔧',
    keywords: /\b(flat\s+tire|flat\s+tyre|blowout|puncture|engine\s+(failure|died|won.?t\s+start)|transmission|breakdown|broke\s+down|stranded)\b/i,
    filters: ['towing', 'garage'],
    aiPrompt: "My car broke down on a remote road. What do I do?",
    voiceGuide: [
      "Pull off the road as far as you safely can.",
      "Turn on your hazard lights immediately.",
      "Place reflective triangles 50 meters behind your vehicle.",
      "Stay inside the vehicle if traffic is heavy.",
      "Keep your phone charged and visible.",
    ],
    callPriority: 'tow',
  },
  roadrage: {
    cat: 'A', title: 'Fender-Bender / Road Rage', icon: '👊',
    keywords: /\b(road\s+rage|fender.?bender|altercation|hit\s+(me|my\s+car)|threaten|aggressive\s+driver|fight|arguing|hostile)\b/i,
    filters: ['police'],
    aiPrompt: "I'm in a minor accident and the other driver is being aggressive. What do I do?",
    voiceGuide: [
      "Lock your doors. Stay inside the vehicle.",
      "Do not engage with the aggressive driver.",
      "Photograph the scene and the other vehicle's plate.",
      "Drive to the nearest police station if you feel unsafe.",
      "Police are being dispatched to your location.",
    ],
    callPriority: 'police',
  },

  // ── Category B: Bystander Operations ──
  trauma: {
    cat: 'B', title: 'Severe Trauma (Golden Hour)', icon: '🩸',
    keywords: /\b(unconscious|not\s+breathing|severe\s+bleeding|motorcyclist.*down|head\s+injury|helmet|critical|life.?threatening)\b/i,
    filters: ['hospital', 'ambulance'],
    aiPrompt: "There is an unconscious, bleeding motorcyclist at the accident scene. What do I do?",
    voiceGuide: [
      "Do not remove the helmet. Removing it could cause spinal injury.",
      "Find a clean cloth and apply firm direct pressure to the wound.",
      "Do not move the person unless they are in immediate danger.",
      "Check for breathing every thirty seconds.",
      "Stay with them. Help is coming.",
    ],
    callPriority: 'ambulance',
    activateBeacon: true,        // also flash the night beacon
    triggerGoldenHour: true,
  },
  samaritan: {
    cat: 'B', title: 'Good Samaritan Report', icon: '⚠️',
    keywords: /\b(pothole|debris|disabled\s+(truck|vehicle)|fallen\s+tree|oil\s+spill|broken\s+signal|blocked\s+(road|lane))\b/i,
    filters: [],
    aiPrompt: "I see a road hazard ahead. How do I report it?",
    voiceGuide: [
      "Do not stop in traffic to take photos.",
      "Pull over safely first if possible.",
      "Report the hazard using the in-app hazard button.",
      "Continue driving carefully and warn approaching vehicles.",
    ],
    openHazardReport: true,
  },

  // ── Category C: Advanced Disaster Innovation Layer ──
  hazmat: {
    cat: 'C', title: 'Hazmat / EV Fire', icon: '☣️',
    keywords: null, // set below
    filters: ['hospital'],
    aiPrompt: "There is a tanker truck or EV fire at the scene.",
    triggerHazmat: true,
  },
  mci: {
    cat: 'C', title: 'Mass Casualty', icon: '🚌',
    keywords: null, // set below
    filters: ['hospital', 'ambulance'],
    aiPrompt: "There is a bus rollover or major pile-up with multiple victims.",
    triggerMci: true,
  },
};

// Backfill regex after object literal
const HAZMAT_KEYWORDS = /\b(tanker|hazmat|chemical|fuel\s+spill|gas\s+leak|ev\s+fire|electric\s+vehicle.*fire|lithium|battery\s+fire|thermal\s+runaway|explosion|leaking\s+(petrol|diesel|gas|fuel))\b/i;
const MCI_KEYWORDS    = /\b(bus\s+(rollover|crash|overturn)|pile.?up|pileup|multiple\s+(vehicles|cars|victims|casualties)|mass\s+casualty|many\s+injured|train\s+(crash|derailment))\b/i;
SCENARIOS.hazmat.keywords = HAZMAT_KEYWORDS;
SCENARIOS.mci.keywords    = MCI_KEYWORDS;

function runScenario(key) {
  const s = SCENARIOS[key];
  if (!s) return;

  logHandoffEvent(`Scenario activated: ${s.title} (Category ${s.cat})`);

  // 1) Filter the map/services to relevant categories.
  // Cache always holds ALL service types, so we just re-render with new filter.
  if (s.filters?.length && typeof activeFilters !== 'undefined') {
    activeFilters = new Set(s.filters);
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.classList.toggle('active', activeFilters.has(chip.dataset.type));
    });
    document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
    if (typeof cachedResults !== 'undefined' && cachedResults) {
      renderResults(cachedResults); plotMarkers(cachedResults.flat || []);
    } else if (typeof fetchNearby === 'function') {
      fetchNearby();
    }
  }

  // 2) Inject the AI prompt
  if (s.aiPrompt && typeof sendChat === 'function') {
    const input = document.getElementById('chatInput');
    if (input) { input.value = s.aiPrompt; sendChat(); }
  }

  // 3) Read out the voice guide
  if (s.voiceGuide?.length) speakStepwise(s.voiceGuide);

  // 4) Special triggers
  if (s.activateBeacon)   activateNightBeacon();
  if (s.triggerGoldenHour) document.getElementById('goldenBanner')?.classList.remove('hidden');
  if (s.triggerHazmat)    showHazmatOverride();
  if (s.triggerMci)       showMciOverride();
  if (s.openHazardReport) openHazardReport?.();

  // 5) Highlight visual category badge
  const tag = document.getElementById('scenarioTag');
  if (tag) {
    tag.textContent = `${s.icon} ${s.title} · Category ${s.cat}`;
    tag.className = `scenario-tag cat-${s.cat}`;
    tag.classList.remove('hidden');
    clearTimeout(tag._timer);
    tag._timer = setTimeout(() => tag.classList.add('hidden'), 15000);
  }

  showToast?.(`${s.icon} ${s.title} mode active`);
}

function speakStepwise(lines) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  lines.forEach((line, idx) => {
    const u = new SpeechSynthesisUtterance(line);
    u.rate = 0.95; u.pitch = 1.0; u.volume = 1.0;
    setTimeout(() => speechSynthesis.speak(u), idx * 50);
  });
}

function detectScenario(text) {
  // Check Category-C first (most severe) then B then A
  const order = ['hazmat', 'mci', 'trauma', 'trapped', 'roadrage', 'breakdown', 'samaritan'];
  for (const key of order) {
    if (SCENARIOS[key].keywords.test(text)) return key;
  }
  return null;
}

function switchScenarioTab(cat) {
  document.querySelectorAll('.sc-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.cat === cat);
  });
  document.querySelectorAll('.sc-panel').forEach(p => {
    p.classList.toggle('active', p.dataset.cat === cat);
  });
}

/* ════════════════════════════════════════════════════════════════
   SMS-BRIDGE (Blueprint §6.A — works when mobile data is dead)
   Builds a compressed encrypted-style payload and fires sms: URI
   ════════════════════════════════════════════════════════════════ */
function buildSosPayload() {
  const lat = (window.currentLat ?? 0).toFixed(5);
  const lon = (window.currentLon ?? 0).toFixed(5);
  const triage = document.getElementById('triageBadge')?.textContent?.trim() || 'UNKNOWN';
  const cs = handoffLog.consciousState || 'Unknown';
  const country = window.locationInfo?.location?.country_code || 'IN';
  return `[SOS][CC:${country}][Lat:${lat}][Lon:${lon}][Triage:${triage}][CS:${cs}][T:${Date.now()}]`;
}

function fireSmsBridge() {
  const family = (typeof loadFamilyContacts === 'function' ? loadFamilyContacts() : []) || [];
  const payload = buildSosPayload();
  const body = encodeURIComponent(
    `🚨 RoadSOS Emergency\n${payload}\n` +
    `Google Maps: https://maps.google.com/?q=${window.currentLat},${window.currentLon}\n` +
    `Sent via SMS-Bridge (no data needed).`
  );

  if (!family.length) {
    // Open SMS app with empty recipient so user can pick
    window.location.href = `sms:?body=${body}`;
    showToast?.('📱 SMS bridge ready — pick a recipient');
  } else {
    const numbers = family.map(c => c.phone.replace(/\D/g, '')).join(',');
    window.location.href = `sms:${numbers}?body=${body}`;
    showToast?.(`📱 SMS-Bridge fired to ${family.length} contact(s)`);
  }
  logHandoffEvent(`SMS-Bridge dispatched: ${payload}`);
}

/* ════════════════════════════════════════════════════════════════
   INTRO TOUR — first-visit guide that maps app to blueprint
   ════════════════════════════════════════════════════════════════ */
function maybeShowIntro() {
  if (localStorage.getItem('roadsos_intro_seen')) return;
  setTimeout(showIntro, 800);
}
function showIntro() {
  document.getElementById('introModal')?.classList.remove('hidden');
}
function closeIntro() {
  document.getElementById('introModal')?.classList.add('hidden');
  localStorage.setItem('roadsos_intro_seen', '1');
}
function reopenIntro() {
  document.getElementById('introModal')?.classList.remove('hidden');
}

/* ════════════════════════════════════════════════════════════════
   3. HAZMAT / EV FIRE PROTOCOL  +  4. MCI MODE
   ════════════════════════════════════════════════════════════════ */
function checkProtocolOverrides(text) {
  const key = detectScenario(text);
  if (key) {
    runScenario(key);
    return key;
  }
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
  maybeShowIntro();
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
