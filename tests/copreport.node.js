// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.12.0 — CoP por año calendario y estatus semanal para corporativo   ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Código REAL de js/copreport.js (y del bloque de familia del año de cop_validator.js) en un `vm` sin DOM.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, Date, JSON, Object, Array, String, Number, Math, RegExp, isFinite };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'copreport.js'), 'utf8'), ctx, { filename: 'copreport.js' });
// La familia del año calendario vive en cop_validator.js (junto a copVehicleFamilyKey): su bloque real.
const _cv = fs.readFileSync(path.join(__dirname, '..', 'js', 'cop_validator.js'), 'utf8');
vm.runInContext(/\/\/ \[3\.12\.0\] Familia del AÑO CALENDARIO[\s\S]*?(?=\/\*\*\n \* \[2\.4\.0\])/.exec(_cv)[0], ctx, { filename: 'cop_validator.js' });
// copVehicleInFamily usa la clave de siempre (cop_validator.js) y la fecha de prueba (app.js)
vm.runInContext(`
function copVehicleFamilyKey(v) { var c = v.config; return [c.Modelo, c.ENG, c.TX, c.MY, c.REG, c.EP || '', c.EPK || '', c.BODY].join('|'); }
function vehicleTestDate(v) { return v.testData && v.testData.testDatetime ? v.testData.testDatetime.slice(0, 10) : ''; }`, ctx);

let pasaron = 0, fallaron = 0;
function ok(n, c, d) { if (c) { pasaron++; console.log('  ok  ' + n); } else { fallaron++; console.log('  FALLA  ' + n + (d !== undefined ? ' — ' + d : '')); } }
const C = ctx;

console.log('\n== La regla de lotes de corporativo ==');
const casos = [[0, 0], [-5, 0], [1, 3], [7500, 3], [7501, 6], [12500, 6], [12501, 9], [17500, 9], [17501, 12], [40000, 3 * (1 + Math.ceil(32500 / 5000))]];
casos.forEach(([u, r]) => ok(u + ' unidades → ' + r + ' ensayos', C.copLotRequired(u) === r, C.copLotRequired(u)));
ok('el siguiente lote empieza en la unidad 7,501 y luego cada 5,000', C.copLotNextAt(100) === 7501 && C.copLotNextAt(7600) === 12501 && C.copLotNextAt(12500) === 12501);

console.log('\n== La familia del año calendario va ENCIMA de la de siempre ==');
const k26 = 'CL4|1000cc KAPPA PE|6MT|26 MODEL|PRE-EURO 7||| 5DR'.replace('| 5DR', '|5DR');
const k27 = k26.replace('26 MODEL', '27 MODEL');
ok('MY26 y MY27 son la MISMA familia del año', C.copYearKeyOf(k26, 2026) === C.copYearKeyOf(k27, 2026));
ok('la clave conserva 8 segmentos y la norma en su lugar', C.copYearKeyOf(k26, 2026).split('|').length === 8 && C.copYearKeyOf(k26, 2026).split('|')[4] === 'PRE-EURO 7');
ok('se reconoce el año; una clave por año modelo no', C.copYearOfKey(C.copYearKeyOf(k26, 2026)) === 2026 && C.copYearOfKey(k26) === null);
ok('una clave rota no da familia', C.copYearKeyOf('a|b', 2026) === '');
const veh = (my, date) => ({ config: { Modelo: 'CL4', ENG: '1000cc KAPPA PE', TX: '6MT', MY: my, REG: 'PRE-EURO 7', BODY: '5DR' }, testData: { testDatetime: date } });
const yk = C.copYearKeyOf(k26, 2026);
ok('un MY27 probado en 2026 entra a la familia 2026', C.copVehicleInFamily(veh('27 MODEL', '2026-10-01T10:00'), yk));
ok('un ensayo de 2025 no entra a la familia 2026', !C.copVehicleInFamily(veh('26 MODEL', '2025-12-30T10:00'), yk));
ok('sin fecha de prueba no entra (todavía no hay ensayo)', !C.copVehicleInFamily(veh('26 MODEL', ''), yk));
ok('por año modelo sigue siendo la igualdad de siempre', C.copVehicleInFamily(veh('26 MODEL', '2025-01-01'), k26) && !C.copVehicleInFamily(veh('27 MODEL', '2026-01-01'), k26));

