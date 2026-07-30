// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Authentication Module (PIN + WebAuthn / Biometric)    ║
// ╚══════════════════════════════════════════════════════════════════════╝

var authState = {
    currentUser: null,      // { id, name, role }
    sessionActive: false,
    sessionExpiry: null
};

var AUTH_LS_KEY = 'kia_auth_session';
var AUTH_SESSION_HOURS = 12;
var AUTH_WEBAUTHN_LS = 'kia_webauthn_creds';

// ══════════════════════════════════════════════════════════════════════
// [Fase 2] PERMISOS POR ROL
// ══════════════════════════════════════════════════════════════════════
// IMPORTANTE — alcance real de esto: la app corre 100% en el cliente con una
// sola cuenta Firebase compartida, así que esto es un control de FLUJO DE
// TRABAJO (evitar errores y exigir doble par de ojos), NO una frontera de
// seguridad. Quien abra la consola del navegador puede saltárselo. Sirve para
// el uso normal del laboratorio y para dejar rastro auditable de los intentos.
var AUTH_ROLE_PERMS = {
    'Practicante': ['test.register', 'test.operate'],
    'Técnico':     ['test.register', 'test.operate', 'test.release',
                    'inventory.manage', 'audit.view'],
    'Ingeniero':   ['test.register', 'test.operate', 'test.release',
                    'inventory.manage', 'audit.view', 'audit.export',
                    'cop.judge', 'plan.manage', 'users.view'],
    'Supervisor':  ['test.register', 'test.operate', 'test.release', 'test.approve',
                    'test.retro_edit', 'inventory.manage', 'audit.view', 'audit.export',
                    'cop.judge', 'plan.manage', 'users.view', 'users.manage',
                    'users.pin', 'data.sync_admin'],
    'Coordinador': ['*']
};

/**
 * ¿La sesión actual tiene este permiso? Devuelve false sin sesión.
 * USAR SÓLO PARA OCULTAR UI. La comprobación real es authRequire().
 */
function authCan(perm) {
    var u = authGetCurrentUser();
    if (!u) return false;
    var list = AUTH_ROLE_PERMS[u.role] || [];
    return list.indexOf('*') !== -1 || list.indexOf(perm) !== -1;
}

/**
 * Comprobación real: llamar al INICIO de cada handler privilegiado.
 * Nunca confiar en que el botón esté oculto — ocultar es UX, esto es el candado.
 */
function authRequire(perm, label) {
    if (authCan(perm)) return true;
    var u = authGetCurrentUser();
    var role = u ? (u.role || '—') : 'sin sesión';
    if (typeof showToast === 'function') {
        showToast('Tu rol (' + role + ') no permite: ' + (label || perm), 'error');
    }
    if (typeof auditLog === 'function') {
        auditLog('auth', 'permission_denied', { type: 'perm', label: perm }, label || '');
    }
    return false;
}

/**
 * Doble par de ojos: quien aprueba no puede ser quien liberó.
 * Compara el ID DE SESIÓN grabado en la firma, nunca el nombre escrito —
 * el nombre es texto libre y bastaría con teclear otro para burlar la regla.
 * Devuelve { ok: bool, reason: 'perm'|'self'|null }.
 */
function authCanApproveVehicle(vehicle) {
    if (!authCan('test.approve')) return { ok: false, reason: 'perm' };
    var u = authGetCurrentUser();
    var sigs = (vehicle && vehicle.testData && vehicle.testData.signatures) || {};
    var rel = sigs.releaser || {};
    if (u && rel.sessionUserId != null && String(rel.sessionUserId) === String(u.id)) {
        return { ok: false, reason: 'self' };
    }
    return { ok: true, reason: null };
}


/**
 * ¿Este operador tiene PIN configurado? Debe mirar AMBOS campos: `pinHash` es
 * el formato legacy y `_pnAssignPin` (panel.js) lo BORRA al migrar a `pinHash2`.
 * Revisar sólo `pinHash` fue la causa de dos bugs: el aviso permanente y falso
 * de "Ningun operador tiene PIN configurado", y el bloqueo total de los
 * operadores ya migrados cuando quedaba uno con PIN legacy.
 */
function _authHasPin(op) {
    return !!(op && (op.pinHash2 || op.pinHash));
}

