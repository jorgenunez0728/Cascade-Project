// Pruebas de 3.22.0 — Comparar pruebas (js/compare.js). compareModel es PURA: se corre el
// archivo entero en un `vm` con dependencias falsas (las reales están en compareDeps).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle !== undefined ? ' — ' + JSON.stringify(detalle) : '')); }
}

const ctx = { console, Math, JSON, Object, Array, String, Number, isFinite };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'compare.js'), 'utf8'), ctx);

const EURO5 = { name: 'EURO-5', gases: [
    { field: 'CO', label: 'CO', unit: 'g/km', limit: 1.0 },
    { field: 'NOx', label: 'NOx', unit: 'g/km', limit: 0.06 },
    { field: 'THC', label: 'THC', unit: 'g/km', limit: 0.1 },
    { field: 'CO2', label: 'CO2', unit: 'g/km', limit: null }] };
const SULEV = { name: 'SULEV 30', gases: [
    { field: 'CO', label: 'CO', unit: 'g/mi', limit: 1.0 },
    { field: 'NMOGNOx', label: 'NMOG+NOx', unit: 'g/mi', limit: 0.03 }] };

function veh(id, vin, vals, o) {
    o = o || {};
    return { id, vin, status: o.status || 'archived', config: { 'EMISSION REGULATION': o.reg || 'EURO-5' },
        testData: Object.assign({ etw: 1612.7, targetA: 120, dynoA: 80, targetB: 0.5, dynoB: 0.2 }, o.td || {},
            { gasResults: { aprobador: { values: vals } }, signatures: { releaser: { signerName: 'Beto' }, approver: { signerName: 'Ana' } } }),
        _date: o.date || '2026-10-01', _fam: o.fam || 'K3|2.0|IVT|2027|EURO-5|||4DR', _prof: o.prof || EURO5, _counts: o.counts !== false,
        _co2t: o.co2t != null ? o.co2t : 140 };
}
const deps = {
    valuesOf: v => v.testData.gasResults.aprobador.values,
    approvedOf: v => v.status === 'archived',
    profileOf: v => v._prof,
    regOf: v => v._prof.name,
    countsOf: v => v._counts && v.status === 'archived',
    whyNotOf: v => v._counts ? 'su prueba aún no está aprobada' : 'IWR fuera de rango',
    co2Of: v => ({ measured: v.testData.gasResults.aprobador.values.CO2, target: v._co2t }),
    testDateOf: v => v._date,
    familyOf: v => v._fam,
    signerOf: (v, w) => v.testData.signatures[w].signerName
};

