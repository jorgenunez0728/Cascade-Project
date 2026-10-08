// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.37.0] Avisos del laboratorio — lo corre GitHub Actions cada hora  ║
// ║  de 7:00 a 17:00 (México), lunes a viernes                            ║
// ║  (.github/workflows/daily-digest.yml).                                ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Cada corrida:
//   1. Inicia sesión con la cuenta del laboratorio y lee de la nube: vehículos (un
//      documento por vehículo), testplan/current, settings/digest, pushsubs y digest/state.
//   2. RESUMEN: si es día hábil, ya son las 7:00 y hoy no ha salido → lo envía por correo
//      (con el jefe en copia si hay escalados), ntfy y Web Push.
//   3. PLAN: por cada plan aceptado que no se haya avisado → correo + ntfy + Web Push.
//      La primera vez solo registra los ya aceptados (no bombardea al estrenarse).
//   4. Guarda digest/state.
// Si una lectura falla o no hay vehículos, NO envía nada (un resumen en ceros por un error
// de lectura sería peor que ninguno) y termina con código 1: GitHub avisa al dueño del repo.
//
// Variables: FB_LAB_PASSWORD, SMTP_USER, SMTP_PASS, VAPID_PUBLIC, VAPID_PRIVATE (secretos);
//   DRY_RUN=1 (no envía ni escribe; deja los HTML en DIGEST_OUT), FORCE_DIGEST=1 (manda el
//   resumen aunque ya haya salido hoy o sea fuera de horario), DIGEST_NOW (ISO, para probar),
//   DIGEST_FIXTURE=archivo.json ({vehicles, tpState, settings, state}: sin nube, para probar).
'use strict';
const fs = require('fs');
const path = require('path');
const { loadDigestEnv } = require('./digest-env');

const env = process.env;
// Prueba: si hay DIGEST_TEST_TO se manda SOLO a esa(s) dirección(es), con "[Prueba]" en el
// asunto, sin copia a escalación, sin ntfy ni Web Push y sin tocar digest/state. Manda sobre DRY_RUN.
const TEST_TO = (env.DIGEST_TEST_TO || '').split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
const TEST = TEST_TO.length > 0;
const DRY = !TEST && (env.DRY_RUN === '1' || env.DRY_RUN === 'true');
const FORCE = env.FORCE_DIGEST === '1' || env.FORCE_DIGEST === 'true';
const OUT = env.DIGEST_OUT || process.cwd();
const log = (...a) => console.log('[aviso]', ...a);

const P = loadDigestEnv();
const FB = P.FIREBASE;
const BASE = `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents/stations/${FB.station}`;

// ── Firestore por REST ─────────────────────────────────────────────────
let TOKEN = null;
async function login() {
    if (!env.FB_LAB_PASSWORD) throw new Error('Falta el secreto FB_LAB_PASSWORD (contraseña del laboratorio).');
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: FB.labEmail, password: env.FB_LAB_PASSWORD, returnSecureToken: true })
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
const toFields = obj => {
    const f = {};
    Object.keys(obj).forEach(k => { f[k] = toValue(obj[k]); });
    return f;
};
function toValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    return { mapValue: { fields: toFields(v) } };
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
async function patchDoc(suffix, obj, fieldsOnly) {
    const q = fieldsOnly ? fieldsOnly.map(f => 'updateMask.fieldPaths=' + encodeURIComponent(f)).join('&') : '';
    return rest('PATCH', suffix, { fields: toFields(obj) }, q);
}

// ── Lectura ────────────────────────────────────────────────────────────
async function readCloud() {
    await login();
    const vehDocs = await listAll('vehicles');
    const parsed = P.fbVehParseDocs(vehDocs);
    // Como la app: juntar por VIN y retirar los borrados (cop15meta.deletedVehicles).
    const meta = await getDoc('cop15meta/current');
    let tombs = [];
    try { tombs = (JSON.parse((meta && meta.json) || '{}').deletedVehicles) || []; } catch (e) { tombs = []; }
    const view = P.digestCloudVehicles(parsed.vehicles, tombs);
    log(`nube: ${vehDocs.length} documentos → ${view.vehicles.length} vehículos` +
        (view.merged ? ` (${view.merged} copia(s) del mismo VIN juntadas)` : '') +
        (view.removed ? ` (${view.removed} borrado(s) retirados)` : ''));
    const tpDoc = await rest('GET', 'testplan/current');
    if (!tpDoc || !tpDoc.fields || !tpDoc.fields.data) throw new Error('No se pudo leer el plan (testplan/current).');
    const tpState = P.fbFromFirestoreValue(tpDoc.fields.data);
    const settings = (await getDoc('settings/digest')) || {};
    const state = (await getDoc('digest/state')) || {};
    const subs = await listAll('pushsubs');
    let last = parsed.maxTs || 0;
    const tpT = Date.parse(tpDoc.updateTime || '') || 0;
    if (tpT > last) last = tpT;
    return { vehicles: view.vehicles, tpState, settings, state, subs, lastChangeAt: last ? new Date(last).toISOString() : '' };
}
function readFixture(file) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { vehicles: j.vehicles || [], tpState: j.tpState || {}, settings: j.settings || {}, state: j.state || {},
             subs: j.subs || [], lastChangeAt: j.lastChangeAt || '' };
}

