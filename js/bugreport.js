// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Reporte de Bugs (v17.13)                                ║
// ║  Botón flotante 🐞 → captura automática → comentario → GitHub Issue  ║
// ║                                                                      ║
// ║  Flujo: el técnico pica el 🐞 desde cualquier pantalla; html2canvas   ║
// ║  (diferido, mismo patrón que SheetJS en projects.js) rasteriza lo    ║
// ║  que se ve; el modal deja escribir qué pasó y enviar o DESCARTAR     ║
// ║  (descartar no guarda nada, ni local ni en la nube). Al enviar el    ║
// ║  reporte se encola en localStorage y se intenta publicar: respaldo   ║
// ║  en Firestore (bandeja Datos → 🐞 Bugs) + Issue en GitHub con la     ║
// ║  captura embebida. Sin red/token el reporte espera en la cola y se   ║
// ║  reenvía solo al recuperar conexión.                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

// html2canvas se inyecta SOLO al picar el botón: la app arranca igual de
// rápido y sigue siendo offline-first. Sin internet no hay captura, pero el
// reporte de texto se puede enviar igual (se encola).
var BUG_HTML2CANVAS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

var BUG_QUEUE_KEY = 'kia_bug_queue';
var BUG_SETTINGS_KEY = 'kia_bug_settings';
var BUG_QUEUE_MAX = 3;              // localStorage son ~5MB para TODA la app — 3 capturas pendientes es el techo prudente
var BUG_SHOT_MAX_WIDTH = 1400;      // px — arriba de esto la captura se reescala antes de comprimir
var BUG_SHOT_QUALITY = 0.75;        // JPEG: ~100-300KB por captura
var BUG_ERRORS_MAX = 10;            // cuántos errores JS recientes se adjuntan al issue
var BUG_GH_BRANCH = 'bug-shots';    // rama dedicada para las capturas — nunca main (no ensucia historia ni dispara deploys)
var BUG_GH_DIR = 'bug-reports';
var BUG_DEFAULT_OWNER = 'jorgenunez0728';
var BUG_DEFAULT_REPO = 'Cascade-Project';

// Captura pendiente de decisión (vive solo mientras el modal está abierto).
var _bugPendingShot = null;
var _bugSending = false;

// ══════════════════════════════════════════════════════════════════════
// CARGA DIFERIDA DE html2canvas
// ══════════════════════════════════════════════════════════════════════

function _bugLoadHtml2Canvas(cb) {
    if (window.html2canvas) { cb(true); return; }
    if (window._bugH2CLoading) { window._bugH2CLoading.push(cb); return; }
    window._bugH2CLoading = [cb];
    var done = function(ok) {
        var q = window._bugH2CLoading || []; window._bugH2CLoading = null;
        q.forEach(function(f) { try { f(ok); } catch (e) {} });
    };
    var s = document.createElement('script');
    s.src = BUG_HTML2CANVAS_CDN;
    s.onload = function() { done(!!window.html2canvas); };
    s.onerror = function() { done(false); };
    document.head.appendChild(s);
}

// ══════════════════════════════════════════════════════════════════════
// BOTÓN FLOTANTE
// ══════════════════════════════════════════════════════════════════════

/** Inyecta el 🐞 flotante (siempre visible, en cualquier módulo). Idempotente. */
function bugFabInit() {
    if (document.getElementById('bug-fab')) return;
    var btn = document.createElement('button');
    btn.id = 'bug-fab';
    btn.className = 'bug-fab';
    btn.type = 'button';
    btn.setAttribute('title', 'Reportar una falla (toma una captura de esta pantalla)');
    btn.setAttribute('aria-label', 'Reportar una falla');
    btn.innerHTML = '<span aria-hidden="true">🐞</span><span class="bug-fab-badge" id="bug-fab-badge" hidden>0</span>';
    btn.onclick = bugCaptureStart;
    document.body.appendChild(btn);
    bugUpdateFabBadge();

    // Reintento automático: al recuperar conexión se vacía la cola sola.
    window.addEventListener('online', function() { bugTrySendAll({ silent: true }); });

    // Al arrancar: traer la configuración compartida y vaciar lo que quedó
    // pendiente de la sesión anterior (damos margen a que Firebase autentique).
    setTimeout(function() {
        bugLoadSettings(function() { bugTrySendAll({ silent: true }); });
    }, 6000);
}

/** Pinta el número de reportes en cola sobre el 🐞 (0 = sin badge). */
function bugUpdateFabBadge() {
    var badge = document.getElementById('bug-fab-badge');
    if (!badge) return;
    var n = bugQueueGet().length;
    badge.textContent = n;
    badge.hidden = n === 0;
}

// ══════════════════════════════════════════════════════════════════════
// CAPTURA
// ══════════════════════════════════════════════════════════════════════

