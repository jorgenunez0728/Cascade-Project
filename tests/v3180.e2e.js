// Verificación en navegador de 3.18.0 — Un vehículo en dos equipos.
// (1) La línea de tiempo pinta un cambio cruzado con "No quedó / Quedó" y el botón
//     ↩️ Usar este valor, que devuelve el valor como una edición normal (con su entrada).
// (2) En un vehículo en aprobación el botón no se ofrece (tiene su propio flujo).
// (3) El candado de un instante lee el vehículo en la nube (fetch simulado): si otro
//     equipo ya lo movió, se detiene y dice quién; si la nube va atrás, sigue.
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
    const choque = { timestamp: '2026-10-22T15:00:04.000Z', user: 'Sincronización', action: 'Cambios cruzados entre equipos',
        data: { conflict: true, modified: [{ campo: 'Odómetro', key: 'testData.odometer', antes: '110', despues: '120',
            razon: 'Dos equipos lo cambiaron a la vez; quedó el cambio más reciente', valor: 110 }] } };
    const veh = (id, vin, status) => ({ id, vin, status, purpose: 'CoP', configCode: 'C1', registeredAt: '2026-10-20T10:00:00.000Z',
        updatedAt: '2026-10-22T15:00:04.000Z', timeline: [{ timestamp: '2026-10-20T10:00:00.000Z', action: 'Alta' }, choque],
        testData: { odometer: 120 } });
    localStorage.setItem('kia_db_v11', JSON.stringify({ version: '11.0', lastId: 2,
        vehicles: [veh('veh_1', 'KNA000001', 'in-progress'), veh('veh_2', 'KNA000002', 'pending-approval')] }));
};

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

    console.log('\n== Línea de tiempo con un cambio cruzado ==');
    await page.evaluate(() => histShowTimelineModal('veh_1'));
    await page.waitForTimeout(300);
    const modal = await page.evaluate(() => {
        const m = document.getElementById('globalModal');
        const t = m ? m.textContent : '';
        return { hay: !!m, noQuedo: /No quedó/.test(t), quedo: /Quedó/.test(t),
                 boton: !!(m && Array.from(m.querySelectorAll('button')).find(b => /Usar este valor/.test(b.textContent))) };
    });
    chk('se pinta "No quedó / Quedó"', modal.hay && modal.noQuedo && modal.quedo, JSON.stringify(modal));
    chk('con el botón ↩️ Usar este valor', modal.boton);

    await page.evaluate(() => Array.from(document.querySelectorAll('#globalModal button')).find(b => /Usar este valor/.test(b.textContent)).click());
    await page.waitForTimeout(300);
    const confirmTxt = await page.evaluate(() => document.body.innerText.match(/poner «110»[^\n]*/) ? 'si' : document.body.innerText.slice(0, 300));
    chk('pregunta antes, con los dos valores', confirmTxt === 'si', confirmTxt);
    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).reverse().find(x => /^\s*Usar este valor\s*$/.test(x.textContent) && x.offsetParent);
        b.click();
    });
    await page.waitForTimeout(500);
    const tras = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'veh_1');
        return { odo: v.testData.odometer, ent: v.timeline.some(e => e.action === 'Valor recuperado de un cambio cruzado'),
                 guardado: JSON.parse(localStorage.getItem('kia_db_v11')).vehicles.find(x => x.id === 'veh_1').testData.odometer };
    });
    chk('el valor vuelve como edición normal y se guarda', tras.odo === 110 && tras.guardado === 110, JSON.stringify(tras));
    chk('y queda su entrada en la línea de tiempo', tras.ent);
    await page.evaluate(() => { const m = document.getElementById('globalModal'); if (m) m.remove(); });

    console.log('\n== En aprobación no se ofrece ==');
    await page.evaluate(() => histShowTimelineModal('veh_2'));
    await page.waitForTimeout(300);
    const enAprob = await page.evaluate(() => {
        const m = document.getElementById('globalModal');
        return { noQuedo: /No quedó/.test(m.textContent), boton: !!Array.from(m.querySelectorAll('button')).find(b => /Usar este valor/.test(b.textContent)) };
    });
    chk('se ve el cambio cruzado pero sin botón', enAprob.noQuedo && !enAprob.boton, JSON.stringify(enAprob));
    await page.evaluate(() => { const m = document.getElementById('globalModal'); if (m) m.remove(); });

    console.log('\n== Candado de un instante (nube simulada) ==');
    const gate = await page.evaluate(async () => {
        window.__toasts = [];
        const _t = window.showToast;
        window.showToast = function(m) { window.__toasts.push(String(m)); return _t.apply(this, arguments); };
        fbSync.enabled = true; fbSyncModules.cop15 = true;
        window._fbIdTokenPromise = () => Promise.resolve('tok');
        let nube = null;
        window.fetch = (url) => {
            if (/vehicles\/v_veh_1/.test(url) && nube) {
                return Promise.resolve(new Response(JSON.stringify({ name: 'x/vehicles/v_veh_1', fields: {
                    json: { stringValue: JSON.stringify(nube) }, deleted: { booleanValue: false } } }), { status: 200 }));
            }
            return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
        };
        const v = db.vehicles.find(x => x.id === 'veh_1');
        v.status = 'ready-release'; v.updatedAt = '2026-10-22T16:00:00.000Z';
        nube = Object.assign({}, v, { status: 'pending-approval', updatedAt: '2026-10-22T16:05:00.000Z',
            timeline: [{ timestamp: '2026-10-22T16:05:00.000Z', user: 'Beto Técnico', action: 'Enviado a Aprobación', data: { status: 'pending-approval' } }] });
        const detenido = await fbVehCloudGate(v, 'ready-release', 'enviar a aprobación');
        const aviso = window.__toasts.find(t => /Beto/.test(t)) || '';
        nube = Object.assign({}, nube, { updatedAt: '2026-10-22T15:00:00.000Z' });
        const atras = await fbVehCloudGate(v, 'ready-release', 'enviar a aprobación');
        // Aprobar exige conexión (strict); los demás pasos siguen sin red.
        const _onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        window.__toasts = [];
        const aprobarSinRed = await fbVehCloudGate(v, 'pending-approval', 'aprobar', { strict: true });
        const avisoSinRed = window.__toasts.find(t => /conexión/.test(t)) || '';
        const enviarSinRed = await fbVehCloudGate(v, 'ready-release', 'enviar a aprobación');
        let corrio = false;
        _cascadeCloudGateThen(v, 'pending-approval', 'aprobar', () => { corrio = true; }, { strict: true });
        await new Promise(r => setTimeout(r, 50));
        delete navigator.onLine;
        if (_onLine) Object.defineProperty(Navigator.prototype, 'onLine', _onLine);
        window.fetch = () => Promise.resolve(new Response(JSON.stringify({ error: { message: 'NOT_FOUND' } }), { status: 404 }));
        const aprobarNoEnNube = await fbVehCloudGate(v, 'pending-approval', 'aprobar', { strict: true });
        window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
        const aprobarErrorRed = await fbVehCloudGate(v, 'pending-approval', 'aprobar', { strict: true });
        const enviarErrorRed = await fbVehCloudGate(v, 'ready-release', 'enviar a aprobación');
        fbSync.enabled = false;
        const aprobarSinSync = await fbVehCloudGate(v, 'pending-approval', 'aprobar', { strict: true });
        return { detenido, aviso, atras, aprobarSinRed, avisoSinRed, enviarSinRed, corrio,
                 aprobarNoEnNube, aprobarErrorRed, enviarErrorRed, aprobarSinSync };
    });
    chk('otro equipo ya lo movió: se detiene', gate.detenido === false, JSON.stringify(gate));
    chk('y dice quién', /Beto Técnico/.test(gate.aviso), gate.aviso);
    chk('si la nube va atrás, sigue', gate.atras === true);
    chk('Aprobar sin red: no se aprueba', gate.aprobarSinRed === false && gate.corrio === false, JSON.stringify(gate));
    chk('y dice que hace falta conexión', /Para aprobar hace falta conexión/.test(gate.avisoSinRed), gate.avisoSinRed);
    chk('Enviar a aprobación sin red: sigue', gate.enviarSinRed === true);
    chk('Aprobar con la nube sin ese vehículo (404): sigue', gate.aprobarNoEnNube === true);
    chk('Aprobar con error de red: no se aprueba', gate.aprobarErrorRed === false);
    chk('Enviar con error de red: sigue', gate.enviarErrorRed === true);
    chk('Aprobar en un equipo sin sync: sigue', gate.aprobarSinSync === true);

    console.log('\n== Quién está aquí (presencia simulada) ==');
    const pres = await page.evaluate(async () => {
        const escritas = [];
        const ahora = () => new Date().toISOString();
        fbSync.enabled = true; fbSync.stationId = 'KIA-EMLAB'; fbSync.db = null; fbSyncModules.cop15 = true;
        window._fbBkSet = (suffix, rec) => { escritas.push({ suffix, rec: JSON.parse(JSON.stringify(rec)) }); return Promise.resolve(); };
        window._fbBkList = () => Promise.resolve([
            { id: 'dev_ana', data: { device: 'dev_ana', operator: 'Ana Técnico', entity: 'veh:veh_1', screen: 'Liberación', editing: true, at: ahora() } },
            { id: 'dev_beto', data: { device: 'dev_beto', operator: 'Beto', entity: 'ronda:gases:' + localToday() + ':' + invShiftNow(), progress: '4/9', at: ahora() } }
        ]);
        cascadeOpenInOperation('veh_1');
        await new Promise(r => setTimeout(r, 600));
        fbPresenceTick();
        await new Promise(r => setTimeout(r, 300));
        fbPresenceTick();
        const chip = document.querySelector('#vehicleInfo .presence-chip');
        const mia = escritas.filter(e => e.suffix === 'presence/' + FB_DEVICE_ID).pop();
        return { chip: chip ? chip.textContent : null, vacio: chip ? chip.classList.contains('is-empty') : null,
                 ambar: chip ? chip.classList.contains('is-editing') : null,
                 escrita: mia ? { entity: mia.rec.entity, screen: mia.rec.screen, operator: mia.rec.operator } : null,
                 n: escritas.length };
    });
    chk('este equipo dice dónde está (vehículo y pantalla)', pres.escrita && pres.escrita.entity === 'veh:veh_1' && pres.escrita.screen === 'Operación' && pres.escrita.operator === 'Ana Manager', JSON.stringify(pres));
    chk('y ve a quien más está en el mismo vehículo', /Ana Técnico también está aquí \(Liberación, capturando\)/.test(pres.chip || '') && !pres.vacio, pres.chip);
    chk('capturando se pinta en ámbar', pres.ambar === true);
    const sinCambio = await page.evaluate(() => { const n0 = _fbPres.sentAt; fbPresenceTick(); return _fbPres.sentAt === n0; });
    chk('sin cambio no se vuelve a escribir en cada latido', sinCambio);

    console.log('\n== Ronda en vivo ==');
    const ronda = await page.evaluate(async () => {
        const hoy = localToday(), turno = invShiftNow();
        const gas = (id, zona, lect) => ({ id, zone: zona, gasType: 'Gas ' + id, controlNo: 'C-' + id, status: 'In use', readings: lect || [] });
        invState.gases = [gas('g1', 'A01'), gas('g2', 'A02', [{ date: hoy, psi: 1500, shift: turno, by: 'Beto', at: new Date().toISOString() }]), gas('g3', 'A03')];
        invState.fuelTanks = [];
        try { localStorage.removeItem('kia_inv_round'); } catch (e) {}
        invStartReadingRound({ fresh: true });
        await new Promise(r => setTimeout(r, 300));
        const chip1 = document.querySelector('#ui-flow .presence-chip');
        document.getElementById('round-reading-input').value = '1800';
        uiFlowSave();
        await new Promise(r => setTimeout(r, 300));
        const titulo = document.querySelector('#ui-flow .uf-q') ? document.querySelector('#ui-flow .uf-q').textContent : '';
        fbPresenceTick();
        await new Promise(r => setTimeout(r, 300));
        const chip2 = document.querySelector('#ui-flow .presence-chip');
        uiFlowBack();
        await new Promise(r => setTimeout(r, 300));
        const nota = document.querySelector('#ui-flow .uf-note.is-other');
        const res = { chip1: chip1 && chip1.getAttribute('data-presence-progress'), titulo,
                      chip2: chip2 && chip2.textContent, nota: nota ? nota.textContent : '' };
        uiFlowClose();
        return res;
    });
    chk('la ronda dice su avance (0/3 al empezar)', ronda.chip1 === '0/3', JSON.stringify(ronda));
    chk('al avanzar se salta lo que Beto ya leyó (pasa a Gas g3)', ronda.titulo === 'Gas g3', ronda.titulo);
    chk('y se ve que Beto también hace la ronda', /Beto también hace esta ronda · va 4\/9/.test(ronda.chip2 || ''), ronda.chip2);
    chk('de regreso se ve quién la tomó y que releer es corrección', /Ya la tomó Beto a las \d\d:\d\d: 1500 PSI/.test(ronda.nota) && /corrección/.test(ronda.nota), ronda.nota);

    chk('sin errores de página ni diálogos nativos', !errores.length, errores.join(' | '));
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\ntodo bien');
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
