// Verificación en navegador de 3.28.0 — Armar la semana arriba, día por día.
// Recorrido del laboratorio: el miércoles es asueto, el martes van 2 pruebas, el jueves hay
// quality checks, el viernes una de correlación; se elige una familia en la cascada y se
// genera. Escritorio 1440×900 y teléfono 430×932.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const SHOTS = process.env.E2E_SHOTS || '';

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
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

const ESCENARIO = () => {
    // USA / SULEV 30: fuera del CoP de corporativo, así el REQ sale de la regla del laboratorio.
    const base = { my: '27 MODEL', reg: 'SULEV 30', rgn: 'USA', drv: 'LHD', ep: '0', engpkg: '0', tire: '205/55 R16', hist: 0, m: [] };
    const c = (desc, o) => Object.assign({ desc: desc, id: desc }, base, o);
    tpState.planData = [
        c('E2E-CL4-10-5DR', { mod: 'CL4', eng: '1.0 T-GDI', tx: '6MT', body: '5DR', total: 9000 }),
        c('E2E-CL4-10-WGN', { mod: 'CL4', eng: '1.0 T-GDI', tx: '6MT', body: 'WGN', total: 8000 }),
        c('E2E-CL4-16-5DR', { mod: 'CL4', eng: '1.6 T-GDI', tx: '7DCT', body: '5DR', total: 7000 }),
        c('E2E-SP2-16-SUV', { mod: 'SP2', eng: '1.6 GDI', tx: 'IVT', body: 'SUV', total: 12000 }),
        c('E2E-SP2-20-SUV', { mod: 'SP2', eng: '2.0 MPI', tx: '6AT', body: 'SUV', total: 6000 }),
        c('E2E-MX-K3', { mod: 'BL7', eng: '1.6 MPI', tx: '6AT', body: '4DR', total: 20000, rgn: 'MEXICO', reg: 'NOM-042' })
    ];
    tpPlannerCfg().markets = [];
    tpState.rules = [{ id: 'r1', rgn: '*', reg: '*', ratio: 3, per: 1000, label: 'Todas' }];
    tpState.weeklyPlans = []; tpState.testedList = []; tpState.weekAvailability = {};
    tpState.vehiclesPerSlot = 1; tpState.capacity = 4;
    db.vehicles = [];
    db.siteMasters = [{ id: 'm-k3', name: 'Master K3', vin: 'KNAMASTER00000777', updatedAt: new Date().toISOString() }];
    saveDB(); tpSave();
    tpWeekPlanInvalidate(); tpInvalidateCache(); tpBoardInvalidate();
    return tpBoardWeekDate();
};

const clickIn = async (page, sel, fn) => {
    const ok = await page.evaluate(([s, f]) => {
        // Lo que vive en un <details> cerrado (＋ Actividad) se abre primero, como lo haría la persona.
        const visible = x => x.offsetParent || (x.closest('details') && !x.closest('details').open);
        const el = Array.from(document.querySelectorAll(s)).find(x => visible(x) && new Function('x', 'return ' + f)(x));
        if (!el) return false;
        const det = el.closest('details'); if (det && !det.open) det.open = true;
        el.click(); return true;
    }, [sel, fn]);
    await page.waitForTimeout(250);
    return ok;
};
const day = (d) => '.tp-wd[data-day="' + d + '"]';

