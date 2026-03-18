/* ══════════════════════════════════════════════════════════════════════
   SOP GUIDED TOUR MODULE — Standard Operating Procedures
   Guided workflows that read/write to db.vehicles (shared with Cascade)
   Prefix: sop*
   localStorage key: kia_sop_v1
   Images: IndexedDB (sopImageDB)
   ══════════════════════════════════════════════════════════════════════ */

// ======================================================================
// [S00] STATE & CONSTANTS
// ======================================================================

var sopState = {
    currentTab: 'sop-guia',
    selectedVehicleId: null,
    editMode: false,
    expandedSections: {},
    expandedStep: null,
    customizations: {},  // { vehicleId: { steps: [...modifications] } }
    history: [],
    imageDBReady: false,
    templates: {},       // { id: { id, name, baseType, steps[], createdBy, createdAt, updatedAt, activeTemplate } }
    activeTemplateEmissions: null,  // template id to use for emissions vehicles (null = default)
    activeTemplateSimple: null,     // template id to use for simple vehicles (null = default)
    tmplEditId: null,               // template currently being edited
    tmplEditStep: null,             // step index within template editor being expanded
    tmplExpandedSections: {}        // expanded sections in template editor
};

var SOP_STORAGE_KEY = 'kia_sop_v1';
var _sopImageDB = null;

// ======================================================================
// [S01] STEP DEFINITIONS — EMISSIONS PROCEDURE
// ======================================================================

var SOP_EMISSIONS_STEPS = [
    // ── Recepción ──
    {
        title: '¿Quién recibe el vehículo?',
        description: 'Selecciona al operador responsable de recibir el vehículo en el laboratorio.',
        fieldType: 'select',
        cascadeFieldId: 'op_recep',
        dataPath: 'testData.operator',
        options: '__operators__',
        section: 'recepcion',
        sectionLabel: 'Recepción del Vehículo',
        sectionIcon: '📥'
    },
    {
        title: '¿Cuál es el odómetro actual del vehículo?',
        description: 'Registra la lectura del odómetro en kilómetros al momento de la recepción.',
        fieldType: 'number',
        cascadeFieldId: 'op_odo',
        dataPath: 'testData.odometer',
        placeholder: 'Ej: 15000',
        unit: 'km',
        section: 'recepcion'
    },
    {
        title: '¿Qué tipo de combustible tiene el vehículo?',
        description: 'Selecciona el tipo de combustible con el que ingresa el vehículo.',
        fieldType: 'select',
        cascadeFieldId: 'fuel_typein',
        dataPath: 'testData.preconditioning.fuelTypeIn',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'PemexPremium', label: 'Pemex Premium' },
            { value: 'Regular', label: 'Regular' },
            { value: 'RON95', label: 'RON 95' },
            { value: 'Magna', label: 'Magna' }
        ],
        section: 'recepcion'
    },
    {
        title: '¿Cuál es el nivel de combustible de entrada?',
        description: 'Selecciona la fracción del tanque que está llena.',
        fieldType: 'select',
        cascadeFieldId: 'fuel_levelin',
        dataPath: 'testData.preconditioning.fuelLevelFractionIn',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: '0', label: 'Vacío (0)' },
            { value: '0.125', label: '1/8' },
            { value: '0.25', label: '1/4' },
            { value: '0.5', label: '1/2' },
            { value: '0.75', label: '3/4' },
            { value: '1', label: 'Lleno (1)' }
        ],
        section: 'recepcion'
    },
    {
        title: '¿Cuál es la capacidad del tanque?',
        description: 'Ingresa la capacidad total del tanque de combustible en litros.',
        fieldType: 'number',
        cascadeFieldId: 'tank_capacity',
        dataPath: 'testData.preconditioning.tankCapacityL',
        placeholder: 'Ej: 50',
        unit: 'L',
        section: 'recepcion'
    },
    {
        title: '¿Cuál es la presión de llantas de entrada?',
        description: 'Registra la presión de llantas al momento de recepción en PSI.',
        fieldType: 'number',
        cascadeFieldId: 'tire_pressure_in',
        dataPath: 'testData.preconditioning.tirePressureInPsi',
        placeholder: 'Ej: 35',
        unit: 'PSI',
        section: 'recepcion'
    },
    {
        title: '¿Cuál es el estado de carga de la batería (SOC)?',
        description: 'Si aplica, registra el porcentaje de carga de la batería de alto voltaje.',
        fieldType: 'number',
        cascadeFieldId: 'battery_soc',
        dataPath: 'testData.preconditioning.batterySocPct',
        placeholder: 'Ej: 80',
        unit: '%',
        section: 'recepcion'
    },
    {
        title: '¿Notas adicionales de recepción?',
        description: 'Agrega cualquier observación relevante sobre el estado del vehículo.',
        fieldType: 'textarea',
        cascadeFieldId: 'op_notes',
        dataPath: 'testData.notes',
        placeholder: 'Observaciones...',
        section: 'recepcion'
    },

    // ── Preacondicionamiento ──
    {
        title: '¿Quién es responsable del preacondicionamiento?',
        description: 'Selecciona al operador que realizará los ciclos de preacondicionamiento.',
        fieldType: 'select',
        cascadeFieldId: 'precond_responsible',
        dataPath: 'testData.preconditioning.responsible',
        options: '__operators__',
        section: 'preacondicionamiento',
        sectionLabel: 'Preacondicionamiento',
        sectionIcon: '🔄'
    },
    {
        title: '¿Cuál es la presión de llantas para la prueba?',
        description: 'Ajusta la presión de llantas según la especificación de prueba.',
        fieldType: 'number',
        cascadeFieldId: 'tire_pressure',
        dataPath: 'testData.preconditioning.tirePressurePsi',
        placeholder: 'Ej: 35',
        unit: 'PSI',
        section: 'preacondicionamiento'
    },
    {
        title: '¿Cuántos litros de combustible tiene antes del preacondicionamiento?',
        description: 'Registra el nivel de combustible en litros antes de iniciar.',
        fieldType: 'number',
        cascadeFieldId: 'fuel_levelpre',
        dataPath: 'testData.preconditioning.fuelLevelLitersPre',
        placeholder: 'Ej: 25',
        unit: 'L',
        section: 'preacondicionamiento'
    },
    {
        title: '¿Qué combustible se usará para la prueba?',
        description: 'Selecciona el tipo de combustible certificado para la prueba.',
        fieldType: 'select',
        cascadeFieldId: 'fuel_typepre',
        dataPath: 'testData.preconditioning.fuelTypePre',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'PemexPremium', label: 'Pemex Premium' },
            { value: 'Euro6', label: 'Euro 6' },
            { value: 'CARBReg', label: 'CARB Regular' },
            { value: 'CARBPre', label: 'CARB Premium' },
            { value: 'CARBRVP', label: 'CARB RVP' },
            { value: 'indolene', label: 'Indolene' },
            { value: 'EPACert', label: 'EPA Cert Fuel' }
        ],
        section: 'preacondicionamiento'
    },
    {
        title: '¿Qué ciclo de preacondicionamiento se realizará?',
        description: 'Selecciona el ciclo de manejo para preacondicionamiento.',
        fieldType: 'select',
        cascadeFieldId: 'precond_cycle',
        dataPath: 'testData.preconditioning.cycle',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'WLTP', label: 'WLTP' },
            { value: 'UDDS', label: 'UDDS' },
            { value: 'NEDC', label: 'NEDC' }
        ],
        section: 'preacondicionamiento'
    },

    // ── Soak ──
    {
        title: '¿Deseas iniciar el contador de reposo?',
        description: 'El vehículo debe permanecer en reposo 12-36 horas antes de la prueba de emisiones.',
        fieldType: 'action',
        actionFn: 'soakTimerStart',
        actionLabel: 'Iniciar Temporizador de Soak',
        section: 'soak',
        sectionLabel: 'Periodo de Soak (Reposo)',
        sectionIcon: '⏱️'
    },
    {
        title: '¿Cuántas horas de soak se requieren?',
        description: 'Registra el tiempo de reposo efectivo en horas.',
        fieldType: 'number',
        cascadeFieldId: 'soak_time',
        dataPath: 'testData.preconditioning.soakTimeH',
        placeholder: 'Ej: 12',
        unit: 'h',
        section: 'soak'
    },
    {
        title: '¿Cuál es el odómetro pre-prueba?',
        description: 'Registra la lectura del odómetro antes de iniciar la prueba de emisiones.',
        fieldType: 'number',
        cascadeFieldId: 'odo_pretest',
        dataPath: 'testData.preconditioning.odoPretestKm',
        placeholder: 'Ej: 15050',
        unit: 'km',
        section: 'soak'
    },
    {
        title: '¿El preacondicionamiento fue exitoso?',
        description: 'Confirma si el vehículo cumple las condiciones para iniciar la prueba.',
        fieldType: 'select',
        cascadeFieldId: 'precond_ok',
        dataPath: 'testData.preconditioning.ok',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'yes', label: 'Sí — Aprobado' },
            { value: 'no', label: 'No — Requiere revisión' }
        ],
        section: 'soak'
    },

    // ── DTC ──
    {
        title: '¿Hay DTCs pendientes antes de la prueba?',
        description: 'Verifica si existen códigos de diagnóstico pendientes (Pending DTC).',
        fieldType: 'select',
        cascadeFieldId: 'dtc_pending_before',
        dataPath: 'testData.preconditioning.dtc.pendingBefore',
        options: [
            { value: 'no', label: 'No — Sin DTCs pendientes' },
            { value: 'yes', label: 'Sí — Hay DTCs pendientes' }
        ],
        section: 'dtc',
        sectionLabel: 'Verificación DTC',
        sectionIcon: '🔍'
    },
    {
        title: '¿Hay DTCs confirmados antes de la prueba?',
        description: 'Verifica si existen códigos de diagnóstico confirmados (Confirmed DTC).',
        fieldType: 'select',
        cascadeFieldId: 'dtc_confirmed_before',
        dataPath: 'testData.preconditioning.dtc.confirmedBefore',
        options: [
            { value: 'no', label: 'No — Sin DTCs confirmados' },
            { value: 'yes', label: 'Sí — Hay DTCs confirmados' }
        ],
        section: 'dtc'
    },
    {
        title: '¿Hay DTCs permanentes antes de la prueba?',
        description: 'Verifica si existen códigos de diagnóstico permanentes (Permanent DTC).',
        fieldType: 'select',
        cascadeFieldId: 'dtc_permanent_before',
        dataPath: 'testData.preconditioning.dtc.permanentBefore',
        options: [
            { value: 'no', label: 'No — Sin DTCs permanentes' },
            { value: 'yes', label: 'Sí — Hay DTCs permanentes' }
        ],
        section: 'dtc'
    },

    // ── Dinamómetro ──
    {
        title: '¿Cuál es el ETW (Equivalent Test Weight)?',
        description: 'Ingresa el peso equivalente de prueba en kg.',
        fieldType: 'number',
        cascadeFieldId: 'etw',
        dataPath: 'testData.etw',
        placeholder: 'Ej: 1360',
        unit: 'kg',
        section: 'dinamometro',
        sectionLabel: 'Dinamómetro',
        sectionIcon: '⚙️'
    },
    {
        title: '¿Cuál es el coeficiente Target A?',
        description: 'Coeficiente de resistencia A objetivo.',
        fieldType: 'number',
        cascadeFieldId: 'tA',
        dataPath: 'testData.targetA',
        placeholder: 'Ej: 6.1234',
        step: '0.0001',
        section: 'dinamometro'
    },
    {
        title: '¿Cuál es el coeficiente Dyno A?',
        description: 'Coeficiente de resistencia A del dinamómetro.',
        fieldType: 'number',
        cascadeFieldId: 'dA',
        dataPath: 'testData.dynoA',
        placeholder: 'Ej: 6.1234',
        step: '0.0001',
        section: 'dinamometro'
    },
    {
        title: '¿Cuál es el coeficiente Target B?',
        description: 'Coeficiente de resistencia B objetivo.',
        fieldType: 'number',
        cascadeFieldId: 'tB',
        dataPath: 'testData.targetB',
        placeholder: 'Ej: 0.123456',
        step: '0.000001',
        section: 'dinamometro'
    },
    {
        title: '¿Cuál es el coeficiente Dyno B?',
        description: 'Coeficiente de resistencia B del dinamómetro.',
        fieldType: 'number',
        cascadeFieldId: 'dB',
        dataPath: 'testData.dynoB',
        placeholder: 'Ej: 0.123456',
        step: '0.000001',
        section: 'dinamometro'
    },
    {
        title: '¿Cuál es el coeficiente Target C?',
        description: 'Coeficiente de resistencia C objetivo.',
        fieldType: 'number',
        cascadeFieldId: 'tC',
        dataPath: 'testData.targetC',
        placeholder: 'Ej: 0.01234567',
        step: '0.00000001',
        section: 'dinamometro'
    },
    {
        title: '¿Cuál es el coeficiente Dyno C?',
        description: 'Coeficiente de resistencia C del dinamómetro.',
        fieldType: 'number',
        cascadeFieldId: 'dC',
        dataPath: 'testData.dynoC',
        placeholder: 'Ej: 0.01234567',
        step: '0.00000001',
        section: 'dinamometro'
    },

    // ── Verificación en Prueba ──
    {
        title: '¿Quién es responsable de la prueba?',
        description: 'Selecciona al operador que realizará la prueba de emisiones.',
        fieldType: 'select',
        cascadeFieldId: 'test_responsible',
        dataPath: 'testData.testResponsible',
        options: '__operators__',
        section: 'verificacion',
        sectionLabel: 'Verificación en Prueba',
        sectionIcon: '🧪'
    },
    {
        title: '¿Qué túnel de emisiones se utilizará?',
        description: 'Selecciona el túnel de medición de emisiones.',
        fieldType: 'select',
        cascadeFieldId: 'test_tunnel',
        dataPath: 'testData.testVerification.tunnel',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'RMT1', label: 'RMT1' },
            { value: 'RMT2', label: 'RMT2' }
        ],
        section: 'verificacion'
    },
    {
        title: '¿El dinamómetro está encendido?',
        description: 'Confirma que el dinamómetro está operativo.',
        fieldType: 'select',
        cascadeFieldId: 'test_dyno_on',
        dataPath: 'testData.testVerification.dyno',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'on', label: 'Encendido' },
            { value: 'off', label: 'Apagado' }
        ],
        section: 'verificacion'
    },
    {
        title: '¿Qué modo de ventilador se usará?',
        description: 'Selecciona el modo de operación del ventilador.',
        fieldType: 'select',
        cascadeFieldId: 'test_fan_mode',
        dataPath: 'testData.testVerification.fanMode',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'speed', label: 'Velocidad fija' },
            { value: 'speed_follow', label: 'Seguimiento de velocidad' }
        ],
        section: 'verificacion'
    },
    {
        title: '¿Velocidad del ventilador?',
        description: 'Velocidad del ventilador en km/h (si aplica).',
        fieldType: 'text',
        cascadeFieldId: 'test_fan_speed',
        dataPath: 'testData.testVerification.fanSpeedKmh',
        placeholder: 'km/h',
        section: 'verificacion'
    },
    {
        title: '¿Flujo del ventilador?',
        description: 'Flujo del ventilador en m³/min (si aplica).',
        fieldType: 'text',
        cascadeFieldId: 'test_fan_flow',
        dataPath: 'testData.testVerification.fanFlowM3Min',
        placeholder: 'm³/min',
        section: 'verificacion'
    },
    {
        title: '¿La inercia está correcta?',
        description: 'Verifica que la inercia del dinamómetro es correcta.',
        fieldType: 'select',
        cascadeFieldId: 'test_inertia_ok',
        dataPath: 'testData.testVerification.inertiaOk',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'ok', label: 'OK — Correcto' },
            { value: 'not_ok', label: 'No OK — Requiere ajuste' }
        ],
        section: 'verificacion'
    },
    {
        title: '¿Estado de las cadenas?',
        description: 'Verifica la tensión de las cadenas de sujeción.',
        fieldType: 'select',
        cascadeFieldId: 'test_chains',
        dataPath: 'testData.testVerification.chains',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'tight', label: 'Tensas — Correcto' },
            { value: 'loose', label: 'Flojas — Requiere ajuste' }
        ],
        section: 'verificacion'
    },
    {
        title: '¿Estado de las eslingas?',
        description: 'Verifica que las eslingas de seguridad estén aseguradas.',
        fieldType: 'select',
        cascadeFieldId: 'test_slings',
        dataPath: 'testData.testVerification.slings',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'secured', label: 'Aseguradas' },
            { value: 'not_secured', label: 'No aseguradas' }
        ],
        section: 'verificacion'
    },
    {
        title: '¿Estado del cofre?',
        description: 'Confirma si el cofre del vehículo está cerrado o abierto.',
        fieldType: 'select',
        cascadeFieldId: 'test_hood',
        dataPath: 'testData.testVerification.hood',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'closed', label: 'Cerrado' },
            { value: 'open', label: 'Abierto' }
        ],
        section: 'verificacion'
    },
    {
        title: '¿Rodillos traseros asegurados?',
        description: 'Verifica que los rodillos traseros estén correctamente asegurados.',
        fieldType: 'select',
        cascadeFieldId: 'test_rear_rollers',
        dataPath: 'testData.testVerification.rearRollers',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'secured', label: 'Asegurados' },
            { value: 'not_secured', label: 'No asegurados' }
        ],
        section: 'verificacion'
    },
    {
        title: '¿Pantalla de protección asegurada?',
        description: 'Verifica que la pantalla de protección esté en su lugar.',
        fieldType: 'select',
        cascadeFieldId: 'test_screen',
        dataPath: 'testData.testVerification.screen',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'secured', label: 'Asegurada' },
            { value: 'not_secured', label: 'No asegurada' }
        ],
        section: 'verificacion'
    },
    {
        title: '¿Verificación MEX Wait Check?',
        description: 'Confirma el estado del MEX Wait Check (ventilador apagado / OK).',
        fieldType: 'select',
        cascadeFieldId: 'test_mex_waitcheck',
        dataPath: 'testData.testVerification.mexWaitCheck',
        options: [
            { value: '', label: '— Seleccionar —' },
            { value: 'fan_off', label: 'Ventilador apagado' },
            { value: 'ok', label: 'OK' }
        ],
        section: 'verificacion'
    },
    {
        title: '¿Notas de verificación en prueba?',
        description: 'Agrega observaciones sobre la verificación previa a la prueba.',
        fieldType: 'textarea',
        cascadeFieldId: 'test_verify_notes',
        dataPath: 'testData.testVerification.notes',
        placeholder: 'Observaciones de verificación...',
        section: 'verificacion'
    }
];

