// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Revisión dirigida (2.8.0)                               ║
// ║                                                                      ║
// ║  Sustituye al doble ciego SOLO en pruebas con archivo de VETS y solo ║
// ║  en vehículos dados de alta a partir de la fecha efectiva que fija   ║
// ║  quien administra regulaciones (con la revisión del procedimiento    ║
// ║  COP15 que la respalda). El aprobador ya no reteclea: recorre cinco  ║
// ║  bloques (identidad, montaje, validez, resultados, OBD/OBFCM) con    ║
// ║  lo esperado al lado y marca cada uno; lo que no está en verde exige ║
// ║  "Acepto porque…" o devolver al liberador.                           ║
// ║                                                                      ║
// ║  Reglas:                                                             ║
// ║  · Un vehículo termina con las reglas con las que empezó: el sello   ║
// ║    se pone en el Alta (vehicle.reviewFlow = 'dirigida') y su         ║
// ║    AUSENCIA significa doble ciego (opt-out: nada que migrar).         ║
// ║  · Sin archivo de VETS → doble ciego, aunque tenga el sello.          ║
// ║  · El candado vive en approveAndArchive (capa de datos), no solo en  ║
// ║    el botón. El F05 no cambia.                                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

var REVIEW_BLOCKS = [
    { id: 'identidad',  title: '1 · Identidad',   help: 'review_identidad' },
    { id: 'montaje',    title: '2 · Montaje',     help: 'review_montaje' },
    { id: 'validez',    title: '3 · Validez',     help: 'review_validez' },
    { id: 'resultados', title: '4 · Resultados',  help: 'review_resultados' },
    { id: 'obd',        title: '5 · OBD / OBFCM', help: 'review_obd' }
];
var REVIEW_DYNO_TOL_PCT = 0.5;     // Target / ETW contra el ICMS
var REVIEW_JUST_MIN = 5;

// ══════════════════════════════════════════════════════════════════════
// Activación (pnState.reviewFlow, sincronizada con el panel)
// ══════════════════════════════════════════════════════════════════════

/** {active, since:'AAAA-MM-DD', procRef, by, at} o null. */
function reviewFlowSettings() {
    var r = (typeof pnState !== 'undefined' && pnState) ? pnState.reviewFlow : null;
    return r && r.since ? r : null;
}

/** ¿Se sella como revisión dirigida un vehículo dado de alta en `registeredAtIso`? PURA. */
function reviewFlowSealFor(settings, registeredAtIso) {
    if (!settings || !settings.active || !settings.since || !registeredAtIso) return false;
    var d = new Date(registeredAtIso);
    if (isNaN(d.getTime())) return false;
    var p = function(x) { return (x < 10 ? '0' : '') + x; };
    var local = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    return local >= settings.since;
}

/**
 * LA definición de con qué flujo se aprueba un vehículo. PURA.
 * 'dirigida' solo con sello Y archivo de VETS adjunto; cualquier otro caso, doble ciego.
 */
function reviewFlowFor(vehicle) {
    if (!vehicle || vehicle.reviewFlow !== 'dirigida') return 'doble-ciego';
    var v = vehicle.testData && vehicle.testData.vets;
    return (v && v.testRef) ? 'dirigida' : 'doble-ciego';
}

function reviewFlowActivate(since, procRef) {
    if (typeof authRequire === 'function' && !authRequire('regulation.manage', 'activar la revisión dirigida')) return false;
    since = String(since || '').trim();
    procRef = String(procRef || '').trim();
    var today = (typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) { showToast('Elige la fecha efectiva.', 'warning'); return false; }
    if (since < today) { showToast('La fecha efectiva no puede ser anterior a hoy: los vehículos ya dados de alta siguen con doble ciego.', 'warning'); return false; }
    if (procRef.length < REVIEW_JUST_MIN) { showToast('Escribe la revisión del procedimiento COP15 que respalda el cambio (Ej.: COP15 rev. 05).', 'warning'); return false; }
    var antes = reviewFlowSettings();
    var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
    pnState.reviewFlow = { active: true, since: since, procRef: procRef, by: who, at: new Date().toISOString() };
    if (typeof pnSave === 'function') pnSave();
    if (typeof auditLog === 'function') {
        auditLog('cop15', 'revision_dirigida_activada', { type: 'procedimiento', label: procRef },
            'Revisión dirigida para vehículos dados de alta desde ' + since + ' · ' + procRef,
            { before: antes ? { activa: !!antes.active, desde: antes.since, procedimiento: antes.procRef } : null,
              after: { activa: true, desde: since, procedimiento: procRef } });
    }
    return true;
}

