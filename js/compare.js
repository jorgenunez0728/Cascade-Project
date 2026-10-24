// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [3.22.0] COMPARAR PRUEBAS — 2 a 6 pruebas lado a lado                ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Un re-test contra su prueba anterior, o varias pruebas de la misma familia: gases como %
// del límite CON EL QUE SE JUZGÓ CADA UNA, CO₂ contra su declarado, coeficientes del
// dinamómetro, y lo que difiere resaltado.
//
// REGLAS:
//  - compareModel(vehicles, deps) es PURA: todo lo que lee del resto de la app llega en
//    `deps` (compareDeps() arma el real). Se prueba en Node sin DOM.
//  - Compone, no calcula: valores = los APROBADOS (`_copFinalGasValues`) y, si la prueba
//    aún no está aprobada, los capturados marcados "sin aprobar" (`_copRawGasValues`).
//    Perfil = `_libGasProfileForVehicle` (el congelado al liberar), NUNCA el vigente: una
//    prueba se lee con los límites con que se juzgó. "Cuenta para CoP" = `copTestCounts` /
//    `copTestWhyNot`.
//  - Un gas que dos pruebas guardan en unidades distintas (g/km vs g/mi) son DOS filas:
//    nunca se ponen en la misma fila valores que no se pueden comparar a ojo.
//  - No escribe nada. Excel y PDF solo exportan lo que se ve.

var COMPARE_MAX = 6;
var COMPARE_MIN = 2;
// Diferencia que se resalta: en % del límite (gases), en % relativo (dinamómetro y CO₂).
var COMPARE_PCT_POINTS = 20;
var COMPARE_REL_PCT = 2;

function _cmpNum(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
}
function _cmpFmt(v, dec) {
    if (v === null || v === undefined) return '—';
    var a = Math.abs(v);
    var d = dec != null ? dec : (a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4);
    return String(Math.round(v * Math.pow(10, d)) / Math.pow(10, d));
}
function _cmpRange(nums) {
    var xs = nums.filter(function(x) { return x !== null && x !== undefined && isFinite(x); });
    if (xs.length < 2) return null;
    return { min: Math.min.apply(null, xs), max: Math.max.apply(null, xs) };
}

/**
 * LA comparación de pruebas. PURA.
 * vehicles: 2..6 vehículos. deps: {valuesOf, approvedOf, profileOf, regOf, countsOf, whyNotOf,
 *   co2Of, testDateOf, familyOf, signerOf}. Devuelve {cols, gas, co2, dyno, meta, notes}.
 */
