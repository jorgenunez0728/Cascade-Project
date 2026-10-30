// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [3.12.0] CoP por AÑO CALENDARIO + estatus semanal para corporativo   ║
// ║                                                                      ║
// ║  Corporativo pidió dejar de contar el CoP por año modelo: lo que     ║
// ║  manda es lo PRODUCIDO de enero a diciembre, sin importar el MY       ║
// ║  (MY26 y MY27 de una familia se suman). Este archivo:                 ║
// ║   · copYearKeyOf — la familia del año calendario, ENCIMA de la clave  ║
// ║     de siempre (el segmento del MY pasa a "CAL 2026"; la clave de     ║
// ║     copVehicleFamilyKey/tpFamilyKeyForCfg y los juicios no cambian);  ║
// ║   · copLotRequired / copYearRequired — las reglas de corporativo      ║
// ║     (lotes; 1 por familia en Medio Oriente — 3.13.0);                 ║
// ║   · copYearProduction / copYearReportCompute — PURAS;                  ║
// ║   · el reporte gerencial (copYearReportHTML, estilos literales: el    ║
// ║     mismo HTML sirve en pantalla, impreso y por correo).              ║
// ╚══════════════════════════════════════════════════════════════════════╝

/** Ensayos por lote y tamaño de los lotes (regla de corporativo, oct-2026). */
var COP_LOT_TESTS = 3;
var COP_LOT_FIRST = 7500;   // el primer lote llega hasta 7,500 unidades
var COP_LOT_NEXT = 5000;    // cada lote siguiente: 5,000 más (o fracción)

/**
 * LA regla de cuántos ensayos pide la producción de un año. PURA.
 * 0 unidades → 0 · 1–7,500 → 3 · 7,501–12,500 → 6 · cada 5,000 más (o fracción) → +3.
 * NO es la regla del plan (`tpFamilyRequired`, 2.36.0, sale de Plan → Reglas): esta es
 * la de corporativo para el CoP y solo la usa este reporte.
 */
function copLotRequired(units) {
    var u = Math.floor(Number(units) || 0);
    if (u <= 0) return 0;
    var lotes = 1 + Math.max(0, Math.ceil((u - COP_LOT_FIRST) / COP_LOT_NEXT));
    return lotes * COP_LOT_TESTS;
}

/** Unidades con las que se completa el siguiente lote (para decir "faltan N unidades"). PURA. */
function copLotNextAt(units) {
    var u = Math.floor(Number(units) || 0);
    if (u <= 0) return 1;
    if (u <= COP_LOT_FIRST) return COP_LOT_FIRST + 1;
    return COP_LOT_FIRST + Math.ceil((u - COP_LOT_FIRST) / COP_LOT_NEXT) * COP_LOT_NEXT + 1;
}

/**
 * [3.13.0] Ensayos que pide una regla de corporativo (COP_HQ_RULES) con `units`
 * producidas en el año. PURA. 'lot' → copLotRequired; 'one' → 1 si hubo producción.
 */
function copYearRequired(rule, units) {
    var u = Math.floor(Number(units) || 0);
    if (u <= 0) return 0;
    if (rule === 'one') return 1;
    return copLotRequired(u);
}

/**
 * [3.13.0] Lo que le falta a una familia del año para el PLAN. PURA.
 * f = {req, done, inFlight, declared}: REQ del año − ensayos que cuentan − en curso
 * (registrados, todavía sin aprobar) − declaradas o propuestas en el plan. Nunca < 0.
 */
function copYearPlanPending(f) {
    f = f || {};
    var n = (Number(f.req) || 0) - (Number(f.done) || 0) - (Number(f.inFlight) || 0) - (Number(f.declared) || 0);
    return Math.max(0, n);
}

/**
 * [3.13.0] Reparte el pendiente de una familia entre sus configuraciones. PURA.
 * cfgs = [{desc, upcoming, total, paused}]. Solo las que tienen producción en los meses
 * que vienen (sin pausar), de mayor a menor, una por vuelta: así el generador no propone
 * un año modelo que ya salió de línea. Sin ninguna en producción, todo va a la de mayor
 * volumen sin pausar. Devuelve {desc: n}.
 */
function copYearPlanSplit(pending, cfgs) {
    var out = {}, n = Math.max(0, Math.floor(Number(pending) || 0));
    var live = (cfgs || []).filter(function(c) { return c && c.desc && !c.paused; });
    if (!n || !live.length) return out;
    var cand = live.filter(function(c) { return (Number(c.upcoming) || 0) > 0; })
        .sort(function(a, b) { return (b.upcoming - a.upcoming) || ((b.total || 0) - (a.total || 0)) || (a.desc < b.desc ? -1 : 1); });
    if (!cand.length) {
        cand = live.slice().sort(function(a, b) { return ((b.total || 0) - (a.total || 0)) || (a.desc < b.desc ? -1 : 1); }).slice(0, 1);
    }
    for (var i = 0; i < n; i++) { var d = cand[i % cand.length].desc; out[d] = (out[d] || 0) + 1; }
    return out;
}

/** [3.13.0] Cómo se dice una regla en el reporte. PURA. */
function copYearRuleText(rule) {
    return rule === 'one' ? '1 ensayo por familia con producción en el año'
        : 'hasta 7,500 unidades producidas, 3 ensayos; de 7,501 a 12,500, 6; cada 5,000 unidades adicionales (o fracción), 3 más';
}

// La familia del año calendario (copYearKeyOf, copYearOfKey, copVehicleInFamily) vive en
// cop_validator.js, junto a copVehicleFamilyKey: es identidad de familia.

/** Grupo con el que corporativo lee la familia: híbrido, 5 puertas, wagon, 4 puertas. PURA. */
function copRepGroupOf(f) {
    var mod = String((f && f.mod) || '').toUpperCase();
    var ep = String((f && f.ep) || '').toUpperCase();
    var body = String((f && f.body) || '').toUpperCase();
    if (/MH$/.test(mod) || (/\bHEV\b|HYBRID/.test(ep) && !/MILD/.test(ep))) return { id: 'hev', label: 'Híbrido', order: 3 };
    if (body === '5DR') return { id: '5dr', label: '5 puertas', order: 1 };
    if (body === 'WGN') return { id: 'wgn', label: 'Wagon', order: 2 };
    if (body === '4DR') return { id: '4dr', label: '4 puertas', order: 1 };
    return { id: 'otra', label: body || 'Otras', order: 4 };
}

/** Nombre corto de una familia para el reporte (sin el año). PURA. */
function copRepFamilyLabel(f) {
    if (!f) return '';
    return [f.mod || '(sin modelo)', f.eng, f.tx, f.ep, f.engpkg, f.body, f.reg]
        .filter(function(x) { return x && x !== '0'; }).join(' · ');
}

var _COP_REP_MON = { jan:1, ene:1, feb:2, mar:3, apr:4, abr:4, may:5, jun:6, jul:7, aug:8, ago:8,
                     sep:9, set:9, oct:10, nov:11, dec:12, dic:12 };
/** 'Jun-26' / 'Jun 2026' / '2026-06' → {y, m} (m de 1 a 12) o null. PURA. */
function _copRepMonth(label) {
    var s = String(label == null ? '' : label).trim();
    var a = /^([A-Za-z]{3,10})[-\s]?(\d{2}|\d{4})$/.exec(s);
    if (a) {
        var mo = _COP_REP_MON[a[1].toLowerCase().slice(0, 3)];
        if (!mo) return null;
        var y = Number(a[2]);
        return { y: y < 100 ? 2000 + y : y, m: mo };
    }
    var b = /^(\d{4})[-\/](\d{1,2})$/.exec(s);
    if (b && Number(b[2]) >= 1 && Number(b[2]) <= 12) return { y: Number(b[1]), m: Number(b[2]) };
    return null;
}

/**
 * [3.22.0] Hasta qué mes cubre el `count_hist` del CSV en `year`. PURA.
 * El laboratorio confirmó (27-oct-2026) que `count_hist` es lo producido de enero a la
 * fecha del CSV, en el año en curso. Los meses del año ANTERIORES al primer mes que trae
 * el CSV quedan dentro de ese acumulado (lo que el plan tenga ahí, de un CSV viejo, era
 * pronóstico y se ignora); del primer mes del CSV en adelante se suma el plan — la misma
 * convención que el REQ del Plan (`hist + total`).
 * hist = {asOf:'AAAA-MM-DD' (importación), firstMonth:'Oct-26'|null}.
 * Devuelve el mes (1..13) desde el que cuenta el plan, o 0 si el acumulado no es de `year`.
 */
function copYearHistBoundary(hist, year) {
    if (!hist || !hist.asOf) return 0;
    var y = Number(String(hist.asOf).slice(0, 4));
    if (y !== Number(year)) return 0;
    var p = hist.firstMonth ? _copRepMonth(hist.firstMonth) : null;
    if (!p) return Number(String(hist.asOf).slice(5, 7)) || 0;
    if (p.y > y) return 13;
    if (p.y < y) return 1;
    return p.m;
}

/**
 * LA producción de un año calendario por familia. PURA.
 * src = {year, months:[etiquetas], planData:[cfg con m[] alineado a months],
 *        inScope(cfg)→bool, keyOf(cfg)→clave de familia, actuals:{clave_año:{m:[12]}},
 *        ruleOf(cfg)→fila de COP_HQ_RULES o null (opcional),
 *        hist:{asOf, firstMonth} (opcional, [3.22.0] el acumulado del CSV)}
 *
 * - [3.22.0] Con `hist` del mismo año: producción = Σ `count_hist` de sus configuraciones
 *   (`f.hist`, con fecha `cfg.histAsOf`) + los meses desde el primero del CSV. Los meses
 *   anteriores van como 'hist' (cubiertos por el acumulado), nunca como "sin dato".
 *   Una configuración retirada conserva el acumulado de la importación donde salió
 *   (`histAsOf`): lo producido en el año sigue contando. Sin `histAsOf` y retirada, no.
 * - Un mes "tiene dato" si viene en el plan y el plan ENTERO trae unidades ese mes: un
 *   mes en cero para todas las configuraciones es un mes que el CSV no trajo, no un mes
 *   sin producción. Se DECLARA (`missing`), nunca se lee como cero.
 * - Lo capturado como real (`actuals`) manda sobre el plan, mes por mes (solo en los
 *   meses que no cubre el acumulado: si no, se contaría dos veces).
 * Devuelve {fams:{clave_año:{…, hist, m:[12], src:[12]}}, monthHas:[12], missing:[1..12], histBoundary, histAsOf}.
 */
function copYearProduction(src) {
    var year = Number(src.year);
    var months = src.months || [];
    var plan = src.planData || [];
    var hb = copYearHistBoundary(src.hist, year);       // 0 = sin acumulado de este año
    var idx = months.map(function(l) { var p = _copRepMonth(l); return (p && p.y === year) ? p.m - 1 : -1; });
    var tot = [0,0,0,0,0,0,0,0,0,0,0,0];
    plan.forEach(function(c) {
        (c && c.m || []).forEach(function(v, i) { if (idx[i] >= 0) tot[idx[i]] += Number(v) || 0; });
    });
    var monthHas = tot.map(function(t, i) { return (hb && i < hb - 1) ? true : t > 0; });
    var histAsOfOf = function(c) {
        var a = c.histAsOf || (c._retired ? '' : (src.hist && src.hist.asOf) || '');
        return Number(String(a).slice(0, 4)) === year ? a : '';
    };
    var latestAsOf = '';
    var fams = {};
    plan.forEach(function(c) {
        if (!c || (src.inScope && !src.inScope(c))) return;
        var yk = copYearKeyOf(src.keyOf(c), year);
        if (!yk) return;
        var f = fams[yk], yp = yk.split('|');
        // [3.26.0] Modelo y carrocería salen de la CLAVE: el modelo puede venir inferido
        // (CSV sin Modelo) y la carrocería vacía (familia del WVTA compartida).
        if (!f) f = fams[yk] = { key: yk, mod: yp[0] || '', eng: c.eng || '', tx: c.tx || '', reg: c.reg || '',
            ep: (c.ep && c.ep !== '0') ? c.ep : '', engpkg: (c.engpkg && c.engpkg !== '0') ? c.engpkg : '',
            body: yp[7] || '', regions: {}, mys: {}, configs: 0,
            plan: [0,0,0,0,0,0,0,0,0,0,0,0], rule: '', ruleLabel: '', hist: 0, histAsOf: '' };
        f.configs++;
        var hAsOf = hb ? histAsOfOf(c) : '';
        if (hAsOf && Number(c.hist) > 0) {
            f.hist += Number(c.hist) || 0;
            if (hAsOf > f.histAsOf) f.histAsOf = hAsOf;
            if (hAsOf > latestAsOf) latestAsOf = hAsOf;
            if (c.my) f.mys[c.my] = true;
        }
        if (c.rgn) f.regions[c.rgn] = true;
        // [3.13.0] La regla de corporativo de la familia. Si dos configuraciones traen reglas
        // distintas, manda 'lot' (pide más) y se marca: no se elige la barata en silencio.
        var hr = src.ruleOf ? src.ruleOf(c) : null;
        if (hr && hr.rule) {
            if (f.rule && f.rule !== hr.rule) f.ruleMixed = true;
            if (!f.rule || hr.rule === 'lot') { f.rule = hr.rule; f.ruleLabel = hr.label || ''; }
        }
        var añoCfg = 0;
        (c.m || []).forEach(function(v, i) {
            if (idx[i] < 0 || (hb && idx[i] < hb - 1)) return;      // dentro del acumulado
            f.plan[idx[i]] += Number(v) || 0; añoCfg += Number(v) || 0;
        });
        if (c.my && añoCfg > 0) f.mys[c.my] = true;
    });
    var actuals = src.actuals || {};
    Object.keys(fams).forEach(function(k) {
        var f = fams[k], a = actuals[k] && Array.isArray(actuals[k].m) ? actuals[k].m : [];
        f.m = []; f.src = [];
        for (var i = 0; i < 12; i++) {
            var r = a[i];
            if (hb && i < hb - 1) { f.m.push(0); f.src.push('hist'); }
            else if (r !== null && r !== undefined && r !== '' && isFinite(Number(r))) { f.m.push(Number(r)); f.src.push('real'); }
            else if (monthHas[i]) { f.m.push(f.plan[i]); f.src.push('plan'); }
            else { f.m.push(0); f.src.push('sin-dato'); }
        }
        f.vol = f.hist + f.m.reduce(function(s, v) { return s + v; }, 0);
    });
    var missing = [];
    monthHas.forEach(function(h, i) { if (!h) missing.push(i + 1); });
    return { year: year, fams: fams, monthHas: monthHas, missing: missing, histBoundary: hb, histAsOf: latestAsOf };
}

// ─── Fechas (cadenas AAAA-MM-DD, nunca new Date('AAAA-MM-DD')) ─────────────────
function _copRepAddDays(iso, n) {
    var p = String(iso).split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.toISOString().slice(0, 10);
}
/** Lunes de la semana de un día (AAAA-MM-DD). PURA. */
function copRepMonday(iso) {
    var p = String(iso).split('-').map(Number);
    var wd = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); // 0 = domingo
    return _copRepAddDays(iso, -((wd + 6) % 7));
}
/** Número de semana (ISO 8601) de un día. PURA. */
function copRepIsoWeek(iso) {
    var p = String(iso).split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var wd = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - wd + 3);
    var first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

var COP_REP_REGION_ORDER = ['EUROPE', 'GENERAL', 'MIDDLE EAST'];
var COP_REP_REGION_LABEL = { 'EUROPE': 'Europa', 'GENERAL': 'General · EURO-6C', 'MIDDLE EAST': 'Medio Oriente' };

/**
 * Estado de una familia para el reporte: cruza cobertura (lotes) y veredicto. PURA.
 * El veredicto es el del muestreo secuencial con TODOS los ensayos del año.
 */
