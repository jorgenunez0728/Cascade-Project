// Verificación en navegador de 3.0.1 — el almacenamiento.
// (1) Sin el falso "Almacenamiento al 127%": un equipo al ~55% real no avisa.
// (2) La foto de "deshacer fusión" sale de localStorage a IndexedDB y deshacer sigue funcionando.
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
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const ops = [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }];
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: ops, tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    // Una foto de fusión "a la antigua", dentro de la bitácora: ~2.6 M caracteres. Con la
    // fórmula vieja (× 2 contra 5 MiB) esto ya pasaba de 100%; en realidad es ~50%.
    const relleno = 'x'.repeat(2600000);
    const snap = { cop15: { vehicles: [{ id: 'v-viejo', vin: 'KNAOLD00000000001', status: 'archived', registeredAt: '2026-01-01T00:00:00Z' }], lastId: 1, pad: relleno } };
    localStorage.setItem('kia_merge_history', JSON.stringify([
        { id: 'merge_1', timestamp: '2026-10-01T10:00:00Z', fromStation: 'A', toStation: 'B', actions: ['vieja'], snapshot: { cop15: { vehicles: [] } } },
        { id: 'merge_2', timestamp: '2026-10-08T10:00:00Z', fromStation: 'A', toStation: 'B', actions: ['COP15: 1 vehículo'], snapshot: snap }
    ]));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 1528, height: 732 }, timezoneId: 'America/Mexico_City' });
    const page = await ctx.newPage();
    const errores = [], toasts = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
    await page.addInitScript(SEED);
    await page.exposeFunction('_e2eToast', m => toasts.push(m));
    await page.addInitScript(() => {
        const obs = new MutationObserver(() => document.querySelectorAll('.toast, [class*="toast"]').forEach(t => {
            if (!t._seen) { t._seen = 1; window._e2eToast(t.innerText || ''); } }));
        document.addEventListener('DOMContentLoaded', () => obs.observe(document.body, { childList: true, subtree: true }));
    });
    await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
    await page.waitForTimeout(5000);

    chk('no sale el falso "Almacenamiento al …%"', !toasts.some(t => /Almacenamiento al/.test(t)), toasts.filter(t => /Almacen/.test(t)).join(' | '));

    const st = await page.evaluate(() => new Promise(res => {
        const hist = JSON.parse(localStorage.getItem('kia_merge_history') || '[]');
        const last = hist[hist.length - 1] || {};
        _fbMergeSnapGet(last.id, snap => res({
            n: hist.length, inline: hist.some(r => r.snapshot), in: last.snapshotIn, purged: !!hist[0].snapshotPurged,
            bytes: (localStorage.getItem('kia_merge_history') || '').length,
            idb: !!(snap && snap.cop15 && snap.cop15.vehicles && snap.cop15.vehicles[0].id === 'v-viejo'),
            pct: pnStorageScan({ fresh: true }).pct
        }));
    }));
    chk('la foto salió de localStorage', !st.inline && st.in === 'idb' && st.bytes < 5000, JSON.stringify(st));
    chk('la foto quedó en IndexedDB, completa', st.idb);
    chk('la bitácora se conserva (2 registros, la vieja sin respaldo)', st.n === 2 && st.purged);
    chk('el almacenamiento bajó (< 20%)', st.pct < 20, st.pct.toFixed(1) + '%');

    // Deshacer la última fusión: lee la foto de IndexedDB y restaura.
    const und = await page.evaluate(() => new Promise(res => {
        window.showConfirmDialog = () => Promise.resolve(true);
        window.fbShowSettings = () => {};
        window.fbPushAll = () => {};
        fbMergeUndo();
        setTimeout(() => {
            const hist = JSON.parse(localStorage.getItem('kia_merge_history') || '[]');
            _fbMergeSnapGet('merge_2', snap => res({ vin: (db.vehicles[0] || {}).vin, n: db.vehicles.length, hist: hist.length, left: !!snap }));
        }, 1500);
    }));
    chk('deshacer restaura los datos de la foto', und.vin === 'KNAOLD00000000001' && und.n === 1, JSON.stringify(und));
    chk('deshacer quita el registro y la foto', und.hist === 1 && !und.left, JSON.stringify(und));

    // Una fusión nueva escribe la bitácora sin foto y la foto en IndexedDB.
    const nueva = await page.evaluate(() => new Promise(res => {
        db.vehicles.push({ id: 'v-nuevo', vin: 'KNANEW00000000002', status: 'archived', registeredAt: '2026-10-09T00:00:00Z' });
        const hist = JSON.parse(localStorage.getItem('kia_merge_history') || '[]');
        const rec = { id: 'merge_x', timestamp: new Date().toISOString(), actions: ['prueba'], snapshotIn: 'idb' };
        _fbMergeHistoryWrite(_fbMergeTrimHistory(hist.concat([rec])));
        _fbMergeSnapPut('merge_x', { cop15: JSON.parse(JSON.stringify(db)) }, ok => {
            const h = JSON.parse(localStorage.getItem('kia_merge_history') || '[]');
            res({ ok, inline: h.some(r => r.snapshot), viejas: h.filter(r => r.snapshotIn).length });
        });
    }));
    chk('fusión nueva: foto en IndexedDB, una sola marcada', nueva.ok && !nueva.inline && nueva.viejas === 1, JSON.stringify(nueva));

    chk('sin errores de página ni diálogos nativos', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' fallas' : '\ntodo bien');
    if (fallos.length) process.exitCode = 1;
})();
