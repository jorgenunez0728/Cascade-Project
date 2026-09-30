// Verificación en navegador de 2.25.0 — Desde tu última vez. Teléfono de 427×840 con toque.
//  - Al entrar después de más de 4 h, se abre el relevo con lo que cambió: el cambio neto de
//    estado de cada vehículo y lo del historial de otras personas (lo propio no).
//  - Cada línea abre la ficha de su cosa encima; ‹ regresa al relevo.
//  - "Lo que te toca ahora" lleva a HOY, donde la franja "Desde tu última vez" lo reabre.
//  - Recargar al rato NO lo vuelve a abrir (menos de 4 h); volver a la app horas después sí.
//  - No escribe nada del laboratorio.
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
    if (sessionStorage.getItem('seeded')) return;      // solo la primera carga
    sessionStorage.setItem('seeded', '1');
    const ahora = Date.now();
    const iso = h => new Date(ahora - h * 3600e3).toISOString();
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 't1', operatorName: 'Beto Técnico', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 't1', name: 'Beto Técnico', role: 'Técnico', active: true }, { id: 'a1', name: 'Ana Signataria', role: 'Signatario', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    // Beto usó este equipo por última vez hace 10 h.
    localStorage.setItem('kia_ui_prefs', JSON.stringify({ lastSeen: { 'Beto Técnico': iso(10) } }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ version: '11.0', lastId: 0, vehicles: [
        { id: 'v-rel-1', vin: 'KNARLV0000000001A', status: 'pending-approval', purpose: 'COP-Emisiones', registeredAt: iso(48), testData: {},
          config: {}, timeline: [{ timestamp: iso(30), action: 'Estado cambiado a: En curso', data: { status: 'in-progress' } },
                                 { timestamp: iso(3), action: 'Enviado a Aprobación', user: 'Ana', data: { status: 'pending-approval' } }] },
        { id: 'v-rel-2', vin: 'KNARLV0000000002B', status: 'testing', purpose: 'COP-Emisiones', registeredAt: iso(48), testData: {},
          config: {}, timeline: [{ timestamp: iso(30), action: 'x', data: { status: 'testing' } }] }
    ] }));
    const ev = (id, h, name, action, entity, details) => ({ v: 1, id, ts: iso(h), user: { name, role: '' }, mod: 'tp', action, entity, details: details || '' });
    localStorage.setItem('kia_audit_trail', JSON.stringify([
        ev('a1', 20, 'Ana Signataria', 'week_accepted', { type: 'plan', label: '2026-09-21' }),      // antes: no entra
        ev('a2', 5, 'Ana Signataria', 'week_accepted', { type: 'plan', label: '2026-10-05' }),
        ev('a3', 4, 'Beto Técnico', 'capacity_changed', { type: 'plan', label: 'pruebas por semana' }, '4 → 6'),   // propio: no entra
        ev('a4', 2, 'Ana Signataria', 'login', { type: 'operator', label: 'Ana Signataria' })          // no es relevo
    ]));
};

