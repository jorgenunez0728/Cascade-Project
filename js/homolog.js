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
var HOMO_CO2_TOL_DEFAULT = 4; // % sobre el CO₂ declarado — editable por el usuario

var homoState = {
    catalog: [],            // filas del ICMS: {id, mcCode, workOrder, ocn, wvta, variant, version, f0, f1, f2, tm, co2Combined, fcCombined, at, by}
    links: {},              // configCode → mcCode (recordar el enlace: el 2º vehículo de la misma config ya se autollena)
    co2TolerancePct: HOMO_CO2_TOL_DEFAULT,
    updatedAt: ''
};

// ─── PERSISTENCIA ─────────────────────────────────────────────────────────────

function homoLoad() {
    try {
        var raw = JSON.parse(localStorage.getItem(HOMO_LS_KEY));
        if (raw && typeof raw === 'object') {
            if (Array.isArray(raw.catalog)) homoState.catalog = raw.catalog;
            if (raw.links && typeof raw.links === 'object') homoState.links = raw.links;
            if (typeof raw.co2TolerancePct === 'number') homoState.co2TolerancePct = raw.co2TolerancePct;
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
function homoSyncReload() { _homoLoaded = false; homoInit(); }

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

/**
 * LA definición del veredicto de CO₂ de una familia: promedio de las
 * desviaciones porcentuales contra la tolerancia configurada.
 * rows = [{vin, measured, target}]
 */
function homoCo2Assess(rows, tolPct) {
    homoInit();
    var tol = (typeof tolPct === 'number') ? tolPct : homoState.co2TolerancePct;
    var evaluated = [];
    (rows || []).forEach(function(r) {
        var dev = homoCo2Deviation(r.measured, r.target);
        evaluated.push({ vin: r.vin, measured: r.measured, target: r.target, dev: dev, homolog: r.homolog });
    });
    var withDev = evaluated.filter(function(r) { return r.dev !== null; });
    var meanDev = null;
    if (withDev.length) {
        meanDev = withDev.reduce(function(a, r) { return a + r.dev; }, 0) / withDev.length;
    }
    return {
        rows: evaluated,
        n: withDev.length,
        meanDev: meanDev,
        tolerance: tol,
        verdict: meanDev === null ? 'SIN DATOS' : (meanDev <= tol ? 'CONCORDANTE' : 'NO CONCORDANTE')
    };
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

    // ── Tolerancia de CO₂ ──
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title" data-help="pn-homolog-tol-help"><span>🎯 Tolerancia de CO₂ para el CoP</span></div>';
    html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom:10px;">' +
        'El CoP compara el CO₂ medido de cada vehículo contra <b>su</b> target declarado y promedia las ' +
        'desviaciones de la familia. Si el promedio supera esta tolerancia, marca NO CONCORDANTE.</div>';
    html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<label for="homo-tol" style="margin:0;">Tolerancia</label>' +
        '<input type="number" id="homo-tol" class="form-control" style="width:110px;" step="0.1" value="' + homoState.co2TolerancePct + '">' +
        '<span>% sobre el declarado</span>' +
        '<button class="tp-btn tp-btn-primary" onclick="homoSaveTolerance()">Guardar</button></div>';
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

function homoSaveTolerance() {
    homoInit();
    var el = document.getElementById('homo-tol');
    var v = el ? _homoNum(el.value) : null;
    if (v == null || v < 0) { showToast('Escribe una tolerancia válida (por ejemplo 4).', 'warning'); return; }
    homoState.co2TolerancePct = v;
    homoSave();
    if (typeof auditLog === 'function') auditLog('homolog', 'tolerancia_co2', { type: 'config', label: 'CO2' }, v + '%');
    showToast('Tolerancia guardada: ' + v + '%', 'success');
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
        'La tolerancia de CO₂ es la que usa el CoP para juzgar la familia.'
    ]}
});

if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'pn-homolog-help': { title: 'Catálogo del ICMS', text: 'Cada fila es un vehículo homologado, identificado por su MC code. De ahí salen los coeficientes con los que se carga el dinamómetro y el CO₂ declarado contra el que se compara lo medido.' },
    'pn-homolog-tol-help': { title: 'Tolerancia de CO₂', text: 'Cuánto puede exceder el promedio de la familia al CO₂ declarado antes de marcar NO CONCORDANTE. Se expresa en porcentaje sobre el valor declarado.' },
    'homo_mc': { title: 'MC code', text: 'El código del ICMS que identifica la homologación del vehículo. Escribe unos caracteres y elige de la lista: se autollenan los coeficientes y el CO₂. La próxima vez que registres esta misma configuración se llenará solo.' },
    'homo_f0': { title: 'f0 (N)', text: 'Coeficiente constante de la resistencia al avance, del apartado WLTP Driving energy del ICMS. Es uno de los tres valores con los que se carga el dinamómetro.' },
    'homo_f1': { title: 'f1 (N/(km/h))', text: 'Coeficiente lineal de la resistencia al avance, del ICMS.' },
    'homo_f2': { title: 'f2 (N/(km/h)²)', text: 'Coeficiente cuadrático de la resistencia al avance, del ICMS.' },
    'homo_tm': { title: 'TM — masa de ensayo (kg)', text: 'Test Mass del ICMS: la masa con la que se configura la inercia del dinamómetro.' },
    'homo_co2': { title: 'CO₂ declarado combinado (g/km)', text: 'El valor Combined de CO₂ del ICMS. Es el target contra el que el CoP compara el CO₂ medido de este vehículo.' }
});
