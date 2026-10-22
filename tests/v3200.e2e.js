// Verificación en navegador de 3.20.0 — la base del equipo vive en IndexedDB.
// (1) Un equipo con localStorage casi lleno migra solo: la base pasa a IndexedDB sin perder
//     nada y el almacenamiento rápido baja.
// (2) Lo que se edita persiste al recargar; liberar ya no se bloquea por espacio.
// (3) Si una escritura falla, se dice; sin IndexedDB todo sigue como antes.
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
    if (localStorage.getItem('__seeded')) return;
    const ahora = Date.now();
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'm1', operatorName: 'Ana Manager', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'm1', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }],
        tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    // ~3.3 MB de vehículos archivados con dos firmas cada uno (lo que llenaba el equipo).
    const firma = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(1000);
    const vehicles = Array.from({ length: 150 }, (_, i) => ({
        id: 'veh_' + i, vin: 'KNAVIN' + String(i).padStart(11, '0'), status: 'archived', purpose: 'COP-Emisiones',
        configCode: 'C1', config: { 'EMISSION REGULATION': 'EURO-5', REGION: 'EUROPE' },
        registeredAt: '2026-0' + (1 + i % 9) + '-10T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
        timeline: [{ timestamp: '2026-10-01T10:00:00.000Z', action: 'Archivado' }],
        testData: { odometer: 100 + i, notes: '', signatures: { releaser: { image: firma + i }, approver: { image: firma + (i + 1) } } }
    }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ version: '11.0', lastId: 150, vehicles }));
    localStorage.setItem('__relleno', 'x'.repeat(900000));
    localStorage.setItem('__seeded', '1');
};