// ── Initialization ──
// [v15.6] Muro de PIN reactivado (decisión de seguridad del usuario): sin
// sesión válida (kia_auth_session con expiresAt vigente, 12h) la app muestra
// el login de operadores y initializeSystem se detiene hasta autenticar.

// ── [Fase 2] Vigilancia de sesión: expiración e inactividad ──
var AUTH_IDLE_MS = 45 * 60000;      // 45 min sin actividad → pedir PIN de nuevo
var AUTH_CHECK_MS = 60000;          // frecuencia de revisión
var _authLastActivity = Date.now();
var _authWatchTimer = null;

/** Operador vivo y activo en el roster, o null. */
function _authFindOperator(id) {
    var ops = (typeof pnState !== 'undefined' && pnState.operators) ? pnState.operators : [];
    for (var i = 0; i < ops.length; i++) {
        if (String(ops[i].id) === String(id)) {
            if (ops[i].deleted || ops[i].active === false) return null;
            return ops[i];
        }
    }
    return null;
}

/** Marca actividad del usuario (throttled: basta con precisión de segundos). */
function authTouch() { _authLastActivity = Date.now(); }

/**
 * Revisa expiración, baja del operador, cambio de rol e inactividad.
 * La inactividad NO cierra sesión: vuelve a pedir el PIN del mismo operador,
 * para no perder el formulario en curso ni re-ejecutar initializeSystem().
 */
function authSessionCheck() {
    if (!authState.sessionActive || !authState.currentUser) return;

    if (authState.sessionExpiry && authState.sessionExpiry.getTime() <= Date.now()) {
        _authForceLogin('Tu sesión expiró. Ingresa tu PIN de nuevo.');
        return;
    }
    var live = _authFindOperator(authState.currentUser.id);
    if (!live) {
        if (typeof auditLog === 'function') auditLog('auth', 'session_revoked', { type: 'operator', label: authState.currentUser.name }, 'Operador dado de baja o inactivo');
        _authForceLogin('Tu usuario fue dado de baja. Contacta a un supervisor.');
        return;
    }
    // Rol siempre fresco desde el roster (una degradación surte efecto de inmediato)
    if ((live.role || 'Técnico') !== authState.currentUser.role) {
        authState.currentUser.role = live.role || 'Técnico';
        if (typeof auditLog === 'function') auditLog('auth', 'role_refreshed', { type: 'operator', label: live.name }, 'Nuevo rol: ' + authState.currentUser.role);
    }
    if (Date.now() - _authLastActivity > AUTH_IDLE_MS) {
        _authForceLogin('Sesión bloqueada por inactividad. Ingresa tu PIN.');
    }
}

function _authForceLogin(msg) {
    authState.sessionActive = false;
    try { localStorage.removeItem(AUTH_LS_KEY); } catch(e) {}
    if (typeof showToast === 'function') showToast(msg, 'info');
    authShowLogin();
}

function _authStartSessionWatch() {
    if (_authWatchTimer) return;   // idempotente: authInit puede correr más de una vez
    _authLastActivity = Date.now();
    _authWatchTimer = setInterval(authSessionCheck, AUTH_CHECK_MS);
    ['pointerdown', 'keydown'].forEach(function(ev) {
        document.addEventListener(ev, authTouch, { passive: true });
    });
    document.addEventListener('visibilitychange', function() { if (!document.hidden) authSessionCheck(); });
    window.addEventListener('focus', authSessionCheck);
}

function authInit() {
    // Sesión válida persistida → restaurar y continuar
    try {
        var saved = localStorage.getItem(AUTH_LS_KEY);
        if (saved) {
            var session = JSON.parse(saved);
            if (session.expiresAt && new Date(session.expiresAt).getTime() > Date.now()) {
                // [Fase 2] El operador debe seguir existiendo y estar activo: antes la
                // sesión se restauraba del blob local sin comprobar nada, así que dar de
                // baja a alguien en otro dispositivo no lo sacaba del suyo.
                var _live = _authFindOperator(session.operatorId);
                if (!_live) {
                    localStorage.removeItem(AUTH_LS_KEY);
                    if (typeof auditLog === 'function') auditLog('auth', 'session_revoked', { type: 'operator', label: session.operatorName }, 'Operador dado de baja o inactivo');
                    authState.sessionActive = false;
                    authState.currentUser = null;
                    authShowLogin();
                    if (typeof showToast === 'function') showToast('Tu usuario fue dado de baja. Contacta a un supervisor.', 'error');
                    return;
                }
                // El rol se relee del roster, no del blob: antes quedaba congelado hasta
                // el próximo login, así que una degradación de permisos no surtía efecto.
                authState.currentUser = { id: _live.id, name: _live.name, role: _live.role || 'Técnico' };
                authState.sessionActive = true;
                authState.sessionExpiry = new Date(session.expiresAt);
                var overlay = document.getElementById('auth-overlay');
                if (overlay) overlay.style.display = 'none';
                authUpdateUI();
                authFirebaseSignIn();
                _authStartSessionWatch();
                return;
            }
            // Sesión expirada
            localStorage.removeItem(AUTH_LS_KEY);
        }
    } catch(e) {}

    // Sin sesión válida → muro de login (el gate de initializeSystem corta)
    authState.sessionActive = false;
    authState.currentUser = null;
    authShowLogin();
}

