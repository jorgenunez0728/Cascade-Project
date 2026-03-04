// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Firebase Cloud Sync (Optional)                       ║
// ║  Works alongside localStorage — app stays 100% offline-capable    ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── Configuration ──
var FIREBASE_CONFIG = {
    apiKey: "AIzaSyBubzcRhL6FN91pKalxTnUfGULwrSvY9q4",
    authDomain: "kia-emlab-test-system.firebaseapp.com",
    projectId: "kia-emlab-test-system",
    storageBucket: "kia-emlab-test-system.firebasestorage.app",
    messagingSenderId: "1059552115443",
    appId: "1:1059552115443:web:256800a7fdba6f85901586",
    measurementId: "G-M3X2Q8WTDC"
};

// ── Selective Module Sync ──
var FB_SYNC_MODULES_KEY = 'kia_fb_sync_modules';
var fbSyncModules = JSON.parse(localStorage.getItem(FB_SYNC_MODULES_KEY)) || {
    cop15: true, testplan: true, results: true, inventory: true, panel: true
};
function fbSaveSyncModules() {
    localStorage.setItem(FB_SYNC_MODULES_KEY, JSON.stringify(fbSyncModules));
}

// ── Offline Queue ──
var FB_QUEUE_LS_KEY = 'kia_fb_offline_queue';
var fbOfflineQueue = [];
function fbQueueLoad() {
    try { fbOfflineQueue = JSON.parse(localStorage.getItem(FB_QUEUE_LS_KEY)) || []; }
    catch(e) { fbOfflineQueue = []; }
}
function fbQueueSave() {
    try { localStorage.setItem(FB_QUEUE_LS_KEY, JSON.stringify(fbOfflineQueue)); }
    catch(e) { console.warn('FB Queue: localStorage full'); }
}
function fbQueueAdd(collection, data) {
    fbOfflineQueue.push({
        id: Date.now().toString(36),
        collection: collection,
        data: data,
        timestamp: new Date().toISOString(),
        retries: 0
    });
    if (fbOfflineQueue.length > 50) fbOfflineQueue = fbOfflineQueue.slice(-50);
    fbQueueSave();
    fbUpdateIndicator();
}
function fbQueueRetry() {
    if (fbOfflineQueue.length === 0) return;
    if (!fbSync.enabled || !fbSync.db || !fbSync.stationId) return;
    var item = fbOfflineQueue[0];
    var quota = fbQuotaCheck('write');
    if (!quota.allowed) return;
    var docRef = fbSync.db.collection('stations').doc(fbSync.stationId)
        .collection(item.collection).doc('current');
    docRef.set({
        data: item.data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        station: fbSync.stationId
    }).then(function() {
        fbQuotaRecord('write');
        fbOfflineQueue.shift();
        fbQueueSave();
        fbUpdateIndicator();
        if (fbOfflineQueue.length > 0) setTimeout(fbQueueRetry, 3000);
    }).catch(function(err) {
        item.retries = (item.retries || 0) + 1;
        if (item.retries > 10) { fbOfflineQueue.shift(); fbQueueSave(); }
    });
}

// ── State ──
var fbSync = {
    enabled: false,
    db: null,
    stationId: '',
    lastSync: null,
    status: 'off',      // 'off' | 'connecting' | 'connected' | 'syncing' | 'error'
    lastError: '',
    debounceTimers: {},
    _persistenceAttempted: false,  // Track if enablePersistence was already called
    _initialized: false,           // Track if fbInit completed setup
    _onlineListenerAdded: false,   // Prevent duplicate event listeners
    _useREST: false                // Fall back to REST API if SDK transport broken
};

// Detect if we're on a non-standard origin (content://, file://)
var FB_IS_HTTP_ORIGIN = (location.protocol === 'http:' || location.protocol === 'https:');

// ── Rate Limiter & Quota ──
var FB_QUOTA_LS_KEY = 'kia_fb_quota';
var FB_QUOTA_LIMITS = {
    maxWritesPerHour: 60,       // Max Firestore writes per hour
    maxReadsPerHour: 120,       // Max Firestore reads per hour
    maxWritesPerDay: 500,       // Max Firestore writes per day
    maxReadsPerDay: 2000,       // Max Firestore reads per day
    maxPayloadKB: 900,          // Max payload size in KB (Firestore limit is 1MB)
    cooldownAfterBurstMs: 30000 // 30s cooldown after hitting hourly limit
};

var fbQuota = {
    writes: [],   // timestamps of write operations
    reads: [],    // timestamps of read operations
    blocked: 0,   // count of blocked operations today
    dailyDate: '' // date string for daily reset
};

function fbQuotaLoad() {
    try {
        var saved = JSON.parse(localStorage.getItem(FB_QUOTA_LS_KEY));
        if (saved) {
            fbQuota = saved;
            // Reset if new day
            var today = new Date().toISOString().slice(0, 10);
            if (fbQuota.dailyDate !== today) {
                fbQuota.writes = [];
                fbQuota.reads = [];
                fbQuota.blocked = 0;
                fbQuota.dailyDate = today;
            }
        } else {
            fbQuota.dailyDate = new Date().toISOString().slice(0, 10);
        }
    } catch(e) {
        fbQuota.dailyDate = new Date().toISOString().slice(0, 10);
    }
}

function fbQuotaSave() {
    try {
        localStorage.setItem(FB_QUOTA_LS_KEY, JSON.stringify(fbQuota));
    } catch(e) {}
}

// Prune timestamps older than 1 hour from array
function fbQuotaPrune(arr) {
    var cutoff = Date.now() - 3600000;
    while (arr.length > 0 && arr[0] < cutoff) arr.shift();
}

// Check if operation is allowed. type = 'write' | 'read'
function fbQuotaCheck(type) {
    var today = new Date().toISOString().slice(0, 10);
    if (fbQuota.dailyDate !== today) {
        fbQuota.writes = [];
        fbQuota.reads = [];
        fbQuota.blocked = 0;
        fbQuota.dailyDate = today;
    }

    fbQuotaPrune(fbQuota.writes);
    fbQuotaPrune(fbQuota.reads);

    var arr = type === 'write' ? fbQuota.writes : fbQuota.reads;
    var hourlyLimit = type === 'write' ? FB_QUOTA_LIMITS.maxWritesPerHour : FB_QUOTA_LIMITS.maxReadsPerHour;
    var dailyLimit = type === 'write' ? FB_QUOTA_LIMITS.maxWritesPerDay : FB_QUOTA_LIMITS.maxReadsPerDay;
    var dailyCount = type === 'write' ? fbQuota.writes.length : fbQuota.reads.length;

    // Check hourly
    if (arr.length >= hourlyLimit) {
        fbQuota.blocked++;
        fbQuotaSave();
        return { allowed: false, reason: 'Limite por hora alcanzado (' + hourlyLimit + ' ' + type + 's/hora). Espera unos minutos.' };
    }
    // Check daily
    if (dailyCount >= dailyLimit) {
        fbQuota.blocked++;
        fbQuotaSave();
        return { allowed: false, reason: 'Limite diario alcanzado (' + dailyLimit + ' ' + type + 's/dia). Se reinicia manana.' };
    }

    return { allowed: true };
}

// Record an operation
function fbQuotaRecord(type) {
    var arr = type === 'write' ? fbQuota.writes : fbQuota.reads;
    arr.push(Date.now());
    fbQuotaSave();
}

// Check payload size before push
function fbQuotaCheckSize(data) {
    try {
        var json = JSON.stringify(data);
        var sizeKB = Math.round(json.length / 1024);
        if (sizeKB > FB_QUOTA_LIMITS.maxPayloadKB) {
            return { allowed: false, sizeKB: sizeKB, reason: 'Payload demasiado grande: ' + sizeKB + 'KB (limite: ' + FB_QUOTA_LIMITS.maxPayloadKB + 'KB)' };
        }
        return { allowed: true, sizeKB: sizeKB };
    } catch(e) {
        return { allowed: true, sizeKB: 0 };
    }
}

// Get current usage stats for UI
function fbQuotaStats() {
    fbQuotaPrune(fbQuota.writes);
    fbQuotaPrune(fbQuota.reads);
    return {
        writesThisHour: fbQuota.writes.length,
        readsThisHour: fbQuota.reads.length,
        writesToday: fbQuota.writes.length,
        readsToday: fbQuota.reads.length,
        blockedToday: fbQuota.blocked,
        maxWritesHour: FB_QUOTA_LIMITS.maxWritesPerHour,
        maxReadsHour: FB_QUOTA_LIMITS.maxReadsPerHour,
        maxWritesDay: FB_QUOTA_LIMITS.maxWritesPerDay,
        maxReadsDay: FB_QUOTA_LIMITS.maxReadsPerDay
    };
}

// ── Initialize Firebase ──
function fbInit() {
    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
        fbSync.status = 'off';
        fbSync.lastError = '';
        fbUpdateIndicator();
        return;
    }

    if (typeof firebase === 'undefined') {
        fbSync.status = 'error';
        fbSync.lastError = 'Firebase SDK no cargado. Verifica conexion a internet.';
        fbUpdateIndicator();
        return;
    }

    // If already initialized, just re-test connection instead of full re-init
    if (fbSync._initialized && (fbSync.db || fbSync._useREST)) {
        fbSync.status = 'connecting';
        fbSync.lastError = '';
        fbUpdateIndicator();
        (FB_IS_HTTP_ORIGIN ? fbAnonymousAuth() : Promise.resolve()).then(function() {
            fbTestConnectionWithRetry(2, function(ok) {
                if (ok) {
                    fbSync.status = 'connected';
                    fbUpdateIndicator();
                    if (fbSync.stationId) {
                        fbPullAll();
                    }
                    if (fbOfflineQueue.length > 0) setTimeout(fbQueueRetry, 3000);
                }
            });
        });
        return;
    }

    fbQuotaLoad();
    fbQueueLoad();

    // Auto-retry queued items when connection recovers (only add listener once)
    if (!fbSync._onlineListenerAdded) {
        fbSync._onlineListenerAdded = true;
        window.addEventListener('online', function() {
            if (fbSync.enabled && fbOfflineQueue.length > 0) {
                setTimeout(function() {
                    fbTestConnection(function(ok) {
                        if (ok) { fbSync.status = 'connected'; fbUpdateIndicator(); fbQueueRetry(); }
                    });
                }, 2000);
            }
        });
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        fbSync.db = firebase.firestore();

        // Configure Firestore settings BEFORE any other operations
        // MUST be called before enablePersistence() or any get/set/onSnapshot
        try {
            var fsSettings = { merge: true };
            if (!FB_IS_HTTP_ORIGIN) {
                // On content:// or file:// origins, WebSocket/WebChannel hangs.
                // Force HTTP long polling — skips WebSocket entirely.
                fsSettings.experimentalForceLongPolling = true;
                console.log('Firebase: Forcing long polling (origin: ' + location.protocol + ')');
            } else {
                // On http/https, auto-detect WebSocket vs long polling
                fsSettings.experimentalAutoDetectLongPolling = true;
            }
            fbSync.db.settings(fsSettings);
        } catch(settingsErr) {
            // Settings may fail if already applied — safe to ignore
            console.warn('Firebase: Settings already applied:', settingsErr.message);
        }

        fbSync.stationId = localStorage.getItem('kia_fb_station') || '';
        fbSync.enabled = true;
        fbSync.status = 'connecting';
        fbSync.lastError = '';
        fbUpdateIndicator();

        console.log('Firebase Sync: SDK initialized for project ' + FIREBASE_CONFIG.projectId);

        // Chain: persistence → anonymous auth → connection test
        // Skip persistence on non-http origins (content://, file://) where IndexedDB may not work
        var persistencePromise;
        if (!fbSync._persistenceAttempted && FB_IS_HTTP_ORIGIN) {
            fbSync._persistenceAttempted = true;
            persistencePromise = fbSync.db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
                if (err.code === 'failed-precondition') {
                    console.warn('Firebase: Multiple tabs open, persistence only in one.');
                } else if (err.code === 'unimplemented') {
                    console.warn('Firebase: Persistence not supported in this browser.');
                } else {
                    console.warn('Firebase: Persistence error (non-blocking):', err.message);
                }
            });
        } else {
            fbSync._persistenceAttempted = true;
            persistencePromise = Promise.resolve();
        }

        persistencePromise.then(function() {
            // Skip anonymous auth on non-HTTP origins — signInAnonymously() may hang
            // on content:// protocol and poison the SDK internal state.
            // Rules should be "allow read, write: if true;" which doesn't require auth.
            if (FB_IS_HTTP_ORIGIN) {
                return fbAnonymousAuth();
            }
            console.log('Firebase: Skipping anonymous auth on ' + location.protocol + ' origin');
            return Promise.resolve();
        }).then(function() {
            fbSync._initialized = true;
            // Now test connection (with retry)
            fbTestConnectionWithRetry(2, function(ok) {
                if (ok) {
                    fbSync.status = 'connected';
                    fbUpdateIndicator();
                    if (fbSync.stationId) {
                        fbPullAll();
                        fbBackupCheck();
                    }
                    // Drain offline queue
                    if (fbOfflineQueue.length > 0) setTimeout(fbQueueRetry, 3000);
                }
            });
        }).catch(function(chainErr) {
            console.error('Firebase init chain error:', chainErr);
            fbSync._initialized = true;
            fbSync.status = 'error';
            fbSync.lastError = 'Error en inicializacion: ' + (chainErr.message || chainErr);
            fbUpdateIndicator();
        });

    } catch (err) {
        console.error('Firebase Sync: Init error', err);
        fbSync.status = 'error';
        fbSync.lastError = 'Error al inicializar: ' + err.message;
        fbUpdateIndicator();
    }
}

