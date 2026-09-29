// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas de vets.js — importar resultados de HORIBA STARS VETS       ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Los fixtures son las hojas de datos de dos exportaciones REALES del laboratorio
// (México FTP75 y Europa WLTC 3b), extraídas con un lector independiente en Python:
//   tests/fixtures/vets-mx-ftp75.json · tests/fixtures/vets-eu-wltp.json
// El lector de ZIP/XML se prueba con un .xlsx armado aquí mismo (zlib). Con
// VETS_REAL_DIR apuntando a los .xlsx originales, además se compara el lector de JS
// contra los fixtures (no corre en CI: los binarios no viven en el repo).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const noop = () => {};
const audits = [];
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    Promise, TextDecoder, Uint8Array, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    showToast: noop, escapeHtml: s => String(s == null ? '' : s), CASCADE_TOOLTIPS: {},
    auditLog: (...a) => audits.push(a), authGetCurrentUserName: () => 'Prueba',
    pnState: { vetsChecks: [] }, pnSave: noop,
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

// Definiciones únicas que vets.js consume de otros archivos: se toman del código real,
// no de una copia escrita a mano en la prueba.
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const copSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'cop15.js'), 'utf8');
function grab(src, re, what) {
    const m = re.exec(src);
    if (!m) throw new Error('No se encontró ' + what + ' en el código');
    return m[0];
}
vm.runInContext(grab(appSrc, /var GAS_UNIT_FACTORS = \{[\s\S]*?\n\};/, 'GAS_UNIT_FACTORS'), ctx);
vm.runInContext(grab(copSrc, /var ALTA_CORR_VIN_RE = [^\n]+/, 'ALTA_CORR_VIN_RE'), ctx);
vm.runInContext(grab(copSrc, /function vinCheckDigit\(vin\) \{[\s\S]*?\n\}/, 'vinCheckDigit'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'vets.js'), 'utf8'), ctx, { filename: 'vets.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const near = (a, b, tol) => a !== null && a !== undefined && Math.abs(a - b) <= (tol || 1e-9);
const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const MX = fx('vets-mx-ftp75.json'), EU = fx('vets-eu-wltp.json');
// [2.17.1] Exportación real que trae TestDetails pero NO las tablas de datos (CycleResults,
// límites, CustomFields…): solo el reporte visible. Vehículo 48V con dos módulos OBD.
const R48 = fx('vets-eu-reporte-48v.json');
const LBF = 4.4482216153, MPH = 1.609344, LB = 0.45359237;

// ── .xlsx mínimo armado en la prueba ─────────────────────────────────────
function zipBuild(files) {
    const locals = [], centrals = [];
    let off = 0;
    Object.keys(files).forEach((name, i) => {
        const raw = Buffer.from(files[name], 'utf8');
        const stored = i % 2 === 1;                       // una entrada sin comprimir, otra comprimida
        const data = stored ? raw : zlib.deflateRawSync(raw);
        const nm = Buffer.from(name, 'utf8');
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(stored ? 0 : 8, 8);
        lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(stored ? 0 : 8, 10);
        ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
        locals.push(lh, nm, data);
        centrals.push(ch, nm);
        off += 30 + nm.length + data.length;
    });
    const cd = Buffer.concat(centrals);
    const eo = Buffer.alloc(22);
    eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(centrals.length / 2, 8); eo.writeUInt16LE(centrals.length / 2, 10);
    eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
    return new Uint8Array(Buffer.concat(locals.concat([cd, eo])));
}
const nodeInflate = b => Promise.resolve(new Uint8Array(zlib.inflateRawSync(Buffer.from(b))));

(async function main() {
    console.log('\n== Lector de .xlsx (ZIP + XML, sin librerías) ==');
    {
        const xlsx = zipBuild({
            'xl/workbook.xml': '<workbook><sheets><sheet name="Reporte" sheetId="1" r:id="rId1"/><sheet name="CustomFields" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>',
            'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
            'xl/sharedStrings.xml': '<sst><si><t>CustomFieldName</t></si><si><t>Answer</t></si><si><r><t>V</t></r><r><t xml:space="preserve">IN</t></r></si><si><t>A &amp; B</t></si></sst>',
            'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>3</v></c></row></sheetData></worksheet>',
            'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
                '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="inlineStr"><is><t>KNA6BA1D5T1000065</t></is></c></row>' +
                '<row r="4"><c r="A4" t="str"><v>StartingMileage</v></c><c r="B4"><v>5444</v></c><c r="AA4"/></row></sheetData></worksheet>'
        });
        const out = await ctx.vetsReadWorkbook(xlsx, ['CustomFields', 'NoExiste'], nodeInflate);
        ok('solo lee las hojas pedidas (la que no existe se ignora)', Object.keys(out).join() === 'CustomFields');
        const cf = ctx.vetsTable(out.CustomFields);
        ok('texto compartido partido en varios <r> se une', cf.text('CustomFieldName', 0) === 'VIN');
        ok('texto en línea (inlineStr)', cf.text('Answer', 0) === 'KNA6BA1D5T1000065');
        ok('número y texto "str"', cf.num('Answer', 1) === 5444 && cf.text('CustomFieldName', 1) === 'StartingMileage');
        ok('la columna se busca sin distinguir mayúsculas', cf.text('answer', 0) === 'KNA6BA1D5T1000065');
        const all = await ctx.vetsReadWorkbook(xlsx, null, nodeInflate);
        ok('entidades XML (&amp;) y ruta de rels con /xl/ absoluta', all.Reporte['1']['1'] === 'A & B' && !!all.CustomFields);
        let err = '';
        try { await ctx.vetsReadWorkbook(new Uint8Array([1, 2, 3]), null, nodeInflate); } catch (e) { err = e.message; }
        ok('un archivo que no es ZIP da un mensaje que se entiende', /no es un \.xlsx/.test(err), err);
    }

    const real = process.env.VETS_REAL_DIR;
    if (real) {
        console.log('\n== Lector de JS vs lector de Python, con los .xlsx originales (' + real + ') ==');
        for (const [pat, fixture] of [[/SELTOS.*\.xlsx$/, MX], [/CL4.*12V.*\.xlsx$/, EU], [/CL4.*48V.*\.xlsx$/, R48]]) {
            const f = fs.readdirSync(real).find(x => pat.test(x));
            if (!f) { ok('existe ' + pat, false); continue; }
            const u8 = new Uint8Array(fs.readFileSync(path.join(real, f)));
            const g = await ctx.vetsReadWorkbook(u8, ctx.VETS_SHEETS, nodeInflate);
            const same = JSON.stringify(Object.keys(fixture).sort().map(k => [k, g[k]])) ===
                         JSON.stringify(Object.keys(fixture).sort().map(k => [k, fixture[k]]));
            ok(f + ': mismas celdas que el lector independiente', same);
        }
    }

    console.log('\n== México · FTP75 (SELTOS) ==');
    {
        const r = ctx.vetsExtract(MX);
        ok('identidad de la prueba (Entity.ID)', r.testRef === '6845ca0d-26cc-488c-9de6-d3d3ea79fba9' && r.testNumber === 707);
        ok('VIN tecleado en VETS', r.vinFile === 'KNA6BA1D5T1000065');
        ok('sin lectura del ECU en esta prueba', r.vinEcu === '' && r.obfcm === null);
        ok('fecha de la prueba sin zona (hora del equipo de VETS)', r.testStart === '2026-04-22T10:46', r.testStart);
        ok('kilometraje inicial y final', r.startKm === 5444 && r.endKm === 5462);
        ok('CO 0.2357 g/mi (columna Regulated)', near(r.gases.CO.value, 0.2357, 5e-5) && r.gases.CO.unit === 'g/mi' && r.gases.CO.column === 'BagCORegulated');
        ok('CO₂ 236.102 g/mi', near(r.gases.CO2.value, 236.102, 5e-4));
        ok('NOx 0.01217 g/mi', near(r.gases.NOX.value, 0.01217, 5e-6));
        ok('NMOG+NOx combinado (SULEV 30)', near(r.gases.NMOGNOX.value, 0.03478, 5e-6));
        ok('Target A 31.069 lbf → N', near(r.dyno.tA, 31.069 * LBF, 1e-3) && r.dyno.units === 'lbf', r.dyno.tA);
        ok('Target B en lbf/mph → N/(km/h)', near(r.dyno.tB * MPH / LBF, -0.27087, 1e-9), r.dyno.tB * MPH / LBF);
        ok('Target C en lbf/mph² → N/(km/h)²', near(r.dyno.tC * MPH * MPH / LBF, 0.028319, 1e-9), r.dyno.tC * MPH * MPH / LBF);
        ok('ETW 3375 lb → kg', near(r.dyno.etw, 3375 * LB, 1e-6));
        ok('"OTHER" en la configuración de VETS no se toma como dato', Object.keys(r.config).length === 0);
        const dil = r.checks.find(c => c.name === 'CVS Dilution Factor');
        ok('FAIL de "CVS Dilution Factor" en el ciclo y las muestras 2 y 3', dil && dil.status === 'FAIL' && dil.where.join() === 'ciclo,muestra 2,muestra 3', dil && dil.where.join());
        ok('su valor del ciclo sale de la columna que declara la verificación', dil && near(dil.value, 23.155, 1e-3));
        ok('y el detalle dice valor y límite', /ciclo 23\.16 · límite 7–20 ratio · en ciclo, muestra 2, muestra 3/.test(ctx.vetsCheckDetail(dil)), ctx.vetsCheckDetail(dil));
        ok('las demás verificaciones pasan', r.checks.filter(c => c.status === 'FAIL').length === 1 && r.checks.length === 8);
        ok('veredicto de VETS: sin valor no hay PASA ni FALLA (HCHO)', r.vetsLimits.find(l => l.name === 'HCHO').pass === null && r.vetsLimits.find(l => l.name === 'NOX').pass === true);
    }

    console.log('\n== Europa · WLTC 3b (CL4) ==');
    const EUrec = ctx.vetsExtract(EU);
    {
        const r = EUrec;
        ok('identidad de la prueba', r.testRef === 'ea4f8af3-b5a3-481d-b7c7-0994cd18628b' && r.testNumber === 782);
        ok('VIN de VETS y del ECU (el logger marca cada variable con su propio tiempo)', r.vinFile === '3KPFT51B7TE407968' && r.vinEcu === '3KPFT51B7TE407968');
        ok('CALID y CVN del Modo 09', r.obd.calid === '2591TCL46EP0026K' && r.obd.cvn === '0x8dc121ae');
        ok('MIL apagada', r.obd.mil === 'OFF');
        ok('CO₂ 135.411 g/km', near(r.gases.CO2.value, 135.411, 5e-4) && r.gases.CO2.unit === 'g/km');
        ok('NOx 6.297 mg/km', near(r.gases.NOX.value, 6.297, 5e-4) && r.gases.NOX.unit === 'mg/km');
        ok('Target A 102.5 N (ya viene en SI)', r.dyno.tA === 102.5 && r.dyno.units === 'N');
        ok('ETW 1550.2 kg', near(r.dyno.etw, 1550.2, 1e-6));
        ok('configuración de VETS: carrocería 5DR, regulación PRE-EURO 7', r.config['BODY TYPE'].label === '5DR' && r.config['EMISSION REGULATION'].label === 'PRE-EURO 7');
        const pm = r.checks.find(c => c.name === 'PM Pre Filter Temp');
        ok('FAIL "PM Pre Filter Temp" con su estadística', pm && pm.status === 'FAIL' && near(pm.ave, 75.854, 1e-3) && pm.hi === 52);
        ok('detalle: el máximo que se pasó del límite', /^máx\. 82\.68 · límite 20–52 °C · en ciclo$/.test(ctx.vetsCheckDetail(pm)), ctx.vetsCheckDetail(pm));
        ok('OBFCM: 1.37 L según el vehículo (9.73 → 11.1)', near(r.obfcm.fuelL, 1.37, 1e-9) && r.obfcm.fuelBeforeL === 9.73 && r.obfcm.fuelAfterL === 11.1);
        ok('OBFCM: exactitud la que calcula VETS, en % (−0.0256 %, no −2.56 %)', near(r.obfcm.accuracyPct, -0.025583, 1e-6), r.obfcm.accuracyPct);
        ok('OBFCM: combustible medido por VETS', near(r.obfcm.testFuelL, 1.36965, 1e-5));
        let err = '';
        try { ctx.vetsExtract({ Reporte: {} }); } catch (e) { err = e.message; }
        ok('un Excel que no es de VETS lo dice', /no trae las tablas de datos de VETS/.test(err));
    }

    console.log('\n== Europa · solo el reporte visible (CL4 48V, sin CycleResults) ==');
    {
        ok('el archivo NO trae las tablas de datos (por eso fallaba)', !R48.CycleResults && !R48.CustomFields && !!R48.TestDetails && !!R48['VETS Report']);
        const r = ctx.vetsExtract(R48);
        ok('se lee del reporte y lo declara', r.source === 'reporte');
        ok('identidad de la prueba (GUID) y número', r.testRef === '72f4b8ca-1b44-4348-9b60-75104e2eae85' && r.testNumber === 856);
        ok('VIN de la prueba, no el del registro del vehículo en VETS', r.vinFile === '3KPFX51BXTE433243', r.vinFile);
        ok('fecha de inicio y fin (Start/End Time)', r.testStart === '2026-09-29T12:17' && r.testEnd === '2026-09-29T13:07', r.testStart + ' ' + r.testEnd);
        ok('conductor y kilometraje', r.driver === 'Ivan' && r.startKm === 67 && r.endKm === 90);
        ok('distancia de la tabla de bolsas', near(r.distanceKm, 23.1957, 1e-4));
        ok('CO 100.132 mg/km (fila Total)', near(r.gases.CO.value, 100.132, 5e-4) && r.gases.CO.unit === 'mg/km');
        ok('CO₂ 130.488 g/km', near(r.gases.CO2.value, 130.488, 5e-4) && r.gases.CO2.unit === 'g/km');
        ok('NOx 6.354 mg/km, THC, NMHC, PM', near(r.gases.NOX.value, 6.3542, 1e-4) && near(r.gases.THC.value, 10.7509, 1e-4) &&
            near(r.gases.NMHC.value, 8.3846, 1e-4) && near(r.gases.PM.value, 1.6514, 1e-4));
        ok('HC+NOx y NMHC+NOx combinados (g/km)', near(r.gases.HCNOX.value, 0.0171052, 1e-7) && r.gases.THCNOX === r.gases.HCNOX && near(r.gases.NMHCNOX.value, 0.0147389, 1e-7));
        ok('PN y consumo no son gases de Cascade', !r.gases.PN && !r.gases.FUELCONS);
        ok('cada gas coincide con el "Result" de la tabla de límites de VETS', ['CO', 'NOX', 'NMHC', 'PM'].every(g => near(r.vetsLimits.find(l => l.name === g).value, r.gases[g].value, 1e-9)));
        ok('límites de VETS (informativos): 6, todos PASS', r.vetsLimits.length === 6 && r.vetsLimits.every(l => l.pass === true) && r.vetsLimits.find(l => l.name === 'NOX').upper === 59.999999999999993);
        ok('dinamómetro de TestDetails: Target 113.7 N, Dyno A 51.97 N, ETW 1586.95 kg', r.dyno.tA === 113.7 && near(r.dyno.dA, 51.9696, 1e-4) && near(r.dyno.etw, 1586.95, 1e-6));
        const pm = r.checks.find(c => c.name === 'PM Pre Filter Temp');
        ok('FAIL "PM Pre Filter Temp" con su estadística (hoja Limit Checks)', pm && pm.status === 'FAIL' && pm.where.join() === 'ciclo' && near(pm.ave, 76.9247, 1e-4) && near(pm.max, 82.937, 1e-3) && pm.lo === 20 && pm.hi === 52);
        const amb = r.checks.find(c => c.name === 'Ambient Bag Read Delay');
        ok('verificación por muestra: una sola fila, PASS', amb && amb.status === 'PASS' && r.checks.filter(c => c.name === 'Ambient Bag Read Delay').length === 1);
        ok('8 verificaciones, 1 falla', r.checks.length === 8 && r.checks.filter(c => c.status === 'FAIL').length === 1);
        ok('índices de manejo del ciclo', near(r.drive.rmsse, 0.7358, 1e-4) && r.drive.rmsseUnit === 'km/h' && near(r.drive.iwr, -0.7331, 1e-4) && r.drive.driverErrors === 0 && r.drive.violations === 0);
        ok('MIL apagada (hoja OBD II)', r.obd.mil === 'OFF' && r.obd.milDistanceKm === 0);
        ok('48V: CALID/CVN del MOTOR, no de la batería (BECM llega después)', r.obd.calid === '2661VCL46EP0036I' && r.obd.cvn === '0x6adb4309', r.obd.calid);
        ok('VIN del ECU', r.vinEcu === '3KPFX51BXTE433243');
        ok('OBFCM: 1.34 L, exactitud −0.199 % (la de VETS)', near(r.obfcm.fuelL, 1.34, 1e-9) && near(r.obfcm.accuracyPct, -0.199027, 1e-6) && near(r.obfcm.testFuelL, 1.33734, 1e-5));
        ok('lo que el reporte no trae se queda vacío, no se inventa', r.operator === '' && Object.keys(r.config).length === 0 && r.obfcm.fuelBeforeL === null);
        const v = ctx.vetsVinCheck('3KPFX51BXTE433243', r.vinFile, r.vinEcu);
        ok('VIN a tres bandas: coincide', v.status === 'ok');
        let err = '';
        try { ctx.vetsExtract({ TestDetails: R48.TestDetails, 'VETS Report': { 1: { 1: 'Otro reporte' } } }); } catch (e) { err = e.message; }
        ok('reporte sin tabla de bolsas: lo dice', /Bag Analysis Results/.test(err), err);
    }

    console.log('\n== OBD: varios módulos ==');
    {
        const lg = { 1: { 1: 'Time', 2: 'S09EcuNumber', 3: 'S09VarName', 6: 'S09VarValue' }, 2: { 1: 'Date' },
            3: { 1: '1', 2: '1', 3: 'CALID', 6: 'BMSX' }, 4: { 1: '1', 2: '1', 3: 'ECUNAME', 6: 'BECM-B+EnergyCtrl' },
            5: { 1: '1', 2: '2', 3: 'CALID', 6: 'MOTOR1' }, 6: { 1: '1', 2: '2', 3: 'VIN', 6: 'VINX' }, 7: { 1: '1', 2: '2', 3: 'ECUNAME', 6: 'ECM -EngineControl' } };
        const rec = { obd: {} };
        ctx._vetsObdLogger(rec, ctx.vetsTable(lg));
        ok('manda el módulo del motor aunque no sea el primero', rec.obd.calid === 'MOTOR1' && rec.vinEcu === 'VINX', rec.obd.calid);
        const rec2 = { obd: {} };
        ctx._vetsObdLogger(rec2, ctx.vetsTable({ 1: lg[1], 2: lg[2], 3: { 1: '1', 2: '3', 3: 'CALID', 6: 'C3' }, 4: { 1: '1', 2: '0', 3: 'CALID', 6: 'C0' } }));
        ok('sin nombre de módulo: el de menor número', rec2.obd.calid === 'C0');
    }

    console.log('\n== Unidades ==');
    {
        ok('NOx mg/km → g/km', near(ctx.vetsGasValue(EUrec, 'NOx', 'g/km'), 0.006297, 5e-7));
        ok('CO₂ g/km → g/mi', near(ctx.vetsGasValue(EUrec, 'CO2', 'g/mi'), 135.4108 * MPH, 1e-3));
        ok('el campo del perfil "NMOGNOx" empata con NMOG+NOx', near(ctx.vetsGasValue(ctx.vetsExtract(MX), 'NMOGNOx', 'g/mi'), 0.03478, 5e-6));
        ok('unidad que no se sabe convertir → null (no se inventa)', ctx.vetsGasValue(EUrec, 'CO2', 'ppm') === null);
        ok('gas que el archivo no trae → null', ctx.vetsGasValue(EUrec, 'NMOG', 'g/km') === null);
        ok('fecha serial de Excel', ctx.vetsSerialToLocal('46259.4251') === '2026-08-25T10:12');
        ok('lb → kg y N se queda igual', near(ctx.vetsToSI('3375', 'lb'), 1530.874, 1e-3) && ctx.vetsToSI(102.5, 'N') === 102.5);
    }

    console.log('\n== VIN a tres bandas ==');
    {
        const V = ctx.vetsVinCheck;
        const good = 'KNA6BA1D5T1000065', good2 = '3KPFT51B7TE407968';
        ok('los VIN de ejemplo pasan el dígito verificador', ctx.vinCheckDigit(good).valid === true && ctx.vinCheckDigit(good2).valid === true);
        ok('Alta = VETS = ECU → ok', V(good2, good2, good2).status === 'ok');
        ok('Alta = VETS sin ECU → ok', V(good, good, '').status === 'ok');
        const typoAlta = '3KPFT51B7TE407969';
        const a = V(typoAlta, good2, good2);
        ok('VETS = ECU ≠ Alta → error en el Alta, sugiere corregir con el del archivo', a.status === 'alta' && a.suggestVin === good2 && !a.block);
        const b = V(good2, typoAlta, good2);
        ok('Alta = ECU ≠ VETS → se tecleó mal en VETS (no bloquea)', b.status === 'archivo' && !b.block && !b.suggestVin);
        const c = V(good2, typoAlta, '3KPFT51B7TE400000');
        ok('ninguno coincide → bloquea (archivo de otra prueba)', c.status === 'ninguno' && c.block);
        const d = V('KNA6BA1D5T1000066', good, '');
        ok('sin ECU: el del Alta no pasa el dígito → error en el Alta', d.status === 'alta' && d.suggestVin === good);
        const e = V(good, 'KNA6BA1D5T1000066', '');
        ok('sin ECU: el de VETS no pasa el dígito → error en VETS', e.status === 'archivo');
        const otro = 'KNA6BA1D' + ctx.vinCheckDigit('KNA6BA1D0T1000066').expected + 'T1000066';
        ok('sin ECU y ambos pasan → dudoso (no se adivina)', ctx.vinCheckDigit(otro).valid === true && V(good, otro, '').status === 'dudoso');
        ok('el archivo no trae VIN → no se puede comparar, no bloquea', V(good, '', '').status === 'sin-dato');
        ok('ignora mayúsculas y espacios', V(' kna6ba1d5t1000065', good, '').status === 'ok');
    }

    console.log('\n== Configuración del Alta vs VETS ==');
    {
        const alta = { 'BODY TYPE': '5DR', 'TRANSMISSION': '6MT', 'EMISSION REGULATION': 'PRE-EURO 7', 'REGION': 'EUROPE',
            'ENGINE CAPACITY': '1000cc KAPPA PE', 'TIRE ASSY': '205/55 R16', 'MODEL YEAR (VIN)': '26 MODEL' };
        ok('misma configuración → sin avisos', ctx.vetsConfigCheck(alta, EUrec.config).length === 0);
        const d = ctx.vetsConfigCheck(Object.assign({}, alta, { 'BODY TYPE': 'WGN' }), EUrec.config);
        ok('WGN en el Alta vs 5DR en VETS → un aviso', d.length === 1 && d[0].key === 'BODY TYPE' && d[0].alta === 'WGN' && d[0].vets === '5DR');
        ok('empata también por el código de VETS ("A")', ctx.vetsConfigCheck(Object.assign({}, alta, { 'BODY TYPE': 'A' }), EUrec.config).length === 0);
        ok('un campo vacío en el Alta no genera aviso', ctx.vetsConfigCheck({ 'BODY TYPE': '' }, EUrec.config).length === 0);
    }

    console.log('\n== Política de verificaciones y candado ==');
    {
        const view = (checks, policy, vin, dup) => ({ vin: vin || { ok: true }, dup: dup || null, classified: ctx.vetsClassifyChecks(checks, policy) });
        const B = ctx.vetsBlockers;
        const mx = ctx.vetsExtract(MX).checks;
        const d0 = { levels: {}, reasons: {}, justifications: {} };
        ok('solo las que fallan se clasifican', ctx.vetsClassifyChecks(mx, []).length === 1);
        ok('primera vez que falla → hay que clasificarla', /Clasifica la verificación "CVS Dilution Factor"/.test(B(view(mx, []), d0).join()));
        ok('desacreditar pide motivo', B(view(mx, []), { levels: { 'CVS Dilution Factor': 'desacreditada' }, reasons: {}, justifications: {} }).length === 1);
        ok('desacreditada con motivo → se puede aplicar', B(view(mx, []), { levels: { 'CVS Dilution Factor': 'desacreditada' }, reasons: { 'CVS Dilution Factor': 'límite mal configurado en VETS' }, justifications: {} }).length === 0);
        ok('ya desacreditada por el laboratorio → no se vuelve a preguntar', B(view(mx, [{ id: 'cvs dilution factor', level: 'desacreditada' }]), d0).length === 0);
        ok('informativa → no detiene', B(view(mx, [{ id: 'CVS Dilution Factor', level: 'informativa' }]), d0).length === 0);
        ok('importante sin justificar → detiene', /Justifica/.test(B(view(mx, [{ id: 'CVS Dilution Factor', level: 'importante' }]), d0).join()));
        ok('importante justificada → se puede', B(view(mx, [{ id: 'CVS Dilution Factor', level: 'importante' }]), { levels: {}, reasons: {}, justifications: { 'CVS Dilution Factor': 'se repitió, quedó en 18' } }).length === 0);
        ok('VIN de otra prueba → detiene siempre', B(view([], [], { ok: false, block: true }), d0).length === 1);
        ok('VIN distinto sin bloqueo → pide justificación', B(view([], [], { ok: false, block: false }), d0).length === 1 &&
            B(view([], [], { ok: false, block: false }), Object.assign({}, d0, { vinJustification: 'el ECU confirma el vehículo' })).length === 0);
        ok('la misma prueba ya adjunta a otro vehículo → detiene', B(view([], [], null, { id: 9 }), d0).length === 1);

        ctx.pnState.vetsChecks = [];
        audits.length = 0;
        ok('guardar la clasificación', ctx.vetsPolicySet('PM Pre Filter Temp', 'desacreditada', 'sensor sin conectar', { skipAuth: true }) === true);
        ok('cambiarla actualiza la misma entrada (no duplica)', ctx.vetsPolicySet('pm pre filter temp', 'informativa', '', { skipAuth: true }) &&
            ctx.pnState.vetsChecks.length === 1 && ctx.pnState.vetsChecks[0].level === 'informativa' && ctx.pnState.vetsChecks[0].id === 'PM Pre Filter Temp');
        ok('cada cambio se audita con antes → después', audits.length === 2 && /Desacreditada → Informativa/.test(audits[1][3]), audits[1] && audits[1][3]);
        ok('un nivel inventado no se guarda', ctx.vetsPolicySet('X', 'ignorar', '', { skipAuth: true }) === false);
        ok('la entrada lleva id y timestamp (fusión por id en el sync)', !!ctx.pnState.vetsChecks[0].id && !!ctx.pnState.vetsChecks[0].timestamp);
    }

    console.log('\n== Qué se llena y qué se guarda ==');
    {
        const profile = { gases: [
            { field: 'CO', label: 'CO', unit: 'g/km', limit: 1.0 }, { field: 'NOx', label: 'NOx', unit: 'g/km', limit: 0.06 },
            { field: 'THC', label: 'THC', unit: 'g/km', limit: 0.1 }, { field: 'PN', label: 'PN', unit: '#/km', limit: null } ] };
        const veh = { id: 1, vin: '3KPFT51B7TE407968', testData: { targetA: 102.5, etw: 1500 } };
        const rows = ctx.vetsFillRows(veh, EUrec, profile, { CO: 0.19545 });
        const by = id => rows.find(r => r.id === id);
        ok('gas vacío → se llena (NOx en g/km)', by('gas:NOx').state === 'llenar' && near(by('gas:NOx').vets, 0.006297, 5e-7));
        ok('gas ya tecleado igual (redondeo) → igual', by('gas:CO').state === 'igual');
        ok('gas que VETS no trae (PN) no aparece', !by('gas:PN'));
        ok('Target A igual → igual; ETW distinto → distinto (no se pisa solo)', by('dyno:targetA').state === 'igual' && by('dyno:etw').state === 'distinto');
        ok('Dyno B vacío → se llena', by('dyno:dynoB').state === 'llenar' && near(by('dyno:dynoB').vets, -0.16554, 1e-5));
        ok('fecha de prueba → se llena', by('td:testDatetime').vets === '2026-08-25T10:12');

        ok('comparar: 0.0122 tecleado vs 0.0121665 → coincide (redondeo de lo tecleado)', ctx.vetsCompareValue(0.0122, 0.0121665).ok === true);
        ok('comparar: 0.0125 vs 0.0121665 → no coincide', ctx.vetsCompareValue(0.0125, 0.0121665).ok === false);
        ok('comparar: 236.1 vs 236.1023 → coincide', ctx.vetsCompareValue(236.1, 236.1023).ok === true);
        ok('comparar: sin valor → sin veredicto', ctx.vetsCompareValue(null, 1).ok === null);

        const cls = ctx.vetsClassifyChecks(EUrec.checks, []).map(x => ({ check: x.check, level: 'desacreditada', known: false }));
        const s = ctx.vetsSummary(EUrec, { fileName: 'x.xlsx', sha256: 'ab'.repeat(32), at: '2026-09-28T10:00:00Z', by: 'Prueba' }, cls,
            { vinStatus: 'ok', justifications: {} });
        const size = JSON.stringify(s).length;
        ok('el resumen que viaja con el vehículo es compacto (< 4 KB; el documento de vehículos tiene tope)', size < 4096, size + ' bytes');
        ok('el resumen guarda la falla desacreditada con su detalle (evidencia, no se borra)', s.checksFail.length === 1 && s.checksFail[0].level === 'desacreditada' && /82\.68/.test(s.checksFail[0].detail));
        ok('el resumen guarda OBFCM, huella y Test Reference', s.obfcm && s.sha256.length === 64 && s.testRef === EUrec.testRef);

        const v2 = { id: 2, testData: { vets: s } };
        const pre = ctx.vetsGasValuesFor(v2, profile);
        ok('precarga de la captura del liberador desde el resumen, en la unidad del perfil', pre && near(pre.NOx, 0.006297, 5e-7) && near(pre.CO, 0.19545, 5e-5) && !('PN' in pre));
        ok('sin prueba VETS adjunta → no precarga nada', ctx.vetsGasValuesFor({ testData: {} }, profile) === null);

        const lib = { id: 3, testData: { gasResults: { liberador: { values: { CO: 0.19545, NOx: 0.0065 } } } } };
        const cmp = ctx.vetsCompareRows(lib, EUrec, profile);
        ok('validación del importador: compara solo lo que se tecleó', cmp.length === 2 && cmp.find(r => r.field === 'CO').ok === true && cmp.find(r => r.field === 'NOx').ok === false);
    }

    console.log('\n== 2.18.0 · Técnico adjunta, el liberador decide ==');
    {
        const R = ctx.vetsExtract(R48);
        const clsNew = ctx.vetsClassifyChecks(R.checks, []);
        const view = (decides, policy) => ({ vin: { ok: true, status: 'ok' }, dup: null, classified: ctx.vetsClassifyChecks(R.checks, policy || []), rows: [], profile: null, decides });
        const d0 = { overwrite: {}, levels: {}, reasons: {}, justifications: {}, vinJustification: '' };
        ok('sin poder liberar: una falla nueva NO detiene el adjuntar', ctx.vetsBlockers(view(false), d0).length === 0);
        ok('sin poder liberar: una Importante sin justificar tampoco', ctx.vetsBlockers(view(false, [{ id: 'PM Pre Filter Temp', level: 'importante' }]), d0).length === 0);
        ok('pero el VIN y la prueba duplicada SÍ detienen a cualquiera', ctx.vetsBlockers(Object.assign(view(false), { vin: { ok: false, block: true } }), d0).length === 1 &&
            ctx.vetsBlockers(Object.assign(view(false), { dup: { id: 9 } }), d0).length === 1);
        ok('el liberador sigue teniendo que clasificar', /Clasifica/.test(ctx.vetsBlockers(view(true), d0).join()));

        const P = ctx.vetsPendingDecisions;
        const sum = (level, just) => ({ checksFail: [{ name: 'PM Pre Filter Temp', level: level, detail: 'máx. 82.94', justification: just || '' }] });
        ok('falla sin nivel → pendiente de clasificar', P(sum(null), []).length === 1 && P(sum(null), [])[0].need === 'clasificar');
        ok('si el laboratorio ya la clasificó después (desacreditada) → ya no está pendiente', P(sum(null), [{ id: 'pm pre filter temp', level: 'desacreditada' }]).length === 0);
        ok('clasificada después como Importante → falta justificarla', P(sum(null), [{ id: 'PM Pre Filter Temp', level: 'importante' }])[0].need === 'justificar');
        ok('Importante sin justificar → pendiente; justificada → no', P(sum('importante'), [])[0].need === 'justificar' && P(sum('importante', 'se repitió y quedó en 48'), []).length === 0);
        ok('informativa o desacreditada → nada pendiente', P(sum('informativa'), []).length === 0 && P(sum('desacreditada'), []).length === 0);
        ok('sin prueba VETS → nada pendiente', P(null, []).length === 0 && P({}, []).length === 0);

        const DB = ctx.vetsDecideBlockers;
        const pend = [{ name: 'PM Pre Filter Temp', need: 'clasificar' }];
        ok('decidir: sin nivel no se guarda', /Clasifica/.test(DB(pend, d0).join()));
        ok('decidir: desacreditar pide motivo', /desacredita/.test(DB(pend, { levels: { 'PM Pre Filter Temp': 'desacreditada' }, reasons: {}, justifications: {} }).join()));
        ok('decidir: Importante pide justificación', /Justifica/.test(DB(pend, { levels: { 'PM Pre Filter Temp': 'importante' }, reasons: {}, justifications: {} }).join()));
        ok('decidir: justificar una Importante ya clasificada', DB([{ name: 'X', need: 'justificar' }], { levels: {}, reasons: {}, justifications: { X: 'lectura repetida dentro' } }).length === 0);

        // Capa de datos: un Técnico adjunta (test.vets sí, test.release no)
        const saved = [];
        ctx.saveDB = () => { saved.push(1); return true; };
        let perms = { 'test.vets': true, 'test.release': false };
        ctx._cascadeCan = p => !!perms[p];
        ctx._cascadeGate = p => !!perms[p];
        ctx.pnState.vetsChecks = [];
        audits.length = 0;
        const veh = { id: 'v48', vin: '3KPFX51BXTE433243', status: 'ready-release', timeline: [], testData: {} };
        ctx.db.vehicles = [veh];
        const meta = { fileName: 'x.xlsx', sha256: 'cd'.repeat(32), at: '2026-09-29T18:00:00Z', by: 'Beto Técnico' };
        ctx._vetsCtx = { mode: 'liberar', vehicleId: 'v48', rec: R, meta, view: view(true) };   // la pantalla dice que decide…
        const tryDecide = Object.assign({}, d0, { levels: { 'PM Pre Filter Temp': 'desacreditada' }, reasons: { 'PM Pre Filter Temp': 'la meto yo' } });
        const r1 = ctx.vetsApply('v48', tryDecide);
        ok('el Técnico adjunta', r1.ok === true, r1.reason);
        ok('…y aunque lleguen decisiones, la capa de datos NO clasifica por él', ctx.pnState.vetsChecks.length === 0 && veh.testData.vets.checksFail[0].level === null);
        ok('queda 1 falla por decidir y lo reporta', r1.pending === 1 && ctx.vetsPendingDecisions(veh.testData.vets, ctx.vetsPolicy()).length === 1);
        ok('la auditoría dice que quedó para el liberador', audits.some(a => a[1] === 'vets_importado' && /por decidir del liberador/.test(a[3])));
        perms = { 'test.vets': false, 'test.release': false };
        ctx._vetsCtx = { mode: 'liberar', vehicleId: 'v48', rec: R, meta, view: view(false) };
        ok('un Practicante (sin test.vets) no adjunta', ctx.vetsApply('v48', d0).ok === false);
        perms = { 'test.vets': true, 'test.release': false };
        ok('el Técnico tampoco puede decidir después', ctx.vetsDecideApply('v48', tryDecide).ok === false && veh.testData.vets.checksFail[0].level === null);

        // El liberador decide
        perms = { 'test.vets': true, 'test.release': true };
        const sinMotivo = ctx.vetsDecideApply('v48', { levels: { 'PM Pre Filter Temp': 'desacreditada' }, reasons: {}, justifications: {} });
        ok('decidir sin motivo se rechaza en la capa de datos', sinMotivo.ok === false && /desacredita/.test(sinMotivo.reason));
        audits.length = 0;
        const r2 = ctx.vetsDecideApply('v48', { levels: { 'PM Pre Filter Temp': 'desacreditada' }, reasons: { 'PM Pre Filter Temp': 'sensor de prefiltro sin conectar en VETS' }, justifications: {} });
        const c0 = veh.testData.vets.checksFail[0];
        ok('el liberador decide y se guarda en el resumen con quién', r2.ok && c0.level === 'desacreditada' && c0.decidedBy === 'Prueba' && !!c0.decidedAt, r2.reason);
        ok('la clasificación queda para todo el laboratorio', ctx.pnState.vetsChecks.length === 1 && ctx.pnState.vetsChecks[0].level === 'desacreditada' && r2.policy === 1);
        ok('línea de tiempo y auditoría con antes → después', veh.timeline.some(t => t.action === 'Fallas de VETS decididas') &&
            audits.some(a => a[1] === 'vets_fallas_decididas') && audits.some(a => a[1] === 'vets_verificacion_clasificada'));
        ok('ya no queda nada pendiente', ctx.vetsPendingDecisions(veh.testData.vets, ctx.vetsPolicy()).length === 0);
        veh.status = 'pending-approval';
        ok('enviado a aprobación ya no se decide', ctx.vetsDecideApply('v48', d0).ok === false);
        delete ctx._cascadeCan; delete ctx._cascadeGate;
        ctx._vetsCtx = null; ctx.pnState.vetsChecks = []; ctx.db.vehicles = [];
    }

    console.log('\n== OBFCM por familia (CoP → Expediente) ==');
    {
        const mk = (vin, fam, acc, at) => ({ vin, fam, testData: { vets: { testNumber: 1, testStart: at, obfcm: { fuelL: 1.37, accuracyPct: acc, distKm: 23 } } } });
        const vs = [mk('A', 'F1', -0.03, '2026-08-01T10:00'), mk('B', 'F1', 0.5, '2026-09-01T10:00'), mk('C', 'F2', 1, '2026-09-02T10:00'),
                    { vin: 'D', fam: 'F1', testData: {} }];
        const o = ctx.vetsObfcmForFamily(vs, v => v.fam, 'F1');
        ok('solo los de la familia y con OBFCM', o.n === 2);
        ok('más reciente primero', o.rows[0].vin === 'B');
        ok('promedio, mínimo y máximo', near(o.mean, 0.235, 1e-9) && o.min === -0.03 && o.max === 0.5);
        ok('familia sin OBFCM → vacío', ctx.vetsObfcmForFamily(vs, v => v.fam, 'F9').n === 0);
    }

    console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
    process.exit(fallaron ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