// ── Login Screen ──
function authShowLogin() {
    var overlay = document.getElementById('auth-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    // Get operators from Panel module
    var operators = (typeof pnState !== 'undefined' && pnState.operators) ? pnState.operators.filter(function(o) { return o.active; }) : [];

    // If no operators with PINs, allow bypass for initial setup
    var hasAnyPin = operators.some(function(o) { return _authHasPin(o); });

    var html = '<div style="width:100%;max-width:420px;margin:auto;padding:20px;">';
    html += '<div style="text-align:center;margin-bottom:30px;">';
    html += '<div style="font-size:36px;margin-bottom:8px;">🔬</div>';
    html += '<h1 style="color:#c4b5fd;font-size:20px;font-weight:800;margin:0;">KIA EmLab</h1>';
    html += '<div style="color:#64748b;font-size:11px;margin-top:4px;">Laboratorio de Emisiones</div>';
    html += '</div>';

    if (operators.length === 0) {
        html += '<div style="text-align:center;padding:30px;color:#94a3b8;">';
        html += '<div style="font-size:13px;margin-bottom:12px;">No hay operadores configurados.</div>';
        html += '<div style="font-size:11px;color:#64748b;margin-bottom:16px;">Accede como administrador para configurar operadores y PINs en Panel > Usuarios.</div>';
        html += '<button onclick="authBypassLogin()" style="padding:12px 24px;background:#6366f1;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;">Entrar como Admin</button>';
        html += '</div>';
    } else if (!hasAnyPin && operators.every(function(o) { return o.provisional; })) {
        // Dispositivo que nunca ha sincronizado: los operadores que se ven son
        // marcadores sembrados desde CONFIG, no cuentas reales. No ofrecerlos —
        // pedir la contraseña del laboratorio para bajar el roster verdadero.
        html += '<div style="text-align:center;padding:20px;color:#93c5fd;font-size:11px;margin-bottom:16px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:8px;">';
        html += 'Este dispositivo todavía no se ha conectado al laboratorio.<br>Ingresa la contraseña del laboratorio para descargar los operadores y sus PINs.';
        html += '</div>';
        html += '<div style="text-align:center;">';
        html += '<button onclick="_authShowConnectFirst()" style="padding:12px 24px;background:#2563eb;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;">Conectar este dispositivo</button>';
        html += '</div>';
    } else if (!hasAnyPin) {
        html += '<div style="text-align:center;padding:20px;color:#f59e0b;font-size:11px;margin-bottom:16px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:8px;">';
        html += 'Ningun operador tiene PIN configurado. Ve a Panel > Usuarios para asignar PINs.';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">';
        operators.forEach(function(op, idx) {
            var initials = authInitials(op.name);
            var colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
            var c = colors[idx % colors.length];
            html += '<button onclick="authBypassForOperator(' + idx + ')" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;background:#111827;border:2px solid #1e293b;border-radius:12px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor=\'' + c + '\'" onmouseout="this.style.borderColor=\'#1e293b\'">';
            html += '<div style="width:50px;height:50px;border-radius:50%;background:' + c + '20;color:' + c + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">' + escapeHtml(initials) + '</div>';
            html += '<div style="color:#e2e8f0;font-size:12px;font-weight:700;">' + escapeHtml(op.name) + '</div>';
            html += '<div style="color:#64748b;font-size:9px;">' + escapeHtml(op.role || 'Técnico') + '</div>';
            html += '</button>';
        });
        html += '</div>';
    } else {
        html += '<div style="color:#94a3b8;font-size:12px;text-align:center;margin-bottom:16px;">Selecciona tu usuario</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">';
        operators.forEach(function(op, idx) {
            var initials = authInitials(op.name);
            var colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
            var c = colors[idx % colors.length];
            var hasPin = _authHasPin(op);
            html += '<button onclick="authSelectOperator(' + idx + ')" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;background:#111827;border:2px solid #1e293b;border-radius:12px;cursor:pointer;transition:border-color 0.2s;' + (!hasPin ? 'opacity:0.4;' : '') + '" ' + (!hasPin ? 'disabled title="Sin PIN configurado"' : '') + ' onmouseover="this.style.borderColor=\'' + c + '\'" onmouseout="this.style.borderColor=\'#1e293b\'">';
            html += '<div style="width:50px;height:50px;border-radius:50%;background:' + c + '20;color:' + c + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">' + escapeHtml(initials) + '</div>';
            html += '<div style="color:#e2e8f0;font-size:12px;font-weight:700;">' + escapeHtml(op.name) + '</div>';
            html += '<div style="color:#64748b;font-size:9px;">' + escapeHtml(op.role || 'Técnico') + (hasPin ? '' : ' (sin PIN)') + '</div>';
            html += '</button>';
        });
        html += '</div>';
    }

    html += '<div id="auth-pin-area"></div>';
    html += '</div>';

    var content = document.getElementById('auth-content');
    if (content) content.innerHTML = html;
}

// ── Operator selected → show PIN entry ──
function authSelectOperator(idx) {
    var operators = (typeof pnState !== 'undefined' && pnState.operators) ? pnState.operators.filter(function(o) { return o.active; }) : [];
    var op = operators[idx];
    if (!op) return;

    window._authSelectedIdx = idx;
    window._authSelectedOp = op;

    var area = document.getElementById('auth-pin-area');
    if (!area) return;

    var hasBiometric = authHasStoredCredential(op.id);
    var webAuthnAvailable = window.PublicKeyCredential !== undefined && window.isSecureContext;

    var html = '<div style="margin-top:20px;padding:20px;background:#111827;border:2px solid #6366f1;border-radius:12px;text-align:center;">';
    html += '<div style="font-size:13px;font-weight:700;color:#c4b5fd;margin-bottom:12px;">' + escapeHtml(op.name) + '</div>';
    html += '<div style="color:#94a3b8;font-size:11px;margin-bottom:14px;">Ingresa tu PIN de 4 digitos</div>';

    // PIN inputs
    html += '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px;">';
    for (var i = 0; i < 4; i++) {
        html += '<input type="tel" maxlength="1" class="auth-pin-digit" id="auth-pin-' + i + '" ';
        html += 'style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:800;background:#0a0f1a;border:2px solid #334155;border-radius:10px;color:#e2e8f0;outline:none;" ';
        html += 'oninput="authPinInput(' + i + ')" onkeydown="authPinKeydown(event,' + i + ')" onfocus="this.select()">';
    }
    html += '</div>';

    html += '<div id="auth-pin-error" style="color:#ef4444;font-size:11px;margin-bottom:10px;min-height:16px;"></div>';

    // Biometric button
    if (webAuthnAvailable && hasBiometric) {
        html += '<button onclick="authVerifyBiometric()" style="width:100%;padding:12px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:10px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px;">';
        html += '<span style="font-size:20px;">👆</span> Usar huella digital';
        html += '</button>';
    } else if (webAuthnAvailable && !hasBiometric && _authHasPin(op)) {
        html += '<div style="font-size:9px;color:#475569;margin-bottom:8px;">Tip: Despues de ingresar tu PIN, podras registrar tu huella digital.</div>';
    }

    html += '<button onclick="authShowLogin()" style="padding:8px 16px;background:none;color:#64748b;border:1px solid #334155;border-radius:8px;cursor:pointer;font-size:11px;">← Cambiar usuario</button>';
    html += '</div>';

    area.innerHTML = html;

    // Focus first input
    setTimeout(function() {
        var first = document.getElementById('auth-pin-0');
        if (first) first.focus();
    }, 100);
}

function authPinInput(idx) {
    var input = document.getElementById('auth-pin-' + idx);
    if (!input) return;
    // Only allow digits
    input.value = input.value.replace(/\D/g, '');
    if (input.value.length === 1 && idx < 3) {
        var next = document.getElementById('auth-pin-' + (idx + 1));
        if (next) next.focus();
    }
    // Check if all 4 digits entered
    authCheckComplete();
}

function authPinKeydown(e, idx) {
    if (e.key === 'Backspace' && idx > 0) {
        var current = document.getElementById('auth-pin-' + idx);
        if (current && current.value === '') {
            var prev = document.getElementById('auth-pin-' + (idx - 1));
            if (prev) { prev.focus(); prev.value = ''; }
        }
    }
}

function authCheckComplete() {
    var pin = '';
    for (var i = 0; i < 4; i++) {
        var d = document.getElementById('auth-pin-' + i);
        if (!d || d.value.length !== 1) return;
        pin += d.value;
    }
    // All 4 digits entered — verify
    authVerifyAndLogin(pin);
}

// ── [v15.6] Lockout de PIN: 5 fallos → 60s bloqueado (persistido) ──
var AUTH_LOCKOUT_KEY = 'kia_pin_lockout';
var AUTH_MAX_FAILS = 5;
var AUTH_LOCKOUT_MS = 60000;

var AUTH_BRUTEFORCE_STRIKES = 15;

/** Duración del bloqueo según intentos fallidos ACUMULADOS (escalonado). */
function _authLockoutDelay(strikes) {
    if (strikes >= 15) return 30 * 60000;  // 30 min
    if (strikes >= 10) return 5 * 60000;   // 5 min
    return AUTH_LOCKOUT_MS;                // 60 s
}

function _authLockoutGet(opId) {
    try { return (JSON.parse(localStorage.getItem(AUTH_LOCKOUT_KEY)) || {})[opId] || { fails: 0, until: 0, strikes: 0 }; }
    catch(e) { return { fails: 0, until: 0, strikes: 0 }; }
}
function _authLockoutSet(opId, rec) {
    var all = {};
    try { all = JSON.parse(localStorage.getItem(AUTH_LOCKOUT_KEY)) || {}; } catch(e) {}
    all[opId] = rec;
    try { localStorage.setItem(AUTH_LOCKOUT_KEY, JSON.stringify(all)); } catch(e) {}
}

function authVerifyAndLogin(pin) {
    var op = window._authSelectedOp;
    if (!op) return;

    var fullIdx = -1;
    pnState.operators.forEach(function(o, i) { if (o.id === op.id) fullIdx = i; });
    if (fullIdx === -1) return;

    var err = document.getElementById('auth-pin-error');

    // ¿Bloqueado?
    var lock = _authLockoutGet(op.id);
    if (lock.until && lock.until > Date.now()) {
        var secs = Math.ceil((lock.until - Date.now()) / 1000);
        if (err) err.textContent = 'Bloqueado por intentos fallidos. Reintenta en ' + secs + 's.';
        return;
    }

    pnVerifyPinAsync(fullIdx, pin).then(function(ok) {
        if (ok) {
            _authLockoutSet(op.id, { fails: 0, until: 0, strikes: 0 });
            if (typeof auditLog === 'function') auditLog('auth', 'login', { type: 'operator', label: op.name });
            authCreateSession(op);
            if (window.PublicKeyCredential && window.isSecureContext && !authHasStoredCredential(op.id)) {
                setTimeout(function() { authOfferBiometricRegistration(op.id); }, 1500);
            }
            return;
        }
        // Fallo: contar y quizá bloquear.
        // [Fase 2] `strikes` es acumulativo y NO se reinicia al bloquear — antes se
        // ponía fails=0 junto con `until`, así que tras los 60 s el atacante recuperaba
        // 5 intentos frescos indefinidamente y podía recorrer los 10 000 PINs posibles.
        // Sólo un login correcto limpia el contador.
        var rec = _authLockoutGet(op.id);
        rec.fails = (rec.fails || 0) + 1;
        rec.strikes = (rec.strikes || 0) + 1;
        if (rec.fails >= AUTH_MAX_FAILS) {
            rec.until = Date.now() + _authLockoutDelay(rec.strikes);
            rec.fails = 0;
        }
        _authLockoutSet(op.id, rec);
        if (typeof auditLog === 'function') {
            auditLog('auth', 'login_failed', { type: 'operator', label: op.name }, 'Intentos acumulados: ' + rec.strikes);
            if (rec.strikes >= AUTH_BRUTEFORCE_STRIKES) {
                auditLog('auth', 'login_bruteforce_suspected', { type: 'operator', label: op.name }, rec.strikes + ' intentos fallidos acumulados');
            }
        }

        if (rec.until && rec.until > Date.now()) {
            var mins = Math.round((rec.until - Date.now()) / 60000);
            if (err) err.textContent = mins >= 1
                ? ('Demasiados intentos. Bloqueado ' + mins + ' min.')
                : 'Demasiados intentos. Bloqueado 60 segundos.';
        } else if (err) {
            err.textContent = 'PIN incorrecto (' + rec.fails + '/' + AUTH_MAX_FAILS + '). Intenta de nuevo.';
        }
        for (var i = 0; i < 4; i++) {
            var d = document.getElementById('auth-pin-' + i);
            if (d) { d.value = ''; d.style.borderColor = '#ef4444'; }
        }
        setTimeout(function() {
            for (var j = 0; j < 4; j++) {
                var e2 = document.getElementById('auth-pin-' + j);
                if (e2) e2.style.borderColor = '#334155';
            }
            var first = document.getElementById('auth-pin-0');
            if (first) first.focus();
        }, 800);
    });
}

// ── Session Management ──
function authCreateSession(op) {
    var expiry = new Date(Date.now() + AUTH_SESSION_HOURS * 3600000);
    var session = {
        operatorId: op.id,
        operatorName: op.name,
        role: op.role || 'Técnico',
        loginAt: new Date().toISOString(),
        expiresAt: expiry.toISOString()
    };
    localStorage.setItem(AUTH_LS_KEY, JSON.stringify(session));

    authState.currentUser = { id: op.id, name: op.name, role: op.role || 'Técnico' };
    authState.sessionActive = true;
    authState.sessionExpiry = expiry;
    _authStartSessionWatch();

    // Hide overlay
    var overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'none';

    // Show welcome toast
    showToast('Bienvenido, ' + op.name, 'success');

    // Continue app initialization
    authUpdateUI();
    authRenderOperatorPicker();
    if (typeof initializeSystem !== 'undefined') {
        // Re-run init now that we're authenticated
        initializeSystem();
    }

    // Sesión de dispositivo con Firebase (Email/Password)
    authFirebaseSignIn();
}

// [v15.6] Cerrar sesión → volver al muro de login (con confirmación)
function authSignOut() {
    var doSignOut = function() {
        var prev = authState.currentUser;
        if (prev && typeof auditLog === 'function') auditLog('auth', 'logout', { type: 'operator', label: prev.name });
        try { localStorage.removeItem(AUTH_LS_KEY); } catch(e) {}
        authState.currentUser = null;
        authState.sessionActive = false;
        authState.sessionExpiry = null;
        authShowLogin();
    };
    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog({ title: 'Cambiar usuario', message: '¿Cerrar sesión y volver a la pantalla de acceso?', type: 'info', confirmText: 'Cerrar sesión', cancelText: 'Cancelar' }).then(function(ok) { if (ok) doSignOut(); });
    } else { doSignOut(); }
}