// ── Anonymous Auth (for security rules that require auth) ──
function fbAnonymousAuth() {
    // Skip auth on non-HTTP origins — signInAnonymously() uses HTTP requests
    // that may hang on content:// or file:// protocols, poisoning SDK state
    if (!FB_IS_HTTP_ORIGIN) {
        console.log('Firebase: Skipping auth on non-HTTP origin');
        return Promise.resolve();
    }

    try {
        var auth = firebase.auth();
        if (auth.currentUser) {
            return Promise.resolve(); // Already signed in
        }
        // Race against a timeout — auth should not block initialization
        var authPromise = auth.signInAnonymously().then(function() {
            console.log('Firebase: Anonymous auth OK');
        }).catch(function(err) {
            // Auth might not be enabled — that's OK if rules use "if true"
            console.warn('Firebase: Anonymous auth failed (if rules use "if true" this is OK):', err.code || err.message);
        });
        var timeoutPromise = new Promise(function(resolve) {
            setTimeout(function() {
                console.warn('Firebase: Anonymous auth timed out after 10s, continuing without auth');
                resolve();
            }, 10000);
        });
        return Promise.race([authPromise, timeoutPromise]);
    } catch(e) {
        console.warn('Firebase: Auth not available:', e.message);
        return Promise.resolve(); // Continue without auth
    }
}

// ── Connection Test with Retry ──
function fbTestConnectionWithRetry(retriesLeft, callback) {
    fbTestConnection(function(ok) {
        if (ok) {
            if (callback) callback(true);
        } else if (retriesLeft > 0) {
            console.log('Firebase: Retrying connection in 3s... (' + retriesLeft + ' left)');
            setTimeout(function() {
                fbTestConnectionWithRetry(retriesLeft - 1, callback);
            }, 3000);
        } else {
            if (callback) callback(false);
        }
    });
}

// ── Connection Test (with REST API fallback) ──
function fbTestConnection(callback) {
    if (!fbSync.db) {
        fbSync.status = 'error';
        fbSync.lastError = 'Firestore no inicializado.';
        fbUpdateIndicator();
        if (callback) callback(false);
        return;
    }

    var done = false;
    var sdkTimedOut = false;

    // Timeout: if Firestore SDK doesn't respond in 12s, try REST API fallback
    var timeout = setTimeout(function() {
        if (done) return;
        sdkTimedOut = true;
        console.warn('Firebase: SDK connection test timed out, trying REST API fallback...');
        fbTestConnectionREST(function(restOk) {
            if (done) return;
            done = true;
            if (restOk) {
                // REST works but SDK doesn't — SDK transport is broken
                fbSync._useREST = true;
                console.log('Firebase: REST API works — using REST fallback mode');
                if (callback) callback(true);
            } else {
                fbSync.status = 'error';
                fbSync.lastError = 'No se puede conectar a Firestore.\nVerifica:\n1. Conexion a internet\n2. Que la base de datos Firestore exista en Firebase Console\n3. Que Firestore Rules permitan acceso';
                fbUpdateIndicator();
                if (callback) callback(false);
            }
        });
    }, 12000);

    fbQuotaRecord('read');
    fbSync.db.collection('_ping').doc('test').get({ source: 'server' }).then(function() {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        if (callback) callback(true);
    }).catch(function(err) {
        if (done || sdkTimedOut) return;
        done = true;
        clearTimeout(timeout);
        console.error('Firebase connection test failed:', err);
        fbSync.status = 'error';

        if (err.code === 'permission-denied') {
            fbSync.lastError = 'Acceso denegado. Revisa en Firebase Console:\n1. Authentication > Sign-in method > Anonymous (habilitar)\n2. Firestore > Rules > allow read, write: if true;';
        } else if (err.code === 'unavailable') {
            fbSync.lastError = 'Firestore no disponible. Verifica:\n1. Conexion a internet\n2. Que la base de datos Firestore exista (Firebase Console > Firestore Database > Create Database)';
        } else if (err.code === 'not-found') {
            if (callback) { callback(true); return; }
        } else {
            fbSync.lastError = 'Error de conexion (' + (err.code || '?') + '): ' + (err.message || 'desconocido');
        }

        fbUpdateIndicator();
        if (callback) callback(false);
    });
}

// ── REST API Connection Test (bypasses Firestore SDK transport layer) ──
function fbTestConnectionREST(callback) {
    if (typeof fetch === 'undefined') { callback(false); return; }

    // Try to read a document via Firestore REST API using just the API key.
    // Any HTTP response (200, 404, 403) means the server is reachable.
    var url = 'https://firestore.googleapis.com/v1/projects/' +
        FIREBASE_CONFIG.projectId + '/databases/(default)/documents/_ping/test?key=' +
        FIREBASE_CONFIG.apiKey;

    var restTimeout = setTimeout(function() { callback(false); }, 10000);

    fetch(url).then(function(resp) {
        clearTimeout(restTimeout);
        // 200 = found, 404 = not found (but server responded), 403 = rules block
        // All mean the server IS reachable
        console.log('Firebase REST API test: HTTP ' + resp.status);
        callback(true);
    }).catch(function(err) {
        clearTimeout(restTimeout);
        console.error('Firebase REST API test failed:', err);
        callback(false);
    });
}

// ── REST API Base URL helper ──
function fbRESTUrl(collection, docId) {
    return 'https://firestore.googleapis.com/v1/projects/' +
        FIREBASE_CONFIG.projectId + '/databases/(default)/documents/stations/' +
        encodeURIComponent(fbSync.stationId) + '/' + collection + '/' + docId +
        '?key=' + FIREBASE_CONFIG.apiKey;
}

// ── REST API Push (fallback when SDK transport is broken) ──
function fbPushREST(collection, data, onDone) {
    if (typeof fetch === 'undefined') { if (onDone) onDone(false, 'fetch no disponible'); return; }

    var url = fbRESTUrl(collection, 'current');
    var body = {
        fields: {
            data: fbToFirestoreValue(data),
            station: { stringValue: fbSync.stationId },
            updatedAt: { timestampValue: new Date().toISOString() }
        }
    };

    fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function(resp) {
        if (resp.ok) {
            fbQuotaRecord('write');
            fbSync.lastSync = new Date();
            fbSync.status = 'connected';
            fbSync.lastError = '';
            fbUpdateIndicator();
            if (onDone) onDone(true);
        } else {
            return resp.text().then(function(t) {
                var msg = 'Error REST push (' + resp.status + ')';
                try { msg = JSON.parse(t).error.message || msg; } catch(e) {}
                fbSync.status = 'error';
                fbSync.lastError = msg;
                fbUpdateIndicator();
                if (onDone) onDone(false, msg);
            });
        }
    }).catch(function(err) {
        fbSync.status = 'error';
        fbSync.lastError = 'Error de red al subir ' + collection;
        fbUpdateIndicator();
        fbQueueAdd(collection, data);
        if (onDone) onDone(false, fbSync.lastError);
    });
}

// ── REST API Pull (fallback when SDK transport is broken) ──
function fbPullREST(collection, onDone) {
    if (typeof fetch === 'undefined') { if (onDone) onDone(null); return; }

    var url = fbRESTUrl(collection, 'current');

    fetch(url).then(function(resp) {
        if (resp.ok) {
            return resp.json().then(function(doc) {
                fbQuotaRecord('read');
                if (doc && doc.fields && doc.fields.data) {
                    var data = fbFromFirestoreValue(doc.fields.data);
                    if (onDone) onDone(data);
                } else {
                    if (onDone) onDone(null);
                }
            });
        } else {
            if (onDone) onDone(null);
        }
    }).catch(function(err) {
        console.error('REST pull error (' + collection + '):', err);
        if (onDone) onDone(null);
    });
}

// ── Convert JS value → Firestore REST API value format ──
function fbToFirestoreValue(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
        return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    }
    if (typeof val === 'string') return { stringValue: val };
    if (Array.isArray(val)) {
        return { arrayValue: { values: val.map(fbToFirestoreValue) } };
    }
    if (typeof val === 'object') {
        var fields = {};
        Object.keys(val).forEach(function(k) {
            fields[k] = fbToFirestoreValue(val[k]);
        });
        return { mapValue: { fields: fields } };
    }
    return { stringValue: String(val) };
}

// ── Convert Firestore REST API value → JS value ──
function fbFromFirestoreValue(v) {
    if (!v) return null;
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return parseInt(v.integerValue, 10);
    if ('doubleValue' in v) return v.doubleValue;
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) {
        return (v.arrayValue.values || []).map(fbFromFirestoreValue);
    }
    if ('mapValue' in v) {
        var obj = {};
        var fields = v.mapValue.fields || {};
        Object.keys(fields).forEach(function(k) {
            obj[k] = fbFromFirestoreValue(fields[k]);
        });
        return obj;
    }
    return null;
}

function fbTestConnectionUI() {
    showToast('Probando conexion...', 'info');

    // If Firebase not initialized yet, run full init first
    if (!fbSync.db || !fbSync.enabled) {
        fbInit();
        // Wait for the async init chain (persistence → auth → test)
        setTimeout(function() {
            if (fbSync.status === 'connected') {
                showToast('Conexion a Firestore exitosa', 'success');
            } else if (fbSync.status === 'error') {
                showToast(fbSync.lastError || 'No se pudo conectar a Firestore', 'error');
            } else {
                showToast('Conectando... intenta de nuevo en unos segundos', 'info');
            }
            fbShowSettings();
        }, 8000); // Wait for init chain (persistence + auth + test with retries)
        return;
    }

    fbTestConnection(function(ok) {
        if (ok) {
            fbSync.status = 'connected';
            fbSync.lastError = '';
            fbUpdateIndicator();
            showToast('Conexion a Firestore exitosa', 'success');
        } else {
            showToast(fbSync.lastError || 'No se pudo conectar a Firestore', 'error');
        }
        fbShowSettings();
    });
}

// ── Station ID Management ──
function fbSetStation(id) {
    if (!id || !id.trim()) {
        showToast('Ingresa un ID de estacion', 'error');
        return;
    }
    fbSync.stationId = id.trim().toUpperCase();
    localStorage.setItem('kia_fb_station', fbSync.stationId);
    fbUpdateIndicator();
    showToast('Estacion guardada: ' + fbSync.stationId, 'success');
    if (fbSync.enabled) { fbUpdateStationMeta(); fbPushAll(); }
    var modal = document.getElementById('fbModal');
    if (modal && modal.style.display === 'block') fbShowSettings();
}

// ── Update station metadata document (makes station discoverable by other devices) ──
var _fbStationMetaTimer = null;
function fbUpdateStationMeta() {
    if (!fbSync.enabled || !fbSync.stationId) return;
    // Debounce — only write metadata once per 10s even if multiple pushes happen
    if (_fbStationMetaTimer) clearTimeout(_fbStationMetaTimer);
    _fbStationMetaTimer = setTimeout(function() {
        var deviceName = localStorage.getItem('kia_fb_device_name') || fbSync.stationId;
        var meta = {
            stationId: fbSync.stationId,
            deviceName: deviceName,
            lastPush: new Date().toISOString(),
            userAgent: (navigator.userAgent || '').substring(0, 120)
        };
        if (fbSync._useREST) {
            // REST: write station parent document
            var url = 'https://firestore.googleapis.com/v1/projects/' +
                FIREBASE_CONFIG.projectId + '/databases/(default)/documents/stations/' +
                encodeURIComponent(fbSync.stationId) + '?key=' + FIREBASE_CONFIG.apiKey;
            fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: {
                    stationId: { stringValue: meta.stationId },
                    deviceName: { stringValue: meta.deviceName },
                    lastPush: { stringValue: meta.lastPush },
                    userAgent: { stringValue: meta.userAgent }
                }})
            }).catch(function(e) { console.warn('Station meta REST error:', e); });
        } else if (fbSync.db) {
            fbSync.db.collection('stations').doc(fbSync.stationId).set(meta, { merge: true })
                .catch(function(e) { console.warn('Station meta write error:', e); });
        }
    }, 3000);
}

