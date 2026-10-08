// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.37.0] Avisos del laboratorio — resumen diario, escalación y      ║
// ║  aviso de plan aceptado (correo + ntfy + Web Push).                   ║
// ║                                                                      ║
// ║  Lo envía un proceso de GitHub Actions (tools/daily-digest.node.js,  ║
// ║  lunes a viernes) que lee la nube y carga ESTE archivo en un `vm`:   ║
// ║  la app y el correo salen de las mismas funciones. Todo lo de arriba ║
// ║  de "INTERFAZ" es PURO (sin DOM, sin globals mutables); lo de abajo  ║
// ║  es la tarjeta de Datos → Sistema.                                   ║
// ║                                                                      ║
// ║  Solo vehículos y plan (decisión del laboratorio): nada de gases ni  ║
// ║  calibraciones. Nunca valores de gases ni VIN completo: el correo    ║
// ║  sale por Gmail, fuera de KIA.                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝

// México (centro) sin horario de verano desde 2022: UTC−6 fijo. El proceso corre en UTC.
var DIGEST_TZ_OFFSET_MIN = -360;
var DIGEST_ESCALATE_DAYS_DEFAULT = 7;
var DIGEST_APP_URL = 'https://kia-emlab-test-system.web.app';
var DIGEST_VIN_TAIL = 6;
var DIGEST_STAGE_ORDER = ['registered', 'in-progress', 'testing', 'ready-release', 'pending-approval'];
var DIGEST_STAGE_SHORT = {
    'registered': 'Registrado', 'in-progress': 'En progreso', 'testing': 'En prueba',
    'ready-release': 'Por liberar', 'pending-approval': 'Por aprobar'
};
var DIGEST_DAY_KEYS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
var DIGEST_DOW_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
var DIGEST_DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var DIGEST_MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
var DIGEST_MONTH_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];
var DIGEST_PLAN_DAY_ORDER = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
var DIGEST_PLAN_DAY_LABEL = { lun: 'Lun', mar: 'Mar', mie: 'Mié', jue: 'Jue', vie: 'Vie', sab: 'Sáb', dom: 'Dom' };

function _digestEsc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Fecha y hora LOCALES del laboratorio de un instante ISO. PURA. */
function digestLocalParts(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return null;
    var d = new Date(t + DIGEST_TZ_OFFSET_MIN * 60000);
    var p2 = function(n) { return (n < 10 ? '0' : '') + n; };
    return {
        date: d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()),
        y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), dow: d.getUTCDay(),
        hour: d.getUTCHours(), minute: d.getUTCMinutes(), hhmm: p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes())
    };
}

/** 'AAAA-MM-DD' + n días, sobre la cadena (sin zona horaria). PURA. */
function digestAddDays(isoDate, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
    return d.toISOString().slice(0, 10);
}

/** El lunes de la semana de un 'AAAA-MM-DD'. PURA. */
function digestMondayOf(isoDate) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
    if (!m) return null;
    var wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    return digestAddDays(isoDate, wd === 0 ? -6 : 1 - wd);
}

/** 'jue 8 oct' de un 'AAAA-MM-DD'. PURA. */
function digestShortDate(isoDate) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
    if (!m) return '';
    var wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    return DIGEST_DOW_SHORT[wd] + ' ' + (+m[3]) + ' ' + DIGEST_MONTH_SHORT[+m[2] - 1];
}

/** '12–16 oct' (o '29 sep – 3 oct') de la semana que empieza en `monday`. PURA. */
function digestWeekLabel(monday) {
    var fri = digestAddDays(monday, 4);
    if (!monday || !fri) return '';
    var a = monday.split('-'), b = fri.split('-');
    if (a[1] === b[1]) return (+a[2]) + '–' + (+b[2]) + ' ' + DIGEST_MONTH_SHORT[+a[1] - 1];
    return (+a[2]) + ' ' + DIGEST_MONTH_SHORT[+a[1] - 1] + ' – ' + (+b[2]) + ' ' + DIGEST_MONTH_SHORT[+b[1] - 1];
}

/** Días naturales completos entre dos instantes (≥ 0). PURA. */
function digestDaysBetween(fromIso, toIso) {
    var a = Date.parse(fromIso), b = Date.parse(toIso);
    if (isNaN(a) || isNaN(b) || b < a) return 0;
    return Math.floor((b - a) / 86400000);
}

/** Los últimos 6 del VIN, con '…' delante. Nunca el VIN completo. PURA. */
function digestVinShort(vin) {
    var s = String(vin || '').trim();
    if (!s) return '—';
    return '…' + s.slice(-DIGEST_VIN_TAIL);
}

/** Correos de un texto libre (comas, punto y coma, espacios o renglones). PURA. */
function digestParseEmails(text) {
    var out = [], seen = {};
    String(text || '').split(/[\s,;]+/).forEach(function(e) {
        e = e.trim().toLowerCase();
        if (!e || seen[e]) return;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return;
        seen[e] = true; out.push(e);
    });
    return out;
}

