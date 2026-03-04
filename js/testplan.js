// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Test Plan Manager Module                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ======================================================================
// WEEKLY PLAN HELPERS
// ======================================================================
function tpAddManualPick() {
    const sel = document.getElementById('tp-manual-pick-select');
    if (!sel || !sel.value) return;
    window._tpWeeklyManualPicks = window._tpWeeklyManualPicks || [];
    if (!window._tpWeeklyManualPicks.includes(sel.value)) window._tpWeeklyManualPicks.push(sel.value);
    sel.value = '';
    tpRender();
}
function tpRemoveWeeklyItem(wk, idx) {
    if (!confirm('¿Quitar del plan?')) return;
    tpState.weeklyPlans[wk].items.splice(idx, 1);
    tpSave(); tpRender();
}
function tpAddToWeek(wk) {
    const sel = document.getElementById('tp-edit-add-' + wk);
    if (!sel || !sel.value) return;
    const cfg = tpState.planData.find(c => c.desc === sel.value);
    if (!cfg) return;
    const rule = tpGetRule(cfg);
    const n = tpState.testedList.filter(t => t.configText === cfg.desc).length;
    const req = tpCalcRequired(cfg, rule);
    tpState.weeklyPlans[wk].items.push({ desc:cfg.desc, id:cfg.id, mod:cfg.mod, rgn:cfg.rgn, reg:cfg.reg, eng:cfg.eng, tx:cfg.tx, my:cfg.my, drv:cfg.drv, body:cfg.body, ep:cfg.ep, engpkg:cfg.engpkg, tire:cfg.tire, required:req, deficit:Math.max(0,req-n), score:tpPriorityScore(cfg,n), completed:false, completedDate:null, manual:true });
    tpSave(); tpRender();
}

