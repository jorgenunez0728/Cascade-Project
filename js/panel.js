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

// ══════════════════════════════════════════════════════════════════════
// [Fase 3] PERFILES DE OPERADOR — nivel y matriz de habilidades
// ══════════════════════════════════════════════════════════════════════

// Nivel de seniority. Es una etiqueta humana para turnos y reportes: NO otorga
// permisos (eso lo hacen el rol y las habilidades certificadas). Dos sistemas de
// autoridad solapados es justo como esto se pudre.
var PN_LEVELS = [
    { id: 'L1', name: 'Aprendiz',        desc: 'Trabaja siempre bajo supervisión' },
    { id: 'L2', name: 'Operador',        desc: 'Autónomo en lo que tiene certificado' },
    { id: 'L3', name: 'Especialista',    desc: 'Autónomo, diagnostica y revisa datos de otros' },
    { id: 'L4', name: 'Líder técnico',   desc: 'Puede certificar a otros' }
];

// Niveles de dominio por habilidad. 0 no se almacena (ausencia = sin capacitación),
// para que el documento de Firestore no crezca con ceros.
var PN_SKILL_LEVELS = [
    { lvl: 0, name: 'Sin capacitación', color: '#e2e8f0', text: '#94a3b8' },
    { lvl: 1, name: 'En entrenamiento', color: '#fef3c7', text: '#b45309' },
    { lvl: 2, name: 'Autónomo',         color: '#d1fae5', text: '#047857' },
    { lvl: 3, name: 'Puede certificar', color: '#dbeafe', text: '#1d4ed8' }
];

// Catálogo estático: vive en el código, no en los datos. Así se versiona con el
// build, no puede divergir entre dispositivos y no infla el documento sincronizado.
// Sólo las evaluaciones por operador son datos.
//   critical      → se vigila la cobertura del laboratorio
//   recertMonths  → vence y hay que recertificar (hallazgo típico de ISO 17025)
//   grants/minLvl → certificar esta habilidad otorga ese permiso (ver _authSkillGrants)
//
// [Fase 3.5] Esto es ahora sólo la SEMILLA. El catálogo vivo es editable por el
// laboratorio y se sincroniza: pnState.skillCatalog (plano) + pnState.skillGroups.
// Se siembra desde aquí una única vez en pnMigrateOperators (opsSchema 3).
var PN_SKILL_CATALOG_SEED = [
    { group: 'Ciclos de prueba', items: [
        { id: 'ftp75', name: 'FTP-75', critical: true },
        { id: 'hwfet', name: 'HWFET' },
        { id: 'us06',  name: 'US06' },
        { id: 'sc03',  name: 'SC03' },
        { id: 'wltp',  name: 'WLTP', critical: true },
        { id: 'nedc',  name: 'NEDC' }
    ]},
    { group: 'Equipo', items: [
        { id: 'dyno',      name: 'Dinamómetro de chasis', critical: true, recertMonths: 12 },
        { id: 'cvs',       name: 'CVS / bolsas' },
        { id: 'soak',      name: 'Cámara de soak' },
        { id: 'shed',      name: 'SHED / evaporativas' },
        { id: 'ev_charge', name: 'Carga EV 120/220V' }
    ]},
    { group: 'Analítica', items: [
        { id: 'gas_cal',  name: 'Calibración de analizadores', critical: true, recertMonths: 12 },
        { id: 'gas_read', name: 'Lectura e interpretación de gases' },
        { id: 'pm_weigh', name: 'Pesaje de filtros / PM' }
    ]},
    { group: 'Calidad y regulación', items: [
        { id: 'release',  name: 'Liberador de prueba', grants: 'test.release', minLvl: 2 },
        { id: 'cop_appr', name: 'Aprobador CoP', critical: true, recertMonths: 24, grants: 'test.approve', minLvl: 3 },
        { id: 'nom044',   name: 'NOM-044 / EPA Tier 3' },
        { id: 'iso17025', name: 'Documentación ISO 17025' }
    ]}
];

// ── [Fase 3.5] Catálogo editable: capa de datos ──
// pnState.skillCatalog: lista PLANA de {id, name, group, critical, recertMonths,
//   grants, minLvl, order, archived, archivedAt, updatedAt}
// pnState.skillGroups: orden de los grupos (array de strings)
// pnState.matrixCols:  {hidden:[opIds], order:[opIds]} — disposición de columnas

/** Catálogo vivo (plano). Cae a la semilla si aún no se ha migrado. */
function pnCatalog() {
    if (pnState.skillCatalog && pnState.skillCatalog.length) return pnState.skillCatalog;
    return _pnSeedCatalogFlat();
}

function _pnSeedCatalogFlat() {
    var out = [], i = 0;
    PN_SKILL_CATALOG_SEED.forEach(function(g) {
        g.items.forEach(function(s) {
            out.push(Object.assign({ group: g.group, order: i++, archived: false }, s));
        });
    });
    return out;
}

/** Orden de grupos: el guardado, o el de la semilla. */
function pnGroupOrder() {
    if (pnState.skillGroups && pnState.skillGroups.length) return pnState.skillGroups.slice();
    return PN_SKILL_CATALOG_SEED.map(function(g) { return g.group; });
}

/** Habilidades activas (no archivadas), ordenadas por grupo y `order`. */
function pnSkillsFlat() {
    return pnCatalog().filter(function(s) { return !s.archived; }).sort(_pnSkillSort);
}

/** Habilidades archivadas — se muestran en la sección "Anteriores". */
function pnSkillsArchived() {
    return pnCatalog().filter(function(s) { return !!s.archived; }).sort(_pnSkillSort);
}

function _pnSkillSort(a, b) {
    var go = pnGroupOrder();
    var ga = go.indexOf(a.group), gb = go.indexOf(b.group);
    if (ga === -1) ga = 999;
    if (gb === -1) gb = 999;
    if (ga !== gb) return ga - gb;
    return (a.order || 0) - (b.order || 0);
}

/**
 * Filas de la matriz ya aplanadas: encabezados de grupo y habilidades en una sola
 * lista. Se hace aquí y no con x-for anidados porque anidar <tbody> dentro de
 * <tbody> es HTML inválido y el navegador lo reacomoda, rompiendo la alineación
 * de las columnas.
 * @param {boolean} archived - true para las filas de la sección "Anteriores".
 */
function pnSkillRows(archived) {
    var list = archived ? pnSkillsArchived() : pnSkillsFlat();
    var rows = [], lastGroup = null;
    list.forEach(function(s) {
        if (s.group !== lastGroup) {
            rows.push({ kind: 'group', key: 'g_' + (archived ? 'arch_' : '') + s.group, label: s.group });
            lastGroup = s.group;
        }
        rows.push({ kind: 'skill', key: s.id, skill: s });
    });
    return rows;
}

/** Definición de una habilidad por id (incluye archivadas), o null. */
function pnSkillDef(skillId) {
    var all = pnCatalog();
    for (var i = 0; i < all.length; i++) { if (all[i].id === skillId) return all[i]; }
    return null;
}

// ── CRUD del catálogo (requiere users.manage; ver nota de seguridad) ──
// NOTA: una habilidad puede otorgar permisos (`grants`), así que quien edita el
// catálogo puede alterar quién aprueba pruebas. Por eso va al mismo nivel que
// administrar usuarios y todo cambio queda auditado.

function _pnCatalogEnsure() {
    if (!pnState.skillCatalog || !pnState.skillCatalog.length) {
        pnState.skillCatalog = _pnSeedCatalogFlat();
    }
    if (!pnState.skillGroups || !pnState.skillGroups.length) {
        pnState.skillGroups = PN_SKILL_CATALOG_SEED.map(function(g) { return g.group; });
    }
    return pnState.skillCatalog;
}

function _pnSlugId(name) {
    var base = String(name || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'hab';
    var all = pnCatalog(), id = base, n = 2;
    while (all.some(function(s) { return s.id === id; })) { id = base + '_' + (n++); }
    return id;
}

/** Alta de habilidad. Devuelve el id nuevo o null. */
function pnSkillAdd(name, group, opts) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'editar el catálogo de habilidades')) return null;
    name = String(name || '').trim();
    if (!name) { if (typeof showToast === 'function') showToast('Escribe un nombre para la habilidad', 'error'); return null; }
    if (/[<>]/.test(name)) { if (typeof showToast === 'function') showToast('El nombre no puede contener < o >', 'error'); return null; }
    var cat = _pnCatalogEnsure();
    group = String(group || '').trim() || 'General';
    var maxOrder = cat.reduce(function(m, s) { return s.group === group ? Math.max(m, s.order || 0) : m; }, -1);
    var skill = {
        id: _pnSlugId(name), name: name, group: group,
        critical: !!(opts && opts.critical),
        recertMonths: (opts && opts.recertMonths) ? parseInt(opts.recertMonths, 10) : 0,
        grants: (opts && opts.grants) || '', minLvl: (opts && opts.minLvl) || 2,
        order: maxOrder + 1, archived: false, updatedAt: new Date().toISOString()
    };
    cat.push(skill);
    if (pnState.skillGroups.indexOf(group) === -1) pnState.skillGroups.push(group);
    pnSave();
    if (typeof auditLog === 'function') auditLog('pn', 'skill_added', { type: 'skill', id: skill.id, label: name }, 'Grupo: ' + group);
    return skill.id;
}

/** Edición de habilidad (nombre, grupo, crítica, recertificación, permiso). */
function pnSkillUpdate(skillId, patch) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'editar el catálogo de habilidades')) return false;
    var cat = _pnCatalogEnsure(), sk = null;
    for (var i = 0; i < cat.length; i++) { if (cat[i].id === skillId) { sk = cat[i]; break; } }
    if (!sk || !patch) return false;
    if (patch.name !== undefined) {
        var nm = String(patch.name).trim();
        if (!nm || /[<>]/.test(nm)) { if (typeof showToast === 'function') showToast('Nombre inválido', 'error'); return false; }
        sk.name = nm;
    }
    if (patch.group !== undefined) {
        sk.group = String(patch.group).trim() || 'General';
        if (pnState.skillGroups.indexOf(sk.group) === -1) pnState.skillGroups.push(sk.group);
    }
    if (patch.critical !== undefined) sk.critical = !!patch.critical;
    if (patch.recertMonths !== undefined) sk.recertMonths = parseInt(patch.recertMonths, 10) || 0;
    if (patch.grants !== undefined) sk.grants = patch.grants || '';
    if (patch.minLvl !== undefined) sk.minLvl = parseInt(patch.minLvl, 10) || 2;
    if (patch.order !== undefined) sk.order = parseInt(patch.order, 10) || 0;
    sk.updatedAt = new Date().toISOString();
    pnSave();
    if (typeof auditLog === 'function') auditLog('pn', 'skill_updated', { type: 'skill', id: sk.id, label: sk.name });
    return true;
}

/**
 * Archiva (no borra) una habilidad. Las certificaciones de los operadores quedan
 * INTACTAS: en un laboratorio acreditado, borrar un registro de competencia sin
 * rastro es justo lo que no debe poder hacerse. Reactivarla la devuelve completa.
 */
function pnSkillArchive(skillId, archived) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'archivar habilidades')) return false;
    var cat = _pnCatalogEnsure(), sk = null;
    for (var i = 0; i < cat.length; i++) { if (cat[i].id === skillId) { sk = cat[i]; break; } }
    if (!sk) return false;
    sk.archived = (archived === undefined) ? true : !!archived;
    sk.archivedAt = sk.archived ? new Date().toISOString() : '';
    sk.updatedAt = new Date().toISOString();
    pnSave();
    if (typeof auditLog === 'function') {
        auditLog('pn', sk.archived ? 'skill_archived' : 'skill_restored',
                 { type: 'skill', id: sk.id, label: sk.name },
                 'Las certificaciones se conservan');
    }
    return true;
}

/** Mueve una habilidad dentro de su grupo (dir -1 arriba, +1 abajo). */
function pnSkillMove(skillId, dir) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'reordenar habilidades')) return false;
    var sk = pnSkillDef(skillId);
    if (!sk) return false;
    var siblings = pnCatalog().filter(function(s) { return s.group === sk.group && !s.archived; }).sort(_pnSkillSort);
    var idx = siblings.findIndex(function(s) { return s.id === skillId; });
    var swapWith = siblings[idx + (dir < 0 ? -1 : 1)];
    if (!swapWith) return false;
    var tmp = sk.order || 0;
    sk.order = swapWith.order || 0;
    swapWith.order = tmp;
    sk.updatedAt = swapWith.updatedAt = new Date().toISOString();
    pnSave();
    return true;
}

/** Mueve un grupo completo en el orden (dir -1 arriba, +1 abajo). */
function pnGroupMove(group, dir) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'reordenar grupos')) return false;
    _pnCatalogEnsure();
    var g = pnState.skillGroups, i = g.indexOf(group), j = i + (dir < 0 ? -1 : 1);
    if (i === -1 || j < 0 || j >= g.length) return false;
    var t = g[i]; g[i] = g[j]; g[j] = t;
    pnSave();
    return true;
}

// ── Columnas de la matriz (operadores visibles y su orden) ──
function pnMatrixCols() {
    if (!pnState.matrixCols) pnState.matrixCols = { hidden: [], order: [] };
    return pnState.matrixCols;
}

/** Operadores que se muestran como columnas, en el orden configurado. */
function pnMatrixOperators() {
    var mc = pnMatrixCols();
    var ops = (pnState.operators || []).filter(function(o) {
        return o.active && !o.deleted && mc.hidden.indexOf(String(o.id)) === -1;
    });
    if (mc.order && mc.order.length) {
        ops.sort(function(a, b) {
            var ia = mc.order.indexOf(String(a.id)), ib = mc.order.indexOf(String(b.id));
            if (ia === -1) ia = 999;
            if (ib === -1) ib = 999;
            return ia - ib;
        });
    }
    return ops;
}

function pnMatrixToggleCol(opId) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'ocultar columnas')) return false;
    var mc = pnMatrixCols(), id = String(opId), i = mc.hidden.indexOf(id);
    if (i === -1) mc.hidden.push(id); else mc.hidden.splice(i, 1);
    pnSave();
    return true;
}

function pnMatrixMoveCol(opId, dir) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'reordenar columnas')) return false;
    var mc = pnMatrixCols();
    if (!mc.order || !mc.order.length) {
        mc.order = pnMatrixOperators().map(function(o) { return String(o.id); });
    }
    var id = String(opId), i = mc.order.indexOf(id), j = i + (dir < 0 ? -1 : 1);
    if (i === -1 || j < 0 || j >= mc.order.length) return false;
    var t = mc.order[i]; mc.order[i] = mc.order[j]; mc.order[j] = t;
    pnSave();
    return true;
}

/** Evaluación de un operador en una habilidad: {lvl, certifiedBy, certifiedAt, expiresAt}. */
function pnSkillOf(op, skillId) {
    if (!op || !op.skills) return { lvl: 0 };
    var e = op.skills[skillId];
    if (!e) return { lvl: 0 };
    if (typeof e === 'number') return { lvl: e };   // tolera un formato plano antiguo
    return e;
}

/** ¿La certificación venció? Sólo aplica a habilidades con recertMonths. */
function pnSkillExpired(entry) {
    return !!(entry && entry.expiresAt && entry.expiresAt < new Date().toISOString());
}

/** ¿Vence dentro de N días (por defecto 30)? */
function pnSkillExpiringSoon(entry, days) {
    if (!entry || !entry.expiresAt || pnSkillExpired(entry)) return false;
    var limit = new Date(Date.now() + (days || 30) * 86400000).toISOString();
    return entry.expiresAt <= limit;
}

/** Resumen de habilidades de un operador para las tarjetas de la lista. */
function pnSkillSummary(op) {
    var total = pnSkillsFlat().length, have = 0, expired = 0, soon = 0;
    pnSkillsFlat().forEach(function(s) {
        var e = pnSkillOf(op, s.id);
        if ((e.lvl || 0) > 0) have++;
        if (pnSkillExpired(e)) expired++;
        else if (pnSkillExpiringSoon(e)) soon++;
    });
    return { total: total, have: have, expired: expired, soon: soon };
}

/**
 * Cobertura del laboratorio en una habilidad: cuántos operadores activos la tienen
 * en nivel ≥2 y vigente. Responde "¿quién puede correr FTP-75 mañana?", que es la
 * pregunta que hace que la matriz se mantenga al día en vez de llenarse una vez.
 */
function pnSkillCoverage(skillId) {
    var ops = (pnState.operators || []).filter(function(o) { return o.active && !o.deleted; });
    var n = 0;
    ops.forEach(function(o) {
        var e = pnSkillOf(o, skillId);
        if ((e.lvl || 0) >= 2 && !pnSkillExpired(e)) n++;
    });
    return n;
}

/** Asigna/actualiza una habilidad. Calcula el vencimiento desde recertMonths. */
function pnOpSetSkill(opId, skillId, lvl, meta) {
    // Certificar otorga permisos (ver `grants` en el catálogo): el candado no puede
    // vivir solo en la vista.
    if (typeof authRequire === 'function' && !authRequire('users.skills', 'certificar habilidades')) return false;
    var ops = pnState.operators || [];
    var op = null;
    for (var i = 0; i < ops.length; i++) { if (String(ops[i].id) === String(opId)) { op = ops[i]; break; } }
    if (!op) return false;
    var def = pnSkillDef(skillId);
    if (!def) return false;
    if (!op.skills) op.skills = {};
    lvl = Math.max(0, Math.min(3, parseInt(lvl, 10) || 0));

    if (lvl === 0) {
        delete op.skills[skillId];   // ausencia = sin capacitación, no guardamos ceros
    } else {
        var now = new Date();
        var entry = {
            lvl: lvl,
            certifiedBy: (meta && meta.certifiedBy) || (typeof authGetCurrentUserName === 'function' ? authGetCurrentUserName('') : ''),
            certifiedAt: (meta && meta.certifiedAt) || now.toISOString()
        };
        if (def.recertMonths) {
            var exp = new Date(entry.certifiedAt);
            exp.setMonth(exp.getMonth() + def.recertMonths);
            entry.expiresAt = exp.toISOString();
        }
        op.skills[skillId] = entry;
    }
    // Marca de sección: el merge compara skillsUpdatedAt por separado, para que
    // certificar en la tablet y editar el perfil en el teléfono no se pisen.
    op.skillsUpdatedAt = new Date().toISOString();
    op.updatedAt = op.skillsUpdatedAt;
    pnSave();
    if (typeof auditLog === 'function') {
        auditLog('pn', 'operator_skill_set', { type: 'operator', id: op.id, label: op.name },
                 def.name + ' → nivel ' + lvl);
    }
    return true;
}

// ══════════════════════════════════════════════════════════════════════
// [Fase 4] CAPA ÚNICA DE MUTACIÓN DE OPERADORES (pnOp*)
// ══════════════════════════════════════════════════════════════════════
// Existen DOS vistas de Usuarios: la de Alpine y `pnRenderUsers`, que NO es
// código muerto — es la que se usa cuando Alpine no está disponible. Antes cada
// una tenía su propia copia de la lógica y ya habían divergido (una validaba
// <> en los nombres, la otra no; una auditaba, la otra no).
// Ahora toda mutación pasa por aquí: una sola validación, un solo permiso, una
// sola entrada de auditoría. Las vistas sólo pintan.

function pnOpFind(opId) {
    var ops = pnState.operators || [];
    for (var i = 0; i < ops.length; i++) {
        if (String(ops[i].id) === String(opId)) return ops[i];
    }
    return null;
}

function _pnOpAfterChange() {
    pnSave();
    if (typeof pnSyncOperators === 'function') pnSyncOperators();
    if (typeof pnRender === 'function') pnRender();
    window.dispatchEvent(new CustomEvent('pn:refresh'));
}

/** Alta de operador. Devuelve el id nuevo o null. */
function pnOpAdd(name, role) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'agregar operadores')) return null;
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!name) { showToast('Ingresa un nombre', 'error'); return null; }
    // Defensa en profundidad: los renders escapan HTML, pero un nombre con <> nunca es legítimo
    if (/[<>]/.test(name)) { showToast('El nombre no puede contener < o >', 'error'); return null; }
    var maxId = (pnState.operators || []).reduce(function(m, o) { return Math.max(m, o.id || 0); }, 0);
    var op = {
        id: maxId + 1, name: name, role: role || 'Técnico', active: true,
        level: (role === 'Practicante') ? 'L1' : 'L2', skills: {},
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    pnState.operators.push(op);
    _pnOpAfterChange();
    if (typeof auditLog === 'function') auditLog('pn', 'operator_added', { type: 'operator', id: op.id, label: name }, 'Rol: ' + op.role);
    return op.id;
}

/** Edita nombre y/o rol. */
function pnOpUpdate(opId, patch) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'editar operadores')) return false;
    var op = pnOpFind(opId);
    if (!op || !patch) return false;
    if (patch.name !== undefined) {
        var nm = String(patch.name).trim().replace(/\s+/g, ' ');
        if (!nm) { showToast('El nombre no puede quedar vacío', 'error'); return false; }
        if (/[<>]/.test(nm)) { showToast('El nombre no puede contener < o >', 'error'); return false; }
        op.name = nm;
    }
    if (patch.role !== undefined && patch.role !== null && patch.role !== '') {
        // Normaliza antes de validar: ' supervisor' o 'SUPERVISOR' se aceptaban
        // como distintos de la clave real y se descartaban sin decir nada.
        var wantRole = (typeof _authNormalizeRole === 'function') ? _authNormalizeRole(patch.role) : patch.role;
        if (wantRole && PN_ROLES.indexOf(wantRole) !== -1) op.role = wantRole;
        else { showToast('Rol no reconocido: "' + patch.role + '". Válidos: ' + PN_ROLES.join(', '), 'error'); return false; }
    }
    op.updatedAt = new Date().toISOString();
    // Si el rol que cambió es el de quien está usando la app, su sesión guarda una
    // COPIA del rol: sin esto los permisos no aplican hasta recargar.
    if (typeof authRefreshCurrentRole === 'function') authRefreshCurrentRole();
    _pnOpAfterChange();
    if (typeof auditLog === 'function') auditLog('pn', 'operator_updated', { type: 'operator', id: op.id, label: op.name }, 'Rol: ' + op.role);
    return true;
}

/** Activa o desactiva un operador. */
function pnOpSetActive(opId, active) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'activar/desactivar operadores')) return false;
    var op = pnOpFind(opId);
    if (!op) return false;
    op.active = (active === undefined) ? !op.active : !!active;
    op.updatedAt = new Date().toISOString();
    _pnOpAfterChange();
    if (typeof auditLog === 'function') auditLog('pn', op.active ? 'operator_activated' : 'operator_deactivated', { type: 'operator', id: op.id, label: op.name });
    showToast(op.name + (op.active ? ' activado' : ' desactivado'), 'info');
    return true;
}

/** Baja lógica (tombstone): el borrado debe sobrevivir al merge del sync. */
function pnOpDelete(opId) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'eliminar operadores')) return Promise.resolve(false);
    var op = pnOpFind(opId);
    if (!op) return Promise.resolve(false);
    return showConfirmDialog({
        title: '⚠️ Eliminar operador',
        message: '¿Eliminar a ' + op.name + '? Los registros existentes no se afectan.',
        type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar'
    }).then(function(ok) {
        if (!ok) return false;
        if (typeof auditLog === 'function') auditLog('pn', 'operator_removed', { type: 'operator', id: op.id, label: op.name });
        op.active = false;
        op.deleted = true;
        op.deletedAt = new Date().toISOString();
        op.updatedAt = op.deletedAt;
        _pnOpAfterChange();
        showToast('Operador eliminado', 'info');
        return true;
    });
}

var PN_ROLES = ['Técnico', 'Supervisor', 'Ingeniero', 'Coordinador', 'Practicante'];

/** Actualiza campos de perfil (no credenciales, no habilidades). */
function pnOpUpdateProfile(opId, patch) {
    // El candado vivía SOLO en el método Alpine `saveProfile`; cualquier llamador
    // nuevo de la capa de datos escribía sin permiso. Defensa en profundidad.
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'editar el perfil')) return false;
    var ops = pnState.operators || [];
    var op = null;
    for (var i = 0; i < ops.length; i++) { if (String(ops[i].id) === String(opId)) { op = ops[i]; break; } }
    if (!op || !patch) return false;
    ['employeeId', 'email', 'phone', 'shift', 'area', 'notes', 'hiredAt', 'level'].forEach(function(f) {
        if (patch[f] !== undefined) op[f] = patch[f];
    });
    op.profileUpdatedAt = new Date().toISOString();
    op.updatedAt = op.profileUpdatedAt;
    pnSave();
    if (typeof auditLog === 'function') {
        auditLog('pn', 'operator_profile_updated', { type: 'operator', id: op.id, label: op.name });
    }
    return true;
}

function pnInit() {
    try {
        var saved = localStorage.getItem(PN_LS_KEY);
        if (saved) {
            var parsed = JSON.parse(saved);
            pnState = Object.assign(pnState, parsed);
        }
    } catch(e) {}

    // Sync operators from CONFIG if pnState.operators is empty.
    // `provisional: true` marca que son marcadores de posición sembrados localmente,
    // NO cuentas reales: (1) no permiten entrar sin credencial (ver authBypassForOperator),
    // y (2) siempre pierden el merge contra el roster real de la nube, porque su
    // createdAt es "ahora" y le ganaría por fecha al registro real que sí trae PINs.
    if (pnState.operators.length === 0 && CONFIG && CONFIG.operators) {
        pnState.operators = CONFIG.operators.map(function(name, i) {
            return { id: i + 1, name: name, role: 'Técnico', active: true, provisional: true, createdAt: new Date().toISOString() };
        });
        pnSave();
    }
    if (!pnState.tasks) pnState.tasks = []; // v15.9: tareas manuales del tablero HOY
    if (!pnState.projects) pnState.projects = []; // v16.6: seguimiento de proyectos/eventos
    pnMigrateOperators();
    _pnDedupeOperators();
    _pnEnsureAdminExists();
}

/**
 * Un mismo operador podía sobrevivir duplicado: el merge de la nube empata por
 * `id|nombre` (firebase-sync.js) pero la sesión lo busca SOLO por id y se queda con
 * el primero. Con "Jorge Nuñez" y "Jorge Núñez" (misma id, grafía distinta) el
 * ganador podía ser el marcador provisional sin permisos.
 * Mismo patrón que dedupeVehicleIds() (app.js) para vehículos.
 * @returns {number} cuántos duplicados se fusionaron
 */
function _pnDedupeOperators() {
    var ops = pnState.operators || [];
    var byId = {}, out = [], merged = 0;
    ops.forEach(function(o) {
        if (!o || o.id == null) { out.push(o); return; }
        var k = String(o.id), prev = byId[k];
        if (!prev) { byId[k] = o; out.push(o); return; }
        merged++;
        // Gana el real sobre el provisional; a igualdad, el de fecha más reciente.
        var takeNew = (prev.provisional && !o.provisional) ||
            (!!prev.provisional === !!o.provisional &&
             (o.updatedAt || o.createdAt || '') > (prev.updatedAt || prev.createdAt || ''));
        if (!takeNew) return;
        // Conserva credenciales de cualquiera de los dos: perderlas deja a alguien fuera.
        var keep = Object.assign({}, o);
        keep.pinHash2 = o.pinHash2 || prev.pinHash2;
        keep.pinHash  = o.pinHash  || prev.pinHash;
        if (!keep.skills || !Object.keys(keep.skills).length) keep.skills = prev.skills;
        byId[k] = keep;
        out[out.indexOf(prev)] = keep;
    });
    if (merged > 0) {
        pnState.operators = out;
        pnSave();
        if (typeof auditLog === 'function') {
            auditLog('pn', 'operadores_deduplicados', { type: 'sistema', label: 'Operadores' },
                'Se fusionaron ' + merged + ' registro(s) duplicado(s) por id');
        }
    }
    return merged;
}