function copRepStatus(req, done, verdict) {
    if (verdict === 'FAIL') return { id: 'fail', label: 'No concordante' };
    if (!req) return done ? { id: 'extra', label: 'Sin producción' } : { id: 'none', label: 'Sin producción' };
    if (!done) return { id: 'todo', label: 'Sin iniciar' };
    if (done < req) return { id: 'run', label: 'En progreso' };
    if (verdict === 'PASS') return { id: 'ok', label: 'Cumplido' };
    return { id: 'open', label: 'Muestreo abierto' };
}

/**
 * LA definición del estatus semanal del CoP por año calendario. PURA.
 * src = {year, cutIso, prod (copYearProduction), tests:[{yk, date, vin, purpose,
 *        region, fam:{mod,eng,…}}], verdictOf(yk, tests)→'PASS'|'CONTINUE'|'FAIL'|null,
 *        prevSaved (corte guardado de la semana anterior o null), outOfScope:[…]}
 * - "Hechas" = ensayos que cuentan con fecha de prueba ≤ corte.
 * - La semana anterior sale del corte GUARDADO (lo que se reportó); sin corte guardado
 *   se deriva por fecha de prueba y la producción se toma igual a la de hoy (se declara).
 * - El avance global suma min(hechas, REQ) por familia: lo que sobra en una familia no
 *   tapa lo que falta en otra.
 */
function copYearReportCompute(src) {
    var year = Number(src.year), cut = src.cutIso, prevCut = _copRepAddDays(cut, -7);
    var prod = src.prod || { fams: {}, missing: [] };
    var prev = src.prevSaved && src.prevSaved.rows ? src.prevSaved : null;
    var tests = (src.tests || []).filter(function(t) { return t && t.yk && t.date && t.date <= cut && Number(t.date.slice(0, 4)) === year; });
    var byKey = {};
    Object.keys(prod.fams).forEach(function(k) { byKey[k] = { fam: prod.fams[k], tests: [] }; });
    tests.forEach(function(t) {
        if (!byKey[t.yk]) {
            var f = t.fam || {}, tp = String(t.yk).split('|');
            byKey[t.yk] = { fam: { key: t.yk, mod: tp[0] || f.mod || '', eng: f.eng || '', tx: f.tx || '', reg: f.reg || '', ep: f.ep || '',
                engpkg: f.engpkg || '', body: tp.length >= 8 ? tp[7] : (f.body || ''), regions: {}, mys: {}, configs: 0, m: [0,0,0,0,0,0,0,0,0,0,0,0],
                src: [], vol: 0, noPlan: true }, tests: [] };
        }
        if (t.region) byKey[t.yk].fam.regions[t.region] = true;
        byKey[t.yk].tests.push(t);
    });
    var cutMonth = Number(String(cut).slice(5, 7));
    var cutYear = Number(String(cut).slice(0, 4));
    var rows = [], excludedOut = [], noProduction = [];
    var excl = src.exclude || {};
    Object.keys(byKey).forEach(function(k) {
        var e = byKey[k], f = e.fam;
        if (!f.vol && !e.tests.length) return;            // familia del alcance sin nada en el año
        // Sin producción en el año no va al reporte (decisión del laboratorio, oct-2026), aunque
        // tenga ensayos: la regla de lotes es sobre lo producido. Solo la app lo lista aparte.
        if (!f.vol) { noProduction.push({ key: k, label: copRepFamilyLabel(f), done: e.tests.length }); return; }
        // Fuera del reporte por decisión del laboratorio: se DECLARA (con su motivo), no se cuenta.
        if (excl[k] && excl[k].excluded) {
            excludedOut.push({ key: k, label: copRepFamilyLabel(f), vol: f.vol, done: e.tests.length,
                               reason: excl[k].reason || '', by: excl[k].by || '', at: excl[k].at || '' });
            return;
        }
        e.tests.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
        var prevTests = e.tests.filter(function(t) { return t.date <= prevCut; });
        var closed = cutYear > year ? 12 : (cutYear < year ? 0 : cutMonth - 1);
        var volToDate = (Number(f.hist) || 0) + f.m.slice(0, closed).reduce(function(s, v) { return s + v; }, 0);
        var rule = f.rule || 'lot';
        var req = copYearRequired(rule, f.vol);
        var done = e.tests.length;
        var verdict = src.verdictOf ? src.verdictOf(k, e.tests) : null;
        var p = prev ? prev.rows[k] : null;
        var prevDone = p ? (Number(p.done) || 0) : prevTests.length;
        var prevReq = p ? (Number(p.req) || 0) : req;
        var prevVerdict = p ? (p.verdict || null) : (src.verdictOf ? src.verdictOf(k, prevTests) : null);
        var regions = Object.keys(f.regions);
        var region = COP_REP_REGION_ORDER.filter(function(r) { return f.regions[r]; })[0] || regions[0] || '';
        var purposes = {};
        e.tests.forEach(function(t) { var pu = t.purpose || '(sin propósito)'; purposes[pu] = (purposes[pu] || 0) + 1; });
        var g = copRepGroupOf(f);
        var progress = req ? Math.min(done, req) / req : (done ? 1 : 0);
        var prevProgress = prevReq ? Math.min(prevDone, prevReq) / prevReq : (prevDone ? 1 : 0);
        rows.push({
            key: k, label: copRepFamilyLabel(f), fam: f, region: region, regions: regions, group: g,
            mys: Object.keys(f.mys).sort(), configs: f.configs, noPlan: !!f.noPlan,
            vol: f.vol, volToDate: volToDate, hist: Number(f.hist) || 0, histAsOf: f.histAsOf || '', months: f.m, monthSrc: f.src,
            rule: rule, ruleLabel: f.ruleLabel || '', ruleMixed: !!f.ruleMixed,
            req: req, reqToDate: copYearRequired(rule, volToDate), nextLotAt: rule === 'lot' ? copLotNextAt(f.vol) : null,
            done: done, prevDone: prevDone, added: done - prevDone, pending: Math.max(0, req - done),
            prevReq: prevReq, prevVol: p ? (Number(p.vol) || 0) : null, volDelta: p ? f.vol - (Number(p.vol) || 0) : null,
            progress: progress, prevProgress: prevProgress, deltaPp: Math.round((progress - prevProgress) * 1000) / 10,
            verdict: verdict, prevVerdict: prevVerdict, status: copRepStatus(req, done, verdict),
            lastTest: done ? e.tests[done - 1].date : '', purposes: purposes,
            vins: e.tests.map(function(t) { return t.vin; }),
            // [3.23.0] Para el ritmo, lo crítico y los puntos clave.
            name: copRepShortName(f), testDates: e.tests.map(function(t) { return t.date; }),
            prevStatus: copRepStatus(prevReq, prevDone, prevVerdict),
            ahead: _copRepAhead(f.m, f.src, cutYear > year ? 12 : (cutYear < year ? 0 : cutMonth - 1)),
            lastProdMonth: _copRepLastProdMonth(f.m, f.src)
        });
    });
    rows.sort(function(a, b) {
        var ra = COP_REP_REGION_ORDER.indexOf(a.region), rb = COP_REP_REGION_ORDER.indexOf(b.region);
        ra = ra < 0 ? 99 : ra; rb = rb < 0 ? 99 : rb;
        return (ra - rb) || (a.group.order - b.group.order) || (b.vol - a.vol) || (a.label < b.label ? -1 : 1);
    });
    function sum(list) {
        var o = { families: list.length, vol: 0, req: 0, done: 0, prevDone: 0, pending: 0, covered: 0, prevCovered: 0,
                  prevReq: 0, ok: 0, fail: 0, added: 0 };
        list.forEach(function(r) {
            o.vol += r.vol; o.req += r.req; o.done += r.done; o.prevDone += r.prevDone; o.pending += r.pending;
            o.covered += Math.min(r.done, r.req); o.prevCovered += Math.min(r.prevDone, r.prevReq); o.prevReq += r.prevReq;
            o.added += r.added;
            if (r.status.id === 'ok') o.ok++;
            if (r.status.id === 'fail') o.fail++;
        });
        o.progress = o.req ? o.covered / o.req : 0;
        o.prevProgress = o.prevReq ? o.prevCovered / o.prevReq : 0;
        o.deltaPp = Math.round((o.progress - o.prevProgress) * 1000) / 10;
        o.withReq = list.filter(function(r) { return r.req > 0; }).length;
        return o;
    }
    var regionsOut = [];
    rows.forEach(function(r) { if (regionsOut.indexOf(r.region) < 0) regionsOut.push(r.region); });
    var nonCop = {};
    rows.forEach(function(r) { Object.keys(r.purposes).forEach(function(pu) { if (!/^COP/i.test(pu)) nonCop[pu] = (nonCop[pu] || 0) + r.purposes[pu]; }); });
    var model = {
        year: year, cut: cut, prevCut: prevCut, weekOf: copRepMonday(cut), week: copRepIsoWeek(cut),
        prevFromSaved: !!prev, prevSavedAt: prev ? prev.at : '',
        rows: rows,
        regions: regionsOut.map(function(rg) {
            var list = rows.filter(function(r) { return r.region === rg; });
            var rules = {};
            list.forEach(function(r) { rules[r.rule] = true; });
            return { id: rg, label: COP_REP_REGION_LABEL[rg] || rg || '(sin región)', rows: list, total: sum(list),
                     rules: Object.keys(rules).sort() };
        }),
        total: sum(rows),
        missingMonths: prod.missing || [],
        histBoundary: prod.histBoundary || 0, histAsOf: prod.histAsOf || '',
        otherPurpose: src.otherPurpose || [],
        realMonths: (function() {
            var m = {};
            rows.forEach(function(r) { (r.monthSrc || []).forEach(function(s, i) { if (s === 'real') m[i + 1] = true; }); });
            return Object.keys(m).map(Number).sort(function(a, b) { return a - b; });
        })(),
        nonCopPurposes: nonCop,
        excluded: excludedOut.sort(function(a, b) { return b.vol - a.vol; }),
        noProduction: noProduction,
        outOfScope: src.outOfScope || [],
        note: (src.note && String(src.note.text || '').trim()) ? src.note : null,
        weekOff: src.weekOff || {}
    };
    // [3.23.0] Lo que pidió la gerencia: el ritmo real contra el necesario y qué familia
    // es la más crítica. Se DERIVA del mismo modelo, nunca se guarda.
    model.pace = copRepPace(model);
    model.critical = copRepCritical(model);
    model.highlights = copRepHighlights(model);
    return model;
}

// ═══════════════════════════════════════════════════════════════════════════════
// [3.23.0] Ritmo, familias críticas y puntos clave — PURAS, sobre el modelo del estatus
// ═══════════════════════════════════════════════════════════════════════════════

/** Unidades planeadas del mes del corte a diciembre (lo que todavía se va a producir). PURA. */
function _copRepAhead(months, srcs, fromIdx) {
    var n = 0;
    for (var i = Math.max(0, fromIdx); i < 12; i++) {
        if (srcs && (srcs[i] === 'plan' || srcs[i] === 'real')) n += Number(months[i]) || 0;
    }
    return n;
}
/** Último mes (1..12) del año con producción planeada o real; 0 = el plan no trae ninguno. PURA. */
function _copRepLastProdMonth(months, srcs) {
    for (var i = 11; i >= 0; i--) {
        if (srcs && (srcs[i] === 'plan' || srcs[i] === 'real') && (Number(months[i]) || 0) > 0) return i + 1;
    }
    return 0;
}

/**
 * Cómo dice una familia la gerencia: "CL4 1.6 T-GDI LP 7DCT", "BL7m 1.6 6AT". PURA.
 * La carrocería no va en el nombre: es el grupo de la tabla. Lo que no se reconoce se
 * deja como viene (nunca se inventa una etiqueta).
 */
var COP_REP_ENGINE_TAGS = [
    { re: /1000\s*cc\s*KAPPA\s*PE/i, tag: 'T-GDI', base: '12V' },
    { re: /KAPPA\s*PE/i, tag: 'T-GDI' },
    { re: /GAMMA[-\s]?II/i, tag: 'T-GDI' }
];
var COP_REP_PKG_TAGS = { 'LOW POWER': 'LP', 'HIGH POWER': 'HP', 'DCVVT': '' };
function copRepShortName(f) {
    if (!f) return '';
    var eng = String(f.eng || '');
    var mcc = /(\d{3,4})\s*cc/i.exec(eng);
    var disp = mcc ? (Number(mcc[1]) / 1000).toFixed(1) : eng;
    var tag = null;
    for (var i = 0; i < COP_REP_ENGINE_TAGS.length; i++) if (COP_REP_ENGINE_TAGS[i].re.test(eng)) { tag = COP_REP_ENGINE_TAGS[i]; break; }
    var ep = String(f.ep || '').toUpperCase();
    var elec = /MILD/.test(ep) ? '48V' : (/\bHEV\b|HYBRID/.test(ep) ? 'HEV' : (tag && tag.base) || '');
    var pkgRaw = String(f.engpkg || '').toUpperCase();
    var pkg = Object.prototype.hasOwnProperty.call(COP_REP_PKG_TAGS, pkgRaw) ? COP_REP_PKG_TAGS[pkgRaw] : (f.engpkg || '');
    return [f.mod || '', disp, tag ? tag.tag : '', elec, pkg, f.tx || ''].filter(function(x) { return x && x !== '0'; }).join(' ');
}

/**
 * El ritmo. PURA. Sobre m.rows (los ensayos que cuentan, con fecha) y m.weekOff
 * ({lunes: nota} de las semanas sin celda, de Plan → Disponibilidad):
 *  - weeks: las 8 semanas que terminan en la del corte, con cuántos ensayos hubo;
 *  - recent: promedio de las últimas 4;
 *  - weeksLeft: semanas con celda desde la siguiente al corte hasta el 31 dic;
 *  - needed: lo que falta ÷ esas semanas;
 *  - finish: el viernes en que se terminaría al ritmo de recent (o null si no alcanza).
 */
function copRepPace(m) {
    var cutMon = copRepMonday(m.cut), counts = {};
    (m.rows || []).forEach(function(r) {
        (r.testDates || []).forEach(function(d) { var k = copRepMonday(d); counts[k] = (counts[k] || 0) + 1; });
    });
    var weeks = [];
    for (var i = 7; i >= 0; i--) {
        var mon = _copRepAddDays(cutMon, -7 * i);
        weeks.push({ monday: mon, week: copRepIsoWeek(mon), n: counts[mon] || 0, off: !!(m.weekOff && m.weekOff[mon] !== undefined) });
    }
    var last4 = weeks.slice(-4);
    var recent = Math.round(last4.reduce(function(s, w) { return s + w.n; }, 0) / 4 * 10) / 10;
    var end = m.year + '-12-31', off = [], avail = [];
    for (var mon2 = _copRepAddDays(cutMon, 7); mon2 <= end; mon2 = _copRepAddDays(mon2, 7)) {
        if (m.weekOff && m.weekOff[mon2] !== undefined) off.push({ monday: mon2, note: String(m.weekOff[mon2] || '') });
        else avail.push(mon2);
    }
    var pending = (m.total && m.total.pending) || 0;
    var needed = avail.length ? Math.round(pending / avail.length * 10) / 10 : (pending ? null : 0);
    var finish = null, late = false;
    if (pending && recent > 0) {
        var k = Math.ceil(pending / recent);
        if (k <= avail.length) finish = _copRepAddDays(avail[k - 1], 4);
        else late = true;
    } else if (pending) late = true;
    return { weeks: weeks, recent: recent, weeksLeft: avail.length, off: off, pending: pending, needed: needed,
             finish: finish, late: late, onTrack: !pending || (needed !== null && recent >= needed) };
}

/** Margen de unidades antes del siguiente lote que se avisa (un lote son 5,000). */
var COP_REP_NEAR_LOT_UNITS = 1000;
/** Con menos de esto por producir en el año, conseguir una unidad es el riesgo. */
var COP_REP_SCARCE_UNITS = 60;

