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

// ── [3.11.0] El cuarto de gasolina: un cuadrado de ~10.9 × 7.1 m con una puerta abajo ──
// Tambos de 225 L sobre tarimas de 2 × 2 (una tarima = 4 posiciones, aunque tenga 3), el
// drenaje junto a la pared del fondo y las boyas de premium manejadas como UN tambo. La
// numeración de una tarima: 1-2 la fila de atrás y 3-4 la de enfrente, de izquierda a
// derecha COMO SE VE DE FRENTE (`face`). Código de posición: "T1-2" (`codeSep`).
function _invFuelPallet(cx, cy, face, label, extra) {
    var o = 0.3, rows;
    if (face === 90) rows = [[cx - o, cy + o, cx - o, cy - o], [cx + o, cy + o, cx + o, cy - o]];
    else if (face === -90) rows = [[cx + o, cy - o, cx + o, cy + o], [cx - o, cy - o, cx - o, cy + o]];
    else rows = [[cx - o, cy - o, cx + o, cy - o], [cx - o, cy + o, cx + o, cy + o]];
    return Object.assign({ kind: 'pallet', label: label, slots: 4, pallet: [cx - 0.62, cy - 0.62, cx + 0.62, cy + 0.62],
        rows: rows, perRow: 2, face: face, base: 0.15, openSp: 0.68, openGap: 0.16, defaultCap: 225 }, extra || {});
}
var INV_FUEL_ROOM_LAYOUT = {
    id: 'gasolina', item: 'drum', codeSep: '-',
    floor: [[0, 0], [10.9, 0], [10.9, 7.1], [0, 7.1]],
    rooms: [],
    walls: [
        [0, 0, 10.9, 0, 0, -1],
        [10.9, 0, 10.9, 7.1, 1, 0],
        [10.9, 7.1, 7.1, 7.1, 0, 1], [4.0, 7.1, 0, 7.1, 0, 1],
        [0, 7.1, 0, 0, -1, 0]
    ],
    doors: [{ id: 'entrada', label: 'Entrada', a: [4.0, 7.1], b: [7.1, 7.1] }],
    marks: [{ kind: 'drain', label: 'Drenaje', rect: [4.15, 0.42, 5.6, 1.38] }],
    zones: {
        // T1 y T4 tienen otra tarima justo enfrente (T5, T6): su recuadro se corre para no encimarse.
        T1: _invFuelPallet(0.85, 0.9, 0, 'Tarima 1', { chipOffset: [0, -0.12] }),
        T2: _invFuelPallet(2.75, 0.92, 0, 'Tarima 2'),
        T3: _invFuelPallet(6.58, 0.94, 0, 'Tarima 3'),
        T4: _invFuelPallet(8.98, 0.92, 0, 'Tarima 4', { chipOffset: [-1.1, -0.9] }),
        T5: _invFuelPallet(0.9, 2.45, 90, 'Tarima 5', { chipOffset: [-0.9, 0.95] }),
        T6: _invFuelPallet(9.4, 2.85, -90, 'Tarima 6'),
        // Varias boyas de premium, manejadas como un solo tambo grande (decisión del laboratorio).
        B: { kind: 'tote', label: 'Boyas · premium', slots: 1, pallet: [8.64, 4.62, 10.24, 6.22], points: [[9.44, 5.42]],
             face: -90, base: 0.15, r: 0.55, h: 1.05, defaultCap: null }
    }
};

var INV_ROOM_S = 100;                       // px de escena por unidad
var INV_ROOM_CAM_DEFAULT = { az: 25, el: 42, zoom: 1, panX: 0, panY: 0 };
var INV_ROOM_CAM_PLAN = { az: 0, el: 90, zoom: 1, panX: 0, panY: 0 };
var INV_ROOM_KIND_LABEL = { wall: 'Conectados', buffer: 'Buffer', cart: 'Diablito', loose: 'Sin conectar', pallet: 'Tarima', tote: 'Boyas' };
// Recepción: donde nace un cilindro nuevo (decisión del laboratorio: buffer o diablito).
var INV_ROOM_RECEPTION_KINDS = ['cart', 'buffer'];

// ══════════════════════════════════════════════════════════════════════
// Geometría y escena — PURAS
// ══════════════════════════════════════════════════════════════════════

/**
 * "A03" → {zone:'A', n:3}. Empata con el id de zona MÁS LARGO (una zona "AB" no es "A").
 * Con `sep` (cuarto de gasolina): "T1-2" → {zone:'T1', n:2}.
 */
function invRoomParseCode(code, zoneIds, sep) {
    var c = String(code || '').trim().toUpperCase();
    if (!c) return null;
    var ids = (zoneIds || []).map(function(z) { return String(z).toUpperCase(); })
        .sort(function(a, b) { return b.length - a.length; });
    for (var i = 0; i < ids.length; i++) {
        var pre = ids[i] + (sep || '');
        if (c.indexOf(pre) !== 0) continue;
        var rest = c.slice(pre.length);
        var n = parseInt(rest, 10);
        if (isFinite(n) && n > 0 && /^\d+$/.test(rest)) return { zone: ids[i], n: n };
    }
    return null;
}

/** Código de posición: zona + número a dos dígitos (el de la retícula), o zona + sep + número. */
function invRoomCode(zoneId, n, sep) { return sep ? String(zoneId) + sep + n : String(zoneId) + (n < 10 ? '0' : '') + n; }

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
 * @param {Array} gases    invState.gases ({id, zone, status, …}); en el de gasolina, los tambos
 *                         con su posición en `zone` (ver `invFuelRoomItems`). `gasId` = id del objeto.
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
            var s = { code: invRoomCode(z.id, i + 1, layout.codeSep), zone: z.id, kind: zs.kind, n: i + 1, x: p.x, y: p.y, big: p.big, gasId: null, dupIds: [] };
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
        var p = invRoomParseCode(raw, ids, layout.codeSep);
        if (!p) { unplaced.push({ gasId: g.id, reason: 'zona-desconocida', zone: raw }); return; }
        var s = byCode[invRoomCode(p.zone, p.n, layout.codeSep)];
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

// [3.11.0] El ciclo de un tambo, también DERIVADO: llega cerrado, se abre y se vacía.
var INV_FUEL_ROOM_STEPS = [
    { id: 'cerrado', label: 'Cerrado' },
    { id: 'abierto', label: 'Abierto' },
    { id: 'vacio', label: 'Vacío' }
];
function invFuelRoomLifecycle(tank, level) {
    if (!tank) return null;
    if (tank.fuelStatus === 'Vacío' || (level && level.liters === 0)) return 'vacio';
    return tank.fuelStatus === 'Abierto' ? 'abierto' : 'cerrado';
}

/** Las zonas del cuarto de gasolina, con su número de posiciones (salen del plano). PURA. */
function invFuelRoomZones(layout) {
    layout = layout || INV_FUEL_ROOM_LAYOUT;
    return Object.keys(layout.zones).map(function(id) { var d = layout.zones[id]; return { id: id, label: d.label, slots: d.slots || 0 }; });
}

/**
 * Los tambos como objetos de la escena: su posición es `pos`. PURA.
 * [3.11.0] Un TOTAL ANTERIOR (`legacyTotal`, ver invFuelIsLegacyTotal) no es un tambo: no entra.
 */
