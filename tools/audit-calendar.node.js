// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.32.0] Genera el libro de auditoría fuera de la plataforma         ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Usa EXACTAMENTE las funciones de la plataforma (tpAuditXlsxModel → tpAuditXlsxSpec →
// xwBuild), cargadas de js/ en un `vm`. Por eso el archivo es idéntico al que exporta
// Plan → Calendario → 📤 Excel para auditoría.
//
//   node tools/audit-calendar.node.js <carpeta> [año]
//     → Test_Plan_Template_<año>.xlsx  (en blanco: catálogo completo, sin producción ni pruebas)
//     → Test_Plan_<año>_example.xlsx   (mismo libro con las pruebas del COP_Master)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');

function loadPlatform() {
    const store = {};
    const noop = () => {};
    const el = () => { const e = { style: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
        setAttribute: noop, getAttribute: () => null, appendChild: noop, addEventListener: noop, querySelector: () => null,
        querySelectorAll: () => [], getElementById: () => null }; e.body = e; e.documentElement = e; e.createElement = el; return e; };
    const sb = {
        console, Object, Array, Math, Date, JSON, String, Number, Set, Map, RegExp, Error, parseInt, parseFloat, isNaN, isFinite,
        TextEncoder, Uint8Array, setTimeout, clearTimeout, requestAnimationFrame: noop,
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        document: el(), showToast: noop, showModal: noop, showConfirmDialog: () => Promise.resolve(false), auditLog: noop,
        undoPush: noop, authRequire: () => true, authCan: () => true, authGetCurrentUser: () => ({ name: 'tool' }),
        safeParse: (k, d) => d, debounce: fn => fn, emitEvent: noop, Chart: function () {}, CASCADE_TOOLTIPS: {},
        tpUpdateBadges: noop, tpRender: noop, cascadeInjectTooltipsDeferred: noop, a11yClickables: noop, gridDragInit: noop,
        tabCacheInvalidate: noop, tabCacheSwitch: noop, helpBannerHTML: () => '', invState: { gases: [] },
        db: { vehicles: [], deletedVehicles: [] }, allConfigurations: [],
        _normalizeRegulation: (r, eng) => { r = (r || '').trim(); return r || (/KW/i.test(eng || '') ? 'EV' : 'N/A'); }
    };
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    const app = src('app.js');
    vm.runInContext(/var APP_VERSION = [^\n]+/.exec(app)[0], sb);
    vm.runInContext('var CSV_CONFIGURATIONS = ' + /CSV_CONFIGURATIONS\s*=\s*(`[\s\S]*?`)/.exec(app)[1] + ';', sb);
    vm.runInContext(/var VEHICLE_STATUS_HISTORIC = [\s\S]*?\nfunction vehicleListDate\(v\) \{[\s\S]*?\n\}/.exec(app)[0], sb);
    vm.runInContext(/function _vehTombKey[\s\S]*?\nfunction vehicleIsTombstoned\(v, list\) \{[\s\S]*?\n\}/.exec(app)[0], sb);
    vm.runInContext(src('xlsxw.js'), sb, { filename: 'xlsxw.js' });
    vm.runInContext(src('testplan.js') + '\nvar __tp = function(){ return tpState; };', sb, { filename: 'testplan.js' });
    // El catálogo del Alta, como lo arma parseCSV (cop15.js).
    const lines = sb.CSV_CONFIGURATIONS.trim().split('\n'), headers = lines[0].split(',');
    sb.allConfigurations = lines.slice(1).map(l => { const v = l.split(','), o = {}; headers.forEach((h, i) => { o[h] = v[i] || ''; }); return o; });
    sb.__tp().planData = []; sb.__tp().weeklyPlans = []; sb.__tp().testedList = [];
    if (typeof sb.tpCatalogInvalidate === 'function') sb.tpCatalogInvalidate();
    return sb;
}

