// ╔══════════════════════════════════════════════════════════════════════╗
// ║  3.24.0 — Bloques de la celda: cada lugar de prueba, prueba o motivo  ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Código REAL de testplan.js + bloques.js en un `vm` sin DOM (mismo arnés que calendario.node.js).
// Con LibreOffice, el Excel de la semana y la hoja "Cell use" se recalculan y se comparan.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const store = {};
const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i],
    get length() { return Object.keys(store).length; }
};
const noop = () => {};
// Un elemento simulado que se devuelve a si mismo: el codigo bajo prueba renderiza
// de verdad (tpUpdateBadges, _tpBoardRepaint), y stubear null lo hace reventar por
// razones que no tienen nada que ver con lo que se esta probando.
function _el() {
    const e = {
        textContent: '', value: '', innerHTML: '', style: {}, dataset: {}, isConnected: false,
        classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
        setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
        appendChild: noop, removeChild: noop, remove: noop, insertAdjacentHTML: noop,
        addEventListener: noop, removeEventListener: noop, focus: noop, click: noop,
        scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
        closest: () => null, contains: () => false, children: [], parentElement: null
    };
    e.querySelector = () => e;
    e.querySelectorAll = () => [];
    e.getElementById = () => e;
    e.createElement = () => _el();
    e.body = e;
    e.documentElement = e;
    return e;
}
const sandbox = {
    localStorage, console,
    // Un elemento simulado, no null: funciones del propio archivo (tpUpdateBadges)
    // escriben en el DOM y las estamos ejecutando de verdad.
    document: _el(),
    showToast: noop, showConfirmDialog: () => Promise.resolve(false), showConfirm: noop, showModal: noop,
    auditLog: function() { sandbox.__audits.push(Array.from(arguments)); }, __audits: [], undoPush: noop, undoPop: noop, authRequire: () => true, authCan: () => true,
    authGetCurrentUser: () => ({ name: 'Test' }),
    localToday: () => '2026-09-09',
    localDateStr: d => new Date(d).toISOString().slice(0, 10),
    safeParse: (k, d) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } },
    debounce: fn => fn, emitEvent: noop, setTimeout, clearTimeout, requestAnimationFrame: noop,
    Chart: function () {}, CSV_CONFIGURATIONS: '', allConfigurations: [],
    db: { vehicles: [] }, invState: { gases: [] },
    tpUpdateBadges: noop, tpRender: noop, cascadeInjectTooltipsDeferred: noop,
    CASCADE_TOOLTIPS: {}, uiCard: null, a11yClickables: noop, gridDragInit: noop,
    tabCacheInvalidate: noop, fbPush: noop, _tabCache: {}, tabCacheSwitch: noop, tabCacheInit: noop, tabCacheGet: () => null, helpBannerHTML: () => '',
    helpInjectBannerDeferred: noop, a11yTablist: noop, a11yTablistSync: noop, _tpBoardRepaint: noop,
    cascadeVehicleStage: () => null, cascadeVehicleETA: () => null,
    _normalizeRegulation: r => r || 'N/A',
    Object, Array, Math, Date, JSON, String, Number, Set, Map, parseInt, parseFloat, isNaN
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// [2.30.0] Qué es "en curso" vive en app.js (vehicleIsLive): se toma del código real.
vm.runInContext(/function _vehTombKey[\s\S]*?\nfunction vehicleIsTombstoned\(v, list\) \{[\s\S]*?\n\}/.exec(fs.readFileSync('js/app.js', 'utf8'))[0], sandbox);
vm.runInContext(/var VEHICLE_STATUS_HISTORIC = [\s\S]*?\nfunction vehicleListDate\(v\) \{[\s\S]*?\n\}/.exec(fs.readFileSync('js/app.js', 'utf8'))[0], sandbox);
sandbox.TextEncoder = TextEncoder; sandbox.Uint8Array = Uint8Array;
vm.runInContext(fs.readFileSync('js/xlsxw.js', 'utf8'), sandbox, { filename: 'xlsxw.js' });
const src = fs.readFileSync('js/testplan.js', 'utf8') + '\nvar __getTp = function(){ return tpState; };\n';
try { vm.runInContext(src, sandbox, { filename: 'testplan.js' }); }
catch (e) { console.error('NO CARGA:', e.message); process.exit(1); }

try { vm.runInContext(fs.readFileSync('js/bloques.js', 'utf8'), sandbox, { filename: 'bloques.js' }); }
catch (e) { console.error('NO CARGA bloques.js:', e.message); process.exit(1); }

