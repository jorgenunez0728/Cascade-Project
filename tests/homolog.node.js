// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Pruebas de homolog.js — inercia (ETW) WLTP desde la ficha ICMS       ║
// ╚══════════════════════════════════════════════════════════════════════╝
// El caso de referencia es una captura real del software del dinamómetro del
// laboratorio: TM 1568 + MR 44.7 = Inertia 1612.7 kg (ambos del ICMS).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const store = {};
const ctx = {
    console, Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isNaN, isFinite, parseInt, parseFloat,
    setTimeout, clearTimeout,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => ({ style: {} }) },
    safeParse: (k, d) => d, showToast: noop, escapeHtml: s => String(s), CASCADE_TOOLTIPS: {},
    TextDecoder,
    db: { vehicles: [] }
};
const audits = [];
ctx.auditLog = (m, a, e, d, o) => audits.push({ m, a, e, d, o });
let saveOk = true;
ctx.saveDB = () => saveOk;
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'homolog.js'), 'utf8'), ctx, { filename: 'homolog.js' });
// [2.29.0] El lector de .xlsx propio (sin internet) vive en vets.js.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'vets.js'), 'utf8'), ctx, { filename: 'vets.js' });
const zlib = require('zlib');
const inflate = b => Promise.resolve(new Uint8Array(zlib.inflateRawSync(Buffer.from(b))));

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

console.log('\n== homoWltpInertia ==');
{
    const f = ctx.homoWltpInertia;
    const r = f({ tm: 1568, mr: 44.7 });
    ok('captura del laboratorio: TM 1568 + MR 44.7 = 1612.7', r && r.inertia === 1612.7, JSON.stringify(r));
    ok('acepta números como texto (así llegan del formulario)', f({ tm: '1568', mr: '44.7' }).inertia === 1612.7);
    ok('redondea a 0.1 kg (sin basura de punto flotante)', f({ tm: 1500.12, mr: 40.04 }).inertia === 1540.2);
    ok('MR = 0 es válido', f({ tm: 1500, mr: 0 }).inertia === 1500);
    ok('sin TM → null (no se inventa)', f({ mr: 44.7 }) === null);
    ok('sin MR → null (la TM sola NO es la inercia)', f({ tm: 1568 }) === null);
    ok('vacíos, texto o negativos → null', f({ tm: '', mr: 'x' }) === null && f({ tm: 1568, mr: -1 }) === null);
}