// ── Push data to Firestore (rate-limited, with REST fallback) ──
function fbPush(collection, data, onDone) {
    if (!fbSync.enabled) { if (onDone) onDone(false, 'Firebase no habilitado'); return; }
    if (!fbSync.stationId) { if (onDone) onDone(false, 'No hay ID de estacion configurado'); return; }

    // Rate limit check
    var quota = fbQuotaCheck('write');
    if (!quota.allowed) {
        console.warn('Firebase rate limit: ' + quota.reason);
        fbQueueAdd(collection, data);
        if (onDone) onDone(false, quota.reason);
        return;
    }

    // Payload size check
    var sizeCheck = fbQuotaCheckSize(data);
    if (!sizeCheck.allowed) {
        console.warn('Firebase size limit: ' + sizeCheck.reason);
        showToast(sizeCheck.reason, 'error');
        if (onDone) onDone(false, sizeCheck.reason);
        return;
    }

    if (fbSync.debounceTimers[collection]) clearTimeout(fbSync.debounceTimers[collection]);

    fbSync.debounceTimers[collection] = setTimeout(function() {
        // Re-check quota after debounce (another op may have consumed it)
        var q2 = fbQuotaCheck('write');
        if (!q2.allowed) { if (onDone) onDone(false, q2.reason); return; }

        fbSync.status = 'syncing';
        fbUpdateIndicator();

        // Use REST API if SDK transport is broken
        if (fbSync._useREST) {
            fbPushREST(collection, data, function(ok, err) {
                if (ok) fbUpdateStationMeta();
                if (onDone) onDone(ok, err);
            });
            return;
        }

        if (!fbSync.db) { if (onDone) onDone(false, 'Firestore no inicializado'); return; }

        var docRef = fbSync.db.collection('stations').doc(fbSync.stationId)
            .collection(collection).doc('current');

        docRef.set({
            data: data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            station: fbSync.stationId
        }).then(function() {
            fbQuotaRecord('write');
            fbSync.lastSync = new Date();
            fbSync.status = 'connected';
            fbSync.lastError = '';
            fbUpdateIndicator();
            fbUpdateStationMeta();
            if (onDone) onDone(true);
        }).catch(function(err) {
            console.error('Firebase push error (' + collection + '):', err);
            fbSync.status = 'error';
            fbSync.lastError = 'Error al subir ' + collection + ': ' + (err.code === 'permission-denied' ? 'Acceso denegado (Security Rules)' : err.message);
            fbUpdateIndicator();
            fbQueueAdd(collection, data);
            if (onDone) onDone(false, fbSync.lastError);
        });
    }, 2000);
}

// ── Push all modules ──
function fbPushAll(showFeedback) {
    if (!fbSync.enabled) { if (showFeedback) showToast('Firebase no esta habilitado', 'error'); return; }
    if (!fbSync.stationId) { if (showFeedback) showToast('Primero configura un ID de estacion', 'error'); return; }

    var modules = [];
    if (fbSyncModules.cop15) modules.push({col:'cop15', data:db});
    if (fbSyncModules.testplan) modules.push({col:'testplan', data:tpState});
    if (fbSyncModules.results) modules.push({col:'results', data:raState});
    if (fbSyncModules.inventory) modules.push({col:'inventory', data:invState});
    if (fbSyncModules.panel) modules.push({col:'panel', data:typeof pnState !== 'undefined' ? pnState : {}});
    if (modules.length === 0) { if (showFeedback) showToast('No hay modulos seleccionados para sync', 'info'); return; }

    var pending = modules.length, errors = [];
    function onPushDone(ok, errMsg) {
        if (!ok && errMsg) errors.push(errMsg);
        pending--;
        if (pending === 0 && showFeedback) {
            if (errors.length === 0) { showToast('Datos enviados a Firebase correctamente', 'success'); fbPostSyncPush(); }
            else showToast('Error al subir: ' + errors[0], 'error');
        }
    }
    modules.forEach(function(m) { fbPush(m.col, m.data, onPushDone); });
}

// ── Pull data from Firestore (rate-limited, with REST fallback) ──
function fbPullAll(showFeedback) {
    if (!fbSync.enabled) { if (showFeedback) showToast('Firebase no esta habilitado', 'error'); return; }
    if (!fbSync.stationId) { if (showFeedback) showToast('Primero configura un ID de estacion', 'error'); return; }

    // Rate limit check (5 reads: one per collection)
    var quota = fbQuotaCheck('read');
    if (!quota.allowed) {
        if (showFeedback) showToast(quota.reason, 'error');
        return;
    }

    fbSync.status = 'syncing';
    fbUpdateIndicator();

    var collections = ['cop15', 'testplan', 'results', 'inventory', 'panel'].filter(function(c) { return fbSyncModules[c]; });
    if (collections.length === 0) { if (showFeedback) showToast('No hay modulos seleccionados para sync', 'info'); return; }

    // Use REST API if SDK transport is broken
    if (fbSync._useREST) {
        var restPending = collections.length;
        var restResults = {};
        collections.forEach(function(col) {
            fbPullREST(col, function(data) {
                restResults[col] = data;
                restPending--;
                if (restPending === 0) fbPullApply(collections, restResults, showFeedback);
            });
        });
        return;
    }

    if (!fbSync.db) { if (showFeedback) showToast('Firestore no inicializado', 'error'); return; }

    var stationRef = fbSync.db.collection('stations').doc(fbSync.stationId);
    var promises = collections.map(function(col) { return stationRef.collection(col).doc('current').get(); });

    Promise.all(promises).then(function(snapshots) {
        var results = {};
        collections.forEach(function(col, i) {
            var snap = snapshots[i];
            results[col] = (snap && snap.exists && snap.data().data) ? snap.data().data : null;
        });
        fbPullApply(collections, results, showFeedback);
    }).catch(function(err) {
        console.error('Firebase pull error:', err);
        fbSync.status = 'error';
        fbSync.lastError = err.code === 'permission-denied' ? 'Acceso denegado. Revisa las Security Rules.' : 'Error al descargar: ' + (err.message || err.code);
        fbUpdateIndicator();
        if (showFeedback) showToast(fbSync.lastError, 'error');
    });
}

// ── Apply pulled data to local state ──
function fbPullApply(collections, results, showFeedback) {
    var pulled = [];

    collections.forEach(function(col) {
        var remoteData = results[col];
        if (!remoteData) return;

        if (col === 'cop15') {
            if (remoteData.vehicles && remoteData.vehicles.length >= db.vehicles.length) {
                db = remoteData;
                localStorage.setItem('kia_db_v11', JSON.stringify(db));
                refreshAllLists();
                pulled.push('COP15 (' + db.vehicles.length + ' vehiculos)');
            }
        } else if (col === 'testplan') {
            tpState = remoteData;
            localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState));
            if (typeof tpRender === 'function') tpRender();
            pulled.push('Test Plan');
        } else if (col === 'results') {
            if (remoteData.tests && remoteData.tests.length >= raState.tests.length) {
                raState = remoteData;
                localStorage.setItem('kia_results_v1', JSON.stringify(raState));
                if (typeof raRender === 'function') raRender();
                pulled.push('Results (' + raState.tests.length + ' pruebas)');
            }
        } else if (col === 'inventory') {
            invState = remoteData;
            localStorage.setItem('kia_lab_inventory', JSON.stringify(invState));
            if (typeof invRender === 'function') invRender();
            pulled.push('Inventory');
        } else if (col === 'panel') {
            if (typeof pnState !== 'undefined') {
                Object.assign(pnState, remoteData);
                localStorage.setItem(PN_LS_KEY, JSON.stringify(pnState));
                if (typeof pnRender === 'function') pnRender();
                pulled.push('Panel');
            }
        }
    });

    for (var ri = 0; ri < collections.length; ri++) fbQuotaRecord('read');

    fbSync.lastSync = new Date();
    fbSync.status = 'connected';
    fbSync.lastError = '';
    fbUpdateIndicator();

    if (pulled.length > 0) {
        if (showFeedback) showToast('Descargado: ' + pulled.join(', '), 'success');
        if (typeof fbPostSyncPull === 'function') fbPostSyncPull();
        if (fbOfflineQueue.length > 0) setTimeout(fbQueueRetry, 2000);
    } else {
        if (showFeedback) showToast('No hay datos en la nube para esta estacion', 'info');
    }
}

// ── Hook into existing save functions ──
var _fbHooksApplied = false;
function fbHookSaves() {
    // Prevent double-wrapping when initializeSystem() is called multiple times (e.g., after login)
    if (_fbHooksApplied) return;
    _fbHooksApplied = true;

    var _origSaveDB = window.saveDB;
    if (_origSaveDB) { window.saveDB = function() { _origSaveDB(); if (fbSyncModules.cop15) fbPush('cop15', db); }; }
    var _origTpSave = window.tpSave;
    if (_origTpSave) { window.tpSave = function() { _origTpSave(); if (fbSyncModules.testplan) fbPush('testplan', tpState); }; }
    var _origRaSave = window.raSave;
    if (_origRaSave) { window.raSave = function() { _origRaSave(); if (fbSyncModules.results) fbPush('results', raState); }; }
    var _origInvSave = window.invSave;
    if (_origInvSave) { window.invSave = function() { _origInvSave(); if (fbSyncModules.inventory) fbPush('inventory', invState); }; }
    var _origPnSave = window.pnSave;
    if (_origPnSave) { window.pnSave = function() { _origPnSave(); if (fbSyncModules.panel) fbPush('panel', pnState); }; }
}

// ── UI Indicator ──
function fbUpdateIndicator() {
    var el = document.getElementById('fb-sync-indicator');
    if (!el) return;
    var colors = { off: '#475569', connecting: '#f59e0b', connected: '#10b981', syncing: '#3b82f6', error: '#ef4444' };
    var labels = { off: 'Offline', connecting: 'Conectando...', connected: fbSync._useREST ? 'REST Sync' : 'Sync', syncing: 'Syncing...', error: 'Error' };
    var color = colors[fbSync.status] || '#475569';
    var label = labels[fbSync.status] || 'Off';
    el.style.color = color;
    el.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + color + ';margin-right:4px;' +
        (fbSync.status === 'syncing' || fbSync.status === 'connecting' ? 'animation:pulse 1s infinite;' : '') +
        '"></span>' + label +
        (fbSync.stationId ? ' (' + fbSync.stationId + ')' : '') +
        (fbSync.lastSync ? ' ' + fbSync.lastSync.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) : '') +
        (fbOfflineQueue.length > 0 ? ' <span style="background:#f59e0b;color:#000;padding:1px 5px;border-radius:8px;font-size:8px;font-weight:700;">' + fbOfflineQueue.length + ' pendiente' + (fbOfflineQueue.length > 1 ? 's' : '') + '</span>' : '');
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  SETTINGS PANEL                                                     ║
// ╚══════════════════════════════════════════════════════════════════════╝

