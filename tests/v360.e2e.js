// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.6.0 — Instrumentos en calibración                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Un instrumento vencido se marca "En calibración": deja de alertar como vencido y al
// regresar (↩ Regresó) vuelve a su estado normal.
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
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 1, vehicles: [] }));
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
    await page.waitForFunction(() => typeof invCalSendOut === 'function' && typeof dashGo === 'function' && typeof invState !== 'undefined', null, { timeout: 15000 });
    await page.waitForTimeout(600);
    // Un instrumento vencido de prueba, con id propio.
    await page.evaluate(() => {
        invState.equipment.push({ id: 'e2e-cal', name: 'Sensor E2E', magnitude: 'Humedad E2E', requiresCal: 'Si', calFreq: 'Anual',
                                  lastCalDate: '2025-01-10', nextCalDate: '2026-01-10' });
        invSave();
        window._invEqFilter = 'all';
        dashGo('inventory', 'inv-equipment');
    });
    await page.waitForTimeout(700);
    const venc = () => page.evaluate(() => pnGetActiveAlerts().filter(a => /Sensor E2E/.test(a.message || a.msg || JSON.stringify(a))).map(a => a.kind));
    ok('antes: alerta de calibración vencida', (await venc()).some(k => /cal-vencida/.test(k)), JSON.stringify(await venc()));

    const fila = page.locator('div', { hasText: 'Humedad E2E' }).filter({ has: page.locator('button', { hasText: 'En calibración' }) }).last();
    await fila.locator('button', { hasText: 'En calibración' }).click();
    await page.waitForTimeout(300);
    await page.fill('#inv-calout-back', '2099-12-31');
    await page.fill('#inv-calout-prov', 'METROLAB');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v360-modal.png') });
    await page.click('#invModal button:has-text("Enviar")');
    await page.waitForTimeout(600);

    const st = await page.evaluate(() => invCalStatus(invState.equipment.find(e => e.id === 'e2e-cal')));
    ok('queda "En calibración" con su regreso', st.code === 'encalibracion' && /regresa 31\/12/.test(st.label), JSON.stringify(st));
    ok('ya no alerta como vencido', (await venc()).length === 0, JSON.stringify(await venc()));
    const txt = await page.locator('#inv-content, body').first().textContent();
    ok('la lista lo muestra y ofrece "↩ Regresó"', /En calibración · regresa 31\/12/.test(txt) && /Regresó/.test(txt));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v360-lista.png') });

    // Sin nada vencido, el grupo queda plegado (como cualquier grupo al día): se abre.
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { if (/Humedad E2E/.test(d.textContent)) d.open = true; }));
    const fila2 = page.locator('div', { hasText: 'Humedad E2E' }).filter({ has: page.locator('button', { hasText: 'Regresó' }) }).last();
    await fila2.locator('button', { hasText: 'Regresó' }).click();
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: 'Sí, regresó' }).click();
    await page.waitForTimeout(600);
    const st2 = await page.evaluate(() => invCalStatus(invState.equipment.find(e => e.id === 'e2e-cal')).code);
    ok('"Regresó" lo devuelve a vencido', st2 === 'vencido', st2);

    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallas ? fallas + ' FALLAS' : 'todo ok'));
    process.exitCode = fallas ? 1 : 0;
})();
