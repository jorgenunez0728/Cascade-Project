// ╔══════════════════════════════════════════════════════════════════════╗
// ║  xlsxw.js — escritor de .xlsx propio (2.32.0)                          ║
// ╚══════════════════════════════════════════════════════════════════════╝
// La red del laboratorio bloquea CDNs y la versión comunitaria de SheetJS no da estilo
// a las celdas, así que el libro de auditoría se escribe aquí: OOXML mínimo dentro de
// un ZIP sin compresión ("store"). Es PURO (sin DOM, sin red, sin reloj): el mismo
// `spec` produce SIEMPRE los mismos bytes. Eso es lo que permite que la plantilla que se
// genera en Node y el archivo que exporta la plataforma sean idénticos.
//
// spec = { sheets: [sheet], creator?, appVersion? }
// sheet = {
//   name, hidden, tabColor:'RRGGBB', showGrid:false,
//   cols: [{min, max, width, hidden}],
//   rows: {rowNumber: {height, hidden}},
//   cells: [{r, c, v, f, s}]   r/c base 1; v = texto | número | booleano | {date:'YYYY-MM-DD'};
//                                f = fórmula sin '=' (v es su valor ya calculado)
//   merges: ['A1:B2'], freeze: {row, col} (primera celda que NO se congela),
//   validations: [{sqref, list:'Lists!$A$2:$A$90' | ['a','b'], allowOther:true}],
//   cf: [{sqref, type:'containsText', text, style} | {sqref, type:'expression', formula, style}],
//   autoFilter: 'A3:E40', print: {landscape, fitWidth:1}
// }
// style = { font:{b, i, sz, color:'RRGGBB', name}, fill:'RRGGBB',
//           border:'thin'|'medium'|{top,bottom,left,right}, align:{h, v, wrap, indent},
//           numFmt:'yyyy-mm-dd' }

var XW_EPOCH = Date.UTC(1899, 11, 30);   // día 0 de Excel (sistema 1900, con el 29-feb ficticio)

function xwColName(c) {
    var s = '';
    while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
    return s;
}
function xwRef(r, c, abs) { return abs ? '$' + xwColName(c) + '$' + r : xwColName(c) + r; }
function xwRange(r1, c1, r2, c2, abs) { return xwRef(r1, c1, abs) + ':' + xwRef(r2, c2, abs); }

/** 'YYYY-MM-DD' → número de serie de Excel (sin zona horaria). */
function xwDateSerial(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - XW_EPOCH) / 86400000);
}

function _xwEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        // caracteres de control que XML no admite
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function _xwUtf8(str) {
    // TextEncoder produce los mismos bytes y es mucho más rápido; el lazo es el respaldo.
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
            var d = str.charCodeAt(i + 1);
            if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
        }
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
}

var _xwCrcTable = null;
function _xwCrc32(bytes) {
    if (!_xwCrcTable) {
        _xwCrcTable = [];
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            _xwCrcTable[n] = c >>> 0;
        }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = _xwCrcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * ZIP. files = [{name, data:bytes, deflated?:bytes}]. Con `deflated` la entrada va comprimida
 * (método 8); sin él, sin compresión ("store"). Fecha fija (1-ene-1980): determinista.
 */
function xwZip(files) {
    var parts = [], central = [], offset = 0;
    var u16 = function(a, v) { a.push(v & 0xFF, (v >>> 8) & 0xFF); };
    var u32 = function(a, v) { a.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); };
    files.forEach(function(f) {
        var name = _xwUtf8(f.name), data = f.data, crc = _xwCrc32(data);
        var body = f.deflated || data, method = f.deflated ? 8 : 0;
        var h = [];
        u32(h, 0x04034b50); u16(h, 20); u16(h, 0x0800); u16(h, method); u16(h, 0); u16(h, 0x0021);
        u32(h, crc); u32(h, body.length); u32(h, data.length); u16(h, name.length); u16(h, 0);
        var cd = [];
        u32(cd, 0x02014b50); u16(cd, 20); u16(cd, 20); u16(cd, 0x0800); u16(cd, method); u16(cd, 0); u16(cd, 0x0021);
        u32(cd, crc); u32(cd, body.length); u32(cd, data.length); u16(cd, name.length);
        u16(cd, 0); u16(cd, 0); u16(cd, 0); u16(cd, 0); u32(cd, 0); u32(cd, offset);
        parts.push(h, name, body);
        central.push(cd, name);
        offset += h.length + name.length + body.length;
    });
    var cdSize = central.reduce(function(s, p) { return s + p.length; }, 0);
    var end = [];
    u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, files.length); u16(end, files.length);
    u32(end, cdSize); u32(end, offset); u16(end, 0);
    var all = parts.concat(central, [end]);
    var total = all.reduce(function(s, p) { return s + p.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function(p) {
        if (p instanceof Uint8Array) { out.set(p, pos); pos += p.length; }
        else { for (var i = 0; i < p.length; i++) out[pos++] = p[i]; }
    });
    return out;
}

