// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.7.1 — El ICMS de un re-test se llena solo                         ║
// ╚══════════════════════════════════════════════════════════════════════╝
// La Work Order es fija por VIN: al teclear un VIN con prueba anterior, el bloque de
// homologación se llena solo en cuanto la configuración es de Europa.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS_DIR || '';

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const VIN = '3KPFU8118VE000122';
const CFG = 'CL4MH-27 MODEL-6DCT-0-PRE-EURO 7-LHD-1600CC KAPPA PE-205/55 R16-EUROPE-5DR-0';

const SEED = ([vin, cfg]) => {
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: '2099-01-01T00:00:00.000Z' }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 1, vehicles: [{
        id: 'v-prev', vin: vin, status: 'archived', configCode: cfg, registeredAt: '2026-06-01T10:00:00.000Z',
        config: {}, timeline: [], testData: { testDatetime: '2026-06-02T09:00' },
        homolog: { workOrder: 'E2608A135C02A', mcCode: 'MC2', f0: 102.5, f1: 0.147, f2: 0.03544, tm: 1568, mr: 44.7, co2Target: 129,
                   source: 'icms', icmsFile: 'VIN_000122.xlsx', vinCheck: 'coincide' } }] }));
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
    await page.addInitScript(SEED, [VIN, CFG]);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof homoAltaAutoPrev === 'function' && typeof dashGo === 'function' && typeof db !== 'undefined', null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => dashGo('cop15', 'alta'));
    await page.waitForTimeout(500);
    const vals = () => page.evaluate(() => ['homo_mc', 'homo_f0', 'homo_mr', 'homo_co2'].map(id => document.getElementById(id).value).join('|'));

    // 1) Re-test: VIN → "Copiar config" pone la config de Europa → el ICMS se llena solo.
    await page.fill('#vin', VIN);
    await page.waitForTimeout(300);
    ok('aparece el aviso de re-test', await page.locator('#v7-vin-hint button', { hasText: 'Copiar config' }).count() === 1);
    await page.click('#v7-vin-hint button:has-text("Copiar config")');
    await page.waitForTimeout(500);
    ok('el bloque de homologación queda visible y lleno', await page.isVisible('#homo-alta-box') && await vals() === 'E2608A135C02A|102.5|44.7|129', await vals());
    ok('dice de qué prueba salió y ofrece Quitar', /prueba anterior de este VIN/.test(await page.textContent('#homo-alta-status')) &&
        await page.locator('#homo-alta-status button', { hasText: 'Quitar' }).count() === 1);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v371-alta.png'), fullPage: false });
    const d = await page.evaluate(() => homoAltaCollect());
    ok('la ficha queda como re-test', d.source === 'retest' && d.fromVehicleId === 'v-prev' && d.icmsFile === 'VIN_000122.xlsx', JSON.stringify(d));

    // 2) Cambiar el VIN retira lo copiado; volver a teclearlo lo llena solo, sin botón.
    await page.fill('#vin', '3KPFU8118VE00012');
    await page.waitForTimeout(200);
    ok('VIN distinto: la ficha copiada se retira', await vals() === '|||', await vals());
    await page.fill('#vin', VIN);
    await page.waitForTimeout(300);
    ok('mismo VIN otra vez: se llena solo (sin tocar "Copiar config")', await vals() === 'E2608A135C02A|102.5|44.7|129', await vals());

    // 3) Quitar.
    await page.click('#homo-alta-status button:has-text("Quitar")');
    await page.waitForTimeout(200);
    ok('Quitar vacía los campos y no se vuelve a llenar', await vals() === '|||' && !(await page.evaluate(() => homoAltaAutoPrev())), await vals());

    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' falla(s)' : '\nTodo bien');
    process.exitCode = fallas ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