/**
 * Garantiza que SIEMPRE exista alguien que pueda administrar usuarios.
 *
 * El candado era circular: todos los operadores nacen 'Técnico' (arriba y en
 * pnOpAdd), pero cambiar un rol exige `users.manage`, que solo tienen Supervisor
 * y Coordinador. Nadie podía otorgarse ni otorgar el permiso para otorgar
 * permisos, así que la pantalla de Usuarios quedaba muerta: 22 campos en gris,
 * sin errores ni explicación (issues #100, #103, #105).
 *
 * Corre al final de pnInit(), que se ejecuta ANTES de authInit() — así la sesión
 * ya lee el rol corregido. Es idempotente: si ya hay administrador, no toca nada.
 * @returns {string} nombre del operador promovido, o '' si no hizo falta
 */
function _pnEnsureAdminExists() {
    var ops = pnState.operators || [];
    if (!ops.length) return '';
    var changed = false;

    // 1) Normalizar roles: un rol fuera del mapa daba CERO permisos en silencio.
    if (typeof _authNormalizeRole === 'function') {
        ops.forEach(function(o) {
            if (!o) return;
            var canon = _authNormalizeRole(o.role);
            if (canon && canon !== o.role) { o.role = canon; changed = true; }
            else if (!canon && o.role !== 'Técnico') { o.role = 'Técnico'; changed = true; }
        });
    }

    var isActive = function(o) { return o && !o.deleted && o.active !== false; };
    var hasAdmin = function(o) {
        return typeof authRoleHas === 'function' && authRoleHas(o.role, 'users.manage');
    };
    if (ops.some(function(o) { return isActive(o) && hasAdmin(o); })) {
        if (changed) pnSave();
        return '';
    }

    // 2) Nadie puede administrar. Se promueve al jefe de laboratorio si está en el
    //    roster; si no, al primer operador activo, para que el laboratorio nunca
    //    quede sin quien reparta permisos.
    var norm = function(s) {
        return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    };
    var target = null;
    for (var i = 0; i < ops.length; i++) {
        if (isActive(ops[i]) && norm(ops[i].name) === 'jorge nunez') { target = ops[i]; break; }
    }
    if (!target) { for (var j = 0; j < ops.length; j++) { if (isActive(ops[j])) { target = ops[j]; break; } } }
    if (!target) { if (changed) pnSave(); return ''; }

    var before = target.role;
    target.role = 'Coordinador';
    // Sella la fecha para ganar el merge por `updatedAt` y que el rol se propague.
    target.updatedAt = new Date().toISOString();
    pnSave();
    if (typeof auditLog === 'function') {
        auditLog('auth', 'rol_desbloqueado', { type: 'operator', id: target.id, label: target.name },
            'Ningún operador activo podía administrar usuarios; ' + target.name +
            ' pasó de "' + (before || 'sin rol') + '" a Coordinador');
    }
    return target.name;
}

/**
 * [Fase 3] Migración de esquema del roster. Sólo AÑADE campos, nunca borra, y es
 * idempotente — puede correr en cada arranque sin efecto tras la primera vez.
 */
function pnMigrateOperators() {
    // [Fase 3.5] Esquema 3: siembra del catálogo editable. Se hace antes del
    // early-return para que instalaciones que ya migraron al 2 también lo reciban.
    if (!pnState.opsSchema || pnState.opsSchema < 3) {
        if (!pnState.skillCatalog || !pnState.skillCatalog.length) {
            pnState.skillCatalog = _pnSeedCatalogFlat();
        }
        if (!pnState.skillGroups || !pnState.skillGroups.length) {
            pnState.skillGroups = PN_SKILL_CATALOG_SEED.map(function(g) { return g.group; });
        }
        if (!pnState.matrixCols) pnState.matrixCols = { hidden: [], order: [] };
    }
    if (pnState.opsSchema >= 2) { pnState.opsSchema = 3; pnSave(); return; }
    (pnState.operators || []).forEach(function(op) {
        if (!op) return;
        if (!op.skills) op.skills = {};
        if (!op.level) op.level = (op.role === 'Practicante') ? 'L1' : 'L2';
        if (!op.updatedAt) op.updatedAt = op.createdAt || new Date().toISOString();
        if (op.profileUpdatedAt === undefined) op.profileUpdatedAt = '';
        if (op.skillsUpdatedAt === undefined) op.skillsUpdatedAt = '';
        if (op.employeeId === undefined) op.employeeId = '';
        if (op.notes === undefined) op.notes = '';
        if (op.hiredAt === undefined) op.hiredAt = '';
    });
    // Resto del selector de operador previo al muro de PIN (Fase 2 borró quien lo escribía)
    try { localStorage.removeItem('kia_current_operator'); } catch(e) {}
    pnState.opsSchema = 3;
    pnSave();
}

// ═══════════════════════════════════════════════════════════════════════════════
// v15.9 — TAREAS MANUALES DEL TABLERO HOY (pnState.tasks, sync vía panel + merge por id)
// {id, title, cat, assignee, due, done, doneAt, createdBy, createdAt, updatedAt, deleted}
// ═══════════════════════════════════════════════════════════════════════════════
function _pnCurrentUser() {
    try {
        if (typeof authGetCurrentUser === 'function') {
            var u = authGetCurrentUser();
            if (u && u.name) return u.name;
        }
    } catch (e) {}
    return 'Operador';
}

function pnTaskAdd(data) {
    if (!pnState.tasks) pnState.tasks = [];
    var now = new Date().toISOString();
    var task = {
        id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title: String(data.title || '').trim(),
        cat: data.cat || 'manuales',
        assignee: data.assignee || '',
        due: data.due || '',
        done: false, doneAt: null,
        createdBy: _pnCurrentUser(),
        createdAt: now, updatedAt: now, deleted: false
    };
    if (!task.title) { if (typeof showToast === 'function') showToast('Escribe un título para la actividad', 'warning'); return null; }
    pnState.tasks.push(task);
    if (typeof auditLog === 'function') auditLog('panel', 'task_add', { type: 'task', id: task.id, label: task.title }, 'Cat: ' + task.cat + (task.assignee ? ' · Resp: ' + task.assignee : '') + (task.due ? ' · Para: ' + task.due : ''));
    pnSave();
    if (typeof dailyDashRender === 'function' && document.getElementById('platform-today') && document.getElementById('platform-today').classList.contains('active')) dailyDashRender();
    return task;
}

function pnTaskToggle(id) {
    var t = (pnState.tasks || []).find(function(x) { return x.id === id; });
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    t.updatedAt = new Date().toISOString();
    if (typeof auditLog === 'function') auditLog('panel', t.done ? 'task_done' : 'task_reopen', { type: 'task', id: t.id, label: t.title }, t.done ? 'Completada por ' + _pnCurrentUser() : 'Reabierta');
    pnSave();
    if (typeof dailyDashRender === 'function' && document.getElementById('platform-today') && document.getElementById('platform-today').classList.contains('active')) dailyDashRender();
}

function pnTaskDelete(id) {
    var t = (pnState.tasks || []).find(function(x) { return x.id === id; });
    if (!t) return;
    t.deleted = true; // tombstone: sobrevive al merge para no resucitar en otros dispositivos
    t.updatedAt = new Date().toISOString();
    if (typeof auditLog === 'function') auditLog('panel', 'task_delete', { type: 'task', id: t.id, label: t.title }, 'Eliminada por ' + _pnCurrentUser());
    pnSave();
    if (typeof dailyDashRender === 'function' && document.getElementById('platform-today') && document.getElementById('platform-today').classList.contains('active')) dailyDashRender();
}

function pnSave() {
    try { localStorage.setItem(PN_LS_KEY, JSON.stringify(pnState)); } catch(e) {}
    tabCacheInvalidate('pn'); // Mark all tabs dirty on data change
    // v16.6: sin esto, las pestañas Alpine (Alertas/Calendario) nunca se enteraban de un
    // cambio hecho por código clásico (ej. pnProjectStepDone) — el listener ya existía
    // (panelAlpineComponent escucha 'data:saved' y llama _bump()), solo faltaba emitirlo aquí.
    window.dispatchEvent(new CustomEvent('data:saved', { detail: { module: 'panel' } }));
}

var _pnTabs = ['pn-dashboard','pn-reports','pn-executive','pn-turnaround','pn-users','pn-shift','pn-projects','pn-alerts','pn-intelligence','pn-system','pn-calendar','pn-audit','pn-regulations','pn-files','pn-bugs','pn-homolog'];

// Tabs managed by Alpine reactive templates (no innerHTML needed)
var _pnAlpineTabs = { 'pn-users': true, 'pn-shift': true, 'pn-alerts': true, 'pn-system': true, 'pn-calendar': true, 'pn-audit': true };

function pnSwitchTab(tabId) {
    // v16.3: apagar el listener en vivo del Almacén al salir de esa pestaña — no dejarlo
    // corriendo de fondo mientras el operador ve otra sección del Panel.
    if (pnState.activeTab === 'pn-files' && tabId !== 'pn-files' && typeof fbFilesUnsubscribe === 'function') fbFilesUnsubscribe();
    pnState.activeTab = tabId;
    var _activeBtn = null;
    document.querySelectorAll('#pn-tabs-bar .tp-tab').forEach(function(b) {
        var on = b.getAttribute('onclick').indexOf(tabId) !== -1;
        b.classList.toggle('active', on);
        if (on) _activeBtn = b;
    });
    if (typeof a11yTablist === 'function') a11yTablist(document.getElementById('pn-tabs-bar'));
    if (typeof a11yTablistSync === 'function' && _activeBtn) {
        a11yTablistSync(document.getElementById('pn-tabs-bar'), _activeBtn);
    }
    // keepCache solo al saltar de pestana — todo lo demas repinta (issue #110).
    pnRender({ keepCache: true });
    // v16.0: banner de ayuda de pestañas Alpine — su contenido vive en un x-show estático
    // que NO pasa por tabCacheSwitch/pnRender, así que se pinta en un slot propio aquí.
    if (_pnAlpineTabs[tabId] && typeof helpBannerHTML === 'function') {
        var slot = document.getElementById('help-banner-slot-' + tabId);
        if (slot) slot.innerHTML = helpBannerHTML(tabId);
    }
    // v22.0: mismo caso que el banner — el selector de densidad vive en el x-show
    // estático de pn-system, que no pasa por pnRender.
    if (tabId === 'pn-system') pnDensityRenderChoices();
    // Notify Alpine components of tab switch
    window.dispatchEvent(new CustomEvent('pn:tab-switch', { detail: { tab: tabId } }));
}

function _pnGetRenderer(tabId) {
    // If Alpine.js is loaded, Alpine-managed tabs use a no-op renderer (Alpine handles the HTML in sibling div)
    if (_pnAlpineTabs[tabId] && typeof Alpine !== 'undefined') return _pnAlpineTabRenderer;
    // Fallback to legacy renderers when Alpine is not available
    if (tabId === 'pn-dashboard') return pnRenderDashboard;
    if (tabId === 'pn-reports') return pnRenderReports;
    if (tabId === 'pn-executive') return pnRenderExecutive;
    if (tabId === 'pn-turnaround') return pnRenderTurnaround;
    if (tabId === 'pn-users') return pnRenderUsers;
    if (tabId === 'pn-shift') return pnRenderShiftLog;
    if (tabId === 'pn-alerts') return pnRenderAlerts;
    if (tabId === 'pn-intelligence') return pnRenderIntelligence;
    if (tabId === 'pn-system') return pnRenderSystemHealth;
    if (tabId === 'pn-calendar') return pnRenderCalendar;
    // v16.8: Proyectos vive en js/projects.js, que carga DESPUÉS de este archivo — guardar con
    // typeof para que un fallo de carga de ese módulo no rompa el resto del Panel.
    if (tabId === 'pn-projects') return (typeof pnRenderProjects === 'function') ? pnRenderProjects : null;
    if (tabId === 'pn-audit') return pnRenderAuditTrail;
    if (tabId === 'pn-regulations') return pnRenderRegulations;
    if (tabId === 'pn-files') return pnRenderFiles;
    // v17.13: la bandeja de bugs vive en js/bugreport.js, que carga DESPUÉS de este
    // archivo — mismo guard typeof que Proyectos.
    if (tabId === 'pn-bugs') return (typeof pnRenderBugs === 'function') ? pnRenderBugs : null;
    // v17.14: catálogo de homologación Europa (js/homolog.js, carga después de este archivo)
    if (tabId === 'pn-homolog') return (typeof pnRenderHomolog === 'function') ? pnRenderHomolog : null;
    return null;
}

/** Clear renderer for Alpine-managed tabs — Alpine x-data handles rendering in sibling div */
function _pnAlpineTabRenderer(el) {
    el.innerHTML = ''; // Clear any skeleton/placeholder — Alpine template is in sibling container
}

/** Fallback renderer for Audit Trail tab (when Alpine is unavailable) */
function pnRenderAuditTrail(el) {
    var trail = (typeof auditGetTrail === 'function') ? auditGetTrail().reverse() : [];
    var html = '<div class="tp-card"><div class="tp-card-title" data-help="pn-audit-help"><span>🔍 Auditoría (' + trail.length + ' registros)</span>' +
        '<button onclick="if(typeof auditExportCSV===\'function\')auditExportCSV()" class="tp-btn tp-btn-ghost" style="font-size: var(--fs-sm);">📤 Exportar CSV</button></div>';
    if (trail.length === 0) {
        html += '<div style="text-align:center;padding: var(--space-xl);color:var(--muted);">Sin registros de auditoría.</div>';
    } else {
        trail.slice(0, 100).forEach(function(e) {
            html += '<div style="display:flex;gap: var(--space-sm);padding:6px 0;border-bottom:1px solid var(--border);font-size: var(--fs-xs);">' +
                '<span style="color:var(--muted);min-width:55px;">' + (e.ts ? e.ts.slice(11,16) : '') + '</span>' +
                '<span style="min-width:40px;font-weight:700;">' + (e.mod || '') + '</span>' +
                '<span style="color:var(--info-text);min-width:60px;">' + (e.user ? e.user.name : '') + '</span>' +
                '<span style="flex:1;">' + (e.action || '') + (e.details ? ' — ' + e.details : '') + '</span></div>';
        });
    }
    html += '</div>';
    el.innerHTML = html;
}

function pnRender(opts) {
    if (!document.getElementById('pn-content')) return;
    // Initialize tab cache on first render
    if (!_tabCache['pn']) tabCacheInit('pn', _pnTabs);
    var tab = pnState.activeTab;
    var renderer = _pnGetRenderer(tab);
    if (renderer) tabCacheSwitch('pn', tab, renderer, opts);
    // Notify Alpine to refresh reactive data
    window.dispatchEvent(new CustomEvent('pn:refresh'));
    // v16.0: banners/tooltips de ayuda — tabCacheSwitch puede diferir el render real a un RAF.
    // Las pestañas Alpine (_pnAlpineTabs) usan su propio slot estático (ver pnSwitchTab) —
    // su "-cached" queda vacío (_pnAlpineTabRenderer), así que se excluyen aquí para no duplicar.
    if (typeof cascadeInjectTooltipsDeferred === 'function') cascadeInjectTooltipsDeferred();
    if (!_pnAlpineTabs[tab] && typeof helpInjectBannerDeferred === 'function') helpInjectBannerDeferred('pn', tab);
    // [v17.5] Mismo problema de RAF diferido de las Fases 2-5: hace alcanzables por Tab los
    // <div onclick> de la pestaña activa. Las pestañas Alpine usan @click (Alpine ya delega
    // el manejo de teclado a los elementos reales que uses en su plantilla), así que este
    // barrido cubre las pestañas clásicas — Dashboard, Reportes, Ejecutivo, Turnaround,
    // Proyectos, Regulaciones, Archivos.
    if (typeof a11yClickables === 'function') {
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var content = document.getElementById('pn-content');
                if (content) a11yClickables(content);
            });
        });
    }
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

// ── [v15-P2] Reports Center — single hub that dispatches to existing exporters ──
function pnRenderReports(el) {
    var reports = [
        { icon: '📈', title: 'Presentación ejecutiva (Plan)', desc: 'Unidades probadas/liberadas, plan semanal, familias, calendario y KPIs — ideal para armar presentaciones.', actions: [{ label: 'JSON', fn: 'tpExportPlanJSON' }] },
        { icon: '📋', title: 'Plan semanal', desc: 'Plan de la última semana (texto para compartir).', actions: [{ label: 'Texto', fn: '_pnReportWeeklyPlan' }] },
        { icon: '📊', title: 'Análisis de brechas (Gap)', desc: 'Cobertura: requeridas vs probadas por configuración.', actions: [{ label: 'CSV', fn: 'tpExportGapCSV' }] },
        { icon: '📦', title: 'Inventario de gases', desc: 'Cilindros con fórmula, control, nivel y vencimiento.', actions: [{ label: 'JSON', fn: 'invExportGases' }, { label: 'Reporte', fn: 'invExportReport' }] },
        { icon: '⛽', title: 'Pronóstico semanal de gas', desc: 'Consumo y proyección de agotamiento.', actions: [{ label: 'CSV', fn: 'invExportWeeklyForecast' }] },
        { icon: '📝', title: 'Bitácora de turnos', desc: 'Registros de la bitácora del laboratorio.', actions: [{ label: 'CSV', fn: 'pnExportShiftLog' }] },
        { icon: '🔔', title: 'Alertas', desc: 'Alertas activas del sistema.', actions: [{ label: 'CSV', fn: 'pnExportAlerts' }] },
        { icon: '🔍', title: 'Auditoría', desc: 'Traza de acciones de usuarios.', actions: [{ label: 'CSV', fn: 'auditExportCSV' }] },
        { icon: '📄', title: 'Estado semanal', desc: 'Reporte ejecutivo cross-módulo en PDF.', actions: [{ label: 'PDF', fn: 'generateWeeklyStatusPDF' }] },
        { icon: '🔧', title: 'F11 — Equipos', desc: 'Registro de equipos padre (formato COP15-F11).', actions: [{ label: 'CSV', fn: 'invExportF11Equipos' }] },
        { icon: '📏', title: 'F11 — Calibración', desc: 'Plan anual de calibración por instrumento y magnitud (formato COP15-F11).', actions: [{ label: 'CSV', fn: 'invExportF11Calibracion' }] },
        { icon: '🛠️', title: 'F11 — Actividades', desc: 'Catálogo de actividades de mantenimiento preventivo (formato COP15-F11).', actions: [{ label: 'CSV', fn: 'invExportF11Actividades' }] },
        { icon: '📋', title: 'F11 — Historial de mantenimiento', desc: 'Mantenimientos ejecutados (formato COP15-F11).', actions: [{ label: 'CSV', fn: 'invExportF11Historial' }] },
        { icon: '🗓️', title: 'F11 — Plan Maestro', desc: 'Matriz de 52 semanas + cumplimiento, lista para firmar.', actions: [{ label: 'PDF', fn: 'invMaintPlanPDF' }] },
        { icon: '🗂️', title: 'Proyectos', desc: 'Pasos de todos los proyectos (Step/Responsible/Status/Target Date/Completion Date/Roadblock), formato compatible con tablero tipo Loop.', actions: [{ label: 'CSV', fn: 'pnExportAllProjectsCSV' }] },
        { icon: '📊', title: 'Portafolio de Proyectos', desc: 'Un renglón por proyecto activo con semáforo, avance, vencidos, bloqueados y próximo hito — para reportar a jefatura.', actions: [{ label: 'CSV', fn: 'pnExportPortfolioCSV' }] },
        { icon: '📄', title: 'Proyecto (detalle)', desc: 'Una carilla del proyecto abierto: métricas, hitos, curva S y la tabla de pasos. Abre primero el proyecto en Datos → Proyectos.', actions: [{ label: 'PDF', fn: 'pnProjectPDF' }] },
        { icon: '🧪', title: 'CoP — Panorama de familias', desc: 'Un renglón por familia del alcance CoP: veredicto, VINes, % del límite, U con su banda A(n)/B(n), Cpk, días sin ensayar, riesgo y motivo.', actions: [{ label: 'CSV', fn: 'copExportPortfolioCSV' }] },
        { icon: '📑', title: 'CoP — Expediente de familia (auditoría)', desc: 'Dossier de la familia abierta: identificación, límites congelados, estadística, VINes con fechas, CO₂ vs declarado y firmas. Abre primero la familia en CoP → Panorama.', actions: [{ label: 'PDF', fn: 'copFamilyPDF' }, { label: 'CSV', fn: 'copExportFamilyCSV' }] },
        { icon: '📜', title: 'CoP — Juicios emitidos', desc: 'Historial de veredictos con fecha, familia, n, decisión, quién lo emitió y los límites con los que se decidió.', actions: [{ label: 'CSV', fn: 'copExportJudgmentsCSV' }] }
    ];
    var html = '<div class="tp-card"><div class="tp-card-title" data-help="pn-reports-help"><span>📤 Centro de Reportes</span></div>'
        + '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-bottom: var(--space-sm);">Un solo lugar para exportar. Cada reporte usa los datos actuales del sistema.</div>';
    reports.forEach(function(r) {
        html += '<div style="display:flex;align-items:center;gap: var(--space-md);padding: var(--space-md) var(--space-xs);border-bottom:1px solid var(--tp-border);flex-wrap:wrap;">';
        html += '<div style="font-size:22px;">' + r.icon + '</div>';
        html += '<div style="flex:1;min-width:170px;"><div style="font-size:12px;font-weight:700;color:var(--tp-text);">' + r.title + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + r.desc + '</div></div>';
        html += '<div style="display:flex;gap: var(--space-sm);flex-wrap:wrap;">';
        r.actions.forEach(function(a) {
            html += '<button class="tp-btn tp-btn-ghost" onclick="pnRunReport(\'' + a.fn + '\')" style="font-size: var(--fs-sm);">' + a.label + '</button>';
        });
        html += '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
}

// Dispatch a report by global function name (exporters live in their own modules).
function pnRunReport(fnName) {
    try {
        if (fnName === '_pnReportWeeklyPlan') return _pnReportWeeklyPlan();
        var fn = window[fnName];
        if (typeof fn === 'function') fn();
        else if (typeof showToast === 'function') showToast('Reporte no disponible: ' + fnName, 'error');
    } catch (e) {
        console.error('pnRunReport', fnName, e);
        if (typeof showToast === 'function') showToast('Error al generar: ' + e.message, 'error');
    }
}

// tpExportWeeklyPlan pide un índice de semana. v20: se exporta la semana EN CURSO
// (`tpWeekBoardRows`, LA definición); si aún no hay una, la última aceptada, y si no,
// la última creada.
function _pnReportWeeklyPlan() {
    if (typeof tpExportWeeklyPlan !== 'function') { if (typeof showToast === 'function') showToast('No disponible', 'error'); return; }
    var plans = (typeof tpState !== 'undefined' && tpState.weeklyPlans) ? tpState.weeklyPlans : [];
    if (!plans.length) { if (typeof showToast === 'function') showToast('No hay plan semanal', 'warning'); return; }
    var idx = -1;
    if (typeof tpWeekBoardRows === 'function') {
        try { var b = tpWeekBoardRows({}); if (b && b.planIdx >= 0) idx = b.planIdx; } catch (e) {}
    }
    if (idx < 0) { idx = plans.length - 1; for (var i = plans.length - 1; i >= 0; i--) { if (plans[i].accepted) { idx = i; break; } } }
    tpExportWeeklyPlan(idx);
}

// ── [v15-P1] Cross-module Lab Overview (single source of truth) ──
// Renders the canonical cross-module KPI strip + pipeline + weekly plan + alerts.
// Reused by Panel (pn-dashboard) and HOY so the numbers come from ONE place.
// opts.sections: subset of ['kpi','pipeline','plan','alerts'] (default: all).

// [v15.5] Memoización: HOY y Panel re-escaneaban todos los módulos en cada
// visita. Clave compuesta barata + contador de saves; en hit se reinyecta el
// HTML sin recomputar ni re-animar los contadores.
var _labOverviewCache = {};   // sectionsKey → { key, html }
var _labOverviewGen = 0;      // se incrementa con cada 'data:saved' (saveDB/invSave)
window.addEventListener('data:saved', function() { _labOverviewGen++; });

function _labOverviewKey(sections) {
    var vCount = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles.length : 0;
    var tpStamp = (typeof tpState !== 'undefined' && tpState) ? (tpState._lastSave || 0) : 0;
    var opsSig = (typeof pnState !== 'undefined' && pnState.operators)
        ? pnState.operators.length + ':' + pnState.operators.filter(function(o) { return o.active; }).length : '0:0';
    var gasCount = (typeof invState !== 'undefined' && invState.gases) ? invState.gases.length : 0;
    var syncStamp = (typeof fbSync !== 'undefined' && fbSync.lastSync) ? fbSync.lastSync.getTime() : 0;
    // v22.5 — El estado de colapso de las uiCard entra a la clave. Sin esto, colapsar
    // una tarjeta cambiaba la preferencia pero el memo devolvía el HTML viejo con
    // `open` y la tarjeta se reabría sola en el siguiente render.
    var cardsSig = '';
    try { cardsSig = JSON.stringify((typeof uiPref === 'function' ? uiPref('cards') : {}) || {}); } catch (e) {}
    return [_labOverviewGen, vCount, tpStamp, opsSig, gasCount, syncStamp, localToday(), sections.join(','), cardsSig].join('|');
}

function renderLabOverview(el, opts) {
    if (!el) return;
    opts = opts || {};
    var sections = opts.sections || ['kpi', 'pipeline', 'plan', 'alerts'];
    var has = function(s) { return sections.indexOf(s) !== -1; };

    var sectionsKey = sections.join(',');
    var memoKey = _labOverviewKey(sections);
    var cached = _labOverviewCache[sectionsKey];
    if (cached && cached.key === memoKey) {
        el.innerHTML = cached.html;
        // Contadores al valor final sin re-animar (los datos no cambiaron)
        el.querySelectorAll('.pn-kpi-num[data-kpi-target]').forEach(function(numEl) {
            numEl.textContent = (parseFloat(numEl.dataset.kpiTarget) || 0) + (numEl.dataset.kpiSuffix || '');
        });
        return;
    }

    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var activeVehicles = vehicles.filter(function(v) { return v.status !== 'archived'; });
    var today = localToday();
    var archivedToday = vehicles.filter(function(v) { return v.status === 'archived' && v.archivedAt && localDateStr(new Date(v.archivedAt)) === today; });
    var byStatus = {}; activeVehicles.forEach(function(v) { byStatus[v.status] = (byStatus[v.status] || 0) + 1; });
    var pendingApproval = vehicles.filter(function(v) { return v.status === 'pending-approval'; }).length;

    // v20: el avance de "el plan" es el de la semana EN CURSO (`tpWeekBoardRows`, LA
    // definición). `weeklyPlans[length-1]` era el último plan CREADO: generar la semana
    // que entra dejaba este indicador en 0/N y parecía que el laboratorio no había hecho
    // nada. Se conserva el último plan como respaldo si aún no hay uno de esta semana.
    var _lo = null;
    if (typeof tpWeekBoardRows === 'function') { try { _lo = tpWeekBoardRows({}); } catch (e) { _lo = null; } }
    var tpPlans = (typeof tpState !== 'undefined' && tpState.weeklyPlans) ? tpState.weeklyPlans : [];
    var latestPlan = (_lo && _lo.plan) ? _lo.plan : (tpPlans.length ? tpPlans[tpPlans.length - 1] : null);
    var tpDone = latestPlan ? (latestPlan.items || []).filter(function(i) { return i.completed; }).length : 0;
    var tpTotal = latestPlan ? (latestPlan.items || []).length : 0;
    var tpPct = tpTotal ? Math.round(tpDone / tpTotal * 100) : 0;

    var invGases = (typeof invState !== 'undefined' && invState.gases) ? invState.gases : [];
    var lowGases = invGases.filter(function(g) { return typeof invGasIsLow === 'function' ? invGasIsLow(g) : false; });
    var activeOps = (typeof pnState !== 'undefined' && pnState.operators) ? pnState.operators.filter(function(o) { return o.active; }).length : 0;

    var html = '';
    if (has('kpi')) {
        var kpis = [
            { value: activeVehicles.length, label: 'Vehículos Activos', color: '#3b82f6' },
            { value: archivedToday.length, label: 'Liberados Hoy', color: '#10b981' },
            { value: tpPct, label: 'Plan Semanal', color: '#f59e0b', suffix: '%' },
            { value: pendingApproval, label: 'Pendiente Aprobación', color: '#8b5cf6' },
            { value: lowGases.length, label: 'Gases Bajos', color: lowGases.length > 0 ? '#ef4444' : '#10b981' },
            { value: activeOps, label: 'Operadores', color: '#06b6d4' }
        ];
        html += '<div class="pn-lab-kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap: var(--space-sm);margin-bottom: var(--space-md);">';
        kpis.forEach(function(k) {
            html += '<div class="tp-card anim-card-hover" style="text-align:center;padding: var(--space-md);">'
                + '<div class="pn-kpi-num" data-kpi-target="' + k.value + '" data-kpi-suffix="' + (k.suffix || '') + '" style="font-size:24px;font-weight:800;color:' + k.color + ';">0</div>'
                + '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + k.label + '</div></div>';
        });
        html += '</div>';
        // v16.4: línea compacta de calibración/mantenimiento (COP15-F11) — cross-módulo
        if (typeof invCalSummary === 'function' && typeof invMaintOverdue === 'function') {
            var calSum = invCalSummary();
            var mttoOverdue = invMaintOverdue().length;
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin:-6px 0 12px;padding:0 2px;">🔧 Calibración ' + calSum.pct + '% vigente · ' + calSum.vencidos + ' vencidos · ' + mttoOverdue + ' mtto pendientes</div>';
        }
    }
    if (has('pipeline')) {
        var pipeline = [
            { key: 'registered', label: 'Registrado', color: '#3b82f6', icon: '📝' },
            { key: 'in-progress', label: 'En Progreso', color: '#f59e0b', icon: '🔧' },
            { key: 'testing', label: 'En Prueba', color: '#8b5cf6', icon: '🧪' },
            { key: 'ready-release', label: 'Listo Liberar', color: '#10b981', icon: '🏁' }
        ];
        // v22.5 — Migrada a uiCard: mismo encabezado que HOY y el resto de la app, y
        // el colapso se recuerda por dispositivo.
        var pipeBody = '<div style="display:flex;gap:var(--space-xs);">';
        var pipeTotal = 0;
        pipeline.forEach(function(st) {
            var c = byStatus[st.key] || 0;
            pipeTotal += c;
            pipeBody += '<div style="flex:1;text-align:center;padding:var(--space-md) var(--space-xs);background:' + st.color + '10;border:1px solid ' + st.color + '30;border-radius:var(--radius-xl);"><div style="font-size:var(--fs-md);">' + st.icon + '</div><div style="font-size:var(--fs-lg);font-weight:800;color:' + st.color + ';">' + c + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + st.label + '</div></div>';
        });
        pipeBody += '</div>';
        html += uiCard({
            id: 'lo-pipeline', icon: '🔄', title: 'Pipeline de Vehículos', accent: 'cascade',
            body: pipeBody,
            count: { label: pipeTotal + (pipeTotal === 1 ? ' activo' : ' activos'),
                     tone: pipeTotal ? 'info' : 'neutral' }
        });
    }
    if (has('plan') && latestPlan) {
        var planBody = '<div class="tp-bar" style="height:8px;margin-bottom:var(--space-sm);"><div class="tp-bar-fill" style="width:' + tpPct + '%;background:' + (tpPct === 100 ? 'var(--tp-green)' : 'var(--tp-amber)') + ';"></div></div>';
        latestPlan.items.slice(0, 6).forEach(function(item) {
            var sd = item.desc.length > 50 ? item.desc.substring(0, 48) + '..' : item.desc;
            planBody += '<div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-xs) 0;border-bottom:1px solid var(--tp-border);"><span style="font-size: var(--fs-xs);color:' + (item.completed ? 'var(--tp-green)' : 'var(--tp-dim)') + ';' + (item.completed ? 'text-decoration:line-through;' : '') + '">' + escapeHtml(sd) + '</span><span style="font-size: var(--fs-xs);">' + (item.completed ? '✅' : '⏳') + '</span></div>';
        });
        if (latestPlan.items.length > 6) planBody += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);text-align:center;margin-top:var(--space-xs);">+' + (latestPlan.items.length - 6) + ' más...</div>';
        html += uiCard({
            id: 'lo-plan', icon: '📅', title: 'Plan Semanal Actual', accent: 'testplan',
            body: planBody,
            count: { label: tpDone + '/' + tpTotal + ' (' + tpPct + '%)',
                     tone: tpPct === 100 ? 'ok' : 'warn' }
        });
    }
    if (has('alerts') && typeof pnGetActiveAlerts === 'function') {
        var alerts = pnGetActiveAlerts();
        if (alerts.length) {
            var alertBody = '';
            alerts.slice(0, 5).forEach(function(a) {
                alertBody += '<div style="display:flex;gap:var(--space-sm);align-items:center;padding:var(--space-xs) 0;border-bottom:1px solid var(--tp-border);"><span style="font-size: var(--fs-xs);padding:var(--space-2xs) var(--space-sm);background:' + a.color + '20;color:' + a.color + ';border-radius:var(--radius-md);font-weight:700;">' + a.level + '</span><span style="font-size: var(--fs-xs);color:var(--tp-text);flex:1;">' + escapeHtml(a.message) + '</span></div>';
            });
            if (alerts.length > 5) alertBody += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);text-align:center;margin-top:var(--space-xs);">+' + (alerts.length - 5) + ' más...</div>';
            html += uiCard({
                id: 'lo-alerts', icon: '⚠️', title: 'Alertas Activas', accent: 'cop',
                body: alertBody,
                count: { label: String(alerts.length), tone: 'danger' }
            });
        }
    }
    var prevCached = _labOverviewCache[sectionsKey];
    var contentUnchanged = !!(prevCached && prevCached.html === html);
    el.innerHTML = html;
    _labOverviewCache[sectionsKey] = { key: memoKey, html: html };
    if (contentUnchanged) {
        // Same visual content as last render (only the memo key changed, e.g. an
        // unrelated save elsewhere bumped _labOverviewGen) — set final values,
        // don't replay the count-up/stagger animations.
        el.querySelectorAll('.pn-kpi-num[data-kpi-target]').forEach(function(numEl) {
            numEl.textContent = (parseFloat(numEl.dataset.kpiTarget) || 0) + (numEl.dataset.kpiSuffix || '');
        });
    } else {
        el.querySelectorAll('.pn-kpi-num[data-kpi-target]').forEach(function(numEl) {
            var t = parseFloat(numEl.dataset.kpiTarget) || 0;
            if (typeof animateCounter === 'function') animateCounter(numEl, t, { suffix: numEl.dataset.kpiSuffix || '' });
            else numEl.textContent = t + (numEl.dataset.kpiSuffix || '');
        });
        var grid = el.querySelector('.pn-lab-kpi-grid');
        if (grid && typeof animateStaggerChildren === 'function') animateStaggerChildren(grid, '.tp-card', 60);
    }
}