/**
 * La siguiente familia más crítica. PURA. Una familia entra si le falta algo o si un
 * cambio de producción le subiría el REQ. El orden pesa, en este orden:
 *  1. no concordante;
 *  2. pocas unidades por producir (o ninguna en diciembre) con ensayos pendientes:
 *     si no se aparta una unidad ya, puede no haber con qué ensayar;
 *  3. muestreo abierto con el REQ cubierto;
 *  4. cuántos ensayos faltan;
 *  5. cerca del siguiente lote.
 * Devuelve [{key, name, row, score, reasons:[{k, …}]}] de mayor a menor.
 */
function copRepCritical(m) {
    var out = [];
    (m.rows || []).forEach(function(r) {
        var reasons = [], score = 0;
        if (r.status.id === 'fail') { reasons.push({ k: 'fail' }); score += 1000; }
        if (r.pending > 0 && (r.ahead < COP_REP_SCARCE_UNITS || (r.lastProdMonth && r.lastProdMonth < 12))) {
            reasons.push({ k: 'scarce', n: r.ahead, last: r.lastProdMonth }); score += 200 + Math.max(0, COP_REP_SCARCE_UNITS - r.ahead);
        }
        if (r.status.id === 'open') { reasons.push({ k: 'open' }); score += 80; }
        if (r.pending > 0) {
            reasons.push({ k: r.done ? 'pending' : 'todo', p: r.pending, req: r.req }); score += 20 * r.pending + (r.done ? 0 : 10);
        }
        if (r.rule === 'lot' && r.nextLotAt && r.nextLotAt - r.vol <= COP_REP_NEAR_LOT_UNITS && r.nextLotAt - r.vol > 0) {
            reasons.push({ k: 'nearLot', n: r.nextLotAt - r.vol, t: COP_LOT_TESTS }); score += 15;
        }
        if (!reasons.length) return;
        out.push({ key: r.key, name: r.name, row: r, score: score, reasons: reasons });
    });
    out.sort(function(a, b) { return (b.score - a.score) || (b.row.vol - a.row.vol) || (a.name < b.name ? -1 : 1); });
    return out;
}

/**
 * Puntos clave de la semana, como datos (el texto lo pone el idioma). PURA.
 * [{k:'added', n, names[]}, {k:'none'}, {k:'complete', name, done, req},
 *  {k:'req', name, from, to, vol}, {k:'fail', name}, {k:'off', monday, note}]
 */
function copRepHighlights(m) {
    var H = [], rows = m.rows || [];
    var added = rows.filter(function(r) { return r.added > 0; });
    var n = added.reduce(function(s, r) { return s + r.added; }, 0);
    H.push(n ? { k: 'added', n: n, names: added.map(function(r) { return r.name; }), groups: added.map(function(r) { return r.group.id; }) } : { k: 'none' });
    rows.forEach(function(r) {
        var g = r.group.id;
        if (r.status.id === 'fail' && r.prevVerdict !== 'FAIL') H.push({ k: 'fail', name: r.name, group: g });
        if (r.status.id === 'ok' && r.prevStatus && r.prevStatus.id !== 'ok') H.push({ k: 'complete', name: r.name, group: g, done: r.done, req: r.req });
        if (m.prevFromSaved && r.prevReq && r.req !== r.prevReq) H.push({ k: 'req', name: r.name, group: g, from: r.prevReq, to: r.req, vol: r.vol });
    });
    (m.pace && m.pace.off || []).slice(0, 3).forEach(function(o) {
        if (o.monday <= _copRepAddDays(copRepMonday(m.cut), 21)) H.push({ k: 'off', monday: o.monday, note: o.note });
    });
    return H;
}

/** Lo que se guarda de un corte (chico: viaja dentro de cop/current). PURA. */
function copRepCutSnapshot(model, at, by) {
    var rows = {};
    model.rows.forEach(function(r) { rows[r.key] = { vol: r.vol, req: r.req, done: r.done, verdict: r.verdict || null }; });
    return { weekOf: model.weekOf, cut: model.cut, year: model.year, at: at, by: by || '', rows: rows };
}

/** Une los cortes de dos equipos: por semana, gana el guardado más reciente. PURA y simétrica. */
function copRepCutsUnion(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function(src) {
        Object.keys(src).forEach(function(k) {
            var c = src[k];
            if (!c || !k) return;
            var cur = out[k];
            if (!cur || String(c.at || '') > String(cur.at || '') ||
                (String(c.at || '') === String(cur.at || '') && JSON.stringify(c) > JSON.stringify(cur))) out[k] = c;
        });
    });
    var keys = Object.keys(out).sort();
    while (keys.length > COP_REP_CUTS_KEEP) keys.shift();
    var res = {};                                   // orden por semana: el mismo en los dos equipos
    keys.forEach(function(k) { res[k] = out[k]; });
    return res;
}
var COP_REP_CUTS_KEEP = 60;

/** Une las familias excluidas del reporte: por familia gana `at` más reciente. PURA y simétrica. */
function copRepExcludeUnion(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function(src) {
        Object.keys(src).forEach(function(k) {
            var c = src[k], cur = out[k];
            if (!c || !k) return;
            if (!cur || String(c.at || '') > String(cur.at || '') ||
                (String(c.at || '') === String(cur.at || '') && JSON.stringify(c) > JSON.stringify(cur))) out[k] = c;
        });
    });
    return out;
}

/** Une la producción real capturada: por año y familia, gana `updatedAt` más reciente. PURA y simétrica. */
function copRepProdUnion(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function(src) {
        Object.keys(src).forEach(function(y) {
            var fams = src[y] || {};
            out[y] = out[y] || {};
            Object.keys(fams).forEach(function(k) {
                var c = fams[k], cur = out[y][k];
                if (!c || !k) return;
                if (!cur || String(c.updatedAt || '') > String(cur.updatedAt || '') ||
                    (String(c.updatedAt || '') === String(cur.updatedAt || '') && JSON.stringify(c) > JSON.stringify(cur))) out[y][k] = c;
            });
        });
    });
    return out;
}

