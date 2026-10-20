// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.14.1 — El teclado de la tableta no borra la lectura (#213)         ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Consumibles → 🗺️ Cuarto en la tableta del reporte (753×1132, táctil): tocar un cilindro, tocar
// "Lectura de hoy" y que aparezca el teclado (la ventana se achica). Antes el mapa se repintaba,
// rehacía el panel, el campo desaparecía y el teclado se cerraba ("parpadea y no se mantiene").
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 753, height: 1132 }, hasTouch: true, isMobile: true, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.addInitScript(() => {
        if (sessionStorage.getItem('__seeded')) return;
        sessionStorage.setItem('__seeded', '1');
        localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'g', operatorName: 'Gaby Rangel', expiresAt: '2099-01-01T00:00:00.000Z' }));
        localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'g', name: 'Gaby Rangel', role: 'Practicante', active: true }], tasks: [], projects: [], alerts: [] }));
        localStorage.setItem('kia_fb_sync_modules', '{}');
        localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
        localStorage.setItem('kia_tour_done', '1');
        ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
        localStorage.setItem('kia_ui_prefs', JSON.stringify({ roomWhich: 'gas' }));
    });
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof invRoomSelect === 'function' && typeof invState !== 'undefined' && (invState.gases || []).length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => switchPlatform('inventory'));
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    await page.locator('#inv-tabs-bar .tp-tab', { hasText: 'Cuarto' }).click();
    await page.waitForTimeout(800);
    const gid = await page.evaluate(() => { const g = invState.gases.find(x => x.zone && x.status !== 'Empty'); invRoomSelect(g.id); return g.id; });
    await page.waitForTimeout(300);

    await page.locator('#rm-psi').tap();
    await page.keyboard.type('12');
    await page.evaluate(() => { window.__inp = document.getElementById('rm-psi'); });
    await page.setViewportSize({ width: 753, height: 700 });   // aparece el teclado
    await page.waitForTimeout(600);
    await page.keyboard.type('50');
    const k = await page.evaluate(() => { const i = document.getElementById('rm-psi'); return { same: i === window.__inp, focus: document.activeElement === i, value: i && i.value }; });
    ok('con el teclado abierto el campo sigue ahí, con el foco y lo escrito', k.same && k.focus && k.value === '1250', JSON.stringify(k));

    await page.evaluate(() => invRoomPaint());   // un repintado por la nube a media escritura
    const r = await page.evaluate(() => { const i = document.getElementById('rm-psi'); return { focus: document.activeElement === i, value: i && i.value }; });
    ok('un repintado a media escritura no borra lo tecleado ni quita el foco', r.focus && r.value === '1250', JSON.stringify(r));

    await page.locator('#rm-panel form.rm-read button', { hasText: 'Guardar' }).tap();
    await page.waitForTimeout(400);
    const s = await page.evaluate((id) => { const g = invState.gases.find(x => x.id === id); const last = (g.readings || []).slice(-1)[0] || {};
        const l = document.querySelector('#rm-panel .rm-read-l'); return { psi: last.psi, src: last.source, label: l ? l.textContent : '' }; }, gid);
    // Tras guardar, el panel se repinta con la lectura del turno ("✓ Leído (mañana) … — corregir", 3.16.0).
    ok('Guardar registra la lectura desde el cuarto y el panel la muestra como la de hoy', +s.psi === 1250 && s.src === 'cuarto' && /Leído \((mañana|tarde)\): 1250/.test(s.label), JSON.stringify(s));

    await page.setViewportSize({ width: 1132, height: 753 });   // girar la tableta sí reacomoda
    await page.waitForTimeout(500);
    const h = await page.evaluate(() => parseInt(document.getElementById('rm-stage').style.height, 10));
    ok('girar la tableta (cambia el ancho) sí reacomoda el tablero', h > 0 && h < 753, String(h));
    ok('sin errores de página', !errores.length, errores.join(' | '));
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo bien');
    process.exitCode = fallas ? 1 : 0;
})();
