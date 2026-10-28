// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.37.0] Carga en un `vm` lo que el aviso diario necesita de la      ║
// ║  plataforma: vehicleIsLive/vehicleTestDate (app.js), tpWeekPlanFor    ║
// ║  (testplan.js), el decodificador REST y fbVehParseDocs                ║
// ║  (firebase-sync.js), inventory.js + cuarto.js (3.11.0) y js/digest.js. ║
// ║  Lo usan tools/daily-digest y                                         ║
// ║  tests/digest.node.js: el correo sale de las MISMAS funciones.        ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
const pick = (re, text, what) => {
    const m = re.exec(text);
    if (!m) throw new Error('digest-env: no encontré ' + what + ' (¿cambió el código?)');
    return m[0];
};

/**
 * El código de una función de nivel superior: de una sola línea, o de `function nombre(` hasta
 * la `}` en la columna 0 (sin la regla de una línea, `_vehTombKey` se tragaría a la siguiente).
 */
const fnSrc = (name, text) => {
    const n = name.replace(/\$/g, '\\$');
    const one = new RegExp('\\nfunction ' + n + '\\([^)]*\\) \\{[^\\n]*\\}[ \\t]*(?=\\n)').exec(text);
    return one ? one[0] : pick(new RegExp('\\nfunction ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'), text, name);
};

