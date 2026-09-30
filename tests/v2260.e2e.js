// Verificación en navegador de 2.26.0 — Continuidad y momentos de cierre. Teléfono 427×840.
//  - La ficha CRECE desde la fila tocada (animación en la hoja); con movimiento reducido, no.
//  - Semana cumplida: al palomear la última prueba del compromiso aparece el momento con
//    cuántas de cuántas; una sola vez; y NO al cargar una semana que ya estaba cumplida.
//  - Calibraciones al día: al registrar la última vencida.
//  - Familia concordante: al guardar un juicio PASS el momento reemplaza al toast.
//  - Nada de eso escribe más de lo que ya escribía la acción.
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
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};
const momento = (page) => page.evaluate(() => {
    const el = document.getElementById('moment');
    return el ? { title: el.querySelector('.moment-title').textContent, text: el.innerText.replace(/\s+/g, ' ') } : null;
});

let browser;
(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(3000);

    console.log('\n== La ficha crece desde la fila ==');
    await page.evaluate(() => {
        const c = allConfigurations[0];
        db.vehicles = [{ id: nextVehicleId(), vin: 'KNAMOM0000000026A', status: 'ready-release', purpose: 'COP-Emisiones',
            configCode: c.codigo_config_text, config: Object.assign({}, c), registeredAt: new Date().toISOString(), timeline: [], testData: {} }];
        saveDB();
        invState.gases = []; invState.fuelTanks = []; invState.maintActivities = []; invSave();
        window._dashInboxAll = true; dashGo('today'); dailyDashRender();
    });
    await page.waitForTimeout(500);
    await page.tap('#daily-dash-content .dash-inbox .ficha-link >> nth=0');
    const anim = await page.evaluate(() => {
        const s = document.querySelector('#ficha .ficha-sheet');
        return { grow: s.classList.contains('ficha-grow'), n: s.getAnimations().filter(a => a.effect && a.effect.getKeyframes().some(k => k.clipPath)).length };
    });
    chk('la hoja crece desde la fila (clip + desplazamiento)', anim.grow && anim.n === 1, JSON.stringify(anim));
    await page.waitForTimeout(500);
    await page.evaluate(() => fichaClose());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.tap('#daily-dash-content .dash-inbox .ficha-link >> nth=0');
    const anim2 = await page.evaluate(() => ({ grow: document.querySelector('#ficha .ficha-sheet').classList.contains('ficha-grow') }));
    chk('con movimiento reducido no crece', !anim2.grow);
    await page.evaluate(() => fichaClose());
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    console.log('\n== Semana cumplida ==');
    const seed = await page.evaluate(() => {
        const wd = _tpFmtDate(_tpMonday(new Date()));
        tpState.weeklyPlans = (tpState.weeklyPlans || []).filter(p => p.weekDate !== wd);
        tpState.weeklyPlans.push({ id: 'MOM', weekDate: wd, created: new Date().toISOString(), accepted: false, items: [],
            workDays: { lun: true, mar: true, mie: true, jue: true, vie: true, sab: false, dom: false } });
        tpSave();
        const pid = tpPlanId(tpState.weeklyPlans[tpState.weeklyPlans.length - 1]);
        const cfgs = tpConfigCatalog().filter(c => c.desc).slice(0, 2);
        tpAddItemToWeekDay(pid, cfgs[0].desc, 'mar');
        tpAddItemToWeekDay(pid, cfgs[1].desc, 'jue');
        const plan = tpState.weeklyPlans.find(p => tpPlanId(p) === pid);
        plan.accepted = true; plan.acceptedDate = new Date().toISOString();
        tpSave();
        return { pid, uids: plan.items.map(i => i.uid) };
    });
    await page.waitForTimeout(900);
    await page.evaluate((s) => tpToggleWeeklyItem(s.pid, s.uids[0]), seed);
    await page.waitForTimeout(900);
    chk('con una pendiente, todavía no', await momento(page) === null);
    await page.evaluate((s) => tpToggleWeeklyItem(s.pid, s.uids[1]), seed);
    await page.waitForTimeout(1000);
    let m = await momento(page);
    chk('al palomear la última: "Semana cumplida"', m && m.title === 'Semana cumplida', JSON.stringify(m));
    chk('…con cuántas de cuántas', m && /2 de 2 pruebas planeadas, hechas/.test(m.text), m && m.text);
    chk('…y que se palomearon a mano sin liberación', m && /palomeadas a mano, sin liberación/.test(m.text), m && m.text);
    chk('se lee como estado, no como alerta (role=status)', await page.evaluate(() => document.getElementById('moment').getAttribute('role') === 'status'));
    await page.evaluate(() => momentClose());
    await page.evaluate((s) => { tpToggleWeeklyItem(s.pid, s.uids[1]); }, seed);
    await page.waitForTimeout(900);
    await page.evaluate((s) => { tpToggleWeeklyItem(s.pid, s.uids[1]); }, seed);
    await page.waitForTimeout(1000);
    chk('una sola vez por semana (despalomear y volver no lo repite)', await momento(page) === null);

    console.log('\n== Al recargar no se celebra lo ya cumplido ==');
    await page.evaluate(() => uiPref('moments', {}));        // aun olvidando que ya se mostró
    await page.reload();
    await page.waitForTimeout(4500);
    chk('una semana que ya estaba cumplida no es un momento', await momento(page) === null);

    console.log('\n== Calibraciones al día ==');
    await page.evaluate(() => {
        const hoy = new Date(); const ayer = new Date(hoy - 86400e3);
        const f = d => d.toISOString().slice(0, 10);
        invState.equipment = [
            { id: 'eqA', name: 'Balanza', requiresCal: 'Sí', calFreq: 'Anual', lastCalDate: '2025-01-01', nextCalDate: f(ayer) },
            { id: 'eqB', name: 'Termómetro', requiresCal: 'Sí', calFreq: 'Anual', lastCalDate: f(hoy), nextCalDate: '2027-09-01' }
        ];
        invSave();
    });
    await page.waitForTimeout(1000);
    chk('con una vencida, nada', await momento(page) === null);
    await page.evaluate(() => invCalRegister('eqA', { certNo: 'C-26', silent: true }));
    await page.waitForTimeout(1000);
    m = await momento(page);
    chk('al calibrar la última vencida: "Calibraciones al día"', m && m.title === 'Calibraciones al día', JSON.stringify(m));
    chk('…con cuántas vigentes de cuántas', m && /2 de 2 instrumentos con calibración vigente/.test(m.text), m && m.text);
    await page.evaluate(() => momentClose());

    console.log('\n== Familia concordante ==');
    await page.evaluate(() => {
        copInitState();
        copState.familyKey = 'FAM|X|AT|2027|EURO-6E|EP|G|5DR'; copState.familyLabel = 'SPORTAGE 1.6T';
        _copSetVehicles([1, 2, 3].map(i => ({ id: i, vin: 'V' + i, values: {} })));
        window.__origDecision = copGetOverallDecision;
        window.copGetOverallDecision = () => 'PASS';
        copSaveJudgment();
        window.copGetOverallDecision = window.__origDecision;
    });
    await page.waitForTimeout(300);
    m = await momento(page);
    chk('al guardar un juicio PASS: "Familia concordante"', m && m.title === 'Familia concordante' && /SPORTAGE 1\.6T/.test(m.text) && /3 VINes/.test(m.text), JSON.stringify(m));
    chk('el juicio sí se guardó', await page.evaluate(() => copState.saved[0] && copState.saved[0].familyLabel === 'SPORTAGE 1.6T'));
    await page.evaluate(() => momentClose());

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));

    await browser.close();
    if (fallos.length) { console.log('\n' + fallos.length + ' FALLA(S)'); process.exitCode = 1; }
    else console.log('\ntodo bien');
})().catch(async e => { console.error(e); process.exitCode = 1; try { if (browser) await browser.close(); } catch (x) {} });
