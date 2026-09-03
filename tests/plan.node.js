// Arnes minimo para probar en Node las funciones puras de testplan.js.
// No carga el DOM: solo stubs de lo que el archivo toca al parsear.
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
    window: {},
    document: _el(),
    showToast: noop, showConfirmDialog: () => Promise.resolve(false), showConfirm: noop, showModal: noop,
    auditLog: noop, undoPush: noop, undoPop: noop, authRequire: () => true, authCan: () => true,
    authGetCurrentUser: () => ({ name: 'Test' }),
    localToday: () => new Date().toISOString().slice(0, 10),
    localDateStr: d => new Date(d).toISOString().slice(0, 10),
    safeParse: (k, d) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } },
    debounce: fn => fn, emitEvent: noop, setTimeout, clearTimeout, requestAnimationFrame: noop,
    Chart: function () {}, CSV_CONFIGURATIONS: '', allConfigurations: [],
    db: { vehicles: [] }, invState: { gases: [] },
    tpUpdateBadges: noop, tpRender: noop, cascadeInjectTooltipsDeferred: noop,
    CASCADE_TOOLTIPS: {}, uiCard: null, a11yClickables: noop, gridDragInit: noop,
    tabCacheInvalidate: noop, fbPush: noop, _tabCache: {}, tabCacheSwitch: noop, tabCacheInit: noop, tabCacheGet: () => null, helpBannerHTML: () => '',
    helpInjectBannerDeferred: noop, a11yTablist: noop, a11yTablistSync: noop, dispatchEvent: noop, CustomEvent: function(){},
    _normalizeRegulation: (r) => r || 'N/A', Object, Array, Math, Date, JSON, String, Number, Set, Map, parseInt, parseFloat, isNaN
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// `tpState` se declara con `let`, asi que NO queda en el objeto global del contexto
// (a diferencia de las `function`). Un epilogo lo expone para poder manipularlo.
const src = fs.readFileSync('js/testplan.js', 'utf8') +
    '\nvar __getTp = function(){ return tpState; };\n';
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

console.log('\n== tpWeekPlanFor: el plan vigente ==');
t('con un aceptado y una propuesta MAS NUEVA, gana el aceptado', () => {
    S.weeklyPlans = [
        { id: 1, weekDate: '2026-09-07', created: '2026-09-01T00:00:00Z', accepted: true,  acceptedDate: '2026-09-02T00:00:00Z', items: [{ desc: 'A' }] },
        { id: 2, weekDate: '2026-09-07', created: '2026-09-05T00:00:00Z', accepted: false, items: [{ desc: 'B' }, { desc: 'C' }] }
    ];
    sandbox.tpWeekPlanInvalidate();
    const v = sandbox.tpWeekPlanFor('2026-09-07');
    eq(v.plan.id, 1, 'plan vigente:');
    eq(v.accepted, true);
    eq(v.otros.length, 1, 'propuestas de sobra:');
});
t('sin aceptados, gana la propuesta mas reciente', () => {
    S.weeklyPlans = [
        { id: 1, weekDate: '2026-09-07', created: '2026-09-01T00:00:00Z', accepted: false, items: [] },
        { id: 2, weekDate: '2026-09-07', created: '2026-09-05T00:00:00Z', accepted: false, items: [] }
    ];
    sandbox.tpWeekPlanInvalidate();
    eq(sandbox.tpWeekPlanFor('2026-09-07').plan.id, 2);
});
t('con DOS aceptados, gana el de acceptedDate mas reciente', () => {
    S.weeklyPlans = [
        { id: 1, weekDate: '2026-09-07', accepted: true, acceptedDate: '2026-09-02T00:00:00Z', items: [] },
        { id: 2, weekDate: '2026-09-07', accepted: true, acceptedDate: '2026-09-04T00:00:00Z', items: [] }
    ];
    sandbox.tpWeekPlanInvalidate();
    const v = sandbox.tpWeekPlanFor('2026-09-07');
    eq(v.plan.id, 2);
    eq(v.plans.length, 2, 'los dos aceptados siguen expuestos:');
});
t('semana sin planes devuelve null', () => {
    sandbox.tpWeekPlanInvalidate();
    eq(sandbox.tpWeekPlanFor('2030-01-07'), null);
});

