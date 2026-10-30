// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [3.21.0] MAPA REGULATORIO — cada norma, contada por lo que la app    ║
// ║  hace cumplir                                                         ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Una ficha y una pantalla (Datos → 📚 Normas) por cada norma del laboratorio: límites,
// cómo se prueba aquí, cómo se juzga en el CoP, de dónde sale cada regla y qué del
// laboratorio vive bajo ella.
//
// REGLAS:
//  - NADA se escribe a mano aquí. Cada número sale de la constante o función que la app
//    usa para juzgar (perfiles de regulación, LAB_REGION_CAPTURE, COP_HQ_RULES, COP_GAS_A,
//    COP_ASSIGNED_DF, COP_CO2_TABLE, tpSoakHoursFor, VETS_IWR_WLTP, PDF_REQUIRED_FIELDS,
//    RELEASE_CHECKLIST…). Así el mapa no puede contradecir a la app: si cambia la regla,
//    cambia el mapa. tests/normas.node.js lo vigila.
//  - normaFacts(name, src) es PURA: `src` trae todo lo que lee (normaSource() lo arma).
//  - Las citas son las que el código ya usa en sus comentarios; no se inventan cláusulas.
//  - No escribe nada. La ficha y la pantalla solo leen y navegan.
//  - Chatear con la regulación NO vive aquí (no hay servidor): `normasMarkdown` exporta
//    las reglas en un .md para subirlo a un asistente junto con los PDF de las normas.

var NORMAS_CITAS = {
    gas: 'UN R154 §2.1.1 (= Reg. (UE) 2017/1151)',
    co2: 'UN R154 §3.3.1, Tabla A2/3 · Reg. (UE) 2017/1151, Anexo XXI Ap. I §4',
    traza: 'UN R154, Anexo B6 §2.6.8.3',
    lotes: 'Regla de corporativo (HQ) para el año calendario',
    sulev: 'LEV III / Tier 3'
};

