// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.26.0 — CL4MH es una sola familia en el CoP del año                 ║
// ╚══════════════════════════════════════════════════════════════════════╝
// El plan de producción trae la CL4MH 5DR y WGN SIN Modelo (como el CSV real) y un vehículo
// del Alta con Modelo CL4MH. Antes salían tres familias; ahora una, con la producción sumada.
// La CL4 sigue separando 5DR y WGN. App real (index.html), 1440×950.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || undefined;
const REPO = path.resolve(path.join(__dirname, '..'));

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || d === undefined ? '' : '  → ' + d)); if (!c) fallas++; };

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
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(x => x + '-' + yy);
    const hev = { eng: '1600CC KAPPA PE', tx: '6DCT', reg: 'PRE-EURO 7', ep: '0', engpkg: '0', drv: 'LHD', tire: '205/55 R16', rgn: 'EUROPE', my: '27 MODEL', hist: 0, total: 0 };
    const cl4 = { mod: 'CL4', eng: '1000cc KAPPA PE', tx: '6MT', reg: 'PRE-EURO 7', ep: '0', engpkg: '0', drv: 'LHD', tire: '-', rgn: 'EUROPE', my: '26 MODEL', hist: 0, total: 0 };
    localStorage.setItem('kia_testplan_v1', JSON.stringify({
        months, testedList: [], weeklyPlans: [], planImportDate: year + '-01-01T15:00:00.000Z', planFirstMonth: 'Jan-' + yy,
        planData: [
            // Como el CSV de producción: Modelo vacío.
            Object.assign({}, hev, { mod: '', body: '5DR', desc: 'CL4MH-27 MODEL-6DCT-0-PRE-EURO 7-LHD-1600CC KAPPA PE-205/55 R16-EUROPE-5DR-0', m: months.map(() => 30) }),
            Object.assign({}, hev, { mod: '', body: 'WGN', desc: '-27 MODEL-6DCT-0-PRE-EURO 7-LHD-1600CC KAPPA PE-205/55 R16-EUROPE-WGN-0', m: months.map(() => 20) }),
            Object.assign({}, cl4, { body: '5DR', desc: 'CL4-A-5DR', m: months.map(() => 100) }),
            Object.assign({}, cl4, { body: 'WGN', desc: 'CL4-A-WGN', m: months.map(() => 100) })
        ]
    }));
    const d = year + '-03-10';
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 100, vehicles: [{ id: 'h1', vin: 'KNAE2E00000000001', status: 'archived', purpose: 'COP-Emisiones',
        registeredAt: d + 'T08:00:00.000Z',
        config: { 'Modelo': 'CL4MH', 'ENGINE CAPACITY': '1600CC KAPPA PE', 'TRANSMISSION': '6DCT', 'MODEL YEAR (VIN)': '27 MODEL', 'EMISSION REGULATION': 'PRE-EURO 7',
                  'ENVIRONMENT PACKAGE': '0', 'ENGINE PACKAGE': '0', 'BODY TYPE': 'WGN', 'REGION': 'EUROPE', 'DRIVE TYPE': 'LHD' },
        testData: { testDatetime: d + 'T10:00', gasResults: { aprobador: { values: { CO: 0.2, THC: 0.03, NMHC: 0.02, NOx: 0.01 } } } } }] }));
};