// Pruebas del COP_Master_Emisiones_ICMS.xlsx (hoja Registro_COP, renglones 3–20). La
// "Vehicle Configuration" del Master se traduce a una configuración del catálogo de la
// misma FAMILIA (el rin no cambia la familia).
const COP_MASTER_CFG = {
    '5DR 1.6P TGDI LP 2WD 7DCT':  'CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-205/55 R16-EUROPE-5DR-LOW POWER',
    '5DR 1.6P TGDI HP 2WD 7DCT':  'CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-235/40 R18-EUROPE-5DR-HIGH POWER',
    'WGN 1.6P TGDI LP 2WD 7DCT':  'CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-205/55 R16-EUROPE-WGN-LOW POWER',
    '5DR 1.0P TGDI 48V 2WD 7DCT': 'CL4-26 MODEL-7DCT-MILD HEV-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0',
    '5DR 1.0P TGDI 48V 2WD 6MT':  'CL4-26 MODEL-6MT-MILD HEV-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0',
    '5DR 1.0P TGDI 2WD 6MT':      'CL4-26 MODEL-6MT-0-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0'
};
// [fecha de prueba, VIN, configuración del Master]. Las fechas de texto del Master vienen
// en día/mes/año. El renglón 17 trae 10-ene-2026 como fecha de Excel, que leída como
// día/mes (como las demás) es 1-oct-2026; el 18 no trae VIN y su fecha (11-ene / 1-nov)
// no se puede decidir: va a "Tests without a test date".
const COP_MASTER_TESTS = [
    ['2026-08-25', '3KPFX51C0TE412426', '5DR 1.6P TGDI LP 2WD 7DCT'],
    ['2026-08-26', '3KPFU51C6TE412732', '5DR 1.6P TGDI HP 2WD 7DCT'],
    ['2026-08-26', '3KPFX51C7TE411337', '5DR 1.6P TGDI LP 2WD 7DCT'],
    ['2026-08-27', '3KPFU51C0TE414153', '5DR 1.6P TGDI HP 2WD 7DCT'],
    ['2026-08-27', '3KPFX51C8TE412366', '5DR 1.6P TGDI LP 2WD 7DCT'],
    ['2026-08-28', '3KPFU51C5TE412947', '5DR 1.6P TGDI HP 2WD 7DCT'],
    ['2026-09-22', '3KPFX51B9TE429006', '5DR 1.0P TGDI 48V 2WD 7DCT'],
    ['2026-09-22', '3KPFX51B5TE416219', '5DR 1.0P TGDI 48V 2WD 7DCT'],
    ['2026-09-23', '3KPFX51B3TE429891', '5DR 1.0P TGDI 48V 2WD 7DCT'],
    ['2026-09-23', '3KPFT51B0TE429567', '5DR 1.0P TGDI 2WD 6MT'],
    ['2026-09-24', '3KPFX81C2TE421291', 'WGN 1.6P TGDI LP 2WD 7DCT'],
    ['2026-09-24', '3KPFX81C4TE421535', 'WGN 1.6P TGDI LP 2WD 7DCT'],
    ['2026-09-29', '3KPFX51BXTE433243', '5DR 1.0P TGDI 48V 2WD 6MT'],
    ['2026-09-29', '3KPFX51B7TE431949', '5DR 1.0P TGDI 48V 2WD 6MT'],
    ['2026-09-30', '3KPFT51B7TE433258', '5DR 1.0P TGDI 2WD 6MT'],
    ['2026-09-30', '3KPFX51B5TE433246', '5DR 1.0P TGDI 48V 2WD 6MT'],
    ['2026-10-01', '3KPFT51B8TE433270', '5DR 1.0P TGDI 2WD 6MT'],
    [null, '', '5DR 1.0P TGDI 2WD 6MT']
];

const zlib = require('zlib');
async function build(sb, year, template, generated) {
    const model = sb.tpAuditXlsxModel({ from: year + '-01', to: year + '-12', template, generated });
    const bytes = await sb.xwBuildCompressed(sb.tpAuditXlsxSpec(model), u8 => Promise.resolve(new Uint8Array(zlib.deflateRawSync(Buffer.from(u8), { level: 9 }))));
    return { model, bytes };
}

async function main() {
    const out = process.argv[2] || '.';
    const year = Number(process.argv[3]) || 2026;
    const generated = process.env.AUDIT_DATE || new Date().toISOString().slice(0, 10);
    fs.mkdirSync(out, { recursive: true });

    const sb = loadPlatform();
    const tpl = await build(sb, year, true, generated);
    fs.writeFileSync(path.join(out, 'Test_Plan_Template_' + year + '.xlsx'), tpl.bytes);

    sb.db.vehicles = COP_MASTER_TESTS.filter(t => t[0]).map((t, i) => {
        const desc = COP_MASTER_CFG[t[2]];
        if (!sb.tpConfigByDesc(desc)) throw new Error('No está en el catálogo: ' + desc);
        return { id: 'cop-master-' + (i + 1), vin: t[1], status: 'archived', configCode: desc, purpose: 'COP-Emisiones',
                 config: {}, testData: { testDatetime: t[0] + 'T09:00' } };
    });
    sb.__tp().testedList = COP_MASTER_TESTS.filter(t => !t[0]).map(t => ({ configText: COP_MASTER_CFG[t[2]], date: '', vin: t[1],
        purpose: 'COP-Emisiones', source: 'manual', note: 'COP_Master renglón 20: sin VIN y sin fecha clara' }));
    const ex = await build(sb, year, false, generated);
    fs.writeFileSync(path.join(out, 'Test_Plan_' + year + '_example.xlsx'), ex.bytes);

    console.log('Plantilla: ' + tpl.model.families.length + ' familias · ' + tpl.bytes.length + ' bytes');
    console.log('Ejemplo:   ' + ex.model.families.length + ' familias · ' + ex.model.tests.length + ' pruebas con día · ' +
                ex.model.undated.length + ' sin fecha · ' + ex.bytes.length + ' bytes');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { loadPlatform, build, COP_MASTER_TESTS, COP_MASTER_CFG };
