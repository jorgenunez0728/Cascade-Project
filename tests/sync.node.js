// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas de la capa de fusion (js/firebase-sync.js)                 ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Las `_fbMerge*` son PURAS: reciben arrays y devuelven arrays, sin tocar el
// DOM. Eran 4.388 lineas de logica que decide quien gana en un conflicto de dos
// escritores, con CERO pruebas — y un error aqui pierde datos del laboratorio
// en silencio. Este archivo cubre lo que la auditoria de v23.2 encontro roto.
//
// Se extraen las funciones del archivo en vez de cargarlo entero: firebase-sync
// arranca conexiones al parsear.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-sync.js'), 'utf8');

/** Extrae una funcion de nivel superior por nombre, emparejando llaves. */
function extraer(nombre) {
    // Algunas viven anidadas dentro de otra funcion (p.ej. _fbMergeReadings), asi
    // que se permite indentacion. Siguen siendo puras.
    const re = new RegExp('(?:^|\\n)([ \\t]*)function\\s+' + nombre + '\\s*\\(');
    const m = re.exec(SRC);
    if (!m) throw new Error('no encontre function ' + nombre);
    let i = SRC.indexOf('{', m.index + m[0].length - 1);
    let d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (d === 0) break; }
    }
    const start = m.index + (SRC[m.index] === '\n' ? 1 : 0);
    return SRC.slice(start, i + 1).replace(/^[ \t]+/gm, '');
}

