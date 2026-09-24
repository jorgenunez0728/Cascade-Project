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
    CustomEvent: function(t, o) { this.type = t; this.detail = o && o.detail; }, dispatchEvent: noop,
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

// ── Reporte de consumibles ───────────────────────────────────────────────
// Las 23 filas de la tabla del correo "KMX Emissions Laboratory Consumables Status
// September 21st - 25th 2026" (sección 2), transcritas tal cual.
const EMAIL = [
    ['METANO 20 PPM BALANCE AIRE', 1000, 8.3, 1.7, 44, 95.33, 'OK'],
    ['METANO 10 PPM BALANCE AIRE', 2800, 61.1, 12.2, 44, 699.11, 'OK'],
    ['METANO 5 PPM BALANCE AIRE', 450, 37.5, 7.5, 44, 429.00, 'OK'],
    ['METANO 2 PPM BALANCE AIRE', 1300, 2.8, 0.6, 44, 31.78, 'OK'],
    ['PROPANO 16.66  PPM BALANCE AIRE', 2150, 30.6, 6.1, 44, 349.56, 'OK'],
    ['PROPANO  3.33 PPM BALANCE AIRE', 3300, 40.3, 8.1, 44, 460.78, 'OK'],
    ['PROPANO 1.66PPM BALANCE AIRE', 100, 41.7, 8.3, 44, 476.67, 'Comprar'],
    ['PROPANO 0.66PPM BALANCE AIRE', 1300, 8.3, 1.7, 44, 95.33, 'OK'],
    ['MONÓXIDO DE CARBONO 100 PPM BALANCE NITRÓGENO', 3000, 15.3, 3.1, 44, 174.78, 'OK'],
    ['MONÓXIDO DE CARBONO 50 PPM BALANCE NITRÓGENO', 2600, 54.2, 10.8, 44, 619.67, 'OK'],
    ['MONÓXIDO DE CARBONO 20 PPM BALANCE NITRÓGENO', 1150, 68.1, 13.6, 44, 778.56, 'OK'],
    ['MONÓXIDO DE CARBONO 10 PPM BALANCE NITRÓGENO', 1900, 44.4, 8.9, 44, 508.44, 'OK'],
    ['ÓXIDO NÍTRICO 2 PPM BALANCE NITRÓGENO', 1850, 4.2, 0.8, 44, 47.67, 'OK'],
    ['ÓXIDO NÍTRICO 5 PPM BALANCE NITRÓGENO', 1350, 52.8, 10.6, 44, 603.78, 'OK'],
    ['ÓXIDO NÍTRICO 10 PPM BALANCE NITRÓGENO', 3300, 47.2, 9.4, 44, 540.22, 'OK'],
    ['ÓXIDO NÍTRICO 50 PPM BALANCE NITRÓGENO', 1500, 8.3, 1.7, 44, 95.33, 'OK'],
    ['BIÓXIDO DE CARBONO 0.5 %v BALANCE NITRÓGENO', 1500, 2.8, 0.6, 44, 31.78, 'OK'],
    ['BIÓXIDO DE CARBONO 1 %v BALANCE NITRÓGENO', 2600, 54.2, 10.8, 44, 619.67, 'OK'],
    ['BIÓXIDO DE CARBONO 2 %v BALANCE NITRÓGENO', 1800, 41.7, 8.3, 44, 476.67, 'OK'],
    ['ÓXIDO NITROSO 0.5 PPM BALANCE NITRÓGENO', 1500, 2.8, 0.6, 44, 31.78, 'OK'],
    ['ÓXIDO NITROSO 2.5 PPM BALANCE NITRÓGENO', 1700, 1.4, 0.3, 44, 15.89, 'OK'],
    ['ÓXIDO NITROSO 5 PPM BALANCE NITRÓGENO', 1450, 4.2, 0.8, 21, 22.75, 'OK'],
    ['NITRÓGENO 5.5 (99.9995 %)', 2500, 175.0, 35.0, 21, 955.50, 'OK']
];

