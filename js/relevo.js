// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.25.0] DESDE TU ÚLTIMA VEZ — el relevo de turno                     ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Al entrar, si pasaron más de RELEVO_MIN_GAP_H horas desde la última vez que ESA
// persona usó ESTE equipo, una ficha con lo que cambió mientras no estaba. Cada
// línea abre la ficha de su cosa (2.24.0) y al final: lo que te toca ahora.
//
// REGLAS:
//  - Cero lecturas nuevas a la nube. Sale de lo que ya viaja por el sync: el
//    historial de cambios (auditGetView) y la línea de tiempo de cada vehículo.
//  - Vehículos: el CAMBIO NETO de estado (de dónde a dónde) desde tu última vez,
//    derivado de `timeline[].data.status`. No se usa el `user` de la línea de tiempo
//    para decidir nada: es el operador del formulario, no quien tenía la sesión.
//  - El resto: una LISTA BLANCA de acciones del historial (RELEVO_ACTIONS). Lo que no
//    está ahí (entradas y salidas de sesión, migraciones, limpieza de almacenamiento)
//    no es relevo. Lo tuyo se omite (por nombre de la sesión).
//  - relevoDigest(src, since, me) es PURA. La marca de "última vez" vive en
//    uiPref('lastSeen')[nombre]: por persona y por equipo, no se sincroniza.
//  - No escribe nada del laboratorio.

var RELEVO_MIN_GAP_H = 4;          // menos que esto es un descanso, no un relevo
var RELEVO_LINES_MAX = 6;          // líneas por grupo antes de "y N más"
var RELEVO_BEAT_MS = 5 * 60000;    // cada cuánto se sella "sigo aquí" con la app visible

// Grupos en el orden en que se leen.
var RELEVO_GROUPS = [
    { key: 'vehiculos',   icon: '🚗',  title: 'Vehículos' },
    { key: 'plan',        icon: '📅',  title: 'Plan de pruebas' },
    { key: 'consumibles', icon: '🧪',  title: 'Consumibles y equipos' },
    { key: 'cop',         icon: '👪',  title: 'CoP y límites' },
    { key: 'proyectos',   icon: '🗂️', title: 'Proyectos y actividades' },
    { key: 'usuarios',    icon: '👤',  title: 'Usuarios' }
];

