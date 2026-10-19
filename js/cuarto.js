// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.10.0 — El cuarto de gases en vista isométrica (`invRoom*`)        ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// El plano del cuarto de gases dibujado como escena isométrica (SVG propio, sin
// librerías): cada cilindro en su posición real, pintado por nivel y vigencia.
// Tocar un cilindro = su estado y su lectura; arrastrar = reubicarlo; los nuevos
// llegan a una zona de RECEPCIÓN (buffer o diablito) y de ahí se acomodan.
//
// Reglas:
// - El plano NO guarda nada propio. Las posiciones siguen siendo `gas.zone` (A01…) y
//   el número de posiciones de cada zona sigue siendo `invState.zones[].slots`. El
//   layout solo dice DÓNDE está cada zona en el cuarto (`INV_ROOM_LAYOUT`, horneado
//   como `CSV_CONFIGURATIONS`: un cuarto no cambia de forma entre equipos).
// - Los escritores son los de siempre: `invAddReading` (lectura), `invDropCylinder`
//   (mover), `invGasSetStatus` (estatus). Aquí solo se pinta y se navega.
// - Lo que no cabe en el plano se DECLARA (sin zona, zona desconocida, posición
//   repetida), nunca se esconde.
// - Las funciones de geometría y escena son PURAS (tests/cuarto.node.js).

// ── El cuarto (unidades ≈ metros; y crece hacia la entrada) ──────────────
// Forma de "q": la panza es el cuarto principal; el palito, la entrada; debajo de
// la panza, el cuartito de inflamables (se entra por fuera, por su pared de abajo).
var INV_ROOM_LAYOUT = {
    floor: [[0, 0], [5.8, 0], [5.8, 5.1], [4.4, 5.1], [4.4, 6.9], [3.2, 6.9], [3.2, 5.1], [0, 5.1]],
    rooms: [{ id: 'inflamables', label: 'Inflamables', floor: [[0.7, 5.1], [3.2, 5.1], [3.2, 6.6], [0.7, 6.6]] }],
    // [x1, y1, x2, y2, nx, ny] — n = hacia AFUERA del cuarto (decide si el muro queda
    // de fondo y se dibuja sólido, o de frente y se dibuja translúcido).
    walls: [
        [0, 0, 5.8, 0, 0, -1],
        [5.8, 0, 5.8, 0.1, 1, 0], [5.8, 0.9, 5.8, 5.1, 1, 0],
        [5.8, 5.1, 4.4, 5.1, 0, 1],
        [4.4, 5.1, 4.4, 6.9, 1, 0],
        [4.4, 6.9, 4.25, 6.9, 0, 1], [3.35, 6.9, 3.2, 6.9, 0, 1],
        [3.2, 6.9, 3.2, 5.1, -1, 0],
        [3.2, 5.1, 0, 5.1, 0, 1],
        [0, 5.1, 0, 5.05, -1, 0], [0, 4.45, 0, 0, -1, 0],
        [0.7, 5.1, 0.7, 6.6, -1, 0],
        [0.7, 6.6, 1.25, 6.6, 0, 1], [2.15, 6.6, 3.2, 6.6, 0, 1]
    ],
    doors: [
        { id: 'entrada', label: 'Entrada', a: [3.35, 6.9], b: [4.25, 6.9] },
        { id: 'derecha', label: 'Puerta', a: [5.8, 0.1], b: [5.8, 0.9] },
        { id: 'izq', label: 'Puerta', a: [0, 4.45], b: [0, 5.05] },
        { id: 'inflamables', label: 'Acceso por fuera', a: [1.25, 6.6], b: [2.15, 6.6] }
    ],
    // kind: 'wall' = conectado a un tablero · 'buffer' = stock/vacíos · 'cart' = diablito
    //       'loose' = sin conectar dentro de un cuartito.
    // Una zona de línea (`from`→`to`) reparte las posiciones que tenga, sean cuantas sean;
    // la numeración va de izquierda a derecha COMO SE VE LA PARED DE FRENTE. `face` = giro de
    // la cámara para verla de frente (al entrar a la zona).
    zones: {
        A: { kind: 'wall', label: 'Pared izquierda', from: [0.32, 4.25], to: [0.32, 0.4], wall: [-1, 0], face: 90 },
        B: { kind: 'wall', label: 'Pared del fondo', from: [2.7, 0.32], to: [3.9, 0.32], wall: [0, -1], face: 0 },
        C: { kind: 'wall', label: 'Pared derecha', from: [5.48, 1.15], to: [5.48, 4.8], wall: [1, 0], face: -90 },
        D: { kind: 'wall', label: 'Inflamables · conectados', from: [1.3, 5.38], to: [1.75, 5.38], wall: [0, -1], room: 'inflamables', face: 0 },
        // Corren de izquierda a derecha, con los dos grandes del lado de la pared C.
        E: { kind: 'buffer', label: 'Buffer 1', rack: [1.86, 1.58, 3.24, 2.26],
             rows: [[2.0, 1.75, 3.1, 1.75], [2.0, 2.09, 3.1, 2.09]], perRow: 6, big: [[3.5, 1.75], [3.5, 2.09]], chipOffset: [-1.05, 0], face: 0 },
        F: { kind: 'buffer', label: 'Buffer 2', rack: [1.86, 3.0, 3.24, 3.68],
             rows: [[2.0, 3.17, 3.1, 3.17], [2.0, 3.51, 3.1, 3.51]], perRow: 6, big: [[3.5, 3.17], [3.5, 3.51]], chipOffset: [-1.05, 0], face: 0 },
        // Recargado en la pared del cuarto de inflamables (lado de la entrada); `back` es su respaldo.
        G: { kind: 'cart', label: 'Diablito', cart: [3.22, 5.45, 3.62, 6.05], back: [3.22, 5.45, 3.22, 6.05], points: [[3.44, 5.9], [3.44, 5.6]], chipOffset: [0.45, 0], face: 90 },
        H: { kind: 'loose', label: 'Inflamables · sin conectar', from: [2.95, 5.5], to: [2.95, 6.35], room: 'inflamables', chipOffset: [-0.45, 0], face: -90 }
    }
};

var INV_ROOM_S = 100;                       // px de escena por unidad
var INV_ROOM_CAM_DEFAULT = { az: 25, el: 42, zoom: 1, panX: 0, panY: 0 };
var INV_ROOM_CAM_PLAN = { az: 0, el: 90, zoom: 1, panX: 0, panY: 0 };
var INV_ROOM_KIND_LABEL = { wall: 'Conectados', buffer: 'Buffer', cart: 'Diablito', loose: 'Sin conectar' };
// Recepción: donde nace un cilindro nuevo (decisión del laboratorio: buffer o diablito).
var INV_ROOM_RECEPTION_KINDS = ['cart', 'buffer'];

// ══════════════════════════════════════════════════════════════════════
// Geometría y escena — PURAS
// ══════════════════════════════════════════════════════════════════════

/** "A03" → {zone:'A', n:3}. Empata con el id de zona MÁS LARGO (una zona "AB" no es "A"). */
function invRoomParseCode(code, zoneIds) {
    var c = String(code || '').trim().toUpperCase();
    if (!c) return null;
    var ids = (zoneIds || []).map(function(z) { return String(z).toUpperCase(); })
        .sort(function(a, b) { return b.length - a.length; });
    for (var i = 0; i < ids.length; i++) {
        if (c.indexOf(ids[i]) !== 0) continue;
        var n = parseInt(c.slice(ids[i].length), 10);
        if (isFinite(n) && n > 0 && /^\d+$/.test(c.slice(ids[i].length))) return { zone: ids[i], n: n };
    }
    return null;
}

/** Código de posición: zona + número a dos dígitos (el mismo que usa la retícula). */
function invRoomCode(zoneId, n) { return String(zoneId) + (n < 10 ? '0' : '') + n; }

function _invRoomLerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function _invRoomLine(from, to, n) {
    if (n <= 0) return [];
    if (n === 1) return [_invRoomLerp(from, to, 0.5)];
    var out = [];
    for (var i = 0; i < n; i++) out.push(_invRoomLerp(from, to, i / (n - 1)));
    return out;
}

/**
 * Posiciones de una zona en el piso, en orden de número de posición.
 * Una zona de línea reparte `n` posiciones; un buffer llena sus filas y luego los
 * dos grandes de la orilla; el diablito usa sus puntos fijos. Lo que exceda lo que
 * la zona puede dibujar se devuelve aparte (`extra`) para declararlo.
 */
function invRoomZoneSlots(def, n) {
    n = Math.max(0, parseInt(n, 10) || 0);
    if (!def) return { pts: [], extra: n };
    var pts = [];
    if (def.from && def.to) {
        _invRoomLine(def.from, def.to, n).forEach(function(p) { pts.push({ x: p[0], y: p[1], big: false }); });
    } else if (def.rows) {
        var per = def.perRow || 6;
        def.rows.forEach(function(r) {
            _invRoomLine([r[0], r[1]], [r[2], r[3]], per).forEach(function(p) { pts.push({ x: p[0], y: p[1], big: false }); });
        });
        (def.big || []).forEach(function(p) { pts.push({ x: p[0], y: p[1], big: true }); });
    } else if (def.points) {
        def.points.forEach(function(p) { pts.push({ x: p[0], y: p[1], big: false }); });
    }
    var extra = Math.max(0, n - pts.length);
    return { pts: pts.slice(0, n), extra: extra };
}

/** Las zonas de recepción, en el orden en que se proponen (diablito primero). */
function invRoomReceptionZones(zones, layout) {
    layout = layout || INV_ROOM_LAYOUT;
    var out = [];
    INV_ROOM_RECEPTION_KINDS.forEach(function(kind) {
        (zones || []).forEach(function(z) {
            var d = layout.zones[z.id];
            if (d && d.kind === kind) out.push(z.id);
        });
    });
    return out;
}

/**
 * LA escena del cuarto: dónde cae cada posición y qué cilindro la ocupa.
 * @param {object} layout  INV_ROOM_LAYOUT
 * @param {Array} zones    invState.zones ({id, label, slots})
 * @param {Array} gases    invState.gases ({id, zone, status, …})
 * @returns {{slots, zones, unplaced}}
 *   slots: [{code, zone, kind, n, x, y, big, gasId|null, dupIds:[]}]
 *   unplaced: [{gasId, reason:'sin-zona'|'zona-desconocida'|'fuera-del-plano'|'repetida', zone}]
 */
function invRoomScene(layout, zones, gases) {
    layout = layout || INV_ROOM_LAYOUT;
    var ids = (zones || []).map(function(z) { return z.id; });
    var slots = [], byCode = {}, zoneOut = [], unplaced = [];
    (zones || []).forEach(function(z) {
        var def = layout.zones[z.id];
        var gen = invRoomZoneSlots(def, z.slots);
        var zs = { id: z.id, label: (def && def.label) || z.label || ('Zona ' + z.id), kind: def ? def.kind : null,
                   room: def && def.room || null, total: z.slots || 0, drawn: gen.pts.length, used: 0, inPlan: !!def };
        gen.pts.forEach(function(p, i) {
            var s = { code: invRoomCode(z.id, i + 1), zone: z.id, kind: zs.kind, n: i + 1, x: p.x, y: p.y, big: p.big, gasId: null, dupIds: [] };
            slots.push(s); byCode[s.code] = s;
        });
        zoneOut.push(zs);
    });
    var zoneById = {};
    zoneOut.forEach(function(z) { zoneById[z.id] = z; });
    (gases || []).forEach(function(g) {
        if (!g || !g.id) return;
        var raw = String(g.zone || '').trim();
        if (!raw) { unplaced.push({ gasId: g.id, reason: 'sin-zona', zone: '' }); return; }
        var p = invRoomParseCode(raw, ids);
        if (!p) { unplaced.push({ gasId: g.id, reason: 'zona-desconocida', zone: raw }); return; }
        var s = byCode[invRoomCode(p.zone, p.n)];
        if (!s) { unplaced.push({ gasId: g.id, reason: 'fuera-del-plano', zone: raw }); return; }
        if (s.gasId) { s.dupIds.push(g.id); unplaced.push({ gasId: g.id, reason: 'repetida', zone: s.code }); return; }
        s.gasId = g.id;
        if (zoneById[p.zone]) zoneById[p.zone].used++;
    });
    return { slots: slots, zones: zoneOut, unplaced: unplaced };
}

/** Paso del cilindro en su ciclo de vida, DERIVADO (nunca se guarda). */
var INV_ROOM_STEPS = [
    { id: 'recepcion', label: 'Recepción / stock' },
    { id: 'conectado', label: 'Conectado' },
    { id: 'enuso', label: 'En uso' },
    { id: 'vacio', label: 'Vacío' }
];
function invRoomLifecycle(gas, kind) {
    if (!gas) return null;
    if (gas.status === 'Empty') return 'vacio';
    if (kind === 'wall') return gas.status === 'In use' ? 'enuso' : 'conectado';
    return 'recepcion';
}

