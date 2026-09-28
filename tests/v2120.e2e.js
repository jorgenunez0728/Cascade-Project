// Verificación en navegador de 2.12.0 — El error va en el campo, no en un toast.
// A 427×840 (el teléfono de los reportes):
//  - Alta: un VIN corto marca el campo (aria-invalid + mensaje ligado por
//    aria-describedby), lo enfoca, y el error se va al corregirlo. Un propósito sin
//    elegir marca las fichas.
//  - Operación: el "faltan N" de una sección es un botón que lleva al primer faltante.
//  - Liberación: la lista de faltantes del PDF lleva, tocando, al campo en Operación.
//  - Plan: "abrir vehículo" ya muestra Operación (buscaba una pestaña que no existe).
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
    const ahora = Date.now();
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'ana', operatorName: 'Ana Manager', expiresAt: new Date(ahora + 11 * 3600e3).toISOString() }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Manager', role: 'Assistant Manager / Manager', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await (await browser.newContext({ viewport: { width: 427, height: 840 }, hasTouch: true })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('dialog', d => { errores.push('dialog nativo: ' + d.message()); d.dismiss(); });
    await page.addInitScript(SEED);
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForTimeout(2500);

    console.log('\n== Alta: el error va en el campo ==');
    await page.evaluate(() => { dashGo('cop15', 'alta'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.getElementById('vin').value = 'KNA123'; document.getElementById('btnRegister').click(); });
    await page.waitForTimeout(700);
    const vin = await page.evaluate(() => {
        const el = document.getElementById('vin');
        const errId = (el.getAttribute('aria-describedby') || '').split(' ').find(x => /-err$/.test(x));
        const box = errId && document.getElementById(errId);
        return { inv: el.getAttribute('aria-invalid'), msg: box ? box.textContent : '', role: box ? box.getAttribute('role') : '',
                 focus: document.activeElement && document.activeElement.id,
                 toasts: [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent).join(' | ') };
    });
    chk('el VIN queda marcado (aria-invalid)', vin.inv === 'true', JSON.stringify(vin));
    chk('con su mensaje debajo, ligado por aria-describedby y anunciado', /17 caracteres/.test(vin.msg) && /Tiene 6/.test(vin.msg) && vin.role === 'alert', vin.msg);
    chk('y el foco va al campo', vin.focus === 'vin', vin.focus);
    chk('ya no es un toast', !/17 caracteres/.test(vin.toasts), vin.toasts);
    await page.fill('#vin', 'KNAB3512AMT000001');
    const limpio = await page.evaluate(() => ({ inv: document.getElementById('vin').getAttribute('aria-invalid'), box: !!document.getElementById('vin-err') }));
    chk('al corregir, el error se va solo', limpio.inv === null && !limpio.box, JSON.stringify(limpio));

    const prop = await page.evaluate(async () => {
        const sel = document.getElementById('vehiclePurpose');
        sel.value = ''; sel.dispatchEvent(new Event('change'));
        document.getElementById('btnRegister').click();
        await new Promise(r => setTimeout(r, 600));
        const chips = sel.nextElementSibling;
        return { inv: sel.getAttribute('aria-invalid'), chips: chips && chips.classList.contains('ui-chips'),
                 border: chips ? getComputedStyle(chips).borderColor : '', focusInChips: !!(chips && chips.contains(document.activeElement)),
                 msg: (document.getElementById('vehiclePurpose-err') || {}).textContent || '' };
    });
    chk('un propósito sin elegir marca las fichas y enfoca la primera', prop.inv === 'true' && prop.chips && prop.focusInChips && /para qué/.test(prop.msg), JSON.stringify(prop));

    console.log('\n== Operación: "faltan N" lleva al campo ==');
    const vid = await page.evaluate(() => {
        const c = allConfigurations.find(x => x['EMISSION REGULATION'] === 'EURO-5') || allConfigurations[0];
        const id = nextVehicleId();
        db.vehicles.push({ id, vin: '3KPFT51B7TE400777', status: 'in-progress', purpose: 'COP-Emisiones', configCode: c.codigo_config_text,
            config: Object.assign({}, c), registeredAt: new Date().toISOString(), timeline: [], testData: {} });
        saveDB(); refreshAllLists();
        return id;
    });
    await page.evaluate((id) => cascadeOpenInOperation(id), vid);
    await page.waitForTimeout(900);
    const sec = await page.evaluate(async () => {
        const btn = document.querySelector('#acc-precond summary .op-sum-go') || document.querySelector('summary .op-sum-go');
        if (!btn) return { btn: false };
        const acc = btn.closest('details');
        acc.open = false;
        btn.click();
        await new Promise(r => setTimeout(r, 900));
        const a = document.activeElement;
        const chipsOf = a && a.closest && a.closest('.ui-chips');
        const field = chipsOf ? chipsOf.previousElementSibling : a;
        return { btn: true, text: btn.textContent, open: acc.open, focus: field && field.id,
                 inAcc: acc.contains(document.activeElement), notTheButton: a !== btn };
    });
    chk('el encabezado dice "faltan N" como botón', sec.btn && /^faltan \d+$/.test(sec.text), JSON.stringify(sec));
    chk('tocarlo abre la sección y enfoca el primer faltante', sec.open && sec.inAcc && sec.notTheButton && !!sec.focus, JSON.stringify(sec));

    console.log('\n== Liberación: los faltantes del PDF llevan al campo ==');
    const lib = await page.evaluate(async (id) => {
        const v = db.vehicles.find(x => x.id === id);
        v.status = 'ready-release'; saveDB(); refreshAllLists();
        dashGo('cop15', 'liberacion');
        await new Promise(r => setTimeout(r, 500));
        const s = document.getElementById('releaseVehSelect');
        s.value = String(id); loadRelease();
        await new Promise(r => setTimeout(r, 300));
        activeVehicleId = id;
        submitToApproval();
        await new Promise(r => setTimeout(r, 400));
        const modal = document.getElementById('globalModal');
        const link = modal && modal.querySelector('button.miss-link');
        const label = link ? link.textContent : '';
        if (link) link.click();
        await new Promise(r => setTimeout(r, 1300));
        const tab = document.querySelector('#platform-cop15 .tab.active');
        const a = document.activeElement;
        const chipsOf = a && a.closest && a.closest('.ui-chips');
        const field = chipsOf ? chipsOf.previousElementSibling : a;
        return { hay: !!link, label, tab: tab && tab.getAttribute('data-tab'), focus: field && field.id,
                 sel: document.getElementById('activeVehSelect').value };
    }, vid);
    chk('la lista trae botones por campo', lib.hay, JSON.stringify(lib));
    chk('tocar uno abre Operación con ese vehículo', lib.tab === 'seguimiento' && lib.sel === String(vid), JSON.stringify(lib));
    chk('y enfoca el campo', !!lib.focus && lib.focus !== 'activeVehSelect', lib.focus);

    console.log('\n== Plan → abrir vehículo muestra Operación ==');
    const plan = await page.evaluate(async (id) => {
        dashGo('cop15', 'alta');
        await new Promise(r => setTimeout(r, 400));
        tpOpenVehicleFromPlan(id);
        await new Promise(r => setTimeout(r, 900));
        const tab = document.querySelector('#platform-cop15 .tab.active');
        return { tab: tab && tab.getAttribute('data-tab'), sel: document.getElementById('activeVehSelect').value,
                 panel: document.getElementById('panel-seguimiento').classList.contains('active') };
    }, vid);
    chk('llega a Operación con el vehículo cargado', plan.tab === 'seguimiento' && plan.panel && plan.sel === String(vid), JSON.stringify(plan));

    console.log('\n== Sin errores ==');
    chk('ningún error de JavaScript ni diálogo nativo', errores.length === 0, errores.join(' | '));
    await browser.close();
    console.log('\n' + (fallos.length ? fallos.length + ' FALLAS' : 'todo bien'));
    process.exitCode = fallos.length ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
