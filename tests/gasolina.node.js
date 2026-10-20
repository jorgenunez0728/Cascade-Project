// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.11.0 — El cuarto de gasolina: tambos, tipos y totales por tipo    ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Código REAL de js/inventory.js y js/cuarto.js en un `vm` sin DOM.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const store = {};
const audits = [];
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    setTimeout, clearTimeout, Uint8Array,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop,
                createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    safeParse: (k, d) => d, showToast: noop, auditLog: function(m, a, e, d, o) { audits.push({ a: a, e: e, o: o }); }, escapeHtml: s => String(s), CASCADE_TOOLTIPS: {},
    CustomEvent: function(t, o) { this.type = t; this.detail = o && o.detail; }, dispatchEvent: noop,
    localToday: () => '2026-10-20', debounce: fn => fn, tabCacheInvalidate: noop, invRender: noop,
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['inventory.js', 'cuarto.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
vm.runInContext('globalThis.__inv = () => invState; globalThis.__setInv = (x) => { invState = x; }; this.FL = INV_FUEL_ROOM_LAYOUT;', ctx);

let pasaron = 0, fallaron = 0;
function ok(n, c, d) { if (c) { pasaron++; console.log('  ok  ' + n); } else { fallaron++; console.log('  FALLA  ' + n + (d !== undefined ? ' — ' + d : '')); } }
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-6);
const FL = ctx.FL;

console.log('\n== El cuarto de gasolina es el del croquis ==');
ok('seis tarimas y las boyas', ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'B'].every(z => FL.zones[z]) && Object.keys(FL.zones).length === 7);
ok('una tarima son 4 posiciones; las boyas, un solo tambo', ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].every(z => FL.zones[z].slots === 4) && FL.zones.B.slots === 1 && FL.zones.B.kind === 'tote');
ok('una sola puerta, en la pared de abajo', FL.doors.length === 1 && FL.doors[0].a[1] === 7.1 && FL.doors[0].b[1] === 7.1);
ok('el drenaje está junto a la pared del fondo, entre T2 y T3', FL.marks[0].kind === 'drain' && FL.marks[0].rect[1] < 0.6 &&
    FL.marks[0].rect[0] > FL.zones.T2.pallet[2] && FL.marks[0].rect[2] < FL.zones.T3.pallet[0]);
ok('T5 está debajo de T1 y T6 debajo de T4', FL.zones.T5.pallet[1] > FL.zones.T1.pallet[3] && FL.zones.T6.pallet[1] > FL.zones.T4.pallet[3]);
ok('las boyas, abajo a la derecha', FL.zones.B.points[0][0] > 8 && FL.zones.B.points[0][1] > 4.5);
ok('ninguna tarima se encima con otra', (() => {
    const ps = Object.keys(FL.zones).map(k => FL.zones[k].pallet);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) return false;
    }
    return true;
})());

console.log('\n== Códigos de posición con separador ==');
ok('"T1-2" → T1, 2', JSON.stringify(ctx.invRoomParseCode('T1-2', ['T1', 'T2', 'B'], '-')) === '{"zone":"T1","n":2}');
ok('"b-1" (minúsculas) → B, 1', JSON.stringify(ctx.invRoomParseCode('b-1', ['T1', 'B'], '-')) === '{"zone":"B","n":1}');
ok('"T12" sin separador no es una posición de la tarima 1', ctx.invRoomParseCode('T12', ['T1', 'T2'], '-') === null);
ok('código de la tarima: T3-4', ctx.invRoomCode('T3', 4, '-') === 'T3-4');
ok('los gases siguen igual: A03', ctx.invRoomCode('A', 3) === 'A03' && ctx.invRoomParseCode('A03', ['A']).n === 3);

console.log('\n== Escena ==');
const zones = ctx.invFuelRoomZones(FL);
let sc = ctx.invRoomScene(FL, zones, ctx.invFuelRoomItems([{ id: 'a', pos: 'T1-1' }, { id: 'b', pos: 'T1-1' }, { id: 'c', pos: '' }, { id: 'd', pos: 'T9-1' }, { id: 'e', pos: 'B-1' }]));
ok('25 posiciones (6 × 4 + 1)', sc.slots.length === 25);
ok('el tambo en T1-1 y las boyas en B-1', sc.slots.find(s => s.code === 'T1-1').gasId === 'a' && sc.slots.find(s => s.code === 'B-1').gasId === 'e');
ok('lo que no tiene lugar se declara: repetida, sin posición, tarima que no existe',
   sc.unplaced.map(u => u.reason).sort().join(',') === 'repetida,sin-zona,zona-desconocida');
