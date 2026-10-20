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
 * LA producción de un año calendario por familia. PURA.
 * src = {year, months:[etiquetas], planData:[cfg con m[] alineado a months],
 *        inScope(cfg)→bool, keyOf(cfg)→clave de familia, actuals:{clave_año:{m:[12]}},
 *        ruleOf(cfg)→fila de COP_HQ_RULES o null (opcional)}
 *
 * - Un mes "tiene dato" si viene en el plan y el plan ENTERO trae unidades ese mes: un
 *   mes en cero para todas las configuraciones es un mes que el CSV no trajo, no un mes
 *   sin producción. Se DECLARA (`missing`), nunca se lee como cero.
 * - Lo capturado como real (`actuals`) manda sobre el plan, mes por mes.
 * Devuelve {fams:{clave_año:{…, m:[12], src:[12]}}, monthHas:[12], missing:[1..12]}.
 */
function copYearProduction(src) {
    var year = Number(src.year);
    var months = src.months || [];
    var plan = src.planData || [];
    var idx = months.map(function(l) { var p = _copRepMonth(l); return (p && p.y === year) ? p.m - 1 : -1; });
    var tot = [0,0,0,0,0,0,0,0,0,0,0,0];
    plan.forEach(function(c) {
        (c && c.m || []).forEach(function(v, i) { if (idx[i] >= 0) tot[idx[i]] += Number(v) || 0; });
    });
    var monthHas = tot.map(function(t) { return t > 0; });
    var fams = {};
    plan.forEach(function(c) {
        if (!c || (src.inScope && !src.inScope(c))) return;
        var yk = copYearKeyOf(src.keyOf(c), year);
        if (!yk) return;
        var f = fams[yk];
        if (!f) f = fams[yk] = { key: yk, mod: c.mod || '', eng: c.eng || '', tx: c.tx || '', reg: c.reg || '',
            ep: (c.ep && c.ep !== '0') ? c.ep : '', engpkg: (c.engpkg && c.engpkg !== '0') ? c.engpkg : '',
            body: (c.body && c.body !== '0') ? c.body : '', regions: {}, mys: {}, configs: 0,
            plan: [0,0,0,0,0,0,0,0,0,0,0,0], rule: '', ruleLabel: '' };
        f.configs++;
        if (c.rgn) f.regions[c.rgn] = true;
        // [3.13.0] La regla de corporativo de la familia. Si dos configuraciones traen reglas
        // distintas, manda 'lot' (pide más) y se marca: no se elige la barata en silencio.
        var hr = src.ruleOf ? src.ruleOf(c) : null;
        if (hr && hr.rule) {
            if (f.rule && f.rule !== hr.rule) f.ruleMixed = true;
            if (!f.rule || hr.rule === 'lot') { f.rule = hr.rule; f.ruleLabel = hr.label || ''; }
        }
        var añoCfg = 0;
        (c.m || []).forEach(function(v, i) { if (idx[i] >= 0) { f.plan[idx[i]] += Number(v) || 0; añoCfg += Number(v) || 0; } });
        if (c.my && añoCfg > 0) f.mys[c.my] = true;
    });
    var actuals = src.actuals || {};
    Object.keys(fams).forEach(function(k) {
        var f = fams[k], a = actuals[k] && Array.isArray(actuals[k].m) ? actuals[k].m : [];
        f.m = []; f.src = [];
        for (var i = 0; i < 12; i++) {
            var r = a[i];
            if (r !== null && r !== undefined && r !== '' && isFinite(Number(r))) { f.m.push(Number(r)); f.src.push('real'); }
            else if (monthHas[i]) { f.m.push(f.plan[i]); f.src.push('plan'); }
            else { f.m.push(0); f.src.push('sin-dato'); }
        }
        f.vol = f.m.reduce(function(s, v) { return s + v; }, 0);
    });
    var missing = [];
    monthHas.forEach(function(h, i) { if (!h) missing.push(i + 1); });
    return { year: year, fams: fams, monthHas: monthHas, missing: missing };
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
            var f = t.fam || {};
            byKey[t.yk] = { fam: { key: t.yk, mod: f.mod || '', eng: f.eng || '', tx: f.tx || '', reg: f.reg || '', ep: f.ep || '',
                engpkg: f.engpkg || '', body: f.body || '', regions: {}, mys: {}, configs: 0, m: [0,0,0,0,0,0,0,0,0,0,0,0],
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
        var volToDate = f.m.slice(0, closed).reduce(function(s, v) { return s + v; }, 0);
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
            vol: f.vol, volToDate: volToDate, months: f.m, monthSrc: f.src,
            rule: rule, ruleLabel: f.ruleLabel || '', ruleMixed: !!f.ruleMixed,
            req: req, reqToDate: copYearRequired(rule, volToDate), nextLotAt: rule === 'lot' ? copLotNextAt(f.vol) : null,
            done: done, prevDone: prevDone, added: done - prevDone, pending: Math.max(0, req - done),
            prevReq: prevReq, prevVol: p ? (Number(p.vol) || 0) : null, volDelta: p ? f.vol - (Number(p.vol) || 0) : null,
            progress: progress, prevProgress: prevProgress, deltaPp: Math.round((progress - prevProgress) * 1000) / 10,
            verdict: verdict, prevVerdict: prevVerdict, status: copRepStatus(req, done, verdict),
            lastTest: done ? e.tests[done - 1].date : '', purposes: purposes,
            vins: e.tests.map(function(t) { return t.vin; })
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
    return {
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
        realMonths: (function() {
            var m = {};
            rows.forEach(function(r) { (r.monthSrc || []).forEach(function(s, i) { if (s === 'real') m[i + 1] = true; }); });
            return Object.keys(m).map(Number).sort(function(a, b) { return a - b; });
        })(),
        nonCopPurposes: nonCop,
        excluded: excludedOut.sort(function(a, b) { return b.vol - a.vol; }),
        noProduction: noProduction,
        outOfScope: src.outOfScope || []
    };
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
var COP_REP_TONE = {
    ok:    { fg: '#065f46', bg: '#d1fae5', bar: '#059669' },
    run:   { fg: '#1e3a8a', bg: '#dbeafe', bar: '#2563eb' },
    open:  { fg: '#92400e', bg: '#fef3c7', bar: '#d97706' },
    todo:  { fg: '#9f1239', bg: '#ffe4e6', bar: '#e11d48' },
    fail:  { fg: '#991b1b', bg: '#fee2e2', bar: '#dc2626' },
    none:  { fg: '#475569', bg: '#e2e8f0', bar: '#94a3b8' },
    extra: { fg: '#475569', bg: '#e2e8f0', bar: '#94a3b8' }
};
function _crEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _crNum(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function _crPct(x) { return Math.round((Number(x) || 0) * 100) + '%'; }
function _crDay(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? Number(p[2]) + ' ' + _COP_REP_MONTHS[Number(p[1]) - 1] + ' ' + p[0] : '';
}
function _crDelta(n, unit) {
    var v = Math.round((Number(n) || 0) * 10) / 10;
    if (!v) return '<span style="color:#94a3b8;">—</span>';
    return '<span style="color:' + (v > 0 ? '#047857' : '#b91c1c') + ';font-weight:700;">' + (v > 0 ? '+' : '−') + Math.abs(v) + (unit || '') + '</span>';
}
function _crBar(p, prev, color) {
    var w = Math.max(0, Math.min(100, Math.round((p || 0) * 100)));
    var pw = (prev === null || prev === undefined) ? null : Math.max(0, Math.min(100, Math.round(prev * 100)));
    var h = '<div style="position:relative;height:8px;border-radius:4px;background:#e2e8f0;overflow:hidden;min-width:70px;">';
    if (pw !== null && pw < w) h += '<div style="position:absolute;left:0;top:0;bottom:0;width:' + w + '%;background:' + color + ';opacity:0.35;"></div>' +
                                   '<div style="position:absolute;left:0;top:0;bottom:0;width:' + pw + '%;background:' + color + ';"></div>';
    else h += '<div style="position:absolute;left:0;top:0;bottom:0;width:' + w + '%;background:' + color + ';"></div>';
    return h + '</div>';
}
function _crPill(st) {
    var t = COP_REP_TONE[st.id] || COP_REP_TONE.none;
    return '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;color:' + t.fg + ';background:' + t.bg + ';">' + _crEsc(st.label) + '</span>';
}
function _crVerdictText(v) {
    return v === 'PASS' ? 'concordante' : v === 'FAIL' ? 'no concordante' : v === 'CONTINUE' ? 'sin decidir' : 'n &lt; 3';
}
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

/**
 * El reporte gerencial. PURA (mismo modelo → mismo texto). Estilos literales: nada de
 * var(--…) — sale de la app por correo e impreso.
 * opts = {generatedAt, generatedBy, lab}
 */
function copYearReportHTML(m, opts) {
    opts = opts || {};
    var T = m.total;
    var F = 'font-family:Segoe UI,Helvetica,Arial,sans-serif;';
    var h = '<div style="' + F + 'color:#0f172a;max-width:980px;margin:0 auto;background:#ffffff;">';
    // Encabezado
    h += '<div style="background:#0b1f3a;color:#ffffff;padding:22px 26px 18px;border-radius:14px 14px 0 0;">' +
         '<div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#93c5fd;font-weight:700;">' + _crEsc(opts.lab || 'KIA México · Laboratorio de Emisiones') + '</div>' +
         '<div style="font-size:24px;font-weight:800;margin-top:6px;">Conformidad de la Producción ' + m.year + '</div>' +
         '<div style="font-size:14px;color:#cbd5e1;margin-top:4px;">Estatus al corte · semana ' + m.week + ' · ' + _crEsc(_crDay(m.cut)) +
         ' &nbsp;|&nbsp; Año calendario (ene–dic), todos los años modelo</div></div>';
    h += '<div style="height:4px;background:linear-gradient(90deg,#bb162b,#ef4444 40%,#0b1f3a);"></div>';
    // KPIs
    var tiles = [
        { k: 'Avance global', v: _crPct(T.progress), d: _crDelta(T.deltaPp, ' pp') + ' vs semana anterior', bar: _crBar(T.progress, T.prevProgress, '#2563eb') },
        { k: 'Ensayos válidos ' + m.year, v: _crNum(T.done) + ' <span style="font-size:14px;color:#64748b;font-weight:600;">de ' + _crNum(T.req) + '</span>', d: _crDelta(T.added, '') + ' esta semana' },
        { k: 'Pendientes', v: _crNum(T.pending), d: 'para cubrir el REQ de ' + _crNum(T.vol) + ' unidades producidas' },
        { k: 'Familias cumplidas', v: T.ok + ' <span style="font-size:14px;color:#64748b;font-weight:600;">de ' + T.withReq + '</span>',
          d: T.fail ? '<span style="color:#b91c1c;font-weight:700;">' + T.fail + ' no concordante' + (T.fail > 1 ? 's' : '') + '</span>' : 'ninguna no concordante' }
    ];
    h += '<table role="presentation" class="cr-tiles" style="width:100%;border-collapse:separate;border-spacing:10px;margin:6px 0 0;"><tr>';
    tiles.forEach(function(t) {
        h += '<td class="cr-tile" style="width:25%;vertical-align:top;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;">' +
             '<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">' + t.k + '</div>' +
             '<div style="font-size:28px;font-weight:800;color:#0b1f3a;margin-top:4px;line-height:1.1;">' + t.v + '</div>' +
             (t.bar ? '<div style="margin-top:8px;">' + t.bar + '</div>' : '') +
             '<div style="font-size:12px;color:#475569;margin-top:6px;">' + t.d + '</div></td>';
    });
    h += '</tr></table>';
    // Avisos de datos
    var notes = [];
    if (m.missingMonths.length) {
        notes.push('<b>Producción incompleta:</b> el plan importado no trae ' + _crMonthsList(m.missingMonths) + ' ' + m.year +
                   (m.realMonths.length ? ' (con producción real capturada en ' + _crMonthsList(m.realMonths) + ')' : '') +
                   '. Esos meses cuentan como 0 hasta capturar lo producido; el REQ puede subir.');
    }
    if (!m.prevFromSaved) notes.push('Sin corte guardado de la semana anterior: los ensayos de la semana pasada salen por su fecha de prueba y la producción se compara contra la de hoy.');
    if (notes.length) {
        h += '<div style="margin:6px 10px 0;padding:10px 14px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;color:#78350f;font-size:12px;line-height:1.5;">⚠ ' + notes.join('<br>⚠ ') + '</div>';
    }
    // Regiones
    m.regions.forEach(function(rg) {
        var R = rg.total;
        h += '<div style="margin:22px 10px 0;">';
        h += '<table role="presentation" class="cr-rh" style="width:100%;border-collapse:collapse;"><tr>' +
             '<td style="font-size:18px;font-weight:800;color:#0b1f3a;">' + _crEsc(rg.label) +
             ' <span style="font-size:13px;color:#64748b;font-weight:600;">· ' + R.families + ' familia' + (R.families === 1 ? '' : 's') + ' · ' + _crNum(R.vol) + ' unidades</span></td>' +
             '<td style="text-align:right;font-size:13px;color:#334155;white-space:nowrap;"><b>' + _crPct(R.progress) + '</b> de avance · ' +
             _crNum(R.done) + '/' + _crNum(R.req) + ' ensayos · ' + _crDelta(R.added, '') + ' sem.</td></tr></table>';
        h += '<div style="margin:8px 0 10px;">' + _crBar(R.progress, R.prevProgress, '#0b1f3a') + '</div>';
        h += '<table class="cr-fam" style="width:100%;border-collapse:collapse;font-size:12px;">';
        h += '<tr class="cr-head" style="background:#f1f5f9;color:#475569;text-transform:uppercase;font-size:10px;letter-spacing:0.05em;">' +
             '<th style="text-align:left;padding:8px;">Familia</th>' +
             '<th style="text-align:right;padding:8px;">Producción ' + m.year + '</th>' +
             '<th style="text-align:right;padding:8px;">REQ</th>' +
             '<th style="text-align:right;padding:8px;">Hechas</th>' +
             '<th style="text-align:right;padding:8px;">Semana</th>' +
             '<th style="text-align:right;padding:8px;">Faltan</th>' +
             '<th style="text-align:left;padding:8px;min-width:120px;">Avance</th>' +
             '<th style="text-align:left;padding:8px;">Estatus</th></tr>';
        var lastGroup = null;
        rg.rows.forEach(function(r) {
            if (r.group.id !== lastGroup) {
                lastGroup = r.group.id;
                h += '<tr class="cr-grp"><td colspan="8" style="padding:10px 8px 4px;font-size:11px;font-weight:800;color:#bb162b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e2e8f0;">' + _crEsc(r.group.label) + '</td></tr>';
            }
            var tone = COP_REP_TONE[r.status.id] || COP_REP_TONE.none;
            var sub = [];
            if (r.mys.length) sub.push('MY ' + r.mys.map(function(x) { return String(x).replace(/\s*MODEL/i, ''); }).join(' + '));
            if (r.verdict || r.done) sub.push('veredicto: ' + _crVerdictText(r.verdict));
            if (r.lastTest) sub.push('último ensayo ' + _crDay(r.lastTest));
            if (r.noPlan) sub.push('sin producción en el plan');
            h += '<tr class="cr-row" style="border-bottom:1px solid #f1f5f9;">' +
                 '<td class="cr-name" style="padding:8px;vertical-align:top;"><div style="font-weight:700;color:#0f172a;">' + _crEsc(r.label) + '</div>' +
                 '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + sub.join(' · ') + '</div></td>' +
                 '<td data-l="Producción" style="padding:8px;text-align:right;vertical-align:top;font-variant-numeric:tabular-nums;">' + _crNum(r.vol) +
                 (r.volDelta ? '<div style="font-size:11px;">' + _crDelta(r.volDelta, '') + '</div>' : '') + '</td>' +
                 '<td data-l="REQ" style="padding:8px;text-align:right;vertical-align:top;font-weight:700;">' + r.req +
                 (r.req && r.req !== r.prevReq ? '<div style="font-size:11px;">' + _crDelta(r.req - r.prevReq, '') + '</div>' : '') + '</td>' +
                 '<td data-l="Hechas" style="padding:8px;text-align:right;vertical-align:top;font-weight:700;">' + r.done + '</td>' +
                 '<td data-l="Semana" style="padding:8px;text-align:right;vertical-align:top;">' + _crDelta(r.added, '') + '</td>' +
                 '<td data-l="Faltan" style="padding:8px;text-align:right;vertical-align:top;font-weight:700;color:' + (r.pending ? '#9f1239' : '#94a3b8') + ';">' + (r.pending || '—') + '</td>' +
                 '<td class="cr-bar" style="padding:8px;vertical-align:top;">' + _crBar(r.progress, r.prevProgress, tone.bar) +
                 '<div style="font-size:11px;color:#475569;margin-top:3px;">' + _crPct(r.progress) + ' ' + (r.deltaPp ? _crDelta(r.deltaPp, ' pp') : '') + '</div></td>' +
                 '<td class="cr-st" style="padding:8px;vertical-align:top;">' + _crPill(r.status) + '</td></tr>';
        });
        h += '</table></div>';
    });
    if (!m.rows.length) {
        h += '<div style="margin:24px 10px;padding:20px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:12px;">No hay familias del alcance CoP con producción o ensayos en ' + m.year + '.</div>';
    }
    // Notas
    var foot = [];
    // [3.13.0] La regla de cada región, tal como la pide corporativo.
    var ruleLines = m.regions.filter(function(rg) { return rg.rows.length; }).map(function(rg) {
        return '<b>' + _crEsc(rg.label) + ':</b> ' + rg.rules.map(copYearRuleText).join('; ') + '.';
    });
    foot.push('<b>Regla de muestreo</b> (año calendario). ' + (ruleLines.length ? ruleLines.join(' ') : copYearRuleText('lot') + '.') +
              ' Los ensayos deben resultar concordantes (muestreo secuencial del CoP).');
    foot.push('<b>Cuentan</b> los ensayos aprobados y válidos para CoP con fecha de prueba en ' + m.year + ' hasta el corte. El avance de cada región y el global suman lo cubierto de cada familia hasta su REQ: los ensayos de más en una familia no cubren a otra.');
    var nc = Object.keys(m.nonCopPurposes);
    if (nc.length) foot.push('Incluye ensayos con propósito distinto de CoP: ' + nc.map(function(k) { return _crEsc(k) + ' (' + m.nonCopPurposes[k] + ')'; }).join(', ') + '.');
    // Lo que quedó fuera (excluidas, sin producción, fuera del alcance) NO se menciona en el
    // reporte que se comparte (decisión del laboratorio): la app lo lista en su barra.
    h += '<div style="margin:22px 10px 0;padding:12px 14px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;line-height:1.6;">' + foot.join('<br>') +
         '<br>Comparación contra el corte del ' + _crEsc(_crDay(m.prevCut)) + (m.prevFromSaved ? ' (corte guardado)' : '') + '.' +
         (opts.generatedAt ? ' Generado ' + _crEsc(opts.generatedAt) + (opts.generatedBy ? ' por ' + _crEsc(opts.generatedBy) : '') + '.' : '') + '</div>';
    h += '<div style="height:10px;background:#0b1f3a;border-radius:0 0 14px 14px;margin-top:12px;"></div>';
    h += '</div>';
    return h;
}

/** Documento completo (para imprimir, descargar o abrir aparte). PURA. */
function copYearReportDocument(m, opts) {
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
           '<title>CoP ' + m.year + ' — semana ' + m.week + '</title>' +
           '<style>@page{size:letter landscape;margin:10mm}body{margin:0;padding:16px;background:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
           '@media print{body{padding:0}tr{page-break-inside:avoid}}' +
           // En pantalla angosta la tabla se vuelve una tarjeta por familia (el correo
           // ignora estas reglas y se queda con la tabla, que es lo que se lee en escritorio).
           '@media screen and (max-width:640px){body{padding:8px}' +
           '.cr-tiles,.cr-tiles tbody,.cr-tiles tr{display:block}.cr-tiles{border-spacing:0!important}' +
           '.cr-tile{display:inline-block!important;width:calc(50% - 6px)!important;box-sizing:border-box;margin:3px 0;vertical-align:top}' +
           '.cr-tile div[style*="font-size:28px"]{font-size:22px!important}' +
           '.cr-rh,.cr-rh tbody,.cr-rh tr,.cr-rh td{display:block;text-align:left!important}' +
           '.cr-fam,.cr-fam tbody{display:block}.cr-fam .cr-head{display:none}.cr-fam .cr-grp,.cr-fam .cr-grp td{display:block}' +
           '.cr-fam tr.cr-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));padding:6px 0;border-bottom:1px solid #e2e8f0!important}' +
           '.cr-fam tr.cr-row td{display:block;text-align:left!important;padding:3px 6px!important}' +
           '.cr-fam td.cr-name{grid-column:1/-1}.cr-fam td.cr-bar{grid-column:1/4}.cr-fam td.cr-st{grid-column:4/-1;text-align:right!important}' +
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

function _copRepProduction(year, inScope) {
    return copYearProduction({
        year: year, months: (typeof tpMonths === 'function') ? tpMonths() : [],
        planData: (typeof tpState !== 'undefined' && tpState.planData) ? tpState.planData : [],
        inScope: inScope, keyOf: tpFamilyKeyForCfg,
        ruleOf: (typeof copHqRuleFor === 'function') ? function(c) { return copHqRuleFor(c); } : null,
        actuals: (copState.yearProd && copState.yearProd[year]) || {}
    });
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
        verdictOf: function(k, tests) { return _copRepVerdict(tests); },
        prevSaved: cuts[_copRepAddDays(copRepMonday(cut), -7)] || null,
        exclude: copState.yearExclude || {},
        outOfScope: outOfScope
    });
    _copRepCache = { key: key, model: model };
    return model;
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
    return { model: m, doc: copYearReportDocument(m, {
        generatedAt: localDateStr(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
        generatedBy: who }) };
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
    var fb = document.getElementById('cop-rep-fam-btn');
    if (fb && typeof uiExplainDisabled === 'function') uiExplainDisabled(fb, canEdit ? '' : 'Decidir qué familias van al reporte pide el permiso de administrar el plan.');
}

/** Lo que NO va en el reporte compartido, para que el laboratorio lo vea (solo en la app). */
function _copRepLeftOutHTML(m) {
    var parts = [];
    if (m.excluded.length) parts.push('excluidas por el laboratorio: ' + m.excluded.map(function(x) { return _crEsc(x.label) + (x.reason ? ' (' + _crEsc(x.reason) + ')' : ''); }).join('; '));
    if (m.noProduction.length) parts.push('sin producción en ' + m.year + ' (con ensayos): ' + m.noProduction.map(function(x) { return _crEsc(x.label); }).join('; '));
    if (m.outOfScope.length) parts.push('fuera del alcance CoP: ' + m.outOfScope.map(function(x) { return _crEsc(x.label) + ' (' + _crNum(x.vol) + ')'; }).join('; '));
    return parts.length ? '<div class="cop-rep-left">No van en el reporte — ' + parts.join(' · ') + '.</div>' : '';
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
    var html = copYearReportHTML(r.model, {});
    try {
        if (navigator.clipboard && window.ClipboardItem) {
            navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([copRepPlainText(r.model)], { type: 'text/plain' })
            })]).then(function() { showToast('Reporte copiado: pégalo en el correo.', 'success'); },
                      function() { copRepDownload(); showToast('El navegador no dejó copiar: se descargó el HTML.', 'warning'); });
            return;
        }
    } catch (e) {}
    copRepDownload();
    showToast('El navegador no deja copiar con formato: se descargó el HTML.', 'warning');
}

