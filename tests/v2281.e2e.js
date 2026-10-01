// Verificación en navegador de 2.28.1 — Control SPC con la red que bloquea CDNs.
// El entorno de pruebas no alcanza cdnjs (igual que la red del laboratorio): antes de
// 2.28.1 Chart.js no existía y las dos cartas SPC salían en blanco sin aviso.
const { chromium } = require('playwright');
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
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

const ESCENARIO = () => {
    const cfg = { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1600cc', 'TRANSMISSION': '6AT', 'MODEL YEAR (VIN)': '26',
                  'EMISSION REGULATION': 'PRE-EURO 7', 'REGION': 'EUROPE', 'BODY TYPE': '5DR', 'ENVIRONMENT PACKAGE': 'MILD HEV', 'ENGINE PACKAGE': '0' };
    db.vehicles = [[119, 0.2], [122, 0.25], [120.5, 0.18]].map((g, i) => ({
        id: nextVehicleId(), vin: 'VINSPC' + i, status: 'archived', config: cfg, timeline: [], registeredAt: new Date().toISOString(),
        testData: { gasResults: { liberador: { values: { CO2: g[0], CO: g[1] }, capturedAt: '2026-09-2' + i + 'T10:00:00Z' } } } }));
    saveDB();
    if (typeof copInvalidateCache === 'function') copInvalidateCache();
    switchPlatform('cop');
    copSetView('spc');
    copSpcSelectGas('CO2');
};

const LEER = () => {
    const c = document.getElementById('cop-spc-ichart'), m = document.getElementById('cop-spc-mrchart');
    return { chart: typeof Chart, ichart: !!window._copSpcIChart, mr: !!window._copSpcMrChart,
             iW: c ? c.width : 0, mW: m ? m.width : 0,
             fail: Array.from(document.querySelectorAll('.cop-spc-chart-fail')).map(e => e.innerText) };
};

let browser;
(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1920, height: 1017, et: 'Escritorio 1920×1017' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
        console.log('\n== ' + vp.et + ' ==');
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        // Sin red a CDNs, como en el laboratorio.
        await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/, r => r.abort());
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(3000);
        await page.evaluate(ESCENARIO);
        await page.waitForTimeout(800);
        let s = await page.evaluate(LEER);
        chk('Chart.js carga sin CDN (vendor/)', s.chart === 'function', s.chart);
        chk('la carta I y la carta MR se dibujan', s.ichart && s.mr && s.iW > 0 && s.mW > 0, JSON.stringify(s));
        chk('sin aviso de falla cuando todo está bien', !s.fail.length, s.fail.join(' | '));

        // Si la librería faltara, la tarjeta lo dice en vez de quedarse en blanco.
        await page.evaluate(() => { window.__Chart = window.Chart; delete window.Chart; copRender(); });
        await page.waitForTimeout(300);
        s = await page.evaluate(LEER);
        chk('sin Chart.js: lo dice en el lugar de las dos cartas', s.fail.length === 2 && /librería de gráficas/.test(s.fail[0]), s.fail.join(' | '));

        // Si Chart.js truena al crearla, también lo dice (y queda para el 🐞).
        await page.evaluate(() => { window.Chart = function() { throw new Error('prueba E2E'); }; copRender(); });
        await page.waitForTimeout(300);
        s = await page.evaluate(LEER);
        const rec = await page.evaluate(() => (window._bugRecentErrors || []).some(e => /prueba E2E/.test(e.message)));
        chk('un error al dibujar se muestra y se registra para el reporte', s.fail.length === 2 && /prueba E2E/.test(s.fail[0]) && rec, s.fail.join(' | '));
        await page.evaluate(() => { window.Chart = window.__Chart; });

        chk('sin errores de página (' + vp.et + ')', !errores.length, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien') + '\n');
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); if (browser) browser.close(); process.exit(1); });
