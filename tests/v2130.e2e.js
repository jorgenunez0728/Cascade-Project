// Verificación en navegador de 2.13.0 — Operación en tarjetas (una cosa a la vez).
// Teléfono de 427×840 con toque (pointer: coarse), rol Técnico:
//  - Abrir un vehículo en Operación entra solo al modo tarjetas: una tarjeta visible,
//    encabezado con el VIN y la sección, sin la barra de la app.
//  - Guardar con un obligatorio vacío no avanza (y lo marca en el campo).
//  - Guardar guarda de verdad (saveProgress) y avanza; Enter también guarda.
//  - Deslizar SOLO navega: no llama a saveProgress.
//  - Lo capturado por tarjetas queda en testData igual que por el formulario completo.
//  - ✕ vuelve al formulario con los datos y recuerda la preferencia; 📇 vuelve a entrar.
//  - En escritorio no entra solo.
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

async function nuevoVehiculo(page, vin) {
    return page.evaluate((vin) => {
        const c = allConfigurations.find(x => x['EMISSION REGULATION'] === 'EURO-5') || allConfigurations[0];
        const id = nextVehicleId();
        db.vehicles.push({ id, vin, status: 'in-progress', purpose: 'COP-Emisiones', configCode: c.codigo_config_text,
            config: Object.assign({}, c), registeredAt: new Date().toISOString(), timeline: [], testData: {} });
        saveDB(); refreshAllLists();
        return id;
    }, vin);
}
const tarjeta = (page) => page.evaluate(() => {
    const vis = [...document.querySelectorAll('.oc-card')].filter(e => e.offsetParent !== null);
    const c = _opc && !_opc.final ? _opc.cards[_opc.idx] : null;
    return { n: vis.length, title: c ? c.title : '', idx: _opc ? _opc.idx : -1, final: !!(_opc && _opc.final) };
});

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);

    console.log('\n== Entra solo, en el teléfono y con rol Técnico ==');
    const id1 = await nuevoVehiculo(page, '3KPFT51B7TE401111');
    await page.evaluate((id) => cascadeOpenInOperation(id), id1);
    await page.waitForTimeout(1200);
    const e1 = await page.evaluate(() => ({
        active: opCardsActive(),
        head: (document.getElementById('oc-head') || {}).innerText || '',
        bar: getComputedStyle(document.getElementById('platformBar')).display,
        save: !!document.querySelector('#oc-foot .oc-save') }));
    const t1 = await tarjeta(page);
    chk('entra al modo tarjetas', e1.active && e1.save, JSON.stringify(e1));
    chk('una sola tarjeta a la vista', t1.n === 1, JSON.stringify(t1));
    chk('encabezado: VIN y sección con avance', /TE401111/.test(e1.head) && /Recepción · 1 de \d+/.test(e1.head), e1.head);
    chk('sin la barra de la app (lo único que ves es la tarjeta)', e1.bar === 'none', e1.bar);

    console.log('\n== Guardar con un obligatorio vacío no avanza ==');
    // La primera tarjeta es el operador (fichas). Se pasa a Odómetro sin guardar.
    await page.evaluate(() => opCardsLater());
    await page.waitForTimeout(200);
    const t2 = await tarjeta(page);
    await page.click('#oc-foot .oc-save');
    await page.waitForTimeout(500);
    const t3 = await tarjeta(page);
    const inv = await page.evaluate(() => document.getElementById('op_odo').getAttribute('aria-invalid'));
    chk('estamos en Odómetro', /Odómetro/.test(t2.title), t2.title);
    chk('Guardar vacío no avanza y marca el campo', t3.idx === t2.idx && inv === 'true', JSON.stringify({ t3, inv }));

    console.log('\n== Guardar guarda y avanza; Enter también ==');
    await page.fill('#op_odo', '15234');
    await page.click('#oc-foot .oc-save');
    await page.waitForTimeout(500);
    const t4 = await tarjeta(page);
    const odo = await page.evaluate((id) => db.vehicles.find(v => v.id === id).testData.odometer, id1);
    chk('el odómetro quedó guardado en el vehículo', String(odo) === '15234', String(odo));
    chk('y pasó a la siguiente tarjeta', t4.idx === t3.idx + 1, JSON.stringify(t4));
    await page.evaluate(() => opCardsGoCard(_opc.cards.findIndex(c => /Capacidad del tanque/.test(c.title))));
    await page.waitForTimeout(300);
    await page.fill('#tank_capacity', '52');
    const antes = (await tarjeta(page)).idx;
    await page.press('#tank_capacity', 'Enter');
    await page.waitForTimeout(500);
    const cap = await page.evaluate((id) => (db.vehicles.find(v => v.id === id).testData.preconditioning || {}).tankCapacityL, id1);
    chk('Enter en el campo = Guardar', String(cap) === '52' && (await tarjeta(page)).idx === antes + 1, String(cap));

    console.log('\n== Deslizar solo navega ==');
    const sw = await page.evaluate(async () => {
        let n = 0;
        const orig = window.saveProgress;
        window.saveProgress = function() { n++; return orig.apply(this, arguments); };
        const i0 = _opc.idx;
        const card = document.querySelector('.oc-current');
        const r = card.getBoundingClientRect();
        const mk = (x) => new Touch({ identifier: 1, target: card, clientX: x, clientY: r.top + 20 });
        card.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(360)], changedTouches: [mk(360)], bubbles: true }));
        card.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(120)], bubbles: true }));
        await new Promise(r2 => setTimeout(r2, 300));
        const i1 = _opc.idx;
        card.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(80)], changedTouches: [mk(80)], bubbles: true }));
        const c2 = document.querySelector('.oc-current');
        c2.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(330)], bubbles: true }));
        await new Promise(r2 => setTimeout(r2, 300));
        window.saveProgress = orig;
        return { i0, i1, i2: _opc.idx, saves: n };
    });
    chk('deslizar a la izquierda avanza y a la derecha regresa', sw.i1 === sw.i0 + 1 && sw.i2 === sw.i0, JSON.stringify(sw));
    chk('deslizar no guarda', sw.saves === 0, JSON.stringify(sw));

    console.log('\n== Resumen al final ==');
    await page.evaluate(() => { for (let i = 0; i < 60 && !_opc.final; i++) opCardsLater(); });
    await page.waitForTimeout(400);
    const fin = await page.evaluate(() => (document.getElementById('oc-final') || {}).innerText || '');
    chk('dice cuántos faltan y ofrece seguir con eso', /Te falta/.test(fin) && /Seguir con lo que falta/.test(fin), fin.slice(0, 200));
    chk('y el siguiente paso de siempre', /Iniciar prueba/.test(fin), fin.slice(0, 300));
    await page.evaluate(() => opCardsResume());
    await page.waitForTimeout(300);
    const res = await tarjeta(page);
    chk('"Seguir con lo que falta" lleva al primer pendiente (no a lo ya capturado)', !res.final && !/Odómetro|Capacidad del tanque/.test(res.title), res.title);

    console.log('\n== Mismo resultado que el formulario completo ==');
    const id2 = await nuevoVehiculo(page, '3KPFT51B7TE402222');
    // Por tarjetas
    await page.evaluate((id) => cascadeOpenInOperation(id), id2);
    await page.waitForTimeout(1200);
    await page.evaluate(() => opCardsLater());
    await page.waitForTimeout(150);
    await page.fill('#op_odo', '777'); await page.click('#oc-foot .oc-save'); await page.waitForTimeout(300);
    await page.evaluate(() => opCardsGoCard(_opc.cards.findIndex(c => /Presión de llantas inicial/.test(c.title))));
    await page.waitForTimeout(200);
    await page.fill('#tire_pressure_in', '35'); await page.click('#oc-foot .oc-save'); await page.waitForTimeout(300);
    const porTarjetas = await page.evaluate((id) => { const td = db.vehicles.find(v => v.id === id).testData; return { odo: td.odometer, psi: (td.preconditioning || {}).tirePressureInPsi }; }, id2);
    // Por el formulario completo
    const id3 = await nuevoVehiculo(page, '3KPFT51B7TE403333');
    const porFormulario = await page.evaluate(async (id) => {
        opCardsExit({ keepPref: true });
        uiPref('cardMode', false);
        cascadeOpenInOperation(id);
        await new Promise(r => setTimeout(r, 1200));
        document.getElementById('op_odo').value = '777';
        document.getElementById('tire_pressure_in').value = '35';
        saveProgress({ silent: true });
        const td = db.vehicles.find(v => v.id === id).testData;
        return { odo: td.odometer, psi: (td.preconditioning || {}).tirePressureInPsi, cards: opCardsActive() };
    }, id3);
    chk('lo capturado por tarjetas = lo capturado en el formulario', JSON.stringify(porTarjetas) === JSON.stringify({ odo: porFormulario.odo, psi: porFormulario.psi }),
        JSON.stringify({ porTarjetas, porFormulario }));
    chk('con la preferencia apagada no entra solo', porFormulario.cards === false);

    console.log('\n== ✕ vuelve al formulario; 📇 vuelve a entrar ==');
    const sx = await page.evaluate(async (id) => {
        uiPref('cardMode', 'auto');
        cascadeOpenInOperation(id);
        await new Promise(r => setTimeout(r, 1200));
        const dentro = opCardsActive();
        document.querySelector('#oc-head .oc-x').click();
        await new Promise(r => setTimeout(r, 200));
        const fuera = { active: opCardsActive(), pref: uiPref('cardMode'), bar: getComputedStyle(document.getElementById('platformBar')).display,
                        odo: document.getElementById('op_odo').value };
        document.getElementById('btn-op-cards').click();
        await new Promise(r => setTimeout(r, 300));
        return { dentro, fuera, otraVez: opCardsActive(), pref2: uiPref('cardMode') };
    }, id1);
    chk('✕ sale al formulario completo con los datos', sx.dentro && !sx.fuera.active && sx.fuera.bar !== 'none' && sx.fuera.odo === '15234', JSON.stringify(sx));
    chk('y recuerda que se apagó', sx.fuera.pref === false);
    chk('📇 vuelve a entrar y lo recuerda', sx.otraVez && sx.pref2 === true, JSON.stringify(sx));
    chk('cambiar de plataforma sale del modo', await page.evaluate(() => { switchPlatform('today'); return !opCardsActive() && !document.body.classList.contains('op-cards'); }));

    console.log('\n== En escritorio no entra solo ==');
    {
        const c2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
        const p2 = await c2.newPage();
        await p2.addInitScript(SEED);
        await p2.goto('file://' + path.join(REPO, 'index.html'));
        await p2.waitForTimeout(2500);
        const id = await nuevoVehiculo(p2, '3KPFT51B7TE404444');
        await p2.evaluate((i) => cascadeOpenInOperation(i), id);
        await p2.waitForTimeout(1200);
        chk('Técnico en escritorio: formulario completo', !(await p2.evaluate(() => opCardsActive())));
        await c2.close();
    }

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
