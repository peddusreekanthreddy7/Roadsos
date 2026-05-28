/* ── RoadSoS First Aid Interactive Guide ─────────────────────────── */

const FIRST_AID_GUIDES = {
  cpr: {
    title: "CPR (Cardiopulmonary Resuscitation)",
    icon: "❤️",
    severity: "CRITICAL",
    when: "Person is unconscious and not breathing",
    video_id: "yYvAIW1zJcM",      // AHA — Learn How To Do CPR (2025)
    video_label: "AHA — Learn How To Do CPR",
    steps: [
      { icon: "👋", text: "Tap shoulders firmly and shout 'Are you okay?'" },
      { icon: "📞", text: "Call 108 immediately. Put on speaker." },
      { icon: "👐", text: "Lay them flat on their back on a firm surface." },
      { icon: "🤲", text: "Kneel beside them. Place heel of your hand on center of chest." },
      { icon: "💪", text: "Push HARD and FAST — 30 compressions, 2 inches deep, 100–120/min." },
      { icon: "💨", text: "Tilt head back, lift chin. Give 2 rescue breaths (if trained)." },
      { icon: "🔁", text: "Repeat 30:2 cycle until ambulance arrives or person recovers." },
    ],
    warning: "Do NOT stop unless you are exhausted or a professional takes over.",
    color: "#e63946",
  },
  bleeding: {
    title: "Severe Bleeding Control",
    icon: "🩸",
    severity: "CRITICAL",
    when: "Large cut, deep wound, or uncontrolled bleeding",
    video_id: "NxO5LvgqZe0",      // St John Ambulance — Severe Bleeding
    video_label: "St John — Treating Severe Bleeding",
    steps: [
      { icon: "🧤", text: "If available, wear gloves to protect yourself." },
      { icon: "👐", text: "Apply firm, direct pressure with a clean cloth or bandage." },
      { icon: "💪", text: "Press HARD continuously. Do NOT remove cloth — add more on top." },
      { icon: "🦵", text: "Elevate the injured limb above heart level if possible." },
      { icon: "🔗", text: "For limb bleeding: apply improvised tourniquet 2 inches above wound." },
      { icon: "📞", text: "Call 108. Keep the person warm and calm." },
    ],
    warning: "Never remove an embedded object from a wound.",
    color: "#e63946",
  },
  fracture: {
    title: "Suspected Fracture / Broken Bone",
    icon: "🦴",
    severity: "MODERATE",
    when: "Bone deformity, severe pain, inability to move limb",
    video_id: "2v8vlXgGXwE",      // St John Ambulance — Fracture First Aid
    video_label: "St John — How to Treat a Fracture",
    steps: [
      { icon: "🛑", text: "Do NOT try to straighten the bone — leave it as is." },
      { icon: "❄️", text: "Apply ice wrapped in cloth to reduce swelling (20 min on/off)." },
      { icon: "📏", text: "Immobilize using splints (rolled newspaper, sticks) tied loosely." },
      { icon: "🚗", text: "Support the injured area during transport. Move carefully." },
      { icon: "📞", text: "Call 108 for spine/neck/hip injuries — do NOT move the person." },
    ],
    warning: "Suspected spinal injury: do NOT move the person at all. Wait for ambulance.",
    color: "#f4a261",
  },
  burns: {
    title: "Burns from Fire / Fuel",
    icon: "🔥",
    severity: "MODERATE",
    when: "Burn from fire, hot surface, or vehicle fuel",
    video_id: "EaJmzB8YgS0",      // St John Ambulance — Burns and Scalds
    video_label: "St John — How to Treat Burns",
    steps: [
      { icon: "💧", text: "Cool the burn with cool (not cold) running water for 20 minutes." },
      { icon: "🚫", text: "Do NOT use ice, butter, toothpaste, or oils." },
      { icon: "✂️", text: "Remove clothing/jewelry near the burn — unless stuck to skin." },
      { icon: "🩹", text: "Cover loosely with a clean non-fluffy cloth or cling film." },
      { icon: "📞", text: "Call 108 for large, deep, or facial burns." },
    ],
    warning: "Never pop blisters. Do not remove clothing stuck to the burn.",
    color: "#f4a261",
  },
  unconscious: {
    title: "Unconscious Person",
    icon: "😵",
    severity: "CRITICAL",
    when: "Person is unresponsive but breathing",
    video_id: "GmqXqwSV3bo",      // St John Ambulance — Recovery Position
    video_label: "St John — The Recovery Position",
    steps: [
      { icon: "📞", text: "Call 108 immediately." },
      { icon: "🔍", text: "Check for breathing — look, listen, feel for 10 seconds." },
      { icon: "🔄", text: "If breathing: place in RECOVERY POSITION — on their side, top knee bent forward." },
      { icon: "🚫", text: "Do NOT give food or water." },
      { icon: "🔦", text: "Monitor breathing constantly until ambulance arrives." },
      { icon: "💬", text: "Talk to them calmly — they may be able to hear you." },
    ],
    warning: "If they stop breathing, start CPR immediately.",
    color: "#e63946",
  },
  shock: {
    title: "Traumatic Shock",
    icon: "⚡",
    severity: "CRITICAL",
    when: "Pale skin, rapid breathing, confusion, dizziness after accident",
    video_id: "61urGQrmeNM",      // St John Ambulance — Treating Shock
    video_label: "St John — How to Treat Shock",
    steps: [
      { icon: "📞", text: "Call 108 immediately — shock is life-threatening." },
      { icon: "🛏",  text: "Lay the person down, elevate legs 12 inches (unless head/spine injury)." },
      { icon: "🔥", text: "Keep them warm with a blanket. Do not overheat." },
      { icon: "🚫", text: "Do NOT give food, water, or medication." },
      { icon: "🩸", text: "Control any visible bleeding with pressure." },
      { icon: "💬", text: "Keep them calm and conscious. Talk to them." },
    ],
    warning: "Do not leave a shocked person alone. Monitor breathing continuously.",
    color: "#e63946",
  },
};

