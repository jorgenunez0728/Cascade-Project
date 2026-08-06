// ╔══════════════════════════════════════════════════════════════════════╗
// ║  PROYECTOS — seguimiento general de iniciativas (módulo propio)      ║
// ║                                                                      ║
// ║  v16.6: nació dentro de panel.js.                                    ║
// ║  v16.8: extraído a su propio archivo (la convención del proyecto es   ║
// ║  un módulo = un archivo) al sumarle importador de Excel, Kanban,      ║
// ║  Carga por responsable, Curva S, Portafolio, hitos, línea base y      ║
// ║  ruta crítica.                                                        ║
// ║                                                                      ║
// ║  NO es solo mantenimiento: reparaciones, proyectos de inversión o     ║
// ║  cualquier iniciativa con pasos, responsables y fechas.               ║
// ║                                                                      ║
// ║  Estado: pnState.projects[] (vive en panel.js / kia_panel_v1, se      ║
// ║  guarda con pnSave() y se sincroniza en la colección `panel`).        ║
// ║  steps[] son las filas capturadas (tabla tipo Loop); log[] son notas  ║
// ║  libres. La línea de tiempo NUNCA se guarda — se deriva mezclando     ║
// ║  log[] con los cambios de estado de los pasos (pnProjectTimeline),    ║
// ║  igual que v.timeline/g.timeline en otros módulos.                    ║
// ║                                                                      ║
// ║  Carga DESPUÉS de panel.js (usa pnState/pnSave/pnRender) — ver el      ║
// ║  orden en index.html y build.sh.                                      ║
// ╚══════════════════════════════════════════════════════════════════════╝


var PN_PROJECT_STATUS = { activo: 'Activo', pausado: 'Pausado', cerrado: 'Cerrado' };
var PN_STEP_STATUS = { pendiente: 'Pendiente', encurso: 'En curso', completado: 'Completado', bloqueado: 'Bloqueado' };

// tabCacheSwitch solo vuelve a llamar al renderFn si dirty[tab] está marcado —
// sin invalidar explícitamente, navegar dentro de la MISMA pestaña (retícula →
// detalle, cambiar de vista) se quedaría mostrando el HTML viejo.
function _pnProjNav() {
    tabCacheInvalidate('pn', 'pn-projects');
    pnRender();
}

// ── Derivadas — una sola definición cada una ──
function pnProjectProgress(p) {
    var steps = p.steps || [];
    var total = steps.length;
    var done = steps.filter(function(s) { return s.status === 'completado'; }).length;
    var pct = total > 0 ? Math.round(done / total * 100) : 0;
    var today = localToday();
    var overdueN = steps.filter(function(s) { return s.status !== 'completado' && s.targetDate && s.targetDate < today; }).length;
    var blockedN = steps.filter(function(s) { return s.status === 'bloqueado'; }).length;
    var pending = steps.filter(function(s) { return s.status !== 'completado'; }).slice()
        .sort(function(a, b) { return (a.targetDate || '9999-99-99').localeCompare(b.targetDate || '9999-99-99'); });
    return { done: done, total: total, pct: pct, nextStep: pending[0] || null, overdueN: overdueN, blockedN: blockedN };
}

function pnProjectTimeline(p) {
    var events = [];
    (p.log || []).forEach(function(l) {
        events.push({ at: l.at, kind: 'note', text: l.text, by: l.by, id: 'log_' + l.id });
    });
    (p.steps || []).forEach(function(s) {
        events.push({ at: s.createdAt || (s.targetDate ? s.targetDate + 'T00:00:00' : new Date().toISOString()), kind: 'created', text: 'Paso agregado: ' + s.title, by: s.responsible, id: 'st_' + s.id + '_c' });
        if (s.status === 'completado' && s.doneDate) {
            events.push({ at: s.doneDate + 'T12:00:00', kind: 'done', text: 'Completado: ' + s.title, by: s.responsible, id: 'st_' + s.id + '_d' });
        }
        if (s.status === 'bloqueado' && s.roadblock) {
            events.push({ at: s.updatedAt || s.createdAt || new Date().toISOString(), kind: 'blocked', text: 'Bloqueado: ' + s.title + ' — ' + s.roadblock, by: s.responsible, id: 'st_' + s.id + '_b' });
        }
    });
    events.sort(function(a, b) { return (b.at || '').localeCompare(a.at || ''); });
    return events;
}

