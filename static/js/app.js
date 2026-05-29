/* ── RoadSoS — Main App ──────────────────────────────────────────── */

const API = '';
let map, userMarker, userCircle;
let serviceMarkers = [], hazardMarkers = [];
let currentLat = null, currentLon = null;
let activeFilters = new Set(['hospital','police','ambulance','towing','garage','pharmacy']);
let currentRadius = 5000;
let chatHistory = [];
window.locationInfo = {};
let cachedResults = null;
let recognition = null;
let isListening = false;
let selectedHazardType = 'accident';
let pendingHazardLatLon = null;

const SEVERITY_FILTERS = {
  all:       ['hospital','police','ambulance','towing','garage','pharmacy'],
  accident:  ['hospital','police','ambulance'],
  breakdown: ['towing','garage'],
  medical:   ['hospital','ambulance','pharmacy'],
};

// ── Map Init ──────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', { zoomControl: true }).setView([20, 78], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  // Click on map to report hazard
  map.on('click', onMapClick);

  locateMe();
  initCrashDetection();
  loadFamilyContacts();
  loadHazardsFromServer();
}

// ── Map click → hazard report ─────────────────────────────────────
function onMapClick(e) {
  if (!window._hazardReportMode) return;
  pendingHazardLatLon = [e.latlng.lat, e.latlng.lng];
  window._hazardReportMode = false;
  map.getContainer().style.cursor = '';
  document.getElementById('hazardModal').classList.remove('hidden');
}

function openHazardReport() {
  window._hazardReportMode = true;
  map.getContainer().style.cursor = 'crosshair';
  showToast('Click on the map to mark the hazard location');
}

// ── Geolocation ───────────────────────────────────────────────────
function locateMe() {
  setLocationChip('📍 Locating…', 'chip--location');
  if (!navigator.geolocation) { setLocationChip('❌ No GPS', 'chip--error'); return; }
  navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError,
    { enableHighAccuracy: true, timeout: 15000 });
}

function onLocationSuccess(pos) {
  currentLat = pos.coords.latitude;
  currentLon = pos.coords.longitude;
  window.currentLat = currentLat;
  window.currentLon = currentLon;
  window.map = map;
  map.setView([currentLat, currentLon], 14);

  if (userMarker) map.removeLayer(userMarker);
  if (userCircle) map.removeLayer(userCircle);

  userMarker = L.marker([currentLat, currentLon], {
    icon: L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;background:#e63946;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(230,57,70,.3)"></div>',
      iconSize: [16,16], iconAnchor: [8,8],
    }), zIndexOffset: 1000,
  }).addTo(map).bindPopup('<strong>You are here</strong>');

  userCircle = L.circle([currentLat, currentLon], {
    radius: currentRadius, color: '#457b9d',
    fillColor: '#457b9d', fillOpacity: 0.05,
    weight: 1.5, dashArray: '6 4',
  }).addTo(map);

  fetchLocationInfo(currentLat, currentLon);
  fetchNearby();

  // Update crash modal call number
  document.getElementById('crashCallNum').textContent =
    window.locationInfo?.emergency_numbers?.ambulance || '108';
}

function onLocationError() {
  setLocationChip('❌ Location denied', 'chip--error');
  map.setView([20.5937, 78.9629], 5);
}

// ── Location Info ─────────────────────────────────────────────────
async function fetchLocationInfo(lat, lon) {
  try {
    const res = await fetch(`${API}/api/location?lat=${lat}&lon=${lon}`);
    if (!res.ok) return;
    window.locationInfo = await res.json();
    const loc = window.locationInfo.location;
    const city = loc.city ? `${loc.city}, ` : '';
    setLocationChip(`📍 ${city}${loc.country}`, 'chip--location');

    // Update crash modal with country number
    const ambNum = window.locationInfo?.emergency_numbers?.ambulance || '108';
    document.getElementById('crashCallNum').textContent = ambNum;
    document.getElementById('crashCountdown2').textContent = '15';
  } catch(e) { console.warn(e); }
}

