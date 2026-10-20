// ╔══════════════════════════════════════════════════════════════════════╗
// ║  conslist.js — Lista de Consumibles: histórico semanal + Excel (3.16.0)║
// ╚══════════════════════════════════════════════════════════════════════╝
// El laboratorio lleva la "Lista de stock de consumibles" en Excel: un renglón por
// consumible y, por cada semana del año, el inventario (PSI de todos sus cilindros
// sumados: "=2000+1100" es el de repuesto + el que está en uso). De ahí salen el consumo
// por semana, el promedio, el límite inferior y el "Comprar".
//
// Aquí se hacen tres cosas:
//   1. Importar ese Excel como HISTÓRICO (invState.consHistory): lo que el laboratorio
//      reportó cada semana antes de capturar en la plataforma. No se convierte en lecturas
//      de cilindro: es un total por consumible, y meterlo como lectura envenenaría el nivel
//      y el ritmo de cada cilindro.
//   2. invConsListModel (PURA): el año completo, semana por semana. Gana lo importado; lo
//      que no está importado sale de las lecturas de la plataforma (la última de cada
//      cilindro hasta el cierre de esa semana, sumada por consumible).
//   3. invConsListXlsxSpec (PURA): el mismo formato, con xlsxw.js — un clic, sin capturar.
//
// La semana de un mes es "Semana k" como en el Excel del laboratorio. Lo importado conserva
// su numeración tal cual (no es regular: julio trae 5 semanas, junio 4); un mes sin nada
// importado usa las semanas que empiezan en ese mes (los lunes del mes).

var INV_CONS_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                       'septiembre', 'octubre', 'noviembre', 'diciembre'];
var INV_CONS_MONTH_LABELS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
                             'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
var INV_CONS_STALE_DAYS = 30;   // un cilindro sin lecturas en 30 días ya no cuenta para esa semana

function _icFold(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Llave de un consumible por su nombre en la lista (sin acentos, espacios ni mayúsculas). PURA. */
function invConsRowKey(label) { return _icFold(label).replace(/[^a-z0-9.%]+/g, ''); }

function _icNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/,/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
}
function _icPad(n) { return (n < 10 ? '0' : '') + n; }
/** Id de una semana: 'AAAA-MM-Sk' (ordena cronológicamente como texto). PURA. */
function invConsWeekId(y, m, k) { return y + '-' + _icPad(m) + '-S' + k; }
function _icDaysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
/** Lunes (día del mes) de cada semana que EMPIEZA en ese mes. PURA. */
function _icMondaysIn(y, m) {
    var out = [], n = _icDaysIn(y, m);
    for (var d = 1; d <= n; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1) out.push(d);
    return out;
}
/** Último día ('AAAA-MM-DD') que cubre la semana k de K del mes. PURA. */
function invConsWeekEnd(y, m, k, K) {
    var n = _icDaysIn(y, m);
    var d = k >= K ? n : Math.max(1, Math.round(n * k / K));
    return y + '-' + _icPad(m) + '-' + _icPad(d);
}

// ── 1. Leer el Excel del laboratorio ─────────────────────────────────────

/**
 * La Lista de Consumibles (retícula 0-based de renglones) → {rows, weeks, notes} o {error}.
 * PURA. Se lee por ETIQUETA (encabezados "Consumible", "Semana k", "Actual Inventory"…),
 * nunca por posición: el archivo crece cada mes.
 */
