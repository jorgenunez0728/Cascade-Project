// Verificación en navegador de 2.0.0:
//  1) El Plan ve las mismas configuraciones que el Alta (catálogo unificado).
//  2) Las configs manuales viven en db.manualConfigs y borrar deja marca.
//  3) HOY ejecutivo: Pulso + tiles + Lo siguiente, sin desbordes, a un toque.
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
    const hoy = new Date(), dow = hoy.getDay();
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((dow + 6) % 7));
    const iso = d => d.toISOString().slice(0, 10);
    const wd = iso(lunes);
    const dias = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
    const cfgs = [1, 2, 3, 4].map(i => ({ desc: 'SOLO-PRODUCCION-' + i, id: 'c' + i, mod: 'CL4', rgn: 'EUROPE',
        reg: 'EURO-6E', eng: '1.0', tx: '6MT', my: '2026', drv: '2WD', body: '5DR', ep: '', engpkg: '',
        tire: 'R16', total: 9000, hist: 0, m: [] }));
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'op-test', operatorName: 'Jorge Nunez',
        expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'op-test', name: 'Jorge Nunez', role: 'Técnico', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_current_operator', 'Jorge Nunez');
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_testplan_v1', JSON.stringify({
        planData: cfgs, weekHistory: [], planHistory: [], rulePresets: [], testedList: [],
        capacity: 4, vehiclesPerSlot: 1, weekAvailability: {}, months: ['Feb-26'],
        _migr: { capacity: 1, itemUids: 1 },
        weeklyPlans: [{ id: 1, planId: 'W' + wd + '-1', weekDate: wd, created: new Date().toISOString(),
            accepted: true, acceptedDate: new Date().toISOString(),
            workDays: { dom: true, lun: true, mar: true, mie: true, jue: true, vie: true, sab: true },
            capacity: 4, items: cfgs.map((c, i) => ({ uid: 'I' + i, desc: c.desc, completed: i === 0,
                preconDay: dias[(dow + 6) % 7], testDay: dias[dow], soakHours: 24, soakSource: 'laboratorio' })) }]
    }));
    const veh = (n, st, arch) => ({ id: 'v' + n, vin: 'KNAZZZ0000421' + (290 + n), status: st,
        configCode: cfgs[0].desc, purpose: 'COP-Emisiones', registeredBy: 'Jorge Nunez',
        archivedAt: arch || undefined, timeline: [], config: { Modelo: 'CL4' }, testData: {} });
    localStorage.setItem('kia_db_v11', JSON.stringify({ vehicles: [
        veh(1, 'in-progress'), veh(2, 'testing'), veh(3, 'archived', new Date().toISOString()),
        veh(4, 'archived', new Date(Date.now() - 86400e3).toISOString())], lastId: 4 }));
    // Legado: una config manual que solo existía en el localStorage de este equipo.
    localStorage.setItem('kia_manual_configs', JSON.stringify([{ codigo_config_text: 'MANUAL-LEGADO', Modelo: 'EV9',
        'MODEL YEAR (VIN)': '2027', TRANSMISSION: 'AT', 'ENVIRONMENT PACKAGE': '', 'EMISSION REGULATION': 'EV',
        'DRIVE TYPE': 'AWD', 'ENGINE CAPACITY': '160KW', 'TIRE ASSY': 'R21', REGION: 'EUROPE', 'BODY TYPE': 'SUV',
        'ENGINE PACKAGE': '', _source: 'manual' }]));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m =>
        localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });

    // ── 1 y 2: catálogo y configs manuales ──
    {
        const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, 'index.html'));
        await page.waitForTimeout(2500);
        const r = await page.evaluate(() => {
            const alta = allConfigurations.length;
            const cat = tpConfigCatalog();
            return {
                alta, cat: cat.length,
                prod: tpState.planData.length,
                altaEnPlan: allConfigurations.every(c => !!tpConfigByDesc(c.codigo_config_text)),
                soloCat: tpCatalogOnlyCount(),
                legado: !!(db.manualConfigs || []).find(c => c.codigo_config_text === 'MANUAL-LEGADO'),
                legadoEnAlta: allConfigurations.some(c => c.codigo_config_text === 'MANUAL-LEGADO'),
                legadoEnPlan: !!tpConfigByDesc('MANUAL-LEGADO')
            };
        });
        chk('toda config del Alta existe en el catálogo del Plan', r.altaEnPlan, JSON.stringify(r));
        chk('catálogo = Alta + lo que solo trae producción', r.cat === r.alta + r.prod, JSON.stringify(r));
        chk('la config manual heredada migró a db.manualConfigs', r.legado);
        chk('…y aparece en el Alta y en el Plan', r.legadoEnAlta && r.legadoEnPlan);

        // El selector de "Agregar prueba" ofrece las del catálogo, agrupadas y marcadas.
        const sel = await page.evaluate(() => {
            tpWeekAddMenu(tpState.weeklyPlans[0].planId, null);
            const s = document.getElementById('tp-week-add-select');
            const grupos = s ? Array.from(s.querySelectorAll('optgroup')).map(g => g.label) : [];
            const n = s ? s.querySelectorAll('option').length : 0;
            const m = document.getElementById('globalModal'); if (m) m.remove();
            return { n, marcados: grupos.filter(g => g.indexOf('📦') === 0).length, ultimo: grupos[grupos.length - 1] || '' };
        });
        chk('el selector del Plan ofrece TODO el catálogo', sel.n === r.cat, sel.n + ' vs ' + r.cat);
        chk('las que no tienen volumen van agrupadas y marcadas al final', sel.marcados > 0 && sel.ultimo.indexOf('📦') === 0, JSON.stringify(sel));

        const add = await page.evaluate(() => tpAddItemToWeekDay(tpState.weeklyPlans[0].planId, 'MANUAL-LEGADO', null, {}));
        chk('una config manual se puede agregar a la semana', add.ok && add.catalogOnly, JSON.stringify(add));

        // Borrar una manual deja marca (el sync es aditivo; sin marca, resucita).
        const del = await page.evaluate(() => {
            _saveManualConfigs(getManualConfigs().filter(c => c.codigo_config_text !== 'MANUAL-LEGADO'));
            _mergeManualConfigsIntoAll();
            const m = (db.manualConfigs || []).find(c => c.codigo_config_text === 'MANUAL-LEGADO');
            manualConfigsAfterLoad();   // la migración NO la resucita desde el legado
            return { marca: !!(m && m.deleted), viva: getManualConfigs().length,
                     enAlta: allConfigurations.some(c => c.codigo_config_text === 'MANUAL-LEGADO') };
        });
        chk('borrar una manual deja marca y no resucita desde el legado', del.marca && del.viva === 0 && !del.enAlta, JSON.stringify(del));
        chk('sin errores de página (catálogo)', errores.length === 0, errores.slice(0, 2).join(' | '));
        await ctx.close();
    }

    // ── 3: HOY ejecutivo ──
    for (const [w, h] of [[753, 1132], [427, 840], [1366, 900]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h } });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, 'index.html'));
        await page.waitForTimeout(2500);
        await page.evaluate(() => { if (typeof switchPlatform === 'function') switchPlatform('today'); });
        await page.waitForTimeout(900);
        const m = await page.evaluate(() => {
            const root = document.getElementById('platform-today');
            const pulse = root.querySelector('.dash-pulse');
            const tiles = root.querySelectorAll('.dash-cat-tile');
            const next = root.querySelectorAll('.dash-next .dash-row');
            const doc = document.documentElement;
            const pr = pulse ? pulse.getBoundingClientRect() : null;
            const t0 = tiles[0] ? tiles[0].getBoundingClientRect() : null;
            return {
                pulseTiles: pulse ? pulse.querySelectorAll('.dash-pulse-tile').length : 0,
                pulseTop: pr ? pr.top + window.scrollY : 1e9,
                tilesTop: t0 ? t0.top + window.scrollY : 1e9,
                tiles: tiles.length, next: next.length,
                hscroll: doc.scrollWidth > doc.clientWidth + 1,
                viejo: !!root.querySelector('.pn-lab-kpi-grid, .v7-mi-turno-card, .daily-dash-quick-actions'),
                liberadosHoy: (root.querySelector('.dash-pulse-tile:nth-child(3) .pn-kpi-num') || {}).dataset
            };
        });
        const tag = '@' + w + 'px';
        chk(tag + ': el Pulso tiene 5 indicadores', m.pulseTiles === 5, 'n=' + m.pulseTiles);
        chk(tag + ': ya no están los 6 KPIs, Mi turno ni Acceso rápido', !m.viejo);
        chk(tag + ': el Pulso se ve sin bajar', m.pulseTop < h, 'top=' + m.pulseTop);
        chk(tag + ': las categorías se ven sin bajar (tablet y escritorio)', w < 700 || m.tilesTop < h, 'top=' + Math.round(m.tilesTop));
        chk(tag + ': "Lo siguiente" muestra a lo más 5', m.next > 0 && m.next <= 5, 'n=' + m.next);
        chk(tag + ': sin desplazamiento horizontal', !m.hscroll);
        chk(tag + ': liberados hoy = 1', m.liberadosHoy && m.liberadosHoy.kpiTarget === '1', JSON.stringify(m.liberadosHoy));

        // Tocar un tile muestra su lista EN LUGAR de "lo siguiente"; tocarlo otra vez vuelve.
        await page.click('#platform-today .dash-cat-tile');
        await page.waitForTimeout(300);
        const abierto = await page.evaluate(() => ({
            detalle: !!document.querySelector('#platform-today .dash-cat-detail'),
            next: !!document.querySelector('#platform-today .dash-next'),
            on: !!document.querySelector('#platform-today .dash-cat-tile--on')
        }));
        chk(tag + ': tocar una categoría abre su lista en lugar de "lo siguiente"', abierto.detalle && !abierto.next && abierto.on, JSON.stringify(abierto));
        await page.click('#platform-today .dash-cat-tile--on');
        await page.waitForTimeout(300);
        const cerrado = await page.evaluate(() => !!document.querySelector('#platform-today .dash-next'));
        chk(tag + ': tocarla otra vez regresa a "lo siguiente"', cerrado);
        chk(tag + ': sin errores de página', errores.length === 0, errores.slice(0, 2).join(' | '));
        if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'catalogo-hoy-' + w + '.png') });
        await ctx.close();
    }

    await browser.close();
    console.log('');
    if (fallos.length) { console.log(fallos.length + ' fallo(s)'); process.exitCode = 1; }
    else { console.log('todo paso'); process.exitCode = 0; }
})();