const t1 = ctx.invRoomZoneSlots(FL.zones.T1, 4).pts;
ok('tarima vista de frente (T1): 1-2 atrás, 3-4 adelante, de izquierda a derecha', t1[0].y < t1[2].y && t1[0].x < t1[1].x && t1[2].x < t1[3].x);
const t5 = ctx.invRoomZoneSlots(FL.zones.T5, 4).pts;
ok('tarima de lado (T5, se ve desde la derecha): atrás = junto a la pared', t5[0].x < t5[2].x && t5[0].y > t5[1].y);
const t6 = ctx.invRoomZoneSlots(FL.zones.T6, 4).pts;
ok('tarima de lado (T6, se ve desde la izquierda): atrás = junto a la pared', t6[0].x > t6[2].x && t6[0].y < t6[1].y);

console.log('\n== Abrir una tarima (al entrar a verla de frente) ==');
const openRow = (def) => [1, 2, 3, 4].map(n => { const p = ctx.invRoomZoneSlots(def, 4).pts[n - 1], e = ctx.invRoomExplodeOffset(def, n, 1); return [p.x + e[0], p.y + e[1]]; });
let row = openRow(FL.zones.T1);
ok('T1 abierta: los 4 en una fila (la de enfrente), en orden', row.every(p => near(p[1], FL.zones.T1.rows[1][1])) && row[0][0] < row[1][0] && row[1][0] < row[2][0] && row[2][0] < row[3][0]);
row = openRow(FL.zones.T5);
ok('T5 abierta: en una fila a lo largo de y, sin encimarse', row.every(p => near(p[0], FL.zones.T5.rows[1][0])) && row[0][1] > row[1][1] && row[1][1] > row[2][1] && row[2][1] > row[3][1] &&
   Math.abs(row[0][1] - row[1][1]) >= 0.6);
ok('a medio camino, a la mitad', near(ctx.invRoomExplodeOffset(FL.zones.T2, 1, 0.5)[0], ctx.invRoomExplodeOffset(FL.zones.T2, 1, 1)[0] / 2));
ok('un buffer de gases se sigue abriendo igual que en 3.10.0', (() => {
    vm.runInContext('this.GL = INV_ROOM_LAYOUT;', ctx);
    const E = ctx.GL.zones.E, e = ctx.invRoomExplodeOffset(E, 1, 1);
    return near(e[1], E.rows[1][1] - E.rows[0][1]);
})());
const cam = ctx.invRoomFocusCam(FL, sc, 'T5', {});
ok('entrar a T5 gira la cámara a verla de frente', cam && cam.az === 90 && cam.el < 20);

console.log('\n== Nivel de un tambo (mismos umbrales que Consumibles) ==');
const lv = (lvl, cap, extra) => ctx.invFuelTankLevel(Object.assign({ capacity: cap, currentLevel: lvl, unit: 'L', readings: [{ date: '2026-10-01', level: lvl }] }, extra || {}));
ok('225 de 225 → 100 %, ok', lv(225, 225).pct === 100 && lv(225, 225).status === 'ok');
ok('60 de 225 → 27 %, bajo', lv(60, 225).pct === 27 && lv(60, 225).status === 'bajo');
ok('30 de 225 → 13 %, crítico', lv(30, 225).status === 'critico');
ok('sin capacidad → sin lecturas (no se inventa un %)', lv(100, 0).status === 'sinlecturas' && lv(100, 0).pct === null);
ok('en galones se pasa a litros', near(ctx.invFuelTankLevel({ capacity: 55, currentLevel: 55, unit: 'gal', readings: [{ level: 55 }] }).liters, 208.2));
ok('el cuarto lo pinta con el mismo semáforo', ctx.invRoomLevelTone({ pct: 27, levelStatus: 'bajo' }) === 'mid' && ctx.invRoomLevelTone({ pct: 13, levelStatus: 'critico' }) === 'low');

