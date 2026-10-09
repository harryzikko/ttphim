// KKPhim - Mobile PWA Service Worker
const CACHE_NAME = 'kkphim-mobile-v1.0';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/mobile',
  '/mobile/css/mobile.css',
  '/mobile/js/mobile-app.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((e) => console.log('SW cache error', e));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass API and streaming video requests straight to network
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api') || url.pathname.includes('.m3u8') || url.pathname.includes('.ts')) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
