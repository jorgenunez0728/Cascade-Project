// Verificación en navegador de 2.21.0 — "Una cosa a la vez" fuera de Operación (uiFlow).
// Teléfono de 427×840 con toque, rol Técnico:
//  Ronda de gases
//   - Abre en tarjetas, en el orden físico (zona A antes que B, combustible al final).
//   - Guardar vacío no avanza y marca el campo (una lectura no se guarda por omisión).
//   - Guardar y Enter escriben por invAddReading (source 'ronda'); "= Igual" repite la anterior.
//   - Deslizar SOLO navega: el punto deslizado queda sin lectura.
//   - Salir con ✕ a media ronda GUARDA lo capturado y deja la ronda para retomar.
//   - Retomar empieza en donde iba; el resumen lista lo que quedó bajo; Terminar cierra.
//  Ronda de equipos
//   - HOY ofrece la ronda con 2+ pendientes; el orden es vencido → semana → por vencer.
//   - Calibrar y marcar mantenimiento escriben con invCalRegister / invMaintMarkDone.
//   - "Después" no registra nada.
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

const estado = (page) => page.evaluate(() => {
    const el = document.getElementById('ui-flow');
    const card = el && el.querySelector('.uf-card');
    return {
        open: !!el, idx: _uf ? _uf.idx : -1, final: !!(_uf && _uf.final),
        key: card ? card.getAttribute('data-uf-key') : '',
        cards: el ? el.querySelectorAll('.uf-card').length : 0,
        sub: (document.getElementById('uf-sub') || {}).textContent || '',
        body: (document.getElementById('uf-body') || {}).innerText || ''
    };
});