/** Pica el 🐞 → rasteriza lo que se ve ahora mismo y abre el modal de confirmación. */
function bugCaptureStart() {
    var fab = document.getElementById('bug-fab');
    if (fab) { fab.disabled = true; fab.classList.add('bug-fab-busy'); }

    var restore = function() {
        if (fab) { fab.disabled = false; fab.classList.remove('bug-fab-busy'); }
    };

    _bugLoadHtml2Canvas(function(ok) {
        if (!ok) {
            restore();
            // Sin html2canvas (sin internet o CDN bloqueado) el reporte de texto
            // sigue siendo útil — se abre el modal sin imagen.
            if (typeof showToast === 'function') showToast('No se pudo cargar el capturador de pantalla — puedes reportar solo con texto.', 'warning');
            bugModalOpen(null);
            return;
        }

        // Escala: en pantallas chicas se renderiza a 2x para que el texto se lea;
        // en escritorio 1x ya alcanza. Después se reescala a BUG_SHOT_MAX_WIDTH.
        var scale = window.innerWidth < 700 ? 2 : 1;

        try {
            window.html2canvas(document.body, {
                scale: scale,
                useCORS: true,
                allowTaint: true,
                logging: false,
                backgroundColor: '#ffffff',
                // Receta estándar de html2canvas para capturar SOLO el viewport
                // (lo que el usuario ve) en vez de la página completa.
                scrollX: -window.scrollX,
                scrollY: -window.scrollY,
                windowWidth: document.documentElement.clientWidth,
                windowHeight: document.documentElement.clientHeight,
                width: window.innerWidth,
                height: window.innerHeight,
                ignoreElements: function(el) {
                    if (!el || !el.id) {
                        return !!(el && el.classList && (el.classList.contains('bug-modal-overlay') || el.classList.contains('bug-fab')));
                    }
                    return el.id === 'bug-fab' || el.id === 'toast-container';
                }
            }).then(function(canvas) {
                restore();
                bugModalOpen(_bugCanvasToDataUrl(canvas));
            }).catch(function(err) {
                console.error('bugCaptureStart error:', err);
                restore();
                if (typeof showToast === 'function') showToast('No se pudo tomar la captura — puedes reportar solo con texto.', 'warning');
                bugModalOpen(null);
            });
        } catch (e) {
            console.error('bugCaptureStart error:', e);
            restore();
            bugModalOpen(null);
        }
    });
}

/** Canvas → JPEG comprimido, reescalado si excede BUG_SHOT_MAX_WIDTH. */
function _bugCanvasToDataUrl(canvas) {
    try {
        var out = canvas;
        if (canvas.width > BUG_SHOT_MAX_WIDTH) {
            var ratio = BUG_SHOT_MAX_WIDTH / canvas.width;
            out = document.createElement('canvas');
            out.width = BUG_SHOT_MAX_WIDTH;
            out.height = Math.round(canvas.height * ratio);
            var ctx = out.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, out.width, out.height);
            ctx.drawImage(canvas, 0, 0, out.width, out.height);
        }
        return out.toDataURL('image/jpeg', BUG_SHOT_QUALITY);
    } catch (e) {
        console.error('_bugCanvasToDataUrl error:', e);
        return null;
    }
}

// ══════════════════════════════════════════════════════════════════════
// MODAL DE CONFIRMACIÓN (vista previa + comentario + enviar/descartar)
// ══════════════════════════════════════════════════════════════════════