/** Lo que se lee del estado vivo. Cada parte es opcional (typeof): un archivo que no cargó no rompe el mapa. */
function normaSource() {
    var src = {
        year: new Date().getFullYear(),
        profiles: (typeof getAllRegulationProfiles === 'function') ? getAllRegulationProfiles() : [],
        regionRules: (typeof LAB_REGION_CAPTURE !== 'undefined') ? LAB_REGION_CAPTURE : {},
        hqRules: (typeof COP_HQ_RULES !== 'undefined') ? COP_HQ_RULES : [],
        sharedBody: (typeof COP_WVTA_SHARED_BODY !== 'undefined') ? COP_WVTA_SHARED_BODY : [],
        gasA: (typeof COP_GAS_A !== 'undefined') ? COP_GAS_A : null,
        gasNmax: (typeof COP_GAS_NMAX !== 'undefined') ? COP_GAS_NMAX : null,
        df: (typeof COP_ASSIGNED_DF !== 'undefined') ? COP_ASSIGNED_DF : {},
        co2A: (typeof COP_CO2_A !== 'undefined') ? COP_CO2_A : null,
        co2Ns: Object.keys((typeof COP_CO2_TABLE !== 'undefined') ? COP_CO2_TABLE : {}).map(Number).sort(function(a, b) { return a - b; }),
        lot: { tests: (typeof COP_LOT_TESTS !== 'undefined') ? COP_LOT_TESTS : null,
               first: (typeof COP_LOT_FIRST !== 'undefined') ? COP_LOT_FIRST : null,
               next: (typeof COP_LOT_NEXT !== 'undefined') ? COP_LOT_NEXT : null },
        soakDefault: (typeof TP_SOAK_DEFAULT_H !== 'undefined') ? TP_SOAK_DEFAULT_H : null,
        soakFor: (typeof tpSoakHoursFor === 'function') ? function(reg) { return tpSoakHoursFor({ reg: reg }); } : null,
        iwr: (typeof VETS_IWR_WLTP !== 'undefined') ? VETS_IWR_WLTP : null,
        rmsse: (typeof VETS_RMSSE_WLTP_KMH !== 'undefined') ? VETS_RMSSE_WLTP_KMH : null,
        f05: ((typeof PDF_REQUIRED_FIELDS !== 'undefined') ? PDF_REQUIRED_FIELDS : []).map(function(f) { return { label: f.label, section: f.section }; }),
        checklist: (typeof RELEASE_CHECKLIST !== 'undefined') ? RELEASE_CHECKLIST : { objects: [], docs: [] },
        stages: (typeof CASCADE_STAGES !== 'undefined') ? CASCADE_STAGES : [],
        configs: [], families: {}, tests: {}
    };
    // Catálogo: cuántas configuraciones juzga cada norma (la de la región manda: México → NOM-042).
    var judged = function(reg, rgn) { return (typeof labRegionRegulation === 'function' && labRegionRegulation(reg, rgn)) || reg; };
    (typeof allConfigurations !== 'undefined' ? allConfigurations : []).forEach(function(c) {
        var reg = c['EMISSION REGULATION'] || '', rgn = c['REGION'] || '';
        var j = judged(reg, rgn);
        src.configs.push({ reg: reg, judged: j, region: rgn });
        if (typeof copVehicleFamilyKey === 'function') {
            var k = copVehicleFamilyKey({ config: c });
            (src.families[j] = src.families[j] || {})[k] = true;
        }
    });
    // Pruebas del año juzgadas con cada norma.
    var y = String(src.year);
    (typeof db !== 'undefined' && db && db.vehicles ? db.vehicles : []).forEach(function(v) {
        if (typeof vehicleIsPastTest === 'function' && !vehicleIsPastTest(v)) return;
        var d = (typeof vehicleTestDate === 'function') ? vehicleTestDate(v) : '';
        if (!d || d.slice(0, 4) !== y) return;
        var reg = (typeof _libGetVehicleRegulation === 'function') ? _libGetVehicleRegulation(v) : ((v.config || {})['EMISSION REGULATION'] || '');
        src.tests[reg] = (src.tests[reg] || 0) + 1;
    });
    return src;
}

function _nmKey(s) { return String(s == null ? '' : s).trim().toUpperCase(); }
function _nmNum(v) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    return String(Math.round(v * 1e6) / 1e6);
}

/**
 * LA descripción de una norma, compuesta de lo que la app aplica. PURA.
 * Devuelve null si la norma no existe en los perfiles del laboratorio.
 */
