// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas de la hoja de HQ y del método de gases de UN R154 (3.15.0)   ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Datos SINTÉTICOS: el archivo de corporativo es de uso restringido y el repositorio es
// público, así que ni sus datos de ejemplo entran aquí. Los esperados se calcularon aparte
// con las fórmulas de la hoja (Excel: AVERAGE, VAR muestral, K*H-J/H, tabla A2/3).
// Con LibreOffice instalado (`soffice`), además se abre el libro, se fuerza el
// recálculo y se compara cada fórmula con el valor que escribió la app.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const os = require('os');
const { execFileSync } = require('child_process');

const noop = () => {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat, Promise,
    Uint8Array, TextEncoder, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => ({ style: {} }) },
    safeParse: (k, d) => d, showToast: noop, auditLog: noop, escapeHtml: s => String(s), CASCADE_TOOLTIPS: {},
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const js = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
vm.runInContext(js('cop_validator.js'), ctx, { filename: 'cop_validator.js' });
vm.runInContext(js('xlsxw.js'), ctx, { filename: 'xlsxw.js' });
vm.runInContext(js('cophq.js'), ctx, { filename: 'cophq.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle !== undefined ? ' — ' + detalle : '')); }
}
const near = (a, b, rel) => Math.abs(a - b) <= (rel || 1e-9) * Math.max(1, Math.abs(b));

// ── Valores de referencia (sintéticos; g/km y #/km) ──
const HQ = {
    CO:   { raw: [0.0412, 0.0287, 0.0355], df: 1.5, limit: 1, xt: 0.0527, vr: 8.81175e-5, bound: 1.0499118825 },
    NMHC: { raw: [0.0041, 0.0036, 0.0048], df: 1.3, limit: 0.068, xt: 0.005416666666666667, vr: 6.140333333333331e-7, bound: 0.07139097009803923 },
    NOx:  { raw: [0.0021, 0.0017, 0.0029], df: 1.6, limit: 0.06, xt: 0.0035733333333333333, vr: 9.557333333333332e-7, bound: 0.06298407111111111 },
    PM:   { raw: [6.1e-5, 2.2e-4, 3.1e-4], df: 1, limit: 0.0045, xt: 0.000197, vr: 1.5897e-8, bound: 0.004721467333333333 },
    PN:   { raw: [1.4e8, 2.3e8, 1.9e8], df: 1, limit: 6e11, xt: 186666666.66666666, vr: 2033333333333333.2, bound: 629999996611.1111 }
};

console.log('\n== copGasJudge: UN R154 §2.1.1, DF asignado ==');
['CO', 'NMHC', 'NOx', 'PM', 'PN'].forEach(id => {
    const h = HQ[id];
    const j = ctx.copGasJudge(h.raw, h.limit, h.df, 0);
    ok(id + ': Xtests = ' + h.xt, near(j.mean, h.xt), j.mean);
    ok(id + ': VAR = ' + h.vr, near(j.var, h.vr, 1e-7), j.var);
    ok(id + ': A·L − VAR/L = ' + h.bound, near(j.passBound, h.bound), j.passBound);
    ok(id + ': PASS', j.decision === 'PASS');
});
ok('DF asignados de R83/R154 (PI): CO 1.5, THC 1.3, NMHC 1.3, NOx 1.6, PM 1, PN 1',
    ['CO', 'THC', 'NMHC', 'NOx', 'PM', 'PN'].map(g => ctx.copGasDf(g, 'PI').df).join(',') === '1.5,1.3,1.3,1.6,1,1');
ok('KI = 0', ctx.copGasDf('CO', 'PI').ki === 0);
ok('CI usa su tabla (NOx 1.1)', ctx.copGasDf('NOx', 'CI').df === 1.1 && ctx.copGasDf('NOx', 'Híbrido CI').df === 1.1);
{
    const raw = [0.7, 1.3, 1.0, 1.1];   // X̄ 1.025 entre A·L − VAR/L (0.9875) y A·L − VAR/(13·L) (1.0452)
    const c = ctx.copGasJudge(raw, 1, 1, 0);
    const k = ctx.copHqCheck({ gases: [{ id: 'CO', raw, df: 1, ki: 0, limit: 1 }] }).gases[0];
    ok('entre las dos cotas = CONTINUE; la hoja de HQ escribe Fail y copHqCheck lo distingue', c.decision === 'CONTINUE' && k.sheet === 'Fail' && k.rule === 'CONTINUE', c.decision + '/' + k.sheet);
    const f = ctx.copGasJudge([1.2, 1.3, 1.25], 1, 1, 0);
    ok('sobre A·L con n = 3 = FAIL', f.decision === 'FAIL');
    ok('menos de 3 → null', ctx.copGasJudge([0.1, 0.2], 1, 1, 0) === null);
}

console.log('\n== CO₂: UN R154 §3.3.1 ==');
const CO2 = [{ vin: 'V1', measured: 118.4, target: 121 }, { vin: 'V2', measured: 120.9, target: 122 }, { vin: 'V3', measured: 126.7, target: 128 }];
const s2 = ctx.copCo2CalcStats(CO2, 1, 1);
ok('Xtests = 0.986446584', near(s2.mean, 0.9864465844171973));
ok('s = 0.0068948038', near(s2.s, 0.006894803794198358, 1e-8));
ok('A − (tP1+tP2)·s = 0.995355437', near(s2.r154.passBound, 0.9953554367411227, 1e-8));
ok('A + (tF1−tF2)·s = 1.018604715', near(s2.r154.failBound, 1.0186047151351596, 1e-8));
ok('PASS, y es el veredicto principal', s2.decision === 'PASS' && s2.principal === 'r154');

console.log('\n== copHqXlsxSpec ==');
const VINS = ['KNAAAAAAAAA000001', 'KNAAAAAAAAA000002', 'KNAAAAAAAAA000003'];
const model = {
    family: 'FAM TEST', ip: 'IP-0000000-AAA', vins: VINS,
    gases: ['CO', 'NMHC', 'NOx', 'PM', 'PN'].map(id => ({ id, limit: HQ[id].limit, df: HQ[id].df, ki: 0, raw: HQ[id].raw, isPn: id === 'PN' })),
    co2: { rows: CO2.map(r => ({ vin: r.vin, raw: r.measured, corrected: r.measured, declared: r.target })), table: ctx.COP_CO2_TABLE, evc: 1, fcf: 1 }
};
const spec = ctx.copHqXlsxSpec(model);
const cell = (sh, a1) => {
    const m = /^([A-Z]+)(\d+)$/.exec(a1); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
    const list = spec.sheets[sh].cells.filter(x => x.r === +m[2] && x.c === c); return list[list.length - 1];
};
ok('dos hojas: gases y CO₂', spec.sheets.length === 2 && spec.sheets[0].name === 'Emissions' && spec.sheets[1].name === 'CO2 Emissions');
ok('G7 = D7*$E$7+$F$7 (la de HQ)', cell(0, 'G7').f === 'D7*$E$7+$F$7');
ok('I7 = AVERAGE(G7:G9), J7 = VAR(G7:G9), L7 = K7*H7-J7/H7', cell(0, 'I7').f === 'AVERAGE(G7:G9)' && cell(0, 'J7').f === 'VAR(G7:G9)' && cell(0, 'L7').f === 'K7*H7-J7/H7');
ok('L7 calculado = 1.0499118825', near(cell(0, 'L7').v, 1.0499118825));
ok('O9 = IF(N8<P8,"Pass","Fail") → Pass', cell(0, 'O9').f === 'IF(N8<P8,"Pass","Fail")' && cell(0, 'O9').v === 'Pass');
ok('el segundo bloque empieza en la fila 11 (como en HQ)', cell(0, 'C11').v === 'NMHC' && cell(0, 'G12').f === 'D12*$E$12+$F$12');
ok('columna F (KI) oculta', spec.sheets[0].cols.some(c => c.min === 6 && c.hidden));
ok('combinaciones de HQ (B6:B?, C6:C9, E7:E9, B2:P4)', ['C6:C9', 'E7:E9', 'L7:L9', 'B2:P4'].every(r => spec.sheets[0].merges.includes(r)) && spec.sheets[0].merges.some(r => /^B6:B\d+$/.test(r)));
ok('CO₂: F7 = D7/E7, G7 = AVERAGE(F7:F9), H7 = SQRT(VAR(F7:F9))', cell(1, 'F7').f === 'D7/E7' && cell(1, 'G7').f === 'AVERAGE(F7:F9)' && cell(1, 'H7').f === 'SQRT(VAR(F7:F9))');
ok('CO₂: J7 = I7-(H18+I18)*H7 y K7 = I7+(J18-K18)*H7 (fila n = 3 de la tabla)', cell(1, 'J7').f === 'I7-(H18+I18)*H7' && cell(1, 'K7').f === 'I7+(J18-K18)*H7');
ok('CO₂: I13 = IFS(...) → PASS', /^_xlfn\.IFS\(H12<=J12,"PASS",H12>K12,"FAIL"/.test(cell(1, 'I13').f) && cell(1, 'I13').v === 'PASS');
ok('CO₂: tabla A2/3 en G16:K31', cell(1, 'G18').v === 3 && cell(1, 'H18').v === 1.686 && cell(1, 'G31').v === 16 && cell(1, 'J31').v === 0.438);
ok('el libro no trae nada de HQ (sello, pie, imágenes)', !/RESTRICTED|HMG|Hyundai Motor/i.test(JSON.stringify(spec)));

// n = 5: los bloques crecen y la fila de la tabla es la de n = 5.
{
    const v5 = VINS.concat(['KNAAAAAAAAA000004', 'KNAAAAAAAAA000005']);
    const m5 = { family: 'F5', ip: '', vins: v5, gases: [{ id: 'CO', limit: 1, df: 1.5, ki: 0, raw: [0.03, 0.02, 0.028, 0.025, 0.031] }],
        co2: { rows: [100, 102, 111, 104, 99].map((x, i) => ({ vin: v5[i], raw: x, corrected: x, declared: 104 })), table: ctx.COP_CO2_TABLE, evc: 1, fcf: 1 } };
    const sp = ctx.copHqXlsxSpec(m5);
    const g = (sh, r, c) => sp.sheets[sh].cells.filter(x => x.r === r && x.c === c).pop();
    ok('n = 5: AVERAGE(G7:G11)', g(0, 7, 9).f === 'AVERAGE(G7:G11)');
    ok('n = 5: la fila de t es la de n = 5 (tabla en 18, n = 5 en 22)', g(1, 7, 10).f === 'I7-(H22+I22)*H7' && g(1, 22, 7).v === 5);
    const j5 = ctx.copGasJudge([0.03, 0.02, 0.028, 0.025, 0.031], 1, 1.5, 0);
    ok('n = 5: la hoja y copGasJudge dan la misma cota', near(g(0, 7, 12).v, j5.passBound));
    const c5 = ctx.copCo2CalcStats([100, 102, 111, 104, 99].map((x, i) => ({ measured: x, target: 104 })), 1, 1);
    ok('n = 5: CO₂ de la hoja = copCo2CalcStats (R154)', near(g(1, 7, 10).v, c5.r154.passBound) && near(g(1, 7, 11).v, c5.r154.failBound));
}

console.log('\n== copHqModelFor (juicio guardado) ==');
{
    const j = { id: 'j1', familyKey: 'K', familyLabel: 'FAM', fuelType: 'PI', method: 'r154-2.1.1', decision: 'PASS',
        limitsUsed: [{ id: 'CO', limit: 1, unit: 'g/km' }, { id: 'NOx', limit: 0.06, unit: 'g/km' }],
        stats: [{ id: 'CO', df: 1.5, ki: 0 }, { id: 'NOx', df: 1.6, ki: 0 }],
        vehicles: VINS.map((v, i) => ({ vin: v, values: { CO: String(HQ.CO.raw[i]), NOx: String(HQ.NOx.raw[i]) } })),
        co2: { decision: 'PASS', fcf: 1.02, evc: 0.98, rows: CO2.map((r, i) => ({ vin: VINS[i], measured: r.measured, target: r.target })) } };
    const r = ctx.copHqModelFor(j);
    ok('toma CO y NOx de la mesa congelada', r.model.gases.map(g => g.id).join(',') === 'CO,NOx');
    ok('THC/NMHC sin valores y no activos: no avisa; PM/PN sin VETS: avisa', !r.warnings.some(w => /^THC|^NMHC/.test(w)) && r.warnings.some(w => /^PM/.test(w)) && r.warnings.some(w => /^PN/.test(w)));
    ok('CO₂ corregido = medido × EvC × FCF', near(r.model.co2.rows[0].corrected, 118.4 * 0.98 * 1.02));
    const sp = ctx.copHqXlsxSpec(r.model);
    const d7 = sp.sheets[1].cells.find(x => x.r === 7 && x.c === 4);
    ok('con EvC/FCF el corregido es fórmula visible (C7*0.98*1.02)', d7.f === 'C7*0.98*1.02');
    const viejo = ctx.copHqModelFor(Object.assign({}, j, { method: undefined }));
    ok('un juicio del método anterior lo avisa', viejo.warnings.some(w => /método anterior/.test(w)));
}

// ── LibreOffice: abrir, recalcular y comparar ──
console.log('\n== Recalculado con LibreOffice ==');
let soffice = null;
try { soffice = execFileSync('which', ['soffice']).toString().trim(); } catch (e) {}
if (!soffice) {
    console.log('  (sin LibreOffice: se omite)');
    finish();
} else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cophq-'));
    const xlsx = path.join(dir, 'hq.xlsx');
    fs.writeFileSync(xlsx, Buffer.from(ctx.xwBuild(spec)));
    const prof = path.join(dir, 'prof');
    fs.mkdirSync(path.join(prof, 'user'), { recursive: true });
    fs.writeFileSync(path.join(prof, 'user', 'registrymodifications.xcu'),
        '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item></oor:items>');
    try {
        execFileSync(soffice, ['-env:UserInstallation=file://' + prof, '--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', path.join(dir, 'out'), xlsx], { stdio: 'pipe', timeout: 120000 });
        const out = fs.readFileSync(path.join(dir, 'out', 'hq.xlsx'));
        const files = unzip(out);
        const sst = (files['xl/sharedStrings.xml'] || '').match(/<si>[\s\S]*?<\/si>/g) || [];
        const strs = sst.map(x => (x.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
        let checked = 0, bad = [];
        spec.sheets.forEach((sh, i) => {
            const xml = files['xl/worksheets/sheet' + (i + 1) + '.xml'];
            sh.cells.filter(c => c.f).forEach(c => {
                const a1 = ctx.xwRef(c.r, c.c);
                const m = new RegExp('<c r="' + a1 + '"([^>]*)>([\\s\\S]*?)</c>').exec(xml);
                if (!m) { bad.push(a1 + ' falta'); return; }
                const v = (/<v>([\s\S]*?)<\/v>/.exec(m[2]) || [])[1];
                let got = v;
                if (/t="s"/.test(m[1])) got = strs[+v];
                else if (!/t="str"/.test(m[1])) got = parseFloat(v);
                if (typeof c.v === 'number' ? !near(got, c.v, 1e-9) : String(got).replace('&lt;', '<').replace('&gt;', '>') !== String(c.v)) bad.push(sh.name + '!' + a1 + ' LibreOffice=' + got + ' app=' + c.v);
                checked++;
            });
        });
        ok('LibreOffice recalcula cada fórmula al mismo valor que escribió la app (' + checked + ' fórmulas)', !bad.length && checked > 30, bad.join('; '));
    } catch (e) {
        ok('LibreOffice abrió el libro', false, e.message);
    }
    finish();
}

function unzip(buf) {
    // Por el directorio central: LibreOffice escribe los tamaños en el descriptor de datos.
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

function finish() {
    console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
    if (fallaron) process.exitCode = 1;
}
