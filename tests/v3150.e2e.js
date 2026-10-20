// Verificación en navegador de 3.15.0: la hoja de evaluación estadística de HQ.
//  - El Validador pinta la regla nueva (Xtests, DF, cotas) sin errores.
//  - "📤 Excel HQ" de un juicio guardado descarga un .xlsx con las dos hojas y los números
//    del juicio; el Expediente ofrece el mismo botón.
//  - Un juicio del método anterior (R83) avisa al descargar.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const KEY = 'CL4|1600CC GAMMA-II|7DCT|26 MODEL|PRE-EURO 7||LOW POWER|5DR';
    const LABEL = 'CL4 · 1600CC GAMMA-II · 7DCT · 26 MODEL · PRE-EURO 7 · LOW POWER · 5DR';
    const VINS = ['3KPFX51C0TE000001', '3KPFX51C7TE000002', '3KPFX51C8TE000003'];
    const vals = [{ CO: '0.0596', THC: '0.009', NMHC: '0.0056', NOx: '0.0016' },
                  { CO: '0.0796', THC: '0.01', NMHC: '0.0065', NOx: '0.0019' },
                  { CO: '0.0815', THC: '0.0097', NMHC: '0.0059', NOx: '0.0025' }];
    const lim = [{ id: 'CO', label: 'CO', limit: 1, unit: 'g/km' }, { id: 'THC', label: 'THC', limit: 0.1, unit: 'g/km' },
                 { id: 'NMHC', label: 'NMHC', limit: 0.068, unit: 'g/km' }, { id: 'NOx', label: 'NOₓ', limit: 0.06, unit: 'g/km' }];
    const nuevo = {
        id: 'cop_nuevo', date: '2026-10-20T15:00:00.000Z', by: 'Ana', region: 'EUROPE', familyKey: KEY, familyLabel: LABEL,
        regulation: 'R154', fuelType: 'PI', emissionReg: 'PRE-EURO 7', activePolls: { CO: true, THC: true, NMHC: true, NOx: true },
        vehicles: VINS.map((v, i) => ({ id: i + 1, vin: v, values: vals[i], source: 'auto' })), limitsUsed: lim,
        method: 'r154-2.1.1', stats: lim.map(l => ({ poll: l.label, id: l.id, df: { CO: 1.5, THC: 1.3, NMHC: 1.3, NOx: 1.6 }[l.id], ki: 0 })),
        co2: { n: 3, decision: 'PASS', fcf: 1.0213, evc: 0.98,
               rows: [[138.533, 142], [140.6361, 145], [141.8026, 144]].map((r, i) => ({ vin: VINS[i], measured: r[0], target: r[1] })) },
        decision: 'PASS'
    };
    const viejo = Object.assign({}, nuevo, { id: 'cop_viejo', date: '2026-09-01T15:00:00.000Z', method: undefined,
        stats: lim.map(l => ({ poll: l.label, U: -100, a: -0.86, b: 2.117, n: 3, decision: 'PASS' })), co2: { decision: 'PASS', fcf: 1, evc: 1 } });
    localStorage.setItem('kia_cop_v1', JSON.stringify({ view: 'validator', regulation: 'R154', fuelType: 'PI', region: 'EUROPE',
        familyKey: KEY, familyLabel: LABEL, activePolls: nuevo.activePolls, vehicles: nuevo.vehicles, saved: [nuevo, viejo] }));
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Signatario', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

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

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);
    await page.evaluate(() => { dashGo('cop'); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { copSetView('validator'); });
    await page.waitForTimeout(600);

    console.log('\n== Validador ==');
    const v = await page.evaluate(() => {
        const t = document.body.innerText;
        return { xt: /Xtests \(con DF\)/i.test(t), df: /Regla de la norma y DF asignados/.test(t), viejo: /A\(n\)\/B\(n\)/.test(t),
                 btns: document.querySelectorAll('button[onclick^="copHqXlsxExport"]').length };
    });
    chk('la tabla de estadística dice Xtests (con DF)', v.xt);
    chk('la tarjeta de la regla y los DF asignados', v.df);
    chk('un botón 📤 Excel HQ por juicio guardado', v.btns === 2, String(v.btns));

    console.log('\n== Descarga ==');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }),
        page.click('button[onclick="copHqXlsxExport(\'cop_nuevo\')"]')]);
    const file = path.join(require('os').tmpdir(), 'v3150-hq.xlsx');
    await dl.saveAs(file);
    chk('nombre CoP_HQ_<familia>_<fecha>.xlsx', /^CoP_HQ_CL4_.*_2026-10-20\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    const z = unzip(fs.readFileSync(file));
    chk('dos hojas: Emissions y CO2 Emissions', /name="Emissions"/.test(z['xl/workbook.xml']) && /name="CO2 Emissions"/.test(z['xl/workbook.xml']));
    const s1 = z['xl/worksheets/sheet1.xml'] || '';
    chk('G7 = D7*$E$7+$F$7 con EM = 0.0596 × 1.5', /<c r="G7"[^>]*><f>D7\*\$E\$7\+\$F\$7<\/f><v>0\.0894/.test(s1));
    chk('L7 = K7*H7-J7/H7', /<c r="L7"[^>]*><f>K7\*H7-J7\/H7<\/f>/.test(s1));
    const s2 = z['xl/worksheets/sheet2.xml'] || '';
    chk('CO₂ corregido con EvC y FCF (C7*0.98*1.0213)', /<f>C7\*0\.98\*1\.0213<\/f>/.test(s2));
    chk('CO₂: I13 = IFS → PASS', /<c r="I13"[^>]*t="str"><f>_xlfn\.IFS[^<]*<\/f><v>PASS<\/v>/.test(s2));
    const aud = await page.evaluate(() => (typeof _auditEnsureLoaded === 'function' ? _auditEnsureLoaded() : []).filter(a => a.action === 'cop_hq_xlsx').length);
    chk('queda en el historial de cambios (cop_hq_xlsx)', aud === 1, String(aud));

    console.log('\n== Juicio anterior a 3.15.0 ==');
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }),
        page.click('button[onclick="copHqXlsxExport(\'cop_viejo\')"]')]);
    await page.waitForTimeout(300);
    const toast = await page.evaluate(() => Array.from(document.querySelectorAll('.toast, .toast-container *')).map(e => e.innerText).join(' | '));
    chk('descarga y avisa que es del método anterior', !!dl2 && /método anterior/.test(toast), toast.slice(0, 200));

    console.log('\n== Expediente ==');
    await page.evaluate(() => { copSetView('dossier'); });
    await page.waitForTimeout(500);
    const exp = await page.evaluate(() => !!document.querySelector('button[onclick="copHqXlsxExport(\'cop_nuevo\')"]'));
    chk('Expediente → 📤 Excel para HQ con el juicio más reciente', exp);

    chk('sin errores de página', !errores.length, errores.join(' | '));
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLAS' : '\nTodo bien');
    if (fallos.length) process.exitCode = 1;
})();
