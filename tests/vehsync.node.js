// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Vehículos uno por uno (2.9.0)                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Código REAL de app.js (revisiones, marcas de borrado) y firebase-sync.js (motor de
// fusión + ciclo por vehículo) en dos "equipos", cada uno en su propio `vm`, contra un
// Firestore falso: commit con la hora del servidor, GET de documentos y runQuery con
// filtro por `serverTs`.

process.env.TZ = process.env.TZ || 'America/Mexico_City';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const SRC = { app: read('app.js'), fb: read('firebase-sync.js') };

function extraer(src, nombre) {
    const re = new RegExp('(?:^|\\n)([ \\t]*)function\\s+' + nombre + '\\s*\\(');
    const m = re.exec(src);
    if (!m) throw new Error('no encontre function ' + nombre);
    let i = src.indexOf('{', m.index + m[0].length - 1);
    let d = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) break; }
    }
    return src.slice(m.index + (src[m.index] === '\n' ? 1 : 0), i + 1);
}
function constante(src, nombre) {
    const m = new RegExp('\\nvar ' + nombre + ' = [^;]+;').exec(src);
    if (!m) throw new Error('no encontre var ' + nombre);
    return m[0];
}
const bloque = (src, desde) => { const a = src.indexOf(desde); if (a < 0) throw new Error('no encontre ' + desde); return src.slice(a); };

const APP_FNS = ['stableStringify', 'strHash', 'revContentHash', 'stampRevisions', 'revInitMissing',
    '_vehTombKey', 'vehicleIsTombstoned', 'vehicleTombstonesUnion', 'vehicleTombstone', 'vehicleTombstonesApply', 'vehicleCopyKey', 'vehicleCollapseCopies', '_vehicleIdRemapPlan', '_vehicleIdRepairRefs'];
const FB_FNS = ['_fbTestedKey', '_fbPlanKey', '_fbPlanItemKey', '_fbMergePaStatus', '_fbUnionLog',
    '_fbVehTime', '_fbMergeVehicle', '_fbModuleFingerprint', '_fbLocalHasExtras', '_fbPushBack',
    '_fbLiveToast', '_fbAfterAutoMerge', 'fbAutoMerge', 'fbMergeAnalyze', 'fbMergeExecute', 'fbAssignInPlace',
    '_fbEquipKey', '_fbMergeReadings', '_fbTombsNewTo', '_fbPullMergeModule', '_fbPullSeed', '_fbPullLocalScore',
    'fbToFirestoreValue', 'fbFromFirestoreValue', '_fbBugsRestDocToObj', '_fbBugsRestUrl', '_fbBugsRestSend',
    '_fbBkErrText', '_fbBkIsNotFound', '_fbAuditBase', '_fbAuditStation', '_fbStationDocName', '_fbAuditCommit',
    '_fbAuditAlreadyThere', '_fbUtf8Bytes', 'fbSizeBlockToast'];
const FB_VARS = ['FB_LIVE_TOAST_MS', 'FB_PUSHBACK_DELAY_MS', 'FB_PUSHBACK_WINDOW_MS', 'FB_PUSHBACK_MAX', '_fbLive'];

