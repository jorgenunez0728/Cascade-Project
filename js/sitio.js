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

// ── El plano (unidades ≈ metros; y crece hacia el cuarto de control = sur) ─────
var SITE_LAYOUT = {
    id: 'lab', provisional: true,
    floor: [[0, 0], [26, 0], [26, 13], [15, 13], [15, 10], [12.5, 10], [12.5, 11.8], [2, 11.8], [2, 10], [0, 10]],
    areas: [
        { id: 'celda', label: 'Celda de pruebas', rect: [0, 0, 15, 10], tone: 'cell' },
        { id: 'control', label: 'Cuarto de control', rect: [2, 10, 12.5, 11.8], tone: 'control' },
        { id: 'acond', label: 'Cuarto de acondicionamiento', rect: [15, 0, 26, 13], tone: 'soak' }
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
    fixed: [
        { id: 'rod-tras-i', kind: 'roll', rect: [6.0, 3.95, 6.6, 4.6] }, { id: 'rod-tras-d', kind: 'roll', rect: [6.0, 5.4, 6.6, 6.05] },
        { id: 'rod-del-i', kind: 'roll', rect: [8.7, 3.95, 9.3, 4.6] }, { id: 'rod-del-d', kind: 'roll', rect: [8.7, 5.4, 9.3, 6.05] },
        { id: 'placa', kind: 'plate', rect: [6.6, 4.25, 8.7, 5.75] },
        { id: 'barrera-tras', kind: 'barrier', rect: [4.5, 4.05, 4.7, 5.95], h: 0.9 },
        { id: 'barrera-del', kind: 'barrier', rect: [10.55, 4.05, 10.75, 5.95], h: 0.9 },
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
// [id, nombre, x0, y0, x1, y1, alto, color]
var SITE_ITEMS_SEED = [
    ['si-filtro', 'Filtro de aire', 6.6, 0.25, 9.6, 1.7, 2.6, '#94a3b8'],
    ['si-brazo', 'Brazo', 10.15, 1.0, 10.55, 1.4, 2.2, '#e2e8f0'],
    ['si-tab-1', 'Tablero 1', 11.2, 0.25, 11.9, 0.95, 2.1, '#cbd5e1'],
    ['si-tab-2', 'Tablero 2', 11.95, 0.25, 12.65, 0.95, 2.1, '#cbd5e1'],
    ['si-tab-3', 'Tablero 3', 12.7, 0.25, 13.4, 0.95, 2.1, '#cbd5e1'],
    ['si-tab-4', 'Tablero 4', 13.45, 0.25, 14.15, 0.95, 2.1, '#cbd5e1'],
    ['si-tab-5', 'Tablero 5', 14.2, 0.25, 14.9, 0.95, 2.1, '#cbd5e1'],
    ['si-vent', 'Ventilador', 11.5, 4.2, 12.8, 5.8, 1.6, '#64748b'],
    ['si-gab-a', 'Gabinete A', 0.35, 0.6, 2.3, 1.8, 2.0, '#f1f5f9'],
    ['si-gab-b', 'Gabinete B', 0.35, 1.9, 2.3, 3.1, 2.0, '#f1f5f9'],
    ['si-gab-c', 'Gabinete C', 0.35, 3.2, 2.3, 4.4, 2.0, '#f1f5f9'],
    ['si-gab-d', 'Gabinete D', 0.35, 4.5, 2.3, 5.7, 2.0, '#f1f5f9'],
    ['si-gab-e', 'Gabinete E', 0.35, 5.8, 2.3, 7.0, 2.0, '#f1f5f9'],
    ['si-rack-1', 'Rack 1', 3.3, 0.5, 4.2, 1.3, 1.9, '#f8fafc'],
    ['si-rack-2', 'Rack 2', 3.3, 7.9, 4.2, 8.7, 1.9, '#f8fafc'],
    ['si-stringo', 'Stringo', 4.6, 8.3, 6.2, 9.4, 0.35, '#dc2626'],
    ['si-carrito', 'Carrito', 7.0, 8.5, 7.8, 9.1, 0.95, '#475569'],
    ['si-escritorio', 'Escritorio de control', 2.3, 10.2, 11.2, 10.8, 0.75, '#e2e8f0'],
    ['si-ebcm1', 'EBCM1', 18.6, 6.25, 19.6, 7.15, 1.4, '#64748b'],
    ['si-cargador', 'Cargador', 20.2, 6.3, 20.9, 7.1, 1.6, '#10b981'],
    ['si-inflador', 'Inflador', 22.6, 12.0, 23.3, 12.7, 1.0, '#f59e0b']
];

var SITE_CAM_DEFAULT = { az: 18, el: 46, zoom: 1, panX: 0, panY: 0 };
// En el teléfono, desde arriba y girado: el lado largo (celda → acondicionamiento) queda vertical.
var SITE_CAM_NARROW = { az: 90, el: 90, zoom: 1, panX: 0, panY: 0 };
var SITE_CAR = { len: 4.4, wid: 1.8 };

// ══════════════════════════════════════════════════════════════════════
// Datos — PURAS
// ══════════════════════════════════════════════════════════════════════

/** Los equipos de la siembra como registros de `invState.siteItems`. PURA. */
function siteItemsSeed(nowIso) {
    return SITE_ITEMS_SEED.map(function(r) {
        return { id: r[0], label: r[1], x0: r[2], y0: r[3], x1: r[4], y1: r[5], h: r[6], color: r[7],
                 assetId: '', seeded: true, updatedAt: nowIso || '', deleted: false };
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

/** Indicadores de la franja de arriba. PURA. */
function siteKpis(model, look, items, health) {
    var k = { onSite: 0, withAlta: 0, noAlta: 0, soaking: 0, nextLeftH: null, ready: 0, dino: 0, eqBad: 0, eqWarn: 0, eqNone: 0 };
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

/** Lugar (dinamómetro o cajón) que contiene un punto del piso, o null. PURA. */
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

/** Caja (prisma) con sus caras visibles ordenadas: devuelve {d, s}. */
function _siteBoxSVG(P, r, z0, z1, cls, attrs, inner) {
    var c4 = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
    var top = c4.map(function(c) { return P(c[0], c[1], z1); });
    var faces = [];
    for (var i = 0; i < 4; i++) {
        var a = c4[i], b = c4[(i + 1) % 4];
        var q0 = P(a[0], a[1], z0), q1 = P(b[0], b[1], z0);
        faces.push({ d: (q0.d + q1.d) / 2, s: '<polygon class="st-side st-side--' + i + '" points="' + _invRoomPts([q0, q1, top[(i + 1) % 4], top[i]]) + '"/>' });
    }
    faces.sort(function(x, y) { return x.d - y.d; });
    var dmax = Math.max.apply(null, top.map(function(q) { return q.d; }));
    return { d: (dmax + Math.min.apply(null, top.map(function(q) { return q.d; }))) / 2,
             s: '<g class="' + cls + '"' + (attrs || '') + '>' + faces.map(function(f) { return f.s; }).join('') +
                '<polygon class="st-top" points="' + _invRoomPts(top) + '"/>' + (inner || '') + '</g>' };
}

/** Un vehículo: cuerpo bajo + cabina, mirando a `nose` (+1 este, −1 oeste). */
function _siteCarSVG(P, cx, cy, nose, cls, attrs, title) {
    var L = SITE_CAR.len, W = SITE_CAR.wid;
    var body = [cx - L / 2, cy - W / 2, cx + L / 2, cy + W / 2];
    var cab0 = nose > 0 ? cx - L * 0.28 : cx - L * 0.12, cab1 = nose > 0 ? cx + L * 0.12 : cx + L * 0.28;
    var b = _siteBoxSVG(P, body, 0.3, 0.95, 'st-car-body', '', '');
    var c = _siteBoxSVG(P, [cab0, cy - W * 0.42, cab1, cy + W * 0.42], 0.95, 1.45, 'st-car-cab', '', '');
    var wheels = '';
    [[cx - L * 0.32, cy - W / 2], [cx - L * 0.32, cy + W / 2], [cx + L * 0.32, cy - W / 2], [cx + L * 0.32, cy + W / 2]].forEach(function(w) {
        var p = P(w[0], w[1], 0.3);
        wheels += '<ellipse class="st-wheel" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" rx="18" ry="11"/>';
    });
    var nf = P(cx + nose * L / 2, cy, 0.62);
    return { d: Math.max(b.d, c.d),
             s: '<g class="' + cls + '"' + (attrs || '') + '>' + (title ? '<title>' + _invRoomEsc(title) + '</title>' : '') + wheels + b.s + c.s +
                '<circle class="st-car-nose" cx="' + nf.x.toFixed(1) + '" cy="' + nf.y.toFixed(1) + '" r="5"/></g>' };
}

/**
 * La escena del laboratorio como SVG (cadena). PURA.
 * scene = {layout, items, model, look, health}; cam = cámara; opts = {sel, moving, edit, labels}
 * look[kind:id] = {tone, short, soak, leftH, aria}; health[itemId] = {tone, text}.
 */
function siteSceneSVG(scene, cam, opts) {
    opts = opts || {};
    var layout = scene.layout || SITE_LAYOUT;
    var C = invRoomCenter(layout);
    var P = function(x, y, z) { return invRoomProject(x, y, z, cam, C); };
    var floorL = [], solid = [], over = [];
    var esc = _invRoomEsc;
    var fl = layout.floor.map(function(p) { return P(p[0], p[1], 0); });
    floorL.push('<polygon class="rm-floor" points="' + _invRoomPts(fl) + '"/>');
    (layout.areas || []).forEach(function(a) {
        var r = a.rect, cs = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map(function(c) { return P(c[0], c[1], 0.005); });
        floorL.push('<polygon class="st-area st-area--' + a.tone + '" points="' + _invRoomPts(cs) + '"/>');
        var lc = P(r[0] + 0.35, r[1] + 0.35, 0);
        if (opts.labels !== false) over.push({ d: -99, s: '<text class="st-area-lbl" x="' + lc.x.toFixed(1) + '" y="' + lc.y.toFixed(1) + '">' + esc(a.label) + '</text>' });
    });
    // Lo fijo del piso: rodillos, placas, rieles, escape.
    (layout.fixed || []).forEach(function(f) {
        if (f.rect && (f.kind === 'roll' || f.kind === 'plate')) {
            var r = f.rect, cs = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map(function(c) { return P(c[0], c[1], 0.01); });
            floorL.push('<polygon class="st-' + f.kind + '" points="' + _invRoomPts(cs) + '"/>');
        } else if (f.line) {
            var a = P(f.line[0], f.line[1], 0.02), b = P(f.line[2], f.line[3], 0.02);
            floorL.push('<line class="st-' + f.kind + '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>');
        } else if (f.kind === 'barrier') {
            solid.push(_siteBoxSVG(P, f.rect, 0, f.h || 0.9, 'st-barrier', ' aria-hidden="true"', ''));
        } else if (f.kind === 'tunnel') {
            solid.push(_siteBoxSVG(P, f.rect, f.z0, f.z1, 'st-tunnel', ' aria-hidden="true"', ''));
        }
    });
    // Lugares (cajones y dinamómetro): se tocan para poner o ver una unidad.
    var model = scene.model || { bySpot: {}, conflicts: [] };
    layout.spots.forEach(function(s) {
        var r = s.rect, cs = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map(function(c) { return P(c[0], c[1], 0.015); });
        var occ = (model.bySpot[s.id] || []).length;
        var cls = 'st-spot st-spot--' + s.id + (occ ? ' st-spot--busy' : '') + (model.conflicts.indexOf(s.id) >= 0 ? ' st-spot--clash' : '') +
                  (opts.sel && opts.sel.kind === 'spot' && opts.sel.id === s.id ? ' st-spot--sel' : '') + (opts.moving && !occ ? ' st-spot--target' : '');
        floorL.push('<polygon class="' + cls + '" data-spot="' + s.id + '" tabindex="0" role="button" aria-label="' + esc(s.label) + (occ ? ': ocupado' : ': libre') + '" points="' + _invRoomPts(cs) + '"/>');
        // El del dinamómetro va afuera (el coche lo taparía); el de un cajón, en su esquina.
        var lc = s.id === 'dino' ? P((r[0] + r[2]) / 2, r[1] - 0.3, 0.02) : P(s.nose < 0 ? r[2] - 0.45 : r[0] + 0.45, r[1] + 0.35, 0.02);
        over.push({ d: -98, s: '<text class="st-spot-lbl" x="' + lc.x.toFixed(1) + '" y="' + (lc.y + 10).toFixed(1) + '">' + esc(s.id === 'dino' ? '⚙ ' + s.label : s.label.replace('Cajón ', '')) + '</text>' });
    });
    // Muros, ventanales y ventanas
    var WH = 2.6;
    layout.walls.forEach(function(w) {
        var back = invRoomWallIsBack(w[4], w[5], cam);
        var kind = w[6] || '';
        var h = kind === 'window' ? 2.2 : kind === 'glass' ? 3.0 : WH;
        var p1 = P(w[0], w[1], 0), p2 = P(w[2], w[3], 0), p3 = P(w[2], w[3], h), p4 = P(w[0], w[1], h);
        var dmid = (p1.d + p2.d) / 2;
        var cls = kind ? 'st-wall st-wall--' + kind : 'rm-wall' + (back ? '' : ' rm-wall--front');
        solid.push({ d: kind ? dmid : back ? dmid - 2 : dmid + 0.05,
            s: '<polygon class="' + cls + '" points="' + _invRoomPts([p1, p2, p3, p4]) + '"/>' +
               (kind ? '' : '<line class="rm-wall-cap' + (back ? '' : ' rm-wall-cap--front') + '" x1="' + p4.x.toFixed(1) + '" y1="' + p4.y.toFixed(1) + '" x2="' + p3.x.toFixed(1) + '" y2="' + p3.y.toFixed(1) + '"/>') });
    });
    (layout.doors || []).forEach(function(d) {
        var a = P(d.a[0], d.a[1], 0), b = P(d.b[0], d.b[1], 0);
        floorL.push('<line class="rm-door' + (d.glass ? ' st-door--glass' : '') + '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>');
        var m = P((d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, 0);
        if (opts.labels !== false) over.push({ d: 99, s: '<text class="rm-door-lbl" x="' + m.x.toFixed(1) + '" y="' + (m.y + 16).toFixed(1) + '">' + (d.glass ? '↔ ' : '🚪 ') + esc(d.label) + '</text>' });
    });
    // Equipos (editables)
    (scene.items || []).forEach(function(it) {
        if (!it || it.deleted) return;
        var h = scene.health && scene.health[it.id] || { tone: 'none', text: '' };
        var sel = opts.sel && opts.sel.kind === 'item' && opts.sel.id === it.id;
        var cls = 'st-eq st-eq--' + h.tone + (sel ? ' st-eq--sel' : '') + (opts.edit ? ' st-eq--edit' : '') + (opts.moving && opts.moving.kind === 'item' && opts.moving.id === it.id ? ' st-eq--moving' : '');
        var title = it.label + (h.text ? ' — ' + h.text : '');
        var bx = _siteBoxSVG(P, [it.x0, it.y0, it.x1, it.y1], 0, Math.max(0.1, +it.h || 1), cls,
            ' data-item="' + esc(it.id) + '" tabindex="0" role="button" aria-label="' + esc(title) + '" style="--st-eq:' + esc(it.color || '#94a3b8') + '"', '<title>' + esc(title) + '</title>');
        solid.push(bx);
        var lp = P((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, Math.max(0.1, +it.h || 1) + 0.15);
        if (opts.labels !== false) {
            over.push({ d: bx.d, s: '<g class="st-eq-lbl st-eq-lbl--' + h.tone + '" aria-hidden="true"><text x="' + lp.x.toFixed(1) + '" y="' + lp.y.toFixed(1) + '">' +
                (h.tone === 'bad' ? '⚠ ' : '') + esc(it.label) + '</text></g>' });
        }
    });
    // Unidades
    var look = scene.look || {};
    layout.spots.forEach(function(s) {
        var list = model.bySpot[s.id] || [];
        list.forEach(function(e, i) {
            var r = s.rect, L = look[e.kind + ':' + e.id] || {};
            var cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2 + i * 0.35;
            var sel = opts.sel && opts.sel.kind === e.kind && String(opts.sel.id) === String(e.id);
            var mov = opts.moving && opts.moving.kind === e.kind && String(opts.moving.id) === String(e.id);
            var cls = 'st-car st-car--' + (L.tone || 'none') + (e.kind === 'unit' ? ' st-car--noalta' : '') + (sel ? ' st-car--sel' : '') + (mov ? ' st-car--moving' : '');
            var car = _siteCarSVG(P, cx, cy, s.nose, cls, ' data-' + e.kind + '="' + esc(e.id) + '" tabindex="0" role="button" aria-label="' + esc(L.aria || e.vin) + '"', L.aria || e.vin);
            solid.push(car);
            if (opts.labels !== false && L.short) {
                var lp = P(cx, cy, 1.7);
                over.push({ d: car.d, s: '<g class="st-car-lbl st-car-lbl--' + (L.tone || 'none') + '" aria-hidden="true"><text x="' + lp.x.toFixed(1) + '" y="' + lp.y.toFixed(1) + '">' + esc(L.short) + '</text>' +
                    (L.sub ? '<text class="st-car-sub" x="' + lp.x.toFixed(1) + '" y="' + (lp.y + 14).toFixed(1) + '">' + esc(L.sub) + '</text>' : '') + '</g>' });
            }
        });
    });
    var byD = function(a, b) { return a.d - b.d; };
    solid.sort(byD); over.sort(byD);
    var box = _siteBox(layout, cam);
    return { box: box, svg: '<g class="rm-floor-layer">' + floorL.join('') + '</g><g class="rm-solid-layer">' + solid.map(function(x) { return x.s; }).join('') +
             '</g><g class="rm-over-layer">' + over.map(function(x) { return x.s; }).join('') + '</g>' };
}

/** El viewBox de la escena para una cámara. PURA. */
function _siteBox(layout, cam) {
    var C = invRoomCenter(layout), xs = [], ys = [];
    layout.floor.forEach(function(p) {
        [0, 3.2].forEach(function(z) { var q = invRoomProject(p[0], p[1], z, cam, C); xs.push(q.x); ys.push(q.y); });
    });
    var pad = 40;
    return { x: Math.min.apply(null, xs) - pad, y: Math.min.apply(null, ys) - pad,
             w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + pad * 2, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + pad * 2 };
}

// ══════════════════════════════════════════════════════════════════════
// Estado y escritores (DOM / datos)
// ══════════════════════════════════════════════════════════════════════
var _site = { sel: null, moving: null, edit: false, cam: null, filter: null };

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
function _siteSpotLabel(id) { var s = SITE_LAYOUT.spots.find(function(x) { return x.id === id; }); return s ? s.label : (id || 'fuera del sitio'); }

/** Guarda los cambios de un equipo del plano (el único escritor). Auditado con antes/después. */
function siteItemSave(id, patch, why) {
    if (typeof authRequire === 'function' && !authRequire('inventory.manage', 'acomodar los equipos del plano')) return false;
    var it = _siteItem(id);
    if (!it) return false;
    var before = { label: it.label, x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1, h: it.h, assetId: it.assetId || '', deleted: !!it.deleted };
    Object.keys(patch || {}).forEach(function(k) { it[k] = patch[k]; });
    it.updatedAt = _siteNow(); it.by = _siteWho();
    invSave();
    if (typeof auditLog === 'function') {
        auditLog('inventory', why || 'plano_equipo', { type: 'equipo-plano', id: it.id, label: it.label }, 'Equipo del plano: ' + it.label,
                 { before: before, after: { label: it.label, x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1, h: it.h, assetId: it.assetId || '', deleted: !!it.deleted } });
    }
    if (typeof fbPush === 'function' && typeof fbSync !== 'undefined' && fbSync.enabled) { try { fbPush('inventory', invState); } catch (e) {} }
    return true;
}

function siteItemAdd() {
    if (typeof authRequire === 'function' && !authRequire('inventory.manage', 'agregar un equipo al plano')) return;
    if (!Array.isArray(invState.siteItems)) invState.siteItems = [];
    var id = 'si-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    invState.siteItems.push({ id: id, label: 'Equipo nuevo', x0: 7, y0: 2.2, x1: 7.8, y1: 2.9, h: 1.2, color: '#94a3b8', assetId: '', updatedAt: '', deleted: false });
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
    if (op === 'rot') { p = { x0: cx - d / 2, x1: cx + d / 2, y0: cy - w / 2, y1: cy + w / 2 }; }
    else if (op === 'w+' || op === 'w-') { var nw = Math.max(0.2, w + (op === 'w+' ? 0.2 : -0.2)); p = { x0: cx - nw / 2, x1: cx + nw / 2 }; }
    else if (op === 'd+' || op === 'd-') { var nd = Math.max(0.2, d + (op === 'd+' ? 0.2 : -0.2)); p = { y0: cy - nd / 2, y1: cy + nd / 2 }; }
    else if (op === 'h+' || op === 'h-') { p = { h: Math.max(0.1, Math.round(((+it.h || 1) + (op === 'h+' ? 0.2 : -0.2)) * 10) / 10) }; }
    Object.keys(p).forEach(function(k) { p[k] = Math.round(p[k] * 100) / 100; });
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
    if (!u) return;
    if (typeof dashGo === 'function') dashGo('cop15', 'alta');
    setTimeout(function() {
        var inp = document.getElementById('vin');
        if (inp) { inp.value = u.vin; inp.dispatchEvent(new Event('input', { bubbles: true })); try { inp.focus(); } catch (e) {} }
    }, 350);
}

function siteMoveStart(kind, id) { _site.moving = { kind: kind, id: id }; sitePaint(); }
function siteMoveCancel() { _site.moving = null; sitePaint(); }

/** Termina de mover una unidad a un lugar (tocar un cajón libre o el dinamómetro). */
function siteMoveTo(spot) {
    var m = _site.moving;
    if (!m) return;
    var busy = (_site.model && _site.model.bySpot[spot] || []).length;
    if (busy && spot) { if (typeof showToast === 'function') showToast(_siteSpotLabel(spot) + ' ya tiene una unidad: muévela primero.', 'warning'); return; }
    var ok = m.kind === 'veh' ? siteVehicleMove(m.id, spot) : siteUnitSave(m.id, spot ? { spot: spot, since: _siteNow() } : { deleted: true }, 'unidad_sin_alta');
    _site.moving = null;
    if (ok) _site.sel = spot ? { kind: m.kind, id: m.id } : null;
    sitePaint();
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

/** Lo que se pinta de cada unidad (de las definiciones de siempre: etapa, soak, siguiente paso). */
function _siteLook(model) {
    var look = {}, now = Date.now();
    model.entries.forEach(function(e) {
        if (e.kind === 'unit') {
            look['unit:' + e.id] = { tone: 'noalta', short: '…' + String(e.vin).slice(-6), sub: e.altaId != null ? 'ya tiene alta' : 'sin alta',
                                     aria: 'Unidad ' + e.vin + ' sin alta en la plataforma, ' + _siteSpotLabel(e.spot) };
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
        look['veh:' + e.id] = { tone: tone, short: '…' + String(v.vin || '').slice(-6) + ' · ' + ((v.config && v.config.Modelo) || ''), sub: sub, soak: soak.state, leftH: soak.leftH,
                                aria: 'Unidad ' + (v.vin || '') + ', ' + _siteSpotLabel(e.spot) + (sub ? ', ' + sub : '') };
    });
    return look;
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
            '<svg class="rm-svg" id="st-svg" role="application" aria-label="Plano del laboratorio: celda de pruebas y cuarto de acondicionamiento. Toca un equipo o una unidad para ver su estado." preserveAspectRatio="xMidYMid meet"><g id="st-cam"></g></svg>' +
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
            '</div></div>' +
          '</div>' +
          '<p class="rm-hintline" data-help="site-help">' + (SITE_LAYOUT.provisional ? 'Plano provisional, leído de las fotos del laboratorio. ' : '') +
            (_siteNarrow() ? 'Pellizca para acercar · toca un cajón para poner una unidad · toca un equipo para ver su estado'
                           : 'Rueda = acercar · arrastra el piso para mover la vista · toca un cajón para poner una unidad · toca un equipo para ver su estado') +
            (canEdit ? '' : ' · Acomodar equipos pide el permiso de Consumibles.') + '</p>' +
        '</div>';
    _siteFitStage();
    sitePaint();
    _siteBindStage();
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function _siteFitStage() {
    var st = document.getElementById('st-stage');
    if (!st) return;
    var nav = document.querySelector('.bottom-nav');
    var navH = nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0;
    var h = Math.round(window.innerHeight - navH - 140);
    st.style.height = Math.max(_siteNarrow() ? 420 : 480, Math.min(1100, h)) + 'px';
}

/** Repinta escena, franja y panel (conserva la cámara). */
function sitePaint() {
    var svg = document.getElementById('st-svg');
    if (!svg) return;
    var items = _siteItemsLive();
    var model = siteSpotsModel((typeof db !== 'undefined' && db.vehicles) || [], _siteUnits());
    if (_site.sel && _site.sel.kind === 'item' && !_siteItem(_site.sel.id)) _site.sel = null;
    _site.model = model; _site.items = items;
    _site.look = _siteLook(model);
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
    var cam = _siteCam();
    var out = siteSceneSVG({ layout: SITE_LAYOUT, items: _site.items, model: _site.model, look: _site.look, health: _site.health }, cam,
                           { sel: _site.sel, moving: _site.moving, edit: _site.edit, labels: true });
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
    var k = siteKpis(_site.model, _site.look, _site.items, _site.health);
    var t = function(icon, v, l, tone, title) {
        return '<span class="rm-kpi rm-kpi--' + tone + ' rm-kpi--static" title="' + _invRoomEsc(title) + '"><span class="rm-kpi-ico" aria-hidden="true">' + icon + '</span><b class="rm-kpi-v">' + v + '</b><span class="rm-kpi-l">' + l + '</span></span>';
    };
    host.innerHTML =
        t('🚗', k.onSite, 'En sitio', 'info', k.withAlta + ' con alta · ' + k.noAlta + ' sin alta') +
        t('⏳', k.soaking, 'Reposando', k.soaking ? 'info' : 'ok', k.nextLeftH != null ? 'La próxima termina en ' + Math.ceil(k.nextLeftH) + ' h' : 'Nadie reposando') +
        t('✅', k.ready, 'Listas', k.ready ? 'warn' : 'ok', 'Terminaron su reposo y esperan prueba') +
        t('⚙', k.dino, 'En dino', 'info', 'Unidad sobre el dinamómetro') +
        t('🔧', k.eqBad, 'Equipos', k.eqBad ? 'bad' : k.eqWarn ? 'warn' : 'ok', k.eqBad + ' con algo vencido · ' + k.eqWarn + ' por revisar · ' + k.eqNone + ' sin ligar al F11') +
        // Lo que no cuadra se DECLARA: dos unidades en un mismo lugar, o un lugar que el plano no tiene.
        ((_site.model.conflicts || []).length || (_site.model.unknown || []).length
            ? t('⚠', (_site.model.conflicts || []).length + (_site.model.unknown || []).length, 'Revisar', 'bad',
                (_site.model.conflicts || []).map(_siteSpotLabel).join(', ') + ((_site.model.conflicts || []).length ? ': más de una unidad. ' : '') +
                ((_site.model.unknown || []).length ? (_site.model.unknown || []).map(function(e) { return e.vin; }).join(', ') + ': en un lugar que el plano no tiene.' : ''))
            : '');
}

function _sitePaintMoving() {
    var m = document.getElementById('st-moving');
    if (!m) return;
    if (!_site.moving) { m.hidden = true; m.innerHTML = ''; return; }
    m.hidden = false;
    m.innerHTML = '<span>↔ Toca un cajón libre o el dinamómetro</span>' +
        '<button type="button" class="tp-btn tp-btn-ghost" onclick="siteMoveTo(null)">Sacar del sitio</button>' +
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
    else if (s && s.kind === 'spot') html = _siteSpotPanelHTML(s.id);
    if (!html) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false; host.innerHTML = html;
    if (!_siteNarrow()) { host.style.left = ''; host.style.right = '12px'; host.style.top = '64px'; }
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
    return siteUnproject(s.x, s.y, _siteCam(), invRoomCenter(SITE_LAYOUT));
}

function _siteTap(t) {
    if (_site.moving) {
        var spot = t.spot || (t.floor ? siteSpotAt(t.floor) : null);
        if (spot) siteMoveTo(spot);
        return;
    }
    if (t.item) _site.sel = { kind: 'item', id: t.item };
    else if (t.veh) _site.sel = { kind: 'veh', id: t.veh };
    else if (t.unit) _site.sel = { kind: 'unit', id: t.unit };
    else if (t.spot) _site.sel = { kind: 'spot', id: t.spot };
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
        var g = target.closest ? target.closest('[data-item],[data-veh],[data-unit],[data-spot]') : null;
        return g ? { item: g.getAttribute('data-item'), veh: g.getAttribute('data-veh'), unit: g.getAttribute('data-unit'), spot: g.getAttribute('data-spot') } : {};
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
        if (!h.item && !h.veh && !h.unit && !h.spot) return;
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
        'site-help': { title: 'Laboratorio en el mapa', text: 'La celda de pruebas y el cuarto de acondicionamiento como se ven desde arriba. Toca un cajón para poner una unidad por su VIN (si tiene alta en la plataforma se liga sola; si no, queda como "sin alta"). Toca una unidad para ver su etapa, cuánto le falta de reposo y abrirla en Pruebas. Los equipos se acomodan con ✏️ Editar plano y se ligan a su equipo del F11 para ver si su calibración o su mantenimiento están al día.' }
    });
}
