// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.24.0] Ficha universal — lo PURO (fichaHTML), qué modelo arma de    ║
// ║  los datos vivos y qué encuentra el lanzador.                          ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const ctx = {
    console: { log: console.log, warn: noop, error: console.error }, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop,
                createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), body: { appendChild: noop, classList: { add: noop, remove: noop } } },
    escapeHtml: esc,
    _uiFold: s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
    db: { vehicles: [] },
    invState: { gases: [], equipment: [], assets: [] },
    pnState: { projects: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ficha.js'), 'utf8'), ctx, { filename: 'ficha.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

console.log('\n== fichaHTML (PURA) ==');
{
    const vacio = ctx.fichaHTML(null);
    ok('sin modelo dice que ya no existe (no una hoja en blanco)', /ya no existe/.test(vacio), vacio);

    const m = {
        kind: 'vehiculo', ref: 7, title: 'KNA<b>1', subtitle: 'Sportage · 2027',
        badges: [{ text: 'Etapa 4/8', tone: 'info' }, { text: 'Fuera de plan', tone: 'warn' }],
        stage: { index: 4, total: 8, label: 'Soak', done: false },
        next: { label: '⏱️ Iniciar el timer', js: "fichaClose();v7GoToVehicle(7,'soak-section')" },
        facts: [{ k: 'Propósito', v: 'COP' }],
        relations: [{ kind: 'config', ref: "CFG'1", label: 'Sportage 1.6T', meta: 'Configuración' }],
        history: [{ when: '2026-09-29T15:00:00', text: 'Estado cambiado' }]
    };
    const h = ctx.fichaHTML(m);
    ok('el título se escapa', h.includes('KNA&lt;b&gt;1') && !h.includes('KNA<b>1'));
    ok('una insignia por tono', /ficha-badge is-info/.test(h) && /ficha-badge is-warn/.test(h));
    ok('el stepper pinta 8 segmentos y marca el actual', (h.match(/class="ficha-step[ "]/g) || []).length === 8 && (h.match(/is-now/g) || []).length === 1);
    ok('UNA acción siguiente, primaria', (h.match(/ficha-next/g) || []).length === 1 && /btn-primary ficha-next/.test(h));
    ok('el onclick de la acción viaja escapado dentro del atributo', /onclick="fichaClose\(\);v7GoToVehicle\(7,&#39;soak-section&#39;\)"/.test(h), h.match(/onclick="[^"]*"/)[0]);
    ok('la relación abre su ficha encima, con la comilla del ref escapada', h.includes("fichaPush('config','CFG\\'1')"), h);
    ok('historia con fecha legible', /<time>[^<]*2026[^<]*<\/time>/.test(h));
    ok('es PURA: mismo modelo, mismo texto', ctx.fichaHTML(m) === h);
    ok('sin relaciones no pinta la sección', !/Relacionado/.test(ctx.fichaHTML(Object.assign({}, m, { relations: [] }))));
    ok('una nota se muestra (p. ej. "aviso, no veredicto")', /ficha-note/.test(ctx.fichaHTML(Object.assign({}, m, { note: 'Aviso interno' }))));
}

console.log('\n== fichaLinkHTML ==');
{
    const l = ctx.fichaLinkHTML('cilindro', "g'1", 'CO #1');
    ok('es un <button> que no dispara la fila de abajo', /^<button type="button" class="ficha-link"/.test(l) && /event\.stopPropagation\(\)/.test(l));
    ok('la referencia viaja escapada', l.includes("fichaOpen('cilindro','g\\'1',this)"), l);
}

console.log('\n== fichaModel ==');
{
    ctx.db.vehicles = [{ id: 11, vin: 'KNAPX000000000011', status: 'testing', configCode: 'CFG-A', purpose: 'COP-Emisiones',
                         config: { Modelo: 'Sportage', REGION: 'EUROPE' }, registeredAt: '2026-09-01T10:00:00Z',
                         timeline: [{ timestamp: '2026-09-02T10:00:00Z', action: 'Alta', user: 'Beto' },
                                    { timestamp: '2026-09-03T10:00:00Z', action: 'Prueba', user: 'Ana' }] }];
    ctx.cascadeVehicleStage = () => ({ index: 5, total: 8, label: 'Prueba', done: false });
    ctx.getNextStep = () => ({ action: 'Completar la verificación', goto: 'test-verify-card', icon: '🏭' });
    ctx.tpConfigByDesc = d => (d === 'CFG-A' ? { desc: 'CFG-A', rgn: 'EUROPE' } : null);
    ctx.tpConfigShortName = c => 'Sportage corto';
    ctx.copVehicleFamilyKey = () => 'SPORTAGE|1.6T|AT|2027|EURO-6E|EP|G|5DR';
    const m = ctx.fichaModel('vehiculo', '11');
    ok('encuentra el vehículo por id aunque llegue como texto', m && m.title === 'KNAPX000000000011');
    ok('la acción siguiente es la de getNextStep y navega a la pantalla de siempre',
        m.next && /Completar la verificación/.test(m.next.label) && /v7GoToVehicle\(11,'test-verify-card'\)/.test(m.next.js), m && m.next && m.next.js);
    ok('relaciones: su configuración y su familia', m.relations.map(r => r.kind).join(',') === 'config,familia');
    ok('historia: lo más nuevo primero', m.history[0].text.startsWith('Prueba'));
    ok('un id que ya no existe → null (la hoja lo dice)', ctx.fichaModel('vehiculo', 999) === null);
    ok('un tipo desconocido → null', ctx.fichaModel('nave', 1) === null);
    ctx.getNextStep = () => { throw new Error('boom'); };
    const roto = ctx.fichaModel('vehiculo', 11);
    ok('si una definición truena, la ficha no rompe la pantalla y NO dice "ya no existe"',
        roto && roto.error === true && /No se pudo mostrar/.test(ctx.fichaHTML(roto)) && !/ya no existe/.test(ctx.fichaHTML(roto)));
}

console.log('\n== fichaSearch ==');
{
    ctx.getNextStep = () => null;
    ctx.invState.gases = [{ id: 'g1', formula: 'CO/N2', controlNo: 'CO-50', zone: 'C02' }];
    ctx.invState.equipment = [{ id: 'e1', name: 'Balanza analítica', kmmId: 'KMM-9' }];
    ctx.pnState.projects = [{ id: 'p1', name: 'Calibración del túnel' }, { id: 'p2', name: 'Calibración vieja', archived: true }];
    ok('con menos de 3 letras no busca', ctx.fichaSearch('co').length === 0);
    ok('por el final del VIN', ctx.fichaSearch('00011').some(r => r.label === 'KNAPX000000000011'));
    ok('sin acentos encuentra con acentos', ctx.fichaSearch('balanza analitica').length === 1);
    const cal = ctx.fichaSearch('calibracion');
    ok('un proyecto archivado no sale', cal.length === 1 && cal[0].label === 'Calibración del túnel', JSON.stringify(cal.map(r => r.label)));
    ok('cada resultado dice qué es', /Cilindro/.test(ctx.fichaSearch('CO-50')[0].cat));
    ok('cada resultado tiene acción (abre su ficha)', typeof ctx.fichaSearch('CO-50')[0].action === 'function');
    ctx.db.vehicles = Array.from({ length: 30 }, (_, i) => ({ id: i, vin: 'KNAZZZ' + String(i).padStart(11, '0') }));
    ok('tope de 12 resultados', ctx.fichaSearch('knazzz').length === 12);
}

console.log('\n' + pasaron + ' ok, ' + fallaron + ' fallas');
if (fallaron) process.exitCode = 1;