function fbShowSettings() {
    var modal = document.getElementById('fbModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fbModal';
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;overflow-y:auto;';
        document.body.appendChild(modal);
    }
    modal.style.display = 'block';

    var hasConfig = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId;
    var statusColor = '#64748b', statusText = 'No configurado';
    if (fbSync.enabled && fbSync.status === 'connected') { statusColor = '#10b981'; statusText = 'Conectado'; }
    else if (fbSync.enabled && fbSync.status === 'connecting') { statusColor = '#f59e0b'; statusText = 'Conectando...'; }
    else if (fbSync.status === 'error') { statusColor = '#ef4444'; statusText = 'Error'; }
    else if (hasConfig && !fbSync.enabled) { statusColor = '#64748b'; statusText = 'Desconectado'; }

    var mergeHist = fbMergeGetHistory();

    modal.innerHTML = '<div style="max-width:480px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">' +
        '<button onclick="document.getElementById(\x27fbModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>' +
        '<h3 style="margin:0 0 4px;color:#3b82f6;">Firebase Cloud Sync</h3>' +
        '<div style="font-size:10px;color:#64748b;margin-bottom:14px;">Sincroniza datos entre multiples dispositivos via Firebase.</div>' +

        // Status
        '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:11px;">Estado:</span>' +
        '<span style="font-size:11px;font-weight:700;color:' + statusColor + ';">' + statusText + '</span></div>' +
        (fbSync.lastSync ? '<div style="font-size:9px;color:#64748b;margin-top:4px;">Ultima sync: ' + fbSync.lastSync.toLocaleString('es-MX') + '</div>' : '') +
        (fbSync.lastError ? '<div style="font-size:10px;color:#ef4444;margin-top:6px;padding:6px 8px;background:rgba(239,68,68,0.1);border-radius:4px;white-space:pre-line;">' + fbSync.lastError + '</div>' : '') +
        '</div>' +

        // Quota usage
        (hasConfig && fbSync.enabled ? (function() {
            var qs = fbQuotaStats();
            var wPct = Math.round((qs.writesThisHour / qs.maxWritesHour) * 100);
            var rPct = Math.round((qs.readsThisHour / qs.maxReadsHour) * 100);
            var wColor = wPct > 80 ? '#ef4444' : wPct > 50 ? '#f59e0b' : '#10b981';
            var rColor = rPct > 80 ? '#ef4444' : rPct > 50 ? '#f59e0b' : '#10b981';
            return '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:12px;">' +
                '<div style="font-size:10px;font-weight:700;color:#94a3b8;margin-bottom:8px;">Uso de Quota (proteccion de costos)</div>' +
                '<div style="display:flex;gap:12px;margin-bottom:6px;">' +
                '<div style="flex:1;"><div style="font-size:9px;color:#64748b;margin-bottom:3px;">Escrituras/hora</div>' +
                '<div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden;">' +
                '<div style="width:' + Math.min(wPct, 100) + '%;height:100%;background:' + wColor + ';border-radius:3px;transition:width 0.3s;"></div></div>' +
                '<div style="font-size:9px;color:' + wColor + ';margin-top:2px;">' + qs.writesThisHour + '/' + qs.maxWritesHour + '</div></div>' +
                '<div style="flex:1;"><div style="font-size:9px;color:#64748b;margin-bottom:3px;">Lecturas/hora</div>' +
                '<div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden;">' +
                '<div style="width:' + Math.min(rPct, 100) + '%;height:100%;background:' + rColor + ';border-radius:3px;transition:width 0.3s;"></div></div>' +
                '<div style="font-size:9px;color:' + rColor + ';margin-top:2px;">' + qs.readsThisHour + '/' + qs.maxReadsHour + '</div></div></div>' +
                (qs.blockedToday > 0 ? '<div style="font-size:9px;color:#f59e0b;margin-top:4px;">Operaciones bloqueadas hoy: ' + qs.blockedToday + '</div>' : '') +
                '<div style="font-size:8px;color:#475569;margin-top:4px;">Limite diario: ' + qs.writesToday + '/' + qs.maxWritesDay + ' escrituras, ' + qs.readsToday + '/' + qs.maxReadsDay + ' lecturas</div>' +
                '</div>';
        })() : '') +

        // Connection test
        (hasConfig ? '<div style="margin-bottom:12px;"><button onclick="fbTestConnectionUI()" style="width:100%;padding:8px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:11px;">Probar conexion a Firestore</button></div>' : '') +

        // Station ID
        '<div style="margin-bottom:12px;">' +
        '<label style="font-size:10px;color:#94a3b8;">ID de Estacion (identifica este dispositivo)</label>' +
        '<div style="display:flex;gap:6px;margin-top:4px;">' +
        '<input id="fb-station-input" value="' + (fbSync.stationId || '') + '" placeholder="ej: CELDA-1, LAB-TABLET" style="flex:1;padding:8px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:12px;">' +
        '<button onclick="fbSetStation(document.getElementById(\x27fb-station-input\x27).value)" style="padding:8px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:11px;">Guardar</button>' +
        '</div></div>' +

        // Device name label
        '<div style="margin-bottom:12px;">' +
        '<label style="font-size:10px;color:#94a3b8;">Nombre del dispositivo (visible en Smart Merge)</label>' +
        '<div style="display:flex;gap:6px;margin-top:4px;">' +
        '<input id="fb-device-name-input" value="' + (localStorage.getItem('kia_fb_device_name') || '') + '" placeholder="ej: Tablet Jorge, PC Lab" style="flex:1;padding:8px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:12px;">' +
        '<button onclick="var v=document.getElementById(\x27fb-device-name-input\x27).value.trim();localStorage.setItem(\x27kia_fb_device_name\x27,v);showToast(\x27Nombre guardado: \x27+v,\x27success\x27);fbUpdateStationMeta();" style="padding:8px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:11px;">Guardar</button>' +
        '</div></div>' +

        // Module sync toggles
        (hasConfig ? '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:12px;">' +
        '<div style="font-size:10px;font-weight:700;color:#94a3b8;margin-bottom:8px;">Modulos a sincronizar</div>' +
        (function() {
            var mods = [{k:'cop15',l:'COP15 Cascade'},{k:'testplan',l:'Test Plan'},{k:'results',l:'Results'},{k:'inventory',l:'Inventario'},{k:'panel',l:'Panel'}];
            var h = '';
            mods.forEach(function(m) {
                h += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;">' +
                '<input type="checkbox" ' + (fbSyncModules[m.k] ? 'checked' : '') + ' onchange="fbSyncModules[\'' + m.k + '\']=this.checked;fbSaveSyncModules();">' +
                '<span style="font-size:11px;">' + m.l + '</span></label>';
            });
            return h;
        })() + '</div>' : '') +

        // Offline queue status
        (fbOfflineQueue.length > 0 ? '<div style="padding:10px;border:1px solid #854d0e;border-radius:8px;margin-bottom:12px;background:rgba(245,158,11,0.05);">' +
        '<div style="font-size:10px;font-weight:700;color:#f59e0b;margin-bottom:4px;">Cola Offline: ' + fbOfflineQueue.length + ' pendiente' + (fbOfflineQueue.length > 1 ? 's' : '') + '</div>' +
        '<div style="font-size:9px;color:#64748b;margin-bottom:6px;">Operaciones que fallaron se reintentaran automaticamente.</div>' +
        '<button onclick="fbQueueRetry();setTimeout(fbShowSettings,1000);" style="padding:6px 12px;background:#f59e0b;color:#000;border:none;border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;">Reintentar ahora</button>' +
        '<button onclick="if(confirm(\x27Vaciar cola offline?\x27)){fbOfflineQueue=[];fbQueueSave();fbUpdateIndicator();fbShowSettings();}" style="padding:6px 12px;background:#334155;color:#e2e8f0;border:none;border-radius:6px;cursor:pointer;font-size:10px;margin-left:6px;">Vaciar cola</button>' +
        '</div>' : '') +

        // Sync actions
        (fbSync.enabled && fbSync.status !== 'error' ? '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<button onclick="fbPushAll(true)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Subir todo a nube</button>' +
        '<button onclick="if(confirm(\x27Esto reemplazara datos locales con los de la nube. Continuar?\x27)){fbPullAll(true);}" style="flex:1;padding:10px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Descargar de nube</button>' +
        '</div>' : '') +

        // ═══ BACKUP SECTION ═══
        (fbSync.enabled && fbSync.status === 'connected' ? '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<button onclick="fbBackupManual()" style="flex:1;padding:8px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:11px;">Backup Manual</button>' +
        '<button onclick="fbBackupShowList()" style="flex:1;padding:8px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:11px;">Ver Backups</button>' +
        '</div>' +
        '<div style="font-size:9px;color:#64748b;margin-bottom:12px;margin-top:-8px;">Auto-backup diario. Ultimo: ' + (localStorage.getItem(FB_BACKUP_LS_KEY) || 'nunca') + '</div>' : '') +

        // ═══ ACTIVITY FEED BUTTON ═══
        (fbSync.enabled && fbSync.status === 'connected' ? '<div style="margin-bottom:12px;">' +
        '<button onclick="fbActivityShowFeed()" style="width:100%;padding:10px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">📡 Activity Feed (entre estaciones)</button>' +
        '</div>' : '') +

        // ═══ SMART MERGE BUTTON ═══
        (fbSync.enabled && fbSync.status === 'connected' ? '<div style="margin-bottom:12px;padding:10px;background:#1e293b;border-radius:8px;border:1px solid #334155;">' +
        '<div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:6px;">Smart Merge (fusionar desde otra estacion)</div>' +
        '<div style="font-size:9px;color:#64748b;margin-bottom:8px;">Detecta duplicados, muestra diferencias, y te deja elegir que fusionar por modulo.</div>' +
        '<button onclick="fbMergeShowPanel()" style="width:100%;padding:10px;background:#f59e0b;color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;">Abrir Smart Merge</button>' +
        (mergeHist.length > 0 ? '<div style="display:flex;gap:6px;margin-top:8px;">' +
        '<button onclick="fbMergeShowHistory()" style="flex:1;padding:7px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:10px;">Historial (' + mergeHist.length + ')</button>' +
        '<button onclick="fbMergeUndo()" style="flex:1;padding:7px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:10px;">Deshacer ultima</button>' +
        '<button onclick="fbMergeExportCSV()" style="flex:1;padding:7px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:10px;">Exportar CSV</button>' +
        '</div>' : '') +
        '</div>' : '') +

        // Retry — show when status is 'error' OR 'off' (No configurado) with config present
        ((fbSync.status === 'error' || fbSync.status === 'off') && hasConfig ? '<div style="margin-bottom:12px;"><button onclick="fbInit();setTimeout(fbShowSettings,2500);" style="width:100%;padding:10px;background:#f59e0b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">' + (fbSync.status === 'off' ? 'Conectar a Firebase' : 'Reintentar conexion') + '</button></div>' : '') +

        // Setup instructions
        (!hasConfig ? '<div style="padding:12px;background:#1e293b;border-radius:8px;border:1px solid #334155;"><div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:6px;">Setup necesario</div><div style="font-size:10px;color:#94a3b8;line-height:1.5;">1. Ve a <strong>console.firebase.google.com</strong><br>2. Crea un proyecto (gratis)<br>3. En <strong>Authentication > Sign-in method</strong>, habilita <strong>Anonymous</strong><br>4. En <strong>Firestore Database</strong>, crea una base de datos<br>5. En <strong>Firestore > Rules</strong>, pon: allow read, write: if true;<br>6. En Project Settings, agrega una Web App<br>7. Copia el firebaseConfig al archivo <strong>js/firebase-sync.js</strong><br>8. Recarga la app</div></div>' : '') +

        // Rules
        (hasConfig ? '<div style="padding:10px;background:#1e293b;border-radius:8px;border:1px solid #334155;margin-top:12px;"><div style="font-size:10px;font-weight:700;color:#94a3b8;margin-bottom:4px;">Configuracion requerida en Firebase Console:</div>' +
        '<div style="font-size:9px;color:#f59e0b;margin-bottom:6px;line-height:1.5;">1. <strong>Authentication > Sign-in method > Anonymous</strong> → Habilitar<br>2. <strong>Firestore Database > Rules</strong> → Copiar las reglas de abajo:</div>' +
        '<pre style="font-size:9px;color:#64748b;margin:0;overflow-x:auto;white-space:pre;">rules_version = \'2\';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}</pre><div style="font-size:9px;color:#10b981;margin-top:4px;">Firestore > Rules > Editar > Publicar</div></div>' : '') +

        '</div>';
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  SMART IMPORT MERGE SYSTEM                                          ║
// ║  Detects duplicates, shows differences, merges per-module           ║
// ║  with undo, history, and CSV export                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_MERGE_HISTORY_KEY = 'kia_merge_history';

// ── List all stations in Firestore (with REST fallback, returns metadata) ──
function fbMergeListStations(callback) {
    var quota = fbQuotaCheck('read');
    if (!quota.allowed) { showToast(quota.reason, 'error'); callback([]); return; }

    // REST API fallback (or primary for non-HTTP origins)
    if (fbSync._useREST || !fbSync.db) {
        var url = 'https://firestore.googleapis.com/v1/projects/' +
            FIREBASE_CONFIG.projectId + '/databases/(default)/documents/stations?key=' +
            FIREBASE_CONFIG.apiKey;
        fetch(url).then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        }).then(function(result) {
            fbQuotaRecord('read');
            var stations = [];
            (result.documents || []).forEach(function(doc) {
                var id = doc.name.split('/').pop();
                var meta = { id: id, deviceName: '', lastPush: '' };
                if (doc.fields) {
                    if (doc.fields.deviceName) meta.deviceName = doc.fields.deviceName.stringValue || '';
                    if (doc.fields.lastPush) meta.lastPush = doc.fields.lastPush.stringValue || '';
                }
                stations.push(meta);
            });
            callback(stations);
        }).catch(function(err) {
            console.error('REST list stations error:', err);
            showToast('Error listando estaciones: ' + err.message, 'error');
            callback([]);
        });
        return;
    }

    // SDK path
    fbSync.db.collection('stations').get().then(function(snap) {
        fbQuotaRecord('read');
        var stations = [];
        snap.forEach(function(doc) {
            var data = doc.data() || {};
            stations.push({
                id: doc.id,
                deviceName: data.deviceName || '',
                lastPush: data.lastPush || ''
            });
        });
        callback(stations);
    }).catch(function(err) {
        console.error('Error listing stations:', err);
        showToast('Error listando estaciones: ' + err.message, 'error');
        callback([]);
    });
}