// ─── El reporte (HTML con estilos LITERALES: pantalla, impresión y correo) ──────
var _COP_REP_MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function _crEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _crNum(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function _crPct(x) { return Math.round((Number(x) || 0) * 100) + '%'; }
function _crDay(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? Number(p[2]) + ' ' + _COP_REP_MONTHS[Number(p[1]) - 1] + ' ' + p[0] : '';
}
// ─── [3.23.0] Idioma del reporte ───────────────────────────────────────────────
// El estatus va a la gerencia y a corporativo en inglés; el laboratorio lo lee en español.
// Las dos versiones salen del MISMO modelo: solo cambia el texto. Default 'es' (la función
// es PURA y sus pruebas leen español); la pantalla y el correo pasan el idioma elegido.
var COP_REP_LANGS = ['en', 'es'];
function _crMonthsList(list) {
    if (!list.length) return '';
    // rangos: [1,2,3,4,5] → "ene–may"
    var out = [], i = 0;
    while (i < list.length) {
        var j = i;
        while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
        out.push(_COP_REP_MONTHS[list[i] - 1] + (j > i ? '–' + _COP_REP_MONTHS[list[j] - 1] : ''));
        i = j + 1;
    }
    return out.join(', ');
}
var _COP_REP_MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function copRepLang(x) { return x === 'en' ? 'en' : 'es'; }
function _crDayL(iso, lang) {
    if (lang !== 'en') return _crDay(iso);
    var p = String(iso || '').split('-');
    return p.length === 3 ? Number(p[2]) + ' ' + _COP_REP_MONTHS_EN[Number(p[1]) - 1] + ' ' + p[0] : '';
}
function _crMonL(i, lang) { return (lang === 'en' ? _COP_REP_MONTHS_EN : _COP_REP_MONTHS)[i - 1] || ''; }
function _crMonthsListL(list, lang) {
    if (lang !== 'en') return _crMonthsList(list);
    var out = [], i = 0;
    while (i < list.length) {
        var j = i;
        while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
        out.push(_crMonL(list[i], 'en') + (j > i ? '–' + _crMonL(list[j], 'en') : ''));
        i = j + 1;
    }
    return out.join(', ');
}
function _crDec(x) { var v = Math.round((Number(x) || 0) * 10) / 10; return String(v); }
function _crPlural(n, one, many) { return n === 1 ? one : many; }

var COP_REP_TXT = {
    es: {
        lab: 'KIA México · Laboratorio de Emisiones',
        title: function(y) { return 'Conformidad de la Producción ' + y; },
        sub: function(w, d) { return 'Estatus al corte · semana ' + w + ' · ' + d + ' &nbsp;|&nbsp; Año calendario (ene–dic), todos los años modelo'; },
        headline: function(T) {
            return '<b>' + _crPct(T.progress) + ' de avance</b>: ' + _crNum(T.covered) + ' de ' + _crNum(T.req) + ' ensayos requeridos y ' +
                   T.ok + ' de ' + T.withReq + ' familias cumplidas. ' +
                   (T.fail ? '<b style="color:#b91c1c;">' + T.fail + ' ' + _crPlural(T.fail, 'familia no concordante', 'familias no concordantes') + '.</b>'
                           : 'Sin resultados no concordantes.');
        },
        kProgress: 'Avance', kTests: 'Ensayos', kPace: 'Ritmo', kFam: 'Familias cumplidas',
        vsLast: function(d) { return d + ' vs. semana anterior'; },
        thisWeek: function(n) { return n ? '<b style="color:#047857;">+' + n + '</b> esta semana' : 'ninguno esta semana'; },
        extra: function(n) { return ' · ' + n + ' de más'; },
        perWeek: '/sem.',
        need: function(n, ok) { return '<span style="color:' + (ok ? '#047857' : '#b91c1c') + ';font-weight:700;">hacen falta ' + n + '/sem.</span> para el 31 dic'; },
        allDone: 'todos los requeridos, hechos',
        noWeeks: 'ya no quedan semanas con celda',
        ncNone: 'ninguna no concordante',
        ncSome: function(n) { return '<b style="color:#b91c1c;">' + n + ' no concordante' + (n > 1 ? 's' : '') + '</b>'; },
        secAttention: 'Requiere atención', secAttentionSub: 'Las familias más críticas, por riesgo y por lo que falta',
        nothingCritical: 'Ninguna familia tiene ensayos pendientes ni riesgo de cambiar de REQ.',
        rFail: 'Resultado NO CONCORDANTE: revisar antes de seguir ensayando.',
        rScarce: function(r) {
            return 'Quedan ~' + _crNum(r.n) + ' unidades por producir' + (r.last && r.last < 12 ? ', la última en ' + _crMonL(r.last, 'es') : '') +
                   ': <b>apartar una unidad ya</b>.';
        },
        rOpen: 'REQ cubierto, pero el muestreo sigue abierto: hace falta otro ensayo.',
        rPending: function(r) { return (r.p === 1 ? 'Falta ' : 'Faltan ') + r.p + ' de ' + r.req + ' ' + _crPlural(r.req, 'ensayo', 'ensayos') + '.'; },
        rTodo: function(r) { return 'Sin iniciar: ' + r.p + ' de ' + r.req + ' ' + _crPlural(r.req, 'ensayo', 'ensayos') + ' por hacer.'; },
        rNearLot: function(r) { return 'A ' + _crNum(r.n) + ' unidades del siguiente lote (+' + r.t + ' ensayos).'; },
        secPace: 'Ensayos por semana', secPaceSub: 'Ensayos CoP que cuentan, por semana de prueba',
        paceText: function(P, lang) {
            if (!P.pending) return 'Todos los ensayos requeridos están hechos.';
            var t = 'Faltan <b>' + P.pending + '</b> ensayos y quedan <b>' + P.weeksLeft + '</b> ' + _crPlural(P.weeksLeft, 'semana', 'semanas') +
                    ' con celda disponible hasta el 31 dic' + (P.needed !== null ? ': hacen falta <b>' + _crDec(P.needed) + ' por semana</b>.' : '.');
            if (P.recent > 0) t += ' Al ritmo de las últimas 4 semanas (' + _crDec(P.recent) + '/sem.) ' +
                (P.finish ? 'se terminaría el <b>' + _crDayL(P.finish, lang) + '</b>.' : '<b style="color:#b91c1c;">no se termina antes del 31 dic</b>.');
            else t += ' <b style="color:#b91c1c;">No hubo ensayos en las últimas 4 semanas.</b>';
            if (P.off.length) t += ' Semanas sin celda: ' + P.off.map(function(o) { return _crDayL(o.monday, lang) + (o.note ? ' (' + _crEsc(o.note) + ')' : ''); }).join(', ') + '.';
            return t;
        },
        weekShort: 'S', legendNeed: function(n) { return 'necesario: ' + n + '/sem.'; }, offShort: 'sin celda',
        secCell: 'Uso de la celda', secCellSub: 'Bloques de prueba de esta semana y el plan de la siguiente',
        cellNow: function(T) {
            return '<b>Esta semana:</b> ' + T.tests + ' de ' + T.blocks + ' bloques con prueba (' + _crPct(T.use) + ')' +
                   (T.unexplained ? ' · <b style="color:#b91c1c;">' + T.unexplained + ' sin explicar</b>' : '') +
                   (T.pending || T.planned ? ' · ' + (T.pending + T.planned) + ' por correr' : '') + '.';
        },
        cellNext: function(st, T) {
            if (st === 'none') return '<b>Semana siguiente:</b> todavía no tiene plan.';
            return '<b>Semana siguiente</b> (' + (st === 'accepted' ? 'plan aceptado' : '<span style="color:#92400e;">propuesta sin aceptar</span>') + '): ' +
                   T.planned + ' ' + _crPlural(T.planned, 'prueba planeada', 'pruebas planeadas') + ' en ' + T.blocks + ' bloques.';
        },
        cellBlock: 'Bloque', cellToday: 'hoy', cellFree: 'libre', cellNotExplained: 'Sin explicar', cellProposal: 'propuesta',
        cellExtra: function(n) { return n + ' ' + _crPlural(n, 'prueba', 'pruebas') + ' de más (sobre la capacidad).'; },
        secKey: 'Puntos clave', secNote: 'Nota del laboratorio',
        hAdded: function(h) { return '<b>+' + h.n + ' ' + _crPlural(h.n, 'ensayo', 'ensayos') + '</b> esta semana: ' + h.names.map(_crEsc).join(', ') + '.'; },
        hNone: 'Sin ensayos nuevos esta semana.',
        hComplete: function(h) { return '<b>' + _crEsc(h.name) + '</b> queda cumplida (' + h.done + '/' + h.req + ').'; },
        hReq: function(h) { return '<b>' + _crEsc(h.name) + '</b>: el REQ pasa de ' + h.from + ' a <b>' + h.to + '</b> (' + _crNum(h.vol) + ' unidades en el año).'; },
        hFail: function(h) { return '<b style="color:#b91c1c;">' + _crEsc(h.name) + ': resultado no concordante.</b>'; },
        hOff: function(h, lang) { return 'Semana del ' + _crDayL(h.monday, lang) + ': <b>celda no disponible</b>' + (h.note ? ' — ' + _crEsc(h.note) : '') + '.'; },
        secStatus: 'Estatus por familia',
        families: function(n) { return n + ' ' + _crPlural(n, 'familia', 'familias'); },
        tests: 'ensayos',
        thFamily: 'Familia', thProdShort: 'Producción', thProd: function(y) { return 'Producción ' + y; }, thReq: 'REQ', thDone: 'Hechas', thProgress: 'Avance', thStatus: 'Estatus',
        toDate: 'a la fecha', yearTotal: function(n) { return 'año: ' + _crNum(n); },
        lastTest: function(d) { return 'último ensayo ' + d; },
        verdict: function(v) { return 'veredicto: ' + (v === 'PASS' ? 'concordante' : v === 'FAIL' ? 'no concordante' : v === 'CONTINUE' ? 'sin decidir' : 'n &lt; 3'); },
        noPlan: 'sin producción en el plan', noModel: '(sin modelo)',
        status: { ok: 'Cumplido', run: 'En progreso', open: 'Muestreo abierto', todo: 'Sin iniciar', fail: 'No concordante', none: 'Sin producción', extra: 'Sin producción' },
        groups: { hev: 'Híbrido', '5dr': '5 puertas', wgn: 'Wagon', '4dr': '4 puertas', otra: 'Otras' },
        regions: { 'EUROPE': 'Europa', 'GENERAL': 'General · EURO-6C', 'MIDDLE EAST': 'Medio Oriente' },
        missing: function(list, real, y) {
            return '<b>Producción incompleta:</b> el plan importado no trae ' + list + ' ' + y +
                   (real ? ' (con producción real capturada en ' + real + ')' : '') + '. Esos meses cuentan como 0 hasta capturar lo producido; el REQ puede subir.';
        },
        noPrev: 'Sin corte guardado de la semana anterior: los ensayos de la semana pasada salen por su fecha de prueba y la producción se compara contra la de hoy.',
        footRule: function(lines) { return '<b>Regla de muestreo</b> (año calendario). ' + lines + ' Los ensayos deben resultar concordantes (UN R154).'; },
        footCounts: function(y) { return '<b>Cuentan</b> los ensayos registrados como conformidad de la producción, aprobados y válidos para CoP, con fecha de prueba en ' + y + ' hasta el corte. El avance suma lo cubierto de cada familia hasta su REQ: los ensayos de más en una familia no cubren a otra.'; },
        footReq: 'El REQ sale de la producción esperada del año completo (lo producido + lo planeado).',
        footCompare: function(d, saved) { return 'Comparación contra el corte del ' + d + (saved ? ' (corte guardado)' : '') + '.'; },
        footGen: function(at, by) { return ' Generado ' + at + (by ? ' por ' + by : '') + '.'; },
        ruleText: function(rule) { return copYearRuleText(rule); },
        prod: function(m) { return copRepProductionText(m); }
    },
    en: {
        lab: 'KIA Mexico · Emissions Laboratory',
        title: function(y) { return 'Conformity of Production ' + y; },
        sub: function(w, d) { return 'Status as of ' + d + ' · week ' + w + ' &nbsp;|&nbsp; Calendar year (Jan–Dec), all model years'; },
        headline: function(T) {
            return '<b>' + _crPct(T.progress) + ' complete</b>: ' + _crNum(T.covered) + ' of ' + _crNum(T.req) + ' required tests done and ' +
                   T.ok + ' of ' + T.withReq + ' families complete. ' +
                   (T.fail ? '<b style="color:#b91c1c;">' + T.fail + ' non-conforming ' + _crPlural(T.fail, 'family', 'families') + '.</b>'
                           : 'No non-conforming results.');
        },
        kProgress: 'Progress', kTests: 'Tests', kPace: 'Pace', kFam: 'Families complete',
        vsLast: function(d) { return d + ' vs. last week'; },
        thisWeek: function(n) { return n ? '<b style="color:#047857;">+' + n + '</b> this week' : 'none this week'; },
        extra: function(n) { return ' · ' + n + ' extra'; },
        perWeek: '/wk',
        need: function(n, ok) { return '<span style="color:' + (ok ? '#047857' : '#b91c1c') + ';font-weight:700;">' + n + '/wk needed</span> to close by Dec 31'; },
        allDone: 'all required tests done',
        noWeeks: 'no cell weeks left this year',
        ncNone: 'no non-conforming',
        ncSome: function(n) { return '<b style="color:#b91c1c;">' + n + ' non-conforming</b>'; },
        secAttention: 'Needs attention', secAttentionSub: 'Most critical families, by risk and by tests to go',
        nothingCritical: 'No family has pending tests or is close to a higher requirement.',
        rFail: 'NON-CONFORMING result: review before testing further.',
        rScarce: function(r) {
            return 'Only ~' + _crNum(r.n) + ' units left to build' + (r.last && r.last < 12 ? ', last ones in ' + _crMonL(r.last, 'en') : '') +
                   ': <b>reserve a unit now</b>.';
        },
        rOpen: 'Requirement met, but sampling is still open: one more test needed.',
        rPending: function(r) { return r.p + ' of ' + r.req + ' ' + _crPlural(r.req, 'test', 'tests') + ' to go.'; },
        rTodo: function(r) { return 'Not started: ' + r.p + ' of ' + r.req + ' ' + _crPlural(r.req, 'test', 'tests') + ' to go.'; },
        rNearLot: function(r) { return _crNum(r.n) + ' units from the next lot (+' + r.t + ' tests).'; },
        secPace: 'Tests per week', secPaceSub: 'CoP tests that count, by test week',
        paceText: function(P, lang) {
            if (!P.pending) return 'All required tests are done.';
            var t = '<b>' + P.pending + '</b> tests to go and <b>' + P.weeksLeft + '</b> ' + _crPlural(P.weeksLeft, 'week', 'weeks') +
                    ' with the cell available until Dec 31' + (P.needed !== null ? ': <b>' + _crDec(P.needed) + ' per week</b> needed.' : '.');
            if (P.recent > 0) t += ' At the last 4 weeks’ pace (' + _crDec(P.recent) + '/wk) we would finish ' +
                (P.finish ? 'on <b>' + _crDayL(P.finish, lang) + '</b>.' : '<b style="color:#b91c1c;">after Dec 31</b>.');
            else t += ' <b style="color:#b91c1c;">No tests in the last 4 weeks.</b>';
            if (P.off.length) t += ' Weeks without the cell: ' + P.off.map(function(o) { return _crDayL(o.monday, lang) + (o.note ? ' (' + _crEsc(o.note) + ')' : ''); }).join(', ') + '.';
            return t;
        },
        weekShort: 'W', legendNeed: function(n) { return 'needed: ' + n + '/wk'; }, offShort: 'no cell',
        secCell: 'Cell use', secCellSub: 'Test blocks this week and next week’s plan',
        cellNow: function(T) {
            return '<b>This week:</b> ' + T.tests + ' of ' + T.blocks + ' test blocks used (' + _crPct(T.use) + ')' +
                   (T.unexplained ? ' · <b style="color:#b91c1c;">' + T.unexplained + ' not explained</b>' : '') +
                   (T.pending || T.planned ? ' · ' + (T.pending + T.planned) + ' still to run' : '') + '.';
        },
        cellNext: function(st, T) {
            if (st === 'none') return '<b>Next week:</b> no plan yet.';
            return '<b>Next week</b> (' + (st === 'accepted' ? 'plan accepted' : '<span style="color:#92400e;">proposal, not accepted yet</span>') + '): ' +
                   T.planned + ' ' + _crPlural(T.planned, 'test', 'tests') + ' planned in ' + T.blocks + ' blocks.';
        },
        cellBlock: 'Block', cellToday: 'today', cellFree: 'free', cellNotExplained: 'Not explained', cellProposal: 'proposal',
        cellExtra: function(n) { return n + ' extra ' + _crPlural(n, 'test', 'tests') + ' (over capacity).'; },
        secKey: 'Key points', secNote: 'Note from the lab',
        hAdded: function(h) { return '<b>+' + h.n + ' ' + _crPlural(h.n, 'test', 'tests') + '</b> this week: ' + h.names.map(_crEsc).join(', ') + '.'; },
        hNone: 'No new tests this week.',
        hComplete: function(h) { return '<b>' + _crEsc(h.name) + '</b> is now complete (' + h.done + '/' + h.req + ').'; },
        hReq: function(h) { return '<b>' + _crEsc(h.name) + '</b> now needs <b>' + h.to + '</b> tests (was ' + h.from + '): ' + _crNum(h.vol) + ' units expected this year.'; },
        hFail: function(h) { return '<b style="color:#b91c1c;">' + _crEsc(h.name) + ': non-conforming result.</b>'; },
        hOff: function(h, lang) { return 'Week of ' + _crDayL(h.monday, lang) + ': <b>cell not available</b>' + (h.note ? ' — ' + _crEsc(h.note) : '') + '.'; },
        secStatus: 'Status by family',
        families: function(n) { return n + ' ' + _crPlural(n, 'family', 'families'); },
        tests: 'tests',
        thFamily: 'Family', thProdShort: 'Production', thProd: function(y) { return 'Production ' + y; }, thReq: 'Required', thDone: 'Done', thProgress: 'Progress', thStatus: 'Status',
        toDate: 'to date', yearTotal: function(n) { return 'year: ' + _crNum(n); },
        lastTest: function(d) { return 'last test ' + d; },
        verdict: function(v) { return 'verdict: ' + (v === 'PASS' ? 'conforming' : v === 'FAIL' ? 'non-conforming' : v === 'CONTINUE' ? 'not decided yet' : 'n &lt; 3'); },
        noPlan: 'no production in the plan', noModel: '(no model)',
        status: { ok: 'Complete', run: 'In progress', open: 'Sampling open', todo: 'Not started', fail: 'Non-conforming', none: 'No production', extra: 'No production' },
        groups: { hev: 'Hybrid', '5dr': '5-door', wgn: 'Wagon', '4dr': '4-door', otra: 'Other' },
        regions: { 'EUROPE': 'Europe', 'GENERAL': 'General · EURO-6C', 'MIDDLE EAST': 'Middle East' },
        missing: function(list, real, y) {
            return '<b>Production incomplete:</b> the imported plan has no data for ' + list + ' ' + y +
                   (real ? ' (actuals entered for ' + real + ')' : '') + '. Those months count as 0 until entered; the requirement may go up.';
        },
        noPrev: 'No saved cut from last week: last week’s tests are taken by test date and production is compared against today’s.',
        footRule: function(lines) { return '<b>Sampling rule</b> (calendar year). ' + lines + ' Tests must be conforming (UN R154).'; },
        footCounts: function(y) { return '<b>Counted:</b> tests registered as conformity of production, approved and valid for CoP, with a test date in ' + y + ' up to the cut. Progress adds each family up to its requirement: extra tests in one family do not cover another.'; },
        footReq: 'Required tests come from the expected production for the full year (built + planned).',
        footCompare: function(d, saved) { return 'Compared against the cut of ' + d + (saved ? ' (saved cut)' : '') + '.'; },
        footGen: function(at, by) { return ' Generated ' + at + (by ? ' by ' + by : '') + '.'; },
        ruleText: function(rule) {
            return rule === 'one' ? '1 test per family produced in the year'
                : 'up to 7,500 units built, 3 tests; 7,501 to 12,500, 6; 3 more for every additional 5,000 units (or fraction)';
        },
        prod: function(m) {
            var hb = Number(m.histBoundary) || 0;
            if (!hb) return '<b>Production ' + m.year + '</b>: sum of the months in the production plan' +
                (m.realMonths && m.realMonths.length ? ' (actuals entered for ' + _crMonthsListL(m.realMonths, 'en') + ')' : '') + '.';
            var t = '<b>Production ' + m.year + '</b>: built from January to ' + _crEsc(_crDayL(m.histAsOf, 'en')) + ' (production history)';
            if (hb <= 12) t += ' + planned from ' + _crMonL(hb, 'en') + ' to Dec';
            return t + '.';
        }
    }
};

var COP_REP_TONE = {
    ok:    { fg: '#065f46', bg: '#d1fae5', bar: '#059669' },
    run:   { fg: '#1e3a8a', bg: '#dbeafe', bar: '#2563eb' },
    open:  { fg: '#92400e', bg: '#fef3c7', bar: '#d97706' },
    todo:  { fg: '#9f1239', bg: '#ffe4e6', bar: '#e11d48' },
    fail:  { fg: '#991b1b', bg: '#fee2e2', bar: '#dc2626' },
    none:  { fg: '#475569', bg: '#e2e8f0', bar: '#94a3b8' },
    extra: { fg: '#475569', bg: '#e2e8f0', bar: '#94a3b8' }
};
var _CR_NAVY = '#05141f', _CR_RED = '#bb162b', _CR_INK = '#0f172a', _CR_MUTED = '#64748b', _CR_LINE = '#e2e8f0', _CR_SOFT = '#f8fafc';
var _CR_FONT = "font-family:'Segoe UI',Helvetica,Arial,sans-serif;";

/** Delta con signo y color (n en las unidades que se pasen). PURA. */
function _crDelta(n, unit) {
    var v = Math.round((Number(n) || 0) * 10) / 10;
    if (!v) return '<span style="color:#94a3b8;">—</span>';
    return '<span style="color:' + (v > 0 ? '#047857' : '#b91c1c') + ';font-weight:700;">' + (v > 0 ? '+' : '−') + Math.abs(v) + (unit || '') + '</span>';
}
/**
 * Barra de avance que Outlook de escritorio sí pinta: una tabla de dos celdas con ancho fijo
 * (Outlook ignora div con position/height y los gradientes).
 */
function _crBar(p, color, w) {
    w = w || 120;
    var pct = Math.max(0, Math.min(100, Math.round((Number(p) || 0) * 100)));
    var on = Math.round(w * pct / 100), off = w - on;
    var cell = function(width, bg) {
        return '<td width="' + width + '" height="8" bgcolor="' + bg + '" style="width:' + width + 'px;height:8px;background:' + bg +
               ';font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>';
    };
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="' + w + '" style="width:' + w + 'px;border-collapse:collapse;"><tr>' +
           (on > 0 ? cell(on, color) : '') + (off > 0 ? cell(off, _CR_LINE) : '') + '</tr></table>';
}
function _crPill(id, X) {
    var t = COP_REP_TONE[id] || COP_REP_TONE.none;
    return '<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;color:' + t.fg +
           ';background-color:' + t.bg + ';">' + _crEsc((X.status && X.status[id]) || id) + '</span>';
}
function _crSection(title, sub) {
    return '<tr><td style="padding:24px 24px 8px;">' +
           '<div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:' + _CR_RED + ';">' + title + '</div>' +
           (sub ? '<div style="font-size:12px;color:' + _CR_MUTED + ';margin-top:2px;">' + sub + '</div>' : '') + '</td></tr>';
}
function _crFamName(r, X) { return _crEsc(r.name || '') || X.noModel; }
function _crReasonText(rs, X) {
    if (rs.k === 'fail') return X.rFail;
    if (rs.k === 'scarce') return X.rScarce(rs);
    if (rs.k === 'open') return X.rOpen;
    if (rs.k === 'pending') return X.rPending(rs);
    if (rs.k === 'todo') return X.rTodo(rs);
    if (rs.k === 'nearLot') return X.rNearLot(rs);
    return '';
}
function _crHighlightText(hl, X, lang) {
    // La carrocería no va en el nombre corto (es el grupo de la tabla): aquí sí hace falta.
    var withG = function(name, g) { return (name || X.noModel) + (g && X.groups[g] ? ' ' + X.groups[g] : ''); };
    if (hl.names) hl = Object.assign({}, hl, { names: hl.names.map(function(nm, i) { return withG(nm, hl.groups && hl.groups[i]); }) });
    else if (hl.name !== undefined) hl = Object.assign({}, hl, { name: withG(hl.name, hl.group) });
    if (hl.k === 'added') return X.hAdded(hl);
    if (hl.k === 'none') return X.hNone;
    if (hl.k === 'complete') return X.hComplete(hl);
    if (hl.k === 'req') return X.hReq(hl);
    if (hl.k === 'fail') return X.hFail(hl);
    if (hl.k === 'off') return X.hOff(hl, lang);
    return '';
}

/** [3.24.0] Color de un bloque en el correo (relleno, texto). */
var _CR_BLK = { prueba: ['#d1fae5', '#065f46'], motivo: ['#fef3c7', '#92400e'], auto: ['#fef3c7', '#92400e'], planeada: ['#dbeafe', '#1e3a8a'],
                libre: ['#f8fafc', '#94a3b8'], pendiente: ['#f1f5f9', '#475569'], 'sin-explicar': ['#fee2e2', '#991b1b'] };

/** El día de una columna de bloques: "Tue 20 Oct" / "Mar 20 oct". PURA. */
function _crBlockDay(iso, lang) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return '';
    var wd = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
    var D = lang === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return D[wd] + ' ' + Number(p[2]) + ' ' + _crMonL(Number(p[1]), lang);
}