// ── Estilos ─────────────────────────────────────────────────────────────────

function _xwStyles() {
    var S = {
        fonts: ['<font><sz val="10"/><name val="Calibri"/><family val="2"/></font>'],
        fills: ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
        borders: ['<border><left/><right/><top/><bottom/><diagonal/></border>'],
        numFmts: [], xfs: ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'],
        dxfs: [], keys: {}
    };
    var idx = function(list, xml) { var i = list.indexOf(xml); if (i < 0) { list.push(xml); i = list.length - 1; } return i; };
    S.font = function(f) {
        if (!f) return 0;
        return idx(S.fonts, '<font>' + (f.b ? '<b/>' : '') + (f.i ? '<i/>' : '') + (f.u ? '<u/>' : '') +
            '<sz val="' + (f.sz || 10) + '"/>' + (f.color ? '<color rgb="FF' + f.color + '"/>' : '') +
            '<name val="' + _xwEsc(f.name || 'Calibri') + '"/><family val="2"/></font>');
    };
    S.fill = function(c) { return c ? idx(S.fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + c + '"/><bgColor indexed="64"/></patternFill></fill>') : 0; };
    S.border = function(b) {
        if (!b) return 0;
        var side = function(k) {
            var st = typeof b === 'string' ? b : b[k];
            return st ? '<' + k + ' style="' + st + '"><color rgb="FF9CA3AF"/></' + k + '>' : '<' + k + '/>';
        };
        return idx(S.borders, '<border>' + side('left') + side('right') + side('top') + side('bottom') + '<diagonal/></border>');
    };
    S.numFmt = function(code) {
        if (!code) return 0;
        var builtin = { '0': 1, '0.00': 2, '#,##0': 3, '0%': 9 };
        if (builtin[code]) return builtin[code];
        var i = S.numFmts.indexOf(code);
        if (i < 0) { S.numFmts.push(code); i = S.numFmts.length - 1; }
        return 164 + i;
    };
    S.xf = function(st) {
        if (!st) return 0;
        var key = JSON.stringify(st);
        if (S.keys[key] !== undefined) return S.keys[key];
        var fo = S.font(st.font), fi = S.fill(st.fill), bo = S.border(st.border), nf = S.numFmt(st.numFmt);
        var al = st.align;
        var x = '<xf numFmtId="' + nf + '" fontId="' + fo + '" fillId="' + fi + '" borderId="' + bo + '" xfId="0"' +
            (nf ? ' applyNumberFormat="1"' : '') + (fo ? ' applyFont="1"' : '') + (fi ? ' applyFill="1"' : '') +
            (bo ? ' applyBorder="1"' : '') + (al ? ' applyAlignment="1"><alignment' +
                (al.h ? ' horizontal="' + al.h + '"' : '') + (al.v ? ' vertical="' + al.v + '"' : '') +
                (al.wrap ? ' wrapText="1"' : '') + (al.indent ? ' indent="' + al.indent + '"' : '') +
                (al.shrink ? ' shrinkToFit="1"' : '') + '/></xf>' : '/>');
        S.xfs.push(x);
        S.keys[key] = S.xfs.length - 1;
        return S.keys[key];
    };
    S.dxf = function(st) {
        var x = '<dxf>' + (st.font ? '<font>' + (st.font.b ? '<b/>' : '') + (st.font.color ? '<color rgb="FF' + st.font.color + '"/>' : '') + '</font>' : '') +
            (st.fill ? '<fill><patternFill patternType="solid"><fgColor rgb="FF' + st.fill + '"/><bgColor rgb="FF' + st.fill + '"/></patternFill></fill>' : '') + '</dxf>';
        return idx(S.dxfs, x);
    };
    S.xml = function() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
            (S.numFmts.length ? '<numFmts count="' + S.numFmts.length + '">' + S.numFmts.map(function(c, i) {
                return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + _xwEsc(c) + '"/>';
            }).join('') + '</numFmts>' : '') +
            '<fonts count="' + S.fonts.length + '">' + S.fonts.join('') + '</fonts>' +
            '<fills count="' + S.fills.length + '">' + S.fills.join('') + '</fills>' +
            '<borders count="' + S.borders.length + '">' + S.borders.join('') + '</borders>' +
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            '<cellXfs count="' + S.xfs.length + '">' + S.xfs.join('') + '</cellXfs>' +
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
            '<dxfs count="' + S.dxfs.length + '">' + S.dxfs.join('') + '</dxfs>' +
            '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
            '</styleSheet>';
    };
    return S;
}

