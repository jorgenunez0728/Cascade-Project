// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Panel Module (Dashboard, Users, Shift Log, Alerts)    ║
// ╚══════════════════════════════════════════════════════════════════════╝

var pnState = {
    activeTab: 'pn-dashboard',
    operators: [],
    shiftLog: [],
    alerts: []
};

var PN_LS_KEY = 'kia_panel_v1';

function pnInit() {
    try {
        var saved = localStorage.getItem(PN_LS_KEY);
        if (saved) {
            var parsed = JSON.parse(saved);
            pnState = Object.assign(pnState, parsed);
        }
    } catch(e) {}

    // Sync operators from CONFIG if pnState.operators is empty
    if (pnState.operators.length === 0 && CONFIG && CONFIG.operators) {
        pnState.operators = CONFIG.operators.map(function(name, i) {
            return { id: i + 1, name: name, role: 'Técnico', active: true, createdAt: new Date().toISOString() };
        });
        pnSave();
    }
}

function pnSave() {
    try { localStorage.setItem(PN_LS_KEY, JSON.stringify(pnState)); } catch(e) {}
}

function pnSwitchTab(tabId) {
    pnState.activeTab = tabId;
    document.querySelectorAll('#pn-tabs-bar .tp-tab').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('onclick').indexOf(tabId) !== -1);
    });
    pnRender();
}

function pnRender() {
    var el = document.getElementById('pn-content');
    if (!el) return;
    var tab = pnState.activeTab;
    if (tab === 'pn-dashboard') pnRenderDashboard(el);
    else if (tab === 'pn-users') pnRenderUsers(el);
    else if (tab === 'pn-shift') pnRenderShiftLog(el);
    else if (tab === 'pn-alerts') pnRenderAlerts(el);
    else if (tab === 'pn-intelligence') pnRenderIntelligence(el);
    else if (tab === 'pn-system') pnRenderSystemHealth(el);
    else if (tab === 'pn-calendar') pnRenderCalendar(el);
}

