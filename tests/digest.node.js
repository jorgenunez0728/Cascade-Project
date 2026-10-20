// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.37.0] Avisos del laboratorio — js/digest.js (PURO) cargado con el ║
// ║  mismo entorno que usa el proceso de GitHub Actions.                  ║
// ╚══════════════════════════════════════════════════════════════════════╝
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadDigestEnv } = require('../tools/digest-env');

const P = loadDigestEnv();
let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

// Jueves 8 oct 2026, 7:30 en México (13:30 UTC).
const NOW = '2026-10-08T13:30:00.000Z';
const daysAgo = (d, h) => new Date(Date.parse(NOW) - (d * 24 + (h || 0)) * 3600e3).toISOString();
const cfg = (m, r) => ({ 'Modelo': m, 'EMISSION REGULATION': r });
const vehicles = [
    // 11 días, por aprobar desde hace 4 → escalado
    { id: 'a', vin: 'KNA0000000000A12345', status: 'pending-approval', registeredAt: daysAgo(11), config: cfg('Sportage HEV', 'EURO 6E'),
      timeline: [{ timestamp: daysAgo(9), data: { status: 'in-progress' } }, { timestamp: daysAgo(4), data: { status: 'pending-approval' } }] },
    // exactamente 7 días → NO escalado (más de 7)
    { id: 'b', vin: 'KNA00000000000B7777', status: 'in-progress', registeredAt: daysAgo(7, 2), config: cfg('K3 GT', 'SULEV 30'),
      timeline: [{ timestamp: daysAgo(6), data: { status: 'in-progress' } }] },
    // 8 días → escalado; regulación elegida al liberar
    { id: 'c', vin: 'KNA00000000000C8888', status: 'ready-release', registeredAt: daysAgo(8), config: cfg('Seltos', 'EURO 5'),
      regulationOverride: { name: 'EURO 6E' }, timeline: [] },
    { id: 'd', vin: 'KNA00000000000D1111', status: 'registered', registeredAt: daysAgo(0, 3), config: cfg('Sonet', 'EURO 5'), timeline: [] },
    // aprobado ayer → aparece en "aprobados"
    { id: 'e', vin: 'KNA00000000000E2222', status: 'archived', registeredAt: daysAgo(6), config: cfg('Sportage', 'EURO 6E'),
      testData: { testDatetime: '2026-10-05T09:00', signatures: { releaser: { signerName: 'J. Pérez', sessionUserName: 'Jorge Pérez' },
                                                                  approver: { signerName: 'M. López' } } },
      timeline: [{ timestamp: daysAgo(0, 20), data: { status: 'archived' } }] },
    // aprobado hace 10 días → no
    { id: 'f', vin: 'KNA00000000000F3333', status: 'archived', registeredAt: daysAgo(20), config: cfg('Rio', 'EURO 5'),
      archivedAt: daysAgo(10), timeline: [] },
    // histórico pendiente → no cuenta como activo
    { id: 'g', vin: 'KNA00000000000G4444', status: 'historico', registeredAt: daysAgo(30), config: cfg('Rio', 'EURO 5'), timeline: [] }
];

console.log('\n== digestVehicles ==');
const v = P.digestVehicles(vehicles, NOW, { escalateDays: 7, statusLabels: P.CONFIG.statusLabels });
ok('activos excluye archivados e históricos', v.count === 4, v.count);
ok('ordenados del más viejo al más nuevo', v.rows.map(r => r.id).join('') === 'acbd', v.rows.map(r => r.id).join(''));
ok('días activo', v.rows[0].daysActive === 11 && v.rows[3].daysActive === 0);
ok('días en la etapa actual (desde la última racha)', v.rows[0].daysInStage === 4, v.rows[0].daysInStage);
ok('sin línea de tiempo: la etapa cuenta desde el alta', v.rows.find(r => r.id === 'c').daysInStage === 8);
ok('escalado = MÁS de 7 días (7 no, 8 sí)', v.escalated.map(r => r.id).join('') === 'ac', v.escalated.map(r => r.id).join(''));
ok('VIN corto, nunca completo', v.rows[0].vin === '…A12345');
ok('regulación elegida al liberar manda', v.rows.find(r => r.id === 'c').reg === 'EURO 6E');
ok('por etapa en orden del flujo', v.byStage.map(s => s.status).join(',') === 'registered,in-progress,ready-release,pending-approval');
ok('promedio y máximo', v.avgDays === 6.5 && v.maxDays === 11, v.avgDays + '/' + v.maxDays);
const apr = Object.assign({}, vehicles[0], { status: 'archived', timeline: vehicles[0].timeline.concat([{ timestamp: daysAgo(0, 1), data: { status: 'archived' } }]) });
ok('al aprobarse deja de estar escalado', !P.digestVehicles([apr], NOW, { escalateDays: 7 }).escalated.length);

