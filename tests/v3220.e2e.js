// Verificación en navegador de 3.22.0 — Comparar pruebas.
// (1) Historial: seleccionar 2 → ⚖️ Comparar → tabla lado a lado con lo que se aparta marcado.
// (2) Excel y PDF de la comparación se descargan.
// (3) Más de 6 seleccionadas: el botón dice por qué no.
// (4) Ficha del vehículo → "Comparar con…" abre la comparación del re-test.
// A 427 px y a 1920 px, sin desbordar la página ni errores.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const ahora = Date.now();
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    const cfg = { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1600CC GAMMA-II', 'EMISSION REGULATION': 'EURO-5', 'BODY TYPE': '5DR',
                  'REGION': 'EUROPE', 'TRANSMISSION': 'IVT', 'MODEL YEAR (VIN)': '26 MODEL', 'ENGINE PACKAGE': '0' };
    const veh = (id, vin, day, vals, dynoA) => ({
        id, vin, status: 'archived', purpose: 'COP-Emisiones', configCode: 'CL4-EU5', config: Object.assign({}, cfg),
        registeredAt: '2026-10-' + day + 'T08:00:00.000Z', archivedAt: '2026-10-' + day + 'T18:00:00.000Z', timeline: [],
        testData: { testDatetime: '2026-10-' + day + 'T10:00', etw: 1612.7, targetA: 120.5, dynoA, targetB: 0.51, dynoB: 0.22,
            gasResults: { liberador: { values: vals }, aprobador: { values: vals } },
            signatures: { releaser: { signerName: 'Beto Técnico' }, approver: { signerName: 'Ana Manager' } } } });
    const vs = [
        veh('veh_1', 'KNACMP00000000001', '05', { CO: 0.20, CO2: 140, THC: 0.05, NOx: 0.020, NMHC: 0.03 }, 80),
        veh('veh_2', 'KNACMP00000000001', '12', { CO: 0.21, CO2: 147, THC: 0.05, NOx: 0.035, NMHC: 0.03 }, 92)
    ];
    for (let i = 3; i <= 8; i++) vs.push(veh('veh_' + i, 'KNACMP0000000000' + i, '0' + (i - 2), { CO: 0.2, CO2: 141, THC: 0.05, NOx: 0.02, NMHC: 0.03 }, 80));
    localStorage.setItem('kia_db_v11', JSON.stringify({ version: '11.0', lastId: 9, vehicles: vs }));
};

