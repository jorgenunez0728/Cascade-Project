// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Service Worker (PWA offline support)                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

// [Fase 4.3] Cache version — 202604281821 is replaced by build.sh
var CACHE_VERSION = '202604281821';
var CACHE_NAME = 'kia-emlab-v' + CACHE_VERSION;

var CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/signature_pad/1.5.3/signature_pad.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.7/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js',
    'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js'
];

// Install: precache CDN assets
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('[SW] Precaching CDN assets...');
            return cache.addAll(CDN_ASSETS).catch(function(err) {
                console.warn('[SW] Some CDN assets failed to cache:', err);
            });
        })
    );
    self.skipWaiting();
});

// [Fase 4.3] Activate: delete all old caches that don't match current version, then notify clients
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(function(name) { return name !== CACHE_NAME; })
                    .map(function(name) {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(function() {
            return self.clients.claim();
        }).then(function() {
            // Notify all clients that a new SW version is active
            return self.clients.matchAll().then(function(clients) {
                clients.forEach(function(client) {
                    client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
                });
            });
        })
    );
});

// [Fase 4.3] Message listener: allow app to trigger skipWaiting for update notifications
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Fetch: Cache-First for CDN, Network-First for app files
self.addEventListener('fetch', function(event) {
    var url = event.request.url;

    // CDN assets: cache-first
    var isCDN = CDN_ASSETS.some(function(cdn) { return url === cdn; });
    if (isCDN) {
        event.respondWith(
            caches.match(event.request).then(function(cached) {
                return cached || fetch(event.request).then(function(response) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
                    return response;
                });
            })
        );
        return;
    }

    // App files: network-first with cache fallback
    if (event.request.method === 'GET') {
        event.respondWith(
            fetch(event.request).then(function(response) {
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
                return response;
            }).catch(function() {
                return caches.match(event.request);
            })
        );
    }
});
