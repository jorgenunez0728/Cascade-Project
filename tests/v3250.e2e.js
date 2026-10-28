// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.25.0 — Una prueba que falla · la carta de la celda · comparar al aprobar ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Técnico libera con NOx sobre el límite: la tarjeta pide confirmar y observar, el botón
// dice "como FALLA". Signatario aprueba con doble ciego: ve "comparado con su familia"
// (NOx atípico) y debe decidir la falla (inválida → no cuenta; válida → sí cuenta y alerta).
// Repetir la prueba guarda lo tecleado. Un Master en Operación (formato simple) captura sus
// gases y CoP → Control SPC → 🎯 Celda los grafica. 1440×950 y 430×900.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));
const SHOTS = process.env.SHOTS || '';

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const SEED = () => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'beto', operatorName: 'Beto Técnico', expiresAt: '2099-01-01T00:00:00.000Z' }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [
        { id: 'beto', name: 'Beto Técnico', role: 'Técnico', active: true },
        { id: 'sara', name: 'Sara Signataria', role: 'Signatario', active: true },
        { id: 'admin', name: 'Admin', role: 'Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    const cfg = { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1600CC GAMMA-II', 'TRANSMISSION': '7DCT', 'MODEL YEAR (VIN)': '26 MODEL',
                  'EMISSION REGULATION': 'PRE-EURO 7', 'ENVIRONMENT PACKAGE': '0', 'ENGINE PACKAGE': 'LOW POWER', 'BODY TYPE': 'WGN',
                  'REGION': 'EUROPE', 'DRIVE TYPE': 'LHD' };
    const vals = (i) => ({ CO: 0.30 + (i % 3) / 100, CO2: 140 + (i % 4), THC: 0.050 + (i % 2) / 1000, NOx: 0.020 + (i % 3) / 1000, NMHC: 0.030 });
    const hist = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ id: 'h' + i, vin: 'KNAHIST0000000' + String(i).padStart(3, '0'), status: 'archived',
        purpose: 'COP-Emisiones', configCode: 'CL4-26-WGN', config: cfg, registeredAt: '2026-0' + (i + 1) + '-01T08:00:00.000Z',
        testData: { testDatetime: '2026-0' + (i + 1) + '-02T10:00', gasResults: { aprobador: { values: vals(i) }, liberador: { values: vals(i) } } } }));
    const ready = (id, vin) => ({ id: id, vin: vin, status: 'ready-release', purpose: 'COP-Emisiones', configCode: 'CL4-26-WGN', config: cfg,
        registeredAt: '2026-10-20T08:00:00.000Z', timeline: [], testData: { testDatetime: '2026-10-21T10:00' } });
    const MV = 'KNAMASTER00000123';
    const masterTest = (i, co2) => ({ id: 'mt' + i, vin: MV, status: 'archived', purpose: 'Correlacion', configCode: 'CL4-26-WGN', config: cfg,
        registeredAt: '2026-0' + (i + 1) + '-05T08:00:00.000Z', timeline: [],
        testData: { simple: { operator: 'Beto Técnico', datetime: '2026-0' + (i + 1) + '-05T09:00',
            master: { values: { CO: 0.31, CO2: co2, THC: 0.05, NOx: 0.021, NMHC: 0.03 }, profile: { name: 'PRE-EURO 7', gases: [] } } } } });
    const vehicles = hist.concat([ready('vf', 'KNAFALLA000000001'), ready('vg', 'KNAFALLA000000002'), ready('vr', 'KNAFALLA000000003'),
        masterTest(0, 140), masterTest(1, 141), masterTest(2, 139), masterTest(3, 140),
        { id: 'mnow', vin: MV, status: 'testing', purpose: 'Correlacion', configCode: 'CL4-26-WGN', config: cfg,
          registeredAt: '2026-10-25T08:00:00.000Z', timeline: [], testData: { simple: { operator: 'Beto Técnico', datetime: '2026-10-26T09:00' } } }]);
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 100, vehicles: vehicles,
        siteMasters: [{ id: 'mk4', vin: MV, name: 'Master K4', body: 'wagon', paint: 'blanco', spot: 'p1', updatedAt: '2026-10-01T00:00:00.000Z' }] }));
};

