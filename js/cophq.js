// ╔══════════════════════════════════════════════════════════════════════╗
// ║  cophq.js — la hoja de evaluación estadística de corporativo (3.15.0)  ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Corporativo (HQ) pide el CoP de cada familia en SU formato: dos hojas, una de gases
// (UN R154 §2.1.1: EM = raw × DF + KI; Xtests contra A·L − VAR/L) y una de CO₂ (UN R154
// §3.3.1, Tabla A2/3). Aquí se rehacen con el escritor propio (xlsxw.js) — mismas
// celdas, fórmulas, combinaciones y anchos — y se llenan con el juicio guardado de la
// familia. NO lleva nada del archivo de HQ (logotipos, sellos, pie, datos de ejemplo):
// el repositorio es público y ese archivo es de uso restringido.
//
// Partes:
//   copHqModelFor(j)    → junta los datos de un juicio guardado (lee db/homolog).
//   copHqXlsxSpec(m)    → PURA: el libro. Cada fórmula se escribe con su valor (`v`),
//                          calculado aquí con la misma aritmética que Excel.
//   copHqCheck(m)       → PURA: lo que la hoja va a decir, gas por gas y en CO₂.
//   copHqXlsxExport(id) → un clic: arma, descarga y audita.

var COP_HQ_GAS_A = 1.05;      // UN R154 §2.1.1 (el mismo de COP_GAS_A)
var COP_HQ_CO2_A = 1.01;      // UN R154 §3.3.1 (el mismo de COP_CO2_A)
var COP_HQ_BORDER = '000000';
var COP_HQ_YELLOW = 'FFFF99';
var COP_HQ_GREEN = '00FF00';

// Nombre del gas tal como lo escribe la hoja de HQ.
function _copHqGasName(id) {
    return { NOx: 'NOx', HCNOx: 'HC+NOx' }[id] || String(id || '');
}

function _copHqMean(xs) { return xs.reduce(function(s, v) { return s + v; }, 0) / xs.length; }
// VAR de Excel: varianza muestral (n − 1).
function _copHqVar(xs) {
    var m = _copHqMean(xs);
    return xs.reduce(function(s, v) { return s + (v - m) * (v - m); }, 0) / (xs.length - 1);
}

/**
 * Lo que dice la hoja de HQ, con SUS fórmulas (PURA). Gases: Pass si Xtests < A·L − VAR/L,
 * si no "Fail" (la hoja no tiene "otra medición"). CO₂: PASS si Xtests ≤ A − (tP1+tP2)·s,
 * FAIL si Xtests > A + (tF1−tF2)·s, si no ADD.
 */
function copHqCheck(m) {
    var out = { gases: [], co2: null };
    (m && m.gases || []).forEach(function(g) {
        var em = g.raw.map(function(v) { return v * g.df + g.ki; });
        var xt = _copHqMean(em), vr = _copHqVar(em);
        var bound = COP_HQ_GAS_A * g.limit - vr / g.limit;
        var fail = COP_HQ_GAS_A * g.limit - ((Math.min(em.length, 16) - 3) / 13) * vr / g.limit;
        out.gases.push({ id: g.id, name: _copHqGasName(g.id), n: em.length, em: em, xtests: xt, var: vr, bound: bound,
                         sheet: xt < bound ? 'Pass' : 'Fail',
                         // Lo que dice la norma (y la plataforma) con la cota de falla.
                         rule: xt < bound ? 'PASS' : xt > fail ? 'FAIL' : 'CONTINUE' });
    });
    var c = m && m.co2;
    if (c && c.rows.length >= 3) {
        var xs = c.rows.map(function(r) { return r.corrected / r.declared; });
        var mean = _copHqMean(xs), s = Math.sqrt(_copHqVar(xs));
        var t = c.table[Math.max(3, Math.min(xs.length, 16))];
        var pass = COP_HQ_CO2_A - (t.tP1 + t.tP2) * s, failB = COP_HQ_CO2_A + (t.tF1 - t.tF2) * s;
        out.co2 = { n: xs.length, x: xs, xtests: mean, s: s, passBound: pass, failBound: failB,
                    sheet: mean <= pass ? 'PASS' : mean > failB ? 'FAIL' : 'ADD' };
    }
    return out;
}

/**
 * El libro de HQ (PURA). m = {family, ip, vins:[...], gases:[{id, limit, df, ki, raw:[...] , isPn}],
 * co2: {rows:[{vin, raw, corrected, declared}], table, evc, fcf} | null}.
 * Con n = 3 las celdas son exactamente las del formato de HQ; con más vehículos cada
 * bloque crece hacia abajo y los rangos de las fórmulas crecen con él.
 */
