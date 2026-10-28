// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.24.0 — Bloques de la celda                                         ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Mi semana muestra los 8 bloques (4 pares × 2 vehículos) con su prueba o su motivo; un
// signatario explica los vacíos (también varios de un día a la vez); HOY se lo pide; el Excel
// de la semana se descarga; el estatus del viernes trae la sección de la celda.
// 1440×950 y 430×900.
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
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Signatario', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    localStorage.setItem('kia_ui_prefs', JSON.stringify({ copRepLang: 'en' }));
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    const now = new Date();
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    // La semana PASADA: así todos sus días ya terminaron, sea cual sea el día en que corre la prueba.
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7);
    const day = n => iso(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + n));
    window.__wk = iso(mon);
    sessionStorage.setItem('__wk', iso(mon));
    const cfg = { id: 'a', desc: 'CL4-26-WGN', mod: 'CL4', eng: '1600CC GAMMA-II', tx: '7DCT', my: '26 MODEL', reg: 'PRE-EURO 7', ep: '0',
                  engpkg: 'LOW POWER', drv: 'LHD', tire: '-', rgn: 'EUROPE', body: 'WGN', total: 0, hist: 0, m: [] };
    localStorage.setItem('kia_testplan_v1', JSON.stringify({ planData: [cfg], testedList: [], weeklyPlans: [], vehiclesPerSlot: 2,
        weekAvailability: { [iso(mon)]: { available: true, capacity: null, note: '',
            workDays: { dom: false, lun: true, mar: true, mie: true, jue: true, vie: false, sab: false } } } }));
    const veh = (i, d) => ({ id: 'e' + i, vin: 'KNAE2E00000000' + String(i).padStart(3, '0'), status: 'archived', purpose: 'COP-Emisiones',
        configCode: cfg.desc, registeredAt: d + 'T08:00:00.000Z',
        config: { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1600CC GAMMA-II', 'TRANSMISSION': '7DCT', 'MODEL YEAR (VIN)': '26 MODEL', 'EMISSION REGULATION': 'PRE-EURO 7',
                  'ENVIRONMENT PACKAGE': '0', 'ENGINE PACKAGE': 'LOW POWER', 'BODY TYPE': 'WGN', 'REGION': 'EUROPE', 'DRIVE TYPE': 'LHD' },
        // Aprobada DOS días después de la prueba: la mesa del CoP debe decir el día de la PRUEBA.
        testData: { testDatetime: d + 'T10:00', gasResults: { aprobador: { values: { CO: 0.2 + i / 100, THC: 0.03, NMHC: 0.02, NOx: 0.01 },
            capturedAt: day(4) + 'T18:00:00.000Z' } } } });
    // Martes y miércoles: 2 pruebas · jueves: 0 · viernes no laborable.
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 100, vehicles: [veh(1, day(1)), veh(2, day(1)), veh(3, day(2)), veh(4, day(2))] }));
};