/** Abre el modal con la captura. `dataUrl` puede ser null (reporte solo de texto). */
function bugModalOpen(dataUrl) {
    bugModalClose();
    _bugPendingShot = dataUrl || null;

    var prevFocus = document.activeElement;
    var ctx = bugBuildContext();

    var overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay bug-modal-overlay';
    overlay.id = 'bug-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Reportar una falla');

    var box = document.createElement('div');
    box.className = 'custom-modal-box bug-modal-box';

    var shotHTML = dataUrl
        ? '<img src="' + dataUrl + '" alt="Vista previa de la captura de pantalla" class="bug-modal-shot">'
        : '<div class="bug-modal-noshot">Sin captura de pantalla — se enviará solo tu descripción.</div>';

    var sizeKB = dataUrl ? Math.round((dataUrl.length * 0.75) / 1024) : 0;

    box.innerHTML =
        '<div class="custom-modal-title">🐞 Reportar una falla</div>' +
        '<div class="bug-modal-body">' +
            '<div class="bug-modal-shot-wrap">' + shotHTML +
                (dataUrl ? '<div class="bug-modal-shot-note">Captura de esta pantalla · ~' + sizeKB + ' KB</div>' : '') +
            '</div>' +
            '<div class="form-group">' +
                '<label for="bug-comment">¿Qué pasó? <span style="font-weight:400;color:var(--tp-dim);">(entre más detalle, más rápido se arregla)</span></label>' +
                '<textarea id="bug-comment" class="form-control" rows="4" ' +
                    'placeholder="Ej: piqué &quot;Liberar&quot; y no guardó nada / la pantalla se quedó en blanco / el número de CO2 sale mal…"></textarea>' +
            '</div>' +
        '</div>' +
        // Fuera del área con scroll: lo que se adjunta debe verse SIEMPRE antes de enviar.
        '<div class="bug-modal-ctx" data-help="bug-ctx-help">' +
            'Se adjunta automáticamente: <b>v' + escapeHtml(ctx.version) + '</b> · ' +
            escapeHtml(ctx.platformLabel) + ' · ' + escapeHtml(ctx.operator) + ' · ' +
            escapeHtml(ctx.viewport) + (ctx.errors.length ? ' · ' + ctx.errors.length + ' error(es) JS reciente(s)' : '') +
        '</div>' +
        '<div class="custom-modal-actions">' +
            '<button type="button" class="modal-btn-cancel" id="bug-btn-discard">Descartar</button>' +
            '<button type="button" class="modal-btn-confirm modal-type-info" id="bug-btn-send">Enviar reporte</button>' +
        '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var textarea = box.querySelector('#bug-comment');
    if (textarea) textarea.focus();

    var close = function() {
        _bugPendingShot = null;   // la captura se tira: nunca se guarda si no se envía
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} }
    };
    window._bugModalClose = close;

    // Focus trap + Escape (mismo comportamiento que showModal de app.js)
    var focusables = box.querySelectorAll('button, textarea, input, select, [href]');
    var first = focusables[0], last = focusables[focusables.length - 1];
    overlay.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { close(); return; }
        if (e.key !== 'Tab') return;
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

    box.querySelector('#bug-btn-discard').addEventListener('click', function() {
        close();
        if (typeof showToast === 'function') showToast('Reporte descartado — no se guardó nada.', 'info');
    });
    box.querySelector('#bug-btn-send').addEventListener('click', bugSubmit);

    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function bugModalClose() {
    if (typeof window._bugModalClose === 'function') { window._bugModalClose(); window._bugModalClose = null; return; }
    var el = document.getElementById('bug-modal');
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

// ══════════════════════════════════════════════════════════════════════
// CONTEXTO TÉCNICO
// ══════════════════════════════════════════════════════════════════════

/** Datos de diagnóstico que viajan con el reporte (sin datos de vehículos). */
function bugBuildContext() {
    var op = 'Desconocido';
    try {
        if (typeof authGetCurrentUser === 'function') {
            var u = authGetCurrentUser();
            if (u && u.name) op = u.name;
        }
    } catch (e) {}

    var platform = 'desconocido';
    try { if (typeof _currentPlatform !== 'undefined' && _currentPlatform) platform = _currentPlatform; } catch (e) {}

    var tab = '';
    try {
        if (platform === 'panel' && typeof pnState !== 'undefined' && pnState.activeTab) tab = pnState.activeTab;
        else if (platform === 'testplan' && typeof tpState !== 'undefined' && tpState.activeTab) tab = tpState.activeTab;
        else if (platform === 'inventory' && typeof invState !== 'undefined' && invState.activeTab) tab = invState.activeTab;
    } catch (e) {}

    return {
        version: (typeof APP_VERSION !== 'undefined') ? String(APP_VERSION) : '?',
        platform: platform,
        tab: tab,
        platformLabel: platform + (tab ? ' → ' + tab : ''),
        operator: op,
        ua: (navigator && navigator.userAgent) ? navigator.userAgent : '',
        viewport: window.innerWidth + '×' + window.innerHeight,
        online: navigator.onLine !== false,
        errors: (window._bugRecentErrors || []).slice(-BUG_ERRORS_MAX)
    };
}

// ══════════════════════════════════════════════════════════════════════
// COLA LOCAL (offline-first)
// ══════════════════════════════════════════════════════════════════════

function bugQueueGet() {
    try { return JSON.parse(localStorage.getItem(BUG_QUEUE_KEY)) || []; } catch (e) { return []; }
}

/**
 * Guarda la cola. Si localStorage se queda sin espacio, sacrifica las capturas
 * de los reportes más viejos (el texto del técnico es lo que no se puede perder)
 * antes de rendirse.
 */
function _bugQueueSave(q) {
    try { localStorage.setItem(BUG_QUEUE_KEY, JSON.stringify(q)); bugUpdateFabBadge(); return true; }
    catch (e) {
        for (var i = 0; i < q.length; i++) {
            if (!q[i].shot) continue;
            q[i].shot = null;
            q[i].shotDropped = true;
            try { localStorage.setItem(BUG_QUEUE_KEY, JSON.stringify(q)); bugUpdateFabBadge(); return true; } catch (e2) {}
        }
        return false;
    }
}

function bugQueueCount() { return bugQueueGet().length; }

// ══════════════════════════════════════════════════════════════════════
// ENVÍO
// ══════════════════════════════════════════════════════════════════════

/** Botón "Enviar reporte": encola y dispara el envío en segundo plano. */
function bugSubmit() {
    var ta = document.getElementById('bug-comment');
    var comment = ta ? String(ta.value || '').trim() : '';
    if (comment.length < 5) {
        if (typeof showToast === 'function') showToast('Describe brevemente qué pasó (al menos 5 caracteres).', 'warning');
        if (ta) ta.focus();
        return;
    }

    var queue = bugQueueGet();
    if (queue.length >= BUG_QUEUE_MAX) {
        if (typeof showToast === 'function') showToast('Ya hay ' + queue.length + ' reportes esperando envío. Ve a Datos → 🐞 Bugs y reintenta antes de crear otro.', 'warning');
        return;
    }

    var report = {
        id: 'bug_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
        at: new Date().toISOString(),
        comment: comment,
        ctx: bugBuildContext(),
        shot: _bugPendingShot || null,
        status: 'pendiente',
        lastError: ''
    };

    queue.push(report);
    var saved = _bugQueueSave(queue);
    bugModalClose();

    if (!saved) {
        if (typeof showToast === 'function') showToast('No hay espacio local para guardar el reporte. Libera espacio en Datos → Sistema e inténtalo de nuevo.', 'error');
        return;
    }

    if (typeof showToast === 'function') showToast('Reporte guardado — enviándolo…', 'success');
    bugTrySendAll({});
}

/**
 * Intenta publicar todos los reportes en cola, uno por uno.
 * opts.silent → no molesta con toasts si no hay nada que hacer o falla.
 * opts.onDone(enviados, fallidos)
 */
function bugTrySendAll(opts) {
    opts = opts || {};
    if (_bugSending) { if (opts.onDone) opts.onDone(0, 0); return; }

    var queue = bugQueueGet();
    if (queue.length === 0) { if (opts.onDone) opts.onDone(0, 0); return; }

    var settings = bugGetSettings();
    if (!settings.token) {
        if (!opts.silent && typeof showToast === 'function') {
            showToast('Falta el token de GitHub — el reporte quedó en la cola. Configúralo en Datos → 🐞 Bugs.', 'warning');
        }
        if (opts.onDone) opts.onDone(0, 0);
        return;
    }

    _bugSending = true;
    var sent = 0, failed = 0;
    var i = 0;

    var next = function() {
        if (i >= queue.length) {
            _bugSending = false;
            // Los enviados salen de la cola; los que fallaron se quedan con su error.
            _bugQueueSave(queue.filter(function(r) { return r.status !== 'enviado'; }));
            if (typeof pnBugsRefresh === 'function') pnBugsRefresh();
            if (!opts.silent && typeof showToast === 'function') {
                if (sent > 0 && failed === 0) showToast(sent + ' reporte(s) publicado(s) en GitHub. ¡Gracias!', 'success');
                else if (sent > 0) showToast(sent + ' enviado(s), ' + failed + ' pendiente(s) — ver Datos → 🐞 Bugs.', 'warning');
                else showToast('No se pudo enviar: ' + (queue[0] && queue[0].lastError ? queue[0].lastError : 'error desconocido'), 'error');
            }
            if (opts.onDone) opts.onDone(sent, failed);
            return;
        }
        var report = queue[i++];
        _bugSendOne(settings, report, function(ok, err) {
            if (ok) { report.status = 'enviado'; sent++; }
            else { report.lastError = err || 'Error desconocido'; failed++; }
            next();
        });
    };
    next();
}

/**
 * Publica UN reporte: respaldo en Firestore → captura a la rama de GitHub →
 * Issue. El respaldo en Firestore es tolerante a fallos (si no hay sesión de
 * laboratorio se sigue de largo); lo que decide el éxito es el Issue.
 */
function _bugSendOne(settings, report, done) {
    var finishGitHub = function() {
        _bugUploadShot(settings, report, function(shotUrls) {
            _bugCreateIssue(settings, report, shotUrls, function(ok, errOrIssue) {
                if (!ok) { done(false, errOrIssue); return; }
                var issue = errOrIssue;
                report.issueNumber = issue.number;
                report.issueUrl = issue.html_url;
                if (typeof fbBugsUpdateMeta === 'function') {
                    fbBugsUpdateMeta(report.id, {
                        status: 'abierto',
                        issueNumber: issue.number,
                        issueUrl: issue.html_url,
                        shotUrl: shotUrls ? shotUrls.blob : ''
                    }, function() {});
                }
                if (typeof auditLog === 'function') {
                    auditLog('bugs', 'bug_reported', { type: 'bug', label: '#' + issue.number }, report.comment.slice(0, 120));
                }
                done(true, null);
            });
        });
    };

    // Respaldo en la nube compartida (bandeja de la app). No bloquea el Issue.
    if (typeof fbBugsUpload === 'function') {
        fbBugsUpload(report, function() { finishGitHub(); });
    } else {
        finishGitHub();
    }
}

// ══════════════════════════════════════════════════════════════════════
// GITHUB API
// ══════════════════════════════════════════════════════════════════════

/** fetch a api.github.com con el token y mensajes de error en español. */
function _bugGh(settings, path, options) {
    options = options || {};
    var url = 'https://api.github.com/repos/' + settings.owner + '/' + settings.repo + path;
    var init = {
        method: options.method || 'GET',
        headers: {
            'Authorization': 'Bearer ' + settings.token,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    };
    if (options.body) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(options.body);
    }
    return fetch(url, init).then(function(res) {
        return res.text().then(function(text) {
            var data = null;
            try { data = text ? JSON.parse(text) : null; } catch (e) {}
            if (res.ok) return data;
            var err = new Error(_bugGhErrorMessage(res.status, data));
            err.status = res.status;
            err.data = data;
            throw err;
        });
    });
}

function _bugGhErrorMessage(status, data) {
    if (status === 401) return 'Token de GitHub inválido o vencido — actualízalo en Datos → 🐞 Bugs → Configuración.';
    if (status === 403) return 'El token no tiene permisos suficientes (se requieren Issues y Contents con Lectura y escritura), o se agotó el límite de peticiones de GitHub.';
    if (status === 404) return 'Repositorio no encontrado o el token no tiene acceso a él. Revisa el owner/repo en la configuración.';
    if (status === 422) return 'GitHub rechazó los datos: ' + ((data && data.message) ? data.message : 'error de validación') + '.';
    return 'GitHub respondió ' + status + ((data && data.message) ? ' — ' + data.message : '') + '.';
}

/**
 * Asegura que exista la rama de capturas (se crea desde el HEAD de la rama por
 * defecto). Resuelve siempre — si no se puede crear, el issue va sin imagen.
 */
function _bugEnsureBranch(settings, cb) {
    _bugGh(settings, '/git/ref/heads/' + BUG_GH_BRANCH)
        .then(function() { cb(true); })
        .catch(function() {
            _bugGh(settings, '')
                .then(function(repo) { return _bugGh(settings, '/git/ref/heads/' + repo.default_branch); })
                .then(function(ref) {
                    return _bugGh(settings, '/git/refs', {
                        method: 'POST',
                        body: { ref: 'refs/heads/' + BUG_GH_BRANCH, sha: ref.object.sha }
                    });
                })
                .then(function() { cb(true); })
                .catch(function(err) {
                    // 422 = la rama ya existía (carrera entre dos dispositivos): sirve igual.
                    cb(err && err.status === 422);
                });
        });
}

/**
 * Sube la captura a la rama de capturas vía Contents API.
 * cb(urls|null) — nunca falla el flujo: sin imagen el issue se crea igual.
 */
function _bugUploadShot(settings, report, cb) {
    if (!report.shot) { cb(null); return; }

    _bugEnsureBranch(settings, function(branchOk) {
        if (!branchOk) { cb(null); return; }
        var b64 = String(report.shot);
        var comma = b64.indexOf(',');
        if (comma >= 0) b64 = b64.slice(comma + 1);

        var path = BUG_GH_DIR + '/' + report.id + '.jpg';
        _bugGh(settings, '/contents/' + path, {
            method: 'PUT',
            body: {
                message: 'Captura del reporte ' + report.id,
                content: b64,
                branch: BUG_GH_BRANCH
            }
        }).then(function() {
            cb({
                raw: 'https://raw.githubusercontent.com/' + settings.owner + '/' + settings.repo + '/' + BUG_GH_BRANCH + '/' + path,
                blob: 'https://github.com/' + settings.owner + '/' + settings.repo + '/blob/' + BUG_GH_BRANCH + '/' + path
            });
        }).catch(function(err) {
            console.warn('bug: no se pudo subir la captura —', err.message);
            cb(null);
        });
    });
}

/** Cuerpo markdown del issue. Función pura: se puede probar sin navegador. */
function bugBuildIssueBody(report, shotUrls) {
    var c = report.ctx || {};
    var lines = [];
    lines.push('### Qué pasó');
    lines.push('');
    lines.push(report.comment);
    lines.push('');
    if (shotUrls) {
        lines.push('### Captura de pantalla');
        lines.push('');
        lines.push('![Captura del reporte](' + shotUrls.raw + ')');
        lines.push('');
        lines.push('> Si la imagen no carga (repositorio privado), ábrela aquí: [' + report.id + '.jpg](' + shotUrls.blob + ')');
        lines.push('');
    } else if (report.shot || report.shotDropped) {
        lines.push('> _No se pudo adjuntar la captura de pantalla (sin acceso al repositorio o sin espacio local)._');
        lines.push('');
    }
    lines.push('### Contexto');
    lines.push('');
    lines.push('| Dato | Valor |');
    lines.push('| --- | --- |');
    lines.push('| Reportado por | ' + (c.operator || '?') + ' |');
    lines.push('| Fecha | ' + (report.at || '') + ' |');
    lines.push('| Versión de la app | ' + (c.version || '?') + ' |');
    lines.push('| Pantalla | ' + (c.platformLabel || c.platform || '?') + ' |');
    lines.push('| Viewport | ' + (c.viewport || '?') + ' |');
    lines.push('| En línea | ' + (c.online ? 'sí' : 'no') + ' |');
    lines.push('| Navegador | ' + (c.ua || '?') + ' |');
    lines.push('');
    if (c.errors && c.errors.length) {
        lines.push('### Errores JS recientes');
        lines.push('');
        lines.push('```');
        c.errors.forEach(function(e) {
            lines.push('[' + (e.at || '') + '] ' + (e.type || 'error') + ': ' + (e.message || '') +
                (e.source ? ' (' + e.source + ':' + (e.line || '?') + ')' : ''));
        });
        lines.push('```');
        lines.push('');
    }
    lines.push('---');
    lines.push('_Reportado desde la app (KIA EmLab · botón 🐞) · id `' + report.id + '`_');
    return lines.join('\n');
}

function _bugCreateIssue(settings, report, shotUrls, cb) {
    var c = report.ctx || {};
    var firstLine = report.comment.split('\n')[0].trim();
    var title = '[Bug] ' + (firstLine.length > 70 ? firstLine.slice(0, 67) + '…' : firstLine);

    _bugGh(settings, '/issues', {
        method: 'POST',
        body: {
            title: title,
            body: bugBuildIssueBody(report, shotUrls),
            labels: ['bug', 'reportado-desde-la-app']
        }
    }).then(function(issue) { cb(true, issue); })
      .catch(function(err) { cb(false, err.message); });
}

/**
 * Sincroniza la bandeja con GitHub: los issues cerrados allá pasan a
 * "resuelto" aquí. cb(actualizados, errorOrNull)
 */
function bugRefreshStatuses(cb) {
    cb = cb || function() {};
    var settings = bugGetSettings();
    if (!settings.token) { cb(0, 'Falta el token de GitHub.'); return; }
    if (typeof fbBugsList !== 'function') { cb(0, 'Sincronización no disponible.'); return; }

    _bugGh(settings, '/issues?state=all&labels=bug&per_page=100')
        .then(function(issues) {
            var byNumber = {};
            (issues || []).forEach(function(is) { byNumber[is.number] = is.state; });

            fbBugsList(function(list, err) {
                if (err) { cb(0, err); return; }
                var pending = list.filter(function(b) {
                    if (!b.issueNumber || !byNumber[b.issueNumber]) return false;
                    var closed = byNumber[b.issueNumber] === 'closed';
                    return closed ? b.status !== 'resuelto' : b.status === 'resuelto';
                });
                if (pending.length === 0) { cb(0, null); return; }
                var left = pending.length, updated = 0;
                pending.forEach(function(b) {
                    var newStatus = byNumber[b.issueNumber] === 'closed' ? 'resuelto' : 'abierto';
                    fbBugsUpdateMeta(b.id, { status: newStatus }, function(ok) {
                        if (ok) updated++;
                        if (--left === 0) cb(updated, null);
                    });
                });
            });
        })
        .catch(function(err) { cb(0, err.message); });
}

// ══════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN (token + repo, compartidos vía Firestore)
// ══════════════════════════════════════════════════════════════════════

/** Configuración vigente en este dispositivo (cache local del doc compartido). */
function bugGetSettings() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(BUG_SETTINGS_KEY)) || {}; } catch (e) { s = {}; }
    return {
        token: s.token || '',
        owner: s.owner || BUG_DEFAULT_OWNER,
        repo: s.repo || BUG_DEFAULT_REPO
    };
}