/**
 * Usuario de la sesión actual, o `null` si no hay sesión.
 * Antes fabricaba {id:0, name:'Laboratorio'} como efecto secundario de un getter,
 * que es como aparecían filas fantasma "Laboratorio" en la auditoría: acciones sin
 * sesión quedaban atribuidas a un usuario inventado en vez de fallar visiblemente.
 */
function authGetCurrentUser() {
    return (authState && authState.sessionActive) ? authState.currentUser : null;
}

/** Nombre del usuario de sesión para atribución en texto. */
function authGetCurrentUserName(fallback) {
    var u = authGetCurrentUser();
    return (u && u.name) ? u.name : (fallback || 'Sistema');
}

// [Fase 2] authSetOperator / authOnPickOperator eliminados: restos del selector de
// operador sin contraseña previo al muro de PIN (v15.6). authSetOperator activaba
// sesión sin credencial y seguía siendo invocable desde la consola.

// [v15.6] Con el muro de PIN reactivado, el selector sin contraseña se
// retira: el chip muestra el usuario de la sesión y permite cambiar de
// usuario (cierra sesión → login con PIN).
function authRenderOperatorPicker() {
    var el = document.getElementById('op-picker');
    if (!el) return;
    var cur = (authState.currentUser && authState.currentUser.name) || 'Laboratorio';
    el.innerHTML = '<button onclick="authSignOut()" title="Cambiar de usuario (cerrar sesión)" ' +
        'style="display:flex;align-items:center;gap:4px;font-size:11px;background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.18);border-radius:6px;padding:4px 8px;cursor:pointer;max-width:170px;min-height:32px;">' +
        '<span>👤</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(cur) + '</span></button>';
}

