// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [3.24.0] Bloques de la celda — cada lugar de prueba de la semana    ║
// ║  termina en una prueba o en un motivo                                ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// La semana tiene una capacidad INSTALADA: los pares preacondicionamiento → prueba de lunes
// a viernes (tpSlotsForSoak, reposo default) × vehículos por par. Con 24 h y 2 por par son
// 8 bloques de prueba (martes a viernes, 2 por día). Un bloque:
//   · se llena con la prueba que se corrió ESE día (fecha de PRUEBA, como el calendario);
//   · si quedó vacío, lleva un motivo de una lista CERRADA (TP_BLOCK_REASONS) que registra
//     un signatario (test.approve), o el que la plataforma deduce (festivo, celda fuera de
//     servicio, mantenimiento o calibración de un equipo que detiene pruebas).
// Los bloques se CALCULAN (tpBlocksForWeek); lo único que se guarda es el motivo
// (tpState.blockNotes). Si mañana cambia la capacidad, los bloques cambian solos.

var TP_BLOCK_REASONS = [
    { id: 'qc',          icon: '🔬', es: 'Quality check / verificación interna', en: 'Quality check',            audit: 'Quality Checks' },
    { id: 'mtto',        icon: '🛠️', es: 'Mantenimiento o calibración',          en: 'Maintenance or calibration', audit: 'Equipment Maintenance' },
    { id: 'proyecto',    icon: '🗂️', es: 'Proyecto',                             en: 'Project',                  audit: 'Project' },
    { id: 'sinvehiculo', icon: '🚗', es: 'Sin vehículo disponible',              en: 'No vehicle available',     audit: 'No vehicle' },
    { id: 'celda',       icon: '⛔', es: 'Celda fuera de servicio',              en: 'Cell out of service',      audit: 'Cell out of service' },
    { id: 'invalida',    icon: '🔁', es: 'Prueba inválida o repetida',           en: 'Invalid or repeated test', audit: 'Invalid / repeated test' },
    { id: 'personal',    icon: '👥', es: 'Sin personal / capacitación',          en: 'No staff / training',      audit: 'No staff / training' },
    { id: 'festivo',     icon: '📅', es: 'Día festivo',                          en: 'Holiday',                  audit: 'Holiday' }
];
// La semana instalada: lunes a viernes. Un día no laborable de UNA semana (Disponibilidad)
// no quita bloques: los deja con motivo "Día festivo", para que se vea qué se perdió.
var TP_BLOCK_STD_DAYS = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };
var TP_BLOCK_NOTE_MAX = 240;
var TP_BLOCK_ASK_WEEKS = 2;   // HOY pide explicar los de esta semana y los de la anterior

/** La entrada de un motivo, o null. PURA. */
function tpBlockReason(id) {
    for (var i = 0; i < TP_BLOCK_REASONS.length; i++) if (TP_BLOCK_REASONS[i].id === id) return TP_BLOCK_REASONS[i];
    return null;
}

/** Identidad de un bloque: lunes|día|número. PURA. */
function tpBlockId(weekDate, day, n) { return weekDate + '|' + day + '|' + n; }
function tpBlockParseId(id) {
    var m = /^(\d{4}-\d{2}-\d{2})\|([a-z]{3})\|(\d+)$/.exec(String(id || ''));
    return m ? { weekDate: m[1], day: m[2], n: Number(m[3]) } : null;
}

/**
 * La capacidad instalada día por día. PURA: [{day, precon, n}] — `n` bloques de prueba ese
 * día (los pares que terminan ahí × vehículos por par), `precon` = el día en que se
 * preacondicionan (el primero de esos pares).
 */
function tpBlockLayout(soakHours, perSlot) {
    var per = Math.max(1, parseInt(perSlot, 10) || 1);
    var slots = tpSlotsForSoak(soakHours, TP_BLOCK_STD_DAYS).filter(function(s) { return !s.spillsNextWeek; });
    var byDay = {};
    slots.forEach(function(s) {
        if (!byDay[s.test]) byDay[s.test] = { day: s.test, precon: s.precon, n: 0 };
        byDay[s.test].n += per;
    });
    return TP_DAY_ORDER.filter(function(d) { return byDay[d]; }).map(function(d) { return byDay[d]; });
}

/**
 * LA definición de los bloques de una semana. PURA.
 * src = { weekDate, today, layout:[{day, iso, precon, preconIso, n}], tests:{iso:[t]},
 *         planned:{iso:[p]}, notes:{id:{reason, note, by, at}}, auto:{iso:{reason, note}} }
 * Cada bloque: {id, day, iso, n, precon, preconIso, state, test, planned, reason, note, by,
 * at, auto, noteOverridden}. Estados: 'prueba' | 'motivo' (lo registró un signatario) |
 * 'auto' (lo dedujo la plataforma) | 'planeada' | 'libre' | 'pendiente' (hoy, vacío) |
 * 'sin-explicar' (día pasado, vacío y sin motivo).
 * Las pruebas llenan primero los bloques sin motivo; las que no caben van a `extra`.
 */
