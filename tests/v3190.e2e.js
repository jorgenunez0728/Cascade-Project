// Verificación en navegador de 3.19.0 — repintar en su lugar y subir rápido lo puntual.
// (1) Operación: con un campo tecleado sin guardar, un cambio de otro equipo en OTRO campo
//     se ve (marcado) y lo tecleado se conserva con su foco; el MISMO campo pregunta.
// (2) Liberación: el checklist marcado en otro equipo aparece sin recargar y el gas
//     tecleado se conserva.
// (3) Lo puntual sube rápido; lo que se teclea se sigue juntando.
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
        operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    localStorage.setItem('kia_ui_prefs', JSON.stringify({ cardMode: false }));
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    const cfg = { 'EMISSION REGULATION': 'EURO-5', REGION: 'EUROPE' };
    const veh = (id, vin, status, td) => ({ id, vin, status, purpose: 'COP-Emisiones', configCode: 'C1', config: cfg,
        registeredAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-22T15:00:00.000Z',
        timeline: [{ timestamp: '2026-10-20T10:00:00.000Z', action: 'Alta' }], testData: td });
    localStorage.setItem('kia_db_v11', JSON.stringify({ version: '11.0', lastId: 2, vehicles: [
        veh('veh_1', 'KNA000001', 'in-progress', { odometer: 100, notes: '', preconditioning: { tirePressurePsi: 30 } }),
        veh('veh_2', 'KNA000002', 'ready-release', { odometer: 100 })
    ] }));
};

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

    console.log('\n== Operación: cambio remoto con algo tecleado sin guardar ==');
    await page.evaluate(() => cascadeOpenInOperation('veh_1'));
    await page.waitForTimeout(800);
    // La persona escribe una nota y el odómetro (sin guardar), y se queda en la nota.
    await page.evaluate(() => {
        if (typeof opCardsActive === 'function' && opCardsActive()) opCardsExit({ keepPref: true });
        const teclear = (id, v) => { const el = document.getElementById(id); el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
        teclear('op_odo', '150');
        teclear('op_notes', 'mi nota');
    });
    const antes = await page.evaluate(() => ({ unsaved: _unsavedChanges, act: document.activeElement && document.activeElement.id }));
    // Llega de otro equipo: presión de llantas 33 (campo que aquí nadie tocó) y odómetro 200 (el mismo).
    await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'veh_1');
        v.testData = Object.assign({}, v.testData, { odometer: 200, preconditioning: Object.assign({}, v.testData.preconditioning, { tirePressurePsi: 33 }) });
        v.updatedAt = '2026-10-22T15:10:00.000Z';
        cascadeOnRemoteVehicleChange();
    });
    await page.waitForTimeout(400);
    const op = await page.evaluate(() => {
        const host = el => el && (el.closest('.form-group') || el.parentElement);
        const tp = document.getElementById('tire_pressure');
        const odo = document.getElementById('op_odo');
        const clash = host(odo) && host(odo).querySelector('.cas-remote-clash');
        return { notes: document.getElementById('op_notes').value, tp: tp.value,
                 tag: !!(host(tp) && host(tp).querySelector('.cas-remote-tag')),
                 odo: odo.value, clash: clash ? clash.textContent : '',
                 act: document.activeElement && document.activeElement.id, unsaved: _unsavedChanges };
    });
    chk('lo tecleado se conserva (nota y odómetro)', op.notes === 'mi nota' && op.odo === '150', JSON.stringify(op));
    chk('el campo que cambió otro equipo se actualiza y se marca', op.tp === '33' && op.tag, JSON.stringify(op));
    chk('el mismo campo cambiado en los dos: lo dice con los dos valores', /lo cambió a 200/.test(op.clash) && /150/.test(op.clash), op.clash);
    chk('el foco sigue en la nota', antes.act === 'op_notes' && op.act === 'op_notes', antes.act + ' → ' + op.act);
    chk('sigue marcado sin guardar', op.unsaved === true);
    const usar = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('.cas-remote-clash button')).find(x => /Usar el de/.test(x.textContent));
        b.click();
        return { odo: document.getElementById('op_odo').value, nota: !!document.querySelector('.cas-remote-clash') };
    });
    chk('"Usar el de…" pone el valor del otro equipo y cierra la nota', usar.odo === '200' && !usar.nota, JSON.stringify(usar));
    // Guardar: la fusión a tres bandas conserva lo de los dos.
    await page.evaluate(() => saveProgress({ silent: true }));
    const guardado = await page.evaluate(() => { const v = db.vehicles.find(x => x.id === 'veh_1'); return { odo: v.testData.odometer, notes: v.testData.notes, tp: v.testData.preconditioning.tirePressurePsi }; });
    chk('al guardar quedan los dos cambios', String(guardado.odo) === '200' && guardado.notes === 'mi nota' && String(guardado.tp) === '33', JSON.stringify(guardado));

    console.log('\n== Liberación: el checklist llega sin recargar ==');
    await page.evaluate(() => {
        document.querySelector('.tab[data-tab="liberacion"]').click();
        const s = document.getElementById('releaseVehSelect');
        if (s && !Array.from(s.options).some(o => o.value === 'veh_2')) { const o = document.createElement('option'); o.value = 'veh_2'; s.appendChild(o); }
        s.value = 'veh_2'; loadRelease();
    });
    await page.waitForTimeout(600);
    const lib0 = await page.evaluate(() => {
        const inp = document.querySelector('#lib-content .lib-gas-input');
        if (inp) { inp.value = '0.0123'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
        return { gas: !!inp, field: inp && inp.getAttribute('data-field'), on: document.querySelectorAll('#lib-checklist-content .relcl-opt.is-on').length };
    });
    await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'veh_2');
        v.testData = Object.assign({}, v.testData, { releaseChecklist: { objects: { kds: 'ok', cardaq: 'ok' }, by: 'Beto' } });
        cascadeOnRemoteVehicleChange();
    });
    await page.waitForTimeout(400);
    const lib1 = await page.evaluate((f) => {
        const inp = f ? document.querySelector('#lib-content .lib-gas-input[data-field="' + f + '"]') : null;
        return { on: document.querySelectorAll('#lib-checklist-content .relcl-opt.is-on').length, gas: inp ? inp.value : null };
    }, lib0.field);
    chk('las filas marcadas en otro equipo aparecen', lib1.on === lib0.on + 2, JSON.stringify({ lib0, lib1 }));
    chk('el gas tecleado se conserva', lib0.gas && lib1.gas === '0.0123', JSON.stringify({ lib0, lib1 }));

    console.log('\n== Operación en tarjetas: no salta de tarjeta ==');
    await page.evaluate(() => cascadeOpenInOperation('veh_1'));
    await page.waitForTimeout(600);
    const k0 = await page.evaluate(() => {
        opCardsEnter();
        const keys = _opc.cards.map(c => c.key);
        const k = keys[Math.min(3, keys.length - 1)];
        opCardsGoToKey(k);
        return { k, cur: opCardsCurrentKey(), n: keys.length };
    });
    await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'veh_1');
        v.testData = Object.assign({}, v.testData, { notes: 'nota de otro equipo' });
        cascadeOnRemoteVehicleChange();
    });
    await page.waitForTimeout(700);
    const k1 = await page.evaluate(() => ({ cur: typeof opCardsCurrentKey === 'function' ? opCardsCurrentKey() : '', notes: document.getElementById('op_notes').value }));
    chk('sigue en la misma tarjeta tras el cambio remoto', k0.cur && k1.cur === k0.cur, JSON.stringify({ k0, k1 }));
    chk('y el dato remoto llegó', k1.notes === 'nota de otro equipo', k1.notes);
    await page.evaluate(() => { if (opCardsActive()) opCardsExit({ keepPref: true }); });

    console.log('\n== Lo puntual sube rápido ==');
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.waitForTimeout(1700);   // lo tecleado arriba ya no cuenta como tecleo
    const prisa = await page.evaluate(async () => {
        const a = fbSaveUrgency('veh');                 // sin teclear: puntual
        const b = fbSaveUrgency('veh');                 // otra enseguida: ráfaga
        const inp = document.getElementById('op_notes');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        const c = fbSaveUrgency('veh');                 // tecleando
        return { a, b, c };
    });
    chk('acción puntual 400 ms, ráfaga 1.2 s, tecleo 2.5 s', prisa.a === 400 && prisa.b === 1200 && prisa.c === 2500, JSON.stringify(prisa));

    chk('sin errores de página ni diálogos nativos', !errores.length, errores.join(' | '));
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\ntodo bien');
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