let pass = 0, fail = 0;
function t(nombre, fn) {
    try { fn(); console.log('  ok  ' + nombre); pass++; }
    catch (e) { console.log('  FAIL ' + nombre + '\n       ' + e.message); fail++; }
}
function ok(c, msg) { if (!c) throw new Error(msg || 'falso'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' esperaba ' + JSON.stringify(b) + ', dio ' + JSON.stringify(a)); }
const C = sandbox, S = sandbox.__getTp();

console.log('La capacidad instalada');
t('24 h de reposo y 2 por par: martes a viernes, 2 bloques por día = 8', () => {
    const L = C.tpBlockLayout(24, 2);
    eq(L.map(x => x.day + x.n).join(), 'mar2,mie2,jue2,vie2');
    eq(L[0].precon, 'lun', 'el martes se preacondiciona el lunes');
    eq(L.reduce((s, x) => s + x.n, 0), 8);
});
t('1 por par = 4; 48 h de reposo y 2 por par = 6 (mié, jue, vie)', () => {
    eq(C.tpBlockLayout(24, 1).reduce((s, x) => s + x.n, 0), 4);
    const L = C.tpBlockLayout(48, 2);
    eq(L.map(x => x.day + x.n + x.precon).join(), 'mie2lun,jue2mar,vie2mie');
});

console.log('\nEl cálculo (PURO)');
const WK = '2026-09-07';
const lay = C.tpBlockLayout(24, 2).map(L => Object.assign({}, L, { iso: C.tpWeekDayIso(WK, L.day), preconIso: C.tpWeekDayIso(WK, L.precon) }));
const fam = n => ({ familyShort: n, cfg: null, vin: 'KNAE000000000' + n.length + '1234', purpose: 'COP-Emisiones' });
t('pruebas llenan bloques; un día pasado sin prueba ni motivo queda "sin explicar"', () => {
    const r = C.tpBlocksCompute({ weekDate: WK, today: '2026-09-09', layout: lay, tests: { '2026-09-08': [fam('A')] } });
    const mar = r.days[0].blocks;
    eq(mar[0].state, 'prueba'); eq(mar[1].state, 'sin-explicar');
    eq(r.days[1].blocks[0].state, 'pendiente', 'hoy (miércoles) sin prueba todavía');
    eq(r.days[2].blocks[0].state, 'libre');
    eq(r.total.tests, 1); eq(r.total.unexplained, 1); eq(r.total.blocks, 8);
});
t('la prueba busca primero el bloque sin motivo; si hay más pruebas, la prueba manda sobre el motivo', () => {
    const notes = { [C.tpBlockId(WK, 'mar', 1)]: { reason: 'qc', note: 'bolsas', by: 'Ana', at: '1' } };
    let r = C.tpBlocksCompute({ weekDate: WK, today: '2026-09-11', layout: lay, notes, tests: { '2026-09-08': [fam('A')] } });
    eq(r.days[0].blocks[0].state, 'motivo'); eq(r.days[0].blocks[0].reason, 'qc'); eq(r.days[0].blocks[1].state, 'prueba');
    r = C.tpBlocksCompute({ weekDate: WK, today: '2026-09-11', layout: lay, notes, tests: { '2026-09-08': [fam('A'), fam('B'), fam('C')] } });
    ok(r.days[0].blocks.every(b => b.state === 'prueba') && r.days[0].blocks[0].noteOverridden, 'las dos con prueba');
    eq(r.extra.length, 1, 'la tercera es de más (sobre la capacidad)');
});
t('lo automático cubre lo vacío, pero el motivo de un signatario manda', () => {
    const notes = { [C.tpBlockId(WK, 'jue', 2)]: { reason: 'proyecto', note: 'HEV', by: 'Ana', at: '1' } };
    const r = C.tpBlocksCompute({ weekDate: WK, today: '2026-09-14', layout: lay, notes, auto: { '2026-09-10': { reason: 'festivo', note: 'Día no laborable' } } });
    eq(r.days[2].blocks[0].state, 'auto'); eq(r.days[2].blocks[0].reason, 'festivo');
    eq(r.days[2].blocks[1].state, 'motivo'); eq(r.days[2].blocks[1].reason, 'proyecto');
    eq(r.total.byReason.festivo, 1); eq(r.total.byReason.proyecto, 1);
});
t('lo planeado va a los bloques libres; un motivo que no existe en la lista se ignora', () => {
    const notes = { [C.tpBlockId(WK, 'vie', 1)]: { reason: 'inventado', at: '1' } };
    const r = C.tpBlocksCompute({ weekDate: WK, today: '2026-09-07', layout: lay, notes,
        planned: { '2026-09-11': [{ familyShort: 'X', desc: 'X' }, { familyShort: 'Y', desc: 'Y' }, { familyShort: 'Z', desc: 'Z' }] } });
    eq(r.days[3].blocks.map(b => b.state).join(), 'planeada,planeada');
    eq(r.plannedOver.length, 1, 'la tercera no cabe y se declara');
});