function tpBlocksCompute(src) {
    var today = src.today || '', notes = src.notes || {}, auto = src.auto || {};
    var tests = src.tests || {}, planned = src.planned || {};
    var out = { weekDate: src.weekDate, days: [], blocks: [], extra: [], plannedOver: [] };
    (src.layout || []).forEach(function(L) {
        var day = { day: L.day, iso: L.iso, precon: L.precon, preconIso: L.preconIso, blocks: [] };
        var list = [];
        for (var n = 1; n <= L.n; n++) {
            var id = tpBlockId(src.weekDate, L.day, n), nt = notes[id];
            list.push({ id: id, day: L.day, iso: L.iso, n: n, precon: L.precon, preconIso: L.preconIso,
                        state: null, test: null, planned: null, reason: null, note: '', by: '', at: '',
                        auto: false, noteOverridden: false, _note: (nt && nt.reason && tpBlockReason(nt.reason)) ? nt : null });
        }
        // Pruebas: primero a los bloques sin motivo, luego a los que lo tienen (la prueba
        // manda: una corrida que llegó tarde no se esconde detrás de un motivo).
        var order = list.filter(function(b) { return !b._note; }).concat(list.filter(function(b) { return b._note; }));
        (tests[L.iso] || []).forEach(function(t, i) {
            if (i < order.length) { order[i].test = t; if (order[i]._note) order[i].noteOverridden = true; }
            else out.extra.push({ iso: L.iso, day: L.day, test: t });
        });
        var free = list.filter(function(b) { return !b.test; });
        (planned[L.iso] || []).forEach(function(p, i) {
            if (i < free.length) free[i].planned = p;
            else out.plannedOver.push({ iso: L.iso, day: L.day, planned: p });
        });
        var a = auto[L.iso] && tpBlockReason(auto[L.iso].reason) ? auto[L.iso] : null;
        list.forEach(function(b) {
            if (b.test) b.state = 'prueba';
            else if (b._note) { b.state = 'motivo'; b.reason = b._note.reason; b.note = b._note.note || ''; b.by = b._note.by || ''; b.at = b._note.at || ''; }
            else if (a) { b.state = 'auto'; b.reason = a.reason; b.note = a.note || ''; b.auto = true; }
            else if (L.iso > today) b.state = b.planned ? 'planeada' : 'libre';
            else if (L.iso === today) b.state = b.planned ? 'planeada' : 'pendiente';
            else b.state = 'sin-explicar';
            delete b._note;
            day.blocks.push(b); out.blocks.push(b);
        });
        out.days.push(day);
    });
    var T = { blocks: out.blocks.length, tests: 0, extra: out.extra.length, byReason: {}, explained: 0,
              unexplained: 0, pending: 0, planned: 0, free: 0, use: 0 };
    out.blocks.forEach(function(b) {
        if (b.state === 'prueba') T.tests++;
        else if (b.state === 'motivo' || b.state === 'auto') { T.explained++; T.byReason[b.reason] = (T.byReason[b.reason] || 0) + 1; }
        else if (b.state === 'sin-explicar') T.unexplained++;
        else if (b.state === 'pendiente') T.pending++;
        else if (b.state === 'planeada') T.planned++;
        else T.free++;
    });
    T.use = T.blocks ? T.tests / T.blocks : 0;
    out.total = T;
    return out;
}

/** Une los motivos de dos equipos: por bloque gana el de fecha más reciente. PURA y simétrica. */
function tpBlockNotesUnion(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function(src) {
        Object.keys(src).forEach(function(k) {
            var e = src[k];
            if (!k || !e || typeof e !== 'object') return;
            var cur = out[k], ea = String(e.at || ''), ca = cur ? String(cur.at || '') : '';
            if (!cur || ea > ca || (ea === ca && JSON.stringify(e) > JSON.stringify(cur))) out[k] = e;
        });
    });
    return out;
}

/** ¿`incoming` trae algún motivo más nuevo que `known`? PURA (la usa el sync). */
function tpBlockNotesNewTo(known, incoming) {
    known = known || {};
    return Object.keys(incoming || {}).some(function(k) {
        var e = incoming[k];
        if (!k || !e) return false;
        var c = known[k];
        return !c || String(e.at || '') > String(c.at || '') ||
               (String(e.at || '') === String(c.at || '') && JSON.stringify(e) > JSON.stringify(c));
    });
}

/** La configuración corta que viaja en un bloque (sin VIN): basta para nombrar la familia. */
function _tpBlockCfgOf(cfg) {
    return cfg ? { mod: cfg.mod || '', eng: cfg.eng || '', ep: cfg.ep || '', engpkg: cfg.engpkg || '', tx: cfg.tx || '',
                   body: cfg.body || '', reg: cfg.reg || '' } : null;
}

/** El nombre de una familia en un bloque, como lo dice la gerencia (+ carrocería). */
function tpBlockFamilyName(x) {
    if (!x) return '';
    var c = x.cfg;
    if (c && c.mod) {
        var base = (typeof copRepShortName === 'function') ? copRepShortName(c) : tpFamilyShortLabel(c);
        return (base + (c.body ? ' ' + c.body : '')).trim();
    }
    return x.familyShort || x.desc || '';
}

/** Los motivos que la plataforma deduce sola, por día. */
function _tpBlockAuto(weekDate, layout) {
    var out = {};
    var av = (tpState.weekAvailability || {})[weekDate] || null;
    var wd = av && av.workDays && typeof av.workDays === 'object' ? av.workDays : null;
    var assets = {}, eqAsset = {};
    var inv = (typeof invState !== 'undefined' && invState) ? invState : null;
    if (inv) {
        (inv.assets || []).forEach(function(a) { if (a && a.blocksTesting) assets[a.id] = a; });
        (inv.equipment || []).forEach(function(e) { if (e && assets[e.assetId]) eqAsset[e.id] = e; });
    }
    var acts = {};
    if (inv) (inv.maintActivities || []).forEach(function(a) { if (a) acts[a.id] = a; });
    layout.forEach(function(L) {
        if (av && av.available === false) { out[L.iso] = { reason: 'celda', note: av.note || '' }; return; }
        if (wd && (wd[L.day] === false || wd[L.precon] === false)) {
            out[L.iso] = { reason: 'festivo', note: wd[L.day] === false ? 'Día no laborable' : 'No se preacondicionó (' + TP_DAY_LABELS[L.precon].toLowerCase() + ' no laborable)' };
            return;
        }
        if (!inv) return;
        var what = [];
        (inv.maintLog || []).forEach(function(e) {
            if (!e || e.date !== L.iso || !assets[e.assetId]) return;
            var act = acts[e.activityId];
            what.push(assets[e.assetId].name + (act && act.desc ? ': ' + act.desc : ''));
        });
        Object.keys(eqAsset).forEach(function(id) {
            var e = eqAsset[id];
            (e.calHistory || []).forEach(function(h) { if (h && String(h.date || '').slice(0, 10) === L.iso) what.push('Calibración: ' + e.name); });
        });
        if (what.length) out[L.iso] = { reason: 'mtto', note: what.slice(0, 3).join(' · ') + (what.length > 3 ? ' (+' + (what.length - 3) + ')' : '') };
    });
    return out;
}

