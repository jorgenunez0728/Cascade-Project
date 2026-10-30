// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.23.0 — Estatus CoP: ritmo, lo crítico, nota de la semana, inglés   ║
// ╚══════════════════════════════════════════════════════════════════════╝
// El visor abre en inglés (va a corporativo) y cambia a español; el ritmo cuenta los ensayos
// por semana y la semana sin celda; "Needs attention" ya no avisa de pocas unidades por
// producir (3.26.0); la nota de la semana sale en el reporte. 1440×950 y 430×900.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const SEED = () => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: '2099-01-01T00:00:00.000Z' }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    const now = new Date(), year = now.getFullYear(), yy = String(year).slice(2);
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const daysAgo = n => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const nextMon = iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7));
    const base = { eng: '1600CC GAMMA-II', tx: '7DCT', reg: 'PRE-EURO 7', ep: '0', engpkg: 'LOW POWER', drv: 'LHD', tire: '-', rgn: 'EUROPE', total: 0 };
    const cfg = (mod, my, body, hist, m, extra) => Object.assign({}, base, { mod, my, body, hist, m, desc: [mod, my, body, (extra && extra.ep) || ''].join('-') }, extra || {});
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(x => x + '-' + yy);
    const ahead = (n) => months.map((_, i) => i >= now.getMonth() && i < 11 ? n : 0);     // nada en diciembre
    localStorage.setItem('kia_testplan_v1', JSON.stringify({
        months, testedList: [], weeklyPlans: [], planImportDate: iso(new Date(year, 0, 1)) + 'T15:00:00.000Z', planFirstMonth: 'Jan-' + yy,
        weekAvailability: { [nextMon]: { available: false, note: 'HEV phase 2 commissioning' } },
        planData: [
            cfg('CL4', '26 MODEL', 'WGN', 0, months.map(() => 800)),                                   // WGN LP: 9,600 → 6
            cfg('CL4', '26 MODEL', 'WGN', 0, ahead(10), { eng: '1000cc KAPPA PE', tx: '6MT', ep: 'MILD HEV', engpkg: '0' })   // pocas unidades
        ]
    }));
    const veh = (i, d, extra) => Object.assign({ id: 'e' + i, vin: 'KNAE2E0000000' + String(i).padStart(4, '0'), status: 'archived', purpose: 'COP-Emisiones',
        registeredAt: d + 'T08:00:00.000Z',
        config: { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1600CC GAMMA-II', 'TRANSMISSION': '7DCT', 'MODEL YEAR (VIN)': '26 MODEL', 'EMISSION REGULATION': 'PRE-EURO 7',
                  'ENVIRONMENT PACKAGE': '0', 'ENGINE PACKAGE': 'LOW POWER', 'BODY TYPE': 'WGN', 'REGION': 'EUROPE', 'DRIVE TYPE': 'LHD' },
        testData: { testDatetime: d + 'T10:00', gasResults: { aprobador: { values: { CO: 0.2 + i / 1000, THC: 0.03, NMHC: 0.02, NOx: 0.01, PM: 0.0002, PN: 1e10 } } } } }, extra || {});
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 100, vehicles: [veh(1, daysAgo(0)), veh(2, daysAgo(7)), veh(3, daysAgo(14))] }));
};

async function abrir(browser, vp) {
    const context = await browser.newContext({ viewport: vp, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof copRepOpen === 'function' && typeof db !== 'undefined' && db.vehicles.length === 3, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { switchPlatform('cop'); copSetView('overview'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    return { context, page, errores };
}
const frameText = page => page.evaluate(() => document.querySelector('#cop-rep iframe').contentDocument.body.innerText);

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    console.log('\n== Escritorio 1440×950 ==');
    let { context, page, errores } = await abrir(browser, { width: 1440, height: 950 });
    const card = await page.evaluate(() => { const c = document.querySelector('.cop-rep-card'); return c ? c.innerText : ''; });
    ok('el Panorama dice el ritmo y la familia más crítica', /Ritmo: .*\/sem\./.test(card) && /más crítica: CL4 1\.0 T-GDI 48V 6MT/.test(card), card);
    await page.locator('.cop-rep-card button').click();
    await page.waitForTimeout(800);
    let t = await frameText(page);
    ok('abre en inglés (va a corporativo)', /Conformity of Production/.test(t) && /Needs attention/i.test(t) && /Tests per week/i.test(t), t.slice(0, 300));
    ok('[3.26.0] lo crítico ya no pide "reserve a unit now" (pocas unidades por producir)', /Needs attention/i.test(t) && !/reserve a unit now|units left to build/i.test(t), t.slice(0, 1600));
    ok('ritmo: 3 ensayos en las últimas 4 semanas y la semana sin celda declarada', /0\.8\/wk/.test(t) && /cell not available/.test(t) && /HEV phase 2 commissioning/.test(t), t.slice(0, 2400));
    ok('nombres como los dice la gerencia', /CL4 1\.6 T-GDI LP 7DCT/.test(t));
    // Nota de la semana
    await page.locator('#cop-rep button', { hasText: 'Nota de la semana' }).click();
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#globalModal #_ui_prompt').value = 'Next week the emission cell will not be available.'; });
    await page.locator('#globalModal button', { hasText: 'Guardar nota' }).click();
    await page.waitForTimeout(900);
    t = await frameText(page);
    ok('la nota sale en el reporte y queda guardada y auditada', /Note from the lab/i.test(t) && /Next week the emission cell will not be available/.test(t) &&
        await page.evaluate(() => !!(copState.yearNotes && copState.yearNotes[copRepMonday(localToday())]) && auditGetTrail().some(e => e.action === 'cop_nota_semana')), t.slice(-1200));
    // Español
    await page.locator('#cop-rep .cop-rep-lang button', { hasText: 'Español' }).click();
    await page.waitForTimeout(800);
    t = await frameText(page);
    ok('Español: el mismo reporte en español, y se recuerda', /Conformidad de la Producción/.test(t) && /Requiere atención/i.test(t) && !/apartar una unidad/.test(t) &&
        await page.evaluate(() => uiPref('copRepLang') === 'es'));
    ok('la nota se queda en el idioma en que se escribió', /Nota del laboratorio/i.test(t) && /Next week the emission cell/.test(t));
    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await context.close();

    console.log('\n== Teléfono 430×900 ==');
    ({ context, page, errores } = await abrir(browser, { width: 430, height: 900 }));
    await page.evaluate(() => copRepOpen());
    await page.waitForTimeout(900);
    const fit = await page.evaluate(() => { const d = document.querySelector('#cop-rep iframe').contentDocument; return d.documentElement.scrollWidth <= d.documentElement.clientWidth + 1; });
    ok('el reporte cabe en el teléfono (sin desplazamiento horizontal)', fit);
    const bar = await page.evaluate(() => { const b = document.querySelector('#cop-rep .cop-rep-bar'); return b.scrollWidth <= window.innerWidth + 1; });
    ok('la barra del visor (con English / Español) cabe', bar);
    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await context.close();
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo bien');
    if (fallas) process.exitCode = 1;
})();
