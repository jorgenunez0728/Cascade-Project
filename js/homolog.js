// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Homologación Europa (v17.14)                            ║
// ║  Coeficientes de dinamómetro (f0/f1/f2/TM) y target de CO₂ por       ║
// ║  vehículo, capturados EN EL ALTA — no al preacondicionar.            ║
// ║                                                                      ║
// ║  Problema que resuelve: esos datos viven en el ICMS de HMG y hasta   ║
// ║  ahora había que entrar a buscarlos vehículo por vehículo, ya        ║
// ║  empezada la prueba. Aquí se importa UNA vez el Excel que baja el    ║
// ║  ICMS y a partir de ahí el Alta los autollena; el CoP puede          ║
// ║  comparar el CO₂ medido contra el target propio de cada vehículo y   ║
// ║  demostrar con qué coeficientes se corrió cada uno.                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

var HOMO_LS_KEY = 'kia_homolog_v1';

var homoState = {
    catalog: [],            // filas del ICMS: {id, mcCode, workOrder, ocn, wvta, variant, version, f0, f1, f2, tm, co2Combined, fcCombined, at, by}
    links: {},              // configCode → mcCode (recordar el enlace: el 2º vehículo de la misma config ya se autollena)
    ipFamilies: [],         // familias de interpolación del WVTA — ver bloque IP más abajo
    updatedAt: ''
};

// ─── PERSISTENCIA ─────────────────────────────────────────────────────────────

function homoLoad() {
    try {
        var raw = JSON.parse(localStorage.getItem(HOMO_LS_KEY));
        if (raw && typeof raw === 'object') {
            if (Array.isArray(raw.catalog)) homoState.catalog = raw.catalog;
            if (raw.links && typeof raw.links === 'object') homoState.links = raw.links;
            if (Array.isArray(raw.ipFamilies)) homoState.ipFamilies = raw.ipFamilies;
            homoState.updatedAt = raw.updatedAt || '';
        }
    } catch (e) {}
}

function homoSave() {
    homoState.updatedAt = new Date().toISOString();
    try {
        localStorage.setItem(HOMO_LS_KEY, JSON.stringify(homoState));
    } catch (e) {
        console.error('homoSave:', e);
        if (typeof showToast === 'function') showToast('⚠️ Almacenamiento lleno — el catálogo de homologación no se guardó.', 'error');
        return false;
    }
    try {
        if (typeof fbPush === 'function' && typeof fbSync !== 'undefined' && fbSync.enabled
            && typeof fbSyncModules !== 'undefined' && fbSyncModules.homolog) {
            fbPush('homolog', homoState);
        }
    } catch (e) {}
    return true;
}

var _homoLoaded = false;
function homoInit() { if (!_homoLoaded) { homoLoad(); _homoLoaded = true; } }
function homoSyncReload() {
    _homoLoaded = false;
    _homoIpIndex = null;               // el índice de familias IP se rehace tras un pull
    homoInit();
    if (typeof copInvalidateCache === 'function') copInvalidateCache();
}

// ─── REGIÓN ───────────────────────────────────────────────────────────────────

/** LA definición de "este vehículo necesita ficha de homologación". */
function homoIsEurope(region) {
    var r = String(region || '').trim().toUpperCase();
    return r === 'EUROPE' || r === 'EUROPA';
}

/** Región del vehículo o del set de filtros del Alta. */
function homoRegionOf(configLike) {
    if (!configLike) return '';
    return configLike['REGION'] || configLike.rgn || '';
}

// ─── CATÁLOGO: BÚSQUEDA ───────────────────────────────────────────────────────

function _homoNorm(s) {
    return String(s == null ? '' : s).trim().toUpperCase().replace(/[\s\-_/]+/g, '');
}

/**
 * Identidad de una fila del catálogo: la WORK ORDER; el MC code solo si no hay WO.
 * [2.29.0] Antes era al revés, y varias WO comparten MC code con coeficientes y CO₂
 * distintos: en el registro real del laboratorio `8GS6K5G17` aparece en 6 WO con f0
 * 102.5/113.7/113.9 y CO₂ 129/131/132. Con el MC code como clave, importar esas WO
 * las colapsaba en UNA fila (ganaba la última) y el Alta autollenaba con esa.
 */
function homoRowKey(row) {
    return _homoNorm(row && (row.workOrder || row.mcCode)) || '';
}

/** LA definición de búsqueda en el catálogo. Devuelve las filas que coinciden. */
function homoSearch(query, limit) {
    homoInit();
    var q = _homoNorm(query);
    if (!q) return homoState.catalog.slice(0, limit || 50);
    return homoState.catalog.filter(function(r) {
        return _homoNorm(r.mcCode).indexOf(q) !== -1
            || _homoNorm(r.workOrder).indexOf(q) !== -1
            || _homoNorm(r.variant).indexOf(q) !== -1
            || _homoNorm(r.version).indexOf(q) !== -1
            || _homoNorm(r.ocn).indexOf(q) !== -1;
    }).slice(0, limit || 50);
}

/**
 * Fila exacta por Work Order, o por MC code SOLO si ese MC code es de una sola fila.
 * [2.29.0] Un MC code con varias WO es ambiguo (cada WO trae sus propios valores):
 * devuelve null en vez de adivinar.
 */
function homoFindByKey(key) {
    homoInit();
    var k = _homoNorm(key);
    if (!k) return null;
    var i, byMc = [];
    for (i = 0; i < homoState.catalog.length; i++) {
        if (_homoNorm(homoState.catalog[i].workOrder) === k) return homoState.catalog[i];
    }
    for (i = 0; i < homoState.catalog.length; i++) {
        if (_homoNorm(homoState.catalog[i].mcCode) === k) byMc.push(homoState.catalog[i]);
    }
    return byMc.length === 1 ? byMc[0] : null;
}

/**
 * Sugerencia para una configuración del Alta: si esa config ya se ligó antes a
 * un MC code, devuelve esa fila. Es lo que hace que a partir del segundo
 * vehículo de la misma config ya no haya que buscar nada.
 */
function homoSuggestForConfig(configCode) {
    homoInit();
    if (!configCode) return null;
    var mc = homoState.links[configCode];
    return mc ? homoFindByKey(mc) : null;
}

function homoLinkConfig(configCode, mcCode) {
    homoInit();
    if (!configCode || !mcCode) return;
    homoState.links[configCode] = mcCode;
    homoSave();
}

// ─── FICHA DE UN VEHÍCULO ─────────────────────────────────────────────────────

/** LA definición de los datos de homologación de un vehículo (o null). */
function homoVehicleData(vehicle) {
    return (vehicle && vehicle.homolog) ? vehicle.homolog : null;
}

// ─── INERCIA (ETW) ────────────────────────────────────────────────────────────
// [v23.4] Inercia del dinamómetro = TM + MR, los dos del ICMS (MR = masa rotativa
// equivalente). Verificado con una captura del software del dinamómetro del
// laboratorio: TM 1568 + MR 44.7 = 1612.7 kg. NO es la TM sola.

/**
 * LA definición de la inercia (ETW) de un vehículo. PURA.
 * d: {tm, mr} → {inertia, tm, mr} redondeado a 0.1 kg, o null si falta alguno.
 */
function homoWltpInertia(d) {
    if (!d) return null;
    var num = function(v) { return (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v); };
    var tm = num(d.tm), mr = num(d.mr);
    if (tm === null || mr === null || !(tm > 0) || mr < 0) return null;
    var r1 = function(x) { return Math.round(x * 10) / 10; };
    return { inertia: r1(tm + mr), tm: tm, mr: mr };
}



// ─── CO₂: VEREDICTO ───────────────────────────────────────────────────────────

/**
 * LA definición de la desviación de CO₂ de un vehículo contra su target.
 * Devuelve null si falta alguno de los dos datos.
 */
function homoCo2Deviation(measured, target) {
    var m = parseFloat(measured), t = parseFloat(target);
    if (!isFinite(m) || !isFinite(t) || t === 0) return null;
    return ((m - t) / t) * 100;
}

/** CO₂ final verificado de un vehículo (mismo dato que usa el SPC). */
function homoMeasuredCo2(vehicle) {
    try {
        var vals = vehicle.testData.gasResults.liberador.values;
        var v = vals.CO2 != null ? vals.CO2 : vals.co2;
        var n = parseFloat(v);
        return isFinite(n) ? n : null;
    } catch (e) { return null; }
}

/** Arma las filas de CO₂ para los VINes que el CoP tiene en pantalla. */
function homoCo2RowsForVins(vins) {
    var byVin = {};
    try {
        (db.vehicles || []).forEach(function(v) { if (v && v.vin) byVin[String(v.vin).toUpperCase()] = v; });
    } catch (e) {}
    return (vins || []).filter(function(v) { return v; }).map(function(vin) {
        var veh = byVin[String(vin).toUpperCase()];
        var h = veh ? homoVehicleData(veh) : null;
        return {
            vin: vin,
            measured: veh ? homoMeasuredCo2(veh) : null,
            target: h ? h.co2Target : null,
            homolog: h
        };
    });
}

// ─── IMPORTADOR ───────────────────────────────────────────────────────────────
// Sin formato obligatorio: solo se pide una fila de encabezados. Se aceptan las
// dos descargas del ICMS por separado (la de "WLTP Driving energy" trae
// f0/f1/f2/TM y la de "WLTP - ICE/HEV" trae el CO₂) — se fusionan por MC code.

var HOMO_IMPORT_FIELDS = {
    mcCode:      { label: 'MC code',      syn: ['mccode', 'mc', 'codigomc', 'modelcode', 'mccodigo'] },
    workOrder:   { label: 'Work Order',   syn: ['workorderno', 'workorder', 'wono', 'ordendetrabajo', 'wo'] },
    ocn:         { label: 'OCN',          syn: ['ocn'] },
    wvta:        { label: 'WVTA No.',     syn: ['wvtano', 'wvta', 'homologacion', 'typeapproval'] },
    variant:     { label: 'Variant',      syn: ['variant', 'variante'] },
    version:     { label: 'Version',      syn: ['version', 'versión'] },
    // [2.29.0] El archivo del ICMS por Work Order trae DOS juegos de coeficientes:
    // "WLTP Driving Resistance f0" y "NEDC Driving Resistance f0" (102.5 contra 88.9
    // en el ejemplo real). El empate es EXACTO, así que el NEDC nunca entra: no
    // agregar aquí un sinónimo que pudiera empatar con él.
    f0:          { label: 'f0',           syn: ['f0', 'f0n', 'coefff0', 'wltpdrivingresistancef0'] },
    f1:          { label: 'f1',           syn: ['f1', 'f1nkmh', 'coefff1', 'wltpdrivingresistancef1'] },
    f2:          { label: 'f2',           syn: ['f2', 'f2nkmh2', 'coefff2', 'wltpdrivingresistancef2'] },
    tm:          { label: 'TM (masa)',    syn: ['tm', 'tmkg', 'testmass', 'testmasskg', 'masadeensayo', 'masa', 'wltpdrivingresistancetm'] },
    // [v23.4] MR: masa rotativa equivalente, la trae el ICMS. ETW (inercia) = TM + MR.
    mr:          { label: 'MR (masa rotativa)', syn: ['mr', 'mrkg', 'rotatingmass', 'rotatingmasskg', 'equivalentrotatingmass', 'masarotativa', 'masarotativakg'] },
    co2Combined: { label: 'CO₂ combinado', syn: ['combined', 'co2combined', 'co2combinado', 'combinado', 'co2', 'wltpco2combined'] },
    fcCombined:  { label: 'Consumo comb.', syn: ['fuelconsumptioncombined', 'consumocombinado', 'fccombined', 'wltpfuelconsumptioncombined'] }
};

function _homoNormHeader(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

/** Encabezados → {campo: índice de columna}. */
function homoAutoMap(headers) {
    var map = {}, used = {};
    var keys = (headers || []).map(_homoNormHeader);
    Object.keys(HOMO_IMPORT_FIELDS).forEach(function(field) {
        var syn = HOMO_IMPORT_FIELDS[field].syn;
        for (var i = 0; i < keys.length; i++) {
            if (used[i] || !keys[i]) continue;
            if (syn.indexOf(keys[i]) !== -1) { map[field] = i; used[i] = true; return; }
        }
    });
    return map;
}

function _homoNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    // Quita separadores de miles y deja el punto decimal ("1,507" → 1507)
    var s = String(v).trim().replace(/\s/g, '');
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
}

// ─── [2.29.0] EL ARCHIVO DEL ICMS POR WORK ORDER ──────────────────────────────
// El laboratorio baja del ICMS un Excel por unidad (por Work Order): 1 renglón de
// encabezados y 1 de datos, ~93 columnas, sin VIN adentro — el VIN va en el NOMBRE
// del archivo ("VIN_432873_1790797415928.xlsx"). Todo lo de abajo es PURO salvo
// homoReadFileGrid, y se prueba en tests/homolog.node.js con ese archivo real.

