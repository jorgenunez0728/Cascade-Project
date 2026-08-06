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
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnProjImportOpen()" style="font-size:10px;">📥 Importar Excel</button>';
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
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnProjImportOpen(\'' + p.id + '\')" style="font-size:11px;">📥 Importar Excel</button>';
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

// ══════════════════════════════════════════════════════════════════════
// IMPORTADOR (v16.8) — Excel / CSV / pegar, SIN formato obligatorio
// ══════════════════════════════════════════════════════════════════════
// No se exige una plantilla: lo único que se pide es una fila de
// encabezados. El importador la detecta, adivina qué columna es qué con un
// diccionario de sinónimos ES+EN, y muestra una vista previa donde
// cualquier columna se puede reasignar a mano antes de escribir nada.
//
// Tres entradas al mismo flujo:
//   📄 Archivo  .xlsx/.xls (SheetJS con carga diferida) y .csv (sin librería)
//   📋 Pegar    lo que copias de Excel/Loop llega como TSV — cero librería
//
// SheetJS se inyecta SOLO al abrir el importador (_pnProjLoadXLSX): la app
// arranca igual de rápido y sigue siendo offline-first; si no hay internet,
// Pegar y .csv siguen funcionando.

// Campo interno → etiqueta + sinónimos reconocidos (ES/EN, sin acentos ni
// puntuación al comparar). Agregar un sinónimo aquí es todo lo que hace
// falta para que un tablero nuevo se detecte solo.
var PN_IMPORT_FIELDS = {
    title:       { label: 'Paso / Tarea',        required: true,  syn: ['step','steps','paso','pasos','tarea','tareas','task','tasks','actividad','actividades','activity','descripcion','description','desc','item','concepto','nombre','name','titulo','title','que','accion'] },
    responsible: { label: 'Responsable',         required: false, syn: ['responsible','responsable','responsables','owner','dueno','asignado','asignada','assignee','assigned to','assigned','quien','encargado','persona','lead','a cargo'] },
    status:      { label: 'Estatus',             required: false, syn: ['status','estatus','estado','progreso','progress','situacion','avance','etapa actual'] },
    targetDate:  { label: 'Fecha objetivo',      required: false, syn: ['target date','target','fecha objetivo','fecha meta','fecha compromiso','due','due date','vencimiento','deadline','fecha limite','limite','end','end date','fin','fecha fin','fecha de entrega','entrega'] },
    doneDate:    { label: 'Fecha cumplimiento',  required: false, syn: ['completion date','completion','fecha cumplimiento','cumplimiento','completado','completada','done','done date','fecha real','fecha termino','terminado','actual','actual date','fecha completado'] },
    roadblock:   { label: 'Obstáculo / notas',   required: false, syn: ['roadblock','roadblocks','obstaculo','obstaculos','comentarios','comentario','comments','notas','nota','notes','bloqueo','impedimento','observaciones','remarks','issues','riesgo','roadblock comments'] },
    phase:       { label: 'Fase',                required: false, syn: ['phase','fase','etapa','grupo','group','categoria','category','bloque','stage','seccion','area'] },
    startDate:   { label: 'Fecha inicio',        required: false, syn: ['start','start date','fecha inicio','inicio','begin','desde','fecha de inicio'] }
};
var PN_IMPORT_LS_MAP = 'kia_proj_import_map';   // recuerda el mapeo por dispositivo

// Normaliza una llave para comparar: minúsculas, sin acentos, sin puntuación,
// espacios colapsados. "Roadblock / Comments" y "roadblock comments" empatan.
function _pnNormKey(s) {
    return String(s == null ? '' : s)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Texto libre de estatus → una de las 4 claves de PN_STEP_STATUS.
// Acepta español, inglés, símbolos y porcentajes ("100%" = completado).
function _pnNormStatus(raw) {
    var s = _pnNormKey(raw);
    if (!s) return 'pendiente';
    // Las negaciones van PRIMERO: "not started" / "sin iniciar" / "no completado"
    // contienen las mismas raíces que los estados positivos y, sin este corte,
    // "Not started" (un estatus muy común en tableros en inglés) se leía como
    // "En curso" porque la palabra "started" empataba.
    if (/^(not |no |sin |pendient|nuevo|new|todo|to do|backlog|abiert|open)/.test(s)) return 'pendiente';
    if (/^0\s*%?$/.test(s)) return 'pendiente';
    if (/^100\b/.test(s) || /complet|done|termin|finaliz|cerrad|listo|entregad|^ok$|^si$|^yes$|closed/.test(s)) return 'completado';
    if (/bloque|block|stuck|detenid|atorad|pausad|on hold|riesgo|at risk|impedid/.test(s)) return 'bloqueado';
    if (/curso|progres|proceso|wip|doing|activ|trabaj|iniciad|ongoing|started|working/.test(s)) return 'encurso';
    return 'pendiente';
}

function _pnPad2(n) { return (n < 10 ? '0' : '') + n; }

// ¿Las fechas d/m/a vienen como día/mes (México, default) o mes/día (EUA)?
// Se decide con los DATOS, no con una suposición: si algún primer número
// pasa de 12 solo puede ser día; si algún segundo número pasa de 12, es mm/dd.
// Si la muestra es ambigua (todos ≤12) se queda en dd/mm y la vista previa
// deja voltearlo con un clic, mostrando ejemplos reales.
function _pnProjDetectDMY(values) {
    var firstGt12 = false, secondGt12 = false;
    (values || []).forEach(function(v) {
        var m = String(v == null ? '' : v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
        if (!m) return;
        if (+m[1] > 12) firstGt12 = true;
        if (+m[2] > 12) secondGt12 = true;
    });
    if (firstGt12 && !secondGt12) return true;
    if (secondGt12 && !firstGt12) return false;
    return true;
}

// Cualquier representación de fecha → 'YYYY-MM-DD' ('' si no se entiende).
// Nunca pasa por `new Date(y,m,d)` en las rutas con regex: se arma la cadena
// con los números tal cual, así no hay corrimiento de zona horaria.
function _pnNormDate(v, dmy) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) {
        return v.getFullYear() + '-' + _pnPad2(v.getMonth() + 1) + '-' + _pnPad2(v.getDate());
    }
    // Serial de Excel (días desde 1899-12-30) por si llega crudo
    if (typeof v === 'number' && v > 20000 && v < 80000) {
        var d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
        return d.getUTCFullYear() + '-' + _pnPad2(d.getUTCMonth() + 1) + '-' + _pnPad2(d.getUTCDate());
    }
    var s = String(v).trim();
    if (!s) return '';
    var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);              // ISO / yyyy-mm-dd
    if (m) return m[1] + '-' + _pnPad2(+m[2]) + '-' + _pnPad2(+m[3]);
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);           // d/m/a ó m/d/a
    if (m) {
        var a = +m[1], b = +m[2], yr = +m[3];
        if (yr < 100) yr += 2000;
        var day, mon;
        if (a > 12) { day = a; mon = b; }            // inequívoco
        else if (b > 12) { day = b; mon = a; }       // inequívoco
        else { day = dmy ? a : b; mon = dmy ? b : a; }
        if (mon < 1 || mon > 12 || day < 1 || day > 31) return '';
        return yr + '-' + _pnPad2(mon) + '-' + _pnPad2(day);
    }
    var parsed = new Date(s);                                             // "15 Aug 2026", "Aug 15, 2026"
    if (!isNaN(parsed.getTime())) {
        return parsed.getFullYear() + '-' + _pnPad2(parsed.getMonth() + 1) + '-' + _pnPad2(parsed.getDate());
    }
    return '';
}