function normaFacts(name, src) {
    var key = _nmKey(name);
    var prof = (src.profiles || []).filter(function(p) { return _nmKey(p.name) === key; })[0];
    if (!prof) return null;
    var gases = (prof.gases || []).map(function(gs) {
        return { field: gs.field, label: gs.label || gs.field, unit: gs.unit, limit: (gs.limit === null || gs.limit === undefined) ? null : gs.limit,
                 captureUnit: gs.captureUnit || null };
    });

    // Reglas de región que tocan esta norma.
    var regions = [];
    Object.keys(src.regionRules || {}).forEach(function(rk) {
        var r = src.regionRules[rk];
        var m = r.regulation || {};
        var isTo = _nmKey(m.to) === key;
        var isFrom = (m.from || []).some(function(f) { return _nmKey(f) === key; });
        if (!isTo && !isFrom) return;
        regions.push({
            region: r.label || rk, gases: r.gases || [], unit: r.unit, units: r.units || [],
            text: isTo ? ('En ' + (r.label || rk) + ' el alta trae ' + (m.from || []).join(' / ') + ', pero se juzga con ' + prof.name + '. Se capturan ' + (r.gases || []).join(', ') + ' en ' + r.unit + '.')
                       : ('En ' + (r.label || rk) + ' esta norma NO se usa para juzgar: se juzga con ' + m.to + '. Aquí solo identifica la familia.')
        });
    });

    // Donde una regla de región juzga CON esta norma, se captura en la unidad de esa región
    // (México: g/mi), aunque el límite esté en otra. La conversión la hace la app (gasConvert).
    Object.keys(src.regionRules || {}).forEach(function(rk) {
        var r = src.regionRules[rk], m = r.regulation || {};
        if (_nmKey(m.to) !== key || !r.unit) return;
        var fields = (r.gases || []).map(_nmKey);
        gases.forEach(function(g) { if (fields.indexOf(_nmKey(g.field)) >= 0) g.captureUnit = r.unit; });
    });

    // CoP de corporativo.
    var cop = (src.hqRules || []).filter(function(r) { return _nmKey(r.reg) === key; }).map(function(r) {
        var text = r.rule === 'lot'
            ? (src.lot.tests + ' ensayos hasta ' + _nmFmtInt(src.lot.first) + ' unidades del año; ' + src.lot.tests + ' más por cada ' + _nmFmtInt(src.lot.next) + ' o fracción después')
            : '1 ensayo por familia con producción en el año';
        if (r.mod) text += ' (solo ' + r.mod + ')';   // [3.22.0] fila acotada a un modelo
        // [3.26.0] Modelos con UNA familia del WVTA para todas sus carrocerías.
        if (src.sharedBody && src.sharedBody.length) text += '. Una sola familia para todas las carrocerías (WVTA): ' + src.sharedBody.join(', ');
        return { region: r.region, label: r.label, rule: r.rule, mod: r.mod || '', text: text };
    });
    var df = src.df && src.df.PI ? src.df.PI : {};
    var gasMethod = cop.length ? {
        A: src.gasA, nmax: src.gasNmax, cite: NORMAS_CITAS.gas,
        df: gases.filter(function(gs) { return gs.limit !== null; }).map(function(gs) {
            var k = String(gs.field).toUpperCase().replace(/[^A-Z0-9]/g, '');
            return { field: gs.label, df: df[k] || 1, assigned: !!df[k] };
        }),
        pass: 'Xtests < ' + _nmNum(src.gasA) + '·L − VAR/L',
        fail: 'Xtests > ' + _nmNum(src.gasA) + '·L − ((n−3)/13)·VAR/L'
    } : null;
    var co2Method = cop.length && src.co2Ns.length ? {
        A: src.co2A, nMin: src.co2Ns[0], nMax: src.co2Ns[src.co2Ns.length - 1], cite: NORMAS_CITAS.co2
    } : null;

    var soak = src.soakFor ? src.soakFor(prof.name) : { hours: src.soakDefault, label: 'default del laboratorio' };
    var configs = (src.configs || []).filter(function(c) { return _nmKey(c.judged) === key; });
    var redirected = (src.configs || []).filter(function(c) { return _nmKey(c.reg) === key && _nmKey(c.judged) !== key; });
    var famKeys = Object.keys((src.families || {})[prof.name] || {});
    var limited = gases.filter(function(gs) { return gs.limit !== null; });

    var steps = [
        { id: 'alta', icon: '📝', title: 'Alta', req: 'Configuración del catálogo con norma ' + prof.name + (regions.some(function(r) { return /NO se usa/.test(r.text); }) ? ' (salvo la regla de región de abajo)' : '') + '.',
          where: 'Pruebas → Alta (cascada de configuración)' },
        { id: 'precond', icon: '🧰', title: 'Preacondicionamiento', req: 'Ciclo de preacondicionamiento, combustible, llantas y DTC antes de reposar.',
          where: 'Pruebas → Operación' },
        { id: 'soak', icon: '⏱', title: 'Reposo', req: _nmNum(soak.hours) + ' h (' + soak.label + ').',
          where: 'Pruebas → Operación (temporizador) · se cambia en Plan → Reglas' },
        { id: 'prueba', icon: '🚗', title: 'Prueba', req: 'Coeficientes Target y Dyno (A, B, C) y ETW capturados. Si la prueba es WLTP, el trazo de manejo debe cumplir IWR ' +
              (src.iwr ? (src.iwr.lo + ' a +' + src.iwr.hi + ' %') : '') + ' y RMSSE ≤ ' + _nmNum(src.rmsse) + ' km/h para que cuente en el CoP.',
          where: 'Pruebas → Operación · VETS adjunto', cite: NORMAS_CITAS.traza },
        { id: 'liberacion', icon: '✅', title: 'Liberación', req: limited.length
              ? 'Cada gas medido ≤ su límite: ' + limited.map(function(gs) { return gs.label + ' ' + _nmNum(gs.limit) + ' ' + gs.unit; }).join(' · ') + '. Sin factor de deterioro.'
              : 'Esta norma no tiene límites capturados: solo registra valores.',
          where: 'Liberación (✓ PASA / ✗ FALLA · % del límite)' },
        { id: 'aprobacion', icon: '🔏', title: 'Aprobación', req: 'Doble ciego: quien aprueba vuelve a capturar sin ver al liberador; coinciden a la precisión del valor más corto (2–3 cifras significativas). Hoja COP15-F05 completa (' + (src.f05 || []).length + ' datos).',
          where: 'Liberación → Aprobación' }
    ];
    if (cop.length) steps.push({ id: 'cop', icon: '📊', title: 'CoP', req: cop.map(function(c) { return c.label + ': ' + c.text; }).join(' · ') + '. Juicio de gases con DF asignado: ' + gasMethod.pass + ' pasa; ' + gasMethod.fail + ' falla.',
          where: 'CoP → Validador · Expediente · Hoja de HQ', cite: NORMAS_CITAS.gas });
    else steps.push({ id: 'cop', icon: '📊', title: 'CoP', req: 'Esta norma no está en el alcance de corporativo: sus pruebas no entran al juicio de conformidad.',
          where: 'CoP → Panorama (se declara como fuera del alcance)' });

    var docs = ((src.checklist || {}).docs || []).map(function(d) {
        return { label: d.label, when: d.rule === 'europe' ? 'Solo Europa' : d.rule === 'mexico' ? 'Solo certificación MX' : d.rule === 'f05' ? 'Siempre (se deriva del F05)' : 'Siempre' };
    });

    return {
        name: prof.name, shortName: prof.shortName || prof.name, gases: gases, regions: regions,
        cop: cop, gasMethod: gasMethod, co2Method: co2Method, soak: soak, steps: steps, docs: docs,
        objects: ((src.checklist || {}).objects || []).map(function(o) { return o.label; }),
        live: { configs: configs.length, redirected: redirected.length, families: famKeys.length, familyKeys: famKeys, tests: (src.tests || {})[prof.name] || 0, year: src.year },
        cite: _nmKey(prof.name) === 'SULEV 30' ? NORMAS_CITAS.sulev : ''
    };
}

