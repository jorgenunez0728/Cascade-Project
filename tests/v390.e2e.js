// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.9.0 — Training: una prueba que pide poco                           ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Propósito "Training" en Otras actividades. Operación pide solo fecha, Errores, Violations,
// IWR % y si se midieron gases; con gases, Fuel Economy y CO₂. No entra al plan ni al REQ.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS_DIR || '';

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const SEED = () => {
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: '2099-01-01T00:00:00.000Z' }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 1, vehicles: [{
        id: 5151, vin: 'KNDJ23AU0T7005151', status: 'in-progress', purpose: 'Training', registeredAt: '2026-10-14T10:00:00.000Z',
        configCode: 'CL4-26 MODEL-5DR', config: { 'Modelo': 'CL4', 'REGION': 'MEXICO', 'EMISSION REGULATION': 'SULEV 30', 'BODY TYPE': '5DR' },
        timeline: [], testData: {} }] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof trainingFromForm === 'function' && typeof dashGo === 'function' && typeof db !== 'undefined', null, { timeout: 15000 });
    await page.waitForTimeout(600);

    // Alta: "Training" está en Otras actividades.
    await page.evaluate(() => dashGo('cop15', 'alta'));
    await page.waitForTimeout(400);
    const grupo = await page.evaluate(() => { const o = document.querySelector('#vehiclePurpose option[value="Training"]'); return o && o.parentElement.label; });
    ok('Alta: "Training" está en Otras actividades', grupo === 'Otras actividades', grupo);

    // Operación
    await page.evaluate(() => cascadeOpenInOperation(5151));
    await page.waitForTimeout(800);
    const vis = await page.evaluate(() => ({
        tr: getComputedStyle(document.getElementById('training-block')).display !== 'none',
        op: getComputedStyle(document.getElementById('simple-operator-group')).display !== 'none',
        gas: getComputedStyle(document.getElementById('tr-gases-block')).display !== 'none',
        lbl: document.getElementById('simple-datetime-label').textContent }));
    ok('Operación muestra Training, sin operador y con "Fecha de la prueba"', vis.tr && !vis.op && vis.lbl === 'Fecha de la prueba', JSON.stringify(vis));
    ok('FE y CO₂ ocultos hasta decir que se midieron gases', !vis.gas);

    // Listo para liberar con todo vacío → pide lo que falta
    await page.evaluate(() => { const s = document.getElementById('op_status'); s.value = 'ready-release'; handleStatusChange(s); });
    await page.waitForTimeout(300);
    const pop = await page.evaluate(() => (document.querySelector('#globalModal') || document.body).innerText);
    ok('sin datos no pasa a "Listo para liberación" y dice qué falta', /Errores/.test(pop) && /Violations/.test(pop) && /IWR/.test(pop) && !/Operador/.test(pop), pop.slice(0, 300));
    await page.evaluate(() => { const g = document.getElementById('globalModal'); if (g) g.remove(); document.querySelectorAll('.missing-popup, .modal-overlay').forEach(x => x.style.display = 'none'); });

    ok('el bloque de la prueba ya viene abierto (es el único)', await page.evaluate(() => document.getElementById('op-simple-block').open));
    await page.fill('#simple_datetime', '2026-10-14T09:30');
    await page.fill('#tr_errors', '2');
    await page.fill('#tr_violations', '0');
    await page.fill('#tr_iwr', '1.4');
    await page.locator('#tr_gases + .ui-chips button', { hasText: 'Sí' }).click();
    await page.waitForTimeout(200);
    ok('al decir "Sí" aparecen Fuel Economy y CO₂', await page.evaluate(() => getComputedStyle(document.getElementById('tr-gases-block')).display !== 'none'));
    await page.fill('#tr_fe', '15.2');
    await page.fill('#tr_co2', '145');
    await page.selectOption('#tr_co2_unit', 'g/mi');
    if (SHOTS) await page.locator('#op-simple-block').screenshot({ path: path.join(SHOTS, 'v390-operacion.png') });
    await page.evaluate(() => { const s = document.getElementById('op_status'); s.value = 'ready-release'; handleStatusChange(s); saveProgress(); });
    await page.waitForTimeout(600);
    const v = await page.evaluate(() => { const x = db.vehicles.find(y => y.id === 5151); return { st: x.status, s: x.testData.simple }; });
    ok('se guarda el resultado y pasa a Listo para liberación', v.st === 'ready-release' && v.s.datetime === '2026-10-14T09:30' &&
        v.s.training.errors === 2 && v.s.training.violations === 0 && v.s.training.iwrPct === 1.4 && v.s.training.gases === 'yes' &&
        v.s.training.fe === 15.2 && v.s.training.feUnit === 'km/L' && v.s.training.co2 === 145 && v.s.training.co2Unit === 'g/mi', JSON.stringify(v));

    // Liberación muestra el resultado
    await page.evaluate(() => dashGo('cop15', 'liberacion'));
    await page.waitForTimeout(500);
    await page.evaluate(() => { const s = document.getElementById('releaseVehSelect'); if (s) { s.value = '5151'; s.dispatchEvent(new Event('change', { bubbles: true })); if (typeof loadRelease === 'function') loadRelease(); } });
    await page.waitForTimeout(500);
    const sum = await page.evaluate(() => (document.getElementById('testSummary') || {}).innerText || '');
    ok('Liberación muestra Errores, Violations, IWR, FE y CO₂', /Errores: 2/.test(sum) && /Violations: 0/.test(sum) && /IWR: 1.4 %/.test(sum) && /15.2 km\/L/.test(sum) && /145 g\/mi/.test(sum), sum);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v390-liberacion.png'), fullPage: false });

    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' falla(s)' : '\nTodo bien');
    process.exitCode = fallas ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
