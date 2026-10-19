// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.10.0 — El cuarto de gases: geometría, escena y proyección         ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Código REAL de js/cuarto.js en un `vm` sin DOM: solo las funciones puras.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, Math, JSON, Object, Array, String, Number, isFinite, parseInt, parseFloat };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'cuarto.js'), 'utf8'), ctx, { filename: 'cuarto.js' });
vm.runInContext('this.L = INV_ROOM_LAYOUT; this.CAM0 = INV_ROOM_CAM_DEFAULT;', ctx);

let pasaron = 0, fallaron = 0;
function ok(n, c, d) { if (c) { pasaron++; console.log('  ok  ' + n); } else { fallaron++; console.log('  FALLA  ' + n + (d !== undefined ? ' — ' + d : '')); } }
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-6);

// Las zonas como las trae Consumibles (semilla de inventory.js)
const ZONES = [
    { id: 'A', slots: 12 }, { id: 'B', slots: 4 }, { id: 'C', slots: 12 }, { id: 'D', slots: 2 },
    { id: 'E', slots: 14 }, { id: 'F', slots: 14 }, { id: 'G', slots: 2 }, { id: 'H', slots: 4 }
];

console.log('\n== El layout es el cuarto del laboratorio ==');
const L = ctx.L;
ok('las ocho zonas tienen lugar en el plano', ZONES.every(z => L.zones[z.id]));
ok('paredes A, B, C y D están conectadas a tablero', ['A', 'B', 'C', 'D'].every(id => L.zones[id].kind === 'wall' && L.zones[id].wall));
ok('E y F son buffers; G el diablito; H sin conectar', L.zones.E.kind === 'buffer' && L.zones.F.kind === 'buffer' && L.zones.G.kind === 'cart' && L.zones.H.kind === 'loose');
ok('cuatro puertas (entrada, fondo, abajo a la izquierda, inflamables por fuera)', L.doors.length === 4);
ok('D y H están dentro del cuartito de inflamables', L.zones.D.room === 'inflamables' && L.zones.H.room === 'inflamables');
ok('el diablito descansa en la pared del cuarto de inflamables, a lo largo de ella', L.zones.G.back[0] === 3.2 + 0.02 && L.zones.G.back[2] === L.zones.G.back[0] &&
    L.zones.G.points[0][0] === L.zones.G.points[1][0] && L.walls.some(w => w[0] === 3.2 && w[2] === 3.2));

console.log('\n== Posiciones de cada zona ==');
let r = ctx.invRoomZoneSlots(L.zones.C, 12);
ok('pared C: 12 posiciones, empezando junto a su puerta del fondo', r.pts.length === 12 && near(r.pts[0].y, 1.15) && near(r.pts[11].y, 4.8) && r.extra === 0);
ok('la puerta de la derecha está en la pared C, antes de C01', L.doors.some(d => d.a[0] === 5.8 && d.b[0] === 5.8 && d.b[1] < 1.15));
ok('a inflamables se entra por su pared de abajo', L.doors.some(d => d.id === 'inflamables' && d.a[1] === 6.6 && d.b[1] === 6.6));
r = ctx.invRoomZoneSlots(L.zones.A, 13);
ok('una pared reparte las que tenga (13 si se agregó una)', r.pts.length === 13 && r.extra === 0);
ok('pared A: A01 al frente (izquierda viéndola de frente), A12 al fondo', near(r.pts[0].y, 4.25) && near(r.pts[12].y, 0.4));
r = ctx.invRoomZoneSlots(L.zones.E, 14);
ok('buffer: 6 por lado + 2 grandes en la orilla', r.pts.length === 14 && r.pts.slice(0, 12).every(p => !p.big) && r.pts[12].big && r.pts[13].big);
ok('los buffers corren de izquierda a derecha con los grandes hacia la pared C', near(r.pts[0].y, r.pts[5].y) && r.pts[5].x > r.pts[0].x && r.pts[12].x > r.pts[5].x && r.pts[13].x > r.pts[5].x);
r = ctx.invRoomZoneSlots(L.zones.E, 16);
ok('un buffer con más posiciones de las que dibuja lo declara', r.pts.length === 14 && r.extra === 2);
r = ctx.invRoomZoneSlots(L.zones.G, 3);
ok('el diablito dibuja sus 2 y declara la tercera', r.pts.length === 2 && r.extra === 1);
ok('una zona sin lugar en el plano no inventa posiciones', ctx.invRoomZoneSlots(undefined, 5).pts.length === 0 && ctx.invRoomZoneSlots(undefined, 5).extra === 5);

