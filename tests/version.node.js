// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Numeración de versiones (desde 2.0.0): MAYOR.MENOR.PARCHE          ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// La versión vive en CUATRO sitios (app.js, su historial, CHANGELOG.md y package.json) y
// nada verificaba que coincidieran. Así se quedó APP_VERSION pegado en '14.0' varias
// rondas, y así salieron VACÍAS en Datos → Sistema las 12 entradas 23.0–24.5: se
// escribieron como {v, notes} y la plantilla lee {version, bullets}.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(RAIZ, 'js', 'app.js'), 'utf8');

function extraerVar(nombre) {
    const i0 = APP.indexOf('\nvar ' + nombre + ' =');
    if (i0 < 0) throw new Error('no encontré var ' + nombre);
    const fin = nombre === 'APP_VERSION' ? APP.indexOf(';', i0) : APP.indexOf('\n];', i0) + 3;
    return APP.slice(i0 + 1, fin + 1);
}
const ctx = {};
vm.createContext(ctx);
vm.runInContext(extraerVar('APP_VERSION') + '\n' + extraerVar('APP_VERSION_HISTORY') +
    '\nthis.V = APP_VERSION; this.H = APP_VERSION_HISTORY;', ctx);
const V = ctx.V, H = ctx.H;

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const TRES = /^\d+\.\d+\.\d+$/;
function cmp(a, b) {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
}

console.log('\n== APP_VERSION y su historial ==');
ok('APP_VERSION tiene tres números (MAYOR.MENOR.PARCHE)', TRES.test(V), V);
ok('la primera entrada del historial ES la versión actual', H[0] && H[0].version === V, H[0] && H[0].version);
ok('la actual no está marcada como numeración anterior', H[0] && !H[0].legacy);

const malas = H.filter(e => !e || typeof e.version !== 'string' || !e.version || !e.title ||
    !Array.isArray(e.bullets) || !e.bullets.length || e.v !== undefined || e.notes !== undefined);
ok('toda entrada trae {version, title, bullets} (la plantilla lee esos campos)', malas.length === 0,
    malas.slice(0, 3).map(e => JSON.stringify(e).slice(0, 60)).join(' | '));

const nuevas = H.filter(e => !e.legacy);
ok('las entradas nuevas tienen tres números', nuevas.every(e => TRES.test(e.version)),
    nuevas.filter(e => !TRES.test(e.version)).map(e => e.version).join(','));
ok('las entradas nuevas van de la más reciente a la más vieja, sin repetir',
    nuevas.every((e, i) => i === 0 || cmp(nuevas[i - 1].version, e.version) > 0));
const primeraVieja = H.findIndex(e => e.legacy);
ok('lo nuevo va antes que la numeración anterior (no se intercalan)',
    primeraVieja === -1 || H.slice(primeraVieja).every(e => e.legacy));
ok('la numeración anterior no usa tres números (no se confunde con la nueva)',
    H.filter(e => e.legacy).every(e => !TRES.test(e.version)));

console.log('\n== CHANGELOG.md y package.json ==');
const CL = fs.readFileSync(path.join(RAIZ, 'CHANGELOG.md'), 'utf8');
const m = /^## (\d[^\s]*) —/m.exec(CL);
ok('la primera versión del CHANGELOG es APP_VERSION', m && m[1] === V, m && m[1]);
const PKG = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
ok('package.json.version === APP_VERSION', PKG.version === V, PKG.version);

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron\n');
process.exit(fallaron ? 1 : 0);