function invConsListParse(grid) {
    grid = grid || [];
    var H = -1;
    for (var i = 0; i < Math.min(grid.length, 20) && H < 0; i++) {
        if ((grid[i] || []).some(function(c) { return _icFold(c) === 'consumible'; })) H = i;
    }
    if (H < 0) return { error: 'No encontré el encabezado "Consumible". ¿Es la Lista de stock de consumibles del laboratorio?' };
    var hr = grid[H] || [], mr = grid[H + 1] || [], wr = grid[H + 2] || [];
    var colOf = function(row, test) {
        for (var c = 0; c < row.length; c++) if (test(_icFold(row[c]))) return c;
        return -1;
    };
    var cTipo = colOf(hr, function(s) { return /^tipo de/.test(s); });
    var cName = colOf(hr, function(s) { return s === 'consumible'; });
    var cItem = colOf(hr, function(s) { return /no\.? de item/.test(s); });
    var cCode = colOf(hr, function(s) { return s === 'codigo'; });
    var cIni = colOf(wr, function(s) { return /stock inicial/.test(s); });
    var cAct = colOf(wr, function(s) { return /stock actual/.test(s); });
    var cLead = colOf(hr, function(s) { return /tiempo de reposicion/.test(s); });
    var cLim = colOf(hr, function(s) { return /^limite inferior( \(psi\))?$/.test(s); });
    var cCons = colOf(hr, function(s) { return /consumo/.test(s) && /\d{4}/.test(s); });
    if (cName < 0) return { error: 'No encontré la columna "Consumible".' };

    // Las columnas de inventario: "Semana k" bajo un mes, antes del bloque de consumo.
    var cols = [], year = null, month = null, notes = [];
    for (var c = 0; c < Math.max(hr.length, wr.length); c++) {
        if (cCons >= 0 && c >= cCons) break;
        var y = /(20\d\d)/.exec(String(hr[c] == null ? '' : hr[c]));
        if (y) year = +y[1];
        var mf = _icFold(mr[c]);
        var mi = INV_CONS_MONTHS.indexOf(mf);
        if (mi >= 0) month = mi + 1;
        var w = /semana\s*(\d+)/.exec(_icFold(wr[c]));
        if (!w || !year || !month) continue;
        cols.push({ col: c, y: year, m: month, k: +w[1], headerYear: year });
    }
    // Un diciembre justo antes de un enero es del año anterior a ese enero, diga lo que diga
    // su encabezado (el del laboratorio dice "2024" antes de enero 2026).
    for (var j = 0; j < cols.length; j++) {
        if (cols[j].m !== 12) continue;
        var next = cols.slice(j + 1).filter(function(x) { return x.m !== 12; })[0];
        if (next && next.m === 1 && cols[j].y !== next.y - 1) {
            if (!notes.some(function(n) { return n.indexOf('diciembre') >= 0; })) {
                notes.push('El encabezado del bloque de diciembre dice ' + cols[j].y + '; se tomó como diciembre ' + (next.y - 1) + ' (es el mes anterior a enero ' + next.y + ').');
            }
            cols[j].y = next.y - 1;
        }
    }
    var seen = {};
    cols = cols.filter(function(x) {
        x.id = invConsWeekId(x.y, x.m, x.k);
        if (seen[x.id]) return false;
        seen[x.id] = true; return true;
    });
    if (!cols.length) return { error: 'No encontré columnas "Semana" bajo los meses.' };

    var rows = [], cat = '';
    for (var r = H + 3; r < grid.length; r++) {
        var line = grid[r] || [];
        var name = String(line[cName] == null ? '' : line[cName]).replace(/\s+/g, ' ').trim();
        if (cTipo >= 0 && String(line[cTipo] || '').trim()) cat = String(line[cTipo]).replace(/\s+/g, ' ').trim();
        if (!name) break;                              // la tabla termina en el primer renglón vacío
        var weeks = {}, n = 0;
        cols.forEach(function(x) {
            var v = _icNum(line[x.col]);
            if (v !== null) { weeks[x.id] = v; n++; }
        });
        var limTxt = cLim >= 0 && line[cLim] != null && _icNum(line[cLim]) === null && !/^#/.test(String(line[cLim])) ? String(line[cLim]).trim() : '';
        var item = cItem >= 0 ? String(line[cItem] == null ? '' : line[cItem]).trim() : '';
        rows.push({
            id: invConsRowKey(name), label: name, category: cat,
            item: /^#/.test(item) ? '' : item,
            code: cCode >= 0 ? String(line[cCode] == null ? '' : line[cCode]).trim() : '',
            stockIni: cIni >= 0 ? _icNum(line[cIni]) : null, stockAct: cAct >= 0 ? _icNum(line[cAct]) : null,
            leadDays: cLead >= 0 ? _icNum(line[cLead]) : null, limitText: limTxt,
            order: rows.length, weeks: weeks, nWeeks: n,
            // Las semanas que el archivo DECLARA (aunque estén vacías): octubre trae 4 columnas
            // aunque solo 2 tengan valor, y así se respeta su acomodo.
            layout: cols.map(function(x) { return x.id; })
        });
    }
    return { rows: rows, weeks: cols, notes: notes };
}

/** Une el histórico de dos equipos: por renglón, gana el de `updatedAt` más reciente. PURA y simétrica. */
function invConsHistoryUnion(a, b) { return invFuelTypesUnion(a || [], b || []); }
/** ¿`incoming` trae un renglón nuevo o más reciente? PURA. */
function invConsHistoryNewTo(base, incoming) { return invFuelTypesNewTo(base || [], incoming || []); }

/**
 * Guarda lo importado como histórico. Por renglón (consumible): sus semanas se UNEN con las
 * que ya había (lo del archivo gana en la misma semana). Pide `inventory.manage` y se audita.
 */
function invConsHistoryApply(parsed, meta) {
    if (typeof authRequire === 'function' && !authRequire('inventory.manage', 'importar el histórico de consumibles')) return null;
    if (!parsed || !parsed.rows) return null;
    meta = meta || {};
    var now = new Date().toISOString();
    var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('Laboratorio') : '';
    var cur = (invState.consHistory || []).slice();
    var byId = {};
    cur.forEach(function(r, i) { if (r && r.id) byId[r.id] = i; });
    var nuevos = 0, actualizados = 0, semanas = 0;
    parsed.rows.forEach(function(r) {
        var prev = byId[r.id] !== undefined ? cur[byId[r.id]] : null;
        var weeks = Object.assign({}, prev && prev.weeks || {}, r.weeks);
        semanas += Object.keys(r.weeks).length;
        var rec = Object.assign({}, prev || {}, {
            id: r.id, label: r.label, category: r.category, item: r.item, code: r.code,
            stockIni: r.stockIni, stockAct: r.stockAct, leadDays: r.leadDays, limitText: r.limitText,
            order: r.order, weeks: weeks, layout: r.layout || [], file: meta.fileName || '', by: who, updatedAt: now
        });
        if (prev) { cur[byId[r.id]] = rec; actualizados++; } else { cur.push(rec); byId[r.id] = cur.length - 1; nuevos++; }
    });
    var before = (invState.consHistory || []).length;
    invState.consHistory = cur;
    if (typeof invSave === 'function') invSave();
    if (typeof auditLog === 'function') {
        auditLog('inv', 'historico_consumibles', { type: 'inventory', label: meta.fileName || 'Lista de consumibles' },
            parsed.rows.length + ' consumibles, ' + semanas + ' valores semanales (' + nuevos + ' nuevos, ' + actualizados + ' actualizados)',
            { before: { renglones: before }, after: { renglones: cur.length, semanas: parsed.weeks.length } });
    }
    return { nuevos: nuevos, actualizados: actualizados, semanas: semanas };
}

