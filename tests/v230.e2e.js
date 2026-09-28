// Verificación en navegador de 2.3.0 — capacidad de la nube y respaldo diario.
//  - Datos → Sistema muestra cuánto ocupa cada módulo en la nube y qué pesa en vehículos.
//  - Al 75 % sale una alerta "Sincronización".
//  - "Antigüedad de Datos" por fin cuenta (leía un campo que los vehículos no tienen).
//  - El botón "COP15 > 90 días" (que nunca borró nada) ya no está.
//  - El respaldo va por módulo y en fragmentos, el índice al final, y se restaura;
//    si falla, lo dice. Se prueba contra una Firestore simulada en memoria.
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
    const firma = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(780);   // ~8.5 KB: 42 vehículos ≈ los 753 KB reales
    const dia = 86400000, ahora = Date.now();
    const vehs = [];
    for (let i = 0; i < 42; i++) {
        const edad = i < 30 ? 5 : i < 36 ? 45 : i < 40 ? 75 : 120;   // 30 recientes, 6 de 30-60, 4 de 60-90, 2 de >90
        const alta = new Date(ahora - edad * dia).toISOString();
        vehs.push({
            id: 'v' + i, vin: 'KNA6BA1D5T10' + String(10000 + i), status: 'archived', purpose: 'COP-Emisiones',
            configCode: 'CFG' + (i % 5), registeredAt: alta,
            config: { Modelo: 'SELTOS', 'EMISSION REGULATION': 'EURO-6', REGION: 'EUROPE', 'BODY TYPE': '5DR' },
            timeline: [{ timestamp: alta, user: 'Ivan', action: 'Alta' }, { timestamp: alta, user: 'Ana', action: 'Liberado' }],
            testData: {
                operator: 'Ivan', etw: '1612.7', targetA: '102.5',
                signatures: { releaser: { signerName: 'Ana', dataUrl: firma }, approver: { signerName: 'Beto', dataUrl: firma } },
                gasResults: { liberador: { values: { CO: 0.19, NOx: 0.006 },
                    profile: { name: 'EURO-6', gases: [{ field: 'CO', label: 'CO', unit: 'g/km', limit: 1 }, { field: 'NOx', label: 'NOx', unit: 'g/km', limit: 0.06 }] } } }
            }
        });
    }
    localStorage.setItem('kia_db_v11', JSON.stringify({ vehicles: vehs, lastId: 42 }));
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'ana', operatorName: 'Ana Manager', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
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
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);

    console.log('\n== Capacidad de la nube ==');
    const cap = await page.evaluate(() => {
        const c = fbSyncCapacity(true);
        const cop = c.rows.find(r => r.col === 'cop15');
        return { pct: cop.pct, level: cop.level, left: c.vehiclesLeft, w: c.weight,
                 check: fbQuotaCheckSize(db, 'cop15') };
    });
    chk('mide el módulo de vehículos como documento de Firestore', cap.pct > 60 && cap.pct < 100, 'pct=' + cap.pct);
    chk('42 vehículos con dos firmas cada uno: las firmas son la mayor parte',
        cap.w.count === 42 && cap.w.images / cap.w.total > 0.8, JSON.stringify({ img: cap.w.images, tot: cap.w.total }));
    chk('estima cuántos vehículos caben todavía', typeof cap.left === 'number' && cap.left >= 0, 'left=' + cap.left);
    chk('ese tamaño todavía se sube', cap.check.allowed === true);

    const sinSync = await page.evaluate(() => pnGetActiveAlerts().filter(a => a.source === 'Sincronización').length);
    chk('un equipo con la sincronización apagada no recibe esa alerta', sinSync === 0, 'n=' + sinSync);
    const alertas = await page.evaluate(() => { fbSync.enabled = true; fbSyncCapacityInvalidate();
        const a = pnGetActiveAlerts().filter(x => x.source === 'Sincronización'); fbSync.enabled = false; return a; });
    chk('al pasar el 75 % sale una alerta "Sincronización"', cap.pct < 75 || alertas.length === 1, 'pct=' + cap.pct + ' n=' + alertas.length);
    if (alertas.length) chk('la alerta dice cuántos vehículos caben', /caben ~\d+ vehículos/.test(alertas[0].message), alertas[0].message);

    console.log('\n== Datos → Sistema ==');
    await page.evaluate(() => { switchPlatform('panel'); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { pnSwitchTab('pn-system'); });
    await page.waitForTimeout(800);
    const ui = await page.evaluate(() => {
        const cont = document.getElementById('platform-panel') || document.body;
        const txt = cont.innerText || '';
        const btns = [...cont.querySelectorAll('button')].map(b => b.textContent.trim());
        const aging = [...cont.querySelectorAll('table tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')).find(t => /COP15 Vehículos/.test(t)) || '';
        return { txt, sinBoton: !btns.some(t => /COP15 >90/.test(t)), aging };
    });
    chk('se ve la tarjeta "Capacidad de sincronización"', /Capacidad de sincronización/.test(ui.txt));
    chk('lista el módulo de vehículos con su %', /Vehículos \(COP15\)[\s\S]{0,40}\d+(\.\d)?% ·/.test(ui.txt));
    chk('desglosa lo que pesa (firmas)', /Firmas \(imágenes\)/.test(ui.txt));
    chk('dice cuántos vehículos caben', /caben ~\d+ vehículos más/.test(ui.txt));
    chk('"Antigüedad de Datos" ya cuenta (6 · 4 · 2)', /COP15 Vehículos 42 6 4 2/.test(ui.aging), ui.aging);
    chk('el botón "COP15 > 90 días" ya no está', ui.sinBoton);
    const purga = await page.evaluate(() => {
        const antes = db.vehicles.length; pnPurgeOldData('cop15', 90); return { antes, despues: db.vehicles.length };
    });
    chk('y la función no borra vehículos aunque la llamen', purga.antes === 42 && purga.despues === 42);

    console.log('\n== Respaldo diario contra una Firestore simulada ==');
    await page.evaluate(() => {
        // Firestore en memoria con la API que usa el respaldo.
        window.__fs = { store: {}, writes: [], fail: false };
        const S = window.__fs;
        const val = (o, f) => f.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
        const docRef = (p) => ({
            collection: (c) => colRef(p + '/' + c),
            set: (d) => S.fail ? Promise.reject(new Error('HTTP 403 simulado'))
                : (S.store[p] = JSON.parse(JSON.stringify(d)), S.writes.push(p), Promise.resolve()),
            get: () => Promise.resolve({ exists: p in S.store, id: p.split('/').pop(), data: () => S.store[p] }),
            delete: () => { delete S.store[p]; return Promise.resolve(); }
        });
        const colRef = (p, ord, lim) => ({
            doc: (id) => docRef(p + '/' + id),
            orderBy: (f, dir) => colRef(p, [f, dir], lim),
            limit: (n) => colRef(p, ord, n),
            get: () => {
                let ks = Object.keys(S.store).filter(k => k.indexOf(p + '/') === 0 && k.slice(p.length + 1).indexOf('/') < 0);
                if (ord) ks.sort((a, b) => { const x = val(S.store[a], ord[0]), y = val(S.store[b], ord[0]); return (x < y ? -1 : x > y ? 1 : 0) * (ord[1] === 'desc' ? -1 : 1); });
                if (lim) ks = ks.slice(0, lim);
                return Promise.resolve({ forEach: (fn) => ks.forEach(k => fn({ id: k.split('/').pop(), data: () => S.store[k] })) });
            }
        });
        fbSync.enabled = true; fbSync.stationId = 'KIA-EMLAB'; fbSync._useREST = false; fbSync._pullCompleted = true;
        fbSync.db = { collection: (c) => colRef(c) };
        window.fbBugsEnsureReady = () => ({ ok: true });
        fbShowSettings = function() {};
    });
    const corre = (opts) => page.evaluate((opts) => new Promise(res => fbBackupNow((ok, err, info) => res({ ok, err, info }), opts)), opts);

    let r = await corre();
    const hoy = await page.evaluate(() => localToday());
    const st = await page.evaluate((hoy) => {
        const S = window.__fs, base = 'stations/KIA-EMLAB/backups/' + hoy;
        const meta = S.store[base];
        const partes = Object.keys(S.store).filter(k => k.indexOf(base + '/parts/') === 0);
        const idxMeta = S.writes.indexOf(base);
        const ultimaParte = Math.max.apply(null, partes.map(k => S.writes.indexOf(k)));
        return { meta, partes: partes.length, metaAlFinal: idxMeta > ultimaParte,
                 dbChars: JSON.stringify(db).length };
    }, hoy);
    chk('el respaldo termina bien', r.ok === true, r.err);
    chk('un documento índice con formato 2 y completo', st.meta && st.meta.meta.format === 2 && st.meta.meta.complete === true);
    chk('respalda también Panel (y no solo 3 módulos)', st.meta && st.meta.meta.modules.panel !== undefined, JSON.stringify(Object.keys((st.meta || { meta: { modules: {} } }).meta.modules)));
    chk('vehículos van partidos en fragmentos de ≤300 000 caracteres',
        st.meta && st.meta.meta.modules.cop15.chunks === Math.ceil(st.dbChars / 300000), st.meta && JSON.stringify(st.meta.meta.modules.cop15));
    chk('el índice se escribe DESPUÉS de todos los fragmentos', st.metaAlFinal);
    chk('el índice conserva el resumen legible (vehículos)', st.meta && st.meta.cop15.vehicleCount === 42);

    r = await corre();
    chk('un segundo intento el mismo día no duplica (ya está completo)', r.ok && r.info.skipped === true);

    const lista = await page.evaluate(() => new Promise(res => fbBackupList(res)));
    chk('la lista lo muestra completo', lista.length === 1 && lista[0].complete === true && lista[0].format === 2, JSON.stringify(lista));

    const rest = await page.evaluate((hoy) => new Promise(res => {
        db.vehicles = db.vehicles.slice(0, 3);          // "se perdió" información
        fbBackupRestore(hoy, { cop15: true });
        setTimeout(() => res({ n: db.vehicles.length, snap: !!localStorage.getItem('kia_fb_prerestore_snapshot'),
            aud: (_auditEnsureLoaded() || []).some(a => a.action === 'respaldo_restaurado') }), 800);
    }), hoy);
    chk('restaurar devuelve los 42 vehículos', rest.n === 42, 'n=' + rest.n);
    chk('guarda la copia previa para deshacer', rest.snap);
    chk('la restauración queda en el historial de cambios', rest.aud);

    const viejo = await page.evaluate(() => {
        window.__fs.store['stations/KIA-EMLAB/backups/2026-09-01'] = { meta: { date: '2026-09-01' },
            cop15: { vehicleCount: 1, data: { vehicles: [{ vin: 'VIEJO' }] } } };
        return _fbBackupLoad('2026-09-01').then(d => d.cop15.vehicles[0].vin);
    });
    chk('lee también respaldos del formato anterior', viejo === 'VIEJO');

    const limpieza = await page.evaluate(() => new Promise(res => {
        const S = window.__fs.store;
        S['stations/KIA-EMLAB/backups/2024-01-15'] = { meta: { date: '2024-01-15', format: 2, complete: true, run: 'x', modules: {} } };
        S['stations/KIA-EMLAB/backups/2024-01-15/parts/x__cop15__0'] = { run: 'x', module: 'cop15', i: 0, n: 1, json: '{}' };
        localStorage.removeItem('kia_fb_backup_cleanup');
        fbBackupCleanup();
        setTimeout(() => res({
            meta: 'stations/KIA-EMLAB/backups/2024-01-15' in S,
            parte: 'stations/KIA-EMLAB/backups/2024-01-15/parts/x__cop15__0' in S,
            reciente: 'stations/KIA-EMLAB/backups/2026-09-01' in S
        }), 600);
    }));
    chk('la limpieza borra un respaldo de hace más de un año, con sus fragmentos', !limpieza.meta && !limpieza.parte, JSON.stringify(limpieza));
    chk('y conserva los recientes', limpieza.reciente);

    const falla = await page.evaluate(() => new Promise(res => {
        window.__fs.fail = true;
        localStorage.removeItem('kia_fb_last_backup'); localStorage.removeItem('kia_fb_backup_warned');
        fbBackupNow((ok, err) => {
            fbSyncCapacityInvalidate();
            res({ ok, err, estado: fbBackupStatus(),
                  alerta: pnGetActiveAlerts().filter(a => a.source === 'Respaldo').map(a => a.message) });
        }, { force: true });
    }));
    // El SDK simulado rechaza y el respaldo reintenta por REST, que sin red falla:
    // el motivo que queda es el último, en español y diciendo qué pasó.
    chk('si la nube rechaza, el respaldo NO se da por bueno', falla.ok === false && !!falla.err, falla.err);
    chk('el motivo sale en español, no "Failed to fetch"', !/Failed to fetch/.test(falla.err) && /conexión|permisos/.test(falla.err), falla.err);
    chk('queda como alerta "Respaldo" con el motivo', falla.alerta.length === 1 && falla.alerta[0].indexOf(falla.err) >= 0, JSON.stringify(falla.alerta));
    chk('el texto de estado lo dice', /falló/.test(falla.estado.text), falla.estado.text);

    chk('sin errores de página', errores.length === 0, errores.slice(0, 3).join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' fallaron' : 'todo ok'));
    if (fallos.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
