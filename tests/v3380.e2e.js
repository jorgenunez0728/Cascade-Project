// Verificación en navegador de 3.38.0 — Movimiento fluido.
// (1) La pastilla queda bajo la opción activa al cambiar de plataforma, grupo, sección y
//     entre Liberador / Aprobador, y se desliza (no se recrea). (2) La barra inferior flota
//     ocupando lo mismo que antes. (3) Lo que se toca se comprime. (4) Con movimiento
//     reducido no hay compresión ni deslizamiento. (5) Nada desborda.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const REPO = path.resolve(__dirname, '..');

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const t0 = new Date(Date.now() - 86400e3).toISOString();
    const cfg = { Modelo: 'CL4', 'EMISSION REGULATION': 'PRE-EURO 7', REGION: 'EUROPE', 'BODY TYPE': '5DR' };
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'beto', operatorName: 'Beto', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'beto', name: 'Beto', role: 'Assistant Manager / Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ vehicles: [{ id: 'v1', vin: 'KNAZZZ00000000001', status: 'ready-release', purpose: 'COP-Emisiones', configCode: 'X',
        registeredAt: t0, config: cfg, timeline: [], testData: { testDatetime: t0, signatures: {}, gasResults: {} } }], lastId: 1 }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

// La pastilla contra el elemento activo de su barra (después de que termina de moverse).
const pastilla = (page, sel) => page.evaluate((sel) => {
    const bar = document.querySelector(sel); if (!bar) return { err: 'sin barra' };
    const pl = bar.querySelector(':scope > .ui-pill');
    const act = [...bar.querySelectorAll(bar._pillSel || '.active')].find(e => e.offsetWidth > 0);
    if (!pl || !act) return { err: 'sin pastilla o sin activo' };
    const a = pl.getBoundingClientRect(), b = act.getBoundingClientRect();
    if (!pl.__id) pl.__id = Math.random();
    return { dx: Math.abs(Math.round(a.left - b.left)), dy: Math.abs(Math.round(a.top - b.top)), dw: Math.abs(Math.round(a.width - b.width)),
             op: getComputedStyle(pl).opacity, id: pl.__id, txt: act.textContent.replace(/\s+/g, ' ').trim(), n: bar.querySelectorAll(':scope > .ui-pill').length };
}, sel);
const enSuLugar = (p) => p && !p.err && p.dx <= 1 && p.dy <= 1 && p.dw <= 1 && p.op === '1' && p.n === 1;

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });

    console.log('\n== Teléfono 427×840 ==');
    let ctx = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true });
    let page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html')); await page.waitForTimeout(2800);

    chk('uiPillBox: sin tamaño no hay caja; con tamaño, redondea', await page.evaluate(() =>
        uiPillBox(null) === null && uiPillBox({ left: 3, top: 2, width: 0, height: 10 }) === null &&
        JSON.stringify(uiPillBox({ left: 10.4, top: 2.6, width: 99.5, height: 40 })) === '{"x":10,"y":3,"w":100,"h":40}'));

    const nav = await page.evaluate(() => { const n = document.getElementById('bottomNav'); const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
        return { pos: cs.position, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(innerWidth - r.right), vh: innerHeight, radio: parseFloat(cs.borderTopLeftRadius) }; });
    chk('barra inferior: fija, flotando y redondeada', nav.pos === 'fixed' && nav.left >= 4 && nav.right >= 4 && nav.vh - nav.bottom >= 4 && nav.radio >= 20, JSON.stringify(nav));
    chk('… ocupa lo mismo que antes (62 px desde abajo)', nav.vh - nav.top === 62, String(nav.vh - nav.top));
    let p = await pastilla(page, '#bottomNav');
    chk('barra inferior: la pastilla está bajo Hoy', enSuLugar(p) && /Hoy/.test(p.txt), JSON.stringify(p));
    const idNav = p.id;
    await page.evaluate(() => switchPlatform('panel')); await page.waitForTimeout(700);
    p = await pastilla(page, '#bottomNav');
    chk('… al cambiar de plataforma se va a Datos, y es la MISMA pastilla (se desliza)', enSuLugar(p) && /Datos/.test(p.txt) && p.id === idNav, JSON.stringify(p));

    await page.evaluate(() => pnSwitchTab('pn-system')); await page.waitForTimeout(700);
    p = await pastilla(page, '#platform-panel .ui-tabgroups');
    chk('grupos de Datos: la pastilla está bajo Configuración', enSuLugar(p) && /Configuración/.test(p.txt), JSON.stringify(p));
    const idGrp = p.id;
    let s = await pastilla(page, '#ui-subtabs-pn');
    chk('secciones de Sistema: la pastilla está bajo Este equipo', enSuLugar(s) && /Este equipo/.test(s.txt), JSON.stringify(s));
    const idSub = s.id;
    await page.evaluate(() => pnSwitchTab('pn-bugs')); await page.waitForTimeout(700);
    s = await pastilla(page, '#ui-subtabs-pn');
    chk('… cambia a Fallas reportadas y es la misma pastilla', enSuLugar(s) && /Fallas/.test(s.txt) && s.id === idSub, JSON.stringify(s));
    chk('… y la sección activa queda a la vista dentro de la fila', await page.evaluate(() => { const row = document.getElementById('ui-subtabs-pn'), a = row.querySelector('.ui-subtab.active');
        const r = a.getBoundingClientRect(), rr = row.getBoundingClientRect(); return r.left >= rr.left - 1 && r.right <= rr.right + 1; }));
    await page.evaluate(() => pnSwitchTab('pn-dashboard')); await page.waitForTimeout(700);
    p = await pastilla(page, '#platform-panel .ui-tabgroups');
    chk('grupos: cambia a Operación y es la misma pastilla', enSuLugar(p) && /Operación/.test(p.txt) && p.id === idGrp, JSON.stringify(p));
    chk('la opción activa sigue marcada con su clase (la pastilla solo la dibuja)', await page.evaluate(() =>
        !!document.querySelector('#platform-panel .ui-tabgroup.active') && !!document.querySelector('#bottomNav .bottom-nav-item.active')));

    await page.evaluate(() => { uiPref('cardMode', false); dashGo('cop15', 'liberacion'); }); await page.waitForTimeout(800);
    await page.evaluate(() => libSwitchSubtab('aprobador')); await page.waitForTimeout(600);
    p = await pastilla(page, '#lib-subtabs');
    chk('Liberador / Aprobador: la pastilla está bajo Aprobador', enSuLugar(p) && /Aprobador/.test(p.txt), JSON.stringify(p));
    const idLib = p.id;
    await page.evaluate(() => libSwitchSubtab('liberador')); await page.waitForTimeout(600);
    p = await pastilla(page, '#lib-subtabs');
    chk('… regresa a Liberador y es la misma', enSuLugar(p) && /Liberador/.test(p.txt) && p.id === idLib, JSON.stringify(p));

    // Respuesta al toque: se mide el estilo con el botón presionado.
    const press = await page.evaluate(() => { const b = document.querySelector('#bottomNav .bottom-nav-item:not(.active)'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(press.x, press.y); await page.mouse.down(); await page.waitForTimeout(250);
    const apretado = await page.evaluate(() => getComputedStyle(document.querySelector('#bottomNav .bottom-nav-item:active') || document.body).transform);
    await page.mouse.up(); await page.waitForTimeout(500);
    chk('lo que se toca se comprime mientras se presiona', /matrix\(0\.9[0-9]*, 0, 0, 0\.9/.test(apretado), apretado);
    chk('un botón deshabilitado no se comprime', await page.evaluate(() => { const b = document.createElement('button'); b.className = 'tp-btn'; b.disabled = true; document.body.appendChild(b);
        const ok = ![...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(r => r.selectorText && /\.tp-btn:active(?!:not\(:disabled\))/.test(r.selectorText) && r.style.transform === 'scale(0.96)'); } catch (e) { return false; } }); b.remove(); return ok; }));

    await page.evaluate(() => { uiPref('cardMode', true); const s = document.getElementById('releaseVehSelect'); if (![...s.options].some(o => o.value === 'v1')) { const o = document.createElement('option'); o.value = 'v1'; s.appendChild(o); } s.value = 'v1'; loadRelease(); });
    await page.waitForTimeout(700);
    const pie = await page.evaluate(() => { const f = document.getElementById('ls-foot'); if (!f) return null; const r = f.getBoundingClientRect(), sv = f.querySelector('.oc-save').getBoundingClientRect(), bk = f.querySelector('.oc-back').getBoundingClientRect();
        return { left: Math.round(r.left), abajo: Math.round(innerHeight - r.bottom), radio: parseFloat(getComputedStyle(f).borderTopLeftRadius), llena: Math.round(sv.right) >= Math.round(r.right) - 16, orden: bk.right <= sv.left }; });
    chk('pie de los pasos: cápsula flotante', pie && pie.left >= 4 && pie.abajo >= 4 && pie.radio >= 8, JSON.stringify(pie));
    chk('… y "Siguiente" ocupa todo el ancho que queda', pie && pie.llena && pie.orden, JSON.stringify(pie));
    await page.evaluate(() => libStepsExit({ keepPref: true }));

    const anchas = await page.evaluate(async () => {
        const out = [];
        for (const pl of ['today', 'plan', 'pruebas', 'panel', 'cop']) { switchPlatform(pl); await new Promise(r => setTimeout(r, 450));
            const o = document.documentElement.scrollWidth - innerWidth; if (o > 1) out.push(pl + ' +' + o); }
        return out;
    });
    chk('ninguna plataforma desborda la página', anchas.length === 0, anchas.join(' | '));
    chk('sin errores de página', errores.length === 0, errores.join(' · '));
    await ctx.close();

    console.log('\n== Movimiento reducido ==');
    ctx = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    page = await ctx.newPage();
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html')); await page.waitForTimeout(2800);
    const rm = await page.evaluate(() => { const pl = document.querySelector('#bottomNav > .ui-pill'); return { dur: pl ? getComputedStyle(pl).transitionDuration : 'sin pastilla' }; });
    chk('la pastilla salta, no se desliza', /^0s(, 0s)*$/.test(rm.dur), rm.dur);
    const pr = await page.evaluate(() => { const b = document.querySelector('#bottomNav .bottom-nav-item:not(.active)'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(pr.x, pr.y); await page.mouse.down(); await page.waitForTimeout(250);
    const quieto = await page.evaluate(() => getComputedStyle(document.querySelector('#bottomNav .bottom-nav-item:active') || document.body).transform);
    await page.mouse.up();
    chk('y lo que se toca no se comprime', quieto === 'none', quieto);
    await page.evaluate(() => switchPlatform('panel')); await page.waitForTimeout(400);
    chk('la pastilla sigue quedando bajo la opción activa', enSuLugar(await pastilla(page, '#bottomNav')));
    await ctx.close();

    console.log('\n== Computadora 1920×1017 ==');
    ctx = await browser.newContext({ viewport: { width: 1920, height: 1017 } });
    page = await ctx.newPage();
    const err2 = [];
    page.on('pageerror', e => err2.push(e.message));
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html')); await page.waitForTimeout(2800);
    await page.evaluate(() => { switchPlatform('panel'); pnSwitchTab('pn-reports'); }); await page.waitForTimeout(700);
    chk('grupos y secciones con su pastilla', enSuLugar(await pastilla(page, '#platform-panel .ui-tabgroups')) && enSuLugar(await pastilla(page, '#ui-subtabs-pn')));
    const dock = await page.evaluate(() => { const r = document.getElementById('bottomNav').getBoundingClientRect(); return { w: Math.round(r.width), izq: Math.round(r.left), der: Math.round(innerWidth - r.right) }; });
    chk('la barra inferior queda centrada como un dock, no de lado a lado', dock.w <= 640 && Math.abs(dock.izq - dock.der) <= 1, JSON.stringify(dock));
    chk('… con su pastilla bajo Datos', enSuLugar(await pastilla(page, '#bottomNav')));
    chk('sin errores de página', err2.length === 0, err2.join(' · '));

    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\nTodo bien');
    if (fallos.length) process.exitCode = 1;
})();
