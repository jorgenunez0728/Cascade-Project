// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [3.37.0] LIBERAR Y APROBAR POR PASOS — una cosa a la vez             ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Operación va en tarjetas en el teléfono desde 2.13.0 (js/opcards.js). Al terminar, el
// flujo caía en Liberación: una página de más de cinco pantallas de alto (resumen, VETS,
// gases, 14 filas de checklist, acción, línea de tiempo) donde el botón de enviar queda
// lejos de lo que lo bloquea. Y desde 2.20.0 libera el Técnico, que trabaja en teléfono.
//
// Aquí Liberación y Aprobación se recorren por PASOS, con el mismo lenguaje de Operación
// (encabezado con segmentos, pie con ‹ y Siguiente ▸, deslizar solo navega).
//
// REGLAS:
//  - NO es otra pantalla. Los pasos son las MISMAS tarjetas de siempre, en su lugar: cada
//    una lleva `data-step` en index.html y el resto se esconde con CSS (body.lib-steps).
//    Mover un campo a otra capa rompería los candados y el repintado por cambio remoto.
//  - Este archivo NO escribe en ningún vehículo y NO decide nada: los candados siguen en
//    submitToApproval / approveAndArchive y en las reglas PURAS de cop15.js. Lo pendiente
//    se LEE de esas mismas reglas (_libVerifyReleaseValues, releaseChecklistRows) y del
//    motivo del botón (uiExplainDisabled).
//  - Avanzar nunca afirma un dato: "Siguiente" solo cambia de paso.
//  - En Aprobación la decisión de una falla y la comparación contra la familia siguen
//    dentro del paso de verificación, donde cop15.js las muestra SOLO después de que los
//    valores coinciden (3.25.0). Sacarlas a un paso propio las haría visibles antes.
//  - `libStepsFrom` es PURA.

var LIB_STEP_DEFS = {
    liberador: { root: 'lib-content', select: 'releaseVehSelect', status: 'ready-release', label: 'Liberación',
        steps: [ { key: 'resumen', title: 'Resumen de la prueba' },
                 { key: 'resultados', title: 'Resultados de emisiones' },
                 { key: 'objetos', title: 'Objetos a retirar' },
                 { key: 'evidencia', title: 'Evidencia documental' },
                 { key: 'enviar', title: 'Enviar a aprobación' } ] },
    aprobador: { root: 'appr-content', select: 'approvalVehSelect', status: 'pending-approval', label: 'Aprobación',
        steps: [ { key: 'resumen', title: 'Resumen de la prueba' },
                 { key: 'verificar', title: 'Verificación' },
                 { key: 'decidir', title: 'Aprobar o devolver' } ] }
};
var LIB_STEP_SWIPE_PX = 60;

var _ls = null;        // {mode, vehicleId, steps, idx}
var _lsKeep = null;    // {mode, vehicleId, key}: el paso que se veía, para retomarlo tras un repintado

/**
 * Pasos visibles con lo que les falta. PURA.
 * defs: [{key, title}] · facts: {key: {visible, pending, why}}
 * → {steps:[{key, title, index, pending, why}], pending:[índices], firstPending, start}
 * `start` = por dónde empezar: vehículo intacto → el primer paso; a medias → el primer
 * pendiente; nada pendiente → el último (enviar / decidir).
 */
function libStepsFrom(defs, facts) {
    facts = facts || {};
    var steps = (defs || []).filter(function(d) { return d && facts[d.key] && facts[d.key].visible; }).map(function(d, i) {
        var f = facts[d.key];
        return { key: d.key, title: d.title, index: i, pending: !!f.pending, why: f.pending ? String(f.why || '') : '' };
    });
    var pending = steps.filter(function(s) { return s.pending; }).map(function(s) { return s.index; });
    var canPend = steps.filter(function(s) { return facts[s.key].canPend; }).length;
    var start = !steps.length ? 0
        : !pending.length ? steps.length - 1
        : (canPend > 0 && pending.length === canPend) ? 0
        : pending[0];
    return { steps: steps, pending: pending, firstPending: pending.length ? pending[0] : -1, start: start };
}

