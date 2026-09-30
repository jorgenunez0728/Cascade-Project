// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.21.0] Una cosa a la vez — funciones puras de uiFlow y la ronda     ║
// ║  de equipos (qué entra y en qué orden).                                ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const store = {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    setTimeout, clearTimeout, Uint8Array,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop,
                createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    safeParse: (k, d) => d, showToast: noop, auditLog: noop, escapeHtml: s => String(s), CASCADE_TOOLTIPS: {},
    CustomEvent: function(t, o) { this.type = t; this.detail = o && o.detail; }, dispatchEvent: noop,
    localToday: () => '2026-09-30', debounce: fn => fn, tabCacheInvalidate: noop, invRender: noop,
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['uiflow.js', 'inventory.js', 'projects.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

console.log('\n== uiFlowModel ==');
{
    const steps = [
        { key: 'gas:1', section: 'Zona A', title: 'CO' },
        { key: 'gas:2', section: 'Zona A', title: 'NO' },
        { key: 'gas:3', section: 'Zona B', title: 'C3H8' },
        { key: 'fuel:1', section: '⛽ Combustible', title: 'Tanque' }
    ];
    const vacio = ctx.uiFlowModel(steps, {});
    ok('sin avance: todo pendiente, primero = 0', vacio.pending.length === 4 && vacio.firstPending === 0 && vacio.done === 0);
    ok('secciones consecutivas con inicio y cuántas', JSON.stringify(vacio.sections) === JSON.stringify([
        { name: 'Zona A', start: 0, count: 2 }, { name: 'Zona B', start: 2, count: 1 }, { name: '⛽ Combustible', start: 3, count: 1 }]),
        JSON.stringify(vacio.sections));
    const m = ctx.uiFlowModel(steps, { done: { 'gas:1': true, 'gas:3': true }, skipped: { 'gas:2': true } });
    ok('estado por tarjeta: hecho / después / pendiente', m.cards.map(c => c.status).join(',') === 'hecho,despues,hecho,pendiente');
    ok('"Después" sigue contando como pendiente (no es haber leído)', JSON.stringify(m.pending) === '[1,3]' && m.firstPending === 1);
    ok('conteos', m.done === 2 && m.skipped === 1);
    const ambos = ctx.uiFlowModel(steps, { done: { 'gas:2': true }, skipped: { 'gas:2': true } });
    ok('hecho gana sobre después', ambos.cards[1].status === 'hecho');
    ok('pasos sin key se ignoran; null no truena', ctx.uiFlowModel([null, { title: 'x' }, steps[0]]).cards.length === 1 &&
        ctx.uiFlowModel(null).cards.length === 0);
}

console.log('\n== uiFlowNextIndex ==');
{
    const steps = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }];
    const m = ctx.uiFlowModel(steps, { done: { b: true, c: true } });
    ok('recorrido normal: la de al lado', ctx.uiFlowNextIndex(m, 0, false) === 1);
    ok('al retomar: salta lo hecho', ctx.uiFlowNextIndex(m, 0, true) === 3);
    ok('al final → resumen (= total)', ctx.uiFlowNextIndex(m, 3, false) === 4 && ctx.uiFlowNextIndex(m, 3, true) === 4);
    ok('nunca pasa del total', ctx.uiFlowNextIndex(m, 9, false) === 4);
}

console.log('\n== invEquipmentRoundPick ==');
{
    const st = {
        e1: { code: 'vencido', days: -3 }, e2: { code: 'vencido', days: -40 },
        e3: { code: 'porvencer', days: 10 }, e4: { code: 'porvencer', days: 5 },
        e5: { code: 'porvencer', days: 45 }, e6: { code: 'vigente', days: 200 }, e7: { code: 'vencido', days: -1 }
    };
    const equipment = [
        { id: 'e1', name: 'Termómetro' }, { id: 'e2', name: 'Balanza' }, { id: 'e3', name: 'Manómetro' },
        { id: 'e4', name: 'Higrómetro' }, { id: 'e5', name: 'Cronómetro' }, { id: 'e6', name: 'Barómetro' },
        { id: 'e7', name: 'No aplica', requiresCal: 'No' }
    ];
    const a1 = { id: 'm1', desc: 'Limpiar filtros' }, a2 = { id: 'm2', desc: 'Revisar bomba' };
    const r = ctx.invEquipmentRoundPick({
        equipment, statusOf: e => st[e.id],
        overdue: [{ act: a1, asset: { name: 'Dinamómetro' }, lastWeek: 38 }],
        dueThisWeek: [{ act: a1, asset: null, week: 40 }, { act: a2, asset: null, week: 40 }]
    });
    const ids = r.map(x => x.kind + ':' + x.id).join(',');
    ok('orden: mtto vencido → cal vencidas (más vieja primero) → mtto semana → cal por vencer (más próxima primero)',
        ids === 'mtto:m1,cal:e2,cal:e1,mtto:m2,cal:e4,cal:e3', ids);
    ok('un mantenimiento vencido Y de esta semana aparece una sola vez', r.filter(x => x.id === 'm1').length === 1);
    ok('fuera: vigentes, por vencer a más de 14 días y "No aplica"', !/e5|e6|e7/.test(ids));
    ok('secciones legibles', r.map(x => x.section).join('|') === 'Vencido|Vencido|Vencido|Esta semana|Por vencer|Por vencer');
    ok('vencido marcado como tal', r.filter(x => x.overdue).length === 3);
    const ancho = ctx.invEquipmentRoundPick({ equipment, statusOf: e => st[e.id], calDays: 60 });
    ok('la ventana se puede ampliar (calDays)', ancho.some(x => x.id === 'e5'));
    ok('sin datos → vacío, sin tronar', ctx.invEquipmentRoundPick().length === 0 && ctx.invEquipmentRoundPick({}).length === 0);
}

console.log('\n== pnProjectsReviewPick ==');
{
    const P1 = { id: 'p1', name: 'Túnel' }, P2 = { id: 'p2', name: 'Dinamómetro' };
    const it = (p, id, resp, fecha) => ({ project: p, step: { id, responsible: resp, targetDate: fecha } });
    const items = [it(P1, 's1', 'Ana', '2026-09-20'), it(P2, 's2', 'Beto', '2026-09-25'),
                   it(P2, 's3', '', '2026-09-10'), it(P1, 's4', 'Beto', '2026-09-01'), it(P2, 's5', 'Beto', null)];
    const all = ctx.pnProjectsReviewPick(items, {});
    ok('orden: por proyecto y la fecha más vieja primero; sin fecha al final',
        all.items.map(x => x.step.id).join(',') === 's3,s2,s5,s4,s1', all.items.map(x => x.step.id).join(','));
    ok('sin filtro no oculta nada', all.hidden === 0);
    const mine = ctx.pnProjectsReviewPick(items, { onlyMine: true, me: 'Beto' });
    ok('"Solo míos": los suyos y los que no tienen responsable', mine.items.map(x => x.step.id).join(',') === 's3,s2,s5,s4');
    ok('…y dice cuántos de otros oculta', mine.hidden === 1);
    ok('"Solo míos" sin sesión no filtra', ctx.pnProjectsReviewPick(items, { onlyMine: true, me: '' }).hidden === 0);
    ok('sin datos → vacío', ctx.pnProjectsReviewPick(null).items.length === 0);
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exitCode = fallaron ? 1 : 0;