function compareModel(vehicles, deps) {
    var vs = (vehicles || []).filter(Boolean).slice(0, COMPARE_MAX);
    var notes = [];
    var cols = vs.map(function(v) {
        var approved = !!deps.approvedOf(v);
        var vals = deps.valuesOf(v) || null;
        var counts = !!deps.countsOf(v);
        return {
            id: v.id, vin: v.vin || '', vinShort: String(v.vin || '').slice(-8),
            date: deps.testDateOf(v) || '', reg: deps.regOf(v) || '',
            approved: approved, hasValues: !!(vals && Object.keys(vals).length),
            counts: counts, whyNot: counts ? '' : (deps.whyNotOf(v) || ''),
            family: deps.familyOf(v) || '', status: v.status || '',
            releaser: deps.signerOf(v, 'releaser'), approver: deps.signerOf(v, 'approver'),
            testRef: (v.testData && v.testData.vets && v.testData.vets.testRef) || ''
        };
    });
    if (cols.some(function(c) { return !c.approved && c.hasValues; })) notes.push('Las columnas marcadas "sin aprobar" muestran lo que capturó el liberador: todavía puede cambiar.');
    var fams = {}; cols.forEach(function(c) { if (c.family) fams[c.family] = true; });
    if (Object.keys(fams).length > 1) notes.push('Estas pruebas son de familias distintas: compáralas con cuidado.');
    var regs = {}; cols.forEach(function(c) { if (c.reg) regs[c.reg] = true; });
    if (Object.keys(regs).length > 1) notes.push('Se juzgaron con normas distintas: el % de cada una es contra SU límite.');

    // Gases: una fila por campo + unidad guardada.
    var rowIdx = {}, gas = [];
    vs.forEach(function(v, i) {
        var prof = deps.profileOf(v);
        var vals = deps.valuesOf(v) || {};
        var gases = (prof && prof.gases) || [];
        var seen = {};
        gases.forEach(function(g) {
            seen[g.field] = true;
            var key = g.field + '|' + (g.unit || '');
            if (rowIdx[key] === undefined) { rowIdx[key] = gas.length; gas.push({ key: key, field: g.field, label: g.label || g.field, unit: g.unit || '', cells: [] }); }
            var row = gas[rowIdx[key]];
            var val = _cmpNum(vals[g.field]);
            var lim = _cmpNum(g.limit);
            row.cells[i] = { value: val, limit: lim, pct: (val !== null && lim) ? val / lim * 100 : null,
                             verdict: (val === null || !lim) ? null : (val <= lim ? 'pasa' : 'falla') };
        });
        // Capturado pero fuera del perfil (un gas que el perfil ya no tiene): también se ve.
        Object.keys(vals).forEach(function(f) {
            if (seen[f]) return;
            var key = f + '|';
            if (rowIdx[key] === undefined) { rowIdx[key] = gas.length; gas.push({ key: key, field: f, label: f, unit: '', cells: [] }); }
            gas[rowIdx[key]].cells[i] = { value: _cmpNum(vals[f]), limit: null, pct: null, verdict: null };
        });
    });
    gas.forEach(function(row) {
        for (var i = 0; i < vs.length; i++) if (!row.cells[i]) row.cells[i] = { value: null, limit: null, pct: null, verdict: null };
        var rp = _cmpRange(row.cells.map(function(c) { return c.pct; }));
        var rv = _cmpRange(row.cells.map(function(c) { return c.value; }));
        row.spreadPts = rp ? rp.max - rp.min : null;
        // Sin límite (CO₂, informativos) no hay % del límite: se compara en relativo, como el dinamómetro.
        row.differs = rp ? (rp.max - rp.min) >= COMPARE_PCT_POINTS : !!(rv && rv.max > 0 && (rv.max - rv.min) / rv.max * 100 >= COMPARE_REL_PCT);
        row.cells.forEach(function(c) {
            // Máximo y mínimo solo en una fila que se aparta: 21 % contra 20 % no es una señal.
            c.isMax = !!(row.differs && rp && c.pct !== null && c.pct === rp.max && rp.max !== rp.min);
            c.isMin = !!(row.differs && rp && c.pct !== null && c.pct === rp.min && rp.max !== rp.min);
        });
    });

    // CO₂ contra su declarado.
    var co2 = vs.map(function(v) {
        var c = deps.co2Of(v) || {};
        var m = _cmpNum(c.measured), t = _cmpNum(c.target);
        return { measured: m, target: t, dev: (m !== null && t) ? (m - t) / t * 100 : null };
    });
    // Sin ningún declarado la sección repetiría la fila de CO₂ de los gases: no se pinta.
    var co2Any = co2.some(function(c) { return c.target !== null; });

    // Dinamómetro (SI, como lo guarda Operación).
    var DYNO = [['etw', 'ETW', 'kg'], ['targetA', 'Target A', 'N'], ['dynoA', 'Dyno A', 'N'],
                ['targetB', 'Target B', 'N/(km/h)'], ['dynoB', 'Dyno B', 'N/(km/h)'],
                ['targetC', 'Target C', 'N/(km/h)²'], ['dynoC', 'Dyno C', 'N/(km/h)²']];
    var dyno = DYNO.map(function(d) {
        var vals = vs.map(function(v) { return _cmpNum(v.testData && v.testData[d[0]]); });
        var r = _cmpRange(vals);
        var ref = r ? Math.max(Math.abs(r.max), Math.abs(r.min)) : 0;
        return { key: d[0], label: d[1], unit: d[2], values: vals,
                 differs: !!(r && ref > 0 && (r.max - r.min) / ref * 100 >= COMPARE_REL_PCT) };
    }).filter(function(r) { return r.values.some(function(x) { return x !== null; }); });

    return { cols: cols, gas: gas, co2: co2Any ? co2 : null, dyno: dyno, notes: notes };
}