console.log('\n== Grupos y meses ==');
ok('CL4MH es el híbrido; MILD HEV no', C.copRepGroupOf({ mod: 'CL4MH', body: 'WGN' }).id === 'hev' && C.copRepGroupOf({ mod: 'CL4', ep: 'MILD HEV', body: 'WGN' }).id === 'wgn');
ok('5DR y 4DR', C.copRepGroupOf({ mod: 'CL4', body: '5DR' }).label === '5 puertas' && C.copRepGroupOf({ mod: 'BL7m', body: '4DR' }).label === '4 puertas');
ok('meses: Jun-26, Ago 2026, 2026-06', C._copRepMonth('Jun-26').m === 6 && C._copRepMonth('Ago 2026').m === 8 && C._copRepMonth('2026-06').y === 2026 && C._copRepMonth('xx') === null);
ok('lunes y semana ISO', C.copRepMonday('2026-10-20') === '2026-10-19' && C.copRepMonday('2026-10-25') === '2026-10-19' && C.copRepIsoWeek('2026-10-20') === 43 && C.copRepIsoWeek('2026-01-01') === 1);

console.log('\n== Producción por año calendario ==');
const months = ['Feb-26', 'Jun-26', 'Jul-26', 'Dec-26', 'Jan-27'];
const cfg = (my, m, extra) => Object.assign({ mod: 'CL4', eng: '1000cc KAPPA PE', tx: '6MT', my, reg: 'PRE-EURO 7', ep: '0', engpkg: '0', body: '5DR', rgn: 'EUROPE', m }, extra || {});
const keyOf = c => [c.mod, c.eng, c.tx, c.my, c.reg, (c.ep && c.ep !== '0') ? c.ep : '', (c.engpkg && c.engpkg !== '0') ? c.engpkg : '', c.body].join('|');
const plan = [cfg('26 MODEL', [0, 100, 50, 0, 999]), cfg('27 MODEL', [0, 0, 20, 30, 999]), cfg('26 MODEL', [0, 5000, 0, 0, 0], { rgn: 'MEXICO', reg: 'EURO-5' })];
const inScope = c => c.rgn === 'EUROPE';
const P = C.copYearProduction({ year: 2026, months, planData: plan, inScope, keyOf, actuals: {} });
const f = P.fams[yk];
ok('MY26 + MY27 se suman en la familia del año', f && f.vol === 200, f && f.vol);
ok('enero de 2027 no cuenta para 2026', f.m[0] === 0 && f.vol === 200);
ok('fuera del alcance no entra', Object.keys(P.fams).length === 1);
ok('se recuerdan los MY con producción en el año', Object.keys(f.mys).sort().join(',') === '26 MODEL,27 MODEL');
ok('un mes que el plan no trae, o que viene en cero para TODO el plan, se declara', P.missing.join(',') === '1,2,3,4,5,8,9,10,11', P.missing.join(','));
ok('…y se marca "sin dato", no "plan"', f.src[1] === 'sin-dato' && f.src[5] === 'plan');
const Pa = C.copYearProduction({ year: 2026, months, planData: plan, inScope, keyOf, actuals: { [yk]: { m: [400, null, '', 10] } } });
ok('lo real manda sobre el plan, mes por mes; vacío deja lo del plan', Pa.fams[yk].m[0] === 400 && Pa.fams[yk].src[0] === 'real' && Pa.fams[yk].m[3] === 10 && Pa.fams[yk].vol === 200 + 400 + 10, Pa.fams[yk].vol);