function bugSettingsConfigured() { return !!bugGetSettings().token; }

function _bugCacheSettings(s) {
    try { localStorage.setItem(BUG_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
}

/** Trae la configuración compartida de Firestore y refresca la cache local. */
function bugLoadSettings(cb) {
    cb = cb || function() {};
    if (typeof fbBugsGetSettings !== 'function') { cb(bugGetSettings()); return; }
    fbBugsGetSettings(function(remote) {
        if (remote && remote.token) {
            _bugCacheSettings({ token: remote.token, owner: remote.owner || BUG_DEFAULT_OWNER, repo: remote.repo || BUG_DEFAULT_REPO });
        }
        cb(bugGetSettings());
    });
}

/** Guarda la configuración en el workspace compartido (todos los dispositivos la heredan). */
function bugSaveSettings(token, owner, repo, cb) {
    cb = cb || function() {};
    var s = {
        token: String(token || '').trim(),
        owner: String(owner || '').trim() || BUG_DEFAULT_OWNER,
        repo: String(repo || '').trim() || BUG_DEFAULT_REPO
    };
    _bugCacheSettings(s);
    if (typeof auditLog === 'function') {
        // Nunca se audita el token — solo que alguien cambió la configuración.
        auditLog('bugs', 'bug_config_changed', { type: 'config', label: s.owner + '/' + s.repo }, s.token ? 'token actualizado' : 'token borrado');
    }
    if (typeof fbBugsSaveSettings === 'function') fbBugsSaveSettings(s, function(ok, err) { cb(ok, err); });
    else cb(true, null);
}

/** Token enmascarado para la UI (nunca se muestra completo). */
function bugMaskToken(token) {
    if (!token) return '';
    if (token.length <= 12) return '••••••••';
    return token.slice(0, 7) + '…' + token.slice(-4);
}

// ══════════════════════════════════════════════════════════════════════
// BANDEJA — Datos → 🐞 Bugs (pestaña pn-bugs del Panel)
// ══════════════════════════════════════════════════════════════════════

function pnRenderBugs(el) {
    var settings = bugGetSettings();
    var queued = bugQueueGet();

    var html = '';

    // ── Reportes en cola (aún no llegan a GitHub) ──
    if (queued.length > 0) {
        html += '<div class="tp-card">';
        html += '<div class="tp-card-title"><span>⏳ En espera de envío (' + queued.length + ')</span>' +
            '<button class="tp-btn tp-btn-primary" onclick="pnBugsRetry()" style="font-size: var(--fs-sm);">↻ Reintentar envío</button></div>';
        queued.forEach(function(r) {
            html += '<div class="bug-row">' +
                (r.shot ? '<img src="' + r.shot + '" alt="" class="bug-row-thumb">' : '<div class="bug-row-thumb bug-row-thumb-empty">📝</div>') +
                '<div class="bug-row-main">' +
                    '<div class="bug-row-text">' + escapeHtml(r.comment) + '</div>' +
                    '<div class="bug-row-meta">' + escapeHtml((r.ctx && r.ctx.operator) || '?') + ' · ' +
                        new Date(r.at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) +
                        (r.lastError ? ' · <span style="color:var(--tp-red);">' + escapeHtml(r.lastError) + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<button class="tp-btn tp-btn-ghost" onclick="pnBugsDropQueued(\'' + r.id + '\')" style="color:var(--tp-red);font-size: var(--fs-sm);" title="Descartar este reporte" aria-label="Descartar reporte">🗑</button>' +
                '</div>';
        });
        html += '</div>';
    }

    // ── Reportes publicados (respaldo en la nube) ──
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title" data-help="pn-bugs-help"><span>🐞 Reportes enviados</span>' +
        '<span><button class="tp-btn tp-btn-ghost" onclick="pnBugsSyncStatuses()" style="font-size: var(--fs-sm);">🔄 Actualizar estados</button></span></div>';
    html += '<div id="pn-bugs-list">' + '<div style="text-align:center;padding: var(--space-lg);color:var(--tp-dim);font-size: var(--fs-sm);">Cargando…</div>' + '</div>';
    html += '</div>';

    // ── Configuración de GitHub ──
    html += '<div class="tp-card">';
    html += '<div class="tp-card-title" data-help="pn-bugs-config-help"><span>⚙️ Conexión con GitHub</span></div>';
    html += '<div class="bug-config-warn">⚠️ <b>El token se comparte con todo el laboratorio</b> (se guarda en la nube compartida). ' +
        'Usa un <i>fine-grained token</i> limitado a este repositorio, con permisos <b>Issues: Read and write</b> y <b>Contents: Read and write</b>, y con fecha de expiración. ' +
        'Si el repositorio es <b>público</b>, los issues y las capturas (que pueden mostrar VINs, resultados y nombres) quedan visibles para cualquiera en internet.</div>';
    html += '<div class="form-group"><label for="bug-cfg-token">Token de GitHub</label>' +
        '<input type="password" id="bug-cfg-token" class="form-control" autocomplete="off" placeholder="' +
        (settings.token ? 'Guardado: ' + escapeHtml(bugMaskToken(settings.token)) + ' — escribe uno nuevo para reemplazarlo' : 'github_pat_…') + '"></div>';
    html += '<div class="inv-row-list-2col">' +
        '<div class="form-group"><label for="bug-cfg-owner">Dueño (owner)</label>' +
        '<input type="text" id="bug-cfg-owner" class="form-control" value="' + escapeHtml(settings.owner) + '"></div>' +
        '<div class="form-group"><label for="bug-cfg-repo">Repositorio</label>' +
        '<input type="text" id="bug-cfg-repo" class="form-control" value="' + escapeHtml(settings.repo) + '"></div>' +
        '</div>';
    html += '<div style="display:flex;gap: var(--space-sm);flex-wrap:wrap;">' +
        '<button class="tp-btn tp-btn-primary" onclick="pnBugsSaveConfig()">💾 Guardar</button>' +
        '<button class="tp-btn tp-btn-ghost" onclick="pnBugsTestConfig()">🔌 Probar conexión</button>' +
        (settings.token ? '<button class="tp-btn tp-btn-ghost" onclick="pnBugsClearConfig()" style="color:var(--tp-red);">Borrar token</button>' : '') +
        '</div>';
    html += '<div id="bug-cfg-status" style="margin-top: var(--space-sm);font-size: var(--fs-sm);"></div>';
    html += '</div>';

    el.innerHTML = html;
    pnBugsRefresh();
}

function pnBugsRefresh() {
    var listEl = document.getElementById('pn-bugs-list');
    if (!listEl) return;
    if (typeof fbBugsList !== 'function') {
        listEl.innerHTML = '<div style="text-align:center;padding: var(--space-lg);color:var(--tp-dim);font-size: var(--fs-sm);">Sincronización no disponible.</div>';
        return;
    }
    fbBugsList(function(list, err) {
        listEl = document.getElementById('pn-bugs-list');
        if (!listEl) return;
        if (err) {
            listEl.innerHTML = '<div style="text-align:center;padding: var(--space-lg);color:var(--tp-red);font-size: var(--fs-sm);">' + escapeHtml(err) + '</div>';
            return;
        }
        if (!list.length) {
            listEl.innerHTML = '<div style="text-align:center;padding: var(--space-xl);color:var(--tp-dim);font-size: var(--fs-sm);">Todavía no hay reportes. Usa el botón 🐞 de la esquina cuando algo falle.</div>';
            return;
        }
        window._pnBugsCache = list;
        listEl.innerHTML = list.map(function(b) {
            var badge = b.status === 'resuelto'
                ? '<span class="bug-badge bug-badge-ok">✅ Resuelto</span>'
                : '<span class="bug-badge bug-badge-open">🐙 Abierto</span>';
            var link = b.issueUrl
                ? '<a href="' + escapeHtml(b.issueUrl) + '" target="_blank" rel="noopener">#' + b.issueNumber + '</a>'
                : '<span style="color:var(--tp-dim);">sin issue</span>';
            var when = b.at ? new Date(b.at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="bug-row">' +
                '<div class="bug-row-main">' +
                    '<div class="bug-row-text">' + escapeHtml(b.comment || '') + '</div>' +
                    '<div class="bug-row-meta">' + badge + ' ' + link + ' · ' + escapeHtml(b.operator || '?') + ' · v' + escapeHtml(b.version || '?') + ' · ' + when + '</div>' +
                '</div>' +
                (b.chunkCount ? '<button class="tp-btn tp-btn-ghost" onclick="pnBugsViewShot(\'' + b.id + '\')" style="font-size: var(--fs-sm);" title="Ver captura" aria-label="Ver captura">🖼</button>' : '') +
                '<button class="tp-btn tp-btn-ghost" onclick="pnBugsDelete(\'' + b.id + '\')" style="color:var(--tp-red);font-size: var(--fs-sm);" title="Borrar del respaldo" aria-label="Borrar reporte">🗑</button>' +
                '</div>';
        }).join('');
    });
}

function pnBugsRetry() {
    bugTrySendAll({ onDone: function() { if (typeof pnRender === 'function') pnRender(); } });
}

function pnBugsDropQueued(id) {
    showConfirm('¿Descartar este reporte pendiente? No se enviará a GitHub y no se puede recuperar.', function() {
        _bugQueueSave(bugQueueGet().filter(function(r) { return r.id !== id; }));
        if (typeof pnRender === 'function') pnRender();
        showToast('Reporte descartado.', 'info');
    }, { type: 'danger' });
}

function pnBugsSyncStatuses() {
    showToast('Consultando GitHub…', 'info');
    bugRefreshStatuses(function(updated, err) {
        if (err) { showToast(err, 'error'); return; }
        showToast(updated > 0 ? updated + ' reporte(s) actualizado(s).' : 'Todo al día con GitHub.', 'success');
        pnBugsRefresh();
    });
}

function pnBugsViewShot(id) {
    var meta = (window._pnBugsCache || []).filter(function(b) { return b.id === id; })[0];
    if (!meta || typeof fbBugsDownloadShot !== 'function') return;
    showToast('Cargando captura…', 'info');
    fbBugsDownloadShot(id, meta, function(ok, err, dataUrl) {
        if (!ok) { showToast(err || 'No se pudo cargar la captura.', 'error'); return; }
        showModal({
            title: 'Captura del reporte',
            message: '<img src="' + dataUrl + '" alt="Captura del reporte" style="max-width:100%;max-height:60vh;border-radius: var(--radius-xl);border:1px solid var(--tp-border);">',
            confirmText: 'Cerrar',
            showCancel: false,
            type: 'info'
        });
    });
}

function pnBugsDelete(id) {
    var meta = (window._pnBugsCache || []).filter(function(b) { return b.id === id; })[0];
    showConfirm('¿Borrar este reporte del respaldo? El issue de GitHub NO se borra.', function() {
        fbBugsDelete(id, meta, function(ok, err) {
            if (!ok) { showToast(err || 'No se pudo borrar.', 'error'); return; }
            showToast('Reporte borrado del respaldo.', 'success');
            pnBugsRefresh();
        });
    }, { type: 'danger' });
}

function pnBugsSaveConfig() {
    var tokenEl = document.getElementById('bug-cfg-token');
    var ownerEl = document.getElementById('bug-cfg-owner');
    var repoEl = document.getElementById('bug-cfg-repo');
    var statusEl = document.getElementById('bug-cfg-status');
    var typed = tokenEl ? String(tokenEl.value || '').trim() : '';
    // Sin token nuevo escrito se conserva el que ya estaba (el campo va vacío a propósito).
    var token = typed || bugGetSettings().token;

    bugSaveSettings(token, ownerEl ? ownerEl.value : '', repoEl ? repoEl.value : '', function(ok, err) {
        if (statusEl) {
            statusEl.innerHTML = ok
                ? '<span style="color:var(--tp-green);">✅ Guardado y compartido con los demás dispositivos.</span>'
                : '<span style="color:var(--tp-amber);">✅ Guardado en <b>este</b> dispositivo — el botón 🐞 ya publica issues desde aquí. ' +
                  'No se pudo copiar a los demás dispositivos (' + escapeHtml(err || 'sin conexión con el respaldo') + '); ' +
                  'vuelve a picar Guardar cuando la sincronización esté en verde, o repite estos pasos en cada dispositivo.</span>';
        }
        if (tokenEl) tokenEl.value = '';
        showToast('Configuración guardada.', 'success');
    });
}

function pnBugsTestConfig() {
    var statusEl = document.getElementById('bug-cfg-status');
    var tokenEl = document.getElementById('bug-cfg-token');
    var ownerEl = document.getElementById('bug-cfg-owner');
    var repoEl = document.getElementById('bug-cfg-repo');
    var saved = bugGetSettings();

    // Probar lo que está EN PANTALLA: si el técnico acaba de pegar un token,
    // probarlo sin obligarlo a guardarlo primero (antes decía "Falta el token"
    // con el campo lleno, porque solo miraba lo ya guardado).
    var settings = {
        token: (tokenEl && String(tokenEl.value || '').trim()) || saved.token,
        owner: (ownerEl && String(ownerEl.value || '').trim()) || saved.owner,
        repo: (repoEl && String(repoEl.value || '').trim()) || saved.repo
    };
    if (!settings.token) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--tp-red);">Escribe el token de GitHub arriba (o guárdalo) para poder probar.</span>';
        return;
    }
    if (statusEl) statusEl.textContent = 'Probando…';
    _bugGh(settings, '')
        .then(function(repo) {
            if (statusEl) {
                statusEl.innerHTML = '<span style="color:var(--tp-green);">✅ Conectado a ' + escapeHtml(repo.full_name) + '</span>' +
                    (repo.private ? '' : ' <span style="color:var(--tp-amber);">— ojo: el repositorio es PÚBLICO, los reportes serán visibles para cualquiera.</span>');
            }
        })
        .catch(function(err) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--tp-red);">' + escapeHtml(err.message) + '</span>';
        });
}

