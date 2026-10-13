// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.4.0 — La versión de CASCADE                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝
// El botón de la barra de Pruebas dice la versión real y abre su historial; Datos →
// Sistema lo muestra.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS_DIR || '';

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const SEED = () => {
    const veh = (id, vin, regAt, archAt, extra) => Object.assign({
        id, vin, status: 'archived', purpose: 'COP-Emisiones', configCode: 'CL4-26', registeredAt: regAt, archivedAt: archAt,
        config: { Modelo: 'CL4', REGION: 'EUROPE', 'EMISSION REGULATION': 'PRE-EURO 7' },
        timeline: [{ timestamp: regAt, user: 'Ana', action: 'Vehículo Registrado', data: { status: 'registered' } }],
        testData: { signatures: { releaser: { signerName: 'Ana', signedAt: archAt } } }
    }, extra || {});
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: '2099-01-01T00:00:00.000Z' }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 2, vehicles: [
        veh(9201, '3KPFX51BXTE290480', '2026-06-01T15:00:00.000Z', '2026-09-23T18:00:00.000Z'),
        veh(9202, '3KPFX51BXTE290481', '2026-10-13T15:00:00.000Z', '2026-10-13T18:00:00.000Z',
            { cascadeVersions: { alta: '4.29.0', liberacion: '4.29.0', aprobacion: '4.29.0' } })
    ] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1366, height: 900 }, { width: 427, height: 840 }]) {
        console.log('\n== ' + vp.width + '×' + vp.height + ' ==');
        const context = await browser.newContext({ viewport: vp, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
        const page = await context.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, 'index.html'));
        await page.waitForFunction(() => typeof cascadeVersionShow === 'function' && typeof dashGo === 'function', null, { timeout: 15000 });
        await page.waitForTimeout(600);
        await page.evaluate(() => dashGo('cop15', 'dashboard'));
        await page.waitForTimeout(500);

        const pill = page.locator('#cascade-version-pill');
        const v = await page.evaluate(() => CASCADE_VERSION);
        ok('la barra de Pruebas dice "CASCADE ' + v + '"', (await pill.textContent()).trim() === 'CASCADE ' + v);
        ok('ya no dice el "v1.0615" fijo', !(await page.locator('.topbar').first().textContent()).includes('v1.0615 EmLab'));
        const box = await pill.boundingBox();
        ok('el botón es tocable (≥ 24px de alto) y cabe en la pantalla', box && box.height >= 24 && box.x + box.width <= vp.width,
            JSON.stringify(box));
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v340-barra-' + vp.width + '.png') });

        await pill.click();
        await page.waitForTimeout(300);
        const modal = await page.locator('#globalModal').textContent();
        ok('el botón abre el historial con la actual y el archivo original',
            modal.includes(v) && modal.includes('ACTUAL') && modal.includes('1.0615') && modal.includes('Doble ciego interno') && modal.includes('Cerrar'));
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v340-historial-' + vp.width + '.png') });
        await page.evaluate(() => { const m = document.getElementById('globalModal'); if (m) m.remove(); });

        await page.evaluate(() => dashGo('panel', 'pn-system'));
        await page.waitForTimeout(800);
        const card = await page.locator('#pn-cascade-versions').textContent();
        ok('Datos → Sistema muestra el historial de CASCADE', card.includes(v) && card.includes('1.0615'));

        ok('sin errores de página', errores.length === 0, errores.join(' | '));
        await context.close();
    }
    await browser.close();
    console.log('\n' + (fallas ? fallas + ' FALLAS' : 'todo ok'));
    process.exitCode = fallas ? 1 : 0;
})();