console.log('\nLos motivos viajan por el sync');
t('por bloque gana el más reciente; la unión es simétrica; quitar el motivo también viaja', () => {
    const a = { k: { reason: 'qc', at: '2026-09-08T10:00:00Z' } }, b = { k: { reason: null, at: '2026-09-08T11:00:00Z' } };
    eq(C.tpBlockNotesUnion(a, b).k.reason, null); eq(C.tpBlockNotesUnion(b, a).k.reason, null);
    ok(C.tpBlockNotesNewTo(a, b) && !C.tpBlockNotesNewTo(b, a));
    eq(JSON.stringify(C.tpBlockNotesUnion(a, { j: { reason: 'mtto', at: '1' } })), JSON.stringify({ k: a.k, j: { reason: 'mtto', at: '1' } }));
});

console.log('\nCon los datos de la plataforma');
S.vehiclesPerSlot = 2;
const cfgA = { id: 'a', desc: 'CL4 PE7 WGN', mod: 'CL4', eng: '1600CC GAMMA-II', tx: '7DCT', my: '26 MODEL', reg: 'PRE-EURO 7', ep: '0', engpkg: 'LOW POWER', body: 'WGN', rgn: 'EUROPE', hist: 0, total: 0, m: [] };
S.planData = [cfgA];
C.db.vehicles = [
    { id: 1, vin: 'KNAE2E00000000001', status: 'archived', configCode: cfgA.desc, purpose: 'COP-Emisiones', config: {}, testData: { testDatetime: '2026-09-08T09:00' } },
    // Formato simple (OBD II): su fecha vive en testData.simple.datetime
    { id: 2, vin: 'KNAE2E00000000002', status: 'archived', configCode: cfgA.desc, purpose: 'COP-OBD2', config: {}, testData: { simple: { datetime: '2026-09-09T11:00' } } }
];
S.weekAvailability = { [WK]: { available: true, workDays: { dom: false, lun: true, mar: true, mie: true, jue: false, vie: true, sab: false }, note: '' } };
C.invState = { assets: [{ id: 'E-013', name: 'Dynamometer', blocksTesting: true }, { id: 'E-001', name: 'HVAC', blocksTesting: false }],
    equipment: [], maintActivities: [{ id: 'm1', desc: 'Limpieza de rodillos' }],
    maintLog: [{ id: 'l1', date: '2026-09-08', assetId: 'E-013', activityId: 'm1' }, { id: 'l2', date: '2026-09-09', assetId: 'E-001', activityId: 'm1' }] };
