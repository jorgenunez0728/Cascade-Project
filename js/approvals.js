// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Power Automate Emissions Approval Integration         ║
// ║                                                                    ║
// ║  Automatically triggers Power Automate approval workflows when     ║
// ║  vehicles are registered or released in Cascade, eliminating the   ║
// ║  manual scan/email dependency that caused non-conformities.        ║
// ║                                                                    ║
// ║  Flow:                                                             ║
// ║  1. Vehicle registered → webhook fires → PA creates pending        ║
// ║     approval in Teams (awaiting documentation)                     ║
// ║  2. Vehicle released → webhook fires with PDF + test data →        ║
// ║     PA completes approval with documentation for AI analysis       ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── Constants ──
var PA_LS_KEY = 'kia_pa_config';
var PA_QUEUE_LS_KEY = 'kia_pa_queue';
var PA_MAX_RETRIES = 8;
var PA_QUEUE_MAX = 20;
// Fields that travel between stations via Smart Merge / Firebase.
// stationName is intentionally excluded so each station keeps its own identity in webhook payloads.
var PA_SHAREABLE_FIELDS = ['enabled', 'webhookUrl', 'triggerOnRegister', 'triggerOnRelease', 'includePdfOnRelease'];

// ── Configuration (persisted to localStorage) ──
var paConfig = {
    enabled: false,
    webhookUrl: '',
    stationName: 'KIA EmLab México',
    triggerOnRegister: true,
    triggerOnRelease: true,
    includePdfOnRelease: true
};

// ── Runtime state ──
var paQueue = [];
var _paLastSendStatus = null;
var _paConfigContainerId = 'pa-config-container'; // tracks active render target

// ══════════════════════════════════════════════════════════════
// CONFIG PERSISTENCE
// ══════════════════════════════════════════════════════════════

function paLoadConfig() {
    try {
        var raw = localStorage.getItem(PA_LS_KEY);
        if (raw) {
            var obj = JSON.parse(raw);
            for (var k in obj) {
                if (paConfig.hasOwnProperty(k)) paConfig[k] = obj[k];
            }
        }
    } catch (e) { console.warn('paLoadConfig:', e); }
}

function paSaveConfig(skipFbPush) {
    try {
        localStorage.setItem(PA_LS_KEY, JSON.stringify(paConfig));
    } catch (e) { console.warn('paSaveConfig:', e); }
    // Push the shareable subset to Firebase so other stations can pick it up.
    // Skip when called as a result of applying a remote config to avoid push/pull loops.
    if (!skipFbPush && typeof fbPush === 'function' &&
        typeof fbSyncModules !== 'undefined' && fbSyncModules.approvals !== false &&
        typeof fbSync !== 'undefined' && fbSync.enabled) {
        try { fbPush('approvals', _paShareablePayload()); } catch (e) { console.warn('paSaveConfig push:', e); }
    }
}

// Returns the subset of paConfig that is safe to share with other stations
// (everything except stationName, plus a save timestamp for ordering).
function _paShareablePayload() {
    var out = { _savedAt: new Date().toISOString() };
    PA_SHAREABLE_FIELDS.forEach(function (f) { out[f] = paConfig[f]; });
    return out;
}

// Applies a remote PA config (from Firebase pull or Smart Merge) onto the local paConfig,
// honouring the rules: stationName never changes, only PA_SHAREABLE_FIELDS are touched.
// Returns the list of field names that actually changed.
function paApplyRemoteConfig(remoteConfig) {
    if (!remoteConfig) return [];
    var changed = [];
    PA_SHAREABLE_FIELDS.forEach(function (f) {
        if (!remoteConfig.hasOwnProperty(f)) return;
        if (paConfig[f] !== remoteConfig[f]) {
            paConfig[f] = remoteConfig[f];
            changed.push(f);
        }
    });
    if (changed.length > 0) {
        paSaveConfig(true); // skipFbPush — avoid bouncing the same config back to Firebase
        if (typeof paRenderConfigUI === 'function' && _paConfigContainerId) {
            try { paRenderConfigUI(_paConfigContainerId); } catch (e) {}
        }
    }
    return changed;
}

// ══════════════════════════════════════════════════════════════
// OFFLINE QUEUE — stores only event type + vehicle ID to keep
// localStorage usage minimal. Full payload (incl. PDF) is
// rebuilt from current DB data on retry.
// ══════════════════════════════════════════════════════════════

function paQueueLoad() {
    try {
        var raw = localStorage.getItem(PA_QUEUE_LS_KEY);
        paQueue = raw ? JSON.parse(raw) : [];
    } catch (e) { paQueue = []; }
}

function paQueueSave() {
    try {
        localStorage.setItem(PA_QUEUE_LS_KEY, JSON.stringify(paQueue));
    } catch (e) {}
}

function paQueueAdd(eventType, vehicleId) {
    paQueue.push({
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        eventType: eventType,
        vehicleId: vehicleId,
        queuedAt: new Date().toISOString(),
        retries: 0
    });
    if (paQueue.length > PA_QUEUE_MAX) paQueue = paQueue.slice(-PA_QUEUE_MAX);
    paQueueSave();
    paUpdateIndicator();
}

function paQueueRetry() {
    if (paQueue.length === 0 || !paConfig.enabled || !paConfig.webhookUrl) return;
    if (!navigator.onLine) return;

    var item = paQueue[0];

    // Drop after max retries
    if (item.retries >= PA_MAX_RETRIES) {
        console.warn('PA: dropping webhook after ' + PA_MAX_RETRIES + ' retries:', item.id);
        paQueue.shift();
        paQueueSave();
        paUpdateIndicator();
        if (paQueue.length > 0) setTimeout(paQueueRetry, 1000);
        return;
    }

    // Rebuild payload from current DB data
    var vehicle = null;
    if (typeof db !== 'undefined' && db.vehicles) {
        vehicle = db.vehicles.find(function (v) { return v.id == item.vehicleId; });
    }

    if (!vehicle) {
        // Vehicle removed from DB — skip silently
        paQueue.shift();
        paQueueSave();
        paUpdateIndicator();
        if (paQueue.length > 0) setTimeout(paQueueRetry, 1000);
        return;
    }

    item.retries++;
    paQueueSave();

    paBuildPayload(item.eventType, vehicle).then(function (payload) {
        return paSendWebhook(payload);
    })
        .then(function () {
            paQueue.shift();
            paQueueSave();
            paUpdateIndicator();
            _paLastSendStatus = { ok: true, time: new Date().toISOString(), event: item.eventType };
            if (paQueue.length > 0) setTimeout(paQueueRetry, 2000);
        })
        .catch(function (err) {
            _paLastSendStatus = { ok: false, time: new Date().toISOString(), event: item.eventType, error: String(err) };
            // Exponential backoff: 3s → 6s → 12s → 24s → ... capped at 60s
            var delay = Math.min(3000 * Math.pow(2, item.retries - 1), 60000);
            setTimeout(paQueueRetry, delay);
        });
}

// ══════════════════════════════════════════════════════════════
// PAYLOAD BUILDER
// ══════════════════════════════════════════════════════════════

