// [2.32.0] El calendario de pruebas y el REQ mensual, probados sin DOM.
// Regla del laboratorio: una prueba sale en su DÍA DE PRUEBA y sólo ahí. Si se liberó
// el jueves pero trae fecha de prueba del martes, el calendario la pone el martes.
const fs = require('fs');
const vm = require('vm');

const store = {};
const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i],
    get length() { return Object.keys(store).length; }
};
const noop = () => {};
// Un elemento simulado que se devuelve a si mismo: el codigo bajo prueba renderiza
// de verdad (tpUpdateBadges, _tpBoardRepaint), y stubear null lo hace reventar por
// razones que no tienen nada que ver con lo que se esta probando.
function _el() {
    const e = {
        textContent: '', value: '', innerHTML: '', style: {}, dataset: {}, isConnected: false,
        classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
        setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
        appendChild: noop, removeChild: noop, remove: noop, insertAdjacentHTML: noop,
        addEventListener: noop, removeEventListener: noop, focus: noop, click: noop,
        scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
        closest: () => null, contains: () => false, children: [], parentElement: null
    };
    e.querySelector = () => e;
    e.querySelectorAll = () => [];
    e.getElementById = () => e;
    e.createElement = () => _el();
    e.body = e;
    e.documentElement = e;
    return e;
}
const sandbox = {
    localStorage, console,
    // Un elemento simulado, no null: funciones del propio archivo (tpUpdateBadges)
    // escriben en el DOM y las estamos ejecutando de verdad.
    document: _el(),
    showToast: noop, showConfirmDialog: () => Promise.resolve(false), showConfirm: noop, showModal: noop,
    auditLog: noop, undoPush: noop, undoPop: noop, authRequire: () => true, authCan: () => true,
    authGetCurrentUser: () => ({ name: 'Test' }),
    localToday: () => '2026-09-09',
    localDateStr: d => new Date(d).toISOString().slice(0, 10),
    safeParse: (k, d) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } },
    debounce: fn => fn, emitEvent: noop, setTimeout, clearTimeout, requestAnimationFrame: noop,
    Chart: function () {}, CSV_CONFIGURATIONS: '', allConfigurations: [],
    db: { vehicles: [] }, invState: { gases: [] },
    tpUpdateBadges: noop, tpRender: noop, cascadeInjectTooltipsDeferred: noop,
    CASCADE_TOOLTIPS: {}, uiCard: null, a11yClickables: noop, gridDragInit: noop,
    tabCacheInvalidate: noop, fbPush: noop, _tabCache: {}, tabCacheSwitch: noop, tabCacheInit: noop, tabCacheGet: () => null, helpBannerHTML: () => '',
    helpInjectBannerDeferred: noop, a11yTablist: noop, a11yTablistSync: noop, _tpBoardRepaint: noop,
    cascadeVehicleStage: () => null, cascadeVehicleETA: () => null,
    _normalizeRegulation: r => r || 'N/A',
    Object, Array, Math, Date, JSON, String, Number, Set, Map, parseInt, parseFloat, isNaN
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// [2.30.0] Qué es "en curso" vive en app.js (vehicleIsLive): se toma del código real.
vm.runInContext(/function _vehTombKey[\s\S]*?\nfunction vehicleIsTombstoned\(v, list\) \{[\s\S]*?\n\}/.exec(fs.readFileSync('js/app.js', 'utf8'))[0], sandbox);
vm.runInContext(/var VEHICLE_STATUS_HISTORIC = [\s\S]*?\nfunction vehicleListDate\(v\) \{[\s\S]*?\n\}/.exec(fs.readFileSync('js/app.js', 'utf8'))[0], sandbox);
sandbox.TextEncoder = TextEncoder; sandbox.Uint8Array = Uint8Array;
vm.runInContext(fs.readFileSync('js/xlsxw.js', 'utf8'), sandbox, { filename: 'xlsxw.js' });
const src = fs.readFileSync('js/testplan.js', 'utf8') + '\nvar __getTp = function(){ return tpState; };\n';
try { vm.runInContext(src, sandbox, { filename: 'testplan.js' }); }
catch (e) { console.error('NO CARGA:', e.message); process.exit(1); }

let pass = 0, fail = 0;
function t(nombre, fn) {
    try { fn(); console.log('  ok  ' + nombre); pass++; }
    catch (e) { console.log('  FAIL ' + nombre + '\n       ' + e.message); fail++; }
}
function ok(c, msg) { if (!c) throw new Error(msg || 'falso'); }
function eq(a, b, msg) {
    if (a !== b) throw new Error((msg || '') + ' esperaba ' + JSON.stringify(b) + ', dio ' + JSON.stringify(a));
}
const S = sandbox.__getTp();

