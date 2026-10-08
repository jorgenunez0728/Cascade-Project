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

// ── Espacio de trabajo compartido: todos los dispositivos comparten un solo dataset del lab ──
var FB_SHARED_WORKSPACE = 'KIA-EMLAB';

// [v15.6] Usuario único del laboratorio (Email/Password). La contraseña se
// ingresa UNA vez por dispositivo; la sesión persiste en el navegador. Las
// Security Rules solo aceptan sesiones con proveedor 'password' (firestore.rules).
// El usuario se crea en la consola: Authentication → Users → Add user.
var FB_LAB_EMAIL = 'laboratorio@kia-emlab-test-system.firebaseapp.com';
// ID único de ESTE dispositivo (para distinguir ecos propios de cambios de otros en el mismo espacio)
var FB_DEVICE_ID = (function() {
    var k = 'kia_fb_device', v = null;
    try { v = localStorage.getItem(k); } catch(e) {}
    if (!v) { v = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); try { localStorage.setItem(k, v); } catch(e) {} }
    return v;
})();

// ── Selective Module Sync ──
var FB_SYNC_MODULES_KEY = 'kia_fb_sync_modules';
var fbSyncModules = (function() {
    try { return JSON.parse(localStorage.getItem(FB_SYNC_MODULES_KEY)) || null; } catch(e) { return null; }
})() || {
    cop15: true, testplan: true, inventory: true, panel: true, cop: true, audit: true, homolog: true
};
// Backfill new module flags for users that already have a saved fbSyncModules object
if (typeof fbSyncModules.cop === 'undefined') fbSyncModules.cop = true;
if (typeof fbSyncModules.audit === 'undefined') fbSyncModules.audit = true;
// v17.14: catálogo de homologación Europa (coeficientes de dinamómetro + CO2 declarado)
if (typeof fbSyncModules.homolog === 'undefined') fbSyncModules.homolog = true;
// v15.6: results/approvals eliminados — limpiar flags heredados de dispositivos viejos
delete fbSyncModules.results;
delete fbSyncModules.approvals;
function fbSaveSyncModules() {
    localStorage.setItem(FB_SYNC_MODULES_KEY, JSON.stringify(fbSyncModules));
}

// Dependency validation for sync module toggles
var FB_SYNC_DEPS = {
    testplan: { requires: ['cop15'], warn: 'Test Plan depende de COP15 para auto-feed de releases.' },
    inventory: { recommends: ['testplan'], warn: 'Inventario alimenta predicciones del Test Plan.' }
};

function fbToggleSyncModule(key, enabled) {
    if (enabled) {
        // When enabling, check if required dependencies are on
        var dep = FB_SYNC_DEPS[key];
        if (dep && dep.requires) {
            var missing = dep.requires.filter(function(r) { return !fbSyncModules[r]; });
            if (missing.length > 0) {
                showConfirmDialog({ title: '🔗 Dependencias', message: dep.warn + '\n\n¿Activar también ' + missing.join(', ') + '?', type: 'info', confirmText: 'Activar', cancelText: 'No' }).then(function(ok) {
                    if (ok) { missing.forEach(function(m) { fbSyncModules[m] = true; }); }
                    fbSyncModules[key] = true;
                    fbSaveSyncModules();
                    fbShowSettings();
                });
                return;
            }
        }
        fbSyncModules[key] = true;
    } else {
        // When disabling, check if anything depends on this module
        var dependents = Object.keys(FB_SYNC_DEPS).filter(function(k) {
            var d = FB_SYNC_DEPS[k];
            return d.requires && d.requires.indexOf(key) !== -1 && fbSyncModules[k];
        });
        if (dependents.length > 0) {
            showConfirmDialog({ title: '⚠️ Dependencias', message: 'Los modulos ' + dependents.join(', ') + ' dependen de ' + key + '.\n\n¿Desactivar de todos modos?', type: 'warning', confirmText: 'Desactivar', cancelText: 'Cancelar' }).then(function(ok) {
                if (!ok) return;
                fbSyncModules[key] = false;
                fbSaveSyncModules();
                fbShowSettings();
            });
            return;
        }
        fbSyncModules[key] = false;
    }
    fbSaveSyncModules();
    fbShowSettings(); // Re-render to update checkbox states
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
// Priority levels: 1=critical, 2=normal, 3=low
var FB_PRIORITY_MAP = {
    'cop15': 1, 'cop15-release': 1, 'readings-anomaly': 1,
    'testplan': 2, 'inventory': 2, 'readings': 2, 'panel': 2,
    'backups': 3, 'activity': 3, 'merge-history': 3
};

function fbQueueAdd(collection, data, priority) {
    var prio = priority || FB_PRIORITY_MAP[collection] || 2;
    fbOfflineQueue.push({
        id: Date.now().toString(36),
        collection: collection,
        data: data,
        timestamp: new Date().toISOString(),
        retries: 0,
        priority: prio
    });
    // Sort by priority (lower number = higher priority)
    fbOfflineQueue.sort(function(a, b) { return (a.priority || 2) - (b.priority || 2); });
    // slice(-50) conservaba los ÚLTIMOS 50 de una lista ordenada por prioridad
    // ASCENDENTE, o sea que tiraba justo las operaciones MÁS importantes y se
    // quedaba con las menos. Al revés de lo que se quería.
    if (fbOfflineQueue.length > FB_QUEUE_MAX) fbOfflineQueue = fbOfflineQueue.slice(0, FB_QUEUE_MAX);
    fbQueueSave();
    fbUpdateIndicator();
}
function fbQueueRetry() {
    if (fbOfflineQueue.length === 0) return;
    if (!fbSync.enabled || !fbSync.db || !fbSync.stationId) return;

    // Smart quota gating by priority
    var quota = fbQuotaCheck('write');
    if (!quota.allowed) {
        // Even when quota blocked, allow priority 1 (critical) items if under 90% daily
        var dailyUsed = fbQuota.writes.length;
        var dailyLimit = FB_QUOTA_LIMITS.maxWritesPerDay;
        var criticalItem = fbOfflineQueue.find(function(i) { return (i.priority || 2) === 1; });
        if (!criticalItem || dailyUsed >= dailyLimit * 0.9) return;
        // Move critical item to front
        var idx = fbOfflineQueue.indexOf(criticalItem);
        if (idx > 0) { fbOfflineQueue.splice(idx, 1); fbOfflineQueue.unshift(criticalItem); }
    }

    var item = fbOfflineQueue[0];
    // [2.35.0] Una foto encolada de un módulo en revisión espera (fbReviewFinish la descarta).
    if (typeof fbReviewHolds === 'function' && fbReviewHolds(item.collection)) return;
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
    _useREST: false,               // Fall back to REST API if SDK transport broken
    _listeners: [],                // onSnapshot unsubscribe functions for live sync
    _pendingMerge: {},             // Debounce timers: "stationId|col" → timerID
    _recentRemote: {},             // Anti-duplicate: "stationId|col" → timestamp of last processed change
    _liveSync: false               // true when onSnapshot listeners are active
};

// Detect if we're on a non-standard origin (content://, file://)
var FB_IS_HTTP_ORIGIN = (location.protocol === 'http:' || location.protocol === 'https:');

// ── Rate Limiter & Quota ──
var FB_QUOTA_LS_KEY = 'kia_fb_quota';
// Cuota REAL del plan gratuito (Spark) de Firestore, por PROYECTO y por día.
// Sirve de referencia para mostrar cuánto margen queda de verdad.
var FB_FREE_TIER = { writesPerDay: 20000, readsPerDay: 50000 };
// Cuántos equipos comparten el proyecto (para estimar el techo entre todos).
var FB_ASSUMED_DEVICES = 5;

// Tope propio de protección de costos, POR DISPOSITIVO.
//
// Estaba en 500 escrituras/día = 2.5% del plan gratuito, y 60/hora era tan bajo
// que un turno normal lo reventaba: el laboratorio veía 211 operaciones
// bloqueadas y 50 en cola mientras Firebase estaba prácticamente sin usar.
// Con estos valores y 5 equipos, el techo entre todos es 10.000 escrituras/día
// = 50% del gratuito, y el uso esperado queda muy por debajo.
var FB_QUOTA_LIMITS = {
    maxWritesPerHour: 500,      // ráfaga de un turno con varios módulos sincronizando
    maxReadsPerHour: 1500,
    maxWritesPerDay: 2000,      // × 5 equipos = 10.000/día = 50% del plan gratuito
    maxReadsPerDay: 10000,      // × 5 equipos = 50.000... se vigila con el aviso de abajo
    // [2.3.0] El tope de tamaño ya no vive aquí: ver FB_DOC_SAFE_BYTES / fbFirestoreDocSize.
    cooldownAfterBurstMs: 30000 // 30s cooldown after hitting hourly limit
};
var FB_QUEUE_MAX = 200;         // era 50 y se llenaba en un turno

var fbQuota = {
    writes: [],       // timestamps de escrituras — PODADO a la última hora
    reads: [],        // timestamps de lecturas  — PODADO a la última hora
    dayWrites: 0,     // acumulado del día (los de arriba se podan, no sirven para el día)
    dayReads: 0,
    blocked: 0,       // operaciones bloqueadas hoy
    dailyDate: ''     // fecha para el corte diario
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
                fbQuota.dayWrites = 0;
                fbQuota.dayReads = 0;
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
        fbQuota.dayWrites = 0;
        fbQuota.dayReads = 0;
        fbQuota.blocked = 0;
        fbQuota.dailyDate = today;
    }

    fbQuotaPrune(fbQuota.writes);
    fbQuotaPrune(fbQuota.reads);

    var arr = type === 'write' ? fbQuota.writes : fbQuota.reads;
    var hourlyLimit = type === 'write' ? FB_QUOTA_LIMITS.maxWritesPerHour : FB_QUOTA_LIMITS.maxReadsPerHour;
    var dailyLimit = type === 'write' ? FB_QUOTA_LIMITS.maxWritesPerDay : FB_QUOTA_LIMITS.maxReadsPerDay;
    // Antes esto leía fbQuota.writes.length, pero ese array se poda a la ÚLTIMA
    // HORA (fbQuotaPrune), así que el "conteo diario" era en realidad el de la
    // hora: el panel mostraba el mismo 75 en "por hora" y en "diario", y el tope
    // diario no podía dispararse nunca porque 60/hora salta mucho antes.
    var dailyCount = type === 'write' ? (fbQuota.dayWrites || 0) : (fbQuota.dayReads || 0);

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
    if (type === 'write') fbQuota.dayWrites = (fbQuota.dayWrites || 0) + 1;
    else fbQuota.dayReads = (fbQuota.dayReads || 0) + 1;
    fbQuotaSave();
}

// ── [2.3.0] Tamaño de un documento TAL COMO LO CUENTA FIRESTORE ──
//
// Antes el tope se medía con JSON.stringify(data).length contra 900 KB. El JSON
// no es lo que Firestore cobra: cada módulo viaja como UN documento, y el límite
// duro de un documento es 1 MiB medido con las reglas de "Storage size
// calculations" de Firestore (texto = bytes UTF-8 + 1, número = 8, booleano = 1,
// nombre de campo = bytes UTF-8 + 1, documento = nombre + campos + 32). Medir mal
// en cualquiera de las dos direcciones es malo: de más, se bloquea una subida que
// cabía; de menos, Firestore la rechaza con un error críptico.
//
// FB_DOC_SAFE_BYTES deja ~48 KB de margen bajo el límite real para lo que el
// cálculo no ve (metadatos del SDK, redondeos del servidor).
var FB_DOC_MAX_BYTES = 1048576;
var FB_DOC_SAFE_BYTES = 1000000;

/** Bytes UTF-8 de un texto (sin TextEncoder: también corre en Node/vm). PURA. */
function _fbUtf8Bytes(s) {
    s = String(s);
    var n = 0;
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c < 0x80) n += 1;
        else if (c < 0x800) n += 2;
        else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
            var d = s.charCodeAt(i + 1);
            if (d >= 0xDC00 && d <= 0xDFFF) { n += 4; i++; } else n += 3;
        }
        else n += 3;
    }
    return n;
}

/**
 * Tamaño de un VALOR según las reglas de Firestore. PURA.
 * `undefined` y funciones no cuentan (no se guardan); Date cuenta como timestamp.
 */
function fbFirestoreValueSize(v) {
    if (v === null) return 1;
    var t = typeof v;
    if (t === 'undefined' || t === 'function') return 0;
    if (t === 'boolean') return 1;
    if (t === 'number') return 8;
    if (t === 'string') return _fbUtf8Bytes(v) + 1;
    if (v instanceof Date) return 8;
    if (Array.isArray(v)) {
        var a = 0;
        for (var i = 0; i < v.length; i++) a += fbFirestoreValueSize(v[i]);
        return a;
    }
    // Mapa: suma de (nombre del campo + valor). Un campo `undefined` no se guarda.
    var m = 0;
    for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        var fv = v[k];
        if (typeof fv === 'undefined' || typeof fv === 'function') continue;
        m += _fbUtf8Bytes(k) + 1 + fbFirestoreValueSize(fv);
    }
    return m;
}

/**
 * Tamaño de un DOCUMENTO completo. `pathSegments` = ['stations','KIA-EMLAB','cop15','current'].
 * Es LA definición del tamaño que la nube le cobra a un módulo. PURA.
 */
function fbFirestoreDocSize(fields, pathSegments) {
    var name = 16;
    (pathSegments || []).forEach(function(seg) { name += _fbUtf8Bytes(seg) + 1; });
    return name + fbFirestoreValueSize(fields || {}) + 32;
}

/**
 * Tamaño que ocuparía el documento de un módulo en la nube, con los mismos
 * campos que escribe fbPush ({data, updatedAt, station, writer}). PURA respecto a
 * sus argumentos.
 */
function fbModuleDocBytes(collection, data, stationId, deviceId) {
    return fbFirestoreDocSize(
        { data: data, updatedAt: new Date(0), station: stationId || '', writer: deviceId || '' },
        ['stations', stationId || 'KIA-EMLAB', collection || 'current', 'current']);
}

// Check payload size before push
function fbQuotaCheckSize(data, collection) {
    try {
        var st = (typeof fbSync !== 'undefined' && fbSync.stationId) || 'KIA-EMLAB';
        var dev = (typeof FB_DEVICE_ID !== 'undefined') ? FB_DEVICE_ID : '';
        var bytes = fbModuleDocBytes(collection, data, st, dev);
        var sizeKB = Math.round(bytes / 1024);
        var pct = Math.round((bytes / FB_DOC_SAFE_BYTES) * 100);
        if (bytes > FB_DOC_SAFE_BYTES) {
            return { allowed: false, bytes: bytes, sizeKB: sizeKB, pct: pct,
                reason: 'No se pudo subir ' + (collection || 'el módulo') + ' a la nube: ocupa ' + sizeKB +
                    ' KB y un documento admite ' + Math.round(FB_DOC_SAFE_BYTES / 1024) +
                    ' KB. Los demás equipos no verán estos cambios. Revisa Datos → Sistema → Capacidad de sincronización.' };
        }
        return { allowed: true, bytes: bytes, sizeKB: sizeKB, pct: pct };
    } catch(e) {
        return { allowed: true, sizeKB: 0 };
    }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.3.0] CAPACIDAD DE SINCRONIZACIÓN                                ║
// ║  Cada módulo viaja como UN documento (stations/KIA-EMLAB/{col}/     ║
// ║  current). Si pasa de FB_DOC_SAFE_BYTES, fbPush deja de subirlo y   ║
// ║  los demás equipos dejan de ver esos cambios. Esto lo mide ANTES de ║
// ║  que pase y dice qué pesa. fbSyncCapacity() es LA definición; la    ║
// ║  usan Datos → Sistema y pnGetActiveAlerts (vía fbSyncAlerts).       ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_CAPACITY_WARN_PCT = 75;
var FB_CAPACITY_CRIT_PCT = 90;
var FB_CAPACITY_LABELS = {
    cop15: 'Vehículos (COP15)', testplan: 'Plan de pruebas', inventory: 'Consumibles y equipos',
    panel: 'Panel y proyectos', cop: 'CoP', homolog: 'Homologación Europa', audit: 'Historial de cambios'
};

/** Nivel de un % de uso. PURA. */
function fbCapacityLevel(pct) {
    return pct >= FB_CAPACITY_CRIT_PCT ? 'critico' : pct >= FB_CAPACITY_WARN_PCT ? 'alto' : 'ok';
}

/** Suma lo que ocupan las imágenes incrustadas ('data:image/…', p. ej. firmas). PURA. */
function _fbImagesSize(v) {
    if (typeof v === 'string') return v.slice(0, 11) === 'data:image/' ? _fbUtf8Bytes(v) + 1 : 0;
    if (!v || typeof v !== 'object') return 0;
    var n = 0;
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) n += _fbImagesSize(v[i]); return n; }
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) n += _fbImagesSize(v[k]);
    return n;
}

/**
 * De qué está hecho el peso de los vehículos. PURA.
 * - images: imágenes incrustadas (firmas de liberador/aprobador/retroactivas)
 * - profiles: perfiles de gases congelados al liberar (2.2.0)
 * - timeline: línea de tiempo + historial de devoluciones
 * - rest: todo lo demás (datos de captura, configuración, resultados)
 */
function fbVehicleWeight(vehicles) {
    var out = { count: 0, total: 0, images: 0, profiles: 0, timeline: 0, rest: 0, avg: 0, withImages: 0 };
    (vehicles || []).forEach(function(v) {
        if (!v || typeof v !== 'object') return;
        var tot = fbFirestoreValueSize(v);
        var img = _fbImagesSize(v);
        var prof = 0;
        var gr = v.testData && v.testData.gasResults;
        if (gr && typeof gr === 'object') {
            Object.keys(gr).forEach(function(k) {
                if (gr[k] && typeof gr[k] === 'object' && gr[k].profile) prof += fbFirestoreValueSize(gr[k].profile) + _fbUtf8Bytes('profile') + 1;
            });
        }
        var tl = fbFirestoreValueSize(v.timeline || []) + fbFirestoreValueSize(v.returnHistory || []);
        out.count++;
        out.total += tot;
        out.images += img;
        out.profiles += prof;
        out.timeline += tl;
        out.rest += Math.max(0, tot - img - prof - tl);
        if (img > 0) out.withImages++;
    });
    out.avg = out.count ? Math.round(out.total / out.count) : 0;
    return out;
}

/**
 * Filas de capacidad por módulo. PURA.
 * mods: [{col, data}] · limit: bytes permitidos por documento.
 */
function fbCapacityRows(mods, limit, stationId, deviceId) {
    limit = limit || FB_DOC_SAFE_BYTES;
    return (mods || []).map(function(m) {
        var bytes = fbModuleDocBytes(m.col, m.data, stationId, deviceId);
        var pct = Math.round((bytes / limit) * 1000) / 10;
        return { col: m.col, label: FB_CAPACITY_LABELS[m.col] || m.col, bytes: bytes,
                 pct: pct, level: fbCapacityLevel(pct), free: Math.max(0, limit - bytes) };
    }).sort(function(a, b) { return b.pct - a.pct; });
}

/** Los mismos módulos y las mismas fuentes que sube fbPushAll. */
function _fbCapacityModules() {
    var mods = [];
    var on = function(c) { return typeof fbSyncModules === 'undefined' || fbSyncModules[c] !== false; };
    if (on('cop15') && typeof db !== 'undefined' && db) mods.push({ col: 'cop15', data: db });
    if (on('testplan') && typeof tpState !== 'undefined' && tpState) mods.push({ col: 'testplan', data: tpState });
    if (on('inventory') && typeof invState !== 'undefined' && invState) mods.push({ col: 'inventory', data: invState });
    if (on('panel') && typeof pnState !== 'undefined' && pnState) mods.push({ col: 'panel', data: pnState });
    ['cop:kia_cop_v1', 'homolog:kia_homolog_v1'].forEach(function(p) {
        var c = p.split(':')[0];
        if (!on(c)) return;
        var raw = null; try { raw = JSON.parse(localStorage.getItem(p.split(':')[1])); } catch (e) {}
        if (raw) mods.push({ col: c, data: raw });
    });
    if (on('audit') && typeof auditGetTrail === 'function') mods.push({ col: 'audit', data: auditGetTrail() });
    return mods;
}

var _fbCapacityCache = null;
var FB_CAPACITY_TTL_MS = 60000;

function fbSyncCapacityInvalidate() { _fbCapacityCache = null; }
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('data:saved', fbSyncCapacityInvalidate);

/**
 * Estado de capacidad de la nube. Memoizada (60 s o hasta el siguiente guardado):
 * pnGetActiveAlerts corre en cada render del Panel.
 * Devuelve {rows, top, weight, vehiclesLeft, limit, blocked, at}.
 */
function fbSyncCapacity(force) {
    if (!force && _fbCapacityCache && Date.now() - _fbCapacityCache.at < FB_CAPACITY_TTL_MS) return _fbCapacityCache;
    var st = (typeof fbSync !== 'undefined' && fbSync.stationId) || 'KIA-EMLAB';
    var dev = (typeof FB_DEVICE_ID !== 'undefined') ? FB_DEVICE_ID : '';
    var rows = [], weight = null;
    try { rows = fbCapacityRows(_fbCapacityModules(), FB_DOC_SAFE_BYTES, st, dev); } catch (e) { rows = []; }
    try { weight = fbVehicleWeight((typeof db !== 'undefined' && db && db.vehicles) || []); } catch (e) { weight = null; }
    var cop = rows.filter(function(r) { return r.col === 'cop15'; })[0];
    // [2.9.0] Con vehículos uno por uno el tope ya no es "cuántos caben": cada vehículo
    // tiene su documento. La fila cop15 pasa a ser la copia para equipos sin actualizar
    // y se suma la del vehículo más pesado (lo único que todavía podría no caber).
    var perVehicle = typeof fbVehActive === 'function' && fbVehActive();
    var vehiclesLeft = (!perVehicle && cop && weight && weight.avg > 0) ? Math.floor(cop.free / weight.avg) : null;
    if (perVehicle) {
        if (cop) { cop.label = 'Copia completa de vehículos (solo equipos sin actualizar)'; cop.legacy = true; }
        try {
            var big = fbVehLargestDoc((typeof db !== 'undefined' && db && db.vehicles) || []);
            if (big.bytes > 0) {
                var bpct = Math.round((big.bytes / FB_DOC_SAFE_BYTES) * 1000) / 10;
                rows.push({ col: 'vehicle', label: 'Vehículo más pesado (' + big.vin + ')', bytes: big.bytes, pct: bpct,
                            level: fbCapacityLevel(bpct), free: Math.max(0, FB_DOC_SAFE_BYTES - big.bytes) });
                rows.sort(function(a, b) { return b.pct - a.pct; });
            }
        } catch (e) {}
    }
    var blocked = (typeof fbSync !== 'undefined' && fbSync.sizeBlocked) ? Object.keys(fbSync.sizeBlocked) : [];
    _fbCapacityCache = { rows: rows, top: rows[0] || null, weight: weight, vehiclesLeft: vehiclesLeft,
        limit: FB_DOC_SAFE_BYTES, blocked: blocked, perVehicle: perVehicle, at: Date.now() };
    return _fbCapacityCache;
}

/**
 * Alertas de la capa de nube para pnGetActiveAlerts (capacidad + respaldo diario).
 * Mismo formato que las demás fuentes: {level, color, message, source}.
 */
function fbSyncAlerts() {
    var out = [];
    // Un equipo sin sincronización no sube nada: su alerta de capacidad sería ruido
    // (la tarjeta de Datos → Sistema sí se sigue mostrando).
    var syncOn = typeof fbSync !== 'undefined' && fbSync.enabled;
    try {
        var cap = syncOn ? fbSyncCapacity() : { rows: [], blocked: [] };
        cap.rows.forEach(function(r) {
            var bloqueado = cap.blocked.indexOf(r.col) >= 0;
            // [2.9.0] La copia completa solo la leen los equipos sin actualizar: llenarse
            // no es un problema de este equipo; dejar de caber sí es un aviso para ellos.
            if (r.legacy) {
                if (bloqueado) out.push({ level: 'ALTA', color: '#f59e0b', source: 'Sincronización',
                    message: 'La copia completa de vehículos ya no cabe en un documento: los equipos que sigan en una versión anterior a 2.9.0 dejaron de recibir cambios de Pruebas — actualízalos' });
                return;
            }
            if (r.level === 'ok' && !bloqueado) return;
            var crit = bloqueado || r.level === 'critico';
            var extra = (r.col === 'cop15' && cap.vehiclesLeft !== null) ? ' — caben ~' + cap.vehiclesLeft + ' vehículos más' : '';
            out.push({ level: crit ? 'CRITICA' : 'ALTA', color: crit ? '#ef4444' : '#f59e0b',
                message: (bloqueado ? 'Ya NO se sube a la nube: ' : 'Nube casi llena: ') + r.label + ' ocupa ' + r.pct + '% de lo que admite un documento' + extra + ' — ver Datos → Sistema',
                source: 'Sincronización' });
        });
    } catch (e) {}
    // [2.7.0] Este equipo juzga con límites distintos a los publicados por el laboratorio.
    try {
        var rc = (syncOn && typeof fbRegCachedShared === 'function') ? fbRegCachedShared() : null;
        if (rc && rc.shared && typeof regSyncState === 'function') {
            var rs = regSyncState(loadRegulations(), rc.shared);
            if (rs.state === 'distinto' || rs.state === 'conflicto' || rs.state === 'cambios-locales') {
                out.push({ level: 'ALTA', color: '#f59e0b', source: 'Regulaciones',
                    message: 'Los límites de este equipo no son los de la versión ' + rc.shared.version + ' del laboratorio (' + rs.diff.length + ' diferencia(s)) — ver Datos → Regulaciones' });
            }
        }
    } catch (e) {}
    // [2.9.0] Vehículos de este equipo que llevan más de una hora sin llegar a la nube.
    try {
        var vs = syncOn && typeof fbVehStatus === 'function' ? fbVehStatus() : null;
        var vAge = vs && vs.lastSync ? Date.now() - new Date(vs.lastSync).getTime() : Infinity;
        if (vs && vs.active && vs.pending && vs.lastError && vAge > 3600000) {
            out.push({ level: 'ALTA', color: '#f59e0b', source: 'Sincronización',
                message: vs.pending + ' vehículo(s) de este equipo no han llegado a la nube (' + vs.lastError + ') — ver Datos → Sistema' });
        }
    } catch (e) {}
    // [2.6.0] Eventos del historial que llevan más de un día sin llegar a la nube.
    try {
        var as = syncOn ? fbAuditStatus() : null;
        if (as && as.enabled && as.pending && as.oldest && (Date.now() - new Date(as.oldest).getTime()) > 86400000) {
            out.push({ level: 'ALTA', color: '#f59e0b', source: 'Historial',
                message: as.pending + ' cambio(s) del historial siguen sin subirse a la nube desde ' + as.oldest.slice(0, 10) +
                    (as.lastError ? ' (' + as.lastError + ')' : '') + ' — ver Datos → Auditoría' });
        }
    } catch (e) {}
    try {
        var bs = fbBackupStatus();
        if (bs && bs.alert) out.push({ level: bs.alert.level, color: bs.alert.level === 'CRITICA' ? '#ef4444' : '#f59e0b',
            message: bs.alert.message, source: 'Respaldo' });
    } catch (e) {}
    return out;
}

// Get current usage stats for UI
function fbQuotaStats() {
    fbQuotaPrune(fbQuota.writes);
    fbQuotaPrune(fbQuota.reads);
    return {
        writesThisHour: fbQuota.writes.length,
        readsThisHour: fbQuota.reads.length,
        writesToday: fbQuota.dayWrites || 0,
        readsToday: fbQuota.dayReads || 0,
        blockedToday: fbQuota.blocked,
        maxWritesHour: FB_QUOTA_LIMITS.maxWritesPerHour,
        maxReadsHour: FB_QUOTA_LIMITS.maxReadsPerHour,
        maxWritesDay: FB_QUOTA_LIMITS.maxWritesPerDay,
        maxReadsDay: FB_QUOTA_LIMITS.maxReadsPerDay
    };
}

// ── [v15.6] Camino conectado tras autenticación (extraído de fbInit) ──
// Corre cuando hay sesión de laboratorio: test de conexión → pull inicial →
// listeners → seed push (condicionado al pull) → chequeo de versión → cola.
function _fbAfterAuthConnected() {
    fbTestConnectionWithRetry(2, function(ok) {
        if (!ok) return;
        fbSync.status = 'connected';
        fbUpdateIndicator();
        if (fbSync.stationId) {
            fbPullAll();
            fbBackupCheck();
            fbStartListening();
            // Semilla: subir los datos locales una vez, SOLO después de que el
            // pull inicial terminó (antes corría a los 6s aunque el pull hubiera
            // fallado, y un dispositivo vacío podía pisar la nube)
            if (!fbSync._seeded) {
                fbSync._seeded = true;
                setTimeout(function() {
                    if (fbSync.enabled && fbSync._pullCompleted) fbPushAll();
                }, 6000);
            }
        }
        fbCheckAppVersion();
        if (fbOfflineQueue.length > 0) setTimeout(fbQueueRetry, 3000);
    });
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
        fbSync.lastError = 'Firebase SDK no cargado. Verifica conexión a internet.';
        fbUpdateIndicator();
        return;
    }

    // If already initialized, just re-test connection instead of full re-init
    if (fbSync._initialized && (fbSync.db || fbSync._useREST)) {
        fbSync.status = 'connecting';
        fbSync.lastError = '';
        fbUpdateIndicator();
        fbEnsureAuth().then(function(hasSession) {
            _fbWatchAuthState();
            if (!hasSession) {
                fbSync.status = 'auth';
                fbUpdateIndicator();
                _fbMaybePromptAuth();
                return;
            }
            fbTestConnectionWithRetry(2, function(ok) {
                if (ok) {
                    fbSync.status = 'connected';
                    fbUpdateIndicator();
                    if (fbSync.stationId) {
                        fbPullAll();
                        fbStartListening();
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
            // [2.9.0] Lo que no se pudo subir sin red sale en cuanto vuelve.
            if (typeof fbVehiclesSyncSoon === 'function') fbVehiclesSyncSoon(3000);
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
            // [2.29.1] ignoreUndefinedProperties: un `undefined` se descarta, igual que al
            // guardar en localStorage (JSON). Sin esto, UN campo undefined en cualquier
            // vehículo hacía que el SDK rechazara el módulo entero (#175).
            var fsSettings = { merge: true, ignoreUndefinedProperties: true };
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

        // Espacio compartido: todos los dispositivos usan el mismo stationId → un solo dataset del lab.
        // La reparación va ANTES de forzarlo, para poder avisar de dónde venía.
        fbRepairStationIfStray();
        fbSync.stationId = FB_SHARED_WORKSPACE;
        try { localStorage.setItem('kia_fb_station', FB_SHARED_WORKSPACE); } catch(e) {}
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
            return fbEnsureAuth();
        }).then(function(hasSession) {
            fbSync._initialized = true;
            _fbWatchAuthState();
            if (hasSession) {
                _fbAfterAuthConnected();
            } else {
                // Sin sesión de laboratorio: la app funciona local; se pide la
                // contraseña de dispositivo (una vez) y el indicador 🔑 la re-ofrece
                fbSync.status = 'auth';
                fbUpdateIndicator();
                _fbMaybePromptAuth();
                fbCheckAppVersion(); // lectura pública, no requiere sesión
            }
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

// ── [v15.6] Sesión de dispositivo (reemplaza al sign-in anónimo) ──
// Ya NO se inicia sesión anónima: las Security Rules la rechazan. Este helper
// solo reporta si el dispositivo tiene sesión persistida (Email/Password).
// Sin sesión, la app sigue funcionando offline y el indicador ofrece conectar.
// ¿La sesión es del usuario de laboratorio (Email/Password)? Las Security Rules
// solo aceptan proveedor 'password'; una sesión anónima vieja NO cuenta.
function _fbIsPasswordUser(u) {
    return !!(u && !u.isAnonymous && (u.providerData || []).some(function(p) { return p && p.providerId === 'password'; }));
}

function fbEnsureAuth() {
    if (!FB_IS_HTTP_ORIGIN) {
        console.log('Firebase: Skipping auth on non-HTTP origin');
        return Promise.resolve(false);
    }
    try {
        var auth = firebase.auth();
        var cur = auth.currentUser;
        if (cur) {
            if (_fbIsPasswordUser(cur)) return Promise.resolve(true);
            // Sesión anónima vieja (build previo): las reglas la rechazan. Cerrarla
            // para que aparezca el login de contraseña en vez de un falso "conectado".
            console.log('Firebase: cerrando sesión anónima heredada — se pedirá la contraseña del laboratorio');
            return auth.signOut().catch(function() {}).then(function() { return false; });
        }
        // Esperar brevemente a que el SDK restaure la sesión persistida (IndexedDB)
        return new Promise(function(resolve) {
            var settled = false;
            var finish = function() {
                if (settled) return; settled = true;
                try { unsub(); } catch(e) {}
                var u = auth.currentUser;
                if (u && !_fbIsPasswordUser(u)) {
                    auth.signOut().catch(function() {}).then(function() { resolve(false); });
                } else {
                    resolve(_fbIsPasswordUser(u));
                }
            };
            var unsub = auth.onAuthStateChanged(function() { finish(); });
            setTimeout(finish, 4000);
        });
    } catch(e) {
        console.warn('Firebase: Auth not available:', e.message);
        return Promise.resolve(false);
    }
}

// Sin sesión de laboratorio: mostrar el prompt de contraseña (una vez por carga)
function _fbMaybePromptAuth() {
    if (fbSync._authPrompted) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    fbSync._authPrompted = true;
    setTimeout(function() {
        if (fbSync.status === 'auth' && typeof fbShowAuthPrompt === 'function') fbShowAuthPrompt();
    }, 600);
}

// Vigila la sesión: cuando el dispositivo inicia sesión (tras el prompt de
// contraseña), continúa automáticamente con el camino conectado.
function _fbWatchAuthState() {
    if (fbSync._authWatchActive) return;
    try {
        fbSync._authWatchActive = true;
        firebase.auth().onAuthStateChanged(function(user) {
            if (user && fbSync.status === 'auth') {
                console.log('Firebase: sesión de laboratorio iniciada — conectando');
                _fbAfterAuthConnected();
            }
        });
    } catch(e) { fbSync._authWatchActive = false; }
}

// Prompt de contraseña del laboratorio (una vez por dispositivo)
function fbShowAuthPrompt() {
    var modal = document.getElementById('fbModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fbModal';
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;overflow-y:auto;';
        document.body.appendChild(modal);
    }
    modal.style.display = 'block';
    modal.innerHTML =
        '<div style="max-width:380px;margin:60px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);position:relative;color:#e2e8f0;">' +
        '<button onclick="document.getElementById(\'fbModal\').style.display=\'none\'" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">✕</button>' +
        '<h3 style="margin:0 0 6px;color:#22d3ee;">🔑 Conectar con el laboratorio</h3>' +
        '<div style="font-size: var(--fs-sm);color:var(--muted);margin-bottom: var(--space-lg);">Ingresa la contraseña del laboratorio para sincronizar este dispositivo. Solo se pide una vez.</div>' +
        '<input type="password" id="fb-lab-password" autocomplete="current-password" placeholder="Contraseña del laboratorio" ' +
        'style="width:100%;padding: var(--space-md);background:#1e293b;border:1px solid #334155;border-radius: var(--radius-xl);color:#e2e8f0;font-size:14px;box-sizing:border-box;" ' +
        'onkeydown="if(event.key===\'Enter\')fbSubmitLabPassword();">' +
        '<div id="fb-lab-password-error" style="color:#ef4444;font-size: var(--fs-sm);min-height:16px;margin:8px 0;"></div>' +
        '<button onclick="fbSubmitLabPassword()" style="width:100%;padding: var(--space-md);background:#22d3ee;color:#000;border:none;border-radius: var(--radius-xl);cursor:pointer;font-weight:700;font-size:13px;">Conectar</button>' +
        '</div>';
    setTimeout(function() { var i = document.getElementById('fb-lab-password'); if (i) i.focus(); }, 100);
}

// Cerrar la sesión de dispositivo y volver a pedir la contraseña del laboratorio
function fbSwitchDeviceAccount() {
    var go = function() {
        fbSync.status = 'auth';
        fbSync._authPrompted = false;
        fbUpdateIndicator();
        fbShowAuthPrompt();
    };
    try {
        firebase.auth().signOut().catch(function() {}).then(go);
    } catch(e) { go(); }
}

function fbSubmitLabPassword() {
    var input = document.getElementById('fb-lab-password');
    var errEl = document.getElementById('fb-lab-password-error');
    var pw = input ? input.value : '';
    if (!pw) { if (errEl) errEl.textContent = 'Escribe la contraseña.'; return; }
    if (errEl) errEl.textContent = 'Conectando…';
    firebase.auth().signInWithEmailAndPassword(FB_LAB_EMAIL, pw).then(function() {
        var modal = document.getElementById('fbModal');
        if (modal) modal.style.display = 'none';
        showToast('✓ Dispositivo conectado al laboratorio', 'success');
        // onAuthStateChanged (_fbWatchAuthState) continúa con pull/listeners
    }).catch(function(err) {
        var msgs = {
            'auth/wrong-password': 'Contraseña incorrecta.',
            'auth/invalid-credential': 'Contraseña incorrecta.',
            'auth/user-not-found': 'El usuario del laboratorio no existe — crear en la consola (ver README, sección Seguridad).',
            'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
            'auth/network-request-failed': 'Sin conexión. Verifica la red e intenta de nuevo.',
            'auth/operation-not-allowed': 'Email/Password no está habilitado en la consola de Firebase (ver README).'
        };
        if (errEl) errEl.textContent = msgs[err.code] || ('Error: ' + (err.message || err.code));
    });
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
            fbSync.lastError = 'Error de conexión (' + (err.code || '?') + '): ' + (err.message || 'desconocido');
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

// [v15.6] Token de la sesión de laboratorio para el camino REST — con las
// Security Rules cerradas, las llamadas REST sin Authorization reciben 403.
function _fbIdTokenPromise() {
    try {
        var u = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
        if (!u) return Promise.resolve(null);
        return u.getIdToken().catch(function() { return null; });
    } catch(e) { return Promise.resolve(null); }
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

    _fbIdTokenPromise().then(function(tok) {
    var headers = { 'Content-Type': 'application/json' };
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    fetch(url, {
        method: 'PATCH',
        headers: headers,
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
    }); // _fbIdTokenPromise
}

// ── REST API Pull (fallback when SDK transport is broken) ──
function fbPullREST(collection, onDone) {
    if (typeof fetch === 'undefined') { if (onDone) onDone(null); return; }

    var url = fbRESTUrl(collection, 'current');

    _fbIdTokenPromise().then(function(tok) {
    var headers = tok ? { 'Authorization': 'Bearer ' + tok } : {};
    fetch(url, { headers: headers }).then(function(resp) {
        if (resp.ok) {
            return resp.json().then(function(doc) {
                fbQuotaRecord('read');
                if (doc && doc.fields && doc.fields.data) {
                    var data = fbFromFirestoreValue(doc.fields.data);
                    if (doc.fields.writer) _fbWriterSeen(fbFromFirestoreValue(doc.fields.writer), 'mod', doc.updateTime || '');
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
    }); // _fbIdTokenPromise
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
    showToast('Probando conexión...', 'info');

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

/**
 * Devuelve el dispositivo al espacio compartido. Se llama sola al arrancar
 * (`fbRepairStationIfStray`) y desde el botón "Reparar" de los ajustes de sync.
 */
function fbResetStation() {
    var was = fbSync.stationId || localStorage.getItem('kia_fb_station') || '';
    fbSync.stationId = FB_SHARED_WORKSPACE;
    try { localStorage.setItem('kia_fb_station', FB_SHARED_WORKSPACE); } catch(e) {}
    fbUpdateIndicator();
    if (typeof auditLog === 'function' && was && was !== FB_SHARED_WORKSPACE) {
        auditLog('sistema', 'workspace_reparado', { type: 'sistema', id: 'kia_fb_station', label: 'Espacio de trabajo' },
            'Este dispositivo estaba en "' + was + '"; se devolvió a ' + FB_SHARED_WORKSPACE);
    }
    showToast('✅ Dispositivo devuelto al espacio compartido (' + FB_SHARED_WORKSPACE + ')', 'success');
    if (fbSync.enabled) { fbUpdateStationMeta(); fbPullAll(true); }
    var modal = document.getElementById('fbModal');
    if (modal && modal.style.display === 'block') fbShowSettings();
}

/**
 * Autorreparación al arrancar: un dispositivo que quedó apuntando a otra ruta
 * (por el campo libre que existía antes) no ve los datos del laboratorio NI el
 * token de reportes, y no hay nada en pantalla que lo explique.
 * @returns {string} el espacio anterior si hubo que repararlo, '' si estaba bien
 */
function fbRepairStationIfStray() {
    var saved = '';
    try { saved = localStorage.getItem('kia_fb_station') || ''; } catch(e) { return ''; }
    if (!saved || saved === FB_SHARED_WORKSPACE) return '';
    try { localStorage.setItem('kia_fb_station', FB_SHARED_WORKSPACE); } catch(e) {}
    fbSync.stationId = FB_SHARED_WORKSPACE;
    if (typeof auditLog === 'function') {
        auditLog('sistema', 'workspace_reparado', { type: 'sistema', id: 'kia_fb_station', label: 'Espacio de trabajo' },
            'Al arrancar estaba en "' + saved + '"; se devolvió a ' + FB_SHARED_WORKSPACE);
    }
    setTimeout(function() {
        if (typeof showToast === 'function') {
            showToast('Este dispositivo estaba fuera del espacio compartido ("' + saved + '") y se reconectó al del laboratorio.', 'warning');
        }
    }, 3000);
    return saved;
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
            // [v23.2] Faltaba el `Authorization` — 403 silencioso (`.catch` sólo hacía
            // console.warn), así que en modo REST el nombre del dispositivo y el
            // `lastPush` no se actualizaban nunca y el selector de estaciones mostraba
            // metadatos en blanco o viejos.
            _fbIdTokenPromise().then(function(tok) {
            var _h = { 'Content-Type': 'application/json' };
            if (tok) _h['Authorization'] = 'Bearer ' + tok;
            return fetch(url, {
                method: 'PATCH',
                headers: _h,
                body: JSON.stringify({ fields: {
                    stationId: { stringValue: meta.stationId },
                    deviceName: { stringValue: meta.deviceName },
                    lastPush: { stringValue: meta.lastPush },
                    userAgent: { stringValue: meta.userAgent }
                }})
            });
            }).catch(function(e) { console.warn('Station meta REST error:', e); });
        } else if (fbSync.db) {
            fbSync.db.collection('stations').doc(fbSync.stationId).set(meta, { merge: true })
                .catch(function(e) { console.warn('Station meta write error:', e); });
        }
    }, 3000);
}

// ── Push data to Firestore (rate-limited, with REST fallback) ──
function fbPush(collection, data, onDone, opts) {
    if (!fbSync.enabled) { if (onDone) onDone(false, 'Firebase no habilitado'); return; }
    if (!fbSync.stationId) { if (onDone) onDone(false, 'No hay ID de estación configurado'); return; }
    // [2.35.0] Equipo atrasado: no sube hasta que alguien revise lo que trae.
    if (typeof fbReviewHolds === 'function' && fbReviewHolds(collection)) {
        fbSync.review.deferred[collection] = true;
        if (onDone) onDone(false, 'En revisión: este equipo llegó atrasado; revisa lo que trae antes de subirlo');
        return;
    }

    // [v15.6] Cinturón anti-vaciado: nunca subir un módulo núcleo vacío
    // (segunda línea de defensa; fbPushAll ya filtra, esto cubre los hooks de save)
    if ((collection === 'cop15' || collection === 'testplan' || collection === 'inventory')
        && typeof _fbPushDataScore === 'function' && _fbPushDataScore(collection) === 0) {
        console.warn('fbPush: omitido ' + collection + ' vacío (protección de datos)');
        if (onDone) onDone(false, 'Módulo vacío omitido');
        return;
    }

    // Rate limit check
    var quota = fbQuotaCheck('write');
    if (!quota.allowed) {
        console.warn('Firebase rate limit: ' + quota.reason);
        fbQueueAdd(collection, data);
        if (onDone) onDone(false, quota.reason);
        return;
    }

    // Payload size check
    var sizeCheck = fbQuotaCheckSize(data, collection);
    if (!sizeCheck.allowed) {
        console.warn('Firebase size limit: ' + sizeCheck.reason);
        // [2.3.0] Se registra para Datos → Sistema y Alertas, y el aviso sale a lo más
        // cada 10 min por módulo: antes salía en CADA guardado y se volvía ruido.
        fbSync.sizeBlocked = fbSync.sizeBlocked || {};
        var _prevBlk = fbSync.sizeBlocked[collection];
        fbSync.sizeBlocked[collection] = { bytes: sizeCheck.bytes, at: Date.now() };
        // [2.9.0] Pruebas ya viaja vehículo por vehículo: que la copia completa no quepa
        // solo afecta a los equipos sin actualizar, y eso lo dice la alerta, no un toast.
        var _vehOk = collection === 'cop15' && typeof fbVehActive === 'function' && fbVehActive() && fbSync.vehPulled;
        if (!_vehOk && (!_prevBlk || Date.now() - _prevBlk.at > 600000)) showToast(sizeCheck.reason, 'error', 12000);
        if (onDone) onDone(false, sizeCheck.reason);
        return;
    }
    if (fbSync.sizeBlocked && fbSync.sizeBlocked[collection]) delete fbSync.sizeBlocked[collection];

    if (fbSync.debounceTimers[collection]) clearTimeout(fbSync.debounceTimers[collection]);

    // opts.immediate flushes without the usual 2s debounce (e.g. after CSV import so the upload
    // isn't lost if the user closes the tab right after).
    var _fbPushDelay = (opts && opts.immediate) ? 0 : 2000;

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

        // [2.29.1] El SDK valida los datos y LANZA de forma síncrona (campo vacío,
        // valor no soportado). Dentro de este setTimeout eso era un "Uncaught" con
        // aviso de Reportar (#175). Se trata como cualquier otro fallo de subida, pero
        // sin encolar: el mismo dato volvería a fallar en cada reintento.
        var _setP;
        try {
            _setP = docRef.set({
                data: data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                station: fbSync.stationId,
                writer: FB_DEVICE_ID
            });
        } catch (setErr) {
            console.error('Firebase push rechazado (' + collection + '):', setErr);
            fbSync.status = 'error';
            fbSync.lastError = 'No se pudo subir ' + collection + ': dato no válido para la nube (' + String(setErr && setErr.message || setErr).slice(0, 160) + ')';
            fbUpdateIndicator();
            if (typeof _bugRecordError === 'function') _bugRecordError('fbPush', 'No se pudo subir ' + collection + ': ' + String(setErr && setErr.message || setErr), 'firebase-sync.js', 0, 0, setErr && setErr.stack);
            if (onDone) onDone(false, fbSync.lastError);
            return;
        }
        _setP.then(function() {
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
    }, _fbPushDelay);
}

// ── Push all modules ──
function fbPushAll(showFeedback) {
    if (!fbSync.enabled) { if (showFeedback) showToast('Firebase no esta habilitado', 'error'); return; }
    if (!fbSync.stationId) { if (showFeedback) showToast('Primero configura un ID de estación', 'error'); return; }

    // [v15.6] Guard anti-vaciado: un módulo local VACÍO nunca se sube — si el
    // pull inicial falló, empujar {vehicles:[]} sobrescribiría los datos del
    // laboratorio en stations/KIA-EMLAB/*/current para todos.
    var modules = [];
    var skippedEmpty = [];
    if (fbSyncModules.cop15) { if (_fbPushDataScore('cop15') > 0) modules.push({col:'cop15', data:db}); else skippedEmpty.push('cop15'); }
    if (fbSyncModules.testplan) { if (_fbPushDataScore('testplan') > 0) modules.push({col:'testplan', data:tpState}); else skippedEmpty.push('testplan'); }
    if (fbSyncModules.inventory) { if (_fbPushDataScore('inventory') > 0) modules.push({col:'inventory', data:invState}); else skippedEmpty.push('inventory'); }
    if (fbSyncModules.panel) {
        var _pnHasData = (typeof pnState !== 'undefined' && pnState && (pnState.operators || []).length > 0);
        if (_pnHasData) modules.push({col:'panel', data:pnState}); else skippedEmpty.push('panel');
    }
    if (skippedEmpty.length && showFeedback) {
        showToast('Módulos vacíos omitidos del envío (protección de datos): ' + skippedEmpty.join(', '), 'info');
    }
    if (fbSyncModules.cop) {
        var copRaw = null; try { copRaw = JSON.parse(localStorage.getItem('kia_cop_v1')); } catch(e) {}
        if (copRaw && typeof copCleanFamilies === 'function') copCleanFamilies(copRaw.families);
        if (copRaw) modules.push({col:'cop', data: copRaw});
    }
    if (fbSyncModules.homolog) {
        var homoRaw = null; try { homoRaw = JSON.parse(localStorage.getItem('kia_homolog_v1')); } catch(e) {}
        if (homoRaw && (homoRaw.catalog || []).length) modules.push({col:'homolog', data: homoRaw});
    }
    if (fbSyncModules.audit && typeof auditGetTrail === 'function') {
        var auditArr = auditGetTrail();
        if (auditArr && auditArr.length) modules.push({col:'audit', data: auditArr});
    }
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

// [v15.6.1] Refrescar la UI del Test Plan tras aplicar tpState desde el sync.
// tpRender() por sí solo NO re-pinta una sub-pestaña ya cacheada (tab cache), así
// que el dashboard podía quedar mostrando "No hay plan" aunque el plan sí llegó.
// Se invalida el tab cache, se bumpea _lastSave (invalida memos y la tira de HOY)
// y se refrescan familias/badges.
/** [2.33.0] ¿`incoming` trae marcas de planes borrados que `known` no tiene? PURA. */
function _fbPlanTombsNewTo(known, incoming) {
    var k = {};
    (known || []).forEach(function(t) { if (t && t.planId) k[t.planId] = true; });
    return (incoming || []).some(function(t) { return t && t.planId && !k[t.planId]; });
}

function _fbTpUISync() {
    try {
        if (typeof tpState !== 'undefined' && tpState) tpState._lastSave = Date.now();
        // v20: rellenar las claves que el remoto pudo no traer, ANTES de repintar. Un pull
        // desde un dispositivo con código viejo dejaba tpState.weights/rules en undefined y
        // la cadena tpGetAnalysis → tpCoverageSummary → tpUpdateBadges → switchPlatform
        // tumbaba la pestaña Plan entera. El seed de _fbPullSeed pasa por aquí.
        if (typeof _tpEnsureState === 'function') _tpEnsureState();
        // v16.2: los merges/seeds de sync escriben tpState directo a localStorage sin pasar
        // por tpSave() — invalidar aquí también, o el análisis (REQ/déficit/cobertura) queda
        // obsoleto tras un pull remoto de reglas o volúmenes.
        if (typeof tpInvalidateCache === 'function') tpInvalidateCache();
        if (typeof tabCacheInvalidate === 'function') tabCacheInvalidate('tp');
        if (typeof tpRender === 'function') tpRender();
        if (typeof tpRefreshFamilies === 'function') tpRefreshFamilies();
        if (typeof tpUpdateBadges === 'function') tpUpdateBadges();
        if (typeof _labOverviewGen !== 'undefined') _labOverviewGen++; // refresca HOY
    } catch(e) { /* best-effort */ }
}

// ── [v15.6] ¿Este dispositivo está vacío? (sin datos de los módulos núcleo) ──
// Gobierna la excepción de seed del pull, los reintentos y el guard del push.
function _fbLocalIsEmpty() {
    // v23.2: dato REAL, no configuración — si no, un equipo recién configurado dejaría
    // de pedir el seed inicial y se quedaría sin los datos del laboratorio.
    return (_fbPushDataScore('cop15') + _fbPushDataScore('testplan') + _fbPushDataScore('inventory')) === 0;
}

// Reintentos del pull inicial en un dispositivo vacío: antes fallaba en
// silencio (quota/red) y el técnico veía "Sync conectado" con 0 registros.
var _fbSeedRetryDelays = [5000, 15000, 45000, 90000];
function _fbScheduleSeedRetry(reason) {
    if (!_fbLocalIsEmpty()) return;
    var n = fbSync._seedRetries || 0;
    if (n >= _fbSeedRetryDelays.length) {
        if (typeof showToast === 'function') {
            showToast('⚠️ No se pudieron descargar los datos del laboratorio. Toca el indicador de Sync para reintentar.', 'error');
        }
        return;
    }
    fbSync._seedRetries = n + 1;
    if (typeof showToast === 'function' && n === 0) {
        showToast('Descargando datos del laboratorio… reintentando (' + (reason || 'sin conexión') + ')', 'warning');
    }
    setTimeout(function() { if (_fbLocalIsEmpty()) fbPullAll(); }, _fbSeedRetryDelays[n]);
}

// ── Pull data from Firestore (rate-limited, with REST fallback) ──
function fbPullAll(showFeedback) {
    if (!fbSync.enabled) { if (showFeedback) showToast('Firebase no esta habilitado', 'error'); return; }
    if (!fbSync.stationId) { if (showFeedback) showToast('Primero configura un ID de estación', 'error'); return; }

    // Rate limit check (una lectura por colección). EXCEPCIÓN de seed: un
    // dispositivo vacío siempre puede intentar su primera descarga — antes el
    // check retornaba sin feedback y el dispositivo quedaba en 0 para siempre.
    var seedMode = _fbLocalIsEmpty();
    if (!seedMode) {
        var quota = fbQuotaCheck('read');
        if (!quota.allowed) {
            if (showFeedback) showToast(quota.reason, 'error');
            return;
        }
    }

    fbSync.status = 'syncing';
    fbUpdateIndicator();

    var collections = ['cop15', 'testplan', 'inventory', 'panel', 'cop', 'homolog', 'audit'].filter(function(c) { return fbSyncModules[c]; });
    if (collections.length === 0) { if (showFeedback) showToast('No hay modulos seleccionados para sync', 'info'); return; }

    // Use REST API if SDK transport is broken
    if (fbSync._useREST) {
        var restPending = collections.length;
        var restResults = {};
        var restAnyData = false;
        collections.forEach(function(col) {
            fbPullREST(col, function(data) {
                restResults[col] = data;
                if (data) restAnyData = true;
                restPending--;
                if (restPending === 0) {
                    fbPullApply(collections, restResults, showFeedback);
                    if (!restAnyData) _fbScheduleSeedRetry('REST sin datos');
                }
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
            if (snap && snap.exists && snap.data().writer) _fbWriterSeen(snap.data().writer, 'mod', _fbTsIso(snap.data().updatedAt));
        });
        fbPullApply(collections, results, showFeedback);
    }).catch(function(err) {
        console.error('Firebase pull error:', err);
        fbSync.status = 'error';
        fbSync.lastError = err.code === 'permission-denied' ? 'Acceso denegado. Revisa las Security Rules.' : 'Error al descargar: ' + (err.message || err.code);
        fbUpdateIndicator();
        if (showFeedback) showToast(fbSync.lastError, 'error');
        _fbScheduleSeedRetry(err.code || 'error de red');
    });
}

// ── Apply pulled data to local state ──
// v15.5: cop15/testplan/inventory se aplican con merge por elemento
// (reutiliza fbMergeAnalyze/fbMergeExecute, igual que el live-sync) en lugar del
// reemplazo por conteo: dos altas concurrentes o una edición sin cambio de conteo
// ya no se pierden. Si el análisis falla, cae a la heurística previa por conteo.

/**
 * [v23.2] `_fbPushDataScore(col)` responde "¿es SEGURO subir esto?" y es
 * DELIBERADAMENTE ESTRICTA: cuenta sólo DATO REAL del laboratorio.
 *
 * Hay dos preguntas distintas y NO se pueden servir con el mismo número:
 *   · PULL — "¿vale la pena preservar lo local?" → `_fbPullLocalScore`, que desde
 *     v23.2 cuenta también la CONFIGURACIÓN, porque un equipo ya configurado que
 *     todavía no importa el CSV no es un equipo desechable.
 *   · PUSH — "¿es seguro subir esto?" → esta función. `fbPush` escribe el
 *     documento ENTERO en `stations/KIA-EMLAB/{col}/current`, así que subir un
 *     `tpState` con `planData` vacío REEMPLAZA el plan de todo el laboratorio.
 *
 * Contar la configuración aquí abriría exactamente el agujero que el cinturón
 * anti-vaciado de v15.6 vino a tapar. Mantiene la semántica que ese guard tenía
 * antes de v23.2, a propósito.
 */
function _fbPushDataScore(col) {
    if (col === 'cop15') return (typeof db !== 'undefined' && db.vehicles) ? db.vehicles.length : 0;
    if (col === 'testplan') {
        var t = (typeof tpState !== 'undefined' && tpState) ? tpState : null;
        if (!t) return 0;
        return (t.planData || []).length + (t.testedList || []).length + (t.weeklyPlans || []).length;
    }
    if (col === 'inventory') {
        var s = 0, st = (typeof invState !== 'undefined') ? invState : null;
        if (!st) return 0;
        if (st.gases) st.gases.forEach(function(g) { s += 1 + ((g.readings && g.readings.length) || 0); });
        if (st.equipment) s += st.equipment.length;
        if (st.assets) s += st.assets.length;
        if (st.maintActivities) s += st.maintActivities.length;
        if (st.maintLog) s += st.maintLog.length;
        if (st.fuelTanks) st.fuelTanks.forEach(function(t) { s += 1 + ((t.readings && t.readings.length) || 0); });
        return s;
    }
    return 0;
}

function _fbPullLocalScore(col) {
    var _n = function (x) { return (x && x.length) || 0; };
    var _keys = function (o) { return (o && typeof o === 'object') ? Object.keys(o).length : 0; };

    if (col === 'cop15') return (typeof db !== 'undefined' && db.vehicles) ? db.vehicles.length : 0;

    if (col === 'testplan') {
        var t = (typeof tpState !== 'undefined' && tpState) ? tpState : null;
        if (!t) return 0;
        // v23.2: antes sólo contaba planData+testedList+weeklyPlans, así que TODA la
        // configuración y el historial podían estar llenos y este dispositivo puntuaba
        // CERO — con lo que `_fbPullSeed` lo reemplazaba entero. Un equipo ya
        // configurado que aún no importa el CSV de producción es justo ese caso.
        return _n(t.planData) + _n(t.testedList) + _n(t.weeklyPlans) +
               _n(t.weekHistory) + _n(t.planHistory) + _n(t.rulePresets) +
               _keys(t.familyOverrides) + _keys(t.configOverrides) + _keys(t.myContinuity) +
               _keys(t.weekAvailability) + _keys(t.soak && t.soak.byFamily);
    }

    if (col === 'inventory') {
        var s = 0, st = (typeof invState !== 'undefined') ? invState : null;
        if (!st) return 0;
        if (st.gases) st.gases.forEach(function(g) { s += 1 + _n(g.readings); });
        // v23.2: el historial de calibración cuenta. Un dispositivo que registró 40
        // calibraciones pero no dio de alta ningún instrumento puntuaba igual que uno
        // que no hizo nada.
        if (st.equipment) st.equipment.forEach(function(e) { s += 1 + _n(e.calHistory); });
        s += _n(st.assets) + _n(st.maintActivities) + _n(st.maintLog);
        // v21.1: el combustible NO se contaba. Un dispositivo cuyo único dato nuevo eran
        // lecturas de gasolina puntuaba como vacío y _fbPullSeed lo reemplazaba entero.
        if (st.fuelTanks) st.fuelTanks.forEach(function(t) { s += 1 + _n(t.readings); });
        // v23.2: el consumo por prueba y los catálogos editables tampoco se contaban.
        s += _n(st.usageLog) + _n(st.zones) + _n(st.gasTypes);
        return s;
    }

    // v23.2: `panel`, `cop`, `homolog` y `audit` devolvían 0 A SECAS. Un dispositivo con
    // todo el padrón de operadores, todos los juicios CoP y el catálogo de homologación
    // —pero sin vehículos, plan ni inventario— se clasificaba como "vacío" y la
    // maquinaria de seed lo trataba como desechable.
    if (col === 'panel') {
        var pn = (typeof pnState !== 'undefined' && pnState) ? pnState : null;
        if (!pn) return 0;
        return _n(pn.operators) + _n(pn.projects) + _n(pn.tasks) +
               _n(pn.shiftLog) + _n(pn.shiftReports) + _n(pn.skillCatalog);
    }
    if (col === 'cop') {
        var cp = (typeof copState !== 'undefined' && copState) ? copState : null;
        if (!cp) return 0;
        return _n(cp.saved) + _keys(cp.families);
    }
    if (col === 'homolog') {
        var ho = (typeof homoState !== 'undefined' && homoState) ? homoState : null;
        if (!ho) return 0;
        return _n(ho.catalog) + _n(ho.ipFamilies) + _keys(ho.links);
    }
    if (col === 'audit') {
        try { return _n(JSON.parse(localStorage.getItem('kia_audit_trail') || '[]')); } catch (e) { return 0; }
    }
    return 0;
}

// Local vacío → adoptar el remoto completo (seed inicial del dispositivo)
function _fbPullSeed(col, remoteData, pulled) {
    if (col === 'cop15') {
        // [v24.2] Las marcas de borrado locales sobreviven al reemplazo (si no, lo
        // borrado aquí vuelve con la copia remota).
        var _seedTombs = (db && db.deletedVehicles) || [];
        // [2.0.0] Igual con las configs manuales (y sus marcas de borrado).
        var _seedManual = (db && db.manualConfigs) || [];
        db = remoteData;
        if (_seedTombs.length && typeof vehicleTombstonesUnion === 'function')
            db.deletedVehicles = vehicleTombstonesUnion(_seedTombs, db.deletedVehicles);
        if (_seedManual.length && typeof manualConfigsUnion === 'function')
            db.manualConfigs = manualConfigsUnion(_seedManual, db.manualConfigs);
        // [v17.12] Un remoto puede traer un vehículo cuyo id ya usa uno local (los ids
        // viejos eran un contador por dispositivo): reparar ANTES de guardar y refrescar.
        if (typeof dedupeVehicleIds === 'function') dedupeVehicleIds();
        localStorage.setItem('kia_db_v11', JSON.stringify(db));
        refreshAllLists();
        pulled.push('COP15 (' + (db.vehicles || []).length + ' vehiculos)');
    } else if (col === 'testplan') {
        var prevTp = (typeof tpState !== 'undefined' && tpState) ? tpState : {};
        tpState = remoteData;
        // Preservar subcampos v15 locales que un remoto de código viejo no trae
        // (v16.4 suma la capacidad real y el backlog: sin esto, sincronizar contra una copia
        // en la nube escrita por una versión anterior borraba en silencio los vehículos por
        // par configurados y las configuraciones ya descartadas de la cola).
        // v18 suma plannerCfg (cuota/caducidad de la cola + filtros de la semana): sin
        // esto, sincronizar contra una copia escrita por código anterior borraba la
        // configuración del planificador en silencio. (v23: `autoPlanLastRun` salió de
        // la lista junto con el auto-plan que guardaba.)
        // v20 suma `soak` (horas de reposo por familia/norma, de donde sale el hueco
        // preacon→prueba) y `_migr` (guardas de migración de una sola vez). Si no se
        // preservan, un pull desde código anterior los deja undefined: el laboratorio
        // pierde su tabla de soak, y la guarda perdida hace que la migración VUELVA a
        // correr. Es la misma trampa que documentó plannerCfg en v18.
        // v23.1 suma `reqPurposes` (qué propósitos acreditan el REQ de emisiones): un
        // pull desde código anterior no lo trae y sin preservarlo el laboratorio
        // volvería a contar las pruebas de OBD2 en la cobertura, en silencio.
        // v23.2 suma la CONFIGURACIÓN y el HISTORIAL del laboratorio, que faltaban
        // enteros. Esto no era un `undefined` benigno: `_fbTpUISync()` llama a
        // `_tpEnsureState()` justo después, que RESIEMBRA `rules` con
        // `tpDefaultRules()` y `weights`/`regionPriority` con los literales del
        // código. O sea que un pull no los dejaba vacíos — los dejaba en VALORES DE
        // FÁBRICA, sin error y sin aviso, y las reglas de ratio son justo lo que
        // determina el REQ y la cobertura de todo el laboratorio.
        // Se dispara cuando `_fbPullLocalScore('testplan') === 0`, y ese score sólo
        // cuenta planData+testedList+weeklyPlans: un equipo ya configurado que
        // todavía no importó el CSV de producción puntúa CERO. Es una secuencia de
        // puesta en marcha perfectamente normal.
        ['months', 'priorityRules', 'weekAvailability', 'maxTiers', 'recoveryUntil', 'recoveryHorizonWeeks',
         'vehiclesPerSlot', 'agingBoost', 'carryoverDismissed', 'plannerCfg', 'capacity',
         'soak', '_migr', 'reqPurposes',
         'rules', 'weights', 'regionPriority', 'rulePresets',
         'familyOverrides', 'configOverrides', 'startPurposeByRegion', 'myContinuity',
         'weekHistory', 'planHistory', 'weeks', 'fixedPlan', 'fixedWeeklyPlan', 'deadline'].forEach(function(k) {
            if ((tpState[k] === undefined || tpState[k] === null) && prevTp[k] !== undefined) tpState[k] = prevTp[k];
        });
        // [2.33.0] Las marcas de planes borrados de los dos lados.
        if (typeof tpPlanTombstonesUnion === 'function') tpState.deletedPlans = tpPlanTombstonesUnion(prevTp.deletedPlans, tpState.deletedPlans);
        // [2.36.0] Las familias fuera del conteo, de los dos lados (gana la marca más reciente).
        if (typeof tpReqFamiliesUnion === 'function') tpState.reqFamilies = tpReqFamiliesUnion(prevTp.reqFamilies, tpState.reqFamilies);
        localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState));
        _fbTpUISync();
        pulled.push('Test Plan');
    } else if (col === 'inventory') {
        // v21.1: se preservan los subcampos locales que un remoto de código viejo no trae
        // — mismo criterio que testplan arriba. `fuelTanks` es el caso grave: no viajaba
        // por la nube, así que un pull de un equipo sin combustible borraba el de éste.
        var prevInv = (typeof invState !== 'undefined' && invState) ? invState : {};
        invState = remoteData;
        // v23.2 suma `usageLog` (hasta 3.000 registros de consumo por prueba: es lo
        // que alimenta el modelo de consumo aprendido y el conteo por VIN de COP15),
        // `zones` y `gasTypes` (catálogos editables del cuarto de gases) y
        // `lastReadingDate`. Ninguno viajaba, con la misma forma exacta del defecto de
        // `fuelTanks` que se arregló en v21.1.
        ['fuelTanks', 'assets', 'maintActivities', 'maintLog', 'consumption', 'f11Seed',
         'usageLog', 'zones', 'gasTypes', 'lastReadingDate'].forEach(function(k) {
            if ((invState[k] === undefined || invState[k] === null ||
                 (Array.isArray(invState[k]) && !invState[k].length)) && prevInv[k] !== undefined) {
                invState[k] = prevInv[k];
            }
        });
        if (typeof _invRevInit === 'function') _invRevInit();
        localStorage.setItem('kia_lab_inventory', JSON.stringify(invState));
        if (typeof invRender === 'function') invRender();
        pulled.push('Inventory');
    }
}

// opts.noPushBack [2.9.0]: el remoto es PARCIAL (solo los vehículos que cambiaron), así
// que "aquí hay algo que el remoto no tiene" es siempre cierto y no dice nada.
function _fbPullMergeModule(col, remoteData, pulled, opts) {
    if (_fbPullLocalScore(col) === 0) { _fbPullSeed(col, remoteData, pulled); return; }

    var synth = { cop15: null, testplan: null, inventory: null };
    synth[col] = remoteData;
    var analysis = fbMergeAnalyze(synth);
    var a = analysis[col];
    if (!a) return;

    var hasWork = false;
    if (col === 'cop15') hasWork = (a.newItems || []).length > 0 || (a.conflicts || []).length > 0 ||
        _fbTombsNewTo((db && db.deletedVehicles) || [], (remoteData && remoteData.deletedVehicles) || []) ||
        // 2.0.0: sin esto, un pull cuyo único cambio es una config manual se descartaba.
        (typeof manualConfigsNewTo === 'function' && manualConfigsNewTo((db && db.manualConfigs) || [], (remoteData && remoteData.manualConfigs) || []));
    else if (col === 'testplan') hasWork = (a.newItems || []).length > 0 || a.planDataDiff || a.weeklyPlansDiff || a.rulesChanged ||
        // [2.33.0] Un pull cuyo único cambio es un plan borrado en otro equipo.
        _fbPlanTombsNewTo((typeof tpState !== 'undefined' && tpState && tpState.deletedPlans) || [], (remoteData && remoteData.deletedPlans) || []) ||
        // [2.36.0] Un pull cuyo único cambio es sacar/regresar una familia del conteo.
        (typeof tpReqFamiliesNewTo === 'function' && tpReqFamiliesNewTo((typeof tpState !== 'undefined' && tpState && tpState.reqFamilies) || {}, (remoteData && remoteData.reqFamilies) || {}));
    else if (col === 'inventory') hasWork = (a.newGases || []).length > 0 || (a.newEquip || []).length > 0 || (a.gasConflicts || []).length > 0 ||
        (a.equipConflicts || []).length > 0 || (a.newAssets || []).length > 0 || (a.assetUpdates || []).length > 0 ||
        (a.newMaintActivities || []).length > 0 || (a.maintActivityUpdates || []).length > 0 || (a.newMaintLog || []).length > 0 ||
        // v21.1: sin esto, un pull cuyo único cambio es el combustible se descartaba.
        (a.newFuelTanks || []).length > 0 || (a.fuelUpdates || []).length > 0;
    if (!hasWork) return;

    // merge_all: agrega lo nuevo y resuelve diferencias con la política existente
    // (cop15: gana el timeline más rico + recibos PA preservados; inventory: la
    // lectura remota propaga PSI/estado).
    var choices = {};
    choices[col] = 'merge_all';
    // [v23.5] Sin toast ni fbPushAll: solo se re-empuja ESTE módulo y solo si aquí hay
    // algo que la nube no tiene (mismo criterio que el live-sync). La bitácora sí se
    // conserva: el pull es poco frecuente y su "deshacer" es la red de seguridad.
    // [2.9.0] opts.noHistory: el ciclo por vehículo corre en cada guardado; una foto
    // completa de db+tpState+invState por ciclo es justo lo que llenó el almacenamiento en v18.1.
    fbMergeExecute(synth, analysis, choices, { quiet: true, noPush: true, noHistory: !!(opts && opts.noHistory) });
    if (col === 'cop15' && typeof cascadeOnRemoteVehicleChange === 'function') {
        try { cascadeOnRemoteVehicleChange(); } catch (e) {}
    }
    if (!(opts && opts.noPushBack) && _fbLocalHasExtras(col, remoteData)) _fbPushBack(col);
    pulled.push({ cop15: 'COP15', testplan: 'Test Plan', inventory: 'Inventory' }[col]);
}

// Heurística previa por conteo — solo como fallback si el merge falla.
//
// [v23.2] Compara con `_fbPushDataScore`, NO con `_fbPullLocalScore`: el lado remoto
// se mide contando dato real (planData/testedList/weeklyPlans, vehículos, cilindros),
// así que el lado local tiene que medirse igual. Desde v23.2 `_fbPullLocalScore`
// incluye además la configuración, y mezclarlos comparaba peras con manzanas: lo local
// parecía sistemáticamente más grande y este fallback dejaba de adoptar un remoto que
// sí traía más datos.
function _fbPullAdoptByCount(col, remoteData, pulled) {
    if (col === 'cop15') {
        if (remoteData.vehicles && remoteData.vehicles.length >= _fbPushDataScore('cop15')) _fbPullSeed(col, remoteData, pulled);
    } else if (col === 'testplan') {
        var _rTp = (remoteData.planData ? remoteData.planData.length : 0) + (remoteData.testedList ? remoteData.testedList.length : 0) + (remoteData.weeklyPlans ? remoteData.weeklyPlans.length : 0);
        if (_rTp >= _fbPushDataScore('testplan')) _fbPullSeed(col, remoteData, pulled);
    } else if (col === 'inventory') {
        var _invScoreFn = function(s) { var n = 0; if (s && s.gases) s.gases.forEach(function(g) { n += 1 + ((g.readings && g.readings.length) || 0); }); if (s && s.equipment) n += s.equipment.length; if (s && s.assets) n += s.assets.length; if (s && s.maintActivities) n += s.maintActivities.length; if (s && s.maintLog) n += s.maintLog.length; return n; };
        if (_invScoreFn(remoteData) >= _fbPushDataScore('inventory')) _fbPullSeed(col, remoteData, pulled);
    }
}

// Unión de operadores por id+nombre; en colisión gana el updatedAt más reciente.
// Los tombstones (deleted:true) sobreviven al merge para que un operador borrado
// no resucite desde un remoto viejo.

// [v23.2] Unión por `id` de una lista append-only, conservando las más nuevas.
// La usan `shiftLog` (bitácora de turno) y `shiftReports`.
//
// POR QUÉ. La rama `panel` de `fbPullApply` hacía `Object.assign(pnState,
// remoteData)` y sólo volvía a mezclar cuatro arrays. Todo lo demás se tomaba
// ENTERO del remoto — incluida la bitácora. Una entrada escrita en este
// dispositivo y aún no empujada (hay 2 s de debounce en `fbPush`) se
// aniquilaba en cuanto llegaba un pull, y como después este dispositivo empuja
// su copia ya truncada, la entrada desaparecía TAMBIÉN de la nube. Y `shiftLog`
// siempre tuvo `id` (`sl_…`) y `timestamp`: era trivialmente mezclable.
function _fbMergeByIdNewest(locales, remotas, cap) {
    var map = {};
    var stamp = function(x) { return x.timestamp || x.date || x.createdAt || ''; };
    (locales || []).concat(remotas || []).forEach(function(x) {
        if (!x) return;
        var k = x.id || (stamp(x) + '|' + (x.operator || '') + '|' + (x.notes || ''));
        var prev = map[k];
        if (!prev || stamp(x) >= stamp(prev)) map[k] = x;
    });
    var out = Object.keys(map).map(function(k) { return map[k]; })
        .sort(function(a, b) { return String(stamp(a)).localeCompare(String(stamp(b))); });
    if (cap && out.length > cap) out = out.slice(-cap);
    return out;
}


// ══════════════════════════════════════════════════════════════════════
// [v23.2] `_fbEquipKey(e)` es LA DEFINICIÓN de la identidad de un instrumento
// en el merge. Todo consumidor nuevo la llama; nunca volver a escribir
// `e.serialNo || e.name` a mano.
//
// POR QUÉ. La clave era `serialNo || name`, y en la semilla real del F11 eso
// COLISIONA: de 31 instrumentos, 11 (35%) caen en dos cubetas — `"-"` ×7 y
// `"N/A"` ×4, porque muchos equipos no tienen número de serie. El mapa
// `localEquip` sólo conservaba el ÚLTIMO de cada cubeta, así que:
//   · los otros 3 `"N/A"` eran invisibles al merge y NUNCA se importaban a un
//     dispositivo que no los tuviera, y
//   · `_fbMergeEquipConflict` resolvía con `findIndex(...)`, que devuelve
//     SIEMPRE el primero: las fechas y el `calHistory` del instrumento remoto
//     #4 se escribían encima del instrumento local #1.
// Para un laboratorio con trazabilidad ISO 17025 eso es un registro de
// calibración atribuido al equipo equivocado, no un detalle de UI.
//
// Los equipos ya traen identidad estable: `id` (`"eq_th0033"`) y `f11Id`. Se
// prefiere ésa; `serialNo`/`name` quedan sólo como último recurso para un
// registro viejo sin id, y con prefijo para que no se confundan entre sí.
function _fbEquipKey(e) {
    if (!e) return '';
    if (e.id) return 'id:' + e.id;
    if (e.f11Id) return 'f11:' + e.f11Id;
    var sn = String(e.serialNo || '').trim();
    // '-' y 'N/A' son "no tiene serie", no una serie.
    if (sn && sn !== '-' && sn !== 'N/A' && sn !== 'NA') return 'sn:' + sn.toUpperCase();
    return 'nm:' + String(e.name || '').trim().toUpperCase();
}

function _fbMergeOperators(localOps, remoteOps) {
    var byKey = {};
    // La clave era `id|nombre`, pero _authFindOperator (auth.js) busca SOLO por id y
    // devuelve el primero. Con "Jorge Nuñez" y "Jorge Núñez" (misma id, grafía
    // distinta) sobrevivían AMBOS y la sesión podía quedarse con el marcador
    // provisional sin permisos. Con id presente, el id manda.
    var keyOf = function(o) { return o.id != null ? 'id:' + o.id : 'nm:' + (o.name || ''); };
    // Gana el más reciente en ese campo de fecha
    var newerBy = function(a, b, field) {
        return ((b && b[field]) || '') > ((a && a[field]) || '') ? b : a;
    };
    (localOps || []).forEach(function(o) { if (o) byKey[keyOf(o)] = o; });
    (remoteOps || []).forEach(function(r) {
        if (!r) return;
        var k = keyOf(r), l = byKey[k];
        if (!l) { byKey[k] = r; return; }
        // Un operador local `provisional` es un marcador sembrado por pnInit en un
        // dispositivo nuevo; su createdAt es "ahora" y por fecha le ganaría al registro
        // real de la nube, descartando sus PINs. Siempre pierde contra el remoto.
        if (l.provisional && !r.provisional) { byKey[k] = r; return; }

        // [Fase 3] Merge POR SECCIONES en vez de "gana el registro más nuevo entero".
        // Con LWW sobre el objeto completo, certificar una habilidad en la tablet y
        // editar el teléfono del mismo operador en el celular hacía que uno de los dos
        // cambios desapareciera. Cada sección lleva su propia marca de tiempo.
        var lt = l.updatedAt || l.deletedAt || l.createdAt || '';
        var rt = r.updatedAt || r.deletedAt || r.createdAt || '';
        var base = (rt > lt) ? r : l;                 // identidad: nombre, rol, activo
        var m = Object.assign({}, base);

        var sk = newerBy(l, r, 'skillsUpdatedAt');    // competencias
        m.skills = sk.skills || {};
        m.skillsUpdatedAt = sk.skillsUpdatedAt || '';

        var pr = newerBy(l, r, 'profileUpdatedAt');   // perfil
        ['employeeId', 'email', 'phone', 'shift', 'area', 'notes', 'hiredAt', 'level'].forEach(function(f) {
            if (pr[f] !== undefined) m[f] = pr[f];
        });
        m.profileUpdatedAt = pr.profileUpdatedAt || '';

        // Credenciales: nunca las pierde el local (el remoto puede venir sin ellas)
        if (l.pinHash2 || l.pinHash) {
            m.pinHash2 = l.pinHash2 || r.pinHash2;
            m.pinHash = l.pinHash || r.pinHash;
        }
        // Tombstone pegajoso: si cualquiera de los dos lo marcó borrado, sigue borrado
        if (l.deleted || r.deleted) {
            m.deleted = true;
            m.active = false;
            m.deletedAt = (l.deletedAt || '') > (r.deletedAt || '') ? l.deletedAt : r.deletedAt;
        }
        byKey[k] = m;
    });
    var out = Object.keys(byKey).map(function(k) { return byKey[k]; });
    // Un rol fuera del mapa de permisos deja al operador con CERO permisos en
    // silencio; el roster remoto puede traerlo con otra grafía.
    if (typeof _authNormalizeRole === 'function') {
        out.forEach(function(o) {
            if (!o) return;
            var canon = _authNormalizeRole(o.role);
            if (canon) o.role = canon;
        });
    }
    return out;
}

// [Fase 3.5] Merge del catálogo editable de habilidades (pnState.skillCatalog).
// Clave: id. Gana el updatedAt más reciente. `archived` es PEGAJOSO: si cualquiera
// de los dos lados la archivó, sigue archivada salvo que el otro lado la haya
// restaurado más tarde — así una habilidad retirada no reaparece desde un remoto
// viejo, que es el mismo criterio que usamos con los tombstones de operadores.
function _fbMergeSkillCatalog(localCat, remoteCat) {
    var byId = {};
    (localCat || []).forEach(function(s) { if (s && s.id) byId[s.id] = s; });
    (remoteCat || []).forEach(function(r) {
        if (!r || !r.id) return;
        var l = byId[r.id];
        if (!l) { byId[r.id] = r; return; }
        var lt = l.updatedAt || '', rt = r.updatedAt || '';
        var winner = (rt > lt) ? r : l;
        var m = Object.assign({}, winner);
        if (l.archived || r.archived) {
            // el lado que archivó más tarde manda; restaurar exige un updatedAt posterior
            var archSide = (l.archived && r.archived)
                ? (((l.archivedAt || '') > (r.archivedAt || '')) ? l : r)
                : (l.archived ? l : r);
            var liveSide = (archSide === l) ? r : l;
            if (!(!liveSide.archived && (liveSide.updatedAt || '') > (archSide.archivedAt || ''))) {
                m.archived = true;
                m.archivedAt = archSide.archivedAt || '';
            }
        }
        byId[r.id] = m;
    });
    return Object.keys(byId).map(function(k) { return byId[k]; });
}

// v15.9: merge de tareas manuales del tablero HOY (pnState.tasks) — misma semántica que
// operators: clave id, gana el updatedAt más reciente, los tombstones (deleted) sobreviven.
function _fbMergeTasks(localTasks, remoteTasks) {
    var byId = {};
    (localTasks || []).forEach(function(t) { if (t && t.id) byId[t.id] = t; });
    (remoteTasks || []).forEach(function(r) {
        if (!r || !r.id) return;
        var l = byId[r.id];
        if (!l) { byId[r.id] = r; return; }
        var lt = l.updatedAt || l.createdAt || '';
        var rt = r.updatedAt || r.createdAt || '';
        byId[r.id] = (rt > lt) ? r : l;
    });
    return Object.keys(byId).map(function(k) { return byId[k]; });
}

// v16.6: merge de proyectos (pnState.projects) — mismo patrón que _fbMergeTasks para el
// proyecto en sí (id, gana updatedAt), pero además hay que mergear POR ID lo que vive
// DENTRO de cada proyecto (steps[] y log[]): dos técnicos editando pasos distintos del
// mismo proyecto en dispositivos distintos no deben pisarse entre sí.
function _fbMergeProjectSubArray(localArr, remoteArr) {
    var byId = {};
    (localArr || []).forEach(function(x) { if (x && x.id) byId[x.id] = x; });
    (remoteArr || []).forEach(function(r) {
        if (!r || !r.id) return;
        var l = byId[r.id];
        if (!l) { byId[r.id] = r; return; }
        var lt = l.updatedAt || l.createdAt || l.at || '';
        var rt = r.updatedAt || r.createdAt || r.at || '';
        byId[r.id] = (rt > lt) ? r : l;
    });
    return Object.keys(byId).map(function(k) { return byId[k]; });
}
/**
 * [v19.0] Fusiona las mesas de trabajo del CoP (copState.families), por clave de
 * familia. Gana la de `updatedAt` más reciente; dentro de la ganadora se agregan
 * los VINes que solo existían del otro lado (unión por VIN normalizado), para que
 * dos técnicos capturando la misma familia no se borren el trabajo.
 */
function _fbMergeCopFamilies(localFams, remoteFams) {
    var out = {};
    var keys = {};
    Object.keys(localFams || {}).forEach(function(k) { keys[k] = true; });
    Object.keys(remoteFams || {}).forEach(function(k) { keys[k] = true; });

    Object.keys(keys).forEach(function(k) {
        var l = (localFams || {})[k], r = (remoteFams || {})[k];
        if (!l) { out[k] = r; return; }
        if (!r) { out[k] = l; return; }
        var lAt = l.updatedAt || '', rAt = r.updatedAt || '';
        var win = lAt >= rAt ? l : r;
        var lose = lAt >= rAt ? r : l;
        var merged = JSON.parse(JSON.stringify(win));
        var seen = {};
        (merged.vehicles || []).forEach(function(v) {
            if (v && v.vin) seen[String(v.vin).trim().toUpperCase()] = true;
        });
        (lose.vehicles || []).forEach(function(v) {
            if (!v || !v.vin) return;                       // las filas vacías no se arrastran
            var vk = String(v.vin).trim().toUpperCase();
            if (seen[vk]) return;
            (merged.vehicles = merged.vehicles || []).push(JSON.parse(JSON.stringify(v)));
            seen[vk] = true;
        });
        // Renumerar SIEMPRE: la fusión es justo donde se encuentran datos de dos
        // dispositivos, y dos filas con el mismo id harían que copRemoveRow borre las
        // dos y que copHandleInput escriba solo en la primera. Barato y se autocorrige.
        (merged.vehicles || []).forEach(function(v, i) { v.id = i + 1; });
        out[k] = merged;
    });
    return out;
}

function _fbMergeProjects(localProjects, remoteProjects) {
    var byId = {};
    (localProjects || []).forEach(function(p) { if (p && p.id) byId[p.id] = p; });
    (remoteProjects || []).forEach(function(r) {
        if (!r || !r.id) return;
        var l = byId[r.id];
        if (!l) { byId[r.id] = r; return; }
        var lt = l.updatedAt || l.createdAt || '';
        var rt = r.updatedAt || r.createdAt || '';
        var winner = (rt > lt) ? r : l;
        var other = (winner === r) ? l : r;
        var m = Object.assign({}, winner);
        m.steps = _fbMergeProjectSubArray(other.steps, winner.steps);
        m.log = _fbMergeProjectSubArray(other.log, winner.log);
        byId[r.id] = m;
    });
    return Object.keys(byId).map(function(k) { return byId[k]; });
}

function fbPullApply(collections, results, showFeedback) {
    var pulled = [];

    collections.forEach(function(col) {
        var remoteData = results[col];
        if (!remoteData) return;

        if (col === 'cop15' || col === 'testplan' || col === 'inventory') {
            // [2.35.0] La revisión compara las lecturas locales con las de la nube.
            if (col === 'inventory' && fbSync.review && fbSync.review.state === 'checking') {
                try { fbSync.review.remoteInv = JSON.parse(JSON.stringify(remoteData)); } catch (eR) {}
            }
            try {
                _fbPullMergeModule(col, remoteData, pulled);
            } catch(e) {
                console.warn('fbPullApply: merge falló en ' + col + ', usando heurística por conteo', e);
                _fbPullAdoptByCount(col, remoteData, pulled);
            }
            // v15.9: el modelo de consumo es un cache determinista de usageLog+readings —
            // se RECOMPUTA tras cada pull de inventario (nunca se mergea entre dispositivos)
            if (col === 'inventory' && typeof invUpdateConsumptionModel === 'function') {
                try { invUpdateConsumptionModel(); } catch(e2) {}
            }
        } else if (col === 'panel') {
            if (typeof pnState !== 'undefined') {
                var _localOpsPn = (pnState.operators || []).slice();
                var _localTasksPn = (pnState.tasks || []).slice();
                var _localCatPn = (pnState.skillCatalog || []).slice();
                var _localProjectsPn = (pnState.projects || []).slice();
                // [v23.2] Estado de UI POR DISPOSITIVO: gana SIEMPRE el local. Mismo
                // criterio que la rama `cop` de abajo (v19.0). `activeTab` venía del
                // remoto y `pnRender()` corre justo después, así que la pestaña que
                // otro técnico tuviera abierta te movía la pantalla; `matrixCols` es
                // el ancho/orden de columnas de la matriz de habilidades de ESTE
                // equipo, y `opsSchema` es una guarda de migración de una sola vez
                // (la misma trampa que `tpState._migr` ya tenía documentada).
                var _localUiPn = {};
                ['activeTab', 'matrixCols', 'opsSchema'].forEach(function(k) {
                    if (pnState[k] !== undefined) _localUiPn[k] = pnState[k];
                });
                var _localShiftLog = (pnState.shiftLog || []).slice();
                var _localShiftReports = (pnState.shiftReports || []).slice();
                var _localSkillGroups = (pnState.skillGroups || []).slice();
                var _localVetsChecks = (pnState.vetsChecks || []).slice();
                var _localReviewFlow = pnState.reviewFlow || null;

                Object.assign(pnState, remoteData);

                Object.keys(_localUiPn).forEach(function(k) { pnState[k] = _localUiPn[k]; });
                // La bitácora y los reportes de turno se UNEN por id (antes el remoto
                // los reemplazaba enteros y se perdía lo escrito en este dispositivo).
                pnState.shiftLog = _fbMergeByIdNewest(_localShiftLog, (remoteData && remoteData.shiftLog) || [], 500);
                pnState.shiftReports = _fbMergeByIdNewest(_localShiftReports, (remoteData && remoteData.shiftReports) || [], 30).reverse();
                // [2.5.0] Política de verificaciones VETS: una entrada por verificación
                // (id = su nombre), gana la clasificación más reciente.
                pnState.vetsChecks = _fbMergeByIdNewest(_localVetsChecks, (remoteData && remoteData.vetsChecks) || [], 300);
                // [2.8.0] Activación de la revisión dirigida: gana el cambio más reciente.
                var _remoteReviewFlow = (remoteData && remoteData.reviewFlow) || null;
                pnState.reviewFlow = (!_remoteReviewFlow || (_localReviewFlow && String(_localReviewFlow.at || '') > String(_remoteReviewFlow.at || '')))
                    ? _localReviewFlow : _remoteReviewFlow;
                // Los grupos de habilidades son una lista corta y editable: si el
                // remoto no trae ninguno, no borrar los locales.
                if (!(remoteData && (remoteData.skillGroups || []).length) && _localSkillGroups.length) {
                    pnState.skillGroups = _localSkillGroups;
                }
                pnState.operators = _fbMergeOperators(_localOpsPn, (remoteData && remoteData.operators) || []);
                // v15.9: tareas manuales del tablero HOY — merge por id (gana updatedAt), tombstones
                pnState.tasks = _fbMergeTasks(_localTasksPn, (remoteData && remoteData.tasks) || []);
                // [Fase 3.5] catálogo editable de habilidades — merge por id, archived pegajoso
                pnState.skillCatalog = _fbMergeSkillCatalog(_localCatPn, (remoteData && remoteData.skillCatalog) || []);
                // v16.6: proyectos — merge por id, y dentro de cada uno steps[]/log[] también por id
                pnState.projects = _fbMergeProjects(_localProjectsPn, (remoteData && remoteData.projects) || []);
                localStorage.setItem(PN_LS_KEY, JSON.stringify(pnState));
                if (typeof pnRender === 'function') pnRender();
                pulled.push('Panel');
            }
        } else if (col === 'cop') {
            // Merge de juicios CoP guardados por id (no perder registros entre dispositivos)
            var _localCop = {}; try { _localCop = JSON.parse(localStorage.getItem('kia_cop_v1')) || {}; } catch(e) {}
            var _mergedCop = remoteData || {};
            var _savedMap = {};
            (_localCop.saved || []).concat(_mergedCop.saved || []).forEach(function(r) { if (r && r.id) _savedMap[r.id] = r; });
            _mergedCop.saved = Object.keys(_savedMap).map(function(k) { return _savedMap[k]; }).sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

            // v19.0 — El resto de copState se tomaba del remoto ENTERO. Eso hace que la
            // pantalla del CoP salte de vista y de familia porque otro técnico tocó la
            // suya, y en el peor caso pisa la mesa de trabajo local. Estos campos son
            // estado de UI POR DISPOSITIVO: siempre gana el local.
            // [v23.2] `regulation`, `fuelType` y `activePolls` FALTABAN aquí, y no son
            // cosméticos: `copRenderStats` lee los límites por
            // `COP_FUEL_LIMITS[copState.fuelType]`. Como `vehicles` sí se conservaba,
            // el técnico se quedaba con SUS filas evaluadas contra la norma y el juego
            // de contaminantes de OTRO técnico — un veredicto de conformidad
            // equivocado, no un salto de pantalla. Los tres son de la mesa de trabajo
            // abierta (se guardan y restauran por familia), no ajustes del laboratorio.
            ['view', 'region', 'familyKey', 'familyLabel', 'vehicles', 'present', 'ovFilter', 'ovHidden', 'spc',
             'showTable', 'showFormula', 'regulation', 'fuelType', 'activePolls'].forEach(function(k) {
                if (_localCop[k] !== undefined) _mergedCop[k] = _localCop[k];
                else delete _mergedCop[k];
            });

            // v19.0 — Mesas de trabajo por familia: merge POR CLAVE, gana la de
            // `updatedAt` más reciente, y dentro de la ganadora se agregan los VINes
            // que solo tenía la perdedora. En una frase: dos técnicos que capturan
            // familias distintas conservan ambas, y si capturan la MISMA familia se
            // queda la versión más reciente más los VINes que el otro había agregado.
            // Sin esto, el primer pull borraría el trabajo local (remoto gana entero).
            _mergedCop.families = _fbMergeCopFamilies(_localCop.families, _mergedCop.families);
            if (_localCop.copSchema && !(_mergedCop.copSchema >= _localCop.copSchema)) {
                _mergedCop.copSchema = _localCop.copSchema;
            }
            // El alcance sí es del laboratorio (compartido), pero si el remoto viene de
            // una versión previa a v19.0 no lo trae: conservar el local en vez de borrarlo.
            if (_mergedCop.scope === undefined && _localCop.scope !== undefined) _mergedCop.scope = _localCop.scope;

            localStorage.setItem('kia_cop_v1', JSON.stringify(_mergedCop));
            if (typeof copSyncReload === 'function') copSyncReload();
            pulled.push('CoP');
        } else if (col === 'homolog') {
            // Catálogo de homologación: merge por Work Order (MC code si no hay WO; gana
            // el más reciente por fila) y unión de los enlaces config→WO, para que dos
            // técnicos importando descargas distintas del ICMS no se pisen.
            // [2.29.0] WO primero, igual que homoRowKey: varias WO comparten MC code.
            var _localHomo = {}; try { _localHomo = JSON.parse(localStorage.getItem('kia_homolog_v1')) || {}; } catch(e) {}
            var _remoteHomo = remoteData || {};
            var _rowMap = {};
            (_localHomo.catalog || []).concat(_remoteHomo.catalog || []).forEach(function(r) {
                if (!r) return;
                var k = String((r.workOrder || r.mcCode || '')).trim().toUpperCase().replace(/[\s\-_/]+/g, '');
                if (!k) return;
                var prev = _rowMap[k];
                if (!prev || String(r.at || '') >= String(prev.at || '')) _rowMap[k] = r;
            });
            // v19.1 — Familias IP del WVTA: merge por código (gana `updatedAt`). Este
            // objeto se arma desde cero, así que una clave nueva que no se liste aquí
            // se pierde en CADA pull. Se empata normalizando el código igual que
            // _homoNorm (mayúsculas, sin separadores).
            var _ipMap = {};
            (_localHomo.ipFamilies || []).concat(_remoteHomo.ipFamilies || []).forEach(function(f) {
                if (!f || !f.code) return;
                var k = String(f.code).trim().toUpperCase().replace(/[\s\-_/]+/g, '');
                var prev = _ipMap[k];
                if (!prev || String(f.updatedAt || '') >= String(prev.updatedAt || '')) _ipMap[k] = f;
            });
            var _mergedHomo = {
                catalog: Object.keys(_rowMap).map(function(k) { return _rowMap[k]; }),
                links: Object.assign({}, _remoteHomo.links || {}, _localHomo.links || {}),
                ipFamilies: Object.keys(_ipMap).map(function(k) { return _ipMap[k]; }),
                // v20.2: co2TolerancePct se retiró (la verificación de CO₂ ahora es el
                // muestreo secuencial de UN R154 §3.3.1, no un % de tolerancia) — no se
                // lista aquí a propósito, así que un pull deja de traerla.
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem('kia_homolog_v1', JSON.stringify(_mergedHomo));
            if (typeof homoSyncReload === 'function') homoSyncReload();
            pulled.push('Homologación');
        } else if (col === 'audit') {
            // Merge del historial de cambios por id (no perder registros), orden cronológico.
            // Cap unificado con el local (AUDIT_MAX) — antes el pull truncaba a 1000 y encogía la historia.
            var _localAudit = []; try { _localAudit = JSON.parse(localStorage.getItem('kia_audit_trail')) || []; } catch(e) {}
            var _remoteAudit = Array.isArray(remoteData) ? remoteData : [];
            var _seenA = {}, _mergedA = [];
            _localAudit.concat(_remoteAudit).forEach(function(e) { if (e && e.id && !_seenA[e.id]) { _seenA[e.id] = true; _mergedA.push(e); } });
            _mergedA.sort(function(a, b) { return (a.ts || '') < (b.ts || '') ? -1 : (a.ts || '') > (b.ts || '') ? 1 : 0; });
            var _auditCap = (typeof AUDIT_MAX !== 'undefined') ? AUDIT_MAX : 2000;
            if (_mergedA.length > _auditCap) _mergedA = _mergedA.slice(-_auditCap);
            localStorage.setItem('kia_audit_trail', JSON.stringify(_mergedA));
            if (typeof auditReloadFromStorage === 'function') auditReloadFromStorage();
            pulled.push('Historial');
        }
    });

    for (var ri = 0; ri < collections.length; ri++) fbQuotaRecord('read');

    // v15.6: lastSync solo cuando de verdad se aplicó algo — antes se ponía
    // siempre y el indicador decía "Sync HH:MM" con 0 datos descargados
    if (pulled.length > 0) fbSync.lastSync = new Date();
    fbSync._pullCompleted = true; // el pull terminó sin error (gobierna el seed push)
    // [2.6.0] Historial permanente: subir la bandeja y traer lo de los demás equipos.
    if (typeof fbAuditAfterPull === 'function') setTimeout(fbAuditAfterPull, 1500);
    // [2.7.0] Límites compartidos: adoptar la versión nueva si este equipo no tiene cambios propios.
    if (typeof fbRegCheck === 'function') setTimeout(function() { fbRegCheck().catch(function() {}); }, 2500);
    // [2.35.0] Sin vehículos por pieza, la revisión se decide aquí (solo Consumibles).
    if (fbSync.review && fbSync.review.state === 'checking' && !fbVehActive()) fbReviewEvaluate(null);
    else if (!fbVehActive()) _fbReviewStampOk();
    // [2.9.0] Vehículos uno por uno: después de fusionar la copia completa (si la hay).
    if (typeof fbVehiclesSync === 'function') {
        setTimeout(function() { fbVehiclesSync({ initial: true }); }, 1000);
        if (typeof _fbVehPollArm === 'function') _fbVehPollArm();
    }
    fbSync._seedRetries = 0;
    fbSync.status = 'connected';
    fbSync.lastError = '';
    fbUpdateIndicator();

    if (pulled.length > 0) {
        if (showFeedback) showToast('Descargado: ' + pulled.join(', '), 'success');
        if (typeof fbPostSyncPull === 'function') fbPostSyncPull();
        if (fbOfflineQueue.length > 0) setTimeout(fbQueueRetry, 2000);
    } else {
        if (showFeedback) showToast('No hay datos en la nube para esta estación', 'info');
    }
}

// ── Hook into existing save functions ──
var _fbHooksApplied = false;
function fbHookSaves() {
    // Prevent double-wrapping when initializeSystem() is called multiple times (e.g., after login)
    if (_fbHooksApplied) return;
    _fbHooksApplied = true;

    // Nota: se preserva el valor de retorno (false = no se pudo persistir → no subir a la nube)
    var _origSaveDB = window.saveDB;
    // [2.9.0] Además de la copia completa (para equipos sin actualizar), un ciclo de
    // vehículos uno por uno: trae lo de la nube y sube solo lo que cambió aquí.
    if (_origSaveDB) { window.saveDB = function() { var ok = _origSaveDB(); if (ok !== false && fbSyncModules.cop15) { fbPush('cop15', db); fbVehiclesSyncSoon(); } return ok; }; }
    var _origTpSave = window.tpSave;
    if (_origTpSave) { window.tpSave = function() { var ok = _origTpSave(); if (ok !== false && fbSyncModules.testplan) fbPush('testplan', tpState); return ok; }; }
    var _origInvSave = window.invSave;
    if (_origInvSave) { window.invSave = function() { var ok = _origInvSave(); if (ok !== false && fbSyncModules.inventory) fbPush('inventory', invState); return ok; }; }
    var _origPnSave = window.pnSave;
    if (_origPnSave) { window.pnSave = function() { var ok = _origPnSave(); if (ok !== false && fbSyncModules.panel) fbPush('panel', pnState); return ok; }; }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  LIVE SYNC — Real-time onSnapshot listeners                         ║
// ║  Auto-merges additive changes from other stations silently.         ║
// ║  Conflicts are notified via toast but never auto-applied.           ║
// ╚══════════════════════════════════════════════════════════════════════╝

function fbStartListening() {
    if (!fbSync.db || fbSync._useREST || !fbSync.stationId) return;
    if (!FB_IS_HTTP_ORIGIN) return; // onSnapshot unreliable on file:// / content://
    if (fbSync._liveSync) return;  // Already active

    var _startedAt = Date.now();
    var cols = ['cop15', 'testplan', 'inventory'];

    cols.forEach(function(col) {
        if (!fbSyncModules[col]) return; // Respect module enable/disable config
        try {
            var unsub = fbSync.db.collectionGroup(col).onSnapshot(function(snap) {
                // 5-second grace period at startup to skip initial delivery of existing docs
                if (Date.now() - _startedAt < 5000) return;
                snap.docChanges().forEach(function(change) {
                    if (change.type === 'removed') return;
                    var _d = change.doc.data() || {};
                    // Con espacio compartido todos escriben al mismo stationId; distinguir el eco propio por writer (device id)
                    var writer = _d.writer || change.doc.ref.parent.parent.id; // fallback a stationId para docs viejos
                    if (writer === FB_DEVICE_ID) return; // eco propio (mismo dispositivo)
                    if (_d.writer) _fbWriterSeen(_d.writer, 'mod');
                    // Debounce 300ms para coalescer cambios rápidos del mismo emisor+colección
                    var key = writer + '|' + col;
                    clearTimeout(fbSync._pendingMerge[key]);
                    fbSync._pendingMerge[key] = setTimeout(function() {
                        fbHandleRemoteChange(col, change.doc.data(), writer);
                    }, 300);
                });
            }, function(err) {
                console.warn('fbStartListening error (' + col + '):', err.message);
            });
            fbSync._listeners.push(unsub);
        } catch(e) {
            console.warn('fbStartListening: collectionGroup(' + col + ') failed:', e);
        }
    });

    // [2.9.0] cop15meta/current se escribe en el mismo commit que cada tanda de
    // vehículos: es el timbre que avisa a los demás equipos que hay algo que traer.
    if (fbSyncModules.cop15) {
        try {
            var unsubVeh = fbSync.db.collection('stations').doc(fbSync.stationId)
                .collection('cop15meta').doc('current').onSnapshot(function(snap) {
                    if (Date.now() - _startedAt < 5000) return;
                    var d = (snap && snap.exists) ? (snap.data() || {}) : null;
                    if (!d || d.writer === FB_DEVICE_ID) return;
                    fbVehiclesSyncSoon(800);
                }, function(err) {
                    fbSync._vehLive = false;
                    console.warn('fbStartListening error (cop15meta):', err.message);
                });
            fbSync._listeners.push(unsubVeh);
            fbSync._vehLive = true;
        } catch (e) {
            console.warn('fbStartListening: cop15meta failed:', e);
        }
    }

    fbSync._liveSync = fbSync._listeners.length > 0;
    fbUpdateIndicator();
    if (fbSync._liveSync) {
        console.log('Firebase: Live sync active (' + fbSync._listeners.length + ' listeners)');
    }
}

function fbStopListening() {
    fbSync._listeners.forEach(function(unsub) { try { unsub(); } catch(e) {} });
    fbSync._listeners = [];
    fbSync._liveSync = false;
    fbSync._vehLive = false;
    fbUpdateIndicator();
    console.log('Firebase: Live sync stopped');
}

function fbHandleRemoteChange(col, docData, remoteSt) {
    var now = Date.now();
    var key = remoteSt + '|' + col;
    // Anti-duplicate: skip if we already processed this remote change within the last 5s
    if (fbSync._recentRemote[key] && (now - fbSync._recentRemote[key]) < 5000) return;
    fbSync._recentRemote[key] = now;

    // ══════════════════════════════════════════════════════════════════
    // [v23.2] EL LIVE-SYNC AUTOMÁTICO NUNCA HABÍA FUNCIONADO.
    //
    // Aquí se llamaba a `fbFromFirestoreValue(docData.data)`. Esa función
    // (definida más arriba) sólo entiende el FORMATO DE CABLE REST
    // (`stringValue`, `mapValue`, `arrayValue`…), y lo que llega por este camino
    // NO viene en ese formato: `fbPush` escribe `data: data` —un objeto JS
    // plano— y el listener recibe `change.doc.data()`, que el SDK compat ya
    // devuelve DECODIFICADO. Un objeto plano no coincide con ninguna de las 8
    // comprobaciones de esa función y caía a su `return null` final.
    //
    // Resultado: `parsedData` era SIEMPRE null, este `return` se tomaba siempre,
    // y `fbAutoMerge` —cuyo único llamador es la línea de abajo— no se ejecutó
    // jamás. Los tres listeners de collectionGroup se disparaban, gastaban cuota
    // y descartaban en silencio cada cambio remoto. Como tampoco hay ningún pull
    // periódico (sólo al conectar, al reconectar y el botón manual), dos
    // técnicos con la app abierta NO se veían entre sí hasta recargar — mientras
    // el indicador del topbar decía "Live sync active".
    //
    // Se acepta el objeto plano del SDK y se conserva la decodificación REST
    // como respaldo por si alguna vez llega un documento en ese formato.
    var parsedData = null;
    try {
        var _raw = docData && docData.data;
        if (_raw && typeof _raw === 'object') {
            // El formato REST siempre envuelve en una de estas llaves.
            var _esREST = ('mapValue' in _raw) || ('arrayValue' in _raw) || ('stringValue' in _raw);
            parsedData = _esREST ? fbFromFirestoreValue(_raw) : _raw;
        }
    } catch(e) {
        console.warn('fbHandleRemoteChange: parse error for ' + col, e);
        return;
    }
    if (!parsedData || typeof parsedData !== 'object') return;
    fbQuotaRecord('read');
    fbAutoMerge(col, parsedData, remoteSt);
}

// ══════════════════════════════════════════════════════════════════════
// [v23.5] LIVE-SYNC QUE CONVERGE (issues #131 y #132)
//
// v23.2 hizo que `fbAutoMerge` corriera por primera vez, y al correr destapó dos
// defectos que nunca se habían ejercitado:
//
//  #132 — BUCLE. Cada fusión automática terminaba en `fbPushAll()` (los tres
//  módulos). El otro equipo lo recibía como cambio remoto, lo comparaba con
//  `JSON.stringify` crudo contra un documento de Firestore (llaves en otro orden →
//  SIEMPRE distinto), fusionaba, y empujaba todo de vuelta. Cada vuelta: un toast de
//  "conflicto", otro de "Plan de producción actualizado", otro de "Merge completado"
//  y una copia completa de db+tpState+invState en la bitácora de fusiones.
//
//  #131 — LAS EDICIONES NO VIAJABAN. Un vehículo que existe en los dos equipos con
//  datos distintos era un "conflicto", y el live-sync solo avisaba: nunca lo
//  aplicaba. Y en el pull, el desempate era "timeline más largo, y si empatan, lo
//  local": corregir una hora no agrega timeline, así que lo local ganaba siempre.
//
// Reglas nuevas:
//  1. Se aplica todo lo que la fusión sabe resolver (`merge_all`), en silencio: sin
//     bitácora, sin fbPushAll. Un solo aviso por módulo por minuto, y solo si algo
//     CAMBIÓ de verdad aquí (huella antes/después).
//  2. Un vehículo en los dos lados: gana la edición más reciente (`updatedAt`,
//     sellado por `stampRevisions` en saveDB). El desempate es DETERMINISTA
//     — los dos equipos eligen el mismo — o nunca convergerían.
//  3. Se re-empuja SOLO el módulo, y SOLO si aquí hay algo que la nube no tiene
//     (`_fbLocalHasExtras`). Tras un re-empuje el otro lado ya no tiene extras, así
//     que la conversación termina. Además hay un disyuntor por si acaso.
// ══════════════════════════════════════════════════════════════════════

var FB_LIVE_TOAST_MS = 60000;      // un aviso por módulo por minuto
var FB_PUSHBACK_DELAY_MS = 1500;
var FB_PUSHBACK_WINDOW_MS = 120000;
var FB_PUSHBACK_MAX = 4;           // re-empujes por módulo por ventana: más es un bucle
var _fbLive = { toastAt: {}, pushBack: {} };

/** Identidad de una fila de `testedList` (compartida por el análisis y los extras). */
function _fbTestedKey(t) {
    if (!t) return '';
    var ident = t.vehicleId || t.vin || t.itemUid ||
                ((typeof _tpExtractVin === 'function') ? (_tpExtractVin(t.note) || '') : '');
    return t.configText + '|' + (t.date || '') + '|' + ident;
}

/** Identidad de un plan semanal. */
function _fbPlanKey(w) {
    if (!w) return '';
    if (typeof tpPlanId === 'function') return tpPlanId(w);
    return w.planId || w.week || w.weekDate || String(w.created || w.id || '');
}

/** Identidad de una fila del plan: `uid` (v23) y, en filas viejas, desc + día. */
function _fbPlanItemKey(item) {
    if (!item) return '';
    return item.uid ? 'u:' + item.uid : 'd:' + item.desc + '|' + (item.testDay || '');
}

/** Unión de dos paStatus: "sent=true" siempre gana (recibos de envío). */
function _fbMergePaStatus(localPa, remotePa) {
    if (!localPa && !remotePa) return undefined;
    if (!localPa) return remotePa;
    if (!remotePa) return localPa;
    var out = {};
    var keys = {};
    Object.keys(localPa).forEach(function(k){ keys[k] = true; });
    Object.keys(remotePa).forEach(function(k){ keys[k] = true; });
    Object.keys(keys).sort().forEach(function(k) {
        var lv = localPa[k] || {};
        var rv = remotePa[k] || {};
        var lvSent = !!lv.sent, rvSent = !!rv.sent;
        if (lvSent && rvSent) {
            var pick = (String(lv.sentAt || '') >= String(rv.sentAt || '')) ? lv : rv;
            out[k] = Object.assign({}, pick, { resendCount: Math.max(lv.resendCount || 0, rv.resendCount || 0) });
        } else if (lvSent) {
            out[k] = lv;
        } else if (rvSent) {
            out[k] = rv;
        } else {
            out[k] = (String(lv.sentAt || '') >= String(rv.sentAt || '')) ? lv : rv;
        }
    });
    return out;
}

/** Unión sin duplicados de dos listas append-only, en orden determinista. */
function _fbUnionLog(a, b, stampKeys) {
    var seen = {}, out = [];
    (a || []).concat(b || []).forEach(function(x) {
        if (!x) return;
        var k = stableStringify(x);
        if (seen[k]) return;
        seen[k] = true;
        out.push({ k: k, x: x });
    });
    var stamp = function(o) {
        for (var i = 0; i < stampKeys.length; i++) if (o[stampKeys[i]]) return String(o[stampKeys[i]]);
        return '';
    };
    out.sort(function(p, q) {
        var sp = stamp(p.x), sq = stamp(q.x);
        if (sp !== sq) return sp < sq ? -1 : 1;
        return p.k < q.k ? -1 : (p.k > q.k ? 1 : 0);
    });
    return out.map(function(o) { return o.x; });
}

function _fbVehTime(v) { return String((v && (v.updatedAt || v.lastModified || v.registeredAt)) || ''); }

/**
 * LA definición de cómo se resuelven dos copias del MISMO vehículo (mismo VIN).
 * PURA y SIMÉTRICA: _fbMergeVehicle(a, b) y _fbMergeVehicle(b, a) dan el mismo
 * contenido — si no, dos equipos se quedarían cada uno con "su" versión y se
 * re-empujarían para siempre.
 *
 * Gana la edición más reciente (`updatedAt`); empate → timeline más largo; empate →
 * orden del contenido (arbitrario pero igual en los dos lados). Del perdedor se
 * conserva lo que es bitácora (timeline, returnHistory) y los recibos de envío.
 * Devuelve {vehicle, from: 'local'|'remote'|'equal'}.
 */
function _fbMergeVehicle(local, remote) {
    var sl = stableStringify(local), sr = stableStringify(remote);
    if (sl === sr) return { vehicle: local, from: 'equal' };
    var tl = _fbVehTime(local), tr = _fbVehTime(remote);
    var localWins;
    if (tl !== tr) localWins = tl > tr;
    else {
        var nl = (local.timeline || []).length, nr = (remote.timeline || []).length;
        localWins = (nl !== nr) ? nl > nr : sl > sr;
    }
    var winner = localWins ? local : remote;
    var out = JSON.parse(JSON.stringify(winner));
    if (local.timeline || remote.timeline) out.timeline = _fbUnionLog(local.timeline, remote.timeline, ['timestamp', 'at']);
    if (local.returnHistory || remote.returnHistory) out.returnHistory = _fbUnionLog(local.returnHistory, remote.returnHistory, ['at', 'timestamp', 'date']);
    var pa = _fbMergePaStatus(local.paStatus, remote.paStatus);
    if (pa) out.paStatus = JSON.parse(JSON.stringify(pa));
    // [2.29.1] Nunca asignar undefined: sin fecha en ninguna copia, la propiedad no
    // existía y `out.updatedAt = undefined` la creaba — el SDK rechaza la copia
    // completa cop15/current entera por ese campo (#175).
    if (winner.updatedAt) out.updatedAt = winner.updatedAt;
    if (typeof revContentHash === 'function') out._rev = revContentHash(out);
    return { vehicle: out, from: localWins ? 'local' : 'remote' };
}

/** Huella del dato sincronizable de un módulo (para saber si una fusión cambió algo). */
function _fbModuleFingerprint(col) {
    try {
        if (col === 'cop15') return strHash(stableStringify((db && db.vehicles) || []));
        if (col === 'testplan') return strHash(stableStringify([tpState.testedList, tpState.weeklyPlans, tpState.planData, tpState.rules, tpState.months, tpState.reqFamilies || {}]));
        if (col === 'inventory') return strHash(stableStringify([invState.gases, invState.equipment, invState.fuelTanks, invState.assets, invState.maintActivities, invState.maintLog]));
    } catch (e) {}
    return '';
}

/** ¿`incoming` trae alguna marca de borrado de vehículo que `base` no tenga? PURA. */
function _fbTombsNewTo(base, incoming) {
    if (!incoming || !incoming.length || typeof _vehTombKey !== 'function') return false;
    var have = {};
    (base || []).forEach(function(t) { if (t) have[_vehTombKey(t)] = true; });
    return incoming.some(function(t) { return t && !have[_vehTombKey(t)]; });
}

/**
 * ¿Hay aquí algo que la copia remota NO tiene? Es la ÚNICA condición para
 * re-empujar tras una fusión automática. Se evalúa DESPUÉS de fusionar.
 */
function _fbLocalHasExtras(col, remote) {
    remote = remote || {};
    if (col === 'cop15') {
        // [v24.2] Una marca de borrado que la nube no tiene también hay que subirla: si
        // no, un equipo con código viejo que re-empuje el documento la borra y el
        // vehículo resucita en los demás.
        if (_fbTombsNewTo(remote.deletedVehicles || [], (db && db.deletedVehicles) || [])) return true;
        // 2.0.0: una config manual (o su marca de borrado) que la nube no tiene.
        if (typeof manualConfigsNewTo === 'function' && manualConfigsNewTo(remote.manualConfigs || [], (db && db.manualConfigs) || [])) return true;
        var rByVin = {};
        (remote.vehicles || []).forEach(function(v) { if (v) rByVin[v.vin] = v; });
        return ((db && db.vehicles) || []).some(function(v) {
            var r = rByVin[v.vin];
            return !r || stableStringify(r) !== stableStringify(v);
        });
    }
    if (col === 'testplan') {
        // [2.33.0] Una marca de plan borrado que la nube no tiene se sube (si no, el
        // otro equipo seguiría trayendo el plan de vuelta).
        if (_fbPlanTombsNewTo(remote.deletedPlans || [], tpState.deletedPlans || [])) return true;
        // [2.36.0] Una familia sacada/regresada al conteo aquí que la nube no tiene se sube.
        if (typeof tpReqFamiliesNewTo === 'function' && tpReqFamiliesNewTo(remote.reqFamilies || {}, tpState.reqFamilies || {})) return true;
        var rt = {};
        (remote.testedList || []).forEach(function(t) { rt[_fbTestedKey(t)] = true; });
        if ((tpState.testedList || []).some(function(t) { return !rt[_fbTestedKey(t)]; })) return true;
        var lImp = tpState.planImportDate ? new Date(tpState.planImportDate).getTime() : 0;
        var rImp = remote.planImportDate ? new Date(remote.planImportDate).getTime() : 0;
        if (lImp > rImp) return true;
        var rp = {};
        (remote.weeklyPlans || []).forEach(function(w) { rp[_fbPlanKey(w)] = w; });
        return (tpState.weeklyPlans || []).some(function(lw) {
            var rw = rp[_fbPlanKey(lw)];
            if (!rw) return true;
            if (lw.updatedAt && (!rw.updatedAt || lw.updatedAt > rw.updatedAt)) return true;
            var ri = {};
            (rw.items || []).forEach(function(it) { ri[_fbPlanItemKey(it)] = it; });
            return (lw.items || []).some(function(it) {
                var r = ri[_fbPlanItemKey(it)];
                return !r || (it.completed && !r.completed);
            });
        });
    }
    if (col === 'inventory') {
        var fechas = function(list) { var m = {}; (list || []).forEach(function(r) { if (r && r.date) m[r.date + '|' + (r.auto ? 'a' : 'h')] = true; }); return m; };
        var faltaLectura = function(loc, rem) {
            var rf = fechas(rem && rem.readings);
            return (loc.readings || []).some(function(r) { return r && r.date && !rf[r.date + '|' + (r.auto ? 'a' : 'h')]; });
        };
        var rg = {};
        (remote.gases || []).forEach(function(g) { rg[g.controlNo || g.name] = g; });
        if ((invState.gases || []).some(function(g) { var r = rg[g.controlNo || g.name]; return !r || faltaLectura(g, r); })) return true;
        var re = {};
        (remote.equipment || []).forEach(function(e) { re[_fbEquipKey(e)] = e; });
        if ((invState.equipment || []).some(function(e) {
            var r = re[_fbEquipKey(e)];
            if (!r) return true;
            var rc = {};
            (r.calHistory || []).forEach(function(h) { rc[h.date + '|' + h.certNo] = true; });
            return (e.calHistory || []).some(function(h) { return !rc[h.date + '|' + h.certNo]; });
        })) return true;
        var rtk = {};
        (remote.fuelTanks || []).forEach(function(t) { rtk[t.id || t.name] = t; });
        return (invState.fuelTanks || []).some(function(t) { var r = rtk[t.id || t.name]; return !r || faltaLectura(t, r); });
    }
    return false;
}

/** Re-empuje de UN módulo, diferido y con disyuntor anti-bucle. */
function _fbPushBack(col) {
    var st = _fbLive.pushBack[col] || (_fbLive.pushBack[col] = { times: [], timer: null, tripped: false });
    var now = Date.now();
    st.times = st.times.filter(function(t) { return now - t < FB_PUSHBACK_WINDOW_MS; });
    if (st.times.length >= FB_PUSHBACK_MAX) {
        if (!st.tripped) {
            st.tripped = true;
            console.warn('Firebase: re-empuje de ' + col + ' suspendido — ' + FB_PUSHBACK_MAX +
                ' en ' + (FB_PUSHBACK_WINDOW_MS / 1000) + ' s parece un bucle. Se reanuda solo.');
        }
        return false;
    }
    st.tripped = false;
    if (st.timer) return true;
    st.timer = setTimeout(function() {
        st.timer = null;
        st.times.push(Date.now());
        var state = col === 'cop15' ? db : col === 'testplan' ? tpState : col === 'inventory' ? invState : null;
        if (state && fbSyncModules[col]) fbPush(col, state);
    }, FB_PUSHBACK_DELAY_MS);
    return true;
}

function _fbLiveToast(col) {
    var now = Date.now();
    if (_fbLive.toastAt[col] && now - _fbLive.toastAt[col] < FB_LIVE_TOAST_MS) return;
    _fbLive.toastAt[col] = now;
    var label = { cop15: 'Pruebas', testplan: 'Plan', inventory: 'Consumibles' }[col] || col;
    if (typeof showToast === 'function') showToast('↻ ' + label + ': actualizado desde otro dispositivo', 'info', 3000);
}

function _fbAfterAutoMerge(col) {
    try {
        if (col === 'cop15') {
            refreshAllLists(); updateProgressBar();
            if (typeof cascadeOnRemoteVehicleChange === 'function') cascadeOnRemoteVehicleChange();
        }
        if (col === 'testplan')  { _fbTpUISync(); }
        if (col === 'inventory') { if (typeof invRender === 'function') invRender(); }
    } catch (uiErr) { /* UI refresh is best-effort */ }
}

function fbAutoMerge(col, parsedData, remoteSt) {
    // Build synthetic envelope so we can reuse fbMergeAnalyze
    var synth = { cop15: null, testplan: null, inventory: null };
    synth[col] = parsedData;

    var analysis;
    try { analysis = fbMergeAnalyze(synth); }
    catch(e) { console.warn('fbAutoMerge analyze error (' + col + '):', e); return; }
    if (!analysis[col]) return;

    var before = _fbModuleFingerprint(col);
    var choices = {};
    choices[col] = 'merge_all';
    try { fbMergeExecute(synth, analysis, choices, { quiet: true, noHistory: true, noPush: true }); }
    catch(e) {
        console.warn('fbAutoMerge execute error (' + col + '):', e);
        return;
    }

    if (_fbModuleFingerprint(col) !== before) {
        _fbLiveToast(col);
        _fbAfterAutoMerge(col);
    }
    if (_fbLocalHasExtras(col, parsedData)) _fbPushBack(col);
}

// ── UI Indicator ──
function fbUpdateIndicator() {
    var el = document.getElementById('fb-sync-indicator');
    if (!el) return;

    // [v15.6] Indicador honesto: "conectado" con el dispositivo VACÍO no es
    // estar sincronizado — mostrar aviso ámbar y que el tap dispare la descarga
    var emptyConnected = fbSync.status === 'connected'
        && typeof _fbLocalIsEmpty === 'function' && _fbLocalIsEmpty();
    if (emptyConnected) {
        el.style.color = '#f59e0b';
        el.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f59e0b;margin-right: var(--space-xs);animation:pulse 1s infinite;"></span>' +
            '⚠ sin datos — toca para descargar';
        el.onclick = function() { fbPullAll(true); };
        el.title = 'Este dispositivo no tiene datos del laboratorio. Toca para descargarlos.';
        return;
    }
    // [2.35.0] Revisión al reconectar pendiente: este equipo no sube hasta decidir.
    if (fbSync.review && fbSync.review.state === 'asking') {
        el.style.color = '#f59e0b';
        el.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f59e0b;margin-right: var(--space-xs);animation:pulse 1s infinite;"></span>' +
            '⏸ revisar antes de subir';
        el.onclick = function() { fbReviewOpen(); };
        el.title = 'Este equipo llegó atrasado y trae datos que la nube no tiene. Toca para revisar qué se sube.';
        return;
    }
    // [v15.6] Sin sesión de laboratorio: el tap abre el prompt de contraseña
    if (fbSync.status === 'auth') {
        el.style.color = '#22d3ee';
        el.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22d3ee;margin-right: var(--space-xs);"></span>' +
            '🔑 toca para conectar';
        el.onclick = function() { fbShowAuthPrompt(); };
        el.title = 'Ingresa la contraseña del laboratorio para sincronizar este dispositivo (una sola vez).';
        return;
    }
    // [2.14.0] El toque abre la hoja en lenguaje llano; los ajustes técnicos quedan detrás.
    el.onclick = function() { fbSyncSheetOpen(); };
    el.title = 'Qué falta por subir y qué equipos ven lo mismo';

    var colors = { off: '#475569', connecting: '#f59e0b', connected: '#10b981', syncing: '#3b82f6', error: '#ef4444' };
    var labels = { off: 'Offline', connecting: 'Conectando...', connected: fbSync._useREST ? 'REST Sync' : 'Sync', syncing: 'Syncing...', error: 'Error' };
    var color = colors[fbSync.status] || '#475569';
    var label = labels[fbSync.status] || 'Off';
    el.style.color = color;
    el.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + color + ';margin-right: var(--space-xs);' +
        (fbSync.status === 'syncing' || fbSync.status === 'connecting' ? 'animation:pulse 1s infinite;' : '') +
        '"></span>' + label +
        (fbSync.stationId ? ' <span class="topbar-sync-station">(' + fbSync.stationId + ')</span>' : '') +
        (fbSync.lastSync ? ' ' + fbSync.lastSync.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) : '') +
        (fbSync._liveSync ? ' <span style="color:#22d3ee;font-size: var(--fs-sm);font-weight:700;">● vivo</span>' : '') +
        (function() {
            var n = (typeof fbVehStatus === 'function' && fbVehActive()) ? fbVehStatus().pending : 0;
            return n > 0 ? ' <span class="topbar-sync-pending">⏳ ' + n + ' por subir</span>' : '';
        })() +
        (fbOfflineQueue.length > 0 ? ' <span style="background:#f59e0b;color:#000;padding: var(--space-2xs) var(--space-xs);border-radius: var(--radius-xl);font-size: var(--fs-sm);font-weight:700;">' + fbOfflineQueue.length + ' pendiente' + (fbOfflineQueue.length > 1 ? 's' : '') + '</span>' : '');
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

    modal.innerHTML = '<div style="max-width:480px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);position:relative;color:#e2e8f0;">' +
        '<button onclick="document.getElementById(\x27fbModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">\u2715</button>' +
        '<h3 style="margin:0 0 4px;color:#3b82f6;">Firebase Cloud Sync</h3>' +
        '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-lg);">Sincroniza datos entre multiples dispositivos via Firebase.</div>' +

        // Status
        '<div style="padding: var(--space-md);border:1px solid #1e293b;border-radius: var(--radius-xl);margin-bottom: var(--space-md);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size: var(--fs-sm);">Estado:</span>' +
        '<span style="font-size: var(--fs-sm);font-weight:700;color:' + statusColor + ';">' + statusText + '</span></div>' +
        (fbSync.lastSync ? '<div style="font-size: var(--fs-xs);color:var(--muted);margin-top: var(--space-xs);">Última sync: ' + fbSync.lastSync.toLocaleString('es-MX') + '</div>' : '') +
        (fbSync.lastError ? '<div style="font-size: var(--fs-xs);color:#ef4444;margin-top: var(--space-sm);padding: var(--space-sm) var(--space-sm);background:rgba(239,68,68,0.1);border-radius: var(--radius-md);white-space:pre-line;">' + fbSync.lastError + '</div>' : '') +
        '</div>' +

        // [v15.6.1] Cuenta de dispositivo (login de laboratorio Email/Password)
        (function() {
            var email = null;
            try { var u = firebase.auth().currentUser; if (u && !u.isAnonymous) email = u.email; } catch(e) {}
            return '<div style="padding: var(--space-md);border:1px solid #1e293b;border-radius: var(--radius-xl);margin-bottom: var(--space-md);">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<span style="font-size: var(--fs-sm);">Cuenta de dispositivo:</span>' +
                '<span style="font-size: var(--fs-sm);font-weight:700;color:' + (email ? '#10b981' : '#f59e0b') + ';">' + (email ? escapeHtml(email) : 'No conectado') + '</span></div>' +
                '<button onclick="fbSwitchDeviceAccount()" style="margin-top: var(--space-sm);width:100%;padding: var(--space-sm);background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">' +
                (email ? 'Cambiar cuenta de dispositivo' : 'Conectar con la contraseña del laboratorio') + '</button>' +
                '</div>';
        })() +

        // Quota usage
        (hasConfig && fbSync.enabled ? (function() {
            var qs = fbQuotaStats();
            var wPct = Math.round((qs.writesThisHour / qs.maxWritesHour) * 100);
            var rPct = Math.round((qs.readsThisHour / qs.maxReadsHour) * 100);
            var wColor = wPct > 80 ? '#ef4444' : wPct > 50 ? '#f59e0b' : '#10b981';
            var rColor = rPct > 80 ? '#ef4444' : rPct > 50 ? '#f59e0b' : '#10b981';
            return '<div style="padding: var(--space-md);border:1px solid #1e293b;border-radius: var(--radius-xl);margin-bottom: var(--space-md);">' +
                '<div style="font-size: var(--fs-xs);font-weight:700;color:var(--muted);margin-bottom: var(--space-sm);">Uso de Quota (proteccion de costos)</div>' +
                '<div style="display:flex;gap: var(--space-md);margin-bottom: var(--space-sm);">' +
                '<div style="flex:1;"><div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-2xs);">Escrituras/hora</div>' +
                '<div style="height:6px;background:#1e293b;border-radius: var(--radius-md);overflow:hidden;">' +
                '<div style="width:' + Math.min(wPct, 100) + '%;height:100%;background:' + wColor + ';border-radius: var(--radius-md);transition:width 0.3s;"></div></div>' +
                '<div style="font-size: var(--fs-xs);color:' + wColor + ';margin-top: var(--space-2xs);">' + qs.writesThisHour + '/' + qs.maxWritesHour + '</div></div>' +
                '<div style="flex:1;"><div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-2xs);">Lecturas/hora</div>' +
                '<div style="height:6px;background:#1e293b;border-radius: var(--radius-md);overflow:hidden;">' +
                '<div style="width:' + Math.min(rPct, 100) + '%;height:100%;background:' + rColor + ';border-radius: var(--radius-md);transition:width 0.3s;"></div></div>' +
                '<div style="font-size: var(--fs-xs);color:' + rColor + ';margin-top: var(--space-2xs);">' + qs.readsThisHour + '/' + qs.maxReadsHour + '</div></div></div>' +
                (qs.blockedToday > 0 ? '<div style="font-size: var(--fs-xs);color:#f59e0b;margin-top: var(--space-xs);">Operaciones bloqueadas hoy: ' + qs.blockedToday + '</div>' : '') +
                '<div style="font-size: var(--fs-xs);color:var(--muted);margin-top: var(--space-xs);">Hoy en este equipo: ' + qs.writesToday + '/' + qs.maxWritesDay + ' escrituras, ' + qs.readsToday + '/' + qs.maxReadsDay + ' lecturas</div>' +
                // El tope de arriba es NUESTRO, de protección de costos. El de Firebase
                // es 40x más alto: sin esto parecía que el laboratorio estaba al límite.
                '<div style="font-size: var(--fs-xs);color:var(--muted);margin-top: var(--space-sm);padding: var(--space-sm) var(--space-sm);background:rgba(16,185,129,0.10);border:1px solid rgba(16,185,129,0.25);border-radius: var(--radius-lg);line-height:1.5;">' +
                'Estos topes son <b>nuestros</b>, para proteger el costo. El plan gratuito de Firebase permite <b>' +
                FB_FREE_TIER.writesPerDay.toLocaleString('es-MX') + ' escrituras</b> y <b>' + FB_FREE_TIER.readsPerDay.toLocaleString('es-MX') +
                ' lecturas</b> al día para TODO el laboratorio.<br>Con ' + FB_ASSUMED_DEVICES + ' equipos al tope, se usaría el <b>' +
                Math.round((qs.maxWritesDay * FB_ASSUMED_DEVICES / FB_FREE_TIER.writesPerDay) * 100) + '%</b> de lo gratuito.' +
                '</div>' +
                '</div>';
        })() : '') +

        // Connection test
        (hasConfig ? '<div style="margin-bottom: var(--space-md);"><button onclick="fbTestConnectionUI()" style="width:100%;padding: var(--space-sm);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Probar conexión a Firestore</button></div>' : '') +

        // Espacio de trabajo — SOLO LECTURA.
        // Antes esto era un campo libre rotulado "ID de Estacion (identifica este
        // dispositivo)" con ejemplos tipo LAB-TABLET, así que invitaba a escribir el
        // nombre del equipo. Pero no es una etiqueta: es la RUTA del espacio
        // compartido en Firestore. Al cambiarlo, el dispositivo se iba a un dataset
        // privado — dejaba de ver los datos del laboratorio y de encontrar el token
        // de reportes (que vive en stations/KIA-EMLAB/settings). Para nombrar el
        // equipo está el campo de abajo.
        '<div style="margin-bottom: var(--space-md);">' +
        '<label style="font-size: var(--fs-xs);color:var(--muted);">Espacio de trabajo del laboratorio</label>' +
        '<div style="display:flex;gap: var(--space-sm);margin-top: var(--space-xs);align-items:center;">' +
        '<div style="flex:1;padding: var(--space-sm);background:#0f172a;border:1px solid #334155;border-radius: var(--radius-lg);color:#e2e8f0;font-size:12px;font-family:monospace;">' + (fbSync.stationId || FB_SHARED_WORKSPACE) + '</div>' +
        (fbSync.stationId && fbSync.stationId !== FB_SHARED_WORKSPACE
            ? '<button onclick="fbResetStation()" style="padding: var(--space-sm) var(--space-lg);background:#ef4444;color:#fff;border:none;border-radius: var(--radius-lg);cursor:pointer;font-weight:700;font-size: var(--fs-sm);">Reparar</button>'
            : '') +
        '</div>' +
        (fbSync.stationId && fbSync.stationId !== FB_SHARED_WORKSPACE
            ? '<div style="margin-top: var(--space-sm);padding: var(--space-sm);background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius: var(--radius-lg);font-size:11px;color:#fecaca;line-height:1.5;">'
              + '<b>Este dispositivo está fuera del espacio compartido.</b> No ve los datos del laboratorio ni puede reportar bugs. Toca <b>Reparar</b> para devolverlo a ' + FB_SHARED_WORKSPACE + '.</div>'
            : '<div style="margin-top: var(--space-xs);font-size:11px;color:var(--muted);">Es el mismo para todos los equipos del laboratorio. Para nombrar ESTE equipo usa el campo de abajo.</div>') +
        '</div>' +

        // Device name label
        '<div style="margin-bottom: var(--space-md);">' +
        '<label style="font-size: var(--fs-xs);color:var(--muted);">Nombre del dispositivo (visible en Smart Merge)</label>' +
        '<div style="display:flex;gap: var(--space-sm);margin-top: var(--space-xs);">' +
        '<input id="fb-device-name-input" value="' + (localStorage.getItem('kia_fb_device_name') || '') + '" placeholder="ej: Tablet Jorge, PC Lab" style="flex:1;padding: var(--space-sm);background:#1e293b;border:1px solid #334155;border-radius: var(--radius-lg);color:#e2e8f0;font-size:12px;">' +
        '<button onclick="var v=document.getElementById(\x27fb-device-name-input\x27).value.trim();localStorage.setItem(\x27kia_fb_device_name\x27,v);showToast(\x27Nombre guardado: \x27+v,\x27success\x27);fbUpdateStationMeta();" style="padding: var(--space-sm) var(--space-lg);background:#3b82f6;color:#fff;border:none;border-radius: var(--radius-lg);cursor:pointer;font-weight:700;font-size: var(--fs-sm);">Guardar</button>' +
        '</div></div>' +

        // Module sync toggles
        (hasConfig ? '<div style="padding: var(--space-md);border:1px solid #1e293b;border-radius: var(--radius-xl);margin-bottom: var(--space-md);">' +
        '<div style="font-size: var(--fs-xs);font-weight:700;color:var(--muted);margin-bottom: var(--space-sm);">Modulos a sincronizar</div>' +
        (function() {
            var mods = [{k:'cop15',l:'COP15 Cascade'},{k:'testplan',l:'Test Plan'},{k:'inventory',l:'Inventario'},{k:'panel',l:'Panel'}];
            var h = '';
            mods.forEach(function(m) {
                h += '<label style="display:flex;align-items:center;gap: var(--space-sm);margin-bottom: var(--space-sm);cursor:pointer;">' +
                '<input type="checkbox" ' + (fbSyncModules[m.k] ? 'checked' : '') + ' onchange="fbToggleSyncModule(\'' + m.k + '\',this.checked);this.checked=fbSyncModules[\'' + m.k + '\'];">' +
                '<span style="font-size: var(--fs-sm);">' + m.l + '</span></label>';
            });
            return h;
        })() + '</div>' : '') +

        // Offline queue status
        (fbOfflineQueue.length > 0 ? '<div style="padding: var(--space-md);border:1px solid #854d0e;border-radius: var(--radius-xl);margin-bottom: var(--space-md);background:rgba(245,158,11,0.05);">' +
        '<div style="font-size: var(--fs-sm);font-weight:700;color:#f59e0b;margin-bottom: var(--space-xs);">Cola Offline: ' + fbOfflineQueue.length + ' pendiente' + (fbOfflineQueue.length > 1 ? 's' : '') + '</div>' +
        '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-sm);">Operaciones que fallaron se reintentaran automaticamente.</div>' +
        '<button onclick="fbQueueRetry();setTimeout(fbShowSettings,1000);" style="padding: var(--space-sm) var(--space-md);background:#f59e0b;color:#000;border:none;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);font-weight:700;">Reintentar ahora</button>' +
        '<button onclick="showConfirmDialog({title:\x27⚠️ Vaciar cola\x27,message:\x27Vaciar cola offline?\x27,type:\x27warning\x27,confirmText:\x27Vaciar\x27,cancelText:\x27Cancelar\x27}).then(function(ok){if(ok){fbOfflineQueue=[];fbQueueSave();fbUpdateIndicator();fbShowSettings();}});" style="padding: var(--space-sm) var(--space-md);background:#334155;color:#e2e8f0;border:none;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-xs);margin-left: var(--space-sm);">Vaciar cola</button>' +
        '</div>' : '') +

        // Sync actions
        (fbSync.enabled && fbSync.status !== 'error' ? '<div style="display:flex;gap: var(--space-sm);margin-bottom: var(--space-md);">' +
        '<button onclick="fbPushAll(true)" style="flex:1;padding: var(--space-md);background:#0f766e;color:#fff;border:none;border-radius: var(--radius-xl);cursor:pointer;font-weight:700;font-size: var(--fs-sm);">Subir todo a nube</button>' +
        '<button onclick="showConfirmDialog({title:\x27⚠️ Descargar de nube\x27,message:\x27Esto reemplazara datos locales con los de la nube. Continuar?\x27,type:\x27danger\x27,confirmText:\x27Descargar\x27,cancelText:\x27Cancelar\x27}).then(function(ok){if(ok){fbPullAll(true);}});" style="flex:1;padding: var(--space-md);background:#7c3aed;color:#fff;border:none;border-radius: var(--radius-xl);cursor:pointer;font-weight:700;font-size: var(--fs-sm);">Descargar de nube</button>' +
        '</div>' : '') +

        // ═══ BACKUP SECTION ═══
        (fbSync.enabled && fbSync.status === 'connected' ? '<div style="display:flex;gap: var(--space-sm);margin-bottom: var(--space-md);">' +
        '<button onclick="fbBackupManual()" style="flex:1;padding: var(--space-sm);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Backup Manual</button>' +
        '<button onclick="fbBackupShowList()" style="flex:1;padding: var(--space-sm);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Ver Backups</button>' +
        '</div>' +
        '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-md);margin-top:-8px;">Respaldo diario automático. ' + escapeHtml(fbBackupStatusText()) + '</div>' : '') +

        // ═══ ACTIVITY FEED BUTTON ═══
        (fbSync.enabled && fbSync.status === 'connected' ? '<div style="margin-bottom: var(--space-md);">' +
        '<button onclick="fbActivityShowFeed()" style="width:100%;padding: var(--space-md);background:#6366f1;color:#fff;border:none;border-radius: var(--radius-xl);cursor:pointer;font-weight:700;font-size: var(--fs-sm);">📡 Activity Feed (entre estaciones)</button>' +
        '</div>' : '') +

        // ═══ LIVE SYNC TOGGLE ═══
        (fbSync.enabled && fbSync.status === 'connected' && FB_IS_HTTP_ORIGIN ? '<div style="margin-bottom: var(--space-md);padding: var(--space-md);background:#1e293b;border-radius: var(--radius-xl);border:1px solid ' + (fbSync._liveSync ? '#0e7490' : '#334155') + ';">' +
        '<div style="font-size: var(--fs-sm);font-weight:700;color:' + (fbSync._liveSync ? '#22d3ee' : '#94a3b8') + ';margin-bottom: var(--space-xs);">' + (fbSync._liveSync ? '● Sync en vivo — activo' : 'Sync en vivo — inactivo') + '</div>' +
        '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-sm);">Recibe cambios de otras estaciones en tiempo real. Solo agrega datos nuevos, nunca borra los locales.</div>' +
        '<button onclick="fbSync._liveSync ? fbStopListening() : fbStartListening(); setTimeout(fbShowSettings, 200);" style="width:100%;padding: var(--space-sm);background:' + (fbSync._liveSync ? '#164e63' : '#334155') + ';color:' + (fbSync._liveSync ? '#22d3ee' : '#e2e8f0') + ';border:1px solid ' + (fbSync._liveSync ? '#0e7490' : '#475569') + ';border-radius: var(--radius-lg);cursor:pointer;font-weight:700;font-size: var(--fs-sm);">' +
        (fbSync._liveSync ? '⏹ Detener sync en vivo' : '▶ Iniciar sync en vivo') + '</button>' +
        '</div>' : '') +

        // ═══ SMART MERGE BUTTON ═══
        (fbSync.enabled && fbSync.status === 'connected' ? '<div style="margin-bottom: var(--space-md);padding: var(--space-md);background:#1e293b;border-radius: var(--radius-xl);border:1px solid #334155;">' +
        '<div style="font-size: var(--fs-sm);font-weight:700;color:#f59e0b;margin-bottom: var(--space-sm);">Smart Merge (fusionar desde otra estación)</div>' +
        '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-sm);">Detecta duplicados, muestra diferencias, y te deja elegir que fusionar por modulo.</div>' +
        '<button onclick="fbMergeShowPanel()" style="width:100%;padding: var(--space-md);background:#f59e0b;color:#000;border:none;border-radius: var(--radius-xl);cursor:pointer;font-weight:700;font-size:12px;">Abrir Smart Merge</button>' +
        (mergeHist.length > 0 ? '<div style="display:flex;gap: var(--space-sm);margin-top: var(--space-sm);">' +
        '<button onclick="fbMergeShowHistory()" style="flex:1;padding: var(--space-sm);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Historial (' + mergeHist.length + ')</button>' +
        '<button onclick="fbMergeUndo()" style="flex:1;padding: var(--space-sm);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Deshacer última</button>' +
        '<button onclick="fbMergeExportCSV()" style="flex:1;padding: var(--space-sm);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Exportar CSV</button>' +
        '</div>' : '') +
        '</div>' : '') +

        // Retry — show when status is 'error' OR 'off' (No configurado) with config present
        ((fbSync.status === 'error' || fbSync.status === 'off') && hasConfig ? '<div style="margin-bottom: var(--space-md);"><button onclick="fbInit();setTimeout(fbShowSettings,2500);" style="width:100%;padding: var(--space-md);background:#f59e0b;color:#fff;border:none;border-radius: var(--radius-xl);cursor:pointer;font-weight:700;font-size: var(--fs-sm);">' + (fbSync.status === 'off' ? 'Conectar a Firebase' : 'Reintentar conexión') + '</button></div>' : '') +

        // Setup instructions
        (!hasConfig ? '<div style="padding: var(--space-md);background:#1e293b;border-radius: var(--radius-xl);border:1px solid #334155;"><div style="font-size: var(--fs-sm);font-weight:700;color:#f59e0b;margin-bottom: var(--space-sm);">Setup necesario</div><div style="font-size: var(--fs-xs);color:var(--muted);line-height:1.5;">1. Ve a <strong>console.firebase.google.com</strong><br>2. Crea un proyecto (gratis)<br>3. En <strong>Authentication > Sign-in method</strong>, habilita <strong>Anonymous</strong><br>4. En <strong>Firestore Database</strong>, crea una base de datos<br>5. En <strong>Firestore > Rules</strong>, pon: allow read, write: if true;<br>6. En Project Settings, agrega una Web App<br>7. Copia el firebaseConfig al archivo <strong>js/firebase-sync.js</strong><br>8. Recarga la app</div></div>' : '') +

        // Rules
        (hasConfig ? '<div style="padding: var(--space-md);background:#1e293b;border-radius: var(--radius-xl);border:1px solid #334155;margin-top: var(--space-md);"><div style="font-size: var(--fs-xs);font-weight:700;color:var(--muted);margin-bottom: var(--space-xs);">Configuración requerida en Firebase Console:</div>' +
        '<div style="font-size: var(--fs-xs);color:#f59e0b;margin-bottom: var(--space-sm);line-height:1.5;">1. <strong>Authentication > Sign-in method > Anonymous</strong> → Habilitar<br>2. <strong>Firestore Database > Rules</strong> → Copiar las reglas de abajo:</div>' +
        '<pre style="font-size: var(--fs-xs);color:var(--muted);margin:0;overflow-x:auto;white-space:pre;">rules_version = \'2\';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}</pre><div style="font-size: var(--fs-xs);color:#10b981;margin-top: var(--space-xs);">Firestore > Rules > Editar > Publicar</div></div>' : '') +

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
        // [v23.2] Sin `Authorization` esto devolvía 403 SIEMPRE: `firestore.rules`
        // exige `isLabUser()` (sesión con proveedor 'password') para tocar
        // `stations/`. Las dos ramas REST escritas junto a las reglas
        // (fbPushREST/fbPullREST) sí mandan el token; estas tres, más viejas,
        // nunca se actualizaron.
        _fbIdTokenPromise().then(function(tok) {
        var headers = {};
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
        fetch(url, { headers: headers }).then(function(resp) {
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

    var cols = ['cop15', 'testplan', 'inventory'];

    // REST API fallback
    if (fbSync._useREST || !fbSync.db) {
        var restPending = cols.length;
        var data = {};
        cols.forEach(function(col) {
            var url = 'https://firestore.googleapis.com/v1/projects/' +
                FIREBASE_CONFIG.projectId + '/databases/(default)/documents/stations/' +
                encodeURIComponent(stationId) + '/' + col + '/current?key=' + FIREBASE_CONFIG.apiKey;
            // [v23.2] Faltaba el `Authorization`: 403 seguro contra `firestore.rules`.
            // Y aquí el fallo era SILENCIOSO — el `.catch` sólo hacía `console.warn` y
            // dejaba `data[col] = null`, así que la fusión entre estaciones producía un
            // análisis vacío en vez de un error. Un 403 ahora se anuncia.
            _fbIdTokenPromise().then(function(tok) {
            var headers = {};
            if (tok) headers['Authorization'] = 'Bearer ' + tok;
            return fetch(url, { headers: headers }).then(function(resp) {
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
                if (/HTTP 40[13]/.test(err.message) && typeof showToast === 'function') {
                    showToast('Sin permiso para leer "' + col + '" de ' + stationId +
                              '. Inicia sesión con la contraseña del laboratorio.', 'error');
                }
                data[col] = null;
            });
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

// [v21.1] Une dos series de lecturas SIN perder ninguna. Una fecha aparece una
// sola vez; entre dos filas del mismo día gana la HUMANA sobre la automática, y
// entre dos humanas gana la local (el técnico acaba de capturarla en este equipo).
// Antes el merge de un cilindro en conflicto hacía `invState.gases[idx] = c.remote`,
// tirando a la basura las lecturas capturadas aquí.
// [v24.3] A NIVEL SUPERIOR: vivía declarada DENTRO de fbMergeAnalyze pero la llama
// fbMergeExecute (otra función), así que toda fusión de un cilindro o un tanque en
// conflicto lanzaba ReferenceError — y el live-sync envuelve la fusión en try/catch,
// así que fallaba callada.
function _fbMergeReadings(locales, remotas, campo) {
    var porFecha = {};
    (remotas || []).forEach(function(r) { if (r && r.date) porFecha[r.date] = r; });
    (locales || []).forEach(function(r) {
        if (!r || !r.date) return;
        var otra = porFecha[r.date];
        if (!otra) { porFecha[r.date] = r; return; }
        if (otra.auto && !r.auto) porFecha[r.date] = r;        // humana > automática
        else if (!otra.auto && !r.auto) porFecha[r.date] = r;  // empate: gana la local
    });
    return Object.keys(porFecha).sort().map(function(d) { return porFecha[d]; });
}

// [v24.3] ¿Difieren dos copias de un cilindro/tanque? Por CONTENIDO (stableStringify,
// Firestore devuelve las llaves en otro orden). Antes se comparaba `currentPsi`, campo
// que un cilindro NO tiene (undefined === undefined), así que una lectura nueva, un
// cambio de zona o de días de reposición en otro equipo se tomaban por "duplicado" y
// nunca se fusionaban; en los tanques solo contaba el número de lecturas y el nivel.
function _fbInvItemDiffers(l, r) {
    var ss = (typeof stableStringify === 'function') ? stableStringify : JSON.stringify;
    return ss(l) !== ss(r);
}

// [v24.3] Fusión de dos copias de un cilindro/tanque. PURA y SIMÉTRICA (patrón de
// _fbMergeVehicle, v23.5): los campos vienen de la copia editada más recientemente
// (`updatedAt`); sin fecha o empatadas, de la que ordena mayor por contenido — así los
// dos equipos eligen lo mismo y no se re-empujan. Las lecturas SIEMPRE se unen.
function _fbMergeInvItem(local, remote) {
    var ss = (typeof stableStringify === 'function') ? stableStringify : JSON.stringify;
    var sinSerie = function(o) { var c = Object.assign({}, o); delete c.readings; return c; };
    var lu = (local && local.updatedAt) || '', ru = (remote && remote.updatedAt) || '';
    var base;
    if (lu !== ru) base = lu > ru ? local : remote;
    else base = ss(sinSerie(local)) >= ss(sinSerie(remote)) ? local : remote;
    var otro = base === local ? remote : local;
    var mezcla = Object.assign({}, otro, base);
    mezcla.readings = _fbMergeReadings(local && local.readings, remote && remote.readings);
    // Un equipo con código viejo no conoce `initialPsi`: no se pierde por venir del otro.
    if (!mezcla.initialPsi && otro && otro.initialPsi) mezcla.initialPsi = otro.initialPsi;
    // Objeto nuevo → huella nueva SIN tocar updatedAt (regla de v23.5): si no, el próximo
    // invSave lo tomaría por una edición local y ganaría a todos con la hora de ahora.
    if (typeof revContentHash === 'function') mezcla._rev = revContentHash(mezcla);
    return mezcla;
}

// ── Analyze differences between local and remote ──
function fbMergeAnalyze(remoteData) {
    var analysis = { cop15: null, testplan: null, inventory: null };

    // ── COP15: compare vehicles by VIN ──
    if (remoteData.cop15 && remoteData.cop15.vehicles) {
        var localVINs = {};
        (db.vehicles || []).forEach(function(v) { localVINs[v.vin] = v; });
        var remoteVehicles = remoteData.cop15.vehicles || [];
        var newVehicles = [], duplicateVehicles = [], conflicts = [];
        var paStatusGains = 0; // remote-only PA sends we'll inherit
        var paPhotoOnlyRemote = 0; // remote claims photo captured but local lacks the file (we can't auto-fetch)

        // [v24.2] Un vehículo borrado (aquí o allá) no es "nuevo": no se ofrece ni se agrega.
        var _tombs = typeof vehicleTombstonesUnion === 'function'
            ? vehicleTombstonesUnion(db.deletedVehicles, remoteData.cop15.deletedVehicles) : [];
        remoteVehicles.forEach(function(rv) {
            if (_tombs.length && vehicleIsTombstoned(rv, _tombs)) return;
            if (!localVINs[rv.vin]) {
                newVehicles.push(rv);
                if (rv.paStatus && rv.paStatus.vehicle_released && rv.paStatus.vehicle_released.sent) paStatusGains++;
                if (rv.testData && rv.testData.scannedReportCaptured) paPhotoOnlyRemote++;
            } else {
                var lv = localVINs[rv.vin];
                // Detect paStatus differences (sent flag, sentAt, resendCount)
                var paDiff = stableStringify(lv.paStatus || {}) !== stableStringify(rv.paStatus || {});
                if (paDiff) {
                    var lvSent = !!(lv.paStatus && lv.paStatus.vehicle_released && lv.paStatus.vehicle_released.sent);
                    var rvSent = !!(rv.paStatus && rv.paStatus.vehicle_released && rv.paStatus.vehicle_released.sent);
                    if (rvSent && !lvSent) paStatusGains++;
                }
                // [v23.5] Cualquier diferencia de contenido, comparada SIN depender del
                // orden de las llaves (Firestore las devuelve en otro orden). Antes solo
                // miraba status/timeline/testData/paStatus con JSON.stringify crudo.
                var isDiff = stableStringify(lv) !== stableStringify(rv);
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
            paStatusGains: paStatusGains,
            paPhotoOnlyRemote: paPhotoOnlyRemote,
            remoteTs: remoteData.cop15_ts || null
        };
    }

    // ── TestPlan: comparar testedList por configText + fecha + IDENTIDAD ──
    //
    // v23: la clave era `configText|date` a secas, y eso PIERDE evidencia. Con
    // `vehiclesPerSlot > 1` —justo la configuración que produjo el "40" del issue
    // #126— el laboratorio corre dos unidades de la misma configuración el mismo día;
    // la segunda se clasificaba como duplicada y se descartaba en silencio. La
    // identidad del vehículo (v23 escribe `vehicleId`/`vin`; antes solo el VIN dentro
    // de `note`) es lo que las distingue. Las declaraciones a mano se distinguen por
    // `itemUid`, que también es único.
    if (remoteData.testplan) {
        var _tKey = _fbTestedKey;
        var localTested = {};
        (tpState.testedList || []).forEach(function(t) { localTested[_tKey(t)] = t; });
        var remoteTested = (remoteData.testplan.testedList || []);
        var newTests = [], dupTests = [];

        remoteTested.forEach(function(rt) {
            var key = _tKey(rt);
            if (!localTested[key]) newTests.push(rt);
            else dupTests.push(key);
        });

        // Compare rules
        var localRulesJSON = stableStringify(tpState.rules || []);
        var remoteRulesJSON = stableStringify(remoteData.testplan.rules || []);
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
        // Also detect volume/month changes even when the set of configs matches, so a re-import
        // that only updates numbers is still flagged as a diff.
        if (!planDataDiff && remotePlanLen > 0) {
            var localByDesc = {};
            (tpState.planData || []).forEach(function(c) { localByDesc[c.desc] = c; });
            for (var pi = 0; pi < remoteData.testplan.planData.length; pi++) {
                var rc = remoteData.testplan.planData[pi];
                var lc = localByDesc[rc.desc];
                if (!lc) { planDataDiff = true; break; }
                if ((lc.total || 0) !== (rc.total || 0)) { planDataDiff = true; break; }
                if (JSON.stringify(lc.m || []) !== JSON.stringify(rc.m || [])) { planDataDiff = true; break; }
            }
        }

        // Compare weeklyPlans
        var localWeeklyLen = (tpState.weeklyPlans || []).length;
        var remoteWeeklyLen = (remoteData.testplan.weeklyPlans || []).length;
        var weeklyPlansDiff = localWeeklyLen !== remoteWeeklyLen;
        if (!weeklyPlansDiff && remoteWeeklyLen > 0) {
            // [v23.5] stableStringify: con JSON.stringify crudo esto era SIEMPRE true
            // contra un documento de Firestore (otro orden de llaves) → cada cambio de
            // cualquier equipo se leía como "plan de producción actualizado" (#132).
            weeklyPlansDiff = stableStringify(tpState.weeklyPlans || []) !== stableStringify(remoteData.testplan.weeklyPlans || []);
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
            localPlanImportDate: tpState.planImportDate || null,
            remotePlanImportDate: remoteData.testplan.planImportDate || null,
            localWeeklyCount: localWeeklyLen,
            remoteWeeklyCount: remoteWeeklyLen,
            weeklyPlansDiff: weeklyPlansDiff,
            remoteTs: remoteData.testplan_ts || null
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
                if (_fbInvItemDiffers(lg, rg)) gasConflicts.push({ key: key, local: lg, remote: rg });
                else dupGases.push(key);
            }
        });

        var localEquip = {};
        ((invState.equipment || []).forEach(function(e) { localEquip[_fbEquipKey(e)] = e; }));
        var remoteEquip = remoteData.inventory.equipment || [];
        var newEquip = [], dupEquip = [], equipConflicts = [];

        remoteEquip.forEach(function(re) {
            var key = _fbEquipKey(re);
            var le = localEquip[key];
            if (!le) { newEquip.push(re); return; }
            // v16.4: detectar cambios de calibración en instrumentos ya existentes (antes solo
            // se detectaban altas nuevas — una calibración registrada en otro dispositivo nunca
            // se traía de vuelta).
            var isDiff = le.lastCalDate !== re.lastCalDate || le.nextCalDate !== re.nextCalDate || ((le.calHistory || []).length !== (re.calHistory || []).length);
            if (isDiff) equipConflicts.push({ key: key, local: le, remote: re });
            else dupEquip.push(key);
        });

        // v16.4: COP15-F11 — equipos padre, catálogo de mantenimiento y su historial de ejecución
        var localAssets = {};
        (invState.assets || []).forEach(function(a) { localAssets[a.id] = a; });
        var remoteAssets = remoteData.inventory.assets || [];
        var newAssets = [], assetUpdates = [];
        remoteAssets.forEach(function(ra) {
            var la = localAssets[ra.id];
            if (!la) { newAssets.push(ra); return; }
            if ((ra.updatedAt || '') > (la.updatedAt || '')) assetUpdates.push(ra);
        });

        var localActs = {};
        (invState.maintActivities || []).forEach(function(a) { localActs[a.id] = a; });
        var remoteActs = remoteData.inventory.maintActivities || [];
        var newMaintActivities = [], maintActivityUpdates = [];
        remoteActs.forEach(function(ra) {
            var la = localActs[ra.id];
            if (!la) { newMaintActivities.push(ra); return; }
            if ((ra.updatedAt || '') > (la.updatedAt || '')) maintActivityUpdates.push(ra);
        });

        var localLogIds = {};
        (invState.maintLog || []).forEach(function(l) { if (l && l.id) localLogIds[l.id] = true; });
        var newMaintLog = (remoteData.inventory.maintLog || []).filter(function(l) { return l && l.id && !localLogIds[l.id]; });

        // [v21.1] COMBUSTIBLE. `fuelTanks` no aparecía NI UNA VEZ en este archivo, así que
        // el nivel de gasolina nunca viajaba entre dispositivos: cada equipo llevaba el suyo,
        // y en la ruta de seed el local se reemplazaba entero. Se empata por id (y por nombre
        // para los tanques sembrados antes de que existieran los ids estables).
        var localTanks = {};
        (invState.fuelTanks || []).forEach(function(t) { if (t) localTanks[t.id || t.name] = t; });
        var remoteTanks = remoteData.inventory.fuelTanks || [];
        var newFuelTanks = [], fuelUpdates = [];
        remoteTanks.forEach(function(rt) {
            if (!rt) return;
            var lt = localTanks[rt.id || rt.name];
            if (!lt) { newFuelTanks.push(rt); return; }
            // Hay conflicto si difieren las series o el nivel: se resuelve uniendo lecturas.
            if (_fbInvItemDiffers(lt, rt)) fuelUpdates.push({ key: rt.id || rt.name, local: lt, remote: rt });
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
            equipConflicts: equipConflicts,
            newAssets: newAssets,
            assetUpdates: assetUpdates,
            newMaintActivities: newMaintActivities,
            maintActivityUpdates: maintActivityUpdates,
            newMaintLog: newMaintLog,
            newFuelTanks: newFuelTanks,
            fuelUpdates: fuelUpdates,
            remoteTs: remoteData.inventory_ts || null
        };
    }

    return analysis;
}

// ── Execute merge for selected modules ──
function fbMergeExecute(remoteData, analysis, choices, opts) {
    // [v23.5] opts = {quiet, noHistory, noPush}. El live-sync y el pull automático
    // llaman con las tres: antes CADA cambio remoto (1) copiaba db+tpState+invState
    // enteros para el "deshacer", (2) los escribía a la bitácora de fusiones, (3)
    // mostraba "Merge completado" y (4) hacía fbPushAll() de los TRES módulos — que el
    // otro equipo recibía como cambio remoto y repetía. Ese era el bucle del #132.
    opts = opts || {};
    // Save snapshot for undo BEFORE merging
    // (v15.6: se quitó raState del snapshot — no estaba definido y crasheaba el merge manual)
    var snapshot = opts.noHistory ? null : {
        cop15: JSON.parse(JSON.stringify(db)),
        testplan: JSON.parse(JSON.stringify(tpState)),
        inventory: JSON.parse(JSON.stringify(invState))
    };

    var merged = [];

    // COP15
    if (choices.cop15 && analysis.cop15) {
        // [v24.2] Las marcas de borrado de los dos lados se unen SIEMPRE, sea cual sea la
        // opción ('replace' reasigna db y perdería las locales).
        var _localTombs = (db && db.deletedVehicles) || [];
        var _localManual = (db && db.manualConfigs) || [];   // 2.0.0, mismo motivo
        // Helper: take the union of two paStatus objects, "sent=true" always wins.
        // Preserves PA send history across stations so we don't double-send or lose the receipt.
        function _mergePaStatus(localPa, remotePa) { return _fbMergePaStatus(localPa, remotePa); }

        if (choices.cop15 === 'new') {
            // Add only new vehicles
            analysis.cop15.newItems.forEach(function(v) { db.vehicles.push(v); });
            merged.push('COP15: +' + analysis.cop15.newItems.length + ' vehículos nuevos');
        } else if (choices.cop15 === 'replace') {
            // Even when fully replacing, preserve any local "sent to PA" receipts so we don't
            // accidentally re-send vehicles that were already pushed from this station.
            var remoteDb = remoteData.cop15;
            if (remoteDb && remoteDb.vehicles) {
                var localByVin = {};
                (db.vehicles || []).forEach(function(v){ localByVin[v.vin] = v; });
                remoteDb.vehicles.forEach(function(rv) {
                    var lv = localByVin[rv.vin];
                    if (lv) {
                        var mergedPa = _mergePaStatus(lv.paStatus, rv.paStatus);
                        if (mergedPa) rv.paStatus = mergedPa;
                    }
                });
            }
            db = remoteDb;
            merged.push('COP15: reemplazado con version remota (paStatus preservado)');
        } else if (choices.cop15 === 'merge_all') {
            // Add new + for conflicts keep the richer record but always preserve PA send receipts
            analysis.cop15.newItems.forEach(function(v) { db.vehicles.push(v); });
            var paPreserved = 0;
            // [v23.5] Gana la EDICIÓN más reciente (`updatedAt`, ver _fbMergeVehicle),
            // no el timeline más largo con empate a favor de lo local.
            analysis.cop15.conflicts.forEach(function(c) {
                var idx = db.vehicles.findIndex(function(v) { return v.vin === c.vin; });
                if (idx >= 0) {
                    var localSent = !!(c.local.paStatus && c.local.paStatus.vehicle_released && c.local.paStatus.vehicle_released.sent);
                    var res = _fbMergeVehicle(db.vehicles[idx], c.remote);
                    var winnerSent = !!(res.vehicle.paStatus && res.vehicle.paStatus.vehicle_released && res.vehicle.paStatus.vehicle_released.sent);
                    if (localSent && winnerSent && res.from === 'remote') paPreserved++;
                    db.vehicles[idx] = res.vehicle;
                }
            });
            var summary = 'COP15: +' + analysis.cop15.newItems.length + ' nuevos, ' + analysis.cop15.conflicts.length + ' conflictos resueltos';
            if (paPreserved > 0) summary += ', ' + paPreserved + ' envío(s) PA preservados';
            if (analysis.cop15.paStatusGains > 0) summary += ', ' + analysis.cop15.paStatusGains + ' envío(s) PA heredados';
            merged.push(summary);
        }
        if (typeof vehicleTombstonesUnion === 'function') {
            var _remoteTombs = (remoteData.cop15 && remoteData.cop15.deletedVehicles) || [];
            var _tombs = vehicleTombstonesUnion(_localTombs, _remoteTombs);
            if (_tombs.length) db.deletedVehicles = _tombs;
        }
        if (typeof manualConfigsUnion === 'function') {
            var _mc = manualConfigsUnion(_localManual, (remoteData.cop15 && remoteData.cop15.manualConfigs) || []);
            if (_mc.length) db.manualConfigs = _mc;
        }
        // [v17.12] Un remoto puede traer un vehículo cuyo id ya usa uno local (los ids
        // viejos eran un contador por dispositivo): reparar ANTES de guardar y refrescar.
        // (v24.2: también retira lo marcado como borrado — vehicleTombstonesApply.)
        if (typeof dedupeVehicleIds === 'function') dedupeVehicleIds();
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
            // Merge planData: if remote is newer (or local is empty), replace entirely and carry
            // over the import metadata so the dashboard reflects the latest import. Otherwise do
            // an additive merge by `desc` without stomping local volumes.
            if (analysis.testplan.planDataDiff && (remoteData.testplan.planData || []).length > 0) {
                var remoteImportMs = remoteData.testplan.planImportDate
                    ? new Date(remoteData.testplan.planImportDate).getTime() : 0;
                var localImportMs = tpState.planImportDate
                    ? new Date(tpState.planImportDate).getTime() : 0;
                var remoteIsNewer = remoteImportMs > 0 && remoteImportMs > localImportMs;
                if ((tpState.planData || []).length === 0 || remoteIsNewer) {
                    tpState.planData = remoteData.testplan.planData;
                    if (remoteData.testplan.planImportDate) tpState.planImportDate = remoteData.testplan.planImportDate;
                    if (remoteData.testplan.lastDiff) tpState.lastDiff = remoteData.testplan.lastDiff;
                    if (remoteData.testplan.lastDiffDate) tpState.lastDiffDate = remoteData.testplan.lastDiffDate;
                    // [v15.6] Los meses dinámicos van con el plan: las columnas de
                    // volumen dependen de esos labels — sin esto, un CSV con un mes
                    // nuevo llegaba a las demás estaciones con columnas desalineadas
                    if (remoteData.testplan.months && remoteData.testplan.months.length) {
                        tpState.months = remoteData.testplan.months;
                    }
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
                    // v20 — ANTES esto mezclaba por `w.week`, un campo que NINGÚN generador
                    // escribe (todos escriben id/weekDate/created). O sea `localWeekMap[undefined]`:
                    // todos los planes locales colapsaban en un solo bucket y los items remotos
                    // se injertaban en un plan local arbitrario. Ahora se empata por la identidad
                    // estable del plan, con cadena de respaldo para los que vengan de código viejo.
                    var _wkKey = function(w) {
                        if (!w) return '';
                        if (typeof tpPlanId === 'function') return tpPlanId(w);
                        return w.planId || w.week || w.weekDate || String(w.created || w.id || '');
                    };
                    var localWeekMap = {};
                    (tpState.weeklyPlans || []).forEach(function(w, i) { localWeekMap[_wkKey(w)] = i; });
                    (remoteData.testplan.weeklyPlans || []).forEach(function(rw) {
                        var k = _wkKey(rw);
                        if (!k || localWeekMap[k] === undefined) {
                            tpState.weeklyPlans.push(rw);
                            if (k) localWeekMap[k] = tpState.weeklyPlans.length - 1;
                        } else {
                            var lw = tpState.weeklyPlans[localWeekMap[k]];
                            if (!lw.items) lw.items = [];
                            // [v23.5] Si el plan remoto se editó DESPUÉS (`updatedAt`, lo sella
                            // stampRevisions en tpSave), sus campos de plan y sus versiones de cada fila
                            // mandan: así viaja un "mover al jueves" o un aceptar. Sin fechas
                            // (planes viejos) se conserva lo local, como antes.
                            var remoteNewer = !!(rw.updatedAt && (!lw.updatedAt || rw.updatedAt > lw.updatedAt));
                            if (remoteNewer) {
                                Object.keys(rw).forEach(function(f) { if (f !== 'items') lw[f] = rw[f]; });
                            }
                            // Empatar por identidad (`uid`, v23) y, en filas viejas, por
                            // desc + día: con desc + día, MOVER una fila la duplicaba.
                            var idxByKey = {};
                            lw.items.forEach(function(item, i) { idxByKey[_fbPlanItemKey(item)] = i; });
                            (rw.items || []).forEach(function(item) {
                                var ik = _fbPlanItemKey(item);
                                if (idxByKey[ik] === undefined) { lw.items.push(item); idxByKey[ik] = lw.items.length - 1; return; }
                                var mine = lw.items[idxByKey[ik]];
                                if (remoteNewer) {
                                    var nuevo = Object.assign({}, item);
                                    // Perder una palomita en un merge es justo lo que no puede pasar.
                                    if (mine.completed && !nuevo.completed) {
                                        nuevo.completed = true;
                                        if (mine.completedDate && !nuevo.completedDate) nuevo.completedDate = mine.completedDate;
                                    }
                                    lw.items[idxByKey[ik]] = nuevo;
                                } else if (item.completed && !mine.completed) {
                                    lw.items[idxByKey[ik]] = item;
                                }
                            });
                            // La fusión NO es una edición de este equipo: re-sellar la huella
                            // sin mover `updatedAt`, o el próximo tpSave la tomaría por una
                            // edición local "más nueva" y la re-empujaría.
                            if (typeof revContentHash === 'function') lw._rev = revContentHash(lw);
                        }
                    });
                }
                // v23: tras unir los dos lados, quitar las propuestas que quedaron por
                // duplicado. Cada dispositivo generaba su propio plan (con su propio
                // `id`), así que ninguno reconocía al del otro y una semana acumulaba N
                // copias del mismo contenido — el "montón de planes que yo no hice".
                // Solo se van las IDÉNTICAS al plan vigente y sin trabajo encima.
                try { if (typeof tpDedupeWeeklyPlans === 'function') tpDedupeWeeklyPlans({ skipSave: true }); }
                catch (e) { console.warn('tpDedupeWeeklyPlans:', e); }
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
        // [2.33.0] Las marcas de planes borrados se UNEN siempre (en cualquier elección) y
        // se aplican: un plan borrado en cualquier equipo no vuelve por la fusión aditiva.
        if (typeof tpPlanTombstonesUnion === 'function') {
            tpState.deletedPlans = tpPlanTombstonesUnion(tpState.deletedPlans, (remoteData.testplan || {}).deletedPlans);
            if (typeof _tpNormalizePlans === 'function') _tpNormalizePlans();
        }
        // [2.36.0] Familias fuera del conteo: se UNEN siempre, como las marcas de planes.
        if (typeof tpReqFamiliesUnion === 'function') {
            tpState.reqFamilies = tpReqFamiliesUnion(tpState.reqFamilies, (remoteData.testplan || {}).reqFamilies);
            if (typeof tpInvalidateCache === 'function') tpInvalidateCache();
        }
        localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState));
        _fbTpUISync();
    }

    // Inventory
    if (choices.inventory && analysis.inventory) {
        if (!invState.assets) invState.assets = [];
        if (!invState.maintActivities) invState.maintActivities = [];
        if (!invState.maintLog) invState.maintLog = [];
        // Fusiona el historial de calibración de un instrumento ya existente en ambos lados
        // (unión por fecha+certificado) y se queda con los campos del lado calibrado más recientemente.
        function _fbMergeEquipConflict(c) {
            var idx = invState.equipment.findIndex(function(e) { return _fbEquipKey(e) === c.key; });
            if (idx < 0) return;
            var newerSide = (c.local.lastCalDate || '') >= (c.remote.lastCalDate || '') ? c.local : c.remote;
            var mergedEq = Object.assign({}, c.local, newerSide);
            var histByKey = {};
            (c.local.calHistory || []).forEach(function(h) { histByKey[h.date + '|' + h.certNo] = h; });
            (c.remote.calHistory || []).forEach(function(h) { histByKey[h.date + '|' + h.certNo] = h; });
            mergedEq.calHistory = Object.keys(histByKey).map(function(k) { return histByKey[k]; }).sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
            invState.equipment[idx] = mergedEq;
        }

        if (choices.inventory === 'new') {
            if (!invState.gases) invState.gases = [];
            if (!invState.equipment) invState.equipment = [];
            analysis.inventory.newGases.forEach(function(g) { invState.gases.push(g); });
            analysis.inventory.newEquip.forEach(function(e) { invState.equipment.push(e); });
            analysis.inventory.newAssets.forEach(function(a) { invState.assets.push(a); });
            analysis.inventory.newMaintActivities.forEach(function(a) { invState.maintActivities.push(a); });
            analysis.inventory.newMaintLog.forEach(function(l) { invState.maintLog.push(l); });
            if (!invState.fuelTanks) invState.fuelTanks = [];
            (analysis.inventory.newFuelTanks || []).forEach(function(t) { invState.fuelTanks.push(t); });
            merged.push('Inventory: +' + analysis.inventory.newGases.length + ' gases, +' +
                        analysis.inventory.newEquip.length + ' equipos, +' +
                        (analysis.inventory.newFuelTanks || []).length + ' tanques');
        } else if (choices.inventory === 'replace') {
            invState = remoteData.inventory;
            merged.push('Inventory: reemplazado');
        } else if (choices.inventory === 'merge_all') {
            if (!invState.gases) invState.gases = [];
            if (!invState.equipment) invState.equipment = [];
            analysis.inventory.newGases.forEach(function(g) { invState.gases.push(g); });
            analysis.inventory.newEquip.forEach(function(e) { invState.equipment.push(e); });
            // v21.1: el conflicto de un cilindro ya NO reemplaza el objeto entero — eso
            // tiraba las lecturas capturadas en este dispositivo. Se toma el remoto como
            // base pero las series se UNEN, y se conserva la nominal local si el remoto
            // no la trae (un equipo con código viejo no conoce `initialPsi`).
            analysis.inventory.gasConflicts.forEach(function(c) {
                var idx = invState.gases.findIndex(function(g) { return (g.controlNo || g.name) === c.key; });
                if (idx < 0) return;
                invState.gases[idx] = _fbMergeInvItem(invState.gases[idx], c.remote || {});
            });
            analysis.inventory.equipConflicts.forEach(_fbMergeEquipConflict);
            analysis.inventory.newAssets.forEach(function(a) { invState.assets.push(a); });
            analysis.inventory.assetUpdates.forEach(function(a) {
                var idx = invState.assets.findIndex(function(x) { return x.id === a.id; });
                if (idx >= 0) invState.assets[idx] = a;
            });
            analysis.inventory.newMaintActivities.forEach(function(a) { invState.maintActivities.push(a); });
            analysis.inventory.maintActivityUpdates.forEach(function(a) {
                var idx = invState.maintActivities.findIndex(function(x) { return x.id === a.id; });
                if (idx >= 0) invState.maintActivities[idx] = a;
            });
            analysis.inventory.newMaintLog.forEach(function(l) { invState.maintLog.push(l); });
            // v21.1: combustible, con la misma unión de series que los cilindros.
            if (!invState.fuelTanks) invState.fuelTanks = [];
            (analysis.inventory.newFuelTanks || []).forEach(function(t) { invState.fuelTanks.push(t); });
            (analysis.inventory.fuelUpdates || []).forEach(function(c) {
                var idx = invState.fuelTanks.findIndex(function(t) { return (t.id || t.name) === c.key; });
                if (idx < 0) return;
                var mezcla = _fbMergeInvItem(invState.fuelTanks[idx], c.remote || {});
                // El nivel autoritativo sale de la última lectura de la serie ya unida:
                // si no, podría quedar apuntando a un valor que ninguna lectura respalda.
                var ult = mezcla.readings.length ? mezcla.readings[mezcla.readings.length - 1] : null;
                if (ult && typeof ult.level === 'number') mezcla.currentLevel = ult.level;
                if (typeof revContentHash === 'function') mezcla._rev = revContentHash(mezcla);
                invState.fuelTanks[idx] = mezcla;
            });
            merged.push('Inventory: merge completo');
        }
        if (typeof _invRevInit === 'function') _invRevInit();
        localStorage.setItem('kia_lab_inventory', JSON.stringify(invState));
        if (typeof invRender === 'function') invRender();
    }

    // Record in merge history
    if (merged.length > 0 && !opts.noHistory) {
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
        hist = _fbMergeTrimHistory(hist);
        try {
            localStorage.setItem(FB_MERGE_HISTORY_KEY, JSON.stringify(hist));
        } catch(e) {
            // Sin espacio, la bitácora es lo primero que se sacrifica: nunca a costa
            // de que la fusión en sí no se pueda guardar.
            console.warn('fbMerge: no cupo la bitácora de fusión', e);
            try { localStorage.setItem(FB_MERGE_HISTORY_KEY, JSON.stringify([record])); } catch(e2) {}
        }

    }
    if (merged.length > 0) {
        if (!opts.quiet) showToast('Merge completado: ' + merged.join(' | '), 'success');
        // Push merged data to Firebase
        if (!opts.noPush) fbPushAll();
    }

    return merged;
}

// ── Merge History ──
// Cada registro llevaba un `snapshot` con una copia COMPLETA de db + tpState +
// invState (~500 KB con datos reales) y se guardaban los últimos 20: hasta 10 MB
// en una sola clave, contra un presupuesto total de 5 MB. Se llenaba el
// almacenamiento y el laboratorio no podía ni liberar un vehículo.
//
// `fbMergeUndo` solo lee `hist[hist.length - 1].snapshot`, así que los snapshots
// de los registros anteriores eran peso muerto que NADIE podía leer. Se conserva
// el del último (deshacer sigue funcionando) y los demás quedan como bitácora.
var FB_MERGE_HISTORY_MAX = 20;      // registros de bitácora (sin snapshot, ~200 B c/u)
var FB_MERGE_SNAPSHOT_KEEP = 1;     // cuántos snapshots completos se conservan

/** Deja a lo más FB_MERGE_SNAPSHOT_KEEP snapshots (los más recientes) y capa la bitácora. */
function _fbMergeTrimHistory(hist) {
    if (!Array.isArray(hist)) return [];
    if (hist.length > FB_MERGE_HISTORY_MAX) hist = hist.slice(-FB_MERGE_HISTORY_MAX);
    var cut = hist.length - FB_MERGE_SNAPSHOT_KEEP;
    for (var i = 0; i < cut; i++) {
        if (hist[i] && hist[i].snapshot) {
            delete hist[i].snapshot;
            hist[i].snapshotPurged = true;   // la UI puede decir "ya no se puede deshacer"
        }
    }
    return hist;
}

function fbMergeGetHistory() {
    try { return JSON.parse(localStorage.getItem(FB_MERGE_HISTORY_KEY)) || []; }
    catch(e) { return []; }
}

/**
 * Recorta la bitácora ya guardada. Corre una vez al arrancar: es lo que libera el
 * espacio en los dispositivos que ya venían con 20 snapshots acumulados.
 * @returns {number} bytes liberados
 */
function fbMergePurgeOldSnapshots() {
    var raw = null;
    try { raw = localStorage.getItem(FB_MERGE_HISTORY_KEY); } catch(e) { return 0; }
    if (!raw) return 0;
    var before = raw.length;
    var hist;
    try { hist = JSON.parse(raw) || []; } catch(e) { return 0; }
    var trimmed = _fbMergeTrimHistory(hist);
    var out = JSON.stringify(trimmed);
    if (out.length >= before) return 0;
    try { localStorage.setItem(FB_MERGE_HISTORY_KEY, out); } catch(e) { return 0; }
    var freed = before - out.length;
    if (freed > 51200 && typeof auditLog === 'function') {
        auditLog('sistema', 'merge_history_purge', { type: 'sistema', id: 'kia_merge_history', label: 'Historial de fusiones' },
            'Liberados ~' + Math.round(freed / 1024) + ' KB de respaldos de fusión que ya no se podían usar');
    }
    return freed;
}

// ── Undo last merge ──
function fbMergeUndo() {
    if (typeof authRequire === 'function' && !authRequire('data.sync_admin', 'deshacer una fusión')) return;
    var hist = fbMergeGetHistory();
    if (hist.length === 0) { showToast('No hay fusiones para deshacer', 'info'); return; }

    var last = hist[hist.length - 1];
    if (!last.snapshot) {
        // Solo se conserva el respaldo de la fusión más reciente (ver
        // _fbMergeTrimHistory): 20 copias completas llenaban el almacenamiento.
        showToast('Esa fusión ya no se puede deshacer — solo se guarda el respaldo de la más reciente.', 'warning');
        return;
    }
    showConfirmDialog({ title: '⚠️ Deshacer fusión', message: 'Deshacer fusion del ' + new Date(last.timestamp).toLocaleString('es-MX') + '?\n\nAcciones: ' + last.actions.join(', ') + '\n\nSe restauraran los datos previos a la fusion.', type: 'warning', confirmText: 'Deshacer', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;

        // Restore snapshot
        if (last.snapshot) {
            if (last.snapshot.cop15) {
                db = last.snapshot.cop15;
                if (typeof dedupeVehicleIds === 'function') dedupeVehicleIds();
                localStorage.setItem('kia_db_v11', JSON.stringify(db));
                refreshAllLists();
            }
            if (last.snapshot.testplan) {
                tpState = last.snapshot.testplan;
                localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState));
                _fbTpUISync();
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
    });
}

// ── Show merge history ──
function fbMergeShowHistory() {
    var hist = fbMergeGetHistory();
    var modal = document.getElementById('fbModal');
    if (!modal) return;

    var html = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);position:relative;color:#e2e8f0;">';
    html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">\u2715</button>';
    html += '<h3 style="margin:0 0 12px;color:#f59e0b;">Historial de Fusiones</h3>';

    if (hist.length === 0) {
        html += '<div style="text-align:center;padding: var(--space-xl);color:var(--muted);">Sin historial de fusiones.</div>';
    } else {
        hist.slice().reverse().forEach(function(r, i) {
            var date = new Date(r.timestamp).toLocaleString('es-MX');
            html += '<div style="padding: var(--space-md);border:1px solid #1e293b;border-radius: var(--radius-xl);margin-bottom: var(--space-sm);' + (i === 0 ? 'border-color:#f59e0b;' : '') + '">';
            html += '<div style="display:flex;justify-content:space-between;font-size: var(--fs-sm);">';
            html += '<span style="font-weight:700;">' + r.fromStation + ' \u2192 ' + r.toStation + '</span>';
            html += '<span style="color:var(--muted);">' + date + '</span></div>';
            r.actions.forEach(function(a) {
                html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-top: var(--space-2xs);">\u2022 ' + a + '</div>';
            });
            html += '</div>';
        });
    }

    html += '<div style="display:flex;gap: var(--space-sm);margin-top: var(--space-md);">';
    html += '<button onclick="fbShowSettings()" style="flex:1;padding: var(--space-sm);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Volver</button>';
    if (hist.length > 0) {
        html += '<button onclick="fbMergeExportCSV()" style="flex:1;padding: var(--space-sm);background:#0f766e;color:#fff;border:none;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Exportar CSV</button>';
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

    modal.innerHTML = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);position:relative;color:#e2e8f0;">' +
        '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">\u2715</button>' +
        '<h3 style="margin:0 0 4px;color:#f59e0b;">Smart Merge</h3>' +
        '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-lg);">Fusiona datos de otra estación a la tuya (' + fbSync.stationId + ')</div>' +
        '<div style="text-align:center;padding: var(--space-xl);color:var(--muted);"><div style="font-size:24px;margin-bottom: var(--space-sm);">Cargando estaciones...</div></div>' +
        '</div>';

    fbMergeListStations(function(stations) {
        var others = stations.filter(function(s) { return s.id !== fbSync.stationId; });

        var html = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);position:relative;color:#e2e8f0;">';
        html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">\u2715</button>';
        html += '<h3 style="margin:0 0 4px;color:#f59e0b;">Smart Merge</h3>';
        html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-lg);">Fusiona datos de otra estación a <strong>' + fbSync.stationId + '</strong></div>';

        // Show all stations info
        if (stations.length > 0) {
            html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-md);">' + stations.length + ' estacion(es) en Firebase:</div>';
        }

        if (others.length === 0) {
            html += '<div style="text-align:center;padding: var(--space-xl);color:var(--muted);">No hay otras estaciones en Firebase. Sube datos desde otro dispositivo primero.</div>';
        } else {
            html += '<div style="font-size: var(--fs-sm);color:var(--muted);margin-bottom: var(--space-sm);">Selecciona la estación de origen:</div>';
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
                html += '<button onclick="fbMergeLoadAndAnalyze(\x27' + s.id + '\x27)" style="display:block;width:100%;padding: var(--space-md);margin-bottom: var(--space-sm);background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius: var(--radius-xl);cursor:pointer;font-size:12px;text-align:left;">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;">' +
                    '<span><span style="color:#f59e0b;margin-right: var(--space-sm);">\u25B6</span><strong>' + s.id + '</strong></span>' +
                    (deviceLabel ? '<span style="background:#334155;color:#94a3b8;padding: var(--space-2xs) var(--space-sm);border-radius: var(--radius-xl);font-size: var(--fs-xs);font-weight:400;">' + deviceLabel + '</span>' : '') +
                    '</div>' +
                    (lastPushLabel ? '<div style="font-size: var(--fs-xs);color:var(--muted);margin-top: var(--space-xs);margin-left: var(--space-xl);">Última sync: ' + lastPushLabel + '</div>' : '') +
                    '</button>';
            });
        }

        // Also show current station for reference
        var mySt = stations.filter(function(s) { return s.id === fbSync.stationId; })[0];
        if (mySt) {
            var myLabel = mySt.deviceName && mySt.deviceName !== mySt.id ? ' (' + mySt.deviceName + ')' : '';
            html += '<div style="margin-top: var(--space-sm);padding: var(--space-sm);background:#0f2a1a;border:1px solid #134e2a;border-radius: var(--radius-lg);font-size: var(--fs-xs);color:#4ade80;">' +
                'Tu estacion: <strong>' + mySt.id + '</strong>' + myLabel + '</div>';
        }

        html += '<button onclick="fbShowSettings()" style="width:100%;padding: var(--space-sm);margin-top: var(--space-md);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Volver</button>';
        html += '</div>';
        modal.innerHTML = html;
    });
}

function fbMergeLoadAndAnalyze(remoteStationId) {
    window._fbMergeRemoteId = remoteStationId;
    var modal = document.getElementById('fbModal');
    if (!modal) return;

    modal.innerHTML = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);color:#e2e8f0;text-align:center;">' +
        '<div style="font-size:24px;margin-bottom: var(--space-sm);">Cargando datos de ' + remoteStationId + '...</div>' +
        '<div style="color:var(--muted);">Analizando diferencias...</div></div>';

    fbMergeLoadStation(remoteStationId, function(remoteData) {
        if (!remoteData) {
            modal.innerHTML = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);color:#e2e8f0;text-align:center;">' +
                '<div style="color:#ef4444;margin-bottom: var(--space-md);">Error cargando datos de ' + remoteStationId + '</div>' +
                '<button onclick="fbMergeShowPanel()" style="padding: var(--space-sm) var(--space-xl);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;">Volver</button></div>';
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

    var html = '<div style="max-width:520px;margin:20px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);position:relative;color:#e2e8f0;">';
    html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">\u2715</button>';
    html += '<h3 style="margin:0 0 2px;color:#f59e0b;">Diferencias: ' + remoteStationId + ' \u2192 ' + fbSync.stationId + '</h3>';
    html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-lg);">Selecciona como fusionar cada modulo</div>';

    // ── COP15 ──
    var c = analysis.cop15;
    if (c) {
        var hasChanges = c.newItems.length > 0 || c.conflicts.length > 0;
        html += '<div style="padding: var(--space-md);border:1px solid #1e293b;border-radius: var(--radius-xl);margin-bottom: var(--space-sm);' + (hasChanges ? 'border-color:#f59e0b;' : '') + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom: var(--space-sm);">';
        html += '<span style="font-weight:700;font-size:12px;">COP15 Cascade</span>';
        html += '<span style="font-size: var(--fs-xs);color:var(--muted);">Local: ' + c.localCount + ' | Remoto: ' + c.remoteCount + '</span></div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-sm);">';
        html += '<span style="color:#10b981;font-weight:700;">+' + c.newItems.length + ' nuevos</span>';
        html += ' &nbsp; <span style="color:var(--muted);">' + c.duplicates.length + ' iguales</span>';
        html += ' &nbsp; <span style="color:' + (c.conflicts.length > 0 ? '#ef4444' : '#64748b') + ';font-weight:' + (c.conflicts.length > 0 ? '700' : '400') + ';">' + c.conflicts.length + ' conflictos</span></div>';
        if (c.paStatusGains > 0 || c.paPhotoOnlyRemote > 0) {
            html += '<div style="font-size: var(--fs-xs);margin-bottom: var(--space-sm);padding: var(--space-sm) var(--space-sm);background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius: var(--radius-lg);color:#fbbf24;">';
            html += '<span style="font-weight:700;">Power Automate:</span>';
            if (c.paStatusGains > 0) html += ' &nbsp; <span title="Vehiculos con receipt de envio PA que aun no estaba en local">+' + c.paStatusGains + ' envio(s) heredados</span>';
            if (c.paPhotoOnlyRemote > 0) html += ' &nbsp; <span style="color:#fcd34d;" title="Estos vehiculos tienen el flag scannedReportCaptured=true en remoto, pero la foto fisica vive en IndexedDB de la otra estacion. Tendras que recapturarla aqui antes de poder enviar a PA.">' + c.paPhotoOnlyRemote + ' foto(s) solo en estación origen</span>';
            html += '</div>';
        }
        if (hasChanges) {
            html += '<select id="fb-merge-cop15" style="width:100%;padding: var(--space-sm);background:#1e293b;border:1px solid #334155;border-radius: var(--radius-md);color:#e2e8f0;font-size: var(--fs-base);">';
            html += '<option value="">No fusionar</option>';
            html += '<option value="new" selected>Solo nuevos (+' + c.newItems.length + ')</option>';
            html += '<option value="merge_all">Merge completo (nuevos + resolver conflictos)</option>';
            html += '<option value="replace">Reemplazar todo con remoto</option></select>';
        } else {
            html += '<div style="font-size: var(--fs-xs);color:#10b981;">Sin diferencias</div>';
        }
        html += '</div>';
    }

    // ── TestPlan ──
    var tp = analysis.testplan;
    if (tp) {
        var hasChanges = tp.newItems.length > 0 || tp.rulesChanged || tp.planDataDiff || tp.weeklyPlansDiff;
        html += '<div style="padding: var(--space-md);border:1px solid #1e293b;border-radius: var(--radius-xl);margin-bottom: var(--space-sm);' + (hasChanges ? 'border-color:#3b82f6;' : '') + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom: var(--space-sm);">';
        html += '<span style="font-weight:700;font-size:12px;">Test Plan</span>';
        html += '<span style="font-size: var(--fs-xs);color:var(--muted);">Probados L:' + tp.localTestedCount + '/R:' + tp.remoteTestedCount + '</span></div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-sm);">';
        if (tp.newItems.length > 0) html += '<span style="color:#10b981;font-weight:700;">+' + tp.newItems.length + ' probados nuevos</span> ';
        if (tp.duplicates.length > 0) html += '<span style="color:var(--muted);">' + tp.duplicates.length + ' iguales</span> ';
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
            html += '<select id="fb-merge-testplan" style="width:100%;padding: var(--space-sm);background:#1e293b;border:1px solid #334155;border-radius: var(--radius-md);color:#e2e8f0;font-size: var(--fs-base);">';
            html += '<option value="">No fusionar</option>';
            html += '<option value="new">' + newLabel + '</option>';
            html += '<option value="merge_all" selected>Merge completo (pruebas + reglas + plan + semanales)</option>';
            html += '<option value="replace">Reemplazar todo con remoto</option></select>';
        }
        html += '</div>';
    }

    // ── Inventory ──
    var inv = analysis.inventory;
    if (inv) {
        var hasChanges = inv.newGases.length > 0 || inv.newEquip.length > 0 || inv.gasConflicts.length > 0 ||
            inv.equipConflicts.length > 0 || inv.newAssets.length > 0 || inv.assetUpdates.length > 0 ||
            inv.newMaintActivities.length > 0 || inv.maintActivityUpdates.length > 0 || inv.newMaintLog.length > 0 ||
            (inv.newFuelTanks || []).length > 0 || (inv.fuelUpdates || []).length > 0;
        html += '<div style="padding: var(--space-md);border:1px solid #1e293b;border-radius: var(--radius-xl);margin-bottom: var(--space-sm);' + (hasChanges ? 'border-color:#10b981;' : '') + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom: var(--space-sm);">';
        html += '<span style="font-weight:700;font-size:12px;">Inventory</span>';
        html += '<span style="font-size: var(--fs-xs);color:var(--muted);">Gases L:' + inv.localGasCount + '/R:' + inv.remoteGasCount + ' Eq L:' + inv.localEquipCount + '/R:' + inv.remoteEquipCount + '</span></div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-sm);">';
        html += '<span style="color:#10b981;font-weight:700;">+' + inv.newGases.length + ' gases, +' + inv.newEquip.length + ' equipos</span>';
        html += ' &nbsp; <span style="color:' + (inv.gasConflicts.length > 0 || inv.equipConflicts.length > 0 ? '#ef4444' : '#64748b') + ';">' + inv.gasConflicts.length + ' conflictos gas, ' + inv.equipConflicts.length + ' cal. actualizadas</span></div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-sm);">🛠️ COP15-F11: +' + inv.newAssets.length + ' equipos, +' + inv.newMaintActivities.length + ' actividades, +' + inv.newMaintLog.length + ' mantenimientos registrados</div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-sm);">⛽ Combustible: +' + (inv.newFuelTanks || []).length + ' tanques, ' + (inv.fuelUpdates || []).length + ' con lecturas por unir</div>';
        if (hasChanges) {
            html += '<select id="fb-merge-inventory" style="width:100%;padding: var(--space-sm);background:#1e293b;border:1px solid #334155;border-radius: var(--radius-md);color:#e2e8f0;font-size: var(--fs-base);">';
            html += '<option value="">No fusionar</option>';
            html += '<option value="new" selected>Solo nuevos</option>';
            html += '<option value="merge_all">Merge completo (nuevos + resolver conflictos)</option>';
            html += '<option value="replace">Reemplazar todo con remoto</option></select>';
        } else {
            html += '<div style="font-size: var(--fs-xs);color:#10b981;">Sin diferencias</div>';
        }
        html += '</div>';
    }

    // Action buttons
    html += '<div style="display:flex;gap: var(--space-sm);margin-top: var(--space-md);">';
    html += '<button onclick="fbMergeShowPanel()" style="flex:1;padding: var(--space-md);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-xl);cursor:pointer;font-weight:700;font-size: var(--fs-sm);">Cancelar</button>';
    html += '<button onclick="fbMergeConfirmAndExecute()" style="flex:2;padding: var(--space-md);background:#f59e0b;color:#000;border:none;border-radius: var(--radius-xl);cursor:pointer;font-weight:700;font-size:12px;">Ejecutar Merge</button>';
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
    s = document.getElementById('fb-merge-inventory');
    if (s && s.value) choices.inventory = s.value;

    if (Object.keys(choices).length === 0) {
        showToast('Selecciona al menos un modulo para fusionar', 'info');
        return;
    }

    var actions = [];
    if (choices.cop15) actions.push('COP15: ' + choices.cop15);
    if (choices.testplan) actions.push('TestPlan: ' + choices.testplan);
    if (choices.inventory) actions.push('Inventory: ' + choices.inventory);

    showConfirmDialog({ title: '🔀 Ejecutar merge', message: 'Ejecutar merge desde ' + (window._fbMergeRemoteId || '?') + '?\n\n' + actions.join('\n') + '\n\nSe guardara un snapshot para poder deshacer.', type: 'warning', confirmText: 'Ejecutar', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;

        var merged = fbMergeExecute(window._fbMergeRemoteData, window._fbMergeAnalysis, choices);

        // Show result
        var modal = document.getElementById('fbModal');
        if (modal) {
            var html = '<div style="max-width:480px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);color:#e2e8f0;text-align:center;">';
            html += '<div style="font-size:36px;margin-bottom: var(--space-md);">&#10003;</div>';
            html += '<h3 style="color:#10b981;margin-bottom: var(--space-md);">Merge Completado</h3>';
            merged.forEach(function(m) {
                html += '<div style="font-size: var(--fs-sm);color:var(--muted);margin-bottom: var(--space-xs);">' + m + '</div>';
            });
            html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-top: var(--space-md);">Puedes deshacer esta fusion desde el panel de Firebase.</div>';
            html += '<div style="display:flex;gap: var(--space-sm);margin-top: var(--space-lg);">';
            html += '<button onclick="fbShowSettings()" style="flex:1;padding: var(--space-md);background:#3b82f6;color:#fff;border:none;border-radius: var(--radius-xl);cursor:pointer;font-weight:700;font-size: var(--fs-sm);">Volver a Settings</button>';
            html += '<button onclick="fbMergeUndo()" style="flex:1;padding: var(--space-md);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-xl);cursor:pointer;font-weight:700;font-size: var(--fs-sm);">Deshacer</button>';
            html += '</div></div>';
            modal.innerHTML = html;
        }
    });
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  APP VERSION CHECK                                                  ║
// ║  Compares local build with Firestore app/version on startup.       ║
// ║  Shows a 1-click download banner when a newer build is available.  ║
// ╚══════════════════════════════════════════════════════════════════════╝

function fbCheckAppVersion() {
    if (!FIREBASE_CONFIG.projectId || !FIREBASE_CONFIG.apiKey) return;
    if (FIREBASE_CONFIG.projectId === 'YOUR_PROJECT_ID') return;
    if (fbSync._versionChecked) return;
    fbSync._versionChecked = true;

    var url = 'https://firestore.googleapis.com/v1/projects/' +
        FIREBASE_CONFIG.projectId + '/databases/(default)/documents/app/version?key=' + FIREBASE_CONFIG.apiKey;

    fetch(url).then(function(r) { return r.json(); }).then(function(doc) {
        if (!doc || !doc.fields || !doc.fields.build) return;
        var remoteBuild = (doc.fields.build.stringValue || '').trim();
        var downloadUrl = (doc.fields.downloadUrl && doc.fields.downloadUrl.stringValue) || '';
        var localBuild = (typeof APP_BUILD !== 'undefined') ? String(APP_BUILD).trim() : '';
        // Both are YYYYMMDDHHmm strings — lexicographic comparison works correctly.
        if (!localBuild || localBuild === '__BUILD_VERSION__' || !remoteBuild) return;
        if (remoteBuild <= localBuild) {
            if (typeof updateVersionDisplay === 'function') updateVersionDisplay('uptodate');
            return;
        }
        if (typeof updateVersionDisplay === 'function') updateVersionDisplay('outdated', remoteBuild, downloadUrl);
        var dismissKey = 'kia_update_dismissed_' + remoteBuild;
        if (localStorage.getItem(dismissKey)) return;
        fbShowUpdateBanner(remoteBuild, downloadUrl, dismissKey);
    }).catch(function() {}); // non-critical — silent fail
}

function fbShowUpdateBanner(remoteBuild, downloadUrl, dismissKey) {
    if (document.getElementById('kia-update-banner')) return;
    var dateStr = remoteBuild.slice(0,4) + '-' + remoteBuild.slice(4,6) + '-' + remoteBuild.slice(6,8);
    var banner = document.createElement('div');
    banner.id = 'kia-update-banner';
    banner.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);' +
        'background:#0f172a;border:1px solid #f59e0b;border-radius: var(--radius-2xl);padding: var(--space-md) var(--space-lg);' +
        'display:flex;align-items:center;gap: var(--space-md);z-index:9999;' +
        'box-shadow:0 4px 24px rgba(0,0,0,0.6);color:#e2e8f0;font-size:13px;max-width:90vw;';
    // [v15.6] El botón actualiza la PWA en el lugar (reg.update + reload) —
    // el link de descarga anterior bajaba un HTML crudo de GitHub y no
    // actualizaba la app hosteada
    banner.innerHTML =
        '<span style="font-size:20px;">🔄</span>' +
        '<span>Nueva versión disponible: <strong>' + dateStr + '</strong></span>' +
        '<button onclick="fbApplyUpdate()"' +
        ' style="background:#f59e0b;color:#000;padding: var(--space-sm) var(--space-lg);border:none;border-radius: var(--radius-xl);' +
        'font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;min-height:40px;">' +
        'Actualizar ahora</button>' +
        '<button onclick="localStorage.setItem(\'' + dismissKey + '\',\'1\');' +
            'document.getElementById(\'kia-update-banner\').remove();"' +
            ' style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;' +
            'padding:0 4px;flex-shrink:0;" title="Recordar después">✕</button>';
    document.body.appendChild(banner);
}

// Aplica la actualización de la PWA: revalida el SW y recarga (el HTML se
// sirve con max-age=300 y el SW es network-first, la recarga trae el bundle nuevo)
function fbApplyUpdate() {
    var reload = function() { location.reload(); };
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration()
            .then(function(reg) { return reg ? reg.update() : null; })
            .then(reload, reload);
    } else {
        reload();
    }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [QW5] AUTOMATIC DAILY BACKUP TO FIRESTORE                         ║
// ║  [2.3.0] Un documento por módulo (fragmentado), aviso si falla,     ║
// ║  diarios 30 días + el primero de cada mes durante un año.          ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_BACKUP_LS_KEY = 'kia_fb_last_backup';        // fecha (YYYY-MM-DD) del último respaldo exitoso
var FB_BACKUP_STATUS_KEY = 'kia_fb_backup_status';  // [2.3.0] último intento: ok, error, módulos
var FB_BACKUP_CLEANUP_KEY = 'kia_fb_backup_cleanup';
var FB_BACKUP_FORMAT = 2;
// Cada fragmento es un campo de texto de un documento propio. 300 000 caracteres
// dejan margen aun si todo fuera texto con acentos (3 bytes UTF-8 por carácter).
var FB_BACKUP_CHUNK_CHARS = 300000;
var FB_BACKUP_DAILY_DAYS = 30;     // diarios: los últimos 30 días
var FB_BACKUP_MONTHLY_DAYS = 365;  // después: el primero de cada mes, hasta un año
var FB_BACKUP_MODULES = [
    { col: 'cop15',     label: 'Vehículos (COP15)',     icon: '🔬' },
    { col: 'testplan',  label: 'Plan de pruebas',        icon: '📊' },
    { col: 'inventory', label: 'Consumibles y equipos',  icon: '📦' },
    { col: 'panel',     label: 'Panel, usuarios y proyectos', icon: '🗂️' },
    { col: 'cop',       label: 'CoP (juicios)',          icon: '📐' },
    { col: 'homolog',   label: 'Homologación Europa',    icon: '🇪🇺' },
    { col: 'audit',     label: 'Historial de cambios',   icon: '🕘' }
];

/**
 * Parte un texto en fragmentos de a lo más `size` caracteres SIN partir un par
 * sustituto (un emoji partido a la mitad se guardaría corrupto). PURA.
 */
function _fbSplitChunks(str, size) {
    str = String(str || '');
    size = Math.max(2, size || FB_BACKUP_CHUNK_CHARS);
    var out = [], i = 0;
    while (i < str.length) {
        var end = Math.min(str.length, i + size);
        if (end < str.length) {
            var c = str.charCodeAt(end - 1);
            if (c >= 0xD800 && c <= 0xDBFF) end--;
        }
        out.push(str.slice(i, end));
        i = end;
    }
    if (!out.length) out.push('');
    return out;
}

/**
 * Qué respaldos se conservan. PURA.
 * dates: ['YYYY-MM-DD', …] · today: 'YYYY-MM-DD'.
 * - Los de los últimos FB_BACKUP_DAILY_DAYS días: todos.
 * - Más viejos: el PRIMERO que exista de cada mes, hasta FB_BACKUP_MONTHLY_DAYS.
 * - Más viejos que eso: se borran.
 * Se decide con las fechas que EXISTEN (no "el día 1"), porque un día sin equipo
 * encendido no tiene respaldo y el mes se quedaría sin ninguno.
 */
function fbBackupRetention(dates, today) {
    var dayMs = 86400000;
    var t0 = Date.parse(String(today).slice(0, 10) + 'T00:00:00Z');
    var uniq = [];
    (dates || []).forEach(function(d) {
        d = String(d || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && uniq.indexOf(d) < 0) uniq.push(d);
    });
    uniq.sort();
    var keep = [], drop = [], firstOfMonth = {};
    uniq.forEach(function(d) {
        var age = Math.round((t0 - Date.parse(d + 'T00:00:00Z')) / dayMs);
        if (age <= FB_BACKUP_DAILY_DAYS) { keep.push(d); return; }
        if (age > FB_BACKUP_MONTHLY_DAYS) { drop.push(d); return; }
        var mes = d.slice(0, 7);
        if (!firstOfMonth[mes]) { firstOfMonth[mes] = d; keep.push(d); }
        else drop.push(d);
    });
    return { keep: keep, drop: drop };
}

/** Módulos que se respaldan, con sus datos vivos (mismas fuentes que fbPushAll). */
function _fbBackupCollect() {
    var mods = [];
    var add = function(col, data) { if (data !== null && data !== undefined) mods.push({ col: col, data: data }); };
    // Un dispositivo recién instalado no debe dejar un respaldo "vacío" que parezca bueno.
    var core = function(col, data) {
        if (typeof _fbPushDataScore === 'function' && _fbPushDataScore(col) === 0) return;
        add(col, data);
    };
    if (typeof db !== 'undefined') core('cop15', db);
    if (typeof tpState !== 'undefined') core('testplan', tpState);
    if (typeof invState !== 'undefined') core('inventory', invState);
    if (typeof pnState !== 'undefined' && pnState && (pnState.operators || []).length) add('panel', pnState);
    ['cop:kia_cop_v1', 'homolog:kia_homolog_v1'].forEach(function(p) {
        var raw = null; try { raw = JSON.parse(localStorage.getItem(p.split(':')[1])); } catch (e) {}
        if (raw) add(p.split(':')[0], raw);
    });
    if (typeof auditGetTrail === 'function') { var tr = auditGetTrail(); if (tr && tr.length) add('audit', tr); }
    return mods;
}

// ── Primitivos: SDK primero, REST si el SDK falla (mismo camino que fbBugs*) ──
// `suffix` es relativo a stations/{station}/ — p.ej. 'backups/2026-09-28/parts/x'.

function _fbBkRef(suffix) {
    var segs = String(suffix).split('/');
    var ref = fbSync.db.collection('stations').doc(fbSync.stationId);
    for (var i = 0; i < segs.length; i++) ref = (i % 2 === 0) ? ref.collection(segs[i]) : ref.doc(segs[i]);
    return ref;
}

function _fbBkIsNotFound(err) {
    var m = String((err && err.message) || err || '');
    return /404|not.?found/i.test(m);
}

function _fbBkSet(suffix, fields) {
    return new Promise(function(resolve, reject) {
        _fbBugsSdkOrRest(
            function() { return _fbBkRef(suffix).set(fields); },
            function() { fbQuotaRecord('write'); resolve(); },
            function() {
                _fbBugsRestSend('PATCH', suffix, fields)
                    .then(function() { fbQuotaRecord('write'); resolve(); })
                    .catch(reject);
            });
    });
}

function _fbBkGet(suffix) {
    return new Promise(function(resolve, reject) {
        _fbBugsSdkOrRest(
            function() { return _fbBkRef(suffix).get(); },
            function(doc) { fbQuotaRecord('read'); resolve(doc && doc.exists ? doc.data() : null); },
            function() {
                _fbBugsRestSend('GET', suffix, null)
                    .then(function(doc) { fbQuotaRecord('read'); resolve(_fbBugsRestDocToObj(doc)); })
                    .catch(function(err) { if (_fbBkIsNotFound(err)) resolve(null); else reject(err); });
            });
    });
}

/** Lista una colección → [{id, data}]. `orderBy` = 'meta.date desc' (opcional). */
function _fbBkList(suffix, orderBy, limit) {
    return new Promise(function(resolve, reject) {
        _fbBugsSdkOrRest(
            function() {
                var q = _fbBkRef(suffix);
                if (orderBy) { var p = orderBy.split(' '); q = q.orderBy(p[0], p[1] || 'asc'); }
                if (limit) q = q.limit(limit);
                return q.get();
            },
            function(snap) {
                fbQuotaRecord('read');
                var out = [];
                snap.forEach(function(d) { out.push({ id: d.id, data: d.data() }); });
                resolve(out);
            },
            function() {
                var qs = 'pageSize=' + (limit || 300) + (orderBy ? '&orderBy=' + encodeURIComponent(orderBy) : '');
                _fbBugsRestSend('GET', suffix, null, qs)
                    .then(function(res) {
                        fbQuotaRecord('read');
                        resolve(((res && res.documents) || []).map(function(doc) {
                            var o = _fbBugsRestDocToObj(doc);
                            var id = o._id; delete o._id;
                            return { id: id, data: o };
                        }));
                    })
                    .catch(function(err) { if (_fbBkIsNotFound(err)) resolve([]); else reject(err); });
            });
    });
}

function _fbBkDelete(suffix) {
    return new Promise(function(resolve, reject) {
        _fbBugsSdkOrRest(
            function() { return _fbBkRef(suffix).delete(); },
            function() { fbQuotaRecord('write'); resolve(); },
            function() {
                _fbBugsRestSend('DELETE', suffix, null)
                    .then(function() { fbQuotaRecord('write'); resolve(); })
                    .catch(function(err) { if (_fbBkIsNotFound(err)) resolve(); else reject(err); });
            });
    });
}

/** Error de red/nube → texto que dice qué pasó y qué hacer. PURA. */
function _fbBkErrText(err) {
    var m = String((err && err.message) || err || '');
    if (/failed to fetch|networkerror|network request failed|load failed|offline|unavailable/i.test(m)) return 'sin conexión con la nube';
    if (/403|permission|insufficient/i.test(m)) return 'la nube rechazó la escritura (permisos): vuelve a iniciar sesión con la contraseña del laboratorio';
    if (/413|too large|exceeds the maximum|maximum size/i.test(m)) return 'un fragmento resultó demasiado grande para la nube';
    if (/quota|resource.?exhausted|429/i.test(m)) return 'se alcanzó el límite diario de escrituras de la nube';
    return m || 'error desconocido';
}

// ── Estado del último intento (lo leen Datos → Sistema y las Alertas) ──

function _fbBackupSaveStatus(patch) {
    var st = {};
    try { st = JSON.parse(localStorage.getItem(FB_BACKUP_STATUS_KEY)) || {}; } catch (e) { st = {}; }
    Object.keys(patch || {}).forEach(function(k) { st[k] = patch[k]; });
    try { localStorage.setItem(FB_BACKUP_STATUS_KEY, JSON.stringify(st)); } catch (e) {}
    if (typeof fbSyncCapacityInvalidate === 'function') fbSyncCapacityInvalidate();
    return st;
}

/**
 * Evalúa el estado del respaldo. PURA respecto a sus argumentos.
 * st: {lastOkAt, lastOkDate, lastAttemptAt, ok, error} · nowMs · enabled (sync activo).
 * Devuelve {text, alert:{level,message}|null}.
 */
function fbBackupStatusEval(st, nowMs, enabled) {
    st = st || {};
    var dayMs = 86400000;
    var fecha = function(iso) { return iso ? String(iso).slice(0, 16).replace('T', ' ') : ''; };
    var text, alert = null;
    if (st.lastOkAt) text = 'Último respaldo en la nube: ' + fecha(st.lastOkAt) + (st.modulesOk ? ' (' + st.modulesOk + ' módulos)' : '') + '.';
    else text = 'Todavía no hay un respaldo en la nube con el formato nuevo.';
    if (!enabled) return { text: text + ' La sincronización está apagada en este equipo.', alert: null };
    if (st.lastAttemptAt && st.ok === false) {
        text += ' ⚠ El intento del ' + fecha(st.lastAttemptAt) + ' falló: ' + (st.error || 'sin detalle') + '. Se reintenta al reconectar.';
        alert = { level: 'ALTA', message: 'El respaldo diario en la nube falló (' + fecha(st.lastAttemptAt) + '): ' + (st.error || 'sin detalle') + ' — ver Datos → Sistema' };
    }
    var okMs = st.lastOkAt ? Date.parse(st.lastOkAt) : 0;
    if (st.lastAttemptAt && (!okMs || nowMs - okMs > 3 * dayMs)) {
        alert = { level: 'CRITICA', message: (okMs
            ? 'Hace ' + Math.floor((nowMs - okMs) / dayMs) + ' días que no hay respaldo en la nube'
            : 'No hay ningún respaldo en la nube con el formato nuevo') + ' — ver Datos → Sistema' };
    }
    return { text: text, alert: alert };
}

function fbBackupStatus() {
    var st = {};
    try { st = JSON.parse(localStorage.getItem(FB_BACKUP_STATUS_KEY)) || {}; } catch (e) { st = {}; }
    var ev = fbBackupStatusEval(st, Date.now(), typeof fbSync !== 'undefined' && fbSync.enabled);
    ev.raw = st;
    return ev;
}

function fbBackupStatusText() { return fbBackupStatus().text; }

// ── Disparo diario ──

function fbBackupCheck(_intento) {
    if (!fbSync.enabled || !fbSync.stationId || (!fbSync.db && !fbSync._useREST)) return;
    var today = localToday();
    if ((localStorage.getItem(FB_BACKUP_LS_KEY) || '') === today) return;
    // Esperar al pull inicial: respaldar antes guardaría un estado a medio fusionar.
    if (!fbSync._pullCompleted) {
        var n = (_intento || 0) + 1;
        if (n <= 10) setTimeout(function() { fbBackupCheck(n); }, 20000);
        return;
    }
    fbBackupNow(function(ok, err, info) {
        if (ok) {
            localStorage.setItem(FB_BACKUP_LS_KEY, today);
            console.log('Firebase Backup: respaldo diario ' + today + (info && info.skipped ? ' (ya lo hizo otro equipo)' : ''));
        } else {
            // Una vez al día, visible: antes solo quedaba en la consola.
            var avisado = '';
            try { avisado = localStorage.getItem('kia_fb_backup_warned') || ''; } catch (e) {}
            if (avisado !== today) {
                try { localStorage.setItem('kia_fb_backup_warned', today); } catch (e) {}
                if (typeof showToast === 'function') showToast('No se pudo guardar el respaldo diario en la nube: ' + (err || 'sin detalle') + '. Se reintentará al reconectar.', 'error', 12000);
            }
        }
    });
}

/**
 * [2.3.0] Respaldo por módulo. Antes TODO iba en un solo documento (COP15 + Plan +
 * Consumibles ≈ 1.2 MB), por encima del límite de 1 MiB de Firestore: fallaba en
 * silencio. Ahora cada módulo va como JSON en fragmentos, en su propia subcolección:
 *   backups/{fecha}                    ← índice (se escribe AL FINAL = respaldo completo)
 *   backups/{fecha}/parts/{run}__{col}__{i}
 * `run` distingue dos equipos respaldando el mismo día: el índice apunta a UNA corrida.
 * callback(ok, errorOrNull, info)
 */
function fbBackupNow(callback, opts) {
    opts = opts || {};
    var done = function(ok, err, info) { if (callback) callback(ok, err || null, info || {}); };
    var ready = (typeof fbBugsEnsureReady === 'function') ? fbBugsEnsureReady() : { ok: !!fbSync.enabled };
    if (!ready.ok || !fbSync.stationId) { done(false, ready.reason || 'Sin conexión a la nube'); return; }

    var mods = _fbBackupCollect();
    if (!mods.length) { done(false, 'No hay datos locales que respaldar'); return; }

    var today = localToday();
    var run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var nowIso = new Date().toISOString();
    var parts = [], resumen = {}, bytesTot = 0;
    mods.forEach(function(m) {
        var json;
        try { json = JSON.stringify(m.data); } catch (e) { return; }
        var chunks = _fbSplitChunks(json, FB_BACKUP_CHUNK_CHARS);
        resumen[m.col] = { chunks: chunks.length, chars: json.length };
        bytesTot += json.length;
        chunks.forEach(function(txt, i) {
            parts.push({ id: run + '__' + m.col + '__' + i,
                fields: { run: run, module: m.col, i: i, n: chunks.length, json: txt } });
        });
    });

    var quota = fbQuotaCheck('write');
    if (!quota.allowed) { done(false, quota.reason); return; }
    _fbBackupSaveStatus({ lastAttemptAt: nowIso });

    var base = 'backups/' + today;
    var fallo = function(err) {
        var msg = _fbBkErrText(err);
        console.error('Firebase Backup: error', err);
        _fbBackupSaveStatus({ ok: false, error: msg, lastAttemptAt: nowIso });
        done(false, msg);
    };

    // ¿Otro equipo ya dejó hoy un respaldo completo? Entonces no se duplica
    // (salvo "Respaldar ahora", que pide uno nuevo a propósito).
    var previo = opts.force ? Promise.resolve(null) : _fbBkGet(base);
    previo.then(function(existente) {
        if (existente && existente.meta && existente.meta.format === FB_BACKUP_FORMAT && existente.meta.complete) {
            _fbBackupSaveStatus({ ok: true, error: '', lastOkAt: existente.meta.timestamp || nowIso,
                lastOkDate: today, modulesOk: Object.keys(existente.meta.modules || {}).length });
            done(true, null, { skipped: true });
            return null;
        }
        // Fragmentos en serie: pocos documentos grandes; en paralelo solo se pelean la red.
        var seq = Promise.resolve();
        parts.forEach(function(p) { seq = seq.then(function() { return _fbBkSet(base + '/parts/' + p.id, p.fields); }); });
        return seq.then(function() {
            var idx = {
                meta: { station: fbSync.stationId, date: today, timestamp: nowIso, format: FB_BACKUP_FORMAT,
                        run: run, writer: FB_DEVICE_ID, appVersion: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
                        modules: resumen, complete: true },
                // Resumen legible por la lista (y por equipos con código anterior).
                cop15: { vehicleCount: (typeof db !== 'undefined' && db && db.vehicles) ? db.vehicles.length : 0 },
                testplan: { testedCount: (typeof tpState !== 'undefined' && tpState && tpState.testedList) ? tpState.testedList.length : 0 },
                inventory: { gasCount: (typeof invState !== 'undefined' && invState && invState.gases) ? invState.gases.length : 0,
                             equipCount: (typeof invState !== 'undefined' && invState && invState.equipment) ? invState.equipment.length : 0 }
            };
            return _fbBkSet(base, idx);
        }).then(function() {
            _fbBackupSaveStatus({ ok: true, error: '', lastOkAt: nowIso, lastOkDate: today,
                modulesOk: Object.keys(resumen).length, chars: bytesTot });
            done(true, null, { modules: resumen });
            // Limpieza tolerante: si falla no invalida el respaldo ya hecho.
            _fbBackupPruneRuns(base, run).catch(function(e) { console.warn('Backup: limpieza de corridas', e); });
            fbBackupCleanup();
            return null;
        });
    }).catch(fallo);
}

/** Borra fragmentos de HOY que no son de la corrida que quedó en el índice. */
function _fbBackupPruneRuns(base, run) {
    return _fbBkList(base + '/parts').then(function(list) {
        var seq = Promise.resolve();
        list.forEach(function(p) {
            if (p.data && p.data.run !== run) seq = seq.then(function() { return _fbBkDelete(base + '/parts/' + p.id); });
        });
        return seq;
    });
}

/** Aplica fbBackupRetention una vez al día. Borra fragmentos y luego el índice. */
function fbBackupCleanup() {
    var today = localToday();
    try { if (localStorage.getItem(FB_BACKUP_CLEANUP_KEY) === today) return; } catch (e) {}
    try { localStorage.setItem(FB_BACKUP_CLEANUP_KEY, today); } catch (e) {}
    _fbBkList('backups', 'meta.date desc', 400).then(function(list) {
        var dates = list.map(function(b) { return (b.data && b.data.meta && b.data.meta.date) || b.id; });
        var r = fbBackupRetention(dates, today);
        var seq = Promise.resolve(), count = 0;
        list.forEach(function(b) {
            var d = (b.data && b.data.meta && b.data.meta.date) || b.id;
            if (r.drop.indexOf(String(d).slice(0, 10)) < 0) return;
            seq = seq.then(function() {
                return _fbBkList('backups/' + b.id + '/parts').then(function(parts) {
                    var s2 = Promise.resolve();
                    parts.forEach(function(p) { s2 = s2.then(function() { return _fbBkDelete('backups/' + b.id + '/parts/' + p.id); }); });
                    return s2;
                }).then(function() { count++; return _fbBkDelete('backups/' + b.id); });
            });
        });
        return seq.then(function() { if (count) console.log('Firebase Backup: ' + count + ' respaldos viejos borrados'); });
    }).catch(function(err) { console.warn('Firebase Backup: error de limpieza', err); });
}

function fbBackupManual() {
    showToast('Creando respaldo…', 'info');
    fbBackupNow(function(ok, err) {
        if (ok) {
            localStorage.setItem(FB_BACKUP_LS_KEY, localToday());
            showToast('Respaldo guardado en la nube', 'success');
            if (typeof fbShowSettings === 'function') fbShowSettings();
        } else {
            showToast('No se pudo crear el respaldo: ' + (err || 'sin detalle'), 'error', 10000);
        }
    }, { force: true });
}

function fbBackupList(callback) {
    var ready = (typeof fbBugsEnsureReady === 'function') ? fbBugsEnsureReady() : { ok: !!fbSync.enabled };
    if (!ready.ok || !fbSync.stationId) { callback([]); return; }
    var quota = fbQuotaCheck('read');
    if (!quota.allowed) { showToast(quota.reason, 'error'); callback([]); return; }
    _fbBkList('backups', 'meta.date desc', 60).then(function(docs) {
        callback(docs.map(function(b) {
            var d = b.data || {};
            var m = d.meta || {};
            return {
                id: b.id, date: m.date || b.id, timestamp: m.timestamp || '',
                format: m.format || 1, complete: m.format === FB_BACKUP_FORMAT ? !!m.complete : !!(d.cop15 && d.cop15.data),
                modules: m.format === FB_BACKUP_FORMAT ? Object.keys(m.modules || {}) : ['cop15', 'testplan', 'inventory'],
                vehicles: d.cop15 ? d.cop15.vehicleCount : '?',
                gases: d.inventory ? d.inventory.gasCount : '?'
            };
        }));
    }).catch(function(err) {
        console.error('Firebase Backup: List error', err);
        callback([]);
    });
}

/**
 * Lee el contenido de un respaldo, del formato que sea. Resuelve {modulo: datos}.
 * Formato 2: une los fragmentos de la corrida del índice y verifica que estén todos.
 * Formato 1 (hasta 2.2.0): los datos venían dentro del mismo documento.
 */
function _fbBackupLoad(backupId) {
    return _fbBkGet('backups/' + backupId).then(function(d) {
        if (!d) throw new Error('Respaldo no encontrado');
        var m = d.meta || {};
        if (m.format !== FB_BACKUP_FORMAT) {
            var out1 = {};
            ['cop15', 'testplan', 'inventory'].forEach(function(c) { if (d[c] && d[c].data) out1[c] = d[c].data; });
            return out1;
        }
        if (!m.complete) throw new Error('El respaldo quedó incompleto y no se puede restaurar');
        return _fbBkList('backups/' + backupId + '/parts').then(function(list) {
            return fbBackupAssemble(list.map(function(p) { return p.data; }), m);
        });
    });
}

/**
 * Arma los módulos a partir de los fragmentos. PURA.
 * parts: [{run, module, i, n, json}] · meta: {run, modules:{col:{chunks}}}.
 * Lanza si falta un fragmento: restaurar medio módulo sería peor que no restaurar.
 */
function fbBackupAssemble(parts, meta) {
    var byMod = {};
    (parts || []).forEach(function(p) {
        if (!p || p.run !== meta.run) return;
        (byMod[p.module] = byMod[p.module] || []).push(p);
    });
    var out = {};
    Object.keys(meta.modules || {}).forEach(function(col) {
        var esperado = meta.modules[col].chunks;
        var trozos = (byMod[col] || []).slice().sort(function(a, b) { return a.i - b.i; });
        if (trozos.length !== esperado) throw new Error('Faltan fragmentos de ' + col + ' (' + trozos.length + ' de ' + esperado + ')');
        out[col] = JSON.parse(trozos.map(function(t) { return t.json; }).join(''));
    });
    return out;
}

function fbBackupRestore(backupId, modules) {
    if (typeof authRequire === 'function' && !authRequire('data.sync_admin', 'restaurar un respaldo')) return;
    // If modules not specified, show selection UI
    if (!modules) {
        fbBackupRestoreSelectModules(backupId);
        return;
    }

    // Create pre-restore snapshot for undo
    var lsJSON = function(k) { return typeof safeParse === 'function' ? safeParse(k, null) : JSON.parse(localStorage.getItem(k) || 'null'); };
    var snapshot = {
        // savedAt permite que storageHousekeeping() lo caduque: es una copia completa
        // de los módulos (~1 MB) y antes se quedaba para siempre.
        savedAt: Date.now(),
        cop15: lsJSON('kia_db_v11'),
        testplan: lsJSON('kia_testplan_v1'),
        inventory: lsJSON('kia_lab_inventory'),
        panel: modules.panel ? lsJSON('kia_panel_v1') : null,
        cop: modules.cop ? lsJSON('kia_cop_v1') : null,
        homolog: modules.homolog ? lsJSON('kia_homolog_v1') : null
    };
    try { localStorage.setItem('kia_fb_prerestore_snapshot', JSON.stringify(snapshot)); } catch(e) {}

    showToast('Leyendo respaldo…', 'info');
    _fbBackupLoad(backupId).then(function(d) {
        var restored = [], faltan = [];
        var pide = function(c) { return !!modules[c]; };
        if (pide('cop15')) {
            if (d.cop15) {
                db = d.cop15;
                if (typeof dedupeVehicleIds === 'function') dedupeVehicleIds();
                localStorage.setItem('kia_db_v11', JSON.stringify(db));
                if (typeof refreshAllLists === 'function') refreshAllLists();
                restored.push('COP15');
            } else faltan.push('COP15');
        }
        if (pide('testplan')) {
            if (d.testplan) {
                tpState = d.testplan;
                localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState));
                _fbTpUISync();
                restored.push('Plan de pruebas');
            } else faltan.push('Plan de pruebas');
        }
        if (pide('inventory')) {
            if (d.inventory) {
                invState = d.inventory;
                localStorage.setItem('kia_lab_inventory', JSON.stringify(invState));
                if (typeof invRender === 'function') invRender();
                restored.push('Consumibles');
            } else faltan.push('Consumibles');
        }
        if (pide('panel')) {
            if (d.panel && typeof pnState !== 'undefined') {
                pnState = d.panel;
                localStorage.setItem('kia_panel_v1', JSON.stringify(pnState));
                if (typeof pnRender === 'function') pnRender();
                restored.push('Panel');
            } else faltan.push('Panel');
        }
        if (pide('cop')) {
            if (d.cop) {
                localStorage.setItem('kia_cop_v1', JSON.stringify(d.cop));
                if (typeof copSyncReload === 'function') copSyncReload();
                restored.push('CoP');
            } else faltan.push('CoP');
        }
        if (pide('homolog')) {
            if (d.homolog) {
                localStorage.setItem('kia_homolog_v1', JSON.stringify(d.homolog));
                if (typeof homoSyncReload === 'function') homoSyncReload();
                restored.push('Homologación');
            } else faltan.push('Homologación');
        }
        if (typeof auditLog === 'function') auditLog('sistema', 'respaldo_restaurado', { type: 'sistema', id: backupId, label: 'Respaldo ' + backupId },
            'Restaurado: ' + (restored.join(', ') || 'nada') + (faltan.length ? ' · no estaban en el respaldo: ' + faltan.join(', ') : ''));
        showToast('Restaurado: ' + (restored.join(', ') || 'nada') + (faltan.length ? ' · No estaban en ese respaldo: ' + faltan.join(', ') : ''),
            restored.length ? 'success' : 'warning');
        if (typeof fbShowSettings === 'function') fbShowSettings();
    }).catch(function(err) {
        showToast('Error restaurando: ' + ((err && err.message) || err), 'error', 10000);
    });
}

function fbBackupRestoreSelectModules(backupId) {
    var modal = document.getElementById('fbModal');
    if (!modal) return;

    var html = '<div style="max-width:420px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);position:relative;color:#e2e8f0;">';
    html += '<button onclick="fbBackupShowList()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">✕</button>';
    html += '<h3 style="margin:0 0 12px;color:#3b82f6;">Restaurar respaldo</h3>';
    html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-md);">Respaldo: ' + backupId + '</div>';
    html += '<div style="font-size: var(--fs-sm);color:#e2e8f0;margin-bottom: var(--space-md);">Selecciona los módulos a restaurar:</div>';

    // El historial de cambios se respalda pero no se restaura: es un registro, no un estado.
    FB_BACKUP_MODULES.filter(function(m) { return m.col !== 'audit'; }).forEach(function(m) {
        var porDefecto = (m.col === 'cop15' || m.col === 'testplan' || m.col === 'inventory');
        html += '<label style="display:flex;align-items:center;gap: var(--space-md);padding: var(--space-md);margin-bottom: var(--space-xs);background:#1e293b;border-radius: var(--radius-xl);cursor:pointer;border:1px solid #334155;">';
        html += '<input type="checkbox" id="fb-restore-' + m.col + '"' + (porDefecto ? ' checked' : '') + ' style="accent-color:#3b82f6;width:18px;height:18px;">';
        html += '<span style="font-size:16px;">' + m.icon + '</span>';
        html += '<span style="font-size: var(--fs-sm);">' + m.label + '</span>';
        html += '</label>';
    });

    html += '<div style="padding: var(--space-sm);margin-top: var(--space-sm);background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius: var(--radius-xl);font-size: var(--fs-xs);color:#f59e0b;">';
    html += 'Se guarda una copia previa: puedes deshacer la restauración. Los respaldos anteriores a la versión 2.3.0 solo traen vehículos, plan y consumibles.</div>';

    html += '<div style="display:flex;gap: var(--space-sm);margin-top: var(--space-md);">';
    html += '<button onclick="fbBackupShowList()" style="flex:1;padding: var(--space-md);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-xl);cursor:pointer;font-size: var(--fs-sm);">Cancelar</button>';
    html += '<button onclick="fbBackupRestoreConfirm(\'' + backupId + '\')" style="flex:1;padding: var(--space-md);background:#7c3aed;color:#fff;border:none;border-radius: var(--radius-xl);cursor:pointer;font-size: var(--fs-sm);font-weight:700;">Restaurar selección</button>';
    html += '</div></div>';

    modal.innerHTML = html;
}

function fbBackupRestoreConfirm(backupId) {
    var modules = {}, anySelected = false;
    FB_BACKUP_MODULES.forEach(function(m) {
        var el = document.getElementById('fb-restore-' + m.col);
        modules[m.col] = !!(el && el.checked);
        if (modules[m.col]) anySelected = true;
    });
    if (!anySelected) { showToast('Selecciona al menos un módulo', 'error'); return; }
    fbBackupRestore(backupId, modules);
}

function fbBackupUndoRestore() {
    var snapshot = null;
    try { snapshot = JSON.parse(localStorage.getItem('kia_fb_prerestore_snapshot')); } catch(e) {}
    if (!snapshot) { showToast('No hay copia previa a la restauración', 'error'); return; }
    showConfirmDialog({ title: '⚠️ Deshacer restauración', message: '¿Deshacer la última restauración y volver al estado anterior?', type: 'warning', confirmText: 'Deshacer', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;

        if (snapshot.cop15) { db = snapshot.cop15; if (typeof dedupeVehicleIds === 'function') dedupeVehicleIds(); localStorage.setItem('kia_db_v11', JSON.stringify(db)); if (typeof refreshAllLists === 'function') refreshAllLists(); }
        if (snapshot.testplan) { tpState = snapshot.testplan; localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState)); _fbTpUISync(); }
        if (snapshot.inventory) { invState = snapshot.inventory; localStorage.setItem('kia_lab_inventory', JSON.stringify(invState)); if (typeof invRender === 'function') invRender(); }
        if (snapshot.panel && typeof pnState !== 'undefined') { pnState = snapshot.panel; localStorage.setItem('kia_panel_v1', JSON.stringify(pnState)); if (typeof pnRender === 'function') pnRender(); }
        if (snapshot.cop) { localStorage.setItem('kia_cop_v1', JSON.stringify(snapshot.cop)); if (typeof copSyncReload === 'function') copSyncReload(); }
        if (snapshot.homolog) { localStorage.setItem('kia_homolog_v1', JSON.stringify(snapshot.homolog)); if (typeof homoSyncReload === 'function') homoSyncReload(); }

        localStorage.removeItem('kia_fb_prerestore_snapshot');
        showToast('Restauración deshecha — datos anteriores restaurados', 'success');
    });
}

function fbBackupShowList() {
    var modal = document.getElementById('fbModal');
    if (!modal) return;
    modal.innerHTML = '<div style="max-width:480px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);color:#e2e8f0;text-align:center;">' +
        '<div style="font-size:24px;">Cargando respaldos…</div></div>';

    fbBackupList(function(list) {
        var html = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);position:relative;color:#e2e8f0;">';
        html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">✕</button>';
        html += '<h3 style="margin:0 0 12px;color:#3b82f6;">Respaldos disponibles (' + list.length + ')</h3>';
        html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-md);">' + escapeHtml(fbBackupStatusText()) + '</div>';

        if (list.length === 0) {
            html += '<div style="text-align:center;padding: var(--space-xl);color:var(--muted);">No hay respaldos guardados aún.</div>';
        } else {
            list.forEach(function(b) {
                html += '<div style="display:flex;justify-content:space-between;align-items:center;gap: var(--space-sm);padding: var(--space-sm) var(--space-md);margin-bottom: var(--space-xs);border:1px solid #1e293b;border-radius: var(--radius-lg);background:#1e293b;">';
                html += '<div>';
                html += '<div style="font-size: var(--fs-sm);font-weight:700;">' + escapeHtml(b.date) + (b.format === FB_BACKUP_FORMAT ? '' : ' <span style="color:var(--muted);font-weight:400;">(formato anterior)</span>') + '</div>';
                html += '<div style="font-size: var(--fs-xs);color:var(--muted);">' + b.vehicles + ' vehículos · ' + b.modules.length + ' módulos' + (b.complete ? '' : ' · <b style="color:#f59e0b;">incompleto</b>') + '</div>';
                html += '</div>';
                if (b.complete) html += '<button onclick="fbBackupRestore(\x27' + b.id + '\x27)" style="padding: var(--space-xs) var(--space-md);background:#7c3aed;color:#fff;border:none;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Restaurar</button>';
                html += '</div>';
            });
        }

        var hasSnapshot = !!localStorage.getItem('kia_fb_prerestore_snapshot');
        html += '<div style="display:flex;gap: var(--space-sm);margin-top: var(--space-md);flex-wrap:wrap;">';
        html += '<button onclick="fbShowSettings()" style="flex:1;padding: var(--space-sm);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Volver</button>';
        html += '<button onclick="fbBackupManual()" style="flex:1;padding: var(--space-sm);background:#0f766e;color:#fff;border:none;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Respaldar ahora</button>';
        if (hasSnapshot) {
            html += '<button onclick="fbBackupUndoRestore()" style="flex-basis:100%;padding: var(--space-sm);background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">↩ Deshacer última restauración</button>';
        }
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
    modal.innerHTML = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);position:relative;color:#e2e8f0;">' +
        '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">\u2715</button>' +
        '<h3 style="margin:0 0 12px;color:#6366f1;">📡 Activity Feed</h3>' +
        '<div style="text-align:center;padding: var(--space-2xl);color:var(--muted);">Cargando actividad...</div></div>';

    fbActivityLoad(function(events) {
        var html = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius: var(--radius-2xl);padding: var(--space-xl);position:relative;color:#e2e8f0;">';
        html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">\u2715</button>';
        html += '<h3 style="margin:0 0 4px;color:#6366f1;">📡 Activity Feed</h3>';
        html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-bottom: var(--space-lg);">Eventos recientes de todas las estaciones</div>';

        if (events.length === 0) {
            html += '<div style="text-align:center;padding: var(--space-2xl);color:var(--muted);">No hay actividad registrada aún.</div>';
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
                html += '<div style="font-size: var(--fs-sm);font-weight:700;color:var(--muted);margin:12px 0 6px;padding-bottom: var(--space-xs);border-bottom:1px solid #1e293b;">' + dateKey + '</div>';
                grouped[dateKey].forEach(function(e) {
                    var icon = actionIcons[e.action] || '📌';
                    var sColor = stationColors[e.station] || '#64748b';
                    var timeStr = e.time.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
                    html += '<div style="display:flex;gap: var(--space-sm);padding:6px 0;border-bottom:1px solid #0f172a;">';
                    html += '<div style="min-width:42px;font-size: var(--fs-xs);color:var(--muted);padding-top: var(--space-2xs);">' + timeStr + '</div>';
                    html += '<div style="font-size:14px;line-height:1;">' + icon + '</div>';
                    html += '<div style="flex:1;">';
                    html += '<span style="font-size: var(--fs-sm);font-weight:700;color:' + sColor + ';padding: var(--space-2xs) var(--space-sm);background:' + sColor + '20;border-radius: var(--radius-md);margin-right: var(--space-xs);">' + e.station + '</span>';
                    if (e.operator) html += '<span style="font-size: var(--fs-xs);color:#a78bfa;margin-right: var(--space-xs);">' + e.operator + '</span>';
                    html += '<span style="font-size: var(--fs-xs);color:#cbd5e1;">' + fbActivityLabel(e.action) + '</span>';
                    if (e.details) html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-top: var(--space-2xs);">' + e.details + '</div>';
                    html += '</div></div>';
                });
            });
        }

        html += '<div style="display:flex;gap: var(--space-sm);margin-top: var(--space-lg);">';
        html += '<button onclick="fbShowSettings()" style="flex:1;padding: var(--space-sm);background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Volver</button>';
        html += '<button onclick="fbActivityShowFeed()" style="flex:1;padding: var(--space-sm);background:#6366f1;color:#fff;border:none;border-radius: var(--radius-lg);cursor:pointer;font-size: var(--fs-sm);">Actualizar</button>';
        html += '</div></div>';

        modal.innerHTML = html;
    });
}

function fbActivityLabel(action) {
    var labels = {
        'vehicle_registered': 'Vehículo registrado',
        'test_started': 'Prueba iniciada',
        'test_completed': 'Prueba completada',
        'vehicle_released': 'Vehículo liberado',
        'soak_started': 'Soak timer iniciado',
        'plan_generated': 'Plan semanal generado',
        'plan_accepted': 'Plan semanal aceptado',
        'test_imported': 'Resultados importados',
        'gas_reading': 'Lectura de gas registrada',
        'calibration': 'Calibración registrada',
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

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [v16.3] ALMACÉN DE ARCHIVOS — solo Firestore (Panel → Archivos)     ║
// ║  Espacio compartido de ~5MB para subir un documento (zip, pdf, ...) ║
// ║  desde un dispositivo y bajarlo desde otro, SIN Firebase Storage    ║
// ║  (evita el plan de pago Blaze). El archivo se convierte a base64 y  ║
// ║  se parte en fragmentos <1MB en una subcolección                    ║
// ║  (stations/{ws}/files/{fileId}/chunks/{i}); el METADATO             ║
// ║  (nombre, tamaño, quién, cuándo, N° de fragmentos) vive en          ║
// ║  stations/{ws}/files/{fileId}. Cabe en el plan gratis "Spark" —     ║
// ║  misma base de datos y mismas reglas que ya usa el resto de la app. ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_FILES_MAX_BYTES = 5 * 1024 * 1024; // 5MB — presupuesto TOTAL del almacén (tamaño real del archivo, sin contar el overhead de base64)
var FB_FILES_CHUNK_CHARS = 700 * 1024; // ~700KB de texto base64 por fragmento — margen bajo el límite de 1MiB/documento de Firestore
var _fbFilesUnsub = null;

// ¿Está todo listo para usar el almacén? (sync habilitado, sesión de laboratorio)
function fbFilesEnsureReady() {
    if (!fbSync.enabled || !fbSync.db) return { ok: false, reason: 'Conecta este dispositivo a Firebase primero (indicador de sincronización, arriba).' };
    var u = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (!_fbIsPasswordUser(u)) return { ok: false, reason: 'Sesión del laboratorio requerida — vuelve a iniciar sesión con la contraseña del dispositivo.' };
    return { ok: true };
}

function _fbFilesCollection() {
    return fbSync.db.collection('stations').doc(fbSync.stationId).collection('files');
}

function _fbFilesId() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Lista los archivos del almacén (ordenados del más reciente al más viejo) + bytes totales usados.
function fbFilesList(callback) {
    var ready = fbFilesEnsureReady();
    if (!ready.ok) { callback([], 0, ready.reason); return; }
    var quota = fbQuotaCheck('read');
    if (!quota.allowed) { callback([], 0, quota.reason); return; }

    _fbFilesCollection().orderBy('uploadedAt', 'desc').limit(100).get()
        .then(function(snap) {
            fbQuotaRecord('read');
            var list = [];
            var total = 0;
            snap.forEach(function(doc) {
                var d = doc.data();
                list.push({ id: doc.id, name: d.name, size: d.size || 0, contentType: d.contentType || '',
                    chunkCount: d.chunkCount || 0, uploadedBy: d.uploadedBy || '?', uploadedAt: d.uploadedAt || '' });
                total += d.size || 0;
            });
            callback(list, total, null);
        })
        .catch(function(err) {
            console.error('fbFilesList error:', err);
            callback([], 0, 'Error al listar archivos: ' + err.message);
        });
}

// Suscribe a cambios en vivo del almacén (otro dispositivo sube/borra → se refleja aquí).
// Llamar fbFilesUnsubscribe() al salir de la pestaña para no dejar el listener corriendo.
function fbFilesSubscribe(onChange) {
    fbFilesUnsubscribe();
    var ready = fbFilesEnsureReady();
    if (!ready.ok) return;
    try {
        _fbFilesUnsub = _fbFilesCollection().orderBy('uploadedAt', 'desc').limit(100)
            .onSnapshot(function() { onChange(); }, function(err) { console.warn('fbFilesSubscribe error:', err.message); });
    } catch (e) { console.warn('fbFilesSubscribe:', e.message); }
}
function fbFilesUnsubscribe() {
    if (_fbFilesUnsub) { try { _fbFilesUnsub(); } catch (e) {} _fbFilesUnsub = null; }
}

// Lee un File como base64 puro (sin el prefijo "data:<mime>;base64,").
function _fbFilesReadAsBase64(file, onDone, onError) {
    var reader = new FileReader();
    reader.onload = function() {
        var result = reader.result || '';
        var comma = result.indexOf(',');
        onDone(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = function() { onError(reader.error ? reader.error.message : 'No se pudo leer el archivo'); };
    reader.readAsDataURL(file);
}

// Sube un archivo (objeto File del input) respetando la cuota total de 5MB.
// El contenido se parte en fragmentos base64 guardados como documentos de Firestore.
// onProgress(pct 0-100) se llama durante la subida; onDone(ok, errorMsgOrNull).
function fbFilesUpload(file, onProgress, onDone) {
    var ready = fbFilesEnsureReady();
    if (!ready.ok) { onDone(false, ready.reason); return; }
    if (file.size > FB_FILES_MAX_BYTES) { onDone(false, 'El archivo (' + Math.round(file.size / 1024) + 'KB) supera el presupuesto total del almacén (5MB).'); return; }

    fbFilesList(function(list, totalBytes, listErr) {
        if (listErr) { onDone(false, listErr); return; }
        if (totalBytes + file.size > FB_FILES_MAX_BYTES) {
            var freeKB = Math.max(0, Math.round((FB_FILES_MAX_BYTES - totalBytes) / 1024));
            onDone(false, 'No hay espacio suficiente — quedan ' + freeKB + 'KB libres de 5MB. Borra algún archivo primero.');
            return;
        }
        var quota = fbQuotaCheck('write');
        if (!quota.allowed) { onDone(false, quota.reason); return; }

        _fbFilesReadAsBase64(file, function(b64) {
            var chunks = [];
            for (var i = 0; i < b64.length; i += FB_FILES_CHUNK_CHARS) chunks.push(b64.slice(i, i + FB_FILES_CHUNK_CHARS));

            var fileId = _fbFilesId();
            var col = _fbFilesCollection();
            var uploaderName = (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : 'Desconocido';
            var doneCount = 0;
            var failed = false;

            var writeMetadata = function() {
                col.doc(fileId).set({
                    name: file.name, size: file.size, contentType: file.type || '',
                    chunkCount: chunks.length, uploadedBy: uploaderName, uploadedAt: new Date().toISOString(), deviceId: FB_DEVICE_ID
                }).then(function() {
                    fbQuotaRecord('write');
                    if (onProgress) onProgress(100);
                    if (typeof auditLog === 'function') auditLog('panel', 'file_uploaded', { type: 'file', label: file.name }, Math.round(file.size / 1024) + 'KB');
                    onDone(true, null);
                }).catch(function(err) {
                    console.error('fbFilesUpload metadata error:', err);
                    onDone(false, 'Se subieron los datos pero falló el registro: ' + err.message);
                });
            };

            if (chunks.length === 0) { writeMetadata(); return; } // archivo de 0 bytes — sin fragmentos que subir

            chunks.forEach(function(chunkData, i) {
                col.doc(fileId).collection('chunks').doc(String(i)).set({ data: chunkData })
                    .then(function() {
                        if (failed) return;
                        fbQuotaRecord('write');
                        doneCount++;
                        if (onProgress) onProgress(Math.round((doneCount / chunks.length) * 95)); // último 5% para el doc de metadata
                        if (doneCount === chunks.length) writeMetadata();
                    })
                    .catch(function(err) {
                        if (failed) return;
                        failed = true;
                        console.error('fbFilesUpload chunk error:', err);
                        onDone(false, 'Error al subir: ' + err.message);
                    });
            });
        }, function(err) { onDone(false, 'Error al leer el archivo: ' + err); });
    });
}

// Borra un archivo (todos sus fragmentos + metadata). Irreversible. `meta` es el objeto
// devuelto por fbFilesList (necesita chunkCount para saber cuántos fragmentos borrar).
function fbFilesDelete(fileId, meta, fileName, onDone) {
    var ready = fbFilesEnsureReady();
    if (!ready.ok) { onDone(false, ready.reason); return; }

    var col = _fbFilesCollection();
    var chunkCount = (meta && meta.chunkCount) || 0;
    var deletes = [];
    for (var i = 0; i < chunkCount; i++) deletes.push(col.doc(fileId).collection('chunks').doc(String(i)).delete());

    Promise.all(deletes).then(function() {
        return col.doc(fileId).delete();
    }).then(function() {
        if (typeof auditLog === 'function') auditLog('panel', 'file_deleted', { type: 'file', label: fileName || fileId }, '');
        onDone(true, null);
    }).catch(function(err) {
        console.error('fbFilesDelete error:', err);
        onDone(false, 'Error al borrar: ' + err.message);
    });
}

// Descarga un archivo: junta sus fragmentos, decodifica base64 → Blob → URL temporal.
// `meta` es el objeto de fbFilesList (necesita chunkCount y contentType).
// onDone(ok, errorMsgOrNull, blobUrlOrNull) — el llamador debe revocar la URL cuando termine.
function fbFilesDownload(fileId, meta, onDone) {
    var ready = fbFilesEnsureReady();
    if (!ready.ok) { onDone(false, ready.reason); return; }
    var chunkCount = (meta && meta.chunkCount) || 0;
    if (chunkCount === 0) { onDone(false, 'Este archivo no tiene contenido guardado.'); return; }

    var col = _fbFilesCollection();
    var reads = [];
    for (var i = 0; i < chunkCount; i++) reads.push(col.doc(fileId).collection('chunks').doc(String(i)).get());

    Promise.all(reads).then(function(snaps) {
        for (var i = 0; i < snaps.length; i++) fbQuotaRecord('read');
        try {
            var b64 = snaps.map(function(s) { return s.data().data; }).join('');
            var binary = atob(b64);
            var bytes = new Uint8Array(binary.length);
            for (var j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
            var blob = new Blob([bytes], { type: (meta && meta.contentType) || 'application/octet-stream' });
            onDone(true, null, URL.createObjectURL(blob));
        } catch (e) {
            onDone(false, 'Error al reconstruir el archivo: ' + e.message);
        }
    }).catch(function(err) {
        console.error('fbFilesDownload error:', err);
        onDone(false, 'Error al descargar: ' + err.message);
    });
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [v17.13] REPORTES DE BUGS — respaldo compartido de lo que se envía ║
// ║  con el botón 🐞. Mismo mecanismo que el Almacén de Archivos:       ║
// ║  metadato en stations/{station}/bugreports/{id} y la captura en     ║
// ║  fragmentos base64 bajo su subcolección chunks/. Las reglas ya      ║
// ║  cubren cualquier subcolección de stations/ (match /{path=**}) —    ║
// ║  no hay reglas nuevas que desplegar.                                ║
// ║                                                                      ║
// ║  DOS CAMINOS, como el resto del sync: el SDK, y la API REST cuando  ║
// ║  el transporte del SDK está roto (el topbar lo muestra como         ║
// ║  "REST Sync"). PERO no basta con mirar fbSync._useREST: ese flag se ║
// ║  enciende recién cuando la prueba de conexión hace timeout (12 s),  ║
// ║  así que en los primeros segundos el SDK puede estar roto y el flag ║
// ║  todavía en false. Por eso _fbBugsSdkOrRest reintenta por REST ante ║
// ║  CUALQUIER fallo del SDK (rechazo o throw síncrono) en vez de       ║
// ║  rendirse — si no, guardar el token justo al abrir la app fallaba   ║
// ║  para siempre aunque el dispositivo acabara en modo REST un         ║
// ║  instante después.                                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_BUGS_MAX_BYTES = 8 * 1024 * 1024; // presupuesto propio del respaldo de bugs (independiente de los 5MB de Archivos)

// ¿Se puede usar el respaldo? Acepta el modo REST (a diferencia de
// fbFilesEnsureReady, que exige el SDK) — en REST el SDK está roto pero la
// escritura por HTTP sigue funcionando.
function fbBugsEnsureReady() {
    if (!fbSync.enabled || (!fbSync.db && !fbSync._useREST)) {
        return { ok: false, reason: 'Conecta este dispositivo a Firebase primero (indicador de sincronización, arriba).' };
    }
    var u = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (!_fbIsPasswordUser(u)) {
        return { ok: false, reason: 'Sesión del laboratorio requerida — vuelve a iniciar sesión con la contraseña del dispositivo.' };
    }
    return { ok: true };
}

/**
 * Corre una operación por el SDK y, si el SDK falla de CUALQUIER forma
 * (promesa rechazada, throw síncrono, o ni siquiera devolver una promesa),
 * la reintenta por REST. Todas las operaciones de este módulo escriben por
 * id con PATCH/set, así que reintentar es idempotente.
 */
function _fbBugsSdkOrRest(sdkCall, onSdkOk, restCall) {
    if (fbSync._useREST || !fbSync.db) { restCall(); return; }
    var settled = false;
    var fallback = function(why) {
        if (settled) return;
        settled = true;
        console.warn('fbBugs: el SDK no respondió (' + (why || 'sin detalle') + ') — reintentando por REST');
        restCall();
    };
    try {
        var p = sdkCall();
        if (!p || typeof p.then !== 'function') { fallback('el SDK no devolvió una promesa'); return; }
        p.then(function(res) {
            if (settled) return;
            settled = true;
            onSdkOk(res);
        }, function(err) { fallback(err && err.message); });
    } catch (err) {
        fallback(err && err.message);
    }
}

function _fbBugsCollection() {
    return fbSync.db.collection('stations').doc(fbSync.stationId).collection('bugreports');
}

function _fbBugsSettingsDoc() {
    return fbSync.db.collection('stations').doc(fbSync.stationId).collection('settings').doc('bugreports');
}

// ── Primitivos REST (reusan _fbIdTokenPromise/fbToFirestoreValue/fbFromFirestoreValue) ──
// `suffix` es la ruta relativa a stations/{station}/ — p.ej. 'bugreports/abc'
// o 'bugreports/abc/chunks/0'.

function _fbBugsRestUrl(suffix, query) {
    return 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_CONFIG.projectId +
        '/databases/(default)/documents/stations/' + encodeURIComponent(fbSync.stationId) +
        '/' + suffix + '?key=' + FIREBASE_CONFIG.apiKey + (query ? '&' + query : '');
}

function _fbBugsRestSend(method, suffix, fieldsObj, query) {
    return _fbIdTokenPromise().then(function(tok) {
        var headers = {};
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
        var init = { method: method, headers: headers };
        if (fieldsObj) {
            headers['Content-Type'] = 'application/json';
            var fields = {};
            Object.keys(fieldsObj).forEach(function(k) { fields[k] = fbToFirestoreValue(fieldsObj[k]); });
            init.body = JSON.stringify({ fields: fields });
        }
        return fetch(_fbBugsRestUrl(suffix, query), init).then(function(resp) {
            if (resp.ok) return resp.json().catch(function() { return {}; });
            return resp.text().then(function(t) {
                var msg = 'HTTP ' + resp.status;
                try { msg = JSON.parse(t).error.message || msg; } catch (e) {}
                throw new Error(msg);
            });
        });
    });
}

// Documento REST → objeto plano (con su id tomado del campo `name`).
function _fbBugsRestDocToObj(doc) {
    var obj = {};
    var fields = (doc && doc.fields) || {};
    Object.keys(fields).forEach(function(k) { obj[k] = fbFromFirestoreValue(fields[k]); });
    obj._id = doc && doc.name ? String(doc.name).split('/').pop() : '';
    return obj;
}

// Normaliza un documento (venga del SDK o de REST) a la fila que usa la bandeja.
function _fbBugsRow(id, d) {
    return {
        id: id, at: d.at || '', comment: d.comment || '', operator: d.operator || '?',
        version: d.version || '?', platform: d.platform || '', viewport: d.viewport || '',
        status: d.status || 'abierto', issueNumber: d.issueNumber || 0, issueUrl: d.issueUrl || '',
        shotUrl: d.shotUrl || '', chunkCount: d.chunkCount || 0, size: d.size || 0
    };
}

// Lista los reportes respaldados (del más reciente al más viejo). callback(list, errorOrNull)
function fbBugsList(callback) {
    var ready = fbBugsEnsureReady();
    if (!ready.ok) { callback([], ready.reason); return; }
    var quota = fbQuotaCheck('read');
    if (!quota.allowed) { callback([], quota.reason); return; }

    var viaRest = function() {
        _fbBugsRestSend('GET', 'bugreports', null, 'pageSize=100&orderBy=' + encodeURIComponent('at desc'))
            .then(function(res) {
                fbQuotaRecord('read');
                callback((res && res.documents ? res.documents : []).map(function(doc) {
                    var o = _fbBugsRestDocToObj(doc);
                    return _fbBugsRow(o._id, o);
                }), null);
            })
            .catch(function(err) {
                console.error('fbBugsList REST error:', err);
                callback([], 'No se pudo leer el respaldo: ' + err.message);
            });
    };

    _fbBugsSdkOrRest(
        function() { return _fbBugsCollection().orderBy('at', 'desc').limit(100).get(); },
        function(snap) {
            fbQuotaRecord('read');
            var list = [];
            snap.forEach(function(doc) { list.push(_fbBugsRow(doc.id, doc.data())); });
            callback(list, null);
        },
        viaRest
    );
}

// Sube un reporte (metadato + captura fragmentada). Tolerante: si el respaldo no
// se puede escribir el llamador sigue de largo con el issue de GitHub.
// onDone(ok, errorOrNull)
function fbBugsUpload(report, onDone) {
    onDone = onDone || function() {};
    var ready = fbBugsEnsureReady();
    if (!ready.ok) { onDone(false, ready.reason); return; }
    var quota = fbQuotaCheck('write');
    if (!quota.allowed) { onDone(false, quota.reason); return; }

    var c = report.ctx || {};
    var b64 = '';
    if (report.shot) {
        b64 = String(report.shot);
        var comma = b64.indexOf(',');
        if (comma >= 0) b64 = b64.slice(comma + 1);
    }
    var approxBytes = Math.round(b64.length * 0.75);
    if (approxBytes > FB_BUGS_MAX_BYTES) { onDone(false, 'La captura es demasiado grande para el respaldo.'); return; }

    var chunks = [];
    for (var i = 0; i < b64.length; i += FB_FILES_CHUNK_CHARS) chunks.push(b64.slice(i, i + FB_FILES_CHUNK_CHARS));

    var metaFields = function(chunkCount) {
        return {
            at: report.at, comment: report.comment,
            operator: c.operator || '?', version: c.version || '?',
            platform: c.platformLabel || c.platform || '', viewport: c.viewport || '',
            ua: c.ua || '', online: c.online !== false,
            errors: (c.errors || []).map(function(e) { return (e.type || 'error') + ': ' + (e.message || ''); }).join(' | ').slice(0, 1500),
            status: 'abierto', chunkCount: chunkCount, size: approxBytes,
            issueNumber: report.issueNumber || 0, issueUrl: report.issueUrl || '',
            deviceId: FB_DEVICE_ID
        };
    };

    var viaRest = function() {
        // Fragmentos primero, metadato al final (mismo orden que el SDK).
        var chain = Promise.resolve();
        chunks.forEach(function(chunkData, idx) {
            chain = chain.then(function() {
                return _fbBugsRestSend('PATCH', 'bugreports/' + report.id + '/chunks/' + idx, { data: chunkData });
            });
        });
        chain.then(function() {
            return _fbBugsRestSend('PATCH', 'bugreports/' + report.id, metaFields(chunks.length));
        }).then(function() {
            fbQuotaRecord('write');
            onDone(true, null);
        }).catch(function(err) {
            // El texto del reporte vale por sí solo: se registra sin la captura.
            console.warn('fbBugsUpload REST error:', err.message);
            _fbBugsRestSend('PATCH', 'bugreports/' + report.id, metaFields(0))
                .then(function() { fbQuotaRecord('write'); onDone(true, null); })
                .catch(function(err2) { onDone(false, err2.message); });
        });
    };

    _fbBugsSdkOrRest(
        function() {
            var col = _fbBugsCollection();
            return Promise.all(chunks.map(function(chunkData, idx) {
                return col.doc(report.id).collection('chunks').doc(String(idx)).set({ data: chunkData });
            })).then(function() {
                return col.doc(report.id).set(metaFields(chunks.length), { merge: true });
            });
        },
        function() { fbQuotaRecord('write'); onDone(true, null); },
        viaRest
    );
}

// Actualiza campos del metadato (número de issue, estado resuelto, etc.). onDone(ok, errorOrNull)
function fbBugsUpdateMeta(bugId, patch, onDone) {
    onDone = onDone || function() {};
    var ready = fbBugsEnsureReady();
    if (!ready.ok) { onDone(false, ready.reason); return; }

    var viaRest = function() {
        // updateMask.fieldPaths: sin él, PATCH reemplaza el documento entero y
        // borraría el comentario y la captura al marcar un issue como resuelto.
        var mask = Object.keys(patch).map(function(k) {
            return 'updateMask.fieldPaths=' + encodeURIComponent(k);
        }).join('&');
        _fbBugsRestSend('PATCH', 'bugreports/' + bugId, patch, mask)
            .then(function() { fbQuotaRecord('write'); onDone(true, null); })
            .catch(function(err) { console.warn('fbBugsUpdateMeta REST error:', err.message); onDone(false, err.message); });
    };

    _fbBugsSdkOrRest(
        function() { return _fbBugsCollection().doc(bugId).set(patch, { merge: true }); },
        function() { fbQuotaRecord('write'); onDone(true, null); },
        viaRest
    );
}

// Borra un reporte del respaldo (fragmentos + metadato). No toca el issue de GitHub.
function fbBugsDelete(bugId, meta, onDone) {
    onDone = onDone || function() {};
    var ready = fbBugsEnsureReady();
    if (!ready.ok) { onDone(false, ready.reason); return; }

    var chunkCount = (meta && meta.chunkCount) || 0;
    var audit = function() {
        if (typeof auditLog === 'function') auditLog('bugs', 'bug_deleted', { type: 'bug', label: bugId }, '');
    };

    var viaRest = function() {
        var dels = [];
        for (var i = 0; i < chunkCount; i++) dels.push(_fbBugsRestSend('DELETE', 'bugreports/' + bugId + '/chunks/' + i));
        Promise.all(dels)
            .then(function() { return _fbBugsRestSend('DELETE', 'bugreports/' + bugId); })
            .then(function() { audit(); onDone(true, null); })
            .catch(function(err) {
                console.error('fbBugsDelete REST error:', err);
                onDone(false, 'Error al borrar: ' + err.message);
            });
    };

    _fbBugsSdkOrRest(
        function() {
            var col = _fbBugsCollection();
            var deletes = [];
            for (var j = 0; j < chunkCount; j++) deletes.push(col.doc(bugId).collection('chunks').doc(String(j)).delete());
            return Promise.all(deletes).then(function() { return col.doc(bugId).delete(); });
        },
        function() { audit(); onDone(true, null); },
        viaRest
    );
}

// Rearma la captura de un reporte como dataURL. onDone(ok, errorOrNull, dataUrlOrNull)
function fbBugsDownloadShot(bugId, meta, onDone) {
    var ready = fbBugsEnsureReady();
    if (!ready.ok) { onDone(false, ready.reason, null); return; }
    var chunkCount = (meta && meta.chunkCount) || 0;
    if (chunkCount === 0) { onDone(false, 'Este reporte no tiene captura guardada.', null); return; }

    var viaRest = function() {
        var gets = [];
        for (var i = 0; i < chunkCount; i++) gets.push(_fbBugsRestSend('GET', 'bugreports/' + bugId + '/chunks/' + i));
        Promise.all(gets).then(function(docs) {
            for (var k = 0; k < docs.length; k++) fbQuotaRecord('read');
            var b64 = docs.map(function(d) { return _fbBugsRestDocToObj(d).data || ''; }).join('');
            onDone(true, null, 'data:image/jpeg;base64,' + b64);
        }).catch(function(err) {
            console.error('fbBugsDownloadShot REST error:', err);
            onDone(false, 'Error al descargar: ' + err.message, null);
        });
    };

    _fbBugsSdkOrRest(
        function() {
            var col = _fbBugsCollection();
            var reads = [];
            for (var j = 0; j < chunkCount; j++) reads.push(col.doc(bugId).collection('chunks').doc(String(j)).get());
            return Promise.all(reads);
        },
        function(snaps) {
            for (var n = 0; n < snaps.length; n++) fbQuotaRecord('read');
            try {
                var b64 = snaps.map(function(s) { return s.data().data; }).join('');
                onDone(true, null, 'data:image/jpeg;base64,' + b64);
            } catch (e) {
                onDone(false, 'Error al reconstruir la captura: ' + e.message, null);
            }
        },
        viaRest
    );
}

// Configuración compartida del reporte de bugs (token + repo). callback(settingsOrNull)
function fbBugsGetSettings(callback) {
    var ready = fbBugsEnsureReady();
    if (!ready.ok) { callback(null); return; }

    var viaRest = function() {
        _fbBugsRestSend('GET', 'settings/bugreports')
            .then(function(doc) { fbQuotaRecord('read'); callback(_fbBugsRestDocToObj(doc)); })
            .catch(function(err) { console.warn('fbBugsGetSettings REST:', err.message); callback(null); });
    };

    _fbBugsSdkOrRest(
        function() { return _fbBugsSettingsDoc().get(); },
        function(doc) { fbQuotaRecord('read'); callback(doc.exists ? doc.data() : null); },
        viaRest
    );
}

function fbBugsSaveSettings(settings, onDone) {
    onDone = onDone || function() {};
    var ready = fbBugsEnsureReady();
    if (!ready.ok) { onDone(false, ready.reason); return; }

    var payload = {
        token: settings.token || '', owner: settings.owner || '', repo: settings.repo || '',
        updatedAt: new Date().toISOString(), deviceId: FB_DEVICE_ID
    };

    var viaRest = function() {
        _fbBugsRestSend('PATCH', 'settings/bugreports', payload)
            .then(function() { fbQuotaRecord('write'); onDone(true, null); })
            .catch(function(err) { console.warn('fbBugsSaveSettings REST:', err.message); onDone(false, err.message); });
    };

    _fbBugsSdkOrRest(
        function() { return _fbBugsSettingsDoc().set(payload, { merge: true }); },
        function() { fbQuotaRecord('write'); onDone(true, null); },
        viaRest
    );
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.6.0] HISTORIAL INMUTABLE — stations/{ws}/auditlog/{id}          ║
// ║  Un documento por evento, escrito por REST `documents:commit` con   ║
// ║  precondición "no existe" (solo-crear) y la hora del servidor. La   ║
// ║  bandeja de salida (auditOutbox, app.js) se vacía en lotes; sin red ║
// ║  espera. El arreglo audit/current se sigue escribiendo como ESPEJO  ║
// ║  para los equipos sin actualizar (se retira en 3.0.0).              ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_AUDIT_BATCH = 100;
var FB_AUDIT_LEGACY_KEY = 'kia_audit_legacy_upto';
var _fbAuditFlushing = false, _fbAuditTimer = null;

function _fbAuditBase() {
    return 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_CONFIG.projectId + '/databases/(default)/documents';
}
// El espacio compartido, aunque el flush corra antes de que la conexión fije
// fbSync.stationId (si no, escribiría en "stations//auditlog").
function _fbAuditStation() {
    return fbSync.stationId || (typeof FB_SHARED_WORKSPACE !== 'undefined' ? FB_SHARED_WORKSPACE : 'KIA-EMLAB');
}
function _fbAuditDocName(id) {
    return 'projects/' + FIREBASE_CONFIG.projectId + '/databases/(default)/documents/stations/' +
        _fbAuditStation() + '/auditlog/' + String(id).replace(/[^\w.-]/g, '_');
}

/**
 * Escrituras de un commit REST para una lista de eventos. PURA.
 * Siempre CREAR (`currentDocument.exists=false`: la base rechaza pisar uno existente)
 * + `serverTs` = hora del servidor. También los heredados de antes de 2.6.0: con las
 * reglas publicadas una escritura sin precondición sobre uno existente sería un
 * "update" denegado y la bandeja se atoraría. Los campos que empiezan con "_" no viajan.
 */
function fbAuditCommitWrites(events, docNameFn) {
    return (events || []).map(function(ev) {
        var fields = {};
        Object.keys(ev).forEach(function(k) {
            if (k.charAt(0) === '_' || k === 'serverTs') return;
            fields[k] = fbToFirestoreValue(ev[k]);
        });
        return { update: { name: docNameFn(ev.id), fields: fields }, currentDocument: { exists: false },
                 updateTransforms: [{ fieldPath: 'serverTs', setToServerValue: 'REQUEST_TIME' }] };
    });
}

function _fbAuditCommit(writes) {
    return _fbIdTokenPromise().then(function(tok) {
        var headers = { 'Content-Type': 'application/json' };
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
        return fetch(_fbAuditBase() + ':commit?key=' + FIREBASE_CONFIG.apiKey,
            { method: 'POST', headers: headers, body: JSON.stringify({ writes: writes }) })
            .then(function(resp) {
                if (resp.ok) { fbQuotaRecord('write'); return true; }
                return resp.text().then(function(t) {
                    var msg = 'HTTP ' + resp.status, st = '';
                    try { var j = JSON.parse(t); msg = (j.error && j.error.message) || msg; st = (j.error && j.error.status) || ''; } catch (e) {}
                    var err = new Error(msg); err.status = resp.status; err.fsStatus = st;
                    throw err;
                });
            });
    });
}

/** ¿El error dice que el documento ya existe? (subido antes por este u otro intento). */
function _fbAuditAlreadyThere(err) {
    var s = String((err && err.fsStatus) || '') + ' ' + String((err && err.message) || '');
    return (err && err.status === 409) || /ALREADY_EXISTS|FAILED_PRECONDITION|already exists/i.test(s);
}

/** Sube un lote; devuelve los ids que ya están en la nube (entregados). */
function _fbAuditSend(batch) {
    var names = function(id) { return _fbAuditDocName(id); };
    return _fbAuditCommit(fbAuditCommitWrites(batch, names)).then(function() {
        return batch.map(function(e) { return e.id; });
    }).catch(function(err) {
        // Un commit es atómico: si UNO ya existía, falla el lote entero. Uno por uno.
        if (!_fbAuditAlreadyThere(err) || batch.length === 1) {
            if (batch.length === 1 && _fbAuditAlreadyThere(err)) return [batch[0].id];
            throw err;
        }
        var done = [];
        var chain = Promise.resolve();
        batch.forEach(function(ev) {
            chain = chain.then(function() {
                return _fbAuditCommit(fbAuditCommitWrites([ev], names)).then(function() { done.push(ev.id); },
                    function(e2) { if (_fbAuditAlreadyThere(e2)) done.push(ev.id); else throw e2; });
            });
        });
        return chain.then(function() { return done; }, function(e3) { e3.partial = done; throw e3; });
    });
}

function fbAuditFlushSoon() {
    if (_fbAuditTimer) return;
    _fbAuditTimer = setTimeout(function() { _fbAuditTimer = null; fbAuditFlush(); }, 3000);
}

function _fbAuditDropDelivered(ids) {
    if (!ids || !ids.length) return;
    var gone = {};
    ids.forEach(function(id) { gone[id] = true; });
    var rest = auditOutbox().filter(function(e) { return e && !gone[e.id]; });
    try { localStorage.setItem(AUDIT_OUTBOX_KEY, JSON.stringify(rest)); } catch (e) {}
}

/** Vacía la bandeja de salida a la nube. Resuelve {sent, pending, error}. */
function fbAuditFlush() {
    var box = (typeof auditOutbox === 'function') ? auditOutbox() : [];
    if (_fbAuditFlushing) return Promise.resolve({ sent: 0, pending: box.length, busy: true });
    if (!fbSync.enabled || !fbSyncModules.audit || typeof fetch === 'undefined' || !box.length) {
        return Promise.resolve({ sent: 0, pending: box.length });
    }
    _fbAuditFlushing = true;
    var sent = 0;
    var step = function() {
        var b = auditOutbox();
        if (!b.length) return Promise.resolve();
        var batch = b.slice(0, FB_AUDIT_BATCH);
        return _fbAuditSend(batch).then(function(ids) {
            _fbAuditDropDelivered(ids);
            sent += ids.length;
            if (ids.length === batch.length) return step();
        });
    };
    return step().then(function() {
        _fbAuditFlushing = false;
        fbSync.auditLastFlush = new Date().toISOString();
        fbSync.auditLastError = '';
        return { sent: sent, pending: auditOutbox().length };
    }, function(err) {
        _fbAuditFlushing = false;
        if (err && err.partial) { _fbAuditDropDelivered(err.partial); sent += err.partial.length; }
        fbSync.auditLastError = _fbBkErrText(err);
        return { sent: sent, pending: auditOutbox().length, error: fbSync.auditLastError };
    });
}

/**
 * Eventos de antes de 2.6.0 (sin cadena) que todavía no se subieron: van a la
 * colección permanente marcados `migrated`. Una marca de agua por fecha evita
 * volver a encolarlos. PURA respecto a sus argumentos.
 */
function fbAuditLegacyPending(trail, upto) {
    return (trail || []).filter(function(e) {
        return e && e.id && e.v !== 2 && (!upto || String(e.ts || '') > upto);
    });
}

/**
 * Encola lo heredado. Otro equipo ya pudo haber subido el mismo evento viejo: se
 * consulta una vez qué ids migrados existen en ese tramo (solo el campo id) para no
 * mandar cientos de escrituras que la base rechazaría. Resuelve el número encolado.
 */
function fbAuditQueueLegacy() {
    if (typeof auditGetTrail !== 'function') return Promise.resolve(0);
    var upto = '';
    try { upto = localStorage.getItem(FB_AUDIT_LEGACY_KEY) || ''; } catch (e) {}
    var pend = fbAuditLegacyPending(auditGetTrail(), upto);
    if (!pend.length) return Promise.resolve(0);
    var ts = pend.map(function(e) { return String(e.ts || ''); }).sort();
    return fbAuditQuery(ts[0], ts[ts.length - 1], 5000, ['id']).then(function(r) {
        var there = {};
        r.events.forEach(function(e) { there[e.id] = true; });
        var box = auditOutbox(), inBox = {}, n = 0;
        box.forEach(function(e) { inBox[e.id] = true; });
        pend.forEach(function(e) {
            if (inBox[e.id] || there[e.id]) return;
            box.push(Object.assign({}, e, { migrated: true }));
            n++;
        });
        try {
            localStorage.setItem(AUDIT_OUTBOX_KEY, JSON.stringify(box));
            localStorage.setItem(FB_AUDIT_LEGACY_KEY, ts[ts.length - 1]);
        } catch (e) {}
        return n;
    });
}

/**
 * Consulta la colección permanente por rango de fechas (ISO, inclusivo), la más
 * reciente primero. Resuelve {events, truncated}.
 */
function fbAuditQuery(fromIso, toIso, limit, onlyFields) {
    limit = limit || 1000;
    if (!fbSync.enabled || typeof fetch === 'undefined') return Promise.reject(new Error('La sincronización está apagada en este equipo.'));
    var filters = [];
    if (fromIso) filters.push({ fieldFilter: { field: { fieldPath: 'ts' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: fromIso } } });
    if (toIso) filters.push({ fieldFilter: { field: { fieldPath: 'ts' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: toIso } } });
    var q = { from: [{ collectionId: 'auditlog' }], orderBy: [{ field: { fieldPath: 'ts' }, direction: 'DESCENDING' }], limit: limit };
    if (onlyFields) q.select = { fields: onlyFields.map(function(f) { return { fieldPath: f }; }) };
    if (filters.length === 1) q.where = filters[0];
    else if (filters.length > 1) q.where = { compositeFilter: { op: 'AND', filters: filters } };
    return _fbIdTokenPromise().then(function(tok) {
        var headers = { 'Content-Type': 'application/json' };
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
        return fetch(_fbAuditBase() + '/stations/' + encodeURIComponent(_fbAuditStation()) + ':runQuery?key=' + FIREBASE_CONFIG.apiKey,
            { method: 'POST', headers: headers, body: JSON.stringify({ structuredQuery: q }) });
    }).then(function(resp) {
        if (!resp.ok) return resp.text().then(function(t) {
            var msg = 'HTTP ' + resp.status;
            try { msg = JSON.parse(t).error.message || msg; } catch (e) {}
            throw new Error(msg);
        });
        return resp.json();
    }).then(function(rows) {
        var events = (rows || []).filter(function(r) { return r && r.document; }).map(function(r) {
            var o = _fbBugsRestDocToObj(r.document);
            delete o._id;
            return o;
        });
        fbQuotaRecord('read');
        return { events: events, truncated: events.length >= limit };
    });
}

/** Trae lo reciente de la nube (todos los equipos) al caché de la pantalla. */
function fbAuditFetchRecent(days) {
    var from = new Date(Date.now() - (days || 7) * 86400000).toISOString();
    return fbAuditQuery(from, '', 1000).then(function(r) {
        if (typeof auditMergeIntoCache === 'function') auditMergeIntoCache(r.events);
        return r;
    });
}

/** Tras cada pull: encolar lo heredado, vaciar la bandeja y traer lo reciente. */
function fbAuditAfterPull() {
    if (!fbSync.enabled || !fbSyncModules.audit) return;
    fbAuditQueueLegacy().catch(function() { return 0; })
        .then(function() { return fbAuditFlush(); })
        .then(function() { return fbAuditFetchRecent(7); })
        .catch(function(e) { console.warn('Historial: no se pudo consultar la nube', e && e.message); });
}

/** Estado para Datos → Auditoría / Sistema y las Alertas. */
function fbAuditStatus() {
    var box = (typeof auditOutbox === 'function') ? auditOutbox() : [];
    var oldest = box.length ? box.reduce(function(m, e) { return (!m || e.ts < m) ? e.ts : m; }, '') : '';
    return { pending: box.length, oldest: oldest, lastFlush: fbSync.auditLastFlush || '', lastError: fbSync.auditLastError || '',
             enabled: !!(fbSync.enabled && fbSyncModules.audit) };
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.7.0] LÍMITES COMPARTIDOS — settings/regulations + regversions/{n}║
// ║  La versión vigente vive en settings/regulations; cada publicación   ║
// ║  CREA regversions/{n} en el mismo commit (precondición "no existe"): ║
// ║  si dos equipos publican la misma versión a la vez, el segundo falla ║
// ║  y se le pide revisar, en vez de pisar al primero.                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_REG_SHARED_KEY = 'kia_regulations_shared';

function _fbStationDocName(path) {
    return 'projects/' + FIREBASE_CONFIG.projectId + '/databases/(default)/documents/stations/' + _fbAuditStation() + '/' + path;
}

/** Documento de Firestore → versión compartida. PURA. */
function fbRegParseShared(obj) {
    if (!obj || !obj.version) return null;
    var profiles = [];
    try { profiles = typeof obj.profiles === 'string' ? JSON.parse(obj.profiles) : (obj.profiles || []); } catch (e) { profiles = []; }
    return { version: Number(obj.version), hash: obj.hash || '', profiles: profiles, publishedBy: obj.publishedBy || '',
             publishedAt: obj.publishedAt || '', note: obj.note || '', device: obj.device || '' };
}

/** Escrituras para publicar la versión n. PURA. */
function fbRegPublishWrites(n, profiles, meta, docNameFn) {
    var fields = {
        version: fbToFirestoreValue(n), hash: fbToFirestoreValue(regProfilesHash(profiles)),
        profiles: fbToFirestoreValue(JSON.stringify(regProfilesCanonical(profiles))),
        publishedBy: fbToFirestoreValue(meta.by || ''), publishedAt: fbToFirestoreValue(meta.at || ''),
        note: fbToFirestoreValue(meta.note || ''), device: fbToFirestoreValue(meta.device || '')
    };
    return [
        { update: { name: docNameFn('regversions/v' + n), fields: fields }, currentDocument: { exists: false },
          updateTransforms: [{ fieldPath: 'serverTs', setToServerValue: 'REQUEST_TIME' }] },
        { update: { name: docNameFn('settings/regulations'), fields: fields },
          updateTransforms: [{ fieldPath: 'serverTs', setToServerValue: 'REQUEST_TIME' }] }
    ];
}

/** Lee la versión vigente del laboratorio. Resuelve la versión o null (nunca publicada). */
function fbRegFetchShared() {
    if (!fbSync.enabled || typeof fetch === 'undefined') return Promise.reject(new Error('La sincronización está apagada en este equipo.'));
    return _fbBugsRestSend('GET', 'settings/regulations').then(function(doc) {
        fbQuotaRecord('read');
        var sh = fbRegParseShared(_fbBugsRestDocToObj(doc));
        try { localStorage.setItem(FB_REG_SHARED_KEY, JSON.stringify({ shared: sh, at: new Date().toISOString() })); } catch (e) {}
        return sh;
    }, function(err) {
        if (_fbBkIsNotFound(err)) {
            try { localStorage.setItem(FB_REG_SHARED_KEY, JSON.stringify({ shared: null, at: new Date().toISOString() })); } catch (e) {}
            return null;
        }
        throw err;
    });
}

/** Última versión vista (sin red): {shared, at} o null si nunca se consultó. */
function fbRegCachedShared() {
    try { return JSON.parse(localStorage.getItem(FB_REG_SHARED_KEY)) || null; } catch (e) { return null; }
}

/**
 * Compara con el laboratorio y, si este equipo no tiene cambios propios y hay versión
 * nueva, la adopta solo. Resuelve el estado (regSyncState) + la versión compartida.
 */
function fbRegCheck(opts) {
    opts = opts || {};
    return fbRegFetchShared().then(function(sh) {
        var st = regSyncState(loadRegulations(), sh);
        if (st.state === 'atrasado') {
            var d = regAdoptShared(sh, 'Actualizado a la versión ' + sh.version + ' del laboratorio');
            if (!opts.quiet && typeof showToast === 'function') {
                showToast('Límites de regulación actualizados a la versión ' + sh.version + ' del laboratorio (' + d.length + ' cambio(s)).', 'info', 7000);
            }
            st = regSyncState(loadRegulations(), sh);
        }
        st.shared = sh;
        return st;
    });
}

/**
 * Publica los límites de ESTE equipo como la versión siguiente del laboratorio.
 * Se niega si otro equipo publicó entre la consulta y el commit (la versión n ya existe).
 */
function fbRegPublish(note, opts) {
    opts = opts || {};
    if (typeof authRequire === 'function' && !authRequire('regulation.manage', 'publicar los límites del laboratorio')) {
        return Promise.resolve({ ok: false, reason: 'Tu rol no puede publicar límites.' });
    }
    return fbRegFetchShared().then(function(sh) {
        var data = loadRegulations();
        var st = regSyncState(data, sh);
        if (st.state === 'al-dia') return { ok: true, version: sh.version, nada: true };
        if ((st.state === 'conflicto' || st.state === 'distinto') && !opts.override) {
            return { ok: false, state: st.state, reason: 'El laboratorio tiene otra versión: revisa las diferencias antes de publicar.' };
        }
        var n = (sh ? sh.version : 0) + 1;
        var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
        var meta = { by: who, at: new Date().toISOString(), note: note || '', device: (typeof FB_DEVICE_ID !== 'undefined' ? FB_DEVICE_ID : '') };
        return _fbAuditCommit(fbRegPublishWrites(n, data.profiles, meta, _fbStationDocName)).then(function() {
            data.shared = { version: n, hash: regProfilesHash(data.profiles), at: meta.at };
            saveRegulations();
            var nuevo = { version: n, hash: data.shared.hash, profiles: regProfilesCanonical(data.profiles), publishedBy: who, publishedAt: meta.at, note: meta.note };
            try { localStorage.setItem(FB_REG_SHARED_KEY, JSON.stringify({ shared: nuevo, at: meta.at })); } catch (e) {}
            if (typeof auditLog === 'function') {
                auditLog('regulations', 'regulacion_publicada', { type: 'regulation', label: 'versión ' + n },
                    'Límites publicados como versión ' + n + ' del laboratorio' + (note ? ' · ' + note : '') +
                    (sh ? ' · ' + regProfilesDiff(sh.profiles, data.profiles).length + ' cambio(s) sobre la versión ' + sh.version : ' · primera versión'),
                    { before: sh ? regProfilesLimitMap(sh.profiles) : null, after: regProfilesLimitMap(data.profiles) });
            }
            return { ok: true, version: n };
        }, function(err) {
            if (_fbAuditAlreadyThere(err)) return { ok: false, reason: 'Otro equipo publicó la versión ' + n + ' en este momento. Vuelve a abrir Regulaciones y revisa las diferencias.' };
            return { ok: false, reason: 'No se pudo publicar: ' + _fbBkErrText(err) };
        });
    }, function(err) {
        return { ok: false, reason: 'No se pudo consultar la nube: ' + _fbBkErrText(err) };
    });
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.9.0] UN DOCUMENTO POR VEHÍCULO — stations/{ws}/vehicles/{id}     ║
// ║  Los vehículos ya no dependen de caber juntos en un documento de     ║
// ║  1 MiB: cada uno viaja en el suyo (JSON en el campo `json`) y lo que ║
// ║  no es vehículo (marcas de borrado, configs manuales) en             ║
// ║  cop15meta/current, escrito en el MISMO commit para que su listener  ║
// ║  avise a los demás equipos. Un ciclo es SIEMPRE "traer y después     ║
// ║  subir": nunca se sube sin haber fusionado antes lo de la nube.      ║
// ║  cop15/current se sigue escribiendo como COPIA para los equipos sin  ║
// ║  actualizar mientras quepa.                                          ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_VEH_KNOWN_KEY = 'kia_fb_veh_known';
var FB_VEH_BATCH = 20;                    // documentos por commit
var FB_VEH_MARGIN_MS = 5 * 60 * 1000;     // relectura hacia atrás: un commit en vuelo no se pierde
var FB_VEH_DEBOUNCE_MS = 2500;
var FB_VEH_POLL_MS = 5 * 60 * 1000;       // solo sin listener en vivo (modo REST, file://)
var _fbVehBusy = false, _fbVehAgain = false, _fbVehTimer = null, _fbVehPollTimer = null;

/** Id del documento de un vehículo. PURA. Se ancla al id (no al VIN: corregir el VIN no mueve el documento). */
function fbVehDocId(v) {
    var raw = (v && v.id !== undefined && v.id !== null && v.id !== '') ? String(v.id) : ('vin_' + String((v && v.vin) || ''));
    return 'v_' + raw.replace(/[^\w.-]/g, '_');
}

/**
 * Lo compartido de `db` que no es un vehículo. PURA. Lista CERRADA: `lastId` y
 * `version` son de cada equipo y, si viajaran, dos equipos se re-escribirían la meta
 * (y se despertarían el uno al otro) para siempre. Todo campo nuevo de `db` que deba
 * verse en todos los equipos se agrega aquí y a la unión de fbMergeExecute.
 */
var FB_VEH_META_KEYS = ['deletedVehicles', 'manualConfigs'];
function fbVehMeta(d) {
    var out = {};
    FB_VEH_META_KEYS.forEach(function(k) { if (d && d[k] !== undefined) out[k] = d[k]; });
    return out;
}

/** ¿Hay aquí algo de la meta que la nube (`remote`) no tiene? PURA respecto a sus argumentos. */
function fbVehMetaHasExtras(local, remote) {
    remote = remote || {};
    if (_fbTombsNewTo(remote.deletedVehicles || [], (local && local.deletedVehicles) || [])) return true;
    return typeof manualConfigsNewTo === 'function' &&
        manualConfigsNewTo(remote.manualConfigs || [], (local && local.manualConfigs) || []);
}

/**
 * Qué subir. PURA.
 * known: {docId: rev|'deleted'} = lo que este equipo sabe que la nube ya tiene.
 * - upserts: vehículos cuyo `_rev` no es el que la nube tiene.
 * - deletes: marcas de borrado con id cuyo vehículo YA NO existe aquí (una marca
 *   `vin-corregido` conserva el id del vehículo vivo: esa no borra el documento).
 */
function fbVehPushPlan(vehicles, tombs, known, hold) {
    known = known || {};
    hold = hold || {};
    var upserts = [], deletes = [], vivos = {};
    (vehicles || []).forEach(function(v) {
        if (!v || typeof v !== 'object') return;
        var id = fbVehDocId(v);
        vivos[id] = true;
        // [2.35.0] Lo que espera la revisión al reconectar no se sube.
        if (hold[id]) return;
        if (known[id] !== (v._rev || '')) upserts.push(v);
    });
    var vistos = {};
    (tombs || []).forEach(function(t) {
        if (!t || t.id === undefined || t.id === null || t.id === '') return;
        var id = fbVehDocId({ id: t.id });
        if (vivos[id] || vistos[id] || known[id] === 'deleted') return;
        vistos[id] = true;
        deletes.push({ docId: id, id: t.id, vin: t.vin || '' });
    });
    return { upserts: upserts, deletes: deletes };
}

/** Escrituras de un commit. PURA. `meta` (opcional) va al final con la hora del servidor. */
function fbVehWrites(upserts, deletes, meta, docNameFn, device) {
    var ts = [{ fieldPath: 'serverTs', setToServerValue: 'REQUEST_TIME' }];
    var w = [];
    (upserts || []).forEach(function(v) {
        var json = JSON.stringify(v);
        w.push({ update: { name: docNameFn('vehicles/' + fbVehDocId(v)), fields: {
            json: { stringValue: json }, vin: { stringValue: String(v.vin || '') }, id: { stringValue: String(v.id) },
            rev: { stringValue: String(v._rev || '') }, deleted: { booleanValue: false }, writer: { stringValue: device || '' }
        } }, updateTransforms: ts });
    });
    (deletes || []).forEach(function(d) {
        w.push({ update: { name: docNameFn('vehicles/' + d.docId), fields: {
            vin: { stringValue: String(d.vin || '') }, id: { stringValue: String(d.id) }, rev: { stringValue: 'deleted' },
            deleted: { booleanValue: true }, writer: { stringValue: device || '' }
        } }, updateTransforms: ts });
    });
    if (meta) {
        w.push({ update: { name: docNameFn('cop15meta/current'), fields: {
            json: { stringValue: JSON.stringify(meta) }, writer: { stringValue: device || '' }
        } }, updateTransforms: ts });
    }
    return w;
}

/**
 * Documentos de `vehicles` → {vehicles, revs:{docId: rev}, maxTs, bad}. PURA.
 * `docs` son objetos planos (fbFromFirestoreValue) con `_id`. Un documento marcado
 * `deleted` no trae vehículo: lo retira la marca de borrado de cop15meta.
 */
function fbVehParseDocs(docs) {
    var out = { vehicles: [], revs: {}, info: {}, maxTs: 0, bad: 0 };
    (docs || []).forEach(function(d) {
        if (!d) return;
        var t = Date.parse(d.serverTs || '') || 0;
        if (t > out.maxTs) out.maxTs = t;
        var id = d._id || '';
        // [2.14.0] Cuándo llegó a la nube y desde qué equipo: lo lee el chip ☁ del vehículo.
        if (id) out.info[id] = { ts: d.serverTs || '', w: d.writer || '' };
        if (d.deleted) { if (id) out.revs[id] = 'deleted'; return; }
        var v = null;
        try { v = JSON.parse(d.json || 'null'); } catch (e) { v = null; }
        if (!v || typeof v !== 'object' || !v.vin) { out.bad++; return; }
        out.vehicles.push(v);
        if (id) out.revs[id] = v._rev || d.rev || '';
    });
    return out;
}

function fbVehKnown() {
    var k = null;
    try { k = JSON.parse(localStorage.getItem(FB_VEH_KNOWN_KEY) || 'null'); } catch (e) { k = null; }
    if (!k || typeof k !== 'object') k = {};
    if (!k.docs || typeof k.docs !== 'object') k.docs = {};
    k.watermark = Number(k.watermark) || 0;
    return k;
}
function _fbVehKnownSave(k) {
    try { localStorage.setItem(FB_VEH_KNOWN_KEY, JSON.stringify(k)); } catch (e) { console.warn('kia_fb_veh_known:', e); }
}

/** ¿Este equipo sube vehículos uno por uno? (siempre que Pruebas se sincronice). */
function fbVehActive() {
    return !!(typeof fbSync !== 'undefined' && fbSync.enabled && typeof fbSyncModules !== 'undefined' && fbSyncModules.cop15);
}

/** Consulta de los vehículos cambiados desde `sinceMs` (0 = todos). Resuelve documentos planos. */
function _fbVehQuery(sinceMs) {
    var q = { from: [{ collectionId: 'vehicles' }] };
    if (sinceMs > 0) {
        q.where = { fieldFilter: { field: { fieldPath: 'serverTs' }, op: 'GREATER_THAN_OR_EQUAL',
            value: { timestampValue: new Date(sinceMs).toISOString() } } };
    }
    return _fbIdTokenPromise().then(function(tok) {
        var headers = { 'Content-Type': 'application/json' };
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
        return fetch(_fbAuditBase() + '/stations/' + encodeURIComponent(_fbAuditStation()) + ':runQuery?key=' + FIREBASE_CONFIG.apiKey,
            { method: 'POST', headers: headers, body: JSON.stringify({ structuredQuery: q }) });
    }).then(function(resp) {
        if (!resp.ok) return resp.text().then(function(t) {
            var msg = 'HTTP ' + resp.status;
            try { msg = JSON.parse(t).error.message || msg; } catch (e) {}
            throw new Error(msg);
        });
        return resp.json();
    }).then(function(rows) {
        var docs = (rows || []).filter(function(r) { return r && r.document; }).map(function(r) { return _fbBugsRestDocToObj(r.document); });
        for (var i = 0; i < Math.max(1, docs.length); i++) fbQuotaRecord('read');
        return docs;
    });
}

function _fbVehGetMeta() {
    return _fbBugsRestSend('GET', 'cop15meta/current', null).then(function(doc) {
        fbQuotaRecord('read');
        var o = _fbBugsRestDocToObj(doc);
        try { return JSON.parse(o.json || 'null'); } catch (e) { return null; }
    }, function(err) {
        if (_fbBkIsNotFound(err)) return null;
        throw err;
    });
}

/**
 * Trae de la nube. Sin vehículos locales (o sin marca de agua) trae TODOS: una semilla
 * nunca puede partir de una lista incompleta. Aplica con el mismo motor que el pull
 * del documento completo (_fbPullMergeModule), sin re-empujar la copia completa.
 */
function _fbVehPull(known) {
    var full = !known.watermark || !((typeof db !== 'undefined' && db && db.vehicles) || []).length;
    var since = full ? 0 : Math.max(0, known.watermark - FB_VEH_MARGIN_MS);
    return Promise.all([_fbVehGetMeta(), _fbVehQuery(since)]).then(function(r) {
        var meta = r[0], parsed = fbVehParseDocs(r[1]);
        var cambios = 0;
        if (parsed.vehicles.length || meta) {
            // Lo local de cada equipo (lastId, version) y lo que aún no esté en cop15meta
            // se conserva: una siembra (_fbPullSeed) reemplaza db con este objeto.
            var propio = {};
            Object.keys(db || {}).forEach(function(k) { if (k !== 'vehicles') propio[k] = db[k]; });
            var remote = Object.assign(propio, fbVehMeta(meta || {}), { vehicles: parsed.vehicles });
            if (!remote.deletedVehicles) remote.deletedVehicles = [];
            var before = _fbModuleFingerprint('cop15');
            var pulled = [];
            _fbPullMergeModule('cop15', remote, pulled, { noPushBack: true, noHistory: true });
            if (_fbModuleFingerprint('cop15') !== before) cambios = 1;
        }
        Object.keys(parsed.revs).forEach(function(id) { known.docs[id] = parsed.revs[id]; });
        if (!known.info || typeof known.info !== 'object') known.info = {};
        Object.keys(parsed.info).forEach(function(id) {
            known.info[id] = parsed.info[id];
            if (typeof _fbWriterSeen === 'function') _fbWriterSeen(parsed.info[id].w, 'veh', parsed.info[id].ts);
        });
        if (parsed.maxTs > known.watermark) known.watermark = parsed.maxTs;
        // Se decide DESPUÉS de fusionar: lo que ya vino de la nube no cuenta como propio.
        known.metaExtra = fbVehMetaHasExtras(fbVehMeta(db), meta);
        delete known.metaHash;
        _fbVehKnownSave(known);
        return { changed: cambios, received: parsed.vehicles.length, full: full };
    });
}

/** Sube lo que la nube no tiene, en lotes. El último lote lleva cop15meta. */
function _fbVehPush(known) {
    var d = (typeof db !== 'undefined' && db) ? db : { vehicles: [] };
    var hold = typeof fbReviewHeldDocs === 'function' ? fbReviewHeldDocs() : {};
    var plan = fbVehPushPlan(d.vehicles, d.deletedVehicles, known.docs, hold);
    // [2.35.0] Mientras la revisión está abierta, la meta (configs manuales) tampoco sube.
    var holdMeta = typeof fbReviewHolds === 'function' && fbReviewHolds('cop15');
    var meta = holdMeta ? null : fbVehMeta(d);
    var total = plan.upserts.length + plan.deletes.length;
    if (!total && (!known.metaExtra || holdMeta)) return Promise.resolve({ sent: 0 });
    var items = plan.upserts.map(function(v) { return { v: v }; }).concat(plan.deletes.map(function(x) { return { del: x }; }));
    var lotes = [];
    for (var i = 0; i < items.length; i += FB_VEH_BATCH) lotes.push(items.slice(i, i + FB_VEH_BATCH));
    if (!lotes.length) lotes.push([]);
    var dev = (typeof FB_DEVICE_ID !== 'undefined') ? FB_DEVICE_ID : '';
    var sent = 0;
    var chain = Promise.resolve();
    lotes.forEach(function(lote, li) {
        chain = chain.then(function() {
            var ups = lote.filter(function(x) { return x.v; }).map(function(x) { return x.v; });
            var dels = lote.filter(function(x) { return x.del; }).map(function(x) { return x.del; });
            var last = li === lotes.length - 1;
            // Una copia congelada: si el técnico edita mientras sube, la edición sale en el siguiente ciclo.
            var revs = ups.map(function(v) { return { id: fbVehDocId(v), rev: v._rev || '' }; });
            return _fbAuditCommit(fbVehWrites(ups, dels, last ? meta : null, _fbStationDocName, dev)).then(function() {
                for (var n = 1; n < ups.length + dels.length + (last && meta ? 1 : 0); n++) fbQuotaRecord('write');
                var at = new Date().toISOString();
                if (!known.info || typeof known.info !== 'object') known.info = {};
                revs.forEach(function(r) { known.docs[r.id] = r.rev; known.info[r.id] = { ts: at, w: dev }; });
                dels.forEach(function(x) { known.docs[x.docId] = 'deleted'; known.info[x.docId] = { ts: at, w: dev }; });
                if (last && meta) known.metaExtra = false;
                sent += ups.length + dels.length;
                _fbVehKnownSave(known);
            });
        });
    });
    return chain.then(function() { return { sent: sent }; });
}

/**
 * Un ciclo completo: traer, fusionar, subir lo propio. Nunca dos a la vez; si llega
 * un pedido mientras corre, se repite UNA vez al terminar.
 * Resuelve {ok, changed, received, sent} o {ok:false, error}.
 */
function fbVehiclesSync(opts) {
    opts = opts || {};
    if (!fbVehActive() || typeof fetch === 'undefined') return Promise.resolve({ ok: false, skipped: true });
    if (_fbVehBusy) { _fbVehAgain = true; return Promise.resolve({ ok: false, busy: true }); }
    var q = fbQuotaCheck('write');
    if (!q.allowed) return Promise.resolve({ ok: false, error: q.reason });
    _fbVehBusy = true;
    var known = fbVehKnown();
    var res = { ok: true, changed: 0, received: 0, sent: 0 };
    return _fbVehPull(known).then(function(p) {
        res.changed = p.changed; res.received = p.received;
        if (p.changed) {
            if (!opts.initial) _fbLiveToast('cop15');
            _fbAfterAutoMerge('cop15');
        }
        // [2.35.0] Primer ciclo de un equipo atrasado: decidir qué preguntar ANTES de subir.
        if (fbSync.review && fbSync.review.state === 'checking') fbReviewEvaluate(known);
        // Si todavía no se pudo decidir (falta el pull de Consumibles), este ciclo no sube nada.
        if (fbSync.review && fbSync.review.state === 'checking') return { sent: 0 };
        return _fbVehPush(known);
    }).then(function(s) {
        res.sent = s.sent;
        _fbReviewStampOk();
        fbSync.vehLastSync = new Date().toISOString();
        fbSync.vehLastError = '';
        fbSync.vehPulled = true;
        return res;
    }, function(err) {
        fbSync.vehLastError = _fbBkErrText(err);
        console.warn('Vehículos: no se pudo sincronizar —', fbSync.vehLastError);
        return { ok: false, error: fbSync.vehLastError };
    }).then(function(r) {
        _fbVehBusy = false;
        if (typeof fbSyncCapacityInvalidate === 'function') fbSyncCapacityInvalidate();
        if (_fbVehAgain) { _fbVehAgain = false; fbVehiclesSyncSoon(); }
        // [2.14.0] El chip de cada vehículo, el indicador y la hoja dicen lo que acaba de pasar.
        if (typeof fbVehChipsRefreshSoon === 'function') { try { fbVehChipsRefreshSoon(); } catch (e) {} }
        if (r && r.ok && typeof fbDeviceBeat === 'function') { try { fbDeviceBeat(); } catch (e) {} }
        return r;
    });
}

/** Pide un ciclo en unos segundos (junta varios guardados seguidos en uno). */
function fbVehiclesSyncSoon(ms) {
    if (!fbVehActive()) return;
    if (_fbVehTimer) clearTimeout(_fbVehTimer);
    _fbVehTimer = setTimeout(function() { _fbVehTimer = null; fbVehiclesSync(); }, ms === undefined ? FB_VEH_DEBOUNCE_MS : ms);
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.35.0] REVISIÓN AL RECONECTAR                                     ║
// ║                                                                      ║
// ║  Un equipo que llega con más de FB_STALE_DAYS días sin sincronizar   ║
// ║  NO sube solo lo que traía: Pruebas, Plan, Consumibles y CoP quedan  ║
// ║  detenidos hasta que alguien revisa una ventana (VINs que la nube no ║
// ║  tiene, lecturas de inventario más viejas que las de la nube). Lo    ║
// ║  marcado se sube; lo desmarcado se BORRA DE ESTE EQUIPO (sin marca   ║
// ║  de borrado: la nube nunca lo tuvo), con deshacer.                   ║
// ║                                                                      ║
// ║  La nube sigue siendo la copia compartida: esto no es un "equipo     ║
// ║  master". Solo protege a equipos con esta versión — uno con código   ║
// ║  viejo sincroniza antes de actualizarse.                             ║
// ╚══════════════════════════════════════════════════════════════════════╝
var FB_STALE_DAYS = 3;
var FB_REVIEW_UNDO_MS = 10000;
var FB_REVIEW_MODULES = ['cop15', 'testplan', 'inventory', 'cop'];
var _fbBootAt = new Date().toISOString();
var _fbReviewFinishTimer = null;

/** ¿Llega atrasado este equipo? `lastOkAt` = ISO de su última sincronización completa. PURA. */
function fbReviewStaleness(lastOkAt, nowMs, days) {
    var t = lastOkAt ? Date.parse(lastOkAt) : NaN;
    if (isNaN(t)) return { stale: true, since: null, days: null };
    var d = (nowMs - t) / 86400000;
    return { stale: d > days, since: new Date(t).toISOString(), days: Math.floor(d) };
}

/**
 * Lo que este equipo subiría y la nube no tiene. PURA.
 * src = {vehicles, cloudDocs:{docId:rev}, bootAt, localInv, remoteInv}
 * - vehicles: los que la nube nunca tuvo y ya existían al abrir la app (lo creado en esta
 *   sesión es trabajo de hoy y no se pregunta).
 * - inventory: por cilindro/tanque, las lecturas que la nube no tiene; `older` cuando TODAS
 *   son anteriores a la última de la nube (se propone no subirlas). Un cilindro/tanque que
 *   la nube no tiene sale como `newItem`.
 */
function fbReviewModel(src) {
    src = src || {};
    var docs = src.cloudDocs || {}, bootAt = src.bootAt || '';
    var vehicles = [];
    (src.vehicles || []).forEach(function(v) {
        if (!v || typeof v !== 'object') return;
        var docId = fbVehDocId(v);
        if (docs[docId]) return;
        var stamp = String(v.updatedAt || v.registeredAt || '');
        if (bootAt && stamp && stamp >= bootAt) return;
        var cfg = v.config || {};
        vehicles.push({ docId: docId, id: v.id, vin: String(v.vin || ''), configCode: String(v.configCode || ''),
                        model: String(cfg['Modelo'] || ''), status: v.status || '',
                        date: String(v.registeredAt || v.updatedAt || ''), stamp: stamp });
    });
    vehicles.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    var inventory = [];
    var R = src.remoteInv, L = src.localInv;
    if (R && L) {
        var rKey = function(r) { return r.date + '|' + (r.auto ? 'a' : 'h'); };
        var scan = function(kind, locList, remList, keyFn, valKey) {
            var rm = {};
            (remList || []).forEach(function(x) { if (x) rm[keyFn(x)] = x; });
            (locList || []).forEach(function(x) {
                if (!x) return;
                var key = keyFn(x), r = rm[key];
                var name = String(x.name || x.controlNo || x.id || key);
                if (!r) {
                    inventory.push({ kind: kind, key: key, name: name, newItem: true, older: false,
                                     readings: (x.readings || []).filter(Boolean).map(function(q) { return { date: q.date, value: q[valKey], auto: !!q.auto }; }),
                                     cloudLatest: null, behindDays: null });
                    return;
                }
                var have = {}, cloudLatest = '';
                (r.readings || []).forEach(function(q) { if (q && q.date) { have[rKey(q)] = true; if (q.date > cloudLatest) cloudLatest = q.date; } });
                var extra = (x.readings || []).filter(function(q) { return q && q.date && !have[rKey(q)]; });
                if (!extra.length) return;
                var newest = extra.reduce(function(m, q) { return q.date > m ? q.date : m; }, '');
                var older = !!cloudLatest && newest < cloudLatest;
                var behind = older ? Math.round((Date.parse(cloudLatest.slice(0, 10)) - Date.parse(newest.slice(0, 10))) / 86400000) : null;
                inventory.push({ kind: kind, key: key, name: name, newItem: false, older: older,
                                 readings: extra.map(function(q) { return { date: q.date, value: q[valKey], auto: !!q.auto }; }),
                                 cloudLatest: cloudLatest || null, behindDays: behind });
            });
        };
        scan('gas', L.gases, R.gases, function(g) { return String(g.controlNo || g.name || ''); }, 'psi');
        scan('fuel', L.fuelTanks, R.fuelTanks, function(t) { return String(t.id || t.name || ''); }, 'level');
    }
    return { vehicles: vehicles, inventory: inventory };
}

/** ¿Está detenida la subida de este módulo por una revisión? */
function fbReviewHolds(col) {
    var r = fbSync.review;
    return !!(r && (r.state === 'checking' || r.state === 'asking' || r.state === 'applied') && FB_REVIEW_MODULES.indexOf(col) >= 0);
}

/** Vehículos que no se suben mientras la revisión está abierta: {docId: true}. */
function fbReviewHeldDocs() {
    var r = fbSync.review, out = {};
    if (!r || r.state !== 'asking' || !r.model) return out;
    r.model.vehicles.forEach(function(v) { out[v.docId] = true; });
    return out;
}

function _fbReviewInit() {
    var k = fbVehKnown();
    // Equipos que vienen de antes de 2.35.0: la última sincronización se toma de la hora
    // del último vehículo que trajeron. Si esa hora es vieja, a lo más se revisa una vez
    // y, si no traen nada propio, no aparece ninguna ventana.
    if (!k.lastOkAt && k.watermark) { k.lastOkAt = new Date(k.watermark).toISOString(); _fbVehKnownSave(k); }
    var s = fbReviewStaleness(k.lastOkAt, Date.now(), FB_STALE_DAYS);
    return { state: s.stale ? 'checking' : 'idle', since: s.since, days: s.days, deferred: {}, model: null, remoteInv: null };
}

/** Marca la última sincronización completa de este equipo (solo fuera de una revisión). */
function _fbReviewStampOk() {
    if (fbSync.review && fbSync.review.state !== 'idle' && fbSync.review.state !== 'done') return;
    var k = fbVehKnown();
    k.lastOkAt = new Date().toISOString();
    _fbVehKnownSave(k);
}

/** Tras el primer ciclo con la nube: ¿hay algo que preguntar? */
function fbReviewEvaluate(known) {
    var r = fbSync.review;
    if (!r || r.state !== 'checking') return;
    // Las lecturas se comparan con lo que trajo el pull de Consumibles: sin él, se espera.
    if (fbSyncModules.inventory && !fbSync._pullCompleted) return;
    var model = fbReviewModel({
        vehicles: (typeof db !== 'undefined' && db && db.vehicles) || [],
        cloudDocs: fbVehActive() ? (known || fbVehKnown()).docs : null,
        bootAt: _fbBootAt,
        localInv: (typeof invState !== 'undefined') ? invState : null,
        remoteInv: r.remoteInv
    });
    // Sin vehículos por pieza (Pruebas no se sincroniza) no hay con qué comparar: no se pregunta por vehículos.
    if (!fbVehActive()) model.vehicles = [];
    if (!model.vehicles.length && !model.inventory.length) { fbReviewFinish(); return; }
    r.model = model;
    r.state = 'asking';
    fbUpdateIndicator();
    _fbReviewOpenWhenFree(0);
}

function _fbReviewOpenWhenFree(tries) {
    var busy = (typeof _bootStage !== 'undefined' && _bootStage !== 'lista') ||
               document.getElementById('globalModal') || document.getElementById('ui-flow') || document.getElementById('ficha');
    if (busy && tries < 30) { setTimeout(function() { _fbReviewOpenWhenFree(tries + 1); }, 2000); return; }
    fbReviewOpen();
}

function _fbRevEsc(s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
function _fbRevDate(iso) {
    if (!iso) return '—';
    var d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
function _fbRevAgo(days) {
    if (days == null) return '';
    if (days < 14) return days + ' día' + (days === 1 ? '' : 's');
    if (days < 60) return Math.round(days / 7) + ' semanas';
    return Math.round(days / 30) + ' meses';
}

/** La ventana. Lo marcado se sube; lo desmarcado se borra de este equipo. */
function fbReviewOpen() {
    var r = fbSync.review;
    if (!r || r.state !== 'asking' || !r.model) return;
    if (document.getElementById('globalModal')) return;
    var m = r.model;
    var head = r.since
        ? 'Este equipo no se sincronizaba desde el <strong>' + _fbRevDate(r.since) + '</strong> (hace ' + _fbRevAgo(r.days) + ').'
        : 'Este equipo no tiene registro de haberse sincronizado antes.';
    var html = '<p class="fbrev-intro">' + head + ' Antes de subir lo que trae, revisa qué entra a la nube del laboratorio. ' +
        '<strong>Lo marcado se sube; lo desmarcado se borra de este equipo</strong> (puedes deshacer). Mientras no decidas, este equipo no sube nada de Pruebas, Plan, Consumibles ni CoP.</p>';
    if (m.vehicles.length) {
        html += '<div class="fbrev-sec"><div class="fbrev-sec-head"><strong>🚗 ' + m.vehicles.length + ' vehículo' + (m.vehicles.length === 1 ? '' : 's') + ' que la nube no tiene</strong>' +
            '<span class="fbrev-all"><button type="button" class="fbrev-link" onclick="fbReviewCheckAll(\'veh\', true)">Todos</button> · ' +
            '<button type="button" class="fbrev-link" onclick="fbReviewCheckAll(\'veh\', false)">Ninguno</button></span></div><ul class="fbrev-list">';
        m.vehicles.forEach(function(v, i) {
            var st = (typeof CONFIG !== 'undefined' && CONFIG.statusLabels && CONFIG.statusLabels[v.status]) || v.status;
            html += '<li><label class="fbrev-row"><input type="checkbox" class="fbrev-chk" data-kind="veh" data-i="' + i + '" checked>' +
                '<span class="fbrev-main"><strong class="fbrev-vin">' + _fbRevEsc(v.vin || '(sin VIN)') + '</strong> ' +
                '<span class="fbrev-meta">' + _fbRevEsc([v.model, st, 'alta ' + _fbRevDate(v.date)].filter(Boolean).join(' · ')) + '</span>' +
                '<span class="fbrev-code">' + _fbRevEsc(v.configCode) + '</span></span></label></li>';
        });
        html += '</ul></div>';
    }
    if (m.inventory.length) {
        html += '<div class="fbrev-sec"><div class="fbrev-sec-head"><strong>🧪 Consumibles: lecturas que la nube no tiene</strong>' +
            '<span class="fbrev-all"><button type="button" class="fbrev-link" onclick="fbReviewCheckAll(\'inv\', true)">Todas</button> · ' +
            '<button type="button" class="fbrev-link" onclick="fbReviewCheckAll(\'inv\', false)">Ninguna</button></span></div><ul class="fbrev-list">';
        m.inventory.forEach(function(x, i) {
            var n = x.readings.length, auto = x.readings.filter(function(q) { return q.auto; }).length;
            var last = x.readings.reduce(function(a, q) { return q.date > a ? q.date : a; }, '');
            var what = x.newItem
                ? (x.kind === 'gas' ? 'Cilindro' : 'Tanque') + ' que la nube no tiene (' + n + ' lectura' + (n === 1 ? '' : 's') + ')'
                : n + ' lectura' + (n === 1 ? '' : 's') + (auto ? ' (' + auto + ' automática' + (auto === 1 ? '' : 's') + ' por prueba)' : '') + ', la más nueva del ' + _fbRevDate(last);
            var warn = x.older
                ? '<span class="fbrev-warn">⚠ ' + _fbRevAgo(x.behindDays) + ' más vieja' + (n === 1 ? '' : 's') + ' que la última de la nube (' + _fbRevDate(x.cloudLatest) + '). Se recomienda no subirla' + (n === 1 ? '' : 's') + '.</span>'
                : (x.cloudLatest ? '<span class="fbrev-meta">Última en la nube: ' + _fbRevDate(x.cloudLatest) + '</span>' : '');
            html += '<li><label class="fbrev-row' + (x.older ? ' is-old' : '') + '"><input type="checkbox" class="fbrev-chk" data-kind="inv" data-i="' + i + '"' + (x.older ? '' : ' checked') + '>' +
                '<span class="fbrev-main"><strong>' + _fbRevEsc(x.name) + '</strong> <span class="fbrev-meta">' + _fbRevEsc(what) + '</span>' + warn + '</span></label></li>';
        });
        html += '</ul></div>';
    }
    showModal({
        title: 'Revisar antes de subir',
        type: 'warning',
        body: '<div class="fbrev">' + html + '</div>',
        onCancel: function() { fbUpdateIndicator(); },
        buttons: [
            { label: 'Decidir después' },
            { label: 'Aplicar', cls: 'btn-primary', onclick: function() {
                var keep = { veh: {}, inv: {} };
                document.querySelectorAll('#globalModal .fbrev-chk').forEach(function(cb) {
                    if (cb.checked) keep[cb.getAttribute('data-kind')][cb.getAttribute('data-i')] = true;
                });
                var gm = document.getElementById('globalModal'); if (gm) gm.style.display = 'none';
                fbReviewApply(keep);
            } }
        ]
    });
}

function fbReviewCheckAll(kind, on) {
    document.querySelectorAll('#globalModal .fbrev-chk[data-kind="' + kind + '"]').forEach(function(cb) { cb.checked = !!on; });
}

/** Aplica la decisión. keep = {veh:{i:true}, inv:{i:true}} (índices del modelo). */
function fbReviewApply(keep) {
    var r = fbSync.review;
    if (!r || r.state !== 'asking' || !r.model) return;
    var m = r.model;
    var dropVeh = m.vehicles.filter(function(v, i) { return !keep.veh[i]; });
    var dropInv = m.inventory.filter(function(x, i) { return !keep.inv[i]; });

    // Foto para deshacer: solo lo que se toca.
    var snap = {
        vehicles: (db.vehicles || []).slice(),
        tested: (typeof tpState !== 'undefined' && tpState) ? JSON.stringify(tpState.testedList || []) : null,
        inv: (typeof invState !== 'undefined' && invState) ? JSON.stringify({ gases: invState.gases || [], fuelTanks: invState.fuelTanks || [], usageLog: invState.usageLog || [] }) : null
    };

    // Vehículos: fuera de este equipo, SIN marca de borrado (la nube nunca los tuvo), y con
    // ellos su evidencia en el plan y su consumo — si no, el Plan y Consumibles subirían
    // lo que la ventana acaba de descartar.
    if (dropVeh.length) {
        var ids = {}, vins = {};
        dropVeh.forEach(function(v) { ids[String(v.id)] = true; if (v.vin) vins[v.vin] = true; });
        db.vehicles = (db.vehicles || []).filter(function(v) { return !(v && ids[String(v.id)] && (!v.vin || vins[v.vin])); });
        if (typeof activeVehicleId !== 'undefined' && ids[String(activeVehicleId)]) activeVehicleId = null;
        if (typeof tpState !== 'undefined' && tpState && tpState.testedList) {
            tpState.testedList = tpState.testedList.filter(function(t) {
                var vid = typeof tpTestedVehicleId === 'function' ? tpTestedVehicleId(t) : t.vehicleId;
                var vin = typeof tpTestedVin === 'function' ? tpTestedVin(t) : t.vin;
                return !((vid !== undefined && vid !== null && ids[String(vid)]) || (vin && vins[vin] && (vid === undefined || vid === null)));
            });
        }
        if (typeof invState !== 'undefined' && invState && invState.usageLog) {
            invState.usageLog = invState.usageLog.filter(function(u) { return !(u && u.vin && vins[u.vin]); });
        }
    }
    // Consumibles: se quitan las lecturas descartadas (o el cilindro/tanque que la nube no tiene).
    if (dropInv.length && typeof invState !== 'undefined' && invState) {
        dropInv.forEach(function(x) {
            var list = x.kind === 'gas' ? invState.gases : invState.fuelTanks;
            var keyOf = x.kind === 'gas' ? function(g) { return String(g.controlNo || g.name || ''); } : function(t) { return String(t.id || t.name || ''); };
            if (!list) return;
            if (x.newItem) {
                var keepList = list.filter(function(it) { return !(it && keyOf(it) === x.key); });
                if (x.kind === 'gas') invState.gases = keepList; else invState.fuelTanks = keepList;
                return;
            }
            var it = list.find(function(y) { return y && keyOf(y) === x.key; });
            if (!it || !it.readings) return;
            var gone = {};
            x.readings.forEach(function(q) { gone[q.date + '|' + (q.auto ? 'a' : 'h')] = true; });
            it.readings = it.readings.filter(function(q) { return !(q && gone[q.date + '|' + (q.auto ? 'a' : 'h')]); });
            if (x.kind === 'fuel' && it.readings.length) it.currentLevel = it.readings[it.readings.length - 1].level;
        });
    }

    // Guardar: las subidas siguen detenidas (estado 'asking') hasta que pase la ventana de deshacer.
    try { if (dropVeh.length && typeof saveDB === 'function') saveDB(); } catch (e) {}
    try { if (dropVeh.length && typeof tpSave === 'function') { tpSave(); if (typeof tpInvalidateCache === 'function') tpInvalidateCache(); } } catch (e) {}
    try {
        if ((dropVeh.length || dropInv.length) && typeof invSave === 'function') {
            if (typeof invUpdateConsumptionModel === 'function') invUpdateConsumptionModel();
            invSave();
        }
    } catch (e) {}
    try { if (typeof refreshAllLists === 'function') refreshAllLists(); if (typeof invRender === 'function') invRender(); } catch (e) {}

    var upVeh = m.vehicles.length - dropVeh.length, upInv = m.inventory.length - dropInv.length;
    if (typeof auditLog === 'function') {
        auditLog('sync', 'revision_reconexion', { type: 'device', id: (typeof FB_DEVICE_ID !== 'undefined') ? FB_DEVICE_ID : '', label: 'Revisión al reconectar' },
            upVeh + ' vehículo(s) subidos, ' + dropVeh.length + ' borrados de este equipo; ' + upInv + ' grupo(s) de lecturas subidos, ' + dropInv.length + ' descartados',
            { after: { diasSinSync: r.days, subidos: m.vehicles.filter(function(v, i) { return keep.veh[i]; }).map(function(v) { return v.vin; }),
                       borrados: dropVeh.map(function(v) { return v.vin; }),
                       lecturasDescartadas: dropInv.map(function(x) { return x.name + ' (' + x.readings.length + ')'; }) } });
    }

    r.state = 'applied';
    r.lastSnap = snap;
    fbUpdateIndicator();
    var msg = 'Revisión aplicada: ' + upVeh + ' vehículo' + (upVeh === 1 ? '' : 's') + ' por subir' +
              (dropVeh.length ? ', ' + dropVeh.length + ' borrado' + (dropVeh.length === 1 ? '' : 's') + ' de este equipo' : '') +
              (m.inventory.length ? '; lecturas: ' + upInv + ' por subir, ' + dropInv.length + ' descartada' + (dropInv.length === 1 ? '' : 's') : '') + '.';
    if (typeof toastUndo === 'function' && (dropVeh.length || dropInv.length)) {
        toastUndo(msg, fbReviewUndo);
        if (_fbReviewFinishTimer) clearTimeout(_fbReviewFinishTimer);
        _fbReviewFinishTimer = setTimeout(function() { _fbReviewFinishTimer = null; if (fbSync.review.state === 'applied') fbReviewFinish(); }, FB_REVIEW_UNDO_MS);
    } else {
        if (typeof showToast === 'function') showToast(msg, 'success');
        fbReviewFinish();
    }
}

/** Deshacer: regresa lo borrado y vuelve a preguntar. */
function fbReviewUndo() {
    var r = fbSync.review;
    if (!r || r.state !== 'applied' || !r.lastSnap) return;
    if (_fbReviewFinishTimer) { clearTimeout(_fbReviewFinishTimer); _fbReviewFinishTimer = null; }
    var s = r.lastSnap;
    db.vehicles = s.vehicles;
    if (s.tested !== null && typeof tpState !== 'undefined' && tpState) tpState.testedList = JSON.parse(s.tested);
    if (s.inv !== null && typeof invState !== 'undefined' && invState) {
        var inv = JSON.parse(s.inv);
        invState.gases = inv.gases; invState.fuelTanks = inv.fuelTanks; invState.usageLog = inv.usageLog;
    }
    r.state = 'asking';
    try { saveDB(); } catch (e) {}
    try { if (typeof tpSave === 'function') { tpSave(); if (typeof tpInvalidateCache === 'function') tpInvalidateCache(); } } catch (e) {}
    try { if (typeof invSave === 'function') invSave(); } catch (e) {}
    try { if (typeof refreshAllLists === 'function') refreshAllLists(); } catch (e) {}
    fbUpdateIndicator();
    setTimeout(fbReviewOpen, 400);
}

/** Termina la revisión: libera las subidas detenidas y sube el estado ya revisado. */
function fbReviewFinish() {
    var r = fbSync.review;
    if (!r) return;
    var deferred = Object.keys(r.deferred || {});
    r.state = 'done';
    r.model = null; r.lastSnap = null; r.remoteInv = null; r.deferred = {};
    _fbReviewStampOk();
    // Una subida que quedó encolada ANTES de decidir trae la foto vieja: se descarta y se
    // sube el estado actual.
    if (typeof fbOfflineQueue !== 'undefined' && fbOfflineQueue.length) {
        for (var i = fbOfflineQueue.length - 1; i >= 0; i--) {
            if (FB_REVIEW_MODULES.indexOf(fbOfflineQueue[i].collection) >= 0) fbOfflineQueue.splice(i, 1);
        }
        if (typeof fbQueueSave === 'function') { try { fbQueueSave(); } catch (e) {} }
    }
    var states = { cop15: function() { return db; }, testplan: function() { return tpState; }, inventory: function() { return invState; },
                   cop: function() { var c = null; try { c = JSON.parse(localStorage.getItem('kia_cop_v1')); } catch (e) {} return c; } };
    deferred.forEach(function(col) {
        var data = states[col] ? states[col]() : null;
        if (data && fbSyncModules[col]) fbPush(col, data);
    });
    if (typeof fbVehiclesSyncSoon === 'function') fbVehiclesSyncSoon(500);
    fbUpdateIndicator();
}

fbSync.review = _fbReviewInit();

/**
 * Sin listener en vivo (modo REST o file://) no hay quién avise: un ciclo cada 5 min
 * mientras la app está a la vista. Con listener no hace falta y no corre.
 */
function _fbVehPollArm() {
    if (_fbVehPollTimer) return;
    _fbVehPollTimer = setInterval(function() {
        if (!fbVehActive() || fbSync._vehLive) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        fbVehiclesSync();
    }, FB_VEH_POLL_MS);
}

/** Vehículos que este equipo tiene y la nube todavía no (lo lee Datos → Sistema). */
function fbVehStatus() {
    var d = (typeof db !== 'undefined' && db) ? db : { vehicles: [] };
    var known = fbVehKnown();
    var plan = fbVehPushPlan(d.vehicles, d.deletedVehicles, known.docs);
    return { active: fbVehActive(), pending: plan.upserts.length + plan.deletes.length,
             lastSync: fbSync.vehLastSync || '', lastError: fbSync.vehLastError || '', live: !!fbSync._vehLive };
}

/** El documento más pesado de un vehículo (el tope ahora es por vehículo). PURA salvo el tamaño. */
function fbVehLargestDoc(vehicles) {
    var max = 0, vin = '';
    (vehicles || []).forEach(function(v) {
        if (!v) return;
        var b = _fbUtf8Bytes(JSON.stringify(v)) + 200;
        if (b > max) { max = b; vin = v.vin || ''; }
    });
    return { bytes: max, vin: vin };
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.14.0] ¿SE GUARDÓ? ¿LO VEN LOS DEMÁS?                             ║
// ║  El #131 fue de confianza: el técnico guardaba y no sabía si el otro ║
// ║  equipo ya lo veía. 2.9.0 ya sabe por vehículo qué tiene la nube     ║
// ║  (kia_fb_veh_known): aquí solo se DICE. Nada de esto agrega campos a ║
// ║  un vehículo ni cambia su huella: cuándo y desde qué equipo llegó a  ║
// ║  la nube sale del documento (serverTs + writer), no del vehículo.    ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_DEVICES_KEY = 'kia_fb_devices';            // caché: registro de equipos + escritores vistos
var FB_DEVICE_BEAT_MS = 30 * 60 * 1000;           // un equipo se reporta a lo más cada 30 min
var FB_DEVICE_STALE_DAYS = 30;                    // sin actividad en 30 días = inactivo (no bloquea la 3.0.0)
var FB_PER_VEHICLE_SINCE = '2.9.0';
var _fbDevBeatAt = 0, _fbChipTimer = null;

/** Compara dos versiones "2.10.1" (numérico por partes). PURA. */
function fbVersionCmp(a, b) {
    var pa = String(a || '0').split('.'), pb = String(b || '0').split('.');
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
        var x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0;
        if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
}

/** Hora corta de una marca ISO: "10:42" si es de `now`, si no "28 sep". PURA (zona local). */
function fbShortWhen(iso, now) {
    var t = Date.parse(iso || '');
    if (!t) return '';
    var d = new Date(t), n = new Date(now || Date.now());
    var pad = function(x) { return (x < 10 ? '0' : '') + x; };
    if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) {
        return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    var mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()];
    return d.getDate() + ' ' + mes + (d.getFullYear() !== n.getFullYear() ? ' ' + d.getFullYear() : '');
}

/**
 * Estado en la nube de UN vehículo. PURA. LA definición: el chip, la hoja del
 * indicador y las pruebas la usan; nadie vuelve a comparar huellas por su cuenta.
 * known = fbVehKnown(); st = {active, online, lastError}.
 * → {state:'nube'|'por-subir'|'error'|'sin-sync', at, writer, since, reason}
 */
function fbVehStateOf(v, known, st) {
    st = st || {};
    if (!v) return { state: 'sin-sync' };
    if (!st.active) return { state: 'sin-sync' };
    var id = fbVehDocId(v);
    var docs = (known && known.docs) || {};
    var info = (known && known.info && known.info[id]) || null;
    if (Object.prototype.hasOwnProperty.call(docs, id) && docs[id] === (v._rev || '')) {
        return { state: 'nube', at: (info && info.ts) || '', writer: (info && info.w) || '' };
    }
    var since = v.updatedAt || v.lastModified || '';
    if (st.online === false) return { state: 'error', reason: 'sin conexión', since: since };
    if (st.lastError) return { state: 'error', reason: String(st.lastError), since: since };
    return { state: 'por-subir', since: since };
}

/**
 * Texto del estado para una persona. PURA.
 * opts = {now, own (id de este equipo), names ({id: nombre})}
 * → {icon, text, title, cls}
 */
function fbVehStateLabel(s, opts) {
    opts = opts || {};
    s = s || { state: 'sin-sync' };
    if (s.state === 'nube') {
        var when = fbShortWhen(s.at, opts.now);
        var from = (s.writer && s.writer !== opts.own) ? ((opts.names && opts.names[s.writer]) || 'otro equipo') : '';
        return { icon: '☁', cls: 'is-nube',
            text: 'En la nube' + (when ? ' · ' + when : '') + (from ? ' · desde ' + from : ''),
            title: 'Los demás equipos ya ven esta versión' + (from ? ' (la subió ' + from + ')' : '') + '.' };
    }
    if (s.state === 'por-subir') {
        var viejo = s.since && (Number(opts.now || Date.now()) - Date.parse(s.since) > 2 * 60 * 1000);
        return { icon: '⏳', cls: 'is-pend',
            text: 'Por subir' + (viejo ? ' desde ' + fbShortWhen(s.since, opts.now) : ''),
            title: 'Guardado en este equipo. Se sube solo en unos segundos; los demás todavía no lo ven.' };
    }
    if (s.state === 'error') {
        var off = s.reason === 'sin conexión';
        return { icon: '⚠', cls: 'is-err',
            text: 'Sin subir: ' + (off ? 'sin conexión' : 'toca para ver'),
            title: 'Lo guardado está seguro en este equipo, pero los demás no lo ven todavía. ' +
                (off ? 'Se sube solo al volver la conexión.' : 'Motivo: ' + s.reason) };
    }
    return { icon: '💾', cls: 'is-local', text: 'Solo en este equipo',
        title: 'La sincronización está apagada: este vehículo no llega a los demás equipos.' };
}

/** Contexto real para fbVehStateOf/fbVehStateLabel. Memo corto: el Historial pinta
 *  decenas de chips seguidos y cada uno leería y parsearía localStorage. */
var _fbVehChipCtxMemo = null;
function _fbVehChipCtx() {
    if (_fbVehChipCtxMemo && Date.now() - _fbVehChipCtxMemo.t < 300) return _fbVehChipCtxMemo.ctx;
    var cache = fbDevicesCache();
    var names = {};
    Object.keys(cache.devices).forEach(function(id) { if (cache.devices[id].name) names[id] = cache.devices[id].name; });
    var ctx = {
        known: fbVehKnown(),
        st: { active: fbVehActive(), online: (typeof navigator !== 'undefined' && navigator.onLine === false) ? false : true,
              lastError: (typeof fbSync !== 'undefined' && fbSync.vehLastError) || '' },
        label: { now: Date.now(), own: (typeof FB_DEVICE_ID !== 'undefined') ? FB_DEVICE_ID : '', names: names }
    };
    _fbVehChipCtxMemo = { t: Date.now(), ctx: ctx };
    return ctx;
}

function _fbVehChipFill(el, v, ctx) {
    var s = fbVehStateOf(v, ctx.known, ctx.st);
    var L = fbVehStateLabel(s, ctx.label);
    var prev = el.getAttribute('data-state') || '';
    var compact = el.hasAttribute('data-compact');
    el.className = 'veh-cloud ' + L.cls + (compact ? ' veh-cloud--compact' : '') + (el.hasAttribute('data-quiet') ? ' veh-cloud--quiet' : '');
    el.setAttribute('data-state', s.state);
    el.title = L.text + '. ' + L.title;
    el.setAttribute('aria-label', L.text);
    el.innerHTML = '<span class="veh-cloud-ic" aria-hidden="true">' + L.icon + '</span>' +
        (compact ? '' : '<span class="veh-cloud-tx">' + escapeHtml(L.text) + '</span>');
    if (prev === 'por-subir' && s.state === 'nube') {
        el.classList.add('is-arrived');
        el.addEventListener('animationend', function once() { el.classList.remove('is-arrived'); el.removeEventListener('animationend', once); });
    }
}

/**
 * Chip ☁ de un vehículo. `opts.compact` = solo el ícono; `opts.quiet` = no se ve
 * mientras todo esté en la nube (en listas largas, 40 nubes iguales son ruido).
 * Se rellena con fbVehChipsRefresh(); el toque abre la hoja del indicador.
 */
function fbVehChipHTML(v, opts) {
    if (!v) return '';
    opts = opts || {};
    var id = String(v.id !== undefined && v.id !== null ? v.id : '').replace(/[^\w.-]/g, '');
    var html = '<button type="button" class="veh-cloud' + (opts.compact ? ' veh-cloud--compact' : '') + '" data-veh-cloud="' + id + '"' +
        (opts.compact ? ' data-compact' : '') + (opts.quiet ? ' data-quiet' : '') +
        ' onclick="event.stopPropagation();fbSyncSheetOpen()"></button>';
    // Se pinta ya con su estado (sin esperar al siguiente refresco).
    try {
        if (typeof document !== 'undefined') {
            var tmp = document.createElement('div');
            tmp.innerHTML = html;
            _fbVehChipFill(tmp.firstChild, v, _fbVehChipCtx());
            html = tmp.innerHTML;
        }
    } catch (e) {}
    return html;
}

/** Repinta todos los chips a la vista (tras un ciclo, un guardado o un cambio de red). */
function fbVehChipsRefresh() {
    if (typeof document === 'undefined') return;
    var els = document.querySelectorAll('[data-veh-cloud]');
    if (!els.length) return;
    _fbVehChipCtxMemo = null;
    var ctx = _fbVehChipCtx();
    var list = (typeof db !== 'undefined' && db && db.vehicles) || [];
    [].forEach.call(els, function(el) {
        var id = el.getAttribute('data-veh-cloud');
        var v = list.find(function(x) { return String(x.id).replace(/[^\w.-]/g, '') === id; });
        if (v) _fbVehChipFill(el, v, ctx);
    });
}

function fbVehChipsRefreshSoon() {
    if (_fbChipTimer) clearTimeout(_fbChipTimer);
    _fbChipTimer = setTimeout(function() {
        _fbChipTimer = null;
        fbVehChipsRefresh();
        if (typeof fbUpdateIndicator === 'function') fbUpdateIndicator();
        _fbSyncSheetRender();
    }, 250);
}

if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('data:saved', fbVehChipsRefreshSoon);
    window.addEventListener('online', fbVehChipsRefreshSoon);
    window.addEventListener('offline', fbVehChipsRefreshSoon);
}

// ── Equipos del laboratorio ──────────────────────────────────────────────

/** Firestore Timestamp | Date | cadena → ISO. */
function _fbTsIso(x) {
    if (!x) return '';
    try {
        if (typeof x.toDate === 'function') return x.toDate().toISOString();
        if (x instanceof Date) return x.toISOString();
    } catch (e) { return ''; }
    return String(x);
}

function fbDevicesCache() {
    var c = null;
    try { c = JSON.parse(localStorage.getItem(FB_DEVICES_KEY) || 'null'); } catch (e) { c = null; }
    if (!c || typeof c !== 'object') c = {};
    if (!c.devices || typeof c.devices !== 'object') c.devices = {};
    if (!c.seen || typeof c.seen !== 'object') c.seen = {};
    return c;
}
function _fbDevicesCacheSave(c) {
    try { localStorage.setItem(FB_DEVICES_KEY, JSON.stringify(c)); } catch (e) {}
}

/**
 * Anota un equipo que escribió en la nube. `kind` = 'veh' (escribe vehículos uno
 * por uno: 2.9.0 o más nueva) | 'mod' (documento completo de un módulo: lo hacen
 * todas las versiones). Solo guarda si hay algo nuevo, para no escribir en cada eco.
 */
function _fbWriterSeen(id, kind, at) {
    if (!id || typeof id !== 'string' || id.indexOf('dev_') !== 0) return;
    if (typeof FB_DEVICE_ID !== 'undefined' && id === FB_DEVICE_ID) return;
    var c = fbDevicesCache();
    var s = c.seen[id] || {};
    var ts = at || new Date().toISOString();
    var changed = false;
    if (kind === 'veh' && !s.veh) { s.veh = true; changed = true; }
    if (!s.last || Date.parse(ts) - Date.parse(s.last) > 60 * 60 * 1000) { s.last = ts; changed = true; }
    if (!changed) return;
    c.seen[id] = s;
    _fbDevicesCacheSave(c);
}

/**
 * Tabla de equipos. PURA.
 * reg = {id: {name, version, lastSeen}} (registro de 2.14.0+), seen = {id: {veh, last}}.
 * opts = {now, own, current (APP_VERSION), staleDays}
 * → {rows:[{id, name, version, last, own, level, inactive, text}], blockers3}
 *   level: 'al-dia' | 'atrasado' | 'anterior-214' (sube vehículos: ≥2.9.0) | 'sin-confirmar' (podría ser < 2.9.0)
 *   blockers3 = equipos activos que podrían ser anteriores a 2.9.0 (impiden retirar las copias completas).
 */
function fbDevicesView(reg, seen, opts) {
    opts = opts || {};
    reg = reg || {}; seen = seen || {};
    var now = Number(opts.now || Date.now());
    var staleMs = (opts.staleDays || FB_DEVICE_STALE_DAYS) * 86400000;
    var ids = {};
    Object.keys(reg).forEach(function(id) { ids[id] = true; });
    Object.keys(seen).forEach(function(id) { ids[id] = true; });
    if (opts.own) ids[opts.own] = true;
    var rows = Object.keys(ids).map(function(id) {
        var r = reg[id] || null, s = seen[id] || {};
        var last = (r && r.lastSeen) || s.last || '';
        if (s.last && Date.parse(s.last) > Date.parse(last || 0)) last = s.last;
        var row = { id: id, name: (r && r.name) || '', version: (r && r.version) || '', last: last,
                    own: id === opts.own, inactive: !!last && (now - Date.parse(last) > staleMs) };
        if (row.own && !row.version) row.version = opts.current || '';
        if (row.version) {
            var cmp = fbVersionCmp(row.version, opts.current || row.version);
            if (fbVersionCmp(row.version, FB_PER_VEHICLE_SINCE) < 0) { row.level = 'sin-confirmar'; row.text = row.version + ' — anterior a ' + FB_PER_VEHICLE_SINCE; }
            else if (cmp < 0) { row.level = 'atrasado'; row.text = row.version + ' — hay una versión más nueva'; }
            else { row.level = 'al-dia'; row.text = row.version + (row.own ? ' — este equipo' : ' — al día'); }
        } else if (s.veh) {
            row.level = 'anterior-214'; row.text = 'Anterior a 2.14.0 (ya sube vehículos uno por uno)';
        } else {
            row.level = 'sin-confirmar'; row.text = 'Sin registro: podría ser anterior a ' + FB_PER_VEHICLE_SINCE;
        }
        return row;
    });
    rows.sort(function(a, b) {
        if (a.own !== b.own) return a.own ? -1 : 1;
        if (a.inactive !== b.inactive) return a.inactive ? 1 : -1;
        return (Date.parse(b.last || 0) || 0) - (Date.parse(a.last || 0) || 0);
    });
    var blockers3 = rows.filter(function(r) { return !r.own && !r.inactive && r.level === 'sin-confirmar'; });
    return { rows: rows, blockers3: blockers3 };
}

/** Este equipo se reporta en devices/{FB_DEVICE_ID} (a lo más cada 30 min, o `force`). */
function fbDeviceBeat(force) {
    if (typeof fbSync === 'undefined' || !fbSync.enabled || typeof _fbBkSet !== 'function') return Promise.resolve(false);
    if (!force && Date.now() - _fbDevBeatAt < FB_DEVICE_BEAT_MS) return Promise.resolve(false);
    _fbDevBeatAt = Date.now();
    var rec = {
        name: (function() { try { return localStorage.getItem('kia_fb_device_name') || ''; } catch (e) { return ''; } })(),
        version: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '',
        build: (typeof APP_BUILD !== 'undefined') ? String(APP_BUILD) : '',
        lastSeen: new Date().toISOString(),
        ua: (typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '').slice(0, 120)
    };
    return _fbBkSet('devices/' + FB_DEVICE_ID, rec).then(function() {
        var c = fbDevicesCache();
        c.devices[FB_DEVICE_ID] = rec;
        _fbDevicesCacheSave(c);
        return true;
    }, function(err) { console.warn('Registro de equipo:', _fbBkErrText(err)); return false; });
}

/** Trae el registro de equipos de la nube y lo deja en caché. */
function fbDevicesLoad() {
    if (typeof fbSync === 'undefined' || !fbSync.enabled || typeof _fbBkList !== 'function') return Promise.resolve(fbDevicesCache());
    return _fbBkList('devices').then(function(list) {
        var c = fbDevicesCache();
        c.devices = {};
        (list || []).forEach(function(d) { if (d && d.id) c.devices[d.id] = d.data || {}; });
        c.fetchedAt = new Date().toISOString();
        _fbDevicesCacheSave(c);
        return c;
    }, function(err) { console.warn('Equipos:', _fbBkErrText(err)); return fbDevicesCache(); });
}

/** Guarda el nombre de este equipo y lo publica al instante. */
function fbDeviceNameSave(name) {
    name = String(name || '').trim().slice(0, 40);
    try { localStorage.setItem('kia_fb_device_name', name); } catch (e) {}
    if (typeof fbUpdateStationMeta === 'function') fbUpdateStationMeta();
    return fbDeviceBeat(true).then(function(ok) {
        if (typeof showToast === 'function') showToast(name ? 'Este equipo se llama "' + name + '".' : 'Nombre borrado.', 'success');
        fbDevicesRender();
        _fbSyncSheetRender();
        fbVehChipsRefresh();
        return ok;
    });
}

/** Tarjeta "Equipos del laboratorio" en Datos → Sistema (#pn-devices). */
function fbDevicesRender(opts) {
    if (typeof document === 'undefined') return;
    var host = document.getElementById('pn-devices');
    if (!host) return;
    var c = fbDevicesCache();
    var v = fbDevicesView(c.devices, c.seen, { now: Date.now(), own: FB_DEVICE_ID,
        current: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '' });
    var myName = (function() { try { return localStorage.getItem('kia_fb_device_name') || ''; } catch (e) { return ''; } })();
    var h = '<div class="dev-name-row"><label for="dev-name-input">Nombre de este equipo</label>' +
        '<div class="dev-name-in"><input id="dev-name-input" maxlength="40" value="' + escapeHtml(myName) + '" placeholder="Ej.: Tablet celda 2">' +
        '<button type="button" class="btn-secondary" onclick="fbDeviceNameSave(document.getElementById(\'dev-name-input\').value)">Guardar</button></div>' +
        '<div class="u-muted-xs">Así aparece en los demás equipos cuando algo "llegó desde" aquí.</div></div>';
    if (!fbVehActive()) {
        h += '<p class="u-muted-xs">La sincronización está apagada en este equipo: no hay con quién compararse.</p>';
    } else {
        h += v.blockers3.length
            ? '<div class="dev-note is-warn">⚠ ' + v.blockers3.length + ' equipo' + (v.blockers3.length > 1 ? 's' : '') +
              ' activo' + (v.blockers3.length > 1 ? 's' : '') + ' sin confirmar versión. Hasta que se actualicen (o dejen de usarse) se sigue escribiendo la copia completa de Pruebas para ellos.</div>'
            : '<div class="dev-note is-ok">✓ Todos los equipos activos suben vehículos uno por uno.</div>';
        h += '<ul class="dev-list">' + v.rows.map(function(r) {
            return '<li class="dev-row lvl-' + r.level + (r.inactive ? ' is-inactive' : '') + '">' +
                '<div class="dev-row-name">' + escapeHtml(r.name || (r.own ? 'Este equipo (sin nombre)' : 'Equipo sin nombre')) +
                (r.own ? ' <span class="dev-tag">este</span>' : '') + '</div>' +
                '<div class="dev-row-sub">' + escapeHtml(r.text) + (r.last ? ' · visto ' + escapeHtml(fbShortWhen(r.last)) : '') +
                (r.inactive ? ' · inactivo' : '') + '</div></li>';
        }).join('') + '</ul>' +
        '<div class="u-muted-xs">Los equipos se registran solos desde 2.14.0. Uno "sin registro" solo se conoce porque escribió en la nube.</div>';
    }
    host.innerHTML = h;
    if (!(opts && opts.noFetch) && fbVehActive()) {
        fbDevicesLoad().then(function() { fbDevicesRender({ noFetch: true }); });
    }
}

// ── La hoja del indicador ────────────────────────────────────────────────

/** Qué dice la hoja. PURA respecto a sus argumentos (la prueba la usa). */
function fbSyncSheetModel(input) {
    var i = input || {};
    var m = { tone: 'ok', head: '', lines: [], pending: [] };
    if (!i.active) {
        m.tone = 'off'; m.head = '💾 La sincronización está apagada';
        m.lines.push('Todo se guarda en este equipo, pero los demás no lo ven.');
        return m;
    }
    m.pending = (i.pending || []).map(function(v) {
        return { vin: v.vin || '', since: v.updatedAt || v.lastModified || '' };
    });
    if (i.online === false) { m.tone = 'err'; m.head = '⚠ Sin conexión'; m.lines.push('Lo guardado está seguro aquí. Se sube solo al volver la conexión.'); }
    else if (i.lastError) { m.tone = 'err'; m.head = '⚠ No se pudo subir'; m.lines.push(i.lastError); }
    else if (m.pending.length) { m.tone = 'pend'; m.head = '⏳ Subiendo lo de este equipo…'; }
    else { m.head = '☁ Todo lo de este equipo está en la nube'; }
    if (i.lastSync) m.lines.push('Última revisión con la nube: ' + fbShortWhen(i.lastSync, i.now) + '.');
    m.lines.push(i.live ? 'Los cambios de otros equipos llegan al momento.' : 'Los cambios de otros equipos se revisan cada 5 minutos.');
    if (i.queue > 0) m.lines.push(i.queue + ' cambio' + (i.queue > 1 ? 's' : '') + ' de otros módulos (plan, consumibles…) en espera.');
    return m;
}

function _fbSyncSheetInput() {
    var d = (typeof db !== 'undefined' && db) ? db : { vehicles: [] };
    var known = fbVehKnown();
    var plan = fbVehPushPlan(d.vehicles, d.deletedVehicles, known.docs);
    return {
        active: fbVehActive(), online: (typeof navigator !== 'undefined' && navigator.onLine === false) ? false : true,
        lastError: fbSync.vehLastError || '', lastSync: fbSync.vehLastSync || '', live: !!fbSync._vehLive,
        pending: plan.upserts, queue: (typeof fbOfflineQueue !== 'undefined') ? fbOfflineQueue.length : 0, now: Date.now()
    };
}

function _fbSyncSheetRender() {
    if (typeof document === 'undefined') return;
    var host = document.getElementById('fb-sheet');
    if (!host) return;
    var m = fbSyncSheetModel(_fbSyncSheetInput());
    var h = '<div class="fb-sheet-head tone-' + m.tone + '">' + escapeHtml(m.head) + '</div>';
    if (m.pending.length) {
        h += '<div class="fb-sheet-sub">Por subir desde este equipo:</div><ul class="fb-sheet-list">' +
            m.pending.slice(0, 12).map(function(p) {
                return '<li><b>' + escapeHtml(p.vin) + '</b>' + (p.since ? ' · guardado ' + escapeHtml(fbShortWhen(p.since)) : '') + '</li>';
            }).join('') + (m.pending.length > 12 ? '<li>… y ' + (m.pending.length - 12) + ' más</li>' : '') + '</ul>';
    }
    h += m.lines.map(function(l) { return '<p class="fb-sheet-line">' + escapeHtml(l) + '</p>'; }).join('');
    var myName = (function() { try { return localStorage.getItem('kia_fb_device_name') || ''; } catch (e) { return ''; } })();
    if (!myName && fbVehActive()) {
        h += '<div class="fb-sheet-name"><label for="fb-sheet-name-in">Ponle nombre a este equipo para que los demás sepan de dónde llegan los cambios</label>' +
            '<div class="dev-name-in"><input id="fb-sheet-name-in" maxlength="40" placeholder="Ej.: Tablet celda 2">' +
            '<button type="button" class="btn-secondary" onclick="fbDeviceNameSave(document.getElementById(\'fb-sheet-name-in\').value)">Guardar</button></div></div>';
    }
    host.innerHTML = h;
    var btn = document.querySelector('[data-fb-sheet-retry]');
    if (btn && typeof uiExplainDisabled === 'function') {
        uiExplainDisabled(btn, !fbVehActive() ? 'La sincronización está apagada en este equipo.'
            : (navigator.onLine === false ? 'No hay conexión: se intenta solo al volver.' : ''));
    }
}

/** El toque en el indicador del topbar: qué falta, desde cuándo, y "Intentar ahora". */
function fbSyncSheetOpen() {
    if (typeof showModal !== 'function') { fbShowSettings(); return; }
    var old = document.getElementById('globalModal');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    showModal({
        title: 'Sincronización', type: 'info',
        body: '<div id="fb-sheet" class="fb-sheet" aria-live="polite"></div>',
        buttons: [
            { label: 'Intentar ahora', cls: 'btn-primary', onclick: function() { fbSyncSheetRetry(); } },
            { label: 'Equipos y ajustes', onclick: function() {
                var o = document.getElementById('globalModal'); if (o) o.style.display = 'none';
                if (typeof dashGo === 'function') dashGo('panel', 'pn-system'); else fbShowSettings();
            } },
            { label: 'Cerrar', onclick: function() { var o = document.getElementById('globalModal'); if (o) o.style.display = 'none'; } }
        ]
    });
    var retry = document.querySelector('#globalModal [data-modal-btn="0"]');
    if (retry) retry.setAttribute('data-fb-sheet-retry', '');
    _fbSyncSheetRender();
}

function fbSyncSheetRetry() {
    var btn = document.querySelector('[data-fb-sheet-retry]');
    if (btn && btn.getAttribute('data-why')) return;
    if (btn) { btn.textContent = 'Revisando…'; btn.disabled = true; }
    if (typeof fbQueueRetry === 'function') { try { fbQueueRetry(); } catch (e) {} }
    return fbVehiclesSync().then(function(r) {
        if (btn) { btn.disabled = false; btn.textContent = 'Intentar ahora'; }
        _fbSyncSheetRender();
        if (typeof showToast === 'function') {
            if (r && r.ok) showToast(r.sent ? 'Listo: se subieron ' + r.sent + ' cambio' + (r.sent > 1 ? 's' : '') + '.' : 'Listo: todo estaba al día.', 'success');
            else if (r && r.busy) showToast('Ya se estaba revisando; en un momento termina.', 'info');
            else if (r && r.error) showToast('No se pudo subir: ' + r.error, 'error');
        }
        return r;
    });
}