// Returns a Promise that resolves to the full payload object.
// Async because the scannedReport photo (IndexedDB) is fetched async.
function paBuildPayload(eventType, vehicle) {
    return new Promise(function (resolve) {
        var payload = {
            event: eventType,
            timestamp: new Date().toISOString(),
            station: paConfig.stationName,
            vehicle: {
                id: vehicle.id,
                vin: vehicle.vin || '',
                configCode: vehicle.configCode || '',
                purpose: vehicle.purpose || '',
                model: (vehicle.config && vehicle.config['Modelo']) || '',
                engine: (vehicle.config && vehicle.config['ENGINE CAPACITY']) || '',
                regulation: (vehicle.config && vehicle.config['EMISSION REGULATION']) || '',
                transmission: (vehicle.config && vehicle.config['TRANSMISSION']) || '',
                registeredBy: vehicle.registeredBy || '',
                registeredAt: vehicle.registeredAt || '',
                status: vehicle.status || ''
            }
        };

        if (eventType !== 'vehicle_released') {
            resolve(payload);
            return;
        }

        payload.vehicle.archivedAt = vehicle.archivedAt || '';
        payload.vehicle.resultado = _paExtractResult(vehicle);
        payload.vehicle.testSummary = _paExtractTestSummary(vehicle);

        // Attach digital signatures if present
        if (vehicle.testData && vehicle.testData.signatures) {
            payload.signatures = {
                technician: vehicle.testData.signatures.technician || null,
                releaser: vehicle.testData.signatures.releaser || null
            };
        }

        // Combined-PDF path for emissions vehicles: COP15-F05 (page 1) + scanned photo (page 2)
        // in a single PDF, so the Power Automate flow only handles one attachment.
        if (paConfig.includePdfOnRelease &&
            typeof isEmissionsPurpose === 'function' &&
            isEmissionsPurpose(vehicle.purpose) &&
            typeof generateCOP15PDF === 'function') {

            var doc = null;
            try { doc = generateCOP15PDF(vehicle.id, { returnDoc: true, silent: true }); }
            catch (e) { console.warn('PA: PDF doc generation failed:', e); }
            if (!doc) { console.warn('PA: generateCOP15PDF returned null for vehicle', vehicle.id, '— will send photo only if available'); }

            paPhotoGet(vehicle.id, function (photo) {
                var fname = 'COP15-F05_' + (vehicle.vin || 'SIN-VIN') + '_' + new Date().toISOString().split('T')[0] + '.pdf';

                function finalize() {
                    var pdfSucceeded = false;
                    if (doc) {
                        try {
                            payload.pdf = {
                                base64: doc.output('base64'),
                                filename: fname,
                                contentType: 'application/pdf'
                            };
                            pdfSucceeded = true;
                        } catch (e) {
                            console.warn('PA: PDF output failed:', e);
                        }
                    }
                    if (pdfSucceeded && photo && photo.base64) {
                        // Photo was successfully embedded as page 2 of the PDF
                        payload.scannedReportEmbedded = {
                            pageInPdf: 2,
                            capturedAt: photo.capturedAt || ''
                        };
                    } else if (photo && photo.base64) {
                        // PDF not available — send photo as a separate attachment
                        payload.scannedReport = {
                            base64: photo.base64,
                            filename: photo.filename || ('Resultados_' + (vehicle.vin || 'SIN-VIN') + '_' + new Date().toISOString().split('T')[0] + '.jpg'),
                            contentType: photo.contentType || 'image/jpeg',
                            capturedAt: photo.capturedAt || ''
                        };
                    } else if (vehicle.testData && vehicle.testData.scannedReportCaptured) {
                        payload.scannedReportMissing = {
                            reason: 'captured-on-another-station',
                            flaggedAt: vehicle.testData.scannedReportCapturedAt || ''
                        };
                        console.warn('PA: scannedReport flagged but not in local IndexedDB for vehicle', vehicle.id);
                    }
                    resolve(payload);
                }

                if (doc && photo && photo.base64) {
                    try { doc.addPage(); } catch (e) { console.warn('PA: addPage failed:', e); finalize(); return; }
                    var pageW = doc.internal.pageSize.getWidth();
                    var pageH = doc.internal.pageSize.getHeight();

                    // Page header
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(5, 20, 31);
                    doc.text('Hoja de Resultados — Captura VETS', pageW / 2, 13, { align: 'center' });
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');
                    var capStr = '';
                    try { capStr = photo.capturedAt ? new Date(photo.capturedAt).toLocaleString('es-MX') : ''; } catch (e) {}
                    doc.text('VIN: ' + (vehicle.vin || 'SIN-VIN') + '   ·   Capturada: ' + capStr,
                             pageW / 2, 19, { align: 'center' });

                    var dataUrl = 'data:' + (photo.contentType || 'image/jpeg') + ';base64,' + photo.base64;
                    var imgFmt = (photo.contentType === 'image/png') ? 'PNG' : 'JPEG';
                    var areaX = 8, areaY = 24, areaW = pageW - 16, areaH = pageH - areaY - 8;

                    var img = new Image();
                    img.onload = function () {
                        var r = Math.min(areaW / img.naturalWidth, areaH / img.naturalHeight);
                        var dW = img.naturalWidth * r;
                        var dH = img.naturalHeight * r;
                        var dX = areaX + (areaW - dW) / 2;
                        var dY = areaY + (areaH - dH) / 2;
                        try { doc.addImage(dataUrl, imgFmt, dX, dY, dW, dH); }
                        catch (e) { console.warn('PA: addImage failed:', e); }
                        finalize();
                    };
                    img.onerror = function () {
                        try { doc.addImage(dataUrl, imgFmt, areaX, areaY, areaW, areaH); }
                        catch (e) { console.warn('PA: addImage fallback failed:', e); }
                        finalize();
                    };
                    img.src = dataUrl;
                } else {
                    finalize();
                }
            });
            return; // resolve() runs inside finalize()
        }

        // Non-emissions / PDF disabled fallback: send the photo separately if present
        paPhotoGet(vehicle.id, function (photo) {
            if (photo && photo.base64) {
                payload.scannedReport = {
                    base64: photo.base64,
                    filename: photo.filename || ('Resultados_' + (vehicle.vin || 'SIN-VIN') + '_' + new Date().toISOString().split('T')[0] + '.jpg'),
                    contentType: photo.contentType || 'image/jpeg',
                    capturedAt: photo.capturedAt || ''
                };
            }
            resolve(payload);
        });
    });
}

function _paExtractResult(vehicle) {
    var td = vehicle.testData || {};
    return td.resultado || (td.simple && td.simple.resultado) || '';
}

function _paExtractTestSummary(vehicle) {
    var td = vehicle.testData || {};
    var summary = {};

    // Inertia & target values
    if (td.etw != null) summary.etw = td.etw;
    if (td.targetA != null) summary.targetA = td.targetA;
    if (td.dynoA != null) summary.dynoA = td.dynoA;
    if (td.targetB != null) summary.targetB = td.targetB;
    if (td.dynoB != null) summary.dynoB = td.dynoB;
    if (td.targetC != null) summary.targetC = td.targetC;
    if (td.dynoC != null) summary.dynoC = td.dynoC;

    // Operator info
    if (td.operator) summary.operator = td.operator;
    if (td.testResponsible) summary.testResponsible = td.testResponsible;
    if (td.odometer != null) summary.odometer = td.odometer;
    if (td.testDatetime) summary.testDatetime = td.testDatetime;

    // Preconditioning highlights
    if (td.preconditioning) {
        var p = td.preconditioning;
        summary.preconditioning = {
            cycle: p.cycle || '',
            soakTimeH: p.soakTimeH || '',
            responsible: p.responsible || '',
            datetime: p.datetime || '',
            dtc: p.dtc || {}
        };
    }

    // Test verification highlights
    if (td.testVerification) {
        var tv = td.testVerification;
        summary.testVerification = {
            tunnel: tv.tunnel || '',
            dyno: tv.dyno || '',
            fanMode: tv.fanMode || ''
        };
    }

    return summary;
}