/** Un bloque en el correo: la familia, el motivo, o el estado. Sin VIN. PURA. */
function _crBlockText(b, X, lang) {
    if (b.state === 'prueba') return '✓ ' + _crEsc(b.fam);
    if (b.state === 'motivo' || b.state === 'auto') {
        var R = typeof tpBlockReason === 'function' ? tpBlockReason(b.reason) : null;
        return _crEsc(R ? (lang === 'en' ? R.en : R.es) : b.reason);
    }
    if (b.state === 'planeada') return _crEsc(b.fam) + (b.proposal ? ' <i>(' + X.cellProposal + ')</i>' : '');
    if (b.state === 'sin-explicar') return '<b>' + X.cellNotExplained + '</b>';
    if (b.state === 'pendiente') return X.cellToday;
    return X.cellFree;
}

/** La semana como tabla: columnas = días de prueba, renglones = bloques (Outlook la pinta). PURA. */
function _crBlocksTable(wk, X, lang) {
    var days = wk.days || [], maxN = days.reduce(function(s, d) { return Math.max(s, d.blocks.length); }, 0);
    if (!days.length) return '';
    var w = Math.floor(100 / days.length);
    var h = '<table role="presentation" class="cr-blocks" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr>';
    days.forEach(function(d) {
        h += '<td width="' + w + '%" style="width:' + w + '%;padding:6px 6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:' + _CR_MUTED +
             ';border-bottom:2px solid ' + _CR_LINE + ';">' + _crEsc(_crBlockDay(d.iso, lang)) + '</td>';
    });
    h += '</tr>';
    for (var k = 0; k < maxN; k++) {
        h += '<tr>';
        days.forEach(function(d) {
            var b = d.blocks[k];
            if (!b) { h += '<td style="padding:3px;"></td>'; return; }
            var c = _CR_BLK[b.state] || _CR_BLK.libre;
            h += '<td valign="top" style="padding:3px;vertical-align:top;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>' +
                 '<td bgcolor="' + c[0] + '" style="background:' + c[0] + ';color:' + c[1] + ';border-radius:6px;padding:6px 8px;font-size:12px;line-height:1.35;word-wrap:break-word;">' +
                 _crBlockText(b, X, lang) + '</td></tr></table></td>';
        });
        h += '</tr>';
    }
    return h + '</table>';
}

/** Barras de ensayos por semana (tablas: así las pinta Outlook). PURA. */
function _crPaceChart(P, X) {
    var H = 64;
    var max = Math.max(1, P.needed || 0, Math.max.apply(null, P.weeks.map(function(w) { return w.n; })));
    var h = '<table role="presentation" class="cr-chart" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>';
    P.weeks.forEach(function(w) {
        var bh = w.n ? Math.max(3, Math.round(H * w.n / max)) : 0;
        var color = w.off ? '#cbd5e1' : (P.needed && w.n >= P.needed ? '#059669' : '#2563eb');
        h += '<td align="center" valign="bottom" width="12%" style="padding:0 4px;vertical-align:bottom;">' +
             '<div style="font-size:12px;font-weight:700;color:' + _CR_INK + ';">' + (w.off && !w.n ? '–' : w.n) + '</div>' +
             '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr>' +
             '<td height="' + H + '" valign="bottom" style="height:' + H + 'px;vertical-align:bottom;border-bottom:2px solid ' + _CR_LINE + ';">' +
             (bh ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="70%" align="center" style="border-collapse:collapse;margin:0 auto;"><tr>' +
                   '<td height="' + bh + '" bgcolor="' + color + '" style="height:' + bh + 'px;background:' + color + ';font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr></table>' : '') +
             '</td></tr></table>' +
             '<div style="font-size:11px;color:' + _CR_MUTED + ';margin-top:4px;">' + X.weekShort + w.week + (w.off ? '<br>' + X.offShort : '') + '</div></td>';
    });
    h += '</tr></table>';
    if (P.needed) h += '<div style="font-size:11px;color:' + _CR_MUTED + ';margin-top:6px;">' +
                       '<span style="display:inline-block;width:10px;height:10px;background:#059669;vertical-align:middle;"></span> ≥ ' + X.legendNeed(_crDec(P.needed)) +
                       ' &nbsp; <span style="display:inline-block;width:10px;height:10px;background:#2563eb;vertical-align:middle;"></span> &lt; ' + X.legendNeed(_crDec(P.needed)) + '</div>';
    return h;
}

/**
 * El reporte gerencial. PURA (mismo modelo → mismo texto). Estilos literales y maquetado con
 * tablas: sale por correo (Outlook de escritorio no entiende flex, grid, position ni
 * gradientes) e impreso. opts = {generatedAt, generatedBy, lang: 'es'|'en'}.
 * Orden: lo que se decide primero (avance, ritmo, lo crítico) y el detalle al final.
 */
function copYearReportHTML(m, opts) {
    opts = opts || {};
    var lang = copRepLang(opts.lang), X = COP_REP_TXT[lang];
    var T = m.total, P = m.pace || copRepPace(m), C = m.critical || copRepCritical(m), HL = m.highlights || copRepHighlights(m);
    var h = '<!--[if mso]><table role="presentation" width="760" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->';
    h += '<table role="presentation" class="cr-wrap" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="' + _CR_FONT +
         'width:100%;max-width:760px;margin:0 auto;background:#ffffff;border-collapse:collapse;color:' + _CR_INK + ';border:1px solid ' + _CR_LINE + ';">';
    // ── Encabezado
    h += '<tr><td bgcolor="' + _CR_NAVY + '" style="background:' + _CR_NAVY + ';padding:20px 24px 16px;">' +
         '<div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#93c5fd;font-weight:700;">' + X.lab + '</div>' +
         '<div style="font-size:24px;line-height:1.25;font-weight:800;color:#ffffff;margin-top:6px;">' + X.title(m.year) + '</div>' +
         '<div style="font-size:13px;color:#cbd5e1;margin-top:4px;">' + X.sub(m.week, _crEsc(_crDayL(m.cut, lang))) + '</div></td></tr>';
    h += '<tr><td height="4" bgcolor="' + _CR_RED + '" style="height:4px;background:' + _CR_RED + ';font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>';
    // ── La frase
    h += '<tr><td style="padding:18px 24px 4px;font-size:16px;line-height:1.5;color:' + _CR_INK + ';">' + X.headline(T) + '</td></tr>';
    // ── Indicadores
    var extra = T.done > T.covered ? X.extra(T.done - T.covered) : '';
    var paceDetail = !P.pending ? X.allDone : (P.needed === null ? '<span style="color:#b91c1c;font-weight:700;">' + X.noWeeks + '</span>' : X.need(_crDec(P.needed), P.onTrack));
    var tiles = [
        { k: X.kProgress, v: _crPct(T.progress), bar: _crBar(T.progress, '#2563eb', 130), d: X.vsLast(_crDelta(T.deltaPp, ' pp')) },
        { k: X.kTests, v: _crNum(T.covered) + '<span style="font-size:15px;color:' + _CR_MUTED + ';font-weight:600;"> / ' + _crNum(T.req) + '</span>', d: X.thisWeek(T.added) + extra },
        { k: X.kPace, v: _crDec(P.recent) + '<span style="font-size:15px;color:' + _CR_MUTED + ';font-weight:600;">' + X.perWeek + '</span>', d: paceDetail },
        { k: X.kFam, v: T.ok + '<span style="font-size:15px;color:' + _CR_MUTED + ';font-weight:600;"> / ' + T.withReq + '</span>', d: T.fail ? X.ncSome(T.fail) : X.ncNone }
    ];
    h += '<tr><td style="padding:10px 16px 0;"><table role="presentation" class="cr-tiles" width="100%" cellpadding="0" cellspacing="8" border="0" style="width:100%;"><tr>';
    tiles.forEach(function(t) {
        h += '<td class="cr-tile" width="25%" valign="top" bgcolor="' + _CR_SOFT + '" style="width:25%;vertical-align:top;background:' + _CR_SOFT +
             ';border:1px solid ' + _CR_LINE + ';border-radius:10px;padding:12px 14px;">' +
             '<div style="font-size:11px;color:' + _CR_MUTED + ';text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">' + t.k + '</div>' +
             '<div style="font-size:26px;line-height:1.15;font-weight:800;color:' + _CR_NAVY + ';margin-top:4px;">' + t.v + '</div>' +
             (t.bar ? '<div style="margin-top:8px;">' + t.bar + '</div>' : '') +
             '<div style="font-size:12px;line-height:1.4;color:#475569;margin-top:6px;">' + t.d + '</div></td>';
    });
    h += '</tr></table></td></tr>';
    // ── Avisos de datos
    var notes = [];
    if (m.missingMonths.length) notes.push(X.missing(_crMonthsListL(m.missingMonths, lang), m.realMonths.length ? _crMonthsListL(m.realMonths, lang) : '', m.year));
    if (!m.prevFromSaved) notes.push(X.noPrev);
    if (notes.length) {
        h += '<tr><td style="padding:8px 24px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
             '<td bgcolor="#fffbeb" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;color:#78350f;font-size:12px;line-height:1.5;">⚠ ' +
             notes.join('<br>⚠ ') + '</td></tr></table></td></tr>';
    }
    // ── Requiere atención
    h += _crSection(X.secAttention, X.secAttentionSub);
    var top = C.slice(0, 5);
    if (!top.length) {
        h += '<tr><td style="padding:0 24px;font-size:13px;color:#475569;">' + X.nothingCritical + '</td></tr>';
    } else {
        h += '<tr><td style="padding:0 24px;"><table role="presentation" class="cr-att" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">';
        top.forEach(function(c, i) {
            var r = c.row, tone = COP_REP_TONE[r.status.id] || COP_REP_TONE.none;
            var lead = c.reasons[0].k === 'fail' || c.reasons[0].k === 'scarce' ? '#b91c1c' : _CR_NAVY;
            h += '<tr><td width="34" valign="top" style="width:34px;padding:10px 0;border-top:1px solid ' + _CR_LINE + ';vertical-align:top;">' +
                 '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="24" height="24" align="center" bgcolor="' + lead +
                 '" style="width:24px;height:24px;background:' + lead + ';border-radius:12px;color:#ffffff;font-size:12px;font-weight:800;text-align:center;">' + (i + 1) + '</td></tr></table></td>' +
                 '<td valign="top" style="padding:10px 8px;border-top:1px solid ' + _CR_LINE + ';vertical-align:top;">' +
                 '<div style="font-size:14px;font-weight:800;color:' + _CR_INK + ';">' + _crFamName(r, X) +
                 ' <span style="font-size:12px;font-weight:600;color:' + _CR_MUTED + ';">· ' + _crEsc((X.regions[r.region] || r.region) + ' · ' + (X.groups[r.group.id] || r.group.label)) + '</span></div>' +
                 '<div style="font-size:13px;line-height:1.5;color:#334155;margin-top:2px;">' + c.reasons.map(function(rs) { return _crReasonText(rs, X); }).join(' ') + '</div></td>' +
                 '<td width="70" align="right" valign="top" style="width:70px;padding:10px 0;border-top:1px solid ' + _CR_LINE + ';vertical-align:top;text-align:right;white-space:nowrap;">' +
                 '<div style="font-size:16px;font-weight:800;color:' + tone.fg + ';">' + Math.min(r.done, r.req || r.done) + '/' + r.req + '</div></td></tr>';
        });
        h += '</table></td></tr>';
    }
    // ── Ritmo
    h += _crSection(X.secPace, X.secPaceSub);
    h += '<tr><td style="padding:0 24px;">' + _crPaceChart(P, X) +
         '<div style="font-size:13px;line-height:1.55;color:#334155;margin-top:10px;">' + X.paceText(P, lang) + '</div></td></tr>';
    // ── [3.24.0] Uso de la celda: esta semana y la siguiente, bloque por bloque
    if (m.cell && m.cell.now && m.cell.now.total.blocks) {
        h += _crSection(X.secCell, X.secCellSub);
        h += '<tr><td style="padding:0 24px;font-size:13px;line-height:1.55;color:#334155;">' + X.cellNow(m.cell.now.total) +
             (m.cell.now.extra ? ' ' + X.cellExtra(m.cell.now.extra) : '') + '</td></tr>';
        h += '<tr><td style="padding:6px 24px 0;">' + _crBlocksTable(m.cell.now, X, lang) + '</td></tr>';
        if (m.cell.next) {
            h += '<tr><td style="padding:14px 24px 0;font-size:13px;line-height:1.55;color:#334155;">' + X.cellNext(m.cell.next.planState, m.cell.next.total) + '</td></tr>';
            if (m.cell.next.planState !== 'none') h += '<tr><td style="padding:6px 24px 0;">' + _crBlocksTable(m.cell.next, X, lang) + '</td></tr>';
        }
    }
    // ── Puntos clave y nota del laboratorio
    h += _crSection(X.secKey);
    h += '<tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">';
    HL.forEach(function(hl) {
        h += '<tr><td width="16" valign="top" style="width:16px;vertical-align:top;color:' + _CR_RED + ';font-size:14px;line-height:1.5;">•</td>' +
             '<td valign="top" style="vertical-align:top;font-size:13px;line-height:1.5;color:#334155;padding-bottom:4px;">' + _crHighlightText(hl, X, lang) + '</td></tr>';
    });
    h += '</table></td></tr>';
    if (m.note) {
        h += '<tr><td style="padding:10px 24px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
             '<td bgcolor="#eff6ff" style="background:#eff6ff;border-left:4px solid #2563eb;padding:10px 14px;font-size:13px;line-height:1.55;color:#1e3a8a;">' +
             '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">' + X.secNote + '</div>' +
             _crEsc(m.note.text).replace(/\n/g, '<br>') + '</td></tr></table></td></tr>';
    }
    // ── Estatus por familia
    h += _crSection(X.secStatus);
    m.regions.forEach(function(rg) {
        var R = rg.total;
        h += '<tr><td style="padding:6px 24px 0;">' +
             '<table role="presentation" class="cr-rh" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
             '<td style="font-size:16px;font-weight:800;color:' + _CR_NAVY + ';">' + _crEsc(X.regions[rg.id] || rg.label) +
             ' <span style="font-size:12px;color:' + _CR_MUTED + ';font-weight:600;">· ' + X.families(R.families) + '</span></td>' +
             '<td align="right" style="text-align:right;font-size:13px;color:#334155;white-space:nowrap;"><b>' + _crPct(R.progress) + '</b> · ' +
             _crNum(R.covered) + '/' + _crNum(R.req) + ' ' + X.tests + '</td></tr></table>';
        h += '<table role="presentation" class="cr-fam" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;margin-top:8px;font-size:13px;">';
        // Anchos fijos: las tablas de cada región quedan alineadas entre sí.
        var th = function(t, al, w) {
            return '<th align="' + al + '" width="' + w + '" style="width:' + w + ';text-align:' + al + ';padding:8px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;vertical-align:bottom;">' + t + '</th>';
        };
        h += '<tr class="cr-head" bgcolor="#f1f5f9" style="background:#f1f5f9;">' + th(X.thFamily, 'left', '34%') +
             th(X.thProdShort + '<div style="font-weight:600;text-transform:none;letter-spacing:0;color:' + _CR_MUTED + ';">' + m.year + ', ' + X.toDate + '</div>', 'right', '17%') +
             th(X.thReq, 'right', '10%') + th(X.thDone, 'right', '9%') + th(X.thProgress, 'left', '16%') + th(X.thStatus, 'left', '14%') + '</tr>';
        var lastGroup = null;
        rg.rows.forEach(function(r) {
            if (r.group.id !== lastGroup) {
                lastGroup = r.group.id;
                h += '<tr class="cr-grp"><td colspan="6" style="padding:12px 8px 4px;font-size:11px;font-weight:800;color:' + _CR_RED +
                     ';text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid ' + _CR_LINE + ';">' + _crEsc(X.groups[r.group.id] || r.group.label) + '</td></tr>';
            }
            var tone = COP_REP_TONE[r.status.id] || COP_REP_TONE.none;
            var sub = [];
            if (r.mys.length) sub.push('MY ' + r.mys.map(function(x) { return String(x).replace(/\s*MODEL/i, ''); }).join(' + '));
            if (r.lastTest) sub.push(X.lastTest(_crEsc(_crDayL(r.lastTest, lang))));
            if (r.verdict || r.done) sub.push(X.verdict(r.verdict));
            if (r.noPlan) sub.push(X.noPlan);
            var td = 'padding:9px 8px;vertical-align:top;border-bottom:1px solid #f1f5f9;';
            h += '<tr class="cr-row">' +
                 '<td class="cr-name" style="' + td + '"><div style="font-weight:700;color:' + _CR_INK + ';">' + _crFamName(r, X) + '</div>' +
                 '<div style="font-size:11px;color:' + _CR_MUTED + ';margin-top:2px;">' + sub.join(' · ') + '</div></td>' +
                 '<td data-l="' + X.thProd(m.year) + '" align="right" style="' + td + 'text-align:right;white-space:nowrap;"><b>' + _crNum(r.volToDate) + '</b>' +
                 (r.vol !== r.volToDate ? '<div style="font-size:11px;color:' + _CR_MUTED + ';">' + X.yearTotal(r.vol) + '</div>' : '') + '</td>' +
                 '<td data-l="' + X.thReq + '" align="right" style="' + td + 'text-align:right;font-weight:700;">' + r.req +
                 (m.prevFromSaved && r.prevReq && r.req !== r.prevReq ? '<div style="font-size:11px;">' + _crDelta(r.req - r.prevReq, '') + '</div>' : '') + '</td>' +
                 '<td data-l="' + X.thDone + '" align="right" style="' + td + 'text-align:right;font-weight:700;">' + r.done +
                 (r.added ? '<div style="font-size:11px;">' + _crDelta(r.added, '') + '</div>' : '') + '</td>' +
                 '<td class="cr-bar" data-l="' + X.thProgress + '" style="' + td + '">' + _crBar(r.progress, tone.bar, 96) +
                 '<div style="font-size:11px;color:#475569;margin-top:3px;">' + _crPct(r.progress) + '</div></td>' +
                 '<td class="cr-st" data-l="' + X.thStatus + '" style="' + td + '">' + _crPill(r.status.id, X) + '</td></tr>';
        });
        h += '</table></td></tr>';
    });
    if (!m.rows.length) {
        h += '<tr><td style="padding:16px 24px;text-align:center;color:' + _CR_MUTED + ';">' +
             (lang === 'en' ? 'No CoP families with production or tests in ' + m.year + '.' : 'No hay familias del alcance CoP con producción o ensayos en ' + m.year + '.') + '</td></tr>';
    }
    // ── Notas de método
    var ruleLines = m.regions.filter(function(rg) { return rg.rows.length; }).map(function(rg) {
        return '<b>' + _crEsc(X.regions[rg.id] || rg.label) + ':</b> ' + rg.rules.map(X.ruleText).join('; ') + '.';
    });
    var foot = [X.footRule(ruleLines.length ? ruleLines.join(' ') : X.ruleText('lot') + '.'), X.prod(m), X.footReq, X.footCounts(m.year)];
    h += '<tr><td style="padding:22px 24px 18px;"><div style="border-top:1px solid ' + _CR_LINE + ';padding-top:12px;font-size:11px;line-height:1.6;color:' + _CR_MUTED + ';">' +
         foot.join('<br>') + '<br>' + X.footCompare(_crEsc(_crDayL(m.prevCut, lang)), m.prevFromSaved) +
         (opts.generatedAt ? X.footGen(_crEsc(opts.generatedAt), opts.generatedBy ? _crEsc(opts.generatedBy) : '') : '') + '</div></td></tr>';
    h += '<tr><td height="8" bgcolor="' + _CR_NAVY + '" style="height:8px;background:' + _CR_NAVY + ';font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>';
    h += '</table><!--[if mso]></td></tr></table><![endif]-->';
    return h;
}

