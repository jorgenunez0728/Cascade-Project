// ─── CoP Type 1 Validator — Cascade Module ───────────────────────────────────
// Validación estadística de Conformidad de Producción (CoP) Tipo 1
// Muestreo secuencial con σ desconocida — Appendix 2, UN R83 Rev.5 / R154
// VERIFICAR valores A(n)/B(n) contra texto oficial antes de uso en homologación

// ─── CO₂ — Verificación de familia, UN R154 (WLTP GTR) §3.3.1, Tabla A2/3 ────
// Fórmula y tabla verificadas contra el texto oficial (Excel de referencia con
// extracto de la norma adjunto, mismo texto que Reg. (UE) 2017/1151 Ap.1 §4 para
// el caso general de CO2/EC con A=1,01 y L=1). NO es el mismo test que gases
// (§3.1, tabla COP_CV de arriba): aquí no hay U ni división entre s — la banda
// se compara directo contra el promedio normalizado, así que se define aparte.
var COP_CO2_A = 1.01;
var COP_CO2_TABLE = {
    3:  { tP1: 1.686, tP2: 0.438, tF1: 1.686, tF2: 0.438 },
    4:  { tP1: 1.125, tP2: 0.425, tF1: 1.177, tF2: 0.438 },
    5:  { tP1: 0.850, tP2: 0.401, tF1: 0.953, tF2: 0.438 },
    6:  { tP1: 0.673, tP2: 0.370, tF1: 0.823, tF2: 0.438 },
    7:  { tP1: 0.544, tP2: 0.335, tF1: 0.734, tF2: 0.438 },
    8:  { tP1: 0.443, tP2: 0.299, tF1: 0.670, tF2: 0.438 },
    9:  { tP1: 0.361, tP2: 0.263, tF1: 0.620, tF2: 0.438 },
    10: { tP1: 0.292, tP2: 0.226, tF1: 0.580, tF2: 0.438 },
    11: { tP1: 0.232, tP2: 0.190, tF1: 0.546, tF2: 0.438 },
    12: { tP1: 0.178, tP2: 0.153, tF1: 0.518, tF2: 0.438 },
    13: { tP1: 0.129, tP2: 0.116, tF1: 0.494, tF2: 0.438 },
    14: { tP1: 0.083, tP2: 0.078, tF1: 0.473, tF2: 0.438 },
    15: { tP1: 0.040, tP2: 0.038, tF1: 0.455, tF2: 0.438 },
    16: { tP1: 0.000, tP2: 0.000, tF1: 0.438, tF2: 0.438 }
};

/**
 * LA definición del veredicto estadístico de CO₂ de una familia. El Excel de
 * referencia (con el extracto oficial adjunto) calcula DOS pruebas en paralelo
 * sobre el mismo x_i, como verificación cruzada — no es que sobre una:
 *
 *   x_i = (CO2_medido_i × EvC × FCF) / CO2_declarado_i
 *   X̄ = promedio de x_i · VAR = varianza muestral (n−1) · s = √VAR
 *
 *   PRINCIPAL — Reg. (UE) 2017/1151, Anexo XXI Apéndice I §4 (caso CO2/EC,
 *   A=1,01 y L=1 simplifican la fórmula general de gases a esto):
 *     Pasa  si X̄ <  A − VAR
 *     Falla si X̄ >  A − ((n−3)/13)·VAR
 *   Ésta es la que describe la conclusión ("A menos varianza").
 *
 *   CONFIRMACIÓN — UN R154 (WLTP GTR) §3.3.1, Tabla A2/3 (banda con t de
 *   Student por tamaño de muestra, más estrecha, pensada para Nivel 1A):
 *     Pasa  si X̄ ≤ A − (tP1+tP2)·s
 *     Falla si X̄ >  A + (tF1−tF2)·s
 *
 * A = 1,01 fijo por la norma en ambas — no es una tolerancia configurable
 * como en gases. FCF (Family Correction Factor) y EvC (Evolution Factor) SÍ
 * son de la familia (Ajustes → esta pantalla) y entran multiplicando el CO₂
 * medido, tal cual la hoja de referencia (columna CO2 = raw × EvC × FCF).
 *
 * Las dos fórmulas colapsan su banda exactamente en n=16 (verificado con los
 * valores cacheados del Excel: a n=16, (16−3)/13=1 → A−VAR = A−1·VAR, y
 * tP1=tP2=0 en la Tabla A2/3) — por eso ambas comparten el mismo tope de
 * muestra. Más allá de 16 se evalúa con esa fila tope y se marca `overSample`.
 *
 * rows = [{measured, target}, …] (mismo shape que homoCo2RowsForVins). Con
 * menos de 3 pares válidos devuelve decision:'SIN DATOS' — mismo criterio que
 * copCalcStats para gases.
 */
function copCo2CalcStats(rows, fcf, evc) {
    var f = (typeof fcf === 'number' && fcf > 0) ? fcf : 1;
    var e = (typeof evc === 'number' && evc > 0) ? evc : 1;
    var x = [];
    (rows || []).forEach(function(r) {
        var m = parseFloat(r.measured), t = parseFloat(r.target);
        if (!isFinite(m) || !isFinite(t) || t === 0) return;
        x.push({ vin: r.vin, measured: m, target: t, x: (m * e * f) / t });
    });
    var n = x.length;
    if (n < 3) return { n: n, mean: null, s: null, fcf: f, evc: e, A: COP_CO2_A, decision: 'SIN DATOS', x: x };

    var mean = x.reduce(function(s, r) { return s + r.x; }, 0) / n;
    var vr = x.reduce(function(acc, r) { return acc + Math.pow(r.x - mean, 2); }, 0) / (n - 1);
    var s = Math.sqrt(vr);
    var nClamped = Math.max(3, Math.min(n, 16));

    // ── Principal: Apéndice I §4 (VAR directa, sin tabla) ──
    var apPassBound = COP_CO2_A - vr;
    var apFailBound = COP_CO2_A - ((nClamped - 3) / 13) * vr;
    var apDecision = mean < apPassBound ? 'PASS' : mean > apFailBound ? 'FAIL' : 'CONTINUE';

    // ── Confirmación: R154 §3.3.1 (tabla t, banda más estrecha) ──
    var t = COP_CO2_TABLE[nClamped];
    var r154PassBound = COP_CO2_A - (t.tP1 + t.tP2) * s;
    var r154FailBound = COP_CO2_A + (t.tF1 - t.tF2) * s;
    var r154Decision = mean <= r154PassBound ? 'PASS' : mean > r154FailBound ? 'FAIL' : 'CONTINUE';

    return {
        n: n, mean: mean, s: s, var: vr, fcf: f, evc: e, A: COP_CO2_A,
        overSample: n > 16, x: x,
        // Compatibilidad de nivel superior = la prueba PRINCIPAL (Apéndice I):
        // así el resto de la pantalla (gauge, conclusión, congelado del juicio)
        // no necesita saber que hay dos pruebas para pintar el veredicto de arriba.
        decision: apDecision, passBound: apPassBound, failBound: apFailBound,
        appendixI: { decision: apDecision, passBound: apPassBound, failBound: apFailBound, source: 'Reg. (UE) 2017/1151 Anexo XXI Apéndice I §4' },
        r154: { decision: r154Decision, passBound: r154PassBound, failBound: r154FailBound, table: t, tableN: nClamped, source: 'UN R154 (WLTP GTR) §3.3.1 — Tabla A2/3' }
    };
}

/**
 * Los FCF/Evolution Factor de una familia. Sin `key`, la que está abierta.
 * Sin ajustar, 1 = sin corrección. Acepta `key` explícito para el PDF, que
 * puede exportar una familia distinta a la que está abierta en pantalla.
 */
function copCo2Factors(key) {
    var fam = copFamilyState(key || copState.familyKey);
    return {
        fcf: (typeof fam.co2Fcf === 'number' && fam.co2Fcf > 0) ? fam.co2Fcf : 1,
        evc: (typeof fam.co2Evc === 'number' && fam.co2Evc > 0) ? fam.co2Evc : 1,
        set: !!(fam.co2Fcf || fam.co2Evc)
    };
}

/** Guarda FCF/Evolution Factor de la familia abierta. Ahí es "settings, por familia". */
function copSetCo2Factors(fcfRaw, evcRaw) {
    var f = parseFloat(fcfRaw), e = parseFloat(evcRaw);
    if (!isFinite(f) || f <= 0 || !isFinite(e) || e <= 0) {
        if (typeof showToast === 'function') showToast('FCF y Evolution Factor deben ser números mayores a 0.', 'warning');
        return;
    }
    var fam = copFamilyState(copState.familyKey);
    fam.co2Fcf = f; fam.co2Evc = e;
    fam.updatedAt = new Date().toISOString();
    fam.updatedBy = _copWho();
    copPersist();
    _copPushNow();
    if (typeof auditLog === 'function') {
        auditLog('cop', 'co2_factors_set', { type: 'cop', label: copState.familyLabel || '(sin familia)' },
                 'FCF=' + f + ' · Evolution Factor=' + e);
    }
    // copRenderStats() SOLO repinta #cop-stats-section (dentro de copBuildStatsHTML) —
    // la tarjeta de CO2 vive en copBuildValidatorHTML, un nivel arriba de esa sección,
    // así que un repintado parcial la deja mostrando el veredicto viejo. copRender()
    // completo es correcto aquí: a diferencia de copHandleInput (que corre en cada
    // tecla), esto solo dispara al pulsar "Guardar".
    copRender();
    if (typeof showToast === 'function') showToast('Factores de CO₂ guardados — el veredicto se recalculó.', 'success');
}

/** La frase de conclusión, con los números reales — lo que pide una auditoría. */
/**
 * La frase de conclusión, con los números reales. Usa la prueba PRINCIPAL
 * (Apéndice I, "A menos varianza") y agrega una línea de confirmación con la
 * prueba de R154 §3.3.1 — si las dos coinciden lo dice de pasada; si NO
 * coinciden lo declara en rojo, porque eso es justo lo que un auditor necesita
 * ver antes de aceptar la familia.
 */
function copCo2ConclusionHTML(stats) {
    if (!stats || stats.decision === 'SIN DATOS' || !stats.appendixI) return '';
    var ap = stats.appendixI, r154 = stats.r154;
    var boundTxt, cmpTxt;
    if (ap.decision === 'PASS') {
        boundTxt = 'A − VAR = ' + stats.A.toFixed(2) + ' − ' + stats.var.toFixed(6) + ' = ' + ap.passBound.toFixed(4);
        cmpTxt = 'X̄ = ' + stats.mean.toFixed(4) + ' es menor que ' + boundTxt;
    } else if (ap.decision === 'FAIL') {
        boundTxt = 'A − ((n−3)/13)·VAR = ' + ap.failBound.toFixed(4);
        cmpTxt = 'X̄ = ' + stats.mean.toFixed(4) + ' supera ' + boundTxt;
    } else {
        cmpTxt = 'X̄ = ' + stats.mean.toFixed(4) + ' cae entre ' + ap.passBound.toFixed(4) + ' y ' + ap.failBound.toFixed(4) + ' — todavía sin decidir';
    }
    var frase = ap.decision === 'PASS'
        ? 'Como ' + cmpTxt + ' (n=' + stats.n + ' ensayos), <b>se acepta la familia</b> — el CO₂ CONCUERDA con el valor declarado.'
        : ap.decision === 'FAIL'
        ? 'Como ' + cmpTxt + ' (n=' + stats.n + ' ensayos), <b>se rechaza la familia</b> — el CO₂ NO CONCUERDA con el valor declarado.'
        : cmpTxt + ' (n=' + stats.n + ' de hasta 16 ensayos): hace falta otro vehículo para decidir.';
    var icon = ap.decision === 'PASS' ? '✅' : ap.decision === 'FAIL' ? '❌' : '⏳';

    var coincide = r154.decision === ap.decision;
    var confirm = coincide
        ? '<span style="opacity:0.8;">Confirma UN R154 §3.3.1 (Tabla A2/3): ' + _copDecisionWord(r154.decision) + '.</span>'
        : '<b style="color:var(--danger-text,#991b1b);">⚠ UN R154 §3.3.1 da ' + _copDecisionWord(r154.decision) + ' — las dos pruebas NO coinciden, revisar antes de aceptar.</b>';

    return '<p class="cop-co2-conclusion cop-co2-conclusion--' + ap.decision.toLowerCase() + '">' + icon + ' ' + frase +
           (stats.overSample ? ' <span style="opacity:0.75;">(n&gt;16: evaluado con la fila tope, n=16.)</span>' : '') +
           '<br>' + confirm + '</p>';
}

// ─── VALORES CRÍTICOS A(n) B(n) — Test t secuencial ─────────────────────────
var COP_CV = {
    3:  { a: -0.860, b: 2.117 },
    4:  { a: -0.233, b: 1.883 },
    5:  { a:  0.112, b: 1.796 },
    6:  { a:  0.321, b: 1.720 },
    7:  { a:  0.474, b: 1.694 },
    8:  { a:  0.593, b: 1.659 },
    9:  { a:  0.688, b: 1.634 },
    10: { a:  0.770, b: 1.613 },
    11: { a:  0.839, b: 1.597 },
    12: { a:  0.900, b: 1.582 },
    13: { a:  0.952, b: 1.570 },
    14: { a:  0.998, b: 1.559 },
    15: { a:  1.039, b: 1.550 },
    16: { a:  1.075, b: 1.541 },
    17: { a:  1.108, b: 1.534 },
    18: { a:  1.138, b: 1.527 },
    19: { a:  1.165, b: 1.521 },
    20: { a:  1.190, b: 1.515 },
};

// ─── LÍMITES DE EMISIÓN Euro 6 ────────────────────────────────────────────────
var COP_PI_LIMITS = [
    { id: 'CO',   label: 'CO',    limit: 1.0000, unit: 'g/km', active: true  },
    { id: 'THC',  label: 'THC',   limit: 0.1000, unit: 'g/km', active: true  },
    { id: 'NMHC', label: 'NMHC',  limit: 0.0680, unit: 'g/km', active: true  },
    { id: 'NOx',  label: 'NOₓ',   limit: 0.0600, unit: 'g/km', active: true  },
    { id: 'PM',   label: 'PM',    limit: 0.0045, unit: 'g/km', active: false, note: 'solo DI' },
    { id: 'PN',   label: 'PN',    limit: 6.0e11, unit: '#/km', active: false, note: 'solo DI', isPn: true },
];

var COP_CI_LIMITS = [
    { id: 'CO',    label: 'CO',     limit: 0.5000, unit: 'g/km', active: true },
    { id: 'HCNOx', label: 'HC+NOₓ', limit: 0.1700, unit: 'g/km', active: true },
    { id: 'NOx',   label: 'NOₓ',    limit: 0.0800, unit: 'g/km', active: true },
    { id: 'PM',    label: 'PM',     limit: 0.0045, unit: 'g/km', active: true },
    { id: 'PN',    label: 'PN',     limit: 6.0e11, unit: '#/km', active: true, isPn: true },
];

var COP_FUEL_LIMITS = {
    'PI':         COP_PI_LIMITS,
    'CI':         COP_CI_LIMITS,
    'Híbrido PI': COP_PI_LIMITS,
    'Híbrido CI': COP_CI_LIMITS,
};

// ═══════════════════════════════════════════════════════════════════════════════
// [v19.0] ALCANCE DEL CoP
// El laboratorio hace CoP únicamente sobre EURO-5 / EURO-6E / PRE-EURO 7 en las
// regiones EUROPE y MIDDLE EAST. El resto del catálogo (EURO-2/3/4, SULEV 30,
// BRAZIL L8, EVs) se prueba pero NO entra al juicio de conformidad.
//
// Esto además tapa un agujero real: COP_PI_LIMITS/COP_CI_LIMITS tienen los límites
// Euro 6 escritos a fuego y NUNCA consultan getRegulationProfile(). Fuera de este
// alcance eso juzga mal — EURO-2 (CO 2.2 real vs 1.0 aplicado) y EURO-4 (NOx 0.08
// vs 0.06) salen NO CONCORDANTE sin serlo, y SULEV 30 se compara en g/km contra
// datos capturados en g/mi, que es el sentido peligroso (aprobar lo que falla).
// DENTRO del alcance no hay problema: EURO-5, EURO-6C/6E y PRE-EURO 7 comparten
// exactamente estos valores. copLimitsForFamily() lo verifica en cada render en
// vez de confiar en que siga siendo cierto.
// ═══════════════════════════════════════════════════════════════════════════════
var COP_SCOPE_DEFAULT = {
    regulations: ['EURO-5', 'EURO-6E', 'PRE-EURO 7'],
    regions:     ['EUROPE', 'MIDDLE EAST']
};

/** Normaliza para comparar normas/regiones: sin acentos, sin separadores, mayúsculas. */
function _copNormKey(s) {
    return String(s == null ? '' : s)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[\s\-_/.]+/g, '');
}

/** El alcance vigente (los defaults son editables desde el Panorama). */
function copScope() {
    var s = (typeof copState !== 'undefined' && copState.scope) ? copState.scope : null;
    return {
        regulations: (s && Array.isArray(s.regulations) && s.regulations.length) ? s.regulations : COP_SCOPE_DEFAULT.regulations,
        regions:     (s && Array.isArray(s.regions)     && s.regions.length)     ? s.regions     : COP_SCOPE_DEFAULT.regions
    };
}

function copScopeHasReg(reg) {
    var k = _copNormKey(reg);
    if (!k) return false;
    return copScope().regulations.some(function(r) { return _copNormKey(r) === k; });
}
function copScopeHasRegion(rgn) {
    var k = _copNormKey(rgn);
    if (!k) return false;
    // EUROPA/EUROPE son la misma región (homoIsEurope acepta ambas).
    if (k === 'EUROPA') k = 'EUROPE';
    return copScope().regions.some(function(r) {
        var rk = _copNormKey(r);
        return rk === k || (rk === 'EUROPE' && k === 'EUROPE');
    });
}

/**
 * LA definición de "esto entra al CoP". Acepta una config del plan (`{rgn, reg}`) o
 * un vehículo de db.vehicles (`{config:{REGION, 'EMISSION REGULATION'}}`).
 * Devuelve {ok, reason} — el motivo se muestra en pantalla: lo que queda fuera se
 * declara, nunca se oculta en silencio.
 */
function copInScope(x) {
    if (!x) return { ok: false, reason: 'sin datos' };
    var cfg = x.config || x;
    var rgn = cfg['REGION'] || cfg.rgn || x.rgn || '';
    var reg = cfg['EMISSION REGULATION'] || cfg.reg || x.reg || '';
    if (!copScopeHasRegion(rgn)) return { ok: false, reason: 'región ' + (rgn || '(sin región)') + ' fuera del alcance CoP', kind: 'region', region: rgn, reg: reg };
    if (!copScopeHasReg(reg))    return { ok: false, reason: 'norma ' + (reg || '(sin norma)') + ' fuera del alcance CoP', kind: 'regulation', region: rgn, reg: reg };
    return { ok: true, reason: '', region: rgn, reg: reg };
}

// ─── CACHE DEL PANORAMA ───────────────────────────────────────────────────────
// copPortfolioRows() recorre db.vehicles × familias × gases y la consume también
// pnGetActiveAlerts, que corre en CADA render del Panel. Sin memo el Panel se
// arrastra. La clave es barata a propósito: no se serializa nada.
var _copRev = 0;
var _copPortfolioCache = null;
function _copBumpRev() { _copRev++; _copPortfolioCache = null; }
function copInvalidateCache() { _copBumpRev(); }

// ─── ESTADO ───────────────────────────────────────────────────────────────────
var COP_LS_KEY = 'kia_cop_v1';
var copState = {
    view:          'overview', // 'overview' | 'validator' | 'spc' | 'dossier'
    regulation:    'R154',
    fuelType:      'PI',
    region:        '',      // filtro de región para el selector de familia
    familyKey:     '',      // familia seleccionada (misma clave que el Plan)
    familyLabel:   '',
    activePolls:   null,
    vehicles:      null,    // filas = VINes: {id, vin, values:{pollId}, source:'auto'|'manual'}
    showTable:     false,
    showFormula:   false,
    _lastDecision: null,
    saved:         [],      // juicios guardados
    spc:           null,    // estado de la sub-pestaña Control SPC
    scope:         null,    // alcance CoP (null = COP_SCOPE_DEFAULT) — ver copScope()
};

function copPersist() {
    try {
        localStorage.setItem(COP_LS_KEY, JSON.stringify({
            view: copState.view, regulation: copState.regulation, fuelType: copState.fuelType,
            region: copState.region, familyKey: copState.familyKey, familyLabel: copState.familyLabel,
            activePolls: copState.activePolls, vehicles: copState.vehicles, saved: copState.saved,
            spc: copState.spc, scope: copState.scope,
            present: copState.present, ovFilter: copState.ovFilter,
            families: copState.families, copSchema: copState.copSchema
        }));
        _copBumpRev();
        return true;
    } catch (e) {
        console.error('copPersist: no se pudo guardar', e);
        if (typeof showToast === 'function') showToast('⚠️ Almacenamiento lleno — el CoP no se guardó. Libera espacio en Panel → Sistema.', 'error');
        return false;
    }
}
function copLoad() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(COP_LS_KEY)); } catch (e) {}
    if (raw && typeof raw === 'object') {
        ['view','regulation','fuelType','region','familyKey','familyLabel','activePolls','vehicles','saved','spc','scope','present','ovFilter','families','copSchema'].forEach(function(k) {
            if (raw[k] !== undefined && raw[k] !== null) copState[k] = raw[k];
        });
    }
}
var _copLoaded = false;
function copInitState() {
    if (!_copLoaded) { copLoad(); _copLoaded = true; }
    if (!copState.activePolls) {
        copState.activePolls = {};
        (COP_FUEL_LIMITS[copState.fuelType] || COP_PI_LIMITS).forEach(function(p) { copState.activePolls[p.id] = p.active; });
    }
    if (!copState.vehicles || !copState.vehicles.length) {
        copState.vehicles = [
            { id: 1, vin: '', values: {}, source: 'manual' },
            { id: 2, vin: '', values: {}, source: 'manual' },
            { id: 3, vin: '', values: {}, source: 'manual' },
        ];
    }
    if (!copState.saved) copState.saved = [];
    if (!copState.spc || typeof copState.spc !== 'object') {
        copState.spc = { familyKey: '', gas: '', showZones: true, showLimit: true, pctMode: false, allScopes: false };
    }
    if (copState.spc.allScopes === undefined) copState.spc.allScopes = false;
    if (['overview','validator','spc','dossier'].indexOf(copState.view) === -1) copState.view = 'overview';

    // ── Migración a mesa de trabajo por familia (v19.0) ───────────────────────
    // IDEMPOTENTE a propósito: copSyncReload() la vuelve a ejecutar en cada pull
    // de Firebase, así que no puede duplicar ni volver a sembrar nada.
    if (!copState.families) copState.families = {};
    if (copState.copSchema !== 2) {
        var tieneAlgo = (copState.vehicles || []).some(function(v) {
            return v.vin || Object.keys(v.values || {}).length;
        });
        if (copState.familyKey && tieneAlgo && !copState.families[copState.familyKey]) {
            copState.families[copState.familyKey] = {
                key: copState.familyKey,
                vehicles: copState.vehicles,
                activePolls: JSON.parse(JSON.stringify(copState.activePolls || {})),
                fuelType: copState.fuelType, regulation: copState.regulation,
                updatedAt: new Date().toISOString(), updatedBy: ''
            };
        }
        copState.copSchema = 2;
    }

    // ── [v20.8] La carrocería entró a la clave de familia (7 → 8 segmentos) ───
    // Idempotente (solo actúa sobre claves de 7 segmentos) y corre también tras cada
    // pull de sync, porque un dispositivo sin actualizar puede reintroducir claves
    // viejas. Una mesa de trabajo vieja solo se adopta si la familia tenía UNA sola
    // carrocería en el catálogo (los VINes capturados son de una carrocería concreta
    // — repartirlos a ciegas sería inventar); si tenía varias, se queda con su clave
    // vieja, inofensiva. `ovHidden` sí se duplica a todas: ocultar era una intención
    // sobre el grupo entero. Los juicios guardados NUNCA se reescriben — se empatan
    // por prefijo en _copJudgmentMatchesFamily.
    try {
        var _bodiesOf = function(oldKey) {
            var out = {};
            if (typeof tpState === 'object' && tpState && Array.isArray(tpState.planData) &&
                typeof tpFamilyKeyForCfg === 'function') {
                tpState.planData.forEach(function(c) {
                    var nk = tpFamilyKeyForCfg(c);
                    if (nk.split('|').slice(0, 7).join('|') === oldKey) out[nk] = true;
                });
            }
            return Object.keys(out);
        };
        Object.keys(copState.families).forEach(function(k) {
            if (String(k).split('|').length !== 7) return;
            var nks = _bodiesOf(k);
            if (nks.length === 1 && !copState.families[nks[0]]) {
                copState.families[nks[0]] = copState.families[k];
                copState.families[nks[0]].key = nks[0];
                delete copState.families[k];
                if (copState.familyKey === k) copState.familyKey = nks[0];
            }
        });
        if (copState.ovHidden) {
            Object.keys(copState.ovHidden).forEach(function(k) {
                if (String(k).split('|').length !== 7) return;
                _bodiesOf(k).forEach(function(nk) { copState.ovHidden[nk] = true; });
                delete copState.ovHidden[k];
            });
        }
        // Selecciones de UI con clave vieja que no se pudo remapear: a limpio.
        if (copState.familyKey && String(copState.familyKey).split('|').length === 7) {
            var _nksSel = _bodiesOf(copState.familyKey);
            copState.familyKey = _nksSel.length === 1 ? _nksSel[0] : '';
            if (!copState.familyKey) copState.familyLabel = '';
        }
        if (copState.spc && copState.spc.familyKey && String(copState.spc.familyKey).split('|').length === 7) {
            var _nksSpc = _bodiesOf(copState.spc.familyKey);
            copState.spc.familyKey = _nksSpc.length === 1 ? _nksSpc[0] : '';
        }
    } catch (e) {}

    // Reengancha el alias tras un copLoad() (el array recuperado del disco es otro
    // objeto que el guardado dentro de families).
    if (copState.familyKey && copState.families[copState.familyKey]) {
        var _f = copState.families[copState.familyKey];
        if (_f.vehicles && _f.vehicles.length) copState.vehicles = _f.vehicles;
        else _f.vehicles = copState.vehicles;
    }
}

