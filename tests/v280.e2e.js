// Verificación en navegador de 2.8.0 — Revisión dirigida.
//  - Se activa desde Datos → Regulaciones (fecha efectiva + procedimiento).
//  - El Alta REAL (saveNewVehicle) sella el vehículo nuevo; uno anterior no se sella.
//  - Aprobación: el vehículo sellado con archivo de VETS muestra los cinco bloques y
//    NO pide teclear; el anterior sigue con doble ciego (campos para teclear).
//  - El candado vive en approveAndArchive: sin revisar no se archiva.
//  - Un ámbar exige "Acepto porque…"; al aprobar queda testData.review.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const EU = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'vets-eu-wltp.json'), 'utf8'));

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
        operators: [{ id: 'ana', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true },
                    { id: 'luis', name: 'Luis Signatario', role: 'Signatario', active: true }],
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
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);

    console.log('\n== Activar desde Regulaciones ==');
    const act = await page.evaluate(async () => {
        switchPlatform('panel'); pnSwitchTab('pn-regulations');
        await new Promise(r => setTimeout(r, 400));
        const antes = document.getElementById('pn-content').innerText;
        document.getElementById('review-proc').value = 'COP15 rev. 05';
        [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Activar').click();
        await new Promise(r => setTimeout(r, 300));
        document.getElementById('_modal_confirm').click();
        await new Promise(r => setTimeout(r, 500));
        return { antes, st: reviewFlowSettings(), despues: document.getElementById('pn-content').innerText,
                 aud: _auditEnsureLoaded().some(a => a.action === 'revision_dirigida_activada') };
    });
    chk('antes: todas las aprobaciones son con doble ciego', /todas las aprobaciones son con doble ciego/.test(act.antes));
    chk('activa desde hoy con el procedimiento', act.st && act.st.active && act.st.since === await page.evaluate(() => localToday()) && act.st.procRef === 'COP15 rev. 05');
    chk('la tarjeta lo dice y queda en el historial', /Activa/.test(act.despues) && act.aud);

    console.log('\n== El Alta real sella el vehículo nuevo ==');
    const alta = await page.evaluate(() => {
        const row = allConfigurations.find(x => /EUROPE/i.test(x.REGION || '') && x['EMISSION REGULATION'] === 'PRE-EURO 7');
        currentFilters = {};
        Object.keys(fieldMapping).forEach(k => { if (row[k] != null) currentFilters[k] = row[k]; });
        document.getElementById('modeToggle').checked = false;
        document.getElementById('vin').value = '3KPFT51B7TE407968';
        const pur = document.getElementById('vehiclePurpose');
        pur.value = [...pur.options].map(o => o.value).find(v => /COP/i.test(v) && /Emis/i.test(v)) || pur.options[1].value;
        const op = document.getElementById('reg_operator');
        if (op && !op.value && op.options.length > 1) op.value = op.options[1].value;
        const n = db.vehicles.length;
        saveNewVehicle();
        const v = db.vehicles[db.vehicles.length - 1];
        return { creado: db.vehicles.length === n + 1, sello: v && v.reviewFlow, id: v && v.id, code: row.codigo_config_text };
    });
    chk('el vehículo nuevo queda sellado "dirigida"', alta.creado && alta.sello === 'dirigida', JSON.stringify(alta));

    // Preparar las dos pruebas para aprobar (liberadas por Luis, con archivo de VETS).
    await page.evaluate(({ eu, idNuevo }) => {
        const rec = vetsExtract(eu);
        const cls = vetsClassifyChecks(rec.checks, []).map(x => ({ check: x.check, level: 'importante', known: false }));
        const s = vetsSummary(rec, { fileName: 'wltc.xlsx', sha256: 'ab', at: '2026-08-25T11:00:00Z', by: 'Luis' }, cls,
            { vinStatus: 'ok', justifications: { 'PM Pre Filter Temp': 'termopar revisado' } });
        const prof = getRegulationProfile('PRE-EURO 7');
        const vals = {};
        prof.gases.forEach(g => {
            const r = { gases: {} }; Object.keys(s.gases).forEach(k => { r.gases[k] = { value: s.gases[k].v, unit: s.gases[k].u }; });
            const x = vetsGasValue(r, g.field, g.unit); if (x !== null) vals[g.field] = x;
        });
        const firma = { signerName: 'Luis Signatario', sessionUserId: 'luis', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', signedAt: new Date().toISOString() };
        const listo = (v) => {
            v.status = 'pending-approval';
            v.homolog = { f0: 102.5, f1: 0.147, f2: 0.03544, tm: 1500, mr: 50.2 };
            v.testData = { vets: JSON.parse(JSON.stringify(s)), testDatetime: '2026-08-25T10:12', preconditioning: { datetime: '2026-08-24T08:00' },
                gasResults: { liberador: { values: Object.assign({}, vals), profile: _libGasProfileSnapshot(prof, 'PRE-EURO 7') } },
                signatures: { releaser: firma } };
        };
        const nuevo = db.vehicles.find(v => v.id === idNuevo);
        listo(nuevo);
        const viejo = JSON.parse(JSON.stringify(nuevo));
        viejo.id = 'viejo'; viejo.vin = '3KPFT51B7TE407969'; delete viejo.reviewFlow; viejo.registeredAt = '2026-09-01T10:00:00.000Z';
        viejo.testData.vets.testRef = 'otra-prueba'; viejo.testData.vets.vinFile = viejo.vin; viejo.testData.vets.vinEcu = viejo.vin;
        db.vehicles.push(viejo);
        saveDB();
        window.sigCaptureOpen = (o) => o.onSave({ signerName: 'Ana Manager', sessionUserId: 'ana', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', signedAt: new Date().toISOString() });
    }, { eu: EU, idNuevo: alta.id });

    const aprobar = (id) => page.evaluate((id) => {
        switchPlatform('cop15');
        document.querySelector('#platform-cop15 .tab[data-tab="liberacion"]').click();
        const s = document.getElementById('approvalVehSelect');
        if (![...s.options].some(o => o.value == id)) { const o = document.createElement('option'); o.value = id; s.appendChild(o); }
        s.value = id; loadApproval();
        const c = document.getElementById('appr-gas-entry-content');
        return { titulo: document.getElementById('appr-card-title').textContent, txt: c.innerText, inputs: c.querySelectorAll('.lib-gas-input').length,
                 bloques: c.querySelectorAll('.review-block').length, btn: document.getElementById('approve-archive-btn').disabled };
    }, id);

    console.log('\n== Vehículo anterior: doble ciego como siempre ==');
    let a = await aprobar('viejo');
    chk('pide teclear los gases (doble ciego)', a.inputs >= 4 && a.bloques === 0 && /Verificación de Aprobador/.test(a.titulo), JSON.stringify(a).slice(0, 200));

    console.log('\n== Vehículo nuevo: revisión dirigida ==');
    a = await aprobar(alta.id);
    chk('muestra cinco bloques y ningún campo para teclear', a.bloques === 5 && a.inputs === 0 && /Revisión del aprobador/.test(a.titulo), JSON.stringify(a).slice(0, 200));
    chk('el botón de aprobar empieza deshabilitado', a.btn === true);
    const tira = await page.evaluate((id) => ({ nuevo: getNextStep(db.vehicles.find(v => v.id == id)).action,
        viejo: getNextStep(db.vehicles.find(v => v.id === 'viejo')).action, nota: document.getElementById('appr-panel-note').textContent }), alta.id);
    chk('la tira "Siguiente" y el aviso del aprobador dicen el flujo correcto', tira.nuevo === 'Aprobar (revisión dirigida)' &&
        tira.viejo === 'Aprobar (doble ciego)' && /revisión dirigida/.test(tira.nota), JSON.stringify(tira));
    chk('la verificación IMPORTANTE sale en ámbar con la justificación del liberador', /PM Pre Filter Temp — IMPORTANTE/.test(a.txt) && /termopar revisado/.test(a.txt));

    const candado = await page.evaluate((id) => {
        approveAndArchive();
        const v = db.vehicles.find(x => x.id == id);
        return { st: v.status, aud: _auditEnsureLoaded().some(x => x.action === 'approval_blocked_review') };
    }, alta.id);
    chk('candado en la capa de datos: sin revisar no se archiva', candado.st === 'pending-approval' && candado.aud);

    const rev = await page.evaluate(async (id) => {
        const c = document.getElementById('appr-gas-entry-content');
        const click = () => {
            const b = [...c.querySelectorAll('.review-ack')].find(x => x.textContent.trim() === 'Revisado ✓');
            if (b) { b.click(); return true; } return false;
        };
        while (click()) { await new Promise(r => setTimeout(r, 30)); }
        const sinJust = document.getElementById('approve-archive-btn').disabled;
        const inp = document.getElementById('review-just-validez');
        let vacio = null;
        if (inp) {
            [...c.querySelectorAll('.review-ack')].find(x => x.textContent.trim() === 'Aceptar').click();
            vacio = !(_reviewMarks[id] || {}).validez;
            document.getElementById('review-just-validez').value = 'Termopar del prefiltro verificado; límite mal configurado en VETS';
            [...document.querySelectorAll('#appr-gas-entry-content .review-ack')].find(x => x.textContent.trim() === 'Aceptar').click();
        }
        return { sinJust, vacio, listo: document.getElementById('approve-archive-btn').disabled === false,
                 estado: (document.getElementById('review-status') || {}).textContent };
    }, alta.id);
    chk('los verdes se marcan de un toque; falta el ámbar', rev.sinJust === true);
    chk('el ámbar sin "Acepto porque…" no se marca', rev.vacio === true);
    chk('con justificación, se habilita aprobar', rev.listo, rev.estado);

    const fin = await page.evaluate((id) => {
        approveAndArchive();
        const v = db.vehicles.find(x => x.id == id);
        const ev = _auditEnsureLoaded().filter(x => x.action === 'vehicle_released').pop();
        return { st: v.status, review: v.testData.review, apr: v.testData.gasResults.aprobador, tl: v.timeline[v.timeline.length - 1].action,
                 ev: ev && ev.after };
    }, alta.id);
    chk('se archiva', fin.st === 'archived');
    chk('queda testData.review con los cinco bloques y la justificación', fin.review && fin.review.blocks.length === 5 &&
        fin.review.blocks.find(b => b.id === 'validez').justification.startsWith('Termopar') && fin.review.procRef === 'COP15 rev. 05');
    chk('el registro del aprobador dice el método (no simula un doble ciego)', fin.apr && fin.apr.method === 'revision-dirigida' && fin.apr.matchedLiberador === null);
    chk('línea de tiempo e historial lo nombran', /revisión dirigida/.test(fin.tl) && fin.ev && fin.ev.metodo === 'dirigida');

    console.log('\n== Liberación avisa qué flujo le toca ==');
    const nota = await page.evaluate(() => {
        const v = JSON.parse(JSON.stringify(db.vehicles.find(x => x.id === 'viejo')));
        v.id = 'sinvets'; v.vin = 'KNA6BA1D5T1000065'; v.reviewFlow = 'dirigida'; v.status = 'ready-release'; v.testData = {};
        db.vehicles.push(v); saveDB();
        const s = document.getElementById('releaseVehSelect');
        if (![...s.options].some(o => o.value === 'sinvets')) { const o = document.createElement('option'); o.value = 'sinvets'; s.appendChild(o); }
        s.value = 'sinvets'; loadRelease();
        return document.getElementById('lib-gas-entry-content').innerText;
    });
    chk('sellado sin archivo de VETS → avisa que irá con doble ciego', /sin archivo de VETS se aprobará con doble ciego/.test(nota), nota.slice(0, 200));

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
