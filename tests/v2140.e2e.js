// Verificación en navegador de 2.14.0 — ¿Se guardó? ¿Lo ven los demás?
// Firestore simulado DENTRO de la página (fetch interceptado, como v290): commit con hora
// del servidor, GET/PATCH de documentos, listado de una colección y runQuery por
// `serverTs`. Sin red (context.setOffline) el fetch falso falla, como el de verdad.
// Recorre, en un teléfono de 427×840: el chip ☁ de Operación pasa de ⏳ a ☁; un cambio
// de otro equipo dice de cuál; sin conexión lo dice y el indicador cuenta lo pendiente;
// la hoja del indicador lista el VIN y "Intentar ahora" lo sube; el nombre del equipo
// se registra; Datos → Sistema lista los equipos; el Historial calla lo que ya está.
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
        operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 't1', name: 'Beto Técnico', role: 'Técnico', active: true },
                    { id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    localStorage.setItem('kia_ui_prefs', JSON.stringify({ cardMode: false }));
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

const espera = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
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
        window.showToast = function(m) { window.__toasts.push(String(m)); return _t.apply(this, arguments); };
        const R = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status }));
        const nombre = url => url.replace('https://firestore.googleapis.com/v1/', '').replace(/\?.*$/, '').split('/').map(decodeURIComponent).join('/');
        window.__base = 'projects/' + FIREBASE_CONFIG.projectId + '/databases/(default)/documents/stations/KIA-EMLAB/';
        window.__put = (name, fields) => { docs[name] = { name, fields: Object.assign({}, fields, { serverTs: { timestampValue: new Date(clock).toISOString() } }) }; clock += 1000; };
        window.fetch = (url, init) => {
            init = init || {};
            if (!navigator.onLine) return Promise.reject(new TypeError('Failed to fetch'));
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
            const n = nombre(url);
            if (init.method === 'PATCH') {
                docs[n] = { name: n, fields: JSON.parse(init.body).fields };
                return R(200, docs[n]);
            }
            if ((init.method || 'GET') === 'GET') {
                if (docs[n]) return R(200, docs[n]);
                const hijos = Object.keys(docs).filter(k => k.indexOf(n + '/') === 0 && k.split('/').length === n.split('/').length + 1);
                if (hijos.length) return R(200, { documents: hijos.map(k => docs[k]) });
                return R(404, { error: { message: 'Document not found.' } });
            }
            return R(400, {});
        };
        fbSync.enabled = true; fbSync.stationId = 'KIA-EMLAB';
        fbSyncModules.cop15 = true;
    });

    console.log('\n== Operación: el chip pasa de ⏳ a ☁ ==');
    const id1 = await page.evaluate(() => {
        const c = allConfigurations.find(x => x['EMISSION REGULATION'] === 'EURO-5') || allConfigurations[0];
        const id = nextVehicleId();
        db.vehicles.push({ id, vin: '3KPFT51B7TE402222', status: 'in-progress', purpose: 'COP-Emisiones', configCode: c.codigo_config_text,
            config: Object.assign({}, c), registeredAt: new Date().toISOString(), timeline: [], testData: {} });
        saveDB(); refreshAllLists();
        return id;
    });
    await page.evaluate((id) => cascadeOpenInOperation(id), id1);
    await page.waitForTimeout(700);
    const c0 = await page.evaluate(() => {
        const el = document.querySelector('#vehicleInfo [data-veh-cloud]');
        return el ? { st: el.getAttribute('data-state'), tx: el.innerText } : null;
    });
    chk('Operación lleva el chip, recién guardado: por subir', c0 && c0.st === 'por-subir' && /Por subir/.test(c0.tx), JSON.stringify(c0));
    await page.waitForTimeout(3800);
    const c1 = await page.evaluate(() => {
        const el = document.querySelector('#vehicleInfo [data-veh-cloud]');
        return { st: el.getAttribute('data-state'), tx: el.innerText, docs: Object.keys(window.__srv).filter(n => /\/vehicles\//.test(n)).length };
    });
    chk('tras el ciclo: en la nube con hora, sin "desde" (lo subió este equipo)',
        c1.st === 'nube' && /^☁\s*En la nube · \d{2}:\d{2}$/.test(c1.tx.trim()) && c1.docs === 1, JSON.stringify(c1));
    const beat = await page.evaluate(() => Object.keys(window.__srv).some(n => n === window.__base + 'devices/' + FB_DEVICE_ID));
    chk('este equipo se registró en devices/ tras el ciclo', beat);

    console.log('\n== Un cambio de otro equipo dice de cuál ==');
    const remoto = await page.evaluate(async (id) => {
        window.__put(window.__base + 'devices/dev_otro', { name: { stringValue: 'Tablet celda 2' }, version: { stringValue: APP_VERSION },   // la versión que corre: "al día" (un literal caducaba en cada versión)
            lastSeen: { stringValue: new Date().toISOString() } });
        const v = JSON.parse(JSON.stringify(db.vehicles.find(x => x.id === id)));
        // Como lo sella el otro equipo: huella = contenido (si no, este equipo la re-subiría como suya).
        v.testData.odometer = 4321; v.updatedAt = new Date(Date.now() + 60000).toISOString(); v._rev = revContentHash(v);
        window.__put(window.__base + 'vehicles/' + fbVehDocId(v), { json: { stringValue: JSON.stringify(v) }, vin: { stringValue: v.vin },
            id: { stringValue: String(v.id) }, rev: { stringValue: v._rev }, deleted: { booleanValue: false }, writer: { stringValue: 'dev_otro' } });
        await fbDevicesLoad();
        await fbVehiclesSync();
        await new Promise(r => setTimeout(r, 400));
        const el = document.querySelector('#vehicleInfo [data-veh-cloud]');
        return { tx: el.innerText, odo: db.vehicles.find(x => x.id === id).testData.odometer };
    }, id1);
    chk('llegó el dato del otro equipo', String(remoto.odo) === '4321', JSON.stringify(remoto));
    chk('y el chip dice "desde Tablet celda 2"', /En la nube · \d{2}:\d{2} · desde Tablet celda 2/.test(remoto.tx), remoto.tx);

    console.log('\n== Sin conexión: lo dice, y el indicador cuenta lo pendiente ==');
    await ctx.setOffline(true);
    await page.evaluate((id) => { db.vehicles.find(x => x.id === id).testData.odometer = 5000; saveDB(); }, id1);
    await page.waitForTimeout(3800);
    const off = await page.evaluate(() => {
        const el = document.querySelector('#vehicleInfo [data-veh-cloud]');
        return { st: el.getAttribute('data-state'), tx: el.innerText, ind: document.getElementById('fb-sync-indicator').innerText };
    });
    chk('el chip dice "Sin subir: sin conexión"', off.st === 'error' && /Sin subir: sin conexión/.test(off.tx), JSON.stringify(off));
    chk('el indicador de arriba cuenta "1 por subir"', /1 por subir/.test(off.ind), off.ind);

    console.log('\n== La hoja del indicador ==');
    await page.evaluate(() => { const el = document.getElementById('fb-sync-indicator'); el.onclick ? el.onclick() : el.click(); });
    await page.waitForTimeout(400);
    const hoja = await page.evaluate(() => {
        const m = document.getElementById('globalModal');
        const b = m && m.querySelector('[data-fb-sheet-retry]');
        return { open: !!m, tx: m ? m.innerText : '', retryOff: b ? (b.disabled && /conexión/.test(b.getAttribute('data-why') || '')) : null,
                 name: !!document.getElementById('fb-sheet-name-in') };
    });
    chk('se abre en palabras: sin conexión y el VIN pendiente', hoja.open && /Sin conexión/.test(hoja.tx) && /3KPFT51B7TE402222/.test(hoja.tx), hoja.tx.slice(0, 300));
    chk('"Intentar ahora" deshabilitado y explicado sin red', hoja.retryOff === true, String(hoja.retryOff));
    chk('pide ponerle nombre al equipo', hoja.name);
    await ctx.setOffline(false);
    await page.waitForTimeout(400);
    await page.fill('#fb-sheet-name-in', 'PC Laboratorio');
    await page.click('.fb-sheet-name button');
    await page.waitForTimeout(600);
    const nom = await page.evaluate(() => {
        const d = window.__srv[window.__base + 'devices/' + FB_DEVICE_ID];
        return { name: d && d.fields.name && d.fields.name.stringValue, ver: d && d.fields.version && d.fields.version.stringValue };
    });
    chk('el nombre se guarda en el registro de equipos con la versión', nom.name === 'PC Laboratorio' && nom.ver === APP_VERSION_NODE(), JSON.stringify(nom));
    await page.click('#globalModal [data-fb-sheet-retry]');
    await page.waitForTimeout(1200);
    const tras = await page.evaluate(() => ({
        hoja: (document.getElementById('fb-sheet') || {}).innerText || '',
        chip: document.querySelector('#vehicleInfo [data-veh-cloud]').getAttribute('data-state'),
        toast: window.__toasts.slice(-3).join(' | '),
        ind: document.getElementById('fb-sync-indicator').innerText }));
    chk('"Intentar ahora" lo sube y la hoja lo dice', /Todo lo de este equipo está en la nube/.test(tras.hoja) && tras.chip === 'nube', JSON.stringify(tras));
    // El regreso de la red también dispara un ciclo: puede que al tocar ya estuviera arriba.
    chk('con un aviso de lo que pasó', /Listo: (se subi|todo estaba al día)/.test(tras.toast), tras.toast);
    chk('el indicador ya no cuenta pendientes', !/por subir/.test(tras.ind), tras.ind);
    await page.evaluate(() => { const m = document.getElementById('globalModal'); if (m) m.remove(); });

    console.log('\n== Modo tarjetas: el chip va en el encabezado ==');
    const oc = await page.evaluate(async () => {
        opCardsEnter();
        await new Promise(r => setTimeout(r, 300));
        const el = document.querySelector('#oc-head [data-veh-cloud]');
        const r = el ? { st: el.getAttribute('data-state'), label: el.getAttribute('aria-label'), w: el.getBoundingClientRect().width } : null;
        opCardsExit({ keepPref: true });
        return r;
    });
    chk('compacto (solo ícono) y con su estado para lector de pantalla', oc && oc.st === 'nube' && /En la nube/.test(oc.label) && oc.w < 60, JSON.stringify(oc));

    console.log('\n== Historial: solo avisa lo que NO está en la nube ==');
    const hist = await page.evaluate(async () => {
        const c = allConfigurations[0];
        const mk = (vin) => ({ id: nextVehicleId(), vin, status: 'archived', purpose: 'COP-Emisiones', configCode: c.codigo_config_text,
            config: Object.assign({}, c), registeredAt: new Date().toISOString(), archivedAt: new Date().toISOString(), timeline: [], testData: {} });
        db.vehicles.push(mk('3KPFT51B7TE403333'));
        saveDB();
        await fbVehiclesSync();
        db.vehicles.push(mk('3KPFT51B7TE404444'));
        await new Promise(r => setTimeout(r, 50));
        dashGo('cop15', 'historial');
        await new Promise(r => setTimeout(r, 900));
        refreshAllLists();
        await new Promise(r => setTimeout(r, 400));
        const vis = vin => {
            const row = [...document.querySelectorAll('.hist-td-vin')].find(td => td.innerText.indexOf(vin) >= 0);
            const el = row && row.querySelector('[data-veh-cloud]');
            return el ? { st: el.getAttribute('data-state'), shown: getComputedStyle(el).display !== 'none' } : null;
        };
        return { arriba: vis('3KPFT51B7TE403333'), pend: vis('3KPFT51B7TE404444') };
    });
    chk('el que está en la nube no muestra nada', hist.arriba && hist.arriba.st === 'nube' && !hist.arriba.shown, JSON.stringify(hist));
    chk('el pendiente sí se ve', hist.pend && hist.pend.st === 'por-subir' && hist.pend.shown, JSON.stringify(hist));

    console.log('\n== Datos → Sistema: equipos del laboratorio ==');
    const sis = await page.evaluate(async () => {
        _fbWriterSeen('dev_viejo', 'mod');
        dashGo('panel', 'pn-system');
        await new Promise(r => setTimeout(r, 1200));
        const el = document.getElementById('pn-devices');
        return el ? el.innerText : '';
    });
    chk('lista este equipo por su nombre', /PC Laboratorio/.test(sis) && /este equipo/.test(sis), sis.slice(0, 300));
    chk('y al otro, al día', /Tablet celda 2/.test(sis) && /al día/.test(sis), sis.slice(0, 400));
    chk('un equipo que solo escribió copias completas queda "sin confirmar" y se advierte',
        /podría ser anterior a 2\.9\.0/.test(sis) && /1 equipo activo sin confirmar/.test(sis), sis);

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });

function APP_VERSION_NODE() {
    const src = require('fs').readFileSync(path.join(REPO, 'js', 'app.js'), 'utf8');
    return /var APP_VERSION = '([^']+)'/.exec(src)[1];
}
