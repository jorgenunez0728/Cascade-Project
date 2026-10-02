// Verificación en navegador de 2.31.0 — una prueba con IWR fuera de rango se acepta,
// pero no cuenta para CoP. Cuatro vehículos de la misma familia europea; uno con
// IWR −2.17 % (la verificación de VETS falló). Se recorren: Validador (aviso + fila
// manual tachada), SPC, Panorama, Historial, aviso al aprobar y la ficha.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const EU = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'vets-eu-wltp.json'), 'utf8'));
const EU_CODE = 'CL4-26 MODEL-6MT-0-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0';

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const ops = [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true },
                 { id: 's2', name: 'Beto Signatario', role: 'Signatario', active: true }];
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 's2', operatorName: 'Beto Signatario', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    if (!localStorage.getItem('kia_panel_v1')) localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: ops, tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1920, height: 1017, et: 'Escritorio 1920×1017' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
        console.log('\n== ' + vp.et + ' ==');
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(2500);

        const key = await page.evaluate(([eu, code]) => {
            const cfgRow = (allConfigurations || []).find(c => c.codigo_config_text === code || c.codigo_config === code) || null;
            const cfg = cfgRow || { 'Modelo': 'CL4-26 MODEL', 'ENGINE CAPACITY': '1000cc', 'TRANSMISSION': '6MT', 'MODEL YEAR (VIN)': '26',
                'EMISSION REGULATION': 'PRE-EURO 7', 'REGION': 'EUROPE', 'BODY TYPE': '5DR', 'ENGINE PACKAGE': 'KAPPA PE' };
            const sum = (iwr) => {
                const r = JSON.parse(JSON.stringify(vetsExtract(eu)));
                if (iwr !== undefined) { r.drive.iwr = iwr; const c = r.checks.find(x => x.name === 'IWR'); c.ave = iwr; c.status = 'FAIL'; c.where = ['ciclo']; }
                return vetsSummary(r, { fileName: 'x.xlsx' }, vetsClassifyChecks(r.checks, []), {});
            };
            const mk = (id, vin, co, s, status, co2) => ({ id: id, vin: vin, status: status || 'archived', purpose: 'Emisiones', configCode: code,
                config: Object.assign({}, cfg), registeredAt: '2026-09-0' + (id % 9 + 1) + 'T09:00:00', archivedAt: '2026-09-1' + (id % 9) + 'T09:00:00',
                timeline: [], homolog: { co2Target: 129 }, testData: { vets: s, testDatetime: '2026-09-0' + (id % 9 + 1) + 'T10:00', gasResults: {
                    liberador: { values: { CO: co, THC: 0.05, NMHC: 0.03, NOx: 0.02, PM: 0.0002, CO2: co2 }, capturedAt: '2026-09-0' + (id % 9 + 1) + 'T11:00:00', releasedBy: 'Ana Manager' },
                    aprobador: status === 'pending-approval' ? undefined : { values: { CO: co, THC: 0.05, NMHC: 0.03, NOx: 0.02, PM: 0.0002, CO2: co2 }, capturedAt: '2026-09-0' + (id % 9 + 1) + 'T12:00:00' } } } });
            // CO₂ de las 5 buenas = el Excel "statistika" del laboratorio (declarado 129).
            db.vehicles.push(mk(9101, 'VINIWRBUENA000001', 0.30, sum(), null, 129.055651));
            db.vehicles.push(mk(9102, 'VINIWRBUENA000002', 0.31, sum(), null, 129.35165));
            db.vehicles.push(mk(9103, 'VINIWRBUENA000003', 0.32, sum(), null, 130.042315));
            db.vehicles.push(mk(9106, 'VINIWRBUENA000006', 0.33, sum(), null, 127.476989));
            db.vehicles.push(mk(9107, 'VINIWRBUENA000007', 0.34, sum(), null, 129.162902));
            db.vehicles.push(mk(9104, 'VINIWRMALA0000004', 0.90, sum(-2.17), null, 140));
            const p = mk(9105, 'VINIWRPEND0000005', 0.40, sum(-2.17), 'pending-approval', 135);
            delete p.testData.gasResults.aprobador;
            db.vehicles.push(p);
            saveDB();
            if (typeof copInvalidateCache === 'function') copInvalidateCache();
            return copVehicleFamilyKey(db.vehicles.find(v => v.id === 9101));
        }, [EU, EU_CODE]);

        // ── Validador ─────────────────────────────────────────────────────
        await page.evaluate((k) => {
            switchPlatform('cop');
            // Un juicio guardado ANTES de 2.31.0 que incluyó la prueba mala.
            copState.saved.unshift({ id: 'cop_e2e_viejo', date: '2026-09-20T10:00:00', familyKey: k, familyLabel: 'e2e', decision: 'PASS',
                vehicles: [{ id: 1, vin: 'VINIWRBUENA000001', values: { CO: '0.3' }, source: 'auto' }, { id: 2, vin: 'VINIWRMALA0000004', values: { CO: '0.9' }, source: 'auto' }] });
            copInvalidateCache();
            copSelectFamily(k);
            // Una fila MANUAL con el VIN malo: se queda, tachada, fuera del cálculo.
            copState.vehicles.push({ id: 777, vin: 'VINIWRMALA0000004', values: { CO: '0.9' }, source: 'manual' });
            copSetView('validator');
        }, key);
        await page.waitForTimeout(500);
        let s = await page.evaluate(() => ({
            note: (document.querySelector('#platform-cop [data-cop-excluded]') || {}).innerText || '',
            vins: (copState.vehicles || []).map(r => r.vin + ':' + r.source),
            tachada: document.querySelectorAll('#platform-cop tr.cop-row--excluded').length,
            co: (copGetPollStats().find(p => p.id === 'CO') || {}).validCount
        }));
        chk('el Validador declara el ensayo que no cuenta, con su IWR', /no cuentan/i.test(s.note) && /VINIWRMALA0000004/.test(s.note) && /2\.17/.test(s.note), s.note);
        chk('la mesa trae las buenas automáticas y no la mala', ['VINIWRBUENA000001:auto', 'VINIWRBUENA000002:auto', 'VINIWRBUENA000003:auto', 'VINIWRBUENA000006:auto', 'VINIWRBUENA000007:auto'].every(x => s.vins.includes(x)) && !s.vins.includes('VINIWRMALA0000004:auto'), JSON.stringify(s.vins));
        chk('la fila manual con el VIN malo se pinta tachada', s.tachada === 1, s.tachada);
        chk('el cálculo de CO usa las 5 que cuentan', s.co === 5, s.co);
        chk('el veredicto dice n = 5 (la fila tachada no cuenta)', await page.evaluate(() => /n = 5/.test((document.querySelector('#platform-cop .cop-verdict') || {}).innerText || '')));
        s = await page.evaluate(() => {
            const d = document.querySelector('#platform-cop details[data-cop-seq]');
            if (d) d.open = true;
            return { stale: (document.querySelector('#platform-cop [data-cop-stale]') || {}).innerText || '',
                     seq: d ? d.innerText : '', filas: d ? d.querySelectorAll('tbody tr').length : 0 };
        });
        chk('avisa que el juicio guardado incluye la prueba que ya no cuenta', /incluye 1 ensayo/.test(s.stale) && /VINIWRMALA0000004/.test(s.stale) && /Guardar el juicio de nuevo/.test(s.stale), s.stale);
        chk('la secuencia de CO₂ va en orden de prueba: 5 filas, R154 decide en n = 5', s.filas === 5 && /UN R154: decide en n = 5 — CONCORDANTE/.test(s.seq), s.seq.slice(0, 300));
        if (process.env.SHOT) {
            await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; const d = document.querySelector('#platform-cop details[data-cop-seq]'); if (d) d.scrollIntoView({ block: 'start', behavior: 'instant' }); });
            await page.waitForTimeout(600);
            await page.screenshot({ path: path.join(process.env.SHOT, 'seq-' + vp.width + '.png') });
        }
        chk('la secuencia no incluye la prueba mala ni la pendiente', !/VINIWRMALA|VINIWRPEND/.test(s.seq));

        // ── SPC y Panorama ────────────────────────────────────────────────
        await page.evaluate((k) => { copState.spc.familyKey = k; copSetView('spc'); }, key);
        await page.waitForTimeout(500);
        s = await page.evaluate((k) => ({
            note: (document.querySelector('#platform-cop [data-cop-excluded]') || {}).innerText || '',
            n: (copSpcFamilies({ allScopes: true }).find(f => f.key === k) || {}).n
        }), key);
        chk('la carta SPC tiene 5 ensayos y declara el excluido', s.n === 5 && /carta de control/.test(s.note), JSON.stringify(s));
        await page.evaluate(() => copSetView('overview'));
        await page.waitForTimeout(400);
        s = await page.evaluate(() => [...document.querySelectorAll('#platform-cop .cop-fam-sub')].map(e => e.innerText).filter(t => /no cuentan para CoP/.test(t)));
        // 1: la que espera aprobación ya no entra al CoP (solo cuenta lo aprobado).
        chk('la tarjeta de la familia dice "⊘ 1 ensayo(s) aceptado(s) no cuentan para CoP"', s.length >= 1 && /⊘ 1 /.test(s[0]), JSON.stringify(s));
        chk('la tarjeta avisa del juicio que hay que volver a guardar', await page.evaluate(() => !!document.querySelector('#platform-cop [data-cop-stale-card]')));

        // ── Historial ─────────────────────────────────────────────────────
        await page.evaluate(() => { switchPlatform('cop15'); const t = document.querySelector('.tab[data-tab="dashboard"]'); if (t) t.click(); });
        await page.waitForTimeout(600);
        s = await page.evaluate(() => [...document.querySelectorAll('[data-cop-excluded="1"]')].map(e => e.closest('tr') ? e.closest('tr').innerText.slice(0, 40) : ''));
        chk('el Historial marca ⊘ No cuenta para CoP en las dos de IWR −2.17 % (y en ninguna buena)', s.length === 2 && s.some(x => /VINIWRMALA/.test(x)) && s.some(x => /VINIWRPEND/.test(x)) && !s.some(x => /BUENA/.test(x)), JSON.stringify(s));

        // ── Aprobación: se puede aprobar, pero se avisa ───────────────────
        s = await page.evaluate(() => {
            const v = db.vehicles.find(x => x.id === 9105);
            vetsRenderApprovalNote(v);
            const el = document.getElementById('appr-vets-note');
            return el ? el.innerText : 'sin #appr-vets-note';
        });
        chk('al aprobar: "se puede aprobar, pero no contará para CoP"', /se puede aprobar/.test(s) && /no contará para CoP/.test(s) && /2\.17/.test(s), s);

        // ── Ficha ─────────────────────────────────────────────────────────
        s = await page.evaluate(() => { const m = fichaModel('vehiculo', 9104); return { b: m.badges.map(x => x.text), f: m.facts.map(x => x.k + ': ' + x.v) }; });
        chk('la ficha lo dice', s.b.includes('No cuenta para CoP') && s.f.some(x => /No cuenta para CoP: IWR/.test(x)), JSON.stringify(s));

        // ── Plan: no baja el déficit ──────────────────────────────────────
        s = await page.evaluate(() => {
            tpState.testedList.push({ configText: 'X', date: '2026-09-04', vin: 'VINIWRMALA0000004', vehicleId: 9104, source: 'cop15-release', purpose: 'Emisiones' });
            const r = { malo: tpTestedCountsForReq(tpState.testedList[tpState.testedList.length - 1]) };
            tpState.testedList.pop();
            return r;
        });
        chk('en el plan, la prueba mala no acredita el REQ', s.malo === false, JSON.stringify(s));

        chk('sin errores de página', !errores.length, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    if (fallos.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
