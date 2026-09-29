// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.15.0] AVISOS DE RELEVO — "te toca a ti"                          ║
// ║                                                                      ║
// ║  El centro de notificaciones solo guardaba los toasts de ESTE equipo:║
// ║  nadie se enteraba de "un vehículo espera tu aprobación" hasta que   ║
// ║  alguien se lo decía en persona. Aquí se compara el estado de cada   ║
// ║  vehículo antes y después de cada cambio (propio o de otro equipo) y ║
// ║  se avisa a quien le toca, según su rol:                             ║
// ║    · a aprobación  → quien puede aprobar (y no es quien lo liberó)   ║
// ║    · devuelto      → quien lo liberó                                 ║
// ║    · aprobado      → quien lo liberó                                 ║
// ║    · soak terminado→ el equipo donde corre el temporizador           ║
// ║  Un aviso nunca es de uno mismo: se filtra por quién hizo el cambio  ║
// ║  (liberador / quien devolvió / aprobador). Por eso da igual si el    ║
// ║  cambio llegó por la nube o se hizo aquí.                            ║
// ║                                                                      ║
// ║  Llega con la app abierta (aunque esté en segundo plano). Con la app ║
// ║  cerrada haría falta Cloud Functions, que es plan de pago: se DICE.  ║
// ╚══════════════════════════════════════════════════════════════════════╝

var HANDOFF_LOG_KEY = 'kia_handoff_log';
var HANDOFF_LOG_MAX = 50;
var HANDOFF_SEEN_MAX = 300;
var HANDOFF_MODES = ['todos', 'mios', 'ninguno'];
var _handoffBase = null, _handoffTimer = null;

