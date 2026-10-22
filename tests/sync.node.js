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

const ctx = { console, Date, JSON, Object, Array, String, Number, Math, isNaN, parseInt, parseFloat, FB_PRESENCE_STALE_MS: 5 * 60 * 1000,
    FB_VEH_DEBOUNCE_MS: 2500, FB_SAVE_TYPE_MS: 1500, FB_SAVE_URGENT_MS: 400, FB_SAVE_BURST_MS: 1200, FB_SAVE_BURST_WINDOW: 3000 };
vm.createContext(ctx);
['_fbEquipKey', '_fbGasKey', '_fbGasIndex', '_fbMergeByIdNewest', '_fbMergeOperators', '_fbMergeTasks', '_fbMergeReadings',
 '_fbPushDataScore', '_fbPullLocalScore', '_fbInvItemDiffers', '_fbMergeInvItem', '_fbMergeEquipCalOut',
 'fbPresenceFor', 'fbPresenceText', 'fbSaveDelay', 'fbVehRemoteWhoFrom']
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

// ── [2.5.0] Política de verificaciones VETS (pnState.vetsChecks) ──────────────
console.log('\n== _fbMergeByIdNewest: politica de verificaciones VETS ==');
{
    const m = ctx._fbMergeByIdNewest;
    const loc = [{ id: 'PM Pre Filter Temp', level: 'desacreditada', reason: 'sensor', timestamp: '2026-09-02T10:00:00Z' }];
    const rem = [{ id: 'PM Pre Filter Temp', level: 'importante', reason: '', timestamp: '2026-09-01T10:00:00Z' },
                 { id: 'CVS Dilution Factor', level: 'informativa', reason: '', timestamp: '2026-09-01T11:00:00Z' }];
    const r = m(loc, rem, 300);
    ok('una entrada por verificacion', r.length === 2);
    ok('gana la clasificacion mas reciente (aunque sea la local)', r.find(x => x.id === 'PM Pre Filter Temp').level === 'desacreditada');
    ok('la que clasifico otro equipo llega', r.some(x => x.id === 'CVS Dilution Factor'));
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-sync.js'), 'utf8');
    ok('la rama panel del pull la fusiona (no la toma entera del remoto)', /pnState\.vetsChecks = _fbMergeByIdNewest\(_localVetsChecks/.test(src));
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

    // [3.18.0] Entre equipos (con opts) es SIMÉTRICA: gana la capturada más tarde.
    const l1 = [{ date: '2026-09-07', psi: 1400, at: '2026-09-07T09:00:00Z' }];
    const r1 = [{ date: '2026-09-07', psi: 1390, at: '2026-09-07T09:05:00Z' }];
    const ch = [];
    const s1 = m(l1, r1, null, { conflicts: ch }), s2 = m(r1, l1, null, {});
    ok('entre equipos gana la capturada más tarde, en los dos sentidos',
        s1[0].psi === 1390 && s2[0].psi === 1390, JSON.stringify([s1, s2]));
    ok('el choque se reporta con el valor que no quedó', ch.length === 1 && ch[0].lost.psi === 1400 && ch[0].lostSide === 'local');
    const s3 = m([{ date: '2026-09-08', psi: 5 }], [{ date: '2026-09-08', psi: 6 }], null, { localAt: '2', remoteAt: '1' });
    ok('sin hora de captura decide la copia editada más recientemente', s3[0].psi === 5);
    ok('una con hora de captura es posterior a una sin ella',
        m([{ date: '2026-09-09', psi: 7 }], [{ date: '2026-09-09', psi: 8, at: 'x' }], null, { localAt: '9' })[0].psi === 8);
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

// ── v24.3: cilindros y tanques ──────────────────────────────────────────────
console.log('\n== v24.3: fusión de cilindros y tanques ==');
{
    // stableStringify vive en app.js; se trae con el mismo extractor.
    const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const m = /\nfunction stableStringify\s*\(/.exec(APP);
    let i = APP.indexOf('{', m.index), d = 0;
    for (; i < APP.length; i++) { if (APP[i] === '{') d++; else if (APP[i] === '}') { d--; if (d === 0) break; } }
    vm.runInContext(APP.slice(m.index + 1, i + 1), ctx, { filename: 'app.js' });

    ok('_fbMergeReadings es de NIVEL SUPERIOR (fbMergeExecute la llama desde otra función)',
        /\nfunction _fbMergeReadings\s*\(/.test(SRC));

    const base = { controlNo: 'CH4-20', formula: 'CH4/Air', status: 'In use', readings: [{ date: '2026-09-14', psi: 1100 }] };
    const remoto = Object.assign({}, base, { readings: base.readings.concat([{ date: '2026-09-21', psi: 1000 }]) });
    ok('una lectura nueva en el otro equipo SÍ es diferencia (antes: currentPsi undefined === undefined)',
        ctx._fbInvItemDiffers(base, remoto));
    ok('mismo contenido con llaves en otro orden NO es diferencia',
        !ctx._fbInvItemDiffers({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }));
    ok('cambiar solo los días de reposición SÍ es diferencia',
        ctx._fbInvItemDiffers(base, Object.assign({}, base, { leadDays: 21 })));

    const loc = Object.assign({}, base, { leadDays: 44, zone: 'A01', updatedAt: '2026-09-20T10:00:00Z',
        readings: [{ date: '2026-09-14', psi: 1100 }, { date: '2026-09-18', psi: 1050 }] });
    const rem = Object.assign({}, base, { leadDays: 21, zone: 'B03', updatedAt: '2026-09-22T10:00:00Z',
        readings: [{ date: '2026-09-14', psi: 1100 }, { date: '2026-09-21', psi: 1000 }] });
    const a = ctx._fbMergeInvItem(loc, rem), b = ctx._fbMergeInvItem(rem, loc);
    ok('campos: gana la edición más reciente (updatedAt)', a.leadDays === 21 && a.zone === 'B03', JSON.stringify({ l: a.leadDays, z: a.zone }));
    ok('lecturas: se UNEN (3 fechas, ninguna perdida)', a.readings.map(r => r.date).join(',') === '2026-09-14,2026-09-18,2026-09-21');
    ok('SIMÉTRICA: los dos equipos llegan a los mismos campos', a.leadDays === b.leadDays && a.zone === b.zone && a.updatedAt === b.updatedAt);
    const x = Object.assign({}, base, { leadDays: 30 }), y = Object.assign({}, base, { leadDays: 40 });
    const xy = ctx._fbMergeInvItem(x, y), yx = ctx._fbMergeInvItem(y, x);
    ok('sin updatedAt: desempate determinista (no "gana lo local")', xy.leadDays === yx.leadDays, xy.leadDays + ' vs ' + yx.leadDays);
    const t1 = { id: 't1', capacity: 400, currentLevel: 226.5, readings: [{ date: '2026-09-21', level: 240 }, { date: '2026-09-25', level: 226.5 }] };
    const t2 = Object.assign({}, t1, { reorderLevel: 200, updatedAt: '2026-09-25T12:00:00Z' });
    ok('tanque: poner el nivel de reorden SÍ es diferencia (antes: mismas lecturas y nivel → ignorado)', ctx._fbInvItemDiffers(t1, t2));
    ok('tanque: el nivel de reorden viaja', ctx._fbMergeInvItem(t1, t2).reorderLevel === 200);
    ok('initialPsi del otro lado no se pierde', ctx._fbMergeInvItem(Object.assign({}, base, { initialPsi: 2200, updatedAt: '1' }), Object.assign({}, base, { updatedAt: '2' })).initialPsi === 2200);
}

console.log('\n== [3.6.0] Enviado a calibrar entre equipos (_fbMergeEquipCalOut) ==');
{
    const out = { at: '2026-10-01', expectedBack: '2026-10-20' };
    const m1 = ctx._fbMergeEquipCalOut({ lastCalDate: '2025-02-21' }, { updatedAt: '2026-10-01T10:00Z' }, { updatedAt: '2026-10-01T12:00Z', calOut: out });
    ok('el envío hecho en otro equipo llega', m1.calOut && m1.calOut.at === '2026-10-01');
    const m2 = ctx._fbMergeEquipCalOut({ lastCalDate: '2025-02-21', calOut: out }, { updatedAt: '2026-10-05T10:00Z' }, { updatedAt: '2026-10-01T12:00Z', calOut: out });
    ok('"regresó" (sin calOut) más reciente gana', !m2.calOut);
    const m3 = ctx._fbMergeEquipCalOut({ lastCalDate: '2026-10-03' }, { updatedAt: '2026-10-01T10:00Z', calOut: out }, { updatedAt: '2026-10-01T09:00Z' });
    ok('una calibración posterior al envío lo termina', !m3.calOut);
    const a = ctx._fbMergeEquipCalOut({}, { updatedAt: '1', calOut: out }, { updatedAt: '2' });
    const b = ctx._fbMergeEquipCalOut({}, { updatedAt: '2' }, { updatedAt: '1', calOut: out });
    ok('simétrica: los dos equipos llegan a lo mismo', !a.calOut && !b.calOut);
}

console.log('\n== [3.18.0] Quién está aquí (fbPresenceFor / fbPresenceText) ==');
{
    const now = Date.parse('2026-10-22T15:00:00Z');
    const hace = s => new Date(now - s * 1000).toISOString();
    const rec = {
        dev_yo:   { device: 'dev_yo', operator: 'Jorge', entity: 'veh:7', at: hace(5) },
        dev_ana:  { device: 'dev_ana', operator: 'Ana', entity: 'veh:7', screen: 'Liberación', editing: true, at: hace(20) },
        dev_ana2: { device: 'dev_ana2', operator: 'Ana', entity: 'veh:7', screen: 'Operación', at: hace(200) },
        dev_beto: { device: 'dev_beto', operator: 'Beto', entity: 'veh:9', at: hace(10) },
        dev_viejo:{ device: 'dev_viejo', operator: 'Carla', entity: 'veh:7', at: hace(6 * 60) },
        dev_tab:  { device: 'dev_tab', operator: '', deviceName: 'Tablet celda 2', entity: 'veh:7', at: hace(30) }
    };
    const l = ctx.fbPresenceFor(rec, 'veh:7', 'dev_yo', now);
    ok('presencia: sin este equipo, sin los de otro vehículo y sin los de > 5 min', l.map(p => p.operator || p.deviceName).join(',') === 'Ana,Tablet celda 2', JSON.stringify(l));
    ok('presencia: una persona en dos equipos sale una vez (la más reciente)', l.filter(p => p.operator === 'Ana').length === 1 && l[0].screen === 'Liberación');
    ok('presencia: un reloj adelantado también caduca', ctx.fbPresenceFor({ x: { device: 'x', entity: 'e', at: new Date(now + 10 * 60000).toISOString() } }, 'e', 'yo', now).length === 0);
    ok('presencia: sin entidad, nadie', ctx.fbPresenceFor(rec, null, 'dev_yo', now).length === 0);
    const t1 = ctx.fbPresenceText([l[0]], 'veh:7');
    ok('texto: uno, con pantalla y "capturando"', t1.text === 'Ana también está aquí (Liberación, capturando)' && t1.editing, t1.text);
    const t2 = ctx.fbPresenceText(l, 'veh:7');
    ok('texto: dos', t2.text === 'Ana y Tablet celda 2 también están aquí (capturando)', t2.text);
    ok('texto: dice que no se bloquea nada', /No se bloquea nada/.test(t2.title));
    const r1 = ctx.fbPresenceText([{ operator: 'Beto', progress: '12/30' }], 'ronda:gases:2026-10-22:am');
    ok('texto: ronda con avance', r1.text === 'Beto también hace esta ronda · va 12/30', r1.text);
    const r2 = ctx.fbPresenceText([{ operator: 'Beto', progress: '12/30' }, { operator: 'Ana', progress: '3/30' }], 'ronda:gases:2026-10-22:am');
    ok('texto: ronda con dos', r2.text === 'Beto (12/30) y Ana (3/30) también hacen esta ronda', r2.text);
    ok('texto: nadie → vacío', ctx.fbPresenceText([], 'veh:7').text === '');
}

console.log('\n== [3.19.0] Lo puntual sube rápido (fbSaveDelay) y quién cambió (fbVehRemoteWhoFrom) ==');
{
    const D = ctx.fbSaveDelay, t = 1000000;
    ok('tecleando: vehículos esperan lo de siempre (2.5 s)', D('veh', t, t - 500, 0) === 2500);
    ok('tecleando: Plan/Consumibles esperan lo de siempre (2 s)', D('mod', t, t - 500, 0) === 2000);
    ok('acción puntual: 400 ms', D('veh', t, t - 5000, 0) === 400 && D('mod', t, 0, 0) === 400);
    ok('ráfaga de puntuales: se juntan un poco (1.2 s)', D('veh', t, 0, t - 1000) === 1200);
    ok('pasada la ráfaga vuelve a 400 ms', D('veh', t, 0, t - 4000) === 400);
    const W = ctx.fbVehRemoteWhoFrom, now = Date.parse('2026-10-22T15:00:00Z');
    ok('quién: el operador de la presencia reciente', W('dev_b', 'dev_a', { operator: 'Ana', at: '2026-10-22T14:55:00Z' }, 'Tablet 2', now) === 'Ana');
    ok('quién: presencia vieja → nombre del equipo', W('dev_b', 'dev_a', { operator: 'Ana', at: '2026-10-22T10:00:00Z' }, 'Tablet 2', now) === 'Tablet 2');
    ok('quién: sin datos → "otro equipo"', W('dev_b', 'dev_a', null, '', now) === 'otro equipo');
    ok('quién: lo escribió este equipo → vacío', W('dev_a', 'dev_a', null, '', now) === '');
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exit(fallaron ? 1 : 0);
