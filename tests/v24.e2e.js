// Verificación en navegador de v24 — auditoría UX de toda la plataforma.
// Corre a 390 px (teléfono) y 1366 px (computadora).
const { chromium } = require('playwright');
const path = require('path');
const REPO = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre); console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}
const SEED = () => {
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'op-test', operatorName: 'Jorge Nunez', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'op-test', name: 'Jorge Nunez', role: 'Administrador', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_current_operator', 'Jorge Nunez');
    localStorage.setItem('kia_fb_sync_modules', '{}');
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    // Un prompt/confirm/alert nativo es un defecto: se cuenta.
    window._nativeDialogs = 0;
    window.prompt = function() { window._nativeDialogs++; return null; };
    window.alert = function() { window._nativeDialogs++; };
    window.confirm = function() { window._nativeDialogs++; return false; };
};

async function abrir(browser, width) {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);
    return { page, errs };
}
const frame = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });

    // ── Bloque 0/1 en computadora ──
    {
        const { page, errs } = await abrir(browser, 1366);

        // Bug 1: la tarjeta "Armar la semana" se pintaba DOS veces en una semana sin plan.
        await page.evaluate(() => { switchPlatform('testplan'); tpSwitchTab('tp-myweek'); window._tpBoardWeek = '2031-01-06'; tpBoardInvalidate(); tpRender(); });
        await page.waitForTimeout(500);
        const armar = await page.evaluate(() => ({
            cards: document.querySelectorAll('[data-armar]').length,
            ids: document.querySelectorAll('#tp-weekly-date').length,
            open: !!document.querySelector('[data-armar] details[open], [data-armar] .ui-card[open]')
        }));
        chk('B0: una sola tarjeta "Armar" y un solo #tp-weekly-date', armar.cards === 1 && armar.ids === 1, JSON.stringify(armar));

        // Bloque 1: showConfirmDialog cierra con Escape y devuelve false.
        const esc = await page.evaluate(async () => {
            const p = showConfirmDialog({ title: 'Prueba', message: '¿Seguro?' });
            await new Promise(r => setTimeout(r, 50));
            const ov = document.querySelector('.custom-modal-overlay');
            ov.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return await p;
        });
        chk('B1: Escape cierra el diálogo de confirmación (resuelve false)', esc === false);

        // Toast de error: se queda (sin barra de progreso) y trae ✕; máximo 3.
        const t = await page.evaluate(async () => {
            document.getElementById('toast-container') && (document.getElementById('toast-container').innerHTML = '');
            showToast('e1', 'error');
            const sticky = document.querySelector('.toast-error').classList.contains('toast-sticky');
            const role = document.querySelector('.toast-error').getAttribute('role');
            showToast('a', 'info'); showToast('b', 'info'); showToast('c', 'info');
            const n = document.getElementById('toast-container').children.length;
            return { sticky, role, n, close: !!document.querySelector('.toast .toast-close') };
        });
        chk('B1: toast de error persiste, es role=alert y tiene ✕', t.sticky && t.role === 'alert' && t.close, JSON.stringify(t));
        chk('B1: máximo 3 toasts a la vez', t.n === 3, JSON.stringify(t));

        // toastUndo restaura.
        const u = await page.evaluate(() => {
            window._x = 1; toastUndo('borrado', () => { window._x = 2; });
            [...document.querySelectorAll('.toast-undo')].pop().click();
            return window._x;
        });
        chk('B1: toastUndo ejecuta la restauración', u === 2);

        // uiPrompt reemplaza a prompt(): Enter acepta.
        const pr = await page.evaluate(async () => {
            const p = uiPrompt({ title: 'X', label: 'Nombre', value: 'abc' });
            await new Promise(r => setTimeout(r, 50));
            const i = document.getElementById('_ui_prompt');
            i.value = 'Plantilla 1';
            i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            return await p;
        });
        chk('B1: uiPrompt devuelve lo escrito con Enter', pr === 'Plantilla 1', String(pr));

        // data-chips en algo que se pinta DESPUÉS del arranque (antes no hacía nada).
        await page.evaluate(() => {
            const d = document.createElement('div');
            d.id = 'zz'; d.innerHTML = '<select data-chips id="zzs"><option value="a">A</option><option value="b">B</option></select>' +
                '<table class="u-cards"><thead><tr><th>Uno</th><th>Dos</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
            document.body.appendChild(d);
        });
        await frame(page);
        const obs = await page.evaluate(() => ({
            chips: !!document.getElementById('zzs')._chips,
            label: document.querySelector('#zz td').getAttribute('data-label')
        }));
        chk('B1: data-chips funciona en HTML pintado después del arranque', obs.chips, JSON.stringify(obs));
        chk('B1: uiTableCards pone data-label desde el encabezado', obs.label === 'Uno', JSON.stringify(obs));
        await page.evaluate(() => document.getElementById('zz').remove());

        // uiLabel: el valor guardado no cambia, solo lo que se lee.
        const lb = await page.evaluate(() => [uiLabel('gasStatus', 'In use'), uiLabel('purpose', 'Correlacion'), uiLabel('region', 'EUROPE'), uiLabel('gasStatus', 'Raro')]);
        chk('B1: uiLabel traduce códigos y deja pasar lo desconocido', lb.join('|') === 'En uso|Correlación|Europa|Raro', lb.join('|'));

        // Bug 5: ✏️ de operadores ya no usa prompt() nativo.
        await page.evaluate(() => { pnEditOperator(0); });
        await page.waitForTimeout(200);
        const ed = await page.evaluate(() => ({ modal: !!document.getElementById('pn-edit-op-role'), native: window._nativeDialogs }));
        chk('B0: editar operador abre el modal con selector de rol', ed.modal && ed.native === 0, JSON.stringify(ed));
        await page.evaluate(() => { const m = document.getElementById('globalModal'); if (m) m.remove(); });

        chk('computadora: sin diálogos nativos', await page.evaluate(() => window._nativeDialogs) === 0);
        chk('computadora: sin errores de página', errs.length === 0, errs.join(' | '));
        await page.close();
    }

    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLAS' : '\nTodo en orden');
    if (fallos.length) process.exitCode = 1;
})();