// Recargar copState desde localStorage (lo usa Firebase sync tras hacer pull/merge).
function copSyncReload() {
    _copLoaded = false;
    copInitState();
    _copBumpRev();
    if (!document.getElementById('platform-cop') || typeof copRender !== 'function') return;
    // v19.0: si el técnico está capturando un valor, un pull de la nube le borraba
    // lo que llevaba escrito (copRender rehace el innerHTML entero). Se difiere el
    // repintado hasta que suelte el campo.
    var ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.closest && ae.closest('#platform-cop')) {
        if (!_copPendingRender) {
            _copPendingRender = true;
            ae.addEventListener('blur', function once() {
                ae.removeEventListener('blur', once);
                _copPendingRender = false;
                if (document.getElementById('platform-cop')) copRender();
            });
        }
        return;
    }
    copRender();
}
var _copPendingRender = false;

// ═══════════════════════════════════════════════════════════════════════════════
// [v19.0] MESA DE TRABAJO POR FAMILIA
//
// Hasta v18.6 existía UNA sola tabla (`copState.vehicles`) y copAutoPopulateVins la
// reasignaba entera al elegir familia: cambiar de familia borraba sin avisar lo que
// se había capturado a mano en la anterior. Con 45 configuraciones en el alcance eso
// hace imposible llevar varias familias en paralelo, que es el trabajo real.
//
// `copState.vehicles` SIGUE existiendo como ALIAS VIVO del array de la familia
// abierta, así que los ~20 sitios que leen o mutan elementos no se tocan. El único
// punto autorizado de REASIGNACIÓN es _copSetVehicles().
//
// REGLA: nunca escribir `copState.vehicles = ...` directo. Siempre _copSetVehicles().
// ═══════════════════════════════════════════════════════════════════════════════

/** Estado guardado de una familia (lo crea si no existía). */
function copFamilyState(key) {
    if (!copState.families) copState.families = {};
    var k = key || '';
    if (!copState.families[k]) {
        copState.families[k] = {
            key: k, vehicles: null,
            activePolls: JSON.parse(JSON.stringify(copState.activePolls || {})),
            fuelType: copState.fuelType, regulation: copState.regulation,
            updatedAt: '', updatedBy: ''
        };
    }
    return copState.families[k];
}

/** ÚNICO punto de reasignación del array. Mantiene el alias y sella la familia. */
function _copSetVehicles(arr) {
    copState.vehicles = arr;
    var f = copFamilyState(copState.familyKey);
    f.vehicles = arr;
    f.activePolls = JSON.parse(JSON.stringify(copState.activePolls || {}));
    f.fuelType = copState.fuelType;
    f.regulation = copState.regulation;
    f.updatedAt = new Date().toISOString();
    f.updatedBy = _copWho();
}

/** Abre la mesa de trabajo de una familia: la recupera si ya existía. */
function _copOpenFamilyState(key) {
    var f = copFamilyState(key);
    if (f.vehicles && f.vehicles.length) {
        copState.vehicles = f.vehicles;           // MISMA referencia: el alias vive
        if (f.activePolls) copState.activePolls = f.activePolls;
        if (f.fuelType) copState.fuelType = f.fuelType;
        if (f.regulation) copState.regulation = f.regulation;
        return true;
    }
    return false;
}

// ─── FAMILIA + VINes + GUARDADO ──────────────────────────────────────────────
function _copEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function copPlanData() { return (typeof tpState !== 'undefined' && tpState.planData) ? tpState.planData : []; }
function copRegions() {
    // Solo las regiones del alcance que además existen en el plan importado.
    var set = {};
    copPlanData().forEach(function(c) { if (c.rgn && copScopeHasRegion(c.rgn)) set[c.rgn] = true; });
    return Object.keys(set).sort();
}

/**
 * [v19.0] Lo que queda FUERA del alcance CoP, agrupado por motivo. El Panorama lo
 * declara — una configuración que no aparece porque se filtró es exactamente el tipo
 * de omisión que un auditor pregunta.
 */
function copOutOfScopeSummary() {
    var byReason = {}, total = 0;
    copPlanData().forEach(function(c) {
        var s = copInScope(c);
        if (s.ok) return;
        total++;
        var label = s.kind === 'region' ? ('Región ' + (s.region || '(sin región)'))
                                        : ('Norma ' + (s.reg || '(sin norma)'));
        if (!byReason[label]) byReason[label] = { label: label, kind: s.kind, n: 0 };
        byReason[label].n++;
    });
    return {
        total: total,
        groups: Object.keys(byReason).map(function(k) { return byReason[k]; })
                      .sort(function(a, b) { return b.n - a.n; })
    };
}

// Familias reusando el MISMO agrupamiento del Plan (tpFamilyKeyForCfg).
// v19.0: solo las del alcance CoP (copInScope).
function copFamilies() {
    var fams = {};
    copPlanData().forEach(function(c) {
        if (typeof tpFamilyKeyForCfg !== 'function') return;
        if (!copInScope(c).ok) return;
        var k = tpFamilyKeyForCfg(c);
        if (!fams[k]) fams[k] = { key: k, mod: c.mod, eng: c.eng, tx: c.tx, my: c.my, reg: c.reg,
                                  ep: (c.ep && c.ep !== '0') ? c.ep : '',
                                  engpkg: (c.engpkg && c.engpkg !== '0') ? c.engpkg : '',
                                  body: (c.body && c.body !== '0') ? c.body : '', rgns: {} };
        if (c.rgn) fams[k].rgns[c.rgn] = true;
    });
    return Object.keys(fams).map(function(k) {
        var f = fams[k];
        // v20.8: el tren motriz (MILD HEV, HIGH/LOW POWER) y la carrocería SON parte del
        // nombre — dos familias que solo difieren en eso se veían idénticas en pantalla.
        f.label = [f.mod, f.eng, f.tx, f.my, f.reg, f.ep, f.engpkg, f.body].filter(Boolean).join(' · ');
        f.regionsArr = Object.keys(f.rgns);
        return f;
    }).sort(function(a, b) { return a.label < b.label ? -1 : a.label > b.label ? 1 : 0; });
}
// Clave de familia derivada de un vehículo COP15 (db.vehicles) — replica tpFamilyKeyForCfg con headers crudos.
function copVehicleFamilyKey(v) {
    var cfg = (v && v.config) ? v.config : {};
    var mod = cfg['Modelo'] || '', eng = cfg['ENGINE CAPACITY'] || '', tx = cfg['TRANSMISSION'] || '',
        my = cfg['MODEL YEAR (VIN)'] || '', reg = cfg['EMISSION REGULATION'] || '',
        ep = cfg['ENVIRONMENT PACKAGE'] || '', engpkg = cfg['ENGINE PACKAGE'] || '',
        body = cfg['BODY TYPE'] || '';
    return mod + '|' + eng + '|' + tx + '|' + my + '|' + reg + '|' + ((ep && ep !== '0') ? ep : '') + '|' + ((engpkg && engpkg !== '0') ? engpkg : '') + '|' + ((body && body !== '0') ? body : '');
}

// [v20.8] La clave de familia pasó de 7 a 8 segmentos (entró la carrocería). Los
// juicios guardados con la clave vieja NO se reescriben — son evidencia congelada —
// sino que se EMPATAN por prefijo: el juicio de la familia combinada de entonces
// cubría ambas carrocerías, así que aparece en la historia de las dos.
function _copFamKeyLegacy(key) {
    var p = String(key || '').split('|');
    return p.length >= 8 ? p.slice(0, 7).join('|') : null;
}
function _copJudgmentMatchesFamily(j, familyKey) {
    if (!j || !j.familyKey) return false;
    if (j.familyKey === familyKey) return true;
    var legacy = _copFamKeyLegacy(familyKey);
    return !!legacy && j.familyKey === legacy;
}
function copSetRegion(r) { copState.region = r; copState.familyKey = ''; copState.familyLabel = ''; copPersist(); copRender(); }
function copSelectFamily(key) {
    copState.familyKey = key;
    var fam = copPortfolioRows().find(function(f) { return f.key === key; })
           || copFamilies().find(function(f) { return f.key === key; });
    copState.familyLabel = fam ? fam.label : '';
    if (key) {
        // Si esta familia ya tenía mesa de trabajo, se recupera tal cual quedó; si no,
        // se ARRANCA EN LIMPIO antes de sembrarla desde los vehículos probados. Sin ese
        // borrón, copState.vehicles seguía apuntando al array de la familia anterior y
        // la nueva heredaba sus VINes (incluidos los capturados a mano).
        if (!_copOpenFamilyState(key)) copState.vehicles = [];
        copSyncVinsFromTests(key);
    }
    copPersist(); copRender();
}

/**
 * [v19.0] Sincroniza la tabla con los vehículos ya probados de la familia.
 * Reemplaza a copAutoPopulateVins, que REEMPLAZABA la tabla entera.
 *
 * Reglas, en este orden:
 *   1. Las filas manuales no se tocan nunca.
 *   2. Una celda con valor NO se sobrescribe jamás. Si el laboratorio tiene otro
 *      número, se marca la fila `staleAuto` y se avisa — reescribir en silencio un
 *      valor sobre el que ya se emitió un juicio es exactamente el hallazgo que este
 *      módulo existe para evitar.
 *   3. Los VINes probados que no estén en la tabla se agregan.
 */
function copSyncVinsFromTests(key) {
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var rows = (copState.vehicles && copState.vehicles.length) ? copState.vehicles.slice() : [];
    var byVin = {};
    rows.forEach(function(r) { if (r.vin) byVin[String(r.vin).trim().toUpperCase()] = r; });
    var nextId = rows.reduce(function(m, r) { return Math.max(m, r.id || 0); }, 0) + 1;
    var added = 0, stale = 0;

    vehicles.forEach(function(v) {
        if (!v.vin || copVehicleFamilyKey(v) !== key) return;
        var vk = String(v.vin).trim().toUpperCase();
        var row = byVin[vk];
        if (!row) {
            var values = {};
            copGetActiveLimits().forEach(function(p) {
                var val = copResultValue(v, p.id);
                if (val !== null && val !== undefined) values[p.id] = String(val);
            });
            row = { id: nextId++, vin: v.vin, values: values, source: 'auto' };
            rows.push(row); byVin[vk] = row; added++;
            return;
        }
        if (row.source === 'manual') return;                 // regla 1
        var diff = false;
        copGetActiveLimits().forEach(function(p) {
            var val = copResultValue(v, p.id);
            if (val === null || val === undefined) return;
            var cur = row.values[p.id];
            if (cur === undefined || cur === '') { row.values[p.id] = String(val); return; }
            if (Math.abs(parseFloat(cur) - val) > 1e-9) diff = true;   // regla 2
        });
        if (diff) { row.staleAuto = true; stale++; } else { delete row.staleAuto; }
    });

    while (rows.length < 3) rows.push({ id: nextId++, vin: '', values: {}, source: 'manual' });
    _copSetVehicles(rows);
    return { added: added, stale: stale };
}
// Compatibilidad: el nombre viejo sigue funcionando (ahora fusiona, no reemplaza).
function copAutoPopulateVins(key) { return copSyncVinsFromTests(key); }

/** Trae los valores del laboratorio para un VIN marcado `staleAuto`, a petición. */
function copAcceptLabValues(rowId) {
    var row = (copState.vehicles || []).find(function(r) { return r.id === rowId; });
    if (!row || !row.vin) return;
    var vk = String(row.vin).trim().toUpperCase();
    var veh = ((typeof db !== 'undefined' && db.vehicles) ? db.vehicles : []).find(function(v) {
        return v.vin && String(v.vin).trim().toUpperCase() === vk;
    });
    if (!veh) return;
    var cambios = [];
    copGetActiveLimits().forEach(function(p) {
        var val = copResultValue(veh, p.id);
        if (val === null || val === undefined) return;
        if (String(row.values[p.id]) !== String(val)) {
            cambios.push(p.label + ': ' + row.values[p.id] + ' → ' + val);
            row.values[p.id] = String(val);
        }
    });
    delete row.staleAuto;
    _copSetVehicles(copState.vehicles);
    copPersist();
    if (typeof auditLog === 'function' && cambios.length) {
        auditLog('cop', 'lab_values_accepted', { type: 'cop', label: row.vin }, cambios.join(' · '));
    }
    if (typeof showToast === 'function') {
        showToast(cambios.length ? 'Valores del laboratorio aplicados a ' + row.vin : 'Ya coincidían', 'success');
    }
    copRender();
}
// Autollenado desde valores FINALES verificados (testData.gasResults capturados en
// liberación/aprobación) — nunca bolsas crudas del analizador: el juicio regulatorio
// exige valores finales. La celda queda source:'auto' y el técnico puede corregirla.
var COP_VALUE_FIELDS = { CO: 'CO', THC: 'THC', NMHC: 'NMHC', NOx: 'NOx', PM: 'PM', PN: 'PN' };

function _copNum(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
}

function _copFinalGasValues(vehicle) {
    var gr = vehicle && vehicle.testData && vehicle.testData.gasResults;
    if (!gr) return null;
    // Preferir aprobador (doble ciego verificado); fallback liberador
    if (gr.aprobador && gr.aprobador.values) return gr.aprobador.values;
    if (gr.liberador && gr.liberador.values) return gr.liberador.values;
    return null;
}

// ¿La regulación del vehículo guarda el combinado THC+NOx bajo el campo THC? (caso EURO-2)
function _copRegCombinesTHC(vehicle) {
    try {
        if (typeof _libGetVehicleRegulation !== 'function' || typeof getRegulationProfile !== 'function') return false;
        var prof = getRegulationProfile(_libGetVehicleRegulation(vehicle));
        if (!prof || !prof.gases) return false;
        var g = prof.gases.find(function(x) { return x.field === 'THC'; });
        return !!(g && /\+\s*NO/i.test(g.label || ''));
    } catch (e) { return false; }
}

function copResultValue(vehicle, pollId) {
    var values = _copFinalGasValues(vehicle);
    if (!values) return null;
    if (pollId === 'HCNOx') {
        var thc = _copNum(values.THC), nox = _copNum(values.NOx);
        if (thc !== null && nox !== null) return Math.round((thc + nox) * 10000) / 10000;
        if (thc !== null && nox === null && _copRegCombinesTHC(vehicle)) return thc;
        return null;
    }
    var field = COP_VALUE_FIELDS[pollId];
    return field ? _copNum(values[field]) : null;
}
function copAddManualRow() {
    copInitState();
    var maxId = copState.vehicles.reduce(function(m, v) { return Math.max(m, v.id); }, 0);
    copState.vehicles.push({ id: maxId + 1, vin: '', values: {}, source: 'manual' });
    copPersist(); copRender();
}
function copRemoveRow(id) {
    _copSetVehicles(copState.vehicles.filter(function(v) { return v.id !== id; }));
    if (!copState.vehicles.length) copState.vehicles.push({ id: 1, vin: '', values: {}, source: 'manual' });
    copPersist(); copRender();
}
function copSetVin(el) {
    var id = parseInt(el.dataset.vid);
    var v = copState.vehicles.find(function(x) { return x.id === id; });
    if (v) v.vin = el.value;
    copPersist(); // sin re-render para no perder el foco
}
/**
 * v19.0 — el registro se CONGELA con lo que se usó para decidir.
 *
 * Un juicio tiene que poder leerse dentro de años sin el sistema que lo produjo:
 * si mañana cambia COP_PI_LIMITS o el perfil de la norma, un registro que solo
 * guarda "FAIL" deja de ser reproducible y por tanto deja de ser evidencia.
 * Se guardan escalares y cadenas — NUNCA objetos de db.vehicles ni la serie SPC
 * completa (la trampa de almacenamiento de v18.1).
 */
function copSaveJudgment() {
    copInitState();
    var pollStats = copGetPollStats();
    var decision = copGetOverallDecision(pollStats);
    var lim = copLimitsForFamily(copState.familyLabel ? _copFamilyEmissionReg(copState.familyKey) : '');

    copState.saved.unshift({
        id: 'cop_' + Date.now(),
        date: new Date().toISOString(),
        by: _copWho(),
        region: copState.region, familyKey: copState.familyKey, familyLabel: copState.familyLabel,
        regulation: copState.regulation, fuelType: copState.fuelType,
        emissionReg: _copFamilyEmissionReg(copState.familyKey),
        activePolls: JSON.parse(JSON.stringify(copState.activePolls)),
        vehicles: JSON.parse(JSON.stringify(copState.vehicles)),
        // ── congelado: sin esto el registro no es reproducible ──
        limitsUsed: copGetActiveLimits().map(function(p) {
            return { id: p.id, label: p.label, limit: p.limit, unit: p.unit, isPn: !!p.isPn };
        }),
        limitsSource: (lim && lim.mismatches && lim.mismatches.length) ? 'euro6-integrado (NO coincide con el perfil)'
                     : (lim && lim.profile) ? 'perfil ' + (lim.profile.name || '') : 'euro6-integrado',
        cvSource: 'R83 Rev.5 / R154 Apendice 2',
        stats: pollStats.filter(function(p) { return p.stats; }).map(function(p) {
            return { poll: p.label, n: p.stats.n, mean: p.stats.mean, s: p.stats.s, U: p.stats.U,
                     a: p.stats.cv ? p.stats.cv.a : null, b: p.stats.cv ? p.stats.cv.b : null,
                     decision: p.stats.decision };
        }),
        // [v20.2] CO₂ — congelado igual que los gases: si mañana cambia el FCF/Evolution
        // Factor de la familia, este juicio no debe empezar a decir otra cosa sobre con
        // qué se decidió entonces. `co2Source` cita la norma, igual que `cvSource` arriba.
        co2: (function() {
            if (typeof homoCo2RowsForVins !== 'function') return null;
            var vins = (copState.vehicles || []).map(function(v) { return v.vin; }).filter(Boolean);
            if (!vins.length) return null;
            var rows = homoCo2RowsForVins(vins);
            var factors = copCo2Factors();
            var st = copCo2CalcStats(rows, factors.fcf, factors.evc);
            if (st.decision === 'SIN DATOS') return null;
            return { n: st.n, mean: st.mean, s: st.s, var: st.var, fcf: st.fcf, evc: st.evc, A: st.A,
                     decision: st.decision, overSample: !!st.overSample,
                     appendixI: st.appendixI, r154: st.r154 };
        })(),
        co2Source: 'Reg. (UE) 2017/1151 Anexo XXI Apéndice I §4 · confirmación UN R154 §3.3.1',
        appVersion: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '',
        decision: decision || 'INCOMPLETO'
    });
    _copTrimSaved();
    if (!copPersist()) { copRender(); return; } // no reportar éxito si no se pudo guardar
    _copPushNow();
    if (typeof auditLog === 'function') auditLog('cop', 'judgment_saved', {type:'cop', label:(copState.familyLabel || '(sin familia)')}, 'Veredicto: ' + (decision === 'PASS' ? 'CONCORDANTE' : decision === 'FAIL' ? 'NO CONCORDANTE' : (decision || 'INCOMPLETO')));
    if (typeof showToast === 'function') showToast('Juicio guardado' + (copState.familyLabel ? ' — ' + copState.familyLabel : ''), 'success');
    copRender();
}

/** Norma de emisiones de una familia (5º campo de la clave). */
function _copFamilyEmissionReg(familyKey) {
    var parts = String(familyKey || '').split('|');
    return parts.length >= 5 ? parts[4] : '';
}

/**
 * Cap de juicios guardados. NO borra: COMPACTA — conserva la cabecera y la
 * estadística (que es lo que hace reproducible el veredicto) y suelta el detalle
 * de VINes, marcando `evidencePurged`. Mismo principio que `snapshotPurged` en
 * _fbMergeTrimHistory (v18.1). Y nunca toca el registro más reciente de una
 * familia: perder el juicio vigente de una familia sería perder el expediente.
 */
var COP_SAVED_MAX = 200;
var COP_SAVED_PER_FAMILY = 24;
function _copTrimSaved() {
    var saved = copState.saved || [];
    if (saved.length <= COP_SAVED_MAX) return;
    var seen = {};
    saved.forEach(function(j, i) {
        var k = j.familyKey || '';
        seen[k] = (seen[k] || 0) + 1;
        var esElVigente = seen[k] === 1;              // la lista está en orden desc
        var sobraPorFamilia = seen[k] > COP_SAVED_PER_FAMILY;
        var sobraGlobal = i >= COP_SAVED_MAX;
        if (!esElVigente && (sobraGlobal || sobraPorFamilia) && j.vehicles) {
            delete j.vehicles;
            j.evidencePurged = true;
        }
    });
}

// Push inmediato del estado CoP persistido (los juicios no esperan al ciclo de fbPushAll).
// No se engancha copPersist en fbHookSaves porque corre en cada tecla; solo guardar/borrar juicio.
function _copPushNow() {
    try {
        if (typeof fbPush !== 'function' || typeof fbSync === 'undefined' || !fbSync.enabled) return;
        if (typeof fbSyncModules === 'undefined' || !fbSyncModules.cop) return;
        var raw = JSON.parse(localStorage.getItem(COP_LS_KEY));
        if (raw) fbPush('cop', raw);
    } catch (e) {}
}
function copLoadJudgment(id) {
    var rec = (copState.saved || []).find(function(r) { return r.id === id; });
    if (!rec) return;
    copState.regulation = rec.regulation; copState.fuelType = rec.fuelType;
    copState.region = rec.region; copState.familyKey = rec.familyKey; copState.familyLabel = rec.familyLabel;
    copState.activePolls = JSON.parse(JSON.stringify(rec.activePolls));
    _copSetVehicles(JSON.parse(JSON.stringify(rec.vehicles || [])));
    copPersist(); copRender();
    if (typeof showToast === 'function') showToast('Juicio cargado', 'info');
}
function copDeleteJudgment(id) {
    copState.saved = (copState.saved || []).filter(function(r) { return r.id !== id; });
    if (copPersist()) _copPushNow();
    copRender();
}

// ─── LÓGICA DE NEGOCIO ───────────────────────────────────────────────────────
function copCalcStats(rawValues, limit) {
    var values = rawValues.filter(function(v) { return !isNaN(v) && v !== null && v !== ''; });
    var n = values.length;
    if (n < 3) return null;

    var mean = values.reduce(function(s, v) { return s + v; }, 0) / n;
    var s = n > 1
        ? Math.sqrt(values.reduce(function(acc, v) { return acc + Math.pow(v - mean, 2); }, 0) / (n - 1))
        : 0;

    if (s === 0) {
        return { n: n, mean: mean, s: s, U: null, cv: null, decision: mean <= limit ? 'PASS' : 'FAIL' };
    }

    var U = (mean - limit) * Math.sqrt(n) / s;
    var cv = COP_CV[n] || COP_CV[20];
    var decision = 'CONTINUE';
    if (U <= cv.a) decision = 'PASS';
    else if (U >= cv.b) decision = 'FAIL';
    else if (n >= 20) decision = mean <= limit ? 'PASS' : 'FAIL';

    return { n: n, mean: mean, s: s, U: U, cv: cv, decision: decision };
}

function copFmtVal(v, isPn) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return isPn ? v.toExponential(3) : v.toFixed(5);
}
function copFmtLimit(v, isPn) { return isPn ? v.toExponential(2) : v.toFixed(4); }
function copFmtU(v) { return v === null ? '—' : v.toFixed(3); }

function copGetActiveLimits() {
    var limits = COP_FUEL_LIMITS[copState.fuelType] || COP_PI_LIMITS;
    return limits.filter(function(p) { return copState.activePolls[p.id]; });
}

