// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas de cop15.js — el flujo diario del laboratorio               ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// `cop15.js` son 7.700 lineas con el doble ciego liberador/aprobador, el PDF
// COP15 (la evidencia regulatoria) y la cascada — y hasta v23.2 tenia CERO
// pruebas, contra las 45 de testplan.js. Era ademas el unico modulo grande que
// no entraba al arnes `vm`, porque lee `db`, que es `let db` en app.js.
//
// Resulta que si entra: basta con declarar los stubs que toca al parsear. Este
// archivo es ese arnes.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
function _el() {
    const e = {
        textContent: '', value: '', innerHTML: '', style: {}, dataset: {}, isConnected: false,
        classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
        setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
        appendChild: noop, removeChild: noop, remove: noop, insertAdjacentHTML: noop,
        addEventListener: noop, removeEventListener: noop, focus: noop, click: noop,
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
        closest: () => null, contains: () => false, children: [], parentElement: null
    };
    e.querySelector = () => e;
    e.querySelectorAll = () => [];
    return e;
}

const store = {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error,
    isNaN, parseInt, parseFloat, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    },
    document: {
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        createElement: () => _el(), addEventListener: noop, body: _el(), documentElement: _el()
    },
    navigator: { userAgent: 'node' },
    // Dependencias que cop15.js toca al parsear (viven en app.js).
    debounce: f => f, autoSaveInit: noop, tokenColor: () => '#000',
    showToast: noop, showModal: noop, showConfirm: noop, saveDB: () => true,
    auditLog: noop, escapeHtml: s => String(s), emitEvent: noop,
    CASCADE_TOOLTIPS: {}, allConfigurations: [],
    // Vive en app.js; cop15 la usa dentro de validatePdfCompleteness.
    isEmissionsPurpose: p => /emisiones/i.test(String(p || '')),
    getRegulationProfile: () => null, localDateStr: d => new Date(d || Date.now()).toISOString().slice(0, 10),
    db: { vehicles: [], lastId: 0 }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'cop15.js'), 'utf8'),
                ctx, { filename: 'cop15.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

// ── _libNormalizeVal: cifras significativas, no decimales fijos ────────────
console.log('\n== _libNormalizeVal ==');
{
    const n = ctx._libNormalizeVal;
    ok('vacio, null y undefined son null', n('') === null && n(null) === null && n(undefined) === null);
    ok('lo que no es numero es null', n('abc') === null);
    ok('acepta la coma decimal (teclado es-MX)', n('0,0013') === 0.0013);
    ok('el cero se conserva', n(0) === 0 && n('0') === 0);

    // El defecto de v18.2: redondear a 3 DECIMALES hacia 0.001 daba por
    // coincidentes 0.0013 y 0.0014 en el doble ciego. Los gases viven en 1e-3 g/km.
    ok('0.0013 y 0.0014 NO colapsan al mismo valor', n('0.0013') !== n('0.0014'),
        n('0.0013') + ' vs ' + n('0.0014'));
    ok('conserva magnitudes de 1e-3', n('0.0013') === 0.0013);
}

// ── _libValuesMatch: la comparacion del doble ciego ────────────────────────
console.log('\n== _libValuesMatch: doble ciego ==');
{
    const m = ctx._libValuesMatch;
    ok('valores identicos coinciden', m('0.0130', '0.013') === true);
    // A 3 cifras significativas 0.013049 -> 0.0130 y 0.013051 -> 0.0131: SI difieren.
    // La tolerancia esta en la 4a cifra, no en la 3a.
    ok('coincide a 3 cifras significativas', m('0.0130491', '0.0130499') === true,
        'n=' + ctx._libSigFig(ctx._libNormalizeVal('0.0130491'), 3) + ' vs ' + ctx._libSigFig(ctx._libNormalizeVal('0.0130499'), 3));
    ok('una diferencia en la 3a cifra NO coincide', m('0.013049', '0.013051') === false);
    ok('una diferencia real NO coincide', m('0.0013', '0.0014') === false);
    ok('con la coma decimal tambien', m('0,013', '0.013') === true);
    ok('dos vacios coinciden', m('', '') === true);
    ok('vacio contra un numero NO coincide', m('', '0.013') === false);
}

// ── _libVerifyApproverMatch: el candado, ya en la capa de datos ────────────
console.log('\n== _libVerifyApproverMatch: el candado de aprobacion ==');
{
    const v = ctx._libVerifyApproverMatch;
    const perfil = { gases: [ { field: 'CO', label: 'CO' }, { field: 'NOx', label: 'NOx' } ] };

    ok('coinciden los dos gases -> ok',
        v(perfil, { CO: '0.5', NOx: '0.013' }, { CO: '0.5', NOx: '0.013' }).ok === true);

    const dif = v(perfil, { CO: '0.5', NOx: '0.014' }, { CO: '0.5', NOx: '0.013' });
    ok('un gas distinto -> NO ok', dif.ok === false);
    ok('dice CUAL gas no coincide', dif.mismatches.join() === 'NOx', JSON.stringify(dif));

    const falta = v(perfil, { CO: '0.5', NOx: null }, { CO: '0.5', NOx: '0.013' });
    ok('un gas sin capturar -> NO ok', falta.ok === false);
    ok('lo reporta como FALTANTE, no como desacuerdo',
        falta.missing.join() === 'NOx' && falta.mismatches.length === 0, JSON.stringify(falta));

    ok('un gas que el liberador no capturo no cuenta como desacuerdo',
        v(perfil, { CO: '0.5', NOx: '0.013' }, { CO: '0.5' }).ok === true);

    ok('sin perfil de limites no hay nada que verificar',
        v(null, {}, {}).sinPerfil === true && v(null, {}, {}).ok === true);

    // Es PURA: mismos argumentos, mismo resultado, sin DOM de por medio.
    const a = v(perfil, { CO: '1', NOx: '2' }, { CO: '1', NOx: '9' });
    const b = v(perfil, { CO: '1', NOx: '2' }, { CO: '1', NOx: '9' });
    ok('es pura (mismos argumentos -> mismo resultado)', JSON.stringify(a) === JSON.stringify(b));
}

// ── validatePdfCompleteness: la evidencia regulatoria ──────────────────────
console.log('\n== validatePdfCompleteness ==');
{
    ok('PDF_REQUIRED_FIELDS existe y tiene campos', Array.isArray(ctx.PDF_REQUIRED_FIELDS) && ctx.PDF_REQUIRED_FIELDS.length > 0,
        'n=' + (ctx.PDF_REQUIRED_FIELDS || []).length);
    ok('cada campo declara path y label',
        (ctx.PDF_REQUIRED_FIELDS || []).every(f => f && f.path && f.label));

    const vacio = ctx.validatePdfCompleteness({ vin: 'KNA0001', purpose: 'COP-Emisiones', testData: {} });
    ok('un vehiculo vacio NO esta completo', vacio && vacio.ok === false, JSON.stringify(vacio && vacio.ok));
    ok('y enumera lo que falta', vacio && Array.isArray(vacio.missing) && vacio.missing.length > 0);
    ok('no revienta con un vehiculo nulo', (() => {
        try { return ctx.validatePdfCompleteness(null).ok === false; } catch (e) { return false; }
    })());
    ok('cada faltante dice su label y su seccion',
        vacio.missing.every(m => m && m.label && m.section), JSON.stringify(vacio.missing.slice(0, 3)));
}

// ── _libValueImplausible: avisa, nunca bloquea ─────────────────────────────
console.log('\n== _libValueImplausible ==');
{
    const imp = ctx._libValueImplausible;
    if (typeof imp !== 'function') { ok('_libValueImplausible existe', false); }
    else {
        ok('un CO normal es plausible', imp('CO', 0.5) === false);
        ok('un CO absurdo se marca', imp('CO', 9999) === true);
        ok('un gas desconocido no se marca', imp('XYZ', 12345) === false);
    }
}

// ── _pdfSafe: el PDF COP15-F05 solo sabe WinAnsi ─────────────────────────
// "≤ 1  PASA" salía como `"d 1 P A S A` y "CO₂" como "C O ,": un carácter fuera
// de WinAnsi hace que jsPDF espacie la cadena entera.
console.log('\n== _pdfSafe ==');
{
    const f = ctx._pdfSafe;
    ok('≤ se vuelve <=', f('≤ 1  PASA') === '<= 1  PASA');
    ok('subíndices a dígitos (CO₂, NOₓ)', f('CO₂') === 'CO2' && f('NOₓ') === 'NOx');
    ok('acentos y ñ se conservan (Latin-1)', f('Liberación Núñez') === 'Liberación Núñez');
    ok('guion largo, ³ y · se conservan (sí están en WinAnsi)', f('— m³/min · x') === '— m³/min · x');
    ok('lo que no tiene equivalente sale como ? visible, no desaparece', f('ok 🚗') === 'ok ?');
    ok('null/undefined dan cadena vacía', f(null) === '' && f(undefined) === '');
}

// ── releaseChecklistRows: checklist de liberación del F05 ─────────────────
console.log('\n== releaseChecklistRows ==');
{
    const rows = ctx.releaseChecklistRows;
    const veh = (region, cl) => ({ purpose: 'COP-Emisiones', config: { REGION: region }, testData: cl ? { releaseChecklist: cl } : {} });
    const byKey = (st, k) => st.objects.concat(st.docs).find(r => r.key === k);

    const mx = rows(veh('MEXICO'));
    ok('Solo Europa fuera de Europa = No aplica automático',
        byKey(mx, 'obfcm').value === 'na' && byKey(mx, 'obfcm').auto && byKey(mx, 'coast').value === 'na');
    ok('Solo Cert. MX en México NO se autollena (región MX no implica certificación)',
        byKey(mx, 'f02').value === '' && !byKey(mx, 'f02').auto);

    const eu = rows(veh('EUROPE'));
    ok('Solo Cert. MX fuera de México = No aplica automático', byKey(eu, 'f03').value === 'na' && byKey(eu, 'f03').auto);
    ok('Solo Europa en Europa se pide al liberador', byKey(eu, 'obfcm').value === '' && !byKey(eu, 'obfcm').auto);
    ok('los objetos NUNCA se autollenan como retirados', eu.objects.every(r => r.value === '' && !r.auto));
    ok('Hoja F05 completa la decide el validador, no el técnico', byKey(eu, 'f05').auto === true);

    const hecho = rows(veh('EUROPE', { objects: { kds: 'ok', cardaq: 'na' }, docs: { vets: 'ok' } }));
    ok('lo capturado se lee', byKey(hecho, 'kds').value === 'ok' && byKey(hecho, 'cardaq').value === 'na' && byKey(hecho, 'vets').value === 'ok');
    ok('missing lista lo que falta', hecho.missing.some(r => r.key === 'remote') && !hecho.missing.some(r => r.key === 'kds'));

    // F05 "Completa" solo sin NINGÚN pendiente
    const lleno = { purpose: 'COP-Emisiones', status: 'ready-release', config: { REGION: 'EUROPE' }, testData: {} };
    ctx.PDF_REQUIRED_FIELDS.forEach(f => ctx._histSetPath(lleno, f.path, f.num ? 1 : 'x'));
    lleno.testData.testVerification.fanMode = 'speed_follow';
    const f05SinFirma = byKey(rows(lleno), 'f05');
    ok('F05 con solo firmas/gases pendientes: no dice Completa pero no bloquea el envío',
        f05SinFirma.value === '' && f05SinFirma.blocking === false && !rows(lleno).missing.some(r => r.key === 'f05'));
    const f05Falta = byKey(rows(veh('EUROPE')), 'f05');
    ok('F05 con campos de formulario vacíos bloquea', f05Falta.value === '' && f05Falta.blocking === true);
    const _vpc = ctx.validatePdfCompleteness;
    ctx.validatePdfCompleteness = () => ({ ok: true, missing: [] });
    const f05Ok = byKey(rows(lleno), 'f05');
    ctx.validatePdfCompleteness = _vpc;
    ok('F05 sin ningún pendiente = Completa', f05Ok.value === 'ok' && f05Ok.okText === 'Completa');

    // SOC al iniciar prueba: exigido en curso, no en archivados viejos
    const soc = ctx.PDF_REQUIRED_FIELDS.find(f => f.path === 'testData.testVerification.batterySocPct');
    ok('SOC de prueba está en el descriptor de obligatorios', !!soc);
    ok('SOC de prueba se exige a un vehículo en curso', soc.when({ testVerification: {} }, { status: 'ready-release' }) === true);
    ok('un archivado sin el campo no lo exige (no bloquea regenerar su PDF)', soc.when({ testVerification: {} }, { status: 'archived' }) === false);

    const forzado = rows(veh('CANADA', { docs: { obfcm: 'ok' } }));
    ok('una regla automática gana sobre un valor guardado a mano', byKey(forzado, 'obfcm').value === 'na');
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exit(fallaron ? 1 : 0);