// SheetJS bajo demanda. Se resuelve con false si no se pudo cargar (sin
// internet) — el modal entonces ofrece Pegar/CSV, que no lo necesitan.
var PN_XLSX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
function _pnProjLoadXLSX(cb) {
    if (window.XLSX) { cb(true); return; }
    if (window._pnXlsxLoading) { window._pnXlsxLoading.push(cb); return; }
    window._pnXlsxLoading = [cb];
    var done = function(ok) {
        var q = window._pnXlsxLoading || []; window._pnXlsxLoading = null;
        q.forEach(function(f) { try { f(ok); } catch (e) {} });
    };
    var s = document.createElement('script');
    s.src = PN_XLSX_CDN;
    s.onload = function() { done(!!window.XLSX); };
    s.onerror = function() { done(false); };
    document.head.appendChild(s);
}

// Texto pegado o .csv → retícula 2D. Detecta el separador solo: si la primera
// línea trae tabuladores es TSV (lo que entrega el portapapeles de Excel),
// si no se parsea como CSV con comillas (reusa la misma lógica de comillas
// que _invParseCsvLine del F11).
function _pnProjParseDelimited(text) {
    var t = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!t.trim()) return [];
    var firstLine = t.split('\n')[0];
    if (firstLine.indexOf('\t') !== -1) {
        return t.split('\n').map(function(l) { return l.split('\t'); });
    }
    var rows = [], cur = '', row = [], inQ = false;
    for (var i = 0; i < t.length; i++) {
        var c = t[i];
        if (inQ) {
            if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
            else cur += c;
        } else if (c === '"') { inQ = true; }
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else cur += c;
    }
    row.push(cur); rows.push(row);
    return rows;
}

