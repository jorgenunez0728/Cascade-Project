// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.13.0] OPERACIÓN EN TARJETAS — una cosa a la vez en el teléfono   ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// En el teléfono, Operación era una página larga con 42 campos en cuatro secciones
// plegables. Aquí se ve UNA pregunta a la vez (estilo Reigns): arriba qué haces y
// sobre qué vehículo, abajo un botón grande de Guardar.
//
// REGLAS:
//  - NO es un segundo formulario. Las tarjetas son los MISMOS campos de siempre, en
//    su lugar: se esconde todo lo demás con CSS (body.op-cards). Mover el campo a
//    otra capa rompería en silencio el autoguardado, los "faltan N" y los cálculos
//    derivados, que escuchan `input`/`change` en #op-content.
//  - Guardar = saveProgress (la fusión a tres bandas de siempre) + siguiente tarjeta.
//  - Deslizar SOLO navega; nunca guarda ni decide. Un deslizamiento accidental no
//    puede afirmar un dato que es evidencia del laboratorio.
//  - Operación dura días (recepción hoy, prueba mañana): toda tarjeta se puede "Dejar
//    para después". Lo que falta se dice en el resumen final y al volver se empieza
//    en el primer pendiente.
//  - `opCardsFrom` es PURA: decide orden, secciones y pendientes sin tocar el DOM.

var OP_CARD_SELECTOR = '.form-group, .etw-box, .target-row, [data-card-group], #soak-timer-panel';
var OP_CARD_SECTION_BY_ACC = { 'acc-recepcion': 'Recepción', 'acc-precond': 'Preacondicionamiento', 'acc-dyno': 'Dinamómetro',
                               'test-verify-card': 'Verificación en prueba', 'op-simple-block': 'Operación' };
var OP_CARD_SWIPE_PX = 60;

var _opc = null;   // {vehicleId, cards, idx, final, dir}

/**
 * Tarjetas a partir de los grupos del formulario. PURA.
 * groups: [{key, section, title, visible, required:[refId], missing:[refId]}] en orden del formulario.
 * Devuelve {cards, sections:[{name, start, count}], pending:[índices], firstPending}.
 */
function opCardsFrom(groups) {
    var cards = (groups || []).filter(function(g) { return g && g.visible; }).map(function(g, i) {
        return { key: g.key, section: g.section || '', title: g.title || '', index: i,
                 required: (g.required || []).slice(), missing: (g.missing || []).slice() };
    });
    var sections = [];
    cards.forEach(function(c, i) {
        var last = sections[sections.length - 1];
        if (!last || last.name !== c.section) sections.push({ name: c.section, start: i, count: 1 });
        else last.count++;
    });
    var pending = cards.filter(function(c) { return c.missing.length > 0; }).map(function(c) { return c.index; });
    return { cards: cards, sections: sections, pending: pending, firstPending: pending.length ? pending[0] : -1 };
}

/** ¿Se usa el modo tarjetas? PURA sobre sus entradas. pref: 'auto' | true | false. */
function opCardsWanted(pref, isPhone, role) {
    if (pref === true || pref === 'on') return true;
    if (pref === false || pref === 'off') return false;
    var r = String(role || '');
    return !!isPhone && (r === 'Practicante' || r === 'Técnico');
}

// ── Lectura del DOM ──────────────────────────────────────────────────────

function _opcRoot() {
    var emi = document.getElementById('op-emissions-block');
    var simple = document.getElementById('op-simple-block');
    if (emi && emi.style.display !== 'none') return emi;
    if (simple && simple.style.display !== 'none') return simple;
    return null;
}

/**
 * Visible en el formulario, ignorando lo que el propio modo tarjetas esconde (las otras
 * tarjetas, y el bloque entero en el resumen). Se recorre hasta el bloque SIN incluirlo:
 * que el bloque se muestre ya lo decide _opcRoot por su estilo en línea.
 */
function _opcShown(el, root) {
    for (var n = el; n && n !== root; n = n.parentElement) {
        if (n.style && n.style.display === 'none') return false;
        if (n !== el && !n.classList.contains('oc-card')) {
            var cs = getComputedStyle(n);
            if (cs.display === 'none') return false;
        }
    }
    return true;
}