console.log('\n== El estatus semanal ==');
const big = C.copYearProduction({ year: 2026, months: ['Jun-26'], planData: [cfg('26 MODEL', [8000])], inScope, keyOf });
const t = (d, vin, purpose) => ({ yk, date: d, vin, purpose: purpose || 'COP-Emisiones', region: 'EUROPE' });
const tests = [t('2026-03-01', 'A'), t('2026-10-10', 'B'), t('2026-10-15', 'C'), t('2026-10-19', 'D', 'ND-Emisiones'), t('2026-10-25', 'E'), t('2025-12-01', 'Z')];
const M = C.copYearReportCompute({ year: 2026, cutIso: '2026-10-20', prod: big, tests, verdictOf: (k, list) => list.length >= 3 ? 'CONTINUE' : null, prevSaved: null });
const r = M.rows[0];
ok('8,000 unidades piden 6 ensayos', r.req === 6);
ok('cuentan los del año hasta el corte (ni 2025 ni después del corte)', r.done === 4, r.done);
ok('la semana anterior se deriva por fecha de prueba sin corte guardado', r.prevDone === 2 && r.added === 2 && !M.prevFromSaved);
ok('faltan 2 y el avance es 4/6', r.pending === 2 && Math.abs(r.progress - 4 / 6) < 1e-9);
ok('estatus: en progreso', r.status.id === 'run');
ok('se declaran los propósitos que no son CoP', M.nonCopPurposes['ND-Emisiones'] === 1);
ok('semana 43, comparada contra el 13 de octubre', M.week === 43 && M.prevCut === '2026-10-13');
const snap = C.copRepCutSnapshot(M, '2026-10-20T15:00:00Z', 'Ana');
const M2 = C.copYearReportCompute({ year: 2026, cutIso: '2026-10-27', prod: big, tests, verdictOf: () => 'PASS', prevSaved: snap });
ok('con corte guardado, la semana anterior es lo que se reportó', M2.prevFromSaved && M2.rows[0].prevDone === 4 && M2.rows[0].added === 1);
ok('6 de 6 no: 5 hechas', M2.rows[0].done === 5 && M2.rows[0].status.id === 'run');
const M3 = C.copYearReportCompute({ year: 2026, cutIso: '2026-10-27', prod: big, tests: tests.concat([t('2026-10-26', 'F')]), verdictOf: () => 'PASS' });
ok('REQ cubierto y concordante = cumplido', M3.rows[0].status.id === 'ok' && M3.total.ok === 1);
const M4 = C.copYearReportCompute({ year: 2026, cutIso: '2026-10-27', prod: big, tests, verdictOf: () => 'FAIL' });
ok('un no concordante manda sobre la cobertura', M4.rows[0].status.id === 'fail' && M4.total.fail === 1);

console.log('\n== El avance global no se infla ==');
const yk2 = C.copYearKeyOf(k26.replace('5DR', 'WGN'), 2026);
const two = { fams: { [yk]: { key: yk, mod: 'CL4', body: '5DR', regions: { EUROPE: true }, mys: {}, m: [100], src: [], vol: 100 },
                      [yk2]: { key: yk2, mod: 'CL4', body: 'WGN', regions: { EUROPE: true }, mys: {}, m: [100], src: [], vol: 100 } }, missing: [] };
const many = [1, 2, 3, 4, 5, 6].map(i => t('2026-06-0' + i, 'X' + i));
const MG = C.copYearReportCompute({ year: 2026, cutIso: '2026-10-20', prod: two, tests: many, verdictOf: () => null });
ok('6 ensayos en una familia no cubren la otra: 50%, no 100%', Math.abs(MG.total.progress - 0.5) < 1e-9 && MG.total.pending === 3, MG.total.progress);
const NP = C.copYearReportCompute({ year: 2026, cutIso: '2026-10-20', prod: { fams: { [yk]: Object.assign({}, two.fams[yk], { vol: 0, m: [0] }) }, missing: [] }, tests: many.slice(0, 2) });
ok('con ensayos pero sin producción en el año: fuera del reporte (solo se lista en noProduction)', NP.rows.length === 0 && NP.noProduction.length === 1 && NP.total.req === 0);
ok('lo excluido y lo de fuera del alcance NO se mencionan en el reporte', (() => {
    const H2 = C.copYearReportHTML(Object.assign({}, MG, { excluded: [{ label: 'FAM-X', vol: 5, done: 0, reason: 'piloto' }], outOfScope: [{ label: 'FAM-Y', vol: 9 }] }), {});
    return H2.indexOf('FAM-X') < 0 && H2.indexOf('FAM-Y') < 0 && H2.indexOf('piloto') < 0; })());
