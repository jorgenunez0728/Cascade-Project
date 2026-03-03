// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Firebase Cloud Sync (Optional)                       ║
// ║  Works alongside localStorage — app stays 100% offline-capable    ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── Configuration ──
// To enable Firebase sync, replace these values with your own Firebase project config.
// Get them from: Firebase Console → Project Settings → General → Your apps → Web app
var FIREBASE_CONFIG = {
    apiKey: "AIzaSyBubzcRhL6FN91pKalxTnUfGULwrSvY9q4",
    authDomain: "kia-emlab-test-system.firebaseapp.com",
    projectId: "kia-emlab-test-system",
    storageBucket: "kia-emlab-test-system.firebasestorage.app",
    messagingSenderId: "1059552115443",
    appId: "1:1059552115443:web:256800a7fdba6f85901586",
    measurementId: "G-M3X2Q8WTDC"
};

// ── State ──
var fbSync = {
    enabled: false,
    db: null,           // Firestore reference
    stationId: '',      // Identifies this device/station (set by user)
    lastSync: null,
    status: 'off',      // 'off' | 'connecting' | 'connected' | 'syncing' | 'error'
    lastError: '',      // Last error message for diagnostics
    debounceTimers: {}
};

// ── Initialize Firebase ──
function fbInit() {
    // Only init if config is filled and Firebase SDK loaded
    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
        console.log('Firebase Sync: No config found. Running in offline-only mode.');
        fbSync.status = 'off';
        fbSync.lastError = '';
        fbUpdateIndicator();
        return;
    }

    if (typeof firebase === 'undefined') {
        console.warn('Firebase Sync: SDK not loaded. Running offline.');
        fbSync.status = 'error';
        fbSync.lastError = 'Firebase SDK no cargado. Verifica conexion a internet.';
        fbUpdateIndicator();
        return;
    }

    try {
        // Initialize Firebase app (avoid duplicate init)
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        fbSync.db = firebase.firestore();

        // Enable offline persistence
        fbSync.db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
            if (err.code === 'failed-precondition') {
                console.warn('Firebase: Multiple tabs open, persistence only in one.');
            } else if (err.code === 'unimplemented') {
                console.warn('Firebase: Persistence not supported in this browser.');
            }
        });

        // Load station ID from localStorage
        fbSync.stationId = localStorage.getItem('kia_fb_station') || '';

        fbSync.enabled = true;
        fbSync.status = 'connecting';
        fbSync.lastError = '';
        fbUpdateIndicator();

        console.log('Firebase Sync: SDK initialized for project ' + FIREBASE_CONFIG.projectId);

        // Verify actual Firestore connectivity with a test read
        fbTestConnection(function(ok) {
            if (ok) {
                fbSync.status = 'connected';
                fbUpdateIndicator();
                console.log('Firebase Sync: Firestore connection verified.');
                // If station ID is set, do initial sync
                if (fbSync.stationId) {
                    fbPullAll();
                }
            }
            // If test fails, status is already set to 'error' inside fbTestConnection
        });

    } catch (err) {
        console.error('Firebase Sync: Init error', err);
        fbSync.status = 'error';
        fbSync.lastError = 'Error al inicializar: ' + err.message;
        fbUpdateIndicator();
    }
}