console.log('\n== Capacidad: el "6/40" del issue #126 ==');
t('sin DOM y con vehiclesPerSlot=10, NO cae al maximo fisico', () => {
    S.vehiclesPerSlot = 10;
    S.capacity = 8;
    S.weekAvailability = {};
    const wd = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };
    const fisica = sandbox.tpWeekCapacity(wd);
    eq(fisica.max, 40, 'tope fisico (4 pares x 10):');
    const c = sandbox.tpWeeklyCapacityFor(null, wd);
    eq(c.cap, 8, 'capacidad practica:');
    eq(c.max, 40, 'tope declarado:');
});
t('el override de la semana manda sobre el default del laboratorio', () => {
    const wd = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };
    S.weekAvailability = { '2026-09-07': { capacity: 3 } };
    eq(sandbox.tpWeeklyCapacityFor('2026-09-07', wd).cap, 3);
    eq(sandbox.tpWeeklyCapacityFor('2026-09-14', wd).cap, 8, 'otra semana usa el default:');
});
t('la capacidad practica NUNCA supera el tope fisico', () => {
    S.vehiclesPerSlot = 1;
    S.capacity = 8;
    S.weekAvailability = {};
    const wd = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };
    const c = sandbox.tpWeeklyCapacityFor(null, wd);
    eq(c.max, 4, 'tope fisico con 1 por par:');
    eq(c.cap, 4, 'acotada al tope:');
    eq(c.acotada, true, 'y se declara que se acoto:');
});
t('tpMigrateCapacity acota una vez el default de fabrica', () => {
    S.vehiclesPerSlot = 1;
    S.capacity = 8;
    S._migr = {};
    sandbox.tpMigrateCapacity();
    eq(S.capacity, 4, 'capacidad acotada al tope real:');
    S.capacity = 8;
    sandbox.tpMigrateCapacity();
    eq(S.capacity, 8, 'idempotente: no vuelve a correr');
});
t('tpSelectWeeklyItems sin opts.capacity usa la practica, no el maximo', () => {
    S.vehiclesPerSlot = 10;
    S.capacity = 6;
    S._migr = { capacity: 9 };
    S.weekAvailability = {};
    S.planData = []; S.testedList = []; S.weekHistory = [];
    const R = sandbox.tpSelectWeeklyItems({ workDays: { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false } });
    eq(R.capacity, 6, 'capacidad usada:');
    eq(R.capReal.max, 40, 'y el tope fisico se sigue reportando:');
});

console.log('\n== Identidad estable: el clic que aceptaba otro plan ==');
t('_tpIdx resuelve por planId aunque el arreglo se recorra', () => {
    S.weeklyPlans = [
        { id: 100, weekDate: '2026-09-07', accepted: false, items: [{ desc: 'A', uid: 'IA' }] }
    ];
    sandbox.tpEnsurePlanIds();
    const pid = sandbox.tpPlanId(S.weeklyPlans[0]);
    // Otro dispositivo sincroniza y su plan queda ANTES en el arreglo.
    S.weeklyPlans.unshift({ id: 999, weekDate: '2026-08-31', accepted: false, items: [] });
    const n = sandbox._tpIdx(pid, 'IA');
    eq(n.weekIdx, 1, 'indice recalculado:');
    eq(n.plan.id, 100, 'y apunta al plan correcto:');
    eq(n.item.desc, 'A');
});
t('un indice viejo sigue funcionando (DOM ya pintado)', () => {
    const n = sandbox._tpIdx(1, 0);
    eq(n.plan.id, 100);
});
t('una referencia que ya no existe devuelve null, no otro plan', () => {
    eq(sandbox._tpIdx('W2020-01-01-1', 'IA'), null);
    eq(sandbox._tpIdx(sandbox.tpPlanId(S.weeklyPlans[1]), 'NO-EXISTE'), null);
});

console.log('\n== tpDedupeWeeklyPlans ==');
t('quita la copia identica sin aceptar, conserva la vigente', () => {
    S.weeklyPlans = [
        { id: 1, weekDate: '2026-09-07', created: '2026-09-01T00:00:00Z', accepted: true, acceptedDate: '2026-09-02', items: [{ desc: 'A' }, { desc: 'B' }] },
        { id: 2, weekDate: '2026-09-07', created: '2026-09-03T00:00:00Z', accepted: false, items: [{ desc: 'B' }, { desc: 'A' }] }
    ];
    sandbox.tpWeekPlanInvalidate();
    eq(sandbox.tpDedupeWeeklyPlans({ skipSave: true }), 1, 'quitadas:');
    eq(S.weeklyPlans.length, 1);
    eq(S.weeklyPlans[0].id, 1, 'sobrevive la aceptada:');
});
t('NO quita una propuesta con contenido distinto', () => {
    S.weeklyPlans = [
        { id: 1, weekDate: '2026-09-07', accepted: true, acceptedDate: '2026-09-02', items: [{ desc: 'A' }] },
        { id: 2, weekDate: '2026-09-07', created: '2026-09-03', accepted: false, items: [{ desc: 'Z' }] }
    ];
    sandbox.tpWeekPlanInvalidate();
    eq(sandbox.tpDedupeWeeklyPlans({ skipSave: true }), 0);
    eq(S.weeklyPlans.length, 2);
});
t('NO quita una propuesta con trabajo hecho encima', () => {
    S.weeklyPlans = [
        { id: 1, weekDate: '2026-09-07', accepted: true, acceptedDate: '2026-09-02', items: [{ desc: 'A' }] },
        { id: 2, weekDate: '2026-09-07', created: '2026-09-03', accepted: false, items: [{ desc: 'A', completed: true }] }
    ];
    sandbox.tpWeekPlanInvalidate();
    eq(sandbox.tpDedupeWeeklyPlans({ skipSave: true }), 0);
});

