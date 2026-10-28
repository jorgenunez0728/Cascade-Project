// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Digital Signature Capture Module                      ║
// ║  Modal reutilizable con lienzo de firma PROPIO (SigPad, 3.24.1).    ║
// ║  Two capture moments: technician (VETS photo) + releaser.         ║
// ╚══════════════════════════════════════════════════════════════════════╝

// [3.24.1] LIENZO DE FIRMA PROPIO. Antes la firma usaba `signature_pad` desde cdnjs:
// si la red del laboratorio bloqueaba el CDN (o el equipo abría sin internet), el
// lienzo no pintaba y no se podía liberar ni aprobar nada. Ahora no depende de nada
// externo. La interfaz es la que el resto del código ya usaba: isEmpty(), clear(),
// toDataURL('image/png').
//
// Los trazos se guardan en coordenadas LÓGICAS (el tamaño con que se abrió el lienzo),
// así que:
//   · el toque cae donde está el dedo aunque el CSS estire el lienzo (antes se corría);
//   · se pinta nítido en pantallas de alta densidad (backing store × devicePixelRatio);
//   · la imagen que se guarda es SIEMPRE de tamaño lógico (≤ 560×180), no ×3 en un
//     teléfono: las firmas son ~95 % del peso de un vehículo en la nube (2.3.0).
var SIG_MIN_W = 0.8;       // grosor mínimo del trazo (rápido)
var SIG_MAX_W = 2.6;       // grosor máximo (lento)
var SIG_MIN_DIST = 1.5;    // px lógicos: puntos más juntos se ignoran (ruido del dedo)

/** [3.24.1] Grosor del trazo según la velocidad (px/ms), suavizado con el anterior. PURA. */
function sigStrokeWidth(velocity, prevWidth) {
    var target = Math.max(SIG_MAX_W / (velocity + 1), SIG_MIN_W);
    return prevWidth == null ? target : prevWidth * 0.6 + target * 0.4;
}

/** [3.24.1] Agrega un punto al trazo (x,y en px lógicos, t en ms). Devuelve false si se descarta. PURA sobre `stroke`. */
function sigStrokeAdd(stroke, x, y, t) {
    var last = stroke.length ? stroke[stroke.length - 1] : null;
    if (!last) { stroke.push({ x: x, y: y, t: t, w: sigStrokeWidth(0, null), v: 0 }); return true; }
    var d = Math.hypot(x - last.x, y - last.y);
    if (d < SIG_MIN_DIST) return false;
    var dt = Math.max(1, t - last.t);
    var v = 0.7 * (last.v || 0) + 0.3 * (d / dt);
    stroke.push({ x: x, y: y, t: t, w: sigStrokeWidth(v, last.w), v: v });
    return true;
}

/** [3.24.1] Pinta el tramo que termina en el punto i del trazo (curva por puntos medios). */
function _sigDrawSegment(ctx, stroke, i) {
    var p = stroke[i];
    if (i === 0) return;
    var a = stroke[i - 1], b = i >= 2 ? stroke[i - 2] : null;
    var m0 = b ? { x: (b.x + a.x) / 2, y: (b.y + a.y) / 2 } : a;
    var m1 = { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 };
    ctx.beginPath();
    ctx.lineWidth = (a.w + p.w) / 2;
    ctx.moveTo(m0.x, m0.y);
    ctx.quadraticCurveTo(a.x, a.y, m1.x, m1.y);
    ctx.stroke();
}

/** [3.24.1] Pinta un trazo completo (para repintar y exportar). Un toque solo = punto. */
function _sigDrawStroke(ctx, stroke) {
    if (!stroke.length) return;
    if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, stroke[0].w, 0, Math.PI * 2);
        ctx.fill();
        return;
    }
    for (var i = 1; i < stroke.length; i++) _sigDrawSegment(ctx, stroke, i);
    // El último medio tramo (de su punto medio al punto final).
    var a = stroke[stroke.length - 2], p = stroke[stroke.length - 1];
    ctx.beginPath(); ctx.lineWidth = p.w;
    ctx.moveTo((a.x + p.x) / 2, (a.y + p.y) / 2); ctx.lineTo(p.x, p.y); ctx.stroke();
}

function _sigPrepCtx(ctx, scale, color) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color; ctx.fillStyle = color;
}

/**
 * [3.24.1] Lienzo de firma. `opts = {width, height, penColor, background, onChange}`.
 * width/height son el tamaño LÓGICO (el de la imagen que se guarda).
 */
