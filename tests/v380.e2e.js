// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.8.0 — Corregir una prueba de formato simple (OBD II) archivada     ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Una OBD II archivada sin fecha no tenía forma de corregirse: Completar solo existía para
// emisiones. Ahora sale "📝 Completar (1)", pide los campos del formato simple y el
// Historial muestra la fecha de la prueba. El menú ⋯ ofrece corregir aunque no falte nada.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS_DIR || '';

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const VIN = '3KPFU5DE6TE292900';
const SEED = (vin) => {
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: '2099-01-01T00:00:00.000Z' }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    const sig = { releaser: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', signerName: 'Ana Signataria', signedAt: '2026-02-24T12:00:00.000Z' } };
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 1, vehicles: [{
        id: 4242, vin: vin, status: 'archived', purpose: 'EO-OBD2', registeredAt: '2026-02-23T10:00:00.000Z',
        archivedAt: '2026-02-24T13:00:00.000Z', configCode: 'CL4-26 MODEL-5DR-ATKINSON',
        config: { 'Modelo': 'CL4', 'ENGINE CAPACITY': '2000cc NU-PE', 'EMISSION REGULATION': 'SULEV 30', 'BODY TYPE': '5DR', 'REGION': 'MEXICO' },
        timeline: [], testData: { simple: { operator: 'Ana Signataria', datetime: '', notes: '' }, signatures: sig } }] }));
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
    await page.addInitScript(SEED, VIN);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof histOpenCompleteModal === 'function' && typeof dashGo === 'function' && typeof db !== 'undefined', null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => dashGo('cop15', 'dashboard'));
    await page.waitForTimeout(700);
    const fila = page.locator('tr.hist-row', { hasText: VIN });
    ok('la fila dice "sin fecha de prueba"', /sin fecha de prueba/.test(await fila.textContent()));
    const btn = fila.locator('button', { hasText: 'Completar' });
    ok('aparece "📝 Completar (1)"', await btn.count() === 1 && /\(1\)/.test(await btn.textContent()));

    await btn.click();
    await page.waitForTimeout(400);
    const modal = page.locator('#hist-complete-overlay');
    const txt = await modal.textContent();
    ok('el modal es del formato simple (sin gases, sin dinamómetro, sin firma del aprobador)',
        /formato simple/.test(txt) && /Fecha\/Hora de la prueba/.test(txt) && !/Dinamómetro|Resultados de Emisiones|Aprobador/.test(txt), txt.slice(0, 300));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v380-completar.png') });
    const dt = modal.locator('input[type="datetime-local"]');
    ok('la fecha se captura con selector de fecha y hora', await dt.count() === 1);
    await dt.fill('2026-02-24T09:15');
    await page.click('#hist-complete-overlay button:has-text("Guardar cambios")');
    await page.waitForTimeout(600);
    const v = await page.evaluate(() => { const x = db.vehicles.find(y => y.id === 4242); return { d: x.testData.simple.datetime, st: x.status, tl: x.timeline.map(t => t.action) }; });
    ok('se guardó la fecha y la prueba sigue archivada', v.d === '2026-02-24T09:15' && v.st === 'archived', JSON.stringify(v));
    ok('queda en la línea de tiempo', v.tl.indexOf('Datos completados retroactivamente') >= 0);
    await page.waitForTimeout(300);
    const fila2 = page.locator('tr.hist-row', { hasText: VIN });
    const t2 = await fila2.textContent();
    ok('la fila ya muestra el día de la prueba y no ofrece Completar', /24\/2\/2026/.test(t2) && !/Completar/.test(t2), t2);

    // ⋯ → Corregir datos de la prueba (aunque no falte nada)
    await fila2.locator('button.hist-more-btn').click();
    await page.waitForTimeout(300);
    const corr = page.locator('#globalModal button', { hasText: 'Corregir datos de la prueba' });
    ok('el menú ⋯ ofrece "Corregir datos de la prueba"', await corr.count() === 1);
    await corr.click();
    await page.waitForTimeout(500);
    const txt2 = await page.locator('#hist-complete-overlay').textContent();
    ok('abre el mismo modal con lo guardado bloqueado 🔒 y "Modificar"', /No le falta nada/.test(txt2) && /Modificar/.test(txt2), txt2.slice(0, 300));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v380-corregir.png') });

    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' falla(s)' : '\nTodo bien');
    process.exitCode = fallas ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
