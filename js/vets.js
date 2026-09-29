// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Importar resultados de HORIBA STARS VETS (2.5.0)       ║
// ║                                                                      ║
// ║  El reporte de VETS es un .xlsx de una prueba (≈1 MB, ~130 hojas).   ║
// ║  Las hojas VISIBLES son el reporte y cambian de acomodo; las OCULTAS ║
// ║  son las tablas de datos de STARS con el mismo formato en México y   ║
// ║  Europa: renglón 1 = nombre del campo, renglón 2 = unidad, renglón   ║
// ║  3+ = datos. Aquí se lee SIEMPRE por nombre de campo y unidad.       ║
// ║                                                                      ║
// ║  Sin librerías: el .xlsx es un ZIP y el navegador ya trae           ║
// ║  DecompressionStream. SheetJS se carga de un CDN (necesita           ║
// ║  internet); esto funciona sin red y lee solo las hojas que se        ║
// ║  necesitan.                                                          ║
// ║                                                                      ║
// ║  Reglas:                                                             ║
// ║  · El archivo NO se guarda: se guarda lo extraído + su huella.       ║
// ║  · Derivar, sugerir, nunca imponer: lo capturado a mano no se pisa   ║
// ║    sin que el liberador lo elija.                                    ║
// ║  · El doble ciego sigue igual (la Revisión dirigida es otra ronda).  ║
// ║  · El F05 no cambia: solo se llenan campos que ya imprime.           ║
// ╚══════════════════════════════════════════════════════════════════════╝

var VETS_SHEETS = ['TestDetails', 'CycleResults', 'CycleLimitResults', 'SampleLimitResults', 'PostTestMonitoredLimits',
    'PollutantMonitoredLimits', 'CustomFields', 'Entity', 'OBDIIResults', 'OBD II Vehicle Info Logger', 'STARSDataSet',
    // [2.17.1] El reporte visible: de ahí se lee cuando la exportación no trae las tablas de datos.
    'VETS Report', 'Limit Checks', 'OBD II'];

// Columnas de CycleResults por campo de gas de Cascade. Primero la "Regulated" (la que
// reporta VETS), después la cruda.
var VETS_GAS_COLUMNS = {
    CO: ['BagCORegulated', 'BagCO'], CO2: ['BagCO2Regulated', 'BagCO2'], THC: ['BagTHCRegulated', 'BagTHC'],
    NMHC: ['BagNMHCRegulated', 'BagNMHC'], NOX: ['BagNOXRegulated', 'BagNOX'], NMOG: ['BagNMOGRegulated', 'BagNMOG'],
    NMOGNOX: ['BagNMOGpNOXRegulated', 'BagNMOGpNOX'], CH4: ['BagCH4Regulated', 'BagCH4'],
    HCNOX: ['BagHCpNOXRegulated', 'BagHCpNOX'], THCNOX: ['BagHCpNOXRegulated', 'BagHCpNOX'],
    NMHCNOX: ['BagNMHCpNOXRegulated', 'BagNMHCpNOX'], PM: ['PM']
};

// CustomFields de VETS → columnas de la configuración. Solo las que distinguen de
// verdad: Modelo ("8G - CL4" vs "CL4MH"), paquete ambiental ("0 - 12V" vs "0"),
// paquete de motor y manejo darían falsos avisos.
var VETS_CONFIG_FIELDS = {
    BODYTYPE: 'BODY TYPE', TRANSMISSION: 'TRANSMISSION', EMISSIONREGULATION: 'EMISSION REGULATION',
    REGION: 'REGION', ENGINECAPACITY: 'ENGINE CAPACITY', TIREASSY: 'TIRE ASSY', MODELYEAR: 'MODEL YEAR (VIN)'
};

// ══════════════════════════════════════════════════════════════════════
// Lector mínimo de .xlsx (ZIP + XML)
// ══════════════════════════════════════════════════════════════════════

function _vetsU16(b, o) { return b[o] | (b[o + 1] << 8); }
function _vetsU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

/** Directorio central del ZIP → {nombre: {method, csize, dataStart}}. PURA. */
function vetsZipEntries(u8) {
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
        if (_vetsU32(u8, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('El archivo no es un .xlsx válido (no se encontró el índice del ZIP).');
    var n = _vetsU16(u8, eocd + 10), p = _vetsU32(u8, eocd + 16), out = {};
    var dec = new TextDecoder('utf-8');
    for (var k = 0; k < n; k++) {
        if (_vetsU32(u8, p) !== 0x02014b50) break;
        var method = _vetsU16(u8, p + 10), csize = _vetsU32(u8, p + 20);
        var nl = _vetsU16(u8, p + 28), xl = _vetsU16(u8, p + 30), cl = _vetsU16(u8, p + 32);
        var local = _vetsU32(u8, p + 42);
        var name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
        var dataStart = local + 30 + _vetsU16(u8, local + 26) + _vetsU16(u8, local + 28);
        out[name] = { method: method, csize: csize, dataStart: dataStart };
        p += 46 + nl + xl + cl;
    }
    return out;
}

/** Descomprime con lo que trae el navegador. */
function _vetsInflateBrowser(bytes) {
    if (typeof DecompressionStream === 'undefined') {
        return Promise.reject(new Error('Este navegador no puede leer el archivo. Usa Chrome o Edge actualizados.'));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function(b) { return new Uint8Array(b); });
}

function _vetsZipText(u8, entries, name, inflate) {
    var e = entries[name];
    if (!e) return Promise.resolve(null);
    var raw = u8.subarray(e.dataStart, e.dataStart + e.csize);
    var p = e.method === 0 ? Promise.resolve(raw) : e.method === 8 ? inflate(raw)
        : Promise.reject(new Error('Compresión no soportada en ' + name));
    return p.then(function(b) { return new TextDecoder('utf-8').decode(b); });
}

/** Entidades XML → texto. PURA. */
function _vetsXmlDecode(s) {
    return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, function(m, g) {
        if (g === 'amp') return '&'; if (g === 'lt') return '<'; if (g === 'gt') return '>';
        if (g === 'quot') return '"'; if (g === 'apos') return "'";
        var cp = g.charAt(1) === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        try { return String.fromCodePoint(cp); } catch (e) { return m; }
    });
}

/** sharedStrings.xml → arreglo de textos. PURA. */
function vetsSharedStrings(xml) {
    var out = [];
    if (!xml) return out;
    var re = /<si>([\s\S]*?)<\/si>/g, m;
    while ((m = re.exec(xml))) {
        var t = '', r2 = /<t[^>]*>([\s\S]*?)<\/t>/g, n;
        while ((n = r2.exec(m[1]))) t += n[1];
        out.push(_vetsXmlDecode(t));
    }
    return out;
}

/** workbook.xml + sus rels → {nombreDeHoja: 'xl/worksheets/sheetN.xml'}. PURA. */
function vetsWorkbookSheets(wbXml, relsXml) {
    var rels = {}, m, re = /<Relationship\b([^>]*)\/?>/g;
    while ((m = re.exec(relsXml || ''))) {
        var id = /Id="([^"]+)"/.exec(m[1]), tg = /Target="([^"]+)"/.exec(m[1]);
        if (id && tg) rels[id[1]] = tg[1];
    }
    var out = {}, r2 = /<sheet\b([^>]*)\/?>/g;
    while ((m = r2.exec(wbXml || ''))) {
        var nm = /name="([^"]+)"/.exec(m[1]), rid = /r:id="([^"]+)"/.exec(m[1]);
        if (!nm || !rid || !rels[rid[1]]) continue;
        var t = rels[rid[1]].replace(/^\/?xl\//, '').replace(/^\//, '');
        out[_vetsXmlDecode(nm[1])] = 'xl/' + t;
    }
    return out;
}

function _vetsColNum(ref) {
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
        var c = ref.charCodeAt(i);
        if (c < 65 || c > 90) break;
        n = n * 26 + (c - 64);
    }
    return n;
}

/** XML de una hoja → {renglón: {columna: texto}}. PURA. */
function vetsSheetGrid(xml, ss) {
    var grid = {};
    if (!xml) return grid;
    var re = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, m;
    while ((m = re.exec(xml))) {
        var attrs = m[3] || '', body = m[4] || '';
        var t = /\bt="(\w+)"/.exec(attrs), val;
        if (t && t[1] === 'inlineStr') {
            var parts = body.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [];
            val = _vetsXmlDecode(parts.map(function(x) { return x.replace(/<[^>]+>/g, ''); }).join(''));
        } else {
            var v = /<v>([\s\S]*?)<\/v>/.exec(body);
            if (!v) continue;
            val = (t && t[1] === 's') ? (ss[parseInt(v[1], 10)] || '') : _vetsXmlDecode(v[1]);
        }
        var row = m[2];
        (grid[row] = grid[row] || {})[_vetsColNum(m[1])] = val;
    }
    return grid;
}

/**
 * Lee las hojas pedidas de un .xlsx. `inflate(bytes) → Promise<Uint8Array>` se
 * inyecta (navegador: DecompressionStream; pruebas en Node: zlib).
 * Resuelve {nombreDeHoja: grid}.
 */
function vetsReadWorkbook(u8, wanted, inflate) {
    inflate = inflate || _vetsInflateBrowser;
    var entries;
    try { entries = vetsZipEntries(u8); } catch (e) { return Promise.reject(e); }
    var txt = function(n) { return _vetsZipText(u8, entries, n, inflate); };
    return Promise.all([txt('xl/workbook.xml'), txt('xl/_rels/workbook.xml.rels'), txt('xl/sharedStrings.xml')])
        .then(function(r) {
            if (!r[0]) throw new Error('El archivo no parece un reporte de Excel (falta el libro).');
            var sheets = vetsWorkbookSheets(r[0], r[1]);
            var ss = vetsSharedStrings(r[2]);
            var out = {};
            return Promise.all((wanted || Object.keys(sheets)).map(function(nm) {
                if (!sheets[nm]) return null;
                return txt(sheets[nm]).then(function(x) { out[nm] = vetsSheetGrid(x, ss); });
            })).then(function() { return out; });
        });
}

// ══════════════════════════════════════════════════════════════════════
// Tablas y extracción (PURAS: reciben grids, no tocan el DOM)
// ══════════════════════════════════════════════════════════════════════

function _vetsNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim();
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
}

/**
 * Una hoja de datos de STARS → {fields, units, rows, get(col, rowIdx)}. PURA.
 * Renglón 1 = nombres, renglón 2 = unidades/tipo, 3+ = datos. La búsqueda de columna
 * no distingue mayúsculas: STARS escribe `BagNOxRegulated` en un lado y
 * `BagNOXRegulated` en otro.
 */
function vetsTable(grid) {
    grid = grid || {};
    var head = grid['1'] || grid[1] || {}, unitRow = grid['2'] || grid[2] || {};
    var cols = Object.keys(head).map(Number).sort(function(a, b) { return a - b; });
    var byName = {};
    cols.forEach(function(c) { byName[String(head[c]).trim().toUpperCase()] = c; });
    var rowNums = Object.keys(grid).map(Number).filter(function(r) { return r >= 3; }).sort(function(a, b) { return a - b; });
    var rows = rowNums.map(function(r) { return grid[r] || grid[String(r)] || {}; });
    var colOf = function(name) { var k = String(name).trim().toUpperCase(); return byName.hasOwnProperty(k) ? byName[k] : null; };
    return {
        fields: cols.map(function(c) { return head[c]; }),
        rows: rows,
        has: function(name) { return colOf(name) !== null; },
        unit: function(name) { var c = colOf(name); return c === null ? '' : String(unitRow[c] || ''); },
        raw: function(name, i) { var c = colOf(name); return c === null ? null : (rows[i || 0] || {})[c]; },
        num: function(name, i) { var c = colOf(name); return c === null ? null : _vetsNum((rows[i || 0] || {})[c]); },
        text: function(name, i) { var c = colOf(name); var v = c === null ? null : (rows[i || 0] || {})[c]; return v == null ? '' : String(v).trim(); },
        count: rows.length
    };
}

