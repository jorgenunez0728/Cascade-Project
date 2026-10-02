// [2.27.0] El emparejador prueba ↔ fila del plan, probado sin DOM.
// Reproduce el caso reportado: la fila del martes estaba planeada con rin 16, se corrio
// una rin 17 (MILD HEV), el plan "nunca la detecto" y el menu Vincular decia "no hay
// pruebas registradas en esta semana" con el vehiculo liberado ahi mismo.
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
vm.runInContext(/var VEHICLE_STATUS_HISTORIC = [\s\S]*?\nfunction vehicleListDate\(v\) \{[\s\S]*?\n\}/.exec(fs.readFileSync('js/app.js', 'utf8'))[0], sandbox);
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

// Semana del 28-sep-2026 (lunes). Hoy es miércoles 30.
const W = '2026-09-28', WP = '2026-09-21';
function cfg(desc, over) {
    return Object.assign({ desc: desc, id: desc, mod: 'CL4', eng: '1000cc KAPPA PE', tx: '6MT', my: '26 MODEL',
        reg: 'PRE-EURO 7', rgn: 'EUROPE', drv: 'LHD', body: '5DR', ep: '0', engpkg: '0', tire: '205/55 R16',
        total: 6000, hist: 0, m: [] }, over || {});
}
const R16    = cfg('CL4-R16');
const R17    = cfg('CL4-R17', { tire: '225/45 R17' });
const HEV17  = cfg('CL4-HEV-R17', { tire: '225/45 R17', ep: 'MILD HEV' });
const HEV16  = cfg('CL4-HEV-R16', { ep: 'MILD HEV' });
const OTRO   = cfg('CL4-1600', { eng: '1600CC GAMMA-II', tx: '7DCT' });
const WD = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };

function plan(weekDate, items, over) {
    return Object.assign({ id: weekDate, planId: 'P' + weekDate, weekDate: weekDate, accepted: true,
        acceptedDate: weekDate + 'T00:00:00Z', created: weekDate + 'T00:00:00Z', workDays: WD, items: items }, over || {});
}
function row(uid, desc, testDay, over) {
    const dias = ['dom','lun','mar','mie','jue','vie','sab'];
    return Object.assign({ uid: uid, desc: desc, completed: false, testDay: testDay,
        preconDay: dias[dias.indexOf(testDay) - 1] }, over || {});
}
function reset(planes) {
    S.planData = [R16, R17, HEV17, HEV16, OTRO];
    S.testedList = [];
    S.weekHistory = [];
    S.vehiclesPerSlot = 2;
    S.capacity = 4;
    S._migr = { capacity: 9, itemUids: 9, testedVins: 9 };
    S.weekAvailability = {};
    S.weeklyPlans = planes;
    sandbox.db.vehicles = [];
    S._lastSave = (S._lastSave || 0) + 1;
    sandbox.tpWeekPlanInvalidate();
    sandbox.tpInvalidateCache();
    sandbox.tpBoardInvalidate();
}
let _vid = 1000;
function veh(configCode, testDate, over) {
    const v = Object.assign({ id: ++_vid, vin: '3KPFX51B7TE43' + String(_vid).padStart(4, '0'), configCode: configCode,
        purpose: 'COP-Emisiones', status: 'archived', adhoc: false,
        testData: { testDatetime: testDate + 'T08:32' },
        registeredAt: testDate + 'T10:00:00Z', archivedAt: testDate + 'T20:00:00Z', config: {} }, over || {});
    sandbox.db.vehicles.push(v);
    return v;
}
const P = () => S.weeklyPlans.find(p => p.weekDate === W);
const item = uid => { for (const p of S.weeklyPlans) for (const it of p.items) if (it.uid === uid) return it; return null; };

console.log('\n== tpConfigFit: exacta / variante / otra ==');
t('otro rin y otro paquete ambiental = variante, con sus diferencias', () => {
    const f = sandbox.tpConfigFit(HEV17, R16);
    eq(f.level, 'variante');
    eq(f.diffs.map(d => d.field).sort().join(','), 'ep,tire');
});
t("'0', '-' y vacío son lo mismo (nada)", () => {
    eq(sandbox.tpConfigFit(cfg('X', { ep: '' }), cfg('Y', { ep: '0' })).level, 'exacta');
    eq(sandbox.tpConfigFit(cfg('X', { engpkg: '-' }), cfg('Y', { engpkg: '' })).level, 'exacta');
});
t('otro motor = otra (nunca se acredita sola)', () => {
    const f = sandbox.tpConfigFit(OTRO, R16);
    eq(f.level, 'otra'); eq(f.breaksCore, true);
});

