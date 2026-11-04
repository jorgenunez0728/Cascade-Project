// ═══════════════════════════════════════════════════════════════════════════════
// [3.29.0] RESUMEN DEL AÑO (Plan → 🧮 Resumen del año)
//
// Dos preguntas en una pantalla:
//  1. ¿Cuánto se ha probado este año, y de qué? — por familia, modelo, región, carrocería,
//     regulación, motor o transmisión (los mismos campos de los filtros), de mayor a menor,
//     con lo agendado hasta el 31 dic al lado.
//  2. ¿Qué quedaría como lo más importante al 31 dic si se hace lo agendado? — el score de
//     la tabla de prioridad hoy contra el de la proyección (tpProjectedAnalysis), familia
//     por familia, con el desglose de puntos.
//
// Las definiciones de las que sale todo: tpCalendarTests (qué se probó y qué día),
// tpPlanRowsUntil (qué dice el plan), tpGetAnalysis / tpProjectedAnalysis (el score).
// Este archivo no calcula ningún número propio: agrupa y compara.
// ═══════════════════════════════════════════════════════════════════════════════

/** Los campos por los que se agrupa, en el orden de los filtros del Plan. */
var YS_DIMS = [
    ['fam', 'Familia'], ['mod', 'Modelo'], ['rgn', 'Región'], ['body', 'Carrocería'],
    ['reg', 'Regulación'], ['eng', 'Motor'], ['tx', 'Transmisión']
];
/** Qué pruebas cuentan en el resumen. */
var YS_SCOPES = [
    ['req', 'Cuentan para el REQ'], ['cop', 'Solo CoP'], ['all', 'Todas']
];
var YS_MONTHS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
var YS_MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Cuántas familias se comparan en la prioridad. */
var YS_SCORE_TOP = 15;

/**
 * [3.33.0] Los textos de la pantalla en los dos idiomas. Solo cambia lo que se LEE: el modelo,
 * las claves y los datos (nombres de familia, regiones) son los mismos. Todo texto nuevo de esta
 * pantalla va en `es` y `en` a la vez (tests/plan.node.js revisa que tengan las mismas claves).
 */
