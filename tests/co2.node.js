// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas del CO₂ del CoP — Apéndice I y confirmación UN R154 §3.3.1   ║
// ╚══════════════════════════════════════════════════════════════════════╝
// [2.27.3] El caso de referencia es la familia CL4 5DR 48V del laboratorio
// (3 vehículos, FCF 1.0618, Evolution Factor 0.955): el Apéndice I acepta y
// R154 sigue en muestreo. Eso NO es una contradicción y no se pinta en rojo.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => ({ style: {} }) },
    safeParse: (k, d) => d, showToast: noop, auditLog: noop, escapeHtml: s => String(s), CASCADE_TOOLTIPS: {},
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'cop_validator.js'), 'utf8'), ctx, { filename: 'cop_validator.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-4);

const FAMILIA = [
    { vin: '3KPFX51B7TE431949', measured: 126.4, target: 132.0 },
    { vin: '3KPFX51BXTE433243', measured: 130.5, target: 131.0 },
    { vin: '3KPFX51B5TE433246', measured: 125.9, target: 131.0 }
];

console.log('\n== copCo2CalcStats: la familia del laboratorio ==');
const st = ctx.copCo2CalcStats(FAMILIA, 1.0618, 0.955);
ok('n = 3', st.n === 3);
ok('X̄ = 0.9852', near(st.mean, 0.9852), st.mean);
ok('VAR = 0.000469 (muestral, n−1)', near(st.var, 0.000469, 2e-6), st.var);
ok('s = 0.0217', near(st.s, 0.0217), st.s);
ok('Apéndice I: A − VAR = 1.0095 → CONCORDANTE', st.appendixI.decision === 'PASS' && near(st.appendixI.passBound, 1.0095));
ok('R154 n=3: acepta con X̄ ≤ A − 2.124·s = 0.9640', near(st.r154.passBound, 0.9640));
ok('R154 n=3: rechaza con X̄ > A + 1.248·s = 1.0370', near(st.r154.failBound, 1.0370));
ok('R154: EN MUESTREO', st.r154.decision === 'CONTINUE');
ok('el veredicto de nivel superior es el del Apéndice I', st.decision === 'PASS');

console.log('\n== copCo2Agreement ==');
const mk = (a, r) => ({ appendixI: { decision: a }, r154: { decision: r } });
ok('mismo veredicto → coinciden', ctx.copCo2Agreement(mk('PASS', 'PASS')) === 'coinciden');
ok('la familia del laboratorio → r154-pide-mas', ctx.copCo2Agreement(st) === 'r154-pide-mas');
ok('Apéndice en muestreo, R154 decidió → apendice-pide-mas', ctx.copCo2Agreement(mk('CONTINUE', 'PASS')) === 'apendice-pide-mas');
ok('PASS contra FAIL → opuestas', ctx.copCo2Agreement(mk('PASS', 'FAIL')) === 'opuestas' && ctx.copCo2Agreement(mk('FAIL', 'PASS')) === 'opuestas');
ok('sin datos → null', ctx.copCo2Agreement(null) === null && ctx.copCo2Agreement({ decision: 'SIN DATOS' }) === null);

console.log('\n== El mensaje ==');
const html = ctx.copCo2ConclusionHTML(st);
ok('ya no dice "NO coinciden, revisar antes de aceptar"', !/NO coinciden/.test(html) && !/revisar antes de aceptar/i.test(html), html);
ok('no se pinta en rojo', !/danger-text/.test(html));
ok('dice lo que pide R154 para aceptar (0.9640)', /0\.9640/.test(html));
ok('dice la dispersión con la que aceptaría (s ≤ 0.0117)', /s ≤ 0\.0117/.test(html), html);
ok('aclara que no contradice al Apéndice I', /No contradice al Apéndice I/.test(html));
const opp = Object.assign({}, st, { r154: Object.assign({}, st.r154, { decision: 'FAIL' }) });
ok('veredictos opuestos SÍ van en rojo con "revisar"', /danger-text/.test(ctx.copCo2ConclusionHTML(opp)) && /OPUESTOS/.test(ctx.copCo2ConclusionHTML(opp)));
const same = Object.assign({}, st, { r154: Object.assign({}, st.r154, { decision: 'PASS' }) });
ok('si coinciden, solo lo confirma', /Confirma UN R154/.test(ctx.copCo2ConclusionHTML(same)));
const frozen = JSON.parse(JSON.stringify(st)); delete frozen.s; delete frozen.x;
ok('un juicio congelado sin s no truena', (() => { try { return /todavía no decide/.test(ctx.copCo2ConclusionHTML(frozen)); } catch (e) { return false; } })());

console.log('\n== Imposibles por construcción (por eso "opuestas" es raro) ==');
{
    // Apéndice I PASS exige X̄ < A − VAR < A, y R154 FAIL exige X̄ > A + (tF1−tF2)·s ≥ A.
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    let hallado = false;
    for (let i = 0; i < 2000 && !hallado; i++) {
        const rows = [0, 1, 2, 3].map(() => ({ measured: 100 + rnd() * 12, target: 105 }));
        const r = ctx.copCo2CalcStats(rows, 1, 1);
        if (r.appendixI.decision === 'PASS' && r.r154.decision === 'FAIL') hallado = true;
    }
    ok('Apéndice I CONCORDANTE con R154 NO CONCORDANTE no ocurre', !hallado);
}

console.log('\n== Medidor ==');
ok('la banda sin decidir se rotula con 4 decimales (1.0095 ≠ 1.0100)', /1\.0095 — sin decidir — 1\.0100/.test(ctx._copCo2GaugeHTML(st)));

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
