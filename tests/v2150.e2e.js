// Verificación en navegador de 2.15.0 — Avisos de relevo ("te toca a ti").
// Firestore simulado dentro de la página (como v290/v2140). Un cambio de OTRO equipo llega
// por el ciclo de vehículos: a quien puede aprobar le avisa "espera tu aprobación" (toast
// con "Abrir", insignia y renglón en el centro), y tocarlo abre Liberación → Aprobación con
// ese vehículo. A un Practicante no le llega nada. A quien liberó le avisa "Te devolvieron…".
// La preferencia Todos / Solo los míos / Ninguno vive en el centro y se respeta.
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

const OPS = [
    { id: 's1', name: 'Ana Signataria', role: 'Signatario', active: true },
    { id: 't1', name: 'Beto Técnico', role: 'Técnico', active: true },
    { id: 'p1', name: 'Pepe Practicante', role: 'Practicante', active: true },
    { id: 'm1', name: 'Mara Manager', role: 'Assistant Manager / Manager', active: true }
];
const SEED = (op) => {
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: op.id, operatorName: op.name, expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: op.ops, tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    localStorage.setItem('kia_ui_prefs', JSON.stringify({ cardMode: false }));
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

async function abrir(browser, op, errores) {
    const ctx = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => errores.push(op.name + ': ' + e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED, Object.assign({ ops: OPS }, op));
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
        const docs = {};
        let clock = Date.now();
        window.__toasts = [];
        const _t = window.showToast;
        window.showToast = function(m) { window.__toasts.push(String(m)); return _t.apply(this, arguments); };
        const R = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status }));
        const nombre = url => url.replace('https://firestore.googleapis.com/v1/', '').replace(/\?.*$/, '').split('/').map(decodeURIComponent).join('/');
        window.__base = 'projects/' + FIREBASE_CONFIG.projectId + '/databases/(default)/documents/stations/KIA-EMLAB/';
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
            const n = nombre(url);
            if (init.method === 'PATCH') { docs[n] = { name: n, fields: JSON.parse(init.body).fields }; return R(200, docs[n]); }
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
        // Un cambio de OTRO equipo: la copia sellada como la sellaría él y subida a la nube.
        window.__remoto = async (v) => {
            v.updatedAt = new Date(Date.now() + 60000).toISOString();
            v._rev = revContentHash(v);
            window.__put(window.__base + 'vehicles/' + fbVehDocId(v), { json: { stringValue: JSON.stringify(v) }, vin: { stringValue: v.vin },
                id: { stringValue: String(v.id) }, rev: { stringValue: v._rev }, deleted: { booleanValue: false }, writer: { stringValue: 'dev_otro' } });
            await fbVehiclesSync();
            await new Promise(r => setTimeout(r, 700));
        };
        window.__nuevo = (vin, status, extra) => {
            const c = allConfigurations.find(x => x['EMISSION REGULATION'] === 'EURO-5') || allConfigurations[0];
            const v = Object.assign({ id: nextVehicleId(), vin, status, purpose: 'COP-Emisiones', configCode: c.codigo_config_text,
                config: Object.assign({}, c), registeredAt: new Date().toISOString(), timeline: [], testData: {} }, extra || {});
            db.vehicles.push(v); saveDB(); refreshAllLists();
            return v;
        };
    });
    return { ctx, page };
}