function copHqXlsxSpec(m) {
    var chk = copHqCheck(m);
    var n = m.vins.length;
    var B = COP_HQ_BORDER;
    var st = function(o) {
        var x = { font: { name: 'Arial', sz: (o && o.sz) || 11, color: '000000' }, align: { h: (o && o.h) || 'center', v: 'center' } };
        if (o && o.wrap) x.align.wrap = true;
        if (o && o.fill) x.fill = o.fill;
        if (o && o.numFmt) x.numFmt = o.numFmt;
        if (o && o.border) { x.border = o.border; x.borderColor = B; }
        return x;
    };
    var ALL = { top: 'thin', bottom: 'thin', left: 'thin', right: 'thin' };
    // Borde de una celda dentro de un rango combinado vertical (r1..r2): arriba/abajo solo en los extremos.
    var vBorder = function(r, r1, r2) {
        var b = { left: 'thin', right: 'thin' };
        if (r === r1) b.top = 'thin';
        if (r === r2) b.bottom = 'thin';
        return b;
    };
    var ref = xwRef, rng = xwRange;

    // ── Hoja 1: gases ─────────────────────────────────────────────────────────
    var c1 = [], mg1 = [], rows1 = {};
    var title = function(cells, merges, text, cLast) {
        for (var r = 2; r <= 4; r++) {
            rows1[r] = rows1[r] || {};
            for (var c = 2; c <= cLast; c++) {
                var b = {};
                if (r === 2) b.top = 'thin';
                if (r === 4) b.bottom = 'thin';
                if (c === 2) b.left = 'thin';
                if (c === cLast) b.right = 'thin';
                cells.push({ r: r, c: c, v: (r === 2 && c === 2) ? text : '', s: st({ sz: 18, border: b }) });
            }
        }
        merges.push(rng(2, 2, 4, cLast));
    };
    title(c1, mg1, m.family + ' Emission Statistical Evaluation', 16);
    [2, 3, 4].forEach(function(r) { rows1[r] = { height: 15.75 }; });
    rows1[5] = { height: 13.8 };

    var nGas = m.gases.length;
    var blockH = n + 2;
    var lastRow1 = 6 + (nGas ? (nGas - 1) * blockH + n : n);
    var vinList = '● ' + m.family + ' \n' + m.vins.map(function(v, i) { return '  ' + (i + 1) + ') ' + v; }).join('\n');
    for (var rb = 6; rb <= lastRow1; rb++) {
        c1.push({ r: rb, c: 2, v: rb === 6 ? vinList : '', s: st({ h: 'left', wrap: true, border: vBorder(rb, 6, lastRow1) }) });
    }
    mg1.push(rng(6, 2, lastRow1, 2));

    m.gases.forEach(function(g, i) {
        var k = chk.gases[i];
        var h = 6 + i * blockH, d1 = h + 1, dn = h + n;
        var isPn = !!g.isPn;
        var rawFmt = isPn ? '0.00E+00' : (g.id === 'PM' ? '0.0000' : '0.000');
        var limFmt = isPn ? '0.00E+00' : (g.id === 'PM' ? '' : '0.000');
        var varFmt = isPn ? '0.00000000' : '0.000000000';
        rows1[h] = { height: i === 0 ? 16.5 : 13.8 };
        for (var r = d1; r <= dn + 1; r++) rows1[r] = { height: 13.8 };

        // Columna C: el gas, combinado desde el encabezado hasta la última fila.
        for (var rc = h; rc <= dn; rc++) c1.push({ r: rc, c: 3, v: rc === h ? _copHqGasName(g.id) : '', s: st({ border: vBorder(rc, h, dn) }) });
        mg1.push(rng(h, 3, dn, 3));
        ['raw EM', 'DF', 'KI', 'EM', 'limit', 'Xtests', 'VAR', 'A', 'AxL-VAR/L'].forEach(function(t, j) {
            c1.push({ r: h, c: 4 + j, v: t, s: st({ border: ALL }) });
        });
        g.raw.forEach(function(v, j) {
            var r = d1 + j;
            c1.push({ r: r, c: 4, v: v, s: st({ fill: COP_HQ_YELLOW, numFmt: rawFmt, border: ALL }) });
            c1.push({ r: r, c: 7, f: ref(r, 4) + '*' + ref(d1, 5, true) + '+' + ref(d1, 6, true), v: k.em[j],
                      s: st({ numFmt: rawFmt === '0.0000' ? '0.0000' : (isPn ? '0.00E+00' : '0.000'), border: ALL }) });
        });
        // Columnas combinadas sobre las n filas: DF, KI, limit, Xtests, VAR, A, AxL-VAR/L.
        var merged = [
            { c: 5, v: g.df, fill: COP_HQ_YELLOW },
            { c: 6, v: g.ki, fill: COP_HQ_YELLOW },
            { c: 8, v: g.limit, fill: COP_HQ_YELLOW, numFmt: limFmt },
            { c: 9, f: 'AVERAGE(' + rng(d1, 7, dn, 7) + ')', v: k.xtests },
            { c: 10, f: 'VAR(' + rng(d1, 7, dn, 7) + ')', v: k.var, numFmt: varFmt },
            { c: 11, v: COP_HQ_GAS_A },
            { c: 12, f: ref(d1, 11) + '*' + ref(d1, 8) + '-' + ref(d1, 10) + '/' + ref(d1, 8), v: k.bound }
        ];
        merged.forEach(function(x) {
            for (var r = d1; r <= dn; r++) {
                var cell = { r: r, c: x.c, s: st({ fill: x.fill, numFmt: x.numFmt, border: vBorder(r, d1, dn) }) };
                if (r === d1) { cell.v = x.v; if (x.f) cell.f = x.f; }
                c1.push(cell);
            }
            mg1.push(rng(d1, x.c, dn, x.c));
        });
        // El recuadro de la comparación (N:P, tres filas).
        c1.push({ r: d1, c: 14, v: 'Xtests', s: st({ border: ALL }) });
        c1.push({ r: d1, c: 15, v: '', s: st({ border: ALL }) });
        c1.push({ r: d1, c: 16, v: 'AxL-VAR/L', s: st({ border: ALL }) });
        c1.push({ r: d1 + 1, c: 14, f: ref(d1, 9), v: k.xtests, s: st({ border: ALL }) });
        c1.push({ r: d1 + 1, c: 15, f: 'IF(' + ref(d1 + 1, 14) + '<' + ref(d1 + 1, 16) + ',"<",">")', v: k.sheet === 'Pass' ? '<' : '>',
                  s: st({ fill: COP_HQ_GREEN, numFmt: '0_);[Red]\\(0\\)', border: ALL }) });
        c1.push({ r: d1 + 1, c: 16, f: ref(d1, 12), v: k.bound, s: st({ border: ALL }) });
        c1.push({ r: d1 + 2, c: 14, v: '', s: st({ border: ALL }) });
        c1.push({ r: d1 + 2, c: 15, f: 'IF(' + ref(d1 + 1, 14) + '<' + ref(d1 + 1, 16) + ',"Pass","Fail")', v: k.sheet,
                  s: st({ fill: COP_HQ_GREEN, numFmt: '0_);[Red]\\(0\\)', border: ALL }) });
        c1.push({ r: d1 + 2, c: 16, v: '', s: st({ border: ALL }) });
    });

    var sheet1 = {
        name: 'Emissions', showGrid: false, zoom: 55, active: true,
        print: { landscape: true, fitWidth: 1 },
        cols: [{ min: 1, width: 8.9 }, { min: 2, width: 30 }, { min: 3, width: 9 }, { min: 4, width: 12.8 }, { min: 5, width: 9 },
               { min: 6, width: 0, hidden: true }, { min: 7, width: 11.2 }, { min: 8, width: 12.9 }, { min: 9, width: 11.3 },
               { min: 10, width: 26.1 }, { min: 11, width: 9 }, { min: 12, width: 11.3 }, { min: 13, width: 2.3 },
               { min: 14, width: 11.3 }, { min: 15, width: 8.9 }, { min: 16, width: 11.3 }, { min: 17, width: 2.3 }],
        rows: rows1, cells: c1, merges: mg1
    };

    // ── Hoja 2: CO₂ ───────────────────────────────────────────────────────────
    var sheets = [sheet1];
    var co = m.co2, kc = chk.co2;
    if (co && kc) {
        var c2 = [], mg2 = [], rows2 = {};
        var nc = co.rows.length;
        for (var r2 = 2; r2 <= 4; r2++) {
            for (var cc = 2; cc <= 10; cc++) {
                var bb = {};
                if (r2 === 2) bb.top = 'thin';
                if (r2 === 4) bb.bottom = 'thin';
                if (cc === 2) bb.left = 'thin';
                if (cc === 10) bb.right = 'thin';
                c2.push({ r: r2, c: cc, v: (r2 === 2 && cc === 2) ? m.family + ' CO2 Emission Statistical Evaluation' : '', s: st({ sz: 18, border: bb }) });
            }
        }
        mg2.push(rng(2, 2, 4, 10));
        rows2[6] = { height: 16.5 };
        ['VIN', 'raw CO2', 'Corrected CO2', 'declared', 'X', 'Xtests', 's', 'A', 'A-(tP1+tP2)*s', 'A+(tF1-tF2)*s'].forEach(function(t, j) {
            c2.push({ r: 6, c: 2 + j, v: t, s: st({ border: ALL }) });
        });
        var e1 = 7, en = 6 + nc;
        var box = e1 + nc;             // con n = 3 es la fila 10, como en HQ
        var tRow = box + 6;            // la tabla de t (fila 16 con n = 3)
        var tN = Math.max(3, Math.min(nc, 16));
        var tr = tRow + 2 + (tN - 3);  // la fila de la tabla para este n
        var vinList2 = '● ' + m.family + ' \n' + co.rows.map(function(x, i) { return '  ' + (i + 1) + ') ' + x.vin; }).join('\n');
        for (var rv = e1; rv <= box + 3; rv++) c2.push({ r: rv, c: 2, v: rv === e1 ? vinList2 : '', s: st({ h: 'left', wrap: true, border: vBorder(rv, e1, box + 3) }) });
        mg2.push(rng(e1, 2, box + 3, 2));
        var corrF = (co.evc !== 1 || co.fcf !== 1);
        co.rows.forEach(function(x, j) {
            var r = e1 + j;
            rows2[r] = { height: 13.5 };
            c2.push({ r: r, c: 3, v: x.raw == null ? '' : x.raw, s: st({ fill: COP_HQ_YELLOW, numFmt: '0', border: ALL }) });
            var dCell = { r: r, c: 4, v: x.corrected, s: st({ numFmt: '0', border: ALL }) };
            // Si la familia tiene EvC/FCF, el CO₂ corregido es la fórmula con ellos: se ve de dónde sale.
            if (corrF && x.raw != null) dCell.f = ref(r, 3) + '*' + co.evc + '*' + co.fcf;
            c2.push(dCell);
            c2.push({ r: r, c: 5, v: x.declared, s: st({ border: ALL }) });
            c2.push({ r: r, c: 6, f: ref(r, 4) + '/' + ref(r, 5), v: kc.x[j], s: st({ fill: COP_HQ_YELLOW, border: ALL }) });
        });
        var m2 = [
            { c: 7, f: 'AVERAGE(' + rng(e1, 6, en, 6) + ')', v: kc.xtests },
            { c: 8, f: 'SQRT(VAR(' + rng(e1, 6, en, 6) + '))', v: kc.s },
            { c: 9, v: COP_HQ_CO2_A },
            { c: 10, f: ref(e1, 9) + '-(' + ref(tr, 8) + '+' + ref(tr, 9) + ')*' + ref(e1, 8), v: kc.passBound },
            { c: 11, f: ref(e1, 9) + '+(' + ref(tr, 10) + '-' + ref(tr, 11) + ')*' + ref(e1, 8), v: kc.failBound }
        ];
        m2.forEach(function(x) {
            for (var r = e1; r <= en; r++) {
                var cell = { r: r, c: x.c, s: st({ border: vBorder(r, e1, en) }) };
                if (r === e1) { cell.v = x.v; if (x.f) cell.f = x.f; }
                c2.push(cell);
            }
            mg2.push(rng(e1, x.c, en, x.c));
        });
        // Familia + código IP, y el recuadro de la comparación.
        for (var rf = box; rf <= box + 3; rf++) {
            rows2[rf] = { height: 16.5 };
            for (var cf = 3; cf <= 6; cf++) {
                var bf = {};
                if (rf === box) bf.top = 'thin';
                if (cf === 3) bf.left = 'thin';
                c2.push({ r: rf, c: cf, v: (rf === box && cf === 3) ? (m.familyFull || m.family) + (m.ip ? '\n' + m.ip : '') : '', s: st({ sz: 14, wrap: true, border: bf }) });
            }
        }
        mg2.push(rng(box, 3, box + 3, 6));
        mg2.push(rng(box, 7, box, 11));
        c2.push({ r: box + 1, c: 8, v: 'Xtests', s: st({ border: ALL }) });
        c2.push({ r: box + 1, c: 10, v: 'A-(tP1+tP2)*s', s: st({ border: ALL }) });
        c2.push({ r: box + 1, c: 11, v: 'A+(tF1-tF2)*s', s: st({ border: ALL }) });
        c2.push({ r: box + 2, c: 8, f: ref(e1, 7), v: kc.xtests, s: st({ border: ALL }) });
        c2.push({ r: box + 2, c: 9, f: 'IF(' + ref(box + 2, 8) + '<' + ref(box + 2, 10) + ',"<",">")', v: kc.xtests < kc.passBound ? '<' : '>',
                  s: st({ fill: COP_HQ_GREEN, numFmt: '0_);[Red]\\(0\\)', border: ALL }) });
        c2.push({ r: box + 2, c: 10, f: ref(e1, 10), v: kc.passBound, s: st({ border: ALL }) });
        c2.push({ r: box + 2, c: 11, f: ref(e1, 11), v: kc.failBound, s: st({ border: ALL }) });
        var H = ref(box + 2, 8), J = ref(box + 2, 10), K = ref(box + 2, 11);
        c2.push({ r: box + 3, c: 9, f: '_xlfn.IFS(' + H + '<=' + J + ',"PASS",' + H + '>' + K + ',"FAIL",AND(' + H + '>' + J + ',' + H + '<=' + K + '),"ADD")',
                  v: kc.sheet, s: st({ fill: COP_HQ_GREEN, numFmt: '0_);[Red]\\(0\\)', border: ALL }) });
        // La tabla A2/3 de UN R154.
        c2.push({ r: tRow, c: 7, v: 'tests', s: st({ border: { top: 'thin', left: 'thin', right: 'thin' } }) });
        c2.push({ r: tRow + 1, c: 7, v: '', s: st({ border: { bottom: 'thin', left: 'thin', right: 'thin' } }) });
        mg2.push(rng(tRow, 7, tRow + 1, 7));
        c2.push({ r: tRow, c: 8, v: 'PASS', s: st({ border: { top: 'thin', bottom: 'thin', left: 'thin' } }) });
        c2.push({ r: tRow, c: 9, v: '', s: st({ border: { top: 'thin', bottom: 'thin', right: 'thin' } }) });
        c2.push({ r: tRow, c: 10, v: 'FAIL', s: st({ border: { top: 'thin', bottom: 'thin', left: 'thin' } }) });
        c2.push({ r: tRow, c: 11, v: '', s: st({ border: { top: 'thin', bottom: 'thin', right: 'thin' } }) });
        mg2.push(rng(tRow, 8, tRow, 9)); mg2.push(rng(tRow, 10, tRow, 11));
        ['tP1', 'tP2', 'tF1', 'tF2'].forEach(function(t, j) { c2.push({ r: tRow + 1, c: 8 + j, v: t, s: st({ border: ALL }) }); });
        for (var tn = 3; tn <= 16; tn++) {
            var row = co.table[tn], rr = tRow + 2 + (tn - 3);
            c2.push({ r: rr, c: 7, v: tn, s: st({ border: ALL }) });
            [row.tP1, row.tP2, row.tF1, row.tF2].forEach(function(v, j) { c2.push({ r: rr, c: 8 + j, v: v, s: st({ border: ALL }) }); });
        }
        for (var rt = tRow; rt <= tRow + 15; rt++) rows2[rt] = { height: 13.5 };
        if (corrF) {
            c2.push({ r: tRow + 17, c: 2, v: 'Corrected CO2 = raw CO2 × EvC (' + co.evc + ') × FCF (' + co.fcf + ')',
                      s: { font: { name: 'Arial', sz: 10, i: true }, align: { h: 'left', v: 'center' } } });
        }
        sheets.push({
            name: 'CO2 Emissions', showGrid: false, zoom: 70, print: { landscape: true, fitWidth: 1 },
            cols: [{ min: 1, width: 11.3 }, { min: 2, width: 30 }, { min: 3, width: 11.3 }, { min: 4, width: 15 },
                   { min: 5, max: 8, width: 11.3 }, { min: 9, width: 12.4 }, { min: 10, max: 11, width: 15 }],
            rows: rows2, cells: c2, merges: mg2
        });
    }
    return { sheets: sheets, creator: 'KIA EmLab', appVersion: m.appVersion || '' };
}