// ======================================================================
// [S02] STEP DEFINITIONS — SIMPLE (NON-EMISSIONS) PROCEDURE
// ======================================================================

var SOP_SIMPLE_STEPS = [
    {
        title: '¿Quién es el operador responsable?',
        description: 'Selecciona al operador que realizará la prueba.',
        fieldType: 'select',
        cascadeFieldId: 'simple_operator',
        dataPath: 'testData.simple.operator',
        options: '__operators__',
        section: 'simple',
        sectionLabel: 'Operación Simple',
        sectionIcon: '📋'
    },
    {
        title: '¿Fecha y hora de la prueba?',
        description: 'Registra cuándo se realiza la prueba.',
        fieldType: 'datetime',
        cascadeFieldId: 'simple_datetime',
        dataPath: 'testData.simple.datetime',
        section: 'simple'
    },
    {
        title: '¿Notas de la prueba?',
        description: 'Agrega cualquier observación relevante.',
        fieldType: 'textarea',
        cascadeFieldId: 'simple_notes',
        dataPath: 'testData.simple.notes',
        placeholder: 'Observaciones...',
        section: 'simple'
    }
];

// ======================================================================
// [S03] STEP DEFINITIONS — ALTA (READ-ONLY INFO)
// ======================================================================

var SOP_ALTA_STEPS = [
    {
        title: 'Propósito de la prueba',
        description: 'Tipo de prueba asignado al vehículo.',
        fieldType: 'readonly',
        dataPath: 'purpose',
        section: 'alta',
        sectionLabel: 'Información de Alta',
        sectionIcon: '🚗'
    },
    {
        title: 'VIN del vehículo',
        description: 'Número de Identificación Vehicular.',
        fieldType: 'readonly',
        dataPath: 'vin',
        section: 'alta'
    },
    {
        title: 'Configuración del vehículo',
        description: 'Código de configuración asignado.',
        fieldType: 'readonly',
        dataPath: 'configCode',
        section: 'alta'
    },
    {
        title: 'Registrado por',
        description: 'Operador que registró el vehículo.',
        fieldType: 'readonly',
        dataPath: 'registeredBy',
        section: 'alta'
    },
    {
        title: 'Fecha de registro',
        description: 'Fecha y hora del registro.',
        fieldType: 'readonly',
        dataPath: 'registeredAt',
        section: 'alta'
    }
];


// ======================================================================
// [S04] INDEXEDDB IMAGE ENGINE
// ======================================================================

function sopImageDBOpen(callback) {
    if (_sopImageDB) { if (callback) callback(_sopImageDB); return; }
    var request = window.indexedDB.open('sopImageDB', 1);
    request.onupgradeneeded = function(e) {
        var idb = e.target.result;
        if (!idb.objectStoreNames.contains('images')) {
            idb.createObjectStore('images', { keyPath: 'id' });
        }
    };
    request.onsuccess = function(e) {
        _sopImageDB = e.target.result;
        sopState.imageDBReady = true;
        if (callback) callback(_sopImageDB);
    };
    request.onerror = function(e) {
        console.warn('SOP: IndexedDB error', e);
        sopState.imageDBReady = false;
    };
}

function sopImageSave(stepKey, blob, callback) {
    sopImageDBOpen(function(idb) {
        // Create thumbnail
        var reader = new FileReader();
        reader.onload = function() {
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var maxThumb = 120;
                var w = img.width, h = img.height;
                if (w > h) { canvas.width = maxThumb; canvas.height = Math.round(h * maxThumb / w); }
                else { canvas.height = maxThumb; canvas.width = Math.round(w * maxThumb / h); }
                var ctx2d = canvas.getContext('2d');
                ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
                var thumbnail = canvas.toDataURL('image/jpeg', 0.6);

                var record = {
                    id: stepKey + '-' + Date.now(),
                    stepKey: stepKey,
                    blob: blob,
                    thumbnail: thumbnail,
                    createdAt: new Date().toISOString()
                };

                var tx = idb.transaction('images', 'readwrite');
                tx.objectStore('images').put(record);
                tx.oncomplete = function() {
                    if (callback) callback(record);
                };
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(blob);
    });
}

function sopImageGetAll(stepKeyPrefix, callback) {
    sopImageDBOpen(function(idb) {
        var tx = idb.transaction('images', 'readonly');
        var store = tx.objectStore('images');
        var results = [];
        var cursor = store.openCursor();
        cursor.onsuccess = function(e) {
            var c = e.target.result;
            if (c) {
                if (c.value.stepKey === stepKeyPrefix || c.value.stepKey.indexOf(stepKeyPrefix) === 0) {
                    results.push(c.value);
                }
                c.continue();
            } else {
                callback(results);
            }
        };
        cursor.onerror = function() { callback([]); };
    });
}

function sopImageDelete(imageId, callback) {
    sopImageDBOpen(function(idb) {
        var tx = idb.transaction('images', 'readwrite');
        tx.objectStore('images').delete(imageId);
        tx.oncomplete = function() { if (callback) callback(); };
    });
}

function sopCaptureImage(vehicleId, stepIdx) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var stepKey = 'step-' + vehicleId + '-' + stepIdx;
        sopImageSave(stepKey, file, function() {
            sopRender();
            if (typeof showToast === 'function') showToast('Imagen guardada', 'success');
        });
    };
    input.click();
}

