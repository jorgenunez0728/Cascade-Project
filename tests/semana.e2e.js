// Verificacion real en navegador, a 427x840 — el dispositivo del issue #126.
const { chromium } = require('playwright');
const path = require('path');
const REPO = require('path').resolve(__dirname, '..');

const OP = { id: 'op-test', name: 'Jorge Nunez', role: 'Administrador', active: true };

const SEED = () => {
    const hoy = new Date();
    const dow = hoy.getDay();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((dow + 6) % 7));
    const iso = d => d.toISOString().slice(0, 10);
    const wd = iso(lunes);

    const cfgs = [
        { desc: 'CFG-EU-K5', id: 'c1', mod: 'K5', rgn: 'EUROPE', reg: 'EURO-6E', eng: '2.0', tx: 'AT', my: '2026', drv: '2WD', body: '5DR', ep: '', engpkg: '', tire: 'R17', total: 9000, hist: 0, m: [] },
        { desc: 'CFG-US-K8', id: 'c2', mod: 'K8', rgn: 'USA', reg: 'SULEV 30', eng: '2.5', tx: 'AT', my: '2026', drv: '2WD', body: '4DR', ep: '', engpkg: '', tire: 'R18', total: 7000, hist: 0, m: [] },
        { desc: 'CFG-MX-SPO', id: 'c3', mod: 'SPORTAGE', rgn: 'MEXICO', reg: 'EPA T3', eng: '1.6', tx: 'AT', my: '2026', drv: 'AWD', body: 'SUV', ep: '', engpkg: '', tire: 'R19', total: 5000, hist: 0, m: [] }
    ];
    const mk = (uid, desc, pre, test) => ({ uid, desc, completed: false, preconDay: pre, testDay: test, plannedTestDay: test, soakHours: 24, soakSource: 'laboratorio' });

    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'op-test', operatorName: 'Jorge Nunez',
        expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString()
    }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'op-test', name: 'Jorge Nunez', role: 'Administrador', active: true }],
        tasks: [], projects: [], alerts: []
    }));
    localStorage.setItem('kia_current_operator', 'Jorge Nunez');
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_testplan_v1', JSON.stringify({
        planData: cfgs, testedList: [], weekHistory: [], planHistory: [], rulePresets: [],
        capacity: 4, vehiclesPerSlot: 1, weekAvailability: {}, months: ['Feb-26'],
        _migr: { capacity: 1, itemUids: 1 },
        weeklyPlans: [{
            id: 1, planId: 'W' + wd + '-1', weekDate: wd, created: new Date().toISOString(),
            accepted: true, acceptedDate: new Date().toISOString(),
            workDays: { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false },
            capacity: 4,
            items: [mk('IA', 'CFG-EU-K5', 'lun', 'mar'), mk('IB', 'CFG-US-K8', 'mar', 'mie')]
        }]
    }));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m =>
        localStorage.setItem('kia_tour_done_' + m, '1'));
    return wd;
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const ctx = await browser.newContext({ viewport: { width: 427, height: 840 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text().slice(0, 200)); });

    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(3500);

    const r = {};
    r.overlay = await page.evaluate(() => {
        const o = document.getElementById('auth-overlay');
        return !o ? 'sin overlay' : getComputedStyle(o).display;
    });

    // Ir al Plan → Mi semana
    await page.evaluate(() => { switchPlatform('testplan'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (typeof tpSwitchTab === 'function') tpSwitchTab('tp-myweek'); });
    await page.waitForTimeout(900);

    r.tarjetas = await page.locator('.tp-week-card').count();
    r.asas = await page.locator('.tp-week-grip').count();
    r.columnas = await page.locator('.tp-week-col').count();
    r.kpis = await page.locator('.tp-week-kpi').allTextContents();

    // ¿La semana se lee como semana o como una pila? (a 427 px debe apilarse)
    r.gridCols = await page.evaluate(() => {
        const b = document.getElementById('tp-myweek-board');
        return b ? getComputedStyle(b).gridTemplateColumns : 'no board';
    });

    // ── EL GESTO: tocar el asa y tocar el dia ──
    const diaAntes = await page.evaluate(() => {
        const p = tpState.weeklyPlans[0];
        return p.items.find(i => i.uid === 'IA').testDay;
    });
    r.gripBox = await page.locator('.tp-week-grip').first().boundingBox();
    r.gripLabel = await page.locator('.tp-week-grip').first().getAttribute('aria-label');
    await page.locator('.tp-week-grip').first().tap();
    await page.waitForTimeout(400);
    r.modalTrasToque = await page.evaluate(() => {
        const m = document.getElementById('globalModal');
        return m ? (m.getAttribute('aria-label') || 'modal sin label') : 'sin modal';
    });
    r.kbdSel = await page.evaluate(() => JSON.stringify(window._gridKbd || null));
    if (r.modalTrasToque !== 'sin modal') { await page.evaluate(() => { const m=document.getElementById('globalModal'); if(m) m.remove(); }); }
    r.barra = await page.locator('#tp-week-selbar').count();
    r.barraTxt = r.barra ? (await page.locator('#tp-week-selbar').innerText()).replace(/\s+/g, ' ').slice(0, 90) : '';
    r.destinos = await page.locator('.tp-week-board--picking').count();
    r.jueVisible = await page.evaluate(() => {
        const c = document.querySelector('.tp-week-col-body[data-drag-cell="jue"]');
        if (!c) return 'no existe';
        const b = c.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) });
    });

    // Tocar la columna del jueves (destino legal con 24 h de reposo)
    const jue = page.locator('.tp-week-col-body[data-drag-cell="jue"]');
    r.hayJueves = await jue.count();
    if (r.hayJueves) { try { await jue.first().tap({ timeout: 4000 }); } catch(e) { r.tapJueError = String(e.message).slice(0,120); } await page.waitForTimeout(600); }

    const diaDespues = await page.evaluate(() => {
        const p = tpState.weeklyPlans[0];
        const it = p.items.find(i => i.uid === 'IA');
        return it ? it.testDay : null;
    });
    r.movio = diaAntes + ' -> ' + diaDespues;
    r.aceptadoSigue = await page.evaluate(() => tpState.weeklyPlans[0].accepted);
    r.moves = await page.evaluate(() => (tpState.weeklyPlans[0].items.find(i => i.uid === 'IA').moves || []).length);

    // El plan de HOY: aceptado, asi que debe listar pruebas
    await page.evaluate(() => { switchPlatform('today'); });
    await page.waitForTimeout(800);
    r.hoyPlan = await page.evaluate(() =>
        (typeof dashCollectActivities === 'function' ? dashCollectActivities() : [])
            .filter(a => a.cat === 'plan').map(a => a.title.slice(0, 60)));

    // Y con el plan SIN aceptar, HOY no debe listar pruebas
    await page.evaluate(() => {
        tpState.weeklyPlans[0].accepted = false;
        delete tpState.weeklyPlans[0].acceptedDate;
        tpWeekPlanInvalidate(); tpInvalidateCache(); tpBoardInvalidate();
    });
    await page.waitForTimeout(300);
    r.hoyPropuesta = await page.evaluate(() =>
        (typeof dashCollectActivities === 'function' ? dashCollectActivities() : [])
            .filter(a => a.cat === 'plan').map(a => a.title.slice(0, 60)));

    r.errores = errores.slice(0, 6);
    console.log(JSON.stringify(r, null, 2));
    await page.screenshot({ path: '/tmp/claude-0/-home-user-Cascade-Project/8dec62b6-261d-58fb-8abd-b24d6c685647/scratchpad/semana-427.png', fullPage: true });
    await browser.close();
})();