function authBypassLogin() {
    // [v15.6] Solo para el setup inicial: si ya existe cualquier operador, el
    // bypass de administrador queda deshabilitado (no es una puerta trasera)
    var anyOp = (typeof pnState !== 'undefined' && pnState.operators) ? pnState.operators.some(function(o) { return !o.deleted; }) : false;
    if (anyOp) { showToast('Selecciona un operador e ingresa tu PIN.', 'error'); return; }
    authState.currentUser = { id: 0, name: 'Administrador', role: 'Admin' };
    authState.sessionActive = true;
    var expiry = new Date(Date.now() + 2 * 3600000); // 2 hours for admin bypass
    authState.sessionExpiry = expiry;
    var session = { operatorId: 0, operatorName: 'Administrador', role: 'Admin', loginAt: new Date().toISOString(), expiresAt: expiry.toISOString() };
    localStorage.setItem(AUTH_LS_KEY, JSON.stringify(session));

    var overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'none';
    showToast('Acceso de administrador (2h). Configura operadores y PINs en Panel > Usuarios.', 'info');
    authUpdateUI();
    if (typeof initializeSystem !== 'undefined') initializeSystem();
    authFirebaseSignIn();
}

function authBypassForOperator(idx) {
    // [v15.6] Entrada rápida SOLO durante el setup inicial (ningún operador
    // tiene PIN todavía). Si ya hay algún PIN configurado, se exige PIN.
    var operators = (typeof pnState !== 'undefined' && pnState.operators) ? pnState.operators.filter(function(o) { return o.active; }) : [];
    var op = operators[idx];
    if (!op) return;
    var anyPin = operators.some(function(o) { return _authHasPin(o); });
    if (anyPin) { showSelected(idx); return; }
    // Un operador `provisional` fue sembrado localmente por pnInit en un dispositivo
    // que nunca ha sincronizado — no es una cuenta real y no puede abrir sesión sin
    // credencial. Antes, esto entregaba una sesión completa de 12 h en cualquier
    // navegador nuevo con sólo tocar un nombre, antes de que la nube entregara el
    // roster real con PINs. Hay que conectar el dispositivo primero.
    if (op.provisional) {
        if (typeof auditLog === 'function') auditLog('auth', 'login_blocked_provisional', { type: 'operator', label: op.name });
        _authShowConnectFirst();
        return;
    }
    if (typeof auditLog === 'function') auditLog('auth', 'login', { type: 'operator', label: op.name });
    authCreateSession({ id: op.id, name: op.name, role: op.role || 'Técnico' });
}