async function abrir(browser, vp, extra) {
    const context = await browser.newContext(Object.assign({ viewport: vp, timezoneId: 'America/Mexico_City', locale: 'es-MX' }, extra || {}));
    const page = await context.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
    await page.waitForFunction(() => typeof db !== 'undefined' && db.vehicles && db.vehicles.length >= 15 && typeof aprFailBoxSync === 'function', null, { timeout: 20000 });
    await page.waitForTimeout(600);
    // Aislar: F05 completo, checklist y firma tienen sus propias pruebas.
    await page.evaluate(() => {
        window.validatePdfCompleteness = () => ({ missing: [], soft: [] });
        window.releaseChecklistRows = () => ({ missing: [], objects: [], docs: [] });
        window.sigCaptureOpen = (o) => { const u = authGetCurrentUser(); o.onSave({ signerName: u.name, sessionUserName: u.name, sessionUserId: u.id, dataUrl: 'data:image/png;base64,iVBORw0KGgo=', signedAt: new Date().toISOString() }); };
        document.querySelectorAll('.toast').forEach(t => t.remove());
    });
    return { context, page, errores };
}
const GASES = { CO: '0.3', CO2: '140', THC: '0.05', NOx: '0.071', NMHC: '0.03' };
const teclear = (page, box, vals) => page.evaluate(([box, vals]) => {
    Object.keys(vals).forEach(f => {
        const i = document.querySelector('#' + box + ' .lib-gas-input[data-field="' + f + '"]');
        if (i) { i.value = vals[f]; i.dispatchEvent(new Event('input', { bubbles: true })); }
    });
}, [box, vals]);
const liberar = (page, id) => page.evaluate(id => {
    dashGo('cop15', 'liberacion');
    const s = document.getElementById('releaseVehSelect'); refreshAllLists(); s.value = id; loadRelease();
}, id);
const aprobarAbrir = (page, id) => page.evaluate(id => {
    dashGo('cop15', 'liberacion');
    const s = document.getElementById('approvalVehSelect'); refreshAllLists(); s.value = id; loadApproval();
}, id);
const sesion = (page, id) => page.evaluate(id => { const o = pnState.operators.find(x => x.id === id); authCreateSession({ id: o.id, name: o.name, role: o.role }); }, id);
const btn = (page, id) => page.evaluate(id => { const b = document.getElementById(id); return { dis: !!b.disabled, why: b.getAttribute('data-why') || '', txt: b.textContent.trim() }; }, id);
const veh = (page, id) => page.evaluate(id => JSON.parse(JSON.stringify(db.vehicles.find(v => v.id === id))), id);

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    console.log('\n== Escritorio 1440×950 ==');
    let { context, page, errores } = await abrir(browser, { width: 1440, height: 950 });

    // ── Liberar una falla ─────────────────────────────────────────────
    await liberar(page, 'vf');
    await teclear(page, 'lib-gas-entry-content', GASES);
    let b = await btn(page, 'release-archive-btn');
    let box = await page.evaluate(() => { const x = document.getElementById('lib-fail-box'); return { vis: x.style.display !== 'none', t: x.innerText }; });
    ok('NOx sobre el límite: aparece la tarjeta de falla', box.vis && /sobre el límite: NOx/i.test(box.t) && /no se repite/i.test(box.t), box.t);
    ok('el botón dice "como FALLA" y explica qué falta', /como FALLA/.test(b.txt) && b.dis && /Confirma/.test(b.why), JSON.stringify(b));
    if (SHOTS) await page.locator('#lib-gas-entry-card').screenshot({ path: SHOTS + '/v3250-lib.png' });
    await page.evaluate(() => submitToApproval());
    let st = await page.evaluate(() => ({ s: db.vehicles.find(v => v.id === 'vf').status, inv: document.getElementById('lib-fail-confirm').getAttribute('aria-invalid') }));
    ok('sin confirmar no se envía (el error va en la casilla)', st.s === 'ready-release' && st.inv === 'true', JSON.stringify(st));
    await page.click('#lib-fail-confirm');
    await page.fill('#lib-fail-note', 'El reporte de VETS dice NOx 0.071; se releyó.');
    b = await btn(page, 'release-archive-btn');
    ok('confirmada y observada: el botón se habilita', !b.dis && !b.why, JSON.stringify(b));
    await page.evaluate(() => submitToApproval());
    await page.waitForTimeout(200);
    let v = await veh(page, 'vf');
    const lib = v.testData.gasResults.liberador;
    ok('se envía a aprobación como falla declarada', v.status === 'pending-approval' && lib.passedLimits === false && lib.failing.join() === 'NOx' &&
       /0\.071/.test(lib.failDeclared.note) && lib.failDeclared.byId === 'beto', JSON.stringify(lib));
    ok('la línea de tiempo lo dice', /sobre el límite \(NOx\)/.test(v.timeline[v.timeline.length - 1].action));
    // Segunda (para la falla válida) y tercera (para repetir)
    for (const id of ['vg']) {
        await liberar(page, id); await teclear(page, 'lib-gas-entry-content', GASES);
        await page.click('#lib-fail-confirm'); await page.fill('#lib-fail-note', 'Releí el reporte del banco.');
        await page.evaluate(() => submitToApproval()); await page.waitForTimeout(150);
    }

    // ── Repetir la prueba guarda lo tecleado ─────────────────────────
    await liberar(page, 'vr');
    await teclear(page, 'lib-gas-entry-content', GASES);
    await page.evaluate(() => requestRetest());
    await page.waitForTimeout(200);
    const pr = await page.evaluate(() => { const m = document.querySelectorAll('#globalModal'); const o = m[m.length - 1]; return o ? o.innerText : ''; });
    ok('repetir con un gas sobre el límite advierte que se envíe como FALLA', /NOx está sobre el límite/.test(pr) && /envíala como FALLA/.test(pr), pr.slice(0, 200));
    await page.evaluate(() => { const m = document.querySelectorAll('#globalModal'); const o = m[m.length - 1]; o.querySelector('#_ui_prompt').value = 'Se cortó el ciclo en la fase 3'; [...o.querySelectorAll('button')].find(x => /Regresar a prueba/.test(x.textContent)).click(); });
    await page.waitForTimeout(200);
    v = await veh(page, 'vr');
    const last = v.timeline[v.timeline.length - 1];
    ok('repetir guarda lo tecleado y el motivo en la línea de tiempo', v.status === 'registered' && last.data.discardedValues && last.data.discardedValues.NOx === 0.071 &&
       last.data.discardedFailing.join() === 'NOx' && /fase 3/.test(last.data.reason), JSON.stringify(last.data));

    // ── Aprobar: doble ciego + comparación + decisión ────────────────
    await sesion(page, 'sara');
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
        window.validatePdfCompleteness = () => ({ missing: [], soft: [] });
        window.sigCaptureOpen = (o) => { const u = authGetCurrentUser(); o.onSave({ signerName: u.name, sessionUserName: u.name, sessionUserId: u.id, dataUrl: 'data:image/png;base64,iVBORw0KGgo=', signedAt: new Date().toISOString() }); };
    });
    await aprobarAbrir(page, 'vf');
    await teclear(page, 'appr-gas-entry-content', GASES);
    const fc = await page.evaluate(() => { const x = document.getElementById('appr-family-check'); return { vis: x.style.display !== 'none', t: x.innerText }; });
    ok('"comparado con su familia" marca el NOx como atípico y dice que no bloquea', fc.vis && /8 ensayos aprobados/.test(fc.t) && /atípico/i.test(fc.t) && /No bloquea/.test(fc.t), fc.t);
    const fb = await page.evaluate(() => { const x = document.getElementById('appr-fail-box'); return { vis: x.style.display !== 'none', t: x.innerText }; });
    ok('tras coincidir aparece la decisión de la falla con la observación del liberador', fb.vis && /decide qué es/.test(fb.t) && /0\.071/.test(fb.t), fb.t);
    b = await btn(page, 'approve-archive-btn');
    ok('el botón de aprobar pide decidir', b.dis && /decide si es una falla válida/.test(b.why), JSON.stringify(b));
    if (SHOTS) await page.locator('#appr-gas-entry-content').locator('xpath=..').screenshot({ path: SHOTS + '/v3250-apr.png' });
    await page.evaluate(() => approveAndArchive());
    ok('sin decidir no se archiva', (await veh(page, 'vf')).status === 'pending-approval');
    await page.evaluate(() => {
        document.getElementById('appr-fail-verdict').value = 'invalida'; aprFailSet();
        document.getElementById('appr-fail-cause').value = 'equipo'; aprFailSet();
        document.getElementById('appr-fail-note').value = 'El span de NOx estaba fuera; se recalibró.'; aprFailSet();
    });
    b = await btn(page, 'approve-archive-btn');
    ok('decidida: se puede aprobar', !b.dis, JSON.stringify(b));
    await page.evaluate(() => approveAndArchive());
    await page.waitForTimeout(400);
    v = await veh(page, 'vf');
    const r1 = await page.evaluate(() => { const x = db.vehicles.find(v => v.id === 'vf'); return { usable: copTestUsable(x), counts: copTestCounts(x),
        aud: _auditEnsureLoaded().filter(a => a.action === 'prueba_falla' || a.action === 'aprobado_con_atipico').map(a => a.action) }; });
    ok('archivada como prueba INVÁLIDA con su causa', v.status === 'archived' && v.testData.failure.verdict === 'invalida' && v.testData.failure.cause === 'equipo' &&
       v.testData.failure.releaser && v.testData.failure.byId === 'sara', JSON.stringify(v.testData.failure));
    ok('una inválida no cuenta para CoP y dice por qué', !r1.usable.usable && !r1.counts && /invalidada al aprobar/.test(r1.usable.text), JSON.stringify(r1.usable));
    ok('el registro congela la comparación con la familia', v.testData.gasResults.aprobador.familyCheck && v.testData.gasResults.aprobador.familyCheck.atypical[0].field === 'NOx', JSON.stringify(v.testData.gasResults.aprobador.familyCheck));
    ok('auditoría: la falla y el atípico', r1.aud.includes('prueba_falla') && r1.aud.includes('aprobado_con_atipico'), JSON.stringify(r1.aud));

    // Falla VÁLIDA
    await aprobarAbrir(page, 'vg');
    await teclear(page, 'appr-gas-entry-content', GASES);
    await page.evaluate(() => {
        document.getElementById('appr-fail-verdict').value = 'valida'; aprFailSet();
        document.getElementById('appr-fail-note').value = 'Revisé VETS y la calibración: la prueba es válida.'; aprFailSet();
        approveAndArchive();
    });
    await page.waitForTimeout(400);
    const r2 = await page.evaluate(() => { const x = db.vehicles.find(v => v.id === 'vg');
        return { st: x.status, f: x.testData.failure && x.testData.failure.verdict, counts: copTestCounts(x),
                 alerta: pnGetActiveAlerts().filter(a => a.kind === 'prueba-falla').length }; });
    ok('una falla VÁLIDA se archiva, cuenta para CoP y queda en alertas', r2.st === 'archived' && r2.f === 'valida' && r2.counts && r2.alerta === 1, JSON.stringify(r2));
    const hist = await page.evaluate(() => { dashGo('cop15', 'dashboard'); return new Promise(r => setTimeout(() => r(document.getElementById('panel-dashboard').innerText), 600)); });
    ok('Historial: "✗ Falla" en la válida y "No cuenta para CoP" en la inválida', /✗ Falla/i.test(hist) && /No cuenta para CoP/i.test(hist), hist.slice(0, 300));

    // ── Master: Operación (formato simple) + carta de la celda ────────
    await sesion(page, 'beto');
    await page.waitForTimeout(1200);
    await page.evaluate(() => { dashGo('cop15', 'seguimiento'); refreshAllLists(); document.getElementById('activeVehSelect').value = 'mnow'; loadVehicle(); });
    await page.waitForTimeout(300);
    const mb = await page.evaluate(() => { const x = document.getElementById('master-gas-block'); return { vis: x.style.display !== 'none', n: x.querySelectorAll('.lib-gas-input').length, t: x.innerText }; });
    ok('Operación de un VIN Master muestra "🎯 Gases del vehículo Master"', mb.vis && mb.n === 5 && /Celda/.test(mb.t), JSON.stringify(mb));
    await teclear(page, 'master-gas-entry', { CO: '0.31', CO2: '146', THC: '0.05', NOx: '0.021', NMHC: '0.03' });
    await page.evaluate(() => saveProgress());
    await page.waitForTimeout(200);
    v = await veh(page, 'mnow');
    ok('se guardan en testData.simple.master (nunca en gasResults)', v.testData.simple.master && v.testData.simple.master.values.CO2 === 146 && !v.testData.gasResults, JSON.stringify(v.testData));
    const noMaster = await page.evaluate(() => { document.getElementById('activeVehSelect').value = 'vr'; loadVehicle(); return document.getElementById('master-gas-block').style.display; });
    ok('un vehículo que no es Master no muestra el bloque', noMaster === 'none');

    await page.evaluate(() => copSpcOpenMaster('mk4'));
    await page.waitForTimeout(800);
    const sp = await page.evaluate(() => { const c = document.getElementById('cop-spc-ichart'); return { t: document.getElementById('platform-cop').innerText, canvas: !!c, w: c ? c.width : 0 }; });
    ok('CoP → Control SPC → 🎯 Celda: la carta del Master con sus 4 pruebas', /Carta de control de la celda/.test(sp.t) && /Master K4/.test(sp.t) && /n = 4/.test(sp.t) && sp.canvas && sp.w > 0, sp.t.slice(0, 300));
    ok('Producto / Celda se puede cambiar', await page.evaluate(() => { copSpcSetSource('familia'); const a = /I-MR por familia/.test(document.getElementById('platform-cop').innerText); copSpcSetSource('master'); return a; }));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/v3250-spc.png' });
    ok('Sin errores de página', errores.length === 0, errores.join(' | '));
    await context.close();

    // ── Teléfono ─────────────────────────────────────────────────────
    console.log('\n== Teléfono 430×900 ==');
    ({ context, page, errores } = await abrir(browser, { width: 430, height: 900 }, { isMobile: true, hasTouch: true }));
    await liberar(page, 'vf');
    await teclear(page, 'lib-gas-entry-content', GASES);
    const ph = await page.evaluate(() => { const x = document.querySelector('#lib-fail-box .fail-box'); const r = x.getBoundingClientRect(); return { l: r.left, r: r.right, sw: document.documentElement.scrollWidth }; });
    ok('la tarjeta de falla cabe en el teléfono', ph.l >= 0 && ph.r <= 430 && ph.sw <= 431, JSON.stringify(ph));
    if (SHOTS) await page.locator('#lib-fail-box').screenshot({ path: SHOTS + '/v3250-phone.png' });
    ok('Sin errores de página', errores.length === 0, errores.join(' | '));
    await context.close();

    await browser.close();
    console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo bien.');
    process.exitCode = fallas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