/** Las dependencias reales (lo que la app usa para juzgar). */
function compareDeps() {
    return {
        valuesOf: function(v) {
            if (typeof _copFinalGasValues === 'function') { var f = _copFinalGasValues(v); if (f) return f; }
            return typeof _copRawGasValues === 'function' ? _copRawGasValues(v) : null;
        },
        approvedOf: function(v) { return typeof copResultApproved === 'function' ? copResultApproved(v) : v.status === 'archived'; },
        profileOf: function(v) { return typeof _libGasProfileForVehicle === 'function' ? _libGasProfileForVehicle(v) : null; },
        regOf: function(v) { return typeof _libJudgedRegulation === 'function' ? _libJudgedRegulation(v) : ((v.config || {})['EMISSION REGULATION'] || ''); },
        countsOf: function(v) { return typeof copTestCounts === 'function' ? copTestCounts(v) : false; },
        whyNotOf: function(v) { return typeof copTestWhyNot === 'function' ? copTestWhyNot(v) : ''; },
        co2Of: function(v) {
            var vals = this.valuesOf(v) || {};
            var m = vals.CO2 != null ? vals.CO2 : vals.co2;
            var h = typeof homoVehicleData === 'function' ? homoVehicleData(v) : null;
            return { measured: m, target: h ? h.co2Target : null };
        },
        testDateOf: function(v) { return typeof vehicleTestDate === 'function' ? vehicleTestDate(v) : ''; },
        familyOf: function(v) { return typeof copVehicleFamilyKey === 'function' ? copVehicleFamilyKey(v) : ''; },
        signerOf: function(v, who) {
            var s = v.testData && v.testData.signatures && v.testData.signatures[who];
            return s ? (s.signerName || s.sessionUserName || '') : '';
        }
    };
}

/**
 * Con qué comparar un vehículo: otras pruebas de su VIN (re-tests) y de su familia, con
 * resultados capturados, la más reciente primero. PURA sobre la lista que recibe.
 */
function compareCandidatesFor(v, vehicles, deps) {
    if (!v) return { sameVin: [], sameFamily: [] };
    var fam = deps.familyOf(v), vin = String(v.vin || '').trim().toUpperCase();
    var others = (vehicles || []).filter(function(x) {
        if (!x || x === v || String(x.id) === String(v.id)) return false;
        var vals = deps.valuesOf(x);
        return !!(vals && Object.keys(vals).length);
    });
    var byDate = function(a, b) { return String(deps.testDateOf(b) || '').localeCompare(String(deps.testDateOf(a) || '')); };
    var sameVin = others.filter(function(x) { return vin && String(x.vin || '').trim().toUpperCase() === vin; }).sort(byDate);
    var sameFamily = others.filter(function(x) { return fam && deps.familyOf(x) === fam && sameVin.indexOf(x) === -1; }).sort(byDate);
    return { sameVin: sameVin, sameFamily: sameFamily };
}

// ── Pantalla ─────────────────────────────────────────────────────────────

var _cmpLast = null;   // ids de lo último abierto (para exportar)

function compareOpen(ids) {
    var list = ((typeof db !== 'undefined' && db.vehicles) || []);
    var vs = (ids || []).map(function(id) { return list.filter(function(x) { return String(x.id) === String(id); })[0]; }).filter(Boolean);
    if (vs.length < COMPARE_MIN) { showToast('Elige al menos ' + COMPARE_MIN + ' pruebas para comparar.', 'warning'); return; }
    if (vs.length > COMPARE_MAX) { showToast('Se comparan hasta ' + COMPARE_MAX + ' pruebas a la vez; tomé las primeras ' + COMPARE_MAX + '.', 'info'); vs = vs.slice(0, COMPARE_MAX); }
    _cmpLast = vs.map(function(v) { return v.id; });
    var m = compareModel(vs, compareDeps());
    if (typeof fichaClose === 'function') { try { fichaClose(); } catch (e) {} }
    showModal({
        title: 'Comparar ' + vs.length + ' pruebas', icon: '⚖️', body: compareHTML(m), wide: true,
        buttons: [
            { label: '⬇ Excel', onclick: function() { compareExportXlsx(); } },
            { label: '🖨️ PDF', onclick: function() { compareExportPdf(); } },
            { label: 'Cerrar', cls: 'btn-primary' }
        ]
    });
    if (typeof auditLog === 'function') auditLog('cop15', 'pruebas_comparadas', { type: 'vehiculos', id: _cmpLast.join(','), label: vs.map(function(v) { return v.vin; }).join(', ') }, vs.length + ' pruebas');
}

