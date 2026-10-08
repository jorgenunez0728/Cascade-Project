// Verificación en navegador de 2.37.0 — Avisos del laboratorio (Datos → Sistema).
// La tarjeta se pinta, valida los correos en el campo, la vista previa usa los vehículos del
// equipo, y "Activar avisos aquí" explica por qué no se puede (file:// no es https).
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const SHOTS = process.env.E2E_SHOTS || '';

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
            timezoneId: 'America/Mexico_City' });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(2500);

        await page.evaluate(() => {
            const ago = d => new Date(Date.now() - d * 86400e3).toISOString();
            db.vehicles.push(
                { id: 'e2e-a', vin: 'KNAE2E00000A12345', status: 'pending-approval', registeredAt: ago(11), config: { 'Modelo': 'Sportage HEV', 'EMISSION REGULATION': 'EURO 6E' },
                  timeline: [{ timestamp: ago(4), data: { status: 'pending-approval' } }] },
                { id: 'e2e-b', vin: 'KNAE2E00000B67890', status: 'in-progress', registeredAt: ago(2), config: { 'Modelo': 'K3 GT', 'EMISSION REGULATION': 'SULEV 30' }, timeline: [] });
            switchPlatform('panel'); pnSwitchTab('pn-system');
        });
        await page.waitForTimeout(900);
        const card = await page.evaluate(() => {
            const h = document.getElementById('pn-digest-card');
            return { ok: !!h, txt: h ? h.innerText : '', fields: ['dg-to', 'dg-esc', 'dg-days', 'dg-ntfy'].every(id => !!document.getElementById(id)) };
        });
        chk('la tarjeta 📬 Avisos del laboratorio se pinta en Sistema', card.ok && /lunes a viernes a las 7:00/.test(card.txt), card.txt.slice(0, 120));
        chk('destinatarios, escalación, días y tema de ntfy', card.fields);
        chk('días para escalar arranca en 7', (await page.inputValue('#dg-days')) === '7');

        // Correo inválido → el error va en el campo (2.12.0), no en un toast.
        await page.fill('#dg-esc', 'jefe@kia.com, no-es-correo');
        await page.click('#dg-save');
        await page.waitForTimeout(300);
        const inval = await page.evaluate(() => {
            const el = document.getElementById('dg-esc');
            const id = el.getAttribute('aria-describedby');
            return { aria: el.getAttribute('aria-invalid'), msg: id && document.getElementById(id) ? document.getElementById(id).textContent : '' };
        });
        chk('un correo inválido se marca en su campo', inval.aria === 'true' && /no-es-correo/.test(inval.msg), JSON.stringify(inval));

        // Vista previa con los datos del equipo.
        await page.evaluate(() => digestPreviewOpen());
        await page.waitForTimeout(600);
        const prev = await page.evaluate(() => {
            const f = document.querySelector('#globalModal iframe');
            const d = f && f.contentDocument;
            return { ok: !!f, asunto: (document.querySelector('#globalModal') || {}).innerText || '',
                     body: d && d.body ? d.body.innerText : '' };
        });
        chk('la vista previa abre con el asunto', prev.ok && /Asunto:.*activos?/.test(prev.asunto), prev.asunto.slice(0, 160));
        chk('la vista previa lista los activos y el escalado', /Escalados/i.test(prev.body) && /…A12345/.test(prev.body) && /K3 GT/.test(prev.body), prev.body.slice(0, 200));
        chk('la vista previa no trae el VIN completo', !/KNAE2E00000A12345/.test(prev.body));
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v2370-preview-' + vp.width + '.png') });
        await page.evaluate(() => { const m = document.getElementById('globalModal'); if (m) m.remove(); });

        // Activar avisos: en file:// no se puede, y el botón lo dice.
        const push = await page.evaluate(() => {
            const b = document.getElementById('dg-push-on');
            return { ok: !!b, why: b ? (b.getAttribute('data-why') || b.title || '') : '' };
        });
        chk('Activar avisos explica por qué no se puede aquí', push.ok && push.why.length > 10, JSON.stringify(push));
        if (SHOTS) {
            await page.evaluate(() => document.getElementById('pn-digest-card').scrollIntoView());
            await page.waitForTimeout(400);
            await page.screenshot({ path: path.join(SHOTS, 'v2370-card-' + vp.width + '.png') });
        }
        chk('sin errores de página ni diálogos nativos', !errores.length, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    if (fallos.length) { console.log('\n' + fallos.length + ' FALLA(S)'); process.exitCode = 1; }
    else console.log('\nTodo bien.');
})();