function reviewFlowDeactivate(reason) {
    if (typeof authRequire === 'function' && !authRequire('regulation.manage', 'desactivar la revisión dirigida')) return false;
    var antes = reviewFlowSettings();
    if (!antes || !antes.active) return false;
    if (String(reason || '').trim().length < REVIEW_JUST_MIN) { showToast('Escribe por qué se desactiva.', 'warning'); return false; }
    var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
    pnState.reviewFlow = Object.assign({}, antes, { active: false, by: who, at: new Date().toISOString(), reason: String(reason).trim() });
    if (typeof pnSave === 'function') pnSave();
    if (typeof auditLog === 'function') {
        auditLog('cop15', 'revision_dirigida_desactivada', { type: 'procedimiento', label: antes.procRef },
            'Los vehículos nuevos vuelven a doble ciego (los ya sellados terminan con revisión dirigida) · ' + reason,
            { before: { activa: true, desde: antes.since }, after: { activa: false } });
    }
    return true;
}

// ══════════════════════════════════════════════════════════════════════
// Los cinco bloques (PURO: todo lo externo llega en `ctx`)
// ══════════════════════════════════════════════════════════════════════

var _REVIEW_RANK = { na: 0, ok: 1, warn: 2, fail: 3 };

function _reviewRel(a, b) {
    if (a == null || b == null || !isFinite(a) || !isFinite(b)) return null;
    if (b === 0) return a === 0 ? 0 : 100;
    return Math.abs(a - b) / Math.abs(b) * 100;
}
function _reviewFmt(v, sig) {
    if (v == null || !isFinite(v)) return '—';
    return String(parseFloat(Number(v).toPrecision(sig || 5)));
}

/**
 * ctx = {
 *   profile,             // perfil congelado del liberador (gases + límites)
 *   others: [vehicles],  // para prueba duplicada y CALID/CVN de la misma configuración
 *   soakRequired: {hours} | null,
 *   isEurope: bool,
 *   inertia: {inertia} | null,   // homoWltpInertia del ICMS
 *   vinCheck: fn(alta, archivo, ecu) → {status, ok, block, message},
 *   gasValue: fn(summary, field, unit) → número | null,   // valor de VETS en la unidad del perfil
 *   implausible: fn(field, value) → bool
 * }
 * Devuelve [{id, title, status:'ok'|'warn'|'fail'|'na', items:[{status, text, hard}]}].
 */
