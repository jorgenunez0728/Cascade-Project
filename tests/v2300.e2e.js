// Verificación en navegador de 2.30.0 — pruebas anteriores a la plataforma (VETS).
// Recorrido real: Ana importa dos pruebas de VETS (Europa con configuración, México sin
// ella), no puede confirmarlas ella misma; Beto (Signatario) confirma una y rechaza la
// otra con UNA firma. Se verifica que un histórico no aparece como vehículo en curso,
// no genera F05, y que solo la confirmada entra al SPC.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const EU = fx('vets-eu-wltp.json'), MX = fx('vets-mx-ftp75.json');
const EU_CODE = 'CL4-26 MODEL-6MT-0-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0';

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = (who) => {
    const ops = [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true },
                 { id: 's2', name: 'Beto Signatario', role: 'Signatario', active: true }];
    const me = ops.filter(o => o.id === who)[0];
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: me.id, operatorName: me.name, expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    if (!localStorage.getItem('kia_panel_v1')) localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: ops, tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    // La librería de firma viene de un CDN (bloqueado aquí): una mínima que "firma".
    window.SignaturePad = function() {
        this.isEmpty = () => false; this.clear = () => {};
        this.toDataURL = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    };
};

let browser;
async function abrir(ctx, who) {
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
    await page.addInitScript(SEED, who);
    await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
    await page.waitForTimeout(2500);
    return { page, errores };
}

