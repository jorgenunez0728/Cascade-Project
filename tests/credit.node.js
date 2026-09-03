// [v23] El credito de una liberacion, probado sin DOM.
// Reproduce el caso que el laboratorio reportaba: "corri la prueba y el plan sigue
// en rojo" — un vehiculo liberado que ninguna fila del plan registraba.
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
const src = fs.readFileSync('js/testplan.js', 'utf8') + '\nvar __getTp = function(){ return tpState; };\n';
try { vm.runInContext(src, sandbox, { filename: 'testplan.js' }); }
catch (e) { console.error('NO CARGA:', e.message); process.exit(1); }

let pass = 0, fail = 0;
function t(nombre, fn) {
    try { fn(); console.log('  ok  ' + nombre); pass++; }
    catch (e) { console.log('  FAIL ' + nombre + '\n       ' + e.message); fail++; }
}
function eq(a, b, msg) {
    if (a !== b) throw new Error((msg || '') + ' esperaba ' + JSON.stringify(b) + ', dio ' + JSON.stringify(a));
}
const S = sandbox.__getTp();

// Un laboratorio minimo: una config en el plan y una semana aceptada con una fila.
function reset(conFila) {
    S.planData = [
        { desc: 'CFG-A', id: 'a', mod: 'K5', rgn: 'EUROPE', reg: 'EURO-6E', eng: '2.0', tx: 'AT',
          my: '2026', drv: '2WD', body: '5DR', ep: '', engpkg: '', tire: 'R17', total: 6000, hist: 0, m: [] },
        { desc: 'CFG-B', id: 'b', mod: 'K8', rgn: 'USA', reg: 'SULEV 30', eng: '2.5', tx: 'AT',
          my: '2026', drv: '2WD', body: '4DR', ep: '', engpkg: '', tire: 'R18', total: 4000, hist: 0, m: [] }
    ];
    S.testedList = [];
    S.weekHistory = [];
    S.vehiclesPerSlot = 2;
    S.capacity = 4;
    S._migr = { capacity: 9, itemUids: 9 };
    S.weekAvailability = {};
    S.weeklyPlans = [{
        id: 1, planId: 'W2026-09-07-1', weekDate: '2026-09-07', accepted: true,
        acceptedDate: '2026-09-06T00:00:00Z',
        workDays: { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false },
        items: conFila ? [{ uid: 'I1', desc: 'CFG-A', completed: false, preconDay: 'lun', testDay: 'mar' }] : []
    }];
    sandbox.db.vehicles = [];
    sandbox.tpWeekPlanInvalidate();
    sandbox.tpInvalidateCache();
}
function veh(over) {
    return Object.assign({
        id: 900001, vin: 'KNAAAAA0001', configCode: 'CFG-A', purpose: 'COP-Emisiones',
        status: 'archived', adhoc: false,
        testData: { testDatetime: '2026-09-08T09:00' },
        archivedAt: '2026-09-09T10:00:00Z', config: {}
    }, over || {});
}

console.log('\n== La prueba que el plan SI esperaba ==');
t('marca la fila y le pega el VIN', () => {
    reset(true);
    const v = veh();
    const r = sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(r.evidence, true, 'evidencia:');
    eq(r.matched, true, 'fila marcada:');
    eq(r.appended, null, 'no agrego nada de mas:');
    const it = S.weeklyPlans[0].items[0];
    eq(it.completed, true);
    eq(it.linkedVehicleId, 900001, 'quedo escrito que vehiculo la acredito:');
    eq(it.completedDate, '2026-09-08', 'con la fecha de la PRUEBA, no la de aprobacion:');
});

console.log('\n== La prueba que NADIE habia planeado (lo que el usuario pidio) ==');
t('entra sola a su semana, ya hecha y marcada', () => {
    reset(false);
    const r = sandbox.tpCreditReleaseToWeek(veh(), { skipSave: true });
    eq(r.matched, false);
    eq(!!r.appended, true, 'se agrego una fila:');
    const it = S.weeklyPlans[0].items[0];
    eq(it.unplanned, true, 'marcada como no planeada:');
    eq(it.origin, 'cascade');
    eq(it.completed, true, 'y ya cuenta como hecha:');
    eq(it.linkedVehicleId, 900001);
    eq(it.testDay, 'mar', 'en el dia REAL de la prueba (8 sep = martes):');
    eq(it.preconDay, 'lun', 'con su preacondicionamiento derivado:');
});
t('los KPIs separan planeadas de no planeadas', () => {
    reset(true);
    sandbox.tpCreditReleaseToWeek(veh({ configCode: 'CFG-B', id: 900002, vin: 'KNAAAAA0002' }), { skipSave: true });
    sandbox.tpBoardInvalidate();
    const b = sandbox.tpWeekBoardRows({ weekDate: '2026-09-07' });
    eq(b.kpis.planeadas, 1, 'el compromiso sigue siendo 1:');
    eq(b.kpis.noPlaneadas, 1, 'y lo que entro solo se declara aparte:');
    eq(b.kpis.hechas, 1);
});
t('quitarla del plan NO toca la cobertura', () => {
    reset(false);
    sandbox.tpCreditReleaseToWeek(veh(), { skipSave: true });
    const antes = sandbox.tpCoverageSummary().totalTested;
    eq(S.weeklyPlans[0].items.length, 1);
    sandbox.tpUnplanCreditedItem('W2026-09-07-1', S.weeklyPlans[0].items[0].uid);
    eq(S.weeklyPlans[0].items.length, 0, 'salio del plan:');
    eq(sandbox.tpCoverageSummary().totalTested, antes, 'la evidencia sigue contando:');
});

