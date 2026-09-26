// ╔══════════════════════════════════════════════════════════════════════╗
// ║  2.0.0 — configs manuales sincronizadas + Pulso/Lo siguiente de HOY ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Todas las funciones probadas aquí son PURAS; se extraen de su archivo en vez
// de cargarlo entero (app.js y panel.js arrancan la app al parsear).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FUENTES = {};
function fuente(f) { return FUENTES[f] || (FUENTES[f] = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')); }

/** Extrae una función de nivel superior por nombre, emparejando llaves. */
function extraer(archivo, nombre) {
    const SRC = fuente(archivo);
    const re = new RegExp('(?:^|\\n)function\\s+' + nombre + '\\s*\\(');
    const m = re.exec(SRC);
    if (!m) throw new Error('no encontré function ' + nombre + ' en ' + archivo);
    let i = SRC.indexOf('{', m.index + m[0].length - 1), d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (d === 0) break; }
    }
    return SRC.slice(m.index + (SRC[m.index] === '\n' ? 1 : 0), i + 1);
}
/** Extrae una `var NOMBRE = …;` de nivel superior (arreglos/objetos literales). */
function extraerVar(archivo, nombre) {
    const SRC = fuente(archivo);
    const i0 = SRC.indexOf('\nvar ' + nombre + ' =');
    if (i0 < 0) throw new Error('no encontré var ' + nombre);
    let i = SRC.indexOf('=', i0) + 1;
    while (SRC[i] === ' ') i++;
    const abre = SRC[i], cierra = abre === '[' ? ']' : '}';
    let d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === abre) d++;
        else if (SRC[i] === cierra) { d--; if (d === 0) break; }
    }
    return SRC.slice(i0 + 1, i + 1) + ';';
}

const ctx = { console, Date, JSON, Object, Array, String, Number, Math, isNaN, parseInt, parseFloat };
vm.createContext(ctx);
[['app.js', 'stableStringify'], ['app.js', '_manualCfgKey'], ['app.js', 'manualConfigsUnion'],
 ['app.js', 'manualConfigsNewTo'], ['app.js', 'dashNextUp'], ['app.js', 'dashCatSummary'],
 ['panel.js', '_labPulseDays'], ['panel.js', 'labPulseCompute']]
    .forEach(([f, n]) => vm.runInContext(extraer(f, n), ctx, { filename: f }));
vm.runInContext(extraerVar('panel.js', 'LAB_PULSE_PIPELINE'), ctx);
vm.runInContext(extraerVar('app.js', 'DASH_CAT_ORDER'), ctx);

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const J = x => JSON.stringify(x);

console.log('\n== manualConfigsUnion: las configs manuales entre equipos ==');
{
    const U = ctx.manualConfigsUnion;
    const a = { codigo_config_text: 'X', Modelo: 'K5', updatedAt: '2026-09-01T00:00:00Z' };
    const b = { codigo_config_text: 'X', Modelo: 'K5 GT', updatedAt: '2026-09-02T00:00:00Z' };
    ok('gana la edición más reciente', U([a], [b])[0].Modelo === 'K5 GT');
    ok('es simétrica', J(U([a], [b])) === J(U([b], [a])));
    const del = { codigo_config_text: 'X', Modelo: 'K5', updatedAt: '2026-09-01T00:00:00Z', deleted: true };
    ok('en empate de fecha gana la marca de borrado (no resucita)', U([a], [del])[0].deleted === true && U([del], [a])[0].deleted === true);
    const otra = { codigo_config_text: 'Y', Modelo: 'K8', updatedAt: '' };
    ok('une códigos distintos sin perder ninguno', U([a], [otra]).length === 2);
    ok('ignora filas sin código', U([a, { Modelo: 'sin código' }], []).length === 1);
    const c1 = { codigo_config_text: 'Z', Modelo: 'A', updatedAt: '' }, c2 = { codigo_config_text: 'Z', Modelo: 'B', updatedAt: '' };
    ok('empate total: desempate determinista (los dos equipos eligen lo mismo)', J(U([c1], [c2])) === J(U([c2], [c1])));

    const N = ctx.manualConfigsNewTo;
    ok('manualConfigsNewTo: lo remoto nuevo cuenta', N([a], [b]) === true);
    ok('manualConfigsNewTo: lo mismo no cuenta', N([a], [JSON.parse(J(a))]) === false);
    ok('manualConfigsNewTo: lo remoto VIEJO no cuenta', N([b], [a]) === false);
    ok('manualConfigsNewTo: una marca de borrado nueva sí cuenta',
        N([a], [Object.assign({}, a, { deleted: true, updatedAt: '2026-09-03T00:00:00Z' })]) === true);
}