console.log('\n== digestCloudVehicles (como los ve la app) ==');
const dupA = { id: 'x1', vin: 'KNADUP0000000001', status: 'in-progress', registeredAt: daysAgo(3), updatedAt: daysAgo(2), config: cfg('K3', 'SULEV 30'), timeline: [] };
const dupB = Object.assign({}, dupA, { id: 'x2', status: 'ready-release', updatedAt: daysAgo(1) });
const borrado = { id: 'x3', vin: 'KNABORRADO000003', status: 'registered', registeredAt: daysAgo(5), config: cfg('Rio', 'EURO 5'), timeline: [] };
const cv = P.digestCloudVehicles([dupA, dupB, borrado, vehicles[0]], [{ id: 'x3', vin: 'KNABORRADO000003', registeredAt: borrado.registeredAt }]);
ok('un VIN con dos documentos cuenta UNA vez', cv.vehicles.filter(v => v.vin === dupA.vin).length === 1 && cv.merged === 1);
ok('gana la edición más reciente (la regla de la app)', cv.vehicles.find(v => v.vin === dupA.vin).status === 'ready-release');
ok('un vehículo con marca de borrado no cuenta', !cv.vehicles.some(v => v.vin === borrado.vin) && cv.removed === 1);
ok('lo demás pasa igual', cv.vehicles.length === 2);

console.log('\n== digestApprovedSince ==');
const a = P.digestApprovedSince(vehicles, daysAgo(1), NOW);
ok('solo lo aprobado después del último resumen', a.length === 1 && a[0].id === 'e', JSON.stringify(a.map(x => x.id)));
ok('quién liberó (sesión) y quién aprobó', a[0].releaser === 'Jorge Pérez' && a[0].approver === 'M. López');
ok('fecha de prueba y días de alta a aprobado', a[0].testDate === '2026-10-05' && a[0].days === 5, a[0].testDate + ' ' + a[0].days);
ok('cae a archivedAt sin línea de tiempo', P.digestApprovedSince(vehicles, daysAgo(11), NOW).some(x => x.id === 'f'));

console.log('\n== fechas locales (UTC−6) ==');
const lp = P.digestLocalParts('2026-10-08T05:30:00Z');
ok('5:30 UTC del jueves es miércoles 23:30 en México', lp.date === '2026-10-07' && lp.dow === 3 && lp.hhmm === '23:30');
ok('lunes de la semana', P.digestMondayOf('2026-10-11') === '2026-10-05' && P.digestMondayOf('2026-10-05') === '2026-10-05');
ok('etiqueta de semana', P.digestWeekLabel('2026-10-12') === '12–16 oct' && P.digestWeekLabel('2026-09-28') === '28 sep – 2 oct',
   P.digestWeekLabel('2026-09-28'));

console.log('\n== plan de la semana siguiente ==');
const tp = () => JSON.parse(JSON.stringify({ weeklyPlans: [], testedList: [], planData: [] }));
const item = (mod, reg, day, extra) => Object.assign({ uid: mod + day, desc: mod + '-' + reg, mod, reg, rgn: 'EUROPE', testDay: day }, extra || {});
let s = tp();
P.__tpSet(s);
let np = P.digestNextWeekPlan(P.tpWeekPlanFor, NOW);
ok('jueves sin plan: se muestra y dice sin-plan', np.show && np.day === 'jue' && np.state === 'sin-plan' && np.weekDate === '2026-10-12');
s = tp();
s.weeklyPlans.push({ planId: 'W1', weekDate: '2026-10-12', created: daysAgo(1), accepted: false, items: [item('K3', 'SULEV 30', 'lun')] });
P.__tpSet(s);
np = P.digestNextWeekPlan(P.tpWeekPlanFor, NOW);
ok('con propuesta sin aceptar: propuesta (cuenta como falta)', np.state === 'propuesta' && np.count === 1);
s.weeklyPlans[0].accepted = true; s.weeklyPlans[0].acceptedDate = daysAgo(0, 1); s.weeklyPlans[0].acceptedBy = 'M. López';
P.__tpSet(s);
np = P.digestNextWeekPlan(P.tpWeekPlanFor, '2026-10-09T13:30:00Z');
ok('viernes con plan aceptado: listo y quién', np.show && np.day === 'vie' && np.state === 'aceptado' && np.acceptedBy === 'M. López');
ok('lunes a miércoles no se muestra', !P.digestNextWeekPlan(P.tpWeekPlanFor, '2026-10-06T13:30:00Z').show);

