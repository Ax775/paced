/* Aura service worker — simple offline cache-first shell. */
const CACHE = 'aura-shell-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './public/icon-192.png',
  './public/icon-512.png',
  './src/app.jsx',
  './src/lib/cycle.js',
  './src/lib/nutrition.js',
  './src/lib/insights.js',
  './src/lib/storage.js',
];

// CDN assets cached best-effort. Babel standalone (~850 KB) is intentionally
// excluded — it often triggers CORS preflight issues in SW installs and would
// delay activation. It's fetched fresh on first load and then cached by the
// fetch handler below.
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://esm.sh/react@18',
  'https://esm.sh/react@18/jsx-runtime',
  'https://esm.sh/react-dom@18/client',
  'https://esm.sh/lucide-react@0.441.0?deps=react@18',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // App shell — must succeed.
      await cache.addAll(ASSETS).catch(() => null);
      // CDN assets — best-effort, don't block install on failure.
      await Promise.all(
        CDN_ASSETS.map((url) =>
          cache.add(url).catch(() => null)
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for navigation so updates land quickly; cache fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for static assets.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
        return res;
      }).catch(() => hit);
    })
  );
});