// Primera fila que parece encabezado: ≥2 celdas con texto y, de preferencia,
// al menos un sinónimo conocido. Si nada empata, se toma la primera fila con
// contenido (y el usuario puede corregir el mapeo de todos modos).
function _pnProjDetectHeader(grid) {
    var best = -1;
    for (var i = 0; i < Math.min(grid.length, 12); i++) {
        var cells = (grid[i] || []).filter(function(c) { return String(c == null ? '' : c).trim() !== ''; });
        if (cells.length < 2) continue;
        if (best === -1) best = i;
        var hit = cells.some(function(c) {
            var k = _pnNormKey(c);
            return Object.keys(PN_IMPORT_FIELDS).some(function(f) { return PN_IMPORT_FIELDS[f].syn.indexOf(k) !== -1; });
        });
        if (hit) return i;
    }
    return best === -1 ? 0 : best;
}

// Encabezados → { campo: índiceDeColumna }. Empate exacto primero; si no,
// "contiene" (para "Fecha objetivo (compromiso)"). Una columna no se asigna
// dos veces, y el primer campo de PN_IMPORT_FIELDS gana en caso de empate.
function _pnProjAutoMap(headers) {
    var map = {}, used = {};
    var keys = (headers || []).map(_pnNormKey);
    Object.keys(PN_IMPORT_FIELDS).forEach(function(f) {
        var syn = PN_IMPORT_FIELDS[f].syn;
        for (var i = 0; i < keys.length; i++) {
            if (used[i] || !keys[i]) continue;
            if (syn.indexOf(keys[i]) !== -1) { map[f] = i; used[i] = true; return; }
        }
        for (var j = 0; j < keys.length; j++) {
            if (used[j] || !keys[j]) continue;
            for (var s = 0; s < syn.length; s++) {
                if (syn[s].length >= 4 && (keys[j].indexOf(syn[s]) !== -1 || syn[s].indexOf(keys[j]) !== -1)) {
                    map[f] = j; used[j] = true; return;
                }
            }
        }
    });
    return map;
}

// Retícula + mapeo → pasos normalizados, listos para crear o fusionar.
function _pnProjRowsToSteps(grid, headerRow, map, dmy) {
    var out = [];
    for (var i = headerRow + 1; i < grid.length; i++) {
        var r = grid[i] || [];
        var get = function(f) { return map[f] === undefined ? '' : String(r[map[f]] == null ? '' : r[map[f]]).trim(); };
        var title = get('title');
        if (!title) continue;                                  // sin título no hay paso
        var status = map.status === undefined ? '' : _pnNormStatus(get('status'));
        var doneDate = _pnNormDate(get('doneDate'), dmy);
        if (!status) status = doneDate ? 'completado' : 'pendiente';
        if (status === 'completado' && !doneDate) doneDate = '';
        out.push({
            title: title,
            responsible: get('responsible'),
            status: status,
            targetDate: _pnNormDate(get('targetDate'), dmy),
            doneDate: doneDate,
            roadblock: get('roadblock'),
            phase: get('phase'),
            startDate: _pnNormDate(get('startDate'), dmy)
        });
    }
    return out;
}

// ── UI del importador ──
// Estado efímero de la sesión de importación (nunca se persiste).
// { grid, headerRow, map, dmy, targetProjectId, sourceName, sheetNames, sheetIdx }
var _pnImport = null;

function pnProjImportOpen(projectId) {
    _pnImport = { grid: null, headerRow: 0, map: {}, dmy: true, targetProjectId: projectId || '', sourceName: '', sheetNames: [], sheetIdx: 0 };
    _pnProjImportRender();
}
function pnProjImportClose() {
    var m = document.getElementById('pn-import-overlay');
    if (m) m.remove();
    _pnImport = null;
}