// Acción del historial → grupo y cómo se dice. `agg` = se cuentan juntas en una línea.
// `link` = qué ficha abre (con entity.id). Todo lo que no esté aquí NO entra al relevo.
var RELEVO_ACTIONS = {
    // Vehículos (lo que el cambio de estado no cuenta solo)
    vehicle_deleted:          { g: 'vehiculos', say: 'borró el vehículo', tone: 'warn' },
    alta_corregida:           { g: 'vehiculos', say: 'corrigió el alta de', link: 'vehiculo' },
    retro_edit:               { g: 'vehiculos', say: 'completó datos retroactivos de', link: 'vehiculo' },
    vets_importado:           { g: 'vehiculos', say: 'adjuntó la prueba de VETS a', link: 'vehiculo' },
    vets_fallas_decididas:    { g: 'vehiculos', say: 'decidió las fallas de VETS de', link: 'vehiculo' },
    // Plan
    week_accepted:            { g: 'plan', say: 'aceptó la semana del' },
    week_unaccepted:          { g: 'plan', say: 'reabrió la semana del', tone: 'warn' },
    week_deleted:             { g: 'plan', say: 'borró la propuesta de la semana del' },
    week_item_added:          { g: 'plan', agg: 'prueba agregada|pruebas agregadas' },
    week_item_removed:        { g: 'plan', agg: 'prueba quitada|pruebas quitadas' },
    week_item_moved:          { g: 'plan', agg: 'prueba movida de día|pruebas movidas de día' },
    week_item_substituted:    { g: 'plan', agg: 'prueba sustituida|pruebas sustituidas' },
    week_item_linked:         { g: 'plan', agg: 'vehículo vinculado a una prueba|vehículos vinculados a pruebas' },
    plan_imported:            { g: 'plan', say: 'importó la producción' },
    capacity_changed:         { g: 'plan', say: 'cambió la capacidad' },
    req_purpose_changed:      { g: 'plan', say: 'cambió qué acredita el REQ' },
    config_paused:            { g: 'plan', say: 'pausó la configuración', link: 'config', linkByLabel: true },
    config_resumed:           { g: 'plan', say: 'reactivó la configuración', link: 'config', linkByLabel: true },
    // Consumibles
    gas_reading:              { g: 'consumibles', agg: 'lectura de gas|lecturas de gases' },
    fuel_reading:             { g: 'consumibles', agg: 'lectura de combustible|lecturas de combustible' },
    calibracion_registrada:   { g: 'consumibles', say: 'registró la calibración de', link: 'instrumento' },
    calibraciones_importadas: { g: 'consumibles', say: 'actualizó calibraciones desde el' },
    mtto_ejecutado:           { g: 'consumibles', say: 'hizo el mantenimiento' },
    gas_created:              { g: 'consumibles', say: 'dio de alta el cilindro', link: 'cilindro' },
    gas_deleted:              { g: 'consumibles', say: 'dio de baja el cilindro' },
    reporte_consumibles_importado: { g: 'consumibles', say: 'importó el reporte de consumibles' },
    // CoP y límites
    judgment_saved:           { g: 'cop', say: 'guardó un juicio de' },
    co2_factors_set:          { g: 'cop', say: 'cambió los factores de CO₂ de' },
    regulacion_publicada:     { g: 'cop', say: 'publicó los límites de regulación,', tone: 'warn' },
    regulacion_eliminada:     { g: 'cop', say: 'borró el perfil de regulación', tone: 'warn' },
    revision_dirigida_activada:    { g: 'cop', say: 'activó la revisión dirigida:' },
    revision_dirigida_desactivada: { g: 'cop', say: 'desactivó la revisión dirigida:' },
    // Proyectos y actividades (por proyecto se cuentan juntas)
    proyecto_creado:          { g: 'proyectos', say: 'creó el proyecto', link: 'proyecto' },
    proyecto_paso_completado: { g: 'proyectos', project: 'paso completado|pasos completados' },
    proyecto_paso_estatus:    { g: 'proyectos', project: 'cambio de estatus|cambios de estatus' },
    proyecto_fecha_movida:    { g: 'proyectos', project: 'fecha movida|fechas movidas' },
    proyecto_nota:            { g: 'proyectos', project: 'nota|notas' },
    proyecto_paso_creado:     { g: 'proyectos', project: 'paso nuevo|pasos nuevos' },
    task_add:                 { g: 'proyectos', say: 'agregó la actividad' },
    // Usuarios
    operator_added:           { g: 'usuarios', say: 'dio de alta a' },
    operator_updated:         { g: 'usuarios', say: 'cambió el rol de' },
    operator_removed:         { g: 'usuarios', say: 'dio de baja a', tone: 'warn' }
};

