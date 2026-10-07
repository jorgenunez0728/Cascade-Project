// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.34.0] Historial: buscar, filtrar, ordenar y agrupar               ║
// ╚══════════════════════════════════════════════════════════════════════╝
// histApplyQuery es PURA sobre las filas de histRowFacts. Aquí se fija lo que el
// laboratorio pidió: buscar por los últimos dígitos del VIN o por la norma, ordenar
// por columna, agrupar por familia, y que los conteos de las fichas no mientan.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const store = {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error,
    isNaN, parseInt, parseFloat, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
                createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, setAttribute: noop, appendChild: noop, addEventListener: noop }),
                addEventListener: noop, body: {}, documentElement: { setAttribute: noop } },
    navigator: { userAgent: 'node' },
    debounce: f => f, autoSaveInit: noop, tokenColor: () => '#000',
    showToast: noop, showModal: noop, showConfirm: noop, saveDB: () => true,
    auditLog: noop, escapeHtml: s => String(s), emitEvent: noop,
    CASCADE_TOOLTIPS: {}, allConfigurations: [],
    isEmissionsPurpose: p => /emisiones/i.test(String(p || '')),
    getRegulationProfile: () => null, localDateStr: d => new Date(d || Date.now()).toISOString().slice(0, 10),
    CONFIG: { statusLabels: { registered: 'Registrado', 'in-progress': 'En Progreso', testing: 'En Prueba',
              'ready-release': 'Listo para Liberar', 'pending-approval': 'Pendiente Aprobación', archived: 'Archivado', historico: 'Histórico (VETS)' } },
    db: { vehicles: [], lastId: 0 },
    UNIT_CONVERSION: { lb_to_kg: 0.45359237, kg_to_lb: 2.20462262, lbf_to_N: 4.4482216153, N_to_lbf: 0.2248089431, mph_to_kmh: 1.609344, kmh_to_mph: 0.6213711922 }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
