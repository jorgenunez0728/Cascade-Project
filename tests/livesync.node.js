// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Live-sync entre DOS equipos (issues #131 y #132)                   ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Simula dos dispositivos, cada uno en su propio contexto `vm` con su propio
// db/tpState/invState, y una "nube" en medio que entrega cada fbPush al otro
// equipo con las LLAVES REORDENADAS (como las devuelve Firestore). Los timers son
// falsos: se corre la conversación completa y se cuentan empujes y avisos.
//
//  #132 — antes, una sola edición producía un ping-pong sin fin: cada fusión
//         automática hacía fbPushAll y el otro lado veía el plan "distinto" por el
//         orden de las llaves.
//  #131 — antes, editar un vehículo que ya existía en los dos equipos era un
//         "conflicto" que el live-sync nunca aplicaba.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const SRC = { app: read('app.js'), fb: read('firebase-sync.js'), cop15: read('cop15.js') };

function extraer(src, nombre) {
    const re = new RegExp('(?:^|\\n)([ \\t]*)function\\s+' + nombre + '\\s*\\(');
    const m = re.exec(src);
    if (!m) throw new Error('no encontre function ' + nombre);
    let i = src.indexOf('{', m.index + m[0].length - 1);
    let d = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) break; }
    }
    const start = m.index + (src[m.index] === '\n' ? 1 : 0);
    return src.slice(start, i + 1);
}
function constante(src, nombre) {
    const m = new RegExp('\\nvar ' + nombre + ' = [^;]+;').exec(src);
    if (!m) throw new Error('no encontre var ' + nombre);
    return m[0];
}

const APP_FNS = ['stableStringify', 'strHash', 'revContentHash', 'stampRevisions', 'revInitMissing',
    '_vehTombKey', 'vehicleIsTombstoned', 'vehicleTombstonesUnion', 'vehicleTombstone', 'vehicleTombstonesApply'];
const APP_VARS = ['VEHICLE_TOMBSTONE_MAX'];
const FB_FNS = ['_fbTestedKey', '_fbPlanKey', '_fbPlanItemKey', '_fbMergePaStatus', '_fbUnionLog',
    '_fbVehTime', '_fbMergeVehicle', '_fbModuleFingerprint', '_fbLocalHasExtras', '_fbPushBack',
    '_fbLiveToast', '_fbAfterAutoMerge', 'fbAutoMerge', 'fbMergeAnalyze', 'fbMergeExecute',
    '_fbEquipKey', '_fbMergeReadings', '_fbTombsNewTo'];
const FB_VARS = ['FB_LIVE_TOAST_MS', 'FB_PUSHBACK_DELAY_MS', 'FB_PUSHBACK_WINDOW_MS', 'FB_PUSHBACK_MAX', '_fbLive'];
const COP_FNS = ['_cascadeEmpty', '_cascadeSame', '_cascadePlain', 'cascadeThreeWay'];

// ── Reloj y nube falsos ────────────────────────────────────────────────────
let reloj = Date.parse('2026-09-22T12:00:00.000Z');
let cola = [];
function fakeSetTimeout(fn, ms) { const t = { at: reloj + (ms || 0), fn }; cola.push(t); return t; }
function fakeClearTimeout(t) { cola = cola.filter(x => x !== t); }
function correr(maxEventos) {
    let n = 0;
    while (cola.length && n < (maxEventos || 1000)) {
        cola.sort((a, b) => a.at - b.at);
        const t = cola.shift();
        reloj = Math.max(reloj, t.at);
        t.fn();
        n++;
    }
    return n;
}
// Firestore NO respeta el orden de las llaves: se entregan invertidas.
function comoFirestore(x) {
    if (Array.isArray(x)) return x.map(comoFirestore);
    if (x && typeof x === 'object') {
        const o = {};
        Object.keys(x).sort().reverse().forEach(k => { o[k] = comoFirestore(x[k]); });
        return o;
    }
    return x;
}
const FakeDate = class extends Date {
    constructor(...a) { if (a.length) super(...a); else super(reloj); }
    static now() { return reloj; }
};