console.log('\n== Códigos de posición ==');
const ids = ZONES.map(z => z.id);
let p = ctx.invRoomParseCode('A03', ids);
ok('A03 → zona A, posición 3', p && p.zone === 'A' && p.n === 3);
p = ctx.invRoomParseCode('AB12', ['A', 'AB']);
ok('una zona de dos letras no se confunde con la de una', p && p.zone === 'AB' && p.n === 12);
p = ctx.invRoomParseCode('a1', ids);
ok('minúsculas y sin cero a la izquierda también', p && p.zone === 'A' && p.n === 1);
ok('zona que no existe → null', ctx.invRoomParseCode('Z01', ids) === null);
ok('basura → null', ctx.invRoomParseCode('A0x', ids) === null && ctx.invRoomParseCode('', ids) === null && ctx.invRoomParseCode('A00', ids) === null);
ok('código a dos dígitos', ctx.invRoomCode('C', 7) === 'C07' && ctx.invRoomCode('E', 13) === 'E13');

console.log('\n== La escena ==');
const GASES = [
    { id: 'g1', zone: 'A01', status: 'In use' },
    { id: 'g2', zone: 'C12', status: 'In use' },
    { id: 'g3', zone: 'G01', status: 'Stock' },
    { id: 'g4', zone: 'A01', status: 'Spare' },    // repetida
    { id: 'g5', zone: '', status: 'Stock' },       // sin posición
    { id: 'g6', zone: 'Z04', status: 'Stock' },    // zona que no existe
    { id: 'g7', zone: 'G03', status: 'Stock' },    // el diablito tiene 2
    { id: 'g8', zone: 'e2', status: 'Empty' }
];
const sc = ctx.invRoomScene(L, ZONES, GASES);
ok('64 posiciones (12+4+12+2+14+14+2+4)', sc.slots.length === 64, sc.slots.length);
ok('cada cilindro con lugar cae en su posición', sc.slots.find(s => s.code === 'A01').gasId === 'g1' && sc.slots.find(s => s.code === 'C12').gasId === 'g2' && sc.slots.find(s => s.code === 'E02').gasId === 'g8');
const why = {}; sc.unplaced.forEach(u => { why[u.gasId] = u.reason; });
ok('lo que no se puede dibujar se declara con su motivo', why.g4 === 'repetida' && why.g5 === 'sin-zona' && why.g6 === 'zona-desconocida' && why.g7 === 'fuera-del-plano', JSON.stringify(why));
ok('la repetida queda marcada en la posición', sc.slots.find(s => s.code === 'A01').dupIds[0] === 'g4');
const zA = sc.zones.find(z => z.id === 'A');
ok('ocupación por zona', zA.used === 1 && zA.total === 12 && sc.zones.find(z => z.id === 'G').used === 1);
ok('recepción = diablito primero, luego los buffers', JSON.stringify(ctx.invRoomReceptionZones(ZONES, L)) === '["G","E","F"]');

console.log('\n== Ciclo del cilindro (derivado) ==');
ok('en un buffer o el diablito = recepción/stock', ctx.invRoomLifecycle({ status: 'Stock' }, 'cart') === 'recepcion' && ctx.invRoomLifecycle({ status: 'Spare' }, 'buffer') === 'recepcion');
ok('en una pared sin usar = conectado; en uso = en uso', ctx.invRoomLifecycle({ status: 'Stock' }, 'wall') === 'conectado' && ctx.invRoomLifecycle({ status: 'In use' }, 'wall') === 'enuso');
ok('vacío manda sobre el lugar', ctx.invRoomLifecycle({ status: 'Empty' }, 'wall') === 'vacio');