/** Las pruebas realizadas por día de la semana (incluye las de formato simple). */
function _tpBlockTests(from, to) {
    var cal = tpCalendarTests(from, to, { datedOnly: true }), byDay = {};
    var add = function(t, iso) {
        var cfg = t.configCode ? tpConfigByDesc(t.configCode) : null;
        if (!cfg && t.vehicleId != null && typeof db !== 'undefined' && db && Array.isArray(db.vehicles)) {
            var v = db.vehicles.find(function(x) { return x && String(x.id) === String(t.vehicleId); });
            if (v && typeof _tpCalVehicleCfg === 'function') cfg = _tpCalVehicleCfg(v);
        }
        (byDay[iso] = byDay[iso] || []).push({ familyShort: t.familyShort || '', cfg: _tpBlockCfgOf(cfg), vin: t.vin || '',
            purpose: t.purpose || '', status: t.status || '', vehicleId: t.vehicleId != null ? t.vehicleId : null, declared: !!t.declared });
    };
    Object.keys(cal.byDay).forEach(function(iso) { cal.byDay[iso].forEach(function(t) { add(t, iso); }); });
    // Formato simple (OBD II, Training…): sin testDatetime, su fecha vive en testData.simple.datetime.
    if (typeof vehicleTestDate === 'function' && typeof db !== 'undefined' && db && Array.isArray(db.vehicles)) {
        var today = (typeof localToday === 'function') ? localToday() : '';
        var tombs = Array.isArray(db.deletedVehicles) ? db.deletedVehicles : [];
        db.vehicles.forEach(function(v) {
            if (!v || (v.testData && v.testData.testDatetime)) return;
            var iso = vehicleTestDate(v);
            if (!iso || iso < from || iso > to) return;
            if (v.status === 'testing' ? iso > today : !_tpCalVehicleTested(v, today)) return;
            if (tombs.length && typeof vehicleIsTombstoned === 'function' && vehicleIsTombstoned(v, tombs)) return;
            var cfg = _tpCalVehicleCfg(v);
            add({ familyShort: cfg ? tpFamilyShortLabel(cfg) : '', configCode: v.configCode || '', vin: v.vin || '',
                  purpose: v.purpose || '', status: v.status, vehicleId: v.id, declared: false }, iso);
        });
    }
    return byDay;
}

/**
 * La huella de lo que cambia un bloque: plan (tpState._lastSave), vehículos (su _rev) y
 * mantenimientos/calibraciones. Barata: no arma configuraciones.
 */
function _tpBlockFingerprint() {
    var h = String((tpState && tpState._lastSave) || '') + '|' + ((typeof db !== 'undefined' && db && db.vehicles) || []).map(function(v) {
        return v ? (v._rev || v.updatedAt || '') + (v.status || '') : '';
    }).join(',');
    if (typeof invState !== 'undefined' && invState) {
        h += '|' + ((invState.maintLog || []).length) + '|' + (invState.equipment || []).reduce(function(s, e) { return s + ((e && e.calHistory) || []).length; }, 0) +
             '|' + (invState.assets || []).filter(function(a) { return a && a.blocksTesting; }).length;
    }
    return h + '|' + (tpState.vehiclesPerSlot || '') + '|' + JSON.stringify(tpState.weekAvailability || {}).length;
}
var _tpBlockMemo = {};

/** Los bloques de una semana con los datos de la plataforma. Memoizada (la leen HOY y Mi semana). */
function tpBlocksForWeek(weekDate, opts) {
    opts = opts || {};
    weekDate = tpMondayIso(weekDate) || weekDate;
    var today = opts.today || ((typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0, 10));
    var key = weekDate + '|' + today + '|' + _tpBlockFingerprint();
    var memo = _tpBlockMemo[weekDate];
    if (memo && memo.key === key) return memo.r;
    var r = _tpBlocksForWeekRaw(weekDate, today);
    _tpBlockMemo[weekDate] = { key: key, r: r };
    return r;
}

function _tpBlocksForWeekRaw(weekDate, today) {
    var soak = tpSoakCfg().defaultHours, per = Math.max(1, parseInt(tpState.vehiclesPerSlot, 10) || 1);
    var layout = tpBlockLayout(soak, per).map(function(L) {
        return Object.assign({}, L, { iso: tpWeekDayIso(weekDate, L.day), preconIso: tpWeekDayIso(weekDate, L.precon) });
    });
    var to = tpIsoAddDays(weekDate, 6);
    var planned = {}, pc = (typeof tpCalendarPlanned === 'function') ? tpCalendarPlanned(weekDate, to) : {};
    Object.keys(pc).forEach(function(iso) {
        planned[iso] = pc[iso].map(function(p) {
            var cfg = tpConfigByDesc(p.desc);
            var it = null;
            if (p.planId && p.uid) (tpState.weeklyPlans || []).some(function(pl) {
                if (!pl || tpPlanId(pl) !== p.planId) return false;
                it = (pl.items || []).find(function(x) { return x && x.uid === p.uid; }) || null;
                return true;
            });
            return { desc: p.desc, familyShort: p.familyShort, cfg: _tpBlockCfgOf(cfg), proposal: !!p.proposal,
                     purpose: (it && it.purpose) || '', planId: p.planId, uid: p.uid };
        });
    });
    var notes = {}, all = tpState.blockNotes || {};
    Object.keys(all).forEach(function(k) { if (k.indexOf(weekDate + '|') === 0) notes[k] = all[k]; });
    var plan = (typeof tpWeekPlanFor === 'function') ? tpWeekPlanFor(weekDate) : null;
    var r = tpBlocksCompute({ weekDate: weekDate, today: today, layout: layout, tests: _tpBlockTests(weekDate, to),
                              planned: planned, notes: notes, auto: _tpBlockAuto(weekDate, layout) });
    r.perSlot = per; r.soakHours = soak;
    r.pairs = layout.reduce(function(s, L) { return s + L.n; }, 0) / per;
    r.planState = !plan || !plan.plan ? 'none' : plan.accepted ? 'accepted' : 'proposal';
    return r;
}