function _opcTitle(el) {
    if (el.getAttribute('data-card-title')) return el.getAttribute('data-card-title');
    if (el.id === 'soak-timer-panel') return 'Timer de reposo (opcional)';
    var lab = el.querySelector('label, .dyno-label');
    var t = '';
    if (lab) {
        // Sin el "?" del botón de ayuda que cascadeInjectTooltips mete en la etiqueta.
        var c = lab.cloneNode(true);
        [].slice.call(c.querySelectorAll('.cascade-help-btn, button')).forEach(function(b) { b.remove(); });
        t = c.textContent;
    }
    if (el.classList.contains('target-row')) t = t.replace(/^\s*Target/, 'Target y Dyno Set');
    return String(t || '').replace(/\s+/g, ' ').trim();
}

function _opcSection(el) {
    var acc = el.closest('details.acc');
    return (acc && OP_CARD_SECTION_BY_ACC[acc.id]) || 'Operación';
}

/** Grupos del formulario en orden, con sus obligatorios y lo que falta (en vivo). */
function _opcGroups(vehicle) {
    var root = _opcRoot();
    if (!root) return [];
    var all = [].slice.call(root.querySelectorAll(OP_CARD_SELECTOR));
    var units = all.filter(function(el) {
        return !all.some(function(o) { return o !== el && o.contains(el); });
    });
    var td = (vehicle && vehicle.testData) || {};
    var req = (typeof PDF_REQUIRED_FIELDS !== 'undefined' ? PDF_REQUIRED_FIELDS : []).filter(function(f) {
        return f.refId && !(f.when && !f.when(td, vehicle));
    });
    return units.map(function(el, i) {
        el.classList.add('oc-card');
        if (!el.getAttribute('data-oc-key')) el.setAttribute('data-oc-key', 'oc' + i);
        var mine = req.filter(function(f) { var x = document.getElementById(f.refId); return x && el.contains(x); });
        var missing = mine.filter(function(f) {
            var x = document.getElementById(f.refId);
            var v = x ? x.value : null;
            var blank = v === null || v === undefined || String(v).trim() === '' || (f.zeroIsBlank && Number(v) === 0);
            return blank && !(f.soft && f.soft(td, vehicle));
        });
        return { key: el.getAttribute('data-oc-key'), section: _opcSection(el), title: _opcTitle(el),
                 visible: _opcShown(el, root),
                 required: mine.map(function(f) { return f.refId; }), missing: missing.map(function(f) { return f.refId; }) };
    });
}

function _opcEl(key) { return document.querySelector('.oc-card[data-oc-key="' + key + '"]'); }
function _opcVehicle() { return _opc && (db.vehicles || []).find(function(v) { return v.id == _opc.vehicleId; }); }

// ── Entrar / salir ───────────────────────────────────────────────────────

function _opcIsPhone() {
    try { return window.matchMedia('(max-width: 640px) and (pointer: coarse)').matches; } catch (e) { return false; }
}

/** Lo llama loadVehicle: entra solo si corresponde (preferencia, teléfono, rol). */
function opCardsAuto() {
    var role = (typeof authState !== 'undefined' && authState.currentUser) ? authState.currentUser.role : '';
    var pref = (typeof uiPref === 'function') ? uiPref('cardMode') : 'auto';
    if (opCardsWanted(pref, _opcIsPhone(), role)) opCardsEnter();
    else if (_opc) opCardsExit({ keepPref: true });
}

function opCardsEnter(opts) {
    opts = opts || {};
    if (!activeVehicleId || !_opcRoot()) return false;
    var vehicle = (db.vehicles || []).find(function(v) { return v.id == activeVehicleId; });
    if (!vehicle) return false;
    if (typeof _opIsReadOnlyStatus === 'function' && _opIsReadOnlyStatus(vehicle.status)) return false;
    if (opts.remember && typeof uiPref === 'function') uiPref('cardMode', true);
    _opc = { vehicleId: vehicle.id, cards: [], idx: 0, final: false, dir: 1, onlyPending: false };
    document.body.classList.add('op-cards');
    _opcChrome();
    var r = _opcRebuild();
    // Vehículo nuevo (falta desde la primera tarjeta): se recorre todo, opcionales
    // incluidos. Si ya tiene datos, se retoma y solo se pregunta lo que falta.
    _opc.onlyPending = r.firstPending > 0;
    _opcGo(r.firstPending >= 0 ? r.firstPending : 0, 1);
    return true;
}