/** Resumen en texto plano (para el portapapeles sin formato y el aviso). PURA. */
function copRepPlainText(m) {
    var L = ['CoP ' + m.year + ' — estatus al corte ' + _crDay(m.cut) + ' (semana ' + m.week + ')',
             'Avance global ' + _crPct(m.total.progress) + ' · ' + m.total.done + '/' + m.total.req + ' ensayos · ' +
             (m.total.added >= 0 ? '+' : '') + m.total.added + ' esta semana · faltan ' + m.total.pending];
    m.regions.forEach(function(rg) {
        L.push('', rg.label + ': ' + _crPct(rg.total.progress) + ' (' + rg.total.done + '/' + rg.total.req + ')');
        rg.rows.forEach(function(r) {
            L.push('  · ' + r.label + ' — ' + _crNum(r.vol) + ' u · ' + r.done + '/' + r.req +
                   (r.added ? ' (+' + r.added + ')' : '') + ' · ' + r.status.label);
        });
    });
    return L.join('\n');
}

// ─── Producción real (lo que el plan no trae) ──────────────────────────────────
function copRepProdOpen() {
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'capturar la producción real del año')) return;
    var cut = _copRepUi.cut || localToday();
    var year = Number(cut.slice(0, 4));
    var m = copYearReportModel({ cutIso: cut, force: true });
    var actual = (copState.yearProd && copState.yearProd[year]) || {};
    var body = '<p style="font-size: var(--fs-sm);margin:0 0 var(--space-sm);">Lo que captures aquí manda sobre el plan importado en ese mes. ' +
               'Deja vacío lo que no sepas: se queda lo del plan' + (m.missingMonths.length ? ' (el plan no trae ' + _crMonthsList(m.missingMonths) + ')' : '') + '.</p>';
    body += '<div class="cop-rep-prod-wrap"><table class="cop-rep-prod"><thead><tr><th>Familia</th>';
    _COP_REP_MONTHS.forEach(function(mo) { body += '<th>' + mo + '</th>'; });
    body += '</tr></thead><tbody>';
    m.rows.forEach(function(r) {
        var a = actual[r.key] && actual[r.key].m ? actual[r.key].m : [];
        body += '<tr data-key="' + _crEsc(r.key) + '"><td class="cop-rep-prod-fam">' + _crEsc(r.label) + '</td>';
        for (var i = 0; i < 12; i++) {
            var v = (a[i] === null || a[i] === undefined) ? '' : a[i];
            var plan = r.monthSrc[i] === 'sin-dato' ? '—' : String(r.fam.plan ? r.fam.plan[i] : r.months[i]);
            body += '<td><input type="number" min="0" step="1" inputmode="numeric" aria-label="' + _crEsc(r.label + ' · ' + _COP_REP_MONTHS[i]) + '" ' +
                    'data-mi="' + i + '" value="' + _crEsc(v) + '" placeholder="' + _crEsc(plan) + '"></td>';
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
function copRepSubject(m) {
    return 'CoP ' + m.year + ' · semana ' + m.week + ' — ' + _crPct(m.total.progress) + ' de avance (' +
           m.total.done + '/' + m.total.req + ' ensayos' + (m.total.added ? ', +' + m.total.added + ' esta semana' : '') + ')';
}