async function probar(browser, ancho, alto) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, isMobile: ancho < 800, hasTouch: ancho < 800, acceptDownloads: true });
    await ctx.addInitScript(SEED);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
    await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
    await page.waitForFunction(() => typeof bootStageNow === 'function' && bootStageNow() === 'lista', null, { timeout: 20000 });
    await page.waitForTimeout(600);

    console.log('\n== ' + ancho + ' px: Historial → ⚖️ Comparar ==');
    await page.evaluate(() => dashGo('cop15', 'dashboard'));
    await page.waitForTimeout(700);
    const sinSel = await page.evaluate(() => getComputedStyle(document.getElementById('batchCompareBtn')).display);
    chk('sin selección el botón no se ofrece', sinSel === 'none', sinSel);
    await page.evaluate(() => { histSelToggle('veh_1', true); histSelToggle('veh_2', true); });
    await page.waitForTimeout(200);
    const btn = await page.evaluate(() => { const b = document.getElementById('batchCompareBtn'); return { d: getComputedStyle(b).display, dis: b.disabled }; });
    chk('con 2 seleccionadas se ofrece ⚖️ Comparar', btn.d !== 'none' && !btn.dis, JSON.stringify(btn));
    await page.click('#batchCompareBtn');
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => {
        const box = document.querySelector('.custom-modal-box--wide');
        const tr = [...document.querySelectorAll('.cmp-table tbody tr')];
        const fila = l => tr.find(r => (r.querySelector('th') || {}).textContent && r.querySelector('th').textContent.trim().startsWith(l));
        const nox = fila('NOx'), co = fila('CO '), dA = fila('Dyno A'), etw = fila('ETW');
        const r = box ? box.getBoundingClientRect() : null;
        return {
            box: !!box, cols: document.querySelectorAll('.cmp-vin').length,
            noxDiffers: !!(nox && nox.classList.contains('is-differs')), noxMax: !!(nox && nox.querySelector('.is-max')),
            coDiffers: !!(co && co.classList.contains('is-differs')),
            dynoA: !!(dA && dA.classList.contains('is-differs')), etw: !!(etw && etw.classList.contains('is-differs')),
            pct: nox ? nox.textContent : '',
            libero: document.querySelector('.cmp-table') ? /Beto Técnico/.test(document.querySelector('.cmp-table').textContent) : false,
            dentro: r ? (r.left >= -1 && r.right <= innerWidth + 1) : false,
            pagina: document.documentElement.scrollWidth <= innerWidth + 1
        };
    });
    chk('se abre la comparación en un diálogo ancho con una columna por prueba', t.box && t.cols === 2, JSON.stringify(t));
    chk('NOx 33 % vs 58 % del límite se marca y señala el máximo', t.noxDiffers && t.noxMax && /33%/.test(t.pct) && /58%/.test(t.pct), t.pct);
    chk('CO (1 punto) no se marca', !t.coDiffers);
    chk('dinamómetro: Dyno A 80 vs 92 se marca; ETW igual no', t.dynoA && !t.etw);
    chk('dice quién liberó', t.libero);
    chk('el diálogo cabe en la pantalla y la página no desborda', t.dentro && t.pagina);

    const [dx] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }),
        page.evaluate(() => { [...document.querySelectorAll('#globalModal button')].find(b => /Excel/.test(b.textContent)).click(); })]);
    const px = await dx.path();
    const bx = fs.readFileSync(px);
    chk('⬇ Excel descarga un .xlsx válido', /^Comparar_pruebas_.*\.xlsx$/.test(dx.suggestedFilename()) && bx[0] === 0x50 && bx[1] === 0x4b && bx.length > 1500,
        dx.suggestedFilename() + ' ' + bx.length);
    const [dp] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }),
        page.evaluate(() => { [...document.querySelectorAll('#globalModal button')].find(b => /PDF/.test(b.textContent)).click(); })]);
    const bp = fs.readFileSync(await dp.path());
    chk('🖨️ PDF descarga un PDF', /\.pdf$/.test(dp.suggestedFilename()) && bp.slice(0, 5).toString() === '%PDF-', dp.suggestedFilename());
    const aud = await page.evaluate(() => (auditGetView ? auditGetView() : []).some(e => e.action === 'pruebas_comparadas'));
    chk('la comparación queda en el historial de cambios', aud);
    await page.evaluate(() => { [...document.querySelectorAll('#globalModal button')].find(b => /Cerrar/.test(b.textContent)).click(); });
    await page.waitForTimeout(300);
    chk('Cerrar cierra el diálogo', await page.evaluate(() => !document.querySelector('.custom-modal-box--wide') ||
        getComputedStyle(document.getElementById('globalModal')).display === 'none'));

    console.log('\n== ' + ancho + ' px: más de 6 ==');
    await page.evaluate(() => { for (let i = 1; i <= 8; i++) histSelToggle('veh_' + i, true); });
    await page.waitForTimeout(200);
    const m7 = await page.evaluate(() => { const b = document.getElementById('batchCompareBtn'); return { dis: b.disabled, why: b.getAttribute('data-why') || '' }; });
    chk('con 8 seleccionadas el botón se deshabilita y dice por qué', m7.dis && /6/.test(m7.why), JSON.stringify(m7));
    await page.evaluate(() => histSelClear());

    console.log('\n== ' + ancho + ' px: ficha → Comparar con… ==');
    await page.evaluate(() => fichaOpen('vehiculo', 'veh_2'));
    await page.waitForTimeout(600);
    const f = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /Re-test del mismo VIN/.test(x.textContent));
        const fam = [...document.querySelectorAll('button')].some(x => /más recientes de su familia/.test(x.textContent));
        if (b) b.click();
        return { retest: !!b, fam };
    });
    await page.waitForTimeout(500);
    const f2 = await page.evaluate(() => ({ cols: document.querySelectorAll('.cmp-vin').length, ficha: !!document.querySelector('.ficha-sheet.is-open, .ficha-sheet[open]') }));
    chk('la ficha ofrece el re-test y la familia', f.retest && f.fam, JSON.stringify(f));
    chk('tocar el re-test abre la comparación de las dos pruebas', f2.cols === 2, JSON.stringify(f2));

    chk('sin errores ni diálogos nativos', errores.length === 0, errores.join(' | '));
    await ctx.close();
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    try {
        await probar(browser, 427, 840);
        await probar(browser, 1920, 1017);
    } finally { await browser.close(); }
    console.log('\n' + (fallos.length ? fallos.length + ' fallaron:\n - ' + fallos.join('\n - ') : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})();
