// Verificacion en navegador de v24.3: las filas de HOY no se enciman.
// Reporte: a 1440–1500px la retícula de "Vehículos" y "Plan de hoy" armaba 3 columnas
// de ~460px y cada fila pedía más ancho que su celda — el stepper N/8, el chip de
// fecha y los botones invadían la tarjeta vecina.
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
    const hoy = new Date(), dow = hoy.getDay();
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((dow + 6) % 7));
    const iso = d => d.toISOString().slice(0, 10);
    const wd = iso(lunes);
    const dias = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
    const hoyKey = dias[dow], ayerKey = dias[(dow + 6) % 7];
    const largo = 'CL4 · 1000cc KAPPA PE · 6MT · 26 MODEL · MILD HEV · 5DR · LHD · 205/55 R16';
    const cfgs = [1, 2, 3, 4].map(i => ({ desc: largo + ' #' + i, id: 'c' + i, mod: 'CL4', rgn: 'EUROPE',
        reg: 'EURO-6E', eng: '1.0', tx: '6MT', my: '2026', drv: '2WD', body: '5DR', ep: '', engpkg: '',
        tire: 'R16', total: 9000, hist: 0, m: [] }));
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'op-test', operatorName: 'Jorge Nunez',
        expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'op-test', name: 'Jorge Nunez', role: 'Técnico', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_current_operator', 'Jorge Nunez');
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_testplan_v1', JSON.stringify({
        planData: cfgs, weekHistory: [], planHistory: [], rulePresets: [], testedList: [],
        capacity: 4, vehiclesPerSlot: 1, weekAvailability: {}, months: ['Feb-26'],
        _migr: { capacity: 1, itemUids: 1 },
        weeklyPlans: [{ id: 1, planId: 'W' + wd + '-1', weekDate: wd, created: new Date().toISOString(),
            accepted: true, acceptedDate: new Date().toISOString(),
            workDays: { dom: true, lun: true, mar: true, mie: true, jue: true, vie: true, sab: true },
            capacity: 4, items: cfgs.map((c, i) => ({ uid: 'I' + i, desc: c.desc, completed: false,
                preconDay: i % 2 ? hoyKey : ayerKey, testDay: i % 2 ? dias[(dow + 1) % 7] : hoyKey,
                plannedTestDay: hoyKey, soakHours: 24, soakSource: 'laboratorio' })) }]
    }));
    const veh = n => ({ id: 'v' + n, vin: 'KNAZZZ0000421' + (290 + n), status: 'in-progress',
        configCode: cfgs[0].desc, purpose: 'COP-Emisiones', registeredBy: 'Iván Cárdenas',
        expectedReleaseAt: iso(new Date(hoy.getTime() + 86400e3)),
        timeline: [], config: { Modelo: 'CL4' }, testData: {} });
    localStorage.setItem('kia_db_v11', JSON.stringify({ vehicles: [veh(1), veh(2), veh(3)], lastId: 3 }));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m =>
        localStorage.setItem('kia_tour_done_' + m, '1'));
};

// Mide las filas visibles de HOY: desborde propio y cruce con otra fila.
const MEDIR = () => {
    const rows = Array.from(document.querySelectorAll('#platform-today .dash-row'))
        .filter(r => r.offsetParent !== null);
    const out = { n: rows.length, desbordes: [], cruces: [], fueraDeTarjeta: [] };
    const rects = rows.map(r => r.getBoundingClientRect());
    rows.forEach((r, i) => {
        const inner = r.querySelector('.dash-row-in') || r;
        if (inner.scrollWidth > r.clientWidth + 1) out.desbordes.push(i + ':' + inner.scrollWidth + '>' + r.clientWidth);
        // Cada hijo visible debe quedar dentro de la caja de su fila
        r.querySelectorAll('.dash-row-side > *, .dash-stepper, .dash-row-title').forEach(el => {
            const b = el.getBoundingClientRect();
            if (b.right > rects[i].right + 1) out.desbordes.push(i + ':' + el.className + ' right ' + Math.round(b.right) + '>' + Math.round(rects[i].right));
        });
        const card = r.closest('.ui-card');
        if (card && rects[i].right > card.getBoundingClientRect().right + 1) out.fueraDeTarjeta.push(i);
        for (let j = i + 1; j < rows.length; j++) {
            const a = rects[i], b = rects[j];
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (w > 1 && h > 1) out.cruces.push(i + 'x' + j);
        }
    });
    return out;
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const anchos = [[1366, 900], [1440, 900], [1500, 900], [1920, 1080], [753, 1132], [427, 840]];
    for (const dens of ['comodo', 'compacto', 'amplio']) {
        for (const [w, h] of anchos) {
            const ctx = await browser.newContext({ viewport: { width: w, height: h } });
            const page = await ctx.newPage();
            const errores = [];
            page.on('pageerror', e => errores.push(e.message));
            await page.addInitScript(SEED);
            await page.addInitScript(d => localStorage.setItem('kia_ui_prefs', JSON.stringify({ density: d })), dens);
            await page.goto('file://' + path.join(REPO, 'index.html'));
            await page.waitForTimeout(2500);
            await page.evaluate(() => { if (typeof switchPlatform === 'function') switchPlatform('today'); });
            await page.waitForTimeout(800);
            const m = await page.evaluate(MEDIR);
            const tag = dens + ' @' + w + 'px';
            chk(tag + ': hay filas de HOY', m.n >= 5, 'filas=' + m.n);
            chk(tag + ': ninguna fila se desborda', m.desbordes.length === 0, m.desbordes.slice(0, 4).join(' | '));
            chk(tag + ': ninguna fila se cruza con otra', m.cruces.length === 0, m.cruces.slice(0, 6).join(','));
            chk(tag + ': ninguna fila sale de su tarjeta', m.fueraDeTarjeta.length === 0, m.fueraDeTarjeta.join(','));
            chk(tag + ': sin errores de página', errores.length === 0, errores.slice(0, 2).join(' | '));
            if (process.env.SHOTS && dens === 'comodo') await page.screenshot({ path: path.join(process.env.SHOTS, 'hoy-' + w + '.png'), fullPage: false });
            await ctx.close();
        }
    }
    await browser.close();
    console.log('');
    if (fallos.length) { console.log(fallos.length + ' fallo(s)'); process.exitCode = 1; }
    else { console.log('todo paso'); process.exitCode = 0; }
})();