console.log('\n== La semana correcta ==');
t('una prueba del viernes aprobada el lunes acredita SU semana', () => {
    reset(true);
    // Prueba el viernes 11 de septiembre; se aprueba el lunes 14 (otra semana).
    const v = veh({ testData: { testDatetime: '2026-09-11T09:00' }, archivedAt: '2026-09-14T08:00:00Z' });
    const r = sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(r.weekDate, '2026-09-07', 'la semana de la PRUEBA:');
    eq(S.testedList[0].date, '2026-09-11', 'y la evidencia lleva la fecha real:');
});
t('NO se inventa un plan para una semana que no lo tiene', () => {
    reset(true);
    const v = veh({ testData: { testDatetime: '2026-10-06T09:00' } });  // otra semana
    const r = sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(r.noPlan, true, 'lo declara:');
    eq(S.weeklyPlans.length, 1, 'y no crea ningun plan:');
    eq(S.testedList.length, 1, 'pero la evidencia si queda:');
});

console.log('\n== Dedup y avisos ==');
t('rearchivar el mismo vehiculo NO cuenta dos veces', () => {
    reset(true);
    const v = veh();
    sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    const r2 = sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(r2.evidence, false, 'la segunda no escribe evidencia:');
    eq(S.testedList.length, 1, 'una sola fila:');
});
t('una config fuera del plan de produccion se AVISA (antes: silencio)', () => {
    reset(true);
    const r = sandbox.tpCreditReleaseToWeek(veh({ configCode: 'MANUAL', id: 900003, vin: 'KNAAAAA0003' }), { skipSave: true });
    eq(r.unknownConfig, true);
    eq(sandbox.tpGetAnalysis().reduce((a, c) => a + c.testedN, 0), 0, 'y de verdad no acredita nada:');
});
t('una prueba fuera de plan (adhoc) no toca el plan', () => {
    reset(true);
    const r = sandbox.tpCreditReleaseToWeek(veh({ adhoc: true }), { skipSave: true });
    eq(r.evidence, false);
    eq(r.appended, null);
    eq(S.weeklyPlans[0].items[0].completed, false);
});

console.log('\n== La declaracion a mano ==');
t('la liberacion asciende la declarada de SU semana, no la de otra', () => {
    reset(true);
    S.testedList = [
        { configText: 'CFG-A', date: '2026-09-08', note: 'Declarada en el plan — sin vehiculo liberado',
          source: 'plan-manual', verified: false, planId: 'W2026-09-07-1', itemUid: 'I1' },
        { configText: 'CFG-A', date: '2026-08-25', note: 'Declarada en el plan — sin vehiculo liberado',
          source: 'plan-manual', verified: false, planId: 'W2026-08-24-9', itemUid: 'IZ' }
    ];
    sandbox.tpCreditReleaseToWeek(veh(), { skipSave: true });
    const quedan = S.testedList.filter(t => t.source === 'plan-manual');
    eq(quedan.length, 1, 'solo se retiro una:');
    eq(quedan[0].date, '2026-08-25', 'y fue la de la semana correcta la que se ascendio:');
});

console.log('\n== _tpExtractVin ya no inventa VINes ==');
t('una nota de declaracion NO devuelve un VIN', () => {
    eq(sandbox._tpExtractVin('Declarada en el plan — sin vehiculo liberado'), '');
    eq(sandbox.tpTestedVin({ note: 'Declarada en el plan — sin vehiculo liberado' }), '');
});
t('una nota de liberacion si', () => {
    eq(sandbox._tpExtractVin('VIN: KNA123 — Auto desde COP15'), 'KNA123');
    eq(sandbox.tpTestedVin({ vin: 'KNA999', note: 'VIN: KNA123 — x' }), 'KNA999', 'el campo manda sobre el texto:');
});

console.log('\n' + pass + ' pasaron, ' + fail + ' fallaron\n');
process.exit(fail ? 1 : 0);