/** [3.22.0] De dónde sale la columna de producción, dicho en una línea. PURA. */
function copRepProductionText(m) {
    var hb = Number(m.histBoundary) || 0;
    if (!hb) return '<b>Producción ' + m.year + '</b>: suma de los meses del plan de producción' +
                    (m.realMonths && m.realMonths.length ? ' (con producción real capturada en ' + _crMonthsList(m.realMonths) + ')' : '') + '.';
    var t = '<b>Producción ' + m.year + '</b>: lo producido de enero al ' + _crEsc(_crDay(m.histAsOf)) +
            ' (acumulado del plan de producción)';
    if (hb <= 12) t += ' + lo planeado de ' + _COP_REP_MONTHS[hb - 1] + ' a dic';
    return t + '.';
}

/** Documento completo (para imprimir, descargar o abrir aparte). PURA. */
function copYearReportDocument(m, opts) {
    var lang = copRepLang(opts && opts.lang);
    return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
           '<title>CoP ' + m.year + ' — ' + (lang === 'en' ? 'week ' : 'semana ') + m.week + '</title>' +
           '<style>@page{size:letter portrait;margin:10mm}body{margin:0;padding:16px;background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
           '@media print{body{padding:0;background:#ffffff}.cr-wrap{border:0!important}tr{page-break-inside:avoid}}' +
           // En pantalla angosta: indicadores de dos en dos y una tarjeta por familia (el correo
           // ignora estas reglas y se queda con las tablas, que es lo que se lee en Outlook).
           '@media screen and (max-width:640px){body{padding:6px}' +
           '.cr-tiles,.cr-tiles tbody,.cr-tiles tr{display:block}' +
           '.cr-tiles td.cr-tile{display:inline-block!important;width:47%!important;box-sizing:border-box;margin:1.5%;vertical-align:top}' +
           '.cr-rh,.cr-rh tbody,.cr-rh tr,.cr-rh td{display:block;text-align:left!important}' +
           '.cr-fam,.cr-fam tbody{display:block}.cr-fam .cr-head{display:none}.cr-fam .cr-grp,.cr-fam .cr-grp td{display:block}' +
           '.cr-fam tr.cr-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding:6px 0;border-bottom:1px solid #e2e8f0}' +
           '.cr-fam tr.cr-row td{display:block;text-align:left!important;padding:3px 6px!important;border:0!important}' +
           '.cr-fam td.cr-name{grid-column:1/-1}.cr-fam td.cr-bar{grid-column:1/3}.cr-fam td.cr-st{grid-column:3/-1}' +
           '.cr-fam td[data-l]:before{content:attr(data-l);display:block;font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em}}' +
           '</style></head><body>' +
           copYearReportHTML(m, opts) + '</body></html>';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Lo que lee del laboratorio (no PURO) y la pantalla
// ═══════════════════════════════════════════════════════════════════════════════

/** El año del reporte: el del día de hoy. */
function copRepYear() { return Number(String(localToday()).slice(0, 4)); }

/** Veredicto del muestreo secuencial con estos ensayos (mismos gases y límites que el Panorama). */
function _copRepVerdict(tests) {
    if (!tests || !tests.length || typeof copFamilyGases !== 'function') return null;
    var fam = { tests: tests.map(function(t) { return { vin: t.vin, date: t.date, values: t.values || {} }; }), regName: tests[0].regName };
    var decisions = [];
    copFamilyGases(fam).forEach(function(g) {
        var vals = copSpcSeries(fam, g.field).map(function(p) { return p.v; });
        var st = copCalcStats(vals, g.limit, typeof copGasDf === 'function' ? copGasDf(g.field) : null);
        if (st) decisions.push(st.decision);
    });
    if (!decisions.length) return null;
    if (decisions.indexOf('FAIL') >= 0) return 'FAIL';
    return decisions.every(function(d) { return d === 'PASS'; }) ? 'PASS' : 'CONTINUE';
}

/** Ensayos del año que cuentan para CoP, con su familia de año calendario. */
function copRepYearTests(year) {
    var out = [];
    ((typeof db !== 'undefined' && db.vehicles) || []).forEach(function(v) {
        if (!v || !copInScope(v).ok || !copTestCounts(v)) return;
        var d = vehicleTestDate(v);
        if (!d || Number(d.slice(0, 4)) !== year) return;
        var c = v.config || {};
        out.push({
            yk: copYearKeyOf(copVehicleFamilyKey(v), year), date: d, vin: v.vin || '', purpose: v.purpose || '',
            region: c['REGION'] || '', values: _copFinalGasValues(v),
            regName: (typeof _libGetVehicleRegulation === 'function') ? _libGetVehicleRegulation(v) : c['EMISSION REGULATION'],
            fam: { mod: c['Modelo'] || '', eng: c['ENGINE CAPACITY'] || '', tx: c['TRANSMISSION'] || '', reg: c['EMISSION REGULATION'] || '',
                   ep: (c['ENVIRONMENT PACKAGE'] && c['ENVIRONMENT PACKAGE'] !== '0') ? c['ENVIRONMENT PACKAGE'] : '',
                   engpkg: (c['ENGINE PACKAGE'] && c['ENGINE PACKAGE'] !== '0') ? c['ENGINE PACKAGE'] : '',
                   body: (c['BODY TYPE'] && c['BODY TYPE'] !== '0') ? c['BODY TYPE'] : '' }
        });
    });
    return out;
}

/** [3.22.0] Ensayos del año en el alcance que NO se registraron como CoP: {propósito: n}. */
function _copRepOtherPurpose(year, cut) {
    var o = {};
    ((typeof db !== 'undefined' && db.vehicles) || []).forEach(function(v) {
        if (!v || copPurposeCounts(v.purpose) || !copInScope(v).ok || !copResultApproved(v)) return;
        if (typeof isEmissionsPurpose === 'function' && v.purpose && !isEmissionsPurpose(v.purpose) && !/correl|investig/i.test(v.purpose)) return;
        var d = vehicleTestDate(v);
        if (!d || Number(d.slice(0, 4)) !== year || d > cut) return;
        var p = v.purpose || '(sin propósito)';
        o[p] = (o[p] || 0) + 1;
    });
    return Object.keys(o).map(function(k) { return { purpose: k, n: o[k] }; });
}

/** [3.23.0] Semanas sin celda del año (Plan → Disponibilidad): {lunes: nota}. */
function _copRepWeekOff(year) {
    var out = {}, av = (typeof tpState !== 'undefined' && tpState && tpState.weekAvailability) || {};
    Object.keys(av).forEach(function(mon) {
        if (av[mon] && av[mon].available === false && Number(String(mon).slice(0, 4)) >= year - 1) out[mon] = String(av[mon].note || '');
    });
    return out;
}

/**
 * [3.23.0] La nota del laboratorio de una semana (lo que no sale de los datos: "la celda
 * estará fuera la semana que entra"). Se une entre equipos por semana, gana la más
 * reciente. PURA y simétrica. Borrarla deja texto vacío (la marca que gana por fecha).
 */
function copRepNotesUnion(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function(src) {
        Object.keys(src).forEach(function(k) {
            var n = src[k];
            if (!k || !n || typeof n !== 'object') return;
            var cur = out[k];
            if (!cur || String(n.at || '') > String(cur.at || '') ||
                (String(n.at || '') === String(cur.at || '') && JSON.stringify(n) > JSON.stringify(cur))) out[k] = n;
        });
    });
    var keys = Object.keys(out).sort();
    if (keys.length > COP_REP_CUTS_KEEP) keys.slice(0, keys.length - COP_REP_CUTS_KEEP).forEach(function(k) { delete out[k]; });
    return out;
}

/** Escribe la nota de la semana del corte abierto (permiso del plan, auditada). */
function copRepNoteEdit() {
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'escribir la nota de la semana del estatus CoP')) return;
    var cut = _copRepUi.cut || localToday(), mon = copRepMonday(cut);
    var cur = (copState.yearNotes && copState.yearNotes[mon]) || null;
    uiPrompt({ title: '📝 Nota de la semana ' + copRepIsoWeek(cut), multiline: true, value: cur ? cur.text : '',
               label: 'Va en el estatus, en el idioma en que la escribas (al correo de corporativo, en inglés).',
               placeholder: 'Ej.: Next week the emission cell will not be available (HEV modification, phase 2).',
               confirmText: 'Guardar nota' }).then(function(text) {
        if (text === null) return;
        var before = cur ? cur.text : '';
        if (text === before) return;
        if (!copState.yearNotes) copState.yearNotes = {};
        copState.yearNotes[mon] = { text: text, at: new Date().toISOString(), by: (typeof _copWho === 'function') ? _copWho() : '' };
        copPersist();
        if (typeof auditLog === 'function') auditLog('cop', 'cop_nota_semana', { type: 'cop', label: 'Estatus CoP · semana ' + copRepIsoWeek(cut) },
            text ? 'Nota de la semana' : 'Nota borrada', { before: { nota: before }, after: { nota: text } });
        if (typeof fbPush === 'function' && typeof fbSync !== 'undefined' && fbSync.enabled) {
            try { fbPush('cop', JSON.parse(localStorage.getItem(COP_LS_KEY))); } catch (e) {}
        }
        showToast(text ? 'Nota guardada: sale en el estatus de esta semana.' : 'Nota borrada.', 'success');
        copRepOpen(cut);
    });
}

/** Cambia el idioma del estatus en pantalla (preferencia de este equipo). */
function copRepSetLang(lang) {
    uiPref('copRepLang', copRepLang(lang));
    copRepOpen(_copRepUi.cut || localToday());
}

function _copRepProduction(year, inScope) {
    return copYearProduction({
        year: year, months: (typeof tpMonths === 'function') ? tpMonths() : [],
        planData: (typeof tpState !== 'undefined' && tpState.planData) ? tpState.planData : [],
        inScope: inScope, keyOf: tpFamilyKeyForCfg,
        ruleOf: (typeof copHqRuleFor === 'function') ? function(c) { return copHqRuleFor(c); } : null,
        actuals: (copState.yearProd && copState.yearProd[year]) || {},
        hist: _copRepHistSource()
    });
}

/** [3.22.0] De cuándo es el `count_hist` del plan importado (y desde qué mes trae plan). */
function _copRepHistSource() {
    if (typeof tpState === 'undefined' || !tpState || !tpState.planImportDate) return null;
    var iso = String(tpState.planImportDate);
    var day = iso.slice(0, 10);
    try { if (iso.length > 10 && typeof localDateStr === 'function') day = localDateStr(new Date(iso)); } catch (e) {}
    return { asOf: day, firstMonth: tpState.planFirstMonth || null };
}

/**
 * [3.22.0] Los ensayos del año en familias del alcance, cuenten o no, con el motivo.
 * Es la lista para revisar qué se está contando (y corregir el propósito de lo que se
 * registró mal). No es PURA: lee db.vehicles.
 */