console.log('\n== planes a avisar ==');
s = tp();
s.weeklyPlans.push({ planId: 'W2', weekDate: '2026-10-12', accepted: true, acceptedDate: '2026-10-08T22:10:00Z', acceptedBy: 'Ana',
    items: [item('K3', 'SULEV 30', 'lun'), item('Sportage', 'EURO 6E', 'lun', { purpose: 'OBD II' }), item('Seltos', 'EURO 5', 'mar'), item('Rio', 'EURO 5', null)] });
s.weeklyPlans.push({ planId: 'W0', weekDate: '2026-09-28', accepted: true, acceptedDate: '2026-09-25T20:00:00Z', items: [] });
s.weeklyPlans.push({ planId: 'W3', weekDate: '2026-10-19', accepted: false, items: [] });
let pend = P.digestPlansToAnnounce(s.weeklyPlans, {}, NOW);
ok('solo aceptados de esta semana en adelante', pend.map(e => e.planId).join() === 'W2', pend.map(e => e.planId).join());
ok('ya avisado con la misma fecha: nada', !P.digestPlansToAnnounce(s.weeklyPlans, { W2: '2026-10-08T22:10:00Z' }, NOW).length);
pend = P.digestPlansToAnnounce(s.weeklyPlans, { W2: '2026-10-07T10:00:00Z' }, NOW);
ok('re-aceptado: sale como actualizado', pend.length === 1 && pend[0].updated);
const ann = P.digestPlanAnnouncement({ planId: 'W2', plan: s.weeklyPlans[0], updated: false });
ok('agrupado por día, sin día al final', ann.byDay.map(g => g.day).join() === 'lun,mar,_', ann.byDay.map(g => g.day).join());
ok('el chip de propósito solo si no es emisiones', ann.byDay[0].items[1].purpose === 'OBD II' && !ann.byDay[0].items[0].purpose);
ok('asunto del plan', P.digestPlanSubject(ann) === 'EmLab · Plan aceptado: semana 12–16 oct (4 pruebas)', P.digestPlanSubject(ann));
ok('hora de aceptación en México', ann.acceptedAtLabel === 'jue 8 oct 16:10', ann.acceptedAtLabel);
const planHtml = P.digestPlanEmailHTML(ann);
ok('correo del plan: días, quién y sin var(--', /Lun 12/.test(planHtml) && /Mar 13/.test(planHtml) && /Sin día/.test(planHtml) &&
   /Aceptado por Ana/.test(planHtml) && !/var\(--/.test(planHtml));

console.log('\n== resumen completo ==');
s = tp(); P.__tpSet(s);
const settings = { to: ['lab@kia.com'], escalateTo: ['jefe@kia.com'], escalateDays: 7 };
const d = P.digestCompute({ vehicles, planFor: P.tpWeekPlanFor, statusLabels: P.CONFIG.statusLabels, settings,
                            lastDigestAt: daysAgo(1), lastChangeAt: daysAgo(0, 12) }, NOW);
ok('jefe en copia con escalados', d.escalateTo.join() === 'jefe@kia.com');
const sin = P.digestCompute({ vehicles: vehicles.slice(1, 2), planFor: P.tpWeekPlanFor, settings }, '2026-10-06T13:30:00Z');
ok('sin escalados no va en copia', !sin.escalateTo.length);
const subj = P.digestSubject(d);
ok('asunto con activos, escalados y plan faltante', subj === 'EmLab · jue 8 oct · 4 activos · 2 escalados · falta plan 12–16 oct', subj);
ok('asunto al día', P.digestSubject(sin) === 'EmLab · mar 6 oct · 1 activo · al día', P.digestSubject(sin));
const push = P.digestPushText(d);
ok('push: título y una línea', push.title === 'EmLab · 4 activos · 2 escalados' && !/\n/.test(push.body) &&
   /1 por aprobar/.test(push.body) && /1 por liberar/.test(push.body), push.title + ' / ' + push.body);
const html = P.digestEmailHTML(d);
ok('HTML con estilos literales (sin var(--)', !/var\(--/.test(html));
ok('HTML sin VIN completo', !vehicles.some(x => html.includes(x.vin)));
ok('HTML con escalados, activos, aprobados y plan', /Escalados/.test(html) && /Activos: 4/.test(html) && /Aprobados desde el último resumen/.test(html) && /Falta aceptar el plan/.test(html));
ok('sin cambios recientes: no hay franja de atraso', !d.stale);
const viejo = P.digestCompute({ vehicles, planFor: P.tpWeekPlanFor, settings, lastChangeAt: daysAgo(2) }, NOW);
ok('jueves con 48 h sin cambios: avisa atraso', viejo.stale && /puede estar atrasado/.test(P.digestEmailHTML(viejo)));
const lunes = P.digestCompute({ vehicles, planFor: P.tpWeekPlanFor, settings, lastChangeAt: '2026-10-09T23:00:00Z' }, '2026-10-12T13:30:00Z');
ok('lunes tras el fin de semana: 62 h sin cambios es normal', !lunes.stale && lunes.sinceMonday);
ok('escapa el HTML', !/<script>/.test(P.digestEmailHTML(P.digestCompute({ vehicles: [{ id: 'x', vin: '1', status: 'registered', registeredAt: daysAgo(1), config: cfg('<script>', '') }], settings }, NOW))));

console.log('\n== ajustes ==');
ok('correos de texto libre', P.digestParseEmails('a@kia.com; B@KIA.com\n a@kia.com, x').join() === 'a@kia.com,b@kia.com');
ok('inválidos se reportan', P.digestInvalidEmails('a@kia.com x jefe@').join() === 'x,jefe@');
const n0 = P.digestSettingsNormalize({});
ok('defaults: 7 días, sin destinatarios', n0.escalateDays === 7 && !n0.to.length && !n0.escalateTo.length);
ok('días fuera de rango caen al default', P.digestSettingsNormalize({ escalateDays: 0 }).escalateDays === 7);
ok('tema ntfy sin caracteres raros', P.digestSettingsNormalize({ ntfyTopic: 'emlab kia/1' }).ntfyTopic === 'emlabkia1');

console.log('\n== proceso (DRY_RUN con datos de prueba) ==');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-'));
const fixture = path.join(dir, 'fx.json');
const plansTp = { weeklyPlans: [{ planId: 'W2', weekDate: '2026-10-12', accepted: true, acceptedDate: '2026-10-08T15:00:00Z', items: [item('K3', 'SULEV 30', 'lun')] }], testedList: [], planData: [] };
const run = (fx, extra) => {
    fs.writeFileSync(fixture, JSON.stringify(fx));
    return execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'daily-digest.node.js')],
        { env: Object.assign({}, process.env, { DRY_RUN: '1', DIGEST_FIXTURE: fixture, DIGEST_OUT: dir, DIGEST_NOW: NOW }, extra || {}), encoding: 'utf8' });
};
let out = run({ vehicles, tpState: plansTp, settings, state: { plansSeeded: '2026-10-01T00:00:00Z' } });
ok('envía el resumen a las 7:30 con el jefe en copia', /\[DRY\] resumen: «EmLab · jue 8 oct · 4 activos · 2 escalados/.test(out) && /CC jefe@kia\.com/.test(out), out);
ok('anuncia el plan aceptado', /\[DRY\] plan: «EmLab · Plan aceptado: semana 12–16 oct \(1 prueba\)»/.test(out), out);
ok('deja la vista previa', fs.existsSync(path.join(dir, 'digest-preview.html')));
out = run({ vehicles, tpState: plansTp, settings, state: {} });
ok('primera corrida: registra los planes sin avisar', /primera corrida/.test(out) && !/\[DRY\] plan:/.test(out), out);
out = run({ vehicles, tpState: plansTp, settings, state: { lastDigestDate: '2026-10-08', plansSeeded: 'x', notifiedPlans: { W2: '2026-10-08T15:00:00Z' } } });
ok('ya salió hoy: no repite', /no toca/.test(out) && !/\[DRY\]/.test(out), out);
out = run({ vehicles, tpState: plansTp, settings, state: { plansSeeded: 'x' } }, { DIGEST_NOW: '2026-10-08T12:30:00Z' });
ok('antes de las 7:00 no sale', /no toca/.test(out), out);
// [3.5.0] Turnos: inicio (7:00–16:59) y fin (17:00 en adelante), uno de cada uno por día.
out = run({ vehicles, tpState: plansTp, settings, state: { lastDigestDate: '2026-10-08', lastDigestSlot: 'inicio', plansSeeded: 'x', notifiedPlans: { W2: '2026-10-08T15:00:00Z' } } },
          { DIGEST_NOW: '2026-10-08T22:05:00Z' });
