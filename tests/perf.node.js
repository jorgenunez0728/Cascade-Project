// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Arranque rápido (2.17.0) — guardia que SÍ corre en CI               ║
// ╚══════════════════════════════════════════════════════════════════════╝
// El presupuesto de tiempo vive en tests/perf.e2e.js (necesita un navegador, CI no lo
// tiene). Aquí se fija lo que lo hizo posible, para que no regrese sin que nadie lo note:
//   1. El panel de Datos lleva x-ignore: Alpine no lo arma al arrancar (~1.2 s en teléfono).
//   2. pnStorageScan no usa Blob (cada Blob viaja al proceso del navegador) y está memoizado.
//   3. Nada del arranque vuelve a llamar a Alpine.initTree sobre el panel por su cuenta.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

const html = read('index.html');
const panel = read('js/panel.js');
const app = read('js/app.js');

console.log('\n== Datos no se arma al arrancar ==');
const raiz = /<div[^>]*x-data="panelModule\(\)"[^>]*>/.exec(html);
ok('el componente de Datos existe', !!raiz);
ok('lleva x-ignore (Alpine se lo salta al arrancar)', raiz && / x-ignore\b/.test(raiz[0]), raiz && raiz[0]);
ok('y un id para armarlo después', raiz && /id="pn-alpine-root"/.test(raiz[0]));
ok('pnSwitchTab lo arma al entrar', /function pnSwitchTab\(tabId\) \{\s*pnAlpineEnsure\(\);/.test(panel));
ok('switchPlatform lo arma al entrar a Datos', /sectionId === 'panel' && typeof pnAlpineEnsure === 'function'\) pnAlpineEnsure\(\)/.test(app));
const initSys = app.slice(app.indexOf('function initializeSystem()'), app.indexOf("bootStage('lista');", app.indexOf('function initializeSystem()')));
ok('initializeSystem no lo arma (ni pnAlpineEnsure ni Alpine.initTree)', !/pnAlpineEnsure|initTree/.test(initSys));

console.log('\n== Escanear el almacenamiento es barato ==');
const scan = panel.slice(panel.indexOf('function _pnStorageScanNow'), panel.indexOf('/** Purga todo lo de tier'));
ok('_pnStorageScanNow no crea Blobs', scan.length > 100 && !/new Blob/.test(scan));
ok('pnStorageScan está memoizado', /function pnStorageScan\(opts\) \{\s*if \(!\(opts && opts\.fresh\) && _pnStorageMemo/.test(panel));
ok('el preflight de operaciones críticas pide escaneo fresco', /pnStorageScan\(\{ fresh: true \}\)/.test(app));

const ctx = {};
vm.createContext(ctx);
vm.runInContext(/function pnUtf8Len[\s\S]*?\n}\n/.exec(panel)[0], ctx);
const casos = ['', 'abc', 'ñandú', '€ 20', '😀x', 'ü'.repeat(1000), JSON.stringify({ vin: 'KNA', nota: 'Revisión ✔ — ok' })];
ok('pnUtf8Len = bytes UTF-8 reales (ASCII, acentos, €, emoji)', casos.every(s => ctx.pnUtf8Len(s) === Buffer.byteLength(s, 'utf8')),
    casos.map(s => ctx.pnUtf8Len(s) + '/' + Buffer.byteLength(s, 'utf8')).join(' '));

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exitCode = fallaron ? 1 : 0;
