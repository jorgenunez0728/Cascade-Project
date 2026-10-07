// Verificación en navegador de 2.34.0 — Historial: buscar, ordenar, agrupar, seleccionar y
// exportar. 30 pruebas de 4 familias (CL4 5DR/WGN Europa, SP3 SULEV) en escritorio y teléfono.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const SHOTS = process.env.E2E_SHOTS || '';

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const ops = [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }];
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    if (!localStorage.getItem('kia_panel_v1')) localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: ops, tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1920, height: 1017, et: 'Escritorio 1920×1017' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
        console.log('\n== ' + vp.et + ' ==');
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, acceptDownloads: true });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(2500);

        await page.evaluate(() => {
            const C = (mod, eng, reg, body, region) => ({ 'Modelo': mod, 'ENGINE CAPACITY': eng, 'EMISSION REGULATION': reg, 'BODY TYPE': body,
                'REGION': region, 'TRANSMISSION': 'IVT', 'MODEL YEAR (VIN)': '26 MODEL', 'ENGINE PACKAGE': '0' });
            const fams = [C('CL4', '1000cc KAPPA PE', 'PRE-EURO 7', '5DR', 'EUROPE'), C('CL4', '1600CC GAMMA-II', 'PRE-EURO 7', 'WGN', 'EUROPE'),
                          C('SP3', '2000CC NU', 'SULEV 30', 'SUV', 'USA'), C('CL4', '1600CC GAMMA-II', 'EURO-5', '5DR', 'MIDDLE EAST')];
            db.vehicles = [];
            for (let i = 0; i < 30; i++) {
                const c = fams[i % 4];
                const st = i === 3 ? 'pending-approval' : i === 7 ? 'testing' : 'archived';
                const d = new Date(2026, 6 + (i % 3), 1 + i); // jul–sep
                db.vehicles.push({ id: 5000 + i, vin: '3KPFX' + String(100000000000 + i * 7919).slice(-12), status: st, purpose: 'COP-Emisiones',
                    configCode: c['Modelo'] + '-' + c['ENGINE CAPACITY'] + '-' + c['EMISSION REGULATION'] + '-' + c['REGION'] + '-' + c['BODY TYPE'],
                    config: Object.assign({}, c), registeredAt: d.toISOString(), timeline: [],
                    testData: st === 'testing' ? {} : { gasResults: { liberador: { values: { CO: 0.3, NOx: 0.02 } },
                        aprobador: st === 'archived' ? { values: { CO: 0.3, NOx: 0.02 } } : undefined } } });
            }
            saveDB();
            dashGo('cop15', 'dashboard');
        });
        await page.waitForTimeout(700);

        let s = await page.evaluate(() => ({
            rows: document.querySelectorAll('#historyList tr.hist-row').length,
            summary: (document.querySelector('.hist-summary') || {}).textContent || '',
            chips: [...document.querySelectorAll('.hist-chip')].map(b => b.textContent.replace(/\s+/g, ' ').trim()),
            first: (document.querySelector('#historyList tr.hist-row .hist-vin') || {}).textContent
        }));
        chk('página de 25 de 30', s.rows === 25 && /25 de 30/.test(s.summary), JSON.stringify(s));
        chk('fichas de estado con conteo', s.chips.some(c => c === 'Todos 30') && s.chips.some(c => c === 'En curso 2') && s.chips.some(c => /^Archivado 28$/.test(c)), s.chips.join(' | '));

        // ── Búsqueda: teclear no pierde el foco y filtra ─────────────────
        await page.click('#hist-filter-vin');
        await page.keyboard.type('sulev');
        await page.waitForTimeout(400);
        s = await page.evaluate(() => ({
            rows: document.querySelectorAll('#historyList tr.hist-row').length,
            focus: document.activeElement && document.activeElement.id,
            active: (document.querySelector('#hist-active') || {}).textContent || ''
        }));
        chk('buscar "sulev" deja las 7 SP3', s.rows === 7, JSON.stringify(s));
        chk('el campo conserva el foco al teclear', s.focus === 'hist-filter-vin');
        chk('el filtro activo se ve con su ✕', /sulev/.test(s.active));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        chk('Escape limpia la búsqueda', await page.evaluate(() => document.querySelectorAll('#historyList tr.hist-row').length) === 25);

        // ── Orden por columna (escritorio) / selector (teléfono) ─────────
        if (!vp.mobile) {
            await page.click('th .hist-th-sort:has-text("VIN")');
            await page.waitForTimeout(200);
            let vins = await page.$$eval('#historyList .hist-vin', els => els.map(e => e.textContent));
            chk('tocar VIN ordena ascendente', vins.every((v, i) => !i || vins[i - 1] <= v), vins.slice(0, 3).join());
            await page.click('th .hist-th-sort:has-text("VIN")');
            await page.waitForTimeout(200);
            vins = await page.$$eval('#historyList .hist-vin', els => els.map(e => e.textContent));
            chk('otro toque invierte', vins.every((v, i) => !i || vins[i - 1] >= v));
            chk('aria-sort refleja el orden', await page.$eval('th[aria-sort="descending"]', th => th.textContent.includes('VIN')));
        } else {
            await page.selectOption('#hist-sort', 'vin');
            await page.waitForTimeout(200);
            const vins = await page.$$eval('#historyList .hist-vin', els => els.map(e => e.textContent));
            chk('"Ordenar por" VIN funciona en tarjetas', vins.every((v, i) => !i || vins[i - 1] <= v));
        }

        // ── Agrupar por familia ─────────────────────────────────────────
        await page.selectOption('#hist-group', 'familia');
        await page.waitForTimeout(300);
        s = await page.evaluate(() => ({
            groups: [...document.querySelectorAll('tr.hist-group .hist-group-label')].map(e => e.textContent),
            rows: document.querySelectorAll('#historyList tr.hist-row').length,
            ficha: document.querySelectorAll('tr.hist-group .hist-gficha').length,
            pref: uiPref('hist').group
        }));
        chk('4 familias como grupos', s.groups.length === 4, s.groups.join(' | '));
        chk('cada familia trae su 👪 Ficha', s.ficha === 4);
        chk('el agrupado se recuerda en este equipo', s.pref === 'familia');
        chk('cada grupo muestra hasta 10 y ofrece "ver más"', s.rows <= 40 && await page.$$eval('tr.hist-gmore', e => e.length) === 0);

        // Plegar un grupo
        await page.click('tr.hist-group >> nth=0 >> .hist-group-toggle');
        await page.waitForTimeout(200);
        s = await page.evaluate(() => ({
            collapsed: document.querySelectorAll('tr.hist-group.is-collapsed').length,
            rows: document.querySelectorAll('#historyList tr.hist-row').length
        }));
        chk('plegar un grupo esconde sus filas', s.collapsed === 1 && s.rows < 30, JSON.stringify(s));

        // Seleccionar un grupo plegado entero
        await page.click('tr.hist-group.is-collapsed .hist-gchk');
        await page.waitForTimeout(250);
        s = await page.evaluate(() => ({ sel: histSelectedIds().length, txt: (document.getElementById('hist-sel-count') || {}).textContent || '',
                                         pdf: getComputedStyle(document.getElementById('batchPdfBtn')).display }));
        chk('la casilla del grupo selecciona sus pruebas aunque esté plegado', s.sel >= 7 && /seleccionad/.test(s.txt) && s.pdf !== 'none', JSON.stringify(s));
        // La selección sobrevive a teclear
        await page.fill('#hist-filter-vin', 'CL4');
        await page.waitForTimeout(400);
        const selAfter = await page.evaluate(() => histSelectedIds().length);
        chk('la selección sobrevive a la búsqueda (el grupo sigue a la vista)', selAfter === s.sel, 'antes ' + s.sel + ' después ' + selAfter);
        await page.fill('#hist-filter-vin', '');
        await page.waitForTimeout(400);

        // ── Excel ──────────────────────────────────────────────────────
        await page.evaluate(() => histSelClear());
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
                                        page.click('button:has-text("⬇ Excel")')]);
        let xlsx = null;
        if (dl) { const p = await dl.path(); xlsx = fs.readFileSync(p); }
        chk('⬇ Excel descarga un .xlsx', !!xlsx && xlsx[0] === 0x50 && xlsx[1] === 0x4b && /Historial_.*\.xlsx/.test(dl.suggestedFilename()), dl ? dl.suggestedFilename() : 'sin descarga');

        // ── Sin desbordes ───────────────────────────────────────────────
        const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        chk('sin desplazamiento horizontal de la página', ov <= 1, 'sobra ' + ov + 'px');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hist-' + vp.width + '.png'), fullPage: false });
        await page.evaluate(() => { histSetGroup(''); });
        chk('sin errores ni diálogos nativos', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\nTodo bien');
    process.exitCode = fallos.length ? 1 : 0;
})();
