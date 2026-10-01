// Verificación en navegador de 2.29.0 — el ICMS de cada unidad, sin teclear.
// Con el archivo real del laboratorio (tests/fixtures/icms/VIN_432873_….xlsx) y los CDN
// bloqueados, como en la red del trabajo: el Alta lo lee, cruza el VIN del nombre del
// archivo y llena los campos; Datos → Homologación lo carga en lote a un vehículo.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'icms', 'VIN_432873_1790797415928.xlsx');

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

async function recorrido(page, et) {
    console.log('\n== ' + et + ' ==');
    // ── Alta ──
    await page.evaluate(() => {
        switchPlatform('pruebas');
        var t = document.querySelector('.tab[data-tab="alta"]'); if (t) t.click();
        currentFilters = { REGION: 'EUROPE' };
        homoAltaReset(); homoAltaSync();
        document.getElementById('vin').value = '3KPFT51B7TE433258';   // otra unidad
    });
    await page.waitForTimeout(300);
    chk('el Alta Europa muestra "Cargar el ICMS de esta unidad"', await page.isVisible('text=Cargar el ICMS de esta unidad'));
    await page.setInputFiles('#homo_icms_file', FIXTURE);
    await page.waitForSelector('#homo-alta-icms .homo-icms-card', { timeout: 5000 });
    let prev = await page.evaluate(() => document.getElementById('homo-alta-icms').innerText.replace(/\s+/g, ' '));
    chk('la vista previa trae los valores WLTP (102.5 / 1506 / 129), no los NEDC',
        /102\.5/.test(prev) && /1506/.test(prev) && /129/.test(prev) && !/88\.9/.test(prev) && !/1440/.test(prev), prev);
    chk('VIN del archivo distinto al capturado: lo dice y pide "Usar de todos modos"',
        /NO termina así/.test(prev) && /Usar de todos modos/.test(prev), prev);
    chk('todavía no llena nada', await page.evaluate(() => document.getElementById('homo_f0').value === ''));

    await page.fill('#vin', '3KPFT51B7TE432873');
    await page.waitForTimeout(200);
    prev = await page.evaluate(() => document.getElementById('homo-alta-icms').innerText.replace(/\s+/g, ' '));
    chk('al corregir el VIN, la vista previa dice que coincide', /coincide con el VIN capturado/.test(prev) && /Usar estos valores/.test(prev), prev);
    await page.click('#homo-alta-icms >> text=Usar estos valores');
    await page.waitForTimeout(200);
    const campos = await page.evaluate(() => ['homo_mc', 'homo_f0', 'homo_f1', 'homo_f2', 'homo_tm', 'homo_mr', 'homo_co2']
        .map(id => document.getElementById(id).value).join('|'));
    chk('llena WO, f0, f1, f2, TM, MR y CO₂ sin teclear', campos === 'E2608A135C02A|102.5|0.147|0.03331|1506|43.2|129', campos);
    let d = await page.evaluate(() => homoAltaCollect());
    chk('la ficha recuerda archivo, WO, MC code y que el VIN coincide',
        d.source === 'icms' && d.workOrder === 'E2608A135C02A' && d.mcCode === '8GS6K5G17' && d.vinCheck === 'coincide' &&
        /VIN_432873/.test(d.icmsFile) && d.edited.length === 0, JSON.stringify(d));
    const st = await page.evaluate(() => document.getElementById('homo-alta-warn').innerText);
    chk('inercia calculada: 1549.2 kg', /1549\.2/.test(st), st);
    await page.fill('#homo_f0', '103');
    d = await page.evaluate(() => homoAltaCollect());
    chk('si se corrige a mano, queda anotado que difiere del archivo', d.f0 === 103 && d.edited.join() === 'f0', JSON.stringify(d.edited));
    chk('sin desborde horizontal en el Alta', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    // ── Lote ──
    await page.evaluate(() => {
        homoAltaReset();
        db.vehicles = [{ id: nextVehicleId(), vin: '3KPFT51B7TE432873', status: 'registered', config: { REGION: 'EUROPE' },
                         timeline: [], registeredAt: new Date().toISOString(), testData: {} }];
        saveDB();
        dashGo('panel', 'pn-homolog');
    });
    await page.waitForSelector('#homo-batch-file', { state: 'attached', timeout: 5000 });
    await page.setInputFiles('#homo-batch-file', FIXTURE);
    await page.waitForSelector('#globalModal .homo-batch-row', { timeout: 5000 });
    const modal = await page.evaluate(() => document.getElementById('globalModal').innerText.replace(/\s+/g, ' '));
    chk('la revisión del lote liga el archivo al VIN …432873 y propone llenar', /3KPFT51B7TE432873/.test(modal) && /Llenar la ficha/.test(modal), modal.slice(0, 300));
    await page.click('#globalModal button:has-text("Aplicar")');
    await page.waitForTimeout(500);
    const h = await page.evaluate(() => db.vehicles[0].homolog);
    chk('el vehículo queda con su ficha del ICMS', h && h.f0 === 102.5 && h.tm === 1506 && h.mr === 43.2 && h.co2Target === 129 && h.workOrder === 'E2608A135C02A', JSON.stringify(h));
    const msg = await page.evaluate(() => (document.getElementById('homo-import-status') || {}).innerText || '');
    chk('el resumen lo dice', /1 vehículo/.test(msg), msg);
}

let browser;
(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1920, height: 1017, et: 'Escritorio 1920×1017' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
        const page = await ctx.newPage();
        const errores = [], cdn = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        // Sin CDN, como en la red del laboratorio. Ninguna petición a SheetJS debe salir.
        await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/, r => { cdn.push(r.request().url()); r.abort(); });
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(3000);
        await recorrido(page, vp.et);
        chk('no se pidió SheetJS al CDN (' + vp.et + ')', !cdn.some(u => /xlsx/i.test(u)), cdn.filter(u => /xlsx/i.test(u)).join(' '));
        chk('sin errores de página (' + vp.et + ')', !errores.length, errores.join(' | '));
        if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT + '-' + vp.width + '.png' });
        await ctx.close();
    }
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien') + '\n');
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); if (browser) browser.close(); process.exit(1); });