// ── Connection Test ──
// Performs a lightweight read to verify Firestore access works
function fbTestConnection(callback) {
    if (!fbSync.db) {
        fbSync.status = 'error';
        fbSync.lastError = 'Firestore no inicializado.';
        fbUpdateIndicator();
        if (callback) callback(false);
        return;
    }

    fbSync.db.collection('_ping').doc('test').get().then(function() {
        // Success — Firestore responded (doc may or may not exist, both are fine)
        if (callback) callback(true);
    }).catch(function(err) {
        console.error('Firebase connection test failed:', err);
        fbSync.status = 'error';

        if (err.code === 'permission-denied') {
            fbSync.lastError = 'Acceso denegado. Revisa las Security Rules en Firebase Console:\nFirestore > Rules > Permitir lectura/escritura.';
        } else if (err.code === 'unavailable') {
            fbSync.lastError = 'Firestore no disponible. Verifica tu conexion a internet.';
        } else if (err.code === 'not-found') {
            // This actually means the read worked but doc doesn't exist — that's OK
            if (callback) { callback(true); return; }
        } else {
            fbSync.lastError = 'Error de conexion: ' + (err.message || err.code);
        }

        fbUpdateIndicator();
        if (callback) callback(false);
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

    if (fbSync.enabled) {
        fbPushAll();
    }
    // Refresh the settings panel if open
    var modal = document.getElementById('fbModal');
    if (modal && modal.style.display === 'block') {
        fbShowSettings();
    }
}

// ── Push data to Firestore ──
function fbPush(collection, data, onDone) {
    if (!fbSync.enabled || !fbSync.db) {
        if (onDone) onDone(false, 'Firebase no habilitado');
        return;
    }
    if (!fbSync.stationId) {
        if (onDone) onDone(false, 'No hay ID de estacion configurado');
        return;
    }

    // Debounce: don't push more than once per 2 seconds per collection
    if (fbSync.debounceTimers[collection]) {
        clearTimeout(fbSync.debounceTimers[collection]);
    }

    fbSync.debounceTimers[collection] = setTimeout(function() {
        fbSync.status = 'syncing';
        fbUpdateIndicator();

        var docRef = fbSync.db.collection('stations').doc(fbSync.stationId)
            .collection(collection).doc('current');

        docRef.set({
            data: data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            station: fbSync.stationId
        }).then(function() {
            fbSync.lastSync = new Date();
            fbSync.status = 'connected';
            fbSync.lastError = '';
            fbUpdateIndicator();
            if (onDone) onDone(true);
        }).catch(function(err) {
            console.error('Firebase push error (' + collection + '):', err);
            fbSync.status = 'error';
            fbSync.lastError = 'Error al subir ' + collection + ': ' + (err.code === 'permission-denied' ? 'Acceso denegado (Security Rules)' : err.message);
            fbUpdateIndicator();
            if (onDone) onDone(false, fbSync.lastError);
        });
    }, 2000);
}

// ── Push all modules (with user feedback) ──
function fbPushAll(showFeedback) {
    if (!fbSync.enabled) {
        if (showFeedback) showToast('Firebase no esta habilitado', 'error');
        return;
    }
    if (!fbSync.stationId) {
        if (showFeedback) showToast('Primero configura un ID de estacion', 'error');
        return;
    }

    var pending = 4;
    var errors = [];

    function onPushDone(ok, errMsg) {
        if (!ok && errMsg) errors.push(errMsg);
        pending--;
        if (pending === 0 && showFeedback) {
            if (errors.length === 0) {
                showToast('Datos enviados a Firebase correctamente', 'success');
            } else {
                showToast('Error al subir: ' + errors[0], 'error');
            }
        }
    }

    fbPush('cop15', db, onPushDone);
    fbPush('testplan', tpState, onPushDone);
    fbPush('results', raState, onPushDone);
    fbPush('inventory', invState, onPushDone);
}

// ── Pull data from Firestore (with user feedback) ──
function fbPullAll(showFeedback) {
    if (!fbSync.enabled || !fbSync.db) {
        if (showFeedback) showToast('Firebase no esta habilitado', 'error');
        return;
    }
    if (!fbSync.stationId) {
        if (showFeedback) showToast('Primero configura un ID de estacion', 'error');
        return;
    }

    fbSync.status = 'syncing';
    fbUpdateIndicator();

    var stationRef = fbSync.db.collection('stations').doc(fbSync.stationId);

    // Check if remote data exists and is newer
    var collections = ['cop15', 'testplan', 'results', 'inventory'];
    var promises = collections.map(function(col) {
        return stationRef.collection(col).doc('current').get();
    });

    Promise.all(promises).then(function(snapshots) {
        var cop15Snap = snapshots[0];
        var tpSnap = snapshots[1];
        var raSnap = snapshots[2];
        var invSnap = snapshots[3];

        var pulled = [];

        if (cop15Snap.exists && cop15Snap.data().data) {
            var remoteDb = cop15Snap.data().data;
            // Only overwrite if remote has more vehicles
            if (remoteDb.vehicles && remoteDb.vehicles.length >= db.vehicles.length) {
                db = remoteDb;
                localStorage.setItem('kia_db_v11', JSON.stringify(db));
                refreshAllLists();
                pulled.push('COP15 (' + db.vehicles.length + ' vehiculos)');
            }
        }

        if (tpSnap.exists && tpSnap.data().data) {
            var remoteTp = tpSnap.data().data;
            tpState = remoteTp;
            localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState));
            if (typeof tpRender === 'function') tpRender();
            pulled.push('Test Plan');
        }

        if (raSnap.exists && raSnap.data().data) {
            var remoteRa = raSnap.data().data;
            if (remoteRa.tests && remoteRa.tests.length >= raState.tests.length) {
                raState = remoteRa;
                localStorage.setItem('kia_results_v1', JSON.stringify(raState));
                if (typeof raRender === 'function') raRender();
                pulled.push('Results (' + raState.tests.length + ' pruebas)');
            }
        }

        if (invSnap.exists && invSnap.data().data) {
            var remoteInv = invSnap.data().data;
            invState = remoteInv;
            localStorage.setItem('kia_lab_inventory', JSON.stringify(invState));
            if (typeof invRender === 'function') invRender();
            pulled.push('Inventory');
        }

        fbSync.lastSync = new Date();
        fbSync.status = 'connected';
        fbSync.lastError = '';
        fbUpdateIndicator();

        if (pulled.length > 0) {
            console.log('Firebase Sync: Pulled ' + pulled.join(', '));
            if (showFeedback) showToast('Descargado: ' + pulled.join(', '), 'success');
        } else {
            if (showFeedback) showToast('No hay datos en la nube para esta estacion', 'info');
        }

    }).catch(function(err) {
        console.error('Firebase pull error:', err);
        fbSync.status = 'error';
        if (err.code === 'permission-denied') {
            fbSync.lastError = 'Acceso denegado. Revisa las Security Rules en Firebase Console.';
        } else {
            fbSync.lastError = 'Error al descargar: ' + (err.message || err.code);
        }
        fbUpdateIndicator();
        if (showFeedback) showToast(fbSync.lastError, 'error');
    });
}