/** Los bloques sin explicar de esta semana y la anterior (para HOY). */
function tpBlocksUnexplained(opts) {
    var today = (opts && opts.today) || localToday();
    var mon = tpMondayIso(today), out = { n: 0, week: null, days: [] };
    for (var w = TP_BLOCK_ASK_WEEKS - 1; w >= 0; w--) {
        var wk = tpIsoAddDays(mon, -7 * w);
        var r = tpBlocksForWeek(wk, { today: today });
        var dias = {};
        r.blocks.forEach(function(b) { if (b.state === 'sin-explicar') { out.n++; dias[b.iso] = (dias[b.iso] || 0) + 1; } });
        var keys = Object.keys(dias).sort();
        if (keys.length && !out.week) out.week = wk;
        keys.forEach(function(iso) { out.days.push({ iso: iso, n: dias[iso] }); });
    }
    return out;
}

/**
 * Registra (o quita, con reason null) el motivo de uno o varios bloques. Lo decide un
 * signatario (test.approve), queda en la auditoría con antes/después y viaja por el sync.
 */
function tpBlockExplain(ids, reason, note) {
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.filter(function(id) { return !!tpBlockParseId(id); });
    if (!ids.length) return false;
    if (typeof authRequire === 'function' && !authRequire('test.approve', 'explicar un bloque de la semana')) return false;
    if (reason !== null && !tpBlockReason(reason)) {
        if (typeof showToast === 'function') showToast('Elige un motivo de la lista.', 'warning');
        return false;
    }
    note = String(note || '').trim().slice(0, TP_BLOCK_NOTE_MAX);
    if (typeof undoPush === 'function') undoPush('testplan', reason ? 'Explicar bloque' : 'Quitar motivo de bloque');
    if (!tpState.blockNotes || typeof tpState.blockNotes !== 'object') tpState.blockNotes = {};
    var by = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
    var at = new Date().toISOString(), before = {};
    ids.forEach(function(id) {
        var prev = tpState.blockNotes[id];
        before[id] = prev && prev.reason ? { motivo: prev.reason, nota: prev.note || '' } : null;
        tpState.blockNotes[id] = { reason: reason, note: reason ? note : '', by: by, at: at };
    });
    tpSave();
    if (typeof auditLog === 'function') {
        var R = tpBlockReason(reason);
        auditLog('testplan', reason ? 'bloque_explicado' : 'bloque_sin_motivo', { type: 'block', id: ids.join(','), label: ids.length + ' bloque(s) · ' + ids[0].split('|').slice(0, 2).join(' ') },
                 reason ? R.es + (note ? ' — ' + note : '') : 'Motivo quitado',
                 { before: before, after: reason ? { motivo: reason, nota: note } : null });
    }
    if (typeof tabCacheInvalidate === 'function') tabCacheInvalidate('tp', 'tp-myweek');
    if (typeof tpRender === 'function') tpRender();
    if (typeof dailyDashRender === 'function' && document.getElementById('platform-today') &&
        document.getElementById('platform-today').classList.contains('active')) { try { dailyDashRender(); } catch (e) {} }
    if (typeof showToast === 'function') showToast(reason ? (ids.length > 1 ? ids.length + ' bloques explicados' : 'Bloque explicado') : 'Motivo quitado', 'success');
    return true;
}

// ── Pantalla: la tarjeta de bloques en Mi semana ─────────────────────────────

var TP_BLOCK_STATE_LABEL = { prueba: 'Prueba', motivo: 'Con motivo', auto: 'Motivo automático', planeada: 'Planeada',
                             libre: 'Libre', pendiente: 'Hoy', 'sin-explicar': 'Sin explicar' };

function _tpBlockDayLabel(iso) {
    var wd = tpIsoWeekday(iso), m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso || '');
    var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return TP_DAY_LABELS[TP_DAY_ORDER[wd]] + ' ' + (m ? Number(m[2]) + ' ' + MES[Number(m[1]) - 1] : '');
}

function _tpBlockTileHTML(b, can) {
    var R = tpBlockReason(b.reason), main = '', sub = '';
    if (b.state === 'prueba') {
        main = '✅ ' + escapeHtml(tpBlockFamilyName(b.test) || 'Prueba');
        sub = (b.test.vin ? 'VIN …' + escapeHtml(_tpCalVinTail(b.test.vin)) : (b.test.declared ? 'declarada a mano' : '')) +
              (b.noteOverridden ? ' · tenía un motivo, la prueba manda' : '');
    } else if (b.state === 'motivo' || b.state === 'auto') {
        main = R.icon + ' ' + escapeHtml(R.es);
        sub = (b.note ? escapeHtml(b.note) : '') + (b.state === 'auto' ? (b.note ? ' · ' : '') + 'automático' : (b.by ? (b.note ? ' · ' : '') + escapeHtml(b.by) : ''));
    } else if (b.state === 'planeada') {
        main = '📋 ' + escapeHtml(tpBlockFamilyName(b.planned));
        sub = b.planned.proposal ? 'propuesta' : 'planeada';
    } else if (b.state === 'sin-explicar') {
        main = '⚠️ Sin explicar';
        sub = b.planned ? 'estaba planeada: ' + escapeHtml(tpBlockFamilyName(b.planned)) : 'no hubo prueba';
    } else if (b.state === 'pendiente') { main = 'Hoy · sin prueba todavía'; }
    else { main = 'Libre'; }
    var cls = 'tp-blk tp-blk--' + b.state;
    var label = 'Bloque ' + b.n + ' del ' + _tpBlockDayLabel(b.iso).toLowerCase() + ': ' + (TP_BLOCK_STATE_LABEL[b.state] || '');
    var inner = '<span class="tp-blk-n">' + b.n + '</span><span class="tp-blk-main">' + main + '</span>' + (sub ? '<span class="tp-blk-sub">' + sub + '</span>' : '');
    if (b.state === 'prueba') return '<div class="' + cls + '" title="' + escapeHtml(label) + '">' + inner + '</div>';
    return '<button type="button" class="' + cls + '" aria-label="' + escapeHtml(label + (can ? '. Tocar para poner el motivo' : '')) + '"' +
           ' title="' + (can ? 'Poner o cambiar el motivo' : 'El motivo lo registra un signatario') + '"' +
           ' onclick="tpBlockExplainOpen(\'' + b.id + '\')">' + inner + '</button>';
}