S.blockNotes = {};
let W;
t('la semana: prueba del martes, la OBD II del miércoles, jueves y viernes festivos, mantenimiento del dinamómetro', () => {
    W = C.tpBlocksForWeek('2026-09-09', { today: '2026-09-14' });
    eq(W.weekDate, WK, 'cualquier día lleva al lunes');
    const st = W.days.map(d => d.blocks.map(b => b.state + (b.reason ? ':' + b.reason : '')).join('+')).join(' | ');
    eq(st, 'prueba+auto:mtto | prueba+sin-explicar | auto:festivo+auto:festivo | auto:festivo+auto:festivo');
    ok(/Dynamometer: Limpieza de rodillos/.test(W.days[0].blocks[1].note), W.days[0].blocks[1].note);
    ok(/No se preacondicionó \(jueves no laborable\)/.test(W.days[3].blocks[0].note), 'el viernes pierde sus pruebas porque el jueves no se preacondicionó');
    eq(W.pairs, 4); eq(W.perSlot, 2); eq(W.total.tests, 2); eq(W.total.unexplained, 1);
});
t('una semana sin celda: todo "celda fuera de servicio", con la nota de Disponibilidad', () => {
    S.weekAvailability['2026-09-14'] = { available: false, note: 'HEV fase 2' };
    const r = C.tpBlocksForWeek('2026-09-14', { today: '2026-09-21' });
    ok(r.blocks.every(b => b.state === 'auto' && b.reason === 'celda' && b.note === 'HEV fase 2'));
});
t('explicar: lo registra un signatario, varios a la vez, con auditoría antes/después', () => {
    C.__audits.length = 0;
    const id = W.days[1].blocks[1].id;
    ok(C.tpBlockExplain([id], 'sinvehiculo', '  la unidad no llegó  '));
    eq(S.blockNotes[id].reason, 'sinvehiculo'); eq(S.blockNotes[id].note, 'la unidad no llegó');
    const a = C.__audits.find(x => x[1] === 'bloque_explicado');
    ok(a && a[4] && a[4].before[id] === null && a[4].after.motivo === 'sinvehiculo', JSON.stringify(a));
    eq(C.tpBlocksForWeek(WK, { today: '2026-09-14' }).total.unexplained, 0);
    ok(!C.tpBlockExplain([id], 'inventado', ''), 'un motivo fuera de la lista no se guarda');
    ok(!C.tpBlockExplain(['no-es-un-id'], 'qc', ''), 'un id mal formado no se guarda');
});
t('el candado está en la capa de datos (test.approve)', () => {
    const prev = C.authRequire, pedido = [];
    C.authRequire = (p) => { pedido.push(p); return false; };
    ok(!C.tpBlockExplain([C.tpBlockId(WK, 'mar', 2)], 'qc', ''));
    eq(pedido.join(), 'test.approve');
    C.authRequire = prev;
});
t('HOY: los sin explicar de esta semana y la anterior', () => {
    S.blockNotes = {};
    const u = C.tpBlocksUnexplained({ today: '2026-09-15' });
    // Semana del 7: solo el 2º bloque del miércoles. Semana del 14: sin celda (todo automático).
    eq(u.n, 1); eq(u.week, '2026-09-07'); eq(u.days.map(d => d.iso + ':' + d.n).join(), '2026-09-09:1');
    delete S.weekAvailability['2026-09-14'];
    const u2 = C.tpBlocksUnexplained({ today: '2026-09-17' });
    eq(u2.n, 1 + 2 + 2 - 0, 'y si la celda sí estaba: martes 15 y miércoles 16 sin prueba (jueves 17 es hoy)');
});

console.log('\nEl Excel de la semana');
let spec;
t('cuadrícula del laboratorio (preacondicionamiento y prueba por día), resumen con fórmulas y bitácora', () => {
    const m = C.tpBlocksForWeek(WK, { today: '2026-09-14' });
    m.generated = '2026-09-14'; m.appVersion = '3.24.0';
    spec = C.tpWeekXlsxSpec(m);
    const sh = spec.sheets[0], cell = (r, c) => sh.cells.find(x => x.r === r && x.c === c);
    eq(sh.name, 'Week');
    eq(cell(4, 2).v, 'Mon 7 Sep'); eq(cell(4, 6).v, 'Fri 11 Sep');
    eq(cell(5, 1).v, 'Preconditioning 1'); eq(cell(7, 1).v, 'Test 1');
    ok(/→ Tue/.test(cell(5, 2).v), 'el lunes se preacondiciona la prueba del martes: ' + cell(5, 2).v);
    ok(/KNAE2E|00001/.test(cell(7, 3).v), 'la prueba del martes trae VIN corto: ' + cell(7, 3).v);
    eq(cell(8, 3).v, 'Maintenance or calibration — Dynamometer: Limpieza de rodillos');
    ok(/^NOT EXPLAINED/.test(cell(8, 4).v), cell(8, 4).v);
    const sum = sh.cells.filter(x => x.f);
    ok(sum.length >= 12, 'resumen con fórmulas');
    const byLabel = l => { const lab = sh.cells.find(x => x.v === l && x.c === 1); return sh.cells.find(x => x.r === lab.r && x.c === 2); };
    eq(byLabel('Test blocks').v, 8); eq(byLabel('With a test').v, 2); eq(byLabel('Holiday').v, 4); eq(byLabel('NOT EXPLAINED').v, 1);
    eq(byLabel('Cell use').v, 0.25);
    const bytes = C.xwBuild(spec);
    ok(bytes && bytes.length > 2000, 'se escribe el .xlsx');
});
let book;
t('el libro de auditoría: los motivos al calendario y la hoja "Cell use"', () => {
    S.blockNotes = { [C.tpBlockId(WK, 'mie', 2)]: { reason: 'qc', note: 'verificación de bolsas', by: 'Ana', at: '2' } };
    const model = C.tpAuditXlsxModel({ from: '2026-09', to: '2026-09', generated: '2026-09-14' });
    ok(model.blocks.length >= 8 && model.blockEntries.some(e => e.label === 'Quality Checks' && e.date === '2026-09-09'));
    book = C.tpAuditXlsxSpec(model);
    const cu = book.sheets.find(s => s.name === 'Cell use');
    ok(cu, 'hay hoja Cell use');
    const sep = book.sheets.find(s => /Sep/.test(s.name));
    ok(sep.cells.some(c => c.v === 'Quality Checks'), 'el quality check sale en el calendario de septiembre');
    ok(C.TP_AUDIT_ACTIVITIES.indexOf('No vehicle') >= 0 && C.TP_BLOCK_REASONS.every(R => C.TP_AUDIT_ACTIVITIES.indexOf(R.audit) >= 0),
       'todo motivo tiene su actividad en la lista desplegable del libro');
    const w = cu.cells.find(c => c.r === 5 && c.c === 2);
    eq(w.v, 8, 'la semana del 7 tiene 8 bloques');
});