/**
 * Este dispositivo nunca ha sincronizado y sólo tiene operadores sembrados.
 * Pedir la contraseña del laboratorio para bajar el roster real antes de entrar.
 */
function _authShowConnectFirst() {
    if (typeof showToast === 'function') {
        showToast('Este dispositivo aún no se ha conectado al laboratorio. Ingresa la contraseña del laboratorio para descargar los operadores.', 'error');
    }
    if (typeof fbShowAuthPrompt === 'function') fbShowAuthPrompt();
    else if (typeof showToast === 'function') showToast('Sin conexión configurada. Contacta al administrador del laboratorio.', 'error');
}

// Helper: cuando el bypass no aplica, ir a la pantalla de PIN del operador
function showSelected(idx) {
    if (typeof authSelectOperator === 'function') authSelectOperator(idx);
}

// ── UI Updates ──
function authUpdateUI() {
    if (!authState.currentUser) return;

    // Pre-select the logged-in operator in COP15 dropdowns
    var opName = authState.currentUser.name;
    ['reg_operator', 'op_recep', 'test_responsible', 'precond_responsible', 'simple_operator'].forEach(function(id) {
        var sel = document.getElementById(id);
        if (sel && !sel.value && opName) {
            // Only pre-select if no value is already selected
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === opName) { sel.value = opName; break; }
            }
        }
    });
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  WebAuthn / Biometric Authentication                                ║
// ╚══════════════════════════════════════════════════════════════════════╝

