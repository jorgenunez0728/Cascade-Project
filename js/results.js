// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Results Analyzer Module                               ║
// ╚══════════════════════════════════════════════════════════════════════╝

function raSearchReset() {
    window._raSearchVin = '';
    window._raSearchOp = '';
    window._raSearchFrom = '';
    window._raSearchTo = '';
    window._raSearchReg = 'ALL';
    raRender();
}
function raApplySearchFilter() {
    var vinQ = (window._raSearchVin || '').toUpperCase();
    var opQ = (window._raSearchOp || '').toLowerCase();
    var dateFrom = window._raSearchFrom || '';
    var dateTo = window._raSearchTo || '';
    var regQ = window._raSearchReg || 'ALL';
    return raState.tests.filter(function(t) {
        if (vinQ && !(t.vin||'').toUpperCase().includes(vinQ)) return false;
        if (opQ && !(t.operator||'').toLowerCase().includes(opQ)) return false;
        if (dateFrom && (t.dateStr||'') < dateFrom) return false;
        if (dateTo && (t.dateStr||'') > dateTo) return false;
        if (regQ !== 'ALL' && (t.emissionReg||t.regSpec||'?') !== regQ) return false;
        return true;
    });
}
function raGoDetail(id) {
    window._raDetailId = id;
    raState.activeTab = 'ra-detail';
    raRender();
}