/** HTML de la comparación. PURA sobre el modelo. */
function compareHTML(m) {
    var esc = (typeof escapeHtml === 'function') ? escapeHtml : function(s) { return String(s); };
    var dt = function(d) { return d ? d.split('-').reverse().join('/') : 'sin fecha'; };
    var h = '';
    if (m.notes.length) h += m.notes.map(function(n) { return '<div class="cmp-note">' + esc(n) + '</div>'; }).join('');
    h += '<div class="cmp-scroll"><table class="cmp-table"><thead><tr><th scope="col"></th>' + m.cols.map(function(c) {
        return '<th scope="col"><div class="cmp-vin">…' + esc(c.vinShort) + '</div><div class="cmp-sub">' + esc(dt(c.date)) + ' · ' + esc(c.reg || '—') + '</div>' +
            (!c.approved && c.hasValues ? '<span class="cmp-chip is-warn">sin aprobar</span>' : '') +
            (c.approved && !c.counts ? '<span class="cmp-chip is-muted" title="' + esc(c.whyNot) + '">no cuenta para CoP</span>' : '') + '</th>';
    }).join('') + '</tr></thead><tbody>';

    h += '<tr class="cmp-sec"><th scope="rowgroup" colspan="' + (m.cols.length + 1) + '">Gases · % del límite con que se juzgó cada una</th></tr>';
    m.gas.forEach(function(r) {
        h += '<tr' + (r.differs ? ' class="is-differs"' : '') + '><th scope="row">' + esc(r.label) + (r.unit ? ' <small>' + esc(r.unit) + '</small>' : '') +
            (r.differs ? ' <span class="cmp-flag" title="Difiere ' + Math.round(r.spreadPts || 0) + ' puntos del límite entre pruebas">≠</span>' : '') + '</th>';
        r.cells.forEach(function(c) {
            var cls = 'cmp-cell' + (c.verdict === 'falla' ? ' is-fail' : '') + (c.isMax ? ' is-max' : '') + (c.isMin ? ' is-min' : '');
            var bar = c.pct !== null ? '<span class="cmp-bar"><span style="width:' + Math.min(100, Math.max(0, c.pct)).toFixed(0) + '%"></span></span>' : '';
            h += '<td class="' + cls + '">' + (c.value === null ? '<span class="u-muted">—</span>'
                : esc(_cmpFmt(c.value)) + (c.pct !== null ? ' <small>' + Math.round(c.pct) + '%</small>' : '') + bar) + '</td>';
        });
        h += '</tr>';
    });

    if (m.co2) {
        h += '<tr class="cmp-sec"><th scope="rowgroup" colspan="' + (m.cols.length + 1) + '">CO₂ contra el declarado</th></tr>';
        h += '<tr><th scope="row">Medido / declarado</th>' + m.co2.map(function(c) {
            return '<td>' + (c.measured === null ? '—' : esc(_cmpFmt(c.measured, 1))) + ' / ' + (c.target === null ? '—' : esc(_cmpFmt(c.target, 1))) + '</td>';
        }).join('') + '</tr>';
        h += '<tr><th scope="row">Desviación</th>' + m.co2.map(function(c) {
            return '<td' + (c.dev !== null && Math.abs(c.dev) >= COMPARE_REL_PCT ? ' class="is-differs-cell"' : '') + '>' + (c.dev === null ? '—' : (c.dev > 0 ? '+' : '') + c.dev.toFixed(1) + ' %') + '</td>';
        }).join('') + '</tr>';
    }

    if (m.dyno.length) {
        h += '<tr class="cmp-sec"><th scope="rowgroup" colspan="' + (m.cols.length + 1) + '">Dinamómetro</th></tr>';
        m.dyno.forEach(function(r) {
            h += '<tr' + (r.differs ? ' class="is-differs"' : '') + '><th scope="row">' + esc(r.label) + ' <small>' + esc(r.unit) + '</small>' +
                (r.differs ? ' <span class="cmp-flag" title="Difiere entre pruebas">≠</span>' : '') + '</th>' +
                r.values.map(function(x) { return '<td>' + (x === null ? '<span class="u-muted">—</span>' : esc(_cmpFmt(x))) + '</td>'; }).join('') + '</tr>';
        });
    }

    h += '<tr class="cmp-sec"><th scope="rowgroup" colspan="' + (m.cols.length + 1) + '">Registro</th></tr>';
    h += '<tr><th scope="row">Liberó</th>' + m.cols.map(function(c) { return '<td>' + esc(c.releaser || '—') + '</td>'; }).join('') + '</tr>';
    h += '<tr><th scope="row">Aprobó</th>' + m.cols.map(function(c) { return '<td>' + esc(c.approver || '—') + '</td>'; }).join('') + '</tr>';
    h += '<tr><th scope="row">Prueba VETS</th>' + m.cols.map(function(c) { return '<td>' + esc(c.testRef || '—') + '</td>'; }).join('') + '</tr>';
    h += '<tr><th scope="row">Ficha</th>' + m.cols.map(function(c) {
        return '<td>' + (typeof fichaLinkHTML === 'function' ? fichaLinkHTML('vehiculo', c.id, 'Abrir') : '') + '</td>';
    }).join('') + '</tr>';
    h += '</tbody></table></div>';
    h += '<p class="cmp-foot">≠ = la fila difiere entre pruebas (' + COMPARE_PCT_POINTS + ' puntos del límite en gases con límite; ' + COMPARE_REL_PCT + ' % en CO₂, gases sin límite y dinamómetro). ' +
         'Los valores son los aprobados; el % es contra el límite del perfil con que se juzgó cada prueba.</p>';
    return h;
}

