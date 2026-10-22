// Pruebas de 3.21.0 — mapa regulatorio (js/normas.js).
// Regla que se vigila: cada número del mapa sale de la constante que la app usa para
// juzgar. Las constantes se cargan del código REAL (no copias), y normas.js se corre
// entero en un `vm`.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle !== undefined ? ' — ' + JSON.stringify(detalle) : '')); }
}

/** `var NOMBRE = …;` completo (cuenta llaves/corchetes, salta cadenas). */
function varSrc(src, name) {
    const i = src.indexOf('var ' + name + ' = ');
    if (i < 0) throw new Error('no está var ' + name);
    let j = src.indexOf('=', i) + 1, depth = 0, q = null;
    for (; j < src.length; j++) {
        const c = src[j];
        if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
        if (c === "'" || c === '"' || c === '`') { q = c; continue; }
        if (c === '{' || c === '[' || c === '(') depth++;
        else if (c === '}' || c === ']' || c === ')') depth--;
        else if (c === ';' && depth === 0) return src.slice(i, j + 1);
    }
    throw new Error('sin fin: ' + name);
}
function fnSrc(src, name) {
    const m = new RegExp('\\nfunction ' + name + '\\(').exec(src);
    if (!m) throw new Error('no está function ' + name);
    const i = m.index + 1;
    let j = src.indexOf('{', i), depth = 0, q = null;
    for (; j < src.length; j++) {
        const c = src[j];
        if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
        if (c === "'" || c === '"' || c === '`') { q = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
    }
    throw new Error('sin fin: ' + name);
}

const APP = R('app.js'), COP = R('cop_validator.js'), REP = R('copreport.js'), TP = R('testplan.js'), VETS = R('vets.js'), C15 = R('cop15.js');
const ctx = { console, Object, Array, JSON, Math, String, Number, Date, isFinite };
vm.createContext(ctx);
const run = s => vm.runInContext(s, ctx);
['DEFAULT_REGULATION_PROFILES', 'LAB_REGION_CAPTURE', 'HELP_GLOSSARY', 'TOURS'].forEach(n => run(varSrc(APP, n)));
['labRegionKey', 'labRegionRegulation'].forEach(n => run(fnSrc(APP, n)));
['COP_HQ_RULES', 'COP_GAS_A', 'COP_GAS_NMAX', 'COP_ASSIGNED_DF', 'COP_CO2_A', 'COP_CO2_TABLE', 'COP_SCOPE_DEFAULT'].forEach(n => run(varSrc(COP, n)));
['_copCustomScope', 'copScope', 'copScopeLabel', 'copVehicleFamilyKey'].forEach(n => run(fnSrc(COP, n)));
['COP_LOT_TESTS', 'COP_LOT_FIRST', 'COP_LOT_NEXT'].forEach(n => run(varSrc(REP, n)));
run(varSrc(TP, 'TP_SOAK_DEFAULT_H'));
['VETS_IWR_WLTP', 'VETS_RMSSE_WLTP_KMH'].forEach(n => run(varSrc(VETS, n)));
['RELEASE_CHECKLIST', 'PDF_REQUIRED_FIELDS', 'CASCADE_STAGES'].forEach(n => run(varSrc(C15, n)));
run(`var copState = {};
var getAllRegulationProfiles = function() { return DEFAULT_REGULATION_PROFILES; };
var allConfigurations = [
  { Modelo: 'K3', 'ENGINE CAPACITY': '2.0', TRANSMISSION: 'IVT', 'MODEL YEAR (VIN)': '2027', 'EMISSION REGULATION': 'EURO-5', REGION: 'MEXICO', 'BODY TYPE': '4DR' },
  { Modelo: 'K3', 'ENGINE CAPACITY': '2.0', TRANSMISSION: 'IVT', 'MODEL YEAR (VIN)': '2027', 'EMISSION REGULATION': 'EURO-5', REGION: 'MIDDLE EAST', 'BODY TYPE': '4DR' },
  { Modelo: 'CEED', 'ENGINE CAPACITY': '1.5', TRANSMISSION: 'DCT', 'MODEL YEAR (VIN)': '2027', 'EMISSION REGULATION': 'PRE-EURO 7', REGION: 'EUROPE', 'BODY TYPE': '5DR' }
];
var db = { vehicles: [] };
var FICHA_KINDS = {}; var HELP_TABS = {};
`);
run(R('normas.js'));

const DEF = ctx.DEFAULT_REGULATION_PROFILES;
const prof = n => DEF.find(p => p.name === n);
const src = ctx.normaSource();

console.log('\n== Cada número sale de su constante ==');
{
    const f = ctx.normaFacts('EURO-5', src);
    const lims = prof('EURO-5').gases.filter(g => g.limit !== null);
    ok('los límites del mapa son los del perfil', f.gases.length === prof('EURO-5').gases.length &&
        lims.every(g => f.gases.find(x => x.field === g.field).limit === g.limit));
    ok('la liberación dice cada límite con su unidad', lims.every(g => f.steps.find(s => s.id === 'liberacion').req.indexOf(g.label + ' ' + g.limit + ' ' + g.unit) >= 0),
        f.steps.find(s => s.id === 'liberacion').req);
    ok('la regla de México se declara: EURO-5 no juzga allá', f.regions.length === 1 && /NO se usa para juzgar/.test(f.regions[0].text) && /NOM-042 C-VP/.test(f.regions[0].text));
    ok('Medio Oriente EURO-5: 1 por familia (COP_HQ_RULES)', f.cop.length === 1 && f.cop[0].rule === 'one' && /1 ensayo por familia/.test(f.cop[0].text));
    ok('las configuraciones de México se cuentan aparte (redirigidas)', f.live.configs === 1 && f.live.redirected === 1, f.live);
}
{
    const f = ctx.normaFacts('NOM-042 C-VP', src);
    ok('NOM-042: el alta trae EURO-5 y se juzga con NOM-042, en g/mi', f && /se juzga con NOM-042 C-VP/.test(f.regions[0].text) && f.regions[0].unit === ctx.LAB_REGION_CAPTURE.MEXICO.unit);
    ok('NOM-042: cuenta la configuración de México', f.live.configs === 1);
    ok('NOM-042: los gases de México se capturan en la unidad de la región', ctx.LAB_REGION_CAPTURE.MEXICO.gases.every(g => f.gases.find(x => x.field.toUpperCase() === g.toUpperCase()).captureUnit === ctx.LAB_REGION_CAPTURE.MEXICO.unit), f.gases);
}
{
    const f = ctx.normaFacts('PRE-EURO 7', src);
    ok('PRE-EURO 7: por lotes con COP_LOT_*', f.cop[0].rule === 'lot' && f.cop[0].text.indexOf(String(ctx.COP_LOT_TESTS)) === 0 &&
        f.cop[0].text.indexOf(ctx.COP_LOT_FIRST.toLocaleString('es-MX')) > 0 && f.cop[0].text.indexOf(ctx.COP_LOT_NEXT.toLocaleString('es-MX')) > 0, f.cop[0].text);
    ok('método de gases con COP_GAS_A y COP_GAS_NMAX', f.gasMethod.A === ctx.COP_GAS_A && f.gasMethod.nmax === ctx.COP_GAS_NMAX && f.gasMethod.pass.indexOf(String(ctx.COP_GAS_A)) > 0);
    ok('DF asignados de COP_ASSIGNED_DF.PI', f.gasMethod.df.every(d => {
        const k = String(d.field).toUpperCase().replace(/[^A-Z0-9]/g, '');
        return d.df === (ctx.COP_ASSIGNED_DF.PI[k] || 1);
    }), f.gasMethod.df);
    const ns = Object.keys(ctx.COP_CO2_TABLE).map(Number);
    ok('CO₂ con COP_CO2_A y el rango de la tabla', f.co2Method.A === ctx.COP_CO2_A && f.co2Method.nMin === Math.min(...ns) && f.co2Method.nMax === Math.max(...ns));
    ok('una familia contada bajo PRE-EURO 7', f.live.families === 1 && f.live.familyKeys[0].split('|')[0] === 'CEED');
}
{
    const f = ctx.normaFacts('SULEV 30', src);
    ok('SULEV 30: fuera del CoP, y lo dice', f.cop.length === 0 && !f.gasMethod && /no está en el alcance/.test(f.steps.find(s => s.id === 'cop').req));
    ok('SULEV 30: cita LEV III / Tier 3', f.cite === 'LEV III / Tier 3');
}
{
    const f = ctx.normaFacts('EURO-5', src);
    const soak = f.steps.find(s => s.id === 'soak').req, prueba = f.steps.find(s => s.id === 'prueba').req;
    ok('reposo = TP_SOAK_DEFAULT_H sin tabla de soak', soak.indexOf(ctx.TP_SOAK_DEFAULT_H + ' h') === 0, soak);
    ok('traza WLTP con VETS_IWR_WLTP y VETS_RMSSE_WLTP_KMH', prueba.indexOf(ctx.VETS_IWR_WLTP.lo + ' a +' + ctx.VETS_IWR_WLTP.hi + ' %') > 0 && prueba.indexOf('≤ ' + ctx.VETS_RMSSE_WLTP_KMH) > 0, prueba);
    ok('aprobación cuenta los datos del F05', f.steps.find(s => s.id === 'aprobacion').req.indexOf('(' + ctx.PDF_REQUIRED_FIELDS.length + ' datos)') > 0);
    ok('checklist de RELEASE_CHECKLIST', f.docs.length === ctx.RELEASE_CHECKLIST.docs.length && f.objects.length === ctx.RELEASE_CHECKLIST.objects.length);
    ok('una norma que no existe → null', ctx.normaFacts('EURO-99', src) === null);
}

console.log('\n== Exportar para un asistente ==');
{
    const facts = ctx.normasList(src).map(n => ctx.normaFacts(n, src));
    const a = ctx.normasMarkdown(facts, { version: '3.21.0', date: '2026-10-22' });
    const b = ctx.normasMarkdown(facts, { version: '3.21.0', date: '2026-10-22' });
    ok('mismo estado → mismo archivo', a === b);
    ok('una sección por norma', DEF.every(p => a.indexOf('## ' + p.name) >= 0));
    ok('trae los límites y el método', a.indexOf('≤ ' + prof('EURO-5').gases.find(g => g.field === 'NOx').limit) > 0 && a.indexOf('A = ' + ctx.COP_GAS_A) > 0);
}

console.log('\n== La ayuda ya no contradice a la app ==');
{
    const soak = ctx.HELP_GLOSSARY.find(e => e.term === 'Soak').def;
    ok('glosario: el reposo es TP_SOAK_DEFAULT_H, no "12h"', soak.indexOf(ctx.TP_SOAK_DEFAULT_H + ' h') > 0 && !/12\s*h/.test(soak), soak);
    const cop = ctx.HELP_GLOSSARY.find(e => /^CoP\b/.test(e.term)).def;
    ok('glosario: CoP con el método de R154 §2.1.1 y el alcance de COP_HQ_RULES', /R154 §2\.1\.1/.test(cop) && cop.indexOf(ctx.copScopeLabel()) > 0, cop);
    const st = ctx.TOURS.cop.find(s => s.title === 'Qué NO cubre');
    ok('tour del CoP: alcance de COP_HQ_RULES', st && st.text.indexOf(ctx.copScopeLabel()) > 0 && !/EURO-6E/.test(st.text), st && st.text);
    ok('la ficha de norma queda registrada', typeof ctx.FICHA_KINDS.norma.model === 'function' && !!ctx.HELP_TABS['pn-normas']);
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exitCode = fallaron ? 1 : 0;
