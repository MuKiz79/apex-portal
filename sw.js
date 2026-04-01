// Karriaro Service Worker v7 - Offline-Caching mit Stale-While-Revalidate
const CACHE_VERSION = 'karriaro-v7';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;

// App Shell: Kernressourcen die vorab gecached werden
const APP_SHELL_URLS = [
    '/',
    '/index.html',
    '/js/core.js',
    '/js/app.js',
    '/js/data.js',
    '/css/output.css',
    '/manifest.json'
];

// Patterns die NICHT gecached werden (dynamische API-Calls)
const NETWORK_ONLY_PATTERNS = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'api.stripe.com',
    'checkout.stripe.com',
    'api.daily.co',
    'cloudfunctions.net',
    'us-central1-apex-executive'
];

// CDN-Ressourcen mit langem Cache
const CDN_PATTERNS = [
    'gstatic.com/firebasejs',
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

// Install: App Shell precachen
self.addEventListener('install', (event) => {
    console.log('[SW] v7 - Installing with offline caching');
    event.waitUntil(
        caches.open(APP_SHELL_CACHE).then((cache) => {
            return cache.addAll(APP_SHELL_URLS).catch((err) => {
                console.warn('[SW] Einige Shell-Ressourcen konnten nicht gecached werden:', err);
            });
        })
    );
    self.skipWaiting();
});

// Activate: Alte Caches aufräumen
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => !name.startsWith(CACHE_VERSION))
                    .map((name) => {
                        console.log('[SW] Lösche alten Cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Strategie basierend auf Request-Typ
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Network-Only: API-Calls, Auth, Payments
    if (NETWORK_ONLY_PATTERNS.some(pattern => url.includes(pattern))) {
        return; // Browser handled den Request normal
    }

    // CDN-Ressourcen: Cache-First mit 7-Tage Expiry
    if (CDN_PATTERNS.some(pattern => url.includes(pattern))) {
        event.respondWith(
            caches.open(CDN_CACHE).then((cache) => {
                return cache.match(event.request).then((cached) => {
                    if (cached) return cached;
                    return fetch(event.request).then((response) => {
                        if (response.ok) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    });
                });
            }).catch(() => fetch(event.request))
        );
        return;
    }

    // Navigation-Requests: Network-First mit App-Shell-Fallback
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match('/index.html');
            })
        );
        return;
    }

    // Statische Assets (JS, CSS, Images): Stale-While-Revalidate
    if (event.request.destination === 'script' ||
        event.request.destination === 'style' ||
        event.request.destination === 'image' ||
        event.request.destination === 'font') {
        event.respondWith(
            caches.open(APP_SHELL_CACHE).then((cache) => {
                return cache.match(event.request).then((cached) => {
                    const fetchPromise = fetch(event.request).then((response) => {
                        if (response.ok) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    }).catch(() => cached);

                    return cached || fetchPromise;
                });
            })
        );
        return;
    }
});