function pnBugsClearConfig() {
    showConfirm('¿Borrar el token de GitHub? Los reportes se seguirán guardando en la nube del laboratorio, pero ya no se crearán issues.', function() {
        bugSaveSettings('', bugGetSettings().owner, bugGetSettings().repo, function() {
            showToast('Token borrado.', 'success');
            if (typeof pnRender === 'function') pnRender();
        });
    }, { type: 'danger' });
}

// ══════════════════════════════════════════════════════════════════════
// AYUDA (v16.0: toda pestaña nueva registra su banner y sus tooltips)
// ══════════════════════════════════════════════════════════════════════

if (typeof HELP_TABS !== 'undefined') Object.assign(HELP_TABS, {
    'pn-bugs': { title: 'Reportes de fallas', text: 'Todo lo que el laboratorio ha reportado con el botón 🐞, con su estado en GitHub. Aquí también se configura la conexión con el repositorio.', tips: [
        'El botón 🐞 está siempre visible, en cualquier pantalla: toma la captura solo.',
        'Un reporte en espera (⏳) todavía no llegó a GitHub — normalmente por falta de red o de token.',
        '"Actualizar estados" pregunta a GitHub cuáles issues ya cerraste y los marca ✅ Resuelto aquí.',
        'Borrar un reporte del respaldo NO cierra ni borra el issue de GitHub.'
    ]}
});