// ── Open/Close Guide ──────────────────────────────────────────────
function openFirstAid() {
  document.getElementById('firstAidPanel').classList.remove('hidden');
  backToList();  // always start at the list view
}

function closeFirstAid() {
  document.getElementById('firstAidPanel').classList.add('hidden');
  stopVideo();
}

// ── Back to list ──────────────────────────────────────────────────
function backToList() {
  stopVideo();
  document.getElementById('guideDetail').classList.add('hidden');
  document.getElementById('guideDetail').innerHTML = '';
  const listWrap = document.getElementById('faListWrap');
  if (listWrap) listWrap.classList.remove('hidden');
  // scroll the panel body back to top
  const body = document.querySelector('#firstAidPanel .side-panel-body');
  if (body) body.scrollTop = 0;
}

// ── Show individual guide ─────────────────────────────────────────
function showGuide(key) {
  const guide = FIRST_AID_GUIDES[key];
  if (!guide) return;

  // Blueprint: Paramedic Handoff Card — log every first-aid opened
  logFirstAid?.(`Followed guide: ${guide.title}`);

  // Hide the list
  const listWrap = document.getElementById('faListWrap');
  if (listWrap) listWrap.classList.add('hidden');

  const panel  = document.getElementById('guideDetail');
  const color  = guide.color;
  const thumb  = `https://img.youtube.com/vi/${guide.video_id}/hqdefault.jpg`;

  panel.innerHTML = `
    <!-- Back button -->
    <button class="guide-back-btn" onclick="backToList()">← All Guides</button>

    <!-- Header -->
    <div class="guide-header" style="border-left:4px solid ${color}">
      <div class="guide-icon">${guide.icon}</div>
      <div>
        <div class="guide-title">${guide.title}</div>
        <div class="guide-severity" style="color:${color}">⚠️ ${guide.severity}</div>
        <div class="guide-when"><em>When:</em> ${guide.when}</div>
      </div>
    </div>

    <!-- ── VIDEO PLAYER ───────────────────────────────── -->
    <div class="video-wrap">
      <div id="videoThumbWrap_${key}" class="video-thumb-wrap" onclick="playVideo('${key}','${guide.video_id}')">
        <img class="video-thumb" src="${thumb}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22><rect fill=%22%231d1f2b%22 width=%22320%22 height=%22180%22/><text x=%2250%%22 y=%2250%%22 fill=%22%23fff%22 font-size=%2240%22 text-anchor=%22middle%22 dy=%22.35em%22>▶</text></svg>'" alt="Video thumbnail" />
        <div class="video-play-overlay">
          <div class="video-play-btn">▶</div>
          <div class="video-label">${guide.video_label}</div>
        </div>
      </div>
      <div id="videoFrame_${key}" class="video-frame hidden"></div>
      <a class="video-yt-link" href="https://www.youtube.com/watch?v=${guide.video_id}" target="_blank">
        📺 Open on YouTube ↗
      </a>
    </div>

    <!-- Steps -->
    <ol class="guide-steps">
      ${guide.steps.map((s,i)=>`
        <li class="guide-step" style="animation-delay:${i*0.07}s">
          <span class="step-icon">${s.icon}</span>
          <span>${s.text}</span>
        </li>`).join('')}
    </ol>

    <!-- Warning -->
    <div class="guide-warning">⚠️ ${guide.warning}</div>

    <!-- Call button -->
    <button class="guide-call-btn" onclick="callAmbulance()">📞 Call 108 NOW</button>
  `;

  panel.classList.remove('hidden');
  // Scroll panel body to top so guide starts at top
  const body = document.querySelector('#firstAidPanel .side-panel-body');
  if (body) body.scrollTop = 0;
}

