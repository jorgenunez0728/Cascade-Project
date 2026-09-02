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
const sandbox = {
    localStorage, console,
    window: {}, document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
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
    tabCacheInvalidate: noop, fbPush: noop, dispatchEvent: noop, CustomEvent: function(){},
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

console.log('\n== El auto-plan ya no existe ==');
t('tpAutoGenerateIfNeeded / tpShouldAutoGenerate estan borradas', () => {
    eq(typeof sandbox.tpAutoGenerateIfNeeded, 'undefined');
    eq(typeof sandbox.tpShouldAutoGenerate, 'undefined');
});

console.log('\n' + pass + ' pasaron, ' + fail + ' fallaron\n');
process.exit(fail ? 1 : 0);
