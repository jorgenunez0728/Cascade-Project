// Verificación en navegador de 2.23.0 — HOY como bandeja "Te toca".
// Teléfono de 427×840 con toque.
//  - Un Técnico NO ve "Aprobar" en su bandeja (se cuenta como "de otros roles") y SÍ ve liberar.
//  - Un Manager ve "Aprobar", salvo lo que él mismo liberó.
//  - ⏰ pospone hasta mañana: sale de la bandeja, sigue en su categoría marcada, y se regresa.
//  - Deslizar una fila a la izquierda pospone y NO cambia de plataforma (el deslizar global
//    entre pantallas usa 150 px en `document`).
//  - Deslizar no completa nada: el vehículo no cambia.
//  - Bandeja vacía → "Todo al día" con cuántas quedaron pospuestas.
//  - Lo pospuesto es por persona: otro operador en el mismo equipo lo sigue viendo.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const ahora = Date.now();
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 't1', operatorName: 'Beto Técnico', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 't1', name: 'Beto Técnico', role: 'Técnico', active: true },
                    { id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

const bandeja = (page) => page.evaluate(() => ({
    ids: [...document.querySelectorAll('#daily-dash-content .dash-inbox .dash-row[data-dash-id]')].map(r => r.getAttribute('data-dash-id')),
    foot: (document.querySelector('#daily-dash-content .dash-inbox-foot') || {}).innerText || '',
    clear: (document.querySelector('#daily-dash-content .dash-inbox-clear') || {}).innerText || '',
    title: (document.querySelector('#daily-dash-content .dash-board-title') || {}).textContent || ''
}));
const comoUsuario = (page, id, name, role) => page.evaluate(([id, name, role]) => {
    authState.currentUser = Object.assign({}, authState.currentUser || {}, { id, name, role });
    dailyDashRender();
}, [id, name, role]);

let browser;
(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);

    // Dos vehículos: uno por aprobar (lo liberó Beto) y otro listo para liberar.
    await page.evaluate(() => {
        const c = allConfigurations[0];
        const base = (id, vin, status, extra) => Object.assign({ id, vin, status, purpose: 'COP-Emisiones', configCode: c.codigo_config_text,
            config: Object.assign({}, c), registeredAt: new Date().toISOString(), timeline: [], testData: {} }, extra || {});
        db.vehicles = [
            base(nextVehicleId(), 'KNAPPR0000000001A', 'pending-approval',
                 { testData: { signatures: { releaser: { sessionUserId: 't1', sessionUserName: 'Beto Técnico', signerName: 'Beto' } } } }),
            base(nextVehicleId(), 'KNAREL0000000002B', 'ready-release')
        ];
        saveDB();
        // Sin el inventario de fábrica (calibraciones vencidas): así la bandeja muestra lo que se prueba.
        invState.gases = []; invState.fuelTanks = []; invState.equipment = []; invState.maintActivities = []; invSave();
        window._dashInboxAll = true;
        dashGo('today');
        dailyDashRender();
    });
    await page.waitForTimeout(500);
    const vids = await page.evaluate(() => db.vehicles.map(v => v.id));

    console.log('\n== La bandeja es de quien la mira ==');
    let b = await bandeja(page);
    chk('el bloque se llama "Te toca"', /Te toca/.test(b.title), b.title);
    chk('Técnico: NO ve aprobar, SÍ ve liberar', !b.ids.includes('act-appr-' + vids[0]) && b.ids.includes('act-veh-' + vids[1]), b.ids.join(','));
    chk('lo de otros roles se cuenta al pie', /le tocan? a otros roles/.test(b.foot), b.foot);
    await comoUsuario(page, 'm1', 'Ana Manager', 'Assistant Manager / Manager');
    b = await bandeja(page);
    chk('Manager: sí ve aprobar', b.ids.includes('act-appr-' + vids[0]), b.ids.join(','));
    await page.evaluate((vid) => {
        const v = db.vehicles.find(x => x.id === vid);
        v.testData.signatures.releaser.sessionUserId = 'm1';
        dailyDashRender();
    }, vids[0]);
    b = await bandeja(page);
    chk('…pero no lo que él mismo liberó', !b.ids.includes('act-appr-' + vids[0]), b.ids.join(','));
    await comoUsuario(page, 't1', 'Beto Técnico', 'Técnico');

    console.log('\n== ⏰ posponer y regresar ==');
    const rel = 'act-veh-' + vids[1];
    await page.click('#daily-dash-content .dash-inbox .dash-row[data-dash-id="' + rel + '"] .dash-snooze-btn');
    await page.waitForTimeout(400);
    b = await bandeja(page);
    chk('sale de la bandeja', !b.ids.includes(rel), b.ids.join(','));
    chk('el pie dice cuántas están pospuestas', /1 pospuesta/.test(b.foot) || /pospuesta/.test(b.clear), b.foot + ' | ' + b.clear);
    const enCat = await page.evaluate(() => {
        uiPref('dashOpenCat', 'vehiculos'); dailyDashRender();
        const r = [...document.querySelectorAll('#daily-dash-content .dash-cat-detail .dash-row')].find(x => /REL0000000002B|0002B/.test(x.innerText));
        const out = { marcada: !!(r && r.classList.contains('dash-row--snoozed')), txt: r ? r.innerText : '' };
        uiPref('dashOpenCat', ''); dailyDashRender();
        return out;
    });
    chk('sigue en su categoría, marcada como pospuesta', enCat.marcada && /Pospuesta/.test(enCat.txt), JSON.stringify(enCat));
    await page.evaluate((id) => dashUnsnooze(id), rel);
    await page.waitForTimeout(300);
    b = await bandeja(page);
    chk('regresar la devuelve a la bandeja', b.ids.includes(rel), b.ids.join(','));

    console.log('\n== Deslizar pospone, no completa y no cambia de pantalla ==');
    const antes = await page.evaluate((vid) => JSON.stringify(db.vehicles.find(v => v.id === vid)), vids[1]);
    await page.evaluate((id) => {
        const row = document.querySelector('#daily-dash-content .dash-inbox .dash-row[data-dash-id="' + id + '"] .dash-row-main');
        const mk = (x) => new Touch({ identifier: 1, target: row, clientX: x, clientY: 300 });
        row.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(380)], changedTouches: [mk(380)] }));
        row.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [mk(300)], changedTouches: [mk(300)] }));
        row.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [mk(200)], changedTouches: [mk(200)] }));
        row.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [mk(200)] }));
    }, rel);
    await page.waitForTimeout(500);
    b = await bandeja(page);
    const despues = await page.evaluate((vid) => ({ v: JSON.stringify(db.vehicles.find(v => v.id === vid)), plat: _currentPlatform }), vids[1]);
    chk('deslizar 180 px la pospone', !b.ids.includes(rel), b.ids.join(','));
    chk('…sin cambiar de plataforma', despues.plat === 'today', despues.plat);
    chk('…y sin tocar el vehículo', despues.v === antes);

    console.log('\n== Por persona ==');
    await comoUsuario(page, 'm1', 'Ana Manager', 'Assistant Manager / Manager');
    b = await bandeja(page);
    chk('otro operador en el mismo equipo la sigue viendo', b.ids.includes(rel), b.ids.join(','));
    await comoUsuario(page, 't1', 'Beto Técnico', 'Técnico');

    console.log('\n== Bandeja vacía ==');
    await page.evaluate(() => {
        let guard = 0;
        while (guard++ < 60) {
            const r = document.querySelector('#daily-dash-content .dash-inbox .dash-row[data-dash-id]');
            if (!r) break;
            dashSnooze(r.getAttribute('data-dash-id'), { silent: true });
        }
    });
    await page.waitForTimeout(300);
    b = await bandeja(page);
    chk('"Todo al día" con lo pospuesto contado', /Todo al día/.test(b.clear) && /pospuesta/.test(b.clear), b.clear);
    chk('el encabezado dice al día', await page.evaluate(() => /al día/.test(document.querySelector('#daily-dash-content .dash-board-header').innerText)));

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));

    await browser.close();
    if (fallos.length) { console.log('\n' + fallos.length + ' FALLA(S)'); process.exitCode = 1; }
    else console.log('\ntodo bien');
})().catch(async e => { console.error(e); process.exitCode = 1; try { if (browser) await browser.close(); } catch (x) {} });