function _relevoFold(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function _relevoPlural(spec, n) { var p = String(spec).split('|'); return n + ' ' + (n === 1 ? p[0] : (p[1] || p[0])); }

/** Estado de un vehículo en un instante, según su línea de tiempo. null = no existía. PURA. */
function relevoVehicleStatusAt(v, iso) {
    if (!v) return null;
    if (v.registeredAt && String(v.registeredAt) > iso) return null;
    var st = 'registered';
    (v.timeline || []).forEach(function(t) {
        if (t && t.timestamp && String(t.timestamp) <= iso && t.data && t.data.status) st = t.data.status;
    });
    return st;
}

/**
 * LO QUE CAMBIÓ desde `since`. PURA.
 * src: {events, vehicles, gases, isLow(g), statusLabels, now} (`now` solo para rotular la hora)
 * me:  nombre de quien entra (sus propios cambios del historial se omiten).
 * → {since, total, people:[{name, n}], groups:[{key, icon, title, lines:[{text, who, when, tone, link}], more}]}
 */
function relevoDigest(src, since, me) {
    src = src || {};
    var meF = _relevoFold(me);
    var labels = src.statusLabels || {};
    var lab = function(s) { return labels[s] || s; };
    var lines = {};           // grupo → [{…, _ts}]
    var people = {};
    var total = 0;
    var push = function(g, l) { (lines[g] = lines[g] || []).push(l); total++; };
    var who = function(name) { if (name) people[name] = (people[name] || 0) + 1; };
    var vehById = {};
    (src.vehicles || []).forEach(function(v) { if (v && v.id != null) vehById[String(v.id)] = v; });

    // 1) Vehículos: cambio neto de estado.
    (src.vehicles || []).forEach(function(v) {
        if (!v) return;
        var ahora = v.status;
        var antes = relevoVehicleStatusAt(v, since);
        var cambios = (v.timeline || []).filter(function(t) {
            return t && t.timestamp && String(t.timestamp) > since && t.data && t.data.status;
        });
        if (antes === ahora && !cambios.length) return;
        var ult = cambios[cambios.length - 1];
        var devuelto = cambios.filter(function(t) { return /Devuelto al liberador/.test(t.action || ''); }).pop();
        var nombre = v.vin || ('#' + v.id);
        var text;
        if (antes === null) text = nombre + ': nuevo · ' + lab(ahora);
        else if (antes === ahora) text = nombre + ': volvió a ' + lab(ahora);
        else text = nombre + ': ' + lab(antes) + ' → ' + lab(ahora);
        if (devuelto && ahora === 'ready-release') text += ' · devuelto' + (devuelto.data && devuelto.data.reason ? ': ' + devuelto.data.reason : '');
        push('vehiculos', { text: text, when: ult ? ult.timestamp : v.registeredAt, _ts: ult ? ult.timestamp : v.registeredAt,
                            tone: devuelto && ahora === 'ready-release' ? 'warn' : ahora === 'archived' ? 'ok' : '',
                            link: { kind: 'vehiculo', ref: v.id } });
    });

    // 2) Historial: lista blanca, sin lo propio.
    var agg = {}, proj = {};
    (src.events || []).forEach(function(e) {
        if (!e || !e.ts || String(e.ts) <= since) return;
        var spec = RELEVO_ACTIONS[e.action];
        if (!spec) return;
        var name = (e.user && e.user.name) || '';
        if (meF && _relevoFold(name) === meF) return;
        var ent = e.entity || {};
        if (spec.agg) {
            var a = agg[e.action] = agg[e.action] || { spec: spec, n: 0, who: {}, ts: '' };
            a.n++; if (name) a.who[name] = 1; if (String(e.ts) > a.ts) a.ts = String(e.ts);
            who(name);
            return;
        }
        if (spec.project) {
            var key = String(ent.id || ent.label || '');
            var p = proj[key] = proj[key] || { id: ent.id, label: ent.label || 'Proyecto', counts: {}, who: {}, ts: '', last: '' };
            p.counts[e.action] = (p.counts[e.action] || 0) + 1;
            if (name) p.who[name] = 1;
            if (String(e.ts) > p.ts) { p.ts = String(e.ts); p.last = e.details || ''; }
            who(name);
            return;
        }
        var link = null;
        if (spec.link && ent.id != null && spec.link !== 'vehiculo') link = { kind: spec.link, ref: ent.id };
        if (spec.link === 'vehiculo' && ent.id != null && vehById[String(ent.id)]) link = { kind: 'vehiculo', ref: ent.id };
        if (spec.linkByLabel && ent.label) link = { kind: spec.link, ref: ent.label };
        var det = typeof e.details === 'string' && e.details && e.details.length <= 90 ? ' (' + e.details + ')' : '';
        push(spec.g, { text: (name || 'Alguien') + ' ' + spec.say + ' ' + (ent.label || '') + det,
                       who: '', when: e.ts, _ts: String(e.ts), tone: spec.tone || '', link: link });
        who(name);
    });
    Object.keys(agg).forEach(function(k) {
        var a = agg[k];
        push(a.spec.g, { text: _relevoPlural(a.spec.agg, a.n), who: Object.keys(a.who).join(', '), when: a.ts, _ts: a.ts });
        total += a.n - 1;   // cada evento cuenta, aunque se diga en una línea
    });
    Object.keys(proj).forEach(function(k) {
        var p = proj[k];
        var partes = Object.keys(p.counts).map(function(act) { return _relevoPlural(RELEVO_ACTIONS[act].project, p.counts[act]); });
        var n = Object.keys(p.counts).reduce(function(s, act) { return s + p.counts[act]; }, 0);
        push('proyectos', { text: p.label + ': ' + partes.join(', '), who: Object.keys(p.who).join(', '), when: p.ts, _ts: p.ts,
                            link: p.id != null ? { kind: 'proyecto', ref: p.id } : null });
        total += n - 1;
    });

    // 3) Cilindros que quedaron bajos: con lectura después de `since` y bajos ahora.
    var isLow = typeof src.isLow === 'function' ? src.isLow : function() { return false; };
    (src.gases || []).forEach(function(g) {
        if (!g || g.status === 'Empty') return;
        var nueva = (g.readings || []).some(function(r) { return r && !r.auto && r.date && String(r.date) >= since.slice(0, 10); });
        if (!nueva || !isLow(g)) return;
        push('consumibles', { text: (g.formula || g.gasType || 'Cilindro') + ' #' + (g.controlNo || '') + ' quedó bajo',
                              tone: 'warn', _ts: '9', link: { kind: 'cilindro', ref: g.id } });
    });

    var groups = RELEVO_GROUPS.map(function(G) {
        var ls = (lines[G.key] || []).slice().sort(function(a, b) {
            return (b.tone === 'warn') - (a.tone === 'warn') || (String(b._ts) < String(a._ts) ? -1 : String(b._ts) > String(a._ts) ? 1 : 0);
        });
        if (!ls.length) return null;
        var shown = ls.slice(0, RELEVO_LINES_MAX).map(function(l) {
            var o = Object.assign({}, l); delete o._ts;
            if (o.when) o.whenText = relevoWhenLabel(o.when, src.now);   // en un relevo importa la HORA, no la fecha
            return o;
        });
        return { key: G.key, icon: G.icon, title: G.title, lines: shown, more: ls.length - shown.length };
    }).filter(Boolean);
    var ppl = Object.keys(people).map(function(n) { return { name: n, n: people[n] }; })
        .sort(function(a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); });
    return { since: since, total: total, people: ppl, groups: groups };
}

