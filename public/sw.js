// KAEL service worker — just enough to make KAEL an installable app (PWA needs a
// SW with a fetch handler) and to load the shell instantly / offline.
//
// Strategy: the model API is ALWAYS network (never cached — replies, TTS audio,
// and listening capture must hit the live server). The static app shell is
// network-first so code changes show on the next load, with a cache fallback so
// the window still opens if the server is momentarily down (e.g. mid-restart).
const CACHE = 'kael-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                          // never touch POSTs (chat/tts/listen)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // ignore cross-origin
  if (url.pathname.startsWith('/api/')) return;              // API → always live network

  // Network-first for the shell; fall back to cache (then '/') when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('/')))
  );
});