function equipo(nombre) {
    const ctx = {
        console, JSON, Object, Array, String, Number, Math, isNaN, parseInt, parseFloat,
        Date: FakeDate,
        setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout,
        localStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
        refreshAllLists() {}, updateProgressBar() {}, _fbTpUISync() {}, invRender() {},
        dedupeVehicleIds() {}, tpDedupeWeeklyPlans() {},
        tpPlanId: w => w.id,
        fbSyncModules: { cop15: true, testplan: true, inventory: true },
        fbSync: { stationId: 'KIA-EMLAB' },
        toasts: [], pushes: [],
    };
    ctx.showToast = (m) => ctx.toasts.push(m);
    ctx.fbPush = (col, state) => {
        ctx.pushes.push(col);
        const copia = comoFirestore(JSON.parse(JSON.stringify(state)));
        fakeSetTimeout(() => nube(nombre, col, copia), 300);
    };
    vm.createContext(ctx);
    APP_FNS.forEach(n => vm.runInContext(extraer(SRC.app, n), ctx));
    APP_VARS.forEach(n => vm.runInContext(constante(SRC.app, n), ctx));
    // El real (app.js) retira lo borrado en cada carga de db; aquí basta con eso.
    vm.runInContext('function dedupeVehicleIds() { vehicleTombstonesApply(); return 0; }', ctx);
    FB_FNS.forEach(n => vm.runInContext(extraer(SRC.fb, n), ctx));
    FB_VARS.forEach(n => vm.runInContext(constante(SRC.fb, n), ctx));
    COP_FNS.forEach(n => vm.runInContext(extraer(SRC.cop15, n), ctx));
    ctx.nombre = nombre;
    return ctx;
}

let A, B;
function nube(emisor, col, data) {
    const destino = emisor === 'A' ? B : A;
    destino.fbAutoMerge(col, data, emisor);
}
function guardar(dev) { dev.stampRevisions(dev.db.vehicles, new FakeDate().toISOString()); dev.fbPush('cop15', dev.db); }
function guardarPlan(dev) { dev.stampRevisions(dev.tpState.weeklyPlans, new FakeDate().toISOString()); dev.fbPush('testplan', dev.tpState); }

function vehiculoBase() {
    return {
        id: 'v1', vin: 'KNA123', status: 'in-progress', purpose: 'CoP', configCode: 'C1',
        registeredAt: '2026-09-20T10:00:00.000Z',
        timeline: [{ timestamp: '2026-09-20T10:00:00.000Z', action: 'Alta' }],
        testData: { datetime: '', odometer: 5, preconditioning: { tirePressurePsi: 33, datetime: '' } }
    };
}
function planBase() {
    return {
        testedList: [], planData: [], rules: [{ region: 'EUROPE', ratio: 3 }], months: [],
        weeklyPlans: [{ id: 'p1', weekDate: '2026-09-21', accepted: true, created: '2026-09-18T00:00:00.000Z',
            items: [{ uid: 'u1', desc: 'CFG-A', testDay: 'Lun', completed: false },
                    { uid: 'u2', desc: 'CFG-B', testDay: 'Mar', completed: false }] }]
    };
}
function arrancar() {
    reloj = Date.parse('2026-09-22T12:00:00.000Z'); cola = [];
    A = equipo('A'); B = equipo('B');
    [A, B].forEach(d => {
        d.db = { vehicles: [vehiculoBase()], lastId: d.nombre === 'A' ? 7 : 3 };
        d.tpState = planBase();
        d.invState = { gases: [], equipment: [] };
        // Primer saveDB/tpSave de cada equipo con el código nuevo: inicializa `_rev`.
        d.stampRevisions(d.db.vehicles, new FakeDate().toISOString());
        d.stampRevisions(d.tpState.weeklyPlans, new FakeDate().toISOString());
    });
}

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