/** Correos inválidos de un texto libre (para decirlos en el campo). PURA. */
function digestInvalidEmails(text) {
    return String(text || '').split(/[\s,;]+/).map(function(e) { return e.trim(); })
        .filter(function(e) { return e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
}

/** Ajustes compartidos del aviso, con defaults reaplicados en cada lectura. PURA. */
function digestSettingsNormalize(s) {
    s = s || {};
    var days = parseInt(s.escalateDays, 10);
    return {
        to: Array.isArray(s.to) ? digestParseEmails(s.to.join(' ')) : digestParseEmails(s.to),
        escalateTo: Array.isArray(s.escalateTo) ? digestParseEmails(s.escalateTo.join(' ')) : digestParseEmails(s.escalateTo),
        escalateDays: (isNaN(days) || days < 1) ? DIGEST_ESCALATE_DAYS_DEFAULT : Math.min(days, 90),
        ntfyTopic: String(s.ntfyTopic || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64),
        vapidPublic: String(s.vapidPublic || ''),
        updatedAt: s.updatedAt || '', by: s.by || ''
    };
}

function _digestModel(v) { return (v && v.config && (v.config['Modelo'] || v.config.Modelo)) || ''; }
function _digestReg(v) {
    if (!v) return '';
    if (v.regulationOverride && v.regulationOverride.name) return v.regulationOverride.name;
    return (v.config && v.config['EMISSION REGULATION']) || '';
}

/**
 * Desde cuándo está el vehículo en su etapa ACTUAL: el inicio de la última racha de la
 * línea de tiempo con ese estado. Sin entradas de estado: el alta. PURA.
 */
function digestStageSince(v) {
    if (!v) return '';
    var since = v.registeredAt || '';
    var prev = 'registered';
    var tl = (v.timeline || []).filter(function(t) { return t && t.timestamp && t.data && t.data.status; })
        .slice().sort(function(a, b) { return String(a.timestamp) < String(b.timestamp) ? -1 : 1; });
    tl.forEach(function(t) {
        if (t.data.status !== prev) { prev = t.data.status; since = t.timestamp; }
    });
    return prev === v.status ? since : (v.updatedAt || since);
}

/** Cuándo se aprobó (pasó a 'archived'). PURA. */
function digestApprovedAt(v) {
    if (!v) return '';
    var last = '';
    (v.timeline || []).forEach(function(t) {
        if (t && t.timestamp && t.data && t.data.status === 'archived' && String(t.timestamp) > last) last = String(t.timestamp);
    });
    return last || v.archivedAt || '';
}

function _digestSigName(sig) { return (sig && (sig.sessionUserName || sig.signerName)) || ''; }

/**
 * Los vehículos de la nube como los ve la app. PURA respecto a lo que recibe.
 * La nube guarda un documento por vehículo (2.9.0), pero la app los junta POR VIN
 * (`_fbMergeVehicle`) y retira los borrados (`vehicleIsTombstoned` contra
 * `cop15meta.deletedVehicles`) — sin esto el resumen contaba de más (un VIN con dos
 * documentos, o un vehículo borrado cuyo documento no quedó marcado).
 * → {vehicles, merged (copias juntadas), removed (borrados retirados)}
 */
function digestCloudVehicles(docsVehicles, tombs) {
    var isTomb = (typeof vehicleIsTombstoned === 'function') ? vehicleIsTombstoned : function() { return false; };
    var vivos = (docsVehicles || []).filter(function(v) { return v && v.vin && !(tombs && tombs.length && isTomb(v, tombs)); });
    var removed = (docsVehicles || []).filter(function(v) { return v && v.vin; }).length - vivos.length;
    // LA regla de juntar por VIN es la de la app (fbVehCollapseByVin, firebase-sync.js).
    var juntos = fbVehCollapseByVin(vivos);
    return { vehicles: juntos, merged: vivos.length - juntos.length, removed: removed };
}

/**
 * LA definición de los vehículos activos del resumen. PURA.
 * → {rows (del más viejo al más nuevo), count, avgDays, maxDays, byStage:[{status,label,n}], escalated:[rows]}
 * Escalado = MÁS de `escalateDays` días naturales desde el alta y todavía sin aprobar.
 */
function digestVehicles(vehicles, nowIso, opts) {
    opts = opts || {};
    var limit = opts.escalateDays || DIGEST_ESCALATE_DAYS_DEFAULT;
    var labels = opts.statusLabels || {};
    var rows = [];
    (vehicles || []).forEach(function(v) {
        if (!v || !vehicleIsLive(v)) return;
        if (v.registeredAt && String(v.registeredAt) > nowIso) return;
        var days = digestDaysBetween(v.registeredAt || nowIso, nowIso);
        rows.push({
            id: v.id, vin: digestVinShort(v.vin), model: _digestModel(v), reg: _digestReg(v),
            status: v.status, label: DIGEST_STAGE_SHORT[v.status] || labels[v.status] || v.status || '—',
            registeredAt: v.registeredAt || '', daysActive: days,
            daysInStage: digestDaysBetween(digestStageSince(v) || v.registeredAt || nowIso, nowIso),
            escalated: days > limit
        });
    });
    rows.sort(function(a, b) {
        return (b.daysActive - a.daysActive) || (String(a.registeredAt) < String(b.registeredAt) ? -1 : 1);
    });
    var counts = {};
    rows.forEach(function(r) { counts[r.status] = (counts[r.status] || 0) + 1; });
    var order = DIGEST_STAGE_ORDER.concat(Object.keys(counts).filter(function(s) { return DIGEST_STAGE_ORDER.indexOf(s) < 0; }));
    var byStage = order.filter(function(s) { return counts[s]; }).map(function(s) {
        return { status: s, label: DIGEST_STAGE_SHORT[s] || labels[s] || s, n: counts[s] };
    });
    var sum = rows.reduce(function(a, r) { return a + r.daysActive; }, 0);
    return {
        rows: rows, count: rows.length, escalateDays: limit,
        avgDays: rows.length ? Math.round(sum / rows.length * 10) / 10 : 0,
        maxDays: rows.length ? rows[0].daysActive : 0,
        byStage: byStage, escalated: rows.filter(function(r) { return r.escalated; })
    };
}

/** Aprobados después de `sinceIso` (y no después de `nowIso`), del más reciente al más viejo. PURA. */
function digestApprovedSince(vehicles, sinceIso, nowIso) {
    var out = [];
    (vehicles || []).forEach(function(v) {
        if (!v || v.status !== 'archived') return;
        var at = digestApprovedAt(v);
        if (!at || (sinceIso && String(at) <= sinceIso) || String(at) > nowIso) return;
        var sig = (v.testData && v.testData.signatures) || {};
        var test = (typeof vehicleTestDate === 'function') ? vehicleTestDate(v) : '';
        out.push({
            id: v.id, vin: digestVinShort(v.vin), model: _digestModel(v), reg: _digestReg(v),
            testDate: test, approvedAt: at, days: digestDaysBetween(v.registeredAt || at, at),
            releaser: _digestSigName(sig.releaser), approver: _digestSigName(sig.approver)
        });
    });
    out.sort(function(a, b) { return String(a.approvedAt) < String(b.approvedAt) ? 1 : -1; });
    return out;
}

/**
 * Estado del plan de la SEMANA SIGUIENTE. `planFor(weekDate)` es `tpWeekPlanFor` (LA
 * definición del plan vigente). Solo se muestra jueves y viernes. PURA respecto a lo que recibe.
 */
function digestNextWeekPlan(planFor, nowIso) {
    var lp = digestLocalParts(nowIso);
    if (!lp) return null;
    var monday = digestAddDays(digestMondayOf(lp.date), 7);
    var r = (typeof planFor === 'function') ? planFor(monday) : null;
    var state = !r ? 'sin-plan' : (r.accepted ? 'aceptado' : 'propuesta');
    var plan = r && r.plan;
    return {
        weekDate: monday, weekLabel: digestWeekLabel(monday), state: state,
        show: lp.dow === 4 || lp.dow === 5, day: lp.dow === 4 ? 'jue' : (lp.dow === 5 ? 'vie' : ''),
        acceptedBy: (plan && plan.acceptedBy) || '', acceptedDate: (plan && r.accepted && plan.acceptedDate) || '',
        count: plan && Array.isArray(plan.items) ? plan.items.length : 0
    };
}

/**
 * Planes ACEPTADOS de la semana actual en adelante que todavía no se avisaron.
 * `notified` = {planId: acceptedDate avisada}. Un plan re-aceptado (otra fecha) sale
 * como `updated`. PURA.
 */
function digestPlansToAnnounce(plans, notified, nowIso, planIdFn) {
    var lp = digestLocalParts(nowIso);
    if (!lp) return [];
    var thisMonday = digestMondayOf(lp.date);
    notified = notified || {};
    var idOf = planIdFn || function(p) { return p.planId || ('W' + p.weekDate + '-' + (p.id || p.created || '')); };
    var out = [];
    (plans || []).forEach(function(p) {
        if (!p || !p.accepted || !p.acceptedDate || !p.weekDate) return;
        if (String(p.weekDate) < thisMonday) return;
        var id = idOf(p);
        if (notified[id] === p.acceptedDate) return;
        out.push({ planId: id, plan: p, updated: !!notified[id] });
    });
    out.sort(function(a, b) { return String(a.plan.weekDate) < String(b.plan.weekDate) ? -1 : 1; });
    return out;
}

/** Las filas de un plan agrupadas por día de prueba (lun → dom, sin día al final). PURA. */
function digestPlanByDay(plan) {
    var by = {};
    ((plan && plan.items) || []).forEach(function(it) {
        if (!it) return;
        var d = it.testDay && DIGEST_PLAN_DAY_LABEL[it.testDay] ? it.testDay : '_';
        var parts = [it.mod, it.reg].filter(Boolean);
        var text = parts.length ? parts.join(' ') : String(it.desc || '—');
        var purpose = it.purpose && !/emisi/i.test(String(it.purpose)) ? String(it.purpose) : '';
        (by[d] = by[d] || []).push({ text: text, rgn: it.rgn || '', purpose: purpose, done: !!it.completed });
    });
    return DIGEST_PLAN_DAY_ORDER.concat(['_']).filter(function(d) { return by[d]; }).map(function(d) {
        var date = d === '_' ? '' : digestAddDays(plan.weekDate, DIGEST_PLAN_DAY_ORDER.indexOf(d));
        return { day: d, label: d === '_' ? 'Sin día' : DIGEST_PLAN_DAY_LABEL[d] + ' ' + (date ? +date.slice(8) : ''), items: by[d] };
    });
}

/** El aviso de un plan aceptado, listo para pintar. PURA. */
function digestPlanAnnouncement(entry) {
    var p = entry.plan;
    var at = p.acceptedDate ? digestLocalParts(p.acceptedDate) : null;
    return {
        planId: entry.planId, updated: !!entry.updated, weekDate: p.weekDate,
        weekLabel: digestWeekLabel(p.weekDate), acceptedBy: p.acceptedBy || '',
        acceptedAtLabel: at ? digestShortDate(at.date) + ' ' + at.hhmm : '',
        count: (p.items || []).length, byDay: digestPlanByDay(p)
    };
}

/**
 * LA definición del resumen diario. PURA.
 * src = {vehicles, planFor, statusLabels, settings, lastDigestAt, lastChangeAt}
 */
function digestCompute(src, nowIso) {
    src = src || {};
    var settings = digestSettingsNormalize(src.settings);
    var lp = digestLocalParts(nowIso);
    var veh = digestVehicles(src.vehicles, nowIso, { escalateDays: settings.escalateDays, statusLabels: src.statusLabels });
    // "Desde el último resumen": sin uno previo, las últimas 24 h (el lunes, desde el viernes 7:00).
    var since = src.lastDigestAt || new Date(Date.parse(nowIso) - (lp && lp.dow === 1 ? 72 : 24) * 3600000).toISOString();
    var approved = digestApprovedSince(src.vehicles, since, nowIso);
    var lastChange = src.lastChangeAt || '';
    if (!lastChange) {
        (src.vehicles || []).forEach(function(v) {
            var u = (v && (v.updatedAt || v.registeredAt)) || '';
            if (u > lastChange) lastChange = u;
        });
    }
    var quietH = lastChange ? (Date.parse(nowIso) - Date.parse(lastChange)) / 3600000 : null;
    var limitH = lp && lp.dow === 1 ? 72 : 24;
    return {
        now: nowIso, date: lp ? lp.date : '', dow: lp ? lp.dow : 0,
        dateLabel: lp ? DIGEST_DOW_LONG[lp.dow] + ' ' + lp.day + ' de ' + DIGEST_MONTH_LONG[lp.m] : '',
        subjectDate: lp ? digestShortDate(lp.date) : '',
        hhmm: lp ? lp.hhmm : '',
        vehicles: veh, approved: approved, since: since,
        sinceMonday: !src.lastDigestAt && lp && lp.dow === 1,
        nextPlan: digestNextWeekPlan(src.planFor, nowIso),
        lastChangeAt: lastChange, lastChangeLabel: _digestWhenLabel(lastChange, nowIso),
        stale: quietH !== null && quietH > limitH, quietHours: quietH === null ? null : Math.round(quietH),
        settings: settings,
        escalateTo: veh.escalated.length ? settings.escalateTo : []
    };
}

function _digestWhenLabel(iso, nowIso) {
    if (!iso) return 'sin registro';
    var a = digestLocalParts(iso), n = digestLocalParts(nowIso);
    if (!a || !n) return '';
    if (a.date === n.date) return 'hoy ' + a.hhmm;
    if (a.date === digestAddDays(n.date, -1)) return 'ayer ' + a.hhmm;
    return digestShortDate(a.date) + ' ' + a.hhmm;
}

/** Asunto del resumen: lleva la acción, se lee desde la bandeja. PURA. */
function digestSubject(d) {
    var parts = ['EmLab', d.subjectDate];
    var v = d.vehicles;
    parts.push(v.count + (v.count === 1 ? ' activo' : ' activos'));
    if (v.escalated.length) parts.push(v.escalated.length + (v.escalated.length === 1 ? ' escalado' : ' escalados'));
    var np = d.nextPlan;
    if (np && np.show) parts.push(np.state === 'aceptado' ? 'plan ' + np.weekLabel + ' listo' : 'falta plan ' + np.weekLabel);
    if (!v.escalated.length && !(np && np.show && np.state !== 'aceptado')) parts.push('al día');
    return parts.join(' · ');
}

/** Texto de la notificación (ntfy y Web Push): título + una línea. PURA. */
function digestPushText(d) {
    var v = d.vehicles;
    var st = {};
    v.byStage.forEach(function(s) { st[s.status] = s.n; });
    var title = 'EmLab · ' + v.count + (v.count === 1 ? ' activo' : ' activos') +
        (v.escalated.length ? ' · ' + v.escalated.length + (v.escalated.length === 1 ? ' escalado' : ' escalados') : '');
    var body = [];
    if (st['pending-approval']) body.push(st['pending-approval'] + ' por aprobar');
    if (st['ready-release']) body.push(st['ready-release'] + ' por liberar');
    if (d.approved.length) body.push(d.approved.length + (d.approved.length === 1 ? ' aprobado' : ' aprobados'));
    var np = d.nextPlan;
    if (np && np.show) body.push(np.state === 'aceptado' ? 'plan ' + np.weekLabel + ' listo' : 'falta plan ' + np.weekLabel);
    if (!body.length) body.push('Sin pendientes de aprobación ni de liberación');
    return { title: title, body: body.join(' · '), url: DIGEST_APP_URL };
}

/** Asunto del aviso de plan aceptado. PURA. */
function digestPlanSubject(a) {
    return 'EmLab · ' + (a.updated ? 'Plan actualizado' : 'Plan aceptado') + ': semana ' + a.weekLabel +
        ' (' + a.count + (a.count === 1 ? ' prueba)' : ' pruebas)');
}
function digestPlanPushText(a) {
    return { title: 'EmLab · ' + (a.updated ? 'Plan actualizado' : 'Plan aceptado') + ' · semana ' + a.weekLabel,
             body: a.count + (a.count === 1 ? ' prueba' : ' pruebas') + (a.acceptedBy ? ' · aceptado por ' + a.acceptedBy : ''),
             url: DIGEST_APP_URL };
}

// ── HTML de correo: estilos LITERALES (nada de var(--…)), tablas, ≤ 600 px ──
var _DG = {
    text: '#1e293b', muted: '#64748b', border: '#e2e8f0', bg: '#f8fafc', accent: '#0f4c81',
    red: '#b91c1c', redBg: '#fef2f2', amber: '#92400e', amberBg: '#fffbeb', green: '#166534', greenBg: '#f0fdf4'
};
function _digestH(title, color) {
    return '<tr><td style="padding:20px 0 8px 0;border-bottom:2px solid ' + (color || _DG.accent) + ';">' +
        '<div style="font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:' + (color || _DG.accent) + ';">' +
        _digestEsc(title) + '</div></td></tr>';
}
function _digestWrap(inner, preheader, foot) {
    return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1"><title>EmLab</title></head>' +
        '<body style="margin:0;padding:0;background:' + _DG.bg + ';">' +
        '<div style="display:none;max-height:0;overflow:hidden;">' + _digestEsc(preheader || '') + '</div>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + _DG.bg + ';">' +
        '<tr><td align="center" style="padding:16px 8px;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;' +
        'border:1px solid ' + _DG.border + ';border-radius:8px;font-family:Segoe UI,Arial,Helvetica,sans-serif;color:' + _DG.text + ';">' +
        '<tr><td style="padding:20px 24px 24px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
        inner +
        '<tr><td style="padding:24px 0 0 0;" align="center">' +
        '<a href="' + DIGEST_APP_URL + '" style="display:inline-block;background:' + _DG.accent + ';color:#ffffff;' +
        'text-decoration:none;font-weight:700;font-size:14px;padding:10px 20px;border-radius:6px;">Abrir la plataforma</a></td></tr>' +
        '</table></td></tr></table>' +
        '<div style="max-width:600px;font-family:Segoe UI,Arial,Helvetica,sans-serif;font-size:11px;color:' + _DG.muted +
        ';padding:12px 8px;line-height:1.5;">Correo automático de la plataforma del Laboratorio de Emisiones. ' +
        (foot ? foot + ' ' : '') + 'Destinatarios y escalación: Datos → Sistema → Avisos del laboratorio.</div>' +
        '</td></tr></table></body></html>';
}
function _digestCell(t, opt) {
    opt = opt || {};
    return '<td style="padding:6px 8px;border-bottom:1px solid ' + _DG.border + ';font-size:13px;' +
        (opt.align ? 'text-align:' + opt.align + ';' : '') + (opt.bold ? 'font-weight:700;' : '') +
        (opt.color ? 'color:' + opt.color + ';' : '') + (opt.nowrap ? 'white-space:nowrap;' : '') + '">' + t + '</td>';
}
function _digestTh(t, align) {
    return '<th style="padding:6px 8px;border-bottom:1px solid ' + _DG.border + ';font-size:11px;color:' + _DG.muted +
        ';text-align:' + (align || 'left') + ';font-weight:600;">' + _digestEsc(t) + '</th>';
}
function _digestDays(n) { return n + (n === 1 ? ' día' : ' días'); }
function _digestAgo(n) { return n ? 'hace ' + _digestDays(n) : 'hoy'; }

/** El correo del resumen diario. PURA. */
function digestEmailHTML(d) {
    var v = d.vehicles, h = '';
    h += '<tr><td style="padding:0 0 4px 0;font-size:20px;font-weight:700;">Laboratorio de Emisiones</td></tr>' +
        '<tr><td style="font-size:14px;color:' + _DG.muted + ';">Resumen del ' + _digestEsc(d.dateLabel) +
        ' · datos de la nube a las ' + _digestEsc(d.hhmm) + ' · último cambio de un equipo: ' + _digestEsc(d.lastChangeLabel) + '</td></tr>';
    if (d.stale) {
        h += '<tr><td style="padding:12px 0 0 0;"><div style="background:' + _DG.amberBg + ';color:' + _DG.amber +
            ';border-left:4px solid #f59e0b;padding:8px 12px;font-size:13px;">Ningún equipo ha subido cambios en ' +
            _digestEsc(d.quietHours) + ' h: este resumen puede estar atrasado. Abre la plataforma en un equipo con internet.</div></td></tr>';
    }
    // Las tablas son de 2–3 columnas a propósito: el correo se abre sobre todo en el teléfono,
    // y una tabla de 5 columnas obliga a desplazarse de lado.
    var small = function(t) { return '<br><span style="font-size:11px;color:' + _DG.muted + ';">' + t + '</span>'; };
    var who = function(r) { return '<b>' + _digestEsc(r.vin) + '</b> ' + _digestEsc(r.model) + (r.reg ? small(_digestEsc(r.reg)) : ''); };
    // Escalados
    if (v.escalated.length) {
        h += _digestH('⚠ Escalados — más de ' + _digestDays(v.escalateDays) + ' sin aprobar', _DG.red);
        if (d.escalateTo.length) {
            h += '<tr><td style="padding:6px 0 0 0;font-size:12px;color:' + _DG.muted + ';">En copia: ' +
                _digestEsc(d.escalateTo.join(', ')) + ' — hasta que se aprueben.</td></tr>';
        }
        h += '<tr><td style="padding:4px 0 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + _DG.redBg + ';">';
        v.escalated.forEach(function(r) {
            h += '<tr>' + _digestCell(who(r) + small(_digestEsc(r.label) + ' desde ' + _digestAgo(r.daysInStage)))
                + _digestCell(_digestDays(r.daysActive), { bold: true, color: _DG.red, nowrap: true, align: 'right' }) + '</tr>';
        });
        h += '</table></td></tr>';
    }
    // Activos
    h += _digestH('Activos: ' + v.count + (v.count ? ' · promedio ' + _digestDays(v.avgDays) + ' · el más viejo ' + _digestDays(v.maxDays) : ''));
    if (!v.count) {
        h += '<tr><td style="padding:8px 0;font-size:13px;color:' + _DG.muted + ';">No hay vehículos en curso.</td></tr>';
    } else {
        h += '<tr><td style="padding:8px 0;font-size:13px;">' + v.byStage.map(function(s) {
            return _digestEsc(s.label) + '&nbsp;<b>' + s.n + '</b>';
        }).join(' &nbsp;·&nbsp; ') + '</td></tr>';
        h += '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
            _digestTh('Vehículo') + _digestTh('Etapa') + _digestTh('Días', 'right') + '</tr>';
        v.rows.forEach(function(r) {
            h += '<tr>' + _digestCell(who(r))
                + _digestCell(_digestEsc(r.label) + small(_digestAgo(r.daysInStage)))
                + _digestCell(r.daysActive + (r.escalated ? '&nbsp;⚠' : ''), { align: 'right', nowrap: true, bold: r.escalated, color: r.escalated ? _DG.red : '' }) + '</tr>';
        });
        h += '</table></td></tr>';
        h += '<tr><td style="padding:4px 0 0 0;font-size:11px;color:' + _DG.muted + ';">Días = desde el alta. Debajo de la etapa: desde cuándo está en ella.</td></tr>';
    }
    // Aprobados
    h += _digestH('Aprobados desde el último resumen' + (d.sinceMonday ? ' (viernes a domingo)' : '') + ': ' + d.approved.length);
    if (!d.approved.length) {
        h += '<tr><td style="padding:8px 0;font-size:13px;color:' + _DG.muted + ';">Ninguno.</td></tr>';
    } else {
        h += '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
            _digestTh('Vehículo') + _digestTh('Prueba') + _digestTh('Días', 'right') + '</tr>';
        d.approved.forEach(function(r) {
            h += '<tr>' + _digestCell(who(r) + small('Liberó ' + _digestEsc(r.releaser || '—') + ' · aprobó ' + _digestEsc(r.approver || '—')))
                + _digestCell(_digestEsc(r.testDate ? digestShortDate(r.testDate) : '—'), { nowrap: true })
                + _digestCell(String(r.days), { align: 'right', nowrap: true }) + '</tr>';
        });
        h += '</table></td></tr>';
        h += '<tr><td style="padding:4px 0 0 0;font-size:11px;color:' + _DG.muted + ';">Días = del alta a la aprobación.</td></tr>';
    }
    // Plan de la semana siguiente (jueves y viernes)
    var np = d.nextPlan;
    if (np && np.show) {
        var ok = np.state === 'aceptado';
        h += _digestH('Plan de la semana siguiente (' + np.weekLabel + ')', ok ? _DG.green : _DG.amber);
        var msg;
        if (ok) {
            var at = np.acceptedDate ? digestLocalParts(np.acceptedDate) : null;
            msg = '✅ Listo: aceptado' + (np.acceptedBy ? ' por ' + _digestEsc(np.acceptedBy) : '') +
                (at ? ' el ' + _digestEsc(digestShortDate(at.date)) + ' a las ' + at.hhmm : '') +
                ' — ' + np.count + (np.count === 1 ? ' prueba.' : ' pruebas.');
        } else if (np.day === 'vie') {
            msg = '⚠ Sigue pendiente el plan de la semana ' + _digestEsc(np.weekLabel) + '. ' +
                (np.state === 'propuesta' ? 'Hay una propuesta de ' + np.count + (np.count === 1 ? ' prueba' : ' pruebas') + ' sin aceptar.' : 'Todavía no hay propuesta.');
        } else {
            msg = '⏳ Falta aceptar el plan de la semana ' + _digestEsc(np.weekLabel) + '. ' +
                (np.state === 'propuesta' ? 'Hay una propuesta de ' + np.count + (np.count === 1 ? ' prueba' : ' pruebas') + ': revísala en Plan → Calendario.' : 'Todavía no hay propuesta: ármala en Plan → Calendario.');
        }
        h += '<tr><td style="padding:8px 12px;font-size:13px;background:' + (ok ? _DG.greenBg : _DG.amberBg) +
            ';color:' + (ok ? _DG.green : _DG.amber) + ';">' + msg + '</td></tr>';
    }
    return _digestWrap(h, digestPushText(d).body, 'Sale de lunes a viernes a las 7:00. Los días cuentan desde el alta, en días naturales (incluye fin de semana).');
}

/** El correo del aviso de plan aceptado. PURA. */
function digestPlanEmailHTML(a) {
    var h = '<tr><td style="padding:0 0 4px 0;font-size:20px;font-weight:700;">' +
        (a.updated ? 'Plan actualizado' : 'Plan aceptado') + ': semana ' + _digestEsc(a.weekLabel) + '</td></tr>' +
        '<tr><td style="font-size:14px;color:' + _DG.muted + ';">' +
        (a.acceptedBy ? 'Aceptado por ' + _digestEsc(a.acceptedBy) : 'Aceptado') +
        (a.acceptedAtLabel ? ', ' + _digestEsc(a.acceptedAtLabel) : '') + ' · ' + a.count + (a.count === 1 ? ' prueba' : ' pruebas') + '</td></tr>';
    h += _digestH('Pruebas por día');
    h += '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">';
    a.byDay.forEach(function(g) {
        h += '<tr><td valign="top" style="padding:8px 8px 8px 0;border-bottom:1px solid ' + _DG.border +
            ';font-size:13px;font-weight:700;white-space:nowrap;width:64px;">' + _digestEsc(g.label) + '</td>' +
            '<td style="padding:8px 0;border-bottom:1px solid ' + _DG.border + ';font-size:13px;">' +
            g.items.map(function(it) {
                return _digestEsc(it.text) + (it.rgn ? ' <span style="color:' + _DG.muted + ';">' + _digestEsc(it.rgn) + '</span>' : '') +
                    (it.purpose ? ' <span style="font-size:11px;background:#eef2ff;color:#3730a3;padding:1px 6px;border-radius:8px;">' + _digestEsc(it.purpose) + '</span>' : '');
            }).join('<br>') + '</td></tr>';
    });
    h += '</table></td></tr>';
    return _digestWrap(h, digestPlanPushText(a).body, 'Sale cuando alguien acepta el plan de una semana.');
}

// ══════════════════════════════════════════════════════════════════════
// INTERFAZ — tarjeta "📬 Avisos del laboratorio" (Datos → Sistema)
// ══════════════════════════════════════════════════════════════════════
var _digestUi = { settings: null, loading: false, loadError: false };

/** Resumen con los datos de ESTE equipo (vista previa). */
function digestLocalCompute() {
    return digestCompute({
        vehicles: (typeof db !== 'undefined' && db && db.vehicles) || [],
        planFor: (typeof tpWeekPlanFor === 'function') ? tpWeekPlanFor : null,
        statusLabels: (typeof CONFIG !== 'undefined' && CONFIG.statusLabels) || {},
        settings: _digestUi.settings || {}
    }, new Date().toISOString());
}

function digestPreviewOpen() {
    var d = digestLocalCompute();
    var html = digestEmailHTML(d);
    var body = '<div style="font-size:var(--fs-sm);color:var(--muted);margin-bottom:var(--space-sm);">' +
        '<b>Asunto:</b> ' + _digestEsc(digestSubject(d)) + '<br>Con los datos de este equipo. El correo real sale con los de la nube.</div>' +
        '<iframe title="Vista previa del resumen" style="width:100%;height:60vh;border:1px solid var(--border);border-radius:var(--radius-md);background:#fff;"' +
        ' srcdoc="' + _digestEsc(html) + '"></iframe>';
    if (typeof showModal === 'function') showModal({ title: '📬 Vista previa del resumen', body: body, buttons: [{ label: 'Cerrar' }] });
}

function _digestPushSupported() {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function _digestIsIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent || ''); }
function _digestStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}

