/* Aura service worker — offline cache with smart update strategy. */

// Bump this version whenever you deploy changes so old caches are evicted.
const CACHE = 'aura-shell-v4';

// Pre-cached on install. Everything else is cached on-demand by the fetch
// handler. This keeps the install step identical between the dev mode
// (./src/*.jsx) and the production build (./app.js + ./styles.css).
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
];

const OFFLINE_HTML = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aura — Offline</title><style>body{font-family:system-ui;text-align:center;padding:3rem;background:#fdf8f6;color:#5a3a44}h1{font-size:2rem}p{color:#8b5e6e}</style></head><body><h1>📵 Geen verbinding</h1><p>Verbind met internet om Aura te openen.</p></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => null)
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

  const url = new URL(req.url);
  const path = url.pathname;

  // ── Navigation: network-first, offline fallback to cached shell ──────
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match('./index.html').then(
          (cached) => cached || new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        )
      )
    );
    return;
  }

  // ── App code (.jsx / .js / .css): network-first so updates propagate ──
  // Falls back to cache when offline. Matches both dev mode (./src/*.jsx)
  // and the production build (./app.js + ./styles.css) without dispatch.
  const isAppCode = /\.(jsx|css)$/.test(path)
    || (path.endsWith('.js') && (path.includes('/src/') || path.endsWith('/app.js')));
  if (isAppCode) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ── Static assets: cache-first, populate on miss ─────────────────────
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
        return res;
      }).catch(() => null);
    })
  );
});
