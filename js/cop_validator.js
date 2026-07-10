// ─── CoP Type 1 Validator — Cascade Module ───────────────────────────────────
// Validación estadística de Conformidad de Producción (CoP) Tipo 1
// Muestreo secuencial con σ desconocida — Appendix 2, UN R83 Rev.5 / R154
// VERIFICAR valores A(n)/B(n) contra texto oficial antes de uso en homologación

// ─── VALORES CRÍTICOS A(n) B(n) — Test t secuencial ─────────────────────────
var COP_CV = {
    3:  { a: -0.860, b: 2.117 },
    4:  { a: -0.233, b: 1.883 },
    5:  { a:  0.112, b: 1.796 },
    6:  { a:  0.321, b: 1.720 },
    7:  { a:  0.474, b: 1.694 },
    8:  { a:  0.593, b: 1.659 },
    9:  { a:  0.688, b: 1.634 },
    10: { a:  0.770, b: 1.613 },
    11: { a:  0.839, b: 1.597 },
    12: { a:  0.900, b: 1.582 },
    13: { a:  0.952, b: 1.570 },
    14: { a:  0.998, b: 1.559 },
    15: { a:  1.039, b: 1.550 },
    16: { a:  1.075, b: 1.541 },
    17: { a:  1.108, b: 1.534 },
    18: { a:  1.138, b: 1.527 },
    19: { a:  1.165, b: 1.521 },
    20: { a:  1.190, b: 1.515 },
};

// ─── LÍMITES DE EMISIÓN Euro 6 ────────────────────────────────────────────────
var COP_PI_LIMITS = [
    { id: 'CO',   label: 'CO',    limit: 1.0000, unit: 'g/km', active: true  },
    { id: 'THC',  label: 'THC',   limit: 0.1000, unit: 'g/km', active: true  },
    { id: 'NMHC', label: 'NMHC',  limit: 0.0680, unit: 'g/km', active: true  },
    { id: 'NOx',  label: 'NOₓ',   limit: 0.0600, unit: 'g/km', active: true  },
    { id: 'PM',   label: 'PM',    limit: 0.0045, unit: 'g/km', active: false, note: 'solo DI' },
    { id: 'PN',   label: 'PN',    limit: 6.0e11, unit: '#/km', active: false, note: 'solo DI', isPn: true },
];

var COP_CI_LIMITS = [
    { id: 'CO',    label: 'CO',     limit: 0.5000, unit: 'g/km', active: true },
    { id: 'HCNOx', label: 'HC+NOₓ', limit: 0.1700, unit: 'g/km', active: true },
    { id: 'NOx',   label: 'NOₓ',    limit: 0.0800, unit: 'g/km', active: true },
    { id: 'PM',    label: 'PM',     limit: 0.0045, unit: 'g/km', active: true },
    { id: 'PN',    label: 'PN',     limit: 6.0e11, unit: '#/km', active: true, isPn: true },
];

var COP_FUEL_LIMITS = {
    'PI':         COP_PI_LIMITS,
    'CI':         COP_CI_LIMITS,
    'Híbrido PI': COP_PI_LIMITS,
    'Híbrido CI': COP_CI_LIMITS,
};

// ─── ESTADO ───────────────────────────────────────────────────────────────────
var COP_LS_KEY = 'kia_cop_v1';
var copState = {
    view:          'validator', // 'validator' | 'spc'
    regulation:    'R154',
    fuelType:      'PI',
    region:        '',      // filtro de región para el selector de familia
    familyKey:     '',      // familia seleccionada (misma clave que el Plan)
    familyLabel:   '',
    activePolls:   null,
    vehicles:      null,    // filas = VINes: {id, vin, values:{pollId}, source:'auto'|'manual'}
    showTable:     false,
    showFormula:   false,
    _lastDecision: null,
    saved:         [],      // juicios guardados
    spc:           null,    // estado de la sub-pestaña Control SPC
};

function copPersist() {
    try {
        localStorage.setItem(COP_LS_KEY, JSON.stringify({
            view: copState.view, regulation: copState.regulation, fuelType: copState.fuelType,
            region: copState.region, familyKey: copState.familyKey, familyLabel: copState.familyLabel,
            activePolls: copState.activePolls, vehicles: copState.vehicles, saved: copState.saved,
            spc: copState.spc
        }));
        return true;
    } catch (e) {
        console.error('copPersist: no se pudo guardar', e);
        if (typeof showToast === 'function') showToast('⚠️ Almacenamiento lleno — el CoP no se guardó. Libera espacio en Panel → Sistema.', 'error');
        return false;
    }
}
function copLoad() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(COP_LS_KEY)); } catch (e) {}
    if (raw && typeof raw === 'object') {
        ['view','regulation','fuelType','region','familyKey','familyLabel','activePolls','vehicles','saved','spc'].forEach(function(k) {
            if (raw[k] !== undefined && raw[k] !== null) copState[k] = raw[k];
        });
    }
}
var _copLoaded = false;
function copInitState() {
    if (!_copLoaded) { copLoad(); _copLoaded = true; }
    if (!copState.activePolls) {
        copState.activePolls = {};
        (COP_FUEL_LIMITS[copState.fuelType] || COP_PI_LIMITS).forEach(function(p) { copState.activePolls[p.id] = p.active; });
    }
    if (!copState.vehicles || !copState.vehicles.length) {
        copState.vehicles = [
            { id: 1, vin: '', values: {}, source: 'manual' },
            { id: 2, vin: '', values: {}, source: 'manual' },
            { id: 3, vin: '', values: {}, source: 'manual' },
        ];
    }
    if (!copState.saved) copState.saved = [];
    if (!copState.spc || typeof copState.spc !== 'object') {
        copState.spc = { familyKey: '', gas: '', showZones: true, showLimit: true, pctMode: false };
    }
}

// Recargar copState desde localStorage (lo usa Firebase sync tras hacer pull/merge).
function copSyncReload() {
    _copLoaded = false;
    copInitState();
    if (document.getElementById('platform-cop') && typeof copRender === 'function') copRender();
}

// ─── FAMILIA + VINes + GUARDADO ──────────────────────────────────────────────
function _copEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function copPlanData() { return (typeof tpState !== 'undefined' && tpState.planData) ? tpState.planData : []; }
function copRegions() {
    var set = {}; copPlanData().forEach(function(c) { if (c.rgn) set[c.rgn] = true; });
    return Object.keys(set).sort();
}
// Familias reusando el MISMO agrupamiento del Plan (tpFamilyKeyForCfg).
function copFamilies() {
    var fams = {};
    copPlanData().forEach(function(c) {
        if (typeof tpFamilyKeyForCfg !== 'function') return;
        var k = tpFamilyKeyForCfg(c);
        if (!fams[k]) fams[k] = { key: k, mod: c.mod, eng: c.eng, tx: c.tx, my: c.my, reg: c.reg, rgns: {} };
        if (c.rgn) fams[k].rgns[c.rgn] = true;
    });
    return Object.keys(fams).map(function(k) {
        var f = fams[k];
        f.label = [f.mod, f.eng, f.tx, f.my, f.reg].filter(Boolean).join(' · ');
        f.regionsArr = Object.keys(f.rgns);
        return f;
    }).sort(function(a, b) { return a.label < b.label ? -1 : a.label > b.label ? 1 : 0; });
}
// Clave de familia derivada de un vehículo COP15 (db.vehicles) — replica tpFamilyKeyForCfg con headers crudos.
function copVehicleFamilyKey(v) {
    var cfg = (v && v.config) ? v.config : {};
    var mod = cfg['Modelo'] || '', eng = cfg['ENGINE CAPACITY'] || '', tx = cfg['TRANSMISSION'] || '',
        my = cfg['MODEL YEAR (VIN)'] || '', reg = cfg['EMISSION REGULATION'] || '',
        ep = cfg['ENVIRONMENT PACKAGE'] || '', engpkg = cfg['ENGINE PACKAGE'] || '';
    return mod + '|' + eng + '|' + tx + '|' + my + '|' + reg + '|' + ((ep && ep !== '0') ? ep : '') + '|' + ((engpkg && engpkg !== '0') ? engpkg : '');
}
function copSetRegion(r) { copState.region = r; copState.familyKey = ''; copState.familyLabel = ''; copPersist(); copRender(); }
function copSelectFamily(key) {
    copState.familyKey = key;
    var fam = copFamilies().find(function(f) { return f.key === key; });
    copState.familyLabel = fam ? fam.label : '';
    if (key) copAutoPopulateVins(key);
    copPersist(); copRender();
}
// Autollenar VINes de vehículos ya probados (db.vehicles) de esa familia. Valores de gases best-effort.
function copAutoPopulateVins(key) {
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var rows = [], nextId = 1;
    vehicles.forEach(function(v) {
        if (!v.vin || copVehicleFamilyKey(v) !== key) return;
        var values = {};
        copGetActiveLimits().forEach(function(p) {
            var val = copResultValue(v, p.id);
            if (val !== null && val !== undefined) values[p.id] = String(val);
        });
        rows.push({ id: nextId++, vin: v.vin, values: values, source: 'auto' });
    });
    while (rows.length < 3) rows.push({ id: nextId++, vin: '', values: {}, source: 'manual' });
    copState.vehicles = rows;
}
// Autollenado desde valores FINALES verificados (testData.gasResults capturados en
// liberación/aprobación) — nunca bolsas crudas del analizador: el juicio regulatorio
// exige valores finales. La celda queda source:'auto' y el técnico puede corregirla.
var COP_VALUE_FIELDS = { CO: 'CO', THC: 'THC', NMHC: 'NMHC', NOx: 'NOx', PM: 'PM', PN: 'PN' };

