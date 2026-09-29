// Verificación en navegador de 2.16.0 — Cada rol ve lo suyo.
// Un Practicante no ve las pestañas que no puede usar (Plan → Planeación entera, Datos →
// Usuarios/Regulaciones/Homologación/Auditoría, ni el 🕘 del topbar); el lanzador no las
// ofrece y un enlace directo explica por qué. Al cambiarle el rol aparecen sin recargar, y
// si estaba en una pestaña que deja de ver, lo lleva a la primera que sí ve. La matriz de
// Roles y permisos lista las pantallas.
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
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'p1', operatorName: 'Pepe Practicante', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'p1', name: 'Pepe Practicante', role: 'Practicante', active: true },
                    { id: 'm1', name: 'Mara Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

const visibles = (page, barId) => page.evaluate((id) => {
    const bar = document.getElementById(id);
    const tabs = [...bar.querySelectorAll('.tp-tab')].filter(b => !b.classList.contains('ui-role-hidden'))
        .map(b => (/SwitchTab\('([^']+)'\)/.exec(b.getAttribute('onclick') || '') || [])[1]);
    const grupos = [...bar.previousElementSibling.querySelectorAll('.ui-tabgroup')].filter(b => !b.hidden).map(b => b.getAttribute('data-group'));
    return { tabs, grupos };
}, barId);

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await (await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);
    await page.evaluate(() => { window.__toasts = []; const _t = window.showToast; window.showToast = function(m) { window.__toasts.push(String(m)); return _t.apply(this, arguments); }; });

    console.log('\n== Practicante: solo lo que puede usar ==');
    const tp = await visibles(page, 'tp-tabs-bar');
    chk('Plan: sin Producción, Reglas, Recuperación ni Simulador', !['tp-production', 'tp-rules', 'tp-recovery', 'tp-simulator'].some(t => tp.tabs.indexOf(t) >= 0), tp.tabs.join(','));
    chk('el grupo Planeación (sin ninguna pestaña visible) desaparece', tp.grupos.indexOf('planeacion') < 0 && tp.grupos.indexOf('semana') >= 0, tp.grupos.join(','));
    const pn = await visibles(page, 'pn-tabs-bar');
    chk('Datos: sin Usuarios, Regulaciones, Homologación ni Auditoría', !['pn-users', 'pn-regulations', 'pn-homolog', 'pn-audit'].some(t => pn.tabs.indexOf(t) >= 0), pn.tabs.join(','));
    chk('Datos: Sistema, Archivos y Fallas siguen (los ven todos)', ['pn-system', 'pn-files', 'pn-bugs'].every(t => pn.tabs.indexOf(t) >= 0), pn.tabs.join(','));
    const inv = await visibles(page, 'inv-tabs-bar');
    chk('Consumibles completo (todos los roles lo administran)', inv.tabs.length >= 12, String(inv.tabs.length));
    const reloj = await page.evaluate(() => document.querySelector('[data-needs-tab="pn-audit"]').hidden);
    chk('el 🕘 del topbar (lleva a Auditoría) no aparece', reloj === true);
    const lanz = await page.evaluate(() => uiNavRegistry().map(e => e.id));
    chk('el lanzador no ofrece lo que no ve', lanz.indexOf('tp-rules') < 0 && lanz.indexOf('pn-audit') < 0 && lanz.indexOf('pn-system') >= 0, lanz.filter(x => /^(tp|pn)-/.test(x)).join(','));

    console.log('\n== Un enlace directo explica, no abre ==');
    const enl = await page.evaluate(async () => {
        dashGo('testplan', 'tp-rules');
        await new Promise(r => setTimeout(r, 600));
        return { tab: tpState.activeTab, toast: window.__toasts.filter(t => /Plan → Reglas es para cambiar las reglas del plan/.test(t)).join(' | ') };
    });
    chk('no cambia a Reglas', enl.tab !== 'tp-rules', enl.tab);
    chk('y dice para qué es, quién la ve y qué hacer', /Signatario/.test(enl.toast) && /Tu rol \(Practicante\)/.test(enl.toast) && /pídele a un Manager/.test(enl.toast), enl.toast);

    console.log('\n== Cambiar el rol aplica al instante ==');
    const sube = await page.evaluate(async () => {
        pnState.operators.find(o => o.id === 'p1').role = 'Signatario';
        authRefreshCurrentRole();
        await new Promise(r => setTimeout(r, 200));
        return { reloj: document.querySelector('[data-needs-tab="pn-audit"]').hidden };
    });
    const tp2 = await visibles(page, 'tp-tabs-bar');
    chk('como Signatario aparece Planeación sin recargar', tp2.grupos.indexOf('planeacion') >= 0 && tp2.tabs.indexOf('tp-rules') >= 0, tp2.grupos.join(','));
    chk('y el 🕘 vuelve', sube.reloj === false);
    const baja = await page.evaluate(async () => {
        dashGo('testplan', 'tp-rules');
        await new Promise(r => setTimeout(r, 600));
        const antes = tpState.activeTab;
        pnState.operators.find(o => o.id === 'p1').role = 'Técnico';
        authRefreshCurrentRole();
        await new Promise(r => setTimeout(r, 700));
        return { antes, despues: tpState.activeTab };
    });
    chk('estando en Reglas, al bajar de rol lo lleva a la primera pestaña que sí ve', baja.antes === 'tp-rules' && baja.despues !== 'tp-rules' && !!baja.despues, JSON.stringify(baja));
    const pn2 = await visibles(page, 'pn-tabs-bar');
    chk('como Técnico ve Auditoría (puede consultar el historial) pero no Usuarios', pn2.tabs.indexOf('pn-audit') >= 0 && pn2.tabs.indexOf('pn-users') < 0, pn2.tabs.join(','));

    console.log('\n== La matriz dice qué pantallas ve cada rol ==');
    const mat = await page.evaluate(() => pnRolesMatrixHTML());
    chk('sección "Pantallas que ve" con cada pantalla restringida', /Pantallas que ve/.test(mat) && /Plan → Reglas/.test(mat) && /Datos → Auditoría/.test(mat));

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