var YS_LANGS = [['es', 'Español'], ['en', 'English']];
var YS_TXT = {
    es: {
        dims: { fam: 'Familia', mod: 'Modelo', rgn: 'Región', body: 'Carrocería', reg: 'Regulación', eng: 'Motor', tx: 'Transmisión' },
        scopes: { req: 'Cuentan para el REQ', cop: 'Solo CoP', all: 'Todas' },
        months: ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
        monthsLong: YS_MONTHS_LONG,
        title: 'Resumen del año', lang: 'Idioma',
        lead: 'Lo probado de enero a hoy, de mayor a menor, y lo agendado en el plan semanal hasta el 31 dic. Cada prueba cuenta en su <strong>día de prueba</strong>.',
        groupBy: 'Agrupar por', which: 'Qué pruebas', countProps: 'Contar las propuestas sin aceptar',
        mDone: 'Probadas en {y}', mSched: 'Agendadas hasta el 31 dic', mProp: 'En propuesta', mProj: 'Proyección al 31 dic',
        mCorr: 'Correlación agendada', mCorrProp: ' · +{n} en propuesta',
        emptyCop: 'No hay pruebas de CoP registradas ni agendadas en {y}.', empty: 'No hay pruebas registradas ni agendadas en {y}.',
        hDone: 'Probadas', hMonths: 'Por mes', hSched: 'Agendadas', hProj: 'Al 31 dic',
        first25: 'Ver solo las primeras 25', all: 'Ver todas ({n})',
        lgDone: 'probadas', lgSched: 'agendadas', lgProps: ' (con propuestas)', lgFut: 'los meses que vienen van en gris claro',
        noFam: '(sin familia)', noData: '(sin dato)',
        scTitle: 'Prioridad: hoy y al 31 dic',
        scLead: 'Si se hacen las <b>{n}</b> pruebas agendadas{p}, así quedaría la tabla de prioridad el <b>31 dic</b>: bajan los pendientes de lo que se prueba y suben los días sin probar de lo que no. Mismo cálculo que el armador; {link} no se toca.',
        scLeadProps: ' (con las propuestas)', scLink: 'la tabla',
        scErr: 'No se pudo calcular la proyección de la prioridad: ', scEmpty: 'No hay configuraciones en el plan de producción.',
        scFam: 'Familia', scNow: 'Hoy', scDec: '31 dic', scWhy: 'Por qué, al 31 dic',
        mvNew: 'nueva', mvNewT: 'Hoy no estaba entre las familias con score', mvUp: 'Sube {n} lugares', mvDown: 'Baja {n} lugares',
        pend: 'pend.', leaving: 'Salen del top {n}', leavingTail: ' con lo agendado: ',
        parts: null
    },
    en: {
        dims: { fam: 'Family', mod: 'Model', rgn: 'Region', body: 'Body', reg: 'Regulation', eng: 'Engine', tx: 'Transmission' },
        scopes: { req: 'Count toward REQ', cop: 'CoP only', all: 'All' },
        months: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
        monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        title: 'Year summary', lang: 'Language',
        lead: 'Tests run from January to today, from most to fewest, and what the weekly plan has scheduled through Dec 31. Each test counts on its <strong>test date</strong>.',
        groupBy: 'Group by', which: 'Which tests', countProps: 'Count proposals not yet accepted',
        mDone: 'Tested in {y}', mSched: 'Scheduled through Dec 31', mProp: 'In proposal', mProj: 'Projected by Dec 31',
        mCorr: 'Correlation scheduled', mCorrProp: ' · +{n} in proposal',
        emptyCop: 'No CoP tests recorded or scheduled in {y}.', empty: 'No tests recorded or scheduled in {y}.',
        hDone: 'Tested', hMonths: 'By month', hSched: 'Scheduled', hProj: 'By Dec 31',
        first25: 'Show only the first 25', all: 'Show all ({n})',
        lgDone: 'tested', lgSched: 'scheduled', lgProps: ' (incl. proposals)', lgFut: 'upcoming months are shown in light gray',
        noFam: '(no family)', noData: '(no data)',
        scTitle: 'Priority: today and on Dec 31',
        scLead: 'If the <b>{n}</b> scheduled tests are run{p}, this is how the priority table would look on <b>Dec 31</b>: pending tests go down for what gets tested and days since last test go up for what does not. Same calculation as the week builder; {link} is not changed.',
        scLeadProps: ' (including proposals)', scLink: 'the table',
        scErr: 'Could not calculate the priority projection: ', scEmpty: 'There are no configurations in the production plan.',
        scFam: 'Family', scNow: 'Today', scDec: 'Dec 31', scWhy: 'Why, on Dec 31',
        mvNew: 'new', mvNewT: 'Not among the scored families today', mvUp: 'Up {n} places', mvDown: 'Down {n} places',
        pend: 'pending', leaving: 'Leaving the top {n}', leavingTail: ' with what is scheduled: ',
        parts: { reg: 'Regulation', act: 'Activity', fam: 'Family', pend: 'Pending', year: 'Tested this year', days: 'Not tested',
                 vol: 'Volume', 'new': 'New configuration', audit: 'Audit', deadline: 'Deadline', aging: 'Postponed' }
    }
};
/** El texto `k` en el idioma `lang`, con {marcas} reemplazadas. PURA. */
function tpYearText(lang, k, vars) {
    var d = YS_TXT[lang] || YS_TXT.es;
    var t = d[k] !== undefined ? d[k] : YS_TXT.es[k];
    if (typeof t !== 'string') return t;
    return vars ? t.replace(/\{(\w+)\}/g, function(m, n) { return vars[n] !== undefined ? vars[n] : m; }) : t;
}

/**
 * El valor de una prueba en un campo. PURA. x = {cfg, famKey, famLabel}.
 * [3.32.1] La familia es la del SCORE (tpScoreFamKey / tpScoreFamLabel): donde el laboratorio
 * junta años modelo (MY26+27) y carrocerías del WVTA (CL4MH 5DR + WGN), aquí también.
 */
function tpYearDimKey(x, dim) {
    if (dim === 'fam' && x && x.famKey) return 'fk:' + x.famKey;
    return tpYearDimValue(x, dim);
}
function tpYearDimValue(x, dim) {
    if (dim === 'fam') return String((x && x.famLabel) || '').trim() || '(sin familia)';
    var v = String((x && x.cfg && x.cfg[dim]) == null ? '' : x.cfg[dim]).trim();
    return (v && v !== '0' && v !== '-') ? v : '(sin dato)';
}