const liberar = (v, quien) => {
    v.status = 'pending-approval';
    v.testData.signatures = { releaser: { signerName: quien, sessionUserName: quien, signedAt: new Date().toISOString() } };
    v.testData.gasResults = { liberador: { values: { CO: 0.1 }, capturedBy: quien, capturedAt: new Date().toISOString() } };
    return v;
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const errores = [];

    console.log('\n== Signatario: "espera tu aprobación" desde otro equipo ==');
    const A = await abrir(browser, OPS[0], errores);
    const r1 = await A.page.evaluate(async (liberarSrc) => {
        const liberar = eval('(' + liberarSrc + ')');
        const v = window.__nuevo('3KPFT51B7TE405555', 'ready-release');
        await new Promise(r => setTimeout(r, 3500));   // el ciclo propio termina; esto no avisa (lo hizo este equipo)
        const antes = handoffLogItems().length;
        const remoto = liberar(JSON.parse(JSON.stringify(db.vehicles.find(x => x.id === v.id))), 'Beto Técnico');
        await window.__remoto(remoto);
        const badge = document.getElementById('notif-badge');
        return { id: v.id, antes, items: handoffLogItems().map(i => i.message), status: db.vehicles.find(x => x.id === v.id).status,
                 badge: badge.hidden ? '' : badge.textContent, toast: window.__toasts.filter(t => /espera tu aprobación/.test(t)).length,
                 abrir: [...document.querySelectorAll('.toast .toast-undo')].some(b => b.textContent === 'Abrir') };
    }, liberar.toString());
    chk('el cambio local no avisa (lo hizo este equipo)', r1.antes === 0, JSON.stringify(r1));
    chk('llega el vehículo en aprobación', r1.status === 'pending-approval', r1.status);
    chk('un aviso "…05555 espera tu aprobación · Lo liberó Beto"', r1.items.length === 1 && /…TE405555 espera tu aprobación/.test(r1.items[0]) && /Beto Técnico/.test(r1.items[0]), JSON.stringify(r1.items));
    chk('con insignia en la campana', r1.badge === '1', r1.badge);
    chk('y un toast con "Abrir" (una sola vez)', r1.toast === 1 && r1.abrir, JSON.stringify(r1));

    const centro = await A.page.evaluate(() => {
        toggleNotificationCenter();
        const el = document.getElementById('notification-list');
        return { txt: el.innerText, handoff: el.querySelectorAll('.notif-handoff').length, modes: el.querySelectorAll('.notif-mode').length };
    });
    chk('el centro lo lista con "toca para abrir" y la preferencia de avisos', centro.handoff === 1 && /toca para abrir/.test(centro.txt) && centro.modes === 3, centro.txt.slice(0, 300));
    chk('el centro dice que llegan con la app abierta', /con la app abierta/.test(centro.txt));
    await A.page.click('.notif-handoff');
    await A.page.waitForTimeout(900);
    const abierto = await A.page.evaluate((id) => ({
        panel: getComputedStyle(document.getElementById('lib-panel-aprobador')).display,
        sel: document.getElementById('approvalVehSelect').value,
        content: getComputedStyle(document.getElementById('appr-content')).display,
        badge: document.getElementById('notif-badge').hidden,
        tab: (document.querySelector('.tab.active') || {}).getAttribute ? document.querySelector('.tab.active').getAttribute('data-tab') : ''
    }), r1.id);
    chk('tocarlo abre Liberación → Aprobación con ESE vehículo', abierto.tab === 'liberacion' && abierto.panel !== 'none' && abierto.sel === String(r1.id) && abierto.content !== 'none', JSON.stringify(abierto));
    chk('y queda leído (la insignia se apaga)', abierto.badge === true);

    console.log('\n== Preferencia: "Ninguno" apaga ==');
    const pref = await A.page.evaluate(async (liberarSrc) => {
        const liberar = eval('(' + liberarSrc + ')');
        toggleNotificationCenter();
        document.querySelectorAll('.notif-mode')[2].click();
        const modo = uiPref('handoff');
        const on = document.querySelector('.notif-mode.is-on').textContent;
        toggleNotificationCenter();
        const v = window.__nuevo('3KPFT51B7TE406666', 'ready-release');
        await new Promise(r => setTimeout(r, 3500));
        await window.__remoto(liberar(JSON.parse(JSON.stringify(db.vehicles.find(x => x.id === v.id))), 'Beto Técnico'));
        const n = handoffLogItems().length;
        handoffSetMode('todos');
        return { modo, on, n };
    }, liberar.toString());
    chk('elegir "Ninguno" se guarda y se marca', pref.modo === 'ninguno' && pref.on === 'Ninguno', JSON.stringify(pref));
    chk('con "Ninguno" no llega el aviso', pref.n === 1, JSON.stringify(pref));

    console.log('\n== Practicante: el mismo cambio no le llega ==');
    const P = await abrir(browser, OPS[2], errores);
    const rp = await P.page.evaluate(async (liberarSrc) => {
        const liberar = eval('(' + liberarSrc + ')');
        const v = window.__nuevo('3KPFT51B7TE407777', 'ready-release');
        await new Promise(r => setTimeout(r, 3500));
        await window.__remoto(liberar(JSON.parse(JSON.stringify(db.vehicles.find(x => x.id === v.id))), 'Beto Técnico'));
        return { n: handoffLogItems().length, llego: db.vehicles.find(x => x.id === v.id).status };
    }, liberar.toString());
    chk('el vehículo sí llega, el aviso no (no puede aprobar)', rp.llego === 'pending-approval' && rp.n === 0, JSON.stringify(rp));

    console.log('\n== Técnico que liberó: "Te devolvieron…" ==');
    const T = await abrir(browser, OPS[1], errores);
    const rt = await T.page.evaluate(async (liberarSrc) => {
        const liberar = eval('(' + liberarSrc + ')');
        const v = window.__nuevo('3KPFT51B7TE408888', 'ready-release');
        liberar(v, 'Beto Técnico'); saveDB();
        await new Promise(r => setTimeout(r, 3500));
        const antes = handoffLogItems().length;
        const dev = JSON.parse(JSON.stringify(v));
        dev.status = 'ready-release';
        delete dev.testData.signatures.releaser; delete dev.testData.gasResults.liberador;
        dev.pendingReturn = { at: new Date().toISOString(), by: 'Ana Signataria', reason: 'Falta la foto del odómetro' };
        await window.__remoto(dev);
        const it = handoffLogItems();
        return { antes, items: it.map(i => i.message), id: v.id };
    }, liberar.toString());
    chk('liberar uno mismo no se avisa', rt.antes === 0, JSON.stringify(rt));
    chk('"Te devolvieron …08888: Falta la foto del odómetro · Lo devolvió Ana"',
        rt.items.length === 1 && /Te devolvieron …TE408888: Falta la foto del odómetro/.test(rt.items[0]) && /Ana Signataria/.test(rt.items[0]), JSON.stringify(rt.items));
    await T.page.evaluate(() => { toggleNotificationCenter(); document.querySelector('.notif-handoff').click(); });
    await T.page.waitForTimeout(900);
    const rel = await T.page.evaluate(() => ({ sel: document.getElementById('releaseVehSelect').value,
        panel: getComputedStyle(document.getElementById('lib-panel-liberador')).display }));
    chk('tocarlo abre Liberación con ese vehículo para corregir', rel.sel === String(rt.id) && rel.panel !== 'none', JSON.stringify(rel));

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