/** Renglón de encabezados: el primero (de los 10 primeros) con MC code o Work Order. PURA. */
function homoDetectHeaderRow(grid) {
    var n = Math.min((grid || []).length, 10);
    for (var i = 0; i < n; i++) {
        var m = homoAutoMap(grid[i] || []);
        if (m.mcCode !== undefined || m.workOrder !== undefined) return i;
    }
    return -1;
}

/**
 * LA definición de leer una retícula del ICMS. PURA.
 * → {rows:[registro], ignoradas, faltanColumnas:[etiquetas]} o {error}.
 */
function homoIcmsRows(grid) {
    var h = homoDetectHeaderRow(grid);
    if (h < 0) {
        return { error: 'No se encontró ninguna columna "MC code" ni "Work Order No." — sin eso no se puede saber a qué vehículo pertenece cada fila.' };
    }
    var map = homoAutoMap(grid[h]);
    var rows = [], ignoradas = 0;
    for (var i = h + 1; i < grid.length; i++) {
        var cells = grid[i] || [];
        var get = function(f) { return map[f] === undefined ? null : cells[map[f]]; };
        var txt = function(f) { var v = get(f); return v == null ? '' : String(v).trim(); };
        var rec = {
            mcCode: txt('mcCode'), workOrder: txt('workOrder'), ocn: txt('ocn'), wvta: txt('wvta'),
            variant: txt('variant'), version: txt('version'),
            f0: _homoNum(get('f0')), f1: _homoNum(get('f1')), f2: _homoNum(get('f2')), tm: _homoNum(get('tm')),
            mr: _homoNum(get('mr')),
            co2Combined: _homoNum(get('co2Combined')), fcCombined: _homoNum(get('fcCombined'))
        };
        if (!homoRowKey(rec)) {
            if (cells.some(function(c) { return c !== '' && c != null; })) ignoradas++;
            continue;
        }
        rows.push(rec);
    }
    var faltan = ['f0', 'f1', 'f2', 'tm', 'mr', 'co2Combined'].filter(function(f) { return map[f] === undefined; })
        .map(function(f) { return HOMO_IMPORT_FIELDS[f].label; });
    return { rows: rows, ignoradas: ignoradas, faltanColumnas: faltan };
}

/** "VIN_432873_1790797415928.xlsx" → "432873" (o '' si el nombre no trae VIN). PURA. */
function homoIcmsVinTail(fileName) {
    var m = /VIN[\s_\-.]*([A-HJ-NPR-Z0-9]{6,17})(?![A-Z0-9])/i.exec(String(fileName || ''));
    return m ? m[1].toUpperCase() : '';
}

/** ¿El VIN termina con lo que dice el archivo? true/false, o null si falta uno de los dos. PURA. */
function homoVinMatchesTail(vin, tail) {
    var v = String(vin || '').trim().toUpperCase(), t = String(tail || '').trim().toUpperCase();
    if (!v || !t) return null;
    return v.length >= t.length && v.slice(-t.length) === t;
}

/** Campos de la ficha de un vehículo que vienen del ICMS: [clave, etiqueta, numérico]. */
var HOMO_FICHA_FIELDS = [
    ['workOrder', 'Work Order', false], ['mcCode', 'MC code', false],
    ['f0', 'f0', true], ['f1', 'f1', true], ['f2', 'f2', true], ['tm', 'TM', true], ['mr', 'MR', true],
    ['co2Target', 'CO₂ declarado', true], ['fcCombined', 'Consumo declarado', true]
];

/** Registro del ICMS → ficha de vehículo (`vehicle.homolog`). PURA. */
function homoFichaFromIcms(row, meta) {
    meta = meta || {};
    return {
        mcCode: row.mcCode || '', workOrder: row.workOrder || '', ocn: row.ocn || '', wvta: row.wvta || '',
        variant: row.variant || '', version: row.version || '',
        f0: row.f0, f1: row.f1, f2: row.f2, tm: row.tm, mr: row.mr,
        co2Target: row.co2Combined, fcCombined: row.fcCombined,
        source: 'icms', icmsFile: meta.fileName || '', by: meta.by || '', at: meta.at || ''
    };
}

/**
 * Qué cambiaría la ficha del archivo sobre la guardada. PURA.
 * → {diffs:[{key,label,antes,despues}], blanks:[claves que hoy están vacías y el archivo llena]}.
 * Lo que el archivo trae vacío nunca cuenta: no borra nada.
 */
function homoFichaDiff(cur, next) {
    cur = cur || {}; next = next || {};
    var diffs = [], blanks = [];
    HOMO_FICHA_FIELDS.forEach(function(f) {
        var k = f[0], a = cur[k], b = next[k];
        if (b == null || b === '') return;
        if (a == null || a === '') { blanks.push(k); return; }
        var same = f[2] ? _homoNum(a) === _homoNum(b) : _homoNorm(a) === _homoNorm(b);
        if (!same) diffs.push({ key: k, label: f[1], antes: a, despues: b });
    });
    return { diffs: diffs, blanks: blanks };
}

var HOMO_LOCKED_STATUS = { 'pending-approval': true, archived: true };

/**
 * LA definición de qué hace una carga en lote. PURA.
 * items = [{fileName, tail, row}]; el VIN del nombre del archivo es lo que liga un
 * archivo con un vehículo (la Work Order NO: varias unidades comparten WO).
 * Acciones: llenar (sin ficha) · completar (solo huecos) · corregir (valores
 * distintos, vehículo todavía abierto) · igual · bloqueado (distintos y ya enviado o
 * liberado: el archivo no reescribe con qué se corrió) · no-europa · ambigua ·
 * sin-vin · sin-vehiculo.
 */
function homoIcmsBatchPlan(items, vehicles) {
    var all = (vehicles || []).filter(function(v) { return v && v.vin; });
    var out = [];
    (items || []).forEach(function(it, i) {
        var base = { item: i, fileName: it.fileName, tail: it.tail || '', row: it.row };
        var ficha = homoFichaFromIcms(it.row, { fileName: it.fileName });
        if (!it.tail) { out.push(Object.assign(base, { action: 'sin-vin' })); return; }
        var cand = all.filter(function(v) { return homoVinMatchesTail(v.vin, it.tail) === true; });
        if (!cand.length) { out.push(Object.assign(base, { action: 'sin-vehiculo' })); return; }
        if (cand.length > 1) {
            out.push(Object.assign(base, { action: 'ambigua', vins: cand.map(function(v) { return v.vin; }) }));
            return;
        }
        var v = cand[0];
        var e = Object.assign(base, { vehicleId: v.id, vin: v.vin, status: v.status || '' });
        if (!homoIsEurope(v.config && v.config['REGION'])) { out.push(Object.assign(e, { action: 'no-europa' })); return; }
        var d = homoFichaDiff(v.homolog, ficha);
        var hasData = !!(v.homolog && HOMO_FICHA_FIELDS.some(function(f) {
            var x = v.homolog[f[0]]; return x != null && x !== '';
        }));
        e.diffs = d.diffs; e.blanks = d.blanks;
        if (!d.diffs.length && !d.blanks.length) e.action = 'igual';
        else if (!d.diffs.length) e.action = hasData ? 'completar' : 'llenar';
        else if (HOMO_LOCKED_STATUS[v.status]) e.action = 'bloqueado';
        else e.action = 'corregir';
        out.push(e);
    });
    return out;
}

/** Une registros al catálogo por identidad (WO). Solo pisa lo que trae valor. */
function _homoCatalogUpsert(records, who, now) {
    var byKey = {};
    homoState.catalog.forEach(function(r) { byKey[homoRowKey(r)] = r; });
    var nuevas = 0, actualizadas = 0;
    (records || []).forEach(function(src) {
        var rec = Object.assign({}, src), key = homoRowKey(rec);
        if (!key) return;
        var existing = byKey[key];
        if (existing) {
            // Solo se rellena/actualiza lo que trae valor: la segunda descarga no
            // borra lo que puso la primera.
            Object.keys(rec).forEach(function(k) {
                var v = rec[k];
                if (v !== null && v !== '') existing[k] = v;
            });
            existing.at = now; existing.by = who;
            actualizadas++;
        } else {
            rec.id = 'homo_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
            rec.at = now; rec.by = who;
            homoState.catalog.push(rec);
            byKey[key] = rec;
            nuevas++;
        }
    });
    return { nuevas: nuevas, actualizadas: actualizadas };
}

/**
 * Aplica una retícula importada al catálogo. Fusiona por Work Order (MC code si no
 * hay WO): reimportar actualiza en vez de duplicar, y una segunda descarga (la de
 * CO₂) completa las filas que ya trajo la primera (la de coeficientes).
 * Devuelve {nuevas, actualizadas, ignoradas}.
 */
function homoImportApply(grid) {
    if (typeof authRequire === 'function' && !authRequire('homolog.manage', 'importar la homologación Europa')) return null;
    homoInit();
    if (!grid || !grid.length) return { nuevas: 0, actualizadas: 0, ignoradas: 0 };
    var parsed = homoIcmsRows(grid);
    if (parsed.error) return { error: parsed.error };

    var who = (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '';
    var res = _homoCatalogUpsert(parsed.rows, who, new Date().toISOString());

    homoSave();
    if (typeof auditLog === 'function') {
        auditLog('homolog', 'catalogo_importado', { type: 'homolog', label: 'ICMS' },
            res.nuevas + ' nuevas, ' + res.actualizadas + ' actualizadas');
    }
    return { nuevas: res.nuevas, actualizadas: res.actualizadas, ignoradas: parsed.ignoradas };
}

/** Hoja del lector propio ({renglón:{columna:valor}}, base 1) → arreglo de renglones. PURA. */
function _homoGridFromSheet(sheet) {
    var rows = Object.keys(sheet || {}).map(Number).filter(function(n) { return n > 0; });
    var max = rows.length ? Math.max.apply(null, rows) : 0, out = [];
    for (var r = 1; r <= max; r++) {
        var cells = sheet[r] || sheet[String(r)] || {}, line = [];
        Object.keys(cells).forEach(function(c) { line[Number(c) - 1] = cells[c]; });
        for (var i = 0; i < line.length; i++) if (line[i] === undefined) line[i] = '';
        out.push(line);
    }
    return out;
}

/**
 * Lee un archivo del ICMS → Promise<retícula>. .xlsx con el lector propio de vets.js
 * (sin internet: la red del trabajo bloquea el CDN de SheetJS); .csv como texto;
 * solo el .xls viejo (binario) necesita SheetJS.
 */
function homoReadFileGrid(file) {
    return new Promise(function(resolve, reject) {
        var name = file && file.name || '';
        var reader = new FileReader();
        reader.onerror = function() { reject(new Error('No se pudo leer «' + name + '».')); };
        if (/\.csv$/i.test(name)) {
            reader.onload = function() {
                var g = (typeof _pnProjParseDelimited === 'function') ? _pnProjParseDelimited(reader.result) : null;
                if (g && g.length) resolve(g); else reject(new Error('No se pudo leer el CSV «' + name + '». Revisa que tenga una fila de encabezados.'));
            };
            reader.readAsText(file);
            return;
        }
        if (/\.xls$/i.test(name)) {
            if (typeof _pnProjLoadXLSX !== 'function') { reject(new Error('Guarda «' + name + '» como .xlsx o .csv e inténtalo de nuevo.')); return; }
            _pnProjLoadXLSX(function(ok) {
                if (!ok) { reject(new Error('Los .xls viejos necesitan internet para leerse. Guarda «' + name + '» como .xlsx o .csv.')); return; }
                reader.onload = function() {
                    try {
                        var wb = window.XLSX.read(new Uint8Array(reader.result), { type: 'array' });
                        resolve(window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }));
                    } catch (e) { reject(new Error('No se pudo leer «' + name + '». Guárdalo de nuevo como .xlsx o .csv.')); }
                };
                reader.readAsArrayBuffer(file);
            });
            return;
        }
        if (typeof vetsReadWorkbook !== 'function') { reject(new Error('El lector de Excel no está disponible.')); return; }
        reader.onload = function() {
            vetsReadWorkbook(new Uint8Array(reader.result), null).then(function(sheets) {
                var grids = Object.keys(sheets).map(function(k) { return _homoGridFromSheet(sheets[k]); });
                var best = grids.filter(function(g) { return homoDetectHeaderRow(g) >= 0; })[0] ||
                    grids.sort(function(a, b) { return b.length - a.length; })[0];
                if (!best || !best.length) throw new Error('vacío');
                resolve(best);
            }).catch(function() {
                reject(new Error('No se pudo leer «' + name + '». Ábrelo en Excel, guárdalo de nuevo como .xlsx e inténtalo otra vez.'));
            });
        };
        reader.readAsArrayBuffer(file);
    });
}

// ─── ALTA: bloque de captura para vehículos Europa ────────────────────────────

/** ¿La cascada del Alta apunta hoy a un vehículo Europa? */
function homoAltaIsEurope() {
    try {
        if (typeof currentFilters !== 'undefined' && currentFilters && currentFilters['REGION']) {
            return homoIsEurope(currentFilters['REGION']);
        }
    } catch (e) {}
    return false;
}

