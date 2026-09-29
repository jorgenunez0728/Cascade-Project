// Presupuesto de arranque (2.17.0). El bundle de PRODUCCIÓN en un teléfono 427×840 con la
// CPU a ¼ (Emulation.setCPUThrottlingRate 4) y un laboratorio realista en localStorage:
// 60 vehículos (45 archivados con firmas), producción de todo el catálogo, 500 pruebas,
// 20 semanas y 2 000 eventos de auditoría (~1.4 MB).
//
// Medido en 2.16.0: HOY usable a los 6.4 s. En 2.17.0: ~1.8 s. El presupuesto solo puede
// BAJAR: si una ronda lo rompe, se arregla la ronda, no se sube el número.
//
// También fija lo que la ronda cambió: Datos arma Alpine hasta la primera visita, así que
// esa primera visita tiene su propio presupuesto y tiene que MOSTRAR su contenido.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(__dirname, '..');
const BUNDLE = path.join(REPO, 'kia-emlab-unified.html');

const PRESUPUESTO_HOY_MS = 2500;       // bienvenida → HOY usable (etapa 'lista'), mediana de 3
// Primera entrada a Datos → Sistema con su contenido. Medido en 2.17.0: 1.8–2.1 s. Es el
// costo de Alpine que ANTES se pagaba en cada arranque; ahora una vez por sesión y solo
// quien abre Datos. Bajarlo más exige armar cada pestaña de Datos por separado (ronda propia).
const PRESUPUESTO_DATOS_MS = 2500;
const RUNS = 3;

const fallos = [];
function chk(nombre, cond, detalle) {
    if (cond) { console.log('  ok  ' + nombre); return; }
    fallos.push(nombre + (detalle ? ' — ' + detalle : ''));
    console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}

