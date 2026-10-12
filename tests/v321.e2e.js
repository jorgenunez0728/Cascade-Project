// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.2.1 — El checklist del F05 no sale en blanco en un llenado        ║
// ║  retroactivo                                                         ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Caso real: prueba de Europa del 13-feb archivada el 9-oct, firma del liberador
// capturada en Historial → 📝 Completar (fecha de hoy, retro). El F05 salía con la
// columna Confirmación vacía en los 5 objetos y en VETS/OBFCM/Coast-Down.
// También: un archivado NUEVO con el checklist en blanco ya no genera un F05 con
// huecos: pide completarlo.
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const SEED = () => {
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

    const r = await page.evaluate(() => {
        // Llenar el formulario (lo que pide PDF_REQUIRED_FIELDS) para aislar el checklist.
        db.vehicles.forEach(veh => {
            for (let i = 0; i < 3; i++) validatePdfCompleteness(veh).missing.forEach(m => {
                const f = PDF_REQUIRED_FIELDS.find(x => x.label === m.label);
                if (!f) return;
                const el = document.getElementById(f.refId);
                const opt = el && el.tagName === 'SELECT' ? [...el.options].map(o => o.value).filter(Boolean)[0] : null;
                _histSetPath(veh, f.path, f.num ? 10 : (opt || 'X'));
            });
        });
        const v = db.vehicles.find(x => x.id === 9101);
        const st = releaseChecklistRows(v);
        const doc = generateCOP15PDF(9101, { returnDoc: true, silent: true });
        const pdf = doc ? doc.output() : '';
        const count = (t) => (pdf.match(new RegExp('\\(' + t + '\\) Tj', 'g')) || []).length;
        // El botón PDF del Historial (sin silent): un archivado nuevo con huecos no se imprime
        const g0 = document.getElementById('globalModal'); if (g0) g0.remove();
        const nuevo = generateCOP15PDF(9102);
        const modal = document.getElementById('globalModal');
        const modalTxt = modal ? modal.textContent : '';
        if (modal) modal.remove();
        const feb = generateCOP15PDF(9101);
        return {
            legacy: releaseIsBeforeChecklist(v), blanks: st.objects.concat(st.docs).filter(x => !x.value).map(x => x.key),
            retirado: count('Retirado'), adjunto: count('Adjunto'), noAplica: count('No aplica'), completa: count('Completa'),
            pieRetro: /retroactiv|asentad|anterior al/i.test(pdf),
            pdfOk: !!doc, nuevoBloqueado: nuevo === null, modalTxt, febGenera: feb !== null
        };
    });
    ok('la prueba de febrero cuenta como anterior al checklist', r.legacy === true);
    ok('ninguna fila del checklist queda vacía', r.blanks.length === 0, r.blanks.join(','));
    ok('el PDF se genera', r.pdfOk);
    ok('el F05 imprime Retirado en los 5 objetos', r.retirado === 5, 'Retirado ×' + r.retirado);
    ok('el F05 imprime Adjunto en VETS, OBFCM y Coast/Down', r.adjunto === 3, 'Adjunto ×' + r.adjunto);
    ok('F02 y F03 salen No aplica (Europa)', r.noAplica >= 2, 'No aplica ×' + r.noAplica);
    ok('Hoja F05 sale Completa', r.completa >= 1);
    ok('el botón PDF sí genera la prueba de febrero', r.febGenera);
    ok('un archivado nuevo con el checklist vacío no imprime un F05 con huecos', r.nuevoBloqueado);
    ok('y dice dónde completarlo', /Checklist de liberación/.test(r.modalTxt) && /Completar/.test(r.modalTxt) && /KDS con VCI/.test(r.modalTxt), r.modalTxt.slice(0, 200));
    ok('el pie del PDF no menciona llenado retroactivo', r.pieRetro === false);

    // Completar: el botón aparece por el checklist y confirmar queda registrado en la app
    const c = await page.evaluate(() => {
        document.querySelector('.tab[data-tab="dashboard"]').click();
        if (typeof histRefresh === 'function') histRefresh(true);
        const btn = [...document.querySelectorAll('button')].find(b => /histOpenCompleteModal\(9101\)/.test(b.getAttribute('onclick') || ''));
        histOpenCompleteModal(9101);
        const det = [...document.querySelectorAll('#hist-complete-root details')].find(d => /Checklist de liberación/.test(d.textContent));
        const abierta = !!(det && det.open);
        const tieneBoton = /Confirmar todo como está/.test(det ? det.textContent : '');
        histChecklistConfirmAll();
        const pend = Object.keys(_histCompleteState.checklist || {}).length;
        histSaveCompleteModal();
        const v = db.vehicles.find(x => x.id === 9101);
        const st = releaseChecklistRows(v);
        const tl = (v.timeline || []).slice(-1)[0] || {};
        const mx = releaseChecklistRows(db.vehicles.find(x => x.id === 9103));
        const k = (st2, key) => st2.objects.concat(st2.docs).find(x => x.key === key);
        return { boton: !!btn, abierta, tieneBoton, pend,
                 guardado: !!(v.testData.releaseChecklist.objects && v.testData.releaseChecklist.objects.kds === 'ok' && v.testData.releaseChecklist.docs.obfcm === 'ok'),
                 yaNoAuto: st.objects.concat(st.docs).every(x => !x.legacy),
                 linea: (tl.data && tl.data.added || []).filter(x => /^Checklist/.test(x)).length,
                 mxObfcm: k(mx, 'obfcm').value + '/' + k(mx, 'obfcm').auto, mxCoast: k(mx, 'coast').value + '/' + k(mx, 'coast').auto,
                 mxKds: k(mx, 'kds').value + '/' + !!k(mx, 'kds').legacy };
    });
    ok('Historial ofrece 📝 Completar por el checklist (aunque el formulario esté completo)', c.boton);
    ok('la sección del checklist abre sola y trae "Confirmar todo"', c.abierta && c.tieneBoton);
    ok('confirmar todo marca las 8 filas asentadas solas', c.pend === 8, 'pendientes ' + c.pend);
    ok('al guardar quedan escritas en el vehículo', c.guardado);
    ok('y ya no cuentan como automáticas', c.yaNoAuto);
    ok('la línea de tiempo registra las 8 confirmaciones', c.linea === 8, 'líneas ' + c.linea);
    ok('México: OBFCM y Coast/Down siguen No aplica automático', c.mxObfcm === 'na/true' && c.mxCoast === 'na/true', c.mxObfcm + ' ' + c.mxCoast);
    ok('México anterior al checklist: objetos asentados solos', c.mxKds === 'ok/true', c.mxKds);
    ok('sin errores de página', errores.length === 0, errores.slice(0, 3).join(' | '));
    await browser.close();
    console.log(fallas ? fallas + ' fallaron' : 'v321: todo bien');
    process.exitCode = fallas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
