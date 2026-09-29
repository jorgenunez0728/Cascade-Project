// Verificación en navegador de 2.5.0 — Importar resultados de STARS VETS.
//  - El .xlsx se arma aquí con las hojas REALES de la prueba de Europa (fixture) y se
//    sube por el selector de archivo: ejercita el lector del navegador
//    (DecompressionStream), no el de Node.
//  - Liberación: vista previa, verificación que falla por primera vez (hay que
//    clasificarla), aplicar llena gases/dinamómetro/fecha, la política se guarda.
//  - La misma prueba no se adjunta a dos vehículos; un VIN que no coincide lo dice.
//  - Datos → Regulaciones muestra la política; Importante exige justificar.
//  - Historial → Comparar con VETS (validación del importador) y OBFCM en CoP.
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

const SEED = () => {
    const ahora = Date.now();
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'ana', operatorName: 'Ana Manager', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const EU_XLSX = xlsxFrom('vets-eu-wltp.json');
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
        const cfgRow = allConfigurations.find(x => /EUROPE/i.test(x.REGION || '') && x['EMISSION REGULATION'] === 'PRE-EURO 7') ||
                       allConfigurations.find(x => /EUROPE/i.test(x.REGION || ''));
        const base = altaConfigFromCatalog(cfgRow, keys);
        // La configuración tal como la capturó VETS en la prueba real.
        const cfg = Object.assign({}, base, { 'BODY TYPE': '5DR', 'TRANSMISSION': '6MT', 'EMISSION REGULATION': 'PRE-EURO 7', 'REGION': 'EUROPE',
            'ENGINE CAPACITY': '1000cc KAPPA PE', 'TIRE ASSY': '205/55 R16', 'MODEL YEAR (VIN)': '26 MODEL' });
        const firma = { signerName: 'Ana Manager', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', signedAt: new Date().toISOString() };
        const veh = (id, vin, status, extra) => Object.assign({
            id, vin, status, purpose: 'COP-Emisiones', configCode: cfgRow.codigo_config_text, config: JSON.parse(JSON.stringify(cfg)),
            registeredAt: '2026-08-20T15:00:00.000Z', timeline: [], testData: {}
        }, extra || {});
        db.vehicles = [
            veh('e1', '3KPFT51B7TE407968', 'ready-release', { testData: { etw: 1500 } }),
            veh('e2', '3KPFT51B7TE407969', 'ready-release', { config: Object.assign({}, cfg, { 'BODY TYPE': 'WGN' }) }),
            veh('e3', '3KPFT51B7TE407968', 'archived', { archivedAt: '2026-08-26T10:00:00.000Z',
                testData: { signatures: { releaser: firma, approver: firma },
                            gasResults: { liberador: { values: { CO: 0.1955, NOx: 0.0071 } } } } })
        ];
        saveDB();
        return { code: cfgRow.codigo_config_text, profile: (getRegulationProfile('PRE-EURO 7') || { gases: [] }).gases.map(g => g.field + ':' + g.unit + ':' + gasCaptureUnit(g)).join(',') };
    });
    chk('hay un perfil PRE-EURO 7 con gases', !!setup.profile, setup.profile);

    const abrirLiberacion = (id) => page.evaluate((id) => {
        switchPlatform('cop15');
        document.querySelector('#platform-cop15 .tab[data-tab="liberacion"]').click();
        const s = document.getElementById('releaseVehSelect');
        if (![...s.options].some(o => o.value === id)) { const o = document.createElement('option'); o.value = id; s.appendChild(o); }
        s.value = id; loadRelease();
        const b = document.getElementById('vets-attach-btn');
        return { visible: !!(b && b.offsetParent), status: document.getElementById('vets-attach-status').textContent };
    }, id);
    const subir = async (buf, name) => {
        const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#vets-attach-btn')]);
        await fc.setFiles({ name: name || 'WLTC Class3b CL4 5DR.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buf });
        await page.waitForFunction(() => window._vetsCtx && window._vetsCtx.view, null, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(200);
    };
    const modal = () => page.evaluate(() => {
        const ov = window._vetsCtx && window._vetsCtx.overlay;
        if (!ov) return null;
        const btn = ov.querySelector('[data-modal-btn="1"]');
        return { txt: ov.innerText, disabled: btn ? btn.disabled : null, radios: ov.querySelectorAll('.vets-lvl').length,
                 overs: ov.querySelectorAll('.vets-over').length, fixVin: /Corregir el VIN/.test(ov.innerHTML) };
    });
    const cerrar = () => page.evaluate(() => { document.querySelectorAll('.custom-modal-overlay').forEach(o => o.remove()); window._vetsCtx = null; });

    console.log('\n== Liberación: adjuntar la prueba ==');
    let l = await abrirLiberacion('e1');
    chk('el botón "Adjuntar prueba VETS" está en la tarjeta de gases', l.visible);
    await subir(EU_XLSX);
    let m = await modal();
    chk('el navegador lee el .xlsx y abre la vista previa', !!m, errores.join(' | '));
    if (m) {
        chk('identidad: Alta, VETS y ECU coinciden', /VIN coincide \(Alta, VETS y ECU\)/.test(m.txt), m.txt.slice(0, 300));
        chk('sin avisos de configuración (misma que capturó VETS)', !/VETS capturó otra configuración/.test(m.txt));
        chk('lista lo que se llena (gases, dinamómetro, fecha)', /NOx/.test(m.txt) && /Target A/.test(m.txt) && /Fecha y hora de prueba/.test(m.txt));
        chk('ETW ya capturado y distinto: se ofrece, no se pisa solo', m.overs === 1, 'casillas=' + m.overs);
        // [2.20.0] Al adjuntar no se decide ni se ve la falla: la decide quien aprueba.
        chk('[2.20.0] la falla de VETS no se clasifica al adjuntar', m.radios === 0 && !/PM Pre Filter Temp/.test(m.txt) && /las revisa quien aprueba/.test(m.txt));
        chk('OBFCM con la exactitud de VETS (−0.0256 %)', /-0\.0256 %/.test(m.txt) && /CALID 2591TCL46EP0026K/.test(m.txt), (m.txt.match(/OBFCM[\s\S]{0,200}/) || [''])[0]);
        chk('Aplicar habilitado', m.disabled === false);
    }
    await page.evaluate(() => window._vetsCtx.overlay.querySelector('[data-modal-btn="1"]').click());
    await page.waitForTimeout(400);
    const e1 = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'e1');
        const inp = f => { const i = document.querySelector('#lib-gas-entry-content .lib-gas-input[data-field="' + f + '"]'); return i ? i.value : null; };
        return { vets: v.testData.vets, targetA: v.testData.targetA, etw: v.testData.etw, dt: v.testData.testDatetime,
                 nox: inp('NOx'), co2: inp('CO2'), status: document.getElementById('vets-attach-status').textContent,
                 pol: JSON.parse(JSON.stringify(pnState.vetsChecks || [])), aud: _auditEnsureLoaded().filter(a => /^vets_/.test(a.action)).map(a => a.action),
                 tl: (v.timeline[v.timeline.length - 1] || {}).action, st: v.status, size: JSON.stringify(v.testData.vets).length };
    });
    chk('el vehículo guarda el resumen de VETS con su Test Reference', e1.vets && e1.vets.testRef === 'ea4f8af3-b5a3-481d-b7c7-0994cd18628b');
    chk('el resumen es compacto', e1.size < 4096, e1.size + ' bytes');
    chk('dinamómetro llenado en SI y ETW capturado a mano respetado', e1.targetA === 102.5 && e1.etw === 1500, JSON.stringify([e1.targetA, e1.etw]));
    chk('fecha de la prueba llenada', e1.dt === '2026-08-25T10:12');
    chk('gases en la captura del liberador (siguen sin enviarse)', e1.nox !== null && e1.nox !== '' && e1.co2 !== '' && e1.st === 'ready-release', JSON.stringify([e1.nox, e1.co2]));
    chk('la franja dice qué se adjuntó (sin hablar de fallas)', /Prueba VETS #782 adjunta/.test(e1.status) && !/falla|desacreditada/i.test(e1.status), e1.status);
    chk('[2.20.0] nada se clasifica al adjuntar: queda por decidir al aprobar', e1.pol.length === 0 && e1.vets.checksFail[0].level === null);
    chk('queda en el historial la importación', e1.aud.includes('vets_importado'), e1.aud.join());
    chk('línea de tiempo del vehículo', e1.tl === 'Prueba VETS adjunta');

    const recarga = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'e1');
        loadRelease();
        const i = document.querySelector('#lib-gas-entry-content .lib-gas-input[data-field="NOx"]');
        return i ? i.value : null;
    });
    chk('al volver a abrir la Liberación se precarga desde VETS', recarga !== null && recarga !== '', String(recarga));

    console.log('\n== Segundo vehículo: la misma prueba y otro VIN ==');
    await abrirLiberacion('e2');
    await subir(EU_XLSX);
    m = await modal();
    chk('la misma prueba ya adjunta a otro vehículo: no se deja', m && /ya está adjunta al vehículo/.test(m.txt) && m.disabled === true);
    chk('el VIN no coincide con VETS ni con el ECU: lo dice y ofrece corregir', m && /lo más probable es que el Alta se haya tecleado mal/.test(m.txt) && m.fixVin);
    chk('tampoco pregunta por verificaciones (las revisa quien aprueba)', m && m.radios === 0 && /las revisa quien aprueba/.test(m.txt));
    chk('avisa que VETS capturó otra carrocería', m && /VETS capturó otra configuración/.test(m.txt) && /WGN/.test(m.txt));
    await cerrar();

    console.log('\n== Datos → Regulaciones: la política se cambia ahí ==');
    const reg = await page.evaluate(async () => {
        // [2.20.0] La política ya no nace al adjuntar (la decide el aprobador): se siembra aquí.
        vetsPolicySet('PM Pre Filter Temp', 'desacreditada', 'El sensor de prefiltro no está conectado en VETS', { skipAuth: true });
        switchPlatform('panel');
        pnSwitchTab('pn-regulations');
        await new Promise(r => setTimeout(r, 300));
        const txt = (document.getElementById('pn-content') || document.body).innerText;
        vetsPolicyChange('PM Pre Filter Temp', 'importante', null);
        await new Promise(r => setTimeout(r, 200));
        return { txt, level: pnState.vetsChecks[0].level };
    });
    chk('la tarjeta lista la verificación y su motivo', /Verificaciones de VETS/.test(reg.txt) && /PM Pre Filter Temp/.test(reg.txt) && /sensor de prefiltro/.test(reg.txt));
    chk('cambiarla a Importante', reg.level === 'importante');
    await page.evaluate(() => { const v = db.vehicles.find(x => x.id === 'e1'); delete v.testData.vets; saveDB(); });
    await abrirLiberacion('e1');
    await subir(EU_XLSX);
    const imp = await page.evaluate(() => {
        const ov = window._vetsCtx.overlay, btn = ov.querySelector('[data-modal-btn="1"]');
        const antes = btn.disabled;
        btn.click();
        const v = db.vehicles.find(x => x.id === 'e1');
        return { antes, pend: vetsPendingDecisions(v.testData.vets, vetsPolicy()) };
    });
    chk('[2.20.0] Importante: no detiene al adjuntar; queda por justificar al aprobar', imp.antes === false && imp.pend.length === 1 && imp.pend[0].need === 'justificar', JSON.stringify(imp));
    await cerrar();

    console.log('\n== Historial → Comparar con VETS (validación del importador) ==');
    const menu = await page.evaluate(() => {
        switchPlatform('cop15');
        histRowMenu('e3');
        const t = [...document.querySelectorAll('.custom-modal-overlay button')].map(b => b.textContent).join(' | ');
        document.querySelectorAll('.custom-modal-overlay').forEach(o => o.remove());
        return t;
    });
    chk('el menú de un archivado ofrece "Comparar con VETS"', /Comparar con VETS/.test(menu), menu);
    const [fc] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null),
        page.evaluate(() => { vetsAttachStart('comparar', 'e3'); })
    ]);
    if (fc) await fc.setFiles({ name: 'prueba.xlsx', mimeType: 'application/octet-stream', buffer: EU_XLSX });
    await page.waitForFunction(() => window._vetsCtx && window._vetsCtx.view, null, { timeout: 8000 }).catch(() => {});
    m = await modal();
    chk('compara lo tecleado: CO coincide, NOx no', m && /✓ coincide/.test(m.txt) && /✗/.test(m.txt) && /no coinciden con VETS/.test(m.txt), m && m.txt.slice(0, 400));
    await page.evaluate(() => window._vetsCtx.overlay.querySelector('[data-modal-btn="1"]').click());
    await page.waitForTimeout(300);
    const val = await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'e3');
        return { x: v.testData.vetsValidation, st: v.status, co: v.testData.gasResults.liberador.values.CO,
                 aud: _auditEnsureLoaded().some(a => a.action === 'vets_validacion') };
    });
    chk('la comparación se guarda sin cambiar ningún valor ni el estado', val.x && val.x.allOk === false && val.st === 'archived' && val.co === 0.1955);
    chk('y queda en el historial de cambios', val.aud);

    console.log('\n== CoP → Expediente: OBFCM de la familia ==');
    await page.evaluate(() => {
        const v = db.vehicles.find(x => x.id === 'e3');
        v.testData.vets = { testNumber: 782, testStart: '2026-08-25T10:12', obfcm: { fuelL: 1.37, accuracyPct: -0.0255827, distKm: 23 } };
        saveDB();
    });
    const cop = await page.evaluate(async () => {
        switchPlatform('cop');
        const v = db.vehicles.find(x => x.id === 'e3');
        copState.familyKey = copVehicleFamilyKey(v);
        copSetView('dossier');
        await new Promise(r => setTimeout(r, 300));
        return document.getElementById('platform-cop').innerText;
    });
    chk('la tarjeta OBFCM aparece con la exactitud', /OBFCM — exactitud por vehículo/.test(cop) && /-0\.0256 %/.test(cop), (cop.match(/OBFCM[\s\S]{0,200}/) || ['(no aparece)'])[0]);

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));

    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
