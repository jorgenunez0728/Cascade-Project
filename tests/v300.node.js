// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.0.0 — una sola señal: alertas agrupadas, rojo solo lo que detiene ║
// ║  una prueba, y "Te toca" sin la deuda acumulada                      ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Las funciones probadas son PURAS: se extraen de su archivo (app.js y panel.js
// arrancan la app al parsear).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FUENTES = {};
function fuente(f) { return FUENTES[f] || (FUENTES[f] = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')); }
function extraer(archivo, nombre) {
    const SRC = fuente(archivo);
    const m = new RegExp('(?:^|\\n)function\\s+' + nombre + '\\s*\\(').exec(SRC);
    if (!m) throw new Error('no encontré function ' + nombre + ' en ' + archivo);
    let i = SRC.indexOf('{', m.index + m[0].length - 1), d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (d === 0) break; }
    }
    return SRC.slice(m.index + (SRC[m.index] === '\n' ? 1 : 0), i + 1);
}
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

const ctx = { console, Date, JSON, Object, Array, String, Number, Math,
    escapeHtml: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
vm.createContext(ctx);
['PN_ALERT_COLORS', 'PN_ALERT_KINDS', 'PN_ALERT_LEVEL_ORDER'].forEach(n => vm.runInContext(extraerVar('panel.js', n), ctx));
['_pnAlert', 'pnAlertLevelRank', 'pnAlertGroups', 'pnAlertGroupCounts', 'pnAlertGroupsHTML', 'labPulseCompute', '_labPulseDays']
    .forEach(n => vm.runInContext(extraer('panel.js', n), ctx));
vm.runInContext(extraerVar('panel.js', 'LAB_PULSE_PIPELINE'), ctx);
vm.runInContext(extraerVar('app.js', 'DASH_DEBT_LABELS'), ctx);
['dashNextUp', 'dashInbox', 'dashDebtSummary'].forEach(n => vm.runInContext(extraer('app.js', n), ctx));

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

console.log('\n== alertas agrupadas (pnAlertGroups) ==');
{
    const A = ctx._pnAlert;
    const alerts = [];
    for (let i = 0; i < 40; i++) alerts.push(A('ALTA', 'cal-vencida', 'Inventario', 'Calibración de Inst' + i + ' VENCIDA hace ' + (10 + i) + ' dias', { days: 10 + i }));
    alerts.push(A('CRITICA', 'cal-vencida-prueba', 'Inventario', 'Calibración de Analizador (Dinamómetro) VENCIDA hace 5 dias', { days: 5 }));
    alerts.push(A('CRITICA', 'doble-ciego', 'COP15', 'VIN 433270: desacuerdo en NOx'));
    for (let i = 0; i < 37; i++) alerts.push(A('MEDIA', 'proy-vencido', 'Proyectos', 'Proyecto P: paso ' + i + ' vencido'));
    alerts.push({ level: 'ALTA', color: '#f59e0b', source: 'Regulaciones', message: 'Límites distintos' });
    const g = ctx.pnAlertGroups(alerts, { calRequired: 49 });
    ok('80 alertas → 5 grupos', g.length === 5, g.map(x => x.key + ':' + x.n).join());
    ok('primero lo que detiene pruebas (rojo)', g[0].level === 'CRITICA' && g[1].level === 'CRITICA');
    const cal = g.find(x => x.kind === 'cal-vencida');
    ok('el título agrupa con su conteo', cal.title === '40 calibraciones vencidas', cal.title);
    ok('la más vieja va primero y se dice', cal.items[0].days === 49 && /hace 49 días/.test(cal.note), cal.note);
    ok('41 de 49 vencidas: se sugiere importar el F11', cal.f11 === true && /F11/.test(cal.note));
    const uno = g.find(x => x.kind === 'doble-ciego');
    ok('un grupo de 1 usa la forma singular', uno.title === 'Desacuerdo en el doble ciego');
    const otro = g.find(x => x.source === 'Regulaciones');
    ok('una alerta sin tipo se agrupa por fuente + nivel y conserva su mensaje', otro.n === 1 && otro.title === 'Límites distintos');
    const c = ctx.pnAlertGroupCounts(g);
    ok('conteos por nivel cuentan grupos', c.CRITICA === 2 && c.ALTA === 2 && c.MEDIA === 1 && c.total === 5, JSON.stringify(c));
    const pocas = ctx.pnAlertGroups([A('ALTA', 'cal-vencida', 'Inventario', 'x', { days: 3 })], { calRequired: 49 });
    ok('pocas vencidas: no se sugiere el F11', !pocas[0].f11);
    const html = ctx.pnAlertGroupsHTML(g);
    ok('el HTML trae un recuadro por grupo, el rojo abierto', (html.match(/class="tp-card pn-al-group/g) || []).length === 5 && /lvl-CRITICA" open/.test(html));
    ok('el HTML escapa los mensajes', !ctx.pnAlertGroupsHTML([{ key: 'k', level: 'ALTA', color: '#f00', icon: '', title: '<b>x</b>', n: 1, items: [{ message: '<script>', color: '#f00' }] }]).includes('<script>'));
    ok('sin alertas: "Sin alertas"', /Sin alertas/.test(ctx.pnAlertGroupsHTML([])));
    ok('el orden por gravedad no manda CRITICA al final', ctx.pnAlertLevelRank('CRITICA') === 0 && ctx.pnAlertLevelRank('X') === 9);
    const p = ctx.labPulseCompute({ today: '2026-10-09', alerts: g });
    ok('el Pulso cuenta grupos, no filas', p.attention.total === 5 && p.attention.crit === 2, JSON.stringify(p.attention));
}

console.log('\n== "Te toca" sin la deuda acumulada (dashInbox) ==');
{
    const acts = [
        { id: 'veh', cat: 'vehiculos', status: 'pendiente', urgency: 2 },
        { id: 'appr', cat: 'calidad', status: 'pendiente', urgency: 3, perm: 'test.approve' },
        { id: 'cal1', cat: 'inventario', status: 'atrasado', urgency: 3, debt: 'cal' },
        { id: 'cal2', cat: 'inventario', status: 'atrasado', urgency: 3, debt: 'cal' },
        { id: 'calP', cat: 'inventario', status: 'atrasado', urgency: 3, debt: '' },
        { id: 'mt', cat: 'inventario', status: 'atrasado', urgency: 3, debt: 'mtto' },
        { id: 'p1', cat: 'proyectos', status: 'atrasado', urgency: 3, debt: 'proy' },
        { id: 'r1', cat: 'inventario', status: 'atrasado', urgency: 3, debt: 'ronda-equipos' },
        { id: 'hecha', cat: 'vehiculos', status: 'hecho', urgency: 1, debt: 'cal' }
    ];
    const box = ctx.dashInbox(acts, { can: () => true, now: '2026-10-09T12:00:00Z' });
    ok('Te toca = solo lo de hoy (y la calibración de un equipo de prueba)', box.items.map(a => a.id).sort().join() === 'appr,calP,veh', box.items.map(a => a.id).join());
    ok('lo acumulado va aparte, sin perderse', box.debt.length === 5);
    const d = ctx.dashDebtSummary(box.debt);
    ok('el resumen cuenta por tipo y no cuenta la ronda como pendiente', d.total === 4 && d.rounds.equipos === true && !d.rounds.proyectos);
    ok('con su texto', d.parts.map(p => p.label).join(' · ') === '2 calibraciones vencidas · 1 mantenimiento vencido · 1 paso de proyecto vencido o bloqueado', d.parts.map(p => p.label).join(' · '));
    const sinPermiso = ctx.dashInbox(acts, { can: p => p !== 'test.approve' });
    ok('lo de otro rol se sigue contando aparte (byRole)', sinPermiso.byRole === 1 && !sinPermiso.items.some(a => a.id === 'appr'));
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron\n');
process.exit(fallaron ? 1 : 0);