ok('fin de turno: sale el de cierre aunque ya salió el de inicio', /\[DRY\] resumen: «EmLab · jue 8 oct · cierre de turno/.test(out), out);
out = run({ vehicles, tpState: plansTp, settings, state: { lastDigestDate: '2026-10-08', lastDigestSlot: 'fin', plansSeeded: 'x', notifiedPlans: { W2: '2026-10-08T15:00:00Z' } } },
          { DIGEST_NOW: '2026-10-08T22:10:00Z' });
ok('el de cierre no se repite', /no toca/.test(out) && !/\[DRY\]/.test(out), out);
{
    const lp = iso => P.digestLocalParts(iso);
    ok('turno: 7:07 → inicio', P.digestSlotDue(lp('2026-10-13T13:07:00Z'), {}) === 'inicio');
    ok('turno: inicio ya salió a media mañana → nada', P.digestSlotDue(lp('2026-10-13T13:35:00Z'), { lastDigestDate: '2026-10-13', lastDigestSlot: 'inicio' }) === null);
    ok('turno: estado anterior sin lastDigestSlot cuenta como inicio', P.digestSlotDue(lp('2026-10-13T16:00:00Z'), { lastDigestDate: '2026-10-13' }) === null);
    ok('turno: si el de inicio no salió, a las 16:00 sale solo el de fin', P.digestSlotDue(lp('2026-10-13T22:00:00Z'), {}) === 'fin');
    ok('turno: 15:55 sigue siendo inicio', P.digestSlotDue(lp('2026-10-13T21:55:00Z'), {}) === 'inicio');
    ok('turno: sábado no sale', P.digestSlotDue(lp('2026-10-17T13:07:00Z'), {}) === null);
}
{
    // Verificador: sin nube, con el estado en un archivo.
    const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'dgchk-'));
    const fx = path.join(d3, 'st.json'), go = path.join(d3, 'out.txt');
    const chk = (st, now) => {
        fs.writeFileSync(fx, JSON.stringify(st)); fs.writeFileSync(go, '');
        execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'digest-check.node.js')],
            { env: Object.assign({}, process.env, { DIGEST_STATE_FIXTURE: fx, DIGEST_NOW: now, GITHUB_OUTPUT: go }), encoding: 'utf8' });
        return fs.readFileSync(go, 'utf8').trim();
    };
    ok('verificador: 7:05 sin enviar → due=true', chk({}, '2026-10-13T13:05:00Z') === 'due=true');
    ok('verificador: 7:10 ya enviado → due=false', chk({ lastDigestDate: '2026-10-13', lastDigestSlot: 'inicio' }, '2026-10-13T13:10:00Z') === 'due=false');
    ok('verificador: 16:00 con el de inicio enviado → due=true', chk({ lastDigestDate: '2026-10-13', lastDigestSlot: 'inicio' }, '2026-10-13T22:00:00Z') === 'due=true');
    ok('verificador: 16:20 con el de fin enviado → due=false', chk({ lastDigestDate: '2026-10-13', lastDigestSlot: 'fin' }, '2026-10-13T22:20:00Z') === 'due=false');
    fs.rmSync(d3, { recursive: true, force: true });
}
let prueba = '';
try { run({ vehicles, tpState: plansTp, settings, state: { lastDigestDate: '2026-10-08', plansSeeded: 'x', notifiedPlans: { W2: '2026-10-08T15:00:00Z' } } },
          { DIGEST_TEST_TO: 'yo@kia.com', SMTP_USER: '', SMTP_PASS: '' }); }
