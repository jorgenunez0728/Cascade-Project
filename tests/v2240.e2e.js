// Verificación en navegador de 2.24.0 — Ficha universal. Teléfono de 427×840 con toque.
//  - En HOY el nombre de la cosa abre su ficha, sin cambiar de plataforma.
//  - Relaciones: tocar una abre su ficha encima; ‹ regresa a la anterior.
//  - El lanzador encuentra COSAS (VIN, cilindro, proyecto), no solo pantallas.
//  - La acción siguiente navega a la pantalla de siempre y NO escribe nada.
//  - Arrastrar la hoja hacia abajo la cierra; Escape también. Sin desbordes horizontales.
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
        operators: [{ id: 't1', name: 'Beto Técnico', role: 'Técnico', active: true }],
        tasks: [], alerts: [],
        projects: [{ id: 'pj1', name: 'Reparar túnel de dilución', status: 'activo', owner: 'Beto Técnico',
                     steps: [{ id: 's1', title: 'Cotizar pieza', status: 'pendiente', targetDate: '2026-09-01', responsible: 'Beto Técnico' }], log: [] }] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

const ficha = (page) => page.evaluate(() => {
    const el = document.getElementById('ficha');
    if (!el) return null;
    const back = el.querySelector('.ficha-back');
    return { title: (el.querySelector('.ficha-title') || {}).textContent || '',
             kicker: (el.querySelector('.ficha-kicker') || {}).textContent || '',
             body: (el.querySelector('#ficha-body') || {}).innerText || '',
             back: back ? getComputedStyle(back).visibility : '',
             rels: [...el.querySelectorAll('.ficha-rel')].map(b => b.innerText.replace(/\s+/g, ' ').trim()),
             plat: _currentPlatform };
});

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

    const VIN = 'KNAFCH0000000024A';
    await page.evaluate((VIN) => {
        const c = allConfigurations[0];
        db.vehicles = [{ id: nextVehicleId(), vin: VIN, status: 'ready-release', purpose: 'COP-Emisiones',
            configCode: c.codigo_config_text, config: Object.assign({}, c), registeredAt: new Date().toISOString(),
            timeline: [{ timestamp: new Date().toISOString(), action: 'Vehículo registrado', user: 'Beto' }], testData: {} }];
        saveDB();
        invState.gases = [{ id: 'gF1', formula: 'CO/N2', controlNo: 'CO-FICHA', concNominal: '50 ppm', zone: 'C02', status: 'In use',
                            validUntil: '2020-01-01', readings: [{ date: '2026-09-01', psi: 2000 }, { date: '2026-09-20', psi: 1800 }] }];
        invState.fuelTanks = []; invState.equipment = []; invState.maintActivities = []; invSave();
        window._dashInboxAll = true;
        dashGo('today');
        dailyDashRender();
    }, VIN);
    await page.waitForTimeout(500);
    const vid = await page.evaluate(() => db.vehicles[0].id);

    console.log('\n== Desde HOY ==');
    const link = '#daily-dash-content .dash-inbox .dash-row[data-dash-id="act-veh-' + vid + '"] .ficha-link';
    chk('el nombre del vehículo en "Te toca" es tocable', await page.$(link) !== null);
    await page.tap(link);
    await page.waitForTimeout(450);
    let f = await ficha(page);
    chk('abre la ficha del vehículo', f && f.title === VIN, JSON.stringify(f));
    chk('…sin cambiar de plataforma', f && f.plat === 'today', f && f.plat);
    chk('dice qué es y en qué etapa va', f && /Vehículo/.test(f.kicker) && /Etapa 7\/8/.test(f.body), f && f.body.slice(0, 200));
    chk('una sola acción siguiente: la de getNextStep', await page.evaluate(() => document.querySelectorAll('#ficha .ficha-next').length === 1 &&
        /Liberar el vehículo/.test(document.querySelector('#ficha .ficha-next').textContent)));
    chk('en la primera ficha no hay ‹', f && f.back === 'hidden', f && f.back);
    chk('relaciones: su configuración y su familia', f && f.rels.some(r => /Configuración/.test(r)) && f.rels.some(r => /Familia/.test(r)), JSON.stringify(f && f.rels));
    chk('la hoja no desborda a lo ancho', await page.evaluate(() => document.documentElement.scrollWidth <= 427 &&
        document.querySelector('#ficha .ficha-sheet').getBoundingClientRect().width <= 427));

    console.log('\n== Relaciones: encima y ‹ regresa ==');
    await page.tap('#ficha .ficha-rel >> nth=0');
    await page.waitForTimeout(350);
    f = await ficha(page);
    chk('la configuración se abre encima', f && /Configuración/.test(f.kicker), f && f.kicker);
    chk('…y ahora sí hay ‹', f && f.back === 'visible');
    chk('la configuración lista al vehículo de vuelta', f && f.rels.some(r => r.includes(VIN)), JSON.stringify(f && f.rels));
    await page.tap('#ficha .ficha-back');
    await page.waitForTimeout(350);
    f = await ficha(page);
    chk('‹ regresa al vehículo', f && f.title === VIN, f && f.title);
    const famIdx = f.rels.findIndex(r => /Familia/.test(r));
    await page.tap('#ficha .ficha-rel >> nth=' + famIdx);
    await page.waitForTimeout(350);
    f = await ficha(page);
    chk('la familia se abre y dice que es un aviso, no un veredicto (si hay semáforo) o lista su vehículo',
        f && /Familia/.test(f.kicker) && (f.rels.some(r => r.includes(VIN)) || /no un veredicto/.test(f.body)), f && f.body.slice(0, 300));

    console.log('\n== Cerrar ==');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    chk('Escape la cierra', await page.$('#ficha') === null);
    chk('…y libera el scroll de la página', await page.evaluate(() => !document.body.classList.contains('ficha-open')));

    console.log('\n== El lanzador busca cosas ==');
    await page.evaluate(() => openCommandPalette('launcher'));
    await page.fill('#command-palette-input', VIN.slice(-8));
    await page.waitForTimeout(200);
    const res = await page.evaluate(() => [...document.querySelectorAll('#command-palette-results .cmd-item')].map(x => x.innerText.replace(/\s+/g, ' ')));
    chk('encuentra el vehículo por el final del VIN', res.some(r => r.includes(VIN) && /Vehículo/.test(r)), JSON.stringify(res));
    const idx = res.findIndex(r => r.includes(VIN));
    await page.tap('#command-palette-results .cmd-item >> nth=' + idx);
    await page.waitForTimeout(450);
    f = await ficha(page);
    chk('tocar el resultado abre su ficha', f && f.title === VIN, JSON.stringify(f));

    console.log('\n== Arrastrar hacia abajo cierra ==');
    await page.evaluate(() => {
        const grip = document.querySelector('#ficha .ficha-grip');
        const r = grip.getBoundingClientRect();
        const mk = (y) => new Touch({ identifier: 1, target: grip, clientX: r.left + 20, clientY: y });
        grip.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(r.top)], changedTouches: [mk(r.top)] }));
        grip.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [mk(r.top + 80)], changedTouches: [mk(r.top + 80)] }));
        grip.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [mk(r.top + 200)], changedTouches: [mk(r.top + 200)] }));
        grip.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [mk(r.top + 200)] }));
    });
    await page.waitForTimeout(300);
    chk('arrastrar 200 px la cierra', await page.$('#ficha') === null);
    chk('…sin cambiar de plataforma (el deslizar global no se entera)', await page.evaluate(() => _currentPlatform === 'today'));

    console.log('\n== Cilindro y proyecto ==');
    await page.evaluate(() => fichaOpen('cilindro', 'gF1'));
    await page.waitForTimeout(300);
    f = await ficha(page);
    chk('cilindro: nivel, vigencia vencida e historia de lecturas', f && /CO\/N2/.test(f.title) && /Vencido/.test(f.body) && /1800 psi/.test(f.body), f && f.body.slice(0, 300));
    await page.evaluate(() => fichaClose());
    await page.evaluate(() => fichaOpen('proyecto', 'pj1'));
    await page.waitForTimeout(300);
    f = await ficha(page);
    chk('proyecto: avance, vencidos y siguiente paso', f && /Reparar túnel/.test(f.title) && /Vencidos/.test(f.body) && /Cotizar pieza/.test(f.body), f && f.body.slice(0, 300));
    await page.evaluate(() => fichaClose());
    await page.evaluate(() => fichaOpen('vehiculo', 'no-existe'));
    await page.waitForTimeout(200);
    f = await ficha(page);
    chk('algo que ya no existe lo dice, no deja la hoja en blanco', f && /ya no existe/.test(f.body), f && f.body);
    await page.evaluate(() => fichaClose());

    console.log('\n== La acción siguiente navega y no escribe ==');
    const antes = await page.evaluate(() => JSON.stringify(db.vehicles[0]));
    await page.evaluate((vid) => fichaOpen('vehiculo', vid), vid);
    await page.waitForTimeout(300);
    await page.tap('#ficha .ficha-next');
    await page.waitForTimeout(900);
    const despues = await page.evaluate(() => ({ v: JSON.stringify(db.vehicles[0]), plat: _currentPlatform, abierta: !!document.getElementById('ficha') }));
    chk('cierra la ficha y lleva a Pruebas', !despues.abierta && despues.plat === 'cop15', JSON.stringify({ plat: despues.plat, abierta: despues.abierta }));
    chk('…sin tocar el vehículo', despues.v === antes);

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));

    await browser.close();
    if (fallos.length) { console.log('\n' + fallos.length + ' FALLA(S)'); process.exitCode = 1; }
    else console.log('\ntodo bien');
})().catch(async e => { console.error(e); process.exitCode = 1; try { if (browser) await browser.close(); } catch (x) {} });