function _nmFmtInt(n) { return (typeof n === 'number') ? n.toLocaleString('es-MX') : String(n); }

/** Las normas del laboratorio (nombres de los perfiles), en el orden de los perfiles. */
function normasList(src) { return (src.profiles || []).map(function(p) { return p.name; }); }

/** Una norma por su nombre, con el estado vivo. */
function normaModel(name) { return normaFacts(name, normaSource()); }

// ── Exportar para un asistente ───────────────────────────────────────────

/** Markdown de todas las normas (PURA sobre los hechos ya calculados). */
function normasMarkdown(facts, meta) {
    meta = meta || {};
    var L = [];
    L.push('# Reglas que aplica el Laboratorio de Emisiones (KIA EmLab)');
    L.push('');
    L.push('Generado por la plataforma ' + (meta.version ? 'v' + meta.version + ' ' : '') + (meta.date ? 'el ' + meta.date : '') + '.');
    L.push('Cada número sale de lo que la plataforma usa para juzgar. Para el texto completo de cada norma, consultar sus PDF oficiales.');
    facts.forEach(function(f) {
        if (!f) return;
        L.push('');
        L.push('## ' + f.name + (f.cite ? ' (' + f.cite + ')' : ''));
        L.push('');
        L.push('### Límites (valor medido, sin factor de deterioro)');
        f.gases.forEach(function(g) {
            L.push('- ' + g.label + ': ' + (g.limit === null ? 'informativo, sin límite' : '≤ ' + _nmNum(g.limit) + ' ' + g.unit) + (g.captureUnit && g.captureUnit !== g.unit ? ' (se captura en ' + g.captureUnit + ')' : ''));
        });
        if (f.regions.length) {
            L.push('');
            L.push('### Regla de región');
            f.regions.forEach(function(r) { L.push('- ' + r.text); });
        }
        L.push('');
        L.push('### Cómo se prueba en el laboratorio');
        f.steps.forEach(function(s, i) { L.push((i + 1) + '. **' + s.title + '**: ' + s.req + ' _(' + s.where + (s.cite ? '; ' + s.cite : '') + ')_'); });
        if (f.gasMethod) {
            L.push('');
            L.push('### Conformidad de producción (CoP)');
            f.cop.forEach(function(c) { L.push('- ' + c.label + ': ' + c.text + '.'); });
            L.push('- Gases (' + f.gasMethod.cite + '): EM = medido × DF + KI; pasa si ' + f.gasMethod.pass + '; falla si ' + f.gasMethod.fail + '; en medio, otra medición. A = ' + _nmNum(f.gasMethod.A) + ', n hasta ' + f.gasMethod.nmax + '.');
            L.push('- DF asignados: ' + f.gasMethod.df.map(function(d) { return d.field + ' ' + _nmNum(d.df); }).join(', ') + '.');
            if (f.co2Method) L.push('- CO₂ (' + f.co2Method.cite + '): A = ' + _nmNum(f.co2Method.A) + ', tabla para n = ' + f.co2Method.nMin + '…' + f.co2Method.nMax + '.');
        }
    });
    L.push('');
    return L.join('\n');
}