console.log('\n== labPulseCompute: el Pulso de HOY ==');
{
    const P = ctx.labPulseCompute;
    const p = P({
        today: '2026-09-25',
        statuses: ['registered', 'testing', 'testing', 'archived', 'ready-release', 'pending-approval'],
        releasedDates: ['2026-09-25', '2026-09-25', '2026-09-24', '2026-09-19', '2026-09-18'],
        board: { plan: {}, accepted: true, weekDate: '2026-09-21',
                 kpis: { planeadas: 6, hechas: 4, noPlaneadas: 1, riesgo: 1, atencion: 2 } },
        coverage: { pct: 62, pctVerified: 55, vigentes: 40, ok: 25 },
        alerts: [{ level: 'CRITICA' }, { level: 'ALTA' }, { level: 'ALTA' }, { level: 'MEDIA' }],
        lowGases: 2, calOverdue: 1
    });
    ok('el pipeline no cuenta archivados', p.active === 5);
    ok('el pipeline cuenta por etapa', p.pipeline.filter(s => s.key === 'testing')[0].n === 2);
    ok('7 días de serie terminando hoy', p.released.series.length === 7 && p.released.series[6].date === '2026-09-25');
    ok('liberados hoy', p.released.today === 2);
    ok('lo que cae fuera de los 7 días no entra', p.released.week === 4, 'week=' + p.released.week);
    ok('promedio de los 6 días previos', p.released.avgPrev === 0.3, 'avg=' + p.released.avgPrev);
    ok('el avance es del COMPROMISO: las no planeadas no inflan lo hecho', p.week.doneCommitted === 3 && p.week.pct === 50);
    ok('riesgo y atención vienen del tablero', p.week.risk === 1 && p.week.attention === 2);
    ok('la cobertura trae el verificado al lado', p.coverage.pct === 62 && p.coverage.pctVerified === 55);
    ok('las alertas se cuentan por nivel', p.attention.crit === 1 && p.attention.high === 2 && p.attention.total === 4);

    const vacio = P({ today: '2026-03-01' });
    ok('sin datos no revienta y no inventa', vacio.active === 0 && vacio.week.hasPlan === false && vacio.released.today === 0);
    ok('la serie cruza el cambio de mes', vacio.released.series[0].date === '2026-02-23');
}

console.log('\n== dashNextUp / dashCatSummary: lo siguiente de HOY ==');
{
    const acts = [
        { id: 1, cat: 'plan', status: 'pendiente', urgency: 1 },
        { id: 2, cat: 'vehiculos', status: 'hecho', urgency: 9 },
        { id: 3, cat: 'inventario', status: 'atrasado', urgency: 0 },
        { id: 4, cat: 'vehiculos', status: 'encurso', urgency: 3 },
        { id: 5, cat: 'plan', status: 'pendiente', urgency: 3 }
    ];
    const n = ctx.dashNextUp(acts, 3).map(a => a.id);
    ok('lo atrasado primero, luego por urgencia, lo hecho fuera', J(n) === J([3, 4, 5]), J(n));
    ok('con empate conserva el orden original', J(ctx.dashNextUp(acts, 5).map(a => a.id)) === J([3, 4, 5, 1]));
    const s = ctx.dashCatSummary(acts);
    const veh = s.filter(c => c.cat === 'vehiculos')[0];
    ok('el resumen por categoría cuenta pendientes sin lo hecho', veh.total === 2 && veh.pend === 1);
    ok('y marca las atrasadas', s.filter(c => c.cat === 'inventario')[0].late === 1);
    ok('las categorías vacías no generan tile', !s.some(c => c.cat === 'manuales'));
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron\n');
process.exit(fallaron ? 1 : 0);
