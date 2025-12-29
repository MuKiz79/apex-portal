// APEX Executive Service Worker v2
const CACHE_VERSION = 'v2';
const CACHE_NAME = `apex-executive-${CACHE_VERSION}`;

// Install - don't pre-cache, just activate immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

// Activate - clean old caches and take control
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('apex-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - Network first, cache as fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip external APIs - let them go directly to network
  const skipHosts = [
    'firebaseio.com',
    'googleapis.com',
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'stripe.com',
    'js.stripe.com',
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'googletagmanager.com',
    'google-analytics.com'
  ];

  if (skipHosts.some(host => url.hostname.includes(host))) {
    return;
  }

  // Network first strategy for everything else
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache successful responses
        if (response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // For navigation requests, return cached index.html
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