// ── Load all 4 modules from a remote station (with REST fallback) ──
function fbMergeLoadStation(stationId, callback) {
    var quota = fbQuotaCheck('read');
    if (!quota.allowed) { showToast(quota.reason, 'error'); callback(null); return; }

    var cols = ['cop15', 'testplan', 'results', 'inventory'];

    // REST API fallback
    if (fbSync._useREST || !fbSync.db) {
        var restPending = cols.length;
        var data = {};
        cols.forEach(function(col) {
            var url = 'https://firestore.googleapis.com/v1/projects/' +
                FIREBASE_CONFIG.projectId + '/databases/(default)/documents/stations/' +
                encodeURIComponent(stationId) + '/' + col + '/current?key=' + FIREBASE_CONFIG.apiKey;
            fetch(url).then(function(resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.json();
            }).then(function(doc) {
                fbQuotaRecord('read');
                if (doc && doc.fields && doc.fields.data) {
                    data[col] = fbFromFirestoreValue(doc.fields.data);
                    if (doc.fields.updatedAt && doc.fields.updatedAt.timestampValue) {
                        data[col + '_ts'] = new Date(doc.fields.updatedAt.timestampValue);
                    }
                } else {
                    data[col] = null;
                }
            }).catch(function(err) {
                console.warn('REST load ' + col + ' from ' + stationId + ':', err.message);
                data[col] = null;
            }).then(function() {
                restPending--;
                if (restPending === 0) callback(data);
            });
        });
        return;
    }

    // SDK path
    var ref = fbSync.db.collection('stations').doc(stationId);
    var promises = cols.map(function(c) { return ref.collection(c).doc('current').get(); });

    Promise.all(promises).then(function(snaps) {
        for (var ri = 0; ri < cols.length; ri++) fbQuotaRecord('read');
        var data = {};
        cols.forEach(function(c, i) {
            data[c] = snaps[i].exists ? (snaps[i].data().data || null) : null;
            // Also grab the timestamp
            if (snaps[i].exists && snaps[i].data().updatedAt) {
                data[c + '_ts'] = snaps[i].data().updatedAt.toDate ? snaps[i].data().updatedAt.toDate() : new Date(snaps[i].data().updatedAt);
            }
        });
        callback(data);
    }).catch(function(err) {
        console.error('Error loading station ' + stationId + ':', err);
        showToast('Error cargando estacion: ' + err.message, 'error');
        callback(null);
    });
}

// ── Analyze differences between local and remote ──
function fbMergeAnalyze(remoteData) {
    var analysis = { cop15: null, testplan: null, results: null, inventory: null };

    // ── COP15: compare vehicles by VIN ──
    if (remoteData.cop15 && remoteData.cop15.vehicles) {
        var localVINs = {};
        (db.vehicles || []).forEach(function(v) { localVINs[v.vin] = v; });
        var remoteVehicles = remoteData.cop15.vehicles || [];
        var newVehicles = [], duplicateVehicles = [], conflicts = [];

        remoteVehicles.forEach(function(rv) {
            if (!localVINs[rv.vin]) {
                newVehicles.push(rv);
            } else {
                var lv = localVINs[rv.vin];
                // Check if different (compare status and timeline length)
                var isDiff = lv.status !== rv.status ||
                    (lv.timeline || []).length !== (rv.timeline || []).length ||
                    JSON.stringify(lv.testData || {}) !== JSON.stringify(rv.testData || {});
                if (isDiff) {
                    conflicts.push({ vin: rv.vin, local: lv, remote: rv });
                } else {
                    duplicateVehicles.push(rv.vin);
                }
            }
        });

        analysis.cop15 = {
            localCount: db.vehicles.length,
            remoteCount: remoteVehicles.length,
            newItems: newVehicles,
            duplicates: duplicateVehicles,
            conflicts: conflicts,
            remoteTs: remoteData.cop15_ts || null
        };
    }

    // ── TestPlan: compare testedList by configText+date ──
    if (remoteData.testplan) {
        var localTested = {};
        (tpState.testedList || []).forEach(function(t) {
            localTested[t.configText + '|' + (t.date || '')] = t;
        });
        var remoteTested = (remoteData.testplan.testedList || []);
        var newTests = [], dupTests = [];

        remoteTested.forEach(function(rt) {
            var key = rt.configText + '|' + (rt.date || '');
            if (!localTested[key]) newTests.push(rt);
            else dupTests.push(key);
        });

        // Compare rules
        var localRulesJSON = JSON.stringify(tpState.rules || []);
        var remoteRulesJSON = JSON.stringify(remoteData.testplan.rules || []);
        var rulesChanged = localRulesJSON !== remoteRulesJSON;

        // Compare planData (production plan configurations)
        var localPlanLen = (tpState.planData || []).length;
        var remotePlanLen = (remoteData.testplan.planData || []).length;
        var planDataDiff = localPlanLen !== remotePlanLen;
        // Also check content — remote may have different configs even if same length
        if (!planDataDiff && remotePlanLen > 0) {
            var localDescs = (tpState.planData || []).map(function(c) { return c.desc; }).sort().join('|');
            var remoteDescs = (remoteData.testplan.planData || []).map(function(c) { return c.desc; }).sort().join('|');
            planDataDiff = localDescs !== remoteDescs;
        }

        // Compare weeklyPlans
        var localWeeklyLen = (tpState.weeklyPlans || []).length;
        var remoteWeeklyLen = (remoteData.testplan.weeklyPlans || []).length;
        var weeklyPlansDiff = localWeeklyLen !== remoteWeeklyLen;
        if (!weeklyPlansDiff && remoteWeeklyLen > 0) {
            weeklyPlansDiff = JSON.stringify(tpState.weeklyPlans || []) !== JSON.stringify(remoteData.testplan.weeklyPlans || []);
        }

        analysis.testplan = {
            localTestedCount: (tpState.testedList || []).length,
            remoteTestedCount: remoteTested.length,
            newItems: newTests,
            duplicates: dupTests,
            conflicts: [],
            rulesChanged: rulesChanged,
            localPlanConfigs: localPlanLen,
            remotePlanConfigs: remotePlanLen,
            planDataDiff: planDataDiff,
            localWeeklyCount: localWeeklyLen,
            remoteWeeklyCount: remoteWeeklyLen,
            weeklyPlansDiff: weeklyPlansDiff,
            remoteTs: remoteData.testplan_ts || null
        };
    }

    // ── Results: compare tests by VIN+testNumber ──
    if (remoteData.results && remoteData.results.tests) {
        var localTests = {};
        (raState.tests || []).forEach(function(t) {
            localTests[(t.vin || '') + '|' + (t.testNumber || '') + '|' + (t.dateStr || '')] = t;
        });
        var remoteTests = remoteData.results.tests || [];
        var newResults = [], dupResults = [];

        remoteTests.forEach(function(rt) {
            var key = (rt.vin || '') + '|' + (rt.testNumber || '') + '|' + (rt.dateStr || '');
            if (!localTests[key]) newResults.push(rt);
            else dupResults.push(key);
        });

        analysis.results = {
            localCount: raState.tests.length,
            remoteCount: remoteTests.length,
            newItems: newResults,
            duplicates: dupResults,
            conflicts: [],
            remoteTs: remoteData.results_ts || null
        };
    }

    // ── Inventory: compare gases by controlNo, equipment by name ──
    if (remoteData.inventory) {
        var localGases = {};
        ((invState.gases || []).forEach(function(g) { localGases[g.controlNo || g.name] = g; }));
        var remoteGases = remoteData.inventory.gases || [];
        var newGases = [], dupGases = [], gasConflicts = [];

        remoteGases.forEach(function(rg) {
            var key = rg.controlNo || rg.name;
            if (!localGases[key]) newGases.push(rg);
            else {
                var lg = localGases[key];
                var isDiff = lg.currentPsi !== rg.currentPsi || lg.status !== rg.status;
                if (isDiff) gasConflicts.push({ key: key, local: lg, remote: rg });
                else dupGases.push(key);
            }
        });

        var localEquip = {};
        ((invState.equipment || []).forEach(function(e) { localEquip[e.serialNo || e.name] = e; }));
        var remoteEquip = remoteData.inventory.equipment || [];
        var newEquip = [], dupEquip = [];

        remoteEquip.forEach(function(re) {
            var key = re.serialNo || re.name;
            if (!localEquip[key]) newEquip.push(re);
            else dupEquip.push(key);
        });

        analysis.inventory = {
            localGasCount: (invState.gases || []).length,
            remoteGasCount: remoteGases.length,
            newGases: newGases,
            dupGases: dupGases,
            gasConflicts: gasConflicts,
            localEquipCount: (invState.equipment || []).length,
            remoteEquipCount: remoteEquip.length,
            newEquip: newEquip,
            dupEquip: dupEquip,
            remoteTs: remoteData.inventory_ts || null
        };
    }

    return analysis;
}

// ── Execute merge for selected modules ──
function fbMergeExecute(remoteData, analysis, choices) {
    // Save snapshot for undo BEFORE merging
    var snapshot = {
        cop15: JSON.parse(JSON.stringify(db)),
        testplan: JSON.parse(JSON.stringify(tpState)),
        results: JSON.parse(JSON.stringify(raState)),
        inventory: JSON.parse(JSON.stringify(invState))
    };

    var merged = [];

    // COP15
    if (choices.cop15 && analysis.cop15) {
        if (choices.cop15 === 'new') {
            // Add only new vehicles
            analysis.cop15.newItems.forEach(function(v) { db.vehicles.push(v); });
            merged.push('COP15: +' + analysis.cop15.newItems.length + ' vehiculos nuevos');
        } else if (choices.cop15 === 'replace') {
            db = remoteData.cop15;
            merged.push('COP15: reemplazado con version remota');
        } else if (choices.cop15 === 'merge_all') {
            // Add new + for conflicts keep the one with more timeline entries
            analysis.cop15.newItems.forEach(function(v) { db.vehicles.push(v); });
            analysis.cop15.conflicts.forEach(function(c) {
                var idx = db.vehicles.findIndex(function(v) { return v.vin === c.vin; });
                if (idx >= 0) {
                    var localTL = (c.local.timeline || []).length;
                    var remoteTL = (c.remote.timeline || []).length;
                    if (remoteTL > localTL) db.vehicles[idx] = c.remote;
                }
            });
            merged.push('COP15: +' + analysis.cop15.newItems.length + ' nuevos, ' + analysis.cop15.conflicts.length + ' conflictos resueltos');
        }
        localStorage.setItem('kia_db_v11', JSON.stringify(db));
        refreshAllLists();
    }

    // TestPlan
    if (choices.testplan && analysis.testplan) {
        if (choices.testplan === 'new') {
            // Add new tested items
            if (!tpState.testedList) tpState.testedList = [];
            analysis.testplan.newItems.forEach(function(t) { tpState.testedList.push(t); });
            var parts = ['+' + analysis.testplan.newItems.length + ' pruebas'];
            // Also import planData if local is empty and remote has data
            if ((tpState.planData || []).length === 0 && (remoteData.testplan.planData || []).length > 0) {
                tpState.planData = remoteData.testplan.planData;
                parts.push('+' + tpState.planData.length + ' configs plan');
            }
            // Also import weeklyPlans if local is empty and remote has data
            if ((tpState.weeklyPlans || []).length === 0 && (remoteData.testplan.weeklyPlans || []).length > 0) {
                tpState.weeklyPlans = remoteData.testplan.weeklyPlans;
                parts.push('+' + tpState.weeklyPlans.length + ' planes semanales');
            }
            merged.push('TestPlan: ' + parts.join(', '));
        } else if (choices.testplan === 'replace') {
            tpState = remoteData.testplan;
            merged.push('TestPlan: reemplazado con version remota');
        } else if (choices.testplan === 'merge_all') {
            // Merge tested items
            if (!tpState.testedList) tpState.testedList = [];
            analysis.testplan.newItems.forEach(function(t) { tpState.testedList.push(t); });
            // Merge rules if different
            if (analysis.testplan.rulesChanged) {
                tpState.rules = remoteData.testplan.rules;
            }
            // Merge planData: use remote if local is empty, or if remote has different/more configs
            if (analysis.testplan.planDataDiff && (remoteData.testplan.planData || []).length > 0) {
                if ((tpState.planData || []).length === 0) {
                    tpState.planData = remoteData.testplan.planData;
                } else {
                    // Merge: add configs from remote that aren't in local
                    var localDescs = {};
                    (tpState.planData || []).forEach(function(c) { localDescs[c.desc] = true; });
                    (remoteData.testplan.planData || []).forEach(function(c) {
                        if (!localDescs[c.desc]) tpState.planData.push(c);
                    });
                }
            }
            // Merge weeklyPlans: use remote if local is empty, or merge weeks
            if (analysis.testplan.weeklyPlansDiff && (remoteData.testplan.weeklyPlans || []).length > 0) {
                if ((tpState.weeklyPlans || []).length === 0) {
                    tpState.weeklyPlans = remoteData.testplan.weeklyPlans;
                } else {
                    // Merge by week label — add new weeks, merge items for existing weeks
                    var localWeekMap = {};
                    (tpState.weeklyPlans || []).forEach(function(w, i) { localWeekMap[w.week] = i; });
                    (remoteData.testplan.weeklyPlans || []).forEach(function(rw) {
                        if (localWeekMap[rw.week] === undefined) {
                            tpState.weeklyPlans.push(rw);
                        } else {
                            // Add items not already present
                            var lw = tpState.weeklyPlans[localWeekMap[rw.week]];
                            var existingDescs = {};
                            (lw.items || []).forEach(function(item) { existingDescs[item.desc] = true; });
                            (rw.items || []).forEach(function(item) {
                                if (!existingDescs[item.desc]) {
                                    if (!lw.items) lw.items = [];
                                    lw.items.push(item);
                                }
                            });
                        }
                    });
                }
            }
            // Also merge planHistory if remote has entries
            if ((remoteData.testplan.planHistory || []).length > 0) {
                if (!tpState.planHistory) tpState.planHistory = [];
                var localHistDates = {};
                tpState.planHistory.forEach(function(h) { localHistDates[h.date + '|' + h.configs] = true; });
                (remoteData.testplan.planHistory || []).forEach(function(h) {
                    if (!localHistDates[h.date + '|' + h.configs]) tpState.planHistory.push(h);
                });
            }
            merged.push('TestPlan: merge completo');
        }
        localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState));
        if (typeof tpRender === 'function') tpRender();
    }

    // Results
    if (choices.results && analysis.results) {
        if (choices.results === 'new') {
            analysis.results.newItems.forEach(function(t) { raState.tests.push(t); });
            merged.push('Results: +' + analysis.results.newItems.length + ' pruebas');
        } else if (choices.results === 'replace') {
            raState = remoteData.results;
            merged.push('Results: reemplazado');
        } else if (choices.results === 'merge_all') {
            analysis.results.newItems.forEach(function(t) { raState.tests.push(t); });
            merged.push('Results: +' + analysis.results.newItems.length + ' pruebas nuevas');
        }
        localStorage.setItem('kia_results_v1', JSON.stringify(raState));
        if (typeof raRender === 'function') raRender();
        if (typeof raUpdateBadges === 'function') raUpdateBadges();
    }

    // Inventory
    if (choices.inventory && analysis.inventory) {
        if (choices.inventory === 'new') {
            if (!invState.gases) invState.gases = [];
            if (!invState.equipment) invState.equipment = [];
            analysis.inventory.newGases.forEach(function(g) { invState.gases.push(g); });
            analysis.inventory.newEquip.forEach(function(e) { invState.equipment.push(e); });
            merged.push('Inventory: +' + analysis.inventory.newGases.length + ' gases, +' + analysis.inventory.newEquip.length + ' equipos');
        } else if (choices.inventory === 'replace') {
            invState = remoteData.inventory;
            merged.push('Inventory: reemplazado');
        } else if (choices.inventory === 'merge_all') {
            if (!invState.gases) invState.gases = [];
            if (!invState.equipment) invState.equipment = [];
            analysis.inventory.newGases.forEach(function(g) { invState.gases.push(g); });
            analysis.inventory.newEquip.forEach(function(e) { invState.equipment.push(e); });
            analysis.inventory.gasConflicts.forEach(function(c) {
                var idx = invState.gases.findIndex(function(g) { return (g.controlNo || g.name) === c.key; });
                if (idx >= 0) invState.gases[idx] = c.remote;
            });
            merged.push('Inventory: merge completo');
        }
        localStorage.setItem('kia_lab_inventory', JSON.stringify(invState));
        if (typeof invRender === 'function') invRender();
    }

    // Record in merge history
    if (merged.length > 0) {
        var record = {
            id: 'merge_' + Date.now(),
            timestamp: new Date().toISOString(),
            fromStation: window._fbMergeRemoteId || '?',
            toStation: fbSync.stationId,
            actions: merged,
            snapshot: snapshot
        };
        var hist = fbMergeGetHistory();
        hist.push(record);
        // Keep last 20
        if (hist.length > 20) hist = hist.slice(-20);
        localStorage.setItem(FB_MERGE_HISTORY_KEY, JSON.stringify(hist));

        showToast('Merge completado: ' + merged.join(' | '), 'success');

        // Push merged data to Firebase
        fbPushAll();
    }

    return merged;
}

