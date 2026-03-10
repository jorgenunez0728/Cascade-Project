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

    // KPI grid
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:12px;">';

    html += '<div class="tp-card" style="text-align:center;padding:12px;">';
    html += '<div style="font-size:24px;font-weight:800;color:#3b82f6;">' + activeVehicles.length + '</div>';
    html += '<div style="font-size:9px;color:var(--tp-dim);">Vehiculos Activos</div>';
    html += '</div>';

    html += '<div class="tp-card" style="text-align:center;padding:12px;">';
    html += '<div style="font-size:24px;font-weight:800;color:#10b981;">' + archivedToday.length + '</div>';
    html += '<div style="font-size:9px;color:var(--tp-dim);">Liberados Hoy</div>';
    html += '</div>';

    html += '<div class="tp-card" style="text-align:center;padding:12px;">';
    html += '<div style="font-size:24px;font-weight:800;color:#f59e0b;">' + tpPct + '%</div>';
    html += '<div style="font-size:9px;color:var(--tp-dim);">Plan Semanal</div>';
    html += '</div>';

    html += '<div class="tp-card" style="text-align:center;padding:12px;">';
    html += '<div style="font-size:24px;font-weight:800;color:#8b5cf6;">' + raTests.length + '</div>';
    html += '<div style="font-size:9px;color:var(--tp-dim);">Pruebas Results</div>';
    html += '</div>';

    html += '<div class="tp-card" style="text-align:center;padding:12px;">';
    html += '<div style="font-size:24px;font-weight:800;color:' + (lowGases.length > 0 ? '#ef4444' : '#10b981') + ';">' + lowGases.length + '</div>';
    html += '<div style="font-size:9px;color:var(--tp-dim);">Gases Bajos</div>';
    html += '</div>';

    html += '<div class="tp-card" style="text-align:center;padding:12px;">';
    html += '<div style="font-size:24px;font-weight:800;color:#06b6d4;">' + pnState.operators.filter(function(o) { return o.active; }).length + '</div>';
    html += '<div style="font-size:9px;color:var(--tp-dim);">Operadores</div>';
    html += '</div>';
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
        html += '<div style="font-size:8px;color:var(--tp-dim);">' + st.label + '</div>';
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
            html += '<span style="font-size:8px;padding:2px 6px;background:' + a.color + '20;color:' + a.color + ';border-radius:4px;font-weight:700;">' + a.level + '</span>';
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
            html += '<div style="font-size:8px;color:var(--tp-dim);">' + passCount + '/' + tests.length + ' PASS</div>';
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
                html += '<span style="font-weight:700;color:' + urgClr + ';">~' + p.pred.daysLeft + 'd <span style="font-size:8px;font-weight:400;">(' + p.pred.confidence + ')</span></span>';
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
            html += '<span style="font-size:8px;padding:2px 6px;background:rgba(6,182,212,0.15);color:#06b6d4;border-radius:4px;">' + (op.role || 'Técnico') + '</span>';
            if (!op.active) html += '<span style="font-size:8px;padding:2px 6px;background:rgba(239,68,68,0.15);color:#ef4444;border-radius:4px;">Inactivo</span>';
            html += op.pinHash ? '<span style="font-size:8px;padding:2px 6px;background:rgba(16,185,129,0.15);color:#10b981;border-radius:4px;">PIN ✓</span>' : '<span style="font-size:8px;padding:2px 6px;background:rgba(239,68,68,0.15);color:#ef4444;border-radius:4px;">Sin PIN</span>';
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
    if (!confirm('¿Eliminar a ' + op.name + '? Los registros existentes no se afectan.')) return;
    pnState.operators.splice(idx, 1);
    pnSave();
    pnSyncOperators();
    pnRender();
    showToast('Operador eliminado', 'info');
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
            html += '<span style="font-size:8px;padding:1px 6px;background:' + catColor + '20;color:' + catColor + ';border-radius:4px;">' + entry.category + '</span>';
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
    if (!confirm('¿Eliminar esta entrada?')) return;
    pnState.shiftLog = pnState.shiftLog.filter(function(s) { return s.id !== id; });
    pnSave();
    pnRender();
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
                html += '<span style="font-size:8px;padding:3px 8px;background:' + a.color + '20;color:' + a.color + ';border-radius:4px;font-weight:800;white-space:nowrap;flex-shrink:0;">' + a.level + '</span>';
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
