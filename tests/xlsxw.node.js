// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas de xlsxw.js — el escritor de .xlsx propio (2.32.0)           ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Se relee con el lector de la propia app (vetsReadWorkbook) para no depender de
// nada externo, y se verifica que sea determinista: mismo spec → mismos bytes.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ctx = { console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite,
    parseInt, parseFloat, Promise, TextDecoder, TextEncoder, Uint8Array,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    CASCADE_TOOLTIPS: {} };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const js = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
vm.runInContext(js('xlsxw.js'), ctx);
vm.runInContext(js('vets.js'), ctx);

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('✗ ' + msg); } }
const inflate = u8 => Promise.resolve(zlib.inflateRawSync(Buffer.from(u8)));

const spec = { title: 'Prueba', sheets: [
    { name: 'Jan-26', active: true, showGrid: false, freeze: { row: 3, col: 2 },
      cols: [{ min: 1, max: 1, width: 30 }],
      cells: [
        { r: 1, c: 1, v: 'Título & <x> "é" 🧪', s: { font: { b: true }, fill: 'DBEAFE' } },
        { r: 3, c: 1, v: 'CL4 SULEV' }, { r: 3, c: 2, v: 7 },
        { r: 3, c: 3, f: 'COUNTIF(F3:F10,A3)', v: 1 },
        { r: 3, c: 4, v: { date: '2026-01-15' }, s: { numFmt: 'yyyy-mm-dd' } },
        { r: 3, c: 6, v: 'CL4 SULEV' }, { r: 4, c: 1, v: 'CL4 SULEV' }   // texto repetido → una sola cadena
      ],
      merges: ['A1:E1'],
      validations: [{ sqref: 'F3:F10', list: 'Lists!$A$1:$A$2', allowOther: true }],
      cf: [{ sqref: 'F3:F10', type: 'containsText', text: 'SULEV', style: { fill: 'BFDBFE' } }],
      autoFilter: 'A2:E4', print: { landscape: true, fitWidth: 1 } },
    { name: 'Lists', hidden: true, cells: [{ r: 1, c: 1, v: 'CL4 SULEV' }, { r: 2, c: 1, v: 'Testing' }] }
] };

ok(ctx.xwColName(1) === 'A' && ctx.xwColName(26) === 'Z' && ctx.xwColName(27) === 'AA' && ctx.xwColName(703) === 'AAA', 'xwColName');
ok(ctx.xwRange(2, 3, 10, 28, true) === '$C$2:$AB$10', 'xwRange absoluto');
ok(ctx.xwDateSerial('2026-01-15') === 46037, 'serial de 15-ene-2026 = 46037 (Excel)');
ok(ctx.xwDateSerial('1900-03-01') === 61, 'serial tras el 29-feb ficticio');
ok(ctx.xwDateSerial('nada') === null, 'fecha inválida → null');

const a = ctx.xwBuild(spec), b = ctx.xwBuild(spec);
ok(a.length > 1000, 'el libro tiene contenido');
ok(Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0, 'determinista: mismos bytes');
ok(a[0] === 0x50 && a[1] === 0x4B && a[2] === 3 && a[3] === 4, 'firma ZIP');

const entries = ctx.vetsZipEntries(a);
const names = Object.keys(entries);
['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']
    .forEach(n => ok(names.includes(n), 'parte ' + n));

// El texto de cada parte es XML bien formado (balance de etiquetas, sin & sueltos).
function wellFormed(x) {
    if (/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(x)) return false;
    const stack = [];
    const re = /<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g; let m;
    const body = x.replace(/<\?xml[^>]*\?>/, '');
    while ((m = re.exec(body))) {
        if (m[3]) continue;
        if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
    }
    return stack.length === 0;
}

(async () => {
    // vetsZipEntries da offsets de datos; store = sin compresión → el texto se lee directo.
    const parts = await Promise.all(names.map(n => ctx._vetsZipText(a, entries, n, inflate).then(t => [n, t])));
    parts.forEach(([n, t]) => ok(wellFormed(t), 'XML bien formado: ' + n));
    const sh1 = parts.find(p => p[0] === 'xl/worksheets/sheet1.xml')[1];
    ok(/<mergeCell ref="A1:E1"\/>/.test(sh1), 'fusión');
    ok(/<dataValidation type="list"[^>]*showErrorMessage="0"[^>]*sqref="F3:F10"><formula1>Lists!\$A\$1:\$A\$2<\/formula1>/.test(sh1), 'lista desplegable');
    ok(/<cfRule type="containsText"[^>]*text="SULEV"><formula>NOT\(ISERROR\(SEARCH\("SULEV",F3\)\)\)<\/formula>/.test(sh1), 'formato condicional');
    ok(/<c r="C3"><f>COUNTIF\(F3:F10,A3\)<\/f><v>1<\/v><\/c>/.test(sh1), 'fórmula con valor calculado');
    ok(/<pane xSplit="1" ySplit="2" topLeftCell="B3" activePane="bottomRight" state="frozen"\/>/.test(sh1), 'paneles inmovilizados');
    ok(/<autoFilter ref="A2:E4"\/>/.test(sh1), 'autofiltro');
    const wb = parts.find(p => p[0] === 'xl/workbook.xml')[1];
    ok(/<sheet name="Lists" sheetId="2" state="hidden"/.test(wb), 'hoja oculta');
    ok(/fullCalcOnLoad="1"/.test(wb), 'recalcula al abrir');
    ok(/_xlnm\._FilterDatabase" localSheetId="0" hidden="1">'Jan-26'!\$A\$2:\$E\$4</.test(wb), 'nombre del autofiltro');
    const sst = parts.find(p => p[0] === 'xl/sharedStrings.xml')[1];
    ok((sst.match(/<si>/g) || []).length === 3, 'cadenas compartidas sin repetir');

    const grids = await ctx.vetsReadWorkbook(a, null, inflate);
    ok(grids['Jan-26'] && grids['Lists'], 'el lector de la app encuentra las dos hojas');
    const g = grids['Jan-26'];
    ok(g[1][1] === 'Título & <x> "é" 🧪', 'acentos, emoji y escapes ida y vuelta');
    ok(Number(g[3][2]) === 7 && Number(g[3][4]) === 46037, 'número y fecha');
    ok(g[4][1] === 'CL4 SULEV', 'cadena compartida');

    // Comprimido (deflate): el mismo contenido, mucho más chico, y el lector de la app lo abre.
    const deflate = u8 => Promise.resolve(new Uint8Array(zlib.deflateRawSync(Buffer.from(u8))));
    const z = await ctx.xwBuildCompressed(spec, deflate);
    ok(z.length < a.length, 'comprimido es más chico (' + z.length + ' < ' + a.length + ')');
    const gz = await ctx.vetsReadWorkbook(z, null, inflate);
    ok(JSON.stringify(gz) === JSON.stringify(grids), 'comprimido = mismo contenido');
    const z2 = await ctx.xwBuildCompressed(spec, () => Promise.resolve(null));
    ok(Buffer.compare(Buffer.from(z2), Buffer.from(a)) === 0, 'sin compresor disponible → el mismo archivo sin comprimir');
    const z3 = await ctx.xwBuildCompressed(spec, () => Promise.reject(new Error('x')));
    ok(Buffer.compare(Buffer.from(z3), Buffer.from(a)) === 0, 'si el compresor falla, no falla el archivo');

    console.log(`xlsxw: ${pass} ok, ${fail} fallas`);
    if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