// Semana del 28-sep-2026 (lunes). Hoy es miércoles 30.
const cfgA = { id: 'a', desc: 'CL4 SULEV 5DR R16', mod: 'CL4', eng: '1600cc GAMMA', tx: 'IVT', my: '26 MODEL', reg: 'SULEV 30', ep: '0', engpkg: '0', body: '5DR', rgn: 'USA', hist: 0, total: 0, m: [] };
const cfgB = Object.assign({}, cfgA, { id: 'b', desc: 'CL4 SULEV WGN', body: 'WGN' });
S.planData = [cfgA, cfgB];
const famA = sandbox.tpFamilyKeyForCfg(cfgA);
const veh = (id, vin, status, testDt, extra) => Object.assign({ id, vin, status, configCode: cfgA.desc, purpose: 'Emisiones',
    config: {}, testData: testDt ? { testDatetime: testDt } : {}, archivedAt: '2026-09-17T15:00:00' }, extra || {});

console.log('Calendario de pruebas');
t('fechas sin zona horaria', () => {
    eq(sandbox.tpIsoAddDays('2026-09-28', 6), '2026-10-04');
    eq(sandbox.tpIsoAddDays('2026-12-31', 1), '2027-01-01');
    eq(sandbox.tpIsoWeekday('2026-09-15'), 2, 'el 15-sep-2026 es martes');
    eq(sandbox.tpWeekDayIso('2026-09-28', 'lun'), '2026-09-28');
    eq(sandbox.tpWeekDayIso('2026-09-28', 'vie'), '2026-10-02');
    eq(sandbox.tpWeekDayIso('2026-09-28', 'dom'), '2026-10-04', 'el domingo cierra la semana');
});
t('probada el martes, aprobada el jueves → sólo el martes', () => {
    sandbox.db.vehicles = [veh(1, 'KNA0000000000001A', 'archived', '2026-09-15T09:30', {
        timeline: [{ date: '2026-09-17T10:00:00', data: { status: 'archived' } }] })];
    const r = sandbox.tpCalendarTests('2026-09-01', '2026-09-30');
    eq(r.all.length, 1);
    eq(Object.keys(r.byDay).join(), '2026-09-15', 'ni el 14 (UTC) ni el 17 (aprobación)');
    eq(r.byDay['2026-09-15'][0].familyKey, famA);
    eq(r.byDay['2026-09-15'][0].familyShort, 'CL4 1.6 GAMMA IVT MY26 SULEV 30 5DR');
});
t('entran: en aprobación, liberado, en prueba con su día ya llegado, históricos no rechazados', () => {
    sandbox.db.vehicles = [
        veh(1, 'V1', 'pending-approval', '2026-09-01T08:00'),
        veh(2, 'V2', 'ready-release', '2026-09-02T08:00'),
        veh(3, 'V3', 'testing', '2026-09-09T08:00'),
        veh(4, 'V4', 'testing', '2026-09-10T08:00'),            // mañana: todavía no ocurre
        veh(5, 'V5', 'historico', '2025-03-04T08:00', { historic: { state: 'pendiente' } }),
        veh(6, 'V6', 'historico', '2025-03-05T08:00', { historic: { state: 'confirmado' } }),
        veh(7, 'V7', 'historico', '2025-03-06T08:00', { historic: { state: 'rechazado' } }),
        veh(8, 'V8', 'registered', '2026-09-03T08:00'),
        veh(9, 'V9', 'in-progress', '2026-09-04T08:00')
    ];
    const r = sandbox.tpCalendarTests();
    eq(r.all.map(x => x.vin).join(), 'V5,V6,V1,V2,V3');
    eq(r.all[0].status, 'historico-pendiente');
    eq(r.all[0].source, 'vets-historico');
});
t('vehículo borrado (marca) no aparece', () => {
    const v = veh(1, 'V1', 'archived', '2026-09-01T08:00', { registeredAt: '2026-08-30T08:00' });
    sandbox.db.vehicles = [v];
    sandbox.db.deletedVehicles = [{ id: 1, vin: 'V1', registeredAt: '2026-08-30T08:00' }];
    eq(sandbox.tpCalendarTests().all.length, 0);
    sandbox.db.deletedVehicles = [];
});
t('sin fecha de prueba → sin día (se declara), nunca la de archivo', () => {
    sandbox.db.vehicles = [veh(1, 'V1', 'archived', null)];
    const r = sandbox.tpCalendarTests('2026-09-01', '2026-09-30');
    eq(r.all.length, 0); eq(r.undated.length, 1); eq(r.undated[0].vin, 'V1');
});
t('rango inclusivo', () => {
    sandbox.db.vehicles = [veh(1, 'V1', 'archived', '2026-09-01T00:10'), veh(2, 'V2', 'archived', '2026-09-30T23:50'), veh(3, 'V3', 'archived', '2026-10-01T00:00')];
    eq(sandbox.tpCalendarTests('2026-09-01', '2026-09-30').all.map(x => x.vin).join(), 'V1,V2');
});
t('fila de testedList con vehículo no duplica; sin vehículo sí cuenta', () => {
    sandbox.db.vehicles = [veh(1, 'V1', 'archived', '2026-09-15T08:00')];
    S.testedList = [
        { configText: cfgA.desc, date: '2026-09-17', vin: 'V1', vehicleId: 1, source: 'cop15-auto' },
        { configText: cfgA.desc, date: '2026-09-17', note: 'VIN: V1 — liberado' },          // fila vieja, VIN en la nota
        { configText: cfgB.desc, date: '2026-08-20', vin: 'VX', source: 'manual' }        // capturada a mano, sin vehículo
    ];
    const r = sandbox.tpCalendarTests();
    eq(r.all.map(x => x.date + ' ' + x.vin).join(' | '), '2026-08-20 VX | 2026-09-15 V1');
    eq(r.all[0].familyShort, 'CL4 1.6 GAMMA IVT MY26 SULEV 30 WGN', 'la carrocería distingue la familia');
    eq(r.all[0].vehicleId, null);
});
t('declaración a mano: va al día de prueba de su fila, no al día en que se palomeó', () => {
    sandbox.db.vehicles = [];
    S.weeklyPlans = [{ id: 'p1', weekDate: '2026-09-28', accepted: true, created: '2026-09-25T10:00:00',
        items: [{ uid: 'u1', desc: cfgA.desc, testDay: 'mar', completed: true }, { uid: 'u2', desc: cfgB.desc, testDay: 'jue', completed: false }] }];
    const pid = sandbox.tpPlanId(S.weeklyPlans[0]);
    S.testedList = [{ configText: cfgA.desc, date: '2026-10-02', verified: false, source: 'plan-manual', planId: pid, itemUid: 'u1', itemIdx: 0 }];
    const r = sandbox.tpCalendarTests();
    eq(r.all.length, 1); eq(r.all[0].date, '2026-09-29', 'martes de esa semana'); eq(r.all[0].declared, true);
    const pl = sandbox.tpCalendarPlanned('2026-09-01', '2026-10-31');
    eq(Object.keys(pl).join(), '2026-10-01', 'lo pendiente va en su jueves');
    eq(pl['2026-10-01'][0].proposal, false);
});
t('propuestas: sólo la vigente de la semana y marcada', () => {
    S.weeklyPlans = [
        { id: 'p1', weekDate: '2026-10-05', accepted: false, created: '2026-10-01T10:00:00', items: [{ uid: 'a', desc: cfgA.desc, testDay: 'lun' }] },
        { id: 'p2', weekDate: '2026-10-05', accepted: false, created: '2026-10-02T10:00:00', items: [{ uid: 'b', desc: cfgB.desc, testDay: 'mar' }] }];
    S._lastSave = Date.now();
    const pl = sandbox.tpCalendarPlanned();
    eq(Object.keys(pl).join(), '2026-10-06'); eq(pl['2026-10-06'][0].proposal, true);
});

