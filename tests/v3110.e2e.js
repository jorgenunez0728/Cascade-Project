// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.11.0 — El cuarto de gasolina                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Consumibles → 🗺️ Cuarto → ⛽ Gasolina: tarimas con tambos, el total de cada tipo,
// tocar un tambo = su nivel y su lectura en litros, alta en una posición libre, mover.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS_DIR || '';

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const SEED = () => {
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: '2099-01-01T00:00:00.000Z' }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

async function abrir(browser, vp, extra) {
    const context = await browser.newContext(Object.assign({ viewport: vp, timezoneId: 'America/Mexico_City', locale: 'es-MX' }, extra || {}));
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof invRoomRender === 'function' && typeof invState !== 'undefined' && invState.gases.length > 0, null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { switchPlatform('inventory'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelectorAll('.toast, .toast-container > *').forEach(t => t.remove()); });
    await page.locator('#inv-tabs-bar .tp-tab', { hasText: 'Cuarto' }).click();
    await page.waitForTimeout(500);
    return { context, page, errores };
}
const centro = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const tanqueEn = (page, pos) => page.evaluate(p => { const t = invState.fuelTanks.find(x => x.pos === p); return t ? t.id : null; }, pos);
const totalDe = (page, name) => page.evaluate(n => { const r = invFuelTypeTotals(invState.fuelTypes, invState.fuelTanks).find(x => x.name === n); return r ? r.liters : null; }, name);

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });

    console.log('\n== Escritorio 1440×950 ==');
    let { context, page, errores } = await abrir(browser, { width: 1440, height: 950 });
    ok('arranca en el cuarto de gases, con el selector de cuarto en la barra', await page.evaluate(() =>
        _invRoomWhich() === 'gases' && document.querySelectorAll('.rm-switch-btn').length === 2 && document.querySelectorAll('#rm-svg .rm-cyl').length > 0));
    await page.locator('.rm-switch-btn[data-room="gasolina"]').click();
    await page.waitForTimeout(600);
    const base = await page.evaluate(() => ({
        which: _invRoomWhich(), pref: uiPref('roomWhich'),
        posiciones: document.querySelectorAll('#rm-svg .rm-slot').length + document.querySelectorAll('#rm-svg .rm-cyl').length,
        tarimas: document.querySelectorAll('#rm-svg .rm-pallet').length, drenaje: !!document.querySelector('#rm-svg .rm-mark--drain'),
        tipos: invFuelTypesLive().map(t => t.name).join(','), sinLugar: (document.getElementById('rm-foot-btns').innerText.match(/No se ven en el plano\s*(\d+)/) || [])[1],
        totales: invState.fuelTanks.filter(t => invFuelIsLegacyTotal(t)).length, tambos: invState.fuelTanks.length,
        nota: (invRoomToggleList(true), /Totales anteriores/.test(document.getElementById('rm-list').innerText)), zonas: Array.from(document.querySelectorAll('#rm-zonenav [data-zone]')).map(b => b.dataset.zone).join(',') }));
    ok('⛽ Gasolina: el plano del cuarto de gasolina (25 posiciones, 7 recuadros, el drenaje)', base.which === 'gasolina' && base.posiciones === 25 && base.tarimas === 7 && base.drenaje, JSON.stringify(base));
    ok('la elección del cuarto se recuerda en este equipo', base.pref === 'gasolina');
    ok('los tipos se siembran de las regulaciones que ya tenían los tambos', base.tipos === 'CARB LEV III,EURO VI', base.tipos);
    ok('los registros de antes son TOTALES por tipo: no son tambos ni "sin lugar", y se declaran', base.totales === base.tambos && base.tambos === 3 && !base.sinLugar && base.nota, JSON.stringify(base));
    await page.evaluate(() => invRoomToggleList(false));
    ok('las tarimas y las boyas se pueden ver de frente', base.zonas === 'T1,T2,T3,T4,T5,T6,B', base.zonas);
    const e6antes = await totalDe(page, 'EURO VI');

    // Alta de un tambo en una posición libre
    await page.locator('#rm-svg .rm-slot[data-code="T1-1"]').click({ force: true });
    await page.waitForTimeout(300);
    ok('tocar una posición libre ofrece dar de alta un tambo (un total anterior no se ofrece para acomodar)', await page.evaluate(() =>
        document.querySelectorAll('#rm-panel .rm-cand').length === 0 && !!document.getElementById('rm-new-type')));
    await page.locator('#rm-panel button', { hasText: 'Dar de alta' }).click();
    ok('sin tipo no se da de alta: el error va en el campo', await page.evaluate(() => invState.fuelTanks.length === 3 && !!document.querySelector('#rm-panel [role=alert]')));
    await page.evaluate(() => { const s = document.getElementById('rm-new-type'); s.value = invFuelTypesLive().find(t => t.name === 'EURO VI').id; s.dispatchEvent(new Event('change')); });
    await page.locator('#rm-new-lvl').fill('50');
    await page.locator('#rm-panel button', { hasText: 'Dar de alta' }).click();
    await page.waitForTimeout(300);
    const nuevo = await tanqueEn(page, 'T1-1');
    ok('alta en T1-1: 50 L de 225, EURO VI, y su ventana queda abierta', !!nuevo && await page.evaluate(id => {
        const t = invState.fuelTanks.find(x => x.id === id);
        return t.currentLevel === 50 && t.capacity === 225 && t.regulation === 'EURO VI' && _invRoom.sel === id && !!document.querySelector('#rm-svg .rm-cyl[data-code="T1-1"]'); }, nuevo));
    ok('sin tambos, EURO VI daba su total anterior; con el primero, cuentan solo los tambos (50 L)', e6antes === 779.5 && await totalDe(page, 'EURO VI') === 50, (await totalDe(page, 'EURO VI')) + ' vs ' + e6antes);
    ok('su recuadro en la barra dice el total del tipo', await page.evaluate(n => Array.from(document.querySelectorAll('.rm-kpi--type')).some(b => /EURO VI/.test(b.textContent) && b.textContent.indexOf((Math.round(n) + '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')) >= 0), await totalDe(page, 'EURO VI')));
    if (SHOTS) await page.locator('#rm-stage').screenshot({ path: path.join(SHOTS, 'v3110-alta.png') });

    // Lectura en litros, ahí mismo
    await page.locator('#rm-panel .rm-fracs button', { hasText: '½' }).click();
    ok('½ llena la lectura con la mitad de lo que le cabe', await page.evaluate(() => document.getElementById('rm-psi').value === '113'));
    await page.locator('#rm-psi').fill('200');
    await page.locator('#rm-panel button', { hasText: 'Guardar' }).click();
    await page.waitForTimeout(300);
    ok('Guardar registra la lectura por invAddFuelReading (origen cuarto)', await page.evaluate(id => {
        const t = invState.fuelTanks.find(x => x.id === id), r = t.readings[t.readings.length - 1];
        return t.currentLevel === 200 && r.level === 200 && r.source === 'cuarto' && /Leído hoy/.test(document.getElementById('rm-panel').innerText); }, nuevo));
    await page.evaluate(() => { const s = document.getElementById('rm-status'); s.value = 'Cerrado'; s.dispatchEvent(new Event('change')); });
    ok('el estatus se cambia desde la ventana (con auditoría)', await page.evaluate(id => invState.fuelTanks.find(x => x.id === id).fuelStatus === 'Cerrado' &&
        auditGetView().some(e => e.action === 'fuel_status'), nuevo));

    // Acomodar uno sin lugar
    await page.evaluate(() => invRoomClose());
    // Un tambo dado de alta en ⛽ Combustible (sin posición) sí queda "sin lugar".
    const sinLugar = await page.evaluate(() => invFuelTankCreate({ typeId: invFuelTypesLive()[0].id, capacity: 225, level: 100 }).tank.id);
    await page.evaluate(() => invRoomPaint());
    await page.locator('#rm-svg .rm-slot[data-code="T2-1"]').click({ force: true });
    await page.waitForTimeout(200);
    await page.locator('#rm-panel .rm-cand').first().click();
    await page.waitForTimeout(300);
    ok('"Acomodar aquí" pone un tambo sin lugar en la posición (auditoría antes/después)', await page.evaluate(id => {
        const a = auditGetView().find(e => e.action === 'fuel_moved');
        return invState.fuelTanks.find(x => x.id === id).pos === 'T2-1' && a && a.after && a.after.pos === 'T2-1'; }, sinLugar));

    // Arrastrar con el ratón
    await page.evaluate(() => invRoomClose());
    const a = await centro(page.locator('#rm-svg .rm-cyl[data-code="T1-1"] .rm-dome'));
    const b = await centro(page.locator('#rm-svg .rm-slot[data-code="T1-4"]'));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y + (b.y - a.y) * i / 12);
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(400);
    ok('arrastrar un tambo con el ratón lo reubica', await page.evaluate(id => invState.fuelTanks.find(x => x.id === id).pos, nuevo) === 'T1-4');

    // Resaltar por tipo
    await page.locator('.rm-kpi--type', { hasText: 'CARB LEV III' }).click();
    ok('tocar un tipo resalta sus tambos (atenúa los demás, no los esconde)', await page.evaluate(() => {
        const d = document.querySelectorAll('#rm-svg .rm-cyl.rm-dim').length, all = document.querySelectorAll('#rm-svg .rm-cyl').length;
        return d > 0 && d < all; }));
    await page.locator('.rm-kpi--type', { hasText: 'CARB LEV III' }).click();

    // Entrar a una tarima
    await page.locator('#rm-zonenav button[data-zone="T1"]').click();
    await page.waitForTimeout(1300);
    ok('entrar a T1: la cámara vuela, la tarima se abre en una fila y salen los datos de cada tambo', await page.evaluate(() =>
        _invRoom.focus === 'T1' && _invRoom.explode.T1 === 1 && document.querySelectorAll('#rm-svg .rm-flbl').length === 4 && /T1 · Tarima 1/.test(document.getElementById('rm-focusbar').innerText)));
    if (SHOTS) await page.locator('#rm-stage').screenshot({ path: path.join(SHOTS, 'v3110-t1.png') });
    await page.locator('#rm-focusbar .rm-focus-step', { hasText: 'T2' }).click();
    await page.waitForTimeout(1300);
    ok('› pasa a la tarima vecina sin volver a la vista general', await page.evaluate(() => _invRoom.focus === 'T2'));
    await page.locator('#rm-focusbar .rm-focus-back').click();
    await page.waitForTimeout(1300);
    ok('← Vista anterior regresa a todo el cuarto', await page.evaluate(() => !_invRoom.focus && !_invRoom.flying));

    // Catálogo de tipos
    await page.locator('.rm-bar-btn', { hasText: 'Tipos' }).click();
    await page.waitForTimeout(300);
    await page.locator('#rm-ft-name-new').fill('Premium');
    await page.locator('#rm-ft-reo-new').fill('300');
    await page.locator('#rm-ftypes button', { hasText: 'Agregar' }).click();
    await page.waitForTimeout(300);
    ok('⛽ Tipos agrega un tipo (el laboratorio decide cuántos hay)', await page.evaluate(() => invFuelTypesLive().some(t => t.name === 'Premium' && t.reorderLevel === 300) &&
        document.querySelectorAll('#rm-ftypes .rm-ftrow').length === 4));
    await page.locator('#rm-ftypes .rm-ftrow', { hasText: 'EURO VI' }).locator('button', { hasText: 'Quitar' }).click();
    await page.waitForTimeout(200);
    ok('no deja quitar un tipo que tiene tambos', await page.evaluate(() => invFuelTypesLive().some(t => t.name === 'EURO VI')));
    await page.evaluate(() => { const m = document.getElementById('globalModal'); if (m) m.remove(); });

    // Regresar a gases
    await page.locator('.rm-switch-btn[data-room="gases"]').click();
    await page.waitForTimeout(500);
    ok('🧪 Gases regresa al cuarto de gases, intacto', await page.evaluate(() => _invRoomWhich() === 'gases' &&
        document.querySelectorAll('#rm-svg .rm-cyl').length === invRoomScene(INV_ROOM_LAYOUT, invState.zones, invState.gases).slots.filter(s => s.gasId).length && !document.querySelector('#rm-svg .rm-pallet')));
    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await context.close();

    console.log('\n== Teléfono 427×840 ==');
    ({ context, page, errores } = await abrir(browser, { width: 427, height: 840 }, { hasTouch: true, isMobile: true }));
    await page.locator('.rm-switch-btn[data-room="gasolina"]').tap();
    await page.waitForTimeout(600);
    ok('en el teléfono también: el cuarto de gasolina', await page.evaluate(() => _invRoomWhich() === 'gasolina' && document.querySelectorAll('#rm-svg .rm-pallet').length === 7));
    await page.evaluate(() => invRoomFuelAddDrum());
    await page.waitForTimeout(300);
    const hoja = await page.evaluate(() => { const r = document.getElementById('rm-panel').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, sw: document.documentElement.scrollWidth }; });
    ok('＋ Tambo abre el alta en la primera posición libre, como hoja abajo, sin salirse de la pantalla', await page.evaluate(() => _invRoom.selSlot === 'T1-1' && !!document.getElementById('rm-new-cap')) &&
        hoja.l >= 0 && hoja.r <= hoja.w + 1 && hoja.sw <= hoja.w + 1, JSON.stringify(hoja));
    const formAncho = await page.evaluate(() => { const f = document.querySelector('#rm-panel .rm-newdrum'), p = document.getElementById('rm-panel'); return f.scrollWidth <= p.clientWidth + 1; });
    ok('el formulario cabe en la hoja (nada se corta a la derecha)', formAncho);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v3110-telefono.png') });
    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await context.close();

    await browser.close();
    console.log('\n' + (fallas ? fallas + ' FALLAS' : 'todo bien'));
    process.exitCode = fallas ? 1 : 0;
})();
