// Verificación en navegador de 2.4.0 — ✏️ Corregir alta.
//  - El caso real: un vehículo capturado con la carrocería equivocada se corrige sin
//    borrarlo, y su prueba registrada en el plan pasa a la configuración correcta.
//  - Archivado con la misma regulación: se corrige con firma.
//  - Archivado con OTRA regulación: no se permite (la pantalla y la capa de datos).
//  - Enviado a aprobación con otra regulación: regresa a Listo para liberar.
//  - Corregir el VIN deja la marca para que otros equipos retiren la copia vieja.
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
        operatorId: 'ana', operatorName: 'Ana Manager', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);

    // Configuraciones reales del catálogo embebido.
    const cfgs = await page.evaluate(() => {
        const keys = Object.keys(fieldMapping);
        const c = allConfigurations.filter(x => x.codigo_config_text && x['BODY TYPE'] && x['EMISSION REGULATION']);
        let A = null, B = null, C = null;
        for (const a of c) {
            const b = c.find(x => x !== a && x.Modelo === a.Modelo && x['EMISSION REGULATION'] === a['EMISSION REGULATION'] &&
                                  x['BODY TYPE'] !== a['BODY TYPE']);
            const o = c.find(x => x.Modelo === a.Modelo && x['EMISSION REGULATION'] !== a['EMISSION REGULATION']);
            if (b && o) { A = a; B = b; C = o; break; }
        }
        const cfg = e => altaConfigFromCatalog(e, keys);
        return { A: { code: A.codigo_config_text, cfg: cfg(A) }, B: { code: B.codigo_config_text, cfg: cfg(B) }, C: { code: C.codigo_config_text, cfg: cfg(C) } };
    });
    chk('el catálogo tiene un par "misma regulación, otra carrocería"', !!cfgs.B.code, JSON.stringify([cfgs.A.code, cfgs.B.code, cfgs.C.code]));

    await page.evaluate((cfgs) => {
        const firma = { signerName: 'Ana Manager', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', signedAt: new Date().toISOString() };
        const veh = (id, vin, status, extra) => Object.assign({
            id, vin, status, purpose: 'COP-Emisiones', configCode: cfgs.A.code, config: JSON.parse(JSON.stringify(cfgs.A.cfg)),
            registeredAt: '2026-09-20T15:00:00.000Z', timeline: [{ timestamp: '2026-09-20T15:00:00.000Z', user: 'Ivan', action: 'Vehículo Registrado' }],
            testData: {}
        }, extra || {});
        db.vehicles = [
            veh('v1', '1M8GDM9AXKP042788', 'in-progress'),
            veh('v2', 'KNA6BA1D5T1000065', 'archived', { archivedAt: '2026-09-22T10:00:00.000Z',
                testData: { signatures: { releaser: firma, approver: firma }, gasResults: { liberador: { values: { CO: 0.2 } } } } }),
            veh('v3', 'KNA6BA1D5T1000066', 'archived', { testData: { signatures: { releaser: firma, approver: firma } } }),
            veh('v4', 'KNA6BA1D5T1000067', 'pending-approval', {
                testData: { signatures: { releaser: firma }, gasResults: { liberador: { values: { CO: 0.2 } } } } })
        ];
        saveDB();
        tpState.testedList = [{ configText: cfgs.A.code, date: '2026-09-22', vin: 'KNA6BA1D5T1000065', vehicleId: 'v2',
            note: 'VIN: KNA6BA1D5T1000065 — Auto desde COP15', purpose: 'COP-Emisiones', planId: 'P1', itemUid: 'U1' }];
        tpState.weeklyPlans = [{ id: 'P1', planId: 'P1', weekDate: '2026-09-21', accepted: true,
            items: [{ uid: 'U1', desc: cfgs.A.code, completed: true }] }];
        tpInvalidateCache(); tpWeekPlanInvalidate(); tpSave();
        window.__firmas = 0;
        window.sigCaptureOpen = (o) => { window.__firmas++; o.onSave(firma); };
    }, cfgs);

    // El modal, manejado como lo haría un técnico.
    const corregir = (id, opts) => page.evaluate(async ({ id, opts }) => {
        vehicleCorrectAltaOpen(id);
        await new Promise(r => setTimeout(r, 150));
        if (opts.vin) { const i = document.getElementById('altaCorrVin'); i.value = opts.vin; i.dispatchEvent(new Event('input')); }
        if (opts.buscar != null) { const q = document.getElementById('altaCorrBuscar'); q.value = opts.buscar; q.dispatchEvent(new Event('input')); }
        if (opts.code) { const s = document.getElementById('altaCorrCfg'); s.value = opts.code; s.dispatchEvent(new Event('change')); }
        const m = document.getElementById('altaCorrMotivo'); m.value = opts.motivo || ''; m.dispatchEvent(new Event('input'));
        const ov = window._altaCorr.overlay;
        const btn = ov.querySelector('[data-modal-btn="1"]');
        const efectos = document.getElementById('altaCorrEfectos').innerText;
        const estado = { disabled: btn.disabled, label: btn.textContent, efectos, opciones: document.getElementById('altaCorrCfg').options.length };
        if (opts.guardar && !btn.disabled) { btn.click(); await new Promise(r => setTimeout(r, 300)); }
        else { window._altaCorr && _altaCorrClose(); }
        await new Promise(r => setTimeout(r, 250));
        document.querySelectorAll('.custom-modal-overlay').forEach(o => o.remove());
        return estado;
    }, { id, opts });

    console.log('\n== Botones para llegar ==');
    const entradas = await page.evaluate(() => {
        switchPlatform('cop15');
        histRowMenu('v2');
        const menu = [...document.querySelectorAll('.custom-modal-overlay button')].map(b => b.textContent);
        document.querySelectorAll('.custom-modal-overlay').forEach(o => o.remove());
        const sel = document.getElementById('activeVehSelect');
        if (![...sel.options].some(o => o.value === 'v1')) { const o = document.createElement('option'); o.value = 'v1'; sel.appendChild(o); }
        sel.value = 'v1'; loadVehicle();
        return { menu: menu.join(' | '), op: (document.getElementById('vehicleInfo') || {}).innerHTML || '' };
    });
    chk('Historial → ⋯ ofrece "Corregir alta"', /Corregir alta/.test(entradas.menu), entradas.menu);
    chk('Operación muestra el botón junto al vehículo', /vehicleCorrectAltaOpen\('v1'\)/.test(entradas.op));

    console.log('\n== En curso: 5DR → otra carrocería (el caso del laboratorio) ==');
    let e = await corregir('v1', { buscar: cfgs.B.code, code: cfgs.B.code, motivo: '' });
    chk('sin motivo no deja guardar', e.disabled === true && /motivo/.test(e.efectos), e.efectos);
    chk('la búsqueda acota el catálogo', e.opciones >= 2 && e.opciones < 50, 'opciones=' + e.opciones);
    e = await corregir('v1', { buscar: cfgs.B.code, code: cfgs.B.code, motivo: 'Se capturó la carrocería equivocada', guardar: true });
    chk('muestra el antes y el después de la carrocería', /Carrocería/.test(e.efectos), e.efectos.slice(0, 200));
    chk('sin firma: el botón dice "Guardar corrección"', e.label === 'Guardar corrección', e.label);
    const v1 = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'v1');
        return { code: v.configCode, body: v.config['BODY TYPE'], id: v.id, tl: v.timeline[v.timeline.length - 1],
                 aud: _auditEnsureLoaded().some(a => a.action === 'alta_corregida'), n: db.vehicles.length };
    });
    chk('el vehículo cambió de configuración sin borrarse (mismo id)', v1.code === cfgs.B.code && v1.id === 'v1' && v1.n === 4, JSON.stringify(v1));
    chk('la línea de tiempo lo registra con antes/después y motivo',
        v1.tl.action === 'Alta corregida' && v1.tl.data.modified.some(m => m.campo === 'Carrocería' && m.razon === 'Se capturó la carrocería equivocada'));
    chk('queda en el historial de cambios', v1.aud);

    console.log('\n== Archivado, misma regulación: con firma y la evidencia se mueve ==');
    e = await corregir('v2', { buscar: cfgs.B.code, code: cfgs.B.code, motivo: 'Carrocería equivocada en el alta', guardar: true });
    chk('pide firma ("Firmar y guardar")', e.label === 'Firmar y guardar', e.label);
    const v2 = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'v2');
        const it = tpState.weeklyPlans[0].items[0];
        return { code: v.configCode, status: v.status, corr: (v.altaCorrections || []).length, firmado: !!(v.altaCorrections[0] || {}).signature,
                 firmas: window.__firmas, ev: tpState.testedList[0].configText, sust: !!it.substituted, done: !!it.completed };
    });
    chk('se corrigió y sigue archivado', v2.code === cfgs.B.code && v2.status === 'archived', JSON.stringify(v2));
    chk('la firma quedó en la corrección', v2.firmado && v2.firmas === 1);
    chk('su prueba registrada ahora cuenta para la configuración correcta', v2.ev === cfgs.B.code, v2.ev);
    chk('la fila del plan que acreditaba queda como sustitución (y sigue hecha)', v2.sust && v2.done);

    console.log('\n== Archivado con OTRA regulación: no se permite ==');
    e = await corregir('v3', { buscar: cfgs.C.code, code: cfgs.C.code, motivo: 'Regulación equivocada', guardar: true });
    chk('el botón queda deshabilitado y dice por qué', e.disabled === true && /volver a evaluar/.test(e.efectos), e.efectos.slice(0, 200));
    const v3 = await page.evaluate((c) => {
        const r = vehicleCorrectAlta('v3', { configCode: c.code, config: c.cfg }, 'Regulación equivocada', { dataUrl: 'x' });
        return { ok: r.ok, code: db.vehicles.find(x => x.id === 'v3').configCode };
    }, cfgs.C);
    chk('tampoco pasa llamando a la capa de datos directo', v3.ok === false && v3.code === cfgs.A.code, JSON.stringify(v3));

    console.log('\n== Enviado a aprobación con otra regulación: regresa a Liberación ==');
    e = await corregir('v4', { buscar: cfgs.C.code, code: cfgs.C.code, motivo: 'Regulación equivocada en el alta', guardar: true });
    chk('lo advierte antes de guardar', /Listo para liberar/.test(e.efectos), e.efectos.slice(0, 200));
    const v4 = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'v4');
        return { status: v.status, lib: !!(v.testData.gasResults || {}).liberador, sig: !!(v.testData.signatures || {}).releaser,
                 aviso: !!v.pendingReturn, hist: (v.returnHistory || []).length };
    });
    chk('regresa a Listo para liberar sin la captura ni la firma anteriores',
        v4.status === 'ready-release' && !v4.lib && !v4.sig && v4.aviso && v4.hist === 1, JSON.stringify(v4));

    console.log('\n== Corregir el VIN ==');
    e = await corregir('v1', { vin: '1M8GDM9A1KP042788', buscar: '', code: '__actual__', motivo: 'x' });
    chk('avisa si el dígito verificador no cuadra', /dígito verificador/.test(e.efectos), e.efectos.slice(0, 200));
    e = await corregir('v1', { vin: 'KNA6BA1D5T1000065', buscar: '', code: '__actual__', motivo: 'VIN mal capturado' });
    chk('avisa que ese VIN ya tiene pruebas archivadas (re-ensayo)', /re-ensayo/.test(e.efectos), e.efectos.slice(0, 200));
    e = await corregir('v1', { vin: 'KNA6BA1D5T1000067', buscar: '', code: '__actual__', motivo: 'VIN mal capturado' });
    chk('no deja tomar el VIN de otro vehículo en curso', e.disabled === true && /EN CURSO/.test(e.efectos), e.efectos.slice(0, 200));
    await corregir('v1', { vin: 'KNA6BA1D5T1000099', buscar: '', code: '__actual__', motivo: 'VIN mal capturado', guardar: true });
    const vin = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'v1');
        const marca = (db.deletedVehicles || []).find(t => t.kind === 'vin-corregido' && t.vin === '1M8GDM9AXKP042788');
        return { vin: v.vin, cambios: (v.vinChanges || []).length, marca: !!marca, sigue: db.vehicles.length,
                 vivo: !vehicleIsTombstoned(v, db.deletedVehicles) };
    });
    chk('el VIN cambió y el vehículo sigue (no lo retira su propia marca)', vin.vin === 'KNA6BA1D5T1000099' && vin.sigue === 4 && vin.vivo, JSON.stringify(vin));
    chk('deja la marca del VIN viejo para los demás equipos', vin.marca && vin.cambios === 1);

    chk('sin errores de página', errores.length === 0, errores.slice(0, 3).join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' fallaron' : 'todo ok'));
    if (fallos.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
