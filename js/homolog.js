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

/** Clave de una fila del catálogo: MC code si existe, si no la Work Order. */
function homoRowKey(row) {
    return _homoNorm(row && (row.mcCode || row.workOrder)) || '';
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

/** Fila exacta por MC code / Work Order, o null. */
function homoFindByKey(key) {
    homoInit();
    var k = _homoNorm(key);
    if (!k) return null;
    for (var i = 0; i < homoState.catalog.length; i++) {
        var r = homoState.catalog[i];
        if (_homoNorm(r.mcCode) === k || _homoNorm(r.workOrder) === k) return r;
    }
    return null;
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

/** ¿Le falta la ficha a este vehículo? (solo aplica a Europa) */
function homoVehicleMissing(vehicle) {
    if (!vehicle) return false;
    if (!homoIsEurope(homoRegionOf(vehicle.config))) return false;
    var h = homoVehicleData(vehicle);
    return !h || h.f0 == null || h.f1 == null || h.f2 == null || h.tm == null;
}

/** Convierte una fila del catálogo en la ficha que se guarda en el vehículo. */
function homoRowToVehicleData(row, source) {
    return {
        mcCode: row.mcCode || '', workOrder: row.workOrder || '', ocn: row.ocn || '',
        wvta: row.wvta || '', variant: row.variant || '', version: row.version || '',
        f0: row.f0, f1: row.f1, f2: row.f2, tm: row.tm,
        co2Target: row.co2Combined, fcTarget: row.fcCombined,
        source: source || 'catalogo',
        by: (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '',
        at: new Date().toISOString()
    };
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
    f0:          { label: 'f0',           syn: ['f0', 'f0n', 'coefff0'] },
    f1:          { label: 'f1',           syn: ['f1', 'f1nkmh', 'coefff1'] },
    f2:          { label: 'f2',           syn: ['f2', 'f2nkmh2', 'coefff2'] },
    tm:          { label: 'TM (masa)',    syn: ['tm', 'testmass', 'masadeensayo', 'masa'] },
    co2Combined: { label: 'CO₂ combinado', syn: ['combined', 'co2combined', 'co2combinado', 'combinado', 'co2'] },
    fcCombined:  { label: 'Consumo comb.', syn: ['fuelconsumptioncombined', 'consumocombinado', 'fccombined'] }
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

/**
 * Aplica una retícula importada al catálogo. Fusiona por MC code / Work Order:
 * reimportar actualiza en vez de duplicar, y una segunda descarga (la de CO₂)
 * completa las filas que ya trajo la primera (la de coeficientes).
 * Devuelve {nuevas, actualizadas, ignoradas}.
 */
function homoImportApply(grid) {
    homoInit();
    if (!grid || !grid.length) return { nuevas: 0, actualizadas: 0, ignoradas: 0 };

    var headerIdx = (typeof _pnProjDetectHeader === 'function') ? _pnProjDetectHeader(grid) : 0;
    var headers = grid[headerIdx] || [];
    var map = homoAutoMap(headers);
    if (map.mcCode === undefined && map.workOrder === undefined) {
        return { error: 'No se encontró ninguna columna "MC code" ni "Work Order No." — sin eso no se puede saber a qué vehículo pertenece cada fila.' };
    }

    var byKey = {};
    homoState.catalog.forEach(function(r) { byKey[homoRowKey(r)] = r; });

    var nuevas = 0, actualizadas = 0, ignoradas = 0;
    var who = (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '';
    var now = new Date().toISOString();

    for (var i = headerIdx + 1; i < grid.length; i++) {
        var cells = grid[i] || [];
        var get = function(f) { return map[f] === undefined ? null : cells[map[f]]; };
        var txt = function(f) { var v = get(f); return v == null ? '' : String(v).trim(); };

        var incoming = {
            mcCode: txt('mcCode'), workOrder: txt('workOrder'), ocn: txt('ocn'), wvta: txt('wvta'),
            variant: txt('variant'), version: txt('version'),
            f0: _homoNum(get('f0')), f1: _homoNum(get('f1')), f2: _homoNum(get('f2')), tm: _homoNum(get('tm')),
            co2Combined: _homoNum(get('co2Combined')), fcCombined: _homoNum(get('fcCombined'))
        };
        var key = homoRowKey(incoming);
        if (!key) { ignoradas++; continue; }

        var existing = byKey[key];
        if (existing) {
            // Solo se rellena/actualiza lo que trae valor: la segunda descarga no
            // borra lo que puso la primera.
            Object.keys(incoming).forEach(function(k) {
                var v = incoming[k];
                if (v !== null && v !== '') existing[k] = v;
            });
            existing.at = now; existing.by = who;
            actualizadas++;
        } else {
            incoming.id = 'homo_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
            incoming.at = now; incoming.by = who;
            homoState.catalog.push(incoming);
            byKey[key] = incoming;
            nuevas++;
        }
    }

    homoSave();
    if (typeof auditLog === 'function') {
        auditLog('homolog', 'catalogo_importado', { type: 'homolog', label: 'ICMS' },
            nuevas + ' nuevas, ' + actualizadas + ' actualizadas');
    }
    return { nuevas: nuevas, actualizadas: actualizadas, ignoradas: ignoradas };
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
 * Muestra/oculta el bloque de homologación según la región elegida, y lo
 * autollena si esa configuración ya se ligó antes a un MC code.
 * Se llama desde renderCascadeTree() (cop15.js) en cada cambio de la cascada.
 */
function homoAltaSync() {
    var box = document.getElementById('homo-alta-box');
    if (!box) return;
    homoInit();

    var isEu = homoAltaIsEurope();
    box.style.display = isEu ? '' : 'none';
    if (!isEu) return;

    // Autollenado por enlace previo — solo si el operador no ha escrito nada.
    var f0 = document.getElementById('homo_f0');
    if (f0 && !f0.value) {
        var sug = homoSuggestForConfig(_homoAltaConfigCode());
        if (sug) homoAltaFill(sug, true);
    }
    homoAltaUpdateStatus();
}

/** Pinta una fila del catálogo en los campos del Alta. */
function homoAltaFill(row, auto) {
    var set = function(id, v) {
        var el = document.getElementById(id);
        if (el) el.value = (v == null ? '' : v);
    };
    set('homo_mc', row.mcCode || row.workOrder || '');
    set('homo_f0', row.f0);
    set('homo_f1', row.f1);
    set('homo_f2', row.f2);
    set('homo_tm', row.tm);
    set('homo_co2', row.co2Combined);
    var st = document.getElementById('homo-alta-status');
    if (st) {
        st.innerHTML = '<span style="color:var(--ok-text,#166534);">✅ ' +
            (auto ? 'Autollenado desde el catálogo' : 'Tomado del catálogo') +
            ' — <b>' + escapeHtml(row.mcCode || row.workOrder) + '</b></span>';
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
        return '<button type="button" class="btn-secondary" style="display:block;width:100%;text-align:left;margin:3px 0;padding:6px 10px;font-size: var(--fs-sm);" ' +
            'onclick="homoAltaPick(\'' + escapeHtml(homoRowKey(r)) + '\')">' +
            '<b>' + escapeHtml(r.mcCode || r.workOrder) + '</b>' +
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
    if (code) homoLinkConfig(code, row.mcCode || row.workOrder);
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
    if (d.co2Target == null) missing.push('CO₂ target');
    warn.innerHTML = missing.length
        ? '<span style="color:var(--warn-text,#92400e);">⚠️ Falta: ' + missing.join(', ') +
          '. Puedes registrar igual, pero el CoP no podrá comparar el CO₂ de este vehículo.</span>'
        : '<span style="color:var(--ok-text,#166534);">✅ Ficha completa.</span>';
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
    return {
        mcCode: txt('homo_mc'),
        f0: num('homo_f0'), f1: num('homo_f1'), f2: num('homo_f2'), tm: num('homo_tm'),
        co2Target: num('homo_co2'),
        source: 'alta',
        by: (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '',
        at: new Date().toISOString()
    };
}

/** Limpia el bloque (tras registrar un vehículo). */
function homoAltaReset() {
    ['homo_mc', 'homo_f0', 'homo_f1', 'homo_f2', 'homo_tm', 'homo_co2'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var r = document.getElementById('homo-alta-results'); if (r) r.innerHTML = '';
    var s = document.getElementById('homo-alta-status'); if (s) s.innerHTML = '';
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
    html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom:12px;line-height:1.5;">' +
        'Importa aquí el Excel/CSV que baja el ICMS. Puedes subir las dos descargas por separado ' +
        '(la de <b>WLTP Driving energy</b> con f0/f1/f2/TM y la de <b>WLTP - ICE/HEV</b> con el CO₂): ' +
        'se fusionan por <b>MC code</b>, así que la segunda completa las filas de la primera. ' +
        'Reimportar actualiza, no duplica.</div>';

    html += '<div class="inv-row-list-2col" style="margin-bottom:10px;">';
    html += '<div class="form-group"><label for="homo-file">Archivo del ICMS (.xlsx / .xls / .csv)</label>' +
        '<input type="file" id="homo-file" accept=".xlsx,.xls,.csv" class="form-control" onchange="homoImportFile(event)"></div>';
    html += '<div class="form-group"><label for="homo-paste">…o pega las filas (copiadas del ICMS)</label>' +
        '<textarea id="homo-paste" class="form-control" rows="3" placeholder="Pega aquí incluyendo la fila de encabezados"></textarea>' +
        '<button class="tp-btn tp-btn-primary" style="margin-top:6px;" onclick="homoImportPaste()">Importar lo pegado</button></div>';
    html += '</div>';
    html += '<div id="homo-import-status" style="font-size: var(--fs-sm);margin-bottom:10px;"></div>';

    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size: var(--fs-sm);color:var(--tp-dim);">' +
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
        (cat.length ? '<button class="tp-btn tp-btn-ghost" onclick="homoExportCSV()" style="font-size: var(--fs-xs);">📤 Exportar CSV</button>' : '') +
        '</div>';
    if (!cat.length) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);font-size: var(--fs-sm);">' +
            'Todavía no hay nada importado. Sube el archivo del ICMS arriba.</div>';
    } else {
        html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size: var(--fs-xs);">';
        html += '<thead><tr>' +
            ['MC code', 'Work Order', 'Variant/Version', 'f0', 'f1', 'f2', 'TM', 'CO₂ comb.', ''].map(function(h) {
                return '<th style="text-align:left;padding:6px 8px;border-bottom:1.5px solid var(--tp-border);white-space:nowrap;">' + h + '</th>';
            }).join('') + '</tr></thead><tbody>';
        cat.slice(0, 300).forEach(function(r) {
            var num = function(v) { return v == null ? '<span style="color:var(--tp-red);">—</span>' : v; };
            html += '<tr>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--tp-border);font-weight:700;">' + escapeHtml(r.mcCode || '—') + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--tp-border);">' + escapeHtml(r.workOrder || '—') + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--tp-border);">' + escapeHtml((r.variant || '') + (r.version ? '/' + r.version : '')) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--tp-border);">' + num(r.f0) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--tp-border);">' + num(r.f1) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--tp-border);">' + num(r.f2) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--tp-border);">' + num(r.tm) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--tp-border);font-weight:700;">' + num(r.co2Combined) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--tp-border);">' +
                '<button class="tp-btn tp-btn-ghost" style="color:var(--tp-red);font-size: var(--fs-xs);" onclick="homoDeleteRow(\'' + r.id + '\')" title="Quitar del catálogo">🗑</button></td>' +
                '</tr>';
        });
        html += '</tbody></table></div>';
        if (cat.length > 300) {
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);padding-top:6px;">Mostrando 300 de ' + cat.length + '.</div>';
        }
    }
    html += '</div>';

    el.innerHTML = html;
}


function homoDeleteRow(id) {
    showConfirm('¿Quitar este vehículo del catálogo? No afecta a los vehículos ya registrados.', function() {
        homoInit();
        homoState.catalog = homoState.catalog.filter(function(r) { return r.id !== id; });
        homoSave();
        if (typeof pnRender === 'function') pnRender();
        showToast('Fila eliminada.', 'success');
    }, { type: 'danger' });
}

function _homoImportReport(res) {
    var st = document.getElementById('homo-import-status');
    if (!st) return;
    if (res.error) {
        st.innerHTML = '<span style="color:var(--tp-red);">' + escapeHtml(res.error) + '</span>';
        return;
    }
    st.innerHTML = '<span style="color:var(--ok-text,#166534);">✅ ' + res.nuevas + ' nuevas, ' +
        res.actualizadas + ' actualizadas' + (res.ignoradas ? ', ' + res.ignoradas + ' ignoradas (sin MC code)' : '') + '.</span>';
    if (typeof pnRender === 'function') setTimeout(pnRender, 900);
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

    var isCsv = /\.csv$/i.test(file.name);
    var reader = new FileReader();

    if (isCsv) {
        reader.onload = function() {
            var grid = (typeof _pnProjParseDelimited === 'function') ? _pnProjParseDelimited(reader.result) : null;
            if (!grid) { showToast('No se pudo leer el CSV.', 'error'); return; }
            _homoImportReport(homoImportApply(grid));
        };
        reader.readAsText(file);
        return;
    }

    // .xlsx/.xls — SheetJS se carga diferido (mismo patrón que el importador de Proyectos)
    if (typeof _pnProjLoadXLSX !== 'function') { showToast('Importador no disponible.', 'error'); return; }
    showToast('Cargando lector de Excel…', 'info');
    _pnProjLoadXLSX(function(ok) {
        if (!ok) {
            showToast('No se pudo cargar el lector de Excel (sin internet). Guarda el archivo como CSV e inténtalo de nuevo.', 'error');
            return;
        }
        reader.onload = function() {
            try {
                var wb = window.XLSX.read(new Uint8Array(reader.result), { type: 'array' });
                var sheet = wb.Sheets[wb.SheetNames[0]];
                var grid = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
                _homoImportReport(homoImportApply(grid));
            } catch (e) {
                console.error('homoImportFile:', e);
                showToast('No se pudo leer el archivo: ' + e.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    });
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
        'Sube el Excel del ICMS una sola vez; el Alta autollena solo a partir de ahí.',
        'Puedes subir las dos descargas por separado (coeficientes y CO₂): se fusionan por MC code.',
        'Reimportar el mismo archivo actualiza las filas, no las duplica.',
        'El veredicto de CO₂ (FCF, Evolution Factor) se ajusta en CoP → Validador, dentro de la mesa de trabajo de cada familia.'
    ]}
});

if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'pn-homolog-help': { title: 'Catálogo del ICMS', text: 'Cada fila es un vehículo homologado, identificado por su MC code. De ahí salen los coeficientes con los que se carga el dinamómetro y el CO₂ declarado contra el que se compara lo medido.' },
    'homo_mc': { title: 'MC code', text: 'El código del ICMS que identifica la homologación del vehículo. Escribe unos caracteres y elige de la lista: se autollenan los coeficientes y el CO₂. La próxima vez que registres esta misma configuración se llenará solo.' },
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
        (fams.length ? '<button class="tp-btn tp-btn-ghost" onclick="homoIpExportCSV()" style="font-size: var(--fs-xs);">📤 Exportar CSV</button>' : '') +
        '</div>';
    html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom:12px;line-height:1.5;">' +
        'La familia de interpolación es la agrupación <b>oficial</b> del CoP en Europa: la declara el certificado ' +
        'de homologación (WVTA) en su punto <b>0.2.3.1</b>, por variante y versión. ' +
        '<b>Los coeficientes f0/f1/f2 NO se capturan aquí</b> — el WVTA solo trae los de los vehículos extremos ' +
        'VL y VH que acotan la familia, no los del vehículo que vas a ensayar. Esos siguen viniendo del catálogo ' +
        'del ICMS. De aquí salen la identidad de la familia, sus miembros, las masas TML/TMH y el rango de CO₂ declarado.</div>';

    html += '<div class="form-group"><label for="homo-ip-paste">Pega el texto del WVTA (punto 0.2.3.1 y, si lo tienes, el bloque 3.1 de resultados de CO₂)</label>' +
        '<textarea id="homo-ip-paste" class="form-control" rows="4" placeholder="Copia del PDF del certificado las tablas de Variant(s) / Version(s) / IP Family, y las de Combined y Test mass."></textarea>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">' +
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
                '<button class="tp-btn tp-btn-ghost" style="font-size:var(--fs-xs);" onclick="homoIpEditModal(\'' + f.id + '\')">Editar</button>' +
                '<button class="tp-btn tp-btn-ghost" style="font-size:var(--fs-xs);" onclick="homoIpConfirmDelete(\'' + f.id + '\')" title="Borrar">✕</button></td>';
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
    h += '<table class="cop-table" style="margin-top:8px;"><thead><tr><th class="cop-l">Familia IP</th>' +
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
    h += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' +
         '<button class="tp-btn tp-btn-primary" onclick="homoIpApplyPending()">Guardar estas familias</button>' +
         '<button class="tp-btn tp-btn-ghost" onclick="homoIpCancelPending()">Cancelar</button></div>';
    h += '<div style="margin-top:8px;font-size:var(--fs-xs);color:var(--tp-dim);">Reimportar el mismo certificado actualiza, no duplica: se empata por código IP.</div>';
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
    var go = function() { homoIpDelete(id); _homoIpRepaint(); };
    if (typeof showConfirm === 'function') showConfirm('¿Borrar la familia ' + f.code + '?', go);
    else if (confirm('¿Borrar la familia ' + f.code + '?')) go();
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
        '<div class="inv-row-list-2col" style="margin-top:8px;">' +
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
        '<p style="font-size:var(--fs-xs);color:var(--tp-dim);margin-top:8px;">' +
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