// ── 2. El modelo del año ─────────────────────────────────────────────────

/** Cilindros (incluidos los vacíos) del consumible de un renglón. */
function _icCylsFor(label, gases) {
    var all = (gases || []).filter(Boolean);
    if (typeof invMatchGasByLabel !== 'function' || typeof invGasConsumableKey !== 'function') return [];
    var m = invMatchGasByLabel(label, all);
    if (!m.gas) {
        // invMatchGasByLabel solo mira los no vacíos: un consumible cuyos cilindros ya se
        // vaciaron también tiene historia.
        var clones = all.map(function(g) { return Object.assign({}, g, { status: g.status === 'Empty' ? 'Stock' : g.status, _orig: g }); });
        m = invMatchGasByLabel(label, clones);
        if (m.gas && m.gas._orig) m.gas = m.gas._orig;
    }
    if (!m.gas) return [];
    var k = invGasConsumableKey(m.gas);
    return all.filter(function(g) { return invGasConsumableKey(g) === k; });
}

/**
 * Inventario de un consumible al cierre de una semana, de las lecturas de la plataforma. PURA.
 * Suma la última lectura humana (hasta `end`, la de la tarde si hay dos) de cada cilindro
 * que todavía estaba en servicio (leído en los `INV_CONS_STALE_DAYS` días anteriores).
 * null = ningún cilindro tiene lectura para esa semana.
 */
function invConsAppValue(cyls, end) {
    var endMs = Date.parse(end + 'T23:59:59Z'), total = 0, n = 0;
    (cyls || []).forEach(function(g) {
        var last = null;
        (g.readings || []).forEach(function(r) {
            if (!r || r.auto || !r.date || typeof r.psi !== 'number' || r.date > end) return;
            if (!last || invReadingCmp(r, last) > 0) last = r;
        });
        if (!last) return;
        if ((endMs - Date.parse(last.date + 'T00:00:00Z')) / 86400000 > INV_CONS_STALE_DAYS) return;
        total += last.psi; n++;
    });
    return n ? total : null;
}

/**
 * LA definición de la Lista de Consumibles de un año. PURA.
 * src = {year, today:'AAAA-MM-DD', history:[renglón], gases:[cilindro], reportLabel(g)}
 * → {year, months:[{y,m,label,weeks:[{id,k,end,future}]}], rows:[{…, cells:{id:{v,src}}, actual, …}], notes}
 * El primer mes es el diciembre anterior (así lo lleva el laboratorio).
 */