(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1920, height: 1017, et: 'Escritorio 1920×1017' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
        console.log('\n== ' + vp.et + ' ==');
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });

        // ── Ana importa ──────────────────────────────────────────────────
        let { page, errores } = await abrir(ctx, 'm1');
        await page.evaluate(([eu, mx]) => {
            switchPlatform('cop15');
            historicoImportShow([
                { fileName: 'VETS_EU.xlsx', sha256: 'aa11', size: 1000, rec: vetsExtract(eu) },
                { fileName: 'VETS_MX.xlsx', sha256: 'bb22', size: 1000, rec: vetsExtract(mx) },
                { fileName: 'roto.xlsx', error: 'No se pudo leer: ZIP dañado' }
            ]);
        }, [EU, MX]);
        await page.waitForTimeout(300);
        let s = await page.evaluate(() => ({
            rows: document.querySelectorAll('#hv-import .hv-row').length,
            sum: (document.querySelector('#hv-import .hv-sum') || {}).innerText || '',
            why: (document.getElementById('hv-apply') || {}).dataset ? document.getElementById('hv-apply').dataset.why || '' : 'sin botón'
        }));
        chk('la revisión del lote muestra los 3 archivos', s.rows === 3, JSON.stringify(s));
        chk('sin propósito nada está listo y el botón dice por qué', /0<\/?b?>? se importan|0 se importan/.test(s.sum) && /No hay pruebas listas/.test(s.why), JSON.stringify(s));

        await page.selectOption('#hv-purpose-all', 'COP-Emisiones');
        await page.waitForTimeout(150);
        s = await page.evaluate(() => (document.querySelector('#hv-import .hv-sum') || {}).innerText || '');
        chk('con propósito, la europea queda lista y la de México pide configuración', /1 se importan/.test(s) && /1 piden un dato/.test(s) && /1 se omiten/.test(s), s);
        // Elegir la configuración de la de México (segunda fila)
        await page.evaluate(code => {
            const sel = document.querySelectorAll('#hv-import .hv-row')[1].querySelectorAll('select')[0];
            sel.value = code; sel.dispatchEvent(new Event('change', { bubbles: true }));
        }, EU_CODE);
        await page.waitForTimeout(150);
        s = await page.evaluate(() => (document.querySelector('#hv-import .hv-sum') || {}).innerText || '');
        chk('al elegirla, las dos quedan listas', /2 se importan/.test(s), s);
        await page.click('#hv-apply');
        await page.waitForTimeout(400);
        let st = await page.evaluate(() => {
            const h = db.vehicles.filter(v => v.status === 'historico');
            return { n: h.length, states: h.map(v => v.historic.state), importer: h.map(v => v.historic.importedById),
                     sinGas: h.every(v => !(v.testData.gasResults)), modal: !!document.getElementById('globalModal'),
                     audit: (auditGetView()).filter(e => e.action === 'historico_importado').length,
                     fechas: h.map(v => v.testData.testDatetime), alta: h.map(v => v.registeredAt.slice(0, 10)) };
        });
        chk('se crean 2 pruebas históricas por confirmar, importadas por Ana', st.n === 2 && st.states.every(x => x === 'pendiente') && st.importer.every(x => x === 'm1'), JSON.stringify(st));
        chk('sin resultados finales todavía (no entran al SPC)', st.sinGas);
        chk('la fecha es la de VETS y el alta es hoy', st.fechas.every(f => /^2026-0[1-9]/.test(f)) && st.alta.every(a => a === new Date().toISOString().slice(0, 10)), JSON.stringify(st));
        chk('se cierra el diálogo y queda en el historial de cambios', !st.modal && st.audit === 2, JSON.stringify(st));

        // Un histórico NO es un vehículo en curso
        st = await page.evaluate(() => {
            const h = db.vehicles.filter(v => v.status === 'historico');
            const acts = dashCollectActivities();
            const ids = h.map(v => v.id);
            return {
                enHoy: acts.filter(a => a.cat === 'vehiculos' && ids.indexOf(a.vehicleId) >= 0).length,
                filaConfirmar: acts.filter(a => a.id === 'act-historico').map(a => ({ perm: a.perm, notForMe: a.notForMe })),
                next: h.map(v => getNextStep(v)), pdf: h.map(v => generateCOP15PDF(v.id, { silent: true })),
                opSelect: Array.from((document.getElementById('activeVehSelect') || { options: [] }).options).filter(o => ids.indexOf(+o.value) >= 0 || ids.indexOf(o.value) >= 0).length,
                stage: cascadeVehicleStage(h[0]).label
            };
        });
        chk('no aparecen como vehículos en HOY', st.enHoy === 0, JSON.stringify(st));
        chk('HOY ofrece "confirmar" a quien aprueba, pero no a quien las importó', st.filaConfirmar.length === 1 && st.filaConfirmar[0].perm === 'test.approve' && st.filaConfirmar[0].notForMe === true, JSON.stringify(st.filaConfirmar));
        chk('sin siguiente paso, sin F05, fuera de Operación', st.next.every(x => x === null) && st.pdf.every(x => x === null) && st.opSelect === 0, JSON.stringify(st));
        chk('su etapa dice "Histórico (VETS)"', st.stage === 'Histórico (VETS)', st.stage);

        // Historial
        await page.evaluate(() => { document.querySelector('.tab[data-tab="dashboard"]').click(); });
        await page.waitForTimeout(400);
        st = await page.evaluate(() => ({
            badge: Array.from(document.querySelectorAll('#historyList .hv-chip')).map(e => e.innerText),
            importar: !!Array.from(document.querySelectorAll('#historyFilterBar button')).find(b => /Importar pruebas anteriores/.test(b.innerText)),
            confirmar: (Array.from(document.querySelectorAll('#historyFilterBar button')).find(b => /Confirmar pruebas/.test(b.innerText)) || {}).innerText || ''
        }));
        chk('el Historial las muestra "Por confirmar" con el botón de importar', st.badge.length === 2 && st.badge.every(b => /Por confirmar/.test(b)) && st.importar, JSON.stringify(st));
        chk('a quien las importó el botón de confirmar le cuenta 0', /\(0\)/.test(st.confirmar), st.confirmar);

        await page.evaluate(() => historicoReviewOpen());
        await page.waitForTimeout(300);
        st = await page.evaluate(() => !!document.getElementById('ui-flow'));
        chk('Ana no puede confirmar lo que importó', !st);
        chk('sin errores de página (Ana)', !errores.length, errores.join(' | '));
        await page.close();

        // ── Beto confirma ────────────────────────────────────────────────
        ({ page, errores } = await abrir(ctx, 's2'));
        await page.evaluate(() => { switchPlatform('cop15'); historicoReviewOpen(); });
        await page.waitForTimeout(400);
        st = await page.evaluate(() => ({ flow: !!document.getElementById('ui-flow'), q: (document.querySelector('#ui-flow .uf-q') || {}).innerText || '',
                                          gases: document.querySelectorAll('#ui-flow .hv-gas tbody tr').length }));
        chk('Beto abre la ronda con la primera prueba y su tabla de gases', st.flow && st.q.length === 17 && st.gases > 0, JSON.stringify(st));

        // Guardar sin elegir → error en el campo
        await page.click('#ui-flow .uf-save');
        await page.waitForTimeout(200);
        st = await page.evaluate(() => (document.querySelector('#ui-flow [role=alert]') || {}).innerText || '');
        chk('sin decidir no avanza y lo dice', /Confirmo/.test(st), st);

        // 1ª: confirmar (con observación si la pide)
        await page.click('#ui-flow .uf-choice:has-text("Confirmo")');
        await page.fill('#hv-note', 'Resultados revisados contra el reporte de VETS');
        await page.click('#ui-flow .uf-save');
        await page.waitForTimeout(300);
        // 2ª: no confirmar
        await page.click('#ui-flow .uf-choice:has-text("No confirmo")');
        await page.fill('#hv-note', 'El archivo es de otra unidad');
        await page.click('#ui-flow .uf-save');
        await page.waitForTimeout(300);
        st = await page.evaluate(() => (document.querySelector('#ui-flow .uf-final') || {}).innerText || '');
        chk('el resumen cuenta 1 por confirmar y 1 no confirmada', /1 por confirmar/.test(st) && /1 por marcar como no confirmada/.test(st), st);
        await page.click('#ui-flow .uf-final button:has-text("Firmar y aplicar")');
        await page.waitForTimeout(400);
        await page.click('.sig-capture-overlay button:has-text("Firmar y Continuar")');
        await page.waitForTimeout(600);
        st = await page.evaluate(() => {
            const h = db.vehicles.filter(v => v.status === 'historico').sort((a, b) => String(a.historic.testDate).localeCompare(String(b.historic.testDate)));
            const c = h.filter(v => v.historic.state === 'confirmado')[0], r = h.filter(v => v.historic.state === 'rechazado')[0];
            const fams = copSpcFamilies({ allScopes: true });
            const enSpc = vin => fams.some(f => (f.vehicles || f.points || []).some(p => (p.vin || (p.vehicle && p.vehicle.vin)) === vin)) ||
                                 JSON.stringify(fams).indexOf(vin) >= 0;
            const audit = auditGetView();
            return {
                flow: !!document.getElementById('ui-flow'),
                c: c && { by: c.historic.confirmation.by, method: c.testData.gasResults.aprobador.method, matched: c.testData.gasResults.aprobador.matchedLiberador,
                          sig: !!c.historic.confirmation.signature.dataUrl, batch: c.historic.confirmation.batchCount, spc: enSpc(c.vin) },
                r: r && { reason: r.historic.rejection.reason, gas: !!(r.testData.gasResults && r.testData.gasResults.aprobador), spc: enSpc(r.vin) },
                audit: audit.filter(e => /historico_(confirmado|rechazado)/.test(e.action)).length,
                beforeAfter: audit.filter(e => e.action === 'historico_confirmado').every(e => e.before && e.after && e.after.valores)
            };
        });
        chk('se cerró la ronda', !st.flow);
        chk('la confirmada lleva la firma de Beto, método "confirmacion-historico" y NO afirma doble ciego',
            st.c && st.c.by === 'Beto Signatario' && st.c.method === 'confirmacion-historico' && st.c.matched === null && st.c.sig && st.c.batch === 2, JSON.stringify(st.c));
        chk('la no confirmada guarda el motivo y no tiene resultados finales', st.r && /otra unidad/.test(st.r.reason) && !st.r.gas, JSON.stringify(st.r));
        chk('solo la confirmada entra al SPC', st.c && st.c.spc && st.r && !st.r.spc, JSON.stringify({ c: st.c, r: st.r }));
        chk('cada decisión queda en el historial de cambios con antes/después', st.audit === 2 && st.beforeAfter, JSON.stringify(st));

        // La ficha y "abrir el vehículo" llevan a sus resultados, nunca a Operación
        st = await page.evaluate(() => {
            const c = db.vehicles.filter(v => v.status === 'historico' && v.historic.state === 'confirmado')[0];
            v7GoToVehicle(c.id);
            return c.id;
        });
        await page.waitForTimeout(500);
        st = await page.evaluate(() => ({ ficha: (document.querySelector('.ficha-sheet, #ficha, [class*="ficha"]') || {}).innerText || '' }));
        chk('abrir una histórica muestra su ficha con quién confirmó', /Confirmó/.test(st.ficha) && /Beto/.test(st.ficha), st.ficha.slice(0, 300));
        chk('sin errores de página (Beto)', !errores.length, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien') + '\n');
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); if (browser) browser.close(); process.exit(1); });
