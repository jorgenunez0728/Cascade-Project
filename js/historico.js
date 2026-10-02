// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.30.0] PRUEBAS ANTERIORES A LA PLATAFORMA — importadas de VETS    ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Las pruebas que se corrieron antes de CASCADE (desde el 18-feb-2025) no pasaron
// por Alta, Operación ni Liberación, y su Hoja COP15-F05 no siempre existe. Lo que sí
// existe de cada una es el reporte de Excel de STARS VETS: el registro original del
// equipo de prueba. Este módulo las trae a la plataforma como lo que son.
//
// REGLAS:
//  - Una prueba histórica es un vehículo con status 'historico' (VEHICLE_STATUS_HISTORIC,
//    app.js). Así viaja por el sync de un documento por vehículo y aparece en la búsqueda,
//    la ficha y el Historial. `vehicleIsLive` la deja FUERA de todo lo "en curso" (HOY,
//    Cola, plan, Operación), y nunca se le emite una Hoja COP15-F05: no hubo recepción,
//    preacondicionamiento ni firmas que poner en ella.
//  - Nada se inventa ni se fecha hacia atrás. `registeredAt` es el día en que se importó;
//    la fecha de la prueba es la que dice VETS (`testData.testDatetime`).
//  - Importar NO es aprobar. Queda `historic.state = 'pendiente'` hasta que alguien con
//    `test.approve` —que no sea quien la importó— revisa sus resultados y firma. Mismo
//    principio que liberar/aprobar (nadie aprueba lo que liberó).
//  - La confirmación NO es doble ciego: los valores no los tecleó nadie, salen del archivo.
//    Se registra como `method: 'confirmacion-historico'` y `matchedLiberador: null`.
//  - Una sola firma por ronda de confirmación (se copia en cada prueba que cubre, con el
//    lote y cuántas eran). Firmar 70 veces la misma decisión no agrega control.
//  - Solo una CONFIRMADA cuenta para el SPC y la mesa del CoP (tiene gasResults.aprobador).
//    Una pendiente o no confirmada no tiene resultados finales.
//  - Un equipo anterior a esta versión vería 'historico' como un vehículo en curso y
//    editable: no se importa mientras haya equipos activos sin actualizar
//    (historicoOutdatedDevices).
//
// Lo PURO (se prueba en Node, tests/historico.node.js): historicoConfigMatch,
// historicoPlan, historicoBuildVehicle, historicoReviewModel, historicoDecisionCheck,
// historicoOutdatedDevices, historicoPendingSummary.

var HISTORICO_SINCE = '2.30.0';
var HISTORICO_MAX_FILES = 150;
var HISTORICO_NOTE_MIN = 5;
// Con menos campos útiles que esto, VETS no identifica la configuración (un "LHD" solo
// empata con 222): se trata como si no la trajera y se elige del catálogo completo.
var HISTORICO_MIN_CFG_FIELDS = 3;
var HISTORICO_STATE_LABELS = { pendiente: 'Por confirmar', confirmado: 'Confirmada', rechazado: 'No confirmada' };

var _historicoImport = null;   // {items, ov:{i:{vin, configCode, purpose}}, purpose}
var _historicoReview = null;   // {ids, marks:{id:{action, note}}, batchId}

// ══════════════════════════════════════════════════════════════════════
// Puras
// ══════════════════════════════════════════════════════════════════════

function _historicoNorm(s) { return String(s == null ? '' : s).toUpperCase().replace(/\s+/g, ''); }
function _historicoVin(s) { return String(s == null ? '' : s).trim().toUpperCase(); }
function _historicoIsHist(v) { return !!v && v.status === 'historico'; }
function _historicoCode(row) { return row ? String(row.codigo_config_text || row.configCode || '') : ''; }

/**
 * Configuraciones del catálogo que coinciden con lo que VETS guardó. PURA.
 * configAll = {columna: {code, label}} (vetsExtract). Un campo coincide por su etiqueta
 * o por su código ("0 - 12V" empata con el "0" del catálogo).
 * → {exact:[filas], near:[{row, miss:[columnas]}] (solo si no hay exactas), fields:n}
 */
function historicoConfigMatch(configAll, catalog) {
    var keys = Object.keys(configAll || {});
    var out = { exact: [], near: [], fields: keys.length };
    if (keys.length < HISTORICO_MIN_CFG_FIELDS) { out.fields = 0; return out; }
    (catalog || []).forEach(function(row) {
        if (!row) return;
        var miss = keys.filter(function(k) {
            var have = _historicoNorm(row[k]), cl = configAll[k] || {};
            return !(have && (have === _historicoNorm(cl.label) || (cl.code && have === _historicoNorm(cl.code))));
        });
        if (!miss.length) out.exact.push(row);
        else if (miss.length === 1 && keys.length >= 4) out.near.push({ row: row, miss: miss });
    });
    if (out.exact.length) out.near = [];
    return out;
}

/** Día de la prueba de un vehículo (AAAA-MM-DD) o ''. PURA. */
function _historicoTestDay(v) {
    var td = (v && v.testData) || {};
    var s = td.testDatetime || (td.preconditioning && td.preconditioning.datetime) || '';
    return String(s || '').slice(0, 10);
}

/**
 * LA definición de qué pasa con cada archivo del lote. PURA.
 * items: [{fileName, sha256, size, rec | error}] (rec = vetsExtract)
 * ctx: {vehicles, catalog, ov:{i:{vin, configCode, purpose}}, purpose, today, vinCheck(vin), statusLabel(s)}
 * → [{i, fileName, action, why, warnings, vin, testRef, testDate, configCode, configFrom,
 *     configOptions:[{code, miss}], purpose, gasesN, checksFail, dupId}]
 * action: 'importar' | 'elegir' (falta configuración o propósito) | 'sin-vin' | 'duplicado'
 *         (ya está en CASCADE) | 'repetido' (dos veces en el lote) | 'en-cascade' (la prueba
 *         nació en CASCADE ese día) | 'error'.
 */
