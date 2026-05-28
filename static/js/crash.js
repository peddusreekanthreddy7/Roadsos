/* ── RoadSoS Crash Detection Module ─────────────────────────────── */

const CRASH_G_THRESHOLD = 25;   // ~2.5G in m/s²
const COUNTDOWN_SEC      = 15;   // Blueprint: 15-Second Shield
const COOLDOWN_MS        = 15000; // 15s cooldown after detection

let crashCooldown    = false;
let countdownTimer   = null;
let countdownSeconds = COUNTDOWN_SEC;
let crashEnabled     = true;

// ── Init ──────────────────────────────────────────────────────────
function initCrashDetection() {
  if (!window.DeviceMotionEvent) {
    console.warn('DeviceMotion not supported');
    return;
  }

  // iOS 13+ requires permission
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    document.getElementById('crashPermBtn')?.classList.remove('hidden');
  } else {
    startMotionListening();
  }
}

function requestMotionPermission() {
  DeviceMotionEvent.requestPermission().then(state => {
    if (state === 'granted') startMotionListening();
  }).catch(console.error);
}

function startMotionListening() {
  window.addEventListener('devicemotion', handleMotion, { passive: true });
  console.log('Crash detection active');
}

function handleMotion(event) {
  if (!crashEnabled || crashCooldown) return;
  if (document.hidden) return; // skip hidden tabs

  const acc = event.accelerationIncludingGravity;
  if (!acc) return;

  const magnitude = Math.sqrt(
    (acc.x || 0) ** 2 +
    (acc.y || 0) ** 2 +
    (acc.z || 0) ** 2
  );

  if (magnitude > CRASH_G_THRESHOLD) {
    triggerCrashDetected(magnitude);
  }
}

// ── Trigger ───────────────────────────────────────────────────────
function triggerCrashDetected(magnitude) {
  crashCooldown = true;
  setTimeout(() => { crashCooldown = false; }, COOLDOWN_MS);

  console.log(`Crash detected! Magnitude: ${magnitude.toFixed(1)} m/s²`);
  showCrashModal();

  // Vibrate if supported
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
}

// ── Demo trigger (for judges without a real crash) ────────────────
function simulateCrash() {
  triggerCrashDetected(30);
}

// ── Modal ──────────────────────────────────────────────────────────
function showCrashModal() {
  const modal = document.getElementById('crashModal');
  modal.classList.remove('hidden');
  countdownSeconds = COUNTDOWN_SEC;
  updateCountdown();

  countdownTimer = setInterval(() => {
    countdownSeconds--;
    updateCountdown();
    if (countdownSeconds <= 0) {
      clearInterval(countdownTimer);
      autoCallEmergency();
    }
  }, 1000);
}

function updateCountdown() {
  const el = document.getElementById('crashCountdown');
  const el2 = document.getElementById('crashCountdown2');
  const ring = document.getElementById('countdownRing');
  if (el) el.textContent = countdownSeconds;
  if (el2) el2.textContent = countdownSeconds;

  // Animate SVG ring
  if (ring) {
    const circumference = 2 * Math.PI * 45; // r=45
    const progress = countdownSeconds / COUNTDOWN_SEC;
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference * (1 - progress)}`;
    ring.style.stroke = countdownSeconds > 5 ? '#e63946' : '#ff6b6b';
  }
}

function cancelCrash() {
  clearInterval(countdownTimer);
  document.getElementById('crashModal').classList.add('hidden');

  // Log safe status
  appendMsg?.('bot', "✅ **I'm okay!** Crash alert cancelled. Stay safe on the road.");
}

function autoCallEmergency() {
  document.getElementById('crashModal').classList.add('hidden');

  // Show golden hour alert
  document.getElementById('goldenBanner')?.classList.remove('hidden');

  // Log incident for Paramedic Handoff Card
  logHandoffEvent?.('Crash detected by accelerometer (auto-SOS activated)');
  logHandoffEvent?.('Emergency call placed automatically');

  // Auto-inject message to chat
  appendMsg?.('bot',
    '🚨 **AUTO-SOS ACTIVATED**\n\n' +
    'Impact detected. Calling emergency services.\n\n' +
    '1. Hazard lights — ON\n' +
    '2. Stay calm\n' +
    '3. Do NOT move if injured\n\n' +
    'Help is on the way.'
  );

  // Auto-SOS Night Beacon — activate after sunset
  activateNightBeaconIfDark?.();

  // Auto-share location with family on auto-SOS
  const family = loadFamilyContacts?.() || [];
  if (family.length) sendFamilyAlert?.(family);

  // Open emergency call (ambulance)
  const emergencyNum = window.locationInfo?.emergency_numbers?.ambulance || '112';
  window.location.href = `tel:${emergencyNum}`;
}

// ── Enable/Disable toggle ─────────────────────────────────────────
function toggleCrashDetection() {
  crashEnabled = !crashEnabled;
  const btn = document.getElementById('crashToggleBtn');
  if (btn) {
    btn.textContent = crashEnabled ? '🚨 Crash Detection ON' : '⭕ Crash Detection OFF';
    btn.classList.toggle('active', crashEnabled);
  }
}
