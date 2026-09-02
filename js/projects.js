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
        // v16.8: recorrer una fecha ya no desaparece de la bitácora. El evento se
        // DERIVA comparando la línea base con la fecha vigente — coherente con la
        // regla del módulo: la línea de tiempo nunca se guarda.
        if (s.baselineTarget && s.targetDate && s.baselineTarget !== s.targetDate) {
            var late = s.targetDate > s.baselineTarget;
            var dias = Math.abs(Math.round((new Date(s.targetDate + 'T00:00:00') - new Date(s.baselineTarget + 'T00:00:00')) / 86400000));
            events.push({
                at: s.updatedAt || s.createdAt || new Date().toISOString(), kind: 'moved',
                text: 'Fecha ' + (late ? 'recorrida' : 'adelantada') + ' ' + dias + ' día' + (dias === 1 ? '' : 's') +
                      ': ' + s.title + ' (comprometida ' + s.baselineTarget + ' → ' + s.targetDate + ')',
                by: s.responsible, id: 'st_' + s.id + '_m'
            });
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
    var portfolio = window._pnGridView === 'portfolio';
    var projects = (pnState.projects || []).filter(function(p) { return showArchived ? true : !p.archived; });
    var html = '<div class="tp-card"><div class="tp-card-title" data-help="pn-projects-help"><span>🗂️ Proyectos (' + projects.length + ')</span>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnProjImportOpen()" style="font-size: var(--fs-sm);">📥 Importar Excel</button>';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnAddProject()" style="font-size: var(--fs-sm);">+ Proyecto</button></div>';
    html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom: var(--space-sm);">Da seguimiento a reparaciones, proyectos de inversión o cualquier iniciativa: pasos, fechas, responsables y una línea de tiempo con lo que va pasando.</div>';
    // Tarjetas (día a día) vs Portafolio (la vista para reportar hacia arriba)
    html += '<div class="pn-proj-viewtabs">';
    html += '<button class="pn-proj-viewtab' + (!portfolio ? ' active' : '') + '" onclick="window._pnGridView=\'cards\';_pnProjNav();">🗃️ Tarjetas</button>';
    html += '<button class="pn-proj-viewtab' + (portfolio ? ' active' : '') + '" onclick="window._pnGridView=\'portfolio\';_pnProjNav();">📊 Portafolio</button>';
    html += '</div>';
    if (projects.length === 0) {
        html += '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);">Sin proyectos todavía.</div>';
    }
    html += '</div>';
    if (portfolio && projects.length > 0) {
        html += _pnPortfolioHTML();
        el.innerHTML = html;
        return;
    }
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
    html += '<div style="text-align:center;margin-top: var(--space-md);"><label style="font-size: var(--fs-xs);color:var(--tp-dim);cursor:pointer;"><input type="checkbox" ' + (showArchived ? 'checked' : '') + ' onchange="window._pnProjShowArchived=this.checked;_pnProjNav();" style="vertical-align:middle;"> Mostrar cerrados/archivados</label></div>';
    el.innerHTML = html;
}

function _pnRenderProjectDetail(el, p) {
    var prog = pnProjectProgress(p);
    var view = window._pnProjectView || 'table';
    var asset = (p.assetId && typeof invState !== 'undefined') ? (invState.assets || []).find(function(a) { return a.id === p.assetId; }) : null;

    var html = '<div class="tp-card">';
    html += '<div style="display:flex;align-items:center;gap: var(--space-sm);flex-wrap:wrap;margin-bottom: var(--space-sm);">';
    html += '<button class="tp-btn tp-btn-ghost" onclick="window._pnSelectedProject=null;_pnProjNav();" style="font-size: var(--fs-sm);">← Proyectos</button>';
    html += '<span style="font-weight:800;font-size:14px;flex:1;">' + escapeHtml(p.name) + '</span>';
    html += '<span class="pn-proj-status pn-proj-status--' + p.status + '">' + (PN_PROJECT_STATUS[p.status] || p.status) + '</span>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnAddProject(\'' + p.id + '\')" style="font-size: var(--fs-sm);">✏️ Editar</button>';
    html += '</div>';
    if (p.desc) html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom: var(--space-sm);">' + escapeHtml(p.desc) + '</div>';
    var metaBits = [];
    if (asset) metaBits.push('🔧 ' + escapeHtml(asset.name));
    if (p.owner) metaBits.push('👤 ' + escapeHtml(p.owner));
    if (metaBits.length) html += '<div style="font-size: var(--fs-sm);margin-bottom: var(--space-sm);">' + metaBits.join(' · ') + '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap: var(--space-sm);margin-bottom: var(--space-md);">';
    html += '<div class="tp-metric"><div class="tp-metric-val">' + prog.done + '/' + prog.total + '</div><div class="tp-metric-label">Pasos</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (prog.pct === 100 ? tokenColor('--ok-text') : tokenColor('--info-text')) + '">' + prog.pct + '%</div><div class="tp-metric-label">Avance</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (prog.overdueN > 0 ? tokenColor('--danger-text') : tokenColor('--ok-text')) + '">' + prog.overdueN + '</div><div class="tp-metric-label">Vencidos</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (prog.blockedN > 0 ? tokenColor('--danger-text') : tokenColor('--ok-text')) + '">' + prog.blockedN + '</div><div class="tp-metric-label">Bloqueados</div></div>';
    html += '</div>';

    html += '<div class="pn-proj-viewtabs">';
    [['table', '📋 Tabla'], ['kanban', '📌 Kanban'], ['timeline', '🕒 Línea de tiempo'],
     ['gantt', '📊 Gantt'], ['scurve', '📈 Curva S'], ['workload', '👥 Carga']].forEach(function(v) {
        html += '<button class="pn-proj-viewtab' + (view === v[0] ? ' active' : '') + '" onclick="window._pnProjectView=\'' + v[0] + '\';_pnProjNav();">' + v[1] + '</button>';
    });
    html += '</div>';

    // v22.5 — "Solo míos" (uiPref('onlyMine'), el MISMO de HOY, así que el filtro
    // viaja entre pantallas). Se ofrece solo en Tabla y Kanban: en las vistas
    // analíticas filtrar por persona miente sobre el proyecto, y ahí el control
    // sería engañoso. Cuando está activo y esconde algo, se dice cuántos.
    if (view === 'table' || view === 'kanban') {
        var _all = (p.steps || []).length, _vis = pnProjStepsFor(p).length;
        var _on = (typeof dashOnlyMine === 'function') && dashOnlyMine();
        html += '<div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap;margin:var(--space-sm) 0;">';
        html += '<label class="u-hit" style="display:inline-flex;align-items:center;gap:var(--space-sm);cursor:pointer;font-size:var(--fs-sm);color:var(--muted);">'
             +  '<input type="checkbox" ' + (_on ? 'checked' : '') + ' onchange="pnProjSetOnlyMine(this.checked)"> Solo míos</label>';
        if (_on && _vis < _all) {
            html += '<span class="u-chip u-chip--info">' + (_all - _vis) + ' de otros ocultos</span>';
        }
        html += '</div>';
    }

    if (view === 'timeline') html += _pnProjectTimelineHTML(p);
    else if (view === 'gantt') html += _pnProjectGanttHTML(p);
    else if (view === 'kanban') html += _pnProjectKanbanHTML(p);
    else if (view === 'scurve') html += _pnProjectSCurveHTML(p);
    else if (view === 'workload') html += _pnProjectWorkloadHTML(p);
    else html += _pnProjectTableHTML(p);

    html += '</div>';
    el.innerHTML = html;

    // Chart.js y el arrastre necesitan el DOM ya pintado. La curva se destruye
    // al salir de la vista para no dejar el canvas ocupado ("already in use").
    if (view !== 'scurve' && window._pnProjSCurveChart) {
        try { window._pnProjSCurveChart.destroy(); } catch (e) {}
        window._pnProjSCurveChart = null;
    }
    if (view === 'scurve') setTimeout(pnProjSCurveRender, 30);
    if (view === 'kanban') setTimeout(function() { pnKanbanInitDrag(document.getElementById('pn-kanban-' + p.id), p.id); }, 30);
}

// ══════════════════════════════════════════════════════════════════════
// v22.5 — `pnProjStepsFor(p)` es LA definición de los pasos VISIBLES de un
// proyecto: aplica el filtro "Solo míos" (uiPref('onlyMine'), el mismo que HOY).
//
// Se usa SOLO en Tabla y Kanban, que son las vistas donde uno actúa sobre un
// paso. Gantt, Curva S, Línea de tiempo y Carga se quedan con TODOS los pasos a
// propósito: son vistas analíticas y un Gantt que solo muestra los pasos de uno
// miente sobre el proyecto. Filtrar ahí sería peor que no filtrar.
//
// Nota: el plan semanal (Mi semana) NO recibe este filtro porque sus items no
// tienen responsable — cero `assignee` en testplan.js. Un control que no puede
// filtrar nada es peor que ningún control.
// ══════════════════════════════════════════════════════════════════════
/** Cambia el filtro compartido y repinta. _pnProjNav invalida el cache de la
 *  pestaña, necesario porque pn-projects usa el render clásico (patrón v16.8). */
function pnProjSetOnlyMine(on) {
    if (typeof uiPref === 'function') uiPref('onlyMine', !!on);
    window._dashOnlyMine = !!on;
    _pnProjNav();
}

function pnProjStepsFor(p) {
    var steps = (p.steps || []).slice().sort(function(a, b) { return (a.seq || 0) - (b.seq || 0); });
    if (typeof dashOnlyMine !== 'function' || !dashOnlyMine()) return steps;
    var me = '';
    try {
        if (typeof authGetCurrentUser === 'function') { var u = authGetCurrentUser(); if (u && u.name) me = u.name; }
        if (!me) me = localStorage.getItem('kia_last_operator') || '';
    } catch (e) {}
    if (!me) return steps;
    // Sin responsable = de nadie en particular, así que se muestra (mismo criterio
    // que dashRenderBoard: `!a.assignee || a.assignee === currentOp`).
    return steps.filter(function(s) {
        var r = (s.responsible || '').trim();
        return !r || r === me;
    });
}

