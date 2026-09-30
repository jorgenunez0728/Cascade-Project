// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.21.0] UNA COSA A LA VEZ — tarjetas para toda la plataforma       ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Operación en tarjetas (2.13.0, opcards.js) probó el principio: una pregunta por
// pantalla, un botón grande, deslizar solo navega y un resumen de lo que falta al
// final. Aquí vive ese principio como primitiva para el RESTO de la plataforma
// (Consumibles primero: ronda de lecturas y ronda de equipos).
//
// REGLAS:
//  - uiFlow NO guarda nada por su cuenta. Cada paso escribe con el escritor único de
//    su módulo (invAddReading, invCalRegister, invMaintMarkDone…); la primitiva solo
//    decide qué tarjeta se ve y lleva la cuenta de hecho / para después.
//  - Deslizar SOLO navega. "Después" deja el paso pendiente: nunca afirma un dato.
//  - Un paso bloqueado (sin permiso, por ejemplo) lo DICE en su botón
//    (uiExplainDisabled, 2.10.0); nunca un botón que no hace nada.
//  - uiFlowModel y uiFlowNextIndex son PURAS (sin DOM, se prueban en Node).
//  - opcards.js NO usa esto a propósito: sus tarjetas son los campos del formulario
//    de Operación en su lugar (y Cascade no se toca). Aquí la tarjeta la pinta el paso.
//
// Un paso: { key, section, title,
//            render(host)          pinta la tarjeta dentro de host
//            save(host)            → true | {ok:true} | {ok:false, msg, field}
//            onLater()             opcional: al tocar "Después"
//            blocked()             opcional: motivo (texto) por el que no se puede guardar }

var UF_SWIPE_PX = 60;

var _uf = null;   // {opts, steps, state:{done,skipped}, idx, final, onlyPending, closeDialog}

/**
 * Estado de las tarjetas. PURA.
 * steps: [{key, section, title}] en orden · state: {done:{key:true}, skipped:{key:true}}
 * Devuelve {cards:[{key, section, title, index, status}], sections:[{name, start, count}],
 *           pending:[índices no hechos], firstPending, done, skipped}
 * status: 'hecho' | 'despues' (se tocó "Después") | 'pendiente' (no se ha visto).
 */
function uiFlowModel(steps, state) {
    state = state || {};
    var done = state.done || {}, skipped = state.skipped || {};
    var cards = (steps || []).filter(function(s) { return s && s.key; }).map(function(s, i) {
        var st = done[s.key] ? 'hecho' : (skipped[s.key] ? 'despues' : 'pendiente');
        return { key: s.key, section: s.section || '', title: s.title || '', index: i, status: st };
    });
    var sections = [];
    cards.forEach(function(c, i) {
        var last = sections[sections.length - 1];
        if (!last || last.name !== c.section) sections.push({ name: c.section, start: i, count: 1 });
        else last.count++;
    });
    var pending = cards.filter(function(c) { return c.status !== 'hecho'; }).map(function(c) { return c.index; });
    return {
        cards: cards, sections: sections, pending: pending,
        firstPending: pending.length ? pending[0] : -1,
        done: cards.filter(function(c) { return c.status === 'hecho'; }).length,
        skipped: cards.filter(function(c) { return c.status === 'despues'; }).length
    };
}

/**
 * La tarjeta que sigue. PURA. Al retomar (onlyPending) salta lo ya hecho.
 * Devuelve cards.length cuando no queda ninguna: eso es el resumen final.
 */
function uiFlowNextIndex(model, idx, onlyPending) {
    var n = model.cards.length;
    if (!onlyPending) return Math.min(n, idx + 1);
    var nx = model.pending.filter(function(i) { return i > idx; })[0];
    return nx === undefined ? n : nx;
}

// ── Abrir / cerrar ───────────────────────────────────────────────────────

/**
 * opts: {id, title, subtitle, steps, state, startAt, saveLabel,
 *        onStep(idx)        cada vez que se muestra una tarjeta (para guardar el avance)
 *        onFinal(model)     → HTML del resumen (su propio título incluido)
 *        onClose(reason, model)   reason: 'done' (Terminar) | 'cancel' (✕ a media ronda)}
 */