async function deslizar(page, dx) {
    await page.evaluate((dx) => {
        const t = document.querySelector('#ui-flow .uf-card');
        const mk = (x) => new Touch({ identifier: 1, target: t, clientX: x, clientY: 400 });
        t.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(250)], changedTouches: [mk(250)] }));
        t.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [mk(250 + dx)] }));
    }, dx);
    await page.waitForTimeout(250);
}

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

    // Inventario controlado: 3 cilindros (fuera de orden a propósito) y 1 tanque.
    const ayer = await page.evaluate(() => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        const ayer = localDateStr(d);
        invState.gases = [
            { id: 'gB', gasType: 'C3H8', formula: 'C3H8', controlNo: 'CIL-B01', zone: 'B01', status: 'In use', initialPsi: 2200, readings: [{ date: ayer, psi: 2000 }] },
            { id: 'gA2', gasType: 'NO', formula: 'NO', controlNo: 'CIL-A02', zone: 'A02', status: 'In use', initialPsi: 2200, readings: [{ date: ayer, psi: 2000 }] },
            { id: 'gA1', gasType: 'CO', formula: 'CO', controlNo: 'CIL-A01', zone: 'A01', status: 'In use', initialPsi: 2200, readings: [{ date: ayer, psi: 2000 }] }
        ];
        invState.fuelTanks = [{ id: 't1', name: 'Tanque Premium', regulation: 'EURO-5', capacity: 200, unit: 'L', level: 40, readings: [{ date: ayer, level: 40 }] }];
        invSave();
        localStorage.removeItem('kia_inv_round');
        return ayer;
    });
    const hoy = await page.evaluate(() => localToday());

    console.log('\n== Ronda de gases: tarjetas en orden físico ==');
    await page.evaluate(() => invStartReadingRound());
    await page.waitForTimeout(500);
    let s = await estado(page);
    chk('abre en tarjetas: una sola a la vista', s.open && s.cards === 1, JSON.stringify(s));
    chk('empieza por la zona A01', s.key === 'gas:gA1', s.key);
    chk('encabezado: zona y avance', /Zona A · 1 de 4/.test(s.sub), s.sub);
    const orden = await page.evaluate(() => _uf.steps.map(x => x.key).join(','));
    chk('orden: A01, A02, B01 y combustible al final', orden === 'gas:gA1,gas:gA2,gas:gB,fuel:t1', orden);

    console.log('\n== Guardar vacío no avanza ==');
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(300);
    s = await estado(page);
    const inv0 = await page.evaluate(() => document.getElementById('round-reading-input').getAttribute('aria-invalid'));
    chk('se queda en la misma tarjeta y marca el campo', s.idx === 0 && inv0 === 'true', JSON.stringify({ idx: s.idx, inv0 }));

    console.log('\n== Guardar, Enter, "= Igual" ==');
    await page.fill('#round-reading-input', '1900');
    await page.press('#round-reading-input', 'Enter');
    await page.waitForTimeout(300);
    s = await estado(page);
    const r1 = await page.evaluate((hoy) => invState.gases.find(g => g.id === 'gA1').readings.find(r => r.date === hoy), hoy);
    chk('Enter guarda y avanza', s.idx === 1 && s.key === 'gas:gA2', JSON.stringify(s));
    chk('la lectura se escribió por el motor único (source ronda)', r1 && r1.psi === 1900 && r1.source === 'ronda', JSON.stringify(r1));
    await page.click('#ui-flow .uf-alt');   // = Igual que la última
    await page.waitForTimeout(300);
    const r2 = await page.evaluate((hoy) => invState.gases.find(g => g.id === 'gA2').readings.find(r => r.date === hoy), hoy);
    chk('"= Igual" guarda la anterior (2000) con un toque explícito', r2 && r2.psi === 2000, JSON.stringify(r2));

    console.log('\n== Deslizar solo navega ==');
    s = await estado(page);
    chk('estamos en B01', s.key === 'gas:gB', s.key);
    await page.fill('#round-reading-input', '1234');   // escrito pero NO guardado
    await deslizar(page, -150);
    s = await estado(page);
    const r3 = await page.evaluate((hoy) => invState.gases.find(g => g.id === 'gB').readings.find(r => r.date === hoy), hoy);
    chk('deslizar a la izquierda avanza', s.key === 'fuel:t1', s.key);
    chk('…y no guarda lo que estaba escrito', !r3, JSON.stringify(r3));
    const pers = await page.evaluate(() => JSON.parse(localStorage.getItem('kia_inv_round') || 'null'));
    chk('el avance queda para retomar', pers && pers.index === 3, JSON.stringify(pers && pers.index));

    console.log('\n== Salir con ✕ a media ronda guarda lo capturado ==');
    await page.click('#ui-flow .uf-x');
    await page.waitForTimeout(400);
    const tras = await page.evaluate((hoy) => {
        const inv = JSON.parse(localStorage.getItem('kia_lab_inventory') || '{}');
        const g = (inv.gases || []).find(x => x.id === 'gA1');
        return { open: !!document.getElementById('ui-flow'), bodyLock: document.body.classList.contains('uf-open'),
                 saved: g && (g.readings || []).some(r => r.date === hoy && r.psi === 1900),
                 round: !!localStorage.getItem('kia_inv_round') };
    }, hoy);
    chk('la capa se cierra y libera la página', !tras.open && !tras.bodyLock, JSON.stringify(tras));
    chk('las lecturas ya están en el almacenamiento (antes se quedaban en memoria)', tras.saved, JSON.stringify(tras));
    chk('la ronda sigue pendiente de retomar', tras.round);

    console.log('\n== Retomar, resumen y terminar ==');
    await page.evaluate(() => invStartReadingRound({ resume: JSON.parse(localStorage.getItem('kia_inv_round')) }));
    await page.waitForTimeout(400);
    s = await estado(page);
    chk('retoma en el combustible', s.key === 'fuel:t1', s.key);
    await page.fill('#round-reading-input', '35');
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(400);
    s = await estado(page);
    chk('al retomar, lo hecho no se vuelve a preguntar: llega al resumen', s.final, JSON.stringify(s));
    chk('el resumen dice cuántos se leyeron', /3 de 4 leídos/.test(s.body), s.body.slice(0, 200));
    const fin1 = await page.evaluate(() => ({
        round: localStorage.getItem('kia_inv_round'),
        audit: typeof auditGetView === 'function' && auditGetView().some(e => e.action === 'reading_round'),
        seguir: !!document.querySelector('#uf-body .btn-secondary.uf-next') }));
    chk('al llegar al resumen todo quedó guardado y se audita la ronda', fin1.round === null && fin1.audit, JSON.stringify(fin1));
    chk('ofrece seguir con el que falta', fin1.seguir);
    await page.click('#uf-body .btn-secondary.uf-next');
    await page.waitForTimeout(400);
    s = await estado(page);
    chk('"Seguir" lleva a B01', s.key === 'gas:gB', s.key);
    await page.fill('#round-reading-input', '200');   // ~9 % de 2200: queda bajo
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(400);
    s = await estado(page);
    chk('ronda completa', s.final && /Ronda completa/.test(s.body), s.body.slice(0, 120));
    chk('el cierre dice qué quedó bajo', /Pedir o cambiar pronto[\s\S]*CIL-B01/.test(s.body), s.body);
    await page.click('#uf-body .uf-close');
    await page.waitForTimeout(300);
    s = await estado(page);
    chk('Terminar cierra', !s.open);

    console.log('\n== Ronda de equipos ==');
    await page.evaluate(() => {
        const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return localDateStr(x); };
        const wk = invWeekOfYear(localToday());
        invState.assets = [{ id: 'as1', name: 'Dinamómetro' }];
        invState.equipment = [
            { id: 'e1', name: 'Balanza', assetId: 'as1', requiresCal: 'Si', calFreq: 'Anual', lastCalDate: d(-375), nextCalDate: d(-10), calLab: 'METROLAB' },
            { id: 'e2', name: 'Manómetro', assetId: 'as1', requiresCal: 'Si', calFreq: 'Anual', lastCalDate: d(-360), nextCalDate: d(5) },
            { id: 'e3', name: 'Barómetro', assetId: 'as1', requiresCal: 'Si', calFreq: 'Anual', nextCalDate: d(100) },
            { id: 'e4', name: 'Regla', requiresCal: 'No' }
        ];
        invState.maintActivities = [{ id: 'mt1', assetId: 'as1', desc: 'Limpiar filtros', freq: 'Anual', startWeek: wk, active: true, responsible: 'Beto Técnico' }];
        invState.maintLog = [];
        invSave();
    });
    const hoyAct = await page.evaluate(() => (dashCollectActivities() || []).find(a => a.id === 'act-eqround'));
    chk('HOY ofrece la ronda de equipos', hoyAct && /3 calibraciones y mantenimientos/.test(hoyAct.meta), JSON.stringify(hoyAct));
    await page.evaluate(() => invStartEquipmentRound());
    await page.waitForTimeout(400);
    const ordenEq = await page.evaluate(() => _uf.steps.map(x => x.key).join(','));
    chk('orden: calibración vencida → mtto de la semana → por vencer', ordenEq === 'cal:e1,mtto:mt1,cal:e2', ordenEq);
    await page.fill('#uf-cal-date', '');
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(300);
    const invEq = await page.evaluate(() => ({ idx: _uf.idx, inv: document.getElementById('uf-cal-date').getAttribute('aria-invalid') }));
    chk('sin fecha no registra y marca el campo', invEq.idx === 0 && invEq.inv === 'true', JSON.stringify(invEq));
    await page.fill('#uf-cal-date', hoy);
    await page.fill('#uf-cal-cert', 'T-9000-2026');
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(300);
    const e1 = await page.evaluate(() => invState.equipment.find(e => e.id === 'e1'));
    chk('calibración registrada por invCalRegister (historial + próxima fecha)',
        e1.lastCalDate === hoy && (e1.calHistory || []).some(h => h.certNo === 'T-9000-2026') && e1.nextCalDate > hoy, JSON.stringify(e1));
    await page.fill('#uf-mtto-comments', 'filtro nuevo');
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(300);
    const log = await page.evaluate(() => invState.maintLog.slice());
    chk('mantenimiento registrado por invMaintMarkDone', log.length === 1 && log[0].activityId === 'mt1' && log[0].comments === 'filtro nuevo', JSON.stringify(log));
    await page.click('#ui-flow .uf-later');
    await page.waitForTimeout(300);
    s = await estado(page);
    const e2 = await page.evaluate(() => invState.equipment.find(e => e.id === 'e2'));
    chk('"Después" no registra nada', !(e2.calHistory || []).length && e2.lastCalDate !== hoy, JSON.stringify(e2));
    chk('el cierre dice lo registrado y lo pendiente', s.final && /Quedan 1 para después/.test(s.body) && /Manómetro/.test(s.body), s.body.slice(0, 300));
    await page.click('#uf-body .uf-close');
    await page.waitForTimeout(300);
    chk('Terminar cierra', !(await estado(page)).open);

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));

    await browser.close();
    if (fallos.length) { console.log('\n' + fallos.length + ' FALLA(S)'); process.exitCode = 1; }
    else console.log('\ntodo bien');
})().catch(e => { console.error(e); process.exitCode = 1; });