function sopShowImageOverlay(imageId) {
    sopImageDBOpen(function(idb) {
        var tx = idb.transaction('images', 'readonly');
        var req = tx.objectStore('images').get(imageId);
        req.onsuccess = function(e) {
            var record = e.target.result;
            if (!record) return;
            var reader = new FileReader();
            reader.onload = function() {
                var overlay = document.createElement('div');
                overlay.className = 'sop-image-overlay';
                overlay.onclick = function(ev) { if (ev.target === overlay) overlay.remove(); };
                overlay.innerHTML = '<div class="sop-image-overlay-inner">' +
                    '<img src="' + reader.result + '" style="max-width:100%;max-height:80vh;border-radius:12px;">' +
                    '<div style="display:flex;gap:8px;margin-top:12px;">' +
                    '<button class="tp-btn tp-btn-ghost" onclick="this.closest(\'.sop-image-overlay\').remove()" style="flex:1;">Cerrar</button>' +
                    '<button class="tp-btn tp-btn-ghost" onclick="sopConfirmDeleteImage(\'' + imageId + '\')" style="flex:1;color:var(--tp-red);">Eliminar</button>' +
                    '</div></div>';
                document.body.appendChild(overlay);
            };
            reader.readAsDataURL(record.blob);
        };
    });
}

function sopConfirmDeleteImage(imageId) {
    if (typeof showCustomConfirm === 'function') {
        showCustomConfirm('Eliminar Imagen', '¿Eliminar esta imagen?', function() {
            var overlay = document.querySelector('.sop-image-overlay');
            if (overlay) overlay.remove();
            sopImageDelete(imageId, function() {
                sopRender();
                if (typeof showToast === 'function') showToast('Imagen eliminada', 'info');
            });
        }, 'danger');
    }
}

// ======================================================================
// [S05] DATA BRIDGE — SOP ↔ Cascade
// ======================================================================

function sopGetFieldValue(obj, path) {
    if (!obj || !path) return undefined;
    var parts = path.split('.');
    var current = obj;
    for (var i = 0; i < parts.length; i++) {
        if (current == null) return undefined;
        current = current[parts[i]];
    }
    return current;
}

function sopSetFieldValue(obj, path, value) {
    if (!obj || !path) return;
    var parts = path.split('.');
    var current = obj;
    for (var i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] == null) current[parts[i]] = {};
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
}

function sopSaveField(vehicleId, dataPath, value) {
    var vehicle = db.vehicles.find(function(v) { return v.id == vehicleId; });
    if (!vehicle) return;

    vehicle.testData = vehicle.testData || {};
    sopSetFieldValue(vehicle, dataPath, value);
    vehicle.lastModified = new Date().toISOString();
    saveDB();

    // Log to shift log
    if (typeof pnAddShiftEntry === 'function') {
        pnAddShiftEntry('SOP: Dato actualizado para VIN ' + (vehicle.vin || '?').substring(0, 8) + '...');
    }
}

function sopResolveOptions(step) {
    if (step.options === '__operators__') {
        var ops = (typeof CONFIG !== 'undefined' && CONFIG.operators) ? CONFIG.operators : [];
        var result = [{ value: '', label: '— Seleccionar —' }];
        ops.forEach(function(op) { result.push({ value: op, label: op }); });
        return result;
    }
    return step.options || [];
}

// ======================================================================
// [S06] PROCEDURE GENERATION
// ======================================================================

function sopGetProcedureForVehicle(vehicle) {
    if (!vehicle) return [];
    var isEm = typeof isEmissionsPurpose === 'function' && isEmissionsPurpose(vehicle.purpose);

    // Check if a custom template is active for this type
    var tmplId = isEm ? sopState.activeTemplateEmissions : sopState.activeTemplateSimple;
    if (tmplId && sopState.templates[tmplId]) {
        var tmpl = sopState.templates[tmplId];
        var altaSteps = SOP_ALTA_STEPS.slice();
        return altaSteps.concat(tmpl.steps);
    }

    var altaSteps = SOP_ALTA_STEPS.slice();
    var opSteps = isEm ? SOP_EMISSIONS_STEPS.slice() : SOP_SIMPLE_STEPS.slice();
    return altaSteps.concat(opSteps);
}

function sopGetSections(steps) {
    var sections = [];
    var seen = {};
    steps.forEach(function(step, idx) {
        if (!seen[step.section]) {
            seen[step.section] = true;
            sections.push({
                id: step.section,
                label: step.sectionLabel || step.section,
                icon: step.sectionIcon || '📋',
                startIdx: idx
            });
        }
    });
    return sections;
}

function sopGetSectionSteps(steps, sectionId) {
    return steps.filter(function(s) { return s.section === sectionId; });
}

function sopOnVehicleRegistered(vehicle) {
    if (!vehicle) return;
    sopUpdateBadge();
    // Auto-open SOP if user is on SOP tab
    if (typeof _currentPlatform !== 'undefined' && _currentPlatform === 'sop') {
        sopRender();
    }
}


// ======================================================================
// [S07] INITIALIZATION & STATE PERSISTENCE
// ======================================================================

function sopInit() {
    var stored = localStorage.getItem(SOP_STORAGE_KEY);
    if (stored) {
        try {
            var parsed = JSON.parse(stored);
            sopState.customizations = parsed.customizations || {};
            sopState.history = parsed.history || [];
            sopState.selectedVehicleId = parsed.selectedVehicleId || null;
            sopState.templates = parsed.templates || {};
            sopState.activeTemplateEmissions = parsed.activeTemplateEmissions || null;
            sopState.activeTemplateSimple = parsed.activeTemplateSimple || null;
        } catch(e) {
            console.warn('SOP: Error loading state', e);
        }
    }
    sopImageDBOpen();
    sopUpdateBadge();
}

function sopSave() {
    try {
        localStorage.setItem(SOP_STORAGE_KEY, JSON.stringify({
            customizations: sopState.customizations,
            history: sopState.history,
            selectedVehicleId: sopState.selectedVehicleId,
            templates: sopState.templates,
            activeTemplateEmissions: sopState.activeTemplateEmissions,
            activeTemplateSimple: sopState.activeTemplateSimple
        }));
    } catch(e) {
        console.warn('SOP: Error saving state', e);
    }
}

function sopUpdateBadge() {
    var badge = document.getElementById('sop-count-badge');
    if (!badge) return;
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var active = vehicles.filter(function(v) {
        return v.status !== 'archived' && v.status !== 'ready-release';
    });
    badge.textContent = active.length > 0 ? active.length + ' vehículos' : 'SOP';
}

// ======================================================================
// [S08] TAB SWITCHING & MAIN RENDER
// ======================================================================

function sopSwitchTab(tabId) {
    sopState.currentTab = tabId;
    var tabs = document.querySelectorAll('#sop-tabs-bar .tp-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    tabs.forEach(function(t) {
        if (t.getAttribute('onclick') && t.getAttribute('onclick').indexOf(tabId) > -1) {
            t.classList.add('active');
        }
    });
    sopRender();
}

function sopRender() {
    var container = document.getElementById('sop-content');
    if (!container) return;

    switch(sopState.currentTab) {
        case 'sop-guia': container.innerHTML = sopRenderGuide(); break;
        case 'sop-history': container.innerHTML = sopRenderHistory(); break;
        case 'sop-templates': container.innerHTML = sopRenderTemplates(); break;
        default: container.innerHTML = sopRenderGuide();
    }

    // Load images for visible steps asynchronously
    if (sopState.currentTab === 'sop-guia' && sopState.selectedVehicleId) {
        sopLoadVisibleImages();
        // Load reference images from active template
        var selVeh = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles.find(function(v) { return v.id == sopState.selectedVehicleId; }) : null;
        if (selVeh) sopLoadRefImagesForGuide(selVeh);
    }
    // Load template reference images in editor
    if (sopState.currentTab === 'sop-templates' && sopState.tmplEditId) {
        sopTmplLoadRefImages();
    }
}

// ======================================================================
// [S09] VEHICLE SELECTOR
// ======================================================================

function sopRenderVehicleSelector() {
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var nonArchived = vehicles.filter(function(v) { return v.status !== 'archived'; });

    var html = '<div class="sop-vehicle-selector">';
    html += '<label style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;display:block;">Seleccionar Vehículo</label>';
    html += '<select id="sop-vehicle-select" class="sop-data-input" onchange="sopSelectVehicle(this.value)" style="cursor:pointer;">';
    html += '<option value="">— Seleccionar vehículo —</option>';

    nonArchived.forEach(function(v) {
        var label = (v.vin || 'Sin VIN') + ' — ' + (v.purpose || '') + ' [' + (typeof CONFIG !== 'undefined' && CONFIG.statusLabels ? (CONFIG.statusLabels[v.status] || v.status) : v.status) + ']';
        var sel = (sopState.selectedVehicleId && sopState.selectedVehicleId == v.id) ? ' selected' : '';
        html += '<option value="' + v.id + '"' + sel + '>' + escapeHtml(label) + '</option>';
    });

    html += '</select>';
    html += '</div>';
    return html;
}

function sopSelectVehicle(id) {
    sopState.selectedVehicleId = id ? parseInt(id) || id : null;
    sopState.expandedSections = {};
    sopState.expandedStep = null;
    sopSave();
    sopRender();
}

// ======================================================================
// [S10] MAIN GUIDE RENDERER
// ======================================================================

