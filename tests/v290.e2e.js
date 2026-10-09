// Verificación en navegador de 2.9.0 — Un documento por vehículo.
// Firestore se simula DENTRO de la página (fetch interceptado): commit con hora del
// servidor, GET de documentos y runQuery por `serverTs`. Recorre: guardar sube solo lo
// que cambió; un vehículo de "otro equipo" llega solo; la copia completa que ya no
// cabe no asusta con un toast y avisa por los equipos sin actualizar; Datos → Sistema
// explica el modelo nuevo.
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

    await page.evaluate(() => {
        const docs = {};
        let clock = Date.now();
        window.__srv = docs;
        window.__toasts = [];
        const _t = window.showToast;
        window.showToast = function(m, type) { window.__toasts.push(String(m)); return _t.apply(this, arguments); };
        const R = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status }));
        const nombre = url => url.replace('https://firestore.googleapis.com/v1/', '').replace(/\?.*$/, '').split('/').map(decodeURIComponent).join('/');
        window.__put = (name, fields) => { docs[name] = { name, fields: Object.assign({}, fields, { serverTs: { timestampValue: new Date(clock).toISOString() } }) }; clock += 1000; };
        window.fetch = (url, init) => {
            init = init || {};
            if (/:commit\?/.test(url)) {
                const ts = new Date(clock).toISOString(); clock += 1000;
                JSON.parse(init.body).writes.forEach(w => {
                    const f = Object.assign({}, w.update.fields);
                    (w.updateTransforms || []).forEach(t => { f[t.fieldPath] = { timestampValue: ts }; });
                    docs[w.update.name] = { name: w.update.name, fields: f };
                });
                return R(200, {});
            }
            if (/:runQuery\?/.test(url)) {
                const q = JSON.parse(init.body).structuredQuery;
                const parent = nombre(url).replace(/:runQuery$/, '');
                const since = q.where ? Date.parse(q.where.fieldFilter.value.timestampValue) : 0;
                const rows = Object.keys(docs).filter(n => n.indexOf(parent + '/' + q.from[0].collectionId + '/') === 0)
                    .map(n => docs[n]).filter(d => !since || Date.parse(d.fields.serverTs.timestampValue) >= since).map(d => ({ document: d }));
                return R(200, rows.length ? rows : [{ readTime: new Date(clock).toISOString() }]);
            }
            if ((init.method || 'GET') === 'GET') {
                const n = nombre(url);
                return docs[n] ? R(200, docs[n]) : R(404, { error: { message: 'Document not found.' } });
            }
            return R(400, {});
        };
        fbSync.enabled = true; fbSync.stationId = 'KIA-EMLAB';
        fbSyncModules.cop15 = true;
        window.__vehDocs = () => Object.keys(docs).filter(n => /\/vehicles\//.test(n));
    });

    console.log('\n== Guardar sube los vehículos uno por uno ==');
    const alta = await page.evaluate(async () => {
        const c = allConfigurations[0];
        const mk = (id, vin) => ({ id, vin, status: 'in-progress', purpose: 'COP-Emisiones', configCode: c.codigo_config_text,
            config: Object.assign({}, c), registeredAt: new Date().toISOString(), timeline: [], testData: {} });
        db.vehicles = [mk('e1', '3KPFT51B7TE400001'), mk('e2', '3KPFT51B7TE400002')];
        saveDB();
        await new Promise(r => setTimeout(r, 3800));
        const primera = window.__vehDocs().length;
        db.vehicles[1].testData.odometer = 77; saveDB();
        await new Promise(r => setTimeout(r, 3800));
        const d2 = window.__srv[window.__vehDocs().find(n => /v_e2$/.test(n))];
        return { primera, total: window.__vehDocs().length, odo: JSON.parse(d2.fields.json.stringValue).testData.odometer,
                 meta: Object.keys(window.__srv).some(n => /cop15meta\/current$/.test(n)), st: fbVehStatus() };
    });
    chk('al guardar suben los 2 vehículos y cop15meta', alta.primera === 2 && alta.meta, JSON.stringify(alta));
    chk('una edición actualiza SU documento (no crea otro)', alta.total === 2 && alta.odo === 77, JSON.stringify(alta));
    chk('nada pendiente', alta.st.pending === 0 && !alta.st.lastError, JSON.stringify(alta.st));

    console.log('\n== Un vehículo de otro equipo llega solo ==');
    const otro = await page.evaluate(async () => {
        const base = 'projects/' + FIREBASE_CONFIG.projectId + '/databases/(default)/documents/stations/KIA-EMLAB/';
        const c = allConfigurations[0];
        const v = { id: 'x9', vin: '3KPFT51B7TE409999', status: 'in-progress', purpose: 'COP-Emisiones', configCode: c.codigo_config_text,
            config: Object.assign({}, c), registeredAt: new Date().toISOString(), timeline: [{ timestamp: new Date().toISOString(), action: 'Alta en otro equipo' }],
            testData: {}, updatedAt: new Date().toISOString(), _rev: 'otro' };
        window.__put(base + 'vehicles/v_x9', { json: { stringValue: JSON.stringify(v) }, vin: { stringValue: v.vin }, id: { stringValue: 'x9' },
            rev: { stringValue: 'otro' }, deleted: { booleanValue: false }, writer: { stringValue: 'dev_otro' } });
        const r = await fbVehiclesSync();
        return { r, esta: db.vehicles.some(x => x.vin === v.vin), toast: window.__toasts.some(t => /actualizado desde otro dispositivo/.test(t)),
                 guardado: JSON.parse(localStorage.getItem('kia_db_v11')).vehicles.some(x => x.vin === v.vin) };
    });
    chk('el vehículo del otro equipo aparece en este', otro.esta && otro.guardado, JSON.stringify(otro));
    chk('con el aviso de "actualizado desde otro dispositivo"', otro.toast);

    console.log('\n== [3.0.0] La copia completa está retirada ==');
    const lleno = await page.evaluate(async () => {
        window.__toasts = [];
        const _chk = window.fbQuotaCheckSize;
        let midio = false;
        window.fbQuotaCheckSize = (d, col) => { if (col === 'cop15') midio = true; return _chk(d, col); };
        fbPush('cop15', db);
        window.fbQuotaCheckSize = _chk;
        fbSyncCapacityInvalidate();
        const al = pnGetActiveAlerts().filter(a => a.source === 'Sincronización').map(a => a.message);
        return { toasts: window.__toasts.slice(), al, midio };
    });
    chk('fbPush("cop15") ya no intenta subir la copia (ni la mide)', !lleno.midio && !lleno.toasts.some(t => /No se pudo subir cop15/.test(t)), JSON.stringify(lleno));
    chk('sin alerta de copia completa', !lleno.al.some(m => /copia completa|Ya NO se sube/.test(m)), JSON.stringify(lleno.al));

    console.log('\n== Datos → Sistema ==');
    const sis = await page.evaluate(async () => {
        switchPlatform('panel'); pnSwitchTab('pn-system');
        await new Promise(r => setTimeout(r, 700));
        return document.getElementById('platform-panel').innerText;
    });
    chk('explica que cada vehículo viaja en su documento', /Cada vehículo viaja en su propio documento/.test(sis), sis.slice(0, 400));
    chk('[3.0.0] Capacidad ya no lista la copia completa', !/Copia completa de vehículos/.test(sis));
    chk('y mide el vehículo más pesado', /Vehículo más pesado/.test(sis));
    chk('ya no cuenta "caben ~N vehículos más"', !/caben ~/.test(sis));
    chk('no dice que este equipo dejó de subir', !/Hay módulos que ya no se están subiendo/.test(sis));

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
