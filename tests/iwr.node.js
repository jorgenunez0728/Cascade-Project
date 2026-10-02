// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.31.0] Una prueba aceptada con IWR fuera de rango no cuenta para CoP ║
// ╚══════════════════════════════════════════════════════════════════════╝
// El caso real: WLTP con IWR −2.17 % (la norma pide −2…+4 %). Quien aprueba la acepta;
// su resultado NO entra al validador, al SPC, al Panorama ni al REQ del plan, y eso se
// DECLARA. Una FTP75 con IWR −5.46 % no se juzga así (su IWR no tiene ese criterio).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
function _el() {
    const e = {
        textContent: '', value: '', innerHTML: '', style: {}, dataset: {},
        classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
        setAttribute: noop, getAttribute: () => null, appendChild: noop, remove: noop,
        addEventListener: noop, children: []
    };
    e.querySelector = () => null; e.querySelectorAll = () => []; e.getElementById = () => null;
    e.createElement = () => _el(); e.body = e; e.documentElement = e;
    return e;
}
const store = {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, Set, Map, isNaN, isFinite, parseInt, parseFloat,
    setTimeout, clearTimeout,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: _el(),
    safeParse: (k, d) => d, showToast: noop, auditLog: noop, escapeHtml: s => String(s), CASCADE_TOOLTIPS: {},
    authRequire: () => true, authCan: () => true, undoPush: noop, debounce: fn => fn, requestAnimationFrame: noop,
    localToday: () => '2026-10-02', localDateStr: d => new Date(d).toISOString().slice(0, 10),
    CSV_CONFIGURATIONS: '', allConfigurations: [], invState: { gases: [] },
    tpUpdateBadges: noop, tpRender: noop, cascadeInjectTooltipsDeferred: noop, tabCacheInvalidate: noop,
    _normalizeRegulation: r => r || 'N/A',
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
vm.runInContext(/var VEHICLE_STATUS_HISTORIC = [\s\S]*?\nfunction vehicleListDate\(v\) \{[\s\S]*?\n\}/.exec(app)[0], ctx);
['vets.js', 'cop_validator.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f }));
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'testplan.js'), 'utf8') + '\nvar __getTp = function(){ return tpState; };\n', ctx, { filename: 'testplan.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle !== undefined ? ' — ' + JSON.stringify(detalle) : '')); }
}