console.log('\n== Tipos y totales por tipo ==');
const T = [{ id: 'ft_e6', name: 'EURO VI', color: '#16a34a', regulation: 'EURO VI', reorderLevel: 300 }, { id: 'ft_c3', name: 'CARB LEV III', color: '#2563eb', regulation: 'CARB LEV III' }, { id: 'ft_x', name: 'Viejo', deleted: true }];
const tanks = [
    { id: 'd1', typeId: 'ft_e6', capacity: 225, currentLevel: 50, unit: 'L', readings: [{ level: 50 }], fuelStatus: 'Abierto' },
    { id: 'd2', typeId: 'ft_e6', capacity: 225, currentLevel: 225, unit: 'L', readings: [{ level: 225 }], fuelStatus: 'Cerrado' },
    { id: 'd3', regulation: 'CARB LEV III', capacity: 400, currentLevel: 315, unit: 'L', readings: [{ level: 315 }] },
    { id: 'd4', regulation: 'OTRA', capacity: 225, currentLevel: 100, unit: 'L', readings: [{ level: 100 }] }
];
const tot = ctx.invFuelTypeTotals(T, tanks);
const e6 = tot.find(r => r.id === 'ft_e6');
ok('EURO VI = 50 + 225 = 275 L en 2 tambos (el ejemplo del laboratorio)', e6.liters === 275 && e6.drums === 2 && e6.capacity === 450);
ok('un tambo sin typeId se agrupa por su regulación', tot.find(r => r.id === 'ft_c3').liters === 315);
ok('lo que no tiene tipo se declara en "Sin tipo"', tot.find(r => r.id === null).drums === 1);
ok('un tipo borrado no sale', !tot.some(r => r.id === 'ft_x'));
ok('275 L con nivel de pedido 300 → pedir', e6.needsPurchase === true && tot.find(r => r.id === 'ft_c3').needsPurchase === false);
ok('abiertos y bajos por tipo', e6.open === 1 && e6.low === 1);
ok('la semilla sale de las regulaciones, con id estable (dos equipos no duplican)',
   ctx.invFuelTypesFromTanks(tanks).map(t => t.id).join(',') === 'ft_carb_lev_iii,ft_otra' && ctx.invFuelTypeSeedId('EURO VI') === 'ft_euro_vi');

console.log('\n== Fusión del catálogo entre equipos ==');
const A = [{ id: 'ft_e6', name: 'EURO VI', updatedAt: '2026-10-01' }, { id: 'a1', name: 'Solo A', updatedAt: '2026-10-02' }];
const B = [{ id: 'ft_e6', name: 'EURO 6', updatedAt: '2026-10-05' }, { id: 'b1', name: 'Solo B', updatedAt: '2026-10-02' }];
const ab = ctx.invFuelTypesUnion(A, B), ba = ctx.invFuelTypesUnion(B, A);
ok('une los dos y gana el editado más reciente', ab.length === 3 && ab.find(t => t.id === 'ft_e6').name === 'EURO 6');
ok('simétrica: los dos equipos quedan igual', JSON.stringify(ab.slice().sort((x, y) => x.id < y.id ? -1 : 1)) === JSON.stringify(ba.slice().sort((x, y) => x.id < y.id ? -1 : 1)));
ok('un borrado más reciente gana (no resucita)', ctx.invFuelTypesUnion([{ id: 'z', name: 'Z', updatedAt: '1' }], [{ id: 'z', name: 'Z', deleted: true, updatedAt: '2' }])[0].deleted === true);
ok('¿hay algo nuevo? sí con un tipo o una edición más reciente; no con lo mismo',
   ctx.invFuelTypesNewTo(A, B) === true && ctx.invFuelTypesNewTo(A, A) === false && ctx.invFuelTypesNewTo(B, [{ id: 'ft_e6', updatedAt: '2026-10-01' }]) === false);

console.log('\n== Escritores (capa de datos) ==');
ctx.__setInv(Object.assign(ctx.__inv(), { fuelTanks: [], fuelTypes: [] }));
let r = ctx.invFuelTankCreate({ typeId: '', capacity: 225, pos: 'T1-1' });
ok('alta sin tipo se rechaza en el campo del tipo', !r.ok && r.field === 'type');
r = ctx.invFuelTypeSave({ name: 'EURO VI', regulation: 'EURO VI', reorderLevel: 300 });
ok('alta de un tipo', r.ok && ctx.__inv().fuelTypes.length === 1);
ok('no se repite el nombre', ctx.invFuelTypeSave({ name: 'euro vi' }).field === 'name');
const tyId = r.type.id;
r = ctx.invFuelTankCreate({ typeId: tyId, capacity: 225, level: '', pos: 'T1-1' });
const d1 = r.tank;
ok('alta en una posición: nace lleno, cerrado, con su primera lectura y la regulación del tipo',
   r.ok && d1.currentLevel === 225 && d1.fuelStatus === 'Cerrado' && d1.readings.length === 1 && d1.regulation === 'EURO VI' && d1.pos === 'T1-1');
