// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Operación en tarjetas (2.13.0) — funciones puras                    ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, JSON, Object, Array, String, Number, Math, window: {}, document: { addEventListener() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'opcards.js'), 'utf8'), ctx, { filename: 'opcards.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

console.log('\n== opCardsFrom ==');
{
    const g = [
        { key: 'a', section: 'Recepción', title: 'Operador', visible: true, required: ['op_recep'], missing: [] },
        { key: 'b', section: 'Recepción', title: 'Odómetro', visible: true, required: ['op_odo'], missing: ['op_odo'] },
        { key: 'c', section: 'Recepción', title: 'Notas', visible: true, required: [], missing: [] },
        { key: 'x', section: 'Verificación en prueba', title: 'Túnel', visible: false, required: ['test_tunnel'], missing: ['test_tunnel'] },
        { key: 'd', section: 'Preacondicionamiento', title: 'Ciclo', visible: true, required: ['precond_cycle'], missing: ['precond_cycle'] },
        { key: 'e', section: 'Preacondicionamiento', title: 'Timer', visible: true, required: [], missing: [] }
    ];
    const r = ctx.opCardsFrom(g);
    ok('solo las visibles (un campo condicional oculto no es tarjeta)', r.cards.length === 5 && !r.cards.some(c => c.key === 'x'));
    ok('en el orden del formulario, con índice corrido', r.cards.map(c => c.key).join('') === 'abcde' && r.cards[3].index === 3);
    ok('secciones con inicio y cuántas', JSON.stringify(r.sections) === JSON.stringify([
        { name: 'Recepción', start: 0, count: 3 }, { name: 'Preacondicionamiento', start: 3, count: 2 }]), JSON.stringify(r.sections));
    ok('pendientes = las que tienen un obligatorio vacío', JSON.stringify(r.pending) === '[1,3]' && r.firstPending === 1);
    const lleno = ctx.opCardsFrom(g.map(x => Object.assign({}, x, { missing: [] })));
    ok('sin pendientes → firstPending -1', lleno.firstPending === -1 && lleno.pending.length === 0);
    ok('sin grupos → vacío, sin tronar', ctx.opCardsFrom(null).cards.length === 0 && ctx.opCardsFrom([]).sections.length === 0);
}

console.log('\n== opCardsWanted ==');
{
    ok('auto + teléfono + Técnico → sí', ctx.opCardsWanted('auto', true, 'Técnico'));
    ok('auto + teléfono + Practicante → sí', ctx.opCardsWanted('auto', true, 'Practicante'));
    ok('auto + teléfono + Signatario → no (lo puede encender con 📇)', !ctx.opCardsWanted('auto', true, 'Signatario'));
    ok('auto + escritorio → no', !ctx.opCardsWanted('auto', false, 'Técnico'));
    ok('encendido a mano → sí en cualquier equipo y rol', ctx.opCardsWanted(true, false, 'Assistant Manager / Manager'));
    ok('apagado a mano → no, aunque sea teléfono y técnico', !ctx.opCardsWanted(false, true, 'Técnico'));
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exitCode = fallaron ? 1 : 0;