// ══════════════════════════════════════════════════════════════
// HTTP WEBHOOK
// ══════════════════════════════════════════════════════════════

function paSendWebhook(payload) {
    return fetch(paConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        return res;
    });
}

// ══════════════════════════════════════════════════════════════
// EVENT HANDLERS — connected via EventBus (onEvent)
// ══════════════════════════════════════════════════════════════

function paOnVehicleRegistered(data) {
    if (!paConfig.enabled || !paConfig.webhookUrl || !paConfig.triggerOnRegister) return;
    var vehicle = data && data.vehicle;
    if (!vehicle) return;

    if (!navigator.onLine) {
        paQueueAdd('vehicle_registered', vehicle.id);
        if (typeof showToast === 'function') showToast('Sin conexión — aprobación en cola', 'info');
        return;
    }

    paBuildPayload('vehicle_registered', vehicle).then(function (payload) {
        return paSendWebhook(payload);
    }).then(function () {
        _paLastSendStatus = { ok: true, time: new Date().toISOString(), event: 'vehicle_registered' };
        if (vehicle && typeof db !== 'undefined') {
            if (!vehicle.paStatus) vehicle.paStatus = {};
            vehicle.paStatus.vehicle_registered = { sent: true, sentAt: new Date().toISOString() };
            if (typeof saveDB === 'function') saveDB();
        }
        if (typeof showToast === 'function') showToast('Aprobación disparada en Power Automate', 'success');
    }).catch(function (err) {
        _paLastSendStatus = { ok: false, time: new Date().toISOString(), event: 'vehicle_registered', error: String(err) };
        paQueueAdd('vehicle_registered', vehicle.id);
        if (typeof showToast === 'function') showToast('Webhook en cola — se reintentará automáticamente', 'warning');
    });
}

function paOnVehicleReleased(data) {
    if (!paConfig.enabled || !paConfig.webhookUrl || !paConfig.triggerOnRelease) return;
    var vehicle = data && data.vehicle;
    if (!vehicle || data.isRetest) return;

    if (!navigator.onLine) {
        paQueueAdd('vehicle_released', vehicle.id);
        if (typeof showToast === 'function') showToast('Sin conexión — liberación en cola', 'info');
        return;
    }

    paBuildPayload('vehicle_released', vehicle).then(function (payload) {
        return paSendWebhook(payload);
    }).then(function () {
        _paLastSendStatus = { ok: true, time: new Date().toISOString(), event: 'vehicle_released' };
        if (vehicle && typeof db !== 'undefined') {
            if (!vehicle.paStatus) vehicle.paStatus = {};
            vehicle.paStatus.vehicle_released = { sent: true, sentAt: new Date().toISOString() };
            if (typeof saveDB === 'function') saveDB();
        }
        if (typeof showToast === 'function') showToast('Documentación enviada a Power Automate', 'success');
    }).catch(function (err) {
        _paLastSendStatus = { ok: false, time: new Date().toISOString(), event: 'vehicle_released', error: String(err) };
        paQueueAdd('vehicle_released', vehicle.id);
        if (typeof showToast === 'function') showToast('Webhook de liberación en cola — se reintentará', 'warning');
    });
}

// ══════════════════════════════════════════════════════════════
// STATUS INDICATOR
// ══════════════════════════════════════════════════════════════

function paUpdateIndicator() {
    var badge = document.getElementById('pa-queue-badge');
    if (badge) {
        badge.textContent = paQueue.length;
        badge.style.display = paQueue.length > 0 ? 'inline-flex' : 'none';
    }
    // Badge on the HOY platform tab — tells the user something needs attention
    var todayBadge = document.getElementById('today-pa-badge');
    if (todayBadge) {
        if (paQueue.length > 0) {
            todayBadge.textContent = paQueue.length;
            todayBadge.style.display = 'inline-flex';
        } else {
            todayBadge.style.display = 'none';
        }
    }
    // Refresh the Today dashboard card if it is currently rendered
    if (typeof paRenderTodayCard === 'function') paRenderTodayCard();
}

// ══════════════════════════════════════════════════════════════
// TEST WEBHOOK
// ══════════════════════════════════════════════════════════════

function paTestWebhook() {
    if (!paConfig.webhookUrl) {
        if (typeof showToast === 'function') showToast('Configura primero la URL del webhook', 'error');
        return;
    }

    var testPayload = {
        event: 'test_ping',
        timestamp: new Date().toISOString(),
        station: paConfig.stationName,
        message: 'Conexión de prueba desde KIA EmLab Cascade'
    };

    if (typeof showToast === 'function') showToast('Enviando prueba...', 'info');

    paSendWebhook(testPayload)
        .then(function () {
            _paLastSendStatus = { ok: true, time: new Date().toISOString(), event: 'test_ping' };
            if (typeof showToast === 'function') showToast('Webhook de prueba exitoso', 'success');
            paRenderConfigUI(_paConfigContainerId);
        })
        .catch(function (err) {
            _paLastSendStatus = { ok: false, time: new Date().toISOString(), event: 'test_ping', error: String(err) };
            if (typeof showToast === 'function') showToast('Error en prueba: ' + err.message, 'error');
            paRenderConfigUI(_paConfigContainerId);
        });
}

// ══════════════════════════════════════════════════════════════
// CONFIGURATION UI — rendered inside Panel → System Health
// ══════════════════════════════════════════════════════════════