function _copNum(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
}

function _copFinalGasValues(vehicle) {
    var gr = vehicle && vehicle.testData && vehicle.testData.gasResults;
    if (!gr) return null;
    // Preferir aprobador (doble ciego verificado); fallback liberador
    if (gr.aprobador && gr.aprobador.values) return gr.aprobador.values;
    if (gr.liberador && gr.liberador.values) return gr.liberador.values;
    return null;
}

// ¿La regulación del vehículo guarda el combinado THC+NOx bajo el campo THC? (caso EURO-2)
function _copRegCombinesTHC(vehicle) {
    try {
        if (typeof _libGetVehicleRegulation !== 'function' || typeof getRegulationProfile !== 'function') return false;
        var prof = getRegulationProfile(_libGetVehicleRegulation(vehicle));
        if (!prof || !prof.gases) return false;
        var g = prof.gases.find(function(x) { return x.field === 'THC'; });
        return !!(g && /\+\s*NO/i.test(g.label || ''));
    } catch (e) { return false; }
}

function copResultValue(vehicle, pollId) {
    var values = _copFinalGasValues(vehicle);
    if (!values) return null;
    if (pollId === 'HCNOx') {
        var thc = _copNum(values.THC), nox = _copNum(values.NOx);
        if (thc !== null && nox !== null) return Math.round((thc + nox) * 10000) / 10000;
        if (thc !== null && nox === null && _copRegCombinesTHC(vehicle)) return thc;
        return null;
    }
    var field = COP_VALUE_FIELDS[pollId];
    return field ? _copNum(values[field]) : null;
}
function copAddManualRow() {
    copInitState();
    var maxId = copState.vehicles.reduce(function(m, v) { return Math.max(m, v.id); }, 0);
    copState.vehicles.push({ id: maxId + 1, vin: '', values: {}, source: 'manual' });
    copPersist(); copRender();
}
function copRemoveRow(id) {
    copState.vehicles = copState.vehicles.filter(function(v) { return v.id !== id; });
    if (!copState.vehicles.length) copState.vehicles.push({ id: 1, vin: '', values: {}, source: 'manual' });
    copPersist(); copRender();
}
function copSetVin(el) {
    var id = parseInt(el.dataset.vid);
    var v = copState.vehicles.find(function(x) { return x.id === id; });
    if (v) v.vin = el.value;
    copPersist(); // sin re-render para no perder el foco
}
function copSaveJudgment() {
    copInitState();
    var decision = copGetOverallDecision(copGetPollStats());
    copState.saved.unshift({
        id: 'cop_' + Date.now(),
        date: new Date().toISOString(),
        region: copState.region, familyKey: copState.familyKey, familyLabel: copState.familyLabel,
        regulation: copState.regulation, fuelType: copState.fuelType,
        activePolls: JSON.parse(JSON.stringify(copState.activePolls)),
        vehicles: JSON.parse(JSON.stringify(copState.vehicles)),
        decision: decision || 'INCOMPLETO'
    });
    if (!copPersist()) { copRender(); return; } // no reportar éxito si no se pudo guardar
    _copPushNow();
    if (typeof auditLog === 'function') auditLog('cop', 'judgment_saved', {type:'cop', label:(copState.familyLabel || '(sin familia)')}, 'Veredicto: ' + (decision === 'PASS' ? 'CONCORDANTE' : decision === 'FAIL' ? 'NO CONCORDANTE' : (decision || 'INCOMPLETO')));
    if (typeof showToast === 'function') showToast('Juicio guardado' + (copState.familyLabel ? ' — ' + copState.familyLabel : ''), 'success');
    copRender();
}

// Push inmediato del estado CoP persistido (los juicios no esperan al ciclo de fbPushAll).
// No se engancha copPersist en fbHookSaves porque corre en cada tecla; solo guardar/borrar juicio.
function _copPushNow() {
    try {
        if (typeof fbPush !== 'function' || typeof fbSync === 'undefined' || !fbSync.enabled) return;
        if (typeof fbSyncModules === 'undefined' || !fbSyncModules.cop) return;
        var raw = JSON.parse(localStorage.getItem(COP_LS_KEY));
        if (raw) fbPush('cop', raw);
    } catch (e) {}
}
function copLoadJudgment(id) {
    var rec = (copState.saved || []).find(function(r) { return r.id === id; });
    if (!rec) return;
    copState.regulation = rec.regulation; copState.fuelType = rec.fuelType;
    copState.region = rec.region; copState.familyKey = rec.familyKey; copState.familyLabel = rec.familyLabel;
    copState.activePolls = JSON.parse(JSON.stringify(rec.activePolls));
    copState.vehicles = JSON.parse(JSON.stringify(rec.vehicles));
    copPersist(); copRender();
    if (typeof showToast === 'function') showToast('Juicio cargado', 'info');
}
function copDeleteJudgment(id) {
    copState.saved = (copState.saved || []).filter(function(r) { return r.id !== id; });
    if (copPersist()) _copPushNow();
    copRender();
}

// ─── LÓGICA DE NEGOCIO ───────────────────────────────────────────────────────
function copCalcStats(rawValues, limit) {
    var values = rawValues.filter(function(v) { return !isNaN(v) && v !== null && v !== ''; });
    var n = values.length;
    if (n < 3) return null;

    var mean = values.reduce(function(s, v) { return s + v; }, 0) / n;
    var s = n > 1
        ? Math.sqrt(values.reduce(function(acc, v) { return acc + Math.pow(v - mean, 2); }, 0) / (n - 1))
        : 0;

    if (s === 0) {
        return { n: n, mean: mean, s: s, U: null, cv: null, decision: mean <= limit ? 'PASS' : 'FAIL' };
    }

    var U = (mean - limit) * Math.sqrt(n) / s;
    var cv = COP_CV[n] || COP_CV[20];
    var decision = 'CONTINUE';
    if (U <= cv.a) decision = 'PASS';
    else if (U >= cv.b) decision = 'FAIL';
    else if (n >= 20) decision = mean <= limit ? 'PASS' : 'FAIL';

    return { n: n, mean: mean, s: s, U: U, cv: cv, decision: decision };
}

function copFmtVal(v, isPn) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return isPn ? v.toExponential(3) : v.toFixed(5);
}
function copFmtLimit(v, isPn) { return isPn ? v.toExponential(2) : v.toFixed(4); }
function copFmtU(v) { return v === null ? '—' : v.toFixed(3); }

function copGetActiveLimits() {
    var limits = COP_FUEL_LIMITS[copState.fuelType] || COP_PI_LIMITS;
    return limits.filter(function(p) { return copState.activePolls[p.id]; });
}

function copGetPollStats() {
    return copGetActiveLimits().map(function(p) {
        var rawValues = copState.vehicles.map(function(v) {
            var raw = v.values[p.id];
            return (raw === '' || raw === undefined) ? NaN : parseFloat(raw);
        });
        var validValues = rawValues.filter(function(v) { return !isNaN(v); });
        var stats = copCalcStats(validValues, p.limit);
        return Object.assign({}, p, { validCount: validValues.length, stats: stats });
    });
}

