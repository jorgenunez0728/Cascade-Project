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
    // la numeración va de izquierda a derecha COMO SE VE LA PARED DE FRENTE.
    zones: {
        A: { kind: 'wall', label: 'Pared izquierda', from: [0.32, 4.25], to: [0.32, 0.4], wall: [-1, 0] },
        B: { kind: 'wall', label: 'Pared del fondo', from: [2.7, 0.32], to: [3.9, 0.32], wall: [0, -1] },
        C: { kind: 'wall', label: 'Pared derecha', from: [5.48, 1.15], to: [5.48, 4.8], wall: [1, 0] },
        D: { kind: 'wall', label: 'Inflamables · conectados', from: [1.3, 5.38], to: [1.75, 5.38], wall: [0, -1], room: 'inflamables' },
        // Corren de izquierda a derecha, con los dos grandes del lado de la pared C.
        E: { kind: 'buffer', label: 'Buffer 1', rack: [1.86, 1.58, 3.24, 2.26],
             rows: [[2.0, 1.75, 3.1, 1.75], [2.0, 2.09, 3.1, 2.09]], perRow: 6, big: [[3.5, 1.75], [3.5, 2.09]] },
        F: { kind: 'buffer', label: 'Buffer 2', rack: [1.86, 3.0, 3.24, 3.68],
             rows: [[2.0, 3.17, 3.1, 3.17], [2.0, 3.51, 3.1, 3.51]], perRow: 6, big: [[3.5, 3.17], [3.5, 3.51]] },
        G: { kind: 'cart', label: 'Diablito', cart: [3.5, 5.42, 4.1, 5.82], points: [[3.65, 5.62], [3.95, 5.62]] },
        H: { kind: 'loose', label: 'Inflamables · sin conectar', from: [2.95, 5.5], to: [2.95, 6.35], room: 'inflamables' }
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
var INV_ROOM_TONES = {
    ok:      { fill: '#10b981', dark: '#047857', light: '#6ee7b7', label: 'Normal' },
    mid:     { fill: '#f59e0b', dark: '#b45309', light: '#fcd34d', label: 'Bajo' },
    low:     { fill: '#ef4444', dark: '#991b1b', light: '#fca5a5', label: 'Crítico' },
    expired: { fill: '#be123c', dark: '#881337', light: '#fda4af', label: 'Vencido' },
    empty:   { fill: '#94a3b8', dark: '#475569', light: '#cbd5e1', label: 'Vacío' },
    none:    { fill: '#94a3b8', dark: '#64748b', light: '#e2e8f0', label: 'Sin lecturas' }
};

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
            var u1 = P(k[0], k[1], 0), u2 = P(k[2], k[1], 0), u3 = P(k[2], k[1], 1.0), u4 = P(k[0], k[1], 1.0);
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
        (chips[s.zone] = chips[s.zone] || []).push(s);

        if (!s.gasId) {
            var cls = 'rm-slot' + (opts.selSlot === s.code ? ' rm-slot--sel' : '');
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
            solid.push({ d: pm.d - 0.001, s: '<polygon class="rm-reg" points="' + _invRoomPts(pc) + '"/>' +
                '<path class="rm-hose" d="M' + pm.x.toFixed(1) + ' ' + pm.y.toFixed(1) + ' Q' + ((pm.x + t.x) / 2).toFixed(1) + ' ' + (Math.max(pm.y, t.y) + 14).toFixed(1) + ' ' + t.x.toFixed(1) + ' ' + (t.y - 3).toFixed(1) + '"/>' });
        }
        g += '<g class="rm-cyl rm-cyl--' + L.tone + (L.dim ? ' rm-dim' : '') + (sel ? ' rm-cyl--sel' : '') + '" data-gas-id="' + _invRoomEsc(s.gasId) + '" data-code="' + s.code + '" tabindex="0" role="button" aria-label="' + _invRoomEsc(L.aria || s.code) + '">';
        // cuerpo (metal) + nivel (color del estado) + domo + válvula
        g += '<path class="rm-body" d="M' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'L' + (t.x - rx).toFixed(1) + ' ' + t.y.toFixed(1) + 'L' + (t.x + rx).toFixed(1) + ' ' + t.y.toFixed(1) + 'L' + (b.x + rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 0 1 ' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'Z"/>';
        if (!top && pct > 0) {
            g += '<path class="rm-level" fill="url(#rm-g-' + L.tone + ')" d="M' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'L' + (lv.x - rx).toFixed(1) + ' ' + lv.y.toFixed(1) + 'A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 0 0 ' + (lv.x + rx).toFixed(1) + ' ' + lv.y.toFixed(1) + 'L' + (b.x + rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 0 1 ' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'Z"/>';
        }
        g += '<ellipse class="rm-dome" cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" rx="' + rx.toFixed(1) + '" ry="' + (ry + 0.3).toFixed(1) + '"' + (top ? ' fill="' + tone.light + '"' : '') + '/>';
        if (top) {
            var circ = 2 * Math.PI * rx * 0.78;
            g += '<circle class="rm-ring" cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" r="' + (rx * 0.78).toFixed(1) + '" stroke="' + tone.fill + '" stroke-dasharray="' + (circ * pct).toFixed(1) + ' ' + circ.toFixed(1) + '" transform="rotate(-90 ' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) + ')"/>';
        }
        var vh = Math.max(2, 0.08 * S * cosE);
        g += '<rect class="rm-valve" x="' + (t.x - rx * 0.28).toFixed(1) + '" y="' + (t.y - vh - 1).toFixed(1) + '" width="' + (rx * 0.56).toFixed(1) + '" height="' + vh.toFixed(1) + '" rx="1.5"/>';
        g += '</g>';
        solid.push({ d: b.d, s: g });

        // Marcador (como los pines del tablero de almacén): crítico, vencido o pedir ya
        if (L.pin) {
            var pin = top ? { x: t.x, y: t.y - rx - 6 } : P(s.x, s.y, h + 0.42);
            var pt = INV_ROOM_TONES[L.pin === 'pedir' ? 'mid' : 'low'];
            over.push({ d: b.d, s: '<g class="rm-pin' + (L.dim ? ' rm-dim' : '') + '" aria-hidden="true"><path d="M' + pin.x.toFixed(1) + ' ' + pin.y.toFixed(1) + 'c-5 -7 -8 -10 -8 -14a8 8 0 1 1 16 0c0 4 -3 7 -8 14z" fill="' + pt.fill + '" stroke="#fff" stroke-width="1.5"/>' +
                '<text x="' + pin.x.toFixed(1) + '" y="' + (pin.y - 10).toFixed(1) + '">!</text></g>' });
        }
        if (opts.labels !== false && L.short) {
            over.push({ d: b.d, s: '<text class="rm-lbl' + (s.kind === 'wall' ? '' : ' rm-lbl--dense') + (L.dim ? ' rm-dim' : '') + '" x="' + b.x.toFixed(1) + '" y="' + (b.y + ry + 13).toFixed(1) + '">' + _invRoomEsc(L.short) + '</text>' });
        }
    });

    // Etiqueta de cada zona, flotando sobre su grupo
    scene.zones.forEach(function(z) {
        var ss = chips[z.id];
        if (!ss || !ss.length) return;
        var def = layout.zones[z.id] || {};
        var cx = 0, cy = 0;
        ss.forEach(function(s) { cx += s.x; cy += s.y; });
        cx /= ss.length; cy /= ss.length;
        if (def.wall) { cx -= def.wall[0] * 0.45; cy -= def.wall[1] * 0.45; }
        var p = P(cx, cy, def.kind === 'wall' ? 1.55 : 1.3);
        var txt = z.id + ' · ' + z.used + '/' + z.total;
        var w = txt.length * 7.4 + 18;
        over.push({ d: 98, s: '<g class="rm-chip rm-chip--' + (def.kind || 'x') + '" aria-hidden="true"><rect x="' + (p.x - w / 2).toFixed(1) + '" y="' + (p.y - 11).toFixed(1) + '" width="' + w.toFixed(1) + '" height="22" rx="11"/>' +
            '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 4).toFixed(1) + '">' + _invRoomEsc(txt) + '</text></g>' });
    });

    var byD = function(a, b) { return a.d - b.d; };
    solid.sort(byD); over.sort(byD);

    // Caja de la escena (para el viewBox): las esquinas del piso a ras y a la altura del muro.
    var xs = [], ys = [];
    layout.floor.concat.apply(layout.floor, (layout.rooms || []).map(function(r) { return r.floor; })).forEach(function(p) {
        [0, WH + 0.6].forEach(function(z) { var q = P(p[0], p[1], z); xs.push(q.x); ys.push(q.y); });
    });
    var pad = 30;
    var box = { x: Math.min.apply(null, xs) - pad, y: Math.min.apply(null, ys) - pad,
                w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + pad * 2, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + pad * 2 + 20 };

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
        var tone = g.status === 'Empty' ? 'empty'
            : ex.status === 'expired' ? 'expired'
            : lvl.status === 'critico' ? 'low' : lvl.status === 'bajo' ? 'mid' : lvl.status === 'sinlecturas' ? 'none' : 'ok';
        var counts = g.status !== 'Empty';
        var readToday = counts && typeof invFindReadingOn === 'function' && !!invFindReadingOn(g, today);
        var reorder = counts && ro.status === 'comprar';
        var short = String(g.formula || g.gasType || '?').split('/')[0] + (g.concNominal ? ' ' + String(g.concNominal).replace(/\s*ppm/i, '') : '');
        info[g.id] = {
            tone: tone, pct: g.status === 'Empty' ? 0 : (lvl.pct || 0), short: short.slice(0, 14),
            expired: ex.status === 'expired', reorder: reorder, counts: counts, readToday: readToday, kind: kindOf[g.id] || null,
            pin: tone === 'low' || tone === 'expired' ? 'alerta' : reorder ? 'pedir' : '',
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
            '<div class="rm-moving" id="rm-moving" hidden></div>' +
            '<div class="rm-panel-host" id="rm-panel" hidden></div>' +
          '</div>' +
          '<div class="rm-legend" aria-hidden="true">' +
            ['ok', 'mid', 'low', 'expired', 'empty', 'none'].map(function(k) { return '<span><i style="background:' + INV_ROOM_TONES[k].fill + '"></i>' + INV_ROOM_TONES[k].label + '</span>'; }).join('') +
            '<span class="rm-legend-hint">' + (narrow ? 'Pellizca para acercar · mantén presionado un cilindro para moverlo' : 'Rueda = acercar · arrastra el piso para mover la vista · arrastra un cilindro para reubicarlo') + '</span>' +
          '</div>' +
          '<div class="rm-list" id="rm-list"></div>' +
        '</div>';
    invRoomPaint();
    _invRoomBindStage();
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
    var look = {};
    Object.keys(info).forEach(function(id) {
        var i = info[id];
        look[id] = { tone: i.tone, pct: i.pct, short: i.short, pin: i.pin, aria: i.aria, dim: !!_invRoom.filter && !invRoomFilterMatch(_invRoom.filter, i) };
    });
    var cam = _invRoomCam();
    var out = invRoomSceneSVG(scene, cam, look, { sel: _invRoom.sel, selSlot: _invRoom.selSlot, moving: _invRoom.moving, labels: true });
    svg.setAttribute('viewBox', out.box.x.toFixed(1) + ' ' + out.box.y.toFixed(1) + ' ' + out.box.w.toFixed(1) + ' ' + out.box.h.toFixed(1));
    _invRoom.box = out.box;
    var g = document.getElementById('rm-cam');
    g.innerHTML = out.svg;
    _invRoomApplyCam();
    svg.classList.toggle('rm-is-moving', !!_invRoom.moving);
    var pb = document.getElementById('rm-btn-plan');
    if (pb) pb.textContent = cam.el >= 80 ? '⬒' : '⬓';
    _invRoom.scene = scene; _invRoom.info = info;
    _invRoomPaintKpis(scene, info);
    _invRoomPaintMoving();
    invRoomPanelPaint();
    _invRoomPaintList(scene, info);
}

function _invRoomApplyCam() {
    var g = document.getElementById('rm-cam'), b = _invRoom.box;
    if (!g || !b) return;
    var cam = _invRoomCam();
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    g.setAttribute('transform', 'translate(' + (cx + cam.panX).toFixed(1) + ' ' + (cy + cam.panY).toFixed(1) + ') scale(' + cam.zoom.toFixed(3) + ') translate(' + (-cx).toFixed(1) + ' ' + (-cy).toFixed(1) + ')');
    // En los buffers los cilindros van pegados: sus etiquetas solo caben de cerca o desde arriba.
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
        var cyl = e.target.closest && e.target.closest('.rm-cyl');
        var slot = e.target.closest && e.target.closest('.rm-slot');
        _invRoomPtr = { mode: 'pending', x0: e.clientX, y0: e.clientY, cyl: cyl ? cyl.getAttribute('data-gas-id') : null,
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
            if (p.cyl) _invRoomTapGas(p.cyl);
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
        if (e.key === 'Escape') { if (_invRoom.moving) invRoomMoveCancel(); else invRoomClose(); return; }
        if (e.key !== 'Enter' && e.key !== ' ') return;
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

// ── Ayuda ────────────────────────────────────────────────────────────
if (typeof CASCADE_TOOLTIPS !== 'undefined') {
    Object.assign(CASCADE_TOOLTIPS, {
        'inv-room-help': { title: 'Cuarto de gases', text: 'El cuarto visto desde arriba o en 3D. Cada cilindro está en su posición real; su relleno es el nivel y su color el estado. Toca uno para ver su estado y tomar la lectura.' }
    });
}