console.log('\n== Semáforo de nivel (conectados) y etiqueta (buffers) ==');
const T = (pct, levelStatus, status) => ctx.invRoomLevelTone({ pct, levelStatus, status: status || 'In use' });
ok('verde arriba de la mitad', T(80, 'ok') === 'ok' && T(51, 'ok') === 'ok');
ok('amarillo a la mitad o menos (solo visual)', T(50, 'ok') === 'half' && T(31, 'ok') === 'half');
ok('anaranjado y rojo son los umbrales de las alertas (invGasLevel), no otros', T(30, 'bajo') === 'mid' && T(15, 'critico') === 'low' && T(40, 'bajo') === 'mid');
ok('vacío y sin lecturas', T(0, 'ok', 'Empty') === 'empty' && T(null, 'sinlecturas') === 'none');
const TG = x => ctx.invRoomStockTag(Object.assign({ status: 'Stock', levelStatus: 'ok' }, x));
ok('buffer: lleno de 90% para arriba o nuevo sin lecturas', TG({ pct: 95 }).text === 'Lleno' && TG({ pct: null, levelStatus: 'sinlecturas' }).text === 'Lleno');
ok('buffer: marcado vacío → Vacío (aunque diga otro %)', TG({ status: 'Empty', pct: 60 }).text === 'Vacío');
ok('buffer: uno guardado a medias NO dice "Lleno", dice su %', TG({ pct: 40 }).text === '40%');
ok('buffer: vencido y casi vacío se dicen', TG({ pct: 95, expired: true }).text === 'Vencido' && /casi vacío/.test(TG({ pct: 8, levelStatus: 'critico' }).text));

console.log('\n== Proyección y cámara ==');
const C = ctx.invRoomCenter(L);
let q = ctx.invRoomProject(C[0] + 1, C[1] + 2, 5, { az: 0, el: 90 }, C);
ok('desde arriba (90°) es el plano a escala y la altura no cuenta', near(q.x, 100) && near(q.y, 200) && near(q.d, 2));
q = ctx.invRoomProject(C[0] + 1, C[1], 0, { az: 90, el: 90 }, C);
ok('girar 90° lleva el este hacia quien mira', near(q.x, 0) && near(q.d, 1));
const front = ctx.invRoomProject(1, 6, 0, ctx.CAM0, C), back = ctx.invRoomProject(1, 0.5, 0, ctx.CAM0, C);
ok('lo de la entrada queda más cerca que lo del fondo', front.d > back.d);
q = ctx.invRoomProject(C[0], C[1], 1, { az: 0, el: 30 }, C);
ok('inclinado, lo alto sube en pantalla', q.y < 0);
let cam = ctx.invRoomCamNormalize({ az: 400, el: 5, zoom: 99 });
ok('la cámara guardada se acota (giro, inclinación, zoom)', near(cam.az, 40) && cam.el === 20 && cam.zoom === 5);
ok('teléfono arranca en plano; escritorio en 3D', ctx.invRoomCamNormalize(null, true).el === 90 && ctx.invRoomCamNormalize(null, false).el === ctx.CAM0.el);
ok('con la vista inicial el fondo y la izquierda son muros de fondo; la derecha y la entrada, de frente',
    ctx.invRoomWallIsBack(0, -1, ctx.CAM0) && ctx.invRoomWallIsBack(-1, 0, ctx.CAM0) && !ctx.invRoomWallIsBack(1, 0, ctx.CAM0) && !ctx.invRoomWallIsBack(0, 1, ctx.CAM0));

console.log('\n== El SVG de la escena ==');
const look = { g1: { tone: 'low', pct: 10, short: 'CH4 20', pin: 'alerta', aria: 'A01' }, g2: { tone: 'ok', pct: 90, short: 'CO 50', aria: 'C12' },
               g3: { tone: 'none', pct: 0, short: 'N2', aria: 'G01', dim: true }, g8: { tone: 'empty', pct: 0, short: 'O2', aria: 'E02' } };
