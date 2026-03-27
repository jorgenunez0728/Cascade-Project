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

// ── Initialization ──
function authInit() {
    // Check for existing valid session
    try {
        var saved = localStorage.getItem(AUTH_LS_KEY);
        if (saved) {
            var session = JSON.parse(saved);
            if (session.expiresAt && new Date(session.expiresAt).getTime() > Date.now()) {
                authState.currentUser = { id: session.operatorId, name: session.operatorName, role: session.role };
                authState.sessionActive = true;
                authState.sessionExpiry = new Date(session.expiresAt);
                authUpdateUI();
                return;
            }
            // Session expired
            localStorage.removeItem(AUTH_LS_KEY);
        }
    } catch(e) {}

    // No valid session — show login
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
    var hasAnyPin = operators.some(function(o) { return o.pinHash; });

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
    } else if (!hasAnyPin) {
        html += '<div style="text-align:center;padding:20px;color:#f59e0b;font-size:11px;margin-bottom:16px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:8px;">';
        html += 'Ningun operador tiene PIN configurado. Ve a Panel > Usuarios para asignar PINs.';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">';
        operators.forEach(function(op, idx) {
            var initials = op.name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
            var colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
            var c = colors[idx % colors.length];
            html += '<button onclick="authBypassForOperator(' + op.id + ',\'' + op.name.replace(/'/g, "\\'") + '\',\'' + (op.role || 'Técnico').replace(/'/g, "\\'") + '\')" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;background:#111827;border:2px solid #1e293b;border-radius:12px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor=\'' + c + '\'" onmouseout="this.style.borderColor=\'#1e293b\'">';
            html += '<div style="width:50px;height:50px;border-radius:50%;background:' + c + '20;color:' + c + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">' + initials + '</div>';
            html += '<div style="color:#e2e8f0;font-size:12px;font-weight:700;">' + op.name + '</div>';
            html += '<div style="color:#64748b;font-size:9px;">' + (op.role || 'Técnico') + '</div>';
            html += '</button>';
        });
        html += '</div>';
    } else {
        html += '<div style="color:#94a3b8;font-size:12px;text-align:center;margin-bottom:16px;">Selecciona tu usuario</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">';
        operators.forEach(function(op, idx) {
            var initials = op.name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
            var colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
            var c = colors[idx % colors.length];
            var hasPin = !!op.pinHash;
            html += '<button onclick="authSelectOperator(' + idx + ')" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;background:#111827;border:2px solid #1e293b;border-radius:12px;cursor:pointer;transition:all 0.2s;' + (!hasPin ? 'opacity:0.4;' : '') + '" ' + (!hasPin ? 'disabled title="Sin PIN configurado"' : '') + ' onmouseover="this.style.borderColor=\'' + c + '\'" onmouseout="this.style.borderColor=\'#1e293b\'">';
            html += '<div style="width:50px;height:50px;border-radius:50%;background:' + c + '20;color:' + c + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">' + initials + '</div>';
            html += '<div style="color:#e2e8f0;font-size:12px;font-weight:700;">' + op.name + '</div>';
            html += '<div style="color:#64748b;font-size:9px;">' + (op.role || 'Técnico') + (hasPin ? '' : ' (sin PIN)') + '</div>';
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
    html += '<div style="font-size:13px;font-weight:700;color:#c4b5fd;margin-bottom:12px;">' + op.name + '</div>';
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
    } else if (webAuthnAvailable && !hasBiometric && op.pinHash) {
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

function authVerifyAndLogin(pin) {
    var op = window._authSelectedOp;
    if (!op) return;

    // Find the operator in the full pnState list to get the correct index
    var fullIdx = -1;
    pnState.operators.forEach(function(o, i) { if (o.id === op.id) fullIdx = i; });
    if (fullIdx === -1) return;

    if (pnVerifyPin(fullIdx, pin)) {
        authCreateSession(op);
        // Offer biometric registration (only in secure context — no self-signed certs)
        if (window.PublicKeyCredential && window.isSecureContext && !authHasStoredCredential(op.id)) {
            setTimeout(function() { authOfferBiometricRegistration(op.id); }, 1500);
        }
    } else {
        var err = document.getElementById('auth-pin-error');
        if (err) err.textContent = 'PIN incorrecto. Intenta de nuevo.';
        // Clear inputs
        for (var i = 0; i < 4; i++) {
            var d = document.getElementById('auth-pin-' + i);
            if (d) { d.value = ''; d.style.borderColor = '#ef4444'; }
        }
        setTimeout(function() {
            for (var i = 0; i < 4; i++) {
                var d = document.getElementById('auth-pin-' + i);
                if (d) d.style.borderColor = '#334155';
            }
            var first = document.getElementById('auth-pin-0');
            if (first) first.focus();
        }, 800);
    }
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

    // Hide overlay
    var overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'none';

    // Show welcome toast
    showToast('Bienvenido, ' + op.name, 'success');

    // Continue app initialization
    authUpdateUI();
    if (typeof initializeSystem !== 'undefined') {
        // Re-run init now that we're authenticated
        initializeSystem();
    }

    // Firebase anonymous sign-in (for security rules)
    authFirebaseSignIn();
}

function authSignOut() {
    showConfirmDialog({ title: '🔒 Cerrar sesión', message: '¿Cerrar sesion?', type: 'warning', confirmText: 'Cerrar', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;
        localStorage.removeItem(AUTH_LS_KEY);
        authState.currentUser = null;
        authState.sessionActive = false;
        authState.sessionExpiry = null;
        authShowLogin();
        showToast('Sesion cerrada', 'info');
    });
}

function authGetCurrentUser() {
    return authState.currentUser;
}

function authBypassLogin() {
    // For initial setup when no operators exist
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

function authBypassForOperator(id, name, role) {
    // Quick entry when PINs haven't been set yet
    var op = { id: id, name: name, role: role };
    authCreateSession(op);
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
    // Anonymous sign-in to Firebase for Firestore security rules
    if (typeof firebase === 'undefined') return;
    if (!firebase.apps || firebase.apps.length === 0) return;

    // Skip on non-HTTP origins (content://, file://) — signInAnonymously() may hang
    // and poison the Firebase SDK internal state, causing Firestore operations to hang too
    var proto = location.protocol;
    if (proto !== 'http:' && proto !== 'https:') {
        console.log('Firebase auth: Skipping on ' + proto + ' origin');
        return;
    }

    try {
        var auth = firebase.auth();
        if (auth.currentUser) return; // Already signed in

        auth.signInAnonymously().then(function() {
            console.log('Firebase anonymous auth successful');
        }).catch(function(err) {
            console.warn('Firebase anonymous auth failed:', err);
        });
    } catch(e) {
        console.warn('Firebase auth error:', e);
    }
}