// ── Fetch Nearby ──────────────────────────────────────────────────
// Always fetch ALL service types so client-side filter toggles are instant
const ALL_SERVICE_TYPES = 'hospital,police,ambulance,towing,garage,pharmacy';

async function fetchNearby() {
  if (!currentLat || !currentLon) return;
  showLoading(true);
  clearServiceMarkers();
  const types = ALL_SERVICE_TYPES;
  try {
    let data;
    if (navigator.onLine) {
      const res = await fetch(
        `${API}/api/nearby?lat=${currentLat}&lon=${currentLon}&radius=${currentRadius}&types=${types}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      try { localStorage.setItem('roadsos_cache_v2', JSON.stringify({lat:currentLat,lon:currentLon,data,ts:Date.now()})); } catch(e){}
    } else {
      data = loadCachedResults();
    }
    if (data) { cachedResults = data; renderResults(data); plotMarkers(data.flat||[]); }
  } catch(e) {
    const cached = loadCachedResults();
    if (cached) { renderResults(cached); plotMarkers(cached.flat||[]); showOfflineBanner(); }
    else setResultsError();
  } finally { showLoading(false); }
}

function loadCachedResults() {
  try {
    const raw = localStorage.getItem('roadsos_cache_v2');
    if (!raw) return null;
    const {data,ts} = JSON.parse(raw);
    if (Date.now()-ts < 30*60*1000) return data;
  } catch(e){}
  return null;
}

// ── Render Results ────────────────────────────────────────────────
function renderResults(data) {
  const list = document.getElementById('resultsList');
  const countEl = document.getElementById('resultCount');
  const items = (data.flat||[]).filter(i => activeFilters.has(i.type));
  countEl.textContent = items.length;
  if (!items.length) {
    list.innerHTML = `<div class="placeholder"><div class="placeholder-icon">🔍</div><p>No services found within ${currentRadius/1000} km. Try increasing the radius.</p></div>`;
    return;
  }
  list.innerHTML = items.map((item,idx) => `
    <div class="result-item" id="ri-${idx}" onclick="focusResult(${idx},${item.lat},${item.lon})">
      <div class="result-icon">${item.icon}</div>
      <div class="result-body">
        <div class="result-name">${escHtml(item.name)}</div>
        <div class="result-meta">${item.label}${item.address?' · '+escHtml(item.address):''}</div>
        <div class="result-actions">
          ${item.phone?`<a class="action-btn action-btn--call" href="tel:${item.phone}">📞 ${escHtml(item.phone)}</a>`:''}
          <a class="action-btn" href="https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}" target="_blank">🗺 Directions</a>
        </div>
      </div>
      <div class="result-dist">${item.distance_text}</div>
    </div>`).join('');
}

// ── Map Markers ───────────────────────────────────────────────────
const MARKER_COLORS = {
  hospital:'#e63946', police:'#1d3557', ambulance:'#e76f51',
  towing:'#f4a261', garage:'#2a9d5c', pharmacy:'#6a4c93',
};

function plotMarkers(items) {
  clearServiceMarkers();
  items.filter(i=>activeFilters.has(i.type)).forEach((item,idx) => {
    const color = MARKER_COLORS[item.type]||'#457b9d';
    const icon = L.divIcon({
      className:'',
      html:`<div style="width:32px;height:32px;background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:14px">${item.icon}</span></div>`,
      iconSize:[32,32], iconAnchor:[16,32], popupAnchor:[0,-34],
    });
    const marker = L.marker([item.lat,item.lon],{icon}).addTo(map).bindPopup(`
      <div class="popup-name">${escHtml(item.name)}</div>
      <div class="popup-meta">${item.label} · ${item.distance_text}</div>
      ${item.address?`<div class="popup-meta">${escHtml(item.address)}</div>`:''}
      ${item.phone?`<a class="popup-call" href="tel:${item.phone}">📞 Call ${escHtml(item.phone)}</a>`:''}
      <br/><a class="popup-call" style="background:#457b9d;margin-top:4px;display:inline-block" href="https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}" target="_blank">🗺 Directions</a>
    `);
    marker._resultIdx = idx;
    serviceMarkers.push(marker);
  });
}

function clearServiceMarkers() {
  serviceMarkers.forEach(m=>map.removeLayer(m));
  serviceMarkers=[];
}

function focusResult(idx,lat,lon) {
  map.setView([lat,lon],16);
  if(serviceMarkers[idx]) serviceMarkers[idx].openPopup();
  document.querySelectorAll('.result-item').forEach(el=>el.classList.remove('highlighted'));
  const el=document.getElementById(`ri-${idx}`);
  if(el){el.classList.add('highlighted');el.scrollIntoView({behavior:'smooth',block:'nearest'});}
}

// ── Hazard Map ────────────────────────────────────────────────────
const HAZARD_ICONS = {
  accident:'💥', pothole:'🕳', flooding:'🌊', animal:'🐄', debris:'🪨', breakdown:'🔧'
};

async function loadHazardsFromServer() {
  try {
    const res = await fetch(`${API}/api/hazards`);
    if (!res.ok) return;
    const hazards = await res.json();
    hazards.forEach(h => plotHazard(h));
  } catch(e){}
}

function plotHazard(h) {
  const icon = HAZARD_ICONS[h.type]||'⚠️';
  const mapIcon = L.divIcon({
    className:'',
    html:`<div style="font-size:22px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4));cursor:pointer">${icon}</div>`,
    iconSize:[28,28], iconAnchor:[14,14],
  });
  const m = L.marker([h.lat,h.lon],{icon:mapIcon}).addTo(map).bindPopup(`
    <div class="popup-name">${icon} ${h.type.charAt(0).toUpperCase()+h.type.slice(1)}</div>
    <div class="popup-meta">Reported ${timeSince(h.created_at)} ago</div>
    <div class="popup-meta" style="color:#e63946">⚠️ Hazard ahead</div>
  `);
  hazardMarkers.push(m);
}

function timeSince(ts) {
  const mins = Math.floor((Date.now()/1000 - ts)/60);
  if (mins<60) return `${mins}m`;
  return `${Math.floor(mins/60)}h`;
}

function selectHazard(btn) {
  document.querySelectorAll('.hz-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  selectedHazardType = btn.dataset.type;
}

function closeHazardModal() {
  document.getElementById('hazardModal').classList.add('hidden');
  pendingHazardLatLon = null;
}

async function submitHazard() {
  const lat = pendingHazardLatLon?.[0] || currentLat;
  const lon = pendingHazardLatLon?.[1] || currentLon;
  if (!lat||!lon) { showToast('Location not available'); return; }
  try {
    const res = await fetch(`${API}/api/hazards`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({lat,lon,type:selectedHazardType}),
    });
    if (res.ok) {
      const h = await res.json();
      plotHazard(h);
      showToast(`⚠️ ${selectedHazardType} reported! Other users will see it.`);
    }
  } catch(e){ showToast('Could not report hazard — offline?'); }
  closeHazardModal();
}

// ── 📸 Scene Analysis (Gemini Vision) ────────────────────────────
async function analyzeScene(input) {
  const file = input.files[0];
  if (!file) return;

  const overlay = document.getElementById('sceneAnalysisResult');
  overlay.className='scene-result';
  overlay.innerHTML='<div class="scene-loading">🔍 Analyzing scene with Gemini AI…</div>';

  const reader = new FileReader();
  reader.onload = async (e) => {
    const b64 = e.target.result.split(',')[1];
    const mime = file.type;

    try {
      const res = await fetch(`${API}/api/analyze-scene`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({image_b64:b64, mime_type:mime}),
      });
      const data = await res.json();
      const analysis = data.analysis||'Could not analyze scene.';
      const severity = data.severity||'UNKNOWN';
      const color = {CRITICAL:'#e63946',MODERATE:'#f4a261',MINOR:'#2a9d5c',UNKNOWN:'#6b7280'}[severity];

      overlay.innerHTML=`
        <div class="scene-header">
          <span class="scene-sev" style="background:${color}">${severity}</span>
          <span class="scene-title">📸 Scene Analysis</span>
          <button onclick="document.getElementById('sceneAnalysisResult').classList.add('hidden')">✕</button>
        </div>
        <div class="scene-body">${analysis.replace(/\n/g,'<br/>')}</div>
      `;
      overlay.classList.remove('hidden');

      // Feed to chat
      appendMsg('bot', `📸 **Scene Analysis:** ${analysis}`);
      chatHistory.push({role:'assistant', content:`Scene analysis: ${analysis}`});

      if (severity==='CRITICAL') {
        document.getElementById('goldenBanner').classList.remove('hidden');
        updateTriageBadge('CRITICAL');
      }
    } catch(e) {
      overlay.innerHTML='<div class="scene-loading">⚠️ Analysis failed. Check your connection.</div>';
    }
  };
  reader.readAsDataURL(file);
  input.value=''; // reset input
}

// ── 🎤 Voice Assistant ────────────────────────────────────────────
function toggleVoice() {
  if (isListening) { stopVoice(); return; }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showToast('Voice not supported in this browser. Try Chrome.'); return; }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    document.getElementById('voiceIndicator').classList.remove('hidden');
    document.getElementById('micBtn').classList.add('active');
  };
  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    document.getElementById('chatInput').value = transcript;
    sendChat();
    stopVoice();
  };
  recognition.onerror = () => stopVoice();
  recognition.onend   = () => stopVoice();
  recognition.start();
}

function stopVoice() {
  isListening = false;
  recognition?.stop();
  document.getElementById('voiceIndicator').classList.add('hidden');
  document.getElementById('micBtn').classList.remove('active');
}

// ── 👨‍👩‍👧 Family Alert ────────────────────────────────────────────
function openFamilyModal() {
  document.getElementById('familyModal').classList.remove('hidden');
}
function closeFamilyModal() {
  document.getElementById('familyModal').classList.add('hidden');
}

function addFamilyContact() {
  const container = document.getElementById('familyInputs');
  const row = document.createElement('div');
  row.className = 'family-contact-row';
  row.innerHTML = `<input type="text" placeholder="Contact name" class="family-name-input"/>
    <input type="tel" placeholder="Phone number" class="family-phone-input"/>`;
  container.appendChild(row);
}

function saveFamilyContacts() {
  const names  = [...document.querySelectorAll('.family-name-input')].map(i=>i.value.trim()).filter(Boolean);
  const phones = [...document.querySelectorAll('.family-phone-input')].map(i=>i.value.trim()).filter(Boolean);
  const contacts = names.map((n,i) => ({name:n, phone:phones[i]||''})).filter(c=>c.phone);
  localStorage.setItem('roadsos_family', JSON.stringify(contacts));
  closeFamilyModal();
  sendFamilyAlert(contacts);
}

function loadFamilyContacts() {
  return JSON.parse(localStorage.getItem('roadsos_family')||'[]');
}

function sendFamilyAlert(contacts) {
  if (!contacts?.length) { contacts = loadFamilyContacts(); }
  if (!contacts?.length) { openFamilyModal(); return; }

  const lat = currentLat||0, lon = currentLon||0;
  const mapsUrl = `https://maps.google.com/?q=${lat},${lon}`;
  const msg = encodeURIComponent(`🚨 EMERGENCY ALERT from RoadSoS!\n\nI need help. My current location:\n${mapsUrl}\n\nPlease call me or emergency services immediately.`);

  contacts.forEach(c => {
    if (c.phone) {
      // Open WhatsApp with message (wa.me link)
      window.open(`https://wa.me/${c.phone.replace(/\D/g,'')}?text=${msg}`, '_blank');
    }
  });
  showToast(`🚨 Alert sent to ${contacts.length} contact(s) via WhatsApp!`);
}

// ── AI Severity Triage ────────────────────────────────────────────
function updateTriageBadge(severity) {
  const badge = document.getElementById('triageBadge');
  const colors = {CRITICAL:'#e63946',MODERATE:'#f4a261',MINOR:'#2a9d5c'};
  const icons  = {CRITICAL:'🔴',MODERATE:'🟠',MINOR:'🟢'};
  badge.textContent = `${icons[severity]||''} ${severity}`;
  badge.style.background = colors[severity]||'#6b7280';
  badge.classList.remove('hidden');
}

function detectSeverityFromReply(reply) {
  const text = reply.toLowerCase();
  if (/critical|unconscious|not breathing|severe bleeding|call.*ambulance.*immediately|life.threatening/.test(text)) {
    updateTriageBadge('CRITICAL');
    document.getElementById('goldenBanner').classList.remove('hidden');
  } else if (/injured|broken|fracture|ambulance|bleeding|hospital/.test(text)) {
    updateTriageBadge('MODERATE');
  } else {
    updateTriageBadge('MINOR');
  }
}

// ── Chat ──────────────────────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value='';

  appendMsg('user', msg);
  chatHistory.push({role:'user',content:msg});
  logHandoffEvent?.(`User said: "${msg.substring(0,80)}"`);

  const typing = appendMsg('bot','',true);

  // Auto-detect injury keywords → golden hour
  if (/injur|accident|crash|blood|unconscious|hurt|dead/i.test(msg)) {
    document.getElementById('goldenBanner').classList.remove('hidden');
  }

  // Blueprint: Hazmat / MCI protocol detection
  const protocol = checkProtocolOverrides?.(msg);
  if (protocol === 'hazmat') {
    logHandoffEvent?.('User reported hazmat / fuel / EV-fire scenario');
  } else if (protocol === 'mci') {
    logHandoffEvent?.('User reported mass-casualty scenario');
  }

  try {
    const res = await fetch(`${API}/api/chat`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({messages:chatHistory}),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const reply = data.reply||'Sorry, I could not respond. Please call emergency services.';
    typing.remove();
    appendMsg('bot',reply);
    chatHistory.push({role:'assistant',content:reply});
    detectSeverityFromReply(reply);
  } catch(e){
    typing.remove();
    appendMsg('bot','⚠️ Assistant offline. Call 112 for emergencies.');
  }
  document.getElementById('chatMessages').scrollTop=999999;
}

function quickPrompt(text) {
  document.getElementById('chatInput').value=text;
  sendChat();
}

function appendMsg(role,content,typing=false) {
  const chatEl=document.getElementById('chatMessages');
  const div=document.createElement('div');
  div.className=`msg msg--${role}${typing?' msg--typing':''}`;
  div.innerHTML=`<div class="msg-content">${typing?'':escHtml(content)
    .replace(/\n/g,'<br/>')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/^\d+\.\s/gm, s=>`<span style="color:#e63946;font-weight:700">${s}</span>`)
  }</div>`;
  chatEl.appendChild(div);
  chatEl.scrollTop=chatEl.scrollHeight;
  return div;
}

function clearChat() {
  chatHistory=[];
  document.getElementById('triageBadge').classList.add('hidden');
  document.getElementById('chatMessages').innerHTML=`
    <div class="msg msg--bot"><div class="msg-content">Chat cleared. How can I help you? 🚗</div></div>`;
}

// ── SOS Modal ─────────────────────────────────────────────────────
function triggerSOS() {
  const modal=document.getElementById('sosModal');
  const container=document.getElementById('sosNumbers');
  const nums=window.locationInfo?.emergency_numbers||{};
  const country=nums.country||'International';
  const flag=nums.flag||'🌍';
  const rows=[
    {label:`🚑 Ambulance (${flag} ${country})`, number:nums.ambulance||'112'},
    {label:'🚔 Police',                          number:nums.police||'112'},
    {label:'🔥 Fire Brigade',                    number:nums.fire||'112'},
    {label:'🆘 Emergency',                       number:nums.emergency||'112'},
  ];
  if (nums.road_accident_helpline) rows.push({label:'🛣 Road Accident Helpline',number:nums.road_accident_helpline});
  if (nums.highway_helpline)       rows.push({label:'🛣 Highway Helpline',number:nums.highway_helpline});

  container.innerHTML=rows.map(r=>`
    <div class="sos-number-row">
      <span class="label">${r.label}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="number">${r.number}</span>
        <a class="call-now-btn" href="tel:${r.number}">Call</a>
      </div>
    </div>`).join('');
  modal.classList.remove('hidden');
}
function closeSOS() { document.getElementById('sosModal').classList.add('hidden'); }

async function shareLocation() {
  if (!currentLat||!currentLon){alert('Location not available.');return;}
  const mapsUrl=`https://maps.google.com/?q=${currentLat},${currentLon}`;
  const text=`🚨 EMERGENCY — My location: ${mapsUrl}`;
  if(navigator.share){try{await navigator.share({title:'RoadSoS Emergency',text,url:mapsUrl});}catch(e){}}
  else{await navigator.clipboard.writeText(text).catch(()=>{});alert('Location link copied:\n'+mapsUrl);}
}

// ── Filters & Controls ────────────────────────────────────────────
function toggleFilter(btn) {
  const type = btn.dataset.type;
  if (activeFilters.has(type)) activeFilters.delete(type);
  else activeFilters.add(type);
  btn.classList.toggle('active', activeFilters.has(type));
  // Cache always holds all types; just re-render the filtered view
  if (cachedResults) {
    renderResults(cachedResults);
    plotMarkers(cachedResults.flat || []);
  } else {
    fetchNearby();
  }
}

function setSeverity(btn, type) {
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilters = new Set(SEVERITY_FILTERS[type] || SEVERITY_FILTERS.all);
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', activeFilters.has(chip.dataset.type));
  });
  if (type === 'accident') document.getElementById('goldenBanner').classList.remove('hidden');
  if (cachedResults) {
    renderResults(cachedResults);
    plotMarkers(cachedResults.flat || []);
  } else {
    fetchNearby();
  }
}

let radiusTimer = null;
function updateRadius(el) {
  currentRadius = parseInt(el.value) * 1000;
  document.getElementById('radiusLabel').textContent = `${el.value} km`;
  if (userCircle) { userCircle.setRadius(currentRadius); map.fitBounds(userCircle.getBounds()); }
  // Debounce re-fetch so slider doesn't spam OSM
  clearTimeout(radiusTimer);
  radiusTimer = setTimeout(() => fetchNearby(), 400);
}

function refreshResults() { fetchNearby(); }

// ── Helpers ───────────────────────────────────────────────────────
function setLocationChip(text,cls) {
  const el=document.getElementById('locationChip');
  el.textContent=text; el.className=`chip ${cls}`;
}
function showLoading(on) { document.getElementById('loadingBar').classList.toggle('hidden',!on); }
function showOfflineBanner() { document.getElementById('offlineChip').classList.remove('hidden'); }
function setResultsError() {
  document.getElementById('resultsList').innerHTML=`<div class="placeholder"><div class="placeholder-icon">⚠️</div><p>Could not load services. Check your connection.</p></div>`;
}
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function showToast(msg) {
  let t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);}
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),3500);
}

// ── Offline ───────────────────────────────────────────────────────
function setOnlineState() {
  const chip = document.getElementById('offlineChip');
  if (navigator.onLine) chip?.classList.add('hidden');
  else                   chip?.classList.remove('hidden');
}
window.addEventListener('online',  setOnlineState);
window.addEventListener('offline', setOnlineState);
window.addEventListener('DOMContentLoaded', setOnlineState);

// ── Service Worker ────────────────────────────────────────────────
if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}

// ── Boot ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', initMap);
