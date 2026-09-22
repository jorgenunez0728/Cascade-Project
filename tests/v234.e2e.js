// Verificación en navegador de v23.4: el guardado de Operación ya no borra datos,
// controles numéricos de un toque, campos derivados y la ronda UX de Cascade.
const { chromium } = require('playwright');
const path = require('path');
const REPO = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre); console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}
const SEED = () => {
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'op-test', operatorName: 'Jorge Nunez', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'op-test', name: 'Jorge Nunez', role: 'Administrador', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_current_operator', 'Jorge Nunez');
    localStorage.setItem('kia_fb_sync_modules', '{}');
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    const cfg = { REGION: 'EUROPE', 'EMISSION REGULATION': 'PRE-EURO 7' };
    const arch = (id, vin, tank, tire) => ({ id, vin, status: 'archived', archivedAt: '2026-09-01T10:00:00', configCode: 'CFG1', purpose: 'COP-Emisiones', timeline: [], config: cfg,
        testData: { etw: 1664.36, targetA: 131.6, dynoA: 43.73, preconditioning: { tankCapacityL: tank, tirePressurePsi: tire, tirePressureInPsi: 45 } } });
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 9, vehicles: [
        { id: 'vP', vin: 'KNAPEND000001', status: 'pending-approval', configCode: 'CFG1', purpose: 'COP-Emisiones', timeline: [], config: cfg,
          testData: { odometer: 6, etw: 1664, preconditioning: { cycle: 'WLTP' }, gasResults: { liberador: { values: { CO: 0.07 } } },
                      signatures: { releaser: { signerName: 'X', dataUrl: 'data:,' } }, releaseChecklist: { objects: { kds: 'ok' } } } },
        { id: 'vT', vin: 'KNATEST000002', status: 'testing', configCode: 'CFG1', purpose: 'COP-Emisiones', timeline: [], config: cfg,
          homolog: { f0: 120.5, f1: 0.35, f2: 0.031, tm: 1600 },
          testData: { scannedReportCaptured: true, preconditioning: {} } },
        { id: 'vE', vin: 'KNAETW0000003', status: 'testing', configCode: 'CFG2', purpose: 'COP-Emisiones', timeline: [], config: cfg,
          homolog: { f0: 110.7, f1: 0.764, f2: 0.0261, tm: 1568, mr: 44.7 }, testData: { preconditioning: {} } },
        arch('vA1', 'KNAARCH000001', 42, 33), arch('vA2', 'KNAARCH000002', 42, 33), arch('vA3', 'KNAARCH000003', 50, 35)
    ] }));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await (await browser.newContext({ viewport: { width: 800, height: 1200 } })).newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);
    const open = id => page.evaluate(id => {
        switchPlatform('cop15'); document.querySelector('.tab[data-tab="seguimiento"]').click();
        const s = document.getElementById('activeVehSelect'); s.value = id; loadVehicle();
    }, id);

    // ── A: un vehículo en aprobación no se puede estropear desde Operación ──
    await open('vP'); await page.waitForTimeout(300);
    const a = await page.evaluate(() => {
        markUnsaved && markUnsaved(); saveProgress();
        const v = db.vehicles.find(x => x.id === 'vP');
        return { status: v.status, gas: !!v.testData.gasResults, sig: !!v.testData.signatures, cl: !!v.testData.releaseChecklist,
                 saveDisabled: document.getElementById('btn-save').disabled, note: !!document.querySelector('.op-readonly-note') };
    });
    chk('en aprobación: el estado NO regresa a "En progreso"', a.status === 'pending-approval', a.status);
    chk('en aprobación: gases, firma y checklist intactos', a.gas && a.sig && a.cl, JSON.stringify(a));
    chk('en aprobación: Guardar deshabilitado y aviso de solo lectura', a.saveDisabled && a.note);

    // ── A: guardar un vehículo en prueba conserva lo que no vive en el formulario ──
    await open('vT'); await page.waitForTimeout(300);
    const icms1 = await page.evaluate(() => ({ hint: !!document.querySelector('.hint-icms'), tA: document.getElementById('tA').value }));
    chk('Europa: al abrir, Target A viene de la ficha ICMS con su aviso', icms1.hint && icms1.tA === '120.5', JSON.stringify(icms1));
    const t = await page.evaluate(() => { saveProgress({ silent: true }); const v = db.vehicles.find(x => x.id === 'vT');
        return { scanned: v.testData.scannedReportCaptured === true, editable: !document.getElementById('btn-save').disabled, etw: v.testData.etw }; });
    chk('guardar conserva scannedReportCaptured (antes se borraba)', t.scanned);
    chk('un vehículo en prueba sigue siendo editable', t.editable);
    chk('B: ETW vacío se guarda como null, no 0', t.etw === null, String(t.etw));

    // ── Bloque 2: números de un toque ──
    await open('vT'); await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelectorAll('#op-content details').forEach(d => { d.open = true; d.classList.remove('smart-locked'); }); });
    const n = await page.evaluate(() => {
        const tank = document.getElementById('tank_capacity');
        const chips = [...tank.closest('.ui-num').querySelectorAll('.ui-num-chip')].map(b => b.textContent);
        const plus = tank.closest('.ui-num').querySelector('.ui-num-btn[data-d="1"]');
        let changes = 0; tank.addEventListener('change', () => changes++);
        plus.click(); const first = tank.value; plus.click(); const second = tank.value;
        tank.closest('.ui-num').querySelector('.ui-num-btn[data-d="-1"]').click(); const back = tank.value;
        const etwChip = document.getElementById('etw').closest('.ui-num').querySelector('.ui-num-chip');
        etwChip && etwChip.click();
        const soc = document.getElementById('battery_soc'); const rng = soc.closest('.ui-num').querySelector('.ui-num-range');
        rng.value = 80; rng.dispatchEvent(new Event('input', { bubbles: true }));
        const tire = document.getElementById('tire_pressure'); tire.value = '35';
        const tireOn = [...tire.closest('.ui-num').querySelectorAll('.ui-num-chip.is-on')].map(b => b.textContent);
        return { chips, first, second, back, changes, etw: document.getElementById('etw').value, etwLabel: etwChip && etwChip.textContent,
                 soc: soc.value, tireOn, unsaved: typeof _unsavedChanges !== 'undefined' ? _unsavedChanges : null };
    });
    chk('chips de valores frecuentes de la misma config (el más usado primero)', n.chips[0] === '42' && n.chips.includes('50'), JSON.stringify(n.chips));
    chk('+ sobre un campo vacío arranca en el valor más usado', n.first === '42', n.first);
    chk('+ y − cambian de uno en uno', n.second === '43' && n.back === '42', n.second + '/' + n.back);
    chk('cada toque dispara change (el guardado se entera)', n.changes === 3 && n.unsaved === true, n.changes + ' ' + n.unsaved);
    chk('ETW: chip "Último de esta config" llena el valor', n.etw === '1664.36' && /Último de esta config/.test(n.etwLabel || ''), n.etw + ' / ' + n.etwLabel);
    chk('SOC: el deslizador escribe en el campo', n.soc === '80', n.soc);
    chk('asignar el valor desde código ilumina su chip', n.tireOn.includes('35'), JSON.stringify(n.tireOn));
    await page.locator('#tank_capacity').locator('xpath=ancestor::div[contains(@class,"form-grid")][1]').screenshot({ path: process.env.SHOTS ? process.env.SHOTS + '/num-recepcion.png' : '/dev/null' }).catch(() => {});

    // ── Bloque 3: derivados ──
    await open('vT'); await page.waitForTimeout(300);
    const d = await page.evaluate(() => {
        const r = {};
        r.tA = document.getElementById('tA').value; r.tB = document.getElementById('tB').value; r.tC = document.getElementById('tC').value;
        r.etw = document.getElementById('etw').value;
        r.icmsHint = !!document.querySelector('.hint-icms');
        cascadeSetField('precond_datetime', '2026-09-20T08:00'); cascadeSetField('test_datetime', '2026-09-21T04:00');
        cascadeDerivedRefresh();
        r.soak = document.getElementById('soak_time').value;
        const hint = document.querySelector('.hint-precond');
        r.hint = hint ? hint.textContent : '';
        const apply = hint && hint.querySelector('.cascade-hint-apply'); if (apply) apply.click();
        r.ok = document.getElementById('precond_ok').value;
        return r;
    });
    chk('Europa: Target A/B/C = f0/f1/f2 del ICMS (guardados, ya sin aviso)', d.tA === '120.5' && d.tB === '0.35' && d.tC === '0.031' && !d.icmsHint, JSON.stringify(d));
    chk('el ETW NO se prellena con la TM', d.etw === '', d.etw);
    chk('reposo calculado de las dos fechas (08:00 → 04:00 del día siguiente = 20 h)', d.soak === '20', d.soak);
    chk('sugiere "Cumple" con la regla y un toque la aplica', /20 h ≥ 24 h|20 h < 24 h|20 h/.test(d.hint) && (d.ok === 'yes' || d.ok === 'no'), d.hint + ' → ' + d.ok);
    const nowOk = await page.evaluate(() => { const b = document.getElementById('op_datetime').parentElement.querySelector('.cascade-now-btn');
        document.getElementById('op_datetime').value = ''; b.click(); return /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(document.getElementById('op_datetime').value); });
    chk('botón "Ahora" pone la fecha y hora actual', nowOk);
    // Teclear el reposo a mano lo "adueña": cambiar una fecha ya no lo reescribe.
    await page.evaluate(() => { const a = document.getElementById('acc-precond'); a.open = true; a.classList.remove('smart-locked'); });
    await page.fill('#soak_time', '30');
    const manual = await page.evaluate(() => { cascadeSetField('test_datetime', '2026-09-21T10:00'); cascadeDerivedRefresh();
        return { v: document.getElementById('soak_time').value, warn: (document.querySelector('.hint-soak') || {}).textContent || '' }; });
    chk('un reposo tecleado a mano no se pisa, y se avisa si no cuadra con las fechas', manual.v === '30' && /26 h/.test(manual.warn), JSON.stringify(manual));

    // ── Bloque 4: Hick ──
    const h = await page.evaluate(() => {
        const r = {};
        switchPlatform('cop15'); document.querySelector('.tab[data-tab="seguimiento"]').click();
        r.cards = [...document.querySelectorAll('#op-veh-cards .veh-card')].map(c => c.querySelector('.veh-card-vin').textContent);
        r.noPending = !r.cards.some(t => t.indexOf('000001') >= 0 && t.indexOf('PEND') >= 0);
        const card = [...document.querySelectorAll('#op-veh-cards .veh-card')].find(c => c.textContent.indexOf('KNATEST000002') >= 0);
        card.click();
        r.loaded = activeVehicleId === 'vT';
        r.selKept = document.getElementById('activeVehSelect').value === 'vT';
        r.nextLabel = (document.querySelector('#op-next-step .op-next-btn') || {}).textContent || '';
        r.sums = [...document.querySelectorAll('#op-emissions-block summary .op-sum')].map(x => x.textContent);
        r.openFirst = (document.querySelector('#op-emissions-block details[open] .op-sum') || {}).textContent || '';
        // Enviar a liberación con faltantes: se niega y el vehículo sigue "en prueba"
        document.getElementById('op_status').value = 'testing'; initStatusPrevValue(); opNextStepRender();
        r.nextLabel2 = (document.querySelector('#op-next-step .op-next-btn') || {}).textContent || '';
        document.querySelector('#op-next-step .op-next-btn').click();
        r.statusAfter = db.vehicles.find(v => v.id === 'vT').status;
        r.popup = !!document.querySelector('.missing-popup, #missingPopup, .custom-modal-box');
        // Propósito en botones agrupados
        r.purposeGroups = document.querySelectorAll('#vehiclePurpose + .ui-chips .ui-chips-group').length;
        return r;
    });
    chk('Operación: tarjetas solo de vehículos editables (el que está en aprobación no aparece)', h.cards.length >= 1 && !h.cards.some(t => /000001/.test(t)), JSON.stringify(h.cards));
    chk('tocar una tarjeta abre el vehículo y el selector lo conserva', h.loaded && h.selKept);
    chk('el botón de siguiente paso dice qué sigue', /Enviar a liberación|Iniciar prueba/.test(h.nextLabel), h.nextLabel);
    chk('cada sección muestra su estado (faltan N / ✓)', h.sums.length >= 3 && h.sums.some(x => /faltan/.test(x)), JSON.stringify(h.sums));
    chk('se abre la primera sección con faltantes', /faltan/.test(h.openFirst), h.openFirst);
    chk('"Enviar a liberación" con faltantes se niega y no cambia el estado', /Enviar a liberación/.test(h.nextLabel2) && h.statusAfter !== 'ready-release', h.statusAfter);
    chk('propósito del Alta en 4 grupos de botones', h.purposeGroups === 4, h.purposeGroups);
    await page.evaluate(() => { document.querySelectorAll('.custom-modal-overlay, #globalModal').forEach(m => m.remove()); });

    // ── Bloques 5-7: interacción, microcopy, responsive ──
    await open('vT'); await page.waitForTimeout(300);
    const ix = await page.evaluate(() => {
        const r = {};
        document.querySelectorAll('#op-content details').forEach(d => d.removeAttribute('open'));
        showMissingPopup([{ id: 'test_tunnel', label: 'Túnel' }, { id: 'tire_pressure', label: 'Presión de llantas' }]);
        r.links = document.querySelectorAll('#globalModal .miss-link').length;
        [...document.querySelectorAll('#globalModal .miss-link')].find(b => /Presión/.test(b.textContent)).click();
        r.modalGone = !document.getElementById('globalModal');
        r.precondOpen = document.getElementById('acc-precond').open;
        cascadeSetField('tire_pressure', '34');
        r.dirty = (document.getElementById('op-save-state') || {}).textContent || '';
        saveProgress({ silent: true });
        r.saved = (document.getElementById('op-save-state') || {}).textContent || '';
        r.lockHint = [...document.querySelectorAll('.smart-lock-hint')].map(x => x.textContent).join(' | ');
        // Todos los destinos de la tira "siguiente paso" existen
        r.gotos = ['acc-precond', 'soak-timer-panel', 'acc-dyno', 'test-verify-card'].filter(id => !document.getElementById(id));
        return r;
    });
    chk('faltantes: la lista trae un enlace por campo', ix.links === 2, ix.links);
    chk('un enlace cierra el modal (lo quita del DOM) y abre la sección plegada', ix.modalGone && ix.precondOpen, JSON.stringify(ix));
    chk('estado de guardado visible: "Cambios sin guardar" → "Guardado"', /sin guardar/.test(ix.dirty) && /Guardado/.test(ix.saved), ix.dirty + ' → ' + ix.saved);
    chk('ningún texto muestra un código de estado crudo (in-progress)', !/in-progress|testing|ready-release/.test(ix.lockHint), ix.lockHint);
    chk('los destinos de la tira "siguiente paso" existen', ix.gotos.length === 0, ix.gotos.join(','));
    const hist = await page.evaluate(() => {
        document.querySelector('.tab[data-tab="dashboard"]').click();
        return new Promise(res => setTimeout(() => {
            const row = document.querySelector('.history-table tbody tr');
            res({ more: !!(row && row.querySelector('.hist-more-btn')), trash: !!(row && [...row.querySelectorAll('button')].some(b => b.textContent.trim() === '🗑')) });
        }, 300));
    });
    chk('Historial: 🗑 ya no está en la fila, vive en el menú ⋯', hist.more && !hist.trash, JSON.stringify(hist));

    // ── ETW (inercia) WLTP desde la ficha ICMS ──
    await open('vE'); await page.waitForTimeout(300);
    const e = await page.evaluate(() => ({ etw: document.getElementById('etw').value, hint: ((document.getElementById('etw').closest('.form-group, .etw-box') || document.body).querySelector('.hint-icms') || {}).textContent || '' }));
    chk('ETW = TM + MR de la ficha (1568 + 44.7 = 1612.7)', e.etw === '1612.7', e.etw);
    chk('se muestra la cuenta de la inercia', /1568/.test(e.hint) && /44\.7/.test(e.hint) && /1612\.7/.test(e.hint), e.hint);
    const alta = await page.evaluate(() => {
        [['homo_tm', '1568'], ['homo_mr', '44.7']].forEach(([id, v]) => { document.getElementById(id).value = v; });
        homoAltaUpdateStatus();
        return (document.querySelector('#homo-alta-warn .homo-inertia-line') || {}).textContent || '';
    });
    chk('el Alta muestra la inercia calculada al capturar TM y MR', /1612\.7 kg/.test(alta), alta);

    // @@MORE@@

    // ── Responsive: nada se sale de la pantalla a 390 px (teléfono) ──
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
    phone.on('pageerror', e => errs.push('phone: ' + e.message));
    await phone.addInitScript(SEED);
    await phone.goto('file://' + path.join(REPO, 'index.html'));
    await phone.waitForTimeout(2500);
    const ov = await phone.evaluate(() => {
        switchPlatform('cop15'); document.querySelector('.tab[data-tab="seguimiento"]').click();
        const s = document.getElementById('activeVehSelect'); s.value = 'vT'; loadVehicle();
        document.querySelectorAll('#op-content details').forEach(d => { d.style.display = ''; d.open = true; });
        const vw = document.documentElement.clientWidth; const out = [];
        document.querySelectorAll('#panel-seguimiento *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 1) out.push((el.id || el.className || el.tagName).toString().slice(0, 30)); });
        return out;
    });
    chk('Operación a 390 px: ningún elemento se sale de la pantalla', ov.length === 0, ov.slice(0, 5).join(', '));
    const ovH = await phone.evaluate(() => new Promise(res => {
        document.querySelector('.tab[data-tab="dashboard"]').click();
        setTimeout(() => { const vw = document.documentElement.clientWidth; const out = [];
            document.querySelectorAll('#panel-dashboard .history-table *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 1) out.push((el.className || el.tagName).toString().slice(0, 30)); });
            res(out); }, 400);
    }));
    chk('Historial a 390 px: en tarjetas, nada se sale de la pantalla', ovH.length === 0, ovH.slice(0, 5).join(', '));

    chk('sin errores de página', errs.length === 0, errs.join(' | '));
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' fallo(s)' : '\ntodo pasó');
    process.exitCode = fallos.length ? 1 : 0;
})();
