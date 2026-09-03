// Verificacion en navegador de v23.1: #109 (tira), #110 (repintado), OBD II.
const { chromium } = require('playwright');
const path = require('path');
const REPO = '/home/user/Cascade-Project';

const SEED = () => {
    const hoy = new Date(), dow = hoy.getDay();
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((dow + 6) % 7));
    const iso = d => d.toISOString().slice(0, 10);
    const wd = iso(lunes);
    const cfgs = [
        { desc: 'CFG-EU-K5', id: 'c1', mod: 'K5', rgn: 'EUROPE', reg: 'EURO-6E', eng: '2.0', tx: 'AT', my: '2026', drv: '2WD', body: '5DR', ep: '', engpkg: '', tire: 'R17', total: 9000, hist: 0, m: [] },
        { desc: 'CFG-MX-SPO', id: 'c3', mod: 'SPORTAGE', rgn: 'MEXICO', reg: 'EPA T3', eng: '1.6', tx: 'AT', my: '2026', drv: 'AWD', body: 'SUV', ep: '', engpkg: '', tire: 'R19', total: 5000, hist: 0, m: [] }
    ];
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'op-test', operatorName: 'Jorge Nunez',
        expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'op-test', name: 'Jorge Nunez', role: 'Técnico', active: true },
                    { id: 'op-2', name: 'Ivan Cardenas', role: 'Practicante', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_current_operator', 'Jorge Nunez');
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_testplan_v1', JSON.stringify({
        planData: cfgs, weekHistory: [], planHistory: [], rulePresets: [],
        capacity: 4, vehiclesPerSlot: 1, weekAvailability: {}, months: ['Feb-26'],
        _migr: { capacity: 1, itemUids: 1 },
        testedList: [
            { configText: 'CFG-EU-K5', date: '2026-08-03', purpose: 'COP-Emisiones', vin: 'AAA1' },
            { configText: 'CFG-EU-K5', date: '2026-08-04', purpose: 'COP-OBD2', vin: 'AAA2' },
            { configText: 'CFG-EU-K5', date: '2026-08-05', purpose: 'EO-OBD2', vin: 'AAA3' },
            { configText: 'CFG-MX-SPO', date: '2026-08-06', vin: 'BBB1' }
        ],
        weeklyPlans: [{ id: 1, planId: 'W' + wd + '-1', weekDate: wd, created: new Date().toISOString(),
            accepted: true, acceptedDate: new Date().toISOString(),
            workDays: { dom:false, lun:true, mar:true, mie:true, jue:true, vie:true, sab:false },
            capacity: 4, items: [{ uid:'IA', desc:'CFG-EU-K5', completed:false, preconDay:'lun', testDay:'mar',
                                   plannedTestDay:'mar', soakHours:24, soakSource:'laboratorio' }] }]
    }));
    localStorage.setItem('kia_db_v11', JSON.stringify({
        vehicles: [{ id: 'v1', vin: 'KNAZZZ0001', status: 'registered', configCode: 'CFG-EU-K5',
                     purpose: 'COP-Emisiones', timeline: [], config: {}, testData: {} }],
        lastId: 1 }));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global','today','testplan','inventory','panel','cop','cop15'].forEach(m =>
        localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const ctx = await browser.newContext({ viewport: { width: 753, height: 1132 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text().slice(0, 200)); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(3500);
    const r = {};

    // ── #109: la tira de "siguiente vehiculo" ──
    await page.evaluate(() => { switchPlatform('cop15'); activeVehicleId = 'v1'; v7UpdateNextStepBanner(); });
    await page.waitForTimeout(600);
    r.tira_enPruebas = await page.evaluate(() => document.getElementById('v7-next-step-banner').classList.contains('show'));
    r.tira_z = await page.evaluate(() => getComputedStyle(document.getElementById('v7-next-step-banner')).zIndex);
    r.nav_z = await page.evaluate(() => { const n=document.querySelector('.bottom-nav'); return n? getComputedStyle(n).zIndex : 'no nav'; });
    r.traslape = await page.evaluate(() => {
        const b = document.getElementById('v7-next-step-banner').getBoundingClientRect();
        const n = document.querySelector('.bottom-nav');
        if (!n) return 'no nav';
        const nb = n.getBoundingClientRect();
        return b.bottom > nb.top + 1 ? 'SE MONTA' : 'ok';
    });
    r.tieneX = await page.locator('.v7-next-step-off').count();
    await page.evaluate(() => switchPlatform('panel'));
    await page.waitForTimeout(700);
    r.tira_enDatos = await page.evaluate(() => document.getElementById('v7-next-step-banner').classList.contains('show'));
    // La ✕ apaga
    await page.evaluate(() => { switchPlatform('cop15'); activeVehicleId = 'v1'; v7UpdateNextStepBanner(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => v7NextStepDismiss());
    await page.waitForTimeout(300);
    r.tira_trasX = await page.evaluate(() => document.getElementById('v7-next-step-banner').classList.contains('show'));
    r.pref_guardada = await page.evaluate(() => uiPref('nextStep'));
    await page.evaluate(() => v7NextStepSetEnabled(true));

    // ── #110: un control de SOLO VISTA repinta ──
    await page.evaluate(() => { switchPlatform('testplan'); });
    await page.waitForTimeout(400);
    await page.evaluate(() => tpSwitchTab('tp-tested'));
    await page.waitForTimeout(900);
    const antes = await page.evaluate(() => (document.getElementById('tp-tested-cached')||{}).innerHTML?.length || 0);
    r.modoAntes = await page.evaluate(() => window._tpTestedMode || '(vacio)');
    await page.evaluate(() => { window._tpTestedMode = 'json'; tpRender(); });
    await page.waitForTimeout(700);
    const despues = await page.evaluate(() => (document.getElementById('tp-tested-cached')||{}).innerHTML?.length || 0);
    r.repinto = (antes !== despues) ? 'SI (' + antes + ' -> ' + despues + ')' : 'NO — sigue muerto (' + antes + ')';
    r.jsonVisible = await page.evaluate(() => ((document.getElementById('tp-tested-cached')||{}).innerText||'').indexOf('JSON') !== -1);

    // ── OBD II fuera del REQ ──
    r.cobertura = await page.evaluate(() => {
        const c = tpCoverageSummary();
        return { totalTested: c.totalTested, totalRegistradas: c.totalRegistradas,
                 fueraDelReq: c.totalNoEmisiones, desglose: c.noReqPorProposito };
    });
    r.avisoProbados = await page.evaluate(() =>
        ((document.getElementById('tp-tested-cached')||{}).innerText||'').indexOf('no acreditan el REQ') !== -1);
    await page.evaluate(() => tpSwitchTab('tp-rules'));
    await page.waitForTimeout(800);
    r.tarjetaReglas = await page.evaluate(() =>
        ((document.getElementById('tp-rules-cached')||{}).innerText||'').indexOf('Qué acredita el REQ') !== -1);
    r.casillas = await page.locator('#tp-rules-cached input[onchange*="tpSetReqPurpose"]').count();

    // ── Generar mes: usa el horizonte unificado ──
    r.mes = await page.evaluate(() => {
        const antes = tpState.weeklyPlans.length;
        tpGenerateMonthly('2026-12-07');
        const nuevos = tpState.weeklyPlans.slice(antes);
        return { creados: nuevos.length, porSemana: nuevos.map(p => p.items.length),
                 capacidades: nuevos.map(p => p.capacity), aceptados: nuevos.filter(p => p.accepted).length,
                 deficits: nuevos.map(p => p.items[0] && p.items[0].deficit) };
    });
    r.simulador = await page.evaluate(() => { const s = tpRunSimulation(4, 6); return { curva: s.curve.map(c => c.pct), planeadas: s.curve.map(c => c.planned) }; });

    // ── #113: editar operadores / volverse liberador ──
    r.usuarios = await page.evaluate(() => {
        const yo = pnState.operators.find(o => o.id === 'op-test');
        const antes = { rol: yo.role, puedeGestionar: authRoleHas(yo.role, 'users.manage') };
        const rol = () => pnState.operators.find(o => o.id === 'op-2').role;
        const rolInicial = rol();
        const ok = pnOpUpdate('op-2', { role: 'Supervisor' });
        const trasSupervisor = rol();
        const puedeLiberar = authRoleHas(trasSupervisor, 'test.release');
        // Y con mayusculas/acentos raros, que es lo que rompia antes de v18.5
        const ok2 = pnOpUpdate('op-2', { role: '  TECNICO ' });
        const trasNormalizar = rol();
        // Un rol inventado se RECHAZA y no deja al operador sin permisos
        const ok3 = pnOpUpdate('op-2', { role: 'Liberador' });
        return { antes, rolInicial, cambio: ok, trasSupervisor, puedeLiberar,
                 normaliza: ok2, trasNormalizar, rolInventado: ok3, rolFinal: rol() };
    });
    await page.evaluate(() => { switchPlatform('panel'); });
    await page.waitForTimeout(400);
    await page.evaluate(() => pnSwitchTab('pn-users'));
    await page.waitForTimeout(900);
    r.usuariosUI = await page.evaluate(() => {
        const el = document.querySelector('[x-show*="pn-users"]') || document.getElementById('pn-content');
        const txt = (el && el.innerText) || '';
        return { veIvan: txt.indexOf('Ivan') !== -1, largo: txt.length };
    });

    r.errores = errores.slice(0, 8);
    console.log(JSON.stringify(r, null, 2));
    await browser.close();
})();
