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
// [3.13.0] Las reglas de corporativo (COP_HQ_RULES, copHqRuleFor, copInScope): su bloque real.
vm.runInContext(/var COP_HQ_RULES = \[[\s\S]*?(?=\/\/ ─── CACHE DEL PANORAMA)/.exec(_cv)[0], ctx, { filename: 'cop_validator.js' });
// [3.22.0] Qué propósito es conformidad de la producción: su bloque real.
vm.runInContext(/var COP_PURPOSES = [\s\S]*?\nfunction copPurposeCounts\(purpose\) \{[\s\S]*?\n\}/.exec(_cv)[0], ctx, { filename: 'cop_validator.js' });
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

console.log('\n== [3.13.0] Reglas de corporativo por región + norma ==');
const R = (rgn, reg, mod) => C.copHqRuleFor({ rgn, reg, mod });
ok('Europa PRE-EURO 7 → lotes (también escrito EUROPA)', R('EUROPE', 'PRE-EURO 7').rule === 'lot' && R('EUROPA', 'pre-euro 7').rule === 'lot');
ok('[3.22.0] Europa EURO 7 → lotes (con o sin guion)', R('EUROPE', 'EURO 7').rule === 'lot' && R('EUROPE', 'EURO-7').rule === 'lot');
ok('[3.22.0] General EURO-6C ya no entra', R('GENERAL', 'EURO-6C') === null && !C.copInScope({ rgn: 'GENERAL', reg: 'EURO-6C' }).ok);
ok('[3.22.0] Medio Oriente EURO-5 → 1 por familia, SOLO el BL7m', R('MIDDLE EAST', 'EURO-5', 'BL7m').rule === 'one' && R('MIDDLE EAST', 'EURO-5', 'bl7m').rule === 'one' &&
    R('MIDDLE EAST', 'EURO-5', 'CL4') === null);
ok('[3.22.0] una CL4 de Medio Oriente queda fuera y se dice por qué', C.copInScope({ rgn: 'MIDDLE EAST', reg: 'EURO-5', mod: 'CL4' }).kind === 'model' &&
    /solo cuenta BL7m/.test(C.copInScope({ rgn: 'MIDDLE EAST', reg: 'EURO-5', mod: 'CL4' }).reason));
ok('Europa EURO-5 no pide; Medio Oriente EURO-4 tampoco', R('EUROPE', 'EURO-5') === null && R('MIDDLE EAST', 'EURO-4', 'BL7m') === null);
ok('un vehículo se lee por su config (modelo incluido)', C.copHqRuleFor({ config: { REGION: 'MIDDLE EAST', 'EMISSION REGULATION': 'EURO-5', Modelo: 'BL7m' } }).rule === 'one');
ok('alcance = tiene regla: Europa EURO-5 queda fuera por su norma', !C.copInScope({ rgn: 'EUROPE', reg: 'EURO-5' }).ok && C.copInScope({ rgn: 'EUROPE', reg: 'EURO-5' }).kind === 'regulation');
ok('General y USA quedan fuera por región', C.copInScope({ rgn: 'GENERAL', reg: 'EURO-6C' }).kind === 'region' && C.copInScope({ rgn: 'USA', reg: 'SULEV 30' }).kind === 'region');
ok('el alcance se dice por parejas', C.copScopeLabel() === 'Europa · PRE-EURO 7 · Europa · EURO 7 · Medio Oriente · BL7m EURO-5', C.copScopeLabel());
ok('1 por familia: 50 unidades → 1; sin producción → 0', C.copYearRequired('one', 50) === 1 && C.copYearRequired('one', 0) === 0);
ok('lotes: 8,000 unidades → 6 (la misma regla de copLotRequired)', C.copYearRequired('lot', 8000) === 6 && C.copYearRequired('lot', 27) === 3);

console.log('\n== [3.13.0] Lo que le falta a una familia para el Plan ==');
ok('pendiente = REQ − hechas − en curso − declaradas, nunca negativo', C.copYearPlanPending({ req: 6, done: 2, inFlight: 1, declared: 1 }) === 2 && C.copYearPlanPending({ req: 3, done: 5 }) === 0);
const sp = C.copYearPlanSplit(3, [{ desc: 'MY26', upcoming: 0, total: 900 }, { desc: 'MY27a', upcoming: 500, total: 500 }, { desc: 'MY27b', upcoming: 200, total: 200 }]);
ok('se reparte solo entre las que siguen en producción, de mayor a menor', sp.MY27a === 2 && sp.MY27b === 1 && !sp.MY26, JSON.stringify(sp));
const sp2 = C.copYearPlanSplit(2, [{ desc: 'A', upcoming: 0, total: 100 }, { desc: 'B', upcoming: 0, total: 300 }, { desc: 'C', upcoming: 0, total: 999, paused: true }]);
ok('sin ninguna en producción, todo a la de más volumen sin pausar', sp2.B === 2 && !sp2.A && !sp2.C, JSON.stringify(sp2));
ok('sin pendiente no se reparte nada', Object.keys(C.copYearPlanSplit(0, [{ desc: 'A', upcoming: 9 }])).length === 0);

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

console.log('\n== [3.26.0] Una familia del WVTA para todas las carrocerías (CL4MH) ==');
const kH5 = 'CL4MH|1600CC KAPPA PE|6DCT|27 MODEL|PRE-EURO 7|||5DR', kHW = kH5.replace('|5DR', '|WGN');
ok('CL4MH 5DR y WGN son UNA familia del año, sin carrocería', C.copYearKeyOf(kH5, 2026) === C.copYearKeyOf(kHW, 2026) && C.copYearKeyOf(kH5, 2026).split('|')[7] === '');
ok('…sin tocar la clave por año modelo', C.copYearOfKey(kH5) === null && kH5 !== kHW);
ok('la CL4 sigue separando 5DR y WGN', C.copYearKeyOf(k26, 2026) !== C.copYearKeyOf(k26.replace('|5DR', '|WGN'), 2026));
const vH = (body, date) => ({ config: { Modelo: 'CL4MH', ENG: '1600CC KAPPA PE', TX: '6DCT', MY: '27 MODEL', REG: 'PRE-EURO 7', BODY: body }, testData: { testDatetime: date } });
ok('un ensayo 5DR y uno WGN entran a la misma familia del año', C.copVehicleInFamily(vH('5DR', '2026-10-01'), C.copYearKeyOf(kHW, 2026)) && C.copVehicleInFamily(vH('WGN', '2026-10-02'), C.copYearKeyOf(kH5, 2026)));
const cH = (body, m) => ({ mod: 'CL4MH', eng: '1600CC KAPPA PE', tx: '6DCT', my: '27 MODEL', reg: 'PRE-EURO 7', ep: '0', engpkg: '0', body, rgn: 'EUROPE', m });
const kOf = c => [c.mod, c.eng, c.tx, c.my, c.reg, '', '', c.body].join('|');
const PHy = C.copYearProduction({ year: 2026, months: ['Nov-26'], planData: [cH('5DR', [300]), cH('WGN', [200])], inScope: () => true, keyOf: kOf });
const fHy = PHy.fams[C.copYearKeyOf(kH5, 2026)];
ok('la producción de las dos carrocerías se suma en una familia', Object.keys(PHy.fams).length === 1 && fHy.vol === 500 && fHy.configs === 2 && fHy.body === '', fHy && fHy.vol);
ok('y se lee como híbrido', C.copRepGroupOf(fHy).id === 'hev');

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
// [3.13.0] Tres regiones, cada una con su regla y su pie.
const cfgR = (mod, rgn, reg, body, m) => ({ mod, eng: '1600cc GAMMA', tx: '6AT', my: '26 MODEL', reg, ep: '0', engpkg: '0', body, rgn, m });
const ruleOf = c => C.copHqRuleFor(c);
const PHQ = C.copYearProduction({ year: 2026, months: ['Jun-26'], planData: [cfgR('CL4', 'EUROPE', 'PRE-EURO 7', '5DR', [8000]),
    cfgR('BL7m', 'GENERAL', 'EURO-6C', '5DR', [151]), cfgR('BL7m', 'MIDDLE EAST', 'EURO-5', '4DR', [815]), cfgR('CL4', 'MIDDLE EAST', 'EURO-5', '4DR', [430])],
    inScope: c => C.copInScope(c).ok, keyOf, ruleOf });
const MHQ = C.copYearReportCompute({ year: 2026, cutIso: '2026-10-20', prod: PHQ, tests: [], prevSaved: null });
const byReg = {}; MHQ.regions.forEach(rg => { byReg[rg.id] = rg; });
ok('[3.22.0] secciones: Europa y Medio Oriente (General salió del alcance)', MHQ.regions.map(r => r.id).join(',') === 'EUROPE,MIDDLE EAST');
ok('Europa 8,000 → 6 · Medio Oriente: solo el BL7m, 815 → 1', byReg.EUROPE.rows[0].req === 6 && byReg['MIDDLE EAST'].rows.length === 1 &&
    byReg['MIDDLE EAST'].rows[0].fam.mod === 'BL7m' && byReg['MIDDLE EAST'].rows[0].req === 1);
ok('Medio Oriente no tiene "siguiente lote"', byReg['MIDDLE EAST'].rows[0].nextLotAt === null && byReg.EUROPE.rows[0].nextLotAt === 12501);
const HHQ = C.copYearReportHTML(MHQ, {});
ok('el pie dice la regla de cada región', /Medio Oriente:<\/b> 1 ensayo por familia con producción en el año/.test(HHQ) && /Europa:<\/b> hasta 7,500/.test(HHQ));

console.log('\n== [3.22.0] count_hist es lo producido en el año a la fecha del CSV ==');
// Mismo acomodo que el CSV real de oct-2026: count_hist + columnas de oct en adelante, y un
// mes viejo (sep) que dejó un CSV anterior con su PRONÓSTICO (no debe sumarse).
const cfgH = (my, hist, m, extra) => Object.assign({ mod: 'CL4', eng: '1600CC GAMMA-II', tx: '7DCT', my, reg: 'PRE-EURO 7', ep: '0', engpkg: 'LOW POWER',
    body: 'WGN', rgn: 'EUROPE', hist, m }, extra || {});
const MON = ['Sep-26', 'Oct-26', 'Nov-26', 'Dec-26', 'Jan-27'];
const HS = { asOf: '2026-10-09', firstMonth: 'Oct-26' };
const PH = C.copYearProduction({ year: 2026, months: MON, inScope: () => true, keyOf, ruleOf, hist: HS,
    planData: [cfgH('26 MODEL', 9054, [999, 309, 0, 0, 0]), cfgH('27 MODEL', 0, [0, 187, 571, 304, 529]),
               cfgH('25 MODEL', 400, [50, 0, 0, 0, 0], { _retired: true, histAsOf: '2026-06-02' }),
               cfgH('24 MODEL', 300, [0, 0, 0, 0, 0], { _retired: true })] });
const FH = PH.fams[Object.keys(PH.fams)[0]];
ok('producción = Σ count_hist del año + plan de oct–dic (sin el pronóstico viejo de sep ni enero 2027)',
    FH.hist === 9454 && FH.vol === 9454 + 309 + 187 + 571 + 304, FH.hist + ' / ' + FH.vol);
ok('ene–sep van "en el acumulado", no "sin dato"', PH.missing.length === 0 && FH.src.slice(0, 9).every(x => x === 'hist') && FH.src[9] === 'plan');
ok('una retirada conserva su acumulado del año; sin fecha, no se adivina', FH.hist === 9054 + 400);
ok('el año modelo de lo acumulado se lista', FH.mys['26 MODEL'] && FH.mys['25 MODEL']);
ok('el límite del acumulado: CSV que empieza en oct → oct; de otro año → nada', C.copYearHistBoundary(HS, 2026) === 10 && C.copYearHistBoundary(HS, 2027) === 0 &&
    C.copYearHistBoundary({ asOf: '2026-12-20', firstMonth: 'Jan-27' }, 2026) === 13 && C.copYearHistBoundary({ asOf: '2026-10-09' }, 2026) === 10);
const PH27 = C.copYearProduction({ year: 2027, months: MON, inScope: () => true, keyOf, ruleOf, hist: HS, planData: [cfgH('27 MODEL', 0, [0, 187, 571, 304, 529])] });
ok('2027 no toma el acumulado de 2026', PH27.fams[Object.keys(PH27.fams)[0]].vol === 529 && PH27.missing.length === 11);
const PHR = C.copYearProduction({ year: 2026, months: MON, inScope: () => true, keyOf, ruleOf, hist: HS,
    planData: [cfgH('26 MODEL', 9054, [999, 309, 0, 0, 0])], actuals: { [Object.keys(PH.fams)[0]]: { m: [100, 0, 0, 0, 0, 0, 0, 0, 900, 400, null, null] } } });
ok('lo capturado como real solo manda en los meses fuera del acumulado (no cuenta dos veces)', PHR.fams[Object.keys(PHR.fams)[0]].vol === 9054 + 400);
const MH = C.copYearReportCompute({ year: 2026, cutIso: '2026-10-20', prod: PH, tests: [], prevSaved: null });
ok('el REQ sale del año completo: 9,454 + plan → 6', MH.rows[0].req === 6 && MH.histAsOf === '2026-10-09' && MH.histBoundary === 10);
const HH = C.copYearReportHTML(MH, {});
ok('el reporte dice de dónde sale la producción', /lo producido de enero al 9 oct 2026/.test(HH) && /lo planeado de oct a dic/.test(HH) && !/no trae/.test(HH));

console.log('\n== [3.22.0] Solo cuenta lo registrado como conformidad de la producción ==');
ok('COP-Emisiones cuenta; EO, ND, correlación, investigación, OBD y sin propósito no',
    C.copPurposeCounts('COP-Emisiones') && ['EO-Emisiones', 'ND-Emisiones', 'Correlacion', 'Investigacion', 'COP-OBD2', '', null].every(p => !C.copPurposeCounts(p)));
ok('documento imprimible completo', /^<!doctype html>/.test(C.copYearReportDocument(M, {})) && /@page/.test(C.copYearReportDocument(M, {})));

console.log('\n== [3.23.0] El nombre que usa la gerencia ==');
const SN = f => C.copRepShortName(Object.assign({ mod: 'CL4', eng: '', tx: '', ep: '', engpkg: '' }, f));
ok('CL4 1.6 T-GDI LP 7DCT / HP', SN({ eng: '1600CC GAMMA-II', engpkg: 'LOW POWER', tx: '7DCT' }) === 'CL4 1.6 T-GDI LP 7DCT' &&
    SN({ eng: '1600CC GAMMA-II', engpkg: 'HIGH POWER', tx: '7DCT' }) === 'CL4 1.6 T-GDI HP 7DCT');
ok('CL4 1.0 T-GDI 48V (mild HEV) y 12V', SN({ eng: '1000cc KAPPA PE', ep: 'MILD HEV', tx: '6MT' }) === 'CL4 1.0 T-GDI 48V 6MT' &&
    SN({ eng: '1000cc KAPPA PE', tx: '6MT' }) === 'CL4 1.0 T-GDI 12V 6MT');
ok('BL7m 1.6 6AT (DCVVT no se dice); un motor desconocido queda como viene', SN({ mod: 'BL7m', eng: '1600cc GAMMA', engpkg: 'DCVVT', tx: '6AT' }) === 'BL7m 1.6 6AT' &&
    SN({ eng: '160KW', tx: '1DT' }) === 'CL4 160KW 1DT');

console.log('\n== [3.23.0] Ritmo, lo crítico y los puntos clave ==');
// Una familia con 3 de 6 y otra con pocas unidades por producir; ensayos repartidos en semanas.
const famR = (body, eng, vol, req) => ({ key: 'K' + body + eng, name: 'CL4 ' + eng, group: { id: body === 'WGN' ? 'wgn' : '5dr', order: 1 },
    region: 'EUROPE', rule: 'lot', vol, req, nextLotAt: C.copLotNextAt(vol), status: { id: 'run' } });
const mk = (r, done, dates, ahead, last) => Object.assign(r, { done, pending: Math.max(0, r.req - done), testDates: dates, ahead, lastProdMonth: last,
    added: 0, prevReq: r.req, prevStatus: { id: 'run' } });
const MR = { year: 2026, cut: '2026-10-23', prevFromSaved: false, total: { pending: 5 }, weekOff: { '2026-10-26': 'HEV fase 2' },
    rows: [mk(famR('WGN', '1.6', 10425, 6), 3, ['2026-10-01', '2026-10-08', '2026-10-21'], 1163, 12),
           mk(famR('WGN', '1.0', 157, 3), 1, ['2026-07-29'], 44, 11)] };
const PR = C.copRepPace(MR);
ok('8 semanas que terminan en la del corte; las últimas 4 dan el ritmo', PR.weeks.length === 8 && PR.weeks[7].monday === '2026-10-19' && PR.weeks[7].n === 1 &&
    PR.recent === 0.8, JSON.stringify(PR.weeks.map(w => w.n)) + ' ' + PR.recent);
ok('quedan las semanas hasta el 31 dic sin las de celda fuera; hacen falta pendiente ÷ semanas', PR.weeksLeft === 9 && PR.off.length === 1 &&
    PR.needed === Math.round(5 / 9 * 10) / 10, PR.weeksLeft + ' ' + PR.needed);
ok('al ritmo actual (0.8/sem.) 5 ensayos son 7 semanas con celda: el viernes 18 dic', PR.finish === '2026-12-18' && !PR.late && PR.onTrack, PR.finish);
ok('sin ensayos recientes no se promete fecha', C.copRepPace(Object.assign({}, MR, { rows: [] })).late === true);
const PR2 = C.copRepPace(Object.assign({}, MR, { total: { pending: 1 } }));
ok('con 1 pendiente: dos semanas con celda (la del 26 oct no cuenta) → viernes 13 nov', PR2.finish === '2026-11-13' && PR2.onTrack, PR2.finish);
const CR = C.copRepCritical(MR);
ok('lo más crítico primero: pocas unidades por producir (apartar una) gana a "más ensayos pendientes"',
    CR[0].name === 'CL4 1.0' && CR[0].reasons[0].k === 'scarce' && CR[0].reasons[0].n === 44 && CR[1].name === 'CL4 1.6', JSON.stringify(CR.map(c => [c.name, c.reasons.map(r => r.k)])));
ok('cerca del siguiente lote se avisa (a ≤ 1,000 unidades)', C.copRepCritical({ rows: [mk(famR('5DR', '1.6', 7000, 3), 3, [], 500, 12)] })[0].reasons.some(r => r.k === 'nearLot' && r.n === 501));
ok('una familia cumplida y lejos del lote no entra', C.copRepCritical({ rows: [mk(famR('5DR', '1.6', 4000, 3), 3, [], 400, 12)] }).length === 0);
const HL = C.copRepHighlights(Object.assign({}, MR, { pace: PR, rows: MR.rows.map((r, i) => Object.assign({}, r, { added: i ? 0 : 2 })) }));
ok('puntos clave: lo nuevo de la semana y la semana sin celda que viene', HL[0].k === 'added' && HL[0].n === 2 && HL.some(h => h.k === 'off' && h.monday === '2026-10-26'));

console.log('\n== [3.23.0] El reporte en inglés y para Outlook ==');
const HE = C.copYearReportHTML(M, { lang: 'en', generatedAt: '2026-10-20 10:00' });
ok('en inglés: título, frase y secciones', /Conformity of Production 2026/.test(HE) && /complete<\/b>: /.test(HE) && /Needs attention/.test(HE) &&
    /Tests per week/.test(HE) && /Key points/.test(HE) && /Status by family/.test(HE) && !/ensayos requeridos/.test(HE));
ok('la regla de muestreo también en inglés', /up to 7,500 units built, 3 tests/.test(HE));
ok('mismo modelo, mismo texto (PURA) y estilos literales', HE === C.copYearReportHTML(M, { lang: 'en', generatedAt: '2026-10-20 10:00' }) && HE.indexOf('var(--') < 0);
ok('nada que Outlook de escritorio no pinte: sin gradientes, position, flex ni grid en el correo',
    !/linear-gradient|position:\s*(absolute|relative)|display:\s*(flex|grid)/.test(HE) && /<!--\[if mso\]>/.test(HE));
ok('las barras son tablas con ancho fijo (Outlook)', /<td width="\d+" height="8" bgcolor="#/.test(HE));
ok('no trae VIN', !/\bVIN\b/.test(HE) && HE.indexOf('>A<') < 0);
ok('el idioma por default de la función es español', /Conformidad de la Producción 2026/.test(C.copYearReportHTML(M, {})));
ok('el documento declara su idioma', /<html lang="en">/.test(C.copYearReportDocument(M, { lang: 'en' })));
ok('asunto y texto plano en inglés', /^CoP 2026 status · week 43 — \d+% complete/.test(C.copRepSubject(M, 'en')) &&
    /Overall progress/.test(C.copRepPlainText(M, 'en')) && /Avance global/.test(C.copRepPlainText(M)));
const MN = Object.assign({}, M, { note: { text: 'Next week the cell is out.\nResumes after.', at: '1' } });
ok('la nota del laboratorio sale tal cual, con sus renglones', /Note from the lab/.test(C.copYearReportHTML(MN, { lang: 'en' })) &&
    /Next week the cell is out\.<br>Resumes after\./.test(C.copYearReportHTML(MN, { lang: 'en' })));
ok('notas: por semana gana la más reciente (simétrica)', C.copRepNotesUnion({ w: { text: 'a', at: '1' } }, { w: { text: 'b', at: '2' } }).w.text === 'b' &&
    C.copRepNotesUnion({ w: { text: 'b', at: '2' } }, { w: { text: 'a', at: '1' } }).w.text === 'b');

console.log('\n== [3.24.0] Uso de la celda: esta semana y la siguiente ==');
const blk = (n, state, extra) => Object.assign({ n, state, reason: null, fam: '', proposal: false }, extra || {});
const wkNow = { weekDate: '2026-10-19', planState: 'accepted', extra: 0,
    total: { blocks: 8, tests: 5, use: 5 / 8, unexplained: 1, pending: 0, planned: 0, byReason: { qc: 2 } },
    days: [{ iso: '2026-10-20', day: 'mar', blocks: [blk(1, 'prueba', { fam: 'CL4 1.6 T-GDI LP 7DCT WGN' }), blk(2, 'motivo', { reason: 'qc' })] },
           { iso: '2026-10-21', day: 'mie', blocks: [blk(1, 'prueba', { fam: 'CL4 1.6 T-GDI HP 7DCT WGN' }), blk(2, 'sin-explicar')] }] };
const wkNext = { weekDate: '2026-10-26', planState: 'proposal', extra: 0,
    total: { blocks: 8, tests: 0, use: 0, unexplained: 0, pending: 0, planned: 7, byReason: {} },
    days: [{ iso: '2026-10-27', day: 'mar', blocks: [blk(1, 'planeada', { fam: 'CL4 1.0 T-GDI 48V 6MT WGN', proposal: true }), blk(2, 'libre')] }] };
const MC = Object.assign({}, M, { cell: { now: wkNow, next: wkNext } });
const HC = C.copYearReportHTML(MC, { lang: 'en' }), HCs = C.copYearReportHTML(MC, { lang: 'es' });
ok('la sección sale en los dos idiomas con el uso y la semana siguiente', /Cell use/.test(HC) && /5 of 8 test blocks used \(63%\)/.test(HC) &&
    /1 not explained/.test(HC) && /Next week<\/b> \(<span[^>]*>proposal, not accepted yet/.test(HC) && /7 tests planned in 8 blocks/.test(HC) &&
    /Uso de la celda/.test(HCs) && /5 de 8 bloques con prueba/.test(HCs) && /propuesta sin aceptar/.test(HCs), HC.slice(HC.indexOf('Cell use'), HC.indexOf('Cell use') + 900));
ok('la tabla de bloques: familia, motivo y "sin explicar"; sin VIN', /CL4 1\.6 T-GDI LP 7DCT WGN/.test(HC) && /Not explained/.test(HC) && !/\bVIN\b/.test(HC));
ok('la tabla es para Outlook (sin flex, grid ni position)', !/linear-gradient|position:\s*(absolute|relative)|display:\s*(flex|grid)/.test(HC) && /class="cr-blocks"/.test(HC));
ok('sin bloques no hay sección (y el reporte de siempre no cambia)', C.copYearReportHTML(M, { lang: 'en' }).indexOf('Cell use') < 0);
ok('texto plano: el uso y la semana siguiente día por día', /Cell use:/.test(C.copRepPlainText(MC, 'en')) && /Tue 27 Oct: CL4 1\.0 T-GDI 48V 6MT WGN/.test(C.copRepPlainText(MC, 'en')));

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
