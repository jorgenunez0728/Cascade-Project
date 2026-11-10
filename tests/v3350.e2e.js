// Verificación en navegador de 3.35.0 — Tablas que se leen en teléfono.
// (1) La estadística del CoP (8 columnas) es una tarjeta por contaminante bajo 640 px y
//     sigue siendo tabla en escritorio. (2) Una tabla que se desplaza de lado (Plan Maestro)
//     desvanece el borde hacia donde hay más, y el aviso cambia al desplazarse.
//     (3) Ninguna pantalla desborda la página a 427 px.
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
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'u1', operatorName: 'Ana', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'u1', name: 'Ana', role: 'Assistant Manager / Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

async function abrir(browser, vp) {
    const page = await (await browser.newContext({ viewport: vp, isMobile: vp.width < 600, hasTouch: vp.width < 600 })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);
    return { page, errores };
}
const stats = (page) => page.evaluate(() => {
    const t = [...document.querySelectorAll('#platform-cop table')].find(x => /Contaminante/.test(x.textContent));
    if (!t) return null;
    const tr = t.tBodies[0].rows[0];
    return { display: getComputedStyle(t).display, ancho: Math.round(t.getBoundingClientRect().width), ventana: innerWidth,
             etiquetas: [...tr.cells].map(c => c.getAttribute('data-label')), filas: t.tBodies[0].rows.length,
             desborde: document.documentElement.scrollWidth - innerWidth };
});

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });

    console.log('\n== Teléfono 427×840 ==');
    let { page, errores } = await abrir(browser, { width: 427, height: 840 });
    chk('uiScrollHintState: cabe → none', await page.evaluate(() => uiScrollHintState(0, 300, 300) === 'none' && uiScrollHintState(0, 300, 301) === 'none'));
    chk('uiScrollHintState: inicio → right, medio → both, final → left', await page.evaluate(() =>
        uiScrollHintState(0, 300, 900) === 'right' && uiScrollHintState(200, 300, 900) === 'both' && uiScrollHintState(600, 300, 900) === 'left'));

    await page.evaluate(() => dashGo('cop', 'validator')); await page.waitForTimeout(1200);
    let s = await stats(page);
    chk('CoP → Validador: la estadística existe', !!s);
    chk('… es tarjetas (no tabla) y cabe en la pantalla', s && s.display === 'block' && s.ancho <= s.ventana, JSON.stringify(s));
    chk('… cada valor lleva el nombre de su columna', s && s.etiquetas[0] === 'Contaminante' && s.etiquetas[1] === 'n válido', JSON.stringify(s && s.etiquetas));
    chk('… "Sin datos" no se etiqueta como DF', s && s.etiquetas[2] === '', JSON.stringify(s && s.etiquetas));
    chk('… la página no se desplaza de lado', s && s.desborde <= 1, String(s && s.desborde));

    await page.evaluate(() => { switchPlatform('inventory'); invSwitchTab('inv-maint'); }); await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelectorAll('#inv-content details').forEach(d => d.open = true)); await page.waitForTimeout(500);
    const m = await page.evaluate(async () => {
        const el = [...document.querySelectorAll('#inv-content .u-xscroll')].find(e => e.scrollWidth > e.clientWidth + 2);
        if (!el) return null;
        const antes = el.getAttribute('data-more'), mask = getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage;
        el.scrollLeft = 200; await new Promise(r => setTimeout(r, 200)); const medio = el.getAttribute('data-more');
        el.scrollLeft = el.scrollWidth; await new Promise(r => setTimeout(r, 200)); const fin = el.getAttribute('data-more');
        return { antes, medio, fin, mask: /gradient/.test(mask), pagina: document.documentElement.scrollWidth - innerWidth };
    });
    chk('Plan Maestro: se desplaza y lo avisa a la derecha', m && m.antes === 'right' && m.mask, JSON.stringify(m));
    chk('… a medio camino avisa de los dos lados, al final solo a la izquierda', m && m.medio === 'both' && m.fin === 'left', JSON.stringify(m));
    chk('… la página no se desplaza de lado', m && m.pagina <= 1, JSON.stringify(m));
    const quietas = await page.evaluate(() => [...document.querySelectorAll('.u-xscroll')].filter(e => e.offsetParent && e.scrollWidth <= e.clientWidth + 2 && e.getAttribute('data-more') !== 'none').length);
    chk('una tabla que cabe no lleva aviso', quietas === 0, String(quietas));

    const anchas = await page.evaluate(async () => {
        const out = [];
        const tabs = (id) => [...document.querySelectorAll('#' + id + ' .tp-tab')].map(b => (/SwitchTab\('([^']+)'/.exec(b.getAttribute('onclick') || '') || [])[1]).filter(Boolean);
        for (const [plat, fn, bar] of [['testplan', 'tpSwitchTab', 'tp-tabs-bar'], ['inventory', 'invSwitchTab', 'inv-tabs-bar'], ['panel', 'pnSwitchTab', 'pn-tabs-bar']]) {
            switchPlatform(plat);
            for (const t of tabs(bar)) {
                try { window[fn](t); } catch (e) { out.push(t + ' lanzó ' + e.message); continue; }
                await new Promise(r => setTimeout(r, 350));
                const o = document.documentElement.scrollWidth - innerWidth;
                if (o > 1) out.push(t + ' +' + o + 'px');
            }
        }
        return out;
    });
    chk('ninguna pestaña de Plan, Consumibles o Datos desborda la página', anchas.length === 0, anchas.join(' | '));
    chk('sin errores de página', errores.length === 0, errores.join(' · '));
    await page.context().close();

    console.log('\n== Escritorio 1920×1017 ==');
    ({ page, errores } = await abrir(browser, { width: 1920, height: 1017 }));
    await page.evaluate(() => dashGo('cop', 'validator')); await page.waitForTimeout(1200);
    s = await stats(page);
    chk('la estadística del CoP sigue siendo tabla', s && s.display === 'table', JSON.stringify(s));
    chk('sin errores de página', errores.length === 0, errores.join(' · '));

    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\nTodo bien');
    if (fallos.length) process.exitCode = 1;
})();
