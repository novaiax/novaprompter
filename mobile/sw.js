// Service worker NovaPrompter mobile — cache-first pour offline
const CACHE = 'novaprompter-v1';
const FILES = [
  './',
  './index.html',
  './app.css',
  './app.js',
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
  // Cache-first pour les ressources de l'app
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      // Cache opportuniste pour Google Fonts
      if (req.url.includes('fonts.googleapis.com') || req.url.includes('fonts.gstatic.com')) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
