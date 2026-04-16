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
                '<button type="button" class="sig-capture-close" onclick="sigCaptureCancel()">&times;</button>' +
            '</div>' +
            '<div class="sig-capture-field">' +
                '<label>Nombre completo:</label>' +
                '<input type="text" id="sig-signer-name" class="sig-input" value="' + (opts.signerName || '') + '" placeholder="Escribe tu nombre" autocomplete="name">' +
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
}

function sigCaptureClear() {
    if (_sigPadInstance) _sigPadInstance.clear();
}

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
    var o = document.querySelector('.sig-capture-overlay');
    if (o) o.remove();
    _sigPadInstance = null;
    _sigCaptureOpts = null;
}
