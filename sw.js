// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Service Worker (PWA offline support)                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

// [Fase 4.3] Cache version — build.sh reemplaza el placeholder en sw.build.js
// (NUNCA editar este valor a mano ni dejar un timestamp pegado aquí: si el
// placeholder desaparece, el SW queda byte-idéntico entre deploys y ningún
// dispositivo vuelve a recibir actualizaciones — pasó del 28/abr al 02/jul/2026)
var CACHE_VERSION = '__BUILD_VERSION__';
var CACHE_NAME = 'kia-emlab-v' + CACHE_VERSION;

var CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/signature_pad/1.5.3/signature_pad.min.js',
    // [v23.2] jsPDF salió de esta lista: ya vive en vendor/jspdf.umd.min.js y la
    // app no lo pide al CDN, así que precachearlo era descargar 364 KB para nada
    // en cada versión nueva (el SW borra toda la caché al activarse).
    'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js'
];

// [2.28.1] Librerías servidas por el propio sitio (vendor/). Se precargan para que
// funcionen sin red desde la primera instalación; después las sirve el network-first.
var LOCAL_ASSETS = ['./vendor/chart.umd.min.js'];

// Install: precache CDN assets
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('[SW] Precaching CDN assets...');
            return Promise.all([
                cache.addAll(LOCAL_ASSETS).catch(function(err) {
                    console.warn('[SW] Local assets failed to cache:', err);
                }),
                cache.addAll(CDN_ASSETS).catch(function(err) {
                    console.warn('[SW] Some CDN assets failed to cache:', err);
                })
            ]);
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

// [2.37.0] Avisos del laboratorio (Web Push). El proceso de GitHub Actions
// (tools/daily-digest.node.js) envía {title, body, url, tag}; aquí solo se muestra.
self.addEventListener('push', function(event) {
    var p = {};
    try { p = event.data ? event.data.json() : {}; } catch (e) { p = { body: event.data ? event.data.text() : '' }; }
    event.waitUntil(self.registration.showNotification(p.title || 'EmLab', {
        body: p.body || '',
        tag: p.tag || 'emlab-aviso',
        data: { url: p.url || self.registration.scope }
    }));
});

// Tocar la notificación enfoca la app si ya está abierta; si no, la abre.
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    var url = (event.notification.data && event.notification.data.url) || self.registration.scope;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) return list[i].focus();
        }
        return self.clients.openWindow ? self.clients.openWindow(url) : null;
    }));
});