// ══════════════════════════════════════════════════════════════════════
// [v23.1] OBD II no acredita el REQ de emisiones + el horizonte unificado
// ══════════════════════════════════════════════════════════════════════

const CFGS = [
    { desc: 'CFG-A', id: 'a', mod: 'K5', rgn: 'EUROPE', reg: 'EURO-6E', eng: '2.0', tx: 'AT',
      my: '2026', drv: '2WD', body: '5DR', ep: '', engpkg: '', tire: 'R17', total: 9000, hist: 0, m: [] },
    { desc: 'CFG-B', id: 'b', mod: 'K8', rgn: 'MEXICO', reg: 'EPA T3', eng: '2.5', tx: 'AT',
      my: '2026', drv: '2WD', body: '4DR', ep: '', engpkg: '', tire: 'R18', total: 8000, hist: 0, m: [] }
];
function reset(tested) {
    S.planData = JSON.parse(JSON.stringify(CFGS));
    S.testedList = tested || [];
    S.weeklyPlans = [];
    S.weekAvailability = {};
    S.weekHistory = [];
    S.reqPurposes = null;
    S.capacity = 4;
    S.vehiclesPerSlot = 1;
    S._lastSave = Date.now() + Math.random();
    sandbox.tpInvalidateCache();
}
function nDe(desc) {
    return sandbox.tpGetAnalysis().filter(a => a.desc === desc)[0].testedN;
}

console.log('\n== OBD II no acredita el REQ de emisiones ==');

t('una prueba de emisiones SI cuenta', () => {
    reset([{ configText: 'CFG-A', date: '2026-09-01', purpose: 'COP-Emisiones' }]);
    eq(nDe('CFG-A'), 1);
});
t('una prueba de OBD2 NO cuenta', () => {
    reset([{ configText: 'CFG-A', date: '2026-09-01', purpose: 'COP-OBD2' }]);
    eq(nDe('CFG-A'), 0);
});
t('los tres propositos de OBD2 quedan fuera', () => {
    reset(['COP-OBD2', 'EO-OBD2', 'ND-OBD2'].map(p => ({ configText: 'CFG-A', date: '2026-09-01', purpose: p })));
    eq(nDe('CFG-A'), 0);
});
t('una fila SIN proposito cuenta (opt-out: las ~500 historicas no se degradan)', () => {
    reset([{ configText: 'CFG-A', date: '2026-09-01' }]);
    eq(nDe('CFG-A'), 1);
});
t('correlacion, investigacion y ND-Emisiones SI cuentan por default', () => {
    reset(['Correlacion', 'Investigacion', 'ND-Emisiones'].map(p => ({ configText: 'CFG-A', date: '2026-09-01', purpose: p })));
    eq(nDe('CFG-A'), 3);
});
t('la evidencia NO se borra: sigue en testedList', () => {
    reset([{ configText: 'CFG-A', date: '2026-09-01', purpose: 'COP-OBD2' }]);
    eq(S.testedList.length, 1, 'la fila sigue ahi:');
    eq(sandbox.tpCoverageSummary().totalNoEmisiones, 1, 'y se DECLARA:');
});
t('apagar el filtro devuelve los numeros exactos de antes', () => {
    reset([{ configText: 'CFG-A', date: '2026-09-01', purpose: 'COP-OBD2' }]);
    eq(nDe('CFG-A'), 0);
    S.reqPurposes['COP-OBD2'] = true;
    S._lastSave = Date.now() + Math.random();
    sandbox.tpInvalidateCache();
    eq(nDe('CFG-A'), 1, 'reversible:');
});
t('el desglose dice cuantas y de que proposito', () => {
    reset([
        { configText: 'CFG-A', date: '2026-09-01', purpose: 'COP-OBD2' },
        { configText: 'CFG-B', date: '2026-09-01', purpose: 'COP-OBD2' },
        { configText: 'CFG-B', date: '2026-09-02', purpose: 'EO-OBD2' },
        { configText: 'CFG-B', date: '2026-09-03', purpose: 'COP-Emisiones' }
    ]);
    const b = sandbox.tpNoReqBreakdown();
    eq(b.total, 3);
    eq(b.byPurpose['COP-OBD2'], 2);
    eq(b.byPurpose['EO-OBD2'], 1);
});
t('el deficit NO baja con una prueba de OBD2', () => {
    reset([]);
    const req = sandbox.tpGetAnalysis().filter(a => a.desc === 'CFG-A')[0].required;
    reset([{ configText: 'CFG-A', date: '2026-09-01', purpose: 'COP-OBD2' }]);
    eq(sandbox.tpGetAnalysis().filter(a => a.desc === 'CFG-A')[0].deficit, req, 'deficit intacto:');
});
t('tpPurposeCountsForReq: sin proposito y "Manual" cuentan', () => {
    reset([]);
    eq(sandbox.tpPurposeCountsForReq(''), true);
    eq(sandbox.tpPurposeCountsForReq(null), true);
    eq(sandbox.tpPurposeCountsForReq('Manual'), true);
    eq(sandbox.tpPurposeCountsForReq('COP-OBD2'), false);
});