/** Fecha serial de Excel → 'AAAA-MM-DDTHH:MM' (hora del equipo de VETS, sin zona). PURA. */
function vetsSerialToLocal(serial) {
    var n = _vetsNum(serial);
    if (n === null) return '';
    var d = new Date(Math.round((n - 25569) * 86400000));
    var p = function(x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}

/** Coeficientes / masa en la unidad de VETS → SI (N, N/(km/h), N/(km/h)², kg). PURA. */
function vetsToSI(value, unit) {
    var v = _vetsNum(value);
    if (v === null) return null;
    var u = String(unit || '').replace(/\s/g, '').toLowerCase();
    var LBF = 4.4482216153, MPH = 1.609344, LB = 0.45359237;
    if (u === 'lbf') return v * LBF;
    if (u === 'lbf/mph') return v * LBF / MPH;
    if (u === 'lbf/mph²' || u === 'lbf/mph^2' || u === 'lbf/mph2') return v * LBF / (MPH * MPH);
    if (u === 'lb' || u === 'lbs') return v * LB;
    return v;   // N, N/(km/h), N/(km/h)², kg: ya es SI
}

/** "A - 5DR" → {code:'A', label:'5DR'}; "OTHER"/vacío → null. PURA. */
function _vetsCodeLabel(s) {
    s = String(s || '').trim();
    if (!s || /^OTHERS?$/i.test(s)) return null;
    var m = /^(\S+)\s+-\s+(.+)$/.exec(s);
    return m ? { code: m[1], label: m[2].trim() } : { code: '', label: s };
}

// Lo que sale de TestDetails y del logger OBD lo comparten las dos formas de exportar
// (con tablas de datos, o solo el reporte visible).
function _vetsIdentity(rec, td, ent) {
    rec.testRef = ent.text('Entity.ID') || td.text('PwsOneImport.NameResolved') || '';
    rec.testNumber = td.num('TestNumber');
    rec.testName = td.text('TestName');
    rec.procedure = td.text('TestProcedureName');
    rec.regulationSpec = td.text('Vehicle.RegulationSpecificationName') || td.text('Cycle.RegulationSpecificationName');
    rec.regulationDesc = td.text('Regulation.Description');
    rec.vehicleName = td.text('VehicleName');
    rec.fuelName = td.text('FuelName');
    rec.fuelType = td.text('FuelType');
    rec.category = td.text('Test.Category');
}

function _vetsDynoAmbient(rec, td) {
    // Dinamómetro (siempre en SI, como lo guarda Operación)
    var co = function(pref, x) { return vetsToSI(td.raw(pref + '.RoadLoadCoefficient' + x), td.unit(pref + '.RoadLoadCoefficient' + x)); };
    rec.dyno = {
        tA: co('Highway', 'A'), tB: co('Highway', 'B'), tC: co('Highway', 'C'),
        dA: co('Dyno', 'A'), dB: co('Dyno', 'B'), dC: co('Dyno', 'C'),
        etw: vetsToSI(td.raw('Target.EffectiveInertia'), td.unit('Target.EffectiveInertia')),
        units: td.unit('Highway.RoadLoadCoefficientA') || ''
    };
    rec.ambient = {
        cellTempC: (function() { var k = td.num('CellTemperature'); return k === null ? null : (/k/i.test(td.unit('CellTemperature')) ? k - 273.15 : k); })(),
        rhPct: td.num('RelativeHumidity')
    };
}

function _vetsObdLogger(rec, lg) {
    // El logger escribe cada variable con su propia marca de tiempo (difieren en
    // microsegundos dentro de una misma lectura), así que NO se agrupa por hora: se
    // toma el último valor no vacío de cada variable (la lectura al final de la prueba).
    // [2.17.1] Cada módulo que responde por OBD (S09EcuNumber) trae su propio CALID/CVN:
    // en un 48V el de la batería (BECM) llega DESPUÉS del motor y lo pisaba. Manda el
    // módulo de control del motor (ECUNAME con ECM/Engine); sin nombre, el de menor número.
    var byEcu = {};
    for (var q = 0; q < lg.count; q++) {
        var k2 = lg.text('S09VarName', q), vv2 = lg.text('S09VarValue', q);
        var ecu = lg.text('S09EcuNumber', q) || '0';
        if (k2 && vv2) (byEcu[ecu] = byEcu[ecu] || {})[k2.toUpperCase()] = vv2;
    }
    var ecus = Object.keys(byEcu).sort(function(a, b) { return (parseFloat(a) || 0) - (parseFloat(b) || 0); });
    var main = ecus.filter(function(e) { return /\bECM\b|ENGINE/i.test(byEcu[e].ECUNAME || ''); })[0] || ecus[0];
    var last = main ? byEcu[main] : {};
    if (!last.VIN) ecus.forEach(function(e) { if (!last.VIN && byEcu[e].VIN) last.VIN = byEcu[e].VIN; });
    rec.vinEcu = String(last.VIN || '').trim().toUpperCase();
    rec.obd.calid = String(last.CALID || '').trim();
    rec.obd.cvn = String(last.CVN || '').trim();
}

// ══════════════════════════════════════════════════════════════════════
// [2.17.1] Exportación con solo el reporte visible
// ══════════════════════════════════════════════════════════════════════
// Algunas exportaciones de VETS traen TestDetails pero no las tablas de datos
// (CycleResults, límites, CustomFields, Entity, OBDIIResults). Lo que falta se lee del
// reporte visible ("VETS Report", "Limit Checks", "OBD II"). Ese reporte cambia de
// acomodo entre plantillas, así que se lee SIEMPRE por la etiqueta de la fila o del
// encabezado de la columna, nunca por la posición de la celda.

var _VETS_VALUE_RE = /^([-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?|PASS|FAIL|ON|OFF|N\/A|∞|-∞)$/i;

/** Renglones de una hoja como [{r, c:{col: texto}}], en orden. PURA. */
function _vetsGridRows(grid) {
    return Object.keys(grid || {}).map(Number).sort(function(a, b) { return a - b; }).map(function(r) {
        var src = grid[r] || grid[String(r)] || {}, c = {};
        Object.keys(src).forEach(function(k) { var v = String(src[k] == null ? '' : src[k]).trim(); if (v) c[Number(k)] = v; });
        return { r: r, c: c };
    });
}
function _vetsCols(row) { return Object.keys(row.c).map(Number).sort(function(a, b) { return a - b; }); }
/** 'Starting Mileage (km)' → {name:'STARTING MILEAGE', unit:'km'}. */
function _vetsLabel(s) {
    var m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(String(s || '').trim());
    return { name: (m ? m[1] : String(s || '')).trim().toUpperCase(), unit: m ? m[2].trim() : '' };
}

/** Primer valor a la derecha de la etiqueta `label` (sin su unidad). {value, unit} o null. PURA. */
function vetsReportValue(grid, label) {
    var want = _vetsLabel(label).name, rows = _vetsGridRows(grid);
    for (var i = 0; i < rows.length; i++) {
        var cols = _vetsCols(rows[i]);
        for (var j = 0; j < cols.length - 1; j++) {
            var l = _vetsLabel(rows[i].c[cols[j]]);
            if (l.name === want) return { value: rows[i].c[cols[j + 1]], unit: l.unit };
        }
    }
    return null;
}

/**
 * Una tabla del reporte a partir de su renglón ancla (el del título, que casi siempre
 * trae también las unidades). Encabezados = el renglón no vacío de arriba. Filas = las
 * que siguen mientras tengan valores bajo los encabezados. PURA.
 * → {names:{col:NOMBRE}, units:{col:unidad}, rows:[{label, cells:{NOMBRE: texto}}]}
 */
function vetsReportBlock(grid, anchorRow) {
    var rows = _vetsGridRows(grid), ai = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i].r === anchorRow) ai = i;
    if (ai < 1) return null;
    var head = rows[ai - 1], names = {}, units = {};
    _vetsCols(head).forEach(function(c) { names[c] = head.c[c]; });
    var nameCols = Object.keys(names).map(Number);
    if (!nameCols.length) return null;
    var firstCol = Math.min.apply(null, nameCols);
    nameCols.forEach(function(c) {
        var u = rows[ai].c[c];
        if (u && /^\(.*\)$/.test(u)) units[c] = u.slice(1, -1).trim();
    });
    var out = { names: {}, units: {}, rows: [] };
    nameCols.forEach(function(c) { out.names[c] = names[c].toUpperCase(); if (units[c]) out.units[names[c].toUpperCase()] = units[c]; });
    for (var k = ai + 1; k < rows.length; k++) {
        var row = rows[k], cells = {}, hasVal = false;
        nameCols.forEach(function(c) {
            if (row.c[c] === undefined) return;
            cells[out.names[c]] = row.c[c];
            if (_VETS_VALUE_RE.test(row.c[c])) hasVal = true;
        });
        if (!hasVal) break;
        var label = _vetsCols(row).filter(function(c) { return c < firstCol; }).map(function(c) { return row.c[c]; }).join(' ').trim();
        out.rows.push({ label: label, cells: cells });
    }
    return out;
}

/** Renglón donde alguna celda dice exactamente `text`. PURA. */
function _vetsRowWith(grid, text, fromRow) {
    var want = String(text).trim().toUpperCase(), rows = _vetsGridRows(grid);
    for (var i = 0; i < rows.length; i++) {
        if (fromRow && rows[i].r <= fromRow) continue;
        for (var c in rows[i].c) if (rows[i].c[c].toUpperCase() === want) return rows[i].r;
    }
    return null;
}
function _vetsBlockRow(block, label) {
    var want = String(label).toUpperCase();
    return block ? (block.rows.filter(function(r) { return r.label.toUpperCase() === want; })[0] || null) : null;
}

/**
 * Verificaciones (Limit Checks) del reporte visible. Cada encabezado con "Checked
 * Parameter" y "Status" abre una tabla (vectoriales y escalares tienen columnas
 * distintas); las filas del mismo nombre (una por muestra) se juntan. PURA.
 */
function vetsReportChecks(grid) {
    var rows = _vetsGridRows(grid), map = null, byName = {}, order = [];
    rows.forEach(function(row) {
        var cols = _vetsCols(row), up = {};
        cols.forEach(function(c) { up[row.c[c].toUpperCase()] = c; });
        if (up['CHECKED PARAMETER'] !== undefined && up.STATUS !== undefined) { map = up; return; }
        if (!map) return;
        var st = String(row.c[map.STATUS] || '').toUpperCase();
        if (st !== 'PASS' && st !== 'FAIL') return;
        var name = cols.filter(function(c) { return c < map['CHECKED PARAMETER']; }).map(function(c) { return row.c[c]; }).join(' ').trim();
        if (!name) return;
        var get = function(k) { return map[k] === undefined ? null : _vetsNum(row.c[map[k]]); };
        var period = map.PERIOD === undefined ? '' : String(row.c[map.PERIOD] || '');
        var chk = byName[name];
        if (!chk) {
            chk = byName[name] = { name: name, unit: map.UNIT === undefined ? '' : String(row.c[map.UNIT] || ''),
                lo: get('LO LIMIT'), hi: get('HI LIMIT'), status: 'PASS', where: [] };
            order.push(name);
        }
        if (st === 'FAIL') {
            chk.status = 'FAIL';
            var sm = /^sample\s*(\d+)/i.exec(period);
            chk.where.push(sm ? 'muestra ' + sm[1] : (period && !/^cycle$/i.test(period) ? period : 'ciclo'));
        }
        if (/^sample/i.test(period)) return;   // lo estadístico del ciclo, no de cada muestra
        if (get('AVERAGE') !== null && chk.ave == null) chk.ave = get('AVERAGE');
        if (get('MAXIMUM') !== null) chk.max = get('MAXIMUM');
        if (get('MINIMUM') !== null) chk.min = get('MINIMUM');
        if (chk.ave == null && get('RESULT') !== null) chk.value = get('RESULT');
    });
    return order.map(function(n) { return byName[n]; });
}

/** Nombre del gas en el reporte ('HC+NOx', 'NMOG+NOx') → campo de Cascade. */
function _vetsReportGasKey(name) {
    var k = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return VETS_GAS_COLUMNS.hasOwnProperty(k) ? k : null;
}

/**
 * La prueba desde el reporte visible + TestDetails. Mismo registro que `vetsExtract`,
 * con `source: 'reporte'`. Lo que el reporte no trae se queda vacío (config de VETS,
 * operador, OBFCM antes/después), nunca se inventa. PURA.
 */
function vetsExtractFromReport(sheets, td) {
    var rep = sheets['VETS Report'] || {};
    var rec = { format: 1, source: 'reporte' };
    _vetsIdentity(rec, td, vetsTable(sheets.Entity));
    var val = function(l) { var x = vetsReportValue(rep, l); return x ? x.value : ''; };
    rec.testStart = vetsSerialToLocal(val('Start Time') || val('Date'));
    rec.testEnd = vetsSerialToLocal(val('End Time'));

    var bagRow = _vetsRowWith(rep, 'Bag Analysis Results');
    var bag = bagRow ? vetsReportBlock(rep, bagRow) : null;
    var total = _vetsBlockRow(bag, 'Total');
    if (!total) throw new Error('El reporte de VETS no trae la tabla "Bag Analysis Results" con la fila Total: no hay resultados de emisiones que leer.');
    rec.distanceKm = (function() {
        var d = _vetsNum(total.cells.DISTANCE), u = bag.units.DISTANCE || '';
        if (d === null) return null;
        return /mi/i.test(u) ? d * 1.609344 : d;
    })();

    rec.vinFile = String(val('VIN') || '').trim().toUpperCase();
    rec.operator = val('Operator') || '';
    rec.driver = val('Driver') || '';
    rec.startKm = _vetsNum(val('Starting Mileage'));
    rec.endKm = _vetsNum(val('Ending Mileage'));
    rec.config = {};

    _vetsDynoAmbient(rec, td);

    rec.gases = {};
    Object.keys(bag.names).forEach(function(c) {
        var nm = bag.names[c], key = _vetsReportGasKey(nm), v = _vetsNum(total.cells[nm]);
        if (!key || v === null) return;
        var g = { value: v, unit: bag.units[nm] || '', column: 'VETS Report · ' + nm };
        rec.gases[key] = g;
        // HC+NOx y THC+NOx son el mismo valor en VETS (misma columna en CycleResults)
        if (key === 'HCNOX' && !rec.gases.THCNOX) rec.gases.THCNOX = g;
        if (key === 'THCNOX' && !rec.gases.HCNOX) rec.gases.HCNOX = g;
    });

    // Tabla de límites de VETS: el renglón con "Limit" y después "Status". Su título es el
    // nombre de la norma, así que se ancla por las filas, no por el título.
    rec.vetsLimits = [];
    var limRow = null, rrows = _vetsGridRows(rep);
    for (var i = 1; i < rrows.length && !limRow; i++) {
        var labs = _vetsCols(rrows[i]).map(function(c) { return rrows[i].c[c].toUpperCase(); });
        if (labs.indexOf('LIMIT') >= 0 && _vetsRowWith(rep, 'Status', rrows[i].r)) limRow = rrows[i - 1].r;
    }
    var lim = limRow ? vetsReportBlock(rep, limRow) : null;
    if (lim) {
        var lL = _vetsBlockRow(lim, 'Limit'), lR = _vetsBlockRow(lim, 'Result'), lS = _vetsBlockRow(lim, 'Status');
        Object.keys(lim.names).forEach(function(c) {
            var nm = lim.names[c];
            var up = lL ? _vetsNum(lL.cells[nm]) : null, v = lR ? _vetsNum(lR.cells[nm]) : null;
            var st = lS ? String(lS.cells[nm] || '').toUpperCase() : '';
            if (up === null && v === null) return;
            rec.vetsLimits.push({ name: nm, unit: lim.units[nm] || '', upper: up, value: v,
                pass: st === 'PASS' ? true : st === 'FAIL' ? false : ((v === null || up === null) ? null : v <= up) });
        });
    }

    rec.checks = vetsReportChecks(sheets['Limit Checks']);
    if (!rec.checks.length) rec.checks = vetsReportChecks(rep);

    var drvRow = _vetsRowWith(rep, 'Drive Trace Indices');
    var drv = drvRow ? vetsReportBlock(rep, drvRow) : null, dc = _vetsBlockRow(drv, 'Cycle');
    var dn = function(k) { return dc ? _vetsNum(dc.cells[k]) : null; };
    rec.drive = { rmsse: dn('RMSSE'), rmsseUnit: drv ? (drv.units.RMSSE || '') : '', iwr: dn('IWR'), er: dn('ER'), dr: dn('DR'),
                  driverErrors: dn('ERROR COUNT'), violations: dn('VIOLATION COUNT') };

    var obdSheet = sheets['OBD II'] || {};
    var milRow = _vetsRowWith(obdSheet, 'MIL Status');
    var mil = milRow ? vetsReportBlock(obdSheet, milRow) : null;
    var m0 = mil && mil.rows[0] ? mil.rows[0].cells : {};
    rec.obd = { mil: String(m0['MIL ON'] || ''), milDistanceKm: _vetsNum(m0['DIST. SINCE ON']) };
    _vetsObdLogger(rec, vetsTable(sheets['OBD II Vehicle Info Logger']));

    var ofRow = _vetsRowWith(obdSheet, 'On-Board Fuel Consumption Meter');
    var of = ofRow ? vetsReportBlock(obdSheet, ofRow) : null;
    var o0 = of && of.rows[0] ? of.rows[0].cells : null;
    rec.obfcm = (o0 && _vetsNum(o0['CONSUMED FUEL']) !== null) ? {
        fuelL: _vetsNum(o0['CONSUMED FUEL']), accuracyPct: _vetsNum(o0['CONSUMED FUEL ACCURACY']),
        fuelBeforeL: null, fuelAfterL: null,
        distKm: _vetsNum(o0['DISTANCE TRAVELLED']), distBeforeKm: null, distAfterKm: null,
        testFuelL: _vetsNum(o0['CONSUMED FUEL BAG'])
    } : null;
    return rec;
}