function paRenderConfigUI(containerId) {
    var el = document.getElementById(containerId || 'pa-config-container');
    if (!el) return;
    // Remember which container is currently showing the form so async
    // re-renders (test webhook result, queue changes) update the right DOM.
    _paConfigContainerId = el.id;

    // Status badge
    var statusHtml = '';
    if (_paLastSendStatus) {
        var icon = _paLastSendStatus.ok ? '&#10004;' : '&#10008;';
        var statusColor = _paLastSendStatus.ok ? '#10b981' : '#ef4444';
        var statusBg = _paLastSendStatus.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
        var label = _paLastSendStatus.ok ? 'Exitoso' : 'Error';
        var timeStr = '';
        try { timeStr = new Date(_paLastSendStatus.time).toLocaleTimeString('es-MX'); } catch (e) { timeStr = _paLastSendStatus.time; }
        statusHtml = '<div style="padding:6px 8px;background:' + statusBg + ';border-radius:6px;font-size:10px;margin-top:8px;color:' + statusColor + ';">';
        statusHtml += icon + ' ' + label + ' (' + _paLastSendStatus.event + ') — ' + timeStr;
        if (_paLastSendStatus.error) statusHtml += '<br><span style="color:#ef4444;font-size:9px;">' + _paLastSendStatus.error + '</span>';
        statusHtml += '</div>';
    }

    // Queue status
    var queueHtml = '';
    if (paQueue.length > 0) {
        queueHtml = '<div style="padding:6px 8px;background:rgba(245,158,11,0.1);border-radius:6px;font-size:10px;margin-top:8px;color:#f59e0b;">';
        queueHtml += '&#9203; ' + paQueue.length + ' webhook(s) pendiente(s)';
        queueHtml += ' <button onclick="paQueueClear()" style="margin-left:8px;font-size:9px;padding:2px 6px;border:1px solid rgba(245,158,11,0.3);border-radius:4px;background:transparent;color:#f59e0b;cursor:pointer;">Limpiar</button>';
        queueHtml += '</div>';
    }

    el.innerHTML =
        // Enable toggle
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
            '<span style="font-size:11px;color:#e2e8f0;">Activar integración</span>' +
            '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">' +
                '<span style="font-size:10px;color:var(--tp-dim);">' + (paConfig.enabled ? 'ON' : 'OFF') + '</span>' +
                '<input type="checkbox" id="pa-enabled" onchange="paToggleEnabled(this.checked)" ' + (paConfig.enabled ? 'checked' : '') + ' style="cursor:pointer;">' +
            '</label>' +
        '</div>' +

        // Webhook URL
        '<div style="margin-bottom:8px;">' +
            '<label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">URL del Webhook (HTTP trigger de Power Automate)</label>' +
            '<input type="url" id="pa-webhook-url" value="' + _paEscAttr(paConfig.webhookUrl) + '" ' +
                'onchange="paUpdateField(\'webhookUrl\', this.value)" ' +
                'placeholder="https://prod-xx.westus.logic.azure.com:443/workflows/..." ' +
                'style="width:100%;padding:6px 8px;font-size:10px;border:1px solid rgba(100,116,139,0.3);border-radius:6px;background:rgba(15,23,42,0.5);color:#e2e8f0;box-sizing:border-box;">' +
        '</div>' +

        // Station name
        '<div style="margin-bottom:8px;">' +
            '<label style="font-size:10px;color:var(--tp-dim);display:block;margin-bottom:3px;">Nombre de Estación</label>' +
            '<input type="text" id="pa-station-name" value="' + _paEscAttr(paConfig.stationName) + '" ' +
                'onchange="paUpdateField(\'stationName\', this.value)" ' +
                'style="width:100%;padding:6px 8px;font-size:10px;border:1px solid rgba(100,116,139,0.3);border-radius:6px;background:rgba(15,23,42,0.5);color:#e2e8f0;box-sizing:border-box;">' +
        '</div>' +

        // Trigger options
        '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">' +
            '<label style="font-size:10px;color:#e2e8f0;display:flex;align-items:center;gap:6px;cursor:pointer;">' +
                '<input type="checkbox" onchange="paUpdateCheckbox(\'triggerOnRegister\', this.checked)" ' + (paConfig.triggerOnRegister ? 'checked' : '') + ' style="cursor:pointer;">' +
                'Disparar al registrar (crea aprobación pendiente)' +
            '</label>' +
            '<label style="font-size:10px;color:#e2e8f0;display:flex;align-items:center;gap:6px;cursor:pointer;">' +
                '<input type="checkbox" onchange="paUpdateCheckbox(\'triggerOnRelease\', this.checked)" ' + (paConfig.triggerOnRelease ? 'checked' : '') + ' style="cursor:pointer;">' +
                'Disparar al liberar (envía documentación)' +
            '</label>' +
            '<label style="font-size:10px;color:#e2e8f0;display:flex;align-items:center;gap:6px;cursor:pointer;">' +
                '<input type="checkbox" onchange="paUpdateCheckbox(\'includePdfOnRelease\', this.checked)" ' + (paConfig.includePdfOnRelease ? 'checked' : '') + ' style="cursor:pointer;">' +
                'Incluir PDF COP15-F05 al liberar' +
            '</label>' +
        '</div>' +

        // Action buttons
        '<div style="display:flex;gap:6px;">' +
            '<button onclick="paTestWebhook()" class="tp-btn tp-btn-ghost" style="flex:1;font-size:10px;padding:6px;">Probar Conexión</button>' +
            '<button onclick="paManualRetry()" class="tp-btn tp-btn-ghost" style="flex:1;font-size:10px;padding:6px;">Reintentar (' + paQueue.length + ')</button>' +
        '</div>' +

        statusHtml + queueHtml;
}

function _paEscAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Config UI handlers ──

function paToggleEnabled(val) {
    paConfig.enabled = !!val;
    paSaveConfig();
    paRenderConfigUI(_paConfigContainerId);
    // Refresh the Today dashboard card if visible
    if (typeof paRenderTodayCard === 'function') paRenderTodayCard();
    if (typeof showToast === 'function') showToast('Power Automate ' + (val ? 'activado' : 'desactivado'), 'info');
}

function paUpdateField(field, val) {
    paConfig[field] = val;
    paSaveConfig();
}

function paUpdateCheckbox(field, val) {
    paConfig[field] = !!val;
    paSaveConfig();
}

function paQueueClear() {
    paQueue = [];
    paQueueSave();
    paUpdateIndicator();
    paRenderConfigUI(_paConfigContainerId);
    if (typeof paRenderTodayCard === 'function') paRenderTodayCard();
    if (typeof showToast === 'function') showToast('Cola de webhooks limpiada', 'info');
}

function paManualRetry() {
    if (paQueue.length === 0) {
        if (typeof showToast === 'function') showToast('No hay webhooks pendientes', 'info');
        return;
    }
    if (typeof showToast === 'function') showToast('Reintentando ' + paQueue.length + ' webhook(s)...', 'info');
    paQueueRetry();
}

// ══════════════════════════════════════════════════════════════
// INDEXEDDB PHOTO STORAGE
// Stores the scanned results sheet photo separately from
// localStorage (which is capped at 5MB). Pattern follows
// _openBackupDB() in app.js.
// ══════════════════════════════════════════════════════════════

var _paPhotoDBName = 'kia_pa_photos_db';
var _paPhotoStoreName = 'photos';

function _paOpenPhotoDB(callback) {
    try {
        var req = indexedDB.open(_paPhotoDBName, 1);
        req.onupgradeneeded = function (e) {
            var idb = e.target.result;
            if (!idb.objectStoreNames.contains(_paPhotoStoreName)) {
                idb.createObjectStore(_paPhotoStoreName, { keyPath: 'vehicleId' });
            }
        };
        req.onsuccess = function (e) { callback(e.target.result); };
        req.onerror = function () {
            console.warn('PA: IndexedDB photo store error');
            callback(null);
        };
    } catch (e) {
        console.warn('PA: IndexedDB not available:', e);
        callback(null);
    }
}

function paPhotoStore(vehicleId, dataObj, cb) {
    _paOpenPhotoDB(function (idb) {
        if (!idb) { if (cb) cb(false); return; }
        try {
            var tx = idb.transaction(_paPhotoStoreName, 'readwrite');
            var store = tx.objectStore(_paPhotoStoreName);
            var record = {
                vehicleId: String(vehicleId),
                base64: dataObj.base64,
                filename: dataObj.filename || ('Resultados_' + vehicleId + '.jpg'),
                contentType: dataObj.contentType || 'image/jpeg',
                capturedAt: dataObj.capturedAt || new Date().toISOString(),
                sizeBytes: (dataObj.base64 || '').length
            };
            store.put(record);
            tx.oncomplete = function () { if (cb) cb(true); };
            tx.onerror = function () { if (cb) cb(false); };
        } catch (e) {
            console.warn('paPhotoStore:', e);
            if (cb) cb(false);
        }
    });
}

