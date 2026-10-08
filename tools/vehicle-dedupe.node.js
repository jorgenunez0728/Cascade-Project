// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.37.1] Limpieza de una sola vez: documentos duplicados de vehículos ║
// ║  en la nube (stations/KIA-EMLAB/vehicles).                            ║
// ╚══════════════════════════════════════════════════════════════════════╝
// La app junta los vehículos por VIN al leer, así que un VIN con varios documentos se ve
// como uno — pero los documentos sobrantes se quedaban para siempre (82 para 53 vehículos
// el 8-oct-2026). Desde 2.37.1 cada equipo retira las copias superadas por su cuenta; esto
// limpia lo que ya existía.
//
// Qué hace, por VIN con varios documentos (fbVehDupPlan, js/firebase-sync.js — PURA):
//   · decide cuál se queda con la MISMA regla de la app (_fbMergeVehicle);
//   · si las copias traían bitácora distinta, el documento que se queda recibe la unión;
//   · los demás se marcan deleted + supersededBy SIN borrar su json (reversible).
// Nunca toca lo marcado como borrado (eso lo hace la app) ni crea marcas de borrado.
//
// Por defecto SOLO REVISA (imprime el plan). Aplica con DEDUPE_APPLY=1.
//   FB_LAB_PASSWORD (secreto) · DEDUPE_APPLY=1 · DEDUPE_FIXTURE=archivo.json (docs crudos, sin nube)
'use strict';
const fs = require('fs');
const { loadDigestEnv } = require('./digest-env');
const { createFbRest } = require('./fb-rest');

const env = process.env;
const APPLY = env.DEDUPE_APPLY === '1' || env.DEDUPE_APPLY === 'true';
const log = (...a) => console.log('[limpieza]', ...a);
const P = loadDigestEnv();
const BATCH = 200;   // escrituras por commit (Firestore admite 500)

const tail = vin => '…' + String(vin || '').slice(-6);
const day = iso => String(iso || '').slice(0, 10) || '—';

async function main() {
    let docs, tombs = [], fbr = null;
    if (env.DEDUPE_FIXTURE) {
        const j = JSON.parse(fs.readFileSync(env.DEDUPE_FIXTURE, 'utf8'));
        docs = j.docs || []; tombs = j.tombs || [];
    } else {
        fbr = createFbRest(P, env.FB_LAB_PASSWORD);
        await fbr.login();
        docs = await fbr.listAll('vehicles');
        const meta = await fbr.getDoc('cop15meta/current');
        try { tombs = (JSON.parse((meta && meta.json) || '{}').deletedVehicles) || []; } catch (e) { tombs = []; }
    }
    if (!docs.length) throw new Error('La nube no devolvió documentos de vehículos: no se hace nada.');

    const plan = P.fbVehDupPlan(docs, tombs);
    const retires = [].concat.apply([], plan.groups.map(g => g.retire));
    const updates = plan.groups.filter(g => g.update);
    log(`${plan.docs} documentos · ${plan.live} vivos · ${plan.vehicles} vehículos distintos` +
        (plan.tombstoned ? ` · ${plan.tombstoned} con marca de borrado (no se tocan)` : ''));
    log(`${plan.groups.length} VIN con copias → se retiran ${retires.length} documento(s)` +
        (updates.length ? `, ${updates.length} documento(s) que se quedan reciben la bitácora unida` : ''));
    // [2.37.2] Quién subió cada copia y con qué versión: si una copia retirada vuelve, dice qué equipo la revivió.
    const byId = {};
    docs.forEach(d => { if (d && d._id) byId[d._id] = d; });
    const devVer = {};
    if (fbr) {
        const writers = {};
        plan.groups.forEach(g => g.copies.forEach(c => { const w = (byId[c.docId] || {}).writer; if (w) writers[w] = true; }));
        for (const w of Object.keys(writers)) {
            try { const d = await fbr.getDoc('devices/' + w); devVer[w] = d ? (d.version || d.appVersion || '?') + (d.build ? ' · build ' + d.build : '') : 'sin registro (anterior a 2.14.0)'; }
            catch (e) { devVer[w] = '?'; }
        }
    }
    plan.groups.forEach(g => {
        log(`${tail(g.vin)}  alta ${day(g.copies[0].registeredAt)}`);
        g.copies.forEach(c => {
            const d = byId[c.docId] || {};
            log(`    ${c.docId === g.keep ? 'SE QUEDA' : 'se retira'}  ${c.docId}  alta ${day(c.registeredAt)}  ${c.status}` +
                `  editado ${day(c.updatedAt)}  bitácora ${c.timeline}` +
                `  · subido ${String(d.serverTs || '—').slice(0, 19)} por ${d.writer || '—'}` +
                (d.writer && devVer[d.writer] ? ` (${devVer[d.writer]})` : ''));
        });
    });

    if (!APPLY) {
        log('SOLO REVISIÓN: no se escribió nada. Para aplicar: Run workflow → Limpiar duplicados = aplicar.');
        return;
    }
    if (!fbr) { log('DEDUPE_FIXTURE: no hay nube a la cual escribir.'); return; }
    const writes = P.fbVehWrites(updates.map(g => g.merged), [], null, fbr.docName, 'limpieza-duplicados', retires);
    for (let i = 0; i < writes.length; i += BATCH) {
        await fbr.commit(writes.slice(i, i + BATCH));
        log(`aplicado ${Math.min(i + BATCH, writes.length)} de ${writes.length}`);
    }
    log(`LISTO: ${retires.length} documento(s) retirados (con supersededBy, json conservado).`);
}

main().catch(e => { console.error('[limpieza] ERROR', e.message); process.exitCode = 1; });