async function abrir(browser, vp) {
    const context = await browser.newContext({ viewport: vp, timezoneId: 'America/Mexico_City', locale: 'es-MX', acceptDownloads: true });
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof tpBlocksForWeek === 'function' && typeof db !== 'undefined' && db.vehicles.length === 4, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    return { context, page, errores };
}
const card = page => page.evaluate(() => { const c = document.querySelector('.tp-blk-days'); return c ? c.closest('.ui-card').innerText : ''; });

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    console.log('\n== Escritorio 1440×950 ==');
    let { context, page, errores } = await abrir(browser, { width: 1440, height: 950 });
    const wk = await page.evaluate(() => sessionStorage.getItem('__wk'));

    // HOY se lo pide al signatario
    await page.evaluate(() => { switchPlatform('today'); });
    await page.waitForTimeout(700);
    const hoy = await page.evaluate(() => document.getElementById('platform-today').innerText);
    // Cuántos depende del día en que corre (esta semana también cuenta): basta con que lo pida.
    ok('HOY le pide al signatario explicar los bloques vacíos', /\d+ bloques? de prueba sin explicar/.test(hoy), hoy.slice(0, 600));

    await page.evaluate(w => { dashGo('testplan', 'tp-myweek', 'tpCalendarOpenWeek', w); }, wk);
    await page.waitForTimeout(1400);
    let t = await card(page);
    ok('Mi semana: 8 bloques, 4 con prueba, el viernes festivo y 2 sin explicar', /4 de 8 bloques con prueba/.test(t) && /2 sin explicar/.test(t) &&
        (t.match(/Día festivo/g) || []).length >= 2, t.slice(0, 800));
    ok('la capacidad instalada se dice', /4 pares de días × 2 vehículos = 8 bloques/.test(t));

    // Explicar el jueves (los dos de un jalón)
    await page.locator('.tp-blk--sin-explicar').first().click();
    await page.waitForTimeout(400);
    const modal = await page.evaluate(() => document.getElementById('globalModal').innerText);
    ok('el diálogo ofrece la lista cerrada y aplicar al otro bloque del día', /Quality check/.test(modal) && /Sin vehículo disponible/.test(modal) &&
        /Aplicar también al otro bloque vacío/.test(modal), modal);
    await page.evaluate(() => { const s = document.getElementById('tp-blk-reason'); s.value = 'qc'; s.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('tp-blk-note').value = 'Verificación de bolsas'; });
    await page.locator('#globalModal button', { hasText: 'Guardar' }).click();
    await page.waitForTimeout(900);
    t = await card(page);
    ok('quedan explicados los dos, con la nota y quién lo puso', /4\/8/.test(t) && !/Sin explicar/.test(t) &&
        (t.match(/Verificación de bolsas/g) || []).length === 2 && /Ana Signataria/.test(t), t.slice(0, 900));
    ok('queda en la auditoría', await page.evaluate(() => auditGetTrail().some(e => e.action === 'bloque_explicado')));

    // Excel de la semana
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
        page.locator('button', { hasText: 'Excel de la semana' }).first().click()]);
    ok('📤 Excel de la semana se descarga', !!dl && /^Test_Week_\d{4}-\d{2}-\d{2}\.xlsx$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());

    // El estatus del viernes trae la sección (el corte de la semana pasada = su viernes)
    const rep = await page.evaluate(w => { const m = copYearReportModel({ cutIso: tpIsoAddDays(w, 4), force: true }); return copYearReportHTML(m, { lang: 'en' }); }, wk);
    ok('el estatus CoP trae el uso de la celda y la semana siguiente, sin VIN', /Cell use/.test(rep) && /4 of 8 test blocks used/.test(rep) &&
        /Quality check/.test(rep) && /Next week/.test(rep) && !/KNAE2E/.test(rep), rep.slice(rep.indexOf('Cell use'), rep.indexOf('Cell use') + 500));

    // [3.24.0] CoP → Validador: la fecha de prueba de cada VIN, y qué se teclea dónde
    await page.evaluate(() => { switchPlatform('cop'); copOpenFamily(copVehicleFamilyKey(db.vehicles[0])); });
    await page.waitForTimeout(800);
    const mesa = await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('#platform-cop table')).find(x => /Fecha de prueba/i.test(x.innerText) && x.querySelector('input'));
        return { head: t ? Array.from(t.querySelectorAll('thead th')).map(th => th.innerText.trim()) : [],
                 fechas: t ? Array.from(t.querySelectorAll('tbody .cop-date--lab')).map(x => x.innerText.trim()) : [],
                 lab: t ? t.querySelectorAll('input.cop-in--lab').length : 0, todo: t ? t.querySelectorAll('input.cop-in--todo').length : 0,
                 legend: (document.querySelector('#platform-cop .cop-legend') || {}).innerText || '' };
    });
    const martes = await page.evaluate(w => tpIsoAddDays(w, 1), wk), miercoles = await page.evaluate(w => tpIsoAddDays(w, 2), wk);
    ok('la mesa trae la columna Fecha de prueba junto al VIN', mesa.head[0] === 'VIN' && /Fecha de prueba/i.test(mesa.head[1]), JSON.stringify(mesa.head));
    ok('cada VIN del laboratorio trae el día de su PRUEBA (no el de aprobación) y bloqueado 🔒',
        mesa.fechas.length === 4 && mesa.fechas.filter(f => f === '🔒 ' + martes).length === 2 && mesa.fechas.filter(f => f === '🔒 ' + miercoles).length === 2,
        JSON.stringify(mesa.fechas));
    ok('los valores del laboratorio en azul y la leyenda dice qué es cada color', mesa.lab >= 16 && /Azul/.test(mesa.legend) && /teclea aquí/i.test(mesa.legend), JSON.stringify(mesa));
    // VIN manual: la fecha y los gases se teclean (amarillo) y al teclear la celda cambia
    await page.evaluate(() => copAddManualRow());
    await page.waitForTimeout(400);
    const man = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#platform-cop tbody tr')).filter(r => r.querySelector('input.cop-in--date'));
        const r = rows[rows.length - 1];
        const d = r.querySelector('input.cop-in--date'), g = r.querySelector('input.cop-in--num');
        const antes = { d: d.className, g: g.className };
        d.value = '2026-03-02'; d.dispatchEvent(new Event('change', { bubbles: true }));
        g.value = '0.25'; g.dispatchEvent(new Event('input', { bubbles: true }));
        const fila = copState.vehicles[copState.vehicles.length - 1];
        return { antes, despues: { d: d.className, g: g.className }, guardada: fila.testDate };
    });
    ok('un VIN manual pide la fecha y los gases en amarillo; al teclear, la celda queda blanca y la fecha se guarda',
        /cop-in--todo/.test(man.antes.d) && /cop-in--todo/.test(man.antes.g) && /cop-in--manual/.test(man.despues.d) && /cop-in--manual/.test(man.despues.g) &&
        man.guardada === '2026-03-02', JSON.stringify(man));
    await page.evaluate(() => copSortMesaByDate());
    await page.waitForTimeout(300);
    ok('↕ ordena la mesa por fecha de prueba (el VIN manual del 2 de marzo queda primero)', await page.evaluate(() => copState.vehicles[0].testDate === '2026-03-02'));
    ok('la tabla de CO₂ y el expediente leen la misma fecha de prueba', await page.evaluate((m) =>
        copCo2RowsFor([db.vehicles[0].vin], copVehicleFamilyKey(db.vehicles[0]))[0].date.slice(0, 10) === m &&
        copTestDate(db.vehicles[0]).date === m && !copTestDate(db.vehicles[0]).approx, martes));

    // Sin permiso: el candado
    await page.evaluate(() => { authState.currentUser.role = 'Técnico'; });
    const pass = await page.evaluate(w => tpBlockExplain([w + '|mar|1'], 'qc', ''), wk);
    ok('un Técnico no puede poner motivos (capa de datos)', pass === false);
    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'v3240-desktop.png'), fullPage: false });
    await context.close();

    console.log('\n== Teléfono 430×900 ==');
    ({ context, page, errores } = await abrir(browser, { width: 430, height: 900 }));
    await page.evaluate(w => { dashGo('testplan', 'tp-myweek', 'tpCalendarOpenWeek', w); }, wk);
    await page.waitForTimeout(1400);
    const fit = await page.evaluate(() => { const c = document.querySelector('.tp-blk-days'); return c && c.scrollWidth <= c.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1; });
    ok('los bloques caben en el teléfono (sin desplazamiento horizontal)', fit);
    await page.evaluate(() => document.querySelector('.tp-blk-days').scrollIntoView());
    await page.screenshot({ path: path.join(process.env.SHOTS || '/tmp', 'v3240-phone.png') });
    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await context.close();
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo bien');
    if (fallas) process.exitCode = 1;
})();
