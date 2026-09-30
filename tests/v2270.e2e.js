// Verificación en navegador de 2.27.0 — Vincular pruebas con el plan.
// El caso reportado: la fila del martes se planeó con rin 16, se corrió una rin 17 MILD HEV,
// el emparejador viejo la mandó a una fila de la semana PASADA, y 🔗 Vincular decía "No hay
// pruebas registradas en esta semana". Escritorio 1920×1017 (el del reporte) y teléfono 427×840.
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

// Siembra: semana en curso con la fila del martes (rin 16) y la del miércoles; la semana
// pasada con una fila que el emparejador viejo "acreditó" con el vehículo de esta semana.
const ESCENARIO = () => {
    const base = { mod: 'CL4', eng: '1000cc KAPPA PE', tx: '6MT', my: '26 MODEL', reg: 'PRE-EURO 7', rgn: 'EUROPE',
                   drv: 'LHD', body: '5DR', ep: '0', engpkg: '0', tire: '205/55 R16', total: 6000, hist: 0, m: [] };
    const c = (desc, o) => Object.assign({ desc: desc, id: desc }, base, o || {});
    tpState.planData = [c('E2E-R16'), c('E2E-R17', { tire: '225/45 R17' }), c('E2E-HEV17', { tire: '225/45 R17', ep: 'MILD HEV' })];
    const wd = _tpFmtDate(_tpMonday(new Date()));
    const prev = new Date(wd + 'T12:00:00'); prev.setDate(prev.getDate() - 7);
    const wp = _tpFmtDate(prev);
    const mar = new Date(wd + 'T12:00:00'); mar.setDate(mar.getDate() + 1);
    const marS = _tpFmtDate(mar);
    const WD = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };
    const vid = nextVehicleId();
    tpState.weeklyPlans = [
        { planId: 'E2E-PREV', weekDate: wp, accepted: true, acceptedDate: wp + 'T00:00:00Z', created: wp + 'T00:00:00Z', workDays: WD,
          items: [{ uid: 'OLD', desc: 'E2E-HEV17', testDay: 'mar', preconDay: 'lun', completed: true, completedDate: marS, linkedVehicleId: vid, linkedVin: '3KPFX51B7TE431949' }] },
        { planId: 'E2E-NOW', weekDate: wd, accepted: true, acceptedDate: wd + 'T00:00:00Z', created: wd + 'T00:00:00Z', workDays: WD,
          items: [{ uid: 'B', desc: 'E2E-R16', testDay: 'mar', preconDay: 'lun', completed: false },
                  { uid: 'C', desc: 'E2E-R17', testDay: 'mie', preconDay: 'mar', completed: false }] }
    ];
    tpState.testedList = [];
    db.vehicles = [{ id: vid, vin: '3KPFX51B7TE431949', status: 'archived', purpose: 'COP-Emisiones', configCode: 'E2E-HEV17',
                     config: {}, registeredAt: new Date(wd + 'T09:00:00').toISOString(), archivedAt: new Date().toISOString(),
                     testData: { testDatetime: marS + 'T08:32' }, timeline: [] }];
    saveDB(); tpSave();
    tpWeekPlanInvalidate(); tpInvalidateCache(); tpBoardInvalidate();
    return { vid: vid, wd: wd };
};

async function recorrido(page, etiqueta) {
    console.log('\n== ' + etiqueta + ' ==');
    const s = await page.evaluate(ESCENARIO);
    await page.evaluate(() => { dashGo('testplan', 'tp-myweek'); });
    await page.waitForTimeout(700);

    const aviso = await page.evaluate(() => {
        const n = document.querySelector('.tp-week-note--link');
        return n ? n.innerText.replace(/\s+/g, ' ') : null;
    });
    chk('Mi semana avisa que una prueba liberada no acredita su fila', !!aviso && /1 prueba liberada/.test(aviso), aviso);
    const chip = await page.evaluate(() => {
        const b = document.querySelector('.tp-week-card[data-item="B"] .tp-week-suggest');
        return b ? b.innerText.replace(/\s+/g, ' ') : null;
    });
    chk('la tarjeta del martes ofrece "¿Es …431949?" con lo que cambió', !!chip && /431949/.test(chip) && /225\/45 R17/.test(chip), chip);

    // El menú Vincular ya no esconde el vehículo.
    await page.evaluate(() => tpLinkVehicleMenu('E2E-NOW', 'B'));
    await page.waitForTimeout(300);
    const menu = await page.evaluate(() => {
        const m = document.getElementById('globalModal');
        return m ? m.innerText.replace(/\s+/g, ' ') : '';
    });
    chk('Vincular lista la prueba de esta semana (antes: "No hay pruebas registradas")',
        /Probadas esta semana \(1\)/.test(menu) && /431949/.test(menu) && !/No hay pruebas registradas/.test(menu), menu.slice(0, 300));
    chk('dice qué tan parecida es y dónde está acreditada', /misma familia, otra variante/.test(menu) && /Mover aquí/.test(menu) && /semana del/.test(menu));
    const des = await page.evaluate(() => {
        const m = document.querySelector('#globalModal .custom-modal-box');
        return m ? { sw: m.scrollWidth, cw: m.clientWidth } : null;
    });
    chk('el diálogo no se desborda a lo ancho', des && des.sw <= des.cw + 1, JSON.stringify(des));
    await page.click('#globalModal [data-modal-btn="0"]');
    await page.waitForTimeout(400);
    chk('"Cerrar" cierra el diálogo', await page.evaluate(() => !document.getElementById('globalModal')));

    // Acreditar desde la tarjeta: pide confirmar (la otra fila vuelve a pendiente) y mueve.
    await page.click('.tp-week-card[data-item="B"] .tp-week-suggest');
    await page.waitForTimeout(300);
    const conf = await page.evaluate(() => document.body.innerText.includes('esa fila vuelve a pendiente'));
    chk('mover desde otra semana pide confirmación con el motivo', conf);
    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(x => /Mover aquí/.test(x.textContent) && x.offsetParent);
        b.click();
    });
    await page.waitForTimeout(600);
    const fin = await page.evaluate(() => {
        const it = (id) => { for (const p of tpState.weeklyPlans) for (const i of p.items) if (i.uid === id) return i; };
        const card = document.querySelector('.tp-week-card[data-item="B"]');
        return { b: it('B').linkedVehicleId, bDone: it('B').completed, sust: it('B').substituted,
                 old: it('OLD').linkedVehicleId, oldDone: it('OLD').completed,
                 aviso: !!document.querySelector('.tp-week-note--link'),
                 card: card ? card.innerText.replace(/\s+/g, ' ') : '' };
    });
    chk('la fila del martes queda acreditada como sustitución', fin.b === s.vid && fin.bDone && fin.sust, JSON.stringify(fin));
    chk('la fila de la semana pasada vuelve a pendiente', fin.old === undefined && fin.oldDone === false);
    chk('el aviso desaparece', !fin.aviso);
    chk('la tarjeta dice con qué se corrió', /sustituida · .*225\/45 R17/.test(fin.card) && /431949/.test(fin.card), fin.card);
}

let browser;
(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1920, height: 1017, et: 'Escritorio 1920×1017' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(3000);
        await recorrido(page, vp.et);
        chk('sin errores de página (' + vp.et + ')', !errores.length, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien') + '\n');
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); if (browser) browser.close(); process.exit(1); });
