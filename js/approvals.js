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

function paSaveConfig() {
    try {
        localStorage.setItem(PA_LS_KEY, JSON.stringify(paConfig));
    } catch (e) { console.warn('paSaveConfig:', e); }
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

    var payload = paBuildPayload(item.eventType, vehicle);
    item.retries++;
    paQueueSave();

    paSendWebhook(payload)
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

function paBuildPayload(eventType, vehicle) {
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

    if (eventType === 'vehicle_released') {
        payload.vehicle.archivedAt = vehicle.archivedAt || '';
        payload.vehicle.resultado = _paExtractResult(vehicle);
        payload.vehicle.testSummary = _paExtractTestSummary(vehicle);

        // Include PDF as base64 if configured and vehicle is emissions purpose
        if (paConfig.includePdfOnRelease &&
            typeof isEmissionsPurpose === 'function' &&
            isEmissionsPurpose(vehicle.purpose) &&
            typeof generateCOP15PDF === 'function') {
            try {
                var b64 = generateCOP15PDF(vehicle.id, { returnBase64: true, silent: true });
                if (b64) {
                    payload.pdf = {
                        base64: b64,
                        filename: 'COP15-F05_' + (vehicle.vin || 'SIN-VIN') + '_' + new Date().toISOString().split('T')[0] + '.pdf',
                        contentType: 'application/pdf'
                    };
                }
            } catch (e) {
                console.warn('PA: PDF base64 generation failed:', e);
            }
        }
    }

    return payload;
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

    var payload = paBuildPayload('vehicle_registered', vehicle);

    if (navigator.onLine) {
        paSendWebhook(payload)
            .then(function () {
                _paLastSendStatus = { ok: true, time: new Date().toISOString(), event: 'vehicle_registered' };
                if (typeof showToast === 'function') showToast('Aprobación disparada en Power Automate', 'success');
            })
            .catch(function (err) {
                _paLastSendStatus = { ok: false, time: new Date().toISOString(), event: 'vehicle_registered', error: String(err) };
                paQueueAdd('vehicle_registered', vehicle.id);
                if (typeof showToast === 'function') showToast('Webhook en cola — se reintentará automáticamente', 'warning');
            });
    } else {
        paQueueAdd('vehicle_registered', vehicle.id);
        if (typeof showToast === 'function') showToast('Sin conexión — aprobación en cola', 'info');
    }
}

function paOnVehicleReleased(data) {
    if (!paConfig.enabled || !paConfig.webhookUrl || !paConfig.triggerOnRelease) return;
    var vehicle = data && data.vehicle;
    if (!vehicle || data.isRetest) return;

    var payload = paBuildPayload('vehicle_released', vehicle);

    if (navigator.onLine) {
        paSendWebhook(payload)
            .then(function () {
                _paLastSendStatus = { ok: true, time: new Date().toISOString(), event: 'vehicle_released' };
                if (typeof showToast === 'function') showToast('Documentación enviada a Power Automate', 'success');
            })
            .catch(function (err) {
                _paLastSendStatus = { ok: false, time: new Date().toISOString(), event: 'vehicle_released', error: String(err) };
                paQueueAdd('vehicle_released', vehicle.id);
                if (typeof showToast === 'function') showToast('Webhook de liberación en cola — se reintentará', 'warning');
            });
    } else {
        paQueueAdd('vehicle_released', vehicle.id);
        if (typeof showToast === 'function') showToast('Sin conexión — liberación en cola', 'info');
    }
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
            paRenderConfigUI();
        })
        .catch(function (err) {
            _paLastSendStatus = { ok: false, time: new Date().toISOString(), event: 'test_ping', error: String(err) };
            if (typeof showToast === 'function') showToast('Error en prueba: ' + err.message, 'error');
            paRenderConfigUI();
        });
}

// ══════════════════════════════════════════════════════════════
// CONFIGURATION UI — rendered inside Panel → System Health
// ══════════════════════════════════════════════════════════════

function paRenderConfigUI() {
    var el = document.getElementById('pa-config-container');
    if (!el) return;

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
    paRenderConfigUI();
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
    paRenderConfigUI();
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

    // Process any pending queue items on startup
    if (navigator.onLine && paQueue.length > 0) {
        setTimeout(paQueueRetry, 5000);
    }

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