console.log('\n== compareModel ==');
{
    const a = veh('a', 'KNA00000000000001', { CO: 0.2, NOx: 0.03, THC: 0.05, CO2: 140 }, { date: '2026-09-01' });
    const b = veh('b', 'KNA00000000000001', { CO: 0.21, NOx: 0.045, THC: 0.05, CO2: 147 }, { date: '2026-10-01', td: { dynoA: 90 } });
    const m = ctx.compareModel([a, b], deps);
    const nox = m.gas.find(r => r.field === 'NOx');
    ok('una columna por prueba, con VIN corto y fecha', m.cols.length === 2 && m.cols[0].vinShort === '00000001' && m.cols[1].date === '2026-10-01');
    ok('% del límite con el perfil de cada prueba', Math.abs(nox.cells[0].pct - 50) < 1e-9 && Math.abs(nox.cells[1].pct - 75) < 1e-9);
    ok('NOx difiere 25 puntos del límite → se resalta', nox.differs === true && Math.round(nox.spreadPts) === 25);
    const co = m.gas.find(r => r.field === 'CO');
    ok('CO difiere 1 punto → no se resalta ni marca máximo/mínimo', co.differs === false && !co.cells.some(c => c.isMax || c.isMin));
    ok('máximo y mínimo marcados por fila', nox.cells[1].isMax && nox.cells[0].isMin);
    const co2row = m.gas.find(r => r.field === 'CO2');
    ok('un gas sin límite no tiene % ni veredicto', co2row.cells[0].pct === null && co2row.cells[0].verdict === null);
    ok('CO₂ (sin límite) 140 vs 147 se resalta en relativo', co2row.differs === true);
    ok('CO₂ contra su declarado', m.co2[1].measured === 147 && Math.abs(m.co2[1].dev - 5) < 1e-9);
    const dA = m.dyno.find(r => r.key === 'dynoA');
    ok('dinamómetro: Dyno A 80 vs 90 se resalta; ETW igual no', dA.differs === true && m.dyno.find(r => r.key === 'etw').differs === false);
    ok('dinamómetro omite lo que nadie capturó (C)', !m.dyno.some(r => r.key === 'targetC'));
    ok('quién liberó y quién aprobó', m.cols[0].releaser === 'Beto' && m.cols[0].approver === 'Ana');
    ok('sin notas cuando es la misma familia y norma, todo aprobado', m.notes.length === 0, m.notes);
}
{
    const a = veh('a', 'V1', { CO: 1.2, NOx: 0.03 }, {});
    const b = veh('b', 'V2', { CO: 0.5, NMOGNOx: 0.02 }, { prof: SULEV, reg: 'SULEV 30', fam: 'OTRA|||||||' });
    const m = ctx.compareModel([a, b], deps);
    const coRows = m.gas.filter(r => r.field === 'CO');
    ok('el mismo gas en g/km y g/mi son DOS filas', coRows.length === 2 && coRows.map(r => r.unit).sort().join() === 'g/km,g/mi');
    ok('un valor sobre el límite sale como falla', coRows.find(r => r.unit === 'g/km').cells[0].verdict === 'falla');
    ok('avisa familias distintas y normas distintas', m.notes.some(n => /familias distintas/.test(n)) && m.notes.some(n => /normas distintas/.test(n)), m.notes);
}
{
    const a = veh('a', 'V1', { CO: 0.2 }, {});
    const b = veh('b', 'V1', { CO: 0.3 }, { status: 'pending-approval' });
    const c = veh('c', 'V3', { CO: 0.3 }, { counts: false });
    const m = ctx.compareModel([a, b, c], deps);
    const sinDecl = ctx.compareModel([a, b], Object.assign({}, deps, { co2Of: v => ({ measured: 140, target: null }) }));
    ok('sin ningún CO₂ declarado no hay sección de desviación', sinDecl.co2 === null);
    ok('una prueba sin aprobar se marca y se avisa', m.cols[1].approved === false && m.notes.some(n => /sin aprobar/.test(n)));
    ok('una prueba aprobada que no cuenta para CoP dice por qué', m.cols[2].counts === false && /IWR/.test(m.cols[2].whyNot));
    const rows = ctx.compareRows(m);
    ok('las filas planas (Excel/PDF) traen encabezado con "(sin aprobar)"', rows[0].length === 4 && /sin aprobar/.test(rows[0][2]));
    ok('y el % del límite de cada gas', rows.some(r => r[0] === '  % del límite' && r[1] === 20));
    const html = ctx.compareHTML(m);
    ok('el HTML pinta las tres columnas y la nota', (html.match(/class="cmp-vin"/g) || []).length === 3 && /sin aprobar/.test(html));
}
{
    const m = ctx.compareModel([1, 2, 3, 4, 5, 6, 7, 8].map(i => veh('v' + i, 'V' + i, { CO: 0.1 * i }, {})), deps);
    ok('a lo más ' + ctx.COMPARE_MAX + ' columnas', m.cols.length === ctx.COMPARE_MAX);
}

console.log('\n== compareCandidatesFor ==');
{
    const v = veh('v', 'KNA1', { CO: 0.2 }, { date: '2026-10-05' });
    const re = veh('re', 'KNA1', { CO: 0.3 }, { date: '2026-09-01' });
    const f1 = veh('f1', 'KNA2', { CO: 0.3 }, { date: '2026-08-01' });
    const f2 = veh('f2', 'KNA3', { CO: 0.3 }, { date: '2026-10-02' });
    const otra = veh('o', 'KNA4', { CO: 0.3 }, { fam: 'OTRA' });
    const vacia = veh('x', 'KNA5', {}, {});
    const c = ctx.compareCandidatesFor(v, [v, re, f1, f2, otra, vacia], deps);
    ok('re-test del mismo VIN', c.sameVin.length === 1 && c.sameVin[0].id === 're');
    ok('misma familia, más reciente primero, sin el re-test ni otras familias ni pruebas sin valores',
        c.sameFamily.map(x => x.id).join() === 'f2,f1', c.sameFamily.map(x => x.id));
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exitCode = fallaron ? 1 : 0;