/** Por qué no se pueden activar los avisos en este equipo ('' = sí se puede). */
function digestPushWhyNot() {
    if (_digestIsIOS() && !_digestStandalone()) {
        return 'En iPhone primero instala la app: Compartir → "Agregar a inicio", y ábrela desde ese ícono.';
    }
    if (!_digestPushSupported()) return 'Este navegador no admite avisos. Usa Chrome, Edge o la app instalada.';
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return 'Los avisos solo funcionan con la app publicada (https).';
    if (Notification.permission === 'denied') return 'Los avisos están bloqueados para este sitio. Permítelos en los ajustes del navegador.';
    var s = _digestUi.settings;
    if (!s || !s.vapidPublic) return 'El envío todavía no está configurado: falta la primera corrida del aviso (ver README → Avisos).';
    return '';
}

function _digestB64ToU8(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

function _digestSubId(endpoint) {
    var s = String(endpoint || ''), h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return 'p' + (h >>> 0).toString(36) + s.length.toString(36);
}

function _digestCurrentSub() {
    if (!_digestPushSupported()) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function(reg) {
        return reg ? reg.pushManager.getSubscription() : null;
    }).catch(function() { return null; });
}

function digestPushEnable() {
    var why = digestPushWhyNot();
    if (why) { showToast(why, 'warning'); return; }
    Notification.requestPermission().then(function(perm) {
        if (perm !== 'granted') { showToast('Sin permiso no se pueden mostrar avisos en este teléfono.', 'warning'); return null; }
        return navigator.serviceWorker.ready.then(function(reg) {
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _digestB64ToU8(_digestUi.settings.vapidPublic) });
        });
    }).then(function(sub) {
        if (!sub) return;
        var j = sub.toJSON();
        var u = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
        var doc = {
            endpoint: j.endpoint, p256dh: (j.keys && j.keys.p256dh) || '', auth: (j.keys && j.keys.auth) || '',
            device: (typeof FB_DEVICE_ID !== 'undefined') ? FB_DEVICE_ID : '',
            operatorId: u ? String(u.id || '') : '', operatorName: u ? (u.name || '') : '', role: u ? (u.role || '') : '',
            daily: true, createdAt: new Date().toISOString(), ua: String(navigator.userAgent || '').slice(0, 160)
        };
        return fbPushSubSave(_digestSubId(j.endpoint), doc).then(function() {
            if (typeof auditLog === 'function') auditLog('panel', 'avisos_activados', { type: 'device', label: doc.device }, doc.operatorName);
            showToast('Avisos activados en este teléfono.', 'success');
            digestPanelRender();
        });
    }).catch(function(err) {
        showToast('No se pudieron activar los avisos: ' + ((err && err.message) || err) + '. Revisa la conexión e inténtalo de nuevo.', 'error');
    });
}

