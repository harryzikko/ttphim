// CineViet - PWA Service Worker
const CACHE_NAME = 'cineviet-pwa-v1.2';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/',
  '/css/custom.css',
  '/css/site-footer.css?v=1.0.1'
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
  const url = new URL(event.request.url);
  // External images/embeds and private or streaming requests are browser-owned.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/api') || /\.(?:m3u8|ts|m4s|mp4|webm)(?:$|\/)/i.test(url.pathname)) return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      if (!STATIC_ASSETS.includes(url.pathname)) return Response.error();
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(event.request)) || Response.error();
    })
  );

});
