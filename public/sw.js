const CACHE_NAME = 'webide-cache-v1';
const urlsToCache = [
  '/',
  '/ide',
  '/favicon.ico',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // We only cache the core routes. Next.js assets are cached dynamically.
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // We only want to intercept basic navigation and static assets
  // We don't want to intercept API calls or external CDN scripts (like Pyodide)
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Cache-first for Next.js static assets (_next/static)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then(response => {
        if (response) return response;
        return fetch(event.request).then(fetchRes => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, fetchRes.clone());
            return fetchRes;
          });
        });
      })
    );
    return;
  }

  // Network-first for everything else (pages, etc.) to ensure fresh content
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Don't cache non-successful responses or external CDN stuff aggressively
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        
        return response;
      })
      .catch(() => {
        // If network fails (offline), try the cache
        return caches.match(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
