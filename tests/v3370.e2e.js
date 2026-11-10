// Verificación en navegador de 3.37.0 — Liberar y aprobar por pasos.
// En teléfono, Liberación y Aprobación se recorren un paso a la vez con las MISMAS tarjetas
// de siempre. Lo pendiente sale de las reglas de cop15.js, el último paso dice qué falta y
// lleva a cada cosa, un repintado no cambia de paso, y al enviar/devolver se sale solo.
// En computadora nada cambia.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const REPO = path.resolve(__dirname, '..');

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const firma = { signerName: 'Ana Signataria', sessionUserId: 'ana', dataUrl: 'data:,', signedAt: new Date().toISOString() };
    const t0 = new Date(Date.now() - 86400e3).toISOString();
    const cfg = { Modelo: 'CL4', 'EMISSION REGULATION': 'PRE-EURO 7', REGION: 'EUROPE', 'BODY TYPE': '5DR', 'ENGINE CAPACITY': '1000', TRANSMISSION: '6MT', 'MODEL YEAR (VIN)': '26 MODEL' };
    const base = (id, vin, st, gr, purpose) => ({ id, vin, status: st, purpose: purpose || 'COP-Emisiones', configCode: 'X', registeredAt: t0, config: cfg, timeline: [],
        testData: { testDatetime: t0, signatures: st === 'pending-approval' ? { releaser: firma } : {}, gasResults: gr } });
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'beto', operatorName: 'Beto Signatario', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Signatario', active: true },
        { id: 'beto', name: 'Beto Signatario', role: 'Signatario', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ vehicles: [
        base('v1', 'KNAZZZ00000000001', 'ready-release', {}),
        base('v2', 'KNAZZZ00000000002', 'pending-approval', { liberador: { values: { CO: 0.2, THC: 0.03, NMHC: 0.02, NOx: 0.01, CO2: 120 }, capturedBy: 'Ana Signataria', capturedAt: t0, passedLimits: true } })
    ], lastId: 2 }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

const abrirVeh = (page, sel, id, fn) => page.evaluate(([sel, id, fn]) => {
    const s = document.getElementById(sel);
    if (![...s.options].some(o => o.value === id)) { const o = document.createElement('option'); o.value = id; s.appendChild(o); }
    s.value = id; window[fn]();
}, [sel, id, fn]);
const estado = (page) => page.evaluate(() => ({ on: libStepsActive(), key: libStepsCurrentKey(),
    pasos: (_ls ? _ls.steps : []).map(s => s.key + (s.pending ? '*' : '')).join(','),
    alto: document.documentElement.scrollHeight, desborde: document.documentElement.scrollWidth - innerWidth,
    visibles: [...document.querySelectorAll('#lib-content > *, #appr-content > *')].filter(e => e.offsetParent).map(e => e.id || e.getAttribute('data-step') || e.className).join(','),
    nota: (document.getElementById('ls-pending') || {}).textContent || '',
    enviar: (document.getElementById('release-archive-btn') || {}).disabled, aprobar: (document.getElementById('approve-archive-btn') || {}).disabled }));
