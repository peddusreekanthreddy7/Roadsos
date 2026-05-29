/* RoadSoS Service Worker — Offline-First (low-network resilient) */

const CACHE_NAME = 'roadsos-v10';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/crash.js',
  '/js/firstaid.js',
  '/js/blueprint.js',
  '/js/drive.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.png',
  '/icons/apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// Tile cache — store last-viewed map tiles aggressively (offline maps!)
const TILE_CACHE  = 'roadsos-tiles-v2';
const TILE_MAX    = 2000;             // way more for offline coverage

// Routing + geocoding cache (Nominatim + OSRM)
const ROUTE_CACHE = 'roadsos-routes-v1';
const ROUTE_MAX   = 200;

// API cache — stale-while-revalidate fallback when network dies
const API_CACHE = 'roadsos-api-v1';

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  const keep = new Set([CACHE_NAME, TILE_CACHE, ROUTE_CACHE, API_CACHE]);
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', evt => {
  const url = new URL(evt.request.url);

  // Map tiles — cache-first, store many for offline coverage
  if (url.hostname.includes('tile.openstreetmap.org')) {
    evt.respondWith(cacheLimited(TILE_CACHE, evt.request, TILE_MAX));
    return;
  }

  // Routing + geocoding — cache-first so offline routes still work
  if (url.hostname.includes('nominatim.openstreetmap.org') ||
      url.hostname.includes('router.project-osrm.org')) {
    evt.respondWith(cacheLimited(ROUTE_CACHE, evt.request, ROUTE_MAX));
    return;
  }

  // App API — network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    evt.respondWith(networkFirst(API_CACHE, evt.request));
    return;
  }

  // Static assets — cache-first
  evt.respondWith(
    caches.match(evt.request).then(cached => cached || fetch(evt.request).then(resp => {
      if (resp.ok) {
        caches.open(CACHE_NAME).then(c => c.put(evt.request, resp.clone()));
      }
      return resp;
    }).catch(() => cached))
  );
});

/* ── Helpers ────────────────────────────────────────────────────── */
async function cacheLimited(cacheName, request, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in background
    fetch(request).then(r => { if (r.ok) cache.put(request, r); }).catch(()=>{});
    return cached;
  }
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const keys = await cache.keys();
      if (keys.length >= max) await cache.delete(keys[0]);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch (e) {
    return new Response('', { status: 503, statusText: 'Offline — not cached' });
  }
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const resp = await fetch(request);
    if (resp.ok && request.method === 'GET') cache.put(request, resp.clone());
    return resp;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'offline', cached: false }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}