function uiFlowOpen(opts) {
    opts = opts || {};
    if (_uf) uiFlowClose('cancel');
    var steps = (opts.steps || []).filter(function(s) { return s && s.key; });
    if (!steps.length) return false;
    var st = opts.state || {};
    _uf = { opts: opts, steps: steps, state: { done: Object.assign({}, st.done || {}), skipped: Object.assign({}, st.skipped || {}) },
            idx: 0, final: false, onlyPending: false, closeDialog: null };

    var el = document.createElement('div');
    el.id = 'ui-flow';
    el.className = 'uf';
    el.innerHTML =
        '<div class="uf-head">' +
            '<div class="uf-head-row">' +
                '<button type="button" class="uf-x" onclick="uiFlowClose()" aria-label="Salir">✕</button>' +
                '<div class="uf-head-what"><b id="uf-title"></b><div class="uf-head-sub" id="uf-sub"></div></div>' +
                '<div class="uf-saved" id="uf-saved" aria-live="polite"></div>' +
            '</div>' +
            '<div class="uf-segs" id="uf-segs"></div>' +
        '</div>' +
        '<div class="uf-body" id="uf-body"></div>' +
        '<div class="uf-foot">' +
            '<button type="button" class="uf-back" onclick="uiFlowBack()" aria-label="Tarjeta anterior">‹</button>' +
            '<button type="button" class="uf-later" onclick="uiFlowLater()" title="Avanzar sin registrar este punto">Después</button>' +
            '<button type="button" class="uf-save" onclick="uiFlowSave()"></button>' +
        '</div>';
    document.body.appendChild(el);
    document.body.classList.add('uf-open');
    _ufSwipe(el);
    if (typeof a11yDialog === 'function') {
        _uf.closeDialog = a11yDialog(el, { labelId: 'uf-title', onClose: function() {
            if (_uf) { _uf.closeDialog = null; uiFlowClose(); }
        } });
    }
    var m = uiFlowModel(steps, _uf.state);
    // Retomar: si ya hay avance, solo se pregunta lo que falta.
    _uf.onlyPending = m.done > 0;
    var start = (typeof opts.startAt === 'number' && opts.startAt >= 0) ? opts.startAt : (m.firstPending >= 0 ? m.firstPending : 0);
    _ufGo(start, 1);
    return true;
}

/** Cerrar. Sin motivo: 'done' si ya se está en el resumen, 'cancel' si no. */
function uiFlowClose(reason) {
    if (!_uf) return;
    var f = _uf;
    _uf = null;
    var why = reason || (f.final ? 'done' : 'cancel');
    var el = document.getElementById('ui-flow');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.body.classList.remove('uf-open', 'uf-at-final');
    if (f.closeDialog) { var c = f.closeDialog; f.closeDialog = null; try { c(); } catch (e) {} }
    if (typeof f.opts.onClose === 'function') {
        try { f.opts.onClose(why, uiFlowModel(f.steps, f.state)); } catch (e) { console.warn('uiFlow onClose:', e); }
    }
}

// ── Pintar ───────────────────────────────────────────────────────────────

function _ufModel() { return uiFlowModel(_uf.steps, _uf.state); }

