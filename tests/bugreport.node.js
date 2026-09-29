// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Reporte de fallas con el código (2.10.0)                            ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Código REAL de js/bugreport.js en un `vm` sin DOM: mapa de líneas del bundle,
// lectura de la cadena de llamadas, enlace al commit, fragmento, ruido y el cuerpo
// del issue. Y, sobre el bundle COMPILADO si existe, que el mapa apunte a la línea
// correcta de cada archivo fuente.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { console, JSON, Object, Array, String, Number, Math, RegExp, Date, isNaN, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'bugreport.js'), 'utf8'), ctx, { filename: 'bugreport.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

console.log('\n== Mapa de líneas ==');
const MAP = { tag: 100, mods: [[102, 'js/app.js', 200], [203, 'js/cop15.js', 400]] };
{
    const a = ctx.bugMapLine(150, MAP), b = ctx.bugMapLine(203, MAP), c = ctx.bugMapLine(201, MAP), d = ctx.bugMapLine(50, MAP);
    ok('línea dentro de app.js', a && a.file === 'js/app.js' && a.line === 49, JSON.stringify(a));
    ok('primera línea de cop15.js', b && b.file === 'js/cop15.js' && b.line === 1, JSON.stringify(b));
    ok('entre módulos (líneas en blanco del build) → null', c === null);
    ok('fuera del bloque de la app (librerías del <head>) → null', d === null);
    ok('sin mapa (desarrollo) → null', ctx.bugMapLine(150, null) === null);
}

console.log('\n== Ubicar un (url, línea) ==');
{
    const dev = ctx.bugLocate('http://localhost:5173/js/testplan.js?v=3', 88, null);
    ok('en desarrollo, js/x.js:línea ya es la del archivo', dev && dev.file === 'js/testplan.js' && dev.line === 88, JSON.stringify(dev));
    const prod = ctx.bugLocate('https://kia-emlab-test-system.web.app/', 150, MAP);
    ok('en producción (el HTML), se traduce con el mapa', prod && prod.file === 'js/app.js' && prod.line === 49);
    ok('una librería de CDN no es código nuestro', ctx.bugLocate('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js', 1, MAP) === null);
}

console.log('\n== Cadena de llamadas ==');
{
    const chrome = 'TypeError: Cannot read properties of null (reading \'vehicles\')\n' +
        '    at refreshAllLists (https://x.web.app/:150:21)\n' +
        '    at HTMLButtonElement.onclick (https://x.web.app/:250:5)\n' +
        '    at https://x.web.app/:251:9';
    const f = ctx.bugParseStack(chrome);
    ok('Chrome: tres cuadros con función, url, línea y columna', f.length === 3 && f[0].fn === 'refreshAllLists' && f[0].line === 150 && f[0].col === 21 && f[2].fn === '', JSON.stringify(f));
    const ff = ctx.bugParseStack('refreshAllLists@https://x.web.app/:150:21\n@https://x.web.app/:251:9');
    ok('Firefox/Safari también', ff.length === 2 && ff[0].fn === 'refreshAllLists' && ff[1].line === 251);
    ok('sin stack → vacío', ctx.bugParseStack('').length === 0 && ctx.bugParseStack(undefined).length === 0);
}