function digestPushDisable() {
    _digestCurrentSub().then(function(sub) {
        if (!sub) { digestPanelRender(); return; }
        var id = _digestSubId(sub.endpoint);
        return sub.unsubscribe().then(function() { return fbPushSubDelete(id); }).then(function() {
            showToast('Avisos desactivados en este teléfono.', 'info');
            digestPanelRender();
        });
    }).catch(function(err) {
        showToast('No se pudieron desactivar: ' + ((err && err.message) || err), 'error');
    });
}

/** Una notificación local de prueba (no pasa por el servidor). */
function digestPushTest() {
    navigator.serviceWorker.ready.then(function(reg) {
        var t = digestPushText(digestLocalCompute());
        return reg.showNotification(t.title, { body: t.body, data: { url: location.href }, tag: 'emlab-prueba' });
    }).catch(function(err) { showToast('No se pudo mostrar: ' + ((err && err.message) || err), 'error'); });
}

function digestSettingsSave() {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'cambiar los avisos del laboratorio')) return;
    var get = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var bad = digestInvalidEmails(get('dg-to'));
    if (bad.length) return uiInvalid(document.getElementById('dg-to'), 'No es un correo: ' + bad.join(', '));
    bad = digestInvalidEmails(get('dg-esc'));
    if (bad.length) return uiInvalid(document.getElementById('dg-esc'), 'No es un correo: ' + bad.join(', '));
    var days = parseInt(get('dg-days'), 10);
    if (isNaN(days) || days < 1 || days > 90) return uiInvalid(document.getElementById('dg-days'), 'Escribe un número de días entre 1 y 90.');
    var topic = String(get('dg-ntfy')).trim();
    if (topic && !/^[A-Za-z0-9_-]{8,64}$/.test(topic)) {
        return uiInvalid(document.getElementById('dg-ntfy'), 'Solo letras, números, - y _, de 8 a 64 caracteres. Usa un nombre difícil de adivinar.');
    }
    var before = digestSettingsNormalize(_digestUi.settings);
    var next = {
        to: digestParseEmails(get('dg-to')), escalateTo: digestParseEmails(get('dg-esc')), escalateDays: days, ntfyTopic: topic,
        vapidPublic: before.vapidPublic,
        updatedAt: new Date().toISOString(), by: (typeof authGetCurrentUserName === 'function') ? authGetCurrentUserName('') : ''
    };
    fbDigestSaveSettings(next).then(function() {
        _digestUi.settings = next;
        if (typeof auditLog === 'function') {
            auditLog('panel', 'avisos_configurados', { type: 'settings', label: 'Avisos del laboratorio' }, '', {
                before: { to: before.to.join(', '), escalateTo: before.escalateTo.join(', '), escalateDays: before.escalateDays, ntfyTopic: before.ntfyTopic },
                after: { to: next.to.join(', '), escalateTo: next.escalateTo.join(', '), escalateDays: next.escalateDays, ntfyTopic: next.ntfyTopic }
            });
        }
        showToast('Avisos guardados para todo el laboratorio.', 'success');
        digestPanelRender();
    }).catch(function(err) {
        showToast('No se guardó: ' + ((err && err.message) || err) + '. Revisa la conexión a la nube e inténtalo de nuevo.', 'error');
    });
}