/** ¿Se usa el modo por pasos? PURA. pref: 'auto' | true | false. En automático, solo en teléfono. */
function libStepsWanted(pref, isPhone) {
    if (pref === true || pref === 'on') return true;
    if (pref === false || pref === 'off') return false;
    return !!isPhone;
}

// ── Lectura del estado (nada se escribe) ─────────────────────────────────

function _lsRoot(mode) { return document.getElementById(LIB_STEP_DEFS[mode].root); }
function _lsVehicle() { return _ls && (db.vehicles || []).find(function(v) { return v.id == _ls.vehicleId; }); }
function _lsEls(mode, key) {
    var root = _lsRoot(mode);
    return root ? [].slice.call(root.querySelectorAll('[data-step~="' + key + '"]')) : [];
}
/** Un paso existe si alguna de sus tarjetas se muestra en el formulario completo. */
function _lsVisible(mode, key) {
    return _lsEls(mode, key).some(function(el) { return el.style.display !== 'none'; });
}

function _lsFacts(mode, vehicle) {
    var facts = {};
    LIB_STEP_DEFS[mode].steps.forEach(function(d) { facts[d.key] = { visible: _lsVisible(mode, d.key), pending: false, why: '', canPend: false }; });
    if (!vehicle) return facts;
    if (mode === 'liberador') {
        // Resultados: la misma regla que el botón y que submitToApproval.
        if (facts.resultados.visible) {
            facts.resultados.canPend = true;
            try {
                var regName = _libGetVehicleRegulation(vehicle);
                var profile = regName ? _libCaptureProfileFor(vehicle, regName) : null;
                if (!profile) { facts.resultados.pending = true; facts.resultados.why = 'elige contra qué regulación comparar'; }
                else {
                    var rv = _libVerifyReleaseValues(profile, _libCollectGasValues(profile, 'lib-gas-entry-content'));
                    if (rv.missing.length) { facts.resultados.pending = true; facts.resultados.why = 'falta ' + rv.missing.join(', '); }
                    else if (rv.failing.length && typeof libFailDeclWhy === 'function') {
                        var w = libFailDeclWhy(rv.failing, (typeof _libFailDecl !== 'undefined' && _libFailDecl) ? _libFailDecl[vehicle.id] : null);
                        if (w) { facts.resultados.pending = true; facts.resultados.why = 'declara la falla de ' + rv.failing.join(', '); }
                    }
                }
            } catch (e) { /* sin perfil o sin tabla: el botón de enviar dirá el motivo */ }
        }
        // Checklist: las mismas filas que valida submitToApproval, por grupo.
        try {
            var cl = releaseChecklistRows(vehicle);
            [['objetos', cl.objects], ['evidencia', cl.docs]].forEach(function(p) {
                if (!facts[p[0]].visible) return;
                facts[p[0]].canPend = true;
                var falta = p[1].filter(function(r) { return !r.value && r.blocking !== false; });
                if (falta.length) { facts[p[0]].pending = true; facts[p[0]].why = falta.length === 1 ? 'falta ' + falta[0].label : 'faltan ' + falta.length; }
            });
        } catch (e) {}
    } else {
        // Aprobación: lo que falta es exactamente el motivo del botón de aprobar.
        var btn = document.getElementById('approve-archive-btn');
        if (facts.verificar.visible && btn && btn.disabled) {
            facts.verificar.canPend = true;
            facts.verificar.pending = true;
            facts.verificar.why = btn.getAttribute('data-why') || 'falta verificar';
        } else if (facts.verificar.visible) facts.verificar.canPend = true;
    }
    return facts;
}

function _lsIsPhone() {
    try { return window.matchMedia('(max-width: 640px) and (pointer: coarse)').matches; } catch (e) { return false; }
}

// ── Entrar / salir ───────────────────────────────────────────────────────

