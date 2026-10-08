// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.37.1] Firestore por REST para los procesos fuera de la app        ║
// ║  (tools/daily-digest.node.js, tools/vehicle-dedupe.node.js).          ║
// ║  Inicia sesión con la cuenta del laboratorio (FB_LAB_PASSWORD): sigue ║
// ║  funcionando cuando se publiquen las reglas (proveedor `password`).   ║
// ╚══════════════════════════════════════════════════════════════════════╝
'use strict';

/** P = entorno de loadDigestEnv() (trae FIREBASE y fbFromFirestoreValue del código real). */
function createFbRest(P, password) {
    const FB = P.FIREBASE;
    const ROOT = `projects/${FB.projectId}/databases/(default)/documents`;
    const BASE = `https://firestore.googleapis.com/v1/${ROOT}/stations/${FB.station}`;
    let TOKEN = null;

    async function login() {
        if (!password) throw new Error('Falta el secreto FB_LAB_PASSWORD (contraseña del laboratorio).');
        const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: FB.labEmail, password, returnSecureToken: true })
        });
        const j = await r.json();
        if (!r.ok) throw new Error('No se pudo iniciar sesión con la cuenta del laboratorio: ' + ((j.error && j.error.message) || r.status));
        TOKEN = j.idToken;
    }
    async function rest(method, suffix, body, query) {
        const url = `${BASE}/${suffix}${query ? '?' + query : ''}`;
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
            body: body ? JSON.stringify(body) : undefined });
        if (r.status === 404 && method === 'GET') return null;
        const t = await r.text();
        if (!r.ok) throw new Error(`${method} ${suffix}: ${r.status} ${t.slice(0, 200)}`);
        return t ? JSON.parse(t) : {};
    }
    const docToObj = doc => {
        const o = P.fbFromFirestoreValue({ mapValue: { fields: (doc && doc.fields) || {} } }) || {};
        o._id = doc && doc.name ? doc.name.split('/').pop() : '';
        o._updateTime = doc && doc.updateTime;
        return o;
    };
    function toValue(v) {
        if (v === null || v === undefined) return { nullValue: null };
        if (typeof v === 'boolean') return { booleanValue: v };
        if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        if (typeof v === 'string') return { stringValue: v };
        if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
        return { mapValue: { fields: toFields(v) } };
    }
    function toFields(obj) {
        const f = {};
        Object.keys(obj).forEach(k => { f[k] = toValue(obj[k]); });
        return f;
    }
    async function listAll(col) {
        const out = [];
        let token = '';
        do {
            const res = await rest('GET', col, null, 'pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
            ((res && res.documents) || []).forEach(d => out.push(docToObj(d)));
            token = (res && res.nextPageToken) || '';
        } while (token);
        return out;
    }
    async function getDoc(suffix) {
        const d = await rest('GET', suffix);
        return d ? docToObj(d) : null;
    }
    async function getRaw(suffix) { return rest('GET', suffix); }
    async function patchDoc(suffix, obj, fieldsOnly) {
        const q = fieldsOnly ? fieldsOnly.map(f => 'updateMask.fieldPaths=' + encodeURIComponent(f)).join('&') : '';
        return rest('PATCH', suffix, { fields: toFields(obj) }, q);
    }
    async function del(suffix) { return rest('DELETE', suffix); }
    /** Escrituras de `documents:commit` (la misma forma que arma fbVehWrites en la app). */
    async function commit(writes) {
        const r = await fetch(`https://firestore.googleapis.com/v1/${ROOT}:commit`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
            body: JSON.stringify({ writes })
        });
        const t = await r.text();
        if (!r.ok) throw new Error(`commit: ${r.status} ${t.slice(0, 300)}`);
        return t ? JSON.parse(t) : {};
    }
    /** El nombre completo de un documento de la estación (para `commit`). */
    const docName = suffix => `${ROOT}/stations/${FB.station}/${suffix}`;

    return { login, rest, listAll, getDoc, getRaw, patchDoc, del, commit, docName };
}

module.exports = { createFbRest };