/**
 * [v19.0] Verifica los límites aplicados contra el perfil REAL de la norma.
 *
 * El validador aplica COP_PI_LIMITS/COP_CI_LIMITS (Euro 6) a todo. Dentro del
 * alcance CoP (EURO-5 / EURO-6E / PRE-EURO 7) eso es correcto porque los tres
 * perfiles traen los mismos valores — pero es una coincidencia, no una garantía.
 * Esta función la comprueba en cada render: si mañana entra una norma al alcance
 * cuyo perfil difiere, sale el aviso en vez de un veredicto silenciosamente malo.
 *
 * Devuelve {limits, profile, emissionReg, mismatches:[{poll, applied, profile, unit}],
 *           profileMissing} — nunca cambia el número aplicado por su cuenta: avisar
 * es correcto, recalcular a espaldas del técnico un veredicto ya emitido no lo es.
 */
function copLimitsForFamily(emissionReg) {
    var limits = copGetActiveLimits();
    var out = { limits: limits, profile: null, emissionReg: emissionReg || '', mismatches: [], profileMissing: false };
    if (!emissionReg || typeof getRegulationProfile !== 'function') return out;

    var prof = null;
    try { prof = getRegulationProfile(emissionReg); } catch (e) {}
    if (!prof || !prof.gases || !prof.gases.length) { out.profileMissing = true; return out; }
    out.profile = prof;

    limits.forEach(function(p) {
        // HCNOx no existe como campo suelto en los perfiles: EURO-2 lo guarda bajo THC
        // con la etiqueta "THC+NOx" (mismo caso que resuelve _copRegCombinesTHC).
        var g = prof.gases.find(function(x) {
            return x.field === p.id || (p.id === 'HCNOx' && x.field === 'THC' && /\+\s*NO/i.test(x.label || ''));
        });
        if (!g || g.limit === null || g.limit === undefined) return;
        var sameUnit = _copNormKey(g.unit) === _copNormKey(p.unit);
        var sameLimit = Math.abs(Number(g.limit) - Number(p.limit)) <= Math.abs(Number(p.limit)) * 1e-9;
        if (!sameUnit || !sameLimit) {
            out.mismatches.push({ poll: p.label || p.id, applied: p.limit, appliedUnit: p.unit,
                                  profile: g.limit, profileUnit: g.unit, unitDiffers: !sameUnit });
        }
    });
    return out;
}

function copGetPollStats() {
    return copGetActiveLimits().map(function(p) {
        var rawValues = copState.vehicles.map(function(v) {
            var raw = v.values[p.id];
            return (raw === '' || raw === undefined) ? NaN : parseFloat(raw);
        });
        var validValues = rawValues.filter(function(v) { return !isNaN(v); });
        var stats = copCalcStats(validValues, p.limit);
        return Object.assign({}, p, { validCount: validValues.length, stats: stats });
    });
}

function copGetOverallDecision(pollStats) {
    var withStats = pollStats.filter(function(p) { return p.stats; });
    if (withStats.length === 0) return null;
    if (withStats.some(function(p) { return p.stats.decision === 'FAIL'; })) return 'FAIL';
    if (withStats.every(function(p) { return p.stats.decision === 'PASS'; })) return 'PASS';
    return 'CONTINUE';
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v19.0] PANORAMA — el estado CoP de TODAS las familias del alcance
//
// Hasta v18.6 había que elegir una familia en un <select> para ver algo: ninguna
// pantalla respondía "¿cómo va el CoP del laboratorio?". copPortfolioRows() es LA
// definición de esa respuesta — todo consumidor nuevo (Panorama, CSV, encabezado
// del expediente, alertas) la llama en vez de recalcular por su cuenta.
//
// NO hay matemática nueva aquí: compone copCalcStats (veredicto secuencial),
// copSpcStats/copSpcFlags (Cpk y Nelson) y tpBuildFamilies (cobertura del plan,
// ya cacheada por _tpGetPlanHash).
// ═══════════════════════════════════════════════════════════════════════════════

var COP_RISK_THRESHOLDS = {
    bandNearB:  0.75,  // U en el 75% superior de la banda A(n)..B(n)
    marginHigh: 0.90,  // media ≥ 90% del límite
    marginWarn: 0.80,  // media ≥ 80% del límite
    cpkBad:     0.67,
    cpkWarn:    1.00,
    staleDays:  120    // informativo: no pinta riesgo por sí solo
};

/** Gases con límite regulatorio de una familia (CO2 fuera: no tiene límite fijo). */
function copFamilyGases(fam) {
    return copSpcGases(fam).filter(function(g) {
        return g.field !== 'CO2' && g.limit !== null && g.limit !== undefined;
    });
}

/**
 * LA definición del semáforo de riesgo. PURA: recibe la fila ya calculada, así que
 * se puede probar sin DOM ni globales.
 *
 * Es un AVISO INTERNO ANTICIPADO, no un veredicto regulatorio — la UI lo dice con
 * esas palabras. Reglas de honestidad, deliberadas:
 *   · Sin datos NUNCA es verde. Con n<3 el muestreo secuencial no decide nada, y
 *     pintar verde ahí sería afirmar algo que la estadística no sostiene.
 *   · Nada de "va a fallar": el texto dice qué se observó, no qué va a pasar.
 *   · `confidence` baja sola con n chico o con la familia sin ensayar hace mucho.
 */
function copFamilyRisk(row) {
    var reasons = [], level = 'ok';
    var bump = function(l) {
        var order = { ok: 0, atencion: 1, riesgo: 2 };
        if (order[l] > order[level]) level = l;
    };

    if (!row || !row.n || row.n < 3) {
        return {
            level: 'sin-datos',
            confidence: 'ninguna',
            reasons: [{ code: 'no_data', text: row && row.n
                ? 'Solo ' + row.n + ' VIN(es) con resultados: faltan ' + (3 - row.n) + ' para que el muestreo pueda decidir.'
                : 'Sin ensayos con resultados finales capturados.' }]
        };
    }

    if (row.verdict === 'FAIL') {
        reasons.push({ code: 'verdict_fail', text: 'Veredicto NO CONCORDANTE' + (row.worstPoll ? ' en ' + row.worstPoll : '') + '.' });
        bump('riesgo');
    }
    if (row.bandPos !== null && row.bandPos !== undefined && row.bandPos >= COP_RISK_THRESHOLDS.bandNearB && row.verdict !== 'FAIL') {
        reasons.push({ code: 'band_near_b', text: 'El estadístico U de ' + (row.worstPoll || 'el peor gas') +
            ' está en el ' + Math.round(row.bandPos * 100) + '% superior de la banda A(n)–B(n): más cerca de NO CONCORDANTE que de CONCORDANTE.' });
        bump('atencion');
    }
    // Margen delgado NO es rojo por sí solo: la familia aprobó el muestreo, y pintar
    // un PASS con el mismo rojo que un NO CONCORDANTE confunde dos situaciones muy
    // distintas y quema la credibilidad del tablero. Sube a rojo solo cuando además
    // el proceso no es capaz de sostener ese margen (Cpk < 1).
    var marginHigh = false;
    if (row.marginRatio !== null && row.marginRatio !== undefined) {
        if (row.marginRatio >= COP_RISK_THRESHOLDS.marginHigh) {
            marginHigh = true;
            reasons.push({ code: 'margin_high', text: 'La media de ' + (row.worstPoll || 'el peor gas') + ' va al ' +
                Math.round(row.marginRatio * 100) + '% del límite: casi sin margen.' });
            bump('atencion');
        } else if (row.marginRatio >= COP_RISK_THRESHOLDS.marginWarn) {
            reasons.push({ code: 'margin_warn', text: 'La media de ' + (row.worstPoll || 'el peor gas') + ' va al ' +
                Math.round(row.marginRatio * 100) + '% del límite: margen delgado.' });
            bump('atencion');
        }
    }
    if (row.cpkMin !== null && row.cpkMin !== undefined && row.cpkReliable) {
        if (row.cpkMin < COP_RISK_THRESHOLDS.cpkBad) {
            reasons.push({ code: 'cpk_bad', text: 'Cpk ' + row.cpkMin.toFixed(2) + ' en ' + (row.cpkMinGas || 'un gas') +
                ': el proceso no es capaz de sostener el límite.' });
            bump('riesgo');
        } else if (row.cpkMin < COP_RISK_THRESHOLDS.cpkWarn) {
            reasons.push({ code: 'cpk_warn', text: 'Cpk ' + row.cpkMin.toFixed(2) + ' en ' + (row.cpkMinGas || 'un gas') +
                ': por debajo de 1.00, los resultados están cerca del límite.' });
            bump('atencion');
            if (marginHigh) {
                reasons.push({ code: 'margin_and_cpk', text: 'Margen casi agotado Y proceso no capaz: un lote peor de lo normal deja de concordar.' });
                bump('riesgo');
            }
        }
    }
    if (row.spcAlarms && row.spcAlarms.length) {
        var r1 = row.spcAlarms.filter(function(a) { return a.rule === 'R1'; }).length;
        reasons.push({ code: r1 ? 'spc_r1' : 'spc_shift',
            text: row.spcAlarms.length + ' alarma(s) de control de proceso' + (r1 ? ' (punto fuera de ±3σ)' : ' (corrimiento o tendencia)') + '.' });
        bump('atencion');
    }
    // [v19.1] Un vehículo cuya masa de ensayo o CO₂ declarado caen fuera del rango
    // de su propia familia IP es un problema de EVIDENCIA, no de emisiones: o el
    // dato del ICMS está mal, o el vehículo no pertenece a esa familia. Se avisa
    // sin tocar el veredicto.
    if (row.ipOutliers && row.ipOutliers.length) {
        reasons.push({ code: 'ip_outlier',
            text: row.ipOutliers.length + ' vehículo(s) fuera del rango de su familia IP: ' +
                  row.ipOutliers.slice(0, 2).map(function(o) { return o.text; }).join(' · ') });
        bump('atencion');
    }

    var confidence = row.n >= COP_SPC_RELIABLE ? 'alta' : row.n >= 5 ? 'media' : 'baja';
    if (row.daysSinceTest !== null && row.daysSinceTest !== undefined && row.daysSinceTest > COP_RISK_THRESHOLDS.staleDays) {
        // No sube el nivel a propósito: una familia sin ensayar hace tiempo no está en
        // riesgo estadístico, solo hace menos confiable lo que se sabe de ella.
        reasons.push({ code: 'stale', text: 'Último ensayo hace ' + row.daysSinceTest + ' días: el panorama puede estar desactualizado.' });
        if (confidence === 'alta') confidence = 'media';
        else if (confidence === 'media') confidence = 'baja';
    }

    if (!reasons.length) {
        reasons.push({ code: 'clear', text: row.verdict === 'PASS'
            ? 'Familia CONCORDANTE, sin señales de deriva.'
            : 'En muestreo, sin señales de deriva.' });
    }
    return { level: level, confidence: confidence, reasons: reasons };
}

/**
 * LA definición del estado CoP de todas las familias del alcance.
 * Memoizada: pnGetActiveAlerts corre en cada render del Panel.
 */
function copPortfolioRows(opts) {
    var force = !!(opts && opts.force);
    var nVeh = 0;
    try { nVeh = (db.vehicles || []).length; } catch (e) {}
    var nTested = 0;
    try { nTested = (tpState.testedList || []).length; } catch (e) {}
    var cacheKey = nVeh + '|' + nTested + '|' + _copRev + '|' + ((copState.saved || []).length);
    if (!force && _copPortfolioCache && _copPortfolioCache.key === cacheKey) return _copPortfolioCache.rows;

    var fams = {};

    // (1) Lo que el PLAN dice que debe probarse — una familia planeada sin ensayos
    //     tiene que aparecer (en gris), no desaparecer: es justo lo que se pregunta.
    var planFams = {};
    try {
        if (typeof tpBuildFamilies === 'function') {
            tpBuildFamilies().forEach(function(f) { planFams[f.key] = f; });
        }
    } catch (e) {}
    copFamilies().forEach(function(f) {
        var pf = planFams[f.key] || {};
        fams[f.key] = {
            key: f.key, label: f.label, regionsArr: f.regionsArr || [],
            emissionReg: f.reg || '', regName: f.reg || '',
            planRequired: pf.totalRequired || 0, planTested: pf.totalTested || 0,
            planDeficit: pf.deficit || 0,
            planCoverage: (pf.coverage === undefined || pf.coverage === null) ? null : pf.coverage,
            lastTestDate: pf.lastTestDate || '', daysSinceTest: (pf.daysSinceTest === undefined) ? null : pf.daysSinceTest,
            bodiesArr: pf.bodies || [],
            tests: [], inPlan: true
        };
    });

    // (2) Lo que YA se probó (db.vehicles con gases finales verificados).
    copSpcFamilies().forEach(function(sf) {
        var r = fams[sf.key];
        if (!r) {
            r = fams[sf.key] = {
                key: sf.key, label: sf.label, regionsArr: sf.region ? [sf.region] : [],
                emissionReg: sf.emissionReg || '', regName: sf.regName || sf.emissionReg || '',
                planRequired: 0, planTested: 0, planDeficit: 0, planCoverage: null,
                lastTestDate: '', daysSinceTest: null, bodiesArr: [], tests: [], inPlan: false
            };
        }
        r.tests = sf.tests || [];
        r.regName = sf.regName || r.regName;
        r.spcFam = sf;
        if (!r.lastTestDate && r.tests.length) {
            var last = r.tests[r.tests.length - 1];
            r.lastTestDate = (last.date || '').slice(0, 10);
            if (r.lastTestDate) {
                r.daysSinceTest = Math.floor((Date.now() - new Date(r.lastTestDate + 'T12:00:00').getTime()) / 86400000);
            }
        }
    });

    // (3) Alarmas SPC indexadas UNA vez (el barrido es caro; nunca por familia).
    var alarmsByFam = {};
    try {
        copSpcScanAlarms().forEach(function(a) {
            (alarmsByFam[a.famKey] = alarmsByFam[a.famKey] || []).push(a);
        });
    } catch (e) {}

    // (4) Último juicio guardado por familia.
    var lastJudgment = {};
    (copState.saved || []).forEach(function(j) {
        if (!j || !j.familyKey) return;
        if (!lastJudgment[j.familyKey] || (j.date || '') > (lastJudgment[j.familyKey].date || '')) {
            lastJudgment[j.familyKey] = j;
        }
    });

    var rows = Object.keys(fams).map(function(k) {
        var r = fams[k];
        var fam = r.spcFam || { tests: r.tests, regName: r.regName };
        var gases = r.tests.length ? copFamilyGases(fam) : [];

        r.polls = [];
        var worst = null, nMax = 0, cpkMin = null, cpkMinGas = null, cpkReliable = false;

        gases.forEach(function(g) {
            var pts = copSpcSeries(fam, g.field);
            var vals = pts.map(function(p) { return p.v; });
            if (vals.length > nMax) nMax = vals.length;
            var st = copCalcStats(vals, g.limit);
            var sp = copSpcStats(vals, g.limit);
            var marginRatio = (st && g.limit) ? (st.mean / g.limit) : null;
            var bandPos = null;
            if (st && st.U !== null && st.cv) {
                var span = st.cv.b - st.cv.a;
                bandPos = span > 0 ? Math.max(0, Math.min(1, (st.U - st.cv.a) / span)) : null;
            }
            var p = {
                field: g.field, label: g.label || g.field, unit: g.unit || '', limit: g.limit,
                n: vals.length, stats: st, marginRatio: marginRatio, bandPos: bandPos,
                cpk: (sp && sp.n >= COP_SPC_RELIABLE) ? sp.cpk : null
            };
            r.polls.push(p);
            if (p.cpk !== null && p.cpk !== undefined && (cpkMin === null || p.cpk < cpkMin)) {
                cpkMin = p.cpk; cpkMinGas = p.label; cpkReliable = true;
            }
            // "Peor" = el que más manda sobre el veredicto: primero un FAIL, luego el
            // que esté más arriba en la banda, y como desempate el de menos margen.
            var score = (st && st.decision === 'FAIL' ? 1000 : 0)
                      + (bandPos !== null ? bandPos * 100 : 0)
                      + (marginRatio !== null ? marginRatio : 0);
            if (!worst || score > worst._score) { worst = Object.assign({ _score: score }, p); }
        });

        var withStats = r.polls.filter(function(p) { return p.stats; });
        r.n = nMax;
        r.nWithStats = withStats.length;
        r.verdict = withStats.length
            ? (withStats.some(function(p) { return p.stats.decision === 'FAIL'; }) ? 'FAIL'
              : withStats.every(function(p) { return p.stats.decision === 'PASS'; }) ? 'PASS' : 'CONTINUE')
            : null;
        r.worstPoll   = worst ? worst.label : '';
        r.worstU      = worst && worst.stats ? worst.stats.U : null;
        r.band        = worst && worst.stats ? worst.stats.cv : null;
        r.bandPos     = worst ? worst.bandPos : null;
        r.marginRatio = worst ? worst.marginRatio : null;
        r.marginPct   = (r.marginRatio === null || r.marginRatio === undefined) ? null : r.marginRatio * 100;
        r.cpkMin = cpkMin; r.cpkMinGas = cpkMinGas; r.cpkReliable = cpkReliable;
        r.spcAlarms = alarmsByFam[k] || [];

        // v20.8: un juicio guardado con la clave vieja de 7 segmentos (antes de que la
        // carrocería entrara a la identidad) cubría la familia combinada — vale para
        // cada una de sus mitades. El juicio exacto de la clave nueva siempre gana.
        var j = lastJudgment[k] || lastJudgment[_copFamKeyLegacy(k)];
        r.judgedAt = j ? j.date : '';
        r.judgedDecision = j ? j.decision : '';
        r.judgmentId = j ? j.id : '';

        // [v19.1] Familia de interpolación del WVTA (solo Europa). Es INFORMATIVA
        // sobre la fila: la clave de agrupación sigue siendo copVehicleFamilyKey,
        // que es la identidad de las series SPC y de todos los juicios guardados.
        r.ipFamilies = [];
        r.ipOutliers = [];
        try {
            if (typeof homoIpFamilyForVehicle === 'function') {
                var vinsFam = {};
                (r.tests || []).forEach(function(t) { if (t.vin) vinsFam[String(t.vin).toUpperCase()] = true; });
                var vehsFam = ((typeof db !== 'undefined' && db.vehicles) ? db.vehicles : []).filter(function(v) {
                    return v.vin && vinsFam[String(v.vin).toUpperCase()];
                });
                var codes = {};
                vehsFam.forEach(function(v) {
                    var res = homoIpFamilyForVehicle(v);
                    if (res && res.family) codes[res.family.code] = true;
                });
                r.ipFamilies = Object.keys(codes);
                if (typeof homoIpScanOutliers === 'function') r.ipOutliers = homoIpScanOutliers(vehsFam);
            }
        } catch (e) {}

        // El límite aplicado vs el perfil real de la norma (§ copLimitsForFamily).
        r.limitsCheck = null;
        try { r.limitsCheck = copLimitsForFamily(r.regName || r.emissionReg); } catch (e) {}

        r.risk = copFamilyRisk(r);
        delete r.spcFam; // no arrastrar la familia SPC entera en la fila
        return r;
    });

    // Peor primero: es el orden en que se quiere leer un tablero de conformidad.
    var rank = { riesgo: 0, atencion: 1, 'sin-datos': 2, ok: 3 };
    rows.sort(function(a, b) {
        var d = rank[a.risk.level] - rank[b.risk.level];
        if (d) return d;
        var am = a.marginRatio === null ? -1 : a.marginRatio, bm = b.marginRatio === null ? -1 : b.marginRatio;
        if (bm !== am) return bm - am;
        return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });

    _copPortfolioCache = { key: cacheKey, rows: rows };
    return rows;
}

/** Resumen de KPIs del Panorama — deriva de copPortfolioRows, no recuenta. */
function copPortfolioSummary(rows) {
    rows = rows || copPortfolioRows();
    var s = { total: rows.length, pass: 0, fail: 0, cont: 0, sinDatos: 0, riesgo: 0, atencion: 0, alarmas: 0 };
    rows.forEach(function(r) {
        if (r.verdict === 'PASS') s.pass++;
        else if (r.verdict === 'FAIL') s.fail++;
        else if (r.verdict === 'CONTINUE') s.cont++;
        else s.sinDatos++;
        if (r.risk.level === 'riesgo') s.riesgo++;
        else if (r.risk.level === 'atencion') s.atencion++;
        s.alarmas += (r.spcAlarms || []).length;
    });
    return s;
}

// ─── MANEJADORES DE EVENTOS ──────────────────────────────────────────────────
function copSetRegulation(r) {
    copState.regulation = r;
    copPersist();
    copRender();
}

// ─── Panorama: manejadores ────────────────────────────────────────────────────
function copOpenFamily(key) {
    copSelectFamily(key);
    copState.view = 'validator';
    copPersist();
    copRender();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { }
}
function copSetOvFilter(what, val) {
    copState.ovFilter = copState.ovFilter || {};
    copState.ovFilter[what] = val;
    copPersist();
    copRender();
}

// [v20.5] Ocultar/mostrar familias del Panorama — declutter, no tracking: la
// familia sigue en copPortfolioRows() (KPIs, alertas, SPC), solo se retira de la
// retícula y del Gantt de esta pantalla. Estado de UI POR DISPOSITIVO a propósito
// (mismo criterio que view/region/ovFilter/spc en fbPullApply): lo que un técnico
// decide esconder para su propia lectura del tablero no debe saltarle al resto.
function copHideFamily(key) {
    if (!key) return;
    copState.ovHidden = copState.ovHidden || {};
    copState.ovHidden[key] = true;
    copPersist();
    copRender();
}
function copShowFamily(key) {
    if (copState.ovHidden) delete copState.ovHidden[key];
    copPersist();
    copRender();
}
function copShowAllFamilies() {
    copState.ovHidden = {};
    copPersist();
    copRender();
}
/** Modo presentación: sube la escala SOLO dentro del CoP (body.cop-present). */
function copTogglePresent() {
    copState.present = !copState.present;
    try { document.body.classList.toggle('cop-present', !!copState.present); } catch (e) { }
    copPersist();
    copRender();
}
function copSpcToggleAllScopes(el) {
    copState.spc.allScopes = !!(el && el.checked);
    copPersist();
    copRender();
}

function copSetFuel(fuel) {
    copState.fuelType = fuel;
    var newLimits = COP_FUEL_LIMITS[fuel] || COP_PI_LIMITS;
    copState.activePolls = {};
    newLimits.forEach(function(p) { copState.activePolls[p.id] = p.active; });
    _copSetVehicles(copState.vehicles.map(function(v) { return { id: v.id, vin: v.vin, values: {}, source: v.source }; }));
    copState._lastDecision = null;
    copPersist();
    copRender();
}

function copTogglePoll(pollId) {
    copState.activePolls[pollId] = !copState.activePolls[pollId];
    copPersist();
    copRender();
}

function copHandleInput(el) {
    var vid = parseInt(el.dataset.vid);
    var pid = el.dataset.pid;
    var vehicle = copState.vehicles.find(function(v) { return v.id === vid; });
    if (vehicle) vehicle.values[pid] = el.value;
    copPersist();
    copRenderStats();
}

function copClearData() {
    _copSetVehicles(copState.vehicles.map(function(v) { return { id: v.id, vin: v.vin, values: {}, source: v.source }; }));
    copState._lastDecision = null;
    copPersist();
    copRender();
}

function copToggleTable() {
    copState.showTable = !copState.showTable;
    var el = document.getElementById('cop-cv-table-body');
    var chevron = document.getElementById('cop-cv-chevron');
    if (!el) { copRender(); return; }
    if (copState.showTable) {
        el.style.display = '';
        if (chevron) chevron.textContent = '▾';
    } else {
        el.style.display = 'none';
        if (chevron) chevron.textContent = '▸';
    }
}

