// Verificación en navegador de 2.28.0 — CO₂: el cálculo paso a paso.
// Familia de la captura del laboratorio (FCF 1.0168, EvC 0.98): los dos desgloses
// aparecen plegados, se abren, y se recalculan al teclear FCF sin mover el veredicto.
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
};

const ESCENARIO = () => {
    const F = [['3KPFX51B7TE431949', 126.4, 132.0], ['3KPFX51BXTE433243', 130.5, 131.0], ['3KPFX51B5TE433246', 125.9, 131.0]];
    db.vehicles = F.map((f, i) => ({
        id: nextVehicleId(), vin: f[0], status: 'archived', config: { REGION: 'EUROPE' }, timeline: [],
        registeredAt: new Date().toISOString(), homolog: { co2Target: f[2], mcCode: 'E2E' + i },
        testData: { gasResults: { liberador: { values: { CO2: f[1] } } } } }));
    saveDB();
    copState.view = 'validator';
    copState.familyKey = 'E2E|FAM';
    copState.familyLabel = 'E2E';
    _copSetVehicles(F.map((f, i) => ({ id: i + 1, vin: f[0], values: {}, source: 'manual' })));
    const fam = copFamilyState('E2E|FAM'); fam.co2Fcf = 1.0168; fam.co2Evc = 0.98;
    switchPlatform('cop');
    copRender();
};

const leer = () => {
    const host = document.getElementById('cop-co2-steps');
    const d = host ? host.querySelectorAll('details') : [];
    return {
        host: !!host, n: d.length, open: Array.from(d).map(x => x.open),
        txt: host ? host.innerText.replace(/\s+/g, ' ') : '',
        verdict: (document.querySelector('.cop-co2-conclusion') || {}).innerText || ''
    };
};

async function recorrido(page, etiqueta) {
    console.log('\n== ' + etiqueta + ' ==');
    await page.evaluate(ESCENARIO);
    await page.waitForTimeout(500);
    let s = await page.evaluate(leer);
    chk('aparecen los dos desgloses, plegados', s.host && s.n === 2 && !s.open[0] && !s.open[1], JSON.stringify(s.open));

    await page.click('#cop-co2-steps details:nth-of-type(1) > summary');
    await page.click('#cop-co2-steps details:nth-of-type(2) > summary');
    await page.waitForTimeout(200);
    s = await page.evaluate(leer);
    chk('se abren al tocarlos', s.open[0] && s.open[1]);
    chk('Apéndice I: X̄ = 0.968174 y A − VAR = 1.009547', /0\.968174/.test(s.txt) && /1\.009547/.test(s.txt), s.txt.slice(0, 400));
    chk('R154: límite para aceptar 0.964806', /0\.964806/.test(s.txt), s.txt);

    await page.fill('#cop-co2-fcf', '1.05');
    await page.waitForTimeout(200);
    const s2 = await page.evaluate(leer);
    chk('al teclear FCF el desglose se recalcula (vista previa)', /Vista previa con FCF = 1\.05/.test(s2.txt) && /× 0\.98 × 1\.05 =/.test(s2.txt), s2.txt.slice(0, 300));
    chk('el veredicto de arriba NO cambia sin guardar', s2.verdict === s.verdict);
    chk('el desglose sigue abierto tras recalcular', s2.open[0] && s2.open[1]);

    await page.fill('#cop-co2-fcf', '');
    await page.waitForTimeout(150);
    const s3 = await page.evaluate(leer);
    chk('un FCF vacío avisa y usa el guardado', /mayores a 0/.test(s3.txt) && /0\.968174/.test(s3.txt));

    const anchoOk = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    chk('sin desborde horizontal de la página', anchoOk);
}

let browser;
(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1920, height: 1017, et: 'Escritorio 1920×1017' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(3000);
        await recorrido(page, vp.et);
        if (process.env.E2E_SHOT) {
            await page.locator('#cop-co2-steps').scrollIntoViewIfNeeded();
            await page.fill('#cop-co2-fcf', '1.0168');
            await page.waitForTimeout(400);
            await page.locator('#cop-co2-steps').screenshot({ path: process.env.E2E_SHOT + '-' + vp.width + '.png' });
        }
        chk('sin errores de página (' + vp.et + ')', !errores.length, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien') + '\n');
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); if (browser) browser.close(); process.exit(1); });