/**
 * Los datos de un juicio guardado para la hoja de HQ. Lee la mesa CONGELADA del juicio
 * (`j.vehicles`); PM/PN que la mesa no traiga salen de la prueba de VETS de cada VIN;
 * el CO₂ sale de lo congelado (`j.co2.rows`, desde 3.15.0) o, en un juicio anterior,
 * de los ensayos que cuentan hoy (y se avisa).
 * → {model, warnings:[texto], judgment}
 */
function copHqModelFor(j) {
    var warnings = [];
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var rows = (j.vehicles || []).filter(function(r) { return r && r.vin; });
    var vins = rows.map(function(r) { return String(r.vin).trim().toUpperCase(); });
    var best = function(vin) { return typeof _copVinBestTest === 'function' ? _copVinBestTest(vin, j.familyKey, vehicles) : null; };
    var limits = (typeof COP_FUEL_LIMITS !== 'undefined' && COP_FUEL_LIMITS[j.fuelType]) || (typeof COP_PI_LIMITS !== 'undefined' ? COP_PI_LIMITS : []);
    var used = {};
    (j.limitsUsed || []).forEach(function(l) { used[l.id] = l; });
    var statOf = {};
    (j.stats || []).forEach(function(s) { if (s && s.id) statOf[s.id] = s; });
    var num = function(v) { var x = (typeof _copNum === 'function') ? _copNum(v) : parseFloat(v); return (x === null || isNaN(x)) ? null : x; };

    var gases = [];
    limits.forEach(function(p) {
        var lim = used[p.id] || p;
        var raw = rows.map(function(r) {
            var v = num(r.values && r.values[p.id]);
            if (v === null && (p.id === 'PM' || p.id === 'PN') && typeof copVetsPmPn === 'function') v = copVetsPmPn(best(r.vin), p.id);
            return v;
        });
        var faltan = raw.filter(function(v) { return v === null; }).length;
        if (faltan) {
            if (used[p.id] || faltan < raw.length) {
                warnings.push(_copHqGasName(p.id) + ': falta el valor de ' + faltan + ' de ' + raw.length + ' vehículo(s); la hoja sale sin ese gas.');
            } else if (p.id === 'PM' || p.id === 'PN') {
                warnings.push(_copHqGasName(p.id) + ': ninguna prueba trae su valor (ni de VETS ni del COP Master); la hoja sale sin ese gas. Impórtalo con 📥 COP Master.');
            }
            return;
        }
        var s = statOf[p.id];
        var dfo = (s && s.df !== undefined) ? { df: s.df, ki: s.ki || 0 }
                : (typeof copGasDf === 'function' ? copGasDf(p.id, j.fuelType) : { df: 1, ki: 0 });
        gases.push({ id: p.id, limit: lim.limit, unit: lim.unit, isPn: !!(lim.isPn || p.isPn), df: dfo.df, ki: dfo.ki || 0, raw: raw });
    });

    var co2 = null;
    var fcf = (j.co2 && j.co2.fcf) || 1, evc = (j.co2 && j.co2.evc) || 1;
    var src = (j.co2 && Array.isArray(j.co2.rows)) ? j.co2.rows : null;
    if (!src && typeof copCo2RowsFor === 'function') {
        src = copCo2RowsFor(vins, j.familyKey);
        if (j.co2) warnings.push('Este juicio es anterior a 3.15.0 y no guardó sus filas de CO₂: se tomaron los ensayos que cuentan hoy.');
    }
    var co2Rows = (src || []).filter(function(r) { return num(r.measured) !== null && num(r.target) !== null && num(r.target) !== 0; })
        .map(function(r) {
            var meas = num(r.measured);
            return { vin: r.vin, raw: meas, corrected: meas * evc * fcf, declared: num(r.target) };
        });
    if (co2Rows.length >= 3) {
        co2 = { rows: co2Rows, table: COP_CO2_TABLE, evc: evc, fcf: fcf };
    } else if (vins.length) {
        warnings.push('CO₂: hay ' + co2Rows.length + ' vehículo(s) con CO₂ medido y declarado (hacen falta 3); el libro sale sin la hoja de CO₂.');
    }

    var ips = [];
    if (typeof homoIpFamilyForVehicle === 'function') {
        vins.forEach(function(vin) {
            try {
                var r = homoIpFamilyForVehicle(best(vin));
                var code = r && r.family && r.family.code;
                if (code && ips.indexOf(code) < 0) ips.push(code);
            } catch (e) {}
        });
    }
    var model = { family: copHqShortName(j.familyKey, j.familyLabel), familyFull: j.familyLabel || '', ip: ips.join(' / '), vins: vins, gases: gases, co2: co2,
                  appVersion: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '' };

    // ¿La hoja dice lo mismo que el juicio guardado?
    var chk = copHqCheck(model);
    if (!j.method) warnings.push('Este juicio se guardó con el método anterior (U contra A(n)/B(n) de R83); la hoja recalcula con el de HQ.');
    chk.gases.forEach(function(g) {
        if (g.rule === 'CONTINUE') warnings.push(g.name + ': la norma pide otra medición, pero la hoja de HQ escribe "Fail" (no tiene ese caso).');
    });
    var sheetGas = chk.gases.length ? (chk.gases.every(function(g) { return g.sheet === 'Pass'; }) ? 'PASS' : 'FAIL') : null;
    if (sheetGas && j.decision && j.decision !== sheetGas && j.decision !== 'CONTINUE') {
        warnings.push('Gases: la hoja da ' + sheetGas + ' y el juicio guardado dice ' + j.decision + '.');
    }
    if (chk.co2 && j.co2 && j.co2.decision) {
        var want = { PASS: 'PASS', FAIL: 'FAIL', CONTINUE: 'ADD' }[j.co2.decision];
        if (want && want !== chk.co2.sheet) warnings.push('CO₂: la hoja da ' + chk.co2.sheet + ' (UN R154) y el juicio guardado dice ' + j.co2.decision + '.');
    }
    return { model: model, warnings: warnings, check: chk };
}