function _ufHeader(m) {
    var sub = document.getElementById('uf-sub');
    var title = document.getElementById('uf-title');
    var segs = document.getElementById('uf-segs');
    if (!sub || !title || !segs) return;
    var o = _uf.opts;
    title.textContent = o.title || '';
    var c = _uf.final ? null : m.cards[_uf.idx];
    var sec = c ? m.sections.filter(function(s) { return _uf.idx >= s.start && _uf.idx < s.start + s.count; })[0] : null;
    var where = c ? ((sec && sec.name ? sec.name + ' · ' : '') + (_uf.idx + 1) + ' de ' + m.cards.length) : 'Resumen';
    sub.textContent = where + (o.subtitle ? ' · ' + o.subtitle : '');
    // Cada segmento se llena con lo HECHO de su sección, no con la posición: "Después"
    // avanza, pero no llena la barra.
    segs.innerHTML = m.sections.map(function(s) {
        var mine = m.cards.slice(s.start, s.start + s.count);
        var done = mine.filter(function(x) { return x.status === 'hecho'; }).length / s.count;
        var here = sec && sec.start === s.start;
        return '<button type="button" class="uf-seg' + (here ? ' is-here' : '') + '" style="flex:' + s.count + '" ' +
            'onclick="uiFlowGoTo(' + s.start + ')" aria-label="Ir a ' + escapeHtml(s.name || 'la sección') + '">' +
            '<span class="uf-seg-bar"><span class="uf-seg-fill" style="transform:scaleX(' + done.toFixed(3) + ')"></span></span></button>';
    }).join('');
    segs.style.display = m.cards.length > 1 ? '' : 'none';
}

function _ufGo(i, dir) {
    if (!_uf) return;
    var m = _ufModel();
    if (i >= m.cards.length) { _ufFinal(); return; }
    _uf.final = false;
    document.body.classList.remove('uf-at-final');
    _uf.idx = Math.max(0, i);
    var step = _uf.steps[_uf.idx];
    var body = document.getElementById('uf-body');
    if (!body) return;
    body.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'uf-card ' + (dir < 0 ? 'uf-in-back' : 'uf-in');
    card.setAttribute('data-uf-key', step.key);
    body.appendChild(card);
    try { step.render(card); } catch (e) {
        console.warn('uiFlow render:', e);
        card.innerHTML = '<p class="uf-note">No se pudo mostrar este punto. Toca <b>Después</b> para seguir.</p>';
    }
    _ufHeader(m);
    var save = document.querySelector('#ui-flow .uf-save');
    if (save) {
        save.textContent = _uf.opts.saveLabel || 'Guardar ▸';
        var why = (typeof step.blocked === 'function') ? (step.blocked() || '') : '';
        if (typeof uiExplainDisabled === 'function') uiExplainDisabled(save, why);
        else save.disabled = !!why;
    }
    var back = document.querySelector('#ui-flow .uf-back');
    if (back) back.disabled = _uf.idx === 0;
    body.scrollTop = 0;
    if (typeof _uf.opts.onStep === 'function') { try { _uf.opts.onStep(_uf.idx); } catch (e) {} }
    // Foco al primer campo (≥ 16 px en CSS: iOS no hace zoom).
    setTimeout(function() {
        if (!_uf || !card.isConnected) return;
        var f = card.querySelector('input:not([type=hidden]):not([disabled]), textarea, select');
        if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) {} }
    }, 120);
}

function _ufFinal() {
    _uf.final = true;
    document.body.classList.add('uf-at-final');
    var m = _ufModel();
    var body = document.getElementById('uf-body');
    if (!body) return;
    var h = '<div class="uf-final uf-in">';
    var fin = '';
    if (typeof _uf.opts.onFinal === 'function') {
        try { fin = _uf.opts.onFinal(m) || ''; } catch (e) { console.warn('uiFlow onFinal:', e); }
    }
    h += fin;
    if (m.pending.length) {
        h += '<button type="button" class="btn-secondary uf-next" onclick="uiFlowResume()">Seguir con ' +
             (m.pending.length === 1 ? 'el que falta' : 'los ' + m.pending.length + ' que faltan') + ' ▸</button>';
    }
    // [2.22.0] Un solo botón principal por pantalla: si el resumen ya trae su acción
    // principal (p. ej. "Aceptar la semana"), Terminar pasa a secundario.
    var mainInFinal = /class="btn-primary/.test(fin);
    h += '<button type="button" class="' + (mainInFinal ? 'btn-secondary' : 'btn-primary') + ' uf-next uf-close" onclick="uiFlowClose(\'done\')">' +
         escapeHtml(_uf.opts.closeLabel || 'Terminar') + '</button></div>';
    body.innerHTML = h;
    body.scrollTop = 0;
    _ufHeader(m);
    var back = document.querySelector('#ui-flow .uf-back');
    if (back) back.disabled = false;
    // El cierre se siente en la mano: una vibración corta donde el equipo la tenga.
    try { if (navigator.vibrate && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) navigator.vibrate(20); } catch (e) {}
}