function invConsListModel(src) {
    var year = src.year, today = src.today;
    var hist = (src.history || []).filter(function(r) { return r && r.id && !r.deleted; })
        .slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    var histK = {};       // 'AAAA-MM' → semanas que trae lo importado
    hist.forEach(function(r) {
        Object.keys(r.weeks || {}).concat(r.layout || []).forEach(function(id) {
            var mm = /^(\d{4})-(\d{2})-S(\d+)$/.exec(id);
            if (!mm) return;
            var key = mm[1] + '-' + mm[2];
            histK[key] = Math.max(histK[key] || 0, +mm[3]);
        });
    });
    var months = [];
    var addMonth = function(y, m) {
        var key = y + '-' + _icPad(m);
        var K = histK[key] || _icMondaysIn(y, m).length;
        var weeks = [];
        for (var k = 1; k <= K; k++) {
            var end = invConsWeekEnd(y, m, k, K);
            var start = k === 1 ? y + '-' + _icPad(m) + '-01' : _icNextDay(invConsWeekEnd(y, m, k - 1, K));
            weeks.push({ id: invConsWeekId(y, m, k), k: k, start: start, end: end, future: !!today && start > today });
        }
        months.push({ y: y, m: m, label: INV_CONS_MONTH_LABELS[m - 1], weeks: weeks, fromHistory: !!histK[key] });
    };
    addMonth(year - 1, 12);
    for (var m = 1; m <= 12; m++) addMonth(year, m);
    var allWeeks = [];
    months.forEach(function(mo) { mo.weeks.forEach(function(w) { allWeeks.push(w); }); });

    var gases = src.gases || [];
    var label = src.reportLabel || function(g) { return g.gasType || g.formula || ''; };
    var rows = [], used = {};
    var build = function(base, cyls) {
        var cells = {};
        allWeeks.forEach(function(w) {
            var hv = base.weeks && base.weeks[w.id];
            if (typeof hv === 'number') { cells[w.id] = { v: hv, src: 'hist' }; return; }
            if (w.future || !cyls.length) return;
            var av = invConsAppValue(cyls, today && w.end > today ? today : w.end);
            if (av !== null) cells[w.id] = { v: av, src: 'app' };
        });
        var filled = allWeeks.filter(function(w) { return cells[w.id]; });
        var last = filled.length ? filled[filled.length - 1] : null;
        var lead = base.leadDays;
        if (!(lead > 0) && cyls.length && typeof invGasLeadDays === 'function') lead = invGasLeadDays(cyls[0]);
        return Object.assign({}, base, { cells: cells, actual: last ? cells[last.id].v : null, actualWeek: last ? last.id : null,
                                         leadDays: lead > 0 ? lead : null, nCyl: cyls.length });
    };
    hist.forEach(function(r) {
        var cyls = _icCylsFor(r.label, gases);
        cyls.forEach(function(g) { used[g.id] = true; });
        rows.push(build(r, cyls));
    });
    // Consumibles de la plataforma que la lista no tiene: van al final, con sus lecturas.
    var extra = {};
    gases.forEach(function(g) {
        if (!g || used[g.id] || g.status === 'Empty' || typeof invGasConsumableKey !== 'function') return;
        var k = invGasConsumableKey(g);
        (extra[k] = extra[k] || []).push(g);
    });
    Object.keys(extra).sort().forEach(function(k) {
        var cyls = extra[k], lbl = label(cyls[0]);
        rows.push(build({ id: invConsRowKey(lbl), label: lbl, category: cyls[0].gasCategory || 'Gases', item: '', code: '',
                          stockIni: null, stockAct: cyls.length, leadDays: null, limitText: '', weeks: {}, fromApp: true }, cyls));
    });

    // Consumo por semana (como el Excel: MAX(0, anterior − actual), una recarga cuenta 0) y su promedio.
    var yearWeeks = allWeeks.filter(function(w) { return w.id.slice(0, 4) === String(year); });
    rows.forEach(function(r) {
        var cons = [];
        for (var i = 1; i < yearWeeks.length; i++) {
            var a = r.cells[yearWeeks[i - 1].id], b = r.cells[yearWeeks[i].id];
            cons.push(a && b ? Math.max(0, a.v - b.v) : null);
        }
        r.consumption = cons;
        var vals = cons.filter(function(x) { return x !== null; });
        r.weeklyAvg = vals.length ? vals.reduce(function(s, x) { return s + x; }, 0) / vals.length : null;
        r.dailyAvg = r.weeklyAvg === null ? null : r.weeklyAvg / 5;
        r.lowerLimit = r.dailyAvg === null || !(r.leadDays > 0) ? null : r.dailyAvg * r.leadDays * 1.3;
        r.lowerAdj = r.lowerLimit === null ? null : (r.lowerLimit < 500 ? 500 : r.dailyAvg * r.leadDays);
        r.status = r.actual === null || r.lowerLimit === null ? '' : (r.actual > r.lowerLimit ? 'OK' : 'Comprar');
        r.hasData = Object.keys(r.cells).length > 0;
    });
    return { year: year, today: today, months: months, weeks: allWeeks, yearWeeks: yearWeeks, rows: rows,
             hasHistory: hist.length > 0 };
}
function _icNextDay(iso) {
    var d = new Date(Date.parse(iso + 'T00:00:00Z') + 86400000);
    return d.getUTCFullYear() + '-' + _icPad(d.getUTCMonth() + 1) + '-' + _icPad(d.getUTCDate());
}

// ── 3. El Excel ──────────────────────────────────────────────────────────

