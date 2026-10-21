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
const dinoR = L.spots.find(s => s.id === 'dino').rect, placas = L.fixed.filter(f => f.kind === 'barrier');
ok('[3.17.1] las placas amarillas van a los costados del dinamómetro (lo fijan de lado), nunca en los extremos por donde entra el coche',
   placas.length === 2 && placas.every(f => (f.rect[2] - f.rect[0]) > (f.rect[3] - f.rect[1]) && (f.rect[3] <= dinoR[1] || f.rect[1] >= dinoR[3]) && f.rect[0] >= dinoR[0] && f.rect[2] <= dinoR[2]) &&
   placas.some(f => f.rect[3] <= dinoR[1]) && placas.some(f => f.rect[1] >= dinoR[3]));
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

console.log('\n== Formas y frente ==');
const sd = C.siteItemsSeed('');
ok('la siembra trae forma y frente (los gabinetes miran a la celda, el ventilador al coche)', sd.find(i => i.id === 'si-gab-a').front === 'e' && sd.find(i => i.id === 'si-vent').front === 'w' &&
   sd.find(i => i.id === 'si-tab-1').shape === 'panel' && sd.find(i => i.id === 'si-vent').shape === 'fan');
ok('un sembrado de antes (sin frente) toma el de la siembra; uno nuevo mira al sur', C.siteItemFront({ id: 'si-gab-c' }) === 'e' && C.siteItemFront({ id: 'si-x' }) === 's' && C.siteItemShape({ id: 'si-x' }) === 'box');
ok('cada forma del selector tiene nombre', Object.keys(C.SITE_SHAPES).every(k => C.SITE_SHAPES[k]) && C.siteItemShape({ id: 'si-x', shape: 'desk' }) === 'desk');

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
ok('el equipo con algo vencido se marca y el elegido también', /st-eq st-eq--bad st-eq--filter st-eq--sel/.test(out.svg));
ok('cada forma dibuja sus detalles: pantallas, aspas, puertas', /st-d-screen/.test(out.svg) && /st-d-spoke/.test(out.svg) && /st-d-door/.test(out.svg) && /st-d-hazard/.test(out.svg));
ok('los autos llevan ruedas, cristales, faros y calaveras', (out.svg.match(/class="st-c-tire"/g) || []).length === 4 * 4 && /class="st-c-g\d"/.test(out.svg) && /st-c-lamp/.test(out.svg) && /st-c-tail/.test(out.svg),
   (out.svg.match(/class="st-c-tire"/g) || []).length);
