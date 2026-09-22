// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas de homolog.js — inercia (ETW) WLTP desde la ficha ICMS       ║
// ╚══════════════════════════════════════════════════════════════════════╝
// El caso de referencia es una captura real del software del dinamómetro del
// laboratorio: TM 1568, MRO 1465, m_r 1.5 % + 1.5 %, Inertia 1612.7 kg.

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
    const r = f({ tm: 1568, curbWeight: 1390 });
    ok('captura del laboratorio: curb 1390 → MRO 1465 → inercia 1612.7', r && r.mro === 1465 && r.inertia === 1612.7, JSON.stringify(r));
    ok('m_r = 3 % × (MRO + 25) = 44.7 (no 3 % × MRO + 25)', r && r.mr === 44.7, r && r.mr);
    ok('marca que el MRO salió del curb weight', r && r.mroFromCurb === true);
    const m = f({ tm: 1568, mro: 1465, curbWeight: 999 });
    ok('si el ICMS trae MRO, manda ése sobre el curb', m && m.inertia === 1612.7 && m.mroFromCurb === false, JSON.stringify(m));
    const one = f({ tm: 1568, mro: 1465, mrFrontPct: 1.5, mrRearPct: 0 });
    ok('m_r por eje editable (solo delantero 1.5 % → 1590.4)', one && one.inertia === 1590.4 && one.mrPct === 1.5, JSON.stringify(one));
    ok('sin TM → null (no se inventa)', f({ curbWeight: 1390 }) === null);
    ok('sin MRO ni curb → null', f({ tm: 1568 }) === null);
    ok('valores vacíos o texto → null', f({ tm: '', curbWeight: 'x' }) === null);
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exit(fallaron ? 1 : 0);