function historicoPlan(items, ctx) {
    ctx = ctx || {};
    var vehicles = ctx.vehicles || [], ov = ctx.ov || {}, catalog = ctx.catalog || [];
    var lab = typeof ctx.statusLabel === 'function' ? ctx.statusLabel : function(s) { return s; };
    var byCode = {};
    catalog.forEach(function(r) { var c = _historicoCode(r); if (c) byCode[c] = r; });
    var refs = {};
    vehicles.forEach(function(v) {
        var r = v && v.testData && v.testData.vets && v.testData.vets.testRef;
        if (r) refs[String(r)] = v;
    });
    var seen = {};
    return (items || []).map(function(it, i) {
        var o = ov[i] || {};
        var row = { i: i, fileName: (it && it.fileName) || '', sha256: (it && it.sha256) || '', action: 'importar', why: '',
                    warnings: [], vin: '', testRef: '', testDate: '', configCode: '', configFrom: '', configOptions: [],
                    purpose: '', gasesN: 0, checksFail: 0, dupId: null };
        if (!it || !it.rec) { row.action = 'error'; row.why = (it && it.error) || 'No se pudo leer el archivo.'; return row; }
        var rec = it.rec;
        row.testRef = String(rec.testRef || '');
        row.testDate = String(rec.testStart || '');
        row.procedure = rec.procedure || '';
        row.operator = rec.operator || '';
        row.driver = rec.driver || '';
        row.gasesN = Object.keys(rec.gases || {}).length;
        row.checksFail = (rec.checks || []).filter(function(c) { return c && c.status === 'FAIL'; }).length;

        // VIN: el que leyó el ECU manda sobre el tecleado en VETS; una corrección a mano, sobre los dos.
        var vinF = _historicoVin(rec.vinFile), vinE = _historicoVin(rec.vinEcu);
        row.vinFile = vinF; row.vinEcu = vinE;
        row.vin = o.vin ? _historicoVin(o.vin) : (vinE || vinF);
        if (!o.vin && vinF && vinE && vinF !== vinE) {
            row.warnings.push('En VETS se tecleó ' + vinF + ' y el ECU leyó ' + vinE + ': se usa el del ECU.');
        }

        // Duplicados: la misma prueba de VETS ya en CASCADE, o dos veces en el lote.
        var key = row.testRef ? 'REF:' + row.testRef : 'VIN:' + row.vin + '@' + row.testDate;
        if (row.testRef && refs[row.testRef]) {
            var d = refs[row.testRef];
            row.action = 'duplicado'; row.dupId = d.id;
            row.why = 'Esta prueba de VETS ya está en CASCADE: VIN ' + (d.vin || '#' + d.id) + ' (' + lab(d.status) + ').';
        } else if (seen[key] != null) {
            row.action = 'repetido'; row.why = 'Es la misma prueba que la fila ' + (seen[key] + 1) + '.';
        }
        if (seen[key] == null) seen[key] = i;

        if (row.action === 'importar') {
            if (!row.gasesN) { row.action = 'error'; row.why = 'El archivo no trae resultados de gases.'; }
            else if (!row.testDate) { row.action = 'error'; row.why = 'El archivo no trae la fecha de la prueba.'; }
            else if (ctx.today && row.testDate.slice(0, 10) > ctx.today) { row.action = 'error'; row.why = 'La fecha de la prueba (' + row.testDate.slice(0, 10) + ') es posterior a hoy.'; }
        }
        if (row.action === 'importar') {
            if (!row.vin) { row.action = 'sin-vin'; row.why = 'El archivo no trae VIN: escríbelo.'; }
            else if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(row.vin)) { row.action = 'sin-vin'; row.why = 'El VIN debe tener 17 caracteres: letras y números, sin I, O ni Q.'; }
            else {
                var cd = typeof ctx.vinCheck === 'function' ? ctx.vinCheck(row.vin) : null;
                if (cd && cd.valid === false) row.warnings.push('El dígito verificador del VIN no coincide (se esperaba "' + cd.expected + '").');
            }
        }
        // ¿La prueba nació en CASCADE? Mismo VIN, mismo día, en un vehículo que no es histórico.
        if (row.action === 'importar' && row.vin) {
            var day = row.testDate.slice(0, 10);
            var twin = vehicles.filter(function(v) {
                return v && !_historicoIsHist(v) && _historicoVin(v.vin) === row.vin && day && _historicoTestDay(v) === day;
            })[0];
            if (twin) {
                row.action = 'en-cascade'; row.dupId = twin.id;
                row.why = 'Esa prueba ya existe en CASCADE (VIN ' + row.vin + ', ' + day + '): adjunta el archivo de VETS en ese vehículo, no lo importes como histórico.';
            }
        }

        // Configuración: la elegida a mano → la única que coincide con VETS → la de ese VIN en CASCADE.
        var m = historicoConfigMatch(rec.configAll || {}, catalog);
        row.configOptions = (m.exact.length ? m.exact.map(function(r) { return { code: _historicoCode(r), miss: [] }; })
                                            : m.near.map(function(n) { return { code: _historicoCode(n.row), miss: n.miss }; })).slice(0, 40);
        var vinVeh = vehicles.filter(function(v) {
            return v && !_historicoIsHist(v) && _historicoVin(v.vin) === row.vin && v.configCode && byCode[v.configCode];
        }).pop();
        if (o.configCode && byCode[o.configCode]) { row.configCode = o.configCode; row.configFrom = 'elegida'; }
        else if (m.exact.length === 1) { row.configCode = _historicoCode(m.exact[0]); row.configFrom = 'vets'; }
        else if (vinVeh) { row.configCode = vinVeh.configCode; row.configFrom = 'vin'; }
        if (row.configFrom === 'vin' && m.exact.length > 1 &&
            !m.exact.some(function(r) { return _historicoCode(r) === row.configCode; })) {
            row.warnings.push('La configuración de ese VIN en CASCADE no coincide con lo que dice VETS: revísala.');
        }
        row.purpose = o.purpose || ctx.purpose || '';
        if (row.action === 'importar' && !row.configCode) {
            row.action = 'elegir';
            row.why = m.exact.length > 1 ? 'VETS coincide con ' + m.exact.length + ' configuraciones: elige cuál.'
                    : m.fields ? 'Lo que trae VETS no coincide exacto con ninguna configuración: elígela.'
                    : 'VETS no trae la configuración: elígela.';
        }
        if (row.action === 'importar' && !row.purpose) { row.action = 'elegir'; row.why = 'Elige el propósito de la prueba.'; }
        return row;
    });
}

/** Conteo del plan. PURA. */
function historicoPlanSummary(rows) {
    var s = { total: (rows || []).length, importar: 0, pendientes: 0, omitidas: 0 };
    (rows || []).forEach(function(r) {
        if (r.action === 'importar') s.importar++;
        else if (r.action === 'elegir' || r.action === 'sin-vin') s.pendientes++;
        else s.omitidas++;
    });
    return s;
}

/**
 * El vehículo histórico que crea una fila del plan. PURA (todo lo externo en ctx).
 * ctx: {id, nowIso, who, whoId, deviceId, catalogRow, batchId, summary (vetsSummary)}
 */
function historicoBuildVehicle(row, item, ctx) {
    var rec = item.rec, cfgRow = ctx.catalogRow || {};
    var cfg = JSON.parse(JSON.stringify(cfgRow));
    return {
        id: ctx.id, vin: row.vin, purpose: row.purpose, config: cfg, configCode: row.configCode,
        status: 'historico', origin: 'vets-historico',
        registeredBy: ctx.who || '', registeredSessionUser: ctx.who || '', registeredSessionUserId: ctx.whoId != null ? ctx.whoId : null,
        registeredDeviceId: ctx.deviceId || '', registeredAt: ctx.nowIso,
        historic: {
            state: 'pendiente', source: 'vets', batchId: ctx.batchId || '',
            importedAt: ctx.nowIso, importedBy: ctx.who || '', importedById: ctx.whoId != null ? ctx.whoId : null,
            file: { name: item.fileName || '', sha256: item.sha256 || '', size: item.size || null },
            testRef: row.testRef, testDate: row.testDate, configFrom: row.configFrom,
            warnings: row.warnings.slice()
        },
        timeline: [{
            timestamp: ctx.nowIso, user: ctx.who || '',
            action: 'Prueba histórica importada de VETS (' + (item.fileName || 'archivo') + ')',
            data: { status: 'historico', state: 'pendiente', testRef: row.testRef, testDate: row.testDate }
        }],
        testData: {
            testDatetime: rec.testStart || row.testDate,
            testResponsible: rec.operator || '',
            vets: ctx.summary || null
        },
        notes: []
    };
}

/**
 * Lo que revisa quien confirma una prueba histórica. PURA.
 * ctx: {profile (perfil de regulación), regName, policy (pnState.vetsChecks), vinCheck(vin)}
 * → {gases:[{field,label,unit,value,limit,pct,pass}], values:{field:valor}, fails:[{name,level,detail}],
 *    reasons:[texto] (piden observación), needsNote, block (no se puede confirmar), allPass}
 */