// ── Video playback ────────────────────────────────────────────────
let currentVideoKey = null;

function playVideo(key, videoId) {
  // Hide thumbnail
  const thumbWrap = document.getElementById(`videoThumbWrap_${key}`);
  const frameDiv  = document.getElementById(`videoFrame_${key}`);
  if (!thumbWrap || !frameDiv) return;

  // Stop previous video if different
  if (currentVideoKey && currentVideoKey !== key) stopVideo();
  currentVideoKey = key;

  thumbWrap.classList.add('hidden');
  frameDiv.classList.remove('hidden');
  frameDiv.innerHTML = `
    <iframe
      src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
      loading="lazy"
    ></iframe>
    <button class="video-close-btn" onclick="stopVideo()">✕ Close video</button>
  `;
}

function stopVideo() {
  if (!currentVideoKey) return;
  const thumbWrap = document.getElementById(`videoThumbWrap_${currentVideoKey}`);
  const frameDiv  = document.getElementById(`videoFrame_${currentVideoKey}`);
  if (thumbWrap) thumbWrap.classList.remove('hidden');
  if (frameDiv)  { frameDiv.classList.add('hidden'); frameDiv.innerHTML = ''; }
  currentVideoKey = null;
}

function callAmbulance() {
  const num = window.locationInfo?.emergency_numbers?.ambulance || '108';
  window.location.href = `tel:${num}`;
}

// ── Render guide list ─────────────────────────────────────────────
function renderFirstAidList() {
  const container = document.getElementById('firstAidList');
  if (!container) return;

  container.innerHTML = Object.entries(FIRST_AID_GUIDES).map(([key, g]) => `
    <button class="fa-card" onclick="showGuide('${key}')" style="border-left:4px solid ${g.color}">
      <span class="fa-icon">${g.icon}</span>
      <div class="fa-info">
        <div class="fa-title">${g.title}</div>
        <div class="fa-sev" style="color:${g.color}">${g.severity}</div>
      </div>
      <span class="fa-video-badge">📺</span>
      <span class="fa-arrow">›</span>
    </button>
  `).join('');
}

window.addEventListener('DOMContentLoaded', renderFirstAidList);