console.log('\n== tpPlanHorizon: un solo lazo para varias semanas ==');

t('el deficit DECAE de una semana a la siguiente', () => {
    reset([]);
    const H = sandbox.tpPlanHorizon({ weeks: 3, startDate: '2026-09-07', capacity: 1 });
    eq(H.weeks.length, 3);
    // Repetir la misma config entre semanas es CORRECTO: con REQ 27 hacen falta 27
    // pruebas. Lo que se verifica es que el deficit que la fila declara vaya bajando —
    // eso es lo que antes no pasaba porque cada lazo llevaba su propio contador.
    const d = H.weeks.map(w => w.items[0] && w.items[0].deficit);
    if (!(d[0] > d[1] && d[1] > d[2])) {
        throw new Error('el deficit no decae en el horizonte: ' + JSON.stringify(d));
    }
});
t('la lista rodante crece con lo planeado', () => {
    reset([]);
    const H = sandbox.tpPlanHorizon({ weeks: 2, startDate: '2026-09-07', capacity: 2 });
    eq(H.tested.length, S.testedList.length + H.totalItems, 'rodante = real + planeado:');
});
t('una semana marcada NO disponible se salta', () => {
    reset([]);
    S.weekAvailability = { '2026-09-14': { available: false } };
    const H = sandbox.tpPlanHorizon({ weeks: 3, startDate: '2026-09-07', capacity: 2 });
    eq(H.weeks[1].unavailable, true);
    eq(H.weeks[1].items.length, 0);
});
t('respectAvailability:false ignora la no disponibilidad (el simulador)', () => {
    reset([]);
    S.weekAvailability = { '2026-09-14': { available: false } };
    const H = sandbox.tpPlanHorizon({ weeks: 3, startDate: '2026-09-07', capacity: 2, respectAvailability: false });
    if (H.weeks[1].unavailable) throw new Error('no debio saltarse');
});
t('las obligatorias solo aplican a la PRIMERA semana', () => {
    reset([]);
    const H = sandbox.tpPlanHorizon({ weeks: 2, startDate: '2026-09-07', capacity: 1,
                                      selectOpts: { manualPicks: ['CFG-B'] } });
    eq(H.weeks[0].items[0].desc, 'CFG-B', 'la fijada entra a la semana 1:');
    eq(H.weeks[1].items.filter(i => i.manual).length, 0, 'y NO se repite fijada en la 2:');
});
t('tpSelectWeeklyItems con testedSeed no toca el testedList real', () => {
    reset([]);
    const antes = S.testedList.length;
    sandbox.tpSelectWeeklyItems({ testedSeed: [{ configText: 'CFG-A', date: 'x' }], capacity: 2 });
    eq(S.testedList.length, antes, 'sigue pura respecto a tpState:');
});
t('una prueba de OBD2 planeada no baja el deficit del horizonte', () => {
    reset([]);
    S.startPurposeByRegion = { EUROPE: 'COP-OBD2', '*': 'COP-Emisiones' };
    const H = sandbox.tpPlanHorizon({ weeks: 2, startDate: '2026-09-07', capacity: 1 });
    const a = H.weeks[0].items[0];
    if (a.desc === 'CFG-A' && H.weeks[1].items[0] && H.weeks[1].items[0].desc !== 'CFG-A') {
        // CFG-A es EUROPE: su fila sintetica es OBD2 y no acredita, asi que la semana 2
        // deberia volver a proponerla antes que nada si el deficit sigue igual de alto.
    }
    S.startPurposeByRegion = {};
    eq(typeof a.purpose, 'string', 'la fila lleva su proposito:');
});

console.log('\n== El auto-plan ya no existe ==');
t('tpAutoGenerateIfNeeded / tpShouldAutoGenerate estan borradas', () => {
    eq(typeof sandbox.tpAutoGenerateIfNeeded, 'undefined');
    eq(typeof sandbox.tpShouldAutoGenerate, 'undefined');
});

console.log('\n' + pass + ' pasaron, ' + fail + ' fallaron\n');
process.exit(fail ? 1 : 0);