function historicoReviewModel(v, ctx) {
    ctx = ctx || {};
    var s = (v && v.testData && v.testData.vets) || {};
    var out = { gases: [], values: {}, fails: [], reasons: [], needsNote: false, block: '', allPass: true };
    var profile = ctx.profile;
    if (!profile || !profile.gases || !profile.gases.length) {
        out.block = 'No hay perfil de regulación para ' + (ctx.regName || 'esta prueba') + ': no hay contra qué comparar sus gases.';
        out.allPass = false;
        return out;
    }
    var rec = { gases: {} };
    Object.keys(s.gases || {}).forEach(function(k) { rec.gases[k] = { value: s.gases[k].v, unit: s.gases[k].u }; });
    profile.gases.forEach(function(g) {
        var val = typeof vetsGasValue === 'function' ? vetsGasValue(rec, g.field, g.unit) : null;
        var hasLim = g.limit !== null && g.limit !== undefined && g.limit !== '' && isFinite(Number(g.limit));
        var lim = hasLim ? Number(g.limit) : null;
        var row = { field: g.field, label: g.label || g.field, unit: g.unit || '', value: val, limit: lim, pct: null, pass: null };
        if (val !== null && val !== undefined) {
            out.values[g.field] = val;
            if (lim !== null) {
                row.pct = lim > 0 ? val / lim * 100 : null;
                row.pass = val <= lim;
                if (!row.pass) { out.allPass = false; out.reasons.push(row.label + ' sobre el límite (' + val + ' > ' + lim + ' ' + row.unit + ').'); }
            }
        } else if (lim !== null) {
            out.allPass = false;
            out.reasons.push('El archivo no trae ' + row.label + ', que tiene límite.');
        }
        out.gases.push(row);
    });
    if (!Object.keys(out.values).length) out.block = 'El archivo no trae ningún gas de esta regulación.';
    // Verificaciones de VETS que fallaron: la política vigente del laboratorio manda
    // (alguien pudo clasificarlas después de importar).
    var pol = {};
    (ctx.policy || []).forEach(function(p) { if (p && p.id) pol[String(p.id).toUpperCase()] = p.level; });
    (s.checksFail || []).forEach(function(f) {
        var lvl = pol[String(f.name || '').toUpperCase()] || f.level || null;
        out.fails.push({ name: f.name, level: lvl, detail: f.detail || '' });
        if (lvl !== 'desacreditada' && lvl !== 'informativa') {
            out.reasons.push('Verificación de VETS que falló ' + (lvl === 'importante' ? '(Importante)' : '(sin clasificar)') + ': ' + f.name + '.');
        }
    });
    var vin = _historicoVin(v && v.vin);
    if (typeof ctx.vinCheck === 'function' && vin) {
        var cd = ctx.vinCheck(vin);
        if (cd && cd.valid === false) out.reasons.push('El dígito verificador del VIN no coincide.');
    }
    var vf = _historicoVin(s.vinFile), ve = _historicoVin(s.vinEcu);
    if (vf && ve && vf !== ve) out.reasons.push('En VETS se tecleó ' + vf + ' y el ECU leyó ' + ve + '.');
    out.needsNote = out.reasons.length > 0;
    // [2.31.0] Confirmable, pero su resultado no cuenta para CoP (p. ej. IWR fuera de rango).
    out.copExcluded = (typeof vetsDriveTraceInvalid === 'function') ? vetsDriveTraceInvalid(s).map(function(r) { return r.text; }) : [];
    return out;
}

/** ¿Se puede aplicar esta decisión? '' = sí, si no el motivo. PURA. */
function historicoDecisionCheck(model, mark) {
    if (!mark || !mark.action) return 'Elige "Confirmo" o "No confirmo".';
    var note = String(mark.note || '').trim();
    if (mark.action === 'rechazar') {
        return note.length >= HISTORICO_NOTE_MIN ? '' : 'Escribe por qué no la confirmas (al menos ' + HISTORICO_NOTE_MIN + ' caracteres).';
    }
    if (mark.action !== 'confirmar') return 'Decisión desconocida.';
    if (model && model.block) return model.block;
    if (model && model.needsNote && note.length < HISTORICO_NOTE_MIN) {
        return 'Esta prueba tiene observaciones: escribe por qué confirmas sus resultados (al menos ' + HISTORICO_NOTE_MIN + ' caracteres).';
    }
    return '';
}

/**
 * Equipos activos que todavía no entienden el estado 'historico'. PURA.
 * view = fbDevicesView(...); cmp = fbVersionCmp.
 */
function historicoOutdatedDevices(view, since, cmp) {
    return ((view && view.rows) || []).filter(function(r) {
        if (!r || r.own || r.inactive) return false;
        if (!r.version) return true;
        return typeof cmp === 'function' ? cmp(r.version, since) < 0 : false;
    });
}

/** Pendientes de confirmar: total, cuántas importó `me` y cuántas puede confirmar. PURA. */
function historicoPendingSummary(vehicles, meId) {
    var s = { total: 0, mine: 0, forMe: 0, ids: [] };
    (vehicles || []).forEach(function(v) {
        if (!_historicoIsHist(v) || !v.historic || v.historic.state !== 'pendiente') return;
        s.total++;
        var mine = meId != null && v.historic.importedById != null && String(v.historic.importedById) === String(meId);
        if (mine) s.mine++; else { s.forMe++; s.ids.push(v.id); }
    });
    return s;
}

// ══════════════════════════════════════════════════════════════════════
// Contexto real (lo que las puras reciben)
// ══════════════════════════════════════════════════════════════════════

