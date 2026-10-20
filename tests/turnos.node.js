// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.16.0 — dos lecturas por día (mañana y tarde) y la Lista de           ║
// ║  consumibles (histórico semanal + el Excel en el formato del lab).      ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const noop = () => {};
const store = {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    setTimeout, clearTimeout, Uint8Array, TextEncoder, Promise,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop,
                createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    safeParse: (k, d) => d, showToast: noop, auditLog: noop, escapeHtml: s => String(s), CASCADE_TOOLTIPS: {},
    CustomEvent: function(t, o) { this.type = t; this.detail = o && o.detail; }, dispatchEvent: noop,
    localToday: () => '2026-10-20', debounce: fn => fn, tabCacheInvalidate: noop, invRender: noop,
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const js = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
for (const f of ['inventory.js', 'xlsxw.js', 'conslist.js']) vm.runInContext(js(f), ctx, { filename: f });
// _fbMergeReadings vive en firebase-sync.js: solo esa función.
const fbSrc = js('firebase-sync.js');
vm.runInContext(/\nfunction _fbMergeReadings[\s\S]*?\n}\n/.exec(fbSrc)[0], ctx);
vm.runInContext('globalThis.__inv = () => invState;', ctx);

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle !== undefined ? ' — ' + detalle : '')); }
}

console.log('\n== Mañana y tarde ==');
{
    const inv = ctx.__inv();
    inv.gases = [{ id: 'g1', formula: 'CH4/Air', gasType: 'Metano', concNominal: '20 ppm', controlNo: 'A1', status: 'In use',
                   readings: [{ date: '2026-10-19', psi: 1200 }] }];
    const a = ctx.invAddReading('g1', 1180, { date: '2026-10-20', shift: 'am', silent: true, skipSave: true });
    const b = ctx.invAddReading('g1', 1150, { date: '2026-10-20', shift: 'pm', silent: true, skipSave: true });
    const g = inv.gases[0];
    ok('el mismo día admite la de la mañana y la de la tarde', a.ok && b.ok && g.readings.length === 3, g.readings.length);
    ok('la serie queda en orden (la tarde al final)', g.readings[2].shift === 'pm' && g.readings[2].psi === 1150);
    ok('invGasLevel lee la de la tarde', ctx.invGasLevel(g).psi === 1150);
    const c = ctx.invAddReading('g1', 1160, { date: '2026-10-20', shift: 'pm', silent: true, skipSave: true });
    ok('capturar la tarde otra vez la reemplaza', c.replaced && c.replaced.psi === 1150 && g.readings.length === 3);
    ok('una lectura sin turno (anterior a 3.16.0) cuenta como de la mañana', ctx.invReadingShift({ date: '2026-10-19' }) === 'am');
    ok('invFindReadingOn por turno', ctx.invFindReadingOn(g, '2026-10-20', 'am').psi === 1180 && ctx.invFindReadingOn(g, '2026-10-20', 'pm').psi === 1160);
    ok('sin turno devuelve la última del día', ctx.invFindReadingOn(g, '2026-10-20').psi === 1160);
    const br = ctx.invGasBurnRate(g);
    // 1200 (19 am) → 1180 (20 am, 1 día) → 1160 (20 pm, 8 h): 40 psi en 1.333 días
    ok('el ritmo cuenta el tramo mañana→tarde (8 h)', Math.abs(br.dailyPsi - 40 / (1 + 8 / 24)) < 1e-9, br.dailyPsi);
    ok('aviso: la anterior de la tarde es la mañana del mismo día', /1180/.test(ctx.invReadingWarning(g, 1300, '2026-10-20', 'pm') || ''));
    ok('turno por la hora: 9 h mañana, 15 h tarde', ctx.invShiftNow(new Date(2026, 9, 20, 9)) === 'am' && ctx.invShiftNow(new Date(2026, 9, 20, 15)) === 'pm');
}

console.log('\n== Sync: las dos del día no colapsan ==');
{
    const m = ctx._fbMergeReadings;
    const loc = [{ date: '2026-10-20', psi: 1180, shift: 'am' }];
    const rem = [{ date: '2026-10-20', psi: 1160, shift: 'pm' }, { date: '2026-10-20', psi: 1170, auto: true }];
    const r = m(loc, rem);
    ok('mañana local + tarde remota = las dos', r.length === 2 && r[0].shift === 'am' && r[1].shift === 'pm', JSON.stringify(r));
    ok('la automática del día se retira (hay humana)', !r.some(x => x.auto));
    const s = m(rem, loc);
    ok('simétrica en contenido', JSON.stringify(s.map(x => x.psi)) === JSON.stringify(r.map(x => x.psi)));
    ok('sin turno vs mañana del mismo día = la misma lectura (gana la local)', m([{ date: '2026-10-19', psi: 1 }], [{ date: '2026-10-19', psi: 2, shift: 'am' }]).length === 1);
}