// ======================================================================
// EXPORT WEEKLY PLAN (Share/Clipboard)
// ======================================================================
function tpExportWeeklyPlan(wk) {
    const plan = tpState.weeklyPlans[wk];
    if (!plan) return;
    const dt = new Date(plan.created).toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'});
    const done = plan.items.filter(i=>i.completed).length;
    let t = `PLAN SEMANAL #${wk+1}\n${dt}\n${done}/${plan.items.length} completadas\n${'─'.repeat(28)}\n\n`;
    plan.items.forEach((item, i) => {
        t += `${item.completed?'[X]':'[ ]'} ${i+1}. ${item.desc}\n    ${item.rgn||'?'} | ${item.reg||'?'}${item.manual?' (obligatoria)':''}\n\n`;
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
    if (plans.length === 0) { el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">No hay planes generados.</div>'; return; }
    const wData = plans.map((w,i) => {
        const t = w.items.length, d = w.items.filter(x=>x.completed).length;
        return { week:i+1, total:t, done:d, pct:t>0?Math.round(d/t*100):0, created:w.created, accepted:w.accepted };
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
        <div class="tp-card-title"><span style="color:var(--tp-red);font-size:11px;">🔄 Carry-over (${carry.length} pendientes)</span>
        <button class="tp-btn tp-btn-primary" onclick="tpCarryOver()" style="font-size:9px;">Agregar al próximo</button></div>
        ${carry.map(c=>`<div style="padding:2px 6px;font-size:8px;color:var(--tp-amber);border:1px solid var(--tp-border);border-radius:3px;margin-bottom:2px;">${c.desc}</div>`).join('')}
    </div>`:''}
    <div class="tp-card">
        <div class="tp-card-title"><span>Cumplimiento</span></div>
        <div style="display:flex;align-items:flex-end;gap:3px;height:100px;padding:8px 0;">
            ${wData.map(w=>`
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;">
                <span style="font-size:7px;font-weight:700;color:${w.pct===100?'var(--tp-green)':w.pct>=50?'var(--tp-amber)':'var(--tp-red)'};">${w.pct}%</span>
                <div style="width:100%;max-width:35px;background:var(--tp-border);border-radius:3px;height:65px;position:relative;overflow:hidden;">
                    <div style="position:absolute;bottom:0;width:100%;height:${w.pct}%;background:${w.pct===100?'var(--tp-green)':w.pct>=50?'var(--tp-amber)':'var(--tp-red)'};border-radius:3px;"></div>
                </div>
                <span style="font-size:7px;color:var(--tp-dim);">S${w.week}</span>
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
                <td style="font-size:9px;">${new Date(w.created).toLocaleDateString('es-MX',{day:'numeric',month:'short'})}</td>
                <td>${w.total}</td>
                <td style="font-weight:700;color:${w.done===w.total?'var(--tp-green)':'var(--tp-red)'};">${w.done}</td>
                <td><div class="tp-bar" style="width:40px;"><div class="tp-bar-fill" style="width:${w.pct}%;background:${w.pct===100?'var(--tp-green)':'var(--tp-amber)'}"></div><span class="tp-bar-text" style="font-size:7px;">${w.pct}%</span></div></td>
                <td><button class="tp-btn tp-btn-ghost" onclick="tpExportWeeklyPlan(${w.week-1})" style="font-size:8px;">📤</button></td>
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
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);font-size:11px;">Sin historial previo.</div>';
    } else {
        html += '<table class="tp-table" style="width:100%;"><thead><tr><th>Fecha</th><th>Configs</th><th>Vol Total</th></tr></thead><tbody>';
        history.forEach(function(h) {
            html += '<tr><td style="font-size:10px;">' + new Date(h.date).toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'}) + '</td><td>' + h.configCount + '</td><td>' + h.totalVol.toLocaleString() + '</td></tr>';
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
        html += '<div class="tp-metric"><div class="tp-metric-val" style="color:#10b981">' + diff.volUp.length + '</div><div class="tp-metric-label">Vol +</div></div>';
        html += '<div class="tp-metric"><div class="tp-metric-val" style="color:#ef4444">' + diff.volDown.length + '</div><div class="tp-metric-label">Vol -</div></div>';
        html += '</div>';

        if (diff.volUp.length > 0) {
            html += '<div style="margin-bottom:6px;"><div style="font-size:10px;font-weight:700;color:#10b981;margin-bottom:3px;">\u{1F4C8} Subieron volumen</div>';
            diff.volUp.slice(0,20).forEach(function(d) {
                html += '<div style="display:flex;justify-content:space-between;padding:3px 6px;font-size:9px;border:1px solid rgba(16,185,129,0.2);border-radius:4px;margin-bottom:2px;background:rgba(16,185,129,0.05);">';
                html += '<span style="color:var(--tp-amber);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">' + d.desc + '</span>';
                html += '<span><span style="color:var(--tp-dim);">' + d.oldVol.toLocaleString() + '</span> \u2192 <span style="color:#10b981;font-weight:700;">' + d.newVol.toLocaleString() + '</span></span></div>';
            });
            html += '</div>';
        }

        if (diff.volDown.length > 0) {
            html += '<div style="margin-bottom:6px;"><div style="font-size:10px;font-weight:700;color:#ef4444;margin-bottom:3px;">\u{1F4C9} Bajaron volumen</div>';
            diff.volDown.slice(0,20).forEach(function(d) {
                html += '<div style="display:flex;justify-content:space-between;padding:3px 6px;font-size:9px;border:1px solid rgba(239,68,68,0.2);border-radius:4px;margin-bottom:2px;background:rgba(239,68,68,0.05);">';
                html += '<span style="color:var(--tp-amber);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">' + d.desc + '</span>';
                html += '<span><span style="color:var(--tp-dim);">' + d.oldVol.toLocaleString() + '</span> \u2192 <span style="color:#ef4444;font-weight:700;">' + d.newVol.toLocaleString() + '</span></span></div>';
            });
            html += '</div>';
        }

        if (diff.added.length > 0) {
            html += '<div style="margin-bottom:6px;"><div style="font-size:10px;font-weight:700;color:var(--tp-green);margin-bottom:3px;">\u{1F195} Nuevas</div>';
            diff.added.slice(0,15).forEach(function(c) {
                html += '<div style="padding:2px 6px;font-size:8px;color:var(--tp-green);border:1px solid rgba(16,185,129,0.2);border-radius:3px;margin-bottom:2px;">' + c.desc + ' \u2014 ' + c.total.toLocaleString() + ' uds</div>';
            });
            if (diff.added.length > 15) html += '<div style="font-size:8px;color:var(--tp-dim);">... y ' + (diff.added.length-15) + ' mas</div>';
            html += '</div>';
        }

        if (diff.removed.length > 0) {
            html += '<div><div style="font-size:10px;font-weight:700;color:var(--tp-red);margin-bottom:3px;">\u{1F5D1} Retiradas (conservadas vol=0)</div>';
            diff.removed.slice(0,15).forEach(function(c) {
                html += '<div style="padding:2px 6px;font-size:8px;color:var(--tp-red);opacity:0.7;border:1px solid rgba(239,68,68,0.2);border-radius:3px;margin-bottom:2px;">' + c.desc + '</div>';
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
const TP_MONTHS = ['Feb-26','Mar-26','Apr-26','May-26','Jun-26','Jul-26'];
const TP_LS_KEY = 'kia_testplan_v1';

let tpState = JSON.parse(localStorage.getItem(TP_LS_KEY)) || {
    planData: [],        // production plan configs
    testedList: [],
    weeklyPlans: [],
    planHistory: [],
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
    weights: { volume:40, compliance:30, newConfig:20, urgency:10 },
    fixedPlan: null,     // {date, plan[]}
    fixedWeeklyPlan: null, // {fixedDate, capacity, numWeeks, weeks[{week, items[{desc,completed,...}]}]}
    capacity: 8,
    weeks: 4,
    activeTab: 'tp-dashboard',
    planImportDate: null,
};

function tpSave() { localStorage.setItem(TP_LS_KEY, JSON.stringify(tpState)); }

// ── Data helpers ──
function tpGetRule(cfg) {
    const r = tpState.rules;
    return r.find(x => x.region === cfg.rgn && x.regulation === cfg.reg)
        || r.find(x => x.region === cfg.rgn && x.regulation === '*')
        || r.find(x => x.region === '*')
        || {ratio:1,per:1000};
}

function tpCalcRequired(cfg, rule) {
    const vol = cfg.total + cfg.hist;
    return Math.max(1, Math.ceil((vol * rule.ratio) / rule.per));
}

function tpPriorityScore(cfg, testedN) {
    const rule = tpGetRule(cfg);
    const req = tpCalcRequired(cfg, rule);
    const w = tpState.weights;
    const maxVol = Math.max(...tpState.planData.map(c => c.total + c.hist), 1);
    const volScore = ((cfg.total + cfg.hist) / maxVol) * 100;
    const compScore = req > 0 ? (1 - Math.min(testedN / req, 1)) * 100 : 0;
    const newScore = cfg.hist === 0 && cfg.total > 0 ? 100 : 0;
    const firstM = cfg.m.findIndex(v => v > 0);
    const urgScore = firstM === -1 ? 0 : ((6 - firstM) / 6) * 100;
    return (volScore * w.volume + compScore * w.compliance + newScore * w.newConfig + urgScore * w.urgency) / 100;
}

// Cache for tpGetAnalysis — invalidated on plan/tested changes
var _tpAnalysisCache = { key: '', data: null };

function tpGetAnalysis() {
    var cacheKey = tpState.planData.length + ':' + tpState.testedList.length + ':' + (tpState.testedList.length > 0 ? tpState.testedList[tpState.testedList.length-1].date : '');
    if (_tpAnalysisCache.key === cacheKey && _tpAnalysisCache.data) return _tpAnalysisCache.data;

    var result = tpState.planData.map(cfg => {
        const rule = tpGetRule(cfg);
        const n = tpState.testedList.filter(t => t.configText === cfg.desc).length;
        const req = tpCalcRequired(cfg, rule);
        const comp = req > 0 ? Math.min(n / req, 1) : 1;
        const st = comp >= 1 ? 'ok' : comp >= 0.5 ? 'warn' : 'crit';
        const sc = tpPriorityScore(cfg, n);
        return { ...cfg, testedN: n, required: req, deficit: Math.max(0, req - n), compliance: comp, status: st, score: sc };
    }).sort((a, b) => b.score - a.score);

    _tpAnalysisCache = { key: cacheKey, data: result };
    return result;
}

function tpInvalidateCache() { _tpAnalysisCache = { key: '', data: null }; }

// ── Init: load plan from embedded CSV data ──
function tpInit() {
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
function tpAutoFeedFromRelease(vehicle) {
    if (!vehicle || !vehicle.configCode) return;
    if (!TP_PURPOSES_VALID.includes(vehicle.purpose)) return;

    const entry = {
        configText: vehicle.configCode,
        date: new Date().toISOString().slice(0,10),
        note: `VIN: ${vehicle.vin} — Auto desde COP15`,
        source: 'cop15-release',
        purpose: vehicle.purpose,
    };
    tpState.testedList.push(entry);
    tpSave();
    tpUpdateBadges();
    console.log('TP: Auto-feed from COP15 release:', vehicle.configCode);
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
    const monthCols = TP_MONTHS.map(m => header.indexOf(m));
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
            reg: cols[idxReg] || '',
            drv: cols[idxDrv] || '',
            eng: cols[idxEng] || '',
            tire: cols[idxTire] || '',
            rgn: cols[idxRgn] || '',
            body: cols[idxBody] || '',
            engpkg: cols[idxEngPkg] || '',
            hist: parseInt(cols[idxHist]) || 0,
            m: monthCols.map(ci => parseInt(cols[ci]) || 0),
            total: parseInt(cols[idxTotalCalc]) || 0,
        });
    }

    // ── Compare with existing plan ──
    const oldData = tpState.planData || [];
    const diff = { added:[], removed:[], volUp:[], volDown:[], unchanged:0 };
    const oldMap = {};
    oldData.forEach(c => { oldMap[c.desc] = c; });
    const newMap = {};
    newData.forEach(c => { newMap[c.desc] = c; });

    newData.forEach(c => {
        const old = oldMap[c.desc];
        if (!old) { diff.added.push(c); }
        else if (c.total !== old.total) {
            if (c.total > old.total) diff.volUp.push({ desc:c.desc, oldVol:old.total, newVol:c.total });
            else diff.volDown.push({ desc:c.desc, oldVol:old.total, newVol:c.total });
        } else { diff.unchanged++; }
    });
    // Configs removed from new plan: keep them with vol=0 so history is preserved
    oldData.forEach(c => {
        if (!newMap[c.desc]) {
            diff.removed.push(c);
            newData.push({ ...c, total: 0, m: c.m.map(() => 0), _retired: true });
        }
    });

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
    tpSave();

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
    document.getElementById('tp-configs-badge').textContent = n + ' configs';
    document.getElementById('tp-tested-badge').textContent = t + ' probadas';
    document.getElementById('tp-rules-badge').textContent = r + ' reglas';

    // Coverage badge on platform bar
    if (n > 0) {
        const analysis = tpGetAnalysis();
        const ok = analysis.filter(a => a.status === 'ok').length;
        const pct = Math.round((ok / n) * 100);
        document.getElementById('tp-coverage-badge').textContent = pct + '% cobertura';
    }

    // COP15 badge
    const active = db.vehicles ? db.vehicles.filter(v => v.status !== 'archived').length : 0;
    document.getElementById('cop15-count-badge').textContent = active + ' activos';
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M17] TEST PLAN MANAGER — RENDERER                                ║
// ╚══════════════════════════════════════════════════════════════════════╝

function tpSwitchTab(tabId) {
    tpState.activeTab = tabId;
    document.querySelectorAll('#tp-tabs-bar .tp-tab').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    tpRender();
}

function tpRender() {
    const el = document.getElementById('tp-content');
    if (!el) return;
    const tab = tpState.activeTab;
    if (tab === 'tp-dashboard') tpRenderDashboard(el);
    else if (tab === 'tp-tested') tpRenderTested(el);
    else if (tab === 'tp-families') tpRenderFamilies(el);
    else if (tab === 'tp-planactual') tpRenderPlanActual(el);
    else if (tab === 'tp-planhistory') tpRenderPlanHistory(el);
    else if (tab === 'tp-rules') tpRenderRules(el);
    else if (tab === 'tp-weekly') tpRenderWeekly(el);
    else if (tab === 'tp-simulator') tpRenderSimulator(el);
    else if (tab === 'tp-production') tpRenderProduction(el);
    else if (tab === 'tp-calendar') tpRenderCalendar(el);
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
    var sz = opts.fontSize || '7px';
    // For legacy items missing fields, try to resolve from planData
    var c = item;
    if (!c.my && c.desc && tpState.planData.length > 0) {
        var found = tpState.planData.find(function(p) { return p.desc === c.desc; });
        if (found) c = Object.assign({}, found, item);
    }
    var h = '';
    if (c.mod) h += '<span class="tp-badge" style="background:rgba(59,130,246,0.2);color:#3b82f6;font-size:'+sz+';font-weight:800;">'+c.mod+'</span>';
    if (c.body) h += '<span class="tp-badge" style="background:rgba(148,163,184,0.15);color:#94a3b8;font-size:'+sz+';">'+c.body+'</span>';
    if (c.eng) h += '<span class="tp-badge" style="background:rgba(16,185,129,0.15);color:#10b981;font-size:'+sz+';">'+c.eng+'</span>';
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
function tpRenderDashboard(el) {
    if (tpState.planData.length === 0) {
        el.innerHTML = `<div class="tp-card" style="text-align:center;padding:60px 20px;">
            <div style="font-size:48px;margin-bottom:16px;">📋</div>
            <h3 style="color:var(--tp-amber);margin-bottom:8px;">No hay plan de producción cargado</h3>
            <p style="color:var(--tp-dim);margin-bottom:20px;">Ve a la pestaña 🏭 Producción para importar tu CSV del plan de producción.</p>
            <button class="tp-btn tp-btn-primary" onclick="tpState.activeTab='tp-production';tpRender();document.querySelectorAll('#tp-tabs-bar .tp-tab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('#tp-tabs-bar .tp-tab')[4].classList.add('active');">Ir a Producción →</button>
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

    // Region data for chart
    const regionMap = {};
    analysis.forEach(a => {
        if (!regionMap[a.rgn]) regionMap[a.rgn] = {name:a.rgn, req:0, tested:0, vol:0};
        regionMap[a.rgn].req += a.required;
        regionMap[a.rgn].tested += a.testedN;
        regionMap[a.rgn].vol += a.total;
    });
    const regionData = Object.values(regionMap).sort((a,b) => b.vol - a.vol);
    const maxReq = Math.max(...regionData.map(r => r.req), 1);

    // Fixed plan banner
    const fixedBanner = tpState.fixedPlan
        ? `<div class="tp-plan-fixed">📌 Plan Fijado: ${new Date(tpState.fixedPlan.date).toLocaleDateString('es-MX')} — ${tpState.fixedPlan.configs} configuraciones, ${tpState.fixedPlan.totalTests} pruebas requeridas</div>`
        : '';

    el.innerHTML = `
    ${fixedBanner}
    ${tpRenderAlertsBanner()}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px;">
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">${stats.total}</div><div class="tp-metric-label">Configuraciones</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">${stats.totalReq}</div><div class="tp-metric-label">Pruebas Requeridas</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">${stats.totalT}</div><div class="tp-metric-label">Probadas</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">${stats.deficit}</div><div class="tp-metric-label">Déficit</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">${stats.neverTested}</div><div class="tp-metric-label">Sin Probar (c/prod)</div></div>
    </div>

    <!-- Status bars -->
    <div class="tp-status-bar">
        ${[['ok',stats.ok],['warn',stats.warn],['crit',stats.crit]].map(([s,n]) => `
            <div class="tp-status-segment" style="flex:${Math.max(n,1)};background:${tpStatusColor[s]}18;border:1px solid ${tpStatusColor[s]}40;" onclick="window._tpDashFilter=window._tpDashFilter==='${s}'?'ALL':'${s}';tpRender();">
                <span style="font-size:18px;font-weight:800;color:${tpStatusColor[s]}">${n}</span>
                <span style="font-size:10px;color:var(--tp-dim);margin-left:4px;">${tpStatusLabel[s]}</span>
            </div>
        `).join('')}
    </div>

    <!-- Region chart -->
    <div class="tp-card">
        <div class="tp-card-title">📊 Pruebas Requeridas vs Probadas por Región</div>
        <div class="tp-chart-bar">
            ${regionData.map(r => {
                const pct = r.req > 0 ? Math.round(r.tested / r.req * 100) : 0;
                return `
                <div class="tp-chart-col">
                    <div class="tp-chart-value">${r.tested}/${r.req}</div>
                    <div class="tp-chart-group">
                        <div class="tp-chart-fill" style="height:${(r.req/maxReq)*100}%;background:var(--tp-amber);"></div>
                        <div class="tp-chart-fill" style="height:${(r.tested/maxReq)*100}%;background:var(--tp-green);"></div>
                    </div>
                    <div class="tp-chart-label">${r.name}</div>
                    <div style="font-size:8px;font-weight:700;color:${pct>=100?'var(--tp-green)':pct>=50?'var(--tp-amber)':'var(--tp-red)'};">${pct}%</div>
                </div>`;
            }).join('')}
        </div>
        <div style="display:flex;gap:16px;justify-content:center;margin-top:6px;">
            <span style="font-size:10px;color:var(--tp-amber);">■ Requeridas</span>
            <span style="font-size:10px;color:var(--tp-green);">■ Probadas</span>
        </div>
    </div>

    <!-- Fix plan button -->
    <div class="tp-card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button class="tp-btn tp-btn-primary" onclick="tpFixPlan()">📌 Fijar Plan de Pruebas</button>
        <button class="tp-btn tp-btn-ghost" onclick="tpExportGapCSV()" style="font-size:10px;">Exportar CSV</button>
        <span style="font-size:11px;color:var(--tp-dim);">Guarda un snapshot del plan actual con fecha para referencia</span>
        ${tpState.fixedPlan ? `<button class="tp-btn tp-btn-ghost" onclick="tpState.fixedPlan=null;tpSave();tpRender();" style="margin-left:auto;">Desfijar</button>` : ''}
    </div>

    <!-- Config table -->
    <div class="tp-card">
        <div class="tp-card-title">
            <span>🔍 Análisis de Gap — Configuraciones</span>
            <span style="font-size:10px;color:var(--tp-dim);" id="tp-dash-count"></span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
            <input class="tp-input" placeholder="Buscar config..." style="max-width:220px;" id="tp-dash-search" oninput="tpRenderDashTable()">
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
            <th style="text-align:right">Req.</th><th style="text-align:right">Prob.</th><th style="text-align:right">Déf.</th>
            <th>Score</th><th>Estado</th>
        </tr></thead>
        <tbody>
            ${filtered.slice(0,80).map(a => `
                <tr>
                    <td><span class="tp-dot" style="background:${tpStatusColor[a.status]}"></span></td>
                    <td style="font-size:9px;color:var(--tp-amber);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.desc}">${a.desc}</td>
                    <td>${a.mod}</td>
                    <td><span class="tp-badge" style="background:${tpRegionColor(a.rgn)}20;color:${tpRegionColor(a.rgn)};border:1px solid ${tpRegionColor(a.rgn)}40;font-size:9px;">${a.rgn}</span></td>
                    <td style="font-size:10px">${a.reg}</td>
                    <td style="font-size:10px">${a.eng}</td>
                    <td style="font-size:10px">${a.tx}</td>
                    <td style="text-align:right;font-family:monospace">${a.total.toLocaleString()}</td>
                    <td style="text-align:right;font-family:monospace;color:var(--tp-dim)">${a.hist.toLocaleString()}</td>
                    <td style="text-align:right;font-weight:700">${a.required}</td>
                    <td style="text-align:right;color:var(--tp-green);font-weight:700">${a.testedN}</td>
                    <td style="text-align:right;color:${a.deficit>0?'var(--tp-red)':'var(--tp-green)'};font-weight:700">${a.deficit}</td>
                    <td><div class="tp-bar" style="width:55px"><div class="tp-bar-fill" style="width:${Math.min(a.score,100)}%;background:${tpStatusColor[a.status]}"></div><span class="tp-bar-text">${a.score.toFixed(0)}</span></div></td>
                    <td><span class="tp-badge" style="background:${tpStatusColor[a.status]}20;color:${tpStatusColor[a.status]};border:1px solid ${tpStatusColor[a.status]}40;font-size:9px;">${tpStatusLabel[a.status]}</span></td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    ${filtered.length > 80 ? `<div style="padding:8px;text-align:center;color:var(--tp-dim);font-size:10px;">Mostrando 80 de ${filtered.length}</div>` : ''}
    `;
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
    a.download = 'gap_analysis_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    showToast('CSV gap analysis exportado', 'success');
}


// ═══ TESTED TAB ═══
function tpRenderTested(el) {
    el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button class="tp-btn ${window._tpTestedMode!=='json'?'tp-btn-primary':'tp-btn-ghost'}" onclick="window._tpTestedMode='manual';tpRender();">✏️ Captura Manual</button>
        <button class="tp-btn ${window._tpTestedMode==='json'?'tp-btn-primary':'tp-btn-ghost'}" onclick="window._tpTestedMode='json';tpRender();">📥 Importar JSON</button>
    </div>

    ${window._tpTestedMode !== 'json' ? `
    <div class="tp-card">
        <div class="tp-card-title"><span>✏️ Registrar Vehículo Probado</span></div>
        <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;">
            <div style="flex:1;min-width:250px;position:relative;">
                <label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Config Text (escribe para buscar)</label>
                <input class="tp-input" id="tp-manual-config" placeholder="Ej: BL7m-27 MODEL-6AT..." oninput="tpShowSuggestions()">
                <div id="tp-suggestions" class="tp-suggestions" style="display:none;"></div>
            </div>
            <div style="width:130px;">
                <label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Fecha</label>
                <input class="tp-input" type="date" id="tp-manual-date" value="${new Date().toISOString().slice(0,10)}">
            </div>
            <div style="flex:1;min-width:150px;">
                <label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Nota (VIN, etc.)</label>
                <input class="tp-input" id="tp-manual-note" placeholder="VIN, observaciones...">
            </div>
            <div style="padding-top:16px;">
                <button class="tp-btn tp-btn-primary" onclick="tpAddManual()">+ Agregar</button>
            </div>
        </div>
        <div id="tp-manual-msg" style="margin-top:6px;font-size:11px;"></div>
    </div>
    ` : `
    <div class="tp-card">
        <div class="tp-card-title"><span>📥 Importar desde JSON (COP15)</span></div>
        <p style="font-size:11px;color:var(--tp-dim);margin-bottom:8px;">Pega el JSON exportado de tu herramienta COP15. Se busca el campo <code style="color:var(--tp-amber)">configCode</code> en cada registro.</p>
        <textarea id="tp-json-input" placeholder='Pega aquí el JSON...' style="width:100%;height:100px;background:#161f2e;border:1px solid var(--tp-border);border-radius:6px;padding:10px;color:var(--tp-text);font-size:11px;font-family:monospace;resize:vertical;"></textarea>
        <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="tp-btn tp-btn-primary" onclick="tpImportJSON()">Importar</button>
            <button class="tp-btn tp-btn-ghost" onclick="document.getElementById('tp-json-input').value='';">Limpiar</button>
        </div>
        <div id="tp-json-msg" style="margin-top:6px;font-size:11px;"></div>
    </div>
    `}

    <div class="tp-card">
        <div class="tp-card-title">
            <span>📋 Registro de Pruebas (${tpState.testedList.length})</span>
            ${tpState.testedList.length > 0 ? `<button class="tp-btn tp-btn-danger" onclick="if(confirm('¿Borrar todos?')){tpState.testedList=[];tpSave();tpRender();tpUpdateBadges();}" style="font-size:10px;">🗑 Borrar todo</button>` : ''}
        </div>
        ${tpState.testedList.length === 0 ? `<div style="text-align:center;padding:25px;color:var(--tp-dim);"><div style="font-size:24px;margin-bottom:6px;">📭</div>No hay vehículos probados registrados<br><small style="color:var(--tp-dim);">Se agregan automáticamente al liberar vehículos en COP15 (Correlation, COP-Emisiones, EO-Emisiones, Investigación)</small></div>` : `
        <div style="max-height:300px;overflow-y:auto;">
            <table class="tp-table">
                <thead><tr><th>Config Text</th><th>Fecha</th><th>Nota</th><th>Fuente</th><th>Propósito</th><th></th></tr></thead>
                <tbody>
                    ${tpState.testedList.map((t,i) => `
                        <tr>
                            <td style="font-size:9px;color:var(--tp-amber);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.configText}">${t.configText}</td>
                            <td>${t.date}</td>
                            <td style="color:var(--tp-dim);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.note||'—'}</td>
                            <td><span class="tp-badge" style="background:${t.source==='cop15-release'?'rgba(139,92,246,0.15);color:#8b5cf6':'rgba(6,182,212,0.15);color:#06b6d4'};border:1px solid currentColor;font-size:9px;">${t.source}</span></td>
                            <td style="font-size:10px">${t.purpose||'—'}</td>
                            <td><button onclick="tpState.testedList.splice(${i},1);tpSave();tpRender();tpUpdateBadges();" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size:14px;">×</button></td>
                        </tr>
                    `).join('')}
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
            <span style="color:var(--tp-dim);font-size:9px;margin-left:8px;">[${m.id}]</span>
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
                tpState.testedList.push({ configText, date: r.archivedAt?.slice(0,10) || r.registeredAt?.slice(0,10) || new Date().toISOString().slice(0,10), note: `VIN: ${r.vin||'?'}`, source:'json-import', purpose });
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


// ═══ RULES TAB ═══
function tpRenderRules(el) {
    const regions = ['*','AUSTRALIA','BRAZIL','CANADA','EUROPE','GENERAL','MEXICO','MIDDLE EAST','RUSSIA','USA'];
    const regulations = ['*','120V','220V','BRAZIL L8','EURO-2','EURO-3','EURO-4','EURO-5','EURO-6C','PRE-EURO 7','SULEV 30'];
    const w = tpState.weights;
    const wTotal = w.volume + w.compliance + w.newConfig + w.urgency;

    el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:14px;">
        <div class="tp-card">
            <div class="tp-card-title">
                <span>⚙️ Reglas de Ratio</span>
                <div style="display:flex;gap:6px;">
                    <button class="tp-btn tp-btn-primary" onclick="tpAddRule()">+ Nueva</button>
                    <button class="tp-btn tp-btn-ghost" onclick="if(confirm('¿Restaurar reglas por defecto?')){tpState.rules=[{id:1,region:'USA',regulation:'SULEV 30',ratio:3,per:1000,label:'USA / SULEV 30'},{id:2,region:'USA',regulation:'*',ratio:3,per:1000,label:'USA / Otros'},{id:3,region:'CANADA',regulation:'*',ratio:3,per:1000,label:'Canada'},{id:4,region:'EUROPE',regulation:'EURO-6C',ratio:4,per:1000,label:'Europe / EURO-6C'},{id:5,region:'EUROPE',regulation:'*',ratio:3,per:1000,label:'Europe / Otros'},{id:6,region:'MEXICO',regulation:'*',ratio:2,per:1000,label:'Mexico'},{id:7,region:'GENERAL',regulation:'EURO-6C',ratio:3,per:1000,label:'General / EURO-6C'},{id:8,region:'GENERAL',regulation:'*',ratio:2,per:1000,label:'General / Otros'},{id:9,region:'MIDDLE EAST',regulation:'*',ratio:2,per:1000,label:'Middle East'},{id:10,region:'BRAZIL',regulation:'*',ratio:2,per:1000,label:'Brazil'},{id:11,region:'AUSTRALIA',regulation:'*',ratio:2,per:1000,label:'Australia'},{id:12,region:'*',regulation:'*',ratio:1,per:1000,label:'Default (catch-all)'}];tpSave();tpRender();}">↺ Reset</button>
                </div>
            </div>
            <p style="font-size:10px;color:var(--tp-dim);margin-bottom:8px;">Cuántas pruebas por cada N unidades. Reglas específicas (región+regulación) tienen prioridad sobre genéricas (*).</p>
            <div style="max-height:380px;overflow-y:auto;">
                <table class="tp-table">
                    <thead><tr><th>Región</th><th>Regulación</th><th>Ratio</th><th>Por</th><th>Label</th><th></th></tr></thead>
                    <tbody>
                        ${tpState.rules.map((r,i) => `
                            <tr>
                                <td><select class="tp-select" style="width:100%;font-size:10px;" onchange="tpState.rules[${i}].region=this.value;tpSave();">${regions.map(o=>`<option value="${o}" ${r.region===o?'selected':''}>${o==='*'?'TODAS':o}</option>`).join('')}</select></td>
                                <td><select class="tp-select" style="width:100%;font-size:10px;" onchange="tpState.rules[${i}].regulation=this.value;tpSave();">${regulations.map(o=>`<option value="${o}" ${r.regulation===o?'selected':''}>${o==='*'?'TODAS':o}</option>`).join('')}</select></td>
                                <td><input class="tp-input" type="number" min="1" value="${r.ratio}" style="width:45px;text-align:center;" onchange="tpState.rules[${i}].ratio=+this.value;tpSave();"></td>
                                <td><input class="tp-input" type="number" min="100" step="100" value="${r.per}" style="width:55px;text-align:center;" onchange="tpState.rules[${i}].per=+this.value;tpSave();"></td>
                                <td><input class="tp-input" value="${r.label}" style="font-size:10px;" onchange="tpState.rules[${i}].label=this.value;tpSave();"></td>
                                <td><button onclick="tpState.rules.splice(${i},1);tpSave();tpRender();" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size:14px;">×</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        <div>
            <div class="tp-card">
                <div class="tp-card-title"><span>⚖️ Pesos de Priorización</span></div>
                <p style="font-size:10px;color:var(--tp-dim);margin-bottom:10px;">Peso relativo de cada factor. Deben sumar 100.</p>
                ${[['volume','📦 Volumen de Producción'],['compliance','📊 Cumplimiento (déficit)'],['newConfig','🆕 Config Nueva'],['urgency','⏰ Urgencia (prod. próxima)']].map(([k,label]) => `
                    <div style="margin-bottom:10px;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                            <span style="font-size:11px;">${label}</span>
                            <span style="font-size:12px;font-weight:700;font-family:monospace;color:var(--tp-amber)">${w[k]}%</span>
                        </div>
                        <input type="range" min="0" max="100" step="5" value="${w[k]}" style="width:100%;accent-color:var(--tp-amber);" oninput="tpState.weights.${k}=+this.value;tpSave();tpRender();">
                    </div>
                `).join('')}
                <div style="margin-top:8px;padding:8px;background:#161f2e;border-radius:6px;text-align:center;">
                    <span style="font-size:11px;color:${wTotal===100?'var(--tp-green)':'var(--tp-amber)'};font-weight:700;">Total: ${wTotal}% ${wTotal===100?'✓':'(ajustar a 100%)'}</span>
                </div>
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


// ═══ WEEKLY PLAN TAB ═══
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

    el.innerHTML = `
    <div class="tp-card" style="border:2px solid var(--tp-amber);background:linear-gradient(135deg,rgba(245,158,11,0.05),transparent);">
        <div class="tp-card-title"><span style="font-size:15px;">📅 Generar Plan Semanal</span></div>
        <p style="font-size:11px;color:var(--tp-dim);margin-bottom:10px;">El algoritmo prioriza configuraciones de mayor riesgo. Puedes forzar pruebas antes de generar.</p>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;">
            <div>
                <label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Capacidad</label>
                <input type="number" id="tp-weekly-cap" value="8" min="1" max="20" class="tp-select" style="width:65px;text-align:center;">
            </div>
            <button class="tp-btn tp-btn-primary" onclick="tpGenerateWeekly()" style="font-size:13px;padding:8px 18px;background:var(--tp-amber);color:#000;font-weight:700;">🚀 Generar</button>
        </div>
        <div style="padding:10px;background:var(--tp-card);border-radius:8px;border:1px solid var(--tp-border);">
            <div style="font-size:10px;font-weight:700;color:var(--tp-amber);margin-bottom:5px;">📌 Pruebas obligatorias</div>
            ${suggested.length > 0 ? `
            <div style="font-size:9px;color:var(--tp-dim);margin-bottom:4px;">⚡ Sugeridas (mayor prioridad):</div>
            <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px;">
                ${suggested.map(s => `
                <div onclick="if(!window._tpWeeklyManualPicks)window._tpWeeklyManualPicks=[];if(!window._tpWeeklyManualPicks.includes('${s.desc.replace(/'/g,"\\'")}'))window._tpWeeklyManualPicks.push('${s.desc.replace(/'/g,"\\'")}');tpRender();" style="display:flex;align-items:center;gap:4px;padding:5px 8px;background:rgba(245,158,11,0.04);border:1px dashed rgba(245,158,11,0.3);border-radius:6px;cursor:pointer;flex-wrap:wrap;transition:background 0.15s;" onmouseover="this.style.background='rgba(245,158,11,0.12)'" onmouseout="this.style.background='rgba(245,158,11,0.04)'">
                    <span style="font-size:10px;flex-shrink:0;">⚡</span>
                    ${tpConfigBadges(s,{fontSize:'8px'})}
                    <span style="font-size:8px;color:var(--tp-red);margin-left:auto;flex-shrink:0;white-space:nowrap;">deficit ${s.deficit}</span>
                    <span style="font-size:10px;color:var(--tp-amber);flex-shrink:0;">+</span>
                </div>`).join('')}
            </div>` : ''}
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">
                <select id="tp-manual-pick-select" class="tp-select" style="flex:1;min-width:180px;font-size:10px;">
                    <option value="">Seleccionar...</option>
                    ${suggested.length > 0 ? `<optgroup label="⚡ Sugeridas">${suggested.map(s => `<option value="${s.desc}">${s.desc}</option>`).join('')}</optgroup>` : ''}
                    <optgroup label="Todas las configuraciones">${restConfigs.map(c => `<option value="${c}">${c}</option>`).join('')}</optgroup>
                </select>
                <button class="tp-btn tp-btn-primary" onclick="tpAddManualPick()" style="font-size:10px;">+</button>
            </div>
            ${manualPicks.length > 0 ? `<div style="display:flex;flex-direction:column;gap:4px;">${manualPicks.map((p,i) => {
                const _pc = tpState.planData.find(c => c.desc === p);
                return `<div style="display:flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:6px;flex-wrap:wrap;">
                    <span style="font-size:8px;color:var(--tp-amber);flex-shrink:0;">📌</span>
                    ${_pc ? tpConfigBadges(_pc,{fontSize:'8px'}) : '<span style="font-size:8px;color:var(--tp-dim);">' + (p.length>40?p.slice(0,40)+'...':p) + '</span>'}
                    <button onclick="window._tpWeeklyManualPicks.splice(${i},1);tpRender();" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size:12px;padding:0 2px;margin-left:auto;">×</button>
                </div>`;
            }).join('')}</div>` : '<div style="font-size:9px;color:var(--tp-dim);">Ninguna — el algoritmo decidirá.</div>'}
        </div>
    </div>

    ${plans.length === 0 ? '' : plans.slice().reverse().map((w, wi) => {
        const idx = plans.length - 1 - wi;
        const done = w.items.filter(i => i.completed).length;
        const tot = w.items.length;
        const pct = tot > 0 ? Math.round((done/tot)*100) : 0;
        const isEdit = window._tpEditWeek === idx;
        const dt = new Date(w.created).toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'});
        return `
        <div class="tp-card" style="border-left:3px solid ${pct===100?'var(--tp-green)':pct>0?'var(--tp-amber)':'var(--tp-blue)'};">
            <div class="tp-card-title" style="flex-wrap:wrap;gap:6px;">
                <div><span style="font-size:13px;font-weight:700;">Semana ${idx+1}</span> <span style="font-size:10px;color:var(--tp-dim);">${dt}</span>
                ${w.accepted?'<span class="tp-badge" style="background:rgba(16,185,129,0.15);color:var(--tp-green);font-size:8px;">Aceptado</span>':''}</div>
                <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
                    <span style="font-size:11px;font-weight:700;color:${pct===100?'var(--tp-green)':'var(--tp-amber)'};">${done}/${tot}</span>
                    <div class="tp-bar" style="width:50px;"><div class="tp-bar-fill" style="width:${pct}%;background:${pct===100?'var(--tp-green)':'var(--tp-amber)'}"></div><span class="tp-bar-text" style="font-size:7px;">${pct}%</span></div>
                    ${!w.accepted?`<button class="tp-btn tp-btn-primary" onclick="tpAcceptWeeklyPlan(${idx})" style="font-size:10px;">✅ Aceptar</button>`:''}
                    <button class="tp-btn tp-btn-ghost" onclick="tpExportWeeklyPlan(${idx})" style="font-size:10px;">📤</button>
                    <button class="tp-btn tp-btn-ghost" onclick="window._tpEditWeek=${isEdit?-1:idx};tpRender();" style="font-size:10px;">${isEdit?'✕':'✏️'}</button>
                    <button class="tp-btn tp-btn-ghost" onclick="if(confirm('¿Eliminar semana ${idx+1}?')){tpState.weeklyPlans.splice(${idx},1);tpSave();tpRender();}" style="font-size:10px;color:var(--tp-red);">🗑</button>
                </div>
            </div>
            ${w.items.map((item, ii) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;background:${item.completed?'rgba(16,185,129,0.05)':'var(--tp-card)'};opacity:${item.completed?0.7:1};">
                <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;flex-wrap:wrap;">
                    <span onclick="tpToggleWeeklyItem(${idx},${ii})" style="cursor:pointer;font-size:15px;user-select:none;flex-shrink:0;">${item.completed?'✅':'⬜'}</span>
                    ${item.manual?'<span style="font-size:7px;color:var(--tp-amber);flex-shrink:0;">📌</span>':''}
                    ${tpConfigBadges(item,{fontSize:'8px'})}
                </div>
                <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
                    ${isEdit?`<button onclick="tpRemoveWeeklyItem(${idx},${ii})" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size:13px;">×</button>`:''}
                </div>
            </div>`).join('')}
            ${isEdit?`<div style="margin-top:6px;padding:6px;background:rgba(245,158,11,0.05);border:1px dashed var(--tp-amber);border-radius:5px;"><div style="display:flex;gap:5px;"><select id="tp-edit-add-${idx}" class="tp-select" style="flex:1;font-size:9px;"><option value="">Agregar...</option>${allConfigs.filter(c=>!w.items.some(i=>i.desc===c)).map(c=>`<option value="${c}">${c}</option>`).join('')}</select><button class="tp-btn tp-btn-primary" onclick="tpAddToWeek(${idx})" style="font-size:9px;">+</button></div></div>`:''}
        </div>`;
    }).join('')}`;
}

function tpToggleWeeklyItem(weekIdx, itemIdx) {
    if (!tpState.weeklyPlans || !tpState.weeklyPlans[weekIdx]) return;
    const item = tpState.weeklyPlans[weekIdx].items[itemIdx];
    if (!item) return;
    item.completed = !item.completed;
    item.completedDate = item.completed ? new Date().toISOString() : null;
    if (item.completed) tpAutoMarkWeeklyCompletion(item.desc);
    tpSave(); tpRender();
}

function tpGenerateWeekly() {
    if (tpState.planData.length === 0) { showToast('Importa el plan primero', 'warning'); return; }
    if (!tpState.weeklyPlans) tpState.weeklyPlans = [];
    const capacity = parseInt(document.getElementById('tp-weekly-cap')?.value) || 8;
    const manualPicks = window._tpWeeklyManualPicks || [];
    const analysis = tpGetAnalysis();
    const pool = analysis.filter(c => c.deficit > 0).sort((a,b) => b.score - a.score);
    const testedCopy = [...tpState.testedList];
    const items = [];
    const used = new Set();
    
    manualPicks.forEach(pick => {
        const cfg = tpState.planData.find(c => c.desc === pick);
        if (cfg && !used.has(cfg.desc)) {
            const rule = tpGetRule(cfg);
            const n = testedCopy.filter(t => t.configText === cfg.desc).length;
            const req = tpCalcRequired(cfg, rule);
            items.push({ desc:cfg.desc, id:cfg.id, mod:cfg.mod, rgn:cfg.rgn, reg:cfg.reg, eng:cfg.eng, tx:cfg.tx, my:cfg.my, drv:cfg.drv, body:cfg.body, ep:cfg.ep, engpkg:cfg.engpkg, tire:cfg.tire, required:req, deficit:Math.max(0,req-n), score:tpPriorityScore(cfg,n), completed:false, completedDate:null, manual:true });
            testedCopy.push({ configText:cfg.desc, date:'Manual', source:'plan' });
            used.add(cfg.desc);
        }
    });
    
    for (const cfg of pool) {
        if (items.length >= capacity) break;
        if (used.has(cfg.desc)) continue;
        items.push({ desc:cfg.desc, id:cfg.id, mod:cfg.mod, rgn:cfg.rgn, reg:cfg.reg, eng:cfg.eng, tx:cfg.tx, my:cfg.my, drv:cfg.drv, body:cfg.body, ep:cfg.ep, engpkg:cfg.engpkg, tire:cfg.tire, required:cfg.required, deficit:cfg.deficit, score:cfg.score, completed:false, completedDate:null, manual:false });
        used.add(cfg.desc);
    }
    
    if (items.length === 0) { showToast('Sin configuraciones pendientes', 'info'); return; }
    tpState.weeklyPlans.push({ id:Date.now(), created:new Date().toISOString(), capacity, items, accepted:false });
    window._tpWeeklyManualPicks = [];
    tpSave(); tpRender(); tpUpdateBadges();
    if (typeof fbPostPlanGenerated === 'function') fbPostPlanGenerated(items.length);
}

function tpAcceptWeeklyPlan(weekIdx) {
    if (!tpState.weeklyPlans || !tpState.weeklyPlans[weekIdx]) return;
    tpState.weeklyPlans[weekIdx].accepted = true;
    tpState.weeklyPlans[weekIdx].acceptedDate = new Date().toISOString();
    tpSave(); tpRender(); tpUpdateBadges();
    if (typeof fbPostPlanAccepted === 'function') fbPostPlanAccepted(weekIdx + 1);
    showToast('Plan semana ' + (weekIdx+1) + ' aceptado.', 'success');
}

// ── Auto-mark weekly items when COP15 releases match ──
function tpAutoMarkWeeklyCompletion(configText) {
    if (!tpState.weeklyPlans || tpState.weeklyPlans.length === 0) return;
    // Search all weekly plans for a matching pending item
    for (const plan of tpState.weeklyPlans) {
        if (!plan.items) continue;
        for (const item of plan.items) {
            if (!item.completed && item.desc === configText) {
                item.completed = true;
                item.completedDate = new Date().toISOString().slice(0,10);
                tpSave();
                console.log('TP: Auto-marked weekly item as completed:', configText);
                return;
            }
        }
    }
}


// ═══ PRODUCTION TAB ═══
function tpRenderProduction(el) {
    const plan = tpState.planData;
    const hasData = plan.length > 0;

    el.innerHTML = `
    <div class="tp-card">
        <div class="tp-card-title">
            <span>📥 Importar Plan de Producción (CSV)</span>
            ${tpState.planImportDate ? `<span style="font-size:10px;color:var(--tp-dim);">Última importación: ${new Date(tpState.planImportDate).toLocaleDateString('es-MX')}</span>` : ''}
        </div>
        <p style="font-size:11px;color:var(--tp-dim);margin-bottom:10px;">Carga el CSV con columnas: codigo_config, codigo_config_text, Modelo, ... , count_hist, Feb-26, Mar-26, ..., Total_Calc</p>
        <div style="display:flex;gap:10px;align-items:center;">
            <input type="file" accept=".csv" id="tp-csv-file" style="font-size:12px;color:var(--tp-text);">
            <button class="tp-btn tp-btn-primary" onclick="tpHandleCSVUpload()">📤 Importar CSV</button>
            ${hasData ? `<span style="font-size:11px;color:var(--tp-green);">✅ ${plan.length} configs cargadas</span>` : ''}
        </div>
    </div>

    ${hasData ? `
    <div class="tp-card">
        <div class="tp-card-title"><span>📈 Producción Mensual Planeada</span></div>
        <div class="tp-chart-bar">
            ${(() => {
                const totals = TP_MONTHS.map((m,i) => plan.reduce((s,c) => s + c.m[i], 0));
                const maxT = Math.max(...totals, 1);
                return TP_MONTHS.map((m,i) => `
                    <div class="tp-chart-col">
                        <div class="tp-chart-value">${totals[i].toLocaleString()}</div>
                        <div class="tp-chart-fill" style="height:${(totals[i]/maxT)*100}%;background:var(--tp-blue);"></div>
                        <div class="tp-chart-label">${m}</div>
                    </div>
                `).join('');
            })()}
        </div>
    </div>

    <div class="tp-card">
        <div class="tp-card-title"><span>📋 Detalle (${plan.length} configs)</span></div>
        <div style="max-height:400px;overflow-y:auto;">
            <table class="tp-table">
                <thead><tr>
                    <th>Config Text</th><th>Mod</th><th>MY</th><th>Reg</th><th>Rgn</th><th>Motor</th><th>TX</th><th>Body</th>
                    <th style="text-align:right">Hist</th>
                    ${TP_MONTHS.map(m => `<th style="text-align:right">${m}</th>`).join('')}
                    <th style="text-align:right">Total</th>
                </tr></thead>
                <tbody>
                    ${plan.sort((a,b)=>b.total-a.total).slice(0,100).map(c => `
                        <tr>
                            <td style="font-size:8px;color:var(--tp-amber);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${c.desc}">${c.desc}</td>
                            <td>${c.mod}</td><td style="color:var(--tp-dim)">${c.my}</td>
                            <td style="font-size:9px">${c.reg}</td><td>${c.rgn}</td>
                            <td style="font-size:9px">${c.eng}</td><td>${c.tx}</td><td>${c.body}</td>
                            <td style="text-align:right;font-family:monospace;color:var(--tp-dim)">${c.hist.toLocaleString()}</td>
                            ${c.m.map(v => `<td style="text-align:right;font-family:monospace;color:${v===0?'var(--tp-dim)':'var(--tp-text)'}">${v>0?v.toLocaleString():'—'}</td>`).join('')}
                            <td style="text-align:right;font-weight:700;font-family:monospace;color:var(--tp-amber)">${c.total.toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${plan.length > 100 ? `<div style="padding:8px;text-align:center;color:var(--tp-dim);font-size:10px;">Mostrando 100 de ${plan.length}</div>` : ''}
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
                <span style="font-size:11px;color:${typeColor[a.type]};">${a.msg}</span>
            </div>
        `).join('')}
    </div>`;
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M19] FAMILIES / RISK ANALYSIS                                     ║
// ╚══════════════════════════════════════════════════════════════════════╝

function tpBuildFamilies() {
    const families = {};
    tpState.planData.forEach(cfg => {
        const key = `${cfg.mod}|${cfg.eng}|${cfg.tx}|${cfg.my}|${cfg.reg}|${cfg.rgn}|${cfg.drv}|${cfg.body}|${(cfg.ep&&cfg.ep!=='0')?cfg.ep:''}|${(cfg.engpkg&&cfg.engpkg!=='0')?cfg.engpkg:''}`;
        if (!families[key]) {
            families[key] = { key, mod:cfg.mod, eng:cfg.eng, tx:cfg.tx, my:cfg.my, reg:cfg.reg, rgn:cfg.rgn||'', drv:cfg.drv||'', body:cfg.body||'', ep:cfg.ep||'', engpkg:cfg.engpkg||'', configs:[], totalVol:0, totalHist:0, testedConfigs:0, totalTested:0, totalRequired:0 };
        }
        const rule = tpGetRule(cfg);
        const n = tpState.testedList.filter(t => t.configText === cfg.desc).length;
        const req = tpCalcRequired(cfg, rule);

        // Get VINs from testedList
        const vins = tpState.testedList.filter(t => t.configText === cfg.desc);

        // Try to get results from RA if available
        let raResults = [];
        if (typeof raState !== 'undefined' && raState.tests) {
            raResults = raState.tests.filter(t => {
                const cfgParts = cfg.desc.toLowerCase();
                const tDesc = (t.testDesc||'').toLowerCase();
                const tVin = (t.vin||'');
                return vins.some(v => v.note && v.note.includes(tVin) && tVin.length > 5)
                    || (tDesc && cfgParts.includes(tDesc));
            });
        }

        families[key].configs.push({ ...cfg, testedN:n, required:req, deficit:Math.max(0,req-n), vins, raResults });
        families[key].totalVol += cfg.total;
        families[key].totalHist += cfg.hist;
        families[key].totalRequired += req;
        families[key].totalTested += n;
        if (n > 0) families[key].testedConfigs++;
    });

    Object.values(families).forEach(f => {
        f.configCount = f.configs.length;
        f.coverage = f.totalRequired > 0 ? f.totalTested / f.totalRequired : 1;
        f.configCoverage = f.configCount > 0 ? f.testedConfigs / f.configCount : 1;
        f.deficit = Math.max(0, f.totalRequired - f.totalTested);
        const maxVol = Math.max(...Object.values(families).map(x => x.totalVol + x.totalHist), 1);
        f.riskScore = ((1 - f.coverage) * 60) + (((f.totalVol + f.totalHist) / maxVol) * 30) + ((1 - f.configCoverage) * 10);
        f.riskLevel = f.riskScore > 60 ? 'high' : f.riskScore > 30 ? 'medium' : 'low';
    });

    return Object.values(families);
}

function tpRenderFamilies(el) {
    if (tpState.planData.length === 0) { el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">Importa el plan primero.</div>'; return; }
    const families = tpBuildFamilies();
    const sortBy = window._tpFamSort || 'risk';
    const regionFilter = window._tpFamRegion || 'ALL';
    const allRegions = [...new Set(families.map(f => f.rgn || '?'))].sort();
    let filtered = regionFilter === 'ALL' ? families : families.filter(f => f.rgn === regionFilter);
    const sorted = [...filtered].sort((a,b) => {
        if (sortBy === 'risk') return b.riskScore - a.riskScore;
        if (sortBy === 'volume') return (b.totalVol+b.totalHist) - (a.totalVol+a.totalHist);
        if (sortBy === 'urgency') return b.deficit - a.deficit;
        return 0;
    });
    const rc = { high:'var(--tp-red)', medium:'var(--tp-amber)', low:'var(--tp-green)' };
    const rl = { high:'Alto', medium:'Medio', low:'Bajo' };
    const hR = filtered.filter(f => f.riskLevel === 'high').length;
    const mR = filtered.filter(f => f.riskLevel === 'medium').length;
    const lR = filtered.filter(f => f.riskLevel === 'low').length;

    function epLabel(v) { return !v||v==='0'?'12V':v==='M'?'48V':v; }
    function getDiffFields(configs) {
        const fields = ['tire','ep','engpkg','drv','body'];
        const lbls = {tire:'Llanta',ep:'Env',engpkg:'EngPkg',drv:'Drive',body:'Body'};
        return fields.filter(f => {
            const vals = [...new Set(configs.map(c => c[f]||''))];
            return vals.length > 1;
        }).map(f => ({field:f, label:lbls[f]}));
    }

    el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;margin-bottom:10px;">
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">${filtered.length}</div><div class="tp-metric-label">Familias</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">${hR}</div><div class="tp-metric-label">Alto</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">${mR}</div><div class="tp-metric-label">Medio</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">${lR}</div><div class="tp-metric-label">Bajo</div></div>
    </div>
    <div class="tp-card">
        <div class="tp-card-title" style="flex-wrap:wrap;gap:6px;">
            <span style="font-size:11px;">Familias</span>
            <div style="display:flex;gap:5px;flex-wrap:wrap;">
                <select class="tp-select" onchange="window._tpFamRegion=this.value;tpRender();" style="font-size:10px;">
                    <option value="ALL">Todas</option>
                    ${allRegions.map(r => `<option value="${r}" ${r===regionFilter?'selected':''}>${r}</option>`).join('')}
                </select>
                <button class="tp-btn ${sortBy==='risk'?'tp-btn-primary':'tp-btn-ghost'}" onclick="window._tpFamSort='risk';tpRender();" style="font-size:9px;">Riesgo</button>
                <button class="tp-btn ${sortBy==='volume'?'tp-btn-primary':'tp-btn-ghost'}" onclick="window._tpFamSort='volume';tpRender();" style="font-size:9px;">Vol</button>
            </div>
        </div>
        ${sorted.map(f => {
            const diffs = getDiffFields(f.configs);
            const epTag = f.ep&&f.ep!=='0' ? `<span class="tp-badge" style="background:rgba(251,146,60,0.15);color:#fb923c;font-size:7px;">${epLabel(f.ep)}</span>` : '';
            const engTag = f.engpkg&&f.engpkg!=='0' ? `<span class="tp-badge" style="background:rgba(168,85,247,0.15);color:#a855f7;font-size:7px;">${f.engpkg}</span>` : '';
            return `
            <details style="margin-bottom:4px;border:1px solid var(--tp-border);border-radius:8px;overflow:hidden;border-left:3px solid ${rc[f.riskLevel]};">
                <summary style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;cursor:pointer;list-style:none;background:var(--tp-card);gap:4px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:4px;flex:1;min-width:140px;flex-wrap:wrap;">
                        <span style="font-weight:800;font-size:11px;">${f.mod}</span>
                        ${f.body?`<span style="font-size:9px;color:var(--tp-dim);">${f.body}</span>`:''}
                        <span style="font-size:9px;color:var(--tp-dim);">${f.eng} ${f.tx}</span>
                        <span class="tp-badge" style="background:rgba(6,182,212,0.15);color:#06b6d4;font-size:7px;">${f.my}</span>
                        <span class="tp-badge" style="background:rgba(139,92,246,0.15);color:#8b5cf6;font-size:7px;">${f.reg}</span>
                        <span class="tp-badge" style="background:${tpRegionColor(f.rgn)}20;color:${tpRegionColor(f.rgn)};font-size:7px;">${f.rgn}</span>
                        ${f.drv?`<span class="tp-badge" style="background:rgba(236,72,153,0.15);color:#ec4899;font-size:7px;">${f.drv}</span>`:''}
                        ${epTag}${engTag}
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:10px;font-weight:700;color:${f.totalTested>0?'var(--tp-green)':'var(--tp-red)'};">${f.totalTested}/${f.totalRequired}</span>
                        <div class="tp-bar" style="width:40px;"><div class="tp-bar-fill" style="width:${Math.round(f.coverage*100)}%;background:${rc[f.riskLevel]};"></div><span class="tp-bar-text" style="font-size:7px;">${Math.round(f.coverage*100)}%</span></div>
                    </div>
                </summary>
                <div style="padding:6px 8px;background:#0d1422;border-top:1px solid var(--tp-border);">
                    ${diffs.length > 0 ? `<div style="font-size:8px;color:var(--tp-dim);margin-bottom:3px;">Variantes: ${diffs.map(d=>d.label).join(', ')}</div>` : ''}
                    ${f.configs.sort((a,b)=>b.total-a.total).map(c => {
                        let badges = '';
                        if (diffs.length > 0) {
                            badges = diffs.map(d => {
                                let v = c[d.field]||'';
                                if (d.field==='ep') v = epLabel(v);
                                if (!v||v==='0') v = '-';
                                const colors = {tire:'#38bdf8',ep:'#fb923c',engpkg:'#a855f7',drv:'#ec4899',body:'#94a3b8'};
                                return `<span style="font-size:8px;padding:1px 5px;border-radius:4px;background:${colors[d.field]||'#888'}15;color:${colors[d.field]||'#888'};border:1px solid ${colors[d.field]||'#888'}30;">${v}</span>`;
                            }).join(' ');
                        } else {
                            // Single config - show tire as identifier
                            const tire = c.tire || c.desc.match(/\d{3}\/\d{2}\s*R\d+/)?.[0] || '';
                            if (tire) badges = `<span style="font-size:8px;padding:1px 5px;border-radius:4px;background:#38bdf815;color:#38bdf8;border:1px solid #38bdf830;">${tire}</span>`;
                        }
                        return `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;margin-bottom:2px;border:1px solid var(--tp-border);border-radius:4px;background:var(--tp-card);font-size:9px;">
                            <div style="display:flex;align-items:center;gap:4px;flex:1;min-width:0;flex-wrap:wrap;">
                                <span class="tp-dot" style="background:${c.testedN>=c.required?'var(--tp-green)':c.testedN>0?'var(--tp-amber)':'var(--tp-red)'}"></span>
                                ${badges}
                            </div>
                            <div style="display:flex;gap:4px;align-items:center;">
                                <span style="font-size:9px;font-weight:700;color:${c.testedN>=c.required?'var(--tp-green)':'var(--tp-red)'};">${c.testedN}/${c.required}</span>
                                <span style="font-size:8px;color:var(--tp-dim);">${c.total.toLocaleString()}</span>
                            </div>
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
        <p style="font-size:11px;color:var(--tp-dim);margin-bottom:14px;">Simula escenarios ajustando la capacidad semanal para ver en cuánto tiempo alcanzas cobertura completa.</p>
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;">
            <div>
                <label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Capacidad Semanal</label>
                <input class="tp-input" type="range" min="1" max="30" value="${simCap}" id="tp-sim-cap" style="width:200px;accent-color:var(--tp-amber);" oninput="document.getElementById('tp-sim-cap-val').textContent=this.value;">
                <span id="tp-sim-cap-val" style="font-weight:800;color:var(--tp-amber);font-size:14px;margin-left:8px;">${simCap}</span> <span style="font-size:10px;color:var(--tp-dim);">pruebas/semana</span>
            </div>
            <div>
                <label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Horizonte (semanas)</label>
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
                    ${i % Math.max(1, Math.floor(sim.curve.length/12)) === 0 ? `<div style="font-size:7px;color:var(--tp-dim);margin-top:2px;">S${pt.week}</div>` : ''}
                </div>
            `).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--tp-dim);padding:0 4px;">
            <span>Semana 1</span>
            <span>Semana ${simWeeks}</span>
        </div>
    </div>

    <!-- Capacity comparison table -->
    <div class="tp-card">
        <div class="tp-card-title"><span>📊 Comparación de Escenarios</span></div>
        <p style="font-size:10px;color:var(--tp-dim);margin-bottom:10px;">Para presentar a gerencia: qué capacidad necesitas para alcanzar cobertura en diferentes plazos.</p>
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
    html += '<div style="font-size:10px;color:var(--tp-dim);">' + monthCompleted + ' completadas | ' + monthPending + ' pendientes | ' + monthTested + ' probadas</div>';
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
        html += '<div style="text-align:center;font-size:9px;font-weight:700;color:var(--tp-dim);padding:4px 0;">' + dn + '</div>';
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
        html += '<div style="font-size:10px;font-weight:' + (isToday ? '800' : '600') + ';color:' + (isToday ? 'var(--tp-blue)' : 'var(--tp-text)') + ';margin-bottom:2px;">' + d + '</div>';

        // Show max 3 events as dots/pills
        var shown = dayEvents.filter(function(ev) { return ev.type !== 'week'; });
        var weekEv = dayEvents.find(function(ev) { return ev.type === 'week'; });
        if (weekEv) {
            html += '<div style="font-size:7px;padding:1px 3px;background:rgba(59,130,246,0.2);color:#3b82f6;border-radius:2px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + weekEv.label + '</div>';
        }
        shown.slice(0, 2).forEach(function(ev) {
            html += '<div style="font-size:7px;padding:1px 3px;background:' + ev.color + '20;color:' + ev.color + ';border-radius:2px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + ev.label + '</div>';
        });
        if (shown.length > 2) {
            html += '<div style="font-size:7px;color:var(--tp-dim);text-align:center;">+' + (shown.length - 2) + '</div>';
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
    html += '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--tp-dim);"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;"></span> Completada</div>';
    html += '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--tp-dim);"><span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block;"></span> Pendiente</div>';
    html += '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--tp-dim);"><span style="width:8px;height:8px;border-radius:50%;background:#8b5cf6;display:inline-block;"></span> Probada (COP)</div>';
    html += '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--tp-dim);"><span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;display:inline-block;"></span> Semana Plan</div>';
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
        detailEl.innerHTML = '<div class="tp-card" style="margin-top:8px;text-align:center;padding:20px;color:var(--tp-dim);font-size:11px;">Sin eventos el ' + dateLabel + '</div>';
        return;
    }

    var html = '<div class="tp-card" style="margin-top:8px;">';
    html += '<div class="tp-card-title"><span style="font-size:12px;">📋 ' + dateLabel + ' (' + dayEvents.length + ' eventos)</span></div>';
    dayEvents.forEach(function(ev) {
        html += '<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--tp-border);">';
        html += '<div style="font-size:14px;">' + ev.icon + '</div>';
        html += '<div style="flex:1;">';
        html += '<div style="font-size:10px;font-weight:700;color:' + ev.color + ';">' + ev.desc + '</div>';
        html += '<div style="font-size:9px;color:var(--tp-dim);">' + ev.detail + '</div>';
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
            <div style="font-size:10px;font-weight:700;color:#f59e0b;margin-bottom:4px;">📌 Pendientes esta semana:</div>
            ${info.weeklyPending.slice(0,4).map(i => `
                <div style="font-size:10px;color:#475569;padding:2px 0;display:flex;justify-content:space-between;">
                    <span style="max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i.desc}</span>
                    <span style="color:${i.desc===configText?'#10b981':'#94a3b8'};font-weight:700;">${i.desc===configText?'← ESTE':'pendiente'}</span>
                </div>
            `).join('')}
            ${info.weeklyPending.length > 4 ? `<div style="font-size:9px;color:#94a3b8;">+${info.weeklyPending.length-4} más</div>` : ''}
        </div>
    ` : '';

    panel.style.display = 'block';
    panel.innerHTML = `
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1px solid #f59e0b40;border-radius:8px;padding:10px 14px;margin-top:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-weight:800;font-size:11px;color:#92400e;">📊 Test Plan Manager</span>
                <span style="font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;background:${info.deficit>0?'#fef2f2;color:#dc2626;border:1px solid #fca5a5':'#ecfdf5;color:#059669;border:1px solid #6ee7b7'};">${info.deficit>0?info.tested+'/'+info.required+' (faltan '+info.deficit+')':'✅ Cubierta'}</span>
            </div>
            <div style="font-size:10px;color:#78350f;">
                ${info.cfg.mod} | ${info.cfg.rgn} | ${info.cfg.eng} | Vol: ${(info.cfg.total+info.cfg.hist).toLocaleString()} uds
            </div>
            ${weeklyHTML}
        </div>
    `;
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M22] HOOK SUGGESTION INTO COP15 ALTA FLOW                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

// Override/extend the cascade filter result to also show TP suggestion
const _origUpdateConfigResult = typeof updateConfigResult === 'function' ? updateConfigResult : null;

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


