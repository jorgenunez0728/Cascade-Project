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
var copState = {
    regulation:    'R154',
    fuelType:      'PI',
    activePolls:   null,
    vehicles:      null,
    showTable:     false,
    showFormula:   false,
    _lastDecision: null,
};

function copInitState() {
    if (!copState.activePolls) {
        copState.activePolls = {};
        COP_PI_LIMITS.forEach(function(p) { copState.activePolls[p.id] = p.active; });
    }
    if (!copState.vehicles) {
        copState.vehicles = [
            { id: 1, values: {} },
            { id: 2, values: {} },
            { id: 3, values: {} },
        ];
    }
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
    copRender();
}

function copSetFuel(fuel) {
    copState.fuelType = fuel;
    var newLimits = COP_FUEL_LIMITS[fuel] || COP_PI_LIMITS;
    copState.activePolls = {};
    newLimits.forEach(function(p) { copState.activePolls[p.id] = p.active; });
    copState.vehicles = copState.vehicles.map(function(v) { return { id: v.id, values: {} }; });
    copState._lastDecision = null;
    copRender();
}

function copTogglePoll(pollId) {
    copState.activePolls[pollId] = !copState.activePolls[pollId];
    copRender();
}

function copHandleInput(el) {
    var vid = parseInt(el.dataset.vid);
    var pid = el.dataset.pid;
    var vehicle = copState.vehicles.find(function(v) { return v.id === vid; });
    if (vehicle) vehicle.values[pid] = el.value;
    copRenderStats();
}

function copAddVehicle() {
    if (copState.vehicles.length < 20) {
        copState.vehicles.push({ id: copState.vehicles.length + 1, values: {} });
        copRender();
    }
}

function copRemoveVehicle() {
    if (copState.vehicles.length > 3) {
        copState.vehicles = copState.vehicles.slice(0, -1);
        copRender();
    }
}

function copClearData() {
    copState.vehicles = copState.vehicles.map(function(v) { return { id: v.id, values: {} }; });
    copState._lastDecision = null;
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

    // Decisión global
    if (overallDecision) {
        var decLabel = {
            PASS:     '✓ Serie Conforme',
            FAIL:     '✗ Serie No Conforme',
            CONTINUE: '⧗ Ensayar Vehículo Adicional',
        }[overallDecision];

        html += '<div class="card" style="margin-bottom:16px;border-color:' + _copDecBorderColor(overallDecision) +
                ';background:' + _copDecBgColor(overallDecision) + ';display:flex;align-items:center;gap:16px;flex-wrap:wrap;">';
        html += '<p class="label-title" style="margin:0;white-space:nowrap;">DECISIÓN GLOBAL</p>';
        html += '<span class="' + _copDecClass(overallDecision) +
                '" style="padding:8px 20px;border-radius:var(--radius-md);font-size:15px;font-weight:800;letter-spacing:0.04em;">' +
                decLabel + '</span>';
        html += '<p class="label-title" style="margin:0 0 0 auto;white-space:nowrap;">n = ' +
                copState.vehicles.length + ' / 20</p>';
        html += '</div>';

        // Toast único al cambiar a FAIL
        if (overallDecision === 'FAIL' && copState._lastDecision !== 'FAIL' && typeof showToast === 'function') {
            showToast('⚠ Decisión FAIL: la serie no es conforme', 'error');
        }
        copState._lastDecision = overallDecision;
    } else {
        copState._lastDecision = null;
    }

    return html;
}

// ─── HTML: PÁGINA COMPLETA ────────────────────────────────────────────────────
function copBuildHTML() {
    var limits = COP_FUEL_LIMITS[copState.fuelType] || COP_PI_LIMITS;
    var activeLimits = copGetActiveLimits();
    var n = copState.vehicles.length;

    var html = '<div class="container" style="padding-top:20px;padding-bottom:20px;">';

    // ── Cabecera + Configuración ──────────────────────────────────────────────
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" style="border-bottom-color:var(--accent-cop);">📋 CoP Emissions Validator</div>';
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

    // ── Tabla de datos de vehículos ───────────────────────────────────────────
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;' +
            'border-bottom:2px solid var(--accent-cop);padding-bottom:10px;">';
    html += '<span style="font-size:var(--font-base);font-weight:var(--weight-bold);color:var(--text);flex:1;">' +
            '🚗 Datos de Vehículos</span>';
    html += '<span class="label-title">' + n + ' / 20 máx.</span>';
    html += '</div>';

    html += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
    html += '<button onclick="copAddVehicle()" class="btn btn-sm btn-ghost" ' +
            (n >= 20 ? 'disabled style="opacity:0.4;"' : '') +
            ' style="color:var(--info);">+ Vehículo</button>';
    html += '<button onclick="copRemoveVehicle()" class="btn btn-sm btn-ghost" ' +
            (n <= 3 ? 'disabled style="opacity:0.4;"' : '') + '>− Quitar</button>';
    html += '<button onclick="copClearData()" class="btn btn-sm btn-ghost">Limpiar datos</button>';
    html += '</div>';

    if (activeLimits.length === 0) {
        html += '<p class="label-title" style="text-align:center;padding:20px;">Activa al menos un contaminante para introducir datos.</p>';
    } else {
        html += '<div style="overflow-x:auto;">';
        html += '<table style="border-collapse:collapse;width:100%;min-width:400px;">';
        html += '<thead><tr style="background:var(--bg);">';
        html += '<th style="' + _copTh() + 'text-align:left;padding-left:14px;">Contaminante</th>';
        html += '<th style="' + _copTh() + '">Límite (L)</th>';
        html += '<th style="' + _copTh() + '">Unidad</th>';
        copState.vehicles.forEach(function(v) {
            html += '<th style="' + _copTh() + '">V' + v.id + '</th>';
        });
        html += '</tr></thead><tbody>';

        activeLimits.forEach(function(p) {
            html += '<tr>';
            html += '<td style="' + _copTd() + 'text-align:left;padding-left:14px;font-weight:600;">';
            html += p.label;
            if (p.note) html += ' <span style="font-size:10px;color:var(--muted);">(' + p.note + ')</span>';
            html += '</td>';
            html += '<td style="' + _copTd() + 'color:var(--muted);font-family:monospace;">' +
                    copFmtLimit(p.limit, p.isPn) + '</td>';
            html += '<td style="' + _copTd() + 'color:var(--muted);font-size:11px;">' + p.unit + '</td>';
            copState.vehicles.forEach(function(v) {
                html += '<td style="' + _copTd() + 'padding:6px 8px;">';
                html += '<input type="number" step="any" placeholder="—" ';
                html += 'value="' + (v.values[p.id] !== undefined ? v.values[p.id] : '') + '" ';
                html += 'data-vid="' + v.id + '" data-pid="' + p.id + '" ';
                html += 'oninput="copHandleInput(this)" ';
                html += 'style="width:90px;padding:6px 8px;font-size:12px;text-align:right;' +
                        'box-sizing:border-box;font-family:monospace;" />';
                html += '</td>';
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>'; // overflow-x
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

    html += '</div>'; // container
    return html;
}
