// Verificación en navegador de 3.1.0 — vehículos de México: aunque la regulación diga EURO-5,
// se capturan solo CO, THC, NOx y NMHC y en g/mi (con opción a g/km), en Liberación,
// Aprobación y Completar. Europa sigue igual.
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
    const cfg = (rgn) => ({ Modelo: 'BL7m', 'EMISSION REGULATION': 'EURO-5', REGION: rgn, 'BODY TYPE': '4DR' });
    const veh = (id, vin, rgn, status, gr) => ({ id, vin, status, purpose: 'COP-Emisiones', configCode: 'X', registeredAt: '2026-10-01T10:00:00Z',
        config: cfg(rgn), timeline: [], testData: { signatures: gr ? { releaser: firma } : {}, gasResults: gr || {} } });
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'beto', operatorName: 'Beto Signatario', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [
        { id: 'ana', name: 'Ana Signataria', role: 'Signatario', active: true },
        { id: 'beto', name: 'Beto Signatario', role: 'Assistant Manager / Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    // El EURO-5 del laboratorio teclea en mg/km (así lo usa Europa).
    localStorage.setItem('kia_regulations_v1', JSON.stringify({ migr: { sulev30: 1 }, profiles: [
        { id: 'reg_euro5', name: 'EURO-5', shortName: 'EURO-5', gases: [
            { field: 'CO', label: 'CO', unit: 'g/km', limit: 1.0, captureUnit: 'mg/km' },
            { field: 'CO2', label: 'CO₂', unit: 'g/km', limit: null },
            { field: 'THC', label: 'THC', unit: 'g/km', limit: 0.1, captureUnit: 'mg/km' },
            { field: 'NOx', label: 'NOx', unit: 'g/km', limit: 0.06, captureUnit: 'mg/km' },
            { field: 'NMHC', label: 'NMHC', unit: 'g/km', limit: 0.068, captureUnit: 'mg/km' }] }] }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 4, vehicles: [
        veh('mxR', 'KNAMXR00000000001', 'MEXICO', 'ready-release'),
        // Liberado ANTES de 3.1.0: perfil congelado europeo (mg/km, con CO₂).
        veh('mxP', 'KNAMXP00000000002', 'MEXICO', 'pending-approval', { liberador: {
            values: { CO: 0.31, THC: 0.03, NOx: 0.02, NMHC: 0.025 }, capturedBy: 'Ana Signataria', capturedAt: new Date().toISOString(), passedLimits: true,
            profile: { name: 'EURO-5', gases: [
                { field: 'CO', label: 'CO', unit: 'g/km', limit: 1.0, captureUnit: 'mg/km' },
                { field: 'CO2', label: 'CO₂', unit: 'g/km', limit: null },
                { field: 'THC', label: 'THC', unit: 'g/km', limit: 0.1, captureUnit: 'mg/km' },
                { field: 'NOx', label: 'NOx', unit: 'g/km', limit: 0.06, captureUnit: 'mg/km' },
                { field: 'NMHC', label: 'NMHC', unit: 'g/km', limit: 0.068, captureUnit: 'mg/km' }] } } }),
        veh('euR', 'KNAEUR00000000003', 'EUROPE', 'ready-release'),
        veh('mxA', 'KNAMXA00000000004', 'MEXICO', 'archived')
    ] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Mexico_City' })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
    await page.waitForTimeout(2500);

    await page.evaluate(() => { dashGo('cop15', 'liberacion'); });
    await page.waitForTimeout(600);
    const abrirLib = (id) => page.evaluate((id) => {
        if (typeof libSwitchSubtab === 'function') libSwitchSubtab('liberador');
        const s = document.getElementById('releaseVehSelect');
        if (![...s.options].some(o => o.value === id)) { const o = document.createElement('option'); o.value = id; s.appendChild(o); }
        s.value = id; loadRelease();
        const box = document.getElementById('lib-gas-entry-content');
        const cell = (k, f) => (box.querySelector('[data-' + k + 'cell="' + f + '"]') || {}).innerText || '';
        return { campos: [...box.querySelectorAll('.lib-gas-input')].map(i => i.dataset.field).join(','),
                 uCO: cell('u', 'CO'), lCO: cell('l', 'CO'), sel: (document.getElementById('lib-gas-entry-content-unit') || {}).value || null };
    }, id);

    console.log('\n== Liberación de un vehículo de México ==');
    const l = await abrirLib('mxR');
    chk('pide solo CO, THC, NOx y NMHC', l.campos === 'CO,THC,NOx,NMHC', l.campos);
    chk('en g/mi por omisión, con el límite convertido (1 g/km = 1.609344 g/mi)', /^g\/mi/.test(l.uCO) && l.lCO.trim() === '1.609344' && l.sel === 'g/mi', JSON.stringify(l));
    for (const [f, v] of [['CO', '0.5'], ['THC', '0.05'], ['NOx', '0.05'], ['NMHC', '0.05']])
        await page.fill('#lib-gas-entry-content .lib-gas-input[data-field="' + f + '"]', v);
    let st = await page.evaluate(() => document.getElementById('lib-gas-status-CO').innerText);
    chk('0.5 g/mi de CO pasa (31% del límite)', /PASA/.test(st) && /31/.test(st), st);

    // Tocar la ficha g/km (el toque real, no el <select>)
    await page.locator('#lib-gas-entry-content .lib-unit-pick button', { hasText: /^g\/km$/ }).click();
    const k = await page.evaluate(() => ({ u: document.querySelector('#lib-gas-entry-content [data-ucell="CO"]').innerText,
        l: document.querySelector('#lib-gas-entry-content [data-lcell="CO"]').innerText, s: document.getElementById('lib-gas-status-CO').innerText,
        v: document.querySelector('#lib-gas-entry-content .lib-gas-input[data-field="CO"]').value }));
    chk('al cambiar a g/km, la unidad y el límite cambian y el número se relee (0.5 g/km = 50%)',
        /^g\/km/.test(k.u) && k.l.trim() === '1' && /50/.test(k.s) && k.v === '0.5', JSON.stringify(k));
    await page.locator('#lib-gas-entry-content .lib-unit-pick button', { hasText: /^g\/mi$/ }).click();

    const env = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'mxR');
        const prof = _libCaptureProfileFor(v);
        const vals = _libCollectGasValues(prof, 'lib-gas-entry-content');
        const snap = _libGasProfileSnapshot(_libProfileWithCapUnits(prof, 'lib-gas-entry-content'), 'EURO-5');
        return { co: vals.CO, snap };
    });
    chk('se guarda en g/km (0.5 g/mi = 0.3107 g/km)', Math.abs(env.co - 0.5 / 1.609344) < 1e-9, String(env.co));
    chk('la foto congelada dice México, 4 gases, g/mi',
        env.snap.regionCapture === 'MEXICO' && env.snap.gases.length === 4 && env.snap.gases.every(g => g.captureUnit === 'g/mi'), JSON.stringify(env.snap.gases.map(g => g.field + ':' + g.captureUnit)));

    console.log('\n== Aprobación de una de México liberada antes de 3.1.0 ==');
    const a = await page.evaluate(() => {
        const s = document.getElementById('approvalVehSelect');
        if (![...s.options].some(o => o.value === 'mxP')) { const o = document.createElement('option'); o.value = 'mxP'; s.appendChild(o); }
        libSwitchSubtab('aprobador'); s.value = 'mxP'; loadApproval();
        const box = document.getElementById('appr-gas-entry-content');
        return { campos: [...box.querySelectorAll('.lib-gas-input')].map(i => i.dataset.field).join(','),
                 u: (box.querySelector('[data-ucell="CO"]') || {}).innerText || '', sel: (document.getElementById('appr-gas-entry-content-unit') || {}).value || null };
    });
    chk('el aprobador ve los mismos 4 gases, en g/mi', a.campos === 'CO,THC,NOx,NMHC' && /^g\/mi/.test(a.u) && a.sel === 'g/mi', JSON.stringify(a));
    const ap = await page.evaluate(() => {
        const g = (x) => (x * 1.609344).toPrecision(3);
        const put = (f, v) => { document.querySelector('#appr-gas-entry-content .lib-gas-input[data-field="' + f + '"]').value = v; };
        put('CO', g(0.31)); put('THC', g(0.03)); put('NOx', g(0.02)); put('NMHC', g(0.025));
        libOnApproverGasChange();
        return document.getElementById('approve-archive-btn').disabled;
    });
    chk('tecleando el reporte en g/mi, el doble ciego coincide', ap === false, 'disabled=' + ap);

    console.log('\n== Europa no cambia ==');
    const e = await abrirLib('euR');
    chk('Europa sigue con sus 5 gases en mg/km y sin selector', e.campos === 'CO,CO2,THC,NOx,NMHC' && /^mg\/km/.test(e.uCO) && e.sel === null, JSON.stringify(e));

    console.log('\n== Completar una prueba anterior de México ==');
    const c = await page.evaluate(() => {
        histOpenCompleteModal('mxA');
        const s = document.getElementById('hist-gas-unit');
        return { sel: s && s.value, opts: s ? [...s.options].map(o => o.value).join(',') : '',
                 gases: [...document.querySelectorAll('[id^="hist-gas-"][data-gfield]')].map(i => i.dataset.gfield).join(','),
                 lbl: (document.getElementById('hist-gas-unitlbl-CO') || {}).innerText || '' };
    });
    chk('pide los 4 gases en g/mi, con g/km como opción', c.gases === 'CO,THC,NOx,NMHC' && c.sel === 'g/mi' && c.opts === 'g/mi,g/km' && /límite 1\.609344/.test(c.lbl), JSON.stringify(c));

    chk('sin errores de página ni diálogos nativos', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' fallas' : '\ntodo bien');
    if (fallos.length) process.exitCode = 1;
})();
