// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas de la Revisión dirigida (2.8.0)                             ║
// ╚══════════════════════════════════════════════════════════════════════╝
// review.js + vets.js reales en un `vm`. El resumen de VETS sale de las hojas de las
// dos exportaciones reales (tests/fixtures/vets-*.json), igual que en la app.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = p => fs.readFileSync(path.join(__dirname, '..', 'js', p), 'utf8');
const fn = (src, name) => {
    const m = new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}').exec(src);
    if (!m) throw new Error('No se encontró ' + name);
    return m[0];
};
const APP = R('app.js'), COP = R('cop15.js');

const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat, Promise, TextDecoder,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    showToast: () => {}, escapeHtml: s => String(s), CASCADE_TOOLTIPS: {}, auditLog: () => {},
    pnState: {}, pnSave: () => {}, authGetCurrentUserName: () => 'Ana', authRequire: () => true, localToday: () => '2026-09-28',
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(/var GAS_UNIT_FACTORS = \{[\s\S]*?\n\};/.exec(APP)[0], ctx);
vm.runInContext(/var ALTA_CORR_VIN_RE = [^\n]+/.exec(COP)[0] + '\n' + fn(COP, 'vinCheckDigit') + '\n' + fn(COP, '_libValueImplausible') + '\n' +
    /var GAS_PLAUSIBLE_BOUNDS = \{[\s\S]*?\n\};/.exec(COP)[0], ctx);
vm.runInContext(R('vets.js'), ctx, { filename: 'vets.js' });
vm.runInContext(R('review.js'), ctx, { filename: 'review.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const clone = x => JSON.parse(JSON.stringify(x));
const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));

const summaryFrom = (fixture, level) => {
    const rec = ctx.vetsExtract(fx(fixture));
    const cls = ctx.vetsClassifyChecks(rec.checks, []).map(x => ({ check: x.check, level, known: false }));
    return { rec, s: ctx.vetsSummary(rec, { fileName: 'x.xlsx', sha256: 'ab', at: '2026-08-25T11:00:00Z', by: 'Liberador' }, cls,
        { vinStatus: 'ok', justifications: level === 'importante' ? { 'PM Pre Filter Temp': 'se revisó el termopar' } : {} }) };
};
const PRE7 = { name: 'PRE-EURO 7', gases: [
    { field: 'CO', label: 'CO', unit: 'g/km', limit: 1.0 }, { field: 'CO2', label: 'CO₂', unit: 'g/km', limit: null },
    { field: 'THC', label: 'THC', unit: 'g/km', limit: 0.1 }, { field: 'NOx', label: 'NOx', unit: 'g/km', limit: 0.06 },
    { field: 'NMHC', label: 'NMHC', unit: 'g/km', limit: 0.068 } ] };
const gasValue = (summary, field, unit) => {
    const rec = { gases: {} };
    Object.keys(summary.gases).forEach(k => { rec.gases[k] = { value: summary.gases[k].v, unit: summary.gases[k].u }; });
    return ctx.vetsGasValue(rec, field, unit);
};
function euVehicle(level) {
    const { s } = summaryFrom('vets-eu-wltp.json', level || 'desacreditada');
    const vals = {};
    PRE7.gases.forEach(g => { vals[g.field] = gasValue(s, g.field, g.unit); });
    return {
        id: 'v1', vin: '3KPFT51B7TE407968', configCode: 'CL4-5DR', reviewFlow: 'dirigida',
        config: { REGION: 'EUROPE', 'EMISSION REGULATION': 'PRE-EURO 7' },
        homolog: { f0: 102.5, f1: 0.147, f2: 0.03544, tm: 1500, mr: 50.2 },
        testData: { vets: s, testDatetime: '2026-08-25T10:12', preconditioning: { datetime: '2026-08-24T08:00' },
                    gasResults: { liberador: { values: vals } } }
    };
}
const euCtx = (veh, extra) => Object.assign({
    profile: PRE7, others: [veh], soakRequired: { hours: 12 }, isEurope: true, inertia: { inertia: 1550.2 },
    vinCheck: ctx.vetsVinCheck, gasValue, implausible: ctx._libValueImplausible
}, extra || {});
const by = (blocks, id) => blocks.find(b => b.id === id);

console.log('\n== Sello y flujo ==');
{
    const S = ctx.reviewFlowSealFor;
    const on = { active: true, since: '2026-10-01' };
    ok('desactivada → no sella', S({ active: false, since: '2026-10-01' }, '2026-10-05T12:00:00') === false);
    ok('alta antes de la fecha efectiva → no sella (doble ciego)', S(on, '2026-09-30T23:00:00') === false);
    ok('alta el mismo día (hora local) → sella', S(on, '2026-10-01T00:30:00') === true);
    ok('alta después → sella', S(on, '2026-11-01T09:00:00') === true);
    ok('sin configuración → no sella', S(null, '2026-11-01T09:00:00') === false);
    const F = ctx.reviewFlowFor;
    const v = euVehicle();
    ok('sellado + archivo de VETS → revisión dirigida', F(v) === 'dirigida');
    ok('sellado sin archivo de VETS → doble ciego', F(Object.assign({}, v, { testData: {} })) === 'doble-ciego');
    ok('sin sello (vehículo anterior) aunque tenga VETS → doble ciego', F(Object.assign({}, v, { reviewFlow: undefined })) === 'doble-ciego');
}