catch (e) { prueba = String(e.stdout) + String(e.stderr); }
ok('prueba: solo al correo de prueba, sin copia, aunque ya haya salido hoy', /MODO PRUEBA/.test(prueba) &&
   /\[PRUEBA\] resumen: «.*» → yo@kia\.com \(en un envío real iría en copia: jefe@kia\.com\)/.test(prueba), prueba);
ok('prueba: también el aviso del plan aceptado aunque ya se haya avisado', /\[PRUEBA\] plan: «EmLab · Plan aceptado/.test(prueba), prueba);
ok('prueba: sin credenciales SMTP lo dice', /Faltan los secretos SMTP_USER/.test(prueba));
let fallo = false;
try { run({ vehicles: [], tpState: plansTp, settings, state: {} }); } catch (e) { fallo = e.status === 1 && /no se envía nada/.test(String(e.stderr)); }
ok('sin vehículos: no envía y termina en error', fallo);
fs.rmSync(dir, { recursive: true, force: true });

console.log('\n== limpieza de duplicados (tools/vehicle-dedupe.node.js, sin nube) ==');
{
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dedupe-'));
    const fx = path.join(dir2, 'docs.json');
    const doc = (id, v) => ({ _id: 'v_' + id, vin: v.vin, json: JSON.stringify(Object.assign({ id }, v)) });
    const base = { vin: 'KNADEDUPE00000001', status: 'archived', registeredAt: '2026-09-01T10:00:00Z', timeline: [] };
    fs.writeFileSync(fx, JSON.stringify({ docs: [doc('a', Object.assign({}, base, { updatedAt: '2026-09-02T00:00:00Z' })),
        doc('b', Object.assign({}, base, { updatedAt: '2026-09-05T00:00:00Z' })), doc('c', { vin: 'KNASOLO0000000002', status: 'registered', timeline: [] })], tombs: [] }));
    const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'vehicle-dedupe.node.js')],
        { env: Object.assign({}, process.env, { DEDUPE_FIXTURE: fx }), encoding: 'utf8' });
    ok('revisa: 3 documentos, 2 vehículos, 1 VIN con copias', /3 documentos · 3 vivos · 2 vehículos distintos/.test(out) && /1 VIN con copias → se retiran 1 documento/.test(out), out);
    ok('dice cuál se queda (la edición más reciente) y cuál se retira', /SE QUEDA\s+v_b/.test(out) && /se retira\s+v_a/.test(out), out);
    ok('por defecto solo revisa', /SOLO REVISIÓN: no se escribió nada/.test(out));
    fs.rmSync(dir2, { recursive: true, force: true });
}