function reviewBlocks(vehicle, ctx) {
    ctx = ctx || {};
    var td = (vehicle && vehicle.testData) || {};
    var s = td.vets || {};
    var out = {};
    REVIEW_BLOCKS.forEach(function(b) { out[b.id] = { id: b.id, title: b.title, items: [] }; });
    var add = function(block, status, text, hard) { out[block].items.push({ status: status, text: text, hard: !!hard }); };

    // 1 · Identidad
    var vc = ctx.vinCheck ? ctx.vinCheck(vehicle.vin, s.vinFile, s.vinEcu) : null;
    if (vc) {
        if (vc.ok) add('identidad', 'ok', vc.message);
        else add('identidad', vc.block ? 'fail' : 'warn', vc.message + (s.vinJustification ? ' — el liberador: "' + s.vinJustification + '"' : ''), vc.block);
    }
    var dup = (ctx.others || []).filter(function(o) { return o && o.id != vehicle.id && o.testData && o.testData.vets && o.testData.vets.testRef === s.testRef; });
    if (dup.length) add('identidad', 'fail', 'La prueba VETS #' + (s.testNumber || '') + ' también está adjunta a ' + dup.map(function(o) { return o.vin; }).join(', ') + '.', true);
    else add('identidad', 'ok', 'La prueba VETS #' + (s.testNumber || '') + ' solo está adjunta a este vehículo.');
    var tdt = String(td.testDatetime || '').slice(0, 16);
    if (s.testStart && tdt && tdt !== s.testStart) add('identidad', 'warn', 'La fecha de prueba registrada (' + tdt.replace('T', ' ') + ') no es la de VETS (' + s.testStart.replace('T', ' ') + ').');
    else if (s.testStart) add('identidad', 'ok', 'Fecha de prueba ' + s.testStart.replace('T', ' ') + ' (VETS).');
    var pre = td.preconditioning && td.preconditioning.datetime;
    var when = s.testStart || tdt;
    if (!pre) add('identidad', 'warn', 'No hay fecha de preacondicionamiento para comprobar el reposo.');
    else if (when) {
        var h = (new Date(when).getTime() - new Date(pre).getTime()) / 3600000;
        if (!(h > 0)) add('identidad', 'warn', 'La prueba (' + when.replace('T', ' ') + ') no es posterior al preacondicionamiento (' + String(pre).replace('T', ' ') + ').');
        else if (ctx.soakRequired && ctx.soakRequired.hours && h < ctx.soakRequired.hours) add('identidad', 'warn', 'Reposo de ' + _reviewFmt(h, 3) + ' h; se requieren ' + ctx.soakRequired.hours + ' h.');
        else add('identidad', 'ok', 'Reposo de ' + _reviewFmt(h, 3) + ' h' + (ctx.soakRequired && ctx.soakRequired.hours ? ' (requerido ' + ctx.soakRequired.hours + ' h)' : '') + '.');
    }
    var proc = String(s.procedure || s.testName || '');
    if (proc) {
        var cicloOk = ctx.isEurope ? /WLTC|WLTP/i.test(proc) : /FTP|EPA|UDDS|HWFET|US06|SC03|LA-?4/i.test(proc);
        add('identidad', cicloOk ? 'ok' : 'warn', 'Ciclo: ' + proc + (cicloOk ? '' : ' — no es el esperado para ' + (ctx.isEurope ? 'Europa (WLTC)' : 'esta región (FTP)') + '.'));
    }

    // 2 · Montaje
    var d = s.dyno || null;
    var hom = vehicle.homolog || null;
    var cmp = function(label, vets, ref, refName, unit) {
        var r = _reviewRel(vets, ref);
        if (r === null) return;
        add('montaje', r <= REVIEW_DYNO_TOL_PCT ? 'ok' : 'warn', label + ': VETS ' + _reviewFmt(vets) + ' · ' + refName + ' ' + _reviewFmt(ref) + (unit ? ' ' + unit : '') +
            (r <= REVIEW_DYNO_TOL_PCT ? '' : ' (' + _reviewFmt(r, 2) + ' % de diferencia)'));
    };
    if (!d) add('montaje', 'warn', 'El registro de VETS no trae los coeficientes del dinamómetro (se adjuntó con una versión anterior): revisa el reporte.');
    else if (ctx.isEurope && hom && (hom.f0 != null || hom.tm != null)) {
        cmp('Target A', d.tA, hom.f0, 'ICMS f0', 'N');
        cmp('Target B', d.tB, hom.f1, 'ICMS f1', 'N/(km/h)');
        cmp('Target C', d.tC, hom.f2, 'ICMS f2', 'N/(km/h)²');
        if (ctx.inertia && ctx.inertia.inertia) cmp('Inercia', d.etw, ctx.inertia.inertia, 'ICMS TM+MR', 'kg');
        else add('montaje', 'warn', 'La ficha ICMS no trae TM y MR: no se puede comprobar la inercia.');
    } else {
        cmp('Target A', d.tA, td.targetA, 'Operación', 'N');
        cmp('Target B', d.tB, td.targetB, 'Operación', 'N/(km/h)');
        cmp('Target C', d.tC, td.targetC, 'Operación', 'N/(km/h)²');
        cmp('Inercia', d.etw, td.etw, 'Operación', 'kg');
        if (ctx.isEurope) add('montaje', 'warn', 'Vehículo de Europa sin ficha ICMS en el Alta: no se comparó contra la homologación.');
    }
    if (s.fuelName) add('montaje', 'ok', 'Combustible: ' + s.fuelName + '.');

    // 3 · Validez
    var fails = s.checksFail || [];
    fails.forEach(function(c) {
        if (c.level === 'desacreditada') add('validez', 'ok', c.name + ' — desacreditada por el laboratorio (' + (c.detail || '') + ').');
        else if (c.level === 'informativa') add('validez', 'ok', c.name + ' — informativa: ' + (c.detail || ''));
        else if (!c.level) add('validez', 'warn', c.name + ' — sin decidir todavía (botón ⏳ Decidir, arriba): ' + (c.detail || ''));   // [2.18.0]
        else add('validez', 'warn', c.name + ' — IMPORTANTE: ' + (c.detail || '') + (c.justification ? '. El liberador: "' + c.justification + '"' : ''));
    });
    add('validez', 'ok', (s.checksPass || 0) + ' verificaciones de VETS pasan' + (fails.length ? ', ' + fails.length + ' fallaron' : '') + '.');
    // [2.31.0] Se puede aceptar; se avisa que el resultado no cuenta para CoP (no exige justificación).
    if (typeof vetsDriveTraceInvalid === 'function') vetsDriveTraceInvalid(s).forEach(function(r) {
        add('validez', 'ok', '⊘ No contará para CoP (validador, SPC ni REQ del plan): ' + r.text + '.');
    });
    var dr = s.drive || {};
    if ((dr.driverErrors || 0) > 0 || (dr.violations || 0) > 0) add('validez', 'warn', 'Errores de manejo: ' + (dr.driverErrors || 0) + ' · violaciones: ' + (dr.violations || 0) + '.');

    // 4 · Resultados
    var lib = (td.gasResults && td.gasResults.liberador && td.gasResults.liberador.values) || {};
    var prof = ctx.profile;
    if (!prof || !prof.gases || !prof.gases.length) add('resultados', 'fail', 'No hay perfil de gases con qué juzgar.', true);
    else prof.gases.forEach(function(g) {
        var v = lib[g.field];
        var lim = (g.limit === null || g.limit === undefined || g.limit === '') ? null : Number(g.limit);
        if (v == null || v === '') { if (lim !== null) add('resultados', 'fail', g.label + ': sin valor del liberador.', true); return; }
        v = Number(v);
        var txt = g.label + ' ' + _reviewFmt(v) + ' ' + g.unit + (lim !== null ? ' · límite ' + lim : ' · sin límite');
        if (lim !== null && v > lim) add('resultados', 'fail', txt + ' — SOBRE EL LÍMITE.', true);
        else add('resultados', 'ok', txt + (lim !== null ? ' (' + _reviewFmt(v / lim * 100, 3) + ' % del límite)' : '') + '.');
        var vv = ctx.gasValue ? ctx.gasValue(s, g.field, g.unit) : null;
        if (vv !== null && vv !== undefined) {
            var rel = _reviewRel(v, vv);
            if (rel !== null && rel > 0.5) add('resultados', 'warn', g.label + ': el valor enviado (' + _reviewFmt(v) + ') no es el de VETS (' + _reviewFmt(vv) + ').');
        }
        if (ctx.implausible && ctx.implausible(g.field, v)) add('resultados', 'warn', g.label + ': valor fuera del rango plausible.');
    });
    (s.vetsLimits || []).forEach(function(l) {
        if (l.pass === false) add('resultados', 'warn', 'VETS marcó ' + l.name + ' fuera de SUS límites configurados (Cascade juzga con la regulación del vehículo).');
    });

    // 5 · OBD / OBFCM
    var obd = s.obd || {};
    var hayObd = !!(obd.mil || obd.calid || s.vinEcu || s.obfcm);
    if (hayObd) {
        if (obd.mil) add('obd', /^off$/i.test(obd.mil) ? 'ok' : 'fail', 'MIL (testigo de falla) ' + obd.mil + '.');
        if (s.obfcm && s.obfcm.accuracyPct != null) add('obd', 'ok', 'OBFCM: ' + _reviewFmt(s.obfcm.fuelL, 4) + ' L según el vehículo · exactitud ' + _reviewFmt(s.obfcm.accuracyPct, 3) + ' % (calculada por VETS).');
        if (obd.calid) {
            var prev = (ctx.others || []).filter(function(o) {
                return o && o.id != vehicle.id && o.configCode === vehicle.configCode && o.testData && o.testData.vets && o.testData.vets.obd && o.testData.vets.obd.calid;
            });
            var distintos = prev.filter(function(o) { return o.testData.vets.obd.calid !== obd.calid || (obd.cvn && o.testData.vets.obd.cvn && o.testData.vets.obd.cvn !== obd.cvn); });
            if (!prev.length) add('obd', 'ok', 'CALID ' + obd.calid + ' · CVN ' + (obd.cvn || '—') + ' (primera prueba de esta configuración con estos datos).');
            else if (distintos.length) add('obd', 'warn', 'CALID/CVN ' + obd.calid + ' / ' + (obd.cvn || '—') + ' distinto al de ' + distintos.map(function(o) { return o.vin + ' (' + o.testData.vets.obd.calid + ')'; }).join(', ') + ': ¿cambió la calibración?');
            else add('obd', 'ok', 'CALID ' + obd.calid + ' · CVN ' + (obd.cvn || '—') + ', igual que en ' + prev.length + ' prueba(s) anteriores de esta configuración.');
        }
    }

    return REVIEW_BLOCKS.map(function(b) {
        var blk = out[b.id];
        blk.help = b.help;
        if (!blk.items.length) { blk.status = 'na'; return blk; }
        blk.status = blk.items.reduce(function(m, it) { return _REVIEW_RANK[it.status] > _REVIEW_RANK[m] ? it.status : m; }, 'ok');
        blk.hard = blk.items.some(function(it) { return it.hard && it.status === 'fail'; });
        return blk;
    });
}

