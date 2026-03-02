// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Firebase Cloud Sync (Optional)                       ║
// ║  Works alongside localStorage — app stays 100% offline-capable    ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── Configuration ──
// To enable Firebase sync, replace these values with your own Firebase project config.
// Get them from: Firebase Console → Project Settings → General → Your apps → Web app
var FIREBASE_CONFIG = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

// ── State ──
var fbSync = {
    enabled: false,
    db: null,           // Firestore reference
    stationId: '',      // Identifies this device/station (set by user)
    lastSync: null,
    status: 'off',      // 'off' | 'connected' | 'syncing' | 'error'
    debounceTimers: {}
};

// ── Initialize Firebase ──
function fbInit() {
    // Only init if config is filled and Firebase SDK loaded
    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
        console.log('Firebase Sync: No config found. Running in offline-only mode.');
        fbSync.status = 'off';
        fbUpdateIndicator();
        return;
    }

    if (typeof firebase === 'undefined') {
        console.warn('Firebase Sync: SDK not loaded. Running offline.');
        fbSync.status = 'off';
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
        fbSync.status = 'connected';
        fbUpdateIndicator();

        console.log('Firebase Sync: Connected to project ' + FIREBASE_CONFIG.projectId);

        // If station ID is set, do initial sync
        if (fbSync.stationId) {
            fbPullAll();
        }

    } catch (err) {
        console.error('Firebase Sync: Init error', err);
        fbSync.status = 'error';
        fbUpdateIndicator();
    }
}

// ── Station ID Management ──
function fbSetStation(id) {
    if (!id) return;
    fbSync.stationId = id.trim().toUpperCase();
    localStorage.setItem('kia_fb_station', fbSync.stationId);
    if (fbSync.enabled) {
        fbPushAll();
    }
}

// ── Push data to Firestore ──
function fbPush(collection, data) {
    if (!fbSync.enabled || !fbSync.db || !fbSync.stationId) return;

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
            fbUpdateIndicator();
        }).catch(function(err) {
            console.error('Firebase push error (' + collection + '):', err);
            fbSync.status = 'error';
            fbUpdateIndicator();
        });
    }, 2000);
}

// ── Push all modules ──
function fbPushAll() {
    if (!fbSync.enabled) return;
    fbPush('cop15', db);
    fbPush('testplan', tpState);
    fbPush('results', raState);
    fbPush('inventory', invState);
}

// ── Pull data from Firestore ──
function fbPullAll() {
    if (!fbSync.enabled || !fbSync.db || !fbSync.stationId) return;

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
        fbUpdateIndicator();

        if (pulled.length > 0) {
            console.log('Firebase Sync: Pulled ' + pulled.join(', '));
        }

    }).catch(function(err) {
        console.error('Firebase pull error:', err);
        fbSync.status = 'error';
        fbUpdateIndicator();
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

    var colors = { off: '#475569', connected: '#10b981', syncing: '#3b82f6', error: '#ef4444' };
    var labels = { off: 'Offline', connected: 'Sync', syncing: 'Syncing...', error: 'Error' };
    var color = colors[fbSync.status] || '#475569';
    var label = labels[fbSync.status] || 'Off';

    el.style.color = color;
    el.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + color + ';margin-right:4px;' +
        (fbSync.status === 'syncing' ? 'animation:pulse 1s infinite;' : '') +
        '"></span>' + label +
        (fbSync.stationId ? ' (' + fbSync.stationId + ')' : '') +
        (fbSync.lastSync ? ' ' + fbSync.lastSync.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) : '');
}

// ── Settings Panel ──
function fbShowSettings() {
    var modal = document.getElementById('invModal') || document.createElement('div');
    if (!modal.id) {
        modal.id = 'fbModal';
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;overflow-y:auto;';
        document.body.appendChild(modal);
    }
    modal.style.display = 'block';

    var hasConfig = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId;

    modal.innerHTML = '<div style="max-width:450px;margin:40px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">' +
        '<button onclick="this.parentElement.parentElement.style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>' +
        '<h3 style="margin:0 0 4px;color:#3b82f6;">Firebase Cloud Sync</h3>' +
        '<div style="font-size:10px;color:#64748b;margin-bottom:16px;">Sincroniza datos entre multiples dispositivos via Firebase.</div>' +

        // Status
        '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:11px;">Estado:</span>' +
        '<span style="font-size:11px;font-weight:700;color:' + (fbSync.enabled ? '#10b981' : '#64748b') + ';">' + (fbSync.enabled ? 'Conectado' : (hasConfig ? 'Desconectado' : 'No configurado')) + '</span>' +
        '</div>' +
        (fbSync.lastSync ? '<div style="font-size:9px;color:#64748b;margin-top:4px;">Ultima sync: ' + fbSync.lastSync.toLocaleString('es-MX') + '</div>' : '') +
        '</div>' +

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
        (fbSync.enabled ? '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<button onclick="fbPushAll();alert(\x27Datos enviados a Firebase\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Subir todo a nube</button>' +
        '<button onclick="if(confirm(\x27Esto reemplazara datos locales con los de la nube. Continuar?\x27)){fbPullAll();alert(\x27Datos descargados de Firebase\x27);}" style="flex:1;padding:10px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Descargar de nube</button>' +
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

        '</div>';
}
