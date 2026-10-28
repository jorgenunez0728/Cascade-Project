// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.24.1 — La firma sin CDN                                            ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Con TODOS los CDN bloqueados (la red del laboratorio), el recuadro de firma pinta con el
// mouse y con el dedo, guía (punteado → sólido; rojo si se intenta continuar sin firmar),
// "Borrar" lo vacía, y la imagen guardada es de tamaño lógico (≤ 560×180) con trazo real.
// 1440×950 (mouse) y 430×900 (dedo, devicePixelRatio 3).
const { chromium } = require('playwright');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const SEED = () => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: '2099-01-01T00:00:00.000Z' }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Signatario', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 1, vehicles: [] }));
};

async function abrir(browser, vp, extra) {
    const context = await browser.newContext(Object.assign({ viewport: vp, timezoneId: 'America/Mexico_City', locale: 'es-MX' }, extra || {}));
    const page = await context.newPage();
    const errores = [], cdn = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    page.on('request', r => { if (/signature_pad/i.test(r.url())) cdn.push(r.url()); });
    await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|gstatic\.com/, r => r.abort());
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, process.env.E2E_BUNDLE ? 'kia-emlab-unified.html' : 'index.html'));
    await page.waitForFunction(() => typeof sigCaptureOpen === 'function' && typeof db !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    return { context, page, errores, cdn };
}

