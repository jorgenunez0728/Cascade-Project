// Verificación en navegador de 2.6.0 — Historial de cambios inmutable.
//  - Un cambio real (rol de un operador) queda con cadena, antes/después y en la
//    bandeja de salida; la pantalla de Auditoría lo pinta con integridad ✓.
//  - Quitar un evento del caché → la pantalla marca el hueco.
//  - La subida usa commit REST con precondición "no existe" y hora del servidor
//    (fetch interceptado: no se toca la nube real).
//  - "Buscar en la nube" trae un evento de hace más de 90 días.
//  - El filtro por módulo junta los nombres que significan lo mismo.
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
    const ahora = Date.now();
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'ana', operatorName: 'Ana Manager', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true },
                    { id: 'beto', name: 'Beto', role: 'Técnico', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    // Historial anterior a 2.6.0 (sin cadena).
    localStorage.setItem('kia_audit_trail', JSON.stringify([
        { id: 'aud_old_1', ts: new Date(ahora - 5 * 86400e3).toISOString(), user: { name: 'Ana Manager', role: '' }, mod: 'testplan', action: 'plan_aceptado', entity: null, details: 'semana vieja' }
    ]));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);

    console.log('\n== Un cambio real queda encadenado ==');
    const r1 = await page.evaluate(() => {
        const antes = auditGetTrail().length;
        pnOpUpdate('beto', { role: 'Signatario' });
        const t = auditGetTrail();
        const e = t[t.length - 1];
        return { n: t.length - antes, e, box: auditOutbox().length, chain: JSON.parse(localStorage.getItem('kia_audit_chain')),
                 valid: auditEventHash(e) === e.hash };
    });
    chk('cambiar el rol deja un evento', r1.n >= 1 && r1.e.action === 'operator_updated');
    chk('con antes y después', r1.e.before && r1.e.before.rol === 'Técnico' && r1.e.after.rol === 'Signatario', JSON.stringify([r1.e.before, r1.e.after]));
    chk('con equipo, número y huella válida', !!r1.e.device && r1.e.seq >= 1 && r1.valid && r1.chain.last === r1.e.hash);
    chk('espera en la bandeja de salida (sin sincronización)', r1.box >= 1);

    console.log('\n== Pantalla de Auditoría ==');
    const abrir = () => page.evaluate(async () => {
        switchPlatform('panel');
        pnSwitchTab('pn-audit');
        await new Promise(r => setTimeout(r, 400));
        const root = document.querySelector('[x-show="activeTab === \'pn-audit\'"]');
        return { txt: root ? root.innerText : '', mods: [...root.querySelectorAll('select')][0] ? [...[...root.querySelectorAll('select')][0].options].map(o => o.value) : [] };
    });
    let a = await abrir();
    chk('muestra la tarjeta de integridad con ✓', /Integridad del historial/.test(a.txt) && /✓ \d+ evento\(s\) con cadena, completos y sin cambios/.test(a.txt), a.txt.slice(0, 400));
    chk('cuenta aparte lo anterior a 2.6.0', /anteriores a 2\.6\.0/.test(a.txt));
    chk('dice que la sincronización del historial está apagada', /sincronización del historial está apagada/.test(a.txt));
    chk('pinta el antes/después del evento', /Antes: nombre: Beto · rol: Técnico/.test(a.txt) && /Después: nombre: Beto · rol: Signatario/.test(a.txt));
    chk('el filtro por módulo usa nombres legibles y agrupados', a.mods.includes('Plan') && a.mods.includes('Datos') && !a.mods.includes('tp') && !a.mods.includes('testplan'), a.mods.join(','));

    console.log('\n== Un hueco se ve ==');
    await page.evaluate(() => {
        auditLog('tp', 'plan_editado', null, 'uno');
        auditLog('tp', 'plan_editado', null, 'dos');
        auditLog('tp', 'plan_editado', null, 'tres');
        const t = auditGetTrail();
        const sinUno = t.filter(e => e.details !== 'dos');
        localStorage.setItem('kia_audit_trail', JSON.stringify(sinUno));
        auditReloadFromStorage();
        document.dispatchEvent(new CustomEvent('audit:updated'));
    });
    a = await abrir();
    chk('la pantalla marca los eventos que faltan', /faltan los eventos \d+ \(1\)/.test(a.txt), (a.txt.match(/Integridad[\s\S]{0,300}/) || [''])[0]);

    console.log('\n== Subida a la nube (interceptada) ==');
    const up = await page.evaluate(async () => {
        const commits = [];
        window.fetch = (url, init) => {
            const body = JSON.parse(init.body || '{}');
            if (/:commit\?/.test(url)) { commits.push(body); return Promise.resolve(new Response('{}', { status: 200 })); }
            if (/:runQuery\?/.test(url)) {
                const old = { v: 2, id: 'aud_2025', ts: '2025-01-15T12:00:00.000Z', mod: 'cop15', action: 'vehicle_released', details: 'enero 2025',
                              user: { name: 'Caro', role: 'Signatario' }, entity: null, device: 'dev_Z', seq: 7, prev: 'x' };
                old.hash = auditEventHash(old);
                const doc = { name: 'projects/p/databases/(default)/documents/stations/KIA-EMLAB/auditlog/aud_2025',
                              fields: Object.fromEntries(Object.entries(old).map(([k, v]) => [k, fbToFirestoreValue(v)])) };
                return Promise.resolve(new Response(JSON.stringify([{ document: doc }]), { status: 200 }));
            }
            return Promise.resolve(new Response('{}', { status: 404 }));
        };
        fbSync.enabled = true; fbSyncModules.audit = true;
        const pend = auditOutbox().length;
        const r = await fbAuditFlush();
        const w = commits[0] && commits[0].writes[0];
        return { pend, r, n: commits.length, pre: w && w.currentDocument, tr: w && w.updateTransforms, name: w && w.update.name };
    });
    chk('sube lo pendiente y la bandeja queda vacía', up.pend >= 4 && up.r.pending === 0 && up.r.sent === up.pend, JSON.stringify(up.r));
    chk('en lote (un commit)', up.n === 1);
    chk('solo-crear: precondición "no existe"', up.pre && up.pre.exists === false);
    chk('hora del servidor', up.tr && up.tr[0].setToServerValue === 'REQUEST_TIME');
    chk('un documento por evento en auditlog', /stations\/KIA-EMLAB\/auditlog\/aud_/.test(up.name || ''), up.name);

    console.log('\n== Buscar en la nube (más de 90 días) ==');
    const cloud = await page.evaluate(async () => {
        const root = document.querySelector('[x-show="activeTab === \'pn-audit\'"]');
        const [desde, hasta] = root.querySelectorAll('input[type="date"]');
        desde.value = '2025-01-01'; desde.dispatchEvent(new Event('input'));
        hasta.value = '2025-01-31'; hasta.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 100));
        [...root.querySelectorAll('button')].find(b => /Buscar en la nube/.test(b.textContent)).click();
        await new Promise(r => setTimeout(r, 600));
        return { txt: root.innerText, enCache: auditGetTrail().some(e => e.id === 'aud_2025') };
    });
    chk('trae el evento de enero de 2025 y lo muestra', /1 evento\(s\) de la nube en ese rango/.test(cloud.txt) && /enero 2025/.test(cloud.txt), (cloud.txt.match(/Buscar[\s\S]{0,200}/) || [''])[0]);
    chk('sin meterlo al caché local', cloud.enCache === false);

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
