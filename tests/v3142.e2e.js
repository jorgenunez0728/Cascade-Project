// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.14.2 — Los gases son los del reporte semanal                       ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Editar un cilindro cuyo tipo no está en el catálogo (nitrógeno) ya no lo deja en blanco; el CO₂
// se ofrece en %v; y un equipo con el catálogo viejo y un cilindro repetido se repara al cargar.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.addInitScript(() => {
        if (sessionStorage.getItem('__seeded')) return;
        sessionStorage.setItem('__seeded', '1');
        localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'm', operatorName: 'Mara Lab', expiresAt: '2099-01-01T00:00:00.000Z' }));
        localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'm', name: 'Mara Lab', role: 'Manager', active: true }], tasks: [], projects: [], alerts: [] }));
        localStorage.setItem('kia_fb_sync_modules', '{}');
        localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
        localStorage.setItem('kia_tour_done', '1');
        ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    });
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof invShowAddGas === 'function' && typeof invState !== 'undefined' && (invState.gases || []).length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => switchPlatform('inventory'));
    await page.waitForTimeout(300);

    // Editar el nitrógeno 5.5 (su tipo "Nitrogeno 5.5" no está en el catálogo) y guardar sin tocar nada.
    await page.evaluate(() => { const g = invState.gases.find(x => x.id === 'g_n255'); g.importAlias = 'NITRÓGENO 5.5 (99.9995 %)'; invShowAddGas('g_n255'); });
    await page.waitForTimeout(200);
    const f = await page.evaluate(() => ({ type: document.getElementById('inv-g-type').value, conc: document.getElementById('inv-g-conc').value }));
    ok('el formulario muestra su tipo y su concentración', f.type === 'Nitrogeno 5.5' && f.conc === '99.9995%', JSON.stringify(f));
    await page.evaluate(() => invSaveGas('g_n255'));
    await page.waitForTimeout(300);
    const n = await page.evaluate(() => { const g = invState.gases.find(x => x.id === 'g_n255'); return { t: g.gasType, f: g.formula, c: g.concNominal, cat: g.gasCategory, a: g.importAlias, r: (g.readings || []).length }; });
    ok('guardar conserva tipo, fórmula y concentración', n.t === 'Nitrogeno 5.5' && n.f === 'N2' && n.c === '99.9995%', JSON.stringify(n));
    ok('y lo que el formulario no muestra (categoría, alias del reporte, lecturas)', n.cat === 'Trabajo' && n.a === 'NITRÓGENO 5.5 (99.9995 %)' && n.r > 0, JSON.stringify(n));

    // El CO₂ se ofrece en %v.
    await page.evaluate(() => invShowAddGas('g_co21p'));
    await page.waitForTimeout(200);
    const co2 = await page.evaluate(() => ({ opts: Array.from(document.getElementById('inv-g-conc').options).map(o => o.value).filter(Boolean), v: document.getElementById('inv-g-conc').value }));
    ok('CO₂: 0.5 / 1 / 2 %v, y el cilindro en 1 %v', co2.opts.join() === '0.5 %v,1 %v,2 %v' && co2.v === '1 %v', JSON.stringify(co2));
    await page.evaluate(() => { document.getElementById('invModal').style.display = 'none'; });

    // Un equipo con el catálogo viejo y el Metano 20 repetido (No. de control editado en otro equipo).
    const rep = await page.evaluate(() => {
        invState.gasTypes = [{ name: 'Bioxido de Carbono/Nitrogeno', formula: 'CO2/N2', concs: ['0.5 ppm', '1 ppm', '3 ppm', '15 ppm'] }];
        const g = invState.gases.find(x => x.id === 'g_ch420');
        invState.gases.push(Object.assign(JSON.parse(JSON.stringify(g)), { controlNo: '20260305-01', timeline: [{ date: '2026-03-05T14:41:18Z', action: 'Modificado' }] }));
        invPreloadData();
        const c = invState.gases.filter(x => x.id === 'g_ch420');
        return { n: c.length, ctl: c[0] && c[0].controlNo, co2: (invState.gasTypes.find(t => t.formula === 'CO2/N2') || {}).concs, types: invState.gasTypes.length,
                 saved: JSON.parse(localStorage.getItem('kia_lab_inventory')).gases.filter(x => x.id === 'g_ch420').length };
    });
    ok('el repetido se une (se queda la última edición) y queda guardado', rep.n === 1 && rep.ctl === '20260305-01' && rep.saved === 1, JSON.stringify(rep));
    ok('el catálogo viejo se corrige y se completa', String(rep.co2) === '0.5 %v,1 %v,2 %v' && rep.types === 11, JSON.stringify(rep));

    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log(fallas ? '\n' + fallas + ' fallas' : '\ntodo bien');
    process.exitCode = fallas ? 1 : 0;
})();
