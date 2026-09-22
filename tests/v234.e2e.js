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

    // @@MORE@@

    chk('sin errores de página', errs.length === 0, errs.join(' | '));
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' fallo(s)' : '\ntodo pasó');
    process.exitCode = fallos.length ? 1 : 0;
})();