/**
 * Pinta la tarjeta (Datos → Sistema). `opts.refresh` (al entrar a la pestaña) vuelve a pedir
 * los ajustes a la nube; los repintados internos NO piden nada — si no, un fallo de lectura
 * se volvía un ciclo sin fin de leer → fallar → repintar → leer.
 */
function digestPanelRender(opts) {
    var host = document.getElementById('pn-digest-card');
    if (!host) return;
    if (opts && opts.refresh && !_digestUi.loading && typeof fbDigestGetSettings === 'function') {
        _digestUi.loading = true;
        _digestUi.loadError = false;
        fbDigestGetSettings().then(function(s) { _digestUi.settings = s || {}; })
            .catch(function() { _digestUi.loadError = true; })
            .then(function() { _digestUi.loading = false; digestPanelRender(); });
    }
    var s = digestSettingsNormalize(_digestUi.settings);
    var canEdit = typeof authCan === 'function' ? authCan('users.manage') : true;
    var dis = canEdit ? '' : ' disabled';
    var h = '';
    if (_digestUi.loading) h += '<div class="u-muted" style="font-size:var(--fs-xs);">Leyendo los ajustes de la nube…</div>';
    if (_digestUi.loadError) h += '<div style="font-size:var(--fs-xs);color:var(--warn-text);">No se pudieron leer los ajustes de la nube. Conecta este equipo y vuelve a abrir esta pestaña.</div>';
    h += '<p style="font-size:var(--fs-sm);color:var(--text);margin:0 0 var(--space-sm) 0;">De lunes a viernes a las 7:00 llega un resumen de los vehículos activos, ' +
        'con escalación de los que llevan más de ' + s.escalateDays + ' días sin aprobar. Jueves y viernes también dice si falta el plan de la semana siguiente, ' +
        'y cuando alguien acepta un plan llega un aviso con sus pruebas por día.</p>';
    h += '<div class="form-group"><label for="dg-to">Destinatarios del resumen</label>' +
        '<textarea id="dg-to" rows="2" placeholder="Ej.: laboratorio@kia.com, ana@kia.com"' + dis + '>' + _digestEsc(s.to.join(', ')) + '</textarea></div>';
    h += '<div class="form-group"><label for="dg-esc">Escalación (en copia solo mientras haya vehículos escalados)</label>' +
        '<textarea id="dg-esc" rows="2" placeholder="Ej.: jefe@kia.com"' + dis + '>' + _digestEsc(s.escalateTo.join(', ')) + '</textarea></div>';
    h += '<div style="display:flex;gap:var(--space-md);flex-wrap:wrap;">' +
        '<div class="form-group" style="flex:0 1 160px;"><label for="dg-days">Escalar después de (días)</label>' +
        '<input id="dg-days" type="number" min="1" max="90" inputmode="numeric" value="' + s.escalateDays + '"' + dis + '></div>' +
        '<div class="form-group" style="flex:1 1 220px;"><label for="dg-ntfy">Tema de ntfy (avisos al teléfono)</label>' +
        '<input id="dg-ntfy" type="text" autocomplete="off" placeholder="Ej.: emlab-kia-7f3k2q" value="' + _digestEsc(s.ntfyTopic) + '"' + dis + '></div></div>';
    h += '<div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-top:var(--space-xs);">' +
        '<button type="button" class="btn btn-primary" id="dg-save" onclick="digestSettingsSave()">Guardar</button>' +
        '<button type="button" class="btn" onclick="digestPreviewOpen()">👁 Vista previa del resumen</button></div>';
    if (s.updatedAt) {
        h += '<div class="u-muted" style="font-size:var(--fs-xs);margin-top:var(--space-xs);">Últimos cambios: ' +
            _digestEsc(s.by || '—') + ', ' + _digestEsc(_digestWhenLabel(s.updatedAt, new Date().toISOString())) + '.</div>';
    }
    if (s.ntfyTopic) {
        h += '<div style="font-size:var(--fs-sm);margin-top:var(--space-sm);">📲 En la app <b>ntfy</b> (Android o iPhone) toca + y suscríbete al tema ' +
            '<b>' + _digestEsc(s.ntfyTopic) + '</b>, o abre <a href="https://ntfy.sh/' + _digestEsc(s.ntfyTopic) + '" target="_blank" rel="noopener">ntfy.sh/' + _digestEsc(s.ntfyTopic) + '</a>.</div>';
    }
    // Avisos de la propia app en este teléfono
    h += '<div style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--border);">' +
        '<div style="font-weight:700;font-size:var(--fs-sm);">🔔 Avisos en este teléfono</div>' +
        '<div id="dg-push-row" style="display:flex;gap:var(--space-sm);flex-wrap:wrap;align-items:center;margin-top:var(--space-xs);">' +
        '<span class="u-muted" style="font-size:var(--fs-sm);">Revisando…</span></div></div>';
    host.innerHTML = h;
    if (!canEdit && typeof uiExplainDisabled === 'function') {
        uiExplainDisabled(document.getElementById('dg-save'), 'Solo quien administra usuarios y roles cambia los avisos del laboratorio.');
    }
    _digestPaintPushRow();
    if (typeof cascadeInjectTooltipsDeferred === 'function') cascadeInjectTooltipsDeferred();
}

