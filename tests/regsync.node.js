// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas de los límites compartidos (2.7.0)                          ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Código REAL de app.js (perfiles + funciones puras) y firebase-sync.js (publicar /
// consultar) en dos "equipos" contra un Firestore falso: GET de documentos y commit
// atómico con la precondición "no existe".

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = p => fs.readFileSync(path.join(__dirname, '..', 'js', p), 'utf8');
const APP = R('app.js'), SYNC = R('firebase-sync.js');
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

function makeServer() {
    const docs = {};
    const S = { docs, commits: 0 };
    const resp = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status,
        json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
    S.fetch = (url, init) => {
        init = init || {};
        if (/:commit\?/.test(url)) {
            S.commits++;
            const body = JSON.parse(init.body);
            for (const w of body.writes) {
                if (w.currentDocument && w.currentDocument.exists === false && docs[w.update.name]) {
                    return resp(409, { error: { status: 'ALREADY_EXISTS', message: 'Document already exists' } });
                }
            }
            body.writes.forEach(w => {
                const f = Object.assign({}, w.update.fields);
                (w.updateTransforms || []).forEach(t => { f[t.fieldPath] = { timestampValue: '2026-09-28T19:00:00.000Z' }; });
                docs[w.update.name] = { name: w.update.name, fields: f };
            });
            return resp(200, {});
        }
        if ((init.method || 'GET') === 'GET') {
            const name = url.replace('https://firestore.googleapis.com/v1/', '').replace(/\?.*$/, '').split('/').map(decodeURIComponent).join('/');
            return docs[name] ? resp(200, docs[name]) : resp(404, { error: { status: 'NOT_FOUND', message: 'Document "' + name + '" not found.' } });
        }
        return resp(400, { error: { message: 'no' } });
    };
    return S;
}