function _ufFlash(msg) {
    var s = document.getElementById('uf-saved');
    if (!s) return;
    s.textContent = msg;
    s.classList.remove('is-on'); void s.offsetWidth; s.classList.add('is-on');
}

// ── Acciones ─────────────────────────────────────────────────────────────

/** Guardar = lo que el paso diga + siguiente. Si el paso rechaza, el error va en el campo. */
function uiFlowSave() {
    if (!_uf || _uf.final) return;
    var step = _uf.steps[_uf.idx];
    var card = document.querySelector('#uf-body .uf-card');
    var why = (typeof step.blocked === 'function') ? (step.blocked() || '') : '';
    if (why) { if (typeof showToast === 'function') showToast(why, 'warning'); return; }
    var res;
    try { res = step.save ? step.save(card) : true; } catch (e) {
        console.warn('uiFlow save:', e);
        res = { ok: false, msg: 'No se pudo guardar este punto: ' + (e && e.message || e) };
    }
    if (res === false || (res && res.ok === false)) {
        var msg = (res && res.msg) || 'No se pudo guardar este punto.';
        if (res && res.field && typeof uiInvalid === 'function') uiInvalid(res.field, msg);
        else if (typeof showToast === 'function') showToast(msg, 'error');
        return;
    }
    _uf.state.done[step.key] = true;
    delete _uf.state.skipped[step.key];
    _ufFlash('✓ Guardado');
    _ufGo(uiFlowNextIndex(_ufModel(), _uf.idx, _uf.onlyPending), 1);
}

/** Después: avanza sin registrar. Lo ya hecho sigue hecho. */
function uiFlowLater() {
    if (!_uf || _uf.final) return;
    var step = _uf.steps[_uf.idx];
    if (!_uf.state.done[step.key]) {
        _uf.state.skipped[step.key] = true;
        if (typeof step.onLater === 'function') { try { step.onLater(); } catch (e) {} }
    }
    _ufGo(uiFlowNextIndex(_ufModel(), _uf.idx, _uf.onlyPending), 1);
}

function uiFlowBack() {
    if (!_uf) return;
    if (_uf.final) { _ufGo(_uf.steps.length - 1, -1); return; }
    if (_uf.idx > 0) _ufGo(_uf.idx - 1, -1);
}

/** Desde el resumen: solo lo que falta. */
function uiFlowResume() {
    if (!_uf) return;
    var m = _ufModel();
    _uf.onlyPending = true;
    _ufGo(m.firstPending >= 0 ? m.firstPending : 0, 1);
}

function uiFlowGoTo(i) { if (_uf) _ufGo(i, (_uf.final || i >= _uf.idx) ? 1 : -1); }

// Deslizar SOLO navega (nunca guarda). Enter en un campo = Guardar.
function _ufSwipe(el) {
    var x0 = null, y0 = null;
    el.addEventListener('touchstart', function(e) {
        if (!_uf || !e.touches || e.touches.length !== 1) return;
        if (e.target.closest && e.target.closest('.uf-head, .uf-foot, .ui-num-row, input[type=range]')) { x0 = null; return; }
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener('touchend', function(e) {
        if (!_uf || x0 === null || !e.changedTouches) return;
        var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) < UF_SWIPE_PX || Math.abs(dx) < 2 * Math.abs(dy)) return;
        if (dx < 0) { if (!_uf.final) uiFlowLater(); }
        else uiFlowBack();
    }, { passive: true });
    el.addEventListener('keydown', function(e) {
        if (!_uf || e.key !== 'Enter' || e.isComposing) return;
        var t = e.target;
        if (!t || !t.closest || !t.closest('.uf-card') || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') return;
        e.preventDefault();
        uiFlowSave();
    });
}
