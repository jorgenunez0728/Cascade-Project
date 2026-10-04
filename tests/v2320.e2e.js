// Verificación en navegador de 2.32.0 — el calendario por día de prueba y el Excel para
// auditoría. Caso del laboratorio: una prueba del MARTES 15-sep aprobada el JUEVES 17
// sale el martes y solo el martes. Se recorren el calendario del Plan (mes, detalle del
// día, lo planeado en ámbar), el de Datos, y la descarga del .xlsx (se relee con el lector
// de la propia app).
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const CODE = 'CL4-26 MODEL-6MT-0-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0';

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const ops = [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }];
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
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
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile,
            acceptDownloads: true, timezoneId: 'America/Mexico_City' });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(2500);

        await page.evaluate((code) => {
            const row = (allConfigurations || []).find(c => c.codigo_config_text === code) || {};
            const mk = (id, vin, status, dt, extra) => Object.assign({ id, vin, status, purpose: 'COP-Emisiones', configCode: code,
                config: Object.assign({}, row), registeredAt: '2026-09-10T08:00:00', timeline: [],
                testData: dt ? { testDatetime: dt } : {} }, extra || {});
            db.vehicles.push(mk(9201, 'KNAE2E00000012345', 'archived', '2026-09-15T09:30', { archivedAt: '2026-09-17T16:00:00' }));
            db.vehicles.push(mk(9202, 'KNAE2E00000067890', 'pending-approval', '2026-09-16T08:00'));
            db.vehicles.push(mk(9203, 'KNAE2E0000000NOFE', 'archived', null, { archivedAt: '2026-09-18T10:00:00' }));
            saveDB();
            tpState.weeklyPlans.push({ id: 'e2e-plan', weekDate: '2026-09-14', accepted: true, acceptedDate: '2026-09-11T10:00:00',
                created: '2026-09-11T09:00:00', items: [{ uid: 'e2e-u1', desc: code, testDay: 'vie', completed: false }] });
            tpSave();
        }, CODE);

        // ── Calendario del Plan ─────────────────────────────────────────
        await page.evaluate(() => { switchPlatform('testplan'); tpSwitchTab('tp-calendar'); _tpCalendarMonth = { year: 2026, month: 8 }; tpRender(); });
        await page.waitForTimeout(600);
        const cal = await page.evaluate(() => {
            const day = d => { const c = document.querySelector('[data-cal-day="' + d + '"]'); return c ? { done: c.querySelectorAll('.tp-cal-pill--done').length, plan: c.querySelectorAll('.tp-cal-pill--plan').length, txt: c.innerText } : null; };
            return { d14: day('2026-09-14'), d15: day('2026-09-15'), d16: day('2026-09-16'), d17: day('2026-09-17'), d18: day('2026-09-18'),
                     undated: (document.querySelector('.tp-cal-undated') || {}).innerText || '',
                     month: (document.querySelector('.tp-cal-month') || {}).innerText || '',
                     overflow: document.scrollingElement.scrollWidth - window.innerWidth };
        });
        chk('mes de septiembre', /Septiembre 2026/.test(cal.month), cal.month);
        chk('la prueba del martes 15 está el 15', cal.d15 && cal.d15.done === 1, JSON.stringify(cal.d15));
        chk('…y no el 14 (UTC) ni el 17 (aprobación)', cal.d14.done === 0 && cal.d17.done === 0);
        chk('la que espera aprobación sale en su día de prueba (16)', cal.d16.done === 1);
        chk('lo planeado del viernes 18 va en ámbar', cal.d18.plan === 1 && cal.d18.done === 0, JSON.stringify(cal.d18));
        chk('la prueba sin fecha de prueba se declara', /1 prueba sin fecha de prueba/.test(cal.undated) && /KNAE2E0000000NOFE/.test(cal.undated), cal.undated);
        chk('sin desborde horizontal', cal.overflow <= 1, String(cal.overflow));
        if (!vp.mobile) chk('la píldora trae los últimos 6 del VIN', /012345/.test(cal.d15.txt) && !/0012345/.test(cal.d15.txt), cal.d15.txt);

        await page.click('[data-cal-day="2026-09-15"]');
        await page.waitForTimeout(400);
        const det = await page.evaluate(() => (document.getElementById('tp-calendar-detail') || {}).innerText || '');
        chk('detalle del día: VIN completo y estado', /KNAE2E00000012345/.test(det) && /Archivado/.test(det), det.slice(0, 200));

        // ── Calendario de Datos ─────────────────────────────────────────
        const dat = await page.evaluate(() => _pnCollectCalendarEvents(2026, 8).filter(e => e.type === 'test_done').map(e => e.date + ' ' + e.label));
        chk('Datos → Calendario: realizadas en su día', dat.join('|') === '2026-09-15 🧪 1 prueba realizada|2026-09-16 🧪 1 prueba realizada', dat.join('|'));

        // ── Excel para auditoría ────────────────────────────────────────
        await page.click('#tp-cal-xlsx');
        await page.waitForTimeout(300);
        await page.fill('#tp-audit-from', '2026-09');
        await page.fill('#tp-audit-to', '2026-10');
        const [dl] = await Promise.all([
            page.waitForEvent('download', { timeout: 15000 }),
            page.click('#globalModal .modal-btn-confirm')
        ]);
        chk('nombre del archivo', dl.suggestedFilename() === 'Test_Plan_2026-09_2026-10.xlsx', dl.suggestedFilename());
        const fs = require('fs');
        const buf = fs.readFileSync(await dl.path());
        chk('es un ZIP comprimido y chico', buf[0] === 0x50 && buf[1] === 0x4B && buf.length < 400000, String(buf.length));
        const leido = await page.evaluate(async (b64) => {
            const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const g = await vetsReadWorkbook(u8, null);
            const sep = g['Sep-26'] || {};
            let martes = '';
            Object.keys(sep).forEach(r => Object.keys(sep[r]).forEach(c => { if (String(sep[r][c]) === '012345') martes = r + ':' + c; }));
            // Viernes 18 (columnas O/P = 15/16): lo planeado del plan aceptado, sin VIN.
            const vie = { fam: (sep[20] || {})[15] || '', vin: (sep[20] || {})[16] || '' };
            return { hojas: Object.keys(g), martes, vie, log: JSON.stringify(g['Test Log'] || {}).length };
        }, buf.toString('base64'));
        chk('hojas del libro', leido.hojas.join() === 'Instructions,Summary,Projection,Sep-26,Oct-26,Test Log,Lists', leido.hojas.join());
        // Semana del 14-sep es la 3ª (renglón 5 + 2·7 = 19); martes = columnas I/J (9/10): VIN en 20:10.
        chk('el VIN (últimos 6) quedó en el martes 15 de la hoja Sep-26', leido.martes === '20:10', leido.martes);
        chk('lo planeado del viernes 18 está en su día, sin VIN', /^CL4 1\.0 KAPPA PE 6MT MY26 PRE-EURO 7 5DR$/.test(leido.vie.fam) && !leido.vie.vin, JSON.stringify(leido.vie));
        const aud = await page.evaluate(() => (auditGetTrail ? auditGetTrail() : []).filter(e => e.action === 'calendario_xlsx_exportado').length);
        chk('la exportación queda en el historial de cambios', aud >= 1, String(aud));

        chk('sin errores de página', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    if (fallos.length) { console.log('\n' + fallos.length + ' falla(s)'); process.exitCode = 1; }
    else console.log('\nv2320: todo ok');
})();
