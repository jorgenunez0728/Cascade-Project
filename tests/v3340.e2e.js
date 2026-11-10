// Verificación en navegador de 3.34.0 — Menos pestañas.
// Consumibles queda en 8 pestañas y Datos en 11: las que eran "otra vista de lo mismo"
// pasan a ser secciones (fila de fichas) de una anfitriona. Los ids viejos siguen abriendo
// su pantalla (dashGo, lanzador), tocar la anfitriona vuelve a la última sección usada, y un
// Practicante sigue sin ver Límites aunque sí vea Regulaciones → Normas.
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

const seed = (role) => `
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'u1', operatorName: 'Ana', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'u1', name: 'Ana', role: ${JSON.stringify(role)}, active: true },
        { id: 'm1', name: 'Mara', role: 'Assistant Manager / Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
`;

const barra = (page, barId) => page.evaluate((id) => {
    const bar = document.getElementById(id);
    const vis = (b) => getComputedStyle(b).display !== 'none';
    return {
        tabs: [...bar.querySelectorAll('.tp-tab')].filter(vis).map(b => b.textContent.trim()),
        activa: ([...bar.querySelectorAll('.tp-tab.active')].filter(vis)[0] || {}).textContent || '',
        secciones: [...(bar.nextElementSibling.classList.contains('ui-subtabs') && !bar.nextElementSibling.hidden ? bar.nextElementSibling.children : [])].map(b => b.textContent.trim()),
        seccion: ((bar.nextElementSibling.querySelector('.ui-subtab.active')) || {}).textContent || '',
        grupos: getComputedStyle(bar.previousElementSibling).display !== 'none'
    };
}, barId);