function opCardsExit(opts) {
    opts = opts || {};
    if (!_opc) return;
    [].slice.call(document.querySelectorAll('.oc-current')).forEach(function(el) { el.classList.remove('oc-current', 'oc-in', 'oc-in-back'); });
    var fin = document.getElementById('oc-final'); if (fin) fin.remove();
    var head = document.getElementById('oc-head'); if (head) head.remove();
    var foot = document.getElementById('oc-foot'); if (foot) foot.remove();
    document.body.classList.remove('op-cards', 'oc-at-final');
    _opc = null;
    if (!opts.keepPref && typeof uiPref === 'function') {
        uiPref('cardMode', false);
        if (typeof showToast === 'function') showToast('Formulario completo. Para volver a una cosa a la vez: botón 📇 en Operación.', 'info', 5000);
    }
    if (typeof opSectionsRender === 'function') { try { opSectionsRender(_opcVehicleById(activeVehicleId), false); } catch (e) {} }
}
function _opcVehicleById(id) { return (db.vehicles || []).find(function(v) { return v.id == id; }); }

// ── Pintar ───────────────────────────────────────────────────────────────

function _opcChrome() {
    if (!document.getElementById('oc-head')) {
        var h = document.createElement('div');
        h.id = 'oc-head';
        h.className = 'oc-head';
        document.body.appendChild(h);
    }
    if (!document.getElementById('oc-foot')) {
        var f = document.createElement('div');
        f.id = 'oc-foot';
        f.className = 'oc-foot';
        f.innerHTML =
            '<button type="button" class="oc-back" onclick="opCardsBack()" aria-label="Tarjeta anterior">‹</button>' +
            '<button type="button" class="oc-later" onclick="opCardsLater()" title="Avanzar sin guardar este dato ahora">Después</button>' +
            '<button type="button" class="oc-save" onclick="opCardsSave()">Guardar ▸</button>';
        document.body.appendChild(f);
        _opcSwipe();
    }
}

function _opcRebuild() {
    var r = opCardsFrom(_opcGroups(_opcVehicle()));
    _opc.cards = r.cards;
    _opc.sections = r.sections;
    _opc.pending = r.pending;
    return r;
}

function _opcHeader() {
    var head = document.getElementById('oc-head');
    if (!head || !_opc) return;
    var v = _opcVehicle() || {};
    var vin = String(v.vin || '');
    var tail = vin.length > 8 ? '…' + vin.slice(-8) : vin;
    var c = _opc.final ? null : _opc.cards[_opc.idx];
    var sec = c ? (_opc.sections || []).find(function(s) { return _opc.idx >= s.start && _opc.idx < s.start + s.count; }) : null;
    var where = c ? (sec.name + ' · ' + (_opc.idx - sec.start + 1) + ' de ' + sec.count) : 'Resumen';
    var n = _opc.cards.length || 1;
    var segs = (_opc.sections || []).map(function(s) {
        var done = _opc.final ? 1 : Math.max(0, Math.min(1, (_opc.idx - s.start + (c ? 1 : 0)) / s.count));
        var here = sec && sec.name === s.name;
        return '<button type="button" class="oc-seg' + (here ? ' is-here' : '') + '" style="flex:' + s.count + '" ' +
            'onclick="opCardsGoSection(' + s.start + ')" aria-label="Ir a ' + escapeHtml(s.name) + '">' +
            '<span class="oc-seg-bar"><span class="oc-seg-fill" style="transform:scaleX(' + done.toFixed(3) + ')"></span></span></button>';
    }).join('');
    head.innerHTML =
        '<div class="oc-head-row">' +
            '<button type="button" class="oc-x" onclick="opCardsExit()" aria-label="Salir al formulario completo">✕</button>' +
            '<div class="oc-head-what"><b>' + escapeHtml(tail) + '</b> · Operación<div class="oc-head-sub">' + escapeHtml(where) + '</div></div>' +
            '<div class="oc-saved" id="oc-saved" aria-live="polite"></div>' +
        '</div>' +
        '<div class="oc-segs" aria-hidden="' + (n > 1 ? 'false' : 'true') + '">' + segs + '</div>';
}

function _opcGo(i, dir) {
    if (!_opc) return;
    [].slice.call(document.querySelectorAll('.oc-current')).forEach(function(el) { el.classList.remove('oc-current', 'oc-in', 'oc-in-back'); });
    var fin = document.getElementById('oc-final');
    if (i >= _opc.cards.length) { _opcFinal(); return; }
    if (fin) fin.remove();
    document.body.classList.remove('oc-at-final');
    _opc.final = false;
    _opc.idx = Math.max(0, i);
    _opc.dir = dir || 1;
    var c = _opc.cards[_opc.idx];
    var el = c && _opcEl(c.key);
    if (!el) return;
    // La sección de la tarjeta tiene que estar abierta (el acordeón deja una sola abierta).
    var acc = el.closest('details');
    if (acc && !acc.open) acc.open = true;
    el.classList.add('oc-current', dir < 0 ? 'oc-in-back' : 'oc-in');
    _opcHeader();
    var save = document.querySelector('#oc-foot .oc-save');
    if (save) save.textContent = 'Guardar ▸';
    var back = document.querySelector('#oc-foot .oc-back');
    if (back) back.disabled = _opc.idx === 0;
    try { window.scrollTo(0, 0); } catch (e) {}
    // Foco al primer campo (≥ 16 px: iOS no hace zoom). En fichas, a la ficha.
    setTimeout(function() {
        var f = el.querySelector('input:not([type=hidden]):not([disabled]), textarea, .ui-chips button, select:not([data-chips])');
        if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) {} }
    }, 120);
}