console.log('\n== Lista de consumibles: leer el Excel del laboratorio ==');
// Retícula sintética con el acomodo del archivo real (sin sus datos).
const G = [];
const put = (r, c, v) => { (G[r] = G[r] || [])[c] = v; };
put(0, 1, 'LISTA DE STOCK DE CONSUMIBLES DEL LABORATORIO DE EMISIONES');
put(5, 0, 'Tipo de\n consumible'); put(5, 1, 'Consumible'); put(5, 2, 'No de item'); put(5, 3, 'CODIGO');
put(5, 6, 2024); put(5, 10, '2026 INVENTORY'); put(5, 18, '2026 CONSUMO'); put(5, 22, 'Actual Inventory'); put(5, 25, 'TIEMPO DE REPOSICION (Días)'); put(5, 26, 'Limite Inferior (PSI)');
put(6, 6, 'DICIEMBRE'); put(6, 10, 'ENERO'); put(6, 14, 'FEBRERO');
put(7, 4, 'STOCK INICIAL\n (UNIDAD)'); put(7, 5, 'STOCK ACTUAL\n(Unidad)');
for (let k = 0; k < 4; k++) { put(7, 6 + k, 'Semana ' + (k + 1)); put(7, 10 + k, 'Semana ' + (k + 1)); put(7, 14 + k, 'Semana ' + (k + 1)); }
const metano = [900, 750, 700, 700, 1300, 1250, 1250, 1200, 1200, 1100];
put(8, 0, 'GASES DE REFERENCIA'); put(8, 1, 'METANO 20 PPM BALANCE AIRE'); put(8, 2, 31); put(8, 3, 'MXPTEPRMULTI'); put(8, 4, 1); put(8, 5, 1); put(8, 25, 44);
metano.forEach((v, i) => put(8, 6 + i, v));
put(9, 1, 'NITRÓGENO 5.5 (99.9995 %)'); put(9, 25, 21);
[6000, 5500, 5050, 4700].forEach((v, i) => put(9, 10 + i, v));
put(10, 0, 'GASOLINAS DE\n REFERENCIA'); put(10, 1, 'Euro Stage VI E10 Test Fuel'); put(10, 4, 0); put(10, 5, 0); put(10, 25, 21); put(10, 26, '200 LTS');
put(12, 1, 'BIÓXIDO DE CARBONO 0.5 %v');    // después del primer renglón vacío: no es de la tabla
const P = ctx.invConsListParse(G);
ok('lee 3 consumibles (se detiene en el primer renglón vacío)', P.rows && P.rows.length === 3, P.error || P.rows.length);
ok('12 semanas: diciembre + enero + febrero', P.weeks.length === 12, P.weeks.length);
ok('el diciembre que dice 2024 antes de enero 2026 es diciembre 2025, y se dice', P.weeks[0].id === '2025-12-S1' && /diciembre 2025/.test(P.notes[0] || ''), P.weeks[0].id);
ok('valores por semana', P.rows[0].weeks['2026-01-S1'] === 1300 && P.rows[0].weeks['2026-02-S2'] === 1100);
ok('la categoría se arrastra', P.rows[1].category === 'GASES DE REFERENCIA' && P.rows[2].category.startsWith('GASOLINAS'));
ok('reposición y límite en texto', P.rows[0].leadDays === 44 && P.rows[2].limitText === '200 LTS');
ok('el acomodo declarado viaja con el renglón', P.rows[1].layout.length === 12);