function paPhotoGet(vehicleId, cb) {
    _paOpenPhotoDB(function (idb) {
        if (!idb) { cb(null); return; }
        try {
            var tx = idb.transaction(_paPhotoStoreName, 'readonly');
            var store = tx.objectStore(_paPhotoStoreName);
            var req = store.get(String(vehicleId));
            req.onsuccess = function () { cb(req.result || null); };
            req.onerror = function () { cb(null); };
        } catch (e) {
            console.warn('paPhotoGet:', e);
            cb(null);
        }
    });
}

function paPhotoHas(vehicleId, cb) {
    _paOpenPhotoDB(function (idb) {
        if (!idb) { cb(false); return; }
        try {
            var tx = idb.transaction(_paPhotoStoreName, 'readonly');
            var store = tx.objectStore(_paPhotoStoreName);
            var req = store.getKey ? store.getKey(String(vehicleId)) : store.get(String(vehicleId));
            req.onsuccess = function () { cb(!!req.result); };
            req.onerror = function () { cb(false); };
        } catch (e) { cb(false); }
    });
}

// Photo gate that respects "captured on another station via Smart Merge".
// Calls cb(state) where state is one of: 'ok', 'not-needed', 'missing-flag', 'remote-only'.
// 'remote-only' means vehicle.testData.scannedReportCaptured=true but the photo file isn't
// in this station's IndexedDB — typically the case after Smart Merge from another station.
function paPhotoLocalState(vehicle, cb) {
    var emissions = typeof isEmissionsPurpose === 'function' && isEmissionsPurpose(vehicle.purpose);
    if (!emissions) { cb('not-needed'); return; }
    var flagged = !!(vehicle.testData && vehicle.testData.scannedReportCaptured);
    if (!flagged) { cb('missing-flag'); return; }
    paPhotoHas(vehicle.id, function (has) {
        cb(has ? 'ok' : 'remote-only');
    });
}

function paPhotoDelete(vehicleId, cb) {
    _paOpenPhotoDB(function (idb) {
        if (!idb) { if (cb) cb(false); return; }
        try {
            var tx = idb.transaction(_paPhotoStoreName, 'readwrite');
            tx.objectStore(_paPhotoStoreName)['delete'](String(vehicleId));
            tx.oncomplete = function () { if (cb) cb(true); };
            tx.onerror = function () { if (cb) cb(false); };
        } catch (e) { if (cb) cb(false); }
    });
}

// Remove photos for vehicles archived >90 days ago
function paPhotoCleanup() {
    if (typeof db === 'undefined' || !db.vehicles) return;
    var cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
    var activeIds = {};
    db.vehicles.forEach(function (v) {
        var archived = v.archivedAt ? new Date(v.archivedAt).getTime() : 0;
        if (!archived || archived > cutoff) activeIds[String(v.id)] = true;
    });

    _paOpenPhotoDB(function (idb) {
        if (!idb) return;
        try {
            var tx = idb.transaction(_paPhotoStoreName, 'readwrite');
            var store = tx.objectStore(_paPhotoStoreName);
            var cursor = store.openCursor();
            cursor.onsuccess = function (e) {
                var c = e.target.result;
                if (!c) return;
                if (!activeIds[c.key]) c.delete();
                c.continue();
            };
        } catch (e) { console.warn('paPhotoCleanup:', e); }
    });
}

// Returns total bytes in the photo store (for System Health)
function paPhotoTotalSize(cb) {
    _paOpenPhotoDB(function (idb) {
        if (!idb) { cb(0, 0); return; }
        try {
            var tx = idb.transaction(_paPhotoStoreName, 'readonly');
            var store = tx.objectStore(_paPhotoStoreName);
            var total = 0, count = 0;
            var cursor = store.openCursor();
            cursor.onsuccess = function (e) {
                var c = e.target.result;
                if (!c) { cb(total, count); return; }
                total += (c.value.sizeBytes || (c.value.base64 || '').length);
                count++;
                c.continue();
            };
            cursor.onerror = function () { cb(0, 0); };
        } catch (e) { cb(0, 0); }
    });
}

// ══════════════════════════════════════════════════════════════
// CAMERA CAPTURE — live camera (getUserMedia) with compression
// Reusable modal overlay separate from other module modals.
// ══════════════════════════════════════════════════════════════

var _paCameraStream = null;
var _paCameraVehicleId = null;

function paCameraOpen(vehicleId) {
    _paCameraVehicleId = vehicleId;

    var overlay = document.getElementById('pa-camera-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'pa-camera-overlay';
        overlay.className = 'pa-camera-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML =
        '<div class="pa-camera-box">' +
            '<div class="pa-camera-header">' +
                '<div class="pa-camera-title">Hoja de Resultados</div>' +
                '<button type="button" class="pa-camera-close-btn" onclick="paCameraClose()">&#10005;</button>' +
            '</div>' +
            '<div class="pa-camera-hint">Encuadra la hoja de resultados de emisiones y toca Capturar.</div>' +
            '<div class="pa-camera-stage">' +
                '<video id="pa-camera-video" autoplay playsinline muted></video>' +
                '<canvas id="pa-camera-canvas" style="display:none;"></canvas>' +
                '<div id="pa-camera-status" class="pa-camera-status"></div>' +
            '</div>' +
            '<div class="pa-camera-actions">' +
                '<button type="button" class="btn btn-ghost" onclick="paCameraClose()">Cancelar</button>' +
                '<button type="button" id="pa-camera-capture-btn" class="btn btn-primary" onclick="paCameraCapture()">Capturar</button>' +
            '</div>' +
        '</div>';
    overlay.style.display = 'flex';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        _paCameraShowStatus('La camara no esta disponible en este dispositivo.', true);
        return;
    }

    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
        audio: false
    }).then(function (stream) {
        _paCameraStream = stream;
        var video = document.getElementById('pa-camera-video');
        if (video) {
            video.srcObject = stream;
            video.play().catch(function () {});
        }
    }).catch(function (err) {
        _paCameraShowStatus('No se pudo iniciar la camara: ' + (err && err.message ? err.message : err), true);
    });
}

function _paCameraShowStatus(msg, isError) {
    var s = document.getElementById('pa-camera-status');
    if (!s) return;
    s.textContent = msg;
    s.style.color = isError ? '#ef4444' : '#10b981';
    s.style.display = 'block';
}