// ── Hojas ───────────────────────────────────────────────────────────────────

function _xwSheetXml(sh, S, sst) {
    var rows = {};
    (sh.cells || []).forEach(function(cell) {
        if (!cell || !(cell.r >= 1) || !(cell.c >= 1)) return;
        (rows[cell.r] = rows[cell.r] || {})[cell.c] = cell;   // la última escritura gana
    });
    Object.keys(sh.rows || {}).forEach(function(r) { rows[r] = rows[r] || {}; });
    var rowNums = Object.keys(rows).map(Number).sort(function(a, b) { return a - b; });
    var maxR = 1, maxC = 1;
    var body = rowNums.map(function(r) {
        var info = (sh.rows || {})[r] || {};
        var cols = Object.keys(rows[r]).map(Number).sort(function(a, b) { return a - b; });
        if (r > maxR) maxR = r;
        var cx = cols.map(function(c) {
            if (c > maxC) maxC = c;
            var cell = rows[r][c], s = S.xf(cell.s), ref = xwRef(r, c);
            var sAttr = s ? ' s="' + s + '"' : '';
            var v = cell.v;
            if (v && typeof v === 'object' && v.date) v = xwDateSerial(v.date);
            if (cell.f) {
                var fx = '<f>' + _xwEsc(cell.f) + '</f>';
                if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + sAttr + '>' + fx + '<v>' + v + '</v></c>';
                if (typeof v === 'boolean') return '<c r="' + ref + '"' + sAttr + ' t="b">' + fx + '<v>' + (v ? 1 : 0) + '</v></c>';
                return '<c r="' + ref + '"' + sAttr + ' t="str">' + fx + '<v>' + _xwEsc(v == null ? '' : v) + '</v></c>';
            }
            if (v === null || v === undefined || v === '') return '<c r="' + ref + '"' + sAttr + '/>';
            if (typeof v === 'number') return isFinite(v) ? '<c r="' + ref + '"' + sAttr + '><v>' + v + '</v></c>' : '<c r="' + ref + '"' + sAttr + '/>';
            if (typeof v === 'boolean') return '<c r="' + ref + '"' + sAttr + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
            return '<c r="' + ref + '"' + sAttr + ' t="s"><v>' + sst.id(String(v)) + '</v></c>';
        }).join('');
        return '<row r="' + r + '"' + (info.height ? ' ht="' + info.height + '" customHeight="1"' : '') +
            (info.hidden ? ' hidden="1"' : '') + '>' + cx + '</row>';
    }).join('');

    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    var fit = sh.print && sh.print.fitWidth;
    if (sh.tabColor || fit) {
        x += '<sheetPr>' + (sh.tabColor ? '<tabColor rgb="FF' + sh.tabColor + '"/>' : '') +
            (fit ? '<pageSetUpPr fitToPage="1"/>' : '') + '</sheetPr>';
    }
    x += '<dimension ref="A1:' + xwRef(maxR, maxC) + '"/>';
    x += '<sheetViews><sheetView workbookViewId="0"' + (sh.showGrid === false ? ' showGridLines="0"' : '') +
        (sh.zoom ? ' zoomScale="' + sh.zoom + '" zoomScaleNormal="' + sh.zoom + '"' : '') + '>';
    if (sh.freeze && (sh.freeze.row > 1 || sh.freeze.col > 1)) {
        var fr = sh.freeze.row || 1, fc = sh.freeze.col || 1;
        var pane = fr > 1 && fc > 1 ? 'bottomRight' : fr > 1 ? 'bottomLeft' : 'topRight';
        x += '<pane' + (fc > 1 ? ' xSplit="' + (fc - 1) + '"' : '') + (fr > 1 ? ' ySplit="' + (fr - 1) + '"' : '') +
            ' topLeftCell="' + xwRef(fr, fc) + '" activePane="' + pane + '" state="frozen"/>' +
            '<selection pane="' + pane + '" activeCell="' + xwRef(fr, fc) + '" sqref="' + xwRef(fr, fc) + '"/>';
    }
    x += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
    if (sh.cols && sh.cols.length) {
        x += '<cols>' + sh.cols.slice().sort(function(a, b) { return a.min - b.min; }).map(function(c) {
            return '<col min="' + c.min + '" max="' + (c.max || c.min) + '" width="' + (c.width || 9) + '" customWidth="1"' +
                (c.hidden ? ' hidden="1"' : '') + '/>';
        }).join('') + '</cols>';
    }
    x += '<sheetData>' + body + '</sheetData>';
    if (sh.autoFilter) x += '<autoFilter ref="' + sh.autoFilter + '"/>';
    if (sh.merges && sh.merges.length) {
        x += '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function(m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>';
    }
    var prio = 1;
    (sh.cf || []).forEach(function(rule) {
        var first = String(rule.sqref).split(/[\s:]/)[0];
        var dxf = S.dxf(rule.style || {});
        if (rule.type === 'containsText') {
            var t = _xwEsc(rule.text);
            x += '<conditionalFormatting sqref="' + rule.sqref + '"><cfRule type="containsText" dxfId="' + dxf + '" priority="' + (prio++) +
                '" operator="containsText" text="' + t + '"><formula>NOT(ISERROR(SEARCH("' + t.replace(/&quot;/g, '""') + '",' + first + ')))</formula></cfRule></conditionalFormatting>';
        } else {
            x += '<conditionalFormatting sqref="' + rule.sqref + '"><cfRule type="expression" dxfId="' + dxf + '" priority="' + (prio++) +
                '"' + (rule.stop ? ' stopIfTrue="1"' : '') + '><formula>' + _xwEsc(rule.formula) + '</formula></cfRule></conditionalFormatting>';
        }
    });
    if (sh.validations && sh.validations.length) {
        x += '<dataValidations count="' + sh.validations.length + '">' + sh.validations.map(function(dv) {
            var f1 = Array.isArray(dv.list) ? '"' + dv.list.join(',').replace(/"/g, '') + '"' : dv.list;
            return '<dataValidation type="list" allowBlank="1" showInputMessage="1"' +
                (dv.allowOther ? ' showErrorMessage="0"' : ' showErrorMessage="1"') + ' sqref="' + dv.sqref + '"><formula1>' + _xwEsc(f1) + '</formula1></dataValidation>';
        }).join('') + '</dataValidations>';
    }
    x += '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>';
    if (sh.print) {
        x += '<pageSetup paperSize="1" orientation="' + (sh.print.landscape ? 'landscape' : 'portrait') + '"' +
            (fit ? ' fitToWidth="1" fitToHeight="0"' : '') + '/>';
    }
    return x + '</worksheet>';
}

/** Las partes del paquete (nombre + bytes), sin empaquetar. PURA. */
function _xwParts(spec) {
    var S = _xwStyles();
    var strings = [], sidx = {};
    var sst = { id: function(s) { if (sidx[s] === undefined) { sidx[s] = strings.length; strings.push(s); } return sidx[s]; } };
    var sheets = (spec && spec.sheets) || [];
    var sheetXml = sheets.map(function(sh) { return _xwSheetXml(sh, S, sst); });
    var enc = function(s) { return _xwUtf8(s); };
    var files = [];
    files.push({ name: '[Content_Types].xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function(s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>') });
    files.push({ name: '_rels/.rels', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>') });
    files.push({ name: 'docProps/core.xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + _xwEsc(spec.title || '') + '</dc:title><dc:creator>' + _xwEsc(spec.creator || 'KIA EmLab') + '</dc:creator>' +
        '</cp:coreProperties>') });
    files.push({ name: 'docProps/app.xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>KIA EmLab ' +
        _xwEsc(spec.appVersion || '') + '</Application></Properties>') });
    var activeIdx = Math.max(0, sheets.findIndex(function(s) { return !s.hidden && s.active; }));
    files.push({ name: 'xl/workbook.xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView activeTab="' + activeIdx + '" firstSheet="0"/></bookViews><sheets>' +
        sheets.map(function(s, i) {
            return '<sheet name="' + _xwEsc(String(s.name).slice(0, 31)) + '" sheetId="' + (i + 1) + '"' +
                (s.hidden ? ' state="hidden"' : '') + ' r:id="rId' + (i + 1) + '"/>';
        }).join('') + '</sheets>' +
        (function() {
            var dn = [];
            sheets.forEach(function(s, i) {
                if (s.autoFilter) dn.push('<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' +
                    _xwEsc("'" + String(s.name).slice(0, 31).replace(/'/g, "''") + "'!" + s.autoFilter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')) + '</definedName>');
            });
            return dn.length ? '<definedNames>' + dn.join('') + '</definedNames>' : '';
        })() +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>') });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function(s, i) {
            return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '<Relationship Id="rId' + (sheets.length + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
        '</Relationships>') });
    sheetXml.forEach(function(x, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc(x) }); });
    files.push({ name: 'xl/styles.xml', data: enc(S.xml()) });
    files.push({ name: 'xl/sharedStrings.xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + strings.length + '" uniqueCount="' + strings.length + '">' +
        strings.map(function(s) {
            return '<si><t' + (/^\s|\s$/.test(s) ? ' xml:space="preserve"' : '') + '>' + _xwEsc(s) + '</t></si>';
        }).join('') + '</sst>') });
    return files;
}

