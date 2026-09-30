// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.26.0] Momentos de cierre — las condiciones PURAS y "una vez".       ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const prefs = {};
const appended = [];
const ctx = {
    console: { log: console.log, warn: noop, error: console.error }, Date, JSON, Object, Array, String, Number, Math, RegExp, Error,
    setTimeout: noop, clearTimeout: noop,
    document: { getElementById: () => null, createElement: () => ({ setAttribute: noop, addEventListener: noop }),
                body: { appendChild: el => appended.push(el) } },
    navigator: {}, escapeHtml: s => String(s),
    uiPref: (k, v) => (v === undefined ? prefs[k] : (prefs[k] = v))
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'momentos.js'), 'utf8'), ctx, { filename: 'momentos.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

console.log('\n== momentWeekFacts ==');
const fila = (done, extra) => Object.assign({ done, unplanned: false, declared: false }, extra || {});
const board = rows => ({ accepted: true, planId: 'P1', weekDate: '2026-09-28', rows, kpis: { movidas: 1 } });
ok('con una pendiente no hay momento', ctx.momentWeekFacts(board([fila(true), fila(false)])) === null);
const w = ctx.momentWeekFacts(board([fila(true), fila(true, { declared: true }), fila(true, { unplanned: true })]));
ok('todo el compromiso hecho → semana cumplida', w && w.title === 'Semana cumplida' && w.key === 'semana:P1');
ok('dice cuántas de cuántas (solo las planeadas)', w && w.facts[0] === '2 de 2 pruebas planeadas, hechas', w && w.facts[0]);
ok('declara lo que no estaba en el plan', w && w.facts.some(f => /1 que no estaban en el plan/.test(f)));
ok('declara lo palomeado sin liberación', w && w.facts.some(f => /1 palomeada a mano, sin liberación/.test(f)));
ok('una fila no planeada pendiente no impide el momento', !!ctx.momentWeekFacts(board([fila(true), fila(false, { unplanned: true })])));
ok('solo filas no planeadas no es "semana cumplida"', ctx.momentWeekFacts(board([fila(true, { unplanned: true })])) === null);
ok('una propuesta sin aceptar no se celebra', ctx.momentWeekFacts(Object.assign(board([fila(true)]), { accepted: false })) === null);
ok('sin plan, nada', ctx.momentWeekFacts(null) === null);

console.log('\n== momentCalFacts ==');
const S = (vencidos, vigentes, porVencer, sinRegistro) => ({ requiere: 10, vencidos, vigentes, porVencer, sinRegistro });
ok('de vencidas a cero → al día', !!ctx.momentCalFacts(S(1, 8, 1, 0), S(0, 9, 1, 0), '2026-09-30'));
const c = ctx.momentCalFacts(S(2, 7, 1, 0), S(0, 8, 1, 1), '2026-09-30');
ok('dice vigentes de cuántas y lo que viene', c && c.facts[0] === '9 de 10 instrumentos con calibración vigente' && /1 vence en los próximos 60 días/.test(c.facts[1]), JSON.stringify(c && c.facts));
ok('lo que sigue sin registro se dice', c && c.facts.some(f => /1 sin registro/.test(f)));
ok('si ya estaba al día no es momento', ctx.momentCalFacts(S(0, 9, 1, 0), S(0, 9, 1, 0), 'x') === null);
ok('si sigue habiendo vencidas no es momento', ctx.momentCalFacts(S(3, 7, 0, 0), S(1, 9, 0, 0), 'x') === null);
ok('sin línea base (primer vistazo) no es momento', ctx.momentCalFacts(null, S(0, 9, 1, 0), 'x') === null);

console.log('\n== momentCopFacts ==');
ok('NO CONCORDANTE no es momento', ctx.momentCopFacts({ id: 'j', decision: 'FAIL' }) === null);
const k = ctx.momentCopFacts({ id: 'j1', decision: 'PASS', familyLabel: 'SPORTAGE 1.6T', n: 5 });
ok('CONCORDANTE: familia, n y que queda como evidencia', k && k.key === 'cop:j1' && k.facts[0] === 'SPORTAGE 1.6T' && /5 VINes/.test(k.facts[1]) && /evidencia/.test(k.facts[2]));

console.log('\n== momentShow: una vez ==');
ok('la primera vez se muestra', ctx.momentShow({ key: 'semana:P1', title: 'x', facts: [] }) === true && appended.length === 1);
ok('la segunda no', ctx.momentShow({ key: 'semana:P1', title: 'x', facts: [] }) === false && appended.length === 1);
ok('sin clave no se muestra', ctx.momentShow({ title: 'x' }) === false);
for (let i = 0; i < 70; i++) ctx.momentShow({ key: 'k' + i, title: 'x' });
ok('las marcas tienen tope', Object.keys(prefs.moments).length === 60, String(Object.keys(prefs.moments).length));

console.log('\n' + pasaron + ' ok, ' + fallaron + ' fallas');
if (fallaron) process.exitCode = 1;