/**
 * Nombre corto de la familia para la hoja (la de HQ lleva un nombre corto, no la clave entera): modelo,
 * motor, transmisión, carrocería y año, de la clave de 8 segmentos. PURA.
 */
function copHqShortName(familyKey, label) {
    var p = String(familyKey || '').split('|');
    if (p.length < 8) return String(label || familyKey || '');
    var my = /(\d{2,4})/.exec(p[3] || '');
    var yr = /CAL/i.test(p[3] || '') ? String(p[3]).trim() : (my ? 'MY' + my[1] : '');
    return [p[0], p[1], p[2], p[7], yr].filter(function(x) { return x && String(x).trim(); }).join(' ');
}

/** Nombre del archivo: CoP_HQ_<familia>_<fecha del juicio>.xlsx (solo caracteres seguros). */
function copHqFileName(j) {
    var fam = String(j.familyLabel || j.familyKey || 'familia').replace(/[^A-Za-z0-9.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
    return 'CoP_HQ_' + fam + '_' + String(j.date || '').slice(0, 10) + '.xlsx';
}

/** Un clic: arma la hoja de HQ del juicio guardado `id` y la descarga. */
function copHqXlsxExport(id) {
    var j = (typeof copState !== 'undefined' && copState.saved || []).find(function(r) { return r.id === id; });
    if (!j) { showToast('Ese juicio ya no existe.', 'error'); return Promise.resolve(false); }
    if (j.evidencePurged || !(j.vehicles || []).some(function(r) { return r && r.vin; })) {
        showToast('Este juicio ya no guarda sus VINes (se compactó por antigüedad): no se puede llenar la hoja de HQ.', 'error');
        return Promise.resolve(false);
    }
    var res;
    try { res = copHqModelFor(j); } catch (e) {
        showToast('No se pudo juntar los datos: ' + (e && e.message ? e.message : e) + '. Usa 🐞 para reportarlo.', 'error');
        return Promise.resolve(false);
    }
    if (res.model.vins.length < 3) { showToast('El juicio tiene menos de 3 vehículos: la hoja de HQ necesita al menos 3.', 'error'); return Promise.resolve(false); }
    if (!res.model.gases.length) { showToast('Ningún gas tiene el valor de todos los vehículos: no hay qué evaluar.', 'error'); return Promise.resolve(false); }
    var name = copHqFileName(j);
    return xwBuildCompressed(copHqXlsxSpec(res.model)).then(function(bytes) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function() { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 1500);
        if (typeof auditLog === 'function') auditLog('cop', 'cop_hq_xlsx', { type: 'cop', label: j.familyLabel || j.familyKey || '' },
            'Hoja de HQ del juicio del ' + String(j.date || '').slice(0, 10), {
                after: { judgment: j.id, vehicles: res.model.vins.length, gases: res.model.gases.map(function(g) { return g.id; }),
                         co2: !!res.model.co2, warnings: res.warnings.length } });
        if (res.warnings.length) showToast('Descargado: ' + name + '. Revisa: ' + res.warnings.join(' · '), 'warning', 14000);
        else showToast('Descargado: ' + name, 'success');
        return true;
    }).catch(function(e) {
        showToast('No se pudo armar el Excel: ' + (e && e.message ? e.message : e) + '. Usa 🐞 para reportarlo.', 'error');
        return false;
    });
}

// ══════════════════════════════════════════════════════════════════════
// [3.16.0] COP Master del laboratorio (compilado de los exports del ICMS)
//
// El laboratorio lleva un Excel "COP Master — Emisiones" con un renglón por prueba: los
// resultados crudos (CO, THC, NOx, NMHC, PM, PN en mg/km o #/km, CO₂ en g/km), el EvC y el
// FCF con que se corrigió el CO₂, y a la derecha el renglón completo del export del ICMS
// de esa Work Order. Importarlo llena lo que la plataforma no tenía:
//   · PM y PN de las pruebas liberadas sin VETS → vehicle.testData.extResults (evidencia
//     aparte: NUNCA se escribe en gasResults, que es lo que firmaron liberador y aprobador);
//   · la ficha del ICMS del vehículo (homoIcmsBatchPlan / homoIcmsBatchApply, las de siempre);
//   · el EvC/FCF de la familia, si el Master trae uno solo para toda la familia.
// Lo demás (CO, THC, NOx, NMHC, CO₂) solo se COMPARA contra lo aprobado y se avisa si difiere.
// ══════════════════════════════════════════════════════════════════════

var COP_MASTER_GASES = [
    ['CO', /^raw co \(mg\/km\)$/, 0.001], ['THC', /^raw thc \(mg\/km\)$/, 0.001],
    ['NOx', /^raw nox \(mg\/km\)$/, 0.001], ['NMHC', /^raw nmhc \(mg\/km\)$/, 0.001]
];

function _cmFold(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function _cmNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim();
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
    var n = parseFloat(s); return isFinite(n) ? n : null;
}
/** Fecha de Excel (número de serie o texto) → 'AAAA-MM-DD'. PURA. */
function _cmDate(v) {
    var n = _cmNum(v);
    if (n !== null && n > 20000 && n < 80000) {
        var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
        return d.toISOString().slice(0, 10);
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? m[0] : '';
}

/**
 * La hoja Registro_COP (retícula 0-based) → {rows, error}. PURA. Se lee por ENCABEZADO.
 * rows = [{rowNo, vin, date, wo, raw:{CO,THC,NOx,NMHC,PM (g/km), PN (#/km)}, co2:{raw, evc, fcf, declared}, icms}]
 */
function copMasterParse(grid) {
    grid = grid || [];
    var H = -1;
    for (var i = 0; i < Math.min(grid.length, 10) && H < 0; i++) {
        var f = (grid[i] || []).map(_cmFold);
        if (f.indexOf('vin') >= 0 && f.indexOf('fecha de prueba') >= 0) H = i;
    }
    if (H < 0) return { error: 'No encontré los encabezados "VIN" y "Fecha de prueba". ¿Es la hoja Registro_COP del COP Master?' };
    var hdr = (grid[H] || []).map(_cmFold);
    var col = function(re) { for (var c = 0; c < hdr.length; c++) if (re.test(hdr[c])) return c; return -1; };
    var cVin = hdr.indexOf('vin'), cDate = hdr.indexOf('fecha de prueba');
    var cWo = col(/^work order no\.?$/), cCo2 = col(/^raw co2 \(g\/km\)$/), cEvc = col(/^evc$/), cFcf = col(/^fcf$/);
    var cDecl = col(/^co2 declarado icms/), cPm = col(/^pm \(mg\/km\)$/), cPn = col(/^pn \(#\/km\)$/);
    var cIcms = col(/^company code$/);
    var gasCols = COP_MASTER_GASES.map(function(g) { return { id: g[0], c: col(g[1]), k: g[2] }; });
    var icmsHead = cIcms >= 0 ? (grid[H] || []).slice(cIcms) : null;
    var rows = [];
    for (var r = H + 1; r < grid.length; r++) {
        var line = grid[r] || [];
        var vin = String(line[cVin] == null ? '' : line[cVin]).trim().toUpperCase();
        if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) continue;
        var raw = {};
        gasCols.forEach(function(g) { var v = g.c >= 0 ? _cmNum(line[g.c]) : null; if (v !== null) raw[g.id] = v * g.k; });
        var pm = cPm >= 0 ? _cmNum(line[cPm]) : null, pn = cPn >= 0 ? _cmNum(line[cPn]) : null;
        if (pm !== null) raw.PM = pm * 0.001;
        if (pn !== null) raw.PN = pn;
        var icms = null;
        if (icmsHead && typeof homoIcmsRows === 'function') {
            var p = homoIcmsRows([icmsHead, line.slice(cIcms)]);
            if (!p.error && p.rows.length) icms = p.rows[0];
        }
        rows.push({
            rowNo: r + 1, vin: vin, date: _cmDate(line[cDate]),
            wo: cWo >= 0 ? String(line[cWo] == null ? '' : line[cWo]).trim() : '',
            raw: raw,
            co2: { raw: cCo2 >= 0 ? _cmNum(line[cCo2]) : null, evc: cEvc >= 0 ? _cmNum(line[cEvc]) : null,
                   fcf: cFcf >= 0 ? _cmNum(line[cFcf]) : null, declared: cDecl >= 0 ? _cmNum(line[cDecl]) : null },
            icms: icms
        });
    }
    if (!rows.length) return { error: 'La hoja no tiene renglones con VIN.' };
    return { rows: rows };
}

/** ¿El valor del Master coincide con el capturado, a la precisión con que se capturó? PURA. */
function copMasterSameValue(stored, master) {
    var a = _cmNum(stored);
    if (a === null || master === null || master === undefined) return null;
    var s = String(stored);
    var dec = /e/i.test(s) ? 6 : (s.split('.')[1] || '').length;
    var p = Math.pow(10, dec);
    if (Math.round(master * p) / p === Math.round(a * p) / p) return true;
    return Math.abs(master - a) <= Math.max(Math.abs(a), Math.abs(master)) * 0.005;   // 0.5 %
}

function _cmExt(v) { return (v && v.testData && v.testData.extResults && v.testData.extResults.values) || {}; }
function _cmVets(v, k) {
    var g = v && v.testData && v.testData.vets && v.testData.vets.gases && v.testData.vets.gases[k];
    return g ? g : null;
}

/**
 * Qué haría la importación con cada renglón. PURA (recibe los vehículos).
 * → [{row, vehicleId, vin, status, approved, action:'sin-vehiculo'|'ambigua'|'ok', pmpn:'llenar'|'corregir'|'igual'|'vets'|'sin-dato',
 *     pmpnValues, checks:[{gas, master, stored, same}], ficha:{action,…}|null, familyKey}]
 */
function copMasterPlan(rows, vehicles, opts) {
    opts = opts || {};
    var all = (vehicles || []).filter(function(v) { return v && v.vin; });
    var testDate = opts.testDate || (typeof vehicleTestDate === 'function' ? vehicleTestDate : function(v) { return ((v.testData || {}).testDatetime || '').slice(0, 10); });
    var famKey = opts.familyKey || (typeof copVehicleFamilyKey === 'function' ? copVehicleFamilyKey : function() { return ''; });
    var approved = opts.approved || (typeof copResultApproved === 'function' ? copResultApproved : function(v) { return v.status === 'archived'; });
    return (rows || []).map(function(row) {
        var e = { row: row, vin: row.vin };
        var cand = all.filter(function(v) { return String(v.vin).trim().toUpperCase() === row.vin; });
        if (cand.length > 1 && row.date) {
            var mismoDia = cand.filter(function(v) { return testDate(v) === row.date; });
            if (mismoDia.length === 1) cand = mismoDia;
        }
        if (!cand.length) { e.action = 'sin-vehiculo'; return e; }
        if (cand.length > 1) { e.action = 'ambigua'; e.vehicles = cand.map(function(v) { return v.id; }); return e; }
        var v = cand[0];
        e.action = 'ok'; e.vehicleId = v.id; e.status = v.status || ''; e.approved = !!approved(v);
        e.familyKey = famKey(v);
        e.dateMismatch = !!(row.date && testDate(v) && testDate(v) !== row.date);
        // PM / PN
        var want = {}, ext = _cmExt(v), diffs = [], need = false, vetsHas = false;
        ['PM', 'PN'].forEach(function(k) {
            if (row.raw[k] === undefined) return;
            if (_cmVets(v, k)) { vetsHas = true; return; }
            want[k] = row.raw[k];
            if (ext[k] === undefined || ext[k] === null) need = true;
            else if (!copMasterSameValue(ext[k], row.raw[k])) diffs.push(k);
        });
        e.pmpnValues = want;
        e.pmpn = !Object.keys(want).length ? (vetsHas ? 'vets' : 'sin-dato') : diffs.length ? 'corregir' : need ? 'llenar' : 'igual';
        // Comparación con lo aprobado
        var gr = (v.testData && v.testData.gasResults) || {};
        var vals = (gr.aprobador && gr.aprobador.values) || (gr.liberador && gr.liberador.values) || {};
        var prof = gr.liberador && gr.liberador.profile && gr.liberador.profile.gases || [];
        var unitOf = function(f) { var g = prof.filter(function(x) { return x.field === f; })[0]; return g && g.unit || 'g/km'; };
        e.checks = [];
        COP_MASTER_GASES.forEach(function(g) {
            var id = g[0];
            if (row.raw[id] === undefined || vals[id] === undefined || vals[id] === '') return;
            var m = row.raw[id];
            if (typeof gasConvert === 'function') m = gasConvert(m, 'g/km', unitOf(id));
            e.checks.push({ gas: id, master: m, stored: vals[id], unit: unitOf(id), same: copMasterSameValue(vals[id], m) });
        });
        var co2 = vals.CO2 !== undefined ? vals.CO2 : vals.co2;
        if (row.co2.raw !== null && co2 !== undefined && co2 !== '') {
            e.checks.push({ gas: 'CO2', master: row.co2.raw, stored: co2, unit: 'g/km', same: copMasterSameValue(co2, row.co2.raw) });
        }
        // Ficha del ICMS
        e.ficha = null;
        if (row.icms && typeof homoIcmsBatchPlan === 'function') {
            var item = { fileName: 'COP Master · renglón ' + row.rowNo, tail: row.vin, row: row.icms };
            var pl = homoIcmsBatchPlan([item], [v])[0];
            e.ficha = { action: pl.action, diffs: pl.diffs || [], blanks: pl.blanks || [], item: item };
            // La Work Order capturada en el campo "MC code" (y la WO vacía): no es un coeficiente
            // distinto, es la etiqueta equivocada. Se reacomoda aunque la prueba esté cerrada.
            if (pl.action === 'bloqueado' && pl.diffs && pl.diffs.length && pl.diffs.every(function(d) {
                return d.key === 'mcCode' && _cmFold(d.antes) === _cmFold(row.icms.workOrder) && !(v.homolog && v.homolog.workOrder);
            })) e.ficha.action = 'reetiquetar';
        }
        return e;
    });
}

/** EvC/FCF por familia, de los renglones que encontraron vehículo: uno solo por familia o nada. PURA. */
function copMasterFactors(plan) {
    var fam = {};
    (plan || []).forEach(function(e) {
        if (e.action !== 'ok' || !e.familyKey || e.row.co2.evc === null || e.row.co2.fcf === null) return;
        var f = fam[e.familyKey] = fam[e.familyKey] || { key: e.familyKey, values: {} };
        f.values[e.row.co2.evc + '|' + e.row.co2.fcf] = { evc: e.row.co2.evc, fcf: e.row.co2.fcf };
    });
    return Object.keys(fam).map(function(k) {
        var vs = Object.keys(fam[k].values).map(function(x) { return fam[k].values[x]; });
        return { key: k, unique: vs.length === 1, evc: vs.length === 1 ? vs[0].evc : null, fcf: vs.length === 1 ? vs[0].fcf : null, variants: vs };
    });
}

/**
 * Aplica lo que la persona vio (`plan`) contra el db de ESTE momento. PM/PN con `cop.judge`;
 * la ficha del ICMS con `homolog.manage` (por homoIcmsBatchApply, que lo pide); los factores
 * de familia con `cop.judge`. Todo a la línea de tiempo y a la auditoría con antes/después.
 */
function copMasterApply(plan, opts) {
    opts = opts || {};
    if (typeof authRequire === 'function' && !authRequire('cop.judge', 'importar el COP Master')) return null;
    var who = (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('Laboratorio') : '';
    var now = new Date().toISOString();
    var fresh = copMasterPlan(plan.map(function(e) { return e.row; }), db.vehicles || []);
    var pmpn = 0, undo = [];
    fresh.forEach(function(e, i) {
        var seen = plan[i];
        if (e.action !== 'ok' || !(e.pmpn === 'llenar' || e.pmpn === 'corregir')) return;
        if (seen && seen.pmpn !== e.pmpn) return;               // cambió mientras se revisaba
        var v = (db.vehicles || []).filter(function(x) { return x.id === e.vehicleId; })[0];
        if (!v) return;
        v.testData = v.testData || {};
        var before = v.testData.extResults ? JSON.parse(JSON.stringify(v.testData.extResults)) : null;
        undo.push({ v: v, ext: v.testData.extResults, tl: (v.timeline || []).length });
        var values = Object.assign({}, (before && before.values) || {}, e.pmpnValues);
        v.testData.extResults = { source: 'cop-master', file: opts.fileName || '', row: e.row.rowNo, by: who, at: now,
                                  values: values, units: { PM: 'g/km', PN: '#/km' } };
        v.timeline = v.timeline || [];
        v.timeline.push({ timestamp: now, user: who,
            action: 'PM/PN cargados del COP Master (renglón ' + e.row.rowNo + ')',
            data: { modified: Object.keys(e.pmpnValues).map(function(k) {
                return { campo: k, key: k, antes: before && before.values && before.values[k] != null ? before.values[k] : '', despues: e.pmpnValues[k],
                         razon: 'COP Master «' + (opts.fileName || '') + '»' };
            }), source: 'cop-master' } });
        if (typeof auditLog === 'function') auditLog('cop', 'cop_master_pmpn', { type: 'vehicle', id: v.id, label: v.vin },
            'PM/PN del COP Master (renglón ' + e.row.rowNo + ')', { before: before && before.values, after: values });
        pmpn++;
    });
    if (pmpn && typeof saveDB === 'function' && saveDB() === false) {
        undo.forEach(function(u) { u.v.testData.extResults = u.ext; u.v.timeline.length = u.tl; });
        return { error: 'No se pudo guardar (almacenamiento lleno). No se cambió ningún vehículo.' };
    }
    // Fichas del ICMS: solo llenar/completar/corregir (un vehículo enviado o liberado con
    // valores distintos queda 'bloqueado' y no se toca).
    var fichas = 0, fichaErr = '';
    var picks = [], items = [];
    fresh.forEach(function(e) {
        if (e.action !== 'ok' || !e.ficha || !/^(llenar|completar|corregir)$/.test(e.ficha.action)) return;
        picks.push({ i: items.length, action: e.ficha.action });
        items.push(Object.assign({}, e.ficha.item, { fileName: (opts.fileName || 'COP Master') + ' · renglón ' + e.row.rowNo }));
    });
    var canHomo = typeof authCan !== 'function' || authCan('homolog.manage');
    var reet = fresh.filter(function(e) { return e.action === 'ok' && e.ficha && e.ficha.action === 'reetiquetar'; });
    if (reet.length && opts.fichas !== false) {
        if (!canHomo) fichaErr = 'Las fichas del ICMS piden el permiso de homologación: quedaron sin cargar.';
        else {
            var changed = 0, undoH = [];
            reet.forEach(function(e) {
                var v = (db.vehicles || []).filter(function(x) { return x.id === e.vehicleId; })[0];
                if (!v || !v.homolog) return;
                var before = JSON.parse(JSON.stringify(v.homolog));
                undoH.push({ v: v, h: v.homolog, tl: (v.timeline || []).length });
                var next = Object.assign({}, v.homolog), mods = [];
                var ficha = homoFichaFromIcms(e.row.icms, {});
                next.workOrder = before.mcCode; mods.push({ campo: 'Work Order', key: 'workOrder', antes: '', despues: before.mcCode, razon: 'Estaba capturada en el campo MC code' });
                next.mcCode = ficha.mcCode; mods.push({ campo: 'MC code', key: 'mcCode', antes: before.mcCode, despues: ficha.mcCode, razon: 'MC code del ICMS (COP Master)' });
                (e.ficha.blanks || []).forEach(function(k) {
                    if (k === 'workOrder' || ficha[k] == null || ficha[k] === '') return;
                    next[k] = ficha[k]; mods.push({ campo: k, key: k, antes: '', despues: ficha[k], razon: 'Vacío; del ICMS (COP Master)' });
                });
                ['ocn', 'wvta', 'variant', 'version'].forEach(function(k) { if (!next[k] && ficha[k]) next[k] = ficha[k]; });
                v.homolog = next;
                v.timeline = v.timeline || [];
                v.timeline.push({ timestamp: now, user: who, action: 'Ficha de homologación reacomodada desde el COP Master (la WO estaba en el campo MC code)',
                                  data: { modified: mods, source: 'cop-master' } });
                if (typeof auditLog === 'function') auditLog('homolog', 'homologacion_icms', { type: 'vehicle', id: v.id, label: v.vin },
                    'reetiquetar desde el COP Master: ' + mods.map(function(m) { return m.campo + ' ' + m.antes + '→' + m.despues; }).join(', '),
                    { before: { mcCode: before.mcCode, workOrder: before.workOrder || '' }, after: { mcCode: next.mcCode, workOrder: next.workOrder } });
                changed++;
            });
            if (changed && typeof saveDB === 'function' && saveDB() === false) {
                undoH.forEach(function(u) { u.v.homolog = u.h; u.v.timeline.length = u.tl; });
                fichaErr = 'No se pudo guardar el reacomodo de fichas (almacenamiento lleno).';
            } else fichas += changed;
        }
    }
    if (items.length && opts.fichas !== false && typeof homoIcmsBatchApply === 'function') {
        if (canHomo) {
            var hr = homoIcmsBatchApply(items, picks);
            if (hr && hr.error) fichaErr = hr.error; else if (hr) fichas += hr.aplicados;
        } else fichaErr = 'Las fichas del ICMS piden el permiso de homologación: quedaron sin cargar.';
    }
    // Factores de familia
    var fams = 0;
    if (opts.factors !== false && typeof copFamilyState === 'function') {
        copMasterFactors(fresh).forEach(function(f) {
            if (!f.unique) return;
            var st = copFamilyState(f.key);
            if (st.co2Evc === f.evc && st.co2Fcf === f.fcf) return;
            var before = { evc: st.co2Evc || null, fcf: st.co2Fcf || null };
            st.co2Evc = f.evc; st.co2Fcf = f.fcf; st.updatedAt = now; st.updatedBy = who;
            fams++;
            if (typeof auditLog === 'function') auditLog('cop', 'co2_factors_set', { type: 'cop', label: f.key },
                'Del COP Master: FCF=' + f.fcf + ' · Evolution Factor=' + f.evc, { before: before, after: { evc: f.evc, fcf: f.fcf } });
        });
        if (fams && typeof copPersist === 'function') { copPersist(); if (typeof _copPushNow === 'function') _copPushNow(); }
    }
    if (typeof copInvalidateCache === 'function') copInvalidateCache();
    return { pmpn: pmpn, fichas: fichas, familias: fams, fichaErr: fichaErr };
}

// ── UI ──
var _cmPending = null;
function copMasterImportOpen() {
    if (typeof authRequire === 'function' && !authRequire('cop.judge', 'importar el COP Master')) return;
    _cmPending = null;
    showModal({
        title: '📥 Importar COP Master (ICMS)',
        body: '<p>Sube el <b>COP Master — Emisiones</b> (.xlsx). De cada renglón se toman PM y PN para las pruebas que no los traen de VETS, ' +
              'la ficha del ICMS del vehículo y el EvC/FCF de la familia. CO, THC, NOx, NMHC y CO₂ solo se comparan con lo aprobado: no se reescriben.</p>' +
              '<input type="file" accept=".xlsx" onchange="copMasterFile(event)" aria-label="Archivo COP Master">' +
              '<div id="cm-preview" style="margin-top: var(--space-md);"></div>',
        buttons: [{ label: 'Cancelar' }, { label: 'Importar', cls: 'btn-primary', onclick: copMasterConfirm }]
    });
}

function copMasterFile(ev) {
    var f = ev && ev.target && ev.target.files && ev.target.files[0];
    var box = document.getElementById('cm-preview');
    if (!f || !box) return;
    box.innerHTML = '<p class="u-muted">Leyendo ' + escapeHtml(f.name) + '…</p>';
    var rd = new FileReader();
    rd.onload = function() {
        vetsReadWorkbook(new Uint8Array(rd.result), null).then(function(sheets) {
            var parsed = null;
            var names = Object.keys(sheets).sort(function(a, b) { return (/registro/i.test(b) ? 1 : 0) - (/registro/i.test(a) ? 1 : 0); });
            names.some(function(k) { var p = copMasterParse(_homoGridFromSheet(sheets[k])); if (!p.error) { parsed = p; return true; } return false; });
            if (!parsed) throw new Error('No encontré la hoja Registro_COP (encabezados "VIN" y "Fecha de prueba").');
            var plan = copMasterPlan(parsed.rows, (typeof db !== 'undefined' && db.vehicles) || []);
            _cmPending = { plan: plan, fileName: f.name };
            box.innerHTML = copMasterPreviewHTML(plan);
        }).catch(function(err) {
            _cmPending = null;
            box.innerHTML = '<p style="color:var(--danger-text);">' + escapeHtml(err && err.message || String(err)) + '</p>';
        });
    };
    rd.readAsArrayBuffer(f);
}

/** Vista previa: qué pasa con cada renglón. PURA (solo arma HTML). */
function copMasterPreviewHTML(plan) {
    var e = typeof escapeHtml === 'function' ? escapeHtml : function(s) { return String(s); };
    var PM = { llenar: 'Se llenan', corregir: 'Se corrigen', igual: 'Ya están', vets: 'Vienen de VETS', 'sin-dato': '—' };
    var FI = { llenar: 'Se llena', completar: 'Se completa', corregir: 'Se corrige', igual: 'Igual', reetiquetar: 'Se reacomoda (la WO estaba como MC code)', bloqueado: 'Distinta (prueba cerrada: no se toca)', 'no-europa': 'No es Europa', ambigua: 'Ambigua', 'sin-vehiculo': '—' };
    var ok = plan.filter(function(x) { return x.action === 'ok'; });
    var diffs = 0;
    var h = '<p><b>' + plan.length + '</b> renglones · <b>' + ok.length + '</b> con vehículo en la plataforma.</p>';
    h += '<div style="overflow:auto;max-height:320px;"><table class="u-cards" style="width:100%;border-collapse:collapse;font-size: var(--fs-sm);"><thead><tr>' +
        '<th>Renglón</th><th>VIN</th><th>Fecha</th><th>PM / PN</th><th>Ficha ICMS</th><th>Contra lo aprobado</th></tr></thead><tbody>';
    plan.forEach(function(x) {
        var chk = (x.checks || []).filter(function(c) { return c.same === false; });
        diffs += chk.length;
        h += '<tr style="border-top:1px solid var(--border);"><td>' + x.row.rowNo + '</td><td>' + e(x.vin) + '</td><td>' + e(x.row.date) + (x.dateMismatch ? ' ⚠' : '') + '</td>';
        if (x.action !== 'ok') { h += '<td colspan="3" class="u-muted">' + (x.action === 'ambigua' ? 'Varias pruebas de ese VIN: no se adivina' : 'Sin vehículo en la plataforma') + '</td></tr>'; return; }
        h += '<td>' + PM[x.pmpn] + (x.approved ? '' : ' <span class="u-muted">(prueba sin aprobar)</span>') + '</td>' +
             '<td>' + (x.ficha ? (FI[x.ficha.action] || x.ficha.action) + (x.ficha.action === 'bloqueado' ? ': ' + e(x.ficha.diffs.filter(function(d) { return d.key !== 'mcCode'; }).map(function(d) { return d.label + ' ' + d.antes + ' vs ' + d.despues; }).join(', ')) : '') : '—') + '</td>' +
             '<td>' + (chk.length ? '<span style="color:var(--warn-text);">⚠ ' + chk.map(function(c) { return c.gas + ' ' + c.stored + ' vs ' + (+c.master.toPrecision(4)); }).join(', ') + '</span>'
                                  : ((x.checks || []).length ? '✓ coincide' : '—')) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    var fam = copMasterFactors(plan);
    if (fam.length) {
        h += '<p style="margin-top: var(--space-sm);"><b>EvC / FCF por familia:</b> ' + fam.map(function(f) {
            return e(String(f.key).split('|').slice(0, 3).join(' ')) + ' → ' + (f.unique ? 'EvC ' + f.evc + ' · FCF ' + f.fcf : 'varios valores, no se cambia');
        }).join('; ') + '</p>';
    }
    if (diffs) h += '<p style="color:var(--warn-text);">⚠ ' + diffs + ' valor(es) del Master no coinciden con lo aprobado. No se cambian: revísalos (puede ser otra prueba del mismo VIN).</p>';
    return h;
}

function copMasterConfirm() {
    if (!_cmPending) { showToast('Primero elige el archivo.', 'warning'); return; }
    var res = copMasterApply(_cmPending.plan, { fileName: _cmPending.fileName });
    _cmPending = null;
    var m = document.getElementById('globalModal'); if (m) m.remove();
    if (!res) return;
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('COP Master: PM/PN en ' + res.pmpn + ' prueba(s), ' + res.fichas + ' ficha(s) del ICMS, factores de ' + res.familias + ' familia(s).' +
              (res.fichaErr ? ' ' + res.fichaErr : ''), res.fichaErr ? 'warning' : 'success', 9000);
    if (typeof copRender === 'function') copRender();
}
