// ╔══════════════════════════════════════════════════════════════════════╗
// ║  v24.3 — importaciones de Consumibles: calibraciones del F11 y el      ║
// ║  reporte semanal de gases/gasolina. Todo lo que se prueba aquí es PURO. ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const store = {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    setTimeout, clearTimeout, Uint8Array,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop,
                createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    safeParse: (k, d) => d, showToast: noop, auditLog: noop, escapeHtml: s => String(s), CASCADE_TOOLTIPS: {},
    localToday: () => '2026-09-24', debounce: fn => fn, tabCacheInvalidate: noop, invRender: noop,
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['inventory.js', 'projects.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
// `invState` es `let`: no queda en el objeto global del contexto.
vm.runInContext('globalThis.__inv = () => invState;', ctx);

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

// ── Calibraciones del F11 ────────────────────────────────────────────────
console.log('\n== invCalImportAnalyze (Excel COP15-F11) ==');
{
    const eq = [
        { id: 'e1', f11Id: 'C-003', name: 'Thermometer HVAC', kmmId: 'TH-0033', serialNo: '', calFreq: 'Anual', lastCalDate: '2025-02-21', nextCalDate: '2026-02-21', calCertNo: 'T-2199-2023', calLab: 'METROLAB' },
        { id: 'e2', f11Id: 'C-004', name: 'Humidity sensor HVAC', kmmId: 'TH-0033', serialNo: '', calFreq: 'Anual', lastCalDate: '2025-02-21', nextCalDate: '2026-02-21', calCertNo: 'H-0438-2023' },
        { id: 'e3', f11Id: 'C-013', name: 'Thermometer Clean Cham', serialNo: 'K-150019C', calFreq: 'Anual', lastCalDate: '2017-11-17', nextCalDate: '2018-11-17' },
        { id: 'e4', f11Id: 'C-014', name: 'Humidity sensor Clean Cham', serialNo: 'K-150019C', calFreq: '', lastCalDate: '' },
        { id: 'e5', f11Id: 'C-027', name: 'Death Weight Dynamometer', serialNo: '-', calFreq: 'Anual', lastCalDate: '2025-03-01', nextCalDate: '2026-03-01' },
        { id: 'e6', f11Id: 'C-031', name: 'Mass 1 Dynamometer', serialNo: '1', kmmId: 'WE-0016-01', calFreq: 'Anual', lastCalDate: '2025-09-18', nextCalDate: '2026-09-18' },
        { id: 'e7', f11Id: 'C-048', name: 'Pressure gauge Laboratorio', serialNo: 'PS 055 497', kmmId: 'PR-0002', calFreq: 'Anual', lastCalDate: '2026-08-01', nextCalDate: '2027-08-01' }
    ];
    // Hoja con bloque de título arriba, como el formato impreso del F11.
    const H = ['No.', 'Equipo', 'Laboratorio (auto)', 'Marca', 'Descripción / Magnitud calibrada', 'Modelo', 'No. Serie', 'ID KMM',
        '¿Requiere calibración?', 'Tipo', 'Frecuencia', 'Proveedor (¿quién calibra?)', 'Trazabilidad', 'Lugar',
        'Última calibración', 'Próxima calibración (auto)', 'Estatus (auto)', 'No. Certificado'];
    const row = o => H.map(h => (o[h] !== undefined ? o[h] : ''));
    const serial = iso => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000;
    const grid = [
        ['KIA MÉXICO — PLAN MAESTRO DE MANTENIMIENTO Y CALIBRACIÓN', '', ''],
        ['COP15-F11', 'Rev. 03', 'Fecha: 2026-09-01'],
        [],
        H,
        // C-003 calibrado de nuevo (fecha como serial de Excel) con certificado nuevo
        row({ 'No.': 'C-003', 'ID KMM': 'TH-0033', 'Frecuencia': 'Anual', 'Proveedor (¿quién calibra?)': 'METROLAB',
              'Última calibración': serial('2026-02-20'), 'Próxima calibración (auto)': serial('2027-02-20'), 'No. Certificado': 'T-0101-2026' }),
        // Sin "No.": solo KMM TH-0033, que comparten C-003 y C-004 → ambigua, NO se adivina
        row({ 'ID KMM': 'TH-0033', 'Última calibración': '20/02/2026', 'No. Certificado': 'H-0102-2026' }),
        // Serie compartida K-150019C → ambigua
        row({ 'No. Serie': 'K-150019C', 'Última calibración': '15/03/2026' }),
        // Serie "-": no es identificador; sin No. → sin instrumento
        row({ 'No. Serie': '-', 'Última calibración': '01/03/2026' }),
        // C-027 por No. con fecha dd/mm/aaaa (15 > 12 → día/mes inequívoco)
        row({ 'No.': 'C-027', 'Frecuencia': 'Anual', 'Última calibración': '15/08/2026', 'No. Certificado': 'DW-77' }),
        // C-031 sin cambios
        row({ 'No.': 'C-031', 'Frecuencia': 'Anual', 'Última calibración': serial('2025-09-18'), 'Próxima calibración (auto)': serial('2026-09-18') }),
        // C-048: el Excel trae una fecha MÁS VIEJA que la de la app → no retrocede
        row({ 'No.': 'C-048', 'Última calibración': serial('2025-10-07') }),
        // "No." consecutivo 13 → C-013
        row({ 'No.': 13, 'Frecuencia': 'Anual', 'Última calibración': serial('2026-05-05') }),
        row({ 'No.': 'C-999', 'Última calibración': serial('2026-01-01') }),
        ['Total', '', '']
    ];
    const r = ctx.invCalImportAnalyze(grid, eq);
    ok('encuentra los encabezados debajo del bloque de título', r.ok && r.headerRow === 3, JSON.stringify({ ok: r.ok, h: r.headerRow, why: r.reason }));
    ok('mapea las columnas literales del F11', ['f11Id', 'kmmId', 'serialNo', 'lastCalDate', 'nextCalDate', 'calCertNo', 'calLab', 'calFreq', 'name'].every(k => r.map[k] !== undefined), JSON.stringify(r.map));
    ok('"Laboratorio (auto)" NO se toma como proveedor', r.map.calLab === H.indexOf('Proveedor (¿quién calibra?)'));
    ok('"Descripción / Magnitud calibrada" es la descripción (no "Equipo", que es el equipo padre)', r.map.name === H.indexOf('Descripción / Magnitud calibrada'));
    const by = id => r.updates.find(u => u.eq.f11Id === id);
    const u3 = by('C-003');
    ok('C-003: serial de Excel → fecha ISO', u3 && u3.after.lastCalDate === '2026-02-20', u3 && JSON.stringify(u3.after));
    ok('C-003: certificado nuevo', u3 && u3.after.calCertNo === 'T-0101-2026');
    ok('C-003: la próxima del Excel manda', u3 && u3.after.nextCalDate === '2027-02-20' && u3.nextFromSheet);
    ok('KMM repetido (TH-0033) → ambigua, no se asigna', r.ambiguous.some(a => /TH-0033/.test(a.label)) && !by('C-004'));
    ok('serie repetida (K-150019C) → ambigua', r.ambiguous.some(a => /K-150019C/.test(a.label)));
    ok('serie "-" no identifica → se declara "sin identificador"', r.unmatched.some(a => a.rowNo === 8 && /sin No/.test(a.label)), JSON.stringify(r.unmatched));
    const u27 = by('C-027');
    ok('C-027: 15/08/2026 se lee día/mes', u27 && u27.after.lastCalDate === '2026-08-15', u27 && u27.after.lastCalDate);
    ok('C-027: sin próxima en el Excel → se calcula por frecuencia', u27 && u27.after.nextCalDate === '2027-08-15', u27 && u27.after.nextCalDate);
    ok('C-031 sin cambios → no aparece en updates', !by('C-031') && r.unchanged >= 1);
    ok('C-048: fecha del Excel más vieja → a "older", no se aplica', !by('C-048') && r.older.some(o => o.eq.f11Id === 'C-048'));
    ok('"No." consecutivo 13 → C-013', by('C-013') && by('C-013').via === 'No. consecutivo');
    ok('C-999 → sin instrumento', r.unmatched.some(a => /C-999/.test(a.label)));
    ok('títulos y la fila "Total" no cuentan', r.total === 9 && !r.unmatched.some(a => /Total|PLAN|COP15/i.test(a.label)), 'total=' + r.total);

    // _invApplyCalibration: escritor único, historial sin duplicados
    const e = Object.assign({}, eq[4], { calHistory: [] });
    ctx._invApplyCalibration(e, { date: '2026-08-15', certNo: 'DW-77', by: 'x' });
    ctx._invApplyCalibration(e, { date: '2026-08-15', certNo: 'DW-77', by: 'x' });
    ok('_invApplyCalibration: próxima por frecuencia', e.nextCalDate === '2027-08-15');
    ok('_invApplyCalibration: fecha+certificado no se duplica en calHistory', e.calHistory.length === 1);

    const sinHoja = ctx.invCalImportAnalyze([['Hoja', 'de'], ['gases', 'x']], eq);
    ok('una hoja sin encabezados del F11 se rechaza con motivo', !sinHoja.ok && /encabezados/.test(sinHoja.reason));
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exit(fallaron ? 1 : 0);