ok('no cabe más de lo que le cabe', ctx.invFuelTankCreate({ typeId: tyId, capacity: 225, level: 300, pos: 'T1-2' }).field === 'level');
ok('una posición ocupada no recibe otro', !ctx.invFuelTankCreate({ typeId: tyId, capacity: 225, level: 10, pos: 'T1-1' }).ok);
const d2 = ctx.invFuelTankCreate({ typeId: tyId, capacity: 225, level: 50, pos: 'T1-2' }).tank;
ok('mover a una ocupada se niega; a una libre sí, con auditoría antes/después', ctx.invFuelMove(d2.id, 'T1-1') === false && ctx.invFuelMove(d2.id, 'T2-1') === true &&
   d2.pos === 'T2-1' && audits.some(x => x.a === 'fuel_moved' && x.o.before.pos === 'T1-2' && x.o.after.pos === 'T2-1'));
ok('estatus: Abierto; uno desconocido se rechaza', ctx.invFuelSetStatus(d2.id, 'Abierto').ok && d2.fuelStatus === 'Abierto' && !ctx.invFuelSetStatus(d2.id, 'Lleno').ok);
const c3 = ctx.invFuelTypeSave({ name: 'CARB LEV III', regulation: 'CARB LEV III' }).type;
ok('cambiar el tipo cambia la regulación de la que descuenta', ctx.invFuelSetType(d2.id, c3.id).ok && d2.regulation === 'CARB LEV III');
ok('no se borra un tipo que usan tambos', !ctx.invFuelTypeDelete(tyId).ok && ctx.invFuelTypeDelete(c3.id).ok === false);
ctx.invFuelSetType(d2.id, tyId);
ok('sin tambos, sí: queda con marca de borrado', ctx.invFuelTypeDelete(c3.id).ok && ctx.__inv().fuelTypes.find(t => t.id === c3.id).deleted === true && ctx.invFuelTypesLive().length === 1);
ok('el total del tipo: 225 + 50 = 275 L', ctx.invFuelTypeTotals(ctx.__inv().fuelTypes, ctx.__inv().fuelTanks)[0].liters === 275);
ok('cambiar la regulación de un tipo ajusta a sus tambos', ctx.invFuelTypeSave({ id: tyId, name: 'EURO VI', regulation: 'EURO-6E' }).ok && d1.regulation === 'EURO-6E' && d2.regulation === 'EURO-6E');

console.log('\n== Indicadores, filtro y resumen de tarima ==');
const look = { a: { tone: 'ok', liters: 225 }, b: { tone: 'low', liters: 20 } };
ok('resumen de una tarima: tambos, litros y críticos', ctx.invRoomZoneSummary([{ gasId: 'a' }, { gasId: 'b' }, { gasId: null }], look, 'pallet') === '2 tambos · 245 L · 1 crítico');
ok('tarima vacía', ctx.invRoomZoneSummary([{ gasId: null }], look, 'pallet') === 'vacía');
ok('las boyas: solo los litros', ctx.invRoomZoneSummary([{ gasId: 'a' }], look, 'tote') === '225 L');
ok('filtro por tipo', ctx.invRoomFilterMatch('type:ft_e6', { typeId: 'ft_e6' }) && !ctx.invRoomFilterMatch('type:ft_e6', { typeId: 'x' }) && ctx.invRoomFilterMatch('type:none', { typeId: null }));
const k = ctx.invFuelRoomKpis({ slots: [{ gasId: 'a' }, { gasId: 'b' }, { gasId: null }], unplaced: [{}] }, { a: { tone: 'ok', counts: true, readToday: true }, b: { tone: 'low', counts: true } });
ok('indicadores: tambos/posiciones, críticos, leídos hoy, sin lugar', k.drums === 2 && k.positions === 3 && k.critical === 1 && k.readToday === 1 && k.toRead === 2 && k.unplaced === 1);
ok('el ciclo del tambo se deriva', ctx.invFuelRoomLifecycle({ fuelStatus: 'Cerrado' }) === 'cerrado' && ctx.invFuelRoomLifecycle({ fuelStatus: 'Abierto' }, { liters: 0 }) === 'vacio');

