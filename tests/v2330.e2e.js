// Verificación en navegador de 2.33.0 — el calendario es la vista de planeación y
// "Mi semana" su zoom. Casos del laboratorio (issue #181):
//  · un plan aceptado con fecha de MIÉRCOLES (2026-09-30) que el tablero nunca encontraba
//    y por tanto no se podía borrar;
//  · dos propuestas apiladas en la misma semana;
//  · "Semanas generadas" ya no existe; borrar vive en el tablero y no regresa por sync.
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
    const cfgs = [
        { desc: 'CFG-EU-K5', id: 'c1', mod: 'K5', rgn: 'EUROPE', reg: 'EURO-6E', eng: '2.0', tx: 'AT', my: '2026', drv: '2WD', body: '5DR', ep: '', engpkg: '', tire: 'R17', total: 90000, hist: 0, m: [] },
        { desc: 'CFG-US-K8', id: 'c2', mod: 'K8', rgn: 'USA', reg: 'SULEV 30', eng: '2.5', tx: 'AT', my: '2026', drv: '2WD', body: '4DR', ep: '', engpkg: '', tire: 'R18', total: 70000, hist: 0, m: [] },
        { desc: 'CFG-MX-SPO', id: 'c3', mod: 'SPORTAGE', rgn: 'MEXICO', reg: 'EPA T3', eng: '1.6', tx: 'AT', my: '2026', drv: 'AWD', body: 'SUV', ep: '', engpkg: '', tire: 'R19', total: 50000, hist: 0, m: [] }
    ];
    const it = (uid, desc, test) => ({ uid, desc, completed: false, testDay: test, plannedTestDay: test, soakHours: 24 });
    const WD = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    if (!localStorage.getItem('kia_panel_v1')) localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    if (!localStorage.getItem('kia_testplan_v1')) localStorage.setItem('kia_testplan_v1', JSON.stringify({
        planData: cfgs, testedList: [], weekHistory: [], planHistory: [], rulePresets: [],
        capacity: 30, vehiclesPerSlot: 10, weekAvailability: {}, months: ['Oct-26'],
        _migr: { capacity: 1, itemUids: 1 },
        weeklyPlans: [
            { id: 1, planId: 'GHOST', weekDate: '2026-09-30', created: '2026-09-25T10:00:00', accepted: true, acceptedDate: '2026-09-25T11:00:00',
              workDays: WD, capacity: 4, items: [it('G1', 'CFG-EU-K5', 'mar')] },
            { id: 2, planId: 'P1', weekDate: '2026-10-05', created: '2026-10-01T10:00:00', accepted: false, workDays: WD, capacity: 4, items: [it('A1', 'CFG-US-K8', 'mar')] },
            { id: 3, planId: 'P2', weekDate: '2026-10-05', created: '2026-10-02T10:00:00', accepted: false, workDays: WD, capacity: 4, items: [it('B1', 'CFG-MX-SPO', 'jue')] }
        ]
    }));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1920, height: 1017, et: 'Escritorio 1920×1017' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
        console.log('\n== ' + vp.et + ' ==');
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile,
            timezoneId: 'America/Mexico_City' });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(2500);

        // ── Plan abre en el calendario ──
        await page.evaluate(() => { switchPlatform('testplan'); });
        await page.waitForTimeout(500);
        let s = await page.evaluate(() => ({
            tab: tpState.activeTab,
            cal: !!document.querySelector('.tp-cal-month'),
            ghost: (tpState.weeklyPlans.find(p => p.planId === 'GHOST') || {}).weekDate,
            primerBoton: ((document.querySelector('#tp-tabs-bar .tp-tab') || {}).textContent || '').trim()
        }));
        chk('Plan abre en el Calendario', s.tab === 'tp-calendar' && s.cal, JSON.stringify(s));
        chk('el Calendario es la primera pestaña', /Calendario/.test(s.primerBoton), s.primerBoton);
        chk('la semana fantasma (miércoles 30) quedó en su lunes 28', s.ghost === '2026-09-28', s.ghost);

        // ── ▸ de la semana → Mi semana de esa semana ──
        await page.evaluate(() => { _tpCalendarMonth = { year: 2026, month: 8 }; tpRender(); });
        await page.waitForTimeout(400);
        const wk = await page.evaluate(() => {
            const b = document.querySelector('[data-cal-week="2026-09-28"]');
            return b ? b.textContent : null;
        });
        chk('la semana del 28 tiene su ▸ con ✔ (aceptada)', wk && /▸/.test(wk) && /✔/.test(wk), String(wk));
        await page.click('[data-cal-week="2026-09-28"]');
        await page.waitForTimeout(600);
        s = await page.evaluate(() => {
            const host = window._tpMyWeekHost;
            const txt = (host && host.innerText) || '';
            return { tab: tpState.activeTab, semana: /Semana del 2026-09-28/.test(txt), del: !!document.getElementById('tp-week-del'),
                     cal: !!document.getElementById('tp-week-to-cal'), indice: /Semanas generadas/.test(document.body.innerText) };
        });
        chk('▸ abre Mi semana en esa semana', s.tab === 'tp-myweek' && s.semana, JSON.stringify(s));
        chk('el tablero trae 🗑 Borrar semana y 🗓️ Calendario', s.del && s.cal);
        chk('"Semanas generadas" ya no existe', !s.indice);

        // ── Borrar la semana aceptada ──
        await page.click('#tp-week-del');
        await page.waitForTimeout(300);
        await page.click('.custom-modal-actions [data-action="confirm"]');
        await page.waitForTimeout(600);
        s = await page.evaluate(() => ({
            queda: tpState.weeklyPlans.filter(p => p.weekDate === '2026-09-28').length,
            marca: (tpState.deletedPlans || []).some(t => t.planId === 'GHOST'),
            vacio: /No hay plan para esta semana/.test((window._tpMyWeekHost || {}).innerText || '')
        }));
        chk('la semana aceptada se borra de un toque (con confirmación)', s.queda === 0 && s.vacio, JSON.stringify(s));
        chk('deja marca para que el sync no la traiga de vuelta', s.marca);
        s = await page.evaluate(() => {
            // Un pull trae el plan borrado de vuelta (fusión aditiva): la marca lo retira.
            tpState.weeklyPlans.push({ planId: 'GHOST', weekDate: '2026-09-28', accepted: true, items: [] });
            _tpEnsureState();
            return tpState.weeklyPlans.filter(p => p.planId === 'GHOST').length;
        });
        chk('lo borrado no regresa con la sincronización', s === 0, String(s));

        // ── Un plan por semana: Generar reemplaza las propuestas ──
        s = await page.evaluate(() => {
            tpCalendarOpenWeek('2026-10-07');
            const antes = tpState.weeklyPlans.filter(p => p.weekDate === '2026-10-05').length;
            tpGenerarSemana();
            const planes = tpState.weeklyPlans.filter(p => p.weekDate === '2026-10-05');
            return { antes, despues: planes.length, items: planes[0] ? planes[0].items.length : 0,
                     marcas: (tpState.deletedPlans || []).filter(t => t.planId === 'P1' || t.planId === 'P2').length,
                     cap: tpWeeklyCapacityFor('2026-10-05', { lun: true, mar: true, mie: true, jue: true, vie: true }).cap,
                     semana: window._tpBoardWeek };
        });
        chk('abrir el día 7 abre la semana del lunes 5', s.semana === '2026-10-05', s.semana);
        chk('Generar deja UN plan en la semana (reemplaza las 2 propuestas)', s.antes === 2 && s.despues === 1 && s.marcas === 2, JSON.stringify(s));
        chk('con capacidad 30 y 10 vehículos por par, la semana no pasa de 20', s.cap === 20 && s.items <= 20, JSON.stringify(s));

        // ── De regreso al calendario ──
        await page.click('#tp-week-to-cal');
        await page.waitForTimeout(500);
        s = await page.evaluate(() => ({ tab: tpState.activeTab, mes: (document.querySelector('.tp-cal-month') || {}).textContent,
                                         overflow: document.scrollingElement.scrollWidth - window.innerWidth,
                                         prop: ((document.querySelector('[data-cal-week="2026-10-05"]') || {}).textContent || '') }));
        chk('🗓️ Calendario regresa al mes de la semana', s.tab === 'tp-calendar' && /Octubre 2026/.test(s.mes || ''), JSON.stringify(s));
        chk('la semana con propuesta se marca ⏳', /⏳/.test(s.prop), s.prop);
        chk('sin desborde horizontal', s.overflow <= 1, String(s.overflow));

        // ── Detalle del día → abrir la semana ──
        await page.click('[data-cal-day="2026-10-06"]');
        await page.waitForTimeout(400);
        await page.click('#tp-cal-open-week');
        await page.waitForTimeout(500);
        s = await page.evaluate(() => ({ tab: tpState.activeTab, semana: window._tpBoardWeek }));
        chk('desde el detalle del día también se abre la semana', s.tab === 'tp-myweek' && s.semana === '2026-10-05', JSON.stringify(s));

        chk('sin errores de página', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    if (fallos.length) { console.log('\n' + fallos.length + ' falla(s)'); process.exitCode = 1; }
    else console.log('\nv2330: todo ok');
})();