// ── stableStringify / stampRevisions ───────────────────────────────────────
console.log('\n== stableStringify y revisiones ==');
{
    arrancar();
    const s = A.stableStringify;
    ok('el orden de las llaves no importa', s({ a: 1, b: { c: 2, d: [1, { e: 3, f: 4 }] } }) === s({ b: { d: [1, { f: 4, e: 3 }], c: 2 }, a: 1 }));
    ok('undefined se omite como en JSON', s({ a: 1, b: undefined }) === s({ a: 1 }));
    ok('el orden de un ARREGLO sí importa', s([1, 2]) !== s([2, 1]));

    const v = vehiculoBase();
    A.stampRevisions([v], '2026-09-22T00:00:00.000Z');
    ok('un vehículo viejo se inicializa SIN inventar fecha (toma registeredAt)', v.updatedAt === '2026-09-20T10:00:00.000Z' && !!v._rev);
    const n0 = A.stampRevisions([v], '2026-09-22T01:00:00.000Z');
    ok('sin cambios no se re-sella', n0 === 0 && v.updatedAt === '2026-09-20T10:00:00.000Z');
    v.testData.datetime = '2026-09-22T08:00';
    const n1 = A.stampRevisions([v], '2026-09-22T02:00:00.000Z');
    ok('una edición local sella updatedAt = ahora', n1 === 1 && v.updatedAt === '2026-09-22T02:00:00.000Z');
    const llegado = comoFirestore(JSON.parse(JSON.stringify(v)));
    const n2 = B.stampRevisions([llegado], '2026-09-22T03:00:00.000Z');
    ok('un vehículo llegado de la nube (otro orden de llaves) NO se re-sella', n2 === 0 && llegado.updatedAt === '2026-09-22T02:00:00.000Z');
}

// ── La primera edición de un vehículo sin _rev (checklist de Liberación) ────
console.log('\n== primera edición de un vehículo anterior a v23.5 ==');
{
    arrancar();
    // Lo que hacía el bug: la huella se tomaba en el PRIMER saveDB, ya con la
    // edición adentro, así que esa edición nunca se sellaba como nueva.
    const nube = vehiculoBase(); delete nube._rev; delete nube.updatedAt;
    const aqui = JSON.parse(JSON.stringify(nube));
    ok('al cargar se fija la huella base', A.revInitMissing([aqui]) === 1 && !!aqui._rev && aqui.updatedAt === '2026-09-20T10:00:00.000Z');
    ok('una segunda carga no la vuelve a tocar', A.revInitMissing([aqui]) === 0);
    aqui.testData.releaseChecklist = { objects: { kds: 'ok' } };
    const n = A.stampRevisions([aqui], '2026-09-23T18:00:00.000Z');
    ok('el primer toque se sella como edición nueva', n === 1 && aqui.updatedAt === '2026-09-23T18:00:00.000Z');
    const r = A._fbMergeVehicle(aqui, nube);
    ok('y le gana a la copia vieja de la nube (no se borra la marca)', r.from === 'local' && !!r.vehicle.testData.releaseChecklist);
}

// ── Borrar un vehículo: no resucita con el sync (v24.2) ───────────────────
console.log('\n== borrar un vehículo sobrevive al sync ==');
{
    arrancar();
    reloj += 60000;
    const v = A.db.vehicles[0];
    A.vehicleTombstone(v);
    A.db.vehicles = A.db.vehicles.filter(x => x !== v);
    guardar(A);
    correr();
    ok('B también lo retira', B.db.vehicles.length === 0, JSON.stringify(B.db.vehicles.map(x => x.vin)));
    ok('B recibe la marca de borrado', (B.db.deletedVehicles || []).length === 1);
    ok('y no lo re-empuja de vuelta a A', A.db.vehicles.length === 0);

    // Un equipo con código viejo re-empuja el documento CON el vehículo y SIN marcas.
    A.pushes.length = 0;
    nube('B', 'cop15', comoFirestore({ vehicles: [vehiculoBase()], lastId: 3 }));
    correr();
    ok('A no lo vuelve a agregar', A.db.vehicles.length === 0);
    ok('A sube su marca otra vez (la nube la había perdido)', A.pushes.includes('cop15'));

    // Un alta NUEVA del mismo VIN (re-ensayo) sí se conserva.
    const otra = vehiculoBase(); otra.id = 'v9'; otra.registeredAt = '2026-09-25T09:00:00.000Z';
    ok('un alta posterior del mismo VIN NO empata con la marca', !A.vehicleIsTombstoned(otra, A.db.deletedVehicles));
    const mismoRegistro = vehiculoBase(); mismoRegistro.id = 'otro-id';
    ok('el mismo registro con otro id (VIN + registeredAt) SÍ empata', A.vehicleIsTombstoned(mismoRegistro, A.db.deletedVehicles));
    ok('la unión no repite marcas', A.vehicleTombstonesUnion(A.db.deletedVehicles, B.db.deletedVehicles).length === 1);
}