/** Centro del cuarto (eje de giro de la cámara). */
function invRoomCenter(layout) {
    var xs = [], ys = [];
    (layout || INV_ROOM_LAYOUT).floor.forEach(function(p) { xs.push(p[0]); ys.push(p[1]); });
    return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2];
}

/**
 * LA proyección. Gira el piso `az` grados alrededor del centro y lo inclina `el`
 * grados (90 = visto desde arriba). Devuelve coordenadas de escena y `d`, la
 * profundidad: más grande = más cerca de quien mira (se pinta después).
 */
function invRoomProject(x, y, z, cam, center) {
    var az = (cam.az || 0) * Math.PI / 180, el = Math.max(10, Math.min(90, cam.el == null ? 42 : cam.el)) * Math.PI / 180;
    var dx = x - center[0], dy = y - center[1];
    var xr = dx * Math.cos(az) - dy * Math.sin(az);
    var yr = dx * Math.sin(az) + dy * Math.cos(az);
    var S = INV_ROOM_S;
    return { x: xr * S, y: (yr * Math.sin(el) - (z || 0) * Math.cos(el)) * S, d: yr };
}

/** Normaliza una cámara guardada (preferencia del equipo) a valores válidos. */
function invRoomCamNormalize(c, narrow) {
    var base = narrow ? INV_ROOM_CAM_PLAN : INV_ROOM_CAM_DEFAULT;
    c = (c && typeof c === 'object') ? c : {};
    var num = function(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; };
    var az = num(c.az, base.az) % 360; if (az > 180) az -= 360; if (az < -180) az += 360;
    return {
        az: az,
        el: Math.max(20, Math.min(90, num(c.el, base.el))),
        zoom: Math.max(0.5, Math.min(5, num(c.zoom, base.zoom))),
        panX: num(c.panX, 0), panY: num(c.panY, 0)
    };
}

/** ¿El muro queda de fondo (sólido) para esta cámara? Su normal apunta lejos de quien mira. */
function invRoomWallIsBack(nx, ny, cam) {
    var az = (cam.az || 0) * Math.PI / 180;
    var nyr = nx * Math.sin(az) + ny * Math.cos(az);
    return nyr < -0.3;
}

// ── Pintado ──────────────────────────────────────────────────────────
// Semáforo de nivel de los cilindros de pared: verde → amarillo → anaranjado → rojo.
// Anaranjado y rojo SON los umbrales de invGasLevel (INV_LEVEL_LOW_PCT / _CRITICAL_PCT): el
// plano no puede decir "bien" de lo que las alertas ya dan por bajo (v21.1). El amarillo
// (a la mitad o menos) es solo visual y no dispara nada.
var INV_ROOM_HALF_PCT = 50;
var INV_ROOM_FULL_PCT = 90;   // buffers: de aquí para arriba se etiqueta "Lleno"
var INV_ROOM_TONES = {
    ok:      { fill: '#10b981', dark: '#047857', light: '#6ee7b7', label: 'Más de la mitad' },
    half:    { fill: '#eab308', dark: '#a16207', light: '#fde047', label: 'A la mitad o menos' },
    mid:     { fill: '#f97316', dark: '#c2410c', light: '#fdba74', label: 'Bajo' },
    low:     { fill: '#ef4444', dark: '#991b1b', light: '#fca5a5', label: 'Crítico' },
    empty:   { fill: '#94a3b8', dark: '#475569', light: '#cbd5e1', label: 'Vacío' },
    none:    { fill: '#94a3b8', dark: '#64748b', light: '#e2e8f0', label: 'Sin lecturas' }
};

/** Color del nivel. PURA: recibe {status, pct, levelStatus} (levelStatus = invGasLevel().status). */
function invRoomLevelTone(x) {
    if (!x) return 'none';
    if (x.status === 'Empty') return 'empty';
    if (x.levelStatus === 'sinlecturas' || x.pct == null) return 'none';
    if (x.levelStatus === 'critico') return 'low';
    if (x.levelStatus === 'bajo') return 'mid';
    return x.pct <= INV_ROOM_HALF_PCT ? 'half' : 'ok';
}

/**
 * Etiqueta de un cilindro que NO está conectado (buffer, diablito, sin conectar): lo que
 * importa ahí es si sirve para cambiar uno de pared o hay que devolverlo. PURA.
 * "Lleno" solo si de verdad lo está (o es nuevo, sin lecturas): uno guardado a medias dice su %.
 */
function invRoomStockTag(x) {
    if (!x) return null;
    if (x.status === 'Empty') return { text: 'Vacío', tone: 'empty' };
    if (x.expired) return { text: 'Vencido', tone: 'bad' };
    if (x.levelStatus === 'sinlecturas' || x.pct == null || x.pct >= INV_ROOM_FULL_PCT) return { text: 'Lleno', tone: 'ok' };
    if (x.levelStatus === 'critico') return { text: x.pct + '% · casi vacío', tone: 'bad' };
    return { text: x.pct + '%', tone: 'muted' };
}

// La tapa lleva el color: en una fila vista a lo largo, cada cilindro tapa la barrita del
// siguiente, pero las tapas siempre se ven. Conectado = color del nivel; fuera = su etiqueta.
var INV_ROOM_TAG_DOME = { ok: '#34d399', empty: '#94a3b8', bad: '#f87171', muted: '#ffffff' };
function _invRoomDomeFill(gauge, tone, tag) {
    var f = gauge ? tone.light : (tag && INV_ROOM_TAG_DOME[tag.tone]);
    return f ? ' style="fill:' + f + '"' : '';   // estilo, no atributo: la regla .rm-dome le ganaría
}