// ── Hook into existing save functions ──
// We wrap the original save functions to also push to Firebase
function fbHookSaves() {
    // Hook saveDB (COP15)
    var _origSaveDB = window.saveDB;
    if (_origSaveDB) {
        window.saveDB = function() {
            _origSaveDB();
            fbPush('cop15', db);
        };
    }

    // Hook tpSave (Test Plan)
    var _origTpSave = window.tpSave;
    if (_origTpSave) {
        window.tpSave = function() {
            _origTpSave();
            fbPush('testplan', tpState);
        };
    }

    // Hook raSave (Results)
    var _origRaSave = window.raSave;
    if (_origRaSave) {
        window.raSave = function() {
            _origRaSave();
            fbPush('results', raState);
        };
    }

    // Hook invSave (Inventory)
    var _origInvSave = window.invSave;
    if (_origInvSave) {
        window.invSave = function() {
            _origInvSave();
            fbPush('inventory', invState);
        };
    }
}

// ── UI Indicator ──
function fbUpdateIndicator() {
    var el = document.getElementById('fb-sync-indicator');
    if (!el) return;

    var colors = { off: '#475569', connecting: '#f59e0b', connected: '#10b981', syncing: '#3b82f6', error: '#ef4444' };
    var labels = { off: 'Offline', connecting: 'Conectando...', connected: 'Sync', syncing: 'Syncing...', error: 'Error' };
    var color = colors[fbSync.status] || '#475569';
    var label = labels[fbSync.status] || 'Off';

    el.style.color = color;
    el.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + color + ';margin-right:4px;' +
        (fbSync.status === 'syncing' || fbSync.status === 'connecting' ? 'animation:pulse 1s infinite;' : '') +
        '"></span>' + label +
        (fbSync.stationId ? ' (' + fbSync.stationId + ')' : '') +
        (fbSync.lastSync ? ' ' + fbSync.lastSync.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) : '');
}