/** Lo llaman loadRelease / loadApproval: entra solo si corresponde. */
function libStepsAuto(mode) {
    var pref = (typeof uiPref === 'function') ? uiPref('cardMode') : 'auto';
    if (libStepsWanted(pref, _lsIsPhone())) libStepsEnter(mode);
    else if (_ls) libStepsExit({ keepPref: true });
}

function libStepsEnter(mode, opts) {
    opts = opts || {};
    var def = LIB_STEP_DEFS[mode];
    var root = def && _lsRoot(mode);
    if (!root || root.style.display === 'none' || !activeVehicleId) return false;
    var vehicle = (db.vehicles || []).find(function(v) { return v.id == activeVehicleId; });
    if (!vehicle || vehicle.status !== def.status) return false;
    if (_ls) libStepsExit({ keepPref: true });
    if (opts.remember && typeof uiPref === 'function') uiPref('cardMode', true);
    _ls = { mode: mode, vehicleId: vehicle.id, steps: [], idx: 0 };
    document.body.classList.add('lib-steps');
    _lsChrome();
    var r = _lsRebuild();
    var at = r.start;
    if (_lsKeep && _lsKeep.mode === mode && _lsKeep.vehicleId == vehicle.id) {
        var k = r.steps.filter(function(s) { return s.key === _lsKeep.key; })[0];
        if (k) at = k.index;
    }
    _lsKeep = null;
    _lsGo(at, 1);
    return true;
}

function libStepsExit(opts) {
    opts = opts || {};
    if (!_ls) return;
    [].slice.call(document.querySelectorAll('.ls-current')).forEach(function(el) { el.classList.remove('ls-current', 'oc-in', 'oc-in-back'); });
    var card = document.getElementById('lib-checklist-card'); if (card) card.removeAttribute('data-ls-part');
    ['ls-head', 'ls-foot', 'ls-pending'].forEach(function(id) { var x = document.getElementById(id); if (x) x.remove(); });
    document.body.classList.remove('lib-steps', 'ls-at-last');
    _ls = null;
    if (!opts.keepPref && typeof uiPref === 'function') {
        uiPref('cardMode', false);
        if (typeof showToast === 'function') showToast('Pantalla completa. Para volver a un paso a la vez: botón 📇 arriba.', 'info', 5000);
    }
}

function libStepsActive() { return !!_ls; }
function libStepsCurrentKey() { return (_ls && _ls.steps[_ls.idx]) ? _ls.steps[_ls.idx].key : ''; }

// ── Pintar ───────────────────────────────────────────────────────────────

function _lsChrome() {
    if (!document.getElementById('ls-head')) {
        var h = document.createElement('div');
        h.id = 'ls-head'; h.className = 'oc-head';
        document.body.appendChild(h);
    }
    if (!document.getElementById('ls-foot')) {
        var f = document.createElement('div');
        f.id = 'ls-foot'; f.className = 'oc-foot ls-foot';
        f.innerHTML = '<button type="button" class="oc-back" onclick="libStepsBack()" aria-label="Paso anterior">‹</button>' +
                      '<button type="button" class="oc-save" onclick="libStepsNext()">Siguiente ▸</button>';
        document.body.appendChild(f);
        _lsWire();
    }
}

function _lsRebuild() {
    var r = libStepsFrom(LIB_STEP_DEFS[_ls.mode].steps, _lsFacts(_ls.mode, _lsVehicle()));
    _ls.steps = r.steps;
    return r;
}

