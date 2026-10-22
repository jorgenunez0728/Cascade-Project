// Pruebas de 3.20.0 — la base del equipo vive en IndexedDB (js/app.js, bloque dbStore).
// Corre el bloque real en un `vm` con un IndexedDB falso (asíncrono, con fallas a pedido).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const ini = APP.indexOf('var DB_LS_KEY');
const fin = APP.indexOf('// [M00c] REGULATION PROFILES');
if (ini < 0 || fin < 0) throw new Error('no se encontró el bloque dbStore en app.js');
const BLOQUE = APP.slice(ini, APP.lastIndexOf('// ====', fin));

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle !== undefined ? ' — ' + JSON.stringify(detalle) : '')); }
}
const espera = (ms) => new Promise(r => setTimeout(r, ms || 0));

/** IndexedDB falso: un solo almacén clave→valor por base, operaciones asíncronas. */
function fakeIdb(opts) {
    opts = opts || {};
    const bases = {};   // nombre → Map
    const stats = { puts: 0, opens: 0 };
    function req() { return { onsuccess: null, onerror: null, result: undefined, error: null }; }
    const api = {
        stats, bases,
        failPut: !!opts.failPut, failOpen: !!opts.failOpen, getOverride: opts.getOverride || null,
        open(nombre) {
            stats.opens++;
            const r = req();
            r.onupgradeneeded = null; r.onblocked = null;
            setImmediate(() => {
                if (api.failOpen) { r.error = new Error('open'); if (r.onerror) r.onerror({}); return; }
                const nueva = !bases[nombre];
                if (nueva) bases[nombre] = new Map();
                const store = bases[nombre];
                const conn = {
                    objectStoreNames: { contains: () => true },
                    createObjectStore() {},
                    close() {},
                    transaction() {
                        const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
                        let pend = 0, fallo = false;
                        const terminar = () => setImmediate(() => {
                            if (fallo) { tx.error = new Error('tx'); if (tx.onerror) tx.onerror({}); else if (tx.onabort) tx.onabort({}); }
                            else if (tx.oncomplete) tx.oncomplete({});
                        });
                        tx.objectStore = () => ({
                            put(v, k) {
                                stats.puts++;
                                if (api.failPut) { fallo = true; terminar(); return req(); }
                                store.set(k, JSON.parse(JSON.stringify(v))); pend++; terminar(); return req();
                            },
                            get(k) {
                                const r2 = req();
                                setImmediate(() => {
                                    let v = store.get(k);
                                    if (api.getOverride) v = api.getOverride(v);
                                    r2.result = v; if (r2.onsuccess) r2.onsuccess({});
                                    terminar();
                                });
                                return r2;
                            },
                            delete(k) { store.delete(k); terminar(); return req(); }
                        });
                        return tx;
                    }
                };
                r.result = conn;
                if (nueva && r.onupgradeneeded) r.onupgradeneeded({ target: r });
                if (r.onsuccess) r.onsuccess({ target: r });
            });
            return r;
        }
    };
    return api;
}

function fakeLs(inicial) {
    const m = new Map(Object.entries(inicial || {}));
    return {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: k => { m.delete(k); },
        _m: m
    };
}

function contexto(ls, idb) {
    const eventos = [];
    const toasts = [];
    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        localStorage: ls,
        indexedDB: idb ? idb : undefined,
        setTimeout, clearTimeout, Promise, JSON, Date, Math,
        CustomEvent: function(t, o) { this.type = t; this.detail = o && o.detail; },
        window: { addEventListener() {}, dispatchEvent(e) { eventos.push(e.type); } },
        document: undefined,
        navigator: undefined,
        bootProgress() {}, showToast(m) { toasts.push(m); }, pnStorageScanInvalidate() {}
    };
    vm.createContext(ctx);
    vm.runInContext(BLOQUE + '\n;globalThis.__db = function(){ return db; };', ctx);
    ctx.__eventos = eventos; ctx.__toasts = toasts;
    return ctx;
}

const RAW = JSON.stringify({ version: '11.0', lastId: 2, vehicles: [{ id: 'v1', vin: 'KNA1', _rev: 'abc', testData: { signatures: { releaser: { image: 'data:image/png;base64,AAAA' } } } }] });