function _historicoMe() { return (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) || null; }
function _historicoWho() { return (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : ''; }
function _historicoCatalog() { return (typeof allConfigurations !== 'undefined' && Array.isArray(allConfigurations)) ? allConfigurations : []; }
function _historicoStatusLabel(s) { return (typeof CONFIG !== 'undefined' && CONFIG.statusLabels && CONFIG.statusLabels[s]) || s; }
function _historicoVinCheck(vin) { return typeof vinCheckDigit === 'function' ? vinCheckDigit(vin) : null; }
function _historicoTodayStr() { return typeof localToday === 'function' ? localToday() : new Date().toISOString().slice(0, 10); }

function historicoPendingFor() {
    var me = _historicoMe();
    return historicoPendingSummary((typeof db !== 'undefined' && db.vehicles) || [], me ? me.id : null);
}

/** Perfil de regulación contra el que se juzga ahora (el congelado si ya se confirmó). */
function _historicoProfileFor(v) {
    var conf = v && v.historic && v.historic.confirmation;
    if (conf && conf.profile && conf.profile.gases) return conf.profile;
    var reg = typeof _libGetVehicleRegulation === 'function' ? _libGetVehicleRegulation(v) : ((v.config || {})['EMISSION REGULATION'] || '');
    return reg && typeof getRegulationProfile === 'function' ? getRegulationProfile(reg) : null;
}
function _historicoRegName(v) {
    return typeof _libGetVehicleRegulation === 'function' ? _libGetVehicleRegulation(v) : ((v.config || {})['EMISSION REGULATION'] || '');
}
function _historicoModelFor(v) {
    return historicoReviewModel(v, { profile: _historicoProfileFor(v), regName: _historicoRegName(v),
        policy: typeof vetsPolicy === 'function' ? vetsPolicy() : [], vinCheck: _historicoVinCheck });
}

/** Equipos activos sin actualizar ([] si no hay sync o no se sabe). */
function historicoDevicesBlocking() {
    try {
        if (typeof fbDevicesView !== 'function' || typeof fbDevicesCache !== 'function' ||
            typeof fbVehActive !== 'function' || !fbVehActive()) return [];
        var c = fbDevicesCache();
        var view = fbDevicesView(c.devices, c.seen, { now: Date.now(), own: typeof FB_DEVICE_ID !== 'undefined' ? FB_DEVICE_ID : '',
            current: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '' });
        return historicoOutdatedDevices(view, HISTORICO_SINCE, typeof fbVersionCmp === 'function' ? fbVersionCmp : null);
    } catch (e) { return []; }
}

function _historicoDevicesGate() {
    var old = historicoDevicesBlocking();
    if (!old.length) return true;
    var lista = old.map(function(r) { return '<li>' + escapeHtml(r.name || r.id) + ' — ' + escapeHtml(r.text || 'versión desconocida') + '</li>'; }).join('');
    showModal({ title: 'Primero actualiza estos equipos', type: 'warning',
        body: '<p>Un equipo con una versión anterior a la ' + HISTORICO_SINCE + ' vería las pruebas históricas como vehículos en curso, ' +
              'en HOY y en la Cola, y hasta podría editarlas en Operación.</p><ul>' + lista + '</ul>' +
              '<p>Abre CASCADE en cada uno y acepta la actualización (o, si ya no se usa, deja que pase a inactivo). Después vuelve a importar.</p>',
        buttons: [{ label: 'Entendido', cls: 'btn-primary' }] });
    return false;
}

// ══════════════════════════════════════════════════════════════════════
// Importar
// ══════════════════════════════════════════════════════════════════════

function historicoImportStart() {
    if (typeof _cascadeGate === 'function' && !_cascadeGate('test.vets', 'importar pruebas anteriores de VETS')) return;
    if (!_historicoDevicesGate()) return;
    var inp = document.getElementById('historico-file-input');
    if (!inp) {
        inp = document.createElement('input');
        inp.type = 'file'; inp.id = 'historico-file-input'; inp.accept = '.xlsx'; inp.multiple = true; inp.hidden = true;
        inp.addEventListener('change', function() { historicoOnFilesChosen(inp); });
        document.body.appendChild(inp);
    }
    inp.value = '';
    inp.click();
}

function historicoOnFilesChosen(input) {
    var files = Array.prototype.slice.call((input && input.files) || []);
    if (!files.length) return;
    if (files.length > HISTORICO_MAX_FILES) {
        showToast('Son ' + files.length + ' archivos: importa a lo más ' + HISTORICO_MAX_FILES + ' por lote.', 'warning');
        return;
    }
    var items = [];
    var n = 0;
    showToast('Leyendo ' + files.length + ' archivo' + (files.length > 1 ? 's' : '') + ' de VETS…', 'info', 3000);
    // Uno por uno: cada archivo pesa ~1 MB y un teléfono no tiene memoria para todos a la vez.
    var next = function() {
        if (n >= files.length) { historicoImportShow(items); return; }
        var f = files[n++];
        var it = { fileName: f.name, size: f.size };
        items.push(it);
        if (!/\.xlsx$/i.test(f.name)) { it.error = 'No es un .xlsx de VETS.'; next(); return; }
        if (f.size > 25 * 1024 * 1024) { it.error = 'Pesa ' + Math.round(f.size / 1048576) + ' MB: no parece el reporte de una prueba.'; next(); return; }
        f.arrayBuffer().then(function(buf) {
            return Promise.all([vetsReadWorkbook(new Uint8Array(buf), VETS_SHEETS), _vetsSha256(buf)]);
        }).then(function(r) {
            it.rec = vetsExtract(r[0]);
            it.sha256 = r[1] || '';
        }).catch(function(err) {
            it.error = 'No se pudo leer: ' + ((err && err.message) || err);
        }).then(next);
    };
    next();
}

/** Abre la revisión del lote. `items` = [{fileName, sha256, size, rec | error}]. */
function historicoImportShow(items) {
    _historicoImport = { items: items || [], ov: {}, purpose: '' };
    showModal({ title: '📥 Importar pruebas anteriores (VETS)', type: 'info',
        body: '<div id="hv-import" class="hv-import"></div>',
        buttons: [{ label: 'Cerrar' }] });
    _historicoImportRepaint();
}

function _historicoPlanNow() {
    var X = _historicoImport;
    if (!X) return [];
    return historicoPlan(X.items, { vehicles: (typeof db !== 'undefined' && db.vehicles) || [], catalog: _historicoCatalog(),
        ov: X.ov, purpose: X.purpose, today: _historicoTodayStr(), vinCheck: _historicoVinCheck, statusLabel: _historicoStatusLabel });
}

var HISTORICO_ACTION_LABELS = {
    importar: { t: 'Se importa', tone: 'ok' }, elegir: { t: 'Falta elegir', tone: 'warn' }, 'sin-vin': { t: 'Falta el VIN', tone: 'warn' },
    duplicado: { t: 'Ya está en CASCADE', tone: 'muted' }, repetido: { t: 'Repetido en el lote', tone: 'muted' },
    'en-cascade': { t: 'Nació en CASCADE', tone: 'muted' }, error: { t: 'No se puede leer', tone: 'bad' }
};

function _historicoPurposeOptions(cur, withEmpty) {
    var list = typeof TP_PURPOSES_VALID !== 'undefined' ? TP_PURPOSES_VALID : ['COP-Emisiones', 'EO-Emisiones', 'ND-Emisiones', 'Investigacion', 'Correlacion'];
    return (withEmpty ? '<option value="">Elige…</option>' : '') + list.map(function(p) {
        var l = typeof uiLabel === 'function' ? uiLabel('purpose', p) : p;
        return '<option value="' + escapeHtml(p) + '"' + (cur === p ? ' selected' : '') + '>' + escapeHtml(l) + '</option>';
    }).join('');
}

function _historicoCfgLabel(code) {
    var row = _historicoCatalog().filter(function(r) { return _historicoCode(r) === code; })[0];
    if (!row) return code;
    return [row['Modelo'], row['MODEL YEAR (VIN)'], row['ENGINE CAPACITY'], row['TRANSMISSION'], row['ENVIRONMENT PACKAGE'] !== '0' ? row['ENVIRONMENT PACKAGE'] : '',
            row['EMISSION REGULATION'], row['REGION'], row['BODY TYPE'], row['TIRE ASSY']].filter(Boolean).join(' · ');
}

function _historicoImportRepaint() {
    var host = document.getElementById('hv-import');
    if (!host || !_historicoImport) return;
    var rows = _historicoPlanNow();
    var s = historicoPlanSummary(rows);
    var catalog = _historicoCatalog();
    var h = '<p class="hv-intro">Cada archivo se vuelve una <b>prueba histórica</b>: queda en CASCADE con los resultados de VETS, ' +
            '<b>por confirmar</b> por alguien con permiso de aprobar que no seas tú. No genera Hoja COP15-F05 ni cuenta como liberada.</p>' +
            '<div class="hv-batch"><label for="hv-purpose-all">Propósito para todas</label>' +
            '<select id="hv-purpose-all" onchange="historicoImportSetPurpose(this.value)">' + _historicoPurposeOptions(_historicoImport.purpose, true) + '</select></div>' +
            '<div class="hv-sum"><b>' + s.importar + '</b> se importan · <b>' + s.pendientes + '</b> piden un dato · <b>' + s.omitidas + '</b> se omiten (de ' + s.total + ')</div>';
    h += '<div class="hv-rows">';
    rows.forEach(function(r) {
        var al = HISTORICO_ACTION_LABELS[r.action] || { t: r.action, tone: '' };
        h += '<div class="hv-row is-' + al.tone + '">' +
             '<div class="hv-row-head"><span class="hv-chip is-' + al.tone + '">' + al.t + '</span>' +
             '<b class="hv-file" title="' + escapeHtml(r.fileName) + '">' + escapeHtml(r.fileName) + '</b>' +
             (r.testDate ? '<span class="u-muted-xs">prueba ' + escapeHtml(r.testDate.replace('T', ' ')) + '</span>' : '') + '</div>';
        if (r.why) h += '<div class="hv-why">' + escapeHtml(r.why) + '</div>';
        if (r.action !== 'error' && r.action !== 'duplicado' && r.action !== 'repetido' && r.action !== 'en-cascade') {
            h += '<div class="hv-fields">' +
                 '<label><span>VIN</span><input type="text" maxlength="17" value="' + escapeHtml(r.vin) + '" ' +
                 'onchange="historicoImportSet(' + r.i + ',\'vin\',this.value)" placeholder="Ej.: 3KPFT51B7TE407968" autocapitalize="characters"></label>' +
                 '<label><span>Configuración</span><select onchange="historicoImportSet(' + r.i + ',\'configCode\',this.value)">' +
                 '<option value="">Elige…</option>' +
                 (r.configOptions.length ? r.configOptions : catalog.map(function(c) { return { code: _historicoCode(c), miss: [] }; }))
                    .concat(r.configCode && !r.configOptions.some(function(x) { return x.code === r.configCode; }) ? [{ code: r.configCode, miss: [] }] : [])
                    .map(function(c) {
                        return '<option value="' + escapeHtml(c.code) + '"' + (c.code === r.configCode ? ' selected' : '') + '>' +
                               escapeHtml(_historicoCfgLabel(c.code)) + (c.miss.length ? ' (difiere en ' + escapeHtml(c.miss.join(', ')) + ')' : '') + '</option>';
                    }).join('') +
                 '</select></label>' +
                 '<label><span>Propósito</span><select onchange="historicoImportSet(' + r.i + ',\'purpose\',this.value)">' + _historicoPurposeOptions(r.purpose, true) + '</select></label>' +
                 '</div>';
            h += '<div class="u-muted-xs">' + r.gasesN + ' gases · ' + (r.checksFail ? r.checksFail + ' verificación(es) de VETS fallaron' : 'verificaciones de VETS sin fallas') +
                 (r.configFrom === 'vets' ? ' · configuración tomada de VETS' : r.configFrom === 'vin' ? ' · configuración de ese VIN en CASCADE' : '') + '</div>';
        }
        if (r.warnings.length) h += '<div class="hv-warn">' + r.warnings.map(function(w) { return '⚠ ' + escapeHtml(w); }).join('<br>') + '</div>';
        h += '</div>';
    });
    h += '</div>';
    h += '<div class="hv-actions"><button type="button" id="hv-apply" class="btn-primary" onclick="historicoImportApply()">Importar ' + s.importar + ' prueba' + (s.importar === 1 ? '' : 's') + '</button></div>';
    host.innerHTML = h;
    var btn = document.getElementById('hv-apply');
    var why = !s.importar ? 'No hay pruebas listas para importar: revisa las que piden un dato.' : '';
    if (btn && typeof uiExplainDisabled === 'function') uiExplainDisabled(btn, why);
    else if (btn) btn.disabled = !!why;
}

function historicoImportSet(i, k, val) {
    if (!_historicoImport) return;
    var o = _historicoImport.ov[i] = _historicoImport.ov[i] || {};
    o[k] = String(val || '').trim();
    if (k === 'vin') o.vin = o.vin.toUpperCase();
    _historicoImportRepaint();
}
function historicoImportSetPurpose(val) {
    if (!_historicoImport) return;
    _historicoImport.purpose = String(val || '');
    _historicoImportRepaint();
}

function historicoImportApply() {
    var X = _historicoImport;
    if (!X) return;
    if (typeof _cascadeGate === 'function' && !_cascadeGate('test.vets', 'importar pruebas anteriores de VETS')) return;
    if (!_historicoDevicesGate()) return;
    var rows = _historicoPlanNow().filter(function(r) { return r.action === 'importar'; });
    if (!rows.length) { showToast('No hay pruebas listas para importar.', 'warning'); return; }
    if (typeof _releasePreflightStorage === 'function' && !_releasePreflightStorage('importar pruebas históricas')) return;

    var me = _historicoMe(), who = _historicoWho();
    var nowIso = new Date().toISOString();
    var batchId = 'hv-' + Date.now().toString(36);
    var policy = typeof vetsPolicy === 'function' ? vetsPolicy() : [];
    var catalog = _historicoCatalog();
    var added = [];
    rows.forEach(function(r) {
        var item = X.items[r.i];
        var meta = { fileName: item.fileName, sha256: item.sha256 || '', at: nowIso, by: who };
        var classified = typeof vetsClassifyChecks === 'function' ? vetsClassifyChecks(item.rec.checks, policy) : [];
        var v = historicoBuildVehicle(r, item, {
            id: nextVehicleId(), nowIso: nowIso, who: who, whoId: me ? me.id : null,
            deviceId: typeof FB_DEVICE_ID !== 'undefined' ? FB_DEVICE_ID : '',
            catalogRow: catalog.filter(function(c) { return _historicoCode(c) === r.configCode; })[0],
            batchId: batchId, summary: typeof vetsSummary === 'function' ? vetsSummary(item.rec, meta, classified, {}) : null
        });
        db.vehicles.push(v);
        added.push({ v: v, rec: item.rec, meta: meta });
    });
    if (saveDB() === false) {
        db.vehicles = db.vehicles.filter(function(v) { return !added.some(function(a) { return a.v === v; }); });
        showToast('No hay espacio para guardar las pruebas históricas: no se importó nada. Libera espacio en Datos → Sistema.', 'error', 10000);
        return;
    }
    added.forEach(function(a) {
        if (typeof auditLog === 'function') {
            auditLog('cop15', 'historico_importado', { type: 'vehicle', id: a.v.id, label: a.v.vin },
                'Prueba de VETS ' + (a.v.historic.testRef || '') + ' del ' + String(a.v.historic.testDate || '').slice(0, 10) + ' (' + a.meta.fileName + ')',
                { before: null, after: { estado: 'historico', confirmacion: 'pendiente', vin: a.v.vin, prueba: a.v.historic.testRef,
                                         fecha: a.v.historic.testDate, configuracion: a.v.configCode, proposito: a.v.purpose,
                                         archivo: a.meta.fileName, sha256: a.meta.sha256, lote: batchId } });
        }
        if (typeof _vetsStoreFull === 'function') _vetsStoreFull(a.rec, a.meta, a.v);
    });
    var m = document.getElementById('globalModal');
    if (m && m.parentNode) m.parentNode.removeChild(m);
    _historicoImport = null;
    showToast(added.length + ' prueba' + (added.length === 1 ? '' : 's') + ' histórica' + (added.length === 1 ? '' : 's') +
              ' importada' + (added.length === 1 ? '' : 's') + '. Las confirma alguien con permiso de aprobar que no seas tú.', 'success', 8000);
    if (typeof renderHistory === 'function') { window._histFilterStatus = 'historico'; try { renderHistory(); } catch (e) {} }
}

// ══════════════════════════════════════════════════════════════════════
// Confirmar (quien aprueba)
// ══════════════════════════════════════════════════════════════════════

function historicoReviewOpen() {
    if (typeof _cascadeGate === 'function' && !_cascadeGate('test.approve', 'confirmar pruebas históricas')) return;
    var p = historicoPendingFor();
    if (!p.total) { showToast('No hay pruebas históricas por confirmar.', 'info'); return; }
    if (!p.forMe) { showToast('Las ' + p.total + ' pruebas por confirmar las importaste tú: las confirma otra persona con permiso de aprobar.', 'warning', 8000); return; }
    var vs = p.ids.map(function(id) { return db.vehicles.filter(function(v) { return v.id == id; })[0]; }).filter(Boolean);
    vs.sort(function(a, b) { return String(a.historic.testDate || '').localeCompare(String(b.historic.testDate || '')); });
    _historicoReview = { ids: vs.map(function(v) { return v.id; }), marks: {}, batchId: 'hc-' + Date.now().toString(36) };
    uiFlowOpen({
        id: 'historico', title: 'Confirmar pruebas históricas',
        subtitle: p.mine ? p.mine + ' importada' + (p.mine > 1 ? 's' : '') + ' por ti no aparece' + (p.mine > 1 ? 'n' : '') : '',
        saveLabel: 'Anotar ▸', closeLabel: 'Salir sin aplicar',
        steps: vs.map(function(v) {
            var d = String(v.historic.testDate || '').slice(0, 7);
            return { key: 'h' + v.id, section: d, title: v.vin,
                     render: function(host) { _historicoCard(host, v.id); },
                     save: function(host) { return _historicoCardSave(host, v.id); } };
        }),
        onFinal: _historicoFinalHTML,
        onClose: function(why) {
            var n = _historicoReview ? Object.keys(_historicoReview.marks).length : 0;
            if (n && _historicoReview && !_historicoReview.applied) showToast('No se aplicó nada: las ' + n + ' decisiones anotadas se descartaron.', 'info');
            _historicoReview = null;
        }
    });
}

function _historicoVehicle(id) { return ((typeof db !== 'undefined' && db.vehicles) || []).filter(function(v) { return v.id == id; })[0] || null; }

function _historicoFmt(x) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    var a = Math.abs(x);
    return a === 0 ? '0' : a >= 100 ? x.toFixed(2) : a >= 1 ? x.toFixed(4) : Number(x.toPrecision(4)).toString();
}