// ── _fbMergeVehicle ────────────────────────────────────────────────────────
console.log('\n== _fbMergeVehicle ==');
{
    arrancar();
    const viejo = vehiculoBase();
    viejo.updatedAt = '2026-09-22T01:00:00.000Z';
    const nuevo = JSON.parse(JSON.stringify(viejo));
    nuevo.testData.datetime = '2026-09-22T08:00';
    nuevo.updatedAt = '2026-09-22T02:00:00.000Z';
    // El viejo tiene una entrada de timeline que el nuevo no:
    viejo.timeline.push({ timestamp: '2026-09-22T00:30:00.000Z', action: 'Datos de prueba actualizados' });

    const r1 = A._fbMergeVehicle(viejo, nuevo);
    ok('gana la edición más reciente aunque tenga MENOS timeline (#131)', r1.from === 'remote' && r1.vehicle.testData.datetime === '2026-09-22T08:00');
    ok('la bitácora se une: no se pierde la entrada del perdedor', r1.vehicle.timeline.length === 2);
    const r2 = A._fbMergeVehicle(nuevo, viejo);
    ok('SIMÉTRICA: (a,b) y (b,a) dan el mismo contenido', A.stableStringify(r1.vehicle) === A.stableStringify(r2.vehicle));

    const x = vehiculoBase(), y = vehiculoBase();
    x.testData.odometer = 10; y.testData.odometer = 20;
    const e1 = A._fbMergeVehicle(x, y), e2 = A._fbMergeVehicle(y, x);
    ok('empate total: los dos equipos eligen LA MISMA versión', A.stableStringify(e1.vehicle) === A.stableStringify(e2.vehicle));
    ok('iguales salvo orden de llaves → "equal"', A._fbMergeVehicle(x, comoFirestore(JSON.parse(JSON.stringify(x)))).from === 'equal');
}

// ── #131: una edición en A llega a B ──────────────────────────────────────
console.log('\n== #131: la hora guardada en un equipo aparece en el otro ==');
{
    arrancar();
    reloj += 60000;
    A.db.vehicles[0].testData.datetime = '2026-09-22T08:15';
    guardar(A);
    correr();
    ok('B recibe la hora de recepción', B.db.vehicles[0].testData.datetime === '2026-09-22T08:15');
    ok('sin aviso de "conflicto"', !B.toasts.some(t => /conflicto/i.test(t)), JSON.stringify(B.toasts));
    ok('A y B terminan con el mismo vehículo', A.stableStringify(A.db.vehicles) === B.stableStringify(B.db.vehicles));

    // Y B, que NO tocó nada, guarda por otra razón (p. ej. otro vehículo): no revierte.
    reloj += 60000;
    B.db.vehicles.push(Object.assign(vehiculoBase(), { id: 'v2', vin: 'KNA999' }));
    guardar(B);
    correr();
    ok('un guardado posterior de B no regresa la hora vieja a A', A.db.vehicles[0].testData.datetime === '2026-09-22T08:15');
    ok('y A recibe el vehículo nuevo de B', A.db.vehicles.some(v => v.vin === 'KNA999'));
}

// ── #132: la conversación TERMINA ─────────────────────────────────────────
console.log('\n== #132: sin bucle de avisos ni de empujes ==');
{
    arrancar();
    reloj += 60000;
    A.db.vehicles[0].testData.odometer = 42;
    guardar(A);
    const eventos = correr(500);
    ok('la conversación termina sola (cola vacía)', cola.length === 0, 'eventos=' + eventos);
    const totalPushes = A.pushes.length + B.pushes.length;
    ok('empujes totales acotados (≤ 2)', totalPushes <= 2, 'A=' + A.pushes + ' B=' + B.pushes);
    ok('B muestra a lo más UN aviso', B.toasts.length <= 1, JSON.stringify(B.toasts));
    ok('A no muestra avisos por su propio cambio', A.toasts.length === 0, JSON.stringify(A.toasts));

    // El plan, idéntico salvo el orden de llaves, NO es "plan actualizado".
    B.toasts.length = 0;
    guardarPlan(A);
    correr(500);
    ok('plan sin cambios reales: cero avisos en B', B.toasts.length === 0, JSON.stringify(B.toasts));
    ok('y B no re-empuja', B.pushes.filter(c => c === 'testplan').length === 0);

    // Ediciones cruzadas de los dos lados, varias veces: sigue convergiendo.
    for (let i = 0; i < 5; i++) {
        reloj += 10000;
        A.db.vehicles[0].testData.odometer = 100 + i; guardar(A);
        reloj += 10000;
        B.db.vehicles[0].testData.preconditioning.tirePressurePsi = 30 + i; guardar(B);
    }
    correr(2000);
    ok('tras 10 ediciones cruzadas la cola se vacía', cola.length === 0);
    ok('los dos equipos convergen al mismo contenido', A.stableStringify(A.db.vehicles) === B.stableStringify(B.db.vehicles));
    ok('toasts acotados por minuto (≤ 3 por equipo en ~2 min)', A.toasts.length <= 3 && B.toasts.length <= 3, 'A=' + A.toasts.length + ' B=' + B.toasts.length);
}