const fx = n => { const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8')); return j.sheets || j; };
const recEU = ctx.vetsExtract(fx('vets-eu-wltp.json'));
const recMX = ctx.vetsExtract(fx('vets-mx-ftp75.json'));

/** Resumen como el que se guarda en el vehículo; `iwr` mueve el IWR y su verificación. */
function resumen(rec, iwr, opts) {
    opts = opts || {};
    const r = JSON.parse(JSON.stringify(rec));
    if (iwr !== undefined) {
        r.drive.iwr = iwr;
        const c = r.checks.find(x => x.name === 'IWR');
        if (c) { c.ave = iwr; c.status = (iwr < c.lo || iwr > c.hi) ? 'FAIL' : 'PASS'; c.where = c.status === 'FAIL' ? ['ciclo'] : []; }
        if (opts.sinVerificacion) r.checks = r.checks.filter(x => x.name !== 'IWR');
    }
    const cl = ctx.vetsClassifyChecks(r.checks, opts.policy || []);
    return ctx.vetsSummary(r, { fileName: 'x.xlsx' }, cl, {});
}

console.log('\n== vetsDriveTraceInvalid: la regla ==');
ok('EU real (IWR −1.17 %, PASS) → sirve', ctx.vetsDriveTraceInvalid(resumen(recEU)).length === 0);
const mala = ctx.vetsDriveTraceInvalid(resumen(recEU, -2.17));
ok('IWR −2.17 % (VETS: FAIL) → no sirve', mala.length === 1 && mala[0].code === 'IWR' && mala[0].source === 'vets', mala);
ok('el motivo dice el valor', /−2\.17 %/.test(mala[0].text), mala[0].text);
const sinChk = ctx.vetsDriveTraceInvalid(resumen(recEU, -2.17, { sinVerificacion: true }));
ok('WLTP sin la verificación en VETS: la norma (−2…+4 %) decide igual', sinChk.length === 1 && sinChk[0].source === 'r154', sinChk);
ok('IWR +4.01 % → no sirve', ctx.vetsDriveTraceInvalid(resumen(recEU, 4.01)).length === 1);
ok('IWR −2.00 % exacto → sirve (el borde es válido)', ctx.vetsDriveTraceInvalid(resumen(recEU, -2)).length === 0);
ok('IWR +4.00 % exacto → sirve', ctx.vetsDriveTraceInvalid(resumen(recEU, 4)).length === 0);
const desacr = resumen(recEU, -2.17, { policy: [{ id: 'IWR', level: 'desacreditada', reason: 'x' }] });
ok('aunque el laboratorio desacredite la verificación, no sirve para CoP', ctx.vetsDriveTraceInvalid(desacr).length === 1);
ok('FTP75 de México (IWR −5.46 %, sin verificación IWR) → sirve: no es WLTP', ctx.vetsDriveTraceInvalid(resumen(recMX)).length === 0);
ok('sin resumen de VETS → sirve (no hay con qué juzgar)', ctx.vetsDriveTraceInvalid(null).length === 0);
ok('vetsIsWltp: EU sí, MX no', ctx.vetsIsWltp(resumen(recEU)) && !ctx.vetsIsWltp(resumen(recMX)));

console.log('\n== CoP: validador, SPC y Panorama ==');
const CFG = { 'Modelo': 'SPORTAGE', 'ENGINE CAPACITY': '1.6', 'TRANSMISSION': 'AT', 'MODEL YEAR (VIN)': '2026',
              'EMISSION REGULATION': 'PRE-EURO 7', 'REGION': 'EUROPE', 'BODY TYPE': '5DR' };
let nid = 1;
function veh(vin, co, vets, extra) {
    return Object.assign({ id: nid++, vin: vin, status: 'archived', purpose: 'Emisiones', configCode: 'CFG-EU', config: Object.assign({}, CFG),
        testData: { vets: vets, gasResults: { aprobador: { values: { CO: co, THC: 0.05, NMHC: 0.03, NOx: 0.02 }, capturedAt: '2026-09-0' + nid + 'T10:00:00' } } } }, extra || {});
}
const A = veh('VINAAAAAAAAAAAAA1', 0.30, resumen(recEU));
const B = veh('VINBBBBBBBBBBBBB2', 0.31, resumen(recEU));
const C = veh('VINCCCCCCCCCCCCC3', 0.32, resumen(recEU));
const MALO = veh('VINMALOMALOMALO04', 0.90, resumen(recEU, -2.17));
ctx.db.vehicles = [A, B, C, MALO];
const KEY = ctx.copVehicleFamilyKey(A);

ok('copTestUsable: la buena sirve', ctx.copTestUsable(A).usable === true);
ok('copTestUsable: la de IWR −2.17 % no', ctx.copTestUsable(MALO).usable === false && /IWR/.test(ctx.copTestUsable(MALO).text));

const spc = ctx.copSpcFamilies({ allScopes: true }).find(f => f.key === KEY);
ok('SPC: la familia tiene 3 ensayos, no 4', spc && spc.n === 3, spc && spc.n);
ok('SPC: el VIN malo no está en la serie', spc && !spc.tests.some(t => t.vin === MALO.vin));
const ex = ctx.copExcludedTests({ familyKey: KEY, allScopes: true });
ok('copExcludedTests lo declara, con su motivo', ex.length === 1 && ex[0].vin === MALO.vin && /IWR/.test(ex[0].text), ex);

ctx.copInvalidateCache();
const row = ctx.copPortfolioRows({ force: true }).find(r => r.key === KEY);
ok('Panorama: 3 ensayos y declara 1 excluido', row && row.tests.length === 3 && row.excludedN === 1, row && { n: row.tests.length, ex: row.excludedN });

// Mesa: la fila automática que ya estaba (de antes de 2.31.0) sale; la manual se queda y no cuenta.
ctx.copInitState();
vm.runInContext('copState.familyKey = ' + JSON.stringify(KEY) + ';', ctx);
vm.runInContext('_copSetVehicles(' + JSON.stringify([
    { id: 1, vin: A.vin, values: { CO: '0.3' }, source: 'auto' },
    { id: 2, vin: MALO.vin, values: { CO: '0.9' }, source: 'auto' }
]) + ');', ctx);
const r1 = ctx.copSyncVinsFromTests(KEY);
const mesa = vm.runInContext('copState.vehicles', ctx);
ok('la fila automática del ensayo malo sale de la mesa', r1.removed === 1 && !mesa.some(r => r.vin === MALO.vin), r1);
ok('B y C entran', mesa.some(r => r.vin === B.vin) && mesa.some(r => r.vin === C.vin));
const co = () => ctx.copGetPollStats().find(p => p.id === 'CO');
ok('veredicto de CO con 3 VINes', co().validCount === 3, co().validCount);

vm.runInContext('copState.vehicles.push({ id: 99, vin: ' + JSON.stringify(MALO.vin) + ', values: { CO: "0.9" }, source: "manual" });', ctx);
ctx.copSyncVinsFromTests(KEY);
const mesa2 = vm.runInContext('copState.vehicles', ctx);
ok('una fila MANUAL con ese VIN se queda en la tabla (la puso una persona)', mesa2.some(r => r.vin === MALO.vin && r.source === 'manual'));
ok('…pero no entra al cálculo', co().validCount === 3, co().validCount);

// Re-prueba del mismo vehículo, ahora válida: su fila entra con los valores buenos.
const RE = veh(MALO.vin, 0.33, resumen(recEU, -1.0));
ctx.db.vehicles.push(RE);
vm.runInContext('_copSetVehicles(copState.vehicles.filter(function(r){ return r.source !== "manual" || r.vin !== ' + JSON.stringify(MALO.vin) + '; }).concat([{ id: 50, vin: ' + JSON.stringify(MALO.vin) + ', values: { CO: "0.9" }, source: "auto" }]));', ctx);
ctx.copSyncVinsFromTests(KEY);
const fila = vm.runInContext('copState.vehicles', ctx).filter(r => r.vin === MALO.vin);
ok('re-prueba válida: una sola fila del VIN, con el valor de la buena', fila.length === 1 && Number(fila[0].values.CO) === 0.33, fila);
ok('re-prueba válida: ya no se excluye en el cálculo', co().validCount === 4, co().validCount);
ctx.db.vehicles.pop();

console.log('\n== REQ del plan ==');
const S = ctx.__getTp();
S.planData = [{ desc: 'CFG-EU', mod: 'SPORTAGE', eng: '1.6', tx: 'AT', my: '2026', reg: 'PRE-EURO 7', rgn: 'EUROPE', body: '5DR', total: 100, hist: 0 }];
S.testedList = [
    { configText: 'CFG-EU', date: '2026-09-02', vin: A.vin, vehicleId: A.id, source: 'cop15-release', purpose: 'Emisiones' },
    { configText: 'CFG-EU', date: '2026-09-03', vin: MALO.vin, vehicleId: MALO.id, source: 'cop15-release', purpose: 'Emisiones' }
];
ok('la buena acredita el REQ', ctx.tpTestedCountsForReq(S.testedList[0]) === true);
ok('la de IWR −2.17 % NO acredita el REQ', ctx.tpTestedCountsForReq(S.testedList[1]) === false);
ok('tpTestedCountFor = 1', ctx.tpTestedCountFor('CFG-EU') === 1);
ok('tpTestedCopUnusable da el motivo', /IWR/.test(ctx.tpTestedCopUnusable(S.testedList[1])));
const br = ctx.tpNoReqBreakdown();
ok('se declara en el desglose de lo que no acredita', br.total === 1 && Object.keys(br.byPurpose)[0].indexOf('CoP') >= 0, br);
ok('una declarada a mano (plan-manual) no se juzga por vehículo', ctx.tpTestedCountsForReq({ configText: 'CFG-EU', source: 'plan-manual', vehicleId: MALO.id }) === true);

// Si el vehículo cambia (p. ej. se corrige el archivo de VETS), el conteo se recalcula.
MALO.testData.vets = resumen(recEU, -1.5);
vm.runInContext('_tpCopUsableRev++;', ctx);
ok('tras corregirlo y guardar, vuelve a acreditar', ctx.tpTestedCountsForReq(S.testedList[1]) === true);

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exit(1);
