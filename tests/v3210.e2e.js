// Verificación en navegador de 3.21.0 — mapa regulatorio.
// (1) Datos → 📚 Normas: una norma por ficha de selección, el mapa del alta al CoP, sus
//     límites y la exportación para un asistente. Sin desbordar a 427 px ni a 1920 px.
// (2) "¿Por qué estos límites?" en Liberación abre la ficha de la norma, y desde ahí el mapa.
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
    const cfg = { 'EMISSION REGULATION': 'EURO-5', REGION: 'EUROPE' };
    localStorage.setItem('kia_db_v11', JSON.stringify({ version: '11.0', lastId: 1, vehicles: [
        { id: 'veh_2', vin: 'KNA000002', status: 'ready-release', purpose: 'COP-Emisiones', configCode: 'C1', config: cfg,
          registeredAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-22T15:00:00.000Z', timeline: [], testData: { odometer: 100 } }
    ] }));
};

async function probar(browser, ancho, alto) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, isMobile: ancho < 800, hasTouch: ancho < 800, acceptDownloads: true });
    await ctx.addInitScript(SEED);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof bootStageNow === 'function' && bootStageNow() === 'lista', null, { timeout: 20000 });
    await page.waitForTimeout(600);

    console.log('\n== ' + ancho + ' px: Datos → 📚 Normas ==');
    await page.evaluate(() => { switchPlatform('panel'); pnSwitchTab('pn-normas'); });
    await page.waitForTimeout(600);
    const a = await page.evaluate(() => ({
        chips: Array.from(document.querySelectorAll('.nm-chip')).map(b => b.textContent),
        nodos: document.querySelectorAll('.nm-node').length,
        titulo: (document.querySelector('.nm-title h3') || {}).textContent || ''
    }));
    chk('una ficha de selección por norma del laboratorio', a.chips.length >= 5 && a.chips.indexOf('PRE-EURO 7') >= 0 && a.chips.indexOf('NOM-042 C-VP') >= 0, JSON.stringify(a.chips));
    chk('el mapa va del alta al CoP (7 pasos)', a.nodos === 7, a.nodos);
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.nm-chip')).find(x => x.textContent === 'PRE-EURO 7'); b.click(); });
    await page.waitForTimeout(400);
    const b = await page.evaluate(() => ({
        titulo: (document.querySelector('.nm-title h3') || {}).textContent || '',
        formula: (document.querySelector('.nm-formula') || {}).textContent || '',
        desborda: document.documentElement.scrollWidth > window.innerWidth + 1
    }));
    chk('PRE-EURO 7 muestra el método de gases de corporativo', /PRE-EURO 7/.test(b.titulo) && /1\.05·L − VAR\/L/.test(b.formula), JSON.stringify(b));
    chk('sin desbordar a lo ancho', !b.desborda);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
        page.evaluate(() => { const x = Array.from(document.querySelectorAll('button')).find(y => /Exportar para tu asistente/.test(y.textContent)); x.click(); })]);
    chk('📤 Exportar para tu asistente descarga el .md', dl && /^reglas-laboratorio-\d{4}-\d{2}-\d{2}\.md$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());

    console.log('\n== ' + ancho + ' px: "¿Por qué?" desde Liberación ==');
    await page.evaluate(() => {
        switchPlatform('cop15');
        document.querySelector('.tab[data-tab="liberacion"]').click();
        const s = document.getElementById('releaseVehSelect');
        if (s && !Array.from(s.options).some(o => o.value === 'veh_2')) { const o = document.createElement('option'); o.value = 'veh_2'; s.appendChild(o); }
        s.value = 'veh_2'; loadRelease();
    });
    await page.waitForTimeout(600);
    const por = await page.evaluate(() => {
        const l = Array.from(document.querySelectorAll('#lib-content .nm-why')).find(x => /Por qué/.test(x.textContent));
        if (!l) return { link: false };
        l.click();
        return { link: true };
    });
    await page.waitForTimeout(700);
    const f = await page.evaluate(() => ({ titulo: (document.getElementById('ficha-title') || {}).textContent || '',
        sub: (document.querySelector('.ficha-sub') || {}).textContent || '',
        mapa: !!Array.from(document.querySelectorAll('.ficha-next')).find(x => /mapa completo/.test(x.textContent)) }));
    chk('Liberación trae "¿Por qué estos límites?"', por.link);
    chk('abre la ficha de la norma con que se juzga', f.titulo === 'EURO-5' && /configuraciones/.test(f.sub) && f.mapa, JSON.stringify(f));
    await page.evaluate(() => { Array.from(document.querySelectorAll('.ficha-next')).find(x => /mapa completo/.test(x.textContent)).click(); });
    await page.waitForTimeout(900);
    const m = await page.evaluate(() => ({ activo: document.querySelector('#platform-panel.active, .platform-section.active') && document.querySelector('.platform-section.active').id,
        titulo: (document.querySelector('.nm-title h3') || {}).textContent || '' }));
    chk('"Ver el mapa completo" lleva a Datos → Normas en esa norma', /panel/.test(m.activo || '') && /^EURO-5/.test(m.titulo), JSON.stringify(m));
    chk('sin errores de página ni diálogos nativos', !errores.length, errores.join(' | '));
    await ctx.close();
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    await probar(browser, 427, 840);
    await probar(browser, 1920, 1017);
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\ntodo bien');
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
