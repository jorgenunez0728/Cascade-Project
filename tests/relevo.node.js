// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.25.0] Desde tu última vez — relevoDigest (PURA) y su ficha.        ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const prefs = {};
const ctx = {
    console: { log: console.log, warn: noop, error: console.error }, Date, JSON, Object, Array, String, Number, Math, RegExp, Error,
    isNaN, isFinite, parseInt, parseFloat, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop,
                createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), body: { appendChild: noop, classList: { add: noop, remove: noop } } },
    escapeHtml: esc,
    uiPref: (k, v) => (v === undefined ? prefs[k] : (prefs[k] = v)),
    CONFIG: { statusLabels: { registered: 'Registrado', 'in-progress': 'En curso', testing: 'En prueba',
                              'ready-release': 'Listo para liberar', 'pending-approval': 'Pendiente de aprobación', archived: 'Archivado' } },
    db: { vehicles: [] }, invState: { gases: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['ficha.js', 'relevo.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

const SINCE = '2026-09-29T23:00:00.000Z';
const antes = h => new Date(Date.parse(SINCE) - h * 3600e3).toISOString();
const despues = h => new Date(Date.parse(SINCE) + h * 3600e3).toISOString();
const ev = (action, name, h, entity, details) => ({ id: action + h + name, ts: despues(h), user: { name, role: '' }, mod: 'x', action, entity: entity || {}, details: details || '' });

const vehicles = [
    { id: 1, vin: 'KNA0000000000001', status: 'pending-approval', registeredAt: antes(48),
      timeline: [{ timestamp: antes(20), data: { status: 'in-progress' } }, { timestamp: despues(2), action: 'Enviado a Aprobación', data: { status: 'pending-approval' } }] },
    { id: 2, vin: 'KNA0000000000002', status: 'registered', registeredAt: despues(1), timeline: [] },
    { id: 3, vin: 'KNA0000000000003', status: 'testing', registeredAt: antes(48),
      timeline: [{ timestamp: antes(10), data: { status: 'testing' } }, { timestamp: despues(3), action: 'Datos de prueba actualizados', data: {} }] },
    { id: 4, vin: 'KNA0000000000004', status: 'ready-release', registeredAt: antes(48),
      timeline: [{ timestamp: antes(5), data: { status: 'pending-approval' } },
                 { timestamp: despues(4), action: 'Devuelto al liberador', data: { status: 'ready-release', reason: 'NOx no coincide' } }] }
];
const events = [
    ev('login', 'Ana', 1, { type: 'operator', label: 'Ana' }),
    ev('gas_reading', 'Ana', 1, { id: 'g1', label: 'CO-50' }), ev('gas_reading', 'Ana', 2, { id: 'g2', label: 'CO-20' }),
    ev('gas_reading', 'Beto', 3, { id: 'g3', label: 'NO-10' }),
    { id: 'viejo', ts: antes(1), user: { name: 'Ana' }, action: 'week_accepted', entity: { label: '2026-09-28' } },
    ev('week_accepted', 'Jorge Núñez', 2, { label: '2026-10-05' }),
    ev('week_accepted', 'Ana', 5, { label: '2026-10-05' }),
    ev('calibracion_registrada', 'Beto', 6, { type: 'equipment', id: 'e9', label: 'Balanza' }, 'Cert: C-1'),
    ev('proyecto_paso_completado', 'Ana', 7, { id: 'p1', label: 'Túnel' }, 'Cotizar'),
    ev('proyecto_nota', 'Beto', 8, { id: 'p1', label: 'Túnel' }, 'Llega el lunes'),
    ev('vehicle_deleted', 'Ana', 9, { type: 'vehicle', id: 77, label: 'KNAGONE' }),
    ev('retro_edit', 'Ana', 9, { type: 'vehicle', id: 1, label: 'KNA0000000000001' })
];
const gases = [
    { id: 'gL', formula: 'CO/N2', controlNo: 'CO-5', status: 'In use', readings: [{ date: despues(5).slice(0, 10), psi: 150 }] },
    { id: 'gV', formula: 'NO/N2', controlNo: 'NO-1', status: 'In use', readings: [{ date: '2026-09-01', psi: 100 }] }
];
const src = { events, vehicles, gases, isLow: g => g.readings[g.readings.length - 1].psi < 200, statusLabels: ctx.CONFIG.statusLabels };

console.log('\n== relevoVehicleStatusAt ==');
ok('estado en un instante sale de la línea de tiempo', ctx.relevoVehicleStatusAt(vehicles[0], SINCE) === 'in-progress');
ok('sin cambios previos = registrado', ctx.relevoVehicleStatusAt({ registeredAt: antes(3), timeline: [] }, SINCE) === 'registered');
ok('dado de alta después = no existía', ctx.relevoVehicleStatusAt(vehicles[1], SINCE) === null);

console.log('\n== relevoDigest ==');
const d = ctx.relevoDigest(src, SINCE, 'jorge nunez');
const g = k => (d.groups.find(x => x.key === k) || { lines: [] });
const txt = k => g(k).lines.map(l => l.text);
ok('vehículo: cambio neto de estado', txt('vehiculos').includes('KNA0000000000001: En curso → Pendiente de aprobación'), JSON.stringify(txt('vehiculos')));
ok('vehículo nuevo lo dice', txt('vehiculos').includes('KNA0000000000002: nuevo · Registrado'));
ok('solo "datos actualizados" sin cambio de estado NO entra', !txt('vehiculos').some(t => t.includes('0003')));
const dev = g('vehiculos').lines.find(l => /0004/.test(l.text));
ok('devuelto al liberador: en ámbar y con motivo', dev && dev.tone === 'warn' && /devuelto: NOx no coincide/.test(dev.text), JSON.stringify(dev));
ok('lo ámbar va antes que lo demás', g('vehiculos').lines.findIndex(l => l.tone !== 'warn') > g('vehiculos').lines.lastIndexOf(dev) || g('vehiculos').lines.slice(0, 2).every(l => l.tone === 'warn'));
ok('cada cambio de estado abre la ficha del vehículo', g('vehiculos').lines.filter(l => /KNA0/.test(l.text)).every(l => l.link && l.link.kind === 'vehiculo'));
ok('lo anterior a tu última vez no entra', !txt('plan').some(t => t.includes('2026-09-28')));
ok('tus propios cambios no entran (sin distinguir acentos ni mayúsculas)', txt('plan').length === 1 && /^Ana aceptó la semana/.test(txt('plan')[0]), JSON.stringify(txt('plan')));
ok('entrar y salir de sesión no es relevo', !JSON.stringify(d.groups).includes('login'));
const lect = g('consumibles').lines.find(l => /lecturas de gases/.test(l.text));
ok('tres lecturas son UNA línea, con quiénes', lect && lect.text === '3 lecturas de gases' && lect.who === 'Ana, Beto', JSON.stringify(lect));
const cal = g('consumibles').lines.find(l => /calibración/.test(l.text));
ok('calibración: abre la ficha del instrumento', cal && cal.link && cal.link.kind === 'instrumento' && cal.link.ref === 'e9');
ok('cilindro con lectura nueva y bajo: aviso en ámbar que abre su ficha',
    g('consumibles').lines.some(l => /CO-5 quedó bajo/.test(l.text) && l.tone === 'warn' && l.link.ref === 'gL'));
ok('un cilindro bajo sin lectura nueva no se repite', !g('consumibles').lines.some(l => /NO-1/.test(l.text)));
const pj = g('proyectos').lines;
ok('por proyecto, una línea con lo que pasó', pj.length === 1 && pj[0].text === 'Túnel: 1 paso completado, 1 nota' && pj[0].link.ref === 'p1', JSON.stringify(pj));
const borrado = txt('vehiculos').find(t => /KNAGONE/.test(t));
ok('un vehículo borrado se dice, sin enlace a una ficha que no existe',
    borrado && !g('vehiculos').lines.find(l => /KNAGONE/.test(l.text)).link);
ok('retro_edit de un vehículo vivo sí enlaza', g('vehiculos').lines.find(l => /retroactivos/.test(l.text)).link.ref === 1);
// 3 cambios de estado + borrado + retro + semana + 3 lecturas + calibración + cilindro bajo + 2 del proyecto
ok('total cuenta eventos, no líneas', d.total === 3 + 1 + 1 + 1 + 3 + 1 + 1 + 2, String(d.total));
ok('personas ordenadas por cuántos cambios', d.people[0].name === 'Ana' && !d.people.some(p => /Jorge/.test(p.name)), JSON.stringify(d.people));
ok('el orden de los grupos es el de lectura', d.groups.map(x => x.key).join(',') === 'vehiculos,plan,consumibles,proyectos');

const muchos = Array.from({ length: 9 }, (_, i) => ev('mtto_ejecutado', 'Ana', i + 1, { label: 'Act ' + i }));
const dm = ctx.relevoDigest({ events: muchos }, SINCE, '');
ok('más de 6 líneas: se cortan con "y N más"', dm.groups[0].lines.length === 6 && dm.groups[0].more === 3);
ok('sin nada después de tu última vez: total 0', ctx.relevoDigest({ events: [events[4]], vehicles: [] }, SINCE, 'x').total === 0);

console.log('\n== La ficha del relevo ==');
ctx.db.vehicles = vehicles; ctx.auditGetView = () => events; ctx.invState.gases = [];
const m = ctx.fichaModel('relevo', SINCE);
ok('es un tipo registrado de la ficha', m && m.kind === 'relevo' && m.groups.length >= 3);
const h = ctx.fichaHTML(m);
ok('las líneas con ficha son botones que la abren encima', /class="ficha-line-btn" onclick="fichaPush\('vehiculo','1'\)"/.test(h), (h.match(/ficha-line-btn[^>]*>/) || [''])[0]);
ok('"Lo que te toca ahora" va al FINAL', h.lastIndexOf('ficha-next') > h.lastIndexOf('ficha-line'));
ok('el aviso en ámbar lleva su clase', /ficha-line is-warn/.test(h));

console.log('\n== relevoSinceLabel ==');
ok('ayer', /^ayer a las/.test(ctx.relevoSinceLabel('2026-09-29T18:40:00', '2026-09-30T08:00:00')));
ok('hoy', /^hoy a las .* \(hace 6 h\)$/.test(ctx.relevoSinceLabel('2026-09-30T02:00:00', '2026-09-30T08:00:00')));

console.log('\n' + pasaron + ' ok, ' + fallaron + ' fallas');
if (fallaron) process.exitCode = 1;