console.log('\n== invGasReorder (fórmula del correo) ==');
{
    // Un cilindro con 8.333 psi/semana (lecturas semanales) y 44 días de reposición
    const mk = (psiWeek, lead, last) => ({ id: 'x', status: 'In use', leadDays: lead, readings: [
        { date: '2026-08-31', psi: last + 3 * psiWeek }, { date: '2026-09-07', psi: last + 2 * psiWeek },
        { date: '2026-09-14', psi: last + psiWeek }, { date: '2026-09-21', psi: last }] });
    const near = (a, b, t) => Math.abs(a - b) <= (t || 0.05);
    let r = ctx.invGasReorder(mk(8.3333, 44, 1000));
    ok('Metano 20: límite 95.33 = 8.33/5 × 44 × 1.3', near(r.reorderPsi, 95.33), r.reorderPsi);
    ok('Metano 20 a 1000 psi → OK', r.status === 'ok' && !r.needsPurchase);
    r = ctx.invGasReorder(mk(61.1, 44, 2800));
    ok('Metano 10: límite 699.11', near(r.reorderPsi, 699.0, 0.5), r.reorderPsi);
    r = ctx.invGasReorder(mk(175, 21, 2500));
    ok('N₂: límite 955.5 = 35 × 21 × 1.3', near(r.reorderPsi, 955.5), r.reorderPsi);
    r = ctx.invGasReorder(mk(41.6667, 44, 100));
    ok('Propano 1.66 a 100 psi → Comprar (límite 476.67)', r.status === 'comprar' && near(r.reorderPsi, 476.67), r.status + ' ' + r.reorderPsi);
    ok('consumo diario = semanal / 5 días hábiles', near(r.workDayPsi, 8.333, 0.01), r.workDayPsi);
    const sinRitmo = ctx.invGasReorder({ status: 'In use', readings: [{ date: '2026-09-21', psi: 900 }] });
    ok('una sola lectura → "sinritmo", nunca "ok"', sinRitmo.status === 'sinritmo' && !sinRitmo.needsPurchase);
    ok('sin leadDays usa reposDays de la semilla', ctx.invGasLeadDays({ reposDays: 21 }) === 21);
    ok('sin nada → 44 días', ctx.invGasLeadDays({}) === 44);
    // Una recarga en medio NO es consumo negativo (invGasBurnRate descarta la subida)
    r = ctx.invGasReorder({ status: 'In use', leadDays: 44, readings: [
        { date: '2026-09-07', psi: 300 }, { date: '2026-09-14', psi: 2000 }, { date: '2026-09-21', psi: 1950 }] });
    ok('recarga en medio: ritmo solo de la caída real (50 psi/sem)', near(r.weeklyPsi, 50, 0.1), r.weeklyPsi);
}