function pnUpdateBadges() {
    var badge = document.getElementById('pn-alerts-badge');
    if (badge) {
        var count = pnGetActiveAlerts().length;
        badge.textContent = count > 0 ? count + ' alertas' : 'ok';
        badge.style.color = count > 0 ? '#fbbf24' : '#34d399';
    }
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  LAB DASHBOARD — Real-time overview of all modules                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

function pnRenderDashboard(el) {
    // Gather cross-module stats
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var activeVehicles = vehicles.filter(function(v) { return v.status !== 'archived'; });
    var archivedToday = vehicles.filter(function(v) {
        if (v.status !== 'archived' || !v.archivedAt) return false;
        return v.archivedAt.substring(0, 10) === new Date().toISOString().substring(0, 10);
    });

    var byStatus = {};
    activeVehicles.forEach(function(v) { byStatus[v.status] = (byStatus[v.status] || 0) + 1; });

    var tpPlans = (typeof tpState !== 'undefined' && tpState.weeklyPlans) ? tpState.weeklyPlans : [];
    var latestPlan = tpPlans.length > 0 ? tpPlans[tpPlans.length - 1] : null;
    var tpDone = latestPlan ? latestPlan.items.filter(function(i) { return i.completed; }).length : 0;
    var tpTotal = latestPlan ? latestPlan.items.length : 0;
    var tpPct = tpTotal > 0 ? Math.round((tpDone / tpTotal) * 100) : 0;

    var raTests = (typeof raState !== 'undefined' && raState.tests) ? raState.tests : [];
    var raToday = raTests.filter(function(t) {
        if (!t.importedAt) return false;
        return t.importedAt.substring(0, 10) === new Date().toISOString().substring(0, 10);
    }).length;

    var invGases = (typeof invState !== 'undefined' && invState.gases) ? invState.gases : [];
    var lowGases = invGases.filter(function(g) {
        if (!g.readings || g.readings.length === 0) return false;
        var last = g.readings[g.readings.length - 1];
        return last.psi < (g.reorderPSI || 500);
    });

    var todayStr = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Current shift
    var hour = new Date().getHours();
    var shiftLabel = hour >= 6 && hour < 14 ? 'Turno 1 (06:00–14:00)' : hour >= 14 && hour < 22 ? 'Turno 2 (14:00–22:00)' : 'Turno 3 (22:00–06:00)';

    // Active operator from shift log
    var todayShifts = pnState.shiftLog.filter(function(s) {
        return s.date === new Date().toISOString().substring(0, 10);
    });
    var currentShift = todayShifts.length > 0 ? todayShifts[todayShifts.length - 1] : null;

    var html = '';

    // Header card
    html += '<div class="tp-card" style="border:2px solid var(--tp-blue);background:linear-gradient(135deg,rgba(59,130,246,0.08),transparent);">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">';
    html += '<div>';
    var authUser = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
    html += '<div style="font-size:18px;font-weight:800;color:var(--tp-blue);">Lab Dashboard</div>';
    html += '<div style="font-size:11px;color:var(--tp-dim);text-transform:capitalize;">' + todayStr + '</div>';
    html += '<div style="font-size:10px;color:var(--tp-amber);margin-top:4px;">' + shiftLabel + '</div>';
    if (authUser) {
        html += '<div style="display:flex;align-items:center;gap:6px;margin-top:6px;">';
        html += '<span style="font-size:10px;color:#a78bfa;">Sesion: <strong>' + authUser.name + '</strong></span>';
        html += '<button onclick="if(typeof authSignOut===\'function\')authSignOut();" style="padding:2px 8px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.2);border-radius:4px;cursor:pointer;font-size:9px;">Salir</button>';
        html += '</div>';
    }
    html += '</div>';
    if (currentShift) {
        html += '<div style="padding:8px 14px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;">';
        html += '<div style="font-size:9px;color:var(--tp-dim);">Operador en turno</div>';
        html += '<div style="font-size:12px;font-weight:700;color:var(--tp-green);">' + currentShift.operator + '</div>';
        html += '</div>';
    }
    html += '</div></div>';

    // KPI grid [R5-M4] with animated counters
    var _kpiData = [
        { value: activeVehicles.length, label: 'Vehiculos Activos', color: '#3b82f6' },
        { value: archivedToday.length, label: 'Liberados Hoy', color: '#10b981' },
        { value: tpPct, label: 'Plan Semanal', color: '#f59e0b', suffix: '%' },
        { value: raTests.length, label: 'Pruebas Results', color: '#8b5cf6' },
        { value: lowGases.length, label: 'Gases Bajos', color: lowGases.length > 0 ? '#ef4444' : '#10b981' },
        { value: pnState.operators.filter(function(o) { return o.active; }).length, label: 'Operadores', color: '#06b6d4' }
    ];
    html += '<div id="pn-kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:12px;">';
    _kpiData.forEach(function(kpi, idx) {
        html += '<div class="tp-card anim-card-hover" style="text-align:center;padding:12px;">';
        html += '<div class="pn-kpi-num" data-kpi-idx="' + idx + '" data-kpi-target="' + kpi.value + '" data-kpi-suffix="' + (kpi.suffix || '') + '" style="font-size:24px;font-weight:800;color:' + kpi.color + ';">0</div>';
        html += '<div style="font-size:9px;color:var(--tp-dim);">' + kpi.label + '</div>';
        html += '</div>';
    });
    html += '</div>';

    // Vehicle pipeline
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title"><span>🔄 Pipeline de Vehiculos</span></div>';
    var pipeline = [
        { key: 'registered', label: 'Registrado', color: '#3b82f6', icon: '📝' },
        { key: 'in-progress', label: 'En Progreso', color: '#f59e0b', icon: '🔧' },
        { key: 'testing', label: 'En Prueba', color: '#8b5cf6', icon: '🧪' },
        { key: 'ready-release', label: 'Listo Liberar', color: '#10b981', icon: '🏁' }
    ];
    html += '<div style="display:flex;gap:4px;margin-bottom:10px;">';
    pipeline.forEach(function(st) {
        var count = byStatus[st.key] || 0;
        var pct = activeVehicles.length > 0 ? Math.round((count / activeVehicles.length) * 100) : 0;
        html += '<div style="flex:1;text-align:center;padding:10px 4px;background:' + st.color + '10;border:1px solid ' + st.color + '30;border-radius:8px;">';
        html += '<div style="font-size:18px;">' + st.icon + '</div>';
        html += '<div style="font-size:20px;font-weight:800;color:' + st.color + ';">' + count + '</div>';
        html += '<div style="font-size:9px;color:var(--tp-dim);">' + st.label + '</div>';
        html += '</div>';
    });
    html += '</div></div>';

    // Weekly plan progress
    if (latestPlan) {
        html += '<div class="tp-card">';
        html += '<div class="tp-card-title"><span>📅 Plan Semanal Actual</span><span style="font-size:11px;font-weight:700;color:' + (tpPct === 100 ? 'var(--tp-green)' : 'var(--tp-amber)') + ';">' + tpDone + '/' + tpTotal + ' (' + tpPct + '%)</span></div>';
        html += '<div class="tp-bar" style="height:8px;margin-bottom:8px;"><div class="tp-bar-fill" style="width:' + tpPct + '%;background:' + (tpPct === 100 ? 'var(--tp-green)' : 'var(--tp-amber)') + ';"></div></div>';
        latestPlan.items.slice(0, 6).forEach(function(item) {
            var shortDesc = item.desc.length > 50 ? item.desc.substring(0, 48) + '..' : item.desc;
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--tp-border);">';
            html += '<span style="font-size:10px;color:' + (item.completed ? 'var(--tp-green)' : 'var(--tp-dim)') + ';' + (item.completed ? 'text-decoration:line-through;' : '') + '">' + shortDesc + '</span>';
            html += '<span style="font-size:10px;">' + (item.completed ? '✅' : '⏳') + '</span>';
            html += '</div>';
        });
        if (latestPlan.items.length > 6) {
            html += '<div style="font-size:9px;color:var(--tp-dim);text-align:center;margin-top:4px;">+' + (latestPlan.items.length - 6) + ' mas...</div>';
        }
        html += '</div>';
    }

    // Recent activity (from shift log)
    var recentLogs = pnState.shiftLog.slice(-5).reverse();
    if (recentLogs.length > 0) {
        html += '<div class="tp-card">';
        html += '<div class="tp-card-title"><span>📋 Actividad Reciente (Bitacora)</span></div>';
        recentLogs.forEach(function(log) {
            html += '<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--tp-border);">';
            html += '<div style="font-size:9px;color:var(--tp-dim);min-width:60px;">' + log.date + '</div>';
            html += '<div style="font-size:10px;font-weight:700;color:var(--tp-blue);min-width:70px;">' + (log.operator || '?') + '</div>';
            html += '<div style="font-size:10px;color:var(--tp-text);flex:1;">' + (log.notes || '—') + '</div>';
            html += '</div>';
        });
        html += '</div>';
    }

    // Alerts summary
    var alerts = pnGetActiveAlerts();
    if (alerts.length > 0) {
        html += '<div class="tp-card" style="border-left:3px solid var(--tp-red);">';
        html += '<div class="tp-card-title"><span style="color:var(--tp-red);">⚠️ Alertas Activas (' + alerts.length + ')</span></div>';
        alerts.slice(0, 5).forEach(function(a) {
            html += '<div style="display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--tp-border);">';
            html += '<span style="font-size:9px;padding:2px 6px;background:' + a.color + '20;color:' + a.color + ';border-radius:4px;font-weight:700;">' + a.level + '</span>';
            html += '<span style="font-size:10px;color:var(--tp-text);flex:1;">' + a.message + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    // ── Cpk/Process Capability Summary ──
    if (raTests.length >= 3) {
        html += '<div class="tp-card">';
        html += '<div class="tp-card-title"><span>📈 Capacidad de Proceso (Cpk)</span></div>';
        var regGroups = {};
        raTests.forEach(function(t) {
            var reg = t.emissionReg || t.regSpec || '?';
            if (!regGroups[reg]) regGroups[reg] = [];
            regGroups[reg].push(t);
        });
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px;">';
        Object.keys(regGroups).slice(0, 6).forEach(function(reg) {
            var tests = regGroups[reg];
            var passCount = tests.filter(function(t) { return typeof raTestVerdict === 'function' && raTestVerdict(t) === 'PASS'; }).length;
            var passRate = tests.length > 0 ? Math.round((passCount / tests.length) * 100) : 0;
            var clr = passRate >= 90 ? '#10b981' : passRate >= 70 ? '#f59e0b' : '#ef4444';
            html += '<div style="padding:10px;border:1px solid ' + clr + '30;border-radius:8px;background:' + clr + '08;text-align:center;">';
            html += '<div style="font-size:9px;color:var(--tp-dim);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + reg + '">' + reg + '</div>';
            html += '<div style="font-size:20px;font-weight:800;color:' + clr + ';">' + passRate + '%</div>';
            html += '<div style="font-size:9px;color:var(--tp-dim);">' + passCount + '/' + tests.length + ' PASS</div>';
            html += '</div>';
        });
        html += '</div></div>';
    }

    // ── Inventory Anomalies ──
    if (typeof invDetectAnomalies === 'function') {
        var anomalies = invDetectAnomalies();
        if (anomalies.length > 0) {
            html += '<div class="tp-card" style="border-left:3px solid #ef4444;">';
            html += '<div class="tp-card-title"><span style="color:#ef4444;">🚨 Anomalias de Gas (' + anomalies.length + ')</span>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="switchPlatform(\'inventory\')" style="font-size:9px;">Ver en Inventario</button></div>';
            anomalies.slice(0, 3).forEach(function(a) {
                var clr = a.severity === 'critica' ? '#ef4444' : '#f59e0b';
                html += '<div style="padding:6px 8px;margin-bottom:3px;border:1px solid ' + clr + '30;border-radius:6px;font-size:10px;color:' + clr + ';">';
                html += '<strong>' + a.formula + '</strong> #' + a.controlNo + ' — ' + a.message;
                html += '</div>';
            });
            html += '</div>';
        }
    }

    // ── Improved Depletion Predictions ──
    if (typeof invPredictDepletion === 'function' && invGases.length > 0) {
        var predictions = [];
        invGases.forEach(function(g) {
            if (g.status === 'Empty') return;
            var pred = invPredictDepletion(g);
            if (pred && pred.daysLeft < 45) {
                predictions.push({ gas: g, pred: pred });
            }
        });
        if (predictions.length > 0) {
            predictions.sort(function(a, b) { return a.pred.daysLeft - b.pred.daysLeft; });
            html += '<div class="tp-card">';
            html += '<div class="tp-card-title"><span>⏳ Prediccion de Agotamiento</span></div>';
            predictions.slice(0, 5).forEach(function(p) {
                var urgClr = p.pred.daysLeft < 14 ? '#ef4444' : p.pred.daysLeft < 30 ? '#f59e0b' : '#3b82f6';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--tp-border);font-size:10px;">';
                html += '<span style="color:var(--tp-text);">' + p.gas.formula + ' ' + (p.gas.concNominal || '') + ' <span style="color:var(--tp-dim);">#' + p.gas.controlNo + '</span></span>';
                html += '<span style="font-weight:700;color:' + urgClr + ';">~' + p.pred.daysLeft + 'd <span style="font-size:9px;font-weight:400;">(' + p.pred.confidence + ')</span></span>';
                html += '</div>';
            });
            html += '</div>';
        }
    }

    // ── Soak Timer Status ──
    var soakData = null;
    try { soakData = JSON.parse(localStorage.getItem('kia_soak_timer')); } catch(e) {}
    if (soakData && soakData.active) {
        var elapsed = Math.round((Date.now() - soakData.start) / 60000);
        var remaining = Math.max(0, (soakData.duration || 720) - elapsed);
        var hrs = Math.floor(remaining / 60);
        var mins = remaining % 60;
        var pct = Math.round((elapsed / (soakData.duration || 720)) * 100);
        html += '<div class="tp-card" style="border:2px solid #8b5cf6;">';
        html += '<div class="tp-card-title"><span style="color:#8b5cf6;">🕐 Soak Timer Activo</span></div>';
        html += '<div style="text-align:center;padding:8px;">';
        html += '<div style="font-size:24px;font-weight:800;color:#8b5cf6;">' + hrs + 'h ' + mins + 'm restantes</div>';
        html += '<div class="tp-bar" style="height:6px;margin:8px 0;"><div class="tp-bar-fill" style="width:' + Math.min(pct, 100) + '%;background:#8b5cf6;"></div></div>';
        html += '<div style="font-size:9px;color:var(--tp-dim);">VIN: ' + (soakData.vin || '?') + ' | ' + pct + '% completado</div>';
        html += '</div></div>';
    }

    // ── Firebase Sync Status ──
    if (typeof fbSync !== 'undefined' && fbSync.enabled) {
        var syncClr = fbSync.status === 'connected' ? '#10b981' : fbSync.status === 'error' ? '#ef4444' : '#f59e0b';
        var queueLen = (typeof fbOfflineQueue !== 'undefined') ? fbOfflineQueue.length : 0;
        html += '<div class="tp-card" style="border-left:3px solid ' + syncClr + ';">';
        html += '<div class="tp-card-title"><span>☁️ Firebase Sync</span>';
        html += '<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:' + syncClr + '20;color:' + syncClr + ';font-weight:700;">' + fbSync.status.toUpperCase() + '</span></div>';
        html += '<div style="font-size:10px;color:var(--tp-dim);">Estacion: ' + (fbSync.stationId || '?') + '</div>';
        if (queueLen > 0) html += '<div style="font-size:10px;color:#f59e0b;margin-top:4px;">' + queueLen + ' operaciones en cola offline</div>';
        if (fbSync.lastSync) html += '<div style="font-size:9px;color:var(--tp-dim);margin-top:2px;">Ultimo sync: ' + new Date(fbSync.lastSync).toLocaleTimeString('es-MX') + '</div>';
        html += '</div>';
    }

    // Weekly PDF Report button
    html += '<div class="tp-card" style="text-align:center;padding:16px;">';
    html += '<button onclick="if(typeof generateWeeklyStatusPDF===\'function\')generateWeeklyStatusPDF();else showToast(\'Funcion no disponible\',\'error\');" ';
    html += 'style="padding:12px 24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(99,102,241,0.3);">';
    html += '📄 Generar Reporte Semanal (PDF)</button>';
    html += ' <button onclick="window.print()" style="padding:12px 24px;background:linear-gradient(135deg,#475569,#64748b);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">🖨️ Imprimir Dashboard</button>';
    html += '<div style="font-size:9px;color:var(--tp-dim);margin-top:6px;">Resumen cross-modulo: COP15, Plan, Resultados, Inventario</div>';
    html += '</div>';

    // Cross-module risk dashboard
    html += '<div id="labDashContainer"></div>';

    // Backup Health section
    html += '<div id="backupHealthContainer"></div>';

    el.innerHTML = html;

    // [R5-M4] Animate KPI counters
    document.querySelectorAll('.pn-kpi-num[data-kpi-target]').forEach(function(numEl) {
        var target = parseFloat(numEl.dataset.kpiTarget) || 0;
        var suffix = numEl.dataset.kpiSuffix || '';
        animateCounter(numEl, target, { suffix: suffix });
    });

    // [R5-M4] Stagger KPI cards
    var kpiGrid = document.getElementById('pn-kpi-grid');
    if (kpiGrid) animateStaggerChildren(kpiGrid, '.tp-card', 60);

    // Render lab dashboard
    var labEl = document.getElementById('labDashContainer');
    if (labEl && typeof renderLabDashboard === 'function') {
        renderLabDashboard(labEl);
    }

    // Render backup health async (needs IndexedDB)
    var backupEl = document.getElementById('backupHealthContainer');
    if (backupEl && typeof renderBackupStatus === 'function') {
        renderBackupStatus(backupEl);
    }
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  USER PANEL — Operator management                                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

function pnRenderUsers(el) {
    var operators = pnState.operators;
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];

    // Stats per operator
    var opStats = {};
    operators.forEach(function(op) { opStats[op.name] = { registered: 0, released: 0, active: 0 }; });
    vehicles.forEach(function(v) {
        var regBy = v.registeredBy || '';
        if (opStats[regBy]) {
            if (v.status === 'archived') opStats[regBy].released++;
            else opStats[regBy].active++;
            opStats[regBy].registered++;
        }
    });

    var roles = ['Técnico', 'Supervisor', 'Ingeniero', 'Coordinador', 'Practicante'];

    var html = '';

    // Add operator form
    html += '<div class="tp-card" style="border:2px solid var(--tp-blue);background:linear-gradient(135deg,rgba(59,130,246,0.05),transparent);">';
    html += '<div class="tp-card-title"><span>👥 Agregar Operador</span></div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">';
    html += '<div style="flex:1;min-width:150px;"><label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Nombre completo</label>';
    html += '<input type="text" id="pn-new-op-name" placeholder="Nombre Apellido" class="tp-input" style="width:100%;"></div>';
    html += '<div style="min-width:120px;"><label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Rol</label>';
    html += '<select id="pn-new-op-role" class="tp-select" style="width:100%;">' + roles.map(function(r) { return '<option value="' + r + '">' + r + '</option>'; }).join('') + '</select></div>';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnAddOperator()" style="padding:8px 16px;">+ Agregar</button>';
    html += '</div></div>';

    // Operators list
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title"><span>👤 Operadores (' + operators.length + ')</span></div>';

    if (operators.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">No hay operadores registrados.</div>';
    } else {
        operators.forEach(function(op, idx) {
            var stats = opStats[op.name] || { registered: 0, released: 0, active: 0 };
            html += '<div style="display:flex;align-items:center;gap:10px;padding:10px;margin-bottom:6px;background:' + (op.active ? 'var(--tp-card)' : 'rgba(100,116,139,0.05)') + ';border:1px solid var(--tp-border);border-radius:8px;' + (!op.active ? 'opacity:0.5;' : '') + '">';

            // Avatar
            var initials = op.name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
            var avatarColors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
            var aColor = avatarColors[idx % avatarColors.length];
            html += '<div style="width:38px;height:38px;border-radius:50%;background:' + aColor + '20;color:' + aColor + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">' + initials + '</div>';

            // Info
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="display:flex;align-items:center;gap:6px;">';
            html += '<span style="font-size:12px;font-weight:700;color:var(--tp-text);">' + op.name + '</span>';
            html += '<span style="font-size:9px;padding:2px 6px;background:rgba(6,182,212,0.15);color:#06b6d4;border-radius:4px;">' + (op.role || 'Técnico') + '</span>';
            if (!op.active) html += '<span style="font-size:9px;padding:2px 6px;background:rgba(239,68,68,0.15);color:#ef4444;border-radius:4px;">Inactivo</span>';
            html += op.pinHash ? '<span style="font-size:9px;padding:2px 6px;background:rgba(16,185,129,0.15);color:#10b981;border-radius:4px;">PIN ✓</span>' : '<span style="font-size:9px;padding:2px 6px;background:rgba(239,68,68,0.15);color:#ef4444;border-radius:4px;">Sin PIN</span>';
            html += '</div>';
            html += '<div style="font-size:9px;color:var(--tp-dim);margin-top:2px;">' + stats.registered + ' registrados | ' + stats.released + ' liberados | ' + stats.active + ' activos</div>';
            html += '</div>';

            // Actions
            html += '<div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">';
            html += '<button onclick="pnSetOperatorPin(' + idx + ')" class="tp-btn tp-btn-ghost" style="font-size:10px;padding:4px 8px;" title="Configurar PIN">' + (op.pinHash ? '🔑' : '🔒') + '</button>';
            html += '<button onclick="pnEditOperator(' + idx + ')" class="tp-btn tp-btn-ghost" style="font-size:10px;padding:4px 8px;">✏️</button>';
            html += '<button onclick="pnToggleOperator(' + idx + ')" class="tp-btn tp-btn-ghost" style="font-size:10px;padding:4px 8px;">' + (op.active ? '🚫' : '✅') + '</button>';
            html += '<button onclick="pnRemoveOperator(' + idx + ')" class="tp-btn tp-btn-ghost" style="font-size:10px;padding:4px 8px;color:var(--tp-red);">🗑</button>';
            html += '</div>';
            html += '</div>';
        });
    }

    html += '</div>';

    // Sync info
    html += '<div class="tp-card" style="padding:10px;text-align:center;">';
    html += '<div style="font-size:9px;color:var(--tp-dim);">Los operadores se sincronizan automaticamente con los dropdowns de COP15.</div>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnSyncOperators()" style="font-size:10px;margin-top:6px;">🔄 Sincronizar Dropdowns Ahora</button>';
    html += '</div>';

    el.innerHTML = html;
}

function pnAddOperator() {
    var name = document.getElementById('pn-new-op-name');
    var role = document.getElementById('pn-new-op-role');
    if (!name || !name.value.trim()) { showToast('Ingresa un nombre', 'error'); return; }

    var maxId = pnState.operators.reduce(function(m, o) { return Math.max(m, o.id || 0); }, 0);
    pnState.operators.push({
        id: maxId + 1,
        name: name.value.trim(),
        role: role ? role.value : 'Técnico',
        active: true,
        createdAt: new Date().toISOString()
    });

    pnSave();
    pnSyncOperators();
    pnRender();
    showToast('Operador agregado: ' + name.value.trim(), 'success');
}

function pnEditOperator(idx) {
    var op = pnState.operators[idx];
    if (!op) return;
    var newName = prompt('Nombre:', op.name);
    if (!newName || !newName.trim()) return;
    var roles = ['Técnico', 'Supervisor', 'Ingeniero', 'Coordinador', 'Practicante'];
    var newRole = prompt('Rol (' + roles.join(', ') + '):', op.role || 'Técnico');
    op.name = newName.trim();
    if (newRole && roles.indexOf(newRole) !== -1) op.role = newRole;
    pnSave();
    pnSyncOperators();
    pnRender();
    showToast('Operador actualizado', 'success');
}

function pnToggleOperator(idx) {
    var op = pnState.operators[idx];
    if (!op) return;
    op.active = !op.active;
    pnSave();
    pnSyncOperators();
    pnRender();
    showToast(op.name + (op.active ? ' activado' : ' desactivado'), 'info');
}

function pnRemoveOperator(idx) {
    var op = pnState.operators[idx];
    if (!op) return;
    showConfirmDialog({ title: '⚠️ Eliminar operador', message: '¿Eliminar a ' + op.name + '? Los registros existentes no se afectan.', type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;
        pnState.operators.splice(idx, 1);
        pnSave();
        pnSyncOperators();
        pnRender();
        showToast('Operador eliminado', 'info');
    });
}

function pnHashPin(pin) {
    // Simple hash for PIN (not cryptographic, but sufficient for local offline use)
    var hash = 0;
    var str = 'kia_pin_' + pin + '_salt';
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash = hash & hash; // Convert to 32bit integer
    }
    return 'pin_' + Math.abs(hash).toString(36);
}

function pnSetOperatorPin(idx) {
    var op = pnState.operators[idx];
    if (!op) return;
    var pin = prompt('PIN de 4 digitos para ' + op.name + ':');
    if (!pin) return;
    pin = pin.trim();
    if (!/^\d{4}$/.test(pin)) {
        showToast('El PIN debe ser exactamente 4 digitos numericos', 'error');
        return;
    }
    op.pinHash = pnHashPin(pin);
    pnSave();
    pnRender();
    showToast('PIN configurado para ' + op.name, 'success');
}

function pnVerifyPin(idx, pin) {
    var op = pnState.operators[idx];
    if (!op || !op.pinHash) return false;
    return op.pinHash === pnHashPin(pin);
}

function pnSyncOperators() {
    // Update CONFIG.operators and repopulate dropdowns
    var activeOps = pnState.operators.filter(function(o) { return o.active; }).map(function(o) { return o.name; });
    if (CONFIG) CONFIG.operators = activeOps;

    // Repopulate all operator dropdowns
    var dropdownIds = ['reg_operator', 'op_recep', 'test_responsible', 'precond_responsible', 'simple_operator'];
    dropdownIds.forEach(function(id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        var currentVal = sel.value;
        // Keep first option (placeholder)
        var firstOpt = sel.options[0] ? sel.options[0].outerHTML : '<option value="">Seleccionar…</option>';
        sel.innerHTML = firstOpt;
        activeOps.forEach(function(name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
        });
        // Restore selection if still valid
        if (currentVal) sel.value = currentVal;
    });
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  SHIFT LOG — Bitácora de turno                                      ║
// ╚══════════════════════════════════════════════════════════════════════╝

function pnRenderShiftLog(el) {
    var todayStr = new Date().toISOString().substring(0, 10);
    var activeOps = pnState.operators.filter(function(o) { return o.active; }).map(function(o) { return o.name; });

    // Categories for log entries
    var categories = ['Inicio de turno', 'Prueba completada', 'Incidencia', 'Mantenimiento', 'Calibración', 'Observación', 'Fin de turno'];

    var html = '';

    // [R5-M6] Shift report button
    html += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnGenerateShiftReport()" style="font-size:11px;">🔄 Cerrar Turno</button>';
    if (pnState.shiftReports && pnState.shiftReports.length > 0) {
        html += '<button class="tp-btn tp-btn-ghost" onclick="pnShowTurnoverOnLogin()" style="font-size:11px;">📋 Último Reporte</button>';
    }
    html += '</div>';

    // New entry form
    html += '<div class="tp-card" style="border:2px solid var(--tp-amber);background:linear-gradient(135deg,rgba(245,158,11,0.05),transparent);">';
    html += '<div class="tp-card-title"><span>📝 Nueva Entrada de Bitácora</span></div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">';
    html += '<div><label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Operador</label>';
    var currentUserName = (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '';
    html += '<select id="pn-shift-operator" class="tp-select" style="width:100%;">';
    html += '<option value="">Seleccionar...</option>';
    activeOps.forEach(function(n) { html += '<option value="' + n + '"' + (n === currentUserName ? ' selected' : '') + '>' + n + '</option>'; });
    html += '</select></div>';

    html += '<div><label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Categoria</label>';
    html += '<select id="pn-shift-category" class="tp-select" style="width:100%;">';
    categories.forEach(function(c) { html += '<option value="' + c + '">' + c + '</option>'; });
    html += '</select></div>';
    html += '</div>';

    html += '<div style="margin-bottom:8px;"><label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Notas / Descripcion</label>';
    html += '<textarea id="pn-shift-notes" class="tp-input" rows="3" placeholder="Describe la actividad, incidencia u observación..." style="width:100%;resize:vertical;font-family:inherit;"></textarea></div>';

    html += '<button class="tp-btn tp-btn-primary" onclick="pnAddShiftEntry()" style="width:100%;padding:10px;font-size:12px;">+ Registrar en Bitácora</button>';
    html += '</div>';

    // Today's entries
    var todayEntries = pnState.shiftLog.filter(function(s) { return s.date === todayStr; }).reverse();
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title"><span>📋 Hoy (' + todayEntries.length + ' entradas)</span>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnExportShiftLog()" style="font-size:10px;">📤 Exportar</button></div>';

    if (todayEntries.length === 0) {
        html += '<div style="text-align:center;padding:30px;color:var(--tp-dim);font-size:11px;">Sin entradas hoy. Registra el inicio de turno.</div>';
    } else {
        todayEntries.forEach(function(entry, i) {
            var catColors = {
                'Inicio de turno': '#10b981', 'Prueba completada': '#3b82f6', 'Incidencia': '#ef4444',
                'Mantenimiento': '#f59e0b', 'Calibración': '#8b5cf6', 'Observación': '#64748b', 'Fin de turno': '#06b6d4'
            };
            var catColor = catColors[entry.category] || '#64748b';
            var catIcons = {
                'Inicio de turno': '🟢', 'Prueba completada': '✅', 'Incidencia': '🔴',
                'Mantenimiento': '🔧', 'Calibración': '📏', 'Observación': '📌', 'Fin de turno': '🔵'
            };
            var icon = catIcons[entry.category] || '📌';

            html += '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--tp-border);">';
            html += '<div style="min-width:45px;font-size:9px;color:var(--tp-dim);padding-top:2px;">' + (entry.time || '') + '</div>';
            html += '<div style="font-size:16px;line-height:1;">' + icon + '</div>';
            html += '<div style="flex:1;">';
            html += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:2px;">';
            html += '<span style="font-size:10px;font-weight:700;color:var(--tp-text);">' + (entry.operator || '?') + '</span>';
            html += '<span style="font-size:9px;padding:1px 6px;background:' + catColor + '20;color:' + catColor + ';border-radius:4px;">' + entry.category + '</span>';
            html += '</div>';
            html += '<div style="font-size:10px;color:var(--tp-dim);">' + (entry.notes || '') + '</div>';
            html += '</div>';
            html += '<button onclick="pnDeleteShiftEntry(\'' + entry.id + '\')" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size:12px;padding:4px;flex-shrink:0;">×</button>';
            html += '</div>';
        });
    }
    html += '</div>';

    // Previous days (grouped)
    var prevEntries = pnState.shiftLog.filter(function(s) { return s.date !== todayStr; });
    if (prevEntries.length > 0) {
        var grouped = {};
        prevEntries.forEach(function(e) {
            if (!grouped[e.date]) grouped[e.date] = [];
            grouped[e.date].push(e);
        });
        var dates = Object.keys(grouped).sort().reverse().slice(0, 7);

        html += '<div class="tp-card">';
        html += '<div class="tp-card-title"><span>📅 Dias Anteriores</span></div>';
        dates.forEach(function(date) {
            var entries = grouped[date];
            var dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
            html += '<details style="margin-bottom:6px;border:1px solid var(--tp-border);border-radius:6px;overflow:hidden;">';
            html += '<summary style="padding:8px 12px;cursor:pointer;font-size:11px;font-weight:700;color:var(--tp-text);background:var(--tp-card);display:flex;justify-content:space-between;">';
            html += '<span>' + dateLabel + '</span><span style="color:var(--tp-dim);">' + entries.length + ' entradas</span></summary>';
            entries.reverse().forEach(function(entry) {
                html += '<div style="display:flex;gap:8px;padding:5px 12px;border-top:1px solid var(--tp-border);font-size:10px;">';
                html += '<span style="color:var(--tp-dim);min-width:40px;">' + (entry.time || '') + '</span>';
                html += '<span style="font-weight:700;color:var(--tp-blue);min-width:70px;">' + (entry.operator || '?') + '</span>';
                html += '<span style="color:var(--tp-dim);flex:1;">[' + (entry.category || '') + '] ' + (entry.notes || '') + '</span>';
                html += '</div>';
            });
            html += '</details>';
        });
        html += '</div>';
    }

    el.innerHTML = html;
}

function pnAddShiftEntry() {
    var op = document.getElementById('pn-shift-operator');
    var cat = document.getElementById('pn-shift-category');
    var notes = document.getElementById('pn-shift-notes');
    if (!op || !op.value) { showToast('Selecciona un operador', 'error'); return; }
    if (!notes || !notes.value.trim()) { showToast('Escribe una nota', 'error'); return; }

    var now = new Date();
    pnState.shiftLog.push({
        id: 'sl_' + Date.now(),
        date: now.toISOString().substring(0, 10),
        time: now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        operator: op.value,
        category: cat ? cat.value : 'Observación',
        notes: notes.value.trim(),
        timestamp: now.toISOString()
    });

    // Keep last 500 entries
    if (pnState.shiftLog.length > 500) pnState.shiftLog = pnState.shiftLog.slice(-500);

    pnSave();
    pnRender();
    showToast('Entrada registrada', 'success');
}

function pnDeleteShiftEntry(id) {
    showConfirmDialog({ title: '⚠️ Eliminar entrada', message: '¿Eliminar esta entrada?', type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;
        pnState.shiftLog = pnState.shiftLog.filter(function(s) { return s.id !== id; });
        pnSave();
        pnRender();
    });
}

function pnExportShiftLog() {
    var todayStr = new Date().toISOString().substring(0, 10);
    var entries = pnState.shiftLog.filter(function(s) { return s.date === todayStr; });
    if (entries.length === 0) { showToast('Sin entradas hoy', 'error'); return; }

    var dateLabel = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var text = 'BITÁCORA DE TURNO\n' + dateLabel + '\n' + '─'.repeat(30) + '\n\n';
    entries.forEach(function(e, i) {
        text += (e.time || '??:??') + ' | ' + (e.operator || '?') + ' | [' + (e.category || '') + ']\n';
        text += '  ' + (e.notes || '') + '\n\n';
    });
    text += '─'.repeat(30) + '\nKIA EmLab ' + new Date().toLocaleString('es-MX');

    if (navigator.share) {
        navigator.share({ title: 'Bitácora ' + todayStr, text: text }).catch(function() {
            navigator.clipboard.writeText(text).then(function() { showToast('Copiado al portapapeles', 'success'); });
        });
    } else {
        navigator.clipboard.writeText(text).then(function() { showToast('Copiado al portapapeles', 'success'); });
    }
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  NOTIFICATIONS / ALERTS CENTER                                      ║
// ╚══════════════════════════════════════════════════════════════════════╝

function pnGetActiveAlerts() {
    var alerts = [];

    // Check vehicles stuck too long in a status
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var now = Date.now();
    vehicles.forEach(function(v) {
        if (v.status === 'archived') return;
        var lastAction = v.timeline && v.timeline.length > 0 ? new Date(v.timeline[v.timeline.length - 1].timestamp).getTime() : null;
        if (lastAction) {
            var hours = (now - lastAction) / 3600000;
            if (hours > 48 && v.status === 'registered') {
                alerts.push({ level: 'MEDIA', color: '#f59e0b', message: 'VIN ' + (v.vin || '?').slice(-6) + ' registrado hace ' + Math.round(hours) + 'h sin avanzar', source: 'COP15' });
            }
            if (hours > 24 && v.status === 'in-progress') {
                alerts.push({ level: 'ALTA', color: '#ef4444', message: 'VIN ' + (v.vin || '?').slice(-6) + ' en progreso hace ' + Math.round(hours) + 'h', source: 'COP15' });
            }
            if (hours > 12 && v.status === 'ready-release') {
                alerts.push({ level: 'MEDIA', color: '#f59e0b', message: 'VIN ' + (v.vin || '?').slice(-6) + ' listo para liberar hace ' + Math.round(hours) + 'h', source: 'COP15' });
            }
        }
    });

    // Check gas levels
    var invGases = (typeof invState !== 'undefined' && invState.gases) ? invState.gases : [];
    invGases.forEach(function(g) {
        if (!g.readings || g.readings.length === 0) return;
        var last = g.readings[g.readings.length - 1];
        if (last.psi < (g.criticalPSI || 200)) {
            alerts.push({ level: 'CRITICA', color: '#ef4444', message: 'Gas ' + g.name + ' en nivel CRITICO: ' + last.psi + ' PSI', source: 'Inventario' });
        } else if (last.psi < (g.reorderPSI || 500)) {
            alerts.push({ level: 'ALTA', color: '#f59e0b', message: 'Gas ' + g.name + ' bajo: ' + last.psi + ' PSI — reordenar', source: 'Inventario' });
        }
    });

    // Check equipment calibrations due
    var invEquip = (typeof invState !== 'undefined' && invState.equipment) ? invState.equipment : [];
    invEquip.forEach(function(eq) {
        if (!eq.nextCalibration) return;
        var daysUntil = Math.ceil((new Date(eq.nextCalibration).getTime() - now) / 86400000);
        if (daysUntil < 0) {
            alerts.push({ level: 'CRITICA', color: '#ef4444', message: 'Calibracion de ' + eq.name + ' VENCIDA hace ' + Math.abs(daysUntil) + ' dias', source: 'Inventario' });
        } else if (daysUntil <= 7) {
            alerts.push({ level: 'ALTA', color: '#f59e0b', message: 'Calibracion de ' + eq.name + ' vence en ' + daysUntil + ' dias', source: 'Inventario' });
        } else if (daysUntil <= 30) {
            alerts.push({ level: 'MEDIA', color: '#06b6d4', message: 'Calibracion de ' + eq.name + ' vence en ' + daysUntil + ' dias', source: 'Inventario' });
        }
    });

    // Check test plan coverage
    if (typeof tpState !== 'undefined' && tpState.weeklyPlans && tpState.weeklyPlans.length > 0) {
        var lastPlan = tpState.weeklyPlans[tpState.weeklyPlans.length - 1];
        var planAge = (now - new Date(lastPlan.created).getTime()) / 86400000;
        if (planAge > 7) {
            alerts.push({ level: 'MEDIA', color: '#f59e0b', message: 'Plan semanal tiene ' + Math.round(planAge) + ' dias — generar nuevo', source: 'Test Plan' });
        }
    }

    // Sort by severity
    var order = { 'CRITICA': 0, 'ALTA': 1, 'MEDIA': 2 };
    alerts.sort(function(a, b) { return (order[a.level] || 9) - (order[b.level] || 9); });

    return alerts;
}

function pnRenderAlerts(el) {
    var alerts = pnGetActiveAlerts();

    var html = '';

    // Summary
    var critical = alerts.filter(function(a) { return a.level === 'CRITICA'; }).length;
    var high = alerts.filter(function(a) { return a.level === 'ALTA'; }).length;
    var medium = alerts.filter(function(a) { return a.level === 'MEDIA'; }).length;

    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">';
    html += '<div class="tp-card" style="text-align:center;padding:14px;' + (critical > 0 ? 'border:2px solid #ef4444;' : '') + '">';
    html += '<div style="font-size:28px;font-weight:800;color:#ef4444;">' + critical + '</div>';
    html += '<div style="font-size:9px;color:var(--tp-dim);">Criticas</div></div>';
    html += '<div class="tp-card" style="text-align:center;padding:14px;' + (high > 0 ? 'border:2px solid #f59e0b;' : '') + '">';
    html += '<div style="font-size:28px;font-weight:800;color:#f59e0b;">' + high + '</div>';
    html += '<div style="font-size:9px;color:var(--tp-dim);">Altas</div></div>';
    html += '<div class="tp-card" style="text-align:center;padding:14px;">';
    html += '<div style="font-size:28px;font-weight:800;color:#06b6d4;">' + medium + '</div>';
    html += '<div style="font-size:9px;color:var(--tp-dim);">Medias</div></div>';
    html += '</div>';

    if (alerts.length === 0) {
        html += '<div class="tp-card" style="text-align:center;padding:40px;">';
        html += '<div style="font-size:40px;margin-bottom:10px;">✅</div>';
        html += '<div style="font-size:14px;font-weight:700;color:var(--tp-green);">Sin Alertas</div>';
        html += '<div style="font-size:11px;color:var(--tp-dim);margin-top:4px;">Todo el laboratorio opera con normalidad.</div>';
        html += '</div>';
    } else {
        // Group by source
        var bySource = {};
        alerts.forEach(function(a) {
            if (!bySource[a.source]) bySource[a.source] = [];
            bySource[a.source].push(a);
        });

        Object.keys(bySource).forEach(function(source) {
            var sourceAlerts = bySource[source];
            var sourceIcons = { 'COP15': '🔬', 'Inventario': '📦', 'Test Plan': '📊' };
            html += '<div class="tp-card">';
            html += '<div class="tp-card-title"><span>' + (sourceIcons[source] || '📌') + ' ' + source + ' (' + sourceAlerts.length + ')</span></div>';

            sourceAlerts.forEach(function(a) {
                html += '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--tp-border);">';
                html += '<span style="font-size:9px;padding:3px 8px;background:' + a.color + '20;color:' + a.color + ';border-radius:4px;font-weight:800;white-space:nowrap;flex-shrink:0;">' + a.level + '</span>';
                html += '<span style="font-size:11px;color:var(--tp-text);">' + a.message + '</span>';
                html += '</div>';
            });
            html += '</div>';
        });
    }

    // Notification settings
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title"><span>🔔 Configuracion de Alertas</span></div>';
    html += '<div style="font-size:10px;color:var(--tp-dim);margin-bottom:8px;">Las alertas se generan automaticamente al abrir este panel.</div>';
    html += '<div style="display:flex;gap:8px;">';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnRender()" style="flex:1;font-size:11px;">🔄 Actualizar Alertas</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnExportAlerts()" style="flex:1;font-size:11px;">📤 Exportar Reporte</button>';
    html += '</div></div>';

    el.innerHTML = html;
}

function pnExportAlerts() {
    var alerts = pnGetActiveAlerts();
    if (alerts.length === 0) { showToast('Sin alertas activas', 'info'); return; }

    var text = 'REPORTE DE ALERTAS — KIA EmLab\n' + new Date().toLocaleString('es-MX') + '\n' + '═'.repeat(40) + '\n\n';
    text += 'Total: ' + alerts.length + ' alertas activas\n\n';
    alerts.forEach(function(a, i) {
        text += (i + 1) + '. [' + a.level + '] ' + a.message + '\n   Fuente: ' + a.source + '\n\n';
    });
    text += '═'.repeat(40) + '\nGenerado automaticamente por KIA EmLab';

    if (navigator.share) {
        navigator.share({ title: 'Alertas EmLab', text: text }).catch(function() {
            navigator.clipboard.writeText(text).then(function() { showToast('Copiado', 'success'); });
        });
    } else {
        navigator.clipboard.writeText(text).then(function() { showToast('Copiado al portapapeles', 'success'); });
    }
}

// ── [R4-M5] Auto-Correlación Cross-Module (Intelligence Panel) ──────────────

function pnRenderIntelligence(el) {
    var html = '<div style="padding:12px 0;">';
    html += '<h3 style="color:var(--tp-amber);margin:0 0 12px 0;font-size:14px;">🧠 Panel de Inteligencia</h3>';
    html += '<p style="color:var(--tp-dim);font-size:11px;margin:0 0 16px 0;">Correlaciones automáticas entre módulos para detectar patrones.</p>';

    // Gather data from all modules
    var tests = (typeof raState !== 'undefined' && raState.tests) ? raState.tests : [];
    var gasItems = [];
    var fuelItems = [];
    if (typeof invState !== 'undefined' && invState.items) {
        invState.items.forEach(function(it) {
            if (it.type === 'gas') gasItems.push(it);
            else if (it.type === 'fuel') fuelItems.push(it);
        });
    }
    var tpPlans = (typeof tpState !== 'undefined' && tpState.plans) ? tpState.plans : [];
    var cop15Vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];

    // ── Correlation 1: Gas Consumption vs Test Volume (weekly) ──
    html += '<div class="tp-card" style="margin-bottom:12px;padding:12px;">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">📊 Consumo de Gas vs Volumen de Pruebas</h4>';

    var weeklyData = {};
    tests.forEach(function(t) {
        if (!t.date) return;
        var d = new Date(t.date);
        var weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        var wk = weekStart.toISOString().slice(0, 10);
        if (!weeklyData[wk]) weeklyData[wk] = { tests: 0, gasUsed: 0 };
        weeklyData[wk].tests++;
    });

    // Cross-reference gas usage logs
    gasItems.forEach(function(g) {
        if (g.usageLog) {
            g.usageLog.forEach(function(log) {
                if (!log.date) return;
                var d = new Date(log.date);
                var weekStart = new Date(d);
                weekStart.setDate(d.getDate() - d.getDay());
                var wk = weekStart.toISOString().slice(0, 10);
                if (!weeklyData[wk]) weeklyData[wk] = { tests: 0, gasUsed: 0 };
                weeklyData[wk].gasUsed += (log.psiUsed || 0);
            });
        }
    });

    var wkKeys = Object.keys(weeklyData).sort().slice(-12);
    if (wkKeys.length >= 2) {
        html += '<canvas id="pn-intel-gas-tests" height="200"></canvas>';
    } else {
        html += '<p style="color:var(--tp-dim);font-size:10px;">Datos insuficientes. Se necesitan al menos 2 semanas con pruebas y consumo de gas registrados.</p>';
    }
    html += '</div>';

    // ── Correlation 2: Fail Rate vs Gas Age ──
    html += '<div class="tp-card" style="margin-bottom:12px;padding:12px;">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">⚠️ Tasa de Fallo vs Antigüedad del Gas</h4>';

    var gasAgeGroups = { fresh: { pass: 0, fail: 0 }, mid: { pass: 0, fail: 0 }, old: { pass: 0, fail: 0 } };
    var gasDateMap = {};
    gasItems.forEach(function(g) {
        if (g.installDate || g.receivedDate) {
            gasDateMap[g.gasType || g.name] = new Date(g.installDate || g.receivedDate);
        }
    });

    tests.forEach(function(t) {
        if (!t.date || !t.gasType) return;
        var gasDate = gasDateMap[t.gasType];
        if (!gasDate) return;
        var ageDays = Math.floor((new Date(t.date) - gasDate) / 86400000);
        var bucket = ageDays < 30 ? 'fresh' : ageDays < 90 ? 'mid' : 'old';
        if (t.result === 'FAIL' || t.status === 'fail') gasAgeGroups[bucket].fail++;
        else gasAgeGroups[bucket].pass++;
    });

    var hasAgeData = gasAgeGroups.fresh.pass + gasAgeGroups.fresh.fail + gasAgeGroups.mid.pass + gasAgeGroups.mid.fail + gasAgeGroups.old.pass + gasAgeGroups.old.fail > 0;
    if (hasAgeData) {
        html += '<canvas id="pn-intel-fail-age" height="200"></canvas>';
    } else {
        html += '<p style="color:var(--tp-dim);font-size:10px;">Sin datos de correlación. Requiere pruebas con gasType asociado a cilindros con fecha de instalación.</p>';
    }
    html += '</div>';

    // ── Correlation 3: Plan Velocity vs Pipeline Load ──
    html += '<div class="tp-card" style="margin-bottom:12px;padding:12px;">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">🚀 Velocidad del Plan vs Carga del Pipeline</h4>';

    var velocityData = [];
    tpPlans.forEach(function(plan) {
        if (!plan.records || !plan.families) return;
        var totalFamilies = plan.families.length;
        var completedRecords = plan.records.filter(function(r) { return r.status === 'completed'; }).length;
        var pendingRecords = plan.records.filter(function(r) { return r.status !== 'completed'; }).length;
        var velocity = totalFamilies > 0 ? Math.round((completedRecords / totalFamilies) * 100) : 0;
        velocityData.push({
            name: plan.name || ('Plan ' + plan.id),
            velocity: velocity,
            pipeline: pendingRecords,
            completed: completedRecords
        });
    });

    if (velocityData.length >= 1) {
        html += '<canvas id="pn-intel-velocity" height="200"></canvas>';
    } else {
        html += '<p style="color:var(--tp-dim);font-size:10px;">Sin planes de prueba activos. Cree un plan en Test Plan Manager para ver la correlación.</p>';
    }
    html += '</div>';

    // ── Summary Stats ──
    html += '<div class="tp-card" style="padding:12px;">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">📈 Resumen Cross-Module</h4>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';

    var totalTests = tests.length;
    var totalGas = gasItems.length;
    var totalVehicles = cop15Vehicles.length;
    var totalPlans = tpPlans.length;
    var failRate = totalTests > 0 ? ((tests.filter(function(t) { return t.result === 'FAIL' || t.status === 'fail'; }).length / totalTests) * 100).toFixed(1) : '0.0';

    html += '<div style="text-align:center;padding:8px;background:rgba(59,130,246,0.1);border-radius:6px;"><div style="font-size:18px;font-weight:700;color:#3b82f6;">' + totalTests + '</div><div style="font-size:9px;color:var(--tp-dim);">Pruebas Totales</div></div>';
    html += '<div style="text-align:center;padding:8px;background:rgba(16,185,129,0.1);border-radius:6px;"><div style="font-size:18px;font-weight:700;color:#10b981;">' + totalVehicles + '</div><div style="font-size:9px;color:var(--tp-dim);">Vehículos COP15</div></div>';
    html += '<div style="text-align:center;padding:8px;background:rgba(245,158,11,0.1);border-radius:6px;"><div style="font-size:18px;font-weight:700;color:#f59e0b;">' + totalGas + '</div><div style="font-size:9px;color:var(--tp-dim);">Cilindros Gas</div></div>';
    html += '<div style="text-align:center;padding:8px;background:rgba(239,68,68,0.1);border-radius:6px;"><div style="font-size:18px;font-weight:700;color:#ef4444;">' + failRate + '%</div><div style="font-size:9px;color:var(--tp-dim);">Tasa de Fallo</div></div>';
    html += '</div></div>';

    html += '</div>';
    el.innerHTML = html;

    // Render charts after DOM is ready
    setTimeout(function() { _pnIntelRenderCharts(wkKeys, weeklyData, gasAgeGroups, hasAgeData, velocityData); }, 50);
}

function _pnIntelRenderCharts(wkKeys, weeklyData, gasAgeGroups, hasAgeData, velocityData) {
    if (typeof Chart === 'undefined') return;

    // Chart 1: Gas Consumption vs Test Volume
    var c1 = document.getElementById('pn-intel-gas-tests');
    if (c1 && wkKeys.length >= 2) {
        var labels = wkKeys.map(function(w) { return w.slice(5); });
        var testCounts = wkKeys.map(function(w) { return weeklyData[w].tests; });
        var gasCounts = wkKeys.map(function(w) { return weeklyData[w].gasUsed; });
        if (window._pnIntelChart1) { try { window._pnIntelChart1.destroy(); } catch(e) {} }
        window._pnIntelChart1 = new Chart(c1.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Pruebas', data: testCounts, backgroundColor: 'rgba(59,130,246,0.7)', yAxisID: 'y', order: 2 },
                    { label: 'PSI Consumidos', data: gasCounts, type: 'line', borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.3, yAxisID: 'y1', order: 1 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8', font: { size: 9 } } } },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 8 } }, grid: { color: 'rgba(30,41,59,0.5)' } },
                    y: { position: 'left', title: { display: true, text: 'Pruebas', color: '#64748b', font: { size: 9 } }, ticks: { color: '#64748b', font: { size: 8 } }, grid: { color: 'rgba(30,41,59,0.3)' } },
                    y1: { position: 'right', title: { display: true, text: 'PSI', color: '#64748b', font: { size: 9 } }, ticks: { color: '#64748b', font: { size: 8 } }, grid: { display: false } }
                }
            }
        });
    }

    // Chart 2: Fail Rate vs Gas Age
    var c2 = document.getElementById('pn-intel-fail-age');
    if (c2 && hasAgeData) {
        var ageLabels = ['< 30 días', '30-90 días', '> 90 días'];
        var ageBuckets = ['fresh', 'mid', 'old'];
        var failRates = ageBuckets.map(function(b) {
            var total = gasAgeGroups[b].pass + gasAgeGroups[b].fail;
            return total > 0 ? Math.round((gasAgeGroups[b].fail / total) * 100) : 0;
        });
        var totalPerBucket = ageBuckets.map(function(b) { return gasAgeGroups[b].pass + gasAgeGroups[b].fail; });
        if (window._pnIntelChart2) { try { window._pnIntelChart2.destroy(); } catch(e) {} }
        window._pnIntelChart2 = new Chart(c2.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ageLabels,
                datasets: [
                    { label: '% Fallo', data: failRates, backgroundColor: ['rgba(16,185,129,0.7)', 'rgba(245,158,11,0.7)', 'rgba(239,68,68,0.7)'] },
                    { label: 'Total Pruebas', data: totalPerBucket, type: 'line', borderColor: '#8b5cf6', backgroundColor: 'transparent', tension: 0.3, yAxisID: 'y1' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8', font: { size: 9 } } } },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(30,41,59,0.3)' } },
                    y: { title: { display: true, text: '% Fallo', color: '#64748b', font: { size: 9 } }, ticks: { color: '#64748b', font: { size: 8 } }, grid: { color: 'rgba(30,41,59,0.3)' }, max: 100 },
                    y1: { position: 'right', title: { display: true, text: 'Pruebas', color: '#64748b', font: { size: 9 } }, ticks: { color: '#64748b', font: { size: 8 } }, grid: { display: false } }
                }
            }
        });
    }

    // Chart 3: Plan Velocity vs Pipeline
    var c3 = document.getElementById('pn-intel-velocity');
    if (c3 && velocityData.length >= 1) {
        var planLabels = velocityData.map(function(v) { return v.name.length > 15 ? v.name.slice(0, 15) + '…' : v.name; });
        var velocities = velocityData.map(function(v) { return v.velocity; });
        var pipelines = velocityData.map(function(v) { return v.pipeline; });
        if (window._pnIntelChart3) { try { window._pnIntelChart3.destroy(); } catch(e) {} }
        window._pnIntelChart3 = new Chart(c3.getContext('2d'), {
            type: 'bar',
            data: {
                labels: planLabels,
                datasets: [
                    { label: '% Completado', data: velocities, backgroundColor: 'rgba(16,185,129,0.7)' },
                    { label: 'Pendientes', data: pipelines, backgroundColor: 'rgba(239,68,68,0.5)' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8', font: { size: 9 } } } },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 8 } }, grid: { color: 'rgba(30,41,59,0.3)' } },
                    y: { ticks: { color: '#64748b', font: { size: 8 } }, grid: { color: 'rgba(30,41,59,0.3)' } }
                }
            }
        });
    }
}