function sopRenderGuide() {
    var html = '';

    // Vehicle selector
    html += sopRenderVehicleSelector();

    if (!sopState.selectedVehicleId) {
        html += '<div class="tp-card" style="text-align:center;padding:40px 20px;">';
        html += '<div style="font-size:36px;margin-bottom:10px;">📋</div>';
        html += '<div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px;">Selecciona un vehículo</div>';
        html += '<div style="font-size:12px;color:#64748b;">Elige un vehículo del selector para ver su procedimiento guiado paso a paso.</div>';
        html += '</div>';
        return html;
    }

    var vehicle = db.vehicles.find(function(v) { return v.id == sopState.selectedVehicleId; });
    if (!vehicle) {
        html += '<div class="tp-card" style="text-align:center;padding:20px;color:#ef4444;">Vehículo no encontrado.</div>';
        return html;
    }

    // Vehicle info banner
    html += sopRenderVehicleBanner(vehicle);

    // Overall progress
    var steps = sopGetProcedureForVehicle(vehicle);
    var progress = sopCalcProgress(vehicle, steps);
    html += '<div class="sop-progress">';
    html += '<div class="sop-progress-bar"><div class="sop-progress-fill" style="width:' + progress + '%;"></div></div>';
    html += '<div class="sop-progress-text">' + progress + '% completado</div>';
    html += '</div>';

    // Edit mode toggle
    html += '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">';
    html += '<button class="tp-btn tp-btn-ghost sop-edit-toggle' + (sopState.editMode ? ' active' : '') + '" onclick="sopToggleEditMode()" style="font-size:10px;padding:4px 12px;min-height:28px;">';
    html += sopState.editMode ? '✓ Modo Edición' : '✎ Editar Pasos';
    html += '</button>';

    // Go to Cascade button
    html += '<button class="tp-btn tp-btn-ghost" onclick="sopGoToCascade(' + vehicle.id + ')" style="font-size:10px;padding:4px 12px;min-height:28px;margin-left:6px;">↗ Ir a Cascade</button>';
    html += '</div>';

    // Render sections
    var sections = sopGetSections(steps);
    sections.forEach(function(section) {
        var sectionSteps = sopGetSectionSteps(steps, section.id);
        var sectionProgress = sopCalcSectionProgress(vehicle, sectionSteps);
        var isExpanded = sopState.expandedSections[section.id] !== false; // default expanded

        html += '<div class="tp-card" style="margin-bottom:10px;overflow:hidden;">';

        // Section header
        html += '<div class="sop-section-header" onclick="sopToggleSection(\'' + section.id + '\')" style="cursor:pointer;">';
        html += '<div style="display:flex;align-items:center;gap:8px;flex:1;">';
        html += '<span style="font-size:16px;">' + section.icon + '</span>';
        html += '<div style="flex:1;">';
        html += '<div style="font-size:13px;font-weight:700;color:#0f172a;">' + section.label + '</div>';
        html += '<div class="sop-section-progress-mini">';
        html += '<div class="sop-section-progress-bar"><div class="sop-section-progress-fill" style="width:' + sectionProgress + '%;"></div></div>';
        html += '<span style="font-size:10px;color:#64748b;">' + sectionProgress + '%</span>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '<span style="font-size:14px;color:#94a3b8;transition:transform 0.2s;' + (isExpanded ? 'transform:rotate(180deg);' : '') + '">▼</span>';
        html += '</div>';

        // Section steps
        if (isExpanded) {
            html += '<div class="sop-section-body">';
            sectionSteps.forEach(function(step) {
                var globalIdx = steps.indexOf(step);
                html += sopRenderStep(step, globalIdx, vehicle);
            });
            html += '</div>';
        }

        html += '</div>';
    });

    // Completion check
    if (progress === 100) {
        html += '<div class="sop-summary">';
        html += '<div class="sop-summary-icon">🎉</div>';
        html += '<div class="sop-summary-title">Procedimiento Completado</div>';
        html += '<div class="sop-summary-detail">Todos los campos han sido llenados exitosamente.</div>';
        html += '<button class="tp-btn tp-btn-primary" style="margin-top:12px;background:var(--tp-green);" onclick="sopCompleteVehicle(' + vehicle.id + ')">Guardar en Historial</button>';
        html += '</div>';
    }

    return html;
}

function sopRenderVehicleBanner(vehicle) {
    var isEm = typeof isEmissionsPurpose === 'function' && isEmissionsPurpose(vehicle.purpose);
    var statusLabel = (typeof CONFIG !== 'undefined' && CONFIG.statusLabels) ? (CONFIG.statusLabels[vehicle.status] || vehicle.status) : vehicle.status;

    var html = '<div class="sop-vehicle-banner">';
    html += '<div style="display:flex;align-items:center;gap:10px;">';
    html += '<div style="font-size:24px;">🚗</div>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:13px;font-weight:700;color:#0f172a;">' + escapeHtml(vehicle.vin || 'Sin VIN') + '</div>';
    html += '<div style="font-size:11px;color:#64748b;">';
    html += escapeHtml(vehicle.purpose || '') + ' | ' + escapeHtml(vehicle.configCode || 'Manual');
    html += ' | <span class="status-badge status-' + vehicle.status + '">' + escapeHtml(statusLabel) + '</span>';
    html += '</div>';
    html += '<div style="font-size:10px;color:#94a3b8;margin-top:2px;">';
    html += 'Tipo: ' + (isEm ? 'Emisiones (procedimiento completo)' : 'No-emisiones (procedimiento simple)');
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    return html;
}

function sopToggleSection(sectionId) {
    if (sopState.expandedSections[sectionId] === undefined) {
        sopState.expandedSections[sectionId] = false;
    } else {
        sopState.expandedSections[sectionId] = !sopState.expandedSections[sectionId];
    }
    sopRender();
}


// ======================================================================
// [S11] STEP RENDERER
// ======================================================================

function sopRenderStep(step, stepIdx, vehicle) {
    var value = sopGetFieldValue(vehicle, step.dataPath);
    var hasValue = (value !== undefined && value !== null && value !== '');
    var isActive = sopState.expandedStep === stepIdx;

    // Apply customizations
    var customStep = sopGetCustomStep(vehicle.id, stepIdx, step);

    var stepClass = 'sop-step';
    if (hasValue) stepClass += ' sop-step-completed';
    else if (isActive) stepClass += ' sop-step-active';

    var html = '<div class="' + stepClass + '" id="sop-step-' + stepIdx + '">';

    // Step number
    html += '<div class="sop-step-number" onclick="sopExpandStep(' + stepIdx + ')" style="cursor:pointer;">';
    if (hasValue && step.fieldType !== 'action') html += '✓';
    else html += (stepIdx + 1);
    html += '</div>';

    // Step content
    html += '<div class="sop-step-content">';
    html += '<div class="sop-step-title" onclick="sopExpandStep(' + stepIdx + ')" style="cursor:pointer;">' + escapeHtml(customStep.title) + '</div>';
    html += '<div class="sop-step-desc">' + escapeHtml(customStep.description) + '</div>';

    // Reference images from template (visual guide)
    html += '<div id="sop-ref-imgs-' + stepIdx + '" class="sop-image-gallery" style="margin-top:4px;"></div>';

    // Field input (always visible, not locked)
    html += sopRenderField(step, stepIdx, value, vehicle);

    // Checklist sub-items (customizable)
    if (customStep.checklistItems && customStep.checklistItems.length > 0) {
        html += sopRenderChecklist(customStep.checklistItems, vehicle.id, stepIdx);
    }

    // Image gallery
    html += '<div id="sop-images-' + stepIdx + '" class="sop-image-gallery"></div>';
    html += '<button class="tp-btn tp-btn-ghost sop-camera-btn" onclick="sopCaptureImage(' + vehicle.id + ',' + stepIdx + ')" style="font-size:10px;padding:4px 10px;min-height:26px;margin-top:6px;">📷 Foto</button>';

    // Edit mode controls
    if (sopState.editMode) {
        html += '<div class="sop-edit-controls" style="margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;">';
        html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopEditStepTitle(' + stepIdx + ')" style="font-size:9px;padding:2px 8px;min-height:24px;">✎ Título</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopEditStepDesc(' + stepIdx + ')" style="font-size:9px;padding:2px 8px;min-height:24px;">✎ Desc</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopAddChecklistItem(' + stepIdx + ')" style="font-size:9px;padding:2px 8px;min-height:24px;">+ Item</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopReorderStep(' + stepIdx + ',-1)" style="font-size:9px;padding:2px 8px;min-height:24px;">↑</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopReorderStep(' + stepIdx + ',1)" style="font-size:9px;padding:2px 8px;min-height:24px;">↓</button>';
        html += '</div>';
        html += '</div>';
    }

    html += '</div>'; // step-content
    html += '</div>'; // step

    return html;
}

function sopRenderField(step, stepIdx, value, vehicle) {
    var html = '<div class="sop-field-group">';

    switch (step.fieldType) {
        case 'readonly':
            var displayVal = value;
            if (step.dataPath === 'registeredAt' && value) {
                displayVal = new Date(value).toLocaleString('es-MX');
            }
            html += '<div class="sop-field-readonly">' + escapeHtml(displayVal || '—') + '</div>';
            break;

        case 'select':
            var opts = sopResolveOptions(step);
            html += '<select class="sop-data-input" onchange="sopOnFieldChange(' + vehicle.id + ',' + stepIdx + ',this.value)" style="cursor:pointer;">';
            opts.forEach(function(opt) {
                var sel = (String(value) === String(opt.value)) ? ' selected' : '';
                html += '<option value="' + escapeHtml(opt.value) + '"' + sel + '>' + escapeHtml(opt.label) + '</option>';
            });
            html += '</select>';
            break;

        case 'number':
            html += '<div style="display:flex;align-items:center;gap:6px;">';
            html += '<input type="number" class="sop-data-input" value="' + (value != null ? value : '') + '"';
            html += ' placeholder="' + escapeHtml(step.placeholder || '') + '"';
            if (step.step) html += ' step="' + step.step + '"';
            html += ' onchange="sopOnFieldChange(' + vehicle.id + ',' + stepIdx + ',this.value)"';
            html += ' style="flex:1;">';
            if (step.unit) {
                html += '<span style="font-size:11px;color:#64748b;font-weight:700;white-space:nowrap;">' + escapeHtml(step.unit) + '</span>';
            }
            html += '</div>';
            break;

        case 'text':
            html += '<input type="text" class="sop-data-input" value="' + escapeHtml(value || '') + '"';
            html += ' placeholder="' + escapeHtml(step.placeholder || '') + '"';
            html += ' onchange="sopOnFieldChange(' + vehicle.id + ',' + stepIdx + ',this.value)">';
            break;

        case 'textarea':
            html += '<textarea class="sop-data-input" rows="2" placeholder="' + escapeHtml(step.placeholder || '') + '"';
            html += ' onchange="sopOnFieldChange(' + vehicle.id + ',' + stepIdx + ',this.value)"';
            html += ' style="min-height:50px;resize:vertical;">' + escapeHtml(value || '') + '</textarea>';
            break;

        case 'datetime':
            html += '<input type="datetime-local" class="sop-data-input" value="' + escapeHtml(value || '') + '"';
            html += ' onchange="sopOnFieldChange(' + vehicle.id + ',' + stepIdx + ',this.value)">';
            break;

        case 'action':
            html += '<button class="tp-btn tp-btn-primary sop-action-btn" onclick="sopOnActionStep(\'' + escapeHtml(step.actionFn) + '\')" style="background:var(--accent-sop);font-size:12px;">';
            html += escapeHtml(step.actionLabel || 'Ejecutar');
            html += '</button>';
            break;
    }

    html += '</div>';
    return html;
}

