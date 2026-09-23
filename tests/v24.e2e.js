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
            const el = document.querySelector('.toast-error');
            const sticky = parseFloat(el.style.getPropertyValue('--toast-duration')) >= 8;
            const role = document.querySelector('.toast-error').getAttribute('role');
            showToast('a', 'info'); showToast('b', 'info'); showToast('c', 'info');
            const n = document.getElementById('toast-container').children.length;
            return { sticky, role, n, close: !!document.querySelector('.toast .toast-close') };
        });
        chk('B1: toast de error dura ≥ 8 s, es role=alert y tiene ✕', t.sticky && t.role === 'alert' && t.close, JSON.stringify(t));
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
        await page.evaluate(() => { document.querySelectorAll('.custom-modal-overlay').forEach(m => m.remove()); });

        // ── Bloque 4: confirmar Y deshacer ──
        const del = await page.evaluate(async () => {
            switchPlatform('inventory'); invSwitchTab('inv-gases');
            const g = invState.gases[0]; const n0 = invState.gases.length;
            invConfirmDelete('gas', g.id);
            await new Promise(r => setTimeout(r, 80));
            const ov = [...document.querySelectorAll('.custom-modal-overlay')].pop();
            const title = (ov.querySelector('.custom-modal-title') || {}).textContent || '';
            ov.querySelector('[data-action="confirm"]').click();
            await new Promise(r => setTimeout(r, 200));
            const n1 = invState.gases.length;
            [...document.querySelectorAll('.toast-undo')].pop().click();
            await new Promise(r => setTimeout(r, 200));
            return { title, n0, n1, n2: invState.gases.length, back: invState.gases.some(x => x.id === g.id) };
        });
        chk('B4: borrar cilindro pregunta con su nombre', /¿Eliminar el cilindro «.+»\?/.test(del.title), del.title);
        chk('B4: …lo borra y Deshacer lo devuelve', del.n1 === del.n0 - 1 && del.n2 === del.n0 && del.back, JSON.stringify(del));

        const cap = await page.evaluate(async () => {
            invSwitchTab('inv-readings'); await new Promise(r => setTimeout(r, 300));
            const c = document.getElementById('inv-content');
            return { save: c.querySelectorAll('.inv-capture-savebar').length, headSave: [...c.querySelectorAll('.tp-card-title button')].filter(b => /Guardar/.test(b.textContent)).length,
                     reserva: !!c.querySelector('details summary') && /reserva/i.test(c.querySelector('details summary').textContent),
                     invisible: [...c.querySelectorAll('strong')].filter(x => x.style.color === 'rgb(255, 255, 255)' || x.style.color === '#fff').length };
        });
        chk('B4: captura con UN Guardar abajo (fijo) y reserva plegada', cap.save === 1 && cap.headSave === 0 && cap.reserva, JSON.stringify(cap));
        chk('B4: sin números en blanco sobre blanco en la captura', cap.invisible === 0, JSON.stringify(cap));

        const rule = await page.evaluate(async () => {
            const n0 = tpState.rules.length; tpDeleteRatioRule(0);
            await new Promise(r => setTimeout(r, 80));
            const asked = !!document.querySelector('.custom-modal-overlay [data-action="confirm"]');
            document.querySelector('.custom-modal-overlay [data-action="cancel"]').click();
            await new Promise(r => setTimeout(r, 200));
            return { asked, same: tpState.rules.length === n0 };
        });
        chk('B4: borrar una regla de ratio pregunta (y cancelar no borra)', rule.asked && rule.same, JSON.stringify(rule));

        chk('computadora: sin diálogos nativos', await page.evaluate(() => window._nativeDialogs) === 0);
        chk('computadora: sin errores de página', errs.length === 0, errs.join(' | '));
        await page.close();
    }

    // ── Barrido: cada pestaña de cada plataforma, en teléfono y computadora ──
    for (const width of [390, 1366]) {
        const { page, errs } = await abrir(browser, width);
        const tabs = await page.evaluate(() => ({
            tp: (typeof _tpTabs !== 'undefined' ? _tpTabs : []).filter(t => document.querySelector('#tp-tabs-bar [onclick*="' + t + '"], [onclick*="tpSwitchTab(\'' + t + '\')"]')),
            inv: (typeof _invTabs !== 'undefined' ? _invTabs : []).filter(t => document.querySelector('[onclick*="invSwitchTab(\'' + t + '\')"]')),
            pn: (typeof _pnTabs !== 'undefined' ? _pnTabs : []).filter(t => document.querySelector('[onclick*="pnSwitchTab(\'' + t + '\')"]')),
            cop: ['overview', 'validator', 'spc', 'dossier'],
            cop15: [...document.querySelectorAll('.tab[data-tab]')].map(b => b.dataset.tab)
        }));
        const visitar = {
            tp: t => { switchPlatform('testplan'); tpSwitchTab(t); },
            inv: t => { switchPlatform('inventory'); invSwitchTab(t); },
            pn: t => { switchPlatform('panel'); pnSwitchTab(t); },
            cop: t => { switchPlatform('cop'); copSetView(t); },
            cop15: t => { switchPlatform('cop15'); document.querySelector('.tab[data-tab="' + t + '"]').click(); }
        };
        const malos = [], anchos = [];
        for (const mod of Object.keys(tabs)) {
            for (const t of tabs[mod]) {
                await page.evaluate(([m, tab, src]) => { (new Function('t', 'return (' + src + ')(t)'))(tab); }, [mod, t, visitar[mod].toString()]);
                await page.waitForTimeout(350);
                const r = await page.evaluate(() => {
                    const sinChips = [...document.querySelectorAll('select[data-chips]')].filter(s => s.offsetParent !== null || (s.closest('.platform-section.active') && !s._chips))
                        .filter(s => !s._chips).map(s => s.id || s.getAttribute('aria-label') || s.outerHTML.slice(0, 60));
                    return { sinChips, over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
                });
                if (r.sinChips.length) malos.push(mod + ':' + t + ' → ' + r.sinChips.join(','));
                if (r.over > 1) anchos.push(mod + ':' + t + ' (+' + r.over + 'px)');
            }
        }
        const n = Object.values(tabs).reduce((a, b) => a + b.length, 0);
        chk(width + 'px: todas las pestañas (' + n + ') — ningún data-chips sin sus botones', malos.length === 0, malos.join(' | '));
        chk(width + 'px: ninguna pestaña con scroll horizontal de página', anchos.length === 0, anchos.join(' | '));
        chk(width + 'px: sin diálogos nativos en el barrido', await page.evaluate(() => window._nativeDialogs) === 0);
        chk(width + 'px: sin errores de página en el barrido', errs.length === 0, errs.slice(0, 3).join(' | '));

        if (width === 390) {
            // Alta de cilindro: estado en botones y en español, valor guardado intacto.
            await page.evaluate(() => { switchPlatform('inventory'); invShowAddGas(); });
            await page.waitForTimeout(300);
            const g = await page.evaluate(() => {
                const s = document.getElementById('inv-g-status');
                const chips = s && s._chips ? [...s._chips.querySelectorAll('.ui-chip')].map(b => b.textContent.trim()) : [];
                return { chips, value: s && s.value };
            });
            chk('B2: estado de cilindro en botones y en español', g.chips.join('|') === 'En uso|En almacén|Reserva|Vacío' && g.value === 'In use', JSON.stringify(g));
        }
        await page.close();
    }

    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLAS' : '\nTodo en orden');
    if (fallos.length) process.exitCode = 1;
})();
