// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.22.0 — El CoP cuenta lo que corporativo cuenta                     ║
// ╚══════════════════════════════════════════════════════════════════════╝
// count_hist del CSV = lo producido en el año; solo cuenta el propósito CoP · Emisiones;
// 🔎 Ensayos del año lista lo que no cuenta y ✏️ corrige el propósito. 1440×950 y 430×900.
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
    const year = new Date().getFullYear(), yy = String(year).slice(2);
    const base = { mod: 'CL4', eng: '1600CC GAMMA-II', tx: '7DCT', reg: 'PRE-EURO 7', ep: '0', engpkg: 'LOW POWER', drv: 'LHD', tire: '-', rgn: 'EUROPE', total: 0 };
    const cfg = (my, body, hist, m, extra) => Object.assign({}, base, { my, body, hist, m, desc: 'CL4-' + my + '-' + body + (extra && extra.mod || '') }, extra || {});
    // Como el CSV real: count_hist + columnas desde octubre; sep trae pronóstico de un CSV viejo.
    const months = ['Sep-' + yy, 'Oct-' + yy, 'Nov-' + yy, 'Dec-' + yy];
    localStorage.setItem('kia_testplan_v1', JSON.stringify({
        months, testedList: [], weeklyPlans: [], planImportDate: year + '-10-09T15:00:00.000Z', planFirstMonth: 'Oct-' + yy,
        planData: [
            cfg('26 MODEL', 'WGN', 9054, [999, 309, 0, 0]),
            cfg('27 MODEL', 'WGN', 0, [0, 187, 571, 304]),           // WGN del año: 9,054 + 1,371 → 6
            cfg('26 MODEL', '4DR', 741, [0, 13, 40, 0], { rgn: 'MIDDLE EAST', reg: 'EURO-5', mod: 'BL7m', eng: '1600cc GAMMA', tx: '6AT', engpkg: 'DCVVT' }),
            cfg('26 MODEL', '4DR', 430, [0, 0, 0, 0], { rgn: 'MIDDLE EAST', reg: 'EURO-5', mod: 'CL4', eng: '2000cc NU', tx: '6AT', engpkg: '0' })
        ]
    }));
    const veh = (i, purpose, status, d) => ({ id: 'e' + i, vin: 'KNAE2E0000000' + String(i).padStart(4, '0'), status, purpose,
        registeredAt: d + 'T08:00:00.000Z',
        config: { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1600CC GAMMA-II', 'TRANSMISSION': '7DCT', 'MODEL YEAR (VIN)': '26 MODEL', 'EMISSION REGULATION': 'PRE-EURO 7',
                  'ENVIRONMENT PACKAGE': '0', 'ENGINE PACKAGE': 'LOW POWER', 'BODY TYPE': 'WGN', 'REGION': 'EUROPE', 'DRIVE TYPE': 'LHD' },
        testData: { testDatetime: d + 'T10:00', gasResults: status !== 'archived' ? {} :
            { aprobador: { values: { CO: 0.2 + i / 1000, THC: 0.03, NMHC: 0.02, NOx: 0.01, PM: 0.0002, PN: 1e10 } } } } });
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 100, vehicles: [
        veh(1, 'COP-Emisiones', 'archived', year + '-03-10'), veh(2, 'COP-Emisiones', 'archived', year + '-06-20'),
        veh(3, 'EO-Emisiones', 'archived', year + '-07-02'),            // prueba de la modificación HEV
        veh(4, 'COP-Emisiones', 'in-progress', year + '-10-01') ] }));
};

