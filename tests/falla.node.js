// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [3.25.0] Una prueba que falla se registra · la celda tiene su carta ·  ║
// ║  al aprobar se compara contra la familia                             ║
// ╚══════════════════════════════════════════════════════════════════════╝
// 1) Liberar con un gas sobre el límite exige confirmar y observar; aprobar exige decidir
//    (válida / inválida + causa + nota). Una inválida NO cuenta para CoP; una válida SÍ.
// 2) La carta de los vehículos Master agrupa las pruebas aprobadas de su VIN (formato
//    simple o emisiones), en orden de prueba, y alarma con Nelson (CO₂ incluido).
// 3) copFamilyCheck dice "atípico" a más de 3σ de la historia aprobada de la familia.
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
    localToday: () => '2026-10-28', localDateStr: d => new Date(d).toISOString().slice(0, 10),
    CSV_CONFIGURATIONS: '', allConfigurations: [], invState: { gases: [] },
    tpUpdateBadges: noop, tpRender: noop, cascadeInjectTooltipsDeferred: noop, tabCacheInvalidate: noop,
    _normalizeRegulation: r => r || 'N/A',
    isEmissionsPurpose: p => /emisiones/i.test(String(p || '')),
    db: { vehicles: [], siteMasters: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const app = read('app.js');
vm.runInContext(/var VEHICLE_STATUS_HISTORIC = [\s\S]*?\nfunction vehicleListDate\(v\) \{[\s\S]*?\n\}/.exec(app)[0], ctx);
// De cop15.js: la regla del liberador y el bloque de la falla (funciones PURAS de arriba).
const c15 = read('cop15.js');
vm.runInContext(/function _libGasHasLimit\(g\)[^\n]*\n/.exec(c15)[0], ctx);
vm.runInContext(/function _libVerifyReleaseValues\(profile, values\) \{[\s\S]*?\n\}\n/.exec(c15)[0], ctx);
const ini = c15.indexOf('var FAIL_NOTE_MIN = 5;');
const fin = c15.indexOf('// ─── Liberación ───', ini);
vm.runInContext(c15.slice(ini, fin), ctx, { filename: 'cop15.js#falla' });
vm.runInContext(/function vehicleMasterOf\(v\) \{[\s\S]*?\n\}\n/.exec(c15)[0], ctx);
['vets.js', 'cop_validator.js'].forEach(f => vm.runInContext(read(f), ctx, { filename: f }));

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle !== undefined ? ' — ' + JSON.stringify(detalle) : '')); }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n== Liberar una falla ==');
const prof = { gases: [{ field: 'CO', label: 'CO', unit: 'g/km', limit: 1 }, { field: 'NOx', label: 'NOx', unit: 'g/km', limit: 0.06 },
                       { field: 'CO2', label: 'CO2', unit: 'g/km', limit: null }] };
let rv = ctx._libVerifyReleaseValues(prof, { CO: 0.5, NOx: 0.071, CO2: 150 });
ok('NOx 0.071 > 0.06: falla en NOx, nada falta', !rv.ok && rv.failing.join() === 'NOx' && !rv.missing.length, rv);
ok('sin confirmar no se envía', /Confirma/.test(ctx.libFailDeclWhy(rv.failing, { confirmed: false, note: 'el reporte dice eso' })));
ok('sin observación no se envía', /qué observaste/.test(ctx.libFailDeclWhy(rv.failing, { confirmed: true, note: 'ok' })));
ok('confirmada y observada: se envía', ctx.libFailDeclWhy(rv.failing, { confirmed: true, note: 'VETS dice 0.071' }) === '');
ok('sin gases sobre el límite no se pide nada', ctx.libFailDeclWhy([], null) === '');

console.log('\n== Aprobar decide ==');
ok('sin decisión no se aprueba', /decide si es una falla válida/.test(ctx.aprFailDecisionWhy(['NOx'], null)));
ok('inválida sin causa no se aprueba', /causa/.test(ctx.aprFailDecisionWhy(['NOx'], { verdict: 'invalida', note: 'analizador sin calibrar' })));
ok('inválida con causa desconocida no se aprueba', /causa/.test(ctx.aprFailDecisionWhy(['NOx'], { verdict: 'invalida', cause: 'xx', note: 'analizador sin calibrar' })));
ok('válida sin nota no se aprueba', /en qué te basas/.test(ctx.aprFailDecisionWhy(['NOx'], { verdict: 'valida', note: '' })));
ok('válida con nota: se aprueba', ctx.aprFailDecisionWhy(['NOx'], { verdict: 'valida', note: 'revisé VETS y la calibración' }) === '');
ok('inválida con causa y nota: se aprueba', ctx.aprFailDecisionWhy(['NOx'], { verdict: 'invalida', cause: 'equipo', note: 'span del NOx fuera' }) === '');

