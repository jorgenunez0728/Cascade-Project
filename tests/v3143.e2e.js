// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.14.3 — Conectar un equipo nuevo desde la pantalla de acceso        ║
// ╚══════════════════════════════════════════════════════════════════════╝
// En un equipo que nunca se conectó, "Conectar este dispositivo" abría el diálogo de la nube
// DEBAJO de la bienvenida (z 9999 vs 10000) y el SDK ni siquiera estaba iniciado: no pasaba nada.
// Se sirve la app por http (las reglas de origen piden http/https) y se simula el SDK de Firebase.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(path.join(__dirname, '..'));

let fallas = 0;
const ok = (n, c, d) => { console.log((c ? '  ok  ' : '  FALLA  ') + n + (c || !d ? '' : '  → ' + d)); if (!c) fallas++; };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
});

// SDK falso: solo lo que usa el camino de "conectar". La contraseña buena es "lab-ok".
const FAKE_SDK = `window.firebase = (function(){
  var user = null, apps = [];
  return { apps: apps, initializeApp: function(){ apps.push({}); window.__fbInitialized = true; },
    auth: function(){ return { get currentUser(){ return user; }, onAuthStateChanged: function(){ return function(){}; }, signOut: function(){ user = null; return Promise.resolve(); },
      signInWithEmailAndPassword: function(e, pw){ if (!apps.length) throw new Error('No Firebase App [DEFAULT]');
        return pw === 'lab-ok' ? (user = { isAnonymous:false, providerData:[{providerId:'password'}] }, Promise.resolve()) : Promise.reject({ code: 'auth/invalid-credential' }); } }; },
    firestore: function(){ throw new Error('no se usa en esta prueba'); } };
})();`;

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port + '/';
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'America/Mexico_City', locale: 'es-MX', serviceWorkers: 'block' });
    // La última ruta registrada manda: primero cortar todo lo de fuera, luego el SDK falso.
    await ctx.route(u => !u.href.startsWith(base), r => r.abort());
    await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: /firebase-app-compat/.test(r.request().url()) ? FAKE_SDK : '' }));
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog: ' + d.message()); d.dismiss(); });
    await page.addInitScript(() => {
        localStorage.setItem('kia_tour_done', '1');
        localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    });
    await page.goto(base + 'index.html');
    await page.waitForFunction(() => /todavía no se ha conectado/.test((document.getElementById('auth-content') || {}).textContent || ''), null, { timeout: 20000 });
    // El sync completo (fbInit) se simula: trae a los operadores del laboratorio.
    await page.evaluate(() => {
        window.fbInit = function() {
            setTimeout(function() {
                pnState.operators = [{ id: 'op-a', name: 'Ana Real', role: 'Técnico', active: true }, { id: 'op-b', name: 'Beto Real', role: 'Signatario', active: true }];
                fbSync._pullCompleted = true;
            }, 300);
        };
    });

    await page.locator('button', { hasText: 'Conectar este dispositivo' }).click();
    await page.waitForTimeout(200);
    const vis = await page.evaluate(() => {
        const i = document.getElementById('auth-lab-pw'); if (!i) return { has: false };
        const r = i.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { has: true, onTop: top === i, focus: document.activeElement === i, oldModal: !!(document.getElementById('fbModal') && document.getElementById('fbModal').style.display === 'block') };
    });
    ok('la contraseña se pide dentro de la pantalla de acceso, visible y con el foco', vis.has && vis.onTop && vis.focus && !vis.oldModal, JSON.stringify(vis));

    await page.fill('#auth-lab-pw', 'mala');
    await page.locator('#auth-connect-btn').click();
    await page.waitForTimeout(300);
    const bad = await page.evaluate(() => ({ msg: document.getElementById('auth-connect-msg').textContent, dis: document.getElementById('auth-connect-btn').disabled, init: !!window.__fbInitialized }));
    ok('contraseña equivocada: lo dice y deja reintentar (la app de Firebase ya se inició)', bad.msg === 'Contraseña incorrecta.' && !bad.dis && bad.init, JSON.stringify(bad));

    await page.fill('#auth-lab-pw', 'lab-ok');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Ana Real/.test((document.getElementById('auth-content') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    const after = await page.evaluate(() => (document.getElementById('auth-content') || {}).textContent.replace(/\s+/g, ' '));
    ok('al conectar, la pantalla se rehace sola con los operadores del laboratorio', /Ana Real/.test(after) && /Beto Real/.test(after) && !/todavía no se ha conectado/.test(after), after.slice(0, 200));

    // Si otro camino abre el diálogo viejo con la pantalla de acceso arriba, va al formulario.
    await page.evaluate(() => { if (typeof authShowLogin === 'function') { pnState.operators.forEach(o => { o.provisional = true; }); authShowLogin(); fbShowAuthPrompt(); } });
    const redirect = await page.evaluate(() => ({ inline: !!document.getElementById('auth-lab-pw'), modal: !!(document.getElementById('fbModal') && document.getElementById('fbModal').style.display === 'block') }));
    ok('el diálogo viejo no se abre debajo de la bienvenida', redirect.inline && !redirect.modal, JSON.stringify(redirect));

    ok('sin errores de página', errores.length === 0, errores.join(' | '));
    await browser.close();
    server.close();
    console.log(fallas ? '\n' + fallas + ' fallas' : '\ntodo bien');
    process.exitCode = fallas ? 1 : 0;
})();