/** Nombre comparable (sin acentos, mayúsculas ni espacios de más). PURA. */
function handoffNameKey(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Lo que importa de un vehículo para saber a quién le toca. PURA. */
function handoffVehSig(v) {
    var td = (v && v.testData) || {};
    var sig = td.signatures || {};
    var lib = (td.gasResults && td.gasResults.liberador) || {};
    var pr = v.pendingReturn || null;
    return {
        id: String(v.id), vin: String(v.vin || ''), status: v.status || '',
        // La identidad de la SESIÓN manda sobre el nombre escrito a mano en la firma.
        releaser: (sig.releaser && (sig.releaser.sessionUserName || sig.releaser.signerName)) || lib.capturedBy || '',
        releasedAt: (sig.releaser && sig.releaser.signedAt) || lib.capturedAt || '',
        approver: (sig.approver && (sig.approver.sessionUserName || sig.approver.signerName)) || '',
        retAt: (pr && pr.at) || '', retBy: (pr && pr.by) || '', retReason: (pr && pr.reason) || '',
        archivedAt: v.archivedAt || ''
    };
}

/** {id: firma} de una lista de vehículos. PURA. */
function handoffSnapshot(vehicles) {
    var out = {};
    (vehicles || []).forEach(function(v) { if (v && v.id !== undefined && v.id !== null) out[String(v.id)] = handoffVehSig(v); });
    return out;
}

/**
 * Qué avisos tocan a `user` entre dos fotos. PURA. LA definición de un aviso de relevo.
 * user = {name, canApprove, mode:'todos'|'mios'|'ninguno'}
 * → [{id, kind:'aprobar'|'devuelto'|'aprobado', vehicleId, vin, text, detail}]
 * `id` es estable (tipo + vehículo + marca del momento): el mismo aviso no se repite.
 */
function handoffEventsFor(prev, next, user) {
    user = user || {};
    var mode = HANDOFF_MODES.indexOf(user.mode) >= 0 ? user.mode : 'todos';
    if (mode === 'ninguno' || !user.name) return [];
    var me = handoffNameKey(user.name);
    var soyYo = function(n) { return !!n && handoffNameKey(n) === me; };
    var vinCorto = function(vin) { return vin.length > 8 ? '…' + vin.slice(-8) : vin; };
    prev = prev || {}; next = next || {};
    var out = [];
    Object.keys(next).forEach(function(id) {
        var n = next[id], p = prev[id] || null;
        // Llegó a aprobación (o apareció ya en aprobación desde otro equipo).
        if (n.status === 'pending-approval' && (!p || p.status !== 'pending-approval')) {
            if (mode === 'todos' && user.canApprove && !soyYo(n.releaser)) {
                out.push({ id: 'aprobar|' + id + '|' + (n.releasedAt || n.releaser), kind: 'aprobar', vehicleId: id, vin: n.vin,
                    text: vinCorto(n.vin) + ' espera tu aprobación', detail: n.releaser ? 'Lo liberó ' + n.releaser + '.' : '' });
            }
        }
        if (!p) return;   // Lo que sigue habla de "tu" vehículo: hace falta saber quién lo liberó antes.
        // Devuelto al liberador (returnToReleaser borra la firma del liberador: se lee de la foto anterior).
        if (n.retAt && n.retAt !== p.retAt && n.status === 'ready-release' && soyYo(p.releaser) && !soyYo(n.retBy)) {
            out.push({ id: 'devuelto|' + id + '|' + n.retAt, kind: 'devuelto', vehicleId: id, vin: n.vin,
                text: 'Te devolvieron ' + vinCorto(n.vin) + (n.retReason ? ': ' + n.retReason : ''),
                detail: n.retBy ? 'Lo devolvió ' + n.retBy + '.' : '' });
        }
        // Aprobado y archivado.
        if (n.status === 'archived' && p.status === 'pending-approval' && soyYo(n.releaser || p.releaser) && !soyYo(n.approver)) {
            out.push({ id: 'aprobado|' + id + '|' + (n.archivedAt || n.approver), kind: 'aprobado', vehicleId: id, vin: n.vin,
                text: vinCorto(n.vin) + ' quedó aprobado', detail: n.approver ? 'Lo aprobó ' + n.approver + '.' : '' });
        }
    });
    return out;
}

// ── Estado guardado: la bitácora de avisos y los ya vistos ───────────────

function handoffStore() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(HANDOFF_LOG_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    if (!Array.isArray(s.items)) s.items = [];
    if (!Array.isArray(s.seen)) s.seen = [];
    return s;
}
function _handoffStoreSave(s) {
    s.items = s.items.slice(0, HANDOFF_LOG_MAX);
    s.seen = s.seen.slice(-HANDOFF_SEEN_MAX);
    try { localStorage.setItem(HANDOFF_LOG_KEY, JSON.stringify(s)); } catch (e) {}
}

/** Los avisos para el centro de notificaciones (lo lee app.js con guarda typeof). */
function handoffLogItems() {
    return handoffStore().items.map(function(it) {
        return { id: it.id, message: it.text + (it.detail ? ' ' + it.detail : ''), type: it.kind === 'devuelto' ? 'warning' : 'info',
                 timestamp: it.at, read: !!it.read, handoff: true, kind: it.kind };
    });
}
function handoffMarkRead(id) {
    var s = handoffStore(), hit = false;
    s.items.forEach(function(it) { if (it.id === id && !it.read) { it.read = true; hit = true; } });
    if (hit) _handoffStoreSave(s);
    return hit;
}
function handoffDismiss(id) {
    var s = handoffStore();
    var n = s.items.length;
    s.items = s.items.filter(function(it) { return it.id !== id; });
    if (s.items.length !== n) _handoffStoreSave(s);
}
function handoffClearAll() {
    var s = handoffStore();
    s.items = [];
    _handoffStoreSave(s);
}

// ── Quién soy y qué quiero recibir ──────────────────────────────────────

function handoffMode() {
    var m = (typeof uiPref === 'function') ? uiPref('handoff') : 'todos';
    return HANDOFF_MODES.indexOf(m) >= 0 ? m : 'todos';
}
function handoffSetMode(m) {
    if (HANDOFF_MODES.indexOf(m) < 0) return;
    if (typeof uiPref === 'function') uiPref('handoff', m);
    if (typeof renderNotifications === 'function') renderNotifications();
}
function _handoffUser() {
    var u = (typeof authState !== 'undefined' && authState && authState.currentUser) || null;
    if (!u || !u.name) return null;
    return { name: u.name, mode: handoffMode(),
             canApprove: typeof authRoleHas === 'function' ? authRoleHas(u.role, 'test.approve') : false };
}

// ── Entrega ─────────────────────────────────────────────────────────────

/** Anota un aviso (una sola vez por id) y lo muestra. Devuelve true si era nuevo. */
function handoffNotify(ev) {
    if (!ev || !ev.id) return false;
    var s = handoffStore();
    if (s.seen.indexOf(ev.id) >= 0) return false;
    s.seen.push(ev.id);
    s.items.unshift({ id: ev.id, kind: ev.kind, vehicleId: ev.vehicleId, vin: ev.vin, text: ev.text, detail: ev.detail || '',
                      at: Date.now(), read: false });
    _handoffStoreSave(s);
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
    var open = function() { handoffOpen(ev.id); };
    if (typeof showToast === 'function') {
        window._notifSkipLog = true;   // ya está en la bitácora de avisos: no duplicarlo como toast
        try { showToast(ev.text, ev.kind === 'devuelto' ? 'warning' : 'info', 10000, open, 'Abrir'); }
        finally { window._notifSkipLog = false; }
    }
    // En segundo plano: la notificación del sistema (el permiso se pide solo con un toque explícito).
    try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' &&
            typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            var sys = new Notification('KIA EmLab', { body: ev.text, tag: ev.id });
            sys.onclick = function() { try { window.focus(); } catch (e) {} open(); sys.close(); };
        }
    } catch (e) {}
    return true;
}