// ── [R4-M8] Monitor de Salud del Sistema ────────────────────────────────────

function pnRenderSystemHealth(el) {
    var html = '<div style="padding:12px 0;">';
    html += '<h3 style="color:var(--tp-amber);margin:0 0 12px 0;font-size:14px;">💾 Monitor de Salud del Sistema</h3>';

    // Storage breakdown
    var storageKeys = [
        { key: 'kia_db_v11', label: 'COP15 (Base de Datos)', module: 'cop15' },
        { key: 'kia_testplan_v1', label: 'Test Plan Manager', module: 'testplan' },
        { key: 'kia_results_v1', label: 'Results Analyzer', module: 'results' },
        { key: 'kia_lab_inventory', label: 'Lab Inventory', module: 'inventory' },
        { key: 'kia_panel_v1', label: 'Panel', module: 'panel' },
        { key: 'kia_chart_configs', label: 'Chart Configs', module: 'charts' },
        { key: 'kia_entity_notes', label: 'Notas', module: 'notes' },
        { key: 'kia_soak_timer', label: 'Soak Timer', module: 'soak' },
        { key: 'kia_firebase_queue', label: 'Firebase Queue', module: 'firebase' }
    ];

    var totalBytes = 0;
    var breakdown = [];
    storageKeys.forEach(function(sk) {
        try {
            var val = localStorage.getItem(sk.key);
            var bytes = val ? new Blob([val]).size : 0;
            totalBytes += bytes;
            breakdown.push({ key: sk.key, label: sk.label, module: sk.module, bytes: bytes, raw: val });
        } catch(e) {
            breakdown.push({ key: sk.key, label: sk.label, module: sk.module, bytes: 0, raw: null });
        }
    });

    // Also count unknown keys
    var knownKeys = storageKeys.map(function(s) { return s.key; });
    var otherBytes = 0;
    for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (knownKeys.indexOf(k) === -1) {
            try {
                var v = localStorage.getItem(k);
                otherBytes += v ? new Blob([v]).size : 0;
            } catch(e) {}
        }
    }
    if (otherBytes > 0) {
        totalBytes += otherBytes;
        breakdown.push({ key: '_other', label: 'Otros', module: 'other', bytes: otherBytes, raw: null });
    }

    var maxStorage = 5 * 1024 * 1024; // 5MB
    var usedPct = ((totalBytes / maxStorage) * 100).toFixed(1);
    var barColor = totalBytes > maxStorage * 0.8 ? '#ef4444' : totalBytes > maxStorage * 0.5 ? '#f59e0b' : '#10b981';

    html += '<div class="tp-card" style="margin-bottom:12px;padding:12px;">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">📦 Uso de Almacenamiento</h4>';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    html += '<span style="font-size:11px;color:var(--tp-dim);">' + _pnFormatBytes(totalBytes) + ' / 5 MB</span>';
    html += '<span style="font-size:11px;font-weight:700;color:' + barColor + ';">' + usedPct + '%</span>';
    html += '</div>';
    html += '<div style="width:100%;height:8px;background:rgba(30,41,59,0.8);border-radius:4px;overflow:hidden;">';
    html += '<div style="width:' + Math.min(parseFloat(usedPct), 100) + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width 0.3s;"></div>';
    html += '</div>';

    // Per-module breakdown
    html += '<div style="margin-top:10px;">';
    breakdown.sort(function(a, b) { return b.bytes - a.bytes; });
    breakdown.forEach(function(b) {
        if (b.bytes === 0) return;
        var pct = totalBytes > 0 ? ((b.bytes / totalBytes) * 100).toFixed(1) : '0.0';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(30,41,59,0.3);">';
        html += '<span style="font-size:10px;color:#e2e8f0;">' + b.label + '</span>';
        html += '<span style="font-size:10px;color:var(--tp-dim);">' + _pnFormatBytes(b.bytes) + ' (' + pct + '%)</span>';
        html += '</div>';
    });
    html += '</div></div>';

    // ── Data Aging ──
    html += '<div class="tp-card" style="margin-bottom:12px;padding:12px;">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">📅 Antigüedad de Datos</h4>';

    var now = Date.now();
    var agingData = [];

    // COP15 vehicles aging
    if (typeof db !== 'undefined' && db.vehicles) {
        var cop30 = 0, cop60 = 0, cop90 = 0;
        db.vehicles.forEach(function(v) {
            var ts = v.timestamp || v.createdAt;
            if (!ts) return;
            var age = (now - new Date(ts).getTime()) / 86400000;
            if (age > 90) cop90++;
            else if (age > 60) cop60++;
            else if (age > 30) cop30++;
        });
        agingData.push({ label: 'COP15 Vehículos', module: 'cop15', d30: cop30, d60: cop60, d90: cop90, total: db.vehicles.length });
    }

    // RA tests aging
    if (typeof raState !== 'undefined' && raState.tests) {
        var ra30 = 0, ra60 = 0, ra90 = 0;
        raState.tests.forEach(function(t) {
            if (!t.date) return;
            var age = (now - new Date(t.date).getTime()) / 86400000;
            if (age > 90) ra90++;
            else if (age > 60) ra60++;
            else if (age > 30) ra30++;
        });
        agingData.push({ label: 'Resultados (Pruebas)', module: 'results', d30: ra30, d60: ra60, d90: ra90, total: raState.tests.length });
    }

    // TP records aging
    if (typeof tpState !== 'undefined' && tpState.plans) {
        var tp30 = 0, tp60 = 0, tp90 = 0, tpTotal = 0;
        tpState.plans.forEach(function(p) {
            if (!p.records) return;
            p.records.forEach(function(r) {
                tpTotal++;
                var ts = r.completedAt || r.createdAt;
                if (!ts) return;
                var age = (now - new Date(ts).getTime()) / 86400000;
                if (age > 90) tp90++;
                else if (age > 60) tp60++;
                else if (age > 30) tp30++;
            });
        });
        agingData.push({ label: 'Test Plan (Registros)', module: 'testplan', d30: tp30, d60: tp60, d90: tp90, total: tpTotal });
    }

    if (agingData.length > 0) {
        html += '<table style="width:100%;font-size:10px;border-collapse:collapse;">';
        html += '<tr style="color:var(--tp-dim);border-bottom:1px solid rgba(30,41,59,0.5);">';
        html += '<th style="text-align:left;padding:4px;">Módulo</th>';
        html += '<th style="text-align:center;padding:4px;">Total</th>';
        html += '<th style="text-align:center;padding:4px;">30-60d</th>';
        html += '<th style="text-align:center;padding:4px;">60-90d</th>';
        html += '<th style="text-align:center;padding:4px;">>90d</th>';
        html += '</tr>';
        agingData.forEach(function(a) {
            html += '<tr style="color:#e2e8f0;border-bottom:1px solid rgba(30,41,59,0.2);">';
            html += '<td style="padding:4px;">' + a.label + '</td>';
            html += '<td style="text-align:center;padding:4px;">' + a.total + '</td>';
            html += '<td style="text-align:center;padding:4px;color:#f59e0b;">' + a.d30 + '</td>';
            html += '<td style="text-align:center;padding:4px;color:#ef4444;">' + a.d60 + '</td>';
            html += '<td style="text-align:center;padding:4px;color:#dc2626;font-weight:700;">' + a.d90 + '</td>';
            html += '</tr>';
        });
        html += '</table>';
    } else {
        html += '<p style="color:var(--tp-dim);font-size:10px;">Sin datos para analizar antigüedad.</p>';
    }
    html += '</div>';

    // ── Purge Tools ──
    html += '<div class="tp-card" style="margin-bottom:12px;padding:12px;">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">🗑️ Herramientas de Limpieza</h4>';
    html += '<p style="color:var(--tp-dim);font-size:10px;margin:0 0 10px 0;">Elimina datos antiguos para liberar espacio. Los datos se eliminan permanentemente.</p>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    html += '<button class="tp-btn" onclick="pnPurgeOldData(\'cop15\', 90)" style="font-size:10px;padding:6px 10px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">COP15 >90 días</button>';
    html += '<button class="tp-btn" onclick="pnPurgeOldData(\'results\', 90)" style="font-size:10px;padding:6px 10px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">Resultados >90 días</button>';
    html += '<button class="tp-btn" onclick="pnPurgeOldData(\'testplan\', 90)" style="font-size:10px;padding:6px 10px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">Test Plan >90 días</button>';
    html += '<button class="tp-btn" onclick="pnPurgeOldData(\'notes\', 90)" style="font-size:10px;padding:6px 10px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">Notas >90 días</button>';
    html += '</div>';
    html += '</div>';

    // ── Performance ──
    html += '<div class="tp-card" style="padding:12px;">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">⚡ Rendimiento</h4>';
    var perfData = _pnMeasurePerformance();
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
    html += '<div style="text-align:center;padding:6px;background:rgba(59,130,246,0.1);border-radius:6px;"><div style="font-size:16px;font-weight:700;color:#3b82f6;">' + perfData.lsKeys + '</div><div style="font-size:9px;color:var(--tp-dim);">Keys localStorage</div></div>';
    html += '<div style="text-align:center;padding:6px;background:rgba(16,185,129,0.1);border-radius:6px;"><div style="font-size:16px;font-weight:700;color:#10b981;">' + perfData.domNodes + '</div><div style="font-size:9px;color:var(--tp-dim);">DOM Nodes</div></div>';
    html += '<div style="text-align:center;padding:6px;background:rgba(245,158,11,0.1);border-radius:6px;"><div style="font-size:16px;font-weight:700;color:#f59e0b;">' + perfData.memoryMB + '</div><div style="font-size:9px;color:var(--tp-dim);">Memoria (MB)</div></div>';
    html += '<div style="text-align:center;padding:6px;background:rgba(139,92,246,0.1);border-radius:6px;"><div style="font-size:16px;font-weight:700;color:#8b5cf6;">' + perfData.charts + '</div><div style="font-size:9px;color:var(--tp-dim);">Charts Activos</div></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
    el.innerHTML = html;
}

