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

// ── [3.4.0] Versión de CASCADE ───────────────────────────────────────────────
// Cascade lleva su propio número (el procedimiento de la prueba). Mismas reglas de forma
// que APP_VERSION_HISTORY, más `iso` (con él se estima la versión de una prueba vieja) y
// `app` (la versión de la plataforma que la trajo, que debe existir).
console.log('\n== CASCADE_VERSION y su historial ==');
const i0 = APP.indexOf('\nvar CASCADE_VERSION =');
const i1 = APP.indexOf('\nfunction cascadeVersionRender');
ok('app.js declara CASCADE_VERSION y sus funciones puras antes de cascadeVersionRender', i0 > 0 && i1 > i0);
const cctx = {};
vm.createContext(cctx);
vm.runInContext(APP.slice(i0 + 1, i1) + '\nthis.CV = CASCADE_VERSION; this.CH = CASCADE_VERSION_HISTORY;' +
    ' this.at = cascadeVersionAt; this.of = cascadeVersionsOf; this.day = _cascadeLabDay;' +
    ' this.line = cascadeVersionsLine; this.html = cascadeVersionHistoryHTML; this.stamp = cascadeVersionStamp;', cctx);
const CV = cctx.CV, CH = cctx.CH;
ok('CASCADE_VERSION tiene tres números', TRES.test(CV), CV);
ok('la primera entrada del historial de Cascade ES la versión actual', CH[0] && CH[0].version === CV && !CH[0].legacy);
const cMalas = CH.filter(e => !e || typeof e.version !== 'string' || !e.title || !e.date ||
    !Array.isArray(e.bullets) || !e.bullets.length || (!e.legacy && !/^\d{4}-\d{2}-\d{2}$/.test(e.iso || '')));
ok('toda entrada de Cascade trae {version, iso, date, title, bullets}', cMalas.length === 0,
    cMalas.slice(0, 3).map(e => e && e.version).join(','));
const cNuevas = CH.filter(e => !e.legacy);
ok('las versiones de Cascade tienen tres números', cNuevas.every(e => TRES.test(e.version)));
ok('van de la más reciente a la más vieja, sin repetir',
    cNuevas.every((e, i) => i === 0 || cmp(cNuevas[i - 1].version, e.version) > 0));
ok('las fechas (iso) no avanzan hacia abajo', cNuevas.every((e, i) => i === 0 || cNuevas[i - 1].iso >= e.iso));
const cPrimVieja = CH.findIndex(e => e.legacy);
ok('la numeración anterior va al final y no usa tres números',
    cPrimVieja > 0 && CH.slice(cPrimVieja).every(e => e.legacy && !TRES.test(e.version)));
const appVers = new Set(H.map(e => e.version.replace(/^v/, '')));
const sinApp = cNuevas.filter(e => e.app && TRES.test(e.app) && !appVers.has(e.app));
ok('cada `app` de tres números existe en APP_VERSION_HISTORY', sinApp.length === 0, sinApp.map(e => e.app).join(','));
ok('la versión de plataforma de la actual no es posterior a APP_VERSION',
    !CH[0].app || cmp(CH[0].app, V) <= 0, CH[0].app);

console.log('\n== cascadeVersionAt / cascadeVersionsOf (puras) ==');
ok('antes de la plataforma compartida → numeración anterior', cctx.at('2026-02-15') === '1.0615');
ok('el día del doble ciego → 4.0.0', cctx.at('2026-05-21') === '4.0.0');
ok('el día anterior → la última de Power Automate', cctx.at('2026-05-20') === '3.4.0');
ok('una fecha inválida → null', cctx.at('') === null && cctx.at('mañana') === null);
ok('día del laboratorio: 03:00Z es el día anterior en UTC−6', cctx.day('2026-10-13T03:00:00.000Z') === '2026-10-12');
ok('día del laboratorio: una hora local sin zona se toma tal cual', cctx.day('2026-10-13T22:30') === '2026-10-13');

const sellado = { status: 'archived', registeredAt: '2026-05-01T15:00:00.000Z', archivedAt: '2026-10-13T18:00:00.000Z',
    cascadeVersions: { alta: '4.28.0', liberacion: '4.29.0', aprobacion: '4.29.0' } };
const r1 = cctx.of(sellado);
ok('con sello: las tres versiones salen del sello, sin estimar',
    r1.steps.map(s => s.version + (s.estimated ? '~' : '')).join(',') === '4.28.0,4.29.0,4.29.0');
const viejo = { status: 'archived', registeredAt: '2026-06-01T15:00:00.000Z', archivedAt: '2026-09-23T18:00:00.000Z',
    testData: { signatures: { releaser: { signedAt: '2026-09-22T20:00:00.000Z' } } } };
const r2 = cctx.of(viejo);
ok('sin sello: se estima por fecha y se marca',
    r2.steps.map(s => s.version + (s.estimated ? '~' : '')).join(',') === '4.0.0~,4.11.0~,4.11.1~',
    r2.steps.map(s => s.version).join(','));
ok('la línea marca lo estimado con ≈', cctx.line(r2) === 'Alta ≈4.0.0 · Liberación ≈4.11.0 · Aprobación ≈4.11.1');
const devuelto = { status: 'ready-release', registeredAt: '2026-10-13T15:00:00.000Z',
    cascadeVersions: { alta: '4.29.0', liberacion: '4.29.0' } };
ok('devuelto al liberador: la liberación anterior no cuenta', cctx.of(devuelto).steps.map(s => s.key).join(',') === 'alta');
const retro = { status: 'archived', registeredAt: '2026-02-01T15:00:00.000Z', archivedAt: '2026-10-12T18:00:00.000Z',
    testData: { gasResults: { liberador: { retro: true, capturedAt: '2026-10-12T17:00:00.000Z' } } } };
ok('firma retroactiva: la liberación queda "sin dato", no con la fecha de la captura',
    cctx.of(retro).steps[1].version === null && /Liberación sin dato/.test(cctx.line(cctx.of(retro))));
ok('una prueba histórica no pasó por Cascade', cctx.of({ status: 'historico' }).historico === true);
const v = {}; cctx.stamp(v, 'alta');
ok('cascadeVersionStamp escribe una cadena con la versión actual', v.cascadeVersions && v.cascadeVersions.alta === CV);
const html = cctx.html();
ok('el historial pinta la actual abierta y escapa', html.indexOf('ACTUAL') > 0 && html.indexOf('<details open') >= 0 &&
    html.indexOf('Numeración anterior') > 0);

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron\n');
process.exit(fallaron ? 1 : 0);