console.log('\n== [3.11.0] cilindros instalados y gasolina ==');
{
    const rd = (psi) => [{ date: '2026-10-01', psi: 2000 }, { date: '2026-10-07', psi: psi }];
    const inv = {
        zones: [{ id: 'A', slots: 12 }, { id: 'C', slots: 12 }, { id: 'E', slots: 14 }],
        gases: [
            { id: 'g1', formula: 'CO/N2', concNominal: '50 ppm', controlNo: 'CO-1', zone: 'A01', status: 'In use', initialPsi: 2000, readings: rd(200), validUntil: '2030-01-01' },
            { id: 'g2', formula: 'CO/N2', concNominal: '50ppm', controlNo: 'CO-2', zone: 'E03', status: 'Stock', readings: [], validUntil: '2030-01-01' },
            { id: 'g3', formula: 'NO/N2', concNominal: '20 ppm', controlNo: 'NO-1', zone: 'C02', status: 'Stock', initialPsi: 2000, readings: rd(1800), validUntil: '2030-01-01' },
            { id: 'g4', formula: 'NO/N2', concNominal: '20 ppm', controlNo: 'NO-2', zone: 'E04', status: 'Spare', readings: [], validUntil: '2020-01-01' },
            { id: 'g5', formula: 'CH4/Air', concNominal: '10 ppm', controlNo: 'CH4', zone: 'A02', status: 'Empty', readings: [] }
        ],
        fuelTypes: [{ id: 'ft_e6', name: 'EURO VI', color: '#16a34a', regulation: 'EURO VI', reorderLevel: 300 }],
        fuelTanks: [
            { id: 'old', name: 'EURO VI (Orden Actual)', regulation: 'EURO VI', capacity: 400, currentLevel: 400, unit: 'L', readings: [{ date: '2026-09-01', level: 400 }] },
            { id: 'd1', typeId: 'ft_e6', pos: 'T1-1', legacyTotal: false, capacity: 225, currentLevel: 50, unit: 'L', readings: [{ date: '2026-10-07', level: 50 }] },
            { id: 'd2', typeId: 'ft_e6', pos: 'T1-2', legacyTotal: false, capacity: 225, currentLevel: 225, unit: 'L', readings: [{ date: '2026-10-07', level: 225 }] }
        ]
    };
    const di = P.digestInventory(inv);
    const c = di.cylinders;
    ok('instalados = en uso o conectados a una pared (un vacío no cuenta)', c.counts.installed === 2 && c.rows.map(r => r.code).join(',') === 'A01,C02', JSON.stringify(c.rows.map(r => r.code)));
    ok('A01 al 10 %: crítico, con 1 en stock del mismo (aunque la concentración se escriba sin espacio)', c.rows[0].level === 'critico' && c.rows[0].stockOk === 1 && c.rows[0].stock[0].zone === 'E03');
    ok('C02: su único repuesto está vencido → sin stock (y se dice)', c.rows[1].stockOk === 0 && c.rows[1].stockExpired === 1 && c.counts.sinStock === 1);
    ok('gasolina por tipo: EURO VI = 50 + 225 = 275 L (el total anterior de 400 ya no cuenta)', di.fuel.length === 1 && di.fuel[0].liters === 275 && di.fuel[0].drums === 2 && di.fuel[0].legacy === 1);
    ok('275 L con pedido en 300 → pedir', di.fuel[0].needsPurchase === true);
    const sinTambos = P.digestInventory({ gases: [], fuelTanks: [{ id: 'x', regulation: 'CARB LEV III', capacity: 400, currentLevel: 315, unit: 'L', readings: [{ level: 315 }] }] });
    ok('sin tambos registrados: el total sale del registro anterior (sin tipos, se siembran de la regulación)', sinTambos.fuel.length === 1 && sinTambos.fuel[0].fromLegacy && sinTambos.fuel[0].liters === 315);
    ok('sin inventario: lo dice, no lo deja en ceros', P.digestInventory({}).missing === true && P.digestInventory(null).missing === true);
    const d = P.digestCompute({ vehicles, planFor: null, statusLabels: P.CONFIG.statusLabels, settings, inventory: inv }, NOW);
    const html = P.digestEmailHTML(d);
    ok('el correo trae los cilindros instalados con su stock', /Cilindros instalados: 2 · 1 crítico · 1 sin stock del mismo/.test(html) && /1 en stock/.test(html) && /Sin stock/.test(html) && /vencido\(s\) en almacén/.test(html));
    ok('y la gasolina por tipo', /Gasolina por tipo/.test(html) && /275 L/.test(html) && /2 tambos/.test(html) && />Pedir</.test(html));
    ok('el correo sigue sin variables CSS', !/var\(--/.test(html));
    ok('la notificación avisa de los cilindros críticos', /1 cilindro crítico/.test(P.digestPushText(d).body));
    ok('inventario ilegible: el correo lo declara', /No se pudo leer el inventario/.test(P.digestEmailHTML(P.digestCompute({ vehicles, settings, inventory: {} }, NOW))));
    ok('sin inventario pedido (pruebas viejas): no hay sección', !/Cilindros instalados/.test(P.digestEmailHTML(P.digestCompute({ vehicles, settings }, NOW))));
    const d4 = fs.mkdtempSync(path.join(os.tmpdir(), 'dginv-')), fx4 = path.join(d4, 'fx.json');
    fs.writeFileSync(fx4, JSON.stringify({ vehicles, tpState: plansTp, settings, state: { plansSeeded: 'x' }, inventory: inv }));
    const out2 = execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'daily-digest.node.js')],
        { env: Object.assign({}, process.env, { DRY_RUN: '1', DIGEST_FIXTURE: fx4, DIGEST_OUT: d4, DIGEST_NOW: NOW }), encoding: 'utf8' });
    fs.rmSync(d4, { recursive: true, force: true });
    ok('el proceso real arma la sección con el inventario de la nube', /cilindros: 2 instalados, 1 críticos, 1 sin stock · gasolina: EURO VI 275 L/.test(out2), out2);
}

