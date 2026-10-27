// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.13.0 — El Plan pide el REQ de corporativo (año calendario)         ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Código REAL de testplan.js + cop_validator.js + copreport.js (tools/digest-env).
const { loadDigestEnv } = require('../tools/digest-env');
const P = loadDigestEnv();

let pasaron = 0, fallaron = 0;
function ok(n, c, d) { if (c) { pasaron++; console.log('  ok  ' + n); } else { fallaron++; console.log('  FALLA  ' + n + (d !== undefined ? ' — ' + d : '')); } }

P.localToday = () => '2026-10-20';
P.localDateStr = d => new Date(d).toISOString().slice(0, 10);
const cfg = (desc, my, rgn, reg, m, extra) => Object.assign({ desc, id: desc, mod: 'CL4', eng: '1000cc KAPPA PE', tx: '6MT', my, reg, ep: '0', engpkg: '0',
    body: '5DR', rgn, drv: 'LHD', tire: '205/55 R16', m, total: m.reduce((s, v) => s + v, 0), hist: 0 }, extra || {});
const months = ['Jun-26', 'Oct-26', 'Nov-26'];
const planData = () => [
    cfg('EU26', '26 MODEL', 'EUROPE', 'PRE-EURO 7', [800, 0, 0]),
    cfg('EU27', '27 MODEL', 'EUROPE', 'PRE-EURO 7', [0, 300, 200]),
    cfg('ME26', '26 MODEL', 'MIDDLE EAST', 'EURO-5', [0, 50, 0], { mod: 'BL7m' }),
    cfg('EU5', '26 MODEL', 'EUROPE', 'EURO-5', [0, 2000, 0], { mod: 'K3' })
];
const veh = (i, my, d, status, extra) => Object.assign({ id: 'v' + i, vin: 'KNAX' + i, status: status || 'archived', purpose: 'COP-Emisiones',
    registeredAt: (d || '2026-10-18') + 'T08:00:00Z',
    config: { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1000cc KAPPA PE', 'TRANSMISSION': '6MT', 'MODEL YEAR (VIN)': my, 'EMISSION REGULATION': 'PRE-EURO 7',
              'ENVIRONMENT PACKAGE': '0', 'ENGINE PACKAGE': '0', 'BODY TYPE': '5DR', 'REGION': 'EUROPE' },
    testData: { testDatetime: d ? d + 'T10:00' : '', gasResults: status && status !== 'archived' ? {} :
        { aprobador: { values: { CO: 0.2, THC: 0.03, NMHC: 0.02, NOx: 0.01, PM: 0.0002, PN: 1e10 } } } } }, extra || {});
function setup(vehicles, tested, extra) {
    P.db.vehicles = vehicles;
    P.__tpSet(Object.assign({ planData: planData(), months, testedList: tested || [], weeklyPlans: [],
        rules: [{ region: '*', regulation: '*', ratio: 3, per: 1000, label: 'Todas' }], _lastSave: Math.random() }, extra || {}));
    P.__copSet({});
    P.__setRegProfiles(null);
    P.tpInvalidateCache();
}
const A = () => { const o = {}; P.tpGetAnalysis().forEach(a => { o[a.desc] = a; }); return o; };

console.log('\n== El déficit de una familia de corporativo es el del año ==');
setup([veh(1, '26 MODEL', '2026-06-10'), veh(2, '26 MODEL', '2026-07-01'), veh(3, '27 MODEL', '2026-10-19', 'in-progress')]);
let a = A();
ok('MY26 + MY27 = 1,300 unidades → REQ 3; 2 hechas + 1 en curso → no falta nada', a.EU26.deficit === 0 && a.EU27.deficit === 0 && a.EU27.copYear.pending === 0,
   JSON.stringify(a.EU27.copYear));
