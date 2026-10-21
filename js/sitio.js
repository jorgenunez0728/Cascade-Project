// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.14.0 — El laboratorio en el mapa: celda de pruebas + cuarto de     ║
// ║  acondicionamiento (`site*`)                                          ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// La misma experiencia del cuarto de gases (cuarto.js): escena isométrica propia, tocar
// para ver estado, cámara que gira/inclina/acerca. Reusa de cuarto.js SOLO lo genérico y
// puro: invRoomProject, invRoomCamNormalize, invRoomWallIsBack, _invRoomPts, _invRoomEsc.
//
// Reglas:
// - El plano FIJO (muros, ventanales, dinamómetro, pared del túnel, cajones) está horneado en
//   `SITE_LAYOUT` (criterio v20.4: el cuarto no cambia entre equipos). Salió de las fotos del
//   laboratorio (20-oct-2026) y es PROVISIONAL hasta que el laboratorio lo valide.
// - Los EQUIPOS los acomoda el laboratorio en la app: `invState.siteItems` (viaja con
//   Consumibles). Nacen de `SITE_ITEMS_SEED` sin nombre propio; se mueven, renombran, ligan a
//   un equipo del F11 (`invState.assets`) o se quitan (baja lógica).
// - Las UNIDADES se distinguen SOLO por VIN (decisión del laboratorio): una con alta lleva
//   `vehicle.site`; una sin alta vive en `db.siteUnits`. "Con alta" = su VIN está registrado.
// - El soak se DERIVA (preacondicionamiento + tpSoakHoursFor), nunca se guarda.
// - Las funciones de geometría, modelo y escena son PURAS (tests/sitio.node.js).
// - [3.17.0] La FLOTA MASTER (los vehículos que se quedan con el laboratorio, no de producción)
//   es una lista aparte, `db.siteMasters`, con su lugar en el estacionamiento de afuera. No es
//   un campo de "dueño" en las unidades: una unidad sigue siendo solo su VIN; un Master es un
//   registro de la flota. Si su VIN está adentro (cajón o dinamómetro) su lugar se ve vacío y
//   dice dónde está; al salir del laboratorio regresa solo.

// ── El plano (unidades ≈ metros; y crece hacia el cuarto de control = sur) ─────
var SITE_LAYOUT = {
    id: 'lab', provisional: true,
    floor: [[0, 0], [26, 0], [26, 13], [15, 13], [15, 10], [12.5, 10], [12.5, 11.8], [2, 11.8], [2, 10], [0, 10]],
    // lbl = dónde va el letrero pintado en el piso (centro, en un lugar libre); fs = alto de la letra (m).
    areas: [
        { id: 'celda', label: 'Celda de pruebas', rect: [0, 0, 15, 10], tone: 'cell', lbl: [11.3, 8.3], fs: 0.42 },
        { id: 'control', label: 'Cuarto de control', rect: [2, 10, 12.5, 11.8], tone: 'control', lbl: [6.6, 11.42], fs: 0.3 },
        { id: 'acond', label: 'Cuarto de acondicionamiento', rect: [15, 0, 26, 13], tone: 'soak', lbl: [24.2, 6.3], fs: 0.3, lines: ['Cuarto de', 'acondicionamiento'] }
    ],
    // [x1, y1, x2, y2, nx, ny, tipo] — n = hacia AFUERA (decide fondo/frente, como cuarto.js).
    // tipo: '' muro · 'glass' ventanal alto · 'window' ventanas del cuarto de control.
    walls: [
        [0, 0, 15, 0, 0, -1, ''], [15, 0, 26, 0, 0, -1, ''],
        [26, 0, 26, 13, 1, 0, ''],
        [26, 13, 25.6, 13, 0, 1, ''], [22.4, 13, 15, 13, 0, 1, ''],
        [15, 13, 15, 10, -1, 0, ''],
        [15, 10, 12.5, 10, 0, 1, ''],
        [12.5, 10, 12.5, 11.8, 1, 0, ''], [12.5, 11.8, 2, 11.8, 0, 1, ''], [2, 11.8, 2, 10, -1, 0, ''],
        [2, 10, 0, 10, 0, 1, ''], [0, 10, 0, 0, -1, 0, ''],
        // Interiores: ventanas del control, ventanal celda ↔ acondicionamiento, pared del túnel.
        [2, 10, 11.4, 10, 0, 1, 'window'], [12.2, 10, 12.5, 10, 0, 1, 'window'],
        [15, 0, 15, 3.4, 1, 0, 'glass'], [15, 6.6, 15, 10, 1, 0, 'glass'],
        [2.8, 0.6, 2.8, 7.6, -1, 0, 'glass']
    ],
    doors: [
        { id: 'control', label: 'Puerta del control', a: [11.4, 10], b: [12.2, 10] },
        { id: 'ventanal', label: 'Ventanal (se abre)', a: [15, 3.4], b: [15, 6.6], glass: true },
        { id: 'cortina', label: 'Cortina · entrada de vehículos', a: [22.4, 13], b: [25.6, 13] }
    ],
    // Lo fijo que no es muro. kind: roll (rodillos), plate (placas), barrier, rail, tunnel, hose.
    // [3.17.1] barrier = las placas amarillas de SUJECIÓN LATERAL: van a los costados del coche
    // (lo fijan de lado), nunca en los extremos, que son por donde entra y sale del dinamómetro.
    fixed: [
        { id: 'rod-tras-i', kind: 'roll', rect: [6.0, 3.95, 6.6, 4.6] }, { id: 'rod-tras-d', kind: 'roll', rect: [6.0, 5.4, 6.6, 6.05] },
        { id: 'rod-del-i', kind: 'roll', rect: [8.7, 3.95, 9.3, 4.6] }, { id: 'rod-del-d', kind: 'roll', rect: [8.7, 5.4, 9.3, 6.05] },
        { id: 'placa', kind: 'plate', rect: [6.6, 4.25, 8.7, 5.75] },
        { id: 'sujecion-izq', kind: 'barrier', rect: [6.7, 3.46, 8.6, 3.66], h: 0.9 },
        { id: 'sujecion-der', kind: 'barrier', rect: [6.7, 6.34, 8.6, 6.54], h: 0.9 },
        { id: 'riel-1', kind: 'rail', line: [11.0, 4.55, 14.4, 4.55] }, { id: 'riel-2', kind: 'rail', line: [11.0, 5.45, 14.4, 5.45] },
        { id: 'tunel', kind: 'tunnel', rect: [2.55, 0.8, 3.05, 7.4], z0: 1.9, z1: 2.4, label: 'Túnel' },
        { id: 'escape', kind: 'hose', line: [5.35, 5.0, 2.8, 5.0] }
    ],
    // Lugares donde va una unidad: el dinamómetro y los 4 cajones (miran a la celda: nariz al oeste).
    spots: [
        { id: 'dino', label: 'Dinamómetro', rect: [5.2, 3.9, 10.2, 6.1], nose: 1, area: 'celda' },
        { id: 'c1', label: 'Cajón 1', rect: [17.2, 0.6, 22.4, 3.2], nose: -1, area: 'acond' },
        { id: 'c2', label: 'Cajón 2', rect: [17.2, 3.4, 22.4, 6.0], nose: -1, area: 'acond' },
        { id: 'c3', label: 'Cajón 3', rect: [17.2, 7.4, 22.4, 10.0], nose: -1, area: 'acond' },
        { id: 'c4', label: 'Cajón 4', rect: [17.2, 10.2, 22.4, 12.8], nose: -1, area: 'acond' }
    ]
};

// Los lugares de equipo que se ven en las fotos, sin nombre propio (el laboratorio los nombra
// y los liga al F11). id estable: dos equipos que siembran a la vez no duplican.
// [id, nombre, x0, y0, x1, y1, alto, color, frente (hacia dónde mira: n/e/s/w)]
var SITE_ITEMS_SEED = [
    ['si-filtro', 'Filtro de aire', 6.6, 0.25, 9.6, 1.7, 2.6, '#94a3b8', 's'],
    ['si-brazo', 'Brazo', 10.15, 1.0, 10.55, 1.4, 2.2, '#e2e8f0', 's'],
    ['si-tab-1', 'Tablero 1', 11.2, 0.25, 11.9, 0.95, 2.1, '#cbd5e1', 's'],
    ['si-tab-2', 'Tablero 2', 11.95, 0.25, 12.65, 0.95, 2.1, '#cbd5e1', 's'],
    ['si-tab-3', 'Tablero 3', 12.7, 0.25, 13.4, 0.95, 2.1, '#cbd5e1', 's'],
    ['si-tab-4', 'Tablero 4', 13.45, 0.25, 14.15, 0.95, 2.1, '#cbd5e1', 's'],
    ['si-tab-5', 'Tablero 5', 14.2, 0.25, 14.9, 0.95, 2.1, '#cbd5e1', 's'],
    ['si-vent', 'Ventilador', 11.5, 4.2, 12.8, 5.8, 1.6, '#64748b', 'w'],
    ['si-gab-a', 'Gabinete A', 0.35, 0.6, 2.3, 1.8, 2.0, '#f1f5f9', 'e'],
    ['si-gab-b', 'Gabinete B', 0.35, 1.9, 2.3, 3.1, 2.0, '#f1f5f9', 'e'],
    ['si-gab-c', 'Gabinete C', 0.35, 3.2, 2.3, 4.4, 2.0, '#f1f5f9', 'e'],
    ['si-gab-d', 'Gabinete D', 0.35, 4.5, 2.3, 5.7, 2.0, '#f1f5f9', 'e'],
    ['si-gab-e', 'Gabinete E', 0.35, 5.8, 2.3, 7.0, 2.0, '#f1f5f9', 'e'],
    ['si-rack-1', 'Rack 1', 3.3, 0.5, 4.2, 1.3, 1.9, '#f8fafc', 's'],
    ['si-rack-2', 'Rack 2', 3.3, 7.9, 4.2, 8.7, 1.9, '#f8fafc', 'n'],
    ['si-stringo', 'Stringo', 4.6, 8.3, 6.2, 9.4, 0.35, '#dc2626', 'e'],
    ['si-carrito', 'Carrito', 7.0, 8.5, 7.8, 9.1, 0.95, '#475569', 'n'],
    ['si-escritorio', 'Escritorio de control', 2.3, 10.2, 11.2, 10.8, 0.75, '#e2e8f0', 'n'],
    ['si-ebcm1', 'EBCM1', 18.6, 6.25, 19.6, 7.15, 1.4, '#64748b', 'w'],
    ['si-cargador', 'Cargador', 20.2, 6.3, 20.9, 7.1, 1.6, '#10b981', 'w'],
    ['si-inflador', 'Inflador', 22.6, 12.0, 23.3, 12.7, 1.0, '#f59e0b', 'n']
];

var SITE_CAM_DEFAULT = { az: 18, el: 46, zoom: 1, panX: 0, panY: 0 };
// En el teléfono, desde arriba y girado: el lado largo (celda → acondicionamiento) queda vertical.
var SITE_CAM_NARROW = { az: 90, el: 90, zoom: 1, panX: 0, panY: 0 };

// ── [3.17.0] El estacionamiento de los vehículos Master: afuera, al sur del cuarto de control ──
// P1 queda junto al cuarto de acondicionamiento y los siguientes hacia el oeste: cuando la flota
// crece, el estacionamiento crece hacia allá y el número de cada lugar nunca cambia.
var SITE_LOT = { east: 14.9, y0: 13.0, w: 2.7, d: 5.2, aisle: 2.4, min: 5 };
var SITE_STALL_RE = /^p(\d+)$/;

/** ¿Es un lugar del estacionamiento (P1, P2…)? PURA. */
function siteIsStall(id) { return SITE_STALL_RE.test(String(id || '')); }

/** Cuántos lugares dibujar: todos los que se usan, uno libre para agregar y nunca menos de SITE_LOT.min. PURA. */
function siteLotCount(masters) {
    var n = SITE_LOT.min, live = 0;
    (masters || []).forEach(function(m) {
        if (!m || m.deleted) return;
        live++;
        var k = SITE_STALL_RE.exec(String(m.spot || ''));
        if (k) n = Math.max(n, +k[1]);
    });
    return Math.max(n, live + 1);
}

/** Los lugares del estacionamiento (la nariz mira al pasillo, al sur). PURA. */
function siteLotStalls(n) {
    var L = SITE_LOT, out = [];
    for (var i = 0; i < n; i++) {
        var x1 = L.east - L.w * i;
        out.push({ id: 'p' + (i + 1), label: 'Estacionamiento P' + (i + 1), short: 'P' + (i + 1), rect: [x1 - L.w, L.y0, x1, L.y0 + L.d], heading: Math.PI / 2, area: 'lot' });
    }
    return out;
}

/**
 * El plano que se dibuja: el FIJO (SITE_LAYOUT) más el exterior — la base de la maqueta, el
 * estacionamiento con `n` lugares, jardineras y árboles. PURA.
 */
function siteLayout(n) {
    var L = SITE_LOT, stalls = siteLotStalls(Math.max(1, n || L.min));
    var west = stalls[stalls.length - 1].rect[0], yA = L.y0 + L.d, yB = yA + L.aisle;
    var x0 = Math.min(-1.8, west - 3.0);
    return Object.assign({}, SITE_LAYOUT, {
        spots: SITE_LAYOUT.spots.concat(stalls),
        lot: { stalls: stalls, rect: [west - 0.35, L.y0 - 0.15, L.east + 0.3, yB], aisle: [west - 0.35, yA, L.east + 0.3, yB],
               apron: [21.6, 13.0, 26.4, 15.3], curbY: L.y0 - 0.15 },
        // La base de la maqueta (en "L": abajo a la derecha no hay nada que mostrar).
        base: [[x0, -1.6], [27.6, -1.6], [27.6, 16.2], [L.east + 1.0, 16.2], [L.east + 1.0, yB + 0.7], [x0, yB + 0.7]],
        grass: [[2.15, 11.95, 12.35, 12.62], [x0 + 0.35, 11.2, west - 0.55, yB + 0.35], [16.0, 13.35, 21.0, 15.9]],
        trees: [{ x: west - 1.35, y: L.y0 + 1.3, r: 0.95, h: 1.7 }, { x: west - 1.15, y: L.y0 + 4.3, r: 0.8, h: 1.4 }, { x: 17.6, y: 14.6, r: 0.9, h: 1.6 }],
        bushes: [[3.4, 12.3], [5.7, 12.3], [8.0, 12.3], [10.3, 12.3], [19.6, 14.4]]
    });
}

/** Los límites de lo que se dibuja (la base si hay, si no el piso). PURA. */
function _siteBounds(layout) {
    var pts = layout.base || layout.floor, xs = pts.map(function(p) { return p[0]; }), ys = pts.map(function(p) { return p[1]; });
    return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
}
/** El eje de giro de la cámara: el centro de lo que se dibuja. PURA. */
function siteCenter(layout) { var b = _siteBounds(layout || SITE_LAYOUT); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
/** Hacia dónde está quien mira (vector unitario en el mundo; la proyección es ortográfica). PURA. */
function _siteViewVec(cam) {
    var az = (cam.az || 0) * Math.PI / 180, el = Math.max(10, Math.min(90, cam.el == null ? 42 : cam.el)) * Math.PI / 180;
    return [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)];
}

// ══════════════════════════════════════════════════════════════════════
// Datos — PURAS
// ══════════════════════════════════════════════════════════════════════

/** Los equipos de la siembra como registros de `invState.siteItems`. PURA. */
function siteItemsSeed(nowIso) {
    return SITE_ITEMS_SEED.map(function(r) {
        return { id: r[0], label: r[1], x0: r[2], y0: r[3], x1: r[4], y1: r[5], h: r[6], color: r[7], front: r[8] || 's',
                 shape: siteItemShape({ id: r[0] }), assetId: '', seeded: true, updatedAt: nowIso || '', deleted: false };
    });
}

/**
 * Une dos listas por `id` (equipos del plano, unidades sin alta). PURA y SIMÉTRICA: gana el
 * `updatedAt` más reciente; en empate gana la baja; si aún empatan, desempate por contenido
 * (dos equipos deben elegir lo mismo o se re-empujan para siempre).
 */
function siteListUnion(a, b) {
    var by = {};
    var str = typeof stableStringify === 'function' ? stableStringify : JSON.stringify;
    (a || []).concat(b || []).forEach(function(x) {
        if (!x || !x.id) return;
        var cur = by[x.id];
        if (!cur) { by[x.id] = x; return; }
        var tx = String(x.updatedAt || ''), tc = String(cur.updatedAt || '');
        if (tx !== tc) { if (tx > tc) by[x.id] = x; return; }
        if (!!x.deleted !== !!cur.deleted) { if (x.deleted) by[x.id] = x; return; }
        if (str(x) > str(cur)) by[x.id] = x;
    });
    return Object.keys(by).sort().map(function(k) { return by[k]; });
}

/** ¿`incoming` trae algo que `base` no tiene (o más nuevo)? PURA (la usa el sync). */
function siteListNewTo(base, incoming) {
    if (!incoming || !incoming.length) return false;
    var str = typeof stableStringify === 'function' ? stableStringify : JSON.stringify;
    return str(siteListUnion(base, incoming)) !== str(siteListUnion(base, []));
}

/** ¿Unidad en curso? (no liberada ni histórica). Misma regla que vehicleIsLive (app.js), sin depender de él. PURA. */
var SITE_PAST_STATUS = ['archived', 'historico'];
function _siteLive(v) { return !!v && SITE_PAST_STATUS.indexOf(v.status) < 0; }

/** Normaliza un VIN para comparar (mayúsculas, sin espacios). PURA. */
function siteVinKey(v) { return String(v == null ? '' : v).toUpperCase().replace(/[\s-]+/g, ''); }

/**
 * LA definición de quién está en cada lugar del sitio. PURA.
 * vehicles: db.vehicles (los que traen `site.spot`); units: db.siteUnits (vivas).
 * Devuelve {bySpot:{spotId:[entrada]}, entries, conflicts:[spotId], unknown:[entrada]}.
 * entrada = {kind:'veh'|'unit', id, vin, spot, since, vehicle?, unit?, altaId?}
 * Una unidad sin alta cuyo VIN SÍ tiene alta viva se marca `altaId` (se ofrece ligarla).
 */
function siteSpotsModel(vehicles, units, spotIds) {
    var ids = {};
    (spotIds || SITE_LAYOUT.spots.map(function(s) { return s.id; })).forEach(function(i) { ids[i] = true; });
    var out = { bySpot: {}, entries: [], conflicts: [], unknown: [] };
    var liveByVin = {};
    (vehicles || []).forEach(function(v) {
        if (!v || v.status === 'historico') return;
        if (_siteLive(v)) liveByVin[siteVinKey(v.vin)] = v.id;
    });
    var add = function(e) {
        out.entries.push(e);
        if (!ids[e.spot]) { out.unknown.push(e); return; }
        (out.bySpot[e.spot] = out.bySpot[e.spot] || []).push(e);
    };
    (vehicles || []).forEach(function(v) {
        if (!v || !v.site || !v.site.spot || v.status === 'historico') return;
        add({ kind: 'veh', id: v.id, vin: v.vin || '', spot: v.site.spot, since: v.site.since || '', vehicle: v });
    });
    (units || []).forEach(function(u) {
        if (!u || u.deleted || !u.spot) return;
        var e = { kind: 'unit', id: u.id, vin: u.vin || '', spot: u.spot, since: u.since || '', unit: u };
        var alta = liveByVin[siteVinKey(u.vin)];
        if (alta != null) e.altaId = alta;
        add(e);
    });
    Object.keys(out.bySpot).forEach(function(k) { if (out.bySpot[k].length > 1) out.conflicts.push(k); });
    out.conflicts.sort();
    return out;
}

/**
 * [3.17.0] LA definición de la flota Master en el estacionamiento. PURA.
 * masters: db.siteMasters; model: siteSpotsModel (para saber si su VIN está adentro);
 * stallIds: los lugares que tiene el estacionamiento.
 * Devuelve {byStall:{p1:[entrada]}, list, byVin:{VIN: master}, conflicts, unplaced, dupVins}
 * entrada = {master, stall, inLab: entrada de siteSpotsModel | null}.
 */
function siteParkingModel(masters, model, stallIds) {
    var ids = {};
    (stallIds || []).forEach(function(i) { ids[i] = true; });
    var inLab = {};
    Object.keys((model && model.bySpot) || {}).forEach(function(sp) {
        if (siteIsStall(sp)) return;
        model.bySpot[sp].forEach(function(e) { var k = siteVinKey(e.vin); if (k && !inLab[k]) inLab[k] = e; });
    });
    var out = { byStall: {}, list: [], byVin: {}, conflicts: [], unplaced: [], dupVins: [] };
    (masters || []).forEach(function(m) {
        if (!m || m.deleted || !m.id) return;
        var k = siteVinKey(m.vin);
        var e = { master: m, stall: m.spot || '', inLab: (k && inLab[k]) || null };
        out.list.push(e);
        // El mismo VIN dado de alta dos veces (p. ej. en dos equipos a la vez) se declara.
        if (k && out.byVin[k] && out.dupVins.indexOf(k) < 0) out.dupVins.push(k);
        if (k) out.byVin[k] = m;
        if (!ids[e.stall]) { out.unplaced.push(e); return; }
        (out.byStall[e.stall] = out.byStall[e.stall] || []).push(e);
    });
    Object.keys(out.byStall).forEach(function(k) { if (out.byStall[k].length > 1) out.conflicts.push(k); });
    out.conflicts.sort();
    return out;
}