if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'bug-comment': { title: '¿Qué pasó?', text: 'Cuenta con tus palabras qué esperabas y qué ocurrió. Lo más útil: qué botón picaste, qué viste y qué debería haber salido. La captura y los datos técnicos (versión, pantalla, errores) se adjuntan solos.' },
    'bug-ctx-help': { title: 'Datos que se adjuntan', text: 'Además de tu descripción y la captura viajan: la versión de la app, en qué pantalla estabas, tu nombre de operador, el tamaño de pantalla y los últimos errores internos. No se envían datos de vehículos ni resultados de pruebas — salvo los que se alcancen a ver en la captura.' },
    'pn-bugs-help': { title: 'Bandeja de reportes', text: 'Respaldo en la nube del laboratorio de cada reporte enviado, con enlace a su issue de GitHub y su estado (abierto / resuelto).' },
    'pn-bugs-config-help': { title: 'Conexión con GitHub', text: 'Token, dueño y repositorio donde se crean los issues. Se configura UNA vez desde cualquier dispositivo y se comparte con todos los demás del laboratorio.' },
    'bug-cfg-token': { title: 'Token de GitHub', text: 'Un fine-grained personal access token con acceso SOLO a este repositorio y permisos Issues: Read and write + Contents: Read and write. Se guarda en la nube compartida del laboratorio, así que cualquier dispositivo con sesión puede usarlo — dale expiración y no le des más permisos de los necesarios.' },
    'bug-cfg-owner': { title: 'Dueño del repositorio', text: 'El usuario u organización de GitHub, tal como aparece en la URL: github.com/<b>dueño</b>/repositorio.' },
    'bug-cfg-repo': { title: 'Repositorio', text: 'El nombre del repositorio donde se crearán los issues: github.com/dueño/<b>repositorio</b>.' }
});