/** La tarjeta "Bloques de la semana" (Mi semana). */
function tpBlocksCardHTML(weekDate) {
    var r;
    try { r = tpBlocksForWeek(weekDate); } catch (e) { console.warn('tpBlocksForWeek:', e); return ''; }
    if (!r.blocks.length) return '';
    var T = r.total, can = (typeof authCan === 'function') ? authCan('test.approve') : true;
    var chips = TP_BLOCK_REASONS.filter(function(x) { return T.byReason[x.id]; })
        .map(function(x) { return '<span class="tp-blk-chip">' + x.icon + ' ' + escapeHtml(x.es) + ' <b>' + T.byReason[x.id] + '</b></span>'; });
    if (T.extra) chips.push('<span class="tp-blk-chip">➕ Pruebas de más <b>' + T.extra + '</b></span>');
    var h = '<div class="tp-blk-sum">' +
        '<div class="tp-blk-use"><b>' + T.tests + ' de ' + T.blocks + '</b> bloques con prueba <span class="u-muted">(' + Math.round(T.use * 100) + ' %)</span>' +
        (T.unexplained ? ' · <b class="tp-blk-bad">' + T.unexplained + ' sin explicar</b>' : '') +
        (T.pending ? ' · ' + T.pending + ' de hoy' : '') + (T.planned ? ' · ' + T.planned + ' planeados' : '') + '</div>' +
        (chips.length ? '<div class="tp-blk-chips">' + chips.join('') + '</div>' : '') +
        '<div class="tp-blk-cap u-muted">Capacidad instalada: ' + r.pairs + ' pares de días × ' + r.perSlot + ' vehículo' + (r.perSlot === 1 ? '' : 's') +
        ' = ' + T.blocks + ' bloques de prueba. Cada bloque vacío lleva un motivo, que registra un signatario.' +
        (r.perSlot === 1 ? ' <button type="button" class="tp-btn tp-btn-ghost" onclick="tpBlockSetPerSlot(2)">Usar 2 vehículos por par</button>' : '') + '</div></div>';
    h += '<div class="tp-blk-days">';
    r.days.forEach(function(d) {
        h += '<div class="tp-blk-day"><div class="tp-blk-dayh"><b>' + escapeHtml(_tpBlockDayLabel(d.iso)) + '</b>' +
             '<span class="u-muted">preacond. ' + escapeHtml(TP_DAY_LABELS[d.precon].toLowerCase()) + '</span></div>' +
             d.blocks.map(function(b) { return _tpBlockTileHTML(b, can); }).join('') + '</div>';
    });
    h += '</div>';
    if (r.extra.length) h += '<p class="tp-blk-note u-muted">➕ ' + r.extra.length + ' prueba(s) por encima de la capacidad instalada: ' +
        r.extra.map(function(x) { return escapeHtml(_tpBlockDayLabel(x.iso).toLowerCase() + ' — ' + tpBlockFamilyName(x.test)); }).join('; ') + '.</p>';
    if (r.plannedOver.length) h += '<p class="tp-blk-note u-muted">📋 ' + r.plannedOver.length + ' fila(s) del plan no caben en los bloques de su día.</p>';
    var tone = T.unexplained ? 'danger' : (T.tests === T.blocks ? 'success' : 'neutral');
    return uiCard({ id: 'tp-blocks', icon: '🧱', title: 'Bloques de la semana', help: 'tp_blocks', defaultOpen: true,
                    count: { label: T.tests + '/' + T.blocks + (T.unexplained ? ' · ' + T.unexplained + ' sin explicar' : ''), tone: tone },
                    actions: '<button type="button" class="tp-btn tp-btn-ghost" onclick="tpWeekXlsxExport(\'' + r.weekDate + '\')">📤 Excel de la semana</button>',
                    body: h });
}

/** Cambia los vehículos por par desde la tarjeta (permiso del plan). */
function tpBlockSetPerSlot(n) {
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'cambiar los vehículos por par')) return false;
    tpSetVehiclesPerSlot(n);
    if (typeof tabCacheInvalidate === 'function') tabCacheInvalidate('tp');
    tpRender();
    return true;
}

