/* Aura service worker — network-first navigation, cache-first hashed assets. */
const CACHE = 'aura-shell-v3';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/assets/icon.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/splash/640x1136.png',
  '/assets/splash/750x1334.png',
  '/assets/splash/1125x2436.png',
  '/assets/splash/1170x2532.png',
  '/assets/splash/1179x2556.png',
  '/assets/splash/1242x2688.png',
  '/assets/splash/1290x2796.png',
  '/assets/splash/1536x2048.png',
  '/assets/splash/1668x2388.png',
  '/assets/splash/2048x2732.png',
];

const OFFLINE_HTML = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aura — Offline</title><style>body{font-family:system-ui;text-align:center;padding:3rem;background:#FBF9F3;color:#3E3B33}h1{font-size:1.5rem}p{color:#5F5A4E}</style></head><body><h1>Geen verbinding</h1><p>Verbind met internet om Aura te openen.</p></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => null)
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

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for navigation so updates land quickly.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .catch(() =>
          caches.match('/').then(
            (cached) => cached || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
          )
        )
    );
    return;
  }

  // Cache-first for static assets (Vite hashes filenames so cached entries stay valid forever).
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
        }
        return res;
      }).catch(() => hit);
    })
  );
});
