// Verificación en navegador de 2.22.0 — Plan y Proyectos en tarjetas (uiFlow).
// Teléfono de 427×840 con toque.
//  Plan (🔎 Revisar y aceptar)
//   - Abre sobre la PROPUESTA vigente, una prueba por tarjeta, "Sin día" primero.
//   - "Otro día" solo ofrece días donde cabe el reposo y mueve con tpMoveItemToDay (moves[]).
//   - "Quitar" saca la prueba; "↩ Devolver" en el resumen la regresa con el MISMO uid.
//   - Sin plan.manage, "Aceptar la semana" sale deshabilitado con el motivo.
//   - Con plan.manage, aceptar desde el resumen acepta y cierra (weekHistory).
//  Proyectos (🧭 Repasar pendientes)
//   - Guardar sin elegir no escribe y marca la decisión.
//   - Ya se hizo / Nueva fecha (audit proyecto_fecha_movida) / Bloqueado (obstáculo obligatorio).
//   - Deslizar no escribe nada. HOY ofrece las dos rondas.
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
    return { open: !!el, final: !!(_uf && _uf.final), key: card ? card.getAttribute('data-uf-key') : '',
             sub: (document.getElementById('uf-sub') || {}).textContent || '',
             body: (document.getElementById('uf-body') || {}).innerText || '' };
});
const elegir = (page, texto) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('#ui-flow .uf-card .uf-choice')].find(x => x.textContent.indexOf(t) >= 0);
    if (b) b.click();
    return !!b;
}, texto);

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

    // Propuesta de la semana en curso con 3 pruebas: martes, jueves y una sin día.
    const seed = await page.evaluate(() => {
        const wd = _tpFmtDate(_tpMonday(new Date()));
        tpState.weeklyPlans = (tpState.weeklyPlans || []).filter(p => p.weekDate !== wd);
        tpState.weeklyPlans.push({ id: 'E2E', weekDate: wd, created: new Date().toISOString(), accepted: false, items: [],
            workDays: { lun: true, mar: true, mie: true, jue: true, vie: true, sab: false, dom: false } });
        tpSave();
        const pid = tpPlanId(tpState.weeklyPlans[tpState.weeklyPlans.length - 1]);
        const cfgs = tpConfigCatalog().filter(c => c.desc).slice(0, 3);
        const a = tpAddItemToWeekDay(pid, cfgs[0].desc, 'mar');
        const b = tpAddItemToWeekDay(pid, cfgs[1].desc, 'jue');
        const c = tpAddItemToWeekDay(pid, cfgs[2].desc, null);
        const plan = tpState.weeklyPlans.find(p => tpPlanId(p) === pid);
        const sinDia = plan.items[2]; sinDia.testDay = null; sinDia.preconDay = null; sinDia.unscheduled = true;
        tpSave();
        return { wd, pid, ok: [a.ok, b.ok, c.ok], uids: plan.items.map(i => i.uid) };
    });
    chk('se sembró la propuesta de 3 pruebas', seed.ok.every(Boolean) && seed.uids.length === 3, JSON.stringify(seed));

    console.log('\n== HOY ofrece revisar la propuesta ==');
    const act = await page.evaluate(() => (dashCollectActivities() || []).find(a => a.id === 'act-plan-propuesta'));
    chk('la fila de la propuesta abre la revisión', act && /tpReviewWeekOpen/.test(act.action.js), JSON.stringify(act && act.action));

    console.log('\n== Revisar: orden y "Otro día" ==');
    await page.evaluate((wd) => tpReviewWeekOpen(wd), seed.wd);
    await page.waitForTimeout(500);
    let s = await estado(page);
    chk('abre en la prueba sin día', s.open && s.key === seed.uids[2] && /Sin día · 1 de 3/.test(s.sub), JSON.stringify(s));
    await page.click('#ui-flow .uf-later');   // Después
    await page.waitForTimeout(300);
    s = await estado(page);
    chk('sigue la del martes', s.key === seed.uids[0], s.key);
    await elegir(page, 'Otro día');
    await page.waitForTimeout(200);
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(300);
    const sinDiaElegido = await page.evaluate(() => ({ key: _uf.idx, inv: (document.getElementById('uf-tp-day') || {}).getAttribute ? document.getElementById('uf-tp-day').getAttribute('aria-invalid') : null }));
    chk('"Otro día" sin elegir el día no avanza y lo marca', sinDiaElegido.inv === 'true', JSON.stringify(sinDiaElegido));
    const dias = await page.evaluate(() => [...document.querySelectorAll('#uf-tp-day .uf-choice')].map(b => b.textContent));
    chk('ofrece solo días donde cabe el reposo (no el lunes con 24 h)', dias.length > 0 && !dias.some(t => /^Lunes/.test(t)), dias.join(' | '));
    await page.evaluate(() => document.querySelector('#uf-tp-day .uf-choice').click());
    await page.waitForTimeout(200);
    const diaElegido = await page.evaluate(() => document.querySelector('#uf-tp-day .uf-choice.is-on').textContent);
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(300);
    const movida = await page.evaluate((uid) => {
        const it = tpState.weeklyPlans.find(p => p.id === 'E2E').items.find(i => i.uid === uid);
        return { testDay: it.testDay, moves: (it.moves || []).length, via: (it.moves || [])[0] && it.moves[0].via };
    }, seed.uids[0]);
    chk('se movió por tpMoveItemToDay (queda en moves[])', movida.moves === 1 && movida.via === 'revision' && movida.testDay !== 'mar',
        JSON.stringify(movida) + ' elegido ' + diaElegido);

    console.log('\n== Quitar y devolver ==');
    s = await estado(page);
    chk('sigue la del jueves', s.key === seed.uids[1], s.key);
    await elegir(page, 'Quitar');
    await page.waitForTimeout(150);
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(400);
    const tras = await page.evaluate(() => tpState.weeklyPlans.find(p => p.id === 'E2E').items.map(i => i.uid));
    s = await estado(page);
    chk('se quitó de la semana', tras.length === 2 && tras.indexOf(seed.uids[1]) < 0, tras.join(','));
    chk('llega al resumen con quitadas y "sin revisar"', s.final && /Quitadas/.test(s.body) && /1 prueba\(s\) sin revisar/.test(s.body), s.body.slice(0, 400));
    await page.evaluate(() => [...document.querySelectorAll('#uf-body .uf-link')].find(b => /Devolver/.test(b.textContent)).click());
    await page.waitForTimeout(400);
    const devuelta = await page.evaluate(() => tpState.weeklyPlans.find(p => p.id === 'E2E').items.map(i => i.uid));
    s = await estado(page);
    chk('↩ Devolver la regresa con el MISMO uid y en su lugar', devuelta.join(',') === seed.uids.join(','), devuelta.join(','));
    chk('el resumen la marca como devuelta', /devuelta/.test(s.body));

    console.log('\n== Aceptar desde el resumen ==');
    const sinPerm = await page.evaluate(() => {
        const prev = authState.currentUser.role;
        authState.currentUser.role = 'Técnico';
        uiFlowGoTo(9999);
        const b = document.getElementById('uf-tp-accept');
        const r = { disabled: b && b.disabled, why: b && b.getAttribute('data-why') };
        authState.currentUser.role = prev;
        uiFlowGoTo(9999);
        return r;
    });
    chk('sin plan.manage: Aceptar deshabilitado y dice por qué', sinPerm.disabled && /no permite aceptar/.test(sinPerm.why || ''), JSON.stringify(sinPerm));
    await page.click('#uf-tp-accept');
    await page.waitForTimeout(500);
    const acept = await page.evaluate((pid) => {
        const p = tpState.weeklyPlans.find(x => x.id === 'E2E');
        return { accepted: p.accepted, hist: (tpState.weekHistory || []).some(w => w.planId === pid), open: !!document.getElementById('ui-flow') };
    }, seed.pid);
    chk('acepta la semana y cierra', acept.accepted && acept.hist && !acept.open, JSON.stringify(acept));

    console.log('\n== Proyectos: repasar pendientes ==');
    await page.evaluate(() => {
        const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return localDateStr(x); };
        const now = new Date().toISOString();
        pnState.projects = [{ id: 'PR1', name: 'Reparar dinamómetro', status: 'activo', createdAt: now, updatedAt: now, log: [], steps: [
            { id: 'S1', seq: 1, title: 'Pedir refacción', responsible: 'Ana Manager', status: 'pendiente', targetDate: d(-10), createdAt: now },
            { id: 'S2', seq: 2, title: 'Instalar refacción', responsible: '', status: 'encurso', targetDate: d(-3), createdAt: now },
            { id: 'S3', seq: 3, title: 'Calibrar', responsible: 'Ana Manager', status: 'pendiente', targetDate: d(-1), createdAt: now }] }];
        pnSave();
    });
    const hoyAct = await page.evaluate(() => (dashCollectActivities() || []).find(a => a.id === 'act-projround'));
    chk('HOY ofrece la ronda de proyectos', hoyAct && /3 pasos/.test(hoyAct.meta), JSON.stringify(hoyAct));
    await page.evaluate(() => pnProjectsReviewOpen());
    await page.waitForTimeout(400);
    s = await estado(page);
    chk('empieza por el paso más viejo', s.key === 'PR1::S1', s.key);
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(300);
    const sinElegir = await page.evaluate(() => ({ idx: _uf.idx, inv: document.getElementById('uf-pn-choice').getAttribute('aria-invalid'),
        st: pnState.projects[0].steps[0].status }));
    chk('Guardar sin elegir no escribe y marca la decisión', sinElegir.idx === 0 && sinElegir.inv === 'true' && sinElegir.st === 'pendiente', JSON.stringify(sinElegir));
    await elegir(page, 'Ya se hizo');
    await page.waitForTimeout(150);
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(300);
    const s1 = await page.evaluate(() => pnState.projects[0].steps[0]);
    chk('✔ Ya se hizo → completado con fecha', s1.status === 'completado' && !!s1.doneDate, JSON.stringify(s1));

    // Deslizar no escribe
    const antes = await page.evaluate(() => JSON.stringify(pnState.projects[0].steps[1]));
    await page.evaluate(() => {
        const t = document.querySelector('#ui-flow .uf-card');
        const mk = (x) => new Touch({ identifier: 1, target: t, clientX: x, clientY: 400 });
        t.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(250)], changedTouches: [mk(250)] }));
        t.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [mk(90)] }));
    });
    await page.waitForTimeout(300);
    const despues = await page.evaluate(() => JSON.stringify(pnState.projects[0].steps[1]));
    s = await estado(page);
    chk('deslizar avanza sin escribir', s.key === 'PR1::S3' && antes === despues, s.key);
    await page.click('#ui-flow .uf-back');
    await page.waitForTimeout(300);

    await elegir(page, 'Nueva fecha');
    await page.waitForTimeout(150);
    const nueva = await page.evaluate(() => { const x = new Date(); x.setDate(x.getDate() + 7); return localDateStr(x); });
    await page.fill('#uf-pn-date', nueva);
    await page.fill('#uf-pn-reason', 'llegó tarde la pieza');
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(300);
    const s2 = await page.evaluate(() => ({ step: pnState.projects[0].steps[1],
        audit: auditGetView().some(e => e.action === 'proyecto_fecha_movida' && /llegó tarde la pieza/.test(e.details || '')) }));
    chk('📅 Nueva fecha → fecha objetivo nueva + auditoría con el motivo', s2.step.targetDate === nueva && s2.audit, JSON.stringify(s2));

    await elegir(page, 'Está bloqueado');
    await page.waitForTimeout(150);
    await page.fill('#uf-pn-block', 'no');
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(300);
    const corto = await page.evaluate(() => ({ inv: document.getElementById('uf-pn-block').getAttribute('aria-invalid'), st: pnState.projects[0].steps[2].status }));
    chk('bloqueado sin motivo real no escribe y marca el campo', corto.inv === 'true' && corto.st === 'pendiente', JSON.stringify(corto));
    await page.fill('#uf-pn-block', 'Esperando al proveedor de calibración');
    await page.click('#ui-flow .uf-save');
    await page.waitForTimeout(400);
    const s3 = await page.evaluate(() => pnState.projects[0].steps[2]);
    s = await estado(page);
    chk('🚧 Bloqueado → estatus + obstáculo', s3.status === 'bloqueado' && /proveedor/.test(s3.roadblock), JSON.stringify(s3));
    chk('el resumen dice lo completado y lo reprogramado', s.final && /Completados/.test(s.body) && /Con fecha nueva/.test(s.body), s.body.slice(0, 300));
    await page.click('#uf-body .uf-close');
    await page.waitForTimeout(300);
    chk('Terminar cierra', !(await estado(page)).open);

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));

    await browser.close();
    if (fallos.length) { console.log('\n' + fallos.length + ' FALLA(S)'); process.exitCode = 1; }
    else console.log('\ntodo bien');
})().catch(e => { console.error(e); process.exitCode = 1; });