function SigPad(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.w = Math.max(80, Math.round(opts.width || 520));
    this.h = Math.max(60, Math.round(opts.height || 180));
    this.pen = opts.penColor || '#000000';
    this.bg = opts.background || '#ffffff';
    this.onChange = opts.onChange || null;
    this.strokes = [];
    this._cur = null;
    this._pid = null;
    var dpr = Math.min(3, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
    this.scale = dpr;
    canvas.width = Math.round(this.w * dpr);
    canvas.height = Math.round(this.h * dpr);
    canvas.style.width = this.w + 'px';
    canvas.style.maxWidth = '100%';
    canvas.style.height = this.h + 'px';
    this.ctx = canvas.getContext('2d');
    this._paintAll();
    var self = this;
    this._h = {
        down: function(e) { self._down(e); },
        move: function(e) { self._move(e); },
        up: function(e) { self._up(e); }
    };
    canvas.addEventListener('pointerdown', this._h.down);
    canvas.addEventListener('pointermove', this._h.move);
    canvas.addEventListener('pointerup', this._h.up);
    canvas.addEventListener('pointercancel', this._h.up);
    canvas.addEventListener('lostpointercapture', this._h.up);
}
SigPad.prototype._point = function(e) {
    var r = this.canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) * this.w / (r.width || this.w);
    var y = (e.clientY - r.top) * this.h / (r.height || this.h);
    return { x: Math.max(0, Math.min(this.w, x)), y: Math.max(0, Math.min(this.h, y)), t: e.timeStamp || Date.now() };
};
SigPad.prototype._down = function(e) {
    if (e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    this._pid = e.pointerId;
    this._cur = [];
    this.strokes.push(this._cur);
    var p = this._point(e);
    sigStrokeAdd(this._cur, p.x, p.y, p.t);
    _sigPrepCtx(this.ctx, this.scale, this.pen);
    _sigDrawStroke(this.ctx, this._cur);
    if (this.onChange) this.onChange(this);
};
SigPad.prototype._move = function(e) {
    if (!this._cur || e.pointerId !== this._pid) return;
    e.preventDefault();
    var evs = (typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents()) || [];
    if (!evs.length) evs = [e];
    _sigPrepCtx(this.ctx, this.scale, this.pen);
    for (var i = 0; i < evs.length; i++) {
        var p = this._point(evs[i]);
        if (sigStrokeAdd(this._cur, p.x, p.y, p.t)) _sigDrawSegment(this.ctx, this._cur, this._cur.length - 1);
    }
};
SigPad.prototype._up = function(e) {
    if (!this._cur || (e && e.pointerId !== this._pid)) return;
    this._cur = null; this._pid = null;
    this._paintAll();   // repinta limpio (cierra el último medio tramo)
};
SigPad.prototype._paintAll = function() {
    var c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = this.bg; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    _sigPrepCtx(c, this.scale, this.pen);
    for (var i = 0; i < this.strokes.length; i++) _sigDrawStroke(c, this.strokes[i]);
};
SigPad.prototype.isEmpty = function() {
    return !this.strokes.some(function(s) { return s.length > 0; });
};
SigPad.prototype.clear = function() {
    this.strokes = []; this._cur = null; this._pid = null;
    this._paintAll();
    if (this.onChange) this.onChange(this);
};
/** Imagen en tamaño LÓGICO, fondo blanco (lo que guarda la firma y lee el F05). */
SigPad.prototype.toDataURL = function(type) {
    var out = document.createElement('canvas');
    out.width = this.w; out.height = this.h;
    var c = out.getContext('2d');
    c.fillStyle = this.bg; c.fillRect(0, 0, this.w, this.h);
    _sigPrepCtx(c, 1, this.pen);
    for (var i = 0; i < this.strokes.length; i++) _sigDrawStroke(c, this.strokes[i]);
    return out.toDataURL(type || 'image/png');
};
SigPad.prototype.off = function() {
    var cv = this.canvas, h = this._h;
    if (!cv || !h) return;
    cv.removeEventListener('pointerdown', h.down);
    cv.removeEventListener('pointermove', h.move);
    cv.removeEventListener('pointerup', h.up);
    cv.removeEventListener('pointercancel', h.up);
    cv.removeEventListener('lostpointercapture', h.up);
    this._h = null;
};

/** [3.24.1] Suelta el lienzo abierto (quita sus oyentes). */
function _sigPadRelease() {
    if (_sigPadInstance && typeof _sigPadInstance.off === 'function') _sigPadInstance.off();
    _sigPadInstance = null;
}

/** [3.24.1] Guía visual: el recuadro dice si ya hay firma (borde sólido, sin la pista). */
function _sigPadChanged(pad) {
    var wrap = pad && pad.canvas && pad.canvas.parentElement;
    if (!wrap) return;
    var empty = pad.isEmpty();
    wrap.classList.toggle('is-signed', !empty);
    if (!empty) wrap.classList.remove('sig-need');
}

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
                    (opts.lockName ? ' readonly style="background:var(--surface-alt);cursor:not-allowed;"' : '') +
                    ' placeholder="Escribe tu nombre" autocomplete="name">' +
                (opts.lockName
                    ? '<button type="button" id="sig-onbehalf-btn" onclick="sigUnlockName()" ' +
                      'style="margin-top: var(--space-sm);background:none;border:none;color:var(--info-text);font-size: var(--fs-sm);cursor:pointer;text-decoration:underline;padding:0;">' +
                      'Firmar por otra persona…</button>'
                    : '') +
            '</div>' +
            '<div class="sig-capture-field">' +
                '<label>Rol:</label>' +
                '<div class="sig-role-display">' + (opts.role || 'Tecnico') + '</div>' +
            '</div>' +
            '<div class="sig-capture-canvas-wrap">' +
                '<canvas id="sig-capture-canvas" aria-label="Recuadro de firma"></canvas>' +
                '<div class="sig-hint">✍️ Firma aquí con el dedo, el lápiz o el mouse</div>' +
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
        // [3.24.1] Lienzo propio: el ancho lógico es el del recuadro (tope 560, como antes).
        var w = Math.min((wrap && wrap.clientWidth) || 520, 560);
        _sigPadInstance = new SigPad(canvas, { width: w, height: 180, penColor: '#000000', background: '#ffffff', onChange: _sigPadChanged });
    }
    if (typeof a11yDialog === 'function') {
        window._sigA11yClose = a11yDialog(overlay, {
            labelId: null,
            onClose: function () {
                var o = document.querySelector('.sig-capture-overlay');
                if (o) o.remove();
                _sigPadRelease();
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
        // [3.24.1] El aviso va en el recuadro (regla 2.12.0), no solo en un toast que se va.
        var _wrap = document.querySelector('.sig-capture-canvas-wrap');
        if (_wrap) _wrap.classList.add('sig-need');
        if (typeof showToast === 'function') showToast('Firma en el recuadro antes de continuar.', 'warning');
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
    _sigPadRelease();
    _sigCaptureOpts = null;
}