function pnRenderDashboard(el) {
    // Gather cross-module stats
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var activeVehicles = vehicles.filter(function(v) { return v.status !== 'archived'; });
    var archivedToday = vehicles.filter(function(v) {
        if (v.status !== 'archived' || !v.archivedAt) return false;
        return localDateStr(new Date(v.archivedAt)) === localToday();
    });

    var byStatus = {};
    activeVehicles.forEach(function(v) { byStatus[v.status] = (byStatus[v.status] || 0) + 1; });

    // v20: el avance de "el plan" es el de la semana EN CURSO (`tpWeekBoardRows`, LA
    // definición). `weeklyPlans[length-1]` era el último plan CREADO: generar la semana
    // que entra dejaba este indicador en 0/N y parecía que el laboratorio no había hecho
    // nada. Se conserva el último plan como respaldo si aún no hay uno de esta semana.
    var _lo = null;
    if (typeof tpWeekBoardRows === 'function') { try { _lo = tpWeekBoardRows({}); } catch (e) { _lo = null; } }
    var tpPlans = (typeof tpState !== 'undefined' && tpState.weeklyPlans) ? tpState.weeklyPlans : [];
    var latestPlan = (_lo && _lo.plan) ? _lo.plan : (tpPlans.length ? tpPlans[tpPlans.length - 1] : null);
    var tpDone = latestPlan ? (latestPlan.items || []).filter(function(i) { return i.completed; }).length : 0;
    var tpTotal = latestPlan ? (latestPlan.items || []).length : 0;
    var tpPct = tpTotal ? Math.round(tpDone / tpTotal * 100) : 0;

    var raToday = 0;

    var invGases = (typeof invState !== 'undefined' && invState.gases) ? invState.gases : [];
    // v21.1: criterio único (invGasIsLow), no PSI absolutos.
    var lowGases = invGases.filter(function(g) { return typeof invGasIsLow === 'function' ? invGasIsLow(g) : false; });

    var todayStr = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Current shift
    var hour = new Date().getHours();
    var shiftLabel = hour >= 6 && hour < 14 ? 'Turno 1 (06:00–14:00)' : hour >= 14 && hour < 22 ? 'Turno 2 (14:00–22:00)' : 'Turno 3 (22:00–06:00)';

    // Active operator from shift log
    var todayShifts = pnState.shiftLog.filter(function(s) {
        return s.date === localToday();
    });
    var currentShift = todayShifts.length > 0 ? todayShifts[todayShifts.length - 1] : null;

    var html = '';

    // Header card
    html += '<div class="tp-card" style="border:2px solid var(--tp-blue);background:linear-gradient(135deg,rgba(59,130,246,0.08),transparent);">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap: var(--space-md);">';
    html += '<div>';
    var authUser = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
    html += '<div style="font-size:18px;font-weight:800;color:var(--tp-blue);">Lab Dashboard</div>';
    html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);text-transform:capitalize;">' + todayStr + '</div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-amber);margin-top: var(--space-xs);">' + shiftLabel + '</div>';
    if (authUser) {
        html += '<div style="display:flex;align-items:center;gap: var(--space-sm);margin-top: var(--space-sm);">';
        html += '<span style="font-size: var(--fs-xs);color:#a78bfa;">Operador: <strong>' + authUser.name + '</strong></span>';
        html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">(cámbialo en la barra superior 👤)</span>';
        html += '</div>';
    }
    html += '</div>';
    if (currentShift) {
        html += '<div style="padding: var(--space-sm) var(--space-lg);background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius: var(--radius-xl);">';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Operador en turno</div>';
        html += '<div style="font-size:12px;font-weight:700;color:var(--tp-green);">' + currentShift.operator + '</div>';
        html += '</div>';
    }
    html += '</div></div>';

    // [v15-P1] Cross-module overview (single source: renderLabOverview)
    html += '<div id="pn-lab-overview"></div>';

    // ── Inventory Anomalies ──
    if (typeof invDetectAnomalies === 'function') {
        var anomalies = invDetectAnomalies();
        if (anomalies.length > 0) {
            html += '<div class="tp-card" style="border-left:3px solid #ef4444;">';
            html += '<div class="tp-card-title"><span style="color:var(--danger-text);">🚨 Anomalias de Gas (' + anomalies.length + ')</span>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="switchPlatform(\'inventory\')" style="font-size: var(--fs-sm);">Ver en Inventario</button></div>';
            anomalies.slice(0, 3).forEach(function(a) {
                var clr = a.severity === 'critica' ? '#ef4444' : '#f59e0b';
                html += '<div style="padding: var(--space-sm) var(--space-sm);margin-bottom: var(--space-2xs);border:1px solid ' + clr + '30;border-radius: var(--radius-lg);font-size: var(--fs-xs);color:' + clr + ';">';
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
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--tp-border);font-size: var(--fs-xs);">';
                html += '<span style="color:var(--tp-text);">' + p.gas.formula + ' ' + (p.gas.concNominal || '') + ' <span style="color:var(--tp-dim);">#' + p.gas.controlNo + '</span></span>';
                html += '<span style="font-weight:700;color:' + urgClr + ';">~' + p.pred.daysLeft + 'd <span style="font-size: var(--fs-xs);font-weight:400;">(' + p.pred.confidence + ')</span></span>';
                html += '</div>';
            });
            html += '</div>';
        }
    }

    // ── Soak Timer Status ──
    // v15.9: corregido al esquema REAL que escribe soakTimerStart ({endTime, totalMs,
    // vehicleId, vin}) — la versión anterior leía {active, start, duration} que nunca
    // se escribió, así que esta tarjeta jamás aparecía.
    var soakData = null;
    try { soakData = JSON.parse(localStorage.getItem('kia_soak_timer')); } catch(e) {}
    if (soakData && soakData.endTime && soakData.endTime > Date.now()) {
        var remainMs = soakData.endTime - Date.now();
        var hrs = Math.floor(remainMs / 3600000);
        var mins = Math.floor((remainMs % 3600000) / 60000);
        var pct = soakData.totalMs ? Math.round((1 - remainMs / soakData.totalMs) * 100) : 0;
        html += '<div class="tp-card" style="border:2px solid #8b5cf6;">';
        html += '<div class="tp-card-title"><span style="color:#8b5cf6;">🕐 Soak Timer Activo</span></div>';
        html += '<div style="text-align:center;padding: var(--space-sm);">';
        html += '<div style="font-size:24px;font-weight:800;color:#8b5cf6;">' + hrs + 'h ' + mins + 'm restantes</div>';
        html += '<div class="tp-bar" style="height:6px;margin:8px 0;"><div class="tp-bar-fill" style="width:' + Math.min(Math.max(pct, 0), 100) + '%;background:#8b5cf6;"></div></div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">VIN: ' + (soakData.vin || '?') + ' | ' + pct + '% completado</div>';
        html += '</div></div>';
    }

    // ── Firebase Sync Status ──
    if (typeof fbSync !== 'undefined' && fbSync.enabled) {
        var syncClr = fbSync.status === 'connected' ? '#10b981' : fbSync.status === 'error' ? '#ef4444' : '#f59e0b';
        var queueLen = (typeof fbOfflineQueue !== 'undefined') ? fbOfflineQueue.length : 0;
        html += '<div class="tp-card" style="border-left:3px solid ' + syncClr + ';">';
        html += '<div class="tp-card-title"><span>☁️ Firebase Sync</span>';
        html += '<span style="font-size: var(--fs-sm);padding: var(--space-2xs) var(--space-sm);border-radius: var(--radius-md);background:' + syncClr + '20;color:' + syncClr + ';font-weight:700;">' + fbSync.status.toUpperCase() + '</span></div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Estacion: ' + (fbSync.stationId || '?') + '</div>';
        if (queueLen > 0) html += '<div style="font-size: var(--fs-xs);color:var(--warn-text);margin-top: var(--space-xs);">' + queueLen + ' operaciones en cola offline</div>';
        if (fbSync.lastSync) html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top: var(--space-2xs);">Ultimo sync: ' + new Date(fbSync.lastSync).toLocaleTimeString('es-MX') + '</div>';
        html += '</div>';
    }

    // Weekly PDF Report button
    html += '<div class="tp-card" style="text-align:center;padding: var(--space-lg);">';
    html += '<button onclick="if(typeof generateWeeklyStatusPDF===\'function\')generateWeeklyStatusPDF();else showToast(\'Funcion no disponible\',\'error\');" ';
    html += 'style="padding: var(--space-md) var(--space-xl);background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius: var(--radius-xl);font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(99,102,241,0.3);">';
    html += '📄 Generar Reporte Semanal (PDF)</button>';
    html += ' <button onclick="window.print()" style="padding: var(--space-md) var(--space-xl);background:linear-gradient(135deg,#475569,#64748b);color:#fff;border:none;border-radius: var(--radius-xl);font-size:13px;font-weight:700;cursor:pointer;">🖨️ Imprimir Dashboard</button>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top: var(--space-sm);">Resumen cross-modulo: COP15, Plan, Resultados, Inventario</div>';
    html += '</div>';

    // Cross-module risk dashboard
    html += '<div id="labDashContainer"></div>';

    // Backup Health section
    html += '<div id="backupHealthContainer"></div>';

    el.innerHTML = html;

    // Cada sub-sección se aísla: el error boundary de tabCacheSwitch reemplaza el
    // innerHTML de TODA la pestaña, así que sin esto un fallo en una sola tarjeta
    // borra el dashboard completo. Con el try/catch el error queda contenido en su
    // propio contenedor y el resto del panel sigue usable.
    _pnSafeRender('pn-lab-overview', function(elx) { renderLabOverview(elx); });
    _pnSafeRender('labDashContainer', function(elx) {
        if (typeof renderLabDashboard === 'function') renderLabDashboard(elx);
    });
    // Backup health async (needs IndexedDB)
    _pnSafeRender('backupHealthContainer', function(elx) {
        if (typeof renderBackupStatus === 'function') renderBackupStatus(elx);
    });
}

/**
 * Renderiza una sub-sección del panel dentro de su propio try/catch.
 * Reutiliza _tabRenderError (app.js) para pintar el error sólo en ese contenedor.
 */
function _pnSafeRender(containerId, renderFn) {
    var elx = document.getElementById(containerId);
    if (!elx) return;
    try {
        renderFn(elx);
    } catch (err) {
        if (typeof _tabRenderError === 'function') _tabRenderError(elx, err);
        else elx.innerHTML = '<div style="color:var(--danger-text);font-size: var(--fs-sm);">Error: ' + String(err && err.message || err) + '</div>';
        if (typeof console !== 'undefined' && console.error) console.error('panel section "' + containerId + '" failed:', err);
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
    html += '<div class="tp-card-title" data-help="pn-users-help"><span>👥 Agregar Operador</span></div>';
    html += '<div style="display:flex;gap: var(--space-sm);flex-wrap:wrap;align-items:flex-end;">';
    html += '<div style="flex:1;min-width:150px;"><label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom: var(--space-2xs);">Nombre completo</label>';
    html += '<input type="text" id="pn-new-op-name" placeholder="Nombre Apellido" class="tp-input" style="width:100%;"></div>';
    html += '<div style="min-width:120px;"><label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom: var(--space-2xs);">Rol</label>';
    html += '<select id="pn-new-op-role" class="tp-select" style="width:100%;">' + roles.map(function(r) { return '<option value="' + r + '">' + r + '</option>'; }).join('') + '</select></div>';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnAddOperator()" style="padding: var(--space-sm) var(--space-lg);">+ Agregar</button>';
    html += '</div></div>';

    // Operators list — los tombstones (deleted) permanecen en el array para el sync
    // pero no se muestran; idx se conserva porque las acciones indexan pnState.operators.
    var visibleCount = operators.filter(function(o) { return !o.deleted; }).length;
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title"><span>👤 Operadores (' + visibleCount + ')</span></div>';

    if (visibleCount === 0) {
        html += '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);">No hay operadores registrados.</div>';
    } else {
        operators.forEach(function(op, idx) {
            if (op.deleted) return;
            var stats = opStats[op.name] || { registered: 0, released: 0, active: 0 };
            html += '<div style="display:flex;align-items:center;gap: var(--space-md);padding: var(--space-md);margin-bottom: var(--space-sm);background:' + (op.active ? 'var(--tp-card)' : 'rgba(100,116,139,0.05)') + ';border:1px solid var(--tp-border);border-radius: var(--radius-xl);' + (!op.active ? 'opacity:0.5;' : '') + '">';

            // Avatar
            var initials = authInitials(op.name);
            var avatarColors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
            var aColor = avatarColors[idx % avatarColors.length];
            html += '<div style="width:38px;height:38px;border-radius:50%;background:' + aColor + '20;color:' + aColor + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">' + escapeHtml(initials) + '</div>';

            // Info
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="display:flex;align-items:center;gap: var(--space-sm);">';
            html += '<span style="font-size:12px;font-weight:700;color:var(--tp-text);">' + escapeHtml(op.name) + '</span>';
            html += '<span style="font-size: var(--fs-xs);padding: var(--space-2xs) var(--space-sm);background:rgba(6,182,212,0.15);color:var(--info-text);border-radius: var(--radius-md);">' + escapeHtml(op.role || 'Técnico') + '</span>';
            if (!op.active) html += '<span style="font-size: var(--fs-xs);padding: var(--space-2xs) var(--space-sm);background:rgba(239,68,68,0.15);color:var(--danger-text);border-radius: var(--radius-md);">Inactivo</span>';
            html += (op.pinHash2 || op.pinHash) ? '<span style="font-size: var(--fs-xs);padding: var(--space-2xs) var(--space-sm);background:rgba(16,185,129,0.15);color:var(--ok-text);border-radius: var(--radius-md);">PIN ✓</span>' : '<span style="font-size: var(--fs-xs);padding: var(--space-2xs) var(--space-sm);background:rgba(239,68,68,0.15);color:var(--danger-text);border-radius: var(--radius-md);">Sin PIN</span>';
            html += '</div>';
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top: var(--space-2xs);">' + stats.registered + ' registrados | ' + stats.released + ' liberados | ' + stats.active + ' activos</div>';
            html += '</div>';

            // Actions
            html += '<div style="display:flex;gap: var(--space-xs);flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">';
            html += '<button onclick="pnSetOperatorPin(' + idx + ')" class="tp-btn tp-btn-ghost" style="font-size: var(--fs-sm);padding: var(--space-xs) var(--space-sm);" title="Configurar PIN">' + ((op.pinHash2 || op.pinHash) ? '🔑' : '🔒') + '</button>';
            html += '<button onclick="pnEditOperator(' + idx + ')" class="tp-btn tp-btn-ghost" style="font-size: var(--fs-sm);padding: var(--space-xs) var(--space-sm);">✏️</button>';
            html += '<button onclick="pnToggleOperator(' + idx + ')" class="tp-btn tp-btn-ghost" style="font-size: var(--fs-sm);padding: var(--space-xs) var(--space-sm);">' + (op.active ? '🚫' : '✅') + '</button>';
            html += '<button onclick="pnRemoveOperator(' + idx + ')" class="tp-btn tp-btn-ghost" style="font-size: var(--fs-sm);padding: var(--space-xs) var(--space-sm);color:var(--tp-red);">🗑</button>';
            html += '</div>';
            html += '</div>';
        });
    }

    html += '</div>';

    // Sync info
    html += '<div class="tp-card" style="padding: var(--space-md);text-align:center;">';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Los operadores se sincronizan automaticamente con los dropdowns de COP15.</div>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnSyncOperators()" style="font-size: var(--fs-sm);margin-top: var(--space-sm);">🔄 Sincronizar Dropdowns Ahora</button>';
    html += '</div>';

    el.innerHTML = html;
}

function pnAddOperator() {
    // Vista de respaldo (sin Alpine): delega en la capa única pnOp*.
    var name = document.getElementById('pn-new-op-name');
    var role = document.getElementById('pn-new-op-role');
    if (!name) return;
    var id = pnOpAdd(name.value, role ? role.value : 'Técnico');
    if (!id) { if (typeof shakeElement === 'function') shakeElement(name); return; }
    name.value = '';
    showToast('Operador agregado', 'success');
}

/**
 * Editor de operador: nombre + rol, con los permisos de cada rol a la vista.
 *
 * Reemplaza dos prompt() crudos encadenados que pedían el rol TECLEADO A MANO;
 * si se escribía mal, pnOpUpdate lo descartaba en silencio y el usuario creía
 * haberlo cambiado. Usa showModal({body, buttons}) (app.js, v18.2).
 */
function pnOpEditModal(opId) {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'editar operadores')) return;
    var op = pnOpFind(opId);
    if (!op) { showToast('Operador no encontrado', 'error'); return; }

    var permsOf = function(r) {
        if (typeof AUTH_ROLE_PERMS === 'undefined') return '';
        var l = AUTH_ROLE_PERMS[r] || [];
        return l.indexOf('*') !== -1 ? 'todos los permisos' : l.length + ' permisos';
    };
    var opts = PN_ROLES.map(function(r) {
        return '<option value="' + escapeHtml(r) + '"' + (r === op.role ? ' selected' : '') + '>'
             + escapeHtml(r) + ' — ' + permsOf(r) + '</option>';
    }).join('');
    // Quién puede administrar usuarios, para que se vea qué se está otorgando.
    var admins = PN_ROLES.filter(function(r) {
        return typeof authRoleHas === 'function' && authRoleHas(r, 'users.manage');
    }).join(', ');

    showModal({
        title: '✏️ Editar operador',
        body:
            '<div style="margin-bottom: var(--space-md);">' +
            '<label style="font-size:12px;font-weight:600;display:block;margin-bottom: var(--space-xs);">Nombre</label>' +
            '<input id="pn-edit-op-name" class="form-control" style="width:100%;box-sizing:border-box;" value="' + escapeHtml(op.name || '') + '">' +
            '</div>' +
            '<div style="margin-bottom: var(--space-md);">' +
            '<label style="font-size:12px;font-weight:600;display:block;margin-bottom: var(--space-xs);">Rol</label>' +
            '<select id="pn-edit-op-role" class="form-control" style="width:100%;box-sizing:border-box;">' + opts + '</select>' +
            '</div>' +
            '<div style="padding: var(--space-sm) var(--space-md);background:rgba(59,130,246,0.10);border:1px solid rgba(59,130,246,0.3);border-radius: var(--radius-xl);font-size:12px;line-height:1.5;">' +
            'El rol decide qué puede hacer esta persona. <b>' + escapeHtml(admins) + '</b> pueden además dar de alta operadores y cambiar roles.' +
            '<br>Las competencias certificadas otorgan permisos adicionales por separado.' +
            '</div>',
        buttons: [
            { label: 'Cancelar', cls: 'btn-secondary', onclick: function() { document.getElementById('globalModal').style.display = 'none'; } },
            { label: 'Guardar', cls: 'btn-primary', onclick: function() {
                var nEl = document.getElementById('pn-edit-op-name');
                var rEl = document.getElementById('pn-edit-op-role');
                var newName = nEl ? nEl.value.trim() : '';
                if (!newName) { showToast('El nombre es requerido', 'error'); return; }
                if (pnOpUpdate(op.id, { name: newName, role: rEl ? rEl.value : undefined })) {
                    showToast('Operador actualizado', 'success');
                }
                document.getElementById('globalModal').style.display = 'none';
            }}
        ]
    });
}