// ── Firestore falso ──────────────────────────────────────────────────────
function servidor() {
    const S = { docs: {}, clock: Date.parse('2026-09-28T12:00:00.000Z'), commits: 0, writes: 0, queries: 0, fail: 0 };
    const resp = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status,
        json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
    const nombre = url => url.replace('https://firestore.googleapis.com/v1/', '').replace(/\?.*$/, '').split('/').map(decodeURIComponent).join('/');
    S.avanzar = ms => { S.clock += ms; };
    S.fetch = (url, init) => {
        init = init || {};
        if (S.fail > 0) { S.fail--; return Promise.reject(new Error('Failed to fetch')); }
        if (/:commit\?/.test(url)) {
            S.commits++;
            const body = JSON.parse(init.body);
            const ts = new Date(S.clock).toISOString();
            S.clock += 1000;
            body.writes.forEach(w => {
                // Como Firestore: con updateMask solo se escriben esos campos; el resto del documento se queda.
                const base = w.updateMask && S.docs[w.update.name] ? S.docs[w.update.name].fields : {};
                const f = Object.assign({}, base, w.update.fields);
                (w.updateTransforms || []).forEach(t => { f[t.fieldPath] = { timestampValue: ts }; });
                S.docs[w.update.name] = { name: w.update.name, fields: f };
                S.writes++;
            });
            return resp(200, {});
        }
        if (/:runQuery\?/.test(url)) {
            S.queries++;
            const q = JSON.parse(init.body).structuredQuery;
            const parent = nombre(url).replace(/:runQuery$/, '');
            const col = q.from[0].collectionId;
            let since = 0;
            if (q.where) since = Date.parse(q.where.fieldFilter.value.timestampValue);
            const rows = Object.keys(S.docs).filter(n => n.indexOf(parent + '/' + col + '/') === 0 && n.split('/').length === parent.split('/').length + 2)
                .map(n => S.docs[n])
                .filter(d => !since || Date.parse(d.fields.serverTs.timestampValue) >= since)
                .map(d => ({ document: d }));
            return resp(200, rows.length ? rows : [{ readTime: new Date(S.clock).toISOString() }]);
        }
        if ((init.method || 'GET') === 'GET') {
            const n = nombre(url);
            return S.docs[n] ? resp(200, S.docs[n]) : resp(404, { error: { status: 'NOT_FOUND', message: 'Document "' + n + '" not found.' } });
        }
        return resp(400, { error: { message: 'no' } });
    };
    S.vehDocs = () => Object.keys(S.docs).filter(n => /\/vehicles\//.test(n)).map(n => S.docs[n]);
    return S;
}

function equipo(srv, id, opts) {
    opts = opts || {};
    const store = {};
    // [2.35.0] Un equipo de prueba está "al día" salvo que se pida atrasado (opts.lastOkAt).
    store.kia_fb_veh_known = JSON.stringify({ docs: {}, lastOkAt: opts.lastOkAt !== undefined ? opts.lastOkAt : new Date().toISOString() });
    const ui = { modals: [], toasts: [], undo: null, indicator: 0 };
    const ctx = {
        console, JSON, Object, Array, String, Number, Math, Date, RegExp, Error, isNaN, parseInt, parseFloat, Promise,
        encodeURIComponent, unescape,
        setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        fetch: (u, i) => srv.fetch(u, i),
        refreshAllLists() {}, updateProgressBar() {}, _fbTpUISync() {}, invRender() {}, showToast(m) { ui.toasts.push(m); },
        showModal(o) { ui.modals.push(o); }, toastUndo(m, fn) { ui.toasts.push(m); ui.undo = fn; },
        fbUpdateIndicator() { ui.indicator++; }, auditLog() {},
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
        fbQuotaCheck: () => ({ allowed: true }), fbQuotaRecord() {}, fbSyncCapacityInvalidate() {},
        _fbIdTokenPromise: () => Promise.resolve('tok'),
        FIREBASE_CONFIG: { projectId: 'p', apiKey: 'k' },
        FB_DEVICE_ID: id, fbSyncModules: { cop15: true, testplan: true, inventory: true },
        fbSync: { enabled: true, stationId: 'KIA-EMLAB', _pullCompleted: true },
        db: { version: '11.0', vehicles: [], lastId: 0 }, tpState: {}, invState: {}
    };
    if (opts.vehicles) ctx.db.vehicles = opts.vehicles;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    APP_FNS.forEach(n => vm.runInContext(extraer(SRC.app, n), ctx));
    vm.runInContext(constante(SRC.app, 'VEHICLE_TOMBSTONE_MAX'), ctx);
    vm.runInContext('function dedupeVehicleIds() { revInitMissing(db.vehicles); vehicleTombstonesApply(); vehicleCollapseCopies(); return 0; }', ctx);
    FB_FNS.forEach(n => vm.runInContext(extraer(SRC.fb, n), ctx));
    FB_VARS.forEach(n => vm.runInContext(constante(SRC.fb, n), ctx));
    vm.runInContext(bloque(SRC.fb, 'var FB_VEH_KNOWN_KEY'), ctx, { filename: 'veh-' + id + '.js' });
    ctx.store = store;
    ctx.ui = ui;
    return ctx;
}

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const firma = n => 'data:image/png;base64,' + 'A'.repeat(n);
function vehiculo(i, extra) {
    return Object.assign({ id: 'veh_' + i, vin: 'KNA' + String(i).padStart(6, '0'), status: 'in-progress', purpose: 'CoP',
        configCode: 'C' + i, registeredAt: '2026-09-20T10:00:00.000Z',
        timeline: [{ timestamp: '2026-09-20T10:00:00.000Z', action: 'Alta' }], testData: { odometer: i } }, extra || {});
}
let t = Date.parse('2026-09-28T13:00:00.000Z');
const ahora = () => { t += 60000; return new Date(t).toISOString(); };
function guardar(dev) { dev.stampRevisions(dev.db.vehicles, ahora()); }
const porVin = (dev, vin) => dev.db.vehicles.find(v => v.vin === vin);
const MARGEN = 10 * 60 * 1000;

(async function main() {
    const srv = servidor();

    console.log('\n== Funciones puras ==');
    {
        const A = equipo(srv, 'dev_pure');
        ok('el id del documento sale del id del vehículo, saneado', A.fbVehDocId({ id: 'a/b c', vin: 'X' }) === 'v_a_b_c');
        ok('sin id, del VIN', A.fbVehDocId({ vin: 'KNA1' }) === 'v_vin_KNA1');
        const vs = [{ id: 1, vin: 'A', _rev: 'r1' }, { id: 2, vin: 'B', _rev: 'r2' }];
        let p = A.fbVehPushPlan(vs, [], { v_1: 'r1' });
        ok('solo sube el vehículo cuya huella la nube no tiene', p.upserts.length === 1 && p.upserts[0].id === 2 && !p.deletes.length);
        p = A.fbVehPushPlan(vs, [{ id: 1, vin: 'VIEJO', kind: 'vin-corregido' }, { id: 9, vin: 'Z' }], { v_1: 'r1', v_2: 'r2' });
        ok('una marca vin-corregido NO borra el documento del vehículo vivo', p.deletes.length === 1 && p.deletes[0].docId === 'v_9');
        p = A.fbVehPushPlan(vs, [{ id: 9, vin: 'Z' }], { v_1: 'r1', v_2: 'r2', v_9: 'deleted' });
        ok('un borrado ya subido no se repite', !p.upserts.length && !p.deletes.length);
        const parsed = A.fbVehParseDocs([
            { _id: 'v_1', json: JSON.stringify({ id: 1, vin: 'A', _rev: 'r1' }), serverTs: '2026-09-28T10:00:00.000Z' },
            { _id: 'v_2', deleted: true, serverTs: '2026-09-28T11:00:00.000Z' },
            { _id: 'v_3', json: '{roto', serverTs: '2026-09-28T09:00:00.000Z' }]);
        ok('lee vehículos, marca los borrados y cuenta los ilegibles',
            parsed.vehicles.length === 1 && parsed.revs.v_2 === 'deleted' && parsed.bad === 1 && parsed.maxTs === Date.parse('2026-09-28T11:00:00.000Z'));
        ok('la meta lleva solo lo compartido (lastId es de cada equipo)', JSON.stringify(A.fbVehMeta({ vehicles: [1], deletedVehicles: [2], lastId: 3, version: '11' })) === '{"deletedVehicles":[2]}');
        const tomb = { id: 7, vin: 'Q', registeredAt: 'x' };
        ok('meta con extras: una marca que la nube no tiene', A.fbVehMetaHasExtras({ deletedVehicles: [tomb] }, { deletedVehicles: [] }) &&
            !A.fbVehMetaHasExtras({ deletedVehicles: [tomb] }, { deletedVehicles: [tomb] }));
    }

    console.log('\n== Primer equipo: sube todo una vez ==');
    const A = equipo(srv, 'dev_A'), B = equipo(srv, 'dev_B');
    A.db.vehicles = [1, 2, 3].map(i => vehiculo(i)); A.dedupeVehicleIds(); guardar(A);
    let r = await A.fbVehiclesSync({ initial: true });
    ok('sube los 3 vehículos y la meta en un commit', r.ok && r.sent === 3 && srv.vehDocs().length === 3 && srv.commits === 1, JSON.stringify(r));
    ok('cop15meta existe', !!srv.docs['projects/p/databases/(default)/documents/stations/KIA-EMLAB/cop15meta/current']);
    r = await A.fbVehiclesSync();
    ok('el segundo ciclo no sube nada', r.ok && r.sent === 0, JSON.stringify(r));

    console.log('\n== Equipo nuevo vacío: siembra desde la nube ==');
    r = await B.fbVehiclesSync({ initial: true });
    ok('B recibe los 3 y no sube nada', r.ok && B.db.vehicles.length === 3 && r.sent === 0, JSON.stringify(r) + ' n=' + B.db.vehicles.length);
    ok('conserva la meta local (versión de db)', B.db.version === '11.0');

    console.log('\n== Edición en un equipo, llega al otro (consulta incremental) ==');
    srv.avanzar(MARGEN);
    porVin(B, 'KNA000002').testData.odometer = 222; guardar(B);
    r = await B.fbVehiclesSync();
    ok('B sube SOLO el vehículo editado', r.sent === 1, JSON.stringify(r));
    const leidosAntes = srv.queries;
    r = await A.fbVehiclesSync();
    ok('A lo recibe', porVin(A, 'KNA000002').testData.odometer === 222 && r.changed === 1, JSON.stringify(r));
    ok('y no lo re-sube (huella igual a la de la nube)', r.sent === 0, JSON.stringify(r));
    ok('una consulta por ciclo', srv.queries === leidosAntes + 1);

    console.log('\n== Ediciones simultáneas del mismo vehículo ==');
    srv.avanzar(MARGEN);
    const va = porVin(A, 'KNA000001'), vb = porVin(B, 'KNA000001');
    va.testData.odometer = 111; guardar(A);
    vb.timeline.push({ timestamp: ahora(), action: 'Nota de B' }); guardar(B);
    await A.fbVehiclesSync();
    r = await B.fbVehiclesSync();
    const mB = porVin(B, 'KNA000001');
    ok('B se queda con la edición más reciente (la suya) y une la línea de tiempo', mB.timeline.some(e => e.action === 'Nota de B'), JSON.stringify(mB.timeline));
    await A.fbVehiclesSync();
    ok('los dos equipos terminan idénticos', A.stableStringify(A.db.vehicles) === B.stableStringify(B.db.vehicles));
    A.db.lastId = 41; B.db.lastId = 7;   // contador local distinto en cada equipo
    const w0 = srv.writes;
    const ra = await A.fbVehiclesSync(), rb = await B.fbVehiclesSync();
    ok('sin ping-pong: un ciclo más no escribe nada', ra.sent === 0 && rb.sent === 0 && srv.writes === w0, JSON.stringify([ra, rb]));

    console.log('\n== Borrar un vehículo ==');
    srv.avanzar(MARGEN);
    const v3 = porVin(A, 'KNA000003');
    A.vehicleTombstone(v3); A.db.vehicles = A.db.vehicles.filter(v => v !== v3); guardar(A);
    r = await A.fbVehiclesSync();
    const d3 = srv.docs['projects/p/databases/(default)/documents/stations/KIA-EMLAB/vehicles/v_veh_3'];
    ok('el documento queda marcado como borrado y sin datos', d3 && d3.fields.deleted.booleanValue === true && !d3.fields.json);
    await B.fbVehiclesSync();
    ok('B lo retira', !porVin(B, 'KNA000003') && B.db.vehicles.length === 2, B.db.vehicles.map(v => v.vin).join());
    r = await B.fbVehiclesSync();
    ok('y no lo resucita al volver a subir', r.sent === 0 && srv.docs['projects/p/databases/(default)/documents/stations/KIA-EMLAB/vehicles/v_veh_3'].fields.deleted.booleanValue);

    console.log('\n== Corregir el VIN (2.4.0) ==');
    srv.avanzar(MARGEN);
    const v1 = porVin(A, 'KNA000001');
    A.db.deletedVehicles = A.vehicleTombstonesUnion(A.db.deletedVehicles, [{ id: v1.id, vin: v1.vin, registeredAt: v1.registeredAt, kind: 'vin-corregido', at: ahora() }]);
    v1.vin = 'KNA999999'; guardar(A);
    r = await A.fbVehiclesSync();
    ok('sube el mismo documento (el id no cambia) y no borra nada', r.sent === 1 && srv.vehDocs().length === 3, JSON.stringify(r));
    await B.fbVehiclesSync();
    ok('B tiene el VIN nuevo y no el viejo', !!porVin(B, 'KNA999999') && !porVin(B, 'KNA000001') && B.db.vehicles.length === 2,
        B.db.vehicles.map(v => v.vin).join());

    console.log('\n== Un laboratorio grande ya no tiene tope ==');
    srv.avanzar(MARGEN);
    const C = equipo(srv, 'dev_C'), D = equipo(srv, 'dev_D');
    const srv2 = servidor();
    C.fetch = D.fetch = (u, i) => srv2.fetch(u, i);
    C.db.vehicles = Array.from({ length: 60 }, (_, i) => vehiculo(100 + i, { testData: { signatures: { releaser: firma(30000) } } }));
    C.dedupeVehicleIds(); guardar(C);
    const bytes = JSON.stringify(C.db).length;
    r = await C.fbVehiclesSync({ initial: true });
    ok('60 vehículos (' + Math.round(bytes / 1024) + ' KB juntos, más de 1 MiB) suben en lotes de 20',
        r.sent === 60 && srv2.commits === 3 && bytes > 1048576, JSON.stringify(r) + ' commits=' + srv2.commits);
    r = await D.fbVehiclesSync({ initial: true });
    ok('y otro equipo los recibe todos con sus firmas', D.db.vehicles.length === 60 &&
        D.db.vehicles.every(v => v.testData.signatures.releaser.length === 30022));
    ok('el documento más pesado sigue lejos del tope', C.fbVehLargestDoc(C.db.vehicles).bytes < 100000);

    console.log('\n== Sin red a medio camino ==');
    {
        const srv3 = servidor();
        const E = equipo(srv3, 'dev_E');
        E.db.vehicles = Array.from({ length: 30 }, (_, i) => vehiculo(300 + i)); E.dedupeVehicleIds(); guardar(E);
        await E.fbVehiclesSync({ initial: true });
        E.db.vehicles.forEach(v => { v.testData.odometer += 1000; }); guardar(E);
        srv3.avanzar(MARGEN);
        // Pull: GET meta + query (2 llamadas) · primer lote OK · el segundo falla.
        let llamadas = 0;
        E.fetch = (u, i) => { llamadas++; return llamadas === 4 ? Promise.reject(new Error('Failed to fetch')) : srv3.fetch(u, i); };
        r = await E.fbVehiclesSync();
        ok('el ciclo falla y lo dice', !r.ok && /sin conexión/.test(r.error), JSON.stringify(r));
        ok('el lote que sí llegó queda registrado; el resto queda pendiente', E.fbVehStatus().pending === 10, JSON.stringify(E.fbVehStatus()));
        E.fetch = (u, i) => srv3.fetch(u, i);
        r = await E.fbVehiclesSync();
        ok('el siguiente ciclo sube solo lo pendiente', r.ok && r.sent === 10 && E.fbVehStatus().pending === 0, JSON.stringify(r));
    }

    console.log('\n== Convivencia: un vehículo que llegó por la copia completa (equipo sin actualizar) ==');
    {
        srv.avanzar(MARGEN);
        const viejo = vehiculo(900); A.revInitMissing([viejo]);
        A.fbAutoMerge('cop15', { vehicles: A.db.vehicles.concat([viejo]), deletedVehicles: A.db.deletedVehicles }, 'dev_viejo');
        ok('entra por el camino de siempre', !!porVin(A, viejo.vin));
        r = await A.fbVehiclesSync();
        ok('y A lo sube como documento propio', r.sent === 1, JSON.stringify(r));
        await B.fbVehiclesSync();
        ok('así lo ve B aunque la copia completa ya no quepa', !!porVin(B, viejo.vin));
    }

    console.log('\n== Sin sincronización de Pruebas no hace nada ==');
    {
        const F = equipo(srv, 'dev_F');
        F.fbSyncModules.cop15 = false;
        const c0 = srv.commits;
        r = await F.fbVehiclesSync();
        ok('no lee ni escribe', r.skipped && srv.commits === c0);
    }

    console.log('\n== 2.14.0: ¿se guardó? ¿lo ven los demás? (estado por vehículo) ==');
    {
        const srv4 = servidor();
        const G = equipo(srv4, 'dev_G'), H = equipo(srv4, 'dev_H');
        const st = { active: true, online: true, lastError: '' };
        G.db.vehicles = [vehiculo(40)]; G.dedupeVehicleIds(); guardar(G);
        const v = G.db.vehicles[0];
        ok('recién guardado y sin ciclo: por subir', G.fbVehStateOf(v, G.fbVehKnown(), st).state === 'por-subir');
        ok('sin conexión: error que lo dice', G.fbVehStateOf(v, G.fbVehKnown(), { active: true, online: false }).reason === 'sin conexión');
        ok('con sync apagada: solo en este equipo', G.fbVehStateOf(v, G.fbVehKnown(), { active: false }).state === 'sin-sync');
        r = await G.fbVehiclesSync();
        let s1 = G.fbVehStateOf(v, G.fbVehKnown(), st);
        ok('tras el ciclo: en la nube, con la hora del servidor y este equipo como autor',
            s1.state === 'nube' && !!s1.at && s1.writer === 'dev_G', JSON.stringify(s1));
        await H.fbVehiclesSync({ initial: true });
        const vh = porVin(H, v.vin);
        let s2 = H.fbVehStateOf(vh, H.fbVehKnown(), st);
        ok('el otro equipo lo ve en la nube y sabe que vino de G', s2.state === 'nube' && s2.writer === 'dev_G', JSON.stringify(s2));
        const seen = JSON.parse(H.store.kia_fb_devices || '{}').seen || {};
        ok('H anota a G como equipo que sube vehículos uno por uno', seen.dev_G && seen.dev_G.veh === true, JSON.stringify(seen));
        ok('un equipo no se anota a sí mismo', !(JSON.parse(G.store.kia_fb_devices || '{}').seen || {}).dev_G);
        vh.testData.odometer = 999; H.stampRevisions(H.db.vehicles, ahora());
        ok('una edición nueva vuelve a "por subir" aunque la versión anterior esté en la nube',
            H.fbVehStateOf(vh, H.fbVehKnown(), st).state === 'por-subir');
        srv4.fail = 2;
        r = await H.fbVehiclesSync();
        ok('si la red falla, el estado es error con el motivo',
            !r.ok && H.fbVehStateOf(vh, H.fbVehKnown(), { active: true, online: true, lastError: H.fbSync.vehLastError }).state === 'error');
        r = await H.fbVehiclesSync();
        s2 = H.fbVehStateOf(vh, H.fbVehKnown(), st);
        ok('al reintentar: en la nube, ahora desde H', r.ok && s2.state === 'nube' && s2.writer === 'dev_H', JSON.stringify(s2));
        await G.fbVehiclesSync();
        const s3 = G.fbVehStateOf(porVin(G, v.vin), G.fbVehKnown(), st);
        ok('G recibe la edición y dice que llegó desde H', s3.state === 'nube' && s3.writer === 'dev_H', JSON.stringify(s3));
        ok('la huella del vehículo no cambió por mostrar el estado (sin campos nuevos)',
            !('_cloud' in porVin(G, v.vin)) && porVin(G, v.vin)._rev === vh._rev);

        const now = Date.parse('2026-09-28T16:30:00');
        const L = (x) => G.fbVehStateLabel(x, { now, own: 'dev_G', names: { dev_H: 'Tablet celda 2' } });
        ok('etiqueta: en la nube con hora y nombre del equipo que lo subió',
            L({ state: 'nube', at: new Date(Date.parse('2026-09-28T10:42:00')).toISOString(), writer: 'dev_H' }).text === 'En la nube · 10:42 · desde Tablet celda 2',
            L({ state: 'nube', at: new Date(Date.parse('2026-09-28T10:42:00')).toISOString(), writer: 'dev_H' }).text);
        ok('etiqueta: lo subido por este equipo no dice "desde"', L({ state: 'nube', at: new Date(now).toISOString(), writer: 'dev_G' }).text === 'En la nube · 16:30');
        ok('etiqueta: un equipo sin nombre es "otro equipo"', /desde otro equipo$/.test(L({ state: 'nube', at: '', writer: 'dev_Z' }).text));
        ok('etiqueta: otro día muestra la fecha', / · 27 sep$/.test(L({ state: 'nube', at: new Date(Date.parse('2026-09-27T09:00:00')).toISOString(), writer: 'dev_G' }).text));
        ok('etiqueta: por subir hace rato dice desde cuándo', L({ state: 'por-subir', since: new Date(now - 10 * 60000).toISOString() }).text === 'Por subir desde 16:20');
        ok('etiqueta: por subir recién no alarma', L({ state: 'por-subir', since: new Date(now - 30000).toISOString() }).text === 'Por subir');
        ok('etiqueta: el error promete lo que es cierto (está guardado aquí)', /seguro en este equipo/.test(L({ state: 'error', reason: 'sin conexión' }).title));
    }

    console.log('\n== 2.14.0: equipos del laboratorio ==');
    {
        const A2 = equipo(servidor(), 'dev_X');
        ok('versiones: comparación numérica por partes', A2.fbVersionCmp('2.10.0', '2.9.0') === 1 && A2.fbVersionCmp('2.9.0', '2.9') === 0 && A2.fbVersionCmp('2.13.1', '2.14.0') === -1);
        const now = Date.parse('2026-09-28T12:00:00.000Z');
        const reg = {
            dev_me: { name: 'PC Lab', version: '2.14.0', lastSeen: '2026-09-28T11:00:00.000Z' },
            dev_old: { name: 'Tablet 1', version: '2.14.0', lastSeen: '2026-09-28T10:00:00.000Z' },
            dev_up: { name: 'Tablet 2', version: '2.15.0', lastSeen: '2026-09-28T09:00:00.000Z' }
        };
        const seen = {
            dev_v: { veh: true, last: '2026-09-27T12:00:00.000Z' },
            dev_m: { last: '2026-09-26T12:00:00.000Z' },
            dev_gone: { last: '2026-07-01T12:00:00.000Z' }
        };
        const V = A2.fbDevicesView(reg, seen, { now, own: 'dev_me', current: '2.15.0' });
        const by = id => V.rows.find(r => r.id === id);
        ok('este equipo va primero', V.rows[0].id === 'dev_me' && V.rows[0].own);
        ok('uno en la versión actual está al día', by('dev_up').level === 'al-dia');
        ok('uno registrado en una versión anterior está atrasado', by('dev_old').level === 'atrasado');
        ok('sin registro pero sube vehículos uno por uno: anterior a 2.14.0, no bloquea', by('dev_v').level === 'anterior-214');
        ok('sin registro y solo escribió copias completas: sin confirmar', by('dev_m').level === 'sin-confirmar');
        ok('uno sin actividad en 30 días queda inactivo y al final', by('dev_gone').inactive && V.rows[V.rows.length - 1].id === 'dev_gone');
        ok('lo que impide la 3.0.0: solo los activos sin confirmar', V.blockers3.length === 1 && V.blockers3[0].id === 'dev_m', JSON.stringify(V.blockers3.map(r => r.id)));
        ok('este equipo sin registro todavía toma la versión que corre', A2.fbDevicesView({}, {}, { now, own: 'dev_me', current: '2.14.0' }).rows[0].level === 'al-dia');
    }

    console.log('\n== 2.14.0: la hoja del indicador ==');
    {
        const A3 = equipo(servidor(), 'dev_S');
        const now = Date.parse('2026-09-28T16:00:00');
        let m = A3.fbSyncSheetModel({ active: false });
        ok('apagada: lo dice y no promete nada', m.tone === 'off' && /apagada/.test(m.head));
        m = A3.fbSyncSheetModel({ active: true, online: true, pending: [], live: true, lastSync: new Date(now).toISOString(), now });
        ok('todo arriba: verde y cuándo se revisó', m.tone === 'ok' && m.lines.some(l => /16:00/.test(l)) && m.lines.some(l => /al momento/.test(l)));
        m = A3.fbSyncSheetModel({ active: true, online: true, pending: [{ vin: 'KNA1', updatedAt: new Date(now).toISOString() }], queue: 2, now });
        ok('con pendientes: los lista con su VIN y cuenta la cola de otros módulos',
            m.tone === 'pend' && m.pending[0].vin === 'KNA1' && m.lines.some(l => /2 cambios de otros módulos/.test(l)));
        m = A3.fbSyncSheetModel({ active: true, online: false, pending: [{ vin: 'KNA1' }], now });
        ok('sin conexión manda sobre "subiendo"', m.tone === 'err' && /Sin conexión/.test(m.head));
        m = A3.fbSyncSheetModel({ active: true, online: true, lastError: 'Sin permiso', pending: [], now });
        ok('un error se muestra con su motivo', m.tone === 'err' && m.lines.indexOf('Sin permiso') >= 0);
    }


    console.log('\n== 2.35.0: revisión al reconectar ==');
    {
        const S = servidor();
        const nube = equipo(S, 'dev_nube');
        nube.db.vehicles = [vehiculo(51), vehiculo(52)]; nube.dedupeVehicleIds(); guardar(nube);
        await nube.fbVehiclesSync({ initial: true });
        const hace30 = new Date(Date.now() - 30 * 86400000).toISOString();

        // Equipo viejo: 30 días sin sincronizar, con una prueba "dummy" que la nube nunca tuvo.
        const viejo = equipo(S, 'dev_viejo', { lastOkAt: hace30,
            vehicles: [vehiculo(99, { registeredAt: '2026-08-01T10:00:00.000Z' })] });
        ok('arranca en revisión (más de 3 días sin sincronizar)', viejo.fbSync.review.state === 'checking' && viejo.fbSync.review.days >= 29);
        viejo.dedupeVehicleIds(); guardar(viejo);
        let r = await viejo.fbVehiclesSync({ initial: true });
        const enNube = vin => S.vehDocs().some(d => d.fields.vin.stringValue === vin);
        ok('trae lo de la nube', !!porVin(viejo, 'KNA000051') && !!porVin(viejo, 'KNA000052'));
        ok('pregunta, y solo por lo que la nube no tiene', viejo.fbSync.review.state === 'asking' && viejo.ui.modals.length === 1 &&
            viejo.fbSync.review.model.vehicles.map(v => v.vin).join() === 'KNA000099', JSON.stringify(viejo.fbSync.review.model && viejo.fbSync.review.model.vehicles));
        ok('mientras no decida, la dummy NO sube', !enNube('KNA000099') && r.sent === 0, JSON.stringify(r));
        r = await viejo.fbVehiclesSync();
        ok('ni en el siguiente ciclo', !enNube('KNA000099'));
        ok('Pruebas, Plan, Consumibles y CoP quedan detenidos', ['cop15', 'testplan', 'inventory', 'cop'].every(c => viejo.fbReviewHolds(c)) && !viejo.fbReviewHolds('panel'));
        const okAntes = JSON.parse(viejo.store.kia_fb_veh_known).lastOkAt;
        ok('la última sincronización NO se actualiza mientras está pendiente', okAntes === hace30);

        // "Ninguno": se borra de este equipo, con deshacer.
        viejo.fbReviewApply({ veh: {}, inv: {} });
        ok('desmarcada: se borra de este equipo', !porVin(viejo, 'KNA000099') && viejo.db.vehicles.length === 2);
        ok('sin marca de borrado (la nube nunca la tuvo)', !(viejo.db.deletedVehicles || []).length);
        ok('ofrece deshacer y sigue detenido durante la ventana', typeof viejo.ui.undo === 'function' && viejo.fbReviewHolds('cop15'));
        viejo.ui.undo();
        ok('deshacer la regresa y vuelve a preguntar', !!porVin(viejo, 'KNA000099') && viejo.fbSync.review.state === 'asking');
        viejo.fbReviewApply({ veh: {}, inv: {} });
        viejo.fbReviewFinish();
        ok('al terminar libera las subidas y sella la sincronización', viejo.fbSync.review.state === 'done' && !viejo.fbReviewHolds('cop15') &&
            JSON.parse(viejo.store.kia_fb_veh_known).lastOkAt > hace30);
        r = await viejo.fbVehiclesSync();
        ok('la dummy nunca llegó a la nube', !enNube('KNA000099') && enNube('KNA000051'));

        // "Subir": lo marcado sí sube.
        const otro = equipo(S, 'dev_otro', { lastOkAt: hace30, vehicles: [vehiculo(77, { registeredAt: '2026-08-02T10:00:00.000Z' })] });
        otro.dedupeVehicleIds(); guardar(otro);
        await otro.fbVehiclesSync({ initial: true });
        otro.fbReviewApply({ veh: { 0: true }, inv: {} });
        ok('marcada: no hay nada que deshacer y termina sola', otro.fbSync.review.state === 'done' && otro.ui.undo === null);
        await otro.fbVehiclesSync();
        ok('y sube', enNube('KNA000077'));

        // Un equipo al día no pregunta nada.
        const aldia = equipo(S, 'dev_aldia', { vehicles: [vehiculo(66)] });
        aldia.dedupeVehicleIds(); guardar(aldia);
        r = await aldia.fbVehiclesSync({ initial: true });
        ok('un equipo al día sube sin preguntar', aldia.fbSync.review.state === 'idle' && aldia.ui.modals.length === 0 && enNube('KNA000066'));

        // Atrasado pero sin nada propio: no aparece ninguna ventana.
        const limpio = equipo(S, 'dev_limpio', { lastOkAt: hace30 });
        await limpio.fbVehiclesSync({ initial: true });
        ok('atrasado sin nada propio: no pregunta y queda al día', limpio.fbSync.review.state === 'done' && limpio.ui.modals.length === 0);

        // Equipos de antes de 2.35.0: la última sincronización sale de la marca de agua.
        const S2 = servidor();
        const antes = equipo(S2, 'dev_antes', { lastOkAt: null });
        ok('sin registro alguno: se revisa', antes.fbSync.review.state === 'checking');
        const st = antes.fbReviewStaleness(new Date(Date.now() - 2 * 86400000).toISOString(), Date.now(), 3);
        ok('2 días: no está atrasado', !st.stale && st.days === 2);
        ok('4 días: atrasado', antes.fbReviewStaleness(new Date(Date.now() - 4 * 86400000).toISOString(), Date.now(), 3).stale);
    }

    console.log('\n== 2.35.0: el resumen de Consumibles ==');
    {
        const X = equipo(servidor(), 'dev_inv');
        const local = { gases: [
            { controlNo: 'G1', name: 'CO 500 ppm', readings: [{ date: '2026-09-01', psi: 1500 }, { date: '2026-09-02', psi: 1480 }] },
            { controlNo: 'G2', name: 'NOx', readings: [{ date: '2026-09-25', psi: 900 }, { date: '2026-09-29', psi: 880 }] },
            { controlNo: 'G9', name: 'Dummy', readings: [{ date: '2026-08-01', psi: 2000 }] }],
            fuelTanks: [{ id: 'T1', name: 'Gasolina E10', readings: [{ date: '2026-09-03', level: 40 }, { date: '2026-09-03', level: 35, auto: true }] }] };
        const nube = { gases: [
            { controlNo: 'G1', readings: [{ date: '2026-09-01', psi: 1500 }, { date: '2026-09-23', psi: 1200 }] },
            { controlNo: 'G2', readings: [{ date: '2026-09-25', psi: 900 }] }],
            fuelTanks: [{ id: 'T1', readings: [{ date: '2026-09-24', level: 60 }] }] };
        const m = X.fbReviewModel({ vehicles: [], cloudDocs: {}, localInv: local, remoteInv: nube });
        const by = k => m.inventory.find(x => x.key === k);
        ok('lectura que la nube no tiene, 3 semanas más vieja: se marca vieja', by('G1').older && by('G1').readings.length === 1 && by('G1').behindDays === 21, JSON.stringify(by('G1')));
        ok('lectura más nueva que la de la nube: no es vieja', !by('G2').older && by('G2').readings[0].date === '2026-09-29');
        ok('cilindro que la nube no tiene', by('G9').newItem);
        ok('tanque: cuenta también la automática por prueba', by('T1').older && by('T1').readings.length === 2 && by('T1').readings.some(q => q.auto));
        ok('lo que ya está en la nube no aparece', m.inventory.length === 4);
        const v = X.fbReviewModel({ vehicles: [{ id: 1, vin: 'A', registeredAt: '2026-01-01' }, { id: 2, vin: 'B', registeredAt: '2099-01-01T00:00:00.000Z' }],
            cloudDocs: {}, bootAt: '2026-10-07T00:00:00.000Z' });
        ok('lo creado en esta sesión no se pregunta', v.vehicles.length === 1 && v.vehicles[0].vin === 'A');
    }
    console.log('\n== 2.37.3: la copia completa que no cabe no avisa en cada arranque (#191) ==');
    {
        const T = equipo(servidor(), 'dev_toast');
        ok('cop15 con vehículos por documento: sin toast, aunque el primer ciclo no haya terminado',
            T.fbSizeBlockToast('cop15', true, null, 1e12) === false);
        ok('cop15 sin vehículos por documento (sync de Pruebas apagado): sí avisa',
            T.fbSizeBlockToast('cop15', false, null, 1e12) === true);
        ok('otro módulo que no cabe: avisa', T.fbSizeBlockToast('testplan', true, null, 1e12) === true);
        ok('y a lo más cada 10 min', T.fbSizeBlockToast('testplan', true, { at: 1e12 - 60000 }, 1e12) === false &&
            T.fbSizeBlockToast('testplan', true, { at: 1e12 - 700000 }, 1e12) === true);
    }
    console.log('\n== 2.37.1: copias del mismo VIN con distinto id ==');
    {
        const P0 = equipo(servidor(), 'dev_pure2');
        const parsed = P0.fbVehParseDocs([{ _id: 'v_a', vin: 'KNAX', json: JSON.stringify({ id: 'a', vin: 'KNAX' }), serverTs: '2026-10-01T00:00:00.000Z' }]);
        ok('el VIN de cada documento queda en info', parsed.info.v_a.vin === 'KNAX');
        ok('[2.37.2] y su fecha de alta', parsed.info.v_a.reg === '');
        let p = P0.fbVehPushPlan([{ id: 'b', vin: 'KNAX', _rev: 'rb' }], [], { v_a: 'ra', v_b: 'rb' }, {}, { v_a: { vin: 'KNAX', reg: '' }, v_b: { vin: 'KNAX', reg: '' } });
        ok('un documento vivo de MI VIN bajo otro id se retira, apuntando al mío',
            p.retires.length === 1 && p.retires[0].docId === 'v_a' && p.retires[0].supersededBy === 'v_b' && !p.deletes.length, JSON.stringify(p));
        p = P0.fbVehPushPlan([{ id: 'b', vin: 'KNAX', _rev: 'rb' }], [], { v_a: 'deleted', v_b: 'rb' }, {}, { v_a: { vin: 'KNAX', reg: '' } });
        ok('uno ya retirado no se repite', !p.retires.length);
        p = P0.fbVehPushPlan([{ id: 'b', vin: 'KNAX', _rev: 'rb' }], [], { v_c: 'rc', v_b: 'rb' }, {}, { v_c: { vin: 'OTRO', reg: '' } });
        ok('un documento de otro VIN no se toca', !p.retires.length);
        p = P0.fbVehPushPlan([{ id: 'b', vin: 'KNAX', _rev: 'rb' }], [], { v_a: 'ra', v_b: 'rb' }, {}, {});
        ok('sin saber el VIN del documento, no se retira (nunca a ciegas)', !p.retires.length);
        p = P0.fbVehPushPlan([{ id: 'b', vin: 'KNAX', _rev: 'rb' }], [], { v_a: 'ra', v_b: 'rb' }, { v_b: true }, { v_a: { vin: 'KNAX', reg: '' } });
        ok('lo que espera la revisión al reconectar no retira nada', !p.retires.length);
        // [2.37.2] Un re-ensayo del mismo VIN (otra fecha de alta) NO es copia.
        p = P0.fbVehPushPlan([{ id: 'b', vin: 'KNAX', registeredAt: '2026-10-01T10:00:00.000Z', _rev: 'rb' }], [], { v_a: 'ra', v_b: 'rb' }, {},
            { v_a: { vin: 'KNAX', reg: '2026-03-05T09:00:00.000Z' } });
        ok('[2.37.2] un re-ensayo del mismo VIN no se retira', !p.retires.length, JSON.stringify(p.retires));
        p = P0.fbVehPushPlan([{ id: 'b', vin: 'KNAX', registeredAt: '2026-03-05T09:00:00.000Z', _rev: 'rb' }], [], { v_a: 'ra', v_b: 'rb' }, {},
            { v_a: { vin: 'KNAX', reg: '2026-03-05T09:00:00.000Z' } });
        ok('[2.37.2] una copia (mismo VIN y misma alta) sí', p.retires.length === 1 && p.retires[0].docId === 'v_a');
        p = P0.fbVehPushPlan([{ id: 'b', vin: 'KNAX', _rev: 'rb' }], [], { v_a: 'ra', v_b: 'rb' }, {}, { v_a: { vin: 'KNAX' } });
        ok('[2.37.2] sin la fecha de alta del documento, no se retira', !p.retires.length);
        const reA = { id: 'r1', vin: 'KNAR', registeredAt: '2026-03-05T09:00:00.000Z', status: 'archived', updatedAt: '2026-03-18T00:00:00.000Z' };
        const reB = { id: 'r2', vin: 'KNAR', registeredAt: '2026-10-01T10:00:00.000Z', status: 'in-progress', updatedAt: '2026-10-02T00:00:00.000Z' };
        ok('[2.37.2] al juntar copias, un re-ensayo queda aparte', P0.fbVehCollapseCopies([reA, reB]).length === 2);
        ok('[2.37.2] la limpieza no agrupa re-ensayos',
            P0.fbVehDupPlan([{ _id: 'v_r1', vin: 'KNAR', json: JSON.stringify(reA) }, { _id: 'v_r2', vin: 'KNAR', json: JSON.stringify(reB) }], []).groups.length === 0);

        // [2.37.2] Copias dentro de un MISMO equipo (siembras anteriores a 2.37.1): se juntan al cargar.
        const L = equipo(servidor(), 'dev_L');
        const c1 = { id: 'c1', vin: 'KNAC', registeredAt: '2026-03-05T09:00:00.000Z', status: 'archived', updatedAt: '2026-03-18T00:00:00.000Z', timeline: [{ timestamp: '2026-03-05T09:00:00.000Z', action: 'Alta' }] };
        const c2 = { id: 'c2', vin: 'KNAC', registeredAt: '2026-03-05T09:00:00.000Z', status: 'archived', updatedAt: '2026-10-07T00:00:00.000Z', timeline: [{ timestamp: '2026-03-05T09:00:00.000Z', action: 'Alta' }, { timestamp: '2026-10-07T00:00:00.000Z', action: 'Completado' }] };
        const c3 = { id: 'c3', vin: 'KNAC', registeredAt: '2026-10-01T10:00:00.000Z', status: 'in-progress', updatedAt: '2026-10-02T00:00:00.000Z' };
        L.db.vehicles = [c1, c2, c3];
        L.tpState = { testedList: [{ vehicleId: 'c1' }], weeklyPlans: [{ items: [{ linkedVehicleId: 'c1' }] }] };
        const pantalla = L.db.vehicles[0];
        L.dedupeVehicleIds();
        ok('[2.37.2] las copias de un equipo se juntan; el re-ensayo se queda', L.db.vehicles.length === 2 &&
            L.db.vehicles.some(v => v.id === 'c3'), L.db.vehicles.map(v => v.id).join());
        const queda = L.db.vehicles.find(v => v.vin === 'KNAC' && v.registeredAt.startsWith('2026-03'));
        ok('[2.37.2] gana la edición más reciente, sin cambiar el objeto (una pantalla puede tenerlo)',
            queda === pantalla && queda.id === 'c2' && queda.timeline.length === 2);
        ok('[2.37.2] el plan y la evidencia que apuntaban al id que se fue pasan al que queda',
            L.tpState.testedList[0].vehicleId === 'c2' && L.tpState.weeklyPlans[0].items[0].linkedVehicleId === 'c2');
        const w = P0.fbVehWrites([], [], null, s => s, 'dev', [{ docId: 'v_a', vin: 'KNAX', supersededBy: 'v_b' }]);
        ok('el retiro escribe SOLO deleted/rev/supersededBy/writer (el json se queda)',
            w.length === 1 && w[0].updateMask.fieldPaths.join() === 'deleted,rev,supersededBy,writer' && !w[0].update.fields.json);

        // Lo que hay hoy en la nube: el mismo VIN en DOS documentos (el reparo de ids, o datos de
        // antes de v17.12). "dos" tiene la edición más reciente.
        const srv2 = servidor();
        const nombreDoc = id => 'projects/p/databases/(default)/documents/stations/KIA-EMLAB/vehicles/v_' + id;
        const sembrar = (srvX, v) => { srvX.docs[nombreDoc(v.id)] = { name: nombreDoc(v.id), fields: { json: { stringValue: JSON.stringify(v) },
            vin: { stringValue: v.vin }, id: { stringValue: v.id }, rev: { stringValue: v._rev || '' }, deleted: { booleanValue: false },
            serverTs: { timestampValue: '2026-09-28T11:00:00.000Z' } } }; };
        const vUno = Object.assign(vehiculo(50, { id: 'uno' }), { updatedAt: '2026-09-21T00:00:00.000Z' });
        const vDos = Object.assign(vehiculo(50, { id: 'dos', testData: { odometer: 99 } }), { updatedAt: '2026-09-25T00:00:00.000Z' });
        const E1 = equipo(srv2, 'dev_E1');
        E1.db.vehicles = [JSON.parse(JSON.stringify(vUno))]; E1.dedupeVehicleIds();
        vUno._rev = E1.db.vehicles[0]._rev;
        const E2tmp = equipo(srv2, 'dev_tmp'); vDos._rev = E2tmp.revContentHash(vDos);
        sembrar(srv2, vUno); sembrar(srv2, vDos);
        await E1.fbVehiclesSync({ initial: true });   // trae las dos, se queda con "dos" y retira "uno"
        const vivos = srv2.vehDocs().filter(d => !(d.fields.deleted && d.fields.deleted.booleanValue));
        const ret = srv2.vehDocs().find(d => d.name.endsWith('/v_uno'));
        ok('en la nube queda UN documento vivo para el VIN', vivos.length === 1 && vivos[0].name.endsWith('/v_dos'), vivos.map(d => d.name).join());
        ok('el otro queda retirado con supersededBy y SIN perder su json',
            ret && ret.fields.deleted.booleanValue && ret.fields.supersededBy.stringValue === 'v_dos' && !!ret.fields.json, ret && JSON.stringify(Object.keys(ret.fields)));
        const E2 = equipo(srv2, 'dev_E2');
        srv2.avanzar(60000);
        await E2.fbVehiclesSync({ initial: true });
        ok('los dos equipos ven UN vehículo, el mismo', E1.db.vehicles.length === 1 && E2.db.vehicles.length === 1 &&
            E1.db.vehicles[0].id === 'dos' && E2.db.vehicles[0].id === 'dos', E1.db.vehicles.map(v => v.id) + ' / ' + E2.db.vehicles.map(v => v.id));
        const r2 = await E1.fbVehiclesSync();
        ok('el siguiente ciclo ya no escribe nada', r2.sent === 0, JSON.stringify(r2));

        // Un equipo nuevo que recibe las DOS copias de un VIN que no tiene.
        const srv3 = servidor();
        const N = equipo(srv3, 'dev_N');
        const vA = Object.assign(vehiculo(60, { id: 'a1' }), { updatedAt: '2026-09-21T00:00:00.000Z' });
        const vB = Object.assign(vehiculo(60, { id: 'b1' }), { updatedAt: '2026-09-22T00:00:00.000Z' });
        const docName = id => 'projects/p/databases/(default)/documents/stations/KIA-EMLAB/vehicles/v_' + id;
        [vA, vB].forEach(v => { srv3.docs[docName(v.id)] = { name: docName(v.id), fields: { json: { stringValue: JSON.stringify(v) },
            vin: { stringValue: v.vin }, id: { stringValue: v.id }, rev: { stringValue: '' }, deleted: { booleanValue: false },
            serverTs: { timestampValue: '2026-09-28T12:00:00.000Z' } } }; });
        await N.fbVehiclesSync({ initial: true });
        ok('entran como UN vehículo (antes entraban las dos)', N.db.vehicles.length === 1 && N.db.vehicles[0].id === 'b1', N.db.vehicles.map(v => v.id).join());

        // La limpieza de una sola vez.
        const d = (id, v, extra) => Object.assign({ _id: 'v_' + id, vin: v.vin, json: JSON.stringify(v) }, extra || {});
        const p1 = Object.assign(vehiculo(70, { id: 'p1' }), { updatedAt: '2026-09-21T00:00:00.000Z' });
        const p2 = Object.assign(vehiculo(70, { id: 'p2' }), { updatedAt: '2026-09-25T00:00:00.000Z',
            timeline: [{ timestamp: '2026-09-24T00:00:00.000Z', action: 'Otra' }] });
        const solo = vehiculo(71, { id: 's1' });
        const borr = vehiculo(72, { id: 'x1' }), borr2 = vehiculo(72, { id: 'x2' });
        const plan = P0.fbVehDupPlan([d('p1', p1), d('p2', p2), d('s1', solo), d('x1', borr), d('x2', borr2), d('z', solo, { deleted: true })],
            [{ id: 'x1', vin: borr.vin, registeredAt: borr.registeredAt }, { id: 'x2', vin: borr.vin, registeredAt: borr.registeredAt }]);
        const g = plan.groups[0];
        ok('agrupa copias (VIN + alta) y se queda con la edición más reciente (regla de la app)', plan.groups.length === 1 && g.keep === 'v_p2' &&
            g.retire.length === 1 && g.retire[0].docId === 'v_p1' && g.retire[0].supersededBy === 'v_p2', JSON.stringify(plan.groups.map(x => [x.keep, x.retire])));
        ok('el que se queda recibe la bitácora unida', g.update && g.merged.timeline.length === 2);
        ok('lo marcado como borrado y lo ya retirado no se tocan', plan.tombstoned === 2 && plan.live === 5);
        ok('es la misma decisión corra donde corra (orden estable)',
            P0.fbVehDupPlan([d('p2', p2), d('p1', p1)], []).groups[0].keep === 'v_p2');
    }

    console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
    process.exitCode = fallaron ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