vm.runInContext(/var VEHICLE_STATUS_HISTORIC = [\s\S]*?\nfunction vehicleListDate\(v\) \{[\s\S]*?\n\}/.exec(app)[0], ctx);
vm.runInContext(/function _uiFold\(s\) \{[\s\S]*?\n\}/.exec(app)[0], ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'cop15.js'), 'utf8'), ctx, { filename: 'cop15.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

const cfg = (mod, eng, reg, body, region) => ({ 'Modelo': mod, 'ENGINE CAPACITY': eng, 'EMISSION REGULATION': reg,
    'BODY TYPE': body, 'REGION': region, 'TRANSMISSION': 'IVT', 'MODEL YEAR (VIN)': '26 MODEL' });
let nid = 0;
function veh(vin, status, date, c, extra) {
    return Object.assign({ id: ++nid, vin, status, registeredAt: date, purpose: 'COP-Emisiones',
        configCode: c['Modelo'] + '-' + c['BODY TYPE'] + '-' + c['EMISSION REGULATION'], config: c,
        testData: status === 'archived' ? { gasResults: { liberador: { values: { CO: 1, NOx: 0.01 } }, aprobador: { values: { CO: 1 } } } } : {} }, extra || {});
}
const eu5 = cfg('CL4', '1000cc KAPPA PE', 'PRE-EURO 7', '5DR', 'EUROPE');
const euw = cfg('CL4', '1600CC GAMMA-II', 'PRE-EURO 7', 'WGN', 'EUROPE');
const us = cfg('SP3', '2000CC NU', 'SULEV 30', 'SUV', 'USA');
const vs = [
    veh('3KPFX51B7TE431949', 'archived', '2026-09-29T10:00:00', eu5),
    veh('3KPFX51BXTE433243', 'archived', '2026-09-29T09:00:00', eu5),
    veh('3KPFX81C4TE421535', 'archived', '2026-09-23T10:00:00', euw),
    veh('3KPFX81C2TE421291', 'pending-approval', '2026-09-23T08:00:00', euw, { testData: { gasResults: { liberador: { values: { CO: 1 } } } } }),
    veh('KNDJ23AU0T7000001', 'testing', '2026-10-01T08:00:00', us),
    veh('KNDJ23AU0T7000002', 'archived', '2025-12-15T08:00:00', us, { adhoc: true })
];
const facts = vs.map(v => ctx.histRowFacts(v));
const Q = (f, sort, group) => ctx.histApplyQuery(facts, f || {}, sort || { key: 'date', dir: 'desc' }, group || '');

console.log('\n== Búsqueda ==');
ok('los últimos dígitos del VIN bastan', Q({ q: '431949' }).rows.length === 1);
ok('busca por norma, sin distinguir mayúsculas', Q({ q: 'sulev' }).rows.length === 2);
ok('varias palabras se combinan (Y)', Q({ q: 'cl4 wgn' }).rows.length === 2);
ok('una palabra que no está → ninguna', Q({ q: 'cl4 sulev' }).rows.length === 0);
ok('sin acentos: "historico" encuentra "Histórico"', ctx._histFoldTxt('Histórico').indexOf('historico') === 0);

console.log('\n== Filtros ==');
ok('"En curso" = vehicleIsLive', Q({ status: 'active' }).rows.map(r => r.vin).join() === 'KNDJ23AU0T7000001,3KPFX81C2TE421291');
ok('por modelo', Q({ model: 'SP3' }).rows.length === 2);
ok('por año y mes', Q({ year: '2026', month: '9' }).rows.length === 4);
ok('el mes sin año no filtra', Q({ month: '9' }).rows.length === 6);
ok('fuera de plan', Q({ flag: 'offplan' }).rows.length === 1);
ok('liberado sin aprobar', Q({ flag: 'unaverif' }).rows.length === 1 && Q({ flag: 'unaverif' }).rows[0].status === 'pending-approval');
ok('"offplan" viejo en Estado se traduce al filtro de revisión', (() => {
    ctx._histFilterStatus = 'offplan'; const f = ctx._histFilters(); ctx._histFilterStatus = 'all';
    return f.status === 'all' && f.flag === 'offplan';
})());

console.log('\n== Fichas de estado: cuentan con los DEMÁS filtros ==');
{
    const c = Q({ model: 'CL4', status: 'archived' }).counts;
    ok('con modelo CL4: todos = 4 aunque Estado diga Archivado', c.all === 4, JSON.stringify(c));
    ok('… 3 archivados y 1 por aprobar', c.archived === 3 && c['pending-approval'] === 1);
}

console.log('\n== Orden ==');
ok('por fecha descendente (default)', Q().rows[0].vin === 'KNDJ23AU0T7000001');
ok('por fecha ascendente', Q({}, { key: 'date', dir: 'asc' }).rows[0].vin === 'KNDJ23AU0T7000002');
ok('por VIN ascendente', Q({}, { key: 'vin', dir: 'asc' }).rows[0].vin === '3KPFX51B7TE431949');
ok('por estado sigue el flujo (registrado → … → archivado)', Q({}, { key: 'status', dir: 'asc' }).rows[0].status === 'testing');
ok('empate: lo más reciente primero', (() => {
    const r = Q({ model: 'CL4', status: 'archived' }, { key: 'status', dir: 'asc' }).rows;
    return r[0].vin === '3KPFX51B7TE431949' && r[1].vin === '3KPFX51BXTE433243';
})());

console.log('\n== Agrupar ==');
{
    const g = Q({}, null, 'familia').groups;
    ok('3 familias (la carrocería separa 5DR de WGN)', g.length === 3, g.map(x => x.label).join(' | '));
    const wgn = g.find(x => /WGN/.test(x.label));
    ok('el grupo cuenta en curso y por aprobar', wgn.rows.length === 2 && wgn.live === 1 && wgn.pending === 1);
    ok('la clave del grupo es la de copVehicleFamilyKey cuando existe', typeof ctx.copVehicleFamilyKey !== 'function' || wgn.key === ctx.copVehicleFamilyKey(vs[2]));
    const m = Q({}, null, 'mes').groups;
    ok('por mes: el más reciente primero', m[0].key === '2026-10' && m[m.length - 1].key === '2025-12');
    ok('por mes: etiqueta legible', m[0].label === 'Octubre 2026');
    const e = Q({}, null, 'estado').groups;
    ok('por estado: en el orden del flujo', e.map(x => x.key).join() === 'testing,pending-approval,archived');
    ok('dentro del grupo se respeta el orden elegido', Q({}, { key: 'vin', dir: 'desc' }, 'familia').groups
        .every(gr => gr.rows.every((r, i) => !i || gr.rows[i - 1].vin >= r.vin)));
}

console.log('\n== Preferencias ==');
ok('histPrefs sin nada guardado: fecha ↓ y sin agrupar', (() => { const p = ctx.histPrefs(); return p.sort === 'date' && p.dir === 'desc' && p.group === ''; })());

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exit(fallaron ? 1 : 0);
