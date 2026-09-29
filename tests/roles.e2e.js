// Verificación en navegador de 2.1.0: los roles del laboratorio se cumplen de verdad.
//  - Un roster con nombres viejos se migra y queda auditado.
//  - [2.20.0] Liberar (enviar a aprobación) es de Técnico hacia arriba; APROBAR (y decidir
//    las fallas de VETS) solo Signatario y Assistant Manager / Manager. Un Técnico
//    certificado como aprobador en la matriz TAMBIÉN queda fuera de aprobar.
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
        activeVehicleId = 'v2';
        approveAndArchive();   // [2.20.0] aprobar sigue siendo de autoridad: se bloquea y se audita
        const sigueSinAprobar = db.vehicles.find(v => v.id === 'v2').status === 'pending-approval';
        activeVehicleId = 'v1';
        const nAntes = db.vehicles.length;
        deleteVehicleCascade('v1');
        const confirmAbierto = !!document.querySelector('.custom-modal-overlay, #globalModal[style*="flex"]');
        pnRegAddNew();
        const regModal = !!document.getElementById('reg-gas-rows');
        const denegados = _auditEnsureLoaded().filter(a => a.action === 'permission_denied').map(a => a.entity && a.entity.label);
        return { puedeLiberar: authCan('test.release'), puedeAprobar: authCan('test.approve'), checklistEscrito, sigueSinAprobar,
                 sigueVehiculo: db.vehicles.length === nAntes, confirmAbierto, regModal, denegados };
    });
    chk('[2.20.0] el Técnico libera por su rol', tec.puedeLiberar === true);
    chk('pero no aprueba, aunque la matriz lo certifique', tec.puedeAprobar === false);
    chk('[2.19.0] el Técnico SÍ marca el checklist de liberación', tec.checklistEscrito === true);
    chk('su intento de aprobar no aprueba', tec.sigueSinAprobar === true);
    chk('el Técnico no puede borrar vehículos', tec.sigueVehiculo === true);
    chk('el Técnico no puede editar límites de regulación', tec.regModal === false);
    chk('cada intento bloqueado queda registrado', ['test.approve', 'test.delete', 'regulation.manage'].every(p => tec.denegados.indexOf(p) !== -1), JSON.stringify(tec.denegados));

    // La pestaña Liberación lo dice
    await page.evaluate(() => { const t = document.querySelector('#platform-cop15 .tab[data-tab="liberacion"]'); switchPlatform('cop15'); if (t) t.click(); });
    await page.waitForTimeout(400);
    const nota = await page.evaluate(() => { libSwitchSubtab('aprobador'); const s = document.getElementById('approvalVehSelect');
        if (![...s.options].some(o => o.value === 'v2')) { const o = document.createElement('option'); o.value = 'v2'; s.appendChild(o); }
        s.value = 'v2'; loadApproval();
        const n = document.getElementById('appr-role-note'); return { vis: n && n.style.display !== 'none', txt: n ? n.textContent : '' }; });
    chk('Aprobación avisa al Técnico quién puede aprobar', nota.vis && /Signatario/.test(nota.txt) && /Assistant Manager/.test(nota.txt), JSON.stringify(nota));
    chk('el aviso no menciona vigencia', !/vigen/i.test(nota.txt));

    // ── Especialista: más que Técnico, pero no libera ni edita límites ──
    const esp = await page.evaluate(() => { authCreateSession({ id: 'pedro', name: 'Pedro Especialista', role: 'Especialista / Especialista Sr' });
        return { plan: authCan('plan.manage'), liberar: authCan('test.release'), aprobar: authCan('test.approve'), limites: authCan('regulation.manage') }; });
    chk('Especialista administra el plan y libera, pero no aprueba ni edita límites', esp.plan && esp.liberar && !esp.aprobar && !esp.limites, JSON.stringify(esp));

    // ── Signatario ──
    const sig = await page.evaluate(() => {
        authCreateSession({ id: 'ana', name: 'Ana Signataria', role: 'Signatario' });
        activeVehicleId = 'v1';
        releaseChecklistSet('objects', 'cardaq', 'ok');
        const v1 = db.vehicles.find(v => v.id === 'v1');
        const ok = !!(v1.testData.releaseChecklist && v1.testData.releaseChecklist.objects && v1.testData.releaseChecklist.objects.cardaq);
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
        const lib = filas.find(f => /Liberar pruebas/.test(f[0])), apr = filas.find(f => /^Aprobar/.test(f[0]));
        return { cols: [...t.querySelectorAll('thead th div')].map(x => x.textContent), lib, apr, texto: t.closest('.tp-card').textContent }; });
    chk('Datos → Usuarios muestra la matriz de roles', !!m && m.cols.length === 5, JSON.stringify(m && m.cols));
    chk('[2.20.0] la matriz: liberan de Técnico hacia arriba', m && m.lib && m.lib.slice(1).join('|') === '—|✔|✔|✔|✔', JSON.stringify(m && m.lib));
    chk('la matriz: aprueban solo Signatario y AM/Manager', m && m.apr && m.apr.slice(1).join('|') === '—|—|—|✔|✔', JSON.stringify(m && m.apr));
    chk('la matriz no menciona vigencia', m && !/vigen/i.test(m.texto));
    if (process.env.SHOTS) { const card = await page.$('.pn-roles-table'); if (card) await (await card.evaluateHandle(e => e.closest('.tp-card'))).asElement().screenshot({ path: path.join(process.env.SHOTS, 'roles-matriz.png') }); }

    chk('sin errores de página', errores.length === 0, errores.slice(0, 3).join(' | '));
    await browser.close();
    console.log('');
    if (fallos.length) { console.log(fallos.length + ' fallo(s)'); process.exitCode = 1; }
    else { console.log('todo paso'); process.exitCode = 0; }
})();