function _pnFormatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

function _pnMeasurePerformance() {
    var lsKeys = 0;
    try { lsKeys = localStorage.length; } catch(e) {}
    var domNodes = document.querySelectorAll('*').length;
    var memoryMB = '—';
    if (performance && performance.memory) {
        memoryMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
    }
    var charts = 0;
    ['_raTrendChart', '_raComplianceChart', '_raSpcIChart', '_raSpcMrChart', '_tpBurndownChart', '_invChartInstance', '_pnIntelChart1', '_pnIntelChart2', '_pnIntelChart3'].forEach(function(name) {
        if (window[name]) charts++;
    });
    return { lsKeys: lsKeys, domNodes: domNodes, memoryMB: memoryMB, charts: charts };
}

function pnPurgeOldData(module, maxDays) {
    showConfirm('¿Eliminar datos de ' + module + ' con más de ' + maxDays + ' días? Esta acción es irreversible.', function() {
        var cutoff = Date.now() - (maxDays * 86400000);
        var count = 0;

        if (module === 'cop15' && typeof db !== 'undefined' && db.vehicles) {
            var before = db.vehicles.length;
            db.vehicles = db.vehicles.filter(function(v) {
                var ts = v.timestamp || v.createdAt;
                return !ts || new Date(ts).getTime() >= cutoff;
            });
            count = before - db.vehicles.length;
            if (count > 0) saveDB();
        } else if (module === 'results' && typeof raState !== 'undefined' && raState.tests) {
            var before2 = raState.tests.length;
            raState.tests = raState.tests.filter(function(t) {
                return !t.date || new Date(t.date).getTime() >= cutoff;
            });
            count = before2 - raState.tests.length;
            if (count > 0 && typeof raSave === 'function') raSave();
        } else if (module === 'testplan' && typeof tpState !== 'undefined' && tpState.plans) {
            tpState.plans.forEach(function(p) {
                if (!p.records) return;
                var before3 = p.records.length;
                p.records = p.records.filter(function(r) {
                    var ts = r.completedAt || r.createdAt;
                    return !ts || new Date(ts).getTime() >= cutoff;
                });
                count += before3 - p.records.length;
            });
            if (count > 0 && typeof tpSave === 'function') tpSave();
        } else if (module === 'notes') {
            try {
                var notes = JSON.parse(localStorage.getItem('kia_entity_notes') || '{}');
                Object.keys(notes).forEach(function(entityKey) {
                    var arr = notes[entityKey];
                    if (!Array.isArray(arr)) return;
                    var before4 = arr.length;
                    notes[entityKey] = arr.filter(function(n) {
                        return !n.ts || new Date(n.ts).getTime() >= cutoff;
                    });
                    count += before4 - notes[entityKey].length;
                    if (notes[entityKey].length === 0) delete notes[entityKey];
                });
                localStorage.setItem('kia_entity_notes', JSON.stringify(notes));
            } catch(e) {}
        }

        showToast('Eliminados ' + count + ' registros de ' + module, count > 0 ? 'success' : 'info');
        pnRenderSystemHealth(document.getElementById('pn-content'));
    });
}