// ── Plan semanal: mover una fila viaja, y no se duplica ───────────────────
console.log('\n== Plan semanal: mover y palomear ==');
{
    arrancar();
    reloj += 60000;
    A.tpState.weeklyPlans[0].items[0].testDay = 'Jue';
    guardarPlan(A);
    correr();
    const itemsB = B.tpState.weeklyPlans[0].items;
    ok('mover una fila en A la mueve en B', itemsB.find(i => i.uid === 'u1').testDay === 'Jue');
    ok('sin duplicarla (empata por uid, no por desc+día)', itemsB.length === 2, 'n=' + itemsB.length);

    // Palomear en B mientras A mueve otra: ninguna palomita se pierde.
    reloj += 60000;
    B.tpState.weeklyPlans[0].items[1].completed = true;
    guardarPlan(B);
    reloj += 1000;
    A.tpState.weeklyPlans[0].items[0].testDay = 'Vie';
    guardarPlan(A);
    correr();
    const fA = A.tpState.weeklyPlans[0].items, fB = B.tpState.weeklyPlans[0].items;
    ok('la palomita de B sobrevive en A', fA.find(i => i.uid === 'u2').completed === true);
    ok('y en B', fB.find(i => i.uid === 'u2').completed === true);
    ok('el movimiento de A llega a B', fB.find(i => i.uid === 'u1').testDay === 'Vie');
}

// ── Disyuntor ──────────────────────────────────────────────────────────────
console.log('\n== _fbPushBack: disyuntor ==');
{
    arrancar();
    let n = 0;
    for (let i = 0; i < 20; i++) { A._fbPushBack('cop15'); correr(1); reloj += 2000; n = A.pushes.length; }
    ok('a lo más FB_PUSHBACK_MAX re-empujes por ventana', n <= 4, 'n=' + n);
}

// ── cascadeThreeWay: no pisar lo que no tocaste ────────────────────────────
console.log('\n== cascadeThreeWay (Operación) ==');
{
    arrancar();
    const tw = A.cascadeThreeWay;
    const base   = { datetime: '', odometer: 5, preconditioning: { tirePressurePsi: 33, cycle: '' } };
    const theirs = { datetime: '2026-09-22T08:15', odometer: 5, preconditioning: { tirePressurePsi: 33, cycle: '' }, gasResults: { x: 1 } };
    const mine   = { datetime: '', odometer: 5, preconditioning: { tirePressurePsi: 35, cycle: '' }, gasResults: { x: 1 } };
    const kept = [];
    const out = tw(base, mine, theirs, '', kept);
    ok('campo NO tocado aquí → gana lo de otro equipo', out.datetime === '2026-09-22T08:15');
    ok('campo tocado aquí → gana lo mío', out.preconditioning.tirePressurePsi === 35);
    ok('se reporta qué se conservó', kept.length === 1 && kept[0] === 'datetime', JSON.stringify(kept));
    ok('lo que no es del formulario pasa intacto', out.gasResults.x === 1);
    const out2 = tw({ a: 'x' }, { a: '' }, { a: 'x' }, '', []);
    ok('borrar un campo a propósito se respeta', out2.a === '');
    ok('vacío, null y undefined cuentan igual', tw({ a: null }, { a: '' }, { a: 'z' }, '', []).a === 'z');
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
