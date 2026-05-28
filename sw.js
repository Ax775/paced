/* Paced service worker — offline cache with smart update strategy. */

// Bump this version whenever you deploy changes so old caches are evicted.
const CACHE = 'paced-shell-v1';

// Pre-cached on install. Everything else is cached on-demand by the fetch
// handler. This keeps the install step identical between the dev mode
// (./src/*.jsx) and the production build (./app.js + ./styles.css).
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/apple-touch-icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

const OFFLINE_HTML = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paced — Offline</title><style>body{font-family:system-ui;text-align:center;padding:3rem;background:#fdf8f6;color:#5a3a44}h1{font-size:2rem}p{color:#8b5e6e}</style></head><body><h1>📵 Geen verbinding</h1><p>Verbind met internet om Paced te openen.</p></body></html>`;

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

// Only persist responses that are (a) same-origin, (b) a real HTTP success,
// and (c) of a basic CORS type. This blocks cache-poisoning vectors where a
// transient redirect, error page, or opaque cross-origin response would
// otherwise be persisted under a trusted URL key.
function isCacheable(req, res) {
  if (!res || !res.ok) return false;
  if (res.status !== 200) return false;
  if (res.type !== 'basic') return false;
  try {
    const reqOrigin = new URL(req.url).origin;
    if (reqOrigin !== self.location.origin) return false;
  } catch { return false; }
  return true;
}

function safeCachePut(req, res) {
  if (!isCacheable(req, res)) return;
  caches.open(CACHE).then((c) => c.put(req, res)).catch(() => null);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Only handle same-origin requests. Cross-origin (analytics, fonts, ...)
  // bypass the SW entirely so we never accidentally cache a third-party
  // response under our origin.
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

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
          safeCachePut(req, res.clone());
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
        safeCachePut(req, res.clone());
        return res;
      }).catch(() => null);
    })
  );
});
