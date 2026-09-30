// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.26.0] MOMENTOS DE CIERRE — cuando algo importante queda completo   ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Una tarjeta breve, con INFORMACIÓN (no confeti), cuando en esta sesión se ve
// cerrarse algo que costó trabajo: la semana cumplida, las calibraciones al día, una
// familia CoP concordante. Regla pico-final: el cierre es lo que se recuerda del turno.
//
// REGLAS:
//  - Solo TRANSICIONES vistas en esta sesión (de "no" a "sí"). Nunca al arrancar: una
//    semana que ya estaba cumplida no es un momento, es un dato (ya lo dice el Pulso).
//  - Una vez por cosa y por equipo (uiPref('moments')). No se sincroniza.
//  - No escribe nada del laboratorio. Las condiciones son PURAS (momentWeekFacts,
//    momentCalFacts) y salen de las definiciones únicas (tpWeekBoardRows, invCalSummary).
//  - Vibración corta solo en teléfono y nunca con movimiento reducido.
//  - La bandeja vacía NO tiene momento: HOY ya dice "Todo al día" en la propia pantalla.

var MOMENT_MAX_KEYS = 60;
var MOMENT_SHOW_MS = 7000;

/**
 * ¿La semana está cumplida? PURA. Recibe lo que devuelve tpWeekBoardRows().
 * Cumplida = todo el COMPROMISO (filas no auto-agregadas) hecho. → null | {key, title, facts}
 */
function momentWeekFacts(board) {
    if (!board || !board.rows || !board.accepted) return null;
    var comp = board.rows.filter(function(r) { return !r.unplanned; });
    if (!comp.length) return null;
    var hechas = comp.filter(function(r) { return r.done; });
    if (hechas.length < comp.length) return null;
    var declaradas = hechas.filter(function(r) { return r.declared; }).length;
    var extra = board.rows.filter(function(r) { return r.unplanned && r.done; }).length;
    var facts = [comp.length + ' de ' + comp.length + ' pruebas planeadas, hechas'];
    if (extra) facts.push('y ' + extra + ' que no estaban en el plan');
    if (declaradas) facts.push(declaradas + ' palomeada' + (declaradas === 1 ? '' : 's') + ' a mano, sin liberación todavía');
    if (board.kpis && board.kpis.movidas) facts.push(board.kpis.movidas + ' se movieron de día en el camino');
    return { key: 'semana:' + (board.planId || board.weekDate || ''), icon: '🎯', title: 'Semana cumplida', facts: facts };
}

/** ¿Las calibraciones quedaron al día? PURA. prev/cur = invCalSummary(). → null | {…} */
function momentCalFacts(prev, cur, today) {
    if (!prev || !cur || !(prev.vencidos > 0) || cur.vencidos !== 0 || !cur.requiere) return null;
    var facts = [(cur.vigentes + cur.porVencer) + ' de ' + cur.requiere + ' instrumentos con calibración vigente'];
    if (cur.porVencer) facts.push(cur.porVencer + ' vence' + (cur.porVencer === 1 ? '' : 'n') + ' en los próximos 60 días');
    if (cur.sinRegistro) facts.push(cur.sinRegistro + ' sin registro todavía');
    return { key: 'cal:' + (today || ''), icon: '🔧', title: 'Calibraciones al día', facts: facts };
}

/** Familia CoP concordante al guardar el juicio. PURA. */
function momentCopFacts(j) {
    if (!j || j.decision !== 'PASS') return null;
    var facts = [j.familyLabel || 'Familia'];
    if (j.n) facts.push(j.n + ' VIN' + (j.n === 1 ? '' : 'es') + ' en el muestreo');
    facts.push('El juicio queda guardado como evidencia, con los límites de hoy');
    return { key: 'cop:' + (j.id || ''), icon: '👪', title: 'Familia concordante', facts: facts };
}

// ── Mostrar ─────────────────────────────────────────────────────────────

function _momentSeen() { var m = typeof uiPref === 'function' ? uiPref('moments') : null; return (m && typeof m === 'object') ? m : {}; }

/** Muestra un momento una sola vez por `key`. Devuelve true si se mostró. */
function momentShow(m) {
    if (!m || !m.key) return false;
    var seen = _momentSeen();
    if (seen[m.key]) return false;
    var next = Object.assign({}, seen);
    next[m.key] = new Date().toISOString();
    var ks = Object.keys(next).sort(function(a, b) { return String(next[b]).localeCompare(String(next[a])); });
    var out = {}; ks.slice(0, MOMENT_MAX_KEYS).forEach(function(k) { out[k] = next[k]; });
    if (typeof uiPref === 'function') uiPref('moments', out);

    var old = document.getElementById('moment');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var esc = typeof escapeHtml === 'function' ? escapeHtml : function(s) { return String(s); };
    var el = document.createElement('div');
    el.id = 'moment';
    el.className = 'moment';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="moment-icon" aria-hidden="true">' + (m.icon || '✓') + '</div>' +
        '<div class="moment-main"><div class="moment-title">' + esc(m.title) + '</div>' +
        '<ul class="moment-facts">' + (m.facts || []).map(function(f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>' +
        '<button type="button" class="moment-x" aria-label="Cerrar" onclick="momentClose()">✕</button>';
    document.body.appendChild(el);
    var reduce = false;
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    try { if (!reduce && navigator.vibrate && window.matchMedia('(pointer: coarse)').matches) navigator.vibrate([20, 60, 20]); } catch (e) {}
    var timer = setTimeout(momentClose, MOMENT_SHOW_MS);
    // Mientras se lee (puntero o foco encima), no se va.
    el.addEventListener('pointerenter', function() { clearTimeout(timer); });
    el.addEventListener('focusin', function() { clearTimeout(timer); });
    return true;
}

function momentClose() {
    var el = document.getElementById('moment');
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

// ── Vigilar transiciones (solo en esta sesión) ──────────────────────────

var _momentPrev = { week: null, cal: null };

function _momentCheck() {
    // Semana: la vigente de HOY. Solo si en esta sesión ya se había visto incompleta.
    try {
        if (typeof tpWeekBoardRows === 'function') {
            var b = tpWeekBoardRows();
            var f = momentWeekFacts(b);
            var id = b ? (b.planId || b.weekDate || '') : '';
            if (_momentPrev.week && _momentPrev.week.id === id && !_momentPrev.week.done && f) momentShow(f);
            _momentPrev.week = { id: id, done: !!f };
        }
    } catch (e) {}
    try {
        if (typeof invCalSummary === 'function') {
            var cur = invCalSummary();
            var today = typeof localToday === 'function' ? localToday() : '';
            var c = momentCalFacts(_momentPrev.cal, cur, today);
            if (c) momentShow(c);
            _momentPrev.cal = cur;
        }
    } catch (e) {}
}

var _momentTimer = null;
function momentCheckSoon() {
    clearTimeout(_momentTimer);
    _momentTimer = setTimeout(_momentCheck, 600);
}

if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('data:saved', momentCheckSoon);
    window.addEventListener('tp:saved', momentCheckSoon);
    // La línea base se toma al terminar de cargar: lo que ya estaba cumplido no es un momento.
    window.addEventListener('load', function() { setTimeout(_momentCheck, 1500); });
}