console.log('\n== El modelo del año ==');
{
    const gases = [{ id: 'n1', formula: 'N2', gasType: 'Nitrogeno 5.5', concNominal: '99.9995 %', controlNo: 'N1', status: 'In use',
                     readings: [{ date: '2026-02-03', psi: 4600, shift: 'am' }, { date: '2026-02-03', psi: 4500, shift: 'pm' }, { date: '2026-02-10', psi: 4300 }] }];
    const M = ctx.invConsListModel({ year: 2026, today: '2026-02-12', history: P.rows, gases, reportLabel: g => g.gasType });
    const met = M.rows[0], nit = M.rows[1];
    ok('meses con histórico respetan sus semanas (enero 4)', M.months[1].weeks.length === 4 && M.months[1].fromHistory);
    ok('lo importado gana', met.cells['2026-01-S1'].v === 1300 && met.cells['2026-01-S1'].src === 'hist');
    ok('consumo = MAX(0, anterior − esta), una recarga cuenta 0', met.consumption[0] === 50 && met.consumption[1] === 0 && met.consumption[3] === 0);
    const fe = M.rows[2];
    ok('un renglón sin semanas no tiene status', fe.status === '' && !fe.hasData);
    const febS1 = nit.cells['2026-02-S1'];
    ok('semana sin histórico sale de la plataforma (la última lectura: la de la tarde)', febS1 && febS1.src === 'app' && febS1.v === 4500, JSON.stringify(febS1));
    ok('semanas futuras van vacías', !nit.cells['2026-02-S4']);
    ok('límite inferior = (prom/5) × días × 1.3', Math.abs(met.lowerLimit - met.weeklyAvg / 5 * 44 * 1.3) < 1e-9);
    // El Excel
    const spec = ctx.invConsListXlsxSpec(M);
    const sh = spec.sheets[0];
    const cellAt = (r, c) => sh.cells.filter(x => x.r === r && x.c === c).pop();
    ok('el Excel trae el título y los encabezados del laboratorio', cellAt(1, 2).v.startsWith('LISTA DE STOCK') && cellAt(6, 2).v === 'Consumible');
    const f = sh.cells.filter(x => x.f && /MAX\(0,/.test(x.f));
    ok('consumo con su fórmula', f.length > 10 && /IF\(OR\([A-Z]+9="",[A-Z]+9=""\),"",MAX\(0,[A-Z]+9-[A-Z]+9\)\)/.test(f[0].f), f[0] && f[0].f);
    ok('status con su fórmula (OK / Comprar)', sh.cells.some(x => x.f && /"OK","Comprar"/.test(x.f)));

    // LibreOffice: cada fórmula recalcula al valor que escribió la app.
    let soffice = null;
    try { soffice = execFileSync('which', ['soffice']).toString().trim(); } catch (e) {}
    if (soffice) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conslist-'));
        fs.writeFileSync(path.join(dir, 'c.xlsx'), Buffer.from(ctx.xwBuild(spec)));
        const prof = path.join(dir, 'prof'); fs.mkdirSync(path.join(prof, 'user'), { recursive: true });
        fs.writeFileSync(path.join(prof, 'user', 'registrymodifications.xcu'),
            '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
            '<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item></oor:items>');
        try {
            execFileSync(soffice, ['-env:UserInstallation=file://' + prof, '--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', path.join(dir, 'out'), path.join(dir, 'c.xlsx')], { stdio: 'pipe', timeout: 120000 });
            const files = unzip(fs.readFileSync(path.join(dir, 'out', 'c.xlsx')));
            const sst = (files['xl/sharedStrings.xml'] || '').match(/<si>[\s\S]*?<\/si>/g) || [];
            const strs = sst.map(x => (x.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
            const xml = files['xl/worksheets/sheet1.xml'];
            const bad = []; let n = 0;
            sh.cells.filter(c => c.f).forEach(c => {
                const a1 = ctx.xwRef(c.r, c.c);
                const m = new RegExp('<c r="' + a1 + '"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)').exec(xml);
                const raw = m && m[2] ? (/<v>([\s\S]*?)<\/v>/.exec(m[2]) || [])[1] : undefined;
                let got = raw === undefined ? '' : (/t="s"/.test(m[1]) ? strs[+raw] : /t="str"/.test(m[1]) ? raw : parseFloat(raw));
                const want = c.v === null || c.v === undefined ? '' : c.v;
                const same = typeof want === 'number' ? Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want)) : String(got) === String(want);
                if (!same) bad.push(a1 + ' LO=' + got + ' app=' + want);
                n++;
            });
            ok('LibreOffice recalcula cada fórmula al valor que escribió la app (' + n + ')', !bad.length && n > 20, bad.slice(0, 5).join('; '));
        } catch (e) { ok('LibreOffice abrió el libro', false, e.message); }
    } else console.log('  (sin LibreOffice: se omite el recálculo)');
}

function unzip(buf) {
    const out = {};
    let e = buf.length - 22;
    while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
    const count = buf.readUInt16LE(e + 10);
    let p = buf.readUInt32LE(e + 16);
    for (let i = 0; i < count; i++) {
        const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
        const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
        const off = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nlen).toString();
        const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28);
        const data = buf.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
        out[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
        p += 46 + nlen + xlen + clen;
    }
    return out;
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