function copGetOverallDecision(pollStats) {
    var withStats = pollStats.filter(function(p) { return p.stats; });
    if (withStats.length === 0) return null;
    if (withStats.some(function(p) { return p.stats.decision === 'FAIL'; })) return 'FAIL';
    if (withStats.every(function(p) { return p.stats.decision === 'PASS'; })) return 'PASS';
    return 'CONTINUE';
}

// ─── MANEJADORES DE EVENTOS ──────────────────────────────────────────────────
function copSetRegulation(r) {
    copState.regulation = r;
    copPersist();
    copRender();
}

function copSetFuel(fuel) {
    copState.fuelType = fuel;
    var newLimits = COP_FUEL_LIMITS[fuel] || COP_PI_LIMITS;
    copState.activePolls = {};
    newLimits.forEach(function(p) { copState.activePolls[p.id] = p.active; });
    copState.vehicles = copState.vehicles.map(function(v) { return { id: v.id, vin: v.vin, values: {}, source: v.source }; });
    copState._lastDecision = null;
    copPersist();
    copRender();
}

function copTogglePoll(pollId) {
    copState.activePolls[pollId] = !copState.activePolls[pollId];
    copPersist();
    copRender();
}

function copHandleInput(el) {
    var vid = parseInt(el.dataset.vid);
    var pid = el.dataset.pid;
    var vehicle = copState.vehicles.find(function(v) { return v.id === vid; });
    if (vehicle) vehicle.values[pid] = el.value;
    copPersist();
    copRenderStats();
}

function copClearData() {
    copState.vehicles = copState.vehicles.map(function(v) { return { id: v.id, vin: v.vin, values: {}, source: v.source }; });
    copState._lastDecision = null;
    copPersist();
    copRender();
}

function copToggleTable() {
    copState.showTable = !copState.showTable;
    var el = document.getElementById('cop-cv-table-body');
    var chevron = document.getElementById('cop-cv-chevron');
    if (!el) { copRender(); return; }
    if (copState.showTable) {
        el.style.display = '';
        if (chevron) chevron.textContent = '▾';
    } else {
        el.style.display = 'none';
        if (chevron) chevron.textContent = '▸';
    }
}