function _historicoGasTableHTML(model) {
    return '<table class="hv-gas"><thead><tr><th>Gas</th><th>VETS</th><th>Límite</th><th>%</th><th></th></tr></thead><tbody>' +
        model.gases.map(function(g) {
            return '<tr class="' + (g.pass === false ? 'is-bad' : '') + '"><td>' + escapeHtml(g.label) + ' <small>' + escapeHtml(g.unit) + '</small></td>' +
                '<td>' + _historicoFmt(g.value) + '</td><td>' + (g.limit === null ? '<small>informativo</small>' : _historicoFmt(g.limit)) + '</td>' +
                '<td>' + (g.pct === null ? '' : Math.round(g.pct) + ' %') + '</td>' +
                '<td>' + (g.pass === true ? '✓' : g.pass === false ? '✗' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
}

function _historicoCard(host, id) {
    var v = _historicoVehicle(id);
    if (!v || !_historicoIsHist(v) || !v.historic || v.historic.state !== 'pendiente') {
        host.innerHTML = '<p class="uf-note">Esta prueba ya no está por confirmar (otro equipo la cambió). Toca <b>Después</b> para seguir.</p>';
        return;
    }
    var H = v.historic, s = (v.testData && v.testData.vets) || {};
    var model = _historicoModelFor(v);
    var mark = (_historicoReview && _historicoReview.marks[id]) || {};
    var h = '<div class="uf-kicker">Prueba del ' + escapeHtml(String(H.testDate || '').replace('T', ' ')) +
            (s.procedure ? ' · ' + escapeHtml(s.procedure) : '') + (H.testRef ? ' · VETS ' + escapeHtml(H.testRef) : '') + '</div>' +
            '<div class="uf-q">' + escapeHtml(v.vin || '') + '</div>' +
            '<div class="uf-facts">' +
                '<div><span>Configuración</span><b>' + escapeHtml(_historicoCfgLabel(v.configCode)) + '</b></div>' +
                '<div><span>Regulación</span><b>' + escapeHtml(_historicoRegName(v) || '—') + '</b></div>' +
                '<div><span>Propósito</span><b>' + escapeHtml(typeof uiLabel === 'function' ? uiLabel('purpose', v.purpose) : v.purpose) + '</b></div>' +
                '<div><span>Operador · conductor</span><b>' + escapeHtml((s.operator || '—') + ' · ' + (s.driver || '—')) + '</b></div>' +
                '<div><span>Importó</span><b>' + escapeHtml((H.importedBy || '—') + ' · ' + String(H.importedAt || '').slice(0, 10)) + '</b></div>' +
                '<div><span>Archivo</span><b title="Huella SHA-256: ' + escapeHtml(H.file && H.file.sha256 || '') + '">' + escapeHtml(H.file && H.file.name || '—') + '</b></div>' +
            '</div>';
    if (model.block) h += '<div class="uf-list is-bad"><b>🔴 No se puede confirmar</b><div>' + escapeHtml(model.block) + '</div></div>';
    else h += _historicoGasTableHTML(model);
    if (model.fails.length) {
        h += '<div class="uf-list is-warn"><b>Verificaciones de VETS que fallaron</b>' + model.fails.map(function(f) {
            return '<div>' + escapeHtml(f.name) + ' — ' + escapeHtml(f.level ? f.level : 'sin clasificar') + (f.detail ? ' <small>(' + escapeHtml(f.detail) + ')</small>' : '') + '</div>';
        }).join('') + '</div>';
    }
    if (model.reasons.length) {
        h += '<div class="uf-list is-warn"><b>⚠️ Para confirmar, escribe una observación</b>' +
             model.reasons.map(function(x) { return '<div>' + escapeHtml(x) + '</div>'; }).join('') + '</div>';
    }
    if (model.copExcluded && model.copExcluded.length) {
        h += '<div class="uf-list is-warn" data-hv-cop-excluded="1"><b>⊘ Se puede confirmar, pero no contará para CoP</b>' +
             model.copExcluded.map(function(x) { return '<div>' + escapeHtml(x) + '</div>'; }).join('') +
             '<div><small>No entra al validador, al SPC ni al REQ del plan.</small></div></div>';
    }
    if (H.warnings && H.warnings.length) {
        h += '<div class="uf-note">Al importar: ' + H.warnings.map(escapeHtml).join(' · ') + '</div>';
    }
    h += '<div class="uf-choices" role="radiogroup" aria-label="¿Confirmas los resultados?" id="hv-choice">' +
         _historicoChoiceBtn(id, 'confirmar', '✔ Confirmo los resultados', mark.action) +
         _historicoChoiceBtn(id, 'rechazar', '✖ No confirmo', mark.action) + '</div>';
    var noteLabel = mark.action === 'rechazar' ? 'Motivo (obligatorio)' : model.needsNote ? 'Observación (obligatoria)' : 'Observación (opcional)';
    h += '<label class="uf-field"><span>' + noteLabel + '</span><textarea id="hv-note" rows="2" maxlength="400" ' +
         'placeholder="' + (mark.action === 'rechazar' ? 'Ej.: el archivo es de otra unidad' : 'Ej.: NOx alto por prueba de investigación, resultado válido') + '">' +
         escapeHtml(mark.note || '') + '</textarea></label>';
    host.innerHTML = h;
}

function _historicoChoiceBtn(id, val, label, cur) {
    var on = cur === val;
    return '<button type="button" role="radio" class="uf-choice' + (on ? ' is-on' : '') + '" aria-checked="' + on + '" ' +
           'onclick="historicoChoose(' + JSON.stringify(id) + ',\'' + val + '\')">' + label + '</button>';
}

function historicoChoose(id, val) {
    if (!_historicoReview) return;
    var host = document.querySelector('#ui-flow .uf-card');
    var noteEl = host && host.querySelector('#hv-note');
    var m = _historicoReview.marks[id] = _historicoReview.marks[id] || {};
    m.action = val;
    if (noteEl) m.note = noteEl.value;
    m.pending = true;   // elegida pero no anotada todavía
    if (host) _historicoCard(host, id);
}

function _historicoCardSave(host, id) {
    if (!_historicoReview) return { ok: false, msg: 'La confirmación ya se cerró.' };
    var v = _historicoVehicle(id);
    if (!v || !v.historic || v.historic.state !== 'pendiente') return { ok: false, msg: 'Esta prueba ya no está por confirmar: toca "Después".' };
    var m = _historicoReview.marks[id] = _historicoReview.marks[id] || {};
    var noteEl = host && host.querySelector('#hv-note');
    if (noteEl) m.note = noteEl.value;
    var why = historicoDecisionCheck(_historicoModelFor(v), m);
    if (why) {
        var field = (!m.action) ? host.querySelector('#hv-choice') : noteEl;
        return { ok: false, field: field, msg: why };
    }
    delete m.pending;
    return { ok: true };
}

function _historicoFinalHTML() {
    var R = _historicoReview;
    if (!R) return '';
    var marks = Object.keys(R.marks).filter(function(id) { return !R.marks[id].pending && R.marks[id].action; });
    var conf = marks.filter(function(id) { return R.marks[id].action === 'confirmar'; }).length;
    var rech = marks.length - conf;
    var h = '<h3 class="uf-final-title">' + (marks.length ? 'Listo para firmar' : 'No anotaste ninguna decisión') + '</h3>' +
            '<p>' + conf + ' por confirmar · ' + rech + ' por marcar como no confirmada' +
            (R.ids.length - marks.length ? ' · ' + (R.ids.length - marks.length) + ' sin decidir (se quedan pendientes)' : '') + '.</p>';
    if (marks.length) {
        h += '<p class="u-muted-xs">Firmas una sola vez y la firma queda en cada prueba que decidiste, con la fecha de hoy. ' +
             'Confirmar no es doble ciego: confirmas que los resultados de VETS son los de esa prueba y que se pueden usar.</p>' +
             '<button type="button" class="btn-primary uf-next" onclick="historicoReviewApply()">✍️ Firmar y aplicar (' + marks.length + ')</button>';
    }
    return h;
}

function historicoReviewApply() {
    var R = _historicoReview;
    if (!R) return;
    if (typeof _cascadeGate === 'function' && !_cascadeGate('test.approve', 'confirmar pruebas históricas')) return;
    var ids = Object.keys(R.marks).filter(function(id) { return !R.marks[id].pending && R.marks[id].action; });
    if (!ids.length) { showToast('No hay decisiones anotadas.', 'warning'); return; }
    sigCaptureOpen({
        title: 'Firma de confirmación', role: 'Aprobador',
        signerName: _historicoWho(), lockName: true,
        onSave: function(sig) { _historicoApplySigned(ids, sig); }
    });
}

function _historicoApplySigned(ids, sig) {
    var R = _historicoReview;
    if (!R) return;
    if (typeof _releasePreflightStorage === 'function' && !_releasePreflightStorage('confirmar pruebas históricas')) return;
    var me = _historicoMe();
    var nowIso = new Date().toISOString();
    var undo = [];   // fotos para revertir si no se puede guardar
    var done = { confirmado: 0, rechazado: 0, omitidas: [] };
    if (typeof undoPush === 'function') undoPush('cop15', 'Confirmar pruebas históricas');
    var conteo = ids.length;
    ids.forEach(function(id) {
        var v = _historicoVehicle(id), m = R.marks[id];
        if (!v || !_historicoIsHist(v) || !v.historic || v.historic.state !== 'pendiente') { done.omitidas.push((v && v.vin) || id + ': ya no estaba por confirmar'); return; }
        if (me && v.historic.importedById != null && String(v.historic.importedById) === String(me.id)) { done.omitidas.push(v.vin + ': la importaste tú'); return; }
        var model = _historicoModelFor(v);
        var why = historicoDecisionCheck(model, m);
        if (why) { done.omitidas.push(v.vin + ': ' + why); return; }
        undo.push({ v: v, prev: JSON.parse(JSON.stringify({ historic: v.historic, testData: v.testData, timeline: v.timeline })) });
        var note = String(m.note || '').trim();
        var quien = { by: sig.signerName, byId: sig.sessionUserId != null ? sig.sessionUserId : (me ? me.id : null), at: nowIso,
                      batchId: R.batchId, batchCount: conteo, signature: sig };
        if (m.action === 'confirmar') {
            var reg = _historicoRegName(v);
            var prof = typeof _libGasProfileSnapshot === 'function' ? _libGasProfileSnapshot(_historicoProfileFor(v), reg) : null;
            v.historic.state = 'confirmado';
            v.historic.confirmation = Object.assign(quien, { note: note, values: model.values, allPass: model.allPass, profile: prof,
                                                            reasons: model.reasons.slice() });
            if (!v.testData) v.testData = {};
            if (!v.testData.gasResults) v.testData.gasResults = {};
            // El SPC y el CoP leen los valores finales de aquí (aprobador → liberador).
            v.testData.gasResults.aprobador = { values: model.values, capturedBy: sig.signerName, capturedAt: nowIso,
                                                matchedLiberador: null, method: 'confirmacion-historico', source: 'vets' };
            (v.timeline = v.timeline || []).push({ timestamp: nowIso, user: sig.signerName,
                action: 'Prueba histórica confirmada (resultados de VETS)' + (note ? ': ' + note : ''),
                data: { status: 'historico', state: 'confirmado', allPass: model.allPass } });
            done.confirmado++;
        } else {
            v.historic.state = 'rechazado';
            v.historic.rejection = Object.assign(quien, { reason: note });
            (v.timeline = v.timeline || []).push({ timestamp: nowIso, user: sig.signerName,
                action: 'Prueba histórica NO confirmada: ' + note, data: { status: 'historico', state: 'rechazado' } });
            done.rechazado++;
        }
    });
    if (!undo.length) {
        showToast('No se aplicó nada: ' + (done.omitidas.join(' · ') || 'sin decisiones'), 'warning', 10000);
        return;
    }
    if (saveDB() === false) {
        undo.forEach(function(u) { u.v.historic = u.prev.historic; u.v.testData = u.prev.testData; u.v.timeline = u.prev.timeline; });
        showToast('No hay espacio para guardar y se revirtió la confirmación. Libera espacio en Datos → Sistema y repítela.', 'error', 10000);
        return;
    }
    undo.forEach(function(u) {
        var v = u.v, H = v.historic, ok = H.state === 'confirmado';
        if (typeof auditLog === 'function') {
            auditLog('cop15', ok ? 'historico_confirmado' : 'historico_rechazado', { type: 'vehicle', id: v.id, label: v.vin },
                (ok ? 'Confirmada' : 'No confirmada') + ' por ' + sig.signerName + (ok ? (H.confirmation.note ? ': ' + H.confirmation.note : '') : ': ' + H.rejection.reason),
                { before: { estado: 'historico', confirmacion: 'pendiente' },
                  after: ok ? { confirmacion: 'confirmado', valores: H.confirmation.values, pasa: H.confirmation.allPass, nota: H.confirmation.note || null,
                                regulacion: H.confirmation.profile ? H.confirmation.profile.name : null, lote: H.confirmation.batchId }
                            : { confirmacion: 'rechazado', motivo: H.rejection.reason, lote: H.rejection.batchId } });
        }
    });
    if (typeof copInvalidateCache === 'function') copInvalidateCache();
    R.applied = true;
    if (typeof uiFlowClose === 'function') uiFlowClose('done');
    showToast(done.confirmado + ' confirmada' + (done.confirmado === 1 ? '' : 's') + ' · ' + done.rechazado + ' no confirmada' + (done.rechazado === 1 ? '' : 's') +
              (done.omitidas.length ? ' · ' + done.omitidas.length + ' sin aplicar: ' + done.omitidas.join(' · ') : ''), done.omitidas.length ? 'warning' : 'success', 9000);
    if (typeof renderHistory === 'function') { try { renderHistory(); } catch (e) {} }
}

/** ↩ Volver a revisar una no confirmada (o una confirmada por error). */
function historicoReopen(id) {
    if (typeof _cascadeGate === 'function' && !_cascadeGate('test.approve', 'volver a revisar una prueba histórica')) return;
    var v = _historicoVehicle(id);
    if (!v || !_historicoIsHist(v) || !v.historic || v.historic.state === 'pendiente') return;
    uiPrompt({ title: '↩ Volver a revisar', label: 'La prueba ' + v.vin + ' vuelve a quedar por confirmar. ¿Por qué?',
               placeholder: 'Ej.: se confirmó con la configuración equivocada', required: true }).then(function(motivo) {
        motivo = String(motivo || '').trim();
        if (motivo.length < HISTORICO_NOTE_MIN) { if (motivo) showToast('Escribe el motivo (al menos ' + HISTORICO_NOTE_MIN + ' caracteres).', 'warning'); return; }
        var prev = JSON.parse(JSON.stringify({ historic: v.historic, testData: v.testData, timeline: v.timeline }));
        var antes = v.historic.state;
        (v.historic.history = v.historic.history || []).push({ state: antes, confirmation: v.historic.confirmation || null,
                                                               rejection: v.historic.rejection || null, reopenedAt: new Date().toISOString(),
                                                               reopenedBy: _historicoWho(), reason: motivo });
        v.historic.state = 'pendiente';
        delete v.historic.confirmation; delete v.historic.rejection;
        if (v.testData && v.testData.gasResults) delete v.testData.gasResults.aprobador;
        (v.timeline = v.timeline || []).push({ timestamp: new Date().toISOString(), user: _historicoWho(),
            action: 'Prueba histórica regresada a "por confirmar": ' + motivo, data: { status: 'historico', state: 'pendiente' } });
        if (saveDB() === false) { v.historic = prev.historic; v.testData = prev.testData; v.timeline = prev.timeline; showToast('No se pudo guardar.', 'error'); return; }
        if (typeof auditLog === 'function') auditLog('cop15', 'historico_reabierto', { type: 'vehicle', id: v.id, label: v.vin }, motivo,
            { before: { confirmacion: antes }, after: { confirmacion: 'pendiente' } });
        if (typeof copInvalidateCache === 'function') copInvalidateCache();
        showToast('La prueba volvió a "por confirmar".', 'success');
        if (typeof renderHistory === 'function') { try { renderHistory(); } catch (e) {} }
    });
}

// ══════════════════════════════════════════════════════════════════════
// Dónde se ve
// ══════════════════════════════════════════════════════════════════════

/** Celda "Emisiones" del Historial para una prueba histórica. */
function historicoRowBadgeHTML(v) {
    var st = (v.historic && v.historic.state) || 'pendiente';
    var n = Object.keys((v.testData && v.testData.vets && v.testData.vets.gases) || {}).length;
    var txt = st === 'confirmado' ? '✓ Confirmada' : st === 'rechazado' ? '✖ No confirmada' : '⏳ Por confirmar';
    var tone = st === 'confirmado' ? 'ok' : st === 'rechazado' ? 'bad' : 'warn';
    return '<span class="hv-chip is-' + tone + '" title="Prueba histórica de VETS">' + txt + '</span> <span class="u-muted-xs">' + n + ' gases · VETS</span>';
}

/** Botones del Historial: importar y confirmar. */
function historicoToolbarHTML() {
    var can = function(p) { return typeof _cascadeCan === 'function' ? _cascadeCan(p) : true; };
    var h = '';
    if (can('test.vets')) h += '<button type="button" class="btn-secondary" onclick="historicoImportStart()" title="Pruebas que se corrieron antes de CASCADE: se importan del Excel de VETS y quedan por confirmar">📥 Importar pruebas anteriores (VETS)</button>';
    var p = historicoPendingFor();
    if (p.total && can('test.approve')) {
        h += '<button type="button" class="' + (p.forMe ? 'btn-primary' : 'btn-secondary') + '" onclick="historicoReviewOpen()">✅ Confirmar pruebas históricas (' + p.forMe + ')</button>';
    } else if (p.total) {
        h += '<span class="u-muted-xs">' + p.total + ' prueba' + (p.total > 1 ? 's' : '') + ' histórica' + (p.total > 1 ? 's' : '') + ' por confirmar (las confirma quien aprueba).</span>';
    }
    return h ? '<div class="hv-toolbar"><span class="hv-toolbar-title" data-help="historico-help">Pruebas anteriores a CASCADE</span>' + h + '</div>' : '';
}

/** La ficha universal de un histórico: resultados, quién importó y quién confirmó. */
function historicoFichaPatch(m, v) {
    var H = v.historic || {}, s = (v.testData && v.testData.vets) || {};
    var st = H.state || 'pendiente';
    m.badges.unshift({ text: 'Histórico (VETS) · ' + (HISTORICO_STATE_LABELS[st] || st), tone: st === 'confirmado' ? 'ok' : st === 'rechazado' ? 'bad' : 'warn' });
    m.facts = m.facts.filter(function(f) { return f.k !== 'Alta' && f.k !== 'Responsable'; });
    m.facts.push({ k: 'Fecha de la prueba', v: String(H.testDate || '').replace('T', ' ') || '—' });
    m.facts.push({ k: 'Prueba de VETS', v: [H.testRef, s.procedure].filter(Boolean).join(' · ') || '—' });
    m.facts.push({ k: 'Operador · conductor', v: (s.operator || '—') + ' · ' + (s.driver || '—') });
    m.facts.push({ k: 'Importó', v: (H.importedBy || '—') + ' · ' + String(H.importedAt || '').slice(0, 10) });
    m.facts.push({ k: 'Archivo', v: (H.file && H.file.name) || '—' });
    if (H.confirmation) m.facts.push({ k: 'Confirmó', v: H.confirmation.by + ' · ' + String(H.confirmation.at || '').slice(0, 10) + (H.confirmation.note ? ' · ' + H.confirmation.note : '') });
    if (H.rejection) m.facts.push({ k: 'No confirmó', v: H.rejection.by + ' · ' + String(H.rejection.at || '').slice(0, 10) + ' · ' + H.rejection.reason });
    var model = _historicoModelFor(v);
    if (H.confirmation && H.confirmation.values) {
        model.gases.forEach(function(g) { if (H.confirmation.values[g.field] != null) g.value = H.confirmation.values[g.field]; });
    }
    model.gases.forEach(function(g) {
        if (g.value === null || g.value === undefined) return;
        m.facts.push({ k: g.label + ' (' + g.unit + ')', v: _historicoFmt(g.value) + (g.pct !== null ? ' · ' + Math.round(g.pct) + ' % del límite' : '') + (g.pass === false ? ' ✗' : '') });
    });
    var can = typeof _cascadeCan === 'function' ? _cascadeCan('test.approve') : false;
    var me = _historicoMe();
    var mine = me && H.importedById != null && String(H.importedById) === String(me.id);
    if (st === 'pendiente' && can && !mine) m.next = { label: '✅ Confirmar resultados', js: 'fichaClose();historicoReviewOpen()' };
    else if (st !== 'pendiente' && can) m.next = { label: '↩ Volver a revisar', js: 'fichaClose();historicoReopen(' + JSON.stringify(v.id) + ')' };
    else m.next = { label: '📚 Ver en Historial', js: "fichaClose();window._histFilterStatus='historico';dashGo('cop15','dashboard')" };
}

if (typeof CASCADE_TOOLTIPS !== 'undefined') {
    Object.assign(CASCADE_TOOLTIPS, {
        'historico-help': { title: 'Pruebas anteriores a la plataforma',
            text: 'Las pruebas que se corrieron antes de CASCADE se importan del Excel de VETS (el registro original del equipo de prueba). ' +
                  'Quedan como "Histórico (VETS)": no generan Hoja COP15-F05, no cuentan como liberadas y no aparecen en HOY ni en el plan. ' +
                  'Alguien con permiso de aprobar —que no sea quien las importó— revisa sus resultados y firma. Solo las confirmadas entran al SPC y al CoP.' }
    });
}