function raRenderOutliers(el) {
    if (raState.tests.length < 3) { el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">Necesitas al menos 3 pruebas.</div>'; return; }

    var metricKeys = ['FuelConsumptionBag','BagCO','BagCO2','BagTHC','BagNOX','BagNMHC','BagCH4','BagNMHCpNOX','DilutePN','FuelEconomyBag'];
    var selMetric = window._raOutlierMetric || 'FuelConsumptionBag';
    var selSigma = window._raOutlierSigma || 2;
    var groupFn = function(t) { return (t.emissionReg||t.regSpec||'?') + ' ' + (t.testType||'?'); };
    var groups = {};

    raState.tests.forEach(function(t) {
        if (!t.cycleData || t.cycleData.length === 0) return;
        var last = t.cycleData[t.cycleData.length - 1];
        var val = last[selMetric];
        if (val === undefined || isNaN(val)) return;
        var g = groupFn(t);
        if (!groups[g]) groups[g] = [];
        groups[g].push({ val: parseFloat(val), vin: t.vin, id: t.id, date: t.dateStr, testNum: t.testNumber, model: t.modelName || t.testDesc || '' });
    });

    var outliers = [];
    var groupStats = [];
    Object.keys(groups).sort().forEach(function(g) {
        var pts = groups[g];
        if (pts.length < 2) return;
        var avg = pts.reduce(function(s,p){return s+p.val;},0) / pts.length;
        var std = Math.sqrt(pts.reduce(function(s,p){return s+Math.pow(p.val-avg,2);},0) / (pts.length-1));
        var threshold = selSigma * std;
        var gOutliers = pts.filter(function(p){ return Math.abs(p.val - avg) > threshold; });
        groupStats.push({ group: g, n: pts.length, avg: avg, std: std, outliers: gOutliers.length });
        gOutliers.forEach(function(p) {
            var sigma = std > 0 ? ((p.val - avg) / std) : 0;
            outliers.push({ group: g, val: p.val, avg: avg, std: std, sigma: sigma, vin: p.vin, id: p.id, date: p.date, testNum: p.testNum, model: p.model });
        });
    });

    outliers.sort(function(a,b) { return Math.abs(b.sigma) - Math.abs(a.sigma); });

    var html = '<div class="tp-card"><div class="tp-card-title"><span>\u26A0\uFE0F Deteccion de Outliers</span></div>';
    html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">';
    html += '<select class="tp-select" onchange="window._raOutlierMetric=this.value;raRender();" style="font-size:10px;">';
    metricKeys.forEach(function(m) { html += '<option value="'+m+'" '+(m===selMetric?'selected':'')+'>'+m+'</option>'; });
    html += '</select>';
    html += '<select class="tp-select" onchange="window._raOutlierSigma=parseFloat(this.value);raRender();" style="font-size:10px;">';
    [1.5, 2, 2.5, 3].forEach(function(s) { html += '<option value="'+s+'" '+(s===selSigma?'selected':'')+'>'+s+'\u03C3</option>'; });
    html += '</select></div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;margin-bottom:10px;">';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">' + raState.tests.length + '</div><div class="tp-metric-label">Total</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (outliers.length > 0 ? 'var(--tp-red)' : 'var(--tp-green)') + '">' + outliers.length + '</div><div class="tp-metric-label">Outliers</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">' + Object.keys(groups).length + '</div><div class="tp-metric-label">Grupos</div></div>';
    html += '</div>';

    // Group summary
    if (groupStats.length > 0) {
        html += '<div style="margin-bottom:10px;"><div style="font-size:10px;font-weight:700;color:var(--tp-dim);margin-bottom:4px;">Resumen por grupo</div>';
        html += '<div style="max-height:150px;overflow-y:auto;"><table class="tp-table" style="width:100%;"><thead><tr><th>Grupo</th><th>N</th><th>x\u0304</th><th>\u03C3</th><th>Outliers</th></tr></thead><tbody>';
        groupStats.forEach(function(gs) {
            html += '<tr><td style="font-size:9px;">' + gs.group + '</td><td>' + gs.n + '</td><td style="font-family:monospace;">' + gs.avg.toFixed(4) + '</td><td style="font-family:monospace;">' + gs.std.toFixed(4) + '</td>';
            html += '<td style="font-weight:700;color:' + (gs.outliers > 0 ? 'var(--tp-red)' : 'var(--tp-green)') + ';">' + gs.outliers + '</td></tr>';
        });
        html += '</tbody></table></div></div>';
    }

    // Outlier list
    if (outliers.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-green);font-size:12px;">\u2705 Sin outliers detectados a ' + selSigma + '\u03C3</div>';
    } else {
        html += '<div style="font-size:10px;font-weight:700;color:var(--tp-red);margin-bottom:4px;">Resultados fuera de ' + selSigma + '\u03C3:</div>';
        html += '<div style="max-height:300px;overflow-y:auto;"><table class="tp-table" style="width:100%;"><thead><tr><th>VIN</th><th>Grupo</th><th>Valor</th><th>x\u0304</th><th>\u03C3 dist</th><th>Fecha</th></tr></thead><tbody>';
        outliers.forEach(function(o) {
            var absS = Math.abs(o.sigma).toFixed(1);
            html += '<tr style="background:rgba(239,68,68,' + Math.min(0.15, Math.abs(o.sigma)*0.03) + ');">';
            html += '<td style="font-family:monospace;font-size:9px;color:var(--tp-amber);">' + (o.vin||'?') + '</td>';
            html += '<td style="font-size:8px;">' + o.group + '</td>';
            html += '<td style="font-family:monospace;font-weight:700;color:var(--tp-red);">' + o.val.toFixed(4) + '</td>';
            html += '<td style="font-family:monospace;font-size:9px;color:var(--tp-dim);">' + o.avg.toFixed(4) + '</td>';
            html += '<td style="font-weight:700;color:' + (Math.abs(o.sigma)>3?'var(--tp-red)':'#f59e0b') + ';">' + (o.sigma>0?'+':'') + o.sigma.toFixed(1) + '\u03C3</td>';
            html += '<td style="font-size:9px;">' + (o.date||'') + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }
    html += '</div>';
    el.innerHTML = html;
}

// ======================================================================
// RA: ADVANCED SEARCH / FILTER
// ======================================================================
function raRenderSearch(el) {
    var vinQ = (window._raSearchVin || '').toUpperCase();
    var opQ = (window._raSearchOp || '').toLowerCase();
    var dateFrom = window._raSearchFrom || '';
    var dateTo = window._raSearchTo || '';
    var regQ = window._raSearchReg || 'ALL';

    var allRegs = ['ALL'].concat([...new Set(raState.tests.map(function(t){ return t.emissionReg || t.regSpec || '?'; }))].sort());
    var allOps = [...new Set(raState.tests.map(function(t){ return t.operator || ''; }).filter(function(o){return o;}))].sort();

    var filtered = raState.tests.filter(function(t) {
        if (vinQ && !(t.vin||'').toUpperCase().includes(vinQ)) return false;
        if (opQ && !(t.operator||'').toLowerCase().includes(opQ)) return false;
        if (dateFrom && (t.dateStr||'') < dateFrom) return false;
        if (dateTo && (t.dateStr||'') > dateTo) return false;
        if (regQ !== 'ALL' && (t.emissionReg||t.regSpec||'?') !== regQ) return false;
        return true;
    });

    var html = '<div class="tp-card"><div class="tp-card-title"><span>\uD83D\uDD0E Busqueda Avanzada</span></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px;">';
    html += '<div><label style="font-size:9px;color:var(--tp-dim);display:block;">VIN</label><input type="text" value="' + (window._raSearchVin||'') + '" onchange="window._raSearchVin=this.value;raRender();" class="tp-select" style="width:100%;font-size:10px;" placeholder="Buscar VIN..."></div>';
    html += '<div><label style="font-size:9px;color:var(--tp-dim);display:block;">Operador</label><input type="text" value="' + (window._raSearchOp||'') + '" onchange="window._raSearchOp=this.value;raRender();" class="tp-select" style="width:100%;font-size:10px;" placeholder="Nombre..."></div>';
    html += '<div><label style="font-size:9px;color:var(--tp-dim);display:block;">Desde</label><input type="date" value="' + dateFrom + '" onchange="window._raSearchFrom=this.value;raRender();" class="tp-select" style="width:100%;font-size:10px;"></div>';
    html += '<div><label style="font-size:9px;color:var(--tp-dim);display:block;">Hasta</label><input type="date" value="' + dateTo + '" onchange="window._raSearchTo=this.value;raRender();" class="tp-select" style="width:100%;font-size:10px;"></div>';
    html += '<div><label style="font-size:9px;color:var(--tp-dim);display:block;">Regulacion</label><select onchange="window._raSearchReg=this.value;raRender();" class="tp-select" style="width:100%;font-size:10px;">';
    allRegs.forEach(function(r) { html += '<option value="'+r+'" '+(r===regQ?'selected':'')+'>'+r+'</option>'; });
    html += '</select></div>';
    html += '<div style="display:flex;align-items:flex-end;gap:4px;"><button class="tp-btn tp-btn-ghost" onclick="raSearchReset()" style="font-size:10px;">Limpiar</button></div>';
    html += '</div>';

    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    html += '<span style="font-size:11px;color:var(--tp-dim);">' + filtered.length + ' de ' + raState.tests.length + ' resultados</span>';
    if (filtered.length > 0) html += '<button class="tp-btn tp-btn-ghost" onclick="raExportCSV(raApplySearchFilter())" style="font-size:9px;padding:3px 8px;">Exportar CSV (' + filtered.length + ')</button>';
    html += '</div>';

    if (filtered.length > 0) {
        html += '<div style="max-height:400px;overflow-y:auto;"><table class="tp-table" style="width:100%;"><thead><tr><th>VIN</th><th>Modelo</th><th>Regulacion</th><th>Operador</th><th>Fecha</th><th>Test#</th><th></th></tr></thead><tbody>';
        filtered.slice(0, 100).forEach(function(t) {
            html += '<tr>';
            html += '<td style="font-family:monospace;font-size:9px;color:var(--tp-amber);">' + (t.vin||'?') + '</td>';
            html += '<td style="font-size:9px;">' + (t.modelName||t.testDesc||'?') + '</td>';
            html += '<td style="font-size:8px;">' + (t.emissionReg||t.regSpec||'?') + '</td>';
            html += '<td style="font-size:9px;">' + (t.operator||'') + '</td>';
            html += '<td style="font-size:9px;">' + (t.dateStr||'') + '</td>';
            html += '<td style="font-size:9px;">' + (t.testNumber||t.yearlyTestNumber||'') + '</td>';
            html += '<td><button class="tp-btn tp-btn-ghost" onclick="raGoDetail(\x27' + t.id + '\x27)" style="font-size:8px;">\uD83D\uDD0D</button></td>';
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        if (filtered.length > 100) html += '<div style="font-size:9px;color:var(--tp-dim);text-align:center;padding:6px;">Mostrando 100 de ' + filtered.length + '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M23] RESULTS ANALYZER — ENGINE                                    ║
// ╚══════════════════════════════════════════════════════════════════════╝

const RA_LS_KEY = 'kia_results_v1';

let raState = JSON.parse(localStorage.getItem(RA_LS_KEY)) || {
    tests: [],
    profiles: [],
    activeTab: 'ra-dashboard',
};

if (raState.profiles.length === 0) {
    raState.profiles = [
        { id:'wltp-euro6', name:'WLTP — Pre-Euro 7 / Euro 6', regulation:'PRE-EURO 7,EURO-6E,EURO-6D,EURO-6C,EURO-6,EURO-4,EURO-3,EURO-2', testMode:'WLTP',
          cycleColumns:['FuelConsumptionBag','FuelEconomyBag','BagCO','BagCO2','BagTHC','BagNOX','BagNMHC','BagCH4','BagNMHCpNOX','DilutePN'],
          sampleColumns:['FuelConsumptionBag','BagCO','BagCO2','BagTHC','BagNOX','BagNMHC','BagCH4','DilutePN','CellTemperature','Barometer','CellAirRH'],
          limits:{BagCO:1.0,BagTHC:0.1,BagNOX:0.06,BagNMHC:0.068,BagNMHCpNOX:0.16,DilutePN:6e11},
          labels:{FuelConsumptionBag:'Consumo (l/100km)',FuelEconomyBag:'FE (mpg)',BagCO:'CO',BagCO2:'CO₂',BagTHC:'THC',BagNOX:'NOx',BagNMHC:'NMHC',BagCH4:'CH₄',BagNMHCpNOX:'NMHC+NOx',DilutePN:'PN (#/km)',CellTemperature:'Temp.Celda',Barometer:'Presión',CellAirRH:'HR%'},
          fuelUnit:'l100km',showPhaseFuel:false
        },
        { id:'nedc-euro5b', name:'NEDC — Euro 5b', regulation:'EURO-5B,EURO-5', testMode:'NEDC',
          cycleColumns:['FuelConsumptionBag','FuelEconomyBag','BagCO','BagCO2','BagTHC','BagNOX','BagNMHC','BagCH4','DilutePN'],
          sampleColumns:['FuelConsumptionBag','BagCO','BagCO2','BagTHC','BagNOX','BagNMHC','BagCH4','DilutePN','CellTemperature','Barometer','CellAirRH'],
          limits:{BagCO:1.0,BagTHC:0.1,BagNOX:0.06,BagNMHC:0.068,DilutePN:6e11},
          labels:{FuelConsumptionBag:'Consumo (l/100km)',FuelEconomyBag:'FE (mpg)',BagCO:'CO',BagCO2:'CO₂',BagTHC:'THC',BagNOX:'NOx',BagNMHC:'NMHC',BagCH4:'CH₄',DilutePN:'PN (#/km)',CellTemperature:'Temp.Celda',Barometer:'Presión',CellAirRH:'HR%'},
          fuelUnit:'l100km',showPhaseFuel:false
        },
        { id:'ftp-tier2bin7', name:'FTP-75 — EPA Tier 2 Bin 7', regulation:'TIER 2 BIN 7,TIER2-BIN7,EPA-T2B7,TIER 2,BIN 7', testMode:'FTP',
          cycleColumns:['FuelConsumptionBag','FuelEconomyBag','BagCO','BagCO2','BagTHC','BagNOX','BagNMOGpNOX','HCHO','DilutePN'],
          sampleColumns:['FuelConsumptionBag','BagCO','BagCO2','BagTHC','BagNOX','BagNMOGpNOX','HCHO','DilutePN','CellTemperature','Barometer'],
          limits:{BagCO:4.2,BagTHC:0.09,BagNOX:0.07,BagNMOGpNOX:0.16,HCHO:0.018},
          labels:{FuelConsumptionBag:'Consumo (l/100km)',FuelEconomyBag:'FE (mpg)',BagCO:'CO',BagCO2:'CO₂',BagTHC:'THC',BagNOX:'NOx',BagNMOGpNOX:'NMOG+NOx',HCHO:'Formaldehído',DilutePN:'PN (#/km)',CellTemperature:'Temp.Celda',Barometer:'Presión'},
          fuelUnit:'l100km',showPhaseFuel:false
        },
        { id:'wltp-sulev30', name:'WLTP — SULEV 30 (USA/Canada)', regulation:'SULEV 30,SULEV30,LEV III,LEV-III', testMode:'WLTP',
          cycleColumns:['FuelConsumptionBag','FuelEconomyBag','BagCO','BagCO2','BagNMHCpNOX','BagNMOGpNOX','BagNOX','BagTHC','BagCH4','DilutePN'],
          sampleColumns:['FuelConsumptionBag','BagCO','BagCO2','BagNMHCpNOX','BagNMOGpNOX','DilutePN','CellTemperature','Barometer'],
          limits:{BagNMHCpNOX:0.03,BagNMOGpNOX:0.03,BagCO:1.0,DilutePN:6e11},
          labels:{FuelConsumptionBag:'Consumo (l/100km)',FuelEconomyBag:'FE (mpg)',BagCO:'CO',BagCO2:'CO₂',BagTHC:'THC',BagNOX:'NOx',BagNMHCpNOX:'NMHC+NOx',BagNMOGpNOX:'NMOG+NOx',BagCH4:'CH₄',DilutePN:'PN (#/km)'},
          fuelUnit:'l100km',showPhaseFuel:false
        },
        { id:'ftp-sulev30', name:'FTP-75 — SULEV 30', regulation:'SULEV 30 FTP,SULEV30-FTP,SULEV30 FTP', testMode:'FTP',
          cycleColumns:['FuelConsumptionBag','FuelEconomyBag','BagCO','BagCO2','BagNMOGpNOX','BagNOX','BagTHC','HCHO','DilutePN'],
          sampleColumns:['FuelConsumptionBag','BagCO','BagCO2','BagNMOGpNOX','BagNOX','HCHO','DilutePN','CellTemperature','Barometer'],
          limits:{BagNMOGpNOX:0.03,BagCO:1.0,HCHO:0.004,DilutePN:6e11},
          labels:{FuelConsumptionBag:'Consumo (l/100km)',FuelEconomyBag:'FE (mpg)',BagCO:'CO',BagCO2:'CO₂',BagTHC:'THC',BagNOX:'NOx',BagNMOGpNOX:'NMOG+NOx',HCHO:'Formaldehído',DilutePN:'PN (#/km)'},
          fuelUnit:'l100km',showPhaseFuel:false
        },
    ];
    raSave();
}

function raSave(){
    try {
        localStorage.setItem(RA_LS_KEY, JSON.stringify(raState));
    } catch(e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            // localStorage full — try saving without cycleData/sampleData to reduce size
            console.warn('RA: localStorage full, saving compact version');
            try {
                const compact = JSON.parse(JSON.stringify(raState));
                compact.tests = compact.tests.map(function(t) {
                    var c = Object.assign({}, t);
                    // Keep only last row of cycleData (the totals)
                    if (c.cycleData && c.cycleData.length > 1) c.cycleData = [c.cycleData[c.cycleData.length-1]];
                    // Remove sampleData entirely (least critical)
                    delete c.sampleData;
                    return c;
                });
                localStorage.setItem(RA_LS_KEY, JSON.stringify(compact));
                console.log('RA: Saved compact version (' + compact.tests.length + ' tests)');
            } catch(e2) {
                showToast('localStorage lleno. Exporta datos y borra para liberar espacio.', 'error');
            }
        }
    }
}
function raUpdateBadges(){
    const el1 = document.getElementById('ra-count-badge');
    const el2 = document.getElementById('ra-tests-badge');
    const el3 = document.getElementById('ra-profiles-badge');
    if(el1) el1.textContent = raState.tests.length+' pruebas';
    if(el2) el2.textContent = raState.tests.length+' pruebas';
    if(el3) el3.textContent = raState.profiles.length+' perfiles';
}

function raSwitchTab(tabId){
    raState.activeTab = tabId;
    document.querySelectorAll('#ra-tabs-bar .tp-tab').forEach(b=>b.classList.remove('active'));
    if(event && event.target) event.target.classList.add('active');
    raRender();
}

function raRender(){
    const el = document.getElementById('ra-content');
    if(!el) return;
    const t = raState.activeTab;
    if(t==='ra-dashboard') raRenderDashboard(el);
    else if(t==='ra-import') raRenderImport(el);
    else if(t==='ra-profiles') raRenderProfiles(el);
    else if(t==='ra-trends') raRenderTrends(el);
    else if(t==='ra-detail') raRenderDetail(el);
    else if(t==='ra-outliers') raRenderOutliers(el);
    else if(t==='ra-capability') raRenderCapability(el);
    else if(t==='ra-search') raRenderSearch(el);
    else if(t==='ra-filter') raRenderFilter(el);
    else if(t==='ra-compare') raRenderCompare(el);
}


// ── CSV Parser ──
function raParseCSV(text){
    const lines = text.replace(/\r/g,'').split('\n');
    return lines.map(line=>{
        const res=[]; let cur='',inQ=false;
        for(let i=0;i<line.length;i++){
            if(line[i]==='"') inQ=!inQ;
            else if(line[i]===','&&!inQ){ res.push(cur.trim()); cur=''; }
            else cur+=line[i];
        }
        res.push(cur.trim());
        return res;
    });
}

// ── File grouper ──
function raGroupFiles(files){
    const g={};
    for(const f of files){
        const pp = f.webkitRelativePath ? f.webkitRelativePath.split('/') : [f.name];
        const dir = pp.length>1 ? pp.slice(0,-1).join('/') : '__single__';
        const fn = pp[pp.length-1].toLowerCase();
        if(!g[dir]) g[dir]={};
        if(fn==='customfields.csv') g[dir].custom=f;
        else if(fn==='cycleresults.csv') g[dir].cycle=f;
        else if(fn==='sampleresults.csv') g[dir].sample=f;
        else if(fn==='testdetails.csv') g[dir].details=f;
    }
    return g;
}

// ── Extract single test ──
async function raProcessGroup(grp){
    const t = { id: Date.now()+'_'+Math.random().toString(36).slice(2,6), importDate: new Date().toISOString() };

    // CustomFields
    if(grp.custom){
        const rawText = await grp.custom.text();
        if (!rawText || rawText.trim().length < 10) throw new Error('CustomFields.csv vacío o corrupto');
        const rows = raParseCSV(rawText);
        if (rows.length < 9) throw new Error('CustomFields.csv: formato inválido (menos de 9 filas)');
        const fld={};
        for(let i=8;i<rows.length;i++) if(rows[i].length>=3) fld[rows[i][0]]=rows[i][2];
        t.vin=fld.VIN||''; t.operator=fld.Operator||''; t.driver=fld.Driver||'';
        t.wheelSize=fld.WheelSize||''; t.startMileage=fld.StartingMileage||''; t.endMileage=fld.EndingMileage||'';
        t.modelName=fld.ModelName||''; t.modelYear=fld.MODELYEAR||''; t.transmission=fld.TRANSMISSION||'';
        t.envPackage=fld.ENVIRONMENTPACKAGE||''; t.emissionReg=fld.EMISSIONREGULATION||'';
        t.driveType=fld.DRIVETYPE||''; t.engineCapacity=fld.ENGINECAPACITY||'';
        t.tireAssy=fld.TIREASSY||''; t.region=fld.REGION||''; t.bodyType=fld.BODYTYPE||'';
        t.enginePackage=fld.ENGINEPACKAGE||''; t.purposeOfTest=fld.EMDBPurposeOfTest||fld.TestStage||'';
    }

    // TestDetails
    if(grp.details){
        const rows = raParseCSV(await grp.details.text());
        if(rows.length>=9){
            const hdr=rows[5]||[], dat=rows[8]||[], m={};
            hdr.forEach((h,i)=>m[h]=dat[i]||'');
            t.regulationRegion=m['Regulation.Region']||''; t.regulationDesc=m['Regulation.Description']||'';
            t.vehicleType=m['Regulation.VehicleType']||''; t.vehicleName=m['VehicleName']||m['NamedEntity.Name']||'';
            t.testType=m['TestType']||m['NamedEntity.Name']||''; t.testStatus=m['TestStatus']||'';
            t.pollutantLimits=m['PollutantLimits']||''; t.regSpec=m['Vehicle.RegulationSpecificationName']||'';
            t.fuelType=m['FuelType']||''; t.testCategory=m['Test.Category']||'';
            t.testDesc=m['Test.Description']||''; t.testNumber=m['TestNumber']||'';
            t.yearlyTestNumber=m['YearlyTestNumber']||''; t.wltpVehicleClass=m['WltpVehicleClass']||'';
            t.testMass=parseFloat(m['Target.TestMass'])||0; t.resultsDir=m['ResultsExportDirectory']||'';
        }
    }

    // CycleResults (with validation)
    if(grp.cycle){
        const cycleText = await grp.cycle.text();
        if (!cycleText || cycleText.trim().length < 10) throw new Error('CycleResults.csv vacío o corrupto');
        const rows = raParseCSV(cycleText);
        if(rows.length>=9){
            const hdr=rows[5]||[]; t.cycleData=[];
            for(let i=8;i<rows.length;i++){
                if(rows[i].length<5) continue;
                const r={}; hdr.forEach((h,j)=>{ const v=rows[i][j]; r[h]=isNaN(v)||v===''?v:parseFloat(v); });
                t.cycleData.push(r);
            }
        }
    }

    // SampleResults
    if(grp.sample){
        const rows = raParseCSV(await grp.sample.text());
        if(rows.length>=9){
            const hdr=rows[5]||[]; t.sampleData=[];
            for(let i=8;i<rows.length;i++){
                if(rows[i].length<5) continue;
                const r={}; hdr.forEach((h,j)=>{ const v=rows[i][j]; r[h]=isNaN(v)||v===''?v:parseFloat(v); });
                t.sampleData.push(r);
            }
        }
    }

    t.label = `${t.testDesc||t.vehicleName||'?'} — ${t.vin||'NoVIN'}`;
    t.dateStr = t.importDate.slice(0,10);
    return t;
}

function raGetProfile(test){
    const reg = (test.emissionReg||test.regSpec||'').toUpperCase();
    return raState.profiles.find(p=>p.regulation.split(',').some(r=>reg.includes(r.trim().toUpperCase())))
        || raState.profiles[0] || null;
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M24] RA — DASHBOARD                                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

function raRenderDashboard(el){
    if(raState.tests.length===0){
        el.innerHTML=`<div class="tp-card" style="text-align:center;padding:50px;">
            <div style="font-size:48px;margin-bottom:12px;">🧪</div>
            <h3 style="color:#06b6d4;margin-bottom:8px;">No hay resultados importados</h3>
            <p style="color:var(--tp-dim);margin-bottom:16px;">Ve a Importar para cargar los CSVs del analizador.</p>
            <button class="tp-btn tp-btn-primary" onclick="raState.activeTab='ra-import';raRender();document.querySelectorAll('#ra-tabs-bar .tp-tab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('#ra-tabs-bar .tp-tab')[1].classList.add('active');">Ir a Importar</button>
        </div>`; return;
    }
    const sf=(v,d)=>typeof v==='number'&&isFinite(v)?v.toFixed(d):'—';
    const tests=raState.tests, models=[...new Set(tests.map(t=>t.testDesc||t.modelName||'?'))];
    const regs=[...new Set(tests.map(t=>t.emissionReg||t.regSpec||'?'))];
    const fuelData=tests.filter(t=>t.cycleData&&t.cycleData.length>0).map(t=>{
        const l=t.cycleData[t.cycleData.length-1];
        return {fc:l.FuelConsumptionBag,co2:l.BagCO2,co:l.BagCO,nox:l.BagNOX,thc:l.BagTHC,vin:t.vin,model:t.testDesc,id:t.id,status:t.testStatus};
    }).filter(d=>typeof d.fc==='number'&&isFinite(d.fc));
    const avg=(arr,k)=>arr.length>0?(arr.reduce((s,d)=>s+(d[k]||0),0)/arr.length).toFixed(3):'—';

    try {
    el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px;">
        <div class="tp-metric"><div class="tp-metric-val" style="color:#06b6d4">${tests.length}</div><div class="tp-metric-label">Pruebas</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">${models.length}</div><div class="tp-metric-label">Modelos</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">${regs.length}</div><div class="tp-metric-label">Regulaciones</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:#8b5cf6">${avg(fuelData,'fc')}</div><div class="tp-metric-label">Consumo Prom</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">${avg(fuelData,'co2')}</div><div class="tp-metric-label">CO2 Prom</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">${tests.filter(function(t){return raTestVerdict(t)==='PASS';}).length}</div><div class="tp-metric-label">PASS</div></div>
        <div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">${tests.filter(function(t){return raTestVerdict(t)==='FAIL';}).length}</div><div class="tp-metric-label">FAIL</div></div>
    </div>
    <div class="tp-card">
        <div class="tp-card-title"><span>Ultimas Pruebas</span>
            <div style="display:flex;gap:6px;align-items:center;">
                <span style="font-size:10px;color:var(--tp-dim);">${tests.length} total</span>
                <button class="tp-btn tp-btn-ghost" onclick="raExportCSV()" style="font-size:9px;padding:3px 8px;">CSV</button>
            </div>
        </div>
        <div style="max-height:400px;overflow-y:auto;">
            <table class="tp-table">
                <thead><tr><th>VIN</th><th>Modelo</th><th>Reg.</th><th>P/F</th><th style="text-align:right">FC</th><th style="text-align:right">CO2</th><th style="text-align:right">CO</th><th style="text-align:right">NOx</th><th style="text-align:right">THC</th><th></th></tr></thead>
                <tbody>
                    ${tests.slice(-30).reverse().map(t=>{
                        const c=t.cycleData&&t.cycleData.length>0?t.cycleData[t.cycleData.length-1]:{};
                        const pr=raGetProfile(t); const lims=pr?pr.limits:{};
                        const chk=(k,v)=>lims[k]&&typeof v==='number'&&Math.abs(v)>lims[k]?'color:var(--tp-red);font-weight:700':'';
                        return `<tr>
                            <td style="font-family:monospace;font-size:9px;color:var(--tp-amber);">${t.vin||'—'}</td>
                            <td style="font-size:10px">${t.testDesc||t.modelName||'—'}</td>
                            <td style="font-size:9px">${t.emissionReg||t.regSpec||'—'}</td>
                            <td>${(function(){var v=raTestVerdict(t);return v==='PASS'?'<span class="tp-badge" style="background:rgba(16,185,129,0.15);color:var(--tp-green);border:1px solid currentColor;font-size:8px;font-weight:700;">PASS</span>':v==='FAIL'?'<span class="tp-badge" style="background:rgba(239,68,68,0.15);color:var(--tp-red);border:1px solid currentColor;font-size:8px;font-weight:700;">FAIL</span>':'<span style="font-size:8px;color:var(--tp-dim);">—</span>';})()}</td>
                            <td style="text-align:right;font-family:monospace;font-size:10px;">${sf(c.FuelConsumptionBag,2)}</td>
                            <td style="text-align:right;font-family:monospace;font-size:10px;">${sf(c.BagCO2,1)}</td>
                            <td style="text-align:right;font-family:monospace;font-size:10px;${chk('BagCO',c.BagCO)}">${sf(c.BagCO,3)}</td>
                            <td style="text-align:right;font-family:monospace;font-size:10px;${chk('BagNOX',c.BagNOX)}">${sf(c.BagNOX,4)}</td>
                            <td style="text-align:right;font-family:monospace;font-size:10px;${chk('BagTHC',c.BagTHC)}">${sf(c.BagTHC,4)}</td>
                            <td><button class="tp-btn tp-btn-ghost" onclick="raGoDetail('${t.id}')" style="font-size:8px;">🔍</button></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;
    } catch(e) { el.innerHTML='<div class="tp-card" style="padding:20px;color:var(--tp-red);">Error renderizando dashboard: '+e.message+'</div>'; console.error('RA Dashboard error:',e); }
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M25] RA — IMPORT                                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

function raRenderImport(el){
    el.innerHTML=`
    <div class="tp-card">
        <div class="tp-card-title"><span>📂 Importar Carpeta Completa (Batch ~600 pruebas)</span></div>
        <p style="font-size:11px;color:var(--tp-dim);margin-bottom:10px;">Selecciona la carpeta raíz de resultados (ej. <code style="color:var(--tp-amber)">D:\\TestResults\\WLTP</code>). Se buscan recursivamente CustomFields.csv, CycleResults.csv, SampleResults.csv y TestDetails.csv.</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <input type="file" id="ra-folder-input" webkitdirectory directory multiple style="font-size:12px;color:var(--tp-text);">
            <button class="tp-btn tp-btn-primary" onclick="raBatchImport()">🚀 Importar Carpeta</button>
        </div>
        <div id="ra-batch-progress" style="margin-top:10px;"></div>
    </div>
    <div class="tp-card">
        <div class="tp-card-title"><span>📄 Importar Prueba Individual</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:10px;">
            <div><label style="font-size:10px;color:var(--tp-dim);">CustomFields.csv</label><input type="file" id="ra-f-custom" accept=".csv" style="font-size:11px;color:var(--tp-text);width:100%;"></div>
            <div><label style="font-size:10px;color:var(--tp-dim);">CycleResults.csv</label><input type="file" id="ra-f-cycle" accept=".csv" style="font-size:11px;color:var(--tp-text);width:100%;"></div>
            <div><label style="font-size:10px;color:var(--tp-dim);">SampleResults.csv</label><input type="file" id="ra-f-sample" accept=".csv" style="font-size:11px;color:var(--tp-text);width:100%;"></div>
            <div><label style="font-size:10px;color:var(--tp-dim);">TestDetails.csv</label><input type="file" id="ra-f-details" accept=".csv" style="font-size:11px;color:var(--tp-text);width:100%;"></div>
        </div>
        <button class="tp-btn tp-btn-primary" onclick="raSingleImport()">📥 Importar</button>
        <div id="ra-single-msg" style="margin-top:8px;font-size:11px;"></div>
    </div>
    <div class="tp-card">
        <div class="tp-card-title"><span>📦 Importar JSON (backup previo)</span></div>
        <input type="file" id="ra-json-import" accept=".json" style="font-size:12px;color:var(--tp-text);">
        <button class="tp-btn tp-btn-ghost" onclick="raImportJSON()" style="margin-left:8px;">Importar</button>
    </div>
    <div class="tp-card">
        <div class="tp-card-title"><span>💾 Almacenamiento (${raState.tests.length} pruebas)</span>
            ${raState.tests.length>0?`<div style="display:flex;gap:6px;"><button class="tp-btn tp-btn-ghost" onclick="raExportAll()" style="font-size:10px;">📤 Export JSON</button><button class="tp-btn tp-btn-danger" onclick="if(confirm('¿Borrar TODAS las pruebas importadas?')){raState.tests=[];raSave();raRender();raUpdateBadges();}" style="font-size:10px;">🗑 Borrar</button></div>`:''}
        </div>
        <p style="font-size:10px;color:var(--tp-dim);">${raState.tests.length>0?`~${(JSON.stringify(raState.tests).length/1024).toFixed(0)} KB en localStorage`:'Sin datos.'}</p>
    </div>`;
}

async function raBatchImport(){
    const input=document.getElementById('ra-folder-input');
    const prog=document.getElementById('ra-batch-progress');
    if(!input.files||input.files.length===0){prog.innerHTML='<span style="color:var(--tp-red)">Selecciona una carpeta</span>';return;}
    prog.innerHTML='<span style="color:var(--tp-amber)">Agrupando archivos...</span>';
    
    const allFiles = Array.from(input.files);
    prog.innerHTML='<span style="color:var(--tp-amber)">Archivos encontrados: ' + allFiles.length + '. Agrupando...</span>';
    await new Promise(r=>setTimeout(r,50));
    
    const groups=raGroupFiles(allFiles);
    const dirs=Object.keys(groups).filter(d=>groups[d].cycle||groups[d].custom);
    
    if(dirs.length===0){
        prog.innerHTML='<span style="color:var(--tp-red)">No se encontraron carpetas con CustomFields.csv o CycleResults.csv. Archivos totales: ' + allFiles.length + '</span>';
        // Debug: show what files were found
        var fnames = allFiles.slice(0,10).map(function(f){ return f.webkitRelativePath || f.name; });
        prog.innerHTML += '<div style="font-size:9px;color:var(--tp-dim);margin-top:6px;">Primeros archivos: ' + fnames.join(', ') + '</div>';
        return;
    }
    
    let imported=0,skipped=0,errors=0;
    var errMsgs = [];
    prog.innerHTML='<span style="color:var(--tp-amber)">Encontradas ' + dirs.length + ' pruebas. Procesando...</span>';
    await new Promise(r=>setTimeout(r,50));
    
    for(const dir of dirs){
        try{
            const test=await raProcessGroup(groups[dir]);
            // Duplicate check: VIN+testNumber, or VIN+testDesc+dateStr for cases without testNumber
            var isDup = false;
            if(test.vin && test.testNumber) {
                isDup = raState.tests.some(x=>x.vin===test.vin && x.testNumber===test.testNumber);
            } else if(test.vin && test.testDesc) {
                isDup = raState.tests.some(x=>x.vin===test.vin && x.testDesc===test.testDesc && x.dateStr===test.dateStr);
            }
            if(isDup){skipped++;continue;}
            raState.tests.push(test); imported++;
            if(imported%25===0){
                prog.innerHTML='<span style="color:var(--tp-amber)">' + imported + '/' + dirs.length + ' importadas (' + skipped + ' dup, ' + errors + ' err)...</span>';
                await new Promise(r=>setTimeout(r,10));
            }
        }catch(e){
            errors++;
            if(errMsgs.length<5) errMsgs.push(dir.slice(0,40) + ': ' + e.message);
            console.error('RA err:',dir,e);
        }
    }
    
    // Save
    prog.innerHTML='<span style="color:var(--tp-amber)">Guardando ' + imported + ' resultados...</span>';
    await new Promise(r=>setTimeout(r,50));
    raSave();
    raUpdateBadges();
    
    // DON'T call raRender() — it would destroy this progress message
    // Instead, just update the storage info text if visible
    var finalMsg = '<span style="color:var(--tp-green)">Listo: ' + imported + ' nuevas, ' + skipped + ' duplicadas, ' + errors + ' errores de ' + dirs.length + ' carpetas.</span>';
    finalMsg += '<div style="margin-top:6px;"><button class="tp-btn tp-btn-primary" onclick="raState.activeTab=\'ra-dashboard\';raRender();document.querySelectorAll(\'#ra-tabs-bar .tp-tab\').forEach(b=>b.classList.remove(\'active\'));document.querySelectorAll(\'#ra-tabs-bar .tp-tab\')[0].classList.add(\'active\');" style="font-size:11px;">Ver Dashboard (' + raState.tests.length + ' pruebas)</button></div>';
    if(errMsgs.length>0) finalMsg += '<div style="font-size:9px;color:var(--tp-red);margin-top:4px;">' + errMsgs.join('<br>') + '</div>';
    prog.innerHTML = finalMsg;
}

async function raSingleImport(){
    const msg=document.getElementById('ra-single-msg');
    const grp={custom:document.getElementById('ra-f-custom').files[0],cycle:document.getElementById('ra-f-cycle').files[0],sample:document.getElementById('ra-f-sample').files[0],details:document.getElementById('ra-f-details').files[0]};
    if(!grp.cycle&&!grp.custom){msg.innerHTML='<span style="color:var(--tp-red)">Se necesita al menos CustomFields o CycleResults</span>';return;}
    try{
        const test=await raProcessGroup(grp);
        raState.tests.push(test);
        raSave();
        raUpdateBadges();
        msg.innerHTML='<span style="color:var(--tp-green)">Importada: ' + (test.vin||'?') + ' — ' + (test.testDesc||test.modelName||'?') + ' (Total: ' + raState.tests.length + ' pruebas)</span>';
    }catch(e){msg.innerHTML='<span style="color:var(--tp-red)">Error: ' + e.message + '</span>';}
}

function raExportAll(){
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(raState.tests,null,2)],{type:'application/json'}));
    a.download='kia_results_'+new Date().toISOString().slice(0,10)+'.json'; a.click();
}

function raImportJSON(){
    const f=document.getElementById('ra-json-import').files[0];
    if(!f) return;
    const r=new FileReader();
    r.onload=function(e){
        try{
            const data=JSON.parse(e.target.result);
            const arr=Array.isArray(data)?data:[];
            raState.tests=raState.tests.concat(arr);raSave();raUpdateBadges();raRender();
            if (typeof fbPostTestImported === 'function') fbPostTestImported(arr.length);
            showToast(arr.length+' pruebas importadas desde JSON', 'success');
        }catch(err){showToast('JSON inválido: '+err.message, 'error');}
    };
    r.readAsText(f);
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M26] RA — PROFILES                                                ║
// ╚══════════════════════════════════════════════════════════════════════╝

function raRenderProfiles(el){
    const allCols=['FuelConsumptionBag','FuelEconomyBag','BagCO','BagCOMass','BagCO2','BagCO2Mass','BagTHC','BagTHCMass','BagCH4','BagCH4Mass','BagNOX','BagNOXMass','BagNMHC','BagNMHCMass','BagHCpNOX','BagHCpNOXMass','BagNMHCpNOX','BagNMHCpNOXMass','BagNMOGpNOX','BagNMOGpNOXMass','DilutePN','DilutePNFlowWeighted','FuelConsumedBag','BagCO2Regulated','BagCORegulated','BagTHCRegulated','BagNOXRegulated','BagNMHCRegulated','BagCH4Regulated','FuelConsumptionRegulatedBag','BagCO2_RCB','BagCO2SDC','DrivenDistance','REESSEnergyChange'];
    // Track which profile is open
    const openIdx = window._raProfileOpen != null ? window._raProfileOpen : -1;

    el.innerHTML=`
    <div class="tp-card">
        <div class="tp-card-title"><span>⚙️ Perfiles de Extracción / Visualización</span>
            <button class="tp-btn tp-btn-primary" onclick="raAddProfile()">+ Nuevo Perfil</button>
        </div>
        <p style="font-size:10px;color:var(--tp-dim);margin-bottom:12px;">Define qué columnas y límites aplican por regulación. El sistema matchea automáticamente al analizar resultados.</p>
        ${raState.profiles.map((p,pi)=>{
            const isOpen = openIdx === pi;
            return `
        <div style="margin-bottom:8px;border:1px solid var(--tp-border);border-radius:8px;overflow:hidden;">
            <div onclick="window._raProfileOpen=${isOpen?-1:pi};raRender();" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;cursor:pointer;background:var(--tp-card);">
                <div><span style="font-weight:700;font-size:12px;color:#06b6d4;">${p.name}</span>
                <span style="font-size:10px;color:var(--tp-dim);margin-left:8px;">${p.regulation}</span></div>
                <div style="display:flex;gap:4px;align-items:center;">
                    <span class="tp-badge" style="background:rgba(6,182,212,0.15);color:#06b6d4;border:1px solid rgba(6,182,212,0.3);font-size:8px;">${p.cycleColumns.length} cols</span>
                    <span class="tp-badge" style="background:rgba(245,158,11,0.15);color:var(--tp-amber);border:1px solid rgba(245,158,11,0.3);font-size:8px;">${Object.keys(p.limits).length} lím</span>
                    <span style="font-size:12px;color:var(--tp-dim);">${isOpen?'▲':'▼'}</span>
                </div>
            </div>
            ${isOpen?`
            <div style="padding:12px 14px;background:#0d1422;border-top:1px solid var(--tp-border);">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                    <div><label style="font-size:10px;color:var(--tp-dim);">Nombre</label><input class="tp-input" value="${p.name}" onchange="raState.profiles[${pi}].name=this.value;raSave();"></div>
                    <div><label style="font-size:10px;color:var(--tp-dim);">Regulaciones (coma-separadas)</label><input class="tp-input" value="${p.regulation}" onchange="raState.profiles[${pi}].regulation=this.value;raSave();"></div>
                </div>

                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <label style="font-size:10px;color:var(--tp-dim);">Columnas de CycleResults</label>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:3px;max-height:160px;overflow-y:auto;margin-top:4px;">
                        ${allCols.map(c=>`<label style="font-size:8px;color:var(--tp-text);display:flex;align-items:center;gap:2px;padding:2px 5px;background:${p.cycleColumns.includes(c)?'rgba(6,182,212,0.15)':'var(--tp-card)'};border-radius:3px;border:1px solid ${p.cycleColumns.includes(c)?'rgba(6,182,212,0.3)':'var(--tp-border)'};cursor:pointer;"><input type="checkbox" ${p.cycleColumns.includes(c)?'checked':''} onchange="raToggleCol(${pi},'${c}',this.checked)" style="width:12px;height:12px;"> ${c}</label>`).join('')}
                    </div>
                </div>

                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <label style="font-size:10px;color:var(--tp-dim);">Agregar variable personalizada</label>
                    </div>
                    <div style="display:flex;gap:5px;align-items:center;">
                        <input class="tp-input" id="ra-custom-col-${pi}" placeholder="NombreDeColumna" style="flex:1;font-size:10px;">
                        <button class="tp-btn tp-btn-primary" onclick="raAddCustomCol(${pi})" style="font-size:10px;">+</button>
                    </div>
                    <p style="font-size:8px;color:var(--tp-dim);margin-top:3px;">Escribe el nombre exacto de la columna del CSV. Se agregara a la lista de columnas disponibles.</p>
                </div>

                <div style="margin-bottom:10px;">
                    <label style="font-size:10px;color:var(--tp-dim);">Unidad de consumo</label>
                    <div style="display:flex;gap:6px;margin-top:4px;">
                        <button class="tp-btn ${(p.fuelUnit||'l100km')==='l100km'?'tp-btn-primary':'tp-btn-ghost'}" onclick="raState.profiles[${pi}].fuelUnit='l100km';raSave();raRender();" style="font-size:9px;">L/100km</button>
                        <button class="tp-btn ${p.fuelUnit==='kml'?'tp-btn-primary':'tp-btn-ghost'}" onclick="raState.profiles[${pi}].fuelUnit='kml';raSave();raRender();" style="font-size:9px;">km/L</button>
                        <button class="tp-btn ${p.fuelUnit==='mpg'?'tp-btn-primary':'tp-btn-ghost'}" onclick="raState.profiles[${pi}].fuelUnit='mpg';raSave();raRender();" style="font-size:9px;">mpg</button>
                    </div>
                </div>

                <div style="margin-bottom:10px;">
                    <label style="font-size:10px;color:var(--tp-dim);">Reportar consumo/FE por fase</label>
                    <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
                        <label style="font-size:9px;color:var(--tp-text);display:flex;align-items:center;gap:3px;cursor:pointer;">
                            <input type="checkbox" ${p.showPhaseFuel?'checked':''} onchange="raState.profiles[${pi}].showPhaseFuel=this.checked;raSave();" style="accent-color:#06b6d4;">
                            Mostrar Fuel en fases individuales (F1-F4)
                        </label>
                    </div>
                    <p style="font-size:8px;color:var(--tp-dim);margin-top:2px;">Aplica para WLTP/Combo con 3-4 fases. Muestra FuelConsumption y FuelEconomy en cada fase.</p>
                </div>

                <div style="margin-bottom:10px;">
                    <label style="font-size:10px;color:var(--tp-dim);">Límites regulatorios</label>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
                        ${p.cycleColumns.filter(c=>c.startsWith('Bag')||c.startsWith('Fuel')||c==='DilutePN'||c.startsWith('BagNMOG')).map(c=>`
                            <div style="display:flex;align-items:center;gap:3px;">
                                <span style="font-size:8px;color:var(--tp-dim);width:60px;">${p.labels&&p.labels[c]||c}:</span>
                                <input class="tp-input" type="number" step="any" value="${p.limits[c]!=null?p.limits[c]:''}" style="width:75px;font-size:10px;" onchange="if(this.value){raState.profiles[${pi}].limits['${c}']=parseFloat(this.value);}else{delete raState.profiles[${pi}].limits['${c}'];}raSave();">
                            </div>`).join('')}
                    </div>
                </div>
                <div style="margin-bottom:10px;">
                    <label style="font-size:10px;color:var(--tp-dim);">Labels personalizados (JSON)</label>
                    <input class="tp-input" value='${JSON.stringify(p.labels||{})}' onchange="try{raState.profiles[${pi}].labels=JSON.parse(this.value);raSave();}catch(e){}" style="font-size:9px;font-family:monospace;">
                </div>
                <button class="tp-btn tp-btn-danger" onclick="if(confirm('¿Eliminar?')){raState.profiles.splice(${pi},1);window._raProfileOpen=-1;raSave();raRender();}" style="font-size:10px;">🗑 Eliminar</button>
            </div>`:''}
        </div>`;
        }).join('')}
    </div>`;
}

function raToggleCol(pi,col,checked){
    const arr=raState.profiles[pi].cycleColumns;
    if(checked&&!arr.includes(col)) arr.push(col);
    if(!checked){const i=arr.indexOf(col);if(i>=0)arr.splice(i,1);}
    raSave();
    // Re-render keeping the same profile open
    raRender();
}

function raAddCustomCol(pi){
    const input=document.getElementById('ra-custom-col-'+pi);
    if(!input||!input.value.trim()) return;
    const colName=input.value.trim();
    if(!raState.profiles[pi].cycleColumns.includes(colName)){
        raState.profiles[pi].cycleColumns.push(colName);
    }
    raSave();raRender();
}

function raConvertFuel(value, fromUnit, toUnit){
    // fromUnit is always l/100km (raw data), toUnit is user preference
    if(!value || typeof value !== 'number' || value===0) return value;
    if(toUnit==='kml') return 100/value; // km/L
    if(toUnit==='mpg') return 235.215/value; // US mpg
    return value; // l/100km
}

function raGetFuelLabel(profile){
    const u = profile && profile.fuelUnit || 'l100km';
    if(u==='kml') return 'km/L';
    if(u==='mpg') return 'mpg';
    return 'L/100km';
}

function raAddProfile(){
    raState.profiles.push({id:'p'+Date.now(),name:'Nuevo Perfil',regulation:'',testMode:'WLTP',
        cycleColumns:['FuelConsumptionBag','BagCO','BagCO2','BagTHC','BagNOX'],
        sampleColumns:['FuelConsumptionBag','BagCO','BagCO2'],limits:{},labels:{},
        fuelUnit:'l100km',showPhaseFuel:false});
    window._raProfileOpen=raState.profiles.length-1;
    raSave();raRender();
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M27] RA — TRENDS                                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

function raRenderTrends(el){
    if(raState.tests.length<2){el.innerHTML='<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">Necesitas al menos 2 pruebas.</div>';return;}
    const fGroupBy=window._raTrendGroupBy||'regTestMode';
    const fGroup=window._raTrendGroup||'ALL';
    const fMetric=window._raTrendMetric||'FuelConsumptionBag';

    let groupFn;
    if(fGroupBy==='regTestMode') groupFn=t=>`${t.emissionReg||t.regSpec||'?'} ${t.testType||'?'}`;
    else if(fGroupBy==='testDesc') groupFn=t=>t.testDesc||t.modelName||'?';
    else groupFn=t=>`${t.emissionReg||'?'} ${t.testType||'?'}`;

    const groups=[...new Set(raState.tests.map(groupFn))].sort();
    const filtered=fGroup==='ALL'?raState.tests:raState.tests.filter(t=>groupFn(t)===fGroup);
    const pts=filtered.filter(t=>t.cycleData&&t.cycleData.length>0).map(t=>{
        const l=t.cycleData[t.cycleData.length-1];
        return {val:l[fMetric],vin:t.vin,model:t.testDesc,id:t.id,date:t.dateStr,num:t.testNumber,group:groupFn(t)};
    }).filter(p=>p.val!==undefined&&!isNaN(p.val));

    const avgV=pts.length>0?(pts.reduce((s,p)=>s+p.val,0)/pts.length):0;
    const stdV=pts.length>1?Math.sqrt(pts.reduce((s,p)=>s+Math.pow(p.val-avgV,2),0)/(pts.length-1)):0;
    const ucl=avgV+3*stdV, lcl=Math.max(0,avgV-3*stdV);
    const warn2s=avgV+2*stdV, warn2sL=Math.max(0,avgV-2*stdV);
    const pr=raGetProfile(filtered[0]||{}); const lim=pr?pr.limits[fMetric]:null;
    const metricOpts=['FuelConsumptionBag','FuelEconomyBag','BagCO','BagCO2','BagTHC','BagNOX','BagNMHC','BagCH4','BagNMHCpNOX','DilutePN'];
    const groupByOpts=[{v:'regTestMode',l:'Regulacion+TestMode'},{v:'testDesc',l:'Test Description'}];

    // Destroy previous chart if exists
    if(window._raTrendChart){ try{window._raTrendChart.destroy();}catch(e){} window._raTrendChart=null; }

    el.innerHTML=`
    <div class="tp-card">
        <div class="tp-card-title"><span>Tendencias & Control</span></div>
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            <select class="tp-select" onchange="window._raTrendGroupBy=this.value;window._raTrendGroup='ALL';raRender();" style="font-size:10px;">
                ${groupByOpts.map(o=>`<option value="${o.v}" ${o.v===fGroupBy?'selected':''}>Agrupar: ${o.l}</option>`).join('')}
            </select>
            <select class="tp-select" onchange="window._raTrendGroup=this.value;raRender();" style="font-size:10px;">
                <option value="ALL">Todos</option>
                ${groups.map(g=>`<option value="${g}" ${g===fGroup?'selected':''}>${g}</option>`).join('')}
            </select>
            <select class="tp-select" onchange="window._raTrendMetric=this.value;raRender();" style="font-size:10px;">
                ${metricOpts.map(m=>`<option value="${m}" ${m===fMetric?'selected':''}>${m}</option>`).join('')}
            </select>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px;">
            <div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:var(--tp-amber);font-size:15px;">${avgV.toFixed(4)}</div><div class="tp-metric-label">x&#772;</div></div>
            <div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:var(--tp-blue);font-size:15px;">${stdV.toFixed(4)}</div><div class="tp-metric-label">&sigma;</div></div>
            <div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:#8b5cf6;font-size:15px;">${ucl.toFixed(4)}</div><div class="tp-metric-label">UCL (3&sigma;)</div></div>
            ${lim?`<div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:var(--tp-red);font-size:15px;">${lim}</div><div class="tp-metric-label">Limite</div></div>`:''}
            <div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:#06b6d4;font-size:15px;">${pts.length}</div><div class="tp-metric-label">N</div></div>
            <div class="tp-metric" style="flex:1"><div class="tp-metric-val" style="color:${pts.filter(p=>Math.abs(p.val-avgV)>2*stdV).length>0?'var(--tp-red)':'var(--tp-green)'};font-size:15px;">${pts.filter(p=>Math.abs(p.val-avgV)>2*stdV).length}</div><div class="tp-metric-label">>2&sigma;</div></div>
        </div>
        <details style="margin-bottom:10px;border:1px solid var(--tp-border);border-radius:8px;overflow:hidden;" ${window._raChartSettingsOpen?'open':''}>
            <summary onclick="window._raChartSettingsOpen=this.parentElement.open?false:true;" style="padding:8px 12px;cursor:pointer;font-size:10px;font-weight:700;color:var(--tp-dim);background:var(--tp-card);user-select:none;">⚙️ Ajustes del Gráfico</summary>
            <div style="padding:10px 12px;background:#0d1320;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div style="grid-column:1/-1;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <label style="font-size:10px;color:var(--tp-dim);">Altura: <strong id="ra-height-val" style="color:var(--tp-amber);">${window._raChartHeight||320}px</strong></label>
                        <button onclick="raChartAutoFit()" class="tp-btn tp-btn-primary" style="font-size:9px;padding:3px 10px;">Auto-fit</button>
                    </div>
                    <input type="range" min="200" max="600" step="20" value="${window._raChartHeight||320}" oninput="raChartSetHeight(+this.value)" style="width:100%;accent-color:var(--tp-amber);">
                </div>
                <div>
                    <label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Eje Y mínimo</label>
                    <input type="number" step="any" id="ra-ymin-input" class="tp-input" placeholder="Auto" value="${window._raChartYMin!==null&&window._raChartYMin!==undefined?window._raChartYMin:''}" onchange="raChartSetYRange(this.value===''?null:+this.value,null,'min')" style="width:100%;font-size:11px;">
                </div>
                <div>
                    <label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Eje Y máximo</label>
                    <input type="number" step="any" id="ra-ymax-input" class="tp-input" placeholder="Auto" value="${window._raChartYMax!==null&&window._raChartYMax!==undefined?window._raChartYMax:''}" onchange="raChartSetYRange(null,this.value===''?null:+this.value,'max')" style="width:100%;font-size:11px;">
                </div>
            </div>
        </details>
        <div id="ra-trend-wrapper" style="position:relative;height:${window._raChartHeight||320}px;">
            ${pts.length===0?`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;color:var(--tp-dim);"><div style="font-size:28px;margin-bottom:8px;">📉</div><div style="font-size:12px;font-weight:700;">Sin datos para "${fMetric}"</div><div style="font-size:10px;margin-top:4px;">Verifica que las pruebas tengan cycleData con este campo.<br>Si hay pruebas importadas, asegurate de que no se haya compactado la data.</div></div>`:'<canvas id="ra-trend-canvas"></canvas>'}
        </div>
    </div>
    <div class="tp-card"><div class="tp-card-title"><span>Datos</span></div>
        <div style="max-height:250px;overflow-y:auto;"><table class="tp-table"><thead><tr><th>#</th><th>VIN</th><th>Grupo</th><th style="text-align:right">${fMetric}</th><th>vs Lim</th></tr></thead>
        <tbody>${pts.slice(-40).reverse().map((p,i)=>`<tr><td style="color:var(--tp-dim)">${pts.length-i}</td><td style="font-family:monospace;font-size:9px;color:var(--tp-amber);">${p.vin||'---'}</td><td style="font-size:9px">${p.group||'---'}</td><td style="text-align:right;font-family:monospace;font-weight:700;${Math.abs(p.val-avgV)>2*stdV?'color:var(--tp-red);':''}${Math.abs(p.val-avgV)>3*stdV?'background:rgba(239,68,68,0.1);':''}">${p.val.toFixed(4)}${Math.abs(p.val-avgV)>2*stdV?' !':''}${Math.abs(p.val-avgV)>3*stdV?' !!':''}</td><td>${lim?`<span style="color:${Math.abs(p.val)>lim?'var(--tp-red)':'var(--tp-green)'};">${((p.val/lim)*100).toFixed(0)}%</span>`:'---'}</td></tr>`).join('')}</tbody></table></div>
    </div>`;

    // Build Chart.js scatter plot with control lines
    const canvas = document.getElementById('ra-trend-canvas');
    if(!canvas || typeof Chart === 'undefined' || pts.length === 0) return;

    const labels = pts.map((p,i) => p.date || String(i+1));
    const dataValues = pts.map(p => p.val);
    const pointColors = pts.map(p => {
        if(lim && Math.abs(p.val) > lim) return '#ef4444';
        if(p.val > ucl || p.val < lcl) return '#8b5cf6';
        if(Math.abs(p.val - avgV) > 2*stdV) return '#f59e0b';
        return '#10b981';
    });
    const pointSizes = pts.map(p => {
        if(lim && Math.abs(p.val) > lim) return 6;
        if(Math.abs(p.val - avgV) > 2*stdV) return 5;
        return 4;
    });

    const datasets = [
        { label: fMetric, data: dataValues, borderColor: '#3b82f6', backgroundColor: pointColors,
          pointBackgroundColor: pointColors, pointRadius: pointSizes, pointHoverRadius: 8,
          borderWidth: 1.5, fill: false, tension: 0.1, order: 1 },
        { label: 'x\u0304 (Media)', data: Array(pts.length).fill(avgV),
          borderColor: '#f59e0b', borderWidth: 2, borderDash: [], pointRadius: 0, fill: false, order: 2 },
        { label: 'UCL (3\u03C3)', data: Array(pts.length).fill(ucl),
          borderColor: '#8b5cf6', borderWidth: 1.5, borderDash: [6,3], pointRadius: 0, fill: false, order: 3 },
        { label: 'LCL (3\u03C3)', data: Array(pts.length).fill(lcl),
          borderColor: '#8b5cf6', borderWidth: 1.5, borderDash: [6,3], pointRadius: 0, fill: false, order: 4 },
        { label: 'Warning (2\u03C3)', data: Array(pts.length).fill(warn2s),
          borderColor: '#f59e0b', borderWidth: 1, borderDash: [3,3], pointRadius: 0, fill: false, order: 5 },
        { label: 'Warning -2\u03C3', data: Array(pts.length).fill(warn2sL),
          borderColor: '#f59e0b', borderWidth: 1, borderDash: [3,3], pointRadius: 0, fill: false, order: 6 },
    ];
    if(lim) {
        datasets.push({ label: 'Limite regulatorio', data: Array(pts.length).fill(lim),
          borderColor: '#ef4444', borderWidth: 2, borderDash: [8,4], pointRadius: 0, fill: false, order: 0 });
    }

    window._raTrendChart = new Chart(canvas, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'bottom',
                    labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 12, padding: 8,
                        filter: function(item) { return item.text !== 'Warning -2\u03C3'; }
                    }
                },
                tooltip: {
                    backgroundColor: '#1e293b', titleColor: '#e2e8f0', bodyColor: '#94a3b8',
                    callbacks: {
                        title: function(ctx) {
                            const i = ctx[0].dataIndex;
                            return pts[i] ? (pts[i].vin || 'N/A') + ' - ' + (pts[i].date || '') : '';
                        },
                        label: function(ctx) {
                            if(ctx.datasetIndex === 0) {
                                const p = pts[ctx.dataIndex];
                                const sigma = stdV > 0 ? ((p.val - avgV)/stdV).toFixed(1) : '0';
                                let line = fMetric + ': ' + p.val.toFixed(4) + ' (' + sigma + '\u03C3)';
                                if(lim) line += ' | ' + ((p.val/lim)*100).toFixed(0) + '% del limite';
                                return line;
                            }
                            return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(4);
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 8 }, maxRotation: 45, maxTicksLimit: 15 },
                     grid: { color: 'rgba(30,41,59,0.5)' } },
                y: { min: window._raChartYMin !== null && window._raChartYMin !== undefined ? window._raChartYMin : undefined,
                     max: window._raChartYMax !== null && window._raChartYMax !== undefined ? window._raChartYMax : undefined,
                     ticks: { color: '#64748b', font: { size: 9 } },
                     grid: { color: 'rgba(30,41,59,0.5)' } }
            }
        }
    });
}

// ── Chart adjustment helpers (live update without re-render) ──
function raChartSetHeight(val) {
    window._raChartHeight = val;
    var wrapper = document.getElementById('ra-trend-wrapper');
    if (wrapper) wrapper.style.height = val + 'px';
    var label = document.getElementById('ra-height-val');
    if (label) label.textContent = val + 'px';
    if (window._raTrendChart) window._raTrendChart.resize();
}

function raChartSetYRange(minVal, maxVal, which) {
    if (which === 'min') window._raChartYMin = minVal;
    if (which === 'max') window._raChartYMax = maxVal;
    if (!window._raTrendChart) return;
    var yScale = window._raTrendChart.options.scales.y;
    if (which === 'min') yScale.min = minVal !== null ? minVal : undefined;
    if (which === 'max') yScale.max = maxVal !== null ? maxVal : undefined;
    window._raTrendChart.update();
}

function raChartAutoFit() {
    if (!window._raTrendChart) return;
    var ds = window._raTrendChart.data.datasets;
    var allVals = [];
    ds.forEach(function(d) { d.data.forEach(function(v) { if (v !== null && v !== undefined && !isNaN(v)) allVals.push(v); }); });
    if (allVals.length === 0) return;
    var dataMin = Math.min.apply(null, allVals);
    var dataMax = Math.max.apply(null, allVals);
    var range = dataMax - dataMin;
    var padding = range > 0 ? range * 0.10 : Math.abs(dataMax) * 0.10 || 0.1;
    var yMin = Math.max(0, dataMin - padding);
    var yMax = dataMax + padding;
    // Round to reasonable precision
    var decimals = range < 1 ? 4 : range < 10 ? 2 : 0;
    yMin = parseFloat(yMin.toFixed(decimals));
    yMax = parseFloat(yMax.toFixed(decimals));
    window._raChartYMin = yMin;
    window._raChartYMax = yMax;
    window._raChartHeight = 320;
    // Update inputs
    var minInput = document.getElementById('ra-ymin-input');
    var maxInput = document.getElementById('ra-ymax-input');
    if (minInput) minInput.value = yMin;
    if (maxInput) maxInput.value = yMax;
    // Update chart
    var yScale = window._raTrendChart.options.scales.y;
    yScale.min = yMin;
    yScale.max = yMax;
    window._raTrendChart.update();
    // Reset height
    raChartSetHeight(320);
}

function raRenderDetail(el){
    const tid=window._raDetailId;
    const test=tid?raState.tests.find(t=>String(t.id)===String(tid)):raState.tests[raState.tests.length-1];
    if(!test){el.innerHTML='<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">Selecciona una prueba desde Dashboard.</div>';return;}

    const profile=raGetProfile(test);
    const cols=profile?profile.cycleColumns:['FuelConsumptionBag','BagCO','BagCO2','BagTHC','BagNOX'];
    const lims=profile?profile.limits:{};
    const lbls=profile?profile.labels:{};
    const phases=test.sampleData||[];
    const comp=test.cycleData&&test.cycleData.length>0?test.cycleData[test.cycleData.length-1]:{};
    const fuelUnit=profile&&profile.fuelUnit||'l100km';
    const fuelLabel=raGetFuelLabel(profile);
    const isFuelCol=c=>c==='FuelConsumptionBag'||c==='FuelEconomyBag'||c==='FuelConsumedBag'||c==='FuelConsumptionRegulatedBag';

    function fmtVal(c,v){
        if(v==null||typeof v!=='number') return v||'—';
        if(isFuelCol(c)&&(c==='FuelConsumptionBag'||c==='FuelConsumptionRegulatedBag')){
            const converted=raConvertFuel(v,'l100km',fuelUnit);
            return Math.abs(converted)>1e6?converted.toExponential(2):converted.toFixed(fuelUnit==='l100km'?4:2);
        }
        return Math.abs(v)>1e6?v.toExponential(2):v.toFixed(4);
    }
    function colLabel(c){
        if(isFuelCol(c)&&(c==='FuelConsumptionBag'||c==='FuelConsumptionRegulatedBag')){
            if(fuelUnit==='kml') return lbls[c]?lbls[c].replace(/l\/100km|L\/100km/i,'km/L'):'Consumo ('+fuelLabel+')';
            if(fuelUnit==='mpg') return lbls[c]?lbls[c].replace(/l\/100km|L\/100km/i,'mpg'):'Consumo ('+fuelLabel+')';
        }
        return lbls[c]||c;
    }

    const _hasReturnCtx = typeof window._tpReturnContext !== 'undefined' && window._tpReturnContext !== null;

    // Build per-phase fuel rows if enabled
    const showPhaseFuel = profile && profile.showPhaseFuel && phases.length >= 2;
    let phaseFuelHtml = '';
    if(showPhaseFuel){
        const fuelCols = ['FuelConsumptionBag','FuelEconomyBag'].filter(c=>cols.includes(c)||phases.some(ph=>ph[c]!=null));
        if(fuelCols.length>0){
            phaseFuelHtml = `<div class="tp-card">
                <div class="tp-card-title"><span>⛽ Consumo por Fase</span><span style="font-size:9px;color:var(--tp-dim);margin-left:8px;">Unidad: ${fuelLabel}</span></div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;">
                    ${phases.map((ph,i)=>{
                        const fc=ph['FuelConsumptionBag'];
                        const dispVal=fc!=null?fmtVal('FuelConsumptionBag',fc):'—';
                        const fe=ph['FuelEconomyBag'];
                        return `<div class="tp-metric" style="border-color:rgba(6,182,212,0.3);">
                            <div class="tp-metric-val" style="color:#06b6d4;font-size:14px;">${dispVal}</div>
                            <div class="tp-metric-label">Fase ${i+1} (${fuelLabel})</div>
                            ${fe!=null?`<div style="font-size:8px;color:var(--tp-dim);">FE: ${fe.toFixed(2)}</div>`:''}
                        </div>`;
                    }).join('')}
                    <div class="tp-metric" style="border-color:rgba(245,158,11,0.3);">
                        <div class="tp-metric-val" style="color:var(--tp-amber);font-size:14px;">${comp['FuelConsumptionBag']!=null?fmtVal('FuelConsumptionBag',comp['FuelConsumptionBag']):'—'}</div>
                        <div class="tp-metric-label">Composite (${fuelLabel})</div>
                        ${comp['FuelEconomyBag']!=null?`<div style="font-size:8px;color:var(--tp-dim);">FE: ${comp['FuelEconomyBag'].toFixed(2)}</div>`:''}
                    </div>
                </div>
            </div>`;
        }
    }

    el.innerHTML=`
    ${_hasReturnCtx ? `<div style="margin-bottom:8px;"><button class="tp-btn tp-btn-ghost" onclick="if(typeof tpReturnFromRA==='function')tpReturnFromRA();" style="font-size:11px;color:var(--tp-amber);border:1px solid var(--tp-amber);padding:5px 14px;">← Volver a Test Plan</button></div>` : ''}
    <div class="tp-card" style="border-color:#06b6d4;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
            <div>
                <h3 style="font-size:14px;color:#06b6d4;margin-bottom:4px;">${test.testDesc||test.vehicleName||'Prueba'}</h3>
                <span style="font-size:11px;color:var(--tp-dim);">VIN: <span style="color:var(--tp-amber);font-family:monospace;">${test.vin||'—'}</span></span>
            </div>
            <div style="text-align:right;">
                <span class="tp-badge" style="background:rgba(16,185,129,0.15);color:var(--tp-green);border:1px solid rgba(16,185,129,0.3);">${test.testStatus||'?'}</span>
                ${profile?`<span class="tp-badge" style="background:rgba(139,92,246,0.15);color:#8b5cf6;border:1px solid rgba(139,92,246,0.3);margin-left:4px;">Perfil: ${profile.name}</span>`:''}
                <span style="font-size:8px;color:var(--tp-dim);display:block;margin-top:2px;">Consumo: ${fuelLabel}</span>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px;margin-top:8px;font-size:10px;color:var(--tp-dim);">
            <div><strong>Modelo:</strong> ${test.modelName||'—'}</div>
            <div><strong>Regulación:</strong> ${test.emissionReg||test.regSpec||'—'}</div>
            <div><strong>Categoría:</strong> ${test.testCategory||'—'}</div>
            <div><strong>Motor:</strong> ${test.engineCapacity||'—'}</div>
            <div><strong>TX:</strong> ${test.transmission||'—'}</div>
            <div><strong>Región:</strong> ${test.region||test.regulationRegion||'—'}</div>
            <div><strong>Combustible:</strong> ${test.fuelType||'—'}</div>
            <div><strong>Masa:</strong> ${test.testMass||'—'} kg</div>
            <div><strong>Operador:</strong> ${test.operator||'—'}</div>
            <div><strong>Conductor:</strong> ${test.driver||'—'}</div>
            <div><strong>Odo:</strong> ${test.startMileage||'—'}→${test.endMileage||'—'} km</div>
            <div><strong>Test #:</strong> ${test.testNumber||'—'} (año: ${test.yearlyTestNumber||'—'})</div>
        </div>
    </div>

    <div class="tp-card">
        <div class="tp-card-title"><span>🏁 Resultados Composite</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;">
            ${cols.map(c=>{
                const v=comp[c]; const lm=lims[c];
                const dispV=fmtVal(c,v);
                const absV=isFuelCol(c)&&v?Math.abs(raConvertFuel(v,'l100km',fuelUnit)):v?Math.abs(v):0;
                const pct=lm&&v?(Math.abs(v)/lm*100):null;
                const over=lm&&v&&Math.abs(v)>lm;
                return `<div class="tp-metric" style="border-color:${over?'var(--tp-red)':pct&&pct>80?'var(--tp-amber)':'var(--tp-border)'};">
                    <div class="tp-metric-val" style="color:${over?'var(--tp-red)':'var(--tp-text)'};font-size:13px;">${dispV}</div>
                    <div class="tp-metric-label">${colLabel(c)}</div>
                    ${lm?`<div style="margin-top:3px;"><div class="tp-bar" style="height:8px;"><div class="tp-bar-fill" style="width:${Math.min(pct||0,100)}%;background:${over?'var(--tp-red)':pct>80?'var(--tp-amber)':'var(--tp-green)'};"></div><span class="tp-bar-text" style="font-size:6px;">${pct?pct.toFixed(0):'0'}%</span></div><div style="font-size:6px;color:var(--tp-dim);text-align:center;">Lím: ${lm}</div></div>`:''}
                </div>`;
            }).join('')}
        </div>
    </div>

    ${phaseFuelHtml}

    ${phases.length>0?`
    <div class="tp-card">
        <div class="tp-card-title"><span>📊 Por Fase</span></div>
        <div style="overflow-x:auto;">
            <table class="tp-table">
                <thead><tr><th>Fase</th>${cols.map(c=>`<th style="text-align:right;font-size:8px;">${colLabel(c)}</th>`).join('')}</tr></thead>
                <tbody>
                    ${phases.map((ph,i)=>`<tr>
                        <td style="font-weight:700;color:#06b6d4;">F${i+1}</td>
                        ${cols.map(c=>{const v=ph[c];const lm=lims[c];return `<td style="text-align:right;font-family:monospace;font-size:9px;color:${lm&&v&&Math.abs(v)>lm?'var(--tp-red)':'var(--tp-text)'};">${fmtVal(c,v)}</td>`;}).join('')}
                    </tr>`).join('')}
                    <tr style="font-weight:700;border-top:2px solid var(--tp-border);">
                        <td style="color:var(--tp-amber);">COMP</td>
                        ${cols.map(c=>{const v=comp[c];return `<td style="text-align:right;font-family:monospace;font-size:9px;color:var(--tp-amber);">${fmtVal(c,v)}</td>`;}).join('')}
                    </tr>
                </tbody>
            </table>
        </div>
    </div>`:''}

    <div class="tp-card" style="margin-top:10px;">
        <div class="tp-card-title"><span>🔍 Seleccionar Prueba</span></div>
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
            <input class="tp-input" id="ra-detail-search" placeholder="Buscar VIN, modelo, regulacion..." oninput="raFilterDetailDropdown()" value="${window._raDetailSearch||''}" style="flex:1;min-width:150px;font-size:11px;">
            <div>
                <label style="font-size:8px;color:var(--tp-dim);">Desde</label>
                <input type="date" class="tp-input" id="ra-detail-from" value="${window._raDetailFrom||''}" onchange="window._raDetailFrom=this.value;raFilterDetailDropdown();" style="font-size:10px;">
            </div>
            <div>
                <label style="font-size:8px;color:var(--tp-dim);">Hasta</label>
                <input type="date" class="tp-input" id="ra-detail-to" value="${window._raDetailTo||''}" onchange="window._raDetailTo=this.value;raFilterDetailDropdown();" style="font-size:10px;">
            </div>
            <button class="tp-btn tp-btn-ghost" onclick="window._raDetailSearch='';window._raDetailFrom='';window._raDetailTo='';raFilterDetailDropdown();document.getElementById('ra-detail-search').value='';" style="font-size:9px;">Limpiar</button>
        </div>
        <select class="tp-select" id="ra-detail-select" onchange="window._raDetailId=this.value;raRender();" style="width:100%;font-size:11px;">
            ${raState.tests.slice().sort((a,b)=>{
                const da=a.dateStr||a.importedAt||'';
                const db2=b.dateStr||b.importedAt||'';
                return da.localeCompare(db2);
            }).map(x=>{
                const dt=x.dateStr||(x.importedAt?x.importedAt.slice(0,10):'')||'';
                return '<option value="'+x.id+'" '+(String(x.id)===String(tid)?'selected':'')+'>'+dt+' | '+(x.vin||'NoVIN')+' — '+(x.testDesc||'?')+' #'+(x.testNumber||'?')+'</option>';
            }).join('')}
        </select>
    </div>`;
}

function raFilterDetailDropdown(){
    var search=(document.getElementById('ra-detail-search')||{}).value||'';
    window._raDetailSearch=search;
    var from=window._raDetailFrom||'';
    var to=window._raDetailTo||'';
    var sel=document.getElementById('ra-detail-select');
    if(!sel)return;
    var q=search.toLowerCase();
    var sorted=raState.tests.slice().sort(function(a,b){
        var da=a.dateStr||a.importedAt||'';
        var db2=b.dateStr||b.importedAt||'';
        return da.localeCompare(db2);
    });
    sel.innerHTML=sorted.filter(function(x){
        var dt=x.dateStr||(x.importedAt?x.importedAt.slice(0,10):'')||'';
        if(from&&dt<from)return false;
        if(to&&dt>to)return false;
        if(q){
            var hay=(x.vin||'').toLowerCase().includes(q)||(x.testDesc||'').toLowerCase().includes(q)||(x.emissionReg||'').toLowerCase().includes(q)||(x.modelName||'').toLowerCase().includes(q);
            if(!hay)return false;
        }
        return true;
    }).map(function(x){
        var dt=x.dateStr||(x.importedAt?x.importedAt.slice(0,10):'')||'';
        return '<option value="'+x.id+'">'+dt+' | '+(x.vin||'NoVIN')+' — '+(x.testDesc||'?')+' #'+(x.testNumber||'?')+'</option>';
    }).join('');
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M28] RA — PROCESS CAPABILITY (Cpk / Ppk)                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

function raRenderCapability(el) {
    if (raState.tests.length < 5) {
        el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">Necesitas al menos 5 pruebas con limites definidos en Perfiles para calcular Cpk/Ppk.</div>';
        return;
    }

    var selGroupBy = window._raCpkGroupBy || 'regTestMode';
    var selGroup = window._raCpkGroup || 'ALL';

    var groupFn;
    if (selGroupBy === 'regTestMode') groupFn = function(t){ return (t.emissionReg||t.regSpec||'?') + ' ' + (t.testType||'?'); };
    else groupFn = function(t){ return t.testDesc || t.modelName || '?'; };

    var groups = [...new Set(raState.tests.map(groupFn))].sort();
    var filtered = selGroup === 'ALL' ? raState.tests : raState.tests.filter(function(t){ return groupFn(t) === selGroup; });
    var groupByOpts = [{v:'regTestMode',l:'Regulacion+TestMode'},{v:'testDesc',l:'Test Description'}];

    // Find applicable profile
    var refTest = filtered.find(function(t){ return t.emissionReg || t.regSpec; }) || filtered[0] || {};
    var profile = raGetProfile(refTest);
    if (!profile || !profile.limits || Object.keys(profile.limits).length === 0) {
        el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">No hay limites regulatorios definidos para este grupo. Configura limites en Perfiles.</div>';
        return;
    }

    // Calculate Cpk/Ppk for each metric that has a limit
    var metrics = Object.keys(profile.limits);
    var results = [];

    metrics.forEach(function(metric) {
        var USL = profile.limits[metric]; // Upper Specification Limit
        var LSL = 0; // Lower spec is 0 for emissions (can't be negative)

        // Extract values for this metric
        var vals = [];
        filtered.forEach(function(t) {
            if (!t.cycleData || t.cycleData.length === 0) return;
            var last = t.cycleData[t.cycleData.length - 1];
            var v = last[metric];
            if (v !== undefined && !isNaN(v) && isFinite(v)) vals.push(parseFloat(v));
        });

        if (vals.length < 2) return;

        var n = vals.length;
        var mean = vals.reduce(function(s,v){ return s+v; }, 0) / n;

        // Overall std dev (s) for Pp/Ppk
        var variance = vals.reduce(function(s,v){ return s + Math.pow(v - mean, 2); }, 0) / (n - 1);
        var stdDev = Math.sqrt(variance);

        // Moving Range (mR) method for Cp/Cpk per AIAG SPC Manual
        // sigma_within = mR_bar / d2, where d2=1.128 for subgroup size 2
        var mRsum = 0;
        for (var i = 1; i < vals.length; i++) mRsum += Math.abs(vals[i] - vals[i - 1]);
        var mRbar = mRsum / (vals.length - 1);
        var d2 = 1.128; // constant for n=2 (moving range of 2 consecutive points)
        var sigmaWithin = mRbar / d2;

        // Pp/Ppk use overall std dev (long-term capability)
        var Pp = stdDev > 0 ? (USL - LSL) / (6 * stdDev) : 999;
        var Ppu = stdDev > 0 ? (USL - mean) / (3 * stdDev) : 999;
        var Ppl = stdDev > 0 ? (mean - LSL) / (3 * stdDev) : 999;
        var Ppk = Math.min(Ppu, Ppl);

        // Cp/Cpk use within-subgroup variation (short-term capability, mR method)
        var Cp = sigmaWithin > 0 ? (USL - LSL) / (6 * sigmaWithin) : 999;
        var Cpu = sigmaWithin > 0 ? (USL - mean) / (3 * sigmaWithin) : 999;
        var Cpl = sigmaWithin > 0 ? (mean - LSL) / (3 * sigmaWithin) : 999;
        var Cpk = Math.min(Cpu, Cpl);

        // % of spec used
        var pctSpec = USL > 0 ? (mean / USL * 100) : 0;

        // Expected PPM out of spec (using normal distribution approximation)
        var z = stdDev > 0 ? (USL - mean) / stdDev : 99;
        var ppmEstimate = z > 0 ? Math.round(raPhiComplement(z) * 1000000) : 500000;

        // Rating
        var rating, ratingColor;
        if (Cpk >= 1.67) { rating = 'Excelente'; ratingColor = '#10b981'; }
        else if (Cpk >= 1.33) { rating = 'Capaz'; ratingColor = '#3b82f6'; }
        else if (Cpk >= 1.0) { rating = 'Marginal'; ratingColor = '#f59e0b'; }
        else { rating = 'No capaz'; ratingColor = '#ef4444'; }

        results.push({
            metric: metric,
            label: (profile.labels && profile.labels[metric]) || metric,
            n: n, mean: mean, std: stdDev, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals),
            USL: USL, LSL: LSL,
            Cp: Cp, Cpk: Cpk, Pp: Pp, Ppk: Ppk,
            pctSpec: pctSpec, ppm: ppmEstimate,
            rating: rating, ratingColor: ratingColor
        });
    });

    results.sort(function(a,b) { return a.Cpk - b.Cpk; }); // worst first

    // Render
    var html = '<div class="tp-card">';
    html += '<div class="tp-card-title"><span>Process Capability - Cpk / Ppk</span></div>';
    html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
    html += '<select class="tp-select" onchange="window._raCpkGroupBy=this.value;window._raCpkGroup=\'ALL\';raRender();" style="font-size:10px;">';
    groupByOpts.forEach(function(o) { html += '<option value="'+o.v+'" '+(o.v===selGroupBy?'selected':'')+'>Agrupar: '+o.l+'</option>'; });
    html += '</select>';
    html += '<select class="tp-select" onchange="window._raCpkGroup=this.value;raRender();" style="font-size:10px;">';
    html += '<option value="ALL">Todos</option>';
    groups.forEach(function(g) { html += '<option value="'+g+'" '+(g===selGroup?'selected':'')+'>'+g+'</option>'; });
    html += '</select></div>';

    // Reference guide
    html += '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;font-size:9px;">';
    html += '<span style="padding:3px 8px;border-radius:4px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);color:#10b981;">Cpk >= 1.67: Excelente</span>';
    html += '<span style="padding:3px 8px;border-radius:4px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:#3b82f6;">Cpk >= 1.33: Capaz</span>';
    html += '<span style="padding:3px 8px;border-radius:4px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;">Cpk >= 1.0: Marginal</span>';
    html += '<span style="padding:3px 8px;border-radius:4px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;">Cpk < 1.0: No capaz</span>';
    html += '</div>';

    if (profile) {
        html += '<div style="font-size:10px;color:var(--tp-dim);margin-bottom:10px;">Perfil: <strong style="color:#8b5cf6;">' + profile.name + '</strong> | ' + filtered.length + ' pruebas analizadas</div>';
    }

    if (results.length === 0) {
        html += '<div style="text-align:center;padding:30px;color:var(--tp-dim);">No hay datos suficientes para las metricas con limites definidos.</div>';
    } else {
        // Summary metrics
        var worstCpk = results[0];
        var avgCpk = results.reduce(function(s,r){ return s+r.Cpk; },0) / results.length;
        var capable = results.filter(function(r){ return r.Cpk >= 1.33; }).length;

        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:6px;margin-bottom:14px;">';
        html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">' + results.length + '</div><div class="tp-metric-label">Metricas</div></div>';
        html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (capable === results.length ? '#10b981' : '#f59e0b') + '">' + capable + '/' + results.length + '</div><div class="tp-metric-label">Capaces</div></div>';
        html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (avgCpk >= 1.33 ? '#10b981' : avgCpk >= 1.0 ? '#f59e0b' : '#ef4444') + '">' + avgCpk.toFixed(2) + '</div><div class="tp-metric-label">Cpk Promedio</div></div>';
        html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + worstCpk.ratingColor + '">' + worstCpk.Cpk.toFixed(2) + '</div><div class="tp-metric-label">Peor Cpk (' + worstCpk.label + ')</div></div>';
        html += '</div>';

        // Detailed table
        html += '<div style="overflow-x:auto;"><table class="tp-table" style="width:100%;">';
        html += '<thead><tr><th>Metrica</th><th>N</th><th style="text-align:right">x&#772;</th><th style="text-align:right">&sigma;</th><th style="text-align:right">Min</th><th style="text-align:right">Max</th><th style="text-align:right">USL</th><th style="text-align:right">% Spec</th><th style="text-align:right;font-weight:800;">Cpk</th><th style="text-align:right;">Ppk</th><th style="text-align:right;">PPM est.</th><th>Evaluacion</th></tr></thead>';
        html += '<tbody>';
        results.forEach(function(r) {
            html += '<tr>';
            html += '<td style="font-weight:700;font-size:10px;">' + r.label + '</td>';
            html += '<td>' + r.n + '</td>';
            html += '<td style="text-align:right;font-family:monospace;font-size:10px;">' + r.mean.toFixed(4) + '</td>';
            html += '<td style="text-align:right;font-family:monospace;font-size:10px;">' + r.std.toFixed(4) + '</td>';
            html += '<td style="text-align:right;font-family:monospace;font-size:10px;color:var(--tp-dim);">' + r.min.toFixed(4) + '</td>';
            html += '<td style="text-align:right;font-family:monospace;font-size:10px;color:var(--tp-dim);">' + r.max.toFixed(4) + '</td>';
            html += '<td style="text-align:right;font-family:monospace;font-size:10px;color:var(--tp-red);">' + r.USL + '</td>';
            html += '<td style="text-align:right;"><div class="tp-bar" style="width:60px;display:inline-flex;"><div class="tp-bar-fill" style="width:' + Math.min(r.pctSpec, 100) + '%;background:' + (r.pctSpec > 80 ? '#ef4444' : r.pctSpec > 60 ? '#f59e0b' : '#10b981') + ';"></div><span class="tp-bar-text" style="font-size:7px;">' + r.pctSpec.toFixed(0) + '%</span></div></td>';
            html += '<td style="text-align:right;font-weight:800;font-size:13px;color:' + r.ratingColor + ';">' + r.Cpk.toFixed(2) + '</td>';
            html += '<td style="text-align:right;font-family:monospace;font-size:10px;">' + r.Ppk.toFixed(2) + '</td>';
            html += '<td style="text-align:right;font-family:monospace;font-size:9px;color:' + (r.ppm > 1000 ? 'var(--tp-red)' : r.ppm > 100 ? '#f59e0b' : 'var(--tp-green)') + ';">' + (r.ppm > 999999 ? '>999K' : r.ppm.toLocaleString()) + '</td>';
            html += '<td><span style="font-size:9px;padding:2px 8px;border-radius:4px;background:' + r.ratingColor + '20;color:' + r.ratingColor + ';border:1px solid ' + r.ratingColor + '40;font-weight:700;">' + r.rating + '</span></td>';
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        // Visual Cpk bars
        html += '<div style="margin-top:14px;">';
        html += '<div style="font-size:11px;font-weight:700;color:var(--tp-text);margin-bottom:8px;">Cpk Visual</div>';
        results.forEach(function(r) {
            var barW = Math.min(r.Cpk / 2.0 * 100, 100);
            html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
            html += '<span style="font-size:9px;color:var(--tp-dim);width:80px;text-align:right;flex-shrink:0;">' + r.label + '</span>';
            html += '<div style="flex:1;height:16px;background:var(--tp-border);border-radius:4px;position:relative;overflow:hidden;">';
            html += '<div style="height:100%;width:' + barW + '%;background:' + r.ratingColor + ';border-radius:4px;transition:width 0.5s;"></div>';
            // Reference lines at 1.0 and 1.33
            html += '<div style="position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #f59e0b;opacity:0.5;" title="Cpk=1.0"></div>';
            html += '<div style="position:absolute;left:66.5%;top:0;bottom:0;border-left:1px dashed #3b82f6;opacity:0.5;" title="Cpk=1.33"></div>';
            html += '</div>';
            html += '<span style="font-size:10px;font-weight:700;color:' + r.ratingColor + ';width:40px;">' + r.Cpk.toFixed(2) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
}

// Normal distribution complement (P(Z > z)) approximation
function raPhiComplement(z) {
    if (z < 0) return 1 - raPhiComplement(-z);
    var t = 1 / (1 + 0.2316419 * z);
    var d = 0.3989422804014327; // 1/sqrt(2*pi)
    var p = d * Math.exp(-z * z / 2);
    return p * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M30] RA — ADVANCED FILTER + BULK DELETE                          ║
// ╚══════════════════════════════════════════════════════════════════════╝

// Available filter fields: metadata + cycle data metrics
var RA_FILTER_FIELDS = [
    // -- Metadata fields (string) --
    { key:'vin', label:'VIN', type:'string' },
    { key:'modelName', label:'Model Name', type:'string' },
    { key:'testDesc', label:'Test Description', type:'string' },
    { key:'emissionReg', label:'Emission Regulation', type:'string' },
    { key:'regSpec', label:'Regulation Spec', type:'string' },
    { key:'testType', label:'Test Type', type:'string' },
    { key:'testStatus', label:'Test Status', type:'string' },
    { key:'testCategory', label:'Test Category', type:'string' },
    { key:'operator', label:'Operator', type:'string' },
    { key:'driver', label:'Driver', type:'string' },
    { key:'region', label:'Region', type:'string' },
    { key:'regulationRegion', label:'Regulation Region', type:'string' },
    { key:'transmission', label:'Transmission', type:'string' },
    { key:'engineCapacity', label:'Engine Capacity', type:'string' },
    { key:'driveType', label:'Drive Type', type:'string' },
    { key:'bodyType', label:'Body Type', type:'string' },
    { key:'fuelType', label:'Fuel Type', type:'string' },
    { key:'envPackage', label:'Env Package', type:'string' },
    { key:'enginePackage', label:'Engine Package', type:'string' },
    { key:'modelYear', label:'Model Year', type:'string' },
    { key:'purposeOfTest', label:'Purpose of Test', type:'string' },
    { key:'wltpVehicleClass', label:'WLTP Vehicle Class', type:'string' },
    { key:'dateStr', label:'Import Date', type:'string' },
    // -- Cycle data metrics (numeric, from last row of cycleData) --
    { key:'c:BagCO2', label:'BagCO2 (total)', type:'number', cycle:'BagCO2' },
    { key:'c:BagCO', label:'BagCO (total)', type:'number', cycle:'BagCO' },
    { key:'c:BagTHC', label:'BagTHC (total)', type:'number', cycle:'BagTHC' },
    { key:'c:BagNOX', label:'BagNOX (total)', type:'number', cycle:'BagNOX' },
    { key:'c:BagNMHC', label:'BagNMHC (total)', type:'number', cycle:'BagNMHC' },
    { key:'c:BagCH4', label:'BagCH4 (total)', type:'number', cycle:'BagCH4' },
    { key:'c:BagNMHCpNOX', label:'BagNMHC+NOx (total)', type:'number', cycle:'BagNMHCpNOX' },
    { key:'c:FuelConsumptionBag', label:'Fuel Consumption', type:'number', cycle:'FuelConsumptionBag' },
    { key:'c:FuelEconomyBag', label:'Fuel Economy', type:'number', cycle:'FuelEconomyBag' },
    { key:'c:DilutePN', label:'Dilute PN', type:'number', cycle:'DilutePN' },
    { key:'testMass', label:'Test Mass (kg)', type:'number' },
];

// Operators by type
var RA_FILTER_OPS_STRING = [
    { key:'eq', label:'= (igual)' },
    { key:'neq', label:'!= (diferente)' },
    { key:'contains', label:'contiene' },
    { key:'not_contains', label:'no contiene' },
    { key:'empty', label:'vacio / null' },
    { key:'not_empty', label:'no vacio' },
];
var RA_FILTER_OPS_NUMBER = [
    { key:'eq', label:'= (igual)' },
    { key:'neq', label:'!= (diferente)' },
    { key:'lt', label:'< (menor que)' },
    { key:'lte', label:'<= (menor o igual)' },
    { key:'gt', label:'> (mayor que)' },
    { key:'gte', label:'>= (mayor o igual)' },
    { key:'empty', label:'null / 0 / sin dato' },
    { key:'not_empty', label:'tiene dato (> 0)' },
];

// Filter state (persisted in window only, not localStorage)
if (!window._raFilters) window._raFilters = [{ field:'', op:'', value:'' }];

function raGetTestFieldValue(test, fieldDef) {
    if (fieldDef.cycle) {
        // Get value from last row of cycleData
        if (!test.cycleData || test.cycleData.length === 0) return null;
        var last = test.cycleData[test.cycleData.length - 1];
        var v = last[fieldDef.cycle];
        return (v === undefined || v === '' || v === null) ? null : (typeof v === 'number' ? v : parseFloat(v));
    }
    if (fieldDef.key === 'testMass') return test.testMass || 0;
    return test[fieldDef.key] || '';
}

function raMatchFilter(test, filter) {
    var fieldDef = RA_FILTER_FIELDS.find(function(f) { return f.key === filter.field; });
    if (!fieldDef) return true; // no field selected = pass
    var val = raGetTestFieldValue(test, fieldDef);
    var op = filter.op;
    var target = (filter.value || '').trim();

    if (fieldDef.type === 'number') {
        var numVal = (val === null || val === undefined || isNaN(val)) ? null : parseFloat(val);
        var numTarget = parseFloat(target);

        if (op === 'empty') return numVal === null || numVal === 0 || isNaN(numVal);
        if (op === 'not_empty') return numVal !== null && numVal !== 0 && !isNaN(numVal);
        if (isNaN(numTarget)) return true; // no target entered = pass
        if (op === 'eq') return numVal === numTarget;
        if (op === 'neq') return numVal !== numTarget;
        if (op === 'lt') return numVal !== null && numVal < numTarget;
        if (op === 'lte') return numVal !== null && numVal <= numTarget;
        if (op === 'gt') return numVal !== null && numVal > numTarget;
        if (op === 'gte') return numVal !== null && numVal >= numTarget;
    } else {
        var strVal = (val || '').toString().toLowerCase();
        var strTarget = target.toLowerCase();

        if (op === 'empty') return !strVal || strVal === '—' || strVal === '-';
        if (op === 'not_empty') return strVal && strVal !== '—' && strVal !== '-';
        if (!strTarget) return true; // no target = pass
        if (op === 'eq') return strVal === strTarget;
        if (op === 'neq') return strVal !== strTarget;
        if (op === 'contains') return strVal.includes(strTarget);
        if (op === 'not_contains') return !strVal.includes(strTarget);
    }
    return true;
}

function raApplyFilters() {
    var filters = window._raFilters.filter(function(f) { return f.field && f.op; });
    if (filters.length === 0) return raState.tests;
    return raState.tests.filter(function(test) {
        return filters.every(function(f) { return raMatchFilter(test, f); });
    });
}

function raFilterBulkDelete() {
    var matched = raApplyFilters();
    if (matched.length === 0) {
        showToast('No hay pruebas que coincidan con los filtros', 'info');
        return;
    }
    var msg = 'Se eliminaran ' + matched.length + ' pruebas de ' + raState.tests.length + ' totales.\n\nEsta accion NO se puede deshacer.\n\n¿Continuar?';
    if (!confirm(msg)) return;

    var idsToDelete = {};
    matched.forEach(function(t) { idsToDelete[t.id] = true; });
    raState.tests = raState.tests.filter(function(t) { return !idsToDelete[t.id]; });
    raSave();
    raUpdateBadges();
    showToast(matched.length + ' pruebas eliminadas', 'success');
    raRender();
}

function raRenderFilter(el) {
    var filters = window._raFilters;
    var matched = raApplyFilters();
    var activeCount = filters.filter(function(f) { return f.field && f.op; }).length;
    var sf = function(v, d) { return typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—'; };

    var html = '';

    // ── Header metrics ──
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-bottom:12px;">';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">' + raState.tests.length + '</div><div class="tp-metric-label">Total</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (matched.length < raState.tests.length ? 'var(--tp-amber)' : 'var(--tp-dim)') + '">' + matched.length + '</div><div class="tp-metric-label">Coinciden</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-green)">' + activeCount + '</div><div class="tp-metric-label">Filtros activos</div></div>';
    html += '</div>';

    // ── Filter builder ──
    html += '<div class="tp-card" style="border-color:var(--tp-amber);">';
    html += '<div class="tp-card-title"><span>🧹 Filtro Avanzado</span><span style="font-size:9px;color:var(--tp-dim);">Hasta 5 condiciones (AND)</span></div>';

    filters.forEach(function(f, i) {
        var fieldDef = RA_FILTER_FIELDS.find(function(fd) { return fd.key === f.field; });
        var isNum = fieldDef && fieldDef.type === 'number';
        var ops = isNum ? RA_FILTER_OPS_NUMBER : RA_FILTER_OPS_STRING;
        var needsValue = f.op && f.op !== 'empty' && f.op !== 'not_empty';

        html += '<div style="display:flex;gap:6px;margin-bottom:8px;align-items:center;flex-wrap:wrap;">';

        // Row number
        html += '<span style="font-size:10px;font-weight:700;color:var(--tp-amber);width:14px;">' + (i + 1) + '</span>';

        // Field selector
        html += '<select class="tp-select" style="flex:2;min-width:130px;font-size:10px;" onchange="window._raFilters[' + i + '].field=this.value;window._raFilters[' + i + '].op=\'\';window._raFilters[' + i + '].value=\'\';raRender();">';
        html += '<option value="">— Variable —</option>';
        html += '<optgroup label="Metadata">';
        RA_FILTER_FIELDS.forEach(function(fd) {
            if (fd.type === 'string') html += '<option value="' + fd.key + '"' + (f.field === fd.key ? ' selected' : '') + '>' + fd.label + '</option>';
        });
        html += '</optgroup><optgroup label="Cycle Data (Composite)">';
        RA_FILTER_FIELDS.forEach(function(fd) {
            if (fd.type === 'number') html += '<option value="' + fd.key + '"' + (f.field === fd.key ? ' selected' : '') + '>' + fd.label + '</option>';
        });
        html += '</optgroup></select>';

        // Operator selector
        html += '<select class="tp-select" style="flex:1.5;min-width:110px;font-size:10px;" onchange="window._raFilters[' + i + '].op=this.value;raRender();">';
        html += '<option value="">— Condicion —</option>';
        ops.forEach(function(o) { html += '<option value="' + o.key + '"' + (f.op === o.key ? ' selected' : '') + '>' + o.label + '</option>'; });
        html += '</select>';

        // Value input (hide for empty/not_empty)
        if (needsValue) {
            html += '<input class="tp-input" style="flex:1.5;min-width:100px;font-size:10px;padding:6px 8px;" placeholder="Valor..." value="' + (f.value || '').replace(/"/g, '&quot;') + '" onchange="window._raFilters[' + i + '].value=this.value;raRender();">';
        }

        // Remove button
        if (filters.length > 1) {
            html += '<button class="tp-btn tp-btn-ghost" style="font-size:10px;padding:4px 8px;flex-shrink:0;" onclick="window._raFilters.splice(' + i + ',1);raRender();">✕</button>';
        }

        html += '</div>';
    });

    // Add filter button (max 5)
    if (filters.length < 5) {
        html += '<button class="tp-btn tp-btn-ghost" onclick="window._raFilters.push({field:\'\',op:\'\',value:\'\'});raRender();" style="font-size:10px;margin-top:4px;">+ Agregar condicion</button>';
    }

    html += '</div>';

    // ── Action buttons ──
    html += '<div class="tp-card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">';
    if (activeCount > 0 && matched.length > 0 && matched.length < raState.tests.length) {
        html += '<button class="tp-btn" style="background:#dc2626;color:#fff;font-size:11px;font-weight:700;padding:10px 20px;" onclick="raFilterBulkDelete()">🗑 Eliminar ' + matched.length + ' pruebas filtradas</button>';
    } else if (activeCount > 0 && matched.length === raState.tests.length) {
        html += '<button class="tp-btn" style="background:#7f1d1d;color:#fca5a5;font-size:11px;font-weight:700;padding:10px 20px;opacity:0.5;cursor:not-allowed;" disabled>Todos coinciden — refina el filtro</button>';
    }
    html += '<button class="tp-btn tp-btn-ghost" style="font-size:10px;" onclick="window._raFilters=[{field:\'\',op:\'\',value:\'\'}];raRender();">Limpiar filtros</button>';
    html += '<span style="font-size:10px;color:var(--tp-dim);margin-left:auto;">' + matched.length + ' de ' + raState.tests.length + '</span>';
    html += '</div>';

    // ── Results table ──
    if (activeCount > 0) {
        html += '<div class="tp-card">';
        html += '<div class="tp-card-title"><span>Resultados (' + matched.length + ')</span></div>';

        if (matched.length === 0) {
            html += '<div style="text-align:center;padding:20px;color:var(--tp-green);font-size:12px;">Sin resultados que coincidan.</div>';
        } else {
            html += '<div style="max-height:500px;overflow-y:auto;"><table class="tp-table" style="width:100%;"><thead><tr>';
            html += '<th style="width:30px;"></th><th>VIN</th><th>Modelo / Test</th><th>Regulacion</th><th>Status</th><th style="text-align:right">FC</th><th style="text-align:right">CO2</th><th style="text-align:right">CO</th><th style="text-align:right">NOx</th><th>Fecha</th>';
            html += '</tr></thead><tbody>';

            var shown = matched.slice(0, 200); // limit to 200 for performance
            shown.forEach(function(t, idx) {
                var c = (t.cycleData && t.cycleData.length > 0) ? t.cycleData[t.cycleData.length - 1] : {};
                html += '<tr style="background:rgba(239,68,68,0.04);">';
                html += '<td style="font-size:9px;color:var(--tp-dim);">' + (idx + 1) + '</td>';
                html += '<td style="font-family:monospace;font-size:9px;color:var(--tp-amber);max-width:130px;overflow:hidden;text-overflow:ellipsis;">' + (t.vin || '—') + '</td>';
                html += '<td style="font-size:9px;max-width:160px;overflow:hidden;text-overflow:ellipsis;">' + (t.testDesc || t.modelName || '—') + '</td>';
                html += '<td style="font-size:9px;">' + (t.emissionReg || t.regSpec || '—') + '</td>';
                html += '<td style="font-size:9px;">' + (t.testStatus || '—') + '</td>';
                html += '<td style="text-align:right;font-family:monospace;font-size:9px;">' + sf(c.FuelConsumptionBag, 2) + '</td>';
                html += '<td style="text-align:right;font-family:monospace;font-size:9px;">' + sf(c.BagCO2, 1) + '</td>';
                html += '<td style="text-align:right;font-family:monospace;font-size:9px;">' + sf(c.BagCO, 3) + '</td>';
                html += '<td style="text-align:right;font-family:monospace;font-size:9px;">' + sf(c.BagNOX, 4) + '</td>';
                html += '<td style="font-size:9px;color:var(--tp-dim);">' + (t.dateStr || '—') + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table></div>';
            if (matched.length > 200) {
                html += '<div style="text-align:center;font-size:10px;color:var(--tp-amber);margin-top:6px;">Mostrando 200 de ' + matched.length + ' resultados</div>';
            }
        }
        html += '</div>';
    }

    el.innerHTML = html;
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [QW1] RA — EXPORT CSV                                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

function raExportCSV(testsSubset) {
    var tests = testsSubset || raState.tests;
    if (tests.length === 0) { showToast('No hay pruebas para exportar', 'info'); return; }

    var cols = [
        {h:'VIN',         f:function(t){return t.vin||''}},
        {h:'Modelo',      f:function(t){return t.testDesc||t.modelName||''}},
        {h:'ModelYear',    f:function(t){return t.modelYear||''}},
        {h:'Regulacion',   f:function(t){return t.emissionReg||t.regSpec||''}},
        {h:'TestType',     f:function(t){return t.testType||''}},
        {h:'TestNumber',   f:function(t){return t.testNumber||t.yearlyTestNumber||''}},
        {h:'Operador',     f:function(t){return t.operator||''}},
        {h:'Driver',       f:function(t){return t.driver||''}},
        {h:'Fecha',        f:function(t){return t.dateStr||''}},
        {h:'Status',       f:function(t){return t.testStatus||''}},
        {h:'Pass/Fail',    f:function(t){return raTestVerdict(t)}},
        {h:'Motor',        f:function(t){return t.engineCapacity||''}},
        {h:'Transmision',  f:function(t){return t.transmission||''}},
        {h:'Region',       f:function(t){return t.region||''}},
        {h:'Llanta',       f:function(t){return t.tireAssy||t.wheelSize||''}},
        {h:'TestMass_kg',  f:function(t){return t.testMass||''}},
        {h:'FuelConsumption', f:function(t){var c=raLastCycle(t);return c.FuelConsumptionBag!=null?c.FuelConsumptionBag:''}},
        {h:'FuelEconomy',    f:function(t){var c=raLastCycle(t);return c.FuelEconomyBag!=null?c.FuelEconomyBag:''}},
        {h:'CO',           f:function(t){var c=raLastCycle(t);return c.BagCO!=null?c.BagCO:''}},
        {h:'CO2',          f:function(t){var c=raLastCycle(t);return c.BagCO2!=null?c.BagCO2:''}},
        {h:'THC',          f:function(t){var c=raLastCycle(t);return c.BagTHC!=null?c.BagTHC:''}},
        {h:'NOx',          f:function(t){var c=raLastCycle(t);return c.BagNOX!=null?c.BagNOX:''}},
        {h:'NMHC',         f:function(t){var c=raLastCycle(t);return c.BagNMHC!=null?c.BagNMHC:''}},
        {h:'CH4',          f:function(t){var c=raLastCycle(t);return c.BagCH4!=null?c.BagCH4:''}},
        {h:'NMHC+NOx',     f:function(t){var c=raLastCycle(t);return c.BagNMHCpNOX!=null?c.BagNMHCpNOX:''}},
        {h:'PN',           f:function(t){var c=raLastCycle(t);return c.DilutePN!=null?c.DilutePN:''}}
    ];

    var esc = function(v) {
        var s = String(v==null?'':v);
        return s.indexOf(',')>=0||s.indexOf('"')>=0||s.indexOf('\n')>=0 ? '"'+s.replace(/"/g,'""')+'"' : s;
    };

    var csv = cols.map(function(c){return esc(c.h);}).join(',') + '\n';
    tests.forEach(function(t) {
        csv += cols.map(function(c){return esc(c.f(t));}).join(',') + '\n';
    });

    var blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'results_export_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast(tests.length + ' pruebas exportadas a CSV', 'success');
}

// Helper: get last cycle row (composite/total)
function raLastCycle(t) {
    return (t.cycleData && t.cycleData.length > 0) ? t.cycleData[t.cycleData.length - 1] : {};
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [QW2] RA — PASS/FAIL VERDICT PER TEST                             ║
// ╚══════════════════════════════════════════════════════════════════════╝

function raTestVerdict(t) {
    var pr = raGetProfile(t);
    if (!pr || !pr.limits) return '—';
    var c = raLastCycle(t);
    if (!c || Object.keys(c).length === 0) return '—';
    var keys = Object.keys(pr.limits);
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var val = c[k];
        if (typeof val === 'number' && isFinite(val) && Math.abs(val) > pr.limits[k]) return 'FAIL';
    }
    return 'PASS';
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [B2] RA — SIDE-BY-SIDE TEST COMPARISON                            ║
// ╚══════════════════════════════════════════════════════════════════════╝

function raRenderCompare(el) {
    var tests = raState.tests;
    if (tests.length < 2) {
        el.innerHTML = '<div class="tp-card" style="text-align:center;padding:40px;color:var(--tp-dim);">Necesitas al menos 2 pruebas importadas para comparar.</div>';
        return;
    }

    var idA = window._raCmpA || '';
    var idB = window._raCmpB || '';
    var testA = idA ? tests.find(function(t){ return String(t.id) === String(idA); }) : null;
    var testB = idB ? tests.find(function(t){ return String(t.id) === String(idB); }) : null;

    var opts = tests.map(function(t) {
        return '<option value="' + t.id + '">' + (t.vin||'NoVIN') + ' — ' + (t.testDesc||t.modelName||'?') + ' #' + (t.testNumber||'?') + ' (' + (t.dateStr||'') + ')</option>';
    }).join('');

    var html = '<div class="tp-card"><div class="tp-card-title"><span>Comparar 2 Pruebas</span></div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">';
    html += '<div><label style="font-size:9px;color:var(--tp-dim);display:block;">Prueba A</label>';
    html += '<select class="tp-select" style="width:100%;font-size:10px;" onchange="window._raCmpA=this.value;raRender();"><option value="">Seleccionar...</option>' + opts.replace('value="' + idA + '"', 'value="' + idA + '" selected') + '</select></div>';
    html += '<div><label style="font-size:9px;color:var(--tp-dim);display:block;">Prueba B</label>';
    html += '<select class="tp-select" style="width:100%;font-size:10px;" onchange="window._raCmpB=this.value;raRender();"><option value="">Seleccionar...</option>' + opts.replace('value="' + idB + '"', 'value="' + idB + '" selected') + '</select></div>';
    html += '</div></div>';

    if (!testA || !testB) {
        html += '<div class="tp-card" style="text-align:center;padding:30px;color:var(--tp-dim);">Selecciona dos pruebas para comparar.</div>';
        el.innerHTML = html;
        return;
    }

    var cA = raLastCycle(testA);
    var cB = raLastCycle(testB);
    var prA = raGetProfile(testA);
    var prB = raGetProfile(testB);
    var limits = (prA && prA.limits) ? prA.limits : ((prB && prB.limits) ? prB.limits : {});
    var sf = function(v, d) { return typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—'; };

    // Metadata comparison
    var metaRows = [
        ['VIN', testA.vin, testB.vin],
        ['Modelo', testA.testDesc || testA.modelName, testB.testDesc || testB.modelName],
        ['Ano', testA.modelYear, testB.modelYear],
        ['Regulacion', testA.emissionReg || testA.regSpec, testB.emissionReg || testB.regSpec],
        ['TestType', testA.testType, testB.testType],
        ['Test#', testA.testNumber, testB.testNumber],
        ['Fecha', testA.dateStr, testB.dateStr],
        ['Operador', testA.operator, testB.operator],
        ['Driver', testA.driver, testB.driver],
        ['Motor', testA.engineCapacity, testB.engineCapacity],
        ['Transmision', testA.transmission, testB.transmission],
        ['Region', testA.region, testB.region],
        ['TestMass', sf(testA.testMass, 0) + ' kg', sf(testB.testMass, 0) + ' kg'],
        ['Veredicto', raTestVerdict(testA), raTestVerdict(testB)]
    ];

    html += '<div class="tp-card"><div class="tp-card-title"><span>Metadata</span></div>';
    html += '<table class="tp-table" style="width:100%;"><thead><tr><th></th><th style="color:#06b6d4;">A</th><th style="color:#f59e0b;">B</th><th>Diff</th></tr></thead><tbody>';
    metaRows.forEach(function(r) {
        var isDiff = String(r[1] || '') !== String(r[2] || '');
        html += '<tr' + (isDiff ? ' style="background:rgba(245,158,11,0.05);"' : '') + '>';
        html += '<td style="font-size:9px;font-weight:700;color:var(--tp-dim);">' + r[0] + '</td>';
        html += '<td style="font-size:10px;">' + (r[1] || '—') + '</td>';
        html += '<td style="font-size:10px;">' + (r[2] || '—') + '</td>';
        html += '<td style="font-size:9px;color:' + (isDiff ? 'var(--tp-amber)' : 'var(--tp-dim)') + ';">' + (isDiff ? 'Diferente' : '=') + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';

    // Emissions comparison
    var emissionKeys = [
        { k: 'FuelConsumptionBag', l: 'Fuel Consumption', d: 3, u: 'L/100km' },
        { k: 'FuelEconomyBag',     l: 'Fuel Economy',     d: 2, u: 'km/L' },
        { k: 'BagCO2',  l: 'CO2',  d: 2, u: 'g/km' },
        { k: 'BagCO',   l: 'CO',   d: 4, u: 'g/km' },
        { k: 'BagTHC',  l: 'THC',  d: 4, u: 'g/km' },
        { k: 'BagNOX',  l: 'NOx',  d: 4, u: 'g/km' },
        { k: 'BagNMHC', l: 'NMHC', d: 4, u: 'g/km' },
        { k: 'BagCH4',  l: 'CH4',  d: 4, u: 'g/km' },
        { k: 'BagNMHCpNOX', l: 'NMHC+NOx', d: 4, u: 'g/km' },
        { k: 'DilutePN', l: 'PN', d: 2, u: '#/km' }
    ];

    html += '<div class="tp-card"><div class="tp-card-title"><span>Resultados de Emision (Composite)</span></div>';
    html += '<table class="tp-table" style="width:100%;"><thead><tr><th>Contaminante</th><th style="text-align:right;color:#06b6d4;">A</th><th style="text-align:right;color:#f59e0b;">B</th><th style="text-align:right;">Delta</th><th style="text-align:right;">%</th><th>Limite</th></tr></thead><tbody>';

    emissionKeys.forEach(function(ek) {
        var vA = cA[ek.k];
        var vB = cB[ek.k];
        var hasA = typeof vA === 'number' && isFinite(vA);
        var hasB = typeof vB === 'number' && isFinite(vB);
        if (!hasA && !hasB) return;

        var delta = (hasA && hasB) ? (vB - vA) : null;
        var pctDelta = (hasA && hasB && vA !== 0) ? ((vB - vA) / Math.abs(vA) * 100) : null;
        var lim = limits[ek.k];

        var failA = lim && hasA && Math.abs(vA) > lim;
        var failB = lim && hasB && Math.abs(vB) > lim;
        var deltaClr = delta === null ? 'var(--tp-dim)' : delta > 0 ? '#ef4444' : delta < 0 ? '#10b981' : 'var(--tp-dim)';

        html += '<tr>';
        html += '<td style="font-size:10px;font-weight:600;">' + ek.l + ' <span style="font-size:8px;color:var(--tp-dim);">' + ek.u + '</span></td>';
        html += '<td style="text-align:right;font-family:monospace;font-size:10px;' + (failA ? 'color:var(--tp-red);font-weight:700;' : '') + '">' + (hasA ? sf(vA, ek.d) : '—') + '</td>';
        html += '<td style="text-align:right;font-family:monospace;font-size:10px;' + (failB ? 'color:var(--tp-red);font-weight:700;' : '') + '">' + (hasB ? sf(vB, ek.d) : '—') + '</td>';
        html += '<td style="text-align:right;font-family:monospace;font-size:10px;color:' + deltaClr + ';">' + (delta !== null ? (delta > 0 ? '+' : '') + sf(delta, ek.d) : '—') + '</td>';
        html += '<td style="text-align:right;font-size:9px;color:' + deltaClr + ';">' + (pctDelta !== null ? (pctDelta > 0 ? '+' : '') + pctDelta.toFixed(1) + '%' : '—') + '</td>';
        html += '<td style="font-size:9px;color:var(--tp-dim);text-align:center;">' + (lim ? sf(lim, ek.d) : '—') + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    html += '<div style="font-size:8px;color:var(--tp-dim);margin-top:6px;">Delta = B - A. Verde = B menor que A (mejora). Rojo = B mayor que A (peor). Valores en rojo exceden el limite regulatorio.</div>';
    html += '</div>';

    el.innerHTML = html;
}

function raInit(){ raUpdateBadges(); }