// ── Merge History ──
function fbMergeGetHistory() {
    try { return JSON.parse(localStorage.getItem(FB_MERGE_HISTORY_KEY)) || []; }
    catch(e) { return []; }
}

// ── Undo last merge ──
function fbMergeUndo() {
    var hist = fbMergeGetHistory();
    if (hist.length === 0) { showToast('No hay fusiones para deshacer', 'info'); return; }

    var last = hist[hist.length - 1];
    if (!confirm('Deshacer fusion del ' + new Date(last.timestamp).toLocaleString('es-MX') + '?\n\nAcciones: ' + last.actions.join(', ') + '\n\nSe restauraran los datos previos a la fusion.')) return;

    // Restore snapshot
    if (last.snapshot) {
        if (last.snapshot.cop15) {
            db = last.snapshot.cop15;
            localStorage.setItem('kia_db_v11', JSON.stringify(db));
            refreshAllLists();
        }
        if (last.snapshot.testplan) {
            tpState = last.snapshot.testplan;
            localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState));
            if (typeof tpRender === 'function') tpRender();
        }
        if (last.snapshot.results) {
            raState = last.snapshot.results;
            localStorage.setItem('kia_results_v1', JSON.stringify(raState));
            if (typeof raRender === 'function') raRender();
        }
        if (last.snapshot.inventory) {
            invState = last.snapshot.inventory;
            localStorage.setItem('kia_lab_inventory', JSON.stringify(invState));
            if (typeof invRender === 'function') invRender();
        }
    }

    // Remove from history
    hist.pop();
    localStorage.setItem(FB_MERGE_HISTORY_KEY, JSON.stringify(hist));

    showToast('Fusion deshecha. Datos restaurados.', 'success');
    fbPushAll();
    fbShowSettings();
}

// ── Show merge history ──
function fbMergeShowHistory() {
    var hist = fbMergeGetHistory();
    var modal = document.getElementById('fbModal');
    if (!modal) return;

    var html = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">';
    html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>';
    html += '<h3 style="margin:0 0 12px;color:#f59e0b;">Historial de Fusiones</h3>';

    if (hist.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:#64748b;">Sin historial de fusiones.</div>';
    } else {
        hist.slice().reverse().forEach(function(r, i) {
            var date = new Date(r.timestamp).toLocaleString('es-MX');
            html += '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:8px;' + (i === 0 ? 'border-color:#f59e0b;' : '') + '">';
            html += '<div style="display:flex;justify-content:space-between;font-size:11px;">';
            html += '<span style="font-weight:700;">' + r.fromStation + ' \u2192 ' + r.toStation + '</span>';
            html += '<span style="color:#64748b;">' + date + '</span></div>';
            r.actions.forEach(function(a) {
                html += '<div style="font-size:10px;color:#94a3b8;margin-top:2px;">\u2022 ' + a + '</div>';
            });
            html += '</div>';
        });
    }

    html += '<div style="display:flex;gap:8px;margin-top:12px;">';
    html += '<button onclick="fbShowSettings()" style="flex:1;padding:8px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:11px;">Volver</button>';
    if (hist.length > 0) {
        html += '<button onclick="fbMergeExportCSV()" style="flex:1;padding:8px;background:#0f766e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;">Exportar CSV</button>';
    }
    html += '</div></div>';

    modal.innerHTML = html;
}

