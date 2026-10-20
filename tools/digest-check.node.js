// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [3.5.0] Verificador del resumen: ¿ya salió el de este turno?        ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Lo corre el workflow cada 5 min (7:00–7:55 y 16:00–16:55) ANTES de instalar nada. Lee solo
// digest/state (y el viernes, settings/digest) y escribe due=true|false en GITHUB_OUTPUT: si el turno ya salió, el envío ni
// arranca. Si no puede leer, responde true: el envío vuelve a revisar con la misma regla
// (digestSlotDue) y no duplica.
// Pruebas: DIGEST_NOW (ISO) y DIGEST_STATE_FIXTURE (JSON del estado, sin nube).
'use strict';
const fs = require('fs');
const { loadDigestEnv } = require('./digest-env');
const { createFbRest } = require('./fb-rest');

const env = process.env;
function out(due, why) {
    console.log('[verificador] ' + (due ? 'toca enviar' : 'no toca') + ' — ' + why);
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, 'due=' + (due ? 'true' : 'false') + '\n');
}

async function main() {
    const P = loadDigestEnv();
    const lp = P.digestLocalParts(env.DIGEST_NOW || new Date().toISOString());
    let state, settings = null;
    if (env.DIGEST_STATE_FIXTURE) {
        state = JSON.parse(fs.readFileSync(env.DIGEST_STATE_FIXTURE, 'utf8'));
        settings = P.digestSettingsNormalize(state._settings || {});
    }
    else {
        const F = createFbRest(P, env.FB_LAB_PASSWORD);
        await F.login();
        state = (await F.getDoc('digest/state')) || {};
        // [3.12.0] El viernes también cuenta el estatus CoP (solo si tiene destinatarios).
        if (lp.dow === 5 && lp.hour >= P.DIGEST_SHIFT.fin) settings = P.digestSettingsNormalize((await F.getDoc('settings/digest')) || {});
    }
    const slot = P.digestSlotDue(lp, state);
    const cop = P.digestCopDue(lp, state, settings);
    out(!!(slot || cop), slot ? 'turno ' + slot + ' de ' + lp.date + ' ' + lp.hhmm + (cop ? ' + estatus CoP' : '')
        : cop ? 'estatus CoP de la semana del ' + cop
        : 'ya salió el de este turno, fin de semana o antes de las 7:00 (' + lp.date + ' ' + lp.hhmm + ')');
}

main().catch(e => out(true, 'no se pudo leer el estado (' + e.message + '); el envío revisa otra vez'));