const SEED = () => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId: 'm1', operatorName: 'Mara Manager', expiresAt: new Date(Date.now() + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({ operators: [{ id: 'm1', name: 'Mara Manager', role: 'Assistant Manager / Manager', active: true }, { id: 't1', name: 'Beto Técnico', role: 'Técnico', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

async function sembrar(page) {
    await page.evaluate(() => {
        const cfgs = allConfigurations;
        const sig = n => 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(Math.ceil(n / 11)).slice(0, n);
        const st = ['registered', 'in-progress', 'ready-release', 'pending-approval', 'archived'];
        const now = Date.now();
        db.vehicles = [];
        for (let i = 0; i < 60; i++) {
            const c = cfgs[i % cfgs.length];
            const s = i < 45 ? 'archived' : st[i % 5];
            const t0 = new Date(now - (60 - i) * 86400e3).toISOString();
            db.vehicles.push({ id: 'v' + i + '_perf', vin: '3KPFT51B7TE4' + String(10000 + i), status: s, purpose: 'COP-Emisiones',
                configCode: c.codigo_config_text, config: Object.assign({}, c), registeredAt: t0, archivedAt: s === 'archived' ? t0 : undefined,
                timeline: Array.from({ length: 8 }, (_, k) => ({ timestamp: t0, action: 'Paso ' + k, user: 'Beto' })),
                testData: { odometer: 1000 + i, preconditioning: { datetime: t0, tankCapacityL: 50 }, testDatetime: t0,
                    gasResults: { liberador: { values: { CO: 0.2, NOx: 0.01, THC: 0.03 }, capturedBy: 'Ana', capturedAt: t0 },
                                  aprobador: { values: { CO: 0.2, NOx: 0.01, THC: 0.03 } } },
                    signatures: s === 'archived' ? { releaser: { signerName: 'Ana', dataUrl: sig(8000) }, approver: { signerName: 'Mara', dataUrl: sig(8000) } } : {} } });
        }
        saveDB();
        const months = ['Jul-26', 'Aug-26', 'Sep-26', 'Oct-26', 'Nov-26', 'Dec-26'];
        tpState.months = months;
        tpState.planData = cfgs.map((c, i) => ({ desc: c.codigo_config_text, mod: c.Modelo, rgn: c.REGION, reg: c['EMISSION REGULATION'],
            eng: c['ENGINE CAPACITY'], tx: c.TRANSMISSION, my: c['MODEL YEAR (VIN)'], ep: c['ENVIRONMENT PACKAGE'], engpkg: c['ENGINE PACKAGE'],
            body: c['BODY TYPE'], drv: c['DRIVE TYPE'], vols: months.map((m, k) => (i * 37 + k * 11) % 900), total: 2000 + i * 13 }));
        tpState.testedList = Array.from({ length: 500 }, (_, i) => ({ configText: cfgs[i % cfgs.length].codigo_config_text,
            date: new Date(now - i * 3600e3 * 7).toISOString().slice(0, 10), vin: 'VIN' + i, source: 'release' }));
        tpState.weeklyPlans = Array.from({ length: 20 }, (_, w) => {
            const d = new Date(now - (10 - w) * 7 * 86400e3); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
            return { weekDate: d.toISOString().slice(0, 10), created: d.toISOString(), accepted: w < 12,
                items: Array.from({ length: 8 }, (_, k) => ({ uid: 'u' + w + '_' + k, desc: cfgs[(w * 8 + k) % cfgs.length].codigo_config_text,
                    testDay: ['lun', 'mar', 'mie', 'jue', 'vie'][k % 5], completed: w < 10 })) };
        });
        tpSave();
        // Con la forma real de auditLog (mod, ts, user {name, role}).
        localStorage.setItem('kia_audit_trail', JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ id: 'a' + i, ts: new Date(now - i * 60000).toISOString(),
            user: { name: 'Beto Técnico', role: 'Técnico' }, mod: 'cop15', action: 'edit', entity: { type: 'vehicle', id: 'v' + (i % 60), label: 'VIN ' + i },
            details: 'Cambio de prueba número ' + i }))));
        localStorage.setItem('__seeded', '1');
    });
}

(async () => {
    if (!fs.existsSync(BUNDLE)) { console.error('Falta kia-emlab-unified.html: corre SKIP_PUBLISH=1 ./build.sh'); process.exit(1); }
    const browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 427, height: 840 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(SEED);
    const errores = [];
    const semilla = await ctx.newPage();
    semilla.on('pageerror', e => errores.push(e.message));
    await semilla.goto('file://' + BUNDLE);
    await semilla.waitForTimeout(3000);
    await sembrar(semilla);
    await semilla.close();

    console.log('\n== Arranque en frío (teléfono, CPU ×4, ~1.4 MB de datos) ==');
    const res = [];
    for (let r = 0; r < RUNS; r++) {
        const p = await ctx.newPage();
        p.on('pageerror', e => errores.push(e.message));
        p.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
        const cdp = await ctx.newCDPSession(p);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await p.addInitScript(() => {
            window.__lista = 0;
            const iv = setInterval(() => { try { if (typeof bootStageNow === 'function' && bootStageNow() === 'lista') { window.__lista = performance.now(); clearInterval(iv); } } catch (e) {} }, 5);
        });
        await p.goto('file://' + BUNDLE);
        await p.waitForFunction(() => window.__lista > 0, null, { timeout: 60000 });
        await p.waitForTimeout(800);
        const m = await p.evaluate(() => ({ lista: Math.round(window.__lista), marks: window._bootMarks || [],
            alpineDiferido: document.getElementById('pn-alpine-root').hasAttribute('x-ignore') }));
        console.log('  run ' + r + ': HOY usable a los ' + m.lista + ' ms · ' + m.marks.map(x => x[0] + ' ' + x[1]).join(' | '));
        res.push(m);
        if (r === RUNS - 1) {
            // Primera visita a Datos → Sistema: Alpine se arma ahora y tiene que MOSTRAR la tarjeta.
            const d = await p.evaluate(async () => {
                const t0 = performance.now();
                switchPlatform('panel'); pnSwitchTab('pn-system');
                const ok = () => { const el = document.querySelector('#platform-panel [x-show="activeTab === \'pn-system\'"]');
                    return el && el.offsetParent !== null && /Densidad de la interfaz/.test(el.innerText); };
                while (!ok() && performance.now() - t0 < 10000) await new Promise(r => setTimeout(r, 10));
                return { ms: Math.round(performance.now() - t0), ok: ok(), armado: !document.getElementById('pn-alpine-root').hasAttribute('x-ignore') };
            });
            console.log('  primera visita a Datos → Sistema: ' + d.ms + ' ms');
            chk('Datos arma Alpine al entrar y muestra su contenido', d.ok && d.armado, JSON.stringify(d));
            chk('primera visita a Datos ≤ ' + PRESUPUESTO_DATOS_MS + ' ms', d.ms <= PRESUPUESTO_DATOS_MS, d.ms + ' ms');
        }
        await p.close();
    }
    const med = res.map(r => r.lista).sort((a, b) => a - b)[Math.floor(RUNS / 2)];
    console.log('  mediana: ' + med + ' ms');
    chk('HOY usable ≤ ' + PRESUPUESTO_HOY_MS + ' ms (mediana de ' + RUNS + ')', med <= PRESUPUESTO_HOY_MS, med + ' ms');
    chk('Alpine de Datos NO se arma al arrancar', res.every(r => r.alpineDiferido));
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