// ── Settings Panel ──
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

    var statusColor = '#64748b';
    var statusText = 'No configurado';
    if (fbSync.enabled && fbSync.status === 'connected') { statusColor = '#10b981'; statusText = 'Conectado'; }
    else if (fbSync.enabled && fbSync.status === 'connecting') { statusColor = '#f59e0b'; statusText = 'Conectando...'; }
    else if (fbSync.status === 'error') { statusColor = '#ef4444'; statusText = 'Error'; }
    else if (hasConfig && !fbSync.enabled) { statusColor = '#64748b'; statusText = 'Desconectado'; }

    modal.innerHTML = '<div style="max-width:450px;margin:40px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">' +
        '<button onclick="document.getElementById(\x27fbModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>' +
        '<h3 style="margin:0 0 4px;color:#3b82f6;">Firebase Cloud Sync</h3>' +
        '<div style="font-size:10px;color:#64748b;margin-bottom:16px;">Sincroniza datos entre multiples dispositivos via Firebase.</div>' +

        // Status
        '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:11px;">Estado:</span>' +
        '<span style="font-size:11px;font-weight:700;color:' + statusColor + ';">' + statusText + '</span>' +
        '</div>' +
        (fbSync.lastSync ? '<div style="font-size:9px;color:#64748b;margin-top:4px;">Ultima sync: ' + fbSync.lastSync.toLocaleString('es-MX') + '</div>' : '') +
        (fbSync.lastError ? '<div style="font-size:10px;color:#ef4444;margin-top:6px;padding:6px 8px;background:rgba(239,68,68,0.1);border-radius:4px;white-space:pre-line;">' + fbSync.lastError + '</div>' : '') +
        '</div>' +

        // Connection test button
        (hasConfig ? '<div style="margin-bottom:12px;">' +
        '<button onclick="fbTestConnectionUI()" style="width:100%;padding:8px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:11px;">Probar conexion a Firestore</button>' +
        '</div>' : '') +

        // Station ID
        '<div style="margin-bottom:12px;">' +
        '<label style="font-size:10px;color:#94a3b8;">ID de Estacion (identifica este dispositivo)</label>' +
        '<div style="display:flex;gap:6px;margin-top:4px;">' +
        '<input id="fb-station-input" value="' + (fbSync.stationId || '') + '" placeholder="ej: CELDA-1, LAB-TABLET, JORGE-PC" style="flex:1;padding:8px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:12px;">' +
        '<button onclick="fbSetStation(document.getElementById(\x27fb-station-input\x27).value)" style="padding:8px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:11px;">Guardar</button>' +
        '</div>' +
        '<div style="font-size:9px;color:#64748b;margin-top:3px;">Cada dispositivo debe tener un ID unico. Los datos se sincronizan bajo este ID.</div>' +
        '</div>' +

        // Actions
        (fbSync.enabled && fbSync.status !== 'error' ? '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<button onclick="fbPushAll(true)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Subir todo a nube</button>' +
        '<button onclick="if(confirm(\x27Esto reemplazara datos locales con los de la nube. Continuar?\x27)){fbPullAll(true);}" style="flex:1;padding:10px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Descargar de nube</button>' +
        '</div>' : '') +

        // Error state: show retry button
        (fbSync.status === 'error' && hasConfig ? '<div style="margin-bottom:12px;">' +
        '<button onclick="fbInit();setTimeout(fbShowSettings,1500);" style="width:100%;padding:10px;background:#f59e0b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Reintentar conexion</button>' +
        '</div>' : '') +

        // Setup instructions if not configured
        (!hasConfig ? '<div style="padding:12px;background:#1e293b;border-radius:8px;border:1px solid #334155;">' +
        '<div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:6px;">Setup necesario</div>' +
        '<div style="font-size:10px;color:#94a3b8;line-height:1.5;">' +
        '1. Ve a <strong>console.firebase.google.com</strong><br>' +
        '2. Crea un proyecto (gratis)<br>' +
        '3. En Firestore Database, crea una base de datos<br>' +
        '4. En Project Settings, agrega una Web App<br>' +
        '5. Copia el firebaseConfig al archivo <strong>js/firebase-sync.js</strong><br>' +
        '6. Recarga la app<br>' +
        '</div></div>' : '') +

        // Rules reminder (always show when config exists)
        (hasConfig ? '<div style="padding:10px;background:#1e293b;border-radius:8px;border:1px solid #334155;margin-top:12px;">' +
        '<div style="font-size:10px;font-weight:700;color:#94a3b8;margin-bottom:4px;">Security Rules requeridas en Firebase Console:</div>' +
        '<pre style="font-size:9px;color:#64748b;margin:0;overflow-x:auto;white-space:pre;">rules_version = \'2\';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}</pre>' +
        '<div style="font-size:9px;color:#f59e0b;margin-top:4px;">Firestore > Rules > Editar > Publicar</div>' +
        '</div>' : '') +

        '</div>';
}

// ── UI Connection test (called from settings panel) ──
function fbTestConnectionUI() {
    showToast('Probando conexion...', 'info');
    fbTestConnection(function(ok) {
        if (ok) {
            fbSync.status = 'connected';
            fbSync.lastError = '';
            fbUpdateIndicator();
            showToast('Conexion a Firestore exitosa', 'success');
        } else {
            showToast(fbSync.lastError || 'No se pudo conectar a Firestore', 'error');
        }
        // Refresh the settings panel
        fbShowSettings();
    });
}