console.log('\n== Enlace y fragmento ==');
{
    ok('enlace al commit del build', ctx.bugPermalink('o', 'r', 'c8145346b1d5121fa94669e9395b1499d98a5209', 'js/app.js', 49) ===
        'https://github.com/o/r/blob/c8145346b1d5121fa94669e9395b1499d98a5209/js/app.js#L49');
    ok('sin commit (desarrollo) → main', /\/blob\/main\/js\/app\.js#L49$/.test(ctx.bugPermalink('o', 'r', '__APP_COMMIT__', 'js/app.js', 49)));
    const lines = Array.from({ length: 30 }, (_, i) => 'línea ' + (i + 1));
    const e = ctx.bugExcerpt(lines, 10, 6);
    ok('±6 líneas alrededor de la del error', e.from === 4 && e.to === 16 && e.at === 10 && e.lines[6] === 'línea 10', JSON.stringify(e));
    const e2 = ctx.bugExcerpt(lines, 2, 6);
    ok('al principio del archivo no se sale', e2.from === 1 && e2.lines[1] === 'línea 2');
    ok('sin fuente → null', ctx.bugExcerpt(null, 10) === null && ctx.bugExcerpt(lines, 99) === null);
}

console.log('\n== Ruido ==');
{
    ok('la red no es "algo falló al hacer eso"', ctx.bugIsNoise('TypeError: Failed to fetch', ''));
    ok('ResizeObserver y extensiones son ruido', ctx.bugIsNoise('ResizeObserver loop completed', '') && ctx.bugIsNoise('x', 'chrome-extension://abc/x.js'));
    ok('un error real no es ruido', !ctx.bugIsNoise("Cannot read properties of null (reading 'vehicles')", 'https://x.web.app/'));
}

console.log('\n== Dónde falló (sin DOM) ==');
{
    const errs = [
        { at: '2026-09-28T10:00:00Z', message: 'viejo', url: 'https://x.web.app/', line: 205, stack: '' },
        { at: '2026-09-28T10:01:00Z', message: "Cannot read properties of null (reading 'vehicles')", url: 'https://x.web.app/', line: 150, noticed: true,
          stack: "TypeError: x\n    at refreshAllLists (https://x.web.app/:150:21)\n    at HTMLButtonElement.onclick (https://x.web.app/:250:5)\n    at https://www.gstatic.com/firebasejs/x.js:1:1" },
        { at: '2026-09-28T10:02:00Z', message: 'posterior sin aviso', url: 'https://x.web.app/', line: 300, stack: '' }
    ];
    const w = ctx.bugWhereFailed(errs, MAP, 'o', 'r', 'c8145346b1');
    ok('elige el error que avisó al técnico', w && w.message.indexOf('vehicles') >= 0);
    ok('cuadro principal en js/app.js:49 dentro de refreshAllLists', w.file === 'js/app.js' && w.line === 49 && w.fn === 'refreshAllLists', JSON.stringify(w));
    ok('la cadena se traduce y descarta librerías', w.frames.length === 2 && w.frames[1].file === 'js/cop15.js' && w.frames[1].line === 48, JSON.stringify(w.frames));
    ok('con enlace al commit', /blob\/c8145346b1\/js\/app\.js#L49$/.test(w.url));
    const w2 = ctx.bugWhereFailed([{ message: 'sin stack', url: 'https://x.web.app/', line: 210 }], MAP, 'o', 'r', '');
    ok('sin stack usa url:línea del evento', w2.file === 'js/cop15.js' && w2.line === 8);
    ok('sin errores → null', ctx.bugWhereFailed([], MAP, 'o', 'r', '') === null);
}

console.log('\n== Cuerpo del issue ==');
{
    const report = { id: 'bug_x', at: '2026-09-28T10:03:00Z', comment: 'Toqué Aprobar y no pasó nada',
        ctx: { operator: 'Ana', version: '2.10.0', build: '202609281200', commit: 'c8145346b1d5121fa946', platformLabel: 'cop15 → liberacion', viewport: '427×840', online: true, ua: 'UA',
            errors: [{ at: 't', type: 'error', message: 'boom', file: 'js/app.js', fileLine: 49, source: 'x', line: 150 }],
            where: { file: 'js/app.js', line: 49, fn: 'refreshAllLists', message: 'boom', url: 'https://github.com/o/r/blob/c/js/app.js#L49',
                frames: [{ fn: 'refreshAllLists', file: 'js/app.js', line: 49 }, { fn: 'onclick', file: 'js/cop15.js', line: 48 }],
                excerpt: { from: 47, to: 51, at: 49, lines: ['a', 'b', '  if (db.vehicles) x();', 'd', 'e'] } },
            crumbs: [{ at: '2026-09-28T10:02:58.000Z', screen: 'cop15 → liberacion', label: 'Aprobar y archivar' }] } };
    const body = ctx.bugBuildIssueBody(report, null);
    ok('dice dónde falló con archivo:línea y función', body.indexOf('### Dónde falló') >= 0 && body.indexOf('`js/app.js:49` en `refreshAllLists`') >= 0);
    ok('enlaza al código de ese build', body.indexOf('[ver en GitHub](https://github.com/o/r/blob/c/js/app.js#L49)') >= 0);
    ok('trae el fragmento como texto con la línea marcada', body.indexOf('```js') >= 0 && body.indexOf('49 ▶   if (db.vehicles) x();') >= 0 && body.indexOf('48 │ b') >= 0, body);
    ok('trae la cadena de llamadas', body.indexOf('Cadena de llamadas') >= 0 && body.indexOf('`js/cop15.js:48`') >= 0);
    ok('trae los pasos previos', body.indexOf('### Pasos previos') >= 0 && body.indexOf('«Aprobar y archivar»') >= 0 && body.indexOf('`10:02:58`') >= 0);
    ok('versión con build y commit', body.indexOf('2.10.0 · build 202609281200 · commit `c8145346b1`') >= 0);
    ok('los errores recientes ya salen en el archivo real', body.indexOf('boom (js/app.js:49)') >= 0);
    const viejo = ctx.bugBuildIssueBody({ id: 'b', at: '', comment: 'x', ctx: { errors: [] } }, null);
    ok('un reporte sin nada de esto (de la cola, versión anterior) sigue saliendo', viejo.indexOf('Dónde falló') < 0 && viejo.indexOf('### Contexto') >= 0);
}

console.log('\n== El mapa del bundle compilado apunta al archivo correcto ==');
{
    const bundle = path.join(ROOT, 'kia-emlab-unified.html');
    if (!fs.existsSync(bundle)) {
        console.log('  (sin kia-emlab-unified.html: correr ./build.sh para esta parte)');
    } else {
        const html = fs.readFileSync(bundle, 'utf8');
        const m = /var BUG_LINE_MAP = (\{.*?\});/.exec(html);
        ok('el build reemplazó el marcador por el mapa', !!m);
        // Un bundle más viejo que las fuentes (se editó un js/ sin recompilar) no se juzga:
        // su mapa describe OTRO código. deploy.sh recompila antes de publicar.
        const stale = m && JSON.parse(m[1]).mods.some(function(x) {
            const src = fs.readFileSync(path.join(ROOT, x[1]), 'utf8');
            const n = src.split('\n').length - (src.endsWith('\n') ? 1 : 0);
            return x[2] - x[0] + 1 !== n;
        });
        if (stale) console.log('  (bundle desactualizado respecto a js/: correr ./build.sh para verificar el mapa)');
        if (m && !stale) {
            const map = JSON.parse(m[1]);
            const L = html.split('\n');
            ok('tag apunta al <script> de la app', L[map.tag - 1].trim() === '<script>');
            const nBuild = (/for jsfile in ([^;]+);/.exec(fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8')) || ['', ''])[1].trim().split(/\s+/).length;
            ok('todos los módulos del build (' + nBuild + ')', map.mods.length === nBuild, map.mods.length);
            let revisadas = 0, malas = 0;
            ['app.js', 'cop15.js', 'testplan.js', 'firebase-sync.js', 'bugreport.js'].forEach(function(f) {
                const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').split('\n');
                const fnLines = [];
                src.forEach(function(l, i) { if (/^function \w+\(/.test(l)) fnLines.push(i + 1); });
                fnLines.filter((_, i) => i % 25 === 0).forEach(function(ln) {
                    const mod = map.mods.find(x => x[1] === 'js/' + f);
                    const doc = mod[0] + ln - 1;
                    const loc = ctx.bugMapLine(doc, map);
                    revisadas++;
                    if (!loc || loc.file !== 'js/' + f || loc.line !== ln || L[doc - 1] !== src[ln - 1]) malas++;
                });
            });
            ok('cada función muestreada cae en su archivo y línea (' + revisadas + ' revisadas)', malas === 0, malas + ' mal');
            ok('el commit quedó inyectado', /var APP_COMMIT = '[0-9a-f]{40}'/.test(html) || /var APP_COMMIT = ''/.test(html));
        }
    }
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exitCode = fallaron ? 1 : 0;