function invFuelRoomItems(tanks) {
    return (tanks || []).filter(function(t) { return t && t.id && t.legacyTotal !== true; }).map(function(t) { return { id: t.id, zone: t.pos || '' }; });
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

// [3.11.0] La tapa de un tambo lleva el color de SU tipo de gasolina (el nivel va en el cuerpo).
function _invRoomLidFill(L) { return ' style="fill:' + ((L && L.typeColor) || '#94a3b8') + '"'; }

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
    var tiles = [], fxs = layout.floor.map(function(p) { return p[0]; }), fys = layout.floor.map(function(p) { return p[1]; });
    var X1 = Math.max.apply(null, fxs) + 0.2, Y1 = Math.max.apply(null, fys) + 0.2;
    for (var tx = 0; tx <= X1; tx += 0.6) { var a = P(tx, -0.2, 0), b = P(tx, Y1, 0); tiles.push('M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1)); }
    for (var ty = 0; ty <= Y1; ty += 0.6) { var c1 = P(-0.2, ty, 0), c2 = P(X1, ty, 0); tiles.push('M' + c1.x.toFixed(1) + ' ' + c1.y.toFixed(1) + 'L' + c2.x.toFixed(1) + ' ' + c2.y.toFixed(1)); }
    if (!opts.lite) floorL.push('<path class="rm-tiles" clip-path="url(#rm-floor-clip)" d="' + tiles.join('') + '"/>');
    var foff = opts.focus ? ' rm-off' : '';
    (layout.rooms || []).forEach(function(r) {
        var rp = r.floor.map(function(p) { return P(p[0], p[1], 0); });
        floorL.push('<polygon class="rm-room rm-room--' + r.id + foff + '" points="' + _invRoomPts(rp) + '"/>');
        var cx = 0, cy = 0; r.floor.forEach(function(p) { cx += p[0]; cy += p[1]; });
        var lc = P(cx / r.floor.length, cy / r.floor.length + 0.12, 0);
        floorL.push('<text class="rm-floor-lbl' + foff + '" x="' + lc.x.toFixed(1) + '" y="' + lc.y.toFixed(1) + '">⚠ ' + _invRoomEsc(r.label) + '</text>');
    });
    (layout.doors || []).forEach(function(d) {
        var a = P(d.a[0], d.a[1], 0), b = P(d.b[0], d.b[1], 0);
        floorL.push('<line class="rm-door' + foff + '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>');
        var m = P((d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, 0);
        over.push({ d: 99, s: '<text class="rm-door-lbl' + foff + '" x="' + m.x.toFixed(1) + '" y="' + (m.y + 16).toFixed(1) + '">🚪 ' + _invRoomEsc(d.label) + '</text>' });
    });
    // [3.11.0] Marcas del piso (el drenaje del cuarto de gasolina): rejilla amarilla para ubicarse.
    (layout.marks || []).forEach(function(mk) {
        if (!mk.rect) return;
        var q = mk.rect, cs = [[q[0], q[1]], [q[2], q[1]], [q[2], q[3]], [q[0], q[3]]].map(function(c) { return P(c[0], c[1], 0.01); });
        floorL.push('<polygon class="rm-mark rm-mark--' + mk.kind + foff + '" points="' + _invRoomPts(cs) + '"/>');
        if (!opts.lite) {
            var gr = [];
            for (var gx = q[0] + 0.12; gx < q[2] - 0.05; gx += 0.16) { var g1 = P(gx, q[1] + 0.08, 0.01), g2 = P(gx, q[3] - 0.08, 0.01); gr.push('M' + g1.x.toFixed(1) + ' ' + g1.y.toFixed(1) + 'L' + g2.x.toFixed(1) + ' ' + g2.y.toFixed(1)); }
            floorL.push('<path class="rm-mark-grate' + foff + '" d="' + gr.join('') + '"/>');
            var mc = P((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, 0.01);
            floorL.push('<text class="rm-floor-lbl rm-mark-lbl' + foff + '" x="' + mc.x.toFixed(1) + '" y="' + (mc.y + 4).toFixed(1) + '">' + _invRoomEsc(mk.label || '') + '</text>');
        }
    });

    // Muros: de fondo sólidos y altos; de frente translúcidos (no tapan nada).
    var WH = 1.25;
    var zoff = opts.focus ? ' rm-off' : '';   // dentro de una zona: lo que cruza la vista se desvanece
    layout.walls.forEach(function(w) {
        var back = invRoomWallIsBack(w[4], w[5], cam);
        var p1 = P(w[0], w[1], 0), p2 = P(w[2], w[3], 0), p3 = P(w[2], w[3], WH), p4 = P(w[0], w[1], WH);
        var dmid = (p1.d + p2.d) / 2;
        solid.push({ d: back ? dmid - 2 : dmid + 0.05,
            s: '<polygon class="rm-wall' + (back ? '' : ' rm-wall--front' + zoff) + '" points="' + _invRoomPts([p1, p2, p3, p4]) + '"/>' +
               '<line class="rm-wall-cap' + (back ? '' : ' rm-wall-cap--front' + zoff) + '" x1="' + p4.x.toFixed(1) + '" y1="' + p4.y.toFixed(1) + '" x2="' + p3.x.toFixed(1) + '" y2="' + p3.y.toFixed(1) + '"/>' });
    });

    // Racks de los buffers y diablito
    Object.keys(layout.zones).forEach(function(zid) {
        var def = layout.zones[zid];
        if (def.rack && !(opts.lite && opts.focus && opts.focus !== zid && !(opts.explode || {})[zid])) {
            var r = def.rack, H = 0.5;
            var ram = (opts.explode || {})[zid] || 0;
            var rop = ram ? ' style="opacity:' + (1 - 0.75 * ram).toFixed(2) + '"' : '';
            var rof = opts.focus && opts.focus !== zid ? ' rm-off' : '';
            var corners = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
            floorL.push('<polygon class="rm-rack-plate' + rof + '"' + rop + ' points="' + _invRoomPts(corners.map(function(c) { return P(c[0], c[1], 0); })) + '"/>');
            for (var i = 0; i < 4; i++) {
                var c0 = corners[i], c1 = corners[(i + 1) % 4];
                var t0 = P(c0[0], c0[1], H), t1 = P(c1[0], c1[1], H);
                solid.push({ d: (t0.d + t1.d) / 2 + 0.02, s: '<line class="rm-rack' + rof + '"' + rop + ' x1="' + t0.x.toFixed(1) + '" y1="' + t0.y.toFixed(1) + '" x2="' + t1.x.toFixed(1) + '" y2="' + t1.y.toFixed(1) + '"/>' });
                var b0 = P(c0[0], c0[1], 0);
                solid.push({ d: b0.d + 0.02, s: '<line class="rm-rack' + rof + '"' + rop + ' x1="' + b0.x.toFixed(1) + '" y1="' + b0.y.toFixed(1) + '" x2="' + t0.x.toFixed(1) + '" y2="' + t0.y.toFixed(1) + '"/>' });
            }
        }
        // [3.11.0] Tarima (y la base negra de las boyas): una losa baja con sus cantos visibles.
        if (def.pallet && !(opts.lite && opts.focus && opts.focus !== zid && !(opts.explode || {})[zid])) {
            var pq = def.pallet, PH = def.base || 0.15;
            var pam = (opts.explode || {})[zid] || 0;
            var pof = (opts.focus && opts.focus !== zid ? ' rm-off' : '');
            var pop = pam ? ' style="opacity:' + (1 - 0.88 * pam).toFixed(2) + '"' : '';
            var pc4 = [[pq[0], pq[1]], [pq[2], pq[1]], [pq[2], pq[3]], [pq[0], pq[3]]];
            var topP = pc4.map(function(c) { return P(c[0], c[1], PH); });
            var dmin = Math.min.apply(null, topP.map(function(q) { return q.d; }));
            var faces = [];
            for (var fi = 0; fi < 4; fi++) {
                var e0 = pc4[fi], e1 = pc4[(fi + 1) % 4];
                var q0 = P(e0[0], e0[1], 0), q1 = P(e1[0], e1[1], 0);
                faces.push({ d: (q0.d + q1.d) / 2, s: '<polygon class="rm-pallet-side" points="' + _invRoomPts([q0, q1, topP[(fi + 1) % 4], topP[fi]]) + '"/>' });
            }
            faces.sort(function(a, b) { return a.d - b.d; });
            solid.push({ d: dmin - 0.02, s: '<g class="rm-pallet rm-pallet--' + def.kind + pof + '"' + pop + '>' + faces.map(function(f) { return f.s; }).join('') +
                '<polygon class="rm-pallet-top" points="' + _invRoomPts(topP) + '"/></g>' });
        }
        if (def.cart) {
            var k = def.cart, cof = opts.focus && opts.focus !== zid ? ' rm-off' : '';
            floorL.push('<polygon class="rm-cart-plate' + cof + '" points="' + _invRoomPts([[k[0], k[1]], [k[2], k[1]], [k[2], k[3]], [k[0], k[3]]].map(function(c) { return P(c[0], c[1], 0.04); })) + '"/>');
            var bk = def.back || [k[0], k[1], k[2], k[1]];
            var u1 = P(bk[0], bk[1], 0), u2 = P(bk[2], bk[3], 0), u3 = P(bk[2], bk[3], 1.0), u4 = P(bk[0], bk[1], 1.0);
            solid.push({ d: (u1.d + u2.d) / 2 - 0.01, s: '<polygon class="rm-cart' + cof + '" points="' + _invRoomPts([u1, u2, u3, u4]) + '"/>' });
        }
    });

    // Posiciones y cilindros
    var chips = {};
    // Datos grandes de la zona a la que se entró: tamaño fijo en PANTALLA (se divide entre los px
    // por unidad) y detalle según el espacio entre cilindros, para que nunca se encimen.
    var FZ = opts.focusLabels || null, ppu = opts.pxPerUnit || 1, fdet = 'full';
    if (FZ) {
        var fx = scene.slots.filter(function(s) { return s.zone === FZ; }).map(function(s) {
            var e0 = invRoomExplodeOffset(layout.zones[s.zone], s.n, (opts.explode || {})[FZ] || 0);
            return P(s.x + e0[0], s.y + e0[1], 0).x; }).sort(function(a, b) { return a - b; });
        var gap = Infinity;
        for (var gi = 1; gi < fx.length; gi++) { var dd = fx[gi] - fx[gi - 1]; if (dd > 1 && dd < gap) gap = dd; }
        gap = gap * ppu;
        fdet = gap >= 64 ? 'full' : gap >= 40 ? 'mid' : 'min';
    }
    scene.slots.forEach(function(s) {
        var def = layout.zones[s.zone] || {};
        var drum = layout.item === 'drum';   // [3.11.0] tambos de gasolina en vez de cilindros
        var r = drum ? (def.r || 0.27) : s.big ? 0.14 : (s.kind === 'wall' ? 0.1 : 0.095);
        var h = drum ? (def.h || 0.88) : s.big ? 1.0 : 0.85;
        // Al entrar a un buffer el rack "se abre": la fila de atrás se separa hacia el fondo.
        var exA = (opts.explode || {})[s.zone] || 0;
        var ex = invRoomExplodeOffset(def, s.n, exA);
        var sx = s.x + ex[0], sy = s.y + ex[1];
        // Sobre la tarima (y al abrirla, bajan al piso mientras se acomodan en fila).
        var z0 = (def.base || 0) * (def.rows ? 1 - exA : 1);
        var b = P(sx, sy, z0), t = P(sx, sy, z0 + h);
        var rx = r * S, ry = r * S * sinE;
        var off = opts.focus && s.zone !== opts.focus ? ' rm-off' : '';   // al entrar a una zona, lo demás se desvanece
        // Durante el vuelo (opts.lite) lo que se desvanece va en versión ligera: cuerpo y tapa, nada más.
        // Es lo que mantiene fluido el vuelo (cada cuadro reconstruye la escena entera).
        var lite = !!(opts.lite && off && !((opts.explode || {})[s.zone]));
        (chips[s.zone] = chips[s.zone] || []).push(s);

        if (lite && !s.gasId) return;
        if (!s.gasId) {
            if (FZ === s.zone) over.push({ d: 97, s: _invRoomFocusLabel(s, null, false, b, ry * 1.15, ppu, fdet) });
            var cls = 'rm-slot' + (opts.selSlot === s.code ? ' rm-slot--sel' : '') + off;
            (z0 > 0 ? solid : floorL).push((function(html) { return z0 > 0 ? { d: b.d - 0.001, s: html } : html; })('<g class="' + cls + '" data-code="' + s.code + '" tabindex="0" role="button" aria-label="' + s.code + ': posición libre">' +
                '<ellipse cx="' + b.x.toFixed(1) + '" cy="' + b.y.toFixed(1) + '" rx="' + (rx * 1.15).toFixed(1) + '" ry="' + (ry * 1.15 + 0.5).toFixed(1) + '"/>' +
                '<text x="' + b.x.toFixed(1) + '" y="' + (b.y + 4).toFixed(1) + '">' + s.n + '</text></g>'));
            return;
        }
        var L = look[s.gasId] || { tone: 'none', pct: 0, short: '', pin: '', aria: s.code };
        var tone = INV_ROOM_TONES[L.tone] || INV_ROOM_TONES.none;
        var pct = Math.max(0, Math.min(1, (L.pct || 0) / 100));
        var lv = P(sx, sy, z0 + h * 0.92 * pct);
        var sel = opts.sel === s.gasId, mov = opts.moving === s.gasId;
        var g = '';
        if (lite) {
            solid.push({ d: b.d, s: '<g class="rm-cyl rm-cyl--' + L.tone + off + '"><path class="rm-body" d="M' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'L' + (t.x - rx).toFixed(1) + ' ' + t.y.toFixed(1) + 'L' + (t.x + rx).toFixed(1) + ' ' + t.y.toFixed(1) + 'L' + (b.x + rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'Z"/>' +
                '<ellipse class="rm-dome" cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" rx="' + rx.toFixed(1) + '" ry="' + (ry + 0.3).toFixed(1) + '"' + (drum ? _invRoomLidFill(L) : _invRoomDomeFill(s.kind === 'wall', INV_ROOM_TONES[L.tone] || INV_ROOM_TONES.none, L.tag)) + '/></g>' });
            return;
        }
        // sombra y anillo de selección en el piso
        if (!(z0 > 0)) floorL.push('<ellipse class="rm-shadow" cx="' + (b.x + rx * 0.35).toFixed(1) + '" cy="' + (b.y + ry * 0.3).toFixed(1) + '" rx="' + (rx * 1.25).toFixed(1) + '" ry="' + (ry * 1.25 + 0.5).toFixed(1) + '"/>');
        if (sel || mov) {
            var ring = '<ellipse class="rm-selring' + (mov ? ' rm-selring--move' : '') + '" cx="' + b.x.toFixed(1) + '" cy="' + b.y.toFixed(1) + '" rx="' + (rx * (drum ? 1.35 : 1.9)).toFixed(1) + '" ry="' + (ry * (drum ? 1.35 : 1.9) + 1).toFixed(1) + '"/>';
            if (z0 > 0) solid.push({ d: b.d - 0.001, s: ring }); else floorL.push(ring);
        }
        // panel y manguera (cilindro conectado)
        if (s.kind === 'wall' && def.wall) {
            var px = sx + def.wall[0] * 0.24, py = sy + def.wall[1] * 0.24;
            var ux = -def.wall[1], uy = def.wall[0];
            var pc = [P(px - ux * 0.09, py - uy * 0.09, 0.98), P(px + ux * 0.09, py + uy * 0.09, 0.98), P(px + ux * 0.09, py + uy * 0.09, 1.14), P(px - ux * 0.09, py - uy * 0.09, 1.14)];
            var pm = P(px, py, 0.98);
            solid.push({ d: pm.d - 0.001, s: '<polygon class="rm-reg' + off + '" points="' + _invRoomPts(pc) + '"/>' +
                '<path class="rm-hose' + off + '" d="M' + pm.x.toFixed(1) + ' ' + pm.y.toFixed(1) + ' Q' + ((pm.x + t.x) / 2).toFixed(1) + ' ' + (Math.max(pm.y, t.y) + 14).toFixed(1) + ' ' + t.x.toFixed(1) + ' ' + (t.y - 3).toFixed(1) + '"/>' });
        }
        var gauge = s.kind === 'wall' || drum;   // los conectados y todos los tambos muestran el nivel
        g += '<g class="rm-cyl rm-cyl--' + L.tone + (gauge ? ' rm-cyl--gauge' : ' rm-cyl--stock') + (L.dim ? ' rm-dim' : '') + (sel ? ' rm-cyl--sel' : '') + off + '" data-gas-id="' + _invRoomEsc(s.gasId) + '" data-code="' + s.code + '" tabindex="0" role="button" aria-label="' + _invRoomEsc(L.aria || s.code) + '"><title>' + _invRoomEsc(L.aria || s.code) + '</title>';
        // cuerpo (metal) + nivel (color del estado) + domo + válvula
        g += '<path class="rm-body" d="M' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'L' + (t.x - rx).toFixed(1) + ' ' + t.y.toFixed(1) + 'L' + (t.x + rx).toFixed(1) + ' ' + t.y.toFixed(1) + 'L' + (b.x + rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 0 1 ' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'Z"/>';
        if (gauge && !top && pct > 0) {
            g += '<path class="rm-level" fill="url(#rm-g-' + L.tone + ')" color="' + tone.fill + '" d="M' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'L' + (lv.x - rx).toFixed(1) + ' ' + lv.y.toFixed(1) + 'A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 0 0 ' + (lv.x + rx).toFixed(1) + ' ' + lv.y.toFixed(1) + 'L' + (b.x + rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 0 1 ' + (b.x - rx).toFixed(1) + ' ' + b.y.toFixed(1) + 'Z"/>';
        }
        if (drum) {
            // Aros del tambo (a un tercio y dos tercios), la mitad de enfrente.
            [0.33, 0.66].forEach(function(f) {
                var hp = P(sx, sy, z0 + h * f);
                g += '<path class="rm-hoop" d="M' + (hp.x - rx).toFixed(1) + ' ' + hp.y.toFixed(1) + 'A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 0 0 ' + (hp.x + rx).toFixed(1) + ' ' + hp.y.toFixed(1) + '"/>';
            });
        }
        g += '<ellipse class="rm-dome' + (drum ? ' rm-lid' : '') + '" cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" rx="' + rx.toFixed(1) + '" ry="' + (ry + 0.3).toFixed(1) + '"' + (drum ? _invRoomLidFill(L) : _invRoomDomeFill(gauge, tone, L.tag)) + '/>';
        if (top && gauge) {
            var circ = 2 * Math.PI * rx * 0.78;
            g += '<circle class="rm-ring" cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" r="' + (rx * 0.78).toFixed(1) + '" stroke="' + tone.fill + '" stroke-dasharray="' + (circ * pct).toFixed(1) + ' ' + circ.toFixed(1) + '" transform="rotate(-90 ' + t.x.toFixed(1) + ' ' + t.y.toFixed(1) + ')"/>';
        }
        var vh = Math.max(2, (drum ? 0.03 : 0.08) * S * cosE);
        if (drum) g += '<rect class="rm-valve rm-bung" x="' + (t.x + rx * 0.35).toFixed(1) + '" y="' + (t.y - vh - ry * 0.2).toFixed(1) + '" width="' + (rx * 0.22).toFixed(1) + '" height="' + vh.toFixed(1) + '" rx="1"/>';
        else g += '<rect class="rm-valve" x="' + (t.x - rx * 0.28).toFixed(1) + '" y="' + (t.y - vh - 1).toFixed(1) + '" width="' + (rx * 0.56).toFixed(1) + '" height="' + vh.toFixed(1) + '" rx="1.5"/>';
        g += '</g>';
        solid.push({ d: b.d, s: g });

        // Fuera de pared NO hay etiqueta suelta en la vista general: en un buffer visto en 3D se
        // enciman. La tapa lleva el color, el recuadro de la zona los resume y la vista de frente
        // (al entrar a la zona) los dice uno por uno.
        // Marcador (como los pines del tablero de almacén): crítico, vencido o pedir ya
        if (gauge && L.pin) {
            var pin = top ? { x: t.x, y: t.y - rx - 6 } : P(sx, sy, h + 0.42);
            var pt = INV_ROOM_TONES[L.pin === 'pedir' ? 'mid' : 'low'];
            over.push({ d: b.d, s: '<g class="rm-pin' + (L.dim ? ' rm-dim' : '') + off + '" aria-hidden="true"><path d="M' + pin.x.toFixed(1) + ' ' + pin.y.toFixed(1) + 'c-5 -7 -8 -10 -8 -14a8 8 0 1 1 16 0c0 4 -3 7 -8 14z" fill="' + pt.fill + '" stroke="#fff" stroke-width="1.5"/>' +
                '<text x="' + pin.x.toFixed(1) + '" y="' + (pin.y - 10).toFixed(1) + '">!</text></g>' });
        }
        // En buffers, diablito y cuartito los cilindros van pegados y sus etiquetas se enciman
        // desde cualquier ángulo: ahí el nombre sale al pasar el ratón (<title>) y en el panel.
        if (opts.labels !== false && L.short && gauge && !drum && opts.focusLabels !== s.zone) {
            var lt = L.short + (L.tone !== 'none' && L.tone !== 'empty' ? ' · ' + Math.round(L.pct || 0) + '%' : '');
            over.push({ d: b.d, s: '<text class="rm-lbl' + (L.dim ? ' rm-dim' : '') + off + '" x="' + b.x.toFixed(1) + '" y="' + (b.y + ry + 13).toFixed(1) + '">' + _invRoomEsc(lt) + '</text>' });
        }
        if (FZ === s.zone) over.push({ d: 97, s: _invRoomFocusLabel(s, L, gauge, b, ry, ppu, fdet) });
    });

    // Recuadro de cada zona: ocupación + resumen (se toca para entrar a la zona)
    scene.zones.forEach(function(z) {
        var ss = chips[z.id];
        if (!ss || !ss.length || opts.lite) return;
        var def = layout.zones[z.id] || {};
        var cx = 0, cy = 0;
        ss.forEach(function(s) { cx += s.x; cy += s.y; });
        cx /= ss.length; cy /= ss.length;
        if (def.wall) { cx -= def.wall[0] * 0.45; cy -= def.wall[1] * 0.45; }
        // [3.11.0] Una tarima lleva su recuadro en el piso, ENFRENTE (del lado de `face`): encima de
        // los tambos tapaba los de atrás y no dejaba tocarlos.
        var onFloor = def.kind === 'buffer' || def.kind === 'pallet' || def.kind === 'tote';
        if (def.pallet) {
            var fr = (def.face || 0) * Math.PI / 180, half = (def.pallet[3] - def.pallet[1]) / 2;
            cx = (def.pallet[0] + def.pallet[2]) / 2 + Math.sin(fr) * (half + 0.28);
            cy = (def.pallet[1] + def.pallet[3]) / 2 + Math.cos(fr) * (half + 0.28);
        }
        if (def.chipOffset) { cx += def.chipOffset[0]; cy += def.chipOffset[1]; }
        // Un buffer va en el piso junto a su rack: flotando alto, el de F quedaba a la altura de E.
        var p = P(cx, cy, def.kind === 'wall' ? 1.55 : onFloor ? 0.1 : 1.3);
        var txt = z.id + ' · ' + z.used + '/' + z.total;
        var sub = invRoomZoneSummary(ss, look, def.kind);
        var w = Math.max(txt.length * 7.4, sub.length * 5.6) + 22, hh = sub ? 34 : 22;
        var off = opts.focus ? ' rm-off' : '';
        // [3.11.0] El de una tarima va en el piso y se pinta por profundidad: lo que está delante
        // (los tambos de la tarima de enfrente) lo tapa, como en el cuarto real, y él no los tapa.
        (def.pallet ? solid : over).push({ d: def.pallet ? p.d : 98, s: '<g class="rm-chip rm-chip--' + (def.kind || 'x') + off + '" data-zone="' + z.id + '" tabindex="0" role="button" aria-label="Ver de frente la zona ' + z.id + ' (' + _invRoomEsc(z.label) + '): ' + z.used + ' de ' + z.total + (sub ? ', ' + _invRoomEsc(sub) : '') + '">' +
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
        '<linearGradient id="rm-g-metal" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#94a3b8"/><stop offset="0.4" stop-color="#f1f5f9"/><stop offset="1" stop-color="#a8b3c4"/></linearGradient>' +
        (layout.item === 'drum' ? '<linearGradient id="rm-g-drum" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#475569"/><stop offset="0.42" stop-color="#cbd5e1"/><stop offset="1" stop-color="#64748b"/></linearGradient>' : '') + '</defs>';
    return {
        box: box,
        svg: defs + '<g class="rm-floor-layer">' + floorL.join('') + '</g>' +
             '<g class="rm-solid-layer">' + solid.map(function(x) { return x.s; }).join('') + '</g>' +
             '<g class="rm-over-layer">' + over.map(function(x) { return x.s; }).join('') + '</g>'
    };
}

var INV_ROOM_OPEN_SP = 0.36;    // separación entre cilindros con el rack abierto (unidades)
var INV_ROOM_OPEN_GAP = 0.3;    // y entre la fila del fondo y la del frente
/**
 * Desplazamiento de una posición cuando su rack "se abre" (al entrar a un buffer). PURA.
 * Abierto, el buffer queda en UNA fila de frente, como una pared: la fila del fondo (con su
 * grande) se desliza a un lado y la del frente al otro, sobre la línea de la fila del frente.
 * Con `amount` entre 0 y 1 está a medio camino (lo usa el vuelo de la cámara).
 */
function invRoomExplodeOffset(def, n, amount) {
    if (!def || !def.rows || !amount) return [0, 0];
    var per = def.perRow || 6, nr = def.rows.length, idx = n - 1;
    var SP = def.openSp || INV_ROOM_OPEN_SP, GAP = def.openGap == null ? INV_ROOM_OPEN_GAP : def.openGap;
    var closed = function(i) {
        if (i < nr * per) { var r = def.rows[Math.floor(i / per)]; var p = _invRoomLerp([r[0], r[1]], [r[2], r[3]], per > 1 ? (i % per) / (per - 1) : 0.5); return p; }
        var bg = def.big && def.big[i - nr * per]; return bg ? [bg[0], bg[1]] : null;
    };
    var order = [], group = [];
    for (var g = 0; g < nr; g++) {
        for (var k = 0; k < per; k++) { order.push(g * per + k); group.push(g); }
        if (def.big && def.big[g]) { order.push(nr * per + g); group.push(g); }
    }
    var j = order.indexOf(idx), c = closed(idx);
    if (j < 0 || !c) return [0, 0];
    // [3.11.0] A lo largo de la fila del frente, sea cual sea su dirección (una tarima vista desde
    // un lado corre en y). Con filas en x es exactamente el cálculo de 3.10.0.
    var last = def.rows[nr - 1], o = [last[0], last[1]];
    var ux = last[2] - last[0], uy = last[3] - last[1], ul = Math.hypot(ux, uy) || 1;
    ux /= ul; uy /= ul;
    var ts = order.map(function(i) { var q = closed(i); return q ? (q[0] - o[0]) * ux + (q[1] - o[1]) * uy : 0; });
    var tc = (Math.min.apply(null, ts) + Math.max.apply(null, ts)) / 2;
    var total = (order.length - 1) * SP + (nr - 1) * GAP;
    var tt = tc - total / 2 + j * SP + group[j] * GAP;
    var tx = o[0] + ux * tt, ty = o[1] + uy * tt;
    return [(tx - c[0]) * amount, (ty - c[1]) * amount];
}

/** Datos grandes debajo de un cilindro de la zona a la que se entró (tamaño fijo en pantalla). */
function _invRoomFocusLabel(s, L, gauge, b, ry, ppu, det) {
    var k = 1 / (ppu || 1), e = _invRoomEsc, x = b.x.toFixed(1);
    var y = b.y + ry + 14 * k, out = '';
    var line = function(cls, px, txt, style) {
        out += '<text class="rm-fl ' + cls + '" x="' + x + '" y="' + y.toFixed(1) + '" style="font-size:' + (px * k).toFixed(2) + 'px' + (style || '') + '">' + e(txt) + '</text>';
        y += px * 1.3 * k;
    };
    if (!L) { if (det !== 'min') line('rm-fl-code', 11, s.code); line('rm-fl-free', 11, 'libre'); return '<g class="rm-flbl" aria-hidden="true">' + out + '</g>'; }
    var tone = INV_ROOM_TONES[L.tone] || INV_ROOM_TONES.none;
    if (det !== 'min') line('rm-fl-code', 11, s.code);
    if (det === 'full') { var nm = String(L.short || ''); line('rm-fl-name', 12.5, nm.length > 12 ? nm.slice(0, 11) + '…' : nm); }
    if (gauge) {
        line('rm-fl-val', 15, L.tone === 'empty' ? 'Vacío' : L.tone === 'none' ? 's/l' : Math.round(L.pct || 0) + '%', ';fill:' + tone.dark);
        if (det === 'full' && L.sub) line('rm-fl-sub', 11, L.sub);
    } else if (L.tag) {
        var tw = (String(L.tag.text).length * 6.6 + 16) * k, th = 18 * k;
        out += '<g class="rm-stag rm-stag--' + L.tag.tone + '"><rect x="' + (b.x - tw / 2).toFixed(1) + '" y="' + (y - 13 * k).toFixed(1) + '" width="' + tw.toFixed(1) + '" height="' + th.toFixed(1) + '" rx="' + (th / 2).toFixed(1) + '"/>' +
               '<text x="' + x + '" y="' + y.toFixed(1) + '" style="font-size:' + (11 * k).toFixed(2) + 'px">' + e(L.tag.text) + '</text></g>';
        y += 18 * k;
    }
    if (det === 'full' && L.ctrl) line('rm-fl-sub', 10.5, L.ctrl);
    return '<g class="rm-flbl" aria-hidden="true">' + out + '</g>';
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
    // [3.11.0] Tarima / boyas: cuántos tambos, cuántos litros entre todos y cuántos bajos.
    if (kind === 'pallet' || kind === 'tote') {
        var nT = 0, lit = 0;
        (slots || []).forEach(function(s) {
            var L = s.gasId && look ? look[s.gasId] : null;
            if (!L) return;
            nT++;
            if (L.liters > 0) lit += L.liters;
            if (L.tone === 'low') c.critico++; else if (L.tone === 'mid') c.bajo++;
        });
        if (!nT) return 'vacía';
        var o2 = [kind === 'tote' ? Math.round(lit) + ' L' : nT + (nT === 1 ? ' tambo' : ' tambos') + ' · ' + Math.round(lit) + ' L'];
        if (c.critico) o2.push(c.critico + (c.critico === 1 ? ' crítico' : ' críticos'));
        if (c.bajo) o2.push(c.bajo + (c.bajo === 1 ? ' bajo' : ' bajos'));
        return o2.join(' · ');
    }
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
    if (String(filter).indexOf('type:') === 0) return (i.typeId || 'none') === filter.slice(5);   // [3.11.0] por tipo de gasolina
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
function invRoomFocusCam(layout, scene, zoneId, opts) {
    opts = opts || {};
    layout = layout || INV_ROOM_LAYOUT;
    var def = layout.zones[zoneId];
    if (!def) return null;
    var cam = { az: def.face || 0, el: def.kind === 'cart' ? 20 : def.kind === 'loose' || def.kind === 'tote' ? 16 : 12, zoom: 1, panX: 0, panY: 0 };
    var C = invRoomCenter(layout), box = invRoomBox(layout, cam), xs = [], ys = [];
    (scene && scene.slots || []).forEach(function(s) {
        if (s.zone !== zoneId) return;
        var ex = invRoomExplodeOffset(def, s.n, 1);   // la vista final es con el rack abierto
        [0, 1.25].forEach(function(z) { var q = invRoomProject(s.x + ex[0], s.y + ex[1], z, cam, C); xs.push(q.x); ys.push(q.y); });
    });
    if (!xs.length) return cam;
    // Margen: a los lados, y abajo lugar para los datos grandes de cada cilindro.
    // (arriba, lugar para la barra de la zona y los marcadores)
    var x0 = Math.min.apply(null, xs) - 45, x1 = Math.max.apply(null, xs) + 45, y0 = Math.min.apply(null, ys) - 80, y1 = Math.max.apply(null, ys) + 95;
    var zoom = Math.max(0.5, Math.min(5, Math.min(box.w * 0.92 / (x1 - x0), box.h * 0.92 / (y1 - y0))));
    var bc = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    var cx = (x0 + x1) / 2;
    // En pantalla angosta (opts.view = px del SVG, opts.minGapPx): si los cilindros quedarían tan
    // juntos que sus datos se enciman, se acerca más y arranca por la izquierda de la zona; el
    // resto se recorre deslizando, como caminar frente a la pared.
    if (opts.view && opts.minGapPx) {
        var px = [];
        (scene && scene.slots || []).forEach(function(s) {
            if (s.zone !== zoneId) return;
            var ex = invRoomExplodeOffset(def, s.n, 1);
            px.push(invRoomProject(s.x + ex[0], s.y + ex[1], 0, cam, C).x);
        });
        px.sort(function(a, b) { return a - b; });
        var gap = Infinity;
        for (var i = 1; i < px.length; i++) { var d = px[i] - px[i - 1]; if (d > 1 && d < gap) gap = d; }
        var vb = Math.min(opts.view.w / box.w, opts.view.h / box.h);
        if (isFinite(gap) && gap * vb * zoom < opts.minGapPx) {
            zoom = Math.min(5, opts.minGapPx / (gap * vb));
            var half = opts.view.w / (vb * zoom) / 2;           // media pantalla, en unidades de escena
            cx = Math.min(cx, x0 + half);                       // empezar por el lado izquierdo de la zona
        }
    }
    cam.zoom = zoom;
    cam.panX = -zoom * (cx - bc.x);
    cam.panY = -zoom * ((y0 + y1) / 2 - bc.y);
    return cam;
}

/** Un paso del vuelo de la cámara (t de 0 a 1, ya suavizado). Gira por el camino corto. PURA. */
function invRoomCamLerp(a, b, t) {
    var daz = ((b.az - a.az + 540) % 360) - 180;
    var L = function(x, y) { return x + (y - x) * t; };
    return { az: a.az + daz * t, el: L(a.el, b.el), zoom: L(a.zoom, b.zoom), panX: L(a.panX, b.panX), panY: L(a.panY, b.panY) };
}

// ══════════════════════════════════════════════════════════════════════
// Pantalla (DOM)
// ══════════════════════════════════════════════════════════════════════
var _invRoom = { sel: null, selSlot: null, moving: null, filter: null, cam: null };

// [3.11.0] Dos cuartos con la MISMA pantalla: cuál se ve es preferencia del equipo
// (`uiPref('roomWhich')`); cada uno guarda su propia cámara.
var INV_ROOM_WHICH = {
    gases:    { label: 'Cuarto de gases', short: 'Gases', icon: '🧪', camPref: 'roomCam' },
    gasolina: { label: 'Cuarto de gasolina', short: 'Gasolina', icon: '⛽', camPref: 'roomCamFuel' },
    // [3.14.0] La celda de pruebas y el cuarto de acondicionamiento (js/sitio.js, su propia escena).
    lab:      { label: 'Laboratorio', short: 'Laboratorio', icon: '🚗', camPref: 'roomCamLab' }
};
function _invRoomWhich() {
    var w = typeof uiPref === 'function' ? uiPref('roomWhich') : null;
    return INV_ROOM_WHICH[w] ? w : 'gases';
}
function _invRoomIsFuel() { return _invRoomWhich() === 'gasolina'; }
function _invRoomL() { return _invRoomIsFuel() ? INV_FUEL_ROOM_LAYOUT : INV_ROOM_LAYOUT; }

/** Cambia de cuarto: la selección, la zona abierta y el filtro son de un cuarto, no viajan. */
function invRoomSwitch(which) {
    if (!INV_ROOM_WHICH[which] || which === _invRoomWhich()) return;
    _invRoomFlyTok++;
    _invRoom = { sel: null, selSlot: null, moving: null, filter: null, cam: null };
    if (typeof uiPref === 'function') uiPref('roomWhich', which);
    var host = document.getElementById('rm-wrap') || document.getElementById('st-wrap');
    if (host && host.parentNode) invRoomRender(host.parentNode); else if (typeof invRender === 'function') invRender();
}

function _invRoomNarrow() { return typeof window !== 'undefined' && window.innerWidth < 700; }
function _invRoomCam() {
    if (!_invRoom.cam) _invRoom.cam = invRoomCamNormalize(typeof uiPref === 'function' ? uiPref(INV_ROOM_WHICH[_invRoomWhich()].camPref) : null, _invRoomNarrow());
    return _invRoom.cam;
}
var _invRoomCamSaveT = null;
function _invRoomCamSave() {
    if (_invRoom.focus || _invRoom.flying) return;   // la cámara de una zona no es la preferencia del equipo
    clearTimeout(_invRoomCamSaveT);
    var key = INV_ROOM_WHICH[_invRoomWhich()].camPref, cam = _invRoom.cam;
    _invRoomCamSaveT = setTimeout(function() { try { if (typeof uiPref === 'function') uiPref(key, cam); } catch (e) {} }, 400);
}
function _invRoomLabelsOn() {
    var v = typeof uiPref === 'function' ? uiPref('roomLabels') : null;
    return v === null || v === undefined ? !_invRoomNarrow() : !!v;
}

/** El objeto de la escena por id: un cilindro, o un tambo en el cuarto de gasolina. */
function _invRoomGas(id) {
    var list = (typeof invState !== 'undefined' && invState) ? (_invRoomIsFuel() ? invState.fuelTanks : invState.gases) : null;
    return (list || []).find(function(g) { return g && g.id === id; }) || null;
}

/** Estado resuelto de cada cilindro, de las definiciones únicas de Consumibles. */
function _invRoomInfo(scene) {
    if (_invRoomIsFuel()) return _invFuelRoomInfo(scene);
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
            sub: lvl.psi != null ? lvl.psi + ' psi' : '',
            aria: (g.zone || '') + ': ' + (g.formula || '') + ' ' + (g.concNominal || '') + ', ' + (INV_ROOM_TONES[tone] || {}).label +
                  (g.status !== 'Empty' && lvl.pct != null ? ' ' + lvl.pct + '%' : '') + (readToday ? ', leído hoy' : '')
        };
    });
    return info;
}

function _invRoomSceneNow() {
    if (_invRoomIsFuel()) {
        return invRoomScene(INV_FUEL_ROOM_LAYOUT, invFuelRoomZones(INV_FUEL_ROOM_LAYOUT), invFuelRoomItems((typeof invState !== 'undefined' && invState.fuelTanks) || []));
    }
    return invRoomScene(_invRoomL(), (typeof invState !== 'undefined' && invState.zones) || [], (typeof invState !== 'undefined' && invState.gases) || []);
}

/** Punto de entrada: pinta la pestaña 🗺️ Cuarto dentro de `el`. */
/** El selector de mapa (gases · gasolina · laboratorio), al principio de la barra. */
function _invRoomSwitchHTML() {
    var which = _invRoomWhich();
    return '<div class="rm-switch" role="tablist" aria-label="Qué mapa ver" data-help="inv-room-help">' + Object.keys(INV_ROOM_WHICH).map(function(k) {
        var on = k === which, d = INV_ROOM_WHICH[k];
        return '<button type="button" role="tab" class="rm-switch-btn' + (on ? ' rm-switch-btn--on' : '') + '" aria-selected="' + on + '" data-room="' + k + '" onclick="invRoomSwitch(\'' + k + '\')" title="Mapa · ' + d.label + '">' +
               '<span aria-hidden="true">' + d.icon + '</span> ' + d.short + '</button>';
    }).join('') + '</div>';
}

function invRoomRender(el) {
    if (!el) return;
    // [3.14.0] El laboratorio (celda + acondicionamiento) tiene su propia escena.
    if (_invRoomWhich() === 'lab' && typeof siteRender === 'function') { siteRender(el); return; }
    var narrow = _invRoomNarrow();
    var labels = _invRoomLabelsOn();
    var fuel = _invRoomIsFuel(), which = _invRoomWhich(), W = INV_ROOM_WHICH[which];
    // [3.11.0] Los dos cuartos con la misma pantalla: el selector va al principio de la barra.
    var sw = _invRoomSwitchHTML();
    var actions = fuel
        ? '<button type="button" class="rm-bar-btn" onclick="invRoomFuelTypesOpen()" title="Cuántos tipos de gasolina hay y cómo se llaman">⛽ Tipos</button>' +
          '<button type="button" class="rm-bar-btn" onclick="invRoomFuelAddDrum()" title="Dar de alta un tambo en una posición libre">＋ Tambo</button>'
        : '<button type="button" class="rm-bar-btn" onclick="invShowAddGas()" title="Un cilindro nuevo llega a recepción (diablito o buffer)">📥 Recibir</button>' +
          '<button type="button" class="rm-bar-btn" onclick="invRoomSetView(\'reticula\')" title="Ver las zonas como tarjetas" aria-label="Retícula">▦</button>';
    el.innerHTML =
        '<div class="rm-wrap rm-dash rm-room--' + which + '" id="rm-wrap">' +
          '<div class="rm-stage' + (labels ? '' : ' rm-labels-off') + '" id="rm-stage">' +
            '<svg class="rm-svg" id="rm-svg" role="application" aria-label="Plano del ' + W.label.toLowerCase() + '. Toca un ' + (fuel ? 'tambo' : 'cilindro') + ' para ver su estado." preserveAspectRatio="xMidYMid meet"><g id="rm-cam"></g></svg>' +
            // Una sola fila: cuarto · indicadores · zonas · acciones (como el tablero del video)
            '<div class="rm-bar" id="rm-bar">' + sw +
              '<div class="rm-kpis" id="rm-kpis" role="group" aria-label="Indicadores del ' + W.label.toLowerCase() + '"></div>' +
              '<span class="rm-bar-sep" aria-hidden="true"></span>' +
              '<div class="rm-zonenav" id="rm-zonenav" role="toolbar" aria-label="Ver una zona de frente"></div>' +
              '<div class="rm-top-actions">' + actions + '</div>' +
            '</div>' +
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
            '<div class="rm-focusbar" id="rm-focusbar" hidden></div>' +
            '<div class="rm-moving" id="rm-moving" hidden></div>' +
            '<div class="rm-pop-host" id="rm-panel" hidden></div>' +
            '<div class="rm-foot" id="rm-foot">' +
              '<div class="rm-legend" aria-hidden="true">' +
                [['ok', '>' + INV_ROOM_HALF_PCT + '%'], ['half', '≤' + INV_ROOM_HALF_PCT + '%'], ['mid', '≤' + (typeof INV_LEVEL_LOW_PCT !== 'undefined' ? INV_LEVEL_LOW_PCT : 30) + '%'],
                 ['low', '≤' + (typeof INV_LEVEL_CRITICAL_PCT !== 'undefined' ? INV_LEVEL_CRITICAL_PCT : 15) + '%']].map(function(k) {
                    return '<span><i style="background:' + INV_ROOM_TONES[k[0]].fill + '"></i>' + k[1] + '</span>'; }).join('') +
                '<span class="rm-legend-sep"></span>' +
                (fuel ? '<span class="rm-legend-lid">tapa = tipo de gasolina</span>'
                      : '<span><i style="background:' + INV_ROOM_TAG_DOME.ok + '"></i>lleno</span><span><i style="background:' + INV_ROOM_TAG_DOME.muted + ';box-shadow:0 0 0 1px #94a3b8 inset"></i>a medias</span><span><i style="background:' + INV_ROOM_TAG_DOME.empty + '"></i>vacío</span>') +
              '</div>' +
              '<div class="rm-foot-btns" id="rm-foot-btns"></div>' +
            '</div>' +
            '<div class="rm-listpop" id="rm-list" hidden></div>' +
          '</div>' +
          '<p class="rm-hintline">' + (fuel
              ? (narrow ? 'Pellizca para acercar · mantén presionado un tambo para moverlo · toca una tarima para verla de frente' : 'Rueda = acercar · arrastra el piso para mover la vista · arrastra un tambo para reubicarlo · toca una tarima para verla de frente')
              : (narrow ? 'Pellizca para acercar · mantén presionado un cilindro para moverlo · toca una zona para verla de frente' : 'Rueda = acercar · arrastra el piso para mover la vista · arrastra un cilindro para reubicarlo · toca una zona para verla de frente')) + '</p>' +
        '</div>';
    _invRoomFitStage();
    invRoomPaint();
    _invRoomBindStage();
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

/**
 * El tablero mide la pantalla (menos la barra fija de arriba y la de abajo) y, si al abrirlo no
 * se ve completo, la página se desliza hasta él: así todo queda en una sola vista.
 */
function _invRoomFitStage() {
    var st = document.getElementById('rm-stage');
    if (!st) return;
    var nav = document.querySelector('.bottom-nav');
    var navH = nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0;
    // Lo que se queda pegado arriba al desplazarse: la barra de la app y la cabecera de Consumibles.
    var barH = 0;
    [document.querySelector('.platform-bar'), st.closest('.platform-section') && st.closest('.platform-section').querySelector('.tp-header')].forEach(function(e) {
        if (e && /sticky|fixed/.test(getComputedStyle(e).position)) barH += e.offsetHeight;
    });
    var h = Math.round(window.innerHeight - barH - navH - 32);
    st.style.height = Math.max(_invRoomNarrow() ? 420 : 480, Math.min(1200, h)) + 'px';
    // Lugar debajo para que la página pueda subir el tablero hasta arriba (si no, no hay a dónde desplazarse).
    var wrap = document.getElementById('rm-wrap');
    if (wrap) wrap.style.paddingBottom = (navH + 24) + 'px';
    // scrollIntoView y no window.scrollTo (busca él solo su contenedor); el margen para lo que se
    // queda pegado arriba lo da scroll-margin-top. Inmediato y un cuadro después de pintar: uno suave
    // se interrumpía mientras la pantalla todavía se acomodaba (en el teléfono no llegaba).
    st.style.scrollMarginTop = (barH + 8) + 'px';
    var align = function() {
        var r = st.getBoundingClientRect();
        if (!st.isConnected || (r.top >= barH - 1 && r.bottom <= window.innerHeight - navH + 1)) return;
        try { st.scrollIntoView({ block: 'start', behavior: 'instant' }); } catch (e) { try { st.scrollIntoView(true); } catch (e2) {} }
    };
    requestAnimationFrame(align);
    setTimeout(align, 350);
    if (!window._invRoomResizeBound) {
        window._invRoomResizeBound = true;
        var t = null, lastW = window.innerWidth;
        window.addEventListener('resize', function() {
            // [3.14.1] En tableta y teléfono el teclado en pantalla solo achica el ALTO: no es otra
            // pantalla. Repintar ahí rehacía el panel, destruía el campo que se estaba llenando, el
            // teclado se cerraba, la ventana volvía a crecer y se repintaba otra vez (#213).
            var w = window.innerWidth;
            if (w === lastW && _invRoomTyping()) return;
            lastW = w;
            clearTimeout(t); t = setTimeout(function() { if (document.getElementById('rm-stage')) { _invRoomFitStage(); invRoomPaint(); } }, 150);
        });
    }
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
    if (_invRoomIsFuel()) _invFuelPaintKpis(scene, info); else _invRoomPaintKpis(scene, info);
    _invRoomPaintZoneNav(scene);
    _invRoomPaintMoving();
    _invRoomPaintFocusBar();
    invRoomPanelPaint();
    if (_invRoomIsFuel()) _invFuelPaintList(scene, info); else _invRoomPaintList(scene, info);
}

function _invRoomLook(info) {
    var look = {};
    Object.keys(info).forEach(function(id) {
        var i = info[id];
        look[id] = { tone: i.tone, pct: i.pct, short: i.short, pin: i.pin, tag: i.tag, aria: i.aria, name: i.name, ctrl: i.ctrl, psi: i.psi, sub: i.sub,
                     typeColor: i.typeColor, liters: i.liters,
                     dim: !!_invRoom.filter && !invRoomFilterMatch(_invRoom.filter, i) };
    });
    return look;
}

/** Solo la escena 3D (lo que cambia en cada cuadro del vuelo de la cámara). */
function _invRoomPaintScene() {
    var svg = document.getElementById('rm-svg'), g = document.getElementById('rm-cam');
    if (!svg || !g || !_invRoom.scene) return;
    var cam = _invRoomCam();
    var box = invRoomBox(_invRoomL(), cam);
    svg.setAttribute('viewBox', box.x.toFixed(1) + ' ' + box.y.toFixed(1) + ' ' + box.w.toFixed(1) + ' ' + box.h.toFixed(1));
    var flying = !!_invRoom.flying;
    // Medir el SVG fuerza a recalcular el diseño: en vuelo no hace falta (no hay datos grandes).
    var ctm = !flying && svg.getScreenCTM ? svg.getScreenCTM() : null;
    var ppu = (ctm && ctm.a ? ctm.a : 1) * cam.zoom;   // px de pantalla por unidad de escena
    var zone = _invRoom.focus || _invRoom.flying || null;
    var out = invRoomSceneSVG(_invRoom.scene, cam, _invRoom.look || {}, { layout: _invRoomL(), sel: _invRoom.sel, selSlot: _invRoom.selSlot, moving: _invRoom.moving,
        labels: !flying, lite: flying, focus: zone, explode: _invRoom.explode || null, focusLabels: _invRoom.focus && !flying ? _invRoom.focus : null, pxPerUnit: ppu });
    _invRoom.box = out.box;
    g.innerHTML = out.svg;
    // Lo que no es la zona se desvanece de a poco durante el vuelo (variable, no transición:
    // la escena se repinta en cada cuadro y una transición CSS no alcanzaría a correr).
    svg.style.setProperty('--rm-off', String(_invRoom.offOpacity == null ? 0.1 : _invRoom.offOpacity));
    if (_invRoom.flFresh) { g.classList.add('rm-fl-in'); _invRoom.flFresh = false; } else g.classList.remove('rm-fl-in');
    _invRoomApplyCam(true);
}

var _invRoomFlT = null;
function _invRoomApplyCam(fromPaint) {
    var g = document.getElementById('rm-cam'), b = _invRoom.box;
    if (!g || !b) return;
    // Dentro de una zona los datos grandes tienen tamaño fijo en pantalla: tras acercar o
    // alejar a mano se vuelven a medir (un instante después, no en cada cuadro).
    if (!fromPaint && _invRoom.focus && !_invRoom.flying) { clearTimeout(_invRoomFlT); _invRoomFlT = setTimeout(_invRoomPaintScene, 140); }
    var cam = _invRoomCam();
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    g.setAttribute('transform', 'translate(' + (cx + cam.panX).toFixed(1) + ' ' + (cy + cam.panY).toFixed(1) + ') scale(' + cam.zoom.toFixed(3) + ') translate(' + (-cx).toFixed(1) + ' ' + (-cy).toFixed(1) + ')');
    if (_invRoom.flying) return;   // en vuelo: solo el transform (la ventana está escondida)
    var st = document.getElementById('rm-stage');
    if (st) st.classList.toggle('rm-near', cam.zoom >= 1.6 || cam.el >= 80);
    _invRoomPlacePop();
}

function _invRoomPaintKpis(scene, info) {
    var host = document.getElementById('rm-kpis');
    if (!host) return;
    var k = invRoomKpis(scene, info);
    var f = _invRoom.filter;
    var tile = function(id, icon, value, label, tone, title) {
        var on = f === id;
        return '<button type="button" class="rm-kpi rm-kpi--' + tone + (on ? ' rm-kpi--on' : '') + '" aria-pressed="' + on + '" onclick="invRoomFilter(\'' + id + '\')" title="' + _invRoomEsc(title) + (on ? ' — toca para quitar el resaltado' : ' — toca para resaltarlos') + '">' +
            '<span class="rm-kpi-ico" aria-hidden="true">' + icon + '</span><b class="rm-kpi-v">' + value + '</b><span class="rm-kpi-l">' + label + '</span>' + (on ? '<span class="rm-kpi-x" aria-hidden="true">✕</span>' : '') + '</button>';
    };
    host.innerHTML =
        '<span class="rm-kpi rm-kpi--info rm-kpi--static" title="Cilindros conectados / posiciones con tablero"><span class="rm-kpi-ico" aria-hidden="true">🔗</span><b class="rm-kpi-v">' + k.connected + '/' + k.wallSlots + '</b><span class="rm-kpi-l">Conectados</span></span>' +
        tile('recepcion', '📥', k.reception, 'Recepción', 'info', 'En recepción / stock (diablito y buffers)') +
        tile('critico', '🔴', k.critical + k.low, 'Bajos', k.critical ? 'bad' : k.low ? 'warn' : 'ok', k.critical + ' crítico(s) · ' + k.low + ' bajo(s)') +
        tile('pedir', '🛒', k.reorder, 'Pedir', k.reorder ? 'warn' : 'ok', 'Pedir ya (lo que tarda el proveedor)') +
        tile('vencido', '📅', k.expired, 'Vencidos', k.expired ? 'bad' : 'ok', 'Vencidos') +
        tile('sinleer', '📏', k.readToday + '/' + k.toRead, 'Leídos hoy', k.readToday >= k.toRead ? 'ok' : 'info', 'Leídos hoy / por leer');
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
    var lbl = _invRoomIsFuel() ? (g.name || 'Tambo') : (g.formula || '') + ' ' + (g.concNominal || ''), at = _invRoomIsFuel() ? g.pos : g.zone;
    m.innerHTML = '<span>↔ Moviendo <b>' + _invRoomEsc(lbl) + '</b>' + (at ? ' (' + _invRoomEsc(at) + ')' : '') + ' — toca una posición libre</span>' +
        '<button type="button" class="tp-btn tp-btn-ghost" onclick="invRoomMoveCancel()">✕ Cancelar</button>';
}

// ── Ventana flotante: estado + lectura junto al cilindro ─────────────
/** ¿Se está escribiendo en un campo? (el teclado en pantalla está abierto). */
function _invRoomTyping() {
    var ae = document.activeElement;
    return !!(ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable) && ae.type !== 'button' && ae.type !== 'checkbox' && ae.type !== 'radio');
}

/**
 * Lo tecleado en el panel y no guardado todavía, para devolverlo tras repintar la MISMA
 * selección (un repintado por la nube o por un cambio de tamaño no debe borrarlo):
 * {key, values:{id: valor}, focus, start, end}. Lo que se guardó se suelta con
 * `_invRoomPanelForget()` antes de repintar.
 */
function _invRoomPanelKeep(host, key) {
    var keep = { key: key, values: {}, focus: null, start: null, end: null };
    host.querySelectorAll('input[id], textarea[id]').forEach(function(el) {
        if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'button') return;
        if (el.value !== el.defaultValue) keep.values[el.id] = el.value;
    });
    var ae = document.activeElement;
    if (ae && ae.id && host.contains(ae)) {
        keep.focus = ae.id;
        try { keep.start = ae.selectionStart; keep.end = ae.selectionEnd; } catch (e) {}
    }
    return keep;
}

/** Tras guardar, lo tecleado ya no es "pendiente": el repintado no debe devolverlo. */
function _invRoomPanelForget() { var h = document.getElementById('rm-panel'); if (h) delete h.dataset.key; }

function invRoomPanelPaint() {
    var host = document.getElementById('rm-panel');
    if (!host) return;
    var fuel = _invRoomIsFuel();
    var key = (fuel ? 'f:' : 'g:') + (_invRoom.sel ? 'sel:' + _invRoom.sel : _invRoom.selSlot ? 'slot:' + _invRoom.selSlot : '');
    var keep = host.dataset.key === key ? _invRoomPanelKeep(host, key) : null;
    host.dataset.key = key;
    if (_invRoom.sel) { host.hidden = false; host.innerHTML = fuel ? _invFuelDrumPanelHTML(_invRoom.sel) : _invRoomGasPanelHTML(_invRoom.sel); }
    else if (_invRoom.selSlot) { host.hidden = false; host.innerHTML = fuel ? _invFuelSlotPanelHTML(_invRoom.selSlot) : _invRoomSlotPanelHTML(_invRoom.selSlot); }
    else { host.hidden = true; host.innerHTML = ''; return; }
    if (typeof uiChipsEnhance === 'function') { try { uiChipsEnhance(host); } catch (e) {} }
    if (keep) {
        Object.keys(keep.values).forEach(function(id) { var el = document.getElementById(id); if (el && host.contains(el)) el.value = keep.values[id]; });
        var f = keep.focus && document.getElementById(keep.focus);
        if (f && host.contains(f)) {
            try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
            try { if (keep.start != null) f.setSelectionRange(keep.start, keep.end); } catch (e) {}
        }
    }
    _invRoomPlacePop();
}

/**
 * Coloca la ventana junto a lo elegido: a la derecha si cabe, si no a la izquierda; a media
 * altura del cilindro y sin salirse del tablero. En el teléfono es una hoja abajo (CSS).
 */
function _invRoomPlacePop() {
    var host = document.getElementById('rm-panel'), st = document.getElementById('rm-stage');
    if (!host || host.hidden || !st) return;
    st.classList.toggle('rm-pop-flying', !!_invRoom.flying);
    if (_invRoomNarrow()) { host.style.left = ''; host.style.top = ''; return; }
    var sel = _invRoom.sel ? '#rm-svg .rm-cyl[data-gas-id="' + String(_invRoom.sel).replace(/"/g, '') + '"]'
            : _invRoom.selSlot ? '#rm-svg .rm-slot[data-code="' + _invRoom.selSlot + '"]' : null;
    var n = sel && document.querySelector(sel);
    var sr = st.getBoundingClientRect(), pw = host.offsetWidth || 320, ph = host.offsetHeight || 300;
    var left, top;
    if (n) {
        var r = n.getBoundingClientRect();
        left = r.right - sr.left + 16;
        if (left + pw > sr.width - 10) left = r.left - sr.left - pw - 16;
        top = r.top - sr.top + r.height / 2 - ph / 2;
    } else { left = sr.width - pw - 12; top = 60; }
    left = Math.max(10, Math.min(sr.width - pw - 10, left));
    top = Math.max(_invRoom.focus ? 112 : 56, Math.min(sr.height - ph - 44, top));
    host.style.left = Math.round(left) + 'px';
    host.style.top = Math.round(top) + 'px';
}

function _invRoomStepperHTML(step, steps, aria) {
    steps = steps || INV_ROOM_STEPS;
    var idx = steps.map(function(s) { return s.id; }).indexOf(step);
    return '<ol class="rm-steps" aria-label="' + (aria || 'Ciclo del cilindro') + '">' + steps.map(function(s, i) {
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
    var zoneDef = slot ? (_invRoomL().zones[slot.zone] || {}) : {};
    var i = (_invRoom.info || {})[id] || {};
    var tone = INV_ROOM_TONES[i.tone] || INV_ROOM_TONES.none;
    var today = typeof localToday === 'function' ? localToday() : '';
    var todayR = typeof invFindReadingOn === 'function' ? invFindReadingOn(g, today) : null;
    var last = (g.readings || []).filter(function(r) { return r && !r.auto; }).slice(-1)[0];
    var e = _invRoomEsc;
    var h = '<div class="rm-panel rm-pop" role="region" aria-label="Cilindro ' + e(g.controlNo || '') + '">';
    h += '<div class="rm-panel-head"><div><div class="rm-panel-kicker">' + (slot ? e(slot.code) + ' · ' + e(zoneDef.label || '') : 'Sin lugar en el plano') + '</div>' +
         '<div class="rm-panel-title">' + e(m ? m.title : (g.formula || 'Cilindro')) + '</div></div>' +
         '<button type="button" class="rm-x" onclick="invRoomClose()" aria-label="Cerrar">✕</button></div>';
    // Nivel
    var val = g.status === 'Empty' ? 'Vacío' : (i.tone === 'none' ? 'Sin lecturas' : (i.pct || 0) + '%');
    h += '<div class="rm-gauge"><div class="rm-gauge-bar"><span style="width:' + Math.max(0, Math.min(100, i.pct || 0)) + '%;background:' + tone.fill + '"></span></div>' +
         '<div class="rm-gauge-t"><b style="color:' + tone.dark + '">' + val + '</b>' + (i.psi != null && g.status !== 'Empty' ? ' · ' + i.psi + ' psi' : '') + ' · ' + tone.label + '</div></div>';
    // Lectura: lo primero, ahí mismo
    if (g.status !== 'Empty') {
        h += '<form class="rm-read" onsubmit="return invRoomSaveReading(event)">' +
             '<label for="rm-psi" class="rm-read-l">' + (todayR ? '✓ Leído hoy: <b>' + todayR.psi + ' psi</b> — corregir' : 'Lectura de hoy (psi)') + '</label>' +
             '<div class="rm-read-row"><input id="rm-psi" type="number" inputmode="decimal" min="0" step="any" placeholder="Ej.: 1250" value="' + (todayR ? todayR.psi : '') + '">' +
             (last && !todayR ? '<button type="button" class="rm-same" onclick="document.getElementById(\'rm-psi\').value=\'' + last.psi + '\';document.getElementById(\'rm-psi\').focus()" title="Repetir la última lectura (' + e(last.date) + ')">= ' + last.psi + '</button>' : '') +
             '<button type="submit" class="btn btn-primary rm-read-btn">Guardar</button></div></form>';
    }
    // Estatus
    var stOpts = ['In use', 'Stock', 'Spare', 'Empty'].map(function(st) {
        return '<option value="' + st + '"' + (g.status === st ? ' selected' : '') + '>' + (typeof uiLabel === 'function' ? uiLabel('gasStatus', st) : st) + '</option>';
    }).join('');
    h += '<div class="rm-status"><label for="rm-status" class="rm-read-l">Estatus</label><select id="rm-status" data-chips onchange="invRoomSetStatus(\'' + e(id) + '\', this.value)">' + stOpts + '</select></div>';
    if (slot && slot.kind === 'wall' && g.status !== 'In use' && g.status !== 'Empty') h += '<p class="rm-hint">Está en una pared con tablero. Si ya quedó conectado, márcalo <b>En uso</b>.</p>';
    if (slot && slot.kind !== 'wall' && g.status === 'In use') h += '<p class="rm-hint">Dice <b>En uso</b> pero está en ' + e(zoneDef.label || 'recepción') + ', sin tablero. ¿Ya se desconectó?</p>';
    h += '<div class="rm-actions">' +
         '<button type="button" class="rm-act" onclick="invRoomMoveStart(\'' + e(id) + '\')">↔ Mover</button>' +
         (typeof fichaOpen === 'function' ? '<button type="button" class="rm-act" onclick="fichaOpen(\'cilindro\', \'' + e(id) + '\', this)">📄 Ficha</button>' : '') +
         '<button type="button" class="rm-act" onclick="invShowAddGas(\'' + e(id) + '\')">✏️ Editar</button></div>';
    // Lo demás, plegado
    var badges = m && m.badges ? m.badges.filter(function(b) { return !/%$/.test(String(b.text)); }) : [];
    h += '<details class="rm-more"><summary>Más: consumo, vigencia, ciclo y lecturas</summary>' +
         (badges.length ? '<div class="rm-badges">' + badges.map(function(b) { return '<span class="rm-badge rm-badge--' + e(b.tone || 'muted') + '">' + e(b.text) + '</span>'; }).join('') + '</div>' : '') +
         (m && m.facts && m.facts.length ? '<dl class="rm-facts">' + m.facts.map(function(f) { return '<div><dt>' + e(f.k) + '</dt><dd>' + e(f.v) + '</dd></div>'; }).join('') + '</dl>' : '') +
         _invRoomStepperHTML(invRoomLifecycle(g, slot ? slot.kind : null)) +
         (m && m.history && m.history.length ? '<ul class="rm-histl">' + m.history.map(function(x) { return '<li><span>' + e(x.when) + '</span> ' + e(x.text) + '</li>'; }).join('') + '</ul>' : '') +
         '</details>';
    return h + '</div>';
}

function _invRoomSlotPanelHTML(code) {
    var scene = _invRoom.scene || _invRoomSceneNow();
    var slot = scene.slots.find(function(s) { return s.code === code; });
    if (!slot) return '';
    var def = _invRoomL().zones[slot.zone] || {};
    // Lo que se puede acomodar aquí: lo que está en recepción y lo que no tiene lugar.
    var cands = [];
    scene.slots.forEach(function(s) {
        if (s.gasId && s.code !== code && INV_ROOM_RECEPTION_KINDS.indexOf(s.kind) >= 0 && INV_ROOM_RECEPTION_KINDS.indexOf(slot.kind) < 0) cands.push({ id: s.gasId, from: s.code });
    });
    scene.unplaced.forEach(function(u) { cands.push({ id: u.gasId, from: u.zone || 'sin lugar' }); });
    var h = '<div class="rm-panel rm-pop" role="region" aria-label="Posición ' + code + '">' +
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

function invRoomToggleList(force) {
    var host = document.getElementById('rm-list');
    if (!host) return;
    _invRoom.listOpen = force != null ? !!force : !_invRoom.listOpen;
    host.hidden = !_invRoom.listOpen;
    var b = document.getElementById('rm-btn-list');
    if (b) b.setAttribute('aria-expanded', String(_invRoom.listOpen));
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
        rows.push({ rank: i.tone === 'low' || i.expired ? 0 : 1, html: '<button type="button" class="rm-row" onclick="invRoomToggleList(false);invRoomSelect(\'' + _invRoomEsc(s.gasId) + '\')"><span class="rm-row-code">' + s.code + '</span><span class="rm-row-name">' + label(g) + '</span><span class="rm-row-tags">' + why.join('') + '</span></button>' });
    });
    rows.sort(function(a, b) { return a.rank - b.rank; });
    var reasons = { 'sin-zona': 'Sin posición', 'zona-desconocida': 'Zona que no existe', 'fuera-del-plano': 'Posición fuera del plano', 'repetida': 'Posición repetida' };
    var un = scene.unplaced.map(function(u) {
        var g = _invRoomGas(u.gasId);
        if (!g) return '';
        return '<div class="rm-row rm-row--un"><span class="rm-row-code">' + _invRoomEsc(u.zone || '—') + '</span><span class="rm-row-name">' + label(g) + '</span>' +
            '<span class="rm-row-tags"><span class="rm-tag rm-tag--info">' + reasons[u.reason] + '</span><button type="button" class="tp-btn tp-btn-ghost" onclick="invRoomToggleList(false);invRoomMoveStart(\'' + _invRoomEsc(u.gasId) + '\')">↔ Acomodar</button></span></div>';
    }).join('');
    var extra = scene.zones.filter(function(z) { return !z.inPlan || z.drawn < z.total; });
    var fb = document.getElementById('rm-foot-btns');
    if (fb) fb.innerHTML = '<button type="button" id="rm-btn-list" class="rm-foot-btn' + (rows.length ? ' rm-foot-btn--warn' : '') + '" aria-expanded="' + !!_invRoom.listOpen + '" onclick="invRoomToggleList()">⚠ Atención <b>' + rows.length + '</b></button>' +
        (scene.unplaced.length ? '<button type="button" class="rm-foot-btn rm-foot-btn--info" onclick="invRoomToggleList(true)" title="Cilindros sin posición, con posición repetida o en una zona que no existe">No se ven en el plano <b>' + scene.unplaced.length + '</b></button>' : '');
    host.hidden = !_invRoom.listOpen;
    host.innerHTML = '<div class="rm-listpop-head"><b>Atención y pendientes</b><button type="button" class="rm-x" onclick="invRoomToggleList(false)" aria-label="Cerrar">✕</button></div>' +
        '<div class="rm-list-col"><h4>Atención <span class="rm-count">' + rows.length + '</span></h4>' +
          (rows.length ? rows.map(function(r) { return r.html; }).join('') : '<p class="rm-empty">Ningún cilindro bajo, vencido ni por pedir.</p>') + '</div>' +
        (un || extra.length ? '<div class="rm-list-col"><h4>No se ven en el plano <span class="rm-count">' + scene.unplaced.length + '</span></h4>' + un +
            extra.map(function(z) { return '<p class="rm-empty">Zona ' + _invRoomEsc(z.id) + ': ' + (z.inPlan ? 'tiene ' + z.total + ' posiciones y el plano dibuja ' + z.drawn : 'no está en el plano del cuarto') + '.</p>'; }).join('') + '</div>' : '');
}

// ── Selección y movimiento ───────────────────────────────────────────
function invRoomSelect(id) {
    _invRoom.sel = id; _invRoom.selSlot = null;
    invRoomPaint();
    var p = document.getElementById('rm-psi');
    if (p && !_invRoomNarrow()) { try { p.focus({ preventScroll: true }); } catch (e) {} }
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
    if (_invRoomIsFuel()) {
        var ok = g.pos !== code && typeof invFuelMove === 'function' ? invFuelMove(gasId, code) : false;
        invRoomPaint();
        return !!ok;
    }
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
    var fuel = _invRoomIsFuel();
    if (inp.value === '') { if (typeof uiInvalid === 'function') uiInvalid(inp, fuel ? 'Escribe cuántos litros tiene el tambo.' : 'Escribe la presión que marca el manómetro.'); return false; }
    var res = fuel ? invAddFuelReading(id, inp.value, { source: 'cuarto' }) : invAddReading(id, inp.value, { source: 'cuarto' });
    if (!res.ok) { if (typeof uiInvalid === 'function') uiInvalid(inp, res.reason + '.'); return false; }
    if (typeof invUpdateBadges === 'function') { try { invUpdateBadges(); } catch (e) {} }
    _invRoomPanelForget();
    invRoomPaint();
    return false;
}

function invRoomSetStatus(id, st) {
    var fn = _invRoomIsFuel() ? (typeof invFuelSetStatus === 'function' ? invFuelSetStatus : null) : (typeof invGasSetStatus === 'function' ? invGasSetStatus : null);
    if (!fn) return;
    var r = fn(id, st, { via: 'cuarto' });
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
function invRoomResetCam() {
    if (_invRoom.focus || _invRoom.flying) { invRoomUnfocus(); return; }   // ⌂ dentro de una zona = salir de ella
    _invRoom.cam = invRoomCamNormalize(null, _invRoomNarrow()); invRoomPaint(); _invRoomCamSave();
}
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
function invRoomNearestSlot(slots, pt, cam, maxDist, layout, explode) {
    if (!pt) return null;
    layout = layout || INV_ROOM_LAYOUT;
    var C = invRoomCenter(layout), best = null, bd = maxDist == null ? 40 : maxDist;
    (slots || []).forEach(function(s) {
        if (s.gasId) return;
        var ex = invRoomExplodeOffset(layout.zones[s.zone], s.n, (explode || {})[s.zone] || 0);
        var p = invRoomProject(s.x + ex[0], s.y + ex[1], 0, cam, C);
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
    // Esc desde la barra de la zona o la ventana flotante (fuera del SVG)
    var stage = document.getElementById('rm-stage');
    if (stage) stage.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape' || svg.contains(e.target)) return;
        if (_invRoom.moving) invRoomMoveCancel(); else if (_invRoom.sel || _invRoom.selSlot) invRoomClose(); else if (_invRoom.listOpen) invRoomToggleList(false); else if (_invRoom.focus) invRoomUnfocus();
    });
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
    var t = invRoomNearestSlot((_invRoom.scene || {}).slots, pt, _invRoomCam(), 45, _invRoomL(), _invRoom.explode);
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
/**
 * Vuela la cámara de `from` a `to` repintando SOLO la escena en cada cuadro (es el mismo
 * modelo de principio a fin: no hay cambio de dibujo). `onFrame(t)` mueve lo que acompaña al
 * vuelo — abrir/cerrar el rack, desvanecer el resto — con el mismo `t` ya suavizado.
 */
function _invRoomFly(from, to, onFrame, done) {
    var tok = ++_invRoomFlyTok;
    var stage = document.getElementById('rm-stage');
    if (_invRoomReduceMotion()) { if (onFrame) onFrame(1); _invRoom.cam = to; _invRoomPaintScene(); if (done) done(); return; }
    if (stage) stage.classList.add('rm-flying');
    var t0 = null, DUR = 820;
    var ease = function(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    var step = function(ts) {
        if (tok !== _invRoomFlyTok) return;
        if (t0 === null) t0 = ts;
        var t = Math.min(1, (ts - t0) / DUR), k = ease(t);
        _invRoom.cam = invRoomCamLerp(from, to, k);
        if (onFrame) onFrame(k);
        _invRoomPaintScene();
        if (t < 1) { requestAnimationFrame(step); return; }
        _invRoom.cam = to;
        if (stage) stage.classList.remove('rm-flying');
        if (done) done();
    };
    requestAnimationFrame(step);
}

/** Entra a una zona: la cámara vuela hasta verla de frente, en el mismo 3D. */
function invRoomFocus(zoneId) {
    var scene = _invRoom.scene || _invRoomSceneNow();
    var svgEl = document.getElementById('rm-svg');
    var view = svgEl ? { w: svgEl.clientWidth || 0, h: svgEl.clientHeight || 0 } : null;
    var to = invRoomFocusCam(_invRoomL(), scene, zoneId, view && view.w ? { view: view, minGapPx: 58 } : {});
    if (!to || zoneId === _invRoom.focus) return;
    var from = Object.assign({}, _invRoomCam());
    if (!_invRoom.focus && !_invRoom.flying) _invRoom.prevCam = Object.assign({}, from);   // "vista anterior" = la general
    var prev = _invRoom.focus;                     // de una zona a otra: una se cierra mientras la otra se abre
    var off0 = _invRoom.offOpacity == null ? 1 : _invRoom.offOpacity;
    var ex0 = Object.assign({}, _invRoom.explode || {});
    _invRoom.selSlot = null;
    _invRoom.focus = null;
    _invRoom.flying = zoneId;
    _invRoomPaintFocusBar();
    _invRoomPaintZoneNav(scene);
    _invRoomPlacePop();
    _invRoomFly(from, to, function(k) {
        var ex = {};
        Object.keys(ex0).forEach(function(z) { if (z !== zoneId) ex[z] = ex0[z] * (1 - k); });
        ex[zoneId] = Math.max(ex0[zoneId] || 0, k);
        _invRoom.explode = ex;
        _invRoom.offOpacity = off0 + (0.1 - off0) * k;
    }, function() {
        _invRoom.flying = null;
        _invRoom.focus = zoneId;
        _invRoom.explode = {}; _invRoom.explode[zoneId] = 1;
        _invRoom.offOpacity = 0.1;
        _invRoom.flFresh = true;                    // los datos grandes aparecen con un fundido, una vez
        invRoomPaint();
        var b = document.querySelector('#rm-focusbar .rm-focus-back');
        if (b && !prev) { try { b.focus({ preventScroll: true }); } catch (e) {} }
    });
}

/** Regresa a la vista anterior (la general), volando de regreso y cerrando el rack. */
function invRoomUnfocus() {
    if (!_invRoom.focus && !_invRoom.flying) return;
    var from = Object.assign({}, _invRoomCam());
    var to = _invRoom.prevCam || invRoomCamNormalize(null, _invRoomNarrow());
    var was = _invRoom.focus || _invRoom.flying;
    var ex0 = Object.assign({}, _invRoom.explode || {}), off0 = _invRoom.offOpacity == null ? 0.1 : _invRoom.offOpacity;
    _invRoom.flying = was; _invRoom.focus = null; _invRoom.selSlot = null;
    _invRoomPaintFocusBar();
    _invRoomPlacePop();
    _invRoomFly(from, to, function(k) {
        var ex = {};
        Object.keys(ex0).forEach(function(z) { ex[z] = ex0[z] * (1 - k); });
        _invRoom.explode = ex;
        _invRoom.offOpacity = off0 + (1 - off0) * k;
    }, function() {
        _invRoom.flying = null; _invRoom.prevCam = null; _invRoom.explode = null; _invRoom.offOpacity = null;
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
    host.innerHTML =
        '<button type="button" class="rm-zbtn' + (!cur ? ' rm-zbtn--on' : '') + '" aria-pressed="' + !cur + '" onclick="invRoomUnfocus()" title="Todo el cuarto">🔭</button>' +
        zs.map(function(z) {
            var on = cur === z.id;
            return '<button type="button" class="rm-zbtn rm-zbtn--' + (z.kind || 'x') + (on ? ' rm-zbtn--on' : '') + '" data-zone="' + z.id + '" aria-pressed="' + on + '" onclick="invRoomFocus(\'' + z.id + '\')" title="Ver de frente: ' + _invRoomEsc(z.label) + ' · ' + z.used + '/' + z.total + '">' +
                '<b>' + z.id + '</b><span>' + z.used + '/' + z.total + '</span></button>';
        }).join('');
}

/** La barra de la zona a la que se entró: regresar, nombre + resumen, zona vecina. */
function _invRoomPaintFocusBar() {
    var host = document.getElementById('rm-focusbar'), stage = document.getElementById('rm-stage');
    if (stage) stage.classList.toggle('rm-focused', !!_invRoom.focus);
    if (!host) return;
    if (!_invRoom.focus) { host.classList.remove('is-in'); host.hidden = true; host.innerHTML = ''; return; }
    var scene = _invRoom.scene, zid = _invRoom.focus;
    var z = scene.zones.find(function(x) { return x.id === zid; });
    var def = _invRoomL().zones[zid] || {};
    var sub = invRoomZoneSummary(scene.slots.filter(function(s) { return s.zone === zid; }), _invRoom.look || {}, def.kind);
    var ids = scene.zones.filter(function(x) { return x.inPlan && x.drawn; }).map(function(x) { return x.id; });
    var i = ids.indexOf(zid), prev = ids[(i - 1 + ids.length) % ids.length], next = ids[(i + 1) % ids.length];
    host.innerHTML =
        '<button type="button" class="rm-focus-back" onclick="invRoomUnfocus()">← Vista anterior</button>' +
        '<div class="rm-focus-title"><b>' + zid + ' · ' + _invRoomEsc(z ? z.label : '') + '</b><span>' + (z ? z.used + '/' + z.total : '') + (sub ? ' · ' + _invRoomEsc(sub) : '') + '</span></div>' +
        '<button type="button" class="rm-focus-step" onclick="invRoomFocusStep(-1)" aria-label="Zona anterior: ' + prev + '">‹ ' + prev + '</button>' +
        '<button type="button" class="rm-focus-step" onclick="invRoomFocusStep(1)" aria-label="Zona siguiente: ' + next + '">' + next + ' ›</button>';
    var fresh = host.hidden;
    host.hidden = false;
    if (fresh) void host.offsetWidth;   // que el fundido arranque
    host.classList.add('is-in');
}

// ══════════════════════════════════════════════════════════════════════
// [3.11.0] El cuarto de gasolina (DOM). Escritores: invAddFuelReading (lectura),
// invFuelMove (mover), invFuelSetStatus, invFuelSetType, invFuelTankCreate y el catálogo
// invFuelTypeSave / invFuelTypeDelete — todos en inventory.js. Aquí solo se pinta.
// ══════════════════════════════════════════════════════════════════════

/** Estado resuelto de cada tambo, de las definiciones únicas (invFuelTankLevel, invFuelTypeTotals). */
function _invFuelRoomInfo(scene) {
    var info = {}, today = typeof localToday === 'function' ? localToday() : '';
    var kindOf = {};
    scene.slots.forEach(function(s) { if (s.gasId) kindOf[s.gasId] = s.kind; });
    var types = invFuelTypesLive();
    var buy = {};
    invFuelTypeTotals(invState.fuelTypes, invState.fuelTanks).forEach(function(r) { buy[r.id || 'none'] = r.needsPurchase; });
    (invState.fuelTanks || []).forEach(function(t) {
        if (!t || !t.id) return;
        var lv = invFuelTankLevel(t), ty = invFuelTypeOf(t, types);
        var empty = t.fuelStatus === 'Vacío';
        var tone = invRoomLevelTone({ status: empty ? 'Empty' : '', pct: lv.pct, levelStatus: lv.status });
        var readToday = !empty && (t.readings || []).some(function(r) { return r && r.date === today && !r.auto; });
        info[t.id] = {
            tone: tone, pct: empty ? 0 : (lv.pct || 0), short: ty ? ty.name : 'Sin tipo', typeId: ty ? ty.id : null, typeColor: ty ? ty.color : '#94a3b8',
            liters: empty ? 0 : lv.liters, capacity: lv.capacity, expired: false, reorder: !empty && !!buy[ty ? ty.id : 'none'],
            counts: !empty, readToday: readToday, kind: kindOf[t.id] || null, pin: tone === 'low' ? 'alerta' : '', tag: null,
            name: t.name || '', ctrl: '', sub: lv.liters != null && !empty ? Math.round(lv.liters) + ' L' : '',
            aria: (t.pos || 'sin posición') + ': ' + (ty ? ty.name : 'sin tipo') + ', ' + (INV_ROOM_TONES[tone] || {}).label +
                  (lv.liters != null && !empty ? ' ' + Math.round(lv.liters) + ' de ' + (lv.capacity || '?') + ' L' : '') + (readToday ? ', leído hoy' : '')
        };
    });
    return info;
}

/** Indicadores del cuarto de gasolina. PURA. */
function invFuelRoomKpis(scene, info) {
    var k = { drums: 0, positions: 0, critical: 0, low: 0, readToday: 0, toRead: 0, unplaced: (scene.unplaced || []).length };
    scene.slots.forEach(function(s) { k.positions++; if (s.gasId) k.drums++; });
    Object.keys(info || {}).forEach(function(id) {
        var i = info[id];
        if (i.tone === 'low') k.critical++;
        if (i.tone === 'mid') k.low++;
        if (i.counts) { k.toRead++; if (i.readToday) k.readToday++; }
    });
    return k;
}

function _invFuelFmtL(n) { return n == null ? '—' : (Math.round(n) + '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' L'; }

function _invFuelPaintKpis(scene, info) {
    var host = document.getElementById('rm-kpis');
    if (!host) return;
    var k = invFuelRoomKpis(scene, info), f = _invRoom.filter;
    var tot = invFuelTypeTotals(invState.fuelTypes, invState.fuelTanks);
    var tile = function(id, ico, value, label, tone, title, cls) {
        var on = f === id;
        return '<button type="button" class="rm-kpi rm-kpi--' + tone + (cls ? ' ' + cls : '') + (on ? ' rm-kpi--on' : '') + '" aria-pressed="' + on + '" onclick="invRoomFilter(\'' + id + '\')" title="' + _invRoomEsc(title) + (on ? ' — toca para quitar el resaltado' : ' — toca para resaltarlos') + '">' +
            '<span class="rm-kpi-ico" aria-hidden="true">' + ico + '</span><b class="rm-kpi-v">' + value + '</b><span class="rm-kpi-l">' + _invRoomEsc(label) + '</span>' + (on ? '<span class="rm-kpi-x" aria-hidden="true">✕</span>' : '') + '</button>';
    };
    // Un recuadro por tipo de gasolina: lo que hay entre TODOS sus tambos (el total del tipo).
    var types = tot.map(function(r) {
        var tone = r.needsPurchase ? 'warn' : r.low ? 'warn' : 'info';
        return tile('type:' + (r.id || 'none'), '<i class="rm-kpi-dot" style="background:' + r.color + '"></i>', _invFuelFmtL(r.liters), r.name, tone,
            r.name + ': ' + (r.fromLegacy ? 'total anterior (todavía sin tambos registrados)' : r.drums + ' tambo(s)') + ' · ' + _invFuelFmtL(r.liters) + ' de ' + _invFuelFmtL(r.capacity) + (r.pct != null ? ' (' + r.pct + '%)' : '') +
            (r.needsPurchase ? ' · por debajo del nivel de pedido (' + r.reorderLevel + ' L)' : ''), 'rm-kpi--type');
    }).join('');
    host.innerHTML =
        '<span class="rm-kpi rm-kpi--info rm-kpi--static" title="Tambos en el cuarto / posiciones"><span class="rm-kpi-ico" aria-hidden="true">🛢️</span><b class="rm-kpi-v">' + k.drums + '/' + k.positions + '</b><span class="rm-kpi-l">Tambos</span></span>' +
        types +
        tile('critico', '🔴', k.critical + k.low, 'Bajos', k.critical ? 'bad' : k.low ? 'warn' : 'ok', k.critical + ' crítico(s) · ' + k.low + ' bajo(s)') +
        tile('sinleer', '📏', k.readToday + '/' + k.toRead, 'Leídos hoy', k.readToday >= k.toRead ? 'ok' : 'info', 'Tambos leídos hoy / por leer');
}

function _invFuelTypeSelectHTML(id, cur, onchange) {
    var types = invFuelTypesLive();
    return '<select id="' + id + '" data-chips' + (onchange ? ' onchange="' + onchange + '"' : '') + '>' +
        (cur ? '' : '<option value="" selected>— Sin tipo —</option>') +
        types.map(function(t) { return '<option value="' + _invRoomEsc(t.id) + '"' + (cur === t.id ? ' selected' : '') + '>' + _invRoomEsc(t.name) + '</option>'; }).join('') + '</select>';
}

function _invFuelDrumPanelHTML(id) {
    var t = _invRoomGas(id);
    if (!t) return '';
    var e = _invRoomEsc;
    var scene = _invRoom.scene || _invRoomSceneNow();
    var slot = scene.slots.find(function(s) { return s.gasId === id; });
    var zdef = slot ? (INV_FUEL_ROOM_LAYOUT.zones[slot.zone] || {}) : {};
    var i = (_invRoom.info || {})[id] || {};
    var tone = INV_ROOM_TONES[i.tone] || INV_ROOM_TONES.none;
    var lv = invFuelTankLevel(t), ty = invFuelTypeOf(t);
    var today = typeof localToday === 'function' ? localToday() : '';
    var todayR = (t.readings || []).find(function(r) { return r && r.date === today && !r.auto; });
    var last = (t.readings || []).filter(function(r) { return r && !r.auto; }).slice(-1)[0];
    var empty = t.fuelStatus === 'Vacío';
    var h = '<div class="rm-panel rm-pop" role="region" aria-label="Tambo ' + e(t.name || '') + '">';
    h += '<div class="rm-panel-head"><div><div class="rm-panel-kicker">' + (slot ? e(slot.code) + ' · ' + e(zdef.label || '') : 'Sin lugar en el plano') + '</div>' +
         '<div class="rm-panel-title">' + e(t.name || 'Tambo') + '</div></div>' +
         '<button type="button" class="rm-x" onclick="invRoomClose()" aria-label="Cerrar">✕</button></div>';
    // Tipo (lo primero: es lo que dice qué gasolina es)
    h += '<div class="rm-status"><label for="rm-ftype" class="rm-read-l"><i class="rm-kpi-dot" style="background:' + e(ty ? ty.color : '#94a3b8') + '"></i> Tipo de gasolina</label>' +
         _invFuelTypeSelectHTML('rm-ftype', ty ? ty.id : '', 'invRoomSetFuelType(\'' + e(id) + '\', this.value)') + '</div>';
    // Nivel
    var val = empty ? 'Vacío' : lv.liters == null ? 'Sin lecturas' : _invFuelFmtL(lv.liters);
    h += '<div class="rm-gauge"><div class="rm-gauge-bar"><span style="width:' + Math.max(0, Math.min(100, i.pct || 0)) + '%;background:' + tone.fill + '"></span></div>' +
         '<div class="rm-gauge-t"><b style="color:' + tone.dark + '">' + val + '</b>' + (lv.capacity ? ' de ' + _invFuelFmtL(lv.capacity) : '') +
         (lv.pct != null && !empty ? ' · ' + lv.pct + '%' : '') + ' · ' + tone.label + '</div></div>';
    // Lectura de hoy, ahí mismo; con atajos de fracción (en un tambo se estima a ojo o con la varilla).
    if (!empty) {
        var cap = lv.capacity || 0;
        var frac = cap ? [[1, 'Lleno'], [0.75, '¾'], [0.5, '½'], [0.25, '¼'], [0, 'Vacío']].map(function(f) {
            var v = Math.round(cap * f[0]);
            return '<button type="button" class="rm-same" onclick="var x=document.getElementById(\'rm-psi\');x.value=\'' + v + '\';x.focus()" title="' + v + ' L">' + f[1] + '</button>';
        }).join('') : '';
        h += '<form class="rm-read" onsubmit="return invRoomSaveReading(event)">' +
             '<label for="rm-psi" class="rm-read-l">' + (todayR ? '✓ Leído hoy: <b>' + todayR.level + ' L</b> — corregir' : 'Nivel de hoy (litros)') + '</label>' +
             '<div class="rm-read-row"><input id="rm-psi" type="number" inputmode="decimal" min="0" step="any" placeholder="Ej.: 150" value="' + (todayR ? todayR.level : '') + '">' +
             (last && !todayR ? '<button type="button" class="rm-same" onclick="document.getElementById(\'rm-psi\').value=\'' + last.level + '\';document.getElementById(\'rm-psi\').focus()" title="Repetir la última lectura (' + e(last.date) + ')">= ' + last.level + '</button>' : '') +
             '<button type="submit" class="btn btn-primary rm-read-btn">Guardar</button></div>' +
             (frac ? '<div class="rm-fracs" role="group" aria-label="Atajos de nivel">' + frac + '</div>' : '') + '</form>';
    }
    // Estatus
    h += '<div class="rm-status"><label for="rm-status" class="rm-read-l">Estatus</label><select id="rm-status" data-chips onchange="invRoomSetStatus(\'' + e(id) + '\', this.value)">' +
         INV_FUEL_STATUSES.map(function(st) { return '<option value="' + st + '"' + (t.fuelStatus === st ? ' selected' : '') + '>' + st + '</option>'; }).join('') + '</select></div>';
    if (t.fuelStatus === 'Cerrado' && lv.pct != null && lv.pct < 97) h += '<p class="rm-hint">Dice <b>Cerrado</b> pero ya no está lleno. ¿Ya se abrió?</p>';
    if (lv.liters === 0 && !empty) h += '<p class="rm-hint">Ya no tiene gasolina: márcalo <b>Vacío</b> para que no cuente como disponible.</p>';
    // El total de su tipo: lo que hay entre todos los tambos de esa gasolina.
    if (ty) {
        var tr = invFuelTypeTotals(invState.fuelTypes, invState.fuelTanks).find(function(r) { return r.id === ty.id; });
        if (tr) h += '<p class="rm-typetotal"><i class="rm-kpi-dot" style="background:' + e(ty.color) + '"></i> <b>' + e(ty.name) + '</b> en total: ' + tr.drums + (tr.drums === 1 ? ' tambo' : ' tambos') + ' · <b>' + _invFuelFmtL(tr.liters) + '</b> de ' + _invFuelFmtL(tr.capacity) +
            (tr.needsPurchase ? ' · <span class="rm-tag rm-tag--warn">Pedir</span>' : '') + '</p>';
    } else {
        h += '<p class="rm-hint">Sin tipo: no suma a ningún total. Elige su tipo arriba.</p>';
    }
    h += '<div class="rm-actions">' +
         '<button type="button" class="rm-act" onclick="invRoomMoveStart(\'' + e(id) + '\')">↔ Mover</button>' +
         '<button type="button" class="rm-act" onclick="invAddFuelTank(\'' + e(id) + '\')">✏️ Editar</button></div>';
    var facts = [['Capacidad', lv.capacity ? _invFuelFmtL(lv.capacity) : '—'], ['Regulación', t.regulation || '—'], ['Octanaje', t.octane || '—'],
                 ['Proveedor', t.supplier || '—'], ['Recepción', t.regDate || '—']];
    var hist = (t.readings || []).slice(-5).reverse();
    h += '<details class="rm-more"><summary>Más: datos, ciclo y lecturas</summary>' +
         '<dl class="rm-facts">' + facts.map(function(f) { return '<div><dt>' + e(f[0]) + '</dt><dd>' + e(f[1]) + '</dd></div>'; }).join('') + '</dl>' +
         _invRoomStepperHTML(invFuelRoomLifecycle(t, lv), INV_FUEL_ROOM_STEPS, 'Ciclo del tambo') +
         (hist.length ? '<ul class="rm-histl">' + hist.map(function(r) { return '<li><span>' + e(r.date) + '</span> ' + e(r.level + ' L' + (r.auto ? ' · descuento por prueba' : '')) + '</li>'; }).join('') + '</ul>' : '') +
         '</details>';
    return h + '</div>';
}

function _invFuelSlotPanelHTML(code) {
    var scene = _invRoom.scene || _invRoomSceneNow();
    var slot = scene.slots.find(function(s) { return s.code === code; });
    if (!slot) return '';
    var def = INV_FUEL_ROOM_LAYOUT.zones[slot.zone] || {}, e = _invRoomEsc;
    var h = '<div class="rm-panel rm-pop" role="region" aria-label="Posición ' + code + '">' +
        '<div class="rm-panel-head"><div><div class="rm-panel-kicker">' + e(def.label || ('Zona ' + slot.zone)) + '</div>' +
        '<div class="rm-panel-title">Posición ' + e(code) + ' · libre</div></div>' +
        '<button type="button" class="rm-x" onclick="invRoomClose()" aria-label="Cerrar">✕</button></div>';
    var un = scene.unplaced.map(function(u) { return _invRoomGas(u.gasId); }).filter(Boolean);
    if (un.length) {
        h += '<div class="rm-read-l">Acomodar aquí un tambo sin lugar</div><div class="rm-cands">' + un.slice(0, 12).map(function(t) {
            var ty = invFuelTypeOf(t), lv = invFuelTankLevel(t);
            return '<button type="button" class="rm-cand" onclick="invRoomMoveTo(\'' + e(t.id) + '\', \'' + code + '\')"><b><i class="rm-kpi-dot" style="background:' + e(ty ? ty.color : '#94a3b8') + '"></i> ' + e(t.name || 'Tambo') + '</b><span>' + e((ty ? ty.name : 'sin tipo') + ' · ' + _invFuelFmtL(lv.liters)) + '</span></button>';
        }).join('') + '</div>';
    }
    // Tambo nuevo en esta posición (el formulario corto; el completo sigue en ✏️ Editar).
    var types = invFuelTypesLive();
    if (!types.length) {
        h += '<p class="rm-hint">Para dar de alta un tambo, primero define los tipos de gasolina del laboratorio.</p>' +
             '<div class="rm-actions"><button type="button" class="rm-act" onclick="invRoomFuelTypesOpen()">⛽ Tipos de gasolina</button></div>';
        return h + '</div>';
    }
    h += '<form class="rm-newdrum" onsubmit="return invRoomNewDrum(event, \'' + code + '\')"><div class="rm-read-l">➕ Tambo nuevo aquí</div>' +
         '<div class="rm-status"><label for="rm-new-type" class="rm-read-l">Tipo de gasolina</label>' + _invFuelTypeSelectHTML('rm-new-type', '', '') + '</div>' +
         '<div class="rm-newdrum-row">' +
           '<label>Capacidad (L)<input id="rm-new-cap" type="number" inputmode="decimal" min="1" step="any" value="' + (def.defaultCap || '') + '" placeholder="Ej.: 225"></label>' +
           '<label>Tiene (L)<input id="rm-new-lvl" type="number" inputmode="decimal" min="0" step="any" placeholder="Lleno"></label>' +
         '</div><button type="submit" class="btn btn-primary rm-read-btn">Dar de alta</button></form>';
    return h + '</div>';
}

function _invFuelPaintList(scene, info) {
    var host = document.getElementById('rm-list');
    if (!host) return;
    var rows = [], e = _invRoomEsc;
    scene.slots.forEach(function(s) {
        if (!s.gasId) return;
        var i = info[s.gasId], t = _invRoomGas(s.gasId);
        if (!i || !t) return;
        var why = [];
        if (i.tone === 'low') why.push('<span class="rm-tag rm-tag--bad">Crítico ' + i.pct + '%</span>');
        else if (i.tone === 'mid') why.push('<span class="rm-tag rm-tag--warn">Bajo ' + i.pct + '%</span>');
        if (!i.typeId) why.push('<span class="rm-tag rm-tag--info">Sin tipo</span>');
        if (!why.length) return;
        rows.push({ rank: i.tone === 'low' ? 0 : 1, html: '<button type="button" class="rm-row" onclick="invRoomToggleList(false);invRoomSelect(\'' + e(s.gasId) + '\')"><span class="rm-row-code">' + s.code + '</span><span class="rm-row-name">' + e(t.name || '') + ' <span class="rm-row-meta">' + e(i.short) + '</span></span><span class="rm-row-tags">' + why.join('') + '</span></button>' });
    });
    invFuelTypeTotals(invState.fuelTypes, invState.fuelTanks).forEach(function(r) {
        if (!r.needsPurchase) return;
        rows.push({ rank: 0, html: '<div class="rm-row"><span class="rm-row-code"><i class="rm-kpi-dot" style="background:' + e(r.color) + '"></i></span><span class="rm-row-name">' + e(r.name) + ' <span class="rm-row-meta">' + _invFuelFmtL(r.liters) + ' en ' + r.drums + ' tambo(s)</span></span><span class="rm-row-tags"><span class="rm-tag rm-tag--warn">Pedir · nivel de pedido ' + r.reorderLevel + ' L</span></span></div>' });
    });
    rows.sort(function(a, b) { return a.rank - b.rank; });
    var un = scene.unplaced.map(function(u) {
        var t = _invRoomGas(u.gasId);
        if (!t) return '';
        var reasons = { 'sin-zona': 'Sin posición', 'zona-desconocida': 'Posición que no existe', 'fuera-del-plano': 'Posición fuera del plano', 'repetida': 'Posición repetida' };
        return '<div class="rm-row rm-row--un"><span class="rm-row-code">' + e(u.zone || '—') + '</span><span class="rm-row-name">' + e(t.name || '') + '</span>' +
            '<span class="rm-row-tags"><span class="rm-tag rm-tag--info">' + reasons[u.reason] + '</span><button type="button" class="tp-btn tp-btn-ghost" onclick="invRoomToggleList(false);invRoomMoveStart(\'' + e(u.gasId) + '\')">↔ Acomodar</button></span></div>';
    }).join('');
    var fb = document.getElementById('rm-foot-btns');
    if (fb) fb.innerHTML = '<button type="button" id="rm-btn-list" class="rm-foot-btn' + (rows.length ? ' rm-foot-btn--warn' : '') + '" aria-expanded="' + !!_invRoom.listOpen + '" onclick="invRoomToggleList()">⚠ Atención <b>' + rows.length + '</b></button>' +
        (scene.unplaced.length ? '<button type="button" class="rm-foot-btn rm-foot-btn--info" onclick="invRoomToggleList(true)" title="Tambos sin posición en el cuarto">No se ven en el plano <b>' + scene.unplaced.length + '</b></button>' : '');
    host.hidden = !_invRoom.listOpen;
    host.innerHTML = '<div class="rm-listpop-head"><b>Atención y pendientes</b><button type="button" class="rm-x" onclick="invRoomToggleList(false)" aria-label="Cerrar">✕</button></div>' +
        '<div class="rm-list-col"><h4>Atención <span class="rm-count">' + rows.length + '</span></h4>' +
          (rows.length ? rows.map(function(r) { return r.html; }).join('') : '<p class="rm-empty">Ningún tambo bajo ni gasolina por pedir.</p>') + '</div>' +
        (un ? '<div class="rm-list-col"><h4>No se ven en el plano <span class="rm-count">' + scene.unplaced.length + '</span></h4>' + un +
            '<p class="rm-empty">Toca una posición libre y elige el tambo para acomodarlo.</p></div>' : '') +
        _invFuelLegacyNoteHTML();
}

/** [3.11.0] Los totales anteriores se DECLARAN: no son tambos, pero siguen dando el total de su tipo. */
function _invFuelLegacyNoteHTML() {
    var tot = invFuelTypeTotals(invState.fuelTypes, invState.fuelTanks).filter(function(r) { return r.legacy; });
    if (!tot.length) return '';
    return '<div class="rm-list-col"><h4>Totales anteriores <span class="rm-count">' + tot.reduce(function(s, r) { return s + r.legacy; }, 0) + '</span></h4>' +
        tot.map(function(r) {
            return '<p class="rm-empty"><b>' + _invRoomEsc(r.name) + '</b>: ' + (r.fromLegacy
                ? 'todavía sin tambos — su total (' + _invFuelFmtL(r.liters) + ') sale del registro anterior hasta que des de alta sus tambos.'
                : 'ya tiene tambos; el registro anterior ya no cuenta (queda como historia de consumo).') + '</p>';
        }).join('') + '</div>';
}

function invRoomSetFuelType(id, typeId) {
    var r = invFuelSetType(id, typeId || null, { via: 'cuarto' });
    if (r && !r.ok && r.reason && typeof showToast === 'function') showToast(r.reason, 'warning');
    invRoomPaint();
}

function invRoomNewDrum(ev, code) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var tSel = document.getElementById('rm-new-type'), cap = document.getElementById('rm-new-cap'), lvl = document.getElementById('rm-new-lvl');
    var r = invFuelTankCreate({ typeId: tSel ? tSel.value : '', capacity: cap ? cap.value : '', level: lvl ? lvl.value : '', pos: code });
    if (!r.ok) {
        var f = r.field === 'type' ? tSel : r.field === 'capacity' ? cap : r.field === 'level' ? lvl : null;
        if (f && typeof uiInvalid === 'function') uiInvalid(f, r.reason); else if (typeof showToast === 'function') showToast(r.reason, 'warning');
        return false;
    }
    if (typeof showToast === 'function') showToast(r.tank.name + ' en ' + code, 'success');
    _invRoom.selSlot = null; _invRoom.sel = r.tank.id;
    invRoomPaint();
    return false;
}

/** El primer lugar libre (para "＋ Tambo" de la barra): abre su ventana con el alta. */
function invRoomFuelAddDrum() {
    var scene = _invRoom.scene || _invRoomSceneNow();
    var free = scene.slots.find(function(s) { return !s.gasId; });
    if (!free) { if (typeof showToast === 'function') showToast('No hay posiciones libres en el cuarto', 'warning'); return; }
    _invRoom.sel = null; _invRoom.selSlot = free.code;
    invRoomPaint();
}

// ── Catálogo de tipos de gasolina (el laboratorio decide cuántos hay) ──
function _invFuelTypesBodyHTML() {
    var e = _invRoomEsc;
    var tot = {};
    invFuelTypeTotals(invState.fuelTypes, invState.fuelTanks).forEach(function(r) { tot[r.id || 'none'] = r; });
    var row = function(t) {
        var id = t ? t.id : 'new', r = t ? tot[t.id] : null;
        return '<form class="rm-ftrow" onsubmit="return invRoomFuelTypeSave(event, \'' + e(id) + '\')">' +
            '<input type="color" id="rm-ft-color-' + e(id) + '" value="' + e(t ? t.color : INV_FUEL_TYPE_COLORS[invFuelTypesLive().length % INV_FUEL_TYPE_COLORS.length]) + '" aria-label="Color">' +
            '<label class="rm-ftrow-name">Nombre<input id="rm-ft-name-' + e(id) + '" value="' + e(t ? t.name : '') + '" placeholder="Ej.: EURO VI"></label>' +
            '<label>Regulación (descuento por prueba)' + (typeof _invRegulationSelectHTML === 'function' ? _invRegulationSelectHTML('rm-ft-reg-' + id, t ? t.regulation || '' : '') : '<input id="rm-ft-reg-' + e(id) + '" value="' + e(t ? t.regulation || '' : '') + '">') + '</label>' +
            '<label>Pedir con (L)<input id="rm-ft-reo-' + e(id) + '" type="number" inputmode="decimal" min="0" value="' + e(t && t.reorderLevel ? t.reorderLevel : '') + '" placeholder="Ej.: 300"></label>' +
            '<div class="rm-ftrow-act"><button type="submit" class="tp-btn tp-btn-primary">' + (t ? 'Guardar' : '＋ Agregar') + '</button>' +
            (t ? '<button type="button" class="u-danger-link" onclick="invRoomFuelTypeDelete(\'' + e(id) + '\')">Quitar</button>' : '') + '</div>' +
            (r ? '<div class="rm-ftrow-sum">' + r.drums + (r.drums === 1 ? ' tambo' : ' tambos') + ' · ' + _invFuelFmtL(r.liters) + ' de ' + _invFuelFmtL(r.capacity) + '</div>' : '') +
            '</form>';
    };
    var none = tot.none;
    return '<p class="rm-hint">Cuántos tipos hay y cómo se llaman lo decide el laboratorio. La <b>regulación</b> es de qué tipo descuenta una prueba (con varios tambos, del <b>Abierto</b>).</p>' +
        '<div id="rm-ftypes">' + invFuelTypesLive().map(row).join('') + row(null) + '</div>' +
        (none ? '<p class="rm-hint">' + none.drums + ' tambo(s) sin tipo: no suman a ningún total.</p>' : '');
}

function invRoomFuelTypesOpen() {
    if (typeof showModal !== 'function') return;
    showModal({ title: '⛽ Tipos de gasolina', body: '<div id="rm-ftypes-body">' + _invFuelTypesBodyHTML() + '</div>', buttons: [{ label: 'Listo', cls: 'btn-primary' }] });
}

function _invFuelTypesRepaint() {
    var b = document.getElementById('rm-ftypes-body');
    if (b) b.innerHTML = _invFuelTypesBodyHTML();
    invRoomPaint();
}

function invRoomFuelTypeSave(ev, id) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var g = function(k) { return document.getElementById('rm-ft-' + k + '-' + id); };
    var r = invFuelTypeSave({ id: id === 'new' ? null : id, name: g('name') ? g('name').value : '', color: g('color') ? g('color').value : '',
                              regulation: g('reg') ? g('reg').value : '', reorderLevel: g('reo') ? g('reo').value : '' });
    if (!r.ok) {
        if (r.field === 'name' && g('name') && typeof uiInvalid === 'function') uiInvalid(g('name'), r.reason);
        else if (typeof showToast === 'function') showToast(r.reason, 'warning');
        return false;
    }
    if (typeof showToast === 'function') showToast('Tipo guardado: ' + r.type.name, 'success');
    _invFuelTypesRepaint();
    return false;
}

function invRoomFuelTypeDelete(id) {
    var r = invFuelTypeDelete(id);
    if (!r.ok) { if (typeof showToast === 'function') showToast(r.reason, 'warning'); return; }
    _invFuelTypesRepaint();
}

// ── Ayuda ────────────────────────────────────────────────────────────
if (typeof CASCADE_TOOLTIPS !== 'undefined') {
    Object.assign(CASCADE_TOOLTIPS, {
        'inv-room-help': { title: 'Mapas: gases, gasolina y laboratorio', text: 'Cada cuarto visto desde arriba o en 3D, con cada cilindro o tambo en su posición real: su relleno es el nivel y su color el estado. Toca uno para ver su estado y tomar la lectura. En el de gasolina la tapa de cada tambo es el color de su tipo, y arriba sale el total de cada tipo entre todos sus tambos. 🚗 Laboratorio es la celda de pruebas y el cuarto de acondicionamiento: dónde está cada unidad y cada equipo.' }
    });
}