/** Cuándo pasó una línea: "hoy 09:12" / "ayer 18:40" / "lun 28 sep". PURA (recibe `now`). */
function relevoWhenLabel(iso, now) {
    var a = new Date(iso), b = new Date(now || Date.now());
    if (isNaN(a.getTime())) return '';
    var hora = a.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    var ayer = new Date(b); ayer.setDate(b.getDate() - 1);
    if (a.toDateString() === b.toDateString()) return 'hoy ' + hora;
    if (a.toDateString() === ayer.toDateString()) return 'ayer ' + hora;
    return a.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "hace 14 h" / "ayer a las 18:40" / "el lun 29 sep". PURA (recibe `now`). */
function relevoSinceLabel(since, now) {
    var a = new Date(since), b = new Date(now || Date.now());
    if (isNaN(a.getTime())) return '';
    var h = Math.round((b - a) / 3600000);
    var hora = a.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    var ayer = new Date(b); ayer.setDate(b.getDate() - 1);
    if (a.toDateString() === b.toDateString()) return 'hoy a las ' + hora + ' (hace ' + h + ' h)';
    if (a.toDateString() === ayer.toDateString()) return 'ayer a las ' + hora;
    return 'el ' + a.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) + ' a las ' + hora;
}

// ── Estado vivo ──────────────────────────────────────────────────────────

var _relevo = null;   // {me, since} — la última vez ANTERIOR a esta sesión (memoria)

function _relevoMe() {
    return (typeof authState !== 'undefined' && authState.currentUser && authState.currentUser.name) || '';
}

function _relevoSource() {
    var events = [];
    try { events = typeof auditGetView === 'function' ? auditGetView() : (typeof auditGetTrail === 'function' ? auditGetTrail() : []); } catch (e) {}
    return {
        events: events || [],
        vehicles: (typeof db !== 'undefined' && db.vehicles) || [],
        gases: (typeof invState !== 'undefined' && invState.gases) || [],
        isLow: typeof invGasIsLow === 'function' ? invGasIsLow : null,
        statusLabels: (typeof CONFIG !== 'undefined' && CONFIG.statusLabels) || {},
        now: new Date().toISOString()
    };
}

/** El resumen de esta sesión (o null si no hay "última vez" o fue hace poco). */
function relevoCurrent() {
    if (!_relevo || !_relevo.since) return null;
    return relevoDigest(_relevoSource(), _relevo.since, _relevo.me);
}

function _relevoSeenMap() { var m = uiPref('lastSeen'); return (m && typeof m === 'object') ? m : {}; }
function relevoBeat() {
    var me = _relevoMe();
    if (!me) return;
    var m = Object.assign({}, _relevoSeenMap());
    m[me] = new Date().toISOString();
    // Tope: los 20 más recientes (un equipo compartido por todo el laboratorio).
    var ks = Object.keys(m).sort(function(a, b) { return String(m[b]).localeCompare(String(m[a])); });
    var out = {}; ks.slice(0, 20).forEach(function(k) { out[k] = m[k]; });
    uiPref('lastSeen', out);
}

var _relevoBeatStarted = false;
function _relevoStartBeat() {
    if (_relevoBeatStarted) return;
    _relevoBeatStarted = true;
    // Una tableta que se queda con la sesión abierta y se apaga la pantalla: al volver
    // después de horas, también es un relevo (no pasa por el PIN).
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') relevoBeat();
        else { var me = _relevoMe(); if (me) _relevoConsider(me); }
    });
    window.addEventListener('pagehide', relevoBeat);
    setInterval(function() { if (document.visibilityState === 'visible') relevoBeat(); }, RELEVO_BEAT_MS);
}

/**
 * Llamada al terminar de entrar (bootStage 'lista'). Toma la "última vez" de ESTA
 * persona ANTES de sellar la nueva, y si pasó más de RELEVO_MIN_GAP_H horas abre el
 * relevo en cuanto la nube terminó de traer lo nuevo (o de inmediato sin nube).
 */