function _pnProjImportRender() {
    var old = document.getElementById('pn-import-overlay');
    if (old) old.remove();
    var body = _pnImport && _pnImport.grid ? _pnProjImportStep2HTML() : _pnProjImportStep1HTML();
    var html = '<div class="pn-import-overlay" id="pn-import-overlay" onclick="if(event.target===this)pnProjImportClose()">' +
        '<div class="pn-import-box">' +
        '<div class="pn-import-head"><span>📥 Importar pasos desde Excel</span>' +
        '<button class="pn-import-x" onclick="pnProjImportClose()" aria-label="Cerrar">✕</button></div>' +
        '<div class="pn-import-body">' + body + '</div>' +
        '</div></div>';
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstChild);
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function _pnProjImportStep1HTML() {
    return '<p class="pn-import-lead" data-help="pn-import-help">Trae tu lista tal como la tienes. ' +
        '<strong>No hace falta un formato especial</strong> — solo que la tabla traiga una fila de encabezados. ' +
        'Yo detecto qué columna es cuál y te dejo corregirlo antes de guardar nada.</p>' +
        '<div class="pn-import-sources">' +
        '<div class="pn-import-source">' +
        '<div class="pn-import-source-title">📄 Desde un archivo</div>' +
        '<div class="pn-import-source-desc">Excel (.xlsx, .xls) o .csv. El Excel se lee tal cual, sin convertir nada.</div>' +
        '<input type="file" id="pn-import-file" accept=".xlsx,.xls,.csv" style="display:none;" onchange="pnProjImportFile(event)">' +
        '<button class="tp-btn tp-btn-primary" onclick="document.getElementById(\'pn-import-file\').click()">Elegir archivo…</button>' +
        '</div>' +
        '<div class="pn-import-source">' +
        '<div class="pn-import-source-title">📋 Pegar</div>' +
        '<div class="pn-import-source-desc">Copia las filas en Excel o Loop (Ctrl+C) y pégalas aquí. Funciona sin internet.</div>' +
        '<textarea id="pn-import-paste" class="pn-import-paste" placeholder="Pega aquí la tabla…"></textarea>' +
        '<button class="tp-btn tp-btn-primary" onclick="pnProjImportPaste()">Leer lo pegado</button>' +
        '</div></div>';
}

function pnProjImportFile(ev) {
    var f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    _pnImport.sourceName = f.name.replace(/\.[^.]+$/, '');
    if (ext === 'csv') {
        var r = new FileReader();
        r.onload = function(e) { _pnProjImportGrid(_pnProjParseDelimited(e.target.result)); };
        r.readAsText(f);
        return;
    }
    showToast('Leyendo Excel…', 'info');
    _pnProjLoadXLSX(function(ok) {
        if (!ok) {
            showModal({
                title: 'No se pudo leer el Excel', type: 'warning', showCancel: false,
                message: 'Para abrir archivos .xlsx hace falta descargar una librería una sola vez, y este dispositivo no tiene conexión en este momento.<br><br>' +
                         'Mientras tanto tienes dos caminos que <strong>sí funcionan sin internet</strong>:<br>' +
                         '• Copia las filas en Excel y usa <strong>📋 Pegar</strong>.<br>' +
                         '• En Excel: <em>Archivo → Guardar como → CSV</em> e importa ese archivo.'
            });
            return;
        }
        var r2 = new FileReader();
        r2.onload = function(e) {
            try {
                // raw:false → cada celda llega como el TEXTO que se ve en Excel, así las
                // fechas no dependen de la zona horaria ni del serial interno.
                var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                _pnImport.sheetNames = wb.SheetNames || [];
                _pnImport.sheetIdx = 0;
                _pnImport._wb = wb;
                _pnProjImportSheet(0);
            } catch (err) {
                showToast('No se pudo leer el archivo: ' + err.message, 'error');
            }
        };
        r2.readAsArrayBuffer(f);
    });
}

function _pnProjImportSheet(idx) {
    var wb = _pnImport && _pnImport._wb;
    if (!wb) return;
    _pnImport.sheetIdx = idx;
    var ws = wb.Sheets[wb.SheetNames[idx]];
    var grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
    _pnProjImportGrid(grid);
}
function pnProjImportSheetPick(idx) { _pnProjImportSheet(parseInt(idx, 10) || 0); }