const teclear = (page, cont, vals) => page.evaluate(([cont, vals]) => {
    document.querySelectorAll('#' + cont + ' .lib-gas-input').forEach(i => { if (vals[i.dataset.field] !== undefined) { i.value = vals[i.dataset.field]; i.dispatchEvent(new Event('input', { bubbles: true })); } });
}, [cont, vals]);

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });

    console.log('\n== Teléfono 427×840 · Liberación ==');
    let page = await (await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html')); await page.waitForTimeout(2500);
    await page.evaluate(() => dashGo('cop15', 'liberacion')); await page.waitForTimeout(500);
    const antes = await page.evaluate(() => { uiPref('cardMode', false); return null; });
    await abrirVeh(page, 'releaseVehSelect', 'v1', 'loadRelease'); await page.waitForTimeout(500);
    const largo = await estado(page);
    chk('con la preferencia apagada sigue la pantalla completa', !largo.on && largo.alto > 2500, JSON.stringify({ on: largo.on, alto: largo.alto }));
    chk('… y ofrece el botón 📇 Un paso a la vez', await page.evaluate(() => { const b = document.querySelector('#lib-content .ls-toggle'); return !!b && !!b.offsetParent; }));

    await page.evaluate(() => document.querySelector('#lib-content .ls-toggle').click()); await page.waitForTimeout(400);
    let e = await estado(page);
    chk('el botón entra al modo por pasos y lo recuerda', e.on && await page.evaluate(() => uiPref('cardMode') === true));
    chk('cinco pasos; lo capturable está pendiente', e.pasos === 'resumen,resultados*,objetos*,evidencia*,enviar', e.pasos);
    chk('vehículo intacto: empieza en el resumen', e.key === 'resumen', e.key);
    chk('se ve solo ese paso y cabe en una pantalla', e.alto <= 900 && e.desborde <= 1 && !/lib-gas-entry-card|lib-checklist-card/.test(e.visibles), e.alto + ' · ' + e.visibles);

    await page.evaluate(() => libStepsNext()); await page.waitForTimeout(300);
    e = await estado(page);
    chk('Siguiente → Resultados (la tarjeta de gases de siempre)', e.key === 'resultados' && /lib-gas-entry-card/.test(e.visibles), e.visibles);
    await teclear(page, 'lib-gas-entry-content', { CO: '0.2', THC: '0.03', NMHC: '0.02', NOx: '0.01', CO2: '120' }); await page.waitForTimeout(400);
    e = await estado(page);
    chk('teclear los gases quita lo pendiente de Resultados', /resultados,/.test(e.pasos) && !/resultados\*/.test(e.pasos), e.pasos);

    await page.evaluate(() => libStepsNext()); await page.waitForTimeout(300);
    e = await estado(page);
    const grupos = await page.evaluate(() => [...document.querySelectorAll('#lib-checklist-content .relcl-group')].map(g => !!g.offsetParent).join(','));
    chk('Objetos a retirar: solo ese grupo del checklist', e.key === 'objetos' && grupos === 'true,false', grupos);
    await page.evaluate(() => document.querySelector('#lib-checklist-content .relcl-all').click()); await page.waitForTimeout(400);
    e = await estado(page);
    chk('"Todo retirado" lo completa y no cambia de paso', e.key === 'objetos' && !/objetos\*/.test(e.pasos), e.key + ' ' + e.pasos);

    await page.evaluate(() => libStepsNext()); await page.waitForTimeout(300);
    const grupos2 = await page.evaluate(() => [...document.querySelectorAll('#lib-checklist-content .relcl-group')].map(g => !!g.offsetParent).join(','));
    chk('Evidencia documental: el otro grupo', (await estado(page)).key === 'evidencia' && grupos2 === 'false,true', grupos2);

    await page.evaluate(() => loadRelease()); await page.waitForTimeout(500);
    e = await estado(page);
    chk('un repintado (cambio remoto, VETS) no cambia de paso', e.on && e.key === 'evidencia', e.key);
    await teclear(page, 'lib-gas-entry-content', { CO: '0.2', THC: '0.03', NMHC: '0.02', NOx: '0.01', CO2: '120' }); await page.waitForTimeout(300);

    await page.evaluate(() => libStepsGo(4)); await page.waitForTimeout(300);
    e = await estado(page);
    chk('último paso: dice qué falta y no ofrece Siguiente', e.key === 'enviar' && /Evidencia documental/.test(e.nota) && !/Resultados|Objetos/.test(e.nota) &&
        await page.evaluate(() => getComputedStyle(document.querySelector('#ls-foot .oc-save')).display === 'none'), e.nota);
    // El botón se habilita con los gases (como siempre); el checklist lo valida submitToApproval.
    chk('el botón de enviar se rige por la regla de siempre (gases capturados)', e.enviar === false);
    await page.evaluate(() => submitToApproval()); await page.waitForTimeout(400);
    chk('y con el checklist incompleto el candado de siempre no envía', await page.evaluate(() => db.vehicles.find(v => v.id === 'v1').status === 'ready-release'));
    await page.evaluate(() => { const m = document.getElementById('globalModal'); if (m) m.remove(); });
    await page.evaluate(() => document.querySelector('#ls-pending .ls-pending-row').click()); await page.waitForTimeout(300);
    chk('tocar lo que falta lleva a su paso', (await estado(page)).key === 'evidencia');
    await page.evaluate(() => { [...document.querySelectorAll('#lib-checklist-content .relcl-group:nth-child(2) .relcl-row')].forEach(r => { const b = r.querySelector('.relcl-opt'); if (b && !r.querySelector('.relcl-opt.is-on')) b.click(); }); });
    await page.waitForTimeout(500);
    await page.evaluate(() => libStepsGo(4)); await page.waitForTimeout(400);
    e = await estado(page);
    const cl = await page.evaluate(() => releaseChecklistRows(db.vehicles.find(v => v.id === 'v1')).missing.map(r => r.label).join(','));
    chk('con todo capturado no queda nota (o solo lo que el checklist aún pide)', cl ? /Evidencia/.test(e.nota) : e.nota === '', 'checklist: ' + cl + ' · nota: ' + e.nota);

    await page.evaluate(() => { const v = db.vehicles.find(x => x.id === 'v1'); v.status = 'pending-approval'; window.dispatchEvent(new CustomEvent('data:saved', { detail: {} })); });
    await page.waitForTimeout(500);
    chk('al dejar de estar "listo para liberar" se sale solo', !(await estado(page)).on && await page.evaluate(() => !document.body.classList.contains('lib-steps') && !document.getElementById('ls-head')));
    await page.evaluate(() => { db.vehicles.find(x => x.id === 'v1').status = 'ready-release'; });

    console.log('\n== Teléfono · Aprobación (doble ciego) ==');
    await page.evaluate(() => libSwitchSubtab('aprobador')); await page.waitForTimeout(200);
    await abrirVeh(page, 'approvalVehSelect', 'v2', 'loadApproval'); await page.waitForTimeout(600);
    e = await estado(page);
    chk('tres pasos; Verificación pendiente con el motivo del botón', e.on && e.pasos === 'resumen,verificar*,decidir', e.pasos);
    await page.evaluate(() => libStepsGo(1)); await page.waitForTimeout(300);
    const antesDe = await page.evaluate(() => ({ fam: !!document.getElementById('appr-family-check').offsetParent, falla: !!document.getElementById('appr-fail-box').offsetParent,
        txt: document.getElementById('appr-content').innerText }));
    chk('antes de coincidir no se ve la decisión de falla ni los valores del liberador', !antesDe.falla && !/0\.03|120/.test(antesDe.txt));
    await teclear(page, 'appr-gas-entry-content', { CO: '0.2', THC: '0.03', NMHC: '0.02', NOx: '0.01', CO2: '120' }); await page.waitForTimeout(500);
    e = await estado(page);
    chk('valores iguales: Verificación deja de estar pendiente', !/verificar\*/.test(e.pasos) && e.aprobar === false, e.pasos + ' disabled=' + e.aprobar);
    await page.evaluate(() => libStepsNext()); await page.waitForTimeout(300);
    e = await estado(page);
    chk('último paso: aprobar o devolver, sin nota de pendientes', e.key === 'decidir' && e.nota === '' &&
        await page.evaluate(() => !!document.getElementById('approve-archive-btn').offsetParent && !!document.getElementById('return-releaser-btn').offsetParent));
    await teclear(page, 'appr-gas-entry-content', { CO: '0.9' }); await page.waitForTimeout(500);
    e = await estado(page);
    chk('si deja de coincidir, el último paso lo dice y bloquea aprobar', /Verificación/.test(e.nota) && e.aprobar === true, e.nota);

    await page.evaluate(() => libStepsExit()); await page.waitForTimeout(300);
    chk('✕ vuelve a la pantalla completa y lo recuerda', !(await estado(page)).on && await page.evaluate(() => uiPref('cardMode') === false && !!document.querySelector('.platform-bar').offsetParent));
    await page.evaluate(() => { uiPref('cardMode', true); loadApproval(); }); await page.waitForTimeout(400);
    await page.evaluate(() => switchPlatform('today')); await page.waitForTimeout(400);
    chk('cambiar de plataforma sale del modo', !(await estado(page)).on && await page.evaluate(() => !document.body.classList.contains('lib-steps')));
    chk('sin errores de página', errores.length === 0, errores.join(' · '));
    await page.context().close();

    console.log('\n== Teléfono · automático ==');
    page = await (await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true })).newPage();
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html')); await page.waitForTimeout(2500);
    await page.evaluate(() => dashGo('cop15', 'liberacion')); await page.waitForTimeout(500);
    await abrirVeh(page, 'releaseVehSelect', 'v1', 'loadRelease'); await page.waitForTimeout(500);
    chk('sin preferencia guardada, en teléfono entra solo', (await estado(page)).on);
    await page.context().close();

    console.log('\n== Computadora 1920×1017 ==');
    page = await (await browser.newContext({ viewport: { width: 1920, height: 1017 } })).newPage();
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html')); await page.waitForTimeout(2500);
    await page.evaluate(() => dashGo('cop15', 'liberacion')); await page.waitForTimeout(500);
    await abrirVeh(page, 'releaseVehSelect', 'v1', 'loadRelease'); await page.waitForTimeout(500);
    e = await estado(page);
    chk('en computadora no entra y la pantalla es la de siempre', !e.on && /lib-gas-entry-card/.test(e.visibles) && /lib-checklist-card/.test(e.visibles), e.visibles);
    chk('el botón 📇 no se muestra', await page.evaluate(() => !document.querySelector('#lib-content .ls-toggle').offsetParent));

    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\nTodo bien');
    if (fallos.length) process.exitCode = 1;
})();
