// Keep this cache version in sync with the visible app version when shipping changes.
const CACHE_NAME = 'iadvocate-shell-v1-10';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  const isAppRoute =
    request.mode === 'navigate' ||
    (request.destination === '' &&
      !url.pathname.includes('.') &&
      !url.pathname.startsWith('/__/'));

  if (isAppRoute) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
              }
              return null;
            })
            .catch(() => null)
        );
        return cached;
      }

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch (error) {
        return cached || new Response('', { status: 504, statusText: 'Gateway Timeout' });
      }
    }),
  );
});
