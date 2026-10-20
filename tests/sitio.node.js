// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.14.0 — El laboratorio en el mapa: plano, unidades, soak, equipos   ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Código REAL de js/cuarto.js + js/sitio.js en un `vm` sin DOM: solo lo puro.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { fnSrc } = require('../tools/digest-env');

const ctx = { console, Date, JSON, Object, Array, String, Number, Math, RegExp, isFinite, parseFloat };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
vm.runInContext(fnSrc('stableStringify', app), ctx);
for (const f of ['cuarto.js', 'sitio.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });

let pasaron = 0, fallaron = 0;
function ok(n, c, d) { if (c) { pasaron++; console.log('  ok  ' + n); } else { fallaron++; console.log('  FALLA  ' + n + (d !== undefined ? ' — ' + d : '')); } }
const C = ctx, L = C.SITE_LAYOUT;

console.log('\n== El plano es el del croquis ==');
const area = id => L.areas.find(a => a.id === id).rect;
ok('la celda, el control al sur y el acondicionamiento al este', area('control')[1] === area('celda')[3] && area('acond')[0] === area('celda')[2]);
ok('el ventanal entre celda y acondicionamiento se abre (por ahí entra el coche)', L.doors.some(d => d.id === 'ventanal' && d.a[0] === 15 && d.b[0] === 15));
ok('dinamómetro + 4 cajones; el coche del dino mira al ventilador (este) y los de los cajones a la celda', L.spots.length === 5 &&
   L.spots.find(s => s.id === 'dino').nose === 1 && L.spots.filter(s => s.area === 'acond').every(s => s.nose === -1));
const vent = C.SITE_ITEMS_SEED.find(r => r[0] === 'si-vent');
ok('el ventilador está frente a la nariz del coche, sobre sus rieles', vent[2] > L.spots[0].rect[2] && L.fixed.filter(f => f.kind === 'rail').length === 2);
const ebcm = C.SITE_ITEMS_SEED.find(r => r[0] === 'si-ebcm1'), c2 = L.spots.find(s => s.id === 'c2'), c3 = L.spots.find(s => s.id === 'c3');
ok('EBCM1 y el cargador entre el cajón 2 y el 3', ebcm[3] >= c2.rect[3] && ebcm[5] <= c3.rect[1]);
ok('los equipos sembrados no tienen nombre propio ni ligan al F11', C.siteItemsSeed('').every(i => i.assetId === '' && i.seeded));
ok('ids de la siembra únicos y estables', new Set(C.SITE_ITEMS_SEED.map(r => r[0])).size === C.SITE_ITEMS_SEED.length);

console.log('\n== Quién está en cada lugar (solo por VIN) ==');
const veh = (id, vin, spot, status) => ({ id, vin, status: status || 'in-progress', site: spot ? { spot, since: '2026-10-20T10:00:00Z' } : undefined });
const vs = [veh(1, 'KNA0000000000AAAA1', 'c1'), veh(2, 'KNA0000000000BBBB2', 'dino'), veh(3, 'KNA0000000000CCCC3', null), veh(4, 'KNA0000000000DDDD4', 'c2', 'historico')];
const us = [{ id: 'u1', vin: 'KNA0000000000CCCC3', spot: 'c3' }, { id: 'u2', vin: 'XYZ999', spot: 'c3' }, { id: 'u3', vin: 'OLD', spot: 'c4', deleted: true }, { id: 'u4', vin: 'Q1', spot: 'zz' }];
const M = C.siteSpotsModel(vs, us);
ok('una unidad con alta va donde dice su `site`', M.bySpot.c1[0].kind === 'veh' && M.bySpot.dino[0].id === 2);
ok('un histórico no está en el sitio; una baja tampoco', !M.bySpot.c2 && !M.bySpot.c4);
ok('una sin alta cuyo VIN sí tiene alta lo dice (se ofrece ligarla)', M.bySpot.c3.find(e => e.id === 'u1').altaId === 3 && M.bySpot.c3.find(e => e.id === 'u2').altaId === undefined);
ok('dos unidades en el mismo cajón se declaran como choque', M.conflicts.join() === 'c3');
ok('un lugar que el plano no tiene se declara, no se esconde', M.unknown.length === 1 && M.unknown[0].id === 'u4');
ok('el VIN se compara sin espacios ni mayúsculas', C.siteVinKey(' kna 0000-1 ') === 'KNA00001');

console.log('\n== El reposo se deriva ==');
const t0 = new Date(2026, 9, 20, 8, 0).getTime();
ok('sin preacondicionamiento: no hay reposo', C.siteSoakStatus({}, 12, t0).state === 'sin-precon');
const s1 = C.siteSoakStatus({ preconditioning: { datetime: '2026-10-20T06:00' } }, 12, t0);
ok('preacondicionada a las 6:00 con 12 h: faltan 10 h', s1.state === 'reposando' && Math.abs(s1.leftH - 10) < 1e-9, JSON.stringify(s1));
ok('pasado el reposo: lista para probar', C.siteSoakStatus({ preconditioning: { datetime: '2026-10-19T18:00' } }, 12, t0).state === 'listo');
ok('ya probada: no se habla de reposo', C.siteSoakStatus({ preconditioning: { datetime: '2026-10-20T06:00' }, testDatetime: '2026-10-20T07:00' }, 12, t0).state === 'probada');

console.log('\n== El estado de un equipo sale del F11 ==');
const calW = C.siteCalWorstByAsset([{ assetId: 'E-013', c: 'vigente' }, { assetId: 'E-013', c: 'vencido' }, { assetId: 'E-003', c: 'porvencer' }, { assetId: 'E-004', c: 'encalibracion', late: 3 }],
    e => ({ code: e.c, late: e.late || 0 }));
ok('el peor instrumento manda (vencido gana a vigente)', calW['E-013'] === 'vencido' && calW['E-003'] === 'porvencer' && calW['E-004'] === 'encalibracion-late');
const hctx = { calWorst: calW, mttoOverdue: { 'E-001': 2 }, assets: { 'E-013': 'Dynamometer', 'E-003': 'Clean Cham', 'E-001': 'HVAC', 'E-004': 'CFO' } };
ok('sin ligar: gris, se dice', C.siteItemHealth({ assetId: '' }, hctx).tone === 'none');
ok('calibración vencida o mantenimiento vencido: rojo', C.siteItemHealth({ assetId: 'E-013' }, hctx).tone === 'bad' && /2 mantenimientos vencidos/.test(C.siteItemHealth({ assetId: 'E-001' }, hctx).text));
ok('por vencer o regreso atrasado: ámbar', C.siteItemHealth({ assetId: 'E-003' }, hctx).tone === 'warn' && C.siteItemHealth({ assetId: 'E-004' }, hctx).tone === 'warn');
ok('ligado a un equipo que ya no existe: se dice', /ya no está en el F11/.test(C.siteItemHealth({ assetId: 'E-999' }, hctx).text));

console.log('\n== Sync: uniones simétricas ==');
const a = [{ id: 'x', label: 'A', updatedAt: '2026-10-20T10:00Z' }, { id: 'y', label: 'Y', updatedAt: '1' }];
const b = [{ id: 'x', label: 'B', updatedAt: '2026-10-20T11:00Z' }, { id: 'z', label: 'Z', updatedAt: '1' }];
ok('gana el editado más reciente, sin perder los demás', JSON.stringify(C.siteListUnion(a, b)) === JSON.stringify(C.siteListUnion(b, a)) &&
   C.siteListUnion(a, b).map(i => i.id + i.label).join() === 'xB,yY,zZ');
ok('en empate gana la baja', C.siteListUnion([{ id: 'q', updatedAt: '5' }], [{ id: 'q', updatedAt: '5', deleted: true }])[0].deleted === true);
ok('se detecta lo nuevo y no lo repetido', C.siteListNewTo(a, b) && !C.siteListNewTo(C.siteListUnion(a, b), b) && !C.siteListNewTo(a, []));

console.log('\n== Escena y proyección ==');
const cam = { az: 25, el: 42, zoom: 1, panX: 0, panY: 0 }, Ce = C.invRoomCenter(L);
const p = C.invRoomProject(18.3, 4.7, 0, cam, Ce), back = C.siteUnproject(p.x, p.y, cam, Ce);
ok('del piso a la pantalla y de regreso (para arrastrar equipos)', Math.abs(back[0] - 18.3) < 1e-9 && Math.abs(back[1] - 4.7) < 1e-9, back.join());
ok('un punto dentro de un cajón es ese cajón; en el pasillo, ninguno', C.siteSpotAt([19, 4.5]) === 'c2' && C.siteSpotAt([24, 4.5]) === null && C.siteSpotAt([7.6, 5]) === 'dino');
const items = C.siteItemsSeed('');
items[0].assetId = 'E-013';
const look = { 'veh:1': { tone: 'soak', short: '…AAAA1', sub: 'reposo: faltan 3 h', soak: 'reposando', leftH: 3, aria: 'Unidad 1' }, 'veh:2': { tone: 'work', short: '…BBBB2', aria: 'U2' },
               'unit:u1': { tone: 'noalta', short: '…CCC3', aria: 'u1' }, 'unit:u2': { tone: 'noalta', aria: 'u2' } };
const health = {}; items.forEach(i => { health[i.id] = { tone: i.assetId ? 'bad' : 'none', text: '' }; });
const out = C.siteSceneSVG({ layout: L, items, model: M, look, health }, cam, { sel: { kind: 'item', id: 'si-filtro' } });
ok('PURA: misma entrada, misma escena', out.svg === C.siteSceneSVG({ layout: L, items, model: M, look, health }, cam, { sel: { kind: 'item', id: 'si-filtro' } }).svg);
ok('cada equipo, cada lugar y cada unidad se pueden tocar', (out.svg.match(/data-item="/g) || []).length === items.length &&
   (out.svg.match(/data-spot="/g) || []).length === 5 && /data-veh="1"/.test(out.svg) && /data-unit="u2"/.test(out.svg));
ok('el equipo con algo vencido se marca y el elegido también', /st-eq st-eq--bad st-eq--sel/.test(out.svg));
ok('el choque del cajón 3 se pinta', /st-spot--c3 st-spot--busy st-spot--clash/.test(out.svg));
ok('lo decorativo no se queda con el toque', /\.st-wall \{ pointer-events: none/.test(fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')));
const k = C.siteKpis(M, look, items, health);
ok('indicadores: en sitio con/sin alta, reposando, en dino, equipos', k.onSite === 4 && k.withAlta === 2 && k.noAlta === 2 && k.soaking === 1 && k.nextLeftH === 3 && k.dino === 1 && k.eqBad === 1 && k.eqNone === items.length - 1, JSON.stringify(k));

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