console.log('REQ por la regla de la norma (2.36.0)');
const R3 = { ratio: 3, per: 1000 }, R2 = { ratio: 2, per: 1000 };
t('la suma del periodo = REQ del total menos el de antes', () => {
    const vols = [1200, 900, 3000, 2600, 500, 4100, 0, 2200];
    const hist = 800;
    const m = sandbox.tpFamilyMonthlyRequired(vols, hist, R3);
    const tot = vols.reduce((a, b) => a + b, hist);
    eq(m.reduce((a, b) => a + b, 0), sandbox.tpFamilyRequired(tot, R3) - sandbox.tpFamilyRequired(hist, R3));
});
t('ROUNDUP(unidades × pruebas / N), al menos 1 con producción', () => {
    eq(sandbox.tpFamilyRequired(0, R3), 0, 'sin volumen no exige');
    eq(sandbox.tpFamilyRequired(1, R3), 1, 'piso de 1');
    eq(sandbox.tpFamilyRequired(1000, R3), 3, 'exacto: sin ruido de coma flotante');
    eq(sandbox.tpFamilyRequired(1001, R3), 4);
    eq(sandbox.tpFamilyRequired(50015, R3), 151);
    eq(sandbox.tpFamilyRequired(1000, { ratio: 0.3, per: 100 }), 3, '0.3/100 da 3, no 4');
    eq(JSON.stringify(sandbox.tpFamilyMonthlyRequired([100, 233, 0, 1], 0, R3)), '[1,0,0,1]', '334 cruza a 2');
    eq(JSON.stringify(sandbox.tpFamilyMonthlyRequired([0, 0], 0, R3)), '[0,0]');
});
t('la tasa sale de la regla de la norma, no de un número fijo', () => {
    // El caso del reporte: CL4 MY26 (94 226 antes + 19 789) y MY27 (1 antes + 50 014),
    // las dos SULEV 30: la MISMA tasa, la diferencia es solo de volumen.
    const my26 = sandbox.tpFamilyMonthlyRequired([8756, 8605, 2289, 139], 94226, R3).reduce((a, b) => a + b, 0);
    const my27 = sandbox.tpFamilyMonthlyRequired([27, 13317, 13895, 12903, 9872], 1, R3).reduce((a, b) => a + b, 0);
    eq(my26, sandbox.tpFamilyRequired(114015, R3) - sandbox.tpFamilyRequired(94226, R3));
    eq(my27, 150, 'MY27: 151 al cierre menos 1 que ya pedía la primera unidad');
    eq(sandbox.tpFamilyRequired(10000, R2), 20, 'otra norma, otra tasa');
});
t('tpFamilyRate: una regla tal cual; varias, ponderadas por volumen', () => {
    const one = sandbox.tpFamilyRate([{ vol: 10, ratio: 3, per: 1000, label: 'USA' }, { vol: 5, ratio: 3, per: 1000, label: 'Canada' }]);
    eq(one.ratio, 3); eq(one.per, 1000); eq(one.mixed, false); eq(one.labels.join(), 'USA,Canada');
    const mix = sandbox.tpFamilyRate([{ vol: 3000, ratio: 3, per: 1000, label: 'A' }, { vol: 1000, ratio: 2, per: 1000, label: 'B' }]);
    eq(mix.mixed, true); eq(mix.per, 1000); eq(mix.ratio, 2.75);
    const sinVol = sandbox.tpFamilyRate([{ vol: 0, ratio: 3, per: 1000 }, { vol: 0, ratio: 1, per: 500 }]);
    eq(sinVol.ratio, 2.5, 'sin volumen: promedio simple (3 y 2 por mil)');
    eq(sandbox.tpFamilyRate([]).ratio, 0, 'sin reglas: no cuenta');
    eq(sandbox.tpFamilyRate([]).none, true);
    eq(sandbox.tpFamilyRate([{ vol: 50, ratio: 0, per: 1000 }, { vol: 10, ratio: 2, per: 15000, label: 'USA' }]).ratio, 2,
       'lo que no cuenta (ratio 0) no entra al promedio');
});

