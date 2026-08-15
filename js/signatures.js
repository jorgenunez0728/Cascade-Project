// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Digital Signature Capture Module                      ║
// ║  Reusable modal using SignaturePad (CDN already loaded).           ║
// ║  Two capture moments: technician (VETS photo) + releaser.         ║
// ╚══════════════════════════════════════════════════════════════════════╝

var _sigPadInstance = null;
var _sigCaptureOpts = null;

function sigCaptureOpen(opts) {
    opts = opts || {};
    _sigCaptureOpts = opts;

    var existing = document.querySelector('.sig-capture-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'sig-capture-overlay';
    overlay.innerHTML =
        '<div class="sig-capture-box">' +
            '<div class="sig-capture-header">' +
                '<div class="sig-capture-title">' + (opts.title || 'Firma Digital') + '</div>' +
                '<button type="button" class="sig-capture-close" onclick="sigCaptureCancel()" aria-label="Cancelar firma">&times;</button>' +
            '</div>' +
            // [Fase 4] El nombre se precarga desde la SESIÓN y queda bloqueado.
            // Antes era texto libre: cualquiera podía firmar con el nombre de otro,
            // y una bitácora cuyo "quién" es un campo editable no es una bitácora.
            // "Firmar por otra persona" sigue siendo posible, pero explícito, con
            // permiso de supervisor y registrando quién lo hizo (signedOnBehalfBy).
            '<div class="sig-capture-field">' +
                '<label>Nombre completo:</label>' +
                '<input type="text" id="sig-signer-name" class="sig-input" value="' + (opts.signerName || '') + '"' +
                    (opts.lockName ? ' readonly style="background:#f1f5f9;cursor:not-allowed;"' : '') +
                    ' placeholder="Escribe tu nombre" autocomplete="name">' +
                (opts.lockName
                    ? '<button type="button" id="sig-onbehalf-btn" onclick="sigUnlockName()" ' +
                      'style="margin-top:6px;background:none;border:none;color:var(--info-text);font-size: var(--fs-sm);cursor:pointer;text-decoration:underline;padding:0;">' +
                      'Firmar por otra persona…</button>'
                    : '') +
            '</div>' +
            '<div class="sig-capture-field">' +
                '<label>Rol:</label>' +
                '<div class="sig-role-display">' + (opts.role || 'Tecnico') + '</div>' +
            '</div>' +
            '<div class="sig-capture-canvas-wrap">' +
                '<canvas id="sig-capture-canvas"></canvas>' +
                '<div class="sig-hint">Firme arriba con el dedo o mouse</div>' +
            '</div>' +
            '<div class="sig-capture-actions">' +
                '<button type="button" class="btn btn-ghost" onclick="sigCaptureClear()">Borrar</button>' +
                '<button type="button" class="btn btn-ghost" onclick="sigCaptureCancel()">Cancelar</button>' +
                '<button type="button" class="btn btn-primary" onclick="sigCaptureConfirm()">Firmar y Continuar</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);
    overlay.style.display = 'flex';

    var canvas = document.getElementById('sig-capture-canvas');
    if (canvas) {
        var wrap = canvas.parentElement;
        canvas.width = Math.min(wrap.clientWidth - 16, 560);
        canvas.height = 180;
        if (typeof SignaturePad !== 'undefined') {
            _sigPadInstance = new SignaturePad(canvas, { backgroundColor: '#ffffff', penColor: '#000000' });
        } else {
            console.warn('SignaturePad library not available');
        }
    }
    if (typeof a11yDialog === 'function') {
        window._sigA11yClose = a11yDialog(overlay, {
            labelId: null,
            onClose: function () {
                var o = document.querySelector('.sig-capture-overlay');
                if (o) o.remove();
                _sigPadInstance = null;
                _sigCaptureOpts = null;
            }
        });
    } else {
        var nameEl = document.getElementById('sig-signer-name');
        if (nameEl && !nameEl.readOnly) nameEl.focus();
    }
}

function sigCaptureClear() {
    if (_sigPadInstance) _sigPadInstance.clear();
}

/**
 * [Fase 4] Desbloquea el nombre para firmar en representación de otra persona.
 * Es un caso real (capturar datos de un compañero que está dentro de la celda),
 * pero deja de ser invisible: exige permiso de supervisor, marca la firma con
 * `signedOnBehalfBy` y queda en la auditoría.
 */
function sigUnlockName() {
    if (typeof authRequire === 'function' && !authRequire('users.manage', 'firmar en representación de otra persona')) return;
    var el = document.getElementById('sig-signer-name');
    if (!el) return;
    el.readOnly = false;
    el.style.background = '';
    el.style.cursor = '';
    el.value = '';
    el.focus();
    _sigOnBehalf = true;
    var btn = document.getElementById('sig-onbehalf-btn');
    if (btn) btn.textContent = '⚠ Firmando por otra persona — quedará registrado';
    if (typeof showToast === 'function') showToast('Escribe el nombre de quien firma. Quedará registrado que lo capturaste tú.', 'warning');
}
var _sigOnBehalf = false;

function sigCaptureConfirm() {
    if (!_sigPadInstance || _sigPadInstance.isEmpty()) {
        if (typeof showToast === 'function') showToast('Por favor firme antes de continuar', 'warning');
        return;
    }
    var nameEl = document.getElementById('sig-signer-name');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
        if (typeof showToast === 'function') showToast('Escriba su nombre', 'warning');
        return;
    }

    var result = {
        signerName: name,
        signerRole: (_sigCaptureOpts && _sigCaptureOpts.role) || 'Tecnico',
        signedAt: new Date().toISOString(),
        dataUrl: _sigPadInstance.toDataURL('image/png')
    };
    // [Fase 2] Identidad de la SESIÓN junto al nombre escrito. `signerName` es texto
    // libre, así que no sirve para reglas de control; estos campos sí. Es lo que hace
    // posible el doble par de ojos (authCanApproveVehicle) y deja evidencia cuando
    // alguien firma con un nombre distinto al de su sesión.
    var _sessUser = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
    if (_sessUser) {
        result.sessionUserId = _sessUser.id;
        result.sessionUserName = _sessUser.name;
        result.sessionUserRole = _sessUser.role;
    }
    if (typeof FB_DEVICE_ID !== 'undefined') result.deviceId = FB_DEVICE_ID;
    // [Fase 4] Firma en representación de otro: queda explícito quién la capturó.
    if (_sigOnBehalf && _sessUser && name !== _sessUser.name) {
        result.signedOnBehalfBy = _sessUser.name;
        result.signedOnBehalfById = _sessUser.id;
        if (typeof auditLog === 'function') {
            auditLog('cop15', 'signature_on_behalf', { type: 'signature', label: name },
                     'Capturada por ' + _sessUser.name + ' en representación de ' + name);
        }
    }
    _sigOnBehalf = false;
    var cb = _sigCaptureOpts && _sigCaptureOpts.onSave;
    sigCaptureDismiss();
    if (cb) cb(result);
}

function sigCaptureCancel() {
    var cb = _sigCaptureOpts && _sigCaptureOpts.onCancel;
    sigCaptureDismiss();
    if (cb) cb();
}

function sigCaptureDismiss() {
    if (window._sigA11yClose) {
        var fn = window._sigA11yClose;
        window._sigA11yClose = null;
        fn();
        return;
    }
    var o = document.querySelector('.sig-capture-overlay');
    if (o) o.remove();
    _sigPadInstance = null;
    _sigCaptureOpts = null;
}