console.log('\n== El caso reportado: se planeó rin 16 y se corrió rin 17 ==');
t('la liberación acredita la fila del MISMO día como sustitución', () => {
    reset([plan(W, [row('A', 'CL4-HEV-R17', 'mar', { completed: true, linkedVehicleId: 1 }), row('B', 'CL4-R16', 'mar'), row('C', 'CL4-R17', 'mie')])]);
    const v = veh('CL4-HEV-R17', '2026-09-29');
    const r = sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(r.matched, true, 'acreditó una fila:');
    eq(r.appended, null, 'no la metió como no planeada:');
    eq(r.credited.uid, 'B', 'la del martes (día de la prueba), no la del miércoles:');
    eq(r.fit.level, 'variante');
    const b = item('B');
    eq(b.linkedVehicleId, v.id); eq(b.completed, true); eq(b.substituted, true);
    eq(b.substitution.testedDesc, 'CL4-HEV-R17', 'la sustitución dice qué se corrió de verdad:');
    eq(item('C').completed, false, 'y la del miércoles sigue pendiente:');
});
t('el alta desde el plan (▶ Iniciar) conserva su fila aunque se cambie el rin', () => {
    reset([plan(W, [row('B', 'CL4-R16', 'mar'), row('C', 'CL4-R17', 'mar')])]);
    const v = veh('CL4-HEV-R17', '2026-09-29', { fromPlanItem: { planId: 'P' + W, itemUid: 'C', configCode: 'CL4-R17', variantChanged: true } });
    const r = sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(r.why, 'alta'); eq(r.credited.uid, 'C', 'la fila desde la que se dio de alta:');
    eq(item('C').substituted, true);
});
t('con DOS variantes posibles ese día no adivina: entra no planeada y pregunta', () => {
    reset([plan(W, [row('B', 'CL4-R16', 'mar'), row('D', 'CL4-HEV-R16', 'mar')])]);
    const v = veh('CL4-HEV-R17', '2026-09-29');
    const r = sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(r.matched, false); eq(!!r.appended, true);
    eq(r.alternatives.length, 2, 'ofrece las dos filas:');
    eq(r.alternatives[0].uid, 'D', 'la más parecida primero (1 diferencia):');
    // Elegir una MUEVE el crédito: la no planeada se quita.
    const antes = P().items.length;
    const m = sandbox.tpLinkVehicleToItem('P' + W, 'B', v.id, { move: true });
    eq(m.ok, true);
    eq(P().items.length, antes - 1, 'la fila no planeada que solo lo registraba se quitó:');
    eq(item('B').linkedVehicleId, v.id);
});

console.log('\n== Nunca otra semana (el emparejador viejo caminaba hacia atrás) ==');
t('una fila pendiente de la semana PASADA no se lleva la prueba de ésta', () => {
    reset([plan(WP, [row('OLD', 'CL4-HEV-R17', 'mar')]), plan(W, [])]);
    const v = veh('CL4-HEV-R17', '2026-09-29');
    const r = sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(item('OLD').completed, false, 'la semana pasada queda como estaba:');
    eq(!!r.appended, true, 'la prueba entra a SU semana:');
    eq(r.planId, 'P' + W);
});

console.log('\n== La declarada a mano recibe su vehículo ==');
t('una fila declarada es abierta: la liberación la asciende y retira SU declaración', () => {
    reset([plan(W, [row('B', 'CL4-R17', 'mar', { completed: true, declared: true })])]);
    S.testedList = [{ configText: 'CL4-R17', date: '2026-09-30', note: 'Declarada en el plan — sin vehículo liberado',
                      source: 'plan-manual', verified: false, planId: 'P' + W, itemUid: 'B' }];
    const v = veh('CL4-HEV-R17', '2026-09-29');
    const r = sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(r.credited.uid, 'B');
    const b = item('B');
    eq(b.declared, undefined, 'ya no es declarada:');
    eq(b.linkedVehicleId, v.id);
    eq(S.testedList.filter(x => x.source === 'plan-manual').length, 0, 'la declaración se retiró:');
    eq(S.testedList.filter(x => x.vehicleId === v.id).length, 1, 'y la evidencia real quedó una vez:');
});