// ── Export merge history as CSV ──
function fbMergeExportCSV() {
    var hist = fbMergeGetHistory();
    var csv = 'ID,Fecha,Desde,Hacia,Acciones\n';
    hist.forEach(function(r) {
        csv += r.id + ',"' + r.timestamp + '",' + r.fromStation + ',' + r.toStation + ',"' + r.actions.join('; ') + '"\n';
    });

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'merge_history_' + Date.now() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado', 'success');
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  SMART MERGE UI (modal flow)                                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

function fbMergeShowPanel() {
    var modal = document.getElementById('fbModal');
    if (!modal) return;

    modal.innerHTML = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">' +
        '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>' +
        '<h3 style="margin:0 0 4px;color:#f59e0b;">Smart Merge</h3>' +
        '<div style="font-size:10px;color:#64748b;margin-bottom:14px;">Fusiona datos de otra estacion a la tuya (' + fbSync.stationId + ')</div>' +
        '<div style="text-align:center;padding:20px;color:#64748b;"><div style="font-size:24px;margin-bottom:8px;">Cargando estaciones...</div></div>' +
        '</div>';

    fbMergeListStations(function(stations) {
        var others = stations.filter(function(s) { return s.id !== fbSync.stationId; });

        var html = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">';
        html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>';
        html += '<h3 style="margin:0 0 4px;color:#f59e0b;">Smart Merge</h3>';
        html += '<div style="font-size:10px;color:#64748b;margin-bottom:14px;">Fusiona datos de otra estacion a <strong>' + fbSync.stationId + '</strong></div>';

        // Show all stations info
        if (stations.length > 0) {
            html += '<div style="font-size:10px;color:#64748b;margin-bottom:10px;">' + stations.length + ' estacion(es) en Firebase:</div>';
        }

        if (others.length === 0) {
            html += '<div style="text-align:center;padding:20px;color:#64748b;">No hay otras estaciones en Firebase. Sube datos desde otro dispositivo primero.</div>';
        } else {
            html += '<div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">Selecciona la estacion de origen:</div>';
            others.forEach(function(s) {
                var lastPushLabel = '';
                if (s.lastPush) {
                    try {
                        var d = new Date(s.lastPush);
                        lastPushLabel = d.toLocaleDateString('es-MX', {day:'2-digit',month:'short'}) + ' ' +
                            d.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'});
                    } catch(e) { lastPushLabel = s.lastPush; }
                }
                var deviceLabel = s.deviceName && s.deviceName !== s.id ? s.deviceName : '';
                html += '<button onclick="fbMergeLoadAndAnalyze(\x27' + s.id + '\x27)" style="display:block;width:100%;padding:12px;margin-bottom:6px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:8px;cursor:pointer;font-size:12px;text-align:left;">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;">' +
                    '<span><span style="color:#f59e0b;margin-right:8px;">\u25B6</span><strong>' + s.id + '</strong></span>' +
                    (deviceLabel ? '<span style="background:#334155;color:#94a3b8;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:400;">' + deviceLabel + '</span>' : '') +
                    '</div>' +
                    (lastPushLabel ? '<div style="font-size:9px;color:#64748b;margin-top:4px;margin-left:22px;">Ultima sync: ' + lastPushLabel + '</div>' : '') +
                    '</button>';
            });
        }

        // Also show current station for reference
        var mySt = stations.filter(function(s) { return s.id === fbSync.stationId; })[0];
        if (mySt) {
            var myLabel = mySt.deviceName && mySt.deviceName !== mySt.id ? ' (' + mySt.deviceName + ')' : '';
            html += '<div style="margin-top:8px;padding:8px;background:#0f2a1a;border:1px solid #134e2a;border-radius:6px;font-size:10px;color:#4ade80;">' +
                'Tu estacion: <strong>' + mySt.id + '</strong>' + myLabel + '</div>';
        }

        html += '<button onclick="fbShowSettings()" style="width:100%;padding:8px;margin-top:10px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:11px;">Volver</button>';
        html += '</div>';
        modal.innerHTML = html;
    });
}

function fbMergeLoadAndAnalyze(remoteStationId) {
    window._fbMergeRemoteId = remoteStationId;
    var modal = document.getElementById('fbModal');
    if (!modal) return;

    modal.innerHTML = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;color:#e2e8f0;text-align:center;">' +
        '<div style="font-size:24px;margin-bottom:8px;">Cargando datos de ' + remoteStationId + '...</div>' +
        '<div style="color:#64748b;">Analizando diferencias...</div></div>';

    fbMergeLoadStation(remoteStationId, function(remoteData) {
        if (!remoteData) {
            modal.innerHTML = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;color:#e2e8f0;text-align:center;">' +
                '<div style="color:#ef4444;margin-bottom:12px;">Error cargando datos de ' + remoteStationId + '</div>' +
                '<button onclick="fbMergeShowPanel()" style="padding:8px 20px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;">Volver</button></div>';
            return;
        }

        window._fbMergeRemoteData = remoteData;
        var analysis = fbMergeAnalyze(remoteData);
        window._fbMergeAnalysis = analysis;

        fbMergeShowDiffUI(remoteStationId, analysis);
    });
}

function fbMergeShowDiffUI(remoteStationId, analysis) {
    var modal = document.getElementById('fbModal');
    if (!modal) return;

    var html = '<div style="max-width:520px;margin:20px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">';
    html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>';
    html += '<h3 style="margin:0 0 2px;color:#f59e0b;">Diferencias: ' + remoteStationId + ' \u2192 ' + fbSync.stationId + '</h3>';
    html += '<div style="font-size:9px;color:#64748b;margin-bottom:14px;">Selecciona como fusionar cada modulo</div>';

    // ── COP15 ──
    var c = analysis.cop15;
    if (c) {
        var hasChanges = c.newItems.length > 0 || c.conflicts.length > 0;
        html += '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:8px;' + (hasChanges ? 'border-color:#f59e0b;' : '') + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
        html += '<span style="font-weight:700;font-size:12px;">COP15 Cascade</span>';
        html += '<span style="font-size:9px;color:#64748b;">Local: ' + c.localCount + ' | Remoto: ' + c.remoteCount + '</span></div>';
        html += '<div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">';
        html += '<span style="color:#10b981;font-weight:700;">+' + c.newItems.length + ' nuevos</span>';
        html += ' &nbsp; <span style="color:#64748b;">' + c.duplicates.length + ' iguales</span>';
        html += ' &nbsp; <span style="color:' + (c.conflicts.length > 0 ? '#ef4444' : '#64748b') + ';font-weight:' + (c.conflicts.length > 0 ? '700' : '400') + ';">' + c.conflicts.length + ' conflictos</span></div>';
        if (hasChanges) {
            html += '<select id="fb-merge-cop15" style="width:100%;padding:6px;background:#1e293b;border:1px solid #334155;border-radius:4px;color:#e2e8f0;font-size:10px;">';
            html += '<option value="">No fusionar</option>';
            html += '<option value="new" selected>Solo nuevos (+' + c.newItems.length + ')</option>';
            html += '<option value="merge_all">Merge completo (nuevos + resolver conflictos)</option>';
            html += '<option value="replace">Reemplazar todo con remoto</option></select>';
        } else {
            html += '<div style="font-size:10px;color:#10b981;">Sin diferencias</div>';
        }
        html += '</div>';
    }

    // ── TestPlan ──
    var tp = analysis.testplan;
    if (tp) {
        var hasChanges = tp.newItems.length > 0 || tp.rulesChanged || tp.planDataDiff || tp.weeklyPlansDiff;
        html += '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:8px;' + (hasChanges ? 'border-color:#3b82f6;' : '') + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
        html += '<span style="font-weight:700;font-size:12px;">Test Plan</span>';
        html += '<span style="font-size:9px;color:#64748b;">Probados L:' + tp.localTestedCount + '/R:' + tp.remoteTestedCount + '</span></div>';
        html += '<div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">';
        if (tp.newItems.length > 0) html += '<span style="color:#10b981;font-weight:700;">+' + tp.newItems.length + ' probados nuevos</span> ';
        if (tp.duplicates.length > 0) html += '<span style="color:#64748b;">' + tp.duplicates.length + ' iguales</span> ';
        if (tp.rulesChanged) html += '<span style="color:#f59e0b;">reglas dif.</span> ';
        if (tp.planDataDiff) html += '<span style="color:#3b82f6;font-weight:700;">plan produccion dif. (L:' + tp.localPlanConfigs + '/R:' + tp.remotePlanConfigs + ')</span> ';
        if (tp.weeklyPlansDiff) html += '<span style="color:#a855f7;font-weight:700;">planes semanales dif. (L:' + tp.localWeeklyCount + '/R:' + tp.remoteWeeklyCount + ')</span> ';
        if (!hasChanges) html += '<span style="color:#10b981;">Sin diferencias</span>';
        html += '</div>';
        if (hasChanges) {
            var newLabel = 'Agregar nuevo';
            var newParts = [];
            if (tp.newItems.length > 0) newParts.push('+' + tp.newItems.length + ' pruebas');
            if (tp.planDataDiff && tp.localPlanConfigs === 0 && tp.remotePlanConfigs > 0) newParts.push('+plan produccion');
            if (tp.weeklyPlansDiff && tp.localWeeklyCount === 0 && tp.remoteWeeklyCount > 0) newParts.push('+planes semanales');
            if (newParts.length > 0) newLabel += ' (' + newParts.join(', ') + ')';
            html += '<select id="fb-merge-testplan" style="width:100%;padding:6px;background:#1e293b;border:1px solid #334155;border-radius:4px;color:#e2e8f0;font-size:10px;">';
            html += '<option value="">No fusionar</option>';
            html += '<option value="new">' + newLabel + '</option>';
            html += '<option value="merge_all" selected>Merge completo (pruebas + reglas + plan + semanales)</option>';
            html += '<option value="replace">Reemplazar todo con remoto</option></select>';
        }
        html += '</div>';
    }

    // ── Results ──
    var ra = analysis.results;
    if (ra) {
        var hasChanges = ra.newItems.length > 0;
        html += '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:8px;' + (hasChanges ? 'border-color:#06b6d4;' : '') + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
        html += '<span style="font-weight:700;font-size:12px;">Results Analyzer</span>';
        html += '<span style="font-size:9px;color:#64748b;">Local: ' + ra.localCount + ' | Remoto: ' + ra.remoteCount + '</span></div>';
        html += '<div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">';
        html += '<span style="color:#10b981;font-weight:700;">+' + ra.newItems.length + ' nuevos</span>';
        html += ' &nbsp; <span style="color:#64748b;">' + ra.duplicates.length + ' duplicados</span></div>';
        if (hasChanges) {
            html += '<select id="fb-merge-results" style="width:100%;padding:6px;background:#1e293b;border:1px solid #334155;border-radius:4px;color:#e2e8f0;font-size:10px;">';
            html += '<option value="">No fusionar</option>';
            html += '<option value="new" selected>Solo nuevos (+' + ra.newItems.length + ')</option>';
            html += '<option value="replace">Reemplazar todo con remoto</option></select>';
        } else {
            html += '<div style="font-size:10px;color:#10b981;">Sin diferencias</div>';
        }
        html += '</div>';
    }

    // ── Inventory ──
    var inv = analysis.inventory;
    if (inv) {
        var hasChanges = inv.newGases.length > 0 || inv.newEquip.length > 0 || inv.gasConflicts.length > 0;
        html += '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:8px;' + (hasChanges ? 'border-color:#10b981;' : '') + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
        html += '<span style="font-weight:700;font-size:12px;">Inventory</span>';
        html += '<span style="font-size:9px;color:#64748b;">Gases L:' + inv.localGasCount + '/R:' + inv.remoteGasCount + ' Eq L:' + inv.localEquipCount + '/R:' + inv.remoteEquipCount + '</span></div>';
        html += '<div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">';
        html += '<span style="color:#10b981;font-weight:700;">+' + inv.newGases.length + ' gases, +' + inv.newEquip.length + ' equipos</span>';
        html += ' &nbsp; <span style="color:' + (inv.gasConflicts.length > 0 ? '#ef4444' : '#64748b') + ';">' + inv.gasConflicts.length + ' conflictos gas</span></div>';
        if (hasChanges) {
            html += '<select id="fb-merge-inventory" style="width:100%;padding:6px;background:#1e293b;border:1px solid #334155;border-radius:4px;color:#e2e8f0;font-size:10px;">';
            html += '<option value="">No fusionar</option>';
            html += '<option value="new" selected>Solo nuevos</option>';
            html += '<option value="merge_all">Merge completo (nuevos + resolver conflictos)</option>';
            html += '<option value="replace">Reemplazar todo con remoto</option></select>';
        } else {
            html += '<div style="font-size:10px;color:#10b981;">Sin diferencias</div>';
        }
        html += '</div>';
    }

    // Action buttons
    html += '<div style="display:flex;gap:8px;margin-top:12px;">';
    html += '<button onclick="fbMergeShowPanel()" style="flex:1;padding:10px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Cancelar</button>';
    html += '<button onclick="fbMergeConfirmAndExecute()" style="flex:2;padding:10px;background:#f59e0b;color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;">Ejecutar Merge</button>';
    html += '</div></div>';

    modal.innerHTML = html;
}

function fbMergeConfirmAndExecute() {
    var choices = {};
    var s;

    s = document.getElementById('fb-merge-cop15');
    if (s && s.value) choices.cop15 = s.value;
    s = document.getElementById('fb-merge-testplan');
    if (s && s.value) choices.testplan = s.value;
    s = document.getElementById('fb-merge-results');
    if (s && s.value) choices.results = s.value;
    s = document.getElementById('fb-merge-inventory');
    if (s && s.value) choices.inventory = s.value;

    if (Object.keys(choices).length === 0) {
        showToast('Selecciona al menos un modulo para fusionar', 'info');
        return;
    }

    var actions = [];
    if (choices.cop15) actions.push('COP15: ' + choices.cop15);
    if (choices.testplan) actions.push('TestPlan: ' + choices.testplan);
    if (choices.results) actions.push('Results: ' + choices.results);
    if (choices.inventory) actions.push('Inventory: ' + choices.inventory);

    if (!confirm('Ejecutar merge desde ' + (window._fbMergeRemoteId || '?') + '?\n\n' + actions.join('\n') + '\n\nSe guardara un snapshot para poder deshacer.')) return;

    var merged = fbMergeExecute(window._fbMergeRemoteData, window._fbMergeAnalysis, choices);

    // Show result
    var modal = document.getElementById('fbModal');
    if (modal) {
        var html = '<div style="max-width:480px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;color:#e2e8f0;text-align:center;">';
        html += '<div style="font-size:36px;margin-bottom:12px;">&#10003;</div>';
        html += '<h3 style="color:#10b981;margin-bottom:12px;">Merge Completado</h3>';
        merged.forEach(function(m) {
            html += '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">' + m + '</div>';
        });
        html += '<div style="font-size:9px;color:#64748b;margin-top:12px;">Puedes deshacer esta fusion desde el panel de Firebase.</div>';
        html += '<div style="display:flex;gap:8px;margin-top:16px;">';
        html += '<button onclick="fbShowSettings()" style="flex:1;padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Volver a Settings</button>';
        html += '<button onclick="fbMergeUndo()" style="flex:1;padding:10px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Deshacer</button>';
        html += '</div></div>';
        modal.innerHTML = html;
    }
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [QW5] AUTOMATIC DAILY BACKUP TO FIRESTORE                         ║
// ║  Saves a timestamped snapshot every 24h, keeps last 30 days        ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_BACKUP_LS_KEY = 'kia_fb_last_backup';

function fbBackupCheck() {
    if (!fbSync.enabled || !fbSync.db || !fbSync.stationId) return;

    var lastBackup = localStorage.getItem(FB_BACKUP_LS_KEY) || '';
    var today = new Date().toISOString().slice(0, 10);

    if (lastBackup === today) return; // Already backed up today

    fbBackupNow(function(ok) {
        if (ok) {
            localStorage.setItem(FB_BACKUP_LS_KEY, today);
            console.log('Firebase Backup: Daily backup completed for ' + today);
        }
    });
}

function fbBackupNow(callback) {
    if (!fbSync.enabled || !fbSync.db || !fbSync.stationId) {
        if (callback) callback(false);
        return;
    }
    var quota = fbQuotaCheck('write');
    if (!quota.allowed) { console.warn('Backup skipped (quota): ' + quota.reason); if (callback) callback(false); return; }

    var today = new Date().toISOString().slice(0, 10);
    var snapshot = {
        cop15: { vehicleCount: (db.vehicles || []).length, data: db },
        testplan: { testedCount: (tpState.testedList || []).length, data: tpState },
        results: { testCount: (raState.tests || []).length, data: raState },
        inventory: { gasCount: (invState.gases || []).length, equipCount: (invState.equipment || []).length, data: invState },
        meta: {
            station: fbSync.stationId,
            date: today,
            timestamp: new Date().toISOString(),
            version: 'v11'
        }
    };

    var backupRef = fbSync.db.collection('stations').doc(fbSync.stationId)
        .collection('backups').doc(today);

    backupRef.set(snapshot).then(function() {
        fbQuotaRecord('write');
        if (callback) callback(true);

        // Cleanup: delete backups older than 30 days
        fbBackupCleanup();
    }).catch(function(err) {
        console.error('Firebase Backup: Error saving backup', err);
        if (callback) callback(false);
    });
}

function fbBackupCleanup() {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    var cutoffStr = cutoff.toISOString().slice(0, 10);

    fbSync.db.collection('stations').doc(fbSync.stationId)
        .collection('backups')
        .where('meta.date', '<', cutoffStr)
        .get()
        .then(function(snap) {
            var batch = fbSync.db.batch();
            var count = 0;
            snap.forEach(function(doc) {
                batch.delete(doc.ref);
                count++;
            });
            if (count > 0) {
                batch.commit().then(function() {
                    console.log('Firebase Backup: Cleaned up ' + count + ' old backups');
                });
            }
        })
        .catch(function(err) {
            console.warn('Firebase Backup: Cleanup error', err);
        });
}

function fbBackupManual() {
    showToast('Creando backup...', 'info');
    fbBackupNow(function(ok) {
        if (ok) {
            localStorage.setItem(FB_BACKUP_LS_KEY, new Date().toISOString().slice(0, 10));
            showToast('Backup guardado en Firebase', 'success');
            fbShowSettings();
        } else {
            showToast('Error creando backup', 'error');
        }
    });
}

function fbBackupList(callback) {
    if (!fbSync.enabled || !fbSync.db || !fbSync.stationId) { callback([]); return; }
    var quota = fbQuotaCheck('read');
    if (!quota.allowed) { showToast(quota.reason, 'error'); callback([]); return; }

    fbSync.db.collection('stations').doc(fbSync.stationId)
        .collection('backups')
        .orderBy('meta.date', 'desc')
        .limit(30)
        .get()
        .then(function(snap) {
            fbQuotaRecord('read');
            var list = [];
            snap.forEach(function(doc) {
                var d = doc.data();
                list.push({
                    id: doc.id,
                    date: d.meta ? d.meta.date : doc.id,
                    timestamp: d.meta ? d.meta.timestamp : '',
                    vehicles: d.cop15 ? d.cop15.vehicleCount : '?',
                    tests: d.results ? d.results.testCount : '?',
                    gases: d.inventory ? d.inventory.gasCount : '?'
                });
            });
            callback(list);
        })
        .catch(function(err) {
            console.error('Firebase Backup: List error', err);
            callback([]);
        });
}

function fbBackupRestore(backupId) {
    if (!confirm('Restaurar backup del ' + backupId + '?\n\nEsto reemplazara TODOS los datos locales. Se recomienda hacer un backup manual antes.')) return;

    fbSync.db.collection('stations').doc(fbSync.stationId)
        .collection('backups').doc(backupId)
        .get()
        .then(function(doc) {
            if (!doc.exists) { showToast('Backup no encontrado', 'error'); return; }
            var d = doc.data();

            if (d.cop15 && d.cop15.data) {
                db = d.cop15.data;
                localStorage.setItem('kia_db_v11', JSON.stringify(db));
                refreshAllLists();
            }
            if (d.testplan && d.testplan.data) {
                tpState = d.testplan.data;
                localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState));
                if (typeof tpRender === 'function') tpRender();
            }
            if (d.results && d.results.data) {
                raState = d.results.data;
                localStorage.setItem('kia_results_v1', JSON.stringify(raState));
                if (typeof raRender === 'function') raRender();
            }
            if (d.inventory && d.inventory.data) {
                invState = d.inventory.data;
                localStorage.setItem('kia_lab_inventory', JSON.stringify(invState));
                if (typeof invRender === 'function') invRender();
            }

            showToast('Backup del ' + backupId + ' restaurado', 'success');
            fbShowSettings();
        })
        .catch(function(err) {
            showToast('Error restaurando: ' + err.message, 'error');
        });
}