// ── Canales ────────────────────────────────────────────────────────────
let mailer = null;
async function sendEmail(to, cc, subject, html, text) {
    if (!to.length) { log('correo: sin destinatarios (Datos → Sistema → Avisos del laboratorio) — no se envía'); return 'sin-destinatarios'; }
    if (!env.SMTP_USER || !env.SMTP_PASS) throw new Error('Faltan los secretos SMTP_USER / SMTP_PASS.');
    if (!mailer) {
        const nodemailer = require('nodemailer');
        mailer = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
    }
    await mailer.sendMail({ from: { name: 'EmLab — Laboratorio de Emisiones', address: env.SMTP_USER },
        to: to.join(', '), cc: cc.length ? cc.join(', ') : undefined, subject, html, text });
    log('correo enviado a', to.length, 'destinatario(s)' + (cc.length ? ' + ' + cc.length + ' en copia' : ''));
    return 'ok';
}
async function sendNtfy(topic, push, tag) {
    if (!topic) return 'sin-tema';
    const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, title: push.title, message: push.body, click: push.url, tags: [tag] }) });
    if (!r.ok) throw new Error('ntfy: ' + r.status + ' ' + (await r.text()).slice(0, 120));
    log('ntfy enviado');
    return 'ok';
}
async function sendWebPush(subs, push, tag) {
    if (!subs.length) return 'sin-suscripciones';
    if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) throw new Error('Faltan los secretos VAPID_PUBLIC / VAPID_PRIVATE.');
    const webpush = require('web-push');
    webpush.setVapidDetails('mailto:' + (env.SMTP_USER || 'laboratorio@example.com'), env.VAPID_PUBLIC, env.VAPID_PRIVATE);
    const payload = JSON.stringify({ title: push.title, body: push.body, url: push.url, tag });
    let ok = 0, gone = 0, err = 0;
    for (const s of subs) {
        if (s.daily === false || !s.endpoint) continue;
        try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600 });
            ok++;
        } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) {
                gone++;
                if (!DRY) await rest('DELETE', 'pushsubs/' + s._id).catch(() => {});
            } else { err++; log('web push falló (' + (s.operatorName || s._id) + '):', e.statusCode || e.message); }
        }
    }
    log(`web push: ${ok} enviados, ${gone} vencidos (borrados), ${err} con error`);
    if (err && !ok) throw new Error('Web Push no llegó a ningún teléfono.');
    return 'ok';
}

/** Manda por los tres canales. El correo decide si el aviso cuenta como entregado. */
async function deliver(kind, mail, push, data, errors) {
    const tag = kind === 'plan' ? 'calendar' : 'clipboard';
    if (DRY) {
        const f = path.join(OUT, kind === 'plan' ? `plan-preview-${mail.id}.html` : 'digest-preview.html');
        fs.writeFileSync(f, mail.html);
        log(`[DRY] ${kind}: «${mail.subject}» → ${mail.to.join(', ') || '(sin destinatarios)'}` +
            (mail.cc.length ? ' | CC ' + mail.cc.join(', ') : '') + ` | push: ${push.title} — ${push.body} | ${f}`);
        return true;
    }
    if (TEST) {
        log(`[PRUEBA] ${kind}: «${mail.subject}» → ${mail.to.join(', ')}` +
            (mail.cc.length ? ' (en un envío real iría en copia: ' + mail.cc.join(', ') + ')' : ''));
        try { await sendEmail(mail.to, [], '[Prueba] ' + mail.subject, mail.html, push.title + '\n' + push.body + '\n' + push.url); }
        catch (e) { errors.push('correo: ' + e.message); }
        return false;
    }
    let emailOk = false;
    try { const r = await sendEmail(mail.to, mail.cc, mail.subject, mail.html, push.title + '\n' + push.body + '\n' + push.url); emailOk = true; void r; }
    catch (e) { errors.push('correo: ' + e.message); }
    try { await sendNtfy(data.settings.ntfyTopic, push, tag); } catch (e) { errors.push(e.message); }
    try { await sendWebPush(data.subs, push, kind); } catch (e) { errors.push('web push: ' + e.message); }
    return emailOk;
}

