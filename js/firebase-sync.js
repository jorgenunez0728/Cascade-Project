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

// ── State ──
var fbSync = {
    enabled: false,
    db: null,
    stationId: '',
    lastSync: null,
    status: 'off',      // 'off' | 'connecting' | 'connected' | 'syncing' | 'error'
    lastError: '',
    debounceTimers: {}
};

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

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        fbSync.db = firebase.firestore();

        fbSync.db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
            if (err.code === 'failed-precondition') {
                console.warn('Firebase: Multiple tabs open, persistence only in one.');
            } else if (err.code === 'unimplemented') {
                console.warn('Firebase: Persistence not supported in this browser.');
            }
        });

        fbSync.stationId = localStorage.getItem('kia_fb_station') || '';
        fbSync.enabled = true;
        fbSync.status = 'connecting';
        fbSync.lastError = '';
        fbUpdateIndicator();

        console.log('Firebase Sync: SDK initialized for project ' + FIREBASE_CONFIG.projectId);

        fbTestConnection(function(ok) {
            if (ok) {
                fbSync.status = 'connected';
                fbUpdateIndicator();
                if (fbSync.stationId) fbPullAll();
            }
        });

    } catch (err) {
        console.error('Firebase Sync: Init error', err);
        fbSync.status = 'error';
        fbSync.lastError = 'Error al inicializar: ' + err.message;
        fbUpdateIndicator();
    }
}

// ── Connection Test ──
function fbTestConnection(callback) {
    if (!fbSync.db) {
        fbSync.status = 'error';
        fbSync.lastError = 'Firestore no inicializado.';
        fbUpdateIndicator();
        if (callback) callback(false);
        return;
    }

    fbSync.db.collection('_ping').doc('test').get().then(function() {
        if (callback) callback(true);
    }).catch(function(err) {
        console.error('Firebase connection test failed:', err);
        fbSync.status = 'error';

        if (err.code === 'permission-denied') {
            fbSync.lastError = 'Acceso denegado. Revisa las Security Rules en Firebase Console:\nFirestore > Rules > Permitir lectura/escritura.';
        } else if (err.code === 'unavailable') {
            fbSync.lastError = 'Firestore no disponible. Verifica tu conexion a internet.';
        } else if (err.code === 'not-found') {
            if (callback) { callback(true); return; }
        } else {
            fbSync.lastError = 'Error de conexion: ' + (err.message || err.code);
        }

        fbUpdateIndicator();
        if (callback) callback(false);
    });
}

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
    if (fbSync.enabled) fbPushAll();
    var modal = document.getElementById('fbModal');
    if (modal && modal.style.display === 'block') fbShowSettings();
}