console.log('\n== Los cinco bloques con la prueba real de Europa ==');
{
    const v = euVehicle('desacreditada');
    const b = ctx.reviewBlocks(v, euCtx(v));
    ok('cinco bloques en orden', b.map(x => x.id).join() === 'identidad,montaje,validez,resultados,obd');
    ok('identidad en verde (VIN = VETS = ECU, reposo 26 h ≥ 12, WLTC en Europa)', by(b, 'identidad').status === 'ok', JSON.stringify(by(b, 'identidad').items));
    ok('montaje en verde (Target y ETW = ICMS)', by(b, 'montaje').status === 'ok', JSON.stringify(by(b, 'montaje').items));
    ok('validez en verde: la verificación desacreditada no cuenta', by(b, 'validez').status === 'ok' && by(b, 'validez').items.some(i => /desacreditada/.test(i.text)));
    ok('resultados en verde y con % del límite', by(b, 'resultados').status === 'ok' && by(b, 'resultados').items.some(i => /NOx 0\.0062968 g\/km · límite 0\.06 \(10\.5 % del límite\)/.test(i.text)), JSON.stringify(by(b, 'resultados').items.map(i => i.text)));
    ok('OBD: MIL apagada, OBFCM y CALID', by(b, 'obd').status === 'ok' && by(b, 'obd').items.length === 3);

    const marks = {};
    b.forEach(x => { marks[x.id] = { ack: true }; });
    ok('todo en verde y marcado → se puede aprobar', ctx.reviewReady(b, marks).ok);
    delete marks.validez;
    const r = ctx.reviewReady(b, marks);
    ok('un bloque sin marcar → no', !r.ok && r.missing.join() === '3 · Validez');
}

