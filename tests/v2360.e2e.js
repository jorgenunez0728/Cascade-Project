// Verificación en navegador de 2.36.0 — solo cuentan las reglas del laboratorio.
// Familia CL4 SULEV 30 con una configuración de EE. UU. (cuenta) y una de Canadá (sin regla),
// más una de Brasil (sin regla): Reglas las agrupa, Familias dice con qué regla cuenta cada
// una, y "Sacar del conteo" / "Que cuente" cambian el REQ y quedan marcados.
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

        const key = await page.evaluate(() => {
            const base = { mod: 'CL4', eng: '2000cc NU-PE', tx: 'CVT', my: '27 MODEL', reg: 'SULEV 30', ep: '0', engpkg: 'ATKINSON', body: '4DR', drv: 'LHD', tire: '0', m: [], paused: false };
            tpState.rules = tpDefaultRules();
            tpState.reqFamilies = {};
            tpState.planData = [
                Object.assign({}, base, { id: 'u', desc: 'E2E-USA', rgn: 'USA', total: 30000, hist: 0 }),
                Object.assign({}, base, { id: 'c', desc: 'E2E-CAN', rgn: 'CANADA', total: 12000, hist: 0, tire: '1' }),
                Object.assign({}, base, { id: 'b', desc: 'E2E-BRA', rgn: 'BRAZIL', reg: 'BRAZIL L8', total: 9000, hist: 0 })
            ];
            tpState.testedList = [];
            tpSave();
            return tpFamilyKeyForCfg(tpState.planData[0]);
        });

        // ── Reglas ──────────────────────────────────────────────────────
        await page.evaluate(() => { switchPlatform('testplan'); tpSwitchTab('tp-rules'); });
        await page.waitForTimeout(700);
        const reglas = await page.evaluate(() => {
            const det = [...document.querySelectorAll('details')].find(d => d.querySelector('summary') && /NO cuentan para el plan/.test(d.querySelector('summary').textContent));
            if (det) det.open = true;
            return { sum: det ? det.querySelector('summary').textContent.trim() : '', txt: det ? det.textContent : '',
                     card: (document.body.innerText.match(/Solo cuenta para el plan lo que tiene regla aquí/) || [''])[0] };
        });
        chk('Reglas explica que solo cuenta lo que tiene regla', !!reglas.card);
        chk('Reglas: 2 configuraciones sin regla no cuentan', /2 configuración\(es\) sin regla/.test(reglas.sum), reglas.sum);
        chk('agrupadas por región y norma, con + Regla', /Canadá|CANADA/.test(reglas.txt) && /BRAZIL L8/.test(reglas.txt) && /\+ Regla/.test(reglas.txt), reglas.txt.slice(0, 200));
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v2360-reglas-' + vp.width + '.png'), fullPage: false });

        // ── Familias ────────────────────────────────────────────────────
        await page.evaluate(() => { tpSwitchTab('tp-families'); });
        await page.waitForTimeout(700);
        const fam = await page.evaluate((k) => {
            const f = tpBuildFamilies().find(x => x.key === k);
            const det = [...document.querySelectorAll('details')].find(d => /CL4/.test(d.querySelector('summary') ? d.querySelector('summary').textContent : '') && /1 sin regla/.test(d.textContent));
            if (det) { det.open = true; det.scrollIntoView(); }
            return { req: f.totalRequired, st: f.reqStatus, chip: !!det, row: det ? (det.textContent.match(/Cuenta: [^·]+/) || [''])[0] : '' };
        }, key);
        chk('familia USA + Canadá: cuenta solo USA (30 000 × 2/15 000 = 4)', fam.req === 4 && fam.st === 'parcial', JSON.stringify(fam));
        chk('la tarjeta dice "1 sin regla" y con qué regla cuenta', fam.chip && /2 prueba\(s\) por cada 15,000/.test(fam.row), fam.row);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v2360-familia-' + vp.width + '.png'), fullPage: false });

        // Sacar del conteo: botón → motivo → aceptar.
        const btn = page.locator('button:visible', { hasText: 'Sacar del conteo' }).first();
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await page.waitForTimeout(300);
        await page.fill('#_ui_prompt', 'No es mercado auditado este año');
        await page.locator('#globalModal button', { hasText: /Aceptar|Guardar|Continuar|OK/ }).last().click();
        await page.waitForTimeout(700);
        const fuera = await page.evaluate((k) => {
            const f = tpBuildFamilies().find(x => x.key === k);
            return { req: f.totalRequired, st: f.reqStatus, mark: tpState.reqFamilies[k], cov: tpGetAnalysis().filter(a => a.required > 0).length,
                     txt: /Fuera del conteo/.test(document.body.innerText) };
        }, key);
        chk('fuera del conteo: REQ 0, estado excluida, motivo guardado', fuera.req === 0 && fuera.st === 'excluida' && fuera.mark && fuera.mark.excluded && /mercado/.test(fuera.mark.reason), JSON.stringify(fuera));
        chk('ninguna configuración exige (ni la de EE. UU.)', fuera.cov === 0, String(fuera.cov));
        chk('la pantalla lo dice', fuera.txt);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v2360-fuera-' + vp.width + '.png'), fullPage: false });

        // Regresa desde Reglas.
        await page.evaluate(() => { tpSwitchTab('tp-rules'); });
        await page.waitForTimeout(600);
        const back = page.locator('button:visible', { hasText: 'Que cuente' }).first();
        chk('Reglas lista la familia fuera del conteo', await back.count() > 0);
        await back.scrollIntoViewIfNeeded();
        await back.click();
        await page.waitForTimeout(600);
        const otra = await page.evaluate((k) => ({ req: tpBuildFamilies().find(x => x.key === k).totalRequired, mark: tpState.reqFamilies[k] }), key);
        chk('↩ Que cuente: vuelve a 4 y queda la marca', otra.req === 4 && otra.mark && otra.mark.excluded === false, JSON.stringify(otra));
        const aud = await page.evaluate(() => (auditGetView ? auditGetView() : []).filter(e => /familia_(fuera_del_conteo|cuenta)/.test(e.action)).length);
        chk('las dos acciones quedan en el historial de cambios', aud >= 2, String(aud));

        chk('sin errores de página', errores.length === 0, errores.join(' | '));
        await ctx.close();
    }
    await browser.close();
    console.log(fallos.length ? '\nv2360: ' + fallos.length + ' falla(s)' : '\nv2360: todo ok');
    process.exitCode = fallos.length ? 1 : 0;
})();
