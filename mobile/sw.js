// Service worker NovaPrompter mobile — network-first pour les fichiers app
// (pour que les updates soient prises en compte rapidement), cache-first pour les assets externes.
const CACHE = 'novaprompter-v5';
const FILES = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './ui-tabs.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isAppFile = url.origin === self.location.origin;

  if (isAppFile) {
    // Network-first pour les fichiers de l'app : on tente le réseau, fallback cache
    // -> les updates sont prises en compte au prochain refresh.
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
  } else {
    // Cache-first pour les ressources externes (Google Fonts, MediaPipe CDN)
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        return res;
      }))
    );
  }
});
