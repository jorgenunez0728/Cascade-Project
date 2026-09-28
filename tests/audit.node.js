// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas del historial inmutable (2.6.0)                             ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Carga el código REAL (la sección del historial de app.js, el bloque auditlog de
// firebase-sync.js y los textos de panel.js) en un `vm`, contra un Firestore falso
// que implementa `documents:commit` (atómico, con la precondición "no existe") y
// `runQuery`. Dos "equipos" (dos contextos) comparten ese servidor.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const R = p => fs.readFileSync(path.join(__dirname, '..', 'js', p), 'utf8');
const APP = R('app.js'), SYNC = R('firebase-sync.js'), PANEL = R('panel.js');
const cut = (src, from, to, what) => {
    const a = src.indexOf(from), b = to ? src.indexOf(to, a) : src.length;
    if (a < 0 || b < 0) throw new Error('No se encontró ' + what);
    return src.slice(a, b);
};
const fn = (src, name) => {
    const m = new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}').exec(src);
    if (!m) throw new Error('No se encontró ' + name);
    return m[0];
};

// ── Firestore falso compartido ──────────────────────────────────────────
function makeServer() {
    const docs = {};   // nombre → {fields}
    const S = { docs, commits: 0, failNext: null, offline: false, denyAll: false };
    const decode = v => {
        if (!v) return null;
        if ('stringValue' in v) return v.stringValue;
        if ('integerValue' in v) return parseInt(v.integerValue, 10);
        if ('doubleValue' in v) return v.doubleValue;
        if ('booleanValue' in v) return v.booleanValue;
        if ('nullValue' in v) return null;
        if ('timestampValue' in v) return v.timestampValue;
        return v;
    };
    const resp = (status, body) => Promise.resolve({
        ok: status >= 200 && status < 300, status,
        json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body))
    });
    S.fetch = (url, init) => {
        if (S.offline) return Promise.reject(new TypeError('Failed to fetch'));
        if (S.denyAll) return resp(403, { error: { status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } });
        const body = JSON.parse(init.body || '{}');
        if (/:commit\?/.test(url)) {
            S.commits++;
            for (const w of body.writes) {
                if (w.currentDocument && w.currentDocument.exists === false && docs[w.update.name]) {
                    return resp(S.preconditionStatus || 409, { error: { status: S.preconditionStatus === 400 ? 'FAILED_PRECONDITION' : 'ALREADY_EXISTS', message: 'Document already exists: ' + w.update.name } });
                }
            }
            body.writes.forEach(w => {
                const f = Object.assign({}, w.update.fields);
                (w.updateTransforms || []).forEach(t => { if (t.setToServerValue === 'REQUEST_TIME') f[t.fieldPath] = { timestampValue: '2026-09-28T18:00:00.000Z' }; });
                docs[w.update.name] = { fields: f };
            });
            return resp(200, { writeResults: body.writes.map(() => ({})) });
        }
        if (/:runQuery\?/.test(url)) {
            const q = body.structuredQuery;
            const flt = q.where ? (q.where.compositeFilter ? q.where.compositeFilter.filters : [q.where]) : [];
            let rows = Object.keys(docs).filter(n => /\/auditlog\//.test(n)).map(n => ({ name: n, fields: docs[n].fields }));
            rows = rows.filter(r => flt.every(f => {
                const ts = decode(r.fields.ts), v = f.fieldFilter.value.stringValue;
                return f.fieldFilter.op === 'GREATER_THAN_OR_EQUAL' ? ts >= v : ts <= v;
            }));
            rows.sort((a, b) => decode(b.fields.ts).localeCompare(decode(a.fields.ts)));
            rows = rows.slice(0, q.limit);
            if (q.select) rows = rows.map(r => {
                const f = {};
                q.select.fields.forEach(s => { if (r.fields[s.fieldPath]) f[s.fieldPath] = r.fields[s.fieldPath]; });
                return { name: r.name, fields: f };
            });
            return resp(200, rows.map(r => ({ document: r })));
        }
        return resp(404, { error: { message: 'no' } });
    };
    return S;
}