/** El libro (PURA). Mismo acomodo que la Lista de stock del laboratorio, con fórmulas y sus valores. */
function invConsListXlsxSpec(model) {
    var B = '000000';
    var st = function(o) {
        o = o || {};
        var x = { font: { name: 'Aptos Narrow', sz: o.sz || 11, b: !!o.b, color: o.color || '000000' },
                  align: { h: o.h || 'center', v: 'center', wrap: !!o.wrap } };
        if (o.fill) x.fill = o.fill;
        if (o.numFmt) x.numFmt = o.numFmt;
        if (o.border !== false) { x.border = 'thin'; x.borderColor = B; }
        return x;
    };
    var HEAD = 'BDD7EE', HEAD2 = 'DDEBF7', APP = 'E2F0D9', CONS = 'FCE4D6', SUMM = 'FFF2CC';
    var cells = [], merges = [], cols = [], rowsInfo = {};
    var put = function(r, c, v, s, f) { var cell = { r: r, c: c, v: v, s: s }; if (f) cell.f = f; cells.push(cell); return cell; };
    var ref = xwRef, rng = xwRange;
    var H = 6, ROW0 = 9;
    // Columnas fijas
    var C_TIPO = 1, C_NAME = 2, C_ITEM = 3, C_CODE = 4, C_INI = 5, C_ACT = 6, C_W0 = 7;
    cols.push({ min: 1, width: 17 }, { min: 2, width: 60 }, { min: 3, width: 9 }, { min: 4, width: 15 }, { min: 5, width: 11 }, { min: 6, width: 11 });

    put(1, 2, 'LISTA DE STOCK DE CONSUMIBLES DEL LABORATORIO DE EMISIONES', { sz: 18, b: true, h: 'left', border: false });
    put(2, 2, 'Generado por la plataforma el ' + (model.today || '') + ' · semanas en verde = lecturas de la plataforma; las demás = histórico importado.',
        { sz: 10, h: 'left', border: false, color: '595959' });
    rowsInfo[1] = { height: 24 };

    [[C_TIPO, 'Tipo de\n consumible'], [C_NAME, 'Consumible'], [C_ITEM, 'No de item'], [C_CODE, 'CODIGO']].forEach(function(x) {
        for (var r = H; r <= H + 2; r++) put(r, x[0], r === H ? x[1] : '', st({ b: true, fill: HEAD, wrap: true }));
        merges.push(rng(H, x[0], H + 2, x[0]));
    });
    put(H, C_INI, '', st({ fill: HEAD })); put(H + 1, C_INI, '', st({ fill: HEAD })); put(H + 2, C_INI, 'STOCK INICIAL\n (UNIDAD)', st({ b: true, fill: HEAD, wrap: true }));
    put(H, C_ACT, '', st({ fill: HEAD })); put(H + 1, C_ACT, '', st({ fill: HEAD })); put(H + 2, C_ACT, 'STOCK ACTUAL\n(Unidad)', st({ b: true, fill: HEAD, wrap: true }));
    rowsInfo[H] = { height: 30 }; rowsInfo[H + 2] = { height: 43 };

    // Inventario por semana
    var colOfWeek = {}, c = C_W0;
    var blocks = [];
    model.months.forEach(function(mo) {
        var c0 = c;
        mo.weeks.forEach(function(w) { colOfWeek[w.id] = c; cols.push({ min: c, width: 9.5 }); c++; });
        blocks.push({ mo: mo, c0: c0, c1: c - 1 });
    });
    var cInvEnd = c - 1;
    // Fila del año: el diciembre anterior lleva su año; el resto "AAAA INVENTORY"
    var yb = blocks.filter(function(b) { return b.mo.y === model.year; });
    var pb = blocks.filter(function(b) { return b.mo.y !== model.year; });
    pb.forEach(function(b) { for (var cc = b.c0; cc <= b.c1; cc++) put(H, cc, cc === b.c0 ? b.mo.y : '', st({ b: true, sz: 18, fill: HEAD })); if (b.c1 > b.c0) merges.push(rng(H, b.c0, H, b.c1)); });
    if (yb.length) {
        for (var cc = yb[0].c0; cc <= yb[yb.length - 1].c1; cc++) put(H, cc, cc === yb[0].c0 ? model.year + ' INVENTORY' : '', st({ b: true, sz: 18, fill: HEAD }));
        merges.push(rng(H, yb[0].c0, H, yb[yb.length - 1].c1));
    }
    blocks.forEach(function(b) {
        for (var cc = b.c0; cc <= b.c1; cc++) put(H + 1, cc, cc === b.c0 ? b.mo.label : '', st({ b: true, fill: HEAD2 }));
        if (b.c1 > b.c0) merges.push(rng(H + 1, b.c0, H + 1, b.c1));
        b.mo.weeks.forEach(function(w) { put(H + 2, colOfWeek[w.id], 'Semana ' + w.k, st({ b: true })); });
    });

    // Consumo: un periodo por cada par de semanas seguidas del año
    var yw = model.yearWeeks;
    var cCons0 = cInvEnd + 1, nPer = Math.max(0, yw.length - 1);
    for (var p = 0; p < nPer; p++) cols.push({ min: cCons0 + p, width: 9 });
    if (nPer) {
        for (var p2 = 0; p2 < nPer; p2++) {
            put(H, cCons0 + p2, p2 === 0 ? model.year + ' CONSUMO' : '', st({ b: true, sz: 18, fill: CONS }));
            put(H + 2, cCons0 + p2, 'Period ' + (p2 + 1), st({ b: true, fill: CONS }));
        }
        merges.push(rng(H, cCons0, H, cCons0 + nPer - 1));
        // Mes del periodo (el de la semana con que termina)
        var pm = null, pStart = 0;
        for (var p3 = 0; p3 <= nPer; p3++) {
            var mid = p3 < nPer ? yw[p3 + 1].id.slice(0, 7) : null;
            if (mid !== pm) {
                if (pm !== null) {
                    for (var q = pStart; q < p3; q++) put(H + 1, cCons0 + q, q === pStart ? INV_CONS_MONTH_LABELS[+pm.slice(5) - 1] : '', st({ b: true, fill: CONS }));
                    if (p3 - 1 > pStart) merges.push(rng(H + 1, cCons0 + pStart, H + 1, cCons0 + p3 - 1));
                }
                pm = mid; pStart = p3;
            }
        }
    }
    var cS = cCons0 + nPer;      // resumen
    var SUM = [['Actual Inventory', 13], ['CONSUMO SEMANAL PROMEDIO (PSI)', 14], ['CONSUMO DIARIO PROMEDIO (PSI)', 14],
               ['TIEMPO DE REPOSICION (Días)', 13], ['Limite Inferior (PSI)', 13], ['Limite Inferior \nAjustado (PSI)', 13], ['Status', 11]];
    SUM.forEach(function(x, i) {
        cols.push({ min: cS + i, width: x[1] });
        for (var r = H; r <= H + 2; r++) put(r, cS + i, r === H ? x[0] : '', st({ b: true, fill: SUMM, wrap: true }));
        merges.push(rng(H, cS + i, H + 2, cS + i));
    });

    // Renglones
    var r = ROW0, catStart = ROW0, catName = null;
    var closeCat = function(endRow) {
        if (catName === null) return;
        for (var rr = catStart; rr <= endRow; rr++) put(rr, C_TIPO, rr === catStart ? catName : '', st({ b: true, wrap: true }));
        if (endRow > catStart) merges.push(rng(catStart, C_TIPO, endRow, C_TIPO));
    };
    model.rows.forEach(function(row) {
        var cat = row.category || '';
        if (cat !== catName) { closeCat(r - 1); catName = cat; catStart = r; }
        put(r, C_NAME, row.label, st({ h: 'left' }));
        put(r, C_ITEM, row.item || '', st({}));
        put(r, C_CODE, row.code || '', st({}));
        put(r, C_INI, row.stockIni == null ? '' : row.stockIni, st({ b: true }));
        put(r, C_ACT, row.stockAct == null ? '' : row.stockAct, st({ b: true }));
        model.weeks.forEach(function(w) {
            var cl = row.cells[w.id];
            put(r, colOfWeek[w.id], cl ? cl.v : '', st({ b: true, fill: cl && cl.src === 'app' ? APP : null, numFmt: '0' }));
        });
        for (var p = 0; p < nPer; p++) {
            var A = ref(r, colOfWeek[yw[p].id]), Bc = ref(r, colOfWeek[yw[p + 1].id]);
            var cv = row.consumption[p];
            put(r, cCons0 + p, cv === null ? '' : cv, st({ b: true, numFmt: '0' }), 'IF(OR(' + A + '="",' + Bc + '=""),"",MAX(0,' + A + '-' + Bc + '))');
        }
        var consRange = nPer ? rng(r, cCons0, r, cCons0 + nPer - 1) : null;
        var gasRow = row.hasData;
        // Actual
        if (row.actualWeek) put(r, cS, row.actual, st({ b: true, numFmt: '0' }), ref(r, colOfWeek[row.actualWeek]));
        else put(r, cS, '', st({}));
        if (gasRow && consRange) {
            put(r, cS + 1, row.weeklyAvg === null ? '' : row.weeklyAvg, st({ b: true, numFmt: '0.0' }), 'IFERROR(AVERAGE(' + consRange + '),"")');
            put(r, cS + 2, row.dailyAvg === null ? '' : row.dailyAvg, st({ b: true, numFmt: '0.0' }), 'IF(' + ref(r, cS + 1) + '="","",' + ref(r, cS + 1) + '/5)');
        } else { put(r, cS + 1, '', st({})); put(r, cS + 2, '', st({})); }
        put(r, cS + 3, row.leadDays == null ? '' : row.leadDays, st({ b: true }));
        if (gasRow && consRange && row.leadDays > 0) {
            var DG = ref(r, cS + 2), DH = ref(r, cS + 3), DI = ref(r, cS + 4), DE = ref(r, cS);
            put(r, cS + 4, row.lowerLimit === null ? '' : row.lowerLimit, st({ b: true, numFmt: '0.00' }), 'IF(' + DG + '="","",' + DG + '*' + DH + '*1.3)');
            put(r, cS + 5, row.lowerAdj === null ? '' : row.lowerAdj, st({ b: true, numFmt: '0.00' }), 'IF(' + DI + '="","",IF(' + DI + '<500,500,' + DG + '*' + DH + '))');
            put(r, cS + 6, row.status, st({ b: true, color: row.status === 'Comprar' ? 'C00000' : '006100' }),
                'IF(OR(' + DE + '="",' + DI + '=""),"",IF(' + DE + '>' + DI + ',"OK","Comprar"))');
        } else {
            put(r, cS + 4, row.limitText || '', st({ b: true }));
            put(r, cS + 5, '', st({})); put(r, cS + 6, '', st({}));
        }
        r++;
    });
    closeCat(r - 1);
    return { sheets: [{ name: 'Sheet1', showGrid: true, zoom: 70, cols: cols, rows: rowsInfo, cells: cells, merges: merges,
                        freeze: { row: ROW0, col: C_W0 }, print: { landscape: true, fitWidth: 1 } }],
             creator: 'KIA EmLab' };
}