/** El diálogo para poner el motivo de un bloque (y, si se quiere, de los vacíos de su día). */
function tpBlockExplainOpen(id) {
    var p = tpBlockParseId(id);
    if (!p) return;
    if (typeof authRequire === 'function' && !authRequire('test.approve', 'explicar un bloque de la semana')) return;
    var r = tpBlocksForWeek(p.weekDate);
    var b = r.blocks.find(function(x) { return x.id === id; });
    if (!b) { if (typeof showToast === 'function') showToast('Ese bloque ya no existe (cambió la capacidad).', 'warning'); return; }
    if (b.state === 'prueba') return;
    var hermanos = r.blocks.filter(function(x) { return x.iso === b.iso && x.id !== id && x.state !== 'prueba' && x.state !== 'motivo'; });
    var actual = b.state === 'motivo' ? b.reason : '';
    var sugerido = b.state === 'auto' ? b.reason : '';
    var opts = '<option value="">— Elige —</option>' + TP_BLOCK_REASONS.map(function(x) {
        return '<option value="' + x.id + '"' + ((actual || sugerido) === x.id ? ' selected' : '') + '>' + x.icon + ' ' + escapeHtml(x.es) + '</option>';
    }).join('');
    var body = '<div class="tp-blk-modal">' +
        '<p><b>' + escapeHtml(_tpBlockDayLabel(b.iso)) + ' · bloque ' + b.n + '</b>' +
        (b.planned ? '<br><span class="u-muted">Estaba planeada: ' + escapeHtml(tpBlockFamilyName(b.planned)) + '</span>' : '') +
        (b.state === 'auto' ? '<br><span class="u-muted">La plataforma propone: ' + escapeHtml(tpBlockReason(b.reason).es) + (b.note ? ' — ' + escapeHtml(b.note) : '') + '</span>' : '') + '</p>' +
        '<label class="tp-blk-lbl" for="tp-blk-reason">¿Por qué no hubo prueba?</label>' +
        '<select id="tp-blk-reason" data-chips>' + opts + '</select>' +
        '<label class="tp-blk-lbl" for="tp-blk-note">Nota (opcional)</label>' +
        '<textarea id="tp-blk-note" rows="2" maxlength="' + TP_BLOCK_NOTE_MAX + '" placeholder="Ej.: verificación de bolsas; esperando la unidad de la línea">' +
        escapeHtml(b.state === 'motivo' ? b.note : '') + '</textarea>' +
        (hermanos.length ? '<label class="tp-blk-same u-hit"><input type="checkbox" id="tp-blk-same" checked> Aplicar también ' +
            (hermanos.length === 1 ? 'al otro bloque vacío' : 'a los otros ' + hermanos.length + ' bloques vacíos') + ' de este día</label>' : '') +
        '</div>';
    var close = function() { var m = document.getElementById('globalModal'); if (m) m.remove(); };
    var buttons = [{ label: 'Cancelar', cls: '' }];
    if (b.state === 'motivo') buttons.push({ label: 'Quitar motivo', cls: '', onclick: function() { if (tpBlockExplain([id], null, '')) close(); } });
    buttons.push({ label: 'Guardar', cls: 'btn-primary', onclick: function() {
        var sel = document.getElementById('tp-blk-reason');
        if (!sel || !sel.value) { if (typeof uiInvalid === 'function') uiInvalid(sel, 'Elige el motivo.'); return; }
        var same = document.getElementById('tp-blk-same');
        var ids = [id].concat(same && same.checked ? hermanos.map(function(x) { return x.id; }) : []);
        if (tpBlockExplain(ids, sel.value, (document.getElementById('tp-blk-note') || {}).value)) close();
    } });
    showModal({ title: '🧱 Motivo del bloque', type: 'info', body: body, buttons: buttons });
}

// ── El Excel de la semana (PURO) ─────────────────────────────────────────────

var _TP_BLK_FILL = { prueba: 'D1FAE5', motivo: 'FEF3C7', auto: 'FEF3C7', planeada: 'DBEAFE', libre: 'F3F4F6', pendiente: 'F3F4F6', 'sin-explicar': 'FEE2E2' };
var _TP_BLK_STATUS_EN = { prueba: 'Test', motivo: 'Reason', auto: 'Reason (automatic)', planeada: 'Planned', libre: 'Free',
                          pendiente: 'Pending (today)', 'sin-explicar': 'NOT EXPLAINED' };
var _TP_BLK_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var _TP_BLK_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function _tpBlkDayEn(iso) {
    var m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? _TP_BLK_DOW[tpIsoWeekday(iso)] + ' ' + Number(m[2]) + ' ' + _TP_BLK_MON[Number(m[1]) - 1] : '';
}

/** El texto de un bloque en el Excel (inglés, como el libro de auditoría). PURA. */
function tpBlockCellText(b) {
    var R = tpBlockReason(b.reason);
    if (b.state === 'prueba') return tpBlockFamilyName(b.test) + (b.test.vin ? ' · ' + _tpCalVinTail(b.test.vin) : '');
    if (b.state === 'motivo' || b.state === 'auto') return R.en + (b.note ? ' — ' + b.note : '');
    if (b.state === 'planeada') return tpBlockFamilyName(b.planned) + (b.planned.proposal ? ' (proposal)' : '');
    if (b.state === 'sin-explicar') return 'NOT EXPLAINED' + (b.planned ? ' (planned: ' + tpBlockFamilyName(b.planned) + ')' : '');
    if (b.state === 'pendiente') return 'Today';
    return '';
}

/** Un renglón de bitácora de bloques (lo comparten el Excel de la semana y el libro). PURA. */
function tpBlockLogRow(b) {
    var R = tpBlockReason(b.reason);
    var fam = b.test ? tpBlockFamilyName(b.test) : b.planned ? tpBlockFamilyName(b.planned) : '';
    var purpose = (b.test && b.test.purpose) || (b.planned && b.planned.purpose) || '';
    return { week: tpMondayIso(b.iso), date: b.iso, day: _TP_BLK_DOW[tpIsoWeekday(b.iso)], block: b.n,
             precon: b.preconIso || '', status: _TP_BLK_STATUS_EN[b.state] || b.state, family: fam,
             vin: b.test ? _tpCalVinTail(b.test.vin) : '',
             purpose: (typeof _TP_AUDIT_PURPOSE !== 'undefined' && _TP_AUDIT_PURPOSE[purpose]) || purpose,
             reason: (b.state === 'motivo' || b.state === 'auto') && R ? R.en : '', note: b.note || '',
             by: b.state === 'auto' ? 'platform' : (b.by || ''), state: b.state };
}