function copRepYearAudit(year, model) {
    var out = [];
    var excl = (model && model.excluded || []).reduce(function(o, x) { o[x.key] = x; return o; }, {});
    var rows = (model && model.rows || []).reduce(function(o, r) { o[r.key] = r; return o; }, {});
    ((typeof db !== 'undefined' && db.vehicles) || []).forEach(function(v) {
        if (!v || !copInScope(v).ok) return;
        if (typeof isEmissionsPurpose === 'function' && v.purpose && !isEmissionsPurpose(v.purpose) &&
            !/correl|investig/i.test(v.purpose)) return;            // OBD / Training: otro formato
        var d = vehicleTestDate(v) || String(v.registeredAt || '').slice(0, 10);
        if (!d || Number(d.slice(0, 4)) !== year) return;
        var yk = copYearKeyOf(copVehicleFamilyKey(v), year);
        var counts = copTestCounts(v);
        var why = counts ? '' : (copPurposeCounts(v.purpose) && !copResultApproved(v) && vehicleIsLive(v) ? 'en curso' : copTestWhyNot(v));
        if (counts && excl[yk]) why = 'familia fuera del reporte' + (excl[yk].reason ? ' (' + excl[yk].reason + ')' : '');
        out.push({ id: v.id, vin: v.vin || '', date: d, purpose: v.purpose || '', status: v.status || '',
                   yk: yk, family: rows[yk] ? rows[yk].label : (excl[yk] ? excl[yk].label : yk),
                   my: (v.config && v.config['MODEL YEAR (VIN)']) || '', counts: counts && !excl[yk], why: why,
                   inReport: !!rows[yk] });
    });
    out.sort(function(a, b) { return (a.family < b.family ? -1 : a.family > b.family ? 1 : 0) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
    return out;
}

var _copRepCache = { key: '', model: null };
/**
 * El estatus del año calendario al corte (default: hoy). Memoizado: el Panorama lo
 * pinta en cada render.
 */
function copYearReportModel(opts) {
    opts = opts || {};
    // [3.13.0] El Plan lo pide aunque nadie haya abierto el CoP: que el estado esté cargado.
    if (typeof _copLoaded !== 'undefined' && !_copLoaded && typeof copInitState === 'function') copInitState();
    var cut = opts.cutIso || localToday();
    var year = Number(cut.slice(0, 4));
    var nVeh = ((typeof db !== 'undefined' && db.vehicles) || []).length;
    var key = [cut, nVeh, _copRev, (typeof tpState !== 'undefined' && tpState._lastSave) || '',
               (typeof tpState !== 'undefined' && tpState.planImportDate) || '',
               (typeof tpMonths === 'function' ? tpMonths().length : 0)].join('|');
    if (!opts.force && _copRepCache.key === key && _copRepCache.model) return _copRepCache.model;
    var prod = _copRepProduction(year, function(c) { return copInScope(c).ok; });
    var out = _copRepProduction(year, function(c) { return copScopeHasRegion(c.rgn) && !copInScope(c).ok; });
    var outOfScope = Object.keys(out.fams).map(function(k) { return out.fams[k]; })
        .filter(function(f) { return f.vol > 0; })
        .sort(function(a, b) { return b.vol - a.vol; })
        .map(function(f) { return { label: copRepFamilyLabel(f), vol: f.vol }; });
    var cuts = copState.yearCuts || {};
    var model = copYearReportCompute({
        year: year, cutIso: cut, prod: prod, tests: copRepYearTests(year),
        otherPurpose: _copRepOtherPurpose(year, cut),
        weekOff: _copRepWeekOff(year),
        note: (copState.yearNotes && copState.yearNotes[copRepMonday(cut)]) || null,
        verdictOf: function(k, tests) { return _copRepVerdict(tests); },
        prevSaved: cuts[_copRepAddDays(copRepMonday(cut), -7)] || null,
        exclude: copState.yearExclude || {},
        outOfScope: outOfScope
    });
    // [3.24.0] Los bloques de la celda solo los lee el reporte: se arman la primera vez que
    // se piden (el Plan pide este modelo desde el arranque y no los necesita). No enumerable:
    // no viaja en el corte guardado.
    var _cell;
    Object.defineProperty(model, 'cell', { enumerable: false, configurable: true,
        get: function() { if (_cell === undefined) _cell = _copRepCell(cut); return _cell; } });
    _copRepCache = { key: key, model: model };
    return model;
}

/**
 * [3.24.0] Los bloques de la celda para el reporte: la semana del corte y la siguiente, sin
 * VIN (sale por correo). Salen de tpBlocksForWeek (bloques.js), con el corte como "hoy".
 */
function _copRepCell(cut) {
    if (typeof tpBlocksForWeek !== 'function') return null;
    var pack = function(r) {
        return { weekDate: r.weekDate, planState: r.planState, total: r.total, extra: r.extra.length,
                 days: r.days.map(function(d) {
                     return { iso: d.iso, day: d.day, blocks: d.blocks.map(function(b) {
                         var src = b.test || b.planned;
                         return { n: b.n, state: b.state, reason: b.reason, fam: src ? tpBlockFamilyName(src) : '', proposal: !!(b.planned && b.planned.proposal) };
                     }) };
                 }) };
    };
    try {
        var mon = copRepMonday(cut);
        return { now: pack(tpBlocksForWeek(mon, { today: cut })), next: pack(tpBlocksForWeek(_copRepAddDays(mon, 7), { today: cut })) };
    } catch (e) { console.warn('_copRepCell:', e); return null; }
}

/**
 * Guarda el corte de la semana (uno por semana: el último que se generó en esa semana
 * es el que queda). Solo para la semana en curso — un corte de una fecha pasada se
 * consulta, no se reescribe.
 */
function copRepRecordCut(model) {
    if (!model || model.weekOf !== copRepMonday(localToday())) return false;
    if (!copState.yearCuts) copState.yearCuts = {};
    var first = !copState.yearCuts[model.weekOf];
    var who = (typeof _copWho === 'function') ? _copWho() : '';
    copState.yearCuts = copRepCutsUnion(copState.yearCuts, {});
    copState.yearCuts[model.weekOf] = copRepCutSnapshot(model, new Date().toISOString(), who);
    copPersist();
    if (first && typeof auditLog === 'function') {
        auditLog('cop', 'cop_corte_semanal', { type: 'cop', label: 'CoP ' + model.year + ' · semana ' + model.week },
                 'Avance ' + Math.round(model.total.progress * 100) + '% · ' + model.total.done + '/' + model.total.req + ' ensayos');
    }
    if (typeof fbPush === 'function' && typeof fbSync !== 'undefined' && fbSync.enabled) {
        try { fbPush('cop', JSON.parse(localStorage.getItem(COP_LS_KEY))); } catch (e) {}
    }
    return true;
}

function _copRepDocFor(cut) {
    var m = copYearReportModel({ cutIso: cut, force: true });
    var who = (typeof authState !== 'undefined' && authState.currentUser) ? authState.currentUser.name : '';
    var now = new Date();
    var opts = { generatedAt: localDateStr(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
                 generatedBy: who, lang: copRepLang(typeof uiPref === 'function' ? uiPref('copRepLang') : 'en') };
    return { model: m, opts: opts, doc: copYearReportDocument(m, opts) };
}

var _copRepUi = { cut: '' };

/** Abre el estatus al corte (por default, hoy) y guarda el corte de la semana. */
function copRepOpen(cutIso) {
    if (typeof copInitState === 'function') copInitState();
    var cut = (typeof cutIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cutIso)) ? cutIso : (_copRepUi.cut || localToday());
    _copRepUi.cut = cut;
    var r = _copRepDocFor(cut);
    var saved = copRepRecordCut(r.model);
    var host = document.getElementById('cop-rep');
    if (!host) {
        host = document.createElement('div');
        host.id = 'cop-rep';
        host.className = 'cop-rep';
        host.setAttribute('role', 'dialog');
        host.setAttribute('aria-modal', 'true');
        host.setAttribute('aria-label', 'Estatus CoP por año calendario');
        document.body.appendChild(host);
    }
    var canEdit = (typeof authCan !== 'function') || authCan('plan.manage');
    host.innerHTML =
        '<div class="cop-rep-bar">' +
          '<div class="cop-rep-title">🏁 CoP ' + r.model.year + ' · semana ' + r.model.week + '</div>' +
          '<label class="cop-rep-cut">Corte <input type="date" id="cop-rep-cut" value="' + cut + '" max="' + localToday() + '" onchange="copRepOpen(this.value)"></label>' +
          '<div class="cop-rep-actions">' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="copRepPrint()">🖨️ Imprimir / PDF</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="copRepCopyEmail()">✉️ Copiar para correo</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="copRepDownload()">⬇️ HTML</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" id="cop-rep-prod-btn" onclick="copRepProdOpen()">✏️ Producción real</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" id="cop-rep-fam-btn" onclick="copRepFamiliesOpen()">⚙️ Familias</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" onclick="copRepAuditOpen()">🔎 Ensayos del año</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" id="cop-rep-note-btn" onclick="copRepNoteEdit()">📝 Nota de la semana</button>' +
            '<span class="cop-rep-lang" role="group" aria-label="Idioma del estatus">' +
              ['en', 'es'].map(function(l) {
                  return '<button type="button" class="btn btn-sm ' + (r.opts.lang === l ? 'btn-primary' : 'btn-ghost') + '" aria-pressed="' + (r.opts.lang === l) +
                         '" onclick="copRepSetLang(\'' + l + '\')">' + (l === 'en' ? 'English' : 'Español') + '</button>';
              }).join('') + '</span>' +
            '<button type="button" class="btn btn-sm btn-ghost cop-rep-close" onclick="copRepClose()" aria-label="Cerrar">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="cop-rep-note">' + (saved ? '📌 Corte de la semana ' + r.model.week + ' guardado: la próxima semana se compara contra este.'
                                              : 'Consulta de un corte anterior: no se guarda.') + _copRepLeftOutHTML(r.model) + '</div>' +
        '<iframe class="cop-rep-frame" title="Reporte CoP ' + r.model.year + '"></iframe>';
    host.querySelector('iframe').srcdoc = r.doc;
    host.classList.add('is-open');
    document.body.classList.add('cop-rep-open');
    if (!host._esc) {
        host._esc = function(e) { if (e.key === 'Escape' && host.classList.contains('is-open') && !document.getElementById('globalModal')) copRepClose(); };
        document.addEventListener('keydown', host._esc);
    }
    var pb = document.getElementById('cop-rep-prod-btn');
    if (pb && typeof uiExplainDisabled === 'function') uiExplainDisabled(pb, canEdit ? '' : 'Capturar la producción real pide el permiso de administrar el plan.');
    var nb = document.getElementById('cop-rep-note-btn');
    if (nb && typeof uiExplainDisabled === 'function') uiExplainDisabled(nb, canEdit ? '' : 'Escribir la nota de la semana pide el permiso de administrar el plan.');
    var fb = document.getElementById('cop-rep-fam-btn');
    if (fb && typeof uiExplainDisabled === 'function') uiExplainDisabled(fb, canEdit ? '' : 'Decidir qué familias van al reporte pide el permiso de administrar el plan.');
}

/** Lo que NO va en el reporte compartido, para que el laboratorio lo vea (solo en la app). */
function _copRepLeftOutHTML(m) {
    var parts = [];
    if (m.excluded.length) parts.push('excluidas por el laboratorio: ' + m.excluded.map(function(x) { return _crEsc(x.label) + (x.reason ? ' (' + _crEsc(x.reason) + ')' : ''); }).join('; '));
    if (m.noProduction.length) parts.push('sin producción en ' + m.year + ' (con ensayos): ' + m.noProduction.map(function(x) { return _crEsc(x.label); }).join('; '));
    if (m.outOfScope.length) parts.push('fuera del alcance CoP: ' + m.outOfScope.map(function(x) { return _crEsc(x.label) + ' (' + _crNum(x.vol) + ')'; }).join('; '));
    // [3.22.0] Ensayos aprobados de familias del alcance que no se registraron como CoP.
    if (m.otherPurpose && m.otherPurpose.length) {
        parts.push('ensayos que no cuentan por su propósito: ' + m.otherPurpose.map(function(x) {
            return _crEsc(typeof uiLabel === 'function' ? uiLabel('purpose', x.purpose) : x.purpose) + ' (' + x.n + ')';
        }).join(', ') + ' — revísalos en 🔎 Ensayos del año');
    }
    return parts.length ? '<div class="cop-rep-left">No van en el reporte — ' + parts.join(' · ') + '.</div>' : '';
}

/**
 * [3.22.0] Los ensayos del año en familias del alcance: cuáles cuentan y por qué no los
 * demás. Desde aquí se corrige el propósito de un ensayo mal registrado (✏️ Corregir
 * alta, con sus candados y su firma).
 */
function copRepAuditOpen() {
    var cut = _copRepUi.cut || localToday();
    var m = copYearReportModel({ cutIso: cut });
    var list = copRepYearAudit(m.year, m);
    var nOk = list.filter(function(x) { return x.counts; }).length;
    var body = '<p style="font-size: var(--fs-sm);margin:0 0 var(--space-sm);">Ensayos con fecha en ' + m.year + ' de familias del alcance CoP. ' +
               'Cuentan <b>' + nOk + '</b> de ' + list.length + ': solo los registrados como conformidad de la producción, aprobados y válidos. ' +
               'Si uno se registró con el propósito equivocado, corrígelo con ✏️ (queda en su historial).</p>';
    if (!list.length) body += '<p class="u-muted">No hay ensayos del alcance en ' + m.year + '.</p>';
    else {
        body += '<div class="cop-rep-prod-wrap"><table class="u-cards cop-rep-audit"><thead><tr><th>Familia</th><th>VIN</th><th>Fecha</th><th>Propósito</th><th>¿Cuenta?</th><th></th></tr></thead><tbody>';
        list.forEach(function(x) {
            var pl = x.purpose ? (typeof uiLabel === 'function' ? uiLabel('purpose', x.purpose) : x.purpose) : 'sin propósito';
            body += '<tr><td>' + _crEsc(x.family) + (x.my ? ' <span class="u-muted">· ' + _crEsc(String(x.my).replace(/\s*MODEL/i, '')) + '</span>' : '') + '</td>' +
                    '<td style="font-family:monospace;">' + _crEsc(x.vin) + '</td><td>' + _crEsc(_crDay(x.date)) + '</td>' +
                    '<td>' + _crEsc(pl) + '</td>' +
                    '<td>' + (x.counts ? '✅ Sí' : '— No · ' + _crEsc(x.why)) + '</td>' +
                    '<td><button type="button" class="btn btn-sm btn-ghost" aria-label="Corregir el alta de ' + _crEsc(x.vin) + '" ' +
                    'onclick="copRepAuditFix(' + _crEsc(JSON.stringify(x.id)) + ')">✏️ Corregir</button></td></tr>';
        });
        body += '</tbody></table></div>';
    }
    showModal({ title: '🔎 Ensayos CoP ' + m.year, body: body, buttons: [{ label: 'Cerrar' }] });
}

/** Cierra la lista y abre ✏️ Corregir alta del vehículo. */
function copRepAuditFix(id) {
    var g = document.getElementById('globalModal');
    if (g) g.remove();
    if (typeof vehicleCorrectAltaOpen === 'function') vehicleCorrectAltaOpen(id);
}

function copRepClose() {
    var host = document.getElementById('cop-rep');
    if (host) { host.classList.remove('is-open'); host.innerHTML = ''; }
    document.body.classList.remove('cop-rep-open');
}

/** Imprime (o guarda como PDF) el reporte del corte abierto, o el de hoy. */
function copRepPrint() {
    var r = _copRepDocFor(_copRepUi.cut || localToday());
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(f);
    f.onload = function() {
        try { f.contentWindow.focus(); f.contentWindow.print(); }
        catch (e) { copRepDownload(); }
        setTimeout(function() { f.remove(); }, 60000);
    };
    f.srcdoc = r.doc;
}

function copRepDownload() {
    var r = _copRepDocFor(_copRepUi.cut || localToday());
    var blob = new Blob([r.doc], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'CoP-' + r.model.year + '-semana-' + String(r.model.week).padStart(2, '0') + '.html';
    document.body.appendChild(a); a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Copia el reporte como texto con formato, listo para pegar en un correo. */
function copRepCopyEmail() {
    var r = _copRepDocFor(_copRepUi.cut || localToday());
    var html = copYearReportHTML(r.model, { lang: r.opts.lang });
    try {
        if (navigator.clipboard && window.ClipboardItem) {
            navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([copRepPlainText(r.model, r.opts.lang)], { type: 'text/plain' })
            })]).then(function() { showToast('Reporte copiado: pégalo en el correo.', 'success'); },
                      function() { copRepDownload(); showToast('El navegador no dejó copiar: se descargó el HTML.', 'warning'); });
            return;
        }
    } catch (e) {}
    copRepDownload();
    showToast('El navegador no deja copiar con formato: se descargó el HTML.', 'warning');
}

