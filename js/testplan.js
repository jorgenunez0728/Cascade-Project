// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Test Plan Manager Module                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── [Fase 2.1] Debounced render wrappers for search inputs ──
var _tpDebouncedDashRender = debounce(tpRenderDashTable, 250);
var _tpDebouncedRender = debounce(tpRender, 250);

// ── [Fase 2.4] Memoization cache for expensive TP calculations ──
var _tpCache = { planHash: null, families: null, analysis: null };
function _tpInvalidateCache() { _tpCache.planHash = null; }
function _tpGetPlanHash() {
    if (!tpState || !tpState.planData) return '';
    return tpState.planData.length + '_' + tpState.testedList.length + '_' + (tpState._lastSave || 0);
}

// ======================================================================
// WEEKLY PLAN HELPERS
// ======================================================================
function tpAddManualPick() {
    const sel = document.getElementById('tp-manual-pick-select');
    if (!sel || !sel.value) return;
    window._tpWeeklyManualPicks = window._tpWeeklyManualPicks || [];
    // v20.1: se PERMITEN repetidas. Fijar la misma configuración dos veces es pedir dos
    // vehículos idénticos en la semana — el caso que el laboratorio no podía expresar.
    // El generador automático sigue sin repetir por su cuenta (ver tpSelectWeeklyItems).
    const yaHay = window._tpWeeklyManualPicks.filter(function(p) { return p === sel.value; }).length;
    window._tpWeeklyManualPicks.push(sel.value);
    if (yaHay > 0 && typeof showToast === 'function') {
        showToast('Fijada ' + (yaHay + 1) + ' veces: ' + (yaHay + 1) + ' vehículos de esta configuración esta semana.', 'info');
    }
    sel.value = '';
    tpRender();
}
function tpRemoveWeeklyItem(wk, idx) {
    var _plan = tpState.weeklyPlans[wk];
    var _lbl = (_plan && _plan.items[idx]) ? _plan.items[idx].desc : '';
    showConfirmDialog({ title: '⚠️ Quitar del plan', message: '¿Quitar del plan?', type: 'warning', confirmText: 'Sí', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;
        // Acción destructiva: se puede deshacer y queda en el control de cambios.
        if (typeof undoPush === 'function') undoPush('testplan', 'Quitar del plan semanal');
        tpState.weeklyPlans[wk].items.splice(idx, 1);
        tpSave(); tpRender();
        if (typeof auditLog === 'function') auditLog('tp', 'week_item_removed', { type: 'plan', label: _lbl }, 'Semana ' + (wk + 1));
    });
}

/**
 * Asigna a un item el primer par (preacon → prueba) con lugar libre en la semana.
 * NO se usa tpAssignSchedule aquí: baraja, así que reprogramaría toda una semana
 * ya publicada solo por agregar un vehículo.
 */
function tpAssignSlotForItem(plan, item) {
    var slots = tpBuildTestSlots(plan.workDays || window._tpWorkDays || {});
    var perSlot = Math.max(1, parseInt(tpState.vehiclesPerSlot, 10) || 1);
    var count = {};
    (plan.items || []).forEach(function(it) { if (it.testDay) count[it.testDay] = (count[it.testDay] || 0) + 1; });
    for (var i = 0; i < slots.length; i++) {
        if ((count[slots[i].test] || 0) < perSlot) {
            item.preconDay = slots[i].precon; item.testDay = slots[i].test;
            item.preconLabel = slots[i].preconLabel; item.testLabel = slots[i].testLabel;
            item.unscheduled = false;
            return true;
        }
    }
    item.preconDay = null; item.testDay = null;
    item.preconLabel = null; item.testLabel = null;
    item.unscheduled = true;
    return false;
}

function tpAddToWeek(wk) {
    var sel = document.getElementById('tp-edit-add-' + wk);
    if (!sel || !sel.value) return;
    var cfg = tpState.planData.find(function(c) { return c.desc === sel.value; });
    var plan = tpState.weeklyPlans[wk];
    if (!cfg || !plan) return;

    // _tpMakeItem calcula required/deficit/score Y el _scoreDetail que la insignia
    // de puntaje necesita — antes se armaba a mano y el item salía sin explicación.
    var item = _tpMakeItem(cfg, tpState.testedList.slice(), { manual: true });
    var cap = tpWeekCapacity(plan.workDays || window._tpWorkDays || {});

    var push = function() {
        tpAssignSlotForItem(plan, item);
        plan.items.push(item);
        tpSave(); tpRender();
        if (item.unscheduled) showToast('Agregada, pero sin día libre — quedó fuera de horario.', 'warning');
    };

    if (plan.items.length >= cap.max) {
        showConfirm('La semana ya tiene ' + plan.items.length + ' de ' + cap.max + ' lugares reales.\n\n' +
                    'Se puede agregar igual, pero quedará sin día asignado.', push,
                    { title: 'Excede la capacidad', type: 'warning', confirmText: 'Agregar de todos modos' });
        return;
    }
    push();
}

// ======================================================================
// EXPORT WEEKLY PLAN (Share/Clipboard)
// ======================================================================
function tpExportWeeklyPlan(wk) {
    const plan = tpState.weeklyPlans[wk];
    if (!plan) return;
    const dt = plan.weekDate ? new Date(plan.weekDate + 'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}) : new Date(plan.created).toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'});
    const done = plan.items.filter(i=>i.completed).length;
    const carryover = plan.items.filter(i=>i.status==='carryover').length;
    let t = `PLAN SEMANAL #${wk+1}\nSemana del: ${dt}\n${done}/${plan.items.length} completadas${carryover > 0 ? ' | ' + carryover + ' carryover' : ''}\n${'─'.repeat(28)}\n\n`;
    plan.items.forEach((item, i) => {
        const schedStr = item.testLabel ? ` [Preacon ${item.preconLabel} → Prueba ${item.testLabel}]` : '';
        const statusIcon = item.completed ? '[X]' : item.status === 'carryover' ? '[C]' : '[ ]';
        t += `${statusIcon} ${i+1}. ${item.desc}\n    ${item.rgn||'?'} | ${item.reg||'?'}${item.manual?' (obligatoria)':''}${item.carriedOver?' (carryover)':''}${schedStr}\n\n`;
    });
    t += `${'─'.repeat(28)}\nKIA EmLab ${new Date().toLocaleString('es-MX')}`;
    if (navigator.share) {
        navigator.share({ title: 'Plan Semanal #'+(wk+1), text: t }).catch(() => {
            navigator.clipboard.writeText(t).then(() => showToast('Copiado al portapapeles', 'success'));
        });
    } else {
        navigator.clipboard.writeText(t).then(() => showToast('Copiado al portapapeles', 'success'));
    }
}

// ======================================================================
// PLAN VS ACTUAL + CARRY-OVER
// ======================================================================
function tpRenderPlanActual(el) {
    const plans = tpState.weeklyPlans || [];
    if (plans.length === 0) { el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">No hay planes generados.<br><button class="tp-btn tp-btn-primary" onclick="tpSwitchTab(\'tp-weekly\');" style="margin-top:12px;">📅 Generar Plan Semanal</button></div>'; return; }
    const wData = plans.map((w,i) => {
        const t = w.items.length, d = w.items.filter(x=>x.completed).length, co = w.items.filter(x=>x.status==='carryover').length;
        return { week:i+1, total:t, done:d, carryover:co, pct:t>0?Math.round(d/t*100):0, created:w.created, weekDate:w.weekDate, accepted:w.accepted };
    });
    const avgPct = Math.round(wData.reduce((s,w)=>s+w.pct,0)/wData.length);
    const totDone = wData.reduce((s,w)=>s+w.done,0);
    const avgVel = (totDone/wData.length).toFixed(1);
    const lastAcc = [...plans].reverse().find(p=>p.accepted);
    const carry = lastAcc ? lastAcc.items.filter(i=>!i.completed) : [];

    el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:6px;margin-bottom:10px;">
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">${plans.length}</div><div class="tp-metric-label">Semanas</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">${totDone}</div><div class="tp-metric-label">Completadas</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">${avgPct}%</div><div class="tp-metric-label">Cumplimiento</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">${avgVel}</div><div class="tp-metric-label">Vel (pruebas/sem)</div></div>
    </div>
    ${carry.length>0?`
    <div class="tp-card" style="border-left:3px solid var(--tp-red);">
        <div class="tp-card-title"><span style="color:var(--tp-red);font-size: var(--fs-sm);">🔄 Carry-over (${carry.length} pendientes)</span>
        <button class="tp-btn tp-btn-primary" onclick="tpCarryOver()" style="font-size: var(--fs-xs);">Agregar al próximo</button></div>
        ${carry.map(c=>`<div style="padding:2px 6px;font-size: var(--fs-xs);color:var(--tp-amber);border:1px solid var(--tp-border);border-radius:3px;margin-bottom:2px;">${c.desc}</div>`).join('')}
    </div>`:''}
    <div class="tp-card">
        <div class="tp-card-title"><span>Cumplimiento</span></div>
        <div style="display:flex;align-items:flex-end;gap:3px;height:100px;padding:8px 0;">
            ${wData.map(w=>`
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;">
                <span style="font-size: var(--fs-xs);font-weight:700;color:${w.pct===100?'var(--tp-green)':w.pct>=50?'var(--tp-amber)':'var(--tp-red)'};">${w.pct}%</span>
                <div style="width:100%;max-width:35px;background:var(--tp-border);border-radius:3px;height:65px;position:relative;overflow:hidden;">
                    <div style="position:absolute;bottom:0;width:100%;height:${w.pct}%;background:${w.pct===100?'var(--tp-green)':w.pct>=50?'var(--tp-amber)':'var(--tp-red)'};border-radius:3px;"></div>
                </div>
                <span style="font-size: var(--fs-xs);color:var(--tp-dim);">S${w.week}</span>
            </div>`).join('')}
        </div>
    </div>
    <div class="tp-card">
        <div class="tp-card-title"><span>Detalle</span></div>
        <div style="overflow-x:auto;">
        <table class="tp-table" style="width:100%;">
            <thead><tr><th>Sem</th><th>Fecha</th><th>Plan</th><th>OK</th><th>%</th><th></th></tr></thead>
            <tbody>${wData.map(w=>`<tr>
                <td style="font-weight:700;">S${w.week}</td>
                <td style="font-size: var(--fs-xs);">${new Date(w.created).toLocaleDateString('es-MX',{day:'numeric',month:'short'})}</td>
                <td>${w.total}</td>
                <td style="font-weight:700;color:${w.done===w.total?'var(--tp-green)':'var(--tp-red)'};">${w.done}</td>
                <td><div class="tp-bar" style="width:40px;"><div class="tp-bar-fill" style="width:${w.pct}%;background:${w.pct===100?'var(--tp-green)':'var(--tp-amber)'}"></div><span class="tp-bar-text" style="font-size: var(--fs-xs);">${w.pct}%</span></div></td>
                <td><button class="tp-btn tp-btn-ghost" onclick="tpExportWeeklyPlan(${w.week-1})" style="font-size: var(--fs-xs);">📤</button></td>
            </tr>`).join('')}</tbody>
        </table></div>
    </div>`;
}

function tpCarryOver() {
    const plans = tpState.weeklyPlans || [];
    const last = [...plans].reverse().find(p=>p.accepted);
    if (!last) { showToast('No hay plan aceptado previo', 'warning'); return; }
    const inc = last.items.filter(i=>!i.completed);
    if (inc.length===0) { showToast('Todo completado', 'success'); return; }
    window._tpWeeklyManualPicks = window._tpWeeklyManualPicks || [];
    inc.forEach(i => { if (!window._tpWeeklyManualPicks.includes(i.desc)) window._tpWeeklyManualPicks.push(i.desc); });
    tpSwitchTab('tp-weekly');
    showToast(inc.length + ' pendientes agregadas como obligatorias.', 'info');
}

// ======================================================================
// CONFIG PANEL
// ======================================================================

function tpRenderPlanHistory(el) {
    var diff = tpState.lastDiff || null;
    var history = tpState.planHistory || [];

    var html = '<div class="tp-card"><div class="tp-card-title"><span>Historial de Importaciones</span></div>';
    if (history.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);font-size: var(--fs-sm);">Sin historial previo.</div>';
    } else {
        html += '<table class="tp-table" style="width:100%;"><thead><tr><th>Fecha</th><th>Configs</th><th>Vol Total</th></tr></thead><tbody>';
        history.forEach(function(h) {
            html += '<tr><td style="font-size: var(--fs-xs);">' + new Date(h.date).toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'}) + '</td><td>' + h.configCount + '</td><td>' + h.totalVol.toLocaleString() + '</td></tr>';
        });
        html += '</tbody></table>';
    }
    html += '</div>';

    if (diff) {
        html += '<div class="tp-card" style="border-left:3px solid var(--tp-blue);">';
        html += '<div class="tp-card-title"><span>Ultimo Cambio (' + new Date(tpState.lastDiffDate||'').toLocaleDateString('es-MX',{day:'numeric',month:'short'}) + ')</span></div>';

        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(75px,1fr));gap:5px;margin-bottom:8px;">';
        html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">' + diff.added.length + '</div><div class="tp-metric-label">Nuevas</div></div>';
        html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">' + diff.removed.length + '</div><div class="tp-metric-label">Retiradas</div></div>';
        html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--ok-text)">' + diff.volUp.length + '</div><div class="tp-metric-label">Vol +</div></div>';
        html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--danger-text)">' + diff.volDown.length + '</div><div class="tp-metric-label">Vol -</div></div>';
        html += '</div>';

        if (diff.monthsDetected) {
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:6px;padding:6px 8px;background:var(--tp-bg);border-radius:6px;">';
            html += '📅 Meses detectados en el CSV: ' + (diff.monthsDetected.length ? diff.monthsDetected.join(', ') : '<span style="color:var(--tp-amber);">ninguno</span>');
            if (diff.unrecognizedCols && diff.unrecognizedCols.length > 0) {
                html += '<br>⚠ Columnas no reconocidas (ni campo conocido ni formato de mes): ' + diff.unrecognizedCols.join(', ');
            }
            html += '</div>';
        }

        if (diff.volUp.length > 0) {
            html += '<div style="margin-bottom:6px;"><div style="font-size: var(--fs-xs);font-weight:700;color:var(--ok-text);margin-bottom:3px;">\u{1F4C8} Subieron volumen</div>';
            diff.volUp.slice(0,20).forEach(function(d) {
                html += '<div style="display:flex;justify-content:space-between;padding:3px 6px;font-size: var(--fs-xs);border:1px solid rgba(16,185,129,0.2);border-radius:4px;margin-bottom:2px;background:rgba(16,185,129,0.05);">';
                html += '<span style="color:var(--tp-amber);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">' + d.desc + '</span>';
                html += '<span><span style="color:var(--tp-dim);">' + d.oldVol.toLocaleString() + '</span> \u2192 <span style="color:var(--ok-text);font-weight:700;">' + d.newVol.toLocaleString() + '</span></span></div>';
            });
            html += '</div>';
        }

        if (diff.volDown.length > 0) {
            html += '<div style="margin-bottom:6px;"><div style="font-size: var(--fs-xs);font-weight:700;color:var(--danger-text);margin-bottom:3px;">\u{1F4C9} Bajaron volumen</div>';
            diff.volDown.slice(0,20).forEach(function(d) {
                html += '<div style="display:flex;justify-content:space-between;padding:3px 6px;font-size: var(--fs-xs);border:1px solid rgba(239,68,68,0.2);border-radius:4px;margin-bottom:2px;background:rgba(239,68,68,0.05);">';
                html += '<span style="color:var(--tp-amber);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">' + d.desc + '</span>';
                html += '<span><span style="color:var(--tp-dim);">' + d.oldVol.toLocaleString() + '</span> \u2192 <span style="color:var(--danger-text);font-weight:700;">' + d.newVol.toLocaleString() + '</span></span></div>';
            });
            html += '</div>';
        }

        if (diff.added.length > 0) {
            html += '<div style="margin-bottom:6px;"><div style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-green);margin-bottom:3px;">\u{1F195} Nuevas</div>';
            diff.added.slice(0,15).forEach(function(c) {
                html += '<div style="padding:2px 6px;font-size: var(--fs-xs);color:var(--tp-green);border:1px solid rgba(16,185,129,0.2);border-radius:3px;margin-bottom:2px;">' + c.desc + ' \u2014 ' + c.total.toLocaleString() + ' uds</div>';
            });
            if (diff.added.length > 15) html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">... y ' + (diff.added.length-15) + ' mas</div>';
            html += '</div>';
        }

        if (diff.removed.length > 0) {
            html += '<div><div style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-red);margin-bottom:3px;">\u{1F5D1} Retiradas (conservadas vol=0)</div>';
            diff.removed.slice(0,15).forEach(function(c) {
                html += '<div style="padding:2px 6px;font-size: var(--fs-xs);color:var(--tp-red);opacity:0.7;border:1px solid rgba(239,68,68,0.2);border-radius:3px;margin-bottom:2px;">' + c.desc + '</div>';
            });
            html += '</div>';
        }

        html += '</div>';
    } else {
        html += '<div class="tp-card" style="text-align:center;padding:20px;color:var(--tp-dim);">Importa un plan actualizado para ver cambios.</div>';
    }

    el.innerHTML = html;
}


// ======================================================================
// RA: OUTLIER DETECTION
// ======================================================================


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M16] TEST PLAN MANAGER — ENGINE                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

const TP_PURPOSES_VALID = ['Correlacion', 'Investigacion', 'COP-Emisiones', 'EO-Emisiones', 'COP-OBD2', 'EO-OBD2', 'ND-Emisiones', 'ND-OBD2'];
const TP_MONTHS = ['Feb-26','Mar-26','Apr-26','May-26','Jun-26','Jul-26']; // semilla por defecto; los meses reales viven en tpState.months (dinámicos)

// ── Meses de producción dinámicos (etiquetas 'MMM-YY') ──
var _TP_MON_ABBR = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12,
                     ene:1,abr:4,ago:8,dic:12,
                     enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12,
                     january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
var _TP_MON_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// v16.2: formatos más tolerantes — antes solo "Feb-26" (3-4 letras + guión opcional + 2
// dígitos); ahora también espacio como separador, nombre completo (Agosto/August), año de
// 4 dígitos (Ago-2026) y formato ISO "2026-08" — para que un CSV con encabezados de mes en
// otro formato SÍ se reconozca en vez de desaparecer silenciosamente de tpMonths().
function _tpParseMonthLabel(label) {
    var s = (label == null ? '' : String(label)).trim();
    var m = /^([A-Za-z]{3,10})[-\s]?(\d{2}|\d{4})$/.exec(s);
    if (m) {
        var word = m[1].toLowerCase();
        var mo = _TP_MON_ABBR[word] || _TP_MON_ABBR[word.slice(0, 4)] || _TP_MON_ABBR[word.slice(0, 3)];
        if (mo) {
            var yy = parseInt(m[2], 10);
            if (yy > 99) yy = yy % 100;
            return { mo: mo, yy: yy, key: yy * 12 + mo };
        }
    }
    var iso = /^(\d{4})[-\/](\d{1,2})$/.exec(s);
    if (iso) {
        var moN = parseInt(iso[2], 10);
        if (moN >= 1 && moN <= 12) {
            var yy2 = parseInt(iso[1], 10) % 100;
            return { mo: moN, yy: yy2, key: yy2 * 12 + moN };
        }
    }
    return null;
}
function _tpIsMonthLabel(label) { return !!_tpParseMonthLabel(label); }
function _tpCanonMonth(label) {
    var p = _tpParseMonthLabel(label);
    return p ? (_TP_MON_NAMES[p.mo] + '-' + String(p.yy).padStart(2, '0')) : label;
}
function _tpSortMonths(labels) {
    return labels.slice().sort(function(a, b) {
        var pa = _tpParseMonthLabel(a), pb = _tpParseMonthLabel(b);
        return (pa ? pa.key : 0) - (pb ? pb.key : 0);
    });
}
function tpMonths() { return (tpState.months && tpState.months.length) ? tpState.months : TP_MONTHS; }

// v16.2: ¿lleva 3+ meses seguidos (los más recientes) sin volumen planeado? cfg.m está
// alineado posicionalmente con tpMonths() (ya ordenado cronológicamente en el import).
function tpIsDormant(cfg) {
    if (!cfg || !cfg.m || cfg.m.length < 3 || tpMonths().length < 3) return false;
    return cfg.m.slice(-3).every(function(v) { return !v; });
}

const TP_LS_KEY = 'kia_testplan_v1';

let tpState = safeParse(TP_LS_KEY, null) || {
    planData: [],        // production plan configs
    testedList: [],
    weeklyPlans: [],
    planHistory: [],
    weekHistory: [],     // archived accepted weeks for historical consultation
    lastDiff: null,      // [{configText, date, note, source, purpose}]
    rules: [
        {id:1,region:"USA",regulation:"SULEV 30",ratio:3,per:1000,label:"USA / SULEV 30"},
        {id:2,region:"USA",regulation:"*",ratio:3,per:1000,label:"USA / Otros"},
        {id:3,region:"CANADA",regulation:"*",ratio:3,per:1000,label:"Canada"},
        {id:4,region:"EUROPE",regulation:"EURO-6C",ratio:4,per:1000,label:"Europe / EURO-6C"},
        {id:5,region:"EUROPE",regulation:"*",ratio:3,per:1000,label:"Europe / Otros"},
        {id:6,region:"MEXICO",regulation:"*",ratio:2,per:1000,label:"Mexico"},
        {id:7,region:"GENERAL",regulation:"EURO-6C",ratio:3,per:1000,label:"General / EURO-6C"},
        {id:8,region:"GENERAL",regulation:"*",ratio:2,per:1000,label:"General / Otros"},
        {id:9,region:"MIDDLE EAST",regulation:"*",ratio:2,per:1000,label:"Middle East"},
        {id:10,region:"BRAZIL",regulation:"*",ratio:2,per:1000,label:"Brazil"},
        {id:11,region:"AUSTRALIA",regulation:"*",ratio:2,per:1000,label:"Australia"},
        {id:12,region:"*",regulation:"*",ratio:1,per:1000,label:"Default (catch-all)"},
    ],
    weights: { volume:35, compliance:25, region:20, newConfig:10, urgency:10 },
    regionPriority: { EUROPE:100, USA:90, CANADA:80, GENERAL:60, MEXICO:55, 'MIDDLE EAST':50, BRAZIL:50, RUSSIA:45, AUSTRALIA:40, '*':50 },
    familyOverrides: {}, // { [familyKey]: {criticality:'critical'|'high'|'normal', deadline:'YYYY-MM-DD', note} }
    configOverrides: {}, // { [configDesc]: {deadline:'YYYY-MM-DD'} } — deadline particular por variante
    fixedPlan: null,     // {date, plan[]}
    fixedWeeklyPlan: null, // {fixedDate, capacity, numWeeks, weeks[{week, items[{desc,completed,...}]}]}
    capacity: 8,
    weeks: 4,
    activeTab: 'tp-dashboard',
    planImportDate: null,
    rulePresets: [],
};
// ═══════════════════════════════════════════════════════════════════════════════
// [v20] BLINDAJE DE tpState — LA garantía de que la plataforma Plan abre
//
// `tpState = safeParse(TP_LS_KEY, null) || { ...defaults }` (arriba): los defaults
// del literal **solo aplican en un dispositivo virgen**. Con cualquier estado
// guardado se salta el objeto entero y solo rellenan los `if (!tpState.x)` de
// abajo — y `planData`, `testedList`, `rules` y `weights` NO estaban entre ellos.
//
// Eso no es teórico: `_fbPullSeed` hace `tpState = remoteData` y solo preserva una
// lista fija, así que un pull desde un dispositivo con código viejo (o cualquier
// remoto sin esas claves) deja `tpState.weights` en `undefined` y revienta la
// cadena tpPriorityScore → tpGetAnalysis → tpCoverageSummary → tpUpdateBadges →
// **switchPlatform**: la pestaña Plan deja de abrir por completo. Reproducido.
//
// REGLA: toda clave nueva de tpState que se lea con `.algo` se registra AQUÍ, no
// solo en el literal de defaults.
// ═══════════════════════════════════════════════════════════════════════════════
function _tpEnsureState() {
    if (!Array.isArray(tpState.planData))    tpState.planData = [];
    if (!Array.isArray(tpState.testedList))  tpState.testedList = [];
    if (!Array.isArray(tpState.weeklyPlans)) tpState.weeklyPlans = [];
    if (!Array.isArray(tpState.planHistory)) tpState.planHistory = [];
    if (!Array.isArray(tpState.weekHistory)) tpState.weekHistory = [];
    if (!Array.isArray(tpState.rulePresets)) tpState.rulePresets = [];
    if (!Array.isArray(tpState.rules) || !tpState.rules.length) tpState.rules = tpDefaultRules();
    if (!tpState.weights || typeof tpState.weights !== 'object') {
        tpState.weights = { volume:35, compliance:25, region:20, newConfig:10, urgency:10 };
    }
    if (tpState.weights.region === undefined) tpState.weights.region = 0; // no rompe sumas viejas
    if (!tpState.regionPriority || typeof tpState.regionPriority !== 'object') {
        tpState.regionPriority = { EUROPE:100, USA:90, CANADA:80, GENERAL:60, MEXICO:55, 'MIDDLE EAST':50, BRAZIL:50, RUSSIA:45, AUSTRALIA:40, '*':50 };
    }
    if (!tpState.familyOverrides) tpState.familyOverrides = {};
    if (!tpState.configOverrides) tpState.configOverrides = {};
    if (typeof tpState.capacity !== 'number') tpState.capacity = 8;
    if (typeof tpState.weeks !== 'number')    tpState.weeks = 4;
    if (!tpState._migr || typeof tpState._migr !== 'object') tpState._migr = {}; // guardas de migración
    if (typeof tpSoakCfg === 'function') tpSoakCfg();                            // v20: horas de reposo
    // v20.8: la carrocería entró a la clave de familia — remapear claves guardadas
    try { _tpMigrateFamilyKeysBody(); } catch (e) {}
    return tpState;
}

/** Las reglas de ratio por default — extraídas para que _tpEnsureState pueda resembrarlas. */
function tpDefaultRules() {
    return [
        {id:1,region:"USA",regulation:"SULEV 30",ratio:3,per:1000,label:"USA / SULEV 30"},
        {id:2,region:"USA",regulation:"*",ratio:3,per:1000,label:"USA / Otros"},
        {id:3,region:"CANADA",regulation:"*",ratio:3,per:1000,label:"Canada"},
        {id:4,region:"EUROPE",regulation:"EURO-6C",ratio:4,per:1000,label:"Europe / EURO-6C"},
        {id:5,region:"EUROPE",regulation:"*",ratio:3,per:1000,label:"Europe / Otros"},
        {id:6,region:"MEXICO",regulation:"*",ratio:2,per:1000,label:"Mexico"},
        {id:7,region:"GENERAL",regulation:"EURO-6C",ratio:3,per:1000,label:"General / EURO-6C"},
        {id:8,region:"GENERAL",regulation:"*",ratio:2,per:1000,label:"General / Otros"},
        {id:9,region:"MIDDLE EAST",regulation:"*",ratio:2,per:1000,label:"Middle East"},
        {id:10,region:"BRAZIL",regulation:"*",ratio:2,per:1000,label:"Brazil"},
        {id:11,region:"AUSTRALIA",regulation:"*",ratio:2,per:1000,label:"Australia"},
        {id:12,region:"*",regulation:"*",ratio:1,per:1000,label:"Default (catch-all)"},
    ];
}

_tpEnsureState();
// ── Migración suave para datos ya guardados en localStorage ──
// ── [Recuperación] Estado para el Plan de Recuperación ──
if (!tpState.priorityRules) tpState.priorityRules = tpDefaultPriorityRules();
else tpEnsurePriorityRuleDefaults(); // v15.8: añade P4/P5 a estados persistidos (respeta personalizaciones)
if (!tpState.weekAvailability) tpState.weekAvailability = {}; // { 'YYYY-MM-DD'(lunes): {available, capacity, workDays, note} }
if (tpState.recoveryHorizonWeeks === undefined) tpState.recoveryHorizonWeeks = 12;
if (tpState.recoveryUntil === undefined) tpState.recoveryUntil = null; // fecha límite de visualización 'YYYY-MM-DD'
if (tpState.maxTiers === undefined) tpState.maxTiers = 5; // niveles de prioridad (1..10)
if (!tpState.months || !tpState.months.length) tpState.months = TP_MONTHS.slice(); // meses de producción dinámicos
// v15.8: propósito precargado al iniciar prueba desde el plan, por región (regla "COP solo
// cuando la región es Europa" del corporativo; el resto son auditorías internas). Editable en Reglas.
if (!tpState.startPurposeByRegion) tpState.startPurposeByRegion = { 'EUROPE': 'COP-Emisiones', '*': 'EO-Emisiones' };
// v16.4 — Capacidad real y backlog.
// vehiclesPerSlot arranca en 1 a propósito: 1 por par es lo único que la app afirmaba hasta
// ahora, y no corresponde inventar un dato físico del laboratorio. Se configura una vez en
// Plan → Semanal y viaja por sync a todos los dispositivos.
if (tpState.vehiclesPerSlot === undefined) tpState.vehiclesPerSlot = 1;
// Empuje por antigüedad: una config postergada N semanas sube de puntaje para que el backlog
// no se estanque. Va como boost FUERA del promedio ponderado (ver tpPriorityScore).
if (!tpState.agingBoost) tpState.agingBoost = { perWeek: 6, max: 30 };
// { [configDesc]: {at, by, reason} } — sacadas de la cola sin tocar el déficit ni la cobertura.
if (!tpState.carryoverDismissed) tpState.carryoverDismissed = {};

// ── v18: configuración del planificador semanal ──────────────────────────────
// Ojo con el orden de carga: _TP_RULE_ALLFIELDS y AUTOPLAN_LS_KEY se ASIGNAN más
// abajo en este mismo archivo, así que aquí solo se usan literales.
if (!tpState.plannerCfg) tpState.plannerCfg = {};
if (tpState.plannerCfg.carryoverOn       === undefined) tpState.plannerCfg.carryoverOn = true;
if (tpState.plannerCfg.carryoverTtlWeeks === undefined) tpState.plannerCfg.carryoverTtlWeeks = 4;  // 0 = sin caducidad
if (tpState.plannerCfg.carryoverMaxPct   === undefined) tpState.plannerCfg.carryoverMaxPct = 50;   // tope de capacidad para la cola
if (tpState.plannerCfg.filtersOn         === undefined) tpState.plannerCfg.filtersOn = false;
if (!tpState.plannerCfg.filters) tpState.plannerCfg.filters =
    { familyMatch:'', region:'', regulation:'', modelMatch:'', engMatch:'', bodyMatch:'', drvMatch:'' };
// Guard del auto-plan: migra desde la clave de localStorage (que NO se sincronizaba,
// y por eso cada dispositivo generaba y aceptaba su propia semana).
if (tpState.autoPlanLastRun === undefined) {
    var _tpLsRun = null;
    try { _tpLsRun = localStorage.getItem('kia_autoplan_lastrun'); } catch (e) {}
    tpState.autoPlanLastRun = _tpLsRun || null;
}

// ── v20: identidad estable de los planes (weekNum índice → planId) ──
// Va envuelto porque corre al PARSEAR el archivo: un throw aquí se llevaría
// entera la definición de testplan.js. La guarda vive en tpState._migr, que se
// preserva en _fbPullSeed — si no, un pull desde código viejo la borraría y la
// migración volvería a correr (la trampa que documenta tpPlannerCfg en v18.0).
try { tpEnsurePlanIds(); tpMigrateWeekHistoryIds(); } catch (e) { console.warn('tpMigrateWeekHistoryIds:', e); }

/**
 * LA forma de leer la configuración del planificador. Nunca leer
 * `tpState.plannerCfg.x` directo: `_fbPullSeed` (firebase-sync.js) hace
 * `tpState = remoteData` y solo rellena una lista fija de campos, así que un pull
 * desde un dispositivo con código viejo dejaría plannerCfg en undefined y la
 * migración de arranque ya no vuelve a correr. Esto reaplica los defaults.
 */
function tpPlannerCfg() {
    if (!tpState.plannerCfg) tpState.plannerCfg = {};
    var p = tpState.plannerCfg;
    if (p.carryoverOn       === undefined) p.carryoverOn = true;
    if (p.carryoverTtlWeeks === undefined) p.carryoverTtlWeeks = 4;
    if (p.carryoverMaxPct   === undefined) p.carryoverMaxPct = 50;
    if (p.filtersOn         === undefined) p.filtersOn = false;
    if (!p.filters) p.filters = { familyMatch:'', region:'', regulation:'', modelMatch:'', engMatch:'', bodyMatch:'', drvMatch:'' };
    return p;
}

function tpSave() {
    _tpInvalidateCache();
    tpInvalidateCache(); // v16.2: tpSave() ahora invalida TAMBIÉN el cache de tpGetAnalysis()
                          // (antes solo invalidaba el de familias) — editar una regla, un
                          // volumen o pausar una config sin cambiar el conteo de configs/
                          // probadas dejaba el análisis (REQ/déficit/cobertura) obsoleto.
    tpState._lastSave = Date.now();
    try {
        localStorage.setItem(TP_LS_KEY, JSON.stringify(tpState));
    } catch(e) {
        console.error('tpSave: localStorage lleno', e);
        try { showToast('⚠️ Almacenamiento lleno — no se guardó el Plan. Libera espacio en Panel → Sistema.', 'error'); } catch(e2) {}
        tabCacheInvalidate('tp');
        return false;
    }
    tabCacheInvalidate('tp');
    return true;
}

// ── [Fase 5.3] Compact old completed plans (older than 6 months) ──
function tpCompactOldPlans() {
    if (!tpState || !tpState.planData) return;
    var now = Date.now();
    var sixMonths = 180 * 24 * 60 * 60 * 1000;
    var before = tpState.planData.length;
    tpState.planData = tpState.planData.filter(function(p) {
        if (p.status === 'completed' && p.completedDate) {
            return (now - new Date(p.completedDate).getTime()) < sixMonths;
        }
        return true;
    });
    if (tpState.planData.length < before) tpSave();
}

// ── Data helpers ──
// Propósito precargado según región del plan (v15.8). Valida contra TP_PURPOSES_VALID.
function tpPurposeForRegion(rgn) {
    var map = tpState.startPurposeByRegion || {};
    var p = map[_tpNorm(rgn)] || map['*'];
    return (p && TP_PURPOSES_VALID.indexOf(p) !== -1) ? p : 'COP-Emisiones';
}
function tpSetStartPurpose(regionKey, value) {
    if (!tpState.startPurposeByRegion) tpState.startPurposeByRegion = {};
    tpState.startPurposeByRegion[regionKey] = value;
    tpSave();
    if (typeof showToast === 'function') showToast('Propósito por región actualizado', 'success');
}

// v16.2: matching normalizado (trim + mayúsculas) — antes una regla con espacios o minúsculas
// nunca matcheaba y TODO caía silenciosamente a la regla comodín '*'. Ahora además se marca
// qué tipo de match ocurrió (_matchType), para poder mostrarlo en la UI (gap, Reglas).
function tpGetRule(cfg) {
    const r = tpState.rules;
    const rgn = _tpNorm(cfg.rgn), reg = _tpNorm(cfg.reg);
    let rule = r.find(x => _tpNorm(x.region) === rgn && _tpNorm(x.regulation) === reg);
    if (rule) return Object.assign({}, rule, { _matchType: 'exacta' });
    rule = r.find(x => _tpNorm(x.region) === rgn && x.regulation === '*');
    if (rule) return Object.assign({}, rule, { _matchType: 'region' });
    rule = r.find(x => x.region === '*');
    if (rule) return Object.assign({}, rule, { _matchType: 'comodín' });
    return { ratio: 1, per: 1000, label: 'Sin regla (1/1000 por defecto)', _matchType: 'default' };
}

function tpCalcRequired(cfg, rule) {
    const vol = cfg.total + cfg.hist;
    if (vol === 0) return 0; // v16.2: sin volumen no exige piso mínimo de 1 prueba
    return Math.max(1, Math.ceil((vol * rule.ratio) / rule.per));
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v20.9] EL REQ DE UNA FAMILIA — la unidad de muestreo del CoP es la FAMILIA
// ═══════════════════════════════════════════════════════════════════════════════
//
// `tpCalcRequired` (arriba) sigue siendo el REQ POR CONFIGURACIÓN: alimenta al
// planificador semanal, que decide QUÉ variante correr. Pero la norma no exige un
// ensayo por variante: exige **3 ensayos por familia por cada lote de 5 000
// unidades producidas**, y el siguiente lote de 3 no entra hasta SUPERAR 7 501.
// Sumar el REQ de cada config daba números inflados y distintos entre familias
// con el mismo volumen (una familia con 5 variantes pedía 5, otra con 2 pedía 2),
// que es justo lo que el laboratorio reportó.
//
// El escalón NO es `ceil(vol/5000)`: con 7 500 unidades eso ya pediría 6. El punto
// de quiebre está a la mitad del lote (7 501), así que se corre 2 500 hacia atrás.
var TP_COP_LOT_UNITS   = 5000;  // unidades por lote
var TP_COP_LOT_TESTS   = 3;     // ensayos que exige cada lote
var TP_COP_LOT_ROLLOVER = 2500; // corrimiento: el 2º lote entra en 7 501, no en 5 001

/**
 * LA definición de cuántos ensayos exige una familia dado su volumen.
 * Todo consumidor nuevo debe llamarla en vez de sumar el REQ de las configuraciones.
 *   vol ≤ 7 500 → 3 · 7 501–12 500 → 6 · 12 501–17 500 → 9 …
 * Sin volumen no exige nada (misma regla que tpCalcRequired).
 */
function tpFamilyRequired(vol) {
    var v = Number(vol) || 0;
    if (v <= 0) return 0;
    var lotes = Math.max(1, Math.ceil((v - TP_COP_LOT_ROLLOVER) / TP_COP_LOT_UNITS));
    return lotes * TP_COP_LOT_TESTS;
}

// v16.2: pausar/reactivar una configuración dormant (3+ meses seguidos en 0). Pausada =
// required 0 y fuera del denominador de cobertura (tpCoverageSummary). "Confirmar activa"
// no pausa nada — solo marca que ya se revisó, para no volver a preguntar.
function tpPauseConfig(desc) {
    var cfg = tpState.planData.find(c => c.desc === desc);
    if (!cfg) return;
    if (typeof undoPush === 'function') undoPush('testplan', 'Pausar configuración');
    cfg.paused = true;
    cfg.pausedDecided = true;
    tpSave();
    if (typeof auditLog === 'function') auditLog('testplan', 'config_paused', { type: 'config', label: desc }, '3+ meses sin producción planeada');
    tpRender();
    if (typeof showToast === 'function') showToast('Configuración pausada — ya no exige pruebas', 'success', null, undoPop);
}
function tpResumeConfig(desc) {
    var cfg = tpState.planData.find(c => c.desc === desc);
    if (!cfg) return;
    if (typeof undoPush === 'function') undoPush('testplan', 'Reactivar configuración');
    cfg.paused = false;
    cfg.pausedDecided = false;
    tpSave();
    if (typeof auditLog === 'function') auditLog('testplan', 'config_resumed', { type: 'config', label: desc }, '');
    tpRender();
    if (typeof showToast === 'function') showToast('Configuración reactivada', 'success', null, undoPop);
}
function tpConfirmDormantActive(desc) {
    var cfg = tpState.planData.find(c => c.desc === desc);
    if (!cfg) return;
    cfg.pausedDecided = true;
    tpSave();
    if (typeof auditLog === 'function') auditLog('testplan', 'config_dormant_confirmed', { type: 'config', label: desc }, 'Sigue contabilizando pese a 3+ meses en 0');
    tpRender();
}

// Replica la clave de familia usada en tpBuildFamilies() para un config suelto.
// [v20.8] La carrocería ENTRÓ a la clave: 5DR y WGN no se prueban igual — son familias
// distintas, con contador y tarjeta propios, no variantes de la misma. La clave pasa de
// 7 a 8 segmentos; `_tpMigrateFamilyKeysBody()` remapea lo guardado con clave vieja
// (overrides, soak) y el CoP empata juicios viejos por prefijo (no se pierde historia).
function tpFamilyKeyForCfg(cfg) {
    return `${cfg.mod}|${cfg.eng}|${cfg.tx}|${cfg.my}|${cfg.reg}|${(cfg.ep&&cfg.ep!=='0')?cfg.ep:''}|${(cfg.engpkg&&cfg.engpkg!=='0')?cfg.engpkg:''}|${(cfg.body&&cfg.body!=='0')?cfg.body:''}`;
}

/**
 * [v20.8] Migración de claves de familia 7→8 segmentos (la carrocería entró a la
 * identidad). Idempotente y barata: solo actúa sobre claves con 7 segmentos, así que
 * puede correr en cada arranque y tras cada pull de sync (un dispositivo sin
 * actualizar puede reintroducir claves viejas). Una clave vieja se duplica a TODAS
 * las carrocerías que esa familia agrupaba en el catálogo — el override o el soak
 * eran de la familia combinada, así que aplican a cada mitad por igual.
 */
function _tpMigrateFamilyKeysBody() {
    var plan = tpState.planData || [];
    if (!plan.length) return;
    var bodiesByOldKey = null; // se calcula una sola vez, y solo si hay algo que migrar
    function bodiesFor(oldKey) {
        if (!bodiesByOldKey) {
            bodiesByOldKey = {};
            plan.forEach(function(c) {
                var nk = tpFamilyKeyForCfg(c);
                var ok = nk.split('|').slice(0, 7).join('|');
                (bodiesByOldKey[ok] = bodiesByOldKey[ok] || {})[(c.body && c.body !== '0') ? c.body : ''] = true;
            });
        }
        return Object.keys(bodiesByOldKey[oldKey] || {});
    }
    function remap(map) {
        if (!map || typeof map !== 'object') return false;
        var moved = false;
        Object.keys(map).forEach(function(k) {
            if (String(k).split('|').length !== 7) return;
            var bodies = bodiesFor(k);
            if (!bodies.length) return; // familia que ya no está en el catálogo: se deja tal cual
            bodies.forEach(function(b) {
                var nk = k + '|' + b;
                if (map[nk] === undefined) map[nk] = map[k];
            });
            delete map[k];
            moved = true;
        });
        return moved;
    }
    var m1 = remap(tpState.familyOverrides);
    var m2 = remap(tpState.soak && tpState.soak.byFamily);
    if ((m1 || m2) && typeof tpInvalidateCache === 'function') tpInvalidateCache();
}

// Importancia 0-100 de la región (editable en pestaña Reglas).
function tpRegionPriorityValue(rgn) {
    var rp = tpState.regionPriority || {};
    var v = rp[rgn];
    if (v === undefined || v === null) v = rp['*'];
    if (v === undefined || v === null) v = 50;
    return v;
}

// Override manual de familia (criticidad + deadline). Devuelve {boost, criticality, deadline, days}.
function tpFamilyOverrideFor(cfg) {
    var ov = (tpState.familyOverrides || {})[tpFamilyKeyForCfg(cfg)];
    if (!ov) return null;
    var boost = 0, days = null;
    if (ov.criticality === 'critical') boost += 40;
    else if (ov.criticality === 'high') boost += 20;
    if (ov.deadline) {
        days = Math.ceil((new Date(ov.deadline + 'T12:00:00') - Date.now()) / 86400000);
        if (days <= 30) boost += Math.max(0, 30 - days) * 1.2; // más cerca → más boost
    }
    return { boost: boost, criticality: ov.criticality || 'normal', deadline: ov.deadline || '', days: days };
}

function tpPriorityScore(cfg, testedN) {
    const rule = tpGetRule(cfg);
    const req = cfg.paused ? 0 : tpCalcRequired(cfg, rule); // v16.2: pausada no exige
    const w = tpState.weights;
    const maxVol = Math.max(...tpState.planData.map(c => c.total + c.hist), 1);
    const volScore = ((cfg.total + cfg.hist) / maxVol) * 100;
    const compScore = req > 0 ? (1 - Math.min(testedN / req, 1)) * 100 : 0;
    const newScore = cfg.hist === 0 && cfg.total > 0 ? 100 : 0;
    const _mArr = cfg.m || [];
    const _mLen = _mArr.length || 6;
    const firstM = _mArr.findIndex(v => v > 0);
    const urgScore = firstM === -1 ? 0 : ((_mLen - firstM) / _mLen) * 100;
    const regScore = tpRegionPriorityValue(cfg.rgn);
    const wReg = w.region || 0;
    const base = (volScore * w.volume + compScore * w.compliance + newScore * w.newConfig + urgScore * w.urgency + regScore * wReg) / 100;
    const ov = tpFamilyOverrideFor(cfg);
    // v16.4: + empuje por antigüedad, para que lo que lleva semanas postergado suba solo y el
    // backlog no se estanque al fondo de la lista para siempre.
    const aging = typeof tpAgingBoost === 'function' ? tpAgingBoost(cfg.desc) : 0;
    return base + (ov ? ov.boost : 0) + aging;
}

// Texto "por qué se priorizó" — para transparencia en plan y resumen ejecutivo.
function tpScoreReason(cfg, testedN) {
    var parts = [];
    var ov = tpFamilyOverrideFor(cfg);
    if (ov && ov.criticality === 'critical') parts.push('⚑ Crítico');
    else if (ov && ov.criticality === 'high') parts.push('▲ Alto');
    if (ov && ov.days !== null && ov.days <= 30) parts.push('⏰ ' + (ov.days < 0 ? 'vencido' : ov.days + 'd'));
    var vol = (cfg.total || 0) + (cfg.hist || 0);
    if (vol > 0) parts.push('Vol ' + vol.toLocaleString('es-MX'));
    var regV = tpRegionPriorityValue(cfg.rgn);
    if (cfg.rgn && regV >= 80) parts.push(cfg.rgn + ' (alta)');
    else if (cfg.rgn) parts.push(cfg.rgn);
    if ((testedN || 0) === 0) parts.push('0 probadas');
    if (cfg.hist === 0 && cfg.total > 0) parts.push('config nueva');
    var age = typeof tpCarryoverAge === 'function' ? tpCarryoverAge(cfg.desc) : 0;
    if (age > 0) parts.push('🔄 ' + age + ' sem postergada');
    return parts.join(' · ');
}

// Detalle de score para mostrar el "por qué" en cada item del plan.
function tpBuildScoreDetail(cfg, n, req, score) {
    var lastTested = '';
    for (var i = tpState.testedList.length - 1; i >= 0; i--) {
        if (tpState.testedList[i].configText === cfg.desc) { lastTested = tpState.testedList[i].date || ''; break; }
    }
    return { deficit: Math.max(0, req - n), score: score, lastTested: lastTested, reason: tpScoreReason(cfg, n) };
}

// Balance por región de un conjunto de items del plan (string compacto).
function tpWeekRegionBalance(items) {
    var counts = {};
    (items || []).forEach(function(it) { var r = it.rgn || '?'; counts[r] = (counts[r] || 0) + 1; });
    return Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; })
        .map(function(r) { return '<span style="color:' + tpRegionColor(r) + ';">' + r + ' ' + counts[r] + '</span>'; }).join(' · ');
}

// Cache for tpGetAnalysis — invalidated on plan/tested changes
var _tpAnalysisCache = { key: '', data: null };

function tpGetAnalysis() {
    // v20: `_lastSave` entra en la clave. Sin él, quitar y agregar una prueba el mismo
    // día dejaba la clave IDÉNTICA y el análisis servía datos viejos — justo lo que
    // pasa al palomear y despalomear en el plan.
    var cacheKey = tpState.planData.length + ':' + tpState.testedList.length + ':' +
                   (tpState.testedList.length > 0 ? tpState.testedList[tpState.testedList.length-1].date : '') +
                   ':' + (tpState._lastSave || 0);
    if (_tpAnalysisCache.key === cacheKey && _tpAnalysisCache.data) return _tpAnalysisCache.data;

    var result = tpState.planData.map(cfg => {
        const rule = tpGetRule(cfg);
        const filas = tpState.testedList.filter(t => t.configText === cfg.desc);
        const n = filas.length;
        // v20: aditivo. `testedN` NO cambia de significado — sigue contando todo, para
        // que la palomita manual sí baje el déficit (es justo su razón de ser). Al lado
        // va el número solo-verificadas, que nunca se oculta.
        const nDecl = filas.filter(tpTestedIsDeclared).length;
        const nVer = n - nDecl;
        const req = cfg.paused ? 0 : tpCalcRequired(cfg, rule); // v16.2: pausada = no exige
        const comp = req > 0 ? Math.min(n / req, 1) : 1;
        const st = comp >= 1 ? 'ok' : comp >= 0.5 ? 'warn' : 'crit';
        const sc = tpPriorityScore(cfg, n);
        // v16.2: cuánto volumen entra al cálculo y qué regla se usó — para transparencia total
        const ruleInfo = { label: rule.label || '(sin nombre)', matchType: rule._matchType, ratio: rule.ratio, per: rule.per,
            vol: cfg.total + cfg.hist, formula: '(' + cfg.total.toLocaleString() + ' plan + ' + cfg.hist.toLocaleString() + ' hist) × ' + rule.ratio + '/' + rule.per.toLocaleString() };
        return { ...cfg, testedN: n, testedVerified: nVer, testedDeclared: nDecl,
                 required: req, deficit: Math.max(0, req - n), compliance: comp, status: st, score: sc, ruleInfo: ruleInfo };
    }).sort((a, b) => b.score - a.score);

    _tpAnalysisCache = { key: cacheKey, data: result };
    return result;
}

function tpInvalidateCache() {
    _tpAnalysisCache = { key: '', data: null };
    // v16.4: el backlog se deriva del análisis, así que comparte su ciclo de invalidación
    // (incluido el pull de Firebase, que entra por _fbTpUISync → tpInvalidateCache).
    if (typeof tpBacklogInvalidate === 'function') tpBacklogInvalidate();
    _tpAgesCache = { key: '', data: null };
    // v20: el tablero de la semana también se deriva del plan y de db.vehicles.
    if (typeof tpBoardInvalidate === 'function') tpBoardInvalidate();
}

// v16.2: LA definición única de "cobertura" en toda la plataforma — % de configuraciones
// vigentes (con volumen > 0, sin pausar) cuyo REQ ya está cumplido. Antes cada pantalla
// (badge del Plan, HOY, Ejecutivo, PDF) calculaba su propio número por su cuenta y no
// coincidían entre sí; ahora todas llaman a este único helper.
function tpCoverageSummary() {
    var analysis = tpGetAnalysis();
    var vigentes = analysis.filter(function(a) { return a.required > 0; }); // paused/sin-vol ya vienen con required=0
    var ok = vigentes.filter(function(a) { return a.status === 'ok'; }).length;
    var totalReq = analysis.reduce(function(s, a) { return s + a.required; }, 0);
    var totalTested = analysis.reduce(function(s, a) { return s + a.testedN; }, 0);
    var deficit = analysis.reduce(function(s, a) { return s + a.deficit; }, 0);
    // v20 — ADITIVO. Ninguna llave existente cambia de significado: `pct`, `deficit` y
    // `totalTested` siguen contando las declaradas a mano, porque la palomita existe
    // justo para que el operador diga "esto ya se hizo, deja de proponérmelo"; si no
    // bajara el déficit, la config volvería la semana siguiente y la palomita sería
    // inútil. Pero el número solo-verificadas va AL LADO, siempre visible: nunca
    // ocultar, siempre declarar (el principio del semáforo del CoP).
    var totalDeclared = analysis.reduce(function(s, a) { return s + (a.testedDeclared || 0); }, 0);
    var okVerified = vigentes.filter(function(a) { return (a.testedVerified || 0) >= a.required; }).length;
    return {
        vigentes: vigentes.length,
        ok: ok,
        pct: vigentes.length > 0 ? Math.round((ok / vigentes.length) * 100) : 0,
        totalReq: totalReq,
        totalTested: totalTested,
        deficit: deficit,
        totalDeclared: totalDeclared,
        totalVerified: totalTested - totalDeclared,
        okVerified: okVerified,
        pctVerified: vigentes.length > 0 ? Math.round((okVerified / vigentes.length) * 100) : 0
    };
}

// ── Init: load plan from embedded CSV data ──
function tpInit() {
    // v20: el módulo abre en "Mi semana" — lo primero que necesita ver alguien que
    // llega al laboratorio es qué se prueba hoy, no el dashboard de cobertura.
    tpState.activeTab = 'tp-myweek';
    window._tpLastTab = null;
    if (tpState.planData.length === 0) {
        tpLoadPlanFromCSV_CONFIGURATIONS();
    }
    tpRender();
}

function tpLoadPlanFromCSV_CONFIGURATIONS() {
    // Build plan from the embedded CSV + use the production plan CSV structure
    // For now, create entries from allConfigurations with zero production data
    // The real plan gets loaded via CSV import
    // We check if there's already saved plan data
    if (tpState.planData.length > 0) return;
    console.log('TP: No plan data found. Use CSV import in Production tab to load plan.');
}

// ── Auto-feed from COP15 releases ──
// opts.skipSave: el llamador (cascada de liberación) hace un único tpSave al final
function tpAutoFeedFromRelease(vehicle, opts) {
    if (!vehicle || !vehicle.configCode) return;
    if (!TP_PURPOSES_VALID.includes(vehicle.purpose)) return;
    // Las pruebas marcadas "Fuera de Plan" (v.adhoc) se excluyen a propósito del conteo del plan.
    if (vehicle.adhoc) {
        console.log('TP: se omite el auto-feed de una prueba fuera de plan', vehicle.vin || vehicle.id);
        return;
    }

    const entry = {
        configText: vehicle.configCode,
        date: localToday(),
        note: `VIN: ${vehicle.vin} — Auto desde COP15`,
        source: 'cop15-release',
        purpose: vehicle.purpose,
    };
    // v20: una declaración a mano es un MARCADOR de posición hasta que hay evidencia
    // real. Al llegar la liberación de esa config, la más vieja se retira: si no, la
    // misma prueba contaría dos veces (declarada + verificada) e inflaría la cobertura.
    var _decl = (tpState.testedList || []).findIndex(function(t) {
        return t && t.configText === vehicle.configCode && tpTestedIsDeclared(t);
    });
    if (_decl >= 0) {
        entry.promotedFrom = 'plan-manual';
        entry.note += ' (sustituye una declarada a mano)';
        tpState.testedList.splice(_decl, 1);
    }
    tpState.testedList.push(entry);
    if (typeof tpInvalidateCache === 'function') tpInvalidateCache();
    if (!(opts && opts.skipSave)) tpSave();
    tpUpdateBadges();
    auditLog('tp', 'vehicle_tested', {type:'plan', label:vehicle.configCode}, 'VIN: ' + (vehicle.vin || ''));
}

// ── CSV Import ──
function tpImportPlanCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) { showToast('CSV vacío', 'error'); return; }
    const header = lines[0].split(',').map(h => h.trim());

    const idxId = header.indexOf('codigo_config');
    const idxDesc = header.indexOf('codigo_config_text');
    const idxMod = header.indexOf('Modelo');
    const idxMY = header.indexOf('MODEL YEAR (VIN)');
    const idxTX = header.indexOf('TRANSMISSION');
    const idxEP = header.indexOf('ENVIRONMENT PACKAGE');
    const idxReg = header.indexOf('EMISSION REGULATION');
    const idxDrv = header.indexOf('DRIVE TYPE');
    const idxEng = header.indexOf('ENGINE CAPACITY');
    const idxTire = header.indexOf('TIRE ASSY');
    const idxRgn = header.indexOf('REGION');
    const idxBody = header.indexOf('BODY TYPE');
    const idxEngPkg = header.indexOf('ENGINE PACKAGE');
    const idxHist = header.indexOf('count_hist');
    // Detectar dinámicamente TODAS las columnas de mes del header (no solo un set fijo)
    const csvMonths = [];
    header.forEach((h, ci) => { if (_tpIsMonthLabel(h)) csvMonths.push({ label: _tpCanonMonth(h), idx: ci }); });
    const idxTotalCalc = header.indexOf('Total_Calc');

    if (idxDesc < 0 || idxRgn < 0) { showToast('CSV sin columnas requeridas (codigo_config_text, REGION)', 'error'); return; }

    const newData = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < 5) continue;
        newData.push({
            id: cols[idxId] || '',
            desc: cols[idxDesc] || '',
            mod: cols[idxMod] || '',
            my: cols[idxMY] || '',
            tx: cols[idxTX] || '',
            ep: cols[idxEP] || '',
            // v16.1: celda de regulación vacía (típico EV) → misma normalización que el
            // catálogo (parseCSV en cop15.js), para que las claves de familia no diverjan.
            // Solo si la columna existe en el header — un CSV sin la columna se queda en ''.
            reg: (idxReg >= 0 && typeof _normalizeRegulation === 'function') ? _normalizeRegulation(cols[idxReg], idxEng >= 0 ? cols[idxEng] : '') : (cols[idxReg] || ''),
            drv: cols[idxDrv] || '',
            eng: cols[idxEng] || '',
            tire: cols[idxTire] || '',
            rgn: cols[idxRgn] || '',
            body: cols[idxBody] || '',
            engpkg: cols[idxEngPkg] || '',
            hist: parseInt(cols[idxHist]) || 0,
            _cvals: (function(){ var o = {}; csvMonths.forEach(function(mc){ o[mc.label] = parseInt(cols[mc.idx]) || 0; }); return o; })(),
            total: parseInt(cols[idxTotalCalc]) || 0,
        });
    }

    // v16.2: feedback de qué columnas se reconocieron como mes y cuáles no — responde
    // directamente "no veo los meses que esperaba" (o el CSV no los trae, o su encabezado
    // no calza con ningún formato reconocido por _tpIsMonthLabel).
    const _tpKnownIdx = new Set([idxId, idxDesc, idxMod, idxMY, idxTX, idxEP, idxReg, idxDrv, idxEng, idxTire, idxRgn, idxBody, idxEngPkg, idxHist, idxTotalCalc].filter(i => i >= 0));
    const _tpMonthIdx = new Set(csvMonths.map(mc => mc.idx));
    const monthsDetected = csvMonths.map(mc => mc.label);
    const unrecognizedCols = header.filter((h, ci) => h && !_tpKnownIdx.has(ci) && !_tpMonthIdx.has(ci));

    // ── Compare with existing plan ──
    const oldData = tpState.planData || [];
    const diff = { added:[], removed:[], volUp:[], volDown:[], unchanged:0, monthsDetected: monthsDetected, unrecognizedCols: unrecognizedCols };
    const oldMap = {};
    oldData.forEach(c => { oldMap[c.desc] = c; });
    const newMap = {};
    newData.forEach(c => { newMap[c.desc] = c; });

    newData.forEach(c => {
        const old = oldMap[c.desc];
        // v16.2: preservar flags de pausado/dormant-decidido a través del re-import — si no,
        // cada CSV nuevo "resucitaba" configs que el operador ya había marcado como pausadas.
        if (old) {
            if (old.paused) c.paused = true;
            if (old.pausedDecided) c.pausedDecided = true;
        }
        if (!old) { diff.added.push(c); }
        else if (c.total !== old.total) {
            if (c.total > old.total) diff.volUp.push({ desc:c.desc, oldVol:old.total, newVol:c.total });
            else diff.volDown.push({ desc:c.desc, oldVol:old.total, newVol:c.total });
        } else { diff.unchanged++; }
    });
    // Configs removed from new plan: keep them (vol=0) preservando su histórico de meses
    oldData.forEach(c => {
        if (!newMap[c.desc]) {
            diff.removed.push(c);
            newData.push({ ...c, total: 0, _retired: true });
        }
    });

    // ── Meses: unión (preserva histórico) + orden cronológico, y re-alinear m de cada config ──
    const oldMonths = (tpState.months && tpState.months.length) ? tpState.months.slice() : TP_MONTHS.slice();
    const monthSet = {};
    oldMonths.forEach(l => { monthSet[l] = true; });
    csvMonths.forEach(mc => { monthSet[mc.label] = true; });
    const unionMonths = _tpSortMonths(Object.keys(monthSet));
    function _oldVal(desc, label) {
        const oc = oldMap[desc];
        if (!oc || !oc.m) return undefined;
        const k = oldMonths.indexOf(label);
        return k >= 0 ? oc.m[k] : undefined;
    }
    newData.forEach(c => {
        c.m = unionMonths.map(label => {
            if (c._cvals && Object.prototype.hasOwnProperty.call(c._cvals, label)) return c._cvals[label]; // valor del CSV nuevo
            const ov = _oldVal(c.desc, label);                                                             // si no viene en el CSV, preservar el previo
            return (ov === undefined || ov === null) ? 0 : ov;
        });
        delete c._cvals;
    });
    tpState.months = unionMonths;

    // ── Save plan history snapshot ──
    if (!tpState.planHistory) tpState.planHistory = [];
    if (oldData.length > 0) {
        tpState.planHistory.push({
            date: tpState.planImportDate || new Date().toISOString(),
            configCount: oldData.filter(c => c.total > 0).length,
            totalVol: oldData.reduce((s,c) => s + c.total, 0)
        });
    }

    tpState.lastDiff = diff;
    tpState.lastDiffDate = new Date().toISOString();
    tpState.planData = newData;
    tpState.planImportDate = new Date().toISOString();
    if (typeof auditLog === 'function') auditLog('tp', 'plan_imported', {type:'plan', label:'producción'}, newData.length + ' configs · +' + (diff.added ? diff.added.length : 0) + ' / -' + (diff.removed ? diff.removed.length : 0));
    tpSave();

    // Force an immediate Firebase push so the CSV import isn't lost if the user closes the tab
    // before the 2s debounce fires (also surfaces quota/network errors instead of failing silent).
    if (typeof fbPush === 'function' && typeof fbSync !== 'undefined' && fbSync.enabled
        && typeof fbSyncModules !== 'undefined' && fbSyncModules.testplan) {
        fbPush('testplan', tpState, function(ok, err) {
            if (ok) showToast('Plan de producción subido a Firebase', 'success');
            else if (err) showToast('Plan guardado local; error subiendo a Firebase: ' + err, 'warning');
        }, { immediate: true });
    }

    let msg = 'Plan importado: ' + newData.filter(c=>c.total>0).length + ' configs activas\n\n';
    if (diff.added.length) msg += 'Nuevas: ' + diff.added.length + '\n';
    if (diff.removed.length) msg += 'Retiradas (conservadas vol=0): ' + diff.removed.length + '\n';
    if (diff.volUp.length) msg += 'Subieron volumen: ' + diff.volUp.length + '\n';
    if (diff.volDown.length) msg += 'Bajaron volumen: ' + diff.volDown.length + '\n';
    msg += 'Sin cambios: ' + diff.unchanged;
    showToast(newData.filter(c=>c.total>0).length + ' configs importadas. ' + diff.added.length + ' nuevas, ' + diff.removed.length + ' retiradas.', 'success');

    tpRender();
    tpUpdateBadges();
}

// ── Badges ──
function tpUpdateBadges() {
    const n = tpState.planData.length;
    const t = tpState.testedList.length;
    const r = tpState.rules.length;
    const pausedN = tpState.planData.filter(c => c.paused).length;
    document.getElementById('tp-configs-badge').textContent = n + ' configs' + (pausedN > 0 ? ' (' + pausedN + ' pausadas)' : '');
    document.getElementById('tp-tested-badge').textContent = t + ' probadas';
    document.getElementById('tp-rules-badge').textContent = r + ' reglas';

    // v16.2: badge de cobertura — LA fuente de verdad es tpCoverageSummary() (% de configs
    // vigentes al día); antes se calculaba localmente aquí y de otra forma en HOY/Ejecutivo.
    if (n > 0) {
        const cov = tpCoverageSummary();
        document.getElementById('tp-coverage-badge').textContent = cov.pct + '% cobertura';
    }

    // COP15 badge
    const active = db.vehicles ? db.vehicles.filter(v => v.status !== 'archived').length : 0;
    document.getElementById('cop15-count-badge').textContent = active + ' activos';
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M17] TEST PLAN MANAGER — RENDERER                                ║
// ╚══════════════════════════════════════════════════════════════════════╝

var _tpTabs = ['tp-myweek','tp-dashboard','tp-recovery','tp-tested','tp-families','tp-planactual','tp-planhistory','tp-rules','tp-weekly','tp-simulator','tp-production','tp-calendar','tp-weekhistory'];

function tpSwitchTab(tabId) {
    tpState.activeTab = tabId;
    window._tpLastTab = tabId;
    document.querySelectorAll('#tp-tabs-bar .tp-tab').forEach(b => b.classList.remove('active'));
    var _activeBtn = null;
    if (event && event.target && event.target.classList.contains('tp-tab')) {
        event.target.classList.add('active');
        _activeBtn = event.target;
    } else {
        var btn = document.querySelector('#tp-tabs-bar .tp-tab[onclick*="' + tabId + '"]');
        if (btn) { btn.classList.add('active'); _activeBtn = btn; }
    }
    if (typeof a11yTablist === 'function') a11yTablist(document.getElementById('tp-tabs-bar'));
    if (typeof a11yTablistSync === 'function' && _activeBtn) {
        a11yTablistSync(document.getElementById('tp-tabs-bar'), _activeBtn);
    }
    tpRender();
}

function _tpGetRenderer(tabId) {
    var map = {
        'tp-dashboard': tpRenderDashboard, 'tp-tested': tpRenderTested,
        'tp-families': tpRenderFamilies, 'tp-planactual': tpRenderPlanActual,
        'tp-planhistory': tpRenderPlanHistory, 'tp-rules': tpRenderRules,
        'tp-myweek': tpRenderMyWeek,
        'tp-weekly': tpRenderWeekly, 'tp-simulator': tpRenderSimulator,
        'tp-production': tpRenderProduction, 'tp-calendar': tpRenderCalendar,
        'tp-weekhistory': tpRenderWeekHistory, 'tp-recovery': tpRenderRecovery
    };
    return map[tabId] || null;
}

function tpRender() {
    if (!document.getElementById('tp-content')) return;
    if (!_tabCache['tp']) tabCacheInit('tp', _tpTabs);
    // Keep the active tab button in sync with tpState.activeTab (covers programmatic
    // navigation, e.g. deep-links from the Hoy dashboard or the exec summary).
    var _bar = document.getElementById('tp-tabs-bar');
    if (_bar) {
        var _btn = _bar.querySelector('.tp-tab[onclick*="' + tpState.activeTab + '"]');
        if (_btn) { _bar.querySelectorAll('.tp-tab').forEach(function(b){ b.classList.remove('active'); }); _btn.classList.add('active'); }
    }
    var tab = tpState.activeTab;
    var renderer = _tpGetRenderer(tab);
    if (renderer) tabCacheSwitch('tp', tab, renderer);
    // v16.0: banners/tooltips de ayuda — tabCacheSwitch puede diferir el render real a un RAF
    if (typeof cascadeInjectTooltipsDeferred === 'function') cascadeInjectTooltipsDeferred();
    if (typeof helpInjectBannerDeferred === 'function') helpInjectBannerDeferred('tp', tab);
    // [v17.4] Mismo problema de RAF diferido: los <div onclick> de la pestaña activa
    // (tarjetas de familia, celdas del calendario, filas del plan semanal) necesitan
    // quedar alcanzables por teclado sin importar qué pestaña se acabe de renderizar.
    if (typeof a11yClickables === 'function') {
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var content = document.getElementById('tp-content');
                if (content) a11yClickables(content);
            });
        });
    }
}

// ── Color helpers ──
const tpStatusColor = { ok:'var(--tp-green)', warn:'var(--tp-amber)', crit:'var(--tp-red)' };
const tpStatusLabel = { ok:'Completo', warn:'Parcial', crit:'Crítico' };
function tpRegionColor(r) { return r==='USA'?'var(--tp-red)':r==='EUROPE'?'var(--tp-blue)':r==='MEXICO'?'var(--tp-green)':'var(--tp-dim)'; }
function tpEpLabel(v) { return !v||v==='0'?'':v==='M'?'48V':v; }

// Generate colored config badges HTML for a config item or planData entry
// Falls back to planData lookup if item is legacy (missing fields)
function tpConfigBadges(item, opts) {
    opts = opts || {};
    var sz = opts.fontSize || 'var(--fs-xs)';
    // For legacy items missing fields, try to resolve from planData
    var c = item;
    if (!c.my && c.desc && tpState.planData.length > 0) {
        var found = tpState.planData.find(function(p) { return p.desc === c.desc; });
        if (found) c = Object.assign({}, found, item);
    }
    var h = '';
    if (c.mod) h += '<span class="tp-badge" style="background:rgba(59,130,246,0.2);color:var(--info-text);font-size:'+sz+';font-weight:800;">'+c.mod+'</span>';
    if (c.body) h += '<span class="tp-badge" style="background:rgba(148,163,184,0.15);color:#94a3b8;font-size:'+sz+';">'+c.body+'</span>';
    if (c.eng) h += '<span class="tp-badge" style="background:rgba(16,185,129,0.15);color:var(--ok-text);font-size:'+sz+';">'+c.eng+'</span>';
    if (c.tx) h += '<span class="tp-badge" style="background:rgba(251,191,36,0.15);color:#fbbf24;font-size:'+sz+';">'+c.tx+'</span>';
    if (c.my) h += '<span class="tp-badge" style="background:rgba(6,182,212,0.15);color:#06b6d4;font-size:'+sz+';">'+c.my+'</span>';
    if (c.reg) h += '<span class="tp-badge" style="background:rgba(139,92,246,0.15);color:#8b5cf6;font-size:'+sz+';">'+c.reg+'</span>';
    if (c.rgn) h += '<span class="tp-badge" style="background:'+tpRegionColor(c.rgn)+'20;color:'+tpRegionColor(c.rgn)+';font-size:'+sz+';">'+c.rgn+'</span>';
    if (c.drv) h += '<span class="tp-badge" style="background:rgba(236,72,153,0.15);color:#ec4899;font-size:'+sz+';">'+c.drv+'</span>';
    var ep = tpEpLabel(c.ep);
    if (ep) h += '<span class="tp-badge" style="background:rgba(251,146,60,0.15);color:#fb923c;font-size:'+sz+';">'+ep+'</span>';
    if (c.engpkg && c.engpkg !== '0') h += '<span class="tp-badge" style="background:rgba(168,85,247,0.15);color:#a855f7;font-size:'+sz+';">'+c.engpkg+'</span>';
    if (c.tire) h += '<span class="tp-badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;font-size:'+sz+';">'+c.tire+'</span>';
    return h;
}

// ═══ DASHBOARD ═══
// ── Resumen ejecutivo: foto instantánea de pendientes/prioridades/urgencias ──
function tpRenderExecSummary() {
    if (tpState.planData.length === 0) return '';
    var analysis = tpGetAnalysis();
    var families = typeof tpBuildFamilies === 'function' ? tpBuildFamilies() : [];
    var totalReq = analysis.reduce(function(s,a){return s+a.required;},0);
    var totalT = analysis.reduce(function(s,a){return s+a.testedN;},0);
    var deficit = Math.max(0, totalReq - totalT);
    var covPct = totalReq > 0 ? Math.round(totalT/totalReq*100) : 100;
    var highRisk = families.filter(function(f){return f.riskLevel==='high';}).length;
    var critFams = families.filter(function(f){return f.criticality==='critical' || f.criticality==='high';}).length;
    var dueSoon  = families.filter(function(f){return f.daysToDeadline!==null && f.daysToDeadline<=14;}).length;

    // Velocidad reciente (pruebas en últimos 28 días) y ETA al ritmo actual
    var now = Date.now();
    var recent = tpState.testedList.filter(function(t){ var d=new Date(t.date); return !isNaN(d.getTime()) && (now-d.getTime())<=28*86400000; }).length;
    var velo = recent/4; // por semana
    var etaWeeks = velo>0 ? Math.ceil(deficit/velo) : null;
    var gd = tpState.deadline ? Math.ceil((new Date(tpState.deadline+'T12:00:00')-now)/86400000) : null;
    var gdWeeks = gd!==null ? Math.ceil(gd/7) : null;
    var etaColor = (etaWeeks!==null && gdWeeks!==null) ? (etaWeeks>gdWeeks?'var(--tp-red)':'var(--tp-green)') : 'var(--tp-text)';
    var etaTxt = etaWeeks===null ? '—' : etaWeeks + ' sem';

    var top = analysis.filter(function(a){return a.deficit>0;}).slice(0,8);
    var deadlines = families.filter(function(f){return f.daysToDeadline!==null;}).sort(function(a,b){return a.daysToDeadline-b.daysToDeadline;}).slice(0,8);

    var html = '<div class="tp-card" style="border-left:3px solid var(--tp-amber);margin-bottom:14px;background:linear-gradient(135deg,rgba(245,158,11,0.05),transparent);">';
    html += '<div class="tp-card-title"><span style="font-size:14px;">📸 Resumen Ejecutivo — Foto del Plan</span></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(95px,1fr));gap:8px;margin:8px 0;">';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">'+deficit+'</div><div class="tp-metric-label">Pruebas pendientes</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:'+(covPct>=80?'var(--tp-green)':covPct>=40?'var(--tp-amber)':'var(--tp-red)')+'">'+covPct+'%</div><div class="tp-metric-label" title="Pruebas realizadas ÷ pruebas requeridas (por volumen) — no confundir con el % de configs al día del badge">Pruebas cumplidas</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">'+highRisk+'</div><div class="tp-metric-label">Familias riesgo alto</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">'+critFams+'</div><div class="tp-metric-label">Críticas/Altas</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">'+dueSoon+'</div><div class="tp-metric-label">Deadline ≤14d</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:'+etaColor+'">'+etaTxt+'</div><div class="tp-metric-label">ETA ritmo actual</div></div>';
    html += '</div>';
    if (etaWeeks!==null && gdWeeks!==null) {
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:4px;">Al ritmo de '+velo.toFixed(1)+' pruebas/sem terminas en ~'+etaWeeks+' sem; deadline global en '+gdWeeks+' sem '+(etaWeeks>gdWeeks?'<span style="color:var(--tp-red);font-weight:700;">(EN RIESGO)</span>':'<span style="color:var(--tp-green);font-weight:700;">(a tiempo)</span>')+'.</div>';
    }

    // 🔥 Prioridades — qué probar ahora
    html += '<div style="margin-top:10px;"><div style="font-size: var(--fs-sm);font-weight:700;color:var(--tp-text);margin-bottom:5px;">🔥 Prioridades — qué probar ahora</div>';
    if (top.length === 0) html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Sin déficit pendiente. 🎉</div>';
    else top.forEach(function(a){
        var reason = tpScoreReason(a, a.testedN);
        var modSafe = (a.mod||'').replace(/'/g,"\\'");
        html += '<div onclick="window._tpFamModel=\''+modSafe+'\';tpSwitchTab(\'tp-families\');" style="display:flex;align-items:center;gap:6px;padding:5px 7px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;background:var(--tp-card);cursor:pointer;flex-wrap:wrap;">';
        html += '<span class="tp-badge" style="background:'+tpRegionColor(a.rgn)+'20;color:'+tpRegionColor(a.rgn)+';font-size: var(--fs-xs);">'+(a.rgn||'?')+'</span>';
        html += '<span style="font-size: var(--fs-xs);font-weight:700;">'+a.mod+'</span><span style="font-size: var(--fs-xs);color:var(--tp-dim);">'+a.eng+' '+a.tx+' '+a.my+'</span>';
        html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);flex:1;min-width:80px;">'+reason+'</span>';
        html += '<span style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-red);">déficit '+a.deficit+'</span>';
        html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">›</span></div>';
    });
    html += '</div>';

    // ⏰ Deadlines próximos
    if (deadlines.length > 0) {
        html += '<div style="margin-top:10px;"><div style="font-size: var(--fs-sm);font-weight:700;color:var(--tp-text);margin-bottom:5px;">⏰ Deadlines próximos</div>';
        deadlines.forEach(function(f){
            var c = f.daysToDeadline < 7 ? 'var(--tp-red)' : f.daysToDeadline < 14 ? 'var(--tp-amber)' : 'var(--tp-blue)';
            var t = f.daysToDeadline < 0 ? 'VENCIDO' : f.daysToDeadline + ' días';
            var modSafe = (f.mod||'').replace(/'/g,"\\'");
            html += '<div onclick="window._tpFamModel=\''+modSafe+'\';tpSwitchTab(\'tp-families\');" style="display:flex;align-items:center;gap:6px;padding:5px 7px;margin-bottom:3px;border:1px solid '+c+'40;border-radius:6px;background:'+c+'10;cursor:pointer;flex-wrap:wrap;">';
            html += tpFamilyFlagBadge(f);
            html += '<span style="font-size: var(--fs-xs);font-weight:700;">'+f.mod+'</span><span style="font-size: var(--fs-xs);color:var(--tp-dim);">'+f.eng+' '+f.tx+' '+f.my+' · '+f.reg+'</span>';
            html += '<span style="font-size: var(--fs-xs);font-weight:700;color:'+c+';margin-left:auto;">'+t+' ('+f.overrideDeadline+')</span>';
            html += '<span style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-red);">déficit '+f.deficit+'</span></div>';
        });
        html += '</div>';
    }

    html += '</div>';
    return html;
}

// v15.8: Presupuesto anual — pendiente del año (por prioridad) vs capacidad restante del
// laboratorio. Adaptado del tablero del laboratorio hermano ("70 requeridas vs 120/año").
function tpRenderAnnualBudgetCard(analysis, stats) {
    var year = new Date().getFullYear();
    var weekCap = parseInt(tpState.capacity, 10) || 8;

    // Lunes del año: totales, y capacidad de las semanas restantes (respeta weekAvailability)
    var mon = new Date(year, 0, 1);
    while (mon.getDay() !== 1) mon.setDate(mon.getDate() + 1); // primer lunes del año
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var avail = tpState.weekAvailability || {};
    var totalWeeks = 0, remainingWeeks = 0, capacityRemaining = 0;
    while (mon.getFullYear() === year) {
        totalWeeks++;
        if (mon >= today || _tpMonday(today).getTime() === mon.getTime()) {
            remainingWeeks++;
            var av = avail[_tpFmtDate(mon)] || {};
            if (av.available !== false) {
                capacityRemaining += (av.capacity !== undefined && av.capacity !== null) ? av.capacity : weekCap;
            }
        }
        mon = new Date(mon); mon.setDate(mon.getDate() + 7);
    }
    var capacityAnnual = totalWeeks * weekCap;

    // Pendiente (déficit) por tier de prioridad
    var byTier = {}, deficit = 0;
    analysis.forEach(function(a) {
        if (!(a.deficit > 0)) return;
        deficit += a.deficit;
        var t = tpClassifyTier(a) || 0; // 0 = sin prioridad
        byTier[t] = (byTier[t] || 0) + a.deficit;
    });
    var tiers = Object.keys(byTier).map(Number).sort(function(x, y) { return (x || 99) - (y || 99); });

    var verdict, vColor;
    if (capacityRemaining >= deficit * 1.2) { verdict = '✓ El año alcanza con margen'; vColor = 'var(--tp-green)'; }
    else if (capacityRemaining >= deficit)  { verdict = '⚠ Alcanza justo — sin holgura'; vColor = 'var(--tp-amber)'; }
    else { verdict = '✗ Capacidad insuficiente para cerrar el año'; vColor = 'var(--tp-red)'; }

    var maxBar = Math.max(deficit, capacityRemaining, 1);
    var pendSegs = tiers.map(function(t) {
        var n = byTier[t];
        var label = t ? 'P' + t : 'Sin prioridad';
        return '<div title="' + label + ' · ' + n + ' pruebas" style="flex:0 0 ' + (n / maxBar * 100) + '%;background:' + tpTierColor(t) + ';display:flex;align-items:center;justify-content:center;color:#fff;font-size: var(--fs-xs);font-weight:800;overflow:hidden;white-space:nowrap;">' + (n / maxBar > 0.06 ? label + ' · ' + n : '') + '</div>';
    }).join('');
    var legend = tiers.map(function(t) {
        return '<span style="font-size: var(--fs-xs);color:var(--tp-dim);"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + tpTierColor(t) + ';margin-right:3px;"></span>' + (t ? 'P' + t : 'Sin prioridad') + ' · ' + byTier[t] + '</span>';
    }).join('');

    return `
    <div class="tp-card" style="border-left:3px solid ${vColor};margin-bottom:14px;">
        <div class="tp-card-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
            <span>📅 Presupuesto Anual ${year}</span>
            <span style="font-size: var(--fs-sm);font-weight:800;color:${vColor};">${verdict}</span>
        </div>
        <div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">
            Requeridas del año: <b style="color:var(--tp-text);">${stats.totalReq}</b> ·
            Probadas: <b style="color:var(--tp-green);">${stats.totalT}</b> ·
            Pendiente: <b style="color:var(--tp-red);">${deficit}</b> &nbsp;|&nbsp;
            Capacidad restante: <b style="color:var(--tp-text);">${capacityRemaining}</b> pruebas
            (${remainingWeeks} sem × ~${weekCap}/sem) · Capacidad anual ≈ ${capacityAnnual}
        </div>
        <div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:2px;">Pendiente por prioridad</div>
        <div style="display:flex;height:18px;border-radius:5px;overflow:hidden;background:var(--tp-bg);border:1px solid var(--tp-border);margin-bottom:6px;">${pendSegs || '<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size: var(--fs-xs);color:var(--tp-green);">Sin pendientes 🎉</div>'}</div>
        <div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:2px;">Capacidad restante del año</div>
        <div style="display:flex;height:18px;border-radius:5px;overflow:hidden;background:var(--tp-bg);border:1px solid var(--tp-border);">
            <div style="flex:0 0 ${capacityRemaining / maxBar * 100}%;background:var(--tp-green);opacity:0.75;display:flex;align-items:center;justify-content:center;color:#fff;font-size: var(--fs-xs);font-weight:800;">${capacityRemaining}</div>
        </div>
        ${legend ? '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">' + legend + '</div>' : ''}
    </div>`;
}

function tpRenderDashboard(el) {
    if (tpState.planData.length === 0) {
        el.innerHTML = `<div class="tp-card" style="text-align:center;padding:60px 20px;">
            <div style="font-size:48px;margin-bottom:16px;">📋</div>
            <h3 style="color:var(--tp-amber);margin-bottom:8px;">No hay plan de producción cargado</h3>
            <p style="color:var(--tp-dim);margin-bottom:20px;">Ve a la pestaña 🏭 Producción para importar tu CSV del plan de producción.</p>
            <button class="tp-btn tp-btn-primary" onclick="tpSwitchTab('tp-production');">Ir a Producción →</button>
        </div>`;
        return;
    }

    const analysis = tpGetAnalysis();
    const stats = {
        total: analysis.length,
        ok: analysis.filter(a => a.status === 'ok').length,
        warn: analysis.filter(a => a.status === 'warn').length,
        crit: analysis.filter(a => a.status === 'crit').length,
        totalReq: analysis.reduce((s,a) => s + a.required, 0),
        totalT: analysis.reduce((s,a) => s + a.testedN, 0),
        neverTested: analysis.filter(a => a.testedN === 0 && a.total > 0).length,
    };
    stats.deficit = Math.max(0, stats.totalReq - stats.totalT);

    // Fixed plan banner
    const fixedBanner = tpState.fixedPlan
        ? `<div class="tp-plan-fixed">📌 Plan Fijado: ${new Date(tpState.fixedPlan.date).toLocaleDateString('es-MX')} — ${tpState.fixedPlan.configs} configuraciones, ${tpState.fixedPlan.totalTests} pruebas requeridas</div>`
        : '';

    // Audit summary data
    var auditFamilies = typeof tpBuildFamilies === 'function' ? tpBuildFamilies() : [];
    var auditTotalFam = auditFamilies.length;
    var auditRepTested = auditFamilies.filter(function(f) { return f.repTested; }).length;
    var auditFullCov = auditFamilies.filter(function(f) { return f.coverage >= 1; }).length;
    var auditPartial = auditFamilies.filter(function(f) { return f.coverage > 0 && f.coverage < 1; }).length;
    var auditNone = auditFamilies.filter(function(f) { return f.coverage === 0 || (f.totalTested === 0 && f.totalRequired > 0); }).length;
    var auditRepPct = auditTotalFam > 0 ? Math.round((auditRepTested / auditTotalFam) * 100) : 0;
    var auditGlobalPct = stats.totalReq > 0 ? Math.round((stats.totalT / stats.totalReq) * 100) : 100;

    el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button class="tp-btn tp-btn-ghost" onclick="switchPlatform('panel');if(typeof pnSwitchTab==='function')pnSwitchTab('pn-dashboard');" style="font-size: var(--fs-xs);" title="Resumen cross-módulo del laboratorio">📊 Ver Resumen del Lab →</button></div>
    ${tpRenderExecSummary()}
    ${fixedBanner}
    ${tpRenderAlertsBanner()}
    ${tpRenderAuditReadinessCard()}
    ${tpRenderCoverageHeatmap()}

    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
      <button class="tp-btn tp-btn-ghost" onclick="tpExportPlanJSON()" title="Exporta unidades probadas/liberadas, plan semanal, familias, calendario y KPIs en JSON" style="font-size: var(--fs-sm);">📦 Exportar datos (JSON)</button>
      <label style="display:flex;align-items:center;gap:6px;font-size: var(--fs-sm);cursor:pointer;color:var(--tp-dim);">
        <input type="checkbox" onchange="window._tpAuditView=this.checked;tpRender();" ${window._tpAuditView ? 'checked' : ''}>
        Vista Auditoria (cobertura por representativa)
      </label>
    </div>

    ${window._tpAuditView ? `
    <div class="tp-card tp-audit-card" style="border-left:3px solid var(--tp-blue);margin-bottom:14px;">
      <div class="tp-card-title" style="color:var(--tp-blue);font-size:12px;">RESUMEN PARA AUDITORIA</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin:8px 0;">
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">${auditTotalFam}</div><div class="tp-metric-label">Familias</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">${auditFullCov}</div><div class="tp-metric-label">Cubiertas</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">${auditPartial}</div><div class="tp-metric-label">Parcial</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">${auditNone}</div><div class="tp-metric-label">Sin cobertura</div></div>
      </div>
      <div style="margin-bottom:6px;">
        <div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:2px;">Pruebas realizadas: ${stats.totalT} / ${stats.totalReq} (${auditGlobalPct}%)</div>
        <div class="tp-bar" style="height:8px;"><div class="tp-bar-fill" style="width:${auditGlobalPct}%;background:var(--tp-green);"></div></div>
      </div>
      <div>
        <div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:2px;">Representativas probadas: ${auditRepTested} / ${auditTotalFam} familias (${auditRepPct}%)</div>
        <div class="tp-bar" style="height:8px;"><div class="tp-bar-fill" style="width:${auditRepPct}%;background:var(--tp-blue);"></div></div>
      </div>
    </div>` : ''}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px;">
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">${stats.total}</div><div class="tp-metric-label">Configuraciones</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">${stats.totalReq}</div><div class="tp-metric-label">Pruebas Requeridas</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">${stats.totalT}</div><div class="tp-metric-label">Probadas</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">${stats.deficit}</div><div class="tp-metric-label">Déficit</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">${stats.neverTested}</div><div class="tp-metric-label">Sin Probar (c/prod)</div></div>
    </div>

    ${tpRenderAnnualBudgetCard(analysis, stats)}

    <!-- Status bars -->
    <div class="tp-status-bar">
        ${[['ok',stats.ok],['warn',stats.warn],['crit',stats.crit]].map(([s,n]) => `
            <div class="tp-status-segment" style="flex:${Math.max(n,1)};background:${tpStatusColor[s]}18;border:1px solid ${tpStatusColor[s]}40;" onclick="window._tpDashFilter=window._tpDashFilter==='${s}'?'ALL':'${s}';tpRender();">
                <span style="font-size:18px;font-weight:800;color:${tpStatusColor[s]}">${n}</span>
                <span style="font-size: var(--fs-xs);color:var(--tp-dim);margin-left:4px;">${tpStatusLabel[s]}</span>
            </div>
        `).join('')}
    </div>

    <!-- Region chart with config panel -->
    <div class="tp-card">
        <div class="tp-card-title" style="display:flex;justify-content:space-between;align-items:center;">
            <span>📊 ${window._tpChartGroupBy==='family'?'Familias':window._tpChartGroupBy==='regulation'?'Regulación':window._tpChartGroupBy==='model'?'Modelo':'Región'} — ${window._tpChartMetric==='pct'?'% Cumplimiento':'Cantidad'}</span>
            <button class="tp-btn tp-btn-ghost" onclick="window._tpChartCfgOpen=!window._tpChartCfgOpen;tpRender();" style="font-size: var(--fs-sm);">⚙️</button>
        </div>
        ${window._tpChartCfgOpen ? `
        <div style="padding:10px;background:var(--tp-bg);border:1px solid var(--tp-border);border-radius:8px;margin-bottom:10px;">
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
                <div>
                    <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:2px;">Agrupar por</label>
                    <select class="tp-select" style="font-size: var(--fs-xs);" onchange="window._tpChartGroupBy=this.value;if(typeof chartConfigSet==='function')chartConfigSet('tp_dashboard','groupBy',this.value);tpRender();">
                        <option value="region" ${(window._tpChartGroupBy||'region')==='region'?'selected':''}>Region</option>
                        <option value="model" ${window._tpChartGroupBy==='model'?'selected':''}>Modelo</option>
                        <option value="regulation" ${window._tpChartGroupBy==='regulation'?'selected':''}>Regulacion</option>
                        <option value="family" ${window._tpChartGroupBy==='family'?'selected':''}>Familia</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:2px;">Metrica Y</label>
                    <select class="tp-select" style="font-size: var(--fs-xs);" onchange="window._tpChartMetric=this.value;if(typeof chartConfigSet==='function')chartConfigSet('tp_dashboard','metric',this.value);tpRender();">
                        <option value="qty" ${(window._tpChartMetric||'qty')==='qty'?'selected':''}>Cantidad (Req vs Probadas)</option>
                        <option value="pct" ${window._tpChartMetric==='pct'?'selected':''}>% Cumplimiento</option>
                        <option value="deficit" ${window._tpChartMetric==='deficit'?'selected':''}>Deficit</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:2px;">Tipo de grafica</label>
                    <select class="tp-select" style="font-size: var(--fs-xs);" onchange="window._tpChartType=this.value;if(typeof chartConfigSet==='function')chartConfigSet('tp_dashboard','chartType',this.value);tpRender();">
                        <option value="bar" ${(window._tpChartType||'bar')==='bar'?'selected':''}>Barras</option>
                        <option value="hbar" ${window._tpChartType==='hbar'?'selected':''}>Barras Horizontales</option>
                        <option value="stacked" ${window._tpChartType==='stacked'?'selected':''}>Barras Apiladas</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:2px;">Y max (0=auto)</label>
                    <input type="number" class="tp-select" style="width:70px;font-size: var(--fs-xs);" value="${window._tpDashYMax || 0}" min="0" onchange="window._tpDashYMax=parseInt(this.value);if(typeof chartConfigSet==='function')chartConfigSet('tp_dashboard','yMax',parseInt(this.value));tpRender();">
                </div>
                <div>
                    <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:2px;">Altura (px)</label>
                    <input type="number" class="tp-select" style="width:70px;font-size: var(--fs-xs);" value="${window._tpDashChartH || 0}" min="0" max="500" onchange="window._tpDashChartH=parseInt(this.value);if(typeof chartConfigSet==='function')chartConfigSet('tp_dashboard','chartH',parseInt(this.value));tpRender();">
                </div>
            </div>
        </div>` : ''}
        ${tpRenderDashChart(analysis)}
    </div>

    <!-- Burndown chart -->
    <div class="tp-card">
        <details ${window._tpBurndownOpen ? 'open' : ''}>
            <summary onclick="window._tpBurndownOpen=!this.parentElement.open;" style="cursor:pointer;font-weight:700;font-size:12px;color:var(--tp-amber);user-select:none;padding:4px 0;">📉 Burndown de Deficit — Proyeccion de Completacion</summary>
            <div style="display:flex;align-items:center;gap:8px;margin:10px 0 6px;flex-wrap:wrap;">
                <label style="font-size: var(--fs-xs);color:var(--tp-dim);">Deadline:</label>
                <input type="date" id="tp-deadline-input" value="${tpState.deadline || ''}" onchange="tpState.deadline=this.value;tpSave();document.getElementById('tp-burndown-container').innerHTML=tpRenderBurndownChart(tpGetAnalysis());" style="background:var(--tp-card);color:var(--tp-text);border:1px solid var(--tp-border);border-radius:6px;padding:4px 8px;font-size: var(--fs-sm);">
                ${tpState.deadline ? "<button class=\"tp-btn tp-btn-ghost\" onclick=\"tpState.deadline=&#39;&#39;;tpSave();document.getElementById(&#39;tp-deadline-input&#39;).value=&#39;&#39;;document.getElementById(&#39;tp-burndown-container&#39;).innerHTML=tpRenderBurndownChart(tpGetAnalysis());\" style=\"font-size: var(--fs-xs);\">Quitar deadline</button>" : ''}
            </div>
            <div style="margin-top:10px;" id="tp-burndown-container">${tpRenderBurndownChart(stats)}</div>
        </details>
    </div>

    <!-- Fix plan button -->
    <div class="tp-card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button class="tp-btn tp-btn-primary" onclick="tpFixPlan()">📌 Fijar Plan de Pruebas</button>
        <button class="tp-btn tp-btn-ghost" onclick="tpExportGapCSV()" style="font-size: var(--fs-xs);">Exportar CSV</button>
        <span style="font-size: var(--fs-sm);color:var(--tp-dim);">Guarda un snapshot del plan actual con fecha para referencia</span>
        ${tpState.fixedPlan ? `<button class="tp-btn tp-btn-ghost" onclick="tpState.fixedPlan=null;tpSave();tpRender();" style="margin-left:auto;">Desfijar</button>` : ''}
    </div>

    <!-- Config table -->
    <div class="tp-card">
        <div class="tp-card-title">
            <span>🔍 Análisis de Gap — Configuraciones</span>
            <span style="font-size: var(--fs-xs);color:var(--tp-dim);" id="tp-dash-count"></span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
            <input class="tp-input" aria-label="Buscar configuración" placeholder="Buscar config..." style="max-width:220px;" id="tp-dash-search" oninput="_tpDebouncedDashRender()">
            <select class="tp-select" id="tp-dash-fmodel" onchange="tpRenderDashTable()">
                <option value="ALL">Todos los modelos</option>
                ${[...new Set(tpState.planData.map(c=>c.mod))].sort().map(m=>`<option>${m}</option>`).join('')}
            </select>
            <select class="tp-select" id="tp-dash-fregion" onchange="tpRenderDashTable()">
                <option value="ALL">Todas las regiones</option>
                ${[...new Set(tpState.planData.map(c=>c.rgn))].sort().map(r=>`<option>${r}</option>`).join('')}
            </select>
            <button class="tp-btn tp-btn-ghost" onclick="document.getElementById('tp-dash-search').value='';document.getElementById('tp-dash-fmodel').value='ALL';document.getElementById('tp-dash-fregion').value='ALL';window._tpDashFilter='ALL';tpRenderDashTable();">Limpiar</button>
        </div>
        <div style="max-height:420px;overflow-y:auto;" id="tp-dash-table-container"></div>
    </div>
    `;

    tpRenderDashTable();
}

// ═══ BURNDOWN CHART ═══
function tpRenderBurndownChart(stats) {
    var tested = (tpState.testedList || []).slice();
    if (tested.length < 2) return '<div style="text-align:center;padding:20px;color:var(--tp-dim);font-size: var(--fs-xs);">Necesitas al menos 2 pruebas completadas para generar burndown.</div>';

    tested.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });

    // Group by ISO week
    var weekMap = {};
    var totalReq = stats.totalReq || 0;
    tested.forEach(function(t) {
        if (!t.date) return;
        var d = new Date(t.date);
        var wk = tpISOWeekKey(d);
        weekMap[wk] = (weekMap[wk] || 0) + 1;
    });

    var weeks = Object.keys(weekMap).sort();
    var cumul = 0;
    var series = weeks.map(function(wk) {
        cumul += weekMap[wk];
        return { week: wk, tested: weekMap[wk], cumulative: cumul, remaining: Math.max(0, totalReq - cumul) };
    });

    // Velocity metrics
    var totalWeeks = series.length;
    var avgVelocity = totalWeeks > 0 ? cumul / totalWeeks : 0;
    var recent = series.slice(-2);
    var recentVelocity = recent.length > 0 ? recent.reduce(function(s, p) { return s + p.tested; }, 0) / recent.length : 0;
    var remaining = series.length > 0 ? series[series.length - 1].remaining : totalReq;
    var weeksLeft = recentVelocity > 0 ? Math.ceil(remaining / recentVelocity) : (avgVelocity > 0 ? Math.ceil(remaining / avgVelocity) : 0);
    var completionDate = '—';
    if (weeksLeft > 0 && weeksLeft < 200) {
        var est = new Date();
        est.setDate(est.getDate() + weeksLeft * 7);
        completionDate = est.toLocaleDateString('es-MX');
    } else if (remaining === 0) {
        completionDate = 'Completado';
    }

    // Linear regression for forecast line
    var forecastPts = [];
    if (series.length >= 2 && remaining > 0) {
        var xs = series.map(function(_, i) { return i; });
        var ys = series.map(function(p) { return p.remaining; });
        var n = xs.length;
        var sumX = xs.reduce(function(s, v) { return s + v; }, 0);
        var sumY = ys.reduce(function(s, v) { return s + v; }, 0);
        var sumXY = xs.reduce(function(s, v, i) { return s + v * ys[i]; }, 0);
        var sumX2 = xs.reduce(function(s, v) { return s + v * v; }, 0);
        var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        var intercept = (sumY - slope * sumX) / n;
        // Project forward
        for (var i = 0; i <= n + weeksLeft + 2; i++) {
            var y = intercept + slope * i;
            forecastPts.push(Math.max(0, y));
        }
    }

    // Build chart labels
    var labels = series.map(function(p) { return p.week; });
    // Extend labels for forecast
    if (forecastPts.length > labels.length) {
        var lastDate = series.length > 0 ? new Date(series[series.length - 1].week + 'T00:00:00') : new Date();
        for (var i = labels.length; i < forecastPts.length; i++) {
            lastDate.setDate(lastDate.getDate() + 7);
            labels.push(tpISOWeekKey(lastDate));
        }
    }

    // ── [R2-M9] Risk Assessment ──
    var deadline = tpState.deadline || null;
    var deadlineWeeks = 0;
    var requiredVelocity = 0;
    var riskLevel = 'unknown';
    var riskColor = '#64748b';
    var riskIcon = '❓';
    var riskMsg = '';

    if (deadline && remaining > 0) {
        var now = new Date();
        var dl = new Date(deadline);
        deadlineWeeks = Math.max(0, Math.ceil((dl - now) / (7 * 86400000)));
        requiredVelocity = deadlineWeeks > 0 ? remaining / deadlineWeeks : remaining;

        if (recentVelocity >= requiredVelocity) {
            riskLevel = 'on-track';
            riskColor = '#10b981';
            riskIcon = '✅';
            riskMsg = 'En camino. ETA: ' + completionDate + (weeksLeft > 0 && deadlineWeeks > weeksLeft ? ' (' + (deadlineWeeks - weeksLeft) + ' sem antes del deadline)' : '');
        } else if (recentVelocity >= requiredVelocity * 0.8) {
            riskLevel = 'at-risk';
            riskColor = '#f59e0b';
            riskIcon = '⚠️';
            riskMsg = 'En riesgo. Vel. actual: ' + recentVelocity.toFixed(1) + '/sem. Necesitas: ' + requiredVelocity.toFixed(1) + '/sem (+' + Math.round((requiredVelocity/recentVelocity - 1)*100) + '%)';
        } else {
            riskLevel = 'behind';
            riskColor = '#ef4444';
            riskIcon = '🔴';
            var delayWeeks = recentVelocity > 0 ? Math.ceil(remaining / recentVelocity) - deadlineWeeks : 99;
            riskMsg = 'Atrasado. Vel. actual: ' + recentVelocity.toFixed(1) + '/sem. Necesitas: ' + requiredVelocity.toFixed(1) + '/sem. Retraso est: ~' + delayWeeks + ' semanas';
        }
    } else if (remaining === 0) {
        riskLevel = 'complete';
        riskColor = '#10b981';
        riskIcon = '🏆';
        riskMsg = 'Plan completado al 100%';
    }

    // Velocity trend (last 4 weeks)
    var velTrend = series.slice(-4).map(function(s) { return s.tested; });

    // Risk alert banner
    var html = '';
    if (riskMsg) {
        html += '<div style="padding:10px 14px;background:' + riskColor + '15;border:1px solid ' + riskColor + '40;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;gap:10px;">' +
            '<span style="font-size:18px;">' + riskIcon + '</span>' +
            '<div><div style="font-size:12px;font-weight:700;color:' + riskColor + ';">' + riskMsg + '</div>';
        if (deadline) html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:2px;">Deadline: ' + new Date(deadline).toLocaleDateString('es-MX') + ' (' + deadlineWeeks + ' semanas restantes)</div>';
        html += '</div></div>';
    }

    // Metrics
    html += '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">' +
        '<div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:var(--tp-amber);font-size:14px;">' + avgVelocity.toFixed(1) + '</div><div class="tp-metric-label">Vel. Promedio/sem</div></div>' +
        '<div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:var(--tp-blue);font-size:14px;">' + recentVelocity.toFixed(1) + '</div><div class="tp-metric-label">Vel. Reciente/sem</div></div>' +
        '<div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:var(--tp-red);font-size:14px;">' + remaining + '</div><div class="tp-metric-label">Deficit Actual</div></div>' +
        '<div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:#8b5cf6;font-size:14px;">' + (weeksLeft > 0 ? weeksLeft : '—') + '</div><div class="tp-metric-label">Semanas Rest.</div></div>' +
        '<div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:var(--tp-green);font-size:13px;">' + completionDate + '</div><div class="tp-metric-label">Est. Completacion</div></div>' +
    '</div>';

    // Velocity trend mini-table
    if (velTrend.length >= 2) {
        html += '<div style="display:flex;gap:4px;margin-bottom:8px;align-items:center;">' +
            '<span style="font-size: var(--fs-xs);color:var(--tp-dim);margin-right:4px;">Vel. reciente:</span>';
        velTrend.forEach(function(v, i) {
            var prevV = i > 0 ? velTrend[i-1] : v;
            var arrow = v > prevV ? '↑' : v < prevV ? '↓' : '→';
            var clr = v > prevV ? '#10b981' : v < prevV ? '#ef4444' : '#64748b';
            html += '<span style="font-size: var(--fs-sm);font-weight:700;color:' + clr + ';padding:2px 8px;background:' + clr + '15;border-radius:4px;">' + v + ' ' + arrow + '</span>';
        });
        html += '</div>';
    }

    html += (typeof chartConfigBuildPanel === 'function' ? chartConfigBuildPanel('tp_burndown', '_tpBurndownChart', {rerenderFn:'tpRender();'}) : '');
    html += '<div id="tp_burndown-wrapper" style="height:' + (typeof chartConfigGet==='function'?chartConfigGet('tp_burndown').height:250) + 'px;"><canvas id="tp-burndown-canvas"></canvas></div>';

    // Schedule chart render after DOM update
    setTimeout(function() {
        if (window._tpBurndownChart) { try { window._tpBurndownChart.destroy(); } catch(e) {} }
        var ctx = document.getElementById('tp-burndown-canvas');
        if (!ctx || typeof Chart === 'undefined') return;

        // [R2-M9] Risk band datasets
        var datasets = [];

        // Calculate risk bands if deadline exists
        if (deadline && totalReq > 0 && labels.length > 0) {
            var onTrackLine = [];
            var atRiskLine = [];
            var behindLine = [];
            for (var bi = 0; bi < labels.length; bi++) {
                // Ideal pace: linear from first remaining to 0 at deadline
                var startRemaining = series.length > 0 ? series[0].remaining + series[0].tested : totalReq;
                var idealPerWeek = startRemaining / Math.max(1, labels.length - 1);
                var idealRemaining = Math.max(0, startRemaining - idealPerWeek * bi);
                onTrackLine.push(idealRemaining);
                atRiskLine.push(Math.min(idealRemaining * 1.2, totalReq));
                behindLine.push(Math.min(idealRemaining * 1.5, totalReq));
            }
            datasets.push({ label: 'Zona Atrasado', data: behindLine, borderColor: 'transparent', backgroundColor: 'rgba(239,68,68,0.06)', pointRadius: 0, borderWidth: 0, fill: true, order: 10 });
            datasets.push({ label: 'Zona En Riesgo', data: atRiskLine, borderColor: 'transparent', backgroundColor: 'rgba(245,158,11,0.06)', pointRadius: 0, borderWidth: 0, fill: true, order: 9 });
            datasets.push({ label: 'Zona On Track', data: onTrackLine, borderColor: 'transparent', backgroundColor: 'rgba(16,185,129,0.06)', pointRadius: 0, borderWidth: 0, fill: true, order: 8 });
        }

        datasets.push(
            { label: 'Deficit Restante', data: series.map(function(p) { return p.remaining; }), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', pointRadius: 4, borderWidth: 2, fill: true, tension: 0.1, order: 1 }
        );
        if (forecastPts.length > 0) {
            var forecastData = [];
            for (var i = 0; i < series.length - 1; i++) forecastData.push(null);
            for (var i = Math.max(0, series.length - 1); i < forecastPts.length; i++) forecastData.push(forecastPts[i]);
            datasets.push({ label: 'Forecast (regresion)', data: forecastData, borderColor: '#64748b', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0, order: 2 });
        }
        datasets.push({ label: 'Meta (0)', data: Array(labels.length).fill(0), borderColor: '#10b981', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false, order: 3 });

        window._tpBurndownChart = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8', font: { size: 9 } } } },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 8 }, maxRotation: 45 }, grid: { color: 'rgba(15,23,42,0.08)' } },
                    y: { title: { display: true, text: 'Deficit', color: '#64748b', font: { size: 9 } }, ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(15,23,42,0.08)' }, min: 0 }
                }
            }
        });
    }, 50);

    return html;
}

function tpISOWeekKey(d) {
    // parse local ('YYYY-MM-DD' con new Date() es UTC y corre el día); copiar si ya es Date
    var dt = (d instanceof Date) ? new Date(d) : parseLocalDate(d);
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() - (dt.getDay() || 7) + 1); // Monday
    return localDateStr(dt);
}

// ═══ DASHBOARD CHART RENDERER ═══
function tpRenderDashChart(analysis) {
    // Restore persisted config
    if (typeof chartConfigGet === 'function') {
        var _tpDashCfg = chartConfigGet('tp_dashboard');
        if (_tpDashCfg.groupBy && !window._tpChartGroupBy) window._tpChartGroupBy = _tpDashCfg.groupBy;
        if (_tpDashCfg.metric && !window._tpChartMetric) window._tpChartMetric = _tpDashCfg.metric;
        if (_tpDashCfg.chartType && !window._tpChartType) window._tpChartType = _tpDashCfg.chartType;
        if (_tpDashCfg.yMax && !window._tpDashYMax) window._tpDashYMax = _tpDashCfg.yMax;
        if (_tpDashCfg.chartH && !window._tpDashChartH) window._tpDashChartH = _tpDashCfg.chartH;
    }
    const groupBy = window._tpChartGroupBy || 'region';
    const metric = window._tpChartMetric || 'qty';
    const chartType = window._tpChartType || 'bar';
    const userYMax = window._tpDashYMax || 0;
    const chartH = window._tpDashChartH || 0;

    // Build grouped data
    const groupMap = {};
    analysis.forEach(a => {
        let key;
        if (groupBy === 'region') key = a.rgn || 'Otro';
        else if (groupBy === 'model') key = a.mod || 'Otro';
        else if (groupBy === 'regulation') key = a.reg || 'Otro';
        else if (groupBy === 'family') {
            // Group by model+engine family
            key = (a.mod || '?') + ' ' + (a.eng || '?');
        }
        if (!groupMap[key]) groupMap[key] = {name:key, req:0, tested:0, vol:0};
        groupMap[key].req += a.required;
        groupMap[key].tested += a.testedN;
        groupMap[key].vol += a.total;
    });
    let data = Object.values(groupMap).sort((a,b) => b.vol - a.vol);
    // Limit to top 15 groups for readability
    if (data.length > 15) data = data.slice(0, 15);

    if (data.length === 0) return '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Sin datos</div>';

    const hStyle = chartH > 0 ? `height:${chartH}px;` : '';
    const autoMax = metric === 'pct' ? 100 : metric === 'deficit' ? Math.max(...data.map(r => Math.max(0, r.req - r.tested)), 1) : Math.max(...data.map(r => r.req), 1);
    const maxVal = userYMax > 0 ? userYMax : autoMax;
    const legend = metric === 'qty' ? '<span style="font-size: var(--fs-xs);color:var(--tp-amber);">■ Requeridas</span><span style="font-size: var(--fs-xs);color:var(--tp-green);">■ Probadas</span>' : metric === 'pct' ? '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">% Cumplimiento</span>' : '<span style="font-size: var(--fs-xs);color:var(--tp-red);">■ Deficit</span>';

    // Horizontal bars
    if (chartType === 'hbar') {
        return `<div style="display:flex;flex-direction:column;gap:4px;">
            ${data.map(r => {
                const val = metric === 'pct' ? (r.req > 0 ? Math.round(r.tested / r.req * 100) : 0) : metric === 'deficit' ? Math.max(0, r.req - r.tested) : r.req;
                const val2 = metric === 'qty' ? r.tested : 0;
                const pct1 = maxVal > 0 ? Math.min(100, Math.round(val / maxVal * 100)) : 0;
                const pct2 = metric === 'qty' && maxVal > 0 ? Math.min(100, Math.round(val2 / maxVal * 100)) : 0;
                const color = metric === 'pct' ? (val >= 100 ? 'var(--tp-green)' : val >= 50 ? 'var(--tp-amber)' : 'var(--tp-red)') : metric === 'deficit' ? 'var(--tp-red)' : 'var(--tp-amber)';
                return `<div style="display:flex;align-items:center;gap:6px;">
                    <div style="width:80px;font-size: var(--fs-xs);color:var(--tp-text);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.name}">${r.name}</div>
                    <div style="flex:1;height:18px;background:var(--tp-border);border-radius:3px;position:relative;overflow:hidden;">
                        ${metric === 'qty' ? `
                        <div style="position:absolute;height:100%;width:${pct1}%;background:${color};border-radius:3px;opacity:0.4;"></div>
                        <div style="position:absolute;height:100%;width:${pct2}%;background:var(--tp-green);border-radius:3px;"></div>
                        ` : `
                        <div style="position:absolute;height:100%;width:${pct1}%;background:${color};border-radius:3px;"></div>
                        `}
                    </div>
                    <div style="width:55px;font-size: var(--fs-xs);font-weight:700;color:var(--tp-text);text-align:left;">${metric === 'pct' ? val + '%' : metric === 'qty' ? val2 + '/' + val : val}</div>
                </div>`;
            }).join('')}
        </div>
        <div style="display:flex;gap:16px;justify-content:center;margin-top:6px;">${legend}</div>`;
    }

    // Stacked bars (vertical)
    if (chartType === 'stacked') {
        return `<div class="tp-chart-bar" style="${hStyle}">
            ${data.map(r => {
                const testedH = Math.min(100, (r.tested / maxVal) * 100);
                const defH = Math.min(100 - testedH, (Math.max(0, r.req - r.tested) / maxVal) * 100);
                const pct = r.req > 0 ? Math.round(r.tested / r.req * 100) : 0;
                return `<div class="tp-chart-col">
                    <div class="tp-chart-value" style="font-size: var(--fs-xs);">${r.tested}/${r.req}</div>
                    <div class="tp-chart-group" style="position:relative;">
                        <div style="position:absolute;bottom:0;width:100%;height:${testedH + defH}%;display:flex;flex-direction:column;justify-content:flex-end;">
                            <div style="height:${defH > 0 ? (defH/(testedH+defH)*100) : 0}%;background:var(--tp-red);opacity:0.3;border-radius:3px 3px 0 0;"></div>
                            <div style="height:${testedH > 0 ? (testedH/(testedH+defH)*100) : 0}%;background:var(--tp-green);border-radius:0 0 3px 3px;"></div>
                        </div>
                    </div>
                    <div class="tp-chart-label">${r.name.length > 8 ? r.name.slice(0,7) + '..' : r.name}</div>
                    <div style="font-size: var(--fs-xs);font-weight:700;color:${pct>=100?'var(--tp-green)':pct>=50?'var(--tp-amber)':'var(--tp-red)'};">${pct}%</div>
                </div>`;
            }).join('')}
        </div>
        <div style="display:flex;gap:16px;justify-content:center;margin-top:6px;">
            <span style="font-size: var(--fs-xs);color:var(--tp-green);">■ Probadas</span>
            <span style="font-size: var(--fs-xs);color:var(--tp-red);opacity:0.5;">■ Deficit</span>
        </div>`;
    }

    // Default vertical bars
    return `<div class="tp-chart-bar" style="${hStyle}">
        ${data.map(r => {
            const pct = r.req > 0 ? Math.round(r.tested / r.req * 100) : 0;
            if (metric === 'pct') {
                return `<div class="tp-chart-col">
                    <div class="tp-chart-value">${pct}%</div>
                    <div class="tp-chart-group">
                        <div class="tp-chart-fill" style="height:${Math.min(100,pct)}%;background:${pct>=100?'var(--tp-green)':pct>=50?'var(--tp-amber)':'var(--tp-red)'};"></div>
                    </div>
                    <div class="tp-chart-label">${r.name.length > 8 ? r.name.slice(0,7) + '..' : r.name}</div>
                </div>`;
            }
            if (metric === 'deficit') {
                const def = Math.max(0, r.req - r.tested);
                return `<div class="tp-chart-col">
                    <div class="tp-chart-value">${def}</div>
                    <div class="tp-chart-group">
                        <div class="tp-chart-fill" style="height:${maxVal>0?Math.min(100,(def/maxVal)*100):0}%;background:var(--tp-red);"></div>
                    </div>
                    <div class="tp-chart-label">${r.name.length > 8 ? r.name.slice(0,7) + '..' : r.name}</div>
                </div>`;
            }
            return `<div class="tp-chart-col">
                <div class="tp-chart-value">${r.tested}/${r.req}</div>
                <div class="tp-chart-group">
                    <div class="tp-chart-fill" style="height:${Math.min(100,(r.req/maxVal)*100)}%;background:var(--tp-amber);"></div>
                    <div class="tp-chart-fill" style="height:${Math.min(100,(r.tested/maxVal)*100)}%;background:var(--tp-green);"></div>
                </div>
                <div class="tp-chart-label">${r.name.length > 8 ? r.name.slice(0,7) + '..' : r.name}</div>
                <div style="font-size: var(--fs-xs);font-weight:700;color:${pct>=100?'var(--tp-green)':pct>=50?'var(--tp-amber)':'var(--tp-red)'};">${pct}%</div>
            </div>`;
        }).join('')}
    </div>
    <div style="display:flex;gap:16px;justify-content:center;margin-top:6px;">${legend}</div>`;
}

function tpRenderDashTable() {
    const container = document.getElementById('tp-dash-table-container');
    if (!container) return;
    const analysis = tpGetAnalysis();
    const search = (document.getElementById('tp-dash-search')?.value || '').toLowerCase();
    const fModel = document.getElementById('tp-dash-fmodel')?.value || 'ALL';
    const fRegion = document.getElementById('tp-dash-fregion')?.value || 'ALL';
    const fStatus = window._tpDashFilter || 'ALL';

    const filtered = analysis.filter(a => {
        if (fModel !== 'ALL' && a.mod !== fModel) return false;
        if (fRegion !== 'ALL' && a.rgn !== fRegion) return false;
        if (fStatus !== 'ALL' && a.status !== fStatus) return false;
        if (search && !a.desc.toLowerCase().includes(search) && !a.id.toLowerCase().includes(search)) return false;
        return true;
    });

    document.getElementById('tp-dash-count').textContent = `${filtered.length} de ${analysis.length}`;

    container.innerHTML = `
    <table class="tp-table">
        <thead><tr>
            <th></th><th>Config Text</th><th>Mod</th><th>Región</th><th>Reg.</th><th>Motor</th><th>TX</th>
            <th style="text-align:right">Vol.Plan</th><th style="text-align:right">Hist</th>
            <th style="text-align:right" data-help="tp-req-help">Req.</th><th style="text-align:right">Prob.</th><th style="text-align:right">Déf.</th>
            <th>Score</th><th>Estado</th>
        </tr></thead>
        <tbody>
            ${filtered.slice(0,80).map(a => {
                var noRule = a.reg && a.rgn && (a.ruleInfo.matchType === 'comodín' || a.ruleInfo.matchType === 'default');
                var reqTitle = a.ruleInfo.formula + ' = ' + a.required + ' · Regla: ' + a.ruleInfo.label + ' (' + a.ruleInfo.matchType + ')';
                var dormant = !a.paused && !a.pausedDecided && tpIsDormant(a);
                var descAttr = a.desc.replace(/'/g, "\\'");
                return `
                <tr style="${a.paused ? 'opacity:0.55;' : ''}">
                    <td><span class="tp-dot" style="background:${tpStatusColor[a.status]}"></span></td>
                    <td style="font-size: var(--fs-xs);color:var(--tp-amber);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.desc}">${a.desc}${a.paused ? ` <span title="Pausada — no exige pruebas ni cuenta en cobertura. Toca para reactivar." style="cursor:pointer;" onclick="tpResumeConfig('${descAttr}')">⏸</span>` : ''}</td>
                    <td>${a.mod}</td>
                    <td><span class="tp-badge" style="background:${tpRegionColor(a.rgn)}20;color:${tpRegionColor(a.rgn)};border:1px solid ${tpRegionColor(a.rgn)}40;font-size: var(--fs-xs);">${a.rgn}</span></td>
                    <td style="font-size: var(--fs-xs)">${a.reg}</td>
                    <td style="font-size: var(--fs-xs)">${a.eng}</td>
                    <td style="font-size: var(--fs-xs)">${a.tx}</td>
                    <td style="text-align:right;font-family:monospace">${a.total.toLocaleString()}</td>
                    <td style="text-align:right;font-family:monospace;color:var(--tp-dim)">${a.hist.toLocaleString()}</td>
                    <td style="text-align:right;font-weight:700;cursor:help;" title="${escapeHtml(reqTitle)}">${a.required}${noRule ? ' <span style="color:var(--tp-amber);" title="No hay regla específica para ' + escapeHtml(a.rgn) + ' / ' + escapeHtml(a.reg) + ' — se usó la regla \'' + escapeHtml(a.ruleInfo.label) + '\'">●</span>' : ''}</td>
                    <td style="text-align:right;color:var(--tp-green);font-weight:700">${a.testedN}</td>
                    <td style="text-align:right;color:${a.deficit>0?'var(--tp-red)':'var(--tp-green)'};font-weight:700">${a.deficit}</td>
                    <td><div class="tp-bar" style="width:55px"><div class="tp-bar-fill" style="width:${Math.min(a.score,100)}%;background:${tpStatusColor[a.status]}"></div><span class="tp-bar-text">${a.score.toFixed(0)}</span></div></td>
                    <td><span class="tp-badge" style="background:${tpStatusColor[a.status]}20;color:${tpStatusColor[a.status]};border:1px solid ${tpStatusColor[a.status]}40;font-size: var(--fs-xs);">${tpStatusLabel[a.status]}</span></td>
                </tr>
                ${dormant ? `
                <tr>
                    <td colspan="14" style="background:rgba(245,158,11,0.08);padding:5px 10px;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size: var(--fs-xs);" data-help="tp-dormant-help">
                            <span>😴 3+ meses sin producción — ¿seguir contabilizando esta configuración?</span>
                            <button class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);" onclick="tpConfirmDormantActive('${descAttr}')">Sí, seguir</button>
                            <button class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);color:var(--tp-red);" onclick="tpPauseConfig('${descAttr}')">⏸ Pausar</button>
                        </div>
                    </td>
                </tr>` : ''}
            `;}).join('')}
        </tbody>
    </table>
    ${filtered.length > 80 ? `<div style="padding:8px;text-align:center;color:var(--tp-dim);font-size: var(--fs-xs);">Mostrando 80 de ${filtered.length}</div>` : ''}
    `;
    if (typeof cascadeInjectTooltipsDeferred === 'function') cascadeInjectTooltipsDeferred();
}

function tpFixPlan() {
    const analysis = tpGetAnalysis();
    tpState.fixedPlan = {
        date: new Date().toISOString(),
        configs: analysis.length,
        totalTests: analysis.reduce((s,a) => s + a.required, 0),
        testedAtFix: analysis.reduce((s,a) => s + a.testedN, 0),
        deficit: analysis.reduce((s,a) => s + a.deficit, 0),
        snapshot: analysis.map(a => ({desc:a.desc, req:a.required, tested:a.testedN, status:a.status})),
    };
    tpSave();
    tpRender();
    showToast('Plan fijado con fecha ' + new Date().toLocaleDateString('es-MX'), 'success');
}

// ═══ CSV EXPORT for Gap Analysis ═══
function tpExportGapCSV() {
    var analysis = tpGetAnalysis();
    if (analysis.length === 0) { showToast('Sin datos para exportar', 'warning'); return; }
    var rows = ['Config,Modelo,Regulacion,Region,Requeridas,Probadas,Deficit,Score,Status'];
    analysis.forEach(function(a) {
        rows.push([
            '"' + (a.desc || '').replace(/"/g,'""') + '"',
            a.mod || '', a.reg || '', a.rgn || '',
            a.required, a.testedN, a.deficit,
            a.score.toFixed(1), a.status
        ].join(','));
    });
    var blob = new Blob([rows.join('\n')], {type:'text/csv;charset=utf-8;'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gap_analysis_' + localToday() + '.csv';
    a.click();
    showToast('CSV gap analysis exportado', 'success');
}

// ═══ JSON EXPORT — Reporte ejecutivo del Plan (para presentaciones) ═══
// Agrupa unidades probadas/liberadas, plan semanal + cumplimiento, familias +
// calendario y KPIs en un solo archivo .json listo para analizar después.
function tpExportPlanJSON() {
    try {
        function tally(arr, keyFn) {
            var m = {};
            (arr || []).forEach(function(x) { var k = keyFn(x) || '(sin dato)'; m[k] = (m[k] || 0) + 1; });
            return m;
        }
        var ver = (typeof getAppVersionInfo === 'function') ? getAppVersionInfo() : { version: '?', build: null, publishedES: null };
        var families = (typeof tpBuildFamilies === 'function') ? (tpBuildFamilies() || []) : [];
        var analysis = (typeof tpGetAnalysis === 'function') ? (tpGetAnalysis() || []) : [];
        var tested = (typeof tpState !== 'undefined' && tpState.testedList) ? tpState.testedList : [];
        var weekly = (typeof tpState !== 'undefined' && tpState.weeklyPlans) ? tpState.weeklyPlans : [];
        var vehicles = (typeof db !== 'undefined' && db && db.vehicles) ? db.vehicles : [];

        // Unidades liberadas (archivadas) desde COP15
        var released = vehicles.filter(function(v) { return v.status === 'archived'; }).map(function(v) {
            var arch = null;
            if (v.timeline && v.timeline.length) {
                var e = v.timeline.filter(function(t) { return /archiv|liber/i.test(t.action || ''); }).pop();
                if (e) arch = e.timestamp;
            }
            var gas = v.testData && (v.testData.gasResults || v.testData.gases);
            return {
                vin: v.vin || null,
                configCode: v.configCode || null,
                proposito: v.purpose || null,
                modelo: (v.config && (v.config['Modelo'] || v.config['MODEL'])) || null,
                regulacion: (v.config && v.config['EMISSION REGULATION']) || null,
                registeredAt: v.registeredAt || null,
                archivedAt: arch,
                tieneResultadosGas: !!gas
            };
        });

        // Unidades probadas agrupadas por configuración
        var byConfig = {};
        tested.forEach(function(t) {
            var k = t.configText || '(sin config)';
            if (!byConfig[k]) byConfig[k] = { configText: k, probadas: 0, fechas: [], purposes: {} };
            byConfig[k].probadas++;
            if (t.date) byConfig[k].fechas.push(t.date);
            var p = t.purpose || '(sin propósito)';
            byConfig[k].purposes[p] = (byConfig[k].purposes[p] || 0) + 1;
        });
        var porConfiguracion = Object.keys(byConfig).map(function(k) {
            var o = byConfig[k]; var f = o.fechas.slice().sort();
            return { configText: k, probadas: o.probadas, purposes: o.purposes, primeraFecha: f[0] || null, ultimaFecha: f[f.length - 1] || null };
        }).sort(function(a, b) { return b.probadas - a.probadas; });

        // Plan semanal + cumplimiento
        var planSemanal = weekly.map(function(w, i) {
            var items = w.items || [];
            var done = items.filter(function(x) { return x.completed; }).length;
            var carry = items.filter(function(x) { return x.status === 'carryover'; }).length;
            return {
                semana: i + 1, weekDate: w.weekDate || null, created: w.created || null,
                aceptada: !!w.accepted, capacidad: w.capacity || null,
                total: items.length, completadas: done, pendientes: items.length - done, carryover: carry,
                cumplimientoPct: items.length ? Math.round(done / items.length * 100) : 0,
                items: items.map(function(x) {
                    return {
                        desc: x.desc, modelo: x.mod, region: x.rgn, regulacion: x.reg, motor: x.eng,
                        requeridas: x.required, deficit: x.deficit,
                        completada: !!x.completed, completedDate: x.completedDate || null, status: x.status || null
                    };
                })
            };
        });
        var totalWeekItems = planSemanal.reduce(function(s, w) { return s + w.total; }, 0);
        var totalWeekDone = planSemanal.reduce(function(s, w) { return s + w.completadas; }, 0);

        // Familias + calendario
        var familias = families.map(function(f) {
            return {
                key: f.key, modelo: f.mod, motor: f.eng, transmision: f.tx, modelYear: f.my,
                regulacion: f.reg, regiones: f.rgns, carrocerias: f.bodies, traccion: f.drvs,
                volumenTotal: f.totalVol, configs: f.configs ? f.configs.length : 0,
                probadas: f.totalTested, requeridas: f.totalRequired,
                coberturaPct: typeof f.coverage === 'number' ? Math.round(f.coverage * 100) : null,
                deficit: f.deficit, riesgo: f.riskLevel, criticidad: f.criticality,
                deadline: f.overrideDeadline || null,
                diasParaDeadline: (typeof f.daysToDeadline === 'number' ? f.daysToDeadline : null),
                recurso: f.resourceStatus || null
            };
        });
        var calendario = familias.filter(function(f) { return f.deadline; })
            .map(function(f) { return { familia: f.key, modelo: f.modelo, regulacion: f.regulacion, deadline: f.deadline, diasRestantes: f.diasParaDeadline, criticidad: f.criticidad, coberturaPct: f.coberturaPct }; })
            .sort(function(a, b) { return String(a.deadline).localeCompare(String(b.deadline)); });

        // Calendario por variante (deadlines particulares de cada configuración)
        var calendarioVariantes = [];
        families.forEach(function(f) {
            (f.configs || []).forEach(function(c) {
                if (c.overrideDeadline) {
                    calendarioVariantes.push({
                        familia: f.key, modelo: f.mod, carroceria: c.body || null, tire: c.tire || null,
                        region: c.rgn || null, configText: c.desc,
                        deadline: c.overrideDeadline, diasRestantes: c.daysToDeadline,
                        probadas: c.testedN, requeridas: c.required
                    });
                }
            });
        });
        calendarioVariantes.sort(function(a, b) { return String(a.deadline).localeCompare(String(b.deadline)); });

        var totalReq = analysis.reduce(function(s, a) { return s + (a.required || 0); }, 0);
        var totalT = analysis.reduce(function(s, a) { return s + (a.testedN || 0); }, 0);

        var payload = {
            meta: {
                app: 'KIA EmLab',
                version: ver.version, build: ver.build, publicadaApp: ver.publishedES,
                exportadoEl: new Date().toISOString(),
                exportadoEsMX: new Date().toLocaleString('es-MX'),
                planImportadoEl: (typeof tpState !== 'undefined' && tpState.planImportDate) || null,
                descripcion: 'Exportación del Test Plan Manager (KIA EmLab) para reporte ejecutivo / presentación.'
            },
            resumenEjecutivo: {
                configuraciones: analysis.length,
                pruebasRequeridas: totalReq,
                pruebasRealizadas: totalT,
                deficit: Math.max(0, totalReq - totalT),
                coberturaGlobalPct: totalReq ? Math.round(totalT / totalReq * 100) : 100,
                configsSinProbar: analysis.filter(function(a) { return a.testedN === 0 && a.total > 0; }).length,
                totalUnidadesProbadas: tested.length,
                totalUnidadesLiberadas: released.length,
                familias: familias.length,
                familiasCubiertas: familias.filter(function(f) { return f.coberturaPct != null && f.coberturaPct >= 100; }).length,
                familiasCriticas: familias.filter(function(f) { return f.criticidad === 'critical'; }).length,
                cumplimientoSemanalPct: totalWeekItems ? Math.round(totalWeekDone / totalWeekItems * 100) : 0
            },
            unidades: {
                totalProbadas: tested.length,
                totalLiberadas: released.length,
                probadasPorProposito: tally(tested, function(t) { return t.purpose; }),
                probadasPorFuente: tally(tested, function(t) { return t.source; }),
                liberadasPorModelo: tally(released, function(r) { return r.modelo; }),
                liberadasPorRegulacion: tally(released, function(r) { return r.regulacion; }),
                porConfiguracion: porConfiguracion,
                liberadas: released,
                registroProbadas: tested
            },
            planSemanal: planSemanal,
            familias: familias,
            calendario: calendario,
            calendarioVariantes: calendarioVariantes
        };

        var json = JSON.stringify(payload, null, 2);
        var blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'kia_emlab_plan_' + localToday() + '.json';
        a.click();
        setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
        showToast('Datos del Plan exportados (JSON) — ' + tested.length + ' probadas, ' + released.length + ' liberadas', 'success');
    } catch (e) {
        console.error('tpExportPlanJSON error:', e);
        showToast('Error al exportar: ' + e.message, 'error');
    }
}


// ═══ TESTED TAB ═══
function tpRenderTested(el) {
    el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
        <button class="tp-btn ${window._tpTestedMode!=='json'?'tp-btn-primary':'tp-btn-ghost'}" onclick="window._tpTestedMode='manual';tpRender();">✏️ Captura Manual</button>
        <button class="tp-btn ${window._tpTestedMode==='json'?'tp-btn-primary':'tp-btn-ghost'}" onclick="window._tpTestedMode='json';tpRender();">📥 Importar JSON</button>
        <button class="tp-btn tp-btn-ghost" onclick="tpRecoverFromCOP15()" style="border-color:#8b5cf6;color:#8b5cf6;">🔄 Recuperar de COP15</button>
    </div>

    ${window._tpTestedMode !== 'json' ? `
    <div class="tp-card">
        <div class="tp-card-title"><span>✏️ Registrar Vehículo Probado</span></div>
        <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;">
            <div style="flex:1;min-width:250px;position:relative;">
                <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:3px;">Config Text (escribe para buscar)</label>
                <input class="tp-input" id="tp-manual-config" placeholder="Ej: BL7m-27 MODEL-6AT..." oninput="tpShowSuggestions()">
                <div id="tp-suggestions" class="tp-suggestions" style="display:none;"></div>
            </div>
            <div style="width:130px;">
                <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:3px;">Fecha</label>
                <input class="tp-input" type="date" id="tp-manual-date" value="${localToday()}">
            </div>
            <div style="flex:1;min-width:150px;">
                <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:3px;">Nota (VIN, etc.)</label>
                <input class="tp-input" id="tp-manual-note" placeholder="VIN, observaciones...">
            </div>
            <div style="padding-top:16px;">
                <button class="tp-btn tp-btn-primary" onclick="tpAddManual()">+ Agregar</button>
            </div>
        </div>
        <div id="tp-manual-msg" style="margin-top:6px;font-size: var(--fs-sm);"></div>
    </div>
    ` : `
    <div class="tp-card">
        <div class="tp-card-title"><span>📥 Importar desde JSON (COP15)</span></div>
        <p style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom:8px;">Pega el JSON exportado de tu herramienta COP15. Se busca el campo <code style="color:var(--tp-amber)">configCode</code> en cada registro.</p>
        <textarea id="tp-json-input" placeholder='Pega aquí el JSON...' style="width:100%;height:100px;background:#161f2e;border:1px solid var(--tp-border);border-radius:6px;padding:10px;color:var(--tp-text);font-size: var(--fs-sm);font-family:monospace;resize:vertical;"></textarea>
        <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="tp-btn tp-btn-primary" onclick="tpImportJSON()">Importar</button>
            <button class="tp-btn tp-btn-ghost" onclick="document.getElementById('tp-json-input').value='';">Limpiar</button>
        </div>
        <div id="tp-json-msg" style="margin-top:6px;font-size: var(--fs-sm);"></div>
    </div>
    `}

    <div class="tp-card">
        <div class="tp-card-title">
            <span>📋 Registro de Pruebas (${tpState.testedList.length})</span>
            ${tpState.testedList.length > 0 ? `<button class="tp-btn tp-btn-danger" onclick="showConfirm('¿Borrar todos los registros de pruebas?',function(){if(typeof undoPush==='function')undoPush('testplan','Borrar registros de pruebas');tpState.testedList=[];tpSave();tpRender();tpUpdateBadges();showToast('Registros borrados','success',null,undoPop);},{title:'Borrar registros',type:'danger',confirmText:'Borrar todo'})" style="font-size: var(--fs-xs);">🗑 Borrar todo</button>` : ''}
        </div>
        ${tpState.testedList.length === 0 ? `<div style="text-align:center;padding:25px;color:var(--tp-dim);"><div style="font-size:24px;margin-bottom:6px;">📭</div>No hay vehículos probados registrados<br><small style="color:var(--tp-dim);">Se agregan automáticamente al liberar vehículos en COP15 (Correlation, COP-Emisiones, EO-Emisiones, Investigación)</small><br><button class="tp-btn tp-btn-primary" onclick="window._tpTestedMode='manual';tpRender();" style="margin-top:12px;">✏️ Agregar Manual</button></div>` : `
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:flex-end;">
            <div>
                <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;">Desde</label>
                <input type="date" class="tp-input" id="tp-tested-from" value="${window._tpTestedFrom||''}" onchange="window._tpTestedFrom=this.value;tpRender();" style="font-size: var(--fs-xs);">
            </div>
            <div>
                <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;">Hasta</label>
                <input type="date" class="tp-input" id="tp-tested-to" value="${window._tpTestedTo||''}" onchange="window._tpTestedTo=this.value;tpRender();" style="font-size: var(--fs-xs);">
            </div>
            <button class="tp-btn tp-btn-ghost" onclick="window._tpTestedFrom='';window._tpTestedTo='';tpRender();" style="font-size: var(--fs-xs);">Limpiar filtro</button>
            <span style="font-size: var(--fs-xs);color:var(--tp-dim);margin-left:auto;">${(() => {
                const from = window._tpTestedFrom || '';
                const to = window._tpTestedTo || '';
                const filtered = tpState.testedList.filter(t => {
                    if (from && t.date < from) return false;
                    if (to && t.date > to) return false;
                    return true;
                });
                return from || to ? filtered.length + ' de ' + tpState.testedList.length + ' mostrados' : '';
            })()}</span>
        </div>
        <div style="max-height:350px;overflow-y:auto;">
            <table class="tp-table">
                <thead><tr><th>Config</th><th>VIN</th><th>Fecha</th><th>Fuente</th><th>Proposito</th><th></th></tr></thead>
                <tbody>
                    ${tpState.testedList.filter(t => {
                        const from = window._tpTestedFrom || '';
                        const to = window._tpTestedTo || '';
                        if (from && t.date < from) return false;
                        if (to && t.date > to) return false;
                        return true;
                    }).map((t,i) => {
                        const origIdx = tpState.testedList.indexOf(t);
                        // v20: iba `\\s` dentro de un template literal, o sea una barra invertida
                        // LITERAL obligatoria seguida de ceros-o-más 's'. Las notas son
                        // "VIN: KNAxxx — Auto desde COP15", sin barra, así que NUNCA empataba y
                        // la columna VIN salía siempre '—'. Es justo la columna que se necesita
                        // para reconstruir una semana. La versión buena ya existía en :2138.
                        const vinMatch = (t.note || '').match(/VIN:\s*([^\s—-]+)/);
                        const vin = vinMatch ? vinMatch[1] : '';
                        return `
                        <tr>
                            <td style="max-width:260px;">${tpConfigBadges({desc:t.configText},{fontSize:'var(--fs-xs)'})}</td>
                            <td style="font-family:monospace;font-size: var(--fs-sm);font-weight:700;color:var(--tp-amber);white-space:nowrap;letter-spacing:0.3px;">${vin || '—'}</td>
                            <td style="font-size: var(--fs-xs);white-space:nowrap;">${t.date}</td>
                            <td><span class="tp-badge" style="background:${tpTestedIsDeclared(t)?'rgba(245,158,11,0.15);color:var(--tp-amber)':t.source==='cop15-release'?'rgba(139,92,246,0.15);color:#8b5cf6':'rgba(6,182,212,0.15);color:#06b6d4'};border:1px solid currentColor;font-size: var(--fs-xs);" title="${tpTestedIsDeclared(t)?'Declarada a mano en el plan — sin vehículo liberado que la respalde':'Evidencia registrada'}">${tpTestedIsDeclared(t)?'✋ declarada':t.source}</span></td>
                            <td style="font-size: var(--fs-xs)">${t.purpose||'—'}</td>
                            <td><button onclick="tpState.testedList.splice(${origIdx},1);tpSave();tpRender();tpUpdateBadges();" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size:14px;">×</button></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
        `}
    </div>
    `;
}

function tpShowSuggestions() {
    const input = document.getElementById('tp-manual-config');
    const box = document.getElementById('tp-suggestions');
    const val = input.value.toLowerCase();
    if (val.length < 3) { box.style.display = 'none'; return; }

    const matches = tpState.planData.filter(c => c.desc.toLowerCase().includes(val)).slice(0, 6);
    if (matches.length === 0) { box.style.display = 'none'; return; }

    box.style.display = 'block';
    box.innerHTML = matches.map(m => `
        <div class="tp-suggestion" onclick="document.getElementById('tp-manual-config').value='${m.desc}';document.getElementById('tp-suggestions').style.display='none';">
            <span style="color:var(--tp-amber)">${m.desc}</span>
            <span style="color:var(--tp-dim);font-size: var(--fs-xs);margin-left:8px;">[${m.id}]</span>
        </div>
    `).join('');
}

function tpAddManual() {
    const configText = document.getElementById('tp-manual-config').value.trim();
    const date = document.getElementById('tp-manual-date').value;
    const note = document.getElementById('tp-manual-note').value.trim();
    const msg = document.getElementById('tp-manual-msg');

    if (!configText) { msg.innerHTML = '<span style="color:var(--tp-red)">❌ Escribe una configuración</span>'; return; }

    tpState.testedList.push({ configText, date, note, source:'manual', purpose:'Manual' });
    tpSave();
    document.getElementById('tp-manual-config').value = '';
    document.getElementById('tp-manual-note').value = '';
    msg.innerHTML = `<span style="color:var(--tp-green)">✅ ${configText.substring(0,40)}... registrado</span>`;
    tpRender();
    tpUpdateBadges();
}

function tpImportJSON() {
    const raw = document.getElementById('tp-json-input').value.trim();
    const msg = document.getElementById('tp-json-msg');
    try {
        const data = JSON.parse(raw);
        const records = Array.isArray(data) ? data : data.vehicles || [data];
        let added = 0;
        records.forEach(r => {
            const configText = r.configCode || r.codigo_config_text || r.configText || '';
            const purpose = r.purpose || '';
            if (configText && TP_PURPOSES_VALID.includes(purpose)) {
                const tsImp = r.archivedAt || r.registeredAt;
                tpState.testedList.push({ configText, date: tsImp ? localDateStr(new Date(tsImp)) : localToday(), note: `VIN: ${r.vin||'?'}`, source:'json-import', purpose });
                added++;
            }
        });
        tpSave();
        msg.innerHTML = `<span style="color:var(--tp-green)">✅ ${added} registros importados (solo propósitos válidos: Correlación, COP-Emisiones, EO-Emisiones, Investigación)</span>`;
        tpRender();
        tpUpdateBadges();
    } catch(e) {
        msg.innerHTML = `<span style="color:var(--tp-red)">❌ JSON inválido: ${e.message}</span>`;
    }
}


// ── Recover tested vehicles from COP15 history (archived vehicles) ──
function tpRecoverFromCOP15() {
    if (typeof db === 'undefined' || !db.vehicles || db.vehicles.length === 0) {
        showToast('No hay vehiculos en COP15', 'error');
        return;
    }

    // Get all archived (released) vehicles with valid purpose and configCode
    var archived = db.vehicles.filter(function(v) {
        return v.status === 'archived' && v.configCode && v.configCode !== 'MANUAL' &&
            TP_PURPOSES_VALID.includes(v.purpose);
    });

    if (archived.length === 0) {
        showToast('No hay vehiculos liberados con proposito valido en COP15', 'info');
        return;
    }

    // Build set of existing entries by VIN to detect duplicates
    var existingVINs = {};
    (tpState.testedList || []).forEach(function(t) {
        // Extract VIN from note field (format: "VIN: XXXXX" or "VIN: XXXXX — Auto desde COP15")
        var vinMatch = (t.note || '').match(/VIN:\s*([^\s—-]+)/);
        if (vinMatch) existingVINs[vinMatch[1]] = true;
    });

    // Also check by configText+date as secondary dedup
    var existingKeys = {};
    (tpState.testedList || []).forEach(function(t) {
        existingKeys[t.configText + '|' + (t.date || '')] = true;
    });

    var added = 0, skipped = 0;
    if (!tpState.testedList) tpState.testedList = [];

    archived.forEach(function(v) {
        // Skip if VIN already registered
        if (existingVINs[v.vin]) { skipped++; return; }

        var tsArch = v.archivedAt || v.registeredAt;
        var date = tsArch ? localDateStr(new Date(tsArch)) : localToday();
        var key = v.configCode + '|' + date;

        // Also skip if same configText+date already exists (unlikely but safe)
        if (existingKeys[key] && existingVINs[v.vin]) { skipped++; return; }

        tpState.testedList.push({
            configText: v.configCode,
            date: date,
            note: 'VIN: ' + v.vin + ' — Recuperado de COP15',
            source: 'cop15-recovery',
            purpose: v.purpose
        });
        existingVINs[v.vin] = true;
        existingKeys[key] = true;
        added++;
    });

    if (added > 0) {
        tpSave();
        tpRender();
        tpUpdateBadges();
    }

    var msg = added + ' vehiculos recuperados de COP15';
    if (skipped > 0) msg += ', ' + skipped + ' duplicados omitidos';
    showToast(msg, added > 0 ? 'success' : 'info');
}

// ═══ RULES TAB ═══
function tpRenderRules(el) {
    const regions = ['*','AUSTRALIA','BRAZIL','CANADA','EUROPE','GENERAL','MEXICO','MIDDLE EAST','RUSSIA','USA'];
    const regulations = ['*','120V','220V','BRAZIL L8','EURO-2','EURO-3','EURO-4','EURO-5','EURO-6C','PRE-EURO 7','SULEV 30'];
    const w = tpState.weights;
    const wTotal = w.volume + w.compliance + (w.region||0) + w.newConfig + w.urgency;
    const rp = tpState.regionPriority || {};

    // v16.2: cuántas configs resuelve cada regla (matching normalizado) — y cuáles no
    // encontraron una regla específica (cayeron en la comodín o en el default 1/1000).
    const _tpRuleUsage = {};
    const _tpNoSpecificRule = [];
    tpState.planData.forEach(function(c) {
        var rr = tpGetRule(c);
        _tpRuleUsage[rr.label] = (_tpRuleUsage[rr.label] || 0) + 1;
        if (c.reg && c.rgn && (rr._matchType === 'comodín' || rr._matchType === 'default')) _tpNoSpecificRule.push(c);
    });

    el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:14px;">
        <div class="tp-card">
            <div class="tp-card-title" data-help="tp-ratio-help">
                <span>⚙️ Reglas de Ratio</span>
                <div style="display:flex;gap:6px;">
                    <button class="tp-btn tp-btn-primary" onclick="tpAddRule()">+ Nueva</button>
                    <button class="tp-btn tp-btn-ghost" onclick="showConfirm('¿Restaurar reglas por defecto?',function(){tpState.rules=[{id:1,region:'USA',regulation:'SULEV 30',ratio:3,per:1000,label:'USA / SULEV 30'},{id:2,region:'USA',regulation:'*',ratio:3,per:1000,label:'USA / Otros'},{id:3,region:'CANADA',regulation:'*',ratio:3,per:1000,label:'Canada'},{id:4,region:'EUROPE',regulation:'EURO-6C',ratio:4,per:1000,label:'Europe / EURO-6C'},{id:5,region:'EUROPE',regulation:'*',ratio:3,per:1000,label:'Europe / Otros'},{id:6,region:'MEXICO',regulation:'*',ratio:2,per:1000,label:'Mexico'},{id:7,region:'GENERAL',regulation:'EURO-6C',ratio:3,per:1000,label:'General / EURO-6C'},{id:8,region:'GENERAL',regulation:'*',ratio:2,per:1000,label:'General / Otros'},{id:9,region:'MIDDLE EAST',regulation:'*',ratio:2,per:1000,label:'Middle East'},{id:10,region:'BRAZIL',regulation:'*',ratio:2,per:1000,label:'Brazil'},{id:11,region:'AUSTRALIA',regulation:'*',ratio:2,per:1000,label:'Australia'},{id:12,region:'*',regulation:'*',ratio:1,per:1000,label:'Default (catch-all)'}];tpSave();tpRender();},{title:'Restaurar reglas',type:'warning',confirmText:'Restaurar'})">↺ Reset</button>
                </div>
            </div>
            <p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Cuántas pruebas por cada N unidades. Reglas específicas (región+regulación) tienen prioridad sobre genéricas (*).</p>
            <div style="max-height:380px;overflow-y:auto;">
                <table class="tp-table">
                    <thead><tr><th>Región</th><th>Regulación</th><th>Ratio</th><th>Por</th><th>Label</th><th title="Configs vigentes cuyo REQ usa esta regla">Aplica a</th><th></th></tr></thead>
                    <tbody>
                        ${tpState.rules.map((r,i) => `
                            <tr>
                                <td><select class="tp-select" style="width:100%;font-size: var(--fs-xs);" onchange="tpState.rules[${i}].region=this.value;tpSave();">${regions.map(o=>`<option value="${o}" ${r.region===o?'selected':''}>${o==='*'?'TODAS':o}</option>`).join('')}</select></td>
                                <td><select class="tp-select" style="width:100%;font-size: var(--fs-xs);" onchange="tpState.rules[${i}].regulation=this.value;tpSave();">${regulations.map(o=>`<option value="${o}" ${r.regulation===o?'selected':''}>${o==='*'?'TODAS':o}</option>`).join('')}</select></td>
                                <td><input class="tp-input" type="number" min="1" value="${r.ratio}" style="width:45px;text-align:center;" onchange="tpState.rules[${i}].ratio=+this.value;tpSave();"></td>
                                <td><input class="tp-input" type="number" min="100" step="100" value="${r.per}" style="width:55px;text-align:center;" onchange="tpState.rules[${i}].per=+this.value;tpSave();"></td>
                                <td><input class="tp-input" value="${r.label}" style="font-size: var(--fs-xs);" onchange="tpState.rules[${i}].label=this.value;tpSave();"></td>
                                <td style="text-align:center;font-size: var(--fs-xs);font-family:monospace;color:var(--tp-dim);">${_tpRuleUsage[r.label] || 0}</td>
                                <td><button onclick="tpState.rules.splice(${i},1);tpSave();tpRender();" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size:14px;">×</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${_tpNoSpecificRule.length > 0 ? `
            <details style="margin-top:8px;">
                <summary style="cursor:pointer;font-size: var(--fs-sm);color:var(--tp-amber);font-weight:700;">⚠ ${_tpNoSpecificRule.length} config(s) sin regla específica (usan la regla comodín/default)</summary>
                <div style="max-height:160px;overflow-y:auto;margin-top:6px;font-size: var(--fs-xs);">
                    ${_tpNoSpecificRule.slice(0,50).map(c => `<div style="padding:3px 0;border-bottom:1px solid var(--tp-border);"><span style="color:var(--tp-dim);">${escapeHtml(c.rgn)} / ${escapeHtml(c.reg)}</span> — ${escapeHtml(c.desc)}</div>`).join('')}
                    ${_tpNoSpecificRule.length > 50 ? `<div style="padding:4px 0;color:var(--tp-dim);">… y ${_tpNoSpecificRule.length - 50} más</div>` : ''}
                </div>
            </details>` : ''}
        </div>
        <div>
            ${tpBuildPriorityKnobsHTML({ onInput: '_tpDebouncedRender()' })}
            <div class="tp-card" style="margin-top:14px;">
                <div class="tp-card-title" data-help="tp-purpose-region-help"><span>🎯 Propósito al iniciar prueba desde el plan</span></div>
                <p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:10px;">Propósito precargado en Alta según la región de la config (regla corporativa: COP solo para Europa; el resto son auditorías internas). El técnico siempre puede cambiarlo en Alta.</p>
                ${[['EUROPE','🇪🇺 Europa'],['*','🌐 Resto de regiones']].map(([key,label]) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
                        <span style="font-size: var(--fs-sm);font-weight:600;">${label}</span>
                        <select class="tp-select" style="font-size: var(--fs-xs);max-width:170px;" onchange="tpSetStartPurpose('${key}', this.value)">
                            ${TP_PURPOSES_VALID.map(p => `<option value="${p}" ${(tpState.startPurposeByRegion&&tpState.startPurposeByRegion[key])===p?'selected':''}>${p}</option>`).join('')}
                        </select>
                    </div>
                `).join('')}
            </div>
            <div class="tp-card" style="margin-top:14px;">
                <div class="tp-card-title">
                    <span>💾 Plantillas de Reglas (${(tpState.rulePresets||[]).length}/5)</span>
                    <button class="tp-btn tp-btn-primary" onclick="tpSaveRulePreset()" style="font-size: var(--fs-xs);">+ Guardar Actual</button>
                </div>
                <p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Guarda hasta 5 combinaciones de reglas+pesos para cargar rapidamente.</p>
                ${(tpState.rulePresets||[]).length === 0 ? '<div style="text-align:center;padding:15px;color:var(--tp-dim);font-size: var(--fs-sm);">No hay plantillas guardadas.</div>' :
                (tpState.rulePresets||[]).map((p,i) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;margin-bottom:4px;border:1px solid var(--tp-border);border-radius:6px;background:var(--tp-card);">
                        <div>
                            <div style="font-size:12px;font-weight:700;color:var(--tp-text);">${p.name}</div>
                            <div style="font-size: var(--fs-xs);color:var(--tp-dim);">${p.rules.length} reglas · ${new Date(p.created).toLocaleDateString('es-MX')}</div>
                        </div>
                        <div style="display:flex;gap:5px;">
                            <button class="tp-btn tp-btn-primary" onclick="tpLoadRulePreset(${i})" style="font-size: var(--fs-xs);">Cargar</button>
                            <button class="tp-btn tp-btn-ghost" onclick="tpDeleteRulePreset(${i})" style="font-size: var(--fs-xs);color:var(--tp-red);">🗑</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
    `;
}

function tpAddRule() {
    const maxId = Math.max(0, ...tpState.rules.map(r => r.id)) + 1;
    tpState.rules.push({id:maxId, region:'*', regulation:'*', ratio:1, per:1000, label:'Nueva regla'});
    tpSave();
    tpRender();
}

function tpSaveRulePreset() {
    if (!tpState.rulePresets) tpState.rulePresets = [];
    if (tpState.rulePresets.length >= 5) { showToast('Maximo 5 plantillas. Elimina una primero.', 'warning'); return; }
    var name = prompt('Nombre de la plantilla:');
    if (!name) return;
    tpState.rulePresets.push({
        id: Date.now(),
        name: name,
        rules: JSON.parse(JSON.stringify(tpState.rules)),
        weights: JSON.parse(JSON.stringify(tpState.weights)),
        regionPriority: JSON.parse(JSON.stringify(tpState.regionPriority || {})),
        created: new Date().toISOString()
    });
    tpSave(); tpRender();
    auditLog('tp', 'rule_saved', {type:'rule', label:name}, 'Plantilla de reglas guardada');
    showToast('Plantilla "' + name + '" guardada', 'success');
}

function tpLoadRulePreset(idx) {
    if (!tpState.rulePresets || !tpState.rulePresets[idx]) return;
    showConfirmDialog({ title: '⚠️ Cargar plantilla', message: '¿Cargar plantilla "' + tpState.rulePresets[idx].name + '"? Esto reemplazara las reglas actuales.', type: 'warning', confirmText: 'Cargar', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;
        var preset = tpState.rulePresets[idx];
        tpState.rules = JSON.parse(JSON.stringify(preset.rules));
        tpState.weights = JSON.parse(JSON.stringify(preset.weights));
        if (preset.regionPriority) tpState.regionPriority = JSON.parse(JSON.stringify(preset.regionPriority));
        tpSave(); tpRender(); tpInvalidateCache();
        showToast('Plantilla "' + preset.name + '" cargada', 'success');
    });
}

function tpDeleteRulePreset(idx) {
    if (!tpState.rulePresets || !tpState.rulePresets[idx]) return;
    showConfirmDialog({ title: '⚠️ Eliminar plantilla', message: '¿Eliminar plantilla "' + tpState.rulePresets[idx].name + '"?', type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;
        tpState.rulePresets.splice(idx, 1);
        tpSave(); tpRender();
        showToast('Plantilla eliminada', 'success');
    });
}


// ═══════════════════════════════════════════════════════════════════════════════
// [v20] MODELO DE DÍAS — derivado del soak REAL, no de un supuesto
//
// Hasta v18.6 esto eran pares de días CONSECUTIVOS a fuego, con el comentario
// "min 12h soak". Pero el soak por defecto de la app es de 24 h y ofrece 36
// (index.html, #soak_timer_hours), y el flujo real del laboratorio son 8 etapas
// (CASCADE_STAGES), no 2. Por eso los días que daba el plan no coincidían con la
// realidad y cada semana generaba arrastre estructural.
//
// Ahora el hueco se DERIVA de las horas de reposo de cada configuración. Con
// 24 h el par sigue siendo de días consecutivos (o sea: con los defaults la
// salida es idéntica a la de antes); con 36 h la prueba se va dos días después y
// la capacidad de la semana baja de forma honesta en vez de prometer pruebas que
// no caben.
// ═══════════════════════════════════════════════════════════════════════════════

var TP_DAY_ORDER  = ['dom','lun','mar','mie','jue','vie','sab'];
var TP_DAY_LABELS = {dom:'Domingo',lun:'Lunes',mar:'Martes',mie:'Miercoles',jue:'Jueves',vie:'Viernes',sab:'Sabado'};
// Dos letras: 'M' sola no distingue martes de miércoles en la tira de la tarjeta.
var TP_DAY_SHORT  = {dom:'Do',lun:'Lu',mar:'Ma',mie:'Mi',jue:'Ju',vie:'Vi',sab:'Sa'};
var TP_SOAK_DEFAULT_H = 24;   // el mismo default que el <select> de soak de la app

/** Estado del soak. Se siembra en 24 h para TODO: no se inventan datos físicos del laboratorio. */
function tpSoakCfg() {
    if (!tpState.soak || typeof tpState.soak !== 'object') tpState.soak = {};
    var s = tpState.soak;
    if (typeof s.defaultHours !== 'number' || !(s.defaultHours > 0)) s.defaultHours = TP_SOAK_DEFAULT_H;
    if (!s.byRegulation || typeof s.byRegulation !== 'object') s.byRegulation = {};
    if (!s.byFamily || typeof s.byFamily !== 'object') s.byFamily = {};
    return s;
}

/**
 * LA definición de cuánto reposa una configuración, y de dónde salió ese número.
 * Orden: override por familia → default por norma → default del laboratorio.
 * Devuelve {hours, source, label} — la procedencia se muestra en pantalla, igual
 * que `ruleInfo._matchType` en tpGetRule: el usuario tiene que poder ver si el
 * número es suyo o es el default.
 */
function tpSoakHoursFor(cfg) {
    var s = tpSoakCfg();
    if (cfg) {
        var fk = (typeof tpFamilyKeyForCfg === 'function') ? tpFamilyKeyForCfg(cfg) : null;
        if (fk && typeof s.byFamily[fk] === 'number' && s.byFamily[fk] > 0) {
            return { hours: s.byFamily[fk], source: 'familia', label: 'definido para esta familia' };
        }
        var reg = cfg.reg || cfg['EMISSION REGULATION'];
        if (reg && typeof s.byRegulation[reg] === 'number' && s.byRegulation[reg] > 0) {
            return { hours: s.byRegulation[reg], source: 'regulacion', label: 'definido para ' + reg };
        }
    }
    return { hours: s.defaultHours, source: 'laboratorio', label: 'default del laboratorio' };
}

/** Días de calendario que hay entre preacondicionar y probar, dadas N horas de reposo. */
function tpSoakGapDays(hours) {
    var h = parseFloat(hours);
    if (!isFinite(h) || h <= 0) h = TP_SOAK_DEFAULT_H;
    return Math.max(1, Math.ceil(h / 24));
}

/**
 * Pares (preacon → prueba) posibles en la semana para un soak dado.
 *
 * Reemplaza al motor viejo, que exigía días CONSECUTIVOS (dayOrder[i+1]) y por eso
 * perdía cualquier par no contiguo. Aquí solo se exige que el día de preacon y el
 * de prueba sean laborables: los días intermedios el vehículo reposa solo, no hace
 * falta que haya nadie.
 *
 * NO hay opción de "prohibir que repose el fin de semana", a propósito: la semana
 * se modela como un arreglo dom→sáb, así que un día intermedio de fin de semana
 * exigiría preacondicionar antes del sábado y probar después del domingo — los dos
 * extremos del arreglo. Es imposible por construcción, y esos casos ya salen como
 * `spillsNextWeek`. Una perilla que nunca puede hacer nada es peor que no tenerla.
 */
function tpSlotsForSoak(hours, workDays) {
    var wd = workDays || {};
    var gap = tpSoakGapDays(hours);
    var soakH = parseFloat(hours) || TP_SOAK_DEFAULT_H;
    var slots = [];
    for (var i = 0; i < TP_DAY_ORDER.length; i++) {
        var pre = TP_DAY_ORDER[i];
        if (!wd[pre]) continue;
        var j = i + gap;
        var spills = j > TP_DAY_ORDER.length - 1;
        var test = spills ? null : TP_DAY_ORDER[j];
        if (spills) {
            // El día de prueba cae en la semana siguiente. No cuenta para la capacidad,
            // pero se DECLARA: ese día sí sirve para preparar la semana que entra.
            slots.push({ precon: pre, test: null, preconLabel: TP_DAY_LABELS[pre], testLabel: null,
                         soakHours: soakH, gapDays: gap, spanDays: TP_DAY_ORDER.slice(i),
                         spillsNextWeek: true, key: pre + '>+' });
            continue;
        }
        if (!wd[test]) continue;
        slots.push({ precon: pre, test: test, preconLabel: TP_DAY_LABELS[pre], testLabel: TP_DAY_LABELS[test],
                     soakHours: soakH, gapDays: gap, spanDays: TP_DAY_ORDER.slice(i, j + 1),
                     spillsNextWeek: false, key: pre + '>' + test });
    }
    return slots;
}

/**
 * Compatibilidad: la firma vieja, ahora sobre el motor nuevo con el soak default.
 * Así tpAssignSlotForItem, tpBuildSchedulePreview y tpRecoveryWeeks siguen sin
 * tocarse, y el mes/Simulador/Recuperación heredan el modelo nuevo gratis.
 * Los pares que se derraman a la semana siguiente NO se devuelven aquí: los
 * llamadores viejos cuentan `.length` como capacidad.
 */
function tpBuildTestSlots(workDays) {
    return tpSlotsForSoak(tpSoakCfg().defaultHours, workDays || {})
        .filter(function(s) { return !s.spillsNextWeek; });
}

// v16.4 — LA definición única de "cuántas pruebas caben en una semana".
// La capacidad física son los pares preacon→prueba disponibles por los vehículos que caben
// en cada par; el campo de capacidad del formulario NO puede pasarse de aquí. Antes eran dos
// números sin relación (el campo arrancaba en 8, los pares eran 4), y planear el doble de lo
// que cabe generaba carryover garantizado cada semana aunque todo saliera perfecto.
// v20: se le AGREGAN campos (soakHours/soakSource/spill), nunca se le quitan — la leen
// tpSelectWeeklyItems, el planificador y Recuperación. Con el soak default de 24 h el
// resultado es idéntico al de v16.4.
function tpWeekCapacity(workDays) {
    var soak = tpSoakCfg();
    var todos = tpSlotsForSoak(soak.defaultHours, workDays || {});
    var usables = todos.filter(function(s) { return !s.spillsNextWeek; });
    var perSlot = Math.max(1, parseInt(tpState.vehiclesPerSlot, 10) || 1);
    return {
        slots: usables.length, perSlot: perSlot, max: usables.length * perSlot,
        soakHours: soak.defaultHours,
        gapDays: tpSoakGapDays(soak.defaultHours),
        spill: todos.filter(function(s) { return s.spillsNextWeek; }).map(function(s) { return s.precon; })
    };
}

function tpSetVehiclesPerSlot(val) {
    var n = Math.max(1, Math.min(10, parseInt(val, 10) || 1));
    var prev = tpState.vehiclesPerSlot;
    if (n === prev) return;
    tpState.vehiclesPerSlot = n;
    tpSave(); tpRender();
    if (typeof auditLog === 'function') auditLog('tp', 'capacity_changed', { type: 'plan', label: 'vehículos por par' }, prev + ' → ' + n);
}

function tpBuildSchedulePreview(workDays) {
    const slots = tpBuildTestSlots(workDays);
    if (slots.length === 0) return '<span style="color:var(--tp-red);">No hay pares preacon/prueba posibles con estos dias.</span>';
    const cap = tpWeekCapacity(workDays);
    let html = '<span style="font-weight:700;">Pares disponibles:</span> ';
    html += slots.map(s => `<span style="padding:1px 5px;background:rgba(59,130,246,0.1);border-radius:3px;margin:0 2px;">Preacon ${s.preconLabel} → Prueba ${s.testLabel}</span>`).join(' ');
    html += `<br><span style="font-weight:700;">Maximo pruebas posibles:</span> ${cap.slots} par(es) × ${cap.perSlot} veh/par = <b style="color:var(--tp-blue);">${cap.max}</b> prueba(s)`;
    return html;
}

// ══════════════════════════════════════════════════════════════════════
// BACKLOG — lo que se viene arrastrando, con antigüedad
// ══════════════════════════════════════════════════════════════════════
// No hay estado paralelo: tpState.weekHistory ya archiva cada semana aceptada con sus items y
// su status, así que la antigüedad se DERIVA de ahí. Antes el "carryover" se leía solo del
// último plan aceptado, lo cual lo hacía a la vez inflado (se inyectaba entero, sin importar
// la capacidad) y con fugas (tpSmartGenerate tiraba el excedente en silencio).
var _tpBacklogCache = { key: '', data: null };

function tpBacklogInvalidate() { _tpBacklogCache = { key: '', data: null }; }

// Semanas consecutivas que una config lleva pendiente, contando hacia atrás desde la semana
// aceptada más reciente y CORTANDO en la primera donde aparece completada.
function _tpBuildCarryAges() {
    var ages = {};
    var hist = (tpState.weekHistory || []).slice();
    // weekHistory se agrega en orden de aceptación; recorrer del más reciente al más viejo.
    for (var w = hist.length - 1; w >= 0; w--) {
        var items = hist[w].items || [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it || !it.desc) continue;
            if (ages[it.desc] && ages[it.desc]._closed) continue;
            if (it.completed) { ages[it.desc] = ages[it.desc] || { weeks: 0 }; ages[it.desc]._closed = true; continue; }
            if (!ages[it.desc]) ages[it.desc] = { weeks: 0, firstSeenWeek: null };
            ages[it.desc].weeks++;
            ages[it.desc].firstSeenWeek = hist[w].weekDate || hist[w].acceptedDate || null;
        }
    }
    return ages;
}

// Antigüedad en semanas de una config (0 si no viene arrastrada). O(1) tras el primer cálculo:
// tpPriorityScore se llama en bucles sobre todo planData.
function tpCarryoverAge(desc) {
    var ages = _tpBacklogAges();
    var a = ages[desc];
    return a && !a._closed ? a.weeks : 0;
}

var _tpAgesCache = { key: '', data: null };
function _tpBacklogAges() {
    var key = String(tpState._lastSave || 0) + ':' + ((tpState.weekHistory || []).length);
    if (_tpAgesCache.key === key && _tpAgesCache.data) return _tpAgesCache.data;
    _tpAgesCache = { key: key, data: _tpBuildCarryAges() };
    return _tpAgesCache.data;
}

// Empuje por antigüedad. Mismo patrón que el boost de tpFamilyOverrideFor: se suma FUERA del
// promedio ponderado, porque tpState.weights suma 100 y se divide entre 100 — meter un peso
// más ahí diluiría los otros cuatro en vez de agregar señal.
/**
 * ¿Esta config pasa el filtro de la semana? `plannerCfg.filters` tiene a propósito
 * la misma forma que una regla de prioridad, así que _tpRuleMatchField y
 * tpRuleFieldOptions sirven SIN modificarse (vacío y '*' son comodín).
 * Esto es todo el filtro por body type / regulación: cero matching nuevo.
 */
function tpPassesWeekFilter(cfg) {
    var p = tpPlannerCfg();
    if (!p.filtersOn || !cfg) return true;
    return _TP_RULE_ALLFIELDS.every(function(f) { return _tpRuleMatchField(cfg, p.filters, f); });
}

/**
 * Reparte la cola cruda de tpBacklog() en tres cubetas según la configuración
 * vigente. La caducidad es DERIVADA: no guarda estado, sobrevive al sync, se
 * autocorrige al cambiar el TTL y NO toca `deficit` — así `tpCoverageSummary()`
 * queda intacta (descartar/caducar no es haber probado).
 * -> { eligible:[], expired:[], filtered:[] }
 */
function tpBacklogEligible() {
    var p = tpPlannerCfg();
    var ttl = parseInt(p.carryoverTtlWeeks, 10) || 0;
    var out = { eligible: [], expired: [], filtered: [] };
    tpBacklog().forEach(function(b) {
        if (ttl > 0 && b.weeksCarried > ttl) { out.expired.push(b); return; }
        if (!tpPassesWeekFilter(b.cfg)) { out.filtered.push(b); return; }
        out.eligible.push(b);
    });
    return out;
}

function tpAgingBoost(desc) {
    var age = tpCarryoverAge(desc);
    if (!age) return 0;
    // Acotar la edad a la caducidad: si no, una config ya caducada que alguien fija
    // a mano conserva el empuje completo y le gana a todo lo demás.
    var ttl = parseInt(tpPlannerCfg().carryoverTtlWeeks, 10) || 0;
    if (ttl > 0) age = Math.min(age, ttl);
    var cfgB = tpState.agingBoost || { perWeek: 6, max: 30 };
    return Math.min(age * (cfgB.perWeek || 0), cfgB.max || 0);
}

/**
 * ¿El descarte de esta config sigue vigente? Un descarte se hace con un déficit
 * concreto a la vista; si después el déficit CRECE por encima de ese valor, la
 * situación cambió y la config vuelve a la cola sola.
 * Los registros viejos (sin `deficitAt`) conservan la semántica permanente de
 * antes — migración suave, sin reescribir datos.
 */
function _tpDismissActive(desc, cfg) {
    var d = (tpState.carryoverDismissed || {})[desc];
    if (!d) return false;
    if (typeof d.deficitAt !== 'number') return true;
    return !cfg || cfg.deficit <= d.deficitAt;
}

// El backlog vigente: configs arrastradas que TODAVÍA tienen déficit y no fueron descartadas.
// Si una config se probó por otra vía, deja de arrastrarse sola (sin déficit no hay backlog).
function tpBacklog() {
    var key = String(tpState._lastSave || 0) + ':' + ((tpState.weekHistory || []).length) + ':' + Object.keys(tpState.carryoverDismissed || {}).length;
    if (_tpBacklogCache.key === key && _tpBacklogCache.data) return _tpBacklogCache.data;

    var ages = _tpBacklogAges();
    var dismissed = tpState.carryoverDismissed || {};
    var analysis = tpGetAnalysis();
    var byDesc = {};
    analysis.forEach(function(a) { byDesc[a.desc] = a; });

    var out = [];
    Object.keys(ages).forEach(function(desc) {
        var a = ages[desc];
        if (!a || a._closed || !a.weeks) return;
        var cfg = byDesc[desc];
        if (!cfg || cfg.deficit <= 0) return;   // ya cubierta: no se arrastra
        // El descarte se evalúa DESPUÉS del déficit: para una config ya cubierta el
        // registro queda inerte en vez de convertirse en lápida, y un déficit NUEVO
        // la devuelve a la cola (ver _tpDismissActive).
        if (_tpDismissActive(desc, cfg)) return;
        out.push({
            desc: desc, cfg: cfg, weeksCarried: a.weeks, firstSeenWeek: a.firstSeenWeek,
            deficit: cfg.deficit, score: cfg.score
        });
    });
    out.sort(function(x, y) { return y.score - x.score; });
    _tpBacklogCache = { key: key, data: out };
    return out;
}

// Sacar de la cola SIN tocar la cobertura: el déficit sigue ahí y la config volverá a
// proponerse por prioridad cuando toque. Descartar no es haber probado.
function tpDismissCarryover(desc, opts) {
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'descartar del backlog')) return;
    var run = function() {
        if (!tpState.carryoverDismissed) tpState.carryoverDismissed = {};
        // deficitAt: el descarte caduca solo si el déficit crece por encima de este valor.
        var _cur = tpGetAnalysis().filter(function(a) { return a.desc === desc; })[0];
        tpState.carryoverDismissed[desc] = {
            at: new Date().toISOString(),
            by: (typeof authGetCurrentUserName === 'function' ? authGetCurrentUserName('') : ''),
            reason: (opts && opts.reason) || '',
            deficitAt: _cur ? _cur.deficit : 0
        };
        tpBacklogInvalidate();
        tpSave(); tpRender();
        if (typeof auditLog === 'function') auditLog('tp', 'carryover_dismissed', { type: 'plan', label: desc }, 'Sacada de la cola (déficit y cobertura no cambian). Vuelve si el déficit pasa de ' + (_cur ? _cur.deficit : 0));
        showToast('Sacada de la cola. Sigue contando como déficit.', 'info');
    };
    if (opts && opts.skipConfirm) { run(); return; }
    showConfirm(
        'Se deja de arrastrar semana a semana.\n\nOJO: esto NO cuenta como probada — el déficit y la cobertura no cambian. Podrás restaurarla desde "Descartadas".',
        run,
        { title: '✕ Sacar de la cola', type: 'warning', confirmText: 'Sacar de la cola' }
    );
}

function tpRestoreCarryover(desc) {
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'restaurar en el backlog')) return;
    if (tpState.carryoverDismissed) delete tpState.carryoverDismissed[desc];
    tpBacklogInvalidate();
    tpSave(); tpRender();
    if (typeof auditLog === 'function') auditLog('tp', 'carryover_restored', { type: 'plan', label: desc }, 'Devuelta a la cola de pendientes');
    showToast('Devuelta a la cola.', 'success');
}

function tpClearCarryover() {
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'limpiar el backlog')) return;
    var list = tpBacklog();
    if (!list.length) { showToast('La cola ya está vacía', 'info'); return; }
    showConfirm(
        'Se sacan de la cola ' + list.length + ' configuracion(es).\n\nOJO: NO cuentan como probadas — el déficit y la cobertura quedan igual. Quedan en "Descartadas" y se pueden restaurar.',
        function() {
            if (!tpState.carryoverDismissed) tpState.carryoverDismissed = {};
            var stamp = new Date().toISOString();
            var who = (typeof authGetCurrentUserName === 'function' ? authGetCurrentUserName('') : '');
            list.forEach(function(b) { tpState.carryoverDismissed[b.desc] = { at: stamp, by: who, reason: 'limpieza masiva', deficitAt: b.deficit }; });
            tpBacklogInvalidate();
            tpSave(); tpRender();
            if (typeof auditLog === 'function') auditLog('tp', 'carryover_cleared', { type: 'plan', label: list.length + ' configs' }, 'Limpieza de la cola de pendientes (el déficit y la cobertura no cambian)');
            showToast(list.length + ' sacadas de la cola. La cobertura no cambió.', 'success');
        },
        { title: '🧹 Limpiar la cola', type: 'warning', confirmText: 'Limpiar' }
    );
}

// Agrega al plan solo lo que CABE, en orden de puntaje (que ya incluye la antigüedad).
// Antes esto volcaba los pendientes completos a las obligatorias, y como las obligatorias no
// respetaban la capacidad, un clic producía semanas de 33 pruebas para 4 huecos reales.
function tpLoadCarryoverPicks() {
    // Solo lo elegible: respeta la caducidad y los filtros de la semana, igual que
    // el generador — si no, este botón reintroducía justo lo que el TTL descartó.
    var backlog = tpBacklogEligible().eligible;
    if (!backlog.length) { showToast('No hay pendientes vigentes que incluir', 'info'); return; }
    var workDays = window._tpWorkDays || { dom:false, lun:true, mar:true, mie:true, jue:true, vie:true, sab:false };
    var cap = tpWeekCapacity(workDays);
    window._tpWeeklyManualPicks = window._tpWeeklyManualPicks || [];
    var room = Math.max(0, cap.max - window._tpWeeklyManualPicks.length);
    if (room === 0) { showToast('Ya llenaste la capacidad de la semana (' + cap.max + ')', 'warning'); return; }
    var added = 0;
    for (var i = 0; i < backlog.length && added < room; i++) {
        if (window._tpWeeklyManualPicks.includes(backlog[i].desc)) continue;
        window._tpWeeklyManualPicks.push(backlog[i].desc);
        added++;
    }
    tpRender();
    var left = backlog.length - added;
    showToast(added + ' incluidas' + (left > 0 ? ' · ' + left + ' siguen en la cola (no caben esta semana)' : ''), 'info');
}

// Assign precon/test days to items, randomizing the order
function tpAssignSchedule(items, workDays, opts) {
    const slots = tpBuildTestSlots(workDays);
    if (slots.length === 0) return items; // No assignment possible
    // Shuffle items for randomization. La vista previa pasa {shuffle:false} para que
    // los días no bailen en cada tecla; los generadores reales siguen barajando.
    const shuffled = items.slice();
    if (!opts || opts.shuffle !== false) {
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
    }
    // v16.4: repartir respetando cuántos vehículos caben por par. Antes se ciclaba con
    // slots[i % slots.length], que con 33 items y 4 pares metía 8 vehículos en el mismo par
    // — un calendario que ya nacía imposible. Lo que no cabe se queda SIN día asignado y
    // visible como tal, en vez de fingir que está programado.
    const perSlot = Math.max(1, parseInt(tpState.vehiclesPerSlot, 10) || 1);
    shuffled.forEach((item, i) => {
        const slotIdx = Math.floor(i / perSlot);
        const slot = slots[slotIdx];
        if (!slot) {
            item.preconDay = null; item.testDay = null;
            item.preconLabel = null; item.testLabel = null;
            item.unscheduled = true;
            return;
        }
        item.preconDay = slot.precon;
        item.testDay = slot.test;
        item.preconLabel = slot.preconLabel;
        item.testLabel = slot.testLabel;
        item.unscheduled = false;
    });
    return shuffled;
}

// ═══════════════════════════════════════════════════════════════════════════
// [v18] PLANIFICADOR — perillas compartidas, filtros de la semana y vista previa
// Las perillas de RANKING (pesos, prioridad por región, empuje por antigüedad)
// se muestran tanto en Reglas como en el Plan Semanal: son las que solo reordenan
// candidatos, justo lo que la vista previa puede mostrar. Las reglas de ratio se
// quedan solo en Reglas porque cambian `required`/`deficit` y con eso el Dashboard,
// Recuperación y el presupuesto anual — previsualizarlas contra una semana engaña.
// ═══════════════════════════════════════════════════════════════════════════

/** Un slider con su lectura. `onInput` es el callback de re-render (difiere por pestaña). */
function _tpSliderHTML(o) {
    return '<div style="margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
        '<span style="font-size: var(--fs-sm);' + (o.labelColor ? 'color:' + o.labelColor + ';font-weight:600;' : '') + '">' + o.label + '</span>' +
        '<span style="font-size:12px;font-weight:700;font-family:monospace;color:var(--tp-amber)">' + o.value + (o.unit || '') + '</span>' +
        '</div>' +
        '<input type="range" min="' + o.min + '" max="' + o.max + '" step="' + (o.step || 1) + '" value="' + o.value + '"' +
        ' style="width:100%;accent-color:' + (o.accent || 'var(--tp-amber)') + ';"' +
        ' oninput="' + o.set + ';tpInvalidateCache();' + o.onInput + '" onchange="tpSave();">' +
        '</div>';
}

/**
 * Pesos + prioridad por región + empuje por antigüedad. Se monta en Reglas y en
 * el Plan Semanal; `opts.onInput` decide qué se re-renderiza en cada una.
 */
// ═══════════════════════════════════════════════════════════════════════════════
// [v20] ENFOQUE DE LA SEMANA — "las prioridades son probar lo de Europa, lo de USA"
//
// TRAMPA que esto resuelve: `tpState.weights.region` puede quedar legítimamente en
// **0** (la migración de arranque lo pone así para no romper sumas viejas), y con
// region=0 los 10 sliders de prioridad por región **no hacen absolutamente nada**.
// Un chip de enfoque que solo tocara `regionPriority` sería decorativo. `tpSetFocus`
// SUBE el peso de región y redistribuye el resto proporcionalmente.
// ═══════════════════════════════════════════════════════════════════════════════

var TP_FOCUS = {
    europa:    { label: '🇪🇺 Europa',        regions: ['EUROPE'],            weight: 45 },
    usa:       { label: '🇺🇸 USA',           regions: ['USA', 'CANADA'],     weight: 45 },
    prioridad: { label: '🇪🇺+🇺🇸 Prioridad', regions: ['EUROPE','USA','CANADA'], weight: 40 },
    todo:      { label: '🌎 Todo',           regions: null,                  weight: 20 }
};

/** Qué enfoque describe la configuración actual. DERIVADO, no una bandera guardada. */
function tpCurrentFocus() {
    var rp = tpState.regionPriority || {};
    var w = +(tpState.weights || {}).region || 0;
    if (w < 25) return 'todo';
    var alto = Object.keys(rp).filter(function(r) { return r !== '*' && rp[r] >= 95; }).sort().join(',');
    var claves = Object.keys(TP_FOCUS);
    for (var i = 0; i < claves.length; i++) {
        var f = TP_FOCUS[claves[i]];
        if (f.regions && f.regions.slice().sort().join(',') === alto) return claves[i];
    }
    return 'medida';
}

/**
 * Aplica un enfoque. Sube `weights.region` al valor del enfoque y reparte lo que
 * sobra entre los demás pesos EN PROPORCIÓN a como estaban, para que la suma siga
 * siendo 100 sin borrar lo que el usuario ya había ajustado.
 */
function tpSetFocus(key) {
    var f = TP_FOCUS[key];
    if (!f) return;
    var w = tpState.weights;
    var otros = ['volume', 'compliance', 'newConfig', 'urgency'];
    var sumaOtros = otros.reduce(function(s, k) { return s + (+w[k] || 0); }, 0);
    var restante = Math.max(0, 100 - f.weight);
    otros.forEach(function(k) {
        w[k] = sumaOtros > 0 ? Math.round((+w[k] || 0) / sumaOtros * restante) : Math.round(restante / otros.length);
    });
    // El redondeo puede dejar ±1: se ajusta sobre el peso más grande, no sobre región.
    var total = otros.reduce(function(s, k) { return s + w[k]; }, 0) + f.weight;
    if (total !== 100) {
        var mayor = otros.slice().sort(function(a, b) { return w[b] - w[a]; })[0];
        w[mayor] = Math.max(0, w[mayor] + (100 - total));
    }
    w.region = f.weight;

    if (!tpState.regionPriority) tpState.regionPriority = {};
    var rp = tpState.regionPriority;
    var regiones = Array.from(new Set((tpState.planData || []).map(function(c) { return c.rgn; }).filter(Boolean)));
    regiones.forEach(function(r) {
        rp[r] = (!f.regions || f.regions.indexOf(r) !== -1) ? 100 : (f.regions ? 30 : 50);
    });
    if (f.regions) f.regions.forEach(function(r) { rp[r] = 100; });
    rp['*'] = f.regions ? 30 : 50;

    tpInvalidateCache();
    tpSave();
    if (typeof auditLog === 'function') {
        auditLog('tp', 'focus_changed', { type: 'plan', label: f.label },
                 'peso de región ' + f.weight + '% · ' + (f.regions ? f.regions.join(' + ') : 'todas por igual'));
    }
    tpRender();
    showToast('Enfoque: ' + f.label + ' — peso de región ' + f.weight + '%. La propuesta se reordenó.', 'success');
}

/** La fila de chips. Siempre visible: es la perilla que el laboratorio usa a diario. */
function tpBuildFocusChipsHTML() {
    var actual = tpCurrentFocus();
    var an = (typeof tpGetAnalysis === 'function') ? tpGetAnalysis() : [];
    var f = TP_FOCUS[actual];
    var enFoco = f && f.regions
        ? an.filter(function(a) { return f.regions.indexOf(a.rgn) !== -1 && a.required > 0; })
        : an.filter(function(a) { return a.required > 0; });
    var conDeficit = enFoco.filter(function(a) { return a.deficit > 0; }).length;

    var h = '<div class="tp-focus" data-help="tp-focus-help">';
    h += '<span class="tp-focus-label">Enfoque de la semana</span><div class="tp-focus-chips">';
    Object.keys(TP_FOCUS).forEach(function(k) {
        h += '<button class="tp-focus-chip' + (actual === k ? ' tp-focus-chip--on' : '') + '" ' +
             'onclick="tpSetFocus(\'' + k + '\')" aria-pressed="' + (actual === k) + '">' + TP_FOCUS[k].label + '</button>';
    });
    // "A medida" no aplica nada: abre las perillas de siempre. tpBuildPriorityKnobsHTML
    // YA acepta opts.openRegions desde v18 y hasta ahora nadie se lo pasaba.
    h += '<button class="tp-focus-chip' + (actual === 'medida' ? ' tp-focus-chip--on' : '') + '" ' +
         'onclick="window._tpOpenRegions=true;tpRender();">⚙️ A medida</button>';
    h += '</div>';
    h += '<div class="tp-focus-read">' + enFoco.length + ' configuración(es) en foco · <strong>' +
         conDeficit + '</strong> con déficit' +
         (+(tpState.weights || {}).region === 0
            ? ' · <span class="tp-focus-warn">⚠️ el peso de región está en 0: las prioridades por región no influyen</span>'
            : '') + '</div>';
    return h + '</div>';
}

function tpBuildPriorityKnobsHTML(opts) {
    opts = opts || {};
    var onInput = opts.onInput || '_tpDebouncedRender()';
    var w = tpState.weights || {};
    var rp = tpState.regionPriority || {};
    var ab = tpState.agingBoost || { perWeek: 6, max: 30 };
    var wTotal = ['volume','compliance','region','newConfig','urgency']
        .reduce(function(s, k) { return s + (+w[k] || 0); }, 0);
    var regions = Array.from(new Set((tpState.planData || []).map(function(c) { return c.rgn; }).filter(Boolean))).sort();

    var h = '';

    // ── Pesos: los tres que se ajustan de verdad, arriba; los otros dos plegados ──
    h += '<div class="tp-card">';
    h += '<div class="tp-card-title" data-help="tp-weights-help"><span>⚖️ Ponderación</span></div>';
    h += '<p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:10px;">Cuánto pesa cada factor al ordenar candidatos. Deben sumar 100.</p>';
    [['compliance','📊 Déficit (cumplimiento)'], ['volume','📦 Volumen de producción'], ['region','🌍 Importancia de región']]
        .forEach(function(p) {
            h += _tpSliderHTML({ label: p[1], value: (+w[p[0]] || 0), unit: '%', min: 0, max: 100, step: 5,
                set: "tpState.weights." + p[0] + "=+this.value", onInput: onInput });
        });
    h += '<details style="margin-top:4px;"><summary style="cursor:pointer;font-size: var(--fs-sm);color:var(--tp-dim);">Más factores</summary><div style="padding-top:8px;">';
    [['newConfig','🆕 Config nueva'], ['urgency','⏰ Urgencia (producción próxima)']].forEach(function(p) {
        h += _tpSliderHTML({ label: p[1], value: (+w[p[0]] || 0), unit: '%', min: 0, max: 100, step: 5,
            set: "tpState.weights." + p[0] + "=+this.value", onInput: onInput });
    });
    h += '</div></details>';
    h += '<div style="margin-top:8px;padding:8px;background:var(--tp-dark);border:1px solid var(--tp-border);border-radius:6px;text-align:center;">' +
         '<span style="font-size: var(--fs-sm);color:' + (wTotal === 100 ? 'var(--tp-green)' : 'var(--tp-amber)') + ';font-weight:700;">' +
         'Total: ' + wTotal + '% ' + (wTotal === 100 ? '✓' : '(ajustar a 100%)') + '</span></div>';
    h += '</div>';

    // ── Peso por región (plegado: 10 sliders alargaban la columna de más) ──
    h += '<div class="tp-card" style="margin-top:14px;">';
    h += '<details' + (opts.openRegions ? ' open' : '') + '>';
    h += '<summary class="tp-card-title" data-help="tp-region-priority-help" style="cursor:pointer;list-style:revert;"><span>🌍 Peso por región</span></summary>';
    h += '<p style="font-size: var(--fs-xs);color:var(--tp-dim);margin:10px 0;">Importancia relativa de cada mercado (0-100). Pesa según el factor "Importancia de región" de arriba.</p>';
    regions.filter(function(r) { return r !== '*'; }).concat(['*']).forEach(function(r) {
        h += _tpSliderHTML({
            label: (r === '*' ? 'Otras (default)' : r), labelColor: tpRegionColor(r),
            value: (rp[r] !== undefined ? rp[r] : 50), min: 0, max: 100, step: 5, accent: tpRegionColor(r),
            set: "if(!tpState.regionPriority)tpState.regionPriority={};tpState.regionPriority['" + r + "']=+this.value",
            onInput: onInput
        });
    });
    h += '</details></div>';

    // ── Empuje por antigüedad (antes no tenía UI en ninguna parte) ──
    h += '<div class="tp-card" style="margin-top:14px;">';
    h += '<details>';
    h += '<summary class="tp-card-title" data-help="tp-aging-help" style="cursor:pointer;list-style:revert;"><span>⏳ Empuje por antigüedad</span></summary>';
    h += '<p style="font-size: var(--fs-xs);color:var(--tp-dim);margin:10px 0;">Cuánto sube de puntaje una config por cada semana que lleva postergada. Ponlo en 0 para que la antigüedad deje de influir.</p>';
    h += _tpSliderHTML({ label: 'Por semana', value: (+ab.perWeek || 0), unit: ' pts', min: 0, max: 15, step: 1,
        set: "if(!tpState.agingBoost)tpState.agingBoost={};tpState.agingBoost.perWeek=+this.value", onInput: onInput });
    h += _tpSliderHTML({ label: 'Tope acumulado', value: (+ab.max || 0), unit: ' pts', min: 0, max: 50, step: 5,
        set: "if(!tpState.agingBoost)tpState.agingBoost={};tpState.agingBoost.max=+this.value", onInput: onInput });
    h += '</details></div>';

    return h;
}

/** Cola de pendientes: encendido, caducidad y cuota máxima de la capacidad. */
function tpBuildCarryoverPanelHTML() {
    var p = tpPlannerCfg();
    var B = tpBacklogEligible();
    var h = '<div class="tp-card" style="margin-top:14px;">';
    h += '<div class="tp-card-title" data-help="tp-carryover-help"><span>🔄 Cola de pendientes</span></div>';
    h += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;font-size: var(--fs-sm);">' +
         '<input type="checkbox" ' + (p.carryoverOn ? 'checked' : '') +
         ' onchange="tpSetPlannerFlag(\'carryoverOn\', this.checked)">' +
         '<span>Incluir pendientes de semanas anteriores</span></label>';
    if (p.carryoverOn) {
        h += _tpSliderHTML({ label: '🕒 Caducan a las', value: (+p.carryoverTtlWeeks || 0), unit: (p.carryoverTtlWeeks ? ' sem' : ' (sin límite)'),
            min: 0, max: 12, step: 1, set: "tpPlannerCfg().carryoverTtlWeeks=+this.value", onInput: '_tpDebouncedPreview()' });
        h += _tpSliderHTML({ label: '📐 Máximo de la semana', value: (+p.carryoverMaxPct || 0), unit: '%',
            min: 0, max: 100, step: 10, set: "tpPlannerCfg().carryoverMaxPct=+this.value", onInput: '_tpDebouncedPreview()' });
        h += '<p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:4px;">' +
             'El resto de los lugares queda reservado para las prioridades de hoy. Antes la cola se llevaba la semana entera.</p>';
    }
    h += '<div style="margin-top:8px;font-size: var(--fs-xs);color:var(--tp-dim);">' +
         '✅ ' + B.eligible.length + ' vigentes · 🕒 ' + B.expired.length + ' caducadas · 🔎 ' + B.filtered.length + ' fuera del filtro</div>';
    if (B.eligible.length || B.expired.length) {
        h += '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' +
             '<button class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);" onclick="tpLoadCarryoverPicks()">➕ Incluir las que quepan</button>' +
             '<button class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);color:var(--tp-red);" onclick="tpClearCarryover()">🧹 Vaciar la cola</button>' +
             '</div>';
    }
    h += '</div>';
    return h;
}

/**
 * Filtros de la semana. `plannerCfg.filters` tiene la forma de una regla de
 * prioridad a propósito, así que se reusa tpRuleFieldOptions tal cual — incluida
 * la opción "(actual)" cuando el valor vigente queda fuera del conjunto reducido.
 */
function tpBuildWeekFilterHTML() {
    var p = tpPlannerCfg();
    var cols = [['familyMatch','Familia'], ['region','Región'], ['regulation','Regulación'],
                ['modelMatch','Modelo'], ['engMatch','Cilindrada'], ['bodyMatch','Body'], ['drvMatch','Manejo']];
    var active = cols.filter(function(c) { return p.filters[c[0]]; }).length;

    var h = '<div class="tp-card" style="margin-top:14px;">';
    h += '<div class="tp-card-title" data-help="tp-weekfilter-help"><span>🔎 Filtros de la semana</span>' +
         (active ? '<span class="tp-badge" style="background:rgba(245,158,11,0.15);color:var(--tp-amber);font-size: var(--fs-xs);">' + active + ' activo(s)</span>' : '') +
         '</div>';
    h += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;font-size: var(--fs-sm);">' +
         '<input type="checkbox" ' + (p.filtersOn ? 'checked' : '') +
         ' onchange="tpSetPlannerFlag(\'filtersOn\', this.checked)">' +
         '<span>Probar solo lo que cumpla estos filtros</span></label>';
    if (p.filtersOn) {
        // Grid propio: .inv-row-list-2col depende del ancho de VENTANA, y aquí lo que
        // manda es el ancho de la columna izquierda del planificador.
        h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:4px 10px;">';
        cols.forEach(function(c) {
            var field = c[0], cur = p.filters[field] || '';
            var opts = [];
            try { opts = tpRuleFieldOptions(p.filters, field) || []; } catch (e) { opts = []; }
            var has = opts.some(function(o) { return o.value === cur; });
            h += '<div class="form-group" style="margin-bottom:6px;">' +
                 '<label style="font-size: var(--fs-xs);">' + c[1] + '</label>' +
                 '<select class="tp-select" style="font-size: var(--fs-xs);" onchange="tpSetWeekFilter(\'' + field + '\', this.value)">' +
                 '<option value="">Todas</option>' +
                 opts.map(function(o) {
                     return '<option value="' + escapeHtml(o.value) + '"' + (o.value === cur ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
                 }).join('') +
                 (cur && !has ? '<option value="' + escapeHtml(cur) + '" selected>' + escapeHtml(cur) + ' (actual)</option>' : '') +
                 '</select></div>';
        });
        h += '</div>';
        if (active) {
            h += '<button class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);margin-top:6px;" onclick="tpClearWeekFilters()">Limpiar filtros</button>';
        }
    }
    h += '</div>';
    return h;
}

// ── Setters del planificador ────────────────────────────────────────────────
// Patrón del módulo: mutar + invalidar caché + repintar SOLO la vista previa.
// tpSave() persiste (y ensucia las otras pestañas, que es lo correcto).

function tpSetPlannerFlag(key, value) {
    tpPlannerCfg()[key] = value;
    tpInvalidateCache();
    tpSave();
    tpRender();   // cambia la forma del panel (muestra/oculta controles)
}

function tpSetWeekFilter(field, value) {
    tpPlannerCfg().filters[field] = value || '';
    tpInvalidateCache();
    tpSave();
    tpRender();   // el cascade de los demás selects se estrecha
}

function tpClearWeekFilters() {
    var f = tpPlannerCfg().filters;
    Object.keys(f).forEach(function(k) { f[k] = ''; });
    tpInvalidateCache();
    tpSave();
    tpRender();
    showToast('Filtros limpiados', 'info');
}

function tpPinPreviewItem(desc) {
    window._tpWeeklyManualPicks = window._tpWeeklyManualPicks || [];
    if (window._tpWeeklyManualPicks.indexOf(desc) === -1) window._tpWeeklyManualPicks.push(desc);
    window._tpWeekExclude = (window._tpWeekExclude || []).filter(function(d) { return d !== desc; });
    tpRenderPlannerPreview();
}

function tpUnpinPreviewItem(desc) {
    window._tpWeeklyManualPicks = (window._tpWeeklyManualPicks || []).filter(function(d) { return d !== desc; });
    tpRenderPlannerPreview();
}

function tpExcludePreviewItem(desc) {
    window._tpWeekExclude = window._tpWeekExclude || [];
    if (window._tpWeekExclude.indexOf(desc) === -1) window._tpWeekExclude.push(desc);
    window._tpWeeklyManualPicks = (window._tpWeeklyManualPicks || []).filter(function(d) { return d !== desc; });
    tpRenderPlannerPreview();
}

function tpUnexcludePreviewItem(desc) {
    window._tpWeekExclude = (window._tpWeekExclude || []).filter(function(d) { return d !== desc; });
    tpRenderPlannerPreview();
}

/** Opciones que alimentan tanto la vista previa como el botón Generar. */
function tpPlannerOpts(extra) {
    var workDays = window._tpWorkDays || { dom:false, lun:true, mar:true, mie:true, jue:true, vie:true, sab:false };
    var capEl = document.getElementById('tp-weekly-cap');
    var o = {
        workDays: workDays,
        capacity: capEl ? parseInt(capEl.value, 10) : (window._tpWeekCap || undefined),
        manualPicks: (window._tpWeeklyManualPicks || []).slice(),
        exclude: (window._tpWeekExclude || []).slice()
    };
    return Object.assign(o, extra || {});
}

/**
 * Repinta SOLO #tp-planner-preview. No persiste nada: tpSelectWeeklyItems es pura
 * respecto a tpState (copia testedList y no muta nada global).
 */
function tpRenderPlannerPreview() {
    var host = document.getElementById('tp-planner-preview');
    if (!host) return;   // el debounce puede caer después de cambiar de pestaña

    var R;
    try { R = tpSelectWeeklyItems(tpPlannerOpts({ dryRun: true })); }
    catch (e) {
        console.error('tpRenderPlannerPreview:', e);
        host.innerHTML = '<div style="padding:12px;color:var(--tp-red);font-size: var(--fs-sm);">No se pudo calcular la propuesta: ' + escapeHtml(e.message) + '</div>';
        return;
    }
    // shuffle:false para que los días no bailen en cada tecla
    var rows = tpAssignSchedule(R.items.slice(), tpPlannerOpts().workDays, { shuffle: false });
    var pins = window._tpWeeklyManualPicks || [];
    var excl = window._tpWeekExclude || [];

    var h = '';
    h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">';
    h += '<span style="font-size:18px;font-weight:800;color:var(--tp-text);">' + rows.length + ' / ' + R.capacity + '</span>';
    h += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">' +
         R.freshTaken + ' frescas · ' + R.carryTaken + ' de cola' +
         (R.carryCap ? ' (máx ' + R.carryCap + ')' : '') + '</span>';
    h += '</div>';

    if (!rows.length) {
        h += '<div class="empty-state" style="padding:18px;text-align:center;font-size: var(--fs-sm);color:var(--tp-dim);">' +
             'Nada que proponer con estos ajustes. Afloja los filtros o revisa el déficit.</div>';
    } else {
        rows.forEach(function(it, i) {
            var origen = it.manual ? ['📌 Obligatoria', 'var(--tp-blue)']
                       : it.carriedOver ? ['🔄 Cola ' + (tpCarryoverAge(it.desc) || 1) + ' sem', 'var(--tp-amber)']
                       : ['🆕 Déficit', 'var(--tp-green)'];
            h += '<div style="display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid var(--tp-border);flex-wrap:wrap;">';
            h += '<span style="font-family:monospace;font-size: var(--fs-xs);color:var(--tp-dim);min-width:18px;">' + (i + 1) + '</span>';
            h += '<div style="flex:1;min-width:180px;">';
            h += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:2px;">' +
                 (it.unscheduled ? '<span style="color:var(--tp-red);">sin día</span>' : 'Preacon ' + (it.preconLabel || '?') + ' → Prueba ' + (it.testLabel || '?')) +
                 ' · <span style="color:' + origen[1] + ';font-weight:700;">' + origen[0] + '</span></div>';
            h += (typeof tpConfigBadges === 'function' ? tpConfigBadges(it) : escapeHtml(it.desc));
            h += '</div>';
            h += (typeof tpScoreBadge === 'function' ? tpScoreBadge(it) : '');
            h += '<button class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);" title="' +
                 (it.manual ? 'Quitar de obligatorias' : 'Fijar: que entre siempre') + '" onclick="' +
                 (it.manual ? "tpUnpinPreviewItem('" + _tpQ(it.desc) + "')" : "tpPinPreviewItem('" + _tpQ(it.desc) + "')") + '">' +
                 (it.manual ? '📌✓' : '📌') + '</button>';
            h += '<button class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);color:var(--tp-red);" title="No esta semana" onclick="tpExcludePreviewItem(\'' + _tpQ(it.desc) + '\')">🚫</button>';
            h += '</div>';
        });
    }

    // Avisos
    if (R.outOfFilter && R.outOfFilter.length) {
        h += '<div style="margin-top:8px;font-size: var(--fs-xs);color:var(--tp-amber);">⚠ ' + R.outOfFilter.length +
             ' obligatoria(s) fuera del filtro — entran igual porque las fijaste a mano.</div>';
    }
    if (R.expiredCount || R.filteredCount) {
        h += '<div style="margin-top:6px;font-size: var(--fs-xs);color:var(--tp-dim);">🕒 ' + R.expiredCount +
             ' caducadas · 🔎 ' + R.filteredCount + ' fuera del filtro (no compiten esta semana).</div>';
    }

    // Siguientes candidatos — la vía fácil para añadir
    var usados = {};
    rows.forEach(function(it) { usados[it.desc] = true; });
    var cands = tpGetAnalysis().filter(function(c) {
        return c.deficit > 0 && !usados[c.desc] && excl.indexOf(c.desc) === -1 && tpPassesWeekFilter(c);
    }).slice(0, 6);
    if (cands.length) {
        h += '<details style="margin-top:10px;"><summary style="cursor:pointer;font-size: var(--fs-sm);color:var(--tp-dim);">➕ Siguientes candidatos (' + cands.length + ')</summary><div style="padding-top:6px;">';
        cands.forEach(function(c) {
            h += '<div style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid var(--tp-border);">' +
                 '<div style="flex:1;min-width:150px;font-size: var(--fs-xs);">' + escapeHtml(c.desc) + '</div>' +
                 '<span style="font-family:monospace;font-size: var(--fs-xs);color:var(--tp-dim);">S:' + Math.round(c.score) + '</span>' +
                 '<button class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);" title="Fijar en la semana" onclick="tpPinPreviewItem(\'' + _tpQ(c.desc) + '\')">➕</button>' +
                 '</div>';
        });
        h += '</div></details>';
    }

    // Excluidas
    if (excl.length) {
        h += '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size: var(--fs-sm);color:var(--tp-dim);">🚫 Excluidas esta semana (' + excl.length + ')</summary><div style="padding-top:6px;">';
        excl.forEach(function(d) {
            h += '<div style="display:flex;align-items:center;gap:8px;padding:4px;font-size: var(--fs-xs);">' +
                 '<span style="flex:1;">' + escapeHtml(d) + '</span>' +
                 '<button class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);" onclick="tpUnexcludePreviewItem(\'' + _tpQ(d) + '\')">↩ Devolver</button></div>';
        });
        h += '</div></details>';
    }

    host.innerHTML = h;
    if (typeof cascadeInjectTooltipsDeferred === 'function') cascadeInjectTooltipsDeferred();
}

/** Escapa una cadena para meterla en un atributo onclick con comillas simples. */
function _tpQ(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

var _tpDebouncedPreview = debounce(tpRenderPlannerPreview, 200);

// ═══════════════════════════════════════════════════════════════════════════════
// [v20] MI SEMANA — LA definición del estado de la semana (patrón CoP v19)
//
// Lo que hizo funcionar al CoP no fue el CSS: fue que `copPortfolioRows()` pasó a
// ser LA definición del estado y `copFamilyRisk()` LA definición pura del semáforo,
// y todo lo demás se volvió consumidor. El planificador no tenía eso: cada pantalla
// (HOY, Panel, Consumibles, la ETA de COP15) rebuscaba en `tpState.weeklyPlans` con
// su propio criterio, y por eso HOY podía dictar el día con un plan de hace tres
// semanas.
//
//   tpWeekBoardRows(opts)     LA definición del estado de la semana. Memoizada.
//   tpWeekItemRisk(row, ctx)  LA definición del semáforo de UNA prueba. PURA.
//
// El semáforo hereda las reglas de honestidad del CoP: es un aviso interno, no un
// juicio, y sin información no se pinta verde.
// ═══════════════════════════════════════════════════════════════════════════════

var TP_WORKDAYS_DEFAULT = { dom:false, lun:true, mar:true, mie:true, jue:true, vie:true, sab:false };

/** Días laborables aplicables a un plan: los suyos congelados → los de la UI → el default. */
function tpWorkDaysFor(plan) {
    if (plan && plan.workDays && typeof plan.workDays === 'object') return plan.workDays;
    if (window._tpWorkDays && typeof window._tpWorkDays === 'object') return window._tpWorkDays;
    return TP_WORKDAYS_DEFAULT;
}

/** El día EFECTIVO de prueba. `testDay` sigue siendo el plan vigente; esto solo lo lee. */
function tpItemDay(item) { return (item && item.testDay) || null; }

/**
 * "Movida" es DERIVADO, nunca una bandera que mantener sincronizada.
 * `plannedTestDay` es una SOMBRA: se estampa una vez al generar y jamás se reescribe.
 */
function tpItemMoved(item) {
    return !!(item && item.plannedTestDay && item.plannedTestDay !== item.testDay);
}

/**
 * La identidad de FAMILIA en una línea. Los mismos campos que tpFamilyKeyForCfg.
 * `tpConfigBadges` emite hasta 9 chips y el `desc` mide 58-84 caracteres: en una
 * tarjeta de columna eso es ilegible. Aquí se parte donde importa.
 */
function tpConfigShortName(cfg) {
    if (!cfg) return '';
    var c = cfg;
    if (!c.my && c.desc && tpState.planData && tpState.planData.length) {
        var f = tpState.planData.find(function(p) { return p.desc === c.desc; });
        if (f) c = Object.assign({}, f, cfg);
    }
    var partes = [];
    if (c.mod) partes.push(c.mod);
    var motor = [c.eng, (c.engpkg && c.engpkg !== '0') ? c.engpkg : ''].filter(Boolean).join(' ');
    if (motor) partes.push(motor);
    if (c.tx) partes.push(c.tx);
    // El catálogo trae `my` como '26' en unas filas y '26 MODEL' en otras: sufijar a
    // ciegas producía '26 MODELMY'.
    if (c.my) partes.push(/^\d+$/.test(String(c.my).trim()) ? c.my + 'MY' : c.my);
    return partes.join(' · ') || (c.desc || '').slice(0, 40);
}

/**
 * Lo que distingue a la VARIANTE — exactamente lo que una sustitución puede cambiar
 * (_tpFlexFields). El rin no es decoración: es el dato de la decisión al sustituir.
 */
function tpConfigVariantTag(cfg) {
    if (!cfg) return '';
    var c = cfg;
    if (!c.my && c.desc && tpState.planData && tpState.planData.length) {
        var f = tpState.planData.find(function(p) { return p.desc === c.desc; });
        if (f) c = Object.assign({}, f, cfg);
    }
    var out = [];
    var ep = (typeof tpEpLabel === 'function') ? tpEpLabel(c.ep) : '';
    if (ep) out.push(ep);
    if (c.body) out.push(c.body);
    if (c.drv && c.drv !== '2WD') out.push(c.drv);
    if (c.tire) out.push(c.tire);
    return out.join(' · ');
}

var TP_RISK_LABEL = {
    hecha:      { icon: '✅', text: 'Hecha' },
    ok:         { icon: '⬜', text: 'En tiempo' },
    atencion:   { icon: '⚠️', text: 'Atención' },
    riesgo:     { icon: '🔴', text: 'En riesgo' },
    'sin-datos':{ icon: '❔', text: 'Sin información' }
};

/**
 * LA definición del semáforo de UNA prueba. PURA: recibe la fila y el contexto, no
 * toca el DOM ni `tpState`, así que se puede probar en Node.
 *
 * `ctx = {todayIdx, weekIsPast, weekIsFuture, dayLoad:{dia:n}, perSlot}`.
 * `todayIdx` es el índice en TP_DAY_ORDER, o -1 si la semana no es la actual.
 *
 * Honestidad, igual que copFamilyRisk: sin día asignado NUNCA es verde, y el nivel
 * es un aviso interno anticipado — no dice que la prueba vaya a fallar.
 */
function tpWeekItemRisk(row, ctx) {
    ctx = ctx || {};
    var razones = [];
    if (!row) return { level: 'sin-datos', reasons: [{ code: 'sin-fila', text: 'Sin datos' }] };
    if (row.done) return { level: 'hecha', reasons: [] };

    var dia = row.testDay;
    if (!dia) {
        razones.push({ code: 'sin-dia', text: 'Sin día asignado: no cabe en los pares de esta semana' });
        return { level: 'atencion', reasons: razones };
    }

    var idx = TP_DAY_ORDER.indexOf(dia);
    var hoy = (typeof ctx.todayIdx === 'number') ? ctx.todayIdx : -1;

    // El preacondicionamiento tiene que existir y ser laborable: si no, el soak no cuadra
    // y la prueba no se puede correr aunque el día de prueba esté libre.
    if (!row.preconDay) {
        razones.push({ code: 'sin-precon', text: 'Sin día de preacondicionamiento' });
    } else if (ctx.workDays && ctx.workDays[row.preconDay] === false) {
        razones.push({ code: 'precon-no-laborable', text: 'El preacondicionamiento cae en un día no laborable' });
    } else if (row.gapDays) {
        var pi = TP_DAY_ORDER.indexOf(row.preconDay);
        if (pi >= 0 && idx - pi !== row.gapDays) {
            razones.push({ code: 'soak-no-cuadra',
                           text: row.soakHours + ' h de reposo piden ' + row.gapDays + ' día(s) entre preacon y prueba; el plan tiene ' + (idx - pi) });
        }
    }

    if (ctx.dayLoad && ctx.perSlot && (ctx.dayLoad[dia] || 0) > ctx.perSlot) {
        razones.push({ code: 'sobrecupo', text: 'Ese día tiene ' + ctx.dayLoad[dia] + ' pruebas y el laboratorio corre ' + ctx.perSlot });
    }

    if (ctx.weekIsPast || (hoy >= 0 && idx < hoy)) {
        razones.push({ code: 'vencida', text: 'Su día ya pasó y sigue pendiente' });
        return { level: 'riesgo', reasons: razones };
    }

    if (hoy >= 0 && !row.vehicle) {
        var pi2 = row.preconDay ? TP_DAY_ORDER.indexOf(row.preconDay) : idx;
        if (pi2 >= 0 && pi2 <= hoy) {
            razones.push({ code: 'sin-vehiculo', text: 'Su preacondicionamiento era hoy o antes y no hay vehículo dado de alta' });
            return { level: 'riesgo', reasons: razones };
        }
        if (pi2 === hoy + 1) razones.push({ code: 'precon-manana', text: 'Se preacondiciona mañana y aún no hay vehículo' });
    }

    if (razones.some(function(r) { return r.code === 'soak-no-cuadra' || r.code === 'precon-no-laborable' || r.code === 'sobrecupo'; })) {
        return { level: 'atencion', reasons: razones };
    }
    return { level: razones.length ? 'atencion' : 'ok', reasons: razones };
}

var _tpBoardCache = { key: '', data: null };
function tpBoardInvalidate() { _tpBoardCache = { key: '', data: null }; }

/**
 * LA definición del estado de la semana. Une plan + soak resuelto + vehículos de
 * COP15 + testedList + riesgo. Todo consumidor nuevo la llama en vez de rebuscar
 * en `weeklyPlans` por su cuenta.
 *
 * opts.weekDate  — lunes a mostrar. Por default, la semana EN CURSO.
 * opts.planId    — un plan concreto (gana sobre weekDate).
 *
 * Memoizada obligatoriamente (patrón `_copRev` del CoP): la lee HOY en cada render.
 */
function tpWeekBoardRows(opts) {
    opts = opts || {};
    var hoyD = new Date();
    var monHoy = (typeof _tpMonday === 'function' && typeof _tpFmtDate === 'function')
                 ? _tpFmtDate(_tpMonday(hoyD)) : null;
    var quiero = opts.weekDate || monHoy;
    var clave = (opts.planId || '') + '|' + (quiero || '') + '|' + (tpState._lastSave || 0) + '|' +
                ((typeof db === 'object' && db && db.vehicles) ? db.vehicles.length : 0) + '|' +
                (window._tpVehRev || 0);
    if (_tpBoardCache.key === clave && _tpBoardCache.data) return _tpBoardCache.data;

    tpEnsurePlanIds();
    var planes = tpState.weeklyPlans || [];
    var planIdx = -1;
    if (opts.planId) planIdx = tpFindPlanIndexById(opts.planId);
    if (planIdx < 0) {
        for (var i = planes.length - 1; i >= 0; i--) {
            if (planes[i] && planes[i].weekDate === quiero) { planIdx = i; break; }
        }
    }
    var plan = planIdx >= 0 ? planes[planIdx] : null;
    var workDays = tpWorkDaysFor(plan);
    var perSlot = Math.max(1, parseInt(tpState.vehiclesPerSlot, 10) || 1);
    var weekDate = plan ? plan.weekDate : quiero;

    // ¿Qué día de la semana es hoy DENTRO de esta semana? -1 si no es la semana actual.
    var todayIdx = (weekDate && monHoy && weekDate === monHoy) ? hoyD.getDay() : -1;
    var weekIsPast   = !!(weekDate && monHoy && weekDate < monHoy);
    var weekIsFuture = !!(weekDate && monHoy && weekDate > monHoy);

    // Carga por día, para detectar sobrecupo.
    var dayLoad = {};
    (plan && plan.items || []).forEach(function(it) {
        var d = tpItemDay(it); if (d) dayLoad[d] = (dayLoad[d] || 0) + 1;
    });

    var vehiculos = (typeof db === 'object' && db && Array.isArray(db.vehicles)) ? db.vehicles : [];
    var ctx = { todayIdx: todayIdx, weekIsPast: weekIsPast, weekIsFuture: weekIsFuture,
                dayLoad: dayLoad, perSlot: perSlot, workDays: workDays };

    // Un vehículo no puede acreditar dos filas (ver abajo). Los vínculos EXPLÍCITOS
    // (`item.linkedVehicleId`) se precargan ANTES de resolver ninguna fila, y de
    // TODAS las semanas, no solo esta — si no, una fila auto-resuelta podía "ganarle"
    // el vehículo a una vinculada a mano, o mostrar en esta semana un VIN cuyo
    // vínculo real vive en otra. El vínculo explícito SIEMPRE gana.
    var _usados = {};
    Object.keys(_tpVehicleLinksElsewhere(null)).forEach(function(id) { _usados[id] = true; });
    var rows = (plan && plan.items || []).map(function(item, itemIdx) {
        var cfg = (tpState.planData || []).find(function(p) { return p.desc === item.desc; }) || item;
        var soak = tpSoakHoursFor(cfg);
        // El soak CONGELADO en el item manda: si la tabla cambia, un plan ya publicado
        // no debe empezar a mentir sobre con qué reposo se armó.
        var horas = (typeof item.soakHours === 'number' && item.soakHours > 0) ? item.soakHours : soak.hours;
        var fuente = item.soakSource || soak.source;

        // El vehículo de esta fila.
        //
        // v20.1: el vínculo EXPLÍCITO manda (`item.linkedVehicleId`, puesto a mano desde
        // "🔗 Vincular"). Si no lo hay, se resuelve por configuración, pero **REPARTIENDO**:
        // dos pruebas de la MISMA configuración en la misma semana —que es justo lo que el
        // laboratorio necesita hacer— apuntaban las dos al mismo vehículo y la segunda
        // parecía tener uno cuando no lo tenía. `_usados` garantiza que cada vehículo
        // acredite a lo sumo una fila.
        var veh = null;
        if (item.linkedVehicleId != null) {
            veh = vehiculos.find(function(v) { return v && v.id == item.linkedVehicleId; }) || null;
        }
        if (!veh) {
            var _arch = null;
            for (var k = vehiculos.length - 1; k >= 0; k--) {
                var v = vehiculos[k];
                if (!v || v.configCode !== item.desc) continue;
                if (_usados[v.id]) continue;
                // [v20.8] Un liberado solo respalda una fila YA completada: un archivado
                // es una prueba que ya ocurrió, y si esta fila fuera esa prueba estaría
                // marcada (tpAutoMarkWeeklyCompletion la marca al liberar). Prestárselo a
                // una fila pendiente pintaba el mismo VIN "liberado" en dos semanas
                // distintas con una sola prueba real de por medio.
                if (v.status === 'archived') { if (!_arch && item.completed) _arch = v; continue; }
                veh = v; break;
            }
            if (!veh) veh = _arch;
        }
        if (veh) _usados[veh.id] = true;
        var stage = (veh && typeof cascadeVehicleStage === 'function') ? cascadeVehicleStage(veh) : null;
        var eta   = (veh && typeof cascadeVehicleETA === 'function') ? cascadeVehicleETA(veh) : null;

        var row = {
            planIdx: planIdx, planId: plan ? tpPlanId(plan) : null, itemIdx: itemIdx, item: item,
            cfg: cfg, desc: item.desc,
            shortName: tpConfigShortName(cfg), variantTag: tpConfigVariantTag(cfg),
            rgn: cfg.rgn || item.rgn, reg: cfg.reg || item.reg,
            testDay: tpItemDay(item), preconDay: item.preconDay || null,
            plannedTestDay: item.plannedTestDay || null, moved: tpItemMoved(item),
            soakHours: horas, soakSource: fuente, gapDays: tpSoakGapDays(horas),
            spanDays: (function() {
                var pi = item.preconDay ? TP_DAY_ORDER.indexOf(item.preconDay) : -1;
                var ti = item.testDay ? TP_DAY_ORDER.indexOf(item.testDay) : -1;
                return (pi >= 0 && ti >= pi) ? TP_DAY_ORDER.slice(pi, ti + 1) : [];
            })(),
            done: !!item.completed, declared: !!item.declared,
            substituted: !!item.substituted, substitution: item.substitution || null,
            carriedOver: !!item.carriedOver, manual: !!item.manual,
            vehicle: veh && veh.status !== 'archived' ? veh : null,
            // v20.1: `vehicle` sigue significando "vivo, en curso" — de eso dependen el
            // semáforo y la ETA. Pero el vehículo RESUELTO se expone aparte: con dos
            // pruebas idénticas la segunda suele quedar cubierta por uno ya liberado, y
            // sin esto la tarjeta se veía vacía como si nadie la hubiera corrido.
            vehicleAny: veh || null,
            vehicleArchived: !!(veh && veh.status === 'archived'),
            linkedVehicle: (item.linkedVehicleId != null && veh) ? veh : null,
            linkedManually: item.linkedVehicleId != null,
            stage: stage, eta: eta
        };
        row.state = row.done ? (row.declared ? 'declarada' : 'hecha')
                  : row.vehicle ? 'encurso'
                  : row.substituted ? 'sustituida' : 'pendiente';
        row.risk = tpWeekItemRisk(row, ctx);
        return row;
    });

    // Columnas: un día laborable cada una. Las tarjetas viven UNA sola vez, en su
    // columna de PRUEBA — duplicarlas en la de preacon obliga a averiguar cuál es cuál
    // y vuelve ambiguo el arrastre. El preacon se ve en el medidor de carga de su
    // columna y en la tira de días de la tarjeta.
    var lunes = weekDate ? new Date(weekDate + 'T00:00:00') : null;
    var dias = TP_DAY_ORDER.filter(function(d) { return workDays[d]; }).map(function(d) {
        var off = TP_DAY_ORDER.indexOf(d);         // dom=0 … sab=6, y `lunes` es lun
        var fecha = null;
        if (lunes && !isNaN(lunes.getTime())) {
            fecha = new Date(lunes); fecha.setDate(lunes.getDate() + (off === 0 ? 6 : off - 1));
        }
        return {
            key: d, label: TP_DAY_LABELS[d],
            date: fecha && typeof _tpFmtDate === 'function' ? _tpFmtDate(fecha) : null,
            dayNum: fecha ? fecha.getDate() : null,
            isToday: todayIdx >= 0 && TP_DAY_ORDER[todayIdx] === d,
            isPast: todayIdx >= 0 ? TP_DAY_ORDER.indexOf(d) < todayIdx : weekIsPast,
            rows: rows.filter(function(r) { return r.testDay === d; }),
            preconCount: rows.filter(function(r) { return r.preconDay === d; }).length,
            perSlot: perSlot
        };
    });

    // v20.1: dos pruebas de la MISMA configuración en la semana son legítimas (dos
    // vehículos idénticos). Se numeran "1 de 2", "2 de 2" para que se distingan en el
    // tablero en vez de parecer un error de captura.
    var _cuenta = {};
    rows.forEach(function(r) { _cuenta[r.desc] = (_cuenta[r.desc] || 0) + 1; });
    var _visto = {};
    rows.forEach(function(r) {
        if (_cuenta[r.desc] < 2) return;
        _visto[r.desc] = (_visto[r.desc] || 0) + 1;
        r.dupOf = r.desc; r.dupIdx = _visto[r.desc]; r.dupTotal = _cuenta[r.desc];
    });

    var out = {
        plan: plan, planIdx: planIdx, planId: plan ? tpPlanId(plan) : null,
        weekDate: weekDate, monHoy: monHoy,
        isCurrentWeek: !!(weekDate && monHoy && weekDate === monHoy),
        weekIsPast: weekIsPast, weekIsFuture: weekIsFuture,
        accepted: !!(plan && plan.accepted),
        workDays: workDays, perSlot: perSlot, todayIdx: todayIdx, ctx: ctx,
        days: dias, rows: rows,
        unscheduled: rows.filter(function(r) { return !r.testDay; }),
        kpis: {
            planeadas: rows.length,
            hechas: rows.filter(function(r) { return r.done; }).length,
            declaradas: rows.filter(function(r) { return r.done && r.declared; }).length,
            encurso: rows.filter(function(r) { return r.state === 'encurso'; }).length,
            movidas: rows.filter(function(r) { return r.moved; }).length,
            riesgo: rows.filter(function(r) { return r.risk.level === 'riesgo'; }).length,
            atencion: rows.filter(function(r) { return r.risk.level === 'atencion'; }).length,
            capMax: tpWeekCapacity(workDays).max
        }
    };
    _tpBoardCache = { key: clave, data: out };
    return out;
}

/**
 * Mover una prueba de día — NO EXISTÍA NINGUNA función que cambiara el día de una
 * prueba, y por eso el único vocabulario del sistema era `completed` sí/no: no había
 * forma de decir "esto se recorrió al jueves".
 *
 * Deriva hacia atrás el preacondicionamiento legal con tpSlotsForSoak. Si no existe
 * ninguno, RECHAZA CON EL MOTIVO ESCRITO en vez de mover a un día imposible: ese
 * rechazo con nombre es justo el valor de derivar del soak real.
 *
 * `undoPush('testplan', …)` — NUNCA 'tp': undoPush solo conoce cop15/testplan/
 * inventory y 'tp' sería un no-op silencioso (la trampa que documenta el CoP).
 */
function tpMoveItemToDay(weekIdx, itemIdx, day, opts) {
    opts = opts || {};
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan || !plan.items || !plan.items[itemIdx]) return { ok: false, reason: 'No se encontró esa prueba.' };
    var item = plan.items[itemIdx];
    if (item.testDay === day) return { ok: false, reason: 'Ya está en ese día.' };

    var workDays = tpWorkDaysFor(plan);
    if (!workDays[day]) return { ok: false, reason: TP_DAY_LABELS[day] + ' no es día laborable esta semana.' };

    var cfg = (tpState.planData || []).find(function(p) { return p.desc === item.desc; }) || item;
    var horas = (typeof item.soakHours === 'number' && item.soakHours > 0) ? item.soakHours : tpSoakHoursFor(cfg).hours;
    var par = tpSlotsForSoak(horas, workDays).filter(function(s) { return s.test === day; })[0];
    if (!par) {
        // El motivo con nombre: qué soak, y qué día sí se puede.
        var posibles = tpSlotsForSoak(horas, workDays).filter(function(s) { return !s.spillsNextWeek; });
        var sugerido = posibles.map(function(s) { return TP_DAY_LABELS[s.test]; }).join(', ');
        return { ok: false,
                 reason: horas + ' h de reposo no caben antes del ' + TP_DAY_LABELS[day] + '.' +
                         (sugerido ? ' Con este soak los días posibles son: ' + sugerido + '.' : ' Con este soak no hay ningún día posible esta semana.'),
                 candidates: posibles.map(function(s) { return s.test; }) };
    }

    var perSlot = Math.max(1, parseInt(tpState.vehiclesPerSlot, 10) || 1);
    var ocupado = plan.items.filter(function(it, i) { return i !== itemIdx && it.testDay === day; }).length;
    if (ocupado >= perSlot && !opts.overCapacity) {
        return { ok: false, full: true, occupied: ocupado, perSlot: perSlot,
                 reason: TP_DAY_LABELS[day] + ' ya tiene ' + ocupado + ' prueba(s) y el laboratorio corre ' + perSlot + '.' };
    }

    if (typeof undoPush === 'function') undoPush('testplan', 'Mover prueba de día');

    // SOMBRA: se estampa una vez y jamás se reescribe. "Movida" se DERIVA comparándola.
    if (!item.plannedTestDay) { item.plannedTestDay = item.testDay; item.plannedPreconDay = item.preconDay; }
    // Y el soak con el que se resolvió, congelado: si mañana cambia la tabla, el plan
    // no debe empezar a decir otra cosa sobre cómo se armó.
    item.soakHours = horas;
    if (!item.soakSource) item.soakSource = tpSoakHoursFor(cfg).source;

    var deDia = item.testDay;
    item.testDay = par.test; item.preconDay = par.precon;
    item.testLabel = par.testLabel; item.preconLabel = par.preconLabel;
    item.unscheduled = false;
    if (ocupado >= perSlot) item.overCapacity = true; else delete item.overCapacity;

    if (!Array.isArray(item.moves)) item.moves = [];
    item.moves.push({
        from: deDia || null, to: par.test, at: new Date().toISOString(),
        by: (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '',
        reason: opts.reason || '', via: opts.via || 'ui'
    });
    if (item.moves.length > 10) item.moves = item.moves.slice(-10);   // append-only con tope

    tpBoardInvalidate();
    _tpTouchPlan(weekIdx);
    if (typeof auditLog === 'function') {
        auditLog('tp', 'week_item_moved', { type: 'plan', label: item.desc },
                 (TP_DAY_LABELS[deDia] || '—') + ' → ' + TP_DAY_LABELS[par.test] +
                 ' · preacon ' + TP_DAY_LABELS[par.precon] + ' · ' + horas + ' h de reposo' +
                 (item.overCapacity ? ' · SOBRE CUPO' : ''));
    }
    return { ok: true, from: deDia, to: par.test, precon: par.precon, overCapacity: !!item.overCapacity };
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v20] MI SEMANA — la pantalla
//
// `tpRenderWeekly` era UN SOLO innerHTML de 223 líneas que hacía cuatro trabajos:
// configurar, ponderar, previsualizar y mostrar el plan — y EL PLAN era el último
// bloque, a 2062 px de alto. "El plan sale hasta el mero fondo", literal.
//
// Aquí el plan es lo PRIMERO y lo único: una columna por día laborable. Con
// capacidad de 4-8 pruebas son 1-2 tarjetas por columna y cabe en una pantalla.
// ═══════════════════════════════════════════════════════════════════════════════

/** Semana que está mirando el tablero. Vive en window: es estado de vista, no dato. */
function tpBoardWeekDate() {
    if (window._tpBoardWeek) return window._tpBoardWeek;
    try { return _tpFmtDate(_tpMonday(new Date())); } catch (e) { return null; }
}
function tpBoardShiftWeek(deltaSemanas) {
    var base = tpBoardWeekDate();
    var d = new Date(base + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    d.setDate(d.getDate() + deltaSemanas * 7);
    window._tpBoardWeek = _tpFmtDate(d);
    tpBoardInvalidate();
    _tpBoardRepaint();
}
function tpBoardGoToday() { window._tpBoardWeek = null; tpBoardInvalidate(); _tpBoardRepaint(); }

/**
 * Repinta SOLO el tablero. Nunca tpRender(): eso repinta la pestaña entera y
 * resetea el scroll, que es media queja del usuario.
 */
function _tpBoardRepaint() {
    tpBoardInvalidate();
    // El anfitrión se guarda al pintar: `tabCacheSwitch` crea un contenedor propio por
    // pestaña, así que no hay un id fijo al que agarrarse desde fuera.
    var host = window._tpMyWeekHost;
    if (!host || !host.isConnected) { tpRender(); return; }
    tpRenderMyWeek(host);
}

var TP_STATE_CHIP = {
    pendiente:  { icon: '⬜', label: 'Pendiente' },
    encurso:    { icon: '🔬', label: 'En curso' },
    hecha:      { icon: '✅', label: 'Hecha' },
    declarada:  { icon: '✋', label: 'Declarada' },
    sustituida: { icon: '🔄', label: 'Sustituida' }
};

/** La tira de 7 días de la tarjeta: preacon · reposo · prueba. Autocontenida. */
function _tpWeekSpanHTML(row, workDays) {
    var pi = row.preconDay ? TP_DAY_ORDER.indexOf(row.preconDay) : -1;
    var ti = row.testDay ? TP_DAY_ORDER.indexOf(row.testDay) : -1;
    var h = '<div class="tp-week-span" role="img" aria-label="' +
            (row.preconDay ? 'Preacondiciona ' + TP_DAY_LABELS[row.preconDay] + ', ' : '') +
            row.soakHours + ' horas de reposo' +
            (row.testDay ? ', prueba ' + TP_DAY_LABELS[row.testDay] : '') + '">';
    TP_DAY_ORDER.forEach(function(d, i) {
        var cls = 'tp-week-span-cell';
        var txt = TP_DAY_SHORT[d] || d;
        if (!workDays[d]) cls += ' tp-week-span-cell--off';
        if (i === pi) { cls += ' tp-week-span-cell--pre'; txt = 'P'; }
        else if (i === ti) { cls += ' tp-week-span-cell--test'; txt = 'T'; }
        else if (pi >= 0 && ti > pi && i > pi && i < ti) { cls += ' tp-week-span-cell--soak'; txt = '·'; }
        h += '<span class="' + cls + '" title="' + TP_DAY_LABELS[d] + '">' + txt + '</span>';
    });
    h += '<span class="tp-week-span-note">' + row.soakHours + ' h</span>';
    return h + '</div>';
}

function _tpWeekCardHTML(row, workDays) {
    var chip = TP_STATE_CHIP[row.state] || TP_STATE_CHIP.pendiente;
    var mods = [];
    if (row.done) mods.push('tp-week-card--done');
    if (row.risk.level === 'riesgo') mods.push('tp-week-card--risk');
    else if (row.risk.level === 'atencion') mods.push('tp-week-card--warn');
    if (row.moved) mods.push('tp-week-card--moved');
    if (row.substituted) mods.push('tp-week-card--subst');

    var h = '<div class="tp-week-card ' + mods.join(' ') + '" data-plan="' + row.planIdx + '" data-item="' + row.itemIdx + '">';
    h += '<div class="tp-week-card-top">';
    // El asa. La TARJETA no puede ser el <button> (contiene botones), así que el origen del
    // arrastre y del teclado es este elemento — el mismo patrón que conserva v17.8.
    if (!row.done) {
        h += '<button type="button" class="tp-week-grip" ' +
             'data-drag-id="' + row.planIdx + ':' + row.itemIdx + '" ' +
             'data-drag-cell="' + (row.testDay || '_sin') + '" ' +
             'aria-label="Mover ' + (row.shortName || row.desc) + '. Enter para seleccionar y elegir otro día." ' +
             'title="' + (row.moved ? 'Planeada para ' + (TP_DAY_LABELS[row.plannedTestDay] || '—') + '. ' : '') +
             'Arrastra (mantén pulsado) o pulsa Enter para mover a otro día">⠿</button>';
    }
    h += '<button class="tp-week-check" onclick="tpToggleWeeklyItem(' + row.planIdx + ',' + row.itemIdx + ');_tpBoardRepaint();" ' +
         'title="' + (row.done ? 'Quitar la palomita' : 'Marcar como hecha (queda registrada como declarada a mano)') + '" ' +
         'aria-pressed="' + (row.done ? 'true' : 'false') + '">' + chip.icon + '</button>';
    h += '<div class="tp-week-card-id">' +
         '<div class="tp-week-name">' + (row.shortName || row.desc) + '</div>' +
         (row.variantTag ? '<div class="tp-week-variant">' + row.variantTag + '</div>' : '') +
         '</div>';
    if (row.rgn) h += '<span class="tp-week-rgn" style="--rgn:' + tpRegionColor(row.rgn) + '">' + row.rgn + '</span>';
    h += '</div>';

    h += _tpWeekSpanHTML(row, workDays || tpWorkDaysFor(null));

    var marcas = [];
    // v20.1: "movida desde el martes" YA NO se pinta en la tarjeta. Que el plan se
    // reacomode es normal, no una excepción que haya que señalar todos los días: el
    // aviso era ruido en la pantalla que más se mira. El registro NO se pierde — sigue
    // en `moves[]` (append-only), en la auditoría, y a la vista en el menú ⋯ y en el
    // título del asa. El borde punteado de la tarjeta lo insinúa sin gritarlo.
    if (row.declared) marcas.push('<span class="tp-week-flag tp-week-flag--declared" title="Sin vehículo liberado que la respalde">✋ declarada a mano</span>');
    if (row.carriedOver) marcas.push('<span class="tp-week-flag">🔄 viene de la cola</span>');
    if (row.substituted) marcas.push('<span class="tp-week-flag tp-week-flag--subst">🔄 sustituida</span>');
    if (row.item && row.item.overCapacity) marcas.push('<span class="tp-week-flag tp-week-flag--warn">⬆ sobre cupo</span>');
    if (row.dupOf) marcas.push('<span class="tp-week-flag" title="Otra prueba de la misma configuración esta semana">⧉ ' + row.dupIdx + ' de ' + row.dupTotal + '</span>');
    if (row.vehicleAny && row.stage) {
        var _v = row.vehicleAny;
        marcas.push('<span class="tp-week-flag tp-week-flag--live"' +
            (row.linkedManually ? ' title="Vinculada a mano"' : '') + '>' +
            (row.linkedManually ? '🔗 ' : row.vehicleArchived ? '✅ ' : '🔬 ') +
            (_v.vin ? '…' + String(_v.vin).slice(-6) + ' · ' : '') +
            (row.vehicleArchived ? 'liberado' : row.stage.label + ' (' + row.stage.index + '/' + row.stage.total + ')') +
            '</span>');
    }
    row.risk.reasons.forEach(function(r) {
        marcas.push('<span class="tp-week-flag tp-week-flag--' + (row.risk.level === 'riesgo' ? 'risk' : 'warn') + '">' +
                    (row.risk.level === 'riesgo' ? '🔴' : '⚠️') + ' ' + r.text + '</span>');
    });
    if (marcas.length) h += '<div class="tp-week-flags">' + marcas.join('') + '</div>';

    h += '<div class="tp-week-actions">';
    if (!row.done && !row.vehicle) {
        h += '<button class="tp-week-act" onclick="tpStartTestFromPlan(' + row.planIdx + ',' + row.itemIdx + ')" title="Dar de alta el vehículo en Pruebas">▶ Iniciar</button>';
    } else if (row.vehicle) {
        h += '<button class="tp-week-act" onclick="tpOpenVehicleFromPlan(' + row.vehicle.id + ')" title="Abrir el vehículo en Pruebas">🔬 Abrir</button>';
    }
    h += '<button class="tp-week-act" onclick="tpWeekMoveMenu(' + row.planIdx + ',' + row.itemIdx + ')" title="Mover a otro día">↪ Mover</button>';
    h += '<button class="tp-week-act" onclick="tpLinkVehicleMenu(' + row.planIdx + ',' + row.itemIdx + ')" ' +
         'title="Vincular con una prueba ya liberada esta semana">🔗 Vincular</button>';
    h += '<button class="tp-week-act tp-week-act--ghost" onclick="tpWeekCardMenu(' + row.planIdx + ',' + row.itemIdx + ')" title="Más acciones" aria-label="Más acciones">⋯</button>';
    h += '</div>';
    return h + '</div>';
}

function tpRenderMyWeek(el) {
    if (!el) return;
    window._tpMyWeekHost = el;
    var b = tpWeekBoardRows({ weekDate: tpBoardWeekDate() });

    var h = '<div class="tp-week-wrap">';

    // ── Encabezado: qué semana, en qué estado, y de un toque a la de hoy ──
    var etiqueta = b.isCurrentWeek ? '<span class="tp-week-tag tp-week-tag--now">Semana en curso</span>'
                 : b.weekIsPast ? '<span class="tp-week-tag tp-week-tag--past">Semana pasada</span>'
                 : '<span class="tp-week-tag tp-week-tag--next">Semana futura</span>';
    h += '<div class="tp-week-head">' +
         '<div class="tp-week-nav">' +
           '<button class="tp-btn tp-btn-ghost" onclick="tpBoardShiftWeek(-1)" aria-label="Semana anterior">◀</button>' +
           '<div class="tp-week-title"><strong>Semana del ' + (b.weekDate || '—') + '</strong>' + etiqueta + '</div>' +
           '<button class="tp-btn tp-btn-ghost" onclick="tpBoardShiftWeek(1)" aria-label="Semana siguiente">▶</button>' +
           (b.isCurrentWeek ? '' : '<button class="tp-btn tp-btn-ghost" onclick="tpBoardGoToday()">Ir a hoy</button>') +
         '</div>' +
         '<div class="tp-week-headacts">';
    if (b.plan) {
        h += b.accepted
            ? '<span class="tp-week-tag tp-week-tag--ok">✔ Aceptado</span>' +
              '<button class="tp-btn tp-btn-ghost" onclick="tpUnacceptWeeklyPlan(' + b.planIdx + ')">↩️ Desaceptar</button>'
            : '<span class="tp-week-tag">Propuesta</span>' +
              '<button class="tp-btn tp-btn-primary" onclick="tpAcceptWeeklyPlan(' + b.planIdx + ')">✔ Aceptar</button>';
    }
    h += '<button class="tp-btn tp-btn-ghost" onclick="tpSwitchTab(\'tp-weekly\')">🎛️ Armar semana</button>' +
         '</div></div>';

    if (!b.plan) {
        h += '<div class="tp-week-empty tp-card">' +
             '<div class="tp-week-empty-icon">📅</div>' +
             '<div><strong>No hay plan para esta semana.</strong></div>' +
             '<p>Las pruebas ya liberadas siguen contando en la cobertura — un plan es la agenda, no el registro.</p>' +
             '<button class="tp-btn tp-btn-primary" onclick="tpSwitchTab(\'tp-weekly\')">🎛️ Armar esta semana</button>' +
             '</div></div>';
        el.innerHTML = h;
        if (typeof cascadeInjectTooltipsDeferred === 'function') cascadeInjectTooltipsDeferred();
        return;
    }

    // ── KPIs ──
    var k = b.kpis;
    function kpi(v, lbl, cls, title) {
        return '<div class="tp-week-kpi ' + (cls || '') + '"' + (title ? ' title="' + title + '"' : '') + '>' +
               '<div class="tp-week-kpi-n">' + v + '</div><div class="tp-week-kpi-l">' + lbl + '</div></div>';
    }
    h += '<div class="tp-week-kpis" data-help="tp_week_kpis">' +
         kpi(k.planeadas, 'planeadas', '') +
         kpi(k.hechas, 'hechas', k.hechas ? 'tp-week-kpi--ok' : '',
             k.declaradas ? k.declaradas + ' declarada(s) a mano, sin vehículo liberado' : 'Con evidencia registrada') +
         kpi(k.encurso, 'en curso', k.encurso ? 'tp-week-kpi--live' : '') +
         kpi(k.movidas, 'movidas', k.movidas ? 'tp-week-kpi--moved' : '', 'Cambiaron de día respecto al plan original') +
         kpi(k.riesgo, 'en riesgo', k.riesgo ? 'tp-week-kpi--risk' : '', 'Aviso interno anticipado, no un juicio') +
         '</div>';
    if (k.declaradas) {
        h += '<div class="tp-week-note">✋ ' + k.declaradas + ' de las hechas están <strong>declaradas a mano</strong>, sin vehículo liberado que las respalde. ' +
             '<button class="tp-btn tp-btn-ghost" onclick="tpRecoverFromCOP15()">Buscar evidencia en Pruebas</button></div>';
    }

    // ── El tablero ──
    h += '<div class="tp-week-board" id="tp-myweek-board">';
    b.days.forEach(function(d) {
        var cls = 'tp-week-col' + (d.isToday ? ' tp-week-col--today' : '') + (d.isPast && !d.isToday ? ' tp-week-col--past' : '');
        h += '<section class="' + cls + '" data-day="' + d.key + '">';
        h += '<header class="tp-week-col-head">' +
             '<span class="tp-week-col-day">' + d.label + (d.isToday ? ' · hoy' : '') + '</span>' +
             (d.dayNum ? '<span class="tp-week-col-date">' + d.dayNum + '</span>' : '<span></span>') +
             '<button class="tp-week-coladd" onclick="tpWeekAddMenu(' + b.planIdx + ',\'' + d.key + '\')" ' +
               'title="Agregar una prueba el ' + d.label + '" aria-label="Agregar una prueba el ' + d.label + '">＋</button>' +
             '<span class="tp-week-col-load' + (d.rows.length > d.perSlot ? ' tp-week-col-load--over' : '') + '">' +
               d.rows.length + '/' + d.perSlot + ' prueba' + (d.perSlot === 1 && d.rows.length === 1 ? '' : 's') +
               (d.preconCount ? ' · ' + d.preconCount + ' preacon' : '') +
             '</span></header>';
        h += '<div class="tp-week-col-body" data-drag-cell="' + d.key + '">';
        if (!d.rows.length) {
            h += '<button class="tp-week-col-empty tp-week-col-empty--add" onclick="tpWeekAddMenu(' + b.planIdx + ',\'' + d.key + '\')">＋ agregar</button>';
        }
        else d.rows.forEach(function(r) { h += _tpWeekCardHTML(r, b.workDays); });
        h += '</div></section>';
    });
    h += '</div>';

    // ── Lo que no cupo: se DECLARA, nunca se esconde (principio del CoP) ──
    if (b.unscheduled.length) {
        h += '<div class="tp-week-unsched tp-card"><h4>⚠️ Sin día asignado (' + b.unscheduled.length + ')</h4>' +
             '<p>No caben en los pares preacon→prueba de esta semana. Muévelas a un día posible o quítalas.</p>' +
             '<div class="tp-week-unsched-list">';
        b.unscheduled.forEach(function(r) { h += _tpWeekCardHTML(r, b.workDays); });
        h += '</div></div>';
    }

    h += '</div>';
    el.innerHTML = h;
    // Arrastre + teclado. Se vuelve a montar en cada pintado porque el DOM es nuevo;
    // gridDragInit desmonta los listeners anteriores por su cuenta (ns 'tp-week').
    tpWeekBoardDragInit(el);
    if (typeof cascadeInjectTooltipsDeferred === 'function') cascadeInjectTooltipsDeferred();
    if (typeof a11yClickables === 'function') a11yClickables(el);
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v20.1] AGREGAR Y REPETIR — dos vehículos idénticos en la misma semana
//
// EL BLOQUEO ERA REAL Y ESTABA EN CUATRO SITIOS a la vez:
//   1. `tpSelectWeeklyItems` lleva un Set `used` por `desc` — el generador nunca
//      propone dos de la misma configuración.
//   2. `window._tpWeeklyManualPicks` es un array de `desc` filtrado con `.includes()`
//      — fijar la misma dos veces era imposible.
//   3. `tpAddToWeek` ofrecía `allConfigs.filter(c => !w.items.some(i => i.desc === c))`
//      — la configuración ya presente ni siquiera aparecía en el desplegable.
//   4. Y aunque se colaran dos, `tpWeekBoardRows` apuntaba las dos al MISMO vehículo.
//
// Decisión: el generador AUTOMÁTICO sigue sin repetir por su cuenta (repetir gasta
// capacidad que el déficit necesita, y nadie se lo pidió), pero **lo que el usuario
// pide a mano sí se repite**. Repetir es una intención explícita, no un accidente.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * LA definición de "agregar una prueba al plan de una semana" desde el tablero.
 * No filtra duplicados a propósito (ver arriba). Devuelve el índice del item nuevo.
 */
function tpAddItemToWeekDay(weekIdx, desc, day, opts) {
    opts = opts || {};
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan) return { ok: false, reason: 'No se encontró esa semana.' };
    var cfg = (tpState.planData || []).find(function(c) { return c.desc === desc; });
    if (!cfg) return { ok: false, reason: 'Esa configuración no está en el plan de producción.' };

    if (typeof undoPush === 'function') undoPush('testplan', 'Agregar prueba al plan');
    if (!Array.isArray(plan.items)) plan.items = [];

    var item = _tpMakeItem(cfg, (tpState.testedList || []).slice(), { manual: true });
    var soak = tpSoakHoursFor(cfg);
    item.soakHours = soak.hours; item.soakSource = soak.source;

    var workDays = tpWorkDaysFor(plan);
    var par = day ? tpSlotsForSoak(soak.hours, workDays).filter(function(sl) { return sl.test === day; })[0] : null;
    if (day && !par) {
        var posibles = tpSlotsForSoak(soak.hours, workDays).filter(function(sl) { return !sl.spillsNextWeek; });
        return { ok: false,
                 reason: soak.hours + ' h de reposo no caben antes del ' + (TP_DAY_LABELS[day] || day) + '.' +
                         (posibles.length ? ' Días posibles: ' + posibles.map(function(sl) { return TP_DAY_LABELS[sl.test]; }).join(', ') + '.'
                                          : ' Con este reposo no hay ningún día posible esta semana.') };
    }
    if (par) {
        item.preconDay = par.precon; item.testDay = par.test;
        item.preconLabel = par.preconLabel; item.testLabel = par.testLabel;
        var perSlot = Math.max(1, parseInt(tpState.vehiclesPerSlot, 10) || 1);
        var ocupado = plan.items.filter(function(it) { return it.testDay === par.test; }).length;
        if (ocupado >= perSlot) item.overCapacity = true;
    } else {
        // Sin día pedido: el primer par libre; si no hay, queda declarada sin día.
        if (!tpAssignSlotForItem(plan, item)) item.unscheduled = true;
    }

    plan.items.push(item);
    var idx = plan.items.length - 1;
    tpBoardInvalidate();
    _tpTouchPlan(weekIdx);
    if (typeof auditLog === 'function') {
        var repetida = plan.items.filter(function(it) { return it.desc === desc; }).length;
        auditLog('tp', 'week_item_added', { type: 'plan', label: desc },
                 'Semana del ' + (plan.weekDate || '—') + ' · ' + (item.testDay ? TP_DAY_LABELS[item.testDay] : 'sin día') +
                 (repetida > 1 ? ' · ' + repetida + 'ª prueba de esta configuración en la semana' : '') +
                 (opts.via ? ' · ' + opts.via : ''));
    }
    return { ok: true, itemIdx: idx, testDay: item.testDay, overCapacity: !!item.overCapacity, unscheduled: !!item.unscheduled };
}

/**
 * Duplicar: el caso exacto que pidió el laboratorio — dos vehículos IDÉNTICOS de la
 * misma configuración en la misma semana. Busca el siguiente día legal libre; si no
 * hay, la agrega sin día y lo DECLARA en vez de inventarse un hueco.
 */
function tpDuplicateItem(weekIdx, itemIdx) {
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan || !plan.items || !plan.items[itemIdx]) return;
    var item = plan.items[itemIdx];
    var cfg = (tpState.planData || []).find(function(c) { return c.desc === item.desc; }) || item;
    var horas = (typeof item.soakHours === 'number' && item.soakHours > 0) ? item.soakHours : tpSoakHoursFor(cfg).hours;
    var perSlot = Math.max(1, parseInt(tpState.vehiclesPerSlot, 10) || 1);
    var pares = tpSlotsForSoak(horas, tpWorkDaysFor(plan)).filter(function(sl) { return !sl.spillsNextWeek; });

    // Primero un día con lugar; si todos están llenos, el siguiente día legal marcado
    // como sobrecupo — el laboratorio a veces sí se pasa, y mentirle no ayuda.
    var libre = pares.filter(function(sl) {
        return plan.items.filter(function(it) { return it.testDay === sl.test; }).length < perSlot;
    })[0] || pares[0] || null;

    var r = tpAddItemToWeekDay(weekIdx, item.desc, libre ? libre.test : null, { via: 'duplicar' });
    if (!r.ok) { showToast(r.reason, 'error'); return; }
    var n = plan.items.filter(function(it) { return it.desc === item.desc; }).length;
    showToast('Segunda unidad agregada (' + n + ' de esta configuración esta semana)' +
              (r.unscheduled ? ' — sin día libre, quedó declarada sin horario'
                             : ' · ' + TP_DAY_LABELS[r.testDay] + (r.overCapacity ? ' (sobre cupo)' : '')),
              r.unscheduled ? 'warning' : 'success', null, (typeof undoPop === 'function') ? undoPop : null);
    _tpBoardRepaint();
}

/** El selector para agregar al tablero. Reusa los optgroups por familia y el buscador. */
function tpWeekAddMenu(weekIdx, day) {
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan) { showToast('Primero arma la semana.', 'info'); return; }
    var an = (typeof tpGetAnalysis === 'function') ? tpGetAnalysis() : [];
    // Se sugiere lo que más falta hace y NO está ya en la semana; pero abajo el
    // desplegable ofrece TODO, incluido lo repetido, que es justo lo que faltaba.
    var enSemana = {};
    (plan.items || []).forEach(function(it) { enSemana[it.desc] = (enSemana[it.desc] || 0) + 1; });
    var sug = an.filter(function(a) { return a.deficit > 0 && !enSemana[a.desc]; }).slice(0, 5);
    var todas = (tpState.planData || []).map(function(c) { return c.desc; }).sort();

    var body = '<div class="tp-week-movebox">' +
        '<p class="tp-week-movehint">Se agrega a <strong>' + (day ? TP_DAY_LABELS[day] : 'el primer día libre') + '</strong>' +
        ' de la semana del ' + (plan.weekDate || '—') + '.<br>' +
        'Puedes agregar una configuración <strong>que ya esté en la semana</strong>: son dos vehículos distintos de la misma configuración.</p>';

    if (sug.length) {
        body += '<div class="tp-week-addsug"><strong>Las que más falta hacen</strong>';
        sug.forEach(function(a) {
            body += '<button class="tp-week-movebtn" onclick="tpWeekDoAdd(' + weekIdx + ',\'' + _tpQ(a.desc) + '\',' + (day ? "'" + day + "'" : 'null') + ')">' +
                    '<span class="tp-week-movebtn-day">' + tpConfigShortName(a) + '</span>' +
                    '<span class="tp-week-movebtn-sub">' + (tpConfigVariantTag(a) || '') + ' · faltan ' + a.deficit + ' de ' + a.required + '</span></button>';
        });
        body += '</div>';
    }

    body += '<div class="tp-week-addpick">' +
        '<input type="search" id="tp-week-add-search" class="tp-select" placeholder="Filtrar (modelo, motor, región…)" oninput="tpFilterPickOptions(this.value,\'tp-week-add-select\')">' +
        '<select id="tp-week-add-select" class="tp-select" size="8">' + tpBuildPickOptgroupsHTML(todas) + '</select>' +
        '<button class="tp-btn tp-btn-primary" onclick="tpWeekDoAdd(' + weekIdx + ',null,' + (day ? "'" + day + "'" : 'null') + ')">➕ Agregar la seleccionada</button>' +
        '</div></div>';

    showModal({ title: '➕ Agregar prueba a la semana', type: 'info', body: body, buttons: [{ label: 'Cerrar', cls: '' }] });
    setTimeout(function() { var i = document.getElementById('tp-week-add-search'); if (i) i.focus(); }, 60);
}

function tpWeekDoAdd(weekIdx, desc, day) {
    if (!desc) {
        var sel = document.getElementById('tp-week-add-select');
        desc = sel && sel.value;
        if (!desc) { showToast('Elige una configuración de la lista.', 'info'); return; }
    }
    var m = document.getElementById('globalModal'); if (m) m.remove();
    var r = tpAddItemToWeekDay(weekIdx, desc, day || null, { via: 'tablero' });
    if (!r.ok) { showToast(r.reason, 'error'); return; }
    showToast('Agregada' + (r.unscheduled ? ' sin día libre — quedó declarada sin horario'
                                          : ' · se prueba ' + TP_DAY_LABELS[r.testDay] + (r.overCapacity ? ' (sobre cupo)' : '')),
              r.unscheduled ? 'warning' : 'success', null, (typeof undoPop === 'function') ? undoPop : null);
    _tpBoardRepaint();
}

/**
 * [v20] Arrastrar una prueba a otro día. Usa `gridDragInit` (app.js), el mismo motor
 * del mapa del cuarto de gases: long-press de 380 ms, umbral de 15 px, dedo y ratón —
 * el laboratorio trabaja en tablet — y la alternativa de teclado de v17.8 gratis.
 *
 * El origen es el asa `.tp-week-grip` (la tarjeta no puede serlo: contiene botones) y
 * el destino es `.tp-week-col-body`. Los dos llevan `data-drag-cell`; sólo el asa lleva
 * `data-drag-id`, que es exactamente el modelo del motor: "celda con carga" vs "celda
 * vacía". Un tirón siempre pasa por `tpMoveItemToDay`, así que el rechazo con el motivo
 * escrito y el consentimiento del sobrecupo se comportan igual que por el menú.
 */
function tpWeekBoardDragInit(host) {
    if (typeof gridDragInit !== 'function' || !host) return;
    gridDragInit(host, {
        ns: 'tp-week',
        itemSelector: '.tp-week-grip, .tp-week-col-body',
        refocusSelector: '.tp-week-col-body',
        idAttr: 'data-drag-id',
        cellAttr: 'data-drag-cell',
        selectedClass: 'tp-week-grip--sel',
        ghostWidth: 44,
        label: function(id, el) { return (el && el.getAttribute('aria-label')) || 'La prueba'; },
        canDrop: function(id, from, to, el) {
            if (!to || to === from || to === '_sin') return false;
            if (el && el.getAttribute('data-drag-id')) return false;   // el destino es una columna, no otra asa
            var p = String(id || '').split(':');
            var plan = (tpState.weeklyPlans || [])[+p[0]];
            var item = plan && plan.items ? plan.items[+p[1]] : null;
            if (!item) return false;
            var cfg = (tpState.planData || []).find(function(c) { return c.desc === item.desc; }) || item;
            var horas = (typeof item.soakHours === 'number' && item.soakHours > 0) ? item.soakHours : tpSoakHoursFor(cfg).hours;
            // Sólo se pinta en verde y sólo se acepta lo que el reposo permite de verdad.
            return tpSlotsForSoak(horas, tpWorkDaysFor(plan)).some(function(sl) { return sl.test === to; });
        },
        onDrop: function(id, from, to) {
            var p = String(id || '').split(':');
            tpWeekDoMove(+p[0], +p[1], to, false);
        }
    });
}

/**
 * Abrir en Pruebas el vehículo vivo de una fila del tablero. Ir a la plataforma no
 * basta: hay que seleccionarlo en `#activeVehSelect` y disparar `loadVehicle()`, que
 * es la única forma en que COP15 carga uno. Se hace tras un RAF porque la plataforma
 * repuebla el selector al mostrarse.
 */
function tpOpenVehicleFromPlan(vehicleId) {
    if (typeof switchPlatform === 'function') switchPlatform('cop15');
    setTimeout(function() {
        var tab = document.querySelector('#platform-cop15 .tab[data-tab="operacion"]') ||
                  document.querySelector('#platform-cop15 .tab[onclick*="operacion"]');
        if (tab) tab.click();
        setTimeout(function() {
            var sel = document.getElementById('activeVehSelect');
            if (!sel) { showToast('Abre Pruebas → Operación para ver el vehículo.', 'info'); return; }
            sel.value = String(vehicleId);
            if (sel.value !== String(vehicleId)) {
                showToast('Ese vehículo ya no está en operación (quizá se archivó).', 'info');
                return;
            }
            if (typeof loadVehicle === 'function') loadVehicle();
        }, 220);
    }, 120);
}

/**
 * Mover a otro día — POR TECLADO, y se entrega antes que el arrastre a propósito:
 * el tablero tiene que ser usable aunque el arrastre se posponga. Los días
 * imposibles salen deshabilitados CON EL MOTIVO ESCRITO, no simplemente ausentes.
 */
function tpWeekMoveMenu(weekIdx, itemIdx) {
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan || !plan.items[itemIdx]) return;
    var item = plan.items[itemIdx];
    var workDays = tpWorkDaysFor(plan);
    var cfg = (tpState.planData || []).find(function(p) { return p.desc === item.desc; }) || item;
    var horas = (typeof item.soakHours === 'number' && item.soakHours > 0) ? item.soakHours : tpSoakHoursFor(cfg).hours;
    var pares = tpSlotsForSoak(horas, workDays);
    var usables = {};
    pares.forEach(function(s) { if (!s.spillsNextWeek) usables[s.test] = s; });
    var perSlot = Math.max(1, parseInt(tpState.vehiclesPerSlot, 10) || 1);

    var body = '<div class="tp-week-movebox">' +
        '<p class="tp-week-movehint">' + tpConfigShortName(cfg) + ' · <strong>' + horas + ' h de reposo</strong> ' +
        '(' + tpSoakHoursFor(cfg).label + ') → ' + tpSoakGapDays(horas) + ' día(s) entre preacon y prueba.</p>';
    TP_DAY_ORDER.forEach(function(d) {
        var s = usables[d];
        var ocupado = plan.items.filter(function(it, i) { return i !== itemIdx && it.testDay === d; }).length;
        var actual = item.testDay === d;
        var motivo = '';
        if (!workDays[d]) motivo = 'no es día laborable';
        else if (!s) motivo = horas + ' h de reposo no caben antes de este día';
        else if (actual) motivo = 'ya está aquí';
        var lleno = s && ocupado >= perSlot;
        body += '<button class="tp-week-movebtn' + (actual ? ' tp-week-movebtn--now' : '') + (lleno ? ' tp-week-movebtn--full' : '') + '"' +
                (motivo ? ' disabled title="' + motivo + '"' : '') +
                (motivo ? '' : ' onclick="tpWeekDoMove(' + weekIdx + ',' + itemIdx + ',\'' + d + '\',' + (lleno ? 'true' : 'false') + ')"') + '>' +
                '<span class="tp-week-movebtn-day">' + TP_DAY_LABELS[d] + '</span>' +
                '<span class="tp-week-movebtn-sub">' +
                  (motivo ? motivo : 'preacon ' + TP_DAY_LABELS[s.precon] + ' · ' + ocupado + '/' + perSlot +
                                      (lleno ? ' · SOBRE CUPO' : '')) +
                '</span></button>';
    });
    body += '</div>';

    showModal({
        title: '↪ Mover a otro día', type: 'info', body: body,
        buttons: [{ label: 'Cerrar', cls: '' }]
    });
}

/** Ejecuta el movimiento desde el menú. Confirma el sobrecupo en vez de mentir. */
function tpWeekDoMove(weekIdx, itemIdx, day, lleno) {
    var cerrar = function() { var m = document.getElementById('globalModal'); if (m) m.remove(); };
    var aplicar = function(over) {
        var r = tpMoveItemToDay(weekIdx, itemIdx, day, { overCapacity: !!over, via: over ? 'menu-sobrecupo' : 'menu' });
        cerrar();
        // El arrastre no sabe de antemano si el día está lleno (el menú sí lo pinta): si
        // resulta que lo estaba, se pide consentimiento en vez de fallar en seco.
        if (!r.ok && r.full && !over) { tpWeekDoMove(weekIdx, itemIdx, day, true); return; }
        if (!r.ok) { showToast(r.reason, 'error'); return; }
        showToast('Movida a ' + TP_DAY_LABELS[r.to] + ' · preacondiciona ' + TP_DAY_LABELS[r.precon] +
                  (r.overCapacity ? ' (sobre cupo)' : ''), 'success', null,
                  (typeof undoPop === 'function') ? undoPop : null);
        _tpBoardRepaint();
    };
    if (lleno) {
        cerrar();
        showConfirmDialog({
            title: '⬆ Ese día ya está lleno',
            message: TP_DAY_LABELS[day] + ' ya tiene su cupo de pruebas.\n\n' +
                     'El laboratorio a veces sí se pasa; si la mueves, queda MARCADA como sobre cupo ' +
                     'para que el número no mienta.',
            type: 'warning', confirmText: 'Mover de todos modos', cancelText: 'Cancelar'
        }).then(function(ok) { if (ok) aplicar(true); });
        return;
    }
    aplicar(false);
}

/** Acciones secundarias de la tarjeta. */
function tpWeekCardMenu(weekIdx, itemIdx) {
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan || !plan.items[itemIdx]) return;
    var item = plan.items[itemIdx];
    var body = '<div class="tp-week-movebox">' +
        '<p class="tp-week-movehint">' + (item.desc || '') + '</p>' +
        '<button class="tp-week-movebtn" onclick="document.getElementById(\'globalModal\').remove();tpDuplicateItem(' + weekIdx + ',' + itemIdx + ')">' +
          '<span class="tp-week-movebtn-day">⧉ Otra unidad igual</span>' +
          '<span class="tp-week-movebtn-sub">Un SEGUNDO vehículo de esta misma configuración en la semana</span></button>' +
        '<button class="tp-week-movebtn" onclick="document.getElementById(\'globalModal\').remove();tpWeekMoveMenu(' + weekIdx + ',' + itemIdx + ')">' +
          '<span class="tp-week-movebtn-day">↪ Mover a otro día</span></button>' +
        '<button class="tp-week-movebtn" onclick="document.getElementById(\'globalModal\').remove();tpLinkVehicleMenu(' + weekIdx + ',' + itemIdx + ')">' +
          '<span class="tp-week-movebtn-day">🔗 Vincular con una prueba</span>' +
          '<span class="tp-week-movebtn-sub">Las pruebas de la semana, por VIN</span></button>' +
        '<button class="tp-week-movebtn" onclick="document.getElementById(\'globalModal\').remove();tpOpenSubstituteModal(' + weekIdx + ',' + itemIdx + ')">' +
          '<span class="tp-week-movebtn-day">🔄 Sustituir</span>' +
          '<span class="tp-week-movebtn-sub">Misma familia, misma norma o misma región</span></button>' +
        '<button class="tp-week-movebtn tp-week-movebtn--danger" onclick="document.getElementById(\'globalModal\').remove();tpRemoveWeeklyItem(' + weekIdx + ',' + itemIdx + ')">' +
          '<span class="tp-week-movebtn-day">🗑 Quitar del plan</span></button>';
    if (Array.isArray(item.moves) && item.moves.length) {
        body += '<div class="tp-week-moves"><strong>Movimientos</strong>' +
                item.moves.slice().reverse().map(function(m) {
                    return '<div>' + (TP_DAY_LABELS[m.from] || '—') + ' → ' + (TP_DAY_LABELS[m.to] || '—') +
                           ' · ' + String(m.at || '').slice(0, 10) + (m.by ? ' · ' + m.by : '') + '</div>';
                }).join('') + '</div>';
    }
    body += '</div>';
    showModal({ title: '⋯ Acciones', type: 'info', body: body, buttons: [{ label: 'Cerrar', cls: '' }] });
}

// ═══ WEEKLY PLAN TAB ═══
/**
 * El `<select>` de configuraciones eran 173 opciones PLANAS con el `desc` completo
 * (58-84 caracteres): imposible de recorrer. Se agrupa por familia — la misma
 * `tpFamilyKeyForCfg` que usa todo lo demás — y cada opción muestra solo lo que la
 * distingue dentro de su grupo.
 */
function tpBuildPickOptgroupsHTML(descs) {
    var porFamilia = {};
    (descs || []).forEach(function(d) {
        var c = (tpState.planData || []).find(function(p) { return p.desc === d; });
        if (!c) { (porFamilia['(sin catálogo)'] = porFamilia['(sin catálogo)'] || []).push({ desc: d, etiqueta: d }); return; }
        var fam = tpConfigShortName(c) + ' · ' + (c.rgn || '?');
        (porFamilia[fam] = porFamilia[fam] || []).push({ desc: d, etiqueta: tpConfigVariantTag(c) || d, cfg: c });
    });
    return Object.keys(porFamilia).sort().map(function(fam) {
        return '<optgroup label="' + fam + '">' + porFamilia[fam].map(function(o) {
            // El `desc` completo va en data-full para que el buscador empate por
            // cualquier campo, no solo por lo que se ve.
            return '<option value="' + o.desc + '" data-full="' + o.desc.toLowerCase() + '">' + o.etiqueta + '</option>';
        }).join('') + '</optgroup>';
    }).join('');
}

/** Buscador del selector. Oculta opciones y los grupos que se quedan vacíos. */
function tpFilterPickOptions(q, selectId) {
    var sel = document.getElementById(selectId || 'tp-manual-pick-select');
    if (!sel) return;
    var t = String(q || '').trim().toLowerCase();
    var terminos = t ? t.split(/\s+/) : [];
    Array.prototype.forEach.call(sel.querySelectorAll('optgroup'), function(g) {
        var visibles = 0;
        Array.prototype.forEach.call(g.querySelectorAll('option'), function(o) {
            var texto = (o.getAttribute('data-full') || o.value || '').toLowerCase() + ' ' + g.label.toLowerCase();
            var ok = terminos.every(function(x) { return texto.indexOf(x) !== -1; });
            o.hidden = !ok;
            if (ok) visibles++;
        });
        g.hidden = visibles === 0;
    });
}

/**
 * Índice compacto de semanas. Antes aquí venían ~90 líneas de HTML con TODO el plan
 * desglosado por día — el bloque que salía "hasta el mero fondo". Ese trabajo ahora
 * lo hace el tablero de Mi semana; esto solo enlaza.
 */
function tpBuildWeekIndexHTML() {
    var planes = (tpState.weeklyPlans || []).slice().reverse().slice(0, 8);
    if (!planes.length) return '';
    var h = '<div class="tp-card"><div class="tp-card-title"><span>🗂 Semanas generadas</span>' +
            '<button class="tp-btn tp-btn-ghost" onclick="tpSwitchTab(\'tp-myweek\')" style="font-size: var(--fs-xs);">📅 Abrir Mi semana</button></div>' +
            '<p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">El detalle de cada semana (días, tarjetas, mover, sustituir) vive en <strong>Mi semana</strong>.</p>' +
            '<div class="tp-week-index">';
    // v20.10: cuántos planes hay por semana — "Generar" deja uno nuevo cada vez, así que
    // una semana puede acumular el aceptado + varias propuestas viejas. Se avisa y se
    // ofrece borrarlas: antes no había NINGUNA forma de hacerlo desde la app
    // (tpDeleteWeeklyPlan existía pero no estaba expuesta en ninguna pantalla).
    var _porSemana = {};
    (tpState.weeklyPlans || []).forEach(function(p) {
        if (p && p.weekDate) _porSemana[p.weekDate] = (_porSemana[p.weekDate] || 0) + 1;
    });

    planes.forEach(function(w) {
        var idx = tpState.weeklyPlans.indexOf(w);
        var items = w.items || [];
        var hechas = items.filter(function(i) { return i.completed; }).length;
        var pct = items.length ? Math.round(hechas / items.length * 100) : 0;
        var dupe = !w.accepted && w.weekDate && _porSemana[w.weekDate] > 1;
        // div, no <button>: lleva un <button> real anidado (borrar) y un botón no puede
        // contener otro. a11yClickables() le da el rol y el teclado (patrón de v20.5).
        h += '<div class="tp-week-index-row' + (dupe ? ' tp-week-index-row--dupe' : '') + '" onclick="window._tpBoardWeek=' +
             (w.weekDate ? "'" + w.weekDate + "'" : 'null') + ';tpSwitchTab(\'tp-myweek\')">' +
             '<span class="tp-week-index-date">' + (w.weekDate || String(w.created || '').slice(0, 10)) + '</span>' +
             '<span class="tp-week-index-tag">' + (w.accepted ? '✔ Aceptado' : '⏳ Propuesta') + '</span>' +
             '<span class="tp-week-index-n">' + hechas + '/' + items.length + ' · ' + pct + '%</span>' +
             '<span class="tp-week-index-bal">' + tpWeekRegionBalance(items) + '</span>' +
             (w.accepted ? '' :
                '<button type="button" class="tp-week-index-del" title="Eliminar esta propuesta" ' +
                'aria-label="Eliminar la propuesta del ' + (w.weekDate || '') + '" ' +
                'onclick="event.stopPropagation();tpDeleteWeeklyPlan(' + idx + ')">🗑</button>') +
             '</div>';
    });
    h += '</div>';

    var _dups = Object.keys(_porSemana).filter(function(k) { return _porSemana[k] > 1; });
    if (_dups.length) {
        h += '<p class="tp-week-index-note">⚠️ ' + _dups.length + ' semana(s) con más de un plan (cada "Generar" crea uno nuevo). ' +
             'El tablero y el Gantt usan el aceptado — o la propuesta más reciente si no hay ninguno aceptado — ' +
             'pero conviene borrar las propuestas que ya no sirven con 🗑.</p>';
    }
    if ((tpState.weeklyPlans || []).length > 8) {
        h += '<p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:6px;">Se muestran las 8 más recientes de ' +
             tpState.weeklyPlans.length + '.</p>';
    }
    return h + '</div>';
}

/** Generar te lleva al tablero: generar no debe dejarte en el formulario. */
function tpGenerateAndOpen() {
    var antes = (tpState.weeklyPlans || []).length;
    tpGenerateWeekly();
    var nuevo = (tpState.weeklyPlans || [])[tpState.weeklyPlans.length - 1];
    if ((tpState.weeklyPlans || []).length > antes && nuevo) {
        window._tpBoardWeek = nuevo.weekDate || null;
        tpBoardInvalidate();
        tpSwitchTab('tp-myweek');
    }
}

function tpRenderWeekly(el) {
    if (!tpState.weeklyPlans) tpState.weeklyPlans = [];
    const plans = tpState.weeklyPlans;
    const manualPicks = window._tpWeeklyManualPicks || [];
    const allConfigs = tpState.planData.map(c => c.desc).sort();

    // Get top suggested configs (highest priority with deficit, excluding already picked)
    const analysis = tpState.planData.length > 0 ? tpGetAnalysis() : [];
    const pickedSet = new Set(manualPicks);
    const suggested = analysis.filter(c => c.deficit > 0 && !pickedSet.has(c.desc)).slice(0, 3);
    // Build the remaining list for the select (exclude suggested)
    const suggestedSet = new Set(suggested.map(s => s.desc));
    const restConfigs = allConfigs.filter(c => !suggestedSet.has(c));

    // v16.4: el backlog ya no es "los pendientes del último plan aceptado" (una ventana de una
    // semana, que además perdía el excedente) sino la cola real con antigüedad.
    const backlog = tpBacklog();
    const dismissedList = Object.keys(tpState.carryoverDismissed || {});
    // Default week start to next Monday
    const _defDate = new Date();
    const _dow = _defDate.getDay();
    const _nextMon = new Date(_defDate);
    _nextMon.setDate(_defDate.getDate() + ((_dow === 0 ? 1 : _dow === 6 ? 2 : 8 - _dow)));
    const _defDateStr = localDateStr(_nextMon);
    // Persisted working days or default (Mon-Fri)
    const _workDays = window._tpWorkDays || {dom:false, lun:true, mar:true, mie:true, jue:true, vie:true, sab:false};
    const _cap = tpWeekCapacity(_workDays);
    const _room = Math.max(0, _cap.max - manualPicks.length);

    el.innerHTML = `
    ${tpBuildFocusChipsHTML()}
    <div class="tp-card" style="border:2px solid var(--tp-amber);background:linear-gradient(135deg,rgba(245,158,11,0.05),transparent);">
        <div class="tp-card-title"><span style="font-size:15px;">🎛️ Armar la semana</span></div>
        <p style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom:10px;">Decide CÓMO se elige; a la derecha ves en vivo QUÉ se propondría. Cuando te convenza, genera — y te lleva directo al tablero de Mi semana.</p>

        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;">
            <div>
                <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:3px;">Semana del</label>
                <input type="date" id="tp-weekly-date" value="${window._tpWeekDate || _defDateStr}" class="tp-select" style="width:150px;font-size: var(--fs-sm);" onchange="window._tpWeekDate=this.value;">
            </div>
            <div>
                <label for="tp-weekly-cap" style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:3px;">Capacidad</label>
                <input type="number" id="tp-weekly-cap" value="${Math.min(window._tpWeekCap || _cap.max, _cap.max)}" min="1" max="${_cap.max}" class="tp-select" style="width:65px;text-align:center;" onchange="window._tpWeekCap=parseInt(this.value);tpRender();">
            </div>
            <div>
                <label for="tp-veh-per-slot" style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:3px;">Veh. por par</label>
                <input type="number" id="tp-veh-per-slot" value="${_cap.perSlot}" min="1" max="10" class="tp-select" style="width:65px;text-align:center;" onchange="tpSetVehiclesPerSlot(this.value);">
            </div>
            <button class="tp-btn tp-btn-primary" onclick="tpGenerateAndOpen()" style="font-size:12px;padding:8px 14px;background:var(--tp-amber);color:#000;font-weight:700;" title="Genera el plan y abre el tablero de Mi semana">🚀 Generar y abrir Mi semana</button>
            <button class="tp-btn tp-btn-primary" onclick="tpSmartGenerate()" style="font-size:12px;padding:8px 14px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:700;" title="Genera plan optimo con validacion de inventario y carryover automatico">⚡ Smart</button>
            <button class="tp-btn tp-btn-primary" onclick="tpGenerateMonthly()" style="font-size:12px;padding:8px 14px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-weight:700;" title="Genera 4 semanas de una vez distribuyendo los déficits de mayor prioridad">📅 Generar Mes</button>
        </div>

        <details class="tp-workdays" ${window._tpWorkDaysOpen ? 'open' : ''} ontoggle="window._tpWorkDaysOpen=this.open;">
            <summary>🗓 Días de asistencia · <strong>${_cap.slots} par(es)</strong> · máximo ${_cap.max} prueba(s) · reposo ${_cap.soakHours} h</summary>
            <p style="font-size: var(--fs-xs);color:var(--tp-dim);margin:6px 0;">Selecciona los días que asistirás. El hueco entre preacondicionar y probar sale de las <strong>horas de reposo</strong> reales (${_cap.soakHours} h → ${_cap.gapDays} día(s)), no de un supuesto fijo.${_cap.spill && _cap.spill.length ? ' Con este reposo, preacondicionar en ' + _cap.spill.map(function(d){return TP_DAY_LABELS[d];}).join(' o ') + ' deja la prueba para la semana siguiente.' : ''}</p>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${['dom','lun','mar','mie','jue','vie','sab'].map((d,i) => {
                    const labels = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
                    const checked = _workDays[d] ? 'checked' : '';
                    return `<label style="display:flex;align-items:center;gap:3px;font-size: var(--fs-xs);color:var(--tp-text);cursor:pointer;padding:4px 8px;border:1px solid var(--tp-border);border-radius:6px;background:${_workDays[d]?'rgba(59,130,246,0.1)':'transparent'};">
                        <input type="checkbox" ${checked} onchange="if(!window._tpWorkDays)window._tpWorkDays={dom:false,lun:true,mar:true,mie:true,jue:true,vie:true,sab:false};window._tpWorkDays['${d}']=this.checked;tpRender();" style="accent-color:var(--tp-blue);">
                        ${labels[i]}
                    </label>`;
                }).join('')}
            </div>
            <div style="margin-top:6px;font-size: var(--fs-xs);color:var(--tp-dim);" id="tp-schedule-preview">
                ${tpBuildSchedulePreview(_workDays)}
            </div>
        </details>

    </div>

    <!-- [v20] La selección de configuraciones baja a la columna IZQUIERDA. Antes vivía
         arriba, dentro del bloque de "Generar", y empujaba la propuesta en vivo hasta
         y=1116 — fuera de pantalla en cualquier laptop. Ahora la propuesta arranca a la
         altura de las perillas y, siendo sticky, ya no se pierde al bajar. -->
    <div class="tp-planner-grid">
        <div class="tp-planner-controls">
        ${backlog.length > 0 ? `
        <div style="padding:8px 10px;background:rgba(139,92,246,0.05);border-radius:8px;border:1px solid rgba(139,92,246,0.3);margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;flex-wrap:wrap;gap:4px;">
                <div style="font-size: var(--fs-xs);font-weight:700;color:#8b5cf6;" data-help="tpBacklog">🔄 Pendientes de semanas anteriores (${backlog.length})</div>
                <div style="display:flex;gap:4px;">
                    <button class="tp-btn tp-btn-primary" onclick="tpLoadCarryoverPicks()" style="font-size: var(--fs-xs);background:#8b5cf6;" ${_room === 0 ? 'disabled' : ''}>Incluir las que quepan (${_room})</button>
                    ${typeof authCan === 'function' && authCan('plan.manage') ? '<button class="tp-btn tp-btn-ghost" onclick="tpClearCarryover()" style="font-size: var(--fs-xs);color:var(--tp-red);" title="Sacarlas de la cola sin tocar la cobertura">🧹 Limpiar</button>' : ''}
                </div>
            </div>
            <p style="font-size: var(--fs-xs);color:var(--tp-dim);margin:0 0 6px;">Caben <b>${_cap.max}</b> pruebas esta semana (${_cap.slots} par(es) × ${_cap.perSlot}). Lo que no entra se queda en la cola y sube de prioridad cada semana que pasa.</p>
            <div style="display:flex;flex-direction:column;gap:3px;">
            ${backlog.slice(0, window._tpBacklogExpanded ? backlog.length : 8).map(b => {
                const c = b.cfg;
                const isAlreadyPicked = manualPicks.includes(b.desc);
                const esc = b.desc.replace(/'/g,"\\'");
                return `<div style="display:flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.2);border-radius:5px;flex-wrap:wrap;opacity:${isAlreadyPicked?0.5:1};">
                    <span style="font-size: var(--fs-xs);color:#8b5cf6;flex-shrink:0;" title="Semanas arrastrada">🔄 ${b.weeksCarried} sem</span>
                    ${tpConfigBadges(c,{fontSize:'var(--fs-xs)'})}
                    <span style="margin-left:auto;display:flex;gap:4px;align-items:center;flex-shrink:0;">
                    ${isAlreadyPicked ? '<span style="font-size: var(--fs-xs);color:var(--tp-green);">incluido</span>' : `<button onclick="if(!window._tpWeeklyManualPicks)window._tpWeeklyManualPicks=[];if(!window._tpWeeklyManualPicks.includes('${esc}'))window._tpWeeklyManualPicks.push('${esc}');tpRender();" style="background:none;border:none;color:#8b5cf6;cursor:pointer;font-size:12px;" title="Agregar a esta semana">+</button>`}
                    ${typeof authCan === 'function' && authCan('plan.manage') ? `<button onclick="tpDismissCarryover('${esc}')" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size: var(--fs-sm);" title="Sacar de la cola (no cuenta como probada)">✕</button>` : ''}
                    </span>
                </div>`;
            }).join('')}
            </div>
            ${backlog.length > 8 ? `<button class="tp-btn tp-btn-ghost" onclick="window._tpBacklogExpanded=${window._tpBacklogExpanded?'false':'true'};tpRender();" style="font-size: var(--fs-xs);margin-top:5px;width:100%;">${window._tpBacklogExpanded ? 'Ver menos' : 'Ver las ' + backlog.length + ' →'}</button>` : ''}
        </div>` : ''}
        ${dismissedList.length > 0 ? `
        <details style="margin-bottom:12px;">
            <summary style="font-size: var(--fs-xs);color:var(--tp-dim);cursor:pointer;padding:4px 0;">Descartadas (${dismissedList.length}) — siguen contando como déficit</summary>
            <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px;">
            ${dismissedList.map(d => {
                const info = tpState.carryoverDismissed[d] || {};
                const esc = d.replace(/'/g,"\\'");
                return `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:var(--tp-card);border:1px solid var(--tp-border);border-radius:5px;flex-wrap:wrap;">
                    <span style="font-size: var(--fs-xs);color:var(--tp-text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;">${d}</span>
                    <span style="font-size: var(--fs-xs);color:var(--tp-dim);">${info.by || '?'}${info.at ? ' · ' + new Date(info.at).toLocaleDateString('es-MX') : ''}</span>
                    ${typeof authCan === 'function' && authCan('plan.manage') ? `<button onclick="tpRestoreCarryover('${esc}')" style="background:none;border:none;color:var(--tp-blue);cursor:pointer;font-size: var(--fs-xs);">restaurar</button>` : ''}
                </div>`;
            }).join('')}
            </div>
        </details>` : ''}
        <div style="padding:10px;background:var(--tp-card);border-radius:8px;border:1px solid var(--tp-border);">
            <div style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-amber);margin-bottom:5px;">📌 Pruebas obligatorias</div>
            ${suggested.length > 0 ? `
            <div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:4px;">⚡ Sugeridas (mayor prioridad):</div>
            <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px;">
                ${suggested.map(s => `
                <div onclick="if(!window._tpWeeklyManualPicks)window._tpWeeklyManualPicks=[];if(!window._tpWeeklyManualPicks.includes('${s.desc.replace(/'/g,"\\'")}'))window._tpWeeklyManualPicks.push('${s.desc.replace(/'/g,"\\'")}');tpRender();" style="display:flex;align-items:center;gap:4px;padding:5px 8px;background:rgba(245,158,11,0.04);border:1px dashed rgba(245,158,11,0.3);border-radius:6px;cursor:pointer;flex-wrap:wrap;transition:background 0.15s;" onmouseover="this.style.background='rgba(245,158,11,0.12)'" onmouseout="this.style.background='rgba(245,158,11,0.04)'">
                    <span style="font-size: var(--fs-xs);flex-shrink:0;">⚡</span>
                    ${tpConfigBadges(s,{fontSize:'var(--fs-xs)'})}
                    <span style="font-size: var(--fs-xs);color:var(--tp-red);margin-left:auto;flex-shrink:0;white-space:nowrap;">deficit ${s.deficit}</span>
                    <span style="font-size: var(--fs-xs);color:var(--tp-amber);flex-shrink:0;">+</span>
                </div>`).join('')}
            </div>` : ''}
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">
                <input type="search" id="tp-manual-pick-search" class="tp-select" placeholder="Filtrar (modelo, motor, región…)"
                       style="flex:1;min-width:150px;font-size: var(--fs-xs);" oninput="tpFilterPickOptions(this.value)">
                <select id="tp-manual-pick-select" class="tp-select" style="flex:2;min-width:200px;font-size: var(--fs-xs);">
                    <option value="">Seleccionar...</option>
                    ${suggested.length > 0 ? `<optgroup label="⚡ Sugeridas">${suggested.map(s => `<option value="${s.desc}">${s.desc}</option>`).join('')}</optgroup>` : ''}
                    ${tpBuildPickOptgroupsHTML(restConfigs)}
                </select>
                <button class="tp-btn tp-btn-primary" onclick="tpAddManualPick()" style="font-size: var(--fs-xs);">+</button>
            </div>
            ${manualPicks.length > 0 ? `<div style="display:flex;flex-direction:column;gap:4px;">${manualPicks.map((p,i) => {
                const _pc = tpState.planData.find(c => c.desc === p);
                return `<div style="display:flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:6px;flex-wrap:wrap;">
                    <span style="font-size: var(--fs-xs);color:var(--tp-amber);flex-shrink:0;">📌</span>
                    ${_pc ? tpConfigBadges(_pc,{fontSize:'var(--fs-xs)'}) : '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">' + (p.length>40?p.slice(0,40)+'...':p) + '</span>'}
                    <button onclick="window._tpWeeklyManualPicks.splice(${i},1);tpRender();" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size:12px;padding:0 2px;margin-left:auto;">×</button>
                </div>`;
            }).join('')}</div>` : '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Ninguna — el algoritmo decidirá.</div>'}
        </div>

            ${tpBuildPriorityKnobsHTML({ onInput: '_tpDebouncedPreview()', openRegions: !!window._tpOpenRegions })}
            ${tpBuildCarryoverPanelHTML()}
            ${tpBuildWeekFilterHTML()}
        </div>
        <div class="tp-planner-side">
            <div class="tp-card">
                <div class="tp-card-title" data-help="tp-preview-help"><span>🔮 Propuesta en vivo</span></div>
                <p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Esto es exactamente lo que crearía "Generar" ahora mismo. Se actualiza al mover cualquier control.</p>
                <div id="tp-planner-preview"></div>
                <p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:10px;border-top:1px solid var(--tp-border);padding-top:6px;">
                    Nota: "📅 Mes" usa solo el déficit — no la cola ni estos filtros.</p>
            </div>
        </div>
    </div>

    ${tpBuildWeekIndexHTML()}`;

    // v20.10: las filas del índice de semanas son <div onclick> (llevan el botón 🗑
    // anidado), así que necesitan el rol y el teclado — mismo patrón que el tablero.
    if (typeof a11yClickables === 'function') a11yClickables(el);

    // Primer pintado de la propuesta: doble RAF porque tpRenderWeekly ya corre dentro
    // del requestAnimationFrame de tabCacheSwitch — el nodo aún no está en pantalla.
    requestAnimationFrame(function() {
        requestAnimationFrame(function() { tpRenderPlannerPreview(); });
    });
}

function tpScoreBadge(item) {
    if (!item._scoreDetail) return '';
    var d = item._scoreDetail;
    var color = d.deficit >= 3 ? 'var(--tp-red)' : d.deficit >= 1 ? 'var(--tp-amber)' : 'var(--tp-green)';
    var icon = d.deficit >= 3 ? '🔴' : d.deficit >= 1 ? '🟡' : '🟢';
    var lastStr = d.lastTested ? ' | Ultimo: ' + d.lastTested : '';
    return '<span style="font-size: var(--fs-xs);padding:1px 5px;border-radius:3px;background:' + color + '15;color:' + color + ';border:1px solid ' + color + '30;flex-shrink:0;cursor:help;" title="Score: ' + (d.score||0).toFixed(1) + ' | Deficit: ' + d.deficit + lastStr + ' | ' + d.reason + '">' + icon + ' D:' + d.deficit + ' S:' + (d.score||0).toFixed(1) + '</span>';
}

// Renders the "Iniciar test" button shown on each weekly-plan item
// (hidden while the week is in edit mode or the item is already completed).
function tpStartTestButton(weekIdx, itemIdx, item, isEdit) {
    if (isEdit || item.completed) return '';
    return '<button onclick="tpStartTestFromPlan(' + weekIdx + ',' + itemIdx + ')" ' +
        'class="tp-btn tp-btn-primary" ' +
        'style="font-size: var(--fs-xs);padding:3px 8px;white-space:nowrap;" ' +
        'title="Abre Alta de COP15 con esta configuración precargada">' +
        '▶ Iniciar test</button>';
}

// Kick off a test for a planned configuration. Stores a preload payload
// and jumps to COP15 → Alta, where cop15PreloadFromPlan() fills the form.
function tpStartTestFromPlan(weekIdx, itemIdx) {
    if (!tpState.weeklyPlans || !tpState.weeklyPlans[weekIdx]) return;
    var item = tpState.weeklyPlans[weekIdx].items[itemIdx];
    if (!item) return;

    window._pendingCop15Preload = {
        source: 'weekly-plan',
        weekIdx: weekIdx,
        itemIdx: itemIdx,
        configCode: item.desc || '',
        purpose: tpPurposeForRegion(item.rgn), // default por región (COP solo Europa); el usuario puede cambiarlo
        planItem: {
            desc: item.desc,
            mod: item.mod || '', my: item.my || '', eng: item.eng || '',
            tx: item.tx || '', reg: item.reg || '', ep: item.ep || '',
            rgn: item.rgn || '', drv: item.drv || '', body: item.body || '',
            tire: item.tire || '', engpkg: item.engpkg || ''
        }
    };

    if (typeof showToast === 'function') {
        showToast('Abriendo Alta con configuración precargada…', 'info');
    }

    // Switch platform to COP15, then to the Alta tab, then apply preload.
    if (typeof switchPlatform === 'function') {
        switchPlatform('cop15');
    }
    setTimeout(function () {
        var altaTab = document.querySelector('#platform-cop15 .tab[data-tab="alta"]');
        if (altaTab) altaTab.click();
        setTimeout(function () {
            if (typeof cop15PreloadFromPlan === 'function') {
                cop15PreloadFromPlan(window._pendingCop15Preload);
            }
        }, 120);
    }, 150);
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v20] LA PALOMITA MANUAL, DURABLE Y HONESTA
//
// Antes `tpToggleWeeklyItem` solo escribía `item.completed` DENTRO del plan y nunca
// tocaba `testedList`. Borrar el plan se llevaba la palomita: la única prueba de que
// alguien declaró "esto ya se hizo" desaparecía, y la configuración volvía a
// proponerse la semana siguiente. Ésa fue la pérdida real que reportó el laboratorio.
//
// Ahora la palomita deja un registro propio en `testedList`, marcado como DECLARADO
// (`source:'plan-manual'`, `verified:false`) — nunca disfrazado de liberación real.
//
// `verified` es OPT-OUT a propósito: su AUSENCIA significa verificada. Así las ~500
// filas que ya existen no necesitan migración y un pull desde código viejo no las
// degrada. Barato, a prueba de sync, sin migración.
// ═══════════════════════════════════════════════════════════════════════════════

var TP_DECLARED_NOTE = 'Declarada en el plan — sin vehículo liberado';

/** ¿Esta fila de `testedList` es evidencia real o una declaración a mano? */
function tpTestedIsDeclared(t) { return !!(t && t.verified === false); }

/** ¿Hay evidencia REAL (liberación) de esa config dentro de la semana del plan? */
function _tpHasVerifiedInWeek(plan, desc) {
    var d0 = plan && plan.weekDate;
    if (!d0) return false;
    var fin = new Date(d0 + 'T00:00:00');
    if (isNaN(fin.getTime())) return false;
    fin.setDate(fin.getDate() + 6);
    var d1 = (typeof _tpFmtDate === 'function') ? _tpFmtDate(fin) : d0;
    return (tpState.testedList || []).some(function(t) {
        return t && t.configText === desc && !tpTestedIsDeclared(t) && t.date >= d0 && t.date <= d1;
    });
}

/** Escribe la declaración. Idempotente por planId+itemIdx. */
function _tpDeclareTested(plan, item, itemIdx) {
    if (!Array.isArray(tpState.testedList)) tpState.testedList = [];
    var pid = tpPlanId(plan);
    var ya = tpState.testedList.some(function(t) {
        return t && t.planId === pid && t.itemIdx === itemIdx && tpTestedIsDeclared(t);
    });
    if (ya) return false;
    tpState.testedList.push({
        configText: item.desc,
        date: (typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0, 10),
        note: TP_DECLARED_NOTE,
        source: 'plan-manual',
        verified: false,
        planId: pid,
        itemIdx: itemIdx,
        by: (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : ''
    });
    return true;
}

/**
 * Retira la declaración. Empata por planId+itemIdx, NUNCA por `desc`: dos semanas
 * distintas comparten descripción y despalomear una borraría la otra.
 */
function _tpUndeclareTested(plan, itemIdx) {
    if (!Array.isArray(tpState.testedList)) return false;
    var pid = tpPlanId(plan);
    var antes = tpState.testedList.length;
    tpState.testedList = tpState.testedList.filter(function(t) {
        return !(t && t.planId === pid && t.itemIdx === itemIdx && tpTestedIsDeclared(t));
    });
    return tpState.testedList.length < antes;
}

function tpToggleWeeklyItem(weekIdx, itemIdx) {
    if (!tpState.weeklyPlans || !tpState.weeklyPlans[weekIdx]) return;
    const plan = tpState.weeklyPlans[weekIdx];
    const item = plan.items[itemIdx];
    if (!item) return;
    tpEnsurePlanIds();
    item.completed = !item.completed;
    item.completedDate = item.completed ? new Date().toISOString() : null;

    if (item.completed) {
        // Si YA hay evidencia real de esa config dentro de la semana del plan, la
        // palomita solo confirma lo que existe: no se declara nada y no se cuenta
        // doble. `declared` es lo que distingue una cosa de la otra, y viaja a la
        // foto archivada (_tpWeekHistoryEntry ya lo lee).
        item.declared = !_tpHasVerifiedInWeek(plan, item.desc);
        if (item.declared) _tpDeclareTested(plan, item, itemIdx);
        // NO se llama a tpAutoMarkWeeklyCompletion: palomear ESTE item no debe
        // acreditar de rebote el mismo `desc` en otra semana. Una prueba, un item.
        if (typeof auditLog === 'function') {
            auditLog('tp', item.declared ? 'week_item_declared' : 'week_item_checked',
                     { type: 'plan', label: item.desc },
                     'Semana del ' + (plan.weekDate || '—') + (item.declared ? ' · declarada a mano, sin vehículo liberado' : ''));
        }
    } else {
        var quitada = _tpUndeclareTested(plan, itemIdx);
        delete item.declared;
        if (typeof auditLog === 'function') {
            auditLog('tp', 'week_item_unchecked', { type: 'plan', label: item.desc },
                     'Semana del ' + (plan.weekDate || '—') + (quitada ? ' · se retiró la declaración' : ''));
        }
    }

    // Obligatorio: la clave del cache de tpGetAnalysis es (nº configs, nº probadas,
    // última fecha) — palomear y despalomear el mismo día la deja idéntica.
    tpInvalidateCache();
    _tpTouchPlan(weekIdx);
    tpRender(); tpUpdateBadges();
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  PLAN DE RECUPERACIÓN — capacidad restante × prioridad × deadlines    ║
// ╚══════════════════════════════════════════════════════════════════════╝

// Reglas de prioridad por defecto (editables en la pestaña Recuperación).
// Esquema corporativo: P1 = EU COP (Euro6e); P2 = COP Euro5~Euro6d; P3 = US CL4 1.6/2.0.
// (PVV standardization se omite por indicación del usuario.)
function tpDefaultPriorityRules() {
    return [
        { id:'p1eu7',  tier:1, region:'EUROPE', regulation:'PRE-EURO 7', modelMatch:'',    engMatch:'',     label:'P1 · EU COP (Pre-Euro7/Euro6e)' },
        { id:'p1eu',   tier:1, region:'EUROPE', regulation:'*',          modelMatch:'',    engMatch:'',     label:'P1 · EU COP (Europa)' },
        { id:'p2e5',   tier:2, region:'*',      regulation:'EURO-5',     modelMatch:'',    engMatch:'',     label:'P2 · COP Euro5' },
        { id:'p2e6',   tier:2, region:'*',      regulation:'EURO-6C',    modelMatch:'',    engMatch:'',     label:'P2 · COP Euro6' },
        { id:'p3c16',  tier:3, region:'USA',    regulation:'*',          modelMatch:'CL4', engMatch:'1.6',  label:'P3 · US CL4 1.6' },
        { id:'p3c16b', tier:3, region:'USA',    regulation:'*',          modelMatch:'CL4', engMatch:'1600', label:'P3 · US CL4 1600cc' },
        { id:'p3c20',  tier:3, region:'USA',    regulation:'*',          modelMatch:'CL4', engMatch:'2.0',  label:'P3 · US CL4 2.0' },
        { id:'p3c20b', tier:3, region:'USA',    regulation:'*',          modelMatch:'CL4', engMatch:'2000', label:'P3 · US CL4 2000cc' },
        // P4/P5 (v15.8, adaptado del esquema del laboratorio hermano). Nota: P1 EUROPE/* va
        // antes y "primera regla gana" — un Euro-2 europeo sigue siendo P1 (COP UE manda).
        { id:'p4e2',   tier:4, region:'*',      regulation:'EURO-2',     modelMatch:'',    engMatch:'',     label:'P4 · Legacy Euro 2' },
        { id:'p4e3',   tier:4, region:'*',      regulation:'EURO-3',     modelMatch:'',    engMatch:'',     label:'P4 · Legacy Euro 3' },
        { id:'p4e4',   tier:4, region:'*',      regulation:'EURO-4',     modelMatch:'',    engMatch:'',     label:'P4 · Legacy Euro 4' },
        { id:'p5ev1',  tier:5, region:'*',      regulation:'120V',       modelMatch:'',    engMatch:'',     label:'P5 · EV/Eléctrico (120V)' },
        { id:'p5ev2',  tier:5, region:'*',      regulation:'220V',       modelMatch:'',    engMatch:'',     label:'P5 · EV/Eléctrico (220V)' }
    ];
}

// Migración suave (v15.8): añade las reglas default P4/P5 a estados persistidos, respetando
// personalizaciones — solo si no existe ya el id NI ninguna regla propia en ese tier.
function tpEnsurePriorityRuleDefaults() {
    var rules = tpState.priorityRules;
    if (!rules || !rules.length) return;
    var added = [];
    tpDefaultPriorityRules().forEach(function(d) {
        if (d.tier < 4) return;
        if (rules.some(function(r) { return r.id === d.id; })) return;
        if (rules.some(function(r) { return r.tier === d.tier; })) return; // tier ya personalizado
        rules.push(d); added.push(d.label);
    });
    if (added.length) {
        if (!(parseInt(tpState.maxTiers, 10) >= 5)) tpState.maxTiers = 5;
        tpSave();
        if (typeof auditLog === 'function') auditLog('tp', 'priority_rules_migrated', null, 'Reglas default añadidas: ' + added.join(', '));
    }
}

function _tpNorm(s) { return (s == null ? '' : String(s)).trim().toUpperCase(); }

// Niveles de prioridad configurables (1..10) y su paleta de color.
// [v17.4] Paleta P1..P10 recalculada: la original fallaba contraste AA en 9 de 10 colores
// como relleno con texto blanco encima (usado en la barra de recuperación, tpTierColor()).
// Mismos matices, oscurecidos hasta pasar >=4.5:1 con blanco (ver CHANGELOG v17.4).
var _TP_TIER_COLORS = ['#eb1515', '#9e6506', '#1e6ff5', '#8452f5', '#0b815a', '#e0177a', '#047a8f', '#c35305', '#54820e', '#64748b'];
function tpMaxTiers() { var n = parseInt(tpState.maxTiers, 10); return (isNaN(n) || n < 1) ? 3 : Math.min(n, 10); }
function tpTierColor(t) { return (!t || t < 1) ? 'var(--border-strong)' : _TP_TIER_COLORS[(t - 1) % _TP_TIER_COLORS.length]; }

// v15.8: badge "última prueba" de una familia (verde <30d, ámbar 30-90d, rojo >90d).
function tpLastTestBadge(f) {
    if (!f.lastTestDate) {
        if (!(f.totalRequired > 0)) return '';
        return '<span class="tp-badge" style="background:rgba(148,163,184,0.15);color:var(--muted);font-size: var(--fs-xs);" title="Sin pruebas registradas">⏱ Nunca</span>';
    }
    var d = f.daysSinceTest;
    var color = d < 30 ? 'var(--tp-green)' : d <= 90 ? 'var(--tp-amber)' : 'var(--tp-red)';
    var bg = d < 30 ? 'rgba(34,197,94,0.15)' : d <= 90 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
    var fecha = new Date(f.lastTestDate + 'T12:00:00').toLocaleDateString('es-MX');
    var txt = d === 0 ? 'hoy' : 'hace ' + d + 'd';
    return '<span class="tp-badge" style="background:' + bg + ';color:' + color + ';font-size: var(--fs-xs);font-weight:700;" title="Última prueba: ' + fecha + '">⏱ ' + txt + '</span>';
}
function tpSetMaxTiers(val) {
    var n = parseInt(val, 10);
    tpState.maxTiers = isNaN(n) ? 3 : Math.min(Math.max(n, 1), 10);
    tpSave(); tpRender();
}

// Mapa campo-de-regla -> campo-de-config ('familyMatch' es especial, no está aquí).
var _TP_RULE_FIELDS = { region: 'rgn', regulation: 'reg', modelMatch: 'mod', engMatch: 'eng', bodyMatch: 'body', drvMatch: 'drv' };
// Orden de evaluación / columnas (familia primero, luego atributos).
var _TP_RULE_ALLFIELDS = ['familyMatch', 'region', 'regulation', 'modelMatch', 'engMatch', 'bodyMatch', 'drvMatch'];

// ¿La config cumple la restricción de la regla para un campo? familia = clave exacta; región/regulación = exacto; resto = substring.
function _tpRuleMatchField(cfg, rule, field) {
    if (field === 'familyMatch') {
        var fv = rule.familyMatch;
        if (!fv || fv === '*') return true;
        return tpFamilyKeyForCfg(cfg) === fv;
    }
    var val = rule[field];
    if (!val || val === '*') return true;
    var cv = _tpNorm(cfg[_TP_RULE_FIELDS[field]]);
    if (field === 'region' || field === 'regulation') return cv === _tpNorm(val);
    return cv.indexOf(_tpNorm(val)) !== -1;
}

// Clasifica una config en P1..PN según las reglas (primera coincidencia gana). null = sin prioridad.
function tpClassifyTier(cfg) {
    var rules = tpState.priorityRules || [];
    for (var i = 0; i < rules.length; i++) {
        var r = rules[i], ok = true;
        for (var j = 0; j < _TP_RULE_ALLFIELDS.length; j++) {
            if (!_tpRuleMatchField(cfg, r, _TP_RULE_ALLFIELDS[j])) { ok = false; break; }
        }
        if (ok) return r.tier;
    }
    return null;
}

// Etiqueta legible de la familia (mismo agrupamiento que el dashboard de Familias: tpFamilyKeyForCfg).
function tpFamilyLabel(cfg) {
    var parts = [cfg.mod, cfg.eng, cfg.tx, cfg.my, cfg.reg];
    if (cfg.ep && cfg.ep !== '0') parts.push(cfg.ep);
    if (cfg.engpkg && cfg.engpkg !== '0') parts.push(cfg.engpkg);
    return parts.filter(Boolean).join(' · ');
}

// Cascade: opciones {value,label} para un campo, dado lo ya elegido en los OTROS campos de la regla.
function tpRuleFieldOptions(rule, field) {
    var configs = (tpState.planData || []).filter(function(c) {
        return _TP_RULE_ALLFIELDS.every(function(f) { return f === field ? true : _tpRuleMatchField(c, rule, f); });
    });
    if (field === 'familyMatch') {
        var seen = {}, out = [];
        configs.forEach(function(c) { var k = tpFamilyKeyForCfg(c); if (!seen[k]) { seen[k] = true; out.push({ value: k, label: tpFamilyLabel(c) }); } });
        out.sort(function(a, b) { return a.label < b.label ? -1 : a.label > b.label ? 1 : 0; });
        return out;
    }
    var self = _TP_RULE_FIELDS[field], set = {};
    configs.forEach(function(c) { var v = c[self]; if (v !== undefined && v !== null && v !== '') set[v] = true; });
    return Object.keys(set).sort().map(function(v) { return { value: v, label: v }; });
}

// Pendientes (déficit) clasificados por prioridad, con deadline de familia. Reúsa tpGetAnalysis + tpFamilyOverrideFor.
function tpRecoveryPending() {
    var analysis = tpGetAnalysis();
    var maxT = tpMaxTiers();
    var byTier = { none: [] };
    var totals = { tiers: {}, none: 0, totalDeficit: 0 };
    var t;
    for (t = 1; t <= maxT; t++) { byTier[t] = []; totals.tiers[t] = 0; }
    var maxSeen = maxT;
    analysis.forEach(function(cfg) {
        if (cfg.deficit <= 0) return;
        var tier = tpClassifyTier(cfg);
        if (tier && tier > 0) {
            if (!byTier[tier]) { byTier[tier] = []; totals.tiers[tier] = 0; }
            if (tier > maxSeen) maxSeen = tier;
        } else {
            tier = null;
        }
        var ov = tpFamilyOverrideFor(cfg);
        var item = {
            desc: cfg.desc, mod: cfg.mod, rgn: cfg.rgn, reg: cfg.reg, eng: cfg.eng,
            deficit: cfg.deficit, score: cfg.score, tier: tier,
            familyKey: tpFamilyKeyForCfg(cfg),
            deadline: ov && ov.deadline ? ov.deadline : '',
            daysToDeadline: ov ? ov.days : null,
            criticality: ov ? ov.criticality : 'normal'
        };
        (tier ? byTier[tier] : byTier.none).push(item);
        if (tier) totals.tiers[tier] += cfg.deficit; else totals.none += cfg.deficit;
        totals.totalDeficit += cfg.deficit;
    });
    function ord(a, b) {
        var aHas = a.daysToDeadline !== null && a.deadline, bHas = b.daysToDeadline !== null && b.deadline;
        if (aHas && bHas && a.daysToDeadline !== b.daysToDeadline) return a.daysToDeadline - b.daysToDeadline;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return b.score - a.score;
    }
    var tiers = [];
    for (t = 1; t <= maxSeen; t++) { if (!byTier[t]) { byTier[t] = []; totals.tiers[t] = 0; } tiers.push(t); }
    Object.keys(byTier).forEach(function(k) { byTier[k].sort(ord); });
    return { byTier: byTier, totals: totals, tiers: tiers };
}

// Lunes (Date) de la semana que contiene a d.
function _tpMonday(d) {
    var dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = dt.getDay();              // 0=Dom .. 6=Sab
    dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
    return dt;
}
function _tpFmtDate(dt) {
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

// Deadline más lejano (global + por familia) para extender el horizonte; null si no hay.
function tpRecoveryHorizonEnd() {
    var dates = [];
    if (tpState.recoveryUntil) dates.push(tpState.recoveryUntil);
    if (tpState.deadline) dates.push(tpState.deadline);
    var fo = tpState.familyOverrides || {};
    Object.keys(fo).forEach(function(k) { if (fo[k] && fo[k].deadline) dates.push(fo[k].deadline); });
    if (!dates.length) return new Date().getFullYear() + '-12-31'; // por defecto: hasta fin del año en curso
    dates.sort();
    return dates[dates.length - 1];
}

var _TP_DEFAULT_WD = { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };

// Lista de semanas (lunes) desde fromDate hasta el horizonte, con disponibilidad/capacidad resueltas.
function tpRecoveryWeeks(fromDate) {
    var start = _tpMonday(fromDate || new Date());
    var endMon = _tpMonday(new Date(tpRecoveryHorizonEnd() + 'T12:00:00'));
    var nWeeks = Math.floor((endMon - start) / (7 * 86400000)) + 1;
    nWeeks = Math.min(Math.max(nWeeks, 1), 60);
    var dayKeys = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
    var weeks = [];
    for (var i = 0; i < nWeeks; i++) {
        var mon = new Date(start); mon.setDate(start.getDate() + i * 7);
        var key = _tpFmtDate(mon);
        var av = (tpState.weekAvailability || {})[key] || {};
        var available = av.available !== false;                 // default disponible
        var workDays = av.workDays || _TP_DEFAULT_WD;
        var attendDays = dayKeys.filter(function(d) { return workDays[d]; }).length;
        var slots = tpBuildTestSlots(workDays).length;
        var capNum = (av.capacity !== undefined && av.capacity !== null) ? av.capacity : (tpState.capacity || 8);
        // v20: el tope físico es el nº de pares preacon→prueba que caben en la semana, por los
        // vehículos que caben en cada par. ANTES effCap usaba capNum a secas e IGNORABA `slots`,
        // así que con lun-vie (4 pares × 1 veh) Recuperación agendaba 8 donde caben 4 — el doble.
        // Es el mismo tope que tpWeekCapacity ya aplica en el plan semanal desde v16.4.
        var _perSlot = Math.max(1, parseInt(tpState.vehiclesPerSlot, 10) || 1);
        var capFisica = slots * _perSlot;
        var effCap = available ? Math.max(0, Math.min(capNum, capFisica)) : 0;
        weeks.push({ monday: key, mondayDate: mon, available: available, capacity: capNum, slots: slots, attendDays: attendDays, workDays: workDays, effCap: effCap, note: av.note || '' });
    }
    return weeks;
}

// Motor: asigna los pendientes (P1→P3, urgencia de deadline, score) a las semanas disponibles.
function tpBuildRecoveryPlan() {
    var pend = tpRecoveryPending();
    var weeks = tpRecoveryWeeks(new Date());
    var ordered = [];
    pend.tiers.forEach(function(t) { ordered = ordered.concat(pend.byTier[t]); });
    ordered = ordered.concat(pend.byTier.none);
    var units = [];
    ordered.forEach(function(it) { for (var k = 0; k < it.deficit; k++) units.push(it); });

    var schedule = weeks.map(function(w) {
        return { monday: w.monday, mondayDate: w.mondayDate, available: w.available, effCap: w.effCap, items: [] };
    });
    var unscheduled = [], deadlineRisk = [], ui = 0;
    for (var wi = 0; wi < schedule.length && ui < units.length; wi++) {
        var wk = schedule[wi];
        if (!wk.available || wk.effCap <= 0) continue;
        for (var c = 0; c < wk.effCap && ui < units.length; c++) {
            var unit = units[ui++];
            wk.items.push(unit);
            if (unit.deadline) {
                var dlMon = _tpMonday(new Date(unit.deadline + 'T12:00:00'));
                if (wk.mondayDate > dlMon) deadlineRisk.push({ item: unit, week: wk.monday });
            }
        }
    }
    for (; ui < units.length; ui++) unscheduled.push(units[ui]);

    function etaFor(tier) {
        if (unscheduled.some(function(it) { return it.tier === tier; })) return null;
        var last = -1;
        schedule.forEach(function(w, idx) { if (w.items.some(function(it) { return it.tier === tier; })) last = idx; });
        return last < 0 ? 0 : last + 1;
    }
    var lastUsed = schedule.reduce(function(m, w, idx) { return w.items.length ? idx : m; }, -1);
    var etaByTier = {};
    pend.tiers.forEach(function(t) { etaByTier[t] = etaFor(t); });
    var summary = {
        pending: pend.totals,
        tiers: pend.tiers,
        availWeeks: weeks.filter(function(w) { return w.available && w.effCap > 0; }).length,
        totalCap: schedule.reduce(function(s, w) { return s + (w.available ? w.effCap : 0); }, 0),
        scheduledCount: units.length - unscheduled.length,
        unscheduledCount: unscheduled.length,
        deadlineRiskCount: deadlineRisk.length,
        etaByTier: etaByTier,
        etaAll: unscheduled.length > 0 ? null : (lastUsed + 1)
    };
    return { schedule: schedule, unscheduled: unscheduled, deadlineRisk: deadlineRisk, summary: summary, pending: pend, weeks: weeks };
}

// ── Mutadores de disponibilidad semanal ──
function _tpEnsureWeekAv(monday) {
    if (!tpState.weekAvailability) tpState.weekAvailability = {};
    if (!tpState.weekAvailability[monday]) tpState.weekAvailability[monday] = { available: true, capacity: null, workDays: null, note: '' };
    return tpState.weekAvailability[monday];
}
function tpToggleWeekAvailable(monday) {
    var av = _tpEnsureWeekAv(monday);
    av.available = !(av.available !== false);
    tpSave(); tpRender();
}
function tpSetWeekCapacity(monday, val) {
    var av = _tpEnsureWeekAv(monday);
    var n = parseInt(val, 10);
    av.capacity = (isNaN(n) || n < 0) ? null : n;
    tpSave(); tpRender();
}
function tpSetWeekDay(monday, day, checked) {
    var av = _tpEnsureWeekAv(monday);
    if (!av.workDays) av.workDays = JSON.parse(JSON.stringify(_TP_DEFAULT_WD));
    av.workDays[day] = !!checked;
    tpSave(); tpRender();
}
function tpSetRecoveryUntil(val) {
    tpState.recoveryUntil = val || null;
    tpSave(); tpRender();
}

// ── Editores de reglas de prioridad ──
function tpAddPriorityRule() {
    if (!tpState.priorityRules) tpState.priorityRules = [];
    tpState.priorityRules.push({ id: 'r' + Date.now(), tier: 3, region: '*', regulation: '*', modelMatch: '', engMatch: '', label: 'Nueva regla' });
    tpSave(); tpRender();
}
function tpDeletePriorityRule(id) {
    tpState.priorityRules = (tpState.priorityRules || []).filter(function(r) { return r.id !== id; });
    tpSave(); tpRender();
}
function tpSetPriorityRule(id, field, val) {
    var r = (tpState.priorityRules || []).find(function(x) { return x.id === id; });
    if (!r) return;
    r[field] = (field === 'tier') ? (parseInt(val, 10) || 3) : val;
    tpSave(); tpRender();
}
function tpResetPriorityRules() {
    tpState.priorityRules = tpDefaultPriorityRules();
    tpSave(); tpRender();
    if (typeof showToast === 'function') showToast('Reglas de prioridad restauradas', 'info');
}

// Materializa el cronograma en planes semanales reales (reúsa la forma de item + tpAssignSchedule).
function tpMaterializeRecovery() {
    var plan = tpBuildRecoveryPlan();
    var weeksWithItems = plan.schedule.filter(function(w) { return w.available && w.items.length > 0; });
    if (!weeksWithItems.length) { if (typeof showToast === 'function') showToast('No hay nada que agendar en semanas disponibles', 'warning'); return; }
    if (typeof undoPush === 'function') undoPush('testplan', 'Plan de recuperación');
    if (!tpState.weeklyPlans) tpState.weeklyPlans = [];
    var created = 0;
    weeksWithItems.forEach(function(w) {
        var av = (tpState.weekAvailability || {})[w.monday] || {};
        var workDays = av.workDays || _TP_DEFAULT_WD;
        var seen = {};
        var items = w.items.map(function(unit) {
            var cfg = tpState.planData.find(function(c) { return c.desc === unit.desc; }) || unit;
            var n = tpState.testedList.filter(function(t) { return t.configText === unit.desc; }).length;
            var rule = tpGetRule(cfg);
            var req = tpCalcRequired(cfg, rule);
            return { desc: cfg.desc, id: cfg.id, mod: cfg.mod, rgn: cfg.rgn, reg: cfg.reg, eng: cfg.eng, tx: cfg.tx, my: cfg.my, drv: cfg.drv, body: cfg.body, ep: cfg.ep, engpkg: cfg.engpkg, tire: cfg.tire, required: req, deficit: Math.max(0, req - n), score: unit.score, completed: false, completedDate: null, manual: false, carriedOver: false, recovery: true, tier: unit.tier };
        });
        var scheduled = tpAssignSchedule(items, workDays);
        tpState.weeklyPlans.push({
            id: Date.now() + created,
            created: new Date().toISOString(),
            weekDate: w.monday,
            workDays: JSON.parse(JSON.stringify(workDays)),
            capacity: w.effCap,
            items: scheduled,
            accepted: false,
            recoveryGenerated: true
        });
        created++;
    });
    tpSave();
    if (typeof showToast === 'function') showToast(created + ' semana(s) de recuperación generadas en Plan Semanal', 'success');
    tpSwitchTab('tp-weekly');
}

// ── Render de la pestaña Recuperación ──
function tpRenderRecovery(el) {
    if (!tpState.planData || tpState.planData.length === 0) {
        el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">Importa el plan primero para calcular la recuperación.</div>';
        return;
    }
    var R = tpBuildRecoveryPlan();
    var s = R.summary;
    var dayLabels = { dom: 'D', lun: 'L', mar: 'M', mie: 'X', jue: 'J', vie: 'V', sab: 'S' };
    var dayOrder = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
    var html = '';

    // Banner
    html += '<div class="tp-card" style="border:2px solid var(--tp-amber);background:linear-gradient(135deg,rgba(245,158,11,0.08),transparent);">';
    html += '<div style="font-size:16px;font-weight:800;color:var(--tp-amber);">🚑 Plan de Recuperación</div>';
    html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-top:2px;">Dinamómetro en mantenimiento — agenda las pruebas pendientes por prioridad en las semanas disponibles.</div></div>';

    // KPIs
    function kpi(val, label, color) { return '<div class="tp-card" style="text-align:center;padding:12px;"><div style="font-size:24px;font-weight:800;color:' + color + ';">' + val + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + label + '</div></div>'; }
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:12px;">';
    s.tiers.forEach(function(t) { html += kpi(s.pending.tiers[t] || 0, 'Pendientes P' + t, tpTierColor(t)); });
    if (s.pending.none > 0) html += kpi(s.pending.none, 'Sin prioridad', '#94a3b8');
    html += kpi(s.availWeeks, 'Semanas disp.', '#10b981');
    html += kpi(s.totalCap, 'Capacidad total', '#06b6d4');
    html += '</div>';

    // Feasibility
    var etaTxt = s.etaAll === null
        ? '<span style="color:var(--tp-red);font-weight:700;">No alcanza en el horizonte (' + s.unscheduledCount + ' pruebas sin lugar)</span>'
        : '<span style="color:var(--tp-green);font-weight:700;">Todo cabe en ' + s.etaAll + ' semana(s)</span>';
    html += '<div class="tp-card" style="font-size: var(--fs-sm);">🏁 ' + etaTxt;
    html += ' &nbsp;·&nbsp; ' + s.tiers.map(function(t) { return 'P' + t + ': ' + (s.etaByTier[t] === null ? '⚠️ no alcanza' : s.etaByTier[t] + ' sem'); }).join(' · ');
    if (s.deadlineRiskCount > 0) html += '<div style="color:var(--tp-red);margin-top:4px;">⏰ ' + s.deadlineRiskCount + ' prueba(s) quedarían después del deadline de su familia.</div>';
    html += '</div>';

    // Actions
    html += '<div class="tp-card" style="display:flex;gap:8px;flex-wrap:wrap;">';
    html += '<button class="tp-btn tp-btn-primary" onclick="tpRender()" style="font-size:12px;">🔄 Recalcular</button>';
    html += '<button class="tp-btn tp-btn-primary" onclick="tpMaterializeRecovery()" style="font-size:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;">📅 Generar planes semanales</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="tpSwitchTab(\'tp-calendar\')" style="font-size:12px;">🗓️ Ver Calendario</button></div>';

    // Weekly availability
    html += '<div class="tp-card"><div class="tp-card-title" data-help="tp-availability-help"><span>📆 Disponibilidad de la celda por semana</span><span style="font-size: var(--fs-xs);color:var(--tp-dim);font-weight:400;">' + R.weeks.length + ' semanas</span></div>';
    var _endYear = new Date().getFullYear() + '-12-31';
    html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;font-size: var(--fs-xs);">';
    html += '<label style="color:var(--tp-dim);">📅 Planear hasta: <input type="date" value="' + (tpState.recoveryUntil || '') + '" onchange="tpSetRecoveryUntil(this.value)" style="background:var(--tp-card);border:1px solid var(--tp-border);border-radius:4px;color:var(--tp-text);padding:2px 4px;"></label>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="tpSetRecoveryUntil(\'' + _endYear + '\')" style="font-size: var(--fs-xs);">Fin de año</button>';
    if (tpState.recoveryUntil) html += '<button class="tp-btn tp-btn-ghost" onclick="tpSetRecoveryUntil(\'\')" style="font-size: var(--fs-xs);">Auto</button>';
    html += '</div>';
    html += '<p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Marca las semanas en que NO probarás (mantenimiento) y ajusta días/capacidad. La capacidad es el nº de pruebas por semana — puedes preparar/probar más de un vehículo por día.</p>';
    R.weeks.forEach(function(w) {
        var dt = w.mondayDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        html += '<div style="border:1px solid var(--tp-border);border-radius:8px;padding:8px;margin-bottom:6px;background:' + (w.available ? 'transparent' : 'rgba(239,68,68,0.06)') + ';opacity:' + (w.available ? '1' : '0.6') + ';">';
        html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
        html += '<div style="font-size: var(--fs-sm);font-weight:700;min-width:74px;">Sem ' + dt + '</div>';
        html += '<button class="tp-btn ' + (w.available ? 'tp-btn-primary' : 'tp-btn-danger') + '" onclick="tpToggleWeekAvailable(\'' + w.monday + '\')" style="font-size: var(--fs-xs);padding:3px 8px;">' + (w.available ? '✅ Disponible' : '🚫 No disponible') + '</button>';
        html += '<label style="font-size: var(--fs-xs);color:var(--tp-dim);">Cap: <input type="number" min="0" value="' + w.capacity + '" onchange="tpSetWeekCapacity(\'' + w.monday + '\',this.value)" style="width:48px;background:var(--tp-card);border:1px solid var(--tp-border);border-radius:4px;color:var(--tp-text);padding:2px 4px;"></label>';
        html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">días: ' + w.attendDays + ' · capacidad: <strong style="color:' + (w.effCap > 0 ? 'var(--tp-green)' : 'var(--tp-red)') + ';">' + w.effCap + '</strong>/sem</span>';
        html += '</div><div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">';
        dayOrder.forEach(function(d) {
            var on = w.workDays[d];
            html += '<label style="font-size: var(--fs-xs);padding:2px 6px;border:1px solid var(--tp-border);border-radius:5px;cursor:pointer;background:' + (on ? 'rgba(59,130,246,0.12)' : 'transparent') + ';"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="tpSetWeekDay(\'' + w.monday + '\',\'' + d + '\',this.checked)" style="accent-color:var(--tp-blue);transform:scale(0.8);"> ' + dayLabels[d] + '</label>';
        });
        html += '</div>';
        // v16.4: aviso de mantenimiento programado (COP15-F11) sobre equipos que bloquean pruebas — solo avisa, no bloquea solo.
        if (w.available && typeof invMaintPlannedForWeek === 'function') {
            var mtto = invMaintPlannedForWeek(w.monday).filter(function(m) { return m.asset && m.asset.blocksTesting; });
            if (mtto.length > 0) {
                html += '<div style="margin-top:6px;padding:6px 8px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">';
                html += '<span style="font-size: var(--fs-xs);color:#92400e;">🛠️ Mantenimiento programado: ' + mtto.map(function(m) { return escapeHtml(m.asset.name + ' — ' + m.act.desc); }).join(', ') + '</span>';
                html += '<button class="tp-btn tp-btn-ghost" onclick="_tpEnsureWeekAv(\'' + w.monday + '\').available=false;tpSave();tpRender();" style="font-size: var(--fs-xs);">Marcar no disponible</button>';
                html += '</div>';
            }
        }
        html += '</div>';
    });
    html += '</div>';

    // Priority rules
    html += '<div class="tp-card"><div class="tp-card-title" data-help="tp-priority-help"><span>🎯 Reglas de Prioridad (editables)</span><span style="display:flex;align-items:center;gap:6px;"><label style="font-size: var(--fs-xs);color:var(--tp-dim);font-weight:400;">Niveles: <input type="number" min="1" max="10" value="' + tpMaxTiers() + '" onchange="tpSetMaxTiers(this.value)" style="width:42px;background:var(--tp-card);border:1px solid var(--tp-border);border-radius:4px;color:var(--tp-text);padding:2px 4px;"></label><button class="tp-btn tp-btn-ghost" onclick="tpResetPriorityRules()" style="font-size: var(--fs-xs);">Restaurar default</button></span></div>';
    html += '<p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Se evalúan de arriba a abajo; la primera coincidencia asigna la prioridad. Cada filtro es un menú que se va acotando con lo ya seleccionado (estilo Cascade); "Todas" = comodín. Puedes definir hasta 10 niveles (P1 = más alta).</p>';
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size: var(--fs-xs);"><tr style="color:var(--tp-dim);text-align:left;"><th>P</th><th>Familia</th><th>Región</th><th>Regulación</th><th>Modelo</th><th>Cilindrada</th><th>Body</th><th>Manejo</th><th></th></tr>';
    (tpState.priorityRules || []).forEach(function(r) {
        function sel(field, cur, w) {
            var opts = tpRuleFieldOptions(r, field);
            cur = cur || '';
            function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
            var o = '<select onchange="tpSetPriorityRule(\'' + r.id + '\',\'' + field + '\',this.value)" style="max-width:' + (w || 120) + 'px;background:var(--tp-card);border:1px solid var(--tp-border);border-radius:4px;color:var(--tp-text);padding:2px 4px;font-size: var(--fs-xs);">';
            o += '<option value="" ' + (!cur ? 'selected' : '') + '>Todas</option>';
            var has = false;
            opts.forEach(function(op) { var sd = _tpNorm(op.value) === _tpNorm(cur); if (sd) has = true; o += '<option value="' + esc(op.value) + '" ' + (sd ? 'selected' : '') + '>' + esc(op.label) + '</option>'; });
            if (cur && !has && cur !== '*') o += '<option value="' + esc(cur) + '" selected>' + (field === 'familyMatch' ? 'familia actual' : esc(cur) + ' (actual)') + '</option>';
            return o + '</select>';
        }
        html += '<tr style="border-top:1px solid var(--tp-border);">';
        var _topts = ''; for (var _tt = 1; _tt <= Math.max(tpMaxTiers(), r.tier || 1); _tt++) _topts += '<option value="' + _tt + '" ' + (r.tier === _tt ? 'selected' : '') + '>P' + _tt + '</option>';
        html += '<td><select onchange="tpSetPriorityRule(\'' + r.id + '\',\'tier\',this.value)" style="background:var(--tp-card);border:1px solid var(--tp-border);border-radius:4px;color:var(--tp-text);font-size: var(--fs-xs);">' + _topts + '</select></td>';
        html += '<td>' + sel('familyMatch', r.familyMatch, 170) + '</td>';
        html += '<td>' + sel('region', r.region) + '</td><td>' + sel('regulation', r.regulation) + '</td><td>' + sel('modelMatch', r.modelMatch) + '</td><td>' + sel('engMatch', r.engMatch) + '</td><td>' + sel('bodyMatch', r.bodyMatch) + '</td><td>' + sel('drvMatch', r.drvMatch) + '</td>';
        html += '<td><button class="tp-btn tp-btn-danger" onclick="tpDeletePriorityRule(\'' + r.id + '\')" style="font-size: var(--fs-xs);padding:2px 6px;">✕</button></td></tr>';
    });
    html += '</table></div><button class="tp-btn tp-btn-ghost" onclick="tpAddPriorityRule()" style="font-size: var(--fs-xs);margin-top:6px;">+ Agregar regla</button></div>';

    // Pending by priority
    function tierSection(title, color, arr) {
        var cnt = arr.reduce(function(a, b) { return a + b.deficit; }, 0);
        var h = '<div class="tp-card"><div class="tp-card-title"><span style="color:' + color + ';">' + title + '</span><span style="font-size: var(--fs-sm);color:' + color + ';font-weight:700;">' + cnt + ' pruebas / ' + arr.length + ' configs</span></div>';
        if (!arr.length) return h + '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Sin pendientes.</div></div>';
        arr.slice(0, 15).forEach(function(it) {
            var dl = it.deadline ? ' · ⏰ ' + (it.daysToDeadline < 0 ? 'vencido' : it.daysToDeadline + 'd') : '';
            h += '<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--tp-border);font-size: var(--fs-xs);"><span style="flex:1;color:var(--tp-text);">' + it.desc + '</span><span style="white-space:nowrap;color:var(--tp-dim);">×' + it.deficit + dl + '</span></div>';
        });
        if (arr.length > 15) h += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);text-align:center;margin-top:4px;">+' + (arr.length - 15) + ' más…</div>';
        return h + '</div>';
    }
    s.tiers.forEach(function(t) { html += tierSection('Prioridad ' + t, tpTierColor(t), R.pending.byTier[t]); });
    if (R.pending.byTier.none.length) html += tierSection('Sin prioridad', '#94a3b8', R.pending.byTier.none);

    // Schedule
    html += '<div class="tp-card"><div class="tp-card-title"><span>🗓️ Cronograma de Recuperación</span></div>';
    var anyWk = R.schedule.filter(function(w) { return w.items.length > 0; });
    if (!anyWk.length) html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">No hay semanas disponibles con capacidad. Marca semanas disponibles arriba.</div>';
    anyWk.forEach(function(w) {
        var dt = w.mondayDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        html += '<div style="margin-bottom:8px;"><div style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-blue);">Semana ' + dt + ' (' + w.items.length + '/' + w.effCap + ')</div>';
        w.items.forEach(function(it) {
            var tc = tpTierColor(it.tier);
            html += '<div style="display:flex;gap:6px;align-items:center;padding:2px 0;font-size: var(--fs-xs);"><span style="padding:1px 5px;border-radius:3px;background:' + tc + '20;color:' + tc + ';font-weight:700;">' + (it.tier ? 'P' + it.tier : '—') + '</span><span style="flex:1;color:var(--tp-text);">' + it.desc + '</span></div>';
        });
        html += '</div>';
    });
    if (R.unscheduled.length) {
        var byT = {};
        R.unscheduled.forEach(function(it) { var k = it.tier || 'none'; byT[k] = (byT[k] || 0) + 1; });
        var uparts = s.tiers.filter(function(t) { return byT[t]; }).map(function(t) { return 'P' + t + ': ' + byT[t]; });
        if (byT.none) uparts.push('Sin prioridad: ' + byT.none);
        html += '<div style="border-top:1px solid var(--tp-border);margin-top:6px;padding-top:6px;"><div style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-red);">⚠️ No alcanzan (' + R.unscheduled.length + ')</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + uparts.join(' · ') + '</div></div>';
    }
    html += '</div>';

    el.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════
// SELECCIÓN DE LA SEMANA — una sola implementación
// ══════════════════════════════════════════════════════════════════════
// tpGenerateWeekly y tpSmartGenerate duplicaban ~60 líneas de selección y divergían
// justo en el bug: una metía TODAS las obligatorias sin mirar la capacidad (de ahí las
// semanas de 33 pruebas para 4 huecos), la otra topaba el carryover pero tiraba el
// excedente en silencio. Ahora las dos entran por aquí y el tope se respeta siempre;
// lo que no cabe se REPORTA en vez de perderse.
function _tpMakeItem(cfg, testedCopy, flags) {
    var rule = tpGetRule(cfg);
    var n = testedCopy.filter(function(t) { return t.configText === cfg.desc; }).length;
    var req = tpCalcRequired(cfg, rule);
    var sc = tpPriorityScore(cfg, n);
    return {
        desc: cfg.desc, id: cfg.id, mod: cfg.mod, rgn: cfg.rgn, reg: cfg.reg, eng: cfg.eng,
        tx: cfg.tx, my: cfg.my, drv: cfg.drv, body: cfg.body, ep: cfg.ep, engpkg: cfg.engpkg,
        tire: cfg.tire, required: req, deficit: Math.max(0, req - n), score: sc,
        completed: false, completedDate: null,
        manual: !!(flags && flags.manual), carriedOver: !!(flags && flags.carriedOver),
        _scoreDetail: tpBuildScoreDetail(cfg, n, req, sc)
    };
}

function tpSelectWeeklyItems(opts) {
    opts = opts || {};
    var workDays = opts.workDays || { dom:false, lun:true, mar:true, mie:true, jue:true, vie:true, sab:false };
    var capReal = tpWeekCapacity(workDays);
    // El tope duro es la capacidad física; el campo del formulario solo puede pedir MENOS.
    var capacity = Math.max(1, Math.min(parseInt(opts.capacity, 10) || capReal.max, capReal.max));
    var manualPicks = opts.manualPicks || [];
    var testedCopy = tpState.testedList.slice();
    var items = [], used = new Set(), overflowManual = [], skippedInv = [], outOfFilter = [];

    var backlogDescs = new Set(tpBacklog().map(function(b) { return b.desc; }));
    var byDesc = {};
    tpState.planData.forEach(function(c) { byDesc[c.desc] = c; });

    var pCfg = tpPlannerCfg();
    var excl = new Set(opts.exclude || []);
    var useFilter = !opts.ignoreFilters;
    var passes = function(cfg) { return !useFilter || tpPassesWeekFilter(cfg); };
    var B = tpBacklogEligible();

    // v20.1: `allowRepeat` sólo lo pasan las OBLIGATORIAS. El generador automático
    // (cola y déficit) sigue sin repetir por su cuenta: repetir gasta capacidad que el
    // déficit necesita y nadie se lo pidió. Pero fijar la misma configuración dos veces
    // a mano es una intención explícita — dos vehículos idénticos — y ahora se respeta.
    function take(cfg, flags, allowRepeat) {
        if (!cfg) return false;
        if (!allowRepeat && used.has(cfg.desc)) return false;
        if (excl.has(cfg.desc)) return false;
        if (items.length >= capacity) return false;
        if (opts.checkInventory) {
            var chk = tpCheckInventoryForConfig(cfg);
            if (!chk.ok) { skippedInv.push({ desc: cfg.desc, reason: chk.reason }); return false; }
        }
        items.push(_tpMakeItem(cfg, testedCopy, flags));
        testedCopy.push({ configText: cfg.desc, date: 'Plan', source: 'plan' });
        used.add(cfg.desc);
        return true;
    }

    // 1) Obligatorias — primero, pero SIN saltarse el tope. Quedan EXENTAS del filtro
    //    y de la caducidad: fijar a mano es una intención explícita. Si una fijada no
    //    pasa el filtro se avisa, no se descarta.
    var manualTaken = 0;
    manualPicks.forEach(function(pick) {
        var cfg = byDesc[pick];
        if (!cfg) return;
        if (items.length >= capacity) { overflowManual.push(pick); return; }
        if (take(cfg, { manual: true, carriedOver: backlogDescs.has(pick) }, true)) {
            manualTaken++;
            if (useFilter && !tpPassesWeekFilter(cfg)) outOfFilter.push(pick);
        } else {
            overflowManual.push(pick);
        }
    });

    // 2) Cola de pendientes ACOTADA POR CUOTA — el arreglo central.
    //    Antes se volcaba el backlog completo antes de mirar el déficit fresco, así que
    //    con una cola de 20+ y capacidad 4 el paso 3 NUNCA corría y una config recién
    //    repriorizada no podía entrar. Ahora la cola tiene un techo.
    var carryTaken = items.filter(function(it) { return it.carriedOver; }).length;
    var carryCap = 0;
    if (pCfg.carryoverOn) {
        carryCap = Math.floor(capacity * (parseInt(pCfg.carryoverMaxPct, 10) || 0) / 100);
        // Con capacidad >= 2 siempre dejamos al menos un hueco de cola; a capacidad 1
        // gana lo fresco (si no, la única prueba de la semana sería siempre arrastre).
        if (carryCap < 1 && capacity >= 2) carryCap = 1;
    }
    if (pCfg.carryoverOn) {
        B.eligible.forEach(function(b) {
            if (items.length >= capacity || carryTaken >= carryCap) return;
            if (take(byDesc[b.desc], { carriedOver: true })) carryTaken++;
        });
    }

    // 3) Déficit fresco por puntaje — ahora SIEMPRE corre, porque el paso 2 no puede
    //    pasar de carryCap.
    var pool = tpGetAnalysis().filter(function(c) { return c.deficit > 0 && passes(c); })
                              .sort(function(a, b) { return b.score - a.score; });
    for (var i = 0; i < pool.length && items.length < capacity; i++) {
        take(byDesc[pool[i].desc], {});
    }

    // 4) Relleno: si el pool fresco se agotó, no desperdiciar huecos — se completan
    //    con cola elegible aunque se pase de la cuota (la cuota reserva, no limita).
    if (pCfg.carryoverOn && items.length < capacity) {
        B.eligible.forEach(function(b) {
            if (items.length >= capacity) return;
            if (take(byDesc[b.desc], { carriedOver: true })) carryTaken++;
        });
    }

    return {
        items: items, overflowManual: overflowManual, skippedInv: skippedInv,
        capacity: capacity, capReal: capReal,
        outOfFilter: outOfFilter,
        expiredCount: B.expired.length, filteredCount: B.filtered.length,
        carryTaken: carryTaken, carryCap: carryCap,
        freshTaken: items.length - carryTaken - manualTaken
    };
}

function tpGenerateWeekly() {
    if (tpState.planData.length === 0) { showToast('Importa el plan primero', 'warning'); return; }
    if (!tpState.weeklyPlans) tpState.weeklyPlans = [];
    const weekDate = document.getElementById('tp-weekly-date')?.value || localToday();
    const workDays = window._tpWorkDays || {dom:false, lun:true, mar:true, mie:true, jue:true, vie:true, sab:false};
    const R = tpSelectWeeklyItems({
        capacity: parseInt(document.getElementById('tp-weekly-cap')?.value, 10) || 0,
        workDays: workDays,
        manualPicks: window._tpWeeklyManualPicks || []
    });

    if (R.items.length === 0) { showToast('Sin configuraciones pendientes', 'info'); return; }

    // Assign precon/test schedule with randomization
    const scheduled = tpAssignSchedule(R.items, workDays);

    tpState.weeklyPlans.push({
        id: Date.now(),
        created: new Date().toISOString(),
        weekDate: weekDate,
        workDays: JSON.parse(JSON.stringify(workDays)),
        capacity: R.capacity,
        items: scheduled,
        accepted: false
    });
    window._tpWeeklyManualPicks = [];
    tpSave(); tpRender(); tpUpdateBadges();
    if (typeof fbPostPlanGenerated === 'function') fbPostPlanGenerated(scheduled.length);
    if (R.overflowManual.length) {
        showToast('⚠️ ' + R.overflowManual.length + ' obligatoria(s) no caben en la semana (tope ' + R.capacity + ') — siguen en la cola.', 'warning');
    }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  SMART PLAN GENERATION — One-click with inventory validation        ║
// ╚══════════════════════════════════════════════════════════════════════╝

function tpCheckInventoryForConfig(cfg) {
    if (typeof invState === 'undefined' || !invState.gases) return { ok: true, reason: '' };
    var reg = cfg.reg || '';
    // Check if there's at least one non-empty gas cylinder with sufficient level
    var gases = invState.gases.filter(function(g) {
        return g.status !== 'Empty' && g.readings && g.readings.length > 0;
    });
    if (gases.length === 0) return { ok: true, reason: 'sin datos inventario' };

    var lowGases = gases.filter(function(g) {
        var lvl = typeof invGasLevel === 'function' ? invGasLevel(g) : { pct: 100 };
        return lvl.pct < 10;
    });

    // If more than half of the gases are critically low, warn
    if (lowGases.length > gases.length * 0.5) {
        return { ok: false, reason: lowGases.length + ' cilindros nivel critico (<10%)' };
    }
    return { ok: true, reason: '' };
}

function tpSmartGenerate() {
    if (tpState.planData.length === 0) { showToast('Importa el plan primero', 'warning'); return; }
    if (!tpState.weeklyPlans) tpState.weeklyPlans = [];

    var weekDate = document.getElementById('tp-weekly-date')?.value || localToday();
    var workDays = window._tpWorkDays || { dom: false, lun: true, mar: true, mie: true, jue: true, vie: true, sab: false };

    // Misma selección que el generador normal (backlog por antigüedad + déficit por puntaje,
    // topada a la capacidad real); lo único propio del modo Smart es el filtro de inventario.
    var R = tpSelectWeeklyItems({
        capacity: parseInt(document.getElementById('tp-weekly-cap')?.value, 10) || 0,
        workDays: workDays,
        manualPicks: window._tpWeeklyManualPicks || [],
        checkInventory: true
    });
    var items = R.items, skippedInv = R.skippedInv;

    if (items.length === 0) { showToast('Sin configuraciones pendientes con inventario disponible', 'info'); return; }

    // Assign precon/test schedule
    var scheduled = tpAssignSchedule(items, workDays);

    tpState.weeklyPlans.push({
        id: Date.now(),
        created: new Date().toISOString(),
        weekDate: weekDate,
        workDays: JSON.parse(JSON.stringify(workDays)),
        capacity: R.capacity,
        items: scheduled,
        accepted: false,
        smartGenerated: true,
        skippedInventory: skippedInv
    });

    window._tpWeeklyManualPicks = [];
    tpSave(); tpRender(); tpUpdateBadges();
    if (typeof fbPostPlanGenerated === 'function') fbPostPlanGenerated(scheduled.length);

    // Substitution predictions for generated plan
    var subPreds = typeof tpPredictSubstitutions === 'function' ? tpPredictSubstitutions(scheduled) : [];
    var msg = scheduled.length + ' configs seleccionadas (score + inventario)';
    if (skippedInv.length > 0) msg += '. ' + skippedInv.length + ' omitidas por inventario bajo.';
    if (subPreds.length > 0) msg += '. 🔮 ' + subPreds.length + ' con sustitucion probable.';
    showToast(msg, 'success');

    // Inventory impact warning (Mejora D)
    if (typeof invGetPlanImpactWarning === 'function') {
        var impactWarning = invGetPlanImpactWarning(scheduled);
        if (impactWarning) {
            setTimeout(function() { showToast('⚠️ ' + impactWarning, 'warning'); }, 1500);
        }
    }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  MONTHLY PLAN GENERATION — genera 4 semanas de una vez               ║
// ╚══════════════════════════════════════════════════════════════════════╝
function tpGenerateMonthly(startDateStr) {
    if (tpState.planData.length === 0) { showToast('Importa el plan primero', 'warning'); return; }
    if (!tpState.weeklyPlans) tpState.weeklyPlans = [];
    var workDays = window._tpWorkDays || { dom:false, lun:true, mar:true, mie:true, jue:true, vie:true, sab:false };
    // v16.4: el mes conserva su propia simulación (el déficit baja semana a semana), pero el
    // tope por semana es el mismo de siempre — la capacidad física, no el número del campo.
    var _capReal = tpWeekCapacity(workDays);
    var capacity = Math.max(1, Math.min(parseInt(document.getElementById('tp-weekly-cap')?.value, 10) || _capReal.max, _capReal.max));
    var baseStr = startDateStr || document.getElementById('tp-weekly-date')?.value || localToday();
    var base = new Date(baseStr + 'T12:00:00');
    var numWeeks = 4;

    var analysis = tpGetAnalysis();
    // Déficit simulado por config: baja a lo largo de las semanas (igual que el simulador).
    var testedSim = new Map();
    analysis.forEach(function(a){ testedSim.set(a.desc, a.testedN); });

    var monthBatch = Date.now();
    var created = 0;
    for (var wk = 0; wk < numWeeks; wk++) {
        var weekDate = new Date(base.getTime()); weekDate.setDate(base.getDate() + wk * 7);
        var weekStr = localDateStr(weekDate);
        var scored = analysis.map(function(a){
            var n = testedSim.get(a.desc) || 0;
            var rule = tpGetRule(a);
            var req = tpCalcRequired(a, rule);
            return Object.assign({}, a, { simTested:n, simReq:req, simDeficit:Math.max(0, req - n) });
        }).filter(function(c){ return c.simDeficit > 0 && c.total > 0; }).sort(function(a,b){ return b.score - a.score; });

        var items = []; var used = new Set();
        for (var i = 0; i < scored.length && items.length < capacity; i++) {
            var cfg = scored[i];
            if (used.has(cfg.desc)) continue;
            items.push({
                desc:cfg.desc, id:cfg.id, mod:cfg.mod, rgn:cfg.rgn, reg:cfg.reg,
                eng:cfg.eng, tx:cfg.tx, my:cfg.my, drv:cfg.drv, body:cfg.body,
                ep:cfg.ep, engpkg:cfg.engpkg, tire:cfg.tire,
                required:cfg.simReq, deficit:cfg.simDeficit, score:cfg.score,
                completed:false, completedDate:null, manual:false, carriedOver:false,
                _scoreDetail: tpBuildScoreDetail(cfg, cfg.simTested, cfg.simReq, cfg.score)
            });
            used.add(cfg.desc);
            testedSim.set(cfg.desc, (testedSim.get(cfg.desc) || 0) + 1);
        }
        if (items.length === 0) break;
        var scheduled = tpAssignSchedule(items, workDays);
        tpState.weeklyPlans.push({
            id: monthBatch + wk, created: new Date().toISOString(), weekDate: weekStr,
            workDays: JSON.parse(JSON.stringify(workDays)), capacity: capacity,
            items: scheduled, accepted: false, monthBatch: monthBatch
        });
        created++;
    }
    if (created === 0) { showToast('Sin configuraciones pendientes', 'info'); return; }
    tpSave(); tpRender(); tpUpdateBadges();
    if (typeof fbPostPlanGenerated === 'function') fbPostPlanGenerated(created);
    showToast('📅 Plan mensual generado: ' + created + ' semanas. Revísalas y acéptalas.', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v20] CICLO DE VIDA DEL PLAN — identidad estable, desaceptar, borrar de verdad
//
// Lo que estaba roto y por qué dolió:
//  · NO existía desaceptar. `plan.accepted = true` era la única asignación en todo
//    el repo, así que BORRAR era el único camino para revertir una aceptación.
//  · Borrar era un `onclick` inline con `weeklyPlans.splice()`: sin deshacer, sin
//    auditoría, sin permiso y sin tocar weekHistory — que quedaba mintiendo.
//  · weekHistory guardaba `weekNum = weekIdx + 1`, un ÍNDICE DE ARRAY. Tras un
//    splice todas las semanas posteriores se recorren y el histórico deja de
//    corresponder. Aceptar dos veces empujaba dos entradas para la misma semana,
//    y _tpBuildCarryAges las contaba dobles: la antigüedad de la cola se inflaba.
//  · La copia archivada era una FOTO del momento de aceptar que nadie volvía a
//    sincronizar: si liberabas el jueves, seguía diciendo `completed:false` para
//    siempre.
// ═══════════════════════════════════════════════════════════════════════════════

/** Identidad estable de un plan. Legible y ordenable; nunca un índice de array. */
function tpPlanId(plan) {
    if (!plan) return '';
    if (plan.planId) return plan.planId;
    return 'W' + (plan.weekDate || String(plan.created || '').slice(0, 10) || '?') + '-' + (plan.id || plan.created || '?');
}

function tpEnsurePlanIds() {
    (tpState.weeklyPlans || []).forEach(function(p) { if (p && !p.planId) p.planId = tpPlanId(p); });
}

function tpFindPlanIndexById(planId) {
    return (tpState.weeklyPlans || []).findIndex(function(p) { return p && tpPlanId(p) === planId; });
}

/** La foto archivada de un plan, reconstruida desde el plan VIVO. */
function _tpWeekHistoryEntry(plan) {
    return {
        planId: tpPlanId(plan),
        weekDate: plan.weekDate || null,
        created: plan.created,
        acceptedDate: plan.acceptedDate,
        capacity: plan.capacity,
        workDays: plan.workDays || null,
        total: (plan.items || []).length,
        completed: (plan.items || []).filter(function(i) { return i.completed; }).length,
        carryover: (plan.items || []).filter(function(i) { return i.status === 'carryover'; }).length,
        items: (plan.items || []).map(function(i) {
            return {
                desc: i.desc, mod: i.mod, rgn: i.rgn, reg: i.reg, eng: i.eng,
                completed: i.completed, completedDate: i.completedDate,
                status: i.status || (i.completed ? 'completed' : 'carryover'),
                manual: i.manual, carriedOver: i.carriedOver,
                declared: i.declared || false,
                substituted: i.substituted || false,
                substitution: i.substitution || null,
                preconDay: i.preconDay, testDay: i.testDay,
                preconLabel: i.preconLabel, testLabel: i.testLabel,
                plannedTestDay: i.plannedTestDay || null, moved: !!(i.plannedTestDay && i.plannedTestDay !== i.testDay)
            };
        })
    };
}

/**
 * Re-sincroniza la foto archivada con el plan vivo. Se llama desde TODO mutador
 * vía _tpTouchPlan: un helper único es lo que evita que se olvide uno.
 */
function tpSyncWeekHistoryFor(planId) {
    if (!planId || !Array.isArray(tpState.weekHistory)) return false;
    var idx = tpFindPlanIndexById(planId);
    if (idx < 0) return false;
    var plan = tpState.weeklyPlans[idx];
    if (!plan || !plan.accepted) return false;
    var h = tpState.weekHistory.findIndex(function(w) { return w && w.planId === planId; });
    if (h < 0) return false;
    tpState.weekHistory[h] = _tpWeekHistoryEntry(plan);
    return true;
}

/** Guardar + resincronizar la foto + invalidar cachés. Todo mutador del plan pasa por aquí. */
function _tpTouchPlan(weekIdx) {
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (plan) tpSyncWeekHistoryFor(tpPlanId(plan));
    if (typeof tpInvalidateCache === 'function') tpInvalidateCache();
    if (typeof tpBacklogInvalidate === 'function') tpBacklogInvalidate();
    tpSave();
}

/**
 * Migración de una sola vez: weekNum (índice) → planId (estable).
 * Empata por weekDate+acceptedDate, luego weekDate, luego created. Lo que no
 * empata NO se tira: se marca `orphan` — su plan se borró, pero la entrada sigue
 * siendo evidencia válida de qué se arrastró esa semana.
 * Y deduplica: dos entradas con el mismo planId eran el daño de los dobles-aceptar.
 */
function tpMigrateWeekHistoryIds() {
    if (!tpState._migr) tpState._migr = {};
    if (tpState._migr.weekIds) return 0;
    tpEnsurePlanIds();
    var planes = tpState.weeklyPlans || [];
    var tocadas = 0;
    (tpState.weekHistory || []).forEach(function(w, i) {
        if (!w || w.planId) return;
        var p = planes.find(function(x) { return x.weekDate && x.weekDate === w.weekDate && x.acceptedDate === w.acceptedDate; })
             || planes.find(function(x) { return x.weekDate && x.weekDate === w.weekDate; })
             || planes.find(function(x) { return x.created && x.created === w.created; });
        if (p) { w.planId = tpPlanId(p); }
        else   { w.planId = 'H' + (w.weekDate || w.created || i) + '-' + i; w.orphan = true; }
        tocadas++;
    });
    // Deduplicar por planId conservando la aceptación más reciente.
    var vistos = {}, limpias = [];
    (tpState.weekHistory || []).forEach(function(w) {
        if (!w || !w.planId) { limpias.push(w); return; }
        var prev = vistos[w.planId];
        if (prev === undefined) { vistos[w.planId] = limpias.length; limpias.push(w); return; }
        if (String(w.acceptedDate || '') > String(limpias[prev].acceptedDate || '')) limpias[prev] = w;
    });
    var dups = (tpState.weekHistory || []).length - limpias.length;
    tpState.weekHistory = limpias;
    tpState._migr.weekIds = true;
    if (tocadas || dups) {
        tpSave();
        if (typeof auditLog === 'function') {
            auditLog('tp', 'weekhistory_migrated', { type: 'plan', label: 'historial de semanas' },
                     tocadas + ' semana(s) con identidad estable' + (dups ? ' · ' + dups + ' duplicada(s) por doble aceptación' : ''));
        }
    }
    return tocadas;
}

/** Aceptar — ahora IDEMPOTENTE: aceptar dos veces no duplica el archivo. */
function tpAcceptWeeklyPlan(weekIdx) {
    if (!tpState.weeklyPlans || !tpState.weeklyPlans[weekIdx]) return;
    const plan = tpState.weeklyPlans[weekIdx];
    tpEnsurePlanIds();
    var pid = tpPlanId(plan);
    if (!Array.isArray(tpState.weekHistory)) tpState.weekHistory = [];

    if (plan.accepted) {
        // Ya estaba aceptado: solo refrescar la foto. Antes esto empujaba una
        // SEGUNDA entrada y _tpBuildCarryAges contaba doble la antigüedad.
        tpSyncWeekHistoryFor(pid);
        tpSave(); tpRender(); tpUpdateBadges();
        showToast('Este plan ya estaba aceptado — se actualizó su registro.', 'info');
        return;
    }

    plan.accepted = true;
    plan.acceptedDate = new Date().toISOString();
    plan.items.forEach(item => { if (!item.completed) item.status = 'carryover'; });

    var h = tpState.weekHistory.findIndex(function(w) { return w && w.planId === pid; });
    if (h >= 0) tpState.weekHistory[h] = _tpWeekHistoryEntry(plan);
    else tpState.weekHistory.push(_tpWeekHistoryEntry(plan));

    if (typeof tpBacklogInvalidate === 'function') tpBacklogInvalidate();
    tpSave(); tpRender(); tpUpdateBadges();
    if (typeof fbPostPlanAccepted === 'function') fbPostPlanAccepted(weekIdx + 1);
    if (typeof auditLog === 'function') {
        auditLog('tp', 'week_accepted', { type: 'plan', label: plan.weekDate || tpPlanId(plan) },
                 plan.items.filter(i => i.status === 'carryover').length + ' pendiente(s) a la cola');
    }
    showToast('Plan de la semana del ' + (plan.weekDate || '—') + ' aceptado. ' +
              plan.items.filter(i => i.status === 'carryover').length + ' pendiente(s) pasan a la cola.', 'success');
}

/**
 * Desaceptar — NO EXISTÍA, y por eso borrar era el único camino.
 * Quitar la entrada de weekHistory es justo lo que le quita el sello de arrastre
 * a los pendientes de esa semana.
 */
function tpUnacceptWeeklyPlan(weekIdx) {
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan) return;
    if (!plan.accepted) { showToast('Ese plan no está aceptado.', 'info'); return; }
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'desaceptar un plan')) return;

    var pid = tpPlanId(plan);
    var enCola = (plan.items || []).filter(function(i) { return i.status === 'carryover'; }).length;
    showConfirmDialog({
        title: '↩️ Desaceptar el plan',
        message: 'La semana del ' + (plan.weekDate || '—') + ' vuelve a quedar como propuesta.\n\n' +
                 (enCola ? enCola + ' configuración(es) saldrán de la cola de pendientes.\n' : '') +
                 'Las pruebas ya realizadas siguen contando: la cobertura no cambia.',
        type: 'warning', confirmText: 'Desaceptar', cancelText: 'Cancelar'
    }).then(function(ok) {
        if (!ok) return;
        if (typeof undoPush === 'function') undoPush('testplan', 'Desaceptar plan semanal');
        plan.accepted = false;
        delete plan.acceptedDate;
        (plan.items || []).forEach(function(i) { if (i.status === 'carryover') delete i.status; });
        tpState.weekHistory = (tpState.weekHistory || []).filter(function(w) { return !w || w.planId !== pid; });
        if (typeof tpBacklogInvalidate === 'function') tpBacklogInvalidate();
        if (typeof tpInvalidateCache === 'function') tpInvalidateCache();
        tpSave(); tpRender(); tpUpdateBadges();
        if (typeof auditLog === 'function') {
            auditLog('tp', 'week_unaccepted', { type: 'plan', label: plan.weekDate || pid }, enCola + ' salieron de la cola');
        }
        showToast(enCola ? enCola + ' configuración(es) salieron de la cola. La cobertura no cambia — probar es lo que la mueve.'
                         : 'Plan desaceptado.', 'success');
    });
}

/**
 * Borrar — reemplaza al `splice` inline que no dejaba rastro.
 * Se NIEGA a borrar una semana aceptada: primero hay que desaceptarla. Dos pasos
 * para lo destructivo, en un dataset compartido y sincronizado, es lo correcto y
 * además hace legible la auditoría.
 */
function tpDeleteWeeklyPlan(weekIdx) {
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan) return;
    if (typeof authRequire === 'function' && !authRequire('plan.manage', 'eliminar un plan')) return;

    if (plan.accepted) {
        showConfirmDialog({
            title: '⚠️ Ese plan está aceptado',
            message: 'La semana del ' + (plan.weekDate || '—') + ' está aceptada.\n\n' +
                     'Desacéptala primero: así el histórico y la cola quedan consistentes en vez de dejar registros huérfanos.',
            type: 'warning', confirmText: '↩️ Desaceptar', cancelText: 'Cancelar'
        }).then(function(ok) { if (ok) tpUnacceptWeeklyPlan(weekIdx); });
        return;
    }

    var items = plan.items || [];
    var declaradas = items.filter(function(i) { return i.completed && i.declared; }).length;
    var hechas = items.filter(function(i) { return i.completed; }).length;
    var aviso = '';
    if (hechas) {
        aviso = '\n\n' + hechas + ' prueba(s) marcadas como hechas: las que se liberaron en Pruebas ' +
                'siguen contando en la cobertura.';
        if (declaradas) aviso += '\n' + declaradas + ' fue(ron) declarada(s) a mano — quedan registradas en Probados.';
    }
    showConfirmDialog({
        title: '🗑 Eliminar el plan',
        message: 'Semana del ' + (plan.weekDate || '—') + ' · ' + items.length + ' prueba(s) planeadas.' + aviso,
        type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar'
    }).then(function(ok) {
        if (!ok) return;
        if (typeof undoPush === 'function') undoPush('testplan', 'Eliminar plan semanal');
        var pid = tpPlanId(plan);
        tpState.weeklyPlans.splice(weekIdx, 1);
        tpState.weekHistory = (tpState.weekHistory || []).filter(function(w) { return !w || w.planId !== pid; });
        if (typeof tpBacklogInvalidate === 'function') tpBacklogInvalidate();
        if (typeof tpInvalidateCache === 'function') tpInvalidateCache();
        tpSave(); tpRender(); tpUpdateBadges();
        if (typeof auditLog === 'function') {
            auditLog('tp', 'week_deleted', { type: 'plan', label: plan.weekDate || pid }, items.length + ' prueba(s) planeadas');
        }
        showToast('Plan eliminado. Las pruebas ya realizadas siguen contando: la cobertura no bajó.', 'success');
    });
}

// ══════════════════════════════════════════════════════════════
// AUTO-PLAN: Friday 14:00 deadline auto-generation
// ══════════════════════════════════════════════════════════════

var AUTOPLAN_LS_KEY = 'kia_autoplan_lastrun';

function tpShouldAutoGenerate() {
    if (!tpState || !tpState.planData || tpState.planData.length === 0) return false;

    var now = new Date();
    var day = now.getDay(); // 0=dom, 5=vie, 6=sab
    var isPastDeadline = (day === 5 && now.getHours() >= 14) || day === 6 || day === 0;
    if (!isPastDeadline) return false;

    // Calculate next Monday
    var daysUntilMon = (8 - day) % 7;
    if (daysUntilMon === 0) daysUntilMon = 7;
    var nextMon = new Date(now);
    nextMon.setDate(now.getDate() + daysUntilMon);
    var nextMonISO = localDateStr(nextMon);

    // ¿Ya hay un plan para esa semana? Antes solo se rechazaba si estaba ACEPTADO;
    // ahora que el auto-plan deja una propuesta sin aceptar, hay que mirar cualquiera,
    // o cada dispositivo agregaría la suya.
    var plans = tpState.weeklyPlans || [];
    if (plans.some(function (p) { return p.weekDate === nextMonISO; })) return false;

    // ¿Ya corrió para esta semana? El guard vive en tpState (SINCRONIZADO); la clave
    // de localStorage se conserva como respaldo offline del mismo dispositivo.
    if (tpState.autoPlanLastRun === nextMonISO) return false;
    var lastRun = null;
    try { lastRun = localStorage.getItem(AUTOPLAN_LS_KEY); } catch (e) {}
    if (lastRun === nextMonISO) return false;

    return { nextMonday: nextMonISO };
}

function tpAutoGenerateIfNeeded() {
    var check = tpShouldAutoGenerate();
    if (!check) return;

    // Set the date target before generating
    var dateEl = document.getElementById('tp-weekly-date');
    if (dateEl) dateEl.value = check.nextMonday;

    if (typeof showToast === 'function') showToast('Generando plan semanal automatico (viernes 14:00+)...', 'info');

    try {
        tpSmartGenerate();
        var lastIdx = tpState.weeklyPlans.length - 1;
        if (lastIdx >= 0 && tpState.weeklyPlans[lastIdx].smartGenerated) {
            tpState.weeklyPlans[lastIdx].weekDate = check.nextMonday;
            tpState.weeklyPlans[lastIdx].autoGenerated = true;
            // NO se acepta sola. Aceptar es justo lo que marca cada item incompleto como
            // 'carryover' en weekHistory; hacerlo al cargar la página, en cada dispositivo,
            // era la fábrica de arrastre. Queda como PROPUESTA para que alguien la revise.
            tpState.autoPlanLastRun = check.nextMonday;
            tpSave();
            try { localStorage.setItem(AUTOPLAN_LS_KEY, check.nextMonday); } catch (e) {}
            tpRender();

            if (typeof showToast === 'function') showToast('Propuesta de la semana ' + check.nextMonday + ' lista — falta aceptarla', 'success');
            if (typeof emitEvent === 'function') emitEvent('plan:autoGenerated', { weekDate: check.nextMonday, itemCount: tpState.weeklyPlans[lastIdx].items.length });
        }
    } catch (e) {
        console.error('tpAutoGenerateIfNeeded error:', e);
        if (typeof showToast === 'function') showToast('Error en auto-generacion: ' + e.message, 'error');
    }
}

function tpCarryOverWeekly(weekIdx) {
    if (!tpState.weeklyPlans || !tpState.weeklyPlans[weekIdx]) return;
    var source = tpState.weeklyPlans[weekIdx];
    var pending = source.items.filter(function(i) { return !i.completed; });
    if (pending.length === 0) { showToast('No hay items pendientes para copiar', 'info'); return; }
    // Mark source items as carryover
    pending.forEach(function(i) { i.status = 'carryover'; });
    var newItems = pending.map(function(i) {
        return { desc:i.desc, id:i.id, mod:i.mod, rgn:i.rgn, reg:i.reg, eng:i.eng, tx:i.tx, my:i.my, drv:i.drv, body:i.body, ep:i.ep, engpkg:i.engpkg, tire:i.tire, required:i.required, deficit:i.deficit, score:i.score, completed:false, completedDate:null, manual:i.manual, carriedOver:true, previouslySubstituted:i.substituted||false, previousSubstitution:i.substitution||null };
    });
    tpState.weeklyPlans.push({ id:Date.now(), created:new Date().toISOString(), capacity:newItems.length, items:newItems, accepted:false, carriedFrom:weekIdx+1 });
    tpSave(); tpRender();
    showToast(pending.length + ' items pendientes copiados a nueva semana (marcados como carryover)', 'success');
}

// ═══ WEEK HISTORY TAB ═══
function tpRenderWeekHistory(el) {
    if (!tpState.weekHistory) tpState.weekHistory = [];
    const hist = tpState.weekHistory;
    if (hist.length === 0) {
        el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">No hay semanas archivadas. Las semanas se archivan automaticamente al aceptarlas.</div>';
        return;
    }
    const dayLabels = {dom:'D',lun:'L',mar:'M',mie:'X',jue:'J',vie:'V',sab:'S'};
    const dayFull = {dom:'Domingo',lun:'Lunes',mar:'Martes',mie:'Miercoles',jue:'Jueves',vie:'Viernes',sab:'Sabado'};
    // Summary metrics
    const totalWeeks = hist.length;
    const totalCompleted = hist.reduce((s,h) => s + h.completed, 0);
    const totalCarryover = hist.reduce((s,h) => s + (h.carryover||0), 0);
    const totalItems = hist.reduce((s,h) => s + h.total, 0);
    const avgPct = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;

    let html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;margin-bottom:10px;">
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue);">${totalWeeks}</div><div class="tp-metric-label">Semanas</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green);">${totalCompleted}</div><div class="tp-metric-label">Completados</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:#8b5cf6;">${totalCarryover}</div><div class="tp-metric-label">Carryover</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber);">${avgPct}%</div><div class="tp-metric-label">Cumplimiento</div></div>
    </div>`;

    // List each archived week (newest first)
    hist.slice().reverse().forEach((h, ri) => {
        const hi = hist.length - 1 - ri;
        const pct = h.total > 0 ? Math.round((h.completed / h.total) * 100) : 0;
        const dt = h.weekDate ? new Date(h.weekDate + 'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}) : new Date(h.created).toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'});
        const acceptDt = h.acceptedDate ? new Date(h.acceptedDate).toLocaleDateString('es-MX',{day:'numeric',month:'short'}) : '';
        const wdStr = h.workDays ? Object.keys(dayLabels).filter(d => h.workDays[d]).map(d => dayLabels[d]).join('') : '';
        const isExpanded = window._tpHistExpand === hi;

        html += `
        <div class="tp-card" style="border-left:3px solid ${pct===100?'var(--tp-green)':h.carryover>0?'#8b5cf6':'var(--tp-amber)'};">
            <div onclick="window._tpHistExpand=${isExpanded?-1:hi};tpRender();" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">
                <div>
                    <span style="font-size:12px;font-weight:700;">Sem ${h.weekNum}</span>
                    <span style="font-size: var(--fs-xs);color:var(--tp-dim);">${dt}</span>
                    ${wdStr ? `<span style="font-size: var(--fs-xs);color:var(--tp-blue);background:rgba(59,130,246,0.1);padding:1px 4px;border-radius:3px;">${wdStr}</span>` : ''}
                    <span class="tp-badge" style="background:rgba(16,185,129,0.15);color:var(--tp-green);font-size: var(--fs-xs);">Aceptado ${acceptDt}</span>
                    ${h.carryover>0?`<span class="tp-badge" style="background:rgba(139,92,246,0.15);color:#8b5cf6;font-size: var(--fs-xs);">${h.carryover} carryover</span>`:''}
                </div>
                <div style="display:flex;align-items:center;gap:5px;">
                    <span style="font-size: var(--fs-sm);font-weight:700;color:${pct===100?'var(--tp-green)':'var(--tp-amber)'};">${h.completed}/${h.total}</span>
                    <div class="tp-bar" style="width:50px;"><div class="tp-bar-fill" style="width:${pct}%;background:${pct===100?'var(--tp-green)':'var(--tp-amber)'}"></div><span class="tp-bar-text" style="font-size: var(--fs-xs);">${pct}%</span></div>
                    <span style="font-size:12px;color:var(--tp-dim);">${isExpanded?'▲':'▼'}</span>
                </div>
            </div>
            ${isExpanded && h.items ? `
            <div style="margin-top:8px;border-top:1px solid var(--tp-border);padding-top:8px;">
                ${h.items.map(item => `
                <div style="display:flex;align-items:center;gap:5px;padding:4px 8px;margin-bottom:3px;border:1px solid ${item.status==='carryover'?'rgba(139,92,246,0.3)':item.completed?'rgba(16,185,129,0.2)':'var(--tp-border)'};border-radius:6px;background:${item.completed?'rgba(16,185,129,0.05)':item.status==='carryover'?'rgba(139,92,246,0.04)':'var(--tp-card)'};opacity:${item.completed?0.7:1};flex-wrap:wrap;">
                    <span style="font-size:13px;">${item.completed?'✅':item.status==='carryover'?'🔄':'⬜'}</span>
                    ${item.carriedOver?'<span style="font-size: var(--fs-xs);color:#8b5cf6;background:rgba(139,92,246,0.1);padding:1px 3px;border-radius:2px;">carryover</span>':''}
                    ${item.substituted?'<span style="font-size: var(--fs-xs);color:var(--warn-text);background:rgba(245,158,11,0.1);padding:1px 4px;border-radius:2px;" title="'+(item.substitution?item.substitution.differences.map(function(d){return d.label+': '+d.planned+' → '+d.actual;}).join(', '):'')+'">🔄 sustituido</span>':''}
                    ${item.manual&&!item.carriedOver?'<span style="font-size: var(--fs-xs);color:var(--tp-amber);">📌</span>':''}
                    ${tpConfigBadges(item,{fontSize:'var(--fs-xs)'})}
                    ${item.testLabel?`<span style="font-size: var(--fs-xs);color:var(--tp-blue);background:rgba(59,130,246,0.1);padding:1px 4px;border-radius:3px;margin-left:auto;">Preacon ${item.preconLabel} → Prueba ${item.testLabel}</span>`:''}
                </div>`).join('')}
            </div>` : ''}
        </div>`;
    });

    // Delete history button
    html += `<div style="text-align:center;margin-top:10px;"><button class="tp-btn tp-btn-ghost" onclick="showConfirm('¿Borrar todo el historial de semanas?',function(){tpState.weekHistory=[];tpSave();tpRender();},{title:'Borrar historial',type:'danger',confirmText:'Borrar todo'})" style="font-size: var(--fs-xs);color:var(--tp-red);">Borrar historial</button></div>`;

    el.innerHTML = html;
}

// ── Auto-mark weekly items when COP15 releases match ──
/**
 * v20: acredita la semana EN CURSO primero.
 * Antes recorría `weeklyPlans` en orden de creación y marcaba el PRIMER item con ese
 * `desc` en CUALQUIER semana: liberar hoy acreditaba una semana de hace un mes, la de
 * hoy seguía en rojo y la vieja aparecía cumplida retroactivamente. El orden nuevo es
 * semana en curso → semanas más recientes hacia atrás.
 */
function tpAutoMarkWeeklyCompletion(configText, opts) {
    if (!tpState.weeklyPlans || tpState.weeklyPlans.length === 0) return false;
    var hoyMon = null;
    try {
        if (typeof _tpMonday === 'function' && typeof _tpFmtDate === 'function') hoyMon = _tpFmtDate(_tpMonday(new Date()));
    } catch (e) {}

    var orden = tpState.weeklyPlans.map(function(p, i) { return { p: p, i: i }; });
    orden.sort(function(a, b) {
        var aH = (hoyMon && a.p && a.p.weekDate === hoyMon) ? 1 : 0;
        var bH = (hoyMon && b.p && b.p.weekDate === hoyMon) ? 1 : 0;
        if (aH !== bH) return bH - aH;                 // la semana en curso, primero
        var aD = String((a.p && a.p.weekDate) || ''), bD = String((b.p && b.p.weekDate) || '');
        if (aD !== bD) return bD < aD ? -1 : 1;        // luego, de la más reciente hacia atrás
        return b.i - a.i;
    });

    for (var k = 0; k < orden.length; k++) {
        var plan = orden[k].p;
        if (!plan || !plan.items) continue;
        for (var j = 0; j < plan.items.length; j++) {
            var item = plan.items[j];
            if (!item.completed && item.desc === configText) {
                item.completed = true;
                item.completedDate = localToday();
                if (typeof tpSyncWeekHistoryFor === 'function') tpSyncWeekHistoryFor(tpPlanId(plan));
                if (!(opts && opts.skipSave)) tpSave();
                console.log('TP: Auto-marked weekly item as completed:', configText, '· semana', plan.weekDate);
                return true;
            }
        }
    }
    return false;
}

// Prefer an explicit plan link on the vehicle when present (set by
// cop15PreloadFromPlan). This is more reliable than matching by
// configCode string, especially when the catalog has near-duplicates.
function tpAutoMarkWeeklyCompletionFromVehicle(vehicle, opts) {
    if (!vehicle || !tpState.weeklyPlans) return false;
    var link = vehicle.fromPlanItem;
    if (link && typeof link.itemIdx === 'number') {
        // v20: el enlace se resuelve por planId (identidad estable). weekIdx queda como
        // respaldo para los vehículos registrados antes de esta versión — pero es un
        // índice de array, así que un borrado lo deja apuntando a otra semana.
        var wi = (link.planId && typeof tpFindPlanIndexById === 'function')
                 ? tpFindPlanIndexById(link.planId) : -1;
        if (wi < 0 && typeof link.weekIdx === 'number') wi = link.weekIdx;
        var plan = tpState.weeklyPlans[wi];
        if (plan && plan.items && plan.items[link.itemIdx]) {
            var item = plan.items[link.itemIdx];
            if (!item.completed && item.desc === link.configCode) {
                item.completed = true;
                item.completedDate = localToday();
                // La foto archivada se re-sincroniza SIEMPRE (antes se congelaba en
                // completed:false para siempre); guardar respeta skipSave, porque la
                // cascada de liberación hace un único tpSave al final.
                if (typeof tpSyncWeekHistoryFor === 'function') tpSyncWeekHistoryFor(tpPlanId(plan));
                if (!(opts && opts.skipSave)) tpSave();
                console.log('TP: Auto-marked weekly item via plan link:', link.configCode);
                return true;
            }
        }
    }
    // Fall back to the legacy description-based match
    return tpAutoMarkWeeklyCompletion(vehicle.configCode, opts);
}

// ── Flexible Substitution ──
// Maps vehicle.config full field names → weekly plan item short field names
var _tpFieldMap = {
    'Modelo': 'mod',
    'MODEL YEAR (VIN)': 'my',
    'ENGINE CAPACITY': 'eng',
    'TRANSMISSION': 'tx',
    'ENVIRONMENT PACKAGE': 'ep',
    'EMISSION REGULATION': 'reg',
    'REGION': 'rgn',
    'TIRE ASSY': 'tire',
    'BODY TYPE': 'body',
    'DRIVE TYPE': 'drv',
    'ENGINE PACKAGE': 'engpkg'
};

// Core fields that MUST match for substitution eligibility
var _tpCoreFields = ['mod', 'eng', 'tx', 'my', 'reg', 'rgn'];
// Flexible fields that CAN differ
var _tpFlexFields = ['tire', 'body', 'drv', 'ep', 'engpkg'];
var _tpFlexLabels = { tire: 'Rin/Llanta', body: 'Tipo Carrocería', drv: 'Tipo Tracción', ep: 'Paq. Ambiental', engpkg: 'Paq. Motor' };

function tpFindFlexibleMatches(configCode, vehicleConfig) {
    if (!tpState.weeklyPlans || tpState.weeklyPlans.length === 0) return [];
    if (!vehicleConfig) return [];

    // Extract short fields from vehicle config
    var vFields = {};
    for (var fullName in _tpFieldMap) {
        var short = _tpFieldMap[fullName];
        vFields[short] = (vehicleConfig[fullName] || '').trim();
    }

    var matches = [];

    for (var pi = 0; pi < tpState.weeklyPlans.length; pi++) {
        var plan = tpState.weeklyPlans[pi];
        if (!plan.items) continue;
        for (var ii = 0; ii < plan.items.length; ii++) {
            var item = plan.items[ii];
            if (item.completed) continue;
            if (item.desc === configCode) continue; // skip exact matches

            // Check core fields match
            var coreMatch = true;
            for (var ci = 0; ci < _tpCoreFields.length; ci++) {
                var f = _tpCoreFields[ci];
                var vVal = (vFields[f] || '').toUpperCase();
                var iVal = (item[f] || '').toUpperCase();
                if (vVal !== iVal) { coreMatch = false; break; }
            }
            if (!coreMatch) continue;

            // Compute differences in flex fields
            var diffs = [];
            for (var fi = 0; fi < _tpFlexFields.length; fi++) {
                var ff = _tpFlexFields[fi];
                var vv = (vFields[ff] || '').toUpperCase();
                var iv = (item[ff] || '').toUpperCase();
                if (vv !== iv && (vv || iv)) {
                    diffs.push({ field: ff, label: _tpFlexLabels[ff] || ff, planned: item[ff] || '—', actual: vehicleConfig[_tpFieldMapReverse(ff)] || '—' });
                }
            }

            if (diffs.length > 0) {
                matches.push({ planIdx: pi, itemIdx: ii, planId: plan.id, item: item, diffs: diffs });
            }
        }
    }

    // Sort by fewest differences
    matches.sort(function(a, b) { return a.diffs.length - b.diffs.length; });
    return matches;
}

function _tpFieldMapReverse(shortName) {
    for (var k in _tpFieldMap) {
        if (_tpFieldMap[k] === shortName) return k;
    }
    return shortName;
}

function tpSubstituteItem(planIdx, itemIdx, testedConfigCode, testedVin, diffs) {
    var plan = tpState.weeklyPlans[planIdx];
    if (!plan || !plan.items || !plan.items[itemIdx]) return false;
    var item = plan.items[itemIdx];

    item.completed = true;
    item.completedDate = localToday();
    item.substituted = true;
    item.substitution = {
        originalDesc: item.desc,
        testedDesc: testedConfigCode,
        testedVin: testedVin,
        differences: diffs
    };

    tpSave();
    console.log('TP: Substituted weekly item:', item.desc, '→', testedConfigCode);
    return true;
}


// ═══════════════════════════════════════════════════════════════════════════════
// [v20] SUSTITUIR DESDE LA UI
//
// `tpFindFlexibleMatches` y `tpSubstituteItem` ya existían y funcionan, pero solo
// los disparaba la cascada de liberación: iban en la dirección "ya probé este
// vehículo, ¿a qué renglón del plan lo acredito?".
//
// Lo que faltaba es la otra dirección, que es la que pidió el laboratorio: "el
// vehículo de esta fila no llegó, ¿qué variante puedo correr en su lugar?".
// CERO matemática nueva: se reusan las MISMAS listas `_tpCoreFields`/`_tpFlexFields`
// que decide la elegibilidad en la liberación, así que las dos direcciones no se
// pueden desincronizar.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * [v20.1] Los TRES niveles de cercanía de una sustitución. El laboratorio pidió poder
 * salir de la familia estricta ("cualquier Europe de la misma regulación"), pero eso
 * NO puede pasar en silencio: a mayor distancia, menos equivalente es lo que se corre.
 * Cada nivel declara qué campos exige iguales y qué tan lejos queda de lo planeado.
 */
var TP_SUBST_SCOPES = {
    familia: { label: '🎯 Misma familia', keep: _tpCoreFields,
               nota: 'Mismo modelo, motor, transmisión, año, norma y región. Solo cambia rin, carrocería, tracción o paquete — es la sustitución equivalente.' },
    norma:   { label: '📋 Misma región y norma', keep: ['rgn', 'reg'],
               nota: 'Mismo mercado y misma regulación de emisiones, pero PUEDE cambiar el modelo, el motor o la transmisión. Ya no es un vehículo equivalente: sirve para cubrir la norma, no para sustituir esa familia.' },
    region:  { label: '🌍 Misma región', keep: ['rgn'],
               nota: 'Solo comparte el mercado. Cambia hasta la norma de emisiones — úsalo cuando lo que importa es aprovechar la celda, no cubrir esta configuración.' }
};

/**
 * LA definición de "qué puedo correr en lugar de esto".
 * `opts.scope` = 'familia' (default) | 'norma' | 'region'.
 * Cero matemática nueva en el nivel 'familia': sigue usando las MISMAS listas
 * `_tpCoreFields`/`_tpFlexFields` que decide la elegibilidad en la liberación.
 */
function tpSubstituteCandidatesFor(item, opts) {
    if (!item) return [];
    opts = opts || {};
    var scope = TP_SUBST_SCOPES[opts.scope] ? opts.scope : 'familia';
    var keep = TP_SUBST_SCOPES[scope].keep;
    var base = (tpState.planData || []).find(function(p) { return p.desc === item.desc; }) || item;
    var an = (typeof tpGetAnalysis === 'function') ? tpGetAnalysis() : [];
    var porDesc = {};
    an.forEach(function(a) { porDesc[a.desc] = a; });

    var out = [];
    (tpState.planData || []).forEach(function(c) {
        if (c.desc === item.desc) return;
        for (var i = 0; i < keep.length; i++) {
            var f = keep[i];
            if (String(base[f] || '').toUpperCase() !== String(c[f] || '').toUpperCase()) return;
        }
        // Las diferencias se listan sobre TODOS los campos que importan, no solo los
        // flexibles: fuera del nivel 'familia' lo que cambia puede ser el motor, y
        // ocultarlo sería justo lo peligroso.
        var campos = scope === 'familia' ? _tpFlexFields : _tpCoreFields.concat(_tpFlexFields);
        var diffs = [], rompeNucleo = false;
        campos.forEach(function(ff) {
            var a = String(base[ff] || '').toUpperCase(), b = String(c[ff] || '').toUpperCase();
            if (a === b || (!a && !b)) return;
            if (_tpCoreFields.indexOf(ff) !== -1) rompeNucleo = true;
            diffs.push({ field: ff, label: _tpFlexLabels[ff] || _tpFieldLabel(ff), planned: base[ff] || '—', actual: c[ff] || '—' });
        });
        if (!diffs.length) return;   // idéntica: no es una sustitución
        var a2 = porDesc[c.desc] || {};
        out.push({ cfg: c, desc: c.desc, diffs: diffs, scope: scope, breaksCore: rompeNucleo,
                   deficit: a2.deficit || 0, required: a2.required || 0, testedN: a2.testedN || 0,
                   paused: !!c.paused });
    });
    // Primero la equivalente, luego la que más falta hace, luego la que menos se aleja.
    out.sort(function(x, y) {
        return (x.breaksCore - y.breaksCore) || (y.deficit - x.deficit) || (x.diffs.length - y.diffs.length);
    });
    return out;
}

/** Etiqueta legible de un campo del núcleo (los flexibles ya tienen `_tpFlexLabels`). */
function _tpFieldLabel(f) {
    return ({ mod: 'Modelo', eng: 'Motor', tx: 'Transmisión', my: 'Año', reg: 'Regulación', rgn: 'Región' })[f] || f;
}

/**
 * Cambia la configuración de una fila del plan por una variante compatible.
 * NO la marca como hecha: sustituir es reprogramar qué se va a correr, no declarar
 * que ya se corrió. (`tpSubstituteItem`, que sí acredita, sigue siendo lo que usa
 * la cascada de liberación — son dos cosas distintas y se quedan separadas.)
 */
function tpSwapItemConfig(weekIdx, itemIdx, nuevoDesc, opts) {
    opts = opts || {};
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan || !plan.items || !plan.items[itemIdx]) return { ok: false, reason: 'No se encontró esa prueba.' };
    var item = plan.items[itemIdx];
    if (item.completed) return { ok: false, reason: 'Esa prueba ya está marcada como hecha.' };
    var nueva = (tpState.planData || []).find(function(p) { return p.desc === nuevoDesc; });
    if (!nueva) return { ok: false, reason: 'Esa configuración ya no está en el plan de producción.' };

    // v20.1: se busca en el nivel pedido y, si no aparece, se va ampliando. Así el
    // llamador no tiene que saber de antemano en qué nivel cae la candidata.
    var cand = null, scopeUsado = null;
    ['familia', 'norma', 'region'].forEach(function(sc) {
        if (cand) return;
        var c = tpSubstituteCandidatesFor(item, { scope: sc }).find(function(x) { return x.desc === nuevoDesc; });
        if (c) { cand = c; scopeUsado = sc; }
    });
    if (!cand) return { ok: false, reason: 'Esa configuración no comparte ni la región con la planeada — no se puede sustituir.' };

    if (typeof undoPush === 'function') undoPush('testplan', 'Sustituir configuración del plan');

    var original = item.desc;
    ['mod','eng','tx','my','reg','rgn','ep','engpkg','body','drv','tire'].forEach(function(f) {
        if (nueva[f] !== undefined) item[f] = nueva[f];
    });
    item.desc = nueva.desc;
    item.substituted = true;
    item.substitution = { originalDesc: original, testedDesc: nueva.desc, testedVin: null,
                          differences: cand.diffs, swappedAt: new Date().toISOString(),
                          // El nivel queda GRABADO: una sustitución "misma región" no es
                          // lo mismo que una equivalente, y dentro de un mes nadie se
                          // acuerda de cuál fue cuál si no está escrito.
                          scope: scopeUsado, breaksCore: !!cand.breaksCore,
                          by: (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '',
                          reason: opts.reason || '' };

    // El soak puede cambiar con la variante; se recongela para que el par siga siendo
    // legal, y si deja de serlo la fila se queda sin día y lo DECLARA (no se esconde).
    var soak = tpSoakHoursFor(nueva);
    item.soakHours = soak.hours; item.soakSource = soak.source;
    var par = tpSlotsForSoak(soak.hours, tpWorkDaysFor(plan)).filter(function(s) { return s.test === item.testDay; })[0];
    if (!par) {
        var libres = tpSlotsForSoak(soak.hours, tpWorkDaysFor(plan)).filter(function(s) { return !s.spillsNextWeek; });
        if (libres.length) { item.preconDay = libres[0].precon; item.testDay = libres[0].test;
                             item.preconLabel = libres[0].preconLabel; item.testLabel = libres[0].testLabel; }
        else { item.preconDay = null; item.testDay = null; item.preconLabel = null; item.testLabel = null; item.unscheduled = true; }
    } else { item.preconDay = par.precon; item.preconLabel = par.preconLabel; }

    tpBoardInvalidate();
    _tpTouchPlan(weekIdx);
    if (typeof auditLog === 'function') {
        auditLog('tp', 'week_item_substituted', { type: 'plan', label: nueva.desc },
                 'Sustituye a ' + original + ' · alcance ' + scopeUsado + (cand.breaksCore ? ' (NO equivalente: cambia el núcleo)' : '') +
                 ' · ' + cand.diffs.map(function(d) { return d.label + ': ' + d.planned + ' → ' + d.actual; }).join(', '));
    }
    return { ok: true, from: original, to: nueva.desc, diffs: cand.diffs, testDay: item.testDay,
             scope: scopeUsado, breaksCore: !!cand.breaksCore };
}

/**
 * El modal de sustitución. v20.1: tres niveles de cercanía, y el que se aleja del
 * núcleo se marca — el laboratorio pidió poder salir de la familia estricta, pero eso
 * no puede pasar en silencio.
 */
function tpOpenSubstituteModal(weekIdx, itemIdx, scope) {
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan || !plan.items || !plan.items[itemIdx]) return;
    var item = plan.items[itemIdx];
    scope = TP_SUBST_SCOPES[scope] ? scope : 'familia';
    var info = TP_SUBST_SCOPES[scope];
    var cands = tpSubstituteCandidatesFor(item, { scope: scope });

    var body = '<div class="tp-week-movebox">' +
        '<p class="tp-week-movehint">En lugar de <strong>' + tpConfigShortName(item) + '</strong>' +
        (tpConfigVariantTag(item) ? ' · ' + tpConfigVariantTag(item) : '') + '</p>';

    // Selector de alcance, siempre visible: es la decisión, no un ajuste escondido.
    body += '<div class="tp-subst-scopes">';
    Object.keys(TP_SUBST_SCOPES).forEach(function(k) {
        var n = tpSubstituteCandidatesFor(item, { scope: k }).length;
        body += '<button class="tp-subst-scope' + (k === scope ? ' tp-subst-scope--on' : '') + '" ' +
                'onclick="document.getElementById(\'globalModal\').remove();tpOpenSubstituteModal(' + weekIdx + ',' + itemIdx + ',\'' + k + '\')">' +
                TP_SUBST_SCOPES[k].label + ' <span class="tp-subst-scope-n">' + n + '</span></button>';
    });
    body += '</div>';
    body += '<p class="tp-subst-nota' + (scope === 'familia' ? '' : ' tp-subst-nota--warn') + '">' +
            (scope === 'familia' ? '' : '⚠️ ') + info.nota + '</p>';

    if (!cands.length) {
        body += '<div class="tp-week-col-empty">No hay ninguna candidata en este alcance.</div>';
    } else {
        cands.slice(0, 15).forEach(function(c) {
            var titulo = c.breaksCore ? tpConfigShortName(c.cfg) : (tpConfigVariantTag(c.cfg) || tpConfigShortName(c.cfg));
            body += '<button class="tp-week-movebtn' + (c.breaksCore ? ' tp-week-movebtn--full' : '') + (c.paused ? ' tp-week-movebtn--danger' : '') + '" ' +
                    'onclick="tpDoSwapItem(' + weekIdx + ',' + itemIdx + ',\'' + _tpQ(c.desc) + '\')">' +
                    '<span class="tp-week-movebtn-day">' + (c.breaksCore ? '⚠️ ' : '') + titulo + '</span>' +
                    '<span class="tp-week-movebtn-sub">' +
                      c.diffs.map(function(d) { return d.label + ': ' + d.planned + ' → ' + d.actual; }).join(' · ') +
                      ' · faltan ' + c.deficit + ' de ' + c.required +
                      (c.paused ? ' · PAUSADA' : '') +
                    '</span></button>';
        });
        if (cands.length > 15) body += '<p class="tp-week-movehint">y ' + (cands.length - 15) + ' más — se muestran las más cercanas y las que más falta hacen.</p>';
    }
    body += '</div>';
    showModal({ title: '🔄 Sustituir', type: 'info', body: body, buttons: [{ label: 'Cerrar', cls: '' }] });
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v20.1] VINCULAR CON UNA PRUEBA — el respaldo manual del acreditado automático
//
// `tpAutoFeedFromRelease` / `tpAutoMarkWeeklyCompletionFromVehicle` ya acreditan solos
// al liberar, pero solo cuando el `configCode` coincide EXACTO y el vehículo se dio de
// alta desde el plan. En el laboratorio real eso falla seguido: el vehículo se registró
// por fuera, o se corrió una variante, o son dos idénticos y hay que decir cuál es cuál.
// Sin esta puerta la única salida era la palomita a mano, que deja la prueba "declarada"
// aunque SÍ exista el vehículo y su evidencia.
//
// Vincular es lo contrario de declarar: **sí hay evidencia y aquí está el VIN**.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * [v20.8] El candado: un vehículo real es UNA prueba — nunca puede acreditar dos filas
 * del plan a la vez, ni siquiera en semanas distintas. Devuelve `{itemRef: vehicleId}`
 * de TODOS los `tpState.weeklyPlans`, no solo la semana que se está viendo — antes
 * `tpLinkableVehiclesFor`/`tpLinkVehicleToItem` solo miraban `plan.items` de la semana
 * abierta, así que el mismo VIN se podía vincular otra vez en una semana distinta sin
 * ningún aviso. Dos pruebas que de verdad necesitan el mismo VIN (reensayo tras una
 * reparación, por ejemplo) siguen siendo posibles: hay que desvincular la anterior
 * primero (`tpUnlinkVehicleFromItem`) — el candado impide el descuido, no el caso real.
 */
function _tpVehicleLinksElsewhere(excludeItem) {
    var out = {};
    (tpState.weeklyPlans || []).forEach(function(p) {
        (p && p.items || []).forEach(function(it) {
            if (it !== excludeItem && it.linkedVehicleId != null) out[it.linkedVehicleId] = it;
        });
    });
    return out;
}

/**
 * LA definición de "qué pruebas puedo vincular a esta fila". Ordena por cercanía:
 * primero la configuración exacta, luego la misma familia, luego el resto de la semana.
 * NO se limita a lo liberado: un vehículo en curso también se puede vincular, que es
 * justo lo que hace falta cuando se registró por fuera del plan.
 */
function tpLinkableVehiclesFor(item, opts) {
    opts = opts || {};
    if (!item || typeof db !== 'object' || !db || !Array.isArray(db.vehicles)) return [];
    var plan = opts.plan || null;
    var d0 = plan && plan.weekDate ? plan.weekDate : null;
    var d1 = null;
    if (d0) {
        var f = new Date(d0 + 'T00:00:00');
        if (!isNaN(f.getTime())) { f.setDate(f.getDate() + 6); d1 = (typeof _tpFmtDate === 'function') ? _tpFmtDate(f) : null; }
    }
    var base = (tpState.planData || []).find(function(c) { return c.desc === item.desc; }) || item;
    var famBase = (typeof tpFamilyKeyForCfg === 'function') ? tpFamilyKeyForCfg(base) : null;

    // Ya vinculado a OTRA fila — de esta semana o de cualquier otra: no se ofrece dos veces.
    var tomados = _tpVehicleLinksElsewhere(item);

    var out = [];
    db.vehicles.forEach(function(v) {
        if (!v || tomados[v.id]) return;
        var fecha = (v.archivedAt || v.registeredAt || v.createdAt || '');
        fecha = String(fecha).slice(0, 10);
        // Fuera de la semana solo se ofrece si el usuario lo pide (`opts.all`): el caso
        // normal es "lo que se corrió esta semana".
        var enSemana = !d0 || !fecha || (fecha >= d0 && fecha <= d1);
        if (!enSemana && !opts.all) return;

        var cfgV = (tpState.planData || []).find(function(c) { return c.desc === v.configCode; });
        var famV = cfgV && famBase ? tpFamilyKeyForCfg(cfgV) : null;
        var cercania = (v.configCode === item.desc) ? 0 : (famV && famV === famBase) ? 1 : 2;

        out.push({
            vehicle: v, id: v.id, vin: v.vin || '', configCode: v.configCode || '',
            shortName: cfgV ? tpConfigShortName(cfgV) : (v.configCode || '—'),
            variantTag: cfgV ? tpConfigVariantTag(cfgV) : '',
            status: v.status, statusLabel: (typeof CONFIG === 'object' && CONFIG.statusLabels && CONFIG.statusLabels[v.status]) || v.status,
            released: v.status === 'archived', date: fecha, inWeek: enSemana, cercania: cercania,
            exact: v.configCode === item.desc
        });
    });
    // Liberadas primero dentro de cada nivel de cercanía: son la evidencia más fuerte.
    out.sort(function(a, b) {
        return (a.cercania - b.cercania) || (b.released - a.released) || String(b.date).localeCompare(String(a.date));
    });
    return out;
}

/**
 * Vincula un vehículo real a una fila del plan y la acredita.
 * Si la configuración del vehículo NO es la planeada, se registra como SUSTITUCIÓN con
 * sus diferencias — igual que la cascada de liberación, no como si se hubiera corrido
 * lo planeado. Y la fila queda `declared:false`: hay evidencia, no una declaración.
 */
function tpLinkVehicleToItem(weekIdx, itemIdx, vehicleId, opts) {
    opts = opts || {};
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan || !plan.items || !plan.items[itemIdx]) return { ok: false, reason: 'No se encontró esa prueba.' };
    var item = plan.items[itemIdx];
    var v = (typeof db === 'object' && db && db.vehicles || []).find(function(x) { return x && x.id == vehicleId; });
    if (!v) return { ok: false, reason: 'Ese vehículo ya no existe.' };

    // [v20.8] El candado es GLOBAL: un vehículo real es UNA prueba y no puede acreditar
    // dos filas del plan, ni siquiera en semanas distintas. Si de verdad hay dos pruebas
    // que lo justifican (un reensayo, por ejemplo), primero se desvincula la anterior —
    // el candado impide el descuido, no el caso legítimo.
    var yaEn = null;
    (tpState.weeklyPlans || []).forEach(function(p) {
        (p && p.items || []).forEach(function(it, i) {
            if (yaEn) return;
            if ((p !== plan || i !== itemIdx) && it.linkedVehicleId == vehicleId) yaEn = { plan: p, item: it };
        });
    });
    if (yaEn) {
        var dnd = yaEn.plan.weekDate ? 'la semana del ' + yaEn.plan.weekDate : 'otra semana';
        return { ok: false, reason: '🔒 Ese vehículo ya está vinculado a "' + (yaEn.item.desc || 'otra prueba') + '" en ' + dnd +
                 '. Un vehículo acredita UNA sola prueba: si esta es la correcta, desvincúlalo allá primero (menú ⋯ → Quitar vínculo).' };
    }

    if (typeof undoPush === 'function') undoPush('testplan', 'Vincular prueba con vehículo');

    var distinta = v.configCode && v.configCode !== item.desc;
    var diffs = [];
    if (distinta) {
        var a = (tpState.planData || []).find(function(c) { return c.desc === item.desc; }) || item;
        var b = (tpState.planData || []).find(function(c) { return c.desc === v.configCode; });
        if (b) {
            _tpCoreFields.concat(_tpFlexFields).forEach(function(f) {
                var x = String(a[f] || '').toUpperCase(), y = String(b[f] || '').toUpperCase();
                if (x !== y && (x || y)) diffs.push({ field: f, label: _tpFlexLabels[f] || _tpFieldLabel(f), planned: a[f] || '—', actual: b[f] || '—' });
            });
        }
    }

    item.linkedVehicleId = v.id;
    item.linkedVin = v.vin || '';
    item.linkedAt = new Date().toISOString();
    item.linkedBy = (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '';
    item.completed = true;
    item.completedDate = v.archivedAt || new Date().toISOString();
    // Vincular es lo contrario de declarar: hay evidencia con VIN. Si la fila venía
    // declarada a mano, se ASCIENDE y su registro placeholder se retira.
    if (item.declared) { _tpUndeclareTested(plan, itemIdx); delete item.declared; }
    if (distinta) {
        item.substituted = true;
        item.substitution = { originalDesc: item.desc, testedDesc: v.configCode, testedVin: v.vin || null,
                              differences: diffs, linkedAt: item.linkedAt, by: item.linkedBy };
    }

    // La evidencia entra a `testedList` si la liberación no la había registrado ya
    // (`tpAutoFeedFromRelease` la escribe al archivar; vincular a mano cubre el resto).
    var configReal = v.configCode || item.desc;
    var yaRegistrada = !!v.vin && (tpState.testedList || []).some(function(t) {
        return t && t.configText === configReal && !tpTestedIsDeclared(t) &&
               String(t.note || '').indexOf(v.vin) !== -1;
    });
    if (!yaRegistrada && v.vin) {
        if (!Array.isArray(tpState.testedList)) tpState.testedList = [];
        tpState.testedList.push({
            configText: configReal,
            date: String(v.archivedAt || item.completedDate).slice(0, 10),
            note: 'VIN: ' + v.vin + ' — Vinculada a mano desde el plan',
            source: 'plan-link', purpose: v.purpose || 'Manual',
            planId: tpPlanId(plan), itemIdx: itemIdx
        });
        if (typeof tpInvalidateCache === 'function') tpInvalidateCache();
    }

    tpBoardInvalidate();
    _tpTouchPlan(weekIdx);
    if (typeof auditLog === 'function') {
        auditLog('tp', 'week_item_linked', { type: 'plan', label: item.desc },
                 'VIN ' + (v.vin || v.id) + ' · ' + (v.status === 'archived' ? 'liberado' : 'en curso') +
                 (distinta ? ' · configuración DISTINTA (' + v.configCode + ')' : '') +
                 (yaRegistrada ? ' · ya estaba en Probados' : ''));
    }
    return { ok: true, vin: v.vin, distinta: distinta, diffs: diffs, released: v.status === 'archived', yaRegistrada: yaRegistrada };
}

/** Deshacer el vínculo. La fila vuelve a pendiente; la evidencia en Probados se queda. */
function tpUnlinkVehicleFromItem(weekIdx, itemIdx) {
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan || !plan.items || !plan.items[itemIdx]) return;
    var item = plan.items[itemIdx];
    if (item.linkedVehicleId == null) return;
    if (typeof undoPush === 'function') undoPush('testplan', 'Quitar vínculo de prueba');
    var vin = item.linkedVin;
    delete item.linkedVehicleId; delete item.linkedVin; delete item.linkedAt; delete item.linkedBy;
    item.completed = false; item.completedDate = null;
    // La sustitución que NACIÓ del vínculo se va con él; una hecha a mano se queda.
    if (item.substitution && item.substitution.linkedAt) { delete item.substituted; delete item.substitution; }
    tpBoardInvalidate();
    _tpTouchPlan(weekIdx);
    if (typeof auditLog === 'function') {
        auditLog('tp', 'week_item_unlinked', { type: 'plan', label: item.desc }, 'VIN ' + (vin || '—'));
    }
    showToast('Vínculo quitado. La prueba vuelve a pendiente; lo registrado en Probados se conserva.', 'success',
              null, (typeof undoPop === 'function') ? undoPop : null);
    _tpBoardRepaint();
}

/** El menú: las pruebas de la semana, con VIN y configuración, para elegir a mano. */
function tpLinkVehicleMenu(weekIdx, itemIdx, verTodas) {
    var plan = (tpState.weeklyPlans || [])[weekIdx];
    if (!plan || !plan.items || !plan.items[itemIdx]) return;
    var item = plan.items[itemIdx];
    var lista = tpLinkableVehiclesFor(item, { plan: plan, all: !!verTodas });

    var body = '<div class="tp-week-movebox">' +
        '<p class="tp-week-movehint">Planeada: <strong>' + tpConfigShortName(item) + '</strong>' +
        (tpConfigVariantTag(item) ? ' · ' + tpConfigVariantTag(item) : '') + '<br>' +
        'Elige la prueba real que cubre esta fila. Si la configuración no es la misma, se registra como <strong>sustitución</strong> con sus diferencias.</p>';

    if (item.linkedVehicleId != null) {
        body += '<div class="tp-link-current">Vinculada a <strong>' + (item.linkedVin || item.linkedVehicleId) + '</strong>' +
                (item.linkedBy ? ' · por ' + item.linkedBy : '') +
                '<button class="tp-week-movebtn tp-week-movebtn--danger" style="margin-top:6px;" ' +
                'onclick="document.getElementById(\'globalModal\').remove();tpUnlinkVehicleFromItem(' + weekIdx + ',' + itemIdx + ')">' +
                '<span class="tp-week-movebtn-day">✕ Quitar el vínculo</span></button></div>';
    }

    if (!lista.length) {
        body += '<div class="tp-week-col-empty">' +
                (verTodas ? 'No hay ningún vehículo dado de alta que se pueda vincular.'
                          : 'No hay pruebas registradas en esta semana.') + '</div>';
    } else {
        lista.slice(0, 20).forEach(function(c) {
            var nivel = c.exact ? '' : (c.cercania === 1 ? '⚠️ misma familia, otra variante · ' : '⚠️ otra configuración · ');
            body += '<button class="tp-week-movebtn' + (c.exact ? '' : ' tp-week-movebtn--full') + '" ' +
                    'onclick="tpDoLinkVehicle(' + weekIdx + ',' + itemIdx + ',' + JSON.stringify(c.id) + ')">' +
                    '<span class="tp-week-movebtn-day">' + (c.released ? '✅ ' : '🔬 ') +
                      (c.vin ? c.vin : 'sin VIN') + '</span>' +
                    '<span class="tp-week-movebtn-sub">' + nivel + c.shortName +
                      (c.variantTag ? ' · ' + c.variantTag : '') +
                      ' · ' + c.statusLabel + (c.date ? ' · ' + c.date : '') +
                      (c.inWeek ? '' : ' · FUERA DE LA SEMANA') + '</span></button>';
        });
        if (lista.length > 20) body += '<p class="tp-week-movehint">y ' + (lista.length - 20) + ' más.</p>';
    }

    if (!verTodas) {
        body += '<button class="tp-week-movebtn" onclick="document.getElementById(\'globalModal\').remove();tpLinkVehicleMenu(' + weekIdx + ',' + itemIdx + ',true)">' +
                '<span class="tp-week-movebtn-day">🔎 Ver también los de otras semanas</span></button>';
    }
    body += '</div>';
    showModal({ title: '🔗 Vincular con una prueba', type: 'info', body: body, buttons: [{ label: 'Cerrar', cls: '' }] });
}

function tpDoLinkVehicle(weekIdx, itemIdx, vehicleId) {
    var m = document.getElementById('globalModal'); if (m) m.remove();
    var r = tpLinkVehicleToItem(weekIdx, itemIdx, vehicleId);
    if (!r.ok) { showToast(r.reason, 'error'); return; }
    showToast('Vinculada con ' + (r.vin || 'el vehículo') +
              (r.distinta ? ' — registrada como sustitución: ' + r.diffs.map(function(d) { return d.label + ' ' + d.planned + ' → ' + d.actual; }).join(', ')
                          : (r.released ? ' · liberado' : ' · aún en curso')),
              r.distinta ? 'warning' : 'success', null, (typeof undoPop === 'function') ? undoPop : null);
    _tpBoardRepaint();
}

function tpDoSwapItem(weekIdx, itemIdx, desc) {
    var m = document.getElementById('globalModal'); if (m) m.remove();
    var r = tpSwapItemConfig(weekIdx, itemIdx, desc);
    if (!r.ok) { showToast(r.reason, 'error'); return; }
    showToast((r.breaksCore ? '⚠️ Sustituida por una NO equivalente: ' : 'Sustituida: ') +
              r.diffs.map(function(d) { return d.label + ' ' + d.planned + ' → ' + d.actual; }).join(', ') +
              (r.testDay ? ' · se prueba ' + TP_DAY_LABELS[r.testDay] : ' · quedó sin día'),
              r.breaksCore ? 'warning' : 'success', null, (typeof undoPop === 'function') ? undoPop : null);
    _tpBoardRepaint();
}

// ═══ PRODUCTION TAB ═══
function tpRenderProduction(el) {
    const plan = tpState.planData;
    const hasData = plan.length > 0;

    el.innerHTML = `
    <div class="tp-card">
        <div class="tp-card-title" data-help="tp-csvimport-help">
            <span>📥 Importar Plan de Producción (CSV)</span>
            ${tpState.planImportDate ? `<span style="font-size: var(--fs-xs);color:var(--tp-dim);">Última importación: ${new Date(tpState.planImportDate).toLocaleDateString('es-MX')}</span>` : ''}
        </div>
        <p style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom:10px;">Carga el CSV con columnas: codigo_config, codigo_config_text, Modelo, ... , count_hist, Feb-26, Mar-26, ..., Total_Calc</p>
        <div style="display:flex;gap:10px;align-items:center;">
            <input type="file" accept=".csv" id="tp-csv-file" style="font-size:12px;color:var(--tp-text);">
            <button class="tp-btn tp-btn-primary" onclick="tpHandleCSVUpload()">📤 Importar CSV</button>
            ${hasData ? `<span style="font-size: var(--fs-sm);color:var(--tp-green);">✅ ${plan.length} configs cargadas</span>` : ''}
        </div>
    </div>

    ${hasData ? `
    <div class="tp-card">
        <div class="tp-card-title" style="display:flex;justify-content:space-between;align-items:center;">
            <span>📈 Producción Mensual Planeada</span>
            <button class="tp-btn tp-btn-ghost" onclick="window._tpProdChartCfg=!window._tpProdChartCfg;tpRender();" style="font-size: var(--fs-sm);">⚙️</button>
        </div>
        ${window._tpProdChartCfg ? `
        <div style="padding:10px;background:var(--tp-bg);border:1px solid var(--tp-border);border-radius:8px;margin-bottom:10px;">
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
                <div>
                    <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:2px;">Altura grafica (px)</label>
                    <input type="number" class="tp-select" style="width:70px;font-size: var(--fs-xs);" value="${window._tpProdChartH || 140}" min="80" max="400" onchange="window._tpProdChartH=parseInt(this.value);tpRender();">
                </div>
                <div>
                    <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:2px;">Y max (0=auto)</label>
                    <input type="number" class="tp-select" style="width:80px;font-size: var(--fs-xs);" value="${window._tpProdYMax || 0}" min="0" onchange="window._tpProdYMax=parseInt(this.value);tpRender();">
                </div>
                <div>
                    <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:2px;">Tipo</label>
                    <select class="tp-select" style="font-size: var(--fs-xs);" onchange="window._tpProdChartType=this.value;tpRender();">
                        <option value="bar" ${(window._tpProdChartType||'bar')==='bar'?'selected':''}>Barras</option>
                        <option value="hbar" ${window._tpProdChartType==='hbar'?'selected':''}>Horizontal</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:2px;">Agrupar por</label>
                    <select class="tp-select" style="font-size: var(--fs-xs);" onchange="window._tpProdGroupBy=this.value;tpRender();">
                        <option value="month" ${(window._tpProdGroupBy||'month')==='month'?'selected':''}>Mes</option>
                        <option value="region" ${window._tpProdGroupBy==='region'?'selected':''}>Region</option>
                        <option value="model" ${window._tpProdGroupBy==='model'?'selected':''}>Modelo</option>
                    </select>
                </div>
            </div>
        </div>` : ''}
        ${(() => {
            const chartH = window._tpProdChartH || 140;
            const groupBy = window._tpProdGroupBy || 'month';
            const chartType = window._tpProdChartType || 'bar';

            if (groupBy === 'month') {
                const totals = tpMonths().map((m,i) => plan.reduce((s,c) => s + c.m[i], 0));
                const maxT = window._tpProdYMax > 0 ? window._tpProdYMax : Math.max(...totals, 1);
                if (chartType === 'hbar') {
                    return `<div style="display:flex;flex-direction:column;gap:3px;">
                        ${tpMonths().map((m,i) => `<div style="display:flex;align-items:center;gap:6px;">
                            <div style="width:45px;font-size: var(--fs-xs);color:var(--tp-dim);text-align:right;">${m}</div>
                            <div style="flex:1;height:16px;background:var(--tp-border);border-radius:3px;overflow:hidden;">
                                <div style="height:100%;width:${Math.min(100,(totals[i]/maxT)*100)}%;background:var(--tp-blue);border-radius:3px;"></div>
                            </div>
                            <div style="width:50px;font-size: var(--fs-xs);font-weight:700;color:var(--tp-text);">${totals[i].toLocaleString()}</div>
                        </div>`).join('')}
                    </div>`;
                }
                return `<div style="overflow-x:auto;"><div class="tp-chart-bar" style="height:${chartH}px;min-width:${tpMonths().length*46}px;">
                    ${tpMonths().map((m,i) => `
                        <div class="tp-chart-col">
                            <div class="tp-chart-value">${totals[i].toLocaleString()}</div>
                            <div class="tp-chart-group">
                                <div class="tp-chart-fill" style="height:${Math.min(100,(totals[i]/maxT)*100)}%;background:var(--tp-blue);"></div>
                            </div>
                            <div class="tp-chart-label">${m}</div>
                        </div>
                    `).join('')}
                </div></div>`;
            }
            // Group by region or model
            const gMap = {};
            plan.forEach(c => {
                const k = groupBy === 'region' ? (c.rgn||'?') : (c.mod||'?');
                gMap[k] = (gMap[k]||0) + c.total;
            });
            let gData = Object.entries(gMap).sort((a,b) => b[1]-a[1]);
            if (gData.length > 12) gData = gData.slice(0,12);
            const maxG = window._tpProdYMax > 0 ? window._tpProdYMax : Math.max(...gData.map(g => g[1]), 1);
            if (chartType === 'hbar') {
                return `<div style="display:flex;flex-direction:column;gap:3px;">
                    ${gData.map(([k,v]) => `<div style="display:flex;align-items:center;gap:6px;">
                        <div style="width:70px;font-size: var(--fs-xs);color:var(--tp-dim);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${k}</div>
                        <div style="flex:1;height:16px;background:var(--tp-border);border-radius:3px;overflow:hidden;">
                            <div style="height:100%;width:${Math.min(100,(v/maxG)*100)}%;background:var(--tp-blue);border-radius:3px;"></div>
                        </div>
                        <div style="width:55px;font-size: var(--fs-xs);font-weight:700;color:var(--tp-text);">${v.toLocaleString()}</div>
                    </div>`).join('')}
                </div>`;
            }
            return `<div class="tp-chart-bar" style="height:${chartH}px;">
                ${gData.map(([k,v]) => `
                    <div class="tp-chart-col">
                        <div class="tp-chart-value">${v.toLocaleString()}</div>
                        <div class="tp-chart-group">
                            <div class="tp-chart-fill" style="height:${Math.min(100,(v/maxG)*100)}%;background:var(--tp-blue);"></div>
                        </div>
                        <div class="tp-chart-label">${k.length>6?k.slice(0,5)+'..':k}</div>
                    </div>
                `).join('')}
            </div>`;
        })()}
    </div>

    <div class="tp-card">
        <div class="tp-card-title"><span>📋 Detalle (${plan.length} configs)</span>
            <span style="font-size: var(--fs-xs);color:var(--tp-dim);font-weight:400;">${tpMonths().length} mes(es) cargados: ${tpMonths()[0]} — ${tpMonths()[tpMonths().length-1]}</span>
        </div>
        <div style="max-height:400px;overflow:auto;">
            <table class="tp-table">
                <thead><tr>
                    <th>Config Text</th><th>Mod</th><th>MY</th><th>Reg</th><th>Rgn</th><th>Motor</th><th>TX</th><th>Body</th>
                    <th style="text-align:right">Hist</th>
                    ${tpMonths().map(m => `<th style="text-align:right">${m}</th>`).join('')}
                    <th style="text-align:right" title="Total anual (columna Total_Calc del CSV) — puede no coincidir con la suma de los meses visibles si el CSV trae el total sin desglose mensual">Total</th>
                </tr></thead>
                <tbody>
                    ${plan.sort((a,b)=>b.total-a.total).slice(0,100).map(c => {
                        const mSum = (c.m || []).reduce((s,v) => s + (v||0), 0);
                        const mismatch = c.total !== mSum;
                        const totalTitle = mismatch ? `Total_Calc del CSV = ${c.total.toLocaleString()}; los meses visibles suman ${mSum.toLocaleString()}` : '';
                        return `
                        <tr>
                            <td style="font-size: var(--fs-xs);color:var(--tp-amber);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${c.desc}">${c.desc}</td>
                            <td>${c.mod}</td><td style="color:var(--tp-dim)">${c.my}</td>
                            <td style="font-size: var(--fs-xs)">${c.reg}</td><td>${c.rgn}</td>
                            <td style="font-size: var(--fs-xs)">${c.eng}</td><td>${c.tx}</td><td>${c.body}</td>
                            <td style="text-align:right;font-family:monospace;color:var(--tp-dim)">${c.hist.toLocaleString()}</td>
                            ${c.m.map(v => `<td style="text-align:right;font-family:monospace;color:${v===0?'var(--tp-dim)':'var(--tp-text)'}">${v>0?v.toLocaleString():'—'}</td>`).join('')}
                            <td style="text-align:right;font-weight:700;font-family:monospace;color:var(--tp-amber);${mismatch?'cursor:help;':''}" ${mismatch?`title="${totalTitle}"`:''}>${c.total.toLocaleString()}${mismatch ? ' ⚠' : ''}</td>
                        </tr>
                    `;}).join('')}
                </tbody>
            </table>
            ${plan.length > 100 ? `<div style="padding:8px;text-align:center;color:var(--tp-dim);font-size: var(--fs-xs);">Mostrando 100 de ${plan.length}</div>` : ''}
        </div>
    </div>
    ` : `
    <div class="tp-card" style="text-align:center;padding:40px;">
        <div style="font-size:40px;margin-bottom:12px;">📊</div>
        <p style="color:var(--tp-dim);">No hay plan cargado. Importa tu CSV usando el botón de arriba.</p>
    </div>
    `}
    `;
}

function tpHandleCSVUpload() {
    const fileInput = document.getElementById('tp-csv-file');
    if (!fileInput.files[0]) { showToast('Selecciona un archivo CSV', 'warning'); return; }
    const reader = new FileReader();
    reader.onload = function(e) { tpImportPlanCSV(e.target.result); };
    reader.readAsText(fileInput.files[0]);
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M18] ALERT CENTER                                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

function tpGenerateAlerts() {
    if (tpState.planData.length === 0) return [];
    const alerts = [];
    const analysis = tpGetAnalysis();

    // 1. High-volume configs never tested
    const neverTestedHigh = analysis.filter(a => a.testedN === 0 && a.total > 1000).sort((a,b) => b.total - a.total);
    if (neverTestedHigh.length > 0) {
        alerts.push({ type:'critical', icon:'🚨', msg:`${neverTestedHigh.length} configs con >1,000 uds planeadas nunca probadas. Mayor: ${neverTestedHigh[0].mod} ${neverTestedHigh[0].rgn} (${neverTestedHigh[0].total.toLocaleString()} uds)` });
    }

    // 2. Weekly plan progress
    const wplans = tpState.weeklyPlans || [];
    if (wplans.length > 0) {
        const lastPlan = wplans[wplans.length - 1];
        const total = lastPlan.items.length;
        const done = lastPlan.items.filter(i => i.completed).length;
        const pct = total > 0 ? Math.round((done/total)*100) : 0;
        if (pct < 100 && total > 0) {
            alerts.push({ type: pct < 30 ? 'critical' : 'warning', icon:'📅', msg:`Plan semana ${wplans.length}: ${done}/${total} completadas (${pct}%). Faltan ${total-done} pruebas.` });
        }
        const pending = lastPlan.items.filter(i => !i.completed).length;
        if (pending > 0) {
            alerts.push({ type:'info', icon:'📌', msg:`Semana actual: ${pending} pruebas pendientes.` });
        }
    }

    // 3. Regions with 0% coverage
    const regionMap = {};
    analysis.forEach(a => {
        if (!regionMap[a.rgn]) regionMap[a.rgn] = {tested:0, total:0};
        regionMap[a.rgn].tested += a.testedN;
        regionMap[a.rgn].total += a.required;
    });
    Object.entries(regionMap).forEach(([rgn, d]) => {
        if (d.tested === 0 && d.total > 5) {
            alerts.push({ type:'warning', icon:'🌍', msg:`Región ${rgn}: 0 pruebas de ${d.total} requeridas.` });
        }
    });

    // 4. New model year configs (27 MODEL) with no history
    const newConfigs = analysis.filter(a => a.my === '27 MODEL' && a.hist === 0 && a.total > 0);
    if (newConfigs.length > 0) {
        alerts.push({ type:'info', icon:'🆕', msg:`${newConfigs.length} configs de 27 MODEL sin historial previo — considerar priorizar.` });
    }

    // 5. Overall coverage
    const okPct = analysis.length > 0 ? Math.round((analysis.filter(a=>a.status==='ok').length / analysis.length)*100) : 0;
    if (okPct < 20) {
        alerts.push({ type:'critical', icon:'📊', msg:`Cobertura general: solo ${okPct}% de configs cumplidas.` });
    } else if (okPct < 50) {
        alerts.push({ type:'warning', icon:'📊', msg:`Cobertura general: ${okPct}% de configs cumplidas.` });
    }

    return alerts;
}

function tpRenderAlertsBanner() {
    const alerts = tpGenerateAlerts();
    if (alerts.length === 0) return '';
    const typeColor = { critical:'var(--tp-red)', warning:'var(--tp-amber)', info:'var(--tp-blue)' };
    return `
    <div class="tp-card" style="padding:12px 16px;border-color:${typeColor[alerts[0].type]};">
        <div class="tp-card-title" style="margin-bottom:8px;"><span>🔔 Centro de Alertas (${alerts.length})</span></div>
        ${alerts.slice(0,6).map(a => `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid var(--tp-border)15;">
                <span style="font-size:14px;flex-shrink:0;">${a.icon}</span>
                <span style="font-size: var(--fs-sm);color:${typeColor[a.type]};">${a.msg}</span>
            </div>
        `).join('')}
    </div>`;
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M19] FAMILIES / RISK ANALYSIS                                     ║
// ╚══════════════════════════════════════════════════════════════════════╝

function tpBuildFamilies() {
    var h = _tpGetPlanHash();
    if (_tpCache.planHash === h && _tpCache.families !== null) return _tpCache.families;
    _tpCache.planHash = h;
    // [v20.8] Un pull de sync desde un dispositivo sin actualizar puede reintroducir
    // claves de 7 segmentos en overrides/soak — la migración es idempotente y barata.
    try { _tpMigrateFamilyKeysBody(); } catch (e) {}
    const families = {};
    tpState.planData.forEach(cfg => {
        const key = tpFamilyKeyForCfg(cfg); // [v20.8] única definición — incluye carrocería
        if (!families[key]) {
            families[key] = { key, mod:cfg.mod, eng:cfg.eng, tx:cfg.tx, my:cfg.my, reg:cfg.reg, rgns:new Set(), drvs:new Set(), bodies:new Set(), ep:cfg.ep||'', engpkg:cfg.engpkg||'', configs:[], totalVol:0, totalHist:0, activeVol:0, testedConfigs:0, totalTested:0, totalRequired:0, configRequiredSum:0, pausedCount:0, dormantCount:0 };
        }
        const rule = tpGetRule(cfg);
        const n = tpState.testedList.filter(t => t.configText === cfg.desc).length;
        const req = cfg.paused ? 0 : tpCalcRequired(cfg, rule); // v16.2: pausada no exige

        // Get VINs from testedList
        const vins = tpState.testedList.filter(t => t.configText === cfg.desc);

        families[key].configs.push({ ...cfg, testedN:n, required:req, deficit:Math.max(0,req-n), vins });
        // v15.8: fecha del ensayo más reciente de la familia (ISO 'YYYY-MM-DD' → max lexicográfico)
        vins.forEach(v => { if (v.date && v.date > (families[key].lastTestDate || '')) families[key].lastTestDate = v.date; });
        families[key].bodies.add(cfg.body||'');
        families[key].drvs.add(cfg.drv||'');
        families[key].rgns.add(cfg.rgn||'');
        families[key].totalVol += cfg.total;
        families[key].totalHist += cfg.hist;
        // v20.9: el volumen que cuenta para el REQ de la familia excluye las pausadas
        // (misma regla que el REQ por config: pausada = no exige).
        if (!cfg.paused) families[key].activeVol += (cfg.total + cfg.hist);
        families[key].configRequiredSum += req;   // suma por config — la usa el planificador
        families[key].totalTested += n;
        if (n > 0) families[key].testedConfigs++;
        if (cfg.paused) families[key].pausedCount++;
        else if (typeof tpIsDormant === 'function' && tpIsDormant(cfg)) families[key].dormantCount++;
    });

    // maxVol izado fuera del loop: recomputarlo por familia era O(familias²)
    const maxVol = Math.max(...Object.values(families).map(x => x.totalVol + x.totalHist), 1);
    Object.values(families).forEach(f => {
        f.bodies = [...f.bodies].filter(Boolean).sort();
        f.drvs  = [...f.drvs].filter(Boolean).sort();
        f.rgns  = [...f.rgns].filter(Boolean).sort();
        f.configCount = f.configs.length;
        // v20.9: el REQ de la familia sale de SU volumen por la regla de lotes, no de
        // sumar el REQ de cada variante — la norma muestrea la familia, no la variante.
        f.totalRequired = tpFamilyRequired(f.activeVol);
        f.coverage = f.totalRequired > 0 ? Math.min(1, f.totalTested / f.totalRequired) : 1;
        f.configCoverage = f.configCount > 0 ? f.testedConfigs / f.configCount : 1;
        f.deficit = Math.max(0, f.totalRequired - f.totalTested);
        f.riskScore = ((1 - f.coverage) * 60) + (((f.totalVol + f.totalHist) / maxVol) * 30) + ((1 - f.configCoverage) * 10);
        f.riskLevel = f.riskScore > 60 ? 'high' : f.riskScore > 30 ? 'medium' : 'low';
        // v15.8: días desde la última prueba (T12:00 evita corrimiento de zona horaria)
        f.daysSinceTest = f.lastTestDate ? Math.floor((Date.now() - new Date(f.lastTestDate + 'T12:00:00').getTime()) / 86400000) : null;

        // Override manual (criticidad + deadline por familia)
        var _ov = (tpState.familyOverrides || {})[f.key] || {};
        f.criticality = _ov.criticality || 'normal';
        f.familyDeadline = _ov.deadline || ''; // deadline propio de la familia (para el input de familia)

        // Deadline particular por variante (configuración)
        var _cov = tpState.configOverrides || {};
        var _dlDays = function(d) { return d ? Math.ceil((new Date(d + 'T12:00:00') - Date.now()) / 86400000) : null; };
        f.configs.forEach(function(c) {
            var co = _cov[c.desc];
            c.overrideDeadline = (co && co.deadline) || '';
            c.daysToDeadline = _dlDays(c.overrideDeadline);
        });

        // Deadline efectivo de la familia = el más próximo entre el propio y los de sus variantes
        var _allDl = [];
        if (f.familyDeadline) _allDl.push(f.familyDeadline);
        f.configs.forEach(function(c) { if (c.overrideDeadline) _allDl.push(c.overrideDeadline); });
        _allDl.sort(function(a, b) { return String(a).localeCompare(String(b)); });
        f.overrideDeadline = _allDl[0] || '';
        f.daysToDeadline = _dlDays(f.overrideDeadline);
        f.deadlineFromVariant = !!(f.overrideDeadline && f.overrideDeadline !== f.familyDeadline);

        // [V7-A3] Gas/fuel availability indicator
        f.resourceStatus = 'green'; // 🟢 default
        if (typeof invState !== 'undefined' && invState.gases) {
            var inUse = invState.gases.filter(function(g) { return g.status === 'In use'; });
            var lowGas = inUse.filter(function(g) {
                if (!g.readings || g.readings.length === 0) return false;
                var lastPsi = g.readings[g.readings.length - 1].psi;
                var maxPsi = g.initialPsi || 2200;
                return (lastPsi / maxPsi) < 0.25;
            });
            var emptyGas = inUse.filter(function(g) {
                if (!g.readings || g.readings.length === 0) return true;
                return g.readings[g.readings.length - 1].psi <= 0;
            });
            if (emptyGas.length > 0) f.resourceStatus = 'red';
            else if (lowGas.length > 0) f.resourceStatus = 'yellow';
            // Check if enough tests remain based on PSI
            var testsRemaining = f.deficit;
            if (testsRemaining > 0 && lowGas.length > 0) f.resourceStatus = 'yellow';
            if (testsRemaining > 0 && emptyGas.length > 0) f.resourceStatus = 'red';
        }

        // Representative coverage: highest-volume config is the "representative"
        f.configs.sort(function(a, b) { return (b.total + b.hist) - (a.total + a.hist); });
        var rep = f.configs[0];
        f.representative = rep;
        f.repTested = rep.testedN > 0;
        f.configs.forEach(function(c) {
            c.isRepresentative = (c === rep);
            c.coveredByRep = (!c.isRepresentative && c.testedN === 0 && f.repTested);
        });
        f.auditCoverage = f.repTested ? Math.max(f.coverage, 0.85) : f.coverage;
        f.auditRiskScore = ((1 - f.auditCoverage) * 60) + (((f.totalVol + f.totalHist) / Math.max(...Object.values(families).map(function(x) { return x.totalVol + x.totalHist; }), 1)) * 30) + ((1 - f.configCoverage) * 10);
        f.auditRiskLevel = f.auditRiskScore > 60 ? 'high' : f.auditRiskScore > 30 ? 'medium' : 'low';
    });

    // ==================================================================
    // [AUDIT-EXT] Continuidad MY + Equivalencia cruzada entre familias
    // ==================================================================
    var famArr = Object.values(families);
    var continuityMap = (tpState && tpState.myContinuity) || {};

    // Pass 1: continuity coverage per config (same family, previous MY)
    famArr.forEach(function(f) {
        f.continuityCoveredCount = 0;
        f.configs.forEach(function(c) {
            c.coveredByContinuity = null;
            if (c.testedN > 0) return;
            var cont = continuityMap[c.desc];
            if (!cont || !cont.prevConfigDesc) return;
            var prevTests = tpState.testedList.filter(function(t) { return t.configText === cont.prevConfigDesc; });
            if (prevTests.length === 0) return;
            c.coveredByContinuity = {
                prevMy: cont.prevMy || '',
                prevConfigDesc: cont.prevConfigDesc,
                prevTestDate: prevTests[0].date || '',
                prevTestVin: _tpExtractVin(prevTests[0].note || ''),
                note: cont.note || ''
            };
            f.continuityCoveredCount++;
        });
    });

    // Pass 2: Auto-continuidad MY — si un MY anterior del mismo powertrain tiene pruebas,
    // marcar automáticamente las configs no probadas como cubiertas por continuidad.
    function _myNum(s) { var n = parseInt(s); return isNaN(n) ? 0 : n; }
    famArr.forEach(function(f) {
        f.coveredByEquivalent = null; // No longer used but kept for UI compatibility
        if (f.continuityCoveredCount === f.configCount) return;
        // Find closest previous MY sibling (same powertrain + regulation)
        var prevSiblings = famArr.filter(function(g) {
            if (g === f) return false;
            if (g.mod !== f.mod || g.eng !== f.eng || g.tx !== f.tx) return false;
            if (g.reg !== f.reg || g.ep !== f.ep || g.engpkg !== f.engpkg) return false;
            return _myNum(g.my) < _myNum(f.my) && g.totalTested > 0;
        });
        if (prevSiblings.length === 0) return;
        prevSiblings.sort(function(a, b) { return _myNum(b.my) - _myNum(a.my); });
        var prevFam = prevSiblings[0];
        var testedInPrev = prevFam.configs.filter(function(pc) { return pc.testedN > 0; });
        if (testedInPrev.length === 0) return;
        f.configs.forEach(function(c) {
            if (c.testedN > 0 || c.coveredByContinuity) return;
            // Best match: same tire → same body+drv → any tested config in prev family
            var match = testedInPrev.find(function(pc) { return pc.tire === c.tire; })
                     || testedInPrev.find(function(pc) { return pc.body === c.body && pc.drv === c.drv; })
                     || testedInPrev[0];
            c.coveredByContinuity = {
                prevMy: prevFam.my,
                prevConfigDesc: match.desc,
                prevTestDate: match.vins.length > 0 ? (match.vins[0].date || '') : '',
                prevTestVin: match.vins.length > 0 ? _tpExtractVin(match.vins[0].note || '') : '',
                note: 'Auto-detectado: mismo powertrain en ' + prevFam.my,
                auto: true
            };
            f.continuityCoveredCount++;
        });
    });

    // Pass 3: recompute auditCoverage/auditRiskLevel with new signals
    var maxVol2 = Math.max.apply(null, famArr.map(function(x) { return x.totalVol + x.totalHist; }).concat([1]));
    famArr.forEach(function(f) {
        var base = f.auditCoverage != null ? f.auditCoverage : f.coverage;
        if (f.continuityCoveredCount > 0 && f.configCount > 0) {
            var effectiveCfgs = f.testedConfigs + f.continuityCoveredCount;
            base = Math.max(base, effectiveCfgs / f.configCount);
        }
        f.auditCoverage = base;
        f.auditRiskScore = ((1 - f.auditCoverage) * 60) + (((f.totalVol + f.totalHist) / maxVol2) * 30) + ((1 - f.configCoverage) * 10);
        f.auditRiskLevel = f.auditRiskScore > 60 ? 'high' : f.auditRiskScore > 30 ? 'medium' : 'low';

        // Coverage category for audit card (E) / heatmap (F)
        if (f.totalTested > 0 && f.coverage >= 1) f.auditCoverageKind = 'direct';
        else if (f.totalTested > 0) f.auditCoverageKind = 'partial';
        else if (f.continuityCoveredCount > 0 && f.continuityCoveredCount === f.configCount) f.auditCoverageKind = 'continuity';
        else if (f.coveredByEquivalent) f.auditCoverageKind = 'equivalent';
        else f.auditCoverageKind = 'none';
    });

    _tpCache.families = famArr;
    return _tpCache.families;
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v20.5] AVANCE SEMANAL POR FAMILIA — el Gantt de Panorama (CoP) lo consume
// ═══════════════════════════════════════════════════════════════════════════════
//
// LA definición de "qué semanas del plan tocan a esta familia". Recorre
// `tpState.weeklyPlans` (vivo: incluye semanas pasadas YA aceptadas — se quedan ahí,
// nunca se mudan a otro lado — y semanas futuras propuestas), resuelve cada item a
// su config completa vía `tpState.planData` (mismo patrón que `tpWeekBoardRows`,
// porque un item de un plan viejo solo trae `desc` + un puñado de campos, no la
// config completa) y agrupa por `tpFamilyKeyForCfg`. No inventa fechas ni required:
// el llamador ya tiene `totalRequired` de `tpBuildFamilies()`/`copPortfolioRows()`.
//
/**
 * @param {string} familyKey - misma clave que tpFamilyKeyForCfg()/copFamilies() usan.
 * @returns {Array<{weekDate, done, verified, declared, planned, items}>} una fila por
 *   semana con actividad (con items o planeada) para esa familia, ordenadas por fecha.
 *   `done` = items marcados completed (verified+declared); `planned` = items de esa
 *   semana aún sin completar (pronóstico, no promesa: puede moverse o sustituirse).
 */
function tpFamilyWeeklyProgress(familyKey) {
    if (!familyKey || typeof tpFamilyKeyForCfg !== 'function') return [];
    var planData = tpState.planData || [];
    var cfgByDesc = {};
    planData.forEach(function(c) { cfgByDesc[c.desc] = c; });

    // [v20.10] UNA fila por SEMANA, no por plan. Generar deja un plan nuevo cada vez, así
    // que una misma semana suele tener el aceptado + varias propuestas viejas; contarlos
    // todos sumaba la misma semana varias veces e inflaba el total ("+7 programado" con 2
    // en la columna). El plan VIGENTE de una semana es:
    //   · el aceptado, si lo hay (es el compromiso; si hubiera más de uno, se suman —
    //     es raro pero legítimo cuando se parte el plan de una semana en dos);
    //   · si no, la propuesta MÁS RECIENTE, marcada `proposal:true` para que la UI pueda
    //     distinguirla. Los borradores anteriores se descartan.
    var porSemana = {};
    (tpState.weeklyPlans || []).forEach(function(p) {
        if (!p || !p.weekDate) return;
        var g = porSemana[p.weekDate] || (porSemana[p.weekDate] = { aceptados: [], propuestas: [] });
        (p.accepted ? g.aceptados : g.propuestas).push(p);
    });

    var rows = Object.keys(porSemana).map(function(weekDate) {
        var g = porSemana[weekDate];
        var vigentes = g.aceptados;
        var esPropuesta = false;
        if (!vigentes.length) {
            // La más reciente por fecha de creación (con el orden del arreglo como desempate).
            vigentes = [g.propuestas.reduce(function(a, b) {
                return String(b.created || '') >= String(a.created || '') ? b : a;
            })];
            esPropuesta = true;
        }

        var done = 0, verified = 0, declared = 0, planned = 0, items = [];
        vigentes.forEach(function(plan) {
            (plan.items || []).forEach(function(item) {
                var cfg = cfgByDesc[item.desc] || item;
                if (tpFamilyKeyForCfg(cfg) !== familyKey) return;
                if (item.completed) {
                    done++;
                    if (item.declared) declared++; else verified++;
                } else {
                    planned++;
                }
                items.push({ desc: item.desc, testDay: item.testDay || null, completed: !!item.completed, declared: !!item.declared });
            });
        });
        if (!items.length) return null;
        return { weekDate: weekDate,
                 planId: (typeof tpPlanId === 'function') ? tpPlanId(vigentes[0]) : null,
                 proposal: esPropuesta, plans: vigentes.length,
                 done: done, verified: verified, declared: declared, planned: planned, items: items };
    }).filter(Boolean);

    rows.sort(function(a, b) { return (a.weekDate || '').localeCompare(b.weekDate || ''); });
    return rows;
}

function _tpExtractVin(note) {
    if (!note) return '';
    var m = String(note).match(/VIN:\s*([^\s—]+)/);
    if (m) return m[1];
    var parts = String(note).split('—');
    return (parts[0] || '').trim();
}

// Force re-render of families tab (bypasses tabCache so filters/sort take effect immediately)
function tpRefreshFamilies() {
    tabCacheInvalidate('tp', 'tp-families');
    tpRender();
}
function tpClearFamilyFilters() {
    window._tpFamRegion = 'ALL';
    window._tpFamMY = 'ALL';
    window._tpFamModel = 'ALL';
    window._tpReadinessFilter = 'ALL';
    tpRefreshFamilies();
}

// Set/clear criticidad o deadline manual de una familia.
function tpSetFamilyOverride(key, field, value) {
    if (!tpState.familyOverrides) tpState.familyOverrides = {};
    var ov = tpState.familyOverrides[key] || {};
    if (value === '' || value === 'normal' || value == null) { delete ov[field]; }
    else { ov[field] = value; }
    if (!ov.criticality && !ov.deadline) delete tpState.familyOverrides[key];
    else tpState.familyOverrides[key] = ov;
    tpInvalidateCache();
    tpSave();
    tpRefreshFamilies();
}

// Set/clear deadline particular de una variante (configuración), keyed por su desc.
function tpSetConfigOverride(desc, value) {
    if (!desc) return;
    if (!tpState.configOverrides) tpState.configOverrides = {};
    if (value === '' || value == null) { delete tpState.configOverrides[desc]; }
    else { tpState.configOverrides[desc] = { deadline: value }; }
    tpInvalidateCache();
    tpSave();
    tpRefreshFamilies();
}

// Badge visible de criticidad/deadline de familia (para summaries y resumen ejecutivo).
function tpFamilyFlagBadge(f) {
    var h = '';
    if (f.criticality === 'critical') h += '<span class="tp-badge" style="background:rgba(239,68,68,0.2);color:var(--danger-text);font-size: var(--fs-xs);font-weight:800;">⚑ CRÍTICO</span>';
    else if (f.criticality === 'high') h += '<span class="tp-badge" style="background:rgba(245,158,11,0.2);color:var(--warn-text);font-size: var(--fs-xs);font-weight:800;">▲ ALTO</span>';
    if (f.daysToDeadline !== null) {
        var c = f.daysToDeadline < 7 ? '#ef4444' : f.daysToDeadline < 14 ? '#f59e0b' : '#06b6d4';
        var t = f.daysToDeadline < 0 ? 'vencido' : f.daysToDeadline + 'd';
        h += '<span class="tp-badge" style="background:' + c + '20;color:' + c + ';font-size: var(--fs-xs);font-weight:700;">⏰ ' + t + '</span>';
    }
    return h;
}

function tpRenderFamilies(el) {
    if (tpState.planData.length === 0) { el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">Importa el plan primero.</div>'; return; }
    const families = tpBuildFamilies();
    const sortBy        = window._tpFamSort    || 'risk';
    const regionFilter  = window._tpFamRegion  || 'ALL';
    const myFilter      = window._tpFamMY      || 'ALL';
    const modelFilter   = window._tpFamModel   || 'ALL';
    const readinessFilter = window._tpReadinessFilter || 'ALL';

    const allRegions = [...new Set(families.flatMap(f => f.rgns && f.rgns.length ? f.rgns : ['?']))].sort();
    const allMYs     = [...new Set(families.map(f => f.my || '?'))].sort((a,b)=>parseInt(b)-parseInt(a));
    const allModels  = [...new Set(families.map(f => f.mod || '?'))].sort();

    let filtered = families;
    if (regionFilter !== 'ALL') filtered = filtered.filter(f => f.rgns && f.rgns.includes(regionFilter));
    if (myFilter     !== 'ALL') filtered = filtered.filter(f => f.my === myFilter);
    if (modelFilter  !== 'ALL') filtered = filtered.filter(f => f.mod === modelFilter);
    if (readinessFilter !== 'ALL') filtered = filtered.filter(f => f.auditCoverageKind === readinessFilter);

    const _activeFilters = [regionFilter,myFilter,modelFilter,readinessFilter].filter(x=>x!=='ALL').length;
    var _rkScore = window._tpAuditView ? 'auditRiskScore' : 'riskScore';
    var _covVal = function(f){ return window._tpAuditView ? f.auditCoverage : f.coverage; };
    var _myN    = function(f){ return parseInt(f.my) || 0; };
    const sorted = [...filtered].sort((a,b) => {
        if (sortBy === 'risk')         return b[_rkScore] - a[_rkScore];
        if (sortBy === 'volume')       return (b.totalVol+b.totalHist) - (a.totalVol+a.totalHist);
        if (sortBy === 'cov_asc')      return _covVal(a) - _covVal(b);
        if (sortBy === 'cov_desc')     return _covVal(b) - _covVal(a);
        if (sortBy === 'my_desc')      return _myN(b) - _myN(a);
        if (sortBy === 'my_asc')       return _myN(a) - _myN(b);
        if (sortBy === 'model')        return (a.mod||'').localeCompare(b.mod||'');
        if (sortBy === 'deficit')      return b.deficit - a.deficit;
        return 0;
    });
    const rc = { high:'var(--tp-red)', medium:'var(--tp-amber)', low:'var(--tp-green)' };
    const rl = { high:'Alto', medium:'Medio', low:'Bajo' };
    var _rkKey = window._tpAuditView ? 'auditRiskLevel' : 'riskLevel';
    const hR = filtered.filter(function(f) { return f[_rkKey] === 'high'; }).length;
    const mR = filtered.filter(function(f) { return f[_rkKey] === 'medium'; }).length;
    const lR = filtered.filter(function(f) { return f[_rkKey] === 'low'; }).length;

    // Compliance summary (global, all families before region/readiness filter)
    const _totalFams = families.length;
    const _directCount = families.filter(function(f){return f.auditCoverageKind==='direct';}).length;
    const _partialCount = families.filter(function(f){return f.auditCoverageKind==='partial';}).length;
    const _equivCount = families.filter(function(f){return f.auditCoverageKind==='equivalent';}).length;
    const _contCount = families.filter(function(f){return f.auditCoverageKind==='continuity';}).length;
    const _noneCount = families.filter(function(f){return f.auditCoverageKind==='none';}).length;
    const _coveredCount = _directCount + _partialCount + _equivCount + _contCount;
    const _covPct = Math.round(_coveredCount / Math.max(_totalFams, 1) * 100);
    const _dirPct = Math.round(_directCount / Math.max(_totalFams, 1) * 100);
    const _parPct = Math.round(_partialCount / Math.max(_totalFams, 1) * 100);
    const _eqPct  = Math.round(_equivCount / Math.max(_totalFams, 1) * 100);
    const _coPct  = Math.round(_contCount / Math.max(_totalFams, 1) * 100);

    function epLabel(v) { return !v||v==='0'?'12V':v==='M'?'48V':v; }
    function _bodyBadge(b) {
        if (!b) return '';
        const bColors = {'4DR':'#3b82f6','5DR':'#8b5cf6','WGN':'#14b8a6','WGN LONG':'#10b981','2DR':'#f59e0b'};
        const c = bColors[b] || '#64748b';
        return `<span class="tp-badge" style="background:${c}22;color:${c};font-size: var(--fs-xs);border:1px solid ${c}44;">${b}</span>`;
    }
    function getDiffFields(configs) {
        const fields = ['body','rgn','drv','tire','ep','engpkg'];
        const lbls = {tire:'Llanta',ep:'Env',engpkg:'EngPkg',drv:'Drive',body:'Carrocería',rgn:'Región'};
        return fields.filter(f => {
            const vals = [...new Set(configs.map(c => c[f]||''))];
            return vals.length > 1;
        }).map(f => ({field:f, label:lbls[f]}));
    }

    var _readinessLabels = { direct:'Probadas', partial:'Parciales', equivalent:'Cubiertas por similar', continuity:'Continuidad MY', none:'Sin cubrir' };
    var _readinessBanner = readinessFilter !== 'ALL' ? `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.3);border-radius:6px;margin-bottom:8px;font-size: var(--fs-sm);">
            <span>Filtro estado: <b>${_readinessLabels[readinessFilter] || readinessFilter}</b></span>
            <button class="tp-btn tp-btn-ghost" onclick="window._tpReadinessFilter='ALL';tpRefreshFamilies();" style="font-size: var(--fs-xs);margin-left:auto;">Quitar</button>
        </div>` : '';

    el.innerHTML = `
    ${_readinessBanner}
    <div style="margin-bottom:10px;padding:10px 12px;background:var(--tp-card);border-radius:10px;border:1px solid var(--tp-border);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-text);letter-spacing:0.03em;">CUMPLIMIENTO DE FAMILIAS</span>
            <span style="font-size:15px;font-weight:800;color:${_covPct>=80?'var(--tp-green)':_covPct>=40?'var(--tp-amber)':'var(--tp-red)'};">${_coveredCount}/${_totalFams} <span style="font-size: var(--fs-xs);font-weight:600;">(${_covPct}%)</span></span>
        </div>
        <div style="height:9px;border-radius:5px;background:var(--tp-border);overflow:hidden;display:flex;gap:1px;">
            <div style="width:${_dirPct}%;background:var(--tp-green);transition:width 0.4s;" title="Directas: ${_directCount}"></div>
            <div style="width:${_parPct}%;background:var(--tp-amber);transition:width 0.4s;" title="Parciales: ${_partialCount}"></div>
            <div style="width:${_eqPct}%;background:#38bdf8;transition:width 0.4s;" title="Equivalencia: ${_equivCount}"></div>
            <div style="width:${_coPct}%;background:#84cc16;transition:width 0.4s;" title="Continuidad: ${_contCount}"></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:5px;flex-wrap:wrap;">
            <span style="font-size: var(--fs-xs);color:var(--tp-green);cursor:pointer;" onclick="window._tpReadinessFilter='direct';tpRefreshFamilies();">● Directas ${_directCount}</span>
            <span style="font-size: var(--fs-xs);color:var(--tp-amber);cursor:pointer;" onclick="window._tpReadinessFilter='partial';tpRefreshFamilies();">● Parciales ${_partialCount}</span>
            <span style="font-size: var(--fs-xs);color:#38bdf8;cursor:pointer;" onclick="window._tpReadinessFilter='equivalent';tpRefreshFamilies();">● Equiv ${_equivCount}</span>
            <span style="font-size: var(--fs-xs);color:#84cc16;cursor:pointer;" onclick="window._tpReadinessFilter='continuity';tpRefreshFamilies();">● Cont ${_contCount}</span>
            <span style="font-size: var(--fs-xs);color:var(--tp-dim);cursor:pointer;" onclick="window._tpReadinessFilter='none';tpRefreshFamilies();">● Sin cubrir ${_noneCount}</span>
        </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;margin-bottom:10px;">
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">${filtered.length}</div><div class="tp-metric-label">Familias</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">${hR}</div><div class="tp-metric-label">Alto</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">${mR}</div><div class="tp-metric-label">Medio</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">${lR}</div><div class="tp-metric-label">Bajo</div></div>
    </div>
    <div class="tp-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
            <span style="font-size: var(--fs-sm);font-weight:700;color:var(--tp-text);">Familias <span style="font-size: var(--fs-xs);font-weight:400;color:var(--tp-dim);">${filtered.length} mostradas</span></span>
            ${_activeFilters > 0 ? `<button class="tp-btn tp-btn-ghost" onclick="tpClearFamilyFilters();" style="font-size: var(--fs-xs);color:var(--tp-red);border-color:rgba(239,68,68,0.3);">✕ Quitar ${_activeFilters} filtro${_activeFilters>1?'s':''}</button>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:5px;margin-bottom:6px;">
            <select class="tp-select" onchange="window._tpFamRegion=this.value;tpRefreshFamilies();" style="font-size: var(--fs-xs);${regionFilter!=='ALL'?'border-color:#38bdf8;color:#38bdf8;':''}" title="Filtrar por región de mercado">
                <option value="ALL">📍 Región: Todas</option>
                ${allRegions.map(r => `<option value="${r}" ${r===regionFilter?'selected':''}>${r}</option>`).join('')}
            </select>
            <select class="tp-select" onchange="window._tpFamMY=this.value;tpRefreshFamilies();" style="font-size: var(--fs-xs);${myFilter!=='ALL'?'border-color:#06b6d4;color:#06b6d4;':''}" title="Filtrar por Model Year">
                <option value="ALL">📅 MY: Todos</option>
                ${allMYs.map(m => `<option value="${m}" ${m===myFilter?'selected':''}>${m}</option>`).join('')}
            </select>
            <select class="tp-select" onchange="window._tpFamModel=this.value;tpRefreshFamilies();" style="font-size: var(--fs-xs);${modelFilter!=='ALL'?'border-color:#a855f7;color:#a855f7;':''}" title="Filtrar por modelo de vehículo">
                <option value="ALL">🚗 Modelo: Todos</option>
                ${allModels.map(m => `<option value="${m}" ${m===modelFilter?'selected':''}>${m}</option>`).join('')}
            </select>
            <select class="tp-select" onchange="window._tpFamSort=this.value;tpRefreshFamilies();" style="font-size: var(--fs-xs);" title="Ordenar familias">
                <option value="risk"     ${sortBy==='risk'    ?'selected':''}>↕ Riesgo</option>
                <option value="volume"   ${sortBy==='volume'  ?'selected':''}>↕ Volumen</option>
                <option value="cov_asc"  ${sortBy==='cov_asc' ?'selected':''}>↑ Cobertura (menor)</option>
                <option value="cov_desc" ${sortBy==='cov_desc'?'selected':''}>↓ Cobertura (mayor)</option>
                <option value="my_desc"  ${sortBy==='my_desc' ?'selected':''}>↕ MY nuevo → antiguo</option>
                <option value="my_asc"   ${sortBy==='my_asc'  ?'selected':''}>↕ MY antiguo → nuevo</option>
                <option value="model"    ${sortBy==='model'   ?'selected':''}>↕ Modelo A–Z</option>
                <option value="deficit"  ${sortBy==='deficit' ?'selected':''}>↕ Déficit (más urgente)</option>
            </select>
        </div>
        ${sorted.map((f, fi) => {
            const diffs = getDiffFields(f.configs);
            const epTag = f.ep&&f.ep!=='0' ? `<span class="tp-badge" style="background:rgba(251,146,60,0.15);color:#fb923c;font-size: var(--fs-xs);">${epLabel(f.ep)}</span>` : '';
            const engTag = f.engpkg&&f.engpkg!=='0' ? `<span class="tp-badge" style="background:rgba(168,85,247,0.15);color:#a855f7;font-size: var(--fs-xs);">${f.engpkg}</span>` : '';
            var _fRisk = window._tpAuditView ? f.auditRiskLevel : f.riskLevel;
            var _fCov = window._tpAuditView ? f.auditCoverage : f.coverage;
            var _repStar = (window._tpAuditView && f.repTested) ? '<span style="font-size: var(--fs-xs);color:var(--tp-blue);" title="Representativa probada: ' + (f.representative && f.representative.tire || '') + '"> &#9733;</span>' : '';
            var _equivBadge = (window._tpAuditView && f.coveredByEquivalent) ? '<span class="tp-badge" style="background:rgba(56,189,248,0.18);color:#38bdf8;font-size: var(--fs-xs);" title="Cubierta por similar: ' + f.coveredByEquivalent.siblingLabel + ' (difiere en ' + f.coveredByEquivalent.reasons.join('/') + ')">≈ ' + f.coveredByEquivalent.reasons.join('/') + '</span>' : '';
            var _autoContCount = f.configs.filter(function(c){return c.coveredByContinuity&&c.coveredByContinuity.auto;}).length;
            var _manContCount  = f.continuityCoveredCount - _autoContCount;
            var _contBadge = (f.continuityCoveredCount > 0) ? '<span class="tp-badge" style="background:rgba(34,197,94,0.15);color:#22c55e;font-size: var(--fs-xs);" title="' + _manContCount + ' manual + ' + _autoContCount + ' auto-detectadas por MY">↪ Cont ' + (_autoContCount > 0 ? _autoContCount + ' auto' : f.continuityCoveredCount) + '</span>' : '';
            var _evidBtn = (f.totalTested > 0) ? '<button class="tp-btn tp-btn-ghost" onclick="event.preventDefault();event.stopPropagation();tpOpenFamilyEvidence(\'' + f.key.replace(/'/g, "\\'") + '\');" style="font-size: var(--fs-xs);padding:2px 6px;" title="Ver VINs y evidencia">📋</button>' : '';
            return `
            <details style="margin-bottom:4px;border:1px solid var(--tp-border);border-radius:8px;overflow:hidden;border-left:3px solid ${rc[_fRisk]};">
                <summary style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;cursor:pointer;list-style:none;background:var(--tp-card);gap:4px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:4px;flex:1;min-width:140px;flex-wrap:wrap;">
                        <span style="font-weight:800;font-size: var(--fs-sm);">${f.mod}</span>
                        ${(f.bodies||[]).map(_bodyBadge).join('')}
                        <span style="font-size: var(--fs-xs);color:var(--tp-dim);">${f.eng} ${f.tx}</span>
                        <span class="tp-badge" style="background:rgba(6,182,212,0.15);color:#06b6d4;font-size: var(--fs-xs);">${f.my}</span>
                        <span class="tp-badge" style="background:rgba(139,92,246,0.15);color:#8b5cf6;font-size: var(--fs-xs);">${f.reg}</span>
                        ${(f.rgns||[]).map(r=>`<span class="tp-badge" style="background:${tpRegionColor(r)}20;color:${tpRegionColor(r)};font-size: var(--fs-xs);">${r}</span>`).join('')}
                        ${(f.drvs||[]).map(d=>`<span class="tp-badge" style="background:rgba(236,72,153,0.15);color:#ec4899;font-size: var(--fs-xs);">${d}</span>`).join('')}
                        ${epTag}${engTag}${_repStar}${_equivBadge}${_contBadge}${tpFamilyFlagBadge(f)}
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                        ${(f.pausedCount > 0 || f.dormantCount > 0) ? `<span class="tp-badge" style="background:rgba(245,158,11,0.15);color:var(--tp-amber);font-size: var(--fs-xs);" title="${f.pausedCount} pausada(s) que ya no exigen pruebas, ${f.dormantCount} dormida(s) sin decisión (3+ meses en 0)">${f.pausedCount > 0 ? '⏸' + f.pausedCount : ''}${f.dormantCount > 0 ? ' 😴' + f.dormantCount : ''}</span>` : ''}
                        ${tpLastTestBadge(f)}
                        ${_evidBtn}
                        <span style="font-size: var(--fs-xs);font-weight:700;color:${f.totalTested>0?'var(--tp-green)':'var(--tp-red)'};">${f.totalTested}/${f.totalRequired}</span>
                        <div class="tp-bar" style="width:40px;"><div class="tp-bar-fill" style="width:${Math.round(_fCov*100)}%;background:${rc[_fRisk]};"></div><span class="tp-bar-text" style="font-size: var(--fs-xs);">${Math.round(_fCov*100)}%</span></div>
                    </div>
                </summary>
                <div style="padding:6px 8px;background:var(--tp-dark);border-top:1px solid var(--tp-border);">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 6px;margin-bottom:6px;background:rgba(245,158,11,0.05);border:1px dashed rgba(245,158,11,0.3);border-radius:5px;">
                        <span style="font-size: var(--fs-sm);font-weight:700;color:var(--tp-amber);">⚑ Prioridad</span>
                        <label style="font-size: var(--fs-sm);color:var(--tp-dim);display:flex;align-items:center;gap:3px;">Criticidad
                            <select class="tp-select" style="font-size: var(--fs-sm);padding:2px 4px;" onchange="tpSetFamilyOverride('${f.key.replace(/'/g,"\\'")}','criticality',this.value);">
                                <option value="normal" ${f.criticality==='normal'?'selected':''}>Normal</option>
                                <option value="high" ${f.criticality==='high'?'selected':''}>Alto</option>
                                <option value="critical" ${f.criticality==='critical'?'selected':''}>Crítico</option>
                            </select>
                        </label>
                        <label style="font-size: var(--fs-sm);color:var(--tp-dim);display:flex;align-items:center;gap:3px;">Deadline familia
                            <input type="date" value="${f.familyDeadline||''}" class="tp-select" style="font-size: var(--fs-sm);padding:2px 4px;" onchange="tpSetFamilyOverride('${f.key.replace(/'/g,"\\'")}','deadline',this.value);">
                        </label>
                        ${f.familyDeadline?`<button class="tp-btn tp-btn-ghost" onclick="tpSetFamilyOverride('${f.key.replace(/'/g,"\\'")}','deadline','');" style="font-size: var(--fs-sm);padding:1px 5px;color:var(--tp-red);">Quitar deadline</button>`:''}
                        <span style="font-size: var(--fs-sm);color:var(--tp-dim);font-style:italic;">· o pon un deadline por variante abajo ↓</span>
                    </div>
                    ${diffs.length > 0 ? `<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom:4px;letter-spacing:0.02em;">Variantes por: <span style="color:var(--tp-text);font-weight:600;">${diffs.map(d=>d.label).join(' · ')}</span></div>` : ''}
                    ${f.configs.sort((a,b)=>b.total-a.total).map((c, _ci) => {
                        let badges = '';
                        if (diffs.length > 0) {
                            badges = diffs.map(d => {
                                let v = c[d.field]||'';
                                if (d.field==='ep') v = epLabel(v);
                                if (!v||v==='0') v = '-';
                                const _fldColors = {tire:'#38bdf8',ep:'#fb923c',engpkg:'#a855f7',drv:'#ec4899',rgn:'#f97316'};
                                const _bodyColors = {'4DR':'#3b82f6','5DR':'#8b5cf6','WGN':'#14b8a6','WGN LONG':'#10b981','2DR':'#f59e0b'};
                                const _c = d.field === 'body' ? (_bodyColors[v] || '#64748b') : (_fldColors[d.field] || '#888');
                                return `<span style="font-size: var(--fs-sm);padding:1px 5px;border-radius:4px;background:${_c}22;color:${_c};border:1px solid ${_c}44;">${v}</span>`;
                            }).join(' ');
                        } else {
                            // Single config - show tire as identifier
                            const tire = c.tire || c.desc.match(/\d{3}\/\d{2}\s*R\d+/)?.[0] || '';
                            if (tire) badges = `<span style="font-size: var(--fs-sm);padding:1px 5px;border-radius:4px;background:#38bdf815;color:#38bdf8;border:1px solid #38bdf830;">${tire}</span>`;
                        }
                        // Build VIN sublist for tested configs
                        let vinHtml = '';
                        if (c.testedN > 0 && c.vins && c.vins.length > 0) {
                            var _vinId = 'tp-vins-' + fi + '-' + _ci;
                            vinHtml = `<div id="${_vinId}" style="display:none;padding:4px 6px 4px 20px;background:var(--tp-dark);border-top:1px solid var(--tp-border);">`;
                            c.vins.forEach(function(v) {
                                const vin = _tpExtractVin(v.note) || (String(v.note||'').split('—')[0].trim()) || '—';
                                vinHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 4px;border-bottom:1px solid var(--tp-border);color:var(--tp-text);">
                                    <span style="font-family:monospace;font-size: var(--fs-sm);color:var(--tp-text);">${vin}</span>
                                    <span style="font-size: var(--fs-sm);color:var(--tp-dim);">${v.date || '?'}</span>
                                </div>`;
                            });
                            vinHtml += `</div>`;
                        }
                        var _dotColor, _dotTitle;
                        if (c.testedN >= c.required) { _dotColor = 'var(--tp-green)'; _dotTitle = 'Probada'; }
                        else if (c.coveredByContinuity) { _dotColor = '#84cc16'; _dotTitle = 'Continuidad MY ' + c.coveredByContinuity.prevMy + ' (' + c.coveredByContinuity.prevTestVin + ')'; }
                        else if (c.coveredByRep && window._tpAuditView) { _dotColor = 'var(--tp-blue)'; _dotTitle = 'Cubierta por representativa (' + (f.representative && f.representative.tire || '') + ')'; }
                        else if (c.testedN > 0) { _dotColor = 'var(--tp-amber)'; _dotTitle = 'Parcial'; }
                        else { _dotColor = 'var(--tp-red)'; _dotTitle = 'Sin pruebas'; }
                        var _repBadge = c.isRepresentative && window._tpAuditView ? '<span style="font-size: var(--fs-sm);color:var(--tp-blue);font-weight:700;" title="Representativa (mayor volumen)">REP</span>' : '';
                        var _isAutoCont = c.coveredByContinuity && c.coveredByContinuity.auto;
                        var _contTag = c.coveredByContinuity ? '<span style="font-size: var(--fs-sm);padding:1px 4px;border-radius:3px;background:rgba(132,204,22,0.2);color:#84cc16;' + (_isAutoCont ? 'border:1px dashed #84cc16;' : '') + '" title="' + (c.coveredByContinuity.note || 'Carry-over sin cambios de emisiones') + '">' + (_isAutoCont ? 'AUTO ' : '') + 'CONT ' + c.coveredByContinuity.prevMy + '</span>' : '';
                        var _contBtn = (c.testedN === 0) ? '<button class="tp-btn tp-btn-ghost" onclick="event.stopPropagation();tpOpenContinuityModal(' + JSON.stringify(c.desc).replace(/"/g, '&quot;') + ',' + JSON.stringify(c.my || '').replace(/"/g, '&quot;') + ');" style="font-size: var(--fs-sm);padding:1px 5px;" title="Marcar continuidad técnica vs MY previo">↪</button>' : '';
                        // Deadline particular por variante
                        var _descArg = JSON.stringify(c.desc).replace(/"/g, '&quot;');
                        var _cDeadBadge = '';
                        if (c.overrideDeadline) {
                            var _cd = c.daysToDeadline;
                            var _cc = _cd < 7 ? '#ef4444' : _cd < 14 ? '#f59e0b' : '#06b6d4';
                            var _ct = _cd < 0 ? 'vencido' : _cd + 'd';
                            _cDeadBadge = '<span style="font-size: var(--fs-sm);font-weight:700;color:' + _cc + ';" title="Deadline ' + c.overrideDeadline + '">⏰' + _ct + '</span>';
                        }
                        var _cDeadCtrl = '<input type="date" value="' + (c.overrideDeadline || '') + '" class="tp-select" title="Deadline de esta variante" onclick="event.stopPropagation();" onchange="event.stopPropagation();tpSetConfigOverride(' + _descArg + ',this.value);" style="font-size: var(--fs-sm);padding:2px 4px;width:132px;">'
                            + (c.overrideDeadline ? '<button class="tp-btn tp-btn-ghost" onclick="event.stopPropagation();tpSetConfigOverride(' + _descArg + ',&quot;&quot;);" style="font-size: var(--fs-sm);padding:0 4px;color:var(--tp-red);" title="Quitar deadline de variante">✕</button>' : '');
                        const clickable = c.testedN > 0 ? `onclick="var el=document.getElementById('tp-vins-${fi}-${_ci}');if(el)el.style.display=el.style.display==='none'?'block':'none';" style="cursor:pointer;"` : '';
                        return `
                        <div style="margin-bottom:2px;border:1px solid var(--tp-border);border-radius:4px;background:var(--tp-card);overflow:hidden;">
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;font-size: var(--fs-sm);flex-wrap:wrap;gap:4px;" ${clickable}>
                                <div style="display:flex;align-items:center;gap:4px;flex:1;min-width:0;flex-wrap:wrap;">
                                    <span class="tp-dot" style="background:${_dotColor};" title="${_dotTitle}"></span>${_repBadge}${_contTag}
                                    ${badges}
                                    ${c.testedN > 0 ? '<span style="font-size: var(--fs-sm);color:var(--tp-dim);">▼</span>' : ''}
                                </div>
                                <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
                                    ${_cDeadBadge}${_cDeadCtrl}
                                    ${_contBtn}
                                    <span style="font-size: var(--fs-sm);font-weight:700;color:${c.testedN>=c.required?'var(--tp-green)':'var(--tp-red)'};">${c.testedN}/${c.required}</span>
                                    <span style="font-size: var(--fs-sm);color:var(--tp-dim);">${c.total.toLocaleString()}</span>
                                </div>
                            </div>
                            ${vinHtml}
                        </div>`;
                    }).join('')}
                </div>
            </details>`;
        }).join('')}
    </div>`;
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M20] SIMULATOR / WHAT-IF                                          ║
// ╚══════════════════════════════════════════════════════════════════════╝

function tpRenderSimulator(el) {
    if (tpState.planData.length === 0) {
        el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">Importa el plan de producción primero.</div>';
        return;
    }

    const simCap = window._tpSimCap || tpState.capacity;
    const simWeeks = window._tpSimWeeks || 26;

    // Run simulation
    const sim = tpRunSimulation(simCap, simWeeks);

    el.innerHTML = `
    <div class="tp-card">
        <div class="tp-card-title"><span>🔮 Simulador What-If</span></div>
        <p style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom:14px;">Simula escenarios ajustando la capacidad semanal para ver en cuánto tiempo alcanzas cobertura completa.</p>
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;">
            <div>
                <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:3px;">Capacidad Semanal</label>
                <input class="tp-input" type="range" min="1" max="30" value="${simCap}" id="tp-sim-cap" style="width:200px;accent-color:var(--tp-amber);" oninput="document.getElementById('tp-sim-cap-val').textContent=this.value;">
                <span id="tp-sim-cap-val" style="font-weight:800;color:var(--tp-amber);font-size:14px;margin-left:8px;">${simCap}</span> <span style="font-size: var(--fs-xs);color:var(--tp-dim);">pruebas/semana</span>
            </div>
            <div>
                <label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom:3px;">Horizonte (semanas)</label>
                <input class="tp-input" type="number" min="4" max="52" value="${simWeeks}" id="tp-sim-weeks" style="width:70px;text-align:center;">
            </div>
            <button class="tp-btn tp-btn-primary" onclick="window._tpSimCap=+document.getElementById('tp-sim-cap').value;window._tpSimWeeks=+document.getElementById('tp-sim-weeks').value;tpRender();">🔄 Simular</button>
        </div>
    </div>

    <!-- Key results -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">
        <div class="tp-metric"><div class="tp-metric-val" style="color:${sim.weeksTo100<=simWeeks?'var(--tp-green)':'var(--tp-red)'}">${sim.weeksTo100 <= simWeeks ? sim.weeksTo100 : '>' + simWeeks}</div><div class="tp-metric-label">Semanas a 100%</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">${sim.totalTestsNeeded}</div><div class="tp-metric-label">Pruebas necesarias</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">${sim.currentCoverage}%</div><div class="tp-metric-label">Cobertura actual</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">${sim.coverageAtEnd}%</div><div class="tp-metric-label">Cobertura sem. ${simWeeks}</div></div>
    </div>

    <!-- Coverage curve chart -->
    <div class="tp-card">
        <div class="tp-card-title"><span>📈 Curva de Cobertura Proyectada</span></div>
        <div style="display:flex;align-items:flex-end;gap:1px;height:160px;padding:10px 0;">
            ${sim.curve.map((pt, i) => `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
                    <div style="width:100%;background:${pt.pct>=100?'var(--tp-green)':pt.pct>=50?'var(--tp-amber)':'var(--tp-red)'};border-radius:2px 2px 0 0;height:${pt.pct}%;min-height:2px;transition:height .3s;opacity:0.8;"></div>
                    ${i % Math.max(1, Math.floor(sim.curve.length/12)) === 0 ? `<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:2px;">S${pt.week}</div>` : ''}
                </div>
            `).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;font-size: var(--fs-xs);color:var(--tp-dim);padding:0 4px;">
            <span>Semana 1</span>
            <span>Semana ${simWeeks}</span>
        </div>
    </div>

    <!-- Capacity comparison table -->
    <div class="tp-card">
        <div class="tp-card-title"><span>📊 Comparación de Escenarios</span></div>
        <p style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:10px;">Para presentar a gerencia: qué capacidad necesitas para alcanzar cobertura en diferentes plazos.</p>
        <table class="tp-table">
            <thead><tr><th>Capacidad</th><th>Semanas a 100%</th><th>Pruebas Total</th><th>Cobertura Sem 8</th><th>Cobertura Sem 16</th><th>Cobertura Sem 26</th></tr></thead>
            <tbody>
                ${[4, 6, 8, 10, 12, 15, 20].map(cap => {
                    const s = tpRunSimulation(cap, 26);
                    const s8 = tpRunSimulation(cap, 8);
                    const s16 = tpRunSimulation(cap, 16);
                    return `
                        <tr style="${cap === simCap ? 'background:rgba(245,158,11,0.1);' : ''}">
                            <td style="font-weight:700;${cap===simCap?'color:var(--tp-amber);':''}">${cap}/sem${cap===tpState.capacity?' (actual)':''}</td>
                            <td style="font-weight:700;color:${s.weeksTo100<=26?'var(--tp-green)':'var(--tp-red)'};">${s.weeksTo100<=26?s.weeksTo100:'>26'}</td>
                            <td>${s.totalTestsNeeded}</td>
                            <td>${s8.coverageAtEnd}%</td>
                            <td>${s16.coverageAtEnd}%</td>
                            <td>${s.coverageAtEnd}%</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    </div>
    `;
}

function tpRunSimulation(capacity, maxWeeks) {
    const analysis = tpGetAnalysis();
    const totalConfigs = analysis.length;
    const totalRequired = analysis.reduce((s,a) => s + a.required, 0);
    const currentTested = analysis.reduce((s,a) => s + a.testedN, 0);
    const currentOk = analysis.filter(a => a.status === 'ok').length;
    const currentCoverage = totalConfigs > 0 ? Math.round((currentOk / totalConfigs) * 100) : 0;
    const totalDeficit = Math.max(0, totalRequired - currentTested);

    // Simulate week by week
    const testedSim = new Map();
    analysis.forEach(a => testedSim.set(a.desc, a.testedN));

    const curve = [];
    let weeksTo100 = maxWeeks + 1;

    for (let w = 1; w <= maxWeeks; w++) {
        // Pick top-deficit configs
        const scored = analysis.map(a => {
            const n = testedSim.get(a.desc) || 0;
            const rule = tpGetRule(a);
            const req = tpCalcRequired(a, rule);
            const deficit = Math.max(0, req - n);
            return { ...a, simTested: n, simReq: req, simDeficit: deficit };
        }).filter(c => c.simDeficit > 0 && c.total > 0).sort((a,b) => b.score - a.score);

        let remaining = capacity;
        const used = new Set();
        for (const cfg of scored) {
            if (remaining <= 0) break;
            if (used.has(cfg.desc)) continue;
            testedSim.set(cfg.desc, (testedSim.get(cfg.desc)||0) + 1);
            used.add(cfg.desc);
            remaining--;
        }

        // Calculate coverage at this point
        let ok = 0;
        analysis.forEach(a => {
            const n = testedSim.get(a.desc) || 0;
            const rule = tpGetRule(a);
            const req = tpCalcRequired(a, rule);
            if (n >= req) ok++;
        });
        const pct = totalConfigs > 0 ? Math.round((ok / totalConfigs) * 100) : 0;
        curve.push({ week: w, pct, ok });
        if (pct >= 100 && weeksTo100 > maxWeeks) weeksTo100 = w;
    }

    const coverageAtEnd = curve.length > 0 ? curve[curve.length - 1].pct : currentCoverage;

    return { totalTestsNeeded: totalDeficit, currentCoverage, coverageAtEnd, weeksTo100, curve };
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  MONTHLY CALENDAR VIEW                                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

var _tpCalendarMonth = null; // { year, month } — null = current

function tpCalendarNav(delta) {
    if (!_tpCalendarMonth) {
        var now = new Date();
        _tpCalendarMonth = { year: now.getFullYear(), month: now.getMonth() };
    }
    _tpCalendarMonth.month += delta;
    if (_tpCalendarMonth.month > 11) { _tpCalendarMonth.month = 0; _tpCalendarMonth.year++; }
    if (_tpCalendarMonth.month < 0) { _tpCalendarMonth.month = 11; _tpCalendarMonth.year--; }
    tpRender();
}

function tpRenderCalendar(el) {
    var now = new Date();
    if (!_tpCalendarMonth) _tpCalendarMonth = { year: now.getFullYear(), month: now.getMonth() };
    var year = _tpCalendarMonth.year;
    var month = _tpCalendarMonth.month;

    var monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var dayNames = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

    // Gather events: weekly plan items + tested list results
    var events = {}; // dateKey -> [{type, label, color, detail}]

    function addEvent(dateKey, type, label, color, detail) {
        if (!events[dateKey]) events[dateKey] = [];
        events[dateKey].push({ type: type, label: label, color: color, detail: detail || '' });
    }

    // Weekly plan items (use acceptedDate or created as base, items show completion dates)
    var plans = tpState.weeklyPlans || [];
    plans.forEach(function(w, wi) {
        var weekStart = new Date(w.created);
        w.items.forEach(function(item) {
            if (item.completed && item.completedDate) {
                var d = new Date(item.completedDate);
                var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                var shortDesc = item.desc.length > 30 ? item.desc.substring(0, 28) + '..' : item.desc;
                addEvent(key, 'completed', shortDesc, '#10b981', 'Sem ' + (wi+1));
            } else if (!item.completed) {
                // Pending items: assign to the week's creation date spread
                var base = new Date(w.created);
                var key = base.getFullYear() + '-' + String(base.getMonth()+1).padStart(2,'0') + '-' + String(base.getDate()).padStart(2,'0');
                var shortDesc = item.desc.length > 30 ? item.desc.substring(0, 28) + '..' : item.desc;
                addEvent(key, 'pending', shortDesc, '#f59e0b', 'Sem ' + (wi+1) + ' pendiente');
            }
        });
        // Week marker
        var ws = new Date(w.created);
        var wKey = ws.getFullYear() + '-' + String(ws.getMonth()+1).padStart(2,'0') + '-' + String(ws.getDate()).padStart(2,'0');
        addEvent(wKey, 'week', 'Sem ' + (wi+1) + (w.accepted ? ' (aceptada)' : ''), '#3b82f6', w.items.length + ' items');
    });

    // Tested list (actual COP results fed into test plan)
    var tested = tpState.testedList || [];
    tested.forEach(function(t) {
        if (t.date) {
            var d = new Date(t.date);
            var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
            var shortDesc = (t.configText || '').length > 30 ? t.configText.substring(0, 28) + '..' : (t.configText || '?');
            addEvent(key, 'tested', shortDesc, '#8b5cf6', t.vin || '');
        }
    });

    // Build calendar grid
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);
    var startDow = (firstDay.getDay() + 6) % 7; // Monday=0
    var daysInMonth = lastDay.getDate();
    var todayKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

    // Stats for this month
    var monthEvents = 0, monthCompleted = 0, monthPending = 0, monthTested = 0;
    for (var dk in events) {
        if (dk.startsWith(year + '-' + String(month+1).padStart(2,'0'))) {
            events[dk].forEach(function(e) {
                if (e.type === 'completed') { monthCompleted++; monthEvents++; }
                else if (e.type === 'pending') { monthPending++; monthEvents++; }
                else if (e.type === 'tested') { monthTested++; monthEvents++; }
            });
        }
    }

    var html = '';
    html += '<div class="tp-card" style="padding:14px;">';

    // Header with navigation
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
    html += '<button class="tp-btn tp-btn-ghost" onclick="tpCalendarNav(-1)" style="font-size:16px;padding:4px 10px;">◀</button>';
    html += '<div style="text-align:center;">';
    html += '<div style="font-size:16px;font-weight:800;color:var(--tp-amber);">' + monthNames[month] + ' ' + year + '</div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + monthCompleted + ' completadas | ' + monthPending + ' pendientes | ' + monthTested + ' probadas</div>';
    html += '</div>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="tpCalendarNav(1)" style="font-size:16px;padding:4px 10px;">▶</button>';
    html += '</div>';

    // Metrics row
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;">';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green);">' + monthCompleted + '</div><div class="tp-metric-label">Completadas</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber);">' + monthPending + '</div><div class="tp-metric-label">Pendientes</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:#8b5cf6;">' + monthTested + '</div><div class="tp-metric-label">Probadas</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue);">' + (monthCompleted + monthTested) + '</div><div class="tp-metric-label">Total</div></div>';
    html += '</div>';

    // Day headers
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">';
    dayNames.forEach(function(dn) {
        html += '<div style="text-align:center;font-size: var(--fs-xs);font-weight:700;color:var(--tp-dim);padding:4px 0;">' + dn + '</div>';
    });
    html += '</div>';

    // Calendar cells
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">';

    // Empty cells before first day
    for (var e = 0; e < startDow; e++) {
        html += '<div style="min-height:60px;background:var(--tp-bg);border-radius:4px;opacity:0.3;"></div>';
    }

    for (var d = 1; d <= daysInMonth; d++) {
        var dateKey = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        var dayEvents = events[dateKey] || [];
        var isToday = dateKey === todayKey;
        var isWeekend = ((startDow + d - 1) % 7) >= 5;

        html += '<div style="min-height:60px;background:' + (isToday ? 'rgba(59,130,246,0.15)' : isWeekend ? 'rgba(100,116,139,0.05)' : 'var(--tp-card)') + ';border-radius:4px;padding:3px;border:1px solid ' + (isToday ? 'var(--tp-blue)' : 'var(--tp-border)') + ';overflow:hidden;" onclick="tpCalendarDayDetail(\'' + dateKey + '\')">';
        html += '<div style="font-size: var(--fs-xs);font-weight:' + (isToday ? '800' : '600') + ';color:' + (isToday ? 'var(--tp-blue)' : 'var(--tp-text)') + ';margin-bottom:2px;">' + d + '</div>';

        // Show max 3 events as dots/pills
        var shown = dayEvents.filter(function(ev) { return ev.type !== 'week'; });
        var weekEv = dayEvents.find(function(ev) { return ev.type === 'week'; });
        if (weekEv) {
            html += '<div style="font-size: var(--fs-xs);padding:1px 3px;background:rgba(59,130,246,0.2);color:var(--info-text);border-radius:2px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + weekEv.label + '</div>';
        }
        shown.slice(0, 2).forEach(function(ev) {
            html += '<div style="font-size: var(--fs-xs);padding:1px 3px;background:' + ev.color + '20;color:' + ev.color + ';border-radius:2px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + ev.label + '</div>';
        });
        if (shown.length > 2) {
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);text-align:center;">+' + (shown.length - 2) + '</div>';
        }
        html += '</div>';
    }

    // Empty cells after last day
    var totalCells = startDow + daysInMonth;
    var remaining = (7 - (totalCells % 7)) % 7;
    for (var r = 0; r < remaining; r++) {
        html += '<div style="min-height:60px;background:var(--tp-bg);border-radius:4px;opacity:0.3;"></div>';
    }
    html += '</div>'; // grid end

    // Legend
    html += '<div style="display:flex;gap:12px;margin-top:10px;justify-content:center;flex-wrap:wrap;">';
    html += '<div style="display:flex;align-items:center;gap:4px;font-size: var(--fs-xs);color:var(--tp-dim);"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;"></span> Completada</div>';
    html += '<div style="display:flex;align-items:center;gap:4px;font-size: var(--fs-xs);color:var(--tp-dim);"><span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block;"></span> Pendiente</div>';
    html += '<div style="display:flex;align-items:center;gap:4px;font-size: var(--fs-xs);color:var(--tp-dim);"><span style="width:8px;height:8px;border-radius:50%;background:#8b5cf6;display:inline-block;"></span> Probada (COP)</div>';
    html += '<div style="display:flex;align-items:center;gap:4px;font-size: var(--fs-xs);color:var(--tp-dim);"><span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;display:inline-block;"></span> Semana Plan</div>';
    html += '</div>';

    html += '</div>'; // card end

    // Day detail panel (hidden until click)
    html += '<div id="tp-calendar-detail"></div>';

    el.innerHTML = html;
}

function tpCalendarDayDetail(dateKey) {
    var detailEl = document.getElementById('tp-calendar-detail');
    if (!detailEl) return;

    var parts = dateKey.split('-');
    var dateLabel = parseInt(parts[2]) + '/' + parseInt(parts[1]) + '/' + parts[0];

    // Gather all events for this day
    var dayEvents = [];

    var plans = tpState.weeklyPlans || [];
    plans.forEach(function(w, wi) {
        w.items.forEach(function(item) {
            if (item.completed && item.completedDate) {
                var d = new Date(item.completedDate);
                var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                if (key === dateKey) dayEvents.push({ type: 'completed', desc: item.desc, detail: 'Semana ' + (wi+1), color: '#10b981', icon: '✅' });
            } else if (!item.completed) {
                var base = new Date(w.created);
                var key = base.getFullYear() + '-' + String(base.getMonth()+1).padStart(2,'0') + '-' + String(base.getDate()).padStart(2,'0');
                if (key === dateKey) dayEvents.push({ type: 'pending', desc: item.desc, detail: 'Semana ' + (wi+1) + ' — pendiente', color: '#f59e0b', icon: '⏳' });
            }
        });
    });

    var tested = tpState.testedList || [];
    tested.forEach(function(t) {
        if (t.date) {
            var d = new Date(t.date);
            var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
            if (key === dateKey) dayEvents.push({ type: 'tested', desc: t.configText || '?', detail: 'VIN: ' + (t.vin || '?'), color: '#8b5cf6', icon: '🧪' });
        }
    });

    if (dayEvents.length === 0) {
        detailEl.innerHTML = '<div class="tp-card" style="margin-top:8px;text-align:center;padding:20px;color:var(--tp-dim);font-size: var(--fs-sm);">Sin eventos el ' + dateLabel + '</div>';
        return;
    }

    var html = '<div class="tp-card" style="margin-top:8px;">';
    html += '<div class="tp-card-title"><span style="font-size:12px;">📋 ' + dateLabel + ' (' + dayEvents.length + ' eventos)</span></div>';
    dayEvents.forEach(function(ev) {
        html += '<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--tp-border);">';
        html += '<div style="font-size:14px;">' + ev.icon + '</div>';
        html += '<div style="flex:1;">';
        html += '<div style="font-size: var(--fs-xs);font-weight:700;color:' + ev.color + ';">' + ev.desc + '</div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + ev.detail + '</div>';
        html += '</div></div>';
    });
    html += '</div>';

    detailEl.innerHTML = html;
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M21] COP15 ALTA — SUGGESTION PANEL                               ║
// ╚══════════════════════════════════════════════════════════════════════╝

function tpGetAltaSuggestion(configText) {
    // Returns suggestion HTML to show in COP15 Alta when registering a vehicle
    if (tpState.planData.length === 0) return '';
    const cfg = tpState.planData.find(c => c.desc === configText);
    if (!cfg) return '';

    const rule = tpGetRule(cfg);
    const n = tpState.testedList.filter(t => t.configText === configText).length;
    const req = tpCalcRequired(cfg, rule);
    const deficit = Math.max(0, req - n);

    // Get weekly plan pending items
    let weeklyPending = [];
    const wps = tpState.weeklyPlans || [];
    if (wps.length > 0) {
        const lastWp = wps[wps.length - 1];
        weeklyPending = lastWp.items.filter(i => !i.completed);
    }

    return { cfg, tested: n, required: req, deficit, weeklyPending };
}

function tpRenderAltaSuggestionPanel(configText) {
    const panel = document.getElementById('tp-alta-suggestion');
    if (!panel) return;
    if (!configText || tpState.planData.length === 0) { panel.innerHTML = ''; panel.style.display = 'none'; return; }

    const info = tpGetAltaSuggestion(configText);
    if (!info || !info.cfg) { panel.innerHTML = ''; panel.style.display = 'none'; return; }

    const weeklyHTML = info.weeklyPending.length > 0 ? `
        <div style="margin-top:8px;padding:8px;background:#f8fafc;border-radius:6px;border:1px solid #e2e5ea;">
            <div style="font-size: var(--fs-xs);font-weight:700;color:var(--warn-text);margin-bottom:4px;">📌 Pendientes esta semana:</div>
            ${info.weeklyPending.slice(0,4).map(i => `
                <div style="font-size: var(--fs-xs);color:#475569;padding:2px 0;display:flex;justify-content:space-between;">
                    <span style="max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i.desc}</span>
                    <span style="color:${i.desc===configText?'var(--ok-text)':'var(--muted)'};font-weight:700;">${i.desc===configText?'← ESTE':'pendiente'}</span>
                </div>
            `).join('')}
            ${info.weeklyPending.length > 4 ? `<div style="font-size: var(--fs-xs);color:var(--muted);">+${info.weeklyPending.length-4} más</div>` : ''}
        </div>
    ` : '';

    panel.style.display = 'block';
    panel.innerHTML = `
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1px solid #f59e0b40;border-radius:8px;padding:10px 14px;margin-top:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-weight:800;font-size: var(--fs-sm);color:#92400e;">📊 Test Plan Manager</span>
                <span style="font-size: var(--fs-xs);padding:2px 8px;border-radius:10px;font-weight:700;background:${info.deficit>0?'#fef2f2;color:var(--danger-text);border:1px solid #fca5a5':'#ecfdf5;color:#059669;border:1px solid #6ee7b7'};">${info.deficit>0?info.tested+'/'+info.required+' (faltan '+info.deficit+')':'✅ Cubierta'}</span>
            </div>
            <div style="font-size: var(--fs-xs);color:#78350f;">
                ${info.cfg.mod} | ${info.cfg.rgn} | ${info.cfg.eng} | Vol: ${(info.cfg.total+info.cfg.hist).toLocaleString()} uds
            </div>
            ${weeklyHTML}
        </div>
    `;
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M22] HOOK SUGGESTION INTO COP15 ALTA FLOW                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ══════════════════════════════════════════════════════════════════
// MEJORA B: SUBSTITUTION PREDICTION ENGINE
// ══════════════════════════════════════════════════════════════════

function tpBuildSubstitutionHistory() {
    var history = {}; // { originalDesc: { testedDesc: count, ... } }
    if (!tpState.weeklyPlans) return history;

    tpState.weeklyPlans.forEach(function(plan) {
        if (!plan.items) return;
        plan.items.forEach(function(item) {
            if (item.substituted && item.substitution) {
                var orig = item.substitution.originalDesc || item.desc;
                var tested = item.substitution.testedDesc;
                if (!tested || orig === tested) return;
                if (!history[orig]) history[orig] = {};
                history[orig][tested] = (history[orig][tested] || 0) + 1;
            }
        });
    });
    return history;
}

function tpPredictSubstitutions(items) {
    var history = tpBuildSubstitutionHistory();
    if (Object.keys(history).length === 0) return [];

    var predictions = [];
    items.forEach(function(item, idx) {
        if (item.completed) return;
        var desc = item.desc;
        if (!history[desc]) return;

        // Find most common substitution
        var subs = history[desc];
        var totalSubs = 0;
        var bestSub = null;
        var bestCount = 0;

        Object.keys(subs).forEach(function(testedDesc) {
            totalSubs += subs[testedDesc];
            if (subs[testedDesc] > bestCount) {
                bestCount = subs[testedDesc];
                bestSub = testedDesc;
            }
        });

        // Count total times this config appeared in plans (substituted or not)
        var totalAppearances = 0;
        tpState.weeklyPlans.forEach(function(plan) {
            if (!plan.items) return;
            plan.items.forEach(function(i) {
                if (i.desc === desc || (i.substitution && i.substitution.originalDesc === desc)) totalAppearances++;
            });
        });

        if (totalAppearances < 2) return; // Need at least 2 data points
        var probability = Math.round((totalSubs / totalAppearances) * 100);

        if (probability >= 30 && bestSub) {
            // Find the differences between planned and predicted
            var diffs = [];
            var planned = tpState.planData.find(function(c) { return c.desc === desc; });
            var predicted = tpState.planData.find(function(c) { return c.desc === bestSub; });
            if (planned && predicted) {
                var flexFields = ['ep', 'engpkg', 'tire', 'drv', 'body'];
                flexFields.forEach(function(f) {
                    var pv = (planned[f] || '').toUpperCase();
                    var rv = (predicted[f] || '').toUpperCase();
                    if (pv !== rv && (pv || rv)) {
                        diffs.push({ field: f, planned: planned[f] || '—', predicted: predicted[f] || '—' });
                    }
                });
            }

            predictions.push({
                itemIdx: idx,
                desc: desc,
                predictedSub: bestSub,
                probability: probability,
                count: bestCount,
                totalSubs: totalSubs,
                diffs: diffs
            });
        }
    });

    return predictions.sort(function(a, b) { return b.probability - a.probability; });
}

function tpGetSubstitutionBadge(item, itemIdx, predictions) {
    if (!predictions || predictions.length === 0) return '';
    var pred = predictions.find(function(p) { return p.itemIdx === itemIdx; });
    if (!pred) return '';

    var color = pred.probability >= 70 ? '#f59e0b' : '#8b5cf6';
    var diffsText = pred.diffs.map(function(d) { return d.field + ': ' + d.planned + ' → ' + d.predicted; }).join(', ');
    return '<span style="font-size: var(--fs-xs);padding:1px 4px;border-radius:2px;background:' + color + '15;color:' + color + ';border:1px solid ' + color + '30;cursor:help;" title="Sustitucion probable (' + pred.probability + '%) → ' + diffsText + '">🔮 ' + pred.probability + '%</span>';
}

// Override/extend the cascade filter result to also show TP suggestion

function tpHookCascadeResult() {
    // Watch for changes in cfg_result to trigger suggestion
    const observer = new MutationObserver(() => {
        const resultEl = document.getElementById('cfg_result');
        if (!resultEl) return;
        // Look for the monospace config text that appears when a unique config is found
        const monoDiv = resultEl.querySelector('div[style*="monospace"]');
        if (monoDiv && monoDiv.textContent.trim()) {
            tpRenderAltaSuggestionPanel(monoDiv.textContent.trim());
        } else {
            const panel = document.getElementById('tp-alta-suggestion');
            if (panel) { panel.innerHTML = ''; panel.style.display = 'none'; }
        }
    });
    const target = document.getElementById('cfg_result');
    if (target) observer.observe(target, { childList: true, characterData: true, subtree: true });
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [AUDIT-EXT] Continuidad MY, Evidencia, Readiness Card, Heatmap     ║
// ╚══════════════════════════════════════════════════════════════════════╝

function _tpEnsureAuditState() {
    if (!tpState.myContinuity) tpState.myContinuity = {};
}

function tpOpenContinuityModal(configDesc, currentMy) {
    _tpEnsureAuditState();
    if (!tpState.planData || tpState.planData.length === 0) {
        showToast('Importa el plan de producción primero', 'error');
        return;
    }
    var cfg = tpState.planData.find(function(c) { return c.desc === configDesc; });
    if (!cfg) { showToast('Configuración no encontrada', 'error'); return; }

    var candidates = tpState.planData.filter(function(c) {
        if (c.desc === configDesc) return false;
        if (c.my === cfg.my) return false;
        return c.mod === cfg.mod && c.eng === cfg.eng && c.tx === cfg.tx &&
               c.reg === cfg.reg && c.rgn === cfg.rgn &&
               (c.tire || '') === (cfg.tire || '');
    });

    var existing = tpState.myContinuity[configDesc] || null;

    var html = '';
    html += '<div style="text-align:left;font-size:12px;max-width:560px;">';
    html += '<div style="background:rgba(132,204,22,0.08);border:1px solid rgba(132,204,22,0.25);border-radius:6px;padding:8px;margin-bottom:10px;">';
    html += '<div style="font-weight:700;color:var(--ok-text);margin-bottom:2px;">Config actual</div>';
    html += '<div style="font-family:monospace;font-size: var(--fs-sm);color:#374151;">' + cfg.desc + '</div>';
    html += '</div>';
    html += '<p style="color:#4b5563;font-size: var(--fs-sm);margin:6px 0 10px;">Marcar como "continuidad técnica" si el powertrain y las calibraciones de emisiones no cambiaron respecto al Model Year previo. La cobertura se hereda de la prueba anterior.</p>';

    if (candidates.length === 0) {
        html += '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px;color:#991b1b;font-size: var(--fs-sm);">No se encontraron configs equivalentes en otros Model Years (mismo powertrain+region+regulación+llanta).</div>';
        html += '</div>';
        showModal({ title: '↪ Continuidad entre Model Years', message: html, confirmText: 'Cerrar', showCancel: false, type: 'info' });
        return;
    }

    candidates.sort(function(a, b) { return String(a.my).localeCompare(String(b.my)); });

    html += '<label style="display:block;font-weight:700;margin-bottom:4px;">MY previo equivalente</label>';
    html += '<select id="_tp-cont-select" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size: var(--fs-sm);font-family:monospace;">';
    candidates.forEach(function(c) {
        var tested = tpState.testedList.filter(function(t) { return t.configText === c.desc; }).length;
        var mark = tested > 0 ? ' ✓' + tested : ' (sin pruebas)';
        var sel = existing && existing.prevConfigDesc === c.desc ? ' selected' : '';
        html += '<option value="' + c.desc.replace(/"/g, '&quot;') + '" data-my="' + (c.my || '') + '"' + sel + '>[' + (c.my || '?') + ']' + mark + ' — ' + c.desc + '</option>';
    });
    html += '</select>';
    html += '<label style="display:block;font-weight:700;margin-top:10px;margin-bottom:4px;">Nota (opcional)</label>';
    html += '<textarea id="_tp-cont-note" rows="2" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size: var(--fs-sm);" placeholder="Ej: Carry-over sin cambios de hardware ni calibración de emisiones">' + ((existing && existing.note) || '') + '</textarea>';
    if (existing) {
        html += '<div style="margin-top:8px;padding:6px 8px;background:#f3f4f6;border-radius:6px;font-size: var(--fs-xs);color:#6b7280;">Marcada previamente el ' + (existing.markedAt || '?') + (existing.markedBy ? ' por ' + existing.markedBy : '') + '</div>';
    }
    html += '</div>';

    showModal({
        title: '↪ Continuidad entre Model Years',
        message: html,
        confirmText: 'Guardar continuidad',
        cancelText: existing ? 'Cancelar' : 'Cerrar',
        type: 'info',
        onConfirm: function() {
            var sel = document.getElementById('_tp-cont-select');
            var note = document.getElementById('_tp-cont-note');
            if (!sel || !sel.value) return;
            var opt = sel.options[sel.selectedIndex];
            tpState.myContinuity[configDesc] = {
                prevConfigDesc: sel.value,
                prevMy: opt.getAttribute('data-my') || '',
                note: note ? note.value : '',
                markedAt: localToday(),
                markedBy: (typeof getCurrentUser === 'function' ? (getCurrentUser() || '') : '')
            };
            tpSave();
            _tpInvalidateCache();
            tpRender();
            showToast('Continuidad MY guardada', 'success');
        }
    });

    if (existing) {
        setTimeout(function() {
            var box = document.querySelector('.custom-modal-box');
            if (!box) return;
            var actions = box.querySelector('.custom-modal-actions');
            if (!actions || actions.querySelector('#_tp-cont-remove')) return;
            var rm = document.createElement('button');
            rm.id = '_tp-cont-remove';
            rm.className = 'modal-btn-cancel';
            rm.style.color = '#dc2626';
            rm.textContent = 'Quitar continuidad';
            rm.onclick = function() {
                delete tpState.myContinuity[configDesc];
                tpSave();
                _tpInvalidateCache();
                tpRender();
                showToast('Continuidad MY eliminada', 'success');
                var overlay = document.querySelector('.custom-modal-overlay');
                if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };
            actions.insertBefore(rm, actions.firstChild);
        }, 30);
    }
}

function tpOpenFamilyEvidence(famKey) {
    var families = tpBuildFamilies();
    var f = families.find(function(x) { return x.key === famKey; });
    if (!f) { showToast('Familia no encontrada', 'error'); return; }

    var rows = [];
    f.configs.forEach(function(c) {
        (c.vins || []).forEach(function(v) {
            var vin = _tpExtractVin(v.note || '');
            var vehicle = null;
            if (typeof db !== 'undefined' && db.vehicles && vin) {
                vehicle = db.vehicles.find(function(veh) { return veh.vin === vin; });
            }
            rows.push({
                vin: vin,
                date: v.date || '',
                operator: vehicle ? (vehicle.registeredBy || '') : '',
                purpose: vehicle ? (vehicle.purpose || '') : '',
                status: vehicle ? (vehicle.status || '') : '',
                vehicleId: vehicle ? vehicle.id : null,
                tire: c.tire || '',
                rep: c.isRepresentative ? 'REP' : ''
            });
        });
    });
    // v15.8: más recientes primero (fechas vacías al final)
    rows.sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });

    var html = '';
    html += '<div style="text-align:left;font-size:12px;max-width:720px;">';
    html += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px;margin-bottom:10px;">';
    html += '<div style="font-weight:700;color:#1e40af;">' + f.mod + ' · ' + f.eng + ' ' + f.tx + ' · ' + f.my + '</div>';
    html += '<div style="font-size: var(--fs-xs);color:#475569;">' + f.reg + ' · ' + f.rgn + (f.drv ? ' · ' + f.drv : '') + (f.body ? ' · ' + f.body : '') + '</div>';
    html += '<div style="font-size: var(--fs-xs);color:#475569;margin-top:2px;">' + f.totalTested + '/' + f.totalRequired + ' pruebas · ' + Math.round((f.coverage || 0) * 100) + '% cobertura directa</div>';
    html += '</div>';

    if (rows.length === 0) {
        html += '<div style="color:#6b7280;font-size: var(--fs-sm);padding:12px;text-align:center;">Sin VINs registrados en esta familia.</div>';
    } else {
        html += '<div style="max-height:340px;overflow:auto;border:1px solid #e5e7eb;border-radius:6px;">';
        html += '<table style="width:100%;font-size: var(--fs-xs);border-collapse:collapse;">';
        html += '<thead style="background:#f9fafb;position:sticky;top:0;"><tr>';
        ['VIN', 'Fecha', 'Operador', 'Propósito', 'Estado', 'Variante', ''].forEach(function(h) {
            html += '<th style="padding:5px 6px;text-align:left;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">' + h + '</th>';
        });
        html += '</tr></thead><tbody>';
        rows.forEach(function(r, idx) {
            var isLatest = idx === 0 && r.date;
            html += '<tr style="border-bottom:1px solid #f3f4f6;' + (isLatest ? 'background:#eff6ff;' : '') + '">';
            html += '<td style="padding:4px 6px;font-family:monospace;color:#1f2937;">' + (r.vin || '?') + (r.rep ? ' <span style="font-size: var(--fs-xs);color:#2563eb;font-weight:700;">REP</span>' : '') + '</td>';
            var dateCell = '—';
            if (r.date) {
                var _d = new Date(r.date + 'T12:00:00');
                var _days = Math.floor((Date.now() - _d.getTime()) / 86400000);
                dateCell = '<strong style="color:' + (isLatest ? '#1d4ed8' : '#1f2937') + ';">' + _d.toLocaleDateString('es-MX') + '</strong>' +
                           ' <span style="font-size: var(--fs-xs);color:#6b7280;">' + (_days === 0 ? 'hoy' : 'hace ' + _days + 'd') + '</span>' +
                           (isLatest ? ' <span style="font-size: var(--fs-xs);color:#1d4ed8;font-weight:700;">ÚLTIMA</span>' : '');
            }
            html += '<td style="padding:4px 6px;color:#4b5563;white-space:nowrap;" title="' + r.date + '">' + dateCell + '</td>';
            html += '<td style="padding:4px 6px;color:#4b5563;">' + (r.operator || '—') + '</td>';
            html += '<td style="padding:4px 6px;color:#4b5563;">' + (r.purpose || '—') + '</td>';
            html += '<td style="padding:4px 6px;color:#4b5563;">' + (r.status || '—') + '</td>';
            html += '<td style="padding:4px 6px;color:#475569;font-size: var(--fs-xs);">' + (r.tire || '—') + '</td>';
            if (r.vehicleId != null) {
                html += '<td style="padding:4px 6px;"><button onclick="tpGoToVehicle(' + r.vehicleId + ')" style="background:none;border:1px solid #bfdbfe;color:#1d4ed8;font-size: var(--fs-xs);padding:2px 6px;border-radius:4px;cursor:pointer;">Ver</button></td>';
            } else {
                html += '<td></td>';
            }
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;">';
        html += '<span style="font-size: var(--fs-xs);color:#6b7280;">Total: ' + rows.length + ' evidencias</span>';
        html += '<button onclick="tpExportFamilyEvidenceCSV(\'' + famKey.replace(/'/g, "\\'") + '\')" style="background:#e0e7ff;border:1px solid #a5b4fc;color:#3730a3;font-size: var(--fs-xs);padding:3px 8px;border-radius:4px;cursor:pointer;">Exportar CSV</button>';
        html += '</div>';
    }
    html += '</div>';

    showModal({
        title: '📋 Evidencia · Familia',
        message: html,
        confirmText: 'Cerrar',
        showCancel: false,
        type: 'info'
    });
}

function tpGoToVehicle(vehicleId) {
    if (typeof switchPlatform === 'function') switchPlatform('cop15');
    setTimeout(function() {
        var sel = document.getElementById('activeVehSelect');
        if (sel) {
            sel.value = vehicleId;
            if (typeof loadVehicle === 'function') loadVehicle();
        }
        var opTab = document.querySelector('[onclick*="switchTab(\'op-\'"]');
        var rel = document.querySelector('[onclick*="cop15-release"]');
        if (rel) try { rel.click(); } catch(e){}
    }, 120);
    var overlay = document.querySelector('.custom-modal-overlay');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

function tpExportFamilyEvidenceCSV(famKey) {
    var families = tpBuildFamilies();
    var f = families.find(function(x) { return x.key === famKey; });
    if (!f) return;
    var entries = [];
    f.configs.forEach(function(c) {
        (c.vins || []).forEach(function(v) {
            var vin = _tpExtractVin(v.note || '');
            var vehicle = null;
            if (typeof db !== 'undefined' && db.vehicles && vin) {
                vehicle = db.vehicles.find(function(veh) { return veh.vin === vin; });
            }
            entries.push({ date: v.date || '', cols: [
                vin,
                v.date || '',
                vehicle ? (vehicle.registeredBy || '') : '',
                vehicle ? (vehicle.purpose || '') : '',
                vehicle ? (vehicle.status || '') : '',
                c.tire || '',
                (vehicle && vehicle.configCode) || ''
            ]});
        });
    });
    // v15.8: mismo orden que la vista — más recientes primero
    entries.sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); });
    var lines = ['VIN,Fecha,Operador,Proposito,Estado,Variante,ConfigCode'];
    entries.forEach(function(e) {
        lines.push(e.cols.map(function(x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(','));
    });
    var csv = lines.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'evidencia_' + f.mod + '_' + f.eng.replace(/\s+/g, '') + '_' + f.my + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function tpRenderAuditReadinessCard() {
    var families = tpBuildFamilies();
    if (families.length === 0) return '';
    var direct = families.filter(function(f) { return f.auditCoverageKind === 'direct'; }).length;
    var partial = families.filter(function(f) { return f.auditCoverageKind === 'partial'; }).length;
    var equiv = families.filter(function(f) { return f.auditCoverageKind === 'equivalent'; }).length;
    var cont = families.filter(function(f) { return f.auditCoverageKind === 'continuity'; }).length;
    var none = families.filter(function(f) { return f.auditCoverageKind === 'none'; }).length;
    var total = families.length;

    var coveredFullOrMitigated = direct + equiv + cont;
    var effectivePct = total > 0 ? Math.round(((coveredFullOrMitigated + partial * 0.5) / total) * 100) : 0;

    var verdict, verdictColor, verdictIcon;
    if (none === 0 && partial === 0) { verdict = 'Listo para auditoría'; verdictColor = '#22c55e'; verdictIcon = '✅'; }
    else if (none === 0) { verdict = 'Listo con brechas parciales'; verdictColor = '#84cc16'; verdictIcon = '🟡'; }
    else if (none <= 3) { verdict = 'Atender ' + none + ' brecha' + (none === 1 ? '' : 's'); verdictColor = '#f59e0b'; verdictIcon = '⚠️'; }
    else { verdict = 'Requiere plan inmediato — ' + none + ' brechas críticas'; verdictColor = '#ef4444'; verdictIcon = '❌'; }

    var html = '';
    html += '<div class="tp-card" style="border-left:3px solid ' + verdictColor + ';margin-bottom:12px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">';
    html += '<div style="font-weight:800;font-size:13px;color:var(--tp-text);">🛡️ Preparación para auditoría</div>';
    html += '<div style="display:flex;align-items:center;gap:8px;">';
    html += '<span style="font-size:22px;font-weight:800;font-family:monospace;color:' + verdictColor + ';">' + effectivePct + '%</span>';
    html += '<span style="font-size: var(--fs-sm);font-weight:700;color:' + verdictColor + ';">' + verdictIcon + ' ' + verdict + '</span>';
    html += '</div>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:6px;margin-bottom:8px;">';
    html += '<div class="tp-metric" onclick="window._tpReadinessFilter=\'direct\';tpSwitchTab(\'tp-families\');tpRender();" style="cursor:pointer;"><div class="tp-metric-val" style="color:var(--tp-green)">' + direct + '</div><div class="tp-metric-label">Probadas</div></div>';
    html += '<div class="tp-metric" onclick="window._tpReadinessFilter=\'partial\';tpSwitchTab(\'tp-families\');tpRender();" style="cursor:pointer;"><div class="tp-metric-val" style="color:var(--tp-amber)">' + partial + '</div><div class="tp-metric-label">Parciales</div></div>';
    html += '<div class="tp-metric" onclick="window._tpReadinessFilter=\'equivalent\';tpSwitchTab(\'tp-families\');tpRender();" style="cursor:pointer;" title="Cubiertas por familia similar (body/drive/region)"><div class="tp-metric-val" style="color:#38bdf8">' + equiv + '</div><div class="tp-metric-label">Por similar</div></div>';
    html += '<div class="tp-metric" onclick="window._tpReadinessFilter=\'continuity\';tpSwitchTab(\'tp-families\');tpRender();" style="cursor:pointer;" title="Configs cubiertas por continuidad MY"><div class="tp-metric-val" style="color:#84cc16">' + cont + '</div><div class="tp-metric-label">Continuidad MY</div></div>';
    html += '<div class="tp-metric" onclick="window._tpReadinessFilter=\'none\';tpSwitchTab(\'tp-families\');tpRender();" style="cursor:pointer;"><div class="tp-metric-val" style="color:var(--tp-red)">' + none + '</div><div class="tp-metric-label">Sin cubrir</div></div>';
    html += '</div>';
    html += '<div class="tp-bar" style="height:10px;"><div class="tp-bar-fill" style="width:' + effectivePct + '%;background:' + verdictColor + ';"></div></div>';
    if (none > 0) {
        html += '<div style="margin-top:8px;font-size: var(--fs-xs);color:var(--tp-dim);">Las brechas sin cubrir son las que un auditor va a cuestionar primero. Considera marcar continuidad MY donde aplique o priorizar pruebas físicas en el plan semanal.</div>';
    }
    html += '</div>';
    return html;
}

function tpRenderCoverageHeatmap() {
    var families = tpBuildFamilies();
    if (families.length === 0) return '';

    var axisY = window._tpHeatmapY || 'eng_tx';
    var rowKeyFn = function(f) {
        if (axisY === 'eng') return f.eng;
        if (axisY === 'model') return f.mod;
        return f.eng + ' · ' + f.tx;
    };

    var cells = {};
    var rowSet = {};
    var colSet = {};
    families.forEach(function(f) {
        var r = rowKeyFn(f);
        var c = f.rgn + ' · ' + f.reg;
        rowSet[r] = true;
        colSet[c] = true;
        var k = r + '||' + c;
        if (!cells[k]) cells[k] = { families: [], kinds: {} };
        cells[k].families.push(f);
        cells[k].kinds[f.auditCoverageKind] = (cells[k].kinds[f.auditCoverageKind] || 0) + 1;
    });

    var rows = Object.keys(rowSet).sort();
    var cols = Object.keys(colSet).sort();

    function cellColor(cell) {
        if (!cell) return 'transparent';
        var k = cell.kinds;
        if (k.none) return 'rgba(239,68,68,0.85)';
        if (k.partial) return 'rgba(245,158,11,0.85)';
        if (k.equivalent && !k.direct && !k.continuity) return 'rgba(56,189,248,0.80)';
        if (k.continuity && !k.direct) return 'rgba(132,204,22,0.80)';
        if (k.direct) return 'rgba(34,197,94,0.85)';
        return 'rgba(148,163,184,0.3)';
    }
    function cellLabel(cell) {
        if (!cell) return '';
        var k = cell.kinds;
        var n = cell.families.length;
        if (k.none) return k.none + '/' + n;
        return n;
    }

    var html = '';
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">';
    html += '<span>🧭 Matriz de cobertura</span>';
    html += '<select class="tp-select" style="font-size: var(--fs-xs);" onchange="window._tpHeatmapY=this.value;tpRender();">';
    html += '<option value="eng_tx"' + (axisY === 'eng_tx' ? ' selected' : '') + '>Engine + Transmisión</option>';
    html += '<option value="eng"' + (axisY === 'eng' ? ' selected' : '') + '>Engine</option>';
    html += '<option value="model"' + (axisY === 'model' ? ' selected' : '') + '>Modelo</option>';
    html += '</select>';
    html += '</div>';
    html += '<div style="overflow-x:auto;">';
    html += '<table class="tp-heatmap" style="border-collapse:collapse;font-size: var(--fs-xs);min-width:100%;">';
    html += '<thead><tr><th style="padding:4px 6px;text-align:left;color:var(--tp-dim);font-weight:600;position:sticky;left:0;background:var(--tp-card);z-index:2;">' + (axisY === 'model' ? 'Modelo' : axisY === 'eng' ? 'Engine' : 'Engine+Tx') + '</th>';
    cols.forEach(function(c) {
        html += '<th style="padding:4px 6px;text-align:center;color:var(--tp-dim);font-weight:600;font-size: var(--fs-xs);white-space:nowrap;">' + c + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function(r) {
        html += '<tr>';
        html += '<td style="padding:4px 6px;color:var(--tp-text);font-weight:600;white-space:nowrap;position:sticky;left:0;background:var(--tp-card);z-index:1;">' + r + '</td>';
        cols.forEach(function(c) {
            var cell = cells[r + '||' + c];
            var color = cellColor(cell);
            var label = cellLabel(cell);
            var tip = '';
            if (cell) {
                var bits = [];
                ['direct','partial','equivalent','continuity','none'].forEach(function(kk) {
                    if (cell.kinds[kk]) bits.push(kk + ':' + cell.kinds[kk]);
                });
                tip = r + ' / ' + c + ' · ' + bits.join(' · ');
            }
            var clickAttr = cell ? 'onclick="window._tpFamRegion=\'' + (cell.families[0].rgn || 'ALL') + '\';tpSwitchTab(\'tp-families\');tpRender();" style="cursor:pointer;"' : '';
            html += '<td class="tp-heatmap-cell" ' + clickAttr + ' title="' + tip + '" style="padding:0;">';
            html += '<div style="width:38px;height:30px;margin:2px;border-radius:4px;background:' + color + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size: var(--fs-xs);">' + label + '</div>';
            html += '</td>';
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;font-size: var(--fs-xs);color:var(--tp-dim);">';
    html += '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(34,197,94,0.85);border-radius:2px;vertical-align:middle;"></span> Probada</span>';
    html += '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(132,204,22,0.80);border-radius:2px;vertical-align:middle;"></span> Continuidad MY</span>';
    html += '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(56,189,248,0.80);border-radius:2px;vertical-align:middle;"></span> Por similar</span>';
    html += '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(245,158,11,0.85);border-radius:2px;vertical-align:middle;"></span> Parcial</span>';
    html += '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(239,68,68,0.85);border-radius:2px;vertical-align:middle;"></span> Sin cubrir</span>';
    html += '<span style="color:var(--tp-dim);">Click en celda para filtrar familias</span>';
    html += '</div>';
    html += '</div>';
    return html;
}



// ══════════════════════════════════════════════════════════════════════
// v16.0 — Banners de ayuda de las pestañas de Test Plan (HELP_TABS vive en
// app.js, que carga primero, así que ya existe cuando se ejecuta esta línea).
// ══════════════════════════════════════════════════════════════════════
if (typeof HELP_TABS !== 'undefined') Object.assign(HELP_TABS, {
    'tp-dashboard': {
        title: 'Plan — resumen',
        text: 'Cobertura del plan de producción: cuántas pruebas exige el año, cuántas van y el presupuesto anual. Rojo = configuraciones críticas sin probar.',
        tips: [
            'Si no ves datos, ve primero a 🏭 Producción para importar el CSV del plan.',
            'La tarjeta "Presupuesto Anual" te dice si la capacidad del laboratorio alcanza para lo que falta del año.',
            'Toca cualquier barra o segmento de las gráficas para filtrar la tabla de configuraciones.'
        ]
    },
    'tp-myweek': {
        title: 'Mi semana',
        text: 'El tablero de lo que toca correr: una columna por día laborable. Cada prueba vive una sola vez, en su columna de PRUEBA — el preacondicionamiento se ve en el medidor del encabezado y en la tira de días de la tarjeta.',
        tips: [
            'La columna de HOY va resaltada. ◀ ▶ mueven de semana; "Ir a hoy" regresa.',
            'La tira de colores de cada tarjeta es su recorrido real: P = preacondicionamiento, · = reposo, T = prueba. Un soak de 36 h ocupa más días, y se ve.',
            '"↪ Mover" ofrece solo los días donde el reposo SÍ cabe; los imposibles salen deshabilitados con el motivo escrito.',
            'Marcar ✅ a mano deja un registro permanente marcado como "declarada" — sobrevive aunque borres el plan, pero nunca se disfraza de liberación real.',
            'El semáforo (⚠️ / 🔴) es un aviso interno anticipado, no un juicio: dice qué mirar hoy, no qué va a fallar.',
            'El ＋ de cada día agrega configuraciones, incluidas las que YA están en la semana: dos vehículos idénticos son un caso normal y ahora se pueden planear (se numeran "1 de 2" y "2 de 2").',
            '🔗 Vincular acredita una fila con una prueba real por VIN cuando el automático no la empató. Deja evidencia; palomear a mano solo declara.'
        ]
    },
    'tp-weekly': {
        title: 'Armar semana',
        text: 'Todo en una pantalla: arriba el enfoque (Europa / USA / todo), a la izquierda CÓMO se elige (ponderación, cola de pendientes y filtros) y a la derecha, siempre visible, QUÉ se propondría. "Generar y abrir Mi semana" te deja en el tablero, no en el formulario.',
        tips: [
            'La propuesta de la derecha es exactamente lo que creará "🚀 Generar" — se actualiza al mover cualquier control.',
            'La cola de pendientes tiene un tope (50% por defecto): el resto de los lugares queda reservado para las prioridades de hoy.',
            'Si cambiaron las prioridades, baja la caducidad de la cola o apágala — lo viejo deja de proponerse sin tocar el déficit ni la cobertura.',
            'Filtra por body type o regulación para dedicar la semana a un solo tipo de vehículo.',
            '📌 fija una prueba (entra siempre) y 🚫 la saca solo de esta semana.'
        ]
    },
    'tp-recovery': {
        title: 'Recuperación',
        text: 'Clasifica TODO lo pendiente por prioridad (P1 Europa COP → P5 EV), reparte en las semanas disponibles y avisa qué no alcanza. Marca semanas no disponibles y define "planear hasta".',
        tips: [
            'Marca como "no disponible" las semanas con paro/mantenimiento para que el reparto no cuente con esa capacidad.',
            'El indicador de riesgo de fecha límite (deadline) te avisa si algo urgente no va a alcanzar a tiempo con la capacidad actual.',
            'Puedes materializar el resultado directamente en planes semanales reales desde aquí.'
        ]
    },
    'tp-production': {
        title: 'Producción',
        text: 'Importa aquí el CSV del plan de producción (se FUSIONA con lo anterior, no lo borra). De estos volúmenes salen las pruebas requeridas.',
        tips: [
            'El import es acumulativo: puedes volver a importar un CSV actualizado sin perder los meses ya cargados.',
            'Cada fila del CSV se agrupa en una "configuración" según Modelo, Motor, Transmisión, Regulación, etc.'
        ]
    },
    'tp-tested': {
        title: 'Probados',
        text: 'Registro manual de pruebas ya realizadas que no pasaron por el flujo normal de la plataforma (por ejemplo, capturadas antes de usar el sistema).',
        tips: ['Úsalo solo para poner al día el histórico — las pruebas nuevas deben registrarse desde Pruebas → Alta.']
    },
    'tp-families': {
        title: 'Familias',
        text: 'Agrupación por familia de emisiones: cobertura, evidencia de VINes (📋) y hace cuánto no se prueba cada familia (⏱).',
        tips: [
            'Una familia agrupa configuraciones con el mismo Modelo, Motor, Transmisión, Año y Regulación — se consideran equivalentes para efectos de prueba.',
            'El botón 📋 muestra los VINes probados de esa familia, ordenados del más reciente al más antiguo.',
            'El badge ⏱ se pone en rojo si la familia lleva más de 90 días sin probarse.'
        ]
    },
    'tp-planactual': {
        title: 'Plan actual',
        text: 'Vista consolidada del plan vigente: qué se ha decidido probar y en qué orden.'
    },
    'tp-planhistory': {
        title: 'Historial de planes',
        text: 'Planes semanales anteriores, para consultar qué se planeó y qué tanto se cumplió en semanas pasadas.'
    },
    'tp-rules': {
        title: 'Reglas',
        text: 'Cuántas pruebas por cada 1000 unidades según región/regulación, pesos de priorización y el propósito precargado por región (COP solo Europa).',
        tips: [
            'Las reglas más específicas (región + regulación exacta) tienen prioridad sobre las genéricas (*).',
            'Los pesos de priorización deben sumar 100 — el sistema te avisa si no cuadran.',
            'El propósito por región define qué se precarga en Alta al iniciar una prueba desde el plan (editable aquí).'
        ]
    },
    'tp-simulator': {
        title: 'Simulador',
        text: '"¿Qué pasa si corro N pruebas/semana?" — proyecta cuándo llegas a 100% de cobertura con distintas capacidades. Útil para pedir recursos.',
        tips: ['Compara varios escenarios de capacidad (4, 8, 12, 20 pruebas/semana) para justificar una solicitud de más turnos o dinamómetros.']
    },
    'tp-calendar': {
        title: 'Calendario',
        text: 'Las pruebas planificadas y ejecutadas por día del mes, en un vistazo mensual.'
    },
    'tp-weekhistory': {
        title: 'Historial semanal',
        text: 'Bitácora de los planes semanales generados y aceptados, semana por semana.'
    }
});

// v16.0 — Tooltips de campo/control para Test Plan (registro global CASCADE_TOOLTIPS,
// definido en cop15.js que carga antes que este archivo).
if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'tp-weekly-date': { title: 'Semana del', text: 'Lunes de la semana para la que vas a generar el plan. Por default toma el próximo lunes.' },
    'tp-weekly-cap': { title: 'Capacidad', text: 'Cuántas pruebas vas a planear esta semana. No puede pasar del máximo físico (pares preacon→prueba × vehículos por par); bájala si hay festivos o mantenimiento.' },
    'tp-veh-per-slot': { title: 'Vehículos por par', text: 'Cuántos vehículos puedes preacondicionar y probar en el MISMO par de días (lun→mar, mar→mie, …). Depende de cuántas celdas o áreas de soak tiene el laboratorio. La capacidad máxima de la semana es pares × este número. Se comparte con todos los dispositivos.' },
    'tpBacklog': { title: 'Pendientes de semanas anteriores', text: 'Configuraciones que ya se planearon antes y siguen sin probarse. Cada semana que pasa suben de prioridad para que no se queden al fondo. Solo entra a la semana lo que cabe en la capacidad — el resto se queda en la cola. "✕" la saca de la cola pero NO cuenta como probada: el déficit y la cobertura no cambian, y puedes restaurarla desde "Descartadas".' },
    'tp-ratio-help': { title: 'Reglas de Ratio', text: 'Define cuántas pruebas exige cada configuración por cada 1000 unidades producidas, según región y regulación. Las reglas más específicas (región+regulación exacta) ganan sobre las genéricas ("Todas"). Esto es lo que alimenta el déficit y el plan.' },
    'tp-weights-help': { title: 'Ponderación', text: 'Qué tanto pesa cada factor (déficit, volumen, región, config nueva, urgencia) al ordenar los candidatos. Deben sumar 100 — el sistema te avisa si no cuadran. Al moverlos, la propuesta de la derecha se reordena al instante.' },
    'tp-aging-help': { title: 'Empuje por antigüedad', text: 'Puntos que gana una configuración por cada semana que lleva postergada, para que la cola no se estanque. El tope evita que lo viejo le gane siempre a lo urgente. En 0, la antigüedad deja de influir por completo.' },
    'tp-carryover-help': { title: 'Cola de pendientes', text: 'Lo que quedó sin hacer en semanas anteriores. "Caducan" descarta lo que lleva demasiado tiempo arrastrándose (útil cuando cambian las prioridades) y "Máximo de la semana" limita cuántos lugares puede ocupar la cola, para que siempre quede espacio a lo actual. Ni caducar ni descartar cuentan como probado: el déficit y la cobertura no cambian.' },
    'tp-weekfilter-help': { title: 'Filtros de la semana', text: 'Restringe la propuesta a un subconjunto — por ejemplo solo body type 5DR y regulación EURO-6C — para dedicar la semana a ese tipo de vehículo. Los selectores se van estrechando entre sí, como la cascada del Alta. Las pruebas que fijaste a mano entran aunque no cumplan el filtro (se avisa).' },
    'tp-preview-help': { title: 'Propuesta en vivo', text: 'Lo que crearía "Generar" en este momento, con el día de preacondicionamiento y prueba de cada vehículo, su puntaje y de dónde salió (obligatoria, cola o déficit). Cambia solo al mover cualquier control de la izquierda.' },
    'tp-region-priority-help': { title: 'Prioridad por Región', text: 'Qué tan importante es cada mercado (0-100) al calcular la urgencia de una configuración. Europa suele ir más alto por fechas de arranque de producción (SOP).' },
    'tp-purpose-region-help': { title: 'Propósito por región', text: 'Qué propósito se precarga automáticamente en Alta cuando inicias una prueba desde el plan, según la región de la configuración (regla: COP solo para Europa; el resto son auditorías internas). El técnico siempre puede cambiarlo manualmente en Alta.' },
    'tp-csvimport-help': { title: 'Importar Plan de Producción', text: 'El CSV se FUSIONA con lo que ya tenías cargado — no borra meses anteriores, solo agrega o actualiza los que vengan en el archivo nuevo. Columnas esperadas: codigo_config, Modelo, Motor, Regulación, Región, etc. y una columna por mes (ej. Feb-26).' },
    'tp-availability-help': { title: 'Disponibilidad por semana', text: 'Marca "No disponible" las semanas de mantenimiento/paro del dinamómetro (no cuentan capacidad). "Cap" = número de pruebas que caben esa semana; "días" = cuántos días de la semana asistes. La capacidad real es pruebas/semana, no pruebas/día — puedes correr más de una por día.' },
    'tp-priority-help': { title: 'Reglas de Prioridad', text: 'Se evalúan de arriba a abajo — la PRIMERA regla que coincide asigna la prioridad (P1 = más urgente). Cada columna es un filtro que se va acotando en cascada; "Todas" es comodín. "Niveles" define cuántas prioridades (P1..P10) existen.' },
    'tp-req-help': { title: 'Pruebas requeridas (Req.)', text: 'Se calcula así: (Vol.Plan + Hist) × ratio / por, según la regla de Reglas → Ratio que coincida con la región y regulación de esta configuración. Toca el número de cualquier fila para ver la fórmula exacta y qué regla se usó. Un punto ámbar ● significa que no hay regla específica para esa región/regulación — se usó una regla comodín.' },
    'tp-focus-help': { title: 'Enfoque de la semana', text: 'Un toque reordena la propuesta hacia un mercado. IMPORTANTE: sube el peso de "Importancia de región" y reparte el resto proporcionalmente — si ese peso está en 0, las prioridades por región no influyen en nada y los chips serían decorativos. "⚙️ A medida" abre las perillas de siempre con la sección de regiones desplegada.' },
    'tp_week_add': { title: 'Agregar una prueba', text: 'El ＋ de cada día agrega una configuración a ese día. Puedes agregar una que YA esté en la semana: son dos vehículos distintos de la misma configuración, que es un caso normal del laboratorio. El menú ⋯ de una tarjeta tiene el atajo "⧉ Otra unidad igual".' },
    'tp_week_link': { title: 'Vincular con una prueba', text: 'Cuando la liberación no acreditó la fila sola (el vehículo se registró por fuera del plan, o son dos idénticos y hay que decir cuál es cuál), aquí eliges la prueba real por VIN. Vincular NO es lo mismo que palomear a mano: palomear declara sin respaldo, vincular deja el VIN. Si el vehículo es de otra configuración, queda registrado como sustitución con sus diferencias.' },
    'tp_week_subst': { title: 'Alcance de la sustitución', text: '🎯 Misma familia es la sustitución equivalente: solo cambia rin, carrocería, tracción o paquete. 📋 Misma región y norma puede cambiar hasta el motor — sirve para cubrir la norma, no para sustituir esa familia. 🌍 Misma región solo comparte el mercado. Las que se alejan del núcleo salen marcadas ⚠️ y el nivel queda grabado en el registro.' },
    'tp_week_kpis': { title: 'La semana de un vistazo', text: 'Planeadas / hechas / en curso / movidas / en riesgo. "Hechas" incluye las declaradas a mano (pasa el cursor para ver cuántas). "Movidas" son las que cambiaron de día respecto al plan original — no es un error, es el registro de que la semana se reacomodó. "En riesgo" es un aviso interno anticipado, no un juicio.' },
    'tp-dormant-help': { title: 'Configuración inactiva', text: 'Lleva 3 o más meses seguidos sin volumen planeado. Puedes marcarla "Pausada" (deja de exigir pruebas y de contar en cobertura) o confirmar que sigue vigente.' }
});