/**
 * Todo lo que Cascade usa de una prueba VETS. PURA.
 * `sheets` = {nombreDeHoja: grid}. Devuelve el registro o lanza con un mensaje que
 * dice qué falta.
 */
function vetsExtract(sheets) {
    sheets = sheets || {};
    var T = function(n) { return vetsTable(sheets[n]); };
    var td = T('TestDetails'), cr = T('CycleResults');
    // [2.17.1] Hay exportaciones que traen TestDetails pero NO CycleResults (ni límites,
    // CustomFields, Entity ni OBDIIResults): lo que falta está en el reporte visible.
    if (td.count && !cr.count && sheets['VETS Report']) return vetsExtractFromReport(sheets, td);
    if (!td.count || !cr.count) {
        throw new Error('Este archivo no trae las tablas de datos de VETS (TestDetails / CycleResults). ¿Es el reporte de Excel que exporta STARS VETS?');
    }
    var rec = { format: 1 };

    _vetsIdentity(rec, td, T('Entity'));
    rec.testStart = vetsSerialToLocal(cr.raw('CycleStart'));
    rec.testEnd = vetsSerialToLocal(cr.raw('CycleEnd'));
    rec.distanceKm = (function() {
        var d = cr.num('Distance'), u = cr.unit('Distance');
        if (d === null) return null;
        return /mi/i.test(u) ? d * 1.609344 : d;
    })();

    // CustomFields: VIN, personas, kilometraje y la configuración que capturó VETS.
    var cf = T('CustomFields'), custom = {};
    for (var i = 0; i < cf.count; i++) custom[cf.text('CustomFieldName', i).toUpperCase()] = cf.text('Answer', i);
    rec.vinFile = String(custom.VIN || '').trim().toUpperCase();
    rec.operator = custom.OPERATOR || '';
    rec.driver = custom.DRIVER || '';
    rec.startKm = _vetsNum(custom.STARTINGMILEAGE);
    rec.endKm = _vetsNum(custom.ENDINGMILEAGE);
    rec.config = {};
    Object.keys(VETS_CONFIG_FIELDS).forEach(function(k) {
        var cl = _vetsCodeLabel(custom[k]);
        if (cl) rec.config[VETS_CONFIG_FIELDS[k]] = cl;
    });

    _vetsDynoAmbient(rec, td);

    // Gases (resultado del ciclo)
    rec.gases = {};
    Object.keys(VETS_GAS_COLUMNS).forEach(function(f) {
        var cols = VETS_GAS_COLUMNS[f];
        for (var j = 0; j < cols.length; j++) {
            if (!cr.has(cols[j])) continue;
            var v = cr.num(cols[j]);
            if (v === null) continue;
            rec.gases[f] = { value: v, unit: cr.unit(cols[j]), column: cols[j] };
            break;
        }
    });

    // Lo que VETS juzgó contra SUS límites (informativo: Cascade juzga con el perfil)
    var pl = T('PollutantMonitoredLimits');
    rec.vetsLimits = [];
    for (var a = 0; a < pl.count; a++) {
        var colName = pl.text('Column', a), up = pl.num('UpperLimit', a);
        var val = cr.num(colName);
        rec.vetsLimits.push({ name: pl.text('Name', a), unit: pl.text('Unit', a), upper: up, value: val,
            pass: (val === null || up === null) ? null : val <= up });
    }

    // Verificaciones de validez de la prueba (Limit Checks)
    var defs = T('PostTestMonitoredLimits'), cyc = T('CycleLimitResults'), smp = T('SampleLimitResults');
    rec.checks = [];
    for (var b = 0; b < defs.count; b++) {
        var name = defs.text('Name', b);
        if (!name) continue;
        var flags = [];
        if (cyc.has(name + 'Pass')) flags.push({ where: 'ciclo', pass: cyc.num(name + 'Pass') === 1 });
        if (smp.has(name + 'Pass')) {
            for (var s = 0; s < smp.count; s++) {
                var fl = smp.num(name + 'Pass', s);
                if (fl !== null) flags.push({ where: 'muestra ' + (smp.num('SampleIndex', s) || s + 1), pass: fl === 1 });
            }
        }
        if (!flags.length) continue;
        var fallas = flags.filter(function(x) { return !x.pass; });
        var chk = { name: name, unit: defs.text('Unit', b), lo: defs.num('LowerLimit', b), hi: defs.num('UpperLimit', b),
                    status: fallas.length ? 'FAIL' : 'PASS', where: fallas.map(function(x) { return x.where; }) };
        if (cyc.has(name + 'Ave')) chk.ave = cyc.num(name + 'Ave');
        if (cyc.has(name + 'Max')) chk.max = cyc.num(name + 'Max');
        if (cyc.has(name + 'Min')) chk.min = cyc.num(name + 'Min');
        // Sin estadística propia (p. ej. el factor de dilución): el valor del ciclo, por
        // la columna que declara la verificación.
        var colV = defs.text('Column', b);
        if (chk.ave == null && chk.max == null && colV && cr.has(colV)) chk.value = cr.num(colV);
        rec.checks.push(chk);
    }

    rec.drive = {
        rmsse: cr.num('RootMeanSquaredSpeedError'), rmsseUnit: cr.unit('RootMeanSquaredSpeedError'),
        iwr: cr.num('InertialWorkRating'), er: cr.num('EnergyRating'), dr: cr.num('DistanceRating'),
        driverErrors: cr.num('DriverErrorCount'), violations: cr.num('ViolationCount')
    };

    // OBD y OBFCM. La exactitud es la que CALCULA VETS (Anexo XXII §4.2): no se
    // reinventa aquí la referencia de la norma.
    var obdr = T('OBDIIResults');
    rec.obd = { mil: obdr.text('MILOn') || '', milDistanceKm: obdr.num('MILDistance') };
    _vetsObdLogger(rec, T('OBD II Vehicle Info Logger'));
    if (cr.has('OnBoardFuelConsumed')) {
        rec.obfcm = {
            fuelL: cr.num('OnBoardFuelConsumed'), accuracyPct: cr.num('OnBoardFuelConsumedAccuracy'),
            fuelBeforeL: cr.num('OnBoardFuelConsumedBeforeTest'), fuelAfterL: cr.num('OnBoardFuelConsumedAfterTest'),
            distKm: cr.num('OnBoardDistanceTravelled'), distBeforeKm: cr.num('OnBoardDistanceTravelledBeforeTest'),
            distAfterKm: cr.num('OnBoardDistanceTravelledAfterTest'),
            testFuelL: cr.num('FuelConsumedBag')
        };
    } else {
        rec.obfcm = null;
    }
    return rec;
}

// ══════════════════════════════════════════════════════════════════════
// Decisiones (PURAS)
// ══════════════════════════════════════════════════════════════════════

/** Valor de un gas de VETS convertido a `toUnit` (la del perfil). null si no hay. PURA. */
function vetsGasValue(rec, field, toUnit) {
    if (!rec || !rec.gases) return null;
    var g = rec.gases[String(field || '').toUpperCase().replace(/[^A-Z0-9]/g, '')];
    if (!g) return null;
    var F = (typeof GAS_UNIT_FACTORS !== 'undefined') ? GAS_UNIT_FACTORS : null;
    var from = String(g.unit || '').trim(), to = String(toUnit || from).trim();
    if (from === to || !F) return g.value;
    if (!F[from] || !F[to]) return null;   // unidad que no se sabe convertir: no se inventa
    return g.value * F[from] / F[to];
}

/**
 * VIN a tres bandas: el del Alta, el que se tecleó en VETS y el que lee el ECU. PURA.
 * Devuelve {status, ok, block, suggestVin, message}:
 *  ok · alta (se tecleó mal el Alta) · archivo (se tecleó mal en VETS) · ninguno (archivo
 *  equivocado: bloquea) · dudoso (sin ECU, no se puede decidir) · sin-dato.
 */
function vetsVinCheck(altaVin, fileVin, ecuVin) {
    var n = function(v) { return String(v || '').trim().toUpperCase(); };
    var A = n(altaVin), F = n(fileVin), E = n(ecuVin);
    var cd = function(v) { return (typeof vinCheckDigit === 'function') ? vinCheckDigit(v).valid : null; };
    if (!F && !E) return { status: 'sin-dato', ok: true, block: false, message: 'El archivo no trae VIN: no se pudo comparar.' };
    var ref = F || E;
    if (ref === A && (!E || E === A)) return { status: 'ok', ok: true, block: false, message: 'El VIN coincide' + (E ? ' (Alta, VETS y ECU).' : ' (Alta y VETS).') };
    if (E) {
        if (F && F === E && A !== F) return { status: 'alta', ok: false, block: false, suggestVin: F,
            message: 'VETS y el ECU dicen ' + F + ' y el Alta dice ' + A + ': lo más probable es que el Alta se haya tecleado mal.' };
        if (A === E && F !== A) return { status: 'archivo', ok: false, block: false,
            message: 'El Alta y el ECU dicen ' + A + ' pero en VETS se tecleó ' + (F || '(vacío)') + ': el vehículo es el correcto; el VIN en VETS quedó mal.' };
        if (!F && E !== A) return { status: 'alta', ok: false, block: false, suggestVin: E,
            message: 'El ECU dice ' + E + ' y el Alta ' + A + '.' };
        return { status: 'ninguno', ok: false, block: true,
            message: 'Ningún VIN coincide (Alta ' + A + ', VETS ' + F + ', ECU ' + E + '): parece el archivo de otra prueba.' };
    }
    var cdA = cd(A), cdF = cd(F);
    if (cdF === true && cdA === false) return { status: 'alta', ok: false, block: false, suggestVin: F,
        message: 'VETS dice ' + F + ' y el Alta ' + A + '; el del Alta no pasa el dígito verificador: lo más probable es que se haya tecleado mal.' };
    if (cdA === true && cdF === false) return { status: 'archivo', ok: false, block: false,
        message: 'El Alta dice ' + A + ' y en VETS se tecleó ' + F + ', que no pasa el dígito verificador: el VIN en VETS quedó mal.' };
    return { status: 'dudoso', ok: false, block: false, suggestVin: F,
        message: 'El Alta dice ' + A + ' y VETS ' + F + ', y esta prueba no leyó el VIN del ECU: revisa cuál es el correcto.' };
}

/** Diferencias entre la configuración del Alta y la que capturó VETS. PURA. */
function vetsConfigCheck(vehicleConfig, recConfig) {
    var out = [];
    var norm = function(s) { return String(s || '').toUpperCase().replace(/\s+/g, ''); };
    Object.keys(recConfig || {}).forEach(function(key) {
        var alta = (vehicleConfig || {})[key];
        if (alta == null || alta === '') return;
        var cl = recConfig[key];
        var a = norm(alta);
        if (a === norm(cl.label) || (cl.code && a === norm(cl.code))) return;
        out.push({ key: key, alta: String(alta), vets: cl.label });
    });
    return out;
}

/**
 * Cómo trata el laboratorio cada verificación que falló. PURA.
 * policy = [{id: nombre, level: 'importante'|'informativa'|'desacreditada', reason}].
 * Devuelve [{check, level|null (nueva), known}] solo de las que fallaron.
 */
function vetsClassifyChecks(checks, policy) {
    var map = {};
    (policy || []).forEach(function(p) { if (p && p.id) map[String(p.id).toUpperCase()] = p; });
    return (checks || []).filter(function(c) { return c.status === 'FAIL'; }).map(function(c) {
        var p = map[String(c.name).toUpperCase()];
        return { check: c, level: p ? p.level : null, known: !!p, reason: p ? (p.reason || '') : '' };
    });
}