const ficha = (page) => page.evaluate(() => {
    const el = document.getElementById('ficha');
    if (!el) return null;
    return { title: (el.querySelector('.ficha-title') || {}).textContent || '',
             body: (el.querySelector('#ficha-body') || {}).innerText || '',
             lines: [...el.querySelectorAll('.ficha-line')].map(x => x.innerText.replace(/\s+/g, ' ').trim()) };
});
const esperaFicha = async (page, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const f = await ficha(page); if (f) return f; await page.waitForTimeout(300); }
    return null;
};

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

    console.log('\n== Al entrar después de 10 h ==');
    let f = await esperaFicha(page, 25000);
    chk('se abre el relevo solo', f && f.title === 'Desde tu última vez', JSON.stringify(f));
    const dbAntes = await page.evaluate(() => localStorage.getItem('kia_db_v11'));
    chk('dice desde cuándo', f && /Desde (hoy|ayer)/.test(f.body), f && f.body.slice(0, 160));
    chk('vehículo: cambio neto de estado', f && f.lines.some(l => /KNARLV0000000001A: En curso → Pendiente de aprobación/i.test(l) || (/0001A/.test(l) && /→/.test(l))), JSON.stringify(f && f.lines));
    chk('un vehículo que no cambió no aparece', f && !f.lines.some(l => /0002B/.test(l)));
    chk('lo de otra persona sí: Ana aceptó la semana', f && f.lines.some(l => /Ana Signataria aceptó la semana del 2026-10-05/.test(l)), JSON.stringify(f && f.lines));
    chk('lo propio no (Beto cambió la capacidad)', f && !f.lines.some(l => /capacidad/.test(l)));
    chk('lo anterior a tu última vez no', f && !f.lines.some(l => /2026-09-21/.test(l)));
    chk('entrar y salir de sesión no es relevo', f && !/login|entró/i.test(f.body));
    chk('"Lo que te toca ahora" va al final', await page.evaluate(() => {
        const b = document.querySelector('#ficha .ficha-next'), last = [...document.querySelectorAll('#ficha .ficha-line')].pop();
        return !!(b && last && (last.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    }));
    chk('la última vez de Beto ya se selló (≈ ahora)', await page.evaluate(() => Date.now() - Date.parse(uiPref('lastSeen')['Beto Técnico']) < 60000));

    console.log('\n== Una línea abre su ficha encima ==');
    await page.tap('#ficha .ficha-line-btn >> nth=0');
    await page.waitForTimeout(350);
    f = await ficha(page);
    chk('abre el vehículo', f && f.title === 'KNARLV0000000001A', f && f.title);
    await page.tap('#ficha .ficha-back');
    await page.waitForTimeout(350);
    f = await ficha(page);
    chk('‹ regresa al relevo', f && f.title === 'Desde tu última vez');

    console.log('\n== A trabajar ==');
    await page.tap('#ficha .ficha-next');
    await page.waitForTimeout(700);
    const hoy = await page.evaluate(() => ({ plat: _currentPlatform, abierta: !!document.getElementById('ficha'),
        strip: (document.querySelector('#daily-dash-content .relevo-strip') || {}).innerText || '' }));
    chk('cierra y deja en HOY', !hoy.abierta && hoy.plat === 'today', JSON.stringify(hoy));
    chk('HOY conserva la franja con cuántos cambios', /Desde tu última vez/.test(hoy.strip) && /2 cambios/.test(hoy.strip), hoy.strip);
    await page.tap('#daily-dash-content .relevo-strip');
    await page.waitForTimeout(400);
    f = await ficha(page);
    chk('la franja lo reabre', f && f.title === 'Desde tu última vez');
    await page.evaluate(() => fichaClose());
    chk('no escribió nada del laboratorio', await page.evaluate(() => localStorage.getItem('kia_db_v11')) === dbAntes);

    console.log('\n== Recargar al rato: no es relevo ==');
    await page.reload();
    await page.waitForTimeout(6000);
    chk('no se abre', await ficha(page) === null);
    chk('y no hay franja', await page.evaluate(() => !document.querySelector('#daily-dash-content .relevo-strip')));

    console.log('\n== Volver a la app horas después (tableta con la sesión abierta) ==');
    await page.evaluate(() => {
        uiPref('lastSeen', { 'Beto Técnico': new Date(Date.now() - 6 * 3600e3).toISOString() });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    f = await esperaFicha(page, 8000);
    chk('al volver a primer plano se abre el relevo', f && f.title === 'Desde tu última vez', JSON.stringify(f));
    await page.evaluate(() => fichaClose());

    console.log('\n== No encima de otra cosa ==');
    await page.evaluate(() => {
        uiPref('lastSeen', { 'Beto Técnico': new Date(Date.now() - 6 * 3600e3).toISOString() });
        showModal({ title: 'Algo', message: 'Un diálogo abierto' });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(2500);
    chk('con un diálogo abierto no se abre', await ficha(page) === null);

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));

    await browser.close();
    if (fallos.length) { console.log('\n' + fallos.length + ' FALLA(S)'); process.exitCode = 1; }
    else console.log('\ntodo bien');
})().catch(async e => { console.error(e); process.exitCode = 1; try { if (browser) await browser.close(); } catch (x) {} });