// ══════════════════════════════════════════════════════════════════════
// [R5-M7] Unified Calendar — Cross-module event aggregation
// ══════════════════════════════════════════════════════════════════════

var _calYear, _calMonth;

function pnRenderCalendar(el) {
    if (!_calYear) { var d = new Date(); _calYear = d.getFullYear(); _calMonth = d.getMonth(); }

    var events = _pnCollectCalendarEvents(_calYear, _calMonth);
    var html = '<div class="tp-card" style="padding:16px;">';

    // Header with nav
    var monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
    html += '<button onclick="_pnCalendarNav(-1)" class="btn-secondary" style="padding:4px 12px;">←</button>';
    html += '<span style="font-size:14px;font-weight:800;color:var(--tp-text);">' + monthNames[_calMonth] + ' ' + _calYear + '</span>';
    html += '<div style="display:flex;gap:6px;">';
    html += '<button onclick="_pnCalendarToday()" class="btn-secondary" style="padding:4px 10px;font-size:10px;">Hoy</button>';
    html += '<button onclick="_pnCalendarNav(1)" class="btn-secondary" style="padding:4px 12px;">→</button>';
    html += '</div></div>';

    // Day headers
    var dayNames = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    html += '<div class="cal-grid">';
    dayNames.forEach(function(d) {
        html += '<div class="cal-header">' + d + '</div>';
    });

    // Build calendar grid
    var firstDay = new Date(_calYear, _calMonth, 1);
    var lastDay = new Date(_calYear, _calMonth + 1, 0);
    var startWeekday = (firstDay.getDay() + 6) % 7; // Monday = 0
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    // Empty cells before first day
    for (var e = 0; e < startWeekday; e++) {
        html += '<div class="cal-cell cal-empty"></div>';
    }

    // Day cells
    for (var day = 1; day <= lastDay.getDate(); day++) {
        var dateStr = _calYear + '-' + String(_calMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        var dayEvents = events.filter(function(ev) { return ev.date === dateStr; });
        var isToday = dateStr === todayStr;

        html += '<div class="cal-cell' + (isToday ? ' cal-today' : '') + '" onclick="_pnCalendarDayClick(\'' + dateStr + '\')">';
        html += '<div class="cal-day-num">' + day + '</div>';

        if (dayEvents.length > 0) {
            html += '<div class="cal-dots">';
            // Show up to 3 dots
            var shown = {};
            dayEvents.slice(0, 3).forEach(function(ev) {
                if (!shown[ev.color]) {
                    html += '<span class="cal-dot" style="background:' + ev.color + ';"></span>';
                    shown[ev.color] = true;
                }
            });
            if (dayEvents.length > 3) html += '<span style="font-size:9px;color:var(--tp-dim);">+' + (dayEvents.length - 3) + '</span>';
            html += '</div>';
        }
        html += '</div>';
    }

    html += '</div>';

    // Week summary
    var thisWeekEvents = _pnCalendarWeekSummary(events);
    if (thisWeekEvents) {
        html += '<div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:10px;color:var(--tp-dim);">';
        html += '<strong style="color:var(--tp-text);">Esta semana:</strong> ' + thisWeekEvents;
        html += '</div>';
    }

    // Legend
    html += '<div style="display:flex;gap:12px;margin-top:10px;flex-wrap:wrap;">';
    [{ color: '#ef4444', label: 'Vencido/Agotado' }, { color: '#f59e0b', label: 'Próximo' }, { color: '#3b82f6', label: 'Planificado' }, { color: '#10b981', label: 'Release/Completado' }].forEach(function(l) {
        html += '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--tp-dim);"><span style="width:8px;height:8px;border-radius:50%;background:' + l.color + ';display:inline-block;"></span> ' + l.label + '</div>';
    });
    html += '</div></div>';

    el.innerHTML = html;
}

function _pnCollectCalendarEvents(year, month) {
    var events = [];
    var monthStart = new Date(year, month, 1);
    var monthEnd = new Date(year, month + 1, 0);

    // Equipment calibrations
    if (typeof invState !== 'undefined' && invState.equipment) {
        invState.equipment.forEach(function(eq) {
            if (!eq.nextCalDate) return;
            var d = new Date(eq.nextCalDate);
            if (d >= monthStart && d <= monthEnd) {
                var dateStr = eq.nextCalDate.slice(0, 10);
                var isPast = d < new Date();
                events.push({
                    date: dateStr,
                    type: 'calibration',
                    color: isPast ? '#ef4444' : '#f59e0b',
                    label: (isPast ? '⚠ Cal vencida: ' : '🔧 Cal: ') + (eq.name || eq.id),
                    module: 'Inventario'
                });
            }
        });
    }

    // Gas depletion predictions (approximate)
    if (typeof invState !== 'undefined' && invState.gases) {
        invState.gases.forEach(function(g) {
            if (g.status !== 'active' || !g.readings || g.readings.length < 2) return;
            var last2 = g.readings.slice(-2);
            var rate = (last2[0].psi || last2[0].value || 0) - (last2[1].psi || last2[1].value || 0);
            if (rate <= 0) return;
            var current = last2[1].psi || last2[1].value || 0;
            var daysLeft = current / rate;
            if (daysLeft > 60) return;
            var depDate = new Date();
            depDate.setDate(depDate.getDate() + Math.round(daysLeft));
            if (depDate >= monthStart && depDate <= monthEnd) {
                var dateStr = depDate.toISOString().slice(0, 10);
                events.push({
                    date: dateStr,
                    type: 'gas_depletion',
                    color: daysLeft < 7 ? '#ef4444' : '#f59e0b',
                    label: '⛽ Gas agota: ' + (g.controlNo || g.gasType || g.id),
                    module: 'Inventario'
                });
            }
        });
    }

    // Test plan items
    if (typeof tpState !== 'undefined' && tpState.weeklyPlans) {
        tpState.weeklyPlans.forEach(function(plan) {
            if (!plan.weekStart) return;
            var ws = new Date(plan.weekStart);
            // Show each day of the week
            for (var i = 0; i < 5; i++) {
                var d = new Date(ws);
                d.setDate(d.getDate() + i);
                if (d >= monthStart && d <= monthEnd) {
                    var dateStr = d.toISOString().slice(0, 10);
                    var pending = (plan.items || []).filter(function(it) { return !it.completed; }).length;
                    if (pending > 0) {
                        events.push({
                            date: dateStr,
                            type: 'test_plan',
                            color: '#3b82f6',
                            label: '🧪 ' + pending + ' pruebas plan semanal',
                            module: 'Test Plan'
                        });
                    }
                }
            }
        });
    }

    // Vehicle release estimates
    if (typeof db !== 'undefined' && db.vehicles) {
        db.vehicles.forEach(function(v) {
            if (v.status === 'archived') return;
            if (v.status === 'ready-release') {
                // Expected release today or soon
                var d = new Date();
                if (d >= monthStart && d <= monthEnd) {
                    events.push({
                        date: d.toISOString().slice(0, 10),
                        type: 'release',
                        color: '#10b981',
                        label: '🏁 Listo: VIN ...' + (v.vin || '').slice(-6),
                        module: 'COP15'
                    });
                }
            }
        });
    }

    return events;
}

function _pnCalendarDayClick(dateStr) {
    var events = _pnCollectCalendarEvents(_calYear, _calMonth);
    var dayEvents = events.filter(function(ev) { return ev.date === dateStr; });
    if (dayEvents.length === 0) {
        showToast('Sin eventos para ' + dateStr, 'info');
        return;
    }
    var html = '<div style="max-height:40vh;overflow-y:auto;">';
    dayEvents.forEach(function(ev) {
        html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #1e293b;">';
        html += '<span style="width:8px;height:8px;border-radius:50%;background:' + ev.color + ';flex-shrink:0;"></span>';
        html += '<div>';
        html += '<div style="font-size:12px;font-weight:600;color:var(--tp-text);">' + ev.label + '</div>';
        html += '<div style="font-size:9px;color:var(--tp-dim);">' + ev.module + '</div>';
        html += '</div></div>';
    });
    html += '</div>';
    showModal(html, 'Eventos — ' + dateStr);
}

function _pnCalendarNav(dir) {
    _calMonth += dir;
    if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    pnRender();
}

function _pnCalendarToday() {
    var d = new Date();
    _calYear = d.getFullYear();
    _calMonth = d.getMonth();
    pnRender();
}

function _pnCalendarWeekSummary(events) {
    var now = new Date();
    var dayOfWeek = (now.getDay() + 6) % 7;
    var weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    var weekStartStr = weekStart.toISOString().slice(0, 10);
    var weekEndStr = weekEnd.toISOString().slice(0, 10);

    var weekEvents = events.filter(function(ev) { return ev.date >= weekStartStr && ev.date <= weekEndStr; });
    if (weekEvents.length === 0) return '';

    var counts = {};
    weekEvents.forEach(function(ev) { counts[ev.type] = (counts[ev.type] || 0) + 1; });
    var parts = [];
    if (counts.calibration) parts.push(counts.calibration + ' calibraciones');
    if (counts.test_plan) parts.push(counts.test_plan + ' pruebas');
    if (counts.gas_depletion) parts.push(counts.gas_depletion + ' gases');
    if (counts.release) parts.push(counts.release + ' releases');
    return parts.join(', ');
}

// ══════════════════════════════════════════════════════════════════════
// [R5-M6] Structured Shift Report
// ══════════════════════════════════════════════════════════════════════

function pnGenerateShiftReport() {
    var report = _pnCollectTurnoverData();
    report.id = 'sr_' + Date.now();
    report.timestamp = new Date().toISOString();
    report.operator = pnState.currentOperator || 'Sistema';

    // Prompt for notes
    var notes = prompt('Notas del turno (opcional):');
    report.notes = notes || '';

    // Save
    if (!pnState.shiftReports) pnState.shiftReports = [];
    pnState.shiftReports.unshift(report);
    if (pnState.shiftReports.length > 30) pnState.shiftReports = pnState.shiftReports.slice(0, 30);
    pnSave();

    // Show report
    pnRenderShiftReport(report);
    showToast('Reporte de turno generado', 'success');
}

function _pnCollectTurnoverData() {
    var data = {
        vehiclesInProgress: [],
        pendingTests: 0,
        activeAlerts: [],
        gasesLow: [],
        turnoStats: { completed: 0, released: 0 }
    };

    // Vehicles in progress
    if (typeof db !== 'undefined' && db.vehicles) {
        data.vehiclesInProgress = db.vehicles.filter(function(v) {
            return v.status !== 'archived';
        }).map(function(v) {
            return {
                vin: (v.vin || '').slice(-8),
                status: v.status,
                model: v.config ? v.config.Modelo : '',
                purpose: v.purpose || ''
            };
        });
        data.turnoStats.released = db.vehicles.filter(function(v) {
            return v.status === 'archived' && v.archivedAt &&
                   new Date(v.archivedAt).toDateString() === new Date().toDateString();
        }).length;
    }

    // Pending tests
    if (typeof tpState !== 'undefined' && tpState.weeklyPlans && tpState.weeklyPlans.length > 0) {
        var latest = tpState.weeklyPlans[tpState.weeklyPlans.length - 1];
        data.pendingTests = (latest.items || []).filter(function(it) { return !it.completed; }).length;
    }

    // Low gases
    if (typeof invState !== 'undefined' && invState.gases) {
        data.gasesLow = invState.gases.filter(function(g) {
            if (g.status !== 'active' || !g.readings || g.readings.length === 0) return false;
            var last = g.readings[g.readings.length - 1];
            return (last.psi || last.value || 999) < 200;
        }).map(function(g) {
            return { controlNo: g.controlNo, gasType: g.gasType, psi: g.readings[g.readings.length - 1].psi || g.readings[g.readings.length - 1].value };
        });
    }

    return data;
}

function pnRenderShiftReport(report) {
    var html = '<div style="max-height:60vh;overflow-y:auto;">';

    // Header
    html += '<div style="text-align:center;margin-bottom:16px;">';
    html += '<div style="font-size:12px;color:var(--tp-dim);">' + new Date(report.timestamp).toLocaleString('es-MX') + '</div>';
    html += '<div style="font-size:11px;color:var(--tp-dim);margin-top:2px;">Operador: ' + escapeHtml(report.operator) + '</div>';
    html += '</div>';

    // KPIs
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">';
    html += '<div class="tp-card" style="text-align:center;padding:10px;"><div style="font-size:20px;font-weight:800;color:#3b82f6;">' + report.vehiclesInProgress.length + '</div><div style="font-size:9px;color:var(--tp-dim);">En progreso</div></div>';
    html += '<div class="tp-card" style="text-align:center;padding:10px;"><div style="font-size:20px;font-weight:800;color:#f59e0b;">' + report.pendingTests + '</div><div style="font-size:9px;color:var(--tp-dim);">Pruebas pend.</div></div>';
    html += '<div class="tp-card" style="text-align:center;padding:10px;"><div style="font-size:20px;font-weight:800;color:' + (report.gasesLow.length > 0 ? '#ef4444' : '#10b981') + ';">' + report.gasesLow.length + '</div><div style="font-size:9px;color:var(--tp-dim);">Gases bajos</div></div>';
    html += '</div>';

    // Vehicles in progress
    if (report.vehiclesInProgress.length > 0) {
        html += '<div style="margin-bottom:12px;"><div style="font-size:11px;font-weight:700;color:var(--tp-text);margin-bottom:6px;">Vehículos activos:</div>';
        report.vehiclesInProgress.forEach(function(v) {
            var statusColor = v.status === 'testing' ? '#8b5cf6' : v.status === 'ready-release' ? '#10b981' : '#f59e0b';
            html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:10px;border-bottom:1px solid #1e293b;">';
            html += '<span style="color:var(--tp-text);">...' + v.vin + ' ' + (v.model || '') + '</span>';
            html += '<span style="color:' + statusColor + ';font-weight:700;">' + v.status + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    // Gases low
    if (report.gasesLow.length > 0) {
        html += '<div style="margin-bottom:12px;"><div style="font-size:11px;font-weight:700;color:#ef4444;margin-bottom:6px;">⚠ Gases con presión baja:</div>';
        report.gasesLow.forEach(function(g) {
            html += '<div style="font-size:10px;color:var(--tp-dim);padding:2px 0;">' + escapeHtml(g.controlNo) + ' (' + escapeHtml(g.gasType) + '): ' + g.psi + ' PSI</div>';
        });
        html += '</div>';
    }

    // Notes
    if (report.notes) {
        html += '<div style="margin-bottom:12px;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid var(--tp-border);font-size:10px;color:var(--tp-dim);"><strong style="color:var(--tp-text);">Notas:</strong> ' + escapeHtml(report.notes) + '</div>';
    }

    html += '<div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">';
    html += '<button onclick="_pnShiftReportCopy(' + report.id.replace('sr_', '') + ')" class="btn-secondary" style="padding:6px 14px;font-size:10px;">📋 Copiar</button>';
    html += '<button onclick="closeModal()" class="btn-primary" style="padding:6px 14px;font-size:10px;">Cerrar</button>';
    html += '</div></div>';

    showModal(html, 'Reporte de Turno');
}

function _pnShiftReportCopy(tsId) {
    var report = (pnState.shiftReports || []).find(function(r) { return r.id === 'sr_' + tsId; });
    if (!report) return;
    var text = 'REPORTE DE TURNO\n';
    text += 'Fecha: ' + new Date(report.timestamp).toLocaleString('es-MX') + '\n';
    text += 'Operador: ' + report.operator + '\n\n';
    text += 'Vehículos en progreso: ' + report.vehiclesInProgress.length + '\n';
    text += 'Pruebas pendientes: ' + report.pendingTests + '\n';
    text += 'Gases bajos: ' + report.gasesLow.length + '\n';
    if (report.notes) text += '\nNotas: ' + report.notes + '\n';
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
        showToast('Reporte copiado al portapapeles', 'success');
    }
}

/** Show last shift report on login */
function pnShowTurnoverOnLogin() {
    if (!pnState.shiftReports || pnState.shiftReports.length === 0) return;
    var lastReport = pnState.shiftReports[0];
    // Only show if report is from today or yesterday
    var reportDate = new Date(lastReport.timestamp);
    var hoursDiff = (Date.now() - reportDate.getTime()) / (1000 * 60 * 60);
    if (hoursDiff > 24) return;
    pnRenderShiftReport(lastReport);
}