function _opcFinal() {
    _opc.final = true;
    document.body.classList.add('oc-at-final');
    var r = _opcRebuild();
    var host = document.getElementById('op-content');
    var fin = document.getElementById('oc-final');
    if (!fin) { fin = document.createElement('div'); fin.id = 'oc-final'; fin.className = 'oc-final'; host.appendChild(fin); }
    var pend = r.pending.map(function(i) { return r.cards[i]; });
    var h = '<div class="oc-final-title">' + (pend.length ? 'Te falta' + (pend.length === 1 ? ' 1 dato' : 'n ' + pend.length + ' datos') : '✓ Todo capturado') + '</div>';
    if (pend.length) {
        // Compacto: un botón para seguir con lo pendiente y una fila por sección. Con 20
        // faltantes, una lista de campos empujaba el siguiente paso fuera de la pantalla.
        h += '<button type="button" class="btn-primary oc-next" onclick="opCardsResume()">Seguir con lo que falta ▸</button>';
        h += '<div class="oc-final-list">';
        (r.sections || []).forEach(function(sec) {
            var mine = pend.filter(function(c) { return c.index >= sec.start && c.index < sec.start + sec.count; });
            if (!mine.length) return;
            h += '<button type="button" class="miss-link oc-final-sec" onclick="opCardsResume(' + mine[0].index + ')">' +
                 escapeHtml(sec.name) + ' <span class="u-muted">· falta' + (mine.length === 1 ? ' 1' : 'n ' + mine.length) + '</span> ›</button>';
        });
        h += '</div><p class="oc-final-hint">Puedes dejarlos para después: la app los recuerda y la próxima vez empieza por el primero.</p>';
    }
    var v = _opcVehicle();
    var cur = (document.getElementById('op_status') || {}).value || (v && v.status);
    var step = (typeof OP_NEXT_STEPS !== 'undefined') ? OP_NEXT_STEPS[cur] : null;
    if (step) {
        h += '<button type="button" class="' + (pend.length ? 'btn-secondary' : 'btn-primary') + ' oc-next" onclick="opCardsAdvance()">' + escapeHtml(step.label) + '</button>' +
             '<div class="oc-final-hint">' + escapeHtml(step.hint) + '</div>';
    }
    h += '<button type="button" class="oc-exit-link" onclick="opCardsExit()">Ver el formulario completo</button>';
    fin.innerHTML = h;
    fin.classList.remove('oc-in'); void fin.offsetWidth; fin.classList.add('oc-in');
    _opcHeader();
    try { window.scrollTo(0, 0); } catch (e) {}
}

// ── Acciones ─────────────────────────────────────────────────────────────

/** Guardar = saveProgress de siempre + siguiente. Un obligatorio vacío no avanza. */
function opCardsSave() {
    if (!_opc || _opc.final) return;
    var r = _opcRebuild();
    var c = r.cards[_opc.idx];
    if (c && c.missing.length) {
        c.missing.forEach(function(id) { var x = document.getElementById(id); if (x) uiFieldError(x, 'Falta este dato. Si todavía no lo tienes, toca "Después".'); });
        uiFocusFirstInvalid(_opcEl(c.key));
        return;
    }
    if (typeof saveProgress === 'function') saveProgress({ silent: true });
    var s = document.getElementById('oc-saved');
    if (s) { s.textContent = '✓ Guardado'; s.classList.remove('is-on'); void s.offsetWidth; s.classList.add('is-on'); }
    _opcGo(_opcNextIdx(), 1);
}
/** La siguiente tarjeta: la de al lado, o —al retomar— el siguiente pendiente. */
function _opcNextIdx() {
    if (!_opc.onlyPending) return _opc.idx + 1;
    var r = _opcRebuild();
    var nx = r.pending.filter(function(i) { return i > _opc.idx; })[0];
    return nx === undefined ? r.cards.length : nx;
}
function opCardsLater() { if (_opc && !_opc.final) _opcGo(_opcNextIdx(), 1); }
/** Retomar lo pendiente (desde el resumen): solo se pregunta lo que falta. */
function opCardsResume(i) {
    if (!_opc) return;
    var r = _opcRebuild();
    _opc.onlyPending = true;
    _opcGo(typeof i === 'number' ? i : (r.firstPending >= 0 ? r.firstPending : 0), 1);
}
function opCardsBack() {
    if (!_opc) return;
    if (_opc.final) { _opcGo(_opc.cards.length - 1, -1); return; }
    if (_opc.idx > 0) _opcGo(_opc.idx - 1, -1);
}
function opCardsGoCard(i) { if (_opc) { _opcRebuild(); _opcGo(i, 1); } }
function opCardsGoSection(start) { if (_opc) _opcGo(start, start >= _opc.idx ? 1 : -1); }