/** Lleva a la pantalla donde se atiende el aviso. */
function handoffOpen(id) {
    var it = handoffStore().items.find(function(x) { return x.id === id; });
    if (!it) return;
    handoffMarkRead(id);
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
    var nc = document.getElementById('notification-center');
    if (nc) nc.style.display = 'none';
    var v = (typeof db !== 'undefined' && db && db.vehicles || []).find(function(x) { return String(x.id) === String(it.vehicleId); });
    if (it.kind === 'soak') {
        if (it.vehicleId && typeof cascadeOpenInOperation === 'function') cascadeOpenInOperation(it.vehicleId);
        else if (typeof dashGo === 'function') dashGo('cop15', 'seguimiento');
        return;
    }
    if (it.kind === 'aprobado') {
        window._histFilterVin = it.vin || '';
        if (typeof dashGo === 'function') dashGo('cop15', 'dashboard');
        setTimeout(function() { if (typeof renderHistory === 'function') renderHistory(); }, 300);
        return;
    }
    var sub = it.kind === 'aprobar' ? 'aprobador' : 'liberador';
    var selId = it.kind === 'aprobar' ? 'approvalVehSelect' : 'releaseVehSelect';
    var want = it.kind === 'aprobar' ? 'pending-approval' : 'ready-release';
    if (!v || v.status !== want) {
        if (typeof showToast === 'function') showToast('Ese vehículo ya cambió de etapa' + (v ? ' (' + ((typeof CONFIG !== 'undefined' && CONFIG.statusLabels && CONFIG.statusLabels[v.status]) || v.status) + ')' : '') + '.', 'info');
        return;
    }
    if (typeof dashGo === 'function') dashGo('cop15', 'liberacion');
    setTimeout(function() {
        if (typeof libSwitchSubtab === 'function') libSwitchSubtab(sub);
        if (typeof refreshAllLists === 'function') refreshAllLists();
        var sel = document.getElementById(selId);
        if (!sel) return;
        sel.value = String(it.vehicleId);
        if (sel.value === String(it.vehicleId)) {
            if (it.kind === 'aprobar' && typeof loadApproval === 'function') loadApproval();
            if (it.kind === 'devuelto' && typeof loadRelease === 'function') loadRelease();
        }
    }, 300);
}

/** Pide permiso para avisos del sistema (solo con un toque, nunca solo). */
function handoffAskPermission() {
    if (typeof Notification === 'undefined') { showToast('Este navegador no permite avisos del sistema.', 'info'); return; }
    Promise.resolve(Notification.requestPermission()).then(function(p) {
        showToast(p === 'granted' ? 'Listo: con la app en segundo plano también te avisa el sistema.' : 'Sin permiso: los avisos solo aparecen dentro de la app.', p === 'granted' ? 'success' : 'info');
        if (typeof renderNotifications === 'function') renderNotifications();
    });
}

// ── Comparar: tras cada cambio propio o de otro equipo ──────────────────

/** Compara la foto anterior con la actual y avisa lo que toque. Devuelve los avisos nuevos. */
function handoffCheck() {
    if (typeof db === 'undefined' || !db) return [];
    var next = handoffSnapshot(db.vehicles);
    var prev = _handoffBase;
    _handoffBase = next;
    if (!prev) return [];
    var user = _handoffUser();
    if (!user) return [];
    var evs = handoffEventsFor(prev, next, user);
    return evs.filter(handoffNotify);
}
function handoffCheckSoon() {
    if (_handoffTimer) clearTimeout(_handoffTimer);
    _handoffTimer = setTimeout(function() { _handoffTimer = null; handoffCheck(); }, 300);
}

/** El soak que termina en ESTE equipo entra al mismo canal (siempre: es tu temporizador). */
function handoffSoakDone(vehicleId, vin) {
    var at = Date.now();
    vehicleId = (vehicleId === undefined || vehicleId === null) ? '' : String(vehicleId);
    return handoffNotify({ id: 'soak|' + vehicleId + '|' + Math.floor(at / 60000), kind: 'soak', vehicleId: vehicleId, vin: vin || '',
        text: 'Terminó el reposo' + (vin ? ' de …' + String(vin).slice(-8) : '') + ': listo para prueba' });
}

// La foto base se toma al CARGAR (db ya está leído por app.js): lo que llegue de la nube
// al conectar se compara contra ella, así que lo que pasó con la app cerrada también avisa.
(function handoffWire() {
    if (typeof db !== 'undefined' && db) _handoffBase = handoffSnapshot(db.vehicles);
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('data:saved', handoffCheckSoon);
    if (typeof _fbAfterAutoMerge === 'function') {
        var orig = _fbAfterAutoMerge;
        window._fbAfterAutoMerge = _fbAfterAutoMerge = function(col) {
            var r = orig.apply(this, arguments);
            if (col === 'cop15') handoffCheckSoon();
            return r;
        };
    }
})();