function makeDevice(server, deviceId, userName) {
    const store = {};
    const audits = [];
    const ctx = {
        console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, TypeError, isNaN, isFinite, parseInt, parseFloat, Promise,
        encodeURIComponent, setTimeout: () => 0, clearTimeout: () => {},
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        window: { addEventListener: () => {}, dispatchEvent: () => {} }, CustomEvent: function() {},
        fetch: (u, i) => server.fetch(u, i),
        auditLog: (...a) => audits.push(a), showToast: () => {},
        authRequire: () => ctx.__canManage !== false, authGetCurrentUserName: () => userName,
        FB_DEVICE_ID: deviceId, fbSync: { enabled: true, stationId: 'KIA-EMLAB' }, fbSyncModules: { audit: true },
        FIREBASE_CONFIG: { projectId: 'p', apiKey: 'k' },
        _fbIdTokenPromise: () => Promise.resolve('tok'), fbQuotaRecord: () => {}
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext([
        fn(APP, 'safeParse'), fn(APP, 'stableStringify'), fn(APP, 'sha256Hex'),
        cut(APP, 'var REGS_LS_KEY', '// ======================================================================\n// [M-GASUNITS]', 'perfiles de regulación'),
        cut(APP, 'function loadRegulations()', 'let activeVehicleId', 'carga y límites compartidos'),
        fn(SYNC, 'fbToFirestoreValue'), fn(SYNC, 'fbFromFirestoreValue'), fn(SYNC, '_fbBkErrText'), fn(SYNC, '_fbBkIsNotFound'),
        fn(SYNC, '_fbBugsRestDocToObj'), fn(SYNC, '_fbBugsRestUrl'), fn(SYNC, '_fbBugsRestSend'),
        cut(SYNC, 'var FB_AUDIT_BATCH', null, 'bloque auditlog + regulaciones')
    ].join('\n'), ctx, { filename: 'reg-' + deviceId + '.js' });
    ctx.store = store;
    ctx.audits = audits;
    return ctx;
}

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const clone = x => JSON.parse(JSON.stringify(x));
const lim = (ctx, reg, field) => {
    const p = ctx.loadRegulations().profiles.find(x => x.name === reg);
    const g = p && p.gases.find(x => x.field === field);
    return g ? g.limit : undefined;
};
const setLim = (ctx, reg, field, v) => {
    const d = ctx.loadRegulations();
    d.profiles.find(x => x.name === reg).gases.find(x => x.field === field).limit = v;
    ctx.saveRegulations();
};

(async function main() {
    const srv = makeServer();
    const A = makeDevice(srv, 'dev_A', 'Ana');
    const B = makeDevice(srv, 'dev_B', 'Beto');

    console.log('\n== Huella y diferencias (PURAS) ==');
    {
        const base = clone(A.loadRegulations().profiles);
        const desordenado = clone(base).reverse().map(p => Object.assign({}, p, { updatedAt: '2030-01-01', createdAt: 'x' }));
        ok('la huella no depende del orden ni de las fechas', A.regProfilesHash(base) === A.regProfilesHash(desordenado));
        const capIgual = clone(base); capIgual[0].gases[0].captureUnit = capIgual[0].gases[0].unit;
        ok('una unidad de captura igual a la del límite no cuenta como cambio', A.regProfilesHash(base) === A.regProfilesHash(capIgual));
        const otro = clone(base);
        const e5 = otro.find(p => p.name === 'EURO-5');
        e5.gases.find(g => g.field === 'NOx').limit = 0.05;
        e5.gases.push({ field: 'PN', label: 'PN', unit: '#/km', limit: null });
        otro.push({ id: 'x', name: 'PRUEBA-LAB', shortName: 'PRUEBA-LAB', gases: [{ field: 'CO', label: 'CO', unit: 'g/km', limit: 2.2 }] });
        const d = A.regProfilesDiff(base, otro);
        ok('diferencia de límite con antes y después', d.some(x => x.profile === 'EURO-5' && x.kind === 'limite' && x.field === 'NOx' && x.antes === '0.06' && x.despues === '0.05'), JSON.stringify(d));
        ok('gas agregado y perfil agregado', d.some(x => x.kind === 'gas-nuevo' && x.field === 'PN') && d.some(x => x.kind === 'perfil-nuevo' && x.profile === 'PRUEBA-LAB'));
        ok('sin cambios → sin diferencias', A.regProfilesDiff(base, desordenado).length === 0);

        const S = A.regSyncState;
        const h = A.regProfilesHash(base), ho = A.regProfilesHash(otro);
        const sh = v => ({ version: v, hash: h, profiles: base });
        ok('nada publicado → sin-publicar', S({ profiles: base }, null).state === 'sin-publicar');
        ok('igual al laboratorio → al-dia', S({ profiles: base }, sh(3)).state === 'al-dia');
        ok('sin cambios propios y versión nueva → atrasado (se adopta solo)', S({ profiles: otro, shared: { version: 2, hash: ho } }, sh(3)).state === 'atrasado');
        ok('cambios propios sobre la versión vigente → cambios-locales', S({ profiles: otro, shared: { version: 3, hash: h } }, sh(3)).state === 'cambios-locales');
        ok('cambios propios y el laboratorio también cambió → conflicto', S({ profiles: otro, shared: { version: 2, hash: 'viejo' } }, sh(3)).state === 'conflicto');
        ok('nunca conciliado y distinto → distinto (NO se adopta solo)', S({ profiles: otro }, sh(3)).state === 'distinto');
        ok('las diferencias van del laboratorio a este equipo', S({ profiles: otro }, sh(3)).diff.some(x => x.antes === '0.06' && x.despues === '0.05'));
    }

    console.log('\n== Primera publicación ==');
    {
        const r = await A.fbRegPublish('COP15 rev. 04');
        ok('el equipo A publica la versión 1', r.ok && r.version === 1, JSON.stringify(r));
        const names = Object.keys(srv.docs);
        ok('se crea regversions/v1 y se escribe settings/regulations en el mismo commit', srv.commits === 1 &&
            names.some(n => /\/regversions\/v1$/.test(n)) && names.some(n => /\/settings\/regulations$/.test(n)));
        const st = await A.fbRegCheck();
        ok('A queda al día', st.state === 'al-dia' && A.loadRegulations().shared.version === 1);
        const ev = A.audits.find(a => a[1] === 'regulacion_publicada');
        ok('queda en el historial con el después (y sin antes: es la primera)', ev && ev[4].before === null && ev[4].after['EURO-5 · NOx'] === '0.06 g/km');
    }

    console.log('\n== Otro equipo con límites propios ==');
    {
        setLim(B, 'EURO-5', 'NOx', 0.08);   // editado a mano hace tiempo, nunca conciliado
        const st = await B.fbRegCheck();
        ok('B se ve "distinto" y NO se cambia solo', st.state === 'distinto' && lim(B, 'EURO-5', 'NOx') === 0.08);
        ok('con la diferencia exacta', st.diff.length === 1 && st.diff[0].antes === '0.06' && st.diff[0].despues === '0.08', JSON.stringify(st.diff));
        const r = await B.fbRegPublish('mis límites');
        ok('publicar sin confirmar el reemplazo se niega', !r.ok && r.state === 'distinto');
        B.regAdoptShared(st.shared, 'prueba');
        const st2 = await B.fbRegCheck();
        ok('al adoptar queda al día con NOx 0.06', st2.state === 'al-dia' && lim(B, 'EURO-5', 'NOx') === 0.06);
        const ev = B.audits.find(a => a[1] === 'regulacion_sincronizada');
        ok('y queda el antes (0.08) y el después (0.06) en el historial', ev && ev[4].before['EURO-5 · NOx'] === '0.08 g/km' && ev[4].after['EURO-5 · NOx'] === '0.06 g/km');
    }

    console.log('\n== Edición → versión nueva → los demás la toman solos ==');
    {
        setLim(A, 'EURO-5', 'NOx', 0.05);
        const st = await A.fbRegCheck();
        ok('A con cambios sin publicar', st.state === 'cambios-locales' && st.diff.length === 1);
        const r = await A.fbRegPublish('Oficio 123');
        ok('publica la versión 2', r.ok && r.version === 2);
        const stB = await B.fbRegCheck({ quiet: true });
        ok('B (sin cambios propios) adopta la versión 2 solo', stB.state === 'al-dia' && lim(B, 'EURO-5', 'NOx') === 0.05 && B.loadRegulations().shared.version === 2);
    }

    console.log('\n== Conflicto ==');
    {
        setLim(B, 'PRE-EURO 7', 'CO', 0.9);    // B edita sobre la v2…
        setLim(A, 'EURO-5', 'THC', 0.09);      // …y A publica la v3 mientras tanto
        await A.fbRegPublish('ajuste THC');
        const st = await B.fbRegCheck();
        ok('B queda en conflicto (no pierde su cambio ni pisa el de A)', st.state === 'conflicto' && lim(B, 'PRE-EURO 7', 'CO') === 0.9 && lim(B, 'EURO-5', 'THC') === 0.1);
        const r1 = await B.fbRegPublish('mío');
        ok('publicar sin confirmar se niega', !r1.ok && r1.state === 'conflicto');
        const r2 = await B.fbRegPublish('reemplazo revisado', { override: true });
        ok('con confirmación explícita publica la versión 4', r2.ok && r2.version === 4);
    }

    console.log('\n== Dos equipos publicando a la vez ==');
    {
        // Otro equipo ya creó la v5 entre la consulta y el commit de B.
        const sh = await B.fbRegFetchShared();
        await A._fbAuditCommit(A.fbRegPublishWrites(5, A.loadRegulations().profiles, { by: 'Ana', at: 'x', note: 'carrera' }, A._fbStationDocName).slice(0, 1));
        setLim(B, 'EURO-5', 'CO', 0.8);
        const r = await B.fbRegPublish('carrera B');
        ok('el segundo en llegar no pisa: se le pide revisar', !r.ok && /Otro equipo publicó la versión 5/.test(r.reason), JSON.stringify(r));
        ok('la versión vigente sigue siendo la 4', (await B.fbRegFetchShared()).version === 4 && sh.version === 4);
    }

    console.log('\n== Permisos y carga ==');
    {
        const C = makeDevice(makeServer(), 'dev_C', 'Caro');
        C.__canManage = false;
        const r = await C.fbRegPublish('x');
        ok('sin permiso de regulaciones no se publica', !r.ok);
        const D = makeDevice(makeServer(), 'dev_D', 'Dani');
        const d = D.loadRegulations();
        d.profiles = d.profiles.filter(p => p.name !== 'SULEV 30');
        d.shared = { version: 3, hash: D.regProfilesHash(d.profiles) };
        D.saveRegulations();
        D._regulationsData = null;
        vm.runInContext('_regulationsData = null;', D);
        ok('con límites compartidos, al cargar NO se reinyecta un perfil de fábrica que el laboratorio quitó', !D.loadRegulations().profiles.some(p => p.name === 'SULEV 30'));
        const E = makeDevice(makeServer(), 'dev_E', 'Eva');
        const e = E.loadRegulations();
        e.profiles = e.profiles.filter(p => p.name !== 'SULEV 30'); E.saveRegulations();
        vm.runInContext('_regulationsData = null;', E);
        ok('sin límites compartidos se sigue agregando (comportamiento anterior)', E.loadRegulations().profiles.some(p => p.name === 'SULEV 30'));
        const off = makeDevice(makeServer(), 'dev_F', 'Fer');
        off.fbSync.enabled = false;
        let msg = '';
        try { await off.fbRegFetchShared(); } catch (e2) { msg = e2.message; }
        ok('sin sincronización lo dice', /apagada/.test(msg));
    }

    console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
    process.exit(fallaron ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