function relevoOnReady() {
    var me = _relevoMe();
    if (!me) return;
    _relevoStartBeat();
    if (_relevo && _relevo.me === me) { relevoBeat(); return; }   // mismo usuario: ya se decidió
    _relevoConsider(me);
}

/** Toma la "última vez" ANTES de sellar la nueva y, si fue hace más de RELEVO_MIN_GAP_H, abre. */
function _relevoConsider(me) {
    var prev = _relevoSeenMap()[me] || '';
    var gapOk = !!prev && (Date.now() - new Date(prev).getTime()) > RELEVO_MIN_GAP_H * 3600000;
    if (!gapOk && _relevo && _relevo.me === me) { relevoBeat(); return; }   // conserva el relevo de esta sesión
    _relevo = { me: me, since: gapOk ? prev : '' };
    relevoBeat();
    if (!gapOk) return;
    _relevoWhenSynced(function() {
        if (!_relevo || _relevo.me !== me) return;
        var d = relevoCurrent();
        if (typeof dailyDashRender === 'function' && typeof _currentPlatform !== 'undefined' && _currentPlatform === 'today') {
            try { dailyDashRender(); } catch (e) {}
        }
        if (!d || !d.total) return;
        // No encima de otra cosa: una ronda, un diálogo, una ficha o el tour ganan.
        if (document.querySelector('#ui-flow, #globalModal, #ficha, #tour-overlay, #auth-overlay:not(.is-gone)')) return;
        if (typeof fichaOpen === 'function') fichaOpen('relevo', _relevo.since);
    });
}

function _relevoWhenSynced(cb) {
    var t0 = Date.now();
    (function tick() {
        var fb = typeof fbSync !== 'undefined' ? fbSync : null;
        if (!fb || !fb.enabled || fb._pullCompleted || Date.now() - t0 > 20000) { setTimeout(cb, 700); return; }
        setTimeout(tick, 1000);
    })();
}

/** Abrir el relevo a mano (desde HOY). */
function relevoOpen(originEl) {
    if (!_relevo || !_relevo.since || typeof fichaOpen !== 'function') return;
    fichaOpen('relevo', _relevo.since, originEl);
}

/** Franja de HOY: "Mientras no estabas: N cambios · Ver". '' si no aplica. */
function relevoStripHTML() {
    var d = null;
    try { d = relevoCurrent(); } catch (e) { d = null; }
    if (!d || !d.total) return '';
    return '<button type="button" class="relevo-strip" onclick="relevoOpen(this)">' +
        '<span aria-hidden="true">🕘</span><span class="relevo-strip-txt"><b>Desde tu última vez</b> · ' +
        d.total + ' cambio' + (d.total === 1 ? '' : 's') + (d.people.length ? ' de ' + d.people.length + ' persona' + (d.people.length === 1 ? '' : 's') : '') +
        '</span><span class="relevo-strip-go" aria-hidden="true">›</span></button>';
}

// La ficha del relevo (tipo registrado en FICHA_KINDS: ficha.js lo despacha).
if (typeof FICHA_KINDS !== 'undefined') {
    FICHA_KINDS.relevo = {
        icon: '🕘', label: 'Relevo de turno',
        model: function(since) {
            var me = (_relevo && _relevo.me) || _relevoMe();
            var d = relevoDigest(_relevoSource(), since, me);
            // Solo nombres: los cambios de estado de un vehículo no tienen autor fiable, así que
            // un conteo por persona no sumaría el total y se leería como contradicción.
            var who = d.people.slice(0, 3).map(function(p) { return p.name.split(' ')[0]; }).join(', ') +
                      (d.people.length > 3 ? ' y ' + (d.people.length - 3) + ' más' : '');
            var m = {
                kind: 'relevo', ref: since, title: 'Desde tu última vez',
                subtitle: 'Desde ' + relevoSinceLabel(since) + ' · ' + d.total + ' cambio' + (d.total === 1 ? '' : 's') + (who ? ' · con ' + who : ''),
                badges: [], facts: [], relations: [], history: [], groups: d.groups
            };
            if (!d.total) m.note = 'Nada cambió mientras no estabas.';
            else m.note = 'Sale del historial de cambios y de la línea de tiempo de cada vehículo. Toca una línea para ver su ficha.';
            m.next = { label: '📥 Lo que te toca ahora', js: "fichaClose();dashGo('today')" };
            m.nextAtEnd = true;   // primero se lee lo que pasó; al final, a trabajar
            return m;
        }
    };
}
