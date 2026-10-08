// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.37.0] Carga en un `vm` lo que el aviso diario necesita de la      ║
// ║  plataforma: vehicleIsLive/vehicleTestDate (app.js), tpWeekPlanFor    ║
// ║  (testplan.js), el decodificador REST y fbVehParseDocs                ║
// ║  (firebase-sync.js) y js/digest.js. Lo usan tools/daily-digest y      ║
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
        invState: { gases: [] }, db: { vehicles: [], deletedVehicles: [] }, allConfigurations: [],
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

    const fb = src('firebase-sync.js');
    vm.runInContext(pick(/function fbFromFirestoreValue\(v\) \{[\s\S]*?\n\}/, fb, 'fbFromFirestoreValue'), sb);
    vm.runInContext(pick(/function fbVehParseDocs\(docs\) \{[\s\S]*?\n\}/, fb, 'fbVehParseDocs'), sb);
    sb.FIREBASE = {
        apiKey: /apiKey:\s*"([^"]+)"/.exec(fb)[1],
        projectId: /projectId:\s*"([^"]+)"/.exec(fb)[1],
        labEmail: /var FB_LAB_EMAIL = '([^']+)'/.exec(fb)[1],
        station: /FB_SHARED_WORKSPACE\s*=\s*'([^']+)'/.exec(fb)[1]
    };

    vm.runInContext(src('digest.js'), sb, { filename: 'digest.js' });
    return sb;
}

module.exports = { loadDigestEnv };
