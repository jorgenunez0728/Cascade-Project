// Verificación en navegador de 2.10.0 — Nada falla en silencio + el reporte trae el código.
// Corre sobre el BUNDLE compilado (kia-emlab-unified.html), que es donde el navegador
// reporta "index.html:44387" y el mapa de líneas tiene que traducirlo.
//  - Un error real dentro del código de la app, lanzado desde un toque → aviso con "Reportar".
//  - "Reportar" abre el reporte; el cuerpo trae js/cop15.js:línea real, el enlace al commit
//    del build, el fragmento con esa misma línea del archivo fuente y los pasos previos.
//  - Un error sin acción reciente del técnico (de fondo) NO avisa.
//  - Un botón bloqueado con uiExplainDisabled dice por qué al tocarlo.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const BUNDLE = path.join(REPO, 'kia-emlab-unified.html');
const COP15 = fs.readFileSync(path.join(REPO, 'js', 'cop15.js'), 'utf8').split('\n');

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const ahora = Date.now();
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'ana', operatorName: 'Ana Técnica', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Técnica', role: 'Técnico', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    if (!fs.existsSync(BUNDLE)) { console.error('Falta kia-emlab-unified.html: correr ./build.sh'); process.exit(1); }
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await (await browser.newContext({ viewport: { width: 427, height: 840 }, hasTouch: true })).newPage();
    const nativos = [];
    page.on('dialog', d => { nativos.push(d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + BUNDLE);
    await page.waitForTimeout(3000);

    console.log('\n== Un error del programa tras un toque avisa ==');
    await page.evaluate(() => {
        window.__toasts = [];
        const _t = window.showToast;
        window.showToast = function(m) { window.__toasts.push(String(m)); return _t.apply(this, arguments); };
        const b = document.createElement('button');
        b.id = '__boom'; b.textContent = 'Botón que truena';
        b.style.cssText = 'position:fixed;top:120px;left:20px;z-index:99999;padding:12px;';
        // Rompe `db` justo mientras corre código REAL de la app (refreshAllLists, js/cop15.js).
        b.onclick = function() { const d = db; db = null; try { refreshAllLists(); } finally { db = d; } };
        document.body.appendChild(b);
    });
    await page.click('#__boom');
    await page.waitForTimeout(400);
    const aviso = await page.evaluate(() => {
        const t = [...document.querySelectorAll('#toast-container .toast')].find(x => /Algo falló al hacer eso/.test(x.textContent));
        const btn = t && t.querySelector('.toast-undo');
        return { hay: !!t, boton: btn ? btn.textContent : '', errores: window._bugRecentErrors.length };
    });
    chk('sale el aviso "Algo falló al hacer eso"', aviso.hay, JSON.stringify(aviso));
    chk('con el botón "Reportar"', aviso.boton === 'Reportar', aviso.boton);

    console.log('\n== "Reportar" arma el reporte con el código ==');
    const rep = await page.evaluate(async () => {
        // Sin red para html2canvas: una captura falsa basta para abrir el modal.
        window.html2canvas = () => Promise.resolve(document.createElement('canvas'));
        [...document.querySelectorAll('#toast-container .toast-undo')].find(b => b.textContent === 'Reportar').click();
        await new Promise(r => setTimeout(r, 500));
        const modal = document.getElementById('bug-modal');
        const ctx = bugBuildContext();
        const body = bugBuildIssueBody({ id: 'bug_t', at: new Date().toISOString(), comment: 'Toqué y no pasó nada', ctx: ctx }, null);
        if (modal) bugModalClose();
        return { modal: modal ? modal.innerText : '', where: ctx.where, body: body, commit: APP_COMMIT };
    });
    chk('se abrió el reporte', !!rep.modal);
    chk('el modal dice dónde falló', /dónde falló: js\/cop15\.js:\d+/.test(rep.modal), rep.modal.slice(-300));
    const w = rep.where || {};
    chk('dónde: js/cop15.js dentro de refreshAllLists', w.file === 'js/cop15.js' && w.fn === 'refreshAllLists', JSON.stringify({ file: w.file, line: w.line, fn: w.fn }));
    const src = COP15[(w.line || 1) - 1] || '';
    chk('esa línea del archivo fuente es la que lee db.vehicles', /db\.vehicles/.test(src), src.trim());
    chk('enlace al commit del build', /^[0-9a-f]{40}$/.test(rep.commit) && w.url === 'https://github.com/jorgenunez0728/Cascade-Project/blob/' + rep.commit + '/js/cop15.js#L' + w.line, w.url);
    const marcada = (rep.body.split('\n').find(l => / ▶ /.test(l)) || '');
    chk('el fragmento marca exactamente esa línea del fuente', marcada.indexOf(src.trim().slice(0, 60)) >= 0, marcada);
    chk('el cuerpo trae Dónde falló, cadena y pasos previos', /### Dónde falló/.test(rep.body) && /### Pasos previos/.test(rep.body) && /«Botón que truena»/.test(rep.body));
    chk('los pasos no incluyen nada tecleado', !/Toqué y no pasó nada/.test(rep.body.split('### Pasos previos')[1] || ''));

    console.log('\n== Un error de fondo (sin toque reciente) NO avisa ==');
    await page.waitForTimeout(4500);
    const fondo = await page.evaluate(async () => {
        const n0 = window._bugRecentErrors.length;
        const antes = window.__toasts.filter(t => /Algo falló/.test(t)).length;
        setTimeout(() => { const d = db; db = null; try { refreshAllLists(); } finally { db = d; } }, 0);
        await new Promise(r => setTimeout(r, 300));
        return { registrado: window._bugRecentErrors.length > n0, avisos: window.__toasts.filter(t => /Algo falló/.test(t)).length - antes };
    });
    chk('queda registrado para el reporte', fondo.registrado);
    chk('pero no le dice al técnico "al hacer eso"', fondo.avisos === 0, JSON.stringify(fondo));

    console.log('\n== Un botón bloqueado dice por qué ==');
    const box = await page.evaluate(() => {
        const b = document.createElement('button');
        b.id = '__locked'; b.textContent = 'Aprobar';
        b.style.cssText = 'position:fixed;top:200px;left:20px;z-index:99999;padding:12px;';
        document.body.appendChild(b);
        uiExplainDisabled(b, 'Captura los gases para compararlos con los del liberador.');
        const r = b.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: b.disabled, title: b.title };
    });
    chk('sigue deshabilitado de verdad (el candado no cambia)', box.disabled && /Captura los gases/.test(box.title));
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
    chk('al tocarlo sale el motivo', await page.evaluate(() => window.__toasts.some(t => /Captura los gases para compararlos/.test(t))));
    const hab = await page.evaluate(() => { const b = document.getElementById('__locked'); uiExplainDisabled(b, ''); return { d: b.disabled, t: b.title, w: b.getAttribute('data-why') }; });
    chk('al habilitarlo se limpia el motivo', !hab.d && !hab.t && !hab.w, JSON.stringify(hab));

    console.log('\n== Sin diálogos nativos ==');
    chk('ningún alert/confirm/prompt', nativos.length === 0, nativos.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
