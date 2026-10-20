// Verificación en navegador de 3.16.0:
//  - Captura en bloque: hay turno (mañana/tarde) y dos capturas del mismo día quedan las dos.
//  - Consumibles → Reporte: la Lista de consumibles con su tendencia, importar el histórico
//    (archivo sintético con el acomodo del laboratorio) y descargar el Excel.
//  - CoP: el botón 📥 COP Master abre el importador.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
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
        operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);

    console.log('\n== Captura en bloque con turno ==');
    await page.evaluate(() => {
        invState.gases = [{ id: 'gx', formula: 'CH4/Air', gasType: 'Metano', concNominal: '20 ppm', controlNo: 'A1', zone: 'A01', status: 'In use',
                            readings: [{ date: localToday(), psi: 1200, shift: 'am' }] }];
        invSave();
        dashGo('inventory', 'inv-readings');
    });
    await page.waitForTimeout(700);
    const hasShift = await page.evaluate(() => !!document.getElementById('inv-capture-shift'));
    chk('la captura tiene selector de turno', hasShift);
    await page.evaluate(() => {
        document.getElementById('inv-capture-shift').value = 'pm';
        document.getElementById('inv-rd-gx').value = '1150';
        invSaveDailyCapture();
    });
    await page.waitForTimeout(300);
    const rs = await page.evaluate(() => invState.gases[0].readings.map(r => (r.shift || 'am') + ':' + r.psi).join(','));
    chk('mañana y tarde del mismo día quedan las dos', rs === 'am:1200,pm:1150', rs);

    console.log('\n== Lista de consumibles ==');
    await page.evaluate(() => dashGo('inventory', 'inv-report'));
    await page.waitForTimeout(700);
    const card = await page.evaluate(() => /Lista de consumibles/.test(document.body.innerText) && !!document.querySelector('button[onclick="invConsListExport()"]'));
    chk('Reporte trae la tarjeta "Lista de consumibles" con su botón Excel', card);
    // Importar un histórico sintético (mismo acomodo que el archivo del laboratorio)
    const res = await page.evaluate(() => {
        const G = [];
        const put = (r, c, v) => { (G[r] = G[r] || [])[c] = v; };
        put(5, 1, 'Consumible'); put(5, 0, 'Tipo de consumible'); put(5, 10, '2026 INVENTORY'); put(5, 14, '2026 CONSUMO');
        put(6, 10, 'ENERO'); for (let k = 0; k < 4; k++) put(7, 10 + k, 'Semana ' + (k + 1));
        put(8, 0, 'GASES DE REFERENCIA'); put(8, 1, 'METANO 20 PPM BALANCE AIRE'); [1300, 1250, 1250, 1200].forEach((v, i) => put(8, 10 + i, v));
        const p = invConsListParse(G);
        const r = invConsHistoryApply(p, { fileName: 'prueba.xlsx' });
        return { r, n: (invState.consHistory || []).length };
    });
    chk('el histórico se guarda (1 consumible, 4 semanas)', res.r && res.n === 1 && res.r.semanas === 4, JSON.stringify(res));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.evaluate(() => invConsListExport())]);
    chk('📤 Excel descarga la Lista de consumibles', /^Lista_de_Consumibles_\d{4}_/.test(dl.suggestedFilename()), dl.suggestedFilename());
    const f = path.join(os.tmpdir(), 'v3160-cons.xlsx');
    await dl.saveAs(f);
    chk('el archivo no está vacío', fs.statSync(f).size > 2000);

    console.log('\n== CoP → COP Master ==');
    await page.evaluate(() => { dashGo('cop'); });
    await page.waitForTimeout(400);
    await page.evaluate(() => copSetView('dossier'));
    await page.waitForTimeout(500);
    const btn = await page.evaluate(() => !!document.querySelector('button[onclick="copMasterImportOpen()"]'));
    chk('Expediente ofrece 📥 COP Master', btn);
    await page.evaluate(() => copMasterImportOpen());
    await page.waitForTimeout(300);
    const modal = await page.evaluate(() => /Importar COP Master/.test(document.body.innerText) && !!document.querySelector('#cm-preview'));
    chk('el importador se abre', modal);

    chk('sin errores de página', !errores.length, errores.join(' | '));
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLAS' : '\nTodo bien');
    if (fallos.length) process.exitCode = 1;
})();