function _pnProjectTableHTML(p) {
    var steps = pnProjStepsFor(p);
    var today = localToday();
    var html = '<div style="overflow-x:auto;"><table class="pn-proj-table"><thead><tr>' +
        '<th>Paso</th><th>Responsable</th><th>Estatus</th><th>Fecha objetivo</th><th>Cumplimiento</th><th>Obstáculo</th><th></th>' +
        '</tr></thead><tbody>';
    if (steps.length === 0) {
        html += '<tr><td colspan="7" style="text-align:center;padding: var(--space-lg);color:var(--tp-dim);">Sin pasos todavía.</td></tr>';
    }
    steps.forEach(function(s) {
        var isOverdue = s.status !== 'completado' && s.targetDate && s.targetDate < today;
        html += '<tr class="' + (s.status === 'completado' ? 'pn-proj-row--done' : '') + (isOverdue ? ' pn-proj-row--overdue' : '') + '">';
        html += '<td>' + escapeHtml(s.title) + (s.phase ? '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + escapeHtml(s.phase) + '</div>' : '') + '</td>';
        html += '<td>' + escapeHtml(s.responsible || '—') + '</td>';
        html += '<td><span class="pn-proj-step-status pn-proj-step-status--' + s.status + '">' + (PN_STEP_STATUS[s.status] || s.status) + '</span></td>';
        html += '<td>' + (s.targetDate || '—') + '</td>';
        html += '<td>' + (s.doneDate || '—') + '</td>';
        html += '<td>' + escapeHtml(s.roadblock || '') + '</td>';
        html += '<td style="white-space:nowrap;">';
        if (s.status !== 'completado') html += '<button class="tp-btn tp-btn-ghost" onclick="pnProjectStepDone(\'' + p.id + '\',\'' + s.id + '\');" title="Marcar completado" style="font-size: var(--fs-sm);">✔</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="pnAddProjectStep(\'' + p.id + '\',\'' + s.id + '\');" title="Editar" style="font-size: var(--fs-sm);">✏️</button>';
        html += '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="margin-top: var(--space-sm);display:flex;gap: var(--space-sm);flex-wrap:wrap;">';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnAddProjectStep(\'' + p.id + '\');" style="font-size: var(--fs-sm);">+ Paso</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnProjImportOpen(\'' + p.id + '\')" style="font-size: var(--fs-sm);">📥 Importar Excel</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnExportProjectCSV(\'' + p.id + '\')" style="font-size: var(--fs-sm);">📤 CSV</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnProjectPDF(\'' + p.id + '\')" style="font-size: var(--fs-sm);">📄 PDF</button>';
    html += '</div>';
    return html;
}

function _pnProjectTimelineHTML(p) {
    var events = pnProjectTimeline(p);
    var html = '<div class="pn-proj-timeline">';
    html += '<div style="display:flex;gap: var(--space-sm);margin-bottom: var(--space-md);">';
    html += '<input type="text" id="pn-proj-note-input" placeholder="Agregar una nota…" style="flex:1;padding: var(--space-sm) var(--space-md);border:1px solid var(--tp-border);border-radius: var(--radius-xl);font-size:12px;" onkeydown="if(event.key===\'Enter\'){pnAddProjectLog(\'' + p.id + '\');}">';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnAddProjectLog(\'' + p.id + '\')" style="font-size: var(--fs-sm);">Agregar</button>';
    html += '</div>';
    if (events.length === 0) {
        html += '<div style="text-align:center;padding: var(--space-lg);color:var(--tp-dim);font-size: var(--fs-sm);">Sin eventos todavía — agrega una nota o un paso.</div>';
    }
    events.forEach(function(ev) {
        var icon = ev.kind === 'done' ? '✅' : ev.kind === 'blocked' ? '🚧' : ev.kind === 'created' ? '➕' : ev.kind === 'moved' ? '📅' : '📝';
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
    if (steps.length === 0) return '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);font-size: var(--fs-sm);">Sin pasos. Agrega uno en la pestaña Tabla.</div>';

    var cpm = pnProjectCPM(p);
    var hasBaseline = steps.some(function(s) { return s.baselineTarget; });

    // Rango: todo lo capturado (inicio, objetivo, cumplimiento y línea base) + hoy
    var days = [];
    steps.forEach(function(s) {
        [s.startDate, s.targetDate, s.doneDate, s.baselineTarget].forEach(function(d) {
            var n = _pnDayNum(d); if (n !== null) days.push(n);
        });
    });
    if (!days.length) return '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);font-size: var(--fs-sm);">Sin fechas capturadas todavía.</div>';
    var todayN = _pnDayNum(localToday());
    days.push(todayN);
    var minN = Math.min.apply(null, days), maxN = Math.max.apply(null, days);

    // Semanas (lunes). El día 0 del epoch fue jueves, de ahí el +3 para alinear.
    function weekOf(n) { return Math.floor((n + 3) / 7); }
    var startW = weekOf(minN), endW = weekOf(maxN);
    var nWeeks = Math.min(Math.max(1, endW - startW + 1), 80);
    var todayCol = weekOf(todayN) - startW;

    function colOf(n) { return Math.max(0, Math.min(nWeeks - 1, weekOf(n) - startW)); }

    var html = '';
    if (cpm.cycle.length) {
        html += '<div class="pn-gantt-warn">⚠️ Hay dependencias en círculo (' + cpm.cycle.length + ' paso(s) se esperan entre sí). ' +
            'No se puede calcular la ruta crítica hasta romper el círculo — edita esos pasos y quita una de las dependencias.</div>';
    }

    html += '<div class="pn-gantt-scroll"><table class="pn-proj-gantt" style="min-width:' + (170 + nWeeks * 26) + 'px;">';
    html += '<tr><td class="pn-proj-gantt-label"></td>';
    for (var w = 0; w < nWeeks; w++) {
        var mondayN = (startW + w) * 7 - 3;
        var d = new Date(mondayN * 86400000);
        html += '<td class="pn-proj-gantt-head' + (w === todayCol ? ' pn-proj-gantt-head--today' : '') + '">' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '</td>';
    }
    html += '</tr>';

    steps.forEach(function(s) {
        var ci = cpm.info[s.id] || {};
        var endN = _pnDayNum(s.doneDate) !== null ? _pnDayNum(s.doneDate)
                 : (_pnDayNum(s.targetDate) !== null ? _pnDayNum(s.targetDate) : todayN);
        var startN = _pnDayNum(s.startDate) !== null ? _pnDayNum(s.startDate) : endN;
        if (startN > endN) startN = endN;
        var a = colOf(startN), b = colOf(endN), span = b - a + 1;
        var color = s.status === 'completado' ? '#10b981' : s.status === 'bloqueado' ? '#ef4444' : s.status === 'encurso' ? '#3b82f6' : '#94a3b8';

        var label = (s.isMilestone ? '◆ ' : '') + escapeHtml(s.title);
        var tags = '';
        if (ci.critical && !cpm.cycle.length) tags += '<span class="pn-gantt-tag pn-gantt-tag--crit" title="Ruta crítica: si este paso se atrasa, todo el proyecto se atrasa">crítico</span>';
        if (ci.atRisk) tags += '<span class="pn-gantt-tag pn-gantt-tag--risk" title="' + escapeHtml(ci.risk || '') + '">en riesgo</span>';
        html += '<tr class="' + (s.isMilestone ? 'pn-gantt-row--milestone' : '') + '"><td class="pn-proj-gantt-label" title="' + escapeHtml(s.title) + (ci.risk ? ' — en riesgo: ' + escapeHtml(ci.risk) : '') + '">' + label + tags + '</td>';

        // Barra real (y, debajo, la línea base si la fecha se movió)
        var bl = _pnDayNum(s.baselineTarget);
        var blA = null, blSpan = 0;
        if (bl !== null && s.baselineTarget !== s.targetDate) {
            var blStart = _pnDayNum(s.startDate) !== null ? _pnDayNum(s.startDate) : bl;
            if (blStart > bl) blStart = bl;
            blA = colOf(blStart); blSpan = colOf(bl) - blA + 1;
        }
        for (var w2 = 0; w2 < nWeeks; w2++) {
            var isToday = (w2 === todayCol);
            if (w2 === a) {
                var barTitle = escapeHtml(s.title) + (s.targetDate ? ' · objetivo ' + s.targetDate : '') + (s.doneDate ? ' · hecho ' + s.doneDate : '');
                var inner = s.isMilestone
                    ? '<div class="pn-gantt-milestone" style="color:' + color + ';" title="' + barTitle + '">◆</div>'
                    : '<div class="pn-proj-gantt-bar' + (ci.critical && !cpm.cycle.length ? ' pn-gantt-bar--crit' : '') + '" style="background:' + color + ';" title="' + barTitle + '"></div>';
                html += '<td class="pn-proj-gantt-cell' + (isToday ? ' pn-gantt-cell--today' : '') + '" colspan="' + span + '">' + inner + '</td>';
                w2 = b;
            } else if (blA !== null && w2 === blA && (blA + blSpan - 1 < a || blA > b)) {
                // línea base que no se traslapa con la barra real: se dibuja en su propia celda
                html += '<td class="pn-proj-gantt-cell' + (isToday ? ' pn-gantt-cell--today' : '') + '" colspan="' + blSpan + '"><div class="pn-gantt-baseline" title="Comprometido originalmente: ' + s.baselineTarget + '"></div></td>';
                w2 = blA + blSpan - 1;
            } else {
                html += '<td class="pn-proj-gantt-cell' + (isToday ? ' pn-gantt-cell--today' : '') + '"></td>';
            }
        }
        html += '</tr>';

        // Fila fantasma con el plan original cuando SÍ se traslapa (así se ve el corrimiento)
        if (blA !== null && !(blA + blSpan - 1 < a || blA > b)) {
            html += '<tr class="pn-gantt-row--baseline"><td class="pn-proj-gantt-label">↳ comprometido</td>';
            for (var w3 = 0; w3 < nWeeks; w3++) {
                if (w3 === blA) {
                    html += '<td class="pn-proj-gantt-cell" colspan="' + blSpan + '"><div class="pn-gantt-baseline" title="Comprometido originalmente: ' + s.baselineTarget + '"></div></td>';
                    w3 = blA + blSpan - 1;
                } else html += '<td class="pn-proj-gantt-cell"></td>';
            }
            html += '</tr>';
        }
    });
    html += '</table></div>';

    html += '<div class="pn-gantt-legend">';
    [['Pendiente', '#94a3b8'], ['En curso', '#3b82f6'], ['Completado', '#10b981'], ['Bloqueado', '#ef4444']].forEach(function(l) {
        html += '<span><span class="pn-gantt-swatch" style="background:' + l[1] + ';"></span>' + l[0] + '</span>';
    });
    html += '<span><span class="pn-gantt-swatch pn-gantt-swatch--crit"></span>Ruta crítica</span>';
    if (hasBaseline) html += '<span><span class="pn-gantt-swatch pn-gantt-swatch--base"></span>Comprometido (línea base)</span>';
    html += '<span>◆ Hito</span>';
    html += '</div>';

    html += '<div class="pn-gantt-actions">';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnProjectBaselineSet(\'' + p.id + '\')" style="font-size: var(--fs-sm);" data-help="pn-proj-baseline">' + (hasBaseline ? '🔄 Volver a fijar línea base' : '📌 Fijar línea base') + '</button>';
    html += '</div>';
    return html;
}

// ══════════════════════════════════════════════════════════════════════
// VISTAS DE PROJECT MANAGER (v16.8): Kanban · Carga · Curva S · Portafolio
// ══════════════════════════════════════════════════════════════════════

// ── 📌 Kanban por estatus ──
// Mueve pasos entre columnas. El arrastre reusa el mismo gesto táctil del
// mapa de gases (pulsación larga + fantasma) para que funcione en tablet;
// además cada tarjeta trae un <select> de estatus, que es el camino
// accesible y el que sirve con teclado o si el arrastre falla.
function _pnProjectKanbanHTML(p) {
    var steps = pnProjStepsFor(p);
    if (!steps.length) return '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);font-size: var(--fs-sm);">Sin pasos. Agrega uno en la pestaña Tabla.</div>';
    var today = localToday();
    var cpm = pnProjectCPM(p);

    var html = '<div class="pn-kanban" id="pn-kanban-' + p.id + '">';
    Object.keys(PN_STEP_STATUS).forEach(function(k) {
        var col = steps.filter(function(s) { return s.status === k; });
        html += '<div class="pn-kanban-col pn-kanban-col--' + k + '" data-status="' + k + '">';
        html += '<div class="pn-kanban-colhead"><span>' + PN_STEP_STATUS[k] + '</span><span class="pn-kanban-count">' + col.length + '</span></div>';
        html += '<div class="pn-kanban-cards">';
        col.forEach(function(s) {
            var late = s.status !== 'completado' && s.targetDate && s.targetDate < today;
            var ci = cpm.info[s.id] || {};
            html += '<div class="pn-kanban-card' + (late ? ' pn-kanban-card--late' : '') + '" data-step-id="' + s.id + '" data-status="' + k + '">';
            html += '<div class="pn-kanban-card-title">' + (s.isMilestone ? '◆ ' : '') + escapeHtml(s.title) + '</div>';
            var bits = [];
            if (s.responsible) bits.push('👤 ' + escapeHtml(s.responsible));
            if (s.targetDate) bits.push((late ? '⚠ ' : '📅 ') + s.targetDate);
            if (bits.length) html += '<div class="pn-kanban-card-meta">' + bits.join(' · ') + '</div>';
            if (ci.atRisk) html += '<div class="pn-kanban-card-risk" title="' + escapeHtml(ci.risk || '') + '">⏳ En riesgo</div>';
            if (s.roadblock) html += '<div class="pn-kanban-card-block">🚧 ' + escapeHtml(s.roadblock.slice(0, 60)) + '</div>';
            html += '<div class="pn-kanban-card-actions">';
            html += '<select aria-label="Cambiar estatus de ' + escapeHtml(s.title) + '" onchange="pnProjectStepSetStatus(\'' + p.id + '\',\'' + s.id + '\',this.value)">';
            Object.keys(PN_STEP_STATUS).forEach(function(o) {
                html += '<option value="' + o + '"' + (o === k ? ' selected' : '') + '>' + PN_STEP_STATUS[o] + '</option>';
            });
            html += '</select>';
            html += '<button class="tp-btn tp-btn-ghost" title="Editar" aria-label="Editar ' + escapeHtml(s.title) + '" onclick="pnAddProjectStep(\'' + p.id + '\',\'' + s.id + '\')">✏️</button>';
            html += '</div></div>';
        });
        if (!col.length) html += '<div class="pn-kanban-empty">— vacío —</div>';
        html += '</div></div>';
    });
    html += '</div>';
    html += '<div class="pn-kanban-hint">Arrastra una tarjeta a otra columna, o usa el menú de estatus de cada una.</div>';
    return html;
}

// Cambio de estatus desde Kanban (menú o arrastre). Mantiene la fecha de
// cumplimiento coherente: al completar la pone si falta; al reabrir la quita.
function pnProjectStepSetStatus(projectId, stepId, status) {
    var p = (pnState.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    var s = (p.steps || []).find(function(x) { return x.id === stepId; });
    if (!s || !PN_STEP_STATUS[status] || s.status === status) return;
    var prev = s.status;
    s.status = status;
    if (status === 'completado' && !s.doneDate) s.doneDate = localToday();
    if (status !== 'completado') s.doneDate = '';
    s.updatedAt = new Date().toISOString();
    p.updatedAt = s.updatedAt;
    pnSave();
    if (typeof auditLog === 'function') auditLog('panel', 'proyecto_paso_estatus', { type: 'project', id: p.id, label: p.name }, s.title + ': ' + (PN_STEP_STATUS[prev] || prev) + ' → ' + PN_STEP_STATUS[status]);
    _pnProjNav();
}

// Arrastre del Kanban — mismo gesto que invInitZoneDrag (pulsación larga +
// fantasma) para que sirva igual con ratón y con dedo en tablet.
var _pnKanDrag = { active: false, stepId: null, ghost: null, timer: null, projectId: null };
function pnKanbanInitDrag(container, projectId) {
    if (!container || container._pnDragBound) return;
    container._pnDragBound = true;
    var LONG_PRESS = 320, MOVE_CANCEL = 14;

    function pt(e) {
        if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    }
    function cleanup() {
        if (_pnKanDrag.timer) { clearTimeout(_pnKanDrag.timer); _pnKanDrag.timer = null; }
        if (_pnKanDrag.ghost) { _pnKanDrag.ghost.remove(); _pnKanDrag.ghost = null; }
        container.querySelectorAll('.pn-kanban-col').forEach(function(c) { c.classList.remove('pn-kanban-col--over'); });
        container.querySelectorAll('.pn-kanban-card').forEach(function(c) { c.classList.remove('pn-kanban-card--dragging'); });
        container.style.touchAction = '';
        _pnKanDrag.active = false; _pnKanDrag.stepId = null;
    }
    function start(card, p0) {
        _pnKanDrag.active = true;
        _pnKanDrag.stepId = card.getAttribute('data-step-id');
        _pnKanDrag.projectId = projectId;
        if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} }
        card.classList.add('pn-kanban-card--dragging');
        var g = card.cloneNode(true);
        g.className = 'pn-kanban-card pn-kanban-ghost';
        g.style.width = card.offsetWidth + 'px';
        g.style.left = (p0.x - card.offsetWidth / 2) + 'px';
        g.style.top = (p0.y - 20) + 'px';
        document.body.appendChild(g);
        _pnKanDrag.ghost = g;
        container.style.touchAction = 'none';
    }

    container.addEventListener('pointerdown', function(e) {
        var card = e.target.closest('.pn-kanban-card');
        if (!card || e.target.closest('select') || e.target.closest('button')) return;
        var p0 = pt(e), moved = false;
        var onMove = function(ev) {
            var p1 = pt(ev);
            if (!_pnKanDrag.active) {
                if (Math.abs(p1.x - p0.x) > MOVE_CANCEL || Math.abs(p1.y - p0.y) > MOVE_CANCEL) { moved = true; cleanup(); }
                return;
            }
            ev.preventDefault();
            if (_pnKanDrag.ghost) {
                _pnKanDrag.ghost.style.left = (p1.x - _pnKanDrag.ghost.offsetWidth / 2) + 'px';
                _pnKanDrag.ghost.style.top = (p1.y - 20) + 'px';
            }
            var el = document.elementFromPoint(p1.x, p1.y);
            var col = el && el.closest ? el.closest('.pn-kanban-col') : null;
            container.querySelectorAll('.pn-kanban-col').forEach(function(c) { c.classList.toggle('pn-kanban-col--over', c === col); });
        };
        var onUp = function(ev) {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            if (!_pnKanDrag.active) { cleanup(); return; }
            var p1 = pt(ev);
            if (_pnKanDrag.ghost) _pnKanDrag.ghost.style.display = 'none';
            var el = document.elementFromPoint(p1.x, p1.y);
            var col = el && el.closest ? el.closest('.pn-kanban-col') : null;
            var stepId = _pnKanDrag.stepId, target = col && col.getAttribute('data-status');
            cleanup();
            if (stepId && target) pnProjectStepSetStatus(projectId, stepId, target);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
        _pnKanDrag.timer = setTimeout(function() { if (!moved) start(card, p0); }, LONG_PRESS);
    });
}

// ── 👥 Carga por responsable ──
// Quién trae más encima y quién está frenado. Alcance: un proyecto o todos.
// Es LA definición de carga — cualquier consumidor nuevo debe llamarla.
function pnProjectWorkload(projects) {
    var today = localToday();
    var by = {};
    (projects || []).forEach(function(p) {
        if (p.archived) return;
        (p.steps || []).forEach(function(s) {
            var who = (s.responsible || '').trim() || '— sin asignar —';
            if (!by[who]) by[who] = { name: who, open: 0, overdue: 0, blocked: 0, done: 0, next: null };
            var e = by[who];
            if (s.status === 'completado') { e.done++; return; }
            e.open++;
            if (s.status === 'bloqueado') e.blocked++;
            if (s.targetDate && s.targetDate < today) e.overdue++;
            if (s.targetDate && (!e.next || s.targetDate < e.next)) e.next = s.targetDate;
        });
    });
    return Object.keys(by).map(function(k) { return by[k]; })
        .sort(function(a, b) { return (b.overdue - a.overdue) || (b.open - a.open) || a.name.localeCompare(b.name); });
}

function _pnProjectWorkloadHTML(p) {
    var all = !!window._pnWorkloadAll;
    var rows = pnProjectWorkload(all ? (pnState.projects || []) : [p]);
    var max = rows.reduce(function(m, r) { return Math.max(m, r.open + r.done); }, 0) || 1;

    var html = '<div class="pn-workload-scope">';
    html += '<button class="pn-proj-viewtab' + (!all ? ' active' : '') + '" onclick="window._pnWorkloadAll=false;_pnProjNav();">Solo este proyecto</button>';
    html += '<button class="pn-proj-viewtab' + (all ? ' active' : '') + '" onclick="window._pnWorkloadAll=true;_pnProjNav();">Todos los proyectos</button>';
    html += '</div>';
    if (!rows.length) return html + '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);font-size: var(--fs-sm);">Sin pasos que repartir todavía.</div>';

    html += '<div class="pn-workload" data-help="pn-proj-workload">';
    rows.forEach(function(r) {
        var total = r.open + r.done;
        html += '<div class="pn-workload-row">';
        html += '<div class="pn-workload-name">' + escapeHtml(r.name) + '</div>';
        html += '<div class="pn-workload-bar" title="' + r.open + ' abiertos · ' + r.done + ' completados">';
        var seg = function(n, cls, t) { return n ? '<span class="pn-workload-seg pn-workload-seg--' + cls + '" style="width:' + (n / max * 100) + '%;" title="' + t + '"></span>' : ''; };
        html += seg(r.overdue, 'overdue', r.overdue + ' vencidos');
        html += seg(r.blocked, 'blocked', r.blocked + ' bloqueados');
        html += seg(Math.max(0, r.open - r.overdue - r.blocked), 'open', 'abiertos a tiempo');
        html += seg(r.done, 'done', r.done + ' completados');
        html += '</div>';
        html += '<div class="pn-workload-nums">' + r.open + ' abiert' + (r.open === 1 ? 'o' : 'os');
        if (r.overdue) html += ' · <b class="pn-workload-red">' + r.overdue + ' vencid' + (r.overdue === 1 ? 'o' : 'os') + '</b>';
        if (r.blocked) html += ' · <b class="pn-workload-amber">' + r.blocked + ' bloquead' + (r.blocked === 1 ? 'o' : 'os') + '</b>';
        if (r.next) html += ' · próx. ' + r.next;
        html += '</div></div>';
    });
    html += '</div>';
    html += '<div class="pn-gantt-legend">' +
        '<span><span class="pn-gantt-swatch" style="background:#ef4444;"></span>Vencidos</span>' +
        '<span><span class="pn-gantt-swatch" style="background:#f59e0b;"></span>Bloqueados</span>' +
        '<span><span class="pn-gantt-swatch" style="background:#3b82f6;"></span>Abiertos a tiempo</span>' +
        '<span><span class="pn-gantt-swatch" style="background:#10b981;"></span>Completados</span></div>';
    return html;
}

// ── 📈 Curva S (avance planeado vs real) ──
// Acumulado de pasos comprometidos (línea base si existe, si no la fecha
// objetivo) contra acumulado de pasos realmente completados, por semana.
// Es el gráfico clásico para demostrar si el proyecto va adelantado o
// atrasado, y con qué pendiente.
function pnProjectSCurve(p) {
    var steps = (p.steps || []).filter(function(s) { return s.baselineTarget || s.targetDate || s.doneDate; });
    if (!steps.length) return null;
    var days = [];
    steps.forEach(function(s) {
        [s.baselineTarget || s.targetDate, s.doneDate].forEach(function(d) {
            var n = _pnDayNum(d); if (n !== null) days.push(n);
        });
    });
    if (!days.length) return null;
    var todayN = _pnDayNum(localToday());
    days.push(todayN);
    var minN = Math.min.apply(null, days), maxN = Math.max.apply(null, days);
    function weekEnd(n) { return Math.floor((n + 3) / 7) * 7 + 3; }   // domingo de esa semana
    var labels = [], planned = [], actual = [];
    var total = steps.length;
    for (var wEnd = weekEnd(minN); wEnd <= weekEnd(maxN); wEnd += 7) {
        var d = new Date(wEnd * 86400000);
        labels.push((d.getUTCMonth() + 1) + '/' + d.getUTCDate());
        var pl = 0, ac = 0, anyAfterToday = wEnd > todayN;
        steps.forEach(function(s) {
            var pt2 = _pnDayNum(s.baselineTarget || s.targetDate);
            if (pt2 !== null && pt2 <= wEnd) pl++;
            var at = _pnDayNum(s.doneDate);
            if (at !== null && at <= wEnd) ac++;
        });
        planned.push(Math.round(pl / total * 100));
        // la línea real se corta en HOY: proyectar sería inventar avance
        actual.push(anyAfterToday ? null : Math.round(ac / total * 100));
    }
    return { labels: labels, planned: planned, actual: actual, total: total };
}

function _pnProjectSCurveHTML(p) {
    var data = pnProjectSCurve(p);
    if (!data) return '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);font-size: var(--fs-sm);">Hace falta al menos un paso con fecha objetivo para dibujar la curva.</div>';
    var idxNow = data.actual.reduce(function(acc, v, i) { return v === null ? acc : i; }, 0);
    var planNow = data.planned[idxNow] || 0, realNow = data.actual[idxNow] || 0;
    var diff = realNow - planNow;
    var verdict = diff >= 0
        ? '<span class="pn-scurve-ok">Va ' + diff + ' puntos ARRIBA del plan</span>'
        : '<span class="pn-scurve-bad">Va ' + Math.abs(diff) + ' puntos ABAJO del plan</span>';

    var html = '<div class="pn-scurve-head" data-help="pn-proj-scurve">Avance comprometido vs real · ' + data.total + ' pasos — ' + verdict + '</div>';
    html += '<div id="pn-proj-scurve-wrapper"><canvas id="pn-proj-scurve"></canvas></div>';
    if (typeof chartConfigBuildPanel === 'function') {
        html += chartConfigBuildPanel('pn_proj_scurve', '_pnProjSCurveChart', { rerenderFn: 'pnProjSCurveRender' });
    }
    return html;
}

// Dibuja/redibuja la curva. Destruye la instancia previa antes de crear la
// nueva — si no, Chart.js truena con "canvas is already in use" al volver a
// entrar a la vista.
function pnProjSCurveRender() {
    var cv = document.getElementById('pn-proj-scurve');
    if (!cv || typeof Chart === 'undefined') return;
    var p = (pnState.projects || []).find(function(x) { return x.id === window._pnSelectedProject; });
    if (!p) return;
    var data = pnProjectSCurve(p);
    if (!data) return;
    if (window._pnProjSCurveChart) { try { window._pnProjSCurveChart.destroy(); } catch (e) {} window._pnProjSCurveChart = null; }
    window._pnProjSCurveChart = new Chart(cv.getContext('2d'), {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                { label: 'Comprometido', data: data.planned, borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.12)',
                  borderDash: [6, 4], fill: true, tension: 0.25, pointRadius: 2 },
                { label: 'Real', data: data.actual, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.15)',
                  fill: true, tension: 0.25, pointRadius: 3, spanGaps: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { min: 0, max: 100, ticks: { callback: function(v) { return v + '%'; } } } },
            plugins: { legend: { position: 'bottom' } }
        }
    });
    if (typeof chartConfigApply === 'function') { try { chartConfigApply('pn_proj_scurve', window._pnProjSCurveChart); } catch (e) {} }
}

// ── 🗂️ Portafolio (todos los proyectos) ──
// La vista para reportar hacia arriba: una fila por proyecto con semáforo.
// pnPortfolioRows es LA definición del estado de salud de un proyecto.
function pnPortfolioRows() {
    var today = localToday();
    return (pnState.projects || []).filter(function(p) { return !p.archived; }).map(function(p) {
        var prog = pnProjectProgress(p);
        var cpm = pnProjectCPM(p);
        var atRisk = Object.keys(cpm.info).filter(function(k) { return cpm.info[k].atRisk; }).length;
        var ms = (p.steps || []).filter(function(s) { return s.isMilestone && s.status !== 'completado' && s.targetDate; })
            .sort(function(a, b) { return a.targetDate.localeCompare(b.targetDate); });
        var nextMs = ms[0] || null;
        // Semáforo: rojo si hay vencidos o bloqueados; ámbar si hay pasos en
        // riesgo, un ciclo de dependencias o un hito dentro de 7 días.
        var health = 'ok';
        if (prog.overdueN > 0 || prog.blockedN > 0) health = 'red';
        else if (atRisk > 0 || cpm.cycle.length) health = 'amber';
        else if (nextMs) {
            var d = Math.round((new Date(nextMs.targetDate + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
            if (d <= 7) health = 'amber';
        }
        if (p.status === 'cerrado' || prog.pct === 100) health = 'done';
        var asset = (p.assetId && typeof invState !== 'undefined') ? (invState.assets || []).find(function(a) { return a.id === p.assetId; }) : null;
        return { project: p, prog: prog, health: health, atRisk: atRisk, cycle: cpm.cycle.length, nextMs: nextMs, asset: asset };
    }).sort(function(a, b) {
        var rank = { red: 0, amber: 1, ok: 2, done: 3 };
        return (rank[a.health] - rank[b.health]) || (b.prog.overdueN - a.prog.overdueN) || a.project.name.localeCompare(b.project.name);
    });
}

var PN_HEALTH = {
    red:   { dot: '🔴', label: 'Atención' },
    amber: { dot: '🟡', label: 'En riesgo' },
    ok:    { dot: '🟢', label: 'En tiempo' },
    done:  { dot: '✅', label: 'Terminado' }
};

function _pnPortfolioHTML() {
    var rows = pnPortfolioRows();
    var html = '<div class="tp-card"><div class="tp-card-title" data-help="pn-proj-portfolio"><span>🗂️ Portafolio — ' + rows.length + ' proyecto' + (rows.length === 1 ? '' : 's') + ' activo' + (rows.length === 1 ? '' : 's') + '</span>' +
        '<button class="tp-btn tp-btn-ghost" onclick="pnExportPortfolioCSV()" style="font-size: var(--fs-sm);">📤 CSV</button></div>';
    if (!rows.length) { return html + '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);">Sin proyectos activos.</div></div>'; }

    var counts = { red: 0, amber: 0, ok: 0, done: 0 };
    rows.forEach(function(r) { counts[r.health]++; });
    html += '<div class="pn-portfolio-kpis">';
    ['red', 'amber', 'ok', 'done'].forEach(function(k) {
        html += '<div class="pn-portfolio-kpi"><div class="pn-portfolio-kpi-n">' + counts[k] + '</div><div class="pn-portfolio-kpi-l">' + PN_HEALTH[k].dot + ' ' + PN_HEALTH[k].label + '</div></div>';
    });
    html += '</div>';

    html += '<div style="overflow-x:auto;"><table class="pn-proj-table pn-portfolio-table"><thead><tr>' +
        '<th>Estado</th><th>Proyecto</th><th>Responsable</th><th>Avance</th><th>Vencidos</th><th>Bloqueados</th><th>Próximo hito</th></tr></thead><tbody>';
    rows.forEach(function(r) {
        var p = r.project;
        html += '<tr class="pn-portfolio-row" onclick="window._pnSelectedProject=\'' + p.id + '\';window._pnProjectView=\'table\';_pnProjNav();">';
        html += '<td title="' + PN_HEALTH[r.health].label + '">' + PN_HEALTH[r.health].dot + '</td>';
        html += '<td><strong>' + escapeHtml(p.name) + '</strong>' + (r.asset ? '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">🔧 ' + escapeHtml(r.asset.name) + '</div>' : '') + '</td>';
        html += '<td>' + escapeHtml(p.owner || '—') + '</td>';
        html += '<td style="min-width:110px;"><div class="tp-bar" style="height:14px;"><div class="tp-bar-fill" style="width:' + r.prog.pct + '%;background:' + (r.prog.pct === 100 ? 'var(--tp-green)' : 'var(--tp-blue)') + ';"></div><span class="tp-bar-text" style="line-height:14px;font-size: var(--fs-xs);">' + r.prog.done + '/' + r.prog.total + '</span></div></td>';
        html += '<td' + (r.prog.overdueN ? ' class="pn-portfolio-bad"' : '') + '>' + (r.prog.overdueN || '—') + '</td>';
        html += '<td' + (r.prog.blockedN ? ' class="pn-portfolio-bad"' : '') + '>' + (r.prog.blockedN || '—') + '</td>';
        html += '<td>' + (r.nextMs ? '◆ ' + escapeHtml(r.nextMs.title) + '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + r.nextMs.targetDate + '</div>' : '—') + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
}

function pnExportPortfolioCSV() {
    var rows = pnPortfolioRows();
    if (!rows.length) { showToast('Sin proyectos activos para exportar', 'warning'); return; }
    var csv = 'Estado,Proyecto,Responsable,Equipo,Pasos hechos,Pasos totales,% Avance,Vencidos,Bloqueados,En riesgo,Proximo hito,Fecha del hito\n';
    rows.forEach(function(r) {
        csv += [PN_HEALTH[r.health].label, r.project.name, r.project.owner || '', r.asset ? r.asset.name : '',
                r.prog.done, r.prog.total, r.prog.pct + '%', r.prog.overdueN, r.prog.blockedN, r.atRisk,
                r.nextMs ? r.nextMs.title : '', r.nextMs ? r.nextMs.targetDate : ''].map(_pnProjCsvEsc).join(',') + '\n';
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'Portafolio_Proyectos_' + localToday() + '.csv';
    a.click();
    showToast('Portafolio exportado', 'success');
}

// ══════════════════════════════════════════════════════════════════════
// PUENTE CON HOY (v16.8) — conectar, no fusionar
// ══════════════════════════════════════════════════════════════════════
// HOY responde "¿qué hago hoy?" (feed de triaje, horizonte de hoy) y
// Proyectos "¿cómo va esta iniciativa?" (workspace, horizonte de meses).
// Se mantienen separados a propósito — Monday mismo separa "My Work" de
// "Boards" — pero se acaba la duplicación: lo que pertenece a un proyecto
// puede nacer ahí desde HOY, y una tarea suelta se puede promover después.

// Alta rápida de un paso desde fuera del módulo (el modal ➕ Actividad de HOY).
function pnProjectStepAddQuick(projectId, data) {
    var p = (pnState.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return null;
    var now = new Date().toISOString();
    var step = {
        id: invGenId(), seq: ((p.steps || []).length + 1),
        title: String(data.title || '').trim(),
        responsible: data.responsible || '', status: 'pendiente',
        targetDate: data.targetDate || '', doneDate: '', roadblock: '', phase: '',
        startDate: '', isMilestone: false, baselineTarget: '', dependsOn: [],
        createdAt: now, updatedAt: now
    };
    if (!step.title) return null;
    p.steps = p.steps || [];
    p.steps.push(step);
    p.updatedAt = now;
    pnSave();
    if (typeof auditLog === 'function') auditLog('panel', 'proyecto_paso_creado', { type: 'project', id: p.id, label: p.name }, step.title + ' (desde HOY)');
    return step;
}

// Opciones de proyecto para un <select> — usado por el modal de HOY.
function pnProjectPickerOptions(selectedId) {
    return (pnState.projects || [])
        .filter(function(p) { return !p.archived && p.status === 'activo'; })
        .map(function(p) { return '<option value="' + p.id + '"' + (p.id === selectedId ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>'; })
        .join('');
}

// Promover una tarea suelta de HOY a paso de un proyecto: se crea el paso y
// la tarea se marca con tombstone (no se borra en duro, para que el merge
// entre dispositivos no la resucite).
function pnPromoteTaskToProject(taskId) {
    var t = (pnState.tasks || []).find(function(x) { return x.id === taskId; });
    if (!t) return;
    var opts = pnProjectPickerOptions('');
    if (!opts) { showToast('No hay proyectos activos. Crea uno en Datos → Proyectos.', 'warning'); return; }
    showModal({
        title: 'Mover a un proyecto', type: 'info', confirmText: 'Mover',
        message: '<div style="text-align:left;">La actividad <strong>' + escapeHtml(t.title) + '</strong> dejará de ser una tarea suelta y pasará a ser un paso del proyecto que elijas.' +
            '<div style="margin-top: var(--space-md);"><select id="pn-promote-target" style="width:100%;padding: var(--space-sm);border:1px solid var(--border);border-radius: var(--radius-xl);">' + opts + '</select></div></div>',
        onConfirm: function() {
            var pid = (document.getElementById('pn-promote-target') || {}).value;
            if (!pid) return;
            var step = pnProjectStepAddQuick(pid, { title: t.title, responsible: t.assignee, targetDate: t.due });
            if (!step) { showToast('No se pudo crear el paso', 'error'); return; }
            t.deleted = true;
            t.updatedAt = new Date().toISOString();
            pnSave();
            if (typeof auditLog === 'function') auditLog('panel', 'task_promoted', { type: 'task', id: t.id, label: t.title }, 'Movida al proyecto ' + pid);
            showToast('Movida al proyecto', 'success');
            if (typeof dailyDashRender === 'function') dailyDashRender();
        }
    });
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
    var fieldStyle = 'width:100%;padding: var(--space-sm);border:1px solid var(--border);border-radius: var(--radius-xl);box-sizing:border-box;';
    var lblStyle = 'font-size: var(--fs-sm);color:var(--muted);font-weight:600;';

    var msg = '<div style="display:flex;flex-direction:column;gap: var(--space-md);text-align:left;">' +
        '<div><label style="' + lblStyle + '">Nombre *</label><input id="pn-proj-name" value="' + escapeHtml(p ? p.name : '') + '" style="' + fieldStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Equipo (opcional)</label><select id="pn-proj-asset" style="' + fieldStyle + '">' + assetOpts + '</select></div>' +
        '<div><label style="' + lblStyle + '">Responsable</label><input id="pn-proj-owner" value="' + escapeHtml(p ? (p.owner || '') : defaultOwner) + '" style="' + fieldStyle + '"></div>' +
        '<details><summary style="cursor:pointer;font-size: var(--fs-sm);font-weight:700;color:var(--muted);padding:4px 0;">Más detalles (descripción, estatus)</summary>' +
        '<div style="display:flex;flex-direction:column;gap: var(--space-md);padding-top: var(--space-sm);">' +
        '<div><label style="' + lblStyle + '">Descripción</label><input id="pn-proj-desc" value="' + escapeHtml(p ? (p.desc || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Estatus</label><select id="pn-proj-status" style="' + fieldStyle + '">' + statusOpts + '</select></div>' +
        '</div></details>' +
        (isEdit ? '<button type="button" onclick="pnDeleteProjectPrompt(\'' + editId + '\')" style="align-self:flex-start;background:none;border:none;color:var(--danger-text);font-size: var(--fs-sm);cursor:pointer;padding:2px 0;">🗑️ Eliminar proyecto</button>' : '') +
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

// Todo lo que depende de stepId, directa o indirectamente ({id: true}).
// Se usa para no ofrecer como dependencia algo que crearía un círculo.
function _pnProjDescendants(p, stepId) {
    var out = {}, stack = [stepId], guard = 0;
    var steps = p.steps || [];
    while (stack.length && guard++ < 5000) {
        var cur = stack.pop();
        steps.forEach(function(x) {
            if (out[x.id] || x.id === stepId) return;
            if ((x.dependsOn || []).indexOf(cur) !== -1) { out[x.id] = true; stack.push(x.id); }
        });
    }
    return out;
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
    var fieldStyle = 'width:100%;padding: var(--space-sm);border:1px solid var(--border);border-radius: var(--radius-xl);box-sizing:border-box;';
    var lblStyle = 'font-size: var(--fs-sm);color:var(--muted);font-weight:600;';

    // Dependencias: solo se ofrecen los pasos que NO crean un ciclo. Los que
    // dependen (directa o indirectamente) de este paso quedan fuera de la lista,
    // así el ciclo se evita en la captura y no hay que rescatarlo después.
    var depsHTML = '';
    var others = (p.steps || []).filter(function(x) { return !s || x.id !== s.id; });
    if (others.length) {
        var blocked = s ? _pnProjDescendants(p, s.id) : {};
        var cur = (s && s.dependsOn) || [];
        var opts = others.filter(function(x) { return !blocked[x.id]; }).map(function(x) {
            return '<option value="' + x.id + '"' + (cur.indexOf(x.id) !== -1 ? ' selected' : '') + '>' + escapeHtml(x.title.slice(0, 60)) + '</option>';
        }).join('');
        depsHTML = '<div><label style="' + lblStyle + '" data-help="pn-proj-depends">Depende de (Ctrl+clic para varios)</label>' +
            '<select id="pn-step-deps" multiple size="' + Math.min(5, Math.max(2, others.length)) + '" style="' + fieldStyle + 'height:auto;">' + opts + '</select>' +
            '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top: var(--space-2xs);">Este paso no puede empezar hasta que los seleccionados terminen. Solo se listan los que no crean un círculo.</div></div>';
    }

    var msg = '<div style="display:flex;flex-direction:column;gap: var(--space-md);text-align:left;">' +
        '<div><label style="' + lblStyle + '">Paso *</label><input id="pn-step-title" value="' + escapeHtml(s ? s.title : '') + '" style="' + fieldStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Responsable</label><input id="pn-step-resp" value="' + escapeHtml(s ? (s.responsible || '') : defaultResp) + '" style="' + fieldStyle + '"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap: var(--space-sm);">' +
        '<div><label style="' + lblStyle + '">Estatus</label><select id="pn-step-status" style="' + fieldStyle + '">' + statusOpts + '</select></div>' +
        '<div><label style="' + lblStyle + '">Fecha objetivo</label><input type="date" id="pn-step-target" value="' + (s ? (s.targetDate || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '</div>' +
        '<details><summary style="cursor:pointer;font-size: var(--fs-sm);font-weight:700;color:var(--muted);padding:4px 0;">Más detalles (fase, obstáculo, inicio, hito, dependencias)</summary>' +
        '<div style="display:flex;flex-direction:column;gap: var(--space-md);padding-top: var(--space-sm);">' +
        '<div><label style="' + lblStyle + '" data-help="pn-proj-phase">Fase (para el Gantt)</label><input id="pn-step-phase" value="' + escapeHtml(s ? (s.phase || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap: var(--space-sm);">' +
        '<div><label style="' + lblStyle + '" data-help="pn-proj-start">Fecha de inicio</label><input type="date" id="pn-step-start" value="' + (s ? (s.startDate || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Fecha de cumplimiento</label><input type="date" id="pn-step-done" value="' + (s ? (s.doneDate || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '</div>' +
        '<div><label style="' + lblStyle + '" data-help="pn-proj-roadblock">Obstáculo / comentario</label><input id="pn-step-roadblock" value="' + escapeHtml(s ? (s.roadblock || '') : '') + '" style="' + fieldStyle + '"></div>' +
        '<label style="' + lblStyle + 'display:flex;align-items:center;gap: var(--space-sm);cursor:pointer;" data-help="pn-proj-milestone">' +
        '<input type="checkbox" id="pn-step-milestone" ' + (s && s.isMilestone ? 'checked' : '') + '> ◆ Es un hito (entregable clave del proyecto)</label>' +
        depsHTML +
        (s && s.baselineTarget ? '<div style="font-size: var(--fs-sm);color:var(--tp-dim);">📅 Comprometido originalmente: <strong>' + s.baselineTarget + '</strong>' +
            (s.targetDate && s.targetDate !== s.baselineTarget ? ' · hoy va para ' + s.targetDate : ' · sin cambios') + '</div>' : '') +
        '</div></details>' +
        (isEdit ? '<button type="button" onclick="pnDeleteProjectStepPrompt(\'' + projectId + '\',\'' + stepId + '\')" style="align-self:flex-start;background:none;border:none;color:var(--danger-text);font-size: var(--fs-sm);cursor:pointer;padding:2px 0;">🗑️ Eliminar paso</button>' : '') +
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
            var startDate = (document.getElementById('pn-step-start') || {}).value || '';
            var isMilestone = !!(document.getElementById('pn-step-milestone') || {}).checked;
            var depsEl = document.getElementById('pn-step-deps');
            var dependsOn = depsEl ? Array.prototype.slice.call(depsEl.selectedOptions).map(function(o) { return o.value; }) : (s ? (s.dependsOn || []) : []);
            var now = new Date().toISOString();
            if (status === 'completado' && !doneDate) doneDate = localToday();
            if (startDate && targetDate && startDate > targetDate) { showToast('La fecha de inicio no puede ser posterior a la objetivo', 'error'); return; }
            if (isEdit) {
                var movedFrom = (s.baselineTarget && s.targetDate !== targetDate) ? s.targetDate : null;
                s.title = title; s.responsible = responsible; s.status = status; s.targetDate = targetDate;
                s.phase = phase; s.doneDate = doneDate; s.roadblock = roadblock; s.updatedAt = now;
                s.startDate = startDate; s.isMilestone = isMilestone; s.dependsOn = dependsOn;
                // Mover una fecha con línea base fijada es una decisión, no un typo:
                // queda en la auditoría además de derivarse en la línea de tiempo.
                if (movedFrom && typeof auditLog === 'function') {
                    auditLog('panel', 'proyecto_fecha_movida', { type: 'project', id: p.id, label: p.name },
                        title + ': ' + movedFrom + ' → ' + (targetDate || '(sin fecha)') + ' (comprometida ' + s.baselineTarget + ')');
                }
            } else {
                p.steps = p.steps || [];
                var seq = p.steps.length + 1;
                p.steps.push({ id: invGenId(), seq: seq, title: title, responsible: responsible, status: status, targetDate: targetDate, doneDate: doneDate, roadblock: roadblock, phase: phase, startDate: startDate, isMilestone: isMilestone, baselineTarget: '', dependsOn: dependsOn, createdAt: now, updatedAt: now });
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
    var titleById = {};
    steps.forEach(function(s) { titleById[s.id] = s.title; });
    // Las 6 primeras columnas son EXACTAMENTE las del tablero de Loop del
    // usuario, para que el archivo se pueda pegar de vuelta allá sin tocarlo.
    // Lo de v16.8 va después, para no romper ese contrato.
    var csv = 'Step,Responsible,Status,Target Date,Completion Date,Roadblock/Comments,Phase,Milestone,Baseline Target,Start Date,Depends On\n';
    steps.forEach(function(s) {
        var deps = (s.dependsOn || []).map(function(d) { return titleById[d] || ''; }).filter(Boolean).join(' | ');
        csv += [s.title, s.responsible || '', PN_STEP_STATUS[s.status] || s.status, s.targetDate || '', s.doneDate || '',
                s.roadblock || '', s.phase || '', s.isMilestone ? 'Sí' : '', s.baselineTarget || '', s.startDate || '', deps]
               .map(_pnProjCsvEsc).join(',') + '\n';
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

// ══════════════════════════════════════════════════════════════════════
// HITOS, LÍNEA BASE Y RUTA CRÍTICA (v16.8)
// ══════════════════════════════════════════════════════════════════════
// Campos nuevos del paso, TODOS opcionales y retrocompatibles (un proyecto
// de v16.6 sigue funcionando sin tocarlo):
//   isMilestone    ◆ hito — se resalta en el Gantt y en el Portafolio
//   baselineTarget fecha comprometida originalmente + baselineAt (cuándo)
//   startDate      inicio planeado (si falta, se deriva de targetDate)
//   durationDays   duración explícita (si falta, se deriva de las fechas)
//   dependsOn[]    ids de los pasos que deben terminar antes que éste

function _pnDayNum(iso) {
    if (!iso) return null;
    var t = new Date(iso + 'T00:00:00').getTime();
    return isNaN(t) ? null : Math.round(t / 86400000);
}
function _pnDayISO(n) {
    var d = new Date(n * 86400000);
    return d.getUTCFullYear() + '-' + _pnPad2(d.getUTCMonth() + 1) + '-' + _pnPad2(d.getUTCDate());
}

// Duración en días de un paso. Explícita > derivada de fechas > 1 día.
function pnStepDuration(s) {
    if (s.durationDays && +s.durationDays > 0) return Math.max(1, Math.round(+s.durationDays));
    var a = _pnDayNum(s.startDate), b = _pnDayNum(s.doneDate || s.targetDate);
    if (a !== null && b !== null && b >= a) return Math.max(1, b - a + 1);
    return 1;
}

// Método de la Ruta Crítica sobre los pasos del proyecto.
//
// A diferencia de un MS Project puro, NO reprograma las fechas capturadas:
// el laboratorio las trae de su Excel y reescribirlas sería pelearse con su
// dato. Se usan como ancla y las dependencias sirven para (1) calcular
// holgura y marcar la ruta crítica, y (2) avisar qué pasos están en riesgo
// porque aquello de lo que dependen no va a estar a tiempo.
//
// Devuelve { info: {stepId: {es,ef,ls,lf,slack,critical,atRisk,risk}}, cycle:[ids], order:[ids] }.
// Un ciclo (A depende de B y B de A) NO cuelga la vista: se reporta y esos
// pasos quedan fuera del cálculo.
function pnProjectCPM(p) {
    var steps = (p.steps || []).slice();
    var byId = {};
    steps.forEach(function(s) { byId[s.id] = s; });

    var preds = {}, succs = {}, indeg = {};
    steps.forEach(function(s) {
        // se ignoran las dependencias que apuntan a pasos borrados o a sí mismas
        preds[s.id] = (s.dependsOn || []).filter(function(d) { return byId[d] && d !== s.id; });
        succs[s.id] = [];
        indeg[s.id] = preds[s.id].length;
    });
    steps.forEach(function(s) { preds[s.id].forEach(function(d) { succs[d].push(s.id); }); });

    // Orden topológico (Kahn). Si no salen todos, hay ciclo.
    var queue = steps.filter(function(s) { return indeg[s.id] === 0; }).map(function(s) { return s.id; });
    var ind = {}; Object.keys(indeg).forEach(function(k) { ind[k] = indeg[k]; });
    var order = [];
    while (queue.length) {
        var id = queue.shift();
        order.push(id);
        succs[id].forEach(function(n) { if (--ind[n] === 0) queue.push(n); });
    }
    var cycle = order.length === steps.length ? [] : steps.filter(function(s) { return order.indexOf(s.id) === -1; }).map(function(s) { return s.id; });

    var info = {};
    if (!steps.length) return { info: info, cycle: cycle, order: order };

    // Ancla de cada paso: su inicio capturado, o el objetivo menos su duración.
    var anchors = [];
    steps.forEach(function(s) {
        var a = _pnDayNum(s.startDate);
        if (a === null) {
            var t = _pnDayNum(s.targetDate);
            a = t === null ? null : t - pnStepDuration(s) + 1;
        }
        if (a !== null) anchors.push(a);
    });
    var projStart = anchors.length ? Math.min.apply(null, anchors) : _pnDayNum(localToday());

    function anchorOf(s) {
        var a = _pnDayNum(s.startDate);
        if (a !== null) return a;
        var t = _pnDayNum(s.targetDate);
        return t === null ? projStart : t - pnStepDuration(s) + 1;
    }

    // Pasada hacia adelante
    order.forEach(function(id) {
        var s = byId[id], dur = pnStepDuration(s);
        var es = anchorOf(s);
        preds[id].forEach(function(d) {
            if (info[d]) es = Math.max(es, info[d].ef + 1);
        });
        info[id] = { es: es, ef: es + dur - 1, dur: dur };
    });
    var projEnd = order.length ? Math.max.apply(null, order.map(function(id) { return info[id].ef; })) : projStart;

    // Pasada hacia atrás
    order.slice().reverse().forEach(function(id) {
        var lf = projEnd;
        succs[id].forEach(function(n) { if (info[n]) lf = Math.min(lf, info[n].ls - 1); });
        info[id].lf = lf;
        info[id].ls = lf - info[id].dur + 1;
        info[id].slack = info[id].ls - info[id].es;
        info[id].critical = info[id].slack <= 0;
    });

    // Riesgo: algo de lo que depende no va a estar a tiempo. Se explica en
    // palabras, no en holgura — es lo que un técnico puede accionar.
    var today = localToday();
    order.forEach(function(id) {
        var s = byId[id];
        if (s.status === 'completado') return;
        var causes = [];
        preds[id].forEach(function(d) {
            var pr = byId[d];
            if (!pr || pr.status === 'completado') return;
            if (pr.status === 'bloqueado') causes.push('“' + pr.title + '” está bloqueado');
            else if (pr.targetDate && pr.targetDate < today) causes.push('“' + pr.title + '” ya venció');
            else if (pr.targetDate && s.targetDate && pr.targetDate >= s.targetDate) causes.push('“' + pr.title + '” termina hasta el ' + pr.targetDate);
        });
        if (causes.length) { info[id].atRisk = true; info[id].risk = causes.join(' · '); }
    });

    return { info: info, cycle: cycle, order: order, projStart: projStart, projEnd: projEnd };
}

// Congela la línea base: guarda la fecha objetivo actual de cada paso como
// "lo comprometido". A partir de ahí, mover una fecha deja rastro visible en
// el Gantt y en la línea de tiempo en vez de desaparecer.
function pnProjectBaselineSet(projectId) {
    var p = (pnState.projects || []).find(function(x) { return x.id === projectId; });
    if (!p) return;
    var withDates = (p.steps || []).filter(function(s) { return s.targetDate; }).length;
    if (!withDates) { showToast('Ningún paso tiene fecha objetivo todavía', 'warning'); return; }
    var already = (p.steps || []).some(function(s) { return s.baselineTarget; });
    showConfirmDialog({
        title: already ? 'Volver a fijar la línea base' : 'Fijar línea base',
        message: (already
            ? 'Ya hay una línea base guardada. Volver a fijarla <strong>reemplaza el compromiso original</strong> por las fechas de hoy y se pierde el retraso acumulado que hoy se ve en el Gantt.<br><br>'
            : 'Se guardará la fecha objetivo actual de los ' + withDates + ' paso(s) como el <strong>compromiso original</strong>.<br><br>') +
            'A partir de ahí, si alguien recorre una fecha, el Gantt sigue dibujando el plan original debajo del real y la línea de tiempo lo registra.',
        type: already ? 'warning' : 'info', confirmText: already ? 'Reemplazar' : 'Fijar'
    }).then(function(ok) {
        if (!ok) return;
        if (typeof undoPush === 'function') undoPush('panel', 'Fijar línea base');
        var now = new Date().toISOString();
        (p.steps || []).forEach(function(s) {
            if (!s.targetDate) return;
            s.baselineTarget = s.targetDate;
            s.baselineAt = now;
        });
        p.updatedAt = now;
        pnSave();
        if (typeof auditLog === 'function') auditLog('panel', 'proyecto_linea_base', { type: 'project', id: p.id, label: p.name }, withDates + ' pasos');
        showToast('Línea base fijada', 'success');
        _pnProjNav();
    });
}

// ── UI del importador ──
// Estado efímero de la sesión de importación (nunca se persiste).
// { grid, headerRow, map, dmy, targetProjectId, sourceName, sheetNames, sheetIdx }
var _pnImport = null;

// [v17.6] El wizard de importación (_pnProjImportRender) destruye y vuelve a crear el
// <div id="pn-import-overlay"> completo en cada paso (elegir archivo → mapear columnas →
// confirmar). Se observa el <body> por la aparición de una NUEVA instancia de ese id y se
// cablea a11yDialog fresco en cada una — el listener del paso anterior queda huérfano pero
// inerte: a11yDialog se autodesactiva en cuanto detecta que su nodo ya no está en el
// documento (ver el guard `document.contains(el)` en la definición compartida, js/app.js),
// así que no llama a onClose ni roba el foco al hacerlo.
(function () {
    if (typeof a11yDialog !== 'function') return;
    var wiredEl = null; // instancia del nodo actualmente cableado (mismo id, distinta instancia por paso)
    var mo = new MutationObserver(function () {
        var overlay = document.getElementById('pn-import-overlay');
        if (overlay && overlay !== wiredEl) {
            wiredEl = overlay;
            a11yDialog(overlay, { onClose: function () {
                if (typeof pnProjImportClose === 'function') pnProjImportClose();
            }});
        } else if (!overlay && wiredEl) {
            wiredEl = null;
        }
    });
    mo.observe(document.body, { childList: true });
})();

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
        '<textarea id="pn-import-paste" aria-label="Pegar tabla de pasos" class="pn-import-paste" placeholder="Pega aquí la tabla…"></textarea>' +
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
        h += '<tr><td colspan="7" style="text-align:center;padding: var(--space-lg);color:var(--tp-dim);">Ninguna fila tiene "' + PN_IMPORT_FIELDS.title.label + '". Revisa el mapeo de arriba.</td></tr>';
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


// ── PDF de una carilla por proyecto ──
// El entregable para jefatura: métricas, hitos, la curva S y la tabla de
// pasos. La gráfica se embebe con toBase64Image(), el mismo patrón que ya
// usa generateWeeklyStatusPDF para las gráficas del reporte semanal.
function pnProjectPDF(projectId) {
    if (typeof window.jspdf === 'undefined') { showToast('jsPDF no está disponible. Verifica la conexión CDN.', 'error'); return; }
    var pid = projectId || window._pnSelectedProject;
    var p = (pnState.projects || []).find(function(x) { return x.id === pid; });
    if (!p) { showToast('Selecciona un proyecto primero', 'warning'); return; }

    var prog = pnProjectProgress(p);
    var cpm = pnProjectCPM(p);
    var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var ML = 14, CW = W - ML * 2, y = 16;

    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text(p.name, ML, y); y += 6;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
    var head = [];
    if (p.owner) head.push('Responsable: ' + p.owner);
    var asset = (p.assetId && typeof invState !== 'undefined') ? (invState.assets || []).find(function(a) { return a.id === p.assetId; }) : null;
    if (asset) head.push('Equipo: ' + asset.name);
    head.push('Estatus: ' + (PN_PROJECT_STATUS[p.status] || p.status));
    head.push('Generado: ' + localToday());
    doc.text(head.join('   ·   '), ML, y); y += 8;
    doc.setTextColor(0);

    // Métricas
    var mets = [['Avance', prog.pct + '%'], ['Pasos', prog.done + '/' + prog.total],
                ['Vencidos', String(prog.overdueN)], ['Bloqueados', String(prog.blockedN)]];
    var bw = CW / mets.length;
    mets.forEach(function(m, i) {
        var x = ML + i * bw;
        doc.setDrawColor(220); doc.rect(x, y, bw - 2, 14);
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(m[1], x + (bw - 2) / 2, y + 6, { align: 'center' });
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(110);
        doc.text(m[0].toUpperCase(), x + (bw - 2) / 2, y + 11, { align: 'center' });
        doc.setTextColor(0);
    });
    y += 20;

    // Curva S si está dibujada en pantalla
    if (window._pnProjSCurveChart) {
        try {
            var img = window._pnProjSCurveChart.toBase64Image();
            doc.setFontSize(10); doc.setFont('helvetica', 'bold');
            doc.text('Avance comprometido vs real', ML, y); y += 4;
            doc.addImage(img, 'PNG', ML, y, CW, 55); y += 60;
        } catch (e) {}
    }

    // Hitos
    var ms = (p.steps || []).filter(function(s) { return s.isMilestone; });
    if (ms.length) {
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Hitos', ML, y); y += 5;
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        ms.forEach(function(s) {
            doc.text('◆ ' + s.title + '  —  ' + (s.targetDate || 's/f') + '  ' + (PN_STEP_STATUS[s.status] || ''), ML + 2, y);
            y += 4.5;
        });
        y += 3;
    }

    // Tabla de pasos
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Pasos', ML, y); y += 5;
    var cols = [[ML, 72, 'Paso'], [ML + 74, 28, 'Responsable'], [ML + 103, 20, 'Estatus'], [ML + 124, 22, 'Objetivo'], [ML + 147, 35, 'Obstáculo']];
    doc.setFontSize(7); doc.setFillColor(240); doc.rect(ML, y - 3.5, CW, 5, 'F');
    cols.forEach(function(c) { doc.text(c[2], c[0], y); });
    y += 4;
    doc.setFont('helvetica', 'normal');
    var today = localToday();
    (p.steps || []).slice().sort(function(a, b) { return (a.seq || 0) - (b.seq || 0); }).forEach(function(s) {
        if (y > H - 18) { doc.addPage(); y = 18; }
        var late = s.status !== 'completado' && s.targetDate && s.targetDate < today;
        if (late) doc.setTextColor(185, 28, 28);
        var ci = cpm.info[s.id] || {};
        var t = (s.isMilestone ? '◆ ' : '') + s.title + (ci.critical && !cpm.cycle.length ? ' *' : '');
        doc.text(doc.splitTextToSize(t, 72)[0] || '', cols[0][0], y);
        doc.text(doc.splitTextToSize(s.responsible || '—', 28)[0] || '', cols[1][0], y);
        doc.text(PN_STEP_STATUS[s.status] || s.status, cols[2][0], y);
        doc.text(s.targetDate || '—', cols[3][0], y);
        doc.text(doc.splitTextToSize(s.roadblock || '', 35)[0] || '', cols[4][0], y);
        doc.setTextColor(0);
        y += 4.2;
    });

    if (!cpm.cycle.length && Object.keys(cpm.info).some(function(k) { return cpm.info[k].critical; })) {
        y += 4; doc.setFontSize(7); doc.setTextColor(110);
        doc.text('* Ruta crítica: si ese paso se atrasa, el proyecto entero se atrasa.', ML, y);
        doc.setTextColor(0);
    }

    doc.save('Proyecto_' + p.name.replace(/[^a-z0-9]+/gi, '_') + '_' + localToday() + '.pdf');
    showToast('PDF generado', 'success');
}

// ══════════════════════════════════════════════════
// v16.0: Ayuda — banner de pestaña y tooltips de campo
// (viven aquí, con el módulo; projects.js carga después de cop15.js,
//  que es donde se define CASCADE_TOOLTIPS)
// ══════════════════════════════════════════════════
if (typeof HELP_TABS !== 'undefined') Object.assign(HELP_TABS, {
    'pn-projects': { title: 'Proyectos', text: 'Seguimiento general de reparaciones, proyectos de inversión o cualquier iniciativa con pasos, responsables y fechas — no solo mantenimiento. Cada proyecto tiene 6 vistas: Tabla, Kanban, Línea de tiempo, Gantt, Curva S y Carga.', tips: [
        '📥 Importar Excel trae tu lista tal como la tienes: no hace falta un formato especial, solo una fila de encabezados.',
        'Fija la línea base cuando el plan esté acordado: a partir de ahí los retrasos quedan documentados en el Gantt.',
        'Marca los entregables clave como hito (◆) — el Portafolio muestra el próximo hito de cada proyecto.',
        'Liga un proyecto a un equipo (ej. Dinamómetro) para que aparezca como banner en Consumibles → Mtto.',
        'Un paso vencido o bloqueado aparece en HOY y en Alertas hasta que se resuelva.',
        'Desde HOY puedes dar de alta un pendiente directo en un proyecto con el selector del modal ➕ Actividad.'
    ]}
});
if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'pn-projects-help': { title: 'Proyectos', text: 'Registra reparaciones, proyectos de inversión o cualquier iniciativa con pasos y fechas. La retícula muestra el avance de todos; entra a uno para ver su tabla, línea de tiempo y Gantt.' },
    'pn-proj-phase': { title: 'Fase', text: 'Etiqueta libre para agrupar pasos en el Gantt (ej. "Diagnóstico", "Refacciones", "Instalación"). Opcional — si la dejas vacía, el paso solo muestra su título.' },
    'pn-proj-roadblock': { title: 'Obstáculo / comentario', text: 'Qué está deteniendo este paso (ej. "esperando refacción de proveedor"). Si el paso está en estatus Bloqueado y tiene un obstáculo escrito, sale en Alertas hasta que se resuelva.' },
    'pn-import-help': { title: 'Importar desde Excel', text: 'Trae tu lista tal como la tienes: no hace falta una plantilla ni un orden de columnas específico, solo que la tabla traiga una fila de encabezados. Puedes subir un .xlsx/.xls/.csv o pegar directo lo que copiaste de Excel o Loop.' },
    'pn-import-map-help': { title: 'Mapeo de columnas', text: 'Se adivina qué columna es cuál por su encabezado (en español o inglés). Revisa y corrige con los menús: cada campo puede apuntar a cualquier columna, o quedar en "no importar". Solo "Paso / Tarea" es obligatorio. El mapeo se recuerda para la próxima vez.' },
    'pn-import-date-help': { title: 'Día/mes vs mes/día', text: 'Se decide con los datos: si algún número pasa de 12 no hay ambigüedad. Cuando todas las fechas son ambiguas (ej. 01/02/2026) se asume día/mes/año, como se usa en México — el ejemplo de arriba te dice cómo se está leyendo y el botón lo cambia.' },
    'pn-proj-start': { title: 'Fecha de inicio', text: 'Cuándo arranca el paso. Sirve para que el Gantt dibuje una barra de la duración real (en vez de una marca de un día) y para calcular la ruta crítica. Es opcional.' },
    'pn-proj-milestone': { title: 'Hito', text: 'Un entregable clave del proyecto (una entrega, una autorización, un arranque). En el Gantt se dibuja como ◆ en vez de barra, y el Portafolio muestra el próximo hito de cada proyecto.' },
    'pn-proj-depends': { title: 'Dependencias', text: 'Los pasos que deben terminar antes que éste. Con eso se calcula la ruta crítica (lo que empuja la fecha final del proyecto) y se avisa cuando un paso está en riesgo porque aquello de lo que depende va tarde o está bloqueado. La lista solo ofrece pasos que no crean un círculo.' },
    'pn-proj-baseline': { title: 'Línea base', text: 'Congela las fechas objetivo de hoy como "lo comprometido". A partir de ahí, si alguien recorre una fecha, el Gantt sigue dibujando el plan original debajo del real y la línea de tiempo lo registra — el retraso queda documentado en vez de desaparecer.' },
    'pn-proj-workload': { title: 'Carga por responsable', text: 'Cuántos pasos abiertos trae cada persona y cuántos van vencidos o bloqueados. Ordenado por quien tiene más vencidos: el primero de la lista suele ser el cuello de botella.' },
    'pn-proj-scurve': { title: 'Curva S', text: 'Compara el avance comprometido (acumulado de fechas objetivo, o de la línea base si está fijada) contra el real (acumulado de pasos completados). La línea real se corta en hoy a propósito: proyectarla sería inventar avance.' },
    'pn-proj-portfolio': { title: 'Portafolio', text: 'Todos los proyectos activos en una tabla con semáforo, para reportar hacia arriba. Rojo = tiene pasos vencidos o bloqueados; amarillo = hay pasos en riesgo o un hito dentro de 7 días; verde = en tiempo. Toca una fila para entrar al proyecto.' }
});
