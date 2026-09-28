// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Vehículos uno por uno (2.9.0)                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Código REAL de app.js (revisiones, marcas de borrado) y firebase-sync.js (motor de
// fusión + ciclo por vehículo) en dos "equipos", cada uno en su propio `vm`, contra un
// Firestore falso: commit con la hora del servidor, GET de documentos y runQuery con
// filtro por `serverTs`.

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
    '_vehTombKey', 'vehicleIsTombstoned', 'vehicleTombstonesUnion', 'vehicleTombstone', 'vehicleTombstonesApply'];
const FB_FNS = ['_fbTestedKey', '_fbPlanKey', '_fbPlanItemKey', '_fbMergePaStatus', '_fbUnionLog',
    '_fbVehTime', '_fbMergeVehicle', '_fbModuleFingerprint', '_fbLocalHasExtras', '_fbPushBack',
    '_fbLiveToast', '_fbAfterAutoMerge', 'fbAutoMerge', 'fbMergeAnalyze', 'fbMergeExecute',
    '_fbEquipKey', '_fbMergeReadings', '_fbTombsNewTo', '_fbPullMergeModule', '_fbPullSeed', '_fbPullLocalScore',
    'fbToFirestoreValue', 'fbFromFirestoreValue', '_fbBugsRestDocToObj', '_fbBugsRestUrl', '_fbBugsRestSend',
    '_fbBkErrText', '_fbBkIsNotFound', '_fbAuditBase', '_fbAuditStation', '_fbStationDocName', '_fbAuditCommit',
    '_fbAuditAlreadyThere', '_fbUtf8Bytes'];
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
                const f = Object.assign({}, w.update.fields);
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

function equipo(srv, id) {
    const store = {};
    const ctx = {
        console, JSON, Object, Array, String, Number, Math, Date, RegExp, Error, isNaN, parseInt, parseFloat, Promise,
        encodeURIComponent, unescape,
        setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        fetch: (u, i) => srv.fetch(u, i),
        refreshAllLists() {}, updateProgressBar() {}, _fbTpUISync() {}, invRender() {}, showToast() {},
        fbQuotaCheck: () => ({ allowed: true }), fbQuotaRecord() {}, fbSyncCapacityInvalidate() {},
        _fbIdTokenPromise: () => Promise.resolve('tok'),
        FIREBASE_CONFIG: { projectId: 'p', apiKey: 'k' },
        FB_DEVICE_ID: id, fbSyncModules: { cop15: true, testplan: true, inventory: true },
        fbSync: { enabled: true, stationId: 'KIA-EMLAB' },
        db: { version: '11.0', vehicles: [], lastId: 0 }, tpState: {}, invState: {}
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    APP_FNS.forEach(n => vm.runInContext(extraer(SRC.app, n), ctx));
    vm.runInContext(constante(SRC.app, 'VEHICLE_TOMBSTONE_MAX'), ctx);
    vm.runInContext('function dedupeVehicleIds() { revInitMissing(db.vehicles); vehicleTombstonesApply(); return 0; }', ctx);
    FB_FNS.forEach(n => vm.runInContext(extraer(SRC.fb, n), ctx));
    FB_VARS.forEach(n => vm.runInContext(constante(SRC.fb, n), ctx));
    vm.runInContext(bloque(SRC.fb, 'var FB_VEH_KNOWN_KEY'), ctx, { filename: 'veh-' + id + '.js' });
    ctx.store = store;
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

    console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
    process.exitCode = fallaron ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
