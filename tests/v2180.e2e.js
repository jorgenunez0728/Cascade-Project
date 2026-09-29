// Verificación en navegador de 2.18.0 → 2.20.0 — la prueba de VETS y el checklist los hace
// quien libera (desde Técnico); las fallas de VETS las decide SOLO quien aprueba, al aprobar.
//  - Técnico: adjunta el reporte real "solo reporte" (2.17.1) sin ver ninguna falla, llena el
//    checklist y ENVÍA a aprobación aunque haya una falla de VETS sin decidir.
//  - Signatario: en Aprobación ve la falla, el botón de aprobar lo explica, "Aprobar" abre la
//    decisión; decide y se desbloquea. Quien liberó no puede decidir.
//  - Cambiar de usuario con la pantalla abierta la repinta con los permisos nuevos.
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
        { id: 'sara', name: 'Sara Signataria', role: 'Signatario', active: true },
        { id: 'pau', name: 'Pau Practicante', role: 'Practicante', active: true }], tasks: [], projects: [], alerts: [] }));
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

    const abrir = (tab) => page.evaluate((tab) => {
        switchPlatform('cop15');
        document.querySelector('#platform-cop15 .tab[data-tab="liberacion"]').click();
        libSwitchSubtab(tab === 'liberacion' ? 'liberador' : 'aprobador');
        const s = document.getElementById(tab === 'liberacion' ? 'releaseVehSelect' : 'approvalVehSelect');
        if (![...s.options].some(o => o.value === 'v48')) { const o = document.createElement('option'); o.value = 'v48'; s.appendChild(o); }
        s.value = 'v48';
        if (tab === 'liberacion') loadRelease(); else loadApproval();
        const txt = id => { const e = document.getElementById(id); return e && e.style.display !== 'none' ? e.innerText : ''; };
        const b = document.getElementById(tab === 'liberacion' ? 'release-archive-btn' : 'approve-archive-btn');
        return { status: txt('vets-attach-status'), libNote: txt('lib-action-note'), aprNote: txt('appr-vets-note'),
                 decideBtn: !!document.querySelector('#appr-vets-note .lib-action-decide'), why: b ? (b.getAttribute('data-why') || '') : null };
    }, tab);

    console.log('\n== Técnico: adjunta, sin ver fallas ==');
    await abrir('liberacion');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#vets-attach-btn')]);
    await fc.setFiles({ name: 'WLTC Class3b CL4 5DR 1.0 48V.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX });
    await page.waitForFunction(() => window._vetsCtx && window._vetsCtx.view, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
        const ov = window._vetsCtx && window._vetsCtx.overlay;
        if (!ov) return null;
        return { txt: ov.innerText, radios: ov.querySelectorAll('.vets-lvl').length, disabled: ov.querySelector('[data-modal-btn="1"]').disabled };
    });
    chk('el reporte sin tablas de datos se abre (2.17.1)', !!m, errores.join(' | '));
    if (m) {
        chk('[2.20.0] el Técnico no ve la falla (ni nombre ni ⏳)', !/PM Pre Filter Temp/.test(m.txt) && !/⏳/.test(m.txt) && m.radios === 0, m.txt.slice(0, 400));
        chk('dice que las verificaciones las revisa quien aprueba', /las revisa quien aprueba/.test(m.txt));
        chk('Aplicar habilitado', m.disabled === false);
    }
    await page.evaluate(() => window._vetsCtx.overlay.querySelector('[data-modal-btn="1"]').click());
    await page.waitForTimeout(400);
    const t = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'v48');
        return { s: v.testData.vets, pol: (pnState.vetsChecks || []).length, status: document.getElementById('vets-attach-status').innerText, targetA: v.testData.targetA,
                 toast: [...document.querySelectorAll('.toast, .toast-item, [class*="toast"]')].map(x => x.innerText).join(' | ') };
    });
    chk('se adjuntó y llenó el dinamómetro', t.s && t.s.testRef === '72f4b8ca-1b44-4348-9b60-75104e2eae85' && t.targetA === 113.7);
    chk('no se clasificó nada: queda para el aprobador', t.pol === 0 && t.s.checksFail[0].level === null);
    chk('la franja no menciona fallas', !/falla/i.test(t.status) && /Prueba VETS #856 adjunta/.test(t.status), t.status);
    chk('el aviso tampoco', !/falla/i.test(t.toast), t.toast);

    console.log('\n== Técnico: checklist y envío ==');
    const cl = await page.evaluate(() => {
        document.querySelector('#lib-checklist-content .relcl-all').click();
        // Todos los documentos (la tarjeta se repinta tras cada toque: se buscan de nuevo)
        for (let i = 0; i < 10; i++) {
            const doc = [...document.querySelectorAll('#lib-checklist-content .relcl-opt')].find(b => /Adjunto/.test(b.textContent) && b.getAttribute('aria-pressed') !== 'true');
            if (!doc) break; doc.click();
        }
        const v = db.vehicles.find(x => x.id === 'v48'), c = v.testData.releaseChecklist || {};
        return { objetos: c.objects || {}, by: c.by, aud: _auditEnsureLoaded().filter(a => a.action === 'checklist_liberacion').length,
                 who: (document.querySelector('#lib-checklist-content .relcl-who') || {}).innerText || '' };
    });
    chk('el Técnico marca el checklist, a su nombre y en el historial', Object.values(cl.objetos).every(x => x === 'ok') && Object.keys(cl.objetos).length === 5 && cl.by === 'Beto Técnico' && cl.aud >= 2, JSON.stringify(cl));
    let l = await abrir('liberacion');
    chk('[2.20.0] el Técnico no tiene aviso de "no puedes enviar"', l.libNote === '', l.libNote);
    chk('el botón de enviar no habla de VETS', !/VETS/.test(l.why || ''), l.why);
    const env = await page.evaluate(() => {
        // Aislar: F05 completo y checklist tienen sus propias pruebas; la firma se simula.
        const vp = window.validatePdfCompleteness, sc = window.sigCaptureOpen;
        window.validatePdfCompleteness = () => ({ missing: [], soft: [] });
        window.sigCaptureOpen = (o) => o.onSave({ signerName: 'Beto Técnico', sessionUserName: 'Beto Técnico', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', signedAt: new Date().toISOString() });
        try { submitToApproval(); } finally { window.validatePdfCompleteness = vp; window.sigCaptureOpen = sc; }
        const v = db.vehicles.find(x => x.id === 'v48');
        return { st: v.status, rel: v.testData.signatures && v.testData.signatures.releaser && v.testData.signatures.releaser.signerName, level: v.testData.vets.checksFail[0].level };
    });
    await page.waitForTimeout(300);
    const env2 = await page.evaluate(() => { const v = db.vehicles.find(x => x.id === 'v48'); return { st: v.status, rel: v.testData.signatures && v.testData.signatures.releaser && v.testData.signatures.releaser.signerName }; });
    chk('[2.20.0] el Técnico ENVÍA a aprobación con una falla de VETS sin decidir', env2.st === 'pending-approval' && env2.rel === 'Beto Técnico', JSON.stringify([env, env2]));

    console.log('\n== Quien liberó no decide ==');
    const auto = await page.evaluate(() => { const v = db.vehicles.find(x => x.id === 'v48'); return vetsCanDecideFor(v); });
    chk('el Técnico que liberó no puede decidir la falla', auto.ok === false, JSON.stringify(auto));

    console.log('\n== Signatario: decide al aprobar ==');
    await page.evaluate(() => authCreateSession({ id: 'sara', name: 'Sara Signataria', role: 'Signatario' }));
    await page.waitForTimeout(2500);
    const rol = await page.evaluate(() => authState.currentUser && authState.currentUser.role);
    chk('sesión de Signatario', rol === 'Signatario', rol);
    let a = await abrir('aprobacion');
    chk('en Aprobación ve la falla y el botón para decidirla', a.decideBtn && /PM Pre Filter Temp/.test(a.aprNote), a.aprNote);
    const bloqueo = await page.evaluate(() => {
        approveAndArchive();
        const ov = window._vetsCtx && window._vetsCtx.mode === 'decidir' ? window._vetsCtx.overlay : null;
        const v = db.vehicles.find(x => x.id === 'v48');
        return { abierto: !!ov, st: v.status, radios: ov ? ov.querySelectorAll('.vets-lvl').length : 0, disabled: ov ? ov.querySelector('[data-modal-btn="1"]').disabled : null };
    });
    chk('"Aprobar" no aprueba: abre la decisión', bloqueo.abierto && bloqueo.st === 'pending-approval' && bloqueo.radios === 3 && bloqueo.disabled === true, JSON.stringify(bloqueo));
    await page.evaluate(() => {
        const ov = window._vetsCtx.overlay;
        const r = ov.querySelector('.vets-lvl[value="desacreditada"]'); r.checked = true; r.dispatchEvent(new Event('change'));
        const tx = ov.querySelector('.vets-lvl-reason'); tx.value = 'El sensor de prefiltro no está conectado en VETS'; tx.dispatchEvent(new Event('input'));
        ov.querySelector('[data-modal-btn="1"]').click();
    });
    await page.waitForTimeout(400);
    const d = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'v48'), c = v.testData.vets.checksFail[0];
        return { level: c.level, by: c.decidedBy, pol: JSON.parse(JSON.stringify(pnState.vetsChecks || [])),
                 note: (document.getElementById('appr-vets-note') || {}).style ? document.getElementById('appr-vets-note').style.display : '?',
                 why: document.getElementById('approve-archive-btn').getAttribute('data-why') || '', tl: v.timeline.map(x => x.action),
                 aud: _auditEnsureLoaded().filter(a => /^vets_/.test(a.action)).map(a => a.action) };
    });
    chk('la falla queda desacreditada, decidida por la Signataria', d.level === 'desacreditada' && d.by === 'Sara Signataria', JSON.stringify([d.level, d.by]));
    chk('y para todo el laboratorio', d.pol.length === 1 && d.pol[0].level === 'desacreditada');
    chk('la nota de Aprobación desaparece', d.note === 'none', d.note);
    chk('el botón de aprobar ya no habla de VETS', !/VETS/.test(d.why), d.why);
    chk('línea de tiempo y auditoría', d.tl.includes('Fallas de VETS decididas') && d.aud.includes('vets_fallas_decididas') && d.aud.includes('vets_importado'), d.aud.join());

    console.log('\n== Cambiar de usuario repinta la pantalla abierta ==');
    await page.evaluate(() => { const v = db.vehicles.find(x => x.id === 'v48'); v.status = 'ready-release'; saveDB(); });
    await page.evaluate(() => authCreateSession({ id: 'pau', name: 'Pau Practicante', role: 'Practicante' }));
    await page.waitForTimeout(2500);
    l = await abrir('liberacion');
    const cambio = await page.evaluate(() => {
        authCreateSession({ id: 'beto', name: 'Beto Técnico', role: 'Técnico' });
        const n = document.getElementById('lib-action-note');
        return n.style.display === 'none' ? '' : n.innerText;
    });
    chk('el Practicante ve que enviar lo hace otro rol', /Enviar a aprobación lo hace/.test(l.libNote), l.libNote);
    chk('al pasar a Técnico ese aviso se quita sin recargar', cambio === '', cambio);

    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