// ── UI ───────────────────────────────────────────────────────────────────

function _icModelNow(year) {
    return invConsListModel({
        year: year || +localToday().slice(0, 4), today: localToday(),
        history: invState.consHistory || [], gases: invState.gases || [],
        reportLabel: typeof invGasReportLabel === 'function' ? invGasReportLabel : null
    });
}

/** La tarjeta de Consumibles → Reporte: tendencia por consumible + Excel + importar histórico. */
function invConsListCardHTML() {
    var year = +(window._icYear || localToday().slice(0, 4));
    var m = _icModelNow(year);
    var e = escapeHtml;
    var hist = (invState.consHistory || []).filter(function(x) { return x && !x.deleted; });
    var lastImp = hist.reduce(function(a, x) { return (x.updatedAt || '') > (a.updatedAt || '') ? x : a; }, {});
    var h = '<div class="tp-card"><div class="tp-card-title" data-help="inv-conslist-help"><span>📊 Lista de consumibles — ' + year + '</span>' +
        '<span style="display:flex;flex-wrap:wrap;gap: var(--space-xs);margin-left:auto;">' +
        '<select aria-label="Año" onchange="window._icYear=this.value;invRender()" class="tp-input" style="width:auto;">' +
        [year - 1, year, year + 1].map(function(y) { return '<option' + (y === year ? ' selected' : '') + '>' + y + '</option>'; }).join('') + '</select>' +
        '<button class="tp-btn tp-btn-ghost" onclick="invConsHistoryImportOpen()" style="font-size: var(--fs-sm);">📥 Importar histórico</button>' +
        '<button class="tp-btn tp-btn-primary" onclick="invConsListExport()" style="font-size: var(--fs-sm);">📤 Excel</button></span></div>';
    h += '<div class="u-muted" style="font-size: var(--fs-xs);margin-bottom: var(--space-sm);">' +
        (hist.length ? 'Histórico: ' + hist.length + ' consumibles' + (lastImp.file ? ' · de «' + e(lastImp.file) + '»' : '') + (lastImp.updatedAt ? ' · ' + e(String(lastImp.updatedAt).slice(0, 10)) : '') + '. '
                     : 'Sin histórico importado: el Excel sale solo con las lecturas de la plataforma. ') +
        'Cada semana es el inventario al cierre (la última lectura de cada cilindro, la de la tarde si hay dos), sumado por consumible.</div>';
    var withData = m.rows.filter(function(r) { return r.hasData; });
    if (!withData.length) {
        h += '<div class="u-muted">Todavía no hay semanas con datos en ' + year + '.</div></div>';
        return h;
    }
    h += '<div style="overflow-x:auto;"><table class="u-cards" style="width:100%;border-collapse:collapse;font-size: var(--fs-sm);"><thead><tr>' +
        '<th style="text-align:left;">Consumible</th><th>Tendencia (PSI por semana)</th><th>Actual</th><th>Consumo semanal</th><th>Límite inferior</th><th>Status</th></tr></thead><tbody>';
    withData.forEach(function(r) {
        var pts = m.weeks.filter(function(w) { return r.cells[w.id]; }).map(function(w) { return { v: r.cells[w.id].v, src: r.cells[w.id].src, id: w.id }; });
        h += '<tr style="border-top:1px solid var(--border);"><td style="text-align:left;">' + e(r.label) + (r.fromApp ? ' <span class="u-chip">solo plataforma</span>' : '') + '</td>' +
            '<td>' + _icSpark(pts) + '</td><td style="font-weight:700;text-align:center;">' + (r.actual === null ? '—' : Math.round(r.actual)) + '</td>' +
            '<td style="text-align:center;">' + (r.weeklyAvg === null ? '—' : r.weeklyAvg.toFixed(1)) + '</td>' +
            '<td style="text-align:center;">' + (r.lowerLimit === null ? '—' : r.lowerLimit.toFixed(1)) + '</td>' +
            '<td style="text-align:center;">' + (r.status ? '<span class="u-chip ' + (r.status === 'OK' ? 'u-chip--ok' : 'u-chip--warn') + '">' + r.status + '</span>' : '—') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="u-muted" style="font-size: var(--fs-xs);margin-top: var(--space-xs);">El Excel trae los mismos números y sus fórmulas (consumo = MAX(0, semana anterior − esta); límite = consumo diario × días de reposición × 1.3). Las semanas que salen de la plataforma van en verde.</div>';
    return h + '</div>';
}

function _icSpark(pts) {
    if (!pts.length) return '';
    var W = 160, Hh = 32, max = Math.max.apply(null, pts.map(function(p) { return p.v; }).concat([1]));
    var step = pts.length > 1 ? W / (pts.length - 1) : 0;
    var path = pts.map(function(p, i) { return (i ? 'L' : 'M') + (i * step).toFixed(1) + ' ' + (Hh - 2 - (p.v / max) * (Hh - 4)).toFixed(1); }).join(' ');
    var dots = pts.map(function(p, i) {
        return p.src === 'app' ? '<circle cx="' + (i * step).toFixed(1) + '" cy="' + (Hh - 2 - (p.v / max) * (Hh - 4)).toFixed(1) + '" r="1.8" fill="var(--ok-fill)"/>' : '';
    }).join('');
    return '<svg width="' + W + '" height="' + Hh + '" viewBox="-2 0 ' + (W + 4) + ' ' + Hh + '" role="img" aria-label="Tendencia semanal"><path d="' + path + '" fill="none" stroke="var(--accent-inv, #0ea5e9)" stroke-width="1.5"/>' + dots + '</svg>';
}

/** Un clic: el Excel del año elegido, llenado solo. */
function invConsListExport() {
    var year = +(window._icYear || localToday().slice(0, 4));
    var m = _icModelNow(year);
    var name = 'Lista_de_Consumibles_' + year + '_' + localToday() + '.xlsx';
    return xwBuildCompressed(invConsListXlsxSpec(m)).then(function(bytes) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function() { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 1500);
        if (typeof auditLog === 'function') auditLog('inv', 'lista_consumibles_xlsx', { type: 'inventory', label: name },
            m.rows.length + ' consumibles · ' + m.weeks.length + ' semanas');
        showToast('Descargado: ' + name, 'success');
        return true;
    }).catch(function(e) {
        showToast('No se pudo armar el Excel: ' + (e && e.message ? e.message : e) + '. Usa 🐞 para reportarlo.', 'error');
        return false;
    });
}

var _icPending = null;
function invConsHistoryImportOpen() {
    if (typeof authRequire === 'function' && !authRequire('inventory.manage', 'importar el histórico de consumibles')) return;
    _icPending = null;
    showModal({
        title: '📥 Importar histórico de consumibles',
        body: '<p>Sube la <b>Lista de stock de consumibles</b> (.xlsx). Se guardan las semanas que trae como histórico de cada consumible: ' +
              'no se convierten en lecturas de cilindro. Volver a subirla actualiza, no duplica.</p>' +
              '<input type="file" accept=".xlsx" onchange="invConsHistoryFile(event)" aria-label="Archivo de la lista de consumibles">' +
              '<div id="ic-preview" style="margin-top: var(--space-md);"></div>',
        buttons: [{ label: 'Cancelar' }, { label: 'Importar', cls: 'btn-primary', onclick: invConsHistoryConfirm }]
    });
}

function invConsHistoryFile(ev) {
    var f = ev && ev.target && ev.target.files && ev.target.files[0];
    var box = document.getElementById('ic-preview');
    if (!f || !box) return;
    box.innerHTML = '<p class="u-muted">Leyendo ' + escapeHtml(f.name) + '…</p>';
    var rd = new FileReader();
    rd.onload = function() {
        vetsReadWorkbook(new Uint8Array(rd.result), null).then(function(sheets) {
            var best = null;
            Object.keys(sheets).forEach(function(k) {
                var p = invConsListParse(_homoGridFromSheet(sheets[k]));
                if (!p.error && (!best || p.rows.length > best.rows.length)) best = p;
            });
            if (!best) throw new Error('No encontré la tabla (encabezados "Consumible" y "Semana").');
            _icPending = { parsed: best, fileName: f.name };
            var conDatos = best.rows.filter(function(r) { return r.nWeeks; });
            var y0 = best.weeks[0], y1 = best.weeks[best.weeks.length - 1];
            box.innerHTML = '<p><b>' + best.rows.length + '</b> consumibles (' + conDatos.length + ' con semanas) · <b>' + best.weeks.length + '</b> semanas, de ' +
                INV_CONS_MONTH_LABELS[y0.m - 1].toLowerCase() + ' ' + y0.y + ' a ' + INV_CONS_MONTH_LABELS[y1.m - 1].toLowerCase() + ' ' + y1.y + '.</p>' +
                best.notes.map(function(n) { return '<p class="u-muted">ℹ️ ' + escapeHtml(n) + '</p>'; }).join('') +
                '<ul style="max-height:200px;overflow:auto;">' + conDatos.slice(0, 40).map(function(r) {
                    return '<li>' + escapeHtml(r.label) + ' — ' + r.nWeeks + ' semanas</li>';
                }).join('') + '</ul>';
        }).catch(function(err) {
            _icPending = null;
            box.innerHTML = '<p style="color:var(--danger-text);">' + escapeHtml(err && err.message || String(err)) + '</p>';
        });
    };
    rd.readAsArrayBuffer(f);
}

function invConsHistoryConfirm() {
    if (!_icPending) { showToast('Primero elige el archivo.', 'warning'); return; }
    var res = invConsHistoryApply(_icPending.parsed, { fileName: _icPending.fileName });
    _icPending = null;
    var m = document.getElementById('globalModal'); if (m) m.remove();
    if (!res) return;
    showToast('Histórico importado: ' + (res.nuevos + res.actualizados) + ' consumibles, ' + res.semanas + ' valores semanales.', 'success');
    if (typeof invRender === 'function') invRender();
}

if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'inv-conslist-help': { title: 'Lista de consumibles', text: 'La lista de stock del laboratorio, semana por semana: el inventario de cada consumible al cierre de la semana (todos sus cilindros sumados), cuánto se consumió, el promedio y si ya hay que comprar. Lo anterior a la plataforma sale del histórico importado; lo demás, de las lecturas. 📤 Excel la descarga en el mismo formato.' }
});