function pnProjImportPaste() {
    var ta = document.getElementById('pn-import-paste');
    var txt = ta ? ta.value : '';
    if (!txt.trim()) { showToast('Pega primero la tabla', 'warning'); return; }
    _pnImport.sourceName = _pnImport.sourceName || 'Pegado';
    _pnProjImportGrid(_pnProjParseDelimited(txt));
}

// Retícula lista → detectar encabezado, auto-mapear (o reusar el mapeo
// recordado si los encabezados son los mismos) y pasar a la vista previa.
function _pnProjImportGrid(grid) {
    grid = (grid || []).filter(function(r) {
        return (r || []).some(function(c) { return String(c == null ? '' : c).trim() !== ''; });
    });
    if (grid.length < 2) { showToast('No encontré filas con datos (hace falta encabezado + al menos una fila)', 'error'); return; }
    _pnImport.grid = grid;
    _pnImport.headerRow = _pnProjDetectHeader(grid);
    var headers = grid[_pnImport.headerRow] || [];
    var remembered = null;
    try {
        var saved = JSON.parse(localStorage.getItem(PN_IMPORT_LS_MAP) || 'null');
        if (saved && saved.sig === headers.map(_pnNormKey).join('|')) remembered = saved.map;
    } catch (e) {}
    _pnImport.map = remembered || _pnProjAutoMap(headers);
    // Muestra de fechas para decidir dd/mm vs mm/dd con los datos reales
    var sample = [];
    ['targetDate', 'doneDate', 'startDate'].forEach(function(f) {
        if (_pnImport.map[f] === undefined) return;
        for (var i = _pnImport.headerRow + 1; i < Math.min(grid.length, _pnImport.headerRow + 40); i++) {
            sample.push((grid[i] || [])[_pnImport.map[f]]);
        }
    });
    _pnImport.dmy = _pnProjDetectDMY(sample);
    _pnProjImportRender();
}

