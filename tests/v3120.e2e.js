// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.12.0 — CoP por año calendario y estatus semanal para corporativo   ║
// ╚══════════════════════════════════════════════════════════════════════╝
// CoP → Panorama → tarjeta del año → "Estatus de la semana": el reporte gerencial, el corte
// guardado, la producción real que manda sobre el plan, sacar una familia del reporte y el
// Validador 2026 (todos los MY juntos). Escritorio 1440×950 y teléfono 430×900.
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
    const base = { mod: 'CL4', eng: '1000cc KAPPA PE', tx: '6MT', reg: 'PRE-EURO 7', ep: '0', engpkg: '0', drv: 'LHD', tire: '-', rgn: 'EUROPE', hist: 0, total: 0 };
    const cfg = (my, body, m, extra) => Object.assign({}, base, { my, body, m, desc: 'CL4-' + my + '-' + body + (extra && extra.rgn || '') + (extra && extra.reg || '') }, extra || {});
    const months = ['Feb-26', 'Jun-26', 'Jul-26', 'Aug-26', 'Sep-26', 'Oct-26', 'Nov-26'];
    localStorage.setItem('kia_testplan_v1', JSON.stringify({
        months, testedList: [], weeklyPlans: [],
        planData: [
            cfg('26 MODEL', '5DR', [0, 3000, 2000, 1000, 500, 0, 0]),
            cfg('27 MODEL', '5DR', [0, 0, 0, 600, 900, 500, 400]),   // 5DR del año: 8,900 → 6 ensayos
            cfg('26 MODEL', 'WGN', [0, 300, 200, 0, 0, 0, 0]),       // WGN: 500 → 3
            cfg('26 MODEL', '4DR', [0, 50, 0, 0, 0, 0, 0], { rgn: 'MIDDLE EAST', reg: 'EURO-5', mod: 'BL7m', eng: '1600cc GAMMA', tx: '6AT' }),
            cfg('26 MODEL', '4DR', [0, 70, 0, 0, 0, 0, 0], { rgn: 'MIDDLE EAST', reg: 'EURO-4', mod: 'BL7m', eng: '1600cc GAMMA', tx: '6AT' })
        ]
    }));
    const veh = (i, my, body, d) => ({ id: 'e' + i, vin: 'KNAE2E0000000' + String(i).padStart(4, '0'), status: 'archived', purpose: 'COP-Emisiones',
        registeredAt: d + 'T08:00:00.000Z',
        config: { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1000cc KAPPA PE', 'TRANSMISSION': '6MT', 'MODEL YEAR (VIN)': my, 'EMISSION REGULATION': 'PRE-EURO 7',
                  'ENVIRONMENT PACKAGE': '0', 'ENGINE PACKAGE': '0', 'BODY TYPE': body, 'REGION': 'EUROPE', 'DRIVE TYPE': 'LHD' },
        testData: { testDatetime: d + 'T10:00', gasResults: { aprobador: { values: { CO: 0.2 + i / 1000, THC: 0.03, NMHC: 0.02, NOx: 0.01, PM: 0.0002, PN: 1e10 } } } } });
    const today = new Date(); const iso = x => x.toISOString().slice(0, 10);
    const daysAgo = n => iso(new Date(today.getTime() - n * 86400000));
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 100, vehicles: [
        veh(1, '26 MODEL', '5DR', '2026-03-10'), veh(2, '27 MODEL', '5DR', '2026-08-20'), veh(3, '27 MODEL', '5DR', daysAgo(2)),
        veh(4, '26 MODEL', '5DR', '2025-11-20'), veh(5, '26 MODEL', 'WGN', '2026-06-01') ] }));
};