const recV = ctx.failureRecord(['NOx'], { verdict: 'valida', note: '  revisé VETS ' }, { name: 'Ana', id: 'ana' },
                               { note: 'VETS dice 0.071', by: 'Beto', at: '2026-10-27T10:00:00Z' }, '2026-10-28T09:00:00Z');
ok('registro de falla válida: sin causa, con quien liberó', recV.verdict === 'valida' && !('cause' in recV) && recV.byId === 'ana' &&
   recV.releaser.by === 'Beto' && recV.note === 'revisé VETS', recV);
ok('ninguna clave undefined (Firestore la rechaza)', !JSON.stringify(recV, (k, v) => v === undefined ? '__U__' : v).includes('__U__'));
const recI = ctx.failureRecord(['NOx'], { verdict: 'invalida', cause: 'equipo', note: 'span fuera' }, { name: 'Ana' }, null, '2026-10-28T09:00:00Z');
ok('registro de prueba inválida: causa con su texto, sin byId vacío', recI.cause === 'equipo' && /equipo de medición/.test(recI.causeLabel) && !('byId' in recI) && !('releaser' in recI), recI);
ok('textos cortos', /^✗ Falla válida: NOx$/.test(ctx.vehicleFailureText(recV)) && /^⊘ Prueba inválida — Falla o calibración/.test(ctx.vehicleFailureText(recI)));

console.log('\n== ¿Cuenta para CoP? ==');
const base = { status: 'archived', purpose: 'COP-Emisiones', vin: 'KNA0000000000001',
               testData: { testDatetime: '2026-10-20T10:00', gasResults: { aprobador: { values: { CO: 0.5, NOx: 0.071 } } } } };
const vV = JSON.parse(JSON.stringify(base)); vV.testData.failure = recV;
const vI = JSON.parse(JSON.stringify(base)); vI.testData.failure = recI;
ok('una falla VÁLIDA cuenta (su valor entra al muestreo)', ctx.copTestUsable(vV).usable && ctx.copTestCounts(vV));
ok('una prueba INVÁLIDA no cuenta y dice por qué', !ctx.copTestUsable(vI).usable && /invalidada al aprobar: Falla o calibración/.test(ctx.copTestUsable(vI).text), ctx.copTestUsable(vI));
ok('una que pasó sigue contando igual', ctx.copTestCounts(base));