/** Texto corto de por qué falló una verificación. PURA. */
function vetsCheckDetail(c) {
    var lim = (c.lo !== null && c.lo !== undefined && c.hi !== null && c.hi !== undefined) ? c.lo + '–' + c.hi
        : (c.hi !== null && c.hi !== undefined) ? 'máx. ' + c.hi : (c.lo !== null && c.lo !== undefined) ? 'mín. ' + c.lo : '';
    var val = '';
    if (c.max != null && c.hi != null && c.max > c.hi) val = 'máx. ' + _vetsFmt(c.max);
    else if (c.min != null && c.lo != null && c.min < c.lo) val = 'mín. ' + _vetsFmt(c.min);
    else if (c.ave != null) val = 'prom. ' + _vetsFmt(c.ave);
    else if (c.value != null) val = 'ciclo ' + _vetsFmt(c.value);
    return [val, lim ? 'límite ' + lim + (c.unit ? ' ' + c.unit : '') : '', (c.where || []).length ? 'en ' + c.where.join(', ') : '']
        .filter(Boolean).join(' · ');
}

function _vetsFmt(v, sig) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var n = Number(v);
    if (n === 0) return '0';
    return String(parseFloat(n.toPrecision(sig || 4)));
}

/**
 * ¿El valor capturado a mano coincide con el de VETS? PURA.
 * Coincide si la diferencia cabe en el redondeo de lo que se tecleó (media unidad del
 * último dígito guardado) o es menor a 0.5 %.
 */
function vetsCompareValue(stored, vets) {
    var a = _vetsNum(stored), b = _vetsNum(vets);
    if (a === null || b === null) return { ok: null, diff: null, diffPct: null };
    var diff = a - b;
    var s = String(a), dec = s.indexOf('e') >= 0 ? 12 : (s.split('.')[1] || '').length;
    var halfUlp = 0.5 * Math.pow(10, -dec);
    var pct = b !== 0 ? (diff / b) * 100 : (a === 0 ? 0 : 100);
    return { ok: Math.abs(diff) <= halfUlp + 1e-12 || Math.abs(pct) <= 0.5, diff: diff, diffPct: pct };
}

// ══════════════════════════════════════════════════════════════════════
// Política de verificaciones del laboratorio (pnState.vetsChecks, sincronizada)
// ══════════════════════════════════════════════════════════════════════

var VETS_LEVELS = {
    importante:    { label: 'Importante',    help: 'Si falla, se justifica en esa prueba o no se envía.' },
    informativa:   { label: 'Informativa',   help: 'Se muestra, no detiene.' },
    desacreditada: { label: 'Desacreditada', help: 'Mal configurada en VETS: no se vuelve a preguntar (queda guardada en el registro).' }
};

function vetsPolicy() {
    return (typeof pnState !== 'undefined' && pnState && Array.isArray(pnState.vetsChecks)) ? pnState.vetsChecks : [];
}

/** Guarda la clasificación de una verificación para todo el laboratorio. */
function vetsPolicySet(name, level, reason, opts) {
    opts = opts || {};
    if (!VETS_LEVELS[level]) return false;
    if (typeof pnState === 'undefined' || !pnState) return false;
    if (!opts.skipAuth && typeof authRequire === 'function' && !authRequire(opts.perm || 'test.release', 'clasificar verificaciones de VETS')) return false;
    if (!Array.isArray(pnState.vetsChecks)) pnState.vetsChecks = [];
    var id = String(name).trim(), now = new Date().toISOString();
    var by = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
    var prev = pnState.vetsChecks.find(function(p) { return p && String(p.id).toUpperCase() === id.toUpperCase(); });
    var antes = prev ? ((VETS_LEVELS[prev.level] || {}).label || prev.level) : '(sin clasificar)';
    if (prev) { prev.level = level; prev.reason = reason || ''; prev.by = by; prev.timestamp = now; }
    else pnState.vetsChecks.push({ id: id, level: level, reason: reason || '', by: by, timestamp: now });
    if (typeof auditLog === 'function') {
        auditLog('cop15', 'vets_verificacion_clasificada', { type: 'vets', id: id, label: id },
            antes + ' → ' + VETS_LEVELS[level].label + (reason ? ' · motivo: ' + reason : ''),
            { before: { tratamiento: antes }, after: { tratamiento: VETS_LEVELS[level].label, motivo: reason || '' } });
    }
    if (!opts.skipSave && typeof pnSave === 'function') pnSave();
    return true;
}