function authHasStoredCredential(operatorId) {
    try {
        var creds = JSON.parse(localStorage.getItem(AUTH_WEBAUTHN_LS) || '{}');
        return !!creds['op_' + operatorId];
    } catch(e) { return false; }
}

function authOfferBiometricRegistration(operatorId) {
    if (!window.PublicKeyCredential) return;
    // WebAuthn requires a secure context (valid HTTPS, not self-signed certs)
    if (!window.isSecureContext) return;
    if (authHasStoredCredential(operatorId)) return;

    var user = authState.currentUser;
    if (!user) return;

    // Ask user if they want to register biometric
    showConfirmDialog({ title: '🔐 Registro biométrico', message: '¿Quieres registrar tu huella digital / Face ID para acceso rapido?\n\n(Puedes usar la huella en vez del PIN la proxima vez)', type: 'info', confirmText: 'Registrar', cancelText: 'No, gracias' }).then(function(ok) {
        if (!ok) return;
        authRegisterBiometric(operatorId);
    });
}

function authRegisterBiometric(operatorId) {
    if (!window.PublicKeyCredential) { showToast('WebAuthn no disponible en este dispositivo', 'error'); return; }
    if (!window.isSecureContext) { showToast('Huella digital requiere HTTPS con certificado valido', 'error'); return; }

    var user = authState.currentUser;
    if (!user) return;

    // Generate challenge
    var challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    var userId = new TextEncoder().encode('kia_op_' + operatorId);

    var createOptions = {
        publicKey: {
            challenge: challenge,
            rp: { name: 'KIA EmLab', id: location.hostname || 'localhost' },
            user: {
                id: userId,
                name: user.name,
                displayName: user.name
            },
            pubKeyCredParams: [
                { type: 'public-key', alg: -7 },   // ES256
                { type: 'public-key', alg: -257 }  // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'platform',  // Use device biometric
                userVerification: 'required'
            },
            timeout: 60000
        }
    };

    navigator.credentials.create(createOptions).then(function(credential) {
        // Store credential ID locally
        var creds = {};
        try { creds = JSON.parse(localStorage.getItem(AUTH_WEBAUTHN_LS) || '{}'); } catch(e) {}
        creds['op_' + operatorId] = {
            credentialId: Array.from(new Uint8Array(credential.rawId)),
            registered: new Date().toISOString()
        };
        localStorage.setItem(AUTH_WEBAUTHN_LS, JSON.stringify(creds));
        showToast('Huella digital registrada exitosamente', 'success');
    }).catch(function(err) {
        console.warn('WebAuthn registration failed:', err);
        showToast('No se pudo registrar la huella: ' + err.message, 'error');
    });
}

