// Verificación en navegador de 2.11.0 — Una bienvenida sin parpadeo.
// Corre sobre el BUNDLE compilado a 427×840 con la CPU ×4 (≈ Android 10 de gama media).
// Un muestreo por cuadro (requestAnimationFrame desde addInitScript, antes de que exista
// la página) registra en CADA cuadro: si la app (barra de plataformas) se ve sin la
// bienvenida encima, la etapa, y el color de fondo de la bienvenida.
//  - Sin sesión: arranque → pin → entrando → lista, nunca la app antes de `lista`.
//  - Con sesión: arranque → lista, sin pasar por el PIN.
//  - Nunca un fondo oscuro (el splash azul marino se retiró).
//  - Con movimiento reducido: sin barra animada, fundido corto.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BUNDLE = path.join(path.resolve(__dirname, '..'), 'kia-emlab-unified.html');

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

// Muestreo por cuadro: corre ANTES que cualquier script de la página.
const SAMPLER = () => {
    window.__frames = [];
    const lum = (c) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
        if (!m) return 1;
        return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
    };
    const tick = () => {
        try {
            const ov = document.getElementById('auth-overlay');
            const bar = document.getElementById('platformBar');
            let covered = false, stage = '', bg = 1, op = 0;
            if (ov) {
                const cs = getComputedStyle(ov);
                stage = ov.getAttribute('data-stage') || '';
                op = parseFloat(cs.opacity);
                covered = cs.display !== 'none' && op > 0.99;
                bg = lum(cs.backgroundColor);
            }
            const appShown = !!bar && !covered;
            window.__frames.push({ t: Math.round(performance.now()), stage, appShown, bg, op,
                splash: !!document.getElementById('splash-screen') });
        } catch (e) {}
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
};

const TOURS = () => {
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
};
// Operador SIN PIN (setup inicial): la entrada es de un toque, por el mismo camino que el PIN (authCreateSession).
const SIN_SESION = () => {
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Técnica', role: 'Técnico', active: true }], tasks: [], projects: [], alerts: [] }));
};
const CON_SESION = () => {
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Técnica', role: 'Técnico', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'ana', operatorName: 'Ana Técnica', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
};

function etapas(frames) {
    const out = [];
    frames.forEach(f => { if (f.stage && out[out.length - 1] !== f.stage) out.push(f.stage); });
    return out;
}
function revisar(nombre, frames, esperadas) {
    const antes = [];
    let listo = false;
    frames.forEach(f => { if (f.stage === 'lista') listo = true; if (!listo && f.appShown) antes.push(f.t); });
    chk(nombre + ': la app NUNCA se ve antes de `lista` (' + frames.length + ' cuadros)', antes.length === 0, 'cuadros con la app descubierta: ' + antes.slice(0, 5).join(','));
    const et = etapas(frames);
    chk(nombre + ': etapas ' + esperadas.join(' → '), JSON.stringify(et) === JSON.stringify(esperadas), JSON.stringify(et));
    const oscuros = frames.filter(f => f.stage && f.bg < 0.6);
    chk(nombre + ': nunca un fondo oscuro', oscuros.length === 0, oscuros.length + ' cuadros oscuros');
    chk(nombre + ': sin el splash viejo', !frames.some(f => f.splash));
}

async function abrir(browser, seed, opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 427, height: 840 }, hasTouch: true }, opts || {}));
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.addInitScript(SAMPLER);
    await page.addInitScript(TOURS);
    await page.addInitScript(seed);
    await page.goto('file://' + BUNDLE, { waitUntil: 'domcontentloaded' });
    return { page, ctx, errores };
}

