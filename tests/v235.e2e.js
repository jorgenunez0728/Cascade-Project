// Verificación en navegador de v23.5: el campo de fecha/hora ya no se aplasta en
// computadora, y Operación no pisa lo que otro equipo guardó (issue #131).
const { chromium } = require('playwright');
const path = require('path');
const REPO = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre); console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}
const SEED = () => {
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'op-test', operatorName: 'Jorge Nunez', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'op-test', name: 'Jorge Nunez', role: 'Administrador', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_current_operator', 'Jorge Nunez');
    localStorage.setItem('kia_fb_sync_modules', '{}');
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    const cfg = { REGION: 'MEXICO', 'EMISSION REGULATION': 'EURO-5' };
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 9, vehicles: [
        { id: 'vR', vin: 'KNARECEP00001', status: 'in-progress', configCode: 'CFG1', purpose: 'COP-Emisiones', timeline: [], config: cfg,
          registeredAt: '2026-09-20T10:00:00.000Z',
          testData: { odometer: 5, datetime: '2026-09-21T09:00', preconditioning: { tirePressureInPsi: 45 } } }
    ] }));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1366, height: 900, n: 'computadora' }, { width: 390, height: 900, n: 'teléfono' }]) {
        const page = await (await browser.newContext({ viewport: { width: vp.width, height: vp.height } })).newPage();
        const errs = []; page.on('pageerror', e => errs.push(e.message));
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, 'index.html'));
        await page.waitForTimeout(2500);
        await page.evaluate(() => {
            switchPlatform('cop15'); document.querySelector('.tab[data-tab="seguimiento"]').click();
            const s = document.getElementById('activeVehSelect'); s.value = 'vR'; loadVehicle();
            document.querySelectorAll('#op-content details').forEach(d => { d.open = true; d.classList.remove('smart-locked'); });
            if (typeof autoSuggestDates === 'function') autoSuggestDates();
        });
        await page.waitForTimeout(400);
        const m = await page.evaluate(() => {
            const el = document.getElementById('precond_datetime');
            const row = el.closest('.cascade-dt-row');
            const r = el.getBoundingClientRect();
            const card = el.closest('.form-group').getBoundingClientRect();
            return {
                w: Math.round(r.width),
                sugInRow: !!(row && row.querySelector('.date-suggestion')),
                sug: !!el.closest('.form-group').querySelector('.date-suggestion'),
                quick: document.querySelectorAll('.smart-quick-btns').length,
                ahora: row ? row.querySelectorAll('button').length : -1,
                overflow: Math.round(r.right - card.right),
                pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
            };
        });
        chk(vp.n + ': el campo de preacondicionamiento mide ≥ 150 px (antes ~20 px)', m.w >= 150, JSON.stringify(m));
        chk(vp.n + ': la sugerencia queda debajo, fuera de la fila del campo', !m.sugInRow && m.sug, JSON.stringify(m));
        chk(vp.n + ': ya no están los botones "Ayer 6AM"/"Ahora" duplicados', m.quick === 0 && m.ahora === 1, JSON.stringify(m));
        chk(vp.n + ': el campo no se sale de su tarjeta', m.overflow <= 1, JSON.stringify(m));
        chk(vp.n + ': sin scroll horizontal de la página', m.pageOverflow <= 0, JSON.stringify(m));

        if (vp.n === 'computadora') {
            const cargada = await page.evaluate(() => document.getElementById('op_datetime').value);
            chk('#131: al abrir el vehículo, la fecha/hora de recepción guardada SÍ aparece', cargada === '2026-09-21T09:00', cargada);
            // #131 — otro equipo cambia la hora de recepción mientras aquí está abierto.
            const r1 = await page.evaluate(() => {
                const v = db.vehicles.find(x => x.id === 'vR');
                v.testData = Object.assign({}, v.testData, { datetime: '2026-09-22T08:15' });
                v.updatedAt = new Date(Date.now() + 1000).toISOString();
                cascadeOnRemoteVehicleChange();
                return document.getElementById('op_datetime').value;
            });
            chk('sin cambios pendientes: el formulario se repinta con el dato remoto', r1 === '2026-09-22T08:15', r1);

            const r2 = await page.evaluate(() => {
                // Aquí el técnico cambia la presión; mientras, llega otra hora remota.
                const tire = document.getElementById('tire_pressure'); tire.value = '36';
                tire.dispatchEvent(new Event('input', { bubbles: true }));
                const v = db.vehicles.find(x => x.id === 'vR');
                v.testData = Object.assign({}, v.testData, { datetime: '2026-09-22T09:30' });
                cascadeOnRemoteVehicleChange();
                const formShows = document.getElementById('op_datetime').value;
                saveProgress({ silent: true });
                const after = db.vehicles.find(x => x.id === 'vR');
                return { formShows, saved: after.testData.datetime, tire: after.testData.preconditioning.tirePressurePsi,
                         shown: document.getElementById('op_datetime').value, rev: !!after._rev, upd: after.updatedAt };
            });
            chk('con cambios pendientes NO se repinta (no se pierde lo tecleado)', r2.formShows === '2026-09-22T08:15', JSON.stringify(r2));
            chk('al guardar se conserva la hora del otro equipo (campo no tocado)', r2.saved === '2026-09-22T09:30', JSON.stringify(r2));
            chk('y la presión tecleada aquí también', r2.tire === 36, JSON.stringify(r2));
            chk('el formulario muestra el dato conservado', r2.shown === '2026-09-22T09:30', JSON.stringify(r2));
            chk('saveDB sella la revisión del vehículo', r2.rev && !!r2.upd, JSON.stringify(r2));
            const ok = await page.evaluate(() => saveDB());
            chk('saveDB() devuelve true (antes el envoltorio devolvía undefined)', ok === true, String(ok));
        }
        chk(vp.n + ': sin errores de página', errs.length === 0, errs.join(' | '));
        await page.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', 'v235-' + vp.width + '.png'), fullPage: false });
    }
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLAS' : '\nTodo en orden');
    if (fallos.length) process.exitCode = 1;
})();