function sopRenderChecklist(items, vehicleId, stepIdx) {
    var checkState = sopGetChecklistState(vehicleId, stepIdx);
    var html = '<div class="sop-checklist" style="margin-top:8px;">';
    items.forEach(function(item, itemIdx) {
        var isChecked = checkState[itemIdx] === true;
        html += '<div class="sop-check-item' + (isChecked ? ' checked' : '') + '" onclick="sopToggleChecklistItem(' + vehicleId + ',' + stepIdx + ',' + itemIdx + ')">';
        html += '<div class="sop-check-box">' + (isChecked ? '✓' : '') + '</div>';
        html += '<span style="flex:1;">' + escapeHtml(item) + '</span>';
        if (sopState.editMode) {
            html += '<button class="tp-btn tp-btn-ghost" onclick="event.stopPropagation();sopRemoveChecklistItem(' + stepIdx + ',' + itemIdx + ')" style="font-size:9px;padding:2px 6px;min-height:20px;color:var(--tp-red);">✕</button>';
        }
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function sopExpandStep(stepIdx) {
    sopState.expandedStep = (sopState.expandedStep === stepIdx) ? null : stepIdx;
    // Don't re-render, just visual toggle for now
}

// ======================================================================
// [S12] FIELD CHANGE HANDLERS
// ======================================================================

function sopOnFieldChange(vehicleId, stepIdx, rawValue) {
    var steps = sopGetProcedureForVehicle(db.vehicles.find(function(v) { return v.id == vehicleId; }));
    var step = steps[stepIdx];
    if (!step || !step.dataPath) return;

    var value = rawValue;

    // Type conversions
    if (step.fieldType === 'number' && rawValue !== '') {
        value = parseFloat(rawValue);
        if (isNaN(value)) value = null;
    } else if (step.fieldType === 'select' && step.dataPath.indexOf('fuelLevelFraction') > -1 && rawValue !== '') {
        value = parseFloat(rawValue);
    }

    sopSaveField(vehicleId, step.dataPath, value);
    sopRender();
}

function sopOnActionStep(actionFnName) {
    if (typeof window[actionFnName] === 'function') {
        window[actionFnName]();
        if (typeof showToast === 'function') showToast('Acción ejecutada: ' + actionFnName, 'success');
    } else {
        if (typeof showToast === 'function') showToast('Función no disponible: ' + actionFnName, 'error');
    }
}

// ======================================================================
// [S13] CHECKLIST STATE
// ======================================================================

function sopGetChecklistState(vehicleId, stepIdx) {
    var key = vehicleId + '-' + stepIdx;
    if (!sopState.customizations[key]) sopState.customizations[key] = {};
    return sopState.customizations[key].checkState || {};
}

function sopToggleChecklistItem(vehicleId, stepIdx, itemIdx) {
    var key = vehicleId + '-' + stepIdx;
    if (!sopState.customizations[key]) sopState.customizations[key] = {};
    if (!sopState.customizations[key].checkState) sopState.customizations[key].checkState = {};
    sopState.customizations[key].checkState[itemIdx] = !sopState.customizations[key].checkState[itemIdx];
    sopSave();
    sopRender();
}

// ======================================================================
// [S14] STEP EDITING
// ======================================================================

function sopToggleEditMode() {
    sopState.editMode = !sopState.editMode;
    sopRender();
}

function sopGetCustomStep(vehicleId, stepIdx, originalStep) {
    var key = vehicleId + '-' + stepIdx;
    var custom = sopState.customizations[key] || {};
    return {
        title: custom.title || originalStep.title,
        description: custom.description || originalStep.description,
        checklistItems: custom.checklistItems || originalStep.checklistItems || []
    };
}

function sopEditStepTitle(stepIdx) {
    var vehicle = db.vehicles.find(function(v) { return v.id == sopState.selectedVehicleId; });
    if (!vehicle) return;
    var steps = sopGetProcedureForVehicle(vehicle);
    var step = steps[stepIdx];
    if (!step) return;

    var key = sopState.selectedVehicleId + '-' + stepIdx;
    var custom = sopState.customizations[key] || {};
    var currentTitle = custom.title || step.title;
    var newTitle = prompt('Nuevo título del paso:', currentTitle);
    if (newTitle && newTitle.trim()) {
        if (!sopState.customizations[key]) sopState.customizations[key] = {};
        sopState.customizations[key].title = newTitle.trim();
        sopSave();
        sopRender();
    }
}

function sopEditStepDesc(stepIdx) {
    var vehicle = db.vehicles.find(function(v) { return v.id == sopState.selectedVehicleId; });
    if (!vehicle) return;
    var steps = sopGetProcedureForVehicle(vehicle);
    var step = steps[stepIdx];
    if (!step) return;

    var key = sopState.selectedVehicleId + '-' + stepIdx;
    var custom = sopState.customizations[key] || {};
    var currentDesc = custom.description || step.description;
    var newDesc = prompt('Nueva descripción:', currentDesc);
    if (newDesc && newDesc.trim()) {
        if (!sopState.customizations[key]) sopState.customizations[key] = {};
        sopState.customizations[key].description = newDesc.trim();
        sopSave();
        sopRender();
    }
}

function sopAddChecklistItem(stepIdx) {
    var key = sopState.selectedVehicleId + '-' + stepIdx;
    var newItem = prompt('Nuevo item del checklist:');
    if (newItem && newItem.trim()) {
        if (!sopState.customizations[key]) sopState.customizations[key] = {};
        if (!sopState.customizations[key].checklistItems) sopState.customizations[key].checklistItems = [];
        sopState.customizations[key].checklistItems.push(newItem.trim());
        sopSave();
        sopRender();
    }
}

function sopRemoveChecklistItem(stepIdx, itemIdx) {
    var key = sopState.selectedVehicleId + '-' + stepIdx;
    if (!sopState.customizations[key] || !sopState.customizations[key].checklistItems) return;
    sopState.customizations[key].checklistItems.splice(itemIdx, 1);
    sopSave();
    sopRender();
}

function sopReorderStep(stepIdx, direction) {
    // Reordering modifies the display order via customization
    // Store custom order in sopState.customizations for the vehicle
    var vehId = sopState.selectedVehicleId;
    if (!vehId) return;
    var orderKey = 'order-' + vehId;
    if (!sopState.customizations[orderKey]) {
        // Initialize with natural order
        var vehicle = db.vehicles.find(function(v) { return v.id == vehId; });
        var steps = sopGetProcedureForVehicle(vehicle);
        var arr = [];
        for (var i = 0; i < steps.length; i++) arr.push(i);
        sopState.customizations[orderKey] = arr;
    }
    var order = sopState.customizations[orderKey];
    var currentPos = order.indexOf(stepIdx);
    var targetPos = currentPos + direction;
    if (targetPos < 0 || targetPos >= order.length) return;

    // Swap
    var tmp = order[currentPos];
    order[currentPos] = order[targetPos];
    order[targetPos] = tmp;
    sopSave();
    sopRender();
}


// ======================================================================
// [S15] PROGRESS TRACKING
// ======================================================================

function sopCalcProgress(vehicle, steps) {
    if (!steps || steps.length === 0) return 0;
    var total = 0;
    var filled = 0;
    steps.forEach(function(step) {
        if (step.fieldType === 'action' || step.fieldType === 'readonly') return;
        total++;
        var val = sopGetFieldValue(vehicle, step.dataPath);
        if (val !== undefined && val !== null && val !== '') filled++;
    });
    return total > 0 ? Math.round((filled / total) * 100) : 100;
}

function sopCalcSectionProgress(vehicle, sectionSteps) {
    return sopCalcProgress(vehicle, sectionSteps);
}

function sopIsStepComplete(step, vehicle) {
    if (step.fieldType === 'action' || step.fieldType === 'readonly') return true;
    var val = sopGetFieldValue(vehicle, step.dataPath);
    return (val !== undefined && val !== null && val !== '');
}

// ======================================================================
// [S16] IMAGE LOADING (ASYNC)
// ======================================================================

function sopLoadVisibleImages() {
    var vehicleId = sopState.selectedVehicleId;
    if (!vehicleId) return;

    var vehicle = db.vehicles.find(function(v) { return v.id == vehicleId; });
    if (!vehicle) return;

    var steps = sopGetProcedureForVehicle(vehicle);
    steps.forEach(function(step, stepIdx) {
        var stepKey = 'step-' + vehicleId + '-' + stepIdx;
        var container = document.getElementById('sop-images-' + stepIdx);
        if (!container) return;

        sopImageGetAll(stepKey, function(images) {
            if (images.length === 0) {
                container.innerHTML = '';
                return;
            }
            var html = '';
            images.forEach(function(img) {
                html += '<div class="sop-image-thumb" onclick="sopShowImageOverlay(\'' + img.id + '\')">';
                html += '<img src="' + img.thumbnail + '" alt="Foto">';
                html += '</div>';
            });
            container.innerHTML = html;
        });
    });
}

// ======================================================================
// [S17] HISTORY & EXPORT
// ======================================================================

function sopRenderHistory() {
    if (sopState.history.length === 0) {
        return '<div class="tp-card" style="text-align:center;padding:40px 20px;">' +
               '<div style="font-size:36px;margin-bottom:10px;">📜</div>' +
               '<div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px;">Sin historial</div>' +
               '<div style="font-size:12px;color:#64748b;">Aquí aparecerá el registro de procedimientos completados.</div>' +
               '</div>';
    }

    var html = '<div class="tp-card">';
    html += '<div class="tp-card-title">Procedimientos Completados <span class="tp-badge" style="background:#f0fdf4;color:#16a34a;">' + sopState.history.length + '</span></div>';

    var sorted = sopState.history.slice().sort(function(a, b) {
        return new Date(b.completedAt) - new Date(a.completedAt);
    });

    sorted.forEach(function(record) {
        html += '<div class="sop-history-item">';
        html += '<div class="sop-history-status" style="background:var(--tp-green);"></div>';
        html += '<div class="sop-history-info">';
        html += '<div class="sop-history-name">🚗 ' + escapeHtml(record.vin || '?') + '</div>';
        html += '<div class="sop-history-meta">' + escapeHtml(record.purpose || '') + ' | ' + escapeHtml(record.configCode || '') +
                (record.operator ? ' | ' + escapeHtml(record.operator) : '') + '</div>';
        html += '</div>';
        html += '<div class="sop-history-date">' + new Date(record.completedAt).toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) + '</div>';
        html += '</div>';
    });

    html += '</div>';

    if (sopState.history.length > 0) {
        html += '<div style="display:flex;gap:6px;justify-content:center;margin-top:10px;">';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopExportHistory()" style="font-size:11px;">Exportar</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopClearHistory()" style="font-size:11px;color:var(--tp-red);">Limpiar</button>';
        html += '</div>';
    }

    return html;
}

function sopCompleteVehicle(vehicleId) {
    var vehicle = db.vehicles.find(function(v) { return v.id == vehicleId; });
    if (!vehicle) return;

    var record = {
        vehicleId: vehicleId,
        vin: vehicle.vin,
        purpose: vehicle.purpose,
        configCode: vehicle.configCode,
        operator: typeof getCurrentOperator === 'function' ? getCurrentOperator() : '',
        completedAt: new Date().toISOString()
    };

    sopState.history.push(record);
    sopSave();

    if (typeof showToast === 'function') showToast('Procedimiento completado para ' + (vehicle.vin || 'vehículo'), 'success');
    if (typeof pnAddShiftEntry === 'function') pnAddShiftEntry('SOP Completado: ' + (vehicle.vin || '?'));

    sopRender();
}

function sopExportHistory() {
    if (sopState.history.length === 0) {
        if (typeof showToast === 'function') showToast('No hay historial para exportar', 'info');
        return;
    }

    var text = 'HISTORIAL DE PROCEDIMIENTOS SOP\n';
    text += 'Exportado: ' + new Date().toLocaleString('es-MX') + '\n';
    text += '═══════════════════════════════════════\n\n';

    sopState.history.forEach(function(record, idx) {
        text += (idx + 1) + '. VIN: ' + (record.vin || '?') + '\n';
        text += '   Propósito: ' + (record.purpose || '') + '\n';
        text += '   Config: ' + (record.configCode || '') + '\n';
        text += '   Completado: ' + new Date(record.completedAt).toLocaleString('es-MX') + '\n';
        if (record.operator) text += '   Operador: ' + record.operator + '\n';
        text += '\n';
    });

    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'sop-historial-' + new Date().toISOString().split('T')[0] + '.txt';
    a.click();
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast('Historial exportado', 'success');
}

function sopClearHistory() {
    if (typeof showCustomConfirm === 'function') {
        showCustomConfirm('Limpiar Historial', '¿Eliminar todo el historial de procedimientos completados?', function() {
            sopState.history = [];
            sopSave();
            sopRender();
            if (typeof showToast === 'function') showToast('Historial limpiado', 'info');
        }, 'danger');
    }
}

// ======================================================================
// [S18] TEMPLATES VIEW — Admin Procedure Editor
// ======================================================================

function sopRenderTemplates() {
    // If editing a template, show the editor
    if (sopState.tmplEditId) {
        return sopRenderTemplateEditor(sopState.tmplEditId);
    }

    var html = '<div class="tp-card">';
    html += '<div class="tp-card-title" style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<span>Plantillas de Procedimiento</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="sopCreateTemplate()" style="font-size:11px;padding:6px 14px;min-height:30px;">+ Nueva Plantilla</button>';
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--muted,#64748b);margin-bottom:14px;">Crea y edita plantillas de procedimiento con ayuda visual. Los técnicos seguirán la plantilla activa al guiar vehículos.</div>';

    // Default Emissions template card
    var isActiveEm = !sopState.activeTemplateEmissions;
    html += sopRenderTemplateCard({
        name: 'Procedimiento de Emisiones (Predefinido)',
        icon: '🔬',
        desc: 'COP-Emisiones, EO-Emisiones, ND-Emisiones',
        stepCount: SOP_ALTA_STEPS.length + SOP_EMISSIONS_STEPS.length,
        sectionCount: sopGetSections(SOP_ALTA_STEPS.concat(SOP_EMISSIONS_STEPS)).length,
        isDefault: true,
        isActive: isActiveEm,
        baseType: 'emissions'
    });

    // Default Simple template card
    var isActiveSi = !sopState.activeTemplateSimple;
    html += sopRenderTemplateCard({
        name: 'Procedimiento Simple (Predefinido)',
        icon: '📋',
        desc: 'OBD2, Nuevos Desarrollos, no-emisiones',
        stepCount: SOP_ALTA_STEPS.length + SOP_SIMPLE_STEPS.length,
        sectionCount: sopGetSections(SOP_ALTA_STEPS.concat(SOP_SIMPLE_STEPS)).length,
        isDefault: true,
        isActive: isActiveSi,
        baseType: 'simple'
    });

    // Custom templates
    var tmplKeys = Object.keys(sopState.templates);
    if (tmplKeys.length > 0) {
        html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border,#e2e8f0);">';
        html += '<div style="font-size:12px;font-weight:700;color:var(--text,#0f172a);margin-bottom:10px;">Plantillas Personalizadas</div>';
        tmplKeys.forEach(function(tid) {
            var t = sopState.templates[tid];
            var sections = sopGetSections(t.steps || []);
            var isActive = (t.baseType === 'emissions' && sopState.activeTemplateEmissions === tid) ||
                           (t.baseType === 'simple' && sopState.activeTemplateSimple === tid);
            html += sopRenderTemplateCard({
                id: tid,
                name: t.name,
                icon: t.baseType === 'emissions' ? '🔬' : '📋',
                desc: (t.baseType === 'emissions' ? 'Emisiones' : 'Simple') + ' | Creado: ' + new Date(t.createdAt).toLocaleDateString('es-MX'),
                stepCount: (t.steps || []).length,
                sectionCount: sections.length,
                isDefault: false,
                isActive: isActive,
                baseType: t.baseType,
                createdBy: t.createdBy
            });
        });
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function sopRenderTemplateCard(opts) {
    var html = '<div class="sop-procedure-card sop-tmpl-card' + (opts.isActive ? ' sop-tmpl-active' : '') + '">';
    html += '<div style="display:flex;align-items:center;gap:12px;">';
    html += '<div style="font-size:24px;">' + opts.icon + '</div>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--text,#0f172a);">' + escapeHtml(opts.name) + '</div>';
    html += '<div style="font-size:11px;color:var(--muted,#64748b);">' + escapeHtml(opts.desc) + '</div>';
    html += '<div style="font-size:10px;color:#94a3b8;margin-top:4px;">' + opts.stepCount + ' pasos | ' + opts.sectionCount + ' secciones';
    if (opts.createdBy) html += ' | Por: ' + escapeHtml(opts.createdBy);
    html += '</div>';
    html += '</div>';
    html += '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">';
    if (opts.isActive) {
        html += '<span style="font-size:9px;padding:2px 8px;background:rgba(16,185,129,0.15);color:#10b981;border-radius:6px;font-weight:700;">Activa</span>';
    }
    if (opts.isDefault) {
        html += '<span style="font-size:9px;padding:2px 8px;background:var(--surface,#f1f5f9);color:var(--muted,#64748b);border-radius:6px;font-weight:700;">Predefinido</span>';
    }
    html += '</div>';
    html += '</div>';

    // Action buttons
    html += '<div style="display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border,#e2e8f0);flex-wrap:wrap;">';
    if (!opts.isDefault && opts.id) {
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopEditTemplate(\'' + opts.id + '\')" style="font-size:10px;padding:4px 10px;min-height:26px;">Editar</button>';
        if (!opts.isActive) {
            html += '<button class="tp-btn tp-btn-ghost" onclick="sopActivateTemplate(\'' + opts.id + '\',\'' + opts.baseType + '\')" style="font-size:10px;padding:4px 10px;min-height:26px;color:var(--success,#10b981);">Activar</button>';
        }
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopDuplicateTemplate(\'' + opts.id + '\')" style="font-size:10px;padding:4px 10px;min-height:26px;">Duplicar</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopDeleteTemplate(\'' + opts.id + '\')" style="font-size:10px;padding:4px 10px;min-height:26px;color:var(--danger,#ef4444);">Eliminar</button>';
    } else {
        // Default templates: clone only
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopCloneDefaultTemplate(\'' + opts.baseType + '\')" style="font-size:10px;padding:4px 10px;min-height:26px;">Clonar como nueva</button>';
        if (!opts.isActive) {
            html += '<button class="tp-btn tp-btn-ghost" onclick="sopActivateTemplate(null,\'' + opts.baseType + '\')" style="font-size:10px;padding:4px 10px;min-height:26px;color:var(--success,#10b981);">Activar</button>';
        }
    }
    html += '</div>';
    html += '</div>';
    return html;
}

// ── Template CRUD ──

function sopGenerateId() {
    return 'tmpl-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

function sopCreateTemplate() {
    if (typeof showCustomConfirm !== 'function') return;
    var name = prompt('Nombre de la nueva plantilla:', 'Mi Procedimiento');
    if (!name) return;

    // Ask base type
    var baseType = 'emissions';
    var choice = prompt('Tipo base:\n1 = Emisiones\n2 = Simple', '1');
    if (choice === '2') baseType = 'simple';

    var id = sopGenerateId();
    sopState.templates[id] = {
        id: id,
        name: name,
        baseType: baseType,
        steps: [],
        createdBy: (typeof authState !== 'undefined' && authState.currentUser) ? authState.currentUser.name : 'Admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    sopState.tmplEditId = id;
    sopSave();
    sopRender();
    if (typeof showToast === 'function') showToast('Plantilla creada — agrega pasos', 'success');
}

function sopCloneDefaultTemplate(baseType) {
    var name = prompt('Nombre para la copia:', 'Copia ' + (baseType === 'emissions' ? 'Emisiones' : 'Simple'));
    if (!name) return;

    var srcSteps = baseType === 'emissions' ? SOP_EMISSIONS_STEPS : SOP_SIMPLE_STEPS;
    var id = sopGenerateId();
    sopState.templates[id] = {
        id: id,
        name: name,
        baseType: baseType,
        steps: JSON.parse(JSON.stringify(srcSteps)),
        createdBy: (typeof authState !== 'undefined' && authState.currentUser) ? authState.currentUser.name : 'Admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    sopState.tmplEditId = id;
    sopSave();
    sopRender();
    if (typeof showToast === 'function') showToast('Plantilla clonada — ahora puedes editarla', 'success');
}

function sopDuplicateTemplate(tid) {
    var src = sopState.templates[tid];
    if (!src) return;
    var id = sopGenerateId();
    sopState.templates[id] = {
        id: id,
        name: src.name + ' (copia)',
        baseType: src.baseType,
        steps: JSON.parse(JSON.stringify(src.steps)),
        createdBy: (typeof authState !== 'undefined' && authState.currentUser) ? authState.currentUser.name : 'Admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    sopSave();
    sopRender();
    if (typeof showToast === 'function') showToast('Plantilla duplicada', 'success');
}

function sopDeleteTemplate(tid) {
    if (typeof showCustomConfirm === 'function') {
        showCustomConfirm('Eliminar Plantilla', '¿Eliminar esta plantilla permanentemente?', function() {
            // Deactivate if active
            if (sopState.activeTemplateEmissions === tid) sopState.activeTemplateEmissions = null;
            if (sopState.activeTemplateSimple === tid) sopState.activeTemplateSimple = null;
            delete sopState.templates[tid];
            sopSave();
            sopRender();
            if (typeof showToast === 'function') showToast('Plantilla eliminada', 'info');
        }, 'danger');
    }
}

function sopActivateTemplate(tid, baseType) {
    if (baseType === 'emissions') {
        sopState.activeTemplateEmissions = tid;
    } else {
        sopState.activeTemplateSimple = tid;
    }
    sopSave();
    sopRender();
    if (typeof showToast === 'function') showToast(tid ? 'Plantilla activada' : 'Plantilla predefinida restaurada', 'success');
}

function sopEditTemplate(tid) {
    sopState.tmplEditId = tid;
    sopState.tmplEditStep = null;
    sopState.tmplExpandedSections = {};
    sopRender();
}

// ── Template Editor ──

function sopRenderTemplateEditor(tid) {
    var tmpl = sopState.templates[tid];
    if (!tmpl) { sopState.tmplEditId = null; return sopRenderTemplates(); }

    var html = '<div class="tp-card">';

    // Editor header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;">';
    html += '<button class="tp-btn tp-btn-ghost" onclick="sopState.tmplEditId=null;sopRender();" style="font-size:12px;padding:4px 8px;min-height:28px;">← Volver</button>';
    html += '<div>';
    html += '<div style="font-size:15px;font-weight:800;color:var(--text,#0f172a);">' + escapeHtml(tmpl.name) + '</div>';
    html += '<div style="font-size:10px;color:var(--muted,#64748b);">Tipo: ' + (tmpl.baseType === 'emissions' ? 'Emisiones' : 'Simple') + ' | ' + tmpl.steps.length + ' pasos</div>';
    html += '</div>';
    html += '</div>';
    html += '<div style="display:flex;gap:6px;">';
    html += '<button class="tp-btn tp-btn-ghost" onclick="sopTmplRename(\'' + tid + '\')" style="font-size:10px;padding:4px 10px;min-height:26px;">Renombrar</button>';
    html += '<button class="tp-btn tp-btn-primary" onclick="sopTmplAddStep(\'' + tid + '\')" style="font-size:11px;padding:6px 14px;min-height:30px;">+ Agregar Paso</button>';
    html += '</div>';
    html += '</div>';

    // Steps list
    if (tmpl.steps.length === 0) {
        html += '<div style="text-align:center;padding:40px 20px;color:var(--muted,#94a3b8);">';
        html += '<div style="font-size:36px;margin-bottom:12px;">📝</div>';
        html += '<div style="font-size:13px;font-weight:600;">Sin pasos todavía</div>';
        html += '<div style="font-size:11px;margin-top:6px;">Agrega pasos manualmente o clona una plantilla predefinida.</div>';
        html += '</div>';
    } else {
        // Group by sections
        var sections = sopGetSections(tmpl.steps);
        sections.forEach(function(section) {
            var sectionSteps = sopGetSectionSteps(tmpl.steps, section.id);
            var isExpanded = sopState.tmplExpandedSections[section.id] !== false;

            html += '<div style="margin-bottom:8px;">';
            // Section header
            html += '<div class="sop-section-header" onclick="sopTmplToggleSection(\'' + section.id + '\')" style="cursor:pointer;">';
            html += '<div style="display:flex;align-items:center;gap:8px;flex:1;">';
            html += '<span style="font-size:16px;">' + section.icon + '</span>';
            html += '<div style="flex:1;">';
            html += '<div style="font-size:13px;font-weight:700;color:var(--text,#0f172a);">' + escapeHtml(section.label) + '</div>';
            html += '<div style="font-size:10px;color:var(--muted,#64748b);">' + sectionSteps.length + ' pasos</div>';
            html += '</div>';
            html += '</div>';
            html += '<span style="font-size:14px;color:#94a3b8;transition:transform 0.2s;' + (isExpanded ? 'transform:rotate(180deg);' : '') + '">▼</span>';
            html += '</div>';

            if (isExpanded) {
                html += '<div class="sop-section-body">';
                sectionSteps.forEach(function(step) {
                    var globalIdx = tmpl.steps.indexOf(step);
                    html += sopRenderTmplStep(tid, step, globalIdx);
                });
                html += '</div>';
            }
            html += '</div>';
        });
    }

    // Preview button
    html += '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border,#e2e8f0);display:flex;gap:8px;">';
    html += '<button class="tp-btn tp-btn-ghost" onclick="sopTmplPreview(\'' + tid + '\')" style="font-size:11px;padding:6px 14px;min-height:30px;flex:1;">Vista Previa</button>';
    html += '<button class="tp-btn tp-btn-primary" onclick="sopActivateTemplate(\'' + tid + '\',\'' + tmpl.baseType + '\');sopState.tmplEditId=null;sopRender();" style="font-size:11px;padding:6px 14px;min-height:30px;flex:1;background:var(--success,#10b981);">Activar Plantilla</button>';
    html += '</div>';

    html += '</div>';
    return html;
}

function sopRenderTmplStep(tid, step, stepIdx) {
    var isExpanded = sopState.tmplEditStep === stepIdx;
    var fieldLabel = step.fieldType || 'text';

    var html = '<div class="sop-step sop-tmpl-step' + (isExpanded ? ' sop-step-active' : '') + '" style="position:relative;">';

    // Step number
    html += '<div class="sop-step-number" style="cursor:pointer;font-size:11px;" onclick="sopTmplExpandStep(' + stepIdx + ')">' + (stepIdx + 1) + '</div>';

    // Step content
    html += '<div class="sop-step-content">';
    html += '<div class="sop-step-title" onclick="sopTmplExpandStep(' + stepIdx + ')" style="cursor:pointer;">' + escapeHtml(step.title) + '</div>';
    html += '<div class="sop-step-desc">' + escapeHtml(step.description || '') + '</div>';
    html += '<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;align-items:center;">';
    html += '<span style="font-size:9px;padding:2px 6px;background:rgba(99,102,241,0.1);color:#6366f1;border-radius:4px;font-weight:600;">' + fieldLabel + '</span>';
    if (step.section) html += '<span style="font-size:9px;color:var(--muted,#94a3b8);">' + escapeHtml(step.section) + '</span>';
    if (step.dataPath) html += '<span style="font-size:9px;color:#94a3b8;font-family:monospace;">' + escapeHtml(step.dataPath) + '</span>';
    html += '</div>';

    // Reference image thumbnails (from IndexedDB)
    html += '<div id="sop-tmpl-imgs-' + tid + '-' + stepIdx + '" class="sop-image-gallery" style="margin-top:6px;"></div>';

    // Expanded editor
    if (isExpanded) {
        html += '<div class="sop-tmpl-step-editor" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border,#e2e8f0);">';

        // Title
        html += '<div class="sop-field-group" style="margin-bottom:8px;">';
        html += '<label style="font-size:10px;font-weight:700;color:var(--muted,#64748b);display:block;margin-bottom:3px;">Título del paso</label>';
        html += '<input type="text" class="sop-data-input" value="' + escapeHtml(step.title) + '" onchange="sopTmplUpdateField(\'' + tid + '\',' + stepIdx + ',\'title\',this.value)">';
        html += '</div>';

        // Description
        html += '<div class="sop-field-group" style="margin-bottom:8px;">';
        html += '<label style="font-size:10px;font-weight:700;color:var(--muted,#64748b);display:block;margin-bottom:3px;">Descripción / instrucción</label>';
        html += '<textarea class="sop-data-input" rows="2" onchange="sopTmplUpdateField(\'' + tid + '\',' + stepIdx + ',\'description\',this.value)" style="min-height:44px;resize:vertical;">' + escapeHtml(step.description || '') + '</textarea>';
        html += '</div>';

        // Field type
        html += '<div class="sop-field-group" style="margin-bottom:8px;">';
        html += '<label style="font-size:10px;font-weight:700;color:var(--muted,#64748b);display:block;margin-bottom:3px;">Tipo de campo</label>';
        html += '<select class="sop-data-input" onchange="sopTmplUpdateField(\'' + tid + '\',' + stepIdx + ',\'fieldType\',this.value)" style="cursor:pointer;">';
        ['select','number','text','textarea','datetime','action','readonly'].forEach(function(ft) {
            html += '<option value="' + ft + '"' + (step.fieldType === ft ? ' selected' : '') + '>' + ft + '</option>';
        });
        html += '</select>';
        html += '</div>';

        // Section
        html += '<div style="display:flex;gap:8px;margin-bottom:8px;">';
        html += '<div class="sop-field-group" style="flex:1;">';
        html += '<label style="font-size:10px;font-weight:700;color:var(--muted,#64748b);display:block;margin-bottom:3px;">Sección</label>';
        html += '<input type="text" class="sop-data-input" value="' + escapeHtml(step.section || '') + '" onchange="sopTmplUpdateField(\'' + tid + '\',' + stepIdx + ',\'section\',this.value)" placeholder="ej: recepcion">';
        html += '</div>';
        html += '<div class="sop-field-group" style="flex:1;">';
        html += '<label style="font-size:10px;font-weight:700;color:var(--muted,#64748b);display:block;margin-bottom:3px;">Nombre de sección</label>';
        html += '<input type="text" class="sop-data-input" value="' + escapeHtml(step.sectionLabel || '') + '" onchange="sopTmplUpdateField(\'' + tid + '\',' + stepIdx + ',\'sectionLabel\',this.value)" placeholder="ej: Recepción">';
        html += '</div>';
        html += '</div>';

        // Data path
        html += '<div class="sop-field-group" style="margin-bottom:8px;">';
        html += '<label style="font-size:10px;font-weight:700;color:var(--muted,#64748b);display:block;margin-bottom:3px;">Ruta de datos (dataPath)</label>';
        html += '<input type="text" class="sop-data-input" value="' + escapeHtml(step.dataPath || '') + '" onchange="sopTmplUpdateField(\'' + tid + '\',' + stepIdx + ',\'dataPath\',this.value)" placeholder="ej: testData.campo" style="font-family:monospace;font-size:11px;">';
        html += '</div>';

        // Options (for select type)
        if (step.fieldType === 'select') {
            html += '<div class="sop-field-group" style="margin-bottom:8px;">';
            html += '<label style="font-size:10px;font-weight:700;color:var(--muted,#64748b);display:block;margin-bottom:3px;">Opciones (una por línea, formato: valor|etiqueta)</label>';
            var optsText = '';
            if (step.options === '__operators__') {
                optsText = '__operators__';
            } else if (Array.isArray(step.options)) {
                optsText = step.options.map(function(o) { return o.value + '|' + o.label; }).join('\n');
            }
            html += '<textarea class="sop-data-input" rows="3" onchange="sopTmplUpdateOptions(\'' + tid + '\',' + stepIdx + ',this.value)" style="min-height:50px;resize:vertical;font-family:monospace;font-size:10px;">' + escapeHtml(optsText) + '</textarea>';
            html += '<div style="font-size:9px;color:#94a3b8;margin-top:2px;">Usa "__operators__" para lista dinámica de operadores</div>';
            html += '</div>';
        }

        // Reference images
        html += '<div class="sop-field-group" style="margin-bottom:8px;">';
        html += '<label style="font-size:10px;font-weight:700;color:var(--muted,#64748b);display:block;margin-bottom:3px;">Fotos de referencia (guía visual)</label>';
        html += '<button class="tp-btn tp-btn-ghost sop-camera-btn" onclick="sopTmplCaptureRefImage(\'' + tid + '\',' + stepIdx + ')" style="font-size:10px;padding:4px 10px;min-height:26px;">📷 Subir foto de referencia</button>';
        html += '</div>';

        // Checklist items
        html += '<div class="sop-field-group" style="margin-bottom:8px;">';
        html += '<label style="font-size:10px;font-weight:700;color:var(--muted,#64748b);display:block;margin-bottom:3px;">Checklist (sub-items opcionales)</label>';
        var items = step.checklistItems || [];
        items.forEach(function(item, ii) {
            html += '<div style="display:flex;gap:4px;align-items:center;margin-bottom:3px;">';
            html += '<span style="font-size:10px;color:#94a3b8;">•</span>';
            html += '<input type="text" class="sop-data-input" value="' + escapeHtml(item) + '" onchange="sopTmplUpdateChecklist(\'' + tid + '\',' + stepIdx + ',' + ii + ',this.value)" style="flex:1;font-size:11px;">';
            html += '<button class="tp-btn tp-btn-ghost" onclick="sopTmplRemoveChecklist(\'' + tid + '\',' + stepIdx + ',' + ii + ')" style="font-size:9px;padding:2px 6px;min-height:20px;color:var(--danger,#ef4444);">✕</button>';
            html += '</div>';
        });
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopTmplAddChecklist(\'' + tid + '\',' + stepIdx + ')" style="font-size:9px;padding:2px 8px;min-height:22px;">+ Item</button>';
        html += '</div>';

        // Step actions
        html += '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopTmplMoveStep(\'' + tid + '\',' + stepIdx + ',-1)" style="font-size:10px;padding:4px 8px;min-height:24px;">↑ Subir</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopTmplMoveStep(\'' + tid + '\',' + stepIdx + ',1)" style="font-size:10px;padding:4px 8px;min-height:24px;">↓ Bajar</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopTmplDuplicateStep(\'' + tid + '\',' + stepIdx + ')" style="font-size:10px;padding:4px 8px;min-height:24px;">Duplicar</button>';
        html += '<div style="flex:1;"></div>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopTmplDeleteStep(\'' + tid + '\',' + stepIdx + ')" style="font-size:10px;padding:4px 8px;min-height:24px;color:var(--danger,#ef4444);">Eliminar Paso</button>';
        html += '</div>';

        html += '</div>'; // editor
    }

    html += '</div>'; // step-content
    html += '</div>'; // step

    return html;
}

// ── Template Editor Actions ──

function sopTmplToggleSection(sectionId) {
    if (sopState.tmplExpandedSections[sectionId] === undefined) {
        sopState.tmplExpandedSections[sectionId] = false;
    } else {
        sopState.tmplExpandedSections[sectionId] = !sopState.tmplExpandedSections[sectionId];
    }
    sopRender();
}

function sopTmplExpandStep(stepIdx) {
    sopState.tmplEditStep = (sopState.tmplEditStep === stepIdx) ? null : stepIdx;
    sopRender();
}

function sopTmplUpdateField(tid, stepIdx, field, value) {
    var tmpl = sopState.templates[tid];
    if (!tmpl || !tmpl.steps[stepIdx]) return;
    tmpl.steps[stepIdx][field] = value;
    tmpl.updatedAt = new Date().toISOString();
    sopSave();
}

function sopTmplUpdateOptions(tid, stepIdx, text) {
    var tmpl = sopState.templates[tid];
    if (!tmpl || !tmpl.steps[stepIdx]) return;
    if (text.trim() === '__operators__') {
        tmpl.steps[stepIdx].options = '__operators__';
    } else {
        tmpl.steps[stepIdx].options = text.trim().split('\n').filter(function(l) { return l.trim(); }).map(function(line) {
            var parts = line.split('|');
            return { value: parts[0].trim(), label: (parts[1] || parts[0]).trim() };
        });
    }
    tmpl.updatedAt = new Date().toISOString();
    sopSave();
}

function sopTmplUpdateChecklist(tid, stepIdx, itemIdx, value) {
    var tmpl = sopState.templates[tid];
    if (!tmpl || !tmpl.steps[stepIdx]) return;
    if (!tmpl.steps[stepIdx].checklistItems) tmpl.steps[stepIdx].checklistItems = [];
    tmpl.steps[stepIdx].checklistItems[itemIdx] = value;
    tmpl.updatedAt = new Date().toISOString();
    sopSave();
}

function sopTmplAddChecklist(tid, stepIdx) {
    var tmpl = sopState.templates[tid];
    if (!tmpl || !tmpl.steps[stepIdx]) return;
    if (!tmpl.steps[stepIdx].checklistItems) tmpl.steps[stepIdx].checklistItems = [];
    tmpl.steps[stepIdx].checklistItems.push('Nuevo item');
    tmpl.updatedAt = new Date().toISOString();
    sopSave();
    sopRender();
}

function sopTmplRemoveChecklist(tid, stepIdx, itemIdx) {
    var tmpl = sopState.templates[tid];
    if (!tmpl || !tmpl.steps[stepIdx]) return;
    tmpl.steps[stepIdx].checklistItems.splice(itemIdx, 1);
    tmpl.updatedAt = new Date().toISOString();
    sopSave();
    sopRender();
}

function sopTmplMoveStep(tid, stepIdx, direction) {
    var tmpl = sopState.templates[tid];
    if (!tmpl) return;
    var newIdx = stepIdx + direction;
    if (newIdx < 0 || newIdx >= tmpl.steps.length) return;
    var temp = tmpl.steps[stepIdx];
    tmpl.steps[stepIdx] = tmpl.steps[newIdx];
    tmpl.steps[newIdx] = temp;
    tmpl.updatedAt = new Date().toISOString();
    sopState.tmplEditStep = newIdx;
    sopSave();
    sopRender();
}

function sopTmplDuplicateStep(tid, stepIdx) {
    var tmpl = sopState.templates[tid];
    if (!tmpl || !tmpl.steps[stepIdx]) return;
    var clone = JSON.parse(JSON.stringify(tmpl.steps[stepIdx]));
    clone.title = clone.title + ' (copia)';
    tmpl.steps.splice(stepIdx + 1, 0, clone);
    tmpl.updatedAt = new Date().toISOString();
    sopSave();
    sopRender();
}

function sopTmplDeleteStep(tid, stepIdx) {
    if (typeof showCustomConfirm === 'function') {
        showCustomConfirm('Eliminar Paso', '¿Eliminar este paso de la plantilla?', function() {
            var tmpl = sopState.templates[tid];
            if (!tmpl) return;
            tmpl.steps.splice(stepIdx, 1);
            tmpl.updatedAt = new Date().toISOString();
            sopState.tmplEditStep = null;
            sopSave();
            sopRender();
            if (typeof showToast === 'function') showToast('Paso eliminado', 'info');
        }, 'danger');
    }
}

function sopTmplAddStep(tid) {
    var tmpl = sopState.templates[tid];
    if (!tmpl) return;

    // Determine section from last step or default
    var lastSection = tmpl.steps.length > 0 ? tmpl.steps[tmpl.steps.length - 1].section : 'general';
    var lastSectionLabel = tmpl.steps.length > 0 ? (tmpl.steps[tmpl.steps.length - 1].sectionLabel || '') : 'General';

    tmpl.steps.push({
        title: 'Nuevo paso',
        description: '',
        fieldType: 'text',
        cascadeFieldId: '',
        dataPath: '',
        section: lastSection,
        sectionLabel: lastSectionLabel
    });
    tmpl.updatedAt = new Date().toISOString();
    sopState.tmplEditStep = tmpl.steps.length - 1;
    sopSave();
    sopRender();
}

function sopTmplRename(tid) {
    var tmpl = sopState.templates[tid];
    if (!tmpl) return;
    var name = prompt('Nuevo nombre:', tmpl.name);
    if (name && name.trim()) {
        tmpl.name = name.trim();
        tmpl.updatedAt = new Date().toISOString();
        sopSave();
        sopRender();
    }
}

// ── Reference Image Management ──

function sopTmplCaptureRefImage(tid, stepIdx) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = function(e) {
        var files = Array.from(e.target.files);
        if (!files.length) return;
        var count = 0;
        files.forEach(function(file) {
            var stepKey = 'tmpl-' + tid + '-' + stepIdx;
            sopImageSave(stepKey, file, function() {
                count++;
                if (count === files.length) {
                    sopRender();
                    sopTmplLoadRefImages();
                    if (typeof showToast === 'function') showToast(count + ' imagen(es) de referencia guardada(s)', 'success');
                }
            });
        });
    };
    input.click();
}

function sopTmplLoadRefImages() {
    // Load reference images for all visible template steps
    var tid = sopState.tmplEditId;
    if (!tid || !sopState.templates[tid]) return;
    var tmpl = sopState.templates[tid];
    tmpl.steps.forEach(function(step, stepIdx) {
        var container = document.getElementById('sop-tmpl-imgs-' + tid + '-' + stepIdx);
        if (!container) return;
        var stepKey = 'tmpl-' + tid + '-' + stepIdx;
        sopImageGetAll(stepKey, function(images) {
            if (images.length === 0) { container.innerHTML = ''; return; }
            var imgHtml = '';
            images.forEach(function(img) {
                imgHtml += '<div class="sop-image-thumb" onclick="sopShowImageOverlay(\'' + img.id + '\')" style="cursor:pointer;">';
                imgHtml += '<img src="' + img.thumbnail + '" style="width:48px;height:48px;object-fit:cover;border-radius:6px;">';
                imgHtml += '</div>';
            });
            container.innerHTML = imgHtml;
        });
    });
}

function sopTmplPreview(tid) {
    var tmpl = sopState.templates[tid];
    if (!tmpl) return;
    // Show a simple preview of the procedure
    var steps = tmpl.steps;
    var sections = sopGetSections(steps);
    var msg = tmpl.name + '\n\n';
    sections.forEach(function(s) {
        msg += s.icon + ' ' + s.label + '\n';
        sopGetSectionSteps(steps, s.id).forEach(function(step, i) {
            msg += '  ' + (i + 1) + '. ' + step.title + ' [' + step.fieldType + ']\n';
        });
        msg += '\n';
    });
    alert(msg);
}

// Load ref images for guide view (when technician sees reference photos)
function sopLoadRefImagesForGuide(vehicle) {
    if (!vehicle) return;
    var isEm = typeof isEmissionsPurpose === 'function' && isEmissionsPurpose(vehicle.purpose);
    var tmplId = isEm ? sopState.activeTemplateEmissions : sopState.activeTemplateSimple;
    if (!tmplId) return; // Default templates have no ref images

    var steps = sopGetProcedureForVehicle(vehicle);
    // Offset by SOP_ALTA_STEPS length since ref images are per-template step
    var altaLen = SOP_ALTA_STEPS.length;
    steps.forEach(function(step, globalIdx) {
        if (globalIdx < altaLen) return; // Alta steps don't have ref images
        var tmplStepIdx = globalIdx - altaLen;
        var container = document.getElementById('sop-ref-imgs-' + globalIdx);
        if (!container) return;
        var stepKey = 'tmpl-' + tmplId + '-' + tmplStepIdx;
        sopImageGetAll(stepKey, function(images) {
            if (images.length === 0) { container.innerHTML = ''; return; }
            var imgHtml = '<div style="font-size:9px;font-weight:700;color:var(--muted,#64748b);margin-bottom:4px;">Referencia visual:</div>';
            images.forEach(function(img) {
                imgHtml += '<div class="sop-image-thumb" onclick="sopShowImageOverlay(\'' + img.id + '\')" style="cursor:pointer;display:inline-block;margin-right:4px;">';
                imgHtml += '<img src="' + img.thumbnail + '" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:2px solid rgba(99,102,241,0.3);">';
                imgHtml += '</div>';
            });
            container.innerHTML = imgHtml;
        });
    });
}

// ======================================================================
// [S19] CASCADE INTEGRATION
// ======================================================================

function sopGetCascadeBanner(phase) {
    // Show SOP banner in Cascade to guide users
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var activeVeh = null;
    if (typeof activeVehicleId !== 'undefined' && activeVehicleId) {
        activeVeh = vehicles.find(function(v) { return v.id == activeVehicleId; });
    }

    if (!activeVeh) return '';

    var steps = sopGetProcedureForVehicle(activeVeh);
    var progress = sopCalcProgress(activeVeh, steps);

    var html = '<div class="sop-context-banner" onclick="sopStartAndShow(' + activeVeh.id + ')">';
    html += '<div class="sop-context-icon">📋</div>';
    html += '<div class="sop-context-text">';
    if (progress > 0 && progress < 100) {
        html += '<strong>SOP Guiado: ' + progress + '% completado</strong><br>Toca para continuar el procedimiento paso a paso';
    } else if (progress === 100) {
        html += '<strong>SOP Guiado: Completado</strong><br>Todos los campos han sido llenados';
    } else {
        html += '<strong>Guía SOP disponible</strong><br>Toca para llenar los datos con ayuda paso a paso';
    }
    html += '</div>';
    html += '<div class="sop-context-action">' + (progress > 0 ? 'Continuar ›' : 'Iniciar ›') + '</div>';
    html += '</div>';

    return html;
}

function sopStartAndShow(vehicleId) {
    sopState.selectedVehicleId = vehicleId;
    sopState.currentTab = 'sop-guia';
    sopSave();

    if (typeof switchPlatform === 'function') {
        switchPlatform('sop');
    }
    setTimeout(function() { sopRender(); }, 100);
}

function sopGoToCascade(vehicleId) {
    if (typeof switchPlatform === 'function') {
        switchPlatform('cop15');
    }
    // Try to select the vehicle in Cascade
    setTimeout(function() {
        var select = document.getElementById('activeVehSelect');
        if (select) {
            select.value = vehicleId;
            if (typeof loadVehicle === 'function') loadVehicle();
        }
    }, 200);
}

// ======================================================================
// [S20] HELPERS
// ======================================================================

function sopFormatDuration(start, end) {
    var ms = new Date(end) - new Date(start);
    var mins = Math.floor(ms / 60000);
    if (mins < 60) return mins + ' min';
    var hrs = Math.floor(mins / 60);
    var remainMins = mins % 60;
    return hrs + 'h ' + remainMins + 'min';
}

// ======================================================================
// [S21] INITIALIZE
// ======================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(sopInit, 100);
    });
} else {
    setTimeout(sopInit, 100);
}