// ── Exportar ─────────────────────────────────────────────────────────────

function _cmpCurrent() {
    var list = ((typeof db !== 'undefined' && db.vehicles) || []);
    var vs = (_cmpLast || []).map(function(id) { return list.filter(function(x) { return String(x.id) === String(id); })[0]; }).filter(Boolean);
    return vs.length >= COMPARE_MIN ? compareModel(vs, compareDeps()) : null;
}

/** Filas planas (encabezado + celdas) de la comparación: las usan Excel y PDF. PURA. */
function compareRows(m) {
    var out = [];
    out.push(['', ].concat(m.cols.map(function(c) { return c.vin + (c.approved ? '' : ' (sin aprobar)'); })));
    out.push(['Fecha de prueba'].concat(m.cols.map(function(c) { return c.date || ''; })));
    out.push(['Norma con que se juzgó'].concat(m.cols.map(function(c) { return c.reg || ''; })));
    out.push(['Cuenta para CoP'].concat(m.cols.map(function(c) { return c.counts ? 'Sí' : ('No' + (c.whyNot ? ' — ' + c.whyNot : '')); })));
    m.gas.forEach(function(r) {
        out.push([r.label + (r.unit ? ' (' + r.unit + ')' : '')].concat(r.cells.map(function(c) { return c.value; })));
        if (r.cells.some(function(c) { return c.pct !== null; }))
            out.push(['  % del límite'].concat(r.cells.map(function(c) { return c.pct === null ? null : Math.round(c.pct * 10) / 10; })));
    });
    if (m.co2) {
        out.push(['CO₂ medido'].concat(m.co2.map(function(c) { return c.measured; })));
        out.push(['CO₂ declarado'].concat(m.co2.map(function(c) { return c.target; })));
        out.push(['CO₂ desviación %'].concat(m.co2.map(function(c) { return c.dev === null ? null : Math.round(c.dev * 10) / 10; })));
    }
    m.dyno.forEach(function(r) { out.push([r.label + ' (' + r.unit + ')'].concat(r.values)); });
    out.push(['Liberó'].concat(m.cols.map(function(c) { return c.releaser || ''; })));
    out.push(['Aprobó'].concat(m.cols.map(function(c) { return c.approver || ''; })));
    out.push(['Prueba VETS'].concat(m.cols.map(function(c) { return c.testRef || ''; })));
    return out;
}

function compareExportXlsx() {
    var m = _cmpCurrent();
    if (!m) return;
    if (typeof xwBuildCompressed !== 'function') { showToast('No se pudo cargar el escritor de Excel. Recarga la página.', 'error'); return; }
    var rows = compareRows(m);
    var H = { font: { b: true, color: 'FFFFFF' }, fill: '1E293B', border: 'thin', align: { v: 'center', wrap: true } };
    var cells = [];
    rows.forEach(function(r, i) {
        r.forEach(function(v, j) {
            if (v === null || v === undefined || v === '') return;
            cells.push({ r: i + 1, c: j + 1, v: v, s: i === 0 ? H : (j === 0 ? { font: { b: true } } : undefined) });
        });
    });
    var spec = { sheets: [{ name: 'Comparar', freeze: { row: 2, col: 2 },
        cols: rows[0].map(function(_, i) { return { min: i + 1, max: i + 1, width: i === 0 ? 30 : 22 }; }),
        cells: cells, print: { landscape: true, fitWidth: 1 } }] };
    var name = 'Comparar_pruebas_' + (typeof localToday === 'function' ? localToday() : '') + '.xlsx';
    xwBuildCompressed(spec).then(function(bytes) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function() { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 1500);
        showToast('Descargado: ' + name, 'success');
    }).catch(function(e) { showToast('No se pudo armar el Excel: ' + (e && e.message ? e.message : e) + '. Usa 🐞 para reportarlo.', 'error'); });
}