console.log('\nRecalculado con LibreOffice');
let soffice = null;
try { soffice = execFileSync('which', ['soffice']).toString().trim(); } catch (e) {}
if (!soffice || !spec || !book) console.log('  (sin LibreOffice: se omite)');
else {
    const recalc = (sp, nombre, sheetFilter) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloques-'));
        const x = path.join(dir, nombre + '.xlsx');
        fs.writeFileSync(x, Buffer.from(C.xwBuild(sp)));
        const prof = path.join(dir, 'prof');
        fs.mkdirSync(path.join(prof, 'user'), { recursive: true });
        fs.writeFileSync(path.join(prof, 'user', 'registrymodifications.xcu'),
            '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
            '<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item></oor:items>');
        execFileSync(soffice, ['-env:UserInstallation=file://' + prof, '--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', path.join(dir, 'out'), x], { stdio: 'pipe', timeout: 180000 });
        const files = unzip(fs.readFileSync(path.join(dir, 'out', nombre + '.xlsx')));
        const sst = (files['xl/sharedStrings.xml'] || '').match(/<si>[\s\S]*?<\/si>/g) || [];
        const strs = sst.map(q => (q.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(u => u.replace(/<[^>]+>/g, '')).join(''));
        let checked = 0; const bad = [];
        sp.sheets.forEach((sh, i) => {
            if (sheetFilter && !sheetFilter(sh)) return;
            const xml = files['xl/worksheets/sheet' + (i + 1) + '.xml'];
            sh.cells.filter(c => c.f).forEach(c => {
                const a1 = C.xwRef(c.r, c.c);
                const m = new RegExp('<c r="' + a1 + '"([^>]*)>([\\s\\S]*?)</c>').exec(xml);
                if (!m) { if (c.v !== '') bad.push(sh.name + '!' + a1 + ' falta'); return; }
                const v = (/<v>([\s\S]*?)<\/v>/.exec(m[2]) || [])[1];
                let got = v;
                if (/t="s"/.test(m[1])) got = strs[+v];
                else if (!/t="str"/.test(m[1])) got = parseFloat(v);
                const same = typeof c.v === 'number' ? Math.abs(got - c.v) < 1e-9 : String(got == null ? '' : got) === String(c.v);
                if (!same) bad.push(sh.name + '!' + a1 + ' LibreOffice=' + got + ' app=' + c.v);
                checked++;
            });
        });
        return { checked, bad };
    };
    t('Excel de la semana: cada fórmula da el valor que escribió la app', () => {
        const r = recalc(spec, 'semana');
        ok(!r.bad.length && r.checked >= 12, r.checked + ' fórmulas; ' + r.bad.join('; '));
    });
    t('Libro de auditoría, hoja Cell use: cada fórmula da el valor que escribió la app', () => {
        const r = recalc(book, 'libro', sh => sh.name === 'Cell use');
        ok(!r.bad.length && r.checked >= 10, r.checked + ' fórmulas; ' + r.bad.join('; '));
    });
}

function unzip(buf) {
    const out = {};
    let e = buf.length - 22;
    while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
    const count = buf.readUInt16LE(e + 10);
    let p = buf.readUInt32LE(e + 16);
    for (let i = 0; i < count; i++) {
        const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
        const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
        const off = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nlen).toString();
        const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28);
        const data = buf.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
        out[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
        p += 46 + nlen + xlen + clen;
    }
    return out;
}

console.log('\n' + pass + ' pasaron, ' + fail + ' fallaron');
if (fail) process.exitCode = 1;