function paCameraCapture() {
    var video = document.getElementById('pa-camera-video');
    var canvas = document.getElementById('pa-camera-canvas');
    if (!video || !canvas || !video.videoWidth) {
        _paCameraShowStatus('La camara aun no esta lista.', true);
        return;
    }

    var btn = document.getElementById('pa-camera-capture-btn');
    if (btn) btn.disabled = true;

    // Draw full frame, then compress via resize
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    var dataUrl = paCompressImage(canvas, 1400, 0.75);

    var record = {
        base64: dataUrl.split(',')[1] || dataUrl, // strip "data:image/jpeg;base64,"
        filename: 'Resultados_' + (_paCameraVehicleId || 'veh') + '_' + new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '.jpg',
        contentType: 'image/jpeg',
        capturedAt: new Date().toISOString()
    };

    paPhotoStore(_paCameraVehicleId, record, function (ok) {
        if (!ok) {
            _paCameraShowStatus('Error al guardar la foto. Intenta de nuevo.', true);
            if (btn) btn.disabled = false;
            return;
        }

        // Update lightweight flag on the vehicle so the UI + webhook know it is captured
        var _capturedVehId = _paCameraVehicleId;
        if (typeof db !== 'undefined' && db.vehicles) {
            var v = db.vehicles.find(function (x) { return x.id == _capturedVehId; });
            if (v) {
                if (!v.testData) v.testData = {};
                v.testData.scannedReportCaptured = true;
                v.testData.scannedReportCapturedAt = record.capturedAt;
                if (typeof saveDB === 'function') saveDB();
            }
        }

        paCameraClose();

        // Technician signature capture after VETS photo
        if (typeof sigCaptureOpen === 'function') {
            var _sigName = '';
            try { if (typeof authState !== 'undefined' && authState.currentUser) _sigName = authState.currentUser.name || ''; } catch (e) {}
            sigCaptureOpen({
                title: 'Firma del Tecnico (Documentacion VETS)',
                role: 'Tecnico',
                signerName: _sigName,
                onSave: function (sig) {
                    if (typeof db !== 'undefined' && db.vehicles) {
                        var v2 = db.vehicles.find(function (x) { return x.id == _capturedVehId; });
                        if (v2) {
                            if (!v2.testData) v2.testData = {};
                            if (!v2.testData.signatures) v2.testData.signatures = {};
                            v2.testData.signatures.technician = sig;
                            if (typeof saveDB === 'function') saveDB();
                        }
                    }
                    if (typeof showToast === 'function') showToast('Hoja de resultados capturada y firmada', 'success');
                    if (typeof paRenderDocUpload === 'function') paRenderDocUpload(_capturedVehId);
                    if (typeof loadRelease === 'function') { try { loadRelease(_capturedVehId); } catch (e) {} }
                    if (typeof renderHistory === 'function') { try { renderHistory(); } catch (e) {} }
                },
                onCancel: function () {
                    if (typeof showToast === 'function') showToast('Foto guardada, pero falta firma del tecnico', 'warning');
                    if (typeof paRenderDocUpload === 'function') paRenderDocUpload(_capturedVehId);
                    if (typeof loadRelease === 'function') { try { loadRelease(_capturedVehId); } catch (e) {} }
                    if (typeof renderHistory === 'function') { try { renderHistory(); } catch (e) {} }
                }
            });
        } else {
            if (typeof showToast === 'function') showToast('Hoja de resultados capturada', 'success');
            if (typeof paRenderDocUpload === 'function') paRenderDocUpload(_capturedVehId);
            if (typeof loadRelease === 'function') { try { loadRelease(_capturedVehId); } catch (e) {} }
            if (typeof renderHistory === 'function') { try { renderHistory(); } catch (e) {} }
        }
    });
}

function paCameraClose() {
    // Stop all tracks
    if (_paCameraStream) {
        try {
            _paCameraStream.getTracks().forEach(function (t) { t.stop(); });
        } catch (e) {}
        _paCameraStream = null;
    }

    var overlay = document.getElementById('pa-camera-overlay');
    if (overlay) overlay.style.display = 'none';
    _paCameraVehicleId = null;
}