// ── Un "equipo": su propio localStorage y el código real ────────────────
function makeDevice(server, deviceId, userName) {
    const store = {};
    const ctx = {
        console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, TypeError, isNaN, isFinite, parseInt, parseFloat, Promise,
        setTimeout: (f) => 0, clearTimeout: () => {},
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        window: { addEventListener: () => {} }, document: { addEventListener: () => {}, dispatchEvent: () => {}, visibilityState: 'visible' },
        CustomEvent: function() {}, encodeURIComponent,
        fetch: (u, i) => server.fetch(u, i),
        authGetCurrentUser: () => ({ name: userName, role: 'Signatario' }),
        FB_DEVICE_ID: deviceId,
        fbSync: { enabled: true, stationId: 'KIA-EMLAB' }, fbSyncModules: { audit: true },
        FIREBASE_CONFIG: { projectId: 'p', apiKey: 'k' },
        _fbIdTokenPromise: () => Promise.resolve('tok'), fbQuotaRecord: () => {}, fbPush: () => {}
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    const src = [
        fn(APP, 'debounce'), fn(APP, 'stableStringify'),
        cut(APP, 'var AUDIT_LS_KEY', '// ── View Mode', 'historial en app.js'),
        fn(SYNC, 'fbToFirestoreValue'), fn(SYNC, 'fbFromFirestoreValue'), fn(SYNC, '_fbBkErrText'), fn(SYNC, '_fbBugsRestDocToObj'),
        cut(SYNC, 'var FB_AUDIT_BATCH', null, 'bloque auditlog')
    ].join('\n');
    vm.runInContext(src, ctx, { filename: 'audit-' + deviceId + '.js' });
    ctx.store = store;
    return ctx;
}

const panelCtx = {};
vm.createContext(panelCtx);
vm.runInContext([cut(PANEL, 'var AUDIT_MOD_GROUPS', '/** Fallback renderer for Audit Trail tab', 'textos de panel.js')].join('\n'), panelCtx);

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const clone = x => JSON.parse(JSON.stringify(x));

(async function main() {
    console.log('\n== SHA-256 propio (síncrono, sin librerías) ==');
    {
        const d = makeDevice(makeServer(), 'dev_x', 'X');
        for (const t of ['', 'abc', 'Límite NOx ≤ 0.06 g/km — ñ 😀', 'x'.repeat(5000)]) {
            ok('coincide con crypto de Node: ' + JSON.stringify(t.slice(0, 20)), d.sha256Hex(t) === crypto.createHash('sha256').update(t, 'utf8').digest('hex'));
        }
    }

    console.log('\n== Cadena de un equipo ==');
    const srv = makeServer();
    const A = makeDevice(srv, 'dev_A', 'Ana');
    A.auditLog('cop15', 'vehicle_registered', { type: 'vehicle', id: 'v1', label: 'VIN1' }, 'Alta');
    A.auditLog('cop15', 'vehicle_released', { type: 'vehicle', id: 'v1', label: 'VIN1' }, 'Aprobado', { before: { estado: 'pending-approval' }, after: { estado: 'archived' } });
    A.auditLog('pn', 'regulacion_editada', { type: 'regulation', id: 'r1', label: 'EURO-5' }, 'NOx', { before: { NOx: '0.06 g/km' }, after: { NOx: '0.05 g/km' } });
    const evs = A.auditGetTrail();
    ok('números 1, 2, 3 del mismo equipo', evs.map(e => e.seq).join() === '1,2,3' && evs.every(e => e.device === 'dev_A' && e.v === 2));
    ok('cada uno apunta a la huella del anterior', evs[0].prev === '' && evs[1].prev === evs[0].hash && evs[2].prev === evs[1].hash);
    ok('la huella es la de su contenido', evs.every(e => A.auditEventHash(e) === e.hash));
    ok('antes/después quedan en el evento, no solo en texto', evs[1].before.estado === 'pending-approval' && evs[2].after.NOx === '0.05 g/km');
    ok('la bandeja de salida los tiene antes de cualquier red', A.auditOutbox().length === 3);
    ok('la cadena se guarda al momento (no con retraso)', JSON.parse(A.store.kia_audit_chain).seq === 3);
    const v0 = A.auditVerifyChain(evs);
    ok('verificación: íntegra', v0.ok && v0.checked === 3 && v0.problems === 0, JSON.stringify(v0));

    console.log('\n== Manipulaciones que se detectan ==');
    {
        const sinMedio = [evs[0], evs[2]];
        const r1 = A.auditVerifyChain(sinMedio);
        ok('borrar un evento → hueco', !r1.ok && r1.devices.dev_A.gaps.length === 1 && r1.devices.dev_A.gaps[0].join() === '2,2');
        const editado = clone(evs); editado[1].details = 'Aprobado (retocado)';
        const r2 = A.auditVerifyChain(editado);
        ok('editar el texto de uno → "modificado"', !r2.ok && r2.devices.dev_A.edited.join() === '2');
        const antes = clone(evs); antes[1].before.estado = 'archived';
        ok('editar el "antes" también se detecta', A.auditVerifyChain(antes).devices.dev_A.edited.join() === '2');
        const recalculado = clone(evs); recalculado[1].details = 'otro'; recalculado[1].hash = A.auditEventHash(recalculado[1]);
        const r3 = A.auditVerifyChain(recalculado);
        ok('editar y recalcular su huella → la cadena ya no empata con el siguiente', !r3.ok && r3.devices.dev_A.broken.join() === '3');
        const fork = clone(evs); const f = clone(evs[2]); f.id = 'otro'; f.details = 'x'; f.hash = A.auditEventHash(f); fork.push(f);
        ok('dos eventos distintos con el mismo número → se marca', A.auditVerifyChain(fork).devices.dev_A.forks.join() === '3');
        const conViejo = evs.concat([{ id: 'aud_viejo', ts: '2026-01-01T00:00:00Z', mod: 'tp', action: 'x', user: { name: 'Y' } }]);
        const r4 = A.auditVerifyChain(conViejo);
        ok('los anteriores a 2.6.0 se cuentan aparte, no son un error', r4.ok && r4.legacy === 1);
        ok('un tramo que empieza a la mitad (caché recortado) no cuenta como hueco', A.auditVerifyChain([evs[1], evs[2]]).ok);
        const lines = panelCtx.auditIntegrityLines(r1);
        ok('la pantalla lo dice en palabras', lines.some(l => /faltan los eventos 2 \(1\)/.test(l)), lines.join(' | '));
    }

    console.log('\n== Subida a la nube (solo-crear) ==');
    {
        const r = await A.fbAuditFlush();
        ok('se suben los 3 y la bandeja queda vacía', r.sent === 3 && r.pending === 0 && A.auditOutbox().length === 0, JSON.stringify(r));
        ok('un solo commit (en lote)', srv.commits === 1);
        const names = Object.keys(srv.docs);
        ok('un documento por evento en stations/KIA-EMLAB/auditlog', names.length === 3 && names.every(n => /stations\/KIA-EMLAB\/auditlog\/aud_/.test(n)));
        const w = A.fbAuditCommitWrites([evs[0]], id => 'x/' + id)[0];
        ok('cada escritura exige que NO exista (no puede pisar)', w.currentDocument && w.currentDocument.exists === false);
        ok('y pide la hora del servidor', w.updateTransforms[0].fieldPath === 'serverTs' && w.updateTransforms[0].setToServerValue === 'REQUEST_TIME');
        A.fbSync.stationId = '';
        ok('sin estación todavía (antes de conectar) escribe al espacio compartido, no a "stations//"', /stations\/KIA-EMLAB\/auditlog\/x$/.test(A._fbAuditDocName('x')), A._fbAuditDocName('x'));
        A.fbSync.stationId = 'KIA-EMLAB';
        ok('los campos internos (_*) no viajan', !('_legacy' in A.fbAuditCommitWrites([Object.assign({ _legacy: 1 }, evs[0])], id => id)[0].update.fields));

        // Reintento tras un corte: los mismos eventos vuelven a la bandeja.
        A.localStorage.setItem('kia_audit_outbox', JSON.stringify(evs));
        A.auditLog('inv', 'lectura', null, 'nueva');
        const r2 = await A.fbAuditFlush();
        ok('reintento: lo que ya estaba cuenta como entregado y lo nuevo sube', r2.pending === 0 && Object.keys(srv.docs).length === 4, JSON.stringify(r2));
        srv.preconditionStatus = 400;
        A.localStorage.setItem('kia_audit_outbox', JSON.stringify([evs[0]]));
        const r3 = await A.fbAuditFlush();
        ok('también si la base responde FAILED_PRECONDITION', r3.pending === 0 && !r3.error);
        srv.preconditionStatus = 0;
        const doc = srv.docs[Object.keys(srv.docs)[0]];
        ok('la nube guarda seq, prev, huella y hora del servidor', doc.fields.seq.integerValue === '1' && doc.fields.hash.stringValue && doc.fields.serverTs.timestampValue);
    }

    console.log('\n== Sin red / sin permiso ==');
    {
        srv.offline = true;
        A.auditLog('cop15', 'x', null, 'sin red');
        const r = await A.fbAuditFlush();
        ok('sin red: se queda en la bandeja y el error se entiende', r.pending === 1 && r.error === 'sin conexión con la nube', JSON.stringify(r));
        srv.offline = false; srv.denyAll = true;
        const r2 = await A.fbAuditFlush();
        ok('sin permiso: se queda y dice qué hacer', r2.pending === 1 && /permisos/.test(r2.error), r2.error);
        srv.denyAll = false;
        const r3 = await A.fbAuditFlush();
        ok('al volver: sube', r3.pending === 0 && r3.sent === 1);
        const st = A.fbAuditStatus();
        ok('estado para la pantalla', st.pending === 0 && st.enabled && !st.lastError);
    }

    console.log('\n== Dos equipos ==');
    {
        const B = makeDevice(srv, 'dev_B', 'Beto');
        B.auditLog('tp', 'plan_aceptado', null, 'semana 40');
        A.auditLog('tp', 'plan_editado', null, 'mover');
        B.auditLog('inv', 'calibracion', null, 'balanza');
        await Promise.all([A.fbAuditFlush(), B.fbAuditFlush()]);
        const q = await B.fbAuditFetchRecent(3650);
        const cache = B.auditGetTrail();
        ok('el equipo B ve lo del A (y lo suyo) después de consultar', cache.some(e => e.device === 'dev_A') && cache.some(e => e.device === 'dev_B'), q.events.length + ' eventos');
        const ids = cache.map(e => e.id);
        ok('sin duplicados', new Set(ids).size === ids.length);
        const v = B.auditVerifyChain(cache);
        ok('las dos cadenas, intercaladas, verifican bien', v.ok && Object.keys(v.devices).length === 2, JSON.stringify(v.devices));
        ok('lo que llega de la nube trae su hora del servidor', cache.filter(e => e.device === 'dev_A').every(e => e.serverTs));
        ok('números por equipo independientes', v.devices.dev_B.from === 1 && v.devices.dev_B.to === 2);
    }

    console.log('\n== Consulta por rango (más de 90 días) ==');
    {
        const old = { v: 2, id: 'aud_viejo_1', ts: '2025-01-15T12:00:00.000Z', mod: 'cop15', action: 'x', details: '', user: { name: 'Z', role: '' }, entity: null, device: 'dev_Z', seq: 1, prev: '' };
        old.hash = A.auditEventHash(old);
        await A._fbAuditCommit(A.fbAuditCommitWrites([old], A._fbAuditDocName));
        const r = await A.fbAuditQuery('2025-01-01T00:00:00.000Z', '2025-01-31T23:59:59.999Z', 50);
        ok('trae lo de enero de 2025 y nada más', r.events.length === 1 && r.events[0].id === 'aud_viejo_1' && !r.truncated);
        A.auditSetCloudRange(r.events);
        ok('se ve junto al caché sin guardarse en él', A.auditGetView().some(e => e.id === 'aud_viejo_1') && !A.auditGetTrail().some(e => e.id === 'aud_viejo_1'));
        const r2 = await A.fbAuditQuery('2026-01-01T00:00:00.000Z', '', 2);
        ok('con tope: avisa que hay más', r2.events.length === 2 && r2.truncated);
        ok('la más reciente primero', r2.events[0].ts >= r2.events[1].ts);
    }

    console.log('\n== Historial anterior a 2.6.0 ==');
    {
        const srv2 = makeServer();
        const C = makeDevice(srv2, 'dev_C', 'Caro');
        const viejos = [1, 2, 3].map(i => ({ id: 'aud_legacy_' + i, ts: '2026-09-0' + i + 'T10:00:00.000Z', user: { name: 'Caro', role: '' }, mod: 'tp', action: 'x' + i, entity: null, details: '' }));
        C.localStorage.setItem('kia_audit_trail', JSON.stringify(viejos));
        C.auditReloadFromStorage();
        // Otro equipo ya subió el #2.
        const D = makeDevice(srv2, 'dev_D', 'Dani');
        await D._fbAuditCommit(D.fbAuditCommitWrites([Object.assign({ migrated: true }, viejos[1])], D._fbAuditDocName));
        const n = await C.fbAuditQueueLegacy();
        ok('solo encola los que no están en la nube', n === 2 && C.auditOutbox().map(e => e.id).join() === 'aud_legacy_1,aud_legacy_3', C.auditOutbox().map(e => e.id).join());
        ok('van marcados como migrados', C.auditOutbox().every(e => e.migrated === true));
        await C.fbAuditFlush();
        ok('suben todos, una sola vez', Object.keys(srv2.docs).length === 3 && C.auditOutbox().length === 0);
        ok('la marca de agua evita volver a encolarlos', (await C.fbAuditQueueLegacy()) === 0);
        ok('un evento nuevo NO se toma como heredado', C.fbAuditLegacyPending([{ id: 'a', v: 2, ts: '2027' }], '').length === 0);
    }

    console.log('\n== Pantalla ==');
    {
        ok('"tp" y "testplan" son el mismo módulo en el filtro', panelCtx.auditModGroup('tp') === panelCtx.auditModGroup('testplan') && panelCtx.auditModGroup('pn') === panelCtx.auditModGroup('panel'));
        ok('antes/después en una línea', panelCtx.auditShortValue({ NOx: '0.06 g/km', CO: null }) === 'NOx: 0.06 g/km · CO: —');
        const m = A.auditMergeEvents([{ id: 'a', ts: '2' }, { id: 'b', ts: '1' }], [{ id: 'a', ts: '2', serverTs: 'x' }]);
        ok('unir: la copia que ya pasó por la nube gana y queda en orden', m.map(e => e.id).join() === 'b,a' && m[1].serverTs === 'x');
    }

    console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
    process.exit(fallaron ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
