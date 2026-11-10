// Verificación en navegador de 3.36.0 — Las pantallas de la nube, en claro.
// (1) fbCloudStatus dice en palabras del laboratorio si el equipo está al día y qué hacer.
// (2) ☁️ Nube y los demás diálogos de sincronización ya no usan el tema oscuro, no desbordan
//     en teléfono y quedan debajo de los avisos. (3) "Avanzado" solo lo ve quien administra
//     la sincronización, y bajar todo pide permiso y confirmación.
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
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
`;

// Fondos oscuros dentro del diálogo (luminancia < 0.2) y desbordes.
const revisar = (page) => page.evaluate(() => {
    const m = document.getElementById('fbModal');
    if (!m || getComputedStyle(m).display === 'none') return { abierto: false };
    const lum = (c) => { const x = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c); if (!x) return 1; if (x[4] !== undefined && Number(x[4]) < 0.5) return 1;
        return (0.2126 * x[1] + 0.7152 * x[2] + 0.0722 * x[3]) / 255; };
    const oscuros = [];
    m.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 24) return;
        if (el.tagName === 'BUTTON' || el.classList.contains('fb-bar-fill')) return;
        if (lum(cs.backgroundColor) < 0.2) oscuros.push(el.tagName + '.' + el.className + ' ' + cs.backgroundColor);
    });
    const caja = m.firstElementChild;
    return { abierto: true, oscuros, desborde: caja ? caja.scrollWidth - caja.clientWidth : 0, pagina: document.documentElement.scrollWidth - innerWidth,
             z: Number(getComputedStyle(m).zIndex), texto: m.textContent };
});

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });

    for (const vp of [{ width: 427, height: 840 }, { width: 1920, height: 1017 }]) {
        console.log('\n== Manager · ' + vp.width + '×' + vp.height + ' ==');
        const page = await (await browser.newContext({ viewport: vp, isMobile: vp.width < 600, hasTouch: vp.width < 600 })).newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.addInitScript(seed('Assistant Manager / Manager'));
        await page.goto('file://' + path.join(REPO, 'index.html'));
        await page.waitForTimeout(3000);

        if (vp.width === 427) {
            const st = await page.evaluate(() => {
                const f = fbCloudStatus, base = { hasConfig: true, enabled: true, status: 'connected', online: true };
                const con = (o) => f(Object.assign({}, base, o));
                return {
                    ok: con({ live: true }), okLento: con({ live: false }), cola: con({ queue: 2, pendingVeh: 1 }), uno: con({ pendingVeh: 1 }),
                    sinRed: con({ online: false, queue: 3 }), error: con({ status: 'error', lastError: 'x' }), auth: con({ status: 'auth' }),
                    atrasado: con({ review: true, queue: 5 }), vacio: con({ empty: true }), lleno: con({ blocked: ['Consumibles y equipos'] }),
                    sinNube: f({ hasConfig: false }), apagada: f({ hasConfig: true, enabled: false, status: 'off', online: true })
                };
            });
            chk('al día y en vivo: verde, sin acción', st.ok.level === 'ok' && !st.ok.action && /segundos/.test(st.ok.detail), JSON.stringify(st.ok));
            chk('al día sin escucha: dice cada cuánto llega', st.okLento.level === 'ok' && /minutos/.test(st.okLento.detail));
            chk('pendientes: cuenta cola + vehículos y ofrece subir', st.cola.level === 'warn' && /3 cambios/.test(st.cola.title) && st.cola.action.id === 'retry-queue', JSON.stringify(st.cola));
            chk('uno solo: singular', /1 cambio por subir/.test(st.uno.title), st.uno.title);
            chk('sin internet: no pide nada, dice que se sube solo', st.sinRed.level === 'warn' && !st.sinRed.action && /3 cambios/.test(st.sinRed.detail));
            chk('error: rojo y reintentar', st.error.level === 'err' && st.error.action.id === 'retry');
            chk('sin contraseña del laboratorio: conectar', st.auth.action.id === 'auth');
            chk('equipo atrasado gana a los pendientes', st.atrasado.action.id === 'review' && /atrasado/.test(st.atrasado.title));
            chk('equipo vacío: bajar los datos', st.vacio.action.id === 'pull');
            chk('módulo que no cabe: rojo y lo nombra', st.lleno.level === 'err' && /Consumibles/.test(st.lleno.detail));
            chk('sin nube configurada / apagada', st.sinNube.level === 'off' && st.apagada.level === 'warn' && st.apagada.action.id === 'retry');
            const jerga = Object.keys(st).map(k => st[k].title + ' ' + st[k].detail).join(' ');
            chk('ningún estado habla de merge, sync, push, REST ni Firebase', !/merge|sync|push|rest\b|firebase|firestore|seed/i.test(jerga), jerga.slice(0, 200));
        }

        await page.evaluate(() => { fbSync.enabled = true; fbSync.status = 'connected'; fbSync.lastSync = new Date(); window._fbAdvOpen = true; fbShowSettings(); });
        await page.waitForTimeout(400);
        let r = await revisar(page);
        chk('☁️ Nube abre', r.abierto && /Nube del laboratorio/.test(r.texto));
        chk('… sin fondos oscuros', r.oscuros.length === 0, (r.oscuros || []).slice(0, 3).join(' | '));
        chk('… no desborda', r.desborde <= 1 && r.pagina <= 1, r.desborde + ' / ' + r.pagina);
        chk('… queda debajo de avisos y confirmaciones (z < 9999)', r.z < 9999 && r.z > 9500, String(r.z));
        chk('… ya no enseña reglas abiertas ni jerga', !/allow read|Anonymous|Smart Merge|Activity Feed|Firebase Cloud Sync|Quota/i.test(r.texto));
        chk('… Avanzado visible para quien administra', /Avanzado/.test(r.texto) && /Bajar todo y reemplazar/.test(r.texto));

        await page.evaluate(() => fbCloudPullAllConfirm()); await page.waitForTimeout(400);
        const conf = await page.evaluate(() => { const els = [...document.querySelectorAll('body > div')].filter(e => /Bajar todo de la nube/.test(e.textContent) && e.id !== 'fbModal' && getComputedStyle(e).display !== 'none');
            const e = els[els.length - 1]; if (!e) return null; const z = Number(getComputedStyle(e).zIndex) || 0;
            const b = [...e.querySelectorAll('button')].find(x => /Cancelar/.test(x.textContent)); if (b) b.click(); return { z }; });
        chk('bajar todo pide confirmación, y se ve encima de la Nube', conf && conf.z > 9600, JSON.stringify(conf));

        await page.evaluate(() => { const i = document.getElementById('fb-device-name-input'); i.value = ''; fbCloudSaveName(); }); await page.waitForTimeout(200);
        chk('nombre vacío: el error va en el campo', await page.evaluate(() => document.getElementById('fb-device-name-input').getAttribute('aria-invalid') === 'true'));

        for (const [nombre, fn] of [['Comparar con otro equipo', 'fbMergeShowPanel()'], ['Historial', 'fbMergeShowHistory()'], ['Respaldos', 'fbBackupShowList()'], ['Actividad', 'fbActivityShowFeed()']]) {
            await page.evaluate((f) => { try { eval(f); } catch (e) { window.__err = String(e); } }, fn); await page.waitForTimeout(700);
            r = await revisar(page);
            chk(nombre + ': abre sin fondos oscuros', r.abierto && r.oscuros.length === 0, (r.oscuros || []).slice(0, 3).join(' | '));
            chk(nombre + ': no desborda', r.abierto && r.desborde <= 1 && r.pagina <= 1, r.desborde + ' / ' + r.pagina);
        }
        chk('sin errores de página', errores.length === 0, errores.join(' · '));
        await page.context().close();
    }

    console.log('\n== Técnico: sin Avanzado ==');
    const page = await (await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true })).newPage();
    await page.addInitScript(seed('Técnico'));
    await page.goto('file://' + path.join(REPO, 'index.html')); await page.waitForTimeout(3000);
    await page.evaluate(() => { window.__toasts = []; const _t = window.showToast; window.showToast = function(m) { window.__toasts.push(String(m)); return _t.apply(this, arguments); };
        fbSync.enabled = true; fbSync.status = 'connected'; fbShowSettings(); });
    await page.waitForTimeout(300);
    const t = await revisar(page);
    chk('ve el estado y su equipo, no Avanzado', t.abierto && /Este equipo/.test(t.texto) && !/Avanzado|Bajar todo/.test(t.texto));
    await page.evaluate(() => fbCloudPullAllConfirm()); await page.waitForTimeout(300);
    chk('y bajar todo se niega en la capa de datos', await page.evaluate(() => window.__toasts.length > 0 && ![...document.querySelectorAll('body > div')].some(e => /Bajar todo de la nube/.test(e.textContent) && e.id !== 'fbModal')));

    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\nTodo bien');
    if (fallos.length) process.exitCode = 1;
})();
