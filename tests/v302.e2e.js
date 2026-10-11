// Verificación en navegador de 3.0.2 — Historial → Completar teclea los gases en la unidad
// del reporte (mg/km en Europa) y guarda en la del límite (g/km).
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const ops = [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }];
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: ops, tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1920, height: 1017, et: 'Escritorio 1920×1017' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
        console.log('\n== ' + vp.et + ' ==');
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, timezoneId: 'America/Mexico_City' });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(2500);

        // El perfil vigente del laboratorio teclea en mg/km; la prueba archivada no trae perfil congelado.
        const abierto = await page.evaluate(() => {
            const p = loadRegulations().profiles.find(x => x.name === 'EURO-5');
            p.gases.forEach(g => { if (g.unit === 'g/km') g.captureUnit = 'mg/km'; });
            db.vehicles.push({ id: 'v-old', vin: 'KNAEUR00000292874', status: 'archived', purpose: 'CoP', registeredAt: '2026-08-01T10:00:00Z',
                archivedAt: '2026-08-03T10:00:00Z', config: { 'Modelo': 'Sportage', 'EMISSION REGULATION': 'EURO-5', 'REGION': 'EUROPE' },
                testData: { testDatetime: '2026-08-02T09:00' }, timeline: [] });
            histOpenCompleteModal('v-old');
            const lbl = (document.getElementById('hist-gas-unitlbl-CO') || {}).innerText || '';
            const inp = document.getElementById('hist-gas-CO');
            return { lbl, cap: inp && inp.getAttribute('data-gcap'), sel: (document.getElementById('hist-gas-unit') || {}).value,
                     chips: document.querySelectorAll('#hist-complete-overlay .ui-chips button, #hist-complete-overlay [data-chip]').length };
        });
        chk('el gas se teclea en mg/km con el límite en mg/km', /mg\/km/.test(abierto.lbl) && /límite 1000\b/.test(abierto.lbl) && abierto.cap === 'mg/km', JSON.stringify(abierto));
        chk('dice en qué unidad se guarda', /se guarda en g\/km/.test(abierto.lbl), abierto.lbl);
        chk('la unidad del reporte se ve y se elige', abierto.sel === 'mg/km');

        await page.fill('#hist-gas-CO', '250');
        await page.fill('#hist-gas-NOx', '35');
        const st1 = await page.evaluate(() => document.getElementById('hist-gas-status-CO').innerText + ' | ' + document.getElementById('hist-gas-status-NOx').innerText);
        chk('250 mg/km de CO pasa (25% del límite)', /PASA/.test(st1) && /25/.test(st1), st1);

        // Cambiar a g/km: el mismo número ya no pasa.
        await page.evaluate(() => { const s = document.getElementById('hist-gas-unit'); s.value = 'g/km'; s.dispatchEvent(new Event('change', { bubbles: true })); });
        const st2 = await page.evaluate(() => ({ s: document.getElementById('hist-gas-status-CO').innerText, l: document.getElementById('hist-gas-unitlbl-CO').innerText }));
        chk('en g/km el mismo 250 falla y el límite vuelve a 1', /FALLA/.test(st2.s) && /g\/km · límite 1\)/.test(st2.l), JSON.stringify(st2));
        await page.evaluate(() => { const s = document.getElementById('hist-gas-unit'); s.value = 'mg/km'; s.dispatchEvent(new Event('change', { bubbles: true })); });

        const guardado = await page.evaluate(() => new Promise(res => {
            histSaveCompleteModal();
            setTimeout(() => { const v = db.vehicles.find(x => x.id === 'v-old'); res(((v.testData.gasResults || {}).liberador || {}).values || {}); }, 600);
        }));
        chk('se guarda en g/km (250 mg → 0.25 g; 35 mg → 0.035 g)', guardado.CO === 0.25 && guardado.NOx === 0.035, JSON.stringify(guardado));

        chk('sin errores de página ni diálogos nativos', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' fallas' : '\ntodo bien');
    if (fallos.length) process.exitCode = 1;
})();