ok('no propone MY27 de una familia cumplida', !P.tpSelectWeeklyItems({ capacity: 8, ignoreFilters: true, weekDate: '2026-10-26' }).items.some(i => /^EU/.test(i.desc) && i.desc !== 'EU5'));
ok('la familia cumplida cuenta como cumplida en la cobertura', a.EU26.required + a.EU27.required === 3 && [a.EU26, a.EU27].every(x => x.status === 'ok'));
ok('se declara la regla', /CoP corporativo 2026/.test(a.EU27.ruleInfo.label) && /REQ 3 − hechas 2 − en curso 1/.test(a.EU27.ruleInfo.formula), a.EU27.ruleInfo.formula);

setup([veh(1, '26 MODEL', '2026-06-10'), veh(4, '26 MODEL', '2025-11-01')]);
a = A();
ok('falta 2 (un ensayo de 2025 no cuenta para 2026) y se pide a la que sigue en producción (MY27)', a.EU27.deficit === 2 && a.EU26.deficit === 0, a.EU27.deficit + '/' + a.EU26.deficit);
ok('Medio Oriente EURO-5: 1 por familia', a.ME26.deficit === 1 && a.ME26.copYear.req === 1);
ok('Europa EURO-5 sigue con las reglas del laboratorio (3 por cada 1,000 → 6)', !a.EU5.copYear && a.EU5.required === 6 && a.EU5.deficit === 6, a.EU5.required);

setup([veh(1, '26 MODEL', '2026-06-10'), veh(4, '26 MODEL', '2025-11-01')],
      [{ configText: 'EU27', date: '2026-10-15', verified: false, source: 'plan-manual', purpose: 'COP-Emisiones' },
       { configText: 'EU27', date: '2025-12-01', verified: false, source: 'plan-manual', purpose: 'COP-Emisiones' }]);
a = A();
ok('una declarada del año baja el pendiente; la de 2025 no', a.EU27.deficit === 1 && a.EU27.copYear.declared === 1, JSON.stringify(a.EU27.copYear));

setup([veh(1, '26 MODEL', '2026-06-10')], [{ configText: 'EU27', date: '2026-10-15', verified: false, source: 'plan-manual', purpose: 'COP-OBD2' }]);
a = A();
ok('una declarada de OBD II no baja el pendiente de emisiones', a.EU27.deficit === 2, a.EU27.deficit);

console.log('\n== [3.22.0] Solo cuenta lo registrado como conformidad de la producción ==');
setup([veh(1, '26 MODEL', '2026-06-10'), veh(2, '26 MODEL', '2026-07-01', 'archived', { purpose: 'EO-Emisiones' }),
       veh(3, '27 MODEL', '2026-10-19', 'in-progress', { purpose: 'ND-Emisiones' })],
      [{ configText: 'EU27', date: '2026-10-15', verified: false, source: 'plan-manual', purpose: 'Investigacion' }]);
a = A();
ok('una EO archivada, una ND en curso y una investigación declarada no bajan el pendiente (falta 2)', a.EU27.deficit === 2 && a.EU27.copYear.done === 1 &&
   a.EU27.copYear.inFlight === 0 && a.EU27.copYear.declared === 0, JSON.stringify(a.EU27.copYear));
const MO = P.copYearReportModel({ force: true });
ok('el estatus la declara aparte: 1 ensayo EO del alcance', MO.otherPurpose.length === 1 && MO.otherPurpose[0].purpose === 'EO-Emisiones' && MO.otherPurpose[0].n === 1,
   JSON.stringify(MO.otherPurpose));
const AU = P.copRepYearAudit(2026, MO);
ok('la lista de revisión trae los tres, con el motivo', AU.length === 3 && AU.filter(x => x.counts).length === 1 &&
   AU.some(x => x.purpose === 'EO-Emisiones' && /EO · Emisiones|EO-Emisiones/.test(x.why)) && AU.some(x => x.why === 'en curso' || /Nuevo desarrollo|ND-Emisiones/.test(x.why)),
   JSON.stringify(AU.map(x => [x.purpose, x.counts, x.why])));