function _pnProjImportStep2HTML() {
    var st = _pnImport, grid = st.grid;
    var headers = grid[st.headerRow] || [];
    var steps = _pnProjRowsToSteps(grid, st.headerRow, st.map, st.dmy);
    var fieldKeys = Object.keys(PN_IMPORT_FIELDS);

    var h = '';
    if (st.sheetNames.length > 1) {
        h += '<div class="pn-import-row"><label>Hoja del libro</label><select onchange="pnProjImportSheetPick(this.value)">' +
            st.sheetNames.map(function(n, i) { return '<option value="' + i + '"' + (i === st.sheetIdx ? ' selected' : '') + '>' + escapeHtml(n) + '</option>'; }).join('') +
            '</select></div>';
    }

    h += '<div class="pn-import-row"><label>Fila de encabezados</label><select onchange="pnProjImportSetHeader(this.value)">';
    for (var i = 0; i < Math.min(grid.length, 12); i++) {
        var prev = (grid[i] || []).slice(0, 4).map(function(c) { return String(c == null ? '' : c).trim(); }).filter(Boolean).join(' · ');
        h += '<option value="' + i + '"' + (i === st.headerRow ? ' selected' : '') + '>Fila ' + (i + 1) + ': ' + escapeHtml(prev.slice(0, 60)) + '</option>';
    }
    h += '</select></div>';

    // Mapeo: una fila por campo, con las columnas del archivo como opciones.
    h += '<div class="pn-import-maptitle" data-help="pn-import-map-help">Cómo se van a leer las columnas <span>(corrige lo que haga falta)</span></div>';
    h += '<div class="pn-import-map">';
    fieldKeys.forEach(function(f) {
        var fd = PN_IMPORT_FIELDS[f];
        var cur = st.map[f];
        h += '<div class="pn-import-mapitem' + (cur === undefined ? ' pn-import-mapitem--off' : '') + '">';
        h += '<span class="pn-import-maplabel">' + fd.label + (fd.required ? ' *' : '') + '</span>';
        h += '<select onchange="pnProjImportSetMap(\'' + f + '\',this.value)">';
        h += '<option value="">— no importar —</option>';
        headers.forEach(function(hd, ci) {
            var lbl = String(hd == null ? '' : hd).trim() || ('Columna ' + (ci + 1));
            h += '<option value="' + ci + '"' + (cur === ci ? ' selected' : '') + '>' + escapeHtml(lbl.slice(0, 40)) + '</option>';
        });
        h += '</select></div>';
    });
    h += '</div>';

    // Interruptor dd/mm ↔ mm/dd con un ejemplo real del archivo
    var dateSample = '';
    if (st.map.targetDate !== undefined) {
        for (var r = st.headerRow + 1; r < grid.length && !dateSample; r++) {
            var raw = String(((grid[r] || [])[st.map.targetDate]) || '').trim();
            if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(raw)) dateSample = raw;
        }
    }
    if (dateSample) {
        h += '<div class="pn-import-daterow" data-help="pn-import-date-help">Fechas: <strong>' + escapeHtml(dateSample) + '</strong> se está leyendo como <strong>' +
            _pnNormDate(dateSample, st.dmy) + '</strong> (' + (st.dmy ? 'día/mes/año' : 'mes/día/año') + ') ' +
            '<button class="tp-btn tp-btn-ghost" onclick="pnProjImportToggleDMY()">Cambiar a ' + (st.dmy ? 'mes/día/año' : 'día/mes/año') + '</button></div>';
    }

    // Vista previa de lo que se va a guardar (no del archivo crudo)
    h += '<div class="pn-import-maptitle">Vista previa — ' + steps.length + ' paso' + (steps.length === 1 ? '' : 's') + ' detectado' + (steps.length === 1 ? '' : 's') + '</div>';
    h += '<div class="pn-import-preview"><table class="pn-proj-table"><thead><tr>' +
        '<th>Paso</th><th>Responsable</th><th>Estatus</th><th>Objetivo</th><th>Cumplimiento</th><th>Fase</th><th>Obstáculo</th></tr></thead><tbody>';
    if (!steps.length) {
        h += '<tr><td colspan="7" style="text-align:center;padding:14px;color:var(--tp-dim);">Ninguna fila tiene "' + PN_IMPORT_FIELDS.title.label + '". Revisa el mapeo de arriba.</td></tr>';
    }
    steps.slice(0, 8).forEach(function(s) {
        h += '<tr><td>' + escapeHtml(s.title) + '</td><td>' + escapeHtml(s.responsible || '—') + '</td>' +
            '<td><span class="pn-proj-step-status pn-proj-step-status--' + s.status + '">' + PN_STEP_STATUS[s.status] + '</span></td>' +
            '<td>' + (s.targetDate || '—') + '</td><td>' + (s.doneDate || '—') + '</td>' +
            '<td>' + escapeHtml(s.phase || '—') + '</td><td>' + escapeHtml((s.roadblock || '').slice(0, 40)) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    if (steps.length > 8) h += '<div class="pn-import-more">…y ' + (steps.length - 8) + ' más</div>';

    // Destino
    var actives = (pnState.projects || []).filter(function(p) { return !p.archived; });
    h += '<div class="pn-import-row"><label>¿A dónde van?</label><select id="pn-import-target">';
    h += '<option value="">➕ Proyecto nuevo: "' + escapeHtml(st.sourceName || 'Importado') + '"</option>';
    actives.forEach(function(p) {
        h += '<option value="' + p.id + '"' + (st.targetProjectId === p.id ? ' selected' : '') + '>Agregar a: ' + escapeHtml(p.name) + '</option>';
    });
    h += '</select></div>';

    h += '<div class="pn-import-actions">' +
        '<button class="tp-btn tp-btn-ghost" onclick="pnProjImportBack()">← Elegir otro origen</button>' +
        '<button class="tp-btn tp-btn-primary" onclick="pnProjImportApply()"' + (steps.length ? '' : ' disabled') + '>Importar ' + steps.length + ' paso' + (steps.length === 1 ? '' : 's') + '</button>' +
        '</div>';
    return h;
}

function pnProjImportSetHeader(i) {
    _pnImport.headerRow = parseInt(i, 10) || 0;
    _pnImport.map = _pnProjAutoMap(_pnImport.grid[_pnImport.headerRow] || []);
    _pnProjImportRender();
}
function pnProjImportSetMap(field, colIdx) {
    if (colIdx === '') delete _pnImport.map[field];
    else {
        var ci = parseInt(colIdx, 10);
        // una columna no puede alimentar dos campos a la vez
        Object.keys(_pnImport.map).forEach(function(f) { if (f !== field && _pnImport.map[f] === ci) delete _pnImport.map[f]; });
        _pnImport.map[field] = ci;
    }
    _pnProjImportRender();
}
function pnProjImportToggleDMY() { _pnImport.dmy = !_pnImport.dmy; _pnProjImportRender(); }
function pnProjImportBack() { _pnImport.grid = null; _pnProjImportRender(); }

// Escribe: crea proyecto nuevo o fusiona en uno existente.
// Fusionar empata por título de paso (normalizado): si ya existe, ACTUALIZA
// los campos que traiga el archivo; si no, agrega. Reimportar el mismo
// archivo no duplica.
function pnProjImportApply() {
    var st = _pnImport;
    if (!st || !st.grid) return;
    var steps = _pnProjRowsToSteps(st.grid, st.headerRow, st.map, st.dmy);
    if (!steps.length) { showToast('No hay pasos que importar', 'warning'); return; }
    var targetId = (document.getElementById('pn-import-target') || {}).value || '';
    var target = targetId ? (pnState.projects || []).find(function(p) { return p.id === targetId; }) : null;

    var adds = steps.length, updates = 0;
    if (target) {
        var byTitle = {};
        (target.steps || []).forEach(function(s) { byTitle[_pnNormKey(s.title)] = s; });
        adds = 0;
        steps.forEach(function(s) { if (byTitle[_pnNormKey(s.title)]) updates++; else adds++; });
    }

    var msg = target
        ? 'En <strong>' + escapeHtml(target.name) + '</strong>: <strong>' + adds + '</strong> paso(s) nuevo(s) y <strong>' + updates + '</strong> actualizado(s) (se empatan por el nombre del paso, no se duplican).'
        : 'Se creará el proyecto <strong>' + escapeHtml(st.sourceName || 'Importado') + '</strong> con <strong>' + adds + '</strong> paso(s).';

    showConfirmDialog({ title: 'Confirmar importación', message: msg, type: 'info', confirmText: 'Importar' }).then(function(ok) {
        if (!ok) return;
        if (typeof undoPush === 'function') undoPush('panel', 'Importar proyecto');
        var now = new Date().toISOString();
        var proj = target;
        if (!proj) {
            proj = { id: invGenId(), name: st.sourceName || 'Importado', desc: 'Importado desde ' + (st.sourceName || 'archivo'),
                     assetId: '', owner: '', status: 'activo', createdAt: now, updatedAt: now, archived: false, steps: [], log: [] };
            if (!pnState.projects) pnState.projects = [];
            pnState.projects.push(proj);
        }
        var byT = {};
        (proj.steps || []).forEach(function(s) { byT[_pnNormKey(s.title)] = s; });
        steps.forEach(function(row, i) {
            var ex = byT[_pnNormKey(row.title)];
            if (ex) {
                ['responsible', 'status', 'targetDate', 'doneDate', 'roadblock', 'phase', 'startDate'].forEach(function(k) {
                    if (row[k]) ex[k] = row[k];
                });
                ex.updatedAt = now;
            } else {
                proj.steps.push({
                    id: invGenId(), seq: (proj.steps.length + 1), title: row.title,
                    responsible: row.responsible, status: row.status, targetDate: row.targetDate,
                    doneDate: row.doneDate, roadblock: row.roadblock, phase: row.phase,
                    startDate: row.startDate || '', isMilestone: false, baselineTarget: '', dependsOn: [],
                    createdAt: now, updatedAt: now
                });
            }
        });
        proj.updatedAt = now;
        // Recordar el mapeo para que el próximo import del mismo tablero sea un clic
        try {
            localStorage.setItem(PN_IMPORT_LS_MAP, JSON.stringify({
                sig: (st.grid[st.headerRow] || []).map(_pnNormKey).join('|'), map: st.map
            }));
        } catch (e) {}
        pnSave();
        if (typeof auditLog === 'function') auditLog('panel', 'proyecto_importado', { type: 'project', id: proj.id, label: proj.name }, adds + ' nuevos, ' + updates + ' actualizados');
        window._pnSelectedProject = proj.id;
        window._pnProjectView = 'table';
        pnProjImportClose();
        showToast('Importados ' + adds + ' pasos' + (updates ? ' (' + updates + ' actualizados)' : ''), 'success');
        _pnProjNav();
    });
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
