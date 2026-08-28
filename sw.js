const CACHE_NAME = 'split-v14';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/currency.js',
  './js/currencyPicker.js',
  './js/state.js',
  './js/settlement.js',
  './js/jsonbin.js',
  './js/eventsourcing.js',
  './js/qrcode.js',
  './js/components.js',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => {
        if (k !== CACHE_NAME) return caches.delete(k);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('ntfy.sh') || e.request.url.includes('open.er-api.com') || e.request.url.includes('frankfurter.app') || e.request.url.includes('jsdelivr.net') || e.request.url.includes('api.jsonbin.io')) {
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      return cached || fetch(e.request).then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, response.clone());
          return response;
        });
      });
    }).catch(() => caches.match('./index.html'))
  );
});