console.log('\n== invConsParseGrid / invConsParseOcrLines ==');
{
    const H = ['Tipo de consumible', 'Consumible', 'Actual Inventory', 'CONSUMO SEMANAL PROMEDIO (PSI)', 'CONSUMO DIARIO PROMEDIO (PSI)', 'TIEMPO DE REPOSICION (Días)', 'Limite Inferior (PSI)', 'Status'];
    const grid = [['2. Reference gas consumption status'], H].concat(EMAIL.map((e, i) => [i === 0 ? 'GASES DE REFERENCIA' : ''].concat(e)));
    const rows = ctx.invConsParseGrid(grid);
    ok('lee las 23 filas del correo (Excel)', rows.length === 23, rows.length);
    ok('"Tipo de consumible" NO se toma como el nombre', rows[0].label === 'METANO 20 PPM BALANCE AIRE', rows[0].label);
    ok('Propano 1.66: inventario 100, status Comprar', rows[6].inventory === 100 && rows[6].status === 'comprar');
    ok('N₂: nombre con números adentro intacto', rows[22].label === 'NITRÓGENO 5.5 (99.9995 %)' && rows[22].lead === 21, JSON.stringify(rows[22]));
    const avisos = rows.filter(r => ctx.invConsRowCheck(r).length);
    ok('la tabla real pasa su propia autocomprobación (0 avisos)', avisos.length === 0, avisos.map(r => r.label + ': ' + ctx.invConsRowCheck(r).join('; ')).join(' | '));

    // Texto pegado desde Outlook: la celda combinada no viene en las filas 2..23
    const tsv = [H.join('\t')].concat(EMAIL.map((e, i) => (i === 0 ? ['GASES DE REFERENCIA'] : []).concat(e).join('\t'))).join('\n');
    const rows2 = ctx.invConsParseGrid(ctx._pnProjParseDelimited(tsv));
    ok('texto pegado sin la celda combinada → se alinea por la derecha', rows2.length === 23 && rows2[5].inventory === 3300 && rows2[5].label === 'PROPANO 3.33 PPM BALANCE AIRE', JSON.stringify(rows2[5]));

    // Sin encabezados (solo filas): mismo lector que el OCR
    const rows3 = ctx.invConsParseGrid(EMAIL.slice(0, 3).map(e => e.slice()));
    ok('sin encabezados → se leen por posición', rows3.length === 3 && rows3[1].inventory === 2800);

    // OCR: renglones con separadores y un dígito mal leído
    const lines = [
        '2. Reference gas consumption status',
        'Tipo de | Consumible | Actual | CONSUMO SEMANAL',
        '| METANO 20 PPM BALANCE AIRE | 1000 | 8.3 | 1.7 | 44 | 95.33 | OK',
        'PROPANO 1.66PPM BALANCE AIRE 100 41.7 8.3 44 476.67 Comprar',
        'ÓXIDO NÍTRICO 5 PPM BALANCE NITRÓGENO 1350 52.8 10.6 44 693.78 OK',   // 603.78 → 693.78
        'NITRÓGENO 5.5 (99.9995 %) 2500 175,0 35,0 21 955,50 0K'
    ];
    const o = ctx.invConsParseOcrLines(lines);
    ok('OCR: 4 filas válidas, títulos descartados', o.length === 4, o.map(r => r.label).join(' | '));
    ok('OCR: "0K" y coma decimal', o[3].status === 'ok' && o[3].weekly === 175 && o[3].limit === 955.5);
    ok('OCR: el dígito mal leído en el límite se delata', ctx.invConsRowCheck(o[2]).some(w => /Límite/.test(w)), ctx.invConsRowCheck(o[2]).join(';'));
    ok('OCR: una fila bien leída no avisa', ctx.invConsRowCheck(o[0]).length === 0, ctx.invConsRowCheck(o[0]).join(';'));
    const conf = ctx.invConsParseOcrLines([{ text: 'x', words: 'METANO 2 PPM BALANCE AIRE 1300 2.8 0.6 44 31.78 OK'.split(' ').map((t, i) => ({ text: t, confidence: i === 5 ? 41 : 95 })) }]);
    ok('OCR: baja confianza en el inventario se marca', ctx.invConsRowCheck(conf[0]).some(w => /poco seguro/.test(w)), JSON.stringify(conf[0] && conf[0].conf));
}

console.log('\n== _invOcrFindGrid (tabla con bordes) ==');
{
    // Tabla sintética 3 columnas × 4 renglones, líneas de 2 px, texto en una celda
    const W = 300, H = 130, ink = new Uint8Array(W * H);
    const hy = [0, 30, 60, 90, 128], vx = [0, 100, 200, 298];
    hy.forEach(y => { for (let x = 0; x < W; x++) { ink[y * W + x] = 1; ink[(y + 1) * W + x] = 1; } });
    vx.forEach(x => { for (let y = 0; y < H; y++) { ink[y * W + x] = 1; ink[y * W + x + 1] = 1; } });
    for (let y = 40; y < 50; y++) for (let x = 120; x < 160; x++) ink[y * W + x] = 1;   // "texto"
    const g = ctx._invOcrFindGrid(ink, W, H);
    ok('encuentra 4 renglones y 3 columnas', g && g.rows.length === 4 && g.cols.length === 3, JSON.stringify(g));
    ok('borra las líneas y deja el texto', ink[30 * W + 50] === 2 && ink[45 * W + 130] === 1);
    const foto = new Uint8Array(W * H); for (let i = 0; i < foto.length; i += 7) foto[i] = 1;
    ok('sin líneas rectas (foto) → null', ctx._invOcrFindGrid(foto, W, H) === null);
    ok('Otsu separa tinta de fondo', (() => { const a = new Uint8Array(1000); a.fill(240, 0, 800); a.fill(20, 800); const t = ctx._invOtsu(a); return t >= 20 && t < 240; })());  // tinta = gris <= t
}