// Scale the canvas down and return a JPEG data URL
function paCompressImage(sourceCanvas, maxWidth, quality) {
    var sw = sourceCanvas.width;
    var sh = sourceCanvas.height;
    if (sw <= maxWidth) {
        return sourceCanvas.toDataURL('image/jpeg', quality);
    }
    var ratio = maxWidth / sw;
    var out = document.createElement('canvas');
    out.width = Math.round(sw * ratio);
    out.height = Math.round(sh * ratio);
    out.getContext('2d').drawImage(sourceCanvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', quality);
}

// ══════════════════════════════════════════════════════════════
// UI: Doc Upload card on the Release screen
// ══════════════════════════════════════════════════════════════

function paRenderDocUpload(vehicleId) {
    var container = document.getElementById('pa-doc-upload-container');
    var card = document.getElementById('pa-doc-upload-card');
    if (!container || !card) return;

    var vehicle = null;
    if (typeof db !== 'undefined' && db.vehicles) {
        vehicle = db.vehicles.find(function (v) { return v.id == vehicleId; });
    }
    if (!vehicle) { card.style.display = 'none'; return; }

    var applies = typeof isEmissionsPurpose === 'function' && isEmissionsPurpose(vehicle.purpose);
    if (!applies) { card.style.display = 'none'; return; }

    card.style.display = '';
    container.innerHTML = '<div class="pa-doc-loading">Consultando evidencia...</div>';

    paPhotoGet(vehicleId, function (photo) {
        if (photo && photo.base64) {
            var when = '';
            try { when = new Date(photo.capturedAt).toLocaleString('es-MX'); } catch (e) { when = photo.capturedAt || ''; }
            var sizeKb = ((photo.sizeBytes || photo.base64.length) / 1024).toFixed(0);
            var src = 'data:' + (photo.contentType || 'image/jpeg') + ';base64,' + photo.base64;
            container.innerHTML =
                '<div class="pa-doc-status pa-doc-ok">' +
                    '<div class="pa-doc-thumb-wrap">' +
                        '<img class="pa-doc-thumb" src="' + src + '" alt="Hoja de resultados">' +
                    '</div>' +
                    '<div class="pa-doc-body">' +
                        '<div class="pa-doc-title">&#10004; Hoja de resultados capturada</div>' +
                        '<div class="pa-doc-sub">' + when + ' &middot; ~' + sizeKb + ' KB</div>' +
                        '<div class="pa-doc-actions">' +
                            '<button type="button" class="btn btn-sm btn-ghost" onclick="paDocView(\'' + String(vehicleId).replace(/'/g, "\\'") + '\')">Ver</button>' +
                            '<button type="button" class="btn btn-sm btn-ghost" onclick="paCameraOpen(\'' + String(vehicleId).replace(/'/g, "\\'") + '\')">Reemplazar</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        } else {
            container.innerHTML =
                '<div class="pa-doc-status pa-doc-pending">' +
                    '<div class="pa-doc-body">' +
                        '<div class="pa-doc-title">&#9888; Pendiente: Fotografia de hoja de resultados</div>' +
                        '<div class="pa-doc-sub">Obligatorio para vehiculos de emisiones. Toma la foto antes de liberar.</div>' +
                        '<div class="pa-doc-actions">' +
                            '<button type="button" class="btn btn-primary" onclick="paCameraOpen(\'' + String(vehicleId).replace(/'/g, "\\'") + '\')">Tomar Foto</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }

        // Also reflect state on the LIBERAR button if present
        paUpdateReleaseButtonState(vehicleId);
    });
}

function paDocView(vehicleId) {
    paPhotoGet(vehicleId, function (photo) {
        if (!photo || !photo.base64) {
            if (typeof showToast === 'function') showToast('No hay foto guardada', 'info');
            return;
        }
        var src = 'data:' + (photo.contentType || 'image/jpeg') + ';base64,' + photo.base64;
        var w = window.open('', '_blank');
        if (w) {
            w.document.write('<html><head><title>Hoja de Resultados</title></head><body style="margin:0;background:#000;"><img src="' + src + '" style="width:100%;height:auto;display:block;"></body></html>');
            w.document.close();
        }
    });
}

// Enable/disable the release button based on photo presence (emissions only)
function paUpdateReleaseButtonState(vehicleId) {
    var btn = document.getElementById('release-archive-btn');
    if (!btn) return;
    if (typeof db === 'undefined' || !db.vehicles) return;
    var vehicle = db.vehicles.find(function (v) { return v.id == vehicleId; });
    if (!vehicle) return;
    var applies = typeof isEmissionsPurpose === 'function' && isEmissionsPurpose(vehicle.purpose);
    if (!applies) { btn.disabled = false; btn.removeAttribute('title'); return; }

    var captured = !!(vehicle.testData && vehicle.testData.scannedReportCaptured);
    if (captured) {
        btn.disabled = false;
        btn.removeAttribute('title');
    } else {
        btn.disabled = true;
        btn.title = 'Captura la hoja de resultados antes de liberar';
    }
}

// ══════════════════════════════════════════════════════════════
// TODAY DASHBOARD CARD
// Prominent card on the "Hoy" view so the integration is
// discoverable without digging into Panel → System Health.
// The card is inserted/refreshed into `#pa-today-card-slot`
// which dailyDashRender() places at the top of the dashboard.
// ══════════════════════════════════════════════════════════════

function paRenderTodayCard() {
    var slot = document.getElementById('pa-today-card-slot');
    if (!slot) return; // not on Today screen

    var enabled = !!paConfig.enabled;
    var hasUrl = !!(paConfig.webhookUrl && paConfig.webhookUrl.trim());
    var queued = paQueue.length;

    // Dot color: red = disabled/no URL, amber = queue pending, green = ok
    var dotColor, label, subLabel;
    if (!enabled || !hasUrl) {
        dotColor = '#ef4444';
        label = hasUrl ? 'Desactivado' : 'Sin configurar';
        subLabel = hasUrl
            ? 'Actívalo para enviar aprobaciones a Teams'
            : 'Pega tu URL de Power Automate para empezar';
    } else if (queued > 0) {
        dotColor = '#f59e0b';
        label = queued + ' pendiente' + (queued === 1 ? '' : 's');
        subLabel = 'Se reenviarán automáticamente cuando haya conexión';
    } else {
        dotColor = '#10b981';
        label = 'Conectado';
        subLabel = 'Las aprobaciones se envían automáticamente';
    }

    var urlShort = '';
    if (hasUrl) {
        var u = paConfig.webhookUrl;
        urlShort = u.length > 60 ? u.slice(0, 40) + '…' + u.slice(-12) : u;
    }

    var lastStatus = '';
    if (_paLastSendStatus) {
        var ok = _paLastSendStatus.ok;
        var timeStr = '';
        try { timeStr = new Date(_paLastSendStatus.time).toLocaleTimeString('es-MX'); } catch (e) {}
        lastStatus = '<div class="pa-today-last" style="color:' + (ok ? '#10b981' : '#ef4444') + ';">'
            + (ok ? '✓' : '✗') + ' Último: ' + _paLastSendStatus.event + ' — ' + timeStr
            + '</div>';
    }

    slot.innerHTML =
        '<div class="daily-dash-section">' +
            '<div class="daily-dash-section-title">⚡ Integración Power Automate</div>' +
            '<div class="pa-today-card">' +
                '<div class="pa-today-head">' +
                    '<span class="pa-today-dot" style="background:' + dotColor + ';"></span>' +
                    '<div class="pa-today-head-text">' +
                        '<div class="pa-today-label">' + label + '</div>' +
                        '<div class="pa-today-sub">' + subLabel + '</div>' +
                    '</div>' +
                    (queued > 0 ? '<span class="pa-today-queue-badge">' + queued + '</span>' : '') +
                '</div>' +
                (hasUrl ? '<div class="pa-today-url" title="' + _paEscAttr(paConfig.webhookUrl) + '">' + urlShort + '</div>' : '') +
                lastStatus +
                '<div class="pa-today-actions">' +
                    '<button class="btn btn-sm btn-secondary" onclick="paShowConfigModal()">⚙ Configurar</button>' +
                    '<button class="btn btn-sm btn-ghost" onclick="paTestWebhook()"' + (hasUrl ? '' : ' disabled') + '>Probar</button>' +
                    (queued > 0 ? '<button class="btn btn-sm btn-ghost" onclick="paManualRetry()">Reintentar (' + queued + ')</button>' : '') +
                '</div>' +
            '</div>' +
        '</div>';
}

// ══════════════════════════════════════════════════════════════
// CONFIG MODAL — lets the user configure from anywhere, not
// just the Panel → System Health deep screen.
// ══════════════════════════════════════════════════════════════

function paShowConfigModal() {
    var overlay = document.getElementById('pa-config-modal-overlay');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);

    overlay = document.createElement('div');
    overlay.id = 'pa-config-modal-overlay';
    overlay.className = 'custom-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Configuración Power Automate');

    overlay.innerHTML =
        '<div class="custom-modal-box pa-config-modal-box">' +
            '<div class="custom-modal-title">⚡ Power Automate — Aprobación de Emisiones</div>' +
            '<div class="custom-modal-message" style="margin-bottom:12px;color:var(--tp-dim);font-size:11px;">' +
                'Dispara automáticamente el flujo de aprobación en Microsoft Teams al registrar o liberar un vehículo. ' +
                'Elimina la dependencia del escaneo manual.' +
            '</div>' +
            '<div id="pa-config-modal-body"></div>' +
            '<div class="custom-modal-actions" style="margin-top:12px;">' +
                '<button class="modal-btn-confirm modal-type-info" onclick="paCloseConfigModal()">Cerrar</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) paCloseConfigModal();
    });

    // Close on Escape
    overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') paCloseConfigModal();
    });

    // Mount the reusable config UI into the modal body
    paRenderConfigUI('pa-config-modal-body');

    // Focus the close button
    var btn = overlay.querySelector('.modal-btn-confirm');
    if (btn) btn.focus();
}

function paCloseConfigModal() {
    var overlay = document.getElementById('pa-config-modal-overlay');
    if (!overlay) return;
    overlay.classList.add('modal-closing');
    setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        // After closing, restore the tracked container to the Panel view
        // if the Panel is currently rendered, otherwise leave as-is.
        if (document.getElementById('pa-config-container')) {
            _paConfigContainerId = 'pa-config-container';
            paRenderConfigUI('pa-config-container');
        }
        // Refresh Today card since settings may have changed
        if (typeof paRenderTodayCard === 'function') paRenderTodayCard();
    }, 200);
}

// ══════════════════════════════════════════════════════════════
// MANUAL TRIGGER & BATCH — send PA webhooks for historical vehicles
// ══════════════════════════════════════════════════════════════

function paManualTrigger(vehicleId, eventType) {
    if (!paConfig.enabled || !paConfig.webhookUrl) {
        if (typeof showToast === 'function') showToast('Configura Power Automate primero', 'warning');
        return;
    }
    var vehicle = null;
    if (typeof db !== 'undefined' && db.vehicles) {
        vehicle = db.vehicles.find(function (v) { return v.id == vehicleId; });
    }
    if (!vehicle) { if (typeof showToast === 'function') showToast('Vehiculo no encontrado', 'error'); return; }

    // Gate: emissions vehicles must have the results photo captured AND physically present
    // in this station's IndexedDB before sending to PA. After Smart Merge a vehicle's flag
    // can say "captured" while the image bytes still live on the origin station.
    if (eventType === 'vehicle_released') {
        paPhotoLocalState(vehicle, function (state) {
            if (state === 'missing-flag') {
                if (typeof showToast === 'function') showToast('Falta la foto de hoja de resultados — captúrala antes de enviar a PA', 'error');
                return;
            }
            if (state === 'remote-only') {
                if (typeof showToast === 'function') showToast('La foto fue capturada en otra estación. Re-captúrala aquí antes de enviar a PA.', 'error');
                return;
            }
            _paManualTriggerSend(vehicle, eventType);
        });
        return;
    }
    _paManualTriggerSend(vehicle, eventType);
}

