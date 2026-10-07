// Verificación en navegador de 2.35.0 — revisión al reconectar. El ciclo con la nube lo
// fija tests/vehsync.node.js; aquí se prueba la ventana real: qué muestra, que "Aplicar"
// borre de este equipo lo desmarcado (con deshacer) y que "Decidir después" deje el
// indicador en pausa. Escritorio 1920×1017 y teléfono 427×840.
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
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));
        page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
        await page.addInitScript(SEED);
        await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
        await page.waitForTimeout(2500);

        // Un equipo que llega 23 días tarde: 2 vehículos que la nube no tiene y lecturas viejas.
        await page.evaluate(() => {
            const mk = (id, vin, d) => ({ id, vin, status: 'archived', purpose: 'COP-Emisiones', configCode: 'CL4-26 MODEL-IVT-PRE-EURO 7-EUROPE-5DR',
                config: { 'Modelo': 'CL4' }, registeredAt: d, timeline: [], testData: {} });
            db.vehicles = [mk(8001, 'KNADUMMY000000001', '2026-08-20T10:00:00'), mk(8002, 'KNADUMMY000000002', '2026-08-21T10:00:00'),
                           mk(8003, 'KNAREAL0000000003', '2026-09-30T10:00:00')];
            invState.gases = [{ id: 'g1', controlNo: 'G1', name: 'CO 500 ppm', readings: [{ date: '2026-09-01', psi: 1500 }, { date: '2026-09-02', psi: 1480 }] }];
            saveDB(); invSave();
            const model = fbReviewModel({ vehicles: db.vehicles, cloudDocs: { v_8003: 'r' }, bootAt: '2099-01-01',
                localInv: invState, remoteInv: { gases: [{ controlNo: 'G1', readings: [{ date: '2026-09-01', psi: 1500 }, { date: '2026-09-23', psi: 1200 }] }],
                                                 fuelTanks: JSON.parse(JSON.stringify(invState.fuelTanks || [])) } });
            fbSync.review = { state: 'asking', since: new Date(Date.now() - 23 * 86400000).toISOString(), days: 23, deferred: {}, model };
            fbReviewOpen();
        });
        await page.waitForTimeout(400);
        let s = await page.evaluate(() => {
            const m = document.getElementById('globalModal');
            const box = m && m.querySelector('.custom-modal-box');
            return { open: !!m, text: m ? m.innerText : '', vins: [...document.querySelectorAll('#globalModal .fbrev-vin')].map(e => e.textContent),
                     invChecked: [...document.querySelectorAll('#globalModal .fbrev-chk[data-kind="inv"]')].map(c => c.checked),
                     overflow: box ? box.scrollWidth - box.clientWidth : -1 };
        });
        chk('la ventana se abre', s.open);
        chk('dice desde cuándo no se sincroniza', /hace 3 semanas/.test(s.text), s.text.slice(0, 200));
        chk('lista solo los VIN que la nube no tiene', s.vins.join() === 'KNADUMMY000000001,KNADUMMY000000002', s.vins.join());
        chk('la lectura 3 semanas más vieja sale desmarcada y avisada', s.invChecked.join() === 'false' && /3 semanas más vieja/.test(s.text));
        chk('la caja no se desborda a lo ancho', s.overflow <= 1, 'sobra ' + s.overflow);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'rev-' + vp.width + '.png') });

        // "Ninguno" en vehículos y Aplicar.
        await page.click('#globalModal .fbrev-link:has-text("Ninguno")');
        await page.click('#globalModal button:has-text("Aplicar")');
        await page.waitForTimeout(500);
        s = await page.evaluate(() => ({ vins: db.vehicles.map(v => v.vin), state: fbSync.review.state,
            readings: invState.gases[0].readings.map(r => r.date), modal: !!document.getElementById('globalModal'),
            toast: (document.querySelector('.toast-container') || document.body).innerText }));
        chk('borra de este equipo lo desmarcado y conserva lo demás', s.vins.join() === 'KNAREAL0000000003', s.vins.join());
        chk('descarta la lectura vieja', s.readings.join() === '2026-09-01', s.readings.join());
        chk('queda en la ventana de deshacer, sin modal', s.state === 'applied' && !s.modal);
        chk('lo dice con Deshacer', /Revisión aplicada/.test(s.toast) && /Deshacer/i.test(s.toast), s.toast.slice(0, 200));
        await page.evaluate(() => fbReviewUndo());
        await page.waitForTimeout(700);
        s = await page.evaluate(() => ({ n: db.vehicles.length, state: fbSync.review.state, modal: !!document.getElementById('globalModal') }));
        chk('deshacer regresa todo y vuelve a preguntar', s.n === 3 && s.state === 'asking' && s.modal, JSON.stringify(s));

        // "Decidir después": el indicador queda en pausa y lo reabre.
        await page.click('#globalModal button:has-text("Decidir después")');
        await page.waitForTimeout(400);
        s = await page.evaluate(() => { fbUpdateIndicator(); const el = document.getElementById('fb-sync-indicator');
            return { txt: el ? el.textContent : '(sin indicador)', modal: !!document.getElementById('globalModal'), held: fbReviewHolds('cop15') }; });
        chk('"Decidir después" cierra y sigue detenido', !s.modal && s.held);
        chk('el indicador dice que falta revisar', /revisar antes de subir/.test(s.txt) || s.txt === '(sin indicador)', s.txt);
        chk('sin errores ni diálogos nativos', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\nTodo bien');
    process.exitCode = fallos.length ? 1 : 0;
})();