console.log('\n== invMatchGasByLabel ==');
{
    ctx.invPreloadData();
    const gases = ctx.__inv().gases;
    const m = l => { const r = ctx.invMatchGasByLabel(l, gases); return r.gas ? r.gas.formula + ' ' + r.gas.concNominal : '(' + r.why + ')'; };
    ok('METANO 20 PPM → CH4/Air 20 ppm', m('METANO 20 PPM BALANCE AIRE') === 'CH4/Air 20 ppm', m('METANO 20 PPM BALANCE AIRE'));
    ok('PROPANO 1.66PPM → C3H8/Air 1.66 ppm', m('PROPANO 1.66PPM BALANCE AIRE') === 'C3H8/Air 1.66 ppm');
    ok('MONÓXIDO DE CARBONO 100 → CO/N2 (el balance nitrógeno no confunde)', m('MONÓXIDO DE CARBONO 100 PPM BALANCE NITRÓGENO') === 'CO/N2 100 ppm');
    ok('ÓXIDO NÍTRICO ≠ ÓXIDO NITROSO', m('ÓXIDO NÍTRICO 2 PPM BALANCE NITRÓGENO') === 'NO/N2 2 ppm' && m('ÓXIDO NITROSO 2.5 PPM BALANCE NITRÓGENO') === 'N2O/N2 2.5 ppm');
    ok('BIÓXIDO DE CARBONO 0.5 %v → CO2/N2 0.5 %v', m('BIÓXIDO DE CARBONO 0.5 %v BALANCE NITRÓGENO') === 'CO2/N2 0.5 %v');
    ok('NITRÓGENO 5.5 (99.9995 %) → N2 5.5, no el 4.8', m('NITRÓGENO 5.5 (99.9995 %)') === 'N2 99.9995%', m('NITRÓGENO 5.5 (99.9995 %)'));
    ok('OCR "NITRÓGENO 5.5 (99.9995 3%)" → N2 5.5 por el grado', m('NITRÓGENO 5.5 (99.9995 3%)') === 'N2 99.9995%', m('NITRÓGENO 5.5 (99.9995 3%)'));
    ok('una concentración que no existe NO se inventa', m('METANO 7 PPM BALANCE AIRE').startsWith('('), m('METANO 7 PPM BALANCE AIRE'));
    ok('las 23 filas del correo empatan con un cilindro', EMAIL.every(e => ctx.invMatchGasByLabel(e[0], gases).gas), EMAIL.filter(e => !ctx.invMatchGasByLabel(e[0], gases).gas).map(e => e[0]).join(' | '));
    const g0 = gases.find(g => g.formula === 'CH4/Air' && g.concNominal === '20 ppm');
    g0.importAlias = 'METANO VEINTE';
    ok('el alias recordado manda', ctx.invMatchGasByLabel('metano veinte', gases).why === 'alias');
    const vacios = gases.map(g => g === g0 ? Object.assign({}, g, { status: 'Empty', importAlias: '' }) : g);
    ok('un cilindro vacío nunca se elige', ctx.invMatchGasByLabel('METANO 20 PPM BALANCE AIRE', vacios).gas === null);
}

console.log('\n== invFuelWeeklyUsage ==');
{
    const t = { readings: [
        { date: '2026-09-07', level: 400 }, { date: '2026-09-11', level: 386 },           // sem 7-11: 14
        { date: '2026-09-18', level: 379 },                                               // sem 14-18: 7
        { date: '2026-09-21', level: 240, auto: true },                                   // automática: se ignora
        { date: '2026-09-22', level: 400 },                                               // recarga: no cuenta
        { date: '2026-09-25', level: 351 }] };                                            // sem 21-25: 49
    const u = ctx.invFuelWeeklyUsage(t, 8);
    ok('litros por semana: 14 / 7 / 49 (sin recarga ni automáticas)', JSON.stringify(u.weeks.map(w => w.liters)) === '[14,7,49]', JSON.stringify(u.weeks));
    ok('semana por lunes', u.weeks[2].monday === '2026-09-21');
    ok('nivel de reorden: solo si está capturado', ctx.invFuelReorder({ currentLevel: 150 }).needsPurchase === false && ctx.invFuelReorder({ currentLevel: 150, reorderLevel: 200 }).needsPurchase === true);
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exit(fallaron ? 1 : 0);