function copToggleFormula() {
    copState.showFormula = !copState.showFormula;
    copRenderStats();
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function copRender() {
    copInitState();
    var container = document.getElementById('platform-cop');
    if (!container) return;
    container.innerHTML = copBuildHTML();
    if (copState.view === 'spc') copSpcRenderCharts();
    // v16.0: banners/tooltips de ayuda (render síncrono — sin caché de pestañas de por medio)
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function copSetView(v) {
    copState.view = v === 'spc' ? 'spc' : 'validator';
    copPersist();
    copRender();
}

function copRenderStats() {
    var el = document.getElementById('cop-stats-section');
    if (el) el.innerHTML = copBuildStatsHTML();
}

// ─── HELPERS DE ESTILO (Cascade design tokens) ───────────────────────────────
function _copTh() {
    return 'padding:10px 12px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;' +
           'letter-spacing:0.5px;border-bottom:1.5px solid var(--border);text-align:center;white-space:nowrap;';
}
function _copTd() {
    return 'padding:9px 12px;font-size:12px;border-bottom:1px solid var(--border);text-align:center;';
}
function _copDecClass(decision) {
    return { PASS: 'badge badge-success', FAIL: 'badge badge-danger', CONTINUE: 'badge badge-warning' }[decision] || 'badge badge-neutral';
}
function _copDecLabel(decision) {
    return { PASS: '✓ PASS', FAIL: '✗ FAIL', CONTINUE: '⧗ CONTINUAR' }[decision] || decision;
}
function _copDecBorderColor(decision) {
    return { PASS: 'rgba(16,185,129,0.4)', FAIL: 'rgba(239,68,68,0.4)', CONTINUE: 'rgba(245,158,11,0.4)' }[decision] || 'var(--border)';
}
function _copDecBgColor(decision) {
    return { PASS: 'rgba(16,185,129,0.06)', FAIL: 'rgba(239,68,68,0.06)', CONTINUE: 'rgba(245,158,11,0.06)' }[decision] || 'transparent';
}

// ─── HTML: SECCIÓN DE ESTADÍSTICAS (se actualiza por separado en inputs) ─────
function copBuildStatsHTML() {
    var pollStats = copGetPollStats();
    var overallDecision = copGetOverallDecision(pollStats);
    var html = '';

    // Card de análisis
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;border-bottom:2px solid var(--accent-cop);padding-bottom:10px;">';
    html += '<span style="font-size:var(--font-base);font-weight:var(--weight-bold);color:var(--text);flex:1;">📈 Análisis Estadístico</span>';
    html += '<button onclick="copToggleFormula()" class="btn btn-sm btn-ghost" style="font-size:11px;">' +
            (copState.showFormula ? 'Ocultar fórmula' : 'Ver fórmula') + '</button>';
    html += '</div>';

    if (copState.showFormula) {
        html += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);' +
                'padding:12px 16px;margin-bottom:14px;">';
        html += '<p style="font-size:14px;color:var(--text);font-weight:700;font-family:monospace;margin-bottom:10px;">' +
                'U = (x̄ − L) × √n / s</p>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
        html += '<span class="badge badge-success" style="padding:5px 12px;border-radius:var(--radius-sm);font-size:12px;">U ≤ A(n) → PASS</span>';
        html += '<span class="badge badge-danger" style="padding:5px 12px;border-radius:var(--radius-sm);font-size:12px;">U ≥ B(n) → FAIL</span>';
        html += '<span class="badge badge-warning" style="padding:5px 12px;border-radius:var(--radius-sm);font-size:12px;">A &lt; U &lt; B → añadir vehículo</span>';
        html += '</div>';
        html += '</div>';
    }

    html += '<div style="overflow-x:auto;">';
    html += '<table style="border-collapse:collapse;width:100%;min-width:500px;">';
    html += '<thead><tr style="background:var(--bg);">';
    ['Contaminante', 'n válido', 'x̄', 's', 'U', 'A(n)', 'B(n)', 'Decisión'].forEach(function(h) {
        html += '<th style="' + _copTh() + '">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    pollStats.forEach(function(p) {
        var st = p.stats;
        if (!st) {
            html += '<tr>';
            html += '<td style="' + _copTd() + 'font-weight:600;text-align:left;padding-left:12px;">' + p.label + '</td>';
            html += '<td style="' + _copTd() + 'color:var(--muted);">' + p.validCount + '</td>';
            html += '<td colspan="6" style="' + _copTd() + 'color:var(--muted);font-size:11px;">';
            html += p.validCount === 0 ? 'Sin datos' : 'Faltan ' + (3 - p.validCount) + ' vehículo(s) para calcular';
            html += '</td></tr>';
            return;
        }

        html += '<tr>';
        html += '<td style="' + _copTd() + 'font-weight:600;text-align:left;padding-left:12px;">' + p.label + '</td>';
        html += '<td style="' + _copTd() + 'color:var(--muted);">' + st.n + '</td>';
        html += '<td style="' + _copTd() + '">' + copFmtVal(st.mean, p.isPn) + '</td>';
        html += '<td style="' + _copTd() + '">' + copFmtVal(st.s, p.isPn) + '</td>';
        html += '<td style="' + _copTd() + 'font-weight:700;">' + copFmtU(st.U) + '</td>';
        html += '<td style="' + _copTd() + 'color:var(--success);font-size:11px;">' + (st.cv ? st.cv.a.toFixed(3) : '—') + '</td>';
        html += '<td style="' + _copTd() + 'color:var(--danger);font-size:11px;">' + (st.cv ? st.cv.b.toFixed(3) : '—') + '</td>';
        html += '<td style="' + _copTd() + '">';
        html += '<span class="' + _copDecClass(st.decision) + '" style="padding:4px 12px;border-radius:var(--radius-sm);font-size:11px;font-weight:700;white-space:nowrap;">' +
                _copDecLabel(st.decision) + '</span>';
        html += '</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    html += '</div>'; // stats card

    // Veredicto de concordancia de la familia
    if (overallDecision) {
        var decLabel = {
            PASS:     '✓ Familia CONCORDANTE',
            FAIL:     '✗ Familia NO CONCORDANTE',
            CONTINUE: '⧗ Faltan VINes (ensayar más)',
        }[overallDecision];

        html += '<div class="card" style="margin-bottom:16px;border-color:' + _copDecBorderColor(overallDecision) +
                ';background:' + _copDecBgColor(overallDecision) + ';display:flex;align-items:center;gap:16px;flex-wrap:wrap;">';
        html += '<p class="label-title" data-help="cop-verdict-help" style="margin:0;white-space:nowrap;">CONCORDANCIA DE FAMILIA</p>';
        html += '<span class="' + _copDecClass(overallDecision) +
                '" style="padding:8px 20px;border-radius:var(--radius-md);font-size:15px;font-weight:800;letter-spacing:0.04em;">' +
                decLabel + '</span>';
        html += '<p class="label-title" style="margin:0 0 0 auto;white-space:nowrap;">n = ' +
                copState.vehicles.length + ' VIN(es)</p>';
        html += '</div>';

        // Toast único al cambiar a NO CONCORDANTE
        if (overallDecision === 'FAIL' && copState._lastDecision !== 'FAIL' && typeof showToast === 'function') {
            showToast('⚠ Familia NO CONCORDANTE', 'error');
        }
        copState._lastDecision = overallDecision;
    } else {
        html += '<div class="card" style="margin-bottom:16px;border-color:rgba(245,158,11,0.35);background:rgba(245,158,11,0.05);">';
        html += '<p class="label-title" style="margin:0;color:var(--warning);">⧗ Aún sin veredicto — captura al menos 3 VINes con valores por contaminante para calcular la concordancia.</p>';
        html += '</div>';
        copState._lastDecision = null;
    }

    return html;
}

// ─── HTML: PÁGINA COMPLETA (sub-pestañas Validador | Control SPC) ────────────
function copBuildHTML() {
    var html = '<div class="container" style="padding-top:20px;padding-bottom:20px;">';
    html += '<div style="display:flex;gap:8px;margin-bottom:16px;">';
    [['validator', '📋 Validador CoP'], ['spc', '📈 Control SPC']].forEach(function(t) {
        var active = (copState.view || 'validator') === t[0];
        html += '<button onclick="copSetView(\'' + t[0] + '\')" class="btn btn-sm ' + (active ? '' : 'btn-ghost') + '" ' +
                (active ? 'style="background:var(--accent-cop);color:#fff;"' : '') + '>' + t[1] + '</button>';
    });
    html += '</div>';
    html += (copState.view === 'spc') ? copBuildSpcHTML() : copBuildValidatorHTML();
    html += '</div>'; // container
    return html;
}

// ─── HTML: VISTA VALIDADOR ────────────────────────────────────────────────────
function copBuildValidatorHTML() {
    var limits = COP_FUEL_LIMITS[copState.fuelType] || COP_PI_LIMITS;
    var activeLimits = copGetActiveLimits();
    var n = copState.vehicles.length;

    var html = '';

    // ── Cabecera + Configuración ──────────────────────────────────────────────
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" data-help="cop-validator-help" style="border-bottom-color:var(--accent-cop);">📋 CoP Emissions Validator</div>';
    html += '<p class="label-title" style="margin-bottom:18px;">' +
            'Conformidad de Producción · Tipo 1 · Appendix 2 · Muestreo secuencial σ desconocida · Euro 6 · ' +
            copState.regulation + ' (' + (copState.regulation === 'R154' ? 'WLTP' : 'NEDC') + ')</p>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;">';

    // Reglamento
    html += '<div>';
    html += '<p class="label-title" style="margin-bottom:8px;">Reglamento</p>';
    html += '<div style="display:flex;gap:6px;">';
    ['R154', 'R83'].forEach(function(r) {
        var active = copState.regulation === r;
        html += '<button onclick="copSetRegulation(\'' + r + '\')" class="btn btn-sm ' +
                (active ? '' : 'btn-ghost') + '" ' +
                (active ? 'style="background:var(--accent-cop);color:#fff;"' : '') +
                '>' + r + '</button>';
    });
    html += '</div></div>';

    // Tipo de combustible
    html += '<div>';
    html += '<p class="label-title" style="margin-bottom:8px;">Tipo de Combustible</p>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    ['PI', 'CI', 'Híbrido PI', 'Híbrido CI'].forEach(function(f) {
        var active = copState.fuelType === f;
        html += '<button onclick="copSetFuel(\'' + f + '\')" class="btn btn-sm ' +
                (active ? '' : 'btn-ghost') + '" ' +
                (active ? 'style="background:var(--accent-cop);color:#fff;"' : '') +
                '>' + f + '</button>';
    });
    html += '</div></div>';

    // Contaminantes activos
    html += '<div>';
    html += '<p class="label-title" style="margin-bottom:8px;">Contaminantes Activos</p>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    limits.forEach(function(p) {
        var active = !!copState.activePolls[p.id];
        var label = p.label + (p.note ? ' <span style="font-size:9px;opacity:0.65;">(' + p.note + ')</span>' : '');
        html += '<button onclick="copTogglePoll(\'' + p.id + '\')" class="btn btn-sm ' +
                (active ? '' : 'btn-ghost') + '" ' +
                (active ? 'style="background:var(--accent-cop);color:#fff;"' : '') +
                '>' + label + '</button>';
    });
    html += '</div></div>';

    html += '</div>'; // config row
    html += '</div>'; // header card

    // ── Selección de familia (filtrable por región) ───────────────────────────
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" data-help="cop-family-help" style="border-bottom-color:var(--accent-cop);">👪 Familia a evaluar</div>';
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">';
    var _copRegs = copRegions();
    html += '<div><p class="label-title" style="margin-bottom:6px;">Región</p>';
    html += '<select onchange="copSetRegion(this.value)" style="padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);">';
    html += '<option value="">Todas</option>';
    _copRegs.forEach(function(r) { html += '<option value="' + _copEsc(r) + '" ' + (copState.region === r ? 'selected' : '') + '>' + _copEsc(r) + '</option>'; });
    html += '</select></div>';
    var _copFams = copFamilies().filter(function(f) { return !copState.region || f.regionsArr.indexOf(copState.region) !== -1; });
    html += '<div style="flex:1;min-width:260px;"><p class="label-title" style="margin-bottom:6px;">Familia (' + _copFams.length + ')</p>';
    html += '<select onchange="copSelectFamily(this.value)" style="width:100%;padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);">';
    html += '<option value="">— Selecciona una familia —</option>';
    _copFams.forEach(function(f) { html += '<option value="' + _copEsc(f.key) + '" ' + (copState.familyKey === f.key ? 'selected' : '') + '>' + _copEsc(f.label) + '</option>'; });
    html += '</select></div>';
    html += '</div>';
    if (!copPlanData().length) {
        html += '<p class="label-title" style="margin-top:10px;color:var(--warning);">Importa el plan de producción para listar familias. ' +
                '<button onclick="switchPlatform(\'testplan\');if(typeof tpSwitchTab===\'function\')tpSwitchTab(\'tp-production\');" class="btn btn-sm btn-ghost" style="font-size:10px;margin-left:6px;">📥 Ir a Producción →</button></p>';
    } else if (copState.familyLabel) {
        html += '<p class="label-title" style="margin-top:10px;color:var(--accent-cop);">Evaluando: ' + _copEsc(copState.familyLabel) + '</p>';
    }
    html += '</div>'; // family card

    // ── Tabla de datos de vehículos ───────────────────────────────────────────
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;' +
            'border-bottom:2px solid var(--accent-cop);padding-bottom:10px;">';
    html += '<span style="font-size:var(--font-base);font-weight:var(--weight-bold);color:var(--text);flex:1;">' +
            '🚗 Datos de Vehículos</span>';
    html += '<span class="label-title">' + n + ' VIN(es)</span>';
    html += '</div>';

    html += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
    html += '<button onclick="copAddManualRow()" class="btn btn-sm btn-ghost" style="color:var(--info);">➕ VIN manual</button>';
    html += '<button onclick="copClearData()" class="btn btn-sm btn-ghost">Limpiar valores</button>';
    html += '<button onclick="copSaveJudgment()" class="btn btn-sm" style="background:var(--accent-cop);color:#fff;margin-left:auto;">💾 Guardar juicio</button>';
    html += '</div>';

    if (activeLimits.length === 0) {
        html += '<p class="label-title" style="text-align:center;padding:20px;">Activa al menos un contaminante para introducir datos.</p>';
    } else {
        // Encabezado de límites por contaminante (columnas)
        html += '<div style="overflow-x:auto;">';
        html += '<table style="border-collapse:collapse;width:100%;min-width:520px;">';
        html += '<thead><tr style="background:var(--bg);">';
        html += '<th style="' + _copTh() + 'text-align:left;padding-left:14px;">VIN</th>';
        activeLimits.forEach(function(p) {
            html += '<th style="' + _copTh() + '">' + p.label +
                    '<br><span style="font-size:9px;font-weight:400;color:var(--muted);text-transform:none;">L=' + copFmtLimit(p.limit, p.isPn) + ' ' + p.unit + '</span></th>';
        });
        html += '<th style="' + _copTh() + '"></th>';
        html += '</tr></thead><tbody>';

        // Una fila por VIN
        copState.vehicles.forEach(function(v) {
            html += '<tr>';
            html += '<td style="' + _copTd() + 'text-align:left;padding-left:10px;">';
            html += '<input type="text" value="' + _copEsc(v.vin || '') + '" data-vid="' + v.id + '" ' +
                    'oninput="copSetVin(this)" placeholder="VIN" ' + (v.source === 'auto' ? 'title="Auto desde vehículo probado" ' : '') +
                    'style="width:170px;padding:6px 8px;font-size:11px;box-sizing:border-box;font-family:monospace;' +
                    (v.source === 'auto' ? 'border-left:3px solid var(--accent-cop);' : '') + '" />';
            html += '</td>';
            activeLimits.forEach(function(p) {
                html += '<td style="' + _copTd() + 'padding:6px 8px;">';
                html += '<input type="number" step="any" placeholder="—" ';
                html += 'value="' + (v.values[p.id] !== undefined ? v.values[p.id] : '') + '" ';
                html += 'data-vid="' + v.id + '" data-pid="' + p.id + '" ';
                html += 'oninput="copHandleInput(this)" ';
                html += 'style="width:90px;padding:6px 8px;font-size:12px;text-align:right;box-sizing:border-box;font-family:monospace;" />';
                html += '</td>';
            });
            html += '<td style="' + _copTd() + 'padding:4px;"><button onclick="copRemoveRow(' + v.id + ')" class="btn btn-sm btn-ghost" title="Quitar VIN" style="padding:2px 8px;">✕</button></td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>'; // overflow-x
        html += '<p class="label-title" style="margin-top:10px;font-size:10px;color:var(--muted);">Los VINes marcados en azul se autollenaron desde vehículos probados de la familia; captura/edita los gases. El veredicto se recalcula en vivo (requiere ≥3 VINes con valor por contaminante).</p>';
    }
    html += '</div>'; // data card

    // ── Análisis estadístico + decisión global ────────────────────────────────
    html += '<div id="cop-stats-section">' + copBuildStatsHTML() + '</div>';

    // ── Tabla de valores críticos A(n)/B(n) ───────────────────────────────────
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div style="display:flex;align-items:center;cursor:pointer;" onclick="copToggleTable()">';
    html += '<span style="font-size:var(--font-base);font-weight:var(--weight-bold);color:var(--text);flex:1;">' +
            '📊 Tabla Valores Críticos A(n)/B(n)</span>';
    html += '<span id="cop-cv-chevron" style="color:var(--muted);font-size:14px;">' +
            (copState.showTable ? '▾' : '▸') + '</span>';
    html += '</div>';

    html += '<div id="cop-cv-table-body" style="' + (copState.showTable ? '' : 'display:none;') + 'margin-top:14px;overflow-x:auto;">';
    html += '<table style="border-collapse:collapse;min-width:200px;">';
    html += '<thead><tr style="background:var(--bg);">';
    ['n', 'A(n)', 'B(n)'].forEach(function(h) {
        html += '<th style="' + _copTh() + 'min-width:70px;">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';
    Object.entries(COP_CV).forEach(function(entry) {
        var nVal = parseInt(entry[0]);
        var vals = entry[1];
        var isCurrent = nVal === n;
        html += '<tr style="' + (isCurrent ? 'background:rgba(8,145,178,0.08);font-weight:700;' : '') + '">';
        html += '<td style="' + _copTd() + (isCurrent ? 'color:var(--accent-cop);' : 'color:var(--muted);') + '">' + nVal + '</td>';
        html += '<td style="' + _copTd() + 'color:var(--success);' + (isCurrent ? '' : 'opacity:0.55;') + '">' + vals.a.toFixed(3) + '</td>';
        html += '<td style="' + _copTd() + 'color:var(--danger);' + (isCurrent ? '' : 'opacity:0.55;') + '">' + vals.b.toFixed(3) + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table>';
    html += '</div>'; // table body
    html += '</div>'; // cv card

    // ── Juicios guardados ──────────────────────────────────────────────────────
    if (copState.saved && copState.saved.length) {
        html += '<div class="card" style="margin-bottom:16px;">';
        html += '<div class="card-title" style="border-bottom-color:var(--accent-cop);">💾 Juicios guardados (' + copState.saved.length + ')</div>';
        copState.saved.forEach(function(r) {
            var decTxt = r.decision === 'PASS' ? 'CONCORDANTE' : r.decision === 'FAIL' ? 'NO CONCORDANTE' : r.decision === 'CONTINUE' ? 'INCOMPLETO' : r.decision;
            html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--border);">';
            html += '<span style="font-size:10px;color:var(--muted);min-width:74px;">' + new Date(r.date).toLocaleDateString('es-MX') + '</span>';
            html += '<span style="flex:1;min-width:160px;font-size:11px;color:var(--text);">' + _copEsc(r.familyLabel || '(sin familia)') + ' · ' + r.fuelType + ' · ' + r.regulation + '</span>';
            html += '<span class="' + _copDecClass(r.decision) + '" style="padding:3px 10px;border-radius:var(--radius-sm);font-size:10px;font-weight:700;">' + decTxt + '</span>';
            html += '<button onclick="copLoadJudgment(\'' + r.id + '\')" class="btn btn-sm btn-ghost" style="font-size:10px;">Cargar</button>';
            html += '<button onclick="copDeleteJudgment(\'' + r.id + '\')" class="btn btn-sm btn-ghost" style="font-size:10px;" title="Borrar">✕</button>';
            html += '</div>';
        });
        html += '</div>';
    }

    // ── Disclaimer regulatorio ─────────────────────────────────────────────────
    html += '<div class="card" style="margin-bottom:16px;background:rgba(245,158,11,0.04);' +
            'border-color:rgba(245,158,11,0.25);">';
    html += '<p class="label-title" style="color:var(--warning);margin-bottom:6px;">⚠ Advertencia Regulatoria</p>';
    html += '<p style="font-size:12px;color:var(--muted);line-height:1.7;">' +
            'Los valores A(n)/B(n) son de referencia basados en R83 Rev.5 / R154 Appendix 2. ' +
            'Verificar contra el texto oficial del reglamento antes de uso en homologación real. ' +
            'Límites Euro 6 — mismos valores para R154 (WLTP) y R83 (NEDC). ' +
            'Decisión por contaminante independiente · Serie FAIL si cualquier contaminante FAIL.' +
            '</p>';
    html += '</div>';

    return html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROL SPC — Carta I-MR por familia × gas (adaptado del tablero VETS del
// laboratorio hermano). Serie = valores FINALES verificados por vehículo liberado
// (gasResults.aprobador, fallback liberador), ordenados por fecha de captura.
// σ estimada del rango móvil (MR̄/1.128); reglas de alarma Nelson R1/R2/R3;
// Cpk = (Límite − media)/(3σ) con n≥8. CO2 se grafica para vigilancia pero no alarma.
// ═══════════════════════════════════════════════════════════════════════════════
var COP_SPC_MIN = 4;      // n mínimo para límites de control y alarmas
var COP_SPC_RELIABLE = 8; // n para límites confiables y Cpk
var COP_SPC_RULES = { R1: 'Fuera de ±3σ', R2: 'Corrimiento (8 de un lado)', R3: 'Tendencia (6 en fila)' };

function _copSpcDate(v) {
    var gr = v && v.testData && v.testData.gasResults;
    if (!gr) return '';
    var rec = (gr.aprobador && gr.aprobador.values) ? gr.aprobador
            : (gr.liberador && gr.liberador.values) ? gr.liberador : null;
    return (rec && rec.capturedAt) || '';
}

function _copSpcFmt(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    if (dec !== undefined) return Number(v).toFixed(dec);
    var a = Math.abs(v);
    return Number(v).toFixed(a >= 100 ? 1 : a >= 1 ? 2 : 4);
}

// Familias con datos: agrupa db.vehicles con gases finales por copVehicleFamilyKey.
// Excluye familias con Modelo/Motor/Regulación vacíos (equivale a excluir OTHER/(sin dato)).
function copSpcFamilies() {
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var fams = {};
    vehicles.forEach(function(v) {
        var values = _copFinalGasValues(v);
        if (!values) return;
        var cfg = v.config || {};
        var mod = cfg['Modelo'], eng = cfg['ENGINE CAPACITY'], reg = cfg['EMISSION REGULATION'];
        if (!mod || !eng || !reg) return;
        var key = copVehicleFamilyKey(v);
        if (!fams[key]) {
            fams[key] = {
                key: key,
                label: [mod, eng, cfg['TRANSMISSION'], cfg['MODEL YEAR (VIN)'], reg].filter(Boolean).join(' · '),
                regName: (typeof _libGetVehicleRegulation === 'function') ? _libGetVehicleRegulation(v) : reg,
                tests: []
            };
        }
        fams[key].tests.push({ vin: v.vin || '(sin VIN)', date: _copSpcDate(v), values: values });
    });
    return Object.keys(fams).map(function(k) {
        var f = fams[k];
        f.tests.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
        f.n = f.tests.length;
        return f;
    }).sort(function(a, b) { return (b.n - a.n) || (a.label < b.label ? -1 : 1); });
}

// Gases de la familia según su perfil de regulación: [{field,label,unit,limit}]
function copSpcGases(fam) {
    if (!fam) return [];
    var prof = (typeof getRegulationProfile === 'function') ? getRegulationProfile(fam.regName) : null;
    if (prof && prof.gases && prof.gases.length) return prof.gases;
    // Fallback: campos presentes en los datos, sin límite conocido
    var fields = {};
    fam.tests.forEach(function(t) { Object.keys(t.values || {}).forEach(function(f) { fields[f] = true; }); });
    return Object.keys(fields).map(function(f) { return { field: f, label: f, unit: '', limit: null }; });
}

// Serie temporal de un gas en una familia: [{vin,date,v}]
function copSpcSeries(fam, gasField) {
    var pts = [];
    (fam ? fam.tests : []).forEach(function(t) {
        var v = _copNum(t.values[gasField]);
        if (v !== null) pts.push({ vin: t.vin, date: t.date, v: v });
    });
    return pts;
}

// Estadística I-MR: media, MR̄, σ=MR̄/1.128, UCL/LCL=media±3σ, MR-UCL=3.267·MR̄, Cpk.
function copSpcStats(vals, limit) {
    var n = vals.length;
    if (!n) return null;
    var mean = vals.reduce(function(a, b) { return a + b; }, 0) / n;
    var mrs = [];
    for (var i = 1; i < n; i++) mrs.push(Math.abs(vals[i] - vals[i - 1]));
    var mrbar = mrs.length ? mrs.reduce(function(a, b) { return a + b; }, 0) / mrs.length : 0;
    var sigma = mrbar / 1.128;
    var lim = (limit !== null && limit !== undefined) ? limit : null;
    var cpk = (sigma > 0 && lim !== null) ? (lim - mean) / (3 * sigma) : null;
    return {
        n: n, mean: mean, sigma: sigma, mrbar: mrbar,
        ucl: mean + 3 * sigma, lcl: Math.max(0, mean - 3 * sigma), lclRaw: mean - 3 * sigma,
        mrucl: 3.267 * mrbar, lim: lim, cpk: cpk, vals: vals, mrs: mrs
    };
}

// Reglas de Nelson: R1 punto fuera de ±3σ · R2 8 seguidos del mismo lado ·
// R3 6 en fila monótonos. Devuelve array de arrays de códigos por punto.
function copSpcFlags(st) {
    var v = st.vals;
    var fl = v.map(function() { return []; });
    if (st.sigma > 0 && st.n >= COP_SPC_MIN) {
        v.forEach(function(x, i) { if (x > st.ucl || x < st.lclRaw) fl[i].push('R1'); });
        var run = 0, side = 0, i, j, s;
        for (i = 0; i < v.length; i++) {
            s = v[i] > st.mean ? 1 : (v[i] < st.mean ? -1 : 0);
            if (s !== 0 && s === side) run++; else { run = s !== 0 ? 1 : 0; side = s; }
            if (run >= 8) for (j = i - 7; j <= i; j++) fl[j].push('R2');
        }
        var inc = 1, dec = 1;
        for (i = 1; i < v.length; i++) {
            inc = v[i] > v[i - 1] ? inc + 1 : 1;
            dec = v[i] < v[i - 1] ? dec + 1 : 1;
            if (inc >= 6) for (j = i - 5; j <= i; j++) fl[j].push('R3');
            if (dec >= 6) for (j = i - 5; j <= i; j++) fl[j].push('R3');
        }
    }
    return fl;
}

// Escaneo de alarmas en todas las familias con n≥4 (gases ≠ CO2). Lo consume
// también el Panel (alertas del laboratorio).
function copSpcScanAlarms() {
    var out = [];
    copSpcFamilies().filter(function(f) { return f.n >= COP_SPC_MIN; }).forEach(function(f) {
        copSpcGases(f).forEach(function(g) {
            if (g.field === 'CO2') return;
            var pts = copSpcSeries(f, g.field);
            var st = copSpcStats(pts.map(function(p) { return p.v; }), g.limit);
            if (!st || st.n < COP_SPC_MIN) return;
            var fl = copSpcFlags(st);
            var idx = [];
            fl.forEach(function(a, i) { if (a.length) idx.push(i); });
            if (idx.length) {
                var last = idx[idx.length - 1];
                out.push({
                    famKey: f.key, famLabel: f.label, gas: g.field, gasLabel: g.label,
                    rule: fl[last][0], val: pts[last].v, date: pts[last].date, unit: g.unit || ''
                });
            }
        });
    });
    return out;
}

// ─── SPC: manejadores ─────────────────────────────────────────────────────────
function copSpcSelectFamily(key) { copState.spc.familyKey = key; copPersist(); copRender(); }
function copSpcSelectGas(f) { copState.spc.gas = f; copPersist(); copRender(); }
function copSpcToggle(opt, el) { copState.spc[opt] = !!(el && el.checked); copPersist(); copRender(); }
function copSpcGotoAlarm(famKey, gas) {
    copState.spc.familyKey = famKey;
    copState.spc.gas = gas;
    copPersist();
    copRender();
    var chart = document.getElementById('cop-spc-ichart-wrapper');
    if (chart && chart.scrollIntoView) chart.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Resuelve familia y gas seleccionados (con defaults sensatos).
function _copSpcSelection() {
    var fams = copSpcFamilies();
    if (!fams.length) return { fams: fams, fam: null, gases: [], gas: null };
    var fam = fams.find(function(f) { return f.key === copState.spc.familyKey; }) || fams[0];
    var gases = copSpcGases(fam);
    var gas = gases.find(function(g) { return g.field === copState.spc.gas; }) || gases[0] || null;
    return { fams: fams, fam: fam, gases: gases, gas: gas };
}

// ─── SPC: HTML ────────────────────────────────────────────────────────────────
function copBuildSpcHTML() {
    var sel = _copSpcSelection();
    var html = '';

    // Panel de alarmas (retráctil)
    var alarms = copSpcScanAlarms();
    html += '<details class="card" style="margin-bottom:16px;" ' + (alarms.length ? 'open' : '') + '>';
    html += '<summary data-help="cop-spc-alarms-help" style="cursor:pointer;display:flex;align-items:center;gap:10px;font-weight:var(--weight-bold);color:var(--text);">' +
            '🚨 Alarmas de control de proceso ' +
            '<span class="badge ' + (alarms.length ? 'badge-danger' : 'badge-success') + '" style="padding:3px 10px;border-radius:var(--radius-sm);font-size:11px;">' +
            (alarms.length ? alarms.length + ' alarma(s)' : 'sin alarmas') + '</span></summary>';
    html += '<div style="margin-top:12px;">';
    if (!alarms.length) {
        html += '<p class="label-title" style="margin:0;">Las familias con datos suficientes (n≥' + COP_SPC_MIN + ') están bajo control estadístico.</p>';
    } else {
        alarms.forEach(function(a) {
            html += '<div onclick="copSpcGotoAlarm(\'' + _copEsc(a.famKey).replace(/'/g, '&#39;') + '\',\'' + _copEsc(a.gas) + '\')" ' +
                    'role="button" tabindex="0" aria-label="Ver carta de ' + _copEsc(a.gasLabel) + ' de ' + _copEsc(a.famLabel) + '" ' +
                    'style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 10px;margin-bottom:6px;cursor:pointer;' +
                    'border:1px solid rgba(239,68,68,0.35);border-radius:var(--radius-sm);background:rgba(239,68,68,0.05);">';
            html += '<span class="badge badge-danger" style="padding:2px 8px;border-radius:var(--radius-sm);font-size:10px;font-weight:800;">' + a.rule + '</span>';
            html += '<b style="font-size:12px;">' + _copEsc(a.gasLabel) + '</b>';
            html += '<span style="font-size:12px;color:var(--text);">' + _copEsc(a.famLabel) + '</span>';
            html += '<span style="margin-left:auto;font-size:11px;color:var(--muted);">' + COP_SPC_RULES[a.rule] +
                    ' · último ' + _copSpcFmt(a.val) + ' ' + _copEsc(a.unit) + (a.date ? ' · ' + a.date.slice(0, 10) : '') + '</span>';
            html += '</div>';
        });
    }
    html += '</div></details>';

    // Selección familia + gas + toggles
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" data-help="cop-spc-help" style="border-bottom-color:var(--accent-cop);">📈 Carta de control I-MR por familia × gas</div>';
    if (!sel.fams.length) {
        html += '<p class="label-title" style="margin:0;color:var(--warning);">Aún no hay vehículos liberados con gases capturados. ' +
                'Conforme se aprueben liberaciones con valores por gas, las familias aparecerán aquí. ' +
                '<button onclick="switchPlatform(\'cop15\');setTimeout(function(){var t=document.querySelector(\'.tab[data-tab=liberacion]\');if(t)t.click();},150);" class="btn btn-sm btn-ghost" style="font-size:10px;margin-left:6px;">🔬 Ir a Liberación →</button></p>';
        html += '</div>';
        return html;
    }
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">';
    html += '<div style="flex:1;min-width:260px;"><p class="label-title" style="margin-bottom:6px;">Familia (' + sel.fams.length + ')</p>';
    html += '<select onchange="copSpcSelectFamily(this.value)" style="width:100%;padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);">';
    sel.fams.forEach(function(f) {
        html += '<option value="' + _copEsc(f.key) + '" ' + (sel.fam && f.key === sel.fam.key ? 'selected' : '') + '>' +
                _copEsc(f.label) + ' (' + f.n + ' ensayo' + (f.n === 1 ? '' : 's') + ')</option>';
    });
    html += '</select></div>';
    html += '<div><p class="label-title" style="margin-bottom:6px;">Gas</p><div style="display:flex;gap:6px;flex-wrap:wrap;">';
    sel.gases.forEach(function(g) {
        var active = sel.gas && g.field === sel.gas.field;
        html += '<button onclick="copSpcSelectGas(\'' + _copEsc(g.field) + '\')" class="btn btn-sm ' + (active ? '' : 'btn-ghost') + '" ' +
                (active ? 'style="background:var(--accent-cop);color:#fff;"' : '') + '>' + _copEsc(g.label) + '</button>';
    });
    html += '</div></div>';
    html += '</div>';

    var hasLimit = !!(sel.gas && sel.gas.limit !== null && sel.gas.limit !== undefined);
    html += '<div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:4px;">';
    [['showZones', 'Zonas σ', true], ['showLimit', 'Límite regulatorio', hasLimit], ['pctMode', '% del límite', hasLimit]].forEach(function(t) {
        html += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:' + (t[2] ? 'var(--text)' : 'var(--muted)') + ';cursor:pointer;">' +
                '<input type="checkbox" onchange="copSpcToggle(\'' + t[0] + '\', this)" ' +
                (copState.spc[t[0]] ? 'checked' : '') + (t[2] ? '' : ' disabled') + '> ' + t[1] + '</label>';
    });
    html += '</div>';

    // Serie + estadística
    var pts = copSpcSeries(sel.fam, sel.gas ? sel.gas.field : '');
    var st = pts.length ? copSpcStats(pts.map(function(p) { return p.v; }), sel.gas ? sel.gas.limit : null) : null;
    var unit = sel.gas ? (sel.gas.unit || '') : '';

    if (!st) {
        html += '<p class="label-title" style="margin-top:12px;">Sin datos para este gas en la familia seleccionada.</p>';
        html += '</div>';
        return html;
    }

    var noCtl = st.n < COP_SPC_MIN;
    var prelim = st.n < COP_SPC_RELIABLE;
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--text);">';
    html += '<span>n = <b>' + st.n + '</b></span>';
    html += '<span>media <b>' + _copSpcFmt(st.mean) + '</b> ' + _copEsc(unit) + '</span>';
    html += '<span>σ <b>' + _copSpcFmt(st.sigma) + '</b></span>';
    if (noCtl) {
        html += '<span style="color:var(--warning);">⚠ &lt;' + COP_SPC_MIN + ' ensayos: sin límites de control</span>';
    } else {
        html += '<span>UCL <b>' + _copSpcFmt(st.ucl) + '</b></span><span>LCL <b>' + _copSpcFmt(st.lcl) + '</b></span>';
        if (st.cpk !== null && st.n >= COP_SPC_RELIABLE) {
            var cpkColor = st.cpk >= 1.33 ? 'var(--success)' : st.cpk >= 1.0 ? 'var(--warning)' : 'var(--danger)';
            html += '<span>Cpk <b style="color:' + cpkColor + ';">' + _copSpcFmt(st.cpk, 2) + '</b></span>';
        }
        if (prelim) html += '<span style="color:var(--warning);">límites preliminares (&lt;' + COP_SPC_RELIABLE + ')</span>';
    }
    html += '</div>';

    html += '<div id="cop-spc-ichart-wrapper" style="margin-top:14px;height:300px;position:relative;"><canvas id="cop-spc-ichart"></canvas></div>';
    html += '</div>'; // card carta I

    // Carta MR
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" style="border-bottom-color:var(--accent-cop);">📉 Carta de rangos móviles (MR)</div>';
    if (st.mrs.length < 1) {
        html += '<p class="label-title" style="margin:0;">Se necesitan ≥2 ensayos.</p>';
    } else {
        html += '<div id="cop-spc-mrchart-wrapper" style="height:200px;position:relative;"><canvas id="cop-spc-mrchart"></canvas></div>';
    }
    html += '</div>';

    // Ayuda
    html += '<details class="card" style="margin-bottom:16px;">';
    html += '<summary style="cursor:pointer;font-weight:var(--weight-bold);color:var(--text);">ℹ️ Cómo leer estas cartas</summary>';
    html += '<div style="font-size:12px;color:var(--muted);line-height:1.7;margin-top:10px;">';
    html += '<p><b>Carta de individuos (I-MR):</b> cada ensayo es una medición única por familia. La línea central es la media histórica de esa familia para el gas elegido; UCL/LCL son media ± 3σ, con σ estimada del rango móvil (MR̄/1.128). Son los <b>límites de control del proceso</b>, distintos del límite regulatorio (línea ámbar).</p>';
    html += '<p><b>Reglas de alarma (Nelson):</b> R1 = punto fuera de ±3σ (rojo); R2 = 8 puntos seguidos del mismo lado de la media (corrimiento); R3 = 6 puntos en fila subiendo o bajando (tendencia). Cualquiera dispara la alarma de la familia.</p>';
    html += '<p><b>Cpk:</b> capacidad del proceso frente al límite regulatorio = (Límite − media) / 3σ. Cpk ≥ 1.33 se considera capaz; &lt; 1.0 indica resultados demasiado cerca (o por encima) del límite. Se calcula con ≥ ' + COP_SPC_RELIABLE + ' ensayos.</p>';
    html += '<p><b>Umbrales:</b> n&lt;' + COP_SPC_MIN + ' → datos insuficientes; ' + COP_SPC_MIN + '–' + (COP_SPC_RELIABLE - 1) + ' → límites preliminares; ≥' + COP_SPC_RELIABLE + ' → confiables. CO2 se grafica para vigilancia pero no genera alarmas (no tiene límite).</p>';
    html += '</div></details>';

    return html;
}

// ─── SPC: charts (Chart.js, convención del proyecto) ─────────────────────────
function _copSpcDestroyCharts() {
    if (window._copSpcIChart) { try { window._copSpcIChart.destroy(); } catch (e) {} window._copSpcIChart = null; }
    if (window._copSpcMrChart) { try { window._copSpcMrChart.destroy(); } catch (e) {} window._copSpcMrChart = null; }
}

function copSpcRenderCharts() {
    _copSpcDestroyCharts();
    if (typeof Chart === 'undefined') return;
    var sel = _copSpcSelection();
    if (!sel.fam || !sel.gas) return;
    var pts = copSpcSeries(sel.fam, sel.gas.field);
    if (!pts.length) return;
    var st = copSpcStats(pts.map(function(p) { return p.v; }), sel.gas.limit);
    var flags = copSpcFlags(st);
    var unit = sel.gas.unit || '';
    var noCtl = st.n < COP_SPC_MIN;
    var hasLimit = st.lim !== null;
    var pct = !!(copState.spc.pctMode && hasLimit && st.lim > 0);
    var scale = pct ? (100 / st.lim) : 1;
    var dispUnit = pct ? '% del límite' : unit;

    var labels = pts.map(function(p) { return p.date ? p.date.slice(0, 10) : ''; });
    var pointColors = flags.map(function(f) {
        return f.indexOf('R1') !== -1 ? '#ef4444' : f.length ? '#f59e0b' : '#10b981';
    });
    var constLine = function(v, color, dashed, label, width) {
        return {
            label: label, data: pts.map(function() { return v * scale; }),
            borderColor: color, borderWidth: width || 1.4, borderDash: dashed ? [6, 4] : [],
            pointRadius: 0, pointHitRadius: 0, fill: false, tension: 0, order: 2
        };
    };
    var datasets = [{
        label: sel.gas.label, data: pts.map(function(p) { return p.v * scale; }),
        borderColor: 'rgba(8,145,178,0.55)', borderWidth: 1.6, tension: 0, fill: false,
        pointBackgroundColor: pointColors, pointBorderColor: pointColors,
        pointRadius: flags.map(function(f) { return f.length ? 5.5 : 4; }), order: 1
    }];
    datasets.push(constLine(st.mean, '#0891b2', false, 'media'));
    if (!noCtl) {
        datasets.push(constLine(st.ucl, '#ef4444', true, 'UCL'));
        if (st.lclRaw > 0) datasets.push(constLine(st.lcl, '#ef4444', true, 'LCL'));
        if (copState.spc.showZones && st.sigma > 0) {
            [1, 2, -1, -2].forEach(function(k) {
                var z = st.mean + k * st.sigma;
                if (z > 0) datasets.push(constLine(z, 'rgba(245,158,11,0.35)', true, (k > 0 ? '+' : '') + k + 'σ', 1));
            });
        }
    }
    if (copState.spc.showLimit && hasLimit) datasets.push(constLine(st.lim, '#f59e0b', true, 'Límite', 1.8));

    var iCanvas = document.getElementById('cop-spc-ichart');
    if (iCanvas) {
        window._copSpcIChart = new Chart(iCanvas, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { intersect: false, mode: 'nearest' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        filter: function(item) { return item.datasetIndex === 0; },
                        callbacks: {
                            title: function(items) {
                                var p = pts[items[0].dataIndex];
                                return (p.date ? p.date.slice(0, 10) + ' · ' : '') + p.vin;
                            },
                            label: function(item) {
                                return sel.gas.label + ' = ' + _copSpcFmt(item.parsed.y) + ' ' + dispUnit;
                            },
                            footer: function(items) {
                                var f = flags[items[0].dataIndex] || [];
                                return f.length ? '⚠ ' + f.map(function(x) { return COP_SPC_RULES[x]; }).join(', ') : 'en control';
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
                    y: { title: { display: !!dispUnit, text: dispUnit, font: { size: 10 } }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    // Carta MR
    var mrCanvas = document.getElementById('cop-spc-mrchart');
    if (mrCanvas && st.mrs.length) {
        var mrLabels = st.mrs.map(function(_, i) { return (i + 1) + '→' + (i + 2); });
        var mrColors = st.mrs.map(function(v) { return (!noCtl && v > st.mrucl) ? '#ef4444' : '#10b981'; });
        var mrDatasets = [{
            label: 'MR', data: st.mrs.map(function(v) { return v * scale; }),
            borderColor: 'rgba(8,145,178,0.55)', borderWidth: 1.6, tension: 0, fill: false,
            pointBackgroundColor: mrColors, pointBorderColor: mrColors, pointRadius: 4, order: 1
        }];
        if (!noCtl) {
            mrDatasets.push({ label: 'MR-UCL', data: st.mrs.map(function() { return st.mrucl * scale; }),
                borderColor: '#ef4444', borderWidth: 1.4, borderDash: [6, 4], pointRadius: 0, fill: false, tension: 0, order: 2 });
            mrDatasets.push({ label: 'MR̄', data: st.mrs.map(function() { return st.mrbar * scale; }),
                borderColor: '#0891b2', borderWidth: 1.2, pointRadius: 0, fill: false, tension: 0, order: 2 });
        }
        window._copSpcMrChart = new Chart(mrCanvas, {
            type: 'line',
            data: { labels: mrLabels, datasets: mrDatasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        filter: function(item) { return item.datasetIndex === 0; },
                        callbacks: {
                            label: function(item) {
                                var over = !noCtl && st.mrs[item.dataIndex] > st.mrucl;
                                return 'MR = ' + _copSpcFmt(item.parsed.y) + ' ' + dispUnit + (over ? ' · ⚠ salto anómalo' : '');
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { font: { size: 10 }, maxTicksLimit: 10 }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { font: { size: 10 } } }
                }
            }
        });
    }
}

// ══════════════════════════════════════════════════
// v16.0: Ayuda — banners de pestaña y tooltips de campo
// ══════════════════════════════════════════════════
if (typeof HELP_TABS !== 'undefined') Object.assign(HELP_TABS, {
    'cop-validator': { title: 'Validador CoP', text: 'Valida la conformidad de producción de una familia: elige región y familia, la tabla se llena con los VINes ya probados, y el veredicto CONCORDANTE se calcula en vivo (muestreo secuencial, mínimo 3 VINes).', tips: [
        'Los VINes en azul se autollenaron desde vehículos ya probados; captura/edita los gases que falten.',
        'Necesitas al menos 3 VINes con valor por contaminante para obtener un veredicto.',
        'Guarda el juicio con 💾 para dejar constancia auditable de la evaluación.'
    ]},
    'cop-spc': { title: 'Control SPC', text: 'Carta de control I-MR por familia y gas: detecta corrimientos y tendencias (reglas de Nelson) ANTES de fallar un límite. Cpk = margen del proceso contra el límite.', tips: [
        'Las alarmas se disparan con datos de ≥4 ensayos por familia/gas.',
        'Un punto rojo = fuera de ±3σ (R1); ámbar = corrimiento o tendencia (R2/R3).',
        'Cpk ≥ 1.33 es un proceso capaz; < 1.0 significa que los resultados están muy cerca del límite.'
    ]}
});
if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'cop-validator-help': { title: 'Validador CoP Tipo 1', text: 'Evalúa si una familia de vehículos es CONCORDANTE con el límite regulatorio, usando muestreo secuencial (Appendix 2 / R83-R154). No requiere un número fijo de VINes: sigue agregando hasta que el estadístico U cruce A(n) o B(n).' },
    'cop-family-help': { title: 'Familia a evaluar', text: 'Elige primero la región (opcional, filtra la lista) y luego la familia de emisiones. Las familias vienen del plan de producción importado en Plan → Producción.' },
    'cop-verdict-help': { title: 'Concordancia de familia', text: 'PASS = la familia es CONCORDANTE con el límite (puedes dejar de ensayar); FAIL = NO CONCORDANTE (algún contaminante superó B(n)); CONTINUAR = aún faltan datos para decidir, agrega más VINes.' },
    'cop-spc-alarms-help': { title: 'Alarmas de control', text: 'Lista las combinaciones familia×gas que dispararon una regla de Nelson (R1/R2/R3) con los datos más recientes. Toca una alarma para ir directo a su carta.' },
    'cop-spc-help': { title: 'Selección de carta', text: 'Elige la familia y el gas para ver su carta de control I-MR. Los toggles cambian qué líneas de referencia se muestran (zonas σ, límite regulatorio, % del límite).' }
});