const abrirFirma = page => page.evaluate(() => {
    window.__firma = null;
    sigCaptureOpen({ title: 'Firma de prueba', signerName: 'Ana Signataria', lockName: true, role: 'Signatario',
                     onSave: r => { window.__firma = r; } });
});
const estado = page => page.evaluate(() => {
    const w = document.querySelector('.sig-capture-canvas-wrap');
    const h = w && w.querySelector('.sig-hint');
    return { firmado: !!(w && w.classList.contains('is-signed')), falta: !!(w && w.classList.contains('sig-need')),
             pista: !!(h && getComputedStyle(h).display !== 'none'),
             vacio: typeof _sigPadInstance !== 'undefined' && _sigPadInstance ? _sigPadInstance.isEmpty() : null };
});
// Cuenta pixeles oscuros de un dataURL (y devuelve su tamaño).
const analizar = (page, url) => page.evaluate(u => new Promise(res => {
    const img = new Image();
    img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0, minX = 1e9, maxX = -1;
        for (let i = 0; i < d.length; i += 4) if (d[i] < 128) { n++; const px = (i / 4) % c.width; if (px < minX) minX = px; if (px > maxX) maxX = px; }
        res({ w: img.width, h: img.height, oscuros: n, minX, maxX });
    };
    img.onerror = () => res(null);
    img.src = u;
}), url);

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });

    // ── Escritorio, con mouse ──────────────────────────────────────────────
    console.log('\n== Escritorio 1440×950 (mouse) ==');
    let { context, page, errores, cdn } = await abrir(browser, { width: 1440, height: 950 });
    ok('La app no pide signature_pad al CDN', cdn.length === 0, cdn.join(', '));
    await abrirFirma(page);
    let e = await estado(page);
    ok('El recuadro se abre vacío, con la pista', e.vacio === true && e.pista && !e.firmado, JSON.stringify(e));

    // Sin firmar: no continúa y el recuadro se pone en rojo.
    await page.click('.sig-capture-overlay button:has-text("Firmar y Continuar")');
    e = await estado(page);
    ok('Continuar sin firma: no guarda y el recuadro lo marca', e.falta && !(await page.evaluate(() => window.__firma)), JSON.stringify(e));

    const box = await page.locator('#sig-capture-canvas').boundingBox();
    ok('El lienzo tiene alto 180 y ancho ≤ 560', box && Math.round(box.height) === 180 && box.width <= 560.5, JSON.stringify(box));
    // Una "M" de lado a lado (10 % a 90 % del ancho).
    const P = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
    await page.mouse.move(...P(0.1, 0.8)); await page.mouse.down();
    for (const [fx, fy] of [[0.25, 0.2], [0.4, 0.7], [0.55, 0.2], [0.7, 0.75], [0.9, 0.3]])
        await page.mouse.move(...P(fx, fy), { steps: 12 });
    await page.mouse.up();
    e = await estado(page);
    ok('Al firmar: ya no está vacío, borde sólido y sin pista', e.vacio === false && e.firmado && !e.pista && !e.falta, JSON.stringify(e));

    // Borrar.
    await page.click('.sig-capture-overlay button:has-text("Borrar")');
    e = await estado(page);
    ok('Borrar lo deja vacío otra vez (con la pista)', e.vacio === true && e.pista && !e.firmado, JSON.stringify(e));

    // Firmar de nuevo y continuar.
    await page.mouse.move(...P(0.15, 0.5)); await page.mouse.down();
    await page.mouse.move(...P(0.85, 0.5), { steps: 20 });
    await page.mouse.up();
    // Un toque solo también es trazo (un punto).
    await page.mouse.click(...P(0.5, 0.25));
    await page.click('.sig-capture-overlay button:has-text("Firmar y Continuar")');
    let f = await page.evaluate(() => window.__firma);
    ok('Firmar y Continuar entrega la firma con nombre y sesión', !!(f && f.signerName === 'Ana Signataria' && f.sessionUserId === 'ana' && /^data:image\/png;base64,/.test(f.dataUrl)), f && f.signerName);
    let a = f ? await analizar(page, f.dataUrl) : null;
    ok('La imagen es de tamaño lógico (el del lienzo, no ×DPR)', a && a.w === Math.round(box.width) && a.h === 180, JSON.stringify(a));
    ok('La imagen tiene trazo de lado a lado (≈15 % → 85 %)', a && a.oscuros > 200 && a.minX < a.w * 0.2 && a.maxX > a.w * 0.8, JSON.stringify(a));
    ok('El recuadro se cerró', await page.evaluate(() => !document.querySelector('.sig-capture-overlay')));
    ok('Sin errores de página', errores.length === 0, errores.join(' | '));
    await context.close();

    // ── Teléfono, con el dedo ─────────────────────────────────────────────
    console.log('\n== Teléfono 430×900 (dedo, DPR 3) ==');
    ({ context, page, errores, cdn } = await abrir(browser, { width: 430, height: 900 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 3 }));
    await abrirFirma(page);
    const b2 = await page.locator('#sig-capture-canvas').boundingBox();
    ok('En el teléfono el lienzo cabe en la pantalla', b2 && b2.x >= 0 && b2.x + b2.width <= 430, JSON.stringify(b2));
    ok('Backing store × DPR (nítido)', await page.evaluate(() => document.getElementById('sig-capture-canvas').width) === Math.round(b2.width) * 3);
    const cdp = await context.newCDPSession(page);
    const T = (fx, fy) => ({ x: b2.x + b2.width * fx, y: b2.y + b2.height * fy });
    const scrollAntes = await page.evaluate(() => window.scrollY);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [T(0.1, 0.6)] });
    for (let i = 1; i <= 20; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [T(0.1 + 0.8 * i / 20, 0.6 - 0.3 * Math.sin(i / 3))] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
    e = await estado(page);
    ok('Con el dedo también firma', e.vacio === false && e.firmado, JSON.stringify(e));
    ok('Firmar no desplaza la página', await page.evaluate(() => window.scrollY) === scrollAntes);
    // El trazo cae donde está el dedo: el primer punto ≈ 10 % del ancho.
    const p0 = await page.evaluate(() => _sigPadInstance.strokes[0][0]);
    ok('El trazo empieza donde tocó el dedo', p0 && Math.abs(p0.x - b2.width * 0.1) < 3 && Math.abs(p0.y - 180 * 0.6) < 3, JSON.stringify(p0));
    await page.click('.sig-capture-overlay button:has-text("Firmar y Continuar")');
    f = await page.evaluate(() => window.__firma);
    a = f ? await analizar(page, f.dataUrl) : null;
    ok('En el teléfono la imagen sigue siendo de tamaño lógico', a && a.w === Math.round(b2.width) && a.h === 180 && a.oscuros > 100, JSON.stringify(a));
    ok('Sin errores de página', errores.length === 0, errores.join(' | '));
    await context.close();

    await browser.close();
    console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo bien.');
    process.exitCode = fallas ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