/** Resumen en texto plano (para el portapapeles sin formato y el aviso). PURA. */
function copRepPlainText(m, lang) {
    lang = copRepLang(lang);
    var X = COP_REP_TXT[lang], T = m.total, P = m.pace || copRepPace(m), en = lang === 'en';
    var L = [en ? 'CoP ' + m.year + ' — status as of ' + _crDayL(m.cut, lang) + ' (week ' + m.week + ')'
                : 'CoP ' + m.year + ' — estatus al corte ' + _crDay(m.cut) + ' (semana ' + m.week + ')',
             (en ? 'Overall progress ' : 'Avance global ') + _crPct(T.progress) + ' · ' + T.covered + '/' + T.req + (en ? ' tests · ' : ' ensayos · ') +
             (T.added >= 0 ? '+' : '') + T.added + (en ? ' this week · ' + T.pending + ' to go' : ' esta semana · faltan ' + T.pending)];
    if (P.pending) L.push((en ? 'Pace: ' : 'Ritmo: ') + _crDec(P.recent) + X.perWeek + (en ? ' (last 4 weeks) · needed ' : ' (últimas 4 semanas) · hacen falta ') +
                          (P.needed === null ? '—' : _crDec(P.needed) + X.perWeek));
    var C = (m.critical || []).slice(0, 5);
    if (C.length) {
        L.push('', X.secAttention + ':');
        C.forEach(function(c, i) {
            L.push('  ' + (i + 1) + '. ' + (c.name || X.noModel) + ' — ' + c.reasons.map(function(rs) { return _crReasonText(rs, X); }).join(' ').replace(/<[^>]+>/g, ''));
        });
    }
    m.regions.forEach(function(rg) {
        L.push('', (X.regions[rg.id] || rg.label) + ': ' + _crPct(rg.total.progress) + ' (' + rg.total.covered + '/' + rg.total.req + ')');
        rg.rows.forEach(function(r) {
            L.push('  · ' + (r.name || X.noModel) + ' ' + (X.groups[r.group.id] || '') + ' — ' + _crNum(r.volToDate) + ' u · ' + r.done + '/' + r.req +
                   (r.added ? ' (+' + r.added + ')' : '') + ' · ' + ((X.status[r.status.id]) || r.status.label));
        });
    });
    if (m.cell && m.cell.now && m.cell.now.total.blocks) {
        var strip = function(t) { return String(t).replace(/<[^>]+>/g, ''); };
        L.push('', X.secCell + ':', '  ' + strip(X.cellNow(m.cell.now.total)));
        if (m.cell.next) {
            L.push('  ' + strip(X.cellNext(m.cell.next.planState, m.cell.next.total)));
            if (m.cell.next.planState !== 'none') m.cell.next.days.forEach(function(d) {
                L.push('    ' + _crBlockDay(d.iso, lang) + ': ' + d.blocks.map(function(b) { return strip(_crBlockText(b, X, lang)); }).join(' | '));
            });
        }
    }
    if (m.note) L.push('', X.secNote + ': ' + m.note.text);
    return L.join('\n');
}

// ─── Producción real (lo que el plan no trae) ──────────────────────────────────
function copRepProdOpen() {
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'capturar la producción real del año')) return;
    var cut = _copRepUi.cut || localToday();
    var year = Number(cut.slice(0, 4));
    var m = copYearReportModel({ cutIso: cut, force: true });
    var actual = (copState.yearProd && copState.yearProd[year]) || {};
    var body = (m.histBoundary ? '<p style="font-size: var(--fs-sm);margin:0 0 var(--space-sm);">' + copRepProductionText(m) +
                ' Esos meses ya van en el acumulado (<i>acum.</i>): para actualizarlos, importa el CSV más reciente en Plan.</p>' : '') +
               '<p style="font-size: var(--fs-sm);margin:0 0 var(--space-sm);">Lo que captures aquí manda sobre el plan importado en ese mes. ' +
               'Deja vacío lo que no sepas: se queda lo del plan' + (m.missingMonths.length ? ' (el plan no trae ' + _crMonthsList(m.missingMonths) + ')' : '') + '.</p>';
    body += '<div class="cop-rep-prod-wrap"><table class="cop-rep-prod"><thead><tr><th>Familia</th>';
    _COP_REP_MONTHS.forEach(function(mo) { body += '<th>' + mo + '</th>'; });
    body += '</tr></thead><tbody>';
    m.rows.forEach(function(r) {
        var a = actual[r.key] && actual[r.key].m ? actual[r.key].m : [];
        body += '<tr data-key="' + _crEsc(r.key) + '"><td class="cop-rep-prod-fam">' + _crEsc(r.label) + '</td>';
        for (var i = 0; i < 12; i++) {
            var v = (a[i] === null || a[i] === undefined) ? '' : a[i];
            // [3.22.0] Un mes dentro del acumulado del CSV no se captura: contaría dos veces.
            var enHist = r.monthSrc[i] === 'hist';
            var plan = enHist ? 'acum.' : r.monthSrc[i] === 'sin-dato' ? '—' : String(r.fam.plan ? r.fam.plan[i] : r.months[i]);
            body += '<td><input type="number" min="0" step="1" inputmode="numeric" aria-label="' + _crEsc(r.label + ' · ' + _COP_REP_MONTHS[i]) + '" ' +
                    'data-mi="' + i + '" value="' + _crEsc(v) + '" placeholder="' + _crEsc(plan) + '"' +
                    (enHist ? ' disabled title="Va dentro de lo producido al ' + _crEsc(_crDay(m.histAsOf)) + ' del plan importado"' : '') + '></td>';
        }
        body += '</tr>';
    });
    body += '</tbody></table></div>';
    showModal({ title: '✏️ Producción real ' + year, body: body, buttons: [
        { label: 'Cancelar' },
        { label: 'Guardar', cls: 'btn-primary', onclick: function() { copRepProdSave(year); } }
    ] });
}

function copRepProdSave(year) {
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'capturar la producción real del año')) return;
    var modal = document.getElementById('globalModal');
    if (!modal) return;
    if (!copState.yearProd) copState.yearProd = {};
    var cur = copState.yearProd[year] = copState.yearProd[year] || {};
    var now = new Date().toISOString(), who = (typeof _copWho === 'function') ? _copWho() : '';
    var before = {}, after = {}, changed = 0;
    modal.querySelectorAll('tr[data-key]').forEach(function(tr) {
        var k = tr.getAttribute('data-key');
        var m = [];
        tr.querySelectorAll('input[data-mi]').forEach(function(inp) {
            var s = String(inp.value).trim();
            m[Number(inp.getAttribute('data-mi'))] = (s === '' || !isFinite(Number(s)) || Number(s) < 0) ? null : Math.round(Number(s));
        });
        var old = cur[k] && cur[k].m ? cur[k].m : [];
        var same = true;
        for (var i = 0; i < 12; i++) if ((old[i] == null ? null : old[i]) !== (m[i] == null ? null : m[i])) same = false;
        if (same) return;
        before[k] = old.slice(); after[k] = m.slice();
        cur[k] = { m: m, updatedAt: now, by: who };
        changed++;
    });
    modal.remove();
    if (!changed) { showToast('Sin cambios en la producción real.', 'info'); return; }
    copPersist();
    if (typeof auditLog === 'function') auditLog('cop', 'produccion_real', { type: 'cop', label: 'Producción real ' + year },
        changed + ' familia(s)', { before: before, after: after });
    if (typeof fbPush === 'function' && typeof fbSync !== 'undefined' && fbSync.enabled) {
        try { fbPush('cop', JSON.parse(localStorage.getItem(COP_LS_KEY))); } catch (e) {}
    }
    showToast('Producción real guardada (' + changed + ' familia' + (changed === 1 ? '' : 's') + ').', 'success');
    if (document.getElementById('cop-rep') && document.getElementById('cop-rep').classList.contains('is-open')) copRepOpen(_copRepUi.cut);
    if (typeof copRender === 'function' && document.getElementById('platform-cop')) copRender();
}

/** Tarjeta del Panorama: el estatus del año en una línea, con el botón al reporte. */
function copRepOverviewCardHTML() {
    var m;
    try { m = copYearReportModel(); } catch (e) { return ''; }
    if (!m || !m.rows.length) return '';
    var T = m.total;
    var h = '<div class="cop-rep-card">' +
        '<div class="cop-rep-card-main"><div class="cop-rep-card-k">🏁 CoP ' + m.year + ' · año calendario</div>' +
        '<div class="cop-rep-card-v"><b>' + _crPct(T.progress) + '</b> de avance · ' + T.done + ' de ' + T.req + ' ensayos · ' +
        (T.added ? '<b>+' + T.added + '</b> esta semana · ' : '') + T.pending + ' por hacer</div>' +
        '<div class="cop-rep-card-bar"><span style="width:' + Math.round(T.progress * 100) + '%"></span></div>' +
        (m.pace && m.pace.pending ? '<div class="cop-rep-card-pace">Ritmo: <b>' + _crDec(m.pace.recent) + '/sem.</b> (últimas 4) · ' +
            (m.pace.needed === null ? 'ya no quedan semanas con celda' : 'hacen falta <b>' + _crDec(m.pace.needed) + '/sem.</b> para el 31 dic') +
            (m.critical && m.critical.length ? ' · más crítica: <b>' + _crEsc(m.critical[0].name || '(sin modelo)') + '</b>' : '') + '</div>' : '') +
        (m.missingMonths.length ? '<div class="cop-rep-card-warn">⚠ El plan no trae ' + _crMonthsList(m.missingMonths) + ' ' + m.year + ': captura la producción real.</div>' : '') +
        '</div><button type="button" class="btn btn-sm btn-primary" onclick="copRepOpen()">Estatus de la semana</button></div>';
    return h;
}

/** Familias del año calendario para el validador ("Validador 2026"). */
function copYearValidatorFamilies() {
    var m;
    try { m = copYearReportModel(); } catch (e) { return []; }
    return m.rows.map(function(r) {
        return { key: r.key, label: r.label + ' · ' + m.year + ' (todos los MY)', regionsArr: r.regions, inPlan: !r.noPlan };
    });
}

// ─── Qué familias van al reporte ───────────────────────────────────────────────
// La lista de corporativo no siempre coincide con lo que salió de la línea en el año
// (unidades piloto, una familia que ya no se produce). Sacar una familia NO la borra:
// queda en el pie del reporte con su motivo, y se regresa con un toque.
function copRepFamiliesOpen() {
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'decidir qué familias van al reporte CoP')) return;
    var m = copYearReportModel({ cutIso: _copRepUi.cut || localToday(), force: true });
    var ex = copState.yearExclude || {};
    var list = m.rows.map(function(r) { return { key: r.key, label: r.label, vol: r.vol, done: r.done, region: r.region }; })
        .concat((m.excluded || []).map(function(x) { return { key: x.key, label: x.label, vol: x.vol, done: x.done }; }));
    var body = '<p style="font-size: var(--fs-sm);margin:0 0 var(--space-sm);">Destilda una familia para sacarla del reporte (unidades piloto, una familia que corporativo no pide). ' +
               'No se borra nada: sale en el pie del reporte con el motivo.</p><div class="cop-rep-prod-wrap">';
    list.forEach(function(r) {
        var e = ex[r.key] && ex[r.key].excluded ? ex[r.key] : null;
        body += '<div class="cop-rep-fam" data-key="' + _crEsc(r.key) + '">' +
                '<label class="u-hit"><input type="checkbox" ' + (e ? '' : 'checked') + '> <b>' + _crEsc(r.label) + '</b></label>' +
                '<span class="u-muted"> · ' + _crNum(r.vol) + ' u · ' + r.done + ' ensayo' + (r.done === 1 ? '' : 's') + '</span>' +
                '<input type="text" class="cop-rep-fam-why" placeholder="Motivo para sacarla (Ej.: unidades piloto)" value="' + _crEsc(e ? e.reason : '') + '"></div>';
    });
    body += '</div>';
    showModal({ title: '⚙️ Familias del reporte ' + m.year, body: body, buttons: [
        { label: 'Cancelar' },
        { label: 'Guardar', cls: 'btn-primary', onclick: function() { copRepFamiliesSave(); } }
    ] });
}

function copRepFamiliesSave() {
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'decidir qué familias van al reporte CoP')) return;
    var modal = document.getElementById('globalModal');
    if (!modal) return;
    var ex = copState.yearExclude = copState.yearExclude || {};
    var now = new Date().toISOString(), who = (typeof _copWho === 'function') ? _copWho() : '';
    var cambios = [], bad = null;
    modal.querySelectorAll('.cop-rep-fam').forEach(function(row) {
        if (bad) return;
        var k = row.getAttribute('data-key');
        var on = row.querySelector('input[type=checkbox]').checked;
        var why = String(row.querySelector('.cop-rep-fam-why').value || '').trim();
        var was = !!(ex[k] && ex[k].excluded);
        if (!on && why.length < 5) { bad = row.querySelector('.cop-rep-fam-why'); return; }
        if (was === !on && (!was || (ex[k].reason || '') === why)) return;
        cambios.push({ key: k, excluded: !on, reason: on ? '' : why, before: was });
    });
    if (bad) { if (typeof uiInvalid === 'function') uiInvalid(bad, 'Escribe por qué sale del reporte (5 letras o más).'); return; }
    modal.remove();
    if (!cambios.length) { showToast('Sin cambios en las familias del reporte.', 'info'); return; }
    cambios.forEach(function(c) {
        // Regresar deja `excluded:false` (no se borra la marca): es la que gana por fecha
        // en el sync, si no, la exclusión vieja de otro equipo volvería.
        ex[c.key] = { excluded: c.excluded, reason: c.reason, at: now, by: who };
    });
    copPersist();
    if (typeof auditLog === 'function') auditLog('cop', 'reporte_familias', { type: 'cop', label: 'Familias del reporte CoP' },
        cambios.length + ' cambio(s)', { before: cambios.map(function(c) { return { key: c.key, excluded: c.before }; }),
                                          after: cambios.map(function(c) { return { key: c.key, excluded: c.excluded, reason: c.reason }; }) });
    if (typeof fbPush === 'function' && typeof fbSync !== 'undefined' && fbSync.enabled) {
        try { fbPush('cop', JSON.parse(localStorage.getItem(COP_LS_KEY))); } catch (e) {}
    }
    showToast('Familias del reporte actualizadas.', 'success');
    if (document.getElementById('cop-rep') && document.getElementById('cop-rep').classList.contains('is-open')) copRepOpen(_copRepUi.cut);
}

/** Asunto del correo semanal. PURA. */
function copRepSubject(m, lang) {
    var T = m.total;
    if (copRepLang(lang) === 'en') {
        return 'CoP ' + m.year + ' status · week ' + m.week + ' — ' + _crPct(T.progress) + ' complete (' + T.covered + '/' + T.req + ' tests' +
               (T.added ? ', +' + T.added + ' this week' : '') + ')';
    }
    return 'CoP ' + m.year + ' · semana ' + m.week + ' — ' + _crPct(T.progress) + ' de avance (' +
           T.covered + '/' + T.req + ' ensayos' + (T.added ? ', +' + T.added + ' esta semana' : '') + ')';
}