function _invRoomPts(arr) { return arr.map(function(p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '); }
function _invRoomEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * La escena como SVG (cadena). PURA: todo lo que depende del estado del cilindro
 * llega en `look[gasId] = {tone, pct, short, pin, dim, aria}`.
 * @param {object} opts {sel, selSlot, moving, labels, layout}
 */
function invRoomSceneSVG(scene, cam, look, opts) {
    opts = opts || {};
    var layout = opts.layout || INV_ROOM_LAYOUT;
    var C = invRoomCenter(layout);
    var P = function(x, y, z) { return invRoomProject(x, y, z, cam, C); };
    var el = Math.max(10, Math.min(90, cam.el)) * Math.PI / 180;
    var sinE = Math.sin(el), cosE = Math.cos(el), S = INV_ROOM_S;
    var top = cam.el >= 80;
    var floorL = [], solid = [], over = [];

    // Piso + loseta
    var fl = layout.floor.map(function(p) { return P(p[0], p[1], 0); });
    floorL.push('<clipPath id="rm-floor-clip"><polygon points="' + _invRoomPts(fl) + '"/></clipPath>');
    floorL.push('<polygon class="rm-floor" points="' + _invRoomPts(fl) + '"/>');
    var tiles = [];
    for (var tx = 0; tx <= 6; tx += 0.6) { var a = P(tx, -0.2, 0), b = P(tx, 7.2, 0); tiles.push('M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1)); }
    for (var ty = 0; ty <= 7.2; ty += 0.6) { var c1 = P(-0.2, ty, 0), c2 = P(6, ty, 0); tiles.push('M' + c1.x.toFixed(1) + ' ' + c1.y.toFixed(1) + 'L' + c2.x.toFixed(1) + ' ' + c2.y.toFixed(1)); }
    floorL.push('<path class="rm-tiles" clip-path="url(#rm-floor-clip)" d="' + tiles.join('') + '"/>');
    (layout.rooms || []).forEach(function(r) {
        var rp = r.floor.map(function(p) { return P(p[0], p[1], 0); });
        floorL.push('<polygon class="rm-room rm-room--' + r.id + '" points="' + _invRoomPts(rp) + '"/>');
        var cx = 0, cy = 0; r.floor.forEach(function(p) { cx += p[0]; cy += p[1]; });
        var lc = P(cx / r.floor.length, cy / r.floor.length + 0.12, 0);
        floorL.push('<text class="rm-floor-lbl" x="' + lc.x.toFixed(1) + '" y="' + lc.y.toFixed(1) + '">⚠ ' + _invRoomEsc(r.label) + '</text>');
    });
    (layout.doors || []).forEach(function(d) {
        var a = P(d.a[0], d.a[1], 0), b = P(d.b[0], d.b[1], 0);
        floorL.push('<line class="rm-door" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>');
        var m = P((d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, 0);
        over.push({ d: 99, s: '<text class="rm-door-lbl" x="' + m.x.toFixed(1) + '" y="' + (m.y + 16).toFixed(1) + '">🚪 ' + _invRoomEsc(d.label) + '</text>' });
    });

    // Muros: de fondo sólidos y altos; de frente translúcidos (no tapan nada).
    var WH = 1.25;
    layout.walls.forEach(function(w) {
        var back = invRoomWallIsBack(w[4], w[5], cam);
        var p1 = P(w[0], w[1], 0), p2 = P(w[2], w[3], 0), p3 = P(w[2], w[3], WH), p4 = P(w[0], w[1], WH);
        var dmid = (p1.d + p2.d) / 2;
        solid.push({ d: back ? dmid - 2 : dmid + 0.05,
            s: '<polygon class="rm-wall' + (back ? '' : ' rm-wall--front') + '" points="' + _invRoomPts([p1, p2, p3, p4]) + '"/>' +
               '<line class="rm-wall-cap' + (back ? '' : ' rm-wall-cap--front') + '" x1="' + p4.x.toFixed(1) + '" y1="' + p4.y.toFixed(1) + '" x2="' + p3.x.toFixed(1) + '" y2="' + p3.y.toFixed(1) + '"/>' });
    });

    // Racks de los buffers y diablito
    Object.keys(layout.zones).forEach(function(zid) {
        var def = layout.zones[zid];
        if (def.rack) {
            var r = def.rack, H = 0.5;
            var corners = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
            floorL.push('<polygon class="rm-rack-plate" points="' + _invRoomPts(corners.map(function(c) { return P(c[0], c[1], 0); })) + '"/>');
            for (var i = 0; i < 4; i++) {
                var c0 = corners[i], c1 = corners[(i + 1) % 4];
                var t0 = P(c0[0], c0[1], H), t1 = P(c1[0], c1[1], H);
                solid.push({ d: (t0.d + t1.d) / 2 + 0.02, s: '<line class="rm-rack" x1="' + t0.x.toFixed(1) + '" y1="' + t0.y.toFixed(1) + '" x2="' + t1.x.toFixed(1) + '" y2="' + t1.y.toFixed(1) + '"/>' });
                var b0 = P(c0[0], c0[1], 0);
                solid.push({ d: b0.d + 0.02, s: '<line class="rm-rack" x1="' + b0.x.toFixed(1) + '" y1="' + b0.y.toFixed(1) + '" x2="' + t0.x.toFixed(1) + '" y2="' + t0.y.toFixed(1) + '"/>' });
            }
        }
        if (def.cart) {
            var k = def.cart;
            floorL.push('<polygon class="rm-cart-plate" points="' + _invRoomPts([[k[0], k[1]], [k[2], k[1]], [k[2], k[3]], [k[0], k[3]]].map(function(c) { return P(c[0], c[1], 0.04); })) + '"/>');
            var bk = def.back || [k[0], k[1], k[2], k[1]];
            var u1 = P(bk[0], bk[1], 0), u2 = P(bk[2], bk[3], 0), u3 = P(bk[2], bk[3], 1.0), u4 = P(bk[0], bk[1], 1.0);
            solid.push({ d: (u1.d + u2.d) / 2 - 0.01, s: '<polygon class="rm-cart" points="' + _invRoomPts([u1, u2, u3, u4]) + '"/>' });
        }
    });

    // Posiciones y cilindros
    var chips = {};
    scene.slots.forEach(function(s) {
        var def = layout.zones[s.zone] || {};
        var r = s.big ? 0.14 : (s.kind === 'wall' ? 0.1 : 0.095);
        var h = s.big ? 1.0 : 0.85;
        var b = P(s.x, s.y, 0), t = P(s.x, s.y, h);
        var rx = r * S, ry = r * S * sinE;
        var off = opts.focus && s.zone !== opts.focus ? ' rm-off' : '';   // al entrar a una zona, lo demás se desvanece
        (chips[s.zone] = chips[s.zone] || []).push(s);

        if (!s.gasId) {
            var cls = 'rm-slot' + (opts.selSlot === s.code ? ' rm-slot--sel' : '') + off;
            floorL.push('<g class="' + cls + '" data-code="' + s.code + '" tabindex="0" role="button" aria-label="' + s.code + ': posición libre">' +
                '<ellipse cx="' + b.x.toFixed(1) + '" cy="' + b.y.toFixed(1) + '" rx="' + (rx * 1.15).toFixed(1) + '" ry="' + (ry * 1.15 + 0.5).toFixed(1) + '"/>' +
                '<text x="' + b.x.toFixed(1) + '" y="' + (b.y + 4).toFixed(1) + '">' + s.n + '</text></g>');
            return;
        }
        var L = look[s.gasId] || { tone: 'none', pct: 0, short: '', pin: '', aria: s.code };
        var tone = INV_ROOM_TONES[L.tone] || INV_ROOM_TONES.none;
        var pct = Math.max(0, Math.min(1, (L.pct || 0) / 100));
        var lv = P(s.x, s.y, h * 0.92 * pct);
        var sel = opts.sel === s.gasId, mov = opts.moving === s.gasId;
        var g = '';
        // sombra y anillo de selección en el piso
        floorL.push('<ellipse class="rm-shadow" cx="' + (b.x + rx * 0.35).toFixed(1) + '" cy="' + (b.y + ry * 0.3).toFixed(1) + '" rx="' + (rx * 1.25).toFixed(1) + '" ry="' + (ry * 1.25 + 0.5).toFixed(1) + '"/>');
        if (sel || mov) floorL.push('<ellipse class="rm-selring' + (mov ? ' rm-selring--move' : '') + '" cx="' + b.x.toFixed(1) + '" cy="' + b.y.toFixed(1) + '" rx="' + (rx * 1.9).toFixed(1) + '" ry="' + (ry * 1.9 + 1).toFixed(1) + '"/>');
        // panel y manguera (cilindro conectado)
        if (s.kind === 'wall' && def.wall) {
            var px = s.x + def.wall[0] * 0.24, py = s.y + def.wall[1] * 0.24;
            var ux = -def.wall[1], uy = def.wall[0];
            var pc = [P(px - ux * 0.09, py - uy * 0.09, 0.98), P(px + ux * 0.09, py + uy * 0.09, 0.98), P(px + ux * 0.09, py + uy * 0.09, 1.14), P(px - ux * 0.09, py - uy * 0.09, 1.14)];
            var pm = P(px, py, 0.98);
            solid.push({ d: pm.d - 0.001, s: '<polygon class="rm-reg' + off + '" points="' + _invRoomPts(pc) + '"/>' +
                '<path class="rm-hose' + off + '" d="M' + pm.x.toFixed(1) + ' ' + pm.y.toFixed(1) + ' Q' + ((pm.x + t.x) / 2).toFixed(1) + ' ' + (Math.max(pm.y, t.y) + 14).toFixed(1) + ' ' + t.x.toFixed(1) + ' ' + (t.y - 3).toFixed(1) + '"/>' });
        }
        var gauge = s.kind === 'wall';   // solo los conectados muestran la barrita de nivel
        g += '<g class="rm-cyl rm-cyl--' + L.tone + (gauge ? ' rm-cyl--gauge' : ' rm-cyl--stock') + (L.dim ? ' rm-dim' : '') + (sel ? ' rm-cyl--sel' : '') + off + '" data-gas-id="' + _invRoomEsc(s.gasId) + '" data-code="' + s.code + '" tabindex="0" role="button" aria-label="' + _invRoomEsc(L.aria || s.code) + '"><title>' + _invRoomEsc(L.aria || s.code) + '</title>';
        // cuerpo (metal) + nivel (color del estado) + domo + válvula
        g += '<path class="rm-body" d="M' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'L' + (t.x - rx).toFixed(1) + ' ' + t.y.toFixed(1) + 'L' + (t.x + rx).toFixed(1) + ' ' + t.y.toFixed(1) + 'L' + (b.x + rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 0 1 ' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'Z"/>';
        if (gauge && !top && pct > 0) {
            g += '<path class="rm-level" fill="url(#rm-g-' + L.tone + ')" d="M' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'L' + (lv.x - rx).toFixed(1) + ' ' + lv.y.toFixed(1) + 'A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 0 0 ' + (lv.x + rx).toFixed(1) + ' ' + lv.y.toFixed(1) + 'L' + (b.x + rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 0 1 ' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'Z"/>';
        }
        g += '<ellipse class="rm-dome" cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" rx="' + rx.toFixed(1) + '" ry="' + (ry + 0.3).toFixed(1) + '"' + _invRoomDomeFill(gauge, tone, L.tag) + '/>';
        if (top && gauge) {
            var circ = 2 * Math.PI * rx * 0.78;
            g += '<circle class="rm-ring" cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" r="' + (rx * 0.78).toFixed(1) + '" stroke="' + tone.fill + '" stroke-dasharray="' + (circ * pct).toFixed(1) + ' ' + circ.toFixed(1) + '" transform="rotate(-90 ' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) + ')"/>';
        }
        var vh = Math.max(2, 0.08 * S * cosE);
        g += '<rect class="rm-valve" x="' + (t.x - rx * 0.28).toFixed(1) + '" y="' + (t.y - vh - 1).toFixed(1) + '" width="' + (rx * 0.56).toFixed(1) + '" height="' + vh.toFixed(1) + '" rx="1.5"/>';
        g += '</g>';
        solid.push({ d: b.d, s: g });

        // Fuera de pared NO hay etiqueta suelta en la vista general: en un buffer visto en 3D se
        // enciman. La tapa lleva el color, el recuadro de la zona los resume y la vista de frente
        // (al entrar a la zona) los dice uno por uno.
        // Marcador (como los pines del tablero de almacén): crítico, vencido o pedir ya
        if (gauge && L.pin) {
            var pin = top ? { x: t.x, y: t.y - rx - 6 } : P(s.x, s.y, h + 0.42);
            var pt = INV_ROOM_TONES[L.pin === 'pedir' ? 'mid' : 'low'];
            over.push({ d: b.d, s: '<g class="rm-pin' + (L.dim ? ' rm-dim' : '') + off + '" aria-hidden="true"><path d="M' + pin.x.toFixed(1) + ' ' + pin.y.toFixed(1) + 'c-5 -7 -8 -10 -8 -14a8 8 0 1 1 16 0c0 4 -3 7 -8 14z" fill="' + pt.fill + '" stroke="#fff" stroke-width="1.5"/>' +
                '<text x="' + pin.x.toFixed(1) + '" y="' + (pin.y - 10).toFixed(1) + '">!</text></g>' });
        }
        // En buffers, diablito y cuartito los cilindros van pegados y sus etiquetas se enciman
        // desde cualquier ángulo: ahí el nombre sale al pasar el ratón (<title>) y en el panel.
        if (opts.labels !== false && L.short && gauge) {
            var lt = L.short + (L.tone !== 'none' && L.tone !== 'empty' ? ' · ' + Math.round(L.pct || 0) + '%' : '');
            over.push({ d: b.d, s: '<text class="rm-lbl' + (L.dim ? ' rm-dim' : '') + off + '" x="' + b.x.toFixed(1) + '" y="' + (b.y + ry + 13).toFixed(1) + '">' + _invRoomEsc(lt) + '</text>' });
        }
    });

    // Recuadro de cada zona: ocupación + resumen (se toca para entrar a la zona)
    scene.zones.forEach(function(z) {
        var ss = chips[z.id];
        if (!ss || !ss.length) return;
        var def = layout.zones[z.id] || {};
        var cx = 0, cy = 0;
        ss.forEach(function(s) { cx += s.x; cy += s.y; });
        cx /= ss.length; cy /= ss.length;
        if (def.wall) { cx -= def.wall[0] * 0.45; cy -= def.wall[1] * 0.45; }
        if (def.chipOffset) { cx += def.chipOffset[0]; cy += def.chipOffset[1]; }
        // Un buffer va en el piso junto a su rack: flotando alto, el de F quedaba a la altura de E.
        var p = P(cx, cy, def.kind === 'wall' ? 1.55 : def.kind === 'buffer' ? 0.1 : 1.3);
        var txt = z.id + ' · ' + z.used + '/' + z.total;
        var sub = invRoomZoneSummary(ss, look, def.kind);
        var w = Math.max(txt.length * 7.4, sub.length * 5.6) + 22, hh = sub ? 34 : 22;
        var off = opts.focus && opts.focus !== z.id ? ' rm-off' : '';
        over.push({ d: 98, s: '<g class="rm-chip rm-chip--' + (def.kind || 'x') + off + '" data-zone="' + z.id + '" tabindex="0" role="button" aria-label="Ver de frente la zona ' + z.id + ' (' + _invRoomEsc(z.label) + '): ' + z.used + ' de ' + z.total + (sub ? ', ' + _invRoomEsc(sub) : '') + '">' +
            '<rect x="' + (p.x - w / 2).toFixed(1) + '" y="' + (p.y - hh / 2).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hh + '" rx="11"/>' +
            '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + (sub ? -2 : 4)).toFixed(1) + '">' + _invRoomEsc(txt) + '</text>' +
            (sub ? '<text class="rm-chip-sub" x="' + p.x.toFixed(1) + '" y="' + (p.y + 11).toFixed(1) + '">' + _invRoomEsc(sub) + '</text>' : '') + '</g>' });
    });

    var byD = function(a, b) { return a.d - b.d; };
    solid.sort(byD); over.sort(byD);

    var box = invRoomBox(layout, cam);

    var grads = Object.keys(INV_ROOM_TONES).map(function(k) {
        var t = INV_ROOM_TONES[k];
        return '<linearGradient id="rm-g-' + k + '" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="' + t.dark + '"/><stop offset="0.45" stop-color="' + t.light + '"/><stop offset="1" stop-color="' + t.fill + '"/></linearGradient>';
    }).join('');
    var defs = '<defs>' + grads +
        '<linearGradient id="rm-g-metal" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#94a3b8"/><stop offset="0.4" stop-color="#f1f5f9"/><stop offset="1" stop-color="#a8b3c4"/></linearGradient></defs>';
    return {
        box: box,
        svg: defs + '<g class="rm-floor-layer">' + floorL.join('') + '</g>' +
             '<g class="rm-solid-layer">' + solid.map(function(x) { return x.s; }).join('') + '</g>' +
             '<g class="rm-over-layer">' + over.map(function(x) { return x.s; }).join('') + '</g>'
    };
}

/** Caja de la escena (el viewBox) para una cámara: las esquinas del piso a ras y a la altura del muro. PURA. */
function invRoomBox(layout, cam) {
    layout = layout || INV_ROOM_LAYOUT;
    var C = invRoomCenter(layout), xs = [], ys = [];
    layout.floor.concat.apply(layout.floor, (layout.rooms || []).map(function(r) { return r.floor; })).forEach(function(p) {
        [0, 1.25 + 0.6].forEach(function(z) { var q = invRoomProject(p[0], p[1], z, cam, C); xs.push(q.x); ys.push(q.y); });
    });
    var pad = 30;
    return { x: Math.min.apply(null, xs) - pad, y: Math.min.apply(null, ys) - pad,
             w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + pad * 2, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + pad * 2 + 20 };
}

/**
 * Resumen de una zona para su recuadro. PURA. Conectados: cuántos van bajos o críticos.
 * Buffers/diablito/sin conectar: cuántos llenos, a medias, vacíos y vencidos.
 */
function invRoomZoneSummary(slots, look, kind) {
    var c = { lleno: 0, medias: 0, vacio: 0, vencido: 0, bajo: 0, critico: 0 };
    (slots || []).forEach(function(s) {
        var L = s.gasId && look ? look[s.gasId] : null;
        if (!L) return;
        if (kind === 'wall') { if (L.tone === 'low') c.critico++; else if (L.tone === 'mid') c.bajo++; return; }
        var t = L.tag && L.tag.text;
        if (!t) return;
        if (t === 'Lleno') c.lleno++;
        else if (t === 'Vacío') c.vacio++;
        else if (t === 'Vencido') c.vencido++;
        else c.medias++;
    });
    var pl = function(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); };
    var out = [];
    if (kind === 'wall') {
        if (c.critico) out.push(pl(c.critico, 'crítico', 'críticos'));
        if (c.bajo) out.push(pl(c.bajo, 'bajo', 'bajos'));
    } else {
        if (c.lleno) out.push(pl(c.lleno, 'lleno', 'llenos'));
        if (c.medias) out.push(c.medias + ' a medias');
        if (c.vacio) out.push(pl(c.vacio, 'vacío', 'vacíos'));
        if (c.vencido) out.push(pl(c.vencido, 'vencido', 'vencidos'));
    }
    return out.join(' · ');
}

/** Indicadores de la franja de arriba. PURA (recibe la escena y el estado ya resuelto). */
function invRoomKpis(scene, info) {
    var k = { connected: 0, wallSlots: 0, reception: 0, critical: 0, low: 0, expired: 0, reorder: 0, readToday: 0, toRead: 0 };
    scene.slots.forEach(function(s) {
        if (s.kind === 'wall') { k.wallSlots++; if (s.gasId) k.connected++; }
        if (s.gasId && INV_ROOM_RECEPTION_KINDS.indexOf(s.kind) >= 0) k.reception++;
    });
    Object.keys(info || {}).forEach(function(id) {
        var i = info[id];
        if (i.tone === 'low') k.critical++;
        if (i.tone === 'mid') k.low++;
        if (i.expired) k.expired++;
        if (i.reorder) k.reorder++;
        if (i.counts) { k.toRead++; if (i.readToday) k.readToday++; }
    });
    return k;
}

/** ¿Este cilindro entra en el filtro de la franja? PURA. */
function invRoomFilterMatch(filter, i) {
    if (!filter || !i) return true;
    if (filter === 'critico') return i.tone === 'low' || i.tone === 'mid';
    if (filter === 'vencido') return !!i.expired;
    if (filter === 'pedir') return !!i.reorder;
    if (filter === 'sinleer') return i.counts && !i.readToday;
    if (filter === 'recepcion') return INV_ROOM_RECEPTION_KINDS.indexOf(i.kind) >= 0;
    return true;
}

// ══════════════════════════════════════════════════════════════════════
// Entrar a una zona: la cámara vuela hasta quedar de frente y luego se ve "de frente"
// ══════════════════════════════════════════════════════════════════════

/**
 * La cámara que deja una zona de frente y llenando la vista. PURA.
 * Gira a `face` (la zona queda al fondo), baja la inclinación y encuadra sus posiciones.
 */
function invRoomFocusCam(layout, scene, zoneId) {
    layout = layout || INV_ROOM_LAYOUT;
    var def = layout.zones[zoneId];
    if (!def) return null;
    var cam = { az: def.face || 0, el: def.kind === 'wall' ? 18 : 32, zoom: 1, panX: 0, panY: 0 };
    var C = invRoomCenter(layout), box = invRoomBox(layout, cam), xs = [], ys = [];
    (scene && scene.slots || []).forEach(function(s) {
        if (s.zone !== zoneId) return;
        [0, 1.2].forEach(function(z) { var q = invRoomProject(s.x, s.y, z, cam, C); xs.push(q.x); ys.push(q.y); });
    });
    if (!xs.length) return cam;
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var zoom = Math.max(0.5, Math.min(5, Math.min(box.w * 0.8 / (x1 - x0 + 60), box.h * 0.7 / (y1 - y0 + 60))));
    var bc = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    cam.zoom = zoom;
    cam.panX = -zoom * ((x0 + x1) / 2 - bc.x);
    cam.panY = -zoom * ((y0 + y1) / 2 - bc.y);
    return cam;
}

/** Un paso del vuelo de la cámara (t de 0 a 1, ya suavizado). Gira por el camino corto. PURA. */
function invRoomCamLerp(a, b, t) {
    var daz = ((b.az - a.az + 540) % 360) - 180;
    var L = function(x, y) { return x + (y - x) * t; };
    return { az: a.az + daz * t, el: L(a.el, b.el), zoom: L(a.zoom, b.zoom), panX: L(a.panX, b.panX), panY: L(a.panY, b.panY) };
}

/**
 * Cómo se acomodan las posiciones de una zona vista de frente, de izquierda a derecha. PURA.
 * Pared: una fila. Buffer: la fila del fondo y la del frente, cada una con su grande al final
 * (hacia la pared C). Devuelve índices de posición (0 = la 01).
 */
function invRoomFrontRows(def, n) {
    n = Math.max(0, parseInt(n, 10) || 0);
    if (!def) return [];
    var all = function(m) { var a = []; for (var i = 0; i < m; i++) a.push(i); return a; };
    if (def.rows) {
        var per = def.perRow || 6, nr = def.rows.length, out = [];
        def.rows.forEach(function(r, i) {
            var idx = [];
            for (var k = i * per; k < (i + 1) * per; k++) if (k < n) idx.push(k);
            var big = nr * per + i;
            if (def.big && def.big[i] && big < n) idx.push(big);
            out.push({ label: nr === 2 ? (i === 0 ? 'Fila del fondo' : 'Fila del frente') : 'Fila ' + (i + 1), idx: idx });
        });
        return out;
    }
    if (def.points) return [{ label: '', idx: all(Math.min(n, def.points.length)) }];
    return [{ label: '', idx: all(n) }];
}

/**
 * La zona vista de frente como SVG: cada cilindro grande, con su tablero, nivel y datos. PURA.
 * `look[id]` = {tone, pct, tag, pin, name, ctrl, psi, aria}. Devuelve {w, h, cols, svg}.
 */
function invRoomFrontSVG(scene, zoneId, look, opts) {
    opts = opts || {};
    var layout = opts.layout || INV_ROOM_LAYOUT;
    var def = layout.zones[zoneId] || {};
    var z = (scene.zones || []).find(function(x) { return x.id === zoneId; });
    if (!z) return { w: 0, h: 0, cols: 0, svg: '' };
    var byIdx = {};
    scene.slots.forEach(function(s) { if (s.zone === zoneId) byIdx[s.n - 1] = s; });
    var rows = invRoomFrontRows(def, z.drawn);
    var gauge = def.kind === 'wall';
    var COL = 94, PAD = 24, TOP = gauge ? 70 : 20, CH = 200, BIG = 232, LAB = gauge ? 98 : 84, RHEAD = rows.length > 1 ? 26 : 0;
    var cols = Math.max.apply(null, rows.map(function(r) { return r.idx.length; }).concat([1]));
    var rowH = RHEAD + TOP + BIG + LAB;
    var W = PAD * 2 + cols * COL, H = rows.length * rowH + PAD;
    var e = _invRoomEsc, f = function(v) { return v.toFixed(1); };
    var out = ['<defs><linearGradient id="rmf-metal" x1="0" x2="1"><stop offset="0" stop-color="#94a3b8"/><stop offset="0.38" stop-color="#f8fafc"/><stop offset="1" stop-color="#a8b3c4"/></linearGradient>' +
        Object.keys(INV_ROOM_TONES).map(function(k) { var t = INV_ROOM_TONES[k];
            return '<linearGradient id="rmf-g-' + k + '" x1="0" x2="1"><stop offset="0" stop-color="' + t.dark + '"/><stop offset="0.45" stop-color="' + t.light + '"/><stop offset="1" stop-color="' + t.fill + '"/></linearGradient>'; }).join('') + '</defs>'];
    rows.forEach(function(row, ri) {
        var y0 = PAD / 2 + ri * rowH;
        var base = y0 + RHEAD + TOP + BIG;
        if (row.label) out.push('<text class="rmf-rowlbl" x="' + PAD + '" y="' + (y0 + 17) + '">' + e(row.label) + '</text>');
        out.push('<line class="rmf-floor" x1="' + (PAD / 2) + '" y1="' + f(base + 2) + '" x2="' + (W - PAD / 2) + '" y2="' + f(base + 2) + '"/>');
        if (gauge) out.push('<rect class="rmf-wallband" x="' + (PAD / 2) + '" y="' + f(y0 + RHEAD + 6) + '" width="' + (W - PAD) + '" height="40" rx="6"/>');
        row.idx.forEach(function(i, j) {
            var s = byIdx[i];
            if (!s) return;
            var cx = PAD + COL * (j + 0.5);
            var big = !!s.big, w = big ? 58 : 46, h = big ? BIG : CH, top = base - h, r = w / 2;
            var body = 'M' + f(cx - r) + ' ' + f(base) + 'L' + f(cx - r) + ' ' + f(top + r) + 'A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(cx + r) + ' ' + f(top + r) + 'L' + f(cx + r) + ' ' + f(base) + 'Z';
            if (gauge) {
                var py = y0 + RHEAD + 12;
                out.push('<g class="rmf-reg' + (s.gasId ? '' : ' rmf-reg--idle') + '" aria-hidden="true"><rect x="' + f(cx - 22) + '" y="' + f(py) + '" width="44" height="28" rx="4"/>' +
                    '<circle cx="' + f(cx - 9) + '" cy="' + f(py + 12) + '" r="7"/><circle cx="' + f(cx + 9) + '" cy="' + f(py + 12) + '" r="7"/></g>');
                if (s.gasId) out.push('<path class="rmf-hose" d="M' + f(cx) + ' ' + f(py + 28) + ' C' + f(cx + 26) + ' ' + f(py + 60) + ' ' + f(cx + 22) + ' ' + f(top - 30) + ' ' + f(cx) + ' ' + f(top - 12) + '"/>');
            }
            if (!s.gasId) {
                out.push('<g class="rmf-slot' + (opts.selSlot === s.code ? ' rmf-slot--sel' : '') + '" data-code="' + s.code + '" tabindex="0" role="button" aria-label="' + s.code + ': posición libre">' +
                    '<path d="' + body + '"/><text class="rmf-code" x="' + f(cx) + '" y="' + f(base + 20) + '">' + s.code + '</text>' +
                    '<text class="rmf-free" x="' + f(cx) + '" y="' + f(base - h / 2) + '">libre</text></g>');
                return;
            }
            var L = look[s.gasId] || {};
            var tone = INV_ROOM_TONES[L.tone] || INV_ROOM_TONES.none;
            var sel = opts.sel === s.gasId, mov = opts.moving === s.gasId;
            var g = '<g class="rmf-cyl' + (sel ? ' rmf-cyl--sel' : '') + (mov ? ' rmf-cyl--move' : '') + (L.dim ? ' rm-dim' : '') + '" data-gas-id="' + e(s.gasId) + '" data-code="' + s.code + '" tabindex="0" role="button" aria-label="' + e(L.aria || s.code) + '">';
            g += '<rect class="rmf-hit" x="' + f(cx - COL / 2 + 3) + '" y="' + f(top - 24) + '" width="' + (COL - 6) + '" height="' + f(h + 24 + LAB - 6) + '" rx="10"/>';
            g += '<path class="rmf-body" d="' + body + '"/>';
            if (gauge) {
                var pct = Math.max(0, Math.min(1, (L.pct || 0) / 100)), fh = (h - 6) * pct;
                g += '<clipPath id="rmf-c-' + s.code + '"><path d="' + body + '"/></clipPath>';
                if (fh > 0) g += '<rect clip-path="url(#rmf-c-' + s.code + ')" fill="url(#rmf-g-' + (L.tone || 'none') + ')" x="' + f(cx - r) + '" y="' + f(base - fh) + '" width="' + w + '" height="' + f(fh) + '"/>';
                [0.25, 0.5, 0.75].forEach(function(q) { var ty = base - (h - 6) * q; g += '<line class="rmf-tick" x1="' + f(cx + r - 7) + '" y1="' + f(ty) + '" x2="' + f(cx + r) + '" y2="' + f(ty) + '"/>'; });
                g += '<path class="rmf-outline" d="' + body + '"/>';
            } else {
                var capFill = INV_ROOM_TAG_DOME[(L.tag || {}).tone] || '#e2e8f0';
                g += '<path class="rmf-cap" style="fill:' + capFill + '" d="M' + f(cx - r) + ' ' + f(top + r) + 'A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(cx + r) + ' ' + f(top + r) + 'Z"/>';
                g += '<path class="rmf-outline" d="' + body + '"/>';
            }
            g += '<rect class="rmf-valve" x="' + f(cx - 7) + '" y="' + f(top - 12) + '" width="14" height="14" rx="3"/>';
            if (gauge && L.pin) {
                var pc = INV_ROOM_TONES[L.pin === 'pedir' ? 'mid' : 'low'];
                g += '<circle cx="' + f(cx + r - 2) + '" cy="' + f(top + 4) + '" r="10" fill="' + pc.fill + '" stroke="#fff" stroke-width="2"/><text class="rmf-pin" x="' + f(cx + r - 2) + '" y="' + f(top + 8) + '">!</text>';
            }
            // Datos debajo, un dato por renglón (en una columna de 94 no cabe "CO/N2 100 ppm · 95% · 1900 psi")
            g += '<text class="rmf-code" x="' + f(cx) + '" y="' + f(base + 19) + '">' + s.code + '</text>';
            var nm = String(L.short || ''); if (nm.length > 11) nm = nm.slice(0, 10) + '…';   // el completo va en el panel y en <title>
            g += '<title>' + e(L.aria || s.code) + '</title>';
            g += '<text class="rmf-name" x="' + f(cx) + '" y="' + f(base + 36) + '">' + e(nm) + '</text>';
            if (gauge) {
                var v = L.tone === 'empty' ? 'Vacío' : L.tone === 'none' ? 'Sin lecturas' : Math.round(L.pct || 0) + '%';
                g += '<text class="rmf-val" style="fill:' + tone.dark + '" x="' + f(cx) + '" y="' + f(base + 55) + '">' + e(v) + '</text>';
                if (L.psi != null) g += '<text class="rmf-ctrl" x="' + f(cx) + '" y="' + f(base + 71) + '">' + e(L.psi + ' psi') + '</text>';
                g += '<text class="rmf-ctrl" x="' + f(cx) + '" y="' + f(base + 86) + '">' + e(L.ctrl || '') + '</text>';
            } else {
                g += '<text class="rmf-ctrl" x="' + f(cx) + '" y="' + f(base + 51) + '">' + e(L.ctrl || '') + '</text>';
                if (L.tag) {
                    var tw = String(L.tag.text).length * 6.4 + 16;
                    g += '<g class="rm-stag rm-stag--' + L.tag.tone + '"><rect x="' + f(cx - tw / 2) + '" y="' + f(base + 59) + '" width="' + f(tw) + '" height="17" rx="8.5"/><text x="' + f(cx) + '" y="' + f(base + 71.5) + '">' + e(L.tag.text) + '</text></g>';
                }
            }
            g += '</g>';
            out.push(g);
        });
    });
    return { w: W, h: H, cols: cols, svg: out.join('') };
}

// ══════════════════════════════════════════════════════════════════════
// Pantalla (DOM)
// ══════════════════════════════════════════════════════════════════════
var _invRoom = { sel: null, selSlot: null, moving: null, filter: null, cam: null };

function _invRoomNarrow() { return typeof window !== 'undefined' && window.innerWidth < 700; }
function _invRoomCam() {
    if (!_invRoom.cam) _invRoom.cam = invRoomCamNormalize(typeof uiPref === 'function' ? uiPref('roomCam') : null, _invRoomNarrow());
    return _invRoom.cam;
}
var _invRoomCamSaveT = null;
function _invRoomCamSave() {
    if (_invRoom.focus || _invRoom.flying) return;   // la cámara de una zona no es la preferencia del equipo
    clearTimeout(_invRoomCamSaveT);
    _invRoomCamSaveT = setTimeout(function() { try { if (typeof uiPref === 'function') uiPref('roomCam', _invRoom.cam); } catch (e) {} }, 400);
}
function _invRoomLabelsOn() {
    var v = typeof uiPref === 'function' ? uiPref('roomLabels') : null;
    return v === null || v === undefined ? !_invRoomNarrow() : !!v;
}

function _invRoomGas(id) { return ((typeof invState !== 'undefined' && invState.gases) || []).find(function(g) { return g && g.id === id; }) || null; }

/** Estado resuelto de cada cilindro, de las definiciones únicas de Consumibles. */
function _invRoomInfo(scene) {
    var info = {}, today = typeof localToday === 'function' ? localToday() : '';
    var kindOf = {};
    scene.slots.forEach(function(s) { if (s.gasId) kindOf[s.gasId] = s.kind; });
    ((typeof invState !== 'undefined' && invState.gases) || []).forEach(function(g) {
        if (!g || !g.id) return;
        var lvl = typeof invGasLevel === 'function' ? invGasLevel(g) : { pct: 0, status: 'sinlecturas' };
        var ex = typeof invGasExpiry === 'function' ? invGasExpiry(g) : { status: 'unknown' };
        var ro = typeof invGasReorder === 'function' ? invGasReorder(g) : { status: 'ok' };
        var lx = { status: g.status, pct: lvl.pct, levelStatus: lvl.status, expired: ex.status === 'expired' };
        var tone = invRoomLevelTone(lx);
        var counts = g.status !== 'Empty';
        var readToday = counts && typeof invFindReadingOn === 'function' && !!invFindReadingOn(g, today);
        var reorder = counts && ro.status === 'comprar';
        var short = String(g.formula || g.gasType || '?').split('/')[0] + (g.concNominal ? ' ' + String(g.concNominal).replace(/\s*ppm/i, '') : '');
        info[g.id] = {
            tone: tone, pct: g.status === 'Empty' ? 0 : (lvl.pct || 0), short: short.slice(0, 14),
            expired: ex.status === 'expired', reorder: reorder, counts: counts, readToday: readToday, kind: kindOf[g.id] || null,
            pin: tone === 'low' || ex.status === 'expired' ? 'alerta' : reorder ? 'pedir' : '',
            tag: invRoomStockTag(lx),
            name: ((g.formula || g.gasType || '') + ' ' + (g.concNominal || '')).trim().slice(0, 18), ctrl: g.controlNo || '', psi: lvl.psi != null ? lvl.psi : null,
            aria: (g.zone || '') + ': ' + (g.formula || '') + ' ' + (g.concNominal || '') + ', ' + (INV_ROOM_TONES[tone] || {}).label +
                  (g.status !== 'Empty' && lvl.pct != null ? ' ' + lvl.pct + '%' : '') + (readToday ? ', leído hoy' : '')
        };
    });
    return info;
}

function _invRoomSceneNow() {
    return invRoomScene(INV_ROOM_LAYOUT, (typeof invState !== 'undefined' && invState.zones) || [], (typeof invState !== 'undefined' && invState.gases) || []);
}

/** Punto de entrada: pinta la pestaña 🗺️ Cuarto dentro de `el`. */
function invRoomRender(el) {
    if (!el) return;
    var narrow = _invRoomNarrow();
    var labels = _invRoomLabelsOn();
    el.innerHTML =
        '<div class="rm-wrap" id="rm-wrap">' +
          '<div class="rm-top">' +
            '<h3 class="rm-title" data-help="inv-room-help">🗺️ Cuarto de gases</h3>' +
            '<div class="rm-kpis" id="rm-kpis" role="group" aria-label="Indicadores del cuarto de gases"></div>' +
            '<div class="rm-zonenav" id="rm-zonenav" role="toolbar" aria-label="Ver una zona de frente"></div>' +
            '<div class="rm-top-actions">' +
              '<button type="button" class="tp-btn tp-btn-ghost" onclick="invShowAddGas()" title="Un cilindro nuevo llega a recepción (diablito o buffer)">📥 Recibir cilindro</button>' +
              '<button type="button" class="tp-btn tp-btn-ghost" onclick="invRoomSetView(\'reticula\')" title="Ver las zonas como tarjetas">▦ Retícula</button>' +
            '</div>' +
          '</div>' +
          '<div class="rm-stage' + (labels ? '' : ' rm-labels-off') + '" id="rm-stage">' +
            '<svg class="rm-svg" id="rm-svg" role="application" aria-label="Plano del cuarto de gases. Toca un cilindro para ver su estado." preserveAspectRatio="xMidYMid meet"><g id="rm-cam"></g></svg>' +
            '<div class="rm-ctrl" role="toolbar" aria-label="Cámara">' +
              '<button type="button" onclick="invRoomZoomBy(1.25)" aria-label="Acercar" title="Acercar">＋</button>' +
              '<button type="button" onclick="invRoomZoomBy(0.8)" aria-label="Alejar" title="Alejar">－</button>' +
              '<button type="button" onclick="invRoomRotate(-15)" aria-label="Girar a la izquierda" title="Girar">⟲</button>' +
              '<button type="button" onclick="invRoomRotate(15)" aria-label="Girar a la derecha" title="Girar">⟳</button>' +
              '<button type="button" class="rm-ctrl-tilt" onclick="invRoomTilt(10)" aria-label="Ver más desde arriba" title="Más desde arriba">▲</button>' +
              '<button type="button" class="rm-ctrl-tilt" onclick="invRoomTilt(-10)" aria-label="Ver más de lado" title="Más de lado">▼</button>' +
              '<button type="button" id="rm-btn-plan" onclick="invRoomTogglePlan()" aria-label="Alternar plano y 3D" title="Plano / 3D">' + (_invRoomCam().el >= 80 ? '⬒' : '⬓') + '</button>' +
              '<button type="button" onclick="invRoomResetCam()" aria-label="Vista inicial" title="Vista inicial">⌂</button>' +
              '<button type="button" id="rm-btn-lbl" onclick="invRoomToggleLabels()" aria-pressed="' + labels + '" aria-label="Etiquetas" title="Etiquetas">🏷</button>' +
            '</div>' +
            '<div class="rm-front" id="rm-front" hidden></div>' +
            '<div class="rm-moving" id="rm-moving" hidden></div>' +
            '<div class="rm-panel-host" id="rm-panel" hidden></div>' +
          '</div>' +
          '<div class="rm-legend" aria-hidden="true">' +
            '<b class="rm-legend-h">Conectados:</b>' +
            [['ok', '> ' + INV_ROOM_HALF_PCT + '%'], ['half', '≤ ' + INV_ROOM_HALF_PCT + '%'], ['mid', '≤ ' + (typeof INV_LEVEL_LOW_PCT !== 'undefined' ? INV_LEVEL_LOW_PCT : 30) + '% bajo'],
             ['low', '≤ ' + (typeof INV_LEVEL_CRITICAL_PCT !== 'undefined' ? INV_LEVEL_CRITICAL_PCT : 15) + '% crítico'], ['none', 'sin lecturas']].map(function(k) {
                return '<span><i style="background:' + INV_ROOM_TONES[k[0]].fill + '"></i>' + k[1] + '</span>'; }).join('') +
            '<b class="rm-legend-h">Buffers y diablito (tapa):</b><span class="rm-legend-tag rm-legend-tag--ok">Lleno</span><span class="rm-legend-tag rm-legend-tag--muted">a medias</span><span class="rm-legend-tag rm-legend-tag--empty">Vacío</span><span class="rm-legend-tag rm-legend-tag--bad">Vencido</span>' +
            '<span class="rm-legend-hint">' + (narrow ? 'Pellizca para acercar · mantén presionado un cilindro para moverlo' : 'Rueda = acercar · arrastra el piso para mover la vista · arrastra un cilindro para reubicarlo') + '</span>' +
          '</div>' +
          '<div class="rm-list" id="rm-list"></div>' +
        '</div>';
    invRoomPaint();
    _invRoomBindStage();
    _invRoomBindFront();
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function invRoomSetView(v) {
    if (typeof uiPref === 'function') uiPref('invMapView', v);
    if (typeof invRender === 'function') invRender();
}

/** Repinta escena, franja, panel y lista sin reconstruir la pantalla (conserva la cámara). */
function invRoomPaint() {
    var svg = document.getElementById('rm-svg');
    if (!svg) return;
    var scene = _invRoomSceneNow();
    var info = _invRoomInfo(scene);
    if (_invRoom.sel && !_invRoomGas(_invRoom.sel)) _invRoom.sel = null;
    if (_invRoom.moving && !_invRoomGas(_invRoom.moving)) _invRoom.moving = null;
    _invRoom.scene = scene; _invRoom.info = info;
    _invRoom.look = _invRoomLook(info);
    _invRoomPaintScene();
    svg.classList.toggle('rm-is-moving', !!_invRoom.moving);
    var stg = document.getElementById('rm-stage');
    if (stg) stg.classList.toggle('rm-moving-on', !!_invRoom.moving);
    var pb = document.getElementById('rm-btn-plan');
    if (pb) pb.textContent = _invRoomCam().el >= 80 ? '⬒' : '⬓';
    _invRoomPaintKpis(scene, info);
    _invRoomPaintZoneNav(scene);
    _invRoomPaintMoving();
    _invRoomPaintFront();
    invRoomPanelPaint();
    _invRoomPaintList(scene, info);
}

function _invRoomLook(info) {
    var look = {};
    Object.keys(info).forEach(function(id) {
        var i = info[id];
        look[id] = { tone: i.tone, pct: i.pct, short: i.short, pin: i.pin, tag: i.tag, aria: i.aria, name: i.name, ctrl: i.ctrl, psi: i.psi,
                     dim: !!_invRoom.filter && !invRoomFilterMatch(_invRoom.filter, i) };
    });
    return look;
}

/** Solo la escena 3D (lo que cambia en cada cuadro del vuelo de la cámara). */
function _invRoomPaintScene() {
    var svg = document.getElementById('rm-svg'), g = document.getElementById('rm-cam');
    if (!svg || !g || !_invRoom.scene) return;
    var cam = _invRoomCam();
    var out = invRoomSceneSVG(_invRoom.scene, cam, _invRoom.look || {}, { sel: _invRoom.sel, selSlot: _invRoom.selSlot, moving: _invRoom.moving,
        labels: true, focus: _invRoom.focus || _invRoom.flying || null });
    svg.setAttribute('viewBox', out.box.x.toFixed(1) + ' ' + out.box.y.toFixed(1) + ' ' + out.box.w.toFixed(1) + ' ' + out.box.h.toFixed(1));
    _invRoom.box = out.box;
    g.innerHTML = out.svg;
    _invRoomApplyCam();
}

function _invRoomApplyCam() {
    var g = document.getElementById('rm-cam'), b = _invRoom.box;
    if (!g || !b) return;
    var cam = _invRoomCam();
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    g.setAttribute('transform', 'translate(' + (cx + cam.panX).toFixed(1) + ' ' + (cy + cam.panY).toFixed(1) + ') scale(' + cam.zoom.toFixed(3) + ') translate(' + (-cx).toFixed(1) + ' ' + (-cy).toFixed(1) + ')');
    var st = document.getElementById('rm-stage');
    if (st) st.classList.toggle('rm-near', cam.zoom >= 1.6 || cam.el >= 80);
}

function _invRoomPaintKpis(scene, info) {
    var host = document.getElementById('rm-kpis');
    if (!host) return;
    var k = invRoomKpis(scene, info);
    var f = _invRoom.filter;
    var tile = function(id, icon, value, label, tone) {
        var on = f === id;
        return '<button type="button" class="rm-kpi rm-kpi--' + tone + (on ? ' rm-kpi--on' : '') + '" aria-pressed="' + on + '" onclick="invRoomFilter(\'' + id + '\')" title="' + (on ? 'Quitar el resaltado' : 'Resaltar en el plano') + '">' +
            '<span class="rm-kpi-ico" aria-hidden="true">' + icon + '</span><span class="rm-kpi-v">' + value + '</span><span class="rm-kpi-l">' + label + (on ? ' ✕' : '') + '</span></button>';
    };
    host.innerHTML =
        '<div class="rm-kpi rm-kpi--info rm-kpi--static"><span class="rm-kpi-ico" aria-hidden="true">🔗</span><span class="rm-kpi-v">' + k.connected + '/' + k.wallSlots + '</span><span class="rm-kpi-l">Conectados</span></div>' +
        tile('recepcion', '📥', k.reception, 'En recepción / stock', 'info') +
        tile('critico', '🔴', k.critical + k.low, k.critical ? k.critical + ' crítico' + (k.critical === 1 ? '' : 's') + ' · ' + k.low + ' bajo' + (k.low === 1 ? '' : 's') : 'Bajos', k.critical ? 'bad' : k.low ? 'warn' : 'ok') +
        tile('pedir', '🛒', k.reorder, 'Pedir ya', k.reorder ? 'warn' : 'ok') +
        tile('vencido', '📅', k.expired, 'Vencidos', k.expired ? 'bad' : 'ok') +
        tile('sinleer', '📏', k.readToday + '/' + k.toRead, 'Leídos hoy', k.readToday >= k.toRead ? 'ok' : 'info');
}

function invRoomFilter(id) {
    _invRoom.filter = _invRoom.filter === id ? null : id;
    invRoomPaint();
}

function _invRoomPaintMoving() {
    var m = document.getElementById('rm-moving');
    if (!m) return;
    var g = _invRoom.moving ? _invRoomGas(_invRoom.moving) : null;
    if (!g) { m.hidden = true; m.innerHTML = ''; return; }
    m.hidden = false;
    m.innerHTML = '<span>↔ Moviendo <b>' + _invRoomEsc((g.formula || '') + ' ' + (g.concNominal || '')) + '</b>' + (g.zone ? ' (' + _invRoomEsc(g.zone) + ')' : '') + ' — toca una posición libre</span>' +
        '<button type="button" class="tp-btn tp-btn-ghost" onclick="invRoomMoveCancel()">✕ Cancelar</button>';
}

// ── Panel lateral: estado + lectura + acciones ───────────────────────
function invRoomPanelPaint() {
    var host = document.getElementById('rm-panel');
    if (!host) return;
    if (_invRoom.sel) { host.hidden = false; host.innerHTML = _invRoomGasPanelHTML(_invRoom.sel); }
    else if (_invRoom.selSlot) { host.hidden = false; host.innerHTML = _invRoomSlotPanelHTML(_invRoom.selSlot); }
    else { host.hidden = true; host.innerHTML = ''; return; }
    if (typeof uiChipsEnhance === 'function') { try { uiChipsEnhance(host); } catch (e) {} }
}

function _invRoomStepperHTML(step) {
    var idx = INV_ROOM_STEPS.map(function(s) { return s.id; }).indexOf(step);
    return '<ol class="rm-steps" aria-label="Ciclo del cilindro">' + INV_ROOM_STEPS.map(function(s, i) {
        var st = i < idx ? 'done' : i === idx ? 'now' : 'next';
        return '<li class="rm-step rm-step--' + st + '"' + (st === 'now' ? ' aria-current="step"' : '') + '><span class="rm-step-dot" aria-hidden="true">' + (st === 'done' ? '✓' : i + 1) + '</span><span class="rm-step-l">' + s.label + '</span></li>';
    }).join('') + '</ol>';
}

function _invRoomGasPanelHTML(id) {
    var g = _invRoomGas(id);
    if (!g) return '';
    var m = typeof fichaModel === 'function' ? fichaModel('cilindro', id) : null;
    var scene = _invRoom.scene || _invRoomSceneNow();
    var slot = scene.slots.find(function(s) { return s.gasId === id; });
    var zoneDef = slot ? (INV_ROOM_LAYOUT.zones[slot.zone] || {}) : {};
    var i = (_invRoom.info || {})[id] || {};
    var tone = INV_ROOM_TONES[i.tone] || INV_ROOM_TONES.none;
    var today = typeof localToday === 'function' ? localToday() : '';
    var todayR = typeof invFindReadingOn === 'function' ? invFindReadingOn(g, today) : null;
    var last = (g.readings || []).filter(function(r) { return r && !r.auto; }).slice(-1)[0];
    var h = '<div class="rm-panel" role="region" aria-label="Cilindro ' + _invRoomEsc(g.controlNo || '') + '">';
    h += '<div class="rm-panel-head"><div><div class="rm-panel-kicker">' + (slot ? _invRoomEsc(slot.code) + ' · ' + _invRoomEsc(zoneDef.label || '') : 'Sin lugar en el plano') + '</div>' +
         '<div class="rm-panel-title">' + _invRoomEsc(m ? m.title : (g.formula || 'Cilindro')) + '</div>' +
         (m && m.subtitle ? '<div class="rm-panel-sub">' + _invRoomEsc(m.subtitle) + '</div>' : '') + '</div>' +
         '<button type="button" class="rm-x" onclick="invRoomClose()" aria-label="Cerrar">✕</button></div>';
    // Medidor de nivel
    h += '<div class="rm-gauge"><div class="rm-gauge-bar"><span style="width:' + Math.max(0, Math.min(100, i.pct || 0)) + '%;background:' + tone.fill + '"></span></div>' +
         '<div class="rm-gauge-t"><b style="color:' + tone.dark + '">' + (g.status === 'Empty' ? 'Vacío' : (i.tone === 'none' ? 'Sin lecturas' : (i.pct || 0) + '%')) + '</b> · ' + tone.label + '</div></div>';
    var badges = m && m.badges ? m.badges.filter(function(b) { return !/%$/.test(String(b.text)); }) : [];   // el % ya está en el medidor
    if (badges.length) {
        h += '<div class="rm-badges">' + badges.map(function(b) { return '<span class="rm-badge rm-badge--' + _invRoomEsc(b.tone || 'muted') + '">' + _invRoomEsc(b.text) + '</span>'; }).join('') + '</div>';
    }
    if (m && m.facts && m.facts.length) {
        h += '<dl class="rm-facts">' + m.facts.map(function(f) { return '<div><dt>' + _invRoomEsc(f.k) + '</dt><dd>' + _invRoomEsc(f.v) + '</dd></div>'; }).join('') + '</dl>';
    }
    h += _invRoomStepperHTML(invRoomLifecycle(g, slot ? slot.kind : null));

    // Lectura
    if (g.status !== 'Empty') {
        h += '<form class="rm-read" onsubmit="return invRoomSaveReading(event)">' +
             '<label for="rm-psi" class="rm-read-l">' + (todayR ? '✓ Leído hoy: <b>' + todayR.psi + ' psi</b> — corregir' : 'Lectura de hoy (psi)') + '</label>' +
             '<div class="rm-read-row"><input id="rm-psi" type="number" inputmode="decimal" min="0" step="any" placeholder="Ej.: 1250" value="' + (todayR ? todayR.psi : '') + '">' +
             (last && !todayR ? '<button type="button" class="tp-btn tp-btn-ghost" onclick="document.getElementById(\'rm-psi\').value=\'' + last.psi + '\';document.getElementById(\'rm-psi\').focus()" title="Repetir la última lectura (' + _invRoomEsc(last.date) + ')">= ' + last.psi + '</button>' : '') +
             '</div><button type="submit" class="btn btn-primary rm-read-btn">Guardar lectura</button></form>';
    }

    // Estatus (avanza el ciclo)
    var stOpts = ['In use', 'Stock', 'Spare', 'Empty'].map(function(st) {
        return '<option value="' + st + '"' + (g.status === st ? ' selected' : '') + '>' + (typeof uiLabel === 'function' ? uiLabel('gasStatus', st) : st) + '</option>';
    }).join('');
    h += '<div class="rm-status"><label for="rm-status" class="rm-read-l">Estatus</label><select id="rm-status" data-chips onchange="invRoomSetStatus(\'' + _invRoomEsc(id) + '\', this.value)">' + stOpts + '</select></div>';
    if (slot && slot.kind === 'wall' && g.status !== 'In use' && g.status !== 'Empty') {
        h += '<p class="rm-hint">Está en una pared con tablero. Si ya quedó conectado, márcalo <b>En uso</b>.</p>';
    }
    if (slot && slot.kind !== 'wall' && g.status === 'In use') {
        h += '<p class="rm-hint">Dice <b>En uso</b> pero está en ' + _invRoomEsc(zoneDef.label || 'recepción') + ', sin tablero. ¿Ya se desconectó?</p>';
    }

    h += '<div class="rm-actions">' +
         '<button type="button" class="tp-btn" onclick="invRoomMoveStart(\'' + _invRoomEsc(id) + '\')">↔ Mover</button>' +
         (typeof fichaOpen === 'function' ? '<button type="button" class="tp-btn tp-btn-ghost" onclick="fichaOpen(\'cilindro\', \'' + _invRoomEsc(id) + '\', this)">📄 Ficha</button>' : '') +
         '<button type="button" class="tp-btn tp-btn-ghost" onclick="invShowAddGas(\'' + _invRoomEsc(id) + '\')">✏️ Editar</button>' +
         '</div>';
    if (m && m.history && m.history.length) {
        h += '<details class="rm-hist"><summary>Últimas lecturas</summary><ul>' + m.history.map(function(x) {
            return '<li><span>' + _invRoomEsc(x.when) + '</span> ' + _invRoomEsc(x.text) + '</li>';
        }).join('') + '</ul></details>';
    }
    return h + '</div>';
}

function _invRoomSlotPanelHTML(code) {
    var scene = _invRoom.scene || _invRoomSceneNow();
    var slot = scene.slots.find(function(s) { return s.code === code; });
    if (!slot) return '';
    var def = INV_ROOM_LAYOUT.zones[slot.zone] || {};
    // Lo que se puede acomodar aquí: lo que está en recepción y lo que no tiene lugar.
    var cands = [];
    scene.slots.forEach(function(s) {
        if (s.gasId && s.code !== code && INV_ROOM_RECEPTION_KINDS.indexOf(s.kind) >= 0 && INV_ROOM_RECEPTION_KINDS.indexOf(slot.kind) < 0) cands.push({ id: s.gasId, from: s.code });
    });
    scene.unplaced.forEach(function(u) { cands.push({ id: u.gasId, from: u.zone || 'sin lugar' }); });
    var h = '<div class="rm-panel" role="region" aria-label="Posición ' + code + '">' +
        '<div class="rm-panel-head"><div><div class="rm-panel-kicker">' + _invRoomEsc(def.label || ('Zona ' + slot.zone)) + '</div>' +
        '<div class="rm-panel-title">Posición ' + _invRoomEsc(code) + ' · libre</div>' +
        '<div class="rm-panel-sub">' + _invRoomEsc(INV_ROOM_KIND_LABEL[slot.kind] || '') + '</div></div>' +
        '<button type="button" class="rm-x" onclick="invRoomClose()" aria-label="Cerrar">✕</button></div>';
    if (cands.length) {
        h += '<div class="rm-read-l">Acomodar aquí</div><div class="rm-cands">' + cands.slice(0, 12).map(function(c) {
            var g = _invRoomGas(c.id);
            if (!g) return '';
            return '<button type="button" class="rm-cand" onclick="invRoomMoveTo(\'' + _invRoomEsc(c.id) + '\', \'' + code + '\')"><b>' + _invRoomEsc((g.formula || '') + ' ' + (g.concNominal || '')) + '</b><span>' + _invRoomEsc(g.controlNo || '') + ' · ' + _invRoomEsc(c.from) + '</span></button>';
        }).join('') + '</div>';
    } else {
        h += '<p class="rm-hint">Para traer un cilindro aquí: tócalo y elige <b>↔ Mover</b>, o arrástralo.</p>';
    }
    return h + '</div>';
}

function _invRoomPaintList(scene, info) {
    var host = document.getElementById('rm-list');
    if (!host) return;
    var rows = [];
    var label = function(g) { return _invRoomEsc((g.formula || '') + ' ' + (g.concNominal || '')) + ' <span class="rm-row-meta">' + _invRoomEsc(g.controlNo || '') + '</span>'; };
    scene.slots.forEach(function(s) {
        if (!s.gasId) return;
        var i = info[s.gasId], g = _invRoomGas(s.gasId);
        if (!i || !g) return;
        var why = [];
        if (i.tone === 'low') why.push('<span class="rm-tag rm-tag--bad">Crítico ' + i.pct + '%</span>');
        else if (i.tone === 'mid') why.push('<span class="rm-tag rm-tag--warn">Bajo ' + i.pct + '%</span>');
        if (i.expired) why.push('<span class="rm-tag rm-tag--bad">Vencido</span>');
        if (i.reorder) why.push('<span class="rm-tag rm-tag--warn">Pedir ya</span>');
        if (!why.length) return;
        rows.push({ rank: i.tone === 'low' || i.expired ? 0 : 1, html: '<button type="button" class="rm-row" onclick="invRoomSelect(\'' + _invRoomEsc(s.gasId) + '\')"><span class="rm-row-code">' + s.code + '</span><span class="rm-row-name">' + label(g) + '</span><span class="rm-row-tags">' + why.join('') + '</span></button>' });
    });
    rows.sort(function(a, b) { return a.rank - b.rank; });
    var reasons = { 'sin-zona': 'Sin posición', 'zona-desconocida': 'Zona que no existe', 'fuera-del-plano': 'Posición fuera del plano', 'repetida': 'Posición repetida' };
    var un = scene.unplaced.map(function(u) {
        var g = _invRoomGas(u.gasId);
        if (!g) return '';
        return '<div class="rm-row rm-row--un"><span class="rm-row-code">' + _invRoomEsc(u.zone || '—') + '</span><span class="rm-row-name">' + label(g) + '</span>' +
            '<span class="rm-row-tags"><span class="rm-tag rm-tag--info">' + reasons[u.reason] + '</span><button type="button" class="tp-btn tp-btn-ghost" onclick="invRoomMoveStart(\'' + _invRoomEsc(u.gasId) + '\')">↔ Acomodar</button></span></div>';
    }).join('');
    var extra = scene.zones.filter(function(z) { return !z.inPlan || z.drawn < z.total; });
    host.innerHTML =
        '<div class="rm-list-col"><h4>Atención <span class="rm-count">' + rows.length + '</span></h4>' +
          (rows.length ? rows.map(function(r) { return r.html; }).join('') : '<p class="rm-empty">Ningún cilindro bajo, vencido ni por pedir.</p>') + '</div>' +
        (un || extra.length ? '<div class="rm-list-col"><h4>No se ven en el plano <span class="rm-count">' + scene.unplaced.length + '</span></h4>' + un +
            extra.map(function(z) { return '<p class="rm-empty">Zona ' + _invRoomEsc(z.id) + ': ' + (z.inPlan ? 'tiene ' + z.total + ' posiciones y el plano dibuja ' + z.drawn : 'no está en el plano del cuarto') + '.</p>'; }).join('') + '</div>' : '');
}

// ── Selección y movimiento ───────────────────────────────────────────
function invRoomSelect(id) {
    _invRoom.sel = id; _invRoom.selSlot = null;
    invRoomPaint();
    _invRoomKeepVisible(id);
    var p = document.getElementById('rm-psi');
    if (p && !_invRoomNarrow()) { try { p.focus({ preventScroll: true }); } catch (e) {} }
}
/** Si el panel tapa el cilindro elegido, recorre la vista lo justo (no se guarda). */
function _invRoomKeepVisible(id) {
    try {
        if (_invRoom.focus) return;
        var n = document.querySelector('#rm-svg .rm-cyl[data-gas-id="' + String(id).replace(/"/g, '') + '"]');
        var host = document.getElementById('rm-panel'), st = document.getElementById('rm-stage');
        if (!n || !host || host.hidden || !st) return;
        var r = n.getBoundingClientRect(), pr = host.getBoundingClientRect(), sr = st.getBoundingClientRect();
        var k = _invRoomUnitsPerPx(), cam = _invRoomCam(), margin = 60;
        if (pr.left > sr.left + sr.width / 2 && r.right > pr.left - margin) cam.panX -= (r.right - (pr.left - margin)) * k;          // panel a la derecha
        else if (pr.top > sr.top + sr.height / 3 && r.bottom > pr.top - margin) cam.panY -= (r.bottom - (pr.top - margin)) * k;      // hoja abajo
        else return;
        _invRoomApplyCam();
    } catch (e) {}
}

function invRoomClose() { _invRoom.sel = null; _invRoom.selSlot = null; invRoomPaint(); }
function invRoomMoveStart(id) { _invRoom.moving = id; _invRoom.sel = id; _invRoom.selSlot = null; invRoomPaint(); }
function invRoomMoveCancel() { _invRoom.moving = null; invRoomPaint(); }

/** Reubica con el escritor de siempre (`invDropCylinder`, que valida, guarda y audita). */
function invRoomMoveTo(gasId, code) {
    var g = _invRoomGas(gasId);
    if (!g) return false;
    _invRoom.moving = null;
    _invRoom.sel = gasId; _invRoom.selSlot = null;
    if (g.zone === code) { invRoomPaint(); return false; }
    var moved = typeof invDropCylinder === 'function' ? invDropCylinder(gasId, g.zone || '', code) : false;
    // invDropCylinder repinta Consumibles entero; si no lo hizo (rechazo), repintar aquí.
    if (!moved) invRoomPaint();
    return !!moved;
}

function _invRoomTapSlot(code) {
    if (_invRoom.moving) { invRoomMoveTo(_invRoom.moving, code); return; }
    _invRoom.sel = null; _invRoom.selSlot = code;
    invRoomPaint();
}
function _invRoomTapGas(id) {
    if (_invRoom.moving && _invRoom.moving !== id) {
        if (typeof showToast === 'function') showToast('Esa posición está ocupada: elige una libre', 'warning');
        return;
    }
    if (_invRoom.moving === id) { invRoomMoveCancel(); return; }
    invRoomSelect(id);
}

function invRoomSaveReading(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var inp = document.getElementById('rm-psi');
    var id = _invRoom.sel;
    if (!inp || !id) return false;
    if (inp.value === '') { if (typeof uiInvalid === 'function') uiInvalid(inp, 'Escribe la presión que marca el manómetro.'); return false; }
    var res = invAddReading(id, inp.value, { source: 'cuarto' });
    if (!res.ok) { if (typeof uiInvalid === 'function') uiInvalid(inp, res.reason + '.'); return false; }
    if (typeof invUpdateBadges === 'function') { try { invUpdateBadges(); } catch (e) {} }
    invRoomPaint();
    return false;
}

function invRoomSetStatus(id, st) {
    if (typeof invGasSetStatus !== 'function') return;
    var r = invGasSetStatus(id, st, { via: 'cuarto' });
    if (r && r.ok && typeof invUpdateBadges === 'function') { try { invUpdateBadges(); } catch (e) {} }
    invRoomPaint();
}

// ── Cámara ───────────────────────────────────────────────────────────
function invRoomZoomBy(f) { var c = _invRoomCam(); c.zoom = Math.max(0.5, Math.min(5, c.zoom * f)); _invRoomApplyCam(); _invRoomCamSave(); }
function invRoomRotate(deg) { var c = _invRoomCam(); c.az = invRoomCamNormalize({ az: c.az + deg, el: c.el, zoom: c.zoom, panX: c.panX, panY: c.panY }).az; invRoomPaint(); _invRoomCamSave(); }
function invRoomTilt(deg) { var c = _invRoomCam(); c.el = Math.max(20, Math.min(90, c.el + deg)); invRoomPaint(); _invRoomCamSave(); }
function invRoomTogglePlan() {
    var c = _invRoomCam();
    if (c.el >= 80) { c.el = INV_ROOM_CAM_DEFAULT.el; if (c.az === 0) c.az = INV_ROOM_CAM_DEFAULT.az; }
    else { c.el = 90; c.az = 0; }
    invRoomPaint(); _invRoomCamSave();
}
function invRoomResetCam() { _invRoom.cam = invRoomCamNormalize(null, _invRoomNarrow()); invRoomPaint(); _invRoomCamSave(); }
function invRoomToggleLabels() {
    var on = !_invRoomLabelsOn();
    if (typeof uiPref === 'function') uiPref('roomLabels', on);
    var st = document.getElementById('rm-stage');
    if (st) st.classList.toggle('rm-labels-off', !on);
    var b = document.getElementById('rm-btn-lbl');
    if (b) b.setAttribute('aria-pressed', String(on));
}

// ── Gestos: tocar, arrastrar cilindro, desplazar vista, pellizcar, rueda ──
function _invRoomToScene(clientX, clientY) {
    var svg = document.getElementById('rm-svg'), g = document.getElementById('rm-cam');
    if (!svg || !g || !g.getScreenCTM) return null;
    var m = g.getScreenCTM();
    if (!m) return null;
    var pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(m.inverse());
}
function _invRoomUnitsPerPx() {
    var svg = document.getElementById('rm-svg');
    var m = svg && svg.getScreenCTM ? svg.getScreenCTM() : null;
    return m && m.a ? 1 / m.a : 1;
}

/** Posición libre más cercana a un punto de la escena (en px de escena), o null. */
function invRoomNearestSlot(slots, pt, cam, maxDist, layout) {
    if (!pt) return null;
    var C = invRoomCenter(layout || INV_ROOM_LAYOUT), best = null, bd = maxDist == null ? 40 : maxDist;
    (slots || []).forEach(function(s) {
        if (s.gasId) return;
        var p = invRoomProject(s.x, s.y, 0, cam, C);
        var d = Math.hypot(p.x - pt.x, p.y - pt.y);
        if (d < bd) { bd = d; best = s; }
    });
    return best;
}

var _invRoomPtr = null;
function _invRoomBindStage() {
    var svg = document.getElementById('rm-svg');
    if (!svg || svg._rmBound) return;
    svg._rmBound = true;
    var pointers = {};
    var LONG_MS = 320, MOVE_PX = 8;

    svg.addEventListener('pointerdown', function(e) {
        if (e.button > 0) return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pointers);
        if (ids.length === 2) {          // pellizco
            var a = pointers[ids[0]], b = pointers[ids[1]];
            if (_invRoomPtr && _invRoomPtr.timer) clearTimeout(_invRoomPtr.timer);
            _invRoomGhost(null);
            _invRoomPtr = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: _invRoomCam().zoom };
            return;
        }
        if (_invRoom.flying) return;
        var cyl = e.target.closest && e.target.closest('.rm-cyl');
        var slot = e.target.closest && e.target.closest('.rm-slot');
        var chip = e.target.closest && e.target.closest('.rm-chip');
        _invRoomPtr = { mode: 'pending', x0: e.clientX, y0: e.clientY, cyl: cyl ? cyl.getAttribute('data-gas-id') : null, chip: chip ? chip.getAttribute('data-zone') : null,
                        slot: slot ? slot.getAttribute('data-code') : null, pan0: { x: _invRoomCam().panX, y: _invRoomCam().panY }, type: e.pointerType };
        if (_invRoomPtr.cyl) {
            var p = _invRoomPtr;
            p.timer = setTimeout(function() { if (_invRoomPtr === p && p.mode === 'pending') _invRoomDragStart(p, e.clientX, e.clientY); }, LONG_MS);
        }
        try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    });

    svg.addEventListener('pointermove', function(e) {
        if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var p = _invRoomPtr;
        if (!p) return;
        if (p.mode === 'pinch') {
            var ids = Object.keys(pointers);
            if (ids.length < 2) return;
            var a = pointers[ids[0]], b = pointers[ids[1]];
            var c = _invRoomCam();
            c.zoom = Math.max(0.5, Math.min(5, p.z0 * Math.hypot(a.x - b.x, a.y - b.y) / (p.d0 || 1)));
            _invRoomApplyCam();
            return;
        }
        var dx = e.clientX - p.x0, dy = e.clientY - p.y0;
        if (p.mode === 'pending' && Math.hypot(dx, dy) > MOVE_PX) {
            clearTimeout(p.timer);
            // Con ratón, arrastrar un cilindro lo mueve; con el dedo, arrastrar desplaza la
            // vista y para mover se mantiene presionado (si no, no habría cómo desplazarse).
            if (p.cyl && p.type === 'mouse') _invRoomDragStart(p, e.clientX, e.clientY);
            else p.mode = 'pan';
        }
        if (p.mode === 'pan') {
            var k = _invRoomUnitsPerPx(), cam = _invRoomCam();
            cam.panX = p.pan0.x + dx * k; cam.panY = p.pan0.y + dy * k;
            _invRoomApplyCam();
        } else if (p.mode === 'drag') {
            e.preventDefault();
            _invRoomDragMove(e.clientX, e.clientY);
        }
    });

    var end = function(e) {
        delete pointers[e.pointerId];
        var p = _invRoomPtr;
        if (!p) return;
        clearTimeout(p.timer);
        if (p.mode === 'pinch') { if (!Object.keys(pointers).length) { _invRoomPtr = null; _invRoomCamSave(); } return; }
        _invRoomPtr = null;
        if (e.type === 'pointercancel') { _invRoomGhost(null); return; }
        if (p.mode === 'pending') {
            if (p.chip && !_invRoom.moving) invRoomFocus(p.chip);
            else if (p.cyl) _invRoomTapGas(p.cyl);
            else if (p.slot) _invRoomTapSlot(p.slot);
            else if (_invRoom.sel || _invRoom.selSlot) { if (!_invRoom.moving) invRoomClose(); }
        } else if (p.mode === 'pan') {
            _invRoomCamSave();
        } else if (p.mode === 'drag') {
            var target = _invRoom.dragTarget;
            _invRoomGhost(null);
            _invRoom.dragging = null;
            if (target) invRoomMoveTo(p.cyl, target);
            else invRoomPaint();
        }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    svg.addEventListener('wheel', function(e) {
        e.preventDefault();
        var c = _invRoomCam(), b = _invRoom.box;
        if (!b) return;
        var svgEl = document.getElementById('rm-svg');
        var m = svgEl.getScreenCTM();
        if (!m) return;
        var pt = svgEl.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        var s = pt.matrixTransform(m.inverse());               // punto en coordenadas del viewBox
        var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        var pScene = { x: (s.x - cx - c.panX) / c.zoom + cx, y: (s.y - cy - c.panY) / c.zoom + cy };
        var z2 = Math.max(0.5, Math.min(5, c.zoom * Math.exp(-e.deltaY * 0.0015)));
        c.panX = s.x - cx - z2 * (pScene.x - cx); c.panY = s.y - cy - z2 * (pScene.y - cy);
        c.zoom = z2;
        _invRoomApplyCam(); _invRoomCamSave();
    }, { passive: false });

    // Teclado: Enter/Espacio sobre un cilindro o una posición = tocarlo.
    svg.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { if (_invRoom.moving) invRoomMoveCancel(); else if (_invRoom.sel || _invRoom.selSlot) invRoomClose(); else if (_invRoom.focus) invRoomUnfocus(); return; }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var chipK = e.target.closest && e.target.closest('.rm-chip');
        if (chipK) { e.preventDefault(); invRoomFocus(chipK.getAttribute('data-zone')); return; }
        var cyl = e.target.closest && e.target.closest('.rm-cyl');
        var slot = e.target.closest && e.target.closest('.rm-slot');
        if (!cyl && !slot) return;
        e.preventDefault();
        var focusCode = (cyl || slot).getAttribute('data-code');
        if (cyl) _invRoomTapGas(cyl.getAttribute('data-gas-id'));
        else _invRoomTapSlot(slot.getAttribute('data-code'));
        var again = document.querySelector('#rm-svg [data-code="' + focusCode + '"]');
        if (again) { try { again.focus({ preventScroll: true }); } catch (err) {} }
    });
}

function _invRoomDragStart(p, x, y) {
    p.mode = 'drag';
    _invRoom.dragging = p.cyl;
    _invRoom.sel = p.cyl; _invRoom.selSlot = null;
    var svg = document.getElementById('rm-svg');
    if (svg) svg.classList.add('rm-is-moving');
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    _invRoomDragMove(x, y);
}
function _invRoomDragMove(x, y) {
    var pt = _invRoomToScene(x, y);
    var t = invRoomNearestSlot((_invRoom.scene || {}).slots, pt, _invRoomCam(), 45);
    _invRoom.dragTarget = t ? t.code : null;
    _invRoomGhost(pt, t);
}
function _invRoomGhost(pt, target) {
    var g = document.getElementById('rm-cam');
    if (!g) return;
    var old = document.getElementById('rm-ghost');
    if (old) old.remove();
    document.querySelectorAll('#rm-svg .rm-slot--target').forEach(function(n) { n.classList.remove('rm-slot--target'); });
    if (!pt) { var svg = document.getElementById('rm-svg'); if (svg && !_invRoom.moving) svg.classList.remove('rm-is-moving'); return; }
    if (target) {
        var n = document.querySelector('#rm-svg .rm-slot[data-code="' + target.code + '"]');
        if (n) n.classList.add('rm-slot--target');
    }
    var ns = 'http://www.w3.org/2000/svg';
    var c = document.createElementNS(ns, 'g');
    c.setAttribute('id', 'rm-ghost');
    c.setAttribute('class', 'rm-ghost');
    c.innerHTML = '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="13"/>' +
        '<text x="' + pt.x.toFixed(1) + '" y="' + (pt.y - 20).toFixed(1) + '">' + (target ? target.code : 'suelta en una posición libre') + '</text>';
    g.appendChild(c);
}

// ── Entrar a una zona (DOM) ──────────────────────────────────────────
function _invRoomReduceMotion() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

var _invRoomFlyTok = 0;
/** Vuela la cámara de `from` a `to` (≈0.75 s, suave), repintando solo la escena. */
function _invRoomFly(from, to, done) {
    var tok = ++_invRoomFlyTok;
    var stage = document.getElementById('rm-stage');
    if (_invRoomReduceMotion()) { _invRoom.cam = to; _invRoomPaintScene(); if (done) done(); return; }
    if (stage) stage.classList.add('rm-flying');
    var t0 = null, DUR = 750;
    var ease = function(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    var step = function(ts) {
        if (tok !== _invRoomFlyTok) return;
        if (t0 === null) t0 = ts;
        var t = Math.min(1, (ts - t0) / DUR);
        _invRoom.cam = invRoomCamLerp(from, to, ease(t));
        _invRoomPaintScene();
        if (t < 1) { requestAnimationFrame(step); return; }
        _invRoom.cam = to;
        if (stage) stage.classList.remove('rm-flying');
        if (done) done();
    };
    requestAnimationFrame(step);
}

/** Entra a una zona: vuela hasta verla de frente y abre la vista de frente. */
function invRoomFocus(zoneId) {
    var scene = _invRoom.scene || _invRoomSceneNow();
    var to = invRoomFocusCam(INV_ROOM_LAYOUT, scene, zoneId);
    if (!to) return;
    var from = Object.assign({}, _invRoomCam());
    if (!_invRoom.focus && !_invRoom.flying) _invRoom.prevCam = Object.assign({}, from);   // "vista anterior" = la general
    _invRoom.selSlot = null;
    _invRoom.focus = null;
    _invRoom.flying = zoneId;
    _invRoomFrontHide(true);
    _invRoomPaintZoneNav(scene);
    _invRoomFly(from, to, function() {
        _invRoom.flying = null;
        _invRoom.focus = zoneId;
        invRoomPaint();
        var b = document.querySelector('#rm-front .rm-front-back');
        if (b) { try { b.focus({ preventScroll: true }); } catch (e) {} }
    });
}

/** Regresa a la vista anterior (la general), volando de regreso. */
function invRoomUnfocus() {
    if (!_invRoom.focus && !_invRoom.flying) return;
    var from = Object.assign({}, _invRoomCam());
    var to = _invRoom.prevCam || invRoomCamNormalize(null, _invRoomNarrow());
    var was = _invRoom.focus || _invRoom.flying;
    _invRoom.flying = was; _invRoom.focus = null; _invRoom.selSlot = null;
    _invRoomFrontHide();
    _invRoomFly(from, to, function() {
        _invRoom.flying = null; _invRoom.prevCam = null;
        invRoomPaint();
        var chip = document.querySelector('#rm-zonenav [data-zone="' + was + '"]');
        if (chip) { try { chip.focus({ preventScroll: true }); } catch (e) {} }
    });
}

/** La zona vecina (‹ ›) sin pasar por la vista general. */
function invRoomFocusStep(dir) {
    var ids = ((_invRoom.scene || {}).zones || []).filter(function(z) { return z.inPlan && z.drawn; }).map(function(z) { return z.id; });
    var i = ids.indexOf(_invRoom.focus);
    if (i < 0 || !ids.length) return;
    invRoomFocus(ids[(i + dir + ids.length) % ids.length]);
}

function _invRoomPaintZoneNav(scene) {
    var host = document.getElementById('rm-zonenav');
    if (!host) return;
    var cur = _invRoom.focus || _invRoom.flying;
    var zs = (scene.zones || []).filter(function(z) { return z.inPlan && z.drawn; });
    host.innerHTML = '<span class="rm-zonenav-l">Ver de frente:</span>' +
        '<button type="button" class="rm-zbtn' + (!cur ? ' rm-zbtn--on' : '') + '" aria-pressed="' + !cur + '" onclick="invRoomUnfocus()" title="Todo el cuarto">🔭 Todo</button>' +
        zs.map(function(z) {
            var on = cur === z.id;
            return '<button type="button" class="rm-zbtn rm-zbtn--' + (z.kind || 'x') + (on ? ' rm-zbtn--on' : '') + '" data-zone="' + z.id + '" aria-pressed="' + on + '" onclick="invRoomFocus(\'' + z.id + '\')" title="' + _invRoomEsc(z.label) + ' · ' + z.used + '/' + z.total + '">' +
                '<b>' + z.id + '</b><span>' + z.used + '/' + z.total + '</span></button>';
        }).join('');
}

function _invRoomPaintFront() {
    var host = document.getElementById('rm-front'), stage = document.getElementById('rm-stage');
    if (stage) stage.classList.toggle('rm-focused', !!_invRoom.focus);
    if (!host) return;
    if (!_invRoom.focus) { if (!_invRoom.flying) { host.hidden = true; host.classList.remove('is-in'); host.innerHTML = ''; } return; }
    var scene = _invRoom.scene, zid = _invRoom.focus;
    var z = scene.zones.find(function(x) { return x.id === zid; });
    var def = INV_ROOM_LAYOUT.zones[zid] || {};
    var fr = invRoomFrontSVG(scene, zid, _invRoom.look || {}, { sel: _invRoom.sel, selSlot: _invRoom.selSlot, moving: _invRoom.moving });
    var sub = invRoomZoneSummary(scene.slots.filter(function(s) { return s.zone === zid; }), _invRoom.look || {}, def.kind);
    var ids = scene.zones.filter(function(x) { return x.inPlan && x.drawn; }).map(function(x) { return x.id; });
    var i = ids.indexOf(zid), prev = ids[(i - 1 + ids.length) % ids.length], next = ids[(i + 1) % ids.length];
    var scroll = host.querySelector('.rm-front-body');
    var sx = scroll ? scroll.scrollLeft : 0;
    host.innerHTML =
        '<div class="rm-front-head">' +
          '<button type="button" class="tp-btn rm-front-back" onclick="invRoomUnfocus()">← Vista anterior</button>' +
          '<div class="rm-front-title"><b>' + zid + ' · ' + _invRoomEsc(z ? z.label : '') + '</b><span>' + (z ? z.used + ' de ' + z.total + ' ocupadas' : '') + (sub ? ' · ' + _invRoomEsc(sub) : '') + '</span></div>' +
          '<div class="rm-front-steps">' +
            '<button type="button" class="tp-btn tp-btn-ghost" onclick="invRoomFocusStep(-1)" aria-label="Zona anterior: ' + prev + '">‹ ' + prev + '</button>' +
            '<button type="button" class="tp-btn tp-btn-ghost" onclick="invRoomFocusStep(1)" aria-label="Zona siguiente: ' + next + '">' + next + ' ›</button>' +
          '</div>' +
        '</div>' +
        '<div class="rm-front-body"><svg class="rm-front-svg" viewBox="0 0 ' + fr.w + ' ' + fr.h + '" preserveAspectRatio="xMidYMid meet" style="min-width:' + Math.round(fr.cols * 62 + 40) + 'px" role="group" aria-label="Zona ' + zid + ' de frente">' + fr.svg + '</svg></div>';
    var sc2 = host.querySelector('.rm-front-body');
    if (sc2 && sx) sc2.scrollLeft = sx;
    if (host.hidden) {
        host.hidden = false;
        void host.offsetWidth;   // que la transición arranque desde el estado inicial
    }
    host.classList.add('is-in');
}

function _invRoomFrontHide(instant) {
    var host = document.getElementById('rm-front'), stage = document.getElementById('rm-stage');
    if (stage) stage.classList.remove('rm-focused');
    if (!host || host.hidden) return;
    host.classList.remove('is-in');
    if (instant || _invRoomReduceMotion()) { host.hidden = true; host.innerHTML = ''; return; }
    setTimeout(function() { if (!_invRoom.focus) { host.hidden = true; host.innerHTML = ''; } }, 230);
}

function _invRoomBindFront() {
    var host = document.getElementById('rm-front');
    if (!host || host._rmBound) return;
    host._rmBound = true;
    var hit = function(t) {
        var c = t.closest && t.closest('.rmf-cyl'), sl = t.closest && t.closest('.rmf-slot');
        if (c) { _invRoomTapGas(c.getAttribute('data-gas-id')); return c.getAttribute('data-code'); }
        if (sl) { _invRoomTapSlot(sl.getAttribute('data-code')); return sl.getAttribute('data-code'); }
        return null;
    };
    host.addEventListener('click', function(e) { hit(e.target); });
    host.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { e.preventDefault(); if (_invRoom.moving) invRoomMoveCancel(); else if (_invRoom.sel || _invRoom.selSlot) invRoomClose(); else invRoomUnfocus(); return; }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (!(e.target.closest && (e.target.closest('.rmf-cyl') || e.target.closest('.rmf-slot')))) return;
        e.preventDefault();
        var code = hit(e.target);
        var again = code && document.querySelector('#rm-front [data-code="' + code + '"]');
        if (again) { try { again.focus({ preventScroll: true }); } catch (err) {} }
    });
}

// ── Ayuda ────────────────────────────────────────────────────────────
if (typeof CASCADE_TOOLTIPS !== 'undefined') {
    Object.assign(CASCADE_TOOLTIPS, {
        'inv-room-help': { title: 'Cuarto de gases', text: 'El cuarto visto desde arriba o en 3D. Cada cilindro está en su posición real; su relleno es el nivel y su color el estado. Toca uno para ver su estado y tomar la lectura.' }
    });
}