console.log('\n== El menú Vincular ya no esconde nada ==');
t('mide la semana con la fecha de PRUEBA (alta el viernes anterior, prueba el martes)', () => {
    reset([plan(W, [row('B', 'CL4-R17', 'mar')])]);
    veh('CL4-HEV-R17', '2026-09-29', { registeredAt: '2026-09-25T10:00:00Z' });
    const l = sandbox.tpLinkableVehiclesFor(item('B'), { plan: P() });
    eq(l.length, 1); eq(l[0].inWeek, true); eq(l[0].fit.level, 'variante');
});
t('un vehículo que acredita una fila de OTRA semana sale con dónde está (y se puede mover)', () => {
    reset([plan(WP, [row('OLD', 'CL4-HEV-R17', 'mar', { completed: true })]), plan(W, [row('B', 'CL4-R17', 'mar', { completed: true, declared: true })])]);
    const v = veh('CL4-HEV-R17', '2026-09-29');
    item('OLD').linkedVehicleId = v.id;       // el daño del emparejador viejo
    const l = sandbox.tpLinkableVehiclesFor(item('B'), { plan: P() });
    eq(l.length, 1, 'aparece (antes: "no hay pruebas registradas en esta semana"):');
    eq(l[0].taken.weekDate, WP);
    const sin = sandbox.tpLinkVehicleToItem('P' + W, 'B', v.id);
    eq(sin.ok, false, 'sin mover, el candado sigue:');
    const r = sandbox.tpLinkVehicleToItem('P' + W, 'B', v.id, { move: true });
    eq(r.ok, true);
    eq(item('OLD').completed, false, 'la fila de la otra semana vuelve a pendiente:');
    eq(item('OLD').linkedVehicleId, undefined);
    eq(item('B').linkedVehicleId, v.id);
});
t('un vínculo en una propuesta que nadie aceptó NO reserva el vehículo', () => {
    reset([plan(W, [row('B', 'CL4-R17', 'mar')]),
           plan(W, [row('Z', 'CL4-HEV-R17', 'mar', { completed: true })], { planId: 'PROP', accepted: false, created: '2026-09-27T00:00:00Z' })]);
    const v = veh('CL4-HEV-R17', '2026-09-29');
    item('Z').linkedVehicleId = v.id;
    const l = sandbox.tpLinkableVehiclesFor(item('B'), { plan: P() });
    eq(l[0].taken, null, 'libre:');
    eq(sandbox.tpLinkVehicleToItem('P' + W, 'B', v.id).ok, true);
    eq(item('Z').linkedVehicleId, undefined, 'y el vínculo muerto se limpió:');
});

console.log('\n== Vincular en curso: la liberación lo completa ==');
t('un vehículo en curso deja la fila "en curso", no "hecha"', () => {
    reset([plan(W, [row('B', 'CL4-R17', 'jue')])]);
    const v = veh('CL4-HEV-R17', '2026-10-01', { status: 'in-progress' });
    eq(sandbox.tpLinkVehicleToItem('P' + W, 'B', v.id).ok, true);
    eq(item('B').completed, false, 'todavía no:');
    eq(S.testedList.length, 0, 'y sin evidencia hasta liberarse:');
    v.status = 'archived';
    const r = sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(r.why, 'ya-vinculada'); eq(item('B').completed, true);
    eq(S.testedList.length, 1);
});

console.log('\n== Revisar la semana ==');
t('sugiere mover la prueba mal acreditada y la no planeada a su fila', () => {
    reset([plan(WP, [row('OLD', 'CL4-HEV-R17', 'mar', { completed: true })]),
           plan(W, [row('B', 'CL4-R17', 'mar', { completed: true, declared: true }), row('E', 'CL4-R16', 'mie')])]);
    const v1 = veh('CL4-HEV-R17', '2026-09-29');
    item('OLD').linkedVehicleId = v1.id;                       // auto viejo (sin linkedAt)
    const v2 = veh('CL4-R16', '2026-09-30');
    sandbox.tpCreditReleaseToWeek(v2, { skipSave: true });     // exacta: se acredita sola
    const s = sandbox.tpWeekCreditSuggestions(W);
    eq(s.length, 1, 'solo la que falta:');
    eq(s[0].vehicle.id, v1.id); eq(s[0].reason, 'otra-semana'); eq(s[0].cand.uid, 'B');
});
t('un vínculo puesto por una persona en otra semana no se discute', () => {
    reset([plan(WP, [row('OLD', 'CL4-HEV-R17', 'mar', { completed: true })]), plan(W, [row('B', 'CL4-R17', 'mar')])]);
    const v = veh('CL4-HEV-R17', '2026-09-29');
    Object.assign(item('OLD'), { linkedVehicleId: v.id, linkedAt: '2026-09-29T12:00:00Z', linkedBy: 'Jorge', linkedVia: 'manual' });
    eq(sandbox.tpWeekCreditSuggestions(W).length, 0);
});
t('desvincular una sustitución nacida del vínculo la deshace', () => {
    reset([plan(W, [row('B', 'CL4-R16', 'mar')])]);
    const v = veh('CL4-HEV-R17', '2026-09-29');
    sandbox.tpCreditReleaseToWeek(v, { skipSave: true });
    eq(item('B').substituted, true);
    sandbox.tpUnlinkVehicleFromItem('P' + W, 'B');
    eq(item('B').substituted, undefined); eq(item('B').completed, false);
});

console.log('\n' + pass + ' pasaron, ' + fail + ' fallaron\n');
process.exit(fail ? 1 : 0);