console.log('\n== [3.12.0] Estatus CoP semanal ==');
{
    const S = P.digestSettingsNormalize({ copTo: 'hq@kia.com, mal' });
    ok('la lista del estatus CoP es propia y se limpia', S.copTo.length === 1 && S.copTo[0] === 'hq@kia.com');
    const L = iso => P.digestLocalParts(iso);
    const vie7 = L('2026-10-23T13:05:00Z'), vie6 = L('2026-10-23T12:30:00Z'), vie16 = L('2026-10-23T22:05:00Z'), lun = L('2026-10-26T13:05:00Z'), jue = L('2026-10-29T22:05:00Z');
    const due = (lp, st) => { const d = P.digestCopDue(lp, st, S); return d ? d.week + '/' + d.cut : null; };
    ok('sale el viernes desde las 7:00, con el corte de ese viernes', due(vie7, { lastCopWeek: '2026-10-12' }) === '2026-10-19/2026-10-23');
    ok('a las 6:30 del viernes todavía toca la semana anterior (si no salió)', due(vie6, { lastCopWeek: '2026-10-05' }) === '2026-10-12/2026-10-16' && due(vie6, { lastCopWeek: '2026-10-12' }) === null);
    ok('ya enviada esa semana, no se repite', due(vie16, { lastCopWeek: '2026-10-19' }) === null);
    ok('si no se logró el viernes, se sigue intentando (viernes 16:00, lunes, jueves) con el corte del viernes', due(vie16, { lastCopWeek: '2026-10-12' }) === '2026-10-19/2026-10-23' &&
        due(lun, { lastCopWeek: '2026-10-12' }) === '2026-10-19/2026-10-23' && due(jue, { lastCopWeek: '2026-10-12' }) === '2026-10-19/2026-10-23');
    ok('la primera vez solo sale el mismo viernes (no manda una semana vieja al estrenarse)', due(vie7, {}) === '2026-10-19/2026-10-23' && due(lun, {}) === null);
    ok('sin destinatarios no toca', P.digestCopDue(vie7, {}, P.digestSettingsNormalize({})) === null);
    // El proceso de la nube calcula con el código REAL del CoP (mismos gases, límites y veredicto).
    const yk = P.copYearKeyOf('CL4|1000cc KAPPA PE|6MT|26 MODEL|PRE-EURO 7|||5DR', 2026);
    const veh = (i, my, d, co) => ({ id: 'v' + i, vin: 'KNAX' + i, status: 'archived', purpose: 'COP-Emisiones',
        config: { 'Modelo': 'CL4', 'ENGINE CAPACITY': '1000cc KAPPA PE', 'TRANSMISSION': '6MT', 'MODEL YEAR (VIN)': my, 'EMISSION REGULATION': 'PRE-EURO 7',
                  'ENVIRONMENT PACKAGE': '0', 'ENGINE PACKAGE': '0', 'BODY TYPE': '5DR', 'REGION': 'EUROPE' },
        testData: { testDatetime: d, gasResults: { aprobador: { values: { CO: co, THC: 0.03, NMHC: 0.02, NOx: 0.01, PM: 0.0002, PN: 1e10 } } } } });
    P.db.vehicles = [veh(1, '26 MODEL', '2026-08-01T10:00', 0.2), veh(2, '27 MODEL', '2026-10-01T10:00', 0.21), veh(3, '27 MODEL', '2026-10-21T10:00', 0.19), veh(4, '26 MODEL', '2025-11-01T10:00', 0.2)];
    P.__tpSet({ planData: [{ desc: 'x', mod: 'CL4', eng: '1000cc KAPPA PE', tx: '6MT', my: '26 MODEL', reg: 'PRE-EURO 7', ep: '0', engpkg: '0', body: '5DR', rgn: 'EUROPE', m: [800, 900] }],
                months: ['Jun-26', 'Jul-26'], testedList: [], weeklyPlans: [] });
    P.__copSet({});
    P.__setRegProfiles(null);
    const m = P.copYearReportModel({ cutIso: '2026-10-23', force: true });
    const r = m.rows.find(x => x.key === yk);
    ok('MY26 + MY27 juntos, solo ensayos de 2026: 3 hechas de 3', r && r.done === 3 && r.req === 3 && r.vol === 1700, r && JSON.stringify({ d: r.done, q: r.req, v: r.vol }));
    ok('el veredicto sale del muestreo secuencial real (con 3 ensayos lejos del límite: concordante)', r && r.verdict === 'PASS' && r.status.id === 'ok', r && r.verdict);
    ok('+1 esta semana (el del 21 de octubre)', r && r.added === 1);
    ok('el correo no trae VINs', P.copYearReportHTML(m, {}).indexOf('KNAX') < 0);
    ok('asunto con avance y ensayos', /CoP 2026 · semana 43 — 100% de avance \(3\/3 ensayos, \+1 esta semana\)/.test(P.copRepSubject(m)), P.copRepSubject(m));
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exit(1);