// ── Principal ──────────────────────────────────────────────────────────
async function main() {
    const nowIso = env.DIGEST_NOW || new Date().toISOString();
    const data = env.DIGEST_FIXTURE ? readFixture(env.DIGEST_FIXTURE) : await readCloud();
    if (!data.vehicles.length) throw new Error('La nube no devolvió vehículos: no se envía nada (sería un resumen en ceros).');
    P.__tpSet(data.tpState);
    data.settings = P.digestSettingsNormalize(data.settings);
    const state = Object.assign({ notifiedPlans: {} }, data.state);
    if (!state.notifiedPlans || typeof state.notifiedPlans !== 'object') state.notifiedPlans = {};
    delete state._id; delete state._updateTime;
    const errors = [];
    let dirty = false;

    // La llave pública de Web Push viaja a la app por los ajustes compartidos.
    if (!DRY && !env.DIGEST_FIXTURE && env.VAPID_PUBLIC && data.settings.vapidPublic !== env.VAPID_PUBLIC) {
        await patchDoc('settings/digest', { vapidPublic: env.VAPID_PUBLIC }, ['vapidPublic']);
        log('llave pública de Web Push publicada en los ajustes');
    }

    // 1) Resumen diario
    const lp = P.digestLocalParts(nowIso);
    if (TEST) log('MODO PRUEBA: solo a ' + TEST_TO.join(', ') + ' — no se guarda estado, no hay copia, ntfy ni Web Push');
    const due = TEST || FORCE || (lp.dow >= 1 && lp.dow <= 5 && lp.hour >= 7 && state.lastDigestDate !== lp.date);
    if (due) {
        const d = P.digestCompute({
            vehicles: data.vehicles, planFor: P.tpWeekPlanFor, statusLabels: P.CONFIG.statusLabels,
            settings: data.settings, lastDigestAt: state.lastDigestAt || '', lastChangeAt: data.lastChangeAt
        }, nowIso);
        const push = P.digestPushText(d);
        const ok = await deliver('resumen', { subject: P.digestSubject(d), html: P.digestEmailHTML(d),
            to: TEST ? TEST_TO : d.settings.to, cc: d.escalateTo }, push, data, errors);
        log(`resumen: ${d.vehicles.count} activos, ${d.vehicles.escalated.length} escalados, ${d.approved.length} aprobados`);
        if (DRY || TEST) log('activos: ' + d.vehicles.rows.map(r => `${r.vin} ${r.label} ${r.daysActive}d`).join(' · '));
        if (ok) { state.lastDigestDate = lp.date; state.lastDigestAt = nowIso; dirty = true; }
    } else {
        log('resumen: no toca (ya salió hoy, fin de semana o antes de las 7:00)');
    }

    // 2) Planes aceptados
    const plans = (P.__tpGet().weeklyPlans || []);
    const pending = P.digestPlansToAnnounce(plans, state.notifiedPlans, nowIso, P.tpPlanId);
    if (TEST) {
        // La prueba muestra el aviso del plan aceptado más reciente de esta semana en adelante.
        const all = P.digestPlansToAnnounce(plans, {}, nowIso, P.tpPlanId);
        const e = all[all.length - 1];
        if (e) {
            const a = P.digestPlanAnnouncement(e);
            await deliver('plan', { id: a.planId, subject: P.digestPlanSubject(a), html: P.digestPlanEmailHTML(a),
                to: TEST_TO, cc: [] }, P.digestPlanPushText(a), data, errors);
        } else log('plan: no hay un plan aceptado de esta semana en adelante para la prueba');
    } else if (!state.plansSeeded) {
        pending.forEach(e => { state.notifiedPlans[e.planId] = e.plan.acceptedDate; });
        state.plansSeeded = nowIso; dirty = true;
        log(`plan: primera corrida — ${pending.length} plan(es) ya aceptado(s) se registran sin avisar`);
    } else {
        for (const e of pending) {
            const a = P.digestPlanAnnouncement(e);
            const ok = await deliver('plan', { id: a.planId, subject: P.digestPlanSubject(a), html: P.digestPlanEmailHTML(a),
                to: data.settings.to, cc: [] }, P.digestPlanPushText(a), data, errors);
            if (ok) { state.notifiedPlans[e.planId] = e.plan.acceptedDate; dirty = true; }
        }
        if (!pending.length) log('plan: nada nuevo aceptado');
    }

    // Solo planes de las últimas semanas: el estado no crece sin fin.
    const keepFrom = P.digestAddDays(P.digestMondayOf(lp.date), -28);
    Object.keys(state.notifiedPlans).forEach(id => {
        const p = plans.find(x => P.tpPlanId(x) === id);
        if (!p || String(p.weekDate) < keepFrom) { delete state.notifiedPlans[id]; dirty = true; }
    });

    if (dirty && !DRY && !TEST && !env.DIGEST_FIXTURE) { state.updatedAt = nowIso; await patchDoc('digest/state', state); }
    if (errors.length) {
        errors.forEach(e => console.error('[aviso] ERROR', e));
        process.exitCode = 1;
    }
}

main().catch(e => { console.error('[aviso] ERROR', e.message); process.exitCode = 1; });
