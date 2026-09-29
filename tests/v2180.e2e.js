// Verificación en navegador de 2.18.0 — Técnico y Especialista adjuntan la prueba de VETS;
// las fallas nuevas las decide el liberador.
//  - Sesión de Técnico: Liberación dice que sí puede adjuntar; la vista previa marca la falla
//    nueva con ⏳ (sin opciones para clasificar) y Aplicar está habilitado; nada se clasifica.
//  - Sesión de Signatario: la franja ofrece "Decidir…", el botón de liberar explica por qué
//    está bloqueado, enviar a aprobación abre la decisión; al decidir se desbloquea.
//  - Usa la exportación REAL "solo reporte" (2.17.1), armada desde su fixture.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

// ── .xlsx a partir de las hojas del fixture ─────────────────────────────
function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function sheetXml(grid) {
    let x = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    Object.keys(grid).map(Number).sort((a, b) => a - b).forEach(r => {
        x += '<row r="' + r + '">';
        Object.keys(grid[r]).map(Number).sort((a, b) => a - b).forEach(c => {
            const v = grid[r][c], ref = colName(c) + r;
            x += /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v) ? '<c r="' + ref + '"><v>' + v + '</v></c>'
                : '<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEsc(v) + '</t></is></c>';
        });
        x += '</row>';
    });
    return x + '</sheetData></worksheet>';
}
function zip(files) {
    const locals = [], centrals = []; let off = 0;
    Object.keys(files).forEach(name => {
        const raw = Buffer.from(files[name], 'utf8'), data = zlib.deflateRawSync(raw), nm = Buffer.from(name);
        const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
        lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
        const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
        ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
        locals.push(lh, nm, data); centrals.push(ch, nm); off += 30 + nm.length + data.length;
    });
    const cd = Buffer.concat(centrals), eo = Buffer.alloc(22), n = centrals.length / 2;
    eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(n, 8); eo.writeUInt16LE(n, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
    return Buffer.concat(locals.concat([cd, eo]));
}
function xlsxFrom(fixtureName) {
    const g = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', fixtureName), 'utf8'));
    const names = ['Reporte'].concat(Object.keys(g));
    const files = {
        'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns:r="r"><sheets>' + names.map((n, i) =>
            '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '"' + (i ? ' state="hidden"' : '') + ' r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships>' + names.map((n, i) =>
            '<Relationship Id="rId' + (i + 1) + '" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '</Relationships>',
        'xl/worksheets/sheet1.xml': sheetXml({ 1: { 1: 'Reporte de prueba' } })
    };
    names.slice(1).forEach((n, i) => { files['xl/worksheets/sheet' + (i + 2) + '.xml'] = sheetXml(g[n]); });
    return zip(files);
}

const OPS = [{ id: 'beto', name: 'Beto Técnico', role: 'Técnico', active: true },
             { id: 'sara', name: 'Sara Signataria', role: 'Signatario', active: true }];
const SEED = () => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'beto', operatorName: 'Beto Técnico', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'beto', name: 'Beto Técnico', role: 'Técnico', active: true },
        { id: 'sara', name: 'Sara Signataria', role: 'Signatario', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const XLSX = xlsxFrom('vets-eu-reporte-48v.json');
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);

    const setup = await page.evaluate(() => {
        const keys = Object.keys(fieldMapping);
        const cfgRow = allConfigurations.find(x => /EUROPE/i.test(x.REGION || '') && x['EMISSION REGULATION'] === 'PRE-EURO 7');
        const cfg = altaConfigFromCatalog(cfgRow, keys);
        db.vehicles = [{ id: 'v48', vin: '3KPFX51BXTE433243', status: 'ready-release', purpose: 'COP-Emisiones', configCode: cfgRow.codigo_config_text,
            config: cfg, registeredAt: '2026-09-29T15:00:00.000Z', timeline: [], testData: {} }];
        saveDB();
        return { role: authState.currentUser && authState.currentUser.role };
    });
    chk('sesión de Técnico', setup.role === 'Técnico', setup.role);

    const abrirLiberacion = () => page.evaluate(() => {
        switchPlatform('cop15');
        document.querySelector('#platform-cop15 .tab[data-tab="liberacion"]').click();
        const s = document.getElementById('releaseVehSelect');
        if (![...s.options].some(o => o.value === 'v48')) { const o = document.createElement('option'); o.value = 'v48'; s.appendChild(o); }
        s.value = 'v48'; loadRelease();
        const note = document.getElementById('lib-role-note');
        const btn = document.getElementById('release-archive-btn');
        return { note: note && note.style.display !== 'none' ? note.innerText : '', status: document.getElementById('vets-attach-status').innerText,
                 decidir: !!document.querySelector('#vets-attach-status button'), why: btn ? (btn.getAttribute('data-why') || '') : null };
    });

    console.log('\n== Técnico: adjunta ==');
    let l = await abrirLiberacion();
    chk('Liberación le dice que no libera pero sí adjunta VETS', /Sí puedes adjuntar la prueba de VETS/.test(l.note), l.note);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#vets-attach-btn')]);
    await fc.setFiles({ name: 'WLTC Class3b CL4 5DR 1.0 48V.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX });
    await page.waitForFunction(() => window._vetsCtx && window._vetsCtx.view, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
        const ov = window._vetsCtx && window._vetsCtx.overlay;
        if (!ov) return null;
        const b = ov.querySelector('[data-modal-btn="1"]');
        return { txt: ov.innerText, radios: ov.querySelectorAll('.vets-lvl').length, disabled: b.disabled };
    });
    chk('el reporte sin tablas de datos se abre (2.17.1)', !!m, errores.join(' | '));
    if (m) {
        chk('la falla nueva sale con ⏳ para el liberador, sin opciones de clasificar', /⏳ PM Pre Filter Temp/.test(m.txt) && m.radios === 0, 'radios=' + m.radios);
        chk('lo explica', /las decide el liberador antes de enviar a aprobación|la decide el liberador antes de enviar a aprobación/.test(m.txt));
        chk('Aplicar habilitado', m.disabled === false);
    }
    await page.evaluate(() => window._vetsCtx.overlay.querySelector('[data-modal-btn="1"]').click());
    await page.waitForTimeout(400);
    const t = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'v48');
        return { s: v.testData.vets, pol: (pnState.vetsChecks || []).length, status: document.getElementById('vets-attach-status').innerText,
                 decidir: !!document.querySelector('#vets-attach-status button'), targetA: v.testData.targetA };
    });
    chk('se adjuntó y llenó el dinamómetro', t.s && t.s.testRef === '72f4b8ca-1b44-4348-9b60-75104e2eae85' && t.targetA === 113.7, JSON.stringify([t.s && t.s.testRef, t.targetA]));
    chk('no se clasificó nada para el laboratorio', t.pol === 0 && t.s.checksFail[0].level === null);
    chk('la franja dice que queda para el liberador (sin botón para el Técnico)', /1 falla de VETS por decidir/.test(t.status) && /las decide el liberador/.test(t.status) && !t.decidir, t.status);

    console.log('\n== Técnico: llena el checklist (2.19.0) ==');
    const cl = await page.evaluate(() => {
        const errs = [];
        const t0 = document.querySelectorAll('.toast, .toast-item').length;
        document.querySelector('#lib-checklist-content .relcl-all').click();
        const doc = [...document.querySelectorAll('#lib-checklist-content .relcl-opt')].find(b => /Adjunto/.test(b.textContent));
        if (doc) doc.click();
        const v = db.vehicles.find(x => x.id === 'v48'), c = v.testData.releaseChecklist || {};
        return { objetos: c.objects || {}, docs: c.docs || {}, by: c.by, who: (document.querySelector('#lib-checklist-content .relcl-who') || {}).innerText || '',
                 note: document.getElementById('lib-role-note').innerText, st: v.status,
                 aud: _auditEnsureLoaded().filter(a => a.action === 'checklist_liberacion').length };
    });
    chk('el Técnico marca "Todo retirado"', Object.keys(cl.objetos).length === 5 && Object.values(cl.objetos).every(x => x === 'ok'), JSON.stringify(cl.objetos));
    chk('y la evidencia documental', Object.values(cl.docs).includes('ok'), JSON.stringify(cl.docs));
    chk('queda a su nombre y en el historial', cl.by === 'Beto Técnico' && cl.aud >= 2, JSON.stringify([cl.by, cl.aud]));
    chk('la tarjeta dice que lo confirma el liberador con su firma', /Beto Técnico/.test(cl.who) && /lo confirma con su firma/.test(cl.who), cl.who);
    chk('Liberación le dice lo que sí puede hacer', /adjuntar la prueba de VETS y llenar el checklist/.test(cl.note), cl.note);
    chk('llenar el checklist no envía nada', cl.st === 'ready-release');
    // [2.19.1] El botón de enviar le dice al Técnico que ese paso es del liberador (no "decide VETS").
    const tb = await page.evaluate(() => ({ why: document.getElementById('release-archive-btn').getAttribute('data-why') || '',
        note: (document.getElementById('lib-action-note') || {}).innerText || '', decideBtn: !!document.querySelector('#lib-action-note .lib-action-decide') }));
    chk('al Técnico el botón de enviar le dice que lo hace el liberador', /Enviar a aprobación lo hace Signatario/.test(tb.why) && !/Decide primero/.test(tb.why), tb.why);
    chk('junto al botón: el siguiente paso es del liberador, incluida la falla de VETS', /lo hace/.test(tb.note) && /falla de VETS/.test(tb.note) && !tb.decideBtn, tb.note);

    console.log('\n== Signatario: decide ==');
    await page.evaluate(() => localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'sara', operatorName: 'Sara Signataria', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() })));
    await page.reload();
    await page.waitForTimeout(2500);
    l = await abrirLiberacion();
    const rol = await page.evaluate(() => authState.currentUser && authState.currentUser.role);
    chk('sesión de Signatario', rol === 'Signatario', rol);
    chk('la franja le ofrece "Decidir…"', l.decidir && /por decidir/.test(l.status), l.status);
    chk('el botón de liberar explica que falta decidir VETS', /Decide primero la falla de VETS: PM Pre Filter Temp/.test(l.why || ''), l.why);
    const nb = await page.evaluate(() => ({ note: (document.getElementById('lib-action-note') || {}).innerText || '',
        btn: !!document.querySelector('#lib-action-note .lib-action-decide') }));
    chk('[2.19.1] en Acción, junto a Enviar, está el botón para decidir', nb.btn && /PM Pre Filter Temp/.test(nb.note), nb.note);
    const env = await page.evaluate(() => {
        // Aislar el candado de VETS: los de F05 completo y checklist tienen sus propias pruebas.
        const vp = window.validatePdfCompleteness, rc = window.releaseChecklistRows;
        window.validatePdfCompleteness = () => ({ missing: [], soft: [] });
        window.releaseChecklistRows = () => ({ missing: [], rows: [] });
        try { submitToApproval(); } finally { window.validatePdfCompleteness = vp; window.releaseChecklistRows = rc; }
        const ov = window._vetsCtx && window._vetsCtx.mode === 'decidir' ? window._vetsCtx.overlay : null;
        const v = db.vehicles.find(x => x.id === 'v48');
        return { abierto: !!ov, st: v.status, radios: ov ? ov.querySelectorAll('.vets-lvl').length : 0, disabled: ov ? ov.querySelector('[data-modal-btn="1"]').disabled : null };
    });
    chk('enviar a aprobación no envía: abre la decisión', env.abierto && env.st === 'ready-release' && env.radios === 3 && env.disabled === true, JSON.stringify(env));
    await page.evaluate(() => {
        const ov = window._vetsCtx.overlay;
        const r = ov.querySelector('.vets-lvl[value="desacreditada"]'); r.checked = true; r.dispatchEvent(new Event('change'));
        const tx = ov.querySelector('.vets-lvl-reason'); tx.value = 'El sensor de prefiltro no está conectado en VETS'; tx.dispatchEvent(new Event('input'));
        ov.querySelector('[data-modal-btn="1"]').click();
    });
    await page.waitForTimeout(400);
    const d = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'v48'), c = v.testData.vets.checksFail[0];
        const btn = document.getElementById('release-archive-btn');
        return { level: c.level, by: c.decidedBy, pol: JSON.parse(JSON.stringify(pnState.vetsChecks || [])), status: document.getElementById('vets-attach-status').innerText,
                 why: btn ? (btn.getAttribute('data-why') || '') : null, tl: v.timeline.map(x => x.action),
                 aud: _auditEnsureLoaded().filter(a => /^vets_/.test(a.action)).map(a => a.action) };
    });
    chk('la falla queda desacreditada, con quién decidió', d.level === 'desacreditada' && d.by === 'Sara Signataria', JSON.stringify([d.level, d.by]));
    chk('y para todo el laboratorio', d.pol.length === 1 && d.pol[0].level === 'desacreditada');
    chk('la franja ya no tiene pendientes', !/por decidir/.test(d.status), d.status);
    chk('el bloqueo por VETS se quitó del botón de liberar', !/VETS/.test(d.why || ''), d.why);
    chk('línea de tiempo y auditoría', d.tl.includes('Fallas de VETS decididas') && d.aud.includes('vets_fallas_decididas') && d.aud.includes('vets_importado'), d.aud.join());

    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