function pnProjectsOverdueSteps() {
    var today = localToday();
    var result = [];
    (pnState.projects || []).forEach(function(p) {
        if (p.archived || p.status !== 'activo') return;
        (p.steps || []).forEach(function(s) {
            if (s.status === 'completado') return;
            var overdue = !!(s.targetDate && s.targetDate < today);
            var blocked = s.status === 'bloqueado';
            if (overdue || blocked) result.push({ project: p, step: s, overdue: overdue, blocked: blocked });
        });
    });
    return result;
}

function pnProjectsDueThisWeek() {
    var today = localToday();
    var in7 = new Date(); in7.setDate(in7.getDate() + 7);
    var in7Str = localDateStr(in7);
    var result = [];
    (pnState.projects || []).forEach(function(p) {
        if (p.archived || p.status !== 'activo') return;
        (p.steps || []).forEach(function(s) {
            if (s.status === 'completado' || s.status === 'bloqueado') return;
            if (s.targetDate && s.targetDate >= today && s.targetDate <= in7Str) result.push({ project: p, step: s });
        });
    });
    return result;
}

function pnProjectMilestones(year, month) {
    var events = [];
    var monthStart = new Date(year, month, 1);
    var monthEnd = new Date(year, month + 1, 0);
    var today = localToday();
    (pnState.projects || []).forEach(function(p) {
        if (p.archived) return;
        (p.steps || []).forEach(function(s) {
            if (!s.targetDate) return;
            var d = new Date(s.targetDate + 'T00:00:00');
            if (d < monthStart || d > monthEnd) return;
            var isPast = s.status !== 'completado' && s.targetDate < today;
            var color = s.status === 'completado' ? '#10b981' : (s.status === 'bloqueado' || isPast) ? '#ef4444' : '#8b5cf6';
            var icon = s.status === 'completado' ? '✓ ' : isPast ? '⚠ ' : '🗂️ ';
            events.push({ date: s.targetDate, type: 'project_step', color: color, label: icon + p.name + ': ' + s.title, module: 'Proyectos' });
        });
    });
    return events;
}

// Proyecto activo ligado a un equipo del F11 — para el banner en Mantenimiento.
function pnActiveProjectForAsset(assetId) {
    if (!assetId) return null;
    return (pnState.projects || []).find(function(p) { return p.assetId === assetId && p.status === 'activo' && !p.archived; }) || null;
}

