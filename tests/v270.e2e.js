// Verificación en navegador de 2.7.0 — Límites de regulación compartidos.
// Firestore se simula DENTRO de la página (fetch interceptado): GET de documentos y
// commit con precondición. Recorre: primera publicación desde la tarjeta, edición que
// se publica sola, versión nueva de otro equipo que se adopta sola, conflicto con
// tabla de diferencias + aviso en Liberación + alerta, y "Usar los del laboratorio".
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
    const ahora = Date.now();
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'ana', operatorName: 'Ana Manager', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);

    // Firestore falso dentro de la página.
    await page.evaluate(() => {
        const docs = {};
        window.__srv = docs;
        const R = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status }));
        window.fetch = (url, init) => {
            init = init || {};
            if (/:commit\?/.test(url)) {
                const b = JSON.parse(init.body);
                for (const w of b.writes) if (w.currentDocument && w.currentDocument.exists === false && docs[w.update.name]) return R(409, { error: { status: 'ALREADY_EXISTS', message: 'exists' } });
                b.writes.forEach(w => { docs[w.update.name] = { name: w.update.name, fields: w.update.fields }; });
                return R(200, {});
            }
            if ((init.method || 'GET') === 'GET') {
                const name = url.replace('https://firestore.googleapis.com/v1/', '').replace(/\?.*$/, '').split('/').map(decodeURIComponent).join('/');
                return docs[name] ? R(200, docs[name]) : R(404, { error: { message: 'Document not found.' } });
            }
            return R(400, {});
        };
        fbSync.enabled = true; fbSync.stationId = 'KIA-EMLAB';
        // "Otro equipo" publica la versión n con un NOx dado (sin pasar por este equipo).
        window.__otroPublica = (n, nox) => {
            const prof = JSON.parse(JSON.stringify(loadRegulations().profiles));
            prof.find(p => p.name === 'EURO-5').gases.find(g => g.field === 'NOx').limit = nox;
            const ws = fbRegPublishWrites(n, prof, { by: 'Beto (otro equipo)', at: new Date().toISOString(), note: 'desde otro equipo' }, _fbStationDocName);
            ws.forEach(w => { docs[w.update.name] = { name: w.update.name, fields: w.update.fields }; });
        };
        window.__nox = () => loadRegulations().profiles.find(p => p.name === 'EURO-5').gases.find(g => g.field === 'NOx').limit;
    });

    const abrirReg = () => page.evaluate(async () => {
        switchPlatform('panel');
        pnSwitchTab('pn-regulations');
        await new Promise(r => setTimeout(r, 700));
        const c = document.getElementById('reg-shared-card');
        return c ? c.innerText : '(sin tarjeta)';
    });

    console.log('\n== Primera publicación desde la tarjeta ==');
    let t = await abrirReg();
    chk('la tarjeta dice que cada equipo usa los suyos', /cada equipo usa los suyos/.test(t), t.slice(0, 200));
    const pub = await page.evaluate(async () => {
        [...document.querySelectorAll('#reg-shared-card button')].find(b => /Publicar los límites de este equipo/.test(b.textContent)).click();
        await new Promise(r => setTimeout(r, 300));
        const inp = document.getElementById('_ui_prompt');
        inp.value = 'COP15 rev. 04';
        const ov = inp.closest('.custom-modal-overlay');
        ov.querySelector('[data-modal-btn="1"]').click();
        await new Promise(r => setTimeout(r, 900));
        return { card: document.getElementById('reg-shared-card').innerText, docs: Object.keys(window.__srv),
                 shared: loadRegulations().shared };
    });
    chk('pide motivo y publica la versión 1', pub.shared && pub.shared.version === 1 && pub.docs.some(n => /regversions\/v1$/.test(n)), JSON.stringify(pub.docs));
    chk('la tarjeta queda "✓ versión 1"', /✓ Este equipo usa la versión 1/.test(pub.card) && /COP15 rev\. 04/.test(pub.card), pub.card);

    console.log('\n== Editar un límite se publica solo ==');
    const ed = await page.evaluate(async () => {
        const d = loadRegulations();
        d.profiles.find(p => p.name === 'EURO-5').gases.find(g => g.field === 'NOx').limit = 0.05;
        saveRegulations();
        pnRegAfterLocalEdit('EURO-5');
        await new Promise(r => setTimeout(r, 900));
        return { v: loadRegulations().shared.version, card: document.getElementById('reg-shared-card').innerText,
                 aud: _auditEnsureLoaded().filter(a => a.action === 'regulacion_publicada').length };
    });
    chk('queda como versión 2 del laboratorio', ed.v === 2 && /versión 2/.test(ed.card), ed.card);
    chk('dos publicaciones en el historial de cambios', ed.aud === 2);

    console.log('\n== Otro equipo publica: este (sin cambios propios) la toma solo ==');
    await page.evaluate(() => window.__otroPublica(3, 0.04));
    t = await abrirReg();
    const nox3 = await page.evaluate(() => window.__nox());
    chk('adopta la versión 3 (NOx 0.04)', nox3 === 0.04 && /versión 3/.test(t), t.slice(0, 200));
    chk('queda en el historial como sincronizada', await page.evaluate(() => _auditEnsureLoaded().some(a => a.action === 'regulacion_sincronizada')));

    console.log('\n== Conflicto: los dos cambiaron ==');
    await page.evaluate(() => {
        window.__otroPublica(4, 0.03);          // el otro equipo publica sobre la v3…
        const d = loadRegulations();             // …y este edita su CO sin haber visto la v4
        d.profiles.find(p => p.name === 'EURO-5').gases.find(g => g.field === 'CO').limit = 0.9;
        saveRegulations();
    });
    t = await abrirReg();
    chk('muestra "distintos" con la tabla de diferencias', /distintos/.test(t) && /NOx/.test(t) && /0\.03/.test(t) && /0\.9/.test(t), t.slice(0, 500));
    chk('ofrece las dos salidas', /Usar los del laboratorio/.test(t) && /Publicar los de este equipo como versión 5/.test(t));
    chk('NO cambió solo (este equipo conserva su CO 0.9)', (await page.evaluate(() => loadRegulations().profiles.find(p => p.name === 'EURO-5').gases.find(g => g.field === 'CO').limit)) === 0.9);
    const lib = await page.evaluate(() => {
        const c = allConfigurations.find(x => x['EMISSION REGULATION'] === 'EURO-5') || allConfigurations[0];
        db.vehicles = [{ id: 'r1', vin: '3KPFT51B7TE407968', status: 'ready-release', purpose: 'COP-Emisiones', configCode: c.codigo_config_text,
            config: Object.assign({}, c, { 'EMISSION REGULATION': 'EURO-5' }), registeredAt: new Date().toISOString(), timeline: [], testData: {} }];
        saveDB();
        switchPlatform('cop15');
        document.querySelector('#platform-cop15 .tab[data-tab="liberacion"]').click();
        const s = document.getElementById('releaseVehSelect');
        if (![...s.options].some(o => o.value === 'r1')) { const o = document.createElement('option'); o.value = 'r1'; s.appendChild(o); }
        s.value = 'r1'; loadRelease();
        const w = document.querySelector('#lib-gas-entry-content .reg-mismatch');
        const al = pnGetActiveAlerts().filter(a => a.source === 'Regulaciones');
        return { w: w ? w.textContent : '', al: al.map(a => a.message).join(' | ') };
    });
    chk('Liberación avisa que este equipo no juzga con los límites del laboratorio', /no son los de la versión 4/.test(lib.w), lib.w);
    chk('y sale la alerta "Regulaciones"', /versión 4 del laboratorio/.test(lib.al), lib.al);

    console.log('\n== Usar los del laboratorio ==');
    await abrirReg();
    const ad = await page.evaluate(async () => {
        [...document.querySelectorAll('#reg-shared-card button')].find(b => /Usar los del laboratorio/.test(b.textContent)).click();
        await new Promise(r => setTimeout(r, 300));
        document.getElementById('_modal_confirm').click();
        await new Promise(r => setTimeout(r, 900));
        const e5 = loadRegulations().profiles.find(p => p.name === 'EURO-5');
        return { nox: e5.gases.find(g => g.field === 'NOx').limit, co: e5.gases.find(g => g.field === 'CO').limit, v: loadRegulations().shared.version,
                 card: (document.getElementById('reg-shared-card') || {}).innerText || '' };
    });
    chk('toma la versión 4 (NOx 0.03, CO de vuelta a 1)', ad.nox === 0.03 && ad.co === 1 && ad.v === 4, JSON.stringify(ad));
    chk('y queda al día', /✓ Este equipo usa la versión 4/.test(ad.card), ad.card);

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
