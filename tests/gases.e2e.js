// Verificación en navegador de 2.2.0: la aprobación y el PDF usan los gases de la
// regulación con la que se LIBERÓ.
//  - Un equipo con el SULEV 30 viejo (NMHC y NOx separados) lo migra a NMOG+NOx.
//  - La aprobación pide los gases del perfil congelado del liberador, aunque este
//    equipo no tenga ese perfil.
//  - Un SULEV 30 liberado antes de 2.2.0 se aprueba con NMHC y NOx (su definición).
//  - Una prueba de emisiones sin gases ya no se aprueba "sin nada que verificar".
//  - El F05 imprime los gases y límites congelados.
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
    const firma = { signerName: 'Ana Signataria', sessionUserId: 'ana', dataUrl: 'data:,', signedAt: new Date().toISOString() };
    const base = (id, vin, reg, gr) => ({
        id, vin, status: 'pending-approval', purpose: 'COP-Emisiones', configCode: 'X',
        config: { Modelo: 'CL4', 'EMISSION REGULATION': reg, REGION: 'USA' }, timeline: [],
        testData: { signatures: { releaser: firma }, gasResults: gr }
    });
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'beto', operatorName: 'Beto Signatario', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [
            { id: 'ana', name: 'Ana Signataria', role: 'Signatario', active: true },
            { id: 'beto', name: 'Beto Signatario', role: 'Signatario', active: true }
        ], tasks: [], projects: [], alerts: [] }));
    // Este equipo tiene el SULEV 30 VIEJO y NO tiene PRE-EURO 7 renombrado "EU7-LAB".
    localStorage.setItem('kia_regulations_v1', JSON.stringify({ profiles: [
        { id: 'reg_sulev30', name: 'SULEV 30', shortName: 'SULEV 30', gases: [
            { field: 'CO', label: 'CO', unit: 'g/mi', limit: 1.0 },
            { field: 'CO2', label: 'CO₂', unit: 'g/mi', limit: null },
            { field: 'NMHC', label: 'NMHC', unit: 'g/mi', limit: 0.01 },
            { field: 'NOx', label: 'NOx', unit: 'g/mi', limit: 0.02 }] }
    ] }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ vehicles: [
        // Liberado en OTRO equipo con un perfil que este no tiene: viaja congelado.
        base('v1', 'KNAZZZ00000000001', 'EU7-LAB', { liberador: {
            values: { CO: 0.2, NOx: 0.01 }, capturedBy: 'Ana Signataria', capturedAt: new Date().toISOString(), passedLimits: true,
            profile: { name: 'EU7-LAB', gases: [
                { field: 'CO', label: 'CO', unit: 'g/km', limit: 1.0 },
                { field: 'NOx', label: 'NOx', unit: 'g/km', limit: 0.06 }] } } }),
        // SULEV 30 liberado antes de 2.2.0 (sin perfil congelado, NMHC y NOx).
        base('v2', 'KNAZZZ00000000002', 'SULEV 30', { liberador: {
            values: { CO: 0.1, NMHC: 0.004, NOx: 0.012 }, capturedBy: 'Ana Signataria', capturedAt: new Date().toISOString() } }),
        // Emisiones sin gases ni perfil.
        base('v3', 'KNAZZZ00000000003', 'N/A', {}),
        // Por liberar: SULEV 30 con el perfil vigente.
        Object.assign(base('v4', 'KNAZZZ00000000004', 'SULEV 30', {}), { status: 'ready-release' })
    ], lastId: 4 }));
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

    console.log('\n== Migración del perfil guardado ==');
    const mig = await page.evaluate(() => {
        const p = getRegulationProfile('SULEV 30');
        const aud = (typeof _auditEnsureLoaded === 'function' ? _auditEnsureLoaded() : []).filter(a => a.action === 'regulacion_migrada');
        return { campos: p.gases.map(g => g.field).join(','), lim: (p.gases.find(g => g.field === 'NMOGNOx') || {}).limit, aud: aud.length,
                 guardado: JSON.parse(localStorage.getItem('kia_regulations_v1')).migr };
    });
    chk('SULEV 30 guardado pasa a CO, CO₂, NMOG+NOx', mig.campos === 'CO,CO2,NMOGNOx', mig.campos);
    chk('NMOG+NOx ≤ 0.030 g/mi', mig.lim === 0.03, String(mig.lim));
    chk('la migración queda en el historial de cambios', mig.aud === 1, 'n=' + mig.aud);
    chk('queda la guarda para no repetirla', mig.guardado && mig.guardado.sulev30 === 1, JSON.stringify(mig.guardado));

    const aprobar = async (id) => page.evaluate((id) => {
        const s = document.getElementById('approvalVehSelect');
        if (![...s.options].some(o => o.value === id)) { const o = document.createElement('option'); o.value = id; s.appendChild(o); }
        s.value = id;
        loadApproval();
        const campos = [...document.querySelectorAll('#appr-gas-entry-content .lib-gas-input')].map(i => i.dataset.field);
        const btn = document.getElementById('approve-archive-btn');
        return { campos: campos.join(','), btn: btn ? btn.disabled : null,
                 txt: (document.getElementById('appr-gas-entry-content') || {}).textContent || '' };
    }, id);
    const teclear = async (vals) => page.evaluate((vals) => {
        Object.keys(vals).forEach(f => {
            const i = document.querySelector('#appr-gas-entry-content .lib-gas-input[data-field="' + f + '"]');
            if (i) i.value = vals[f];
        });
        libOnApproverGasChange();
        return document.getElementById('approve-archive-btn').disabled;
    }, vals);

    console.log('\n== Liberación: los gases del perfil vigente ==');
    const lib = await page.evaluate(() => {
        const s = document.getElementById('releaseVehSelect');
        if (![...s.options].some(o => o.value === 'v4')) { const o = document.createElement('option'); o.value = 'v4'; s.appendChild(o); }
        s.value = 'v4'; loadRelease();
        const campos = [...document.querySelectorAll('#lib-gas-entry-content .lib-gas-input')].map(i => i.dataset.field).join(',');
        const put = (f, v) => { const i = document.querySelector('#lib-gas-entry-content .lib-gas-input[data-field="' + f + '"]'); if (i) i.value = v; };
        put('CO', '0.1'); put('NMOGNOx', '0.027'); libOnGasChange();
        const conCombo = document.getElementById('release-archive-btn').disabled;
        put('NMOGNOx', '0.031'); libOnGasChange();
        const sobre = document.getElementById('release-archive-btn').disabled;
        return { campos, conCombo, sobre };
    });
    chk('SULEV 30 pide CO, CO₂ y NMOG+NOx', lib.campos === 'CO,CO2,NMOGNOx', lib.campos);
    chk('NMOG+NOx 0.027 pasa (el botón se habilita)', lib.conCombo === false);
    chk('NMOG+NOx 0.031 no pasa', lib.sobre === true);

    console.log('\n== Aprobación con el perfil congelado ==');
    let a = await aprobar('v1');
    chk('pide los gases del liberador aunque este equipo no tenga EU7-LAB', a.campos === 'CO,NOx', a.campos + ' | ' + a.txt.slice(0, 120));
    chk('con los mismos valores se habilita', (await teclear({ CO: '0.2', NOx: '0.01' })) === false);
    chk('con un valor distinto no', (await teclear({ CO: '0.2', NOx: '0.02' })) === true);

    console.log('\n== SULEV 30 liberado antes de 2.2.0 ==');
    a = await aprobar('v2');
    chk('se aprueba con NMHC y NOx (su definición), no con NMOG+NOx', a.campos === 'CO,CO2,NMHC,NOx', a.campos);
    chk('CO₂ que nadie capturó no bloquea', (await teclear({ CO: '0.1', NMHC: '0.004', NOx: '0.012' })) === false);

    console.log('\n== Emisiones sin gases ==');
    a = await aprobar('v3');
    chk('ya no se aprueba "sin nada que verificar"', a.btn === true, 'disabled=' + a.btn);
    chk('y dice que se devuelva al liberador', /Devolver al liberador/.test(a.txt), a.txt.slice(0, 160));
    const bloq = await page.evaluate(() => {
        activeVehicleId = 'v3';
        let abrio = false; const o = window.sigCaptureOpen; window.sigCaptureOpen = () => { abrio = true; };
        try { approveAndArchive(); } catch (e) {}
        window.sigCaptureOpen = o;
        return { abrio, status: db.vehicles.find(v => v.id === 'v3').status };
    });
    chk('approveAndArchive tampoco lo deja pasar (capa de datos)', !bloq.abrio && bloq.status === 'pending-approval', JSON.stringify(bloq));

    console.log('\n== El F05 imprime lo congelado ==');
    const pdf = await page.evaluate(() => {
        const b64 = generateCOP15PDF('v1', { returnBase64: true, silent: true });
        const s = atob(b64 || '');
        const b2 = atob(generateCOP15PDF('v2', { returnBase64: true, silent: true }) || '');
        return { eu7: /EU7-LAB/.test(s), nox: /<= 0\.06/.test(s), sulevNmhc: /NMHC/.test(b2), sulevCombo: /NMOG\+NOx/.test(b2) };
    });
    chk('el título de resultados cita la regulación con la que se liberó', pdf.eu7);
    chk('y el límite congelado (NOx ≤ 0.06)', pdf.nox);
    chk('el SULEV 30 viejo imprime NMHC, no NMOG+NOx', pdf.sulevNmhc && !pdf.sulevCombo, JSON.stringify(pdf));

    chk('sin errores de página', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' fallaron' : 'todo ok'));
    process.exitCode = fallos.length ? 1 : 0;
})();