// ── Push data to Firestore ──
function fbPush(collection, data, onDone) {
    if (!fbSync.enabled || !fbSync.db) { if (onDone) onDone(false, 'Firebase no habilitado'); return; }
    if (!fbSync.stationId) { if (onDone) onDone(false, 'No hay ID de estacion configurado'); return; }

    if (fbSync.debounceTimers[collection]) clearTimeout(fbSync.debounceTimers[collection]);

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

// ── Push all modules ──
function fbPushAll(showFeedback) {
    if (!fbSync.enabled) { if (showFeedback) showToast('Firebase no esta habilitado', 'error'); return; }
    if (!fbSync.stationId) { if (showFeedback) showToast('Primero configura un ID de estacion', 'error'); return; }

    var pending = 4, errors = [];
    function onPushDone(ok, errMsg) {
        if (!ok && errMsg) errors.push(errMsg);
        pending--;
        if (pending === 0 && showFeedback) {
            if (errors.length === 0) showToast('Datos enviados a Firebase correctamente', 'success');
            else showToast('Error al subir: ' + errors[0], 'error');
        }
    }
    fbPush('cop15', db, onPushDone);
    fbPush('testplan', tpState, onPushDone);
    fbPush('results', raState, onPushDone);
    fbPush('inventory', invState, onPushDone);
}

// ── Pull data from Firestore ──
function fbPullAll(showFeedback) {
    if (!fbSync.enabled || !fbSync.db) { if (showFeedback) showToast('Firebase no esta habilitado', 'error'); return; }
    if (!fbSync.stationId) { if (showFeedback) showToast('Primero configura un ID de estacion', 'error'); return; }

    fbSync.status = 'syncing';
    fbUpdateIndicator();

    var stationRef = fbSync.db.collection('stations').doc(fbSync.stationId);
    var collections = ['cop15', 'testplan', 'results', 'inventory'];
    var promises = collections.map(function(col) { return stationRef.collection(col).doc('current').get(); });

    Promise.all(promises).then(function(snapshots) {
        var pulled = [];

        if (snapshots[0].exists && snapshots[0].data().data) {
            var remoteDb = snapshots[0].data().data;
            if (remoteDb.vehicles && remoteDb.vehicles.length >= db.vehicles.length) {
                db = remoteDb;
                localStorage.setItem('kia_db_v11', JSON.stringify(db));
                refreshAllLists();
                pulled.push('COP15 (' + db.vehicles.length + ' vehiculos)');
            }
        }

        if (snapshots[1].exists && snapshots[1].data().data) {
            tpState = snapshots[1].data().data;
            localStorage.setItem('kia_testplan_v1', JSON.stringify(tpState));
            if (typeof tpRender === 'function') tpRender();
            pulled.push('Test Plan');
        }

        if (snapshots[2].exists && snapshots[2].data().data) {
            var remoteRa = snapshots[2].data().data;
            if (remoteRa.tests && remoteRa.tests.length >= raState.tests.length) {
                raState = remoteRa;
                localStorage.setItem('kia_results_v1', JSON.stringify(raState));
                if (typeof raRender === 'function') raRender();
                pulled.push('Results (' + raState.tests.length + ' pruebas)');
            }
        }

        if (snapshots[3].exists && snapshots[3].data().data) {
            invState = snapshots[3].data().data;
            localStorage.setItem('kia_lab_inventory', JSON.stringify(invState));
            if (typeof invRender === 'function') invRender();
            pulled.push('Inventory');
        }

        fbSync.lastSync = new Date();
        fbSync.status = 'connected';
        fbSync.lastError = '';
        fbUpdateIndicator();

        if (pulled.length > 0) {
            if (showFeedback) showToast('Descargado: ' + pulled.join(', '), 'success');
        } else {
            if (showFeedback) showToast('No hay datos en la nube para esta estacion', 'info');
        }

    }).catch(function(err) {
        console.error('Firebase pull error:', err);
        fbSync.status = 'error';
        fbSync.lastError = err.code === 'permission-denied' ? 'Acceso denegado. Revisa las Security Rules.' : 'Error al descargar: ' + (err.message || err.code);
        fbUpdateIndicator();
        if (showFeedback) showToast(fbSync.lastError, 'error');
    });
}

// ── Hook into existing save functions ──
function fbHookSaves() {
    var _origSaveDB = window.saveDB;
    if (_origSaveDB) { window.saveDB = function() { _origSaveDB(); fbPush('cop15', db); }; }
    var _origTpSave = window.tpSave;
    if (_origTpSave) { window.tpSave = function() { _origTpSave(); fbPush('testplan', tpState); }; }
    var _origRaSave = window.raSave;
    if (_origRaSave) { window.raSave = function() { _origRaSave(); fbPush('results', raState); }; }
    var _origInvSave = window.invSave;
    if (_origInvSave) { window.invSave = function() { _origInvSave(); fbPush('inventory', invState); }; }
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

        // Connection test
        (hasConfig ? '<div style="margin-bottom:12px;"><button onclick="fbTestConnectionUI()" style="width:100%;padding:8px;background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;cursor:pointer;font-size:11px;">Probar conexion a Firestore</button></div>' : '') +

        // Station ID
        '<div style="margin-bottom:12px;">' +
        '<label style="font-size:10px;color:#94a3b8;">ID de Estacion (identifica este dispositivo)</label>' +
        '<div style="display:flex;gap:6px;margin-top:4px;">' +
        '<input id="fb-station-input" value="' + (fbSync.stationId || '') + '" placeholder="ej: CELDA-1, LAB-TABLET" style="flex:1;padding:8px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:12px;">' +
        '<button onclick="fbSetStation(document.getElementById(\x27fb-station-input\x27).value)" style="padding:8px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:11px;">Guardar</button>' +
        '</div></div>' +

        // Sync actions
        (fbSync.enabled && fbSync.status !== 'error' ? '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<button onclick="fbPushAll(true)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Subir todo a nube</button>' +
        '<button onclick="if(confirm(\x27Esto reemplazara datos locales con los de la nube. Continuar?\x27)){fbPullAll(true);}" style="flex:1;padding:10px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Descargar de nube</button>' +
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

        // Retry
        (fbSync.status === 'error' && hasConfig ? '<div style="margin-bottom:12px;"><button onclick="fbInit();setTimeout(fbShowSettings,1500);" style="width:100%;padding:10px;background:#f59e0b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;">Reintentar conexion</button></div>' : '') +

        // Setup instructions
        (!hasConfig ? '<div style="padding:12px;background:#1e293b;border-radius:8px;border:1px solid #334155;"><div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:6px;">Setup necesario</div><div style="font-size:10px;color:#94a3b8;line-height:1.5;">1. Ve a <strong>console.firebase.google.com</strong><br>2. Crea un proyecto (gratis)<br>3. En Firestore Database, crea una base de datos<br>4. En Project Settings, agrega una Web App<br>5. Copia el firebaseConfig al archivo <strong>js/firebase-sync.js</strong><br>6. Recarga la app</div></div>' : '') +

        // Rules
        (hasConfig ? '<div style="padding:10px;background:#1e293b;border-radius:8px;border:1px solid #334155;margin-top:12px;"><div style="font-size:10px;font-weight:700;color:#94a3b8;margin-bottom:4px;">Security Rules requeridas:</div><pre style="font-size:9px;color:#64748b;margin:0;overflow-x:auto;white-space:pre;">rules_version = \'2\';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}</pre><div style="font-size:9px;color:#f59e0b;margin-top:4px;">Firestore > Rules > Editar > Publicar</div></div>' : '') +

        '</div>';
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  SMART IMPORT MERGE SYSTEM                                          ║
// ║  Detects duplicates, shows differences, merges per-module           ║
// ║  with undo, history, and CSV export                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

var FB_MERGE_HISTORY_KEY = 'kia_merge_history';

// ── List all stations in Firestore ──
function fbMergeListStations(callback) {
    if (!fbSync.db) { callback([]); return; }

    fbSync.db.collection('stations').get().then(function(snap) {
        var stations = [];
        snap.forEach(function(doc) { stations.push(doc.id); });
        callback(stations);
    }).catch(function(err) {
        console.error('Error listing stations:', err);
        showToast('Error listando estaciones: ' + err.message, 'error');
        callback([]);
    });
}

// ── Load all 4 modules from a remote station ──
function fbMergeLoadStation(stationId, callback) {
    var ref = fbSync.db.collection('stations').doc(stationId);
    var cols = ['cop15', 'testplan', 'results', 'inventory'];
    var promises = cols.map(function(c) { return ref.collection(c).doc('current').get(); });

    Promise.all(promises).then(function(snaps) {
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

        // Compare planData
        var localPlanLen = (tpState.planData || []).length;
        var remotePlanLen = (remoteData.testplan.planData || []).length;

        analysis.testplan = {
            localTestedCount: (tpState.testedList || []).length,
            remoteTestedCount: remoteTested.length,
            newItems: newTests,
            duplicates: dupTests,
            conflicts: [],
            rulesChanged: rulesChanged,
            localPlanConfigs: localPlanLen,
            remotePlanConfigs: remotePlanLen,
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
            if (!tpState.testedList) tpState.testedList = [];
            analysis.testplan.newItems.forEach(function(t) { tpState.testedList.push(t); });
            merged.push('TestPlan: +' + analysis.testplan.newItems.length + ' pruebas');
        } else if (choices.testplan === 'replace') {
            tpState = remoteData.testplan;
            merged.push('TestPlan: reemplazado con version remota');
        } else if (choices.testplan === 'merge_all') {
            if (!tpState.testedList) tpState.testedList = [];
            analysis.testplan.newItems.forEach(function(t) { tpState.testedList.push(t); });
            if (analysis.testplan.rulesChanged) {
                tpState.rules = remoteData.testplan.rules;
            }
            if (analysis.testplan.remotePlanConfigs > analysis.testplan.localPlanConfigs) {
                tpState.planData = remoteData.testplan.planData;
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
        var others = stations.filter(function(s) { return s !== fbSync.stationId; });

        var html = '<div style="max-width:500px;margin:30px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">';
        html += '<button onclick="fbShowSettings()" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>';
        html += '<h3 style="margin:0 0 4px;color:#f59e0b;">Smart Merge</h3>';
        html += '<div style="font-size:10px;color:#64748b;margin-bottom:14px;">Fusiona datos de otra estacion a <strong>' + fbSync.stationId + '</strong></div>';

        if (others.length === 0) {
            html += '<div style="text-align:center;padding:20px;color:#64748b;">No hay otras estaciones en Firebase. Sube datos desde otro dispositivo primero.</div>';
        } else {
            html += '<div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">Selecciona la estacion de origen:</div>';
            others.forEach(function(s) {
                html += '<button onclick="fbMergeLoadAndAnalyze(\x27' + s + '\x27)" style="display:block;width:100%;padding:12px;margin-bottom:6px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;text-align:left;">' +
                    '<span style="color:#f59e0b;margin-right:8px;">\u25B6</span>' + s + '</button>';
            });
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
        var hasChanges = tp.newItems.length > 0 || tp.rulesChanged || tp.remotePlanConfigs > tp.localPlanConfigs;
        html += '<div style="padding:10px;border:1px solid #1e293b;border-radius:8px;margin-bottom:8px;' + (hasChanges ? 'border-color:#3b82f6;' : '') + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
        html += '<span style="font-weight:700;font-size:12px;">Test Plan</span>';
        html += '<span style="font-size:9px;color:#64748b;">Probados L: ' + tp.localTestedCount + ' | R: ' + tp.remoteTestedCount + '</span></div>';
        html += '<div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">';
        html += '<span style="color:#10b981;font-weight:700;">+' + tp.newItems.length + ' probados nuevos</span>';
        html += ' &nbsp; <span style="color:#64748b;">' + tp.duplicates.length + ' iguales</span>';
        if (tp.rulesChanged) html += ' &nbsp; <span style="color:#f59e0b;">reglas diferentes</span>';
        if (tp.remotePlanConfigs > tp.localPlanConfigs) html += ' &nbsp; <span style="color:#3b82f6;">plan mas completo</span>';
        html += '</div>';
        if (hasChanges) {
            html += '<select id="fb-merge-testplan" style="width:100%;padding:6px;background:#1e293b;border:1px solid #334155;border-radius:4px;color:#e2e8f0;font-size:10px;">';
            html += '<option value="">No fusionar</option>';
            html += '<option value="new" selected>Solo pruebas nuevas (+' + tp.newItems.length + ')</option>';
            html += '<option value="merge_all">Merge completo (pruebas + reglas + plan)</option>';
            html += '<option value="replace">Reemplazar todo con remoto</option></select>';
        } else {
            html += '<div style="font-size:10px;color:#10b981;">Sin diferencias</div>';
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