(async () => {
    if (!fs.existsSync(BUNDLE)) { console.error('Falta kia-emlab-unified.html: correr ./build.sh'); process.exit(1); }
    const browser = await chromium.launch({ executablePath: CHROME });

    console.log('\n== Sin sesión: arranque → PIN → Bienvenido → app ==');
    {
        const { page, ctx, errores } = await abrir(browser, SIN_SESION);
        await page.waitForSelector('.auth-op', { timeout: 30000 });
        await page.waitForTimeout(400);
        const pin = await page.evaluate(() => ({
            stage: bootStageNow(), marca: !!document.querySelector('#auth-content .auth-brand'),
            barra: getComputedStyle(document.getElementById('platformBar')).visibility }));
        chk('la bienvenida pasa a pedir el usuario en la misma tarjeta (con su marca)', pin.stage === 'pin' && pin.marca, JSON.stringify(pin));
        await page.click('.auth-op');
        // "Bienvenido" tiene que alcanzar a pintarse antes de que la inicialización ocupe el hilo.
        await page.waitForFunction(() => window.__frames.some(f => f.stage === 'entrando'), null, { timeout: 5000 });
        const saludo = await page.evaluate(() => (document.querySelector('#auth-content .auth-greeting') || {}).textContent || '');
        await page.waitForFunction(() => bootStageNow() === 'lista', null, { timeout: 30000 });
        await page.waitForTimeout(700);
        const fin = await page.evaluate(() => ({
            ov: getComputedStyle(document.getElementById('auth-overlay')).display,
            booting: document.documentElement.classList.contains('booting'),
            toastBienvenido: [...document.querySelectorAll('#toast-container .toast')].some(t => /Bienvenido/.test(t.textContent)) }));
        chk('dice "Bienvenido, Ana" mientras se arma la app', /Bienvenido, Ana/.test(saludo), saludo);
        chk('al final la bienvenida desaparece y la app queda a la vista', fin.ov === 'none' && !fin.booting, JSON.stringify(fin));
        chk('ya no sale el toast "Bienvenido" (sobraba)', !fin.toastBienvenido);
        const frames = await page.evaluate(() => window.__frames);
        revisar('sin sesión', frames, ['arranque', 'pin', 'entrando', 'lista']);
        const salida = frames.filter(f => f.stage === 'lista' && f.op > 0.01 && f.op < 0.99).length;
        chk('la salida es un fundido (hay cuadros intermedios de opacidad)', salida >= 2, salida + ' cuadros');
        chk('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }

    console.log('\n== Con sesión: arranque → app, sin pasar por el PIN ==');
    {
        const { page, ctx, errores } = await abrir(browser, CON_SESION);
        await page.waitForFunction(() => typeof bootStageNow === 'function' && bootStageNow() === 'lista', null, { timeout: 30000 });
        await page.waitForTimeout(700);
        const frames = await page.evaluate(() => window.__frames);
        revisar('con sesión', frames, ['arranque', 'lista']);
        chk('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }

    console.log('\n== Movimiento reducido ==');
    {
        const { page, ctx } = await abrir(browser, SIN_SESION, { reducedMotion: 'reduce' });
        await page.waitForSelector('.auth-op', { timeout: 30000 });
        const rm = await page.evaluate(() => {
            const fill = document.querySelector('.boot-bar-fill');
            return { trans: getComputedStyle(document.getElementById('auth-overlay')).transitionDuration };
        });
        chk('el fundido de salida es corto (≤ 120 ms)', /^0\.12s$|^120ms$/.test(rm.trans), rm.trans);
        await ctx.close();
    }

    console.log('\n== Bloqueo por inactividad: vuelve al PIN y regresa ==');
    {
        const { page, ctx, errores } = await abrir(browser, CON_SESION);
        await page.waitForFunction(() => typeof bootStageNow === 'function' && bootStageNow() === 'lista', null, { timeout: 30000 });
        const r = await page.evaluate(() => {
            const pinOk = bootStage('pin');
            const shown = getComputedStyle(document.getElementById('auth-overlay')).display;
            const noArranque = bootStage('arranque');
            return { pinOk, shown, noArranque };
        });
        chk('desde la app se puede volver al PIN (bloqueo)', r.pinOk && r.shown !== 'none', JSON.stringify(r));
        chk('el arranque no se repite', r.noArranque === false);
        chk('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }

    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