ok('el choque del cajón 3 se pinta', /st-spot--c3 st-spot--busy st-spot--clash/.test(out.svg));
ok('lo decorativo no se queda con el toque', /\.st-wall \{ pointer-events: none/.test(fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')));
const k = C.siteKpis(M, look, items, health);
ok('indicadores: en sitio con/sin alta, reposando, en dino, equipos', k.onSite === 4 && k.withAlta === 2 && k.noAlta === 2 && k.soaking === 1 && k.nextLeftH === 3 && k.dino === 1 && k.eqBad === 1 && k.eqNone === items.length - 1, JSON.stringify(k));

console.log('\n== [3.17.0] El auto es una malla 3D: solo se dibuja lo que se ve ==');
const camK = { az: 18, el: 46, zoom: 1, panX: 0, panY: 0 }, CK = C.invRoomCenter(L);
const PK = (x, y, z) => C.invRoomProject(x, y, z, camK, CK), ctxK = { P: PK, V: C._siteViewVec(camK) };
const carE = C._siteCarSVG(ctxK, 10, 5, 0, 'st-car', '', 'x', { body: 'sedan' }), carW = C._siteCarSVG(ctxK, 10, 5, Math.PI, 'st-car', '', 'x', { body: 'sedan' });
const nPoly = sv => (sv.match(/<polygon/g) || []).length;
ok('las cuatro carrocerías existen, con la misma distancia entre ejes (las llantas caen en los rodillos)', ['sedan', 'hatch', 'wagon', 'suv'].every(k => C.SITE_BODIES[k] && C.SITE_BODIES[k].st.length >= 10) &&
   C.SITE_WHEEL_U === 1.35 && Math.abs((6.3 + 9.0) / 2 - (5.2 + 10.2) / 2) < 0.06);
ok('desde arriba no se ve ningún costado: solo techos, cofres y cristales', (() => { const camT = { az: 0, el: 90 }, s2 = C._siteCarSVG({ P: (x, y, z) => C.invRoomProject(x, y, z, camT, CK), V: C._siteViewVec(camT) }, 10, 5, 0, 'st-car', '', '', {}).s;
   return !/st-c-tire/.test(s2) && !/st-c-arch/.test(s2) && /st-c-b\d+/.test(s2); })());
ok('de lado se ve UN costado con sus dos llantas completas (rin, rayos) y el otro solo asoma', (carE.s.match(/class="st-c-rim"/g) || []).length === 2 && (carE.s.match(/class="st-c-tire"/g) || []).length === 4);
ok('mirando al este o al oeste es el mismo auto (girado), con faros adelante y calaveras atrás', nPoly(carE.s) > 40 && nPoly(carW.s) > 40 && /st-c-lamp/.test(carE.s) && /st-c-tail/.test(carW.s));
ok('la luz pinta distinto cada cara (no es un color plano)', new Set((carE.s.match(/st-c-b\d+/g) || [])).size >= 4);
ok('la carrocería sale del catálogo: 4DR sedán, 5DR hatchback, WGN wagon, WGN LONG SUV', C.siteBodyFromConfig({ 'BODY TYPE': '4DR' }) === 'sedan' && C.siteBodyFromConfig({ 'BODY TYPE': '5DR' }) === 'hatch' &&
   C.siteBodyFromConfig({ 'BODY TYPE': 'WGN' }) === 'wagon' && C.siteBodyFromConfig({ 'BODY TYPE': 'WGN LONG' }) === 'suv' && C.siteBodyFromConfig({}) === '');
ok('una SUV es más alta que un sedán', C.siteBodyHeight('suv') > C.siteBodyHeight('sedan') + 0.2);
const hull = C._siteHull([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0.3 }, { x: 2, y: 2 }, { x: 0, y: 2 }]);
ok('la silueta de una llanta es la envolvente convexa', hull.length === 4 && !hull.some(p => p.x === 1));

console.log('\n== [3.17.0] El estacionamiento de la flota Master ==');
const LL = C.siteLayout(5), st5 = LL.lot.stalls;
ok('P1 junto al cuarto de acondicionamiento y los siguientes hacia el oeste, afuera del edificio', st5.length === 5 && st5[0].id === 'p1' && st5[0].rect[2] <= 15 &&
   st5.every((s, i) => i === 0 || s.rect[2] <= st5[i - 1].rect[0] + 1e-9) && st5.every(s => s.rect[1] >= 12.9));
ok('un lugar nunca cambia de número cuando el estacionamiento crece', JSON.stringify(C.siteLayout(8).lot.stalls.slice(0, 5).map(s => s.rect)) === JSON.stringify(st5.map(s => s.rect)));
ok('cuántos lugares: nunca menos de 5, siempre uno libre, y todos los que se usan', C.siteLotCount([]) === 5 && C.siteLotCount([1, 2, 3, 4, 5].map(i => ({ id: 'm' + i, spot: 'p' + i }))) === 6 &&
   C.siteLotCount([{ id: 'a', spot: 'p9' }]) === 9 && C.siteLotCount([{ id: 'a', spot: 'p9', deleted: true }]) === 5);
ok('el plano fijo no cambia: el estacionamiento se agrega encima', C.SITE_LAYOUT.spots.length === 5 && !C.SITE_LAYOUT.lot && LL.spots.length === 10 && LL.floor === C.SITE_LAYOUT.floor);
ok('un punto dentro de un lugar de afuera es ese lugar', C.siteSpotAt([(st5[2].rect[0] + st5[2].rect[2]) / 2, 15.5], LL) === 'p3' && C.siteSpotAt([(st5[2].rect[0] + st5[2].rect[2]) / 2, 15.5]) === null);
ok('los lugares de afuera se reconocen', C.siteIsStall('p12') && !C.siteIsStall('c1') && !C.siteIsStall('dino') && !C.siteIsStall(''));
const ms = [{ id: 'm1', vin: 'KNA0000000000AAAA1', spot: 'p1', name: 'K4' }, { id: 'm2', vin: 'MST2', spot: 'p2' }, { id: 'm3', vin: 'MST3', spot: 'p2' }, { id: 'm4', vin: 'MST4', spot: '' },
            { id: 'm5', vin: 'MST5', spot: 'p3', deleted: true }];
const PM = C.siteParkingModel(ms, M, st5.map(s => s.id));
ok('cada Master en su lugar; las bajas no cuentan', PM.list.length === 4 && PM.byStall.p1[0].master.id === 'm1' && !PM.byStall.p3);
ok('su VIN adentro (cajón 1, con alta) → se sabe dónde está', PM.byStall.p1[0].inLab && PM.byStall.p1[0].inLab.spot === 'c1' && !PM.byStall.p2[0].inLab);
ok('dos en el mismo lugar se declaran; uno sin lugar también', PM.conflicts.join() === 'p2' && PM.unplaced.length === 1 && PM.unplaced[0].master.id === 'm4');
ok('primer lugar libre', C.siteLotFreeStall(ms) === 'p3' && C.siteLotFreeStall([]) === 'p1');
ok('el mismo VIN dos veces en la flota se declara', C.siteParkingModel([{ id: 'a', vin: 'v 1', spot: 'p1' }, { id: 'b', vin: 'V1', spot: 'p2' }], M, ['p1', 'p2']).dupVins.join() === 'V1' && PM.dupVins.length === 0);
const kk2 = C.siteKpis(M, look, items, health, PM);
ok('indicadores: cuántos Master y cuántos adentro', kk2.masters === 4 && kk2.mastersIn === 1 && C.siteKpis(M, look, items, health).masters === 0);
const mlook = { m1: { short: 'K4', sub: 'adentro: Cajón 1', aria: 'K4' }, m2: { short: 'M2', aria: 'M2' }, m3: { short: 'M3', aria: 'M3' } };
const outL = C.siteSceneSVG({ layout: LL, items, model: M, look, health, parking: PM, masterLook: mlook }, cam, { ls: 1.3 });
ok('PURA también con el estacionamiento', outL.svg === C.siteSceneSVG({ layout: LL, items, model: M, look, health, parking: PM, masterLook: mlook }, cam, { ls: 1.3 }).svg);
ok('cada lugar de afuera se puede tocar y lleva su número pintado', (outL.svg.match(/data-spot="p\d+"/g) || []).length === 5 && /class="st-stall-num" transform="matrix\(/.test(outL.svg));
ok('un Master se dibuja con su color real y se puede tocar; el que está adentro deja su huella', /data-master="m2"[^>]*style="--st-car:/.test(outL.svg) && !/data-master="m1"/.test(outL.svg) && /class="st-ghost"/.test(outL.svg));
ok('el exterior: base de maqueta, pasto, asfalto, árboles, topes', /st-base-side/.test(outL.svg) && /st-grass/.test(outL.svg) && /st-asphalt/.test(outL.svg) && /st-canopy/.test(outL.svg) && /st-stop/.test(outL.svg));
ok('el texto pintado se escala con la pantalla (--ls en las dos capas)', (outL.svg.match(/--ls:1\.30/g) || []).length === 2);
const ft = C._siteFloorText(PK, 5, 5, 'P1', 'x', 0.5), mm = /matrix\(([^)]+)\)/.exec(ft)[1].split(' ').map(Number);
ok('el letrero pintado no sale al revés (corre de izquierda a derecha)', mm[0] > 0 && mm[0] * mm[3] - mm[1] * mm[2] > 0);
const walls = outL.svg.match(/st-wall-face--cut/g) || [], backs = outL.svg.match(/st-wall-face--back/g) || [];
ok('muros: los de enfrente cortados bajos y los del fondo completos, con su grosor', walls.length > 3 && backs.length > 3 && /st-wall-cap/.test(outL.svg));
ok('la fosa del dinamómetro: rodillos de acero y cinta de seguridad', (outL.svg.match(/class="st-roller"/g) || []).length === 8 && /st-pit-edge/.test(outL.svg));
const bars = outL.svg.match(/<g class="st-barrier"[\s\S]*?<\/g>/g) || [], holeOn = (g, i) => new RegExp('st-side--' + i + '"[^>]*/><polygon class="st-d-hole"').test(g);
ok('[3.17.1] cada placa lleva sus perforaciones en las dos caras largas (las que miran al coche y hacia afuera)', bars.length === 2 && bars.every(g => holeOn(g, 0) && holeOn(g, 2) && !holeOn(g, 1) && !holeOn(g, 3)));
const camTop = { az: 0, el: 90, zoom: 1, panX: 0, panY: 0 }, CT = C.siteCenter(L), PT = (x, y) => C.invRoomProject(x, y, 0, camTop, CT);
const lblM = /class="st-floor-lbl st-floor-lbl--dino" transform="matrix\(([^)]+)\)"/.exec(C.siteSceneSVG({ layout: L, items, model: M, look, health }, camTop, {}).svg)[1].split(' ').map(Number);
const dc = PT(7.7, 5.0), pe = PT(7.7, Math.max.apply(null, placas.map(f => f.rect[3]))), dir = [pe.x - dc.x, pe.y - dc.y];
ok('[3.17.1] el letrero "Dinamómetro" queda delante de la placa del frente, no tapado por ella',
   (lblM[4] - dc.x) * dir[0] + (lblM[5] - dc.y) * dir[1] > dir[0] * dir[0] + dir[1] * dir[1]);

console.log('\n== [3.17.0] La flota viaja por la nube como las unidades sin alta ==');
const fbs = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-sync.js'), 'utf8');
ok('siteMasters está en la meta de vehículos', /FB_VEH_META_KEYS = \[[^\]]*'siteMasters'/.test(fbs));
ok('cada punto donde se unen las unidades sin alta también une la flota', (fbs.match(/siteUnits/g) || []).length === (fbs.match(/siteMasters/g) || []).length, (fbs.match(/siteUnits/g) || []).length + ' vs ' + (fbs.match(/siteMasters/g) || []).length);
const ma = [{ id: 'sm1', vin: 'A', spot: 'p1', updatedAt: '2026-10-21T10:00Z' }], mb = [{ id: 'sm1', vin: 'A', spot: 'p4', updatedAt: '2026-10-21T11:00Z' }, { id: 'sm2', vin: 'B', spot: 'p2', updatedAt: '1' }];
ok('dos equipos: gana el cambio más reciente y no se pierde ninguno (simétrico)', JSON.stringify(C.siteListUnion(ma, mb)) === JSON.stringify(C.siteListUnion(mb, ma)) && C.siteListUnion(ma, mb).map(m => m.id + m.spot).join() === 'sm1p4,sm2p2');

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