function pnEditOperator(idx) {
    var op = pnState.operators[idx];
    if (!op) return;
    var newName = prompt('Nombre:', op.name);
    if (newName === null) return;
    var newRole = prompt('Rol (' + PN_ROLES.join(', ') + '):', op.role || 'Técnico');
    if (pnOpUpdate(op.id, { name: newName, role: newRole || undefined })) {
        showToast('Operador actualizado', 'success');
    }
}

function pnToggleOperator(idx) {
    var op = pnState.operators[idx];
    if (op) pnOpSetActive(op.id);
}

function pnRemoveOperator(idx) {
    var op = pnState.operators[idx];
    if (op) pnOpDelete(op.id);
}

// LEGACY (v15.6): hash de 32 bits no criptográfico — solo se conserva para
// verificar PINs viejos una última vez y re-hashearlos a pinHash2 (SHA-256).
function pnHashPin(pin) {
    var hash = 0;
    var str = 'kia_pin_' + pin + '_salt';
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash = hash & hash; // Convert to 32bit integer
    }
    return 'pin_' + Math.abs(hash).toString(36);
}

// [v15.6] SHA-256 con sal aleatoria por operador (crypto.subtle, async).
// El pinHash legacy viajaba a Firestore y era fuerza-bruteable al instante.
function pnHashPin2(pin, salt) {
    if (!(window.crypto && crypto.subtle)) {
        // Solo dev en file:// — en producción (https) subtle siempre existe
        return Promise.resolve('legacy:' + pnHashPin(pin));
    }
    var data = new TextEncoder().encode(salt + '|' + pin);
    return crypto.subtle.digest('SHA-256', data).then(function(buf) {
        return _pnBufToHex(buf);
    });
}

// ══════════════════════════════════════════════════════════════════════
// [Fase 4] PIN v3 — PBKDF2-SHA256
// ══════════════════════════════════════════════════════════════════════
// ALCANCE REAL, para que nadie asuma de más: los hashes se sincronizan a un
// documento de Firestore legible por cualquiera que tenga la contraseña
// compartida del laboratorio. Con un espacio de 10^6 (6 dígitos), PBKDF2 no
// vuelve secreto el PIN — sube el costo de romperlo de milisegundos a horas.
// Es una reducción de riesgo, NO confidencialidad. El PIN sigue siendo
// identidad y atribución, no una barrera criptográfica.
// No dejan de sincronizarse a propósito: sin sincronizar, un operador sólo
// podría entrar en el dispositivo donde se le puso el PIN, y en un laboratorio
// de tablets compartidas eso no funciona.
var PN_PIN_KDF_ITER = 210000;
var PN_PIN_LEN_DEFAULT = 4;
var PN_PIN_LEN_PRIVILEGED = 6;

function _pnBufToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

/** Hash v3: PBKDF2-SHA256. Devuelve hex. */
function pnHashPin3(pin, salt, iter) {
    if (!(window.crypto && crypto.subtle && crypto.subtle.importKey)) {
        return Promise.resolve('legacy:' + pnHashPin(pin));
    }
    iter = iter || PN_PIN_KDF_ITER;
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits'])
        .then(function(key) {
            return crypto.subtle.deriveBits({
                name: 'PBKDF2', salt: enc.encode(salt), iterations: iter, hash: 'SHA-256'
            }, key, 256);
        })
        .then(_pnBufToHex);
}

/**
 * ¿Este rol necesita PIN de 6 dígitos? Los que pueden administrar usuarios o
 * aprobar pruebas sí — son las dos facultades con las que más daño se hace.
 */
function pnPinLenForRole(role) {
    var perms = (typeof AUTH_ROLE_PERMS !== 'undefined' && AUTH_ROLE_PERMS[role]) ? AUTH_ROLE_PERMS[role] : [];
    var privileged = perms.indexOf('*') !== -1 ||
                     perms.indexOf('users.manage') !== -1 ||
                     perms.indexOf('test.approve') !== -1;
    return privileged ? PN_PIN_LEN_PRIVILEGED : PN_PIN_LEN_DEFAULT;
}

/** PINs rechazados por triviales, independientemente de la longitud. */
function pnPinIsWeak(pin) {
    if (/^(\d)\1+$/.test(pin)) return 'Todos los dígitos iguales';
    var asc = true, desc = true;
    for (var i = 1; i < pin.length; i++) {
        if (+pin[i] !== +pin[i - 1] + 1) asc = false;
        if (+pin[i] !== +pin[i - 1] - 1) desc = false;
    }
    if (asc || desc) return 'Secuencia consecutiva';
    if (pin === '1234' || pin === '0000' || pin === '123456' || pin === '111111') return 'PIN demasiado común';
    return null;
}