function authVerifyBiometric() {
    var op = window._authSelectedOp;
    if (!op) return;

    if (!window.PublicKeyCredential) { showToast('WebAuthn no disponible', 'error'); return; }
    if (!window.isSecureContext) { showToast('Huella digital requiere HTTPS con certificado valido', 'error'); return; }

    var creds = {};
    try { creds = JSON.parse(localStorage.getItem(AUTH_WEBAUTHN_LS) || '{}'); } catch(e) {}
    var stored = creds['op_' + op.id];
    if (!stored) { showToast('No hay huella registrada', 'error'); return; }

    var challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    var credentialId = new Uint8Array(stored.credentialId);

    var getOptions = {
        publicKey: {
            challenge: challenge,
            allowCredentials: [{
                type: 'public-key',
                id: credentialId,
                transports: ['internal']
            }],
            userVerification: 'required',
            timeout: 60000
        }
    };

    navigator.credentials.get(getOptions).then(function(assertion) {
        // Biometric verified — create session
        authCreateSession(op);
    }).catch(function(err) {
        console.warn('WebAuthn verification failed:', err);
        var errEl = document.getElementById('auth-pin-error');
        if (errEl) errEl.textContent = 'Verificacion biometrica fallida. Usa tu PIN.';
    });
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Firebase Anonymous Auth                                            ║
// ╚══════════════════════════════════════════════════════════════════════╝

function authFirebaseSignIn() {
    // [v15.6] Ya no hay sign-in anónimo (las Security Rules lo rechazan).
    // La sesión del dispositivo es Email/Password y la gestiona firebase-sync
    // (fbEnsureAuth + prompt de contraseña); aquí solo se delega.
    if (typeof fbEnsureAuth === 'function') {
        try { fbEnsureAuth(); } catch(e) { console.warn('authFirebaseSignIn:', e); }
    }
}