async function abrir(browser, vp) {
    const context = await browser.newContext({ viewport: vp, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
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
    console.log('\n== Escritorio 1440×950 ==');
    let { context, page, errores } = await abrir(browser, { width: 1440, height: 950 });
    const card = await page.evaluate(() => { const c = document.querySelector('.cop-rep-card'); return c ? c.innerText : ''; });
    ok('el Panorama trae el estatus del año calendario con su botón', /CoP 2026/i.test(card) && /4 de 12 ensayos/.test(card) && /Estatus de la semana/.test(card), card);
    ok('declara los meses que el plan no trae', /no trae ene–may/.test(card), card);
    await page.locator('.cop-rep-card button').click();
    await page.waitForTimeout(800);
    let t = await frameText(page);
    ok('el reporte abre: Europa y Medio Oriente, año calendario', /Conformidad de la Producción 2026/.test(t) && /Europa/.test(t) && /Medio Oriente/.test(t) && /todos los años modelo/.test(t));
    const m = await page.evaluate(() => { const m = copYearReportModel({ force: true }); return m.rows.map(r => ({ g: r.group.id, vol: r.vol, req: r.req, done: r.done, mys: r.mys.join('+') })); });
    const r5 = m.find(r => r.g === '5dr');
    ok('MY26 + MY27 del 5 puertas son una familia: 8,900 u → 6 ensayos, 3 hechos (el de 2025 no cuenta)', r5 && r5.vol === 8900 && r5.req === 6 && r5.done === 3 && r5.mys === '26 MODEL+27 MODEL', JSON.stringify(r5));
    const nota = await page.evaluate(() => document.querySelector('#cop-rep .cop-rep-note').innerText);
    ok('Medio Oriente: solo lo del alcance (EURO-5); lo de fuera NO se menciona en el reporte, la app sí lo lista', m.filter(r => r.g === '4dr').length === 1 &&
        !/EURO-4/.test(t) && !/Fuera del alcance/.test(t) && /fuera del alcance CoP: .*EURO-4/.test(nota), nota);
    ok('el corte de la semana queda guardado', await page.evaluate(() => !!(copState.yearCuts && copState.yearCuts[copRepMonday(localToday())])));
    ok('el reporte no trae VINs', !/KNAE2E/.test(t));

    // Producción real: enero-mayo
    await page.locator('#cop-rep button', { hasText: 'Producción real' }).click();
    await page.waitForTimeout(300);
    await page.evaluate(() => { const tr = document.querySelector('#globalModal tr[data-key*="5DR"]'); tr.querySelector('input[data-mi="0"]').value = '1000'; });
    await page.locator('#globalModal button', { hasText: 'Guardar' }).click();
    await page.waitForTimeout(800);
    const r5b = await page.evaluate(() => copYearReportModel({ force: true }).rows.find(r => r.group.id === '5dr'));
    ok('lo real de enero se suma: 9,900 u → 6 ensayos, y queda auditado', r5b.vol === 9900 && r5b.monthSrc[0] === 'real' &&
        await page.evaluate(() => auditGetTrail().some(e => e.action === 'produccion_real')));

    // Sacar una familia del reporte
    await page.locator('#cop-rep button', { hasText: 'Familias' }).click();
    await page.waitForTimeout(300);
    await page.evaluate(() => { const row = Array.from(document.querySelectorAll('#globalModal .cop-rep-fam')).find(r => /WGN/.test(r.innerText)); row.querySelector('input[type=checkbox]').checked = false; });
    await page.locator('#globalModal button', { hasText: 'Guardar' }).click();
    await page.waitForTimeout(300);
    ok('sin motivo no se saca: el error va en el campo', await page.evaluate(() => !!document.querySelector('#globalModal [role=alert]')));
    await page.evaluate(() => { const row = Array.from(document.querySelectorAll('#globalModal .cop-rep-fam')).find(r => /WGN/.test(r.innerText)); row.querySelector('.cop-rep-fam-why').value = 'Unidades piloto'; });
    await page.locator('#globalModal button', { hasText: 'Guardar' }).click();
    await page.waitForTimeout(800);
    t = await frameText(page);
    const nota2 = await page.evaluate(() => document.querySelector('#cop-rep .cop-rep-note').innerText);
    ok('la familia sale del conteo sin mencionarse en el reporte; la app la lista con su motivo', !/Unidades piloto/.test(t) && /excluidas por el laboratorio: .*Unidades piloto/.test(nota2) &&
        await page.evaluate(() => copYearReportModel({ force: true }).rows.every(r => r.group.id !== 'wgn')));
    await page.locator('#cop-rep .cop-rep-close').click();

    // Validador 2026
    await page.evaluate(() => copSetView('validator'));
    await page.waitForTimeout(500);
    const v = await page.evaluate(() => {
        const k = copYearValidatorFamilies().find(f => /5DR/.test(f.key)).key;
        copSelectFamily(k);
        return { title: document.querySelector('#platform-cop .card-title').innerText, vins: (copState.vehicles || []).filter(r => r.vin).length, key: copState.familyKey };
    });
    ok('Validador 2026: la familia junta MY26 y MY27, con los ensayos de 2026', /Validador 2026/.test(v.title) && v.vins === 3 && /CAL 2026/.test(v.key), JSON.stringify(v));
    await page.evaluate(() => copSetGroupBy('my'));
    await page.waitForTimeout(300);
    ok('por año modelo sigue funcionando como antes (y suelta la familia del año)', await page.evaluate(() =>
        /por año modelo/.test(document.querySelector('#platform-cop .card-title').innerText) && !copState.familyKey));
    ok('sin errores de página', !errores.length, errores.join(' | '));
    await context.close();

    console.log('\n== Teléfono 430×900 ==');
    ({ context, page, errores } = await abrir(browser, { width: 430, height: 900 }));
    await page.evaluate(() => copRepOpen());
    await page.waitForTimeout(800);
    const fit = await page.evaluate(() => {
        const d = document.querySelector('#cop-rep iframe').contentDocument;
        return { doc: d.documentElement.scrollWidth, win: d.documentElement.clientWidth, bar: document.querySelector('.cop-rep-bar').scrollWidth <= window.innerWidth };
    });
    ok('el reporte cabe en el teléfono (sin desplazamiento horizontal)', fit.doc <= fit.win + 1 && fit.bar, JSON.stringify(fit));
    ok('sin errores de página', !errores.length, errores.join(' | '));
    await context.close();
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo bien');
    process.exitCode = fallas ? 1 : 0;
})();