function compareExportPdf() {
    var m = _cmpCurrent();
    if (!m) return;
    if (!window.jspdf || !window.jspdf.jsPDF) { showToast('No se pudo cargar el generador de PDF. Recarga la página.', 'error'); return; }
    var safe = (typeof _pdfSafe === 'function') ? _pdfSafe : function(s) { return String(s); };
    var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    var W = doc.internal.pageSize.getWidth(), Hh = doc.internal.pageSize.getHeight(), ML = 10;
    var rows = compareRows(m);
    var c0 = 52, cw = Math.min(40, (W - 2 * ML - c0) / (rows[0].length - 1));
    var y = 14;
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(safe('Comparación de pruebas · KIA EmLab'), ML, y);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(safe('Valores aprobados; % contra el límite con que se juzgó cada prueba. ' + new Date().toLocaleString('es-MX')), ML, y + 5);
    y += 11;
    var fmt = function(v, head) { return v === null || v === undefined || v === '' ? (head ? '' : '-') : (typeof v === 'number' ? _cmpFmt(v) : String(v)); };
    var tableW = c0 + cw * (rows[0].length - 1);
    var drawRow = function(r, head, shade) {
        if (head) { doc.setFillColor(30, 41, 59); doc.rect(ML, y - 4, tableW, 6, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); }
        else { doc.setTextColor(30); doc.setFont('helvetica', 'normal'); if (shade) { doc.setFillColor(241, 245, 249); doc.rect(ML, y - 4, tableW, 5.5, 'F'); } }
        r.forEach(function(v, j) {
            var x = j === 0 ? ML + 1 : ML + c0 + cw * (j - 1) + 1;
            var maxW = (j === 0 ? c0 : cw) - 2;
            var t = safe(fmt(v, head));
            if (doc.getTextWidth(t) > maxW) {
                while (t.length > 1 && doc.getTextWidth(t + '...') > maxW) t = t.slice(0, -1);
                t += '...';
            }
            doc.text(t, x, y);
        });
        doc.setTextColor(30);
        y += head ? 7 : 5.5;
    };
    rows.forEach(function(r, i) {
        if (i === 0) { drawRow(r, true); return; }
        // Página nueva: se repite el encabezado (VIN y fecha de cada columna).
        if (y > Hh - 12) { doc.addPage(); y = 14; drawRow(rows[0], true); }
        drawRow(r, false, i % 2);
    });
    if (m.notes.length) { y += 3; doc.setFontSize(7.5); m.notes.forEach(function(n) { if (y > Hh - 8) { doc.addPage(); y = 14; } doc.text(safe('* ' + n), ML, y); y += 4; }); }
    var name = 'Comparar_pruebas_' + (typeof localToday === 'function' ? localToday() : '') + '.pdf';
    doc.save(name);
}

// ── Entradas ─────────────────────────────────────────────────────────────

/** Historial: compara lo seleccionado. */
function histCompareSelected() {
    var ids = (typeof histSelectedIds === 'function') ? histSelectedIds() : [];
    compareOpen(ids);
}

/** Líneas "Comparar con…" para la ficha de un vehículo (las pinta ficha.js con `js`). */
function compareFichaGroup(v) {
    var list = ((typeof db !== 'undefined' && db.vehicles) || []);
    var deps = compareDeps();
    var mine = deps.valuesOf(v);
    if (!mine || !Object.keys(mine).length) return null;
    var c = compareCandidatesFor(v, list, deps);
    var lines = [];
    c.sameVin.slice(0, 3).forEach(function(x) {
        lines.push({ text: 'Re-test del mismo VIN · ' + (deps.testDateOf(x) || 'sin fecha'), js: 'compareOpen([' + JSON.stringify(v.id) + ',' + JSON.stringify(x.id) + '])' });
    });
    if (c.sameFamily.length) {
        var pick = c.sameFamily.slice(0, COMPARE_MAX - 1);
        lines.push({ text: 'Con las ' + pick.length + ' más recientes de su familia', js: 'compareOpen(' + JSON.stringify([v.id].concat(pick.map(function(x) { return x.id; }))) + ')' });
    }
    return lines.length ? { icon: '⚖️', title: 'Comparar con…', lines: lines } : null;
}