/**
 * ¿Se puede aprobar? PURA. marks = {blockId: {ack:true, justification}}.
 * Todo bloque aplicable marcado; ⚠/✗ con "Acepto porque…" (≥5); un ✗ duro no se acepta.
 */
function reviewReady(blocks, marks) {
    marks = marks || {};
    var missing = [], hard = [];
    (blocks || []).forEach(function(b) {
        if (b.status === 'na') return;
        if (b.hard) { hard.push(b.title); return; }
        var m = marks[b.id];
        if (!m || !m.ack) { missing.push(b.title); return; }
        if (b.status !== 'ok' && String(m.justification || '').trim().length < REVIEW_JUST_MIN) missing.push(b.title + ' (falta "Acepto porque…")');
    });
    return { ok: !missing.length && !hard.length, missing: missing, hard: hard };
}

/** Contexto real de la pantalla (lo que reviewBlocks necesita). */
function reviewContextFor(vehicle) {
    var cfg = (vehicle && vehicle.config) || {};
    var hom = vehicle && vehicle.homolog;
    return {
        profile: (typeof _libGasProfileForVehicle === 'function') ? _libGasProfileForVehicle(vehicle) : null,
        others: (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [],
        soakRequired: (typeof cascadeSoakRequired === 'function') ? cascadeSoakRequired(vehicle) : null,
        isEurope: (typeof homoIsEurope === 'function') ? homoIsEurope(cfg.REGION) : /EUROP/i.test(cfg.REGION || ''),
        inertia: (hom && typeof homoWltpInertia === 'function') ? homoWltpInertia({ tm: hom.tm, mr: hom.mr }) : null,
        vinCheck: (typeof vetsVinCheck === 'function') ? vetsVinCheck : null,
        gasValue: function(summary, field, unit) {
            if (typeof vetsGasValue !== 'function' || !summary || !summary.gases) return null;
            var rec = { gases: {} };
            Object.keys(summary.gases).forEach(function(k) { rec.gases[k] = { value: summary.gases[k].v, unit: summary.gases[k].u }; });
            return vetsGasValue(rec, field, unit);
        },
        implausible: (typeof _libValueImplausible === 'function') ? _libValueImplausible : null
    };
}

// ══════════════════════════════════════════════════════════════════════
// Pantalla de Aprobación
// ══════════════════════════════════════════════════════════════════════

var _reviewMarks = {};   // {vehicleId: {blockId: {ack, justification, by, at}}} mientras se revisa

var REVIEW_ICON = { ok: '✓', warn: '⚠️', fail: '✗', na: '—' };

function reviewRenderApproval(vehicle) {
    var el = document.getElementById('appr-gas-entry-content');
    if (!el) return;
    var st = reviewFlowSettings();
    var blocks = reviewBlocks(vehicle, reviewContextFor(vehicle));
    var marks = _reviewMarks[vehicle.id] = _reviewMarks[vehicle.id] || {};
    var vid = String(vehicle.id).replace(/[^\w.-]/g, '');
    var h = '<div class="review-intro">🧭 <b>Revisión dirigida</b>' + (st ? ' (' + escapeHtml(st.procRef) + ', vehículos desde ' + escapeHtml(st.since) + ')' : '') +
        ': no se reteclean valores. Revisa cada bloque: lo que está en verde se marca de un toque; lo que no, se acepta explicando por qué o se devuelve al liberador.</div>';
    blocks.forEach(function(b) {
        var m = marks[b.id] || {};
        h += '<div class="review-block review-block--' + b.status + '">' +
            '<div class="review-block-head"><span class="review-icon">' + REVIEW_ICON[b.status] + '</span><b data-help="' + b.help + '">' + escapeHtml(b.title) + '</b>' +
            (m.ack ? '<span class="review-done">Revisado ✓' + (m.justification ? ' · ' + escapeHtml(m.justification) : '') + '</span>' : '') + '</div>';
        if (b.status === 'na') h += '<div class="u-muted review-item">No aplica a esta prueba.</div>';
        b.items.forEach(function(it) { h += '<div class="review-item review-item--' + it.status + '">' + REVIEW_ICON[it.status] + ' ' + escapeHtml(it.text) + '</div>'; });
        if (b.status !== 'na') {
            if (b.hard) h += '<div class="review-hard">Esto no se puede aceptar: devuelve la prueba al liberador.</div>';
            else if (!m.ack) {
                if (b.status === 'ok') h += '<button type="button" class="btn-secondary review-ack" onclick="reviewMark(\'' + vid + '\',\'' + b.id + '\')">Revisado ✓</button>';
                else h += '<div class="review-accept"><input type="text" id="review-just-' + b.id + '" placeholder="Acepto porque… (Ej.: la temperatura del prefiltro está mal configurada en VETS)">' +
                          '<button type="button" class="btn-secondary review-ack" onclick="reviewMark(\'' + vid + '\',\'' + b.id + '\')">Aceptar</button></div>';
            } else h += '<button type="button" class="btn-link review-undo" onclick="reviewUnmark(\'' + vid + '\',\'' + b.id + '\')">Volver a revisar</button>';
        }
        h += '</div>';
    });
    h += '<div id="review-status" class="review-status" aria-live="polite"></div>';
    el.innerHTML = h;
    reviewRefreshButton(vehicle, blocks);
    if (typeof cascadeInjectTooltipsDeferred === 'function') cascadeInjectTooltipsDeferred();
}

function reviewRefreshButton(vehicle, blocks) {
    var r = reviewReady(blocks || reviewBlocks(vehicle, reviewContextFor(vehicle)), _reviewMarks[vehicle.id]);
    var btn = document.getElementById('approve-archive-btn');
    var _vw = (typeof _aprVetsWhy === 'function') ? _aprVetsWhy(vehicle) : '';   // [2.20.0]
    uiExplainDisabled(btn, r.ok ? _vw : r.hard.length
        ? 'No se puede aprobar: ' + r.hard.join(', ') + ' tiene un problema que no se acepta. Devuélvela al liberador.'
        : 'Falta revisar: ' + r.missing.join(', ') + '.');
    var box = document.getElementById('review-status');
    if (box) box.textContent = r.ok ? 'Los cinco bloques están revisados: ya puedes aprobar y firmar.'
        : r.hard.length ? 'No se puede aprobar: ' + r.hard.join(', ') + ' tiene un problema que no se acepta. Devuélvela al liberador.'
        : 'Falta revisar: ' + r.missing.join(', ') + '.';
}

function _reviewVehicle(vid) { return (db.vehicles || []).find(function(v) { return String(v.id).replace(/[^\w.-]/g, '') === String(vid); }); }

function reviewMark(vid, blockId) {
    var v = _reviewVehicle(vid);
    if (!v) return;
    var blocks = reviewBlocks(v, reviewContextFor(v));
    var b = blocks.find(function(x) { return x.id === blockId; });
    if (!b || b.hard) return;
    var just = '';
    if (b.status !== 'ok') {
        var inp = document.getElementById('review-just-' + blockId);
        just = inp ? String(inp.value || '').trim() : '';
        if (just.length < REVIEW_JUST_MIN) { showToast('Escribe por qué lo aceptas (al menos ' + REVIEW_JUST_MIN + ' caracteres) o devuelve la prueba al liberador.', 'warning'); if (inp) inp.focus(); return; }
    }
    var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
    (_reviewMarks[v.id] = _reviewMarks[v.id] || {})[blockId] = { ack: true, justification: just, status: b.status, by: who, at: new Date().toISOString() };
    reviewRenderApproval(v);
}

function reviewUnmark(vid, blockId) {
    var v = _reviewVehicle(vid);
    if (!v || !_reviewMarks[v.id]) return;
    delete _reviewMarks[v.id][blockId];
    reviewRenderApproval(v);
}

/**
 * Candado de la capa de datos para approveAndArchive. Devuelve {ok, reason, record}.
 * `record` es lo que se guarda en testData.review.
 */
function reviewApprovalCheck(vehicle) {
    var blocks = reviewBlocks(vehicle, reviewContextFor(vehicle));
    var marks = _reviewMarks[vehicle.id] || {};
    var r = reviewReady(blocks, marks);
    if (!r.ok) return { ok: false, reason: r.hard.length ? 'No se puede aprobar: ' + r.hard.join(', ') + '. Devuélvela al liberador.' : 'Falta revisar: ' + r.missing.join(', ') + '.' };
    var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
    var st = reviewFlowSettings();
    return { ok: true, record: {
        flow: 'dirigida', procRef: st ? st.procRef : '', vetsTestRef: (vehicle.testData.vets || {}).testRef || '',
        by: who, at: new Date().toISOString(),
        blocks: blocks.map(function(b) {
            var m = marks[b.id] || {};
            return { id: b.id, title: b.title, status: b.status, justification: m.justification || '', by: m.by || '', at: m.at || '',
                     items: b.items.filter(function(it) { return it.status !== 'ok'; }).map(function(it) { return it.status + ': ' + it.text; }) };
        })
    } };
}

/** Nota en Liberación: qué flujo le tocará a este vehículo al aprobarlo. */
function reviewReleaseNoteHTML(vehicle) {
    if (!vehicle || vehicle.reviewFlow !== 'dirigida') return '';
    var conVets = reviewFlowFor(vehicle) === 'dirigida';
    return '<div class="review-intro">🧭 ' + (conVets
        ? 'Este vehículo se aprobará con <b>revisión dirigida</b>: el aprobador no reteclea, revisa cinco bloques contra el archivo de VETS.'
        : 'Este vehículo está en <b>revisión dirigida</b>, pero sin archivo de VETS se aprobará con <b>doble ciego</b>. Adjunta la prueba para usar la revisión dirigida.') + '</div>';
}

// ══════════════════════════════════════════════════════════════════════
// Datos → Regulaciones: activación
// ══════════════════════════════════════════════════════════════════════

function reviewSettingsCardHTML() {
    var st = reviewFlowSettings();
    var today = (typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0, 10);
    var h = '<div class="tp-card" style="margin-bottom:var(--space-md);">' +
        '<div style="font-weight:700;font-size:var(--fs-sm);" data-help="review_config">🧭 Revisión dirigida (aprobación con archivo de VETS)</div>' +
        '<div style="font-size:var(--fs-sm);margin-top:var(--space-xs);line-height:var(--lh-base);">';
    if (st && st.active) {
        h += '✓ <b>Activa</b> para vehículos dados de alta desde <b>' + escapeHtml(st.since) + '</b> · ' + escapeHtml(st.procRef) +
            ' <span class="u-muted">(' + escapeHtml(st.by || '?') + ', ' + escapeHtml(String(st.at || '').slice(0, 10)) + ')</span>.' +
            '<div class="u-muted" style="margin-top:var(--space-2xs);">Los vehículos anteriores y los que no tengan archivo de VETS siguen con doble ciego.</div>' +
            '<div style="margin-top:var(--space-sm);"><button type="button" class="tp-btn" onclick="reviewDeactivateUI()">Desactivar para vehículos nuevos…</button></div>';
    } else {
        h += 'Hoy todas las aprobaciones son con <b>doble ciego</b>.' + (st && !st.active ? ' <span class="u-muted">(Desactivada el ' + escapeHtml(String(st.at || '').slice(0, 10)) + ': ' + escapeHtml(st.reason || '') + ')</span>' : '') +
            ' Al activarla, los vehículos que se den de alta <b>desde la fecha efectiva</b> y lleguen con archivo de VETS se aprueban revisando cinco bloques en vez de reteclear.' +
            '<div class="review-config">' +
            '<label>Fecha efectiva<input type="date" id="review-since" min="' + today + '" value="' + today + '"></label>' +
            '<label>Procedimiento que la respalda<input type="text" id="review-proc" placeholder="Ej.: COP15 rev. 05"></label>' +
            '<button type="button" class="tp-btn tp-btn-primary" onclick="reviewActivateUI()">Activar</button></div>';
    }
    return h + '</div></div>';
}

function reviewActivateUI() {
    var since = (document.getElementById('review-since') || {}).value;
    var proc = (document.getElementById('review-proc') || {}).value;
    showConfirm('Los vehículos que se den de alta desde el <b>' + escapeHtml(since || '') + '</b> y lleguen con archivo de VETS se aprobarán con revisión dirigida (' +
        escapeHtml(proc || '') + '). Los anteriores terminan con doble ciego. Queda en el historial de cambios.', function() {
        if (reviewFlowActivate(since, proc)) { showToast('Revisión dirigida activada desde ' + since + '.', 'success'); if (typeof pnRender === 'function') pnRender(); }
    }, { title: 'Activar revisión dirigida', type: 'warning', confirmText: 'Activar' });
}

function reviewDeactivateUI() {
    uiPrompt({ title: 'Desactivar revisión dirigida', label: 'Motivo', placeholder: 'Ej.: auditoría interna pidió volver al doble ciego', required: true }).then(function(r) {
        if (r === null) return;
        if (reviewFlowDeactivate(r)) { showToast('Los vehículos nuevos vuelven a doble ciego.', 'success'); if (typeof pnRender === 'function') pnRender(); }
    });
}

if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    review_config: { title: 'Revisión dirigida',
        text: 'Reemplaza al doble ciego en pruebas con archivo de VETS. El aprobador no vuelve a teclear los resultados: recorre cinco bloques '
            + '(identidad, montaje, validez, resultados, OBD/OBFCM) con lo esperado al lado y marca cada uno; lo que no esté en verde lo acepta '
            + 'explicando por qué, o devuelve la prueba. Aplica solo a vehículos dados de alta desde la fecha efectiva (se sella en el Alta): '
            + 'un vehículo termina con las reglas con las que empezó. La activa quien administra regulaciones, con la revisión del procedimiento COP15.' },
    review_identidad: { title: 'Identidad', text: 'VIN del Alta contra VETS y el ECU, que la prueba no esté adjunta a otro vehículo, fecha de prueba contra el preacondicionamiento y el reposo requerido, y ciclo acorde a la región.' },
    review_montaje: { title: 'Montaje', text: 'Coeficientes y masa que usó el dinamómetro contra los del ICMS (Europa) o contra lo capturado en Operación. Tolerancia 0.5 %.' },
    review_validez: { title: 'Validez', text: 'Las verificaciones de VETS según el tratamiento del laboratorio (las desacreditadas no cuentan) y los errores de manejo.' },
    review_resultados: { title: 'Resultados', text: 'Cada gas contra el límite congelado de la regulación, que el valor enviado sea el de VETS, valores improbables y el veredicto de VETS.' },
    review_obd: { title: 'OBD / OBFCM', text: 'Testigo MIL, exactitud OBFCM calculada por VETS y que CALID/CVN coincidan con pruebas anteriores de la misma configuración.' }
});
