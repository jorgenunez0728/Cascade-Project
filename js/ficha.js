// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.24.0] FICHA UNIVERSAL — "¿qué le pasa a ESTO?"                    ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Una hoja inferior para cualquier cosa del laboratorio: vehículo, configuración,
// familia, cilindro, instrumento o proyecto. Arriba su estado, UNA acción siguiente,
// sus datos, su historia reciente y sus RELACIONES (familia → configuraciones →
// vehículos → juicio CoP → semanas del plan). Tocar una relación abre su ficha
// encima; ‹ regresa.
//
// REGLAS:
//  - La ficha NO calcula nada propio: compone las definiciones únicas de cada módulo
//    (cascadeVehicleStage/getNextStep/cascadeVehicleETA, copPortfolioRows/copFamilyRisk,
//    tpGetAnalysis/tpFamilyWeeklyProgress, invGasLevel/invGasBurnRate/invGasReorder,
//    invCalStatus, pnProjectProgress). Si una no está cargada (typeof), su parte se omite.
//  - La ficha NO escribe nada. Su acción siguiente NAVEGA a la pantalla de siempre,
//    donde viven los candados de cada módulo. Cascade no se toca.
//  - fichaHTML(model) es PURA; fichaModel(kind, ref) lee el estado vivo.
//  - Todo por identidad (id / key / desc), nunca por posición.

var FICHA_KINDS = {
    vehiculo:    { icon: '🚗', label: 'Vehículo' },
    config:      { icon: '🧬', label: 'Configuración' },
    familia:     { icon: '👪', label: 'Familia' },
    cilindro:    { icon: '🧪', label: 'Cilindro' },
    instrumento: { icon: '🔧', label: 'Instrumento' },
    proyecto:    { icon: '🗂️', label: 'Proyecto' }
};

var _ficha = null;   // {stack:[{kind, ref}], closeDialog}

