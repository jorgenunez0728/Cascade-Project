// Verificación en navegador de 2.1.0: los roles del laboratorio se cumplen de verdad.
//  - Un roster con nombres viejos se migra y queda auditado.
//  - Liberar (checklist, regulación de comparación, enviar a aprobación): solo
//    Signatario y Assistant Manager / Manager. Un Técnico certificado como
//    liberador en la matriz TAMBIÉN queda fuera.
//  - Borrar vehículos y editar límites: solo roles de autoridad.
//  - Nadie aprueba lo que él mismo liberó.
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
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'tomas', operatorName: 'Tomás Técnico', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [
            { id: 'jorge', name: 'Jorge Nunez', role: 'Coordinador', active: true },
            { id: 'ana', name: 'Ana Signataria', role: 'Supervisor', active: true },
            { id: 'pedro', name: 'Pedro Especialista', role: 'Ingeniero', active: true },
            { id: 'tomas', name: 'Tomás Técnico', role: 'Técnico', active: true,
              skills: { release: { lvl: 3 }, cop_appr: { lvl: 3 } } },
            { id: 'pau', name: 'Pau Practicante', role: 'Practicante', active: true }
        ], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ vehicles: [
        { id: 'v1', vin: 'KNAZZZ00000000001', status: 'ready-release', purpose: 'COP-Emisiones', configCode: 'X',
          config: { Modelo: 'CL4', 'EMISSION REGULATION': 'EURO-6E' }, timeline: [], testData: {} },
        { id: 'v2', vin: 'KNAZZZ00000000002', status: 'pending-approval', purpose: 'COP-Emisiones', configCode: 'X',
          config: { Modelo: 'CL4' }, timeline: [],
          testData: { signatures: { releaser: { signerName: 'Ana Signataria', sessionUserId: 'ana', dataUrl: 'data:,' } } } }
    ], lastId: 2 }));
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

    // ── Migración ──
    const mig = await page.evaluate(() => {
        const r = {}; pnState.operators.forEach(o => { r[o.id] = o.role; });
        const aud = (typeof _auditEnsureLoaded === 'function' ? _auditEnsureLoaded() : []).filter(a => a.action === 'rol_migrado');
        return { roles: r, audit: aud.length, sesion: authGetCurrentUser().role };
    });
    chk('Coordinador → Assistant Manager / Manager', mig.roles.jorge === 'Assistant Manager / Manager', JSON.stringify(mig.roles));
    chk('Supervisor → Signatario', mig.roles.ana === 'Signatario');
    chk('Ingeniero → Especialista / Especialista Sr', mig.roles.pedro === 'Especialista / Especialista Sr');
    chk('Técnico y Practicante se quedan', mig.roles.tomas === 'Técnico' && mig.roles.pau === 'Practicante');
    chk('cada rol migrado queda en el historial de cambios', mig.audit === 3, 'n=' + mig.audit);

    // ── Técnico (certificado como liberador en la matriz) ──
    const tec = await page.evaluate(() => {
        activeVehicleId = 'v1';
        releaseChecklistSet('objects', 'kds', 'yes');
        const v1 = db.vehicles.find(v => v.id === 'v1');
        const checklistEscrito = !!(v1.testData.releaseChecklist && v1.testData.releaseChecklist.objects && v1.testData.releaseChecklist.objects.kds);
        const nAntes = db.vehicles.length;
        deleteVehicleCascade('v1');
        const confirmAbierto = !!document.querySelector('.custom-modal-overlay, #globalModal[style*="flex"]');
        pnRegAddNew();
        const regModal = !!document.getElementById('reg-gas-rows');
        const denegados = _auditEnsureLoaded().filter(a => a.action === 'permission_denied').map(a => a.entity && a.entity.label);
        return { puedeLiberar: authCan('test.release'), puedeAprobar: authCan('test.approve'), checklistEscrito,
                 sigueVehiculo: db.vehicles.length === nAntes, confirmAbierto, regModal, denegados };
    });
    chk('un Técnico certificado en la matriz NO libera', tec.puedeLiberar === false);
    chk('ni aprueba', tec.puedeAprobar === false);
    chk('el Técnico no puede llenar el checklist de liberación', tec.checklistEscrito === false);
    chk('el Técnico no puede borrar vehículos', tec.sigueVehiculo === true);
    chk('el Técnico no puede editar límites de regulación', tec.regModal === false);
    chk('cada intento bloqueado queda registrado', ['test.release', 'test.delete', 'regulation.manage'].every(p => tec.denegados.indexOf(p) !== -1), JSON.stringify(tec.denegados));

    // La pestaña Liberación lo dice
    await page.evaluate(() => { const t = document.querySelector('#platform-cop15 .tab[data-tab="liberacion"]'); switchPlatform('cop15'); if (t) t.click(); });
    await page.waitForTimeout(400);
    const nota = await page.evaluate(() => { const s = document.getElementById('releaseVehSelect'); s.value = 'v1'; loadRelease();
        const n = document.getElementById('lib-role-note'); return { vis: n && n.style.display !== 'none', txt: n ? n.textContent : '' }; });
    chk('Liberación avisa al Técnico quién puede liberar', nota.vis && /Signatario/.test(nota.txt) && /Assistant Manager/.test(nota.txt), JSON.stringify(nota));
    chk('el aviso no menciona vigencia', !/vigen/i.test(nota.txt));

    // ── Especialista: más que Técnico, pero no libera ni edita límites ──
    const esp = await page.evaluate(() => { authCreateSession({ id: 'pedro', name: 'Pedro Especialista', role: 'Especialista / Especialista Sr' });
        return { plan: authCan('plan.manage'), liberar: authCan('test.release'), limites: authCan('regulation.manage') }; });
    chk('Especialista administra el plan, pero no libera ni edita límites', esp.plan && !esp.liberar && !esp.limites, JSON.stringify(esp));

    // ── Signatario ──
    const sig = await page.evaluate(() => {
        authCreateSession({ id: 'ana', name: 'Ana Signataria', role: 'Signatario' });
        activeVehicleId = 'v1';
        releaseChecklistSet('objects', 'kds', 'yes');
        const v1 = db.vehicles.find(v => v.id === 'v1');
        const ok = !!(v1.testData.releaseChecklist && v1.testData.releaseChecklist.objects && v1.testData.releaseChecklist.objects.kds);
        const self = authCanApproveVehicle(db.vehicles.find(v => v.id === 'v2'));
        return { puedeLiberar: authCan('test.release'), checklist: ok, selfReason: self.reason };
    });
    chk('el Signatario libera', sig.puedeLiberar && sig.checklist, JSON.stringify(sig));
    chk('el Signatario NO aprueba lo que él mismo liberó', sig.selfReason === 'self');
    const am = await page.evaluate(() => { authCreateSession({ id: 'jorge', name: 'Jorge Nunez', role: 'Assistant Manager / Manager' });
        return authCanApproveVehicle(db.vehicles.find(v => v.id === 'v2')); });
    chk('otra persona de autoridad sí aprueba', am.ok === true, JSON.stringify(am));

    // ── Matriz visible ──
    await page.evaluate(() => { switchPlatform('panel'); pnSwitchTab('pn-users'); });
    await page.waitForTimeout(800);
    const mat = await page.evaluate(() => { const c = document.querySelector('[x-data]') && document.querySelector('[x-data]')._x_dataStack;
        if (c && c[0]) c[0].usersView = 'roles'; return true; });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => { const t = document.querySelector('.pn-roles-table'); if (!t) return null;
        const filas = [...t.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
        const lib = filas.find(f => /Liberar pruebas/.test(f[0]));
        return { cols: [...t.querySelectorAll('thead th div')].map(x => x.textContent), lib, texto: t.closest('.tp-card').textContent }; });
    chk('Datos → Usuarios muestra la matriz de roles', !!m && m.cols.length === 5, JSON.stringify(m && m.cols));
    chk('la matriz dice que liberan solo Signatario y AM/Manager', m && m.lib && m.lib.slice(1).join('|') === '—|—|—|✔|✔', JSON.stringify(m && m.lib));
    chk('la matriz no menciona vigencia', m && !/vigen/i.test(m.texto));
    if (process.env.SHOTS) { const card = await page.$('.pn-roles-table'); if (card) await (await card.evaluateHandle(e => e.closest('.tp-card'))).asElement().screenshot({ path: path.join(process.env.SHOTS, 'roles-matriz.png') }); }

    chk('sin errores de página', errores.length === 0, errores.slice(0, 3).join(' | '));
    await browser.close();
    console.log('');
    if (fallos.length) { console.log(fallos.length + ' fallo(s)'); process.exitCode = 1; }
    else { console.log('todo paso'); process.exitCode = 0; }
})();