function _paManualTriggerSend(vehicle, eventType) {
    paBuildPayload(eventType, vehicle).then(function (payload) {
        return paSendWebhook(payload);
    }).then(function () {
        if (!vehicle.paStatus) vehicle.paStatus = {};
        var isResend = !!(vehicle.paStatus[eventType] && vehicle.paStatus[eventType].sent);
        vehicle.paStatus[eventType] = {
            sent: true,
            sentAt: new Date().toISOString(),
            manual: true,
            resendCount: isResend ? ((vehicle.paStatus[eventType].resendCount || 0) + 1) : 0
        };
        if (typeof saveDB === 'function') saveDB();
        _paLastSendStatus = { ok: true, time: new Date().toISOString(), event: eventType };
        if (typeof showToast === 'function') showToast((isResend ? 'Reenviado' : 'Enviado') + ' a Power Automate: ' + (vehicle.vin || vehicleId), 'success');
        if (typeof renderHistory === 'function') renderHistory();
    }).catch(function (err) {
        paQueueAdd(eventType, vehicleId);
        if (typeof showToast === 'function') showToast('En cola para reintento: ' + String(err), 'warning');
    });
}

function paBatchTriggerAll() {
    if (!paConfig.enabled || !paConfig.webhookUrl) {
        if (typeof showToast === 'function') showToast('Configura Power Automate primero', 'warning');
        return;
    }
    if (typeof db === 'undefined' || !db.vehicles) return;

    var archived = db.vehicles.filter(function (v) { return v.status === 'archived'; });
    var notSent = archived.filter(function (v) {
        return !(v.paStatus && v.paStatus.vehicle_released && v.paStatus.vehicle_released.sent);
    });

    // Resolve photo state for every candidate (async due to IndexedDB lookup).
    var ready = [];
    var blockedByFlag = 0;   // emissions, no flag at all
    var blockedRemoteOnly = 0; // flag yes, file lives in another station
    var pendingChecks = notSent.length;
    if (pendingChecks === 0) {
        if (typeof showToast === 'function') showToast('No hay pendientes', 'info');
        return;
    }

    notSent.forEach(function (v) {
        paPhotoLocalState(v, function (state) {
            if (state === 'ok' || state === 'not-needed') ready.push(v);
            else if (state === 'remote-only') blockedRemoteOnly++;
            else blockedByFlag++;
            pendingChecks--;
            if (pendingChecks === 0) _paBatchProceed(ready, blockedByFlag, blockedRemoteOnly);
        });
    });
}

function _paBatchProceed(ready, blockedByFlag, blockedRemoteOnly) {
    var totalBlocked = blockedByFlag + blockedRemoteOnly;
    if (ready.length === 0) {
        if (totalBlocked > 0 && typeof showToast === 'function') {
            showToast('No hay pendientes enviables — ' + totalBlocked + ' bloqueados (foto faltante o solo en otra estación)', 'warning');
        } else if (typeof showToast === 'function') {
            showToast('No hay pendientes', 'info');
        }
        return;
    }
    var msg = 'Enviar ' + ready.length + ' vehiculos a Power Automate?';
    var notes = [];
    if (blockedByFlag > 0) notes.push(blockedByFlag + ' sin foto');
    if (blockedRemoteOnly > 0) notes.push(blockedRemoteOnly + ' con foto solo en otra estación');
    if (notes.length > 0) msg += '\n\nOjo: ' + notes.join(', ') + ' quedaran fuera.';
    if (!confirm(msg)) return;

    var queued = 0;
    ready.forEach(function (v) {
        paQueueAdd('vehicle_released', v.id);
        queued++;
    });
    var toastMsg = queued + ' vehiculos agregados a la cola de PA';
    if (notes.length > 0) toastMsg += ' (' + notes.join(', ') + ')';
    if (typeof showToast === 'function') showToast(toastMsg, 'success');
    paQueueRetry();
}

// ══════════════════════════════════════════════════════════════
// WEEKLY PLAN WEBHOOK — send plan via PA for email/Teams distribution
// ══════════════════════════════════════════════════════════════

function paSendWeeklyPlan(plan) {
    if (!paConfig.enabled || !paConfig.webhookUrl) {
        console.log('PA not configured, plan not sent');
        return;
    }

    var payload = {
        event: 'weekly_plan_generated',
        timestamp: new Date().toISOString(),
        station: paConfig.stationName,
        plan: {
            weekDate: plan.weekDate,
            accepted: plan.accepted,
            acceptedDate: plan.acceptedDate || '',
            capacity: plan.capacity,
            itemCount: plan.items.length,
            items: plan.items.map(function (i) {
                return {
                    desc: i.desc, mod: i.mod, eng: i.eng, tx: i.tx, my: i.my,
                    tire: i.tire, scheduledDate: i.scheduledDate || '',
                    required: i.required, deficit: i.deficit
                };
            }),
            skippedInventory: plan.skippedInventory || []
        }
    };

    if (typeof generateWeeklyStatusPDF === 'function') {
        try {
            var b64 = generateWeeklyStatusPDF({ returnBase64: true, silent: true });
            if (b64) {
                payload.pdf = {
                    base64: b64,
                    filename: 'Plan-Semanal-' + plan.weekDate + '.pdf',
                    contentType: 'application/pdf'
                };
            }
        } catch (e) { console.warn('Weekly PDF base64 failed:', e); }
    }

    if (!navigator.onLine) {
        paQueueAdd('weekly_plan_generated', 'plan-' + plan.weekDate);
        return;
    }

    paSendWebhook(payload).then(function () {
        _paLastSendStatus = { ok: true, time: new Date().toISOString(), event: 'weekly_plan_generated' };
    }).catch(function (err) {
        console.error('Weekly plan webhook failed:', err);
        _paLastSendStatus = { ok: false, time: new Date().toISOString(), event: 'weekly_plan_generated', error: String(err) };
    });
}

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════

function paInit() {
    paLoadConfig();
    paQueueLoad();

    // Subscribe to vehicle lifecycle events via EventBus
    if (typeof onEvent === 'function') {
        onEvent('vehicle:registered', paOnVehicleRegistered);
        onEvent('vehicle:released', paOnVehicleReleased);
    }

    // Paint initial state for the HOY tab badge and dashboard card
    paUpdateIndicator();

    // Process any pending queue items on startup
    if (navigator.onLine && paQueue.length > 0) {
        setTimeout(paQueueRetry, 5000);
    }

    // Drop photos from vehicles archived >90 days ago
    setTimeout(function () {
        try { paPhotoCleanup(); } catch (e) {}
    }, 8000);

    console.log('PA Approvals: initialized (enabled=' + paConfig.enabled + ', queue=' + paQueue.length + ')');
}

// Auto-reconnect: retry queue when device comes back online
window.addEventListener('online', function () {
    if (paConfig.enabled && paQueue.length > 0) {
        setTimeout(paQueueRetry, 2000);
    }
});

// Initialize after DOM ready (EventBus from app.js must exist first)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(paInit, 500); });
} else {
    setTimeout(paInit, 500);
}
