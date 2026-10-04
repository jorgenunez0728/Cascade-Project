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

console.log('REQ mensual por lotes acumulados');
t('la suma del periodo = REQ del total', () => {
    const vols = [1200, 900, 3000, 2600, 500, 4100, 0, 2200];
    const hist = 800;
    const m = sandbox.tpFamilyMonthlyRequired(vols, hist);
    const tot = vols.reduce((a, b) => a + b, hist);
    eq(m.reduce((a, b) => a + b, 0), sandbox.tpFamilyRequired(tot) - sandbox.tpFamilyRequired(hist));
});
t('el mes que cruza 7 501 pide 3 más; el primer volumen pide 3', () => {
    eq(JSON.stringify(sandbox.tpFamilyMonthlyRequired([100, 7000, 400, 1], 0)), '[3,0,0,3]');
    eq(JSON.stringify(sandbox.tpFamilyMonthlyRequired([0, 0], 0)), '[0,0]');
    eq(JSON.stringify(sandbox.tpFamilyMonthlyRequired([10], 7500)), '[3]', 'hist ya trae 3: 7 510 pide 3 más');
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
    eq(cell(sep, 'B' + r).v, 3, 'Required de septiembre (2 000 acumuladas → 3)');
    eq(spec.sheets[4].cells.filter(x => x.r === r && x.c === 2)[0].v, 3, 'Required de octubre (8 000 acumuladas → 3 más)');
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
    eq(tpl.sheets[2].cells.filter(x => x.r >= 5 && x.c >= 4 && x.c <= 6 && x.v).length, 0, 'producción vacía');
});
t('el archivo se arma y es determinista', () => {
    const model = sandbox.tpAuditXlsxModel({ from: '2026-09', to: '2026-09', generated: '2026-10-04' });
    const a = sandbox.xwBuild(sandbox.tpAuditXlsxSpec(model)), b = sandbox.xwBuild(sandbox.tpAuditXlsxSpec(model));
    ok(a.length > 10000 && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0);
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