/** Tarjeta de Datos → Regulaciones: cómo trata el laboratorio cada verificación. */
function vetsPolicyCardHTML() {
    var pol = vetsPolicy().slice().sort(function(a, b) { return String(a.id).localeCompare(String(b.id)); });
    var h = '<div class="tp-card" style="margin-bottom:var(--space-md);">' +
        '<div style="font-weight:700;font-size:var(--fs-sm);" data-help="vets_politica">🧪 Verificaciones de VETS</div>' +
        '<div class="u-muted" style="font-size:var(--fs-xs);margin:var(--space-2xs) 0 var(--space-sm);">Cómo trata el laboratorio cada verificación de validez de VETS cuando falla. ' +
        'Se decide la primera vez que falla, al adjuntar la prueba en Liberación; aquí se cambia.</div>';
    if (!pol.length) {
        return h + '<div class="u-muted" style="font-size:var(--fs-sm);">Todavía ninguna. Aparecen aquí cuando una verificación falla por primera vez.</div></div>';
    }
    h += '<table class="u-cards" style="width:100%;font-size:var(--fs-xs);border-collapse:collapse;"><thead><tr>' +
        ['Verificación', 'Tratamiento', 'Motivo', 'Quién / cuándo'].map(function(t) { return '<th style="text-align:left;padding:var(--space-2xs) var(--space-sm);">' + t + '</th>'; }).join('') +
        '</tr></thead><tbody>';
    pol.forEach(function(p) {
        var idq = escapeHtml(String(p.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
        h += '<tr><td style="padding:var(--space-2xs) var(--space-sm);font-weight:600;">' + escapeHtml(p.id) + '</td>' +
            '<td style="padding:var(--space-2xs) var(--space-sm);"><select aria-label="Tratamiento de ' + escapeHtml(p.id) + '" onchange="vetsPolicyChange(\'' + idq + '\', this.value, this)">' +
            Object.keys(VETS_LEVELS).map(function(l) { return '<option value="' + l + '"' + (p.level === l ? ' selected' : '') + '>' + VETS_LEVELS[l].label + '</option>'; }).join('') +
            '</select></td>' +
            '<td style="padding:var(--space-2xs) var(--space-sm);">' + escapeHtml(p.reason || '—') + '</td>' +
            '<td style="padding:var(--space-2xs) var(--space-sm);" class="u-muted">' + escapeHtml(p.by || '—') + (p.timestamp ? ' · ' + escapeHtml(String(p.timestamp).slice(0, 10)) : '') + '</td></tr>';
    });
    return h + '</tbody></table></div>';
}

/** Cambiar el tratamiento desde Regulaciones (quien administra límites; se audita). */
function vetsPolicyChange(id, level, sel) {
    var prev = vetsPolicy().find(function(p) { return p && p.id === id; });
    var restore = function() { if (sel && prev) sel.value = prev.level; };
    if (typeof authRequire === 'function' && !authRequire('regulation.manage', 'cambiar el tratamiento de verificaciones de VETS')) { restore(); return; }
    var ask = level === 'desacreditada' && typeof uiPrompt === 'function'
        ? uiPrompt({ title: 'Desacreditar "' + id + '"', label: 'Motivo', placeholder: 'Ej.: el límite en VETS está mal configurado', required: true })
        : Promise.resolve(prev && prev.reason || '');
    ask.then(function(reason) {
        if (reason === null) { restore(); return; }
        if (level === 'desacreditada' && String(reason).length < 5) { showToast('Escribe un motivo de al menos 5 caracteres.', 'warning'); restore(); return; }
        if (vetsPolicySet(id, level, reason, { skipAuth: true })) {
            showToast('"' + id + '" ahora es ' + VETS_LEVELS[level].label + '.', 'success');
            if (typeof pnRender === 'function') pnRender();
        } else restore();
    });
}

// ══════════════════════════════════════════════════════════════════════
// [2.18.0] Adjunta uno, decide el liberador
// ══════════════════════════════════════════════════════════════════════
// Técnico y Especialista adjuntan la prueba (test.vets): se llenan los datos y las
// fallas que el laboratorio ya clasificó se aplican solas. Las fallas NUEVAS (sin
// clasificar) y las Importantes sin justificar quedan pendientes: las decide el
// liberador (test.release) y no se envía a aprobación hasta que lo haga.

/** ¿La sesión decide fallas de VETS (clasificar, justificar)? */
function vetsCanDecide() {
    return (typeof _cascadeCan === 'function') ? _cascadeCan('test.release')
        : (typeof authCan === 'function') ? authCan('test.release') : true;
}

/**
 * Fallas del resumen que aún esperan decisión del liberador. PURA.
 * Una falla sin nivel toma el que el laboratorio haya fijado DESPUÉS (política vigente).
 * → [{name, detail, need:'clasificar'|'justificar'}]
 */
function vetsPendingDecisions(summary, policy) {
    if (!summary || !Array.isArray(summary.checksFail)) return [];
    var map = {};
    (policy || []).forEach(function(p) { if (p && p.id) map[String(p.id).toUpperCase()] = p; });
    return summary.checksFail.map(function(c) {
        var p = map[String(c.name || '').toUpperCase()];
        var lvl = c.level || (p ? p.level : null);
        if (!lvl) return { name: c.name, detail: c.detail || '', need: 'clasificar' };
        if (lvl === 'importante' && String(c.justification || '').trim().length < 5) return { name: c.name, detail: c.detail || '', need: 'justificar' };
        return null;
    }).filter(Boolean);
}

/** ¿Qué impide guardar las decisiones del liberador? PURA. d = forma de _vetsDecisions(). */
function vetsDecideBlockers(pending, d) {
    d = d || {};
    var out = [];
    (pending || []).forEach(function(p) {
        var n = p.name;
        var lvl = p.need === 'justificar' ? 'importante' : (d.levels || {})[n];
        if (!lvl) { out.push('Clasifica la verificación "' + n + '".'); return; }
        if (p.need === 'clasificar' && lvl === 'desacreditada' && String((d.reasons || {})[n] || '').length < 5) out.push('Escribe por qué se desacredita "' + n + '".');
        if (lvl === 'importante' && String((d.justifications || {})[n] || '').length < 5) out.push('Justifica "' + n + '" (es Importante).');
    });
    return out;
}

/** Pantalla del liberador para decidir las fallas que dejó pendientes quien adjuntó. */
function vetsDecideOpen(vehicleId) {
    var v = (db.vehicles || []).find(function(x) { return x && x.id == vehicleId; });
    var s = v && v.testData && v.testData.vets;
    if (!s) return;
    if (typeof _cascadeGate === 'function' && !_cascadeGate('test.release', 'decidir las fallas de VETS')) return;
    var pending = vetsPendingDecisions(s, vetsPolicy());
    if (!pending.length) { showToast('No quedan fallas de VETS por decidir.', 'info'); vetsRenderLibStatus(v); return; }
    _vetsCtx = { mode: 'decidir', vehicleId: v.id, pending: pending };
    var h = '<p class="miss-intro">Prueba VETS <b>#' + escapeHtml(String(s.testNumber || '—')) + '</b>' +
        (s.importedBy ? ', adjuntada por <b>' + escapeHtml(s.importedBy) + '</b>' : '') +
        '. Estas fallas esperan tu decisión antes de enviar a aprobación.</p>';
    pending.forEach(function(p, i) {
        if (p.need === 'justificar') {
            h += _vetsBox('danger', '🔴 <b>' + escapeHtml(p.name) + '</b> — ' + escapeHtml(p.detail) + '. <b>Importante</b>: justifícala para seguir.' +
                '<input class="vets-just" data-name="' + escapeHtml(p.name) + '" type="text" placeholder="Ej.: se repitió la lectura y quedó dentro" oninput="_vetsDecideRefresh()" style="width:100%;margin-top:var(--space-xs);">');
            return;
        }
        var nm = 'vetsDecLvl' + i;
        h += _vetsBox('warn', '❓ <b>' + escapeHtml(p.name) + '</b> — ' + escapeHtml(p.detail) + '. <b>Es la primera vez que falla.</b> ¿Qué es para el laboratorio? (se aplica a las siguientes pruebas)' +
            '<div style="display:flex;flex-wrap:wrap;gap:var(--space-sm);margin-top:var(--space-xs);">' +
            Object.keys(VETS_LEVELS).map(function(l) {
                return '<label class="vets-choice" title="' + escapeHtml(VETS_LEVELS[l].help) + '"><input type="radio" name="' + nm + '" value="' + l + '" data-name="' + escapeHtml(p.name) + '" class="vets-lvl" onchange="_vetsDecideRefresh()"> ' + VETS_LEVELS[l].label + '</label>';
            }).join('') + '</div>' +
            '<input class="vets-lvl-reason" data-name="' + escapeHtml(p.name) + '" type="text" placeholder="Motivo (obligatorio para desacreditar). Ej.: el límite en VETS está mal configurado" oninput="_vetsDecideRefresh()" style="width:100%;margin-top:var(--space-xs);">' +
            '<input class="vets-just" data-name="' + escapeHtml(p.name) + '" type="text" placeholder="Si es Importante: justificación para esta prueba" oninput="_vetsDecideRefresh()" style="width:100%;margin-top:var(--space-xs);">');
    });
    h += '<div id="vetsBlockers" aria-live="polite"></div>';
    _vetsModal('⏳ Fallas de VETS por decidir — ' + escapeHtml(v.vin || ''), h, [
        { label: 'Cancelar', onclick: function() { _vetsClose(); } },
        { label: 'Guardar decisiones', cls: 'btn-primary', onclick: function() {
            var r = vetsDecideApply(v.id, _vetsDecisions());
            if (!r.ok) { showToast(r.reason, 'error', 9000); return; }
            _vetsClose();
            showToast(r.decided + ' falla(s) de VETS decididas' + (r.policy ? ' (' + r.policy + ' clasificadas para todo el laboratorio)' : '') + '.', 'success');
        } }
    ]);
    _vetsDecideRefresh();
}

function _vetsDecideRefresh() {
    if (!_vetsCtx || _vetsCtx.mode !== 'decidir' || !_vetsCtx.overlay) return;
    var b = vetsDecideBlockers(_vetsCtx.pending, _vetsDecisions());
    var box = document.getElementById('vetsBlockers');
    if (box) box.innerHTML = b.length ? _vetsBox('', '<span class="u-muted">Para guardar: ' + b.map(escapeHtml).join(' ') + '</span>') : '';
    uiExplainDisabled(_vetsCtx.overlay.querySelector('[data-modal-btn="1"]'), b.length ? 'Para guardar: ' + b.join(' ') : '');
}

/**
 * Guarda las decisiones del liberador sobre las fallas pendientes. Candado en la capa de
 * datos: test.release y vetsDecideBlockers. Las nuevas se clasifican para todo el
 * laboratorio (vetsPolicySet, auditado) y quedan en el resumen del vehículo con quién decidió.
 */
function vetsDecideApply(vehicleId, d) {
    var v = (db.vehicles || []).find(function(x) { return x && x.id == vehicleId; });
    var s = v && v.testData && v.testData.vets;
    if (!s) return { ok: false, reason: 'Ese vehículo no tiene prueba VETS adjunta.' };
    if (typeof _cascadeGate === 'function' && !_cascadeGate('test.release', 'decidir las fallas de VETS')) return { ok: false, reason: 'Las fallas de VETS las decide quien libera (Signatario o Assistant Manager / Manager).' };
    if (v.status === 'pending-approval' || v.status === 'archived') return { ok: false, reason: 'Ya se envió a aprobación.' };
    d = d || {};
    var pol = vetsPolicy(), pending = vetsPendingDecisions(s, pol);
    var b = vetsDecideBlockers(pending, d);
    if (b.length) return { ok: false, reason: b.join(' ') };
    var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
    var now = new Date().toISOString(), antes = JSON.stringify(v), cambios = [], nuevas = [];
    var byName = {};
    pending.forEach(function(p) { byName[String(p.name).toUpperCase()] = p; });
    var polMap = {};
    pol.forEach(function(p) { if (p && p.id) polMap[String(p.id).toUpperCase()] = p; });
    s.checksFail.forEach(function(c) {
        var key = String(c.name || '').toUpperCase(), p = byName[key];
        if (!c.level && polMap[key] && !p) { c.level = polMap[key].level; c.levelFrom = 'politica'; return; }
        if (!p) return;
        var lvl = p.need === 'justificar' ? 'importante' : d.levels[c.name];
        if (p.need === 'clasificar' && polMap[key]) { lvl = polMap[key].level; c.levelFrom = 'politica'; }
        else if (p.need === 'clasificar') nuevas.push({ name: c.name, level: lvl, reason: (d.reasons || {})[c.name] || '' });
        c.level = lvl;
        if (lvl === 'importante') c.justification = String((d.justifications || {})[c.name] || '').trim();
        c.decidedBy = who; c.decidedAt = now;
        cambios.push({ campo: 'VETS · ' + c.name, antes: 'Por decidir', despues: (VETS_LEVELS[lvl] || {}).label + (c.justification ? ' — ' + c.justification : ''), razon: 'Decidido por el liberador' });
    });
    (v.timeline = v.timeline || []).push({ timestamp: now, user: who || 'Sistema', action: 'Fallas de VETS decididas', data: { modified: cambios } });
    if (saveDB() === false) {
        var idx = db.vehicles.indexOf(v);
        if (idx >= 0) db.vehicles[idx] = JSON.parse(antes);
        return { ok: false, reason: 'No se pudo guardar (almacenamiento del dispositivo). No se cambió nada.' };
    }
    var nPol = 0;
    nuevas.forEach(function(x) { if (vetsPolicySet(x.name, x.level, x.reason, { skipAuth: true, skipSave: true })) nPol++; });
    if (nPol && typeof pnSave === 'function') pnSave();
    if (typeof auditLog === 'function') {
        auditLog('cop15', 'vets_fallas_decididas', { type: 'vehicle', id: v.id, label: v.vin },
            cambios.map(function(c) { return c.campo.replace('VETS · ', '') + ' → ' + c.despues; }).join(' · '),
            { before: { pendientes: pending.map(function(p) { return p.name; }) }, after: { decisiones: cambios.map(function(c) { return c.campo + ': ' + c.despues; }) } });
    }
    vetsRenderLibStatus(v);
    if (typeof libOnGasChange === 'function') { try { libOnGasChange(); } catch (e) {} }
    return { ok: true, decided: cambios.length, policy: nPol };
}

// ══════════════════════════════════════════════════════════════════════
// Registro que se guarda en el vehículo (compacto: el documento de vehículos tiene
// tope, ver 2.3.0) y valores que llenan la pantalla
// ══════════════════════════════════════════════════════════════════════

/** Resumen que viaja con el vehículo. PURA. */
function vetsSummary(rec, meta, classified, decisions) {
    decisions = decisions || {};
    var fallas = (classified || []).map(function(x) {
        var lvl = x.level || (decisions.levels || {})[x.check.name] || null;
        return { name: x.check.name, level: lvl, detail: vetsCheckDetail(x.check),
                 justification: (decisions.justifications || {})[x.check.name] || '' };
    });
    return {
        testRef: rec.testRef, testNumber: rec.testNumber, procedure: rec.procedure, testName: rec.testName,
        regulationSpec: rec.regulationSpec, vehicleName: rec.vehicleName, fuelName: rec.fuelName,
        testStart: rec.testStart, operator: rec.operator, driver: rec.driver, startKm: rec.startKm, endKm: rec.endKm,
        vinFile: rec.vinFile, vinEcu: rec.vinEcu || '', vinStatus: decisions.vinStatus || '', vinJustification: decisions.vinJustification || '',
        fileName: (meta || {}).fileName || '', sha256: (meta || {}).sha256 || '', importedAt: (meta || {}).at || '', importedBy: (meta || {}).by || '',
        gases: Object.keys(rec.gases || {}).reduce(function(o, k) { o[k] = { v: rec.gases[k].value, u: rec.gases[k].unit }; return o; }, {}),
        checksFail: fallas, checksPass: (rec.checks || []).filter(function(c) { return c.status === 'PASS'; }).length,
        vetsLimits: (rec.vetsLimits || []).map(function(l) { return { name: l.name, pass: l.pass }; }),
        drive: rec.drive, obd: rec.obd, obfcm: rec.obfcm, ambient: rec.ambient,
        // [2.8.0] Lo que VETS usó en el dinamómetro (SI): la Revisión dirigida lo compara con el ICMS.
        dyno: rec.dyno ? { tA: _vetsRound(rec.dyno.tA, 4), tB: _vetsRound(rec.dyno.tB, 6), tC: _vetsRound(rec.dyno.tC, 7),
                           etw: _vetsRound(rec.dyno.etw, 1) } : null,
        configDiffs: decisions.configDiffs || []
    };
}

/** Valores de gases de VETS en la unidad del perfil, para precargar la captura. */
function vetsGasValuesFor(vehicle, profile) {
    var s = vehicle && vehicle.testData && vehicle.testData.vets;
    if (!s || !s.gases || !profile || !profile.gases) return null;
    var rec = { gases: {} };
    Object.keys(s.gases).forEach(function(k) { rec.gases[k] = { value: s.gases[k].v, unit: s.gases[k].u }; });
    var out = {}, n = 0;
    profile.gases.forEach(function(g) {
        var v = vetsGasValue(rec, g.field, g.unit);
        if (v !== null) { out[g.field] = v; n++; }
    });
    return n ? out : null;
}

/**
 * OBFCM de los vehículos de una familia (Anexo XXII: la autoridad lleva el registro por
 * familia). PURA: recibe los vehículos y la función de clave de familia.
 * Devuelve {rows:[{vin, testNumber, at, fuelL, accuracyPct, distKm}], n, mean, min, max}.
 */
function vetsObfcmForFamily(vehicles, familyKeyFn, key) {
    var rows = [];
    (vehicles || []).forEach(function(v) {
        var s = v && v.testData && v.testData.vets;
        if (!s || !s.obfcm || s.obfcm.accuracyPct == null) return;
        if (familyKeyFn(v) !== key) return;
        rows.push({ vin: v.vin || '', testNumber: s.testNumber, at: s.testStart || '', fuelL: s.obfcm.fuelL,
                    accuracyPct: s.obfcm.accuracyPct, distKm: s.obfcm.distKm });
    });
    rows.sort(function(a, b) { return String(b.at).localeCompare(String(a.at)); });
    var acc = rows.map(function(r) { return r.accuracyPct; });
    return {
        rows: rows, n: rows.length,
        mean: acc.length ? acc.reduce(function(a, b) { return a + b; }, 0) / acc.length : null,
        min: acc.length ? Math.min.apply(null, acc) : null,
        max: acc.length ? Math.max.apply(null, acc) : null
    };
}

/** Tarjeta de CoP → Expediente. */
function vetsObfcmCardHTML(key) {
    if (typeof db === 'undefined' || typeof copVehicleFamilyKey !== 'function') return '';
    var o = vetsObfcmForFamily(db.vehicles, copVehicleFamilyKey, key);
    if (!o.n) return '';
    var pct = function(x) { return x == null ? '—' : (x > 0 ? '+' : '') + _vetsFmt(x, 3) + ' %'; };
    var h = '<div class="card" style="margin-bottom: var(--space-lg);">' +
        '<div class="card-title" data-help="vets_obfcm">⛽ OBFCM — exactitud por vehículo (Anexo XXII)</div>' +
        '<p class="label-title" style="font-size:var(--fs-sm);">' + o.n + ' prueba(s) con OBFCM · promedio <b>' + pct(o.mean) + '</b> · rango ' + pct(o.min) + ' a ' + pct(o.max) +
        '. La exactitud la calcula VETS; aquí se junta por familia.</p>' +
        '<table class="u-cards" style="width:100%;font-size:var(--fs-xs);border-collapse:collapse;"><thead><tr>' +
        ['VIN', 'Prueba VETS', 'Fecha', 'Combustible OBFCM (L)', 'Distancia (km)', 'Exactitud'].map(function(t) { return '<th style="text-align:left;padding:var(--space-2xs) var(--space-sm);">' + t + '</th>'; }).join('') +
        '</tr></thead><tbody>';
    o.rows.forEach(function(r) {
        h += '<tr><td style="padding:var(--space-2xs) var(--space-sm);font-weight:600;">' + escapeHtml(r.vin) + '</td>' +
            '<td style="padding:var(--space-2xs) var(--space-sm);">#' + escapeHtml(String(r.testNumber || '—')) + '</td>' +
            '<td style="padding:var(--space-2xs) var(--space-sm);">' + escapeHtml(String(r.at).slice(0, 10) || '—') + '</td>' +
            '<td style="padding:var(--space-2xs) var(--space-sm);">' + _vetsFmt(r.fuelL) + '</td>' +
            '<td style="padding:var(--space-2xs) var(--space-sm);">' + _vetsFmt(r.distKm) + '</td>' +
            '<td style="padding:var(--space-2xs) var(--space-sm);font-weight:700;">' + pct(r.accuracyPct) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
}

// ══════════════════════════════════════════════════════════════════════
// Pantalla: 📎 Adjuntar prueba VETS (Liberación) y 🔎 Comparar con VETS (Historial)
// ══════════════════════════════════════════════════════════════════════

var _vetsCtx = null;   // {mode:'liberar'|'comparar', vehicleId, rec, meta, overlay}

function _vetsSha256(buf) {
    if (typeof crypto === 'undefined' || !crypto.subtle) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', buf).then(function(h) {
        return Array.prototype.map.call(new Uint8Array(h), function(b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    }).catch(function() { return ''; });
}

/** Abre el selector de archivo. mode = 'liberar' (Liberación) | 'comparar' (Historial). */
function vetsAttachStart(mode, vehicleId) {
    mode = mode || 'liberar';
    var id = vehicleId != null ? vehicleId : (typeof activeVehicleId !== 'undefined' ? activeVehicleId : null);
    var v = (db.vehicles || []).find(function(x) { return x && x.id == id; });
    if (!v) { showToast('Primero elige el vehículo.', 'warning'); return; }
    // [2.18.0] Adjuntar: también Técnico y Especialista (test.vets). Decidir las fallas nuevas
    // sigue siendo del liberador (test.release): ver vetsCanDecide / vetsPendingDecisions.
    var perm = mode === 'comparar' ? 'test.retro_edit' : 'test.vets';
    if (typeof _cascadeGate === 'function' && !_cascadeGate(perm, mode === 'comparar' ? 'comparar contra VETS' : 'adjuntar la prueba VETS')) return;
    _vetsCtx = { mode: mode, vehicleId: v.id };
    var inp = document.getElementById('vets-file-input');
    if (!inp) {
        inp = document.createElement('input');
        inp.type = 'file'; inp.id = 'vets-file-input'; inp.accept = '.xlsx'; inp.hidden = true;
        inp.addEventListener('change', function() { vetsOnFileChosen(inp); });
        document.body.appendChild(inp);
    }
    inp.value = '';
    inp.click();
}

function vetsOnFileChosen(input) {
    var f = input && input.files && input.files[0];
    if (!f || !_vetsCtx) return;
    if (!/\.xlsx$/i.test(f.name)) { showToast('Elige el reporte de Excel (.xlsx) que exporta VETS.', 'warning'); return; }
    if (f.size > 25 * 1024 * 1024) { showToast('El archivo pesa ' + Math.round(f.size / 1048576) + ' MB: no parece el reporte de una prueba de VETS.', 'warning'); return; }
    showToast('Leyendo el archivo de VETS…', 'info', 2500);
    f.arrayBuffer().then(function(buf) {
        return Promise.all([vetsReadWorkbook(new Uint8Array(buf), VETS_SHEETS), _vetsSha256(buf)]);
    }).then(function(r) {
        var rec = vetsExtract(r[0]);
        var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
        _vetsCtx.rec = rec;
        _vetsCtx.meta = { fileName: f.name, size: f.size, sha256: r[1], at: new Date().toISOString(), by: who };
        if (_vetsCtx.mode === 'comparar') vetsCompareOpen(); else vetsPreviewOpen();
    }).catch(function(err) {
        showToast('No se pudo leer el archivo de VETS: ' + ((err && err.message) || err), 'error', 10000);
    });
}

function _vetsVehicle() {
    return _vetsCtx ? (db.vehicles || []).find(function(x) { return x && x.id == _vetsCtx.vehicleId; }) : null;
}

function _vetsProfile(v) {
    var reg = (typeof _libGetVehicleRegulation === 'function') ? _libGetVehicleRegulation(v) : '';
    return reg && typeof getRegulationProfile === 'function' ? getRegulationProfile(reg) : null;
}

/** Otro vehículo que ya tiene esta misma prueba de VETS. */
function _vetsDuplicate(testRef, vehicleId) {
    if (!testRef) return null;
    return (db.vehicles || []).find(function(x) {
        return x && x.id != vehicleId && x.testData && x.testData.vets && x.testData.vets.testRef === testRef;
    }) || null;
}

var VETS_DYNO_ROWS = [
    { key: 'etw', path: 'etw', label: 'ETW (kg)', dec: 1 },
    { key: 'tA', path: 'targetA', label: 'Target A (N)', dec: 3 },
    { key: 'tB', path: 'targetB', label: 'Target B (N/(km/h))', dec: 5 },
    { key: 'tC', path: 'targetC', label: 'Target C (N/(km/h)²)', dec: 6 },
    { key: 'dA', path: 'dynoA', label: 'Dyno A (N)', dec: 3 },
    { key: 'dB', path: 'dynoB', label: 'Dyno B (N/(km/h))', dec: 5 },
    { key: 'dC', path: 'dynoC', label: 'Dyno C (N/(km/h)²)', dec: 6 }
];

function _vetsRound(v, dec) { return v === null || v === undefined ? null : Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec); }

/** Filas "Cascade vs VETS" que puede llenar. PURA respecto a sus argumentos. */
function vetsFillRows(vehicle, rec, profile, currentGas) {
    var td = (vehicle && vehicle.testData) || {};
    var rows = [];
    (profile && profile.gases || []).forEach(function(g) {
        var vv = vetsGasValue(rec, g.field, g.unit);
        if (vv === null) return;
        var cur = currentGas && currentGas[g.field] != null ? currentGas[g.field] : null;
        var cmp = vetsCompareValue(cur, vv);
        rows.push({ kind: 'gas', id: 'gas:' + g.field, field: g.field, label: g.label + ' (' + g.unit + ')', current: cur, vets: vv,
            state: cur === null ? 'llenar' : (cmp.ok ? 'igual' : 'distinto') });
    });
    VETS_DYNO_ROWS.forEach(function(d) {
        var vv = rec.dyno ? rec.dyno[d.key] : null;
        if (vv === null || vv === undefined) return;
        vv = _vetsRound(vv, d.dec);
        var cur = td[d.path] != null && td[d.path] !== '' ? Number(td[d.path]) : null;
        var cmp = vetsCompareValue(cur === null ? null : _vetsRound(cur, d.dec), vv);
        rows.push({ kind: 'dyno', id: 'dyno:' + d.path, path: d.path, label: d.label, current: cur, vets: vv,
            state: cur === null ? 'llenar' : (cmp.ok ? 'igual' : 'distinto') });
    });
    if (rec.testStart) {
        var curDt = td.testDatetime || '';
        rows.push({ kind: 'td', id: 'td:testDatetime', path: 'testDatetime', label: 'Fecha y hora de prueba', current: curDt || null,
            vets: rec.testStart, state: !curDt ? 'llenar' : (String(curDt).slice(0, 16) === rec.testStart ? 'igual' : 'distinto') });
    }
    return rows;
}

function _vetsLibCurrentGas(profile) {
    if (!profile || typeof _libCollectGasValues !== 'function') return {};
    if (!document.getElementById('lib-gas-entry-content')) return {};
    try { return _libCollectGasValues(profile, 'lib-gas-entry-content') || {}; } catch (e) { return {}; }
}

function _vetsModal(title, body, buttons) {
    showModal({ title: title, body: body, buttons: buttons });
    var ov = document.querySelectorAll('.custom-modal-overlay');
    if (_vetsCtx) _vetsCtx.overlay = ov[ov.length - 1] || null;
    if (typeof cascadeInjectTooltips === 'function') { try { cascadeInjectTooltips(); } catch (e) {} }
}

function _vetsClose() {
    if (_vetsCtx && _vetsCtx.overlay) _vetsCtx.overlay.style.display = 'none';
}

function _vetsHead(rec, meta) {
    return '<p class="miss-intro">Prueba VETS <b>#' + escapeHtml(String(rec.testNumber || '—')) + '</b> · ' +
        escapeHtml(rec.procedure || rec.testName || '') + (rec.testStart ? ' · ' + escapeHtml(rec.testStart.replace('T', ' ')) : '') +
        '<br><span class="u-muted" style="font-size:var(--fs-xs);">' + escapeHtml(meta.fileName) +
        (meta.sha256 ? ' · huella ' + escapeHtml(meta.sha256.slice(0, 12)) + '…' : '') + '</span></p>';
}

function _vetsBox(tone, html) {
    var bg = tone === 'danger' ? 'var(--danger-tint)' : tone === 'warn' ? 'var(--warn-tint)' : tone === 'ok' ? 'var(--ok-tint)' : 'var(--surface-alt)';
    return '<div style="margin-top:var(--space-sm);padding:var(--space-sm) var(--space-md);border-radius:var(--radius-md);background:' + bg + ';font-size:var(--fs-sm);line-height:var(--lh-base);">' + html + '</div>';
}

function _vetsSection(title, help) {
    return '<div style="margin-top:var(--space-md);font-weight:700;font-size:var(--fs-sm);color:var(--tp-text);"' +
        (help ? ' data-help="' + help + '"' : '') + '>' + title + '</div>';
}

/**
 * Cómo se muestra una fila: los gases en la unidad en que el laboratorio los teclea
 * (captureUnit), los demás tal cual.
 */
function _vetsShow(r, profile) {
    if (r.kind === 'td') return { label: r.label, current: r.current || '—', vets: String(r.vets).replace('T', ' ') };
    if (r.kind === 'gas' && profile && typeof gasCaptureUnit === 'function' && typeof gasConvert === 'function') {
        var g = (profile.gases || []).find(function(x) { return x.field === r.field; });
        if (g) {
            var cu = gasCaptureUnit(g);
            var cv = function(v) { return v === null ? '—' : _vetsFmt(gasConvert(v, g.unit, cu), 6); };
            return { label: g.label + ' (' + cu + ')', current: cv(r.current), vets: cv(r.vets) };
        }
    }
    return { label: r.label, current: r.current === null ? '—' : _vetsFmt(r.current, 6), vets: _vetsFmt(r.vets, 6) };
}

/** Vista previa en Liberación: qué se llena, identidad, verificaciones, OBFCM. */
function vetsPreviewOpen() {
    var v = _vetsVehicle(), rec = _vetsCtx && _vetsCtx.rec, meta = _vetsCtx && _vetsCtx.meta;
    if (!v || !rec) return;
    var profile = _vetsProfile(v);
    var cur = _vetsLibCurrentGas(profile);
    var dup = _vetsDuplicate(rec.testRef, v.id);
    var vin = vetsVinCheck(v.vin, rec.vinFile, rec.vinEcu);
    var cfgDiffs = vetsConfigCheck(v.config, rec.config);
    var classified = vetsClassifyChecks(rec.checks, vetsPolicy());
    var rows = vetsFillRows(v, rec, profile, cur);
    var decides = vetsCanDecide();
    _vetsCtx.view = { vin: vin, cfgDiffs: cfgDiffs, classified: classified, rows: rows, dup: dup, profile: profile, decides: decides };

    var h = _vetsHead(rec, meta);

    // Identidad
    h += _vetsSection('1 · Identidad', 'vets_identidad');
    if (dup) h += _vetsBox('danger', '⛔ Esta prueba de VETS ya está adjunta al vehículo <b>' + escapeHtml(dup.vin || '') + '</b>. Una prueba acredita a un solo vehículo.');
    h += _vetsBox(vin.ok ? 'ok' : vin.block ? 'danger' : 'warn', (vin.ok ? '✓ ' : vin.block ? '⛔ ' : '⚠️ ') + escapeHtml(vin.message) +
        (vin.status === 'alta' || vin.status === 'dudoso'
            ? '<div style="margin-top:var(--space-xs);"><button type="button" class="btn-secondary" onclick="vetsFixVin()">✏️ Corregir el VIN del vehículo…</button></div>' : '') +
        (!vin.ok && !vin.block
            ? '<div style="margin-top:var(--space-xs);"><label for="vetsVinJust" style="font-size:var(--fs-xs);">O usa el archivo de todos modos — ¿por qué?</label>' +
              '<input id="vetsVinJust" type="text" placeholder="Ej.: en VETS se tecleó mal el VIN; el ECU confirma el vehículo" oninput="_vetsRefreshBtn()" style="width:100%;"></div>' : ''));
    if (cfgDiffs.length) {
        h += _vetsBox('warn', '⚠️ VETS capturó otra configuración: ' + cfgDiffs.map(function(d) {
            return '<b>' + escapeHtml((typeof ALTA_CORR_FIELD_LABELS !== 'undefined' && ALTA_CORR_FIELD_LABELS[d.key]) || d.key) + '</b> Alta ' + escapeHtml(d.alta) + ' · VETS ' + escapeHtml(d.vets);
        }).join('; ') + '. Revisa cuál es la correcta' +
        (typeof vehicleCorrectAltaOpen === 'function' ? ' <button type="button" class="btn-secondary" onclick="_vetsClose();setTimeout(function(){vehicleCorrectAltaOpen(\'' + String(v.id).replace(/[^\w.-]/g, '') + '\')},220)">✏️ Corregir alta…</button>' : '') + '.');
    }

    // Qué se llena
    h += _vetsSection('2 · Valores', 'vets_valores');
    if (!profile) h += _vetsBox('warn', '⚠️ El vehículo no tiene regulación con perfil de gases: solo se llenan los datos del dinamómetro.');
    if (!rows.length) h += _vetsBox('warn', 'El archivo no trae valores que Cascade use.');
    else {
        var byState = function(st) { return rows.filter(function(r) { return r.state === st; }); };
        var dist = byState('distinto'), llenar = byState('llenar'), igual = byState('igual');
        if (dist.length) {
            h += _vetsBox('warn', '⚠️ <b>' + dist.length + ' valor(es) ya capturados son distintos a VETS.</b> Se queda el tuyo salvo que marques:' +
                '<ul class="vets-list">' + dist.map(function(r) {
                    var sh = _vetsShow(r, profile);
                    return '<li><label class="vets-choice"><input type="checkbox" class="vets-over" data-id="' + escapeHtml(r.id) + '"> ' +
                        '<b>' + escapeHtml(sh.label) + '</b>: en Cascade ' + escapeHtml(sh.current) + ' · en VETS <b>' + escapeHtml(sh.vets) + '</b> — usar el de VETS</label></li>';
                }).join('') + '</ul>');
        }
        if (llenar.length) {
            h += _vetsBox('ok', '✓ Se llenan <b>' + llenar.length + '</b> valor(es):<ul class="vets-list vets-list--cols">' + llenar.map(function(r) {
                var sh = _vetsShow(r, profile);
                return '<li><span class="u-muted">' + escapeHtml(sh.label) + '</span> <b>' + escapeHtml(sh.vets) + '</b></li>';
            }).join('') + '</ul>');
        }
        if (igual.length) {
            h += '<div class="u-muted" style="font-size:var(--fs-xs);margin-top:var(--space-xs);">Ya coinciden con VETS: ' +
                igual.map(function(r) { return escapeHtml(_vetsShow(r, profile).label); }).join(', ') + '.</div>';
        }
    }

    // Verificaciones
    h += _vetsSection('3 · Verificaciones de VETS', 'vets_verificaciones');
    var pasa = (rec.checks || []).filter(function(c) { return c.status === 'PASS'; }).length;
    if (!classified.length) h += _vetsBox('ok', '✓ Las ' + pasa + ' verificaciones de la prueba pasan.');
    else {
        h += '<div class="u-muted" style="font-size:var(--fs-xs);margin-top:var(--space-2xs);">' + pasa + ' pasan · ' + classified.length + ' fallaron:</div>';
        var porDecidir = classified.filter(function(x) { return !x.known || x.level === 'importante'; }).length;
        if (!decides && porDecidir) {
            h += _vetsBox('', 'ℹ️ Puedes adjuntar la prueba. ' + (porDecidir === 1 ? 'La falla marcada con ⏳ la decide' : 'Las ' + porDecidir + ' fallas marcadas con ⏳ las decide') +
                ' el liberador antes de enviar a aprobación.');
        }
        classified.forEach(function(x, i) {
            var c = x.check, det = vetsCheckDetail(c);
            if (!decides && (!x.known || x.level === 'importante')) {
                h += _vetsBox('warn', '⏳ <b>' + escapeHtml(c.name) + '</b> — ' + escapeHtml(det) + '. ' +
                    (x.known ? 'Es <b>Importante</b>: el liberador la justifica.' : 'Es la primera vez que falla: el liberador decide qué es para el laboratorio.'));
            } else if (x.known && x.level === 'desacreditada') {
                h += _vetsBox('', '<span class="u-muted">⚪ <b>' + escapeHtml(c.name) + '</b> — desacreditada por el laboratorio' + (x.reason ? ' (' + escapeHtml(x.reason) + ')' : '') + '. Se guarda en el registro.</span>');
            } else if (x.known && x.level === 'informativa') {
                h += _vetsBox('warn', '🟡 <b>' + escapeHtml(c.name) + '</b> — ' + escapeHtml(det) + '. Informativa: no detiene.');
            } else if (x.known && x.level === 'importante') {
                h += _vetsBox('danger', '🔴 <b>' + escapeHtml(c.name) + '</b> — ' + escapeHtml(det) + '. <b>Importante</b>: justifícala para seguir.' +
                    '<input class="vets-just" data-name="' + escapeHtml(c.name) + '" type="text" placeholder="Ej.: se repitió la lectura y quedó dentro" oninput="_vetsRefreshBtn()" style="width:100%;margin-top:var(--space-xs);">');
            } else {
                var nm = 'vetsLvl' + i;
                h += _vetsBox('warn', '❓ <b>' + escapeHtml(c.name) + '</b> — ' + escapeHtml(det) + '. <b>Es la primera vez que falla.</b> ¿Qué es para el laboratorio? (se aplica a las siguientes pruebas)' +
                    '<div style="display:flex;flex-wrap:wrap;gap:var(--space-sm);margin-top:var(--space-xs);">' +
                    Object.keys(VETS_LEVELS).map(function(l) {
                        return '<label class="vets-choice" title="' + escapeHtml(VETS_LEVELS[l].help) + '"><input type="radio" name="' + nm + '" value="' + l + '" data-name="' + escapeHtml(c.name) + '" class="vets-lvl" onchange="_vetsRefreshBtn()"> ' + VETS_LEVELS[l].label + '</label>';
                    }).join('') + '</div>' +
                    '<input class="vets-lvl-reason" data-name="' + escapeHtml(c.name) + '" type="text" placeholder="Motivo (obligatorio para desacreditar). Ej.: el límite en VETS está mal configurado" oninput="_vetsRefreshBtn()" style="width:100%;margin-top:var(--space-xs);">' +
                    '<input class="vets-just" data-name="' + escapeHtml(c.name) + '" type="text" placeholder="Si es Importante: justificación para esta prueba" oninput="_vetsRefreshBtn()" style="width:100%;margin-top:var(--space-xs);">');
            }
        });
    }

    // Lo que dijo VETS y el OBFCM (informativo)
    var vl = rec.vetsLimits || [];
    if (vl.length) {
        var malos = vl.filter(function(l) { return l.pass === false; });
        h += _vetsSection('4 · Veredicto de VETS (informativo)', 'vets_veredicto');
        h += _vetsBox(malos.length ? 'warn' : '', (malos.length ? '⚠️ VETS marcó FALLA en ' + malos.map(function(l) { return escapeHtml(l.name); }).join(', ')
            : '✓ VETS: ' + vl.map(function(l) { return escapeHtml(l.name); }).join(', ') + ' dentro de sus límites') +
            '. Cascade juzga con los límites de su propia regulación en la captura.');
    }
    if (rec.obfcm) {
        var o = rec.obfcm;
        h += _vetsSection('5 · OBFCM (Anexo XXII)', 'vets_obfcm');
        h += _vetsBox('', 'Combustible según el vehículo: <b>' + _vetsFmt(o.fuelL) + ' L</b> (' + _vetsFmt(o.fuelBeforeL) + ' → ' + _vetsFmt(o.fuelAfterL) + ')' +
            ' · exactitud calculada por VETS: <b>' + (o.accuracyPct === null ? '—' : (o.accuracyPct > 0 ? '+' : '') + _vetsFmt(o.accuracyPct, 3) + ' %') + '</b>' +
            ' · distancia ' + _vetsFmt(o.distKm) + ' km' +
            (rec.obd && rec.obd.calid ? '<br>CALID ' + escapeHtml(rec.obd.calid) + ' · CVN ' + escapeHtml(rec.obd.cvn || '—') : '') +
            (rec.obd && rec.obd.mil ? ' · MIL ' + escapeHtml(rec.obd.mil) : ''));
    }
    h += '<div id="vetsBlockers" aria-live="polite"></div>';

    _vetsModal('📎 Prueba VETS — ' + escapeHtml(v.vin || ''), h, [
        { label: 'Cancelar', onclick: function() { _vetsClose(); } },
        { label: 'Aplicar', cls: 'btn-primary', onclick: function() { vetsApplyFromModal(); } }
    ]);
    _vetsRefreshBtn();
}

/** Lo que el liberador decidió en la vista previa. */
function _vetsDecisions() {
    var d = { overwrite: {}, levels: {}, reasons: {}, justifications: {}, vinJustification: '' };
    document.querySelectorAll('.vets-over').forEach(function(c) { if (c.checked) d.overwrite[c.getAttribute('data-id')] = true; });
    document.querySelectorAll('.vets-lvl').forEach(function(r) { if (r.checked) d.levels[r.getAttribute('data-name')] = r.value; });
    document.querySelectorAll('.vets-lvl-reason').forEach(function(t) { d.reasons[t.getAttribute('data-name')] = String(t.value || '').trim(); });
    document.querySelectorAll('.vets-just').forEach(function(t) { var s = String(t.value || '').trim(); if (s) d.justifications[t.getAttribute('data-name')] = s; });
    var vj = document.getElementById('vetsVinJust');
    d.vinJustification = vj ? String(vj.value || '').trim() : '';
    return d;
}

/**
 * ¿Qué impide aplicar? PURA respecto a sus argumentos: la usa el botón y la capa de
 * datos (vetsApply). Devuelve una lista de motivos (vacía = se puede).
 */
function vetsBlockers(view, d) {
    var out = [];
    if (view.dup) out.push('Esta prueba ya está adjunta a otro vehículo.');
    if (view.vin.block) out.push('Ningún VIN coincide: parece el archivo de otra prueba.');
    else if (!view.vin.ok && String(d.vinJustification || '').length < 5) out.push('El VIN no coincide: corrígelo o escribe por qué se usa el archivo de todos modos.');
    // [2.18.0] Quien adjunta sin poder liberar no decide las fallas: quedan pendientes y
    // las resuelve el liberador (vetsPendingDecisions candado en submitToApproval).
    if (view.decides === false) return out;
    view.classified.forEach(function(x) {
        var n = x.check.name;
        var lvl = x.known ? x.level : d.levels[n];
        if (!lvl) { out.push('Clasifica la verificación "' + n + '".'); return; }
        if (!x.known && lvl === 'desacreditada' && String(d.reasons[n] || '').length < 5) out.push('Escribe por qué se desacredita "' + n + '".');
        if (lvl === 'importante' && String(d.justifications[n] || '').length < 5) out.push('Justifica "' + n + '" (es Importante).');
    });
    return out;
}

function _vetsRefreshBtn() {
    if (!_vetsCtx || !_vetsCtx.view || !_vetsCtx.overlay) return;
    var b = vetsBlockers(_vetsCtx.view, _vetsDecisions());
    var box = document.getElementById('vetsBlockers');
    if (box) box.innerHTML = b.length ? _vetsBox('', '<span class="u-muted">Para aplicar: ' + b.map(escapeHtml).join(' ') + '</span>') : '';
    var btn = _vetsCtx.overlay.querySelector('[data-modal-btn="1"]');
    uiExplainDisabled(btn, b.length ? 'Para aplicar: ' + b.join(' ') : '');
}

function vetsFixVin() {
    var v = _vetsVehicle(), vin = _vetsCtx && _vetsCtx.view && _vetsCtx.view.vin;
    if (!v || !vin) return;
    _vetsClose();
    setTimeout(function() { vehicleCorrectAltaOpen(v.id, { vin: vin.suggestVin || '' }); }, 220);
}

function vetsApplyFromModal() {
    var r = vetsApply(_vetsCtx && _vetsCtx.vehicleId, _vetsDecisions());
    if (!r.ok) { showToast(r.reason, 'error', 9000); return; }
    _vetsClose();
    showToast('Prueba VETS aplicada: ' + r.filled + ' valor(es) llenados' + (r.policy ? ', ' + r.policy + ' verificación(es) clasificadas' : '') +
        (r.pending ? '. ' + r.pending + ' falla(s) quedan para que las decida el liberador.' : '. Revisa y firma como siempre.'), 'success', 8000);
}

/**
 * Aplica la prueba al vehículo. Candado en la capa de datos (vetsBlockers). Llena los
 * campos que el liberador eligió, guarda el resumen en `testData.vets` y la política
 * de verificaciones nuevas. NO envía a aprobación: el doble ciego sigue igual.
 */
function vetsApply(vehicleId, d) {
    var v = (db.vehicles || []).find(function(x) { return x && x.id == vehicleId; });
    if (!v || !_vetsCtx || !_vetsCtx.rec || !_vetsCtx.view) return { ok: false, reason: 'Vuelve a elegir el archivo.' };
    if (typeof _cascadeGate === 'function' && !_cascadeGate('test.vets', 'adjuntar la prueba VETS')) return { ok: false, reason: 'Tu rol no puede adjuntar la prueba de VETS.' };
    if (v.status === 'pending-approval' || v.status === 'archived') return { ok: false, reason: 'Ya se envió a aprobación: para compararlo contra VETS usa Historial → ⋯ → Comparar con VETS.' };
    var rec = _vetsCtx.rec, meta = _vetsCtx.meta, view = _vetsCtx.view;
    d = d || {};
    // [2.18.0] Lo decide la capa de datos, no la pantalla: sin test.release las fallas nuevas
    // quedan pendientes aunque lleguen decisiones.
    view.decides = vetsCanDecide();
    if (!view.decides) d = { overwrite: d.overwrite || {}, levels: {}, reasons: {}, justifications: {}, vinJustification: d.vinJustification || '' };
    var b = vetsBlockers(view, d);
    if (b.length) return { ok: false, reason: b.join(' ') };
    if (typeof _releasePreflightStorage === 'function' && !_releasePreflightStorage('adjuntar la prueba VETS')) return { ok: false, reason: 'Sin espacio en el dispositivo.' };

    var dbAntes = JSON.stringify(db);
    var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
    var td = v.testData = v.testData || {};
    var filled = [], gasFill = {};
    view.rows.forEach(function(r) {
        var usar = r.state === 'llenar' || (r.state === 'distinto' && d.overwrite && d.overwrite[r.id]);
        if (!usar) return;
        if (r.kind === 'gas') gasFill[r.field] = r.vets;
        else if (r.kind === 'dyno') { td[r.path] = r.vets; td.unitSystem = 'SI'; }
        else if (r.kind === 'td') td[r.path] = r.vets;
        filled.push({ campo: r.label, antes: r.current === null ? '—' : String(r.current), despues: String(r.vets), razon: 'Tomado de VETS #' + (rec.testNumber || '') });
    });
    var levels = {};
    view.classified.forEach(function(x) { levels[x.check.name] = x.known ? x.level : d.levels[x.check.name]; });
    td.vets = vetsSummary(rec, meta, view.classified.map(function(x) { return { check: x.check, level: levels[x.check.name], known: x.known }; }),
        { vinStatus: view.vin.status, vinJustification: view.vin.ok ? '' : d.vinJustification,
          justifications: d.justifications, configDiffs: view.cfgDiffs });
    (v.timeline = v.timeline || []).push({ timestamp: meta.at, user: who || 'Sistema', action: 'Prueba VETS adjunta',
        data: { modified: filled, vets: { testRef: rec.testRef, testNumber: rec.testNumber, sha256: meta.sha256 } } });
    if (saveDB() === false) { db = JSON.parse(dbAntes); return { ok: false, reason: 'No se pudo guardar (almacenamiento del dispositivo). No se cambió nada.' }; }

    // Política nueva (una sola vez por verificación, para todo el laboratorio)
    var nPol = 0;
    view.classified.forEach(function(x) {
        if (x.known || !view.decides) return;
        if (vetsPolicySet(x.check.name, d.levels[x.check.name], d.reasons[x.check.name] || '', { skipAuth: true, skipSave: true })) nPol++;
    });
    if (nPol && typeof pnSave === 'function') pnSave();

    // Captura del liberador en pantalla (no se envía: el liberador revisa y firma)
    if (Object.keys(gasFill).length && document.getElementById('lib-gas-entry-content') && view.profile) {
        view.profile.gases.forEach(function(g) {
            if (!(g.field in gasFill)) return;
            var inp = document.querySelector('#lib-gas-entry-content .lib-gas-input[data-field="' + g.field + '"]');
            if (inp) inp.value = String(parseFloat(gasConvert(gasFill[g.field], g.unit, gasCaptureUnit(g)).toPrecision(6)));
        });
        if (typeof libOnGasChange === 'function') libOnGasChange();
    }
    if (typeof auditLog === 'function') {
        auditLog('cop15', 'vets_importado', { type: 'vehicle', id: v.id, label: v.vin },
            'Prueba VETS #' + (rec.testNumber || '') + ' (' + (rec.testRef || '') + ') · ' + filled.length + ' valores · ' +
            view.classified.length + ' verificaciones fallidas' +
            (view.decides ? '' : ' (' + vetsPendingDecisions(td.vets, vetsPolicy()).length + ' por decidir del liberador)') +
            ' · VIN ' + view.vin.status + (meta.sha256 ? ' · huella ' + meta.sha256.slice(0, 16) : ''));
    }
    _vetsStoreFull(rec, meta, v);
    if (typeof vetsRenderLibStatus === 'function') vetsRenderLibStatus(v);
    return { ok: true, filled: filled.length, policy: nPol, pending: vetsPendingDecisions(td.vets, vetsPolicy()).length };
}

/** Copia completa de lo extraído en la nube (evidencia), fuera del documento de vehículos. */
function _vetsStoreFull(rec, meta, v) {
    if (!rec.testRef || typeof _fbBkSet !== 'function' || typeof fbSync === 'undefined' || !fbSync.enabled) return;
    try {
        _fbBkSet('vets/' + String(rec.testRef).replace(/[^\w-]/g, ''), {
            vehicleId: String(v.id), vin: v.vin || '', at: meta.at, by: meta.by, fileName: meta.fileName,
            sha256: meta.sha256, record: JSON.stringify(rec)
        }).catch(function(e) { console.warn('VETS: no se guardó la copia en la nube', e); });
    } catch (e) {}
}

/** Franja en Liberación con lo que ya se adjuntó. */
/**
 * [2.19.1] Nota junto a "Enviar a aprobación": lo que falta por VETS, dicho donde se toca.
 * Al liberador le pone ahí el botón Decidir; a quien no libera le dice que el siguiente paso
 * es del liberador (y que las fallas de VETS también las decide él).
 */
function vetsRenderActionNote(v) {
    var el = document.getElementById('lib-action-note');
    if (!el) return;
    var pend = vetsPendingDecisions(v && v.testData && v.testData.vets, vetsPolicy());
    var decide = vetsCanDecide(), h = '';
    if (pend.length && decide) {
        h = '<div class="lib-action-row">⏳ Antes de enviar decide ' + (pend.length === 1 ? 'la falla' : 'las ' + pend.length + ' fallas') + ' de VETS: <b>' +
            pend.map(function(p) { return escapeHtml(p.name); }).join(', ') + '</b>.</div>' +
            '<button type="button" class="btn-primary lib-action-decide" onclick="vetsDecideOpen(\'' + String(v.id).replace(/[^\w.-]/g, '') + '\')">⏳ Decidir ' +
            (pend.length === 1 ? 'la falla' : 'las fallas') + ' de VETS</button>';
    } else if (!decide) {
        var quien = (typeof authRolesWith === 'function') ? authRolesWith('test.release').join(' o ') : 'el liberador';
        h = '<div class="lib-action-row">ℹ️ Enviar a aprobación lo hace <b>' + escapeHtml(quien) + '</b>' +
            (pend.length ? ', y también decide ' + (pend.length === 1 ? 'la falla' : 'las fallas') + ' de VETS pendiente' + (pend.length === 1 ? '' : 's') : '') +
            '. Lo que capturaste queda guardado: avísale al liberador.</div>';
    }
    el.innerHTML = h;
    el.style.display = h ? '' : 'none';
}

function vetsRenderLibStatus(v) {
    vetsRenderActionNote(v);   // [2.19.1]
    var el = document.getElementById('vets-attach-status');
    if (!el) return;
    var s = v && v.testData && v.testData.vets;
    if (!s) { el.textContent = ''; return; }
    var desc = (s.checksFail || []).filter(function(c) { return c.level === 'desacreditada'; }).length;
    var pend = vetsPendingDecisions(s, vetsPolicy());
    var pendHtml = !pend.length ? '' : '<div class="vets-pending">⏳ ' + (pend.length === 1 ? '1 falla de VETS por decidir' : pend.length + ' fallas de VETS por decidir') +
        ' (' + pend.map(function(p) { return escapeHtml(p.name); }).join(', ') + ') — ' +
        (vetsCanDecide()
            ? '<button type="button" class="btn-secondary" onclick="vetsDecideOpen(\'' + String(v.id).replace(/[^\w.-]/g, '') + '\')">Decidir…</button>'
            : 'las decide el liberador antes de enviar a aprobación.') + '</div>';
    el.innerHTML = '✓ Prueba VETS <b>#' + escapeHtml(String(s.testNumber || '')) + '</b> adjunta' +
        (s.importedBy ? ' por ' + escapeHtml(s.importedBy) : '') +
        (desc ? ' · <span class="u-muted">' + desc + ' verificación(es) desacreditada(s)</span>' : '') +
        (s.obfcm && s.obfcm.accuracyPct != null ? ' · OBFCM ' + (s.obfcm.accuracyPct > 0 ? '+' : '') + _vetsFmt(s.obfcm.accuracyPct, 3) + ' %' : '') + pendHtml;
}

// ── Comparar un vehículo YA liberado contra VETS (validación del importador, 17025 §7.11.2) ──

/** Filas de comparación: lo que se tecleó entonces vs lo que dice VETS. PURA. */
function vetsCompareRows(vehicle, rec, profile) {
    var lib = vehicle && vehicle.testData && vehicle.testData.gasResults && vehicle.testData.gasResults.liberador;
    var vals = (lib && lib.values) || {};
    var rows = [];
    (profile && profile.gases || []).forEach(function(g) {
        if (vals[g.field] == null) return;
        var vv = vetsGasValue(rec, g.field, g.unit);
        if (vv === null) return;
        var c = vetsCompareValue(vals[g.field], vv);
        rows.push({ field: g.field, label: g.label, unit: g.unit, cascade: vals[g.field], vets: vv, ok: c.ok, diffPct: c.diffPct });
    });
    return rows;
}

function vetsCompareOpen() {
    var v = _vetsVehicle(), rec = _vetsCtx && _vetsCtx.rec, meta = _vetsCtx && _vetsCtx.meta;
    if (!v || !rec) return;
    var profile = (typeof _libGasProfileForVehicle === 'function') ? _libGasProfileForVehicle(v) : _vetsProfile(v);
    var vin = vetsVinCheck(v.vin, rec.vinFile, rec.vinEcu);
    var rows = vetsCompareRows(v, rec, profile);
    _vetsCtx.view = { vin: vin, rows: rows };
    var h = _vetsHead(rec, meta);
    h += '<p style="font-size:var(--fs-sm);">Compara lo que se tecleó al liberar contra el archivo de VETS. <b>No cambia ningún valor</b>: el resultado queda como evidencia de validación del importador.</p>';
    h += _vetsBox(vin.ok ? 'ok' : vin.block ? 'danger' : 'warn', (vin.ok ? '✓ ' : '⚠️ ') + escapeHtml(vin.message));
    if (!rows.length) h += _vetsBox('warn', 'No hay gases capturados que comparar.');
    else {
        var malos = rows.filter(function(r) { return !r.ok; }).length;
        h += '<table class="u-cards" style="width:100%;font-size:var(--fs-xs);border-collapse:collapse;margin-top:var(--space-sm);"><thead><tr>' +
             ['Gas', 'Tecleado', 'VETS', 'Diferencia'].map(function(t) { return '<th style="text-align:left;padding:var(--space-2xs) var(--space-sm);">' + t + '</th>'; }).join('') + '</tr></thead><tbody>';
        rows.forEach(function(r) {
            h += '<tr><td style="padding:var(--space-2xs) var(--space-sm);font-weight:600;">' + escapeHtml(r.label) + ' (' + escapeHtml(r.unit) + ')</td>' +
                 '<td style="padding:var(--space-2xs) var(--space-sm);">' + escapeHtml(String(r.cascade)) + '</td>' +
                 '<td style="padding:var(--space-2xs) var(--space-sm);">' + escapeHtml(_vetsFmt(r.vets, 6)) + '</td>' +
                 '<td style="padding:var(--space-2xs) var(--space-sm);color:' + (r.ok ? 'var(--ok-text)' : 'var(--danger-text)') + ';">' +
                 (r.ok ? '✓ coincide' : '✗ ' + _vetsFmt(r.diffPct, 3) + ' %') + '</td></tr>';
        });
        h += '</tbody></table>';
        h += malos ? _vetsBox('danger', '✗ ' + malos + ' valor(es) no coinciden con VETS. Es un hallazgo de calidad: decide con tu responsable qué hacer con este vehículo.')
                   : _vetsBox('ok', '✓ Todo lo tecleado coincide con VETS.');
    }
    _vetsModal('🔎 Comparar con VETS — ' + escapeHtml(v.vin || ''), h, [
        { label: 'Cerrar', onclick: function() { _vetsClose(); } },
        { label: 'Guardar comparación', cls: 'btn-primary', onclick: function() { vetsCompareSave(); } }
    ]);
    var btn = _vetsCtx.overlay && _vetsCtx.overlay.querySelector('[data-modal-btn="1"]');
    uiExplainDisabled(btn, vin.block ? (vin.message || 'El VIN del archivo no es el de este vehículo.') : !rows.length ? 'No hay resultados que comparar.' : '');
}

function vetsCompareSave() {
    var v = _vetsVehicle(), rec = _vetsCtx && _vetsCtx.rec, meta = _vetsCtx && _vetsCtx.meta, view = _vetsCtx && _vetsCtx.view;
    if (!v || !rec || !view) return;
    if (typeof _cascadeGate === 'function' && !_cascadeGate('test.retro_edit', 'comparar contra VETS')) return;
    if (view.vin.block) { showToast('Ningún VIN coincide: ese archivo no es de este vehículo.', 'error'); return; }
    var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : '';
    var allOk = view.rows.every(function(r) { return r.ok; });
    var td = v.testData = v.testData || {};
    td.vetsValidation = { testRef: rec.testRef, testNumber: rec.testNumber, fileName: meta.fileName, sha256: meta.sha256,
        at: meta.at, by: who, vinStatus: view.vin.status, allOk: allOk,
        rows: view.rows.map(function(r) { return { field: r.field, unit: r.unit, cascade: r.cascade, vets: r.vets, ok: r.ok, diffPct: r.diffPct }; }) };
    (v.timeline = v.timeline || []).push({ timestamp: meta.at, user: who || 'Sistema', action: 'Comparado contra VETS',
        data: { vets: { testRef: rec.testRef, allOk: allOk } } });
    if (saveDB() === false) { showToast('No se pudo guardar la comparación.', 'error'); return; }
    if (typeof auditLog === 'function') {
        auditLog('cop15', 'vets_validacion', { type: 'vehicle', id: v.id, label: v.vin },
            (allOk ? 'Coincide' : 'NO coincide') + ' con VETS #' + (rec.testNumber || '') + ' · ' +
            view.rows.map(function(r) { return r.field + (r.ok ? ' ✓' : ' ✗ ' + _vetsFmt(r.diffPct, 3) + '%'); }).join(', '));
    }
    _vetsClose();
    showToast(allOk ? 'Comparación guardada: todo coincide con VETS.' : 'Comparación guardada: hay valores que NO coinciden.', allOk ? 'success' : 'warning', 7000);
}

/** CSV de todas las comparaciones (evidencia de validación del importador). */
function vetsValidationExportCSV() {
    var rows = [['VIN', 'Configuración', 'Prueba VETS', 'Huella', 'Comparado', 'Por', 'Gas', 'Unidad', 'Tecleado', 'VETS', 'Diferencia %', 'Coincide']];
    (db.vehicles || []).forEach(function(v) {
        var x = v && v.testData && v.testData.vetsValidation;
        if (!x) return;
        (x.rows || []).forEach(function(r) {
            rows.push([v.vin || '', v.configCode || '', x.testNumber || '', (x.sha256 || '').slice(0, 16), x.at || '', x.by || '',
                r.field, r.unit, r.cascade, r.vets, r.diffPct == null ? '' : _vetsFmt(r.diffPct, 4), r.ok ? 'sí' : 'NO']);
        });
    });
    if (rows.length === 1) { showToast('Todavía no hay comparaciones contra VETS (Historial → ⋯ → Comparar con VETS).', 'info', 7000); return; }
    var csv = rows.map(function(r) { return r.map(function(c) { var s = String(c == null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }).join('\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'validacion_importador_vets_' + (typeof localToday === 'function' ? localToday() : 'hoy') + '.csv';
    a.click();
}

if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    vets_identidad: { title: 'Identidad de la prueba',
        text: 'Compara el VIN del Alta con el que se tecleó en VETS y, si la prueba lo leyó, con el del ECU del vehículo. '
            + 'Si VETS y el ECU coinciden y el Alta no, lo más probable es un error en el Alta (✏️ Corregir). Si ninguno '
            + 'coincide, es el archivo de otra prueba y no se deja aplicar. En pruebas de Europa también compara la '
            + 'configuración que se capturó en VETS (carrocería, transmisión, regulación…).' },
    vets_valores: { title: 'Valores que se llenan',
        text: 'Lo vacío se llena con lo de VETS. Si ya había un valor distinto, se queda el tuyo salvo que marques "usar el de VETS". '
            + 'Los gases van a la captura del liberador en pantalla (se revisan y se firman como siempre); los del dinamómetro y la '
            + 'fecha quedan en el vehículo. Todo se convierte a las unidades de Cascade.' },
    vets_verificaciones: { title: 'Verificaciones de VETS',
        text: 'Las revisiones de validez que corre VETS (temperatura de celda, factor de dilución, tiempos de bolsa…). La primera '
            + 'vez que una falla, se decide qué es para el laboratorio: Importante (se justifica en cada prueba), Informativa (solo se '
            + 'muestra) o Desacreditada (mal configurada en VETS: ya no se pregunta). Se cambia en Datos → Regulaciones. '
            + 'Técnico y Especialista pueden adjuntar la prueba; las fallas nuevas y las Importantes las decide el liberador '
            + 'antes de enviar a aprobación.' },
    vets_veredicto: { title: 'Veredicto de VETS',
        text: 'Lo que VETS juzgó contra los límites que tiene configurados. Es informativo: el veredicto de Cascade es el de la '
            + 'regulación del vehículo, en la captura de gases.' },
    vets_politica: { title: 'Verificaciones de VETS',
        text: 'Importante: si falla, el liberador la justifica en esa prueba o no puede aplicar el archivo. Informativa: se muestra '
            + 'en amarillo y no detiene. Desacreditada: está mal configurada en VETS y ya no se pregunta; el valor y el FAIL siguen '
            + 'guardados en el registro de cada prueba. Cambiarlo pide permiso de regulaciones y queda en el historial de cambios.' },
    vets_obfcm: { title: 'OBFCM',
        text: 'Combustible y distancia que registró el propio vehículo (OBFCM) durante la prueba y la exactitud que calcula VETS '
            + '(Reg. (UE) 2017/1151, Anexo XXII §4.2). Se guarda por vehículo y se ve por familia en CoP → Expediente.' }
});
