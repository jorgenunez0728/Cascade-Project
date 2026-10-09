// Verificación en navegador de 3.0.0 — una sola señal.
// HOY: "Te toca" sin la deuda acumulada y su bloque aparte; Datos → Alertas en grupos, la
// pestaña DATOS cuenta grupos, el rojo solo para lo que detiene; Capacidad sin copias completas.
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
    const ops = [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }];
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    if (!localStorage.getItem('kia_panel_v1')) localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: ops, tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1528, height: 732, et: 'Escritorio 1528×732' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
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

        // Datos realistas: un vehículo escalado (12 días), uno con desacuerdo de doble ciego,
        // todos los instrumentos vencidos (F11 sin actualizar) y pasos de proyecto vencidos.
        const base = await page.evaluate(() => {
            const ago = d => new Date(Date.now() - d * 86400e3).toISOString();
            db.vehicles.push(
                { id: 'v-esc', vin: 'KNAE2E00000A12345', status: 'ready-release', registeredAt: ago(12), config: { 'Modelo': 'Sportage HEV' }, timeline: [{ timestamp: ago(3), data: { status: 'ready-release' } }] },
                { id: 'v-mm', vin: 'KNAE2E00000B67890', status: 'pending-approval', registeredAt: ago(2), config: { 'Modelo': 'K3 GT' },
                  testData: { gasResults: { mismatch: { gases: ['NOx'] } } }, timeline: [{ timestamp: ago(1), data: { status: 'pending-approval' } }] });
            (invState.equipment || []).forEach(e => { if (invCalStatus(e).code !== 'noaplica') e.nextCalDate = '2025-01-15'; });
            pnState.projects = [{ id: 'p1', name: 'Dinamómetro 2', status: 'activo', steps: [1, 2, 3].map(i => ({ id: 's' + i, title: 'Paso ' + i, status: 'en-progreso', targetDate: '2026-08-0' + i })), log: [] }];
            const filas = pnGetActiveAlerts();
            const grupos = pnActiveAlertGroups();
            return { filas: filas.length, grupos: grupos.length, rojo: grupos.filter(g => g.level === 'CRITICA').map(g => g.kind),
                     cal: (grupos.find(g => g.kind === 'cal-vencida') || {}), primero: filas[0] && filas[0].level };
        });
        chk('muchas filas se vuelven pocos grupos', base.filas > 20 && base.grupos <= 10, base.filas + ' filas → ' + base.grupos + ' grupos');
        chk('rojo solo para lo que detiene (doble ciego, escalado…)', base.rojo.indexOf('doble-ciego') >= 0 && base.rojo.indexOf('veh-escalado') >= 0 &&
            base.rojo.indexOf('cal-vencida') < 0 && base.rojo.indexOf('proy-vencido') < 0, base.rojo.join());
        chk('calibraciones vencidas: un grupo, con la sugerencia del F11', base.cal.n > 5 && base.cal.f11 === true, base.cal.title + ' · ' + base.cal.note);
        chk('la lista fila por fila sigue con las críticas primero', base.primero === 'CRITICA', base.primero);

        // HOY
        await page.evaluate(() => { switchPlatform('today'); dailyDashRender(); });
        await page.waitForTimeout(900);
        const hoy = await page.evaluate(() => {
            const chip = document.querySelector('.dash-board-header .dash-chip');
            const debt = document.querySelector('.dash-debt');
            const att = Array.from(document.querySelectorAll('.dash-pulse-tile, [class*="pulse"]')).map(e => e.innerText).find(t => /Atención/.test(t)) || '';
            return { chip: chip ? chip.innerText : '', debt: debt ? debt.innerText : '', att: att };
        });
        chk('"Te toca" ya no cuenta lo acumulado', /^\d+ pendientes?$|al día/.test(hoy.chip) && parseInt(hoy.chip, 10) < 15, hoy.chip);
        const junta = await page.evaluate(() => { const r = Array.from(document.querySelectorAll('.dash-inbox .dash-row')).map(e => e.innerText).find(t => /calibraciones vencidas en equipos de prueba/.test(t)); return r || ''; });
        chk('las calibraciones de equipos de prueba van juntas en UNA fila, con el F11', /\d+ calibraciones vencidas en equipos de prueba/.test(junta) && /F11/.test(junta), junta.replace(/\s+/g, ' ').slice(0, 160));
        chk('el bloque de Pendientes acumulados dice cuánto y de qué', /Pendientes acumulados/.test(hoy.debt) && /calibraciones vencidas/.test(hoy.debt) && /pasos de proyecto/.test(hoy.debt), hoy.debt.slice(0, 200));
        chk('el Pulso cuenta grupos ("detienen pruebas")', /detiene/.test(hoy.att), hoy.att.replace(/\s+/g, ' ').slice(0, 160));
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v300-hoy-' + vp.width + '.png'), fullPage: false });

        // Datos → Alertas
        await page.evaluate(() => { switchPlatform('panel'); pnSwitchTab('pn-alerts'); });
        await page.waitForTimeout(1200);
        const al = await page.evaluate(() => {
            const gs = Array.from(document.querySelectorAll('.pn-al-group'));
            const badge = document.getElementById('pn-alerts-badge');
            return { n: gs.length, open: gs.filter(g => g.open).length, rojos: gs.filter(g => g.classList.contains('lvl-CRITICA')).length,
                     f11: !!document.querySelector('.pn-al-group .pn-al-go[onclick*="invCalImportOpen"]'),
                     sum: Array.from(document.querySelectorAll('.pn-al-sum-l')).map(e => e.innerText).join('|'),
                     badge: badge ? badge.innerText : '' };
        });
        chk('Datos → Alertas pinta grupos, los rojos abiertos', al.n >= 3 && al.open === al.rojos && al.rojos >= 2, JSON.stringify(al));
        chk('resumen por grupos: Detienen pruebas | Por atender | Avisos', al.sum === 'Detienen pruebas|Por atender|Avisos', al.sum);
        chk('botón para importar el F11', al.f11);
        chk('la pestaña DATOS cuenta grupos', /^\d+ alertas?$/.test(al.badge) && parseInt(al.badge, 10) === al.n, al.badge + ' vs ' + al.n);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v300-alertas-' + vp.width + '.png'), fullPage: false });

        // Capacidad: sin copia completa de vehículos ni historial
        const cap = await page.evaluate(() => {
            const c = fbSyncCapacity(true);
            return c.rows.map(r => r.col).join();
        });
        chk('Capacidad ya no tiene cop15 ni audit', !/cop15|audit/.test(cap), cap);

        chk('sin errores de página ni diálogos nativos', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLAS' : '\ntodo bien');
    process.exitCode = fallos.length ? 1 : 0;
})();