/** El "Siguiente paso" de siempre; si cambia el estado aparecen tarjetas nuevas (p. ej. la verificación). */
function opCardsAdvance() {
    if (!_opc) return;
    var before = _opc.cards.length;
    if (typeof opAdvance === 'function') opAdvance();
    setTimeout(function() {
        if (!_opc) return;
        var tab = document.querySelector('#platform-cop15 .tab.active');
        if (!tab || tab.getAttribute('data-tab') !== 'seguimiento') { opCardsExit({ keepPref: true }); return; }
        var r = _opcRebuild();
        if (r.cards.length > before && r.firstPending >= 0) _opcGo(r.firstPending, 1);
        else _opcFinal();
    }, 250);
}

// Deslizar SOLO navega (nunca guarda). Enter en un campo = Guardar.
function _opcSwipe() {
    if (window._opcSwipeOn) return;
    window._opcSwipeOn = true;
    var x0 = null, y0 = null;
    document.addEventListener('touchstart', function(e) {
        if (!_opc || !e.touches || e.touches.length !== 1) return;
        if (e.target.closest && e.target.closest('#oc-head, #oc-foot, .ui-num-row, input[type=range]')) { x0 = null; return; }
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
        if (!_opc || x0 === null || !e.changedTouches) return;
        var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) < OP_CARD_SWIPE_PX || Math.abs(dx) < 2 * Math.abs(dy)) return;
        if (dx < 0) opCardsLater(); else opCardsBack();
    }, { passive: true });
    document.addEventListener('keydown', function(e) {
        if (!_opc || e.key !== 'Enter' || e.isComposing) return;
        var t = e.target;
        if (!t || !t.closest || !t.closest('.oc-current') || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') return;
        e.preventDefault();
        opCardsSave();
    }, true);
}

/** ¿El modo tarjetas está activo? (para pruebas y para quien necesite saberlo) */
function opCardsActive() { return !!_opc; }

// ── Ganchos ──────────────────────────────────────────────────────────────
// Se envuelven (mismo patrón que firebase-sync con saveDB) en vez de tocar funciones
// largas con varias salidas tempranas.
(function() {
    var _origLoad = window.loadVehicle;
    if (typeof _origLoad === 'function') {
        window.loadVehicle = function() {
            if (_opc) opCardsExit({ keepPref: true });
            var r = _origLoad.apply(this, arguments);
            // Después de que se pinten fichas y controles numéricos.
            setTimeout(function() { try { opCardsAuto(); } catch (e) { console.warn('opCardsAuto:', e); } }, 60);
            return r;
        };
    }
    // "Ir al campo" (lista de faltantes al avanzar) en modo tarjetas = ir a SU tarjeta.
    var _origGoTo = window.cascadeGoToField;
    if (typeof _origGoTo === 'function') {
        window.cascadeGoToField = function(id) {
            var el = _opc && document.getElementById(id);
            var card = el && el.closest('.oc-card');
            if (card) {
                var r = _opcRebuild();
                var c = r.cards.filter(function(x) { return x.key === card.getAttribute('data-oc-key'); })[0];
                if (c) { _opcGo(c.index, 1); return; }
            }
            return _origGoTo.apply(this, arguments);
        };
    }
    var _origSwitch = window.switchPlatform;
    if (typeof _origSwitch === 'function') {
        window.switchPlatform = function(platform) {
            if (_opc && platform !== 'cop15') opCardsExit({ keepPref: true });
            return _origSwitch.apply(this, arguments);
        };
    }
    document.addEventListener('click', function(e) {
        if (!_opc) return;
        var t = e.target && e.target.closest && e.target.closest('#platform-cop15 .tab[data-tab]');
        if (t && t.getAttribute('data-tab') !== 'seguimiento') opCardsExit({ keepPref: true });
    }, true);
})();
