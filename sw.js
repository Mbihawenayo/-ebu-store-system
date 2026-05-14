const CACHE_NAME = 'ebu-store-v1';
const ASSETS = [
  'login.html',
  'index.html',
  'css/style.css',
  'js/script.js',
  'images/logo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