function loadDigestEnv() {
    const store = {};
    const noop = () => {};
    const el = () => {
        const e = { style: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
            setAttribute: noop, getAttribute: () => null, appendChild: noop, addEventListener: noop, querySelector: () => null,
            querySelectorAll: () => [], getElementById: () => null };
        e.body = e; e.documentElement = e; e.createElement = el; return e;
    };
    const sb = {
        console: { log: noop, warn: noop, error: console.error }, Object, Array, Math, Date, JSON, String, Number, Set, Map,
        RegExp, Error, parseInt, parseFloat, isNaN, isFinite, TextEncoder, Uint8Array, setTimeout, clearTimeout,
        requestAnimationFrame: noop,
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        document: el(), showToast: noop, showModal: noop, showConfirmDialog: () => Promise.resolve(false), auditLog: noop,
        undoPush: noop, authRequire: () => true, authCan: () => true, authGetCurrentUser: () => null,
        authGetCurrentUserName: f => f || '', safeParse: (k, d) => d, debounce: fn => fn, emitEvent: noop,
        Chart: function () {}, CASCADE_TOOLTIPS: {}, tpUpdateBadges: noop, tpRender: noop, cascadeInjectTooltipsDeferred: noop,
        a11yClickables: noop, gridDragInit: noop, tabCacheInvalidate: noop, tabCacheSwitch: noop, helpBannerHTML: () => '',
        db: { vehicles: [], deletedVehicles: [] }, allConfigurations: [],
        CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; }, dispatchEvent: noop,
        escapeHtml: s => String(s == null ? '' : s), invRender: noop, uiPref: () => null,
        localToday: () => { const d = new Date(Date.now() - 6 * 3600000); return d.toISOString().slice(0, 10); },
        _normalizeRegulation: (r, eng) => { r = (r || '').trim(); return r || (/KW/i.test(eng || '') ? 'EV' : 'N/A'); }
    };
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);

    const app = src('app.js');
    vm.runInContext(pick(/var VEHICLE_STATUS_HISTORIC = [\s\S]*?\nfunction vehicleListDate\(v\) \{[\s\S]*?\n\}/, app, 'vehicleIsLive'), sb);
    vm.runInContext('var CONFIG = { statusLabels: ' + /statusLabels:\s*(\{[\s\S]*?\})/.exec(app)[1] + ' };', sb);
    vm.runInContext(src('testplan.js') + '\nvar __tpGet = function(){ return tpState; };' +
        '\nvar __tpSet = function(s){ tpState = s; if (typeof _tpEnsureState === "function") _tpEnsureState();' +
        ' if (typeof tpWeekPlanInvalidate === "function") tpWeekPlanInvalidate(); };', sb, { filename: 'testplan.js' });
    // [3.24.0] Los bloques de la celda (el estatus del viernes trae esta semana y la siguiente).
    vm.runInContext(src('bloques.js'), sb, { filename: 'bloques.js' });

    // La app junta los vehículos por VIN y retira los borrados: se cargan SUS funciones.
    ['stableStringify', 'strHash', 'revContentHash', '_vehTombKey', 'vehicleIsTombstoned', 'vehicleTombstonesUnion', 'vehicleCopyKey']
        .forEach(n => vm.runInContext(fnSrc(n, app), sb));
    const fb = src('firebase-sync.js');
    ['fbFromFirestoreValue', 'fbVehParseDocs', '_fbMergePaStatus', '_fbUnionLog', '_fbVehTime', '_fbMergeVehicle',
     'fbVehDocId', 'fbVehWrites', 'fbVehDupPlan', 'fbVehCollapseCopies']
        .forEach(n => vm.runInContext(fnSrc(n, fb), sb));
    sb.FIREBASE = {
        apiKey: /apiKey:\s*"([^"]+)"/.exec(fb)[1],
        projectId: /projectId:\s*"([^"]+)"/.exec(fb)[1],
        labEmail: /var FB_LAB_EMAIL = '([^']+)'/.exec(fb)[1],
        station: /FB_SHARED_WORKSPACE\s*=\s*'([^']+)'/.exec(fb)[1]
    };

    // [3.11.0] Consumibles: cilindros instalados y gasolina por tipo salen de SUS definiciones
    // (invInstalledCylinders, invFuelTypeTotals) y del plano del cuarto (paredes con tablero).
    vm.runInContext(src('inventory.js') + '\nvar __invSet = function(s){ invState = s; };', sb, { filename: 'inventory.js' });
    vm.runInContext(src('cuarto.js'), sb, { filename: 'cuarto.js' });
    vm.runInContext(src('digest.js'), sb, { filename: 'digest.js' });

    // [3.12.0] Estatus CoP semanal: el código REAL del validador (copCalcStats, gases y
    // límites del perfil, ensayos que cuentan) y del reporte. Los perfiles salen de la
    // versión que publicó el laboratorio (settings/regulations, __setRegProfiles) o, si no
    // hay, de los de fábrica — igual que la app con límites compartidos.
    vm.runInContext(pick(/var DEFAULT_REGULATION_PROFILES = \[[\s\S]*?\n\];/, app, 'DEFAULT_REGULATION_PROFILES'), sb);
    vm.runInContext(pick(/var GAS_UNIT_FACTORS = \{[\s\S]*?\n\};/, app, 'GAS_UNIT_FACTORS'), sb);
    vm.runInContext(pick(/var LAB_REGION_CAPTURE = \{[\s\S]*?\n\};/, app, 'LAB_REGION_CAPTURE'), sb);
    ['labRegionRegulation', 'labRegionBuiltinProfile', 'labRegionKey', 'vehicleTestDate', 'localDateStr']
        .forEach(n => vm.runInContext(fnSrc(n, app), sb));
    vm.runInContext(fnSrc('_libGetVehicleRegulation', src('cop15.js')), sb);
    vm.runInContext(`var __regProfiles = null;
function __setRegProfiles(list) { __regProfiles = Array.isArray(list) && list.length ? list : null; }
function getRegulationProfile(name) {
    if (!name) return null;
    var norm = String(name).trim().toUpperCase();
    var list = __regProfiles || DEFAULT_REGULATION_PROFILES;
    return list.filter(function(p) { return String(p.name || '').toUpperCase() === norm || String(p.shortName || '').toUpperCase() === norm; })[0]
        || labRegionBuiltinProfile(name);
}`, sb);
    vm.runInContext(src('vets.js'), sb, { filename: 'vets.js' });
    vm.runInContext(src('cop_validator.js') + '\nvar __copSet = function(s){ Object.keys(s || {}).forEach(function(k){ copState[k] = s[k]; }); _copLoaded = true; copInvalidateCache(); };',
        sb, { filename: 'cop_validator.js' });
    vm.runInContext(src('copreport.js'), sb, { filename: 'copreport.js' });
    return sb;
}

module.exports = { loadDigestEnv, fnSrc };