/**
 * LA definición del resumen del año. PURA.
 * src = {year, dim, scope:'req'|'cop'|'all', proposals,
 *        tests:[{date, cfg, famKey, famLabel, req, cop}]            ← lo probado en el año
 *        planned:[{date, cfg, famKey, famLabel, req, cop, proposal}] ← lo agendado hasta el 31 dic
 *        corr:{sched, prop}}
 * Agrupa por el campo, de mayor a menor por lo probado. "Proyección" = probadas + agendadas
 * (+ propuestas si `proposals`). Lo que no cumple el alcance elegido no se cuenta.
 */
function tpYearSummaryModel(src) {
    src = src || {};
    var dim = src.dim || 'fam', scope = src.scope || 'req', withProp = !!src.proposals;
    var pass = function(x) { return scope === 'all' || (scope === 'cop' ? !!x.cop : !!x.req); };
    var groups = {}, T = { done: 0, sched: 0, prop: 0, proj: 0, groups: 0 };
    var g = function(x) {
        var k = tpYearDimKey(x, dim);
        return groups[k] || (groups[k] = { key: k, label: tpYearDimValue(x, dim), done: 0, sched: 0, prop: 0, months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    };
    (src.tests || []).forEach(function(x) {
        if (!x || !pass(x)) return;
        var e = g(x), m = Number(String(x.date || '').slice(5, 7));
        e.done++; T.done++;
        if (m >= 1 && m <= 12) e.months[m - 1]++;
    });
    (src.planned || []).forEach(function(x) {
        if (!x || !pass(x)) return;
        var e = g(x);
        if (x.proposal) { e.prop++; T.prop++; } else { e.sched++; T.sched++; }
    });
    var rows = Object.keys(groups).map(function(k) {
        var e = groups[k];
        e.proj = e.done + e.sched + (withProp ? e.prop : 0);
        return e;
    });
    rows.sort(function(a, b) { return (b.done - a.done) || (b.proj - a.proj) || (a.label < b.label ? -1 : 1); });
    T.proj = T.done + T.sched + (withProp ? T.prop : 0);
    T.groups = rows.length;
    var maxMonth = 0, maxDone = 0;
    rows.forEach(function(r) { maxDone = Math.max(maxDone, r.proj); r.months.forEach(function(v) { maxMonth = Math.max(maxMonth, v); }); });
    return { year: src.year, dim: dim, scope: scope, proposals: withProp, rows: rows, total: T,
             corr: src.corr || { sched: 0, prop: 0 }, maxMonth: maxMonth, maxDone: maxDone };
}

/**
 * LA comparación de prioridad hoy contra la proyección. PURA.
 * now/proj = filas del análisis (tpGetAnalysis / tpProjectedAnalysis().rows), con `score`.
 * opts = {keyOf(row), labelOf(row), partsOf(row) → [{k,label,pts,why}], pendOf(row), skip(row), top}
 * Por familia del score se toma la configuración de mayor score (la que el armador pondría
 * primero). Devuelve las `top` de la proyección con su lugar hoy, más las que salen del top.
 */
function tpYearScoreCompare(now, proj, opts) {
    opts = opts || {};
    var top = opts.top || YS_SCORE_TOP;
    var best = function(list) {
        var m = {};
        (list || []).forEach(function(r) {
            if (!r || (opts.skip && opts.skip(r))) return;
            var k = opts.keyOf(r);
            if (!m[k] || r.score > m[k].score) m[k] = r;
        });
        var arr = Object.keys(m).map(function(k) { return { key: k, row: m[k] }; });
        arr.sort(function(a, b) { return (b.row.score - a.row.score) || (a.key < b.key ? -1 : 1); });
        arr.forEach(function(x, i) { x.rank = i + 1; });
        var idx = {};
        arr.forEach(function(x) { idx[x.key] = x; });
        return { arr: arr, idx: idx };
    };
    var N = best(now), P = best(proj);
    var side = function(x) {
        return x ? { score: x.row.score, rank: x.rank, pend: opts.pendOf ? opts.pendOf(x.row) : 0,
                     parts: opts.partsOf ? opts.partsOf(x.row) : [] } : null;
    };
    var rows = P.arr.slice(0, top).map(function(x) {
        var n = N.idx[x.key] || null;
        return { key: x.key, label: opts.labelOf ? opts.labelOf(x.row) : x.key,
                 now: side(n), proj: side(x),
                 delta: n ? Math.round((x.row.score - n.row.score) * 10) / 10 : null,
                 move: n ? n.rank - x.rank : null };
    });
    var inTop = {};
    rows.forEach(function(r) { inTop[r.key] = true; });
    var leaving = N.arr.slice(0, top).filter(function(x) { return !inTop[x.key]; }).map(function(x) {
        var p = P.idx[x.key] || null;
        return { key: x.key, label: opts.labelOf ? opts.labelOf(x.row) : x.key, now: side(x), proj: side(p) };
    });
    return { rows: rows, leaving: leaving, families: P.arr.length };
}

// ─── Lo que lee del laboratorio (no PURO) ────────────────────────────────────────

/** Una configuración desde la clave de familia (respaldo cuando el catálogo no la tiene). */
function _ysCfgFromFamKey(fk) {
    var p = String(fk || '').split('|');
    return { mod: p[0] || '', eng: p[1] || '', tx: p[2] || '', my: p[3] || '', reg: p[4] || '', ep: p[5] || '', engpkg: p[6] || '', body: p[7] || '', rgn: '' };
}
/** [3.32.1] La familia del score de una configuración: {famKey, famLabel}. */
function _ysFam(cfg, fallback) {
    if (!cfg) return { famKey: '', famLabel: fallback || '' };
    var key = typeof tpScoreFamKey === 'function' ? tpScoreFamKey(cfg) : tpFamilyKeyForCfg(cfg);
    var label = typeof tpScoreFamLabel === 'function' ? tpScoreFamLabel(cfg) : tpFamilyShortLabel(cfg);
    return { famKey: key, famLabel: label || fallback || '' };
}
/** La configuración de una prueba del calendario: catálogo, su vehículo, o la clave de familia. */
function _ysTestCfg(t) {
    var cfg = tpConfigByDesc(t.configCode);
    if (cfg) return cfg;
    if (t.vehicleId != null && typeof db !== 'undefined' && db && Array.isArray(db.vehicles) && typeof _tpCalVehicleCfg === 'function') {
        var v = db.vehicles.find(function(x) { return x && String(x.id) === String(t.vehicleId); });
        if (v) { cfg = _tpCalVehicleCfg(v); if (cfg && cfg.mod) return cfg; }
    }
    return _ysCfgFromFamKey(t.familyKey);
}
function _ysIsCop(purpose, cfg) {
    try { return typeof copPurposeCounts === 'function' && copPurposeCounts(purpose) && typeof copInScope === 'function' && copInScope(cfg).ok; }
    catch (e) { return false; }
}

/** Las pruebas del año y lo agendado hasta el 31 dic, listas para tpYearSummaryModel. */
function _tpYearSummaryInput(year) {
    var today = localToday(), from = year + '-01-01', until = year + '-12-31';
    var cal = tpCalendarTests(from, today < until ? today : until, { datedOnly: true });
    var tests = cal.all.map(function(t) {
        var cfg = _ysTestCfg(t), f = _ysFam(cfg, t.familyShort);
        return { date: t.date, cfg: cfg, famKey: f.famKey, famLabel: f.famLabel,
                 req: tpTestedCountsForReq({ purpose: t.purpose, vehicleId: t.vehicleId, source: t.source }),
                 cop: _ysIsCop(t.purpose, cfg) };
    });
    var planned = [], corr = { sched: 0, prop: 0 };
    if (today <= until) {
        tpPlanRowsUntil(today, until).weeks.forEach(function(w) {
            w.rows.forEach(function(r) {
                if (r.status !== 'open' && r.status !== 'inflight') return;
                var it = r.item;
                if (tpItemIsActivity(it)) {
                    if (it.activity === 'correlacion') { if (r.proposal) corr.prop++; else corr.sched++; }
                    return;
                }
                var cfg = tpConfigByDesc(it.desc) || it;
                var pu = it.actualPurpose || it.purpose || tpPurposeForCfg(cfg);
                var f = _ysFam(cfg);
                planned.push({ date: r.date, cfg: cfg, famKey: f.famKey, famLabel: f.famLabel, proposal: r.proposal,
                               req: tpPurposeCountsForReq(pu), cop: _ysIsCop(pu, cfg) });
            });
        });
    }
    return { tests: tests, planned: planned, corr: corr };
}

function _ysPrefs() {
    var p = (typeof uiPref === 'function' && uiPref('yearSum')) || {};
    return { dim: p.dim || 'fam', scope: p.scope || 'req', proposals: !!p.proposals, all: !!p.all,
             lang: p.lang === 'en' ? 'en' : 'es' };
}
function tpYearSummarySet(k, v) {
    var p = _ysPrefs();
    p[k] = v;
    if (typeof uiPref === 'function') uiPref('yearSum', p);
    tpRender();
}

// ─── La pantalla ─────────────────────────────────────────────────────────────────

function _ysChips(kind, list, cur) {
    return '<div class="ys-chips" role="radiogroup">' + list.map(function(o) {
        return '<button class="ys-chip" role="radio" aria-checked="' + (o[0] === cur) + '" onclick="tpYearSummarySet(\'' + kind + '\',\'' + o[0] + '\')">' +
               escapeHtml(o[1]) + '</button>';
    }).join('') + '</div>';
}
function _ysMetric(v, label, cls) {
    return '<div class="tp-metric"><div class="tp-metric-val' + (cls ? ' ' + cls : '') + '">' + v + '</div><div class="tp-metric-label">' + label + '</div></div>';
}
function _ysPartsHTML(parts, lang) {
    var names = tpYearText(lang, 'parts') || {};
    return (parts || []).filter(function(p) { return p.pts; }).sort(function(a, b) { return b.pts - a.pts; }).map(function(p) {
        return '<span class="ys-part ys-part--' + p.k + '" title="' + escapeHtml(p.why || '') + '">' + escapeHtml(names[p.k] || p.label) + ' <b>' + p.pts + '</b></span>';
    }).join('');
}

function tpRenderYearSummary(el) {
    var pr = _ysPrefs(), L = pr.lang;
    var t = function(k, v) { return tpYearText(L, k, v); };
    var year = Number(localToday().slice(0, 4));
    var inp = _tpYearSummaryInput(year);
    var M = tpYearSummaryModel({ year: year, dim: pr.dim, scope: pr.scope, proposals: pr.proposals,
                                 tests: inp.tests, planned: inp.planned, corr: inp.corr });
    var T = M.total, dims = t('dims'), scopes = t('scopes'), months = t('months'), monthsLong = t('monthsLong');
    var dimList = YS_DIMS.map(function(d) { return [d[0], dims[d[0]] || d[1]]; });
    var scopeList = YS_SCOPES.map(function(d) { return [d[0], scopes[d[0]] || d[1]]; });
    var rowLabel = function(lb) {
        if (lb === '(sin familia)') return t('noFam');
        if (lb === '(sin dato)') return t('noData');
        return lb;
    };
    var h = '<div class="tp-card ys" lang="' + L + '">';
    h += '<div class="tp-card-title" data-help="tp-yearsummary-help"><span>🧮 ' + t('title') + ' ' + year + '</span></div>';
    h += '<p class="ys-lead">' + t('lead') + '</p>';
    h += '<div class="ys-controls"><div class="ys-ctl"><span class="ys-ctl-l">' + t('groupBy') + '</span>' + _ysChips('dim', dimList, pr.dim) + '</div>' +
         '<div class="ys-ctl"><span class="ys-ctl-l">' + t('which') + '</span>' + _ysChips('scope', scopeList, pr.scope) + '</div>' +
         '<label class="ys-check u-hit"><input type="checkbox"' + (pr.proposals ? ' checked' : '') +
         ' onchange="tpYearSummarySet(\'proposals\',this.checked)"> ' + t('countProps') + '</label>' +
         '<div class="ys-ctl ys-ctl--lang"><span class="ys-ctl-l">' + t('lang') + '</span>' + _ysChips('lang', YS_LANGS, L) + '</div></div>';
    h += '<div class="tp-cal-metrics ys-metrics">' +
         _ysMetric(T.done, t('mDone', { y: year }), 'tp-cal-ok') +
         _ysMetric(T.sched, t('mSched'), 'tp-cal-warn') +
         _ysMetric(T.prop, t('mProp')) +
         _ysMetric(T.proj, t('mProj')) +
         _ysMetric(M.corr.sched, t('mCorr') + (M.corr.prop ? t('mCorrProp', { n: M.corr.prop }) : '')) + '</div>';
    if (!M.rows.length) {
        h += '<p class="ys-empty">' + t(pr.scope === 'cop' ? 'emptyCop' : 'empty', { y: year }) + '</p></div>';
    } else {
        var limit = pr.all ? M.rows.length : 25;
        var mx = Math.max(1, M.maxDone), mm = Math.max(1, M.maxMonth);
        var curM = Number(localToday().slice(5, 7));
        h += '<div class="ys-table-wrap"><table class="ys-table u-cards"><thead><tr><th>' + escapeHtml(dims[pr.dim] || dims.fam) + '</th><th>' + t('hDone') + '</th>' +
             '<th class="ys-months-h">' + t('hMonths') + '</th><th class="ys-num">' + t('hSched') + '</th><th class="ys-num">' + t('hProj') + '</th></tr></thead><tbody>';
        M.rows.slice(0, limit).forEach(function(r) {
            var wd = Math.round(100 * r.done / mx), ws = Math.round(100 * (r.sched + (pr.proposals ? r.prop : 0)) / mx);
            var ms = r.months.map(function(v, i) {
                var lvl = v ? Math.min(4, Math.ceil(4 * v / mm)) : 0;
                var fut = i + 1 > curM;
                return '<span class="ys-m ys-m--' + lvl + (fut ? ' ys-m--fut' : '') + '" title="' + monthsLong[i] + ': ' + v + '">' + months[i] + '</span>';
            }).join('');
            h += '<tr><td class="ys-label">' + escapeHtml(rowLabel(r.label)) + '</td>' +
                 '<td class="ys-bar-td"><div class="ys-bar"><span class="ys-bar-done" style="width:' + wd + '%"></span><span class="ys-bar-sched" style="width:' + ws + '%"></span></div>' +
                 '<b class="ys-bar-n">' + r.done + '</b></td>' +
                 '<td class="ys-months">' + ms + '</td>' +
                 '<td class="ys-num">' + (r.sched || '—') + (r.prop ? ' <small class="ys-prop">+' + r.prop + '</small>' : '') + '</td>' +
                 '<td class="ys-num"><b>' + r.proj + '</b></td></tr>';
        });
        h += '</tbody></table></div>';
        if (M.rows.length > 25) {
            h += '<button class="tp-btn tp-btn-ghost ys-more" onclick="tpYearSummarySet(\'all\',' + (!pr.all) + ')">' +
                 (pr.all ? t('first25') : t('all', { n: M.rows.length })) + '</button>';
        }
        h += '<div class="ys-legend"><span class="ys-sw ys-sw--done"></span> ' + t('lgDone') + ' · <span class="ys-sw ys-sw--sched"></span> ' + t('lgSched') +
             (pr.proposals ? t('lgProps') : '') + ' · ' + t('lgFut') + '</div>';
        h += '</div>';
    }
    h += _ysScoreCardHTML(pr);
    el.innerHTML = h;
}

/** La tarjeta de prioridad: hoy contra el 31 dic. */
function _ysScoreCardHTML(pr) {
    var P, C, L = pr.lang;
    var t = function(k, v) { return tpYearText(L, k, v); };
    try {
        P = tpProjectedAnalysis({ proposals: pr.proposals });
        var pendOf = function(r) { var c = r.scoreCtx || {}; return c.famDeficit !== undefined ? c.famDeficit : (c.deficit || 0); };
        C = tpYearScoreCompare(tpGetAnalysis(), P.rows, {
            keyOf: function(r) { return tpScoreFamKey(r); }, labelOf: tpScoreFamLabel, pendOf: pendOf,
            partsOf: function(r) { return tpScoreBreakdown(r, r.testedN, r.scoreCtx).parts; },
            skip: function(r) { return !!r.paused; }
        });
    } catch (e) {
        console.warn('_ysScoreCardHTML:', e);
        return '<div class="tp-card ys"><p class="ys-empty">' + t('scErr') + escapeHtml(e.message) + '</p></div>';
    }
    var h = '<div class="tp-card ys" lang="' + L + '">';
    h += '<div class="tp-card-title" data-help="tp-yearscore-help"><span>🎯 ' + t('scTitle') + '</span></div>';
    h += '<p class="ys-lead">' + t('scLead', { n: P.sim.length, p: pr.proposals ? t('scLeadProps') : '',
         link: '<a href="#" onclick="tpSwitchTab(\'tp-rules\');return false;">' + t('scLink') + '</a>' }) + '</p>';
    if (!C.rows.length) return h + '<p class="ys-empty">' + t('scEmpty') + '</p></div>';
    h += '<div class="ys-table-wrap"><table class="ys-table ys-score u-cards"><thead><tr><th class="ys-num">#</th><th>' + t('scFam') + '</th>' +
         '<th class="ys-num">' + t('scNow') + '</th><th class="ys-num">' + t('scDec') + '</th><th>' + t('scWhy') + '</th></tr></thead><tbody>';
    C.rows.forEach(function(r) {
        var mv = r.move === null ? '<span class="ys-mv ys-mv--new" title="' + t('mvNewT') + '">' + t('mvNew') + '</span>'
               : r.move > 0 ? '<span class="ys-mv ys-mv--up" title="' + t('mvUp', { n: r.move }) + '">▲' + r.move + '</span>'
               : r.move < 0 ? '<span class="ys-mv ys-mv--down" title="' + t('mvDown', { n: -r.move }) + '">▼' + (-r.move) + '</span>' : '<span class="ys-mv">=</span>';
        var pend = function(s) { return s ? '<small>' + s.pend + ' ' + t('pend') + '</small>' : ''; };
        h += '<tr><td class="ys-num"><b>' + r.proj.rank + '</b> ' + mv + '</td>' +
             '<td class="ys-label">' + escapeHtml(r.label) + '</td>' +
             '<td class="ys-num" data-label="' + t('scNow') + '">' + (r.now ? r.now.score + '<br>' + pend(r.now) + '<br><small>#' + r.now.rank + '</small>' : '—') + '</td>' +
             '<td class="ys-num" data-label="' + t('scDec') + '"><b>' + r.proj.score + '</b>' +
             (r.delta ? ' <small class="' + (r.delta < 0 ? 'ys-down' : 'ys-up') + '">' + (r.delta > 0 ? '+' : '−') + Math.abs(r.delta) + '</small>' : '') +
             '<br>' + pend(r.proj) + '</td>' +
             '<td class="ys-parts">' + _ysPartsHTML(r.proj.parts, L) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    if (C.leaving.length) {
        h += '<p class="ys-leaving"><b>' + t('leaving', { n: YS_SCORE_TOP }) + '</b>' + t('leavingTail') + C.leaving.map(function(x) {
            return escapeHtml(x.label) + ' (' + x.now.score + ' → ' + (x.proj ? x.proj.score : '—') + ')';
        }).join(' · ') + '.</p>';
    }
    return h + '</div>';
}

if (typeof HELP_TABS !== 'undefined') Object.assign(HELP_TABS, {
    'tp-yearsummary': {
        title: 'Resumen del año',
        text: 'Cuánto se ha probado este año y de qué, de mayor a menor, agrupado por familia, modelo, región, carrocería, regulación, motor o transmisión. Al lado, lo agendado hasta el 31 dic y cómo quedaría la tabla de prioridad si se hace.',
        tips: ['"Cuentan para el REQ" deja fuera lo que no acredita el REQ (OBD II, por ejemplo); "Solo CoP" deja solo CoP · Emisiones del alcance; "Todas" cuenta todo.',
               'Una propuesta sin aceptar no cuenta como agendada salvo que marques "Contar las propuestas sin aceptar".',
               'La prioridad al 31 dic usa la misma tabla que el armador: bajan los pendientes de lo que se va a probar y suben los días sin probar de lo que no.']
    }
});
if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'tp-yearsummary-help': { title: 'Resumen del año', text: 'Cada prueba cuenta en su día de prueba (el mismo calendario del Plan). "Al 31 dic" = probadas + agendadas en planes aceptados (y las propuestas, si las cuentas). La tira de meses va de enero a diciembre; más oscuro = más pruebas ese mes.' },
    'tp-yearscore-help': { title: 'Prioridad al 31 dic', text: 'El score de cada familia hoy y el que tendría el 31 dic si se hacen las pruebas agendadas. Es el mismo cálculo del armador (Plan → Reglas → Tabla de prioridad); aquí solo se simula. ▲/▼ = lugares que sube o baja. "Pend." = pruebas que le faltan.' }
});
