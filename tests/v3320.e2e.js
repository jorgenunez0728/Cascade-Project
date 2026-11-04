// Verificación en navegador de 3.32.0 — calendario del Plan: los nombres no se cortan, el fin
// de semana sin nada se angosta, y el mes se descarga como imagen (sin librerías de CDN).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const OUT = process.env.E2E_OUT || '';

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    const mk = (desc, o) => Object.assign({ desc, id: desc, mod: 'CL4', rgn: 'EUROPE', reg: 'PRE-EURO 7', eng: '1600CC GAMMA-II', tx: '7DCT',
        my: '26 MODEL', drv: 'LHD', body: 'WGN', ep: '0', engpkg: 'LOW POWER', tire: '205/55 R16', total: 9000, hist: 0, m: [] }, o || {});
    const cfgs = [mk('A'), mk('B', { engpkg: 'HIGH POWER' }), mk('C', { eng: '2000cc NU-PE', engpkg: 'ATKINSON', tx: 'CVT' }),
                  mk('D', { mod: 'CL4MH', my: '27 MODEL', eng: '1600CC KAPPA PE', tx: '6DCT', engpkg: '0' })];
    const it = (uid, desc, test) => ({ uid, desc, completed: false, testDay: test, plannedTestDay: test, soakHours: 24 });
    const WD = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_testplan_v1', JSON.stringify({
        planData: cfgs, testedList: [], weekHistory: [], planHistory: [], rulePresets: [],
        capacity: 30, vehiclesPerSlot: 10, weekAvailability: {}, months: ['Nov-26'], _migr: { capacity: 1, itemUids: 1 },
        weeklyPlans: [
            { id: 1, planId: 'P1', weekDate: '2026-11-09', created: '2026-11-01T10:00:00', accepted: true, acceptedDate: '2026-11-02T10:00:00', workDays: WD, capacity: 8,
              items: [it('a', 'A', 'mar'), it('b', 'B', 'mar'), it('c', 'C', 'mie'), it('d', 'D', 'jue'), it('e', 'A', 'vie')] },
            { id: 2, planId: 'P2', weekDate: '2026-11-23', created: '2026-11-15T10:00:00', accepted: false, workDays: WD, capacity: 8,
              items: [it('f', 'D', 'mar'), it('g', 'D', 'mar'), it('h', 'C', 'jue')] }
        ]
    }));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    for (const vp of [{ width: 1920, height: 1017, et: 'Escritorio 1920×1017' }, { width: 427, height: 840, et: 'Teléfono 427×840', mobile: true }]) {
        console.log('\n== ' + vp.et + ' ==');
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile,
            timezoneId: 'America/Mexico_City', acceptDownloads: true });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(2500);
        await page.evaluate(() => { switchPlatform('testplan'); _tpCalendarMonth = { year: 2026, month: 10 }; tpRender(); });
        await page.waitForTimeout(600);

        const s = await page.evaluate(() => {
            const g = document.querySelector('.tp-cal-grid--weeks');
            const cols = g ? getComputedStyle(g).gridTemplateColumns.split(' ').map(parseFloat) : [];
            const pills = Array.from(document.querySelectorAll('.tp-cal-pill'));
            return { slim: !!(g && g.classList.contains('tp-cal-grid--slimwe')), cols,
                     pills: pills.length, cut: pills.filter(p => p.scrollWidth > p.clientWidth + 1).length,
                     btn: !!document.getElementById('tp-cal-png') };
        });
        chk('sin nada en fin de semana, la cuadrícula angosta sábado y domingo', s.slim, JSON.stringify(s.cols));
        chk('sábado más angosto que el lunes', s.cols.length === 8 && s.cols[6] < s.cols[1] * 0.7, JSON.stringify(s.cols));
        if (!vp.mobile) chk('ninguna familia sale cortada', s.pills > 0 && s.cut === 0, s.cut + ' de ' + s.pills);
        chk('botón 🖼️ Imagen del mes', s.btn);
        if (OUT) await page.screenshot({ path: path.join(OUT, 'cal-' + vp.width + '.png'), fullPage: false });

        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
                                        page.evaluate(() => tpCalendarImageExport())]);
        chk('descarga plan-pruebas-2026-11.png', dl && dl.suggestedFilename() === 'plan-pruebas-2026-11.png', dl && dl.suggestedFilename());
        if (dl && OUT && !vp.mobile) {
            await dl.saveAs(path.join(OUT, 'plan-pruebas-2026-11.png'));
            const b = fs.readFileSync(path.join(OUT, 'plan-pruebas-2026-11.png'));
            chk('es un PNG', b.slice(1, 4).toString() === 'PNG');
        }
        chk('sin errores ni diálogos nativos', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' fallas' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})();