let out = ctx.invRoomSceneSVG(sc, ctx.CAM0, look, { sel: 'g2' });
const nCyl = (out.svg.match(/class="rm-cyl /g) || []).length, nSlot = (out.svg.match(/class="rm-slot/g) || []).length;
ok('un cilindro por posición ocupada y una marca por posición libre', nCyl === 4 && nSlot === 60, nCyl + '/' + nSlot);
ok('cada cilindro lleva su id y su código', /data-gas-id="g2" data-code="C12"/.test(out.svg));
ok('el color sale del estado (crítico, vacío)', /rm-cyl--low/.test(out.svg) && /rm-cyl--empty/.test(out.svg));
ok('crítico lleva marcador', /class="rm-pin/.test(out.svg));
ok('el seleccionado lleva su anillo', /rm-selring/.test(out.svg) && /rm-cyl--sel/.test(out.svg));
ok('lo filtrado queda atenuado, no escondido', /rm-cyl rm-cyl--none rm-cyl--stock rm-dim/.test(out.svg));
ok('etiqueta de zona con su ocupación', /A · 1\/12/.test(out.svg) && /G · 1\/2/.test(out.svg));
ok('la caja de la escena es finita', ['x', 'y', 'w', 'h'].every(k => isFinite(out.box[k])) && out.box.w > 0 && out.box.h > 0);
const iFront = out.svg.indexOf('data-gas-id="g1"'), iBack = out.svg.indexOf('data-gas-id="g8"');
ok('se pinta de atrás hacia adelante (A01, junto a la entrada, después del buffer)', iFront > iBack && iBack > 0);
out = ctx.invRoomSceneSVG(sc, { az: 0, el: 90, zoom: 1, panX: 0, panY: 0 }, look, {});
ok('desde arriba el nivel es un anillo', /class="rm-ring"/.test(out.svg) && !/class="rm-level"/.test(out.svg));
ok('sin valores raros en la geometría', !/NaN|undefined|Infinity/.test(out.svg));
look.g8.tag = { text: 'Vacío', tone: 'empty' }; look.g3.tag = { text: 'Lleno', tone: 'ok' };
out = ctx.invRoomSceneSVG(sc, ctx.CAM0, look, {});
const cylDe = id => { const i = out.svg.indexOf('data-gas-id="' + id + '"'); return out.svg.slice(i, out.svg.indexOf('</g>', i)); };
ok('el de pared lleva barrita de nivel; el del buffer no', /rm-level/.test(cylDe('g2')) && !/rm-level/.test(cylDe('g8')) && /rm-cyl--gauge/.test(out.svg) && /rm-cyl--stock/.test(out.svg));
ok('en la vista general no hay etiquetas sueltas de buffer (se enciman): las resume el recuadro', !/class="rm-stag/.test(out.svg));
ok('el recuadro de la zona resume llenos y vacíos', /class="rm-chip-sub"[^>]*>1 vacío</.test(out.svg) && /G · 1\/2<\/text><text class="rm-chip-sub"[^>]*>1 lleno</.test(out.svg));
ok('el recuadro de una zona se toca para entrar', /class="rm-chip rm-chip--buffer" data-zone="E" tabindex="0" role="button"/.test(out.svg));
ok('la etiqueta del de pared suma su %', />CO 50 · 90%</.test(out.svg));
ok('fuera de pared no hay marcador aunque esté crítico', (out.svg.match(/class="rm-pin/g) || []).length === 1);

console.log('\n== Resumen de zona ==');
const sl = code => sc.slots.filter(x => x.zone === code);
ok('conectados: críticos y bajos', ctx.invRoomZoneSummary(sl('A'), { g1: { tone: 'low' } }, 'wall') === '1 crítico');
ok('buffer: llenos · a medias · vacíos · vencidos', ctx.invRoomZoneSummary([{ gasId: 'a' }, { gasId: 'b' }, { gasId: 'c' }, { gasId: 'd' }, { gasId: 'e' }],
    { a: { tag: { text: 'Lleno' } }, b: { tag: { text: 'Lleno' } }, c: { tag: { text: '40%' } }, d: { tag: { text: 'Vacío' } }, e: { tag: { text: 'Vencido' } } }, 'buffer') === '2 llenos · 1 a medias · 1 vacío · 1 vencido');
ok('sin nada que decir, vacío', ctx.invRoomZoneSummary(sl('B'), {}, 'wall') === '');

console.log('\n== Entrar a una zona ==');
let fc = ctx.invRoomFocusCam(L, sc, 'C');
ok('la pared C se ve de frente (cámara girada -90°, baja) y de cerca', fc.az === -90 && fc.el < 30 && fc.zoom > 1.1, JSON.stringify(fc));
const fbox = ctx.invRoomBox(L, fc), cC = sc.slots.filter(x => x.zone === 'C');
const mid = ctx.invRoomProject(cC[5].x, (cC[5].y + cC[6].y) / 2, 0.6, fc, C);
const bcx = fbox.x + fbox.w / 2, scx = bcx + fc.panX + fc.zoom * (mid.x - bcx);
ok('…y la zona queda al centro de la vista', Math.abs(scx - bcx) < fbox.w * 0.08, (scx - bcx).toFixed(1));
ok('la cámara de un buffer lo ve de frente, como una pared', ctx.invRoomFocusCam(L, sc, 'E').el <= 15 && ctx.invRoomFocusCam(L, sc, 'E').az === 0);
ok('cada zona tiene su lado para verla de frente', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].every(z => typeof L.zones[z].face === 'number'));
ok('el buffer se ve de frente desde la entrada', ctx.invRoomFocusCam(L, sc, 'E').az === 0);
const fcTel = ctx.invRoomFocusCam(L, sc, 'C', { view: { w: 400, h: 500 }, minGapPx: 58 }), fcPc = ctx.invRoomFocusCam(L, sc, 'C', { view: { w: 1300, h: 600 }, minGapPx: 58 });
ok('en el teléfono se acerca más (sus datos no se enciman) y arranca por la izquierda de la zona', fcTel.zoom > fcPc.zoom * 1.5 && fcTel.panX > fcPc.panX, JSON.stringify([fcTel.zoom, fcPc.zoom]));
ok('zona que no existe → null', ctx.invRoomFocusCam(L, sc, 'Z') === null);
let lp = ctx.invRoomCamLerp({ az: 170, el: 40, zoom: 1, panX: 0, panY: 0 }, { az: -170, el: 20, zoom: 3, panX: 10, panY: -10 }, 0.5);
ok('el vuelo gira por el camino corto (170° → -170° pasa por 180°)', Math.abs(lp.az - 180) < 1e-9 && lp.el === 30 && lp.zoom === 2 && lp.panX === 5);
const opened = n => { const z = ctx.invRoomZoneSlots(L.zones.E, 14).pts[n - 1], o = ctx.invRoomExplodeOffset(L.zones.E, n, 1); return [z.x + o[0], z.y + o[1]]; };
const fila = [1, 2, 3, 4, 5, 6, 13, 7, 8, 9, 10, 11, 12, 14].map(opened);
ok('al abrir el buffer, los 14 quedan en UNA fila de frente (sobre la línea de la fila del frente)', fila.every(p => near(p[1], L.zones.E.rows[1][1])));
ok('…en orden: la del fondo (con su grande) a un lado y la del frente al otro, sin encimarse', fila.every((p, i) => i === 0 || p[0] - fila[i - 1][0] >= 0.35));
ok('…a medio vuelo, a medio camino; cerrado o en una pared, nada', near(ctx.invRoomExplodeOffset(L.zones.E, 1, 0.5)[0], ctx.invRoomExplodeOffset(L.zones.E, 1, 1)[0] / 2) &&
    JSON.stringify(ctx.invRoomExplodeOffset(L.zones.E, 1, 0)) === '[0,0]' && JSON.stringify(ctx.invRoomExplodeOffset(L.zones.C, 1, 1)) === '[0,0]');
const fE = ctx.invRoomFocusCam(L, sc, 'E');
const scEo = ctx.invRoomSceneSVG(sc, fE, look, { focus: 'E', explode: { E: 1 } });
const scEc = ctx.invRoomSceneSVG(sc, fE, look, { focus: 'E', explode: { E: 0 } });
const xDe = (svg, code) => { const m = new RegExp('data-code="' + code + '"[^>]*>(?:<title>[^<]*</title>)?<path class="rm-body" d="M([-0-9.]+)').exec(svg); return m ? parseFloat(m[1]) : NaN; };
ok('en la escena, abierto, la fila del fondo se desliza a un lado', Math.abs(xDe(scEo.svg, 'E02') - xDe(scEc.svg, 'E02')) > 20, xDe(scEo.svg, 'E02') + ' vs ' + xDe(scEc.svg, 'E02'));
look.g2.ctrl = 'CO-50'; look.g2.psi = 3100;
let fl = ctx.invRoomSceneSVG(sc, fc, look, { focus: 'C', focusLabels: 'C', pxPerUnit: 3 });
ok('al llegar a una zona: datos grandes debajo de cada cilindro (código, nombre, %, psi, control)', /class="rm-flbl"/.test(fl.svg) && /rm-fl-val[^>]*>90%</.test(fl.svg) && />3100 psi</.test(fl.svg) && />CO-50</.test(fl.svg));
ok('…a tamaño fijo en pantalla (la letra se divide entre los px por unidad)', /rm-fl-val" x="[^"]+" y="[^"]+" style="font-size:5\.00px/.test(fl.svg));
ok('…y sin la etiqueta chica de esa zona', !/class="rm-lbl" x="[^"]+" y="[^"]+">CO 50/.test(fl.svg));
fl = ctx.invRoomSceneSVG(sc, fc, look, { focus: 'C', focusLabels: 'C', pxPerUnit: 0.3 });
ok('con poco espacio entre cilindros (teléfono) solo el % para que no se encimen', /rm-fl-val/.test(fl.svg) && !/rm-fl-name/.test(fl.svg) && !/rm-fl-code/.test(fl.svg));
ok('en la zona, las posiciones libres dicen "libre"', /rm-fl-free[^>]*>libre</.test(ctx.invRoomSceneSVG(sc, fc, look, { focus: 'C', focusLabels: 'C', pxPerUnit: 3 }).svg));
fl = ctx.invRoomSceneSVG(sc, fE, look, { focus: 'E', explode: { E: 1 }, focusLabels: 'E', pxPerUnit: 3 });
ok('en un buffer, los datos llevan la etiqueta Lleno / Vacío', /class="rm-stag rm-stag--empty"/.test(fl.svg));
ok('dentro de una zona, los recuadros de todas se esconden (la barra de la zona dice lo mismo)', (fl.svg.match(/class="rm-chip [^"]*rm-off/g) || []).length === (fl.svg.match(/class="rm-chip /g) || []).length);
ok('escena con rack abierto sin valores raros', !/NaN|undefined|Infinity/.test(fl.svg));
out = ctx.invRoomSceneSVG(sc, ctx.CAM0, look, { focus: 'C' });
ok('al entrar a C el resto del cuarto se desvanece', /data-gas-id="g1" data-code="A01"/.test(out.svg) && /rm-off" data-gas-id="g1"/.test(out.svg) && !/rm-off" data-gas-id="g2"/.test(out.svg));

console.log('\n== Indicadores y filtro ==');
const info = { g1: { tone: 'low', counts: true, readToday: false, kind: 'wall' }, g2: { tone: 'mid', counts: true, readToday: true, reorder: true, kind: 'wall' },
               g3: { tone: 'ok', counts: true, readToday: false, expired: true, kind: 'cart' }, g8: { tone: 'empty', counts: false, kind: 'buffer' } };
const k = ctx.invRoomKpis(sc, info);
ok('conectados / posiciones de pared', k.connected === 2 && k.wallSlots === 30, k.connected + '/' + k.wallSlots);
ok('en recepción cuenta diablito y buffers', k.reception === 2);
ok('críticos, bajos, vencidos, por pedir', k.critical === 1 && k.low === 1 && k.expired === 1 && k.reorder === 1);
ok('leídos hoy no cuenta los vacíos', k.readToday === 1 && k.toRead === 3);
ok('filtros', ctx.invRoomFilterMatch('critico', info.g1) && ctx.invRoomFilterMatch('critico', info.g2) && !ctx.invRoomFilterMatch('critico', info.g3) &&
    ctx.invRoomFilterMatch('sinleer', info.g1) && !ctx.invRoomFilterMatch('sinleer', info.g2) && ctx.invRoomFilterMatch('recepcion', info.g3) && ctx.invRoomFilterMatch(null, info.g1));

console.log('\n== Soltar en la posición libre más cercana ==');
const c07 = sc.slots.find(s => s.code === 'C07');
const pc = ctx.invRoomProject(c07.x, c07.y, 0, ctx.CAM0, C);
let t = ctx.invRoomNearestSlot(sc.slots, { x: pc.x + 3, y: pc.y - 2 }, ctx.CAM0, 45, L);
ok('cerca de C07 → C07', t && t.code === 'C07', t && t.code);
const a01 = sc.slots.find(s => s.code === 'A01'), pa = ctx.invRoomProject(a01.x, a01.y, 0, ctx.CAM0, C);
t = ctx.invRoomNearestSlot(sc.slots, { x: pa.x, y: pa.y }, ctx.CAM0, 8, L);
ok('una posición ocupada nunca es destino', !t || t.code !== 'A01');
ok('lejos de todo → ninguno', ctx.invRoomNearestSlot(sc.slots, { x: 99999, y: 99999 }, ctx.CAM0, 45, L) === null);

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exitCode = fallaron ? 1 : 0;