/** Config code vigente en el Alta (para recordar el enlace). */
function _homoAltaConfigCode() {
    try {
        if (typeof allConfigurations === 'undefined' || typeof currentFilters === 'undefined') return '';
        var f = allConfigurations.filter(function(c) {
            for (var k in currentFilters) { if (c[k] !== currentFilters[k]) return false; }
            return true;
        });
        return f.length === 1 ? f[0].codigo_config_text : '';
    } catch (e) { return ''; }
}

/**
 * Muestra/oculta el bloque de homologación según la región elegida.
 * Se llama desde renderCascadeTree() (cop15.js) en cada cambio de la cascada.
 *
 * [2.29.0] Ya NO autollena con la unidad anterior de la misma configuración: los
 * coeficientes y el CO₂ cambian de una Work Order a otra (tres unidades de la misma
 * configuración: f0 97.3 / 112 / 111.6, CO₂ 142 / 145 / 144). Solo lo SUGIERE, y la
 * forma correcta es cargar el ICMS de esta unidad.
 */
function homoAltaSync() {
    var box = document.getElementById('homo-alta-box');
    if (!box) return;
    homoInit();

    var isEu = homoAltaIsEurope();
    box.style.display = isEu ? '' : 'none';
    if (!isEu) return;

    var f0 = document.getElementById('homo_f0');
    var st = document.getElementById('homo-alta-status');
    if (f0 && !f0.value && !_homoAltaIcms && st) {
        var sug = homoSuggestForConfig(_homoAltaConfigCode());
        st.innerHTML = sug
            ? '<span class="homo-alta-sug">💡 La última unidad de esta configuración usó la WO <b>' +
              escapeHtml(sug.workOrder || sug.mcCode) + '</b>. Los coeficientes y el CO₂ cambian de una Work Order a otra: ' +
              'carga el ICMS de <b>esta</b> unidad. <button type="button" class="tp-btn tp-btn-ghost" ' +
              'onclick="homoAltaPick(\'' + escapeHtml(homoRowKey(sug)) + '\')">Usar los de esa WO</button></span>'
            : '';
    }
    homoAltaUpdateStatus();
}

/** Pinta una fila del catálogo en los campos del Alta. */
function homoAltaFill(row, auto) {
    var set = function(id, v) {
        var el = document.getElementById(id);
        if (el) el.value = (v == null ? '' : v);
    };
    set('homo_mc', row.workOrder || row.mcCode || '');
    _homoAltaPicked = row;
    _homoAltaIcms = null;   // elegir del catálogo reemplaza al archivo cargado
    var icHost = document.getElementById('homo-alta-icms'); if (icHost) icHost.innerHTML = '';
    set('homo_f0', row.f0);
    set('homo_f1', row.f1);
    set('homo_f2', row.f2);
    set('homo_tm', row.tm);
    set('homo_mr', row.mr);
    set('homo_co2', row.co2Combined);
    var st = document.getElementById('homo-alta-status');
    if (st) {
        st.innerHTML = '<span style="color:var(--ok-text,#166534);">✅ ' +
            (auto ? 'Autollenado desde el catálogo' : 'Tomado del catálogo') +
            ' — <b>WO ' + escapeHtml(row.workOrder || '—') + '</b>' +
            (row.mcCode ? ' · MC ' + escapeHtml(row.mcCode) : '') + '</span>';
    }
    homoAltaUpdateStatus();
}

/** Busca en el catálogo lo que el operador escribió en el campo MC code. */
function homoAltaSearchFromInput() {
    var el = document.getElementById('homo_mc');
    var q = el ? el.value : '';
    var listEl = document.getElementById('homo-alta-results');
    if (!listEl) return;
    homoInit();

    if (!String(q).trim()) { listEl.innerHTML = ''; return; }
    var hits = homoSearch(q, 8);
    if (!hits.length) {
        listEl.innerHTML = '<div style="font-size: var(--fs-sm);color:var(--muted);padding:6px 0;">' +
            'Sin coincidencias en el catálogo. Puedes capturar los valores a mano abajo, ' +
            'o importar el Excel del ICMS en Datos → 🇪🇺 Homologación.</div>';
        return;
    }
    listEl.innerHTML = hits.map(function(r) {
        return '<button type="button" class="btn-secondary" style="display:block;width:100%;text-align:left;margin:3px 0;padding: var(--space-sm) var(--space-md);font-size: var(--fs-sm);" ' +
            'onclick="homoAltaPick(\'' + escapeHtml(homoRowKey(r)) + '\')">' +
            '<b>' + escapeHtml(r.workOrder || r.mcCode) + '</b>' + (r.workOrder && r.mcCode ? ' · ' + escapeHtml(r.mcCode) : '') +
            (r.variant ? ' · ' + escapeHtml(r.variant) : '') +
            (r.version ? '/' + escapeHtml(r.version) : '') +
            '<span style="color:var(--muted);"> — f0 ' + (r.f0 == null ? '—' : r.f0) +
            ' · CO₂ ' + (r.co2Combined == null ? '—' : r.co2Combined) + '</span></button>';
    }).join('');
}

function homoAltaPick(key) {
    var row = homoFindByKey(key);
    if (!row) return;
    homoAltaFill(row, false);
    var listEl = document.getElementById('homo-alta-results');
    if (listEl) listEl.innerHTML = '';
    var code = _homoAltaConfigCode();
    if (code) homoLinkConfig(code, row.workOrder || row.mcCode);
}

/** Aviso (no bloqueante) de qué falta. */
function homoAltaUpdateStatus() {
    var warn = document.getElementById('homo-alta-warn');
    if (!warn) return;
    var d = homoAltaCollect();
    var missing = [];
    if (d.f0 == null) missing.push('f0');
    if (d.f1 == null) missing.push('f1');
    if (d.f2 == null) missing.push('f2');
    if (d.tm == null) missing.push('TM');
    if (d.mr == null) missing.push('MR (para la inercia)');
    if (d.co2Target == null) missing.push('CO₂ target');
    var inr = homoWltpInertia(d);
    var inrLine = inr ? '<div class="homo-inertia-line">⚙️ Inercia (ETW): <b>' + inr.inertia + ' kg</b> <span>= TM ' + inr.tm + ' + MR ' + inr.mr + '</span></div>' : '';
    if (d.source === 'icms') inrLine = _homoVinLineHTML(d.vinCheck, _homoAltaIcms && _homoAltaIcms.tail) + inrLine +
        (d.edited && d.edited.length ? '<div class="homo-icms-note">✏️ Cambiaste a mano: ' + escapeHtml(d.edited.join(', ')) +
            '. Se guarda lo que está en los campos y queda anotado que difiere del archivo.</div>' : '');
    warn.innerHTML = inrLine + (missing.length
        ? '<span style="color:var(--warn-text,#92400e);">⚠️ Falta: ' + missing.join(', ') +
          '. Puedes registrar igual, pero el CoP no podrá comparar el CO₂ de este vehículo.</span>'
        : '<span style="color:var(--ok-text,#166534);">✅ Ficha completa.</span>');
}