function _fichaEsc(s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
function _fichaArg(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function _fichaDate(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** El botón que abre la ficha de algo, para usarlo dentro de cualquier HTML generado. */
function fichaLinkHTML(kind, ref, label, cls) {
    return '<button type="button" class="ficha-link' + (cls ? ' ' + cls : '') + '" ' +
           'onclick="event.stopPropagation();fichaOpen(\'' + kind + '\',\'' + _fichaArg(ref) + '\',this)">' + label + '</button>';
}

// ── Modelos (leen el estado vivo; componen definiciones únicas) ─────────

function fichaModel(kind, ref) {
    try {
        // [2.25.0] Un tipo puede registrarse desde otro archivo con su propio modelo
        // (FICHA_KINDS.relevo en relevo.js) sin tocar este despachador.
        if (FICHA_KINDS[kind] && typeof FICHA_KINDS[kind].model === 'function') return FICHA_KINDS[kind].model(ref);
        if (kind === 'vehiculo') return _fichaVehiculo(ref);
        if (kind === 'config') return _fichaConfig(ref);
        if (kind === 'familia') return _fichaFamilia(ref);
        if (kind === 'cilindro') return _fichaCilindro(ref);
        if (kind === 'instrumento') return _fichaInstrumento(ref);
        if (kind === 'proyecto') return _fichaProyecto(ref);
    } catch (e) {
        // Que una definición truene no es lo mismo que "ya no existe": se dice distinto.
        console.warn('fichaModel', kind, e);
        return { kind: kind, ref: ref, error: true };
    }
    return null;
}

function _fichaVehiculo(id) {
    var v = ((typeof db !== 'undefined' && db.vehicles) || []).filter(function(x) { return String(x.id) === String(id); })[0];
    if (!v) return null;
    var cfg = v.config || {};
    var st = typeof cascadeVehicleStage === 'function' ? cascadeVehicleStage(v) : null;
    var next = typeof getNextStep === 'function' ? getNextStep(v) : null;
    var eta = typeof cascadeVehicleETA === 'function' ? cascadeVehicleETA(v) : null;
    var m = {
        kind: 'vehiculo', ref: v.id, title: v.vin || ('#' + v.id),
        subtitle: [cfg['Modelo'], cfg['MODEL YEAR (VIN)'], cfg['ENGINE CAPACITY'], cfg['EMISSION REGULATION'], cfg['REGION']].filter(Boolean).join(' · '),
        badges: [], facts: [], relations: [], history: [], stage: st
    };
    if (st) m.badges.push({ text: st.done ? 'Archivado' : 'Etapa ' + st.index + '/' + st.total + ' · ' + st.label, tone: st.done ? 'ok' : 'info' });
    if (v.adhoc) m.badges.push({ text: 'Fuera de plan', tone: 'warn' });
    m.facts.push({ k: 'Propósito', v: (typeof uiLabel === 'function' ? uiLabel('purpose', v.purpose) : v.purpose) || '—' });
    if (eta && !(st && st.done)) m.facts.push({ k: 'Liberación esperada', v: _fichaDate(eta.date) + (eta.source === 'manual' ? ' (fijada)' : ' (estimada)') });
    var td = v.testData || {};
    if (td.testResponsible || v.registeredBy) m.facts.push({ k: 'Responsable', v: td.testResponsible || v.registeredBy });
    m.facts.push({ k: 'Alta', v: _fichaDate(v.registeredAt) || '—' });
    if (v.archivedAt) m.facts.push({ k: 'Archivado', v: _fichaDate(v.archivedAt) });
    if (next) m.next = { label: next.icon + ' ' + next.action, js: "fichaClose();v7GoToVehicle(" + JSON.stringify(v.id) + ",'" + _fichaArg(next.goto || '') + "')" };
    else m.next = { label: 'Abrir en Pruebas', js: 'fichaClose();v7GoToVehicle(' + JSON.stringify(v.id) + ')' };
    if (v.configCode && typeof tpConfigByDesc === 'function' && tpConfigByDesc(v.configCode)) {
        m.relations.push({ kind: 'config', ref: v.configCode, label: typeof tpConfigShortName === 'function' ? tpConfigShortName(tpConfigByDesc(v.configCode)) : v.configCode, meta: 'Configuración' });
    }
    if (typeof copVehicleFamilyKey === 'function') {
        var fk = copVehicleFamilyKey(v);
        if (fk && fk.replace(/\|/g, '')) m.relations.push({ kind: 'familia', ref: fk, label: _fichaFamLabel(fk), meta: 'Familia' });
    }
    (v.timeline || []).slice(-5).reverse().forEach(function(t) {
        m.history.push({ when: t.timestamp, text: t.action + (t.user ? ' · ' + t.user : '') });
    });
    return m;
}

function _fichaFamLabel(key) {
    var p = String(key || '').split('|');
    return [p[0], p[1], p[2], p[3], p[4], p[7]].filter(Boolean).join(' · ') || key;
}

function _fichaConfig(desc) {
    var cfg = typeof tpConfigByDesc === 'function' ? tpConfigByDesc(desc) : null;
    if (!cfg) return null;
    var an = typeof tpGetAnalysis === 'function' ? (tpGetAnalysis() || []).filter(function(a) { return a.desc === desc; })[0] : null;
    var m = {
        kind: 'config', ref: desc, title: typeof tpConfigShortName === 'function' ? tpConfigShortName(cfg) : desc,
        subtitle: [cfg.rgn, cfg.reg, cfg.body].filter(Boolean).join(' · '),
        badges: [], facts: [], relations: [], history: []
    };
    if (cfg._catalogOnly) m.badges.push({ text: 'Sin volumen de producción', tone: 'muted' });
    if (cfg.paused) m.badges.push({ text: 'Pausada', tone: 'muted' });
    if (an) {
        m.badges.push(an.deficit > 0 ? { text: 'Faltan ' + an.deficit, tone: 'warn' } : { text: 'REQ cumplido', tone: 'ok' });
        m.facts.push({ k: 'Probadas / REQ', v: an.testedN + ' / ' + an.required });
    }
    m.facts.push({ k: 'Código', v: desc });
    if (typeof tpFamilyKeyForCfg === 'function') {
        var fk = tpFamilyKeyForCfg(cfg);
        m.relations.push({ kind: 'familia', ref: fk, label: _fichaFamLabel(fk), meta: 'Familia' });
    }
    ((typeof db !== 'undefined' && db.vehicles) || []).filter(function(v) { return v.configCode === desc; })
        .slice(-6).reverse().forEach(function(v) {
            m.relations.push({ kind: 'vehiculo', ref: v.id, label: v.vin || '#' + v.id, meta: (typeof CONFIG !== 'undefined' && CONFIG.statusLabels && CONFIG.statusLabels[v.status]) || v.status });
        });
    var tested = typeof tpTestedForConfig === 'function' ? tpTestedForConfig(desc) : [];
    (tested || []).slice(-5).reverse().forEach(function(t) {
        var vin = typeof tpTestedVin === 'function' ? tpTestedVin(t) : '';
        m.history.push({ when: t.date, text: 'Prueba' + (vin ? ' · ' + vin : '') + (t.declared || t.verified === false ? ' (declarada)' : '') });
    });
    m.next = { label: '📅 Ver en el plan', js: "fichaClose();dashGo('testplan','tp-myweek')" };
    return m;
}

function _fichaFamilia(key) {
    var row = typeof copPortfolioRows === 'function' ? (copPortfolioRows() || []).filter(function(r) { return r.key === key; })[0] : null;
    var m = {
        kind: 'familia', ref: key, title: row ? (row.label || _fichaFamLabel(key)) : _fichaFamLabel(key),
        subtitle: row ? [row.regName || row.emissionReg, (row.regionsArr || []).join(', ')].filter(Boolean).join(' · ') : '',
        badges: [], facts: [], relations: [], history: []
    };
    if (row && row.risk) {
        var tone = { ok: 'ok', atencion: 'warn', riesgo: 'bad', 'sin-datos': 'muted' }[row.risk.level] || 'muted';
        var txt = { ok: 'En orden', atencion: 'Atención', riesgo: 'Riesgo', 'sin-datos': 'Sin datos suficientes' }[row.risk.level] || row.risk.level;
        m.badges.push({ text: txt, tone: tone });
        m.note = 'Aviso interno anticipado, no un veredicto regulatorio.';
        (row.risk.reasons || []).slice(0, 3).forEach(function(r) { m.facts.push({ k: 'Motivo', v: r.text }); });
    }
    if (row) {
        if (row.planRequired) m.facts.push({ k: 'Probadas / REQ', v: row.planTested + ' / ' + row.planRequired });
        if (row.n) m.facts.push({ k: 'VINes con resultado', v: row.n + (row.verdict ? ' · muestreo: ' + row.verdict : '') });
        if (row.cpkMin != null) m.facts.push({ k: 'Cpk mínimo', v: row.cpkMin.toFixed(2) + (row.cpkMinGas ? ' (' + row.cpkMinGas + ')' : '') });
        m.facts.push({ k: 'Juicio guardado', v: row.judgedAt ? _fichaDate(row.judgedAt) + ' · ' + row.judgedDecision : 'ninguno' });
        if (row.lastTestDate) m.facts.push({ k: 'Última prueba', v: _fichaDate(row.lastTestDate) });
    }
    if (typeof tpConfigCatalog === 'function' && typeof tpFamilyKeyForCfg === 'function') {
        tpConfigCatalog().filter(function(c) { return tpFamilyKeyForCfg(c) === key; }).slice(0, 6).forEach(function(c) {
            m.relations.push({ kind: 'config', ref: c.desc, label: typeof tpConfigShortName === 'function' ? tpConfigShortName(c) : c.desc, meta: 'Configuración' });
        });
    }
    if (typeof copVehicleFamilyKey === 'function') {
        ((typeof db !== 'undefined' && db.vehicles) || []).filter(function(v) { return copVehicleFamilyKey(v) === key; })
            .slice(-6).reverse().forEach(function(v) {
                m.relations.push({ kind: 'vehiculo', ref: v.id, label: v.vin || '#' + v.id, meta: (typeof CONFIG !== 'undefined' && CONFIG.statusLabels && CONFIG.statusLabels[v.status]) || v.status });
            });
    }
    if (typeof tpFamilyWeeklyProgress === 'function') {
        (tpFamilyWeeklyProgress(key) || []).slice(-5).reverse().forEach(function(w) {
            var done = (w.done || 0), planned = (w.planned || 0);
            m.history.push({ when: w.weekDate, text: 'Semana: ' + done + ' hecha' + (done === 1 ? '' : 's') + (planned ? ', ' + planned + ' por hacer' : '') + (w.proposal ? ' (propuesta)' : '') });
        });
    }
    if (typeof copOpenFamily === 'function' && row) m.next = { label: '📋 Abrir en el CoP', js: "fichaClose();dashGo('cop');setTimeout(function(){copOpenFamily('" + _fichaArg(key) + "')},250)" };
    if (!row && !m.relations.length) return null;
    return m;
}

function _fichaCilindro(id) {
    var g = ((typeof invState !== 'undefined' && invState.gases) || []).filter(function(x) { return String(x.id) === String(id); })[0];
    if (!g) return null;
    var lv = typeof invGasLevel === 'function' ? invGasLevel(g) : null;
    var m = {
        kind: 'cilindro', ref: g.id, title: (g.formula || g.gasType || 'Cilindro') + (g.controlNo ? ' #' + g.controlNo : ''),
        subtitle: [g.concNominal, g.zone ? 'Zona ' + g.zone : '', typeof uiLabel === 'function' ? uiLabel('gasStatus', g.status) : g.status].filter(Boolean).join(' · '),
        badges: [], facts: [], relations: [], history: []
    };
    if (lv) {
        var tone = { critico: 'bad', bajo: 'warn', ok: 'ok', sinlecturas: 'muted' }[lv.status] || 'muted';
        m.badges.push({ text: lv.status === 'sinlecturas' ? 'Sin lecturas' : lv.pct + '%', tone: tone });
        if (lv.psi != null) m.facts.push({ k: 'Presión', v: lv.psi + ' psi' + (lv.nominal ? ' de ' + lv.nominal : '') });
    }
    var br = typeof invGasBurnRate === 'function' ? invGasBurnRate(g) : null;
    if (br && br.weeklyPsi) m.facts.push({ k: 'Consumo', v: Math.round(br.weeklyPsi) + ' psi/semana' + (br.daysToLow != null ? ' · a nivel bajo en ~' + Math.round(br.daysToLow) + ' días' : '') });
    var ro = typeof invGasReorder === 'function' ? invGasReorder(g) : null;
    if (ro && ro.status === 'comprar') { m.badges.push({ text: 'Pedir ya', tone: 'warn' }); m.facts.push({ k: 'Reposición', v: 'Pedirlo ya: el proveedor tarda ' + ro.leadDays + ' días' }); }
    var ex = typeof invGasExpiry === 'function' ? invGasExpiry(g) : null;
    if (ex && ex.text) m.facts.push({ k: 'Vigencia', v: ex.text });
    (g.readings || []).slice(-5).reverse().forEach(function(r) {
        m.history.push({ when: r.date, text: r.psi + ' psi' + (r.auto ? ' (estimada por prueba)' : r.by ? ' · ' + r.by : '') });
    });
    m.next = { label: '🔄 Hacer la ronda', js: "fichaClose();if(typeof invStartReadingRound==='function')invStartReadingRound()" };
    return m;
}

function _fichaInstrumento(id) {
    var e = ((typeof invState !== 'undefined' && invState.equipment) || []).filter(function(x) { return String(x.id) === String(id); })[0];
    if (!e) return null;
    var st = typeof invCalStatus === 'function' ? invCalStatus(e) : null;
    var asset = ((typeof invState !== 'undefined' && invState.assets) || []).filter(function(a) { return a.id === e.assetId; })[0];
    var m = {
        kind: 'instrumento', ref: e.id, title: e.name || 'Instrumento',
        subtitle: [e.magnitude, asset ? asset.name : '', e.kmmId ? 'KMM ' + e.kmmId : ''].filter(Boolean).join(' · '),
        badges: [], facts: [], relations: [], history: []
    };
    if (st) m.badges.push({ text: st.label, tone: { vencido: 'bad', porvencer: 'warn', vigente: 'ok' }[st.code] || 'muted' });
    if (e.serialNo) m.facts.push({ k: 'Serie', v: e.serialNo });
    if (e.calFreq) m.facts.push({ k: 'Frecuencia', v: e.calFreq });
    if (e.lastCalDate) m.facts.push({ k: 'Última calibración', v: _fichaDate(e.lastCalDate) });
    if (e.nextCalDate) m.facts.push({ k: 'Próxima', v: _fichaDate(e.nextCalDate) });
    if (e.calLab) m.facts.push({ k: 'Proveedor', v: e.calLab });
    var proj = asset && typeof pnActiveProjectForAsset === 'function' ? pnActiveProjectForAsset(asset.id) : null;
    if (proj) m.relations.push({ kind: 'proyecto', ref: proj.id, label: proj.name, meta: 'Proyecto abierto del equipo' });
    (e.calHistory || []).slice(-5).reverse().forEach(function(h) {
        m.history.push({ when: h.date, text: 'Calibrado' + (h.certNo ? ' · cert. ' + h.certNo : '') + (h.by ? ' · ' + h.by : '') });
    });
    if (e.requiresCal !== 'No') {
        m.next = { label: '✅ Registrar calibración', js: "fichaClose();dashGo('inventory','inv-equipment');setTimeout(function(){if(typeof invShowCalRegisterModal==='function')invShowCalRegisterModal('" + _fichaArg(e.id) + "')},400)" };
    }
    return m;
}

function _fichaProyecto(id) {
    var p = ((typeof pnState !== 'undefined' && pnState.projects) || []).filter(function(x) { return String(x.id) === String(id); })[0];
    if (!p) return null;
    var pr = typeof pnProjectProgress === 'function' ? pnProjectProgress(p) : null;
    var m = {
        kind: 'proyecto', ref: p.id, title: p.name || 'Proyecto',
        subtitle: [(typeof PN_PROJECT_STATUS !== 'undefined' && PN_PROJECT_STATUS[p.status]) || p.status, p.owner ? '👤 ' + p.owner : ''].filter(Boolean).join(' · '),
        badges: [], facts: [], relations: [], history: []
    };
    if (pr) {
        m.badges.push({ text: pr.pct + '% · ' + pr.done + '/' + pr.total + ' pasos', tone: pr.overdueN || pr.blockedN ? 'warn' : 'ok' });
        if (pr.overdueN) m.facts.push({ k: 'Vencidos', v: pr.overdueN });
        if (pr.blockedN) m.facts.push({ k: 'Bloqueados', v: pr.blockedN });
        if (pr.nextStep) m.facts.push({ k: 'Siguiente paso', v: pr.nextStep.title + (pr.nextStep.targetDate ? ' · ' + _fichaDate(pr.nextStep.targetDate) : '') });
    }
    if (p.assetId && typeof invState !== 'undefined') {
        (invState.equipment || []).filter(function(e) { return e.assetId === p.assetId; }).slice(0, 4).forEach(function(e) {
            m.relations.push({ kind: 'instrumento', ref: e.id, label: e.name, meta: 'Instrumento del equipo' });
        });
    }
    var tl = typeof pnProjectTimeline === 'function' ? pnProjectTimeline(p) : [];
    (tl || []).slice(0, 5).forEach(function(ev) { m.history.push({ when: ev.at, text: ev.text }); });
    m.next = { label: '🗂️ Abrir el proyecto', js: "fichaClose();window._pnSelectedProject='" + _fichaArg(p.id) + "';dashGo('panel','pn-projects')" };
    return m;
}

// ── Pintar (PURA) ────────────────────────────────────────────────────────

/** HTML de una ficha a partir de su modelo. PURA: mismo modelo → mismo texto. */
function fichaHTML(m, opts) {
    opts = opts || {};
    if (!m) return '<p class="ficha-empty">Esto ya no existe (se borró o cambió desde otro equipo).</p>';
    if (m.error) return '<p class="ficha-empty">No se pudo mostrar esta ficha. Si se repite, avísanos con el botón 🐞.</p>';
    var k = FICHA_KINDS[m.kind] || { icon: '•', label: '' };
    var h = '<div class="ficha-kicker">' + k.icon + ' ' + _fichaEsc(k.label) + '</div>';
    h += '<h2 class="ficha-title" id="ficha-title">' + _fichaEsc(m.title) + '</h2>';
    if (m.subtitle) h += '<div class="ficha-sub">' + _fichaEsc(m.subtitle) + '</div>';
    if (m.badges && m.badges.length) {
        h += '<div class="ficha-badges">' + m.badges.map(function(b) {
            return '<span class="ficha-badge is-' + _fichaEsc(b.tone || 'muted') + '">' + _fichaEsc(b.text) + '</span>';
        }).join('') + '</div>';
    }
    if (m.stage && m.stage.total) {
        h += '<div class="ficha-stepper" aria-label="Etapa ' + m.stage.index + ' de ' + m.stage.total + '">';
        for (var s = 1; s <= m.stage.total; s++) {
            h += '<span class="ficha-step' + (s < m.stage.index || m.stage.done ? ' is-done' : s === m.stage.index ? ' is-now' : '') + '"></span>';
        }
        h += '</div>';
    }
    var nextHTML = m.next ? '<button type="button" class="btn-primary ficha-next" onclick="' + _fichaEsc(m.next.js) + '">' + _fichaEsc(m.next.label) + '</button>' : '';
    if (!m.nextAtEnd) h += nextHTML;
    if (m.note) h += '<p class="ficha-note">' + _fichaEsc(m.note) + '</p>';
    if (m.facts && m.facts.length) {
        h += '<dl class="ficha-facts">' + m.facts.map(function(f) {
            return '<div><dt>' + _fichaEsc(f.k) + '</dt><dd>' + _fichaEsc(f.v) + '</dd></div>';
        }).join('') + '</dl>';
    }
    if (m.relations && m.relations.length) {
        h += '<div class="ficha-sec">Relacionado</div><div class="ficha-rels">' + m.relations.map(function(r) {
            var rk = FICHA_KINDS[r.kind] || { icon: '•' };
            return '<button type="button" class="ficha-rel" onclick="fichaPush(\'' + r.kind + '\',\'' + _fichaArg(r.ref) + '\')">' +
                   '<span class="ficha-rel-icon" aria-hidden="true">' + rk.icon + '</span>' +
                   '<span class="ficha-rel-main"><b>' + _fichaEsc(r.label) + '</b>' + (r.meta ? '<small>' + _fichaEsc(r.meta) + '</small>' : '') + '</span>' +
                   '<span class="ficha-rel-go" aria-hidden="true">›</span></button>';
        }).join('') + '</div>';
    }
    // [2.25.0] Grupos de líneas (el relevo): cada línea puede abrir la ficha de su cosa.
    (m.groups || []).forEach(function(g) {
        h += '<div class="ficha-sec">' + (g.icon ? g.icon + ' ' : '') + _fichaEsc(g.title) + '</div><ul class="ficha-lines">';
        (g.lines || []).forEach(function(l) {
            var inner = '<span class="ficha-line-text">' + _fichaEsc(l.text) + '</span>' +
                (l.who || l.when || l.whenText ? '<small>' + _fichaEsc([l.who, l.whenText || (l.when ? _fichaDate(l.when) : '')].filter(Boolean).join(' · ')) + '</small>' : '');
            h += '<li class="ficha-line' + (l.tone ? ' is-' + _fichaEsc(l.tone) : '') + '">' + (l.link
                ? '<button type="button" class="ficha-line-btn" onclick="fichaPush(\'' + _fichaArg(l.link.kind) + '\',\'' + _fichaArg(l.link.ref) + '\')">' + inner + '<span class="ficha-rel-go" aria-hidden="true">›</span></button>'
                : '<div class="ficha-line-in">' + inner + '</div>') + '</li>';
        });
        if (g.more) h += '<li class="ficha-line ficha-line-more">y ' + g.more + ' más</li>';
        h += '</ul>';
    });
    if (m.history && m.history.length) {
        h += '<div class="ficha-sec">Lo más reciente</div><ol class="ficha-hist">' + m.history.map(function(e) {
            return '<li><time>' + _fichaEsc(_fichaDate(e.when)) + '</time><span>' + _fichaEsc(e.text) + '</span></li>';
        }).join('') + '</ol>';
    }
    if (m.nextAtEnd) h += nextHTML;
    return h;
}

// ── La hoja ──────────────────────────────────────────────────────────────

function fichaOpen(kind, ref, originEl) {
    if (!FICHA_KINDS[kind]) return false;
    if (_ficha) { fichaPush(kind, ref); return true; }
    var el = document.createElement('div');
    el.id = 'ficha';
    el.className = 'ficha';
    el.innerHTML = '<div class="ficha-backdrop" onclick="fichaClose()"></div>' +
        '<div class="ficha-sheet" role="document">' +
            '<div class="ficha-grip" aria-hidden="true"></div>' +
            '<div class="ficha-bar">' +
                '<button type="button" class="ficha-back" onclick="fichaBack()" aria-label="Regresar a la ficha anterior">‹</button>' +
                '<span class="ficha-bar-sp"></span>' +
                '<button type="button" class="ficha-x" onclick="fichaClose()" aria-label="Cerrar">✕</button>' +
            '</div>' +
            '<div class="ficha-body" id="ficha-body"></div>' +
        '</div>';
    document.body.appendChild(el);
    document.body.classList.add('ficha-open');
    _ficha = { stack: [{ kind: kind, ref: ref }], closeDialog: null, origin: originEl || null };
    _fichaPaint();
    _fichaGestures(el);
    if (typeof a11yDialog === 'function') {
        _ficha.closeDialog = a11yDialog(el, { labelId: 'ficha-title', onClose: function() { if (_ficha) { _ficha.closeDialog = null; fichaClose(); } } });
    }
    return true;
}

/** Abrir una relación encima de la ficha actual (‹ regresa). */
function fichaPush(kind, ref) {
    if (!_ficha) return fichaOpen(kind, ref);
    _ficha.stack.push({ kind: kind, ref: ref });
    _fichaPaint(1);
}

function fichaBack() {
    if (!_ficha) return;
    if (_ficha.stack.length <= 1) { fichaClose(); return; }
    _ficha.stack.pop();
    _fichaPaint(-1);
}

function fichaClose() {
    if (!_ficha) return;
    var f = _ficha;
    _ficha = null;
    var el = document.getElementById('ficha');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.body.classList.remove('ficha-open');
    if (f.closeDialog) { try { f.closeDialog(); } catch (e) {} }
}

function _fichaPaint(dir) {
    var body = document.getElementById('ficha-body');
    if (!body || !_ficha) return;
    var top = _ficha.stack[_ficha.stack.length - 1];
    body.innerHTML = '<div class="ficha-page' + (dir > 0 ? ' uf-in' : dir < 0 ? ' uf-in-back' : '') + '">' + fichaHTML(fichaModel(top.kind, top.ref)) + '</div>';
    body.scrollTop = 0;
    var back = document.querySelector('#ficha .ficha-back');
    if (back) back.style.visibility = _ficha.stack.length > 1 ? 'visible' : 'hidden';
    var t = document.getElementById('ficha-title');
    if (t && t.focus) { t.setAttribute('tabindex', '-1'); try { t.focus({ preventScroll: true }); } catch (e) {} }
}

// Arrastrar la hoja hacia abajo desde su parte de arriba la cierra (como en el
// teléfono). Se detiene la propagación: el deslizar global entre plataformas
// escucha en `document`.
function _fichaGestures(el) {
    var sheet = el.querySelector('.ficha-sheet');
    var y0 = null, dy = 0;
    sheet.addEventListener('touchstart', function(e) {
        e.stopPropagation();
        var body = document.getElementById('ficha-body');
        var onTop = e.target.closest('.ficha-grip, .ficha-bar') || (body && body.scrollTop <= 0 && e.target.closest('.ficha-kicker, .ficha-title'));
        y0 = onTop && e.touches && e.touches.length === 1 ? e.touches[0].clientY : null; dy = 0;
    }, { passive: true });
    sheet.addEventListener('touchmove', function(e) {
        e.stopPropagation();
        if (y0 === null) return;
        dy = Math.max(0, e.touches[0].clientY - y0);
        sheet.style.transform = dy ? 'translateY(' + dy + 'px)' : '';
    }, { passive: true });
    sheet.addEventListener('touchend', function(e) {
        e.stopPropagation();
        if (y0 === null) return;
        sheet.style.transform = '';
        y0 = null;
        if (dy > 110) fichaClose();
    }, { passive: true });
}

// ── Buscar para el lanzador ──────────────────────────────────────────────

/**
 * Cosas (no pantallas) que empatan con lo tecleado, para Ctrl+K / "Busca una pantalla".
 * Cada resultado abre su ficha. Mínimo 3 letras. Devuelve {label, icon, cat, action}.
 */
function fichaSearch(q) {
    var f = typeof _uiFold === 'function' ? _uiFold : function(s) { return String(s || '').toLowerCase(); };
    var qf = f(String(q || '').trim());
    if (qf.length < 3) return [];
    var out = [];
    function add(kind, ref, label, meta) {
        out.push({ label: label, icon: FICHA_KINDS[kind].icon, cat: FICHA_KINDS[kind].label + (meta ? ' · ' + meta : ''),
                   action: function() { fichaOpen(kind, ref); } });
    }
    ((typeof db !== 'undefined' && db.vehicles) || []).forEach(function(v) {
        if (f((v.vin || '') + ' ' + (v.configCode || '')).indexOf(qf) >= 0) add('vehiculo', v.id, v.vin || '#' + v.id, (v.config && v.config['Modelo']) || '');
    });
    if (typeof invState !== 'undefined') {
        (invState.gases || []).forEach(function(g) {
            if (f([g.controlNo, g.formula, g.gasType, g.concNominal].join(' ')).indexOf(qf) >= 0) add('cilindro', g.id, (g.formula || g.gasType || '') + ' #' + (g.controlNo || ''), g.zone ? 'Zona ' + g.zone : '');
        });
        (invState.equipment || []).forEach(function(e) {
            if (f([e.name, e.kmmId, e.serialNo, e.magnitude].join(' ')).indexOf(qf) >= 0) add('instrumento', e.id, e.name, e.kmmId || '');
        });
    }
    ((typeof pnState !== 'undefined' && pnState.projects) || []).forEach(function(p) {
        if (!p.archived && f(p.name).indexOf(qf) >= 0) add('proyecto', p.id, p.name, '');
    });
    if (typeof tpConfigCatalog === 'function') {
        var n = 0;
        tpConfigCatalog().forEach(function(c) {
            if (n >= 5 || f(c.desc).indexOf(qf) < 0) return;
            n++;
            add('config', c.desc, typeof tpConfigShortName === 'function' ? tpConfigShortName(c) : c.desc, c.rgn || '');
        });
    }
    return out.slice(0, 12);
}
