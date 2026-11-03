// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.29.0 — Estatus CoP: plan al 31 dic                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Con 3 ensayos hechos, 1 en curso, 2 agendados en un plan aceptado, 1 en una propuesta y la
// correlación de esas semanas: el Panorama lo dice en una línea y el reporte trae la sección
// (barra del año, semanas hasta el 31 dic, familias que faltan). 1440×950 y 430×900.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));
const SHOTS = process.env.E2E_SHOTS || '';

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
    const monAt = k => iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7 * k));
    const desc = 'CL4-26-WGN-LP';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(x => x + '-' + yy);
    const W = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };
    const row = (uid, day, o) => Object.assign({ uid, desc, testDay: day, preconDay: { mar: 'lun', mie: 'mar', jue: 'mie', vie: 'jue' }[day],
        purpose: 'COP-Emisiones', completed: false }, o || {});
    const corr = (uid, day) => ({ uid, activity: 'correlacion', purpose: 'Correlacion', desc: 'Prueba de correlación · Master K3', testDay: day,
        preconDay: { mar: 'lun', mie: 'mar', jue: 'mie', vie: 'jue' }[day], required: 0, completed: false });
    localStorage.setItem('kia_testplan_v1', JSON.stringify({
        months, testedList: [], planImportDate: iso(new Date(year, 0, 1)) + 'T15:00:00.000Z', planFirstMonth: 'Jan-' + yy, weekAvailability: {},
        planData: [{ desc, mod: 'CL4', my: '26 MODEL', body: 'WGN', eng: '1600CC GAMMA-II', tx: '7DCT', reg: 'PRE-EURO 7', ep: '0', engpkg: 'LOW POWER',
                     drv: 'LHD', tire: '-', rgn: 'EUROPE', hist: 0, total: 14400, m: months.map(() => 1200) }],      // 14,400 → 9 ensayos
        weeklyPlans: [
            { planId: 'P1', id: 1, weekDate: monAt(1), accepted: true, acceptedDate: monAt(0) + 'T10:00:00Z', created: monAt(0) + 'T09:00:00Z', workDays: W,
              items: [row('a1', 'mar'), row('a2', 'jue'), corr('c1', 'mie')] },
            { planId: 'P2', id: 2, weekDate: monAt(2), accepted: false, created: monAt(0) + 'T11:00:00Z', workDays: W,
              items: [row('b1', 'mar'), corr('c2', 'vie')] }
        ]
    }));
    const cfg = { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1600CC GAMMA-II', 'TRANSMISSION': '7DCT', 'MODEL YEAR (VIN)': '26 MODEL', 'EMISSION REGULATION': 'PRE-EURO 7',
                  'ENVIRONMENT PACKAGE': '0', 'ENGINE PACKAGE': 'LOW POWER', 'BODY TYPE': 'WGN', 'REGION': 'EUROPE', 'DRIVE TYPE': 'LHD' };
    const veh = (i, d, extra) => Object.assign({ id: 'e' + i, vin: 'KNAE2E0000000' + String(i).padStart(4, '0'), status: 'archived', purpose: 'COP-Emisiones',
        registeredAt: d + 'T08:00:00.000Z', configCode: desc, config: cfg,
        testData: { testDatetime: d + 'T10:00', gasResults: { aprobador: { values: { CO: 0.2 + i / 1000, THC: 0.03, NMHC: 0.02, NOx: 0.01, PM: 0.0002, PN: 1e10 } } } } }, extra || {});
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 100, vehicles: [
        veh(1, daysAgo(7)), veh(2, daysAgo(14)), veh(3, daysAgo(21)),
        veh(4, daysAgo(0), { status: 'ready-release', testData: { testDatetime: daysAgo(0) + 'T10:00' } }),                     // en curso
        veh(5, daysAgo(10), { purpose: 'Correlacion', vin: 'KNAMASTER00000777' })                                               // correlación hecha
    ] }));
};

async function abrir(browser, vp) {
    const context = await browser.newContext({ viewport: vp, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
    await page.waitForFunction(() => typeof copRepOpen === 'function' && typeof db !== 'undefined' && db.vehicles.length === 5, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { switchPlatform('cop'); copSetView('overview'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    return { context, page, errores };
}
const frameText = page => page.evaluate(() => document.querySelector('#cop-rep iframe').contentDocument.body.innerText);

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1440, height: 950 }, { width: 430, height: 900 }]) {
        console.log('\n== ' + vp.width + '×' + vp.height + ' ==');
        const { context, page, errores } = await abrir(browser, vp);
        const card = await page.evaluate(() => { const c = document.querySelector('.cop-rep-card'); return c ? c.innerText : ''; });
        ok('el Panorama: al 31 dic 6 de 9 (+1 en propuesta), 2 sin agendar, 1 de correlación',
           /Al 31 dic con lo agendado: 6 de 9 \(\+1 en propuesta\) · 2 sin agendar · 1 de correlación/.test(card), card);
        const O = await page.evaluate(() => { const o = copYearReportModel({ force: true }).outlook; return o && o.total; });
        ok('cuenta: 3 registradas, 1 en curso, 2 agendadas, 1 en propuesta, 2 sin agendar',
           O && O.done === 3 && O.inFlight === 1 && O.scheduled === 2 && O.proposed === 1 && O.gap === 2, JSON.stringify(O));
        ok('correlación: 1 agendada, 1 en propuesta, 1 hecha', O && O.corr === 1 && O.corrProp === 1 && O.corrDone === 1, JSON.stringify(O));
        await page.locator('.cop-rep-card button').click();
        await page.waitForTimeout(900);
        const t = await frameText(page);
        ok('el reporte trae la sección (en inglés)', /Plan to Dec 31/i.test(t) && /we reach 6 of 9 tests/.test(t) && /2 still to schedule/.test(t), t.slice(t.indexOf('Plan to'), t.indexOf('Plan to') + 500));
        ok('dice la correlación y las semanas sin plan', /Correlation: 1 scheduled until Dec 31 \(\+1 proposed\) · 1 done this year/.test(t) && /still ha(s|ve) no plan/.test(t));
        ok('la familia que falta: no alcanza', /not reached/.test(t));
        const es = await page.evaluate(() => copYearReportHTML(copYearReportModel(), { lang: 'es' }));
        ok('en español también', /Plan al 31 dic/.test(es) && /Faltan 2 por agendar/.test(es) && /no alcanza/.test(es));
        const over = await page.evaluate(() => { const d = document.querySelector('#cop-rep iframe').contentDocument.documentElement; return { sw: d.scrollWidth, cw: d.clientWidth }; });
        ok('el reporte no se desborda a lo ancho', over.sw <= over.cw + 1, JSON.stringify(over));
        if (SHOTS) {
            await page.evaluate(() => {
                const d = document.querySelector('#cop-rep iframe').contentDocument;
                const el = Array.from(d.querySelectorAll('div')).find(x => /^(Plan to Dec 31|Plan al 31 dic)$/.test(x.textContent.trim()));
                if (el) el.scrollIntoView();
            });
            await page.waitForTimeout(300);
            await page.screenshot({ path: SHOTS + '/outlook-' + vp.width + '.png' });
        }
        ok('sin errores de página', !errores.length, errores.join(' | '));
        await context.close();
    }
    await browser.close();
    console.log('\n' + (fallas ? fallas + ' FALLAS' : 'todo bien') + '\n');
    process.exitCode = fallas ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
