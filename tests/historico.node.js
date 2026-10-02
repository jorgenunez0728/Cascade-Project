// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.30.0] Pruebas históricas (VETS) — importar por lote y confirmar  ║
// ╚══════════════════════════════════════════════════════════════════════╝
// Corre historico.js + vets.js reales en un `vm`, con las dos exportaciones reales de
// VETS de tests/fixtures y el catálogo horneado en app.js. Además vigila que nadie
// vuelva a escribir `status !== 'archived'` para decir "vehículo en curso".

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = n => fs.readFileSync(path.join(__dirname, '..', 'js', n), 'utf8');
const noop = () => {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    Promise, TextDecoder, Uint8Array, setTimeout, clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    showToast: noop, escapeHtml: s => String(s == null ? '' : s), CASCADE_TOOLTIPS: {},
    auditLog: noop, authGetCurrentUserName: () => 'Prueba', pnState: { vetsChecks: [] }, pnSave: noop,
    db: { vehicles: [] }
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

const appSrc = R('app.js'), copSrc = R('cop15.js');
function grab(src, re, what) {
    const m = re.exec(src);
    if (!m) throw new Error('No se encontró ' + what + ' en el código');
    return m[0];
}
vm.runInContext(grab(appSrc, /var GAS_UNIT_FACTORS = \{[\s\S]*?\n\};/, 'GAS_UNIT_FACTORS'), ctx);
vm.runInContext(grab(appSrc, /var VEHICLE_STATUS_HISTORIC = [\s\S]*?\nfunction vehicleListDate\(v\) \{[\s\S]*?\n\}/, 'helpers de estado'), ctx);
vm.runInContext(grab(copSrc, /var ALTA_CORR_VIN_RE = [^\n]+/, 'ALTA_CORR_VIN_RE'), ctx);
vm.runInContext(grab(copSrc, /function vinCheckDigit\(vin\) \{[\s\S]*?\n\}/, 'vinCheckDigit'), ctx);
vm.runInContext(R('vets.js'), ctx, { filename: 'vets.js' });
vm.runInContext(R('historico.js'), ctx, { filename: 'historico.js' });

// Catálogo real (el mismo CSV horneado de app.js)
const csv = grab(appSrc, /const CSV_CONFIGURATIONS = `[\s\S]*?`/, 'CSV_CONFIGURATIONS').replace(/^const CSV_CONFIGURATIONS = `/, '').replace(/`$/, '');
const lines = csv.trim().split('\n');
const head = lines[0].split(',');
const CATALOG = lines.slice(1).map(l => { const c = l.split(','); const o = {}; head.forEach((h, i) => { o[h.trim()] = (c[i] || '').trim(); }); return o; });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const EU = ctx.vetsExtract(fx('vets-eu-wltp.json'));
const MX = ctx.vetsExtract(fx('vets-mx-ftp75.json'));
const EU_CODE = 'CL4-26 MODEL-6MT-0-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0';
const item = (rec, extra) => Object.assign({ fileName: 'prueba.xlsx', sha256: 'abc', size: 1000, rec: rec }, extra || {});
const plan = (items, c) => ctx.historicoPlan(items, Object.assign({ vehicles: [], catalog: CATALOG, today: '2026-10-02',
    vinCheck: v => ctx.vinCheckDigit(v), statusLabel: s => s }, c || {}));

console.log('\n== estado del vehículo ==');
{
    const h = { status: 'historico' }, a = { status: 'archived' }, r = { status: 'ready-release' };
    ok('un histórico no está en curso', !ctx.vehicleIsLive(h) && ctx.vehicleIsHistoric(h));
    ok('un archivado no está en curso y sí es prueba pasada', !ctx.vehicleIsLive(a) && ctx.vehicleIsPastTest(a));
    ok('un listo para liberar sí está en curso', ctx.vehicleIsLive(r) && !ctx.vehicleIsPastTest(r));
    ok('un histórico es prueba pasada', ctx.vehicleIsPastTest(h));
    ok('null no truena', !ctx.vehicleIsLive(null) && !ctx.vehicleIsHistoric(null));
    ok('un histórico se lista por la fecha de la prueba, no la del alta',
       ctx.vehicleListDate({ status: 'historico', registeredAt: '2026-10-02T10:00:00Z', testData: { testDatetime: '2025-08-07T12:26' } }) === '2025-08-07T12:26');
    ok('un vehículo normal se lista por su alta', ctx.vehicleListDate({ status: 'archived', registeredAt: '2026-01-02' }) === '2026-01-02');
}

console.log('\n== configuración desde VETS ==');
{
    ok('VETS Europa trae los campos del catálogo (Modelo incluido)', EU.configAll && EU.configAll['Modelo'] && EU.configAll['Modelo'].label === 'CL4',
       JSON.stringify(EU.configAll));
    ok('"OTHER" no cuenta como dato', !MX.configAll['Modelo'] && !MX.configAll['REGION'], JSON.stringify(MX.configAll));
    ok('con un solo campo útil (LHD) no se proponen 222 configuraciones', ctx.historicoConfigMatch(MX.configAll, CATALOG).exact.length === 0);
    const m = ctx.historicoConfigMatch(EU.configAll, CATALOG);
    ok('la prueba europea empata con UNA configuración', m.exact.length === 1 && m.exact[0].codigo_config_text === EU_CODE,
       m.exact.map(r => r.codigo_config_text).join(' | '));
    ok('"0 - 12V" empata con el "0" del catálogo (por código)', m.exact.length === 1);
    const sinRin = Object.assign({}, EU.configAll); delete sinRin['TIRE ASSY'];
    ok('sin el rin, coinciden varias (hay que elegir)', ctx.historicoConfigMatch(sinRin, CATALOG).exact.length > 1);
    const otroRin = Object.assign({}, EU.configAll, { 'TIRE ASSY': { code: '9', label: '999/99 R99' } });
    const near = ctx.historicoConfigMatch(otroRin, CATALOG);
    ok('un campo que no existe en el catálogo ofrece las cercanas y dice en qué difieren',
       near.exact.length === 0 && near.near.length > 0 && near.near.every(n => n.miss.length === 1 && n.miss[0] === 'TIRE ASSY'));
}

console.log('\n== plan del lote ==');
{
    let p = plan([item(EU)], { purpose: 'COP-Emisiones' });
    ok('archivo completo → se importa', p[0].action === 'importar', JSON.stringify(p[0]));
    ok('la configuración sale de VETS', p[0].configCode === EU_CODE && p[0].configFrom === 'vets');
    ok('el VIN del ECU manda sobre el tecleado', p[0].vin === (EU.vinEcu || EU.vinFile).toUpperCase());
    ok('la fecha es la de la prueba según VETS', p[0].testDate === EU.testStart);

    p = plan([item(EU)]);
    ok('sin propósito → hay que elegirlo', p[0].action === 'elegir' && /propósito/.test(p[0].why));

    p = plan([item(MX)], { purpose: 'COP-Emisiones' });
    ok('VETS México sin configuración → hay que elegirla', p[0].action === 'elegir' && /configuración/.test(p[0].why), JSON.stringify(p[0]));
    p = plan([item(MX)], { purpose: 'COP-Emisiones', ov: { 0: { configCode: EU_CODE } } });
    ok('al elegirla, se importa', p[0].action === 'importar' && p[0].configFrom === 'elegida');
    p = plan([item(MX)], { purpose: 'COP-Emisiones', ov: { 0: { configCode: 'NO-EXISTE' } } });
    ok('una configuración que no está en el catálogo no cuenta', p[0].action === 'elegir');

    const conVin = { id: 7, vin: MX.vinFile, status: 'archived', configCode: EU_CODE, testData: { testDatetime: '2026-09-01T10:00' } };
    p = plan([item(MX)], { purpose: 'COP-Emisiones', vehicles: [conVin] });
    ok('sin configuración en VETS, toma la de ese VIN en CASCADE', p[0].action === 'importar' && p[0].configFrom === 'vin', JSON.stringify(p[0]));

    const ya = { id: 3, vin: 'X', status: 'archived', testData: { vets: { testRef: EU.testRef } } };
    p = plan([item(EU)], { purpose: 'COP-Emisiones', vehicles: [ya] });
    ok('la misma prueba de VETS ya en CASCADE → se omite', p[0].action === 'duplicado' && p[0].dupId === 3);

    p = plan([item(EU), item(EU, { fileName: 'copia.xlsx' })], { purpose: 'COP-Emisiones' });
    ok('dos veces el mismo archivo en el lote → la segunda se omite', p[0].action === 'importar' && p[1].action === 'repetido');

    const twin = { id: 9, vin: (EU.vinEcu || EU.vinFile), status: 'pending-approval', testData: { testDatetime: EU.testStart } };
    p = plan([item(EU)], { purpose: 'COP-Emisiones', vehicles: [twin] });
    ok('si la prueba nació en CASCADE ese día → no se importa como histórico', p[0].action === 'en-cascade' && p[0].dupId === 9);

    p = plan([{ fileName: 'roto.xlsx', error: 'No se pudo leer: ZIP' }]);
    ok('un archivo ilegible lo dice', p[0].action === 'error' && /ZIP/.test(p[0].why));

    const sinVin = Object.assign({}, EU, { vinFile: '', vinEcu: '' });
    p = plan([item(sinVin)], { purpose: 'COP-Emisiones' });
    ok('sin VIN → pide escribirlo', p[0].action === 'sin-vin');
    p = plan([item(sinVin)], { purpose: 'COP-Emisiones', ov: { 0: { vin: '3kpft51b7te407968' } } });
    ok('el VIN escrito a mano se normaliza y se importa', p[0].action === 'importar' && p[0].vin === '3KPFT51B7TE407968');
    p = plan([item(sinVin)], { purpose: 'COP-Emisiones', ov: { 0: { vin: '3KPFT51B7TE40796' } } });
    ok('un VIN de 16 caracteres no pasa', p[0].action === 'sin-vin');

    const futura = Object.assign({}, EU, { testStart: '2027-01-01T10:00' });
    p = plan([item(futura)], { purpose: 'COP-Emisiones' });
    ok('una fecha posterior a hoy no se importa', p[0].action === 'error');

    const s = ctx.historicoPlanSummary(plan([item(EU), item(MX), { fileName: 'x', error: 'mal' }], { purpose: 'COP-Emisiones' }));
    ok('el resumen cuenta importar / piden dato / omitidas', s.importar === 1 && s.pendientes === 1 && s.omitidas === 1, JSON.stringify(s));
}

console.log('\n== el vehículo que se crea ==');
{
    const p = plan([item(EU)], { purpose: 'COP-Emisiones' });
    const cfg = CATALOG.filter(r => r.codigo_config_text === EU_CODE)[0];
    const v = ctx.historicoBuildVehicle(p[0], item(EU), { id: 'v-1', nowIso: '2026-10-02T15:00:00.000Z', who: 'Ana', whoId: 'u1',
        deviceId: 'd1', catalogRow: cfg, batchId: 'hv-1', summary: { testRef: EU.testRef, gases: {} } });
    ok('status historico, por confirmar', v.status === 'historico' && v.historic.state === 'pendiente');
    ok('el alta es HOY (no se fecha hacia atrás)', v.registeredAt === '2026-10-02T15:00:00.000Z');
    ok('la fecha de la prueba es la de VETS', v.testData.testDatetime === EU.testStart);
    ok('queda quién importó (para que no se confirme a sí mismo)', v.historic.importedById === 'u1' && v.historic.importedBy === 'Ana');
    ok('la huella del archivo se guarda', v.historic.file.sha256 === 'abc');
    ok('no trae resultados finales todavía (no entra al SPC)', !v.testData.gasResults);
    ok('la configuración es una COPIA de la fila del catálogo', v.config !== cfg && v.config['Modelo'] === 'CL4');
    ok('la línea de tiempo dice qué pasó', /importada de VETS/.test(v.timeline[0].action) && v.timeline[0].data.status === 'historico');
}

console.log('\n== revisión de quien confirma ==');
{
    const profile = { name: 'PRE-EURO 7', gases: [
        { field: 'THC', label: 'THC', unit: 'g/km', limit: 0.1 }, { field: 'NOx', label: 'NOx', unit: 'g/km', limit: 0.06 },
        { field: 'CO', label: 'CO', unit: 'g/km', limit: 1.0 }, { field: 'CO2', label: 'CO2', unit: 'g/km', limit: null }
    ] };
    const summary = ctx.vetsSummary(EU, {}, [], {});
    const v = { vin: '3KPFT51B7TE407968', status: 'historico', testData: { vets: summary } };
    let m = ctx.historicoReviewModel(v, { profile: profile, policy: [] });
    ok('los gases salen del archivo en la unidad del perfil', m.values.NOx !== undefined && m.values.CO !== undefined, JSON.stringify(m.values));
    ok('los informativos se muestran sin límite', m.gases.filter(g => g.field === 'CO2')[0].limit === null);
    ok('dentro de límites y sin fallas → no pide observación', !m.needsNote && m.allPass && !m.block, JSON.stringify(m.reasons));

    const bajo = JSON.parse(JSON.stringify(profile)); bajo.gases[1].limit = 0.000001;
    m = ctx.historicoReviewModel(v, { profile: bajo, policy: [] });
    ok('un gas sobre el límite pide observación (no bloquea: la prueba ya ocurrió)', m.needsNote && !m.allPass && !m.block && /NOx sobre el límite/.test(m.reasons.join()));

    const conFalla = { vin: v.vin, status: 'historico', testData: { vets: Object.assign({}, summary, { checksFail: [{ name: 'DilutionFactor', level: null, detail: 'x' }] }) } };
    m = ctx.historicoReviewModel(conFalla, { profile: profile, policy: [] });
    ok('una verificación de VETS sin clasificar pide observación', m.needsNote && /DilutionFactor/.test(m.reasons.join()));
    m = ctx.historicoReviewModel(conFalla, { profile: profile, policy: [{ id: 'DilutionFactor', level: 'desacreditada' }] });
    ok('si el laboratorio ya la desacreditó, no pide observación', !m.needsNote, JSON.stringify(m.reasons));

    m = ctx.historicoReviewModel(v, { profile: null, regName: 'EURO-X' });
    ok('sin perfil de regulación no se puede confirmar', !!m.block && /EURO-X/.test(m.block));

    m = ctx.historicoReviewModel(v, { profile: profile, policy: [] });
    const D = ctx.historicoDecisionCheck;
    ok('sin elegir → lo pide', /Confirmo/.test(D(m, null)));
    ok('confirmar sin observaciones → sí', D(m, { action: 'confirmar' }) === '');
    ok('no confirmar exige motivo', /motivo|por qué/.test(D(m, { action: 'rechazar', note: 'no' })) && D(m, { action: 'rechazar', note: 'otro VIN' }) === '');
    const mObs = ctx.historicoReviewModel(conFalla, { profile: profile, policy: [] });
    ok('con observaciones, confirmar exige escribirla', D(mObs, { action: 'confirmar', note: '' }) !== '' && D(mObs, { action: 'confirmar', note: 'válida para R&D' }) === '');
    const mBlock = ctx.historicoReviewModel(v, { profile: null });
    ok('un bloqueo no se salta con una observación', D(mBlock, { action: 'confirmar', note: 'aun así' }) !== '');
}

console.log('\n== pendientes y equipos ==');
{
    const vs = [
        { id: 1, status: 'historico', historic: { state: 'pendiente', importedById: 'u1' } },
        { id: 2, status: 'historico', historic: { state: 'pendiente', importedById: 'u2' } },
        { id: 3, status: 'historico', historic: { state: 'confirmado', importedById: 'u2' } },
        { id: 4, status: 'archived' }
    ];
    const s = ctx.historicoPendingSummary(vs, 'u1');
    ok('cuenta las pendientes y separa las que importé yo', s.total === 2 && s.mine === 1 && s.forMe === 1 && s.ids[0] === 2, JSON.stringify(s));
    const cmp = (a, b) => { const p = x => String(x).split('.').map(Number); const A = p(a), B = p(b); for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0); } return 0; };
    const view = { rows: [
        { id: 'yo', own: true, version: '2.29.0' }, { id: 'a', version: '2.29.2' }, { id: 'b', version: '2.30.0' },
        { id: 'c', version: '' }, { id: 'd', version: '2.10.0', inactive: true }
    ] };
    const old = ctx.historicoOutdatedDevices(view, '2.30.0', cmp).map(r => r.id);
    ok('bloquean los equipos activos anteriores a 2.30.0 o sin versión', old.join() === 'a,c', old.join());
}

console.log('\n== guardia: "en curso" se pregunta con vehicleIsLive ==');
{
    const malos = [];
    fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => /\.js$/.test(f)).forEach(f => {
        R(f).split('\n').forEach((l, i) => {
            if (!/status\s*!==?\s*'archived'/.test(l)) return;
            if (/^\s*(\/\/|\*)/.test(l)) return;                       // comentario
            if (/function vehicleIsLive/.test(l)) return;               // la definición
            if (/status\s*!==?\s*'archived'\s*(\|\||\)\s*return)/.test(l)) return;   // "si no es archivado, salir" = solo archivados
            malos.push(f + ':' + (i + 1) + '  ' + l.trim());
        });
    });
    ok('ningún filtro "en curso" con status !== \'archived\' (usa vehicleIsLive)', malos.length === 0, '\n      ' + malos.join('\n      '));
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