/** El primer lugar libre del estacionamiento (P1, P2…), o el que sigue al último. PURA. */
function siteLotFreeStall(masters) {
    var used = {};
    (masters || []).forEach(function(m) { if (m && !m.deleted && m.spot) used[m.spot] = true; });
    for (var i = 1; i < 1000; i++) if (!used['p' + i]) return 'p' + i;
    return 'p1';
}

/** 'AAAA-MM-DDTHH:MM' (hora local del laboratorio) → ms, o null. */
function _siteLocalMs(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

/**
 * El reposo de una unidad, DERIVADO (no se guarda). PURA.
 * td = vehicle.testData; hours = tpSoakHoursFor(cfg).hours; nowMs = ahora.
 * Devuelve {state:'sin-precon'|'reposando'|'listo'|'probada', endsAt, leftH}.
 */
function siteSoakStatus(td, hours, nowMs) {
    td = td || {};
    if (td.testDatetime) return { state: 'probada', endsAt: null, leftH: null };
    var p = (td.preconditioning && td.preconditioning.datetime) || '';
    var start = _siteLocalMs(p);
    if (start == null) return { state: 'sin-precon', endsAt: null, leftH: null };
    var h = parseFloat(hours);
    if (!isFinite(h) || h <= 0) h = 12;
    var end = start + h * 3600000;
    var left = (end - nowMs) / 3600000;
    return left > 0 ? { state: 'reposando', endsAt: end, leftH: left } : { state: 'listo', endsAt: end, leftH: 0 };
}

/**
 * Estado de un equipo del plano a partir de lo que ya sabe Consumibles. PURA.
 * ctx = {calWorst:{assetId: código peor de invCalStatus}, mttoOverdue:{assetId: n}, assets:{id: nombre}}
 * Devuelve {tone:'bad'|'warn'|'ok'|'none', text}.
 */
function siteItemHealth(item, ctx) {
    ctx = ctx || {};
    if (!item || !item.assetId) return { tone: 'none', text: 'Sin ligar a un equipo del F11' };
    var name = (ctx.assets || {})[item.assetId];
    if (!name) return { tone: 'warn', text: 'Ligado a un equipo que ya no está en el F11 (' + item.assetId + ')' };
    var cal = (ctx.calWorst || {})[item.assetId] || '', mt = (ctx.mttoOverdue || {})[item.assetId] || 0;
    if (cal === 'vencido' || mt > 0) {
        var p = [];
        if (cal === 'vencido') p.push('calibración vencida');
        if (mt > 0) p.push(mt + ' mantenimiento' + (mt > 1 ? 's' : '') + ' vencido' + (mt > 1 ? 's' : ''));
        return { tone: 'bad', text: name + ': ' + p.join(' · ') };
    }
    if (cal === 'porvencer' || cal === 'encalibracion-late') return { tone: 'warn', text: name + ': ' + (cal === 'porvencer' ? 'calibración por vencer' : 'regreso de calibración atrasado') };
    if (cal === 'encalibracion') return { tone: 'warn', text: name + ': en calibración' };
    if (cal === 'sinregistro') return { tone: 'warn', text: name + ': instrumentos sin registro de calibración' };
    return { tone: 'ok', text: name + ': al día' };
}

/** El peor estado de calibración entre los instrumentos de cada equipo padre. PURA. */
function siteCalWorstByAsset(equipment, statusOf) {
    var rank = { vencido: 5, 'encalibracion-late': 4, porvencer: 3, sinregistro: 2, encalibracion: 1, vigente: 0, noaplica: -1 };
    var out = {};
    (equipment || []).forEach(function(eq) {
        if (!eq || !eq.assetId || !statusOf) return;
        var st = statusOf(eq) || {};
        var code = st.code === 'encalibracion' && st.late > 0 ? 'encalibracion-late' : st.code;
        if (rank[code] == null) return;
        if (out[eq.assetId] == null || rank[code] > rank[out[eq.assetId]]) out[eq.assetId] = code;
    });
    return out;
}

/** Indicadores de la franja de arriba. PURA. `parking` (opcional) = siteParkingModel. */
function siteKpis(model, look, items, health, parking) {
    var k = { onSite: 0, withAlta: 0, noAlta: 0, soaking: 0, nextLeftH: null, ready: 0, dino: 0, eqBad: 0, eqWarn: 0, eqNone: 0, masters: 0, mastersIn: 0 };
    ((parking && parking.list) || []).forEach(function(e) { k.masters++; if (e.inLab) k.mastersIn++; });
    var lost = model.unknown || [];
    (model.entries || []).forEach(function(e) {
        if (lost.indexOf(e) >= 0) return;   // un lugar que el plano no tiene se declara aparte
        k.onSite++;
        if (e.kind === 'veh') k.withAlta++; else k.noAlta++;
        if (e.spot === 'dino') k.dino++;
        var L = (look || {})[e.kind + ':' + e.id] || {};
        if (L.soak === 'reposando') { k.soaking++; if (k.nextLeftH == null || L.leftH < k.nextLeftH) k.nextLeftH = L.leftH; }
        if (L.soak === 'listo' && e.spot !== 'dino') k.ready++;
    });
    (items || []).forEach(function(it) {
        var h = (health || {})[it.id] || {};
        if (h.tone === 'bad') k.eqBad++; else if (h.tone === 'warn') k.eqWarn++; else if (h.tone === 'none') k.eqNone++;
    });
    return k;
}

/**
 * De un punto de la escena (px de proyección, sin el transform de la cámara) al piso (z = 0).
 * La inversa de invRoomProject. PURA.
 */
function siteUnproject(px, py, cam, center) {
    var az = (cam.az || 0) * Math.PI / 180, el = Math.max(10, Math.min(90, cam.el == null ? 42 : cam.el)) * Math.PI / 180;
    var S = INV_ROOM_S;
    var xr = px / S, yr = py / (S * Math.sin(el));
    var dx = xr * Math.cos(az) + yr * Math.sin(az);
    var dy = -xr * Math.sin(az) + yr * Math.cos(az);
    return [dx + center[0], dy + center[1]];
}

/** Lugar (dinamómetro, cajón o lugar del estacionamiento) que contiene un punto del piso, o null. PURA. */
function siteSpotAt(pt, layout) {
    var L = layout || SITE_LAYOUT;
    for (var i = 0; i < L.spots.length; i++) {
        var r = L.spots[i].rect;
        if (pt[0] >= r[0] && pt[0] <= r[2] && pt[1] >= r[1] && pt[1] <= r[3]) return L.spots[i].id;
    }
    return null;
}

// ══════════════════════════════════════════════════════════════════════
// Escena — PURA
// ══════════════════════════════════════════════════════════════════════

/** Caja (prisma) con sus caras ordenadas por profundidad: devuelve {d, s}.
 * `deco(i, F)` (opcional) agrega detalles sobre la cara i (0 norte, 1 este, 2 sur, 3 oeste; 'top'
 * = la tapa): F(u, v) da el punto de la cara con u a lo ancho y v a lo alto (0..1). */
function _siteBoxSVG(P, r, z0, z1, cls, attrs, inner, deco) {
    var c4 = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
    var top = c4.map(function(c) { return P(c[0], c[1], z1); });
    var faces = [];
    for (var i = 0; i < 4; i++) {
        var a = c4[i], b = c4[(i + 1) % 4];
        var q0 = P(a[0], a[1], z0), q1 = P(b[0], b[1], z0);
        var F = (function(a, b) { return function(u, v) { return P(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, z0 + (z1 - z0) * v); }; })(a, b);
        faces.push({ d: (q0.d + q1.d) / 2, s: '<polygon class="st-side st-side--' + i + '" points="' + _invRoomPts([q0, q1, top[(i + 1) % 4], top[i]]) + '"/>' + (deco ? deco(i, F) || '' : '') });
    }
    faces.sort(function(x, y) { return x.d - y.d; });
    var T = function(u, v) { return P(r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v, z1); };
    var dmax = Math.max.apply(null, top.map(function(q) { return q.d; }));
    return { d: (dmax + Math.min.apply(null, top.map(function(q) { return q.d; }))) / 2,
             s: '<g class="' + cls + '"' + (attrs || '') + '>' + faces.map(function(f) { return f.s; }).join('') +
                '<polygon class="st-top" points="' + _invRoomPts(top) + '"/>' + (deco ? deco('top', T) || '' : '') + (inner || '') + '</g>' };
}

/** Un cuadrilátero sobre una cara (coordenadas u, v de 0 a 1). */
function _siteQuad(F, u0, v0, u1, v1, cls) {
    return '<polygon class="' + cls + '" points="' + _invRoomPts([F(u0, v0), F(u1, v0), F(u1, v1), F(u0, v1)]) + '"/>';
}
/** Una elipse sobre una cara (centro u, v y radios en u, v). */
function _siteDisc(F, cu, cv, ru, rv, cls, n) {
    var pts = [];
    n = n || 18;
    for (var k = 0; k < n; k++) { var t = 2 * Math.PI * k / n; pts.push(F(cu + ru * Math.cos(t), cv + rv * Math.sin(t))); }
    return '<polygon class="' + cls + '" points="' + _invRoomPts(pts) + '"/>';
}
function _siteSeg(F, u0, v0, u1, v1, cls) {
    var a = F(u0, v0), b = F(u1, v1);
    return '<line class="' + cls + '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>';
}

// [3.14.0] Formas de equipo: cada una dibuja sus detalles sobre la cara del FRENTE
// (`front`: hacia dónde mira, n/e/s/o) y, a veces, sobre la tapa.
var SITE_SHAPES = {
    cabinet: 'Gabinete', panel: 'Tablero', filter: 'Equipo grande', fan: 'Ventilador', post: 'Poste / brazo',
    stringo: 'Plataforma', cart: 'Carrito', desk: 'Escritorio', charger: 'Cargador', box: 'Caja'
};
var SITE_FRONT_FACE = { n: 0, e: 1, s: 2, w: 3 };
var SITE_FRONT_NEXT = { n: 'e', e: 's', s: 'w', w: 'n' };

function _siteDeco(shape, i, F, front) {
    var fi = SITE_FRONT_FACE[front] == null ? 2 : SITE_FRONT_FACE[front];
    var h = '';
    if (i === 'top') {
        if (shape === 'desk') {   // monitores sobre el escritorio
            [0.18, 0.5, 0.82].forEach(function(u) { h += _siteQuad(F, u - 0.07, 0.3, u + 0.07, 0.55, 'st-d-screen'); });
        } else if (shape === 'filter' || shape === 'cabinet' || shape === 'panel') {
            h += _siteQuad(F, 0.08, 0.12, 0.92, 0.88, 'st-d-lid');
        } else if (shape === 'stringo') {
            h += _siteQuad(F, 0.05, 0.08, 0.95, 0.92, 'st-d-plate');
        }
        return h;
    }
    if (i !== fi) {
        // Las otras caras también llevan algo: el ventilador es redondo por los dos lados y los
        // gabinetes tienen rejillas de ventilación arriba (así se reconocen desde cualquier ángulo).
        if (shape === 'fan' && i === (fi + 2) % 4) {
            h += _siteDisc(F, 0.5, 0.56, 0.42, 0.4, 'st-d-fanring', 28) + _siteDisc(F, 0.5, 0.56, 0.3, 0.28, 'st-d-fanback', 28);
            [0.3, 0.42, 0.54, 0.66, 0.78].forEach(function(v) { h += _siteSeg(F, 0.2, v, 0.8, v, 'st-d-spoke'); });
        } else if (shape === 'cabinet' || shape === 'panel' || shape === 'charger' || shape === 'filter' || shape === 'box') {
            [0.78, 0.83, 0.88].forEach(function(v) { h += _siteSeg(F, 0.3, v, 0.7, v, 'st-d-vent'); });
        }
        return h;
    }
    if (shape === 'cabinet' || shape === 'panel') {
        h += _siteQuad(F, 0.07, 0.1, 0.48, 0.9, 'st-d-door') + _siteQuad(F, 0.52, 0.1, 0.93, 0.9, 'st-d-door');
        h += _siteSeg(F, 0.43, 0.45, 0.43, 0.6, 'st-d-handle') + _siteSeg(F, 0.57, 0.45, 0.57, 0.6, 'st-d-handle');
        if (shape === 'panel') {
            h += _siteQuad(F, 0.16, 0.62, 0.4, 0.82, 'st-d-screen') + _siteDisc(F, 0.7, 0.75, 0.035, 0.025, 'st-d-led');
            [0.2, 0.28, 0.36].forEach(function(v) { h += _siteSeg(F, 0.6, v, 0.86, v, 'st-d-vent'); });
        } else {
            h += _siteDisc(F, 0.86, 0.84, 0.03, 0.02, 'st-d-led');
            [0.16, 0.22, 0.28].forEach(function(v) { h += _siteSeg(F, 0.12, v, 0.42, v, 'st-d-vent'); });
        }
    } else if (shape === 'filter') {
        h += _siteQuad(F, 0.05, 0.12, 0.66, 0.9, 'st-d-grille');
        for (var k = 1; k < 9; k++) h += _siteSeg(F, 0.07, 0.12 + k * 0.087, 0.64, 0.12 + k * 0.087, 'st-d-slat');
        h += _siteQuad(F, 0.72, 0.45, 0.94, 0.86, 'st-d-console') + _siteQuad(F, 0.75, 0.62, 0.91, 0.82, 'st-d-screen');
        [0.76, 0.83, 0.9].forEach(function(u) { h += _siteDisc(F, u, 0.52, 0.018, 0.02, 'st-d-led'); });
    } else if (shape === 'fan') {
        h += _siteDisc(F, 0.5, 0.56, 0.42, 0.4, 'st-d-fanring', 28) + _siteDisc(F, 0.5, 0.56, 0.36, 0.34, 'st-d-fanhole', 28);
        for (var sp = 0; sp < 8; sp++) { var t = Math.PI * sp / 4; h += _siteSeg(F, 0.5, 0.56, 0.5 + 0.36 * Math.cos(t), 0.56 + 0.34 * Math.sin(t), 'st-d-spoke'); }
        h += _siteDisc(F, 0.5, 0.56, 0.06, 0.06, 'st-d-hub');
    } else if (shape === 'stringo') {
        for (var d = 0; d < 6; d++) h += _siteQuad(F, 0.1 + d * 0.14, 0.15, 0.17 + d * 0.14, 0.85, 'st-d-hazard');
    } else if (shape === 'cart') {
        h += _siteSeg(F, 0.05, 0.35, 0.95, 0.35, 'st-d-shelf') + _siteSeg(F, 0.05, 0.68, 0.95, 0.68, 'st-d-shelf');
        h += _siteDisc(F, 0.14, 0.05, 0.07, 0.06, 'st-d-wheel') + _siteDisc(F, 0.86, 0.05, 0.07, 0.06, 'st-d-wheel');
    } else if (shape === 'desk') {
        [0.1, 0.4, 0.7].forEach(function(u) { h += _siteQuad(F, u, 0.15, u + 0.2, 0.85, 'st-d-drawer'); h += _siteSeg(F, u + 0.07, 0.62, u + 0.13, 0.62, 'st-d-handle'); });
    } else if (shape === 'charger') {
        h += _siteQuad(F, 0.18, 0.55, 0.82, 0.85, 'st-d-screen') + _siteDisc(F, 0.5, 0.35, 0.16, 0.08, 'st-d-plug');
        h += _siteSeg(F, 0.5, 0.27, 0.62, 0.04, 'st-d-cable');
    } else if (shape === 'box') {
        h += _siteQuad(F, 0.1, 0.12, 0.9, 0.88, 'st-d-door');
    }
    return h;
}

/** Hacia dónde mira un equipo (los sembrados antes de que existiera el frente toman el de la siembra). */
function siteItemFront(it) {
    if (it && SITE_FRONT_FACE[it.front] != null) return it.front;
    var row = it && SITE_ITEMS_SEED.find(function(r) { return r[0] === it.id; });
    return (row && row[8]) || 's';
}

/** La forma de un equipo (los anteriores a las formas se deducen de su id). */
function siteItemShape(it) {
    if (it && SITE_SHAPES[it.shape]) return it.shape;
    var id = String((it && it.id) || '');
    if (/tab-/.test(id)) return 'panel';
    if (/gab-|rack|ebcm/.test(id)) return 'cabinet';
    if (/filtro/.test(id)) return 'filter';
    if (/vent/.test(id)) return 'fan';
    if (/brazo/.test(id)) return 'post';
    if (/stringo/.test(id)) return 'stringo';
    if (/carrito/.test(id)) return 'cart';
    if (/escritorio/.test(id)) return 'desk';
    if (/cargador/.test(id)) return 'charger';
    return 'box';
}

// ══════════════════════════════════════════════════════════════════════
// [3.17.0] El auto, modelado en 3D: una malla de estaciones (no un perfil extruido)
// ══════════════════════════════════════════════════════════════════════
// Cada carrocería es una lista de ESTACIONES de la defensa trasera a la nariz:
// [u, zb, zs, zt, w, wt, tramo] — u = a lo largo (m; 0 = centro, + hacia la nariz); zb = bajo de
// la carrocería; zs = cintura (donde empieza el cristal); zt = lo más alto (techo, cofre, cajuela);
// w = media anchura; wt = media anchura arriba (el techo es más angosto que la carrocería).
// `tramo` dice qué es, hasta la estación siguiente, la cara de arriba y la de los lados de arriba.
// La distancia entre ejes es la misma en todas (1.35 m por lado): las llantas caen en los rodillos.
var SITE_LIGHT = (function() { var l = [-0.4, 0.45, 0.8], m = Math.sqrt(l[0] * l[0] + l[1] * l[1] + l[2] * l[2]); return [l[0] / m, l[1] / m, l[2] / m]; })();
var SITE_CAR_SEG = {
    tail: { top: 'body', up: 'body' }, trunk: { top: 'body', up: 'body' },
    rw: { top: 'glass', up: 'pillar', refl: true },      // medallón (pilar C/D a los lados)
    roof: { top: 'body', up: 'glass' }, bpil: { top: 'body', up: 'pillar' },
    ws: { top: 'glass', up: 'pillar', refl: true },      // parabrisas (pilar A a los lados)
    hood: { top: 'body', up: 'body' }, nose: { top: 'body', up: 'body' }
};
var SITE_WHEEL_U = 1.35;
var SITE_BODIES = {
    sedan: { label: 'Sedán', wheelR: 0.33, st: [
        [-2.31, 0.38, 0.78, 0.82, 0.70, 0.60, 'tail'], [-2.18, 0.33, 0.92, 0.97, 0.86, 0.74, 'trunk'], [-1.80, 0.29, 0.96, 1.01, 0.91, 0.79, 'rw'],
        [-0.92, 0.21, 0.95, 1.39, 0.92, 0.66, 'roof'], [-0.31, 0.19, 0.94, 1.43, 0.92, 0.67, 'bpil'], [-0.18, 0.19, 0.94, 1.43, 0.92, 0.67, 'roof'],
        [0.30, 0.19, 0.93, 1.40, 0.92, 0.66, 'ws'], [1.18, 0.21, 0.88, 0.97, 0.92, 0.80, 'hood'], [2.04, 0.27, 0.80, 0.84, 0.88, 0.74, 'nose'],
        [2.31, 0.33, 0.62, 0.67, 0.70, 0.58, null]] },
    hatch: { label: 'Hatchback', wheelR: 0.33, st: [
        [-2.22, 0.38, 0.82, 0.88, 0.72, 0.62, 'tail'], [-2.10, 0.33, 0.95, 1.02, 0.87, 0.74, 'rw'], [-1.74, 0.29, 0.97, 1.39, 0.91, 0.66, 'bpil'],
        [-1.40, 0.25, 0.96, 1.41, 0.92, 0.67, 'roof'], [-0.31, 0.19, 0.94, 1.43, 0.92, 0.67, 'bpil'], [-0.18, 0.19, 0.94, 1.43, 0.92, 0.67, 'roof'],
        [0.30, 0.19, 0.93, 1.40, 0.92, 0.66, 'ws'], [1.18, 0.21, 0.88, 0.97, 0.92, 0.80, 'hood'], [2.00, 0.27, 0.80, 0.84, 0.88, 0.74, 'nose'],
        [2.23, 0.33, 0.62, 0.67, 0.70, 0.58, null]] },
    wagon: { label: 'Wagon', wheelR: 0.33, rails: true, st: [
        [-2.35, 0.38, 0.86, 0.92, 0.72, 0.62, 'tail'], [-2.24, 0.33, 0.97, 1.05, 0.87, 0.74, 'rw'], [-2.04, 0.29, 0.98, 1.43, 0.91, 0.67, 'bpil'],
        [-1.82, 0.27, 0.98, 1.44, 0.92, 0.67, 'roof'], [-1.10, 0.22, 0.97, 1.44, 0.92, 0.67, 'bpil'], [-0.98, 0.21, 0.96, 1.44, 0.92, 0.67, 'roof'],
        [-0.31, 0.19, 0.95, 1.44, 0.92, 0.67, 'bpil'], [-0.18, 0.19, 0.95, 1.44, 0.92, 0.67, 'roof'], [0.30, 0.19, 0.93, 1.41, 0.92, 0.66, 'ws'],
        [1.18, 0.21, 0.88, 0.97, 0.92, 0.80, 'hood'], [2.06, 0.27, 0.80, 0.84, 0.88, 0.74, 'nose'], [2.35, 0.33, 0.62, 0.67, 0.70, 0.58, null]] },
    suv: { label: 'SUV', wheelR: 0.37, rails: true, cladding: true, st: [
        [-2.32, 0.44, 0.98, 1.06, 0.76, 0.66, 'tail'], [-2.22, 0.38, 1.06, 1.14, 0.90, 0.78, 'rw'], [-2.00, 0.33, 1.07, 1.64, 0.93, 0.72, 'bpil'],
        [-1.74, 0.31, 1.07, 1.66, 0.93, 0.73, 'roof'], [-1.06, 0.28, 1.06, 1.68, 0.94, 0.73, 'bpil'], [-0.94, 0.28, 1.06, 1.68, 0.94, 0.73, 'roof'],
        [-0.31, 0.28, 1.06, 1.68, 0.94, 0.73, 'bpil'], [-0.18, 0.28, 1.06, 1.68, 0.94, 0.73, 'roof'], [0.38, 0.28, 1.04, 1.64, 0.94, 0.72, 'ws'],
        [1.26, 0.30, 1.00, 1.10, 0.94, 0.82, 'hood'], [2.06, 0.35, 0.96, 1.02, 0.91, 0.78, 'nose'], [2.32, 0.42, 0.80, 0.86, 0.76, 0.64, null]] }
};
// Colores de la flota Master (los autos del laboratorio se ven con su color real).
var SITE_PAINTS = {
    blanco: { label: 'Blanco', hex: '#f1f5f9' }, plata: { label: 'Plata', hex: '#cbd5e1' }, gris: { label: 'Gris', hex: '#6b7280' },
    negro: { label: 'Negro', hex: '#273142' }, rojo: { label: 'Rojo', hex: '#c62828' }, azul: { label: 'Azul', hex: '#1d4ed8' },
    verde: { label: 'Verde', hex: '#2f7d4f' }, arena: { label: 'Arena', hex: '#d6c7a1' }
};

/** La carrocería de una configuración (BODY TYPE del catálogo), o '' si no se sabe. PURA. */
function siteBodyFromConfig(cfg) {
    var b = String((cfg && (cfg['BODY TYPE'] || cfg.body || cfg.bodyType)) || '').toUpperCase();
    if (/LONG|SUV|CUV/.test(b)) return 'suv';
    if (/WGN|WAGON/.test(b)) return 'wagon';
    if (/5DR|HATCH/.test(b)) return 'hatch';
    if (/4DR|SEDAN|SEDÁN/.test(b)) return 'sedan';
    return '';
}

/** Lo alto de una carrocería (para poner su etiqueta encima). PURA. */
function siteBodyHeight(key) {
    var B = SITE_BODIES[key] || SITE_BODIES.sedan;
    return Math.max.apply(null, B.st.map(function(s) { return s[3]; }));
}

var _siteRingMemo = {};
/** Las secciones de una carrocería: 10 puntos [v, z] por estación (la de abajo no se pinta). */
function _siteCarRings(key) {
    if (_siteRingMemo[key]) return _siteRingMemo[key];
    var B = SITE_BODIES[key] || SITE_BODIES.sedan;
    return (_siteRingMemo[key] = B.st.map(function(s) {
        var zb = s[1], zs = s[2], zt = s[3], w = s[4], wt = s[5];
        var zr = zb + Math.min(0.16, (zs - zb) * 0.3), zw = zs - Math.min(0.1, (zs - zb) * 0.2);
        return [[-w * 0.93, zb], [-w * 0.985, zr], [-w, zw], [-(w - 0.035), zs], [-wt, zt], [wt, zt], [w - 0.035, zs], [w, zw], [w * 0.985, zr], [w * 0.93, zb]];
    }));
}

/** Clase de una cara según qué es y cuánta luz le da. */
function _siteCarCls(kind, b) {
    if (kind === 'glass') return 'st-c-g' + (b > 0.8 ? 2 : b > 0.62 ? 1 : 0);
    if (kind === 'pillar') return 'st-c-p';
    if (kind === 'clad') return 'st-c-k';
    return 'st-c-b' + Math.max(0, Math.min(10, Math.round(b * 10)));
}

/** Envolvente convexa de puntos de pantalla (para la silueta de una llanta). PURA. */
function _siteHull(pts) {
    var p = pts.slice().sort(function(a, b) { return a.x - b.x || a.y - b.y; });
    if (p.length < 3) return p;
    var cr = function(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); };
    var lo = [], up = [];
    p.forEach(function(q) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    for (var i = p.length - 1; i >= 0; i--) { var q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
}

/**
 * Un auto en (cx, cy) con la nariz hacia `heading` (radianes; 0 = este, π/2 = sur). PURA.
 * ctx = {P, V} (proyección y hacia dónde está quien mira); opts = {body, sel, ring}.
 * Las caras que no ven a quien mira no se dibujan; las demás van por profundidad y con luz.
 */
function _siteCarSVG(ctx, cx, cy, heading, cls, attrs, title, opts) {
    opts = opts || {};
    var key = SITE_BODIES[opts.body] ? opts.body : 'sedan', B = SITE_BODIES[key];
    var P = ctx.P, V = ctx.V, LG = SITE_LIGHT, R = B.wheelR;
    var fx = Math.cos(heading), fy = Math.sin(heading), rx = -fy, ry = fx;
    var Wd = function(u, v, z) { return [cx + fx * u + rx * v, cy + fy * u + ry * v, z]; };
    var Pj = function(p) { return P(p[0], p[1], p[2]); };
    var st = B.st, n = st.length, rings = _siteCarRings(key);
    var wp = rings.map(function(ring, i) { return ring.map(function(q) { return Wd(st[i][0], q[0], q[1]); }); });
    var dot = function(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
    var see = function(pts, hint) {
        var nx = 0, ny = 0, nz = 0;
        for (var i = 0; i < pts.length; i++) {
            var a = pts[i], b = pts[(i + 1) % pts.length];
            nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
        }
        var m = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (m < 1e-9) return null;
        var nn = [nx / m, ny / m, nz / m];
        if (dot(nn, hint) < 0) nn = [-nn[0], -nn[1], -nn[2]];
        if (dot(nn, V) <= 0.02) return null;
        return { n: nn, b: 0.42 + 0.58 * Math.max(0, dot(nn, LG)) };
    };
    // Hacia afuera = del eje del auto (a media altura) al centro de la cara.
    var radial = function(pts) {
        var c = [0, 0, 0];
        pts.forEach(function(p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
        c = [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
        var uc = (c[0] - cx) * fx + (c[1] - cy) * fy;
        return [c[0] - (cx + fx * uc), c[1] - (cy + fy * uc), c[2] - 0.72];
    };
    var poly = function(cl, pp) { return '<polygon class="' + cl + '" points="' + _invRoomPts(pp) + '"/>'; };
    var depth = function(pp) { var s = 0; for (var i = 0; i < pp.length; i++) s += pp[i].d; return s / pp.length; };
    var faces = [];
    var addFace = function(pts, kind, hint, extra, bias) {
        var v = see(pts, hint || radial(pts));
        if (!v) return null;
        var pp = pts.map(Pj);
        faces.push({ d: depth(pp) + (bias || 0), s: poly(_siteCarCls(kind, v.b), pp) + (extra ? extra() : '') });
        return v;
    };
    // Punto sobre una cara del lazo: s a lo largo (estación i → i+1), t a lo ancho (punto a → b).
    var onQuad = function(i, a, b) {
        return function(s, t) {
            var p0 = wp[i][a], p1 = wp[i][b], q0 = wp[i + 1][a], q1 = wp[i + 1][b];
            var lerp = function(x, y, k) { return [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]; };
            return Pj(lerp(lerp(p0, p1, t), lerp(q0, q1, t), s));
        };
    };
    var quadAt = function(F, pts, cl) { return poly(cl, pts.map(function(q) { return F(q[0], q[1]); })); };
    var mid0 = 1, mid1 = n - 2;          // de la estación 1 a la n−2 los costados van en una sola pieza
    // ── Lámina: cada tramo entre estaciones, cada arista del lazo (la de abajo, 9, no se ve) ──
    for (var i = 0; i < n - 1; i++) {
        var seg = SITE_CAR_SEG[st[i][6]] || SITE_CAR_SEG.hood;
        for (var j = 0; j < 9; j++) {
            if ((j === 0 || j === 1 || j === 7 || j === 8) && i >= mid0 && i < mid1) continue;
            var q = [wp[i][j], wp[i][j + 1], wp[i + 1][j + 1], wp[i + 1][j]];
            var kind = j === 4 ? (seg.top === 'glass' ? 'glass' : 'body')
                     : (j === 3 || j === 5) ? (seg.up === 'glass' ? 'glass' : seg.up === 'pillar' ? 'pillar' : 'body')
                     : (j === 0 || j === 8) && B.cladding ? 'clad' : 'body';
            var extra = null;
            if (j === 4 && seg.refl) extra = (function(F) { return function() { return quadAt(F, [[0.18, 0.16], [0.36, 0.16], [0.8, 0.5], [0.62, 0.5]], 'st-c-refl'); }; })(onQuad(i, 4, 5));
            else if (j === 4 && i === n - 2) extra = (function(F) { return function() {   // faros, vistos desde arriba
                return quadAt(F, [[0.5, 0.02], [1, 0.02], [1, 0.3], [0.72, 0.22]], 'st-c-lamp') + quadAt(F, [[0.5, 0.98], [1, 0.98], [1, 0.7], [0.72, 0.78]], 'st-c-lamp'); }; })(onQuad(i, 4, 5));
            else if (j === 4 && i === 0) extra = (function(F) { return function() { return quadAt(F, [[0.04, 0.05], [0.3, 0.05], [0.3, 0.95], [0.04, 0.95]], 'st-c-tail'); }; })(onQuad(i, 4, 5));
            addFace(q, kind, null, extra);
        }
    }
    // ── Las tapas: defensa trasera y nariz (con sus calaveras, faros, parrilla y placas) ──
    var capF = function(k, du) {
        var s = st[k], w = s[4], zb = s[1], zt = s[3];
        return function(fv, fz) { return Pj(Wd(s[0] + du, fv * w, zb + fz * (zt - zb))); };
    };
    var mirrorFv = function(pts) { return pts.map(function(q) { return [-q[0], q[1]]; }); };
    var line = function(F, a, b, cl) { var p = F(a[0], a[1]), q = F(b[0], b[1]); return '<line class="' + cl + '" x1="' + p.x.toFixed(1) + '" y1="' + p.y.toFixed(1) + '" x2="' + q.x.toFixed(1) + '" y2="' + q.y.toFixed(1) + '"/>'; };
    addFace(wp[0].slice(), 'body', [-fx, -fy, 0], function() {
        var F = capF(0, -0.004), tl = [[-0.95, 0.9], [-0.55, 0.93], [-0.55, 0.72], [-0.92, 0.66]];
        return quadAt(F, [[-0.8, 0.2], [0.8, 0.2], [0.74, 0.03], [-0.74, 0.03]], 'st-c-dark') + quadAt(F, tl, 'st-c-tail') + quadAt(F, mirrorFv(tl), 'st-c-tail') +
               line(F, [-0.55, 0.86], [0.55, 0.86], 'st-c-tbar') + quadAt(F, [[-0.2, 0.58], [0.2, 0.58], [0.2, 0.37], [-0.2, 0.37]], 'st-c-plate');
    });
    addFace(wp[n - 1].slice(), 'body', [fx, fy, 0], function() {
        var F = capF(n - 1, 0.004), hl = [[-0.95, 0.88], [-0.48, 0.94], [-0.5, 0.7], [-0.9, 0.62]];
        return quadAt(F, [[-0.42, 0.54], [0.42, 0.54], [0.58, 0.1], [-0.58, 0.1]], 'st-c-grille') + quadAt(F, hl, 'st-c-lamp') + quadAt(F, mirrorFv(hl), 'st-c-lamp') +
               line(F, [-0.82, 0.975], [0.82, 0.975], 'st-c-drl') + line(F, [-0.5, 0.38], [0.5, 0.38], 'st-c-slat') +
               quadAt(F, [[-0.2, 0.36], [0.2, 0.36], [0.2, 0.2], [-0.2, 0.2]], 'st-c-plate');
    });
    // ── Costados de una pieza (de la estación 1 a la n−2) con salpicaderas, llantas y puertas ──
    var wAt = function(u) {
        for (var k = 0; k < n - 1; k++) if (u >= st[k][0] && u <= st[k + 1][0]) { var t = (u - st[k][0]) / (st[k + 1][0] - st[k][0]); return st[k][4] + (st[k + 1][4] - st[k][4]) * t; }
        return st[n >> 1][4];
    };
    var zAt = function(u, col) {
        for (var k = 0; k < n - 1; k++) if (u >= st[k][0] && u <= st[k + 1][0]) { var t = (u - st[k][0]) / (st[k + 1][0] - st[k][0]); return st[k][col] + (st[k + 1][col] - st[k][col]) * t; }
        return st[n >> 1][col];
    };
    var ribbon = function(a, b) {
        var pts = [];
        for (var k = mid0; k <= mid1; k++) pts.push(wp[k][a]);
        for (var k2 = mid1; k2 >= mid0; k2--) pts.push(wp[k2][b]);
        return pts;
    };
    var wheelHull = function(sg, uw) {
        var vo = sg * (wAt(uw) - 0.03), vi = sg * (wAt(uw) - 0.25), pts = [];
        for (var k = 0; k < 16; k++) {
            var t = 2 * Math.PI * k / 16, du = R * Math.cos(t), z = R + R * Math.sin(t);
            pts.push(Pj(Wd(uw + du, vo, z)), Pj(Wd(uw + du, vi, z)));
        }
        return _siteHull(pts);
    };
    var disc = function(sg, uw, v, rr, nPts) {
        var pts = [];
        for (var k = 0; k < (nPts || 18); k++) { var t = 2 * Math.PI * k / (nPts || 18); pts.push(Pj(Wd(uw + rr * Math.cos(t), v, R + rr * Math.sin(t)))); }
        return pts;
    };
    var far = '', ws = st.findIndex(function(s) { return s[6] === 'ws'; }), hood = ws + 1;
    var sideDeco = function(sg) {
        var G = function(u, z, dv) { return Pj(Wd(u, sg * (wAt(u) * 0.992 + (dv || 0.006)), z)); };
        var h = '';
        [SITE_WHEEL_U, -SITE_WHEEL_U].forEach(function(uw) {
            var RA = R + 0.07, zb = zAt(uw, 1), arch = [G(uw + RA, zb)];
            for (var k = 0; k <= 12; k++) { var t = Math.PI * k / 12; arch.push(G(uw + RA * Math.cos(t), R + RA * Math.sin(t))); }
            arch.push(G(uw - RA, zb));
            var vo = sg * (wAt(uw) - 0.03);
            h += poly('st-c-arch', arch) + poly('st-c-tire', wheelHull(sg, uw)) + poly('st-c-tw', disc(sg, uw, vo, R * 0.97, 20)) +
                 poly('st-c-rim', disc(sg, uw, vo + sg * 0.004, R * 0.64, 18));
            var sp = '';
            for (var k2 = 0; k2 < 5; k2++) {
                var a = 2 * Math.PI * k2 / 5 + 0.3, p = Pj(Wd(uw + R * 0.17 * Math.cos(a), vo + sg * 0.008, R + R * 0.17 * Math.sin(a))), q = Pj(Wd(uw + R * 0.58 * Math.cos(a), vo + sg * 0.008, R + R * 0.58 * Math.sin(a)));
                sp += 'M' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + 'L' + q.x.toFixed(1) + ' ' + q.y.toFixed(1);
            }
            h += '<path class="st-c-spk" d="' + sp + '"/>' + poly('st-c-hub', disc(sg, uw, vo + sg * 0.01, R * 0.15, 10));
        });
        // Puertas: corte delantero, poste B y corte trasero (por arriba de la salpicadera).
        var bp = st.filter(function(s) { return s[6] === 'bpil'; }).map(function(s) { return s[0]; });
        var bu = bp.reduce(function(best, u) { return Math.abs(u + 0.25) < Math.abs(best + 0.25) ? u : best; }, -0.25) + 0.065;
        var uf = SITE_WHEEL_U - R - 0.1, ur = -(SITE_WHEEL_U - R - 0.08), zArch = R + R + 0.09;
        var seam = '', sg2 = function(u, z0, z1) { var a = G(u, z0), b = G(u, z1); seam += 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1); };
        sg2(uf, zAt(uf, 1) + 0.17, zAt(uf, 2) - 0.01); sg2(bu, zAt(bu, 1) + 0.17, zAt(bu, 2) - 0.01); sg2(ur, zArch, zAt(ur, 2) - 0.01);
        h += '<path class="st-c-seam" d="' + seam + '"/>';
        [[bu + 0.17, bu + 0.33], [ur + 0.14, ur + 0.3]].forEach(function(hd) {
            var z = zAt(hd[0], 2) - 0.11;
            h += poly('st-c-handle', [G(hd[0], z, 0.012), G(hd[1], z, 0.012), G(hd[1], z + 0.04, 0.012), G(hd[0], z + 0.04, 0.012)]);
        });
        // Línea de carácter y moldura de la cintura.
        var c0 = G(st[1][0] + 0.2, zAt(st[1][0] + 0.2, 2) - 0.2), c1 = G(st[n - 2][0] - 0.25, zAt(st[n - 2][0] - 0.25, 2) - 0.17);
        h += '<line class="st-c-crease" x1="' + c0.x.toFixed(1) + '" y1="' + c0.y.toFixed(1) + '" x2="' + c1.x.toFixed(1) + '" y2="' + c1.y.toFixed(1) + '"/>';
        if (ws > 0) {
            var ua = st[hood][0] - 0.05, ub = st[2][0];
            var m0 = Pj(Wd(ua, sg * (wAt(ua) - 0.03), zAt(ua, 2) + 0.004)), m1 = Pj(Wd(ub, sg * (wAt(ub) - 0.03), zAt(ub, 2) + 0.004));
            h += '<line class="st-c-chrome" x1="' + m0.x.toFixed(1) + '" y1="' + m0.y.toFixed(1) + '" x2="' + m1.x.toFixed(1) + '" y2="' + m1.y.toFixed(1) + '"/>';
        }
        return h;
    };
    [[-1, 0, 1, 2], [1, 8, 7, 8]].forEach(function(sd) {
        var sg = sd[0], rock = ribbon(sd[1], sd[1] + 1), side = sg < 0 ? ribbon(1, 2) : ribbon(7, 8);
        var vs = see(side, [rx * sg, ry * sg, 0]);
        if (!vs) {   // el costado lejano no se ve: solo sus llantas, que asoman por abajo cuando se mira de lado
            if (V[2] < 0.8) [SITE_WHEEL_U, -SITE_WHEEL_U].forEach(function(uw) { far += poly('st-c-tire', wheelHull(sg, uw)); });
            return;
        }
        var vr = see(rock, [rx * sg, ry * sg, -0.4]);
        var spp = side.map(Pj);
        faces.push({ d: depth(spp), s: (vr ? poly(_siteCarCls(B.cladding ? 'clad' : 'body', vr.b), rock.map(Pj)) : '') + poly(_siteCarCls('body', vs.b), spp) + sideDeco(sg) });
    });
    // Espejos (un prisma chico al pie del pilar A).
    if (ws > 0) [-1, 1].forEach(function(sg) {
        var u1 = st[hood][0] - 0.16, u0 = u1 - 0.2, z0 = zAt(u1, 2) + 0.02, z1 = z0 + 0.13, w0 = wAt(u1) - 0.03, w1 = w0 + 0.19;
        var c = function(u, v, z) { return Wd(u, sg * v, z); };
        var bias = see([[0, 0, 0], [1, 0, 0], [0, 1, 0]], [0, 0, 1]) ? 0.3 : 0;
        [[[c(u0, w0, z1), c(u1, w0, z1), c(u1, w1, z1), c(u0, w1, z1)], [0, 0, 1]],
         [[c(u0, w1, z0), c(u1, w1, z0), c(u1, w1, z1), c(u0, w1, z1)], [rx * sg, ry * sg, 0]],
         [[c(u1, w0, z0), c(u1, w1, z0), c(u1, w1, z1), c(u1, w0, z1)], [fx, fy, 0]],
         [[c(u0, w0, z0), c(u0, w1, z0), c(u0, w1, z1), c(u0, w0, z1)], [-fx, -fy, 0]]].forEach(function(fc, k) {
            addFace(fc[0], k === 3 ? 'glass' : 'body', fc[1], null, bias);
        });
    });
    faces.sort(function(a, b) { return a.d - b.d; });
    // Barras del techo (wagon y SUV), encima de todo.
    var rails = '';
    if (B.rails) [-1, 1].forEach(function(sg) {
        var pts = [];
        st.forEach(function(s) { if (s[3] - s[2] > 0.3) pts.push(Pj(Wd(s[0], sg * (s[5] - 0.07), s[3] + 0.045))); });
        if (pts.length > 1) rails += '<polyline class="st-c-rail" points="' + _invRoomPts(pts) + '"/>';
    });
    // Sombra en el piso (dos capas: borde suave), sombra de contacto de las llantas y el anillo de la selección.
    var L2 = Math.abs(st[n - 1][0] - st[0][0]) / 2, Wm = Math.max.apply(null, st.map(function(s) { return s[4]; }));
    var rrect = function(hu, hv, rad, du, dv, z) {
        var pts = [], cs = [[hu - rad, hv - rad, 0], [-(hu - rad), hv - rad, 90], [-(hu - rad), -(hv - rad), 180], [hu - rad, -(hv - rad), 270]];
        cs.forEach(function(cc) { for (var k = 0; k <= 4; k++) { var a = (cc[2] + k * 22.5) * Math.PI / 180; pts.push(P(cx + fx * (cc[0] + rad * Math.cos(a)) + rx * (cc[1] + rad * Math.sin(a)) + du, cy + fy * (cc[0] + rad * Math.cos(a)) + ry * (cc[1] + rad * Math.sin(a)) + dv, z)); } });
        return pts;
    };
    var under = poly('st-c-shadow st-c-shadow--soft', rrect(L2 + 0.22, Wm + 0.24, 0.6, 0.08, -0.09, 0.003)) + poly('st-c-shadow', rrect(L2 + 0.04, Wm + 0.06, 0.45, 0.05, -0.06, 0.004));
    [-1, 1].forEach(function(sg) { [SITE_WHEEL_U, -SITE_WHEEL_U].forEach(function(uw) {
        var pts = [];
        for (var k = 0; k < 12; k++) { var t = 2 * Math.PI * k / 12; pts.push(Pj(Wd(uw + R * 0.9 * Math.cos(t), sg * (wAt(uw) - 0.14) + 0.13 * Math.sin(t), 0.005))); }
        under += poly('st-c-contact', pts);
    }); });
    if (opts.ring) under = poly('st-c-ring st-c-ring--' + opts.ring, rrect(L2 + 0.38, Wm + 0.36, 0.7, 0, 0, 0.006)) + under;
    var dmax = faces.length ? Math.max.apply(null, faces.map(function(f) { return f.d; })) : P(cx, cy, 0).d;
    return { d: dmax,
             s: '<g class="' + cls + '"' + (attrs || '') + '>' + (title ? '<title>' + _invRoomEsc(title) + '</title>' : '') + under + far +
                faces.map(function(f) { return f.s; }).join('') + rails + '</g>' };
}

/** La huella de un auto en el piso, punteada: el lugar de un Master que está adentro. PURA. */
function _siteCarGhostSVG(P, cx, cy, heading, cls) {
    var fx = Math.cos(heading), fy = Math.sin(heading), rx = -fy, ry = fx, hu = 2.25, hv = 0.92, rad = 0.5, pts = [];
    [[hu - rad, hv - rad, 0], [-(hu - rad), hv - rad, 90], [-(hu - rad), -(hv - rad), 180], [hu - rad, -(hv - rad), 270]].forEach(function(cc) {
        for (var k = 0; k <= 4; k++) { var a = (cc[2] + k * 22.5) * Math.PI / 180, u = cc[0] + rad * Math.cos(a), v = cc[1] + rad * Math.sin(a); pts.push(P(cx + fx * u + rx * v, cy + fy * u + ry * v, 0.008)); }
    });
    return '<polygon class="' + cls + '" points="' + _invRoomPts(pts) + '"/>';
}

/**
 * [3.17.0] Texto PINTADO en el piso: se ve en perspectiva, como la pintura de un estacionamiento,
 * y lo que esté encima lo tapa. Corre por el eje del piso que se ve más horizontal. PURA.
 * fs = alto de la letra en metros; dy = renglón (en altos de letra) bajo el punto.
 */
function _siteFloorText(P, x, y, text, cls, fs, dy) {
    var o = P(x, y, 0.009), ax = P(x + 1, y, 0.009), ay = P(x, y + 1, 0.009);
    var ux = [ax.x - o.x, ax.y - o.y], uy = [ay.x - o.x, ay.y - o.y];
    var lenx = Math.sqrt(ux[0] * ux[0] + ux[1] * ux[1]) || 1, leny = Math.sqrt(uy[0] * uy[0] + uy[1] * uy[1]) || 1;
    var u, v;
    if (Math.abs(ux[0]) / lenx >= Math.abs(uy[0]) / leny) { u = ux[0] >= 0 ? ux : [-ux[0], -ux[1]]; v = uy; }
    else { u = uy[0] >= 0 ? uy : [-uy[0], -uy[1]]; v = ux; }
    if (u[0] * v[1] - u[1] * v[0] < 0) v = [-v[0], -v[1]];          // que no se vea al revés
    var S = INV_ROOM_S, k = (fs || 0.4) / 0.72;                       // la letra mide ~0.72 de su tamaño
    var m = [u[0] / S * k, u[1] / S * k, v[0] / S * k, v[1] / S * k, o.x, o.y];
    return '<text class="' + cls + '" transform="matrix(' + m.map(function(n) { return n.toFixed(4); }).join(' ') + ')" x="0" y="' + (((dy || 0) + 0.36) * 72).toFixed(1) + '">' + _invRoomEsc(text) + '</text>';
}

/** Etiqueta en píldora (texto con fondo), para que se lea sobre cualquier cosa. `ls` = escala de la letra. */
function _sitePill(x, y, text, sub, cls, ls) {
    var esc = _invRoomEsc;
    ls = ls || 1;
    var w = (Math.max(String(text).length * 11.5, String(sub || '').length * 9.4) + 22) * ls, h = (sub ? 46 : 28) * ls;
    return '<g class="st-pill ' + (cls || '') + '" aria-hidden="true"><rect x="' + (x - w / 2).toFixed(1) + '" y="' + (y - h + 6 * ls).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + (14 * ls).toFixed(1) + '"/>' +
           '<text x="' + x.toFixed(1) + '" y="' + (y - (sub ? 18 : 2) * ls).toFixed(1) + '">' + esc(text) + '</text>' +
           (sub ? '<text class="st-pill-sub" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '">' + esc(sub) + '</text>' : '') + '</g>';
}

/**
 * [3.17.0] Lo de afuera: la base de la maqueta, jardineras, árboles y el estacionamiento de la
 * flota Master (con sus líneas, topes, números y los lugares que se tocan). PURA.
 */
function _siteExteriorSVG(ctx, scene, layout, floorL, solid, over, opts) {
    var P = ctx.P, V = ctx.V, esc = _invRoomEsc, S = INV_ROOM_S;
    var rectPts = function(r, z) { return [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map(function(c) { return P(c[0], c[1], z); }); };
    var B = layout.base, TH = 0.45, A = 0;
    for (var i = 0; i < B.length; i++) { var p0 = B[i], p1 = B[(i + 1) % B.length]; A += p0[0] * p1[1] - p1[0] * p0[1]; }
    // Los cantos de la base que dan hacia quien mira; luego la cara de arriba los tapa donde toca.
    B.forEach(function(a, k) {
        var b = B[(k + 1) % B.length], ex = b[0] - a[0], ey = b[1] - a[1], len = Math.sqrt(ex * ex + ey * ey) || 1;
        var nx = (A > 0 ? ey : -ey) / len, ny = (A > 0 ? -ex : ex) / len;
        if (nx * V[0] + ny * V[1] <= 0.001) return;
        floorL.push('<polygon class="st-base-side' + (Math.abs(nx) > Math.abs(ny) ? ' st-base-side--x' : '') + '" points="' +
                    _invRoomPts([P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], -TH), P(a[0], a[1], -TH)]) + '"/>');
    });
    floorL.push('<polygon class="st-ground" points="' + _invRoomPts(B.map(function(p) { return P(p[0], p[1], 0); })) + '"/>');
    (layout.grass || []).forEach(function(r) { floorL.push('<polygon class="st-grass" points="' + _invRoomPts(rectPts(r, 0.002)) + '"/>'); });
    var lot = layout.lot;
    if (lot) {
        floorL.push('<polygon class="st-asphalt" points="' + _invRoomPts(rectPts(lot.rect, 0.003)) + '"/>');
        if (lot.apron) floorL.push('<polygon class="st-asphalt" points="' + _invRoomPts(rectPts(lot.apron, 0.003)) + '"/>');
        // Guarnición a lo largo de la cabecera de los lugares.
        var cy0 = lot.curbY, x0 = lot.rect[0], x1 = lot.rect[2];
        floorL.push('<polygon class="st-curb" points="' + _invRoomPts([P(x0, cy0 - 0.2, 0.12), P(x1, cy0 - 0.2, 0.12), P(x1, cy0, 0.12), P(x0, cy0, 0.12)]) + '"/>' +
                    (V[1] > 0 ? '<polygon class="st-curb-face" points="' + _invRoomPts([P(x0, cy0, 0.12), P(x1, cy0, 0.12), P(x1, cy0, 0), P(x0, cy0, 0)]) + '"/>' : ''));
        var path = '', seg = function(xa, ya, xb, yb) { var a = P(xa, ya, 0.006), b = P(xb, yb, 0.006); path += 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1); };
        var pk = scene.parking || { byStall: {}, conflicts: [] };
        lot.stalls.forEach(function(s, k) {
            var r = s.rect, cx = (r[0] + r[2]) / 2;
            if (k === 0) seg(r[2], r[1] + 0.15, r[2], r[3]);
            seg(r[0], r[1] + 0.15, r[0], r[3]);
            var occ = (pk.byStall[s.id] || []).length;
            var cls = 'st-spot st-spot--stall' + (occ ? ' st-spot--busy' : '') + ((pk.conflicts || []).indexOf(s.id) >= 0 ? ' st-spot--clash' : '') +
                      (opts.sel && opts.sel.kind === 'spot' && opts.sel.id === s.id ? ' st-spot--sel' : '') + (opts.moving && !occ ? ' st-spot--target' : '');
            floorL.push('<polygon class="' + cls + '" data-spot="' + s.id + '" tabindex="0" role="button" aria-label="' + esc(s.label) + (occ ? ': ocupado' : ': libre') + '" points="' + _invRoomPts(rectPts([r[0] + 0.08, r[1] + 0.1, r[2] - 0.08, r[3] - 0.05], 0.007)) + '"/>');
            floorL.push(_siteFloorText(P, cx, r[3] + 0.25, s.short, 'st-stall-num', 0.5));
            solid.push(_siteBoxSVG(P, [cx - 0.75, r[1] + 0.42, cx + 0.75, r[1] + 0.62], 0, 0.1, 'st-stop', ' aria-hidden="true"', ''));
        });
        floorL.push('<path class="st-stall-line" d="' + path + '"/>');
        if (opts.labels !== false) floorL.push(_siteFloorText(P, (lot.rect[0] + lot.rect[2]) / 2, lot.aisle[3] - 0.85, 'Estacionamiento · vehículos Master', 'st-floor-lbl st-floor-lbl--lot', 0.42));
    }
    // Árboles y arbustos: una esfera se ve redonda desde cualquier lado (proyección ortográfica).
    (layout.trees || []).forEach(function(t) {
        var sh = [];
        for (var k = 0; k < 14; k++) { var a = 2 * Math.PI * k / 14; sh.push(P(t.x + 0.45 + t.r * 1.05 * Math.cos(a), t.y - 0.4 + t.r * 0.85 * Math.sin(a), 0.004)); }
        floorL.push('<polygon class="st-tree-shadow" points="' + _invRoomPts(sh) + '"/>');
        var trunk = _siteBoxSVG(P, [t.x - 0.11, t.y - 0.11, t.x + 0.11, t.y + 0.11], 0, t.h + t.r * 0.3, 'st-trunk', '', '');
        var c1 = P(t.x, t.y, t.h + t.r * 0.6), c2 = P(t.x - t.r * 0.28, t.y - t.r * 0.12, t.h + t.r * 0.95);
        solid.push({ d: P(t.x, t.y, 0).d, s: '<g class="st-tree" aria-hidden="true">' + trunk.s +
            '<circle class="st-canopy" cx="' + c1.x.toFixed(1) + '" cy="' + c1.y.toFixed(1) + '" r="' + (t.r * S).toFixed(1) + '"/>' +
            '<circle class="st-canopy-hl" cx="' + c2.x.toFixed(1) + '" cy="' + c2.y.toFixed(1) + '" r="' + (t.r * 0.55 * S).toFixed(1) + '"/></g>' });
    });
    (layout.bushes || []).forEach(function(b) {
        var c = P(b[0], b[1], 0.32), h = P(b[0] - 0.1, b[1] - 0.05, 0.46);
        solid.push({ d: P(b[0], b[1], 0).d, s: '<g class="st-tree" aria-hidden="true"><circle class="st-canopy st-canopy--bush" cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="' + (0.4 * S).toFixed(1) + '"/>' +
            '<circle class="st-canopy-hl" cx="' + h.x.toFixed(1) + '" cy="' + h.y.toFixed(1) + '" r="' + (0.2 * S).toFixed(1) + '"/></g>' });
    });
}

/**
 * La escena del laboratorio como SVG (cadena). PURA.
 * scene = {layout, items, model, look, health, parking, masterLook}; cam = cámara;
 * opts = {sel, moving, edit, labels, ls (escala de la letra)}.
 * look[kind:id] = {tone, short, sub, body, master, aria}; health[itemId] = {tone, text};
 * masterLook[id] = {short, sub, aria}. Con `layout.lot` (siteLayout) se dibuja también el exterior.
 */
function siteSceneSVG(scene, cam, opts) {
    opts = opts || {};
    var layout = scene.layout || SITE_LAYOUT;
    var C = siteCenter(layout);
    var P = function(x, y, z) { return invRoomProject(x, y, z, cam, C); };
    var ctx = { P: P, V: _siteViewVec(cam) };
    var ls = opts.ls || 1;
    var floorL = [], solid = [], over = [];
    var esc = _invRoomEsc;
    var rectPts = function(r, z) { return [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map(function(c) { return P(c[0], c[1], z); }); };
    var model = scene.model || { bySpot: {}, conflicts: [] };
    if (layout.base) _siteExteriorSVG(ctx, scene, layout, floorL, solid, over, opts);
    var fl = layout.floor.map(function(p) { return P(p[0], p[1], 0.002); });
    floorL.push('<polygon class="st-floor" points="' + _invRoomPts(fl) + '"/>');
    var areaLbl = [];
    (layout.areas || []).forEach(function(a) {
        floorL.push('<polygon class="st-area st-area--' + a.tone + '" points="' + _invRoomPts(rectPts(a.rect, 0.005)) + '"/>');
        if (opts.labels === false) return;
        var at = a.lbl || [a.rect[0] + 2, a.rect[1] + 0.8], lines = a.lines || [a.label];
        lines.forEach(function(t, k) { areaLbl.push(_siteFloorText(P, at[0], at[1], t, 'st-floor-lbl', a.fs || 0.36, (k - (lines.length - 1) / 2) * 1.25)); });
    });
    // Placas del piso de la celda (como en las fotos)
    var cellA = (layout.areas || []).find(function(a) { return a.id === 'celda'; });
    if (cellA && !opts.lite) {
        var cr = cellA.rect, gl = [];
        for (var gx = cr[0] + 1.5; gx < cr[2]; gx += 1.5) { var g1 = P(gx, cr[1], 0.006), g2 = P(gx, cr[3], 0.006); gl.push('M' + g1.x.toFixed(1) + ' ' + g1.y.toFixed(1) + 'L' + g2.x.toFixed(1) + ' ' + g2.y.toFixed(1)); }
        for (var gy = cr[1] + 1.5; gy < cr[3]; gy += 1.5) { var h1 = P(cr[0], gy, 0.006), h2 = P(cr[2], gy, 0.006); gl.push('M' + h1.x.toFixed(1) + ' ' + h1.y.toFixed(1) + 'L' + h2.x.toFixed(1) + ' ' + h2.y.toFixed(1)); }
        floorL.push('<path class="st-floor-plates" d="' + gl.join('') + '"/>');
    }
    // Sombra suave al pie de los muros, adentro y afuera (asienta el edificio en el piso).
    var WH = 2.6, CUT = 0.45, TH = 0.18;
    var opaque = layout.walls.filter(function(w) { return !w[6]; });
    opaque.forEach(function(w) {
        var nx = w[4], ny = w[5];
        [[-0.55, 'st-ao'], [-0.22, 'st-ao'], [TH + 0.42, 'st-ao st-ao--out']].forEach(function(o) {
            var off = o[0], base = off > 0 ? TH : 0;
            floorL.push('<polygon class="' + o[1] + '" points="' + _invRoomPts([P(w[0] + nx * base, w[1] + ny * base, 0.006), P(w[2] + nx * base, w[3] + ny * base, 0.006),
                P(w[2] + nx * off, w[3] + ny * off, 0.006), P(w[0] + nx * off, w[1] + ny * off, 0.006)]) + '"/>');
        });
    });
    // Lo fijo del piso: la fosa del dinamómetro (rodillos de acero, placa), rieles, escape.
    var dyn = (layout.fixed || []).filter(function(f) { return f.rect && (f.kind === 'roll' || f.kind === 'plate'); });
    if (dyn.length) {
        var bx = [Infinity, Infinity, -Infinity, -Infinity];
        dyn.forEach(function(f) { bx = [Math.min(bx[0], f.rect[0]), Math.min(bx[1], f.rect[1]), Math.max(bx[2], f.rect[2]), Math.max(bx[3], f.rect[3])]; });
        var pit = [bx[0] - 0.14, bx[1] - 0.14, bx[2] + 0.14, bx[3] + 0.14];
        floorL.push('<polygon class="st-pit" points="' + _invRoomPts(rectPts(pit, 0.008)) + '"/><polygon class="st-pit-edge" points="' + _invRoomPts(rectPts(pit, 0.009)) + '"/>');
    }
    (layout.fixed || []).forEach(function(f) {
        if (f.rect && f.kind === 'roll') {
            var r = f.rect, w = r[2] - r[0];
            floorL.push('<polygon class="st-roll" points="' + _invRoomPts(rectPts(r, 0.01)) + '"/>');
            [[0.06, 0.47], [0.53, 0.94]].forEach(function(t) {   // los dos rodillos del par
                var rr = [r[0] + w * t[0], r[1] + 0.03, r[0] + w * t[1], r[3] - 0.03], m = (rr[0] + rr[2]) / 2;
                var a1 = P(m, rr[1], 0.013), a2 = P(m, rr[3], 0.013);
                floorL.push('<polygon class="st-roller" points="' + _invRoomPts(rectPts(rr, 0.012)) + '"/>' +
                    '<line class="st-roller-hl" x1="' + a1.x.toFixed(1) + '" y1="' + a1.y.toFixed(1) + '" x2="' + a2.x.toFixed(1) + '" y2="' + a2.y.toFixed(1) + '"/>');
            });
        } else if (f.rect && f.kind === 'plate') {
            var pr = f.rect, tl = '';
            for (var k = 1; k < 4; k++) { var yy = pr[1] + (pr[3] - pr[1]) * k / 4, q1 = P(pr[0] + 0.1, yy, 0.012), q2 = P(pr[2] - 0.1, yy, 0.012); tl += 'M' + q1.x.toFixed(1) + ' ' + q1.y.toFixed(1) + 'L' + q2.x.toFixed(1) + ' ' + q2.y.toFixed(1); }
            floorL.push('<polygon class="st-plate" points="' + _invRoomPts(rectPts(pr, 0.01)) + '"/><path class="st-plate-tread" d="' + tl + '"/>');
        } else if (f.line) {
            var a = P(f.line[0], f.line[1], 0.02), b = P(f.line[2], f.line[3], 0.02);
            floorL.push('<line class="st-' + f.kind + '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>');
        } else if (f.kind === 'barrier') {
            var alongX = (f.rect[2] - f.rect[0]) >= (f.rect[3] - f.rect[1]);
            solid.push(_siteBoxSVG(P, f.rect, 0, f.h || 0.9, 'st-barrier', ' aria-hidden="true"', '', function(i, F) {
                // las perforaciones van en las dos caras LARGAS (0/2 si corre en x; 1/3 si corre en y)
                if (alongX ? (i !== 0 && i !== 2) : (i !== 1 && i !== 3)) return '';
                var hh = '';
                for (var u = 0.15; u < 0.9; u += 0.14) for (var v = 0.3; v < 0.9; v += 0.2) hh += _siteDisc(F, u, v, 0.025, 0.03, 'st-d-hole', 8);
                return hh;
            }));
        } else if (f.kind === 'tunnel') {
            solid.push(_siteBoxSVG(P, f.rect, f.z0, f.z1, 'st-tunnel', ' aria-hidden="true"', ''));
        }
    });
    // Lugares del laboratorio (cajones y dinamómetro): se tocan para poner o ver una unidad.
    var spotLbl = [];
    // El letrero del dinamómetro va al frente de la fosa y, si hay una placa de sujeción de ese
    // lado, delante de ella: detrás quedaría tapado por la placa.
    var dinoLblY = function(r) {
        var y = r[3] + 0.25;
        (layout.fixed || []).forEach(function(f) {
            if (f.kind === 'barrier' && f.rect && f.rect[1] >= r[3] && f.rect[0] < r[2] && f.rect[2] > r[0]) y = Math.max(y, f.rect[3] + 0.4);
        });
        return y;
    };
    layout.spots.forEach(function(s) {
        if (s.area === 'lot') return;
        var r = s.rect;
        var occ = (model.bySpot[s.id] || []).length;
        var cls = 'st-spot st-spot--' + s.id + (occ ? ' st-spot--busy' : '') + (model.conflicts.indexOf(s.id) >= 0 ? ' st-spot--clash' : '') +
                  (opts.sel && opts.sel.kind === 'spot' && opts.sel.id === s.id ? ' st-spot--sel' : '') + (opts.moving && !occ ? ' st-spot--target' : '');
        floorL.push('<polygon class="' + cls + '" data-spot="' + s.id + '" tabindex="0" role="button" aria-label="' + esc(s.label) + (occ ? ': ocupado' : ': libre') + '" points="' + _invRoomPts(rectPts(r, 0.015)) + '"/>');
        // Pintados en el piso donde el coche no los tapa: el del dinamómetro al frente de la fosa;
        // el de un cajón, en el pasillo delante de su nariz.
        if (opts.labels !== false) spotLbl.push(s.id === 'dino' ? _siteFloorText(P, (r[0] + r[2]) / 2, dinoLblY(r), 'Dinamómetro', 'st-floor-lbl st-floor-lbl--dino', 0.32)
                                                   : _siteFloorText(P, s.nose < 0 ? r[0] - 0.75 : r[2] + 0.75, (r[1] + r[3]) / 2, s.label.replace('Cajón ', ''), 'st-floor-lbl st-floor-lbl--num', 0.7, -0.5));
    });
    floorL.push(areaLbl.join('') + spotLbl.join(''));
    // ── Muros. Los del FONDO van completos; los de ENFRENTE se cortan bajos (como maqueta), con su
    // grosor arriba: se ve adentro sin un muro transparente encima. Los ventanales son vidrio. ──
    var near = function(p, q) { return Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6; };
    var touches = function(pt, self) { return opaque.filter(function(o) { return o !== self && (near([o[0], o[1]], pt) || near([o[2], o[3]], pt)); }); };
    layout.walls.forEach(function(w) {
        var back = invRoomWallIsBack(w[4], w[5], cam), kind = w[6] || '', nx = w[4], ny = w[5];
        var a = [w[0], w[1]], b = [w[2], w[3]], len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) || 1;
        var ex = (b[0] - a[0]) / len, ey = (b[1] - a[1]) / len;
        if (kind === 'glass') {
            var gh = 3.0, gpts = [P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], gh), P(a[0], a[1], gh)], dm = (gpts[0].d + gpts[1].d) / 2;
            var mul = '', nm = Math.max(1, Math.round(len / 1.2));
            for (var k = 1; k < nm; k++) { var t = k / nm, m0 = P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0), m1 = P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, gh); mul += 'M' + m0.x.toFixed(1) + ' ' + m0.y.toFixed(1) + 'L' + m1.x.toFixed(1) + ' ' + m1.y.toFixed(1); }
            solid.push({ d: dm, s: '<polygon class="st-wall st-wall--glass" points="' + _invRoomPts(gpts) + '"/><path class="st-glass-frame" d="' + mul +
                'M' + gpts[3].x.toFixed(1) + ' ' + gpts[3].y.toFixed(1) + 'L' + gpts[2].x.toFixed(1) + ' ' + gpts[2].y.toFixed(1) + '"/>' +
                '<line class="st-glass-sill" x1="' + gpts[0].x.toFixed(1) + '" y1="' + gpts[0].y.toFixed(1) + '" x2="' + gpts[1].x.toFixed(1) + '" y2="' + gpts[1].y.toFixed(1) + '"/>' });
            return;
        }
        var th = kind === 'window' ? 0.12 : TH;
        // Esquina convexa con otro muro opaco: el grosor se alarga para cerrarla (inglete).
        var ext = function(pt, dir) { return touches(pt, w).some(function(o) { return dir[0] * o[4] + dir[1] * o[5] > 0.5; }) ? th : 0; };
        var eA = kind ? 0 : ext(a, [-ex, -ey]), eB = kind ? 0 : ext(b, [ex, ey]);
        var a2 = [a[0] + nx * th - ex * eA, a[1] + ny * th - ey * eA], b2 = [b[0] + nx * th + ex * eB, b[1] + ny * th + ey * eB];
        var h = back ? (kind === 'window' ? 2.2 : WH) : CUT;
        var fa = back ? a : a2, fb = back ? b : b2;
        var face = [P(fa[0], fa[1], 0), P(fb[0], fb[1], 0), P(fb[0], fb[1], h), P(fa[0], fa[1], h)];
        var s = '';
        if (kind === 'window' && back) {   // ventanas del control: zoclo, vidrio y marco
            var zs = 0.9, lo = [face[0], face[1], P(fb[0], fb[1], zs), P(fa[0], fa[1], zs)], hi = [P(fa[0], fa[1], zs), P(fb[0], fb[1], zs), face[2], face[3]];
            s = '<polygon class="st-wall-face st-wall-face--back" points="' + _invRoomPts(lo) + '"/><polygon class="st-wall st-wall--window" points="' + _invRoomPts(hi) + '"/>';
        } else {
            s = '<polygon class="st-wall-face' + (back ? ' st-wall-face--back' : ' st-wall-face--cut') + '" points="' + _invRoomPts(face) + '"/>';
        }
        // Las puntas libres (junto a una puerta) también tienen grosor.
        [[a, a2, [-ex, -ey]], [b, b2, [ex, ey]]].forEach(function(e) {
            if (kind || touches(e[0], w).length || e[2][0] * ctx.V[0] + e[2][1] * ctx.V[1] <= 0) return;
            s += '<polygon class="st-wall-end" points="' + _invRoomPts([P(e[0][0], e[0][1], 0), P(e[1][0], e[1][1], 0), P(e[1][0], e[1][1], h), P(e[0][0], e[0][1], h)]) + '"/>';
        });
        s += '<polygon class="st-wall-cap' + (back ? '' : ' st-wall-cap--cut') + '" points="' + _invRoomPts([P(a[0], a[1], h), P(b[0], b[1], h), P(b2[0], b2[1], h), P(a2[0], a2[1], h)]) + '"/>';
        var dmid = (face[0].d + face[1].d) / 2;
        solid.push({ d: back ? dmid - 2 : dmid + 0.05, s: '<g class="st-wall" aria-hidden="true">' + s + '</g>' });
    });
    (layout.doors || []).forEach(function(d) {
        var a = P(d.a[0], d.a[1], 0.02), b = P(d.b[0], d.b[1], 0.02);
        floorL.push('<line class="rm-door' + (d.glass ? ' st-door--glass' : '') + '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>');
        var m = P((d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, 0);
        if (opts.labels !== false) over.push({ d: 99, s: '<text class="rm-door-lbl" x="' + m.x.toFixed(1) + '" y="' + (m.y + 16 * ls).toFixed(1) + '">' + (d.glass ? '↔ ' : '🚪 ') + esc(d.label) + '</text>' });
    });
    // Equipos (editables), con los detalles de su forma
    (scene.items || []).forEach(function(it) {
        if (!it || it.deleted) return;
        var h = scene.health && scene.health[it.id] || { tone: 'none', text: '' };
        var sel = opts.sel && opts.sel.kind === 'item' && opts.sel.id === it.id;
        var shape = siteItemShape(it), H = Math.max(0.1, +it.h || 1);
        var cls = 'st-eq st-eq--' + h.tone + ' st-eq--' + shape + (sel ? ' st-eq--sel' : '') + (opts.edit ? ' st-eq--edit' : '') + (opts.moving && opts.moving.kind === 'item' && opts.moving.id === it.id ? ' st-eq--moving' : '');
        var title = it.label + (h.text ? ' — ' + h.text : '');
        var attrs = ' data-item="' + esc(it.id) + '" tabindex="0" role="button" aria-label="' + esc(title) + '" style="--st-eq:' + esc(it.color || '#94a3b8') + '"';
        var front = siteItemFront(it);
        var deco = function(i, F) { return _siteDeco(shape, i, F, front); };
        var r = [it.x0, it.y0, it.x1, it.y1], bx;
        // Sombra suave en el piso
        var sh = [[r[0] - 0.06, r[1] + 0.08], [r[2] + 0.1, r[1] + 0.08], [r[2] + 0.1, r[3] + 0.14], [r[0] - 0.06, r[3] + 0.14]].map(function(c) { return P(c[0], c[1], 0.004); });
        floorL.push('<polygon class="st-eq-shadow" points="' + _invRoomPts(sh) + '"/>');
        if (shape === 'post') {
            // Poste delgado con su brazo arriba
            var cx0 = (r[0] + r[2]) / 2, cy0 = (r[1] + r[3]) / 2, pw = Math.min(r[2] - r[0], r[3] - r[1]) * 0.35;
            var base = _siteBoxSVG(P, [r[0], r[1], r[2], r[3]], 0, 0.12, 'st-eq-part', '', '');
            var col = _siteBoxSVG(P, [cx0 - pw, cy0 - pw, cx0 + pw, cy0 + pw], 0.12, H, 'st-eq-part', '', '');
            var arm = _siteBoxSVG(P, [cx0 - pw, cy0 - pw, cx0 + 0.9, cy0 + pw], H - 0.12, H, 'st-eq-part', '', '');
            bx = { d: Math.max(base.d, col.d, arm.d), s: '<g class="' + cls + '"' + attrs + '><title>' + esc(title) + '</title>' + base.s + col.s + arm.s + '</g>' };
        } else if (shape === 'fan') {
            // Ventilador: carcasa sobre una base con ruedas
            var bs = _siteBoxSVG(P, [r[0] + 0.05, r[1] + 0.1, r[2] - 0.05, r[3] - 0.1], 0, 0.25, 'st-eq-part st-eq-base', '', '');
            var hs = _siteBoxSVG(P, r, 0.25, H, 'st-eq-part', '', '', deco);
            bx = { d: Math.max(bs.d, hs.d), s: '<g class="' + cls + '"' + attrs + '><title>' + esc(title) + '</title>' + bs.s + hs.s + '</g>' };
        } else if (shape === 'desk') {
            var dtop = _siteBoxSVG(P, r, H - 0.06, H, 'st-eq-part', '', '', function(i, F) { return i === 'top' ? deco(i, F) : ''; });
            var dbody = _siteBoxSVG(P, [r[0], r[1] + (r[3] - r[1]) * 0.1, r[2], r[3] - (r[3] - r[1]) * 0.1], 0, H - 0.06, 'st-eq-part st-eq-under', '', '', function(i, F) { return i === 'top' ? '' : deco(i, F); });
            bx = { d: Math.max(dtop.d, dbody.d), s: '<g class="' + cls + '"' + attrs + '><title>' + esc(title) + '</title>' + dbody.s + dtop.s + '</g>' };
        } else if (shape === 'stringo') {
            var plat = _siteBoxSVG(P, r, 0.05, H, 'st-eq-part', '', '', deco);
            var hx = front === 'w' ? r[0] + 0.05 : r[2] - 0.15;
            var han = _siteBoxSVG(P, [hx, (r[1] + r[3]) / 2 - 0.06, hx + 0.1, (r[1] + r[3]) / 2 + 0.06], H, H + 0.85, 'st-eq-part st-eq-handle', '', '');
            bx = { d: Math.max(plat.d, han.d), s: '<g class="' + cls + '"' + attrs + '><title>' + esc(title) + '</title>' + plat.s + han.s + '</g>' };
        } else {
            bx = _siteBoxSVG(P, r, 0, H, cls, attrs, '<title>' + esc(title) + '</title>', deco);
        }
        solid.push(bx);
        var lp = P((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, H + 0.25);
        if (opts.labels !== false && (sel || h.tone === 'bad' || h.tone === 'warn' || opts.edit || opts.allLabels)) {
            over.push({ d: bx.d, s: _sitePill(lp.x, lp.y, (h.tone === 'bad' ? '⚠ ' : '') + it.label, '', 'st-pill--eq st-pill--' + h.tone, ls) });
        } else if (opts.labels !== false) {
            over.push({ d: bx.d, s: '<g class="st-eq-lbl st-eq-lbl--' + h.tone + '" aria-hidden="true"><text x="' + lp.x.toFixed(1) + '" y="' + lp.y.toFixed(1) + '">' + esc(it.label) + '</text></g>' });
        }
    });
    // Unidades del laboratorio (color = estado; la carrocería, la de su configuración)
    var look = scene.look || {};
    layout.spots.forEach(function(s) {
        if (s.area === 'lot') return;
        var list = model.bySpot[s.id] || [];
        list.forEach(function(e, i) {
            var r = s.rect, L = look[e.kind + ':' + e.id] || {};
            var cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2 + i * 0.35;
            var sel = opts.sel && opts.sel.kind === e.kind && String(opts.sel.id) === String(e.id);
            var mov = opts.moving && opts.moving.kind === e.kind && String(opts.moving.id) === String(e.id);
            var cls = 'st-car st-car--' + (L.tone || 'none') + (e.kind === 'unit' ? ' st-car--noalta' : '') + (L.master ? ' st-car--master' : '') + (sel ? ' st-car--sel' : '') + (mov ? ' st-car--moving' : '');
            var car = _siteCarSVG(ctx, cx, cy, s.nose < 0 ? Math.PI : 0, cls, ' data-' + e.kind + '="' + esc(e.id) + '" tabindex="0" role="button" aria-label="' + esc(L.aria || e.vin) + '"', L.aria || e.vin,
                                  { body: L.body, ring: sel ? 'sel' : e.kind === 'unit' ? 'noalta' : '' });
            solid.push(car);
            if (opts.labels !== false && L.short) {
                var lp = P(cx, cy, siteBodyHeight(L.body) + 0.5);
                over.push({ d: car.d, s: _sitePill(lp.x, lp.y, L.short, L.sub || '', 'st-pill--car st-pill--' + (L.tone || 'none') + (L.master ? ' st-pill--master' : ''), ls) });
            }
        });
    });
    // [3.17.0] La flota Master en el estacionamiento (con su color real). Si está adentro, su lugar
    // se ve vacío, con su huella punteada y dónde está.
    var pk = scene.parking, ml = scene.masterLook || {};
    if (layout.lot && pk) layout.lot.stalls.forEach(function(s) {
        (pk.byStall[s.id] || []).forEach(function(e, i) {
            var m = e.master, r = s.rect, cx = (r[0] + r[2]) / 2 + i * 0.3, cy = (r[1] + r[3]) / 2, ML = ml[m.id] || {};
            var sel = opts.sel && opts.sel.kind === 'master' && opts.sel.id === m.id;
            if (e.inLab) {
                floorL.push(_siteCarGhostSVG(P, cx, cy, s.heading, 'st-ghost' + (sel ? ' st-ghost--sel' : '')));
                if (opts.labels !== false) { var gp = P(cx, cy, 0.4); over.push({ d: gp.d, s: _sitePill(gp.x, gp.y, ML.short || m.vin, ML.sub || '', 'st-pill--ghost', ls) }); }
                return;
            }
            var mov = opts.moving && opts.moving.kind === 'master' && opts.moving.id === m.id;
            var paint = SITE_PAINTS[m.paint] || SITE_PAINTS.blanco;
            var car = _siteCarSVG(ctx, cx, cy, s.heading, 'st-car st-car--paint' + (sel ? ' st-car--sel' : '') + (mov ? ' st-car--moving' : ''),
                ' data-master="' + esc(m.id) + '" tabindex="0" role="button" aria-label="' + esc(ML.aria || m.vin) + '" style="--st-car:' + paint.hex + '"', ML.aria || m.vin,
                { body: m.body, ring: sel ? 'sel' : '' });
            solid.push(car);
            if (opts.labels !== false && ML.short) {
                var mp = P(cx, cy, siteBodyHeight(m.body) + 0.5);
                over.push({ d: car.d, s: _sitePill(mp.x, mp.y, ML.short, ML.sub || '', 'st-pill--car st-pill--master', ls) });
            }
        });
    });
    var byD = function(a, b) { return a.d - b.d; };
    solid.sort(byD); over.sort(byD);
    var box = _siteBox(layout, cam);
    var defs = '<defs>' +
        '<linearGradient id="st-g-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b5b73"/><stop offset="0.5" stop-color="#25334a"/><stop offset="1" stop-color="#151d2c"/></linearGradient>' +
        '<linearGradient id="st-g-glass-sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9bdd3"/><stop offset="0.45" stop-color="#55657d"/><stop offset="1" stop-color="#1e293b"/></linearGradient>' +
        '<linearGradient id="st-g-screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#0e7490"/></linearGradient>' +
        '<linearGradient id="st-g-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7fb"/><stop offset="1" stop-color="#d6dee8"/></linearGradient>' +
        '<linearGradient id="st-g-roller" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#475569"/><stop offset="0.5" stop-color="#e2e8f0"/><stop offset="1" stop-color="#475569"/></linearGradient>' +
        '<linearGradient id="st-g-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#8a97a8"/></linearGradient>' +
        '<radialGradient id="st-g-tree" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#8fd07a"/><stop offset="0.6" stop-color="#4d9a50"/><stop offset="1" stop-color="#2f6f3c"/></radialGradient>' +
        '</defs>';
    return { box: box, svg: defs + '<g class="rm-floor-layer" style="--ls:' + ls.toFixed(2) + '">' + floorL.join('') + '</g><g class="rm-solid-layer">' + solid.map(function(x) { return x.s; }).join('') +
             '</g><g class="rm-over-layer" style="--ls:' + ls.toFixed(2) + '">' + over.map(function(x) { return x.s; }).join('') + '</g>' };
}

/** El viewBox de la escena para una cámara. PURA. */
function _siteBox(layout, cam) {
    var C = siteCenter(layout), xs = [], ys = [];
    (layout.base || layout.floor).forEach(function(p) {
        [layout.base ? -0.45 : 0, 3.2].forEach(function(z) { var q = invRoomProject(p[0], p[1], z, cam, C); xs.push(q.x); ys.push(q.y); });
    });
    var pad = 40;
    return { x: Math.min.apply(null, xs) - pad, y: Math.min.apply(null, ys) - pad,
             w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + pad * 2, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + pad * 2 };
}

// ══════════════════════════════════════════════════════════════════════
// Estado y escritores (DOM / datos)
// ══════════════════════════════════════════════════════════════════════
var _site = { sel: null, moving: null, edit: false, cam: null, filter: null, layout: null, parking: null };

/** Siembra los equipos del plano UNA vez (`undefined` = nunca sembrado; [] = el laboratorio los quitó). */
function siteItemsEnsure() {
    if (typeof invState === 'undefined' || !invState) return false;
    if (Array.isArray(invState.siteItems)) return false;
    invState.siteItems = siteItemsSeed('');
    return true;
}

function _siteItemsLive() {
    return ((typeof invState !== 'undefined' && invState && invState.siteItems) || []).filter(function(i) { return i && !i.deleted; });
}
function _siteItem(id) { return ((typeof invState !== 'undefined' && invState.siteItems) || []).find(function(i) { return i && i.id === id; }) || null; }
function _siteUnits() { return ((typeof db !== 'undefined' && db && db.siteUnits) || []).filter(function(u) { return u && !u.deleted; }); }
function _siteVehicle(id) { return ((typeof db !== 'undefined' && db && db.vehicles) || []).find(function(v) { return v && String(v.id) === String(id); }) || null; }
function _siteWho() { return (typeof authState !== 'undefined' && authState.currentUser && authState.currentUser.name) || 'Sistema'; }
function _siteNow() { return new Date().toISOString(); }
function _siteSpotLabel(id) {
    var s = SITE_LAYOUT.spots.find(function(x) { return x.id === id; });
    if (s) return s.label;
    var k = SITE_STALL_RE.exec(String(id || ''));
    return k ? 'Estacionamiento P' + k[1] : (id || 'fuera del sitio');
}
function _siteMasters() { return ((typeof db !== 'undefined' && db && db.siteMasters) || []).filter(function(m) { return m && !m.deleted; }); }
function _siteMaster(id) { return ((typeof db !== 'undefined' && db && db.siteMasters) || []).find(function(m) { return m && m.id === id; }) || null; }
/** La unidad con alta EN CURSO de un VIN (la que se mueve al meter un Master al laboratorio). */
function _siteLiveByVin(vin) {
    var k = siteVinKey(vin);
    return ((typeof db !== 'undefined' && db && db.vehicles) || []).find(function(x) { return _siteLive(x) && siteVinKey(x.vin) === k; }) || null;
}
/** Las pruebas de un VIN en la plataforma, la más reciente primero (para la ventana de un Master). */
function _siteVinTests(vin) {
    var k = siteVinKey(vin);
    if (!k) return [];
    var dt = function(v) { return (typeof vehicleTestDate === 'function' && vehicleTestDate(v)) || String(v.registeredAt || '').slice(0, 10); };
    return ((typeof db !== 'undefined' && db && db.vehicles) || []).filter(function(v) { return v && siteVinKey(v.vin) === k; })
        .sort(function(a, b) { return dt(b) < dt(a) ? -1 : dt(b) > dt(a) ? 1 : 0; }).map(function(v) { return { v: v, date: dt(v) }; });
}

/** Guarda los cambios de un equipo del plano (el único escritor). Auditado con antes/después. */
function siteItemSave(id, patch, why) {
    if (typeof authRequire === 'function' && !authRequire('inventory.manage', 'acomodar los equipos del plano')) return false;
    var it = _siteItem(id);
    if (!it) return false;
    var snap = function() { return { label: it.label, x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1, h: it.h, shape: siteItemShape(it), front: siteItemFront(it), assetId: it.assetId || '', deleted: !!it.deleted }; };
    var before = snap();
    Object.keys(patch || {}).forEach(function(k) { it[k] = patch[k]; });
    it.updatedAt = _siteNow(); it.by = _siteWho();
    invSave();
    if (typeof auditLog === 'function') {
        auditLog('inventory', why || 'plano_equipo', { type: 'equipo-plano', id: it.id, label: it.label }, 'Equipo del plano: ' + it.label,
                 { before: before, after: snap() });
    }
    if (typeof fbPush === 'function' && typeof fbSync !== 'undefined' && fbSync.enabled) { try { fbPush('inventory', invState); } catch (e) {} }
    return true;
}

function siteItemAdd() {
    if (typeof authRequire === 'function' && !authRequire('inventory.manage', 'agregar un equipo al plano')) return;
    if (!Array.isArray(invState.siteItems)) invState.siteItems = [];
    var id = 'si-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    invState.siteItems.push({ id: id, label: 'Equipo nuevo', x0: 7, y0: 2.2, x1: 7.8, y1: 2.9, h: 1.2, color: '#94a3b8', shape: 'cabinet', front: 's', assetId: '', updatedAt: '', deleted: false });
    siteItemSave(id, {}, 'plano_equipo_alta');
    _site.sel = { kind: 'item', id: id };
    sitePaint();
}

/** Quita un equipo del plano (baja lógica: viaja al otro equipo y se puede deshacer). */
function siteItemDelete(id) {
    var it = _siteItem(id);
    if (!it) return;
    var run = function() {
        if (!siteItemSave(id, { deleted: true }, 'plano_equipo_baja')) return;
        _site.sel = null; sitePaint();
        if (typeof toastUndo === 'function') toastUndo('Se quitó "' + it.label + '" del plano.', function() { siteItemSave(id, { deleted: false }, 'plano_equipo_regresa'); sitePaint(); });
    };
    if (typeof showConfirm === 'function') showConfirm('¿Quitar "' + it.label + '" del plano? Se puede deshacer.', run, { title: 'Quitar equipo', type: 'warning', confirmText: 'Quitar' });
    else run();
}

/** Mueve / redimensiona / gira desde el panel. */
function siteItemNudge(id, op) {
    var it = _siteItem(id);
    if (!it) return;
    var w = it.x1 - it.x0, d = it.y1 - it.y0, cx = (it.x0 + it.x1) / 2, cy = (it.y0 + it.y1) / 2, p = {};
    if (op === 'rot') { p = { x0: cx - d / 2, x1: cx + d / 2, y0: cy - w / 2, y1: cy + w / 2 }; }   // el frente gira con él (abajo)
    else if (op === 'w+' || op === 'w-') { var nw = Math.max(0.2, w + (op === 'w+' ? 0.2 : -0.2)); p = { x0: cx - nw / 2, x1: cx + nw / 2 }; }
    else if (op === 'd+' || op === 'd-') { var nd = Math.max(0.2, d + (op === 'd+' ? 0.2 : -0.2)); p = { y0: cy - nd / 2, y1: cy + nd / 2 }; }
    else if (op === 'h+' || op === 'h-') { p = { h: Math.max(0.1, Math.round(((+it.h || 1) + (op === 'h+' ? 0.2 : -0.2)) * 10) / 10) }; }
    Object.keys(p).forEach(function(k) { p[k] = Math.round(p[k] * 100) / 100; });
    if (op === 'rot') p.front = SITE_FRONT_NEXT[siteItemFront(it)];
    if (siteItemSave(id, p, 'plano_equipo_forma')) sitePaint();
}

function siteItemRename(id) {
    var it = _siteItem(id);
    if (!it || typeof uiPrompt !== 'function') return;
    uiPrompt({ title: 'Nombre del equipo', label: 'Cómo se llama en el laboratorio', value: it.label, placeholder: 'Ej.: Analizador MEXA' }).then(function(v) {
        if (v == null) return;
        v = String(v).trim();
        if (!v) return;
        if (siteItemSave(id, { label: v.slice(0, 40) }, 'plano_equipo_nombre')) sitePaint();
    });
}

/** Cambia la forma con que se dibuja un equipo (solo el dibujo: el estado sale del F11). */
function siteItemSetShape(id, shape) {
    if (!SITE_SHAPES[shape]) return;
    if (siteItemSave(id, { shape: shape }, 'plano_equipo_forma')) sitePaint();
}

function siteItemLink(id, assetId) {
    if (siteItemSave(id, { assetId: assetId || '' }, 'plano_equipo_liga')) sitePaint();
}

/**
 * Pone (o quita, con spot = null) una unidad con alta en un lugar: el único escritor de
 * `vehicle.site`. Línea de tiempo + auditoría; viaja con el vehículo (su `_rev` cambia).
 */
function siteVehicleMove(vehicleId, spot) {
    if (typeof authRequire === 'function' && !authRequire('test.register', 'ubicar una unidad')) return false;
    var v = _siteVehicle(vehicleId);
    if (!v) return false;
    var from = v.site && v.site.spot || '';
    if ((spot || '') === from) return true;
    if (spot) v.site = { spot: spot, since: _siteNow(), by: _siteWho() };
    else delete v.site;
    v.timeline = v.timeline || [];
    v.timeline.push({ timestamp: _siteNow(), user: _siteWho(), action: spot ? 'Ubicada en ' + _siteSpotLabel(spot) : 'Salió del sitio (' + _siteSpotLabel(from) + ')',
                      data: { site: spot || null, from: from || null } });
    if (typeof saveDB === 'function') saveDB();
    if (typeof auditLog === 'function') {
        auditLog('cop15', 'unidad_ubicada', { type: 'vehicle', id: v.id, label: v.vin }, (spot ? _siteSpotLabel(spot) : 'fuera del sitio'),
                 { before: { lugar: from || null }, after: { lugar: spot || null } });
    }
    return true;
}

/** Unidad sin alta (solo VIN): alta, mover o quitar. `db.siteUnits` viaja en la meta de vehículos. */
function siteUnitSave(id, patch, why) {
    if (typeof authRequire === 'function' && !authRequire('test.register', 'ubicar una unidad')) return false;
    if (!db.siteUnits) db.siteUnits = [];
    var u = db.siteUnits.find(function(x) { return x && x.id === id; });
    var before = u ? { vin: u.vin, lugar: u.spot || null, deleted: !!u.deleted } : null;
    if (!u) { u = { id: id }; db.siteUnits.push(u); }
    Object.keys(patch || {}).forEach(function(k) { u[k] = patch[k]; });
    u.updatedAt = _siteNow(); u.by = _siteWho();
    if (typeof saveDB === 'function') saveDB();
    if (typeof auditLog === 'function') {
        auditLog('cop15', why || 'unidad_sin_alta', { type: 'unidad', id: u.id, label: u.vin }, (u.deleted ? 'Salió del sitio' : _siteSpotLabel(u.spot)),
                 { before: before, after: { vin: u.vin, lugar: u.spot || null, deleted: !!u.deleted } });
    }
    return true;
}

function siteUnitAddPrompt(spot) {
    if (typeof uiPrompt !== 'function') return;
    uiPrompt({ title: 'Unidad en ' + _siteSpotLabel(spot), label: 'VIN de la unidad (completo o como venga en la unidad)', placeholder: 'Ej.: KNAD…', value: '' }).then(function(vin) {
        if (vin == null) return;
        var k = siteVinKey(vin);
        if (k.length < 6) { if (typeof showToast === 'function') showToast('Escribe el VIN de la unidad (al menos 6 caracteres).', 'warning'); return; }
        var v = ((typeof db !== 'undefined' && db.vehicles) || []).find(function(x) { return _siteLive(x) && siteVinKey(x.vin) === k; });
        if (v) { if (siteVehicleMove(v.id, spot)) { _site.sel = { kind: 'veh', id: v.id }; sitePaint(); } return; }
        var id = 'su-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        if (siteUnitSave(id, { vin: k, spot: spot, since: _siteNow(), deleted: false }, 'unidad_sin_alta')) { _site.sel = { kind: 'unit', id: id }; sitePaint(); }
    });
}

/** Lleva una unidad sin alta a su alta (mismo VIN): el vehículo hereda el lugar. */
function siteUnitLinkAlta(unitId) {
    var u = _siteUnits().find(function(x) { return x.id === unitId; });
    if (!u) return;
    var k = siteVinKey(u.vin);
    var v = ((typeof db !== 'undefined' && db.vehicles) || []).find(function(x) { return _siteLive(x) && siteVinKey(x.vin) === k; });
    if (!v) return;
    if (siteVehicleMove(v.id, u.spot)) { siteUnitSave(u.id, { deleted: true }, 'unidad_ligada_alta'); _site.sel = { kind: 'veh', id: v.id }; sitePaint(); }
}

/** "Dar de alta": abre el Alta con el VIN ya escrito. Al registrarse, se liga desde el plano. */
function siteUnitStartAlta(unitId) {
    var u = _siteUnits().find(function(x) { return x.id === unitId; });
    if (u) _siteOpenAltaWithVin(u.vin);
}
function _siteOpenAltaWithVin(vin) {
    if (typeof dashGo === 'function') dashGo('cop15', 'alta');
    setTimeout(function() {
        var inp = document.getElementById('vin');
        if (inp) { inp.value = vin; inp.dispatchEvent(new Event('input', { bubbles: true })); try { inp.focus(); } catch (e) {} }
    }, 350);
}

// ── [3.17.0] La flota Master ─────────────────────────────────────────
/**
 * Un vehículo Master: alta, cambio o baja. El único escritor de `db.siteMasters` (viaja en la
 * meta de vehículos, como las unidades sin alta). Auditado con antes/después.
 */
function siteMasterSave(id, patch, why) {
    if (typeof authRequire === 'function' && !authRequire('test.register', 'administrar los vehículos Master')) return false;
    if (typeof db === 'undefined' || !db) return false;
    if (!db.siteMasters) db.siteMasters = [];
    var m = db.siteMasters.find(function(x) { return x && x.id === id; });
    var snap = function(x) { return x ? { vin: x.vin || '', nombre: x.name || '', carroceria: x.body || '', color: x.paint || '', lugar: x.spot || null, deleted: !!x.deleted } : null; };
    var before = snap(m), prev = m ? JSON.stringify(m) : null;
    if (!m) { m = { id: id }; db.siteMasters.push(m); }
    Object.keys(patch || {}).forEach(function(k) { m[k] = patch[k]; });
    m.updatedAt = _siteNow(); m.by = _siteWho();
    if (typeof saveDB === 'function' && saveDB() === false) {
        // No se guardó: se deshace en memoria para que la pantalla no diga algo que no quedó.
        if (prev) { Object.keys(m).forEach(function(k) { delete m[k]; }); Object.assign(m, JSON.parse(prev)); }
        else db.siteMasters.splice(db.siteMasters.indexOf(m), 1);
        return false;
    }
    if (typeof auditLog === 'function') {
        auditLog('cop15', why || 'master_cambio', { type: 'vehiculo-master', id: m.id, label: m.vin },
                 m.deleted ? 'Salió de la flota Master' : (m.name || m.vin) + ' · ' + _siteSpotLabel(m.spot), { before: before, after: snap(m) });
    }
    return true;
}

/** Da de alta un vehículo Master desde la ventana de un lugar libre del estacionamiento. */
function siteMasterAddFromPanel(stall) {
    var vinEl = document.getElementById('st-m-vin'), nameEl = document.getElementById('st-m-name');
    var bodyEl = document.getElementById('st-m-body'), paintEl = document.getElementById('st-m-paint');
    var k = siteVinKey(vinEl && vinEl.value);
    var bad = function(el, msg) { if (typeof uiInvalid === 'function') return uiInvalid(el, msg); if (typeof showToast === 'function') showToast(msg, 'error'); return false; };
    if (k.length < 6) return bad(vinEl, 'Escribe el VIN del vehículo (al menos 6 caracteres).');
    var dup = _siteMasters().find(function(x) { return siteVinKey(x.vin) === k; });
    if (dup) return bad(vinEl, 'Ese VIN ya está en la flota: ' + (dup.name || dup.vin) + ' (' + _siteSpotLabel(dup.spot) + ').');
    if (_siteMasters().some(function(x) { return x.spot === stall; })) return bad(vinEl, _siteSpotLabel(stall) + ' ya tiene un vehículo: elige otro lugar.');
    var id = 'sm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    var name = String((nameEl && nameEl.value) || '').trim().slice(0, 40);
    var body = bodyEl && SITE_BODIES[bodyEl.value] ? bodyEl.value : 'sedan', paint = paintEl && SITE_PAINTS[paintEl.value] ? paintEl.value : 'blanco';
    if (!siteMasterSave(id, { vin: k, name: name, body: body, paint: paint, spot: stall, since: _siteNow(), deleted: false }, 'master_alta')) return false;
    _site.sel = { kind: 'master', id: id };
    sitePaint();
    if (typeof showToast === 'function') showToast((name || k) + ' quedó en la flota Master (' + _siteSpotLabel(stall) + ').', 'success');
    return true;
}

/** Mientras se escribe el VIN: si la plataforma lo conoce, lo dice y propone su carrocería. */
function siteMasterVinHint(inp) {
    var out = document.getElementById('st-m-known'), bodyEl = document.getElementById('st-m-body');
    if (!out) return;
    var tests = siteVinKey(inp && inp.value).length >= 6 ? _siteVinTests(inp.value) : [];
    if (!tests.length) { out.textContent = ''; out.hidden = true; return; }
    var c = tests[0].v.config || {};
    out.hidden = false;
    out.textContent = 'Conocido en la plataforma: ' + [c.Modelo, c['BODY TYPE'], c['MODEL YEAR (VIN)']].filter(Boolean).join(' · ') + ' · ' + tests.length + ' prueba' + (tests.length > 1 ? 's' : '');
    var b = siteBodyFromConfig(c);
    if (b && bodyEl && !bodyEl.dataset.touched) bodyEl.value = b;
}

function siteMasterRename(id) {
    var m = _siteMaster(id);
    if (!m || typeof uiPrompt !== 'function') return;
    uiPrompt({ title: 'Nombre del vehículo Master', label: 'Cómo le dicen en el laboratorio (opcional)', value: m.name || '', placeholder: 'Ej.: Master de correlación K4' }).then(function(v) {
        if (v == null) return;
        if (siteMasterSave(id, { name: String(v).trim().slice(0, 40) }, 'master_nombre')) sitePaint();
    });
}
function siteMasterSetBody(id, body) { if (SITE_BODIES[body] && siteMasterSave(id, { body: body }, 'master_cambio')) sitePaint(); }
function siteMasterSetPaint(id, paint) { if (SITE_PAINTS[paint] && siteMasterSave(id, { paint: paint }, 'master_cambio')) sitePaint(); }

/** Quita un vehículo de la flota (baja lógica: viaja a los demás equipos y se puede deshacer). */
function siteMasterRemove(id) {
    var m = _siteMaster(id);
    if (!m) return;
    var who = m.name || m.vin;
    var run = function() {
        if (!siteMasterSave(id, { deleted: true }, 'master_baja')) return;
        _site.sel = null; sitePaint();
        if (typeof toastUndo === 'function') toastUndo(who + ' salió de la flota Master.', function() { siteMasterSave(id, { deleted: false }, 'master_regresa'); sitePaint(); });
    };
    if (typeof showConfirm === 'function') showConfirm('¿Quitar ' + who + ' de la flota Master? Sus pruebas no se tocan; se puede deshacer.', run, { title: 'Quitar de la flota', type: 'warning', confirmText: 'Quitar' });
    else run();
}

/** Empezar una prueba con un Master: el Alta con su VIN ya escrito. */
function siteMasterStartTest(id) { var m = _siteMaster(id); if (m) _siteOpenAltaWithVin(m.vin); }

function siteMoveStart(kind, id) { _site.moving = { kind: kind, id: id }; sitePaint(); }
function siteMoveCancel() { _site.moving = null; sitePaint(); }

/**
 * Termina de mover a un lugar. Una unidad del laboratorio va a un cajón libre o al dinamómetro;
 * un Master, a otro lugar del estacionamiento o ADENTRO (su unidad con alta se mueve; si no
 * tiene, queda como unidad sin alta con su VIN). Del laboratorio al estacionamiento: si el VIN es
 * de la flota regresa a su lugar; si no, se ofrece agregarlo.
 */
function siteMoveTo(spot) {
    var m = _site.moving;
    if (!m) return;
    var warn = function(msg) { if (typeof showToast === 'function') showToast(msg, 'warning'); };
    if (spot && siteIsStall(spot)) return _siteMoveToStall(m, spot);
    if (m.kind === 'master') {
        var mm = _siteMaster(m.id);
        if (!mm) { _site.moving = null; sitePaint(); return; }
        if (!spot) { warn('Un vehículo Master siempre tiene su lugar en el estacionamiento: tócalo para dejarlo ahí.'); return; }
        if ((_site.model && _site.model.bySpot[spot] || []).length) { warn(_siteSpotLabel(spot) + ' ya tiene una unidad: muévela primero.'); return; }
        var v = _siteLiveByVin(mm.vin), uid = 'su-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        var ok2 = v ? siteVehicleMove(v.id, spot) : siteUnitSave(uid, { vin: siteVinKey(mm.vin), spot: spot, since: _siteNow(), deleted: false }, 'unidad_sin_alta');
        _site.moving = null;
        if (ok2) _site.sel = v ? { kind: 'veh', id: v.id } : { kind: 'unit', id: uid };
        sitePaint();
        return;
    }
    var busy = (_site.model && _site.model.bySpot[spot] || []).length;
    if (busy && spot) { warn(_siteSpotLabel(spot) + ' ya tiene una unidad: muévela primero.'); return; }
    var ok = m.kind === 'veh' ? siteVehicleMove(m.id, spot) : siteUnitSave(m.id, spot ? { spot: spot, since: _siteNow() } : { deleted: true }, 'unidad_sin_alta');
    _site.moving = null;
    if (ok) _site.sel = spot ? { kind: m.kind, id: m.id } : null;
    sitePaint();
}

function _siteMoveToStall(m, stall) {
    var pk = _site.parking || { byStall: {}, byVin: {} };
    var entry = m.kind === 'master' ? null : ((_site.model && _site.model.entries) || []).find(function(x) { return x.kind === m.kind && String(x.id) === String(m.id); });
    // El lugar está libre para el mismo Master (o para la unidad que ES ese Master y regresa).
    var mine = m.kind === 'master' ? m.id : entry && pk.byVin[siteVinKey(entry.vin)] ? pk.byVin[siteVinKey(entry.vin)].id : null;
    if ((pk.byStall[stall] || []).some(function(e) { return e.master.id !== mine; })) {
        if (typeof showToast === 'function') showToast(_siteSpotLabel(stall) + ' ya tiene un vehículo Master: muévelo primero.', 'warning');
        return;
    }
    if (m.kind === 'master') {
        var ok = siteMasterSave(m.id, { spot: stall }, 'master_mueve');
        _site.moving = null;
        if (ok) _site.sel = { kind: 'master', id: m.id };
        sitePaint();
        return;
    }
    // Una unidad del laboratorio sale al estacionamiento.
    if (!entry) { _site.moving = null; sitePaint(); return; }
    var k = siteVinKey(entry.vin), master = pk.byVin[k];
    var leave = function() { return m.kind === 'veh' ? siteVehicleMove(m.id, null) : siteUnitSave(m.id, { deleted: true }, 'unidad_sin_alta'); };
    if (master) {
        if (leave() && siteMasterSave(master.id, { spot: stall }, 'master_regresa')) _site.sel = { kind: 'master', id: master.id };
        _site.moving = null; sitePaint();
        return;
    }
    var add = function() {
        var v = m.kind === 'veh' ? _siteVehicle(m.id) : null;
        var id = 'sm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        if (leave() && siteMasterSave(id, { vin: k, name: '', body: (v && siteBodyFromConfig(v.config)) || 'sedan', paint: 'blanco', spot: stall, since: _siteNow(), deleted: false }, 'master_alta')) _site.sel = { kind: 'master', id: id };
        _site.moving = null; sitePaint();
    };
    if (typeof showConfirm === 'function') {
        showConfirm('Los lugares de afuera son de la flota Master (los vehículos que se quedan con el laboratorio). ¿Agregar ' + (entry.vin || 'esta unidad') + ' a la flota en ' + _siteSpotLabel(stall) + '? Sale de ' + _siteSpotLabel(entry.spot) + '.',
                    add, { title: 'Agregar a la flota Master', confirmText: 'Agregar' });
    } else add();
}

// ══════════════════════════════════════════════════════════════════════
// Pantalla
// ══════════════════════════════════════════════════════════════════════
function _siteNarrow() { return typeof window !== 'undefined' && window.innerWidth < 700; }
function _siteCam() {
    if (!_site.cam) {
        var saved = typeof uiPref === 'function' ? uiPref('roomCamLab') : null;
        _site.cam = invRoomCamNormalize(saved || SITE_CAM_DEFAULT, false);
        if (!saved && _siteNarrow()) _site.cam = invRoomCamNormalize(SITE_CAM_NARROW, false);
    }
    return _site.cam;
}
var _siteCamT = null;
function _siteCamSave() {
    clearTimeout(_siteCamT);
    var cam = _site.cam;
    _siteCamT = setTimeout(function() { try { if (typeof uiPref === 'function') uiPref('roomCamLab', cam); } catch (e) {} }, 400);
}

/** Cómo se llama un Master en su etiqueta (corto: los lugares están juntos). */
function _siteMasterShort(m) {
    var n = String((m && m.name) || '').trim();
    return n ? (n.length > 16 ? n.slice(0, 15) + '…' : n) : '…' + String((m && m.vin) || '').slice(-6);
}

/**
 * Lo que se pinta de cada unidad (de las definiciones de siempre: etapa, soak, siguiente paso).
 * [3.17.0] Con `parking`, una unidad cuyo VIN es de la flota Master lo dice; la carrocería sale de
 * su configuración (o de la ficha del Master si no tiene alta).
 */
function _siteLook(model, parking) {
    var look = {}, now = Date.now(), byVin = (parking && parking.byVin) || {};
    model.entries.forEach(function(e) {
        var master = byVin[siteVinKey(e.vin)] || null;
        if (e.kind === 'unit') {
            look['unit:' + e.id] = { tone: 'noalta', short: master ? _siteMasterShort(master) : '…' + String(e.vin).slice(-6),
                                     sub: (master ? '★ Master · ' : '') + (e.altaId != null ? 'ya tiene alta' : 'sin alta'), master: master ? master.id : '',
                                     body: master && SITE_BODIES[master.body] ? master.body : 'sedan',
                                     aria: (master ? 'Vehículo Master ' : 'Unidad ') + e.vin + ' sin alta en la plataforma, ' + _siteSpotLabel(e.spot) };
            return;
        }
        var v = e.vehicle;
        var st = typeof cascadeVehicleStage === 'function' ? cascadeVehicleStage(v) : null;
        var cfg = typeof _tpVehicleCfg === 'function' ? _tpVehicleCfg(v) : null;
        var hours = typeof tpSoakHoursFor === 'function' ? tpSoakHoursFor(cfg).hours : 12;
        var soak = siteSoakStatus(v.testData, hours, now);
        var tone = v.status === 'archived' ? 'done' : v.status === 'pending-approval' ? 'wait' : soak.state === 'reposando' ? 'soak' : soak.state === 'listo' ? 'ready' : 'work';
        var sub = soak.state === 'reposando' ? 'reposo: faltan ' + (soak.leftH >= 1 ? Math.ceil(soak.leftH) + ' h' : Math.ceil(soak.leftH * 60) + ' min')
                : v.status === 'archived' ? 'liberada' : st ? st.label : '';
        if (soak.state === 'listo' && e.spot !== 'dino' && _siteLive(v)) sub = 'lista para probar';
        look['veh:' + e.id] = { tone: tone, short: '…' + String(v.vin || '').slice(-6) + ' · ' + ((v.config && v.config.Modelo) || ''), sub: (master ? '★ Master · ' : '') + sub, soak: soak.state, leftH: soak.leftH,
                                master: master ? master.id : '', body: siteBodyFromConfig(v.config) || (master && SITE_BODIES[master.body] ? master.body : 'sedan'),
                                aria: (master ? 'Vehículo Master ' : 'Unidad ') + (v.vin || '') + ', ' + _siteSpotLabel(e.spot) + (sub ? ', ' + sub : '') };
    });
    return look;
}

/** Lo que se pinta de cada Master en el estacionamiento (etiqueta corta; dónde está si está adentro). */
function _siteMasterLook(parking) {
    var out = {};
    ((parking && parking.list) || []).forEach(function(e) {
        var m = e.master, body = SITE_BODIES[m.body] || SITE_BODIES.sedan, paint = SITE_PAINTS[m.paint] || SITE_PAINTS.blanco;
        out[m.id] = { short: _siteMasterShort(m), sub: e.inLab ? 'adentro: ' + _siteSpotLabel(e.inLab.spot) : '',
                      aria: 'Vehículo Master ' + (m.name ? m.name + ', ' : '') + 'VIN ' + m.vin + ', ' + body.label + ' ' + paint.label.toLowerCase() + ', ' +
                            (e.inLab ? 'ahora en ' + _siteSpotLabel(e.inLab.spot) : _siteSpotLabel(m.spot)) };
    });
    return out;
}

function _siteHealth(items) {
    var eq = (typeof invState !== 'undefined' && invState.equipment) || [];
    var assets = {};
    ((typeof invState !== 'undefined' && invState.assets) || []).forEach(function(a) { if (a && a.id) assets[a.id] = a.name || a.id; });
    var mt = {};
    try {
        (typeof invMaintOverdue === 'function' ? invMaintOverdue() : []).forEach(function(r) {
            var aid = r.asset && (r.asset.id || r.asset);
            if (aid) mt[aid] = (mt[aid] || 0) + 1;
        });
    } catch (e) {}
    var ctx = { calWorst: siteCalWorstByAsset(eq, typeof invCalStatus === 'function' ? invCalStatus : null), mttoOverdue: mt, assets: assets };
    var out = {};
    items.forEach(function(it) { out[it.id] = siteItemHealth(it, ctx); });
    return out;
}

/** Punto de entrada: el mapa del laboratorio dentro de `el` (desde el selector del cuarto). */
function siteRender(el) {
    if (!el) return;
    siteItemsEnsure();
    var canEdit = typeof authCan !== 'function' || authCan('inventory.manage');
    var sw = typeof _invRoomSwitchHTML === 'function' ? _invRoomSwitchHTML() : '';
    el.innerHTML =
        '<div class="rm-wrap rm-dash rm-room--lab" id="st-wrap">' +
          '<div class="rm-stage st-stage" id="st-stage">' +
            '<svg class="rm-svg" id="st-svg" role="application" aria-label="Plano del laboratorio: celda de pruebas, cuarto de acondicionamiento y el estacionamiento de los vehículos Master. Toca un equipo o una unidad para ver su estado." preserveAspectRatio="xMidYMid meet"><g id="st-cam"></g></svg>' +
            '<div class="rm-bar" id="st-bar">' + sw +
              '<div class="rm-kpis" id="st-kpis" role="group" aria-label="Indicadores del laboratorio"></div>' +
              '<div class="rm-top-actions">' +
                '<button type="button" class="rm-bar-btn' + (_site.edit ? ' rm-bar-btn--on' : '') + '" id="st-edit-btn" onclick="siteToggleEdit()" aria-pressed="' + _site.edit + '" title="Acomodar, nombrar y ligar los equipos al F11">✏️ ' + (_site.edit ? 'Listo' : 'Editar plano') + '</button>' +
                (_site.edit ? '<button type="button" class="rm-bar-btn" onclick="siteItemAdd()" title="Agregar un equipo al plano">＋ Equipo</button>' : '') +
              '</div>' +
            '</div>' +
            '<div class="rm-ctrl" role="toolbar" aria-label="Cámara">' +
              '<button type="button" onclick="siteZoomBy(1.25)" aria-label="Acercar" title="Acercar">＋</button>' +
              '<button type="button" onclick="siteZoomBy(0.8)" aria-label="Alejar" title="Alejar">－</button>' +
              '<button type="button" onclick="siteRotate(-15)" aria-label="Girar a la izquierda" title="Girar">⟲</button>' +
              '<button type="button" onclick="siteRotate(15)" aria-label="Girar a la derecha" title="Girar">⟳</button>' +
              '<button type="button" onclick="siteTilt(10)" aria-label="Ver más desde arriba" title="Más desde arriba">▲</button>' +
              '<button type="button" onclick="siteTilt(-10)" aria-label="Ver más de lado" title="Más de lado">▼</button>' +
              '<button type="button" onclick="siteResetCam()" aria-label="Vista inicial" title="Vista inicial">⌂</button>' +
            '</div>' +
            '<div class="rm-moving" id="st-moving" hidden></div>' +
            '<div class="rm-pop-host" id="st-panel" hidden></div>' +
            '<div class="rm-foot"><div class="rm-legend" aria-hidden="true">' +
              [['work', 'en proceso'], ['soak', 'reposando'], ['ready', 'lista para probar'], ['wait', 'por aprobar'], ['noalta', 'sin alta']].map(function(k) {
                  return '<span><i class="st-lg st-lg--' + k[0] + '"></i>' + k[1] + '</span>'; }).join('') +
              '<span class="rm-legend-sep"></span><span><i class="st-lg st-lg--bad"></i>equipo con algo vencido</span>' +
              '<span class="rm-legend-sep"></span><span><i class="st-lg st-lg--master"></i>Master (con su color)</span>' +
            '</div></div>' +
          '</div>' +
          '<p class="rm-hintline" data-help="site-help">' + (SITE_LAYOUT.provisional ? 'Plano provisional, leído de las fotos del laboratorio. ' : '') +
            (_siteNarrow() ? 'Pellizca para acercar · toca un cajón para poner una unidad · toca un lugar de afuera para agregar un vehículo Master'
                           : 'Rueda = acercar · arrastra el piso para mover la vista · toca un cajón para poner una unidad · toca un lugar del estacionamiento para agregar un vehículo Master · toca un equipo para ver su estado') +
            (canEdit ? '' : ' · Acomodar equipos pide el permiso de Consumibles.') + '</p>' +
        '</div>';
    _siteFitStage();
    sitePaint();
    _siteBindStage();
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function _siteFitStage() {
    // [3.17.0] La misma medida que el cuarto de gases: el tablero cabe entre la barra de arriba y la
    // de abajo y la página se desliza hasta él (antes quedaba más alto que la pantalla).
    if (typeof _invRoomFitStage === 'function') { _invRoomFitStage('st-stage', 'st-wrap'); return; }
    var st = document.getElementById('st-stage');
    if (!st) return;
    var nav = document.querySelector('.bottom-nav');
    var navH = nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0;
    st.style.height = Math.max(_siteNarrow() ? 420 : 480, Math.min(1100, Math.round(window.innerHeight - navH - 140))) + 'px';
}

/** Repinta escena, franja y panel (conserva la cámara). */
function sitePaint() {
    var svg = document.getElementById('st-svg');
    if (!svg) return;
    var items = _siteItemsLive();
    var model = siteSpotsModel((typeof db !== 'undefined' && db.vehicles) || [], _siteUnits());
    if (_site.sel && _site.sel.kind === 'item' && !_siteItem(_site.sel.id)) _site.sel = null;
    // [3.17.0] El estacionamiento crece con la flota (siempre queda un lugar libre).
    var masters = _siteMasters();
    if (_site.sel && _site.sel.kind === 'master' && !masters.some(function(m) { return m.id === _site.sel.id; })) _site.sel = null;
    _site.layout = siteLayout(siteLotCount(masters));
    _site.parking = siteParkingModel(masters, model, _site.layout.lot.stalls.map(function(s) { return s.id; }));
    _site.model = model; _site.items = items;
    _site.look = _siteLook(model, _site.parking);
    _site.masterLook = _siteMasterLook(_site.parking);
    _site.health = _siteHealth(items);
    _sitePaintScene();
    _sitePaintKpis();
    _sitePaintMoving();
    sitePanelPaint();
    var eb = document.getElementById('st-edit-btn');
    if (eb) eb.setAttribute('aria-pressed', String(_site.edit));
}

function _sitePaintScene() {
    var svg = document.getElementById('st-svg'), g = document.getElementById('st-cam');
    if (!svg || !g) return;
    var cam = _siteCam(), layout = _site.layout || siteLayout(SITE_LOT.min);
    // La letra se escala con la pantalla: el plano entero cabe en el tablero y la etiqueta de una
    // unidad debe leerse sin acercar (≈ 12 px a la vista inicial).
    var bx = _siteBox(layout, cam), cw = svg.clientWidth || 1000, ch = svg.clientHeight || 600;
    var ls = Math.max(0.9, Math.min(2.8, Math.max(bx.w / cw, bx.h / ch) / 1.65));
    var out = siteSceneSVG({ layout: layout, items: _site.items, model: _site.model, look: _site.look, health: _site.health, parking: _site.parking, masterLook: _site.masterLook }, cam,
                           { sel: _site.sel, moving: _site.moving, edit: _site.edit, labels: true, ls: ls });
    _site.box = out.box;
    svg.setAttribute('viewBox', out.box.x.toFixed(1) + ' ' + out.box.y.toFixed(1) + ' ' + out.box.w.toFixed(1) + ' ' + out.box.h.toFixed(1));
    g.innerHTML = out.svg;
    _siteApplyCam();
}

function _siteApplyCam() {
    var g = document.getElementById('st-cam'), b = _site.box;
    if (!g || !b) return;
    var cam = _siteCam(), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    g.setAttribute('transform', 'translate(' + (cx + cam.panX).toFixed(1) + ' ' + (cy + cam.panY).toFixed(1) + ') scale(' + cam.zoom.toFixed(3) + ') translate(' + (-cx).toFixed(1) + ' ' + (-cy).toFixed(1) + ')');
}

function _sitePaintKpis() {
    var host = document.getElementById('st-kpis');
    if (!host) return;
    var k = siteKpis(_site.model, _site.look, _site.items, _site.health, _site.parking);
    var t = function(icon, v, l, tone, title) {
        return '<span class="rm-kpi rm-kpi--' + tone + ' rm-kpi--static" title="' + _invRoomEsc(title) + '"><span class="rm-kpi-ico" aria-hidden="true">' + icon + '</span><b class="rm-kpi-v">' + v + '</b><span class="rm-kpi-l">' + l + '</span></span>';
    };
    var pk = _site.parking || { conflicts: [], unplaced: [], dupVins: [] };
    var nDup = (pk.dupVins || []).length;
    host.innerHTML =
        t('🚗', k.onSite, 'En sitio', 'info', k.withAlta + ' con alta · ' + k.noAlta + ' sin alta') +
        t('⏳', k.soaking, 'Reposando', k.soaking ? 'info' : 'ok', k.nextLeftH != null ? 'La próxima termina en ' + Math.ceil(k.nextLeftH) + ' h' : 'Nadie reposando') +
        t('✅', k.ready, 'Listas', k.ready ? 'warn' : 'ok', 'Terminaron su reposo y esperan prueba') +
        t('⚙', k.dino, 'En dino', 'info', 'Unidad sobre el dinamómetro') +
        t('🔧', k.eqBad, 'Equipos', k.eqBad ? 'bad' : k.eqWarn ? 'warn' : 'ok', k.eqBad + ' con algo vencido · ' + k.eqWarn + ' por revisar · ' + k.eqNone + ' sin ligar al F11') +
        // [3.17.0] La flota Master: un toque lleva la vista al estacionamiento.
        '<button type="button" class="rm-kpi rm-kpi--info st-kpi-lot" onclick="siteFocusLot()" title="' + _invRoomEsc(k.masters + ' en la flota · ' + k.mastersIn + ' adentro del laboratorio · toca para ver el estacionamiento') + '">' +
          '<span class="rm-kpi-ico" aria-hidden="true">🅿</span><b class="rm-kpi-v">' + k.masters + '</b><span class="rm-kpi-l">Master</span></button>' +
        // Lo que no cuadra se DECLARA: dos unidades en un mismo lugar, o un lugar que el plano no tiene.
        ((_site.model.conflicts || []).length || (_site.model.unknown || []).length || pk.conflicts.length || pk.unplaced.length || nDup
            ? t('⚠', (_site.model.conflicts || []).length + (_site.model.unknown || []).length + pk.conflicts.length + pk.unplaced.length + nDup, 'Revisar', 'bad',
                (_site.model.conflicts || []).concat(pk.conflicts).map(_siteSpotLabel).join(', ') + ((_site.model.conflicts || []).length || pk.conflicts.length ? ': más de una unidad. ' : '') +
                ((_site.model.unknown || []).length ? (_site.model.unknown || []).map(function(e) { return e.vin; }).join(', ') + ': en un lugar que el plano no tiene. ' : '') +
                (pk.unplaced.length ? pk.unplaced.map(function(e) { return e.master.name || e.master.vin; }).join(', ') + ': Master sin lugar en el estacionamiento. ' : '') +
                (nDup ? pk.dupVins.join(', ') + ': el mismo VIN está dos veces en la flota (quita uno).' : ''))
            : '');
}

function _sitePaintMoving() {
    var m = document.getElementById('st-moving');
    if (!m) return;
    if (!_site.moving) { m.hidden = true; m.innerHTML = ''; return; }
    m.hidden = false;
    var master = _site.moving.kind === 'master';
    m.innerHTML = '<span>↔ ' + (master ? 'Toca otro lugar del estacionamiento, o un cajón o el dinamómetro para meterlo al laboratorio'
                                       : 'Toca un cajón libre, el dinamómetro o un lugar del estacionamiento') + '</span>' +
        (master ? '' : '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteMoveTo(null)">Sacar del sitio</button>') +
        '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteMoveCancel()">✕ Cancelar</button>';
}

function siteToggleEdit() {
    if (!_site.edit && typeof authRequire === 'function' && !authRequire('inventory.manage', 'acomodar los equipos del plano')) return;
    _site.edit = !_site.edit;
    var host = document.getElementById('st-wrap');
    if (host && host.parentNode) siteRender(host.parentNode);
}

function siteClose() { _site.sel = null; sitePaint(); }

// ── Ventana flotante ─────────────────────────────────────────────────
function sitePanelPaint() {
    var host = document.getElementById('st-panel');
    if (!host) return;
    var s = _site.sel, html = '';
    if (s && s.kind === 'item') html = _siteItemPanelHTML(s.id);
    else if (s && (s.kind === 'veh' || s.kind === 'unit')) html = _siteUnitPanelHTML(s.kind, s.id);
    else if (s && s.kind === 'master') html = _siteMasterPanelHTML(s.id);
    else if (s && s.kind === 'spot') html = siteIsStall(s.id) ? _siteStallPanelHTML(s.id) : _siteSpotPanelHTML(s.id);
    if (!html) { host.hidden = true; host.innerHTML = ''; delete host.dataset.key; return; }
    // [3.17.0] Lo tecleado y no guardado sobrevive a un repintado de la MISMA ventana (un sync
    // que llega a media escritura no lo borra; misma regla que el cuarto de gases, 3.14.1).
    var key = s.kind + ':' + s.id, same = host.dataset.key === key;
    var keep = same && typeof _invRoomPanelKeep === 'function' ? _invRoomPanelKeep(host, key) : null;
    var opened = same ? Array.prototype.map.call(host.querySelectorAll('details'), function(d) { return d.open; }) : [];   // "Editar" sigue abierto
    host.dataset.key = key;
    host.hidden = false; host.innerHTML = html;
    Array.prototype.forEach.call(host.querySelectorAll('details'), function(d, i) { if (opened[i]) d.open = true; });
    if (typeof uiChipsEnhance === 'function') { try { uiChipsEnhance(host); } catch (e) {} }
    if (keep) {
        Object.keys(keep.values).forEach(function(id) { var el = document.getElementById(id); if (el && host.contains(el)) el.value = keep.values[id]; });
        var f = keep.focus && document.getElementById(keep.focus);
        if (f && host.contains(f)) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } try { if (keep.start != null) f.setSelectionRange(keep.start, keep.end); } catch (e) {} }
    }
    if (!_siteNarrow()) { host.style.left = ''; host.style.right = '12px'; host.style.top = '64px'; }
}

/** Ventana de un lugar del estacionamiento: el Master que lo ocupa, o el alta de uno nuevo. */
function _siteStallPanelHTML(stall) {
    var pk = _site.parking || { byStall: {} }, list = pk.byStall[stall] || [], e = _invRoomEsc;
    if (list.length === 1) return _siteMasterPanelHTML(list[0].master.id);
    var html = '<div class="rm-panel rm-pop" role="region" aria-label="' + e(_siteSpotLabel(stall)) + '">' + _sitePanelHead('Estacionamiento', _siteSpotLabel(stall) + (list.length ? '' : ' · libre'));
    if (list.length > 1) {
        html += '<div class="st-health st-health--bad">Hay ' + list.length + ' vehículos Master en este lugar: mueve los que no estén aquí.</div>' +
                '<ul class="st-inst">' + list.map(function(x) { return '<li><button type="button" class="tp-btn tp-btn-ghost" onclick="siteSelect(\'master\',\'' + e(x.master.id) + '\')">' + e(x.master.name || x.master.vin) + '</button></li>'; }).join('') + '</ul>';
        return html + '</div>';
    }
    var opt = function(map, sel) { return Object.keys(map).map(function(k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + e(map[k].label) + '</option>'; }).join(''); };
    html += '<p class="st-hint">Lugar para un vehículo <b>Master</b>: los que se quedan con el laboratorio (no de producción). Aquí siempre se ven, aunque no estén en prueba.</p>' +
        '<div class="st-form">' +
          '<label class="st-field" for="st-m-vin">VIN<input id="st-m-vin" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ej.: KNAD…" oninput="siteMasterVinHint(this)"></label>' +
          '<p class="st-hint st-known" id="st-m-known" hidden></p>' +
          '<label class="st-field" for="st-m-name">Nombre (opcional)<input id="st-m-name" type="text" maxlength="40" placeholder="Ej.: Master de correlación K4"></label>' +
          '<label class="st-field">Carrocería<select id="st-m-body" data-chips onchange="this.dataset.touched=1">' + opt(SITE_BODIES, 'sedan') + '</select></label>' +
          '<label class="st-field">Color<select id="st-m-paint" data-chips>' + opt(SITE_PAINTS, 'blanco') + '</select></label>' +
        '</div>' +
        '<div class="st-tools"><button type="button" class="tp-btn tp-btn-primary" onclick="siteMasterAddFromPanel(\'' + stall + '\')">＋ Agregar a la flota Master</button></div>';
    return html + '</div>';
}

/** Ventana de un vehículo Master: quién es, dónde está, sus pruebas y qué hacer. */
function _siteMasterPanelHTML(id) {
    var m = _siteMaster(id);
    if (!m || m.deleted) return '';
    var e = _invRoomEsc, q = "'" + e(id) + "'";
    var pe = ((_site.parking && _site.parking.list) || []).find(function(x) { return x.master.id === id; }) || {};
    var body = SITE_BODIES[m.body] || SITE_BODIES.sedan, paint = SITE_PAINTS[m.paint] || SITE_PAINTS.blanco;
    var html = '<div class="rm-panel rm-pop" role="region" aria-label="Vehículo Master ' + e(m.name || m.vin) + '">' + _sitePanelHead('Vehículo Master · ' + _siteSpotLabel(m.spot), m.name || m.vin);
    html += '<div class="st-unit-sub">' + e([m.name ? m.vin : '', body.label, paint.label].filter(Boolean).join(' · ')) + '</div>';
    if (pe.inLab) {
        html += '<div class="st-health st-health--warn">Ahora está adentro: ' + e(_siteSpotLabel(pe.inLab.spot)) + '. ' +
                '<button type="button" class="tp-btn tp-btn-ghost st-inline-btn" onclick="siteSelect(\'' + pe.inLab.kind + '\',\'' + e(String(pe.inLab.id)) + '\')">Ver allá</button></div>';
    }
    var tests = _siteVinTests(m.vin);
    if (tests.length) {
        var lbl = function(v) { return typeof uiLabel === 'function' ? uiLabel('purpose', v.purpose) : (v.purpose || ''); };
        var stl = function(v) { return (typeof CONFIG !== 'undefined' && CONFIG.statusLabels && CONFIG.statusLabels[v.status]) || v.status || ''; };
        html += '<div class="st-row"><span>Pruebas con este VIN</span><b>' + tests.length + '</b></div><ul class="st-inst">' + tests.slice(0, 3).map(function(t) {
            var go = typeof fichaOpen === 'function' ? 'fichaOpen(\'vehiculo\',\'' + e(String(t.v.id)) + '\')' : 'v7GoToVehicle(\'' + e(String(t.v.id)) + '\')';
            return '<li><button type="button" class="st-link" onclick="' + go + '">' + e(t.date || 'sin fecha') + '</button><span>' + e([lbl(t.v), stl(t.v)].filter(Boolean).join(' · ')) + '</span></li>';
        }).join('') + (tests.length > 3 ? '<li><span>… y ' + (tests.length - 3) + ' más</span></li>' : '') + '</ul>';
    } else {
        html += '<p class="st-hint">Todavía no hay pruebas con este VIN en la plataforma.</p>';
    }
    var opt = function(map, sel) { return Object.keys(map).map(function(k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + e(map[k].label) + '</option>'; }).join(''); };
    html += '<div class="st-tools">' +
        (pe.inLab ? '' : '<button type="button" class="tp-btn tp-btn-primary" onclick="siteMasterStartTest(' + q + ')" title="Abre el Alta con su VIN">🧪 Empezar una prueba</button>') +
        '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteMoveStart(\'master\',' + q + ')" title="A otro lugar de afuera, o adentro a un cajón o al dinamómetro">↔ Mover</button></div>' +
        '<details class="rm-more st-more"><summary>Editar</summary>' +
          '<label class="st-field">Carrocería<select data-chips onchange="siteMasterSetBody(' + q + ', this.value)">' + opt(SITE_BODIES, SITE_BODIES[m.body] ? m.body : 'sedan') + '</select></label>' +
          '<label class="st-field">Color<select data-chips onchange="siteMasterSetPaint(' + q + ', this.value)">' + opt(SITE_PAINTS, SITE_PAINTS[m.paint] ? m.paint : 'blanco') + '</select></label>' +
          '<div class="st-tools"><button type="button" class="tp-btn tp-btn-ghost" onclick="siteMasterRename(' + q + ')">✎ Nombre</button>' +
          '<button type="button" class="tp-btn tp-btn-ghost st-danger" onclick="siteMasterRemove(' + q + ')">🗑 Quitar de la flota</button></div>' +
        '</details>';
    return html + '</div>';
}

function _sitePanelHead(kicker, title) {
    return '<div class="rm-panel-head"><div><div class="rm-panel-kicker">' + _invRoomEsc(kicker) + '</div><div class="rm-panel-title">' + _invRoomEsc(title) + '</div></div>' +
           '<button type="button" class="rm-x" onclick="siteClose()" aria-label="Cerrar">✕</button></div>';
}

function _siteItemPanelHTML(id) {
    var it = _siteItem(id);
    if (!it || it.deleted) return '';
    var h = (_site.health || {})[id] || { tone: 'none', text: '' };
    var e = _invRoomEsc, q = "'" + e(id) + "'";
    var html = '<div class="rm-panel rm-pop" role="region" aria-label="Equipo ' + e(it.label) + '">' + _sitePanelHead('Equipo del plano', it.label);
    html += '<div class="st-health st-health--' + h.tone + '">' + e(h.text) + '</div>';
    if (it.assetId) {
        var inst = ((typeof invState !== 'undefined' && invState.equipment) || []).filter(function(x) { return x && x.assetId === it.assetId; });
        if (inst.length) {
            html += '<ul class="st-inst">' + inst.slice(0, 8).map(function(x) {
                var st = typeof invCalStatus === 'function' ? invCalStatus(x) : { label: '' };
                return '<li><span>' + e(x.name || x.description || x.f11Id || 'Instrumento') + '</span><b style="color:' + (st.color || '#64748b') + '">' + e(st.label || '') + '</b></li>';
            }).join('') + (inst.length > 8 ? '<li>… y ' + (inst.length - 8) + ' más</li>' : '') + '</ul>';
        }
    }
    if (_site.edit) {
        var assets = (typeof invState !== 'undefined' && invState.assets) || [];
        html += '<label class="st-field">Ligar a equipo del F11<select onchange="siteItemLink(' + q + ', this.value)"><option value="">— sin ligar —</option>' +
                assets.map(function(a) { return '<option value="' + e(a.id) + '"' + (a.id === it.assetId ? ' selected' : '') + '>' + e(a.id + ' · ' + (a.name || '')) + '</option>'; }).join('') + '</select></label>';
        var shp = siteItemShape(it);
        html += '<label class="st-field">Forma<select onchange="siteItemSetShape(' + q + ', this.value)">' +
                Object.keys(SITE_SHAPES).map(function(k) { return '<option value="' + k + '"' + (k === shp ? ' selected' : '') + '>' + e(SITE_SHAPES[k]) + '</option>'; }).join('') + '</select></label>';
        html += '<div class="st-tools">' +
            '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteItemRename(' + q + ')">✎ Nombre</button>' +
            '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteItemNudge(' + q + ',\'rot\')" title="Girar 90°">⟳ Girar</button>' +
            '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteItemNudge(' + q + ',\'w+\')">Ancho +</button><button type="button" class="tp-btn tp-btn-ghost" onclick="siteItemNudge(' + q + ',\'w-\')">Ancho −</button>' +
            '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteItemNudge(' + q + ',\'d+\')">Fondo +</button><button type="button" class="tp-btn tp-btn-ghost" onclick="siteItemNudge(' + q + ',\'d-\')">Fondo −</button>' +
            '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteItemNudge(' + q + ',\'h+\')">Alto +</button><button type="button" class="tp-btn tp-btn-ghost" onclick="siteItemNudge(' + q + ',\'h-\')">Alto −</button>' +
            '<button type="button" class="tp-btn tp-btn-ghost st-danger" onclick="siteItemDelete(' + q + ')">🗑 Quitar</button></div>' +
            '<p class="st-hint">' + (_siteNarrow() ? 'Mantén presionado el equipo y arrástralo para moverlo.' : 'Arrastra el equipo en el plano para moverlo.') + '</p>';
    } else {
        html += '<p class="st-hint">Para acomodarlo, nombrarlo o ligarlo al F11: ✏️ Editar plano.</p>';
    }
    return html + '</div>';
}

function _siteUnitPanelHTML(kind, id) {
    var e = _invRoomEsc;
    var entry = (_site.model.entries || []).find(function(x) { return x.kind === kind && String(x.id) === String(id); });
    if (!entry) return '';
    var L = (_site.look || {})[kind + ':' + id] || {};
    var qk = "'" + kind + "'", qi = "'" + e(String(id)) + "'";
    var html = '<div class="rm-panel rm-pop" role="region" aria-label="Unidad ' + e(entry.vin) + '">' + _sitePanelHead(_siteSpotLabel(entry.spot), entry.vin || 'Unidad');
    var mst = L.master ? _siteMaster(L.master) : null;
    if (mst) html += '<div class="st-health st-health--info">★ Vehículo Master' + (mst.name ? ': ' + e(mst.name) : '') + ' — su lugar es ' + e(_siteSpotLabel(mst.spot)) + '. ' +
                     '<button type="button" class="tp-btn tp-btn-ghost st-inline-btn" onclick="siteSelect(\'master\',\'' + e(mst.id) + '\')">Ver</button></div>';
    if (kind === 'veh') {
        var v = entry.vehicle;
        var c = v.config || {};
        html += '<div class="st-unit-sub">' + e([c.Modelo, c['MODEL YEAR (VIN)'], c['EMISSION REGULATION'], c.REGION].filter(Boolean).join(' · ')) + '</div>';
        var st = typeof cascadeVehicleStage === 'function' ? cascadeVehicleStage(v) : null;
        if (st) html += '<div class="st-row"><span>Etapa</span><b>' + st.index + '/' + st.total + ' · ' + e(st.label) + '</b></div>';
        if (L.sub) html += '<div class="st-row"><span>Ahora</span><b>' + e(L.sub) + '</b></div>';
        var ns = typeof getNextStep === 'function' ? getNextStep(v) : null;
        if (ns && ns.action) html += '<div class="st-row"><span>Siguiente</span><b>' + e(ns.action) + '</b></div>';
        if (entry.since) html += '<div class="st-row"><span>Aquí desde</span><b>' + e(String(entry.since).slice(0, 16).replace('T', ' ')) + '</b></div>';
        html += '<div class="st-tools">' +
            '<button type="button" class="tp-btn tp-btn-primary" onclick="v7GoToVehicle(' + qi + ')">Abrir en Pruebas</button>' +
            '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteMoveStart(' + qk + ',' + qi + ')">↔ Mover</button>' +
            (typeof fichaOpen === 'function' ? '<button type="button" class="tp-btn tp-btn-ghost" onclick="fichaOpen(\'vehiculo\',' + qi + ')">Ficha</button>' : '') + '</div>';
    } else {
        html += '<div class="st-health st-health--warn">' + (entry.altaId != null ? 'Este VIN ya tiene alta en la plataforma.' : 'Sin alta en la plataforma: solo se conoce su VIN.') + '</div>';
        html += '<div class="st-tools">' +
            (entry.altaId != null ? '<button type="button" class="tp-btn tp-btn-primary" onclick="siteUnitLinkAlta(' + qi + ')">Ligar a su alta</button>'
                                  : '<button type="button" class="tp-btn tp-btn-primary" onclick="siteUnitStartAlta(' + qi + ')">Dar de alta</button>') +
            '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteMoveStart(' + qk + ',' + qi + ')">↔ Mover</button></div>';
    }
    return html + '</div>';
}

function _siteSpotPanelHTML(spot) {
    var list = (_site.model.bySpot || {})[spot] || [];
    if (list.length === 1) return _siteUnitPanelHTML(list[0].kind, list[0].id);
    var e = _invRoomEsc;
    var html = '<div class="rm-panel rm-pop" role="region" aria-label="' + e(_siteSpotLabel(spot)) + '">' + _sitePanelHead('Lugar', _siteSpotLabel(spot));
    if (list.length > 1) {
        html += '<div class="st-health st-health--bad">Hay ' + list.length + ' unidades registradas en este lugar: mueve las que ya no estén aquí.</div>' +
                '<ul class="st-inst">' + list.map(function(x) { return '<li><button type="button" class="tp-btn tp-btn-ghost" onclick="siteSelect(\'' + x.kind + '\',\'' + e(String(x.id)) + '\')">' + e(x.vin) + '</button></li>'; }).join('') + '</ul>';
        return html + '</div>';
    }
    html += '<p class="st-hint">Libre.</p><div class="st-tools"><button type="button" class="tp-btn tp-btn-primary" onclick="siteUnitAddPrompt(\'' + spot + '\')">＋ Poner una unidad (VIN)</button></div>';
    return html + '</div>';
}

function siteSelect(kind, id) { _site.sel = { kind: kind, id: id }; sitePaint(); }

// ── Cámara ───────────────────────────────────────────────────────────
function siteZoomBy(f) { var c = _siteCam(); c.zoom = Math.max(0.5, Math.min(5, c.zoom * f)); _siteApplyCam(); _siteCamSave(); }
function siteRotate(deg) { var c = _siteCam(); c.az = invRoomCamNormalize({ az: c.az + deg, el: c.el, zoom: c.zoom, panX: c.panX, panY: c.panY }).az; _sitePaintScene(); _siteCamSave(); }
function siteTilt(deg) { var c = _siteCam(); c.el = Math.max(20, Math.min(90, c.el + deg)); _sitePaintScene(); _siteCamSave(); }
function siteResetCam() { _site.cam = invRoomCamNormalize(_siteNarrow() ? SITE_CAM_NARROW : SITE_CAM_DEFAULT, false); _sitePaintScene(); _siteCamSave(); }

// ── Gestos: tocar, desplazar, pellizcar, rueda, arrastrar equipo (modo editar) ──
function _siteToFloor(clientX, clientY) {
    var svg = document.getElementById('st-svg'), g = document.getElementById('st-cam');
    if (!svg || !g || !g.getScreenCTM) return null;
    var m = g.getScreenCTM();
    if (!m) return null;
    var pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    var s = pt.matrixTransform(m.inverse());
    return siteUnproject(s.x, s.y, _siteCam(), siteCenter(_site.layout || SITE_LAYOUT));
}

/** [3.17.0] Lleva la vista al estacionamiento (el ⌂ regresa a todo el plano). */
function siteFocusLot() {
    var lay = _site.layout, b = _site.box;
    if (!lay || !lay.lot || !b) return;
    var cam = _siteCam(), C = siteCenter(lay), r = lay.lot.rect, xs = [], ys = [];
    [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].forEach(function(p) { [0, 1.6].forEach(function(z) { var q = invRoomProject(p[0], p[1], z, cam, C); xs.push(q.x); ys.push(q.y); }); });
    var w = Math.max.apply(null, xs) - Math.min.apply(null, xs), h = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    var lx = (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2, ly = (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2;
    var bx = b.x + b.w / 2, by = b.y + b.h / 2;
    var z = Math.max(1, Math.min(3.2, Math.min(b.w / w, b.h / h) * 0.9));
    _siteCamTween({ zoom: z, panX: -(lx - bx) * z, panY: -(ly - by) * z });
    // Sin flota todavía: abre el primer lugar libre, listo para agregar el primero.
    if (!_siteMasters().length && !_site.sel) { _site.sel = { kind: 'spot', id: siteLotFreeStall([]) }; sitePaint(); }
}

/** Mueve zoom/desplazamiento de la cámara suavemente (sin repintar la escena). */
function _siteCamTween(to) {
    var cam = _siteCam(), from = { zoom: cam.zoom, panX: cam.panX, panY: cam.panY };
    var reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var t0 = null, dur = reduce ? 0 : 420;
    var step = function(ts) {
        if (t0 == null) t0 = ts;
        var k = dur ? Math.min(1, (ts - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
        ['zoom', 'panX', 'panY'].forEach(function(p) { cam[p] = from[p] + (to[p] - from[p]) * e; });
        _siteApplyCam();
        if (k < 1) requestAnimationFrame(step); else _siteCamSave();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(step); else { Object.assign(cam, to); _siteApplyCam(); _siteCamSave(); }
}

function _siteTap(t) {
    var layout = _site.layout || SITE_LAYOUT;
    // Un toque en el piso de un lugar (o en su número) cuenta como tocar el lugar.
    var floorSpot = t.floor ? siteSpotAt(t.floor, layout) : null;
    if (_site.moving) {
        var mm = t.master ? _siteMaster(t.master) : null;
        var spot = t.spot || (mm && mm.spot) || floorSpot;
        if (spot) siteMoveTo(spot);
        return;
    }
    if (t.item) _site.sel = { kind: 'item', id: t.item };
    else if (t.veh) _site.sel = { kind: 'veh', id: t.veh };
    else if (t.unit) _site.sel = { kind: 'unit', id: t.unit };
    else if (t.master) _site.sel = { kind: 'master', id: t.master };
    else if (t.spot || floorSpot) _site.sel = { kind: 'spot', id: t.spot || floorSpot };
    else _site.sel = null;
    sitePaint();
}

var _sitePtr = null;
function _siteBindStage() {
    var svg = document.getElementById('st-svg');
    if (!svg || svg._stBound) return;
    svg._stBound = true;
    var pointers = {}, LONG_MS = 320, MOVE_PX = 8;
    var hit = function(target) {
        var g = target.closest ? target.closest('[data-item],[data-veh],[data-unit],[data-master],[data-spot]') : null;
        return g ? { item: g.getAttribute('data-item'), veh: g.getAttribute('data-veh'), unit: g.getAttribute('data-unit'), master: g.getAttribute('data-master'), spot: g.getAttribute('data-spot') } : {};
    };
    svg.addEventListener('pointerdown', function(e) {
        if (e.button > 0) return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pointers);
        if (ids.length === 2) {
            var a = pointers[ids[0]], b = pointers[ids[1]];
            if (_sitePtr && _sitePtr.timer) clearTimeout(_sitePtr.timer);
            _sitePtr = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: _siteCam().zoom };
            return;
        }
        var h = hit(e.target);
        var p = { mode: 'pending', x0: e.clientX, y0: e.clientY, hit: h, pan0: { x: _siteCam().panX, y: _siteCam().panY }, type: e.pointerType };
        _sitePtr = p;
        if (_site.edit && h.item) p.timer = setTimeout(function() { if (_sitePtr === p && p.mode === 'pending') _siteDragStart(p, e.clientX, e.clientY); }, LONG_MS);
        try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    });
    svg.addEventListener('pointermove', function(e) {
        if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var p = _sitePtr;
        if (!p) return;
        if (p.mode === 'pinch') {
            var ids = Object.keys(pointers);
            if (ids.length < 2) return;
            var a = pointers[ids[0]], b = pointers[ids[1]];
            _siteCam().zoom = Math.max(0.5, Math.min(5, p.z0 * Math.hypot(a.x - b.x, a.y - b.y) / (p.d0 || 1)));
            _siteApplyCam();
            return;
        }
        var dx = e.clientX - p.x0, dy = e.clientY - p.y0;
        if (p.mode === 'pending' && Math.hypot(dx, dy) > MOVE_PX) {
            clearTimeout(p.timer);
            if (_site.edit && p.hit.item && p.type === 'mouse') _siteDragStart(p, p.x0, p.y0);
            else p.mode = 'pan';
        }
        if (p.mode === 'pan') {
            var svgM = svg.getScreenCTM(), k = svgM && svgM.a ? 1 / svgM.a : 1, cam = _siteCam();
            cam.panX = p.pan0.x + dx * k; cam.panY = p.pan0.y + dy * k;
            _siteApplyCam();
        } else if (p.mode === 'drag') {
            e.preventDefault();
            _siteDragMove(p, e.clientX, e.clientY);
        }
    });
    var end = function(e) {
        delete pointers[e.pointerId];
        var p = _sitePtr;
        if (!p) return;
        clearTimeout(p.timer);
        if (p.mode === 'pinch') { if (!Object.keys(pointers).length) { _sitePtr = null; _siteCamSave(); } return; }
        _sitePtr = null;
        if (e.type === 'pointercancel') { if (p.mode === 'drag') sitePaint(); return; }
        if (p.mode === 'pending') { var f = _siteToFloor(e.clientX, e.clientY); var t = Object.assign({ floor: f }, p.hit); _siteTap(t); }
        else if (p.mode === 'pan') _siteCamSave();
        else if (p.mode === 'drag') _siteDragEnd(p);
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', function(e) {
        e.preventDefault();
        var c = _siteCam(), b = _site.box;
        if (!b) return;
        var m = svg.getScreenCTM();
        if (!m) return;
        var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        var s = pt.matrixTransform(m.inverse());
        var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        var pS = { x: (s.x - cx - c.panX) / c.zoom + cx, y: (s.y - cy - c.panY) / c.zoom + cy };
        var z2 = Math.max(0.5, Math.min(5, c.zoom * Math.exp(-e.deltaY * 0.0015)));
        c.panX = s.x - cx - z2 * (pS.x - cx); c.panY = s.y - cy - z2 * (pS.y - cy); c.zoom = z2;
        _siteApplyCam(); _siteCamSave();
    }, { passive: false });
    svg.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { if (_site.moving) siteMoveCancel(); else siteClose(); return; }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var h = hit(e.target);
        if (!h.item && !h.veh && !h.unit && !h.master && !h.spot) return;
        e.preventDefault();
        _siteTap(h);
    });
}

function _siteDragStart(p, x, y) {
    var it = _siteItem(p.hit.item);
    if (!it) return;
    p.mode = 'drag';
    p.start = _siteToFloor(x, y);
    p.orig = { x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 };
    _site.sel = { kind: 'item', id: it.id };
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
}
function _siteDragMove(p, x, y) {
    var it = _siteItem(p.hit.item), f = _siteToFloor(x, y);
    if (!it || !f || !p.start) return;
    var dx = Math.round((f[0] - p.start[0]) * 20) / 20, dy = Math.round((f[1] - p.start[1]) * 20) / 20;
    it.x0 = p.orig.x0 + dx; it.x1 = p.orig.x1 + dx; it.y0 = p.orig.y0 + dy; it.y1 = p.orig.y1 + dy;
    _sitePaintScene();
}
function _siteDragEnd(p) {
    var it = _siteItem(p.hit.item);
    if (!it) return;
    var pos = { x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 };
    Object.assign(it, p.orig);                            // el escritor registra el antes/después
    Object.keys(pos).forEach(function(k) { pos[k] = Math.round(pos[k] * 100) / 100; });
    siteItemSave(it.id, pos, 'plano_equipo_mueve');
    sitePaint();
}

// ── Plan → Mi semana: ¿la configuración de esta fila tiene unidad en el sitio? ──
/** Configuraciones (configCode) con una unidad con alta en el sitio. */
function siteConfigsOnSite() {
    var out = {};
    ((typeof db !== 'undefined' && db.vehicles) || []).forEach(function(v) {
        if (_siteLive(v) && v.site && v.site.spot && v.configCode) out[v.configCode] = (out[v.configCode] || 0) + 1;
    });
    return out;
}

if (typeof CASCADE_TOOLTIPS !== 'undefined') {
    Object.assign(CASCADE_TOOLTIPS, {
        'site-help': { title: 'Laboratorio en el mapa', text: 'La celda de pruebas y el cuarto de acondicionamiento como se ven desde arriba. Toca un cajón para poner una unidad por su VIN (si tiene alta en la plataforma se liga sola; si no, queda como "sin alta"). Toca una unidad para ver su etapa, cuánto le falta de reposo y abrirla en Pruebas. Afuera está el estacionamiento de la flota Master (los vehículos que se quedan con el laboratorio): toca un lugar libre para agregar uno con su VIN, su carrocería y su color; cuando entra al laboratorio su lugar se ve vacío y dice dónde está. Los equipos se acomodan con ✏️ Editar plano y se ligan a su equipo del F11 para ver si su calibración o su mantenimiento están al día.' }
    });
}
