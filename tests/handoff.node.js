// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Avisos de relevo (2.15.0) — funciones puras + entrega sin DOM       ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

function contexto(extra) {
    const store = {};
    const ctx = Object.assign({ console, JSON, Object, Array, String, Number, Math, Date, Promise,
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        setTimeout: () => 0, clearTimeout: () => {} }, extra || {});
    ctx.store = store;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'handoff.js'), 'utf8'), ctx, { filename: 'handoff.js' });
    return ctx;
}

const C = contexto();
const veh = (id, status, extra) => Object.assign({ id, vin: 'KNA0000000000' + id, status, testData: {} }, extra || {});
const liberado = (id, quien, extra) => veh(id, 'pending-approval', Object.assign({ testData: {
    signatures: { releaser: { signerName: 'firma a mano', sessionUserName: quien, signedAt: '2026-09-29T10:00:00Z' } },
    gasResults: { liberador: { capturedBy: quien, capturedAt: '2026-09-29T10:00:00Z' } } } }, extra || {}));
const ana = { name: 'Ana Signataria', canApprove: true, mode: 'todos' };
const beto = { name: 'Beto Técnico', canApprove: false, mode: 'todos' };
const kinds = evs => evs.map(e => e.kind).join(',');

console.log('\n== Llegó a aprobación ==');
{
    const prev = C.handoffSnapshot([veh(1, 'ready-release')]);
    const next = C.handoffSnapshot([liberado(1, 'Beto Técnico')]);
    const a = C.handoffEventsFor(prev, next, ana);
    ok('quien puede aprobar recibe "espera tu aprobación"', kinds(a) === 'aprobar' && /espera tu aprobación/.test(a[0].text) && /Beto/.test(a[0].detail), JSON.stringify(a));
    ok('quien no puede aprobar no recibe nada', C.handoffEventsFor(prev, next, beto).length === 0);
    const self = C.handoffEventsFor(prev, C.handoffSnapshot([liberado(1, 'Ana Signataria')]), ana);
    ok('no se avisa a sí mismo (lo liberó quien podría aprobar)', self.length === 0);
    ok('el nombre se compara sin acentos ni mayúsculas', C.handoffEventsFor(prev, C.handoffSnapshot([liberado(1, 'ana signatária ')]), ana).length === 0);
    ok('"Solo los míos" no avisa lo que espera aprobación de otros', C.handoffEventsFor(prev, next, Object.assign({}, ana, { mode: 'mios' })).length === 0);
    ok('"Ninguno" no avisa nada', C.handoffEventsFor(prev, next, Object.assign({}, ana, { mode: 'ninguno' })).length === 0);
    const nuevo = C.handoffEventsFor({}, next, ana);
    ok('un vehículo que llega de otro equipo ya en aprobación también avisa', kinds(nuevo) === 'aprobar');
    ok('sin cambio de etapa no hay aviso', C.handoffEventsFor(next, next, ana).length === 0);
    ok('el id es estable (mismo cambio → mismo id)', a[0].id === C.handoffEventsFor(prev, next, ana)[0].id);
    ok('la firma a mano no manda: se usa la identidad de la sesión', C.handoffVehSig(liberado(1, 'Beto Técnico')).releaser === 'Beto Técnico');
}

console.log('\n== Devuelto al liberador ==');
{
    const prev = C.handoffSnapshot([liberado(2, 'Beto Técnico')]);
    const dev = veh(2, 'ready-release', { pendingReturn: { at: '2026-09-29T11:00:00Z', by: 'Ana Signataria', reason: 'Falta la foto del odómetro' } });
    const next = C.handoffSnapshot([dev]);
    const b = C.handoffEventsFor(prev, next, beto);
    ok('quien lo liberó recibe "Te devolvieron…" con el motivo', kinds(b) === 'devuelto' && /Te devolvieron/.test(b[0].text) && /odómetro/.test(b[0].text), JSON.stringify(b));
    ok('"Solo los míos" sí lo avisa (es suyo)', C.handoffEventsFor(prev, next, Object.assign({}, beto, { mode: 'mios' })).length === 1);
    ok('quien lo devolvió no recibe su propio aviso', C.handoffEventsFor(prev, next, ana).filter(e => e.kind === 'devuelto').length === 0);
    const otro = { name: 'Carla Técnico', canApprove: false, mode: 'todos' };
    ok('otro técnico que no lo liberó no recibe nada', C.handoffEventsFor(prev, next, otro).length === 0);
    ok('sin la foto anterior no se adivina quién lo liberó', C.handoffEventsFor({}, next, beto).length === 0);
}

console.log('\n== Aprobado ==');
{
    const prev = C.handoffSnapshot([liberado(3, 'Beto Técnico')]);
    const arch = liberado(3, 'Beto Técnico', { status: 'archived', archivedAt: '2026-09-29T12:00:00Z' });
    arch.testData.signatures.approver = { signerName: 'x', sessionUserName: 'Ana Signataria' };
    const next = C.handoffSnapshot([arch]);
    const b = C.handoffEventsFor(prev, next, beto);
    ok('quien lo liberó recibe "quedó aprobado" con quién lo aprobó', kinds(b) === 'aprobado' && /Ana/.test(b[0].detail), JSON.stringify(b));
    ok('el aprobador no recibe su propio aviso', C.handoffEventsFor(prev, next, ana).length === 0);
}

console.log('\n== Entrega: una sola vez por aviso, y "Ninguno" apaga ==');
{
    const toasts = [];
    const D = contexto({ window: {}, showToast: (m) => toasts.push(m), updateNotifBadge() {},
        uiPref: k => (k === 'handoff' ? D.__mode : undefined),
        authState: { currentUser: { name: 'Ana Signataria', role: 'Signatario' } },
        authRoleHas: (r, p) => r === 'Signatario' && p === 'test.approve',
        db: { vehicles: [veh(9, 'ready-release')] } });
    D.__mode = 'todos';
    D.handoffCheck();   // toma la base
    D.db.vehicles = [liberado(9, 'Beto Técnico')];
    let nuevos = D.handoffCheck();
    ok('un cambio → un aviso, en la bitácora y como toast', nuevos.length === 1 && D.handoffLogItems().length === 1 && toasts.length === 1);
    D.db.vehicles = [veh(9, 'ready-release')]; D.handoffCheck();
    D.db.vehicles = [liberado(9, 'Beto Técnico')];
    nuevos = D.handoffCheck();
    ok('el mismo aviso (mismo id) no se repite aunque la etapa vaya y vuelva', nuevos.length === 0 && D.handoffLogItems().length === 1);
    ok('marcar como leído', D.handoffMarkRead(D.handoffLogItems()[0].id) && D.handoffLogItems()[0].read === true);
    D.handoffDismiss(D.handoffLogItems()[0].id);
    ok('quitar un aviso', D.handoffLogItems().length === 0);
    D.__mode = 'ninguno';
    D.db.vehicles = [liberado(10, 'Beto Técnico', { testData: { signatures: { releaser: { sessionUserName: 'Beto Técnico', signedAt: 'otra' } } } })];
    ok('con "Ninguno" no llega nada', D.handoffCheck().length === 0);
    ok('el soak de este equipo entra siempre al canal', D.handoffSoakDone('veh_1', 'KNA123456789') === true && D.handoffLogItems()[0].kind === 'soak');
    ok('sin sesión no se avisa (no hay a quién)', (() => { D.authState.currentUser = null; D.__mode = 'todos'; D.db.vehicles = [liberado(11, 'X')]; return D.handoffCheck().length === 0; })());
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
process.exitCode = fallaron ? 1 : 0;