function _digestPaintPushRow() {
    var row = document.getElementById('dg-push-row');
    if (!row) return;
    var why = digestPushWhyNot();
    _digestCurrentSub().then(function(sub) {
        var r = document.getElementById('dg-push-row');
        if (!r) return;
        var h = '';
        if (sub) {
            h += '<span style="font-size:var(--fs-sm);color:var(--ok-text);">✅ Activados: aquí llega el resumen y el aviso de plan aceptado.</span>' +
                '<button type="button" class="btn" onclick="digestPushTest()">Probar</button>' +
                '<button type="button" class="btn" onclick="digestPushDisable()">Desactivar</button>';
        } else {
            h += '<button type="button" class="btn btn-primary" id="dg-push-on" onclick="digestPushEnable()">Activar avisos aquí</button>' +
                '<span class="u-muted" style="font-size:var(--fs-xs);">Cada teléfono se activa por su cuenta.</span>';
        }
        r.innerHTML = h;
        if (!sub && typeof uiExplainDisabled === 'function') uiExplainDisabled(document.getElementById('dg-push-on'), why);
    });
}

if (typeof CASCADE_TOOLTIPS !== 'undefined') {
    Object.assign(CASCADE_TOOLTIPS, {
        'dg-to': { title: 'Destinatarios del resumen', text: 'Correos que reciben el resumen diario (lunes a viernes, 7:00) y el aviso de plan aceptado. Sepáralos con comas. Puede ser una lista de distribución.' },
        'dg-esc': { title: 'Escalación', text: 'Correos que se agregan EN COPIA solo los días en que hay vehículos con más días de los indicados desde su alta sin aprobar. Dejan de recibirlo cuando esos vehículos se aprueban.' },
        'dg-days': { title: 'Escalar después de', text: 'Días naturales desde el alta (incluye fin de semana). Con 7, un vehículo se escala a partir del día 8 sin aprobar.' },
        'dg-ntfy': { title: 'Tema de ntfy', text: 'Nombre del canal en la app gratuita ntfy. Quien se suscriba a ese tema recibe la notificación del resumen. Usa un nombre difícil de adivinar: cualquiera que lo conozca puede leerlo (solo trae conteos, nunca VINs completos ni valores).' },
        'pn_digest': { title: 'Avisos del laboratorio', text: 'Resumen diario por correo y al teléfono, escalación a un jefe de los vehículos atorados y aviso cuando se acepta el plan de una semana. Lo envía un proceso automático en la nube con los datos sincronizados.' }
    });
}
