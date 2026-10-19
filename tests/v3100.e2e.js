// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.10.0 — El cuarto de gases en vista isométrica                      ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Consumibles → 🗺️ Cuarto: tocar un cilindro = su estado y su lectura; recibir uno nuevo
// lo deja en recepción (diablito o buffer); moverlo con "↔ Mover" o arrastrándolo.
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
const gasAt = (page, code) => page.evaluate(c => { const g = invState.gases.find(x => x.zone === c); return g ? g.id : null; }, code);
const centro = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });

    // ── Escritorio ───────────────────────────────────────────────────
    console.log('\n== Escritorio 1440×950 ==');
    let { context, page, errores } = await abrir(browser, { width: 1440, height: 950 });
    const tot = await page.evaluate(() => ({ cyl: document.querySelectorAll('#rm-svg .rm-cyl').length,
        enPlano: invRoomScene(INV_ROOM_LAYOUT, invState.zones, invState.gases).slots.filter(s => s.gasId).length,
        boton: !!Array.from(document.querySelectorAll('#inv-tabs-bar > .tp-tab')).find(b => /Cuarto/.test(b.textContent)) }));
    ok('"🗺️ Cuarto" está en la barra de Consumibles, no escondido en ⋯ Más', tot.boton);
    ok('cada cilindro con posición se dibuja en el cuarto', tot.cyl > 0 && tot.cyl === tot.enPlano, tot.cyl + ' / ' + tot.enPlano);
    ok('arranca en 3D (isométrico)', await page.evaluate(() => _invRoom.cam.el < 80));
    if (SHOTS) await page.locator('#rm-wrap').screenshot({ path: path.join(SHOTS, 'v3100-cuarto.png') });

    // Tocar un cilindro = su estado
    const idC02 = await gasAt(page, 'C02');
    // El domo: en 3D el cuerpo de C02 queda en parte detrás de C03, que se pinta delante.
    await page.locator('#rm-svg .rm-cyl[data-code="C02"] .rm-dome').click({ force: true });
    await page.waitForTimeout(300);
    const pan = await page.evaluate(() => { const h = document.getElementById('rm-panel'); return { vis: !h.hidden, txt: h.innerText }; });
    ok('tocar un cilindro abre su estado (posición, nivel, consumo, ciclo)', pan.vis && /C02/.test(pan.txt) && /Presión/.test(pan.txt) && /Conectado/.test(pan.txt), pan.txt.slice(0, 160));
    ok('el cilindro elegido queda a la vista (el panel no lo tapa)', await page.evaluate(id => {
        const n = document.querySelector('#rm-svg .rm-cyl[data-gas-id="' + id + '"]').getBoundingClientRect();
        return n.right < document.getElementById('rm-panel').getBoundingClientRect().left; }, idC02));

    // La lectura, ahí mismo
    await page.fill('#rm-psi', '3010');
    await page.locator('.rm-read-btn').click();
    await page.waitForTimeout(400);
    const lec = await page.evaluate(id => { const g = invState.gases.find(x => x.id === id); const r = g.readings[g.readings.length - 1];
        return { psi: r.psi, src: r.source, hoy: r.date === localToday(), panel: document.getElementById('rm-panel').innerText,
                 aud: auditGetView().some(e => e.action === 'gas_reading' && /3010/.test(e.details || '')) }; }, idC02);
    ok('guardar la lectura usa el escritor único (fecha de hoy, origen "cuarto", auditada)', lec.psi === 3010 && lec.src === 'cuarto' && lec.hoy && lec.aud, JSON.stringify(lec).slice(0, 200));
    ok('el panel dice que ya se leyó hoy', /Leído hoy/.test(lec.panel));
    await page.fill('#rm-psi', '');
    await page.locator('.rm-read-btn').click();
    await page.waitForTimeout(200);
    ok('una lectura vacía se rechaza en el campo, no se guarda', await page.evaluate(() => document.getElementById('rm-psi').getAttribute('aria-invalid') === 'true'));

    // Estatus desde el panel
    await page.locator('#rm-panel .ui-chips button', { hasText: 'Reserva' }).click();
    await page.waitForTimeout(300);
    const st = await page.evaluate(id => { const g = invState.gases.find(x => x.id === id);
        return { st: g.status, tl: /Cambio estatus: In use → Spare/.test(g.timeline[g.timeline.length - 1].action), aud: auditGetView().some(e => e.action === 'gas_status') }; }, idC02);
    ok('el estatus se cambia desde el panel, con línea de tiempo y auditoría', st.st === 'Spare' && st.tl && st.aud, JSON.stringify(st));

    // Recibir un cilindro nuevo: solo recepción
    await page.locator('.rm-top-actions button', { hasText: 'Recibir cilindro' }).click();
    await page.waitForTimeout(300);
    const alta = await page.evaluate(() => { const s = document.getElementById('inv-g-zone');
        const zs = Array.from(s.options).map(o => o.value).filter(Boolean); return { zonas: Array.from(new Set(zs.map(z => z[0]))).join(''), val: s.value }; });
    ok('el alta solo ofrece recepción (diablito y buffers) y propone el diablito', alta.zonas === 'GEF' && /^G0\d$/.test(alta.val), JSON.stringify(alta));
    const idsAntes = await page.evaluate(() => invState.gases.map(g => g.id));
    await page.selectOption('#inv-g-type', { index: 1 });
    await page.locator('#invModal button', { hasText: 'Guardar' }).click();
    await page.waitForTimeout(500);
    const nuevo = await page.evaluate(ids => { const g = invState.gases.find(x => ids.indexOf(x.id) < 0); return g ? { id: g.id, zone: g.zone, pos: g.position, status: g.status } : null; }, idsAntes);
    ok('el cilindro nuevo nace en el diablito y en almacén', nuevo && nuevo.zone === alta.val && nuevo.pos === parseInt(alta.val.slice(1), 10) && nuevo.status === 'Stock', JSON.stringify(nuevo));

    // Mover con "↔ Mover" + tocar una posición libre
    await page.evaluate(id => invRoomSelect(id), nuevo.id);
    await page.waitForTimeout(200);
    await page.locator('#rm-panel button', { hasText: 'Mover' }).click();
    await page.waitForTimeout(200);
    ok('modo mover: aviso arriba y posiciones libres resaltadas', await page.evaluate(() => !document.getElementById('rm-moving').hidden && document.getElementById('rm-svg').classList.contains('rm-is-moving')));
    const libre = await page.evaluate(() => invRoomScene(INV_ROOM_LAYOUT, invState.zones, invState.gases).slots.find(s => !s.gasId && s.kind === 'wall' && s.zone === 'A').code);
    await page.locator('#rm-svg .rm-slot[data-code="' + libre + '"]').click({ force: true });
    await page.waitForTimeout(500);
    const mov = await page.evaluate(id => { const g = invState.gases.find(x => x.id === id);
        return { zone: g.zone, tl: g.timeline[g.timeline.length - 1].action, aud: auditGetView().find(e => e.action === 'gas_moved') }; }, nuevo.id);
    ok('↔ Mover + tocar la posición libre lo reubica (línea de tiempo + auditoría con antes/después)', mov.zone === libre && /Reubicado: G0\d → /.test(mov.tl) && mov.aud && mov.aud.before && mov.aud.after && mov.aud.after.zone === libre, JSON.stringify({ z: mov.zone, tl: mov.tl, a: mov.aud && mov.aud.details }));
    ok('el panel avanza el ciclo a "Conectado" y sugiere marcarlo En uso', await page.evaluate(() => /Conectado/.test(document.querySelector('.rm-step--now').innerText) && /márcalo/.test(document.getElementById('rm-panel').innerText)));

    // Arrastrar con el ratón, de recepción (buffer) a una pared
    const desdeE = await page.evaluate(() => { const s = invRoomScene(INV_ROOM_LAYOUT, invState.zones, invState.gases).slots.find(x => x.gasId && x.zone === 'E'); return s && s.code; });
    const destino = await page.evaluate(() => invRoomScene(INV_ROOM_LAYOUT, invState.zones, invState.gases).slots.filter(s => !s.gasId && s.zone === 'A').pop().code);
    const idE = await gasAt(page, desdeE);
    const a = await centro(page.locator('#rm-svg .rm-cyl[data-code="' + desdeE + '"] .rm-dome'));
    const b = await centro(page.locator('#rm-svg .rm-slot[data-code="' + destino + '"]'));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y + (b.y - a.y) * i / 12);
    await page.waitForTimeout(120);
    const fantasma = await page.evaluate(() => { const t = document.querySelector('#rm-ghost text'); return t && t.textContent; });
    await page.mouse.up();
    await page.waitForTimeout(500);
    ok('al arrastrar, la posición destino se nombra antes de soltar', fantasma === destino, fantasma);
    ok('arrastrar con el ratón lo reubica en la posición libre más cercana', await page.evaluate(([id, d]) => invState.gases.find(x => x.id === id).zone === d, [idE, destino]), desdeE + ' → ' + destino);

    // Una posición ocupada no es destino
    const ocupada = await page.evaluate(() => invState.gases.find(g => g.zone === 'B01').id);
    const antes = await page.evaluate(id => invState.gases.find(x => x.id === id).zone, ocupada);
    ok('mover a una posición ocupada se rechaza', await page.evaluate(id => invDropCylinder(id, invState.gases.find(x => x.id === id).zone, 'C02') === false, ocupada) &&
        antes === await page.evaluate(id => invState.gases.find(x => x.id === id).zone, ocupada));

    // Cámara
    const z0 = await page.evaluate(() => _invRoom.cam.zoom);
    const st1 = await centro(page.locator('#rm-svg'));
    await page.mouse.move(st1.x, st1.y);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(500);
    ok('la rueda acerca', await page.evaluate(z => _invRoom.cam.zoom > z, z0));
    const az0 = await page.evaluate(() => _invRoom.cam.az);
    await page.locator('.rm-ctrl button[aria-label="Girar a la derecha"]').click();
    ok('⟳ gira 15°', await page.evaluate(a => Math.abs(_invRoom.cam.az - a - 15) < 1e-6, az0));
    await page.locator('.rm-ctrl button[aria-label="Alternar plano y 3D"]').click();
    ok('⬒ pasa a plano (desde arriba)', await page.evaluate(() => _invRoom.cam.el === 90 && !!document.querySelector('#rm-svg .rm-ring')));
    await page.waitForTimeout(500);
    ok('la cámara se recuerda en este equipo', await page.evaluate(() => (uiPref('roomCam') || {}).el === 90));
    await page.locator('.rm-ctrl button[aria-label="Vista inicial"]').click();
    ok('⌂ vuelve a la vista inicial', await page.evaluate(() => _invRoom.cam.el === INV_ROOM_CAM_DEFAULT.el && _invRoom.cam.zoom === 1));

    // Indicador → resaltado
    await page.locator('.rm-kpi', { hasText: 'Leídos hoy' }).click();
    ok('un indicador resalta en el plano (atenúa lo demás, no lo esconde)', await page.evaluate(() => document.querySelectorAll('#rm-svg .rm-cyl.rm-dim').length > 0 &&
        document.querySelectorAll('#rm-svg .rm-cyl').length === invRoomScene(INV_ROOM_LAYOUT, invState.zones, invState.gases).slots.filter(s => s.gasId).length));
    await page.locator('.rm-kpi', { hasText: 'Leídos hoy' }).click();

    // Retícula de ida y vuelta
    await page.locator('.rm-top-actions button', { hasText: 'Retícula' }).click();
    await page.waitForTimeout(300);
    ok('▦ Retícula muestra las tarjetas de siempre', await page.evaluate(() => !!document.querySelector('.inv-zonemap-grid') && !document.getElementById('rm-svg')));
    await page.locator('.inv-zonemap-toolbar button', { hasText: 'Ver el cuarto' }).click();
    await page.waitForTimeout(300);
    ok('y "🗺️ Ver el cuarto" regresa', await page.evaluate(() => !!document.getElementById('rm-svg')));
    ok('sin errores en la página', errores.length === 0, errores.join(' | '));
    await context.close();

    // ── Teléfono ─────────────────────────────────────────────────────
    console.log('\n== Teléfono 427×840 ==');
    ({ context, page, errores } = await abrir(browser, { width: 427, height: 840 }, { hasTouch: true, isMobile: true }));
    ok('en el teléfono arranca en plano', await page.evaluate(() => _invRoom.cam.el === 90));
    ok('sin desplazamiento horizontal de la página', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    ok('la cámara va en una fila sobre el plano (no tapa la pared A)', await page.evaluate(() => {
        const c = document.querySelector('.rm-ctrl').getBoundingClientRect(), s = document.getElementById('rm-svg').getBoundingClientRect(); return c.bottom <= s.top + 1; }));
    await page.locator('#rm-svg .rm-cyl[data-code="C02"] .rm-dome').tap({ force: true });
    await page.waitForTimeout(400);
    const hoja = await page.evaluate(() => { const h = document.getElementById('rm-panel').getBoundingClientRect(), s = document.getElementById('rm-stage').getBoundingClientRect();
        return { vis: !document.getElementById('rm-panel').hidden, abajo: h.bottom <= s.bottom + 1 && h.top > s.top + s.height * 0.3, ancho: h.width > s.width * 0.9 }; });
    ok('tocar un cilindro abre una hoja abajo, a todo lo ancho', hoja.vis && hoja.abajo && hoja.ancho, JSON.stringify(hoja));
    const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('rm-psi')).fontSize));
    ok('el campo de la lectura mide ≥ 16 px (iOS no hace zoom)', fs >= 16, fs);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v3100-telefono.png') });
    await page.evaluate(() => invRoomClose());

    // Dedo: arrastrar sin mantener = mover la vista; mantener presionado = mover el cilindro
    const cdp = await context.newCDPSession(page);
    const touch = async (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
    const desdeG = await page.evaluate(() => { const s = invRoomScene(INV_ROOM_LAYOUT, invState.zones, invState.gases).slots.find(x => x.gasId && x.zone === 'E'); return s.code; });
    const idG = await gasAt(page, desdeG);
    const libreA = await page.evaluate(() => invRoomScene(INV_ROOM_LAYOUT, invState.zones, invState.gases).slots.filter(s => !s.gasId && s.zone === 'A')[2].code);
    let pa = await centro(page.locator('#rm-svg .rm-cyl[data-code="' + desdeG + '"] .rm-dome'));
    const pan0 = await page.evaluate(() => _invRoom.cam.panX);
    await touch('touchStart', pa);
    for (let i = 1; i <= 6; i++) await touch('touchMove', { x: pa.x + i * 10, y: pa.y });
    await touch('touchEnd');
    await page.waitForTimeout(300);
    ok('con el dedo, arrastrar sin mantener desplaza la vista y no mueve el cilindro',
        await page.evaluate(([id, z, p0]) => invState.gases.find(x => x.id === id).zone === z && _invRoom.cam.panX !== p0, [idG, desdeG, pan0]));
    await page.evaluate(() => invRoomResetCam());
    await page.waitForTimeout(200);
    pa = await centro(page.locator('#rm-svg .rm-cyl[data-code="' + desdeG + '"] .rm-dome'));
    const pb = await centro(page.locator('#rm-svg .rm-slot[data-code="' + libreA + '"]'));
    await touch('touchStart', pa);
    await page.waitForTimeout(420);
    for (let i = 1; i <= 10; i++) await touch('touchMove', { x: pa.x + (pb.x - pa.x) * i / 10, y: pa.y + (pb.y - pa.y) * i / 10 });
    await touch('touchEnd');
    await page.waitForTimeout(500);
    ok('mantener presionado y arrastrar lo reubica', await page.evaluate(([id, d]) => invState.gases.find(x => x.id === id).zone === d, [idG, libreA]), desdeG + ' → ' + libreA);
    ok('sin errores en la página', errores.length === 0, errores.join(' | '));
    await context.close();

    await browser.close();
    console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
    process.exitCode = fallas ? 1 : 0;
})();