function pnProjectStepDone(projectId, stepId) {
    var p = (pnState.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    var s = (p.steps || []).find(function(x) { return x.id === stepId; });
    if (!s) return;
    s.status = 'completado';
    s.doneDate = localToday();
    s.updatedAt = new Date().toISOString();
    p.updatedAt = new Date().toISOString();
    pnSave();
    if (typeof auditLog === 'function') auditLog('panel', 'proyecto_paso_completado', { type: 'project', id: projectId, label: p.name }, s.title);
    if (typeof showToast === 'function') showToast('Paso completado', 'success');
    _pnProjNav();
}

// ── UI ──
function pnRenderProjects(el) {
    var selId = window._pnSelectedProject;
    var p = selId ? (pnState.projects || []).find(function(x) { return x.id === selId; }) : null;
    if (p) { _pnRenderProjectDetail(el, p); return; }
    _pnRenderProjectGrid(el);
}

function _pnRenderProjectGrid(el) {
    var showArchived = !!window._pnProjShowArchived;
    var projects = (pnState.projects || []).filter(function(p) { return showArchived ? true : !p.archived; });
    var html = '<div class="tp-card"><div class="tp-card-title" data-help="pn-projects-help"><span>🗂️ Proyectos (' + projects.length + ')</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnAddProject()" style="font-size:10px;">+ Proyecto</button></div>';
    html += '<div style="font-size:11px;color:var(--tp-dim);margin-bottom:8px;">Da seguimiento a reparaciones, proyectos de inversión o cualquier iniciativa: pasos, fechas, responsables y una línea de tiempo con lo que va pasando.</div>';
    if (projects.length === 0) {
        html += '<div style="text-align:center;padding:24px;color:var(--tp-dim);">Sin proyectos todavía.</div>';
    }
    html += '</div>';
    if (projects.length > 0) {
        html += '<div class="pn-proj-grid">';
        projects.forEach(function(p) {
            var prog = pnProjectProgress(p);
            var asset = (p.assetId && typeof invState !== 'undefined') ? (invState.assets || []).find(function(a) { return a.id === p.assetId; }) : null;
            var tone = prog.overdueN > 0 ? 'danger' : prog.blockedN > 0 ? 'warn' : 'ok';
            html += '<div class="pn-proj-card pn-proj-card--' + tone + (p.archived ? ' pn-proj-card--archived' : '') + '" onclick="window._pnSelectedProject=\'' + p.id + '\';window._pnProjectView=\'table\';_pnProjNav();">';
            html += '<div class="pn-proj-card-header"><span>' + escapeHtml(p.name) + '</span><span class="pn-proj-status pn-proj-status--' + p.status + '">' + (PN_PROJECT_STATUS[p.status] || p.status) + '</span></div>';
            if (asset) html += '<div class="pn-proj-card-asset">🔧 ' + escapeHtml(asset.name) + '</div>';
            html += '<div class="tp-bar" style="margin:6px 0;"><div class="tp-bar-fill" style="width:' + prog.pct + '%;background:' + (prog.pct === 100 ? 'var(--tp-green)' : 'var(--tp-blue)') + ';"></div><span class="tp-bar-text">' + prog.pct + '%</span></div>';
            html += '<div class="pn-proj-card-meta">' + prog.done + '/' + prog.total + ' pasos';
            if (prog.nextStep) html += ' · próximo: ' + escapeHtml(prog.nextStep.title) + (prog.nextStep.targetDate ? ' (' + prog.nextStep.targetDate + ')' : '');
            html += '</div>';
            if (prog.overdueN > 0 || prog.blockedN > 0) {
                html += '<div class="pn-proj-card-flags">';
                if (prog.overdueN > 0) html += '<span class="dash-chip dash-chip--atrasado">' + prog.overdueN + ' vencido' + (prog.overdueN > 1 ? 's' : '') + '</span>';
                if (prog.blockedN > 0) html += '<span class="dash-chip dash-chip--atrasado">🚧 ' + prog.blockedN + ' bloqueado' + (prog.blockedN > 1 ? 's' : '') + '</span>';
                html += '</div>';
            }
            html += '</div>';
        });
        html += '</div>';
    }
    html += '<div style="text-align:center;margin-top:10px;"><label style="font-size:10px;color:var(--tp-dim);cursor:pointer;"><input type="checkbox" ' + (showArchived ? 'checked' : '') + ' onchange="window._pnProjShowArchived=this.checked;_pnProjNav();" style="vertical-align:middle;"> Mostrar cerrados/archivados</label></div>';
    el.innerHTML = html;
}

function _pnRenderProjectDetail(el, p) {
    var prog = pnProjectProgress(p);
    var view = window._pnProjectView || 'table';
    var asset = (p.assetId && typeof invState !== 'undefined') ? (invState.assets || []).find(function(a) { return a.id === p.assetId; }) : null;

    var html = '<div class="tp-card">';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">';
    html += '<button class="tp-btn tp-btn-ghost" onclick="window._pnSelectedProject=null;_pnProjNav();" style="font-size:11px;">← Proyectos</button>';
    html += '<span style="font-weight:800;font-size:14px;flex:1;">' + escapeHtml(p.name) + '</span>';
    html += '<span class="pn-proj-status pn-proj-status--' + p.status + '">' + (PN_PROJECT_STATUS[p.status] || p.status) + '</span>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnAddProject(\'' + p.id + '\')" style="font-size:10px;">✏️ Editar</button>';
    html += '</div>';
    if (p.desc) html += '<div style="font-size:11px;color:var(--tp-dim);margin-bottom:8px;">' + escapeHtml(p.desc) + '</div>';
    var metaBits = [];
    if (asset) metaBits.push('🔧 ' + escapeHtml(asset.name));
    if (p.owner) metaBits.push('👤 ' + escapeHtml(p.owner));
    if (metaBits.length) html += '<div style="font-size:11px;margin-bottom:8px;">' + metaBits.join(' · ') + '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:6px;margin-bottom:10px;">';
    html += '<div class="tp-metric"><div class="tp-metric-val">' + prog.done + '/' + prog.total + '</div><div class="tp-metric-label">Pasos</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (prog.pct === 100 ? '#10b981' : '#3b82f6') + '">' + prog.pct + '%</div><div class="tp-metric-label">Avance</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (prog.overdueN > 0 ? '#ef4444' : '#10b981') + '">' + prog.overdueN + '</div><div class="tp-metric-label">Vencidos</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (prog.blockedN > 0 ? '#ef4444' : '#10b981') + '">' + prog.blockedN + '</div><div class="tp-metric-label">Bloqueados</div></div>';
    html += '</div>';

    html += '<div class="pn-proj-viewtabs">';
    [['table', '📋 Tabla'], ['timeline', '🕒 Línea de tiempo'], ['gantt', '📊 Gantt']].forEach(function(v) {
        html += '<button class="pn-proj-viewtab' + (view === v[0] ? ' active' : '') + '" onclick="window._pnProjectView=\'' + v[0] + '\';_pnProjNav();">' + v[1] + '</button>';
    });
    html += '</div>';

    if (view === 'timeline') html += _pnProjectTimelineHTML(p);
    else if (view === 'gantt') html += _pnProjectGanttHTML(p);
    else html += _pnProjectTableHTML(p);

    html += '</div>';
    el.innerHTML = html;
}

function _pnProjectTableHTML(p) {
    var steps = (p.steps || []).slice().sort(function(a, b) { return (a.seq || 0) - (b.seq || 0); });
    var today = localToday();
    var html = '<div style="overflow-x:auto;"><table class="pn-proj-table"><thead><tr>' +
        '<th>Paso</th><th>Responsable</th><th>Estatus</th><th>Fecha objetivo</th><th>Cumplimiento</th><th>Obstáculo</th><th></th>' +
        '</tr></thead><tbody>';
    if (steps.length === 0) {
        html += '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--tp-dim);">Sin pasos todavía.</td></tr>';
    }
    steps.forEach(function(s) {
        var isOverdue = s.status !== 'completado' && s.targetDate && s.targetDate < today;
        html += '<tr class="' + (s.status === 'completado' ? 'pn-proj-row--done' : '') + (isOverdue ? ' pn-proj-row--overdue' : '') + '">';
        html += '<td>' + escapeHtml(s.title) + (s.phase ? '<div style="font-size:9px;color:var(--tp-dim);">' + escapeHtml(s.phase) + '</div>' : '') + '</td>';
        html += '<td>' + escapeHtml(s.responsible || '—') + '</td>';
        html += '<td><span class="pn-proj-step-status pn-proj-step-status--' + s.status + '">' + (PN_STEP_STATUS[s.status] || s.status) + '</span></td>';
        html += '<td>' + (s.targetDate || '—') + '</td>';
        html += '<td>' + (s.doneDate || '—') + '</td>';
        html += '<td>' + escapeHtml(s.roadblock || '') + '</td>';
        html += '<td style="white-space:nowrap;">';
        if (s.status !== 'completado') html += '<button class="tp-btn tp-btn-ghost" onclick="pnProjectStepDone(\'' + p.id + '\',\'' + s.id + '\');" title="Marcar completado" style="font-size:10px;">✔</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="pnAddProjectStep(\'' + p.id + '\',\'' + s.id + '\');" title="Editar" style="font-size:10px;">✏️</button>';
        html += '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnAddProjectStep(\'' + p.id + '\');" style="font-size:11px;">+ Paso</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnExportProjectCSV(\'' + p.id + '\')" style="font-size:11px;">📤 Exportar CSV</button>';
    html += '</div>';
    return html;
}

function _pnProjectTimelineHTML(p) {
    var events = pnProjectTimeline(p);
    var html = '<div class="pn-proj-timeline">';
    html += '<div style="display:flex;gap:6px;margin-bottom:12px;">';
    html += '<input type="text" id="pn-proj-note-input" placeholder="Agregar una nota…" style="flex:1;padding:8px 10px;border:1px solid var(--tp-border);border-radius:8px;font-size:12px;" onkeydown="if(event.key===\'Enter\'){pnAddProjectLog(\'' + p.id + '\');}">';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnAddProjectLog(\'' + p.id + '\')" style="font-size:11px;">Agregar</button>';
    html += '</div>';
    if (events.length === 0) {
        html += '<div style="text-align:center;padding:16px;color:var(--tp-dim);font-size:11px;">Sin eventos todavía — agrega una nota o un paso.</div>';
    }
    events.forEach(function(ev) {
        var icon = ev.kind === 'done' ? '✅' : ev.kind === 'blocked' ? '🚧' : ev.kind === 'created' ? '➕' : '📝';
        html += '<div class="pn-proj-timeline-item">';
        html += '<div class="pn-proj-timeline-dot">' + icon + '</div>';
        html += '<div class="pn-proj-timeline-content">';
        html += '<div class="pn-proj-timeline-text">' + escapeHtml(ev.text) + '</div>';
        html += '<div class="pn-proj-timeline-meta">' + (ev.by ? escapeHtml(ev.by) + ' · ' : '') + (ev.at ? String(ev.at).slice(0, 16).replace('T', ' ') : '') + '</div>';
        html += '</div></div>';
    });
    html += '</div>';
    return html;
}

function _pnProjectGanttHTML(p) {
    var steps = (p.steps || []).slice().sort(function(a, b) { return (a.seq || 0) - (b.seq || 0); });
    if (steps.length === 0) return '<div style="text-align:center;padding:20px;color:var(--tp-dim);font-size:11px;">Sin pasos. Agrega uno en la pestaña Tabla.</div>';

    var dates = [];
    steps.forEach(function(s) {
        if (s.createdAt) dates.push(s.createdAt.slice(0, 10));
        if (s.targetDate) dates.push(s.targetDate);
        if (s.doneDate) dates.push(s.doneDate);
    });
    if (dates.length === 0) return '<div style="text-align:center;padding:20px;color:var(--tp-dim);font-size:11px;">Sin fechas capturadas todavía.</div>';
    dates.sort();
    var minD = new Date(dates[0] + 'T00:00:00');
    var maxD = new Date(dates[dates.length - 1] + 'T00:00:00');
    var todayD = new Date(localToday() + 'T00:00:00');
    if (todayD > maxD) maxD = todayD;

    function monday(d) { var wd = (d.getDay() + 6) % 7; var m = new Date(d); m.setDate(d.getDate() - wd); return m; }
    var startW = monday(minD);
    var endW = monday(maxD);
    var nWeeks = Math.max(1, Math.round((endW - startW) / (7 * 86400000)) + 1);
    nWeeks = Math.min(nWeeks, 60);

    var html = '<div style="overflow-x:auto;"><table class="pn-proj-gantt" style="border-collapse:collapse;font-size:9px;min-width:' + (160 + nWeeks * 26) + 'px;">';
    html += '<tr><td class="pn-proj-gantt-label"></td>';
    var w;
    for (w = 0; w < nWeeks; w++) {
        var wd = new Date(startW); wd.setDate(startW.getDate() + w * 7);
        html += '<td class="pn-proj-gantt-head">' + (wd.getMonth() + 1) + '/' + wd.getDate() + '</td>';
    }
    html += '</tr>';
    steps.forEach(function(s) {
        var sStart = s.createdAt ? new Date(s.createdAt.slice(0, 10) + 'T00:00:00') : (s.targetDate ? new Date(s.targetDate + 'T00:00:00') : minD);
        var sEnd = s.doneDate ? new Date(s.doneDate + 'T00:00:00') : (s.targetDate ? new Date(s.targetDate + 'T00:00:00') : todayD);
        if (sEnd < sStart) sEnd = sStart;
        var startIdx = Math.max(0, Math.min(nWeeks - 1, Math.round((monday(sStart) - startW) / (7 * 86400000))));
        var endIdx = Math.max(startIdx, Math.min(nWeeks - 1, Math.round((monday(sEnd) - startW) / (7 * 86400000))));
        var span = endIdx - startIdx + 1;
        var color = s.status === 'completado' ? '#10b981' : s.status === 'bloqueado' ? '#ef4444' : s.status === 'encurso' ? '#3b82f6' : '#94a3b8';
        html += '<tr><td class="pn-proj-gantt-label" title="' + escapeHtml(s.title) + '">' + escapeHtml(s.title) + '</td>';
        var w2;
        for (w2 = 0; w2 < nWeeks; w2++) {
            if (w2 < startIdx || w2 > endIdx) { html += '<td class="pn-proj-gantt-cell"></td>'; continue; }
            if (w2 === startIdx) {
                html += '<td class="pn-proj-gantt-cell" colspan="' + span + '"><div class="pn-proj-gantt-bar" style="background:' + color + ';" title="' + escapeHtml(s.title) + (s.targetDate ? ' (' + s.targetDate + ')' : '') + '"></div></td>';
                w2 = endIdx;
            }
        }
        html += '</tr>';
    });
    html += '</table></div>';
    html += '<div style="display:flex;gap:12px;margin-top:8px;font-size:9px;color:var(--tp-dim);flex-wrap:wrap;">';
    [['Pendiente', '#94a3b8'], ['En curso', '#3b82f6'], ['Completado', '#10b981'], ['Bloqueado', '#ef4444']].forEach(function(l) {
        html += '<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:' + l[1] + ';display:inline-block;"></span>' + l[0] + '</span>';
    });
    html += '</div>';
    return html;
}

// ── CRUD: Proyecto ──
function pnAddProject(editId) {
    var p = editId ? (pnState.projects || []).find(function(x) { return x.id === editId; }) : null;
    var isEdit = !!p;
    var assets = (typeof invState !== 'undefined' && invState.assets) ? invState.assets : [];
    var assetOpts = '<option value="">— sin equipo —</option>' + assets.map(function(a) {
        return '<option value="' + a.id + '" ' + (p && p.assetId === a.id ? 'selected' : '') + '>' + escapeHtml(a.name) + '</option>';
    }).join('');
    var defaultOwner = (typeof authState !== 'undefined' && authState.currentUser && authState.currentUser.name) || '';
    var statusOpts = Object.keys(PN_PROJECT_STATUS).map(function(k) {
        return '<option value="' + k + '" ' + ((p ? p.status : 'activo') === k ? 'selected' : '') + '>' + PN_PROJECT_STATUS[k] + '</option>';
    }).join('');
    var fieldStyle = 'width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;';
    var lblStyle = 'font-size:11px;color:#475569;font-weight:600;';

    var msg = '<div style="display:flex;flex-direction:column;gap:10px;text-align:left;">' +
        '<div><label style="' + lblStyle + '">Nombre *</label><input id="pn-proj-name" value="' + escapeHtml(p ? p.name : '') + '" style="' + fieldStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Equipo (opcional)</label><select id="pn-proj-asset" style="' + fieldStyle + '">' + assetOpts + '</select></div>' +
        '<div><label style="' + lblStyle + '">Responsable</label><input id="pn-proj-owner" value="' + escapeHtml(p ? (p.owner || '') : defaultOwner) + '" style="' + fieldStyle + '"></div>' +
        '<details><summary style="cursor:pointer;font-size:11px;font-weight:700;color:#475569;padding:4px 0;">Más detalles (descripción, estatus)</summary>' +
        '<div style="display:flex;flex-direction:column;gap:10px;padding-top:8px;">' +
        '<div><label style="' + lblStyle + '">Descripción</label><input id="pn-proj-desc" value="' + escapeHtml(p ? (p.desc || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Estatus</label><select id="pn-proj-status" style="' + fieldStyle + '">' + statusOpts + '</select></div>' +
        '</div></details>' +
        (isEdit ? '<button type="button" onclick="pnDeleteProjectPrompt(\'' + editId + '\')" style="align-self:flex-start;background:none;border:none;color:#ef4444;font-size:11px;cursor:pointer;padding:2px 0;">🗑️ Eliminar proyecto</button>' : '') +
        '</div>';

    showModal({
        title: isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto',
        message: msg, type: 'info', confirmText: 'Guardar',
        onConfirm: function() {
            var name = (document.getElementById('pn-proj-name').value || '').trim();
            if (!name) { showToast('Nombre requerido', 'error'); return; }
            var assetId = document.getElementById('pn-proj-asset').value || '';
            var owner = (document.getElementById('pn-proj-owner').value || '').trim();
            var desc = (document.getElementById('pn-proj-desc').value || '').trim();
            var status = document.getElementById('pn-proj-status').value || 'activo';
            var now = new Date().toISOString();
            if (isEdit) {
                p.name = name; p.assetId = assetId; p.owner = owner; p.desc = desc; p.status = status;
                p.updatedAt = now;
                if (typeof auditLog === 'function') auditLog('panel', 'proyecto_modificado', { type: 'project', id: p.id, label: name }, '');
            } else {
                var np = { id: invGenId(), name: name, desc: desc, assetId: assetId, owner: owner, status: status, createdAt: now, updatedAt: now, archived: false, steps: [], log: [] };
                pnState.projects.push(np);
                if (typeof auditLog === 'function') auditLog('panel', 'proyecto_creado', { type: 'project', id: np.id, label: name }, '');
                window._pnSelectedProject = np.id;
            }
            pnSave();
            _pnProjNav();
        }
    });
}

function pnDeleteProjectPrompt(id) {
    var p = (pnState.projects || []).find(function(x) { return x.id === id; });
    if (!p) return;
    var ov = document.querySelector('.custom-modal-overlay'); if (ov) ov.remove();
    showConfirm('¿Eliminar el proyecto "' + p.name + '" y todos sus pasos/notas?', function() {
        pnState.projects = pnState.projects.filter(function(x) { return x.id !== id; });
        if (window._pnSelectedProject === id) window._pnSelectedProject = null;
        pnSave();
        if (typeof auditLog === 'function') auditLog('panel', 'proyecto_eliminado', { type: 'project', id: id, label: p.name }, '');
        showToast('Proyecto eliminado', 'success');
        _pnProjNav();
    }, { title: 'Eliminar proyecto', type: 'danger', confirmText: 'Eliminar' });
}

// ── CRUD: Paso ──
function pnAddProjectStep(projectId, stepId) {
    var p = (pnState.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    var s = stepId ? (p.steps || []).find(function(x) { return x.id === stepId; }) : null;
    var isEdit = !!s;
    var defaultResp = (typeof authState !== 'undefined' && authState.currentUser && authState.currentUser.name) || '';
    var statusOpts = Object.keys(PN_STEP_STATUS).map(function(k) {
        return '<option value="' + k + '" ' + ((s ? s.status : 'pendiente') === k ? 'selected' : '') + '>' + PN_STEP_STATUS[k] + '</option>';
    }).join('');
    var fieldStyle = 'width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;';
    var lblStyle = 'font-size:11px;color:#475569;font-weight:600;';

    var msg = '<div style="display:flex;flex-direction:column;gap:10px;text-align:left;">' +
        '<div><label style="' + lblStyle + '">Paso *</label><input id="pn-step-title" value="' + escapeHtml(s ? s.title : '') + '" style="' + fieldStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Responsable</label><input id="pn-step-resp" value="' + escapeHtml(s ? (s.responsible || '') : defaultResp) + '" style="' + fieldStyle + '"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div><label style="' + lblStyle + '">Estatus</label><select id="pn-step-status" style="' + fieldStyle + '">' + statusOpts + '</select></div>' +
        '<div><label style="' + lblStyle + '">Fecha objetivo</label><input type="date" id="pn-step-target" value="' + (s ? (s.targetDate || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '</div>' +
        '<details><summary style="cursor:pointer;font-size:11px;font-weight:700;color:#475569;padding:4px 0;">Más detalles (fase, obstáculo, fecha de cumplimiento)</summary>' +
        '<div style="display:flex;flex-direction:column;gap:10px;padding-top:8px;">' +
        '<div><label style="' + lblStyle + '" data-help="pn-proj-phase">Fase (para el Gantt)</label><input id="pn-step-phase" value="' + escapeHtml(s ? (s.phase || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Fecha de cumplimiento</label><input type="date" id="pn-step-done" value="' + (s ? (s.doneDate || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '<div><label style="' + lblStyle + '" data-help="pn-proj-roadblock">Obstáculo / comentario</label><input id="pn-step-roadblock" value="' + escapeHtml(s ? (s.roadblock || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '</div></details>' +
        (isEdit ? '<button type="button" onclick="pnDeleteProjectStepPrompt(\'' + projectId + '\',\'' + stepId + '\')" style="align-self:flex-start;background:none;border:none;color:#ef4444;font-size:11px;cursor:pointer;padding:2px 0;">🗑️ Eliminar paso</button>' : '') +
        '</div>';

    showModal({
        title: isEdit ? 'Editar Paso' : 'Nuevo Paso',
        message: msg, type: 'info', confirmText: 'Guardar',
        onConfirm: function() {
            var title = (document.getElementById('pn-step-title').value || '').trim();
            if (!title) { showToast('Título del paso requerido', 'error'); return; }
            var responsible = (document.getElementById('pn-step-resp').value || '').trim();
            var status = document.getElementById('pn-step-status').value || 'pendiente';
            var targetDate = document.getElementById('pn-step-target').value || '';
            var phase = (document.getElementById('pn-step-phase').value || '').trim();
            var doneDate = document.getElementById('pn-step-done').value || '';
            var roadblock = (document.getElementById('pn-step-roadblock').value || '').trim();
            var now = new Date().toISOString();
            if (status === 'completado' && !doneDate) doneDate = localToday();
            if (isEdit) {
                s.title = title; s.responsible = responsible; s.status = status; s.targetDate = targetDate;
                s.phase = phase; s.doneDate = doneDate; s.roadblock = roadblock; s.updatedAt = now;
            } else {
                p.steps = p.steps || [];
                var seq = p.steps.length + 1;
                p.steps.push({ id: invGenId(), seq: seq, title: title, responsible: responsible, status: status, targetDate: targetDate, doneDate: doneDate, roadblock: roadblock, phase: phase, createdAt: now, updatedAt: now });
            }
            p.updatedAt = now;
            pnSave();
            if (typeof auditLog === 'function') auditLog('panel', isEdit ? 'proyecto_paso_modificado' : 'proyecto_paso_creado', { type: 'project', id: p.id, label: p.name }, title);
            _pnProjNav();
        }
    });
}

function pnDeleteProjectStepPrompt(projectId, stepId) {
    var p = (pnState.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    var s = (p.steps || []).find(function(x) { return x.id === stepId; });
    var ov = document.querySelector('.custom-modal-overlay'); if (ov) ov.remove();
    showConfirm('¿Eliminar el paso "' + (s ? s.title : '') + '"?', function() {
        p.steps = (p.steps || []).filter(function(x) { return x.id !== stepId; });
        p.updatedAt = new Date().toISOString();
        pnSave();
        showToast('Paso eliminado', 'success');
        _pnProjNav();
    }, { title: 'Eliminar paso', type: 'danger', confirmText: 'Eliminar' });
}

// ── Notas libres (línea de tiempo) ──
function pnAddProjectLog(projectId) {
    var p = (pnState.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    var input = document.getElementById('pn-proj-note-input');
    var text = input ? (input.value || '').trim() : '';
    if (!text) { showToast('Escribe una nota', 'info'); return; }
    var by = (typeof authState !== 'undefined' && authState.currentUser && authState.currentUser.name) || 'Laboratorio';
    p.log = p.log || [];
    p.log.push({ id: invGenId(), at: new Date().toISOString(), by: by, text: text });
    p.updatedAt = new Date().toISOString();
    pnSave();
    if (typeof auditLog === 'function') auditLog('panel', 'proyecto_nota', { type: 'project', id: p.id, label: p.name }, text);
    _pnProjNav();
}

// ── Exportación ──
function _pnProjCsvEsc(v) {
    var s = String(v == null ? '' : v);
    return (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function pnExportProjectCSV(projectId) {
    var pid = projectId || window._pnSelectedProject;
    var p = (pnState.projects || []).find(function(x) { return x.id === pid; });
    if (!p) { showToast('Selecciona un proyecto primero', 'warning'); return; }
    var steps = (p.steps || []).slice().sort(function(a, b) { return (a.seq || 0) - (b.seq || 0); });
    var csv = 'Step,Responsible,Status,Target Date,Completion Date,Roadblock/Comments\n';
    steps.forEach(function(s) {
        csv += [s.title, s.responsible || '', PN_STEP_STATUS[s.status] || s.status, s.targetDate || '', s.doneDate || '', s.roadblock || ''].map(_pnProjCsvEsc).join(',') + '\n';
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'Proyecto_' + p.name.replace(/[^a-z0-9]+/gi, '_') + '_' + localToday() + '.csv';
    a.click();
    showToast('Exportado', 'success');
}
function pnExportAllProjectsCSV() {
    var projects = pnState.projects || [];
    if (projects.length === 0) { showToast('Sin proyectos para exportar', 'warning'); return; }
    var csv = 'Project,Step,Responsible,Status,Target Date,Completion Date,Roadblock/Comments\n';
    projects.forEach(function(p) {
        (p.steps || []).slice().sort(function(a, b) { return (a.seq || 0) - (b.seq || 0); }).forEach(function(s) {
            csv += [p.name, s.title, s.responsible || '', PN_STEP_STATUS[s.status] || s.status, s.targetDate || '', s.doneDate || '', s.roadblock || ''].map(_pnProjCsvEsc).join(',') + '\n';
        });
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'Proyectos_' + localToday() + '.csv';
    a.click();
    showToast('Exportado', 'success');
}

// ══════════════════════════════════════════════════
// v16.0: Ayuda — banner de pestaña y tooltips de campo
// (viven aquí, con el módulo; projects.js carga después de cop15.js,
//  que es donde se define CASCADE_TOOLTIPS)
// ══════════════════════════════════════════════════
if (typeof HELP_TABS !== 'undefined') Object.assign(HELP_TABS, {
    'pn-projects': { title: 'Proyectos', text: 'Seguimiento general de reparaciones, proyectos de inversión o cualquier iniciativa con pasos, responsables y fechas — no solo mantenimiento. Cada proyecto tiene una tabla de pasos, una línea de tiempo y un Gantt.', tips: [
        'Liga un proyecto a un equipo (ej. Dinamómetro) para que aparezca como banner en Consumibles → Mtto.',
        'La línea de tiempo mezcla tus notas libres con los cambios de estatus de los pasos, en orden.',
        'Un paso vencido o bloqueado aparece en HOY y en Alertas hasta que se resuelva.',
        'Exporta un proyecto a CSV con las mismas columnas que un tablero tipo Loop (Step/Responsible/Status/...).'
    ]}
});
if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'pn-projects-help': { title: 'Proyectos', text: 'Registra reparaciones, proyectos de inversión o cualquier iniciativa con pasos y fechas. La retícula muestra el avance de todos; entra a uno para ver su tabla, línea de tiempo y Gantt.' },
    'pn-proj-phase': { title: 'Fase', text: 'Etiqueta libre para agrupar pasos en el Gantt (ej. "Diagnóstico", "Refacciones", "Instalación"). Opcional — si la dejas vacía, el paso solo muestra su título.' },
    'pn-proj-roadblock': { title: 'Obstáculo / comentario', text: 'Qué está deteniendo este paso (ej. "esperando refacción de proveedor"). Si el paso está en estatus Bloqueado y tiene un obstáculo escrito, sale en Alertas hasta que se resuelva.' }
});