async function abrir(browser, vp) {
    const context = await browser.newContext({ viewport: vp, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof copRepOpen === 'function' && typeof db !== 'undefined' && db.vehicles.length === 4, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { switchPlatform('cop'); copSetView('overview'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    return { context, page, errores };
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    console.log('\n== Escritorio 1440×950 ==');
    let { context, page, errores } = await abrir(browser, { width: 1440, height: 950 });
    const card = await page.evaluate(() => { const c = document.querySelector('.cop-rep-card'); return c ? c.innerText : ''; });
    ok('el Panorama ya no pide capturar ene–sep (el acumulado los cubre)', !/no trae/.test(card) && /2 de 7 ensayos/.test(card), card);
    const m = await page.evaluate(() => copYearReportModel({ force: true }).rows.map(r => ({ mod: r.fam.mod, vol: r.vol, req: r.req, done: r.done })));
    const wgn = m.find(r => r.mod === 'CL4');
    ok('WGN: 9,054 acumuladas + 1,371 por producir → 6; la EO no cuenta (2 hechas)', wgn && wgn.vol === 10425 && wgn.req === 6 && wgn.done === 2, JSON.stringify(m));
    ok('Medio Oriente: solo el BL7m entra (la CL4 EURO-5 sale)', m.filter(r => r.mod === 'BL7m').length === 1 && m.filter(r => r.mod === 'CL4').length === 1, JSON.stringify(m));
    await page.locator('.cop-rep-card button').click();
    await page.waitForTimeout(800);
    const t = await page.evaluate(() => document.querySelector('#cop-rep iframe').contentDocument.body.innerText);
    ok('el reporte dice de dónde sale la producción', /lo producido de enero al 9 oct/.test(t) && /registrados como conformidad de la producción/.test(t), t.slice(-600));
    const nota = await page.evaluate(() => document.querySelector('#cop-rep .cop-rep-note').innerText);
    ok('la app declara la prueba EO aparte (el reporte no)', /no cuentan por su propósito: EO · Emisiones \(1\)/.test(nota) && !/EO · Emisiones/.test(t), nota);

    await page.locator('#cop-rep button', { hasText: 'Ensayos del año' }).click();
    await page.waitForTimeout(400);
    const lista = await page.evaluate(() => document.querySelector('#globalModal').innerText);
    ok('🔎 Ensayos del año: los cuatro, 2 cuentan, la EO y la que está en curso dicen por qué', /Cuentan 2 de 4/.test(lista) &&
        /no como conformidad de la producción/.test(lista) && /en curso/.test(lista), lista.slice(0, 900));
    // ✏️ de la prueba en curso → Corregir alta con el propósito
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#globalModal button')).find(x => /KNAE2E00000000004/.test(x.getAttribute('aria-label') || '')); b.click(); });
    await page.waitForTimeout(700);
    const sel = await page.evaluate(() => { const s = document.getElementById('altaCorrPurpose'); return s ? Array.from(s.options).map(o => o.value) : null; });
    ok('Corregir alta ofrece el propósito, solo del mismo formato (emisiones)', sel && sel.indexOf('EO-Emisiones') >= 0 && sel.indexOf('COP-OBD2') < 0, JSON.stringify(sel));
    await page.evaluate(() => { const s = document.getElementById('altaCorrPurpose'); s.value = 'EO-Emisiones'; s.dispatchEvent(new Event('change', { bubbles: true }));
        const mo = document.getElementById('altaCorrMotivo'); mo.value = 'Es prueba de la modificación HEV, no CoP'; mo.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(300);
    const efectos = await page.evaluate(() => document.getElementById('altaCorrEfectos').innerText);
    ok('avisa que deja de contar para el CoP', /Deja de contar para el CoP/.test(efectos), efectos);
    await page.locator('.custom-modal-overlay button', { hasText: 'Guardar corrección' }).last().click();
    await page.waitForTimeout(800);
    const v4 = await page.evaluate(() => { const v = db.vehicles.find(x => x.id === 'e4'); return { p: v.purpose, tl: (v.timeline || []).slice(-1)[0] }; });
    ok('el propósito queda corregido y en la línea de tiempo', v4.p === 'EO-Emisiones' && v4.tl && v4.tl.action === 'Alta corregida' &&
        v4.tl.data.modified.some(x => x.campo === 'Propósito'), JSON.stringify(v4));
    ok('queda auditado con antes y después', await page.evaluate(() => auditGetTrail().some(e => e.action === 'alta_corregida' && /Propósito/.test(e.details || ''))));
    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'v3220-desktop.png') });
    await context.close();

    console.log('\n== Teléfono 430×900 ==');
    ({ context, page, errores } = await abrir(browser, { width: 430, height: 900 }));
    await page.evaluate(() => copRepOpen());
    await page.waitForTimeout(800);
    await page.evaluate(() => copRepAuditOpen());
    await page.waitForTimeout(500);
    const ancho = await page.evaluate(() => { const b = document.querySelector('#globalModal .custom-modal-box') || document.querySelector('#globalModal'); return b.scrollWidth <= window.innerWidth + 1; });
    ok('la lista cabe en el teléfono (tarjetas, sin desplazamiento horizontal)', ancho);
    await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'v3220-phone.png') });
    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await context.close();
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo bien');
    if (fallas) process.exitCode = 1;
})();