t('tpBuildFamilies usa la regla de Plan → Reglas', () => {
    const fams = sandbox.tpBuildFamilies();
    ok(fams.length > 0, 'hay familias');
    fams.forEach(f => {
        eq(f.totalRequired, sandbox.tpFamilyRequired(f.reqVol, f.rate), f.key);
        eq(f.reqVol + f.uncountedVol, f.activeVol, 'lo que cuenta + lo que no = el volumen vigente');
        ok(f.rate && f.rate.per > 0, 'tasa en la familia ' + f.key);
    });
});

console.log('Libro de auditoría (.xlsx)');
const cell = (sh, ref) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
    return sh.cells.filter(x => x.r === +m[2] && x.c === c).pop();
};
t('meses y semanas del calendario', () => {
    const ms = sandbox.tpAuditMonths('2026-11', '2027-02');
    eq(ms.map(m => m.label).join(), 'Nov-26,Dec-26,Jan-27,Feb-27');
    eq(ms[3].to, '2027-02-28');
    eq(sandbox.tpAuditMonths('2026-01', '2030-12').length, 24, 'tope de 24 meses');
    const w = sandbox._tpAuditWeeks(ms[0]);
    eq(w[0][0], '2026-10-26', 'la primera semana arranca el lunes anterior al 1');
    eq(w[w.length - 1][6], '2026-12-06');
});
t('la prueba del martes cae en la hoja de su mes, en martes, y cuenta en Tested', () => {
    S.weeklyPlans = []; S.testedList = []; S._lastSave = Date.now();
    cfgA.m = [0, 2000, 6000]; cfgA.hist = 0; cfgB.m = [0, 0, 0]; cfgB.hist = 0;
    S.months = ['Aug-26', 'Sep-26', 'Oct-26'];
    sandbox.tpCatalogInvalidate();
    sandbox.db.vehicles = [veh(1, 'KNA00000000012345', 'archived', '2026-09-15T09:30'),
                           veh(2, 'KNA00000000099999', 'archived', '2026-09-15T13:00', { purpose: 'COP-OBD2' })];
    const model = sandbox.tpAuditXlsxModel({ from: '2026-09', to: '2026-10', generated: '2026-10-04' });
    eq(model.months.length, 2);
    const fa = model.families.find(f => f.key === famA);
    eq(fa.start, 0); eq(fa.vols.join(), '2000,6000');
    const spec = sandbox.tpAuditXlsxSpec(model);
    eq(spec.sheets.map(s => s.name).join(), 'Instructions,Summary,Projection,Sep-26,Oct-26,Test Log,Lists');
    eq(spec.sheets[spec.sheets.length - 1].hidden, true, 'Lists va oculta');
    const sep = spec.sheets[3];
    // Semana 1: lunes 31-ago en el renglón 5; la semana del 14 es la 3ª → 5 + 2·(6+1) = 19.
    eq(cell(sep, 'I19').v.date, '2026-09-15', 'renglón de fecha del martes 15');
    eq(cell(sep, 'I20').v, 'CL4 1.6 GAMMA IVT MY26 SULEV 30 5DR');
    eq(cell(sep, 'J20').v, '012345', 'VIN: últimos 6 (el número de serie)');
    eq(cell(sep, 'I21').v, 'CL4 1.6 GAMMA IVT MY26 SULEV 30 5DR [CoP OBD II]', 'OBD II marcada: no cuenta para el REQ');
    const i = model.families.indexOf(fa), r = 5 + i;
    eq(cell(sep, 'D' + r).v, 1, 'Tested cuenta sólo la de emisiones');
    ok(/^IF\(\$A\d+="","",COUNTIFS\(\$G\$5:\$S\$\d+,\$A\d+,\$H\$5:\$T\$\d+,"<>"\)\)$/.test(cell(sep, 'D' + r).f), 'Tested = COUNTIFS familia + VIN al lado: ' + cell(sep, 'D' + r).f);
    ok(/^IF\(\$A\d+="","",COUNTIF\(\$G\$5:\$T\$\d+,\$A\d+\)\)$/.test(cell(sep, 'C' + r).f), 'Planned = COUNTIF de la familia en el calendario');
    eq(cell(sep, 'C' + r).v, 1, 'Planned: también cuenta lo ya probado (un mes sin plan tiene su Planned)');
    eq(cell(sep, 'B' + r).v, sandbox.tpFamilyRequired(2000, fa.rate), 'Required de septiembre (2 000 acumuladas, con la regla de la norma)');
    const rule = sandbox.tpGetRule(cfgA), P = spec.sheets[2], pr = 5 + model.families.indexOf(fa);
    eq(fa.rate.ratio, rule.ratio, 'la tasa de la familia es la de Plan → Reglas'); eq(fa.rate.per, rule.per);
    eq(cell(P, 'E' + pr).v, rule.ratio, 'Projection: Tests'); eq(cell(P, 'F' + pr).v, rule.per, 'Projection: per units');
    ok(/ROUND\(\(\$G\d+\+SUM\(H\d+:H\d+\)\)\*\$E\d+\/\$F\d+,6\)/.test(cell(P, 'L' + pr).f), 'la fórmula usa la tasa del renglón: ' + cell(P, 'L' + pr).f);
    eq(spec.sheets[4].cells.filter(x => x.r === r && x.c === 2)[0].v, sandbox.tpFamilyRequired(8000, fa.rate) - sandbox.tpFamilyRequired(2000, fa.rate), 'Required de octubre: lo que agregan 8 000 acumuladas');
    const tl = spec.sheets[5];
    eq(cell(tl, 'A5').v.date, '2026-09-15'); eq(cell(tl, 'B5').v, 'Tue'); eq(cell(tl, 'G6').v, 'No (purpose)');
});
t('lo pendiente del plan aceptado: en su día, sin VIN → Planned sí, Tested no', () => {
    S.weeklyPlans = [{ id: 'pa', weekDate: '2026-09-14', accepted: true, acceptedDate: '2026-09-11T10:00:00', created: '2026-09-11T09:00:00',
        items: [{ uid: 'x1', desc: cfgA.desc, testDay: 'vie', completed: false },
                { uid: 'x2', desc: cfgA.desc, testDay: 'mar', completed: true },                     // hecha: ya está con VIN
                { uid: 'x3', desc: cfgA.desc, testDay: 'jue', completed: false, linkedVehicleId: 1 }, // vinculada a una que ya aparece
                { uid: 'x4', desc: cfgA.desc, testDay: 'jue', completed: false, purpose: 'EO-OBD2' }] },
        { id: 'pp', weekDate: '2026-09-21', accepted: false, created: '2026-09-18T09:00:00', items: [{ uid: 'y1', desc: cfgA.desc, testDay: 'lun' }] }];
    S._lastSave = Date.now() + 1;
    const model = sandbox.tpAuditXlsxModel({ from: '2026-09', to: '2026-09', generated: '2026-10-04' });
    eq(model.planned.map(p => p.date + ' ' + p.label).join(' | '),
       '2026-09-18 CL4 1.6 GAMMA IVT MY26 SULEV 30 5DR | 2026-09-17 CL4 1.6 GAMMA IVT MY26 SULEV 30 5DR [EO OBD II]',
       'solo lo pendiente del plan ACEPTADO, sin repetir lo hecho ni lo vinculado; la propuesta no entra');
    const spec = sandbox.tpAuditXlsxSpec(model), sep = spec.sheets[3];
    eq(cell(sep, 'O20').v, 'CL4 1.6 GAMMA IVT MY26 SULEV 30 5DR', 'viernes 18');
    eq(cell(sep, 'P20').v, '', 'sin VIN');
    const r = 5 + model.families.findIndex(f => f.key === famA);
    eq(cell(sep, 'C' + r).v, 2, 'Planned = la del martes (con VIN) + la del viernes (sin VIN)');
    eq(cell(sep, 'D' + r).v, 1, 'Tested = solo la que tiene VIN');
    const sm = spec.sheets[1];
    eq(cell(sm, 'D' + r).v, 2); eq(cell(sm, 'E' + r).v, 1);
    S.weeklyPlans = [];
});
t('plantilla: mismo libro, sin datos del laboratorio', () => {
    const tpl = sandbox.tpAuditXlsxSpec(sandbox.tpAuditXlsxModel({ from: '2026-09', to: '2026-10', template: true }));
    eq(tpl.sheets.map(s => s.name).join(), 'Instructions,Summary,Projection,Sep-26,Oct-26,Test Log,Lists');
    const sep = tpl.sheets[3];
    eq(sep.cells.filter(x => x.c >= 7 && x.r > 4 && typeof x.v === 'string' && x.v).length, 0, 'calendario vacío');
    ok(sep.validations.length === 1 && /^Lists!\$A\$2:\$A\$\d+$/.test(sep.validations[0].list), 'lista desplegable');
    eq(tpl.sheets[2].cells.filter(x => x.r >= 5 && x.c >= 7 && x.c <= 9 && x.v).length, 0, 'producción vacía');
    ok(tpl.sheets[2].cells.some(x => x.r === 5 && x.c === 5 && typeof x.v === 'number' && x.v > 0), 'la plantilla trae la tasa de cada familia');
});
t('el archivo se arma y es determinista', () => {
    const model = sandbox.tpAuditXlsxModel({ from: '2026-09', to: '2026-09', generated: '2026-10-04' });
    const a = sandbox.xwBuild(sandbox.tpAuditXlsxSpec(model)), b = sandbox.xwBuild(sandbox.tpAuditXlsxSpec(model));
    ok(a.length > 10000 && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0);
});