/** Lee los campos del Alta. Devuelve la ficha (o con nulls si están vacíos). */
function homoAltaCollect() {
    var num = function(id) {
        var el = document.getElementById(id);
        return el ? _homoNum(el.value) : null;
    };
    var txt = function(id) {
        var el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
    };
    var d = {
        mcCode: txt('homo_mc'),
        f0: num('homo_f0'), f1: num('homo_f1'), f2: num('homo_f2'), tm: num('homo_tm'),
        mr: num('homo_mr'),
        co2Target: num('homo_co2'),
        source: 'alta',
        by: (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '',
        at: new Date().toISOString()
    };
    // [2.29.0] La ficha recuerda DE DÓNDE salió: el archivo del ICMS (con su WO, su
    // nombre y si el VIN del nombre coincide) o la fila del catálogo elegida.
    var ic = _homoAltaIcms;
    if (ic && ic.applied) {
        var f = homoFichaFromIcms(ic.row, { fileName: ic.fileName });
        ['mcCode', 'workOrder', 'ocn', 'wvta', 'variant', 'version', 'fcCombined', 'icmsFile'].forEach(function(k) { d[k] = f[k]; });
        d.source = 'icms';
        d.edited = [['f0', 'f0'], ['f1', 'f1'], ['f2', 'f2'], ['tm', 'TM'], ['mr', 'MR'], ['co2Target', 'CO₂']]
            .filter(function(p) { return _homoNum(f[p[0]]) !== d[p[0]]; })
            .map(function(p) { return p[1]; });
        var vinEl = document.getElementById('vin');
        var chk = homoVinMatchesTail(vinEl ? vinEl.value : '', ic.tail);
        d.vinCheck = chk === true ? 'coincide' : chk === false ? 'no-coincide' : 'sin-dato';
    } else if (_homoAltaPicked && _homoNorm(d.mcCode) === homoRowKey(_homoAltaPicked)) {
        d.mcCode = _homoAltaPicked.mcCode || d.mcCode;
        d.workOrder = _homoAltaPicked.workOrder || '';
        d.source = 'catalogo';
    }
    return d;
}

/** Limpia el bloque (tras registrar un vehículo). */
function homoAltaReset() {
    ['homo_mc', 'homo_f0', 'homo_f1', 'homo_f2', 'homo_tm', 'homo_mr', 'homo_co2'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var r = document.getElementById('homo-alta-results'); if (r) r.innerHTML = '';
    var s = document.getElementById('homo-alta-status'); if (s) s.innerHTML = '';
    var p = document.getElementById('homo-alta-icms'); if (p) p.innerHTML = '';
    _homoAltaIcms = null; _homoAltaPicked = null;
    homoAltaUpdateStatus();
}

// ─── [2.29.0] ALTA: cargar el archivo del ICMS de esta unidad ─────────────────

var _homoAltaIcms = null;    // {fileName, tail, rows, row, applied} — solo el Alta abierta
var _homoAltaPicked = null;  // fila del catálogo elegida a mano

/** Línea del cruce VIN del archivo ↔ VIN capturado. PURA. */
function _homoVinLineHTML(check, tail) {
    if (!tail) return '<div class="homo-icms-vin homo-icms-vin--info">ℹ️ El nombre del archivo no trae VIN: no se puede comprobar que sea de esta unidad.</div>';
    if (check === 'coincide') return '<div class="homo-icms-vin homo-icms-vin--ok">✅ El archivo es del VIN …' + escapeHtml(tail) + ': coincide con el VIN capturado.</div>';
    if (check === 'no-coincide') return '<div class="homo-icms-vin homo-icms-vin--bad" role="alert">⚠️ El archivo es del VIN …' + escapeHtml(tail) +
        ' y el VIN capturado NO termina así. Revisa que sea el ICMS de esta unidad.</div>';
    return '<div class="homo-icms-vin homo-icms-vin--info">ℹ️ El archivo es del VIN …' + escapeHtml(tail) + '. Escribe el VIN arriba para comprobar que coincide.</div>';
}

/** Vista previa de un registro del ICMS antes de usarlo. PURA. */
function homoIcmsPreviewHTML(row, ctx) {
    ctx = ctx || {};
    var v = function(x, u) { return x == null ? '<span class="homo-icms-miss">—</span>' : escapeHtml(String(x)) + (u ? ' ' + u : ''); };
    var inr = homoWltpInertia(row);
    var html = '<div class="homo-icms-card">';
    html += '<div class="homo-icms-head">📄 <b>' + escapeHtml(ctx.fileName || 'Archivo del ICMS') + '</b></div>';
    html += '<div class="homo-icms-id">WO <b>' + escapeHtml(row.workOrder || '—') + '</b>' +
        (row.mcCode ? ' · MC ' + escapeHtml(row.mcCode) : '') +
        (row.variant ? ' · ' + escapeHtml(row.variant) + (row.version ? '/' + escapeHtml(row.version) : '') : '') + '</div>';
    html += _homoVinLineHTML(ctx.check, ctx.tail);
    html += '<div class="homo-icms-grid">' +
        '<span>f0</span><b>' + v(row.f0, 'N') + '</b>' +
        '<span>f1</span><b>' + v(row.f1, 'N/(km/h)') + '</b>' +
        '<span>f2</span><b>' + v(row.f2, 'N/(km/h)²') + '</b>' +
        '<span>TM</span><b>' + v(row.tm, 'kg') + '</b>' +
        '<span>MR</span><b>' + v(row.mr, 'kg') + '</b>' +
        '<span>Inercia (ETW)</span><b>' + (inr ? inr.inertia + ' kg' : '<span class="homo-icms-miss">—</span>') + '</b>' +
        '<span>CO₂ declarado</span><b>' + v(row.co2Combined, 'g/km') + '</b>' +
        '<span>Consumo declarado</span><b>' + v(row.fcCombined, 'L/100 km') + '</b>' +
        '</div>';
    if (ctx.faltan && ctx.faltan.length) {
        html += '<div class="homo-icms-note">⚠️ El archivo no trae: ' + escapeHtml(ctx.faltan.join(', ')) + '.</div>';
    }
    html += '<div class="homo-icms-note">Se leen los valores <b>WLTP</b>; los NEDC del mismo archivo se ignoran.</div>';
    return html + '</div>';
}

/** Input de archivo del Alta → lee, y muestra la vista previa (no llena nada todavía). */
function homoAltaIcmsPick(ev) {
    var input = ev && ev.target, file = input && input.files && input.files[0];
    if (input) input.value = '';
    if (!file) return;
    var host = document.getElementById('homo-alta-icms');
    if (host) host.innerHTML = '<div class="homo-icms-note">⏳ Leyendo «' + escapeHtml(file.name) + '»…</div>';
    // El cruce de VIN se vuelve a evaluar si el VIN se escribe después de cargar.
    var vinEl = document.getElementById('vin');
    if (vinEl && !vinEl._homoIcmsListen) {
        vinEl._homoIcmsListen = true;
        vinEl.addEventListener('input', function() { if (_homoAltaIcms) { homoAltaUpdateStatus(); if (!_homoAltaIcms.applied) homoAltaIcmsShow(); } });
    }
    homoReadFileGrid(file).then(function(grid) {
        var p = homoIcmsRows(grid);
        if (p.error || !p.rows.length) throw new Error(p.error || 'El archivo no trae ninguna fila con Work Order.');
        _homoAltaIcms = { fileName: file.name, tail: p.rows.length === 1 ? homoIcmsVinTail(file.name) : '',
                          rows: p.rows, faltan: p.faltanColumnas, row: p.rows.length === 1 ? p.rows[0] : null, applied: false };
        homoAltaIcmsShow();
    }).catch(function(e) {
        _homoAltaIcms = null;
        if (host) host.innerHTML = '<div class="homo-icms-vin homo-icms-vin--bad" role="alert">⚠️ ' + escapeHtml(e.message) + '</div>';
    });
}

/** Pinta la vista previa (o la lista de WO si el archivo trae varias). */
function homoAltaIcmsShow(idx) {
    var ic = _homoAltaIcms, host = document.getElementById('homo-alta-icms');
    if (!ic || !host) return;
    if (typeof idx === 'number' && ic.rows[idx]) ic.row = ic.rows[idx];
    if (!ic.row) {
        host.innerHTML = '<div class="homo-icms-card"><div class="homo-icms-head">📄 «' + escapeHtml(ic.fileName) + '» trae ' +
            ic.rows.length + ' Work Orders. ¿Cuál es la de esta unidad?</div>' +
            ic.rows.map(function(r, i) {
                return '<button type="button" class="tp-btn tp-btn-ghost homo-icms-pick" onclick="homoAltaIcmsShow(' + i + ')">' +
                    'WO <b>' + escapeHtml(r.workOrder || '—') + '</b> · f0 ' + (r.f0 == null ? '—' : r.f0) +
                    ' · CO₂ ' + (r.co2Combined == null ? '—' : r.co2Combined) + '</button>';
            }).join('') + '</div>';
        return;
    }
    var vinEl = document.getElementById('vin');
    var chk = homoVinMatchesTail(vinEl ? vinEl.value : '', ic.tail);
    var check = chk === true ? 'coincide' : chk === false ? 'no-coincide' : 'sin-dato';
    var html = homoIcmsPreviewHTML(ic.row, { fileName: ic.fileName, tail: ic.tail, check: check, faltan: ic.faltan });
    html += '<div class="homo-icms-actions">' +
        '<button type="button" class="tp-btn ' + (check === 'no-coincide' ? 'tp-btn-ghost' : 'tp-btn-primary') + '" onclick="homoAltaIcmsUse()">' +
        (check === 'no-coincide' ? 'Usar de todos modos' : '✓ Usar estos valores') + '</button>' +
        '<button type="button" class="tp-btn tp-btn-ghost" onclick="homoAltaIcmsCancel()">Cancelar</button></div>';
    host.innerHTML = html;
}

/** Llena los campos del Alta con el registro del archivo (como si se tecleara). */
function homoAltaIcmsUse() {
    var ic = _homoAltaIcms;
    if (!ic || !ic.row) return;
    var r = ic.row;
    var set = function(id, v) { var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
    set('homo_mc', r.workOrder || r.mcCode || '');
    set('homo_f0', r.f0); set('homo_f1', r.f1); set('homo_f2', r.f2);
    set('homo_tm', r.tm); set('homo_mr', r.mr); set('homo_co2', r.co2Combined);
    ic.applied = true;
    _homoAltaPicked = null;
    var host = document.getElementById('homo-alta-icms');
    if (host) host.innerHTML = '<div class="homo-icms-done">✅ Tomado del ICMS «' + escapeHtml(ic.fileName) + '» — WO <b>' +
        escapeHtml(r.workOrder || '—') + '</b> <button type="button" class="tp-btn tp-btn-ghost" onclick="homoAltaIcmsCancel(true)">Quitar</button></div>';
    var st = document.getElementById('homo-alta-status'); if (st) st.innerHTML = '';
    var lst = document.getElementById('homo-alta-results'); if (lst) lst.innerHTML = '';
    homoAltaUpdateStatus();
}

/** Descarta el archivo; con `clear` también vacía los campos que llenó. */
function homoAltaIcmsCancel(clear) {
    var host = document.getElementById('homo-alta-icms');
    if (host) host.innerHTML = '';
    if (clear) {
        ['homo_mc', 'homo_f0', 'homo_f1', 'homo_f2', 'homo_tm', 'homo_mr', 'homo_co2'].forEach(function(id) {
            var el = document.getElementById(id); if (el) el.value = '';
        });
    }
    _homoAltaIcms = null;
    homoAltaUpdateStatus();
}

// ─── PANEL: pestaña del catálogo (Datos → ⋯ Más → 🇪🇺 Homologación) ───────────

function pnRenderHomolog(el) {
    homoInit();
    var cat = homoState.catalog;
    var conCo2 = cat.filter(function(r) { return r.co2Combined != null; }).length;
    var conDyno = cat.filter(function(r) { return r.f0 != null && r.f1 != null; }).length;

    var html = '';

    html += '<div class="tp-card">';
    html += '<div class="tp-card-title" data-help="pn-homolog-help"><span>🇪🇺 Catálogo de homologación (ICMS)</span></div>';
    html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom: var(--space-md);line-height:1.5;">' +
        'Importa aquí el Excel/CSV que baja el ICMS. Cada fila se identifica por su <b>Work Order</b> ' +
        '(varias WO comparten MC code con valores distintos), así que reimportar actualiza, no duplica, ' +
        'y una segunda descarga completa las filas de la primera.</div>';

    // [2.29.0] Los archivos del ICMS de cada unidad (uno por Work Order, con el VIN en el nombre).
    html += '<div class="homo-batch-box">';
    html += '<div class="homo-batch-title" data-help="homo-icms-batch-help">📥 Cargar el ICMS de unidades ya registradas</div>';
    html += '<div class="homo-batch-text">Selecciona uno o varios archivos <b>VIN_…xlsx</b> del ICMS. Cada uno se liga a su vehículo ' +
        'por el VIN del nombre, y antes de aplicar ves qué se llena y qué cambiaría.</div>';
    html += '<input type="file" id="homo-batch-file" accept=".xlsx,.csv" multiple class="form-control" onchange="homoIcmsBatchFiles(event)" ' +
        'aria-label="Archivos del ICMS por unidad">';
    html += '</div>';

    html += '<div class="inv-row-list-2col" style="margin-bottom: var(--space-md);">';
    html += '<div class="form-group"><label for="homo-file">Archivo del ICMS (.xlsx / .xls / .csv)</label>' +
        '<input type="file" id="homo-file" accept=".xlsx,.xls,.csv" class="form-control" onchange="homoImportFile(event)"></div>';
    html += '<div class="form-group"><label for="homo-paste">…o pega las filas (copiadas del ICMS)</label>' +
        '<textarea id="homo-paste" class="form-control" rows="3" placeholder="Pega aquí incluyendo la fila de encabezados"></textarea>' +
        '<button class="tp-btn tp-btn-primary" style="margin-top: var(--space-sm);" onclick="homoImportPaste()">Importar lo pegado</button></div>';
    html += '</div>';
    html += '<div id="homo-import-status" role="status" style="font-size: var(--fs-sm);margin-bottom: var(--space-md);">' +
        (window._homoLastImport ? '<span style="color:var(--ok-text,#166534);">' + escapeHtml(window._homoLastImport) + '</span>' : '') + '</div>';

    html += '<div style="display:flex;gap: var(--space-lg);flex-wrap:wrap;font-size: var(--fs-sm);color:var(--tp-dim);">' +
        '<span><b style="color:var(--tp-text);font-size:18px;">' + cat.length + '</b> vehículos en catálogo</span>' +
        '<span><b style="color:var(--tp-text);font-size:18px;">' + conDyno + '</b> con coeficientes</span>' +
        '<span><b style="color:var(--tp-text);font-size:18px;">' + conCo2 + '</b> con target de CO₂</span>' +
        '</div>';
    html += '</div>';

    // ── Familias de interpolación (WVTA) ──
    html += _homoIpCardHTML();

    // ── [v20.2] La verificación de CO₂ dejó de ser un % de tolerancia:
    // ahora es el muestreo secuencial de UN R154 §3.3.1 (FCF/Evolution Factor
    // por familia), viviendo en CoP → Validador → 🌱 CO₂ vs valor declarado
    // — ahí mismo es donde se ve el efecto de cada ajuste al instante.
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title"><span>🎯 Verificación de CO₂</span></div>';
    html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);">' +
        'El veredicto de CO₂ (con FCF y Evolution Factor por familia) se configura y se ve en ' +
        '<b>CoP → Validador</b>, dentro de la mesa de trabajo de cada familia — se recalcula ahí ' +
        'mismo al cambiar un ajuste o agregar/quitar un vehículo.</div>';
    html += '</div>';

    // ── Listado ──
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title"><span>📋 Vehículos del catálogo</span>' +
        (cat.length ? '<button class="tp-btn tp-btn-ghost" onclick="homoExportCSV()" style="font-size: var(--fs-sm);">📤 Exportar CSV</button>' : '') +
        '</div>';
    if (!cat.length) {
        html += '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);font-size: var(--fs-sm);">' +
            'Todavía no hay nada importado. Sube el archivo del ICMS arriba.</div>';
    } else {
        html += '<div style="overflow-x:auto;"><table class="u-cards" style="width:100%;border-collapse:collapse;font-size: var(--fs-xs);">';
        html += '<thead><tr>' +
            ['MC code', 'Work Order', 'Variant/Version', 'f0', 'f1', 'f2', 'TM', 'CO₂ comb.', ''].map(function(h) {
                return '<th style="text-align:left;padding: var(--space-sm) var(--space-sm);border-bottom:1.5px solid var(--tp-border);white-space:nowrap;">' + h + '</th>';
            }).join('') + '</tr></thead><tbody>';
        cat.slice(0, 300).forEach(function(r) {
            var num = function(v) { return v == null ? '<span style="color:var(--tp-red);">—</span>' : v; };
            html += '<tr>' +
                '<td style="padding: var(--space-xs) var(--space-sm);border-bottom:1px solid var(--tp-border);font-weight:700;">' + escapeHtml(r.mcCode || '—') + '</td>' +
                '<td style="padding: var(--space-xs) var(--space-sm);border-bottom:1px solid var(--tp-border);">' + escapeHtml(r.workOrder || '—') + '</td>' +
                '<td style="padding: var(--space-xs) var(--space-sm);border-bottom:1px solid var(--tp-border);">' + escapeHtml((r.variant || '') + (r.version ? '/' + r.version : '')) + '</td>' +
                '<td style="padding: var(--space-xs) var(--space-sm);border-bottom:1px solid var(--tp-border);">' + num(r.f0) + '</td>' +
                '<td style="padding: var(--space-xs) var(--space-sm);border-bottom:1px solid var(--tp-border);">' + num(r.f1) + '</td>' +
                '<td style="padding: var(--space-xs) var(--space-sm);border-bottom:1px solid var(--tp-border);">' + num(r.f2) + '</td>' +
                '<td style="padding: var(--space-xs) var(--space-sm);border-bottom:1px solid var(--tp-border);">' + num(r.tm) + '</td>' +
                '<td style="padding: var(--space-xs) var(--space-sm);border-bottom:1px solid var(--tp-border);font-weight:700;">' + num(r.co2Combined) + '</td>' +
                '<td style="padding: var(--space-xs) var(--space-sm);border-bottom:1px solid var(--tp-border);">' +
                '<button class="tp-btn tp-btn-ghost" style="color:var(--tp-red);font-size: var(--fs-sm);" onclick="homoDeleteRow(\'' + r.id + '\')" title="Quitar del catálogo">🗑</button></td>' +
                '</tr>';
        });
        html += '</tbody></table></div>';
        if (cat.length > 300) {
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);padding-top: var(--space-sm);">Mostrando 300 de ' + cat.length + '.</div>';
        }
    }
    html += '</div>';

    el.innerHTML = html;
}


function homoDeleteRow(id) {
    showConfirm('No afecta a los vehículos ya registrados. Podrás deshacerlo unos segundos.', function() {
        homoInit();
        var antes = JSON.parse(JSON.stringify(homoState.catalog));
        homoState.catalog = homoState.catalog.filter(function(r) { return r.id !== id; });
        homoSave();
        if (typeof pnRender === 'function') pnRender();
        toastUndo('Fila del catálogo eliminada', function() { homoState.catalog = antes; homoSave(); if (typeof pnRender === 'function') pnRender(); });
    }, { type: 'danger', title: '¿Quitar este vehículo del catálogo ICMS?', confirmText: 'Quitar' });
}

function _homoImportReport(res) {
    var st = document.getElementById('homo-import-status');
    if (!st || !res) return;   // [2.1.0] null = el rol no permite importar (ya se avisó)
    if (res.error) {
        st.innerHTML = '<span style="color:var(--tp-red);">' + escapeHtml(res.error) + '</span>';
        return;
    }
    // [v24] El resumen se guarda y lo vuelve a pintar el render: antes se escribía aquí y a
    // los 0.9 s `pnRender()` repintaba el panel entero y lo borraba antes de poder leerlo.
    window._homoLastImport = '✅ ' + res.nuevas + ' nuevas, ' + res.actualizadas + ' actualizadas' +
        (res.ignoradas ? ', ' + res.ignoradas + ' ignoradas (sin MC code)' : '') + ' · ' +
        new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    if (typeof pnRender === 'function') pnRender();
}

function homoImportPaste() {
    var el = document.getElementById('homo-paste');
    var text = el ? el.value : '';
    if (!String(text).trim()) { showToast('Pega primero las filas del ICMS.', 'warning'); return; }
    var grid = (typeof _pnProjParseDelimited === 'function') ? _pnProjParseDelimited(text) : null;
    if (!grid || !grid.length) { showToast('No se pudo leer lo pegado.', 'error'); return; }
    _homoImportReport(homoImportApply(grid));
}

function homoImportFile(ev) {
    var input = ev.target;
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    // [v24] Estado de carga a la vista: un .xlsx grande tarda y antes no se veía nada.
    var st = document.getElementById('homo-import-status');
    if (st) st.innerHTML = '<span style="color:var(--muted);">⏳ Leyendo «' + escapeHtml(file.name) + '»…</span>';
    // [2.29.0] El .xlsx se lee con el lector propio (sin internet); antes dependía del
    // CDN de SheetJS, que la red del trabajo bloquea.
    homoReadFileGrid(file).then(function(grid) {
        _homoImportReport(homoImportApply(grid));
    }).catch(function(e) {
        console.error('homoImportFile:', e);
        if (st) st.innerHTML = '<span style="color:var(--tp-red);">' + escapeHtml(e.message) + '</span>';
        showToast(e.message, 'error');
    });
}

// ─── [2.29.0] CARGA EN LOTE: el ICMS de unidades ya registradas ───────────────

var HOMO_BATCH_ACTIONS = {
    'llenar':       { label: '➕ Llenar la ficha',   pick: true,  def: true },
    'completar':    { label: '➕ Completar',          pick: true,  def: true },
    'corregir':     { label: '✏️ Valores distintos',  pick: true,  def: false },
    'igual':        { label: '✓ Ya está igual',       pick: false },
    'bloqueado':    { label: '🔒 No se cambia',        pick: false },
    'no-europa':    { label: 'No es de Europa',       pick: false },
    'ambigua':      { label: '⚠️ VIN ambiguo',         pick: false },
    'sin-vin':      { label: 'Solo al catálogo',      pick: false },
    'sin-vehiculo': { label: 'Solo al catálogo',      pick: false }
};

function _homoStatusWord(st) {
    return st === 'archived' ? 'liberado' : st === 'pending-approval' ? 'en aprobación' : 'en curso';
}

function _homoFieldLabel(k) {
    for (var i = 0; i < HOMO_FICHA_FIELDS.length; i++) if (HOMO_FICHA_FIELDS[i][0] === k) return HOMO_FICHA_FIELDS[i][1];
    return k;
}

/** La revisión del lote, antes de aplicar. PURA. */
function homoIcmsBatchHTML(plan, errores) {
    var html = '';
    var cnt = {};
    plan.forEach(function(e) { cnt[e.action] = (cnt[e.action] || 0) + 1; });
    var listos = (cnt.llenar || 0) + (cnt.completar || 0);
    html += '<p class="homo-batch-sum">' + plan.length + ' registro(s) leído(s): <b>' + listos + '</b> listo(s) para llenar' +
        (cnt.corregir ? ', <b>' + cnt.corregir + '</b> con valores distintos (sin marcar)' : '') +
        (cnt.bloqueado ? ', ' + cnt.bloqueado + ' ya enviado(s) o liberado(s)' : '') + '.</p>';
    plan.forEach(function(e, i) {
        var a = HOMO_BATCH_ACTIONS[e.action] || { label: e.action };
        var who = e.vin ? '<b>' + escapeHtml(e.vin) + '</b> · ' + _homoStatusWord(e.status)
                : e.tail ? 'VIN …' + escapeHtml(e.tail) : 'sin VIN en el nombre';
        var detail = '';
        if (e.action === 'completar' || e.action === 'llenar') {
            detail = 'Llena: ' + (e.blanks || []).map(_homoFieldLabel).join(', ');
        } else if (e.action === 'corregir' || e.action === 'bloqueado') {
            detail = (e.diffs || []).map(function(d) {
                return escapeHtml(d.label) + ' ' + escapeHtml(String(d.antes)) + ' → <b>' + escapeHtml(String(d.despues)) + '</b>';
            }).join(' · ');
            if (e.action === 'bloqueado') detail += '<br>La prueba ya se envió o se liberó con los valores de la ficha: el archivo no los reescribe.';
            else detail += '<br>Márcalo solo si la ficha del vehículo está mal.';
        } else if (e.action === 'ambigua') {
            detail = 'Varios vehículos terminan en …' + escapeHtml(e.tail) + ': ' + escapeHtml((e.vins || []).join(', ')) + '.';
        } else if (e.action === 'sin-vehiculo') {
            detail = 'Ningún vehículo registrado termina en …' + escapeHtml(e.tail) + '.';
        } else if (e.action === 'sin-vin') {
            detail = 'El nombre del archivo no trae VIN, así que no se liga a ningún vehículo.';
        } else if (e.action === 'no-europa') {
            detail = 'La ficha de homologación es solo para región Europa.';
        }
        html += '<label class="homo-batch-row homo-batch-row--' + e.action + '">' +
            '<input type="checkbox" data-homo-batch="' + i + '"' + (a.pick ? (a.def ? ' checked' : '') : ' disabled') + '>' +
            '<span class="homo-batch-main"><span class="homo-batch-file">' + escapeHtml(e.fileName) + ' · WO ' +
            escapeHtml(e.row.workOrder || '—') + '</span><span>' + who + '</span>' +
            '<span class="homo-batch-detail">' + detail + '</span></span>' +
            '<span class="homo-batch-chip">' + a.label + '</span></label>';
    });
    (errores || []).forEach(function(er) {
        html += '<div class="homo-batch-row homo-batch-row--error" role="alert">⚠️ <b>' + escapeHtml(er.fileName) + '</b>: ' + escapeHtml(er.error) + '</div>';
    });
    html += '<p class="homo-batch-foot">Todos los registros leídos se agregan también al catálogo, por Work Order.</p>';
    return html;
}

/** Input múltiple de Datos → Homologación. */
function homoIcmsBatchFiles(ev) {
    var input = ev && ev.target;
    var files = Array.prototype.slice.call((input && input.files) || []);
    if (input) input.value = '';
    if (!files.length) return;
    if (typeof authRequire === 'function' && !authRequire('homolog.manage', 'cargar el ICMS a los vehículos')) return;
    var st = document.getElementById('homo-import-status');
    if (st) st.innerHTML = '<span style="color:var(--muted);">⏳ Leyendo ' + files.length + ' archivo(s)…</span>';
    Promise.all(files.map(function(f) {
        return homoReadFileGrid(f).then(function(g) { return { fileName: f.name, grid: g }; },
                                         function(e) { return { fileName: f.name, error: e.message }; });
    })).then(function(res) {
        var items = [], errores = [];
        res.forEach(function(r) {
            if (r.error) { errores.push(r); return; }
            var p = homoIcmsRows(r.grid);
            if (p.error || !p.rows.length) { errores.push({ fileName: r.fileName, error: p.error || 'No trae ninguna fila con Work Order.' }); return; }
            // El VIN del nombre solo identifica al renglón si el archivo trae UNO.
            var tail = p.rows.length === 1 ? homoIcmsVinTail(r.fileName) : '';
            p.rows.forEach(function(row) { items.push({ fileName: r.fileName, tail: tail, row: row }); });
        });
        if (st) st.innerHTML = '';
        if (!items.length) {
            showToast('Ningún archivo se pudo leer: ' + errores.map(function(e) { return e.fileName + ' (' + e.error + ')'; }).join('; '), 'error');
            return;
        }
        var plan = homoIcmsBatchPlan(items, (typeof db !== 'undefined' && db.vehicles) || []);
        showModal({
            title: 'Cargar ICMS — revisa antes de aplicar', type: 'info',
            body: homoIcmsBatchHTML(plan, errores),
            buttons: [
                { label: 'Cancelar' },
                { label: 'Aplicar', cls: 'btn-primary', onclick: function() {
                    var picks = Array.prototype.slice.call(document.querySelectorAll('#globalModal [data-homo-batch]:checked'))
                        .map(function(el) { var i = parseInt(el.getAttribute('data-homo-batch'), 10); return { i: i, action: plan[i].action }; });
                    var m = document.getElementById('globalModal'); if (m) m.style.display = 'none';
                    var out = homoIcmsBatchApply(items, picks);
                    if (!out) return;
                    if (out.error) { showToast(out.error, 'error'); return; }
                    window._homoLastImport = '✅ ICMS: ' + out.aplicados + ' vehículo(s) actualizado(s)' +
                        (out.saltados.length ? ', ' + out.saltados.length + ' sin aplicar (cambiaron mientras revisabas)' : '') +
                        ' · catálogo: ' + out.catalogo.nuevas + ' nuevas, ' + out.catalogo.actualizadas + ' actualizadas';
                    if (typeof pnRender === 'function') pnRender();
                } }
            ]
        });
    });
}

/**
 * Escribe el lote. Capa de datos: vuelve a armar el plan contra el `db` de ESTE
 * instante (el sync pudo cambiar un vehículo mientras se revisaba) y solo aplica lo
 * que sigue teniendo la misma acción. picks = [{i, action}] (índice de `items` y la
 * acción que se mostró) o índices sueltos.
 */
function homoIcmsBatchApply(items, picks) {
    if (typeof authRequire === 'function' && !authRequire('homolog.manage', 'cargar el ICMS a los vehículos')) return null;
    homoInit();
    var who = (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '';
    var now = new Date().toISOString();
    var plan = homoIcmsBatchPlan(items, (typeof db !== 'undefined' && db.vehicles) || []);
    var aplicados = 0, saltados = [], undo = [];
    (picks || []).forEach(function(pk) {
        var i = typeof pk === 'number' ? pk : pk.i;
        var e = plan[i];
        if (!e || !HOMO_BATCH_ACTIONS[e.action] || !HOMO_BATCH_ACTIONS[e.action].pick) { saltados.push(i); return; }
        // Se aplica lo que la persona VIO: si el vehículo cambió mientras revisaba
        // (p. ej. llegó una ficha por sync y "llenar" pasó a "valores distintos"), se salta.
        if (typeof pk === 'object' && pk.action && pk.action !== e.action) { saltados.push(i); return; }
        var v = db.vehicles.filter(function(x) { return x.id === e.vehicleId; })[0];
        if (!v) { saltados.push(i); return; }
        var ficha = homoFichaFromIcms(e.row, { fileName: e.fileName, by: who, at: now });
        var before = v.homolog ? JSON.parse(JSON.stringify(v.homolog)) : null;
        var next = Object.assign({}, v.homolog || {});
        var keys = e.action === 'completar' ? e.blanks
                 : HOMO_FICHA_FIELDS.map(function(f) { return f[0]; });
        var changes = [];
        keys.forEach(function(k) {
            var val = ficha[k];
            if (val == null || val === '') return;
            var prev = next[k];
            var isNum = HOMO_FICHA_FIELDS.some(function(f) { return f[0] === k && f[2]; });
            if (prev != null && prev !== '' &&
                (isNum ? _homoNum(prev) === _homoNum(val) : _homoNorm(prev) === _homoNorm(val))) return;
            changes.push({ campo: _homoFieldLabel(k), key: k, antes: prev == null ? '' : prev, despues: val,
                           razon: 'Archivo del ICMS «' + e.fileName + '»' });
            next[k] = val;
        });
        ['ocn', 'wvta', 'variant', 'version'].forEach(function(k) { if (!next[k] && ficha[k]) next[k] = ficha[k]; });
        next.source = 'icms'; next.icmsFile = e.fileName; next.by = who; next.at = now;
        undo.push({ v: v, homolog: v.homolog, timelineLen: (v.timeline || []).length });
        v.homolog = next;
        v.timeline = v.timeline || [];
        v.timeline.push({
            timestamp: now, user: who,
            action: (e.action === 'corregir' ? 'Ficha de homologación corregida' : 'Ficha de homologación cargada') +
                    ' desde el ICMS (WO ' + (e.row.workOrder || '—') + ')',
            data: { modified: changes, source: 'icms', icmsFile: e.fileName }
        });
        aplicados++;
        if (typeof auditLog === 'function') {
            var small = function(h) {
                var o = {}; if (!h) return null;
                HOMO_FICHA_FIELDS.forEach(function(f) { if (h[f[0]] != null && h[f[0]] !== '') o[f[0]] = h[f[0]]; });
                return o;
            };
            auditLog('homolog', 'homologacion_icms', { type: 'vehicle', id: v.id, label: v.vin },
                e.action + ' desde «' + e.fileName + '»: ' + changes.map(function(c) { return c.campo + ' ' + c.antes + '→' + c.despues; }).join(', '),
                { before: small(before), after: small(next) });
        }
    });
    if (aplicados) {
        var okSave = (typeof saveDB === 'function') ? saveDB() : true;
        if (okSave === false) {
            undo.forEach(function(u) { u.v.homolog = u.homolog; u.v.timeline.length = u.timelineLen; });
            return { error: 'No se pudo guardar (almacenamiento lleno). No se cambió ningún vehículo.' };
        }
    }
    var cat = _homoCatalogUpsert(items.map(function(it) { return it.row; }), who, now);
    homoSave();
    if (typeof copInvalidateCache === 'function') copInvalidateCache();
    return { aplicados: aplicados, saltados: saltados, catalogo: cat };
}

function homoExportCSV() {
    homoInit();
    var head = ['MC code', 'Work Order', 'OCN', 'WVTA', 'Variant', 'Version', 'f0', 'f1', 'f2', 'TM', 'CO2 combinado', 'Consumo combinado'];
    var csv = head.join(',') + '\n';
    homoState.catalog.forEach(function(r) {
        csv += [r.mcCode, r.workOrder, r.ocn, r.wvta, r.variant, r.version,
                r.f0, r.f1, r.f2, r.tm, r.co2Combined, r.fcCombined]
            .map(function(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(',') + '\n';
    });
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'homologacion_europa_' + (typeof localToday === 'function' ? localToday() : '') + '.csv';
    a.click();
}

// ─── AYUDA (v16.0) ────────────────────────────────────────────────────────────

if (typeof HELP_TABS !== 'undefined') Object.assign(HELP_TABS, {
    'pn-homolog': { title: 'Homologación Europa', text: 'El catálogo con los coeficientes de dinamómetro (f0/f1/f2/TM) y el CO₂ declarado de cada vehículo europeo, importado del ICMS.', tips: [
        'En el Alta, "📥 Cargar el ICMS de esta unidad" lee el Excel de la Work Order y llena f0, f1, f2, TM, MR y CO₂ sin teclear.',
        'Aquí puedes cargar de un jalón los ICMS de unidades ya registradas: cada archivo se liga a su vehículo por el VIN del nombre (VIN_…xlsx).',
        'El catálogo se identifica por Work Order: varias WO comparten MC code con valores distintos.',
        'Reimportar el mismo archivo actualiza las filas, no las duplica.',
        'El veredicto de CO₂ (FCF, Evolution Factor) se ajusta en CoP → Validador, dentro de la mesa de trabajo de cada familia.'
    ]}
});

if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    homo_mr: { title: 'MR (masa rotativa)', text: 'Masa rotativa equivalente, tal como viene en el ICMS. La inercia (ETW) que va al dinamómetro es TM + MR, y la app la calcula sola en Operación.' },
    'pn-homolog-help': { title: 'Catálogo del ICMS', text: 'Cada fila es una Work Order del ICMS (varias WO comparten MC code con coeficientes y CO₂ distintos). De ahí salen los coeficientes con los que se carga el dinamómetro y el CO₂ declarado contra el que se compara lo medido.' },
    'homo_mc': { title: 'Work Order / MC code', text: 'Lo más seguro es "📥 Cargar el ICMS de esta unidad". Si no tienes el archivo, escribe la Work Order y elige de la lista. Los valores cambian de una WO a otra, así que no reuses los de otra unidad aunque sea la misma configuración.' },
    'homo-icms-help': { title: 'Cargar el ICMS de esta unidad', text: 'Elige el Excel que bajas del ICMS con la Work Order de la unidad (VIN_…xlsx). La app lee los valores WLTP (nunca los NEDC del mismo archivo), te los muestra y comprueba que el VIN del nombre del archivo coincida con el que capturaste. Con "Usar estos valores" se llenan los campos; puedes corregirlos y queda anotado.' },
    'homo-icms-batch-help': { title: 'ICMS de unidades ya registradas', text: 'Selecciona uno o varios archivos del ICMS. Cada uno se liga a su vehículo por el VIN del nombre del archivo (la Work Order no basta: varias unidades comparten WO). Antes de aplicar ves qué se llena; una prueba ya enviada a aprobación o liberada no se reescribe con valores distintos.' },
    'homo_f0': { title: 'f0 (N)', text: 'Coeficiente constante de la resistencia al avance, del apartado WLTP Driving energy del ICMS. Es uno de los tres valores con los que se carga el dinamómetro.' },
    'homo_f1': { title: 'f1 (N/(km/h))', text: 'Coeficiente lineal de la resistencia al avance, del ICMS.' },
    'homo_f2': { title: 'f2 (N/(km/h)²)', text: 'Coeficiente cuadrático de la resistencia al avance, del ICMS.' },
    'homo_tm': { title: 'TM — masa de ensayo (kg)', text: 'Test Mass del ICMS: la masa con la que se configura la inercia del dinamómetro.' },
    'homo_co2': { title: 'CO₂ declarado combinado (g/km)', text: 'El valor Combined de CO₂ del ICMS. Es el target contra el que el CoP compara el CO₂ medido de este vehículo.' }
});

// ═══════════════════════════════════════════════════════════════════════════════
// [v19.1] FAMILIAS DE INTERPOLACIÓN (IP) — del WVTA
//
// La familia de interpolación es la agrupación OFICIAL del CoP para Europa: es lo
// que el certificado de homologación (Whole Vehicle Type Approval, Reg. UE
// 2018/858) declara en su punto 0.2.3.1, y se identifica por variante + versión.
//
// ─── DE DÓNDE SALE CADA DATO (regla que NO se debe romper) ────────────────────
// Del WVTA:  la IDENTIDAD de la familia (código IP), qué variantes/versiones la
//            componen, sus masas de ensayo TML/TMH y el rango de CO₂ declarado
//            entre el vehículo bajo (VL) y el alto (VH).
// Del ICMS:  los coeficientes f0/f1/f2 y el CO₂ declarado DE CADA VEHÍCULO.
//
// El WVTA sí trae f0/f1/f2, pero SOLO los de los vehículos extremos VL y VH que
// acotan la familia — no los del vehículo que se va a ensayar, que se obtienen
// interpolando entre ambos. Esa interpolación es justamente lo que el ICMS
// entrega ya resuelto por MC code. Copiar los coeficientes del WVTA a un vehículo
// concreto sería usar los del extremo de la familia en vez de los suyos.
// NO agregar campos f0/f1/f2 a homoState.ipFamilies.
// ═══════════════════════════════════════════════════════════════════════════════

function _homoNum(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(String(v).replace(/[^\d.,\-]/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
}

/** Índice variante|versión → familia IP. Se reconstruye al guardar/sincronizar. */
var _homoIpIndex = null;
function _homoIpBuildIndex() {
    _homoIpIndex = {};
    (homoState.ipFamilies || []).forEach(function(f) {
        (f.members || []).forEach(function(m) {
            var k = _homoNorm(m.variant) + '|' + _homoNorm(m.version);
            if (k !== '|') _homoIpIndex[k] = f;
        });
        // También por variante sola, SOLO si esa variante no está repartida entre
        // familias distintas (en el WVTA real B5P22 aparece en dos familias con
        // versiones distintas, así que ahí la variante sola no alcanza).
        (f.members || []).forEach(function(m) {
            var vk = 'V:' + _homoNorm(m.variant);
            if (!vk || vk === 'V:') return;
            if (_homoIpIndex[vk] === undefined) _homoIpIndex[vk] = f;
            else if (_homoIpIndex[vk] !== f) _homoIpIndex[vk] = null; // ambigua
        });
    });
    return _homoIpIndex;
}
function _homoIpIdx() { return _homoIpIndex || _homoIpBuildIndex(); }

function homoIpFamilyByCode(code) {
    homoInit();
    var c = _homoNorm(code);
    if (!c) return null;
    return (homoState.ipFamilies || []).find(function(f) { return _homoNorm(f.code) === c; }) || null;
}

/**
 * LA definición de "a qué familia de interpolación pertenece este vehículo".
 * Orden: sello explícito → variante+versión de su ficha → variante+versión del
 * catálogo ICMS por MC code → variante sola (si no es ambigua) → null.
 * Devuelve {family, via} o null.
 */
function homoIpFamilyForVehicle(vehicle) {
    homoInit();
    if (!vehicle) return null;
    if (!homoIsEurope(homoRegionOf(vehicle.config))) return null;

    var h = homoVehicleData(vehicle) || {};
    if (h.ipFamilyId) {
        var byId = (homoState.ipFamilies || []).find(function(f) { return f.id === h.ipFamilyId; });
        if (byId) return { family: byId, via: 'sellada en el vehículo' };
    }
    var idx = _homoIpIdx();
    var variant = h.variant, version = h.version;

    // Completar desde el catálogo del ICMS si la ficha no los trae.
    if ((!variant || !version) && h.mcCode) {
        var row = homoFindByKey(h.mcCode);
        if (row) { variant = variant || row.variant; version = version || row.version; }
    }
    if (variant && version) {
        var f = idx[_homoNorm(variant) + '|' + _homoNorm(version)];
        if (f) return { family: f, via: 'variante + versión' };
    }
    if (variant) {
        var fv = idx['V:' + _homoNorm(variant)];
        if (fv) return { family: fv, via: 'variante' };
        if (fv === null) return null; // variante repartida entre familias: no adivinar
    }
    return null;
}

/**
 * ¿La masa de ensayo del vehículo (la del ICMS) cae dentro de [TML, TMH] de su
 * familia IP? Es un chequeo barato que ejercita exactamente el reparto de fuentes:
 * el rango viene del WVTA, el valor del ICMS.
 */
function homoIpMassCheck(family, tm) {
    var m = _homoNum(tm);
    if (!family || m === null) return { ok: true, unknown: true };
    var lo = _homoNum(family.tml), hi = _homoNum(family.tmh);
    if (lo === null || hi === null) return { ok: true, unknown: true };
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    return { ok: m >= lo && m <= hi, unknown: false, tm: m, tml: lo, tmh: hi };
}

/** Lo mismo para el CO₂ declarado: debe caer entre el de VL y el de VH. */
function homoIpCo2Check(family, co2) {
    var c = _homoNum(co2);
    if (!family || c === null) return { ok: true, unknown: true };
    var lo = _homoNum(family.co2Low), hi = _homoNum(family.co2High);
    if (lo === null || hi === null) return { ok: true, unknown: true };
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    return { ok: c >= lo && c <= hi, unknown: false, co2: c, lo: lo, hi: hi };
}

/** Revisa todos los vehículos de una lista contra su familia IP. */
function homoIpScanOutliers(vehicles) {
    var out = [];
    (vehicles || []).forEach(function(v) {
        var res = homoIpFamilyForVehicle(v);
        if (!res) return;
        var h = homoVehicleData(v) || {};
        var mass = homoIpMassCheck(res.family, h.tm);
        var co2 = homoIpCo2Check(res.family, h.co2Target);
        if (!mass.unknown && !mass.ok) {
            out.push({ vin: v.vin, kind: 'masa', family: res.family,
                       text: 'TM ' + mass.tm + ' kg fuera del rango [' + mass.tml + ', ' + mass.tmh + '] de ' + res.family.code });
        }
        if (!co2.unknown && !co2.ok) {
            out.push({ vin: v.vin, kind: 'co2', family: res.family,
                       text: 'CO₂ declarado ' + co2.co2 + ' g/km fuera del rango [' + co2.lo + ', ' + co2.hi + '] de ' + res.family.code });
        }
    });
    return out;
}

// ─── IP: ALTA / EDICIÓN / BORRADO ─────────────────────────────────────────────

function homoIpSave(fam) {
    if (typeof authRequire === 'function' && !authRequire('homolog.manage', 'administrar familias de interpolación')) return false;
    homoInit();
    if (!fam || !fam.code) return false;
    if (!homoState.ipFamilies) homoState.ipFamilies = [];
    var i = homoState.ipFamilies.findIndex(function(f) {
        return f.id === fam.id || _homoNorm(f.code) === _homoNorm(fam.code);
    });
    fam.updatedAt = new Date().toISOString();
    fam.by = fam.by || ((typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '');
    if (i >= 0) {
        fam.id = homoState.ipFamilies[i].id;
        homoState.ipFamilies[i] = fam;
    } else {
        fam.id = fam.id || ('ipf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
        fam.at = new Date().toISOString();
        homoState.ipFamilies.push(fam);
    }
    _homoIpIndex = null;
    var ok = homoSave();
    if (ok && typeof auditLog === 'function') {
        auditLog('homolog', 'ip_family_saved', { type: 'homolog', label: fam.code },
                 (fam.members || []).length + ' variante(s)/versión(es) · TML ' + (fam.tml || '—') + ' / TMH ' + (fam.tmh || '—'));
    }
    if (typeof copInvalidateCache === 'function') copInvalidateCache();
    return ok;
}

function homoIpDelete(id) {
    if (typeof authRequire === 'function' && !authRequire('homolog.manage', 'administrar familias de interpolación')) return false;
    homoInit();
    var f = (homoState.ipFamilies || []).find(function(x) { return x.id === id; });
    homoState.ipFamilies = (homoState.ipFamilies || []).filter(function(x) { return x.id !== id; });
    _homoIpIndex = null;
    homoSave();
    if (f && typeof auditLog === 'function') auditLog('homolog', 'ip_family_deleted', { type: 'homolog', label: f.code }, '');
    if (typeof copInvalidateCache === 'function') copInvalidateCache();
}

// ─── IP: LECTOR DEL WVTA (pegar el texto del certificado) ────────────────────
//
// El WVTA es un PDF; pedirle a alguien que teclee 5 familias × 5 campos es la
// forma segura de que no se use. Se acepta PEGAR el texto de los dos bloques que
// importan y se arma todo solo:
//
//   0.2.3.1 Interpolation family's identifier   → código IP + variante/versión
//   3.1     Results of the CO2 emission tests   → TML/TMH y CO₂ de VL y VH
//
// El formato real (verificado contra un certificado e4*2018/858*00261*00) pone
// cada campo en una línea con sus valores separados por espacios, en el mismo
// orden que las columnas. No hay separador de columnas, así que se empatan por
// POSICIÓN — por eso se valida que los conteos coincidan antes de aceptar nada.

/** Números de una línea de la tabla del WVTA, en orden de columna. */
function _homoWvtaNums(line) {
    var m = String(line || '').match(/-?\d+(?:[.,]\d+)?/g) || [];
    return m.map(function(x) { return parseFloat(x.replace(',', '.')); });
}

/**
 * Interpreta el texto pegado de un WVTA. Devuelve
 * {families:[...], warnings:[...], meta:{wvta,type,commercialName,wvtaDate}}.
 * Es una función PURA (sin DOM): se puede probar en Node.
 */
/**
 * El PDF parte los códigos IP entre dos renglones cuando la columna es angosta:
 *   "Interpolation family IP-0401789- IP-0401788- IP-0401787-"
 *   "3KP 3KP 3KP"
 * Se vuelven a pegar antes de interpretar nada.
 */
function _homoWvtaJoinSplitCodes(lines) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
        var l = lines[i], next = lines[i + 1];
        var partes = l.match(/IP-[\w]*-(?=\s|$)/g);
        if (partes && next) {
            var sufijos = next.trim().split(/\s+/);
            if (sufijos.length === partes.length && sufijos.every(function(s) { return /^[\w]+$/.test(s); })) {
                var k = 0;
                out.push(l.replace(/IP-[\w]*-(?=\s|$)/g, function(m) { return m + sufijos[k++]; }));
                i++;                       // el renglón de sufijos ya se consumió
                continue;
            }
        }
        out.push(l);
    }
    return out;
}

function homoIpParseWVTA(text) {
    var lines = _homoWvtaJoinSplitCodes(
        String(text || '').split(/\r?\n/).map(function(l) { return l.trim(); })
    );
    var warnings = [], meta = {};

    lines.forEach(function(l) {
        var m;
        if (!meta.wvta && (m = l.match(/Type-?approval\s*No\.?\s*:?\s*(\S.*)$/i))) meta.wvta = m[1].trim();
        if (!meta.type && (m = l.match(/^Type\s*:?\s*([A-Za-z0-9_\-]+)\s*$/i))) meta.type = m[1].trim();
        if (!meta.commercialName && (m = l.match(/Commercial name.*?:\s*(\S.*)$/i))) meta.commercialName = m[1].trim();
        if (!meta.wvtaDate && (m = l.match(/^Date\s*:?\s*(\d{1,2}\s+\w+\s+\d{4})\s*$/i))) meta.wvtaDate = m[1].trim();
        if (!meta.regulationCited && (m = l.match(/(Regulation\s*\(EC\)\s*No\s*715\/2007[^\n]*)/i))) meta.regulationCited = m[1].trim();
    });

    // ── Bloque 0.2.3.1: variante(s) / versión(es) / IP Family, en tríos ────────
    var byCode = {};   // código IP → {code, members:[]}
    var pend = null;
    lines.forEach(function(l) {
        var mv = l.match(/^Variant\(s\)\s+(.+)$/i);
        var mV = l.match(/^Version\(s\)\s+(.+)$/i);
        var mi = l.match(/^IP\s*Family\s+(.+)$/i);
        if (mv) { pend = { variants: mv[1].trim().split(/\s+/) }; return; }
        if (mV && pend) { pend.versions = mV[1].trim().split(/\s+/); return; }
        if (mi && pend && pend.versions) {
            var codes = mi[1].trim().split(/\s+/);
            var n = pend.variants.length;
            // El WVTA repite el mismo código IP para columnas contiguas cuando
            // comparten familia; si vienen menos códigos que columnas, se avisa en
            // vez de inventar el reparto.
            if (codes.length !== n) {
                warnings.push('El bloque de "' + pend.variants.join(' ') + '" trae ' + n +
                    ' variante(s) pero ' + codes.length + ' código(s) IP. Revisa el reparto a mano.');
            }
            for (var i = 0; i < n; i++) {
                var code = codes[i] || codes[codes.length - 1];
                if (!code || !/^IP-/i.test(code)) continue;
                if (!byCode[code]) byCode[code] = { code: code, members: [] };
                byCode[code].members.push({
                    variant: pend.variants[i] || '',
                    version: (pend.versions && pend.versions[i]) || ''
                });
            }
            pend = null;
        }
    });

    // ── Bloque 3.1: TML/TMH y CO₂ combinado por familia (columnas VH, VL) ──────
    // Cada familia ocupa DOS columnas (VH y VL). El encabezado de columnas NO
    // siempre se llama igual: en un mismo certificado aparece como "Interpolation
    // family …" en una página y como "Version(s) IP-…" en la siguiente (el PDF
    // desplaza las etiquetas). Por eso se toma como encabezado CUALQUIER renglón
    // con códigos IP que no sea el "IP Family" del bloque 0.2.3.1, y las líneas
    // Combined / Test mass se asignan al último encabezado visto.
    var pendientes = 0;
    lines.forEach(function(l) {
        if (/^IP\s*Family\b/i.test(l)) return;            // ese bloque ya se consumió
        var codes = l.match(/IP-[\w]+-[\w]+/gi);
        if (codes && codes.length) {
            var order = codes.map(function(c) { return c.trim(); });
            lines._curOrder = order;
            return;
        }
        var order2 = lines._curOrder;
        if (!order2 || !order2.length) return;
        var esCombined = /^Combined\b/i.test(l);
        var esMasa = /^Test\s*mass/i.test(l);
        if (!esCombined && !esMasa) return;

        var nums = _homoWvtaNums(l);
        // Test mass puede traer basura del encabezado ("(kg)"); se toman los
        // últimos 2·N números, que son los de las columnas.
        var need = order2.length * 2;
        if (nums.length < need) {
            pendientes++;
            return;
        }
        var vals = nums.slice(nums.length - need);
        order2.forEach(function(code, i) {
            var f = byCode[code] || (byCode[code] = { code: code, members: [] });
            var a = vals[i * 2], b = vals[i * 2 + 1];
            if (a == null || b == null) return;
            if (esMasa)     { f.tmh = Math.max(a, b);     f.tml = Math.min(a, b); }
            if (esCombined && f.co2High === undefined) { f.co2High = Math.max(a, b); f.co2Low = Math.min(a, b); }
        });
    });
    if (pendientes) {
        warnings.push('Se encontró el bloque de resultados pero alguna fila traía menos valores que columnas; revisa TML/TMH y CO₂ de las familias afectadas.');
    }

    var families = Object.keys(byCode).map(function(k) {
        var f = byCode[k];
        return {
            code: f.code, members: f.members || [],
            tml: f.tml != null ? f.tml : '', tmh: f.tmh != null ? f.tmh : '',
            co2Low: f.co2Low != null ? f.co2Low : '', co2High: f.co2High != null ? f.co2High : '',
            wvta: meta.wvta || '', wvtaDate: meta.wvtaDate || '', type: meta.type || '',
            commercialName: meta.commercialName || '', regulationCited: meta.regulationCited || ''
        };
    });
    if (!families.length) {
        warnings.push('No se encontró ningún código IP-… en el texto. Copia el punto 0.2.3.1 del certificado (y, si lo tienes, el bloque 3.1 de resultados de CO₂).');
    }
    return { families: families, warnings: warnings, meta: meta };
}

// ─── IP: UI dentro de la pestaña de Homologación ─────────────────────────────

function _homoIpCardHTML() {
    homoInit();
    var fams = homoState.ipFamilies || [];
    var html = '<div class="tp-card">';
    html += '<div class="tp-card-title" data-help="pn-homolog-ip-help"><span>🧬 Familias de interpolación (WVTA)</span>' +
        (fams.length ? '<button class="tp-btn tp-btn-ghost" onclick="homoIpExportCSV()" style="font-size: var(--fs-sm);">📤 Exportar CSV</button>' : '') +
        '</div>';
    html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom: var(--space-md);line-height:1.5;">' +
        'La familia de interpolación es la agrupación <b>oficial</b> del CoP en Europa: la declara el certificado ' +
        'de homologación (WVTA) en su punto <b>0.2.3.1</b>, por variante y versión. ' +
        '<b>Los coeficientes f0/f1/f2 NO se capturan aquí</b> — el WVTA solo trae los de los vehículos extremos ' +
        'VL y VH que acotan la familia, no los del vehículo que vas a ensayar. Esos siguen viniendo del catálogo ' +
        'del ICMS. De aquí salen la identidad de la familia, sus miembros, las masas TML/TMH y el rango de CO₂ declarado.</div>';

    html += '<div class="form-group"><label for="homo-ip-paste">Pega el texto del WVTA (punto 0.2.3.1 y, si lo tienes, el bloque 3.1 de resultados de CO₂)</label>' +
        '<textarea id="homo-ip-paste" class="form-control" rows="4" placeholder="Copia del PDF del certificado las tablas de Variant(s) / Version(s) / IP Family, y las de Combined y Test mass."></textarea>' +
        '<div style="display:flex;gap: var(--space-sm);flex-wrap:wrap;margin-top: var(--space-sm);">' +
        '<button class="tp-btn tp-btn-primary" onclick="homoIpImportPaste()">Leer el certificado</button>' +
        '<button class="tp-btn tp-btn-ghost" onclick="homoIpEditModal()">➕ Capturar a mano</button>' +
        '</div></div>';
    html += '<div id="homo-ip-status" style="font-size: var(--fs-sm);margin:8px 0;"></div>';

    if (!fams.length) {
        html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);">Aún no hay familias IP. Mientras no las haya, el CoP sigue agrupando por la familia derivada del plan (modelo · motor · transmisión · año · norma).</div>';
        return html + '</div>';
    }

    html += '<div style="overflow-x:auto;"><table class="cop-table"><thead><tr>' +
        '<th class="cop-l">Familia IP</th><th class="cop-l">Variantes / versiones</th>' +
        '<th>TML (kg)</th><th>TMH (kg)</th><th>CO₂ VL–VH</th><th class="cop-l">WVTA</th><th></th>' +
        '</tr></thead><tbody>';
    fams.slice().sort(function(a, b) { return String(a.code).localeCompare(String(b.code)); }).forEach(function(f) {
        html += '<tr>';
        html += '<td class="cop-l"><b>' + _homoEsc(f.code) + '</b>' +
                (f.commercialName ? '<br><span style="color:var(--tp-dim);font-size:var(--fs-xs);">' + _homoEsc(f.commercialName) + (f.type ? ' · ' + _homoEsc(f.type) : '') + '</span>' : '') + '</td>';
        html += '<td class="cop-l" style="font-family:monospace;font-size:var(--fs-xs);">' +
                (f.members || []).map(function(m) { return _homoEsc(m.variant) + ' / ' + _homoEsc(m.version); }).join('<br>') + '</td>';
        html += '<td class="cop-num">' + (f.tml === '' || f.tml == null ? '—' : f.tml) + '</td>';
        html += '<td class="cop-num">' + (f.tmh === '' || f.tmh == null ? '—' : f.tmh) + '</td>';
        html += '<td class="cop-num">' + ((f.co2Low === '' || f.co2Low == null) ? '—' : f.co2Low + ' – ' + f.co2High) + '</td>';
        html += '<td class="cop-l" style="font-size:var(--fs-xs);color:var(--tp-dim);">' + _homoEsc(f.wvta || '—') +
                (f.wvtaDate ? '<br>' + _homoEsc(f.wvtaDate) : '') + '</td>';
        html += '<td style="white-space:nowrap;">' +
                '<button class="tp-btn tp-btn-ghost" style="font-size:var(--fs-sm);" onclick="homoIpEditModal(\'' + f.id + '\')">Editar</button>' +
                '<button class="tp-btn tp-btn-ghost" style="font-size:var(--fs-sm);" onclick="homoIpConfirmDelete(\'' + f.id + '\')" title="Borrar">✕</button></td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html + '</div>';
}

function _homoEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Lee lo pegado, muestra lo que entendió y pide confirmar antes de escribir. */
function homoIpImportPaste() {
    var ta = document.getElementById('homo-ip-paste');
    var st = document.getElementById('homo-ip-status');
    var txt = ta ? ta.value : '';
    if (!txt.trim()) { if (st) st.innerHTML = '<span style="color:var(--warn-text);">Pega primero el texto del certificado.</span>'; return; }

    var res = homoIpParseWVTA(txt);
    window._homoIpPending = res.families;

    var h = '';
    if (res.warnings.length) {
        h += '<div class="cop-note cop-note--warn"><div class="cop-note-title">Revisar</div>' +
             res.warnings.map(_homoEsc).join('<br>') + '</div>';
    }
    if (!res.families.length) { if (st) st.innerHTML = h; return; }

    h += '<div class="cop-note"><div class="cop-note-title">Se entendieron ' + res.families.length + ' familia(s)</div>';
    if (res.meta.wvta) h += 'Certificado <b>' + _homoEsc(res.meta.wvta) + '</b>' + (res.meta.wvtaDate ? ' · ' + _homoEsc(res.meta.wvtaDate) : '') + '<br>';
    h += '<table class="cop-table" style="margin-top: var(--space-sm);"><thead><tr><th class="cop-l">Familia IP</th>' +
         '<th class="cop-l">Variantes / versiones</th><th>TML</th><th>TMH</th><th>CO₂ VL–VH</th></tr></thead><tbody>';
    res.families.forEach(function(f) {
        var falta = (f.tml === '' || f.tmh === '');
        h += '<tr><td class="cop-l"><b>' + _homoEsc(f.code) + '</b></td>' +
             '<td class="cop-l" style="font-family:monospace;font-size:var(--fs-xs);">' +
             (f.members || []).map(function(m) { return _homoEsc(m.variant) + '/' + _homoEsc(m.version); }).join('<br>') + '</td>' +
             '<td class="cop-num">' + (f.tml === '' ? '<span style="color:var(--warn-text);">falta</span>' : f.tml) + '</td>' +
             '<td class="cop-num">' + (f.tmh === '' ? '<span style="color:var(--warn-text);">falta</span>' : f.tmh) + '</td>' +
             '<td class="cop-num">' + (f.co2Low === '' ? '—' : f.co2Low + ' – ' + f.co2High) + '</td></tr>';
        if (falta) { /* se avisa arriba en la celda */ }
    });
    h += '</tbody></table>';
    h += '<div style="margin-top: var(--space-md);display:flex;gap: var(--space-sm);flex-wrap:wrap;">' +
         '<button class="tp-btn tp-btn-primary" onclick="homoIpApplyPending()">Guardar estas familias</button>' +
         '<button class="tp-btn tp-btn-ghost" onclick="homoIpCancelPending()">Cancelar</button></div>';
    h += '<div style="margin-top: var(--space-sm);font-size:var(--fs-xs);color:var(--tp-dim);">Reimportar el mismo certificado actualiza, no duplica: se empata por código IP.</div>';
    h += '</div>';
    if (st) st.innerHTML = h;
}

/**
 * Repinta la pestaña de Homologación. Hace falta `tabCacheInvalidate` porque las
 * pestañas del Panel están cacheadas y moverse DENTRO de la misma pestaña no
 * dispara un cambio real: sin esto la tarjeta seguía diciendo "aún no hay
 * familias IP" con las familias ya guardadas. Mismo patrón que _pnProjNav (v16.8).
 */
function _homoIpRepaint() {
    if (typeof tabCacheInvalidate === 'function') tabCacheInvalidate('pn', 'pn-homolog');
    if (typeof pnRender === 'function') pnRender();
}

function homoIpApplyPending() {
    if (typeof authRequire === 'function' && !authRequire('homolog.manage', 'importar familias de interpolación')) return;
    var pend = window._homoIpPending || [];
    if (!pend.length) return;
    var n = 0;
    pend.forEach(function(f) { if (homoIpSave(f)) n++; });
    window._homoIpPending = null;
    if (typeof showToast === 'function') showToast(n + ' familia(s) IP guardada(s)', 'success');
    _homoIpRepaint();
}
function homoIpCancelPending() {
    window._homoIpPending = null;
    var st = document.getElementById('homo-ip-status');
    if (st) st.innerHTML = '';
}

function homoIpConfirmDelete(id) {
    var f = (homoState.ipFamilies || []).find(function(x) { return x.id === id; });
    if (!f) return;
    var go = function() {
        var antes = JSON.parse(JSON.stringify(homoState.ipFamilies || []));
        homoIpDelete(id); _homoIpRepaint();
        toastUndo('Familia ' + f.code + ' eliminada', function() { homoState.ipFamilies = antes; homoSave(); _homoIpRepaint(); });
    };
    showConfirm('Los vehículos ligados a ella quedan sin familia de interpolación. Podrás deshacerlo unos segundos.', go,
        { type: 'danger', title: '¿Borrar la familia ' + _homoEsc(f.code) + '?', confirmText: 'Borrar' });
}

/** Alta/edición a mano (para un certificado que no se pueda copiar como texto). */
function homoIpEditModal(id) {
    homoInit();
    var f = id ? (homoState.ipFamilies || []).find(function(x) { return x.id === id; }) : null;
    var v = function(x) { return _homoEsc(f ? (f[x] == null ? '' : f[x]) : ''); };
    var miembros = f ? (f.members || []).map(function(m) { return m.variant + '/' + m.version; }).join('\n') : '';

    var body =
        '<div class="form-group"><label for="ipf-code">Código de familia IP *</label>' +
        '<input id="ipf-code" class="form-control" placeholder="IP-0401789-3KP" value="' + v('code') + '"></div>' +
        '<div class="form-group"><label for="ipf-members">Variantes / versiones (una por renglón, separadas con /)</label>' +
        '<textarea id="ipf-members" class="form-control" rows="4" placeholder="B5P12/M61A11">' + _homoEsc(miembros) + '</textarea></div>' +
        '<div class="inv-row-list-2col">' +
        '<div class="form-group"><label for="ipf-tml">TML — masa de ensayo del VL (kg)</label>' +
        '<input id="ipf-tml" type="number" step="0.1" class="form-control" value="' + v('tml') + '"></div>' +
        '<div class="form-group"><label for="ipf-tmh">TMH — masa de ensayo del VH (kg)</label>' +
        '<input id="ipf-tmh" type="number" step="0.1" class="form-control" value="' + v('tmh') + '"></div>' +
        '</div>' +
        '<details><summary style="cursor:pointer;font-size:var(--fs-sm);">Más detalles</summary>' +
        '<div class="inv-row-list-2col" style="margin-top: var(--space-sm);">' +
        '<div class="form-group"><label for="ipf-co2l">CO₂ combinado del VL (g/km)</label>' +
        '<input id="ipf-co2l" type="number" step="0.1" class="form-control" value="' + v('co2Low') + '"></div>' +
        '<div class="form-group"><label for="ipf-co2h">CO₂ combinado del VH (g/km)</label>' +
        '<input id="ipf-co2h" type="number" step="0.1" class="form-control" value="' + v('co2High') + '"></div>' +
        '<div class="form-group"><label for="ipf-wvta">No. de homologación (WVTA)</label>' +
        '<input id="ipf-wvta" class="form-control" placeholder="e4*2018/858*00261*00" value="' + v('wvta') + '"></div>' +
        '<div class="form-group"><label for="ipf-date">Fecha del certificado</label>' +
        '<input id="ipf-date" class="form-control" value="' + v('wvtaDate') + '"></div>' +
        '<div class="form-group"><label for="ipf-type">Tipo</label>' +
        '<input id="ipf-type" class="form-control" placeholder="CL4m" value="' + v('type') + '"></div>' +
        '<div class="form-group"><label for="ipf-name">Nombre comercial</label>' +
        '<input id="ipf-name" class="form-control" placeholder="K4" value="' + v('commercialName') + '"></div>' +
        '</div></details>' +
        '<p style="font-size:var(--fs-xs);color:var(--tp-dim);margin-top: var(--space-sm);">' +
        'Los coeficientes f0/f1/f2 no van aquí: son de cada vehículo y vienen del catálogo del ICMS.</p>';

    if (typeof showModal !== 'function') return;
    // showModal (v18.2) espera `onclick` como FUNCIÓN y marca el primario con
    // cls:'btn-primary'; el cierre lo dispara el llamador poniendo display:none.
    var cerrar = function() {
        var ov = document.getElementById('globalModal');
        if (ov) ov.style.display = 'none';
    };
    showModal({
        title: f ? 'Editar familia IP' : 'Nueva familia IP',
        body: body,
        buttons: [
            { label: 'Cancelar', onclick: cerrar },
            { label: 'Guardar', cls: 'btn-primary', onclick: function() { homoIpSaveFromModal(f ? f.id : null); } }
        ]
    });
}

function homoIpSaveFromModal(id) {
    if (typeof authRequire === 'function' && !authRequire('homolog.manage', 'administrar familias de interpolación')) return;
    var g = function(x) { var e = document.getElementById(x); return e ? e.value.trim() : ''; };
    var code = g('ipf-code');
    if (!code) { if (typeof showToast === 'function') showToast('El código de familia IP es obligatorio', 'error'); return; }
    var members = g('ipf-members').split(/\r?\n/).map(function(l) {
        var p = l.split('/');
        return { variant: (p[0] || '').trim(), version: (p[1] || '').trim() };
    }).filter(function(m) { return m.variant || m.version; });

    var num = function(x) { var s = g(x); return s === '' ? '' : parseFloat(s); };
    var fam = {
        id: id || undefined, code: code, members: members,
        tml: num('ipf-tml'), tmh: num('ipf-tmh'),
        co2Low: num('ipf-co2l'), co2High: num('ipf-co2h'),
        wvta: g('ipf-wvta'), wvtaDate: g('ipf-date'),
        type: g('ipf-type'), commercialName: g('ipf-name')
    };
    if (homoIpSave(fam)) {
        var ov = document.getElementById('globalModal');
        if (ov) ov.style.display = 'none';
        if (typeof showToast === 'function') showToast('Familia ' + code + ' guardada', 'success');
        _homoIpRepaint();
    }
}

function homoIpExportCSV() {
    homoInit();
    var fams = homoState.ipFamilies || [];
    if (!fams.length) return;
    var cell = function(x) {
        var s = (x === null || x === undefined) ? '' : String(x);
        return (s.indexOf(',') >= 0 || s.indexOf('"') >= 0) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var csv = 'Familia IP,Variante,Version,TML (kg),TMH (kg),CO2 VL (g/km),CO2 VH (g/km),WVTA,Fecha,Tipo,Nombre comercial\n';
    fams.forEach(function(f) {
        var ms = (f.members || []).length ? f.members : [{ variant: '', version: '' }];
        ms.forEach(function(m) {
            csv += [f.code, m.variant, m.version, f.tml, f.tmh, f.co2Low, f.co2High,
                    f.wvta, f.wvtaDate, f.type, f.commercialName].map(cell).join(',') + '\n';
        });
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'Familias_IP_WVTA_' + (typeof localToday === 'function' ? localToday() : '') + '.csv';
    a.click();
    if (typeof showToast === 'function') showToast('Exportado', 'success');
}

if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'pn-homolog-ip-help': { title: 'Familias de interpolación (WVTA)', text: 'Es la agrupación oficial del CoP en Europa: el certificado de homologación declara, por variante y versión, a qué familia de interpolación pertenece cada vehículo. Sirve para que el CoP agrupe como lo hace la autoridad, y para detectar un vehículo cuya masa de ensayo o CO₂ declarado caen fuera del rango de su propia familia. Los coeficientes f0/f1/f2 NO salen de aquí: el certificado solo trae los de los vehículos extremos VL y VH, y los de cada vehículo concreto vienen del ICMS.' }
});
