// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.14.0 — El laboratorio en el mapa (celda + acondicionamiento)       ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Consumibles → 🗺️ Cuarto → 🚗 Laboratorio: tocar un cajón y poner una unidad por VIN (con
// alta se liga sola; sin alta queda "sin alta"), mover una unidad, editar el plano (ligar un
// equipo al F11 y arrastrarlo), y la marca 📍 en Mi semana. Escritorio 1440×950 y teléfono 430×900.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS_DIR || '';

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
    localStorage.setItem('kia_ui_prefs', JSON.stringify({ roomWhich: 'lab' }));
    const pre = new Date(Date.now() - 2 * 3600000);
    const loc = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 100, vehicles: [
        { id: 'e1', vin: 'KNAE2E0000000AAAA1', status: 'in-progress', purpose: 'COP-Emisiones', configCode: 'CFG-SITIO', registeredAt: new Date().toISOString(),
          config: { 'Modelo': 'CL4', 'EMISSION REGULATION': 'PRE-EURO 7', 'REGION': 'EUROPE', 'MODEL YEAR (VIN)': '27 MODEL' },
          testData: { preconditioning: { datetime: loc(pre), ok: 'yes', responsible: 'Ana' } }, timeline: [] }
    ] }));
};

async function abrir(browser, vp) {
    const context = await browser.newContext({ viewport: vp, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof siteRender === 'function' && typeof invState !== 'undefined' && typeof db !== 'undefined' && db.vehicles.length === 1, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { switchPlatform('inventory'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelectorAll('.toast, .toast-container > *').forEach(t => t.remove()); });
    await page.locator('#inv-tabs-bar .tp-tab', { hasText: 'Cuarto' }).click();
    await page.waitForTimeout(600);
    return { context, page, errores };
}
const prompt = async (page, value) => {
    // uiPrompt solo esconde el diálogo anterior: el campo vigente es el último.
    const inp = page.locator('#_ui_prompt').last();
    await inp.waitFor({ state: 'visible', timeout: 4000 });
    await inp.fill(value);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    console.log('\n== Escritorio 1440×950 ==');
    let { context, page, errores } = await abrir(browser, { width: 1440, height: 950 });
    const ini = await page.evaluate(() => ({
        sw: Array.from(document.querySelectorAll('.rm-switch-btn')).map(b => b.textContent.trim()).join('|'),
        items: document.querySelectorAll('#st-svg [data-item]').length, seed: SITE_ITEMS_SEED.length,
        spots: document.querySelectorAll('#st-svg [data-spot]').length, guardados: (invState.siteItems || []).length }));
    ok('el selector de mapa trae 🚗 Laboratorio y abre el plano', /Laboratorio/.test(ini.sw) && ini.spots === 5, JSON.stringify(ini));
    ok('los equipos de las fotos ya están en el plano (sembrados una vez)', ini.items === ini.seed && ini.guardados === ini.seed, JSON.stringify(ini));
    if (SHOTS) await page.locator('#st-wrap').screenshot({ path: path.join(SHOTS, 'sitio-escritorio.png') });

    // Poner la unidad con alta en el cajón 2, por su VIN
    await page.locator('#st-svg [data-spot="c2"]').dispatchEvent('pointerdown', { button: 0, pointerId: 1, clientX: 0, clientY: 0, pointerType: 'mouse' });
    await page.locator('#st-svg [data-spot="c2"]').dispatchEvent('pointerup', { button: 0, pointerId: 1, clientX: 0, clientY: 0, pointerType: 'mouse' });
    await page.waitForTimeout(250);
    const libre = await page.evaluate(() => document.getElementById('st-panel').innerText);
    ok('tocar un cajón libre ofrece poner una unidad', /Cajón 2/.test(libre) && /Poner una unidad/.test(libre), libre.slice(0, 120));
    await page.locator('#st-panel button', { hasText: 'Poner una unidad' }).click();
    await prompt(page, 'kna e2e0000000aaaa1');
    const puesta = await page.evaluate(() => { const v = db.vehicles[0]; return { site: v.site && v.site.spot, tl: (v.timeline || []).some(t => /Ubicada en Cajón 2/.test(t.action)),
        aud: auditGetView().some(e => e.action === 'unidad_ubicada'), car: !!document.querySelector('#st-svg [data-veh="e1"]'), panel: document.getElementById('st-panel').innerText }; });
    ok('con alta: el VIN la liga sola, queda en la línea de tiempo y en el historial', puesta.site === 'c2' && puesta.tl && puesta.aud && puesta.car, JSON.stringify(puesta).slice(0, 200));
    ok('su ventana dice cuánto le falta de reposo (derivado del preacondicionamiento)', /reposo: faltan/.test(puesta.panel), puesta.panel.slice(0, 200));

    // Una unidad sin alta en el cajón 3
    await page.evaluate(() => { siteSelect('spot', 'c3'); });
    await page.locator('#st-panel button', { hasText: 'Poner una unidad' }).click();
    await prompt(page, 'XYZ123456');
    const sinAlta = await page.evaluate(() => ({ u: (db.siteUnits || []).filter(u => !u.deleted).map(u => u.vin + '@' + u.spot), txt: document.getElementById('st-panel').innerText,
        kpi: document.getElementById('st-kpis').innerText }));
    ok('sin alta: queda solo con su VIN y ofrece darla de alta', sinAlta.u.join() === 'XYZ123456@c3' && /Sin alta/.test(sinAlta.txt) && /Dar de alta/.test(sinAlta.txt), JSON.stringify(sinAlta).slice(0, 220));
    const kk = await page.evaluate(() => siteKpis(_site.model, _site.look, _site.items, _site.health));
    ok('los indicadores cuentan 2 en sitio (1 con alta, 1 sin) y 1 reposando', kk.onSite === 2 && kk.withAlta === 1 && kk.noAlta === 1 && kk.soaking === 1 && /🚗\s*2/.test(sinAlta.kpi), JSON.stringify(kk));

    // Mover la unidad con alta al dinamómetro
    await page.evaluate(() => { siteSelect('veh', 'e1'); siteMoveStart('veh', 'e1'); siteMoveTo('dino'); });
    ok('mover al dinamómetro', await page.evaluate(() => db.vehicles[0].site.spot === 'dino' && !!document.querySelector('#st-svg .st-spot--dino.st-spot--busy')));

    // Editar plano: ligar el filtro de aire a un equipo del F11 y arrastrarlo
    await page.locator('#st-edit-btn').click();
    await page.waitForTimeout(300);
    await page.evaluate(() => { siteSelect('item', 'si-filtro'); });
    await page.selectOption('#st-panel select', 'E-003');
    const liga = await page.evaluate(() => ({ a: (invState.siteItems.find(i => i.id === 'si-filtro') || {}).assetId, aud: auditGetView().some(e => e.action === 'plano_equipo_liga'),
        txt: document.getElementById('st-panel').innerText }));
    ok('ligar un equipo al F11 se guarda, se audita y dice su estado', liga.a === 'E-003' && liga.aud && /Clean Cham/.test(liga.txt), JSON.stringify(liga).slice(0, 200));
    const antes = await page.evaluate(() => { const i = invState.siteItems.find(x => x.id === 'si-carrito'); return i.x0; });
    const box = await page.locator('#st-svg [data-item="si-carrito"] .st-top').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 6 });
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const despues = await page.evaluate(() => { const i = invState.siteItems.find(x => x.id === 'si-carrito'); return { x0: i.x0, aud: auditGetView().some(e => e.action === 'plano_equipo_mueve') }; });
    ok('en modo editar, arrastrar un equipo lo mueve y queda auditado', despues.x0 !== antes && despues.aud, antes + ' → ' + JSON.stringify(despues));

    // Mi semana: la marca 📍 sale de siteConfigsOnSite
    ok('Mi semana sabe qué configuraciones tienen unidad en el sitio', await page.evaluate(() => siteConfigsOnSite()['CFG-SITIO'] === 1));
    ok('sin errores de página', !errores.length, errores.join(' | '));
    await context.close();

    console.log('\n== Teléfono 430×900 ==');
    ({ context, page, errores } = await abrir(browser, { width: 430, height: 900 }));
    const fit = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, svg: !!document.getElementById('st-svg'), plano: _siteCam().el }));
    ok('cabe en el teléfono y arranca visto desde arriba', fit.doc <= fit.win + 1 && fit.svg && fit.plano === 90, JSON.stringify(fit));
    if (SHOTS) await page.locator('#st-wrap').screenshot({ path: path.join(SHOTS, 'sitio-telefono.png') });
    ok('sin errores de página', !errores.length, errores.join(' | '));
    await context.close();
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
    process.exitCode = fallas ? 1 : 0;
})();
