// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Service Worker (PWA offline support)                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

var CACHE_NAME = 'kia-emlab-v1';

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

// Activate: clean old caches
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(
                names.filter(function(n) { return n !== CACHE_NAME; })
                     .map(function(n) { return caches.delete(n); })
            );
        })
    );
    self.clients.claim();
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