function _lsHeader() {
    var head = document.getElementById('ls-head');
    if (!head || !_ls) return;
    var v = _lsVehicle() || {};
    var vin = String(v.vin || '');
    var tail = vin.length > 8 ? '…' + vin.slice(-8) : vin;
    var def = LIB_STEP_DEFS[_ls.mode];
    var s = _ls.steps[_ls.idx] || {};
    var segs = _ls.steps.map(function(st, i) {
        return '<button type="button" class="oc-seg' + (i === _ls.idx ? ' is-here' : '') + (st.pending ? ' ls-seg-pend' : '') + '" style="flex:1" ' +
            'onclick="libStepsGo(' + i + ')" aria-label="Ir a ' + escapeHtml(st.title) + (st.pending ? ' (pendiente)' : '') + '">' +
            '<span class="oc-seg-bar"><span class="oc-seg-fill" style="transform:scaleX(' + (i <= _ls.idx ? 1 : 0) + ')"></span></span></button>';
    }).join('');
    head.innerHTML =
        '<div class="oc-head-row">' +
            '<button type="button" class="oc-x" onclick="libStepsExit()" aria-label="Salir a la pantalla completa">✕</button>' +
            '<div class="oc-head-what"><b>' + escapeHtml(tail) + '</b> · ' + def.label +
                '<div class="oc-head-sub">' + escapeHtml((s.title || '') + ' · ' + (_ls.idx + 1) + ' de ' + _ls.steps.length) + '</div></div>' +
            (typeof fbPresenceChipHTML === 'function' && v.id !== undefined ? fbPresenceChipHTML('veh:' + v.id, { here: true, screen: def.label }) : '') +
            (typeof fbVehChipHTML === 'function' ? fbVehChipHTML(v.id !== undefined ? v : null, { compact: true }) : '') +
        '</div>' +
        '<div class="oc-segs">' + segs + '</div>';
}

/** En el último paso: lo que falta, con un toque para ir a cada cosa. */
function _lsPendingNote() {
    var old = document.getElementById('ls-pending');
    if (!_ls) { if (old) old.remove(); return; }
    var last = _ls.idx === _ls.steps.length - 1;
    var pend = _ls.steps.filter(function(s) { return s.pending; });
    if (!last || !pend.length) { if (old) old.remove(); return; }
    var host = _lsEls(_ls.mode, _ls.steps[_ls.idx].key).filter(function(el) { return el.classList.contains('card'); })[0];
    if (!host) return;
    var box = old || document.createElement('div');
    box.id = 'ls-pending'; box.className = 'ls-pending';
    box.innerHTML = '<div class="ls-pending-title">Antes de ' + (_ls.mode === 'liberador' ? 'enviar' : 'aprobar') + ' falta:</div>' +
        pend.map(function(s) {
            return '<button type="button" class="miss-link ls-pending-row" onclick="libStepsGo(' + s.index + ')">' + escapeHtml(s.title) +
                   (s.why ? ' <span class="u-muted">· ' + escapeHtml(s.why) + '</span>' : '') + ' ›</button>';
        }).join('');
    if (!old) host.insertBefore(box, host.children[1] || null);
}

function _lsGo(i, dir) {
    if (!_ls || !_ls.steps.length) return;
    [].slice.call(document.querySelectorAll('.ls-current')).forEach(function(el) { el.classList.remove('ls-current', 'oc-in', 'oc-in-back'); });
    _ls.idx = Math.max(0, Math.min(_ls.steps.length - 1, i));
    var s = _ls.steps[_ls.idx];
    _lsEls(_ls.mode, s.key).forEach(function(el) { el.classList.add('ls-current', dir < 0 ? 'oc-in-back' : 'oc-in'); });
    // El checklist es una sola tarjeta con dos grupos: cada grupo es un paso.
    var card = document.getElementById('lib-checklist-card');
    if (card) { if (s.key === 'objetos' || s.key === 'evidencia') card.setAttribute('data-ls-part', s.key); else card.removeAttribute('data-ls-part'); }
    document.body.classList.toggle('ls-at-last', _ls.idx === _ls.steps.length - 1);
    var back = document.querySelector('#ls-foot .oc-back');
    if (back) back.disabled = _ls.idx === 0;
    _lsHeader();
    _lsPendingNote();
    try { window.scrollTo(0, 0); } catch (e) {}
}