/**
 * LA definición del Excel de la semana. PURA: modelo (tpBlocksForWeek + generated/appVersion)
 * → spec de xwBuild. Hoja "Week": la cuadrícula del laboratorio (por día, los
 * preacondicionamientos y las pruebas de cada bloque) y el resumen (fórmulas sobre la
 * bitácora, cada una con su valor). Hoja "Block log": un renglón por bloque.
 */
function tpWeekXlsxSpec(m) {
    var X = _TP_AX;
    var S = { name: 'Week', tabColor: '1F3A5F', showGrid: false, cells: [], merges: [], cf: [], print: { landscape: true, fitWidth: 1 }, zoom: 90, rows: {} };
    var days = m.days || [];
    // Columnas = lunes a viernes (los días de preacondicionamiento y de prueba).
    var colDays = ['lun', 'mar', 'mie', 'jue', 'vie'];
    days.forEach(function(d) { if (colDays.indexOf(d.day) < 0) colDays.push(d.day); if (colDays.indexOf(d.precon) < 0) colDays.push(d.precon); });
    colDays.sort(function(a, b) { return ((TP_DAY_ORDER.indexOf(a) + 6) % 7) - ((TP_DAY_ORDER.indexOf(b) + 6) % 7); });
    var isoOf = function(day) { return tpWeekDayIso(m.weekDate, day); };
    var stateTxt = { accepted: 'Plan accepted', proposal: 'Plan not accepted yet (proposal)', none: 'No plan for this week' };
    S.cells.push({ r: 1, c: 1, v: 'Test schedule — week of ' + _tpBlkDayEn(m.weekDate) + ' ' + String(m.weekDate).slice(0, 4), s: X.title });
    S.cells.push({ r: 2, c: 1, v: (stateTxt[m.planState] || '') + ' · Installed capacity: ' + m.pairs + ' day pairs × ' + m.perSlot + ' vehicle(s) = ' +
        m.total.blocks + ' test blocks. Generated ' + (m.generated || '') + ' by KIA EmLab ' + (m.appVersion || '') + '.', s: X.sub });
    // Cuadrícula.
    var maxN = days.reduce(function(s, d) { return Math.max(s, d.blocks.length); }, 0);
    var r = 4;
    S.cells.push({ r: r, c: 1, v: '', s: X.hdrL });
    colDays.forEach(function(d, i) { S.cells.push({ r: r, c: 2 + i, v: _tpBlkDayEn(isoOf(d)), s: X.hdr }); });
    var cellFor = function(b) {
        return { v: tpBlockCellText(b), s: { border: 'thin', fill: _TP_BLK_FILL[b.state] || 'FFFFFF', font: { sz: 10, b: b.state === 'sin-explicar' }, align: { v: 'center', wrap: true } } };
    };
    for (var k = 0; k < maxN; k++) {
        S.cells.push({ r: r + 1 + k, c: 1, v: 'Preconditioning ' + (k + 1), s: X.hdrL });
        S.cells.push({ r: r + 1 + maxN + k, c: 1, v: 'Test ' + (k + 1), s: X.hdrL });
        colDays.forEach(function(cd, i) {
            // Preacondicionamiento: el bloque k del día que se prueba después de éste.
            var dp = days.find(function(d) { return d.precon === cd; });
            var bp = dp && dp.blocks[k];
            var cp = bp ? cellFor(bp) : { v: '', s: { border: 'thin', fill: 'FFFFFF' } };
            if (bp && bp.state === 'prueba') cp.v = tpBlockFamilyName(bp.test) + ' (→ ' + _TP_BLK_DOW[tpIsoWeekday(bp.iso)] + ')';
            else if (bp && bp.state === 'planeada') cp.v = tpBlockFamilyName(bp.planned) + ' (→ ' + _TP_BLK_DOW[tpIsoWeekday(bp.iso)] + ')';
            S.cells.push({ r: r + 1 + k, c: 2 + i, v: cp.v, s: cp.s });
            var dt = days.find(function(d) { return d.day === cd; });
            var bt = dt && dt.blocks[k];
            var ct = bt ? cellFor(bt) : { v: '', s: { border: 'thin', fill: 'FFFFFF' } };
            S.cells.push({ r: r + 1 + maxN + k, c: 2 + i, v: ct.v, s: ct.s });
        });
    }
    for (var rr = r + 1; rr <= r + 2 * maxN; rr++) S.rows[rr] = { height: 44 };

    // Bitácora (abajo) y resumen (en medio, con fórmulas sobre la bitácora).
    var rows = m.blocks.map(tpBlockLogRow);
    (m.extra || []).forEach(function(x) {
        rows.push({ week: m.weekDate, date: x.iso, day: _TP_BLK_DOW[tpIsoWeekday(x.iso)], block: 'extra', precon: '', status: 'Extra test',
                    family: tpBlockFamilyName(x.test), vin: _tpCalVinTail(x.test.vin), purpose: '', reason: '', note: 'over the installed capacity', by: '', state: 'extra' });
    });
    var rs = r + 2 * maxN + 3;
    var reasons = TP_BLOCK_REASONS;
    // La bitácora va en su propia hoja: comparte columnas con la cuadrícula si no, y se estorban.
    var LOG = 'Block log', L0 = 5, L1 = Math.max(L0, L0 + rows.length - 1);
    var col = function(c) { return "'" + LOG + "'!" + xwRange(L0, c, L1, c, true); };
    var cnt = function(pred) { return rows.filter(pred).length; };
    S.cells.push({ r: rs, c: 1, v: 'Summary', s: X.h2 });
    var line = function(i, label, f, v, style) {
        S.cells.push({ r: rs + 1 + i, c: 1, v: label, s: X.fam });
        S.cells.push({ r: rs + 1 + i, c: 2, f: f, v: v, s: style || X.calc });
    };
    var i0 = 0;
    line(i0++, 'Test blocks', 'COUNTIFS(' + col(5) + ',"<>Extra test",' + col(1) + ',"<>")', cnt(function(x) { return x.state !== 'extra'; }));
    line(i0++, 'With a test', 'COUNTIF(' + col(5) + ',"Test")', cnt(function(x) { return x.state === 'prueba'; }));
    reasons.forEach(function(R) { line(i0++, R.en, 'COUNTIF(' + col(9) + ',"' + R.en + '")', cnt(function(x) { return x.reason === R.en; })); });
    line(i0++, 'NOT EXPLAINED', 'COUNTIF(' + col(5) + ',"NOT EXPLAINED")', cnt(function(x) { return x.state === 'sin-explicar'; }));
    line(i0++, 'Planned / free / today', 'COUNTIF(' + col(5) + ',"Planned")+COUNTIF(' + col(5) + ',"Free")+COUNTIF(' + col(5) + ',"Pending (today)")',
         cnt(function(x) { return x.state === 'planeada' || x.state === 'libre' || x.state === 'pendiente'; }));
    line(i0++, 'Extra tests (over capacity)', 'COUNTIF(' + col(5) + ',"Extra test")', cnt(function(x) { return x.state === 'extra'; }));
    var blocksRef = xwRef(rs + 1, 2), testsRef = xwRef(rs + 2, 2);
    line(i0++, 'Cell use', 'IF(N(' + blocksRef + ')=0,"",' + testsRef + '/' + blocksRef + ')', m.total.blocks ? m.total.tests / m.total.blocks : '', X.pct);
    S.cols = [{ min: 1, max: 1, width: 26 }, { min: 2, max: 1 + colDays.length, width: 32 }];

    var B = { name: LOG, tabColor: 'B45309', showGrid: false, cells: [], freeze: { row: L0, col: 1 }, print: { landscape: true, fitWidth: 1 },
              cols: [{ min: 1, max: 2, width: 12 }, { min: 3, max: 4, width: 7 }, { min: 5, max: 5, width: 18 }, { min: 6, max: 6, width: 34 },
                     { min: 7, max: 8, width: 13 }, { min: 9, max: 9, width: 26 }, { min: 10, max: 10, width: 44 }, { min: 11, max: 12, width: 16 }] };
    B.cells.push({ r: 1, c: 1, v: 'Block log — week of ' + _tpBlkDayEn(m.weekDate) + ' ' + String(m.weekDate).slice(0, 4), s: X.title });
    B.cells.push({ r: 2, c: 1, v: 'One row per test block. A block without a test carries a reason (recorded by a signatory, or set by the platform).', s: X.sub });
    var hdr = ['Week', 'Date', 'Day', 'Block', 'Status', 'Family', 'VIN', 'Purpose', 'Reason', 'Note', 'Recorded by', 'Preconditioning'];
    hdr.forEach(function(t, i) { B.cells.push({ r: L0 - 1, c: 1 + i, v: t, s: i === 5 || i === 9 ? X.hdrL : X.hdr }); });
    rows.forEach(function(x, i) {
        var rr2 = L0 + i, st = { border: 'thin', fill: _TP_BLK_FILL[x.state] || 'FFFFFF', align: { v: 'center' } };
        B.cells.push({ r: rr2, c: 1, v: { date: x.week }, s: X.date }, { r: rr2, c: 2, v: { date: x.date }, s: X.date },
                     { r: rr2, c: 3, v: x.day, s: X.txt }, { r: rr2, c: 4, v: x.block, s: X.txt },
                     { r: rr2, c: 5, v: x.status, s: st }, { r: rr2, c: 6, v: x.family, s: X.fam }, { r: rr2, c: 7, v: x.vin, s: X.txt },
                     { r: rr2, c: 8, v: x.purpose, s: X.txt }, { r: rr2, c: 9, v: x.reason, s: X.fam }, { r: rr2, c: 10, v: x.note, s: X.fam },
                     { r: rr2, c: 11, v: x.by, s: X.txt }, { r: rr2, c: 12, v: x.precon ? { date: x.precon } : '', s: X.date });
    });
    B.autoFilter = 'A' + (L0 - 1) + ':' + xwRef(L1, hdr.length);
    return { title: 'Test Week', creator: 'KIA EmLab', appVersion: m.appVersion || '', sheets: [S, B] };
}