async function abrir(ctx) {
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof dbStoreIsReady === 'function' && dbStoreIsReady() && typeof bootStageNow === 'function' && bootStageNow() === 'lista', null, { timeout: 20000 });
    await page.waitForTimeout(800);
    return { page, errores };
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(SEED);

    console.log('\n== Migración de un equipo con localStorage casi lleno ==');
    const { page, errores } = await abrir(ctx);
    const m = await page.evaluate(async () => {
        await dbStoreFlush();
        const raw = await dbStoreReadRaw();
        const g = JSON.parse(raw);
        const scan = pnStorageScan({ fresh: true });
        return {
            backend: dbStoreStats().backend, ls: localStorage.getItem('kia_db_v11'),
            marca: JSON.parse(localStorage.getItem('kia_db_store') || 'null'),
            n: g.vehicles.length, nMem: db.vehicles.length,
            firmas: g.vehicles.every((v, i) => v.testData.signatures.releaser.image.endsWith(String(i)) || v.testData.signatures.releaser.image.length > 10000),
            // _rev se calcula al cargar (revInitMissing, v24.1) y se guarda en el primer guardado:
            // lo que importa es que el CONTENIDO guardado sea el de memoria.
            revOk: g.vehicles.every(v => { const mem = db.vehicles.find(x => x.id === v.id);
                return mem && mem.vin === v.vin && JSON.stringify(mem.testData) === JSON.stringify(v.testData) && (!v._rev || v._rev === mem._rev); }),
            pct: scan.pct, dbLine: scan.dbLine && scan.dbLine.text
        };
    });
    chk('la base pasó a IndexedDB', m.backend === 'idb' && m.marca && m.marca.backend === 'idb', JSON.stringify(m));
    chk('y ya no está en localStorage', m.ls === null);
    chk('no se perdió ningún vehículo ni firma', m.n === 150 && m.nMem === 150 && m.firmas, JSON.stringify({ n: m.n }));
    chk('lo guardado coincide con lo de memoria', m.revOk);
    chk('el almacenamiento rápido bajó de ~90 % a menos de 30 %', m.pct < 30, m.pct.toFixed(1));
    chk('Datos → Sistema dice dónde vive la base', /IndexedDB/.test(m.dbLine || ''), m.dbLine);

    console.log('\n== Editar, recargar y liberar ==');
    await page.evaluate(() => { db.vehicles[3].testData.notes = 'nota después de migrar'; saveDB(); return dbStoreFlush(); });
    const libera = await page.evaluate(() => _releasePreflightStorage('liberar'));
    chk('liberar ya no se bloquea por espacio', libera === true);
    await page.reload();
    await page.waitForFunction(() => typeof dbStoreIsReady === 'function' && dbStoreIsReady() && bootStageNow() === 'lista', null, { timeout: 20000 });
    const tras = await page.evaluate(() => ({ nota: db.vehicles[3].testData.notes, n: db.vehicles.length, backend: dbStoreStats().backend }));
    chk('lo editado sigue ahí al recargar', tras.nota === 'nota después de migrar' && tras.n === 150 && tras.backend === 'idb', JSON.stringify(tras));

    console.log('\n== Una escritura fallida se dice ==');
    const falla = await page.evaluate(async () => {
        window.__toasts = [];
        const orig = showToast;
        window.showToast = function(msg) { window.__toasts.push(String(msg)); return orig.apply(this, arguments); };
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function() { throw new Error('disco lleno (simulado)'); };
        db.vehicles[4].testData.notes = 'no cabe';
        const primero = saveDB();
        const r = await dbStoreFlush();
        const segundo = saveDB();
        const sano = dbStoreHealthy();
        IDBObjectStore.prototype.put = put;
        await new Promise(res => setTimeout(res, 1300));   // reintento a 1 s
        return { primero, r, segundo, sano, recupera: dbStoreHealthy(), toasts: window.__toasts };
    });
    chk('el guardado siguiente devuelve false', falla.r === false && falla.segundo === false && falla.sano === false, JSON.stringify(falla));
    chk('y se avisa', falla.toasts.some(t => /No se pudo guardar/.test(t)), JSON.stringify(falla.toasts));
    chk('se recupera solo al reintentar', falla.recupera === true);

    console.log('\n== Sin IndexedDB, como antes ==');
    const ctx2 = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true });
    await ctx2.addInitScript(() => { try { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); } catch (e) {} });
    await ctx2.addInitScript(SEED);
    const sin = await abrir(ctx2);
    const s = await sin.page.evaluate(() => ({ backend: dbStoreStats().backend, n: db.vehicles.length, guarda: (db.lastId = 151, saveDB()),
        ls: !!localStorage.getItem('kia_db_v11') }));
    chk('arranca sobre localStorage y guarda ahí', s.backend === 'ls' && s.n === 150 && s.guarda === true && s.ls, JSON.stringify(s));

    console.log('\n== Si la base no abre, no arranca vacía ==');
    const ctx3 = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true });
    await ctx3.addInitScript(SEED);
    await ctx3.addInitScript(() => {
        localStorage.removeItem('kia_db_v11');
        localStorage.setItem('kia_db_store', JSON.stringify({ v: 1, backend: 'idb' }));
        const open = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function(name) {
            if (name !== 'kia_emlab_db') return open.apply(this, arguments);
            const r = {}; setTimeout(() => { if (r.onerror) r.onerror({}); }, 10); return r;
        };
    });
    const p3 = await ctx3.newPage();
    await p3.goto('file://' + path.join(REPO, 'index.html'));
    await p3.waitForTimeout(2500);
    const f = await p3.evaluate(() => ({ estado: dbStoreStats().state, etapa: bootStageNow(),
        msg: (document.getElementById('boot-msg') || {}).textContent, boton: !!document.querySelector('#boot-db-fail button') }));
    chk('se queda en la bienvenida con el motivo y Reintentar', f.estado === 'failed' && f.etapa !== 'lista' && f.boton && /base de datos/.test(f.msg), JSON.stringify(f));

    chk('sin errores de página ni diálogos nativos', !errores.length && !sin.errores.length, errores.concat(sin.errores).join(' | '));
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLA(S)' : '\ntodo bien');
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