function normasExportMarkdown() {
    var src = normaSource();
    var facts = normasList(src).map(function(n) { return normaFacts(n, src); });
    var today = (typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0, 10);
    var md = normasMarkdown(facts, { version: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '', date: today });
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'reglas-laboratorio-' + today + '.md';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    if (typeof showToast === 'function') showToast('📤 Listo: súbelo a tu asistente junto con los PDF de las normas.', 'success');
}

// ── Ficha (tipo registrado en FICHA_KINDS) ───────────────────────────────

if (typeof FICHA_KINDS !== 'undefined') {
    FICHA_KINDS.norma = {
        icon: '📚', label: 'Norma',
        model: function(name) {
            var f = normaModel(name);
            if (!f) return null;
            var badges = [];
            if (f.cop.length) badges.push({ text: 'CoP: ' + f.cop.map(function(c) { return c.rule === 'lot' ? 'por lotes' : '1 por familia'; }).join(' · '), tone: 'info' });
            else badges.push({ text: 'Fuera del CoP', tone: 'muted' });
            if (f.regions.length) badges.push({ text: 'Regla de región', tone: 'warn' });
            var groups = [];
            groups.push({ icon: '📏', title: 'Límites (valor medido)', lines: f.gases.map(function(g) {
                return { text: g.label + ': ' + (g.limit === null ? 'informativo' : '≤ ' + _nmNum(g.limit) + ' ' + g.unit) };
            }) });
            if (f.regions.length) groups.push({ icon: '🌎', title: 'Regla de región', lines: f.regions.map(function(r) { return { text: r.text, tone: 'warn' }; }) });
            groups.push({ icon: '🗺️', title: 'Cómo se prueba aquí', lines: f.steps.map(function(s) {
                return { text: s.icon + ' ' + s.title + ': ' + s.req, whenText: s.where + (s.cite ? ' · ' + s.cite : '') };
            }) });
            var famLines = f.live.familyKeys.slice(0, 6).map(function(k) {
                var p = k.split('|');
                return { text: [p[0], p[1], p[2], p[3], p[7]].filter(Boolean).join(' · '), link: { kind: 'familia', ref: k } };
            });
            if (famLines.length) groups.push({ icon: '👪', title: 'Familias bajo esta norma', lines: famLines, more: Math.max(0, f.live.familyKeys.length - famLines.length) });
            return {
                kind: 'norma', ref: name, title: f.name,
                subtitle: f.live.configs + ' configuraciones · ' + f.live.families + ' familias · ' + f.live.tests + ' pruebas en ' + f.live.year,
                badges: badges, facts: [], relations: [], history: [], groups: groups,
                note: 'Todo sale de lo que la plataforma aplica: si cambia una regla, cambia aquí.' +
                      (f.live.redirected ? ' ' + f.live.redirected + ' configuraciones con esta norma en el alta se juzgan con otra por su región.' : ''),
                next: { label: '🗺️ Ver el mapa completo', js: "fichaClose();normasOpen('" + String(f.name).replace(/'/g, "\\'") + "')" }
            };
        }
    };
}

// ── Pantalla Datos → 📚 Normas ───────────────────────────────────────────

/** Abre la pantalla en una norma (desde la ficha o un "¿Por qué?"). */
function normasOpen(name, nodeId) {
    if (name && typeof uiPref === 'function') uiPref('normaSel', name);
    window._normasFocus = nodeId || null;
    if (typeof dashGo === 'function') dashGo('panel', 'pn-normas');
    else if (typeof pnSwitchTab === 'function') pnSwitchTab('pn-normas');
    if (typeof pnRender === 'function') setTimeout(function() { pnRender(); }, 60);
}

function normasSelect(name) {
    if (typeof uiPref === 'function') uiPref('normaSel', name);
    if (typeof pnRender === 'function') pnRender();
}

/** "¿Por qué?" junto a un veredicto: abre la ficha de la norma con que se juzgó. */
function normaWhyHTML(name, label) {
    if (!name || typeof fichaLinkHTML !== 'function') return '';
    var k = _nmKey(name);
    var exists = (typeof getAllRegulationProfiles === 'function') && getAllRegulationProfiles().some(function(p) { return _nmKey(p.name) === k; });
    if (!exists) return '';
    return fichaLinkHTML('norma', name, label || '¿Por qué?', 'nm-why');
}

function pnRenderNormas(el) {
    var src = normaSource();
    var names = normasList(src);
    var sel = (typeof uiPref === 'function') ? uiPref('normaSel') : null;
    if (!sel || names.indexOf(sel) === -1) sel = names[0];
    var f = sel ? normaFacts(sel, src) : null;
    var esc = (typeof escapeHtml === 'function') ? escapeHtml : function(s) { return String(s); };
    var h = (typeof helpBannerHTML === 'function') ? helpBannerHTML('pn-normas') : '';
    h += '<div class="nm-head"><div class="nm-chips" role="tablist" aria-label="Normas">' + names.map(function(n) {
        return '<button type="button" role="tab" aria-selected="' + (n === sel) + '" class="nm-chip' + (n === sel ? ' is-on' : '') + '" onclick="normasSelect(\'' + String(n).replace(/'/g, "\\'") + '\')">' + esc(n) + '</button>';
    }).join('') + '</div>' +
        '<button type="button" class="tp-btn" onclick="normasExportMarkdown()" title="Un archivo con todas las reglas, para subirlo a tu asistente junto con los PDF de las normas">📤 Exportar para tu asistente</button></div>';
    if (!f) { el.innerHTML = h + '<p class="nm-empty">No hay perfiles de regulación en este equipo.</p>'; return; }

    h += '<div class="nm-title"><h3>' + esc(f.name) + (f.cite ? ' <small>' + esc(f.cite) + '</small>' : '') + '</h3>' +
         '<p>' + f.live.configs + ' configuraciones · ' + f.live.families + ' familias · ' + f.live.tests + ' pruebas aprobadas en ' + f.live.year + '</p></div>';

    if (f.regions.length) h += f.regions.map(function(r) { return '<div class="nm-region">🌎 ' + esc(r.text) + '</div>'; }).join('');

    // El mapa: del alta al CoP, con la regla y dónde la verifica la app.
    h += '<ol class="nm-flow">' + f.steps.map(function(s) {
        return '<li class="nm-node' + (window._normasFocus === s.id ? ' is-focus' : '') + '" id="nm-node-' + s.id + '">' +
            '<div class="nm-node-head"><span aria-hidden="true">' + s.icon + '</span> ' + esc(s.title) + '</div>' +
            '<p class="nm-req">' + esc(s.req) + '</p>' +
            '<p class="nm-where">📍 ' + esc(s.where) + '</p>' +
            (s.cite ? '<p class="nm-cite">' + esc(s.cite) + '</p>' : '') + '</li>';
    }).join('') + '</ol>';

    // Límites
    h += '<div class="nm-grid"><section class="tp-card nm-card"><h4>📏 Límites</h4><table class="nm-table u-cards"><thead><tr><th>Gas</th><th>Límite</th><th>Se captura en</th></tr></thead><tbody>' +
        f.gases.map(function(g) {
            return '<tr><td>' + esc(g.label) + '</td><td>' + (g.limit === null ? '<span class="u-muted">informativo</span>' : '≤ ' + esc(_nmNum(g.limit)) + ' ' + esc(g.unit)) + '</td><td>' + esc(g.captureUnit || g.unit) + '</td></tr>';
        }).join('') + '</tbody></table><p class="nm-foot">Liberación compara el valor medido, sin factor de deterioro (decisión del laboratorio).</p></section>';

    // CoP
    if (f.gasMethod) {
        h += '<section class="tp-card nm-card"><h4>📊 Conformidad de producción</h4><ul class="nm-list">' +
            f.cop.map(function(c) { return '<li><b>' + esc(c.label) + '</b>: ' + esc(c.text) + '.</li>'; }).join('') + '</ul>' +
            '<p class="nm-formula">EM = medido × DF + KI<br>Pasa: ' + esc(f.gasMethod.pass) + '<br>Falla: ' + esc(f.gasMethod.fail) + '<br>En medio: otra medición · A = ' + esc(_nmNum(f.gasMethod.A)) + ' · n hasta ' + f.gasMethod.nmax + '</p>' +
            '<p class="nm-foot">DF asignados: ' + f.gasMethod.df.map(function(d) { return esc(d.field) + ' ' + esc(_nmNum(d.df)); }).join(' · ') + '<br>' + esc(f.gasMethod.cite) + '</p>' +
            (f.co2Method ? '<p class="nm-foot">CO₂: A = ' + esc(_nmNum(f.co2Method.A)) + ', tabla para n = ' + f.co2Method.nMin + '…' + f.co2Method.nMax + ' · ' + esc(f.co2Method.cite) + '</p>' : '') +
            '</section>';
    }

    // Liberación: checklist
    h += '<section class="tp-card nm-card"><h4>📋 Al liberar</h4><p class="nm-foot">Objetos retirados: ' + f.objects.map(esc).join(', ') + '.</p><ul class="nm-list">' +
        f.docs.map(function(d) { return '<li>' + esc(d.label) + ' <span class="u-muted">· ' + esc(d.when) + '</span></li>'; }).join('') + '</ul></section>';

    // En vivo
    if (f.live.familyKeys.length) {
        h += '<section class="tp-card nm-card"><h4>👪 Familias bajo esta norma</h4><div class="nm-fams">' + f.live.familyKeys.slice(0, 12).map(function(k) {
            var p = k.split('|');
            return (typeof fichaLinkHTML === 'function') ? fichaLinkHTML('familia', k, esc([p[0], p[1], p[2], p[3], p[7]].filter(Boolean).join(' · '))) : '';
        }).join('') + (f.live.familyKeys.length > 12 ? '<span class="u-muted">y ' + (f.live.familyKeys.length - 12) + ' más</span>' : '') + '</div></section>';
    }
    h += '</div>';
    el.innerHTML = h;
    if (window._normasFocus) {
        var n = document.getElementById('nm-node-' + window._normasFocus);
        if (n && n.scrollIntoView) setTimeout(function() { n.scrollIntoView({ block: 'center' }); }, 50);
        window._normasFocus = null;
    }
    if (typeof cascadeInjectTooltipsDeferred === 'function') cascadeInjectTooltipsDeferred();
}

// ── Ayuda que repite reglas: se genera de las mismas constantes ──────────
// El glosario decía "mínimo 12 h" (la app usa 24 h) y el tour del CoP describía el alcance
// anterior a 3.13.0. Se reescriben aquí, al parsear, desde las constantes vigentes.
(function normasFixHelp() {
    try {
        if (typeof HELP_GLOSSARY !== 'undefined' && Array.isArray(HELP_GLOSSARY)) {
            HELP_GLOSSARY.forEach(function(e) {
                if (e.term === 'Soak' && typeof TP_SOAK_DEFAULT_H !== 'undefined') {
                    e.def = 'Tiempo de reposo térmico del vehículo antes de la prueba, para que motor y fluidos lleguen a una temperatura estable. ' +
                        'En este laboratorio son ' + TP_SOAK_DEFAULT_H + ' h por defecto; se puede definir por norma o por familia en Plan → Reglas.';
                }
                if (/^CoP\b/.test(e.term) && typeof COP_GAS_A !== 'undefined') {
                    e.def = 'Conformidad de Producción: prueba estadística de que los vehículos de línea siguen cumpliendo los límites. ' +
                        'Gases con el método de ' + NORMAS_CITAS.gas + ' (A = ' + COP_GAS_A + ', DF asignado); CO₂ con ' + NORMAS_CITAS.co2 + '. ' +
                        'Alcance: ' + ((typeof copScopeLabel === 'function') ? copScopeLabel() : '') + '. Detalle en Datos → 📚 Normas.';
                }
            });
        }
        if (typeof TOURS !== 'undefined' && TOURS && Array.isArray(TOURS.cop) && typeof copScopeLabel === 'function') {
            TOURS.cop.forEach(function(st) {
                if (st && st.title === 'Qué NO cubre') st.text = 'El CoP solo juzga ' + copScopeLabel() + '. Lo que queda fuera se declara aquí, para que nadie suponga que se omitió por descuido.';
            });
        }
    } catch (e) { console.warn('normasFixHelp:', e); }
})();

if (typeof HELP_TABS !== 'undefined') {
    Object.assign(HELP_TABS, {
        'pn-normas': { title: 'Normas', text: 'Cada norma del laboratorio: sus límites, cómo se prueba aquí, cómo se juzga en el CoP y de dónde sale cada regla. Todo sale de lo que la plataforma aplica, así que no puede contradecirla.', tips: [
            'Toca "¿Por qué?" junto a un veredicto (Liberación o CoP) para llegar aquí desde la prueba.',
            '📤 Exportar para tu asistente genera un archivo con todas las reglas para subirlo junto con los PDF de las normas.',
            'Los límites se editan en Datos → Regulaciones; el reposo, en Plan → Reglas. Aquí solo se leen.'
        ] }
    });
}