async function recorrido(page, et, vp) {
    console.log('\n== ' + et + ' ==');
    const wd = await page.evaluate(ESCENARIO);
    await page.evaluate(() => { dashGo('testplan', 'tp-myweek'); });
    await page.waitForTimeout(800);

    const orden = await page.evaluate(() => {
        const a = document.querySelector('[data-armar]'), e = document.querySelector('.tp-week-empty');
        return a && e ? !!(a.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
    });
    chk('sin plan, el armador va ARRIBA (antes del aviso de semana vacía)', orden === true);
    const inicio = await page.evaluate(() => {
        const t = tpWeekSetupModelFor(window._tpWeekDate).totals;
        return { tests: t.tests, lun: !!document.querySelector('.tp-wd[data-day="lun"] .tp-wd-chip') };
    });
    chk('la semana derivada reparte la capacidad (4) en mar–vie', inicio.tests === 4, JSON.stringify(inicio));
    chk('el lunes no ofrece pruebas: su preacondicionamiento sería el domingo', !inicio.lun);

    chk('miércoles → asueto', await clickIn(page, day('mie') + ' .tp-wd-off', 'true'));
    chk('martes → 2 pruebas', await clickIn(page, day('mar') + ' .tp-wd-row .tp-wd-chip', 'x.closest(".tp-wd-row").textContent.indexOf("Pruebas")>=0 && x.textContent.trim()==="2"'));
    chk('jueves → quality checks', await clickIn(page, day('jue') + ' .tp-wd-act', '/Quality/.test(x.textContent)'));
    chk('viernes → 1 de correlación', await clickIn(page, day('vie') + ' .tp-wd-row .tp-wd-chip', 'x.closest(".tp-wd-row").textContent.indexOf("Correlación")>=0 && x.textContent.trim()==="1"'));
    const m = await page.evaluate(() => {
        const M = tpWeekSetupModelFor(window._tpWeekDate);
        const d = {}; M.days.forEach(x => { d[x.key] = x; });
        return { t: M.totals, jue: d.jue.why, mie: d.mie.off, sum: (document.querySelector('.tp-wd-sum') || {}).innerText || '',
                 master: !!document.querySelector('.tp-wd-master'), step2: (document.querySelector('[data-step="2"] h4') || {}).innerText || '' };
    });
    chk('la semana queda: 3 de emisiones + 1 de correlación, 1 asueto', m.t.tests === 3 && m.t.corr === 1 && m.t.off === 1 && m.mie, JSON.stringify(m.t));
    chk('el jueves dice por qué no prueba (su preacond. cae en el asueto)', /asueto/.test(m.jue), m.jue);
    chk('el resumen lo cuenta en palabras', /4 pruebas en la semana/.test(m.sum) && /correlación/.test(m.sum) && /asueto/.test(m.sum), m.sum);
    chk('con correlación se ofrece el vehículo Master', m.master);
    chk('el paso 2 dice cuántos lugares hay', /3 lugares de emisiones/.test(m.step2), m.step2);
    await page.evaluate(() => { const s = document.querySelector('.tp-wd-master'); s.value = 'm-k3'; s.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(300);

    // Mercados: solo USA. Las configuraciones de México salen y se dice cuántas.
    chk('mercado: USA', await clickIn(page, '.tp-mkt', '/^USA/.test(x.textContent.trim())'));
    const mk = await page.evaluate(() => ({ m: tpPlannerCfg().markets.slice(), txt: (document.querySelector('.tp-armar-markets') || {}).innerText || '',
        prev: (document.getElementById('tp-planner-preview') || {}).innerText || '' }));
    chk('queda elegido y dice cuántas quedan fuera', mk.m.join() === 'USA' && /1 configuración\(es\) con pendientes quedan fuera/.test(mk.txt), JSON.stringify(mk.m) + ' ' + mk.txt);
    chk('las recomendadas ya no traen México', !/MEXICO/.test(mk.prev), mk.prev.slice(0, 200));

    // Cascada: Modelo SP2 → Motor 2.0 → agregar.
    chk('cascada: Modelo SP2', await clickIn(page, '#tp-armar-picker .tp-pick-opt', '/SP2/.test(x.textContent)'));
    const lvl = await page.evaluate(() => (document.querySelector('#tp-armar-picker') || {}).innerText || '');
    chk('se salta lo que tiene una sola opción (año modelo, región…) y pregunta el motor', /Motor/.test(lvl) && /2\.0 MPI/.test(lvl), lvl.slice(0, 200));
    chk('cascada: Motor 2.0', await clickIn(page, '#tp-armar-picker .tp-pick-opt', '/2\\.0 MPI/.test(x.textContent)'));
    chk('fijar la configuración', await clickIn(page, '#tp-armar-picker button', '/tpPickAdd/.test(x.getAttribute("onclick")||"")'));
    const picks = await page.evaluate(() => (window._tpWeeklyManualPicks || []).slice());
    chk('queda fijada para la semana', picks.length === 1 && picks[0] === 'E2E-SP2-20-SUV', JSON.stringify(picks));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/armar-' + vp.width + '.png', fullPage: true });

    const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    chk('la página no se desborda a lo ancho', ancho.sw <= ancho.cw + 1, JSON.stringify(ancho));

    chk('Generar', await clickIn(page, '.tp-armar-go', 'true'));
    await page.waitForTimeout(600);
    const p = await page.evaluate(() => {
        const v = tpWeekPlanFor(window._tpWeekDate);
        if (!v || !v.plan) return null;
        return v.plan.items.map(i => ({ desc: i.desc, day: i.testDay, act: i.activity || '', vin: i.masterVin || '' }));
    });
    const emis = (p || []).filter(i => !i.act), corr = (p || []).filter(i => i.act === 'correlacion');
    chk('el plan trae 3 de emisiones y 1 de correlación', emis.length === 3 && corr.length === 1, JSON.stringify(p));
    chk('2 el martes y 1 el viernes; nada el miércoles ni el jueves',
        emis.filter(i => i.day === 'mar').length === 2 && emis.filter(i => i.day === 'vie').length === 1 && !(p || []).some(i => i.day === 'mie' || i.day === 'jue'), JSON.stringify(emis));
    chk('la fijada en la cascada entra', emis.some(i => i.desc === 'E2E-SP2-20-SUV'));
    chk('la correlación va el viernes con el Master', corr[0] && corr[0].day === 'vie' && corr[0].vin === 'KNAMASTER00000777', JSON.stringify(corr));
    const tablero = await page.evaluate(() => {
        const col = d => document.querySelector('.tp-week-col[data-day="' + d + '"]');
        return { mie: col('mie') ? col('mie').innerText : '', jue: col('jue') ? col('jue').innerText : '',
                 corr: !!document.querySelector('.tp-week-card') && /correlación/.test(document.querySelector('.tp-week-board').innerText) };
    });
    chk('el tablero marca el asueto y la actividad del jueves', /Asueto/.test(tablero.mie) && /Quality/.test(tablero.jue), JSON.stringify(tablero));
    chk('la tarjeta de correlación dice que no cuenta para REQ/CoP', tablero.corr);
    const bl = await page.evaluate(() => {
        const B = tpBlocksForWeek(window._tpWeekDate, { today: '2000-01-01' });
        const r = {}; (B.blocks || []).forEach(b => { r[b.day] = r[b.day] || []; r[b.day].push(b.reason); });
        return r;
    });
    chk('los bloques del miércoles dicen "festivo" solos', (bl.mie || []).length && bl.mie.every(x => x === 'festivo'), JSON.stringify(bl));
    chk('los del jueves, quality checks / festivo (no "sin explicar")', (bl.jue || []).length && bl.jue.every(x => x === 'festivo' || x === 'qc'), JSON.stringify(bl.jue));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/tablero-' + vp.width + '.png', fullPage: true });

    // ▶ Iniciar en la fila de correlación: el Alta trae el VIN del Master y el propósito.
    await page.evaluate(() => {
        const v = tpWeekPlanFor(window._tpWeekDate);
        const it = v.plan.items.find(i => i.activity === 'correlacion');
        tpStartTestFromPlan(v.planId, it.uid);
    });
    await page.waitForTimeout(1500);
    const alta = await page.evaluate(() => ({ vin: (document.getElementById('vin') || {}).value || '',
        prop: (document.getElementById('vehiclePurpose') || {}).value || '',
        banner: (document.getElementById('plan-preload-banner') || {}).innerText || '' }));
    chk('▶ Iniciar una correlación precarga el VIN del Master y el propósito', alta.vin === 'KNAMASTER00000777' && alta.prop === 'Correlacion', JSON.stringify(alta));
    chk('y no manda el texto de la fila como código de configuración', !/Prueba de correlación ·/.test(alta.banner) && /correlación/i.test(alta.banner), alta.banner);
}

let browser;
(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1440, height: 900, et: 'Escritorio 1440×900' }, { width: 430, height: 932, et: 'Teléfono 430×932', mobile: true }]) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(3000);
        await recorrido(page, vp.et, vp);
        chk('sin errores de página (' + vp.et + ')', !errores.length, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien') + '\n');
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); if (browser) browser.close(); process.exit(1); });