(async () => {
    const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', dl => { errores.push('dialog: ' + dl.message()); dl.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof copYearReportModel === 'function' && typeof db !== 'undefined' && db.vehicles.length === 1, null, { timeout: 20000 });
    await page.waitForTimeout(600);

    const r = await page.evaluate(() => {
        const m = copYearReportModel({ force: true });
        return {
            mods: tpState.planData.map(c => c.mod + (c.modInferred ? '*' : '')),
            rows: m.rows.map(x => ({ name: x.name, body: x.fam.body, group: x.group.id, vol: x.vol, done: x.done, configs: x.configs }))
        };
    });
    ok('las filas sin Modelo toman CL4MH del catálogo (y se marcan)', r.mods.slice(0, 2).join(',') === 'CL4MH*,CL4MH*', r.mods.join(','));
    const hevRows = r.rows.filter(x => /CL4MH|^1\.6/.test(x.name));
    ok('CL4MH sale UNA vez', hevRows.length === 1, JSON.stringify(r.rows));
    const h = hevRows[0] || {};
    ok('…con la producción de las dos carrocerías y el ensayo WGN', h.vol === 600 && h.configs === 2 && h.done === 1 && h.group === 'hev', JSON.stringify(h));
    ok('la CL4 sigue separando 5DR y WGN', r.rows.filter(x => /^CL4 1\.0/.test(x.name)).length === 2, JSON.stringify(r.rows));

    await page.evaluate(() => { switchPlatform('cop'); copSetView('overview'); });
    await page.waitForTimeout(500);

    // ── Tabla de prioridad: tocar una ficha y tocar el nivel; la vista previa se mueve; guardar ──
    await page.evaluate(() => { switchPlatform('testplan'); tpSwitchTab('tp-rules'); });
    await page.waitForSelector('#tp-score-ui .tp-score-level', { timeout: 8000 });
    const antes = await page.evaluate(() => ({ lv: tpScoreTable().reg['EURO-5'], niveles: document.querySelectorAll('#tp-score-board-reg .tp-score-level').length,
        prev: document.querySelectorAll('#tp-score-preview li').length, guardar: document.querySelector('#tp-score-ui .tp-score-actions button').disabled }));
    ok('Reglas muestra los tableros 10→0 y la vista previa; Guardar apagado sin cambios', antes.niveles === 11 && antes.prev > 0 && antes.guardar && antes.lv === 6, JSON.stringify(antes));
    const chip = page.locator('#tp-score-board-reg .tp-score-chip', { hasText: /^PRE-EURO 7$/ });
    await chip.click();
    await page.locator('#tp-score-board-reg .tp-score-level[data-drag-cell="reg::2"]').click();
    await page.waitForTimeout(400);
    const mov = await page.evaluate(() => ({ draft: _tpScoreDraft && _tpScoreDraft.reg['PRE-EURO 7'], saved: tpScoreTable().reg['PRE-EURO 7'],
        enNivel: !!document.querySelector('#tp-score-board-reg .tp-score-level[data-drag-cell="reg::2"] .tp-score-chip[data-drag-id="reg::PRE-EURO 7"]'),
        texto: document.getElementById('tp-score-preview').textContent, guardar: document.querySelector('#tp-score-ui .tp-score-actions button').disabled }));
    ok('tocar la ficha y tocar el nivel la mueve en el BORRADOR (lo guardado no cambia)', mov.draft === 2 && mov.saved === 10 && mov.enNivel && !mov.guardar, JSON.stringify(mov));
    ok('la vista previa dice cuánto se mueve el orden', /cambian de lugar/.test(mov.texto) && /antes /.test(mov.texto), mov.texto.slice(0, 300));
    await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/score-desktop.png' : '/dev/null', fullPage: false }).catch(() => {});
    await page.locator('#tp-score-ui .tp-score-actions button', { hasText: 'Guardar tabla' }).click();
    await page.waitForTimeout(400);
    const g = await page.evaluate(() => ({ lv: tpState.scoreTable && tpState.scoreTable.reg['PRE-EURO 7'], at: tpState.scoreTable && tpState.scoreTable.updatedAt,
        audit: auditGetTrail().some(e => e.action === 'tabla_prioridad'), dirty: _tpScoreDirty(),
        score: tpGetAnalysis().find(a => a.reg === 'PRE-EURO 7' && a.mod === 'CL4').score }));
    ok('Guardar la deja para el laboratorio, sellada y auditada; el análisis ya ordena con ella', g.lv === 2 && !!g.at && g.audit && g.dirty === false, JSON.stringify(g));

    // Teléfono: la tarjeta cabe sin desplazamiento horizontal.
    await page.setViewportSize({ width: 430, height: 900 });
    await page.waitForTimeout(400);
    const ancho = await page.evaluate(() => { const e = document.getElementById('tp-score-ui'); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, w: e.getBoundingClientRect().width }; });
    ok('en el teléfono la tabla cabe (sin desplazamiento horizontal)', ancho.sw <= ancho.cw + 1, JSON.stringify(ancho));
    if (process.env.SHOT_DIR) { await page.locator('#tp-score-ui').scrollIntoViewIfNeeded(); await page.screenshot({ path: process.env.SHOT_DIR + '/score-phone.png' }); }

    ok('sin errores en la página', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' fallaron' : '\ntodo bien');
    process.exitCode = fallas ? 1 : 0;
})();