console.log('\n== [3.22.0] count_hist como producción del año ==');
setup([veh(1, '26 MODEL', '2026-06-10')], [], { planImportDate: '2026-10-09T15:00:00Z', planFirstMonth: 'Oct-26',
    planData: [cfg('EU26', '26 MODEL', 'EUROPE', 'PRE-EURO 7', [999, 200, 0], { hist: 7400 }), cfg('EU27', '27 MODEL', 'EUROPE', 'PRE-EURO 7', [0, 300, 200])] });
a = A();
ok('7,400 acumuladas + 700 por producir (sin el junio viejo) → 6 ensayos', a.EU27.copYear.req === 6, JSON.stringify(a.EU27.copYear));
const MH = P.copYearReportModel({ force: true });
ok('el estatus usa el acumulado: ene–sep no faltan (solo dic, que el plan no trae)', MH.rows[0].vol === 8100 && MH.missingMonths.join() === '12' && MH.histAsOf === '2026-10-09',
   MH.rows[0].vol + ' ' + MH.missingMonths);

console.log('\n== [3.22.0] Con qué propósito nace una prueba ==');
setup([]);
ok('Europa PRE-EURO 7 nace CoP; Europa EURO-5 (fuera del alcance) nace EO', P.tpPurposeForCfg(planData()[1]) === 'COP-Emisiones' && P.tpPurposeForCfg(planData()[3]) === 'EO-Emisiones');
P.__copSet({ yearExclude: { [P.copYearKeyOf(P.tpFamilyKeyForCfg(planData()[1]), 2026)]: { excluded: true, reason: 'híbrido nuevo, piloto', at: '1' } } });
ok('una familia sacada del reporte (unidades piloto) nace EO', P.tpPurposeForCfg(planData()[1]) === 'EO-Emisiones');
P.__copSet({ yearExclude: {} });

console.log('\n== El horizonte no pide de más ==');
setup([veh(1, '26 MODEL', '2026-06-10')]);
const H = P.tpPlanHorizon({ weeks: 3, capacity: 8, startDate: '2026-10-26', selectOpts: { ignoreFilters: true } });
const eu = H.weeks.reduce((s, w) => s + w.items.filter(i => i.desc === 'EU27' || i.desc === 'EU26').length, 0);
const me = H.weeks.reduce((s, w) => s + w.items.filter(i => i.desc === 'ME26').length, 0);
ok('la familia europea se propone exactamente 2 veces en 3 semanas, Medio Oriente 1', eu === 2 && me === 1, eu + '/' + me);
ok('la fila guarda el REQ y lo que falta del año', H.weeks[0].items.filter(i => i.desc === 'EU27').every(i => i.required === 3));

console.log('\n== El interruptor ==');
setup([veh(1, '26 MODEL', '2026-06-10')], [], { copReqMode: { on: false, at: '2026-10-01T00:00:00Z', by: 'Ana' } });
a = A();
ok('apagado: vuelve a la regla por configuración (MY27 500 u × 3/1000 → 2, sin copYear)', !a.EU27.copYear && a.EU27.required === 2 && !P.tpCopReqSummary(), a.EU27.required);
ok('encendido por default', (() => { setup([]); return P.tpCopReqModeOn() && !!P.tpCopReqSummary(); })());
const x = { on: false, at: '2026-10-01', by: 'A' }, y = { on: true, at: '2026-10-02', by: 'B' };
ok('sync: gana el cambio más reciente, en los dos sentidos', P.tpCopReqModeUnion(x, y) === y && P.tpCopReqModeUnion(y, x) === y && P.tpCopReqModeUnion(null, x) === x);
ok('sync: se detecta lo nuevo y no lo repetido', P.tpCopReqModeNewTo(x, y) && !P.tpCopReqModeNewTo(y, x) && !P.tpCopReqModeNewTo(y, y) && P.tpCopReqModeNewTo(null, x));

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
