// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas de homolog.js — inercia (ETW) WLTP desde la ficha ICMS       ║
// ╚══════════════════════════════════════════════════════════════════════╝
// El caso de referencia es una captura real del software del dinamómetro del
// laboratorio: TM 1568 + MR 44.7 = Inertia 1612.7 kg (ambos del ICMS).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const store = {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    setTimeout, clearTimeout,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => ({ style: {} }) },
    safeParse: (k, d) => d, showToast: noop, auditLog: noop, escapeHtml: s => String(s), CASCADE_TOOLTIPS: {},
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'homolog.js'), 'utf8'), ctx, { filename: 'homolog.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

console.log('\n== homoWltpInertia ==');
{
    const f = ctx.homoWltpInertia;
    const r = f({ tm: 1568, mr: 44.7 });
    ok('captura del laboratorio: TM 1568 + MR 44.7 = 1612.7', r && r.inertia === 1612.7, JSON.stringify(r));
    ok('acepta números como texto (así llegan del formulario)', f({ tm: '1568', mr: '44.7' }).inertia === 1612.7);
    ok('redondea a 0.1 kg (sin basura de punto flotante)', f({ tm: 1500.12, mr: 40.04 }).inertia === 1540.2);
    ok('MR = 0 es válido', f({ tm: 1500, mr: 0 }).inertia === 1500);
    ok('sin TM → null (no se inventa)', f({ mr: 44.7 }) === null);
    ok('sin MR → null (la TM sola NO es la inercia)', f({ tm: 1568 }) === null);
    ok('vacíos, texto o negativos → null', f({ tm: '', mr: 'x' }) === null && f({ tm: 1568, mr: -1 }) === null);
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exit(fallaron ? 1 : 0);