(async () => {
    console.log('\n== [2.29.0] El archivo del ICMS por Work Order (archivo real) ==');
    const FILE = 'VIN_432873_1790797415928.xlsx';
    const u8 = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'icms', FILE)));
    const sheets = await ctx.vetsReadWorkbook(u8, null, inflate);
    const grid = ctx._homoGridFromSheet(sheets[Object.keys(sheets)[0]]);
    ok('el lector propio lo abre (2 renglones, 93 columnas)', grid.length === 2 && grid[0].length === 93, grid.length + 'x' + (grid[0] || []).length);
    const p = ctx.homoIcmsRows(grid);
    const r = p.rows && p.rows[0];
    ok('una fila, sin columnas faltantes', p.rows.length === 1 && p.faltanColumnas.length === 0, JSON.stringify(p.faltanColumnas));
    ok('identidad: WO E2608A135C02A · MC 8GS6K5G17 · B5P12/M61A11',
        r.workOrder === 'E2608A135C02A' && r.mcCode === '8GS6K5G17' && r.variant === 'B5P12' && r.version === 'M61A11');
    ok('f0 = 102.5 (WLTP), NO 88.9182 (NEDC)', r.f0 === 102.5, r.f0);
    ok('f1 = 0.147 y f2 = 0.03331 (WLTP, no 0.1449 / 0.032828 del NEDC)', r.f1 === 0.147 && r.f2 === 0.03331, r.f1 + ' ' + r.f2);
    ok('TM = 1506 (WLTP), NO 1440 (NEDC)', r.tm === 1506, r.tm);
    ok('MR = 43.2 → inercia 1549.2 kg', r.mr === 43.2 && ctx.homoWltpInertia(r).inertia === 1549.2);
    ok('CO₂ combinado 129 (no el "Weighted Combined" vacío) y consumo 5.7', r.co2Combined === 129 && r.fcCombined === 5.7);
    ok('el VIN sale del nombre del archivo: …432873', ctx.homoIcmsVinTail(FILE) === '432873' &&
        ctx.homoIcmsVinTail('153fb3fe-' + FILE) === '432873' && ctx.homoIcmsVinTail('reporte.xlsx') === '');
    ok('cruce de VIN: coincide / no coincide / sin dato',
        ctx.homoVinMatchesTail('3KPFT51B7TE432873', '432873') === true &&
        ctx.homoVinMatchesTail('3KPFT51B7TE433258', '432873') === false &&
        ctx.homoVinMatchesTail('', '432873') === null && ctx.homoVinMatchesTail('3KPF', '') === null);

    console.log('\n== [2.29.0] El catálogo se identifica por Work Order ==');
    // Del registro real del laboratorio: el mismo MC code con tres WO y valores distintos.
    const head = ['Work Order No.', 'MC code', 'WLTP Driving Resistance f0', 'WLTP Driving Resistance TM', 'MR', 'WLTP CO2(Combined)'];
    const rowsMc = [
        ['E2608A135C02A', '8GS6K5G17', '102.5', '1506', '43.2', '129'],
        ['E2608E004C17A', '8GS6K5G17', '113.7', '1539', '43.95', '131'],
        ['E2606A130C02A', '8GS6K5G17', '113.9', '1543', '43.95', '132']
    ];
    ctx.homoState.catalog = [];
    const res = ctx.homoImportApply([head].concat(rowsMc));
    ok('tres WO con el mismo MC code son TRES filas (antes se colapsaban en una)', res.nuevas === 3 && ctx.homoState.catalog.length === 3, JSON.stringify(res));
    ok('buscar por WO da la fila correcta', ctx.homoFindByKey('E2608E004C17A').co2Combined === 131);
    ok('buscar por un MC code de varias WO NO adivina (null)', ctx.homoFindByKey('8GS6K5G17') === null);
    const res2 = ctx.homoImportApply([head, ['E2608E004C17A', '8GS6K5G17', '', '', '', '131.5']]);
    ok('reimportar una WO la actualiza (solo lo que trae valor)', res2.actualizadas === 1 && ctx.homoState.catalog.length === 3 &&
        ctx.homoFindByKey('E2608E004C17A').co2Combined === 131.5 && ctx.homoFindByKey('E2608E004C17A').f0 === 113.7);

    console.log('\n== [2.29.0] Ficha: qué cambiaría ==');
    const f = ctx.homoFichaFromIcms(r, { fileName: FILE });
    ok('la ficha guarda WO, archivo y el CO₂ como co2Target', f.workOrder === 'E2608A135C02A' && f.icmsFile === FILE && f.co2Target === 129 && f.source === 'icms');
    const d1 = ctx.homoFichaDiff({ f0: '102.5', tm: 1506, co2Target: 129 }, f);
    ok('mismo número escrito distinto no es diferencia; lo vacío se llena', d1.diffs.length === 0 && d1.blanks.indexOf('mr') >= 0 && d1.blanks.indexOf('workOrder') >= 0, JSON.stringify(d1));
    const d2 = ctx.homoFichaDiff({ f0: 113.7, co2Target: 131 }, f);
    ok('valores distintos se listan con antes → después', d2.diffs.length === 2 && d2.diffs[0].antes === 113.7 && d2.diffs[0].despues === 102.5, JSON.stringify(d2.diffs));
    ok('lo que el archivo trae vacío no borra nada', ctx.homoFichaDiff({ fcCombined: 6 }, Object.assign({}, f, { fcCombined: null })).diffs.length === 0);

    console.log('\n== [2.29.0] Carga en lote ==');
    const EU = { REGION: 'EUROPE' };
    const veh = (id, vin, status, homolog, cfg) => ({ id, vin, status, homolog, config: cfg || EU, timeline: [] });
    ctx.db.vehicles = [
        veh(1, '3KPFT51B7TE432873', 'registered', null),                                   // llenar
        veh(2, '3KPFT51B7TE111111', 'archived', { f0: 102.5, tm: 1506, co2Target: 129 }),  // completar (aunque esté liberado)
        veh(3, '3KPFT51B7TE222222', 'archived', { f0: 113.7, co2Target: 131 }),            // bloqueado
        veh(4, '3KPFT51B7TE333333', 'in-progress', { f0: 113.7, co2Target: 131 }),         // corregir
        veh(5, '3KPFT51B7TE444444', 'registered', null, { REGION: 'MIDDLE EAST' }),        // no-europa
        veh(6, 'AAAAAAAAAAA555555', 'registered', null), veh(7, 'BBBBBBBBBBB555555', 'registered', null) // ambigua
    ];
    const items = [
        { fileName: FILE, tail: '432873', row: r },
        { fileName: 'VIN_111111.xlsx', tail: '111111', row: r },
        { fileName: 'VIN_222222.xlsx', tail: '222222', row: r },
        { fileName: 'VIN_333333.xlsx', tail: '333333', row: r },
        { fileName: 'VIN_444444.xlsx', tail: '444444', row: r },
        { fileName: 'VIN_555555.xlsx', tail: '555555', row: r },
        { fileName: 'VIN_999999.xlsx', tail: '999999', row: r },
        { fileName: 'icms.xlsx', tail: '', row: r }
    ];
    const plan = ctx.homoIcmsBatchPlan(items, ctx.db.vehicles);
    const acts = plan.map(e => e.action).join(',');
    ok('acciones: llenar, completar, bloqueado, corregir, no-europa, ambigua, sin-vehiculo, sin-vin',
        acts === 'llenar,completar,bloqueado,corregir,no-europa,ambigua,sin-vehiculo,sin-vin', acts);
    ok('el liberado solo se completa en lo vacío (MR, WO…), sin tocar f0', plan[1].blanks.indexOf('mr') >= 0 && plan[1].diffs.length === 0);
    const html = ctx.homoIcmsBatchHTML(plan, [{ fileName: 'roto.xlsx', error: 'No se pudo leer' }]);
    ok('la revisión marca por omisión llenar/completar y NO "valores distintos"',
        (html.match(/ checked/g) || []).length === 2 && /data-homo-batch="3"(?! checked)/.test(html) && /roto\.xlsx/.test(html));

    audits.length = 0;
    const out = ctx.homoIcmsBatchApply(items, [
        { i: 0, action: 'llenar' }, { i: 1, action: 'completar' }, { i: 2, action: 'bloqueado' },
        { i: 3, action: 'llenar' } // la persona vio otra acción: se salta
    ]);
    const v1 = ctx.db.vehicles[0], v2 = ctx.db.vehicles[1], v3 = ctx.db.vehicles[2], v4 = ctx.db.vehicles[3];
    ok('aplica 2 y salta lo bloqueado y lo que cambió de acción', out.aplicados === 2 && out.saltados.length === 2, JSON.stringify(out));
    ok('llenar: la ficha queda completa desde el archivo', v1.homolog.f0 === 102.5 && v1.homolog.tm === 1506 && v1.homolog.mr === 43.2 &&
        v1.homolog.co2Target === 129 && v1.homolog.workOrder === 'E2608A135C02A' && v1.homolog.source === 'icms');
    ok('completar: llena MR y WO del liberado sin cambiar su f0', v2.homolog.mr === 43.2 && v2.homolog.f0 === 102.5 && v2.homolog.workOrder === 'E2608A135C02A');
    ok('bloqueado y corregir-no-visto: intactos', v3.homolog.f0 === 113.7 && v4.homolog.f0 === 113.7);
    ok('cada cambio va a la línea de tiempo (campo, antes, después, razón) y al historial',
        v1.timeline.length === 1 && v1.timeline[0].data.modified.some(m => m.campo === 'f0' && m.despues === 102.5 && /ICMS/.test(m.razon)) &&
        audits.filter(a => a.a === 'homologacion_icms').length === 2 && audits[0].o && audits[0].o.after.f0 === 102.5);
    ok('todos los registros quedan en el catálogo', ctx.homoFindByKey('E2608A135C02A') !== null);

    const out2 = ctx.homoIcmsBatchApply(items, [{ i: 3, action: 'corregir' }]);
    ok('corregir solo con la acción que la persona vio', out2.aplicados === 1 && v4.homolog.f0 === 102.5 && v4.homolog.co2Target === 129);

    saveOk = false;
    ctx.db.vehicles.push(veh(8, '3KPFT51B7TE777777', 'registered', null));
    const out3 = ctx.homoIcmsBatchApply([{ fileName: 'VIN_777777.xlsx', tail: '777777', row: r }], [0]);
    const v8 = ctx.db.vehicles[7];
    ok('si no se puede guardar, no queda nada a medias', out3.error && v8.homolog === null && v8.timeline.length === 0, JSON.stringify(out3));
    saveOk = true;

    console.log('\n== [3.7.0] Re-test: la ficha del ICMS viaja con "Copiar config" ==');
    {
        const VIN = '3KPFU8118VE000122';
        const fichaVieja = { workOrder: 'WO-OLD', mcCode: 'MC1', f0: 90, f1: 0.1, f2: 0.03, tm: 1500, mr: 40, co2Target: 140, source: 'icms', icmsFile: 'VIN_000122_a.xlsx', vinCheck: 'coincide' };
        const fichaNueva = { workOrder: 'WO-NEW', mcCode: 'MC2', f0: 102.5, f1: 0.147, f2: 0.03544, tm: 1568, mr: 44.7, co2Target: 129, fcCombined: 5.6, source: 'icms', icmsFile: 'VIN_000122.xlsx', vinCheck: 'coincide' };
        const lista = [
            { id: 101, vin: VIN, status: 'archived', registeredAt: '2026-03-01T10:00:00Z', homolog: fichaVieja },
            { id: 102, vin: VIN, status: 'archived', registeredAt: '2026-06-01T10:00:00Z', homolog: fichaNueva },
            { id: 103, vin: VIN, status: 'archived', registeredAt: '2026-09-01T10:00:00Z', homolog: { source: 'alta' } },
            { id: 104, vin: VIN, status: 'registered', registeredAt: '2026-10-01T10:00:00Z', homolog: { f0: 1 } },
            { id: 105, vin: 'OTRO', status: 'archived', registeredAt: '2026-10-02T10:00:00Z', homolog: { f0: 7 } }
        ];
        const p = ctx.homoPreviousFichaForVin(lista, VIN);
        ok('toma la prueba archivada más reciente CON coeficientes (no la vacía, no la en curso, no otro VIN)', p && p.vehicle.id === 102, p && p.vehicle.id);
        ok('sin prueba anterior → null', ctx.homoPreviousFichaForVin(lista, 'NADA') === null && ctx.homoPreviousFichaForVin(lista, '') === null);

        const els = {};
        ['homo_mc', 'homo_f0', 'homo_f1', 'homo_f2', 'homo_tm', 'homo_mr', 'homo_co2', 'vin'].forEach(id => { els[id] = { value: '' }; });
        ['homo-alta-status', 'homo-alta-icms', 'homo-alta-results', 'homo-alta-warn'].forEach(id => { els[id] = { innerHTML: '' }; });
        const getEl = ctx.document.getElementById;
        ctx.document.getElementById = id => els[id] || null;
        ctx.db.vehicles = lista;
        ctx.currentFilters = { REGION: 'MEXICO' };
        ok('fuera de Europa no llena nada', ctx.homoAltaFromPrevious(VIN) === false && els.homo_f0.value === '');
        ctx.currentFilters = { REGION: 'EUROPE' };
        ok('en Europa llena los campos con la ficha anterior', ctx.homoAltaFromPrevious(VIN) === true &&
            els.homo_mc.value === 'WO-NEW' && els.homo_f0.value === 102.5 && els.homo_mr.value === 44.7 && els.homo_co2.value === 129 &&
            /prueba anterior/.test(els['homo-alta-status'].innerHTML));
        let d = ctx.homoAltaCollect();
        ok('la ficha registra de dónde salió (re-test, vehículo, WO, archivo)', d.source === 'retest' && d.fromVehicleId === 102 &&
            d.workOrder === 'WO-NEW' && d.icmsFile === 'VIN_000122.xlsx' && d.fcCombined === 5.6 && d.edited.length === 0, JSON.stringify(d));
        els.homo_f0.value = '103';
        d = ctx.homoAltaCollect();
        ok('editar a mano queda anotado', d.source === 'retest' && d.f0 === 103 && d.edited.join() === 'f0');
        ctx.homoAltaReset();
        d = ctx.homoAltaCollect();
        ok('limpiar el Alta olvida el re-test', d.source === 'alta' && d.f0 === null);

        console.log('\n== [3.7.1] El ICMS del re-test se llena solo con el VIN ==');
        ctx.document.getElementById = id => els[id] || null;
        els.vin.value = VIN.slice(0, 10);
        ok('VIN incompleto: no llena', ctx.homoAltaAutoPrev() === false && els.homo_f0.value === '');
        els.vin.value = VIN;
        ok('VIN completo con prueba anterior: llena solo', ctx.homoAltaAutoPrev() === true && els.homo_f0.value === 102.5 && ctx.homoAltaPrevActive());
        ok('no se vuelve a llenar encima', ctx.homoAltaAutoPrev() === false);
        els.vin.value = 'OTRO';
        ctx.homoAltaAutoPrev();
        ok('si el VIN cambia, retira la ficha del VIN anterior', els.homo_f0.value === '' && els.homo_mc.value === '' && !ctx.homoAltaPrevActive());
        els.vin.value = VIN; ctx.homoAltaAutoPrev();
        ctx.homoAltaPrevRemove();
        ok('Quitar vacía los campos', els.homo_f0.value === '' && !ctx.homoAltaPrevActive());
        ok('y no la vuelve a poner para ese VIN', ctx.homoAltaAutoPrev() === false && els.homo_f0.value === '');
        ctx.homoAltaReset();
        els.homo_f0.value = '99';
        ok('nunca pisa lo que ya se tecleó', ctx.homoAltaAutoPrev() === false && els.homo_f0.value === '99');
        ctx.homoAltaReset();
        ctx.currentFilters = { REGION: 'MEXICO' };
        ok('fuera de Europa no llena solo', ctx.homoAltaAutoPrev() === false && els.homo_f0.value === '');
        ctx.currentFilters = { REGION: 'EUROPE' };
        ctx.document.getElementById = getEl;
        ctx.document.getElementById = getEl;
    }

    console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
    process.exit(fallaron ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