/** Descarga el Excel de una semana (Mi semana → 📤). */
function tpWeekXlsxExport(weekDate) {
    var m = tpBlocksForWeek(weekDate);
    m.generated = (typeof localToday === 'function') ? localToday() : '';
    m.appVersion = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '';
    var name = 'Test_Week_' + m.weekDate + '.xlsx';
    return xwBuildCompressed(tpWeekXlsxSpec(m)).then(function(bytes) {
        _tpAuditDownload(bytes, name);
        if (typeof auditLog === 'function') auditLog('tp', 'semana_xlsx_exportada', name,
            { week: m.weekDate, blocks: m.total.blocks, tests: m.total.tests, unexplained: m.total.unexplained });
        showToast('Descargado: ' + name + (m.total.unexplained ? ' · ' + m.total.unexplained + ' bloque(s) sin explicar' : ''), 'success');
        return true;
    }).catch(function(e) {
        showToast('No se pudo armar el Excel: ' + (e && e.message ? e.message : e) + '. Usa 🐞 para reportarlo.', 'error');
        return false;
    });
}

if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    tp_blocks: { title: 'Bloques de la semana',
        text: 'La capacidad instalada de la celda, bloque por bloque: cada par de días (preacondicionar → probar) por los vehículos que caben en él. ' +
              'Un bloque se llena con la prueba que se corrió ese día. Si quedó vacío, un signatario pone el motivo (quality check, mantenimiento, ' +
              'proyecto, sin vehículo…). Los días no laborables, las semanas sin celda y los mantenimientos de equipos que detienen pruebas se ponen solos. ' +
              'El Excel de la semana y el estatus del viernes salen de aquí.' }
});