ok('una familia sin nada en el año no sale', C.copYearReportCompute({ year: 2026, cutIso: '2026-10-20', prod: { fams: { [yk]: Object.assign({}, two.fams[yk], { vol: 0, m: [0] }) }, missing: [] }, tests: [] }).rows.length === 0);
const MX = C.copYearReportCompute({ year: 2026, cutIso: '2026-10-20', prod: two, tests: many, exclude: { [yk2]: { excluded: true, reason: 'unidades piloto' } } });
ok('una familia excluida no cuenta y se declara con su motivo', MX.rows.length === 1 && MX.excluded.length === 1 && MX.excluded[0].reason === 'unidades piloto' && MX.total.req === 3);
const MY = C.copYearReportCompute({ year: 2026, cutIso: '2026-10-20', prod: two, tests: many, exclude: { [yk2]: { excluded: false } } });
ok('regresarla (excluded:false) la vuelve a contar', MY.rows.length === 2);

console.log('\n== Sync: uniones simétricas ==');
const a = { '2026-10-12': { at: '2026-10-13T10:00Z', rows: { x: 1 } }, '2026-10-19': { at: '2026-10-19T10:00Z', rows: { x: 2 } } };
const b = { '2026-10-19': { at: '2026-10-20T10:00Z', rows: { x: 3 } } };
const u1 = C.copRepCutsUnion(a, b), u2 = C.copRepCutsUnion(b, a);
ok('cortes: gana el más reciente de la semana y se conservan las demás', u1['2026-10-19'].rows.x === 3 && u1['2026-10-12'] && JSON.stringify(u1) === JSON.stringify(u2));
const pa = { 2026: { k: { m: [1], updatedAt: '2026-10-01' }, j: { m: [5], updatedAt: '2026-10-01' } } }, pb = { 2026: { k: { m: [2], updatedAt: '2026-10-02' } } };
ok('producción real: por familia gana updatedAt, sin perder las demás', C.copRepProdUnion(pa, pb)[2026].k.m[0] === 2 && C.copRepProdUnion(pb, pa)[2026].j.m[0] === 5 &&
    JSON.stringify(C.copRepProdUnion(pa, pb)[2026].k) === JSON.stringify(C.copRepProdUnion(pb, pa)[2026].k));
ok('exclusiones: gana la marca más reciente (también la de regresar)', C.copRepExcludeUnion({ k: { excluded: true, at: '1' } }, { k: { excluded: false, at: '2' } }).k.excluded === false &&
    C.copRepExcludeUnion({ k: { excluded: false, at: '2' } }, { k: { excluded: true, at: '1' } }).k.excluded === false);
const viejos = {}; for (let i = 0; i < 70; i++) viejos['2025-' + String(i).padStart(3, '0')] = { at: String(i) };
ok('se guardan a lo más ' + C.COP_REP_CUTS_KEEP + ' cortes (los más recientes)', Object.keys(C.copRepCutsUnion(viejos, {})).length === C.COP_REP_CUTS_KEEP && !C.copRepCutsUnion(viejos, {})['2025-000']);

console.log('\n== El reporte ==');
const H = C.copYearReportHTML(M, { generatedAt: '2026-10-20 10:00' });
ok('PURO: mismo modelo, mismo texto', H === C.copYearReportHTML(M, { generatedAt: '2026-10-20 10:00' }));
ok('estilos literales (sale por correo e impreso)', H.indexOf('var(--') < 0);
ok('dice el año, la semana y el corte', /Producción 2026/.test(H) && /semana 43/.test(H) && /20 oct 2026/.test(H));
ok('declara los meses que el plan no trae', /no trae/.test(C.copYearReportHTML(Object.assign({}, M, { missingMonths: [1, 2, 3, 4, 5] }), {})) &&
    /ene–may/.test(C.copYearReportHTML(Object.assign({}, M, { missingMonths: [1, 2, 3, 4, 5] }), {})));
ok('explica la regla de muestreo', /7,500/.test(H) && /12,500/.test(H));
ok('no trae VIN (sale fuera de KIA)', H.indexOf('>A<') < 0 && !/\bVIN\b/.test(H));
ok('el texto plano resume avance y faltantes', /Avance global 67%/.test(C.copRepPlainText(M)) && /faltan 2/.test(C.copRepPlainText(M)));
ok('documento imprimible completo', /^<!doctype html>/.test(C.copYearReportDocument(M, {})) && /@page/.test(C.copYearReportDocument(M, {})));

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