/** Lo que cambió en pantalla (un gas tecleado, una fila del checklist): se vuelve a leer. */
function _lsRefresh() {
    if (!_ls) return;
    var root = _lsRoot(_ls.mode), v = _lsVehicle();
    // El vehículo se envió, se aprobó, se devolvió o se cerró: ya no hay pasos que recorrer.
    if (!root || root.style.display === 'none' || !v || v.status !== LIB_STEP_DEFS[_ls.mode].status) { libStepsExit({ keepPref: true }); return; }
    var key = libStepsCurrentKey();
    var r = _lsRebuild();
    var same = r.steps.filter(function(s) { return s.key === key; })[0];
    if (!same) { _lsGo(Math.min(_ls.idx, r.steps.length - 1), 1); return; }
    _ls.idx = same.index;
    _lsHeader();
    _lsPendingNote();
}
var _lsRefreshT = null;
function _lsRefreshSoon() { clearTimeout(_lsRefreshT); _lsRefreshT = setTimeout(_lsRefresh, 150); }

// ── Acciones ─────────────────────────────────────────────────────────────

function libStepsNext() { if (_ls) { _lsRebuild(); _lsGo(_ls.idx + 1, 1); } }
function libStepsBack() { if (_ls && _ls.idx > 0) { _lsRebuild(); _lsGo(_ls.idx - 1, -1); } }
function libStepsGo(i) { if (_ls) { _lsRebuild(); _lsGo(i, i >= _ls.idx ? 1 : -1); } }

function _lsWire() {
    if (window._lsWired) return;
    window._lsWired = true;
    // Deslizar SOLO navega.
    var x0 = null, y0 = null;
    document.addEventListener('touchstart', function(e) {
        if (!_ls || !e.touches || e.touches.length !== 1) { x0 = null; return; }
        if (e.target.closest && e.target.closest('#ls-head, #ls-foot, .ui-num-row, input, select, textarea, canvas, .u-xscroll, #globalModal, .modal-overlay')) { x0 = null; return; }
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
        if (!_ls || x0 === null || !e.changedTouches) return;
        var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) < LIB_STEP_SWIPE_PX || Math.abs(dx) < 2 * Math.abs(dy)) return;
        if (dx < 0) libStepsNext(); else libStepsBack();
    }, { passive: true });
    // Lo que se teclea o se toca cambia lo pendiente.
    ['input', 'change', 'click'].forEach(function(ev) {
        document.addEventListener(ev, function(e) {
            if (!_ls) return;
            var root = _lsRoot(_ls.mode);
            if (root && e.target && root.contains(e.target)) _lsRefreshSoon();
        }, true);
    });
    window.addEventListener('data:saved', function() { if (_ls) _lsRefreshSoon(); });
}

// ── Ganchos ──────────────────────────────────────────────────────────────
// Se envuelven (patrón de opcards.js) en vez de tocar funciones largas con varias salidas.
(function() {
    if (typeof window === 'undefined') return;
    function wrap(name, mode) {
        var orig = window[name];
        if (typeof orig !== 'function') return;
        window[name] = function() {
            // Un repintado (otro equipo cambió algo, se adjuntó VETS) no cambia de paso.
            if (_ls) { _lsKeep = { mode: _ls.mode, vehicleId: _ls.vehicleId, key: libStepsCurrentKey() }; libStepsExit({ keepPref: true }); }
            var r = orig.apply(this, arguments);
            setTimeout(function() { try { libStepsAuto(mode); } catch (e) { console.warn('libStepsAuto:', e); } }, 60);
            return r;
        };
    }
    wrap('loadRelease', 'liberador');
    wrap('loadApproval', 'aprobador');

    var _origSub = window.libSwitchSubtab;
    if (typeof _origSub === 'function') {
        window.libSwitchSubtab = function() { if (_ls) libStepsExit({ keepPref: true }); return _origSub.apply(this, arguments); };
    }
    var _origSwitch = window.switchPlatform;
    if (typeof _origSwitch === 'function') {
        window.switchPlatform = function(platform) {
            if (_ls && platform !== 'cop15') libStepsExit({ keepPref: true });
            return _origSwitch.apply(this, arguments);
        };
    }
    document.addEventListener('click', function(e) {
        if (!_ls) return;
        var t = e.target && e.target.closest && e.target.closest('#platform-cop15 .tab[data-tab]');
        if (t && t.getAttribute('data-tab') !== 'liberacion') libStepsExit({ keepPref: true });
    }, true);
})();
