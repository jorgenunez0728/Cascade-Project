// ╔══════════════════════════════════════════════════════════════════════╗
// ║  2.2.0 — Los gases de cada regulación en liberación, aprobación y PDF ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Por diseño, la liberación pide los gases del perfil de la regulación y la
// aprobación y el PDF verifican ESOS MISMOS gases (el perfil se congela en el
// vehículo al enviar). Se extraen solo las funciones puras; no hace falta DOM.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FUENTES = {};
function fuente(f) { return FUENTES[f] || (FUENTES[f] = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')); }
function extraer(archivo, nombre) {
    const SRC = fuente(archivo);
    const m = new RegExp('(?:^|\\n)function\\s+' + nombre + '\\s*\\(').exec(SRC);
    if (!m) throw new Error('no encontré function ' + nombre + ' en ' + archivo);
    let i = SRC.indexOf('{', m.index + m[0].length - 1), d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') d++;
        else if (SRC[i] === '}') { d--; if (d === 0) break; }
    }
    return SRC.slice(m.index + (SRC[m.index] === '\n' ? 1 : 0), i + 1);
}
function extraerVar(archivo, nombre) {
    const SRC = fuente(archivo);
    const i0 = SRC.indexOf('\nvar ' + nombre + ' =');
    if (i0 < 0) throw new Error('no encontré var ' + nombre);
    let i = SRC.indexOf('=', i0) + 1;
    while (SRC[i] === ' ') i++;
    const abre = SRC[i], cierra = abre === '[' ? ']' : '}';
    let d = 0;
    for (; i < SRC.length; i++) {
        if (SRC[i] === abre) d++;
        else if (SRC[i] === cierra) { d--; if (d === 0) break; }
    }
    return SRC.slice(i0 + 1, i + 1) + ';';
}

const ctx = { console, Date, JSON, Object, Array, String, Number, Math, isNaN, isFinite, parseInt, parseFloat };
vm.createContext(ctx);
vm.runInContext('var LIB_VAL_SIGFIGS = 9;', ctx);
['DEFAULT_REGULATION_PROFILES', 'REG_PROFILES_RETIRED'].forEach(n => vm.runInContext(extraerVar('app.js', n), ctx));
vm.runInContext(extraer('app.js', 'regMigrateProfiles'), ctx);
['_libNormalizeVal', '_libSigFig', '_libValuesMatch', '_libVerifyApproverMatch', '_libGasHasLimit',
 '_libVerifyReleaseValues', '_libGasProfileSnapshot', '_libPickGasProfile']
    .forEach(n => vm.runInContext(extraer('cop15.js', n), ctx));

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const perfil = n => ctx.DEFAULT_REGULATION_PROFILES.find(p => p.name === n);
const campos = p => p.gases.map(g => g.field).join(',');
const conLimite = p => p.gases.filter(g => g.limit !== null).map(g => g.field).join(',');

// ── Qué gases pide cada regulación con la que trabaja el laboratorio ─────
console.log('\n== Perfiles: los gases que juzga cada regulación ==');
{
    ['EURO-5', 'PRE-EURO 7'].forEach(n => {
        const p = perfil(n);
        ok(n + ': CO, THC, NMHC y NOx con límite; CO₂ informativo',
            conLimite(p) === 'CO,THC,NOx,NMHC' && p.gases.find(g => g.field === 'CO2').limit === null, campos(p));
        ok(n + ': límites Euro 6/5 gasolina (1.0 / 0.10 / 0.068 / 0.060 g/km)',
            p.gases.every(g => g.unit === 'g/km') &&
            p.gases.find(g => g.field === 'NOx').limit === 0.06 && p.gases.find(g => g.field === 'NMHC').limit === 0.068);
    });
    const s = perfil('SULEV 30');
    ok('SULEV 30: NMOG+NOx COMBINADO ≤ 0.030 g/mi (LEV III / Tier 3)',
        s.gases.some(g => g.field === 'NMOGNOx' && g.limit === 0.03 && g.unit === 'g/mi'), campos(s));
    ok('SULEV 30: ya no juzga NMHC ni NOx por separado', !s.gases.some(g => g.field === 'NMHC' || g.field === 'NOx'));
    ok('SULEV 30: CO ≤ 1.0 g/mi y CO₂ informativo',
        s.gases.find(g => g.field === 'CO').limit === 1.0 && s.gases.find(g => g.field === 'CO2').limit === null);
    ok('ninguna regulación pide PM ni PN (decisión del laboratorio)',
        ctx.DEFAULT_REGULATION_PROFILES.every(p => !p.gases.some(g => g.field === 'PM' || g.field === 'PN')));
}

// ── Migración de lo guardado en cada equipo ──────────────────────────────
console.log('\n== regMigrateProfiles: SULEV 30 guardado ==');
{
    const viejo = [{ id: 'reg_sulev30', name: 'SULEV 30', shortName: 'SULEV 30', gases: [
        { field: 'CO', label: 'CO', unit: 'g/mi', limit: 1.0 },
        { field: 'CO2', label: 'CO₂', unit: 'g/mi', limit: null },
        { field: 'NMHC', label: 'NMHC', unit: 'g/mi', limit: 0.01 },
        { field: 'NOx', label: 'NOx', unit: 'g/mi', limit: 0.02, captureUnit: 'mg/mi' }] },
        { id: 'reg_euro5', name: 'EURO-5', gases: [{ field: 'CO', unit: 'g/km', limit: 1.0 }] }];
    const r = ctx.regMigrateProfiles(viejo);
    const s = r.profiles[0];
    ok('reemplaza NMHC + NOx por NMOG+NOx ≤ 0.030', campos(s) === 'CO,CO2,NMOGNOx' &&
        s.gases[2].limit === 0.03, campos(s));
    ok('conserva la unidad de captura que el laboratorio configuró', s.gases[2].captureUnit === 'mg/mi');
    ok('reporta qué cambió', r.changed.join() === 'SULEV 30');
    ok('no toca otras regulaciones', JSON.stringify(r.profiles[1]) === JSON.stringify(viejo[1]));
    ok('es PURA: no muta lo recibido', viejo[0].gases.length === 4);
    const otra = ctx.regMigrateProfiles(r.profiles);
    ok('idempotente: la segunda pasada no cambia nada', otra.changed.length === 0 &&
        JSON.stringify(otra.profiles) === JSON.stringify(r.profiles));
}

// ── Liberación: la regla del botón Y del envío ───────────────────────────
console.log('\n== _libVerifyReleaseValues ==');
{
    const v = ctx._libVerifyReleaseValues, p = perfil('PRE-EURO 7');
    const bien = { CO: 0.2, THC: 0.03, NOx: 0.01, NMHC: 0.02 };
    ok('todos los gases con límite y pasan → ok (CO₂ es opcional)', v(p, bien).ok === true);
    const falta = v(p, { CO: 0.2, THC: 0.03, NOx: 0.01 });
    ok('falta un gas con límite → no se envía y dice cuál', falta.ok === false && falta.missing.join() === 'NMHC');
    const pasa = v(p, Object.assign({}, bien, { NOx: 0.07 }));
    ok('uno sobre el límite → no se envía y dice cuál', pasa.ok === false && pasa.failing.join() === 'NOx');
    ok('justo en el límite pasa', v(p, Object.assign({}, bien, { NOx: 0.06 })).ok === true);
    ok('sin perfil no se puede enviar', v(null, bien).ok === false && v(null, bien).sinPerfil === true);
    const s = perfil('SULEV 30');
    ok('SULEV 30 exige NMOG+NOx', v(s, { CO: 0.1 }).missing.join() === 'NMOG+NOx');
    ok('SULEV 30: NMOG 0.012 + NOx 0.015 = 0.027 PASA (antes salía FALLA por NMHC)',
        v(s, { CO: 0.1, NMOGNOx: 0.027 }).ok === true);
}

// ── Aprobación: confirma lo que decide y lo que el liberador registró ────
console.log('\n== _libVerifyApproverMatch (2.2.0) ==');
{
    const v = ctx._libVerifyApproverMatch, p = perfil('EURO-5');
    const lib = { CO: '0.2', THC: '0.03', NOx: '0.01', NMHC: '0.02' };
    ok('CO₂ que nadie capturó ya no le bloquea al aprobador', v(p, Object.assign({}, lib), lib).ok === true);
    ok('pero si el liberador capturó CO₂, el aprobador también debe',
        v(p, lib, Object.assign({ CO2: '150' }, lib)).missing.join() === 'CO₂');
    ok('un gas con límite sin capturar sigue faltando', v(p, { CO: '0.2' }, lib).missing.length === 3);
    ok('y un desacuerdo sigue bloqueando', v(p, Object.assign({}, lib, { NOx: '0.02' }), lib).mismatches.join() === 'NOx');
}

// ── El perfil de un vehículo YA liberado ─────────────────────────────────
console.log('\n== _libPickGasProfile: congelado → vigente → retirado → derivado ==');
{
    const pick = (fz, cur, vals, reg) => ctx._libPickGasProfile(fz, cur, ctx.REG_PROFILES_RETIRED, vals, reg);
    const frozen = ctx._libGasProfileSnapshot(perfil('EURO-5'), 'EURO-5');
    ok('la copia congelada guarda nombre, gases y límites', frozen.name === 'EURO-5' &&
        frozen.gases.length === 5 && frozen.gases.find(g => g.field === 'NOx').limit === 0.06);
    ok('manda el perfil congelado aunque el equipo tenga otro', pick(frozen, perfil('SULEV 30'), {}, 'EURO-5') === frozen);
    ok('sin congelado usa el vigente si cubre lo capturado',
        pick(null, perfil('SULEV 30'), { CO: 0.1, NMOGNOx: 0.02 }, 'SULEV 30') === perfil('SULEV 30'));
    const viejo = pick(null, perfil('SULEV 30'), { CO: 0.1, NMHC: 0.004, NOx: 0.012 }, 'SULEV 30');
    ok('un SULEV 30 liberado antes de 2.2.0 se lee con su definición anterior',
        !!viejo && viejo.retiredIn === '2.2.0' && campos(viejo) === 'CO,CO2,NMHC,NOx', viejo && campos(viejo));
    const der = pick(null, null, { CO: 0.1, NOx: 0.02 }, 'XYZ');
    ok('sin perfil pero con valores → derivado, sin límites (sirve al doble ciego)',
        der.derived === true && campos(der) === 'CO,NOx' && der.gases.every(g => g.limit === null));
    ok('sin perfil y sin valores → null (la aprobación se detiene)', pick(null, null, {}, 'XYZ') === null);
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exit(fallaron ? 1 : 0);