console.log('\n== Lo que no está en verde ==');
{
    const v = euVehicle('importante');
    const b = ctx.reviewBlocks(v, euCtx(v));
    ok('verificación IMPORTANTE → bloque 3 en ámbar con la justificación del liberador', by(b, 'validez').status === 'warn' && by(b, 'validez').items.some(i => /se revisó el termopar/.test(i.text)));
    const marks = {}; b.forEach(x => { marks[x.id] = { ack: true }; });
    ok('ámbar sin "Acepto porque…" → no se aprueba', !ctx.reviewReady(b, marks).ok && /Validez \(falta/.test(ctx.reviewReady(b, marks).missing.join()));
    marks.validez.justification = 'termopar verificado';
    ok('con justificación → sí', ctx.reviewReady(b, marks).ok);

    const v2 = euVehicle(); v2.homolog.f0 = 100;
    const m = by(ctx.reviewBlocks(v2, euCtx(v2)), 'montaje');
    ok('Target A 2.5 % distinto del ICMS → ámbar con el %', m.status === 'warn' && m.items.some(i => /Target A: VETS 102\.5 · ICMS f0 100 N \(2\.5 % de diferencia\)/.test(i.text)), JSON.stringify(m.items));

    const v3 = euVehicle(); v3.testData.gasResults.liberador.values.NOx = 0.0071;
    const r3 = by(ctx.reviewBlocks(v3, euCtx(v3)), 'resultados');
    ok('el liberador envió un valor distinto al de VETS → ámbar', r3.status === 'warn' && r3.items.some(i => /no es el de VETS/.test(i.text)));

    const v4 = euVehicle(); v4.testData.gasResults.liberador.values.NOx = 0.07;
    const b4 = ctx.reviewBlocks(v4, euCtx(v4));
    ok('sobre el límite → rojo duro: no se acepta, solo devolver', by(b4, 'resultados').status === 'fail' && by(b4, 'resultados').hard);
    const all = {}; b4.forEach(x => { all[x.id] = { ack: true, justification: 'lo que sea' }; });
    ok('ni con justificación', !ctx.reviewReady(b4, all).ok && ctx.reviewReady(b4, all).hard.length === 1);

    const v5 = euVehicle(); const otro = clone(v5); otro.id = 'v9'; otro.vin = 'OTRO';
    const b5 = ctx.reviewBlocks(v5, euCtx(v5, { others: [v5, otro] }));
    ok('la misma prueba VETS en otro vehículo → rojo duro', by(b5, 'identidad').hard);

    const v6 = euVehicle(); v6.testData.preconditioning.datetime = '2026-08-25T02:00';
    ok('reposo de 8.2 h con 12 requeridas → ámbar', by(ctx.reviewBlocks(v6, euCtx(v6)), 'identidad').items.some(i => i.status === 'warn' && /Reposo de 8\.2 h; se requieren 12 h/.test(i.text)));

    const v7 = euVehicle(); const prev = clone(v7); prev.id = 'p1'; prev.vin = 'PREV'; prev.testData.vets.testRef = 'otra'; prev.testData.vets.obd.calid = 'VIEJO123';
    const o7 = by(ctx.reviewBlocks(v7, euCtx(v7, { others: [v7, prev] })), 'obd');
    ok('CALID distinto al de otra prueba de la misma configuración → ámbar', o7.status === 'warn' && /cambió la calibración/.test(o7.items.map(i => i.text).join()));

    const v8 = euVehicle(); v8.testData.vets.obd.mil = 'ON';
    ok('MIL encendida → rojo', by(ctx.reviewBlocks(v8, euCtx(v8)), 'obd').status === 'fail');

    const v9 = euVehicle(); v9.vin = '3KPFT51B7TE407969';
    const i9 = by(ctx.reviewBlocks(v9, euCtx(v9)), 'identidad');
    ok('VIN del Alta distinto a VETS y ECU → ámbar (se puede corregir el Alta)', i9.status === 'warn' && !i9.hard);
}

console.log('\n== México (FTP75, sin OBD) ==');
{
    const { s } = summaryFrom('vets-mx-ftp75.json', 'desacreditada');
    const SUL = { name: 'SULEV 30', gases: [{ field: 'CO', label: 'CO', unit: 'g/mi', limit: 1.0 }, { field: 'NMOGNOx', label: 'NMOG+NOx', unit: 'g/mi', limit: 0.03 }] };
    const vals = { CO: gasValue(s, 'CO', 'g/mi'), NMOGNOx: gasValue(s, 'NMOGNOx', 'g/mi') };
    const v = { id: 'm1', vin: 'KNA6BA1D5T1000065', reviewFlow: 'dirigida', config: { REGION: 'MEXICO' },
        testData: { vets: s, testDatetime: '2026-04-22T10:46', preconditioning: { datetime: '2026-04-21T09:00' },
                    targetA: s.dyno.tA, targetB: s.dyno.tB, targetC: s.dyno.tC, etw: s.dyno.etw, gasResults: { liberador: { values: vals } } } };
    const b = ctx.reviewBlocks(v, { profile: SUL, others: [v], soakRequired: { hours: 12 }, isEurope: false, vinCheck: ctx.vetsVinCheck, gasValue, implausible: ctx._libValueImplausible });
    ok('FTP en México → ciclo correcto', by(b, 'identidad').items.some(i => i.status === 'ok' && /Ciclo: EPA 75 3 Bag$/.test(i.text)), JSON.stringify(by(b, 'identidad').items.map(i => i.text)));
    ok('montaje contra lo capturado en Operación', by(b, 'montaje').status === 'ok' && by(b, 'montaje').items.some(i => /Operación/.test(i.text)));
    ok('NMOG+NOx 0.0348 > 0.030 g/mi → rojo duro (la prueba real no pasa SULEV 30)', by(b, 'resultados').status === 'fail' && by(b, 'resultados').hard);
    ok('sin datos de OBD → el bloque 5 no aplica y no se pide marcarlo', by(b, 'obd').status === 'na');
    const marks = {}; b.forEach(x => { if (x.status !== 'na') marks[x.id] = { ack: true, justification: 'xxxxx' }; });
    ok('"no aplica" no bloquea (lo que bloquea aquí es el resultado)', ctx.reviewReady(b, marks).hard.join() === '4 · Resultados' && !ctx.reviewReady(b, marks).missing.length);
}

console.log('\n== Activación ==');
{
    ctx.pnState.reviewFlow = null;
    ok('fecha en el pasado → se niega', ctx.reviewFlowActivate('2026-09-01', 'COP15 rev. 05') === false);
    ok('sin procedimiento → se niega', ctx.reviewFlowActivate('2026-10-01', '') === false);
    ok('bien → activa', ctx.reviewFlowActivate('2026-10-01', 'COP15 rev. 05') === true && ctx.reviewFlowSettings().active && ctx.reviewFlowSettings().since === '2026-10-01');
    ok('desactivar pide motivo', ctx.reviewFlowDeactivate('') === false && ctx.reviewFlowDeactivate('auditoría interna') === true && !ctx.reviewFlowSettings().active);
    ok('desactivada: los vehículos nuevos ya no se sellan', ctx.reviewFlowSealFor(ctx.reviewFlowSettings(), '2026-11-01T09:00:00') === false);
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exit(fallaron ? 1 : 0);