function fbBackupShowList() {
    var modal = document.getElementById('fbModal');
    if (!modal) return;
    modal.innerHTML = '<div style="max-width:480px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;color:#e2e8f0;text-align:center;">' +
        '<div style="font-size:24px;">Cargando backups...</div></div>';

    fbBackupList(function(list) {
        var html = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">';
        html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>';
        html += '<h3 style="margin:0 0 12px;color:#3b82f6;">Backups Disponibles (' + list.length + ')</h3>';

        if (list.length === 0) {
            html += '<div style="text-align:center;padding:20px;color:#64748b;">No hay backups guardados aun.</div>';
        } else {
            list.forEach(function(b) {
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-bottom:4px;border:1px solid #1e293b;border-radius:6px;background:#1e293b;">';
                html += '<div>';
                html += '<div style="font-size:11px;font-weight:700;">' + b.date + '</div>';
                html += '<div style="font-size:9px;color:#64748b;">' + b.vehicles + ' vehiculos | ' + b.tests + ' pruebas | ' + b.gases + ' gases</div>';
                html += '</div>';
                html += '<button onclick="fbBackupRestore(\x27' + b.id + '\x27)" style="padding:5px 12px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:10px;">Restaurar</button>';
                html += '</div>';
            });
        }

        html += '<div style="display:flex;gap:8px;margin-top:12px;">';
        html += '<button onclick="fbShowSettings()" style="flex:1;padding:8px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:11px;">Volver</button>';
        html += '<button onclick="fbBackupManual()" style="flex:1;padding:8px;background:#0f766e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;">Crear Backup Ahora</button>';
        html += '</div></div>';

        modal.innerHTML = html;
    });
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  ACTIVITY FEED — Cross-station event timeline                       ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_ACTIVITY_COLLECTION = 'activity';
var FB_ACTIVITY_MAX = 200;

function fbActivityPost(action, details) {
    if (!fbSync.enabled || fbSync.status !== 'connected') return;

    // Rate limit activity posts too
    var quota = fbQuotaCheck('write');
    if (!quota.allowed) { console.warn('Activity post skipped (quota): ' + quota.reason); return; }

    try {
        var fdb = firebase.firestore();
        var user = typeof authGetCurrentUser === 'function' ? authGetCurrentUser() : null;
        fdb.collection(FB_ACTIVITY_COLLECTION).add({
            station: fbSync.stationId || 'unknown',
            operator: user ? user.name : '',
            action: action,
            details: details || '',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            localTime: new Date().toISOString()
        }).then(function() {
            fbQuotaRecord('write');
            // Only cleanup once per day (not every post — saves many reads)
            var lastCleanup = localStorage.getItem('kia_fb_activity_cleanup') || '';
            var today = new Date().toISOString().slice(0, 10);
            if (lastCleanup !== today) {
                localStorage.setItem('kia_fb_activity_cleanup', today);
                fbActivityCleanup();
            }
        }).catch(function(e) {
            console.warn('Activity post failed:', e);
        });
    } catch(e) { console.warn('Activity post error:', e); }
}

function fbActivityCleanup() {
    try {
        var fdb = firebase.firestore();
        fdb.collection(FB_ACTIVITY_COLLECTION).orderBy('timestamp', 'desc').get().then(function(snap) {
            if (snap.size <= FB_ACTIVITY_MAX) return;
            var batch = fdb.batch();
            var count = 0;
            snap.docs.slice(FB_ACTIVITY_MAX).forEach(function(doc) {
                batch.delete(doc.ref);
                count++;
            });
            if (count > 0) batch.commit();
        });
    } catch(e) {}
}

function fbActivityLoad(callback) {
    if (!fbSync.enabled || fbSync.status !== 'connected') { callback([]); return; }
    var quota = fbQuotaCheck('read');
    if (!quota.allowed) { showToast(quota.reason, 'error'); callback([]); return; }
    try {
        var fdb = firebase.firestore();
        fdb.collection(FB_ACTIVITY_COLLECTION).orderBy('timestamp', 'desc').limit(80).get().then(function(snap) {
            fbQuotaRecord('read');
            var events = [];
            snap.forEach(function(doc) {
                var d = doc.data();
                events.push({
                    station: d.station || '?',
                    operator: d.operator || '',
                    action: d.action || '',
                    details: d.details || '',
                    time: d.timestamp ? d.timestamp.toDate() : new Date(d.localTime || Date.now())
                });
            });
            callback(events);
        }).catch(function(e) {
            console.warn('Activity load failed:', e);
            callback([]);
        });
    } catch(e) { callback([]); }
}

function fbActivityShowFeed() {
    var modal = document.getElementById('fbModal');
    if (!modal) return;
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">' +
        '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>' +
        '<h3 style="margin:0 0 12px;color:#6366f1;">📡 Activity Feed</h3>' +
        '<div style="text-align:center;padding:30px;color:#64748b;">Cargando actividad...</div></div>';

    fbActivityLoad(function(events) {
        var html = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">';
        html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>';
        html += '<h3 style="margin:0 0 4px;color:#6366f1;">📡 Activity Feed</h3>';
        html += '<div style="font-size:10px;color:#64748b;margin-bottom:14px;">Eventos recientes de todas las estaciones</div>';

        if (events.length === 0) {
            html += '<div style="text-align:center;padding:30px;color:#64748b;">No hay actividad registrada aun.</div>';
        } else {
            // Station color map
            var stationColors = {};
            var palette = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
            var ci = 0;
            events.forEach(function(e) {
                if (!stationColors[e.station]) { stationColors[e.station] = palette[ci % palette.length]; ci++; }
            });

            // Group by date
            var grouped = {};
            events.forEach(function(e) {
                var dateKey = e.time.toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' });
                if (!grouped[dateKey]) grouped[dateKey] = [];
                grouped[dateKey].push(e);
            });

            var actionIcons = {
                'vehicle_registered': '🚗', 'test_started': '▶️', 'test_completed': '✅',
                'vehicle_released': '🏁', 'soak_started': '⏱️', 'plan_generated': '📋',
                'plan_accepted': '✅', 'test_imported': '📥', 'gas_reading': '⛽',
                'calibration': '🔧', 'sync_push': '☁️', 'sync_pull': '📥',
                'backup_created': '💾'
            };

            Object.keys(grouped).forEach(function(dateKey) {
                html += '<div style="font-size:10px;font-weight:700;color:#475569;margin:12px 0 6px;padding-bottom:4px;border-bottom:1px solid #1e293b;">' + dateKey + '</div>';
                grouped[dateKey].forEach(function(e) {
                    var icon = actionIcons[e.action] || '📌';
                    var sColor = stationColors[e.station] || '#64748b';
                    var timeStr = e.time.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
                    html += '<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #0f172a;">';
                    html += '<div style="min-width:42px;font-size:9px;color:#64748b;padding-top:2px;">' + timeStr + '</div>';
                    html += '<div style="font-size:14px;line-height:1;">' + icon + '</div>';
                    html += '<div style="flex:1;">';
                    html += '<span style="font-size:10px;font-weight:700;color:' + sColor + ';padding:1px 6px;background:' + sColor + '20;border-radius:4px;margin-right:4px;">' + e.station + '</span>';
                    if (e.operator) html += '<span style="font-size:9px;color:#a78bfa;margin-right:4px;">' + e.operator + '</span>';
                    html += '<span style="font-size:10px;color:#cbd5e1;">' + fbActivityLabel(e.action) + '</span>';
                    if (e.details) html += '<div style="font-size:9px;color:#64748b;margin-top:2px;">' + e.details + '</div>';
                    html += '</div></div>';
                });
            });
        }

        html += '<div style="display:flex;gap:8px;margin-top:14px;">';
        html += '<button onclick="fbShowSettings()" style="flex:1;padding:8px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:11px;">Volver</button>';
        html += '<button onclick="fbActivityShowFeed()" style="flex:1;padding:8px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;">Actualizar</button>';
        html += '</div></div>';

        modal.innerHTML = html;
    });
}

function fbActivityLabel(action) {
    var labels = {
        'vehicle_registered': 'Vehiculo registrado',
        'test_started': 'Prueba iniciada',
        'test_completed': 'Prueba completada',
        'vehicle_released': 'Vehiculo liberado',
        'soak_started': 'Soak timer iniciado',
        'plan_generated': 'Plan semanal generado',
        'plan_accepted': 'Plan semanal aceptado',
        'test_imported': 'Resultados importados',
        'gas_reading': 'Lectura de gas registrada',
        'calibration': 'Calibracion registrada',
        'sync_push': 'Datos subidos a nube',
        'sync_pull': 'Datos descargados de nube',
        'backup_created': 'Backup creado'
    };
    return labels[action] || action.replace(/_/g, ' ');
}

// Hook activity posts into key operations
(function() {
    // Hook saveDB (COP15 operations)
    var _origSaveDB = typeof saveDB === 'function' ? saveDB : null;
    if (_origSaveDB) {
        window.saveDB = function() {
            var result = _origSaveDB.apply(this, arguments);
            return result;
        };
    }

    // We post activity from specific user actions rather than generic saves
    // The functions below are called directly from COP15, TestPlan, Results, Inventory
})();

// Convenience wrappers called from other modules
function fbPostVehicleRegistered(vin, config) {
    fbActivityPost('vehicle_registered', vin + ' — ' + (config || ''));
}
function fbPostTestStarted(vin) {
    fbActivityPost('test_started', vin);
}
function fbPostTestCompleted(vin, result) {
    fbActivityPost('test_completed', vin + (result ? ' — ' + result : ''));
}
function fbPostVehicleReleased(vin) {
    fbActivityPost('vehicle_released', vin);
}
function fbPostSoakStarted(vin, hours) {
    fbActivityPost('soak_started', vin + ' — ' + hours + 'h');
}
function fbPostPlanGenerated(count) {
    fbActivityPost('plan_generated', count + ' pruebas programadas');
}
function fbPostPlanAccepted(weekNum) {
    fbActivityPost('plan_accepted', 'Semana #' + weekNum);
}
function fbPostTestImported(count) {
    fbActivityPost('test_imported', count + ' pruebas importadas');
}
function fbPostGasReading(gasName, psi) {
    fbActivityPost('gas_reading', gasName + ': ' + psi + ' PSI');
}
function fbPostCalibration(equipName) {
    fbActivityPost('calibration', equipName);
}
function fbPostSyncPush() {
    fbActivityPost('sync_push', '');
}
function fbPostSyncPull() {
    fbActivityPost('sync_pull', '');
}