(async () => {
    console.log('\n== dbStoreBootPlan (PURA) ==');
    {
        const c = contexto(fakeLs(), null);
        ok('sin IndexedDB → ls-only', c.dbStoreBootPlan(RAW, false) === 'ls-only' && c.dbStoreBootPlan(null, false) === 'ls-only');
        ok('localStorage válido + IndexedDB → adopt-ls', c.dbStoreBootPlan(RAW, true) === 'adopt-ls');
        ok('sin localStorage → idb-load', c.dbStoreBootPlan(null, true) === 'idb-load');
        ok('localStorage dañado → idb-load (no se adopta basura)', c.dbStoreBootPlan('{roto', true) === 'idb-load');
    }

    console.log('\n== Migración desde localStorage ==');
    {
        const ls = fakeLs({ kia_db_v11: RAW });
        const idb = fakeIdb();
        const c = contexto(ls, idb);
        ok('antes de cargar: no está lista y dbPersist devuelve false', !c.dbStoreIsReady() && c.dbPersist() === false);
        await espera(20);
        ok('quedó lista sobre IndexedDB', c.dbStoreIsReady() && c.dbStoreStats().backend === 'idb', c.dbStoreStats());
        const guardado = idb.bases.kia_emlab_db.get('db');
        ok('IndexedDB guarda el string EXACTO (los _rev no cambian)', guardado && guardado.json === RAW);
        ok('la copia de localStorage se borró y quedó la marca', ls.getItem('kia_db_v11') === null && JSON.parse(ls.getItem('kia_db_store')).backend === 'idb');
        ok('db en memoria = lo de localStorage', JSON.stringify(c.__db()) === RAW);
        ok('avisa db:loaded', c.__eventos.indexOf('db:loaded') >= 0);
        c.dbStoreFreeze();
    }
    {
        const ls = fakeLs({ kia_db_v11: RAW });
        const idb = fakeIdb({ getOverride: () => ({ json: RAW + ' ' }) });
        const c = contexto(ls, idb);
        await espera(20);
        ok('si la relectura no coincide, se queda en localStorage sin borrar nada',
            c.dbStoreStats().backend === 'ls' && ls.getItem('kia_db_v11') === RAW && ls.getItem('kia_db_store') === null);
    }
    {
        const ls = fakeLs({ kia_db_v11: RAW });
        const idb = fakeIdb({ failPut: true });
        const c = contexto(ls, idb);
        await espera(20);
        ok('si la escritura de la migración falla, sigue como antes', c.dbStoreStats().backend === 'ls' && ls.getItem('kia_db_v11') === RAW);
        ok('y guardar en ese modo escribe en localStorage', c.dbPersist() === true && ls.getItem('kia_db_v11') === RAW);
    }

    console.log('\n== Carga desde IndexedDB ==');
    {
        const idb = fakeIdb();
        idb.bases.kia_emlab_db = new Map([['db', { v: 1, json: RAW }]]);
        const ls = fakeLs({ kia_db_store: JSON.stringify({ v: 1, backend: 'idb' }) });
        const c = contexto(ls, idb);
        ok('mientras carga, db es el vacío por defecto', c.__db().vehicles.length === 0);
        await espera(20);
        ok('carga la base de IndexedDB', c.dbStoreIsReady() && c.__db().vehicles[0].vin === 'KNA1');
        c.dbStoreFreeze();
    }
    {
        const idb = fakeIdb({ failOpen: true });
        const ls = fakeLs({ kia_db_store: JSON.stringify({ v: 1, backend: 'idb' }) });
        const c = contexto(ls, idb);
        await espera(20);
        ok('con la marca puesta y sin poder abrir: NO arranca vacía (falla visible)', c.dbStoreStats().state === 'failed' && !c.dbStoreIsReady());
        ok('y no deja guardar', c.dbPersist() === false);
    }
    {
        const idb = fakeIdb({ failOpen: true });
        const c = contexto(fakeLs(), idb);
        await espera(20);
        ok('sin marca (nunca migró) y sin poder abrir: sigue como antes, en localStorage', c.dbStoreIsReady() && c.dbStoreStats().backend === 'ls');
    }
    {
        const c = contexto(fakeLs({ kia_db_v11: RAW }), null);
        ok('sin IndexedDB: lista al instante, en localStorage', c.dbStoreIsReady() && c.dbStoreStats().backend === 'ls');
    }

    console.log('\n== Escrituras ==');
    {
        const ls = fakeLs({ kia_db_v11: RAW });
        const idb = fakeIdb();
        const c = contexto(ls, idb);
        await espera(20);
        const antes = idb.stats.puts;
        c.__db().lastId = 7; c.dbPersist(); c.dbPersist(); c.dbPersist();
        ok('pendiente justo después de guardar', c.dbStoreStats().pending === true);
        await c.dbStoreFlush();
        ok('tres guardados en el mismo turno = UNA escritura', idb.stats.puts - antes === 1, idb.stats.puts - antes);
        ok('lo escrito es lo de memoria', JSON.parse(idb.bases.kia_emlab_db.get('db').json).lastId === 7);
        ls.setItem('kia_db_v11', '{"viejo":1}');
        c.dbPersist(); await c.dbStoreFlush();
        ok('cada escritura en IndexedDB borra la copia de localStorage', ls.getItem('kia_db_v11') === null);

        idb.failPut = true;
        c.__db().lastId = 8;
        ok('el primer guardado tras una falla aún no lo sabe', c.dbPersist() === true);
        const r = await c.dbStoreFlush();
        ok('la escritura fallida se reporta', r === false && !!c.dbStoreStats().lastError);
        ok('error pegajoso: el siguiente guardado devuelve false', c.dbPersist() === false);
        ok('y avisa una sola vez', c.__toasts.filter(t => /No se pudo guardar/.test(t)).length === 1);
        idb.failPut = false;
        await espera(1200);   // reintento a 1 s
        ok('se reintenta solo y se recupera', !c.dbStoreStats().lastError && JSON.parse(idb.bases.kia_emlab_db.get('db').json).lastId === 8, c.dbStoreStats());
        ok('y vuelve a dejar guardar', c.dbPersist() === true);
        await c.dbStoreFlush();

        const p = idb.stats.puts;
        c.dbStoreReplaceRaw('{"restaurado":1}');
        await espera(20);
        ok('restaurar congela: lo pendiente ya no pisa lo restaurado', c.dbPersist() === false && idb.bases.kia_emlab_db.get('db').json === '{"restaurado":1}' && idb.stats.puts === p + 1);
    }

    console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
    process.exitCode = fallaron ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