async function abrir(browser, role, vp) {
    const page = await (await browser.newContext({ viewport: vp, isMobile: vp.width < 600, hasTouch: vp.width < 600 })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(seed(role));
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);
    return { page, errores };
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 427, height: 840 }, { width: 1920, height: 1017 }]) {
        console.log('\n== Manager · ' + vp.width + '×' + vp.height + ' ==');
        const { page, errores } = await abrir(browser, 'Assistant Manager / Manager', vp);

        await page.evaluate(() => switchPlatform('inventory')); await page.waitForTimeout(500);
        let b = await barra(page, 'inv-tabs-bar');
        chk('Consumibles: 8 pestañas en la barra', b.tabs.length === 8, b.tabs.join(' | '));
        chk('Consumibles: sin fila de grupos', !b.grupos);
        chk('la barra no desborda la pantalla', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

        await page.evaluate(() => invSwitchTab('inv-fuel')); await page.waitForTimeout(400);
        b = await barra(page, 'inv-tabs-bar');
        chk('el id viejo inv-fuel abre Existencias → Combustible', /Existencias/.test(b.activa) && /Combustible/.test(b.seccion), b.activa + ' / ' + b.seccion);
        chk('Existencias trae 3 secciones', b.secciones.length === 3, b.secciones.join(' | '));
        chk('y pinta la pantalla de combustible', await page.evaluate(() => invState.activeTab === 'inv-fuel' && document.getElementById('inv-content').textContent.length > 40));

        await page.evaluate(() => invSwitchTab('inv-equipment')); await page.waitForTimeout(300);
        b = await barra(page, 'inv-tabs-bar');
        chk('una pestaña sin secciones no muestra la fila', b.secciones.length === 0 && /Equipos/.test(b.activa), b.activa);
        await page.evaluate(() => [...document.querySelectorAll('#inv-tabs-bar .tp-tab[data-merged-host]')].filter(x => /Existencias/.test(x.textContent))[0].click());
        await page.waitForTimeout(400);
        b = await barra(page, 'inv-tabs-bar');
        chk('tocar Existencias vuelve a la última sección (Combustible)', /Combustible/.test(b.seccion), b.seccion);
        await page.evaluate(() => document.querySelector('#ui-subtabs-inv [data-subtab="inv-trace"]').click()); await page.waitForTimeout(400);
        chk('la ficha Trazabilidad abre inv-trace', await page.evaluate(() => invState.activeTab === 'inv-trace'));
        await page.evaluate(() => dashGo('inventory', 'inv-charts')); await page.waitForTimeout(600);
        b = await barra(page, 'inv-tabs-bar');
        chk('dashGo a inv-charts abre Resumen → Gráficas', /Resumen/.test(b.activa) && /Gr[aá]ficas/.test(b.seccion), b.activa + ' / ' + b.seccion);

        await page.evaluate(() => switchPlatform('panel')); await page.waitForTimeout(700);
        b = await barra(page, 'pn-tabs-bar');
        chk('Datos: conserva la fila de grupos', b.grupos);
        const todas = await page.evaluate(() => [...document.querySelectorAll('#pn-tabs-bar .tp-tab')].filter(x => !x.classList.contains('ui-merged-hidden') && !x.classList.contains('ui-role-hidden')).length);
        chk('Datos: 11 pestañas entre los dos grupos', todas === 11, String(todas));
        for (const [id, host, sec] of [['pn-executive', 'Reportes', 'Ejecutivo'], ['pn-turnaround', 'Reportes', 'Tiempos'], ['pn-intelligence', 'Reportes', 'Inteligencia'],
                                       ['pn-normas', 'Regulaciones', 'Normas'], ['pn-regulations', 'Regulaciones', 'Límites'],
                                       ['pn-files', 'Sistema', 'Archivos'], ['pn-bugs', 'Sistema', 'Fallas'], ['pn-system', 'Sistema', 'Este equipo']]) {
            await page.evaluate((t) => pnSwitchTab(t), id); await page.waitForTimeout(450);
            b = await barra(page, 'pn-tabs-bar');
            const visible = await page.evaluate((t) => {
                if (pnState.activeTab !== t) return false;
                const root = document.getElementById('pn-alpine-root'), c = document.getElementById('pn-content');
                return (c && c.textContent.trim().length > 30) || (root && root.textContent.trim().length > 30);
            }, id);
            chk(id + ' → ' + host + ' → ' + sec, b.activa.indexOf(host) >= 0 && b.seccion.indexOf(sec) >= 0 && visible, b.activa + ' / ' + b.seccion);
        }
        const nav = await page.evaluate(() => uiNavRegistry().filter(e => ['inv-fuel', 'pn-bugs', 'pn-normas', 'inv-gases', 'pn-reports'].indexOf(e.id) >= 0).map(e => e.id + '=' + e.label));
        chk('el lanzador sigue ofreciendo cada sección con su nombre', nav.length === 5 && nav.some(x => /inv-fuel=Combustible/.test(x)) && nav.some(x => /inv-gases=Gases/.test(x)) && nav.some(x => /pn-reports=Exportar/.test(x)), nav.join(', '));
        chk('sin errores de página', errores.length === 0, errores.join(' · '));
        await page.context().close();
    }

    console.log('\n== Practicante: Regulaciones sin Límites ==');
    const { page, errores } = await abrir(browser, 'Practicante', { width: 427, height: 840 });
    await page.evaluate(() => { window.__toasts = []; const _t = window.showToast; window.showToast = function(m) { window.__toasts.push(String(m)); return _t.apply(this, arguments); }; });
    await page.evaluate(() => switchPlatform('panel')); await page.waitForTimeout(700);
    await page.evaluate(() => [...document.querySelectorAll('#pn-tabs-bar .ui-tabgroup, .ui-tabgroups .ui-tabgroup')].filter(x => x.getAttribute('data-group') === 'config')[0].click());
    await page.waitForTimeout(400);
    await page.evaluate(() => [...document.querySelectorAll('#pn-tabs-bar .tp-tab[data-merged-host]')].filter(x => /Regulaciones/.test(x.textContent))[0].click());
    await page.waitForTimeout(500);
    const b = await barra(page, 'pn-tabs-bar');
    chk('ve Regulaciones y entra a Normas', await page.evaluate(() => pnState.activeTab === 'pn-normas'));
    chk('sin fila de secciones (solo ve una)', b.secciones.length === 0, b.secciones.join('|'));
    await page.evaluate(() => pnSwitchTab('pn-regulations')); await page.waitForTimeout(300);
    chk('un enlace directo a Límites explica por qué no', await page.evaluate(() => pnState.activeTab === 'pn-normas' && window.__toasts.some(t => /Regulaciones/.test(t))));
    chk('sin errores de página', errores.length === 0, errores.join(' · '));

    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\nTodo bien');
    if (fallos.length) process.exitCode = 1;
})();