function _pnRandomSalt() {
    var bytes = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach(function(_, i) { bytes[i] = Math.floor(Math.random() * 256); });
    return Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// Configura pinHash2 y BORRA el hash legacy (deja de sincronizarse el hash débil)
/**
 * Asigna PIN con el formato actual (v3, PBKDF2). Reutiliza el campo `pinHash2`
 * a propósito: así el merge, la UI y todo lo que ya lee ese campo siguen
 * funcionando sin cambios. La versión se distingue por `kdf`/`v`.
 */
function _pnAssignPin(op, pin) {
    var salt = _pnRandomSalt();
    return pnHashPin3(pin, salt, PN_PIN_KDF_ITER).then(function(hash) {
        op.pinHash2 = { salt: salt, hash: hash, kdf: 'PBKDF2-SHA256', iter: PN_PIN_KDF_ITER, v: 3 };
        op.pinLen = String(pin).length;
        op.pinSetAt = new Date().toISOString();
        delete op.pinHash;
        op.updatedAt = op.pinSetAt;
    });
}

/**
 * [Fase 4] Diálogo de PIN con confirmación, en vez de prompt().
 * El prompt() nativo muestra el PIN EN CLARO sobre una tablet compartida, no
 * permite enmascarar ni confirmar, y está bloqueado en algunos contextos PWA.
 * Devuelve Promise<string|null>.
 */
function pnPromptPin(op) {
    var need = pnPinLenForRole(op.role || 'Técnico');
    return new Promise(function(resolve) {
        var msg =
            '<div style="font-size:12px;color:var(--muted);margin-bottom: var(--space-md);">' +
            'PIN de <b>' + need + ' dígitos</b> para <b>' + escapeHtml(op.name) + '</b>' +
            (need === PN_PIN_LEN_PRIVILEGED
                ? '<br><span style="font-size: var(--fs-sm);">Su rol (' + escapeHtml(op.role || 'Técnico') + ') puede aprobar pruebas o administrar usuarios, por eso se exigen ' + need + ' dígitos.</span>'
                : '') +
            '</div>' +
            '<input id="_pn_pin1" type="password" inputmode="numeric" autocomplete="new-password" maxlength="' + need + '" ' +
            'placeholder="Nuevo PIN" style="width:100%;padding: var(--space-sm);border:1px solid var(--border);border-radius: var(--radius-xl);margin-bottom: var(--space-sm);font-size:16px;letter-spacing:4px;text-align:center;">' +
            '<input id="_pn_pin2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="' + need + '" ' +
            'placeholder="Confirmar PIN" style="width:100%;padding: var(--space-sm);border:1px solid var(--border);border-radius: var(--radius-xl);font-size:16px;letter-spacing:4px;text-align:center;">' +
            '<div id="_pn_pin_err" style="color:var(--danger);font-size: var(--fs-sm);min-height:14px;margin-top: var(--space-sm);"></div>';

        showModal({
            title: 'Configurar PIN', message: msg, type: 'info',
            confirmText: 'Guardar PIN', cancelText: 'Cancelar',
            onConfirm: function() {
                var a = (document.getElementById('_pn_pin1') || {}).value || '';
                var b = (document.getElementById('_pn_pin2') || {}).value || '';
                a = a.trim(); b = b.trim();
                var re = new RegExp('^\\d{' + need + '}$');
                if (!re.test(a)) { showToast('El PIN debe ser exactamente ' + need + ' dígitos numéricos', 'error'); return resolve(null); }
                if (a !== b) { showToast('Los PINs no coinciden', 'error'); return resolve(null); }
                var weak = pnPinIsWeak(a);
                if (weak) { showToast('PIN inseguro: ' + weak + '. Elige otro.', 'error'); return resolve(null); }
                resolve(a);
            },
            onCancel: function() { resolve(null); }
        });
        setTimeout(function() { var el = document.getElementById('_pn_pin1'); if (el) el.focus(); }, 60);
    });
}

function pnSetOperatorPin(idx) {
    if (typeof authRequire === 'function' && !authRequire('users.pin', 'asignar o resetear PINs')) return;
    var op = pnState.operators[idx];
    if (!op) return;
    pnPromptPin(op).then(function(pin) {
        if (!pin) return;
        return _pnAssignPin(op, pin).then(function() {
            pnSave();
            pnRender();
            if (typeof auditLog === 'function') auditLog('pn', 'operator_pin_set', { type: 'operator', id: op.id, label: op.name }, pin.length + ' dígitos');
            showToast('PIN configurado para ' + op.name, 'success');
        });
    });
}

// Verificación async: usa pinHash2; si solo existe el legacy, lo verifica y
// re-hashea automáticamente al primer login exitoso (migración transparente)
/**
 * Verifica el PIN contra CUALQUIERA de los tres formatos y, al acertar con uno
 * viejo, lo re-hashea al actual. La migración es progresiva y nadie queda
 * bloqueado: quien tenía PIN legacy o v2 entra igual y queda migrado a v3 en su
 * siguiente acceso. Mismo patrón que ya usaba la migración legacy→v2.
 */
function pnVerifyPinAsync(idx, pin) {
    var op = pnState.operators[idx];
    if (!op) return Promise.resolve(false);
    var h2 = op.pinHash2;
    if (h2 && h2.salt && h2.hash) {
        // v3 (PBKDF2) — formato actual, nada que migrar
        if (h2.kdf === 'PBKDF2-SHA256' || h2.v === 3) {
            return pnHashPin3(pin, h2.salt, h2.iter || PN_PIN_KDF_ITER)
                .then(function(h) { return h === h2.hash; });
        }
        // v2 (SHA-256 de una ronda) — verifica y migra a v3
        return pnHashPin2(pin, h2.salt).then(function(h) {
            if (h !== h2.hash) return false;
            return _pnAssignPin(op, pin).then(function() { pnSave(); return true; });
        });
    }
    if (op.pinHash) {
        // legacy (hash no criptográfico) — verifica y migra a v3
        var ok = op.pinHash === pnHashPin(pin);
        if (!ok) return Promise.resolve(false);
        return _pnAssignPin(op, pin).then(function() { pnSave(); return true; });
    }
    return Promise.resolve(false);
}

// Compat: verificación sync solo contra el hash legacy (llamadores viejos)
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
    var todayStr = localToday();
    var activeOps = pnState.operators.filter(function(o) { return o.active; }).map(function(o) { return o.name; });

    // Categories for log entries
    var categories = ['Inicio de turno', 'Prueba completada', 'Incidencia', 'Mantenimiento', 'Calibración', 'Observación', 'Fin de turno'];

    var html = '';

    // [R5-M6] Shift report button
    html += '<div style="display:flex;gap: var(--space-sm);margin-bottom: var(--space-md);">';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnGenerateShiftReport()" style="font-size: var(--fs-sm);">🔄 Cerrar Turno</button>';
    if (pnState.shiftReports && pnState.shiftReports.length > 0) {
        html += '<button class="tp-btn tp-btn-ghost" onclick="pnShowTurnoverOnLogin()" style="font-size: var(--fs-sm);">📋 Último Reporte</button>';
    }
    html += '</div>';

    // New entry form
    html += '<div class="tp-card" style="border:2px solid var(--tp-amber);background:linear-gradient(135deg,rgba(245,158,11,0.05),transparent);">';
    html += '<div class="tp-card-title" data-help="pn-shift-help"><span>📝 Nueva Entrada de Bitácora</span></div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap: var(--space-sm);margin-bottom: var(--space-sm);">';
    html += '<div><label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom: var(--space-2xs);">Operador</label>';
    var currentUserName = (typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? authGetCurrentUser().name : '';
    html += '<select id="pn-shift-operator" class="tp-select" style="width:100%;">';
    html += '<option value="">Seleccionar...</option>';
    activeOps.forEach(function(n) { html += '<option value="' + n + '"' + (n === currentUserName ? ' selected' : '') + '>' + n + '</option>'; });
    html += '</select></div>';

    html += '<div><label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom: var(--space-2xs);">Categoria</label>';
    html += '<select id="pn-shift-category" class="tp-select" style="width:100%;">';
    categories.forEach(function(c) { html += '<option value="' + c + '">' + c + '</option>'; });
    html += '</select></div>';
    html += '</div>';

    html += '<div style="margin-bottom: var(--space-sm);"><label style="font-size: var(--fs-xs);color:var(--tp-dim);display:block;margin-bottom: var(--space-2xs);">Notas / Descripcion</label>';
    html += '<textarea id="pn-shift-notes" class="tp-input" rows="3" placeholder="Describe la actividad, incidencia u observación..." style="width:100%;resize:vertical;font-family:inherit;"></textarea></div>';

    html += '<button class="tp-btn tp-btn-primary" onclick="pnAddShiftEntry()" style="width:100%;padding: var(--space-md);font-size:12px;">+ Registrar en Bitácora</button>';
    html += '</div>';

    // Today's entries
    var todayEntries = pnState.shiftLog.filter(function(s) { return s.date === todayStr; }).reverse();
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title"><span>📋 Hoy (' + todayEntries.length + ' entradas)</span>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnExportShiftLog()" style="font-size: var(--fs-sm);">📤 Exportar</button></div>';

    if (todayEntries.length === 0) {
        html += '<div style="text-align:center;padding: var(--space-2xl);color:var(--tp-dim);font-size: var(--fs-sm);">Sin entradas hoy. Registra el inicio de turno.</div>';
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

            html += '<div style="display:flex;gap: var(--space-md);padding:8px 0;border-bottom:1px solid var(--tp-border);">';
            html += '<div style="min-width:45px;font-size: var(--fs-xs);color:var(--tp-dim);padding-top: var(--space-2xs);">' + (entry.time || '') + '</div>';
            html += '<div style="font-size:16px;line-height:1;">' + icon + '</div>';
            html += '<div style="flex:1;">';
            html += '<div style="display:flex;gap: var(--space-sm);align-items:center;margin-bottom: var(--space-2xs);">';
            html += '<span style="font-size: var(--fs-sm);font-weight:700;color:var(--tp-text);">' + (entry.operator || '?') + '</span>';
            html += '<span style="font-size: var(--fs-xs);padding: var(--space-2xs) var(--space-sm);background:' + catColor + '20;color:' + catColor + ';border-radius: var(--radius-md);">' + entry.category + '</span>';
            html += '</div>';
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + (entry.notes || '') + '</div>';
            html += '</div>';
            html += '<button onclick="pnDeleteShiftEntry(\'' + entry.id + '\')" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size:12px;padding: var(--space-xs);flex-shrink:0;">×</button>';
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
            html += '<details style="margin-bottom: var(--space-sm);border:1px solid var(--tp-border);border-radius: var(--radius-lg);overflow:hidden;">';
            html += '<summary style="padding: var(--space-sm) var(--space-md);cursor:pointer;font-size: var(--fs-sm);font-weight:700;color:var(--tp-text);background:var(--tp-card);display:flex;justify-content:space-between;">';
            html += '<span>' + dateLabel + '</span><span style="color:var(--tp-dim);">' + entries.length + ' entradas</span></summary>';
            entries.reverse().forEach(function(entry) {
                html += '<div style="display:flex;gap: var(--space-sm);padding: var(--space-xs) var(--space-md);border-top:1px solid var(--tp-border);font-size: var(--fs-xs);">';
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
        date: localDateStr(now),
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
    var todayStr = localToday();
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
        // Desacuerdo liberador/aprobador (doble ciego) sin resolver
        if (v.testData && v.testData.gasResults && v.testData.gasResults.mismatch) {
            var mm = v.testData.gasResults.mismatch;
            alerts.push({ level: 'CRITICA', color: '#ef4444', message: 'VIN ' + (v.vin || '?').slice(-6) + ': desacuerdo liberador/aprobador en ' + ((mm.gases || []).join(', ') || 'gases') + ' — revisar', source: 'COP15' });
        }
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
    // v21.1: dos arreglos aquí. (1) El mensaje usaba `g.name`, campo que un cilindro NO
    // tiene, así que la alerta decía literalmente "Gas undefined en nivel CRITICO".
    // (2) Comparaba PSI absolutos (200/500) contra cilindros de cualquier tamaño; ahora
    // usa invGasLevel, que es LA definición del nivel y trabaja en % de la nominal.
    invGases.forEach(function(g) {
        if (!g.readings || g.readings.length === 0) return;
        if (typeof invGasLevel !== 'function') return;
        var lvl = invGasLevel(g);
        var etiqueta = (g.formula || g.gasType || 'Gas') + (g.controlNo ? ' #' + g.controlNo : '');
        if (lvl.status === 'critico') {
            alerts.push({ level: 'CRITICA', color: '#ef4444', message: etiqueta + ' en nivel CRITICO: ' + lvl.psi + ' psi (' + lvl.pct + '%)', source: 'Inventario' });
        } else if (lvl.status === 'bajo') {
            alerts.push({ level: 'ALTA', color: '#f59e0b', message: etiqueta + ' bajo: ' + lvl.psi + ' psi (' + lvl.pct + '%) — reordenar', source: 'Inventario' });
        }
    });

    // Check equipment calibrations due — v16.4: invCalStatus() es LA definición (antes leía el
    // campo inexistente eq.nextCalibration, así que esta alerta nunca se disparó; el campo real
    // es eq.nextCalDate).
    var invEquip = (typeof invState !== 'undefined' && invState.equipment) ? invState.equipment : [];
    if (typeof invCalStatus === 'function') {
        invEquip.forEach(function(eq) {
            var st = invCalStatus(eq);
            if (st.code === 'vencido') {
                alerts.push({ level: 'CRITICA', color: '#ef4444', message: 'Calibracion de ' + eq.name + ' VENCIDA hace ' + Math.abs(st.days) + ' dias', source: 'Inventario' });
            } else if (st.code === 'porvencer' && st.days <= 7) {
                alerts.push({ level: 'ALTA', color: '#f59e0b', message: 'Calibracion de ' + eq.name + ' vence en ' + st.days + ' dias', source: 'Inventario' });
            } else if (st.code === 'porvencer') {
                alerts.push({ level: 'MEDIA', color: '#06b6d4', message: 'Calibracion de ' + eq.name + ' vence en ' + st.days + ' dias', source: 'Inventario' });
            }
        });
    }

    // v16.4: mantenimiento preventivo (COP15-F11) vencido
    if (typeof invMaintOverdue === 'function') {
        invMaintOverdue().forEach(function(o) {
            alerts.push({ level: 'ALTA', color: '#f59e0b', message: 'Mantenimiento de ' + (o.asset ? o.asset.name : '?') + ' (' + o.act.desc + ') vencido desde semana ' + o.lastWeek, source: 'Mantenimiento' });
        });
    }

    // v16.6: pasos de proyectos vencidos o bloqueados
    if (typeof pnProjectsOverdueSteps === 'function') {
        pnProjectsOverdueSteps().forEach(function(o) {
            if (o.blocked && o.step.roadblock) {
                alerts.push({ level: 'ALTA', color: '#f59e0b', message: 'Proyecto "' + o.project.name + '": paso "' + o.step.title + '" bloqueado — ' + o.step.roadblock, source: 'Proyectos' });
            } else if (o.overdue) {
                alerts.push({ level: 'MEDIA', color: '#06b6d4', message: 'Proyecto "' + o.project.name + '": paso "' + o.step.title + '" vencido (' + o.step.targetDate + ')', source: 'Proyectos' });
            }
        });
    }

    // Cobertura del plan. v20: se pregunta por la semana EN CURSO en vez de mirar
    // `weeklyPlans[length-1]`, que es el último CREADO — podía ser una semana futura
    // recién generada (alerta que nunca salta) o una vieja que ya nadie usa.
    if (typeof tpWeekBoardRows === 'function') {
        var _wb = null;
        try { _wb = tpWeekBoardRows({}); } catch (e) { _wb = null; }
        if (_wb && !_wb.plan && (tpState.weeklyPlans || []).length > 0) {
            alerts.push({ level: 'MEDIA', color: '#f59e0b', message: 'No hay plan para la semana en curso — armar uno', source: 'Test Plan' });
        } else if (_wb && _wb.plan && _wb.kpis.riesgo > 0) {
            alerts.push({ level: 'MEDIA', color: '#f59e0b',
                message: _wb.kpis.riesgo + ' prueba(s) de esta semana en riesgo — ver Plan → Mi semana', source: 'Test Plan' });
        }
    }

    // Alarmas SPC (cartas I-MR del CoP): proceso fuera de control estadístico.
    // cop_validator.js carga después de panel.js — guardar con typeof.
    if (typeof copSpcScanAlarms === 'function') {
        try {
            copSpcScanAlarms().forEach(function(a) {
                alerts.push({ level: 'ALTA', color: '#ef4444', message: 'SPC: ' + a.gasLabel + ' fuera de control (' + (a.rule || '') + ') en ' + a.famLabel + ' — ver CoP → Control SPC', source: 'CoP SPC' });
            });
        } catch (e) {}
    }

    // v15.9: Consumo proyectado (modelo aprendido) — gas/gasolina insuficiente para pendientes
    if (typeof invForecastGasNeeds === 'function') {
        try {
            invForecastGasNeeds().forEach(function(f) {
                alerts.push({
                    level: f.severidad === 'critical' ? 'CRITICA' : 'ALTA',
                    color: f.severidad === 'critical' ? '#ef4444' : '#f59e0b',
                    message: 'Consumo: faltarán ~' + f.deficit + ' ' + f.unit + ' de ' + f.name + ' para las ' + f.pruebasPend + ' pruebas pendientes (' + (f.scope === 'semana' ? 'esta semana' : 'plan completo') + ')',
                    source: 'Consumo'
                });
            });
        } catch (e) {}
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

    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap: var(--space-sm);margin-bottom: var(--space-md);" data-help="pn-alerts-help">';
    html += '<div class="tp-card" style="text-align:center;padding: var(--space-lg);' + (critical > 0 ? 'border:2px solid #ef4444;' : '') + '">';
    html += '<div style="font-size:28px;font-weight:800;color:var(--danger-text);">' + critical + '</div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Criticas</div></div>';
    html += '<div class="tp-card" style="text-align:center;padding: var(--space-lg);' + (high > 0 ? 'border:2px solid #f59e0b;' : '') + '">';
    html += '<div style="font-size:28px;font-weight:800;color:var(--warn-text);">' + high + '</div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Altas</div></div>';
    html += '<div class="tp-card" style="text-align:center;padding: var(--space-lg);">';
    html += '<div style="font-size:28px;font-weight:800;color:var(--info-text);">' + medium + '</div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Medias</div></div>';
    html += '</div>';

    if (alerts.length === 0) {
        html += '<div class="tp-card" style="text-align:center;padding: var(--space-3xl);">';
        html += '<div style="font-size:40px;margin-bottom: var(--space-md);">✅</div>';
        html += '<div style="font-size:14px;font-weight:700;color:var(--tp-green);">Sin Alertas</div>';
        html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-top: var(--space-xs);">Todo el laboratorio opera con normalidad.</div>';
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
            var sourceIcons = { 'COP15': '🔬', 'Inventario': '📦', 'Test Plan': '📊', 'Proyectos': '🗂️' };
            html += '<div class="tp-card">';
            html += '<div class="tp-card-title"><span>' + (sourceIcons[source] || '📌') + ' ' + source + ' (' + sourceAlerts.length + ')</span></div>';

            sourceAlerts.forEach(function(a) {
                html += '<div style="display:flex;gap: var(--space-md);align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--tp-border);">';
                html += '<span style="font-size: var(--fs-sm);padding: var(--space-2xs) var(--space-sm);background:' + a.color + '20;color:' + a.color + ';border-radius: var(--radius-md);font-weight:800;white-space:nowrap;flex-shrink:0;">' + a.level + '</span>';
                html += '<span style="font-size: var(--fs-sm);color:var(--tp-text);">' + a.message + '</span>';
                html += '</div>';
            });
            html += '</div>';
        });
    }

    // Notification settings
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title"><span>🔔 Configuracion de Alertas</span></div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom: var(--space-sm);">Las alertas se generan automaticamente al abrir este panel.</div>';
    html += '<div style="display:flex;gap: var(--space-sm);">';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnRender()" style="flex:1;font-size: var(--fs-sm);">🔄 Actualizar Alertas</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="pnExportAlerts()" style="flex:1;font-size: var(--fs-sm);">📤 Exportar Reporte</button>';
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
    html += '<p style="color:var(--tp-dim);font-size: var(--fs-sm);margin:0 0 16px 0;">Correlaciones automáticas entre módulos para detectar patrones.</p>';

    // Gather data from all modules
    // v16.2: 'tests' leía un array que nunca se poblaba (siempre []) — la fuente viva de
    // pruebas registradas es tpState.testedList (mismo campo que usa el resto del Plan).
    var tests = (typeof tpState !== 'undefined' && tpState.testedList) ? tpState.testedList : [];
    var gasItems = [];
    var fuelItems = [];
    if (typeof invState !== 'undefined' && invState.items) {
        invState.items.forEach(function(it) {
            if (it.type === 'gas') gasItems.push(it);
            else if (it.type === 'fuel') fuelItems.push(it);
        });
    }
    // v16.2: tpState.plans/.records nunca existió en testplan.js (planData/weeklyPlans/
    // testedList son los campos vivos) — esta correlación siempre estuvo vacía.
    var cop15Vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];

    // ── Correlation 1: Gas Consumption vs Test Volume (weekly) ──
    html += '<div class="tp-card" style="margin-bottom: var(--space-md);padding: var(--space-md);">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">📊 Consumo de Gas vs Volumen de Pruebas</h4>';

    var weeklyData = {};
    tests.forEach(function(t) {
        if (!t.date) return;
        var d = parseLocalDate(t.date); // parse local: new Date('YYYY-MM-DD') es UTC y corre el día
        var weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        var wk = localDateStr(weekStart);
        if (!weeklyData[wk]) weeklyData[wk] = { tests: 0, gasUsed: 0 };
        weeklyData[wk].tests++;
    });

    // Cross-reference gas usage logs
    gasItems.forEach(function(g) {
        if (g.usageLog) {
            g.usageLog.forEach(function(log) {
                if (!log.date) return;
                var d = parseLocalDate(log.date);
                var weekStart = new Date(d);
                weekStart.setDate(d.getDate() - d.getDay());
                var wk = localDateStr(weekStart);
                if (!weeklyData[wk]) weeklyData[wk] = { tests: 0, gasUsed: 0 };
                weeklyData[wk].gasUsed += (log.psiUsed || 0);
            });
        }
    });

    var wkKeys = Object.keys(weeklyData).sort().slice(-12);
    if (wkKeys.length >= 2) {
        html += '<canvas id="pn-intel-gas-tests" height="200"></canvas>';
    } else {
        html += '<p style="color:var(--tp-dim);font-size: var(--fs-sm);">Datos insuficientes. Se necesitan al menos 2 semanas con pruebas y consumo de gas registrados.</p>';
    }
    html += '</div>';

    // ── Correlation 2: Fail Rate vs Gas Age ──
    html += '<div class="tp-card" style="margin-bottom: var(--space-md);padding: var(--space-md);">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">⚠️ Tasa de Fallo vs Antigüedad del Gas</h4>';

    var gasAgeGroups = { fresh: { pass: 0, fail: 0 }, mid: { pass: 0, fail: 0 }, old: { pass: 0, fail: 0 } };
    var gasDateMap = {};
    gasItems.forEach(function(g) {
        if (g.installDate || g.receivedDate) {
            gasDateMap[g.gasType || g.name] = new Date(g.installDate || g.receivedDate);
        }
    });

    // Nota: testedList no registra qué cilindro de gas se usó por prueba (gasType), así que
    // esta correlación queda sin datos hasta que ese vínculo se capture en algún módulo.
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
        html += '<p style="color:var(--tp-dim);font-size: var(--fs-sm);">Sin datos de correlación. Requiere pruebas con gasType asociado a cilindros con fecha de instalación.</p>';
    }
    html += '</div>';

    // ── Correlation 3: Plan Velocity vs Pipeline Load ──
    // v16.2: tpState.plans/.records nunca existió (leía siempre []) — la fuente viva de
    // planes semanales es tpState.weeklyPlans[].items[].completed.
    html += '<div class="tp-card" style="margin-bottom: var(--space-md);padding: var(--space-md);">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">🚀 Velocidad del Plan Semanal vs Carga Pendiente</h4>';

    var tpWeeklyPlans = (typeof tpState !== 'undefined' && tpState.weeklyPlans) ? tpState.weeklyPlans : [];
    var velocityData = [];
    tpWeeklyPlans.slice(-8).forEach(function(plan) {
        var items = plan.items || [];
        if (!items.length) return;
        var completedItems = items.filter(function(i) { return i.completed; }).length;
        var pendingItems = items.length - completedItems;
        var velocity = Math.round((completedItems / items.length) * 100);
        velocityData.push({
            name: plan.weekDate || plan.date || ('Semana ' + (velocityData.length + 1)),
            velocity: velocity,
            pipeline: pendingItems,
            completed: completedItems
        });
    });

    if (velocityData.length >= 1) {
        html += '<canvas id="pn-intel-velocity" height="200"></canvas>';
    } else {
        html += '<p style="color:var(--tp-dim);font-size: var(--fs-sm);">Sin planes de prueba activos. Cree un plan en Test Plan Manager para ver la correlación.</p>';
    }
    html += '</div>';

    // ── Summary Stats ──
    html += '<div class="tp-card" style="padding: var(--space-md);">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">📈 Resumen Cross-Module</h4>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap: var(--space-sm);">';

    var totalTests = tests.length;
    var totalGas = gasItems.length;
    var totalVehicles = cop15Vehicles.length;
    var failRate = totalTests > 0 ? ((tests.filter(function(t) { return t.result === 'FAIL' || t.status === 'fail'; }).length / totalTests) * 100).toFixed(1) : '0.0';

    html += '<div style="text-align:center;padding: var(--space-sm);background:rgba(59,130,246,0.1);border-radius: var(--radius-lg);"><div style="font-size:18px;font-weight:700;color:var(--info-text);">' + totalTests + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">Pruebas Totales</div></div>';
    html += '<div style="text-align:center;padding: var(--space-sm);background:rgba(16,185,129,0.1);border-radius: var(--radius-lg);"><div style="font-size:18px;font-weight:700;color:var(--ok-text);">' + totalVehicles + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">Vehículos COP15</div></div>';
    html += '<div style="text-align:center;padding: var(--space-sm);background:rgba(245,158,11,0.1);border-radius: var(--radius-lg);"><div style="font-size:18px;font-weight:700;color:var(--warn-text);">' + totalGas + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">Cilindros Gas</div></div>';
    html += '<div style="text-align:center;padding: var(--space-sm);background:rgba(239,68,68,0.1);border-radius: var(--radius-lg);"><div style="font-size:18px;font-weight:700;color:var(--danger-text);">' + failRate + '%</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">Tasa de Fallo</div></div>';
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

// ══════════════════════════════════════════════════════════════════════
// v22.0 — Selector de densidad (Datos → Sistema)
//
// El contenedor vive en la plantilla Alpine de pn-system (index.html), no en
// pnRenderSystemHealth: esa función está registrada en _pnGetRenderer pero NUNCA
// pinta esta pestaña, porque pn-system está en _pnAlpineTabs y Alpine gana. Se
// puebla desde pnSwitchTab, igual que el slot del banner de ayuda.
// ══════════════════════════════════════════════════════════════════════
var PN_DENSITY_OPTS = [
    ['compacto', 'Compacta', 'Más filas por pantalla. La escala anterior a v22.'],
    ['comodo',   'Cómoda',   'Recomendada. Más aire y texto más grande.'],
    ['amplio',   'Amplia',   'Para tablet o proyector. Todo más separado.']
];

function pnDensityRenderChoices() {
    var host = document.getElementById('pn-density-choices');
    if (!host) return;
    var cur = (typeof densityGet === 'function') ? densityGet() : 'comodo';
    var h = '';
    for (var i = 0; i < PN_DENSITY_OPTS.length; i++) {
        var o = PN_DENSITY_OPTS[i], on = (o[0] === cur);
        h += '<button type="button" onclick="pnSetDensity(\'' + o[0] + '\')"'
           + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
           + ' style="flex:1 1 180px;text-align:left;cursor:pointer;'
           + 'padding:var(--space-sm) var(--space-md);border-radius:var(--radius-xl);'
           + 'border:2px solid ' + (on ? 'var(--info-fill)' : 'var(--border)') + ';'
           + 'background:' + (on ? 'var(--info-bg)' : 'var(--surface)') + ';">'
           + '<div style="font-weight:700;font-size:var(--fs-sm);color:var(--text);">'
           + (on ? '● ' : '○ ') + o[1] + '</div>'
           + '<div style="font-size:var(--fs-xs);color:var(--muted);margin-top:var(--space-2xs);">'
           + o[2] + '</div></button>';
    }
    // [v23.1 · issue #109] La tira "Siguiente: ..." de Pruebas se apaga con su ✕ y
    // aquí es donde se vuelve a encender. Vive en el mismo bloque que la densidad
    // porque las dos son preferencias de ESTE dispositivo (uiPref, sin sincronizar).
    var nsOn = (typeof v7NextStepEnabled === 'function') ? v7NextStepEnabled() : true;
    h += '<div style="flex:1 1 100%;margin-top:var(--space-md);padding-top:var(--space-md);'
       + 'border-top:1px solid var(--border);">'
       + '<label class="u-hit" style="display:flex;align-items:center;gap:var(--space-sm);cursor:pointer;">'
       + '<input type="checkbox" ' + (nsOn ? 'checked' : '')
       + ' onchange="v7NextStepSetEnabled(this.checked)">'
       + '<span><span style="font-weight:700;font-size:var(--fs-sm);color:var(--text);">'
       + 'Tira de "siguiente paso" en Pruebas</span>'
       + '<span style="display:block;font-size:var(--fs-xs);color:var(--muted);">'
       + 'La franja de abajo que dice qué sigue con el vehículo abierto. Solo se ve dentro de Pruebas.'
       + '</span></span></label></div>';

    host.innerHTML = h;
    if (typeof cascadeInjectTooltips === 'function') { try { cascadeInjectTooltips(); } catch (e) {} }
}

function pnSetDensity(mode) {
    if (typeof densitySet !== 'function') return;
    densitySet(mode);
    pnDensityRenderChoices();
    if (typeof showToast === 'function') showToast('Densidad: ' + mode, 'success');
}

function pnRenderSystemHealth(el) {
    var html = '<div style="padding:12px 0;">';
    html += '<h3 style="color:var(--tp-amber);margin:0 0 12px 0;font-size:14px;">💾 Monitor de Salud del Sistema</h3>';

    // ── Version / publication date ──
    var _ver = (typeof getAppVersionInfo === 'function') ? getAppVersionInfo() : { version: '?', publishedES: null, isDev: true };
    html += '<div style="display:flex;align-items:center;gap: var(--space-md);flex-wrap:wrap;background:var(--glass-bg,#f7f7f9);border:1px solid var(--glass-border,#e5e7eb);border-radius: var(--radius-xl);padding: var(--space-md) var(--space-lg);margin-bottom: var(--space-lg);">'
        + '<span style="font-size:20px;">🏷️</span>'
        + '<div>'
        + '<div style="font-size:13px;font-weight:700;">KIA EmLab v' + _ver.version + '</div>'
        + '<div style="font-size: var(--fs-sm);color:var(--tp-dim,#6b7280);">'
        + (_ver.publishedES ? ('Publicada: ' + _ver.publishedES) : 'Versión de desarrollo (sin build)')
        + '</div>'
        + '</div>'
        + (_ver.build ? '<span style="margin-left:auto;font-size: var(--fs-xs);color:var(--tp-dim,#9ca3af);font-family:monospace;">build ' + _ver.build + '</span>' : '')
        + '</div>';

    // ── Storage breakdown (v18.1: itemizado, sin bucket ciego "Otros") ──
    var scan = pnStorageScan();
    var totalBytes = scan.total;
    var maxStorage = scan.max;
    var usedPct = scan.pct.toFixed(1);
    var barColor = totalBytes > maxStorage * 0.8 ? '#ef4444' : totalBytes > maxStorage * 0.5 ? '#f59e0b' : '#10b981';

    html += '<div class="tp-card" style="margin-bottom: var(--space-md);padding: var(--space-md);">';
    html += '<h4 style="color:var(--tp-text);font-size:12px;margin:0 0 8px 0;" data-help="pn_storage">📦 Uso de Almacenamiento</h4>';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom: var(--space-sm);">';
    html += '<span style="font-size: var(--fs-sm);color:var(--tp-dim);">' + _pnFormatBytes(totalBytes) + ' / 5 MB</span>';
    html += '<span style="font-size: var(--fs-sm);font-weight:700;color:' + barColor + ';">' + usedPct + '%</span>';
    html += '</div>';
    html += '<div style="width:100%;height:8px;background:var(--tp-border);border-radius: var(--radius-md);overflow:hidden;">';
    html += '<div style="width:' + Math.min(parseFloat(usedPct), 100) + '%;height:100%;background:' + barColor + ';border-radius: var(--radius-md);transition:width 0.3s;"></div>';
    html += '</div>';

    // Este límite es del NAVEGADOR, no de Firebase. Es la duda #1 cuando se llena.
    if (totalBytes > maxStorage * 0.8) {
        html += '<div style="margin-top: var(--space-md);padding: var(--space-sm) var(--space-md);background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.3);border-radius: var(--radius-xl);font-size: var(--fs-xs);color:var(--tp-text);line-height:1.5;">'
             +  '<b>⚠️ Estás en el límite del navegador.</b> Este espacio es de <b>este dispositivo</b>, no de Firebase: '
             +  'la app trabaja primero contra el almacenamiento local y la nube es la copia compartida. '
             +  'Cuando se llena, las capturas dejan de guardarse aunque la sincronización esté en verde.'
             +  '</div>';
    }

    // Botón de liberación — dice de antemano cuánto se recupera
    if (scan.reclaimable > 0) {
        html += '<button class="tp-btn" onclick="pnReclaimSpace()" style="margin-top: var(--space-md);width:100%;padding: var(--space-sm);background:var(--ok-bg,rgba(16,185,129,0.12));color:var(--ok-text);border:1px solid rgba(16,185,129,0.35);font-weight:600;">'
             +  '🧹 Liberar ' + _pnFormatBytes(scan.reclaimable) + ' regenerables</button>';
    }

    // Desglose completo, clave por clave
    html += '<div style="margin-top: var(--space-md);">';
    var TIER_CHIP = {
        core:   { t: 'dato', c: 'var(--tp-dim)' },
        cache:  { t: 'regenerable', c: 'var(--ok-text)' },
        review: { t: 'revisar', c: 'var(--warn-text)' }
    };
    scan.items.forEach(function(it) {
        if (it.bytes < 512) return; // el ruido de <0.5 KB no ayuda a decidir
        var pct = totalBytes > 0 ? ((it.bytes / totalBytes) * 100).toFixed(1) : '0.0';
        var chip = TIER_CHIP[it.tier] || TIER_CHIP.review;
        html += '<div style="display:flex;justify-content:space-between;align-items:center;gap: var(--space-sm);padding:4px 0;border-bottom:1px solid var(--tp-border);">';
        html += '<span style="font-size: var(--fs-xs);color:var(--tp-text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
             +  it.label
             +  ' <span style="color:' + chip.c + ';font-size:10px;">· ' + chip.t + '</span></span>';
        html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);flex-shrink:0;">' + _pnFormatBytes(it.bytes) + ' (' + pct + '%)';
        if (it.tier === 'review') {
            html += ' <button class="tp-btn" onclick="pnStorageDeleteKey(\'' + it.key.replace(/'/g, "\\'") + '\')" '
                 +  'style="padding: var(--space-2xs) var(--space-sm);font-size:10px;background:rgba(239,68,68,0.15);color:var(--danger-text);border:1px solid rgba(239,68,68,0.3);margin-left: var(--space-xs);">Borrar</button>';
        }
        html += '</span>';
        html += '</div>';
    });
    html += '</div></div>';

    // ── Data Aging ──
    html += '<div class="tp-card" style="margin-bottom: var(--space-md);padding: var(--space-md);">';
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

    // TP records aging — v16.2: tpState.plans/.records nunca existió; testedList es el
    // registro vivo de pruebas realizadas.
    if (typeof tpState !== 'undefined' && tpState.testedList) {
        var tp30 = 0, tp60 = 0, tp90 = 0, tpTotal = tpState.testedList.length;
        tpState.testedList.forEach(function(r) {
            if (!r.date) return;
            var age = (now - new Date(r.date + 'T12:00:00').getTime()) / 86400000;
            if (age > 90) tp90++;
            else if (age > 60) tp60++;
            else if (age > 30) tp30++;
        });
        agingData.push({ label: 'Test Plan (Pruebas registradas)', module: 'testplan', d30: tp30, d60: tp60, d90: tp90, total: tpTotal });
    }

    if (agingData.length > 0) {
        html += '<table style="width:100%;font-size: var(--fs-xs);border-collapse:collapse;">';
        html += '<tr style="color:var(--tp-dim);border-bottom:1px solid rgba(30,41,59,0.5);">';
        html += '<th style="text-align:left;padding: var(--space-xs);">Módulo</th>';
        html += '<th style="text-align:center;padding: var(--space-xs);">Total</th>';
        html += '<th style="text-align:center;padding: var(--space-xs);">30-60d</th>';
        html += '<th style="text-align:center;padding: var(--space-xs);">60-90d</th>';
        html += '<th style="text-align:center;padding: var(--space-xs);">>90d</th>';
        html += '</tr>';
        agingData.forEach(function(a) {
            html += '<tr style="color:#e2e8f0;border-bottom:1px solid rgba(30,41,59,0.2);">';
            html += '<td style="padding: var(--space-xs);">' + a.label + '</td>';
            html += '<td style="text-align:center;padding: var(--space-xs);">' + a.total + '</td>';
            html += '<td style="text-align:center;padding: var(--space-xs);color:var(--warn-text);">' + a.d30 + '</td>';
            html += '<td style="text-align:center;padding: var(--space-xs);color:var(--danger-text);">' + a.d60 + '</td>';
            html += '<td style="text-align:center;padding: var(--space-xs);color:var(--danger-text);font-weight:700;">' + a.d90 + '</td>';
            html += '</tr>';
        });
        html += '</table>';
    } else {
        html += '<p style="color:var(--tp-dim);font-size: var(--fs-sm);">Sin datos para analizar antigüedad.</p>';
    }
    html += '</div>';

    // ── Purge Tools ──
    html += '<div class="tp-card" style="margin-bottom: var(--space-md);padding: var(--space-md);">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">🗑️ Herramientas de Limpieza</h4>';
    html += '<p style="color:var(--tp-dim);font-size: var(--fs-sm);margin:0 0 10px 0;">Elimina datos antiguos para liberar espacio. Los datos se eliminan permanentemente.</p>';

    html += '<div style="display:flex;flex-wrap:wrap;gap: var(--space-sm);">';
    html += '<button class="tp-btn" onclick="pnPurgeOldData(\'cop15\', 90)" style="font-size: var(--fs-sm);padding: var(--space-sm) var(--space-md);background:rgba(239,68,68,0.15);color:var(--danger-text);border:1px solid rgba(239,68,68,0.3);">COP15 >90 días</button>';
    html += '<button class="tp-btn" onclick="pnPurgeOldData(\'testplan\', 90)" style="font-size: var(--fs-sm);padding: var(--space-sm) var(--space-md);background:rgba(239,68,68,0.15);color:var(--danger-text);border:1px solid rgba(239,68,68,0.3);">Test Plan >90 días</button>';
    html += '<button class="tp-btn" onclick="pnPurgeOldData(\'notes\', 90)" style="font-size: var(--fs-sm);padding: var(--space-sm) var(--space-md);background:rgba(239,68,68,0.15);color:var(--danger-text);border:1px solid rgba(239,68,68,0.3);">Notas >90 días</button>';
    html += '</div>';
    html += '</div>';

    // ── Performance ──
    html += '<div class="tp-card" style="padding: var(--space-md);">';
    html += '<h4 style="color:#e2e8f0;font-size:12px;margin:0 0 8px 0;">⚡ Rendimiento</h4>';
    var perfData = _pnMeasurePerformance();
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap: var(--space-sm);">';
    html += '<div style="text-align:center;padding: var(--space-sm);background:rgba(59,130,246,0.1);border-radius: var(--radius-lg);"><div style="font-size:16px;font-weight:700;color:var(--info-text);">' + perfData.lsKeys + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">Keys localStorage</div></div>';
    html += '<div style="text-align:center;padding: var(--space-sm);background:rgba(16,185,129,0.1);border-radius: var(--radius-lg);"><div style="font-size:16px;font-weight:700;color:var(--ok-text);">' + perfData.domNodes + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">DOM Nodes</div></div>';
    html += '<div style="text-align:center;padding: var(--space-sm);background:rgba(245,158,11,0.1);border-radius: var(--radius-lg);"><div style="font-size:16px;font-weight:700;color:var(--warn-text);">' + perfData.memoryMB + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">Memoria (MB)</div></div>';
    html += '<div style="text-align:center;padding: var(--space-sm);background:rgba(139,92,246,0.1);border-radius: var(--radius-lg);"><div style="font-size:16px;font-weight:700;color:#8b5cf6;">' + perfData.charts + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">Charts Activos</div></div>';
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

// ======================================================================
// [M-STORAGE] Inventario de localStorage — pnStorageScan() es LA definición
// ======================================================================
// Antes había DOS lazos ad-hoc (aquí y en el reporte del Centro de Reportes) que
// conocían 9 claves y metían TODO lo demás en un bucket ciego llamado "Otros".
// Cuando el laboratorio se quedó sin espacio, "Otros" era el 90% del uso y las
// tres Herramientas de Limpieza (COP15/Test Plan/Notas) no tocaban NADA de ese
// 90%: el técnico veía el problema pero no tenía cómo resolverlo.
//
// `tier` decide qué se puede borrar:
//   'core'   — dato del laboratorio. NUNCA se ofrece para borrar aquí.
//   'cache'  — se regenera solo o es preferencia local. Se purga sin preguntar.
//   'review' — pesado pero puede traer trabajo no enviado. Requiere consentimiento
//              explícito, uno por uno, con lo que se pierde escrito en la pantalla.
var PN_STORAGE_REGISTRY = [
    // ── Datos del laboratorio ──
    { key: 'kia_db_v11',            label: 'COP15 (Base de Datos)',   tier: 'core' },
    { key: 'kia_testplan_v1',       label: 'Test Plan Manager',        tier: 'core' },
    { key: 'kia_lab_inventory',     label: 'Consumibles / Equipos',    tier: 'core' },
    { key: 'kia_panel_v1',          label: 'Panel y Proyectos',        tier: 'core' },
    { key: 'kia_cop_v1',            label: 'CoP (validador)',          tier: 'core' },
    { key: 'kia_homolog_v1',        label: 'Homologación Europa',      tier: 'core' },
    { key: 'kia_audit_trail',       label: 'Historial de cambios',     tier: 'core' },
    { key: 'kia_manual_configs',    label: 'Configuraciones manuales', tier: 'core' },
    { key: 'kia_entity_notes',      label: 'Notas',                    tier: 'core' },
    { key: 'kia_regulations_v1',    label: 'Perfiles de Regulación',   tier: 'core' },
    { key: 'kia_templates',         label: 'Plantillas',               tier: 'core' },
    { key: 'kia_firebase_queue',    label: 'Cola de sincronización',   tier: 'core' },
    { key: 'kia_soak_timer',        label: 'Soak Timer',               tier: 'core' },
    // v21: ronda de lecturas a medias. Es 'core' porque contiene trabajo del turno
    // que todavía no se ha guardado — borrarla pierde el recorrido caminado.
    { key: 'kia_inv_round',         label: 'Ronda de lecturas en curso', tier: 'core' },
    // ── Sesión / identidad ──
    { prefix: 'kia_auth',           label: 'Sesión de acceso',         tier: 'core' },
    { key: 'kia_current_operator',  label: 'Operador actual',          tier: 'core' },
    { key: 'kia_users',             label: 'Operadores',               tier: 'core' },
    { key: 'kia_bug_settings',      label: 'Ajustes de reportes',      tier: 'core' },
    { prefix: 'kia_fb_',            label: 'Ajustes de sincronización', tier: 'core' },
    // ── Regenerable / preferencias ──
    { prefix: 'kia_cop15_draft_',   label: 'Borrador de captura',      tier: 'cache',
      note: 'Campos a medio llenar de una captura. Caducan a las 24 h.' },
    { key: 'kia_fb_prerestore_snapshot', label: 'Respaldo pre-restauración', tier: 'cache',
      note: 'Copia completa que permite deshacer una restauración de backup.' },
    { key: 'kia_merge_history',     label: 'Historial de fusiones',    tier: 'cache',
      note: 'Bitácora de fusiones entre dispositivos y el respaldo para deshacer la última. '
          + 'Los datos fusionados NO están aquí — ya viven en cada módulo.' },
    { key: 'kia_viewModes',         label: 'Modo de vista por módulo', tier: 'cache' },
    { key: 'kia_chart_configs',     label: 'Ajustes de gráficas',      tier: 'cache',
      note: 'Colores y tipo de cada gráfica. Vuelven a los valores por defecto.' },
    { key: 'kia_config_ranking',    label: 'Ranking de configuraciones', tier: 'cache',
      note: 'Cuáles configuraciones usas más, para ordenar la cascada.' },
    { key: 'kia_purpose_history',   label: 'Historial de propósitos',  tier: 'cache' },
    { key: 'kia_help_dismissed',    label: 'Ayudas descartadas',       tier: 'cache' },
    { prefix: 'kia_tour_done',      label: 'Tours completados',        tier: 'cache' },
    { key: 'kia_immersive_prefs',   label: 'Preferencias de pantalla', tier: 'cache' },
    { key: 'kia_ui_prefs',          label: 'Preferencias de interfaz', tier: 'cache',
      note: 'Densidad, "solo míos", alcance de búsqueda y tarjetas colapsadas. '
          + 'Al borrarla todo vuelve a sus valores por defecto.' },
    { prefix: 'kia_inv_active',     label: 'Pestaña activa',           tier: 'cache' },
    { prefix: 'kia_cop15_active',   label: 'Pestaña activa',           tier: 'cache' },
    { key: 'kia_last_module',       label: 'Última pestaña',           tier: 'cache' },
    { key: 'kia_last_operator',     label: 'Último operador',          tier: 'cache' },
    { key: 'kia_active_vehicle',    label: 'Vehículo activo',          tier: 'cache' },
    // ── Pesado, con contenido no recuperable ──
    { key: 'kia_bug_queue',         label: 'Reportes de bug sin enviar', tier: 'review',
      note: 'Reportes 🐞 que aún no llegaron a GitHub, con su captura de pantalla.' },
    { key: 'kia_config_csv_raw',    label: 'Catálogo CSV importado',   tier: 'review',
      note: 'El CSV que importaste. Al borrarlo vuelve el catálogo embebido de la app.' }
];

function _pnStorageEntryFor(key) {
    for (var i = 0; i < PN_STORAGE_REGISTRY.length; i++) {
        var e = PN_STORAGE_REGISTRY[i];
        if (e.key && e.key === key) return e;
        if (e.prefix && key.indexOf(e.prefix) === 0) return e;
    }
    return null;
}

/**
 * LA definición del uso de localStorage. Todo consumidor nuevo debe llamarla en
 * vez de recorrer localStorage por su cuenta.
 * @returns {{total:number, items:Array, reclaimable:number, reviewable:number, max:number, pct:number}}
 */
function pnStorageScan() {
    var items = [], total = 0, reclaimable = 0, reviewable = 0;
    var n = 0;
    try { n = localStorage.length; } catch(e) { n = 0; }
    for (var i = 0; i < n; i++) {
        var k = null, v = null, bytes = 0;
        try {
            k = localStorage.key(i);
            v = localStorage.getItem(k);
            bytes = v ? new Blob([v]).size : 0;
        } catch(e) { continue; }
        if (!k) continue;
        var entry = _pnStorageEntryFor(k);
        var tier = entry ? entry.tier : 'review';
        var label = entry ? entry.label : k;
        // Las claves con prefijo se listan una por una para poder borrarlas sueltas,
        // pero llevan el nombre legible del registro.
        items.push({
            key: k, label: label, tier: tier, bytes: bytes,
            note: entry ? entry.note : 'Clave no reconocida por la app.',
            known: !!entry
        });
        total += bytes;
        if (tier === 'cache') reclaimable += bytes;
        else if (tier === 'review') reviewable += bytes;
    }
    items.sort(function(a, b) { return b.bytes - a.bytes; });
    var max = 5 * 1024 * 1024;
    return {
        total: total, items: items, reclaimable: reclaimable, reviewable: reviewable,
        max: max, pct: (total / max) * 100
    };
}

/** Purga todo lo de tier 'cache'. No toca datos del laboratorio ni reportes sin enviar. */
function pnReclaimSpace() {
    var scan = pnStorageScan();
    var targets = scan.items.filter(function(it) { return it.tier === 'cache' && it.bytes > 0; });
    if (!targets.length) {
        showToast('No hay nada regenerable que liberar. Revisa la lista de abajo.', 'info');
        return;
    }
    var freed = targets.reduce(function(s, it) { return s + it.bytes; }, 0);
    showConfirm(
        'Se liberarán ' + _pnFormatBytes(freed) + ' de datos que la app vuelve a generar sola '
        + '(borradores caducados, respaldos de restauración, preferencias de pantalla).<br><br>'
        + '<b>No se toca ningún dato del laboratorio</b> ni los reportes de bug sin enviar.',
        function() {
            var okCount = 0;
            targets.forEach(function(it) {
                try { localStorage.removeItem(it.key); okCount++; } catch(e) {}
            });
            if (typeof auditLog === 'function') {
                auditLog('panel', 'storage_reclaim', { type: 'sistema', id: 'localStorage', label: 'Almacenamiento' },
                    'Liberados ' + _pnFormatBytes(freed) + ' en ' + okCount + ' claves regenerables');
            }
            showToast('✅ ' + _pnFormatBytes(freed) + ' liberados', 'success');
            // pn-system es una pestaña Alpine: se repinta con _dataVersion, no con pnRender.
            window.dispatchEvent(new CustomEvent('data:saved', { detail: { module: 'panel' } }));
            tabCacheInvalidate('pn', 'pn-system');
            if (typeof pnRender === 'function') pnRender();
        },
        { title: '🧹 Liberar espacio', type: 'warning', confirmText: 'Liberar ' + _pnFormatBytes(freed) }
    );
}

/** Borra UNA clave de tier 'review', con lo que se pierde escrito en la confirmación. */
function pnStorageDeleteKey(key) {
    var scan = pnStorageScan();
    var item = null;
    scan.items.forEach(function(it) { if (it.key === key) item = it; });
    if (!item) { showToast('Esa clave ya no existe', 'info'); return; }
    if (item.tier === 'core') { showToast('Ese es un dato del laboratorio — no se borra desde aquí', 'error'); return; }
    showConfirm(
        'Se borrará <b>' + item.label + '</b> (' + _pnFormatBytes(item.bytes) + ').<br><br>'
        + (item.note || '') + '<br><br>Esta acción no se puede deshacer.',
        function() {
            try { localStorage.removeItem(key); } catch(e) {}
            if (typeof auditLog === 'function') {
                auditLog('panel', 'storage_delete', { type: 'sistema', id: key, label: item.label },
                    'Liberados ' + _pnFormatBytes(item.bytes));
            }
            showToast('✅ ' + _pnFormatBytes(item.bytes) + ' liberados', 'success');
            window.dispatchEvent(new CustomEvent('data:saved', { detail: { module: 'panel' } }));
            tabCacheInvalidate('pn', 'pn-system');
            if (typeof pnRender === 'function') pnRender();
        },
        { title: 'Borrar ' + item.label, type: 'danger', confirmText: 'Borrar' }
    );
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
        } else if (module === 'testplan') {
            // v16.2: tpState.plans/.records nunca existió — este purgado siempre fue un
            // no-op silencioso. NO se conecta a testedList aquí a propósito: esos registros
            // alimentan el conteo "Probadas" y la cobertura de cada configuración (borrarlos
            // por antigüedad resetearía el cumplimiento de configs viejas). Si se necesita
            // purgar historial de Test Plan, debe ser una acción explícita y aparte.
            if (typeof showToast === 'function') showToast('Test Plan no tiene datos purgables por antigüedad de esta forma — el historial de pruebas alimenta la cobertura.', 'info');
            return;
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
    var html = '<div class="tp-card" style="padding: var(--space-lg);">';

    // Header with nav
    var monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom: var(--space-md);">';
    html += '<button onclick="_pnCalendarNav(-1)" class="btn-secondary" style="padding: var(--space-xs) var(--space-md);">←</button>';
    html += '<span style="font-size:14px;font-weight:800;color:var(--tp-text);">' + monthNames[_calMonth] + ' ' + _calYear + '</span>';
    html += '<div style="display:flex;gap: var(--space-sm);">';
    html += '<button onclick="_pnCalendarToday()" class="btn-secondary" style="padding: var(--space-xs) var(--space-md);font-size: var(--fs-sm);">Hoy</button>';
    html += '<button onclick="_pnCalendarNav(1)" class="btn-secondary" style="padding: var(--space-xs) var(--space-md);">→</button>';
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
            if (dayEvents.length > 3) html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">+' + (dayEvents.length - 3) + '</span>';
            html += '</div>';
        }
        html += '</div>';
    }

    html += '</div>';

    // Week summary
    var thisWeekEvents = _pnCalendarWeekSummary(events);
    if (thisWeekEvents) {
        html += '<div style="margin-top: var(--space-md);padding: var(--space-md);background:rgba(255,255,255,0.03);border-radius: var(--radius-xl);font-size: var(--fs-xs);color:var(--tp-dim);">';
        html += '<strong style="color:var(--tp-text);">Esta semana:</strong> ' + thisWeekEvents;
        html += '</div>';
    }

    // Legend
    html += '<div style="display:flex;gap: var(--space-md);margin-top: var(--space-md);flex-wrap:wrap;">';
    [{ color: '#ef4444', label: 'Vencido/Agotado' }, { color: '#f59e0b', label: 'Próximo' }, { color: '#3b82f6', label: 'Planificado' }, { color: '#10b981', label: 'Release/Completado' }].forEach(function(l) {
        html += '<div style="display:flex;align-items:center;gap: var(--space-xs);font-size: var(--fs-xs);color:var(--tp-dim);"><span style="width:8px;height:8px;border-radius:50%;background:' + l.color + ';display:inline-block;"></span> ' + l.label + '</div>';
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
            // v23: filtraba `g.status !== 'active'`, un estado que la app NUNCA
            // escribe — los reales son Stock / In use / Empty / Spare (CLAUDE.md v21).
            // O sea: esta rama entera llevaba rondas sin producir un solo evento.
            if (g.status === 'Empty' || !g.readings || g.readings.length < 2) return;
            var last2 = g.readings.slice(-2);
            var rate = (last2[0].psi || last2[0].value || 0) - (last2[1].psi || last2[1].value || 0);
            if (rate <= 0) return;
            var current = last2[1].psi || last2[1].value || 0;
            var daysLeft = current / rate;
            if (daysLeft > 60) return;
            var depDate = new Date();
            depDate.setDate(depDate.getDate() + Math.round(daysLeft));
            if (depDate >= monthStart && depDate <= monthEnd) {
                var dateStr = localDateStr(depDate);
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

    // Pruebas del plan semanal.
    //
    // v23: esta rama estaba MUERTA. Leía `plan.weekStart`, un campo que NINGÚN
    // generador escribe (todos escriben `weekDate`), así que el `return` de la
    // primera línea salía siempre y el calendario de Datos nunca mostró una sola
    // prueba planeada. Misma familia que `w.week` en el merge de sync (v20) y que
    // `eq.nextCalibration` en las alertas (v16.4): un campo inventado que nadie
    // verificó contra el que sí se escribe.
    //
    // Y se pinta el PLAN VIGENTE de cada semana (`tpWeekPlanFor`), no todos los
    // planes: una semana con el aceptado más tres propuestas viejas mostraba
    // cuatro veces las mismas pruebas.
    if (typeof tpState !== 'undefined' && Array.isArray(tpState.weeklyPlans)) {
        var _semanasVistas = {};
        tpState.weeklyPlans.forEach(function(p) {
            if (!p || !p.weekDate || _semanasVistas[p.weekDate]) return;
            _semanasVistas[p.weekDate] = true;
            var vig = (typeof tpWeekPlanFor === 'function') ? tpWeekPlanFor(p.weekDate) : null;
            var plan = vig ? vig.plan : p;
            var lunes = parseLocalDate(plan.weekDate);
            if (!lunes || isNaN(lunes.getTime())) return;
            var porDia = {};
            (plan.items || []).forEach(function(it) {
                if (it.completed || !it.testDay) return;
                porDia[it.testDay] = (porDia[it.testDay] || 0) + 1;
            });
            ['lun', 'mar', 'mie', 'jue', 'vie'].forEach(function(dk, i) {
                if (!porDia[dk]) return;
                var d = new Date(lunes); d.setDate(lunes.getDate() + i);
                if (d < monthStart || d > monthEnd) return;
                events.push({
                    date: localDateStr(d),
                    type: 'test_plan',
                    color: (vig && !vig.accepted) ? '#94a3b8' : '#3b82f6',
                    label: '🧪 ' + porDia[dk] + ' prueba(s)' + ((vig && !vig.accepted) ? ' (propuesta)' : ''),
                    module: 'Test Plan'
                });
            });
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
                        date: localDateStr(d),
                        type: 'release',
                        color: '#10b981',
                        label: '🏁 Listo: VIN ...' + (v.vin || '').slice(-6),
                        module: 'COP15'
                    });
                }
            }
        });
    }

    // v16.6: hitos de proyectos (pasos con fecha objetivo)
    if (typeof pnProjectMilestones === 'function') {
        events = events.concat(pnProjectMilestones(year, month));
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
        html += '<div style="display:flex;align-items:center;gap: var(--space-sm);padding:8px 0;border-bottom:1px solid #1e293b;">';
        html += '<span style="width:8px;height:8px;border-radius:50%;background:' + ev.color + ';flex-shrink:0;"></span>';
        html += '<div>';
        html += '<div style="font-size:12px;font-weight:600;color:var(--tp-text);">' + ev.label + '</div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + ev.module + '</div>';
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

    var weekStartStr = localDateStr(weekStart);
    var weekEndStr = localDateStr(weekEnd);

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

    // Pendientes. v20: de la semana EN CURSO (`tpWeekBoardRows`), no del último plan
    // creado — que podía ser el de la semana que entra y hacía que el turno de hoy
    // reportara pendientes que aún no tocan.
    if (typeof tpWeekBoardRows === 'function') {
        try {
            var _wb2 = tpWeekBoardRows({});
            if (_wb2 && _wb2.plan) data.pendingTests = _wb2.kpis.planeadas - _wb2.kpis.hechas;
        } catch (e) {}
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
    html += '<div style="text-align:center;margin-bottom: var(--space-lg);">';
    html += '<div style="font-size:12px;color:var(--tp-dim);">' + new Date(report.timestamp).toLocaleString('es-MX') + '</div>';
    html += '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-top: var(--space-2xs);">Operador: ' + escapeHtml(report.operator) + '</div>';
    html += '</div>';

    // KPIs
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap: var(--space-sm);margin-bottom: var(--space-lg);">';
    html += '<div class="tp-card" style="text-align:center;padding: var(--space-md);"><div style="font-size:20px;font-weight:800;color:var(--info-text);">' + report.vehiclesInProgress.length + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">En progreso</div></div>';
    html += '<div class="tp-card" style="text-align:center;padding: var(--space-md);"><div style="font-size:20px;font-weight:800;color:var(--warn-text);">' + report.pendingTests + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">Pruebas pend.</div></div>';
    html += '<div class="tp-card" style="text-align:center;padding: var(--space-md);"><div style="font-size:20px;font-weight:800;color:' + (report.gasesLow.length > 0 ? '#ef4444' : '#10b981') + ';">' + report.gasesLow.length + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">Gases bajos</div></div>';
    html += '</div>';

    // Vehicles in progress
    if (report.vehiclesInProgress.length > 0) {
        html += '<div style="margin-bottom: var(--space-md);"><div style="font-size: var(--fs-sm);font-weight:700;color:var(--tp-text);margin-bottom: var(--space-sm);">Vehículos activos:</div>';
        report.vehiclesInProgress.forEach(function(v) {
            var statusColor = v.status === 'testing' ? '#8b5cf6' : v.status === 'ready-release' ? '#10b981' : '#f59e0b';
            html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size: var(--fs-xs);border-bottom:1px solid #1e293b;">';
            html += '<span style="color:var(--tp-text);">...' + v.vin + ' ' + (v.model || '') + '</span>';
            html += '<span style="color:' + statusColor + ';font-weight:700;">' + v.status + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    // Gases low
    if (report.gasesLow.length > 0) {
        html += '<div style="margin-bottom: var(--space-md);"><div style="font-size: var(--fs-sm);font-weight:700;color:var(--danger-text);margin-bottom: var(--space-sm);">⚠ Gases con presión baja:</div>';
        report.gasesLow.forEach(function(g) {
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);padding:2px 0;">' + escapeHtml(g.controlNo) + ' (' + escapeHtml(g.gasType) + '): ' + g.psi + ' PSI</div>';
        });
        html += '</div>';
    }

    // Notes
    if (report.notes) {
        html += '<div style="margin-bottom: var(--space-md);padding: var(--space-sm);background:rgba(255,255,255,0.03);border-radius: var(--radius-lg);border:1px solid var(--tp-border);font-size: var(--fs-xs);color:var(--tp-dim);"><strong style="color:var(--tp-text);">Notas:</strong> ' + escapeHtml(report.notes) + '</div>';
    }

    html += '<div style="display:flex;gap: var(--space-sm);justify-content:center;margin-top: var(--space-md);">';
    html += '<button onclick="_pnShiftReportCopy(' + report.id.replace('sr_', '') + ')" class="btn-secondary" style="padding: var(--space-sm) var(--space-lg);font-size: var(--fs-sm);">📋 Copiar</button>';
    html += '<button onclick="closeModal()" class="btn-primary" style="padding: var(--space-sm) var(--space-lg);font-size: var(--fs-sm);">Cerrar</button>';
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


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [R6] Alpine.js Reactive Component — Panel Module                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

function panelAlpineComponent() {
    return {
        // ── State ──
        activeTab: pnState.activeTab,
        operators: pnState.operators,
        shiftLog: pnState.shiftLog,
        shiftReports: pnState.shiftReports || [],
        // v16.6: computed methods como activeAlerts()/calendarEvents() leen pnState (global, fuera
        // de la reactividad de Alpine) — sin una prop reactiva de por medio, Alpine nunca detecta
        // que deben re-evaluarse cuando algo cambia pnState en segundo plano (ej. un paso de
        // Proyectos vencido). _dataVersion se lee (sin usarse) dentro de esos métodos para que
        // Alpine SÍ los registre como dependencia; _bump() y el listener de 'data:saved' la avanzan.
        _dataVersion: 0,

        // v16.7: historial de versiones (Datos → Sistema) — copiados al x-data en vez de referenciar
        // los globales directo en el template, siguiendo el mismo patrón que el resto de este
        // componente (nunca globales sueltos en x-text/x-for).
        appVersion: APP_VERSION,
        versionHistory: APP_VERSION_HISTORY,
        appVersionInfo: function() { return getAppVersionInfo(); },

        // Form state — Users
        newOpName: '',
        newOpRole: 'Técnico',
        roles: ['Técnico', 'Supervisor', 'Ingeniero', 'Coordinador', 'Practicante'],
        // [Fase 3] Perfiles y matriz de habilidades
        usersView: 'list',        // 'list' | 'profile' | 'matrix'
        profileOpId: null,        // operador abierto en la vista de perfil
        skillLevels: PN_SKILL_LEVELS,
        levels: PN_LEVELS,
        // Estas tres son PROPIEDADES, no funciones, a propósito: con x-for sobre una
        // llamada a función Alpine reevalúa y reconstruye el subárbol, y los
        // <template x-if> anidados dentro de cada <tr> quedaban sin inicializar
        // (filas generadas, celdas vacías). Se refrescan con _bump().
        skillRows: pnSkillRows(false),
        archRows: pnSkillRows(true),
        cols: [],
        showArchived: false,      // sección "Anteriores", colapsada por defecto
        showColCfg: false,        // panel de configuración de columnas
        newSkillName: '',
        newSkillGroup: '',
        editSkillId: null,

        // Form state — Shift Log
        shiftOperator: '',
        shiftCategory: 'Observación',
        shiftNotes: '',
        categories: ['Inicio de turno', 'Prueba completada', 'Incidencia', 'Mantenimiento', 'Calibración', 'Observación', 'Fin de turno'],
        catColors: {
            'Inicio de turno': '#10b981', 'Prueba completada': '#3b82f6', 'Incidencia': '#ef4444',
            'Mantenimiento': '#f59e0b', 'Calibración': '#8b5cf6', 'Observación': '#64748b', 'Fin de turno': '#06b6d4'
        },
        catIcons: {
            'Inicio de turno': '🟢', 'Prueba completada': '✅', 'Incidencia': '🔴',
            'Mantenimiento': '🔧', 'Calibración': '📏', 'Observación': '📌', 'Fin de turno': '🔵'
        },

        // Calendar state
        calYear: new Date().getFullYear(),
        calMonth: new Date().getMonth(),
        monthNames: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
        dayNames: ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'],

        // Audit Trail state
        auditFilterMod: '',
        auditFilterUser: '',
        auditFilterFrom: '',
        auditFilterTo: '',
        auditPage: 0,

        // ── Init ──
        init: function() {
            var self = this;
            // Auto-select current user for shift log
            var authUser = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
            if (authUser) this.shiftOperator = authUser.name;
            // [Fase 3.5] Vistas derivadas de la matriz. Alpine puede inicializar ANTES
            // de que pnInit() cargue el roster desde localStorage (`operators` llega
            // vacío), así que además de sembrar aquí, se refresca en cada pn:refresh,
            // cambio de pestaña y data:saved. Sin esto la matriz queda sin columnas.
            this._bump();

            // Listen for tab switches and refreshes from legacy code
            window.addEventListener('pn:tab-switch', function(e) {
                self.activeTab = e.detail.tab;
                self._bump();
            });
            window.addEventListener('pn:refresh', function() {
                // Re-sync from pnState (in case legacy code modified it)
                self.operators = pnState.operators;
                self.shiftLog = pnState.shiftLog;
                self.shiftReports = pnState.shiftReports || [];
                self._bump();
            });
            // [R6] Listen for cross-module data changes (COP15, Inventory, etc.)
            window.addEventListener('data:saved', function() {
                // Force Alpine to re-evaluate computed properties (alerts, calendar, etc.)
                self._bump();
            });
        },

        // ── Computed — Users ──
        activeOperators: function() {
            return this.operators.filter(function(o) { return o.active; });
        },
        operatorStats: function(opName) {
            var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
            var stats = { registered: 0, released: 0, active: 0 };
            vehicles.forEach(function(v) {
                if ((v.registeredBy || '') === opName) {
                    if (v.status === 'archived') stats.released++;
                    else stats.active++;
                    stats.registered++;
                }
            });
            return stats;
        },
        avatarInitials: function(name) {
            return name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
        },
        avatarColor: function(idx) {
            var colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
            return colors[idx % colors.length];
        },

        // ── Methods — Users ──
        // [Fase 2] Expuesto para ocultar controles según el rol: x-show="can('users.manage')".
        // Ocultar es sólo UX — el candado real es el authRequire() al inicio de cada método.
        // _dataVersion se lee (sin usarse) para que Alpine registre esto como
        // dependencia: sin ella, promover a alguien NO reevaluaba los :disabled y
        // los campos seguían grises hasta recargar la página. Mismo patrón que
        // skillCatalogGrouped() y storageData().
        can: function(perm) {
            this._dataVersion;
            return (typeof authCan === 'function') ? authCan(perm) : true;
        },
        /** Cambia el rol desde el perfil. Repinta para que los :disabled se reevalúen
         *  al instante si te cambias el rol a ti mismo. */
        setProfileRole: function(opId, role) {
            if (pnOpUpdate(opId, { role: role })) {
                this._bump();
                showToast('Rol actualizado a ' + role, 'success');
            } else {
                this._bump();   // revierte el <select> al valor real
            }
        },
        /** Rol de quien está usando la app, para explicar por qué algo está bloqueado. */
        myRole: function() {
            this._dataVersion;
            var u = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
            return u ? (u.role || '—') : 'sin sesión';
        },
        /** Roles que sí pueden administrar usuarios — se nombran en el aviso. */
        rolesQuePueden: function(perm) {
            if (typeof AUTH_ROLE_PERMS === 'undefined') return '';
            return Object.keys(AUTH_ROLE_PERMS).filter(function(r) {
                return typeof authRoleHas === 'function' && authRoleHas(r, perm);
            }).join(' o ');
        },

        // ── [Fase 3] Perfiles y matriz de habilidades ──
        openProfile: function(opId) { this.profileOpId = opId; this.usersView = 'profile'; },
        closeProfile: function() { this.profileOpId = null; this.usersView = 'list'; },
        profileOp: function() {
            var id = this.profileOpId;
            if (id == null) return null;
            for (var i = 0; i < this.operators.length; i++) {
                if (String(this.operators[i].id) === String(id)) return this.operators[i];
            }
            return null;
        },
        archivedCount: function() { return pnSkillsArchived().length; },
        allOpsForCfg: function() {
            return (this.operators || []).filter(function(o) { return o.active && !o.deleted; });
        },
        colHidden: function(opId) { return pnMatrixCols().hidden.indexOf(String(opId)) !== -1; },
        groupsList: function() { return pnGroupOrder(); },
        skillCatalogFlat: function() { return pnSkillsFlat(); },
        /**
         * Catálogo AGRUPADO para el perfil del operador: [{group, items:[...]}].
         * La plantilla del perfil (index.html) hacía `x-for="grp in skillCatalog"`
         * contra una propiedad que no existía: Alpine lanzaba
         * "skillCatalog is not defined" y la tarjeta 🎓 Competencias salía vacía,
         * sin un solo selector — nadie podía cambiar el nivel de un operador
         * (y el nivel otorga permisos, ver la nota de seguridad de arriba).
         */
        skillCatalogGrouped: function() {
            this._dataVersion;   // v16.6: sin leerla Alpine no re-evalúa esto
            var groups = [], byName = {};
            pnSkillsFlat().forEach(function(s) {
                var g = s.group || 'General';
                if (!byName[g]) { byName[g] = { group: g, items: [] }; groups.push(byName[g]); }
                byName[g].items.push(s);
            });
            return groups;
        },

        addSkill: function() {
            var id = pnSkillAdd(this.newSkillName, this.newSkillGroup || 'General');
            if (id) { this.newSkillName = ''; this._bump(); showToast('Habilidad agregada', 'success'); }
        },
        renameSkill: function(skillId, name) { if (pnSkillUpdate(skillId, { name: name })) this._bump(); },
        setSkillGroup: function(skillId, group) { if (pnSkillUpdate(skillId, { group: group })) this._bump(); },
        setSkillCritical: function(skillId, v) { if (pnSkillUpdate(skillId, { critical: v })) this._bump(); },
        setSkillRecert: function(skillId, months) { if (pnSkillUpdate(skillId, { recertMonths: months })) this._bump(); },
        archiveSkill: function(skillId) {
            var self = this;
            var sk = pnSkillDef(skillId);
            if (!sk) return;
            showConfirmDialog({
                title: 'Archivar habilidad',
                message: '¿Archivar "' + sk.name + '"? Sale de la matriz activa pero TODAS las certificaciones se conservan y podrás reactivarla con su historial.',
                type: 'warning', confirmText: 'Archivar', cancelText: 'Cancelar'
            }).then(function(ok) {
                if (!ok) return;
                if (pnSkillArchive(skillId, true)) { self._bump(); showToast('Habilidad archivada (certificaciones conservadas)', 'info'); }
            });
        },
        restoreSkill: function(skillId) {
            if (pnSkillArchive(skillId, false)) { this._bump(); showToast('Habilidad reactivada con su historial', 'success'); }
        },
        moveSkill: function(skillId, dir) { if (pnSkillMove(skillId, dir)) this._bump(); },
        moveGroup: function(group, dir) { if (pnGroupMove(group, dir)) this._bump(); },
        toggleCol: function(opId) { if (pnMatrixToggleCol(opId)) this._bump(); },
        moveCol: function(opId, dir) { if (pnMatrixMoveCol(opId, dir)) this._bump(); },
        /** Refresca las vistas derivadas tras mutar pnState fuera de la reactividad de Alpine. */
        _bump: function() {
            this.skillRows = pnSkillRows(false);
            this.archRows = pnSkillRows(true);
            this.cols = pnMatrixOperators();
            this.operators = pnState.operators.slice();
            this._dataVersion++;
        },

        skillEntry: function(op, skillId) { return pnSkillOf(op, skillId); },
        skillLevelMeta: function(lvl) { return PN_SKILL_LEVELS[Math.max(0, Math.min(3, lvl || 0))]; },
        skillSummary: function(op) { return pnSkillSummary(op); },
        skillExpired: function(op, skillId) { return pnSkillExpired(pnSkillOf(op, skillId)); },
        skillSoon: function(op, skillId) { return pnSkillExpiringSoon(pnSkillOf(op, skillId)); },
        skillCoverage: function(skillId) { return pnSkillCoverage(skillId); },
        levelName: function(levelId) {
            for (var i = 0; i < PN_LEVELS.length; i++) { if (PN_LEVELS[i].id === levelId) return PN_LEVELS[i].name; }
            return 'Operador';
        },
        /** Ciclo 0→1→2→3→0 al tocar una celda de la matriz. */
        cycleSkill: function(opId, skillId) {
            if (typeof authRequire === 'function' && !authRequire('users.skills', 'certificar habilidades')) return;
            var op = null;
            for (var i = 0; i < this.operators.length; i++) {
                if (String(this.operators[i].id) === String(opId)) { op = this.operators[i]; break; }
            }
            if (!op) return;
            var cur = pnSkillOf(op, skillId).lvl || 0;
            pnOpSetSkill(opId, skillId, (cur + 1) % 4);
            this.operators = pnState.operators;   // refresca la vista de Alpine
        },
        setSkillLevel: function(opId, skillId, lvl) {
            if (typeof authRequire === 'function' && !authRequire('users.skills', 'certificar habilidades')) return;
            pnOpSetSkill(opId, skillId, parseInt(lvl, 10));
            this.operators = pnState.operators;
        },
        saveProfile: function(opId, field, value) {
            if (typeof authRequire === 'function' && !authRequire('users.manage', 'editar el perfil')) return;
            var patch = {}; patch[field] = value;
            pnOpUpdateProfile(opId, patch);
            this.operators = pnState.operators;
        },

        // Delegan en la capa única pnOp* (validación, permiso y auditoría allí)
        addOperator: function() {
            var id = pnOpAdd(this.newOpName, this.newOpRole);
            if (!id) return;
            this.newOpName = '';
            this._syncAndSave();
            showToast('Operador agregado', 'success');
        },
        editOperator: function(idx) {
            var op = this.operators[idx];
            if (!op) return;
            // Modal con selector de rol; antes eran dos prompt() y el rol se tecleaba.
            if (typeof pnOpEditModal === 'function') { pnOpEditModal(op.id); return; }
            var newName = prompt('Nombre:', op.name);
            if (newName === null) return;
            var newRole = prompt('Rol (' + this.roles.join(', ') + '):', op.role || 'Técnico');
            if (pnOpUpdate(op.id, { name: newName, role: newRole || undefined })) {
                this._syncAndSave();
                showToast('Operador actualizado', 'success');
            }
        },
        toggleOperator: function(idx) {
            var op = this.operators[idx];
            if (op && pnOpSetActive(op.id)) this._syncAndSave();
        },
        removeOperator: function(idx) {
            var self = this;
            var op = this.operators[idx];
            if (!op) return;
            pnOpDelete(op.id).then(function(ok) { if (ok) self._syncAndSave(); });
        },
        setOperatorPin: function(idx) {
            if (typeof authRequire === 'function' && !authRequire('users.pin', 'asignar o resetear PINs')) return;
            var op = this.operators[idx];
            if (!op) return;
            var self = this;
            // [Fase 4] Modal con confirmación y enmascarado en vez de prompt()
            pnPromptPin(op).then(function(pin) {
                if (!pin) return;
                return _pnAssignPin(op, pin).then(function() {   // v3: PBKDF2 (ver pnHashPin3)
                    self._syncAndSave();
                    if (typeof auditLog === 'function') auditLog('pn', 'operator_pin_set', { type: 'operator', id: op.id, label: op.name }, pin.length + ' dígitos');
                    showToast('PIN configurado para ' + op.name, 'success');
                });
            });
        },

        // ── Computed — Shift Log ──
        todayStr: function() { return localToday(); },
        todayEntries: function() {
            var today = this.todayStr();
            return this.shiftLog.filter(function(s) { return s.date === today; }).slice().reverse();
        },
        previousDays: function() {
            var today = this.todayStr();
            var prev = this.shiftLog.filter(function(s) { return s.date !== today; });
            var grouped = {};
            prev.forEach(function(e) { if (!grouped[e.date]) grouped[e.date] = []; grouped[e.date].push(e); });
            return Object.keys(grouped).sort().reverse().slice(0, 7).map(function(date) {
                return {
                    date: date,
                    label: new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }),
                    entries: grouped[date].slice().reverse()
                };
            });
        },

        // ── Methods — Shift Log ──
        addShiftEntry: function() {
            if (!this.shiftOperator) { showToast('Selecciona un operador', 'error'); return; }
            if (!this.shiftNotes || !this.shiftNotes.trim()) { showToast('Escribe una nota', 'error'); return; }
            var now = new Date();
            this.shiftLog.push({
                id: 'sl_' + Date.now(),
                date: localDateStr(now),
                time: now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                operator: this.shiftOperator,
                category: this.shiftCategory,
                notes: this.shiftNotes.trim(),
                timestamp: now.toISOString()
            });
            if (this.shiftLog.length > 500) this.shiftLog = this.shiftLog.slice(-500);
            this.shiftNotes = '';
            this._syncAndSave();
            showToast('Entrada registrada', 'success');
        },
        deleteShiftEntry: function(id) {
            var self = this;
            showConfirmDialog({ title: '⚠️ Eliminar entrada', message: '¿Eliminar esta entrada?', type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }).then(function(ok) {
                if (!ok) return;
                self.shiftLog = self.shiftLog.filter(function(s) { return s.id !== id; });
                pnState.shiftLog = self.shiftLog;
                pnSave();
            });
        },

        // ── Computed — Alerts ──
        activeAlerts: function() { void this._dataVersion; return pnGetActiveAlerts(); },
        alertsBySource: function() {
            var alerts = this.activeAlerts();
            var grouped = {};
            alerts.forEach(function(a) {
                if (!grouped[a.source]) grouped[a.source] = [];
                grouped[a.source].push(a);
            });
            var sourceIcons = { 'COP15': '🔬', 'Inventario': '📦', 'Test Plan': '📊', 'Proyectos': '🗂️' };
            return Object.keys(grouped).map(function(source) {
                return { source: source, icon: sourceIcons[source] || '📌', alerts: grouped[source] };
            });
        },
        alertCount: function(level) {
            return this.activeAlerts().filter(function(a) { return a.level === level; }).length;
        },

        // ── Computed — System Health ──
        storageData: function() {
            // v18.1: una sola definición del uso de almacenamiento (pnStorageScan);
            // antes este lazo era una copia con su propio bucket ciego "Otros".
            this._dataVersion;  // v16.6: sin leerla, Alpine no re-evalúa esto tras pnSave()
            var scan = pnStorageScan();
            var TIER = {
                core:   { label: 'dato',        color: 'var(--tp-dim)' },
                cache:  { label: 'regenerable', color: 'var(--ok-text)' },
                review: { label: 'revisar',     color: 'var(--warn-text)' }
            };
            var breakdown = scan.items
                .filter(function(it) { return it.bytes >= 512; })
                .map(function(it) {
                    var t = TIER[it.tier] || TIER.review;
                    return { key: it.key, label: it.label, bytes: it.bytes, tier: it.tier,
                             tierLabel: t.label, tierColor: t.color };
                });
            return { totalBytes: scan.total, breakdown: breakdown, usedPct: scan.pct.toFixed(1),
                reclaimable: scan.reclaimable,
                barColor: scan.total > scan.max * 0.8 ? '#ef4444' : scan.total > scan.max * 0.5 ? '#f59e0b' : '#10b981' };
        },
        agingData: function() {
            var now = Date.now();
            var data = [];
            if (typeof db !== 'undefined' && db.vehicles) {
                var c30 = 0, c60 = 0, c90 = 0;
                db.vehicles.forEach(function(v) {
                    var ts = v.timestamp || v.createdAt; if (!ts) return;
                    var age = (now - new Date(ts).getTime()) / 86400000;
                    if (age > 90) c90++; else if (age > 60) c60++; else if (age > 30) c30++;
                });
                data.push({ label: 'COP15 Vehículos', total: db.vehicles.length, d30: c30, d60: c60, d90: c90 });
            }
            // v16.2: tpState.plans/.records nunca existió; testedList es el registro vivo.
            if (typeof tpState !== 'undefined' && tpState.testedList) {
                var t30 = 0, t60 = 0, t90 = 0, tTotal = tpState.testedList.length;
                tpState.testedList.forEach(function(r) {
                    if (!r.date) return;
                    var age = (now - new Date(r.date + 'T12:00:00').getTime()) / 86400000;
                    if (age > 90) t90++; else if (age > 60) t60++; else if (age > 30) t30++;
                });
                data.push({ label: 'Test Plan (Pruebas registradas)', total: tTotal, d30: t30, d60: t60, d90: t90 });
            }
            return data;
        },
        perfData: function() { return _pnMeasurePerformance(); },
        formatBytes: function(b) { return _pnFormatBytes(b); },
        purgeOldData: function(module, maxDays) { pnPurgeOldData(module, maxDays); },

        // ── Computed — Calendar ──
        calendarMonthLabel: function() { return this.monthNames[this.calMonth] + ' ' + this.calYear; },
        calendarEvents: function() { void this._dataVersion; return _pnCollectCalendarEvents(this.calYear, this.calMonth); },
        calendarGrid: function() {
            var firstDay = new Date(this.calYear, this.calMonth, 1);
            var lastDay = new Date(this.calYear, this.calMonth + 1, 0);
            var startWeekday = (firstDay.getDay() + 6) % 7;
            var today = new Date();
            var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
            var events = this.calendarEvents();
            var cells = [];
            for (var e = 0; e < startWeekday; e++) cells.push({ empty: true });
            for (var day = 1; day <= lastDay.getDate(); day++) {
                var dateStr = this.calYear + '-' + String(this.calMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
                var dayEvents = events.filter(function(ev) { return ev.date === dateStr; });
                var dots = [];
                var shown = {};
                dayEvents.slice(0, 3).forEach(function(ev) {
                    if (!shown[ev.color]) { dots.push(ev.color); shown[ev.color] = true; }
                });
                cells.push({ day: day, dateStr: dateStr, isToday: dateStr === todayStr, events: dayEvents, dots: dots, extra: dayEvents.length > 3 ? dayEvents.length - 3 : 0 });
            }
            return cells;
        },
        calendarWeekSummary: function() { return _pnCalendarWeekSummary(this.calendarEvents()); },
        navCalendar: function(dir) {
            this.calMonth += dir;
            if (this.calMonth > 11) { this.calMonth = 0; this.calYear++; }
            if (this.calMonth < 0) { this.calMonth = 11; this.calYear--; }
        },
        calendarToday: function() { var d = new Date(); this.calYear = d.getFullYear(); this.calMonth = d.getMonth(); },
        calendarDayClick: function(dateStr) { _pnCalendarDayClick(dateStr); },

        // ── Helpers ──
        // Metía el PROXY REACTIVO de Alpine dentro de pnState. A partir de ahí todo
        // el código clásico (pnOpFind, _authFindOperator, _fbMergeOperators y el
        // JSON.stringify de pnSave — que serializa los hashes de PIN) trabajaba a
        // través del proxy, y `this.operators = pnState.operators` dejaba de disparar
        // repintado porque el valor ya era idéntico: reactividad rota SIN errores.
        //
        // `operators` ya NO se copia de vuelta: los pnOp* mutan pnState directamente
        // y llaman _pnOpAfterChange() (guarda + sincroniza + repinta). Las listas de
        // bitácora sí se editan desde Alpine, así que se desenvuelven a objetos planos.
        _syncAndSave: function() {
            pnState.shiftLog = (this.shiftLog || []).map(function(e) { return Object.assign({}, e); });
            pnState.shiftReports = (this.shiftReports || []).map(function(e) { return Object.assign({}, e); });
            pnSave();
            pnSyncOperators();
        },
        refreshAlerts: function() { pnRender(); },
        exportAlerts: function() { pnExportAlerts(); },
        exportShiftLog: function() { pnExportShiftLog(); },
        generateShiftReport: function() { pnGenerateShiftReport(); },
        showTurnoverOnLogin: function() { pnShowTurnoverOnLogin(); },
        syncOperators: function() { pnSyncOperators(); showToast('Dropdowns sincronizados', 'success'); },

        calendarLegend: [
            { color: '#ef4444', label: 'Vencido/Agotado' },
            { color: '#f59e0b', label: 'Próximo' },
            { color: '#3b82f6', label: 'Planificado' },
            { color: '#10b981', label: 'Release/Completado' }
        ],

        // ── Audit Trail computed & methods ──
        get auditTrail() {
            return (typeof auditGetTrail === 'function') ? auditGetTrail().reverse() : [];
        },
        get auditUsers() {
            var users = {};
            this.auditTrail.forEach(function(e) { if (e.user && e.user.name) users[e.user.name] = true; });
            return Object.keys(users).sort();
        },
        get filteredAudit() {
            var self = this;
            return this.auditTrail.filter(function(e) {
                if (self.auditFilterMod && e.mod !== self.auditFilterMod) return false;
                if (self.auditFilterUser && (!e.user || e.user.name !== self.auditFilterUser)) return false;
                if (self.auditFilterFrom && e.ts.slice(0, 10) < self.auditFilterFrom) return false;
                if (self.auditFilterTo && e.ts.slice(0, 10) > self.auditFilterTo) return false;
                return true;
            });
        },
        get filteredAuditPage() {
            return this.filteredAudit.slice(this.auditPage * 50, (this.auditPage + 1) * 50);
        },
        auditExport: function() {
            if (typeof auditExportCSV === 'function') auditExportCSV();
        }
    };
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-B1] KPI EXECUTIVE TAB                                          ║
// ╚══════════════════════════════════════════════════════════════════════╝

function pnRenderExecutive(el) {
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var now = new Date();
    var todayStr = localToday();
    var weekAgo = localDateStr(new Date(now - 7 * 86400000));
    var monthAgo = localDateStr(new Date(now - 30 * 86400000));

    // Throughput metrics (día local del timestamp de archivado)
    var _archDay = function(v) { return localDateStr(new Date(v.archivedAt)); };
    var archivedToday = vehicles.filter(function(v) { return v.status === 'archived' && v.archivedAt && _archDay(v) === todayStr; }).length;
    var archivedWeek = vehicles.filter(function(v) { return v.status === 'archived' && v.archivedAt && _archDay(v) >= weekAgo; }).length;
    var archivedMonth = vehicles.filter(function(v) { return v.status === 'archived' && v.archivedAt && _archDay(v) >= monthAgo; }).length;
    var activeCount = vehicles.filter(function(v) { return v.status !== 'archived'; }).length;

    // v16.2: Compliance scorecard — misma definición de cobertura que el badge del Plan y
    // la tarjeta HOY (% de configs vigentes al día vía tpCoverageSummary). Antes esta
    // pantalla calculaba su propio % por familias (tpBuildFamilies), que casi nunca
    // coincidía con el badge del Plan — se conserva como métrica secundaria de "volumen".
    var tpCoverage = 0, tpVolCoverage = null;
    if (typeof tpCoverageSummary === 'function') {
        tpCoverage = tpCoverageSummary().pct;
    }
    if (typeof tpState !== 'undefined' && typeof tpBuildFamilies === 'function') {
        var families = tpBuildFamilies();
        var totalReq = 0, totalTested = 0;
        families.forEach(function(f) { totalReq += f.totalRequired; totalTested += f.totalTested; });
        tpVolCoverage = totalReq > 0 ? Math.round((totalTested / totalReq) * 100) : 100;
    }

    // Cpk alerts
    // Resource utilization
    var gasUtilization = 'N/A';
    if (typeof invState !== 'undefined' && invState.gases) {
        var inUse = invState.gases.filter(function(g) { return g.status === 'In use'; });
        var totalGas = invState.gases.length;
        gasUtilization = totalGas > 0 ? Math.round((inUse.length / totalGas) * 100) + '%' : 'N/A';
    }

    var html = '';
    html += '<div class="v7-exec-grid">';

    // KPI Cards
    html += '<div class="v7-exec-kpi"><div class="v7-exec-kpi-value">' + archivedToday + '</div><div class="v7-exec-kpi-label">Liberados Hoy</div></div>';
    html += '<div class="v7-exec-kpi"><div class="v7-exec-kpi-value">' + archivedWeek + '</div><div class="v7-exec-kpi-label">Liberados Semana</div></div>';
    html += '<div class="v7-exec-kpi"><div class="v7-exec-kpi-value">' + archivedMonth + '</div><div class="v7-exec-kpi-label">Liberados Mes</div></div>';
    html += '<div class="v7-exec-kpi"><div class="v7-exec-kpi-value">' + activeCount + '</div><div class="v7-exec-kpi-label">En Proceso</div></div>';
    html += '</div>';

    // Compliance Scorecard
    html += '<div class="tp-card"><div class="tp-card-title" data-help="pn-executive-help"><span>Compliance Scorecard</span></div>';
    html += '<div class="v7-exec-compliance">';
    html += '<div class="v7-exec-metric"><span>Cobertura Plan de Pruebas (configs al día)</span>';
    html += '<div class="v7-exec-bar"><div class="v7-exec-bar-fill" style="width:' + tpCoverage + '%;background:' + (tpCoverage >= 80 ? 'var(--success)' : tpCoverage >= 50 ? 'var(--warning)' : 'var(--danger)') + ';"></div></div>';
    html += '<span class="v7-exec-pct">' + tpCoverage + '%</span></div>';
    if (tpVolCoverage !== null) html += '<div class="v7-exec-metric"><span style="opacity:0.7;">Pruebas cumplidas (por volumen)</span><span style="opacity:0.7;">' + tpVolCoverage + '%</span></div>';

    html += '<div class="v7-exec-metric"><span>Utilizacion de Gas</span><span>' + gasUtilization + '</span></div>';
    html += '</div></div>';

    // [V7-B3] Predictive Resource Planner
    html += '<div class="tp-card"><div class="tp-card-title"><span>Proyeccion de Recursos</span></div>';
    if (typeof invState !== 'undefined' && invState.gases) {
        var predictions = [];
        invState.gases.filter(function(g) { return g.status === 'In use'; }).forEach(function(g) {
            if (!g.readings || g.readings.length < 2) return;
            // Calculate consumption rate from last readings
            var recent = g.readings.slice(-5);
            if (recent.length < 2) return;
            var totalDrop = recent[0].psi - recent[recent.length - 1].psi;
            var daySpan = (new Date(recent[recent.length - 1].date) - new Date(recent[0].date)) / 86400000;
            if (daySpan <= 0) daySpan = 1;
            var dailyRate = totalDrop / daySpan;
            var currentPsi = recent[recent.length - 1].psi;
            var daysLeft = dailyRate > 0 ? Math.round(currentPsi / dailyRate) : 999;
            if (daysLeft < 30) {
                predictions.push({
                    formula: g.formula,
                    controlNo: g.controlNo,
                    daysLeft: daysLeft,
                    currentPsi: currentPsi,
                    dailyRate: dailyRate.toFixed(1)
                });
            }
        });
        if (predictions.length > 0) {
            predictions.sort(function(a, b) { return a.daysLeft - b.daysLeft; });
            predictions.forEach(function(p) {
                var urgency = p.daysLeft < 7 ? 'var(--danger)' : p.daysLeft < 14 ? 'var(--warning)' : 'var(--info)';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">';
                html += '<span>' + p.formula + ' #' + p.controlNo + '</span>';
                html += '<span style="color:' + urgency + ';font-weight:600;">' + p.daysLeft + ' dias restantes (' + p.dailyRate + ' PSI/dia)</span>';
                html += '</div>';
            });
        } else {
            html += '<div style="color:var(--muted);padding: var(--space-md);text-align:center;">Sin alertas de agotamiento proximo</div>';
        }
    } else {
        html += '<div style="color:var(--muted);padding: var(--space-md);text-align:center;">Inventario no disponible</div>';
    }
    html += '</div>';

    // Team metrics
    html += '<div class="tp-card"><div class="tp-card-title"><span>Metricas por Operador</span></div>';
    var opStats = {};
    vehicles.filter(function(v) { return v.status === 'archived' && v.archivedAt && localDateStr(new Date(v.archivedAt)) >= weekAgo; }).forEach(function(v) {
        var op = v.registeredBy || (v.testData && v.testData.testResponsible) || 'Desconocido';
        if (!opStats[op]) opStats[op] = 0;
        opStats[op]++;
    });
    var sortedOps = Object.keys(opStats).sort(function(a,b) { return opStats[b] - opStats[a]; });
    if (sortedOps.length > 0) {
        var maxOp = opStats[sortedOps[0]];
        sortedOps.forEach(function(op) {
            var pct = Math.round((opStats[op] / maxOp) * 100);
            html += '<div style="margin-bottom: var(--space-sm);">';
            html += '<div style="display:flex;justify-content:space-between;font-size:var(--font-sm);margin-bottom: var(--space-2xs);"><span>' + op + '</span><span>' + opStats[op] + ' esta semana</span></div>';
            html += '<div class="v7-exec-bar"><div class="v7-exec-bar-fill" style="width:' + pct + '%;background:var(--info);"></div></div>';
            html += '</div>';
        });
    } else {
        html += '<div style="color:var(--muted);text-align:center;padding: var(--space-md);">Sin datos esta semana</div>';
    }
    html += '</div>';

    el.innerHTML = html;
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-B2] VEHICLE TURNAROUND ANALYTICS                               ║
// ╚══════════════════════════════════════════════════════════════════════╝

function pnRenderTurnaround(el) {
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var archived = vehicles.filter(function(v) { return v.status === 'archived' && v.timeline && v.timeline.length >= 2; });

    if (archived.length === 0) {
        el.innerHTML = '<div class="tp-card" style="text-align:center;padding: var(--space-3xl);color:var(--muted);">No hay vehiculos archivados para analizar.</div>';
        return;
    }

    // Calculate stage durations from timeline
    var stageStats = { registration_to_precond: [], precond_to_soak: [], soak_to_test: [], test_to_release: [], total: [] };

    archived.slice(-100).forEach(function(v) { // Last 100 vehicles
        if (!v.timeline || v.timeline.length < 2) return;
        var regTime = v.registeredAt ? new Date(v.registeredAt).getTime() : null;
        var archTime = v.archivedAt ? new Date(v.archivedAt).getTime() : null;

        if (regTime && archTime) {
            var totalHrs = (archTime - regTime) / 3600000;
            if (totalHrs > 0 && totalHrs < 720) stageStats.total.push(totalHrs); // Max 30 days
        }

        // Parse timeline for stage transitions
        var stages = {};
        v.timeline.forEach(function(t) {
            var ts = new Date(t.timestamp).getTime();
            if (t.data && t.data.status) {
                if (!stages[t.data.status]) stages[t.data.status] = ts;
            }
        });

        if (stages['registered'] && stages['in-progress']) {
            var d = (stages['in-progress'] - stages['registered']) / 3600000;
            if (d > 0 && d < 168) stageStats.registration_to_precond.push(d);
        }
        if (stages['in-progress'] && stages['testing']) {
            var d2 = (stages['testing'] - stages['in-progress']) / 3600000;
            if (d2 > 0 && d2 < 168) stageStats.precond_to_soak.push(d2);
        }
        if (stages['testing'] && stages['ready-release']) {
            var d3 = (stages['ready-release'] - stages['testing']) / 3600000;
            if (d3 > 0 && d3 < 168) stageStats.test_to_release.push(d3);
        }
    });

    function avg(arr) { return arr.length > 0 ? (arr.reduce(function(s,v){return s+v;},0)/arr.length) : 0; }
    function formatHrs(h) {
        if (h < 1) return Math.round(h * 60) + ' min';
        if (h < 24) return h.toFixed(1) + ' hrs';
        return (h / 24).toFixed(1) + ' dias';
    }

    var html = '';
    html += '<div class="tp-card"><div class="tp-card-title" data-help="pn-turnaround-help"><span>Tiempo Promedio por Etapa</span></div>';
    html += '<div style="font-size:var(--font-xs);color:var(--muted);margin-bottom: var(--space-md);">Basado en ultimos ' + Math.min(100, archived.length) + ' vehiculos archivados</div>';

    var stages = [
        { label: 'Registro → Precond', data: stageStats.registration_to_precond, color: '#3b82f6' },
        { label: 'Precond → Prueba', data: stageStats.precond_to_soak, color: '#f59e0b' },
        { label: 'Prueba → Liberacion', data: stageStats.test_to_release, color: '#10b981' },
        { label: 'Total (Registro → Liberacion)', data: stageStats.total, color: '#8b5cf6' }
    ];

    var maxAvg = Math.max.apply(null, stages.map(function(s) { return avg(s.data); }).concat([1]));

    stages.forEach(function(s) {
        var a = avg(s.data);
        var pct = Math.round((a / maxAvg) * 100);
        html += '<div style="margin-bottom: var(--space-md);">';
        html += '<div style="display:flex;justify-content:space-between;font-size:var(--font-sm);margin-bottom: var(--space-xs);">';
        html += '<span>' + s.label + '</span>';
        html += '<span style="font-weight:700;">' + formatHrs(a) + ' <span style="color:var(--muted);font-weight:400;">(n=' + s.data.length + ')</span></span>';
        html += '</div>';
        html += '<div class="v7-exec-bar"><div class="v7-exec-bar-fill" style="width:' + pct + '%;background:' + s.color + ';"></div></div>';
        html += '</div>';
    });
    html += '</div>';

    // Throughput over time (daily counts for last 14 days)
    html += '<div class="tp-card"><div class="tp-card-title"><span>Throughput Diario (14 dias)</span></div>';
    var dailyCounts = {};
    for (var d = 13; d >= 0; d--) {
        var dateStr = localDateStr(new Date(Date.now() - d * 86400000));
        dailyCounts[dateStr] = 0;
    }
    archived.forEach(function(v) {
        if (v.archivedAt) {
            var ds = localDateStr(new Date(v.archivedAt));
            if (dailyCounts.hasOwnProperty(ds)) dailyCounts[ds]++;
        }
    });
    var dates = Object.keys(dailyCounts).sort();
    var counts = dates.map(function(d) { return dailyCounts[d]; });
    var maxCount = Math.max.apply(null, counts.concat([1]));
    html += '<div style="display:flex;align-items:flex-end;gap: var(--space-xs);height:80px;padding:8px 0;">';
    dates.forEach(function(d, i) {
        var h = Math.max(4, Math.round((counts[i] / maxCount) * 70));
        var dayLabel = d.slice(8,10);
        html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;">';
        html += '<div style="font-size: var(--fs-sm);font-weight:700;color:var(--text);margin-bottom: var(--space-2xs);">' + counts[i] + '</div>';
        html += '<div style="width:100%;height:' + h + 'px;background:var(--info);border-radius: var(--radius-md);"></div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--muted);margin-top: var(--space-2xs);">' + dayLabel + '</div>';
        html += '</div>';
    });
    html += '</div></div>';

    el.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════
// REGULATION PROFILES MANAGEMENT TAB
// ══════════════════════════════════════════════════════════════════════

function pnRenderRegulations(el) {
    var profiles = getAllRegulationProfiles();
    var html = '<div style="padding:4px 0;">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom: var(--space-md);">';
    html += '<h3 style="margin:0;font-size:14px;">⚗️ Perfiles de Regulación de Emisiones</h3>';
    html += '<button class="tp-btn tp-btn-primary" onclick="pnRegAddNew()" style="font-size: var(--fs-sm);padding: var(--space-sm) var(--space-lg);">+ Agregar Regulación</button>';
    html += '</div>';

    if (profiles.length === 0) {
        html += '<div class="tp-card" style="text-align:center;padding: var(--space-2xl);">';
        html += '<div style="font-size:32px;margin-bottom: var(--space-sm);">⚗️</div>';
        html += '<div style="font-weight:700;margin-bottom: var(--space-sm);">No hay perfiles configurados</div>';
        html += '<div style="color:var(--tp-dim);font-size: var(--fs-sm);margin-bottom: var(--space-lg);">Los perfiles definen qué gases medir y sus límites máximos por regulación.</div>';
        html += '<button class="tp-btn tp-btn-primary" onclick="pnRegAddNew()">+ Agregar primer perfil</button>';
        html += '</div>';
    } else {
        profiles.forEach(function(p) {
            html += '<div class="tp-card" style="margin-bottom: var(--space-md);">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom: var(--space-sm);">';
            html += '<div><div style="font-weight:700;font-size:13px;">' + escapeHtml(p.name) + '</div>';
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + p.gases.length + ' gas' + (p.gases.length !== 1 ? 'es' : '') + ' configurado' + (p.gases.length !== 1 ? 's' : '') + '</div></div>';
            html += '<div style="display:flex;gap: var(--space-sm);">';
            html += '<button class="tp-btn" onclick="pnRegEdit(\'' + escapeHtml(p.id) + '\')" style="font-size: var(--fs-sm);padding: var(--space-xs) var(--space-md);">✏️ Editar</button>';
            html += '<button class="tp-btn" onclick="pnRegDelete(\'' + escapeHtml(p.id) + '\')" style="font-size: var(--fs-sm);padding: var(--space-xs) var(--space-md);color:var(--danger-text);">🗑️</button>';
            html += '</div></div>';
            if (p.gases.length > 0) {
                html += '<div style="overflow-x:auto;"><table style="width:100%;font-size: var(--fs-xs);border-collapse:collapse;">';
                html += '<tr style="color:var(--tp-dim);border-bottom:1px solid rgba(0,0,0,0.08);"><th style="text-align:left;padding: var(--space-2xs) var(--space-sm);">Gas</th><th style="text-align:center;padding: var(--space-2xs) var(--space-sm);">Unidad</th><th style="text-align:center;padding: var(--space-2xs) var(--space-sm);">Límite</th></tr>';
                p.gases.forEach(function(g) {
                    html += '<tr style="border-bottom:1px solid rgba(0,0,0,0.05);">';
                    html += '<td style="padding: var(--space-xs) var(--space-sm);font-weight:600;">' + escapeHtml(g.label) + '</td>';
                    var _cap = (typeof gasCaptureUnit === 'function') ? gasCaptureUnit(g) : g.unit;
                    html += '<td style="text-align:center;padding: var(--space-xs) var(--space-sm);color:var(--tp-dim);">' + escapeHtml(g.unit)
                         + (_cap !== g.unit ? '<div style="font-size:10px;color:var(--info-text);">se teclea en ' + escapeHtml(_cap) + '</div>' : '')
                         + '</td>';
                    html += '<td style="text-align:center;padding: var(--space-xs) var(--space-sm);">' + (g.limit !== null && g.limit !== undefined ? '<span style="font-weight:700;color:var(--danger-text);">' + g.limit + '</span>' : '<span style="color:var(--tp-dim);">Sin límite</span>') + '</td>';
                    html += '</tr>';
                });
                html += '</table></div>';
            }
            html += '</div>';
        });
    }
    html += '</div>';
    el.innerHTML = html;
}

function pnRegAddNew() { _pnRegShowModal(null); }

function pnRegEdit(id) {
    var data = loadRegulations();
    var profile = data.profiles.find(function(p) { return p.id === id; });
    if (profile) _pnRegShowModal(profile);
}

function pnRegDelete(id) {
    var data = loadRegulations();
    var profile = data.profiles.find(function(p) { return p.id === id; });
    if (!profile) return;
    showConfirm('¿Eliminar el perfil "' + profile.name + '"? Los vehículos con esta regulación no podrán ser liberados hasta recrear el perfil.', function() {
        data.profiles = data.profiles.filter(function(p) { return p.id !== id; });
        saveRegulations();
        _regulationsData = data;
        pnSwitchTab('pn-regulations');
        showToast('Perfil eliminado', 'success');
    }, { title: 'Eliminar Perfil', type: 'danger', confirmText: 'Eliminar' });
}

function _pnRegShowModal(profile) {
    var isNew = !profile;
    var p = profile ? JSON.parse(JSON.stringify(profile)) : { id: 'reg_' + Date.now(), name: '', gases: [] };

    var gasRowsHtml = '';
    p.gases.forEach(function(g, i) { gasRowsHtml += _pnRegGasRowHtml(i, g); });

    var bodyHtml =
        '<div style="margin-bottom: var(--space-md);">' +
        '<label style="font-size: var(--fs-sm);font-weight:600;display:block;margin-bottom: var(--space-xs);">Nombre de la Regulación *</label>' +
        '<input id="reg-modal-name" class="form-control" value="' + escapeHtml(p.name) + '" placeholder="Ej: EURO-6C, NOM-163, SULEV 30" style="width:100%;box-sizing:border-box;">' +
        '</div>' +
        '<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom: var(--space-sm);gap: var(--space-sm);flex-wrap:wrap;">' +
        '<label style="font-size: var(--fs-sm);font-weight:600;">Gases a medir</label>' +
        '<div style="display:flex;gap: var(--space-sm);">' +
        '<button class="tp-btn tp-btn-ghost" onclick="pnRegApplyIcmsUnits()" style="font-size: var(--fs-sm);padding: var(--space-2xs) var(--space-md);">⚡ Captura como el banco</button>' +
        '<button class="tp-btn tp-btn-ghost" onclick="pnRegAddGasRow()" style="font-size: var(--fs-sm);padding: var(--space-2xs) var(--space-md);">+ Agregar gas</button>' +
        '</div></div>' +
        '<p style="font-size: var(--fs-xs);color:var(--tp-dim);margin:0 0 6px 0;line-height:1.5;">' +
        '<b>Unidad</b> es la del límite regulatorio y en la que se <b>guarda</b> el dato. ' +
        '<b>Captura</b> es solo cómo se teclea y se muestra: si el reporte del banco trae 24.3 mg/km, ' +
        'pon mg/km y se teclea 24.3 en vez de 0.0243. La conversión es automática y no cambia nada de lo ya guardado.</p>' +
        '<div style="overflow-x:auto;"><table style="width:100%;font-size: var(--fs-sm);border-collapse:collapse;">' +
        '<thead><tr style="color:var(--tp-dim);font-size: var(--fs-xs);"><th style="text-align:left;padding: var(--space-2xs);">Campo</th><th style="text-align:left;padding: var(--space-2xs);">Etiqueta</th><th style="text-align:left;padding: var(--space-2xs);">Unidad</th><th style="text-align:left;padding: var(--space-2xs);">Captura</th><th style="text-align:center;padding: var(--space-2xs);">Límite (vacío=sin lím.)</th><th></th></tr></thead>' +
        '<tbody id="reg-gas-rows">' + gasRowsHtml + '</tbody>' +
        '</table></div></div>';

    showModal({
        title: isNew ? 'Agregar Perfil de Regulación' : 'Editar Perfil: ' + escapeHtml(p.name),
        body: bodyHtml,
        buttons: [
            { label: 'Cancelar', cls: 'btn-secondary', onclick: function() { document.getElementById('globalModal').style.display='none'; } },
            { label: isNew ? 'Crear Perfil' : 'Guardar Cambios', cls: 'btn-primary', onclick: function() {
                var name = document.getElementById('reg-modal-name').value.trim();
                if (!name) { showToast('El nombre es requerido', 'error'); return; }
                var rows = document.querySelectorAll('#reg-gas-rows tr[data-gas-idx]');
                var gases = [];
                rows.forEach(function(row) {
                    // NO forzar mayúsculas: los perfiles usan 'NOx' y los valores ya
                    // guardados en cada vehículo están indexados por esa clave exacta.
                    // Pasarla a 'NOX' dejaría huérfano todo el histórico de ese gas.
                    var field = row.querySelector('.reg-gas-field').value.trim().replace(/\s+/g,'');
                    var label = row.querySelector('.reg-gas-label').value.trim();
                    var unit  = row.querySelector('.reg-gas-unit').value.trim();
                    var capSel = row.querySelector('.reg-gas-capture');
                    var capture = capSel ? capSel.value : '';
                    var limitVal = row.querySelector('.reg-gas-limit').value.trim();
                    var limit = limitVal === '' ? null : parseFloat(limitVal);
                    if (field && label) {
                        var gas = { field: field, label: label, unit: unit || 'g/km', limit: isNaN(limit) ? null : limit };
                        // Solo se guarda si difiere: un perfil sin captureUnit se comporta
                        // exactamente como antes de esta versión.
                        if (capture && capture !== gas.unit) gas.captureUnit = capture;
                        gases.push(gas);
                    }
                });
                if (gases.length === 0) { showToast('Agrega al menos un gas', 'error'); return; }
                var data = loadRegulations();
                var existing = data.profiles.find(function(x) { return x.id === p.id; });
                if (existing) {
                    existing.name = name; existing.shortName = name; existing.gases = gases; existing.updatedAt = new Date().toISOString();
                } else {
                    data.profiles.push({ id: p.id, name: name, shortName: name, gases: gases, createdAt: new Date().toISOString() });
                }
                saveRegulations();
                _regulationsData = data;
                document.getElementById('globalModal').style.display = 'none';
                pnSwitchTab('pn-regulations');
                showToast(isNew ? 'Perfil creado' : 'Perfil actualizado', 'success');
            }}
        ]
    });
}

function _pnRegGasRowHtml(i, g) {
    var cap = (typeof gasCaptureUnit === 'function') ? gasCaptureUnit(g) : (g.unit || 'g/km');
    var opts = (typeof GAS_UNIT_OPTIONS !== 'undefined' ? GAS_UNIT_OPTIONS : ['g/km','mg/km','g/mi','mg/mi'])
        .map(function(u) { return '<option value="' + u + '"' + (u === cap ? ' selected' : '') + '>' + u + '</option>'; }).join('');
    return '<tr data-gas-idx="' + i + '">' +
        '<td style="padding: var(--space-2xs);"><input class="form-control reg-gas-field" value="' + escapeHtml(g.field||'') + '" placeholder="CO" style="width:55px;font-size: var(--fs-base);"></td>' +
        '<td style="padding: var(--space-2xs);"><input class="form-control reg-gas-label" value="' + escapeHtml(g.label||'') + '" placeholder="CO" style="width:65px;font-size: var(--fs-base);"></td>' +
        '<td style="padding: var(--space-2xs);"><input class="form-control reg-gas-unit" value="' + escapeHtml(g.unit||'g/km') + '" placeholder="g/km" style="width:56px;font-size: var(--fs-base);"></td>' +
        '<td style="padding: var(--space-2xs);"><select class="form-control reg-gas-capture" style="width:72px;font-size: var(--fs-base);">' + opts + '</select></td>' +
        '<td style="padding: var(--space-2xs);text-align:center;"><input class="form-control reg-gas-limit" type="number" step="0.001" value="' + (g.limit!=null?g.limit:'') + '" placeholder="—" style="width:65px;font-size: var(--fs-base);text-align:center;"></td>' +
        '<td style="padding: var(--space-2xs);"><button onclick="this.closest(\'tr\').remove()" class="tp-btn" style="padding: var(--space-2xs) var(--space-sm);font-size: var(--fs-sm);color:var(--danger-text);">✕</button></td>' +
        '</tr>';
}

/**
 * Preset del reporte del banco: todo en mg/km salvo CO₂, que viene en g/km.
 * Es exactamente el formato del ICMS, que era el que obligaba a convertir a mano.
 */
function pnRegApplyIcmsUnits() {
    var rows = document.querySelectorAll('#reg-gas-rows tr[data-gas-idx]');
    if (!rows.length) { showToast('Agrega gases primero', 'info'); return; }
    rows.forEach(function(row) {
        var field = (row.querySelector('.reg-gas-field').value || '').trim().toUpperCase();
        var sel = row.querySelector('.reg-gas-capture');
        if (!sel) return;
        var isCo2 = field.indexOf('CO2') === 0 || field.indexOf('CO₂') === 0;
        var base = (row.querySelector('.reg-gas-unit').value || 'g/km').trim();
        // Solo cambia el prefijo de masa; la base de distancia (km/mi) se respeta.
        var perMile = base.indexOf('/mi') !== -1;
        sel.value = isCo2 ? (perMile ? 'g/mi' : 'g/km') : (perMile ? 'mg/mi' : 'mg/km');
    });
    showToast('Unidades de captura como el reporte del banco (mg, CO₂ en g)', 'success');
}

function pnRegAddGasRow() {
    var tbody = document.getElementById('reg-gas-rows');
    if (!tbody) return;
    var idx = tbody.querySelectorAll('tr[data-gas-idx]').length;
    // Un solo constructor de fila (_pnRegGasRowHtml): antes esta copia se quedaba
    // sin las columnas nuevas cada vez que se agregaba una.
    var wrap = document.createElement('tbody');
    wrap.innerHTML = _pnRegGasRowHtml(idx, { field: '', label: '', unit: 'g/km', limit: null });
    tbody.appendChild(wrap.firstChild);
}

// ══════════════════════════════════════════════════════════════════════
// [v16.3] ALMACÉN DE ARCHIVOS — subir/bajar un documento entre dispositivos
// vía Firestore (~5MB compartidos de todo el laboratorio, sin Firebase Storage).
// ══════════════════════════════════════════════════════════════════════

var PN_FILES_ACCEPT = '.zip,.pdf,.xls,.xlsx,.csv,.doc,.docx,.png,.jpg,.jpeg';

function pnRenderFiles(el) {
    var ready = (typeof fbFilesEnsureReady === 'function') ? fbFilesEnsureReady() : { ok: false, reason: 'Módulo de sincronización no disponible.' };

    var html = '<div class="tp-card">';
    html += '<div class="tp-card-title" data-help="pn-files-help"><span>☁️ Almacén de Archivos</span>';
    if (ready.ok) html += '<button class="tp-btn tp-btn-primary" onclick="document.getElementById(\'pn-files-input\').click()" style="font-size: var(--fs-sm);">📤 Subir archivo</button>';
    html += '</div>';
    html += '<input type="file" id="pn-files-input" accept="' + PN_FILES_ACCEPT + '" style="display:none;" onchange="pnFilesHandleUpload(event)">';

    if (!ready.ok) {
        html += '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);">';
        html += '<div style="font-size:32px;margin-bottom: var(--space-sm);">☁️</div>';
        html += '<div style="font-size:12px;">' + escapeHtml(ready.reason) + '</div>';
        html += '</div>';
        html += '</div>';
        el.innerHTML = html;
        return;
    }

    html += '<div id="pn-files-progress" style="display:none;margin-bottom: var(--space-md);">';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom: var(--space-2xs);">Subiendo… <span id="pn-files-progress-pct">0%</span></div>';
    html += '<div class="tp-bar" style="width:100%;height:8px;"><div class="tp-bar-fill" id="pn-files-progress-fill" style="width:0%;background:var(--tp-blue);"></div></div>';
    html += '</div>';

    html += '<div id="pn-files-quota" style="margin-bottom: var(--space-md);"></div>';
    html += '<div id="pn-files-list">' + pnFilesLoadingHTML() + '</div>';
    html += '</div>';
    el.innerHTML = html;

    pnFilesRefresh();
    if (typeof fbFilesSubscribe === 'function') fbFilesSubscribe(pnFilesRefresh);
}

function pnFilesLoadingHTML() {
    return '<div style="text-align:center;padding: var(--space-lg);color:var(--tp-dim);font-size: var(--fs-sm);">Cargando…</div>';
}

function pnFilesRefresh() {
    var listEl = document.getElementById('pn-files-list');
    var quotaEl = document.getElementById('pn-files-quota');
    if (!listEl || typeof fbFilesList !== 'function') return;

    fbFilesList(function(files, totalBytes, err) {
        listEl = document.getElementById('pn-files-list'); // puede haberse re-renderizado el tab mientras tanto
        quotaEl = document.getElementById('pn-files-quota');
        if (!listEl) return;

        if (err) {
            listEl.innerHTML = '<div style="text-align:center;padding: var(--space-lg);color:var(--tp-red);font-size: var(--fs-sm);">' + escapeHtml(err) + '</div>';
            return;
        }

        if (quotaEl) {
            var maxBytes = (typeof FB_FILES_MAX_BYTES !== 'undefined') ? FB_FILES_MAX_BYTES : (5 * 1024 * 1024);
            var pct = Math.min(100, Math.round((totalBytes / maxBytes) * 100));
            var barColor = pct > 90 ? 'var(--tp-red)' : pct > 70 ? 'var(--tp-amber)' : 'var(--tp-green)';
            quotaEl.innerHTML = '<div style="display:flex;justify-content:space-between;font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom: var(--space-2xs);">' +
                '<span>' + _pnFormatBytes(totalBytes) + ' de ' + _pnFormatBytes(maxBytes) + ' usados</span><span>' + pct + '%</span></div>' +
                '<div class="tp-bar" style="width:100%;height:8px;"><div class="tp-bar-fill" style="width:' + pct + '%;background:' + barColor + ';"></div></div>';
        }

        if (files.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);font-size: var(--fs-sm);">Sin archivos todavía. Sube el primero con el botón de arriba.</div>';
            return;
        }

        var rows = files.map(function(f) {
            var when = f.uploadedAt ? new Date(f.uploadedAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            return '<div style="display:flex;align-items:center;gap: var(--space-md);padding: var(--space-sm) var(--space-xs);border-bottom:1px solid var(--tp-border);flex-wrap:wrap;">' +
                '<div style="font-size:20px;">' + pnFilesIcon(f.name) + '</div>' +
                '<div style="flex:1;min-width:160px;">' +
                '<div style="font-size:12px;font-weight:700;color:var(--tp-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(f.name) + '</div>' +
                '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + _pnFormatBytes(f.size) + ' · ' + escapeHtml(f.uploadedBy) + ' · ' + when + '</div>' +
                '</div>' +
                '<button class="tp-btn tp-btn-ghost" onclick="pnFilesDownload(\'' + f.id + '\')" style="font-size: var(--fs-sm);" title="Descargar" aria-label="Descargar ' + escapeHtml(f.name) + '">⬇️</button>' +
                '<button class="tp-btn tp-btn-ghost" onclick="pnFilesConfirmDelete(\'' + f.id + '\',\'' + escapeHtml(f.name).replace(/'/g, "\\'") + '\')" style="font-size: var(--fs-sm);color:var(--tp-red);" title="Eliminar" aria-label="Eliminar ' + escapeHtml(f.name) + '">🗑</button>' +
                '</div>';
        }).join('');
        listEl.innerHTML = rows;
        window._pnFilesCache = files; // usado por descarga/borrado para no volver a consultar
    });
}

function pnFilesIcon(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    if (ext === 'zip' || ext === 'rar' || ext === '7z') return '🗜️';
    if (ext === 'pdf') return '📕';
    if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return '📊';
    if (ext === 'doc' || ext === 'docx') return '📄';
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return '🖼️';
    return '📁';
}

function pnFilesHandleUpload(ev) {
    var input = ev.target;
    var file = input.files && input.files[0];
    input.value = ''; // permite re-seleccionar el mismo archivo después
    if (!file) return;

    var ext = '.' + file.name.split('.').pop().toLowerCase();
    if (PN_FILES_ACCEPT.indexOf(ext) === -1) {
        showToast('Formato no permitido. Aceptados: ' + PN_FILES_ACCEPT, 'error');
        return;
    }

    var progressWrap = document.getElementById('pn-files-progress');
    var progressFill = document.getElementById('pn-files-progress-fill');
    var progressPct = document.getElementById('pn-files-progress-pct');
    if (progressWrap) progressWrap.style.display = '';

    fbFilesUpload(file, function(pct) {
        if (progressFill) progressFill.style.width = pct + '%';
        if (progressPct) progressPct.textContent = pct + '%';
    }, function(ok, err) {
        if (progressWrap) progressWrap.style.display = 'none';
        if (ok) {
            showToast('Archivo subido: ' + file.name, 'success');
            pnFilesRefresh();
        } else {
            showToast(err || 'Error al subir el archivo', 'error');
        }
    });
}

function pnFilesDownload(fileId) {
    var f = (window._pnFilesCache || []).find(function(x) { return x.id === fileId; });
    if (!f) { showToast('Archivo no encontrado', 'error'); return; }
    showToast('Preparando descarga…', 'info');
    fbFilesDownload(fileId, f, function(ok, err, url) {
        if (!ok) { showToast(err || 'Error al descargar', 'error'); return; }
        var a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 30000);
    });
}

function pnFilesConfirmDelete(fileId, fileName) {
    showConfirm('¿Eliminar "' + fileName + '" del almacén compartido? Esta acción es irreversible.', function() {
        var f = (window._pnFilesCache || []).find(function(x) { return x.id === fileId; });
        fbFilesDelete(fileId, f, fileName, function(ok, err) {
            if (ok) { showToast('Archivo eliminado', 'success'); pnFilesRefresh(); }
            else showToast(err || 'Error al eliminar', 'error');
        });
    }, { title: 'Eliminar archivo', type: 'danger', confirmText: 'Eliminar' });
}


// ══════════════════════════════════════════════════
// v16.0: Ayuda — banners de pestaña y tooltips de campo
// ══════════════════════════════════════════════════
if (typeof HELP_TABS !== 'undefined') Object.assign(HELP_TABS, {
    'pn-dashboard': { title: 'Datos — resumen', text: 'El resumen cruzado del laboratorio (mismo que ve HOY): estado de vehículos, plan semanal, inventario y alertas en un vistazo.', tips: [
        'Es el mismo contenido que el tablero de HOY, aquí en formato de tarjetas del Panel.',
        'Las anomalías de gas y el estado de Firebase Sync se muestran solo si aplican.'
    ]},
    'pn-reports': { title: 'Reportes', text: 'Centro de exportación: cada botón genera un CSV/PDF distinto (gap de cobertura, pronóstico de gas, bitácora, alertas, auditoría). Lee la descripción de cada fila para saber qué incluye.', tips: [
        'Cada tarjeta ya explica qué exporta antes de que pulses el botón.',
        'Los reportes usan siempre los datos actuales — no hay que "generar" nada antes.',
        'El "Estado semanal" en PDF es el más completo para compartir con jefatura.'
    ]},
    'pn-executive': { title: 'Ejecutivo', text: 'Scorecard de cumplimiento y proyección de recursos — vista para reportar hacia arriba.', tips: [
        'El Compliance Scorecard resume % de cobertura contra el plan de producción.',
        'Métricas por Operador te dice quién ha registrado/liberado más pruebas.'
    ]},
    'pn-turnaround': { title: 'Turnaround', text: 'Cuánto tarda un vehículo en cada etapa del proceso y el throughput diario del laboratorio.', tips: [
        'Tiempos altos en una etapa señalan dónde se está atorando el flujo.',
        'El throughput de 14 días ayuda a detectar tendencias de productividad.'
    ]},
    'pn-users': { title: 'Operadores', text: 'Alta y gestión de operadores del laboratorio: nombre, rol y estadísticas de pruebas por persona.', tips: [
        'Agrega operadores antes de que aparezcan en el picker 👤 del topbar.',
        'Las estadísticas (registrados/liberados/activos) se calculan automáticamente.'
    ]},
    'pn-shift': { title: 'Bitácora de turno', text: 'Registro de actividades, incidencias y observaciones del turno. Úsala para dejar constancia de lo que pasó en tu turno.', tips: [
        'Usa "🔄 Cerrar Turno" al final del día para generar el reporte de entrega.',
        'Cada entrada queda con operador, categoría y hora — es evidencia auditable.'
    ]},
    'pn-alerts': { title: 'Alertas', text: 'Todas las alertas activas de todos los módulos, ordenadas por severidad, incluidas las de consumo y las alarmas SPC.', tips: [
        '"✅ Sin Alertas" significa que el laboratorio opera con normalidad.',
        'Las alertas se agrupan por origen (COP15, Inventario, Test Plan, CoP SPC).'
    ]},
    'pn-intelligence': { title: 'Inteligencia', text: 'Correlaciones automáticas entre módulos (consumo vs volumen de pruebas) para detectar patrones que no se ven a simple vista.', tips: [
        'Es informativo: no requiere captura, solo lectura de tendencias cruzadas.'
    ]},
    'pn-system': { title: 'Sistema', text: 'Salud técnica de la plataforma: versión instalada con su historial completo, uso de almacenamiento local y estado de sincronización.', tips: [
        'El "🗂️ Historial de Versiones" arriba lista todo lo agregado, ronda por ronda — la más reciente siempre marcada ACTUAL.',
        'Si el almacenamiento local se acerca al límite (~5MB), aquí lo verás primero.',
        'Sirve para diagnosticar por qué un dispositivo no sincroniza.'
    ]},
    'pn-calendar': { title: 'Calendario', text: 'Las pruebas planificadas/ejecutadas por día del mes, para tener visión rápida de la carga de trabajo.', tips: [
        'Usa ← Hoy → para navegar entre meses.'
    ]},
    'pn-audit': { title: 'Auditoría', text: 'El control de cambios de TODA la plataforma: quién hizo qué y cuándo. Exportable a CSV.', tips: [
        'Cada acción importante (guardar, liberar, editar retroactivo) queda registrada aquí.',
        'Usa los filtros para buscar por módulo, operador o tipo de acción.'
    ]},
    'pn-regulations': { title: 'Regulaciones', text: 'Catálogo de regulaciones de emisiones y sus gases/límites — la fuente que usan CoP y Liberación para validar resultados.', tips: [
        'Agrega una fila de gas por cada contaminante que la regulación limita.',
        'Estos límites son los que se comparan contra los resultados capturados en Liberación.'
    ]},
    'pn-files': { title: 'Almacén de Archivos', text: 'Un espacio compartido de 5MB para subir un documento desde este dispositivo y bajarlo desde otro — útil para pasar un .zip, PDF u hoja de cálculo sin depender de USB o correo.', tips: [
        'Formatos aceptados: .zip, .pdf, .xls/.xlsx/.csv, .doc/.docx, imágenes.',
        'El presupuesto de 5MB es compartido por TODO el laboratorio — borra lo que ya no necesites.',
        'La lista se actualiza sola cuando alguien más sube o borra un archivo desde otro dispositivo.',
        'Requiere que este dispositivo esté conectado a Firebase (indicador de sincronización arriba).'
    ]}
});
if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    pn_density: {
        title: 'Densidad de la interfaz',
        text: 'Qué tanto aire tiene la plataforma. "Cómoda" es la recomendada: letra un poco '
            + 'más grande y más separación entre bloques. "Compacta" devuelve la escala '
            + 'anterior si prefieres ver más filas de una sola vez. "Amplia" es para tablet o '
            + 'para proyectar en una junta. Se guarda solo en este dispositivo.'
    },
    pn_storage: {
        title: 'Uso de Almacenamiento',
        text: 'Espacio que ocupa la app EN ESTE DISPOSITIVO. El navegador da ~5 MB por '
            + 'dispositivo y los comparten todos los módulos.\n\n'
            + 'Estar en Firebase NO amplía este límite: la app trabaja primero contra el '
            + 'almacenamiento local y la nube es la copia compartida entre equipos. Si el '
            + 'local se llena, deja de guardar aunque la sincronización esté en verde.\n\n'
            + 'Cada renglón dice qué tipo de dato es:\n'
            + '· dato — información del laboratorio, no se borra desde aquí.\n'
            + '· regenerable — la app lo vuelve a crear sola. "🧹 Liberar espacio" borra todo esto.\n'
            + '· revisar — pesado y puede traer trabajo sin enviar; se borra uno por uno.'
    },
    'pn-reports-help': { title: 'Centro de Reportes', text: 'Un solo lugar para exportar todos los reportes del laboratorio; cada botón usa los datos actuales del sistema.' },
    'pn-executive-help': { title: 'Compliance Scorecard', text: 'Porcentaje de cumplimiento del plan de producción, con proyección de recursos necesarios para cerrar la brecha.' },
    'pn-turnaround-help': { title: 'Tiempo por etapa', text: 'Promedio de días/horas que un vehículo pasa en cada etapa del proceso (recepción, preacondicionamiento, prueba, liberación).' },
    'pn-users-help': { title: 'Alta de operador', text: 'Registra el nombre y rol de un técnico del laboratorio para que pueda ser elegido en el picker de operador.' },
    'pn-shift-help': { title: 'Bitácora', text: 'Registra aquí eventos de tu turno: inicio, incidencias, mantenimiento, calibraciones y observaciones.' },
    'pn-alerts-help': { title: 'Resumen de alertas', text: 'Conteo de alertas Críticas / Altas / Medias activas ahora mismo en todo el laboratorio.' },
    'pn-audit-help': { title: 'Control de cambios', text: 'Bitácora automática de auditoría: cada acción importante queda aquí con operador, fecha y detalle.' },
    'pn-files-help': { title: 'Almacén compartido', text: 'Sube un archivo aquí y descárgalo desde cualquier otro dispositivo conectado al laboratorio. 5MB de espacio TOTAL, compartido entre todos los archivos.' },
    'pn-skill-matrix': { title: 'Matriz de competencias', text: 'Quién está capacitado para qué. Los niveles son: 1 en entrenamiento (supervisado), 2 autónomo, 3 puede certificar a otros. Las habilidades con recertificación (dinamómetro, calibración de analizadores, aprobador CoP) vencen solas y se marcan en rojo. La fila Cobertura te dice cuántos operadores activos pueden hacer esa prueba hoy — si marca 0 en una habilidad crítica, el laboratorio no puede cubrirla.' },
    'pn-version-history-help': { title: 'Historial de versiones', text: 'Todas las rondas de mejoras de la plataforma, empezando por la más reciente (marcada ACTUAL). Toca el nombre de una versión para ver qué trajo. El pill "KIA EmLab vX.X" del menú ⋯ del topbar también trae aquí.' }
});