// ─────────────────────────────────────────────────────────────────────────
console.log('\n== Carta de la celda (vehículos Master) ==');
const VIN = 'KNAMASTER00000123';
const cfg = { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1600CC', 'EMISSION REGULATION': 'PRE-EURO 7', 'REGION': 'EUROPE' };
const simple = (i, nox, co2, extra) => Object.assign({ id: 'm' + i, vin: VIN, status: 'archived', purpose: 'Correlacion', config: cfg,
    testData: { simple: { datetime: '2026-0' + (1 + Math.floor(i / 3)) + '-1' + (i % 3) + 'T09:00',
        master: { values: { NOx: nox, CO2: co2 }, profile: { name: 'PRE-EURO 7', gases: [{ field: 'NOx', label: 'NOx', unit: 'g/km' }, { field: 'CO2', label: 'CO2', unit: 'g/km' }] } } } } }, extra || {});
const masters = [{ id: 'mx1', vin: VIN, name: 'Master K4' }, { id: 'mx2', vin: 'KNAOTRO0000000000', name: 'Sin pruebas' }, { id: 'mx3', vin: 'X', deleted: true }];
const vehs = [simple(0, 0.020, 140), simple(1, 0.021, 141), simple(2, 0.019, 139), simple(3, 0.020, 140),
              simple(4, 0.022, 140, { status: 'pending-approval' }),   // no aprobada: no entra
              simple(5, 0.050, 180, { testData: { simple: { datetime: '2026-02-12T09:00', master: { values: { NOx: 0.05, CO2: 180 } } }, failure: recI } }),   // inválida: no entra
              { id: 'e1', vin: VIN, status: 'archived', purpose: 'COP-Emisiones', config: cfg,
                testData: { testDatetime: '2026-01-05T09:00', gasResults: { aprobador: { values: { NOx: 0.020, CO2: 141 } } } } }];
let mf = ctx.copMasterFamilies({ masters, vehicles: vehs });
ok('un renglón por Master vivo (el borrado no sale)', mf.length === 2 && mf.every(f => f.master && /^MASTER:/.test(f.key)), mf.map(f => f.key));
const k4 = mf.find(f => f.masterId === 'mx1');
ok('solo pruebas aprobadas y que sirven (5 de 7)', k4.n === 5, k4.n);
ok('en orden de PRUEBA (la de emisiones del 5-ene va primero)', k4.tests[0].vehicleId === 'e1' && k4.tests.every((t, i, a) => !i || a[i - 1].date <= t.date), k4.tests.map(t => t.date));
ok('el formato simple aporta sus gases del Master', k4.tests.some(t => t.values.CO2 === 139));
ok('un Master sin pruebas sale con n = 0', mf.find(f => f.masterId === 'mx2').n === 0);
ok('con la celda estable no hay alarma', ctx.copMasterScanAlarms({ masters, vehicles: vehs }).length === 0);
// Seis pruebas más, cada una más alta en CO₂: tendencia (R3) → la celda deriva.
const deriva = vehs.concat([0, 1, 2, 3, 4, 5].map(i => simple(10 + i, 0.020, 142 + i * 2, {
    testData: { simple: { datetime: '2026-05-0' + (i + 1) + 'T09:00', master: { values: { NOx: 0.020, CO2: 142 + i * 2 } } } } })));
const al = ctx.copMasterScanAlarms({ masters, vehicles: deriva });
ok('el CO₂ subiendo prueba tras prueba alarma (en la celda el CO₂ SÍ cuenta)', al.some(a => a.gas === 'CO2' && a.master), al);

// ─────────────────────────────────────────────────────────────────────────
console.log('\n== Al aprobar: comparado con su familia ==');
const gases = [{ field: 'NOx', label: 'NOx', unit: 'g/km' }, { field: 'CO', label: 'CO', unit: 'g/km' }];
const hist = [0.020, 0.022, 0.019, 0.021, 0.020, 0.023, 0.021, 0.020].map(x => ({ values: { NOx: x, CO: 0.30 } }));
let fc = ctx.copFamilyCheck(hist, { NOx: 0.021, CO: 0.30 }, gases);
ok('un NOx típico es normal', fc.rows[0].status === 'normal' && fc.n === 8, fc.rows[0]);
ok('CO idéntico en toda la historia: sin variación (no se inventa una σ)', fc.rows[1].status === 'sin-variacion', fc.rows[1]);
fc = ctx.copFamilyCheck(hist, { NOx: 0.21 }, gases);
ok('un cero de más (0.21 en vez de 0.021) es ATÍPICO', fc.atypical.length === 1 && fc.atypical[0].field === 'NOx' && fc.atypical[0].z > 3, fc.rows[0]);
fc = ctx.copFamilyCheck(hist, { NOx: 0.021 * 1.609344 }, gases);
ok('g/mi tecleado como g/km también salta', fc.rows[0].status !== 'normal', fc.rows[0]);
fc = ctx.copFamilyCheck(hist.slice(0, 3), { NOx: 0.5 }, gases);
ok('con menos de 4 ensayos no se juzga ("sin historia")', fc.rows[0].status === 'pocos' && !fc.atypical.length, fc.rows[0]);
const rec = ctx.copFamilyCheckRecord(ctx.copFamilyCheck(hist, { NOx: 0.21 }, gases), '2026-10-28T09:00:00Z');
ok('el registro congela n, media, σ y z del atípico', rec.n === 8 && rec.atypical[0].field === 'NOx' && typeof rec.atypical[0].z === 'number' && rec.atypical[0].mean > 0, rec);
ok('sin historia suficiente no se congela nada', ctx.copFamilyCheckRecord(ctx.copFamilyCheck(hist.slice(0, 2), { NOx: 0.02 }, gases), 'x') === null);
const html = ctx.copFamilyCheckHTML(ctx.copFamilyCheck(hist, { NOx: 0.21 }, gases), 'CL4 · 1600CC');
ok('la tarjeta dice que NO bloquea y qué revisar', /No bloquea/.test(html) && /g\/mi contra g\/km/.test(html) && /atípico/.test(html));

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exitCode = fallaron ? 1 : 0;