/** LA forma de escribir un .xlsx en la app. PURA: mismo spec → mismos bytes (sin compresión). */
function xwBuild(spec) { return xwZip(_xwParts(spec)); }

/** Comprimir con el navegador (deflate crudo). Sin CompressionStream → null (se queda sin compresión). */
function _xwDeflateBrowser(u8) {
    if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return Promise.resolve(null);
    try {
        var cs = new CompressionStream('deflate-raw');
        var stream = new Blob([u8]).stream().pipeThrough(cs);
        return new Response(stream).arrayBuffer().then(function(b) { return new Uint8Array(b); }, function() { return null; });
    } catch (e) { return Promise.resolve(null); }
}

/**
 * El mismo libro, comprimido (un 90 % más chico: se manda por correo). `deflate(u8)` →
 * Promise<Uint8Array|null>; por omisión el del navegador. Si no se puede comprimir, el
 * archivo sale igual pero sin compresión: nunca falla por eso.
 */
function xwBuildCompressed(spec, deflate) {
    var files = _xwParts(spec);
    deflate = deflate || _xwDeflateBrowser;
    return Promise.all(files.map(function(f) {
        return Promise.resolve(deflate(f.data)).then(function(d) {
            return (d && d.length < f.data.length) ? { name: f.name, data: f.data, deflated: d } : f;
        }, function() { return f; });
    })).then(xwZip);
}
