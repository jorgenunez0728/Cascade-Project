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
let fallo = false;
try { run({ vehicles: [], tpState: plansTp, settings, state: {} }); } catch (e) { fallo = e.status === 1 && /no se envía nada/.test(String(e.stderr)); }
ok('sin vehículos: no envía y termina en error', fallo);
fs.rmSync(dir, { recursive: true, force: true });

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exit(1);