const ctx = { console, Date, JSON, Object, Array, String, Number, Math, isNaN, parseInt, parseFloat };
vm.createContext(ctx);
['_fbEquipKey', '_fbMergeByIdNewest', '_fbMergeOperators', '_fbMergeTasks', '_fbMergeReadings',
 '_fbPushDataScore', '_fbPullLocalScore']
    .forEach(n => vm.runInContext(extraer(n), ctx, { filename: 'firebase-sync.js' }));

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── _fbEquipKey: la identidad de un instrumento ────────────────────────────
console.log('\n== _fbEquipKey: identidad de un instrumento ==');
{
    const k = ctx._fbEquipKey;

    ok('prefiere el id estable sobre la serie',
        k({ id: 'eq_th0033', serialNo: 'X1', name: 'Termo' }) === 'id:eq_th0033');
    ok('cae a f11Id si no hay id',
        k({ f11Id: 'F11-12', serialNo: 'X1' }) === 'f11:F11-12');

    // El defecto real: en la semilla F11 muchos equipos traen '-' o 'N/A'.
    ok('"-" NO es una serie: dos equipos distintos NO colisionan',
        k({ serialNo: '-', name: 'Termometro A' }) !== k({ serialNo: '-', name: 'Termometro B' }));
    ok('"N/A" tampoco',
        k({ serialNo: 'N/A', name: 'Bomba 1' }) !== k({ serialNo: 'N/A', name: 'Bomba 2' }));
    ok('una serie de verdad sigue mandando',
        k({ serialNo: '2F150708994', name: 'A' }) === k({ serialNo: '2f150708994', name: 'B' }));

    // Contra la semilla REAL del repo.
    const inv = fs.readFileSync(path.join(__dirname, '..', 'js', 'inventory.js'), 'utf8');
    const equipos = [...inv.matchAll(/\{[^{}]*"id":\s*"eq_[^{}]*\}/g)]
        .map(x => { try { return JSON.parse(x[0]); } catch (e) { return null; } }).filter(Boolean);
    ok('la semilla del F11 se parsea (>=31 instrumentos)', equipos.length >= 31, 'n=' + equipos.length);

    const cuenta = {};
    equipos.forEach(e => { const key = k(e); cuenta[key] = (cuenta[key] || 0) + 1; });
    const colisiones = Object.entries(cuenta).filter(([, v]) => v > 1);
    ok('CERO colisiones sobre la semilla real', colisiones.length === 0, JSON.stringify(colisiones));

    // Y que la clave vieja SI colisionaba (si no, la prueba no prueba nada).
    const vieja = {};
    equipos.forEach(e => { const key = e.serialNo || e.name; vieja[key] = (vieja[key] || 0) + 1; });
    ok('la clave vieja SI colisionaba (la prueba mide algo)',
        Object.values(vieja).some(v => v > 1));
}

// ── _fbMergeByIdNewest: la bitacora de turno ───────────────────────────────
console.log('\n== _fbMergeByIdNewest: bitacora de turno ==');
{
    const m = ctx._fbMergeByIdNewest;
    const A = { id: 'sl_1', timestamp: '2026-09-01T08:00:00Z', notes: 'local A' };
    const B = { id: 'sl_2', timestamp: '2026-09-01T09:00:00Z', notes: 'remota B' };
    const C = { id: 'sl_3', timestamp: '2026-09-01T10:00:00Z', notes: 'local C' };

    ok('une los dos lados sin perder ninguna', m([A, C], [B]).length === 3);
    ok('lo escrito en ESTE dispositivo sobrevive al pull',
        m([A, C], [B]).some(x => x.id === 'sl_3'));
    ok('lo del otro dispositivo tambien llega',
        m([A, C], [B]).some(x => x.id === 'sl_2'));
    ok('el mismo id no se duplica', m([A], [A]).length === 1);

    const viejo = { id: 'sl_9', timestamp: '2026-09-01T08:00:00Z', notes: 'vieja' };
    const nuevo = { id: 'sl_9', timestamp: '2026-09-02T08:00:00Z', notes: 'editada' };
    ok('ante el mismo id gana la mas reciente', m([viejo], [nuevo])[0].notes === 'editada');

    ok('sale ordenada por fecha', eq(m([C, A], [B]).map(x => x.id), ['sl_1', 'sl_2', 'sl_3']));

    const muchas = Array.from({ length: 600 }, (_, i) =>
        ({ id: 'sl_' + i, timestamp: '2026-09-01T00:' + String(i % 60).padStart(2, '0') + ':00Z' }));
    ok('respeta el tope y conserva las mas nuevas', m(muchas, [], 500).length === 500);

    ok('una entrada sin id no se pierde',
        m([{ timestamp: '2026-09-01T08:00:00Z', operator: 'Ana', notes: 'x' }], []).length === 1);
    ok('tolera lados vacios o nulos', m(null, undefined).length === 0);
}

// ── _fbMergeOperators: la identidad de una persona ─────────────────────────
console.log('\n== _fbMergeOperators: identidad de una persona ==');
{
    const m = ctx._fbMergeOperators;
    const local = [{ id: 'op1', name: 'Jorge Nunez', role: 'Administrador', updatedAt: '2026-09-02T00:00:00Z' }];
    const remoto = [{ id: 'op1', name: 'Jorge Nunez', role: 'Tecnico', updatedAt: '2026-09-01T00:00:00Z' }];
    const r = m(local, remoto);
    ok('empata por id y gana el updatedAt mas reciente',
        r.length === 1 && r[0].role === 'Administrador', JSON.stringify(r));

    // El bug historico: 'Jorge Nunez' vs 'Jorge Nunez' con acento sobrevivian duplicados.
    const acento = m(
        [{ id: 'op1', name: 'Jorge Nunez', updatedAt: '2026-09-01T00:00:00Z' }],
        [{ id: 'op1', name: 'Jorge Nunez con acento', updatedAt: '2026-09-02T00:00:00Z' }]);
    ok('un cambio de nombre NO crea un operador duplicado', acento.length === 1, JSON.stringify(acento));

    const nuevo = m(local, [{ id: 'op2', name: 'Ivan', role: 'Tecnico', updatedAt: '2026-09-01T00:00:00Z' }]);
    ok('un operador que solo existe en el remoto se importa', nuevo.length === 2);
}

// ── _fbMergeReadings: no perder lecturas ───────────────────────────────────
console.log('\n== _fbMergeReadings: series de lecturas ==');
{
    const m = ctx._fbMergeReadings;
    const loc = [{ date: '2026-09-01', psi: 1800 }, { date: '2026-09-02', psi: 1700 }];
    const rem = [{ date: '2026-09-01', psi: 1800 }, { date: '2026-09-03', psi: 1600 }];
    const r = m(loc, rem);
    ok('une las series sin perder lecturas', r.length === 3, JSON.stringify(r));

    const humana = m([{ date: '2026-09-05', psi: 1500 }],
                     [{ date: '2026-09-05', psi: 1490, auto: true }]);
    ok('el manometro manda sobre la estimacion automatica',
        humana.length === 1 && humana[0].psi === 1500, JSON.stringify(humana));

    const dos = m([{ date: '2026-09-06', psi: 1400 }], [{ date: '2026-09-06', psi: 1390 }]);
    ok('entre dos humanas del mismo dia gana la local',
        dos.length === 1 && dos[0].psi === 1400, JSON.stringify(dos));
}

// ── Los DOS scores: subir vs. preservar ───────────────────────────────────
console.log('\n== _fbPushDataScore vs _fbPullLocalScore ==');
{
    // Un equipo YA CONFIGURADO (reglas, pesos, soak, disponibilidad) pero que todavia
    // no importa el CSV de produccion. Es una secuencia de puesta en marcha normal.
    ctx.tpState = {
        planData: [], testedList: [], weeklyPlans: [],
        rules: [{ id: 1 }, { id: 2 }], weights: { volume: 40 },
        familyOverrides: { 'F1': {} }, configOverrides: { 'C1': {} },
        weekAvailability: { '2026-09-07': {} }, soak: { byFamily: { 'F1': 24 } },
        weekHistory: [], planHistory: [], rulePresets: [], myContinuity: {}
    };
    ctx.db = { vehicles: [] };
    ctx.invState = { gases: [], equipment: [] };

    ok('PRESERVAR: un equipo configurado NO puntua cero (no es desechable)',
        ctx._fbPullLocalScore('testplan') > 0, 'score=' + ctx._fbPullLocalScore('testplan'));

    // Y la otra mitad, que es la que evita una perdida de datos: `fbPush` escribe el
    // documento ENTERO, asi que subir un tpState con planData vacio reemplazaria el
    // plan de todo el laboratorio.
    ok('SUBIR: ese mismo equipo NO se considera seguro de subir',
        ctx._fbPushDataScore('testplan') === 0, 'score=' + ctx._fbPushDataScore('testplan'));

    ctx.tpState.planData = [{ desc: 'CFG-A' }];
    ok('con dato real de plan, subir SI es seguro', ctx._fbPushDataScore('testplan') > 0);

    ok('los otros modulos ya no devuelven 0 a secas', (() => {
        ctx.pnState = { operators: [{ id: 'op1' }], projects: [], tasks: [], shiftLog: [], shiftReports: [], skillCatalog: [] };
        ctx.copState = { saved: [{ id: 'j1' }], families: {} };
        ctx.homoState = { catalog: [{ mcCode: 'X' }], ipFamilies: [], links: {} };
        return ctx._fbPullLocalScore('panel') > 0 && ctx._fbPullLocalScore('cop') > 0 && ctx._fbPullLocalScore('homolog') > 0;
    })());

    ok('el score de subir NO cuenta panel/cop/homolog (solo los tres nucleo)',
        ctx._fbPushDataScore('panel') === 0 && ctx._fbPushDataScore('cop') === 0);
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exit(fallaron ? 1 : 0);