function copToggleFormula() {
    copState.showFormula = !copState.showFormula;
    copRenderStats();
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function copRender() {
    copInitState();
    var container = document.getElementById('platform-cop');
    if (!container) return;
    // El modo presentación vive en <body> para poder subir la escala SOLO del CoP.
    try { document.body.classList.toggle('cop-present', !!copState.present); } catch (e) { }
    container.innerHTML = copBuildHTML();
    // setTimeout, no llamada directa: justo tras activar la pestaña (o volver a
    // ella) el contenedor todavía no terminó su reflow y Chart.js mide un canvas
    // 0x0 — mismo patrón que pnProjSCurveRender (projects.js) para ese mismo bug.
    if (copState.view === 'spc') setTimeout(copSpcRenderCharts, 30);
    // v16.0: banners/tooltips de ayuda (render síncrono — sin caché de pestañas de por medio)
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
    if (typeof a11yClickables === 'function') a11yClickables(container);
}

// v22.2 — LA definición de las vistas del CoP. Estaba escrita en línea dentro del
// forEach que pinta la nav, así que era la única fuente de navegación de la app que
// el lanzador (uiNavRegistry, app.js) no podía descubrir: la nav del CoP se pinta
// bajo demanda, no vive en el DOM inicial como las barras de pestañas.
var COP_VIEWS = [
    ['overview',  '📊 Panorama'],
    ['validator', '📋 Validador'],
    ['spc',       '📈 Control SPC'],
    ['dossier',   '🗂️ Expediente']
];

function copSetView(v) {
    copState.view = ['overview', 'validator', 'spc', 'dossier'].indexOf(v) !== -1 ? v : 'overview';
    copPersist();
    copRender();
}

function copRenderStats() {
    var el = document.getElementById('cop-stats-section');
    if (el) el.innerHTML = copBuildStatsHTML();
}

// ─── HELPERS DE ESTILO (Cascade design tokens) ───────────────────────────────
function _copTh() {
    return 'padding:10px 12px;font-size: var(--fs-sm);font-weight:700;color:var(--muted);text-transform:uppercase;' +
           'letter-spacing:0.5px;border-bottom:1.5px solid var(--border);text-align:center;white-space:nowrap;';
}
function _copTd() {
    return 'padding:9px 12px;font-size:12px;border-bottom:1px solid var(--border);text-align:center;';
}
function _copDecClass(decision) {
    return { PASS: 'badge badge-success', FAIL: 'badge badge-danger', CONTINUE: 'badge badge-warning' }[decision] || 'badge badge-neutral';
}
function _copDecLabel(decision) {
    return { PASS: '✓ PASS', FAIL: '✗ FAIL', CONTINUE: '⧗ CONTINUAR' }[decision] || decision;
}
function _copDecBorderColor(decision) {
    return { PASS: 'rgba(16,185,129,0.4)', FAIL: 'rgba(239,68,68,0.4)', CONTINUE: 'rgba(245,158,11,0.4)' }[decision] || 'var(--border)';
}
function _copDecBgColor(decision) {
    return { PASS: 'rgba(16,185,129,0.06)', FAIL: 'rgba(239,68,68,0.06)', CONTINUE: 'rgba(245,158,11,0.06)' }[decision] || 'transparent';
}

/**
 * [v19.0] Un renglón del gauge: la banda A(n)…B(n) con U marcado encima.
 *
 * Escala: la banda ocupa el 60% central del ancho, y los extremos (PASS a la
 * izquierda, FAIL a la derecha) el 20% cada uno. Un U muy alejado se clava en el
 * extremo en vez de reventar la escala — el mensaje ("ya decidió") no se pierde.
 */
function _copGaugeRowHTML(p) {
    var st = p.stats, a = st.cv.a, b = st.cv.b, span = b - a;
    var PASS_W = 20, BAND_W = 60, FAIL_W = 20;
    var pos;
    if (span <= 0) {
        pos = 50;
    } else if (st.U <= a) {
        // Dentro del 20% izquierdo, proporcional a cuánto rebasó A(n) (tope: el borde).
        var over = Math.min(1, (a - st.U) / (span || 1));
        pos = PASS_W - over * PASS_W * 0.9;
    } else if (st.U >= b) {
        var over2 = Math.min(1, (st.U - b) / (span || 1));
        pos = PASS_W + BAND_W + over2 * FAIL_W * 0.9;
    } else {
        pos = PASS_W + ((st.U - a) / span) * BAND_W;
    }
    pos = Math.max(0.5, Math.min(99.5, pos));

    var vu = _copVerdictUI(st.decision === 'PASS' ? 'PASS' : st.decision === 'FAIL' ? 'FAIL' : 'CONTINUE');
    var html = '<div class="cop-gauge-row">';
    html += '<div class="cop-gauge-name">' + p.label +
            '<small>L = ' + copFmtLimit(p.limit, p.isPn) + ' ' + _copEsc(p.unit) + ' · n=' + st.n + '</small></div>';

    html += '<div class="cop-gauge" role="img" aria-label="' + _copEsc(p.label) + ': U ' + copFmtU(st.U) +
            ', banda A ' + a.toFixed(3) + ' a B ' + b.toFixed(3) + ', ' + _copEsc(vu.word) + '">';
    html += '<div class="cop-gauge-zone cop-gauge-zone--pass" style="width:' + PASS_W + '%;"><span>Concordante</span></div>';
    html += '<div class="cop-gauge-zone cop-gauge-zone--mid"  style="width:' + BAND_W + '%;"><span>A(n) ' + a.toFixed(2) + ' — sin decidir — B(n) ' + b.toFixed(2) + '</span></div>';
    html += '<div class="cop-gauge-zone cop-gauge-zone--fail" style="width:' + FAIL_W + '%;"><span>No concord.</span></div>';
    html += '<div class="cop-gauge-marker" style="left:' + pos.toFixed(1) + '%;" title="U = ' + copFmtU(st.U) + '"></div>';
    html += '</div>';

    html += '<div class="cop-gauge-val"><span class="cop-chip ' + vu.chip + '">' + vu.short + '</span>' +
            '<small>U = ' + copFmtU(st.U) + '</small></div>';
    return html + '</div>';
}

// ─── HTML: SECCIÓN DE ESTADÍSTICAS (se actualiza por separado en inputs) ─────
function copBuildStatsHTML() {
    var pollStats = copGetPollStats();
    var overallDecision = copGetOverallDecision(pollStats);
    var html = '';

    // ── Gauge: dónde cae U en la banda A(n)…B(n), por contaminante ────────────
    // La tabla de abajo dice los números; esto dice qué SIGNIFICAN. Sin este
    // gráfico el muestreo secuencial es ilegible para cualquiera que no sea del
    // laboratorio — que es justo quien lo va a ver en una auditoría.
    var conGauge = pollStats.filter(function(p) { return p.stats && p.stats.U !== null && p.stats.cv; });
    if (conGauge.length) {
        html += '<div class="card" style="margin-bottom:16px;">';
        html += '<div class="card-title" data-help="cop-gauge-help">🎯 Qué tan cerca está cada gas de decidir</div>';
        conGauge.forEach(function(p) { html += _copGaugeRowHTML(p); });
        html += '<div class="cop-gauge-legend">';
        html += '<span><span class="cop-chip cop-chip--ok">CONCORDANTE</span> U ≤ A(n): la familia ya cumplió, puedes dejar de ensayar.</span>';
        html += '<span><span class="cop-chip cop-chip--warn">SIN DECIDIR</span> entre A(n) y B(n): hace falta otro vehículo.</span>';
        html += '<span><span class="cop-chip cop-chip--bad">NO CONCORDANTE</span> U ≥ B(n).</span>';
        html += '</div></div>';
    }

    // Card de análisis
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;border-bottom:2px solid var(--accent-cop);padding-bottom:10px;">';
    html += '<span style="font-size:var(--font-base);font-weight:var(--weight-bold);color:var(--text);flex:1;">📈 Análisis Estadístico</span>';
    html += '<button onclick="copToggleFormula()" class="btn btn-sm btn-ghost" style="font-size: var(--fs-sm);">' +
            (copState.showFormula ? 'Ocultar fórmula' : 'Ver fórmula') + '</button>';
    html += '</div>';

    if (copState.showFormula) {
        html += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);' +
                'padding:12px 16px;margin-bottom:14px;">';
        html += '<p style="font-size:14px;color:var(--text);font-weight:700;font-family:monospace;margin-bottom:10px;">' +
                'U = (x̄ − L) × √n / s</p>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
        html += '<span class="badge badge-success" style="padding:5px 12px;border-radius:var(--radius-sm);font-size:12px;">U ≤ A(n) → PASS</span>';
        html += '<span class="badge badge-danger" style="padding:5px 12px;border-radius:var(--radius-sm);font-size:12px;">U ≥ B(n) → FAIL</span>';
        html += '<span class="badge badge-warning" style="padding:5px 12px;border-radius:var(--radius-sm);font-size:12px;">A &lt; U &lt; B → añadir vehículo</span>';
        html += '</div>';
        html += '</div>';
    }

    html += '<div style="overflow-x:auto;">';
    html += '<table style="border-collapse:collapse;width:100%;min-width:500px;">';
    html += '<thead><tr style="background:var(--bg);">';
    ['Contaminante', 'n válido', 'x̄', 's', 'U', 'A(n)', 'B(n)', 'Decisión'].forEach(function(h) {
        html += '<th style="' + _copTh() + '">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    pollStats.forEach(function(p) {
        var st = p.stats;
        if (!st) {
            html += '<tr>';
            html += '<td style="' + _copTd() + 'font-weight:600;text-align:left;padding-left:12px;">' + p.label + '</td>';
            html += '<td style="' + _copTd() + 'color:var(--muted);">' + p.validCount + '</td>';
            html += '<td colspan="6" style="' + _copTd() + 'color:var(--muted);font-size: var(--fs-sm);">';
            html += p.validCount === 0 ? 'Sin datos' : 'Faltan ' + (3 - p.validCount) + ' vehículo(s) para calcular';
            html += '</td></tr>';
            return;
        }

        html += '<tr>';
        html += '<td style="' + _copTd() + 'font-weight:600;text-align:left;padding-left:12px;">' + p.label + '</td>';
        html += '<td style="' + _copTd() + 'color:var(--muted);">' + st.n + '</td>';
        html += '<td style="' + _copTd() + '">' + copFmtVal(st.mean, p.isPn) + '</td>';
        html += '<td style="' + _copTd() + '">' + copFmtVal(st.s, p.isPn) + '</td>';
        html += '<td style="' + _copTd() + 'font-weight:700;">' + copFmtU(st.U) + '</td>';
        html += '<td style="' + _copTd() + 'color:var(--success);font-size: var(--fs-sm);">' + (st.cv ? st.cv.a.toFixed(3) : '—') + '</td>';
        html += '<td style="' + _copTd() + 'color:var(--danger);font-size: var(--fs-sm);">' + (st.cv ? st.cv.b.toFixed(3) : '—') + '</td>';
        html += '<td style="' + _copTd() + '">';
        html += '<span class="' + _copDecClass(st.decision) + '" style="padding:4px 12px;border-radius:var(--radius-sm);font-size: var(--fs-sm);font-weight:700;white-space:nowrap;">' +
                _copDecLabel(st.decision) + '</span>';
        html += '</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    html += '</div>'; // stats card

    // Veredicto de concordancia de la familia — banner protagonista (v19.0)
    if (overallDecision) {
        var vCls = { PASS: 'pass', FAIL: 'fail', CONTINUE: 'cont' }[overallDecision] || 'none';
        var vWord = { PASS: '✓ CONCORDANTE', FAIL: '✗ NO CONCORDANTE', CONTINUE: '⧗ EN MUESTREO' }[overallDecision];
        var vSub = {
            PASS:     'La familia cumple: el muestreo secuencial decidió a favor en todos los contaminantes activos.',
            FAIL:     'Algún contaminante superó B(n). El muestreo decidió en contra.',
            CONTINUE: 'Aún sin decidir: agrega otro VIN con resultados para que el muestreo concluya.'
        }[overallDecision];
        var nVin = (copState.vehicles || []).filter(function(v) { return v.vin; }).length;

        html += '<div class="cop-verdict cop-verdict--' + vCls + '" data-help="cop-verdict-help">';
        html += '<div style="flex:1;min-width:240px;">';
        html += '<div class="cop-verdict-word">' + vWord + '</div>';
        html += '<div class="cop-verdict-meta">' + vSub + '</div>';
        html += '</div>';
        html += '<div style="text-align:right;">';
        html += '<div class="cop-verdict-word" style="font-size:var(--fs-md);">n = ' + nVin + '</div>';
        html += '<div class="cop-verdict-meta">VIN(es) con resultados</div>';
        html += '</div>';
        html += '</div>';

        // Toast único al cambiar a NO CONCORDANTE
        if (overallDecision === 'FAIL' && copState._lastDecision !== 'FAIL' && typeof showToast === 'function') {
            showToast('⚠ Familia NO CONCORDANTE', 'error');
        }
        copState._lastDecision = overallDecision;
    } else {
        var faltan = 3 - (copState.vehicles || []).filter(function(v) {
            return copGetActiveLimits().some(function(p) { return v.values[p.id] !== undefined && v.values[p.id] !== ''; });
        }).length;
        html += '<div class="cop-verdict cop-verdict--none" data-help="cop-verdict-help">';
        html += '<div style="flex:1;min-width:240px;">';
        html += '<div class="cop-verdict-word">SIN VEREDICTO</div>';
        html += '<div class="cop-verdict-meta">El muestreo secuencial necesita al menos 3 VINes con valor por contaminante' +
                (faltan > 0 && faltan < 3 ? ' — faltan ' + faltan + '.' : '.') +
                ' Con menos datos no se afirma nada.</div>';
        html += '</div></div>';
        copState._lastDecision = null;
    }

    return html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v19.0] HTML: PANORAMA — todas las familias del alcance en una pantalla
// Pensado para proyectarse: una palabra grande por familia, el margen como barra
// y el motivo escrito. Sin Chart.js a propósito (nada de destruir/crear canvas).
// ═══════════════════════════════════════════════════════════════════════════════

var COP_VERDICT_UI = {
    PASS:     { cls: 'ok',   chip: 'cop-chip--ok',   word: 'CONCORDANTE',     short: 'CONCORDANTE' },
    FAIL:     { cls: 'bad',  chip: 'cop-chip--bad',  word: 'NO CONCORDANTE',  short: 'NO CONCORDA.' },
    CONTINUE: { cls: 'warn', chip: 'cop-chip--warn', word: 'EN MUESTREO',     short: 'EN MUESTREO' }
};
var COP_RISK_UI = {
    riesgo:      { cls: 'bad',  chip: 'cop-chip--bad',  glyph: '🔴', label: 'Riesgo alto' },
    atencion:    { cls: 'warn', chip: 'cop-chip--warn', glyph: '🟡', label: 'Atención' },
    ok:          { cls: 'ok',   chip: 'cop-chip--ok',   glyph: '🟢', label: 'Sin señales' },
    'sin-datos': { cls: 'none', chip: 'cop-chip--none', glyph: '⚪', label: 'Sin datos' }
};
function _copVerdictUI(v) { return COP_VERDICT_UI[v] || { cls: 'none', chip: 'cop-chip--none', word: 'SIN VEREDICTO', short: 'SIN VEREDICTO' }; }
function _copRiskUI(l) { return COP_RISK_UI[l] || COP_RISK_UI['sin-datos']; }

function copBuildOverviewHTML() {
    var rows = copPortfolioRows();
    var s = copPortfolioSummary(rows);
    var f = copState.ovFilter || {};
    var html = '';

    // ── KPIs ──────────────────────────────────────────────────────────────────
    var kpis = [
        { n: s.total,     l: 'Familias en alcance', k: 'none' },
        { n: s.pass,      l: 'Concordantes',        k: 'ok' },
        { n: s.cont,      l: 'En muestreo',         k: 'warn' },
        { n: s.fail,      l: 'No concordantes',     k: 'bad' },
        { n: s.sinDatos,  l: 'Sin datos',           k: 'none' },
        { n: s.riesgo,    l: 'Riesgo alto',         k: s.riesgo ? 'bad' : 'none' }
    ];
    html += '<div class="cop-kpis" data-help="cop-kpis-help">';
    kpis.forEach(function(k) {
        html += '<div class="cop-kpi cop-kpi--' + k.k + '"><div class="cop-kpi-n">' + k.n + '</div>' +
                '<div class="cop-kpi-l">' + k.l + '</div></div>';
    });
    html += '</div>';

    // ── Filtros ───────────────────────────────────────────────────────────────
    var regions = {};
    rows.forEach(function(r) { (r.regionsArr || []).forEach(function(x) { if (x) regions[x] = true; }); });
    html += '<div class="cop-toolbar">';
    html += '<div><p class="label-title" style="margin-bottom:6px;">Región</p>';
    html += '<select aria-label="Filtrar por región" class="cop-select" onchange="copSetOvFilter(\'region\', this.value)" ' +
            'style="padding:7px 10px;font-size:var(--fs-sm);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);color:var(--text);">';
    html += '<option value="">Todas</option>';
    Object.keys(regions).sort().forEach(function(r) {
        html += '<option value="' + _copEsc(r) + '"' + (f.region === r ? ' selected' : '') + '>' + _copEsc(r) + '</option>';
    });
    html += '</select></div>';

    html += '<div><p class="label-title" style="margin-bottom:6px;">Mostrar</p><div style="display:flex;gap:6px;flex-wrap:wrap;">';
    [['', 'Todas'], ['riesgo', '🔴 Riesgo'], ['atencion', '🟡 Atención'], ['sin-datos', '⚪ Sin datos']].forEach(function(o) {
        var active = (f.risk || '') === o[0];
        html += '<button type="button" class="cop-nav-btn' + (active ? ' active' : '') + '" ' +
                'onclick="copSetOvFilter(\'risk\', \'' + o[0] + '\')">' + o[1] + '</button>';
    });
    html += '</div></div>';

    html += '<div style="margin-left:auto;"><p class="label-title" style="margin-bottom:6px;">Sala</p>';
    html += '<button type="button" class="cop-nav-btn' + (copState.present ? ' active' : '') + '" ' +
            'data-help="cop-present-help" onclick="copTogglePresent()">🖥️ Modo presentación</button></div>';
    html += '</div>';

    // ── Aviso de límites que no coinciden con el perfil ───────────────────────
    var mism = rows.filter(function(r) { return r.limitsCheck && r.limitsCheck.mismatches && r.limitsCheck.mismatches.length; });
    if (mism.length) {
        html += '<div class="cop-note cop-note--bad"><div class="cop-note-title">⚠ Límite aplicado distinto al perfil de la norma</div>';
        html += mism.length + ' familia(s) se están juzgando contra un límite que NO coincide con su perfil de regulación. ' +
                'El veredicto de esas familias no es válido hasta corregirlo en Datos → Regulaciones:';
        html += '<ul style="margin:6px 0 0 18px;">';
        mism.slice(0, 6).forEach(function(r) {
            var m = r.limitsCheck.mismatches[0];
            html += '<li>' + _copEsc(r.label) + ' — ' + _copEsc(m.poll) + ': aplicado ' + m.applied + ' ' + _copEsc(m.appliedUnit) +
                    ', perfil ' + m.profile + ' ' + _copEsc(m.profileUnit) + (m.unitDiffers ? ' <b>(¡unidad distinta!)</b>' : '') + '</li>';
        });
        html += '</ul></div>';
    }

    // ── Retícula de familias ──────────────────────────────────────────────────
    var shown = rows.filter(function(r) {
        if (f.region && (r.regionsArr || []).indexOf(f.region) === -1) return false;
        if (f.risk && r.risk.level !== f.risk) return false;
        return true;
    });

    // [v20.5] Ocultar/mostrar — declutter de la LECTURA, no del tracking: una
    // familia oculta se sigue contando en los KPIs de arriba (que usan `rows`, no
    // `visible`) y en alertas/SPC; solo desaparece de la retícula y del Gantt.
    var hiddenSet = copState.ovHidden || {};
    var visible = shown.filter(function(r) { return !hiddenSet[r.key]; });
    var hidden = shown.filter(function(r) { return hiddenSet[r.key]; });

    if (hidden.length) {
        html += '<details class="cop-hidden-strip"><summary>➖ ' + hidden.length + ' familia(s) oculta(s) — siguen contando en KPIs y alertas' +
                '<button type="button" class="btn btn-sm btn-ghost" style="margin-left:10px;" onclick="event.preventDefault();copShowAllFamilies()">Mostrar todas</button></summary>';
        html += '<div class="cop-hidden-chips">';
        hidden.forEach(function(r) {
            html += '<button type="button" class="cop-chip cop-chip--none" onclick="copShowFamily(\'' +
                    _copEsc(r.key).replace(/'/g, '&#39;') + '\')" title="Mostrar de nuevo">' + _copEsc(r.label) + ' ✕</button>';
        });
        html += '</div></details>';
    }

    if (!rows.length) {
        html += '<div class="cop-note cop-note--warn"><div class="cop-note-title">Aún no hay familias en el alcance CoP</div>' +
                'El alcance vigente es ' + _copEsc(copScope().regulations.join(', ')) + ' en ' + _copEsc(copScope().regions.join(' y ')) + '. ' +
                'Importa el plan de producción en Plan → Producción, o libera vehículos de esas familias en Pruebas.</div>';
    } else if (!shown.length) {
        html += '<div class="cop-note">Ninguna familia coincide con el filtro. ' +
                '<button type="button" class="btn btn-sm btn-ghost" onclick="copSetOvFilter(\'risk\',\'\')">Quitar filtro</button></div>';
    } else if (!visible.length) {
        html += '<div class="cop-note">Todas las familias que coinciden con el filtro están ocultas. ' +
                '<button type="button" class="btn btn-sm btn-ghost" onclick="copShowAllFamilies()">Mostrar todas</button></div>';
    } else {
        html += _copFamilyGanttHTML(visible);
        html += '<div class="cop-fam-grid">';
        visible.forEach(function(r) { html += _copFamCardHTML(r); });
        html += '</div>';
    }

    // ── Lo que queda FUERA del alcance — se declara, no se esconde ────────────
    var oos = copOutOfScopeSummary();
    if (oos.total) {
        html += '<details class="card" style="margin-top:16px;">';
        html += '<summary data-help="cop-scope-help" style="cursor:pointer;font-weight:var(--weight-bold);color:var(--text);">' +
                'Fuera del alcance CoP: ' + oos.total + ' configuración(es) ' +
                '<span class="cop-chip cop-chip--none">no se juzgan aquí</span></summary>';
        html += '<div style="margin-top:10px;">';
        html += '<p class="label-title" style="margin-bottom:8px;">El laboratorio hace CoP sobre <b>' +
                _copEsc(copScope().regulations.join(' · ')) + '</b> en <b>' + _copEsc(copScope().regions.join(' y ')) +
                '</b>. Estas configuraciones se prueban, pero no entran al juicio de conformidad:</p>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
        oos.groups.forEach(function(g) {
            html += '<span class="cop-chip cop-chip--none">' + _copEsc(g.label) + ' · ' + g.n + '</span>';
        });
        html += '</div></div></details>';
    }

    return html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v19.0] EXPEDIENTE — la dimensión temporal
// copState.saved era una lista plana pintada como renglones diminutos: no había
// forma de ver la historia de UNA familia. La cronología se DERIVA (mismo principio
// que pnProjectTimeline y v.timeline): mezcla los juicios guardados con los ensayos
// de la familia. No se guarda nada nuevo.
// ═══════════════════════════════════════════════════════════════════════════════

/** LA definición de la cronología de una familia. Eventos más recientes primero. */
function copFamilyHistory(familyKey) {
    var ev = [];
    (copState.saved || []).forEach(function(j) {
        if (_copJudgmentMatchesFamily(j, familyKey)) { // v20.8: incluye juicios con clave vieja (prefijo)
            ev.push({
                at: j.date, kind: 'juicio', decision: j.decision, id: j.id,
                by: j.by || '', n: (j.vehicles || []).filter(function(v) { return v.vin; }).length,
                text: 'Juicio emitido: ' + _copDecisionWord(j.decision) +
                      (j.by ? ' — ' + j.by : '') + ' · n=' + (j.vehicles || []).filter(function(v) { return v.vin; }).length
            });
        }
    });
    var rows = copPortfolioRows();
    var row = rows.find(function(r) { return r.key === familyKey; });
    (row && row.tests ? row.tests : []).forEach(function(t) {
        ev.push({ at: t.date, kind: 'ensayo', text: 'Ensayo liberado — VIN ' + (t.vin || '(sin VIN)') });
    });
    (row && row.spcAlarms ? row.spcAlarms : []).forEach(function(a) {
        ev.push({ at: a.date, kind: 'alarma',
                  text: 'Alarma de control ' + a.rule + ' en ' + (a.gasLabel || a.gas) + ' — ' + (COP_SPC_RULES[a.rule] || '') });
    });
    return ev.sort(function(a, b) { return (b.at || '').localeCompare(a.at || ''); });
}

function _copDecisionWord(d) {
    return d === 'PASS' ? 'CONCORDANTE' : d === 'FAIL' ? 'NO CONCORDANTE'
         : d === 'CONTINUE' ? 'EN MUESTREO (sin decidir)' : (d || 'INCOMPLETO');
}

/** Veredicto vigente de una familia en una fecha — el último juicio hasta ese día. */
function copVerdictAt(familyKey, isoDate) {
    var best = null;
    (copState.saved || []).forEach(function(j) {
        if (!_copJudgmentMatchesFamily(j, familyKey)) return; // v20.8: clave vieja empata por prefijo
        if ((j.date || '') > isoDate) return;
        if (!best || (j.date || '') > (best.date || '')) best = j;
    });
    return best ? best.decision : null;
}

function copBuildDossierHTML() {
    var rows = copPortfolioRows();
    var key = copState.familyKey;
    var row = rows.find(function(r) { return r.key === key; });
    var html = '';

    // Selector de familia
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" data-help="cop-dossier-help">🗂️ Expediente de familia</div>';
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">';
    html += '<div style="flex:1;min-width:280px;"><p class="label-title" style="margin-bottom:6px;">Familia</p>';
    html += '<select aria-label="Familia del expediente" onchange="copSelectFamily(this.value)" ' +
            'style="width:100%;padding:7px 10px;font-size:var(--fs-sm);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);color:var(--text);">';
    html += '<option value="">— Selecciona una familia —</option>';
    rows.forEach(function(r) {
        html += '<option value="' + _copEsc(r.key) + '"' + (r.key === key ? ' selected' : '') + '>' +
                _copEsc(r.label) + ' — ' + _copVerdictUI(r.verdict).word + '</option>';
    });
    html += '</select></div>';
    if (row) {
        html += '<button type="button" class="btn btn-sm" style="background:var(--accent-cop);color:#fff;" ' +
                'onclick="copFamilyPDF()">📄 Expediente PDF</button>';
        html += '<button type="button" class="btn btn-sm btn-ghost" onclick="copExportFamilyCSV()">CSV</button>';
    }
    html += '</div></div>';

    if (!row) {
        html += '<div class="cop-note">Elige una familia para ver su historia: juicios emitidos, ensayos liberados y alarmas de control, en orden cronológico.</div>';
        return html;
    }

    // Franja del año
    var year = new Date().getFullYear();
    var meses = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" data-help="cop-strip-help">📅 Veredicto vigente por mes — ' + year + '</div>';
    html += '<div class="cop-strip">';
    for (var m = 0; m < 12; m++) {
        var lastDay = new Date(year, m + 1, 0);
        var iso = year + '-' + String(m + 1).padStart(2, '0') + '-' + String(lastDay.getDate()).padStart(2, '0');
        var v = copVerdictAt(row.key, iso + 'T23:59:59');
        var cls = v === 'PASS' ? 'cop-cell--pass' : v === 'FAIL' ? 'cop-cell--fail'
                : v === 'CONTINUE' ? 'cop-cell--cont' : 'cop-cell--none';
        html += '<div class="cop-strip-cell ' + cls + '" title="' + meses[m] + ' ' + year + ': ' +
                (v ? _copDecisionWord(v) : 'sin juicio emitido') + '">' + meses[m] + '</div>';
    }
    html += '</div>';
    html += '<p class="label-title" style="margin-top:8px;font-size:var(--fs-xs);">Un mes en gris significa que ese mes no había un juicio emitido — nunca se pinta verde por omisión.</p>';
    html += '</div>';

    // Cronología
    var ev = copFamilyHistory(row.key);
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title">🕒 Cronología — ' + _copEsc(row.label) + '</div>';
    if (!ev.length) {
        html += '<p class="label-title">Sin eventos registrados todavía para esta familia.</p>';
    } else {
        html += '<div class="cop-timeline">';
        ev.slice(0, 60).forEach(function(e) {
            var dot = e.kind === 'juicio' ? (e.decision === 'PASS' ? 'cop-tl-dot--ok' : e.decision === 'FAIL' ? 'cop-tl-dot--bad' : 'cop-tl-dot--warn')
                    : e.kind === 'alarma' ? 'cop-tl-dot--warn' : '';
            html += '<div class="cop-tl-item"><div class="cop-tl-dot ' + dot + '"></div>';
            html += '<div class="cop-tl-date">' + _copEsc((e.at || '').slice(0, 10) || 's/f') + '</div>';
            html += '<div class="cop-tl-body">' + _copEsc(e.text) + '</div></div>';
        });
        html += '</div>';
        if (ev.length > 60) html += '<p class="label-title" style="margin-top:8px;">Mostrando los 60 eventos más recientes de ' + ev.length + '.</p>';
    }
    html += '</div>';
    return html;
}

/** Una tarjeta de familia del Panorama. */
function _copFamCardHTML(r) {
    var vu = _copVerdictUI(r.verdict), ru = _copRiskUI(r.risk.level);
    var keyEsc = _copEsc(r.key).replace(/'/g, '&#39;');
    // div, no <button>: necesita un <button> real anidado adentro (ocultar) y un
    // <button> no puede contener otro. a11yClickables()/el listener global de
    // Enter-Espacio (app.js) le dan el mismo comportamiento de teclado que un botón.
    var html = '<div class="cop-fam-card cop-fam-card--' + ru.cls + '" ' +
               'onclick="copOpenFamily(\'' + keyEsc + '\')" ' +
               'aria-label="Abrir familia ' + _copEsc(r.label) + '">';

    html += '<button type="button" class="cop-fam-hide-btn" title="Ocultar ' + _copEsc(r.label) + ' del Panorama (sigue contando en KPIs y alertas)" ' +
            'aria-label="Ocultar familia ' + _copEsc(r.label) + '" ' +
            'onclick="event.stopPropagation();copHideFamily(\'' + keyEsc + '\')">➖</button>';

    html += '<div class="cop-fam-head">';
    html += '<div><div class="cop-fam-title">' + _copEsc(r.label) + '</div>';
    // v20.8: la carrocería y el tren motriz ya viven en el TÍTULO (label incluye
    // ep/engpkg/body desde que entraron a la identidad de la familia) — repetirlos
    // aquí era ruido. El sub queda para lo que el título no dice: regiones y norma.
    html += '<div class="cop-fam-sub">' + _copEsc((r.regionsArr || []).join(', ') || '—') +
            (r.emissionReg ? ' · ' + _copEsc(r.emissionReg) : '') + '</div>';
    if (r.ipFamilies && r.ipFamilies.length) {
        html += '<div class="cop-fam-sub" style="font-family:monospace;">🧬 ' +
                _copEsc(r.ipFamilies.join(' · ')) + '</div>';
    }
    html += '</div>';
    html += '<span class="cop-chip ' + ru.chip + '" title="' + _copEsc(ru.label) + '">' + ru.glyph + '</span>';
    html += '</div>';

    html += '<div><span class="cop-chip ' + vu.chip + '">' + vu.word + '</span></div>';

    // Barra de margen: el único número que un no-laboratorista entiende sin ayuda.
    if (r.marginPct !== null && r.marginPct !== undefined) {
        var pct = Math.max(0, Math.min(100, r.marginPct));
        var barCls = r.marginPct >= 90 ? 'bad' : r.marginPct >= 80 ? 'warn' : 'ok';
        html += '<div><div class="cop-bar-label"><span>' + _copEsc(r.worstPoll || 'peor gas') + ' vs límite</span>' +
                '<span><b>' + Math.round(r.marginPct) + '%</b></span></div>';
        html += '<div class="cop-bar"><div class="cop-bar-fill cop-bar-fill--' + barCls + '" style="width:' + pct + '%;"></div></div></div>';
    }

    html += '<div class="cop-fam-metrics">';
    html += '<div class="cop-fam-metric"><div class="cop-fam-metric-n">' + (r.n || 0) + '</div><div class="cop-fam-metric-l">VIN</div></div>';
    html += '<div class="cop-fam-metric"><div class="cop-fam-metric-n">' +
            (r.cpkMin === null || r.cpkMin === undefined ? '—' : r.cpkMin.toFixed(2)) +
            '</div><div class="cop-fam-metric-l">Cpk mín</div></div>';
    html += '<div class="cop-fam-metric"><div class="cop-fam-metric-n">' +
            (r.daysSinceTest === null || r.daysSinceTest === undefined ? '—' : r.daysSinceTest) +
            '</div><div class="cop-fam-metric-l">días</div></div>';
    html += '</div>';

    html += '<div class="cop-fam-reason">' + _copEsc(r.risk.reasons[0].text) + '</div>';
    return html + '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════════
// [v20.5] GANTT DE PANORAMA — cruza el plan (Mi semana) con las familias que se
// están mostrando (no ocultas) para responder "¿cuándo se completan los vehículos
// que le faltan a esta familia?". Se deriva de tpFamilyWeeklyProgress() en cada
// render — no guarda nada, así que una semana que se mueve o se sustituye en Mi
// semana se refleja aquí solo (nada que resincronizar).
//
// A propósito NO pretende reconciliar esto con `planTested`/cobertura (que cuentan
// TODO testedList, incluida evidencia fuera de cualquier plan semanal): esta es
// la lectura "según lo programado en el Plan", una lente distinta y más angosta.
// ═══════════════════════════════════════════════════════════════════════════════
function _copFamilyGanttHTML(rows) {
    if (typeof tpFamilyWeeklyProgress !== 'function') return '';
    var data = rows.map(function(r) {
        return { row: r, weeks: tpFamilyWeeklyProgress(r.key) };
    }).filter(function(d) { return d.weeks.length; });

    var card = '<div class="card" style="margin-bottom:16px;">' +
        '<div class="card-title" data-help="cop-gantt-help">📅 Progreso semanal — familias mostradas</div>';

    if (!data.length) {
        return card + '<p class="label-title" style="margin:0;">Ninguna de las familias que se muestran tiene actividad programada en Plan → Mi semana todavía.</p></div>';
    }

    // Eje de semanas COMPARTIDO: unión de fechas con actividad en cualquier familia
    // mostrada, para que todas las filas se lean en la misma columna de calendario.
    var weekSet = {};
    data.forEach(function(d) { d.weeks.forEach(function(w) { weekSet[w.weekDate] = true; }); });
    var allWeeks = Object.keys(weekSet).sort();
    var MAX_COLS = 12;
    var weekDates = allWeeks.length > MAX_COLS ? allWeeks.slice(-MAX_COLS) : allWeeks;

    function weekLabel(iso) {
        var d = new Date(iso + 'T00:00:00');
        if (isNaN(d.getTime())) return iso;
        var end = new Date(d); end.setDate(d.getDate() + 6);
        var fmt = function(x) { return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0'); };
        return fmt(d) + '–' + fmt(end);
    }
    var todayMon = (typeof _tpMonday === 'function' && typeof _tpFmtDate === 'function') ? _tpFmtDate(_tpMonday(new Date())) : null;

    var html = card;
    if (allWeeks.length > MAX_COLS) {
        html += '<p class="label-title" style="margin:0 0 10px;">Mostrando las ' + MAX_COLS + ' semanas más recientes/próximas de ' + allWeeks.length + ' con actividad.</p>';
    }
    html += '<div class="cop-gantt-scroll"><table class="cop-gantt">';
    html += '<thead><tr><th class="cop-gantt-fam">Familia</th>';
    weekDates.forEach(function(wd) {
        html += '<th class="cop-gantt-wk' + (wd === todayMon ? ' cop-gantt-wk--now' : '') + '">' + weekLabel(wd) + '</th>';
    });
    html += '<th class="cop-gantt-total">En el Plan</th></tr></thead><tbody>';

    data.forEach(function(d) {
        var r = d.row;
        var byWeek = {};
        d.weeks.forEach(function(w) { byWeek[w.weekDate] = w; });
        var totalDone = d.weeks.reduce(function(a, w) { return a + w.done; }, 0);
        var totalPlanned = d.weeks.reduce(function(a, w) { return a + w.planned; }, 0);
        var required = r.planRequired || 0;
        var pending = Math.max(0, required - totalDone);

        // v20.8: carrocería y tren motriz SEPARADOS, como chips propios — no pegados al
        // nombre. Los segmentos salen de la clave (mod|eng|tx|my|reg|ep|engpkg|body),
        // que es la única fuente que ambos orígenes de fila (plan y SPC) comparten.
        var seg = String(r.key).split('|');
        var nombre = seg.slice(0, 5).filter(Boolean).join(' · ') || r.label;
        var chips = '';
        if (seg[7]) chips += '<span class="cop-gantt-chip cop-gantt-chip--body">' + _copEsc(seg[7]) + '</span>';
        if (seg[5]) chips += '<span class="cop-gantt-chip cop-gantt-chip--pt">' + _copEsc(seg[5]) + '</span>';
        if (seg[6]) chips += '<span class="cop-gantt-chip cop-gantt-chip--pt">' + _copEsc(seg[6]) + '</span>';

        html += '<tr>';
        html += '<td class="cop-gantt-fam"><button type="button" class="cop-gantt-fam-btn" onclick="copOpenFamily(\'' +
                _copEsc(r.key).replace(/'/g, '&#39;') + '\')">' + _copEsc(nombre) + '</button>' +
                (chips ? '<div class="cop-gantt-chips">' + chips + '</div>' : '') +
                '<div class="cop-gantt-fam-sub">' + (required ? ('requiere ' + required) : 'sin cuota vigente') + '</div></td>';

        weekDates.forEach(function(wd) {
            var w = byWeek[wd];
            var nowCls = wd === todayMon ? ' cop-gantt-cell--nowcol' : '';
            if (!w) { html += '<td class="cop-gantt-cell cop-gantt-cell--empty' + nowCls + '"></td>'; return; }
            var parts = [];
            if (w.verified) parts.push('<span class="cop-gantt-n cop-gantt-n--verified">' + w.verified + '</span>');
            if (w.declared) parts.push('<span class="cop-gantt-n cop-gantt-n--declared">' + w.declared + '</span>');
            if (w.planned) parts.push('<span class="cop-gantt-n cop-gantt-n--planned">' + w.planned + '</span>');
            var title = w.verified + ' verificado(s) · ' + w.declared + ' declarado(s) · ' + w.planned +
                        ' programado(s) sin correr — semana ' + weekLabel(wd) +
                        (w.proposal ? ' · plan aún NO aceptado (propuesta)' : '');
            // v20.10: una semana cuyo plan sigue siendo propuesta no es compromiso — se
            // marca en vez de leerse igual que una semana aceptada.
            html += '<td class="cop-gantt-cell' + nowCls + (w.proposal ? ' cop-gantt-cell--prop' : '') +
                    '" title="' + _copEsc(title) + '">' + parts.join('') + '</td>';
        });

        // Barra de avance done/required — el número queda, la barra lo hace legible de lejos.
        var barHtml = '';
        if (required > 0) {
            var pct = Math.max(0, Math.min(100, Math.round(totalDone / required * 100)));
            barHtml = '<div class="cop-gantt-mini"><div class="cop-gantt-mini-fill' + (pct >= 100 ? ' cop-gantt-mini-fill--done' : '') + '" style="width:' + pct + '%;"></div></div>';
        }
        html += '<td class="cop-gantt-total-cell"><b>' + totalDone + (required ? (' / ' + required) : '') + '</b>' + barHtml +
                (pending ? '<div class="cop-gantt-pending">faltan ' + pending + '</div>' : (required ? '<div class="cop-gantt-done-tag">✓ cumplida</div>' : '')) +
                (totalPlanned ? '<div class="cop-gantt-fam-sub">+' + totalPlanned + ' programado(s)</div>' : '') +
                '</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    html += '<div class="cop-gantt-legend"><span><span class="cop-gantt-n cop-gantt-n--verified">n</span> verificado</span>' +
            '<span><span class="cop-gantt-n cop-gantt-n--declared">n</span> declarado (sin evidencia aún)</span>' +
            '<span><span class="cop-gantt-n cop-gantt-n--planned">n</span> programado, todavía sin correr</span>' +
            '<span><span class="cop-gantt-chip cop-gantt-chip--body">5DR</span> carrocería</span>' +
            '<span><span class="cop-gantt-chip cop-gantt-chip--pt">MILD HEV</span> tren motriz</span>' +
            '<span><span class="cop-gantt-propdot"></span> semana con plan aún no aceptado</span>' +
            '<span>"En el Plan" cuenta solo lo que pasó por Mi semana — puede no coincidir con la cobertura total si hubo evidencia capturada fuera del plan.</span></div>';
    html += '</div>';
    return html;
}

// ─── HTML: PÁGINA COMPLETA (Panorama | Validador | Control SPC | Expediente) ──
function copBuildHTML() {
    var view = copState.view || 'overview';
    var scope = copScope();
    var html = '<div class="container cop-main" style="padding-top:20px;padding-bottom:20px;">';

    // Cabecera de plataforma — las otras 4 plataformas la tienen; el CoP no la tenía.
    html += '<div class="cop-header">';
    html += '<div class="cop-header-title">🔬 Conformidad de Producción — Tipo 1';
    if (copState.present) html += '<span class="cop-chip cop-chip--info">Modo presentación</span>';
    html += '</div>';
    html += '<div class="cop-header-sub">Muestreo secuencial σ desconocida (R83 Rev.5 / R154 Ap.2) · Alcance: <b>' +
            _copEsc(scope.regulations.join(' · ')) + '</b> en <b>' + _copEsc(scope.regions.join(' y ')) + '</b></div>';
    html += '</div>';

    // Navegación
    html += '<nav class="cop-nav" aria-label="Vistas de CoP">';
    COP_VIEWS.forEach(function(t) {
        var active = view === t[0];
        html += '<button type="button" class="cop-nav-btn' + (active ? ' active' : '') + '"' +
                (active ? ' aria-current="page"' : '') +
                ' onclick="copSetView(\'' + t[0] + '\')">' + t[1] + '</button>';
    });
    html += '</nav>';

    // v16.0: el banner de ayuda de esta pestaña. HELP_TABS traía las entradas del CoP
    // desde v16.0 pero nadie llamaba helpBannerHTML() aquí, así que nunca se vieron.
    var helpKey = { overview: 'cop-overview', validator: 'cop-validator', spc: 'cop-spc', dossier: 'cop-dossier' }[view];
    if (helpKey && typeof helpBannerHTML === 'function') {
        try { html += helpBannerHTML(helpKey); } catch (e) { }
    }

    html += view === 'overview' ? copBuildOverviewHTML()
          : view === 'spc'      ? copBuildSpcHTML()
          : view === 'dossier'  ? copBuildDossierHTML()
          :                       copBuildValidatorHTML();
    html += '</div>'; // container
    return html;
}

// ─── HTML: VISTA VALIDADOR ────────────────────────────────────────────────────
function copBuildValidatorHTML() {
    var limits = COP_FUEL_LIMITS[copState.fuelType] || COP_PI_LIMITS;
    var activeLimits = copGetActiveLimits();
    var n = copState.vehicles.length;

    var html = '';

    // ── Cabecera + Configuración ──────────────────────────────────────────────
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" data-help="cop-validator-help" style="border-bottom-color:var(--accent-cop);">📋 Validador de conformidad</div>';
    // El reglamento (R154/R83) es el PROCEDIMIENTO de ensayo; la norma de emisiones
    // (EURO-5, PRE-EURO 7…) es de dónde salen los límites. Son dos cosas distintas y
    // la cabecera las confundía escribiendo "Euro 6" fijo.
    var _famReg = _copFamilyEmissionReg(copState.familyKey);
    html += '<p class="label-title" style="margin-bottom:18px;">' +
            'Tipo 1 · Apéndice 2 · Muestreo secuencial σ desconocida · Procedimiento ' +
            copState.regulation + ' (' + (copState.regulation === 'R154' ? 'WLTP' : 'NEDC') + ')' +
            (_famReg ? ' · Norma de emisiones <b>' + _copEsc(_famReg) + '</b>' : '') + '</p>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;">';

    // Reglamento
    html += '<div>';
    html += '<p class="label-title" style="margin-bottom:8px;">Reglamento</p>';
    html += '<div style="display:flex;gap:6px;">';
    ['R154', 'R83'].forEach(function(r) {
        var active = copState.regulation === r;
        html += '<button onclick="copSetRegulation(\'' + r + '\')" class="btn btn-sm ' +
                (active ? '' : 'btn-ghost') + '" ' +
                (active ? 'style="background:var(--accent-cop);color:#fff;"' : '') +
                '>' + r + '</button>';
    });
    html += '</div></div>';

    // Tipo de combustible
    html += '<div>';
    html += '<p class="label-title" style="margin-bottom:8px;">Tipo de Combustible</p>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    ['PI', 'CI', 'Híbrido PI', 'Híbrido CI'].forEach(function(f) {
        var active = copState.fuelType === f;
        html += '<button onclick="copSetFuel(\'' + f + '\')" class="btn btn-sm ' +
                (active ? '' : 'btn-ghost') + '" ' +
                (active ? 'style="background:var(--accent-cop);color:#fff;"' : '') +
                '>' + f + '</button>';
    });
    html += '</div></div>';

    // Contaminantes activos
    html += '<div>';
    html += '<p class="label-title" style="margin-bottom:8px;">Contaminantes Activos</p>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    limits.forEach(function(p) {
        var active = !!copState.activePolls[p.id];
        var label = p.label + (p.note ? ' <span style="font-size: var(--fs-xs);opacity:0.65;">(' + p.note + ')</span>' : '');
        html += '<button onclick="copTogglePoll(\'' + p.id + '\')" class="btn btn-sm ' +
                (active ? '' : 'btn-ghost') + '" ' +
                (active ? 'style="background:var(--accent-cop);color:#fff;"' : '') +
                '>' + label + '</button>';
    });
    html += '</div></div>';

    html += '</div>'; // config row
    html += '</div>'; // header card

    // ── Selección de familia (filtrable por región) ───────────────────────────
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" data-help="cop-family-help" style="border-bottom-color:var(--accent-cop);">👪 Familia a evaluar</div>';
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">';
    var _copRegs = copRegions();
    html += '<div><p class="label-title" style="margin-bottom:6px;">Región</p>';
    html += '<select aria-label="Región" onchange="copSetRegion(this.value)" style="padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);">';
    html += '<option value="">Todas</option>';
    _copRegs.forEach(function(r) { html += '<option value="' + _copEsc(r) + '" ' + (copState.region === r ? 'selected' : '') + '>' + _copEsc(r) + '</option>'; });
    html += '</select></div>';
    // v19.0: la lista sale del Panorama (unión de plan + vehículos ya probados). Antes
    // solo leía tpState.planData, así que una familia con ensayos pero sin plan
    // importado salía como "Familia (0)" aunque estuviera abierta y con datos en pantalla.
    var _copFams = copPortfolioRows().filter(function(f) {
        return !copState.region || (f.regionsArr || []).indexOf(copState.region) !== -1;
    });
    html += '<div style="flex:1;min-width:260px;"><p class="label-title" style="margin-bottom:6px;">Familia (' + _copFams.length + ')</p>';
    html += '<select aria-label="Familia a evaluar" onchange="copSelectFamily(this.value)" style="width:100%;padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);">';
    html += '<option value="">— Selecciona una familia —</option>';
    _copFams.forEach(function(f) {
        html += '<option value="' + _copEsc(f.key) + '" ' + (copState.familyKey === f.key ? 'selected' : '') + '>' +
                _copEsc(f.label) + (f.inPlan ? '' : ' (sin plan)') + '</option>';
    });
    html += '</select></div>';
    html += '</div>';
    if (!_copFams.length) {
        html += '<p class="label-title" style="margin-top:10px;color:var(--warn-text);">No hay familias en el alcance CoP todavía. ' +
                'Importa el plan de producción, o libera vehículos de ' + _copEsc(copScope().regulations.join(' / ')) + '. ' +
                '<button onclick="switchPlatform(\'testplan\');if(typeof tpSwitchTab===\'function\')tpSwitchTab(\'tp-production\');" class="btn btn-sm btn-ghost" style="font-size: var(--fs-xs);margin-left:6px;">📥 Ir a Producción →</button></p>';
    } else if (copState.familyLabel) {
        html += '<p class="label-title" style="margin-top:10px;color:var(--accent-cop);">Evaluando: ' + _copEsc(copState.familyLabel) + '</p>';
    }
    html += '</div>'; // family card

    // ── Tabla de datos de vehículos ───────────────────────────────────────────
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;' +
            'border-bottom:2px solid var(--accent-cop);padding-bottom:10px;">';
    html += '<span style="font-size:var(--font-base);font-weight:var(--weight-bold);color:var(--text);flex:1;">' +
            '🚗 Datos de Vehículos</span>';
    html += '<span class="label-title">' + n + ' VIN(es)</span>';
    html += '</div>';

    html += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
    html += '<button onclick="copAddManualRow()" class="btn btn-sm btn-ghost" style="color:var(--info);">➕ VIN manual</button>';
    html += '<button onclick="copClearData()" class="btn btn-sm btn-ghost">Limpiar valores</button>';
    html += '<button onclick="copSaveJudgment()" class="btn btn-sm" style="background:var(--accent-cop);color:#fff;margin-left:auto;">💾 Guardar juicio</button>';
    html += '</div>';

    if (activeLimits.length === 0) {
        html += '<p class="label-title" style="text-align:center;padding:20px;">Activa al menos un contaminante para introducir datos.</p>';
    } else {
        var _stale = (copState.vehicles || []).filter(function(v) { return v.staleAuto; });
        if (_stale.length) {
            html += '<div class="cop-note cop-note--warn">';
            html += '<div class="cop-note-title">↻ ' + _stale.length + ' VIN(es) con un valor distinto en el laboratorio</div>';
            html += 'La celda que ya tenía valor NO se sobrescribió: el laboratorio registró otro número para ' +
                    _copEsc(_stale.map(function(v) { return v.vin; }).join(', ')) +
                    '. Revisa cuál es el correcto y usa ↻ en la fila para traer el del laboratorio.';
            html += '</div>';
        }
        // Encabezado de límites por contaminante (columnas)
        html += '<div style="overflow-x:auto;">';
        html += '<table style="border-collapse:collapse;width:100%;min-width:520px;">';
        html += '<caption class="sr-only">VINes de la familia y su resultado por gas</caption>';
        html += '<thead><tr style="background:var(--bg);">';
        html += '<th scope="col" style="' + _copTh() + 'text-align:left;padding-left:14px;">VIN</th>';
        activeLimits.forEach(function(p) {
            html += '<th scope="col" style="' + _copTh() + '">' + p.label +
                    '<br><span style="font-size: var(--fs-xs);font-weight:400;color:var(--muted);text-transform:none;">L=' + copFmtLimit(p.limit, p.isPn) + ' ' + p.unit + '</span></th>';
        });
        html += '<th scope="col" style="' + _copTh() + '"><span class="sr-only">Acciones</span></th>';
        html += '</tr></thead><tbody>';

        // Una fila por VIN
        copState.vehicles.forEach(function(v) {
            html += '<tr>';
            html += '<td style="' + _copTd() + 'text-align:left;padding-left:10px;">';
            html += '<input type="text" aria-label="VIN" value="' + _copEsc(v.vin || '') + '" data-vid="' + v.id + '" ' +
                    'oninput="copSetVin(this)" placeholder="VIN" ' + (v.source === 'auto' ? 'title="Auto desde vehículo probado" ' : '') +
                    'style="width:170px;padding:6px 8px;font-size: var(--fs-sm);box-sizing:border-box;font-family:monospace;' +
                    (v.source === 'auto' ? 'border-left:3px solid var(--accent-cop);' : '') + '" />';
            html += '</td>';
            activeLimits.forEach(function(p) {
                html += '<td style="' + _copTd() + 'padding:6px 8px;">';
                html += '<input type="number" step="any" placeholder="—" aria-label="' + _copEsc(p.label) + ' — VIN ' + _copEsc(v.vin || '(sin VIN)') + '" ';
                html += 'value="' + (v.values[p.id] !== undefined ? v.values[p.id] : '') + '" ';
                html += 'data-vid="' + v.id + '" data-pid="' + p.id + '" ';
                html += 'oninput="copHandleInput(this)" ';
                html += 'style="width:90px;padding:6px 8px;font-size:12px;text-align:right;box-sizing:border-box;font-family:monospace;" />';
                html += '</td>';
            });
            html += '<td style="' + _copTd() + 'padding:4px;white-space:nowrap;">';
            if (v.staleAuto) {
                // El laboratorio tiene otro valor para este VIN. Se AVISA, no se pisa:
                // reescribir en silencio un número sobre el que ya se emitió un juicio
                // es exactamente el hallazgo que este módulo existe para evitar.
                html += '<button onclick="copAcceptLabValues(' + v.id + ')" class="btn btn-sm btn-ghost" ' +
                        'title="El laboratorio tiene otro valor para este VIN — traerlo" ' +
                        'style="padding:2px 6px;color:var(--warn-text);">↻</button>';
            }
            html += '<button onclick="copRemoveRow(' + v.id + ')" class="btn btn-sm btn-ghost" title="Quitar VIN" style="padding:2px 8px;">✕</button></td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>'; // overflow-x
        html += '<p class="label-title" style="margin-top:10px;font-size: var(--fs-xs);color:var(--muted);">Los VINes marcados en azul se autollenaron desde vehículos probados de la familia; captura/edita los gases. El veredicto se recalcula en vivo (requiere ≥3 VINes con valor por contaminante).</p>';
    }
    html += '</div>'; // data card

    // ── Análisis estadístico + decisión global ────────────────────────────────
    html += '<div id="cop-stats-section">' + copBuildStatsHTML() + '</div>';

    // ── Tabla de valores críticos A(n)/B(n) ───────────────────────────────────
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div style="display:flex;align-items:center;cursor:pointer;" onclick="copToggleTable()">';
    html += '<span style="font-size:var(--font-base);font-weight:var(--weight-bold);color:var(--text);flex:1;">' +
            '📊 Tabla Valores Críticos A(n)/B(n)</span>';
    html += '<span id="cop-cv-chevron" style="color:var(--muted);font-size:14px;">' +
            (copState.showTable ? '▾' : '▸') + '</span>';
    html += '</div>';

    html += '<div id="cop-cv-table-body" style="' + (copState.showTable ? '' : 'display:none;') + 'margin-top:14px;overflow-x:auto;">';
    html += '<table style="border-collapse:collapse;min-width:200px;">';
    html += '<thead><tr style="background:var(--bg);">';
    ['n', 'A(n)', 'B(n)'].forEach(function(h) {
        html += '<th style="' + _copTh() + 'min-width:70px;">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';
    Object.entries(COP_CV).forEach(function(entry) {
        var nVal = parseInt(entry[0]);
        var vals = entry[1];
        var isCurrent = nVal === n;
        html += '<tr style="' + (isCurrent ? 'background:rgba(8,145,178,0.08);font-weight:700;' : '') + '">';
        html += '<td style="' + _copTd() + (isCurrent ? 'color:var(--accent-cop);' : 'color:var(--muted);') + '">' + nVal + '</td>';
        html += '<td style="' + _copTd() + 'color:var(--success);' + (isCurrent ? '' : 'opacity:0.55;') + '">' + vals.a.toFixed(3) + '</td>';
        html += '<td style="' + _copTd() + 'color:var(--danger);' + (isCurrent ? '' : 'opacity:0.55;') + '">' + vals.b.toFixed(3) + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table>';
    html += '</div>'; // table body
    html += '</div>'; // cv card

    // ── Juicios guardados ──────────────────────────────────────────────────────
    if (copState.saved && copState.saved.length) {
        html += '<div class="card" style="margin-bottom:16px;">';
        html += '<div class="card-title" style="border-bottom-color:var(--accent-cop);">💾 Juicios guardados (' + copState.saved.length + ')</div>';
        copState.saved.forEach(function(r) {
            var decTxt = r.decision === 'PASS' ? 'CONCORDANTE' : r.decision === 'FAIL' ? 'NO CONCORDANTE' : r.decision === 'CONTINUE' ? 'INCOMPLETO' : r.decision;
            html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--border);">';
            html += '<span style="font-size: var(--fs-xs);color:var(--muted);min-width:74px;">' + new Date(r.date).toLocaleDateString('es-MX') + '</span>';
            html += '<span style="flex:1;min-width:160px;font-size: var(--fs-sm);color:var(--text);">' + _copEsc(r.familyLabel || '(sin familia)') + ' · ' + r.fuelType + ' · ' + r.regulation + '</span>';
            html += '<span class="' + _copDecClass(r.decision) + '" style="padding:3px 10px;border-radius:var(--radius-sm);font-size: var(--fs-xs);font-weight:700;">' + decTxt + '</span>';
            html += '<button onclick="copLoadJudgment(\'' + r.id + '\')" class="btn btn-sm btn-ghost" style="font-size: var(--fs-xs);">Cargar</button>';
            html += '<button onclick="copDeleteJudgment(\'' + r.id + '\')" class="btn btn-sm btn-ghost" style="font-size: var(--fs-xs);" title="Borrar">✕</button>';
            html += '</div>';
        });
        html += '</div>';
    }

    // ── CO₂ vs target declarado (v17.14) ──────────────────────────────────────
    html += _copBuildCo2HTML();

    // ── Disclaimer regulatorio ─────────────────────────────────────────────────
    html += '<div class="cop-note cop-note--warn">';
    html += '<div class="cop-note-title">⚠ Advertencia regulatoria</div>';
    html += '<p style="font-size:var(--fs-xs);line-height:1.7;margin:0;">' +
            'Los valores A(n)/B(n) son de referencia, basados en R83 Rev.5 / R154 Apéndice 2. ' +
            'Verificar contra el texto oficial del reglamento antes de su uso en homologación real. ' +
            'Los límites aplicados corresponden a ' + _copEsc(copScope().regulations.join(' / ')) +
            ', que comparten los mismos valores de Tipo 1; el validador avisa arriba si el perfil de la ' +
            'norma de una familia no coincide con el límite aplicado. ' +
            'La decisión es independiente por contaminante: la familia se declara NO CONCORDANTE si ' +
            'cualquier contaminante lo es.' +
            '</p>';
    html += '</div>';

    return html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROL SPC — Carta I-MR por familia × gas (adaptado del tablero VETS del
// laboratorio hermano). Serie = valores FINALES verificados por vehículo liberado
// (gasResults.aprobador, fallback liberador), ordenados por fecha de captura.
// σ estimada del rango móvil (MR̄/1.128); reglas de alarma Nelson R1/R2/R3;
// Cpk = (Límite − media)/(3σ) con n≥8. CO2 se grafica para vigilancia pero no alarma.
// ═══════════════════════════════════════════════════════════════════════════════
var COP_SPC_MIN = 4;      // n mínimo para límites de control y alarmas
var COP_SPC_RELIABLE = 8; // n para límites confiables y Cpk
var COP_SPC_RULES = { R1: 'Fuera de ±3σ', R2: 'Corrimiento (8 de un lado)', R3: 'Tendencia (6 en fila)' };

function _copSpcDate(v) {
    var gr = v && v.testData && v.testData.gasResults;
    if (!gr) return '';
    var rec = (gr.aprobador && gr.aprobador.values) ? gr.aprobador
            : (gr.liberador && gr.liberador.values) ? gr.liberador : null;
    return (rec && rec.capturedAt) || '';
}

function _copSpcFmt(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    if (dec !== undefined) return Number(v).toFixed(dec);
    var a = Math.abs(v);
    return Number(v).toFixed(a >= 100 ? 1 : a >= 1 ? 2 : 4);
}

// Familias con datos: agrupa db.vehicles con gases finales por copVehicleFamilyKey.
// Excluye familias con Modelo/Motor/Regulación vacíos (equivale a excluir OTHER/(sin dato)).
//
// v19.0 — `opts.allScopes`: el SPC es control de PROCESO, no juicio de conformidad, y
// sirve igual en familias fuera del alcance CoP (detecta deriva antes de rebasar un
// límite). Por eso `copSpcScanAlarms()` sigue barriendo TODO — quitarle al Panel las
// alarmas de las 31 configuraciones EURO-5 de MEXICO sería perder una red de seguridad
// sin que nadie lo pidiera. La UI del CoP sí filtra por alcance salvo que se destilde.
// Cada familia trae `inScope` para que la pantalla pueda etiquetarlas.
function copSpcFamilies(opts) {
    var allScopes = !!(opts && opts.allScopes);
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var fams = {};
    vehicles.forEach(function(v) {
        var values = _copFinalGasValues(v);
        if (!values) return;
        var cfg = v.config || {};
        var mod = cfg['Modelo'], eng = cfg['ENGINE CAPACITY'], reg = cfg['EMISSION REGULATION'];
        if (!mod || !eng || !reg) return;
        var scope = copInScope(v);
        if (!allScopes && !scope.ok) return;
        var key = copVehicleFamilyKey(v);
        if (!fams[key]) {
            var _ep = cfg['ENVIRONMENT PACKAGE'], _epk = cfg['ENGINE PACKAGE'], _bd = cfg['BODY TYPE'];
            fams[key] = {
                key: key,
                // v20.8: mismo formato de nombre que copFamilies — tren motriz y carrocería incluidos
                label: [mod, eng, cfg['TRANSMISSION'], cfg['MODEL YEAR (VIN)'], reg,
                        (_ep && _ep !== '0') ? _ep : '', (_epk && _epk !== '0') ? _epk : '',
                        (_bd && _bd !== '0') ? _bd : ''].filter(Boolean).join(' · '),
                regName: (typeof _libGetVehicleRegulation === 'function') ? _libGetVehicleRegulation(v) : reg,
                region: cfg['REGION'] || '',
                emissionReg: reg,
                inScope: scope.ok,
                scopeReason: scope.reason,
                tests: []
            };
        }
        fams[key].tests.push({ vin: v.vin || '(sin VIN)', date: _copSpcDate(v), values: values });
    });
    return Object.keys(fams).map(function(k) {
        var f = fams[k];
        f.tests.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
        f.n = f.tests.length;
        return f;
    }).sort(function(a, b) { return (b.n - a.n) || (a.label < b.label ? -1 : 1); });
}

// Gases de la familia según su perfil de regulación: [{field,label,unit,limit}]
function copSpcGases(fam) {
    if (!fam) return [];
    var prof = (typeof getRegulationProfile === 'function') ? getRegulationProfile(fam.regName) : null;
    if (prof && prof.gases && prof.gases.length) return prof.gases;
    // Fallback: campos presentes en los datos, sin límite conocido
    var fields = {};
    fam.tests.forEach(function(t) { Object.keys(t.values || {}).forEach(function(f) { fields[f] = true; }); });
    return Object.keys(fields).map(function(f) { return { field: f, label: f, unit: '', limit: null }; });
}

// Serie temporal de un gas en una familia: [{vin,date,v}]
function copSpcSeries(fam, gasField) {
    var pts = [];
    (fam ? fam.tests : []).forEach(function(t) {
        var v = _copNum(t.values[gasField]);
        if (v !== null) pts.push({ vin: t.vin, date: t.date, v: v });
    });
    return pts;
}

// Estadística I-MR: media, MR̄, σ=MR̄/1.128, UCL/LCL=media±3σ, MR-UCL=3.267·MR̄, Cpk.
function copSpcStats(vals, limit) {
    var n = vals.length;
    if (!n) return null;
    var mean = vals.reduce(function(a, b) { return a + b; }, 0) / n;
    var mrs = [];
    for (var i = 1; i < n; i++) mrs.push(Math.abs(vals[i] - vals[i - 1]));
    var mrbar = mrs.length ? mrs.reduce(function(a, b) { return a + b; }, 0) / mrs.length : 0;
    var sigma = mrbar / 1.128;
    var lim = (limit !== null && limit !== undefined) ? limit : null;
    var cpk = (sigma > 0 && lim !== null) ? (lim - mean) / (3 * sigma) : null;
    return {
        n: n, mean: mean, sigma: sigma, mrbar: mrbar,
        ucl: mean + 3 * sigma, lcl: Math.max(0, mean - 3 * sigma), lclRaw: mean - 3 * sigma,
        mrucl: 3.267 * mrbar, lim: lim, cpk: cpk, vals: vals, mrs: mrs
    };
}

// Reglas de Nelson: R1 punto fuera de ±3σ · R2 8 seguidos del mismo lado ·
// R3 6 en fila monótonos. Devuelve array de arrays de códigos por punto.
function copSpcFlags(st) {
    var v = st.vals;
    var fl = v.map(function() { return []; });
    if (st.sigma > 0 && st.n >= COP_SPC_MIN) {
        v.forEach(function(x, i) { if (x > st.ucl || x < st.lclRaw) fl[i].push('R1'); });
        var run = 0, side = 0, i, j, s;
        for (i = 0; i < v.length; i++) {
            s = v[i] > st.mean ? 1 : (v[i] < st.mean ? -1 : 0);
            if (s !== 0 && s === side) run++; else { run = s !== 0 ? 1 : 0; side = s; }
            if (run >= 8) for (j = i - 7; j <= i; j++) fl[j].push('R2');
        }
        var inc = 1, dec = 1;
        for (i = 1; i < v.length; i++) {
            inc = v[i] > v[i - 1] ? inc + 1 : 1;
            dec = v[i] < v[i - 1] ? dec + 1 : 1;
            if (inc >= 6) for (j = i - 5; j <= i; j++) fl[j].push('R3');
            if (dec >= 6) for (j = i - 5; j <= i; j++) fl[j].push('R3');
        }
    }
    return fl;
}

// Escaneo de alarmas en todas las familias con n≥4 (gases ≠ CO2). Lo consume
// también el Panel (alertas del laboratorio).
//
// v19.0 — barre TODAS las familias a propósito, también las de fuera del alcance CoP:
// el SPC vigila el proceso del laboratorio, no la conformidad, y acotarlo al alcance
// apagaría en silencio la detección de deriva de las familias que más se prueban.
// Cada alarma trae `inScope` para que la UI del CoP las separe. La firma no cambia:
// pnGetActiveAlerts la consume con guarda `typeof`.
function copSpcScanAlarms() {
    var out = [];
    copSpcFamilies({ allScopes: true }).filter(function(f) { return f.n >= COP_SPC_MIN; }).forEach(function(f) {
        copSpcGases(f).forEach(function(g) {
            if (g.field === 'CO2') return;
            var pts = copSpcSeries(f, g.field);
            var st = copSpcStats(pts.map(function(p) { return p.v; }), g.limit);
            if (!st || st.n < COP_SPC_MIN) return;
            var fl = copSpcFlags(st);
            var idx = [];
            fl.forEach(function(a, i) { if (a.length) idx.push(i); });
            if (idx.length) {
                var last = idx[idx.length - 1];
                out.push({
                    famKey: f.key, famLabel: f.label, gas: g.field, gasLabel: g.label,
                    rule: fl[last][0], val: pts[last].v, date: pts[last].date, unit: g.unit || '',
                    inScope: !!f.inScope
                });
            }
        });
    });
    return out;
}

// ─── SPC: manejadores ─────────────────────────────────────────────────────────
function copSpcSelectFamily(key) { copState.spc.familyKey = key; copPersist(); copRender(); }
function copSpcSelectGas(f) { copState.spc.gas = f; copPersist(); copRender(); }
function copSpcToggle(opt, el) { copState.spc[opt] = !!(el && el.checked); copPersist(); copRender(); }
function copSpcGotoAlarm(famKey, gas) {
    copState.spc.familyKey = famKey;
    copState.spc.gas = gas;
    copPersist();
    copRender();
    var chart = document.getElementById('cop-spc-ichart-wrapper');
    if (chart && chart.scrollIntoView) chart.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Resuelve familia y gas seleccionados (con defaults sensatos).
function _copSpcSelection() {
    var fams = copSpcFamilies();
    if (!fams.length) return { fams: fams, fam: null, gases: [], gas: null };
    var fam = fams.find(function(f) { return f.key === copState.spc.familyKey; }) || fams[0];
    var gases = copSpcGases(fam);
    var gas = gases.find(function(g) { return g.field === copState.spc.gas; }) || gases[0] || null;
    return { fams: fams, fam: fam, gases: gases, gas: gas };
}

// ─── SPC: HTML ────────────────────────────────────────────────────────────────
function copBuildSpcHTML() {
    var sel = _copSpcSelection();
    var html = '';

    // Panel de alarmas (retráctil)
    var alarms = copSpcScanAlarms();
    html += '<details class="card" style="margin-bottom:16px;" ' + (alarms.length ? 'open' : '') + '>';
    html += '<summary data-help="cop-spc-alarms-help" style="cursor:pointer;display:flex;align-items:center;gap:10px;font-weight:var(--weight-bold);color:var(--text);">' +
            '🚨 Alarmas de control de proceso ' +
            '<span class="badge ' + (alarms.length ? 'badge-danger' : 'badge-success') + '" style="padding:3px 10px;border-radius:var(--radius-sm);font-size: var(--fs-sm);">' +
            (alarms.length ? alarms.length + ' alarma(s)' : 'sin alarmas') + '</span></summary>';
    html += '<div style="margin-top:12px;">';
    if (!alarms.length) {
        html += '<p class="label-title" style="margin:0;">Las familias con datos suficientes (n≥' + COP_SPC_MIN + ') están bajo control estadístico.</p>';
    } else {
        alarms.forEach(function(a) {
            html += '<div onclick="copSpcGotoAlarm(\'' + _copEsc(a.famKey).replace(/'/g, '&#39;') + '\',\'' + _copEsc(a.gas) + '\')" ' +
                    'role="button" tabindex="0" aria-label="Ver carta de ' + _copEsc(a.gasLabel) + ' de ' + _copEsc(a.famLabel) + '" ' +
                    'style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 10px;margin-bottom:6px;cursor:pointer;' +
                    'border:1px solid rgba(239,68,68,0.35);border-radius:var(--radius-sm);background:rgba(239,68,68,0.05);">';
            html += '<span class="badge badge-danger" style="padding:2px 8px;border-radius:var(--radius-sm);font-size: var(--fs-xs);font-weight:800;">' + a.rule + '</span>';
            html += '<b style="font-size:12px;">' + _copEsc(a.gasLabel) + '</b>';
            html += '<span style="font-size:12px;color:var(--text);">' + _copEsc(a.famLabel) + '</span>';
            html += '<span style="margin-left:auto;font-size: var(--fs-sm);color:var(--muted);">' + COP_SPC_RULES[a.rule] +
                    ' · último ' + _copSpcFmt(a.val) + ' ' + _copEsc(a.unit) + (a.date ? ' · ' + a.date.slice(0, 10) : '') + '</span>';
            html += '</div>';
        });
    }
    html += '</div></details>';

    // Selección familia + gas + toggles
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" data-help="cop-spc-help" style="border-bottom-color:var(--accent-cop);">📈 Carta de control I-MR por familia × gas</div>';
    if (!sel.fams.length) {
        html += '<p class="label-title" style="margin:0;color:var(--warning);">Aún no hay vehículos liberados con gases capturados. ' +
                'Conforme se aprueben liberaciones con valores por gas, las familias aparecerán aquí. ' +
                '<button onclick="switchPlatform(\'cop15\');setTimeout(function(){var t=document.querySelector(\'.tab[data-tab=liberacion]\');if(t)t.click();},150);" class="btn btn-sm btn-ghost" style="font-size: var(--fs-xs);margin-left:6px;">🔬 Ir a Liberación →</button></p>';
        html += '</div>';
        return html;
    }
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">';
    html += '<div style="flex:1;min-width:260px;"><p class="label-title" style="margin-bottom:6px;">Familia (' + sel.fams.length + ')</p>';
    html += '<select aria-label="Familia para Control SPC" onchange="copSpcSelectFamily(this.value)" style="width:100%;padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);">';
    sel.fams.forEach(function(f) {
        html += '<option value="' + _copEsc(f.key) + '" ' + (sel.fam && f.key === sel.fam.key ? 'selected' : '') + '>' +
                _copEsc(f.label) + ' (' + f.n + ' ensayo' + (f.n === 1 ? '' : 's') + ')</option>';
    });
    html += '</select></div>';
    html += '<div><p class="label-title" style="margin-bottom:6px;">Gas</p><div style="display:flex;gap:6px;flex-wrap:wrap;">';
    sel.gases.forEach(function(g) {
        var active = sel.gas && g.field === sel.gas.field;
        html += '<button onclick="copSpcSelectGas(\'' + _copEsc(g.field) + '\')" class="btn btn-sm ' + (active ? '' : 'btn-ghost') + '" ' +
                (active ? 'style="background:var(--accent-cop);color:#fff;"' : '') + '>' + _copEsc(g.label) + '</button>';
    });
    html += '</div></div>';
    html += '</div>';

    var hasLimit = !!(sel.gas && sel.gas.limit !== null && sel.gas.limit !== undefined);
    html += '<div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:4px;">';
    [['showZones', 'Zonas σ', true], ['showLimit', 'Límite regulatorio', hasLimit], ['pctMode', '% del límite', hasLimit]].forEach(function(t) {
        html += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:' + (t[2] ? 'var(--text)' : 'var(--muted)') + ';cursor:pointer;">' +
                '<input type="checkbox" onchange="copSpcToggle(\'' + t[0] + '\', this)" ' +
                (copState.spc[t[0]] ? 'checked' : '') + (t[2] ? '' : ' disabled') + '> ' + t[1] + '</label>';
    });
    html += '</div>';

    // Serie + estadística
    var pts = copSpcSeries(sel.fam, sel.gas ? sel.gas.field : '');
    var st = pts.length ? copSpcStats(pts.map(function(p) { return p.v; }), sel.gas ? sel.gas.limit : null) : null;
    var unit = sel.gas ? (sel.gas.unit || '') : '';

    if (!st) {
        html += '<p class="label-title" style="margin-top:12px;">Sin datos para este gas en la familia seleccionada.</p>';
        html += '</div>';
        return html;
    }

    var noCtl = st.n < COP_SPC_MIN;
    var prelim = st.n < COP_SPC_RELIABLE;
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--text);">';
    html += '<span>n = <b>' + st.n + '</b></span>';
    html += '<span>media <b>' + _copSpcFmt(st.mean) + '</b> ' + _copEsc(unit) + '</span>';
    html += '<span>σ <b>' + _copSpcFmt(st.sigma) + '</b></span>';
    if (noCtl) {
        html += '<span style="color:var(--warning);">⚠ &lt;' + COP_SPC_MIN + ' ensayos: sin límites de control</span>';
    } else {
        html += '<span>UCL <b>' + _copSpcFmt(st.ucl) + '</b></span><span>LCL <b>' + _copSpcFmt(st.lcl) + '</b></span>';
        if (st.cpk !== null && st.n >= COP_SPC_RELIABLE) {
            var cpkColor = st.cpk >= 1.33 ? 'var(--success)' : st.cpk >= 1.0 ? 'var(--warning)' : 'var(--danger)';
            html += '<span>Cpk <b style="color:' + cpkColor + ';">' + _copSpcFmt(st.cpk, 2) + '</b></span>';
        }
        if (prelim) html += '<span style="color:var(--warning);">límites preliminares (&lt;' + COP_SPC_RELIABLE + ')</span>';
    }
    html += '</div>';

    html += '<div id="cop-spc-ichart-wrapper" style="margin-top:14px;height:300px;position:relative;"><canvas id="cop-spc-ichart"></canvas></div>';
    html += '</div>'; // card carta I

    // Carta MR
    html += '<div class="card" style="margin-bottom:16px;">';
    html += '<div class="card-title" style="border-bottom-color:var(--accent-cop);">📉 Carta de rangos móviles (MR)</div>';
    if (st.mrs.length < 1) {
        html += '<p class="label-title" style="margin:0;">Se necesitan ≥2 ensayos.</p>';
    } else {
        html += '<div id="cop-spc-mrchart-wrapper" style="height:200px;position:relative;"><canvas id="cop-spc-mrchart"></canvas></div>';
    }
    html += '</div>';

    // Ayuda
    html += '<details class="card" style="margin-bottom:16px;">';
    html += '<summary style="cursor:pointer;font-weight:var(--weight-bold);color:var(--text);">ℹ️ Cómo leer estas cartas</summary>';
    html += '<div style="font-size:12px;color:var(--muted);line-height:1.7;margin-top:10px;">';
    html += '<p><b>Carta de individuos (I-MR):</b> cada ensayo es una medición única por familia. La línea central es la media histórica de esa familia para el gas elegido; UCL/LCL son media ± 3σ, con σ estimada del rango móvil (MR̄/1.128). Son los <b>límites de control del proceso</b>, distintos del límite regulatorio (línea ámbar).</p>';
    html += '<p><b>Reglas de alarma (Nelson):</b> R1 = punto fuera de ±3σ (rojo); R2 = 8 puntos seguidos del mismo lado de la media (corrimiento); R3 = 6 puntos en fila subiendo o bajando (tendencia). Cualquiera dispara la alarma de la familia.</p>';
    html += '<p><b>Cpk:</b> capacidad del proceso frente al límite regulatorio = (Límite − media) / 3σ. Cpk ≥ 1.33 se considera capaz; &lt; 1.0 indica resultados demasiado cerca (o por encima) del límite. Se calcula con ≥ ' + COP_SPC_RELIABLE + ' ensayos.</p>';
    html += '<p><b>Umbrales:</b> n&lt;' + COP_SPC_MIN + ' → datos insuficientes; ' + COP_SPC_MIN + '–' + (COP_SPC_RELIABLE - 1) + ' → límites preliminares; ≥' + COP_SPC_RELIABLE + ' → confiables. CO2 se grafica para vigilancia pero no genera alarmas (no tiene límite).</p>';
    html += '</div></details>';

    return html;
}

// ─── SPC: charts (Chart.js, convención del proyecto) ─────────────────────────
function _copSpcDestroyCharts() {
    if (window._copSpcIChart) { try { window._copSpcIChart.destroy(); } catch (e) {} window._copSpcIChart = null; }
    if (window._copSpcMrChart) { try { window._copSpcMrChart.destroy(); } catch (e) {} window._copSpcMrChart = null; }
}

function copSpcRenderCharts() {
    _copSpcDestroyCharts();
    if (typeof Chart === 'undefined') return;
    var sel = _copSpcSelection();
    if (!sel.fam || !sel.gas) return;
    var pts = copSpcSeries(sel.fam, sel.gas.field);
    if (!pts.length) return;
    var st = copSpcStats(pts.map(function(p) { return p.v; }), sel.gas.limit);
    var flags = copSpcFlags(st);
    var unit = sel.gas.unit || '';
    var noCtl = st.n < COP_SPC_MIN;
    var hasLimit = st.lim !== null;
    var pct = !!(copState.spc.pctMode && hasLimit && st.lim > 0);
    var scale = pct ? (100 / st.lim) : 1;
    var dispUnit = pct ? '% del límite' : unit;

    var labels = pts.map(function(p) { return p.date ? p.date.slice(0, 10) : ''; });
    var pointColors = flags.map(function(f) {
        return f.indexOf('R1') !== -1 ? '#ef4444' : f.length ? '#f59e0b' : '#10b981';
    });
    var constLine = function(v, color, dashed, label, width) {
        return {
            label: label, data: pts.map(function() { return v * scale; }),
            borderColor: color, borderWidth: width || 1.4, borderDash: dashed ? [6, 4] : [],
            pointRadius: 0, pointHitRadius: 0, fill: false, tension: 0, order: 2
        };
    };
    var datasets = [{
        label: sel.gas.label, data: pts.map(function(p) { return p.v * scale; }),
        borderColor: 'rgba(8,145,178,0.55)', borderWidth: 1.6, tension: 0, fill: false,
        pointBackgroundColor: pointColors, pointBorderColor: pointColors,
        pointRadius: flags.map(function(f) { return f.length ? 5.5 : 4; }), order: 1
    }];
    datasets.push(constLine(st.mean, '#0891b2', false, 'media'));
    if (!noCtl) {
        datasets.push(constLine(st.ucl, '#ef4444', true, 'UCL'));
        if (st.lclRaw > 0) datasets.push(constLine(st.lcl, '#ef4444', true, 'LCL'));
        if (copState.spc.showZones && st.sigma > 0) {
            [1, 2, -1, -2].forEach(function(k) {
                var z = st.mean + k * st.sigma;
                if (z > 0) datasets.push(constLine(z, 'rgba(245,158,11,0.35)', true, (k > 0 ? '+' : '') + k + 'σ', 1));
            });
        }
    }
    if (copState.spc.showLimit && hasLimit) datasets.push(constLine(st.lim, '#f59e0b', true, 'Límite', 1.8));

    var iCanvas = document.getElementById('cop-spc-ichart');
    if (iCanvas) {
        window._copSpcIChart = new Chart(iCanvas, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { intersect: false, mode: 'nearest' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        filter: function(item) { return item.datasetIndex === 0; },
                        callbacks: {
                            title: function(items) {
                                var p = pts[items[0].dataIndex];
                                return (p.date ? p.date.slice(0, 10) + ' · ' : '') + p.vin;
                            },
                            label: function(item) {
                                return sel.gas.label + ' = ' + _copSpcFmt(item.parsed.y) + ' ' + dispUnit;
                            },
                            footer: function(items) {
                                var f = flags[items[0].dataIndex] || [];
                                return f.length ? '⚠ ' + f.map(function(x) { return COP_SPC_RULES[x]; }).join(', ') : 'en control';
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
                    y: { title: { display: !!dispUnit, text: dispUnit, font: { size: 10 } }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    // Carta MR
    var mrCanvas = document.getElementById('cop-spc-mrchart');
    if (mrCanvas && st.mrs.length) {
        var mrLabels = st.mrs.map(function(_, i) { return (i + 1) + '→' + (i + 2); });
        var mrColors = st.mrs.map(function(v) { return (!noCtl && v > st.mrucl) ? '#ef4444' : '#10b981'; });
        var mrDatasets = [{
            label: 'MR', data: st.mrs.map(function(v) { return v * scale; }),
            borderColor: 'rgba(8,145,178,0.55)', borderWidth: 1.6, tension: 0, fill: false,
            pointBackgroundColor: mrColors, pointBorderColor: mrColors, pointRadius: 4, order: 1
        }];
        if (!noCtl) {
            mrDatasets.push({ label: 'MR-UCL', data: st.mrs.map(function() { return st.mrucl * scale; }),
                borderColor: '#ef4444', borderWidth: 1.4, borderDash: [6, 4], pointRadius: 0, fill: false, tension: 0, order: 2 });
            mrDatasets.push({ label: 'MR̄', data: st.mrs.map(function() { return st.mrbar * scale; }),
                borderColor: '#0891b2', borderWidth: 1.2, pointRadius: 0, fill: false, tension: 0, order: 2 });
        }
        window._copSpcMrChart = new Chart(mrCanvas, {
            type: 'line',
            data: { labels: mrLabels, datasets: mrDatasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        filter: function(item) { return item.datasetIndex === 0; },
                        callbacks: {
                            label: function(item) {
                                var over = !noCtl && st.mrs[item.dataIndex] > st.mrucl;
                                return 'MR = ' + _copSpcFmt(item.parsed.y) + ' ' + dispUnit + (over ? ' · ⚠ salto anómalo' : '');
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { font: { size: 10 }, maxTicksLimit: 10 }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { font: { size: 10 } } }
                }
            }
        });
    }
}

// ══════════════════════════════════════════════════
// v16.0: Ayuda — banners de pestaña y tooltips de campo
// ══════════════════════════════════════════════════
if (typeof HELP_TABS !== 'undefined') Object.assign(HELP_TABS, {
    'cop-overview': { title: 'Panorama CoP', text: 'El estado de conformidad de TODAS las familias del alcance en una pantalla: veredicto, qué tan cerca del límite van, Cpk y desde cuándo no se ensayan. Pensado para proyectarse en una auditoría.', tips: [
        'El color del borde es el aviso interno de riesgo; el chip de adentro es el veredicto estadístico. Son dos cosas distintas a propósito.',
        'Gris nunca significa "bien": significa que con menos de 3 VINes el muestreo no puede decidir nada.',
        'La barra compara la media del peor gas contra su límite — es el número que se entiende sin ser del laboratorio.',
        'Toca una familia para abrirla en el Validador. 🖥️ Modo presentación agranda todo para la sala de juntas.',
        'El CoP solo cubre EURO-5 / EURO-6E / PRE-EURO 7 en EUROPE y MIDDLE EAST; lo que queda fuera se declara al final de la pantalla.'
    ]},
    'cop-dossier': { title: 'Expediente', text: 'La historia de una familia: los juicios emitidos, los ensayos liberados y las alarmas de control, en orden. De aquí sale el PDF que se entrega en auditoría.', tips: [
        'La franja de meses muestra qué veredicto estaba vigente en cada mes. Gris = ese mes no había juicio emitido.',
        'El PDF cita los límites CONGELADOS en el juicio, no los de hoy: por eso sigue siendo válido dentro de años.',
        'Si generas el PDF sin un juicio guardado, sale marcado PRELIMINAR — a propósito.'
    ]},
    'cop-validator': { title: 'Validador CoP', text: 'Valida la conformidad de producción de una familia: elige región y familia, la tabla se llena con los VINes ya probados, y el veredicto CONCORDANTE se calcula en vivo (muestreo secuencial, mínimo 3 VINes).', tips: [
        'Los VINes en azul se autollenaron desde vehículos ya probados; captura/edita los gases que falten.',
        'Necesitas al menos 3 VINes con valor por contaminante para obtener un veredicto.',
        'Guarda el juicio con 💾 para dejar constancia auditable de la evaluación.'
    ]},
    'cop-spc': { title: 'Control SPC', text: 'Carta de control I-MR por familia y gas: detecta corrimientos y tendencias (reglas de Nelson) ANTES de fallar un límite. Cpk = margen del proceso contra el límite.', tips: [
        'Las alarmas se disparan con datos de ≥4 ensayos por familia/gas.',
        'Un punto rojo = fuera de ±3σ (R1); ámbar = corrimiento o tendencia (R2/R3).',
        'Cpk ≥ 1.33 es un proceso capaz; < 1.0 significa que los resultados están muy cerca del límite.'
    ]}
});
if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'cop-validator-help': { title: 'Validador CoP Tipo 1', text: 'Evalúa si una familia de vehículos es CONCORDANTE con el límite regulatorio, usando muestreo secuencial (Appendix 2 / R83-R154). No requiere un número fijo de VINes: sigue agregando hasta que el estadístico U cruce A(n) o B(n).' },
    'cop-family-help': { title: 'Familia a evaluar', text: 'Elige primero la región (opcional, filtra la lista) y luego la familia de emisiones. Las familias vienen del plan de producción importado en Plan → Producción.' },
    'cop-verdict-help': { title: 'Concordancia de familia', text: 'PASS = la familia es CONCORDANTE con el límite (puedes dejar de ensayar); FAIL = NO CONCORDANTE (algún contaminante superó B(n)); CONTINUAR = aún faltan datos para decidir, agrega más VINes.' },
    'cop-spc-alarms-help': { title: 'Alarmas de control', text: 'Lista las combinaciones familia×gas que dispararon una regla de Nelson (R1/R2/R3) con los datos más recientes. Toca una alarma para ir directo a su carta.' },
    'cop-spc-help': { title: 'Selección de carta', text: 'Elige la familia y el gas para ver su carta de control I-MR. Los toggles cambian qué líneas de referencia se muestran (zonas σ, límite regulatorio, % del límite).' },
    'cop-kpis-help': { title: 'Resumen del alcance', text: 'Cuántas familias hay en el alcance CoP y cómo se reparten. "Sin datos" son familias con menos de 3 VINes con resultados: no se puede afirmar nada de ellas todavía, ni bueno ni malo. "Riesgo alto" es el aviso interno del laboratorio, no un veredicto regulatorio.' },
    'cop-gauge-help': { title: 'Qué tan cerca está de decidir', text: 'El muestreo secuencial no compara la media contra el límite: compara el estadístico U contra dos valores críticos, A(n) y B(n), que dependen de cuántos vehículos llevas. Si U cae a la izquierda de A(n) la familia ya es CONCORDANTE y puedes dejar de ensayar; si cae a la derecha de B(n) es NO CONCORDANTE; si queda en medio, hace falta otro vehículo. La marca negra es dónde está U ahora.' },
    'cop-present-help': { title: 'Modo presentación', text: 'Agranda letras, tarjetas y tablas solo dentro del CoP, para proyectar en una sala sin tocar el tamaño con el que los técnicos usan la app en el celular. Se apaga con el mismo botón.' },
    'cop-scope-help': { title: 'Alcance del CoP', text: 'El laboratorio hace Conformidad de Producción sobre EURO-5, EURO-6E y PRE-EURO 7 en las regiones EUROPE y MIDDLE EAST. El resto del catálogo se prueba, pero no entra al juicio de conformidad — aquí se listan esas configuraciones para que quede claro qué NO cubre esta pantalla.' },
    'cop-dossier-help': { title: 'Expediente de familia', text: 'La cronología completa de una familia: qué se ensayó, cuándo, qué juicios se emitieron y qué alarmas de control saltaron. Se deriva de los datos existentes — no es una bitácora que alguien tenga que llenar.' },
    'cop-gantt-help': { title: 'Progreso semanal', text: 'Cruza Plan → Mi semana con las familias que se están mostrando aquí (usa ➖ en una tarjeta para ocultarla de esta pantalla sin sacarla del seguimiento). Cada celda es una semana: verde = verificado, ámbar = declarado sin evidencia, gris = programado y aún sin correr. Sirve para ver de un vistazo cuándo se completan los vehículos que le faltan a cada familia — útil para mostrar avance a gerencia.' },
    'cop-strip-help': { title: 'Veredicto por mes', text: 'Qué veredicto estaba vigente al cierre de cada mes, según el último juicio emitido hasta esa fecha. Un mes en gris significa que ese mes no había juicio emitido: nunca se pinta verde por omisión.' }
});

// ═══════════════════════════════════════════════════════════════════════════════
// [v17.14] CO₂ vs TARGET DECLARADO
// El CO₂ no tiene un límite regulatorio fijo como los demás contaminantes: su
// referencia es el valor DECLARADO de cada vehículo (el "Combined" del ICMS,
// capturado en el Alta). Por eso no entra al muestreo secuencial de arriba, sino
// que se evalúa aparte: desviación % por vehículo contra SU propio target, y el
// promedio de la familia contra la tolerancia configurable
// (Datos → 🇪🇺 Homologación). La tabla deja constancia de con qué coeficientes
// de dinamómetro se corrió cada vehículo.
// La lógica vive en homolog.js — aquí solo se pinta.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * [v20.2] El gauge de CO₂ — mismo lenguaje visual que `_copGaugeRowHTML` (gases),
 * pero NO se reusa esa función tal cual: ahí "a"/"b" nombran los límites de la
 * banda U y aquí "A" ya es el nombre que la norma le da al centro (1,01) — mezclar
 * las dos notaciones en el mismo componente iba a confundir más que ayudar.
 */
function _copCo2GaugeHTML(stats) {
    var a = stats.passBound, b = stats.failBound, span = b - a;
    var PASS_W = 20, BAND_W = 60, FAIL_W = 20;
    var pos;
    if (span <= 0) {
        pos = stats.mean <= stats.A ? PASS_W * 0.5 : PASS_W + BAND_W + FAIL_W * 0.5;
    } else if (stats.mean <= a) {
        var over = Math.min(1, (a - stats.mean) / span);
        pos = PASS_W - over * PASS_W * 0.9;
    } else if (stats.mean >= b) {
        var over2 = Math.min(1, (stats.mean - b) / span);
        pos = PASS_W + BAND_W + over2 * FAIL_W * 0.9;
    } else {
        pos = PASS_W + ((stats.mean - a) / span) * BAND_W;
    }
    pos = Math.max(0.5, Math.min(99.5, pos));

    var vu = _copVerdictUI(stats.decision === 'PASS' ? 'PASS' : stats.decision === 'FAIL' ? 'FAIL' : 'CONTINUE');
    var html = '<div class="cop-gauge-row">';
    html += '<div class="cop-gauge-name">CO₂ normalizado (X̄)<small>A = ' + stats.A.toFixed(2) + ' · n=' + stats.n + '</small></div>';
    html += '<div class="cop-gauge" role="img" aria-label="CO₂: X̄ ' + stats.mean.toFixed(4) +
            ', banda ' + a.toFixed(4) + ' a ' + b.toFixed(4) + ', ' + _copEsc(vu.word) + '">';
    html += '<div class="cop-gauge-zone cop-gauge-zone--pass" style="width:' + PASS_W + '%;"><span>Concordante</span></div>';
    html += '<div class="cop-gauge-zone cop-gauge-zone--mid"  style="width:' + BAND_W + '%;"><span>' + a.toFixed(3) + ' — sin decidir — ' + b.toFixed(3) + '</span></div>';
    html += '<div class="cop-gauge-zone cop-gauge-zone--fail" style="width:' + FAIL_W + '%;"><span>No concord.</span></div>';
    html += '<div class="cop-gauge-marker" style="left:' + pos.toFixed(1) + '%;" title="X̄ = ' + stats.mean.toFixed(4) + '"></div>';
    html += '</div>';
    html += '<div class="cop-gauge-val"><span class="cop-chip ' + vu.chip + '">' + vu.short + '</span>' +
            '<small>X̄ = ' + stats.mean.toFixed(4) + '</small></div>';
    return html + '</div>';
}

/**
 * [v20.2] CO₂ — verificación estadística de familia, UN R154 §3.3.1 (Tabla A2/3).
 * Reemplaza al promedio-vs-tolerancia de v17.14 (`homoCo2Assess`) por el método
 * REAL de la norma — el mismo que ya se aplica a los gases, con su propia tabla.
 * Recalcula solo con leer `copState.vehicles` en cada render: agregar/quitar un
 * VIN (mismo flujo que gases) hace que esta tarjeta se rehaga sin cableado nuevo.
 */
function _copBuildCo2HTML() {
    if (typeof homoCo2RowsForVins !== 'function') return '';

    var vins = (copState.vehicles || []).map(function(v) { return v.vin; }).filter(function(v) { return v; });
    if (!vins.length) return '';

    var rows = homoCo2RowsForVins(vins);
    var conDatos = rows.filter(function(r) { return r.target != null || r.measured != null; });
    if (!conDatos.length) return '';

    var factors = copCo2Factors();
    var stats = copCo2CalcStats(rows, factors.fcf, factors.evc);
    var html = '<div class="card" style="margin-bottom:16px;">';
    html += '<p class="label-title" data-help="cop-co2-help" style="margin-bottom:8px;">🌱 CO₂ vs valor declarado (Reg. 2017/1151 Ap.I · confirmación R154 §3.3.1)</p>';

    // ── Ajustes de familia: FCF y Evolution Factor, "settings, ahí mismo" ──
    html += '<div class="cop-co2-settings" data-help="cop-co2-factors-help">';
    html += '<label>FCF (Family Correction Factor)<input type="number" id="cop-co2-fcf" step="0.0001" min="0.0001" value="' + factors.fcf + '"></label>';
    html += '<label>Evolution Factor<input type="number" id="cop-co2-evc" step="0.0001" min="0.0001" value="' + factors.evc + '"></label>';
    html += '<button class="tp-btn tp-btn-primary" onclick="copSetCo2Factors(document.getElementById(\'cop-co2-fcf\').value, document.getElementById(\'cop-co2-evc\').value)">Guardar</button>';
    if (!factors.set) html += '<span class="cop-co2-settings-hint">sin ajustar = 1 (sin corrección)</span>';
    html += '</div>';

    if (stats.decision === 'SIN DATOS') {
        html += '<p style="font-size: var(--fs-sm);color:var(--muted);margin:10px 0;">' +
            'Hacen falta al menos 3 vehículos con CO₂ medido y declarado a la vez (hay ' + stats.n + ').</p>';
    } else {
        html += _copCo2GaugeHTML(stats);
        html += copCo2ConclusionHTML(stats);
    }

    // Tabla por vehículo
    html += '<div style="overflow-x:auto;margin-top:10px;"><table style="width:100%;border-collapse:collapse;font-size: var(--fs-xs);">';
    html += '<thead><tr>' +
        ['VIN', 'MC code', 'CO₂ medido', 'CO₂ declarado', 'X normalizado', 'Desviación', 'f0', 'f1', 'f2', 'TM'].map(function(h) {
            return '<th style="' + _copTh() + 'text-align:left;">' + h + '</th>';
        }).join('') + '</tr></thead><tbody>';

    var xByVin = {};
    (stats.x || []).forEach(function(r) { xByVin[r.vin] = r.x; });

    rows.forEach(function(r) {
        var h = r.homolog || {};
        var dev = (typeof homoCo2Deviation === 'function') ? homoCo2Deviation(r.measured, r.target) : null;
        var devTxt = dev === null ? '—' : (dev >= 0 ? '+' : '') + dev.toFixed(2) + '%';
        var xVal = xByVin[r.vin];
        var xTxt = xVal === undefined ? '—' : xVal.toFixed(4);
        var xColor = xVal === undefined ? 'var(--muted)'
                   : xVal <= (stats.passBound != null ? stats.passBound : stats.A) ? 'var(--ok-text,#166534)'
                   : xVal > (stats.failBound != null ? stats.failBound : stats.A) ? 'var(--danger-text,#991b1b)' : 'var(--warn-text,#92400e)';
        var cell = function(v, extra) {
            return '<td style="padding:5px 8px;border-bottom:1px solid var(--border);' + (extra || '') + '">' +
                (v == null || v === '' ? '<span style="color:var(--muted);">—</span>' : _copEsc(String(v))) + '</td>';
        };
        html += '<tr>';
        html += cell(r.vin, 'font-weight:700;white-space:nowrap;');
        html += cell(h.mcCode);
        html += cell(r.measured == null ? null : Number(r.measured).toFixed(1));
        html += cell(r.target == null ? null : Number(r.target).toFixed(1));
        html += '<td style="padding:5px 8px;border-bottom:1px solid var(--border);font-weight:700;color:' + xColor + ';">' + xTxt + '</td>';
        html += '<td style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--muted);">' + devTxt + '</td>';
        html += cell(h.f0); html += cell(h.f1); html += cell(h.f2); html += cell(h.tm);
        html += '</tr>';
    });
    html += '</tbody></table></div>';

    var sinFicha = rows.filter(function(r) { return !r.homolog; }).length;
    if (sinFicha) {
        html += '<p style="font-size: var(--fs-xs);color:var(--warn-text,#92400e);margin-top:8px;">' +
            '⚠️ ' + sinFicha + ' vehículo(s) sin ficha de homologación: se capturan en el Alta ' +
            '(solo aparece para región EUROPE) o se completan importando el catálogo del ICMS en Datos → 🇪🇺 Homologación.</p>';
    }
    html += '<p style="font-size: var(--fs-xs);color:var(--muted);margin-top:6px;">' +
        '"X normalizado" = (CO₂ medido × Evolution Factor × FCF) / CO₂ declarado. A = 1,01 fijo por la norma. ' +
        'Verificar contra el texto oficial (Reg. (UE) 2017/1151 Anexo XXI Apéndice I §4 y UN R154 §3.3.1) antes de uso en homologación real.</p>';
    html += '</div>';
    return html;
}

if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'cop-co2-help': { title: 'CO₂ vs declarado', text: 'El CO₂ no tiene un límite fijo como CO/THC/NOₓ: cada vehículo se compara contra SU propio valor declarado de homologación (el "Combined" del ICMS, capturado en el Alta). El veredicto principal usa Reg. (UE) 2017/1151 Anexo XXI Apéndice I §4 ("A menos varianza") y se confirma con la tabla de UN R154 §3.3.1 — dos pruebas sobre el mismo dato, no el mismo test que gases.' },
    'cop-co2-factors-help': { title: 'FCF y Evolution Factor', text: 'Factores de la FAMILIA (no del vehículo), tal como los trae el reporte de interpolación WLTP. FCF (Family Correction Factor) y Evolution Factor multiplican el CO₂ medido antes de compararlo contra el declarado. Sin ajustar valen 1 (sin corrección). Se guardan por familia — cambiarlos recalcula el veredicto al instante.' }
});

// ═══════════════════════════════════════════════════════════════════════════════
// [v19.0] EXPORTACIONES — lo que se entrega en una auditoría
//
// Hasta v18.6 el módulo CoP no tenía NI UNA exportación, y el Centro de Reportes
// tenía 17 renglones y ninguno de CoP: el expediente había que armarlo a mano.
// ═══════════════════════════════════════════════════════════════════════════════

function _copCsvCell(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
}
function _copDownloadCsv(csv, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = filename;
    a.click();
    if (typeof showToast === 'function') showToast('Exportado: ' + filename, 'success');
}
function _copToday() { return (typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0, 10); }
function _copWho() {
    try {
        var u = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
        return u ? (u.name || '') : '';
    } catch (e) { return ''; }
}
function _copFileSafe(s) { return String(s || 'familia').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60); }

/** Un renglón por familia del alcance: el tablero de conformidad, en Excel. */
function copExportPortfolioCSV() {
    var rows = copPortfolioRows();
    if (!rows.length) { if (typeof showToast === 'function') showToast('No hay familias en el alcance CoP', 'warning'); return; }
    var csv = 'Familia,Región,Norma,VINes con resultado,Veredicto,Gas crítico,% del límite,U,A(n),B(n),Cpk mín,Alarmas SPC,Último ensayo,Días sin ensayar,Requeridas (plan),Probadas (plan),Déficit,Riesgo,Confianza,Motivo,Último juicio,Decisión del juicio\n';
    rows.forEach(function(r) {
        csv += [
            r.label, (r.regionsArr || []).join(' / '), r.emissionReg, r.n,
            _copDecisionWord(r.verdict), r.worstPoll,
            r.marginPct === null || r.marginPct === undefined ? '' : Math.round(r.marginPct),
            r.worstU === null || r.worstU === undefined ? '' : r.worstU.toFixed(3),
            r.band ? r.band.a.toFixed(3) : '', r.band ? r.band.b.toFixed(3) : '',
            r.cpkMin === null || r.cpkMin === undefined ? '' : r.cpkMin.toFixed(2),
            (r.spcAlarms || []).length,
            (r.lastTestDate || '').slice(0, 10),
            r.daysSinceTest === null || r.daysSinceTest === undefined ? '' : r.daysSinceTest,
            r.planRequired, r.planTested, r.planDeficit,
            _copRiskUI(r.risk.level).label, r.risk.confidence,
            r.risk.reasons.map(function(x) { return x.text; }).join(' | '),
            (r.judgedAt || '').slice(0, 10), _copDecisionWord(r.judgedDecision)
        ].map(_copCsvCell).join(',') + '\n';
    });
    _copDownloadCsv(csv, 'CoP_Panorama_' + _copToday() + '.csv');
}

/** Los datos crudos VIN × gas de una familia. */
function copExportFamilyCSV(familyKey) {
    var key = familyKey || copState.familyKey;
    var row = copPortfolioRows().find(function(r) { return r.key === key; });
    if (!row) { if (typeof showToast === 'function') showToast('Abre primero una familia en CoP', 'warning'); return; }

    var gases = row.polls || [];
    var csv = 'Familia,' + _copCsvCell(row.label) + '\n';
    csv += 'Región,' + _copCsvCell((row.regionsArr || []).join(' / ')) + '\n';
    csv += 'Norma,' + _copCsvCell(row.emissionReg) + '\n';
    csv += 'Generado,' + _copToday() + ',' + _copCsvCell(_copWho()) + '\n\n';
    csv += 'VIN,Fecha de ensayo,' + gases.map(function(g) { return _copCsvCell(g.label + ' (' + g.unit + ')'); }).join(',') + '\n';
    (row.tests || []).forEach(function(t) {
        csv += [t.vin, (t.date || '').slice(0, 10)].concat(gases.map(function(g) {
            var v = _copNum(t.values[g.field]);
            return v === null ? '' : v;
        })).map(_copCsvCell).join(',') + '\n';
    });
    csv += '\nLímite aplicado,,' + gases.map(function(g) { return g.limit; }).map(_copCsvCell).join(',') + '\n';
    csv += 'Media,,' + gases.map(function(g) { return g.stats ? g.stats.mean.toFixed(5) : ''; }).map(_copCsvCell).join(',') + '\n';
    csv += 'U,,' + gases.map(function(g) { return (g.stats && g.stats.U !== null) ? g.stats.U.toFixed(3) : ''; }).map(_copCsvCell).join(',') + '\n';
    csv += 'Decisión,,' + gases.map(function(g) { return g.stats ? g.stats.decision : ''; }).map(_copCsvCell).join(',') + '\n';
    _copDownloadCsv(csv, 'CoP_' + _copFileSafe(row.label) + '_' + _copToday() + '.csv');
}

/** Historial de juicios emitidos — la traza de quién dictaminó qué y cuándo. */
function copExportJudgmentsCSV() {
    var saved = copState.saved || [];
    if (!saved.length) { if (typeof showToast === 'function') showToast('Aún no hay juicios guardados', 'warning'); return; }
    var csv = 'Fecha,Familia,Región,Norma CoP,Combustible,VINes,Decisión,Emitido por,Límites congelados\n';
    saved.forEach(function(j) {
        csv += [
            (j.date || '').slice(0, 10), j.familyLabel || '(sin familia)', j.region || '',
            j.regulation || '', j.fuelType || '',
            (j.vehicles || []).filter(function(v) { return v.vin; }).length,
            _copDecisionWord(j.decision), j.by || '',
            (j.limitsUsed || []).map(function(l) { return l.label + '=' + l.limit + l.unit; }).join(' ') || '(no registrados)'
        ].map(_copCsvCell).join(',') + '\n';
    });
    _copDownloadCsv(csv, 'CoP_Juicios_' + _copToday() + '.csv');
}

/**
 * [v19.0] Expediente PDF de una familia — el documento que se entrega en auditoría.
 * Esqueleto tomado de pnProjectPDF (projects.js): cursor y/ML/CW, doc.rect para las
 * cajas, splitTextToSize y corte de página.
 *
 * Principio: el documento no puede sonar más seguro que la pantalla. Cita los
 * límites con los que se decidió, dice si el veredicto viene de un juicio guardado
 * o del estado en vivo (y en ese caso lo marca PRELIMINAR), y reproduce la
 * advertencia regulatoria tal cual.
 */
function copFamilyPDF(familyKey) {
    if (typeof window.jspdf === 'undefined') {
        if (typeof showToast === 'function') showToast('jsPDF no está disponible.', 'error');
        return;
    }
    var key = familyKey || copState.familyKey;
    var row = copPortfolioRows().find(function(r) { return r.key === key; });
    if (!row) {
        if (typeof showToast === 'function') showToast('Abre primero una familia en CoP → Panorama', 'warning');
        return;
    }

    var saved = (copState.saved || []).filter(function(j) { return j.familyKey === key; })
                    .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var judgment = saved[0] || null;
    var preliminar = !judgment;

    var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var ML = 14, CW = W - ML * 2, y = 16;
    var brk = function(need) { if (y > H - (need || 18)) { doc.addPage(); y = 18; } };
    var h2 = function(t) { brk(24); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0); doc.text(t, ML, y); y += 5; };

    // ── 1. Identificación ─────────────────────────────────────────────────────
    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text('Expediente de Conformidad de Producción', ML, y); y += 6;
    doc.setFontSize(11); doc.text(row.label, ML, y); y += 6;

    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
    var head = [];
    head.push('Región: ' + ((row.regionsArr || []).join(' / ') || '—'));
    // Procedimiento CoP (R154/R83) y norma de emisiones son DOS cosas distintas:
    // el auditor pregunta por ambas y la pantalla las confundía.
    head.push('Procedimiento: ' + (copState.regulation || 'R154') + (copState.regulation === 'R83' ? ' (NEDC)' : ' (WLTP)'));
    head.push('Norma de emisiones: ' + (row.emissionReg || '—'));
    doc.text(head.join('   ·   '), ML, y); y += 4;
    // [v19.1] Familia de interpolación + certificado WVTA (solo Europa). Es lo
    // primero que un auditor europeo busca para saber contra qué está juzgando.
    if (r.ipFamilies && r.ipFamilies.length) {
        var ipInfo = [];
        r.ipFamilies.forEach(function(code) {
            var f = (typeof homoIpFamilyByCode === 'function') ? homoIpFamilyByCode(code) : null;
            ipInfo.push(code + (f && f.tml ? ' (TML ' + f.tml + ' / TMH ' + f.tmh + ' kg)' : ''));
        });
        doc.text('Familia(s) de interpolacion: ' + ipInfo.join('   ·   '), ML, y); y += 4;
        var prim = (typeof homoIpFamilyByCode === 'function') ? homoIpFamilyByCode(r.ipFamilies[0]) : null;
        if (prim && prim.wvta) {
            doc.text('WVTA: ' + prim.wvta + (prim.wvtaDate ? '   ·   ' + prim.wvtaDate : '') +
                     (prim.type ? '   ·   tipo ' + prim.type : ''), ML, y); y += 4;
        }
    }
    var head2 = ['Generado: ' + _copToday()];
    if (_copWho()) head2.push('por ' + _copWho());
    if (typeof APP_VERSION !== 'undefined') head2.push('KIA EmLab v' + APP_VERSION);
    doc.text(head2.join('   ·   '), ML, y); y += 7;
    doc.setTextColor(0);

    // ── 2. Veredicto ──────────────────────────────────────────────────────────
    var decision = judgment ? judgment.decision : row.verdict;
    doc.setDrawColor(150); doc.setLineWidth(0.4);
    doc.rect(ML, y, CW, 18);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    if (decision === 'PASS') doc.setTextColor(19, 108, 58);
    else if (decision === 'FAIL') doc.setTextColor(179, 38, 30);
    else doc.setTextColor(138, 83, 0);
    doc.text(_copDecisionWord(decision), ML + 4, y + 8);
    doc.setTextColor(80); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    var basis = 'Basado en n = ' + row.n + ' ensayo(s)';
    if (row.tests && row.tests.length) {
        basis += ' entre ' + (row.tests[0].date || '').slice(0, 10) + ' y ' + (row.tests[row.tests.length - 1].date || '').slice(0, 10);
    }
    doc.text(basis, ML + 4, y + 14);
    doc.setTextColor(0);
    y += 22;

    if (preliminar) {
        doc.setFillColor(253, 236, 234); doc.setDrawColor(179, 38, 30);
        doc.rect(ML, y, CW, 11, 'FD');
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(179, 38, 30);
        doc.text('PRELIMINAR — no corresponde a un juicio guardado', ML + 4, y + 5);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text('Refleja el estado en vivo al momento de generarlo. Para un expediente firmable, guarda el juicio en CoP → Validador.', ML + 4, y + 9);
        doc.setTextColor(0); y += 15;
    } else {
        doc.setFontSize(8); doc.setTextColor(100);
        doc.text('Juicio emitido el ' + (judgment.date || '').slice(0, 10) + (judgment.by ? ' por ' + judgment.by : ''), ML, y);
        doc.setTextColor(0); y += 6;
    }

    // ── 3. Aviso de riesgo (con su etiqueta honesta) ──────────────────────────
    h2('Vigilancia interna');
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Nivel: ' + _copRiskUI(row.risk.level).label + '  ·  confianza ' + row.risk.confidence, ML + 2, y); y += 4;
    row.risk.reasons.forEach(function(rn) {
        brk(); doc.setTextColor(90);
        doc.splitTextToSize('- ' + rn.text, CW - 4).forEach(function(ln) { brk(); doc.text(ln, ML + 2, y); y += 3.6; });
        doc.setTextColor(0);
    });
    doc.setFontSize(7); doc.setTextColor(120);
    y += 1;
    doc.splitTextToSize('Aviso interno anticipado del laboratorio. No sustituye el veredicto estadistico ni constituye juicio regulatorio.', CW - 4)
       .forEach(function(ln) { brk(); doc.text(ln, ML + 2, y); y += 3.4; });
    doc.setTextColor(0); y += 4;

    // ── 4. Bases del juicio: límites CONGELADOS ───────────────────────────────
    h2('Bases del juicio — límites aplicados');
    var limitsUsed = (judgment && judgment.limitsUsed && judgment.limitsUsed.length)
        ? judgment.limitsUsed
        : (row.polls || []).map(function(p) { return { label: p.label, limit: p.limit, unit: p.unit }; });
    doc.setFontSize(7); doc.setFillColor(240); doc.rect(ML, y - 3.5, CW, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Contaminante', ML + 2, y); doc.text('Límite', ML + 50, y); doc.text('Unidad', ML + 78, y); doc.text('Fuente', ML + 104, y);
    y += 4; doc.setFont('helvetica', 'normal');
    limitsUsed.forEach(function(l) {
        brk();
        doc.text(String(l.label), ML + 2, y);
        doc.text(String(l.limit), ML + 50, y);
        doc.text(String(l.unit || ''), ML + 78, y);
        doc.text(judgment ? 'congelado en el juicio' : 'perfil vigente', ML + 104, y);
        y += 4;
    });
    y += 2;
    if (row.limitsCheck && row.limitsCheck.mismatches && row.limitsCheck.mismatches.length) {
        doc.setTextColor(179, 38, 30); doc.setFontSize(7);
        doc.splitTextToSize('ATENCION: el limite aplicado no coincide con el perfil de la norma ' + (row.emissionReg || '') +
            '. El veredicto de esta familia no es valido hasta corregirlo.', CW - 4)
            .forEach(function(ln) { brk(); doc.text(ln, ML + 2, y); y += 3.4; });
        doc.setTextColor(0); y += 2;
    }

    // ── 5. Estadística por contaminante ───────────────────────────────────────
    h2('Estadística por contaminante (muestreo secuencial)');
    var statCols = [[ML + 2, 'Gas'], [ML + 32, 'n'], [ML + 42, 'media'], [ML + 68, 's'], [ML + 92, 'U'], [ML + 112, 'A(n)'], [ML + 132, 'B(n)'], [ML + 152, 'Decisión']];
    doc.setFontSize(7); doc.setFillColor(240); doc.rect(ML, y - 3.5, CW, 5, 'F');
    doc.setFont('helvetica', 'bold');
    statCols.forEach(function(c) { doc.text(c[1], c[0], y); });
    y += 4; doc.setFont('helvetica', 'normal');
    var statRows = (judgment && judgment.stats && judgment.stats.length)
        ? judgment.stats
        : (row.polls || []).filter(function(p) { return p.stats; }).map(function(p) {
              return { poll: p.label, n: p.stats.n, mean: p.stats.mean, s: p.stats.s, U: p.stats.U,
                       a: p.stats.cv ? p.stats.cv.a : null, b: p.stats.cv ? p.stats.cv.b : null, decision: p.stats.decision };
          });
    statRows.forEach(function(s) {
        brk();
        if (s.decision === 'FAIL') doc.setTextColor(179, 38, 30);
        doc.text(String(s.poll), statCols[0][0], y);
        doc.text(String(s.n), statCols[1][0], y);
        doc.text(s.mean === null || s.mean === undefined ? '—' : Number(s.mean).toFixed(5), statCols[2][0], y);
        doc.text(s.s === null || s.s === undefined ? '—' : Number(s.s).toFixed(5), statCols[3][0], y);
        doc.text(s.U === null || s.U === undefined ? '—' : Number(s.U).toFixed(3), statCols[4][0], y);
        doc.text(s.a === null || s.a === undefined ? '—' : Number(s.a).toFixed(3), statCols[5][0], y);
        doc.text(s.b === null || s.b === undefined ? '—' : Number(s.b).toFixed(3), statCols[6][0], y);
        doc.text(_copDecisionWord(s.decision), statCols[7][0], y);
        doc.setTextColor(0);
        y += 4;
    });
    y += 2;
    doc.setFontSize(7); doc.setTextColor(110);
    doc.text('U = (media - L) * raiz(n) / s   ·   U <= A(n): concordante   ·   U >= B(n): no concordante   ·   entre A y B: ensayar otro vehiculo', ML + 2, y);
    doc.setTextColor(0); y += 6;

    // ── 6. Evidencia: VINes ───────────────────────────────────────────────────
    h2('Evidencia — vehículos ensayados');
    var gases = (row.polls || []).slice(0, 5);
    doc.setFontSize(7); doc.setFillColor(240); doc.rect(ML, y - 3.5, CW, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('VIN', ML + 2, y); doc.text('Fecha', ML + 42, y);
    gases.forEach(function(g, i) { doc.text(String(g.label).slice(0, 6), ML + 66 + i * 23, y); });
    y += 4; doc.setFont('helvetica', 'normal');
    (row.tests || []).forEach(function(t) {
        brk();
        doc.text(String(t.vin || '—').slice(0, 20), ML + 2, y);
        doc.text((t.date || '').slice(0, 10) || '—', ML + 42, y);
        gases.forEach(function(g, i) {
            var v = _copNum(t.values[g.field]);
            doc.text(v === null ? '—' : String(v), ML + 66 + i * 23, y);
        });
        y += 4;
    });
    if (!(row.tests || []).length) { doc.setTextColor(120); doc.text('Sin ensayos liberados con resultados finales.', ML + 2, y); doc.setTextColor(0); y += 4; }
    y += 4;

    // ── 7. CO2 vs declarado (solo Europa) — UN R154 §3.3.1 ────────────────────
    try {
        if (typeof homoCo2RowsForVins === 'function' && typeof copCo2CalcStats === 'function' &&
            (row.regionsArr || []).some(function(r) { return typeof homoIsEurope === 'function' && homoIsEurope(r); })) {
            var vins = (row.tests || []).map(function(t) { return t.vin; }).filter(Boolean);
            var co2rows = homoCo2RowsForVins(vins);
            if (co2rows.some(function(c) { return c.target != null || c.measured != null; })) {
                // Congelado si hay juicio guardado (reproducible), en vivo si no (PRELIMINAR,
                // igual que el resto del documento en ese caso).
                var co2Stats = (judgment && judgment.co2)
                    ? Object.assign({ x: [] }, judgment.co2)
                    : copCo2CalcStats(co2rows, copCo2Factors(key).fcf, copCo2Factors(key).evc);
                var xByVin = {};
                if (!judgment || !judgment.co2) (co2Stats.x || []).forEach(function(r) { xByVin[r.vin] = r.x; });

                h2('CO₂ vs valor declarado (' + (judgment && judgment.co2Source ? judgment.co2Source : 'UN R154 §3.3.1') + ')');
                doc.setFontSize(7); doc.setFont('helvetica', 'normal');
                if (co2Stats.decision && co2Stats.decision !== 'SIN DATOS') {
                    doc.text('Veredicto: ' + _copDecisionWord(co2Stats.decision) +
                        '   ·   X̄ = ' + co2Stats.mean.toFixed(4) +
                        '   ·   FCF = ' + co2Stats.fcf + '   ·   Evolution Factor = ' + co2Stats.evc +
                        '   ·   n=' + co2Stats.n, ML + 2, y);
                    y += 4;
                    var concl = (typeof copCo2ConclusionHTML === 'function') ? copCo2ConclusionHTML(co2Stats).replace(/<[^>]+>/g, '') : '';
                    if (concl) { doc.text(doc.splitTextToSize(concl, CW - 4), ML + 2, y); y += 8; }
                } else {
                    doc.text('Sin suficientes vehículos con CO2 medido y declarado a la vez para decidir (n<3).', ML + 2, y);
                    y += 5;
                }
                doc.setFillColor(240); doc.rect(ML, y - 3.5, CW, 5, 'F'); doc.setFont('helvetica', 'bold');
                ['VIN', 'MC code', 'medido', 'declarado', 'X norm.', 'desv.', 'f0', 'f1', 'f2', 'TM'].forEach(function(hh, i) {
                    doc.text(hh, ML + 2 + i * 18, y);
                });
                y += 4; doc.setFont('helvetica', 'normal');
                co2rows.forEach(function(c) {
                    brk();
                    var hg = c.homolog || {};
                    var dev = (typeof homoCo2Deviation === 'function') ? homoCo2Deviation(c.measured, c.target) : null;
                    var xVal = xByVin[c.vin];
                    [String(c.vin || '').slice(0, 11), hg.mcCode || '—',
                     c.measured == null ? '—' : Number(c.measured).toFixed(1),
                     c.target == null ? '—' : Number(c.target).toFixed(1),
                     xVal === undefined ? '—' : xVal.toFixed(4),
                     dev === null ? '—' : (dev >= 0 ? '+' : '') + dev.toFixed(1) + '%',
                     hg.f0 == null ? '—' : hg.f0, hg.f1 == null ? '—' : hg.f1,
                     hg.f2 == null ? '—' : hg.f2, hg.tm == null ? '—' : hg.tm
                    ].forEach(function(cell, i) { doc.text(String(cell), ML + 2 + i * 18, y); });
                    y += 4;
                });
                y += 2;
                doc.setFontSize(6.5); doc.setTextColor(110);
                doc.text('X normalizado = (CO2 medido x Evolution Factor x FCF) / CO2 declarado. Los f0/f1/f2 y el CO2 declarado', ML + 2, y); y += 3.2;
                doc.text('provienen del catalogo ICMS, no del certificado WVTA. Verificar contra el texto oficial (Reg. 2017/1151 Ap.I / R154).', ML + 2, y);
                doc.setTextColor(0); y += 6;
            }
        }
    } catch (e) { }

    // ── 8. Histórico de juicios ───────────────────────────────────────────────
    if (saved.length) {
        h2('Histórico de juicios de esta familia');
        doc.setFontSize(7); doc.setFillColor(240); doc.rect(ML, y - 3.5, CW, 5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.text('Fecha', ML + 2, y); doc.text('n', ML + 32, y); doc.text('Decisión', ML + 44, y); doc.text('Emitido por', ML + 96, y);
        y += 4; doc.setFont('helvetica', 'normal');
        saved.forEach(function(j) {
            brk();
            doc.text((j.date || '').slice(0, 10), ML + 2, y);
            doc.text(String((j.vehicles || []).filter(function(v) { return v.vin; }).length), ML + 32, y);
            doc.text(_copDecisionWord(j.decision), ML + 44, y);
            doc.text(String(j.by || '—'), ML + 96, y);
            y += 4;
        });
        y += 4;
    }

    // ── 9. Advertencia regulatoria — textual, la misma de la pantalla ─────────
    brk(30);
    h2('Advertencia regulatoria');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(90);
    doc.splitTextToSize(
        'Los valores A(n)/B(n) son de referencia, basados en R83 Rev.5 / R154 Apendice 2. Verificar contra el texto oficial ' +
        'del reglamento antes de su uso en homologacion real. La decision es independiente por contaminante: la familia se ' +
        'declara NO CONCORDANTE si cualquier contaminante lo es.', CW - 4)
        .forEach(function(ln) { brk(); doc.text(ln, ML + 2, y); y += 3.5; });
    doc.setTextColor(0); y += 6;

    // ── 10. Firmas ────────────────────────────────────────────────────────────
    brk(34);
    h2('Firmas');
    var bw = (CW - 8) / 3;
    ['Elaboró', 'Revisó', 'Aprobó'].forEach(function(rol, i) {
        var x = ML + i * (bw + 4);
        doc.setDrawColor(150); doc.rect(x, y, bw, 24);
        doc.setFontSize(7); doc.setTextColor(110);
        doc.text(rol, x + 2, y + 4);
        doc.setDrawColor(190);
        doc.line(x + 3, y + 15, x + bw - 3, y + 15);
        doc.text('Nombre y firma', x + 3, y + 18);
        doc.line(x + 3, y + 21.5, x + bw - 3, y + 21.5);
        doc.setTextColor(0);
    });
    y += 28;

    // Pie por página (segunda pasada: jsPDF necesita saber el total).
    var total = doc.getNumberOfPages();
    for (var pg = 1; pg <= total; pg++) {
        doc.setPage(pg);
        doc.setFontSize(6.5); doc.setTextColor(130);
        doc.text('Pagina ' + pg + ' de ' + total + '  ·  CoP ' + row.label + '  ·  ' + _copToday() +
                 (preliminar ? '  ·  PRELIMINAR' : ''), ML, H - 8);
        doc.setTextColor(0);
    }

    doc.save('CoP_Expediente_' + _copFileSafe(row.label) + '_' + _copToday() + '.pdf');
    if (typeof showToast === 'function') showToast('Expediente generado', 'success');
    if (typeof auditLog === 'function') {
        auditLog('cop', 'dossier_exported', { type: 'cop', label: row.label },
                 'Expediente PDF' + (preliminar ? ' (preliminar)' : ' del juicio del ' + (judgment.date || '').slice(0, 10)));
    }
}
