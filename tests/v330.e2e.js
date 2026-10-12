// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.3.0 — Historial: Seleccionar todas + Imprimir F05 en lote         ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Un solo PDF con la hoja F05 REAL de cada prueba lista; lo que no puede emitir su hoja se
// omite y se dice por qué. Reusa los vehículos de v321 (dos listos, uno con checklist vacío).
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const SEED = () => {
    if (window !== window.top) return;   // el marco de impresión (blob:) no tiene localStorage
    const firma = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const sig = (n, r, at, retro) => Object.assign({ signerName: n, signerRole: r, signedAt: at, dataUrl: firma, sessionUserId: n }, retro ? { retro: true } : {});
    const veh = (id, vin, testAt, archivedAt, relSig) => ({
        id, vin, status: 'archived', purpose: 'COP-Emisiones', configCode: 'CL4-26',
        registeredAt: testAt, archivedAt,
        config: { Modelo: 'CL4', 'MODEL YEAR (VIN)': '2026', TRANSMISSION: '6MT', 'EMISSION REGULATION': 'PRE-EURO 7',
                  'DRIVE TYPE': 'L - LHD', 'ENGINE CAPACITY': '1.0', REGION: 'EUROPE', 'BODY TYPE': '5DR' },
        timeline: [{ timestamp: testAt, user: 'Ana Signataria', action: 'Alta' }],
        testData: {
            operator: 'Ivan', odometer: '69', datetime: testAt,
            preconditioning: { responsible: 'Osvaldo', datetime: testAt, cycle: 'WLTC', soakTimeH: '12', ok: 'yes' },
            etw: '1612.7', targetA: '102.5', targetB: '0.147', targetC: '0.03544', dynoA: '43.4', dynoB: '-0.1655', dynoC: '0.0359',
            testResponsible: 'Ivan', testDatetime: testAt,
            releaseChecklist: { retro: true, by: 'Ana Signataria', at: '2026-10-12T15:00:00.000Z' },
            signatures: { releaser: relSig, approver: sig('Beto Aprobador', 'Aprobador', archivedAt) },
            gasResults: {
                liberador: { values: { CO: 0.195, NOx: 0.0063, THC: 0.0166, NMHC: 0.0126, PM: 0.0023, CO2: 135.41 },
                             capturedBy: 'Ana Signataria', capturedAt: testAt, passedLimits: true },
                aprobador: { values: { CO: 0.195, NOx: 0.0063, THC: 0.0166, NMHC: 0.0126, PM: 0.0023, CO2: 135.41 }, matchedLiberador: true }
            }
        }
    });
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: '2099-01-01T00:00:00.000Z' }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Signatario', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 2, vehicles: [
        // Prueba de febrero, archivada en octubre, firma del liberador retroactiva (hoy)
        veh(9101, '3KPFX51BXTE290469', '2026-02-13T15:30:00.000Z', '2026-10-09T18:00:00.000Z',
            sig('Ana Signataria', 'Liberador', '2026-10-12T15:00:00.000Z', true)),
        // Prueba nueva (octubre) archivada con el checklist en blanco
        veh(9102, '3KPFX51BXTE290470', '2026-10-01T15:30:00.000Z', '2026-10-05T18:00:00.000Z',
            sig('Ana Signataria', 'Liberador', '2026-10-02T15:00:00.000Z', false)),
        // México, anterior al checklist: OBFCM y Coast/Down siguen "No aplica" automático
        Object.assign(veh(9103, '3KPFX51BXTE290471', '2026-03-10T15:30:00.000Z', '2026-03-12T18:00:00.000Z',
            sig('Ana Signataria', 'Liberador', '2026-03-11T15:00:00.000Z', false)), { config: { Modelo: 'CL4', REGION: 'MEXICO',
            'EMISSION REGULATION': 'EURO-5', 'BODY TYPE': '5DR', 'ENGINE CAPACITY': '1.0', TRANSMISSION: '6MT', 'MODEL YEAR (VIN)': '2026', 'DRIVE TYPE': 'L - LHD' } })
    ] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-12T16:00:00.000Z'));
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof generateCOP15PDF === 'function' && window.jspdf, null, { timeout: 15000 });
    await page.evaluate(() => {
        db.vehicles.forEach(veh => {
            for (let i = 0; i < 3; i++) validatePdfCompleteness(veh).missing.forEach(m => {
                const f = PDF_REQUIRED_FIELDS.find(x => x.label === m.label);
                if (!f) return;
                const el = document.getElementById(f.refId);
                const opt = el && el.tagName === 'SELECT' ? [...el.options].map(o => o.value).filter(Boolean)[0] : null;
                _histSetPath(veh, f.path, f.num ? 10 : (opt || 'X'));
            });
        });
        saveDB();
        dashGo('cop15', 'dashboard');
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => histRefresh(true));
    await page.waitForTimeout(300);

    const r1 = await page.evaluate(() => {
        const plan = histPrintPlan(db.vehicles);
        const all = document.getElementById('histSelAllBtn'), pr = document.getElementById('batchPdfBtn');
        return { ok: plan.ok.map(v => v.id), skip: plan.skip.map(x => x.v.id + ':' + x.why),
                 allTxt: all ? all.textContent : '', prTxt: pr ? pr.textContent : '', prShown: pr ? getComputedStyle(pr).display : 'none' };
    });
    ok('"Seleccionar todas" está en la barra del Historial', /Seleccionar todas \(3\)/.test(r1.allTxt), r1.allTxt);
    ok('"Imprimir F05" sin selección ofrece todas las de la vista', r1.prShown !== 'none' && /de todas \(3\)/.test(r1.prTxt), r1.prTxt);
    ok('las pruebas listas entran al lote', r1.ok.length === 2 && r1.ok.includes(9101), JSON.stringify(r1.ok));
    ok('la de checklist vacío se omite con su motivo', r1.skip.length === 1 && r1.skip[0] === '9102:checklist', JSON.stringify(r1.skip));

    await page.click('#histSelAllBtn');
    await page.waitForTimeout(200);
    const r2 = await page.evaluate(() => ({ sel: histSelectedIds().length, pr: document.getElementById('batchPdfBtn').textContent,
                                            all: document.getElementById('histSelAllBtn').textContent }));
    ok('Seleccionar todas marca las 3 y el botón dice cuántas', r2.sel === 3 && /Imprimir F05 \(3\)/.test(r2.pr) && /Quitar todas/.test(r2.all), JSON.stringify(r2));

    // El documento combinado: una hoja F05 real por prueba lista
    const r3 = await page.evaluate(() => {
        const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
        let n = 0;
        [9101, 9103].forEach(id => { if (generateCOP15PDF(id, { returnDoc: true, silent: true, intoDoc: doc, intoDocHasPages: n > 0 })) n++; });
        const t = doc.output();
        return { pages: doc.getNumberOfPages(), vin1: t.includes('3KPFX51BXTE290469'), vin3: t.includes('3KPFX51BXTE290471'),
                 pageOf: (t.match(/\(Page: 1 of 1    Dept: QA\) Tj/g) || []).length,
                 wrapped: (t.match(/P A S A/g) || []).length };
    });
    ok('el lote trae una página por prueba', r3.pages === 2, 'páginas ' + r3.pages);
    ok('cada hoja con su VIN', r3.vin1 && r3.vin3);
    ok('cada hoja numera sus propias páginas (Page: 1 of 1)', r3.pageOf === 2, 'veces ' + r3.pageOf);
    ok('el texto no se espacia letra por letra al juntar hojas', r3.wrapped === 0);

    // Flujo completo: botón → diálogo → Imprimir
    await page.click('#batchPdfBtn');
    await page.waitForTimeout(300);
    const dlg = await page.evaluate(() => { const m = document.getElementById('globalModal'); return m ? m.textContent : ''; });
    ok('el diálogo dice cuántas salen y cuáles no', /2 de 3/.test(dlg) && /No se imprimen \(1\)/.test(dlg) && /checklist incompleto/.test(dlg), dlg.slice(0, 200));
    await page.locator('#globalModal button', { hasText: /^🖨️ Imprimir$/ }).click();
    await page.waitForFunction(() => window._histPrintLast, null, { timeout: 15000 });
    const r4 = await page.evaluate(() => ({ last: window._histPrintLast, frame: !!document.getElementById('hist-print-frame'),
        audit: (auditGetView ? auditGetView() : []).some(e => e.action === 'f05_lote') }));
    ok('se arma el PDF de 2 hojas y se manda al marco de impresión', r4.last.pages === 2 && r4.frame && /^blob:/.test(r4.last.url), JSON.stringify(r4.last));
    ok('la impresión en lote queda en la auditoría', r4.audit);
    ok('sin errores de página', errores.length === 0, errores.slice(0, 3).join(' | '));
    await browser.close();
    console.log(fallas ? fallas + ' fallaron' : 'v330: todo bien');
    process.exitCode = fallas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
