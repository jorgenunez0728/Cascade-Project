// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Liberar y aprobar por pasos (3.37.0) — funciones puras              ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, JSON, Object, Array, String, Number, Math, setTimeout, clearTimeout };
vm.createContext(ctx);
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pasos.js'), 'utf8');
vm.runInContext(src + '\nthis.LIB_STEP_DEFS = LIB_STEP_DEFS;', ctx, { filename: 'pasos.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const D = ctx.LIB_STEP_DEFS.liberador.steps;
const F = (o) => Object.assign({ resumen: { visible: true }, resultados: { visible: true, canPend: true }, objetos: { visible: true, canPend: true },
    evidencia: { visible: true, canPend: true }, enviar: { visible: true } }, o);

console.log('\n== libStepsFrom ==');
{
    const nuevo = ctx.libStepsFrom(D, F({ resultados: { visible: true, canPend: true, pending: true, why: 'falta CO' },
        objetos: { visible: true, canPend: true, pending: true, why: 'faltan 5' }, evidencia: { visible: true, canPend: true, pending: true, why: 'faltan 4' } }));
    ok('cinco pasos en el orden de la pantalla', nuevo.steps.map(s => s.key).join(',') === 'resumen,resultados,objetos,evidencia,enviar');
    ok('vehículo intacto: empieza en el resumen', nuevo.start === 0 && nuevo.firstPending === 1, JSON.stringify(nuevo));
    ok('cada pendiente trae su motivo', nuevo.steps[1].why === 'falta CO' && nuevo.steps[2].why === 'faltan 5');

    const medias = ctx.libStepsFrom(D, F({ evidencia: { visible: true, canPend: true, pending: true, why: 'falta Hoja' } }));
    ok('a medias: empieza en el primer pendiente', medias.start === 3 && medias.pending.join() === '3');
    ok('un paso sin pendiente no trae motivo', medias.steps[1].why === '' && medias.steps[1].pending === false);

    const listo = ctx.libStepsFrom(D, F({}));
    ok('nada pendiente: va directo a enviar', listo.start === 4 && listo.firstPending === -1);

    const simple = ctx.libStepsFrom(D, F({ resultados: { visible: false }, objetos: { visible: false }, evidencia: { visible: false } }));
    ok('formato simple: sin gases ni checklist, quedan resumen y enviar', simple.steps.map(s => s.key).join(',') === 'resumen,enviar' && simple.steps[1].index === 1);
    ok('y empieza en enviar', simple.start === 1);

    const vacio = ctx.libStepsFrom(D, {});
    ok('sin datos no truena', vacio.steps.length === 0 && vacio.start === 0);
}

console.log('\n== libStepsWanted ==');
{
    ok('automático: solo en teléfono', ctx.libStepsWanted('auto', true) === true && ctx.libStepsWanted('auto', false) === false);
    ok('la preferencia manda sobre el equipo', ctx.libStepsWanted(true, false) === true && ctx.libStepsWanted(false, true) === false);
}

console.log('\n== Reglas del archivo ==');
{
    ok('no escribe en vehículos ni guarda', !/saveDB\(|\.status\s*=[^=]|testData\.[a-zA-Z.]+\s*=[^=]|auditLog\(/.test(src));
    ok('no llama a los candados por su cuenta', !/submitToApproval\(|approveAndArchive\(|returnToReleaser\(/.test(src));
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const pasos = {};
    (html.match(/data-step="[^"]+"/g) || []).forEach(a => a.slice(11, -1).split(' ').forEach(k => pasos[k] = 1));
    const defs = [].concat(ctx.LIB_STEP_DEFS.liberador.steps, ctx.LIB_STEP_DEFS.aprobador.steps).map(s => s.key);
    ok('cada paso definido tiene su tarjeta en index.html', defs.every(k => pasos[k]), defs.filter(k => !pasos[k]).join(','));
    // 3.25.0: la decisión de falla y la comparación con la familia viven DENTRO del paso de verificación.
    const ver = html.slice(html.indexOf('data-step="verificar"'), html.indexOf('data-step="decidir"'));
    ok('doble ciego: falla y familia siguen dentro de Verificación', /id="appr-family-check"/.test(ver) && /id="appr-fail-box"/.test(ver) && /id="appr-match-status"/.test(ver));
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exit(1);
