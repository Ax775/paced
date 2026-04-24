/* Aura service worker — simple offline cache-first shell. */
const CACHE = 'aura-shell-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './src/app.jsx',
  './src/lib/cycle.js',
  './src/lib/nutrition.js',
  './src/lib/insights.js',
  './src/lib/storage.js',
];

const OFFLINE_HTML = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aura — Offline</title><style>body{font-family:system-ui;text-align:center;padding:3rem;background:#fdf8f6;color:#5a3a44}h1{font-size:2rem}p{color:#8b5e6e}</style></head><body><h1>📵 Geen verbinding</h1><p>Verbind met internet om Aura te openen.</p></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => null)
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

  // Network-first for navigation so updates land quickly; offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .catch(() =>
          caches.match('./index.html').then(
            (cached) => cached || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
          )
        )
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
