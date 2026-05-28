/* RoadSoS Service Worker — Offline Support */

const CACHE_NAME = 'roadsos-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/crash.js',
  '/js/firstaid.js',
  '/js/blueprint.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// Tile cache — store last-viewed map tiles
const TILE_CACHE = 'roadsos-tiles-v1';
const TILE_MAX = 500;

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== TILE_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', evt => {
  const url = new URL(evt.request.url);

  // Map tiles — cache-first
  if (url.hostname.includes('tile.openstreetmap.org')) {
    evt.respondWith(cacheTile(evt.request));
    return;
  }

  // API calls — network-first, no offline fallback (app.js handles that)
  if (url.pathname.startsWith('/api/')) {
    evt.respondWith(
      fetch(evt.request).catch(() => new Response(
        JSON.stringify({ error: 'offline' }),
        { headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Static assets — cache-first
  evt.respondWith(
    caches.match(evt.request).then(cached => cached || fetch(evt.request).then(resp => {
      if (resp.ok) {
        caches.open(CACHE_NAME).then(c => c.put(evt.request, resp.clone()));
      }
      return resp;
    }))
  );
});

async function cacheTile(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const resp = await fetch(request);
    if (resp.ok) {
      // Evict oldest tile if over limit
      const keys = await cache.keys();
      if (keys.length >= TILE_MAX) await cache.delete(keys[0]);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch (e) {
    return new Response('', { status: 503 });
  }
}