console.log('2.36.0 — solo cuentan las reglas de Plan → Reglas');
const cfg = (o) => Object.assign({}, cfgA, o);
t('las reglas del laboratorio son el default, sin comodín', () => {
    const d = sandbox.tpDefaultRules();
    eq(d.length, 6);
    ok(!d.some(r => r.region === '*' && r.regulation === '*'), 'sin regla Todas/Todas');
    const usa = d.find(r => r.region === 'USA');
    eq(usa.ratio + '/' + usa.per, '2/15000');
    eq(d.find(r => r.regulation === 'PRE-EURO 7').per, 7500);
});
t('sin regla: ratio 0, no exige y no entra a la cobertura', () => {
    S.rules = sandbox.tpDefaultRules();
    const can = cfg({ desc: 'CAN', rgn: 'CANADA', total: 30000, hist: 0 });
    const r = sandbox.tpGetRule(can);
    eq(r._matchType, 'sin-regla'); eq(r.ratio, 0);
    eq(sandbox.tpCalcRequired(can, r), 0);
    const bra = cfg({ desc: 'BRA', rgn: 'BRAZIL', reg: 'BRAZIL L8', total: 9000, hist: 0 });
    eq(sandbox.tpGetRule(bra)._matchType, 'sin-regla', 'Brasil no tiene regla');
    const eu6 = cfg({ desc: 'EU5', rgn: 'EUROPE', reg: 'EURO-5' });
    eq(sandbox.tpGetRule(eu6)._matchType, 'sin-regla', 'Europa solo cuenta PRE-EURO 7');
    eq(sandbox.tpGetRule(cfg({ rgn: 'MEXICO', reg: 'EURO-5' }))._matchType, 'region', 'México / Todas');
    const usa = cfg({ desc: 'USA', rgn: 'USA', total: 30000, hist: 0 });
    eq(sandbox.tpCalcRequired(usa, sandbox.tpGetRule(usa)), 4, '30 000 × 2/15 000');
    // Cobertura: solo cuentan las vigentes (con regla).
    S.planData = [usa, can]; S.testedList = []; S._lastSave = Date.now();
    const an = sandbox.tpGetAnalysis();
    eq(an.find(a => a.desc === 'CAN').required, 0);
    eq(an.find(a => a.desc === 'USA').required, 4);
    S.planData = [cfgA, cfgB]; S._lastSave = Date.now();
});
t('una regla "Todas / Todas" escrita a mano sí cuenta (es decisión de quien edita)', () => {
    S.rules = sandbox.tpDefaultRules().concat([{ id: 99, region: '*', regulation: '*', ratio: 1, per: 1000, label: 'Todo' }]);
    eq(sandbox.tpGetRule(cfg({ rgn: 'CANADA' }))._matchType, 'comodín');
    S.rules = sandbox.tpDefaultRules();
});
t('familia USA + Canadá: solo cuenta el volumen de USA', () => {
    S.rules = sandbox.tpDefaultRules();
    const u = cfg({ desc: 'U', rgn: 'USA', total: 20000, hist: 10000 });
    const c = cfg({ desc: 'C', rgn: 'CANADA', total: 40000, hist: 0 });
    S.planData = [u, c]; S.testedList = []; S._lastSave = Date.now();
    const f = sandbox.tpBuildFamilies().find(x => x.key === famA);
    eq(f.reqVol, 30000); eq(f.uncountedVol, 40000); eq(f.noRuleCount, 1);
    eq(f.reqStatus, 'parcial');
    eq(f.totalRequired, 4, '30 000 × 2/15 000');
    S.planData = [cfgA, cfgB]; S._lastSave = Date.now();
});
t('familia fuera del conteo: no exige, se declara, y regresa', () => {
    S.rules = sandbox.tpDefaultRules();
    const u = cfg({ desc: 'U', rgn: 'USA', total: 30000, hist: 0 });
    S.planData = [u]; S.testedList = []; S.reqFamilies = {}; S._lastSave = Date.now();
    eq(sandbox.tpSetFamilyReqCount(famA, false, ''), false, 'sin motivo no se saca');
    eq(sandbox.tpSetFamilyReqCount(famA, false, 'no es mercado auditado'), true);
    eq(S.reqFamilies[famA].excluded, true);
    eq(sandbox.tpReqRuleFor(u)._matchType, 'excluida');
    let f = sandbox.tpBuildFamilies().find(x => x.key === famA);
    eq(f.totalRequired, 0); eq(f.reqStatus, 'excluida');
    eq(sandbox.tpGetAnalysis()[0].required, 0, 'la configuración tampoco exige');
    eq(sandbox.tpGetRule(u)._matchType, 'exacta', 'la regla sigue empatando (para Reglas)');
    eq(sandbox.tpSetFamilyReqCount(famA, true), true);
    eq(S.reqFamilies[famA].excluded, false, 'queda la marca de que volvió a contar');
    f = sandbox.tpBuildFamilies().find(x => x.key === famA);
    eq(f.totalRequired, 4); eq(f.reqStatus, 'cuenta');
    S.planData = [cfgA, cfgB]; S.reqFamilies = {}; S._lastSave = Date.now();
});
t('sync: gana la marca más reciente, en los dos sentidos', () => {
    const a = { k1: { excluded: true, at: '2026-10-07T10:00:00Z', reason: 'x' } };
    const b = { k1: { excluded: false, at: '2026-10-07T11:00:00Z' }, k2: { excluded: true, at: '2026-10-01T00:00:00Z' } };
    const u1 = sandbox.tpReqFamiliesUnion(a, b), u2 = sandbox.tpReqFamiliesUnion(b, a);
    eq(JSON.stringify(u1), JSON.stringify(u2) === JSON.stringify(u1) ? JSON.stringify(u1) : 'asimétrica');
    eq(u1.k1.excluded, false, 'regresó después: cuenta');
    eq(u1.k2.excluded, true);
    eq(sandbox.tpReqFamiliesNewTo(a, b), true);
    eq(sandbox.tpReqFamiliesNewTo(u1, a), false);
    eq(Object.keys(sandbox.tpReqFamiliesUnion({ '': { excluded: true, at: 'z' } }, null)).length, 0, 'nunca una clave vacía');
});
t('libro: lo que no cuenta va a "Not counted" y la tasa en 0', () => {
    S.rules = sandbox.tpDefaultRules();
    S.months = ['Aug-26', 'Sep-26', 'Oct-26'];
    const u = cfg({ desc: 'U', rgn: 'USA', m: [0, 15000, 15000], total: 30000, hist: 0 });
    const c = cfg({ desc: 'C', rgn: 'CANADA', m: [0, 9000, 0], total: 9000, hist: 0 });
    const w = Object.assign({}, cfgB, { desc: 'W', rgn: 'CANADA', m: [0, 500, 0], total: 500, hist: 0 });
    S.planData = [u, c, w]; S.testedList = []; S.weeklyPlans = []; S._lastSave = Date.now();
    sandbox.tpCatalogInvalidate(); sandbox.db.vehicles = [];
    const model = sandbox.tpAuditXlsxModel({ from: '2026-09', to: '2026-10', generated: '2026-10-07' });
    const fa = model.families.find(f => f.key === famA), fb = model.families.find(f => f.key === sandbox.tpFamilyKeyForCfg(cfgB));
    eq(fa.vols.join(), '15000,15000', 'solo USA en la producción');
    eq(fa.uncounted, 9000);
    ok(/not counted \(no rule\): CANADA/.test(fa.ruleText), fa.ruleText);
    eq(fb.rate.ratio, 0); ok(/^NOT COUNTED/.test(fb.ruleText), fb.ruleText);
    const P = sandbox.tpAuditXlsxSpec(model).sheets[2], rb = 5 + model.families.indexOf(fb);
    eq(cell(P, 'E' + rb).v, 0, 'Tests = 0');
    ok(P.cells.filter(x => x.r === rb && x.c >= 14 && x.c <= 16 && x.f).every(x => x.v === 0), 'no exige nada');
    S.planData = [cfgA, cfgB]; S._lastSave = Date.now(); sandbox.tpCatalogInvalidate();
});
console.log('2.33.0 — una semana = un lunes = un plan, y lo borrado no regresa');
t('tpMondayIso', () => {
    eq(sandbox.tpMondayIso('2026-03-04'), '2026-03-02', 'miércoles → su lunes');
    eq(sandbox.tpMondayIso('2026-03-08'), '2026-03-02', 'domingo → el lunes ANTERIOR (la semana es lun-dom)');
    eq(sandbox.tpMondayIso('2026-03-02'), '2026-03-02');
    eq(sandbox.tpMondayIso('nada'), null);
});
t('semanas fantasma: una fecha que no es lunes (o sin fecha) se lleva a su lunes, sin cambiar de identidad', () => {
    S.deletedPlans = []; S.weekHistory = [];
    S.weeklyPlans = [
        { id: 1, weekDate: '2026-03-04', accepted: true, created: '2026-03-01T10:00:00', items: [{ uid: 'a', desc: cfgA.desc, testDay: 'mar' }] },
        { id: 2, created: '2026-03-18T09:00:00', accepted: false, items: [] }                       // sin weekDate (arrastre viejo)
    ];
    const id1 = sandbox.tpPlanId(S.weeklyPlans[0]);
    sandbox._tpNormalizePlans();
    eq(S.weeklyPlans[0].weekDate, '2026-03-02'); eq(S.weeklyPlans[0].weekDateOriginal, '2026-03-04');
    eq(S.weeklyPlans[0].planId, id1, 'la identidad se fija antes de mover la fecha');
    eq(S.weeklyPlans[1].weekDate, '2026-03-16');
    eq(sandbox._tpNormalizePlans(), 0, 'idempotente');
    S._lastSave = Date.now() + 5;
    ok(sandbox.tpWeekPlanFor('2026-03-02') && sandbox.tpWeekPlanFor('2026-03-02').accepted, 'el tablero ya lo encuentra en su lunes');
});
t('marcas: unión simétrica, sin repetir, se queda con la fecha más vieja', () => {
    const a = [{ planId: 'P1', at: '2026-10-01' }, { planId: 'P2', at: '2026-10-02' }];
    const b = [{ planId: 'P2', at: '2026-09-30' }, { planId: 'P3', at: '2026-10-03' }];
    const u1 = sandbox.tpPlanTombstonesUnion(a, b), u2 = sandbox.tpPlanTombstonesUnion(b, a);
    eq(JSON.stringify(u1), JSON.stringify(u2), 'simétrica');
    eq(u1.map(x => x.planId).join(), 'P3,P1,P2');
    eq(u1.find(x => x.planId === 'P2').at, '2026-09-30');
});
t('borrar la semana: quita TODOS sus planes (aceptado incluido), deja marca, y no toca la evidencia', () => {
    S.deletedPlans = [];
    S.weeklyPlans = [
        { planId: 'PA', weekDate: '2026-09-28', accepted: true, acceptedDate: '2026-09-25T10:00:00', items: [{ uid: 'x', desc: cfgA.desc, testDay: 'mar', completed: true }] },
        { planId: 'PB', weekDate: '2026-09-28', accepted: false, created: '2026-09-26T10:00:00', items: [] },
        { planId: 'PC', weekDate: '2026-10-05', accepted: false, items: [] }];
    S.weekHistory = [{ planId: 'PA' }, { planId: 'PC' }];
    S.testedList = [{ configText: cfgA.desc, date: '2026-09-29', verified: false, source: 'plan-manual', planId: 'PA', itemUid: 'x' }];
    sandbox._tpDeleteWeekDo('2026-09-28');
    eq(S.weeklyPlans.map(p => p.planId).join(), 'PC');
    eq(S.deletedPlans.map(t => t.planId).sort().join(), 'PA,PB');
    eq(S.weekHistory.map(w => w.planId).join(), 'PC');
    eq(S.testedList.length, 1, 'la evidencia se queda');
    // Un pull que trae el plan borrado de vuelta: la marca lo retira.
    S.weeklyPlans.push({ planId: 'PA', weekDate: '2026-09-28', accepted: true, items: [] });
    sandbox._tpNormalizePlans();
    eq(S.weeklyPlans.map(p => p.planId).join(), 'PC', 'lo borrado no regresa con la sincronización');
});
t('sync: detecta marcas nuevas en cualquier dirección', () => {
    const src = fs.readFileSync('js/firebase-sync.js', 'utf8');
    const f = /function _fbPlanTombsNewTo\(known, incoming\) \{[\s\S]*?\n\}/.exec(src)[0];
    const fn = vm.runInNewContext('(' + f + ')');
    eq(fn([{ planId: 'A' }], [{ planId: 'A' }]), false);
    eq(fn([{ planId: 'A' }], [{ planId: 'A' }, { planId: 'B' }]), true);
    eq(fn([], []), false);
});
t('una semana nunca pasa de TP_WEEK_MAX_TESTS', () => {
    eq(sandbox.TP_WEEK_MAX_TESTS, 20);
    S.vehiclesPerSlot = 10; S.capacity = 78;
    const wd = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };
    eq(sandbox.tpWeeklyCapacityFor('2026-10-05', wd).cap, 20);
    S.vehiclesPerSlot = 1; S.capacity = 8;
});

console.log(`calendario: ${pass} ok, ${fail} fallas`);
if (fail) process.exit(1);