console.log('\n== [3.11.0] Los registros de antes eran TOTALES por tipo, no tambos ==');
{
    const T2 = [{ id: 'ft_e6', name: 'EURO VI', regulation: 'EURO VI', reorderLevel: 300 }, { id: 'ft_c3', name: 'CARB LEV III', regulation: 'CARB LEV III' }];
    const legacy = [
        { id: 'L1', name: 'EURO VI (Orden Anterior)', regulation: 'EURO VI', capacity: 400, currentLevel: 379.5, unit: 'L', legacyTotal: true,
          readings: [{ date: '2026-09-07', level: 400 }, { date: '2026-09-14', level: 379.5 }] },
        { id: 'L2', name: 'EURO VI (Orden Actual)', regulation: 'EURO VI', capacity: 400, currentLevel: 400, unit: 'L', legacyTotal: true, readings: [{ date: '2026-09-07', level: 400 }] },
        { id: 'L3', name: 'CARB LEV III Regular', regulation: 'CARB LEV III', capacity: 400, currentLevel: 315, unit: 'L', legacyTotal: true, readings: [{ date: '2026-09-07', level: 315 }] }
    ];
    let tt = ctx.invFuelTypeTotals(T2, legacy);
    ok('sin tambos: el total del tipo sale de sus registros anteriores (EURO VI 779.5 L)', tt[0].fromLegacy && tt[0].liters === 779.5 && tt[0].drums === 0 && tt[0].legacy === 2);
    const drums = [
        { id: 'D1', typeId: 'ft_e6', pos: 'T1-1', legacyTotal: false, capacity: 225, currentLevel: 50, unit: 'L', readings: [{ date: '2026-10-05', level: 100 }, { date: '2026-10-12', level: 50 }] },
        { id: 'D2', typeId: 'ft_e6', pos: 'T1-2', legacyTotal: false, capacity: 225, currentLevel: 225, unit: 'L', readings: [{ date: '2026-10-05', level: 225 }] }
    ];
    tt = ctx.invFuelTypeTotals(T2, legacy.concat(drums));
    ok('con tambos: solo cuentan los tambos (275 L), el registro anterior no se suma dos veces', tt[0].liters === 275 && tt[0].capacity === 450 && !tt[0].fromLegacy && tt[0].legacy === 2);
    ok('un tipo sin tambos sigue con su total anterior (CARB 315 L)', tt[1].fromLegacy && tt[1].liters === 315);
    ok('el consumo por semana es la historia del tipo: registro anterior + tambos', tt[0].usage.weeks.map(w => w.liters).join(',') === '20.5,50', JSON.stringify(tt[0].usage.weeks));
    ok('la siembra toma el nivel de pedido de los registros anteriores (sumado)',
       ctx.invFuelTypesFromTanks([{ regulation: 'EURO VI', reorderLevel: 150 }, { regulation: 'EURO VI', reorderLevel: 100 }])[0].reorderLevel === 250);
    ok('un total anterior no es un tambo en el cuarto (ni "sin lugar")', ctx.invFuelRoomItems(legacy.concat(drums)).map(x => x.id).join(',') === 'D1,D2');

    // Con el estado real del módulo
    const inv = ctx.__inv();
    ctx.__setInv(Object.assign(inv, { fuelTypes: undefined, fuelTanks: [
        { id: 'fuel_eurovi_act', name: 'EURO VI (Orden Actual)', regulation: 'EURO VI', capacity: 400, currentLevel: 400, unit: 'L', readings: [{ date: '2026-09-07', level: 400 }], reorderLevel: 200 },
        { id: 'puesto', name: 'Tambo en T1-1', regulation: 'EURO VI', pos: 'T1-1', capacity: 225, currentLevel: 200, unit: 'L', readings: [{ date: '2026-10-07', level: 200 }] }
    ], gases: [], usageLog: [] }));
    vm.runInContext('_invFuelTypesEnsure();', ctx);
    const st = ctx.__inv();
    ok('al cargar: lo que no tenía lugar se marca total anterior; lo acomodado, tambo', st.fuelTanks[0].legacyTotal === true && st.fuelTanks[1].legacyTotal === false);
    ok('la marca es una sola vez (no se repite en la línea de tiempo)', (vm.runInContext('_invFuelTypesEnsure();', ctx), st.fuelTanks[0].timeline.length === 1));
    ok('el tipo sembrado hereda el nivel de pedido', st.fuelTypes[0].reorderLevel === 200);
    const R = ctx.invConsumablesReportRows();
    ok('reporte semanal: un renglón POR TIPO (EURO VI 200 L de 225, 1 tambo), no por registro', R.fuel.length === 1 && R.fuel[0].label === 'EURO VI' && R.fuel[0].level === 200 && R.fuel[0].capacity === 225 && R.fuel[0].drums === 1, JSON.stringify(R.fuel));
    ok('200 L con pedido en 200 → comprar', R.fuel[0].needsPurchase === true);
    const round = vm.runInContext('invRoundItems()', ctx).filter(x => x.kind === 'fuel').map(x => x.id).join(',');
    ok('la ronda lee el tambo, no el total anterior de un tipo que ya tiene tambos', round === 'puesto', round);
    ok('un tambo nuevo nace como tambo', ctx.invFuelTankCreate({ typeId: st.fuelTypes[0].id, capacity: 225, level: 225, pos: 'T1-2' }).tank.legacyTotal === false);
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
