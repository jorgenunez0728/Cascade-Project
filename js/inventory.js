// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Lab Inventory Module                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M30] LAB INVENTORY — Gas Cylinders, Equipment, Readings         ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── [Fase 2.1] Debounced render wrapper for search/filter inputs ──
// v16.6: invalida la pestaña activa antes de renderizar — tabCacheSwitch solo
// vuelve a llamar al renderFn si dirty[tab] está marcado; sin esto, un filtro o
// búsqueda cambiaba el estado pero la pestaña ya renderizada se quedaba igual
// hasta cambiar de pestaña y regresar (bug real, encontrado con pruebas en navegador).
var _invDebouncedRender = debounce(function() {
    if (typeof tabCacheInvalidate === 'function') tabCacheInvalidate('inv', invState.activeTab);
    invRender();
}, 250);

const INV_LS_KEY = 'kia_lab_inventory';
let invState = safeParse(INV_LS_KEY, null) || {
    gases: [],       // {id, controlNo, cylinderNo, formula, gasType, concNominal, concReal, traceability, validUntil, zone, position, status, regDate, gasCategory, readings:[], barcode}
    equipment: [],   // {id, name, type, serialNo, location, lastCalDate, nextCalDate, calCertNo, status, notes}
    zones: [
        {id:'A',label:'Zona A',slots:12,type:'online'},
        {id:'B',label:'Zona B',slots:4,type:'online'},
        {id:'C',label:'Zona C',slots:12,type:'offline'},
        {id:'D',label:'Zona D',slots:2,type:'special'},
        {id:'E',label:'Zona E',slots:14,type:'offline'},
        {id:'F',label:'Zona F',slots:14,type:'offline'},
        {id:'G',label:'Zona G',slots:2,type:'special'},
        {id:'H',label:'Zona H',slots:4,type:'offline'}
    ],
    gasTypes: [
        {name:'Metano/Aire',formula:'CH4/Air',concs:['2 ppm','5 ppm','10 ppm','20 ppm']},
        {name:'Propano/Aire',formula:'C3H8/Air',concs:['0.66 ppm','1.66 ppm','3.33 ppm','16.66 ppm']},
        {name:'Monoxido de Carbono/Nitrogeno',formula:'CO/N2',concs:['10 ppm','20 ppm','50 ppm','1000 ppm']},
        {name:'Oxido Nitrico/Nitrogeno',formula:'NO/N2',concs:['0.5 ppm','5 ppm','10 ppm','90 ppm']},
        {name:'Bioxido de Carbono/Nitrogeno',formula:'CO2/N2',concs:['0.5 ppm','1 ppm','3 ppm','15 ppm']},
        {name:'Oxido Nitroso/Nitrogeno',formula:'N2O/N2',concs:['0.5 ppm','5 ppm']},
        {name:'Aire Cero',formula:'ZERO',concs:['-']},
        {name:'Hidrogeno/Helio',formula:'H2/He',concs:['40%']},
        {name:'Oxigeno/Nitrogeno',formula:'O2/N2',concs:['21%','99.99%']}
    ],
    activeTab: 'inv-dashboard',
    usageLog: [], // {date, gasId, psiUsed, testsRun, regulation}
    fuelTanks: [], // {id, name, fuelType, octane, supplier, capacity, currentLevel, unit, readings}
    // ── COP15-F11 Plan Maestro de Mantenimiento y Calibración (v16.4) ──
    assets: [],          // {id:'E-001', name, lab, brand, model, serialNo, status, notes, blocksTesting}
    maintActivities: [], // {id:'A-01', assetId, desc, freq, startWeek, responsible, active}
    maintLog: [],        // {id, date, assetId, activityId, by, hours, comments, createdAt}
    f11Seed: 0            // guard de migración (=3 cuando ya se aplicó la rev 03 del F11)
};

// Listas cerradas del formato COP15-F11 (hoja "Listas")
var INV_CAL_FREQ_DAYS = { Semestral: 182, Anual: 365, Bianual: 730 };
var INV_MTTO_FREQ_WEEKS = { Semanal: 1, Quincenal: 2, Mensual: 4, Bimestral: 8, Trimestral: 13, Semestral: 26, Anual: 52 };
var INV_LABS = ['Emisiones', 'Materiales', 'Calibración'];
var INV_CAL_PLACES = ['En sitio', 'Externo Nacional', 'Externo USA'];
var INV_CAL_TYPES = ['Interna', 'Externa'];

// [v20] El estado del arrastre y de la selección por teclado del mapa de zonas se mudó a
// `_gridDrag`/`_gridKbd` en app.js, junto con el motor: el tablero de "Mi semana" necesitaba
// exactamente lo mismo y dos copias del mismo arrastre táctil se habrían desincronizado.
var _invUndoStack = [];
var _invUndoMaxSize = 5;

function invSave() {
    try { localStorage.setItem(INV_LS_KEY, JSON.stringify(invState)); }
    catch(e) {
        console.warn('INV: localStorage full, trying compact save');
        invCompactReadings();
        try { localStorage.setItem(INV_LS_KEY, JSON.stringify(invState)); }
        catch(e2) { showToast('Almacenamiento lleno. Elimina datos antiguos.', 'error'); }
    }
    tabCacheInvalidate('inv');
    // [R6] Notify Alpine components of data change
    window.dispatchEvent(new CustomEvent('data:saved', { detail: { module: 'inventory' } }));
}

// ── [Fase 5.3] Compact old fuel readings (keep last 30 per tank) ──
function invCompactReadings() {
    if (!invState || !invState.fuelTanks) return;
    var compacted = 0;
    invState.fuelTanks.forEach(function(t) {
        if (t.readings && t.readings.length > 30) {
            compacted += t.readings.length - 30;
            t.readings = t.readings.slice(-30);
        }
    });
    // Also compact equipment calibration history
    if (invState.equipment) {
        invState.equipment.forEach(function(eq) {
            if (eq.calibrationHistory && eq.calibrationHistory.length > 20) {
                compacted += eq.calibrationHistory.length - 20;
                eq.calibrationHistory = eq.calibrationHistory.slice(-20);
            }
        });
    }
    if (compacted > 0) { console.log('INV: Compacted ' + compacted + ' old readings'); }
}


function invPreloadData() {
    if (invState.gases.length === 0) {
        invState.gases = [{"id": "g_ch420", "controlNo": "CH4-20", "cylinderNo": "", "formula": "CH4/Air", "gasType": "Metano/Aire", "concNominal": "20 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "A01", "position": 1, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CH4-20*", "readings": [{"date": "2026-02-01", "psi": 1266}, {"date": "2026-02-06", "psi": 1250}, {"date": "2026-02-13", "psi": 1233}, {"date": "2026-02-20", "psi": 1216}, {"date": "2026-02-27", "psi": 1200}], "weeklyPsi": 16.7, "dailyPsi": 3.3, "reposDays": 44, "limitPsi": 190.67}, {"id": "g_ch410", "controlNo": "CH4-10", "cylinderNo": "", "formula": "CH4/Air", "gasType": "Metano/Aire", "concNominal": "10 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "A02", "position": 2, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CH4-10*", "readings": [{"date": "2026-02-01", "psi": 2505}, {"date": "2026-02-06", "psi": 2492}, {"date": "2026-02-13", "psi": 2478}, {"date": "2026-02-20", "psi": 2464}, {"date": "2026-02-27", "psi": 2450}], "weeklyPsi": 13.8, "dailyPsi": 2.8, "reposDays": 44, "limitPsi": 158.21}, {"id": "g_ch405", "controlNo": "CH4-05", "cylinderNo": "", "formula": "CH4/Air", "gasType": "Metano/Aire", "concNominal": "5 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "A03", "position": 3, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CH4-05*", "readings": [{"date": "2026-02-01", "psi": 1479}, {"date": "2026-02-06", "psi": 1472}, {"date": "2026-02-13", "psi": 1465}, {"date": "2026-02-20", "psi": 1457}, {"date": "2026-02-27", "psi": 1450}], "weeklyPsi": 7.4, "dailyPsi": 1.5, "reposDays": 44, "limitPsi": 85.19}, {"id": "g_ch402", "controlNo": "CH4-02", "cylinderNo": "", "formula": "CH4/Air", "gasType": "Metano/Aire", "concNominal": "2 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "A04", "position": 4, "status": "Spare", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CH4-02*", "readings": [{"date": "2026-02-01", "psi": 1400}, {"date": "2026-02-06", "psi": 1400}, {"date": "2026-02-13", "psi": 1400}, {"date": "2026-02-20", "psi": 1400}, {"date": "2026-02-27", "psi": 1400}], "weeklyPsi": 0, "dailyPsi": 0, "reposDays": 44, "limitPsi": 0}, {"id": "g_c3h81666", "controlNo": "C3H8-1666", "cylinderNo": "", "formula": "C3H8/Air", "gasType": "Propano/Aire", "concNominal": "16.66 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "B01", "position": 1, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*C3H8-1666*", "readings": [{"date": "2026-02-01", "psi": 2929}, {"date": "2026-02-06", "psi": 2922}, {"date": "2026-02-13", "psi": 2915}, {"date": "2026-02-20", "psi": 2907}, {"date": "2026-02-27", "psi": 2900}], "weeklyPsi": 7.4, "dailyPsi": 1.5, "reposDays": 44, "limitPsi": 85.19}, {"id": "g_c3h8333", "controlNo": "C3H8-333", "cylinderNo": "", "formula": "C3H8/Air", "gasType": "Propano/Aire", "concNominal": "3.33 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "B02", "position": 2, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*C3H8-333*", "readings": [{"date": "2026-02-01", "psi": 2429}, {"date": "2026-02-06", "psi": 2422}, {"date": "2026-02-13", "psi": 2415}, {"date": "2026-02-20", "psi": 2407}, {"date": "2026-02-27", "psi": 2400}], "weeklyPsi": 7.4, "dailyPsi": 1.5, "reposDays": 44, "limitPsi": 85.19}, {"id": "g_c3h8166", "controlNo": "C3H8-166", "cylinderNo": "", "formula": "C3H8/Air", "gasType": "Propano/Aire", "concNominal": "1.66 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "B03", "position": 3, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*C3H8-166*", "readings": [{"date": "2026-02-01", "psi": 1234}, {"date": "2026-02-06", "psi": 1226}, {"date": "2026-02-13", "psi": 1217}, {"date": "2026-02-20", "psi": 1209}, {"date": "2026-02-27", "psi": 1200}], "weeklyPsi": 8.5, "dailyPsi": 1.7, "reposDays": 44, "limitPsi": 97.36}, {"id": "g_c3h8066", "controlNo": "C3H8-066", "cylinderNo": "", "formula": "C3H8/Air", "gasType": "Propano/Aire", "concNominal": "0.66 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "B04", "position": 4, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*C3H8-066*", "readings": [{"date": "2026-02-01", "psi": 1462}, {"date": "2026-02-06", "psi": 1459}, {"date": "2026-02-13", "psi": 1456}, {"date": "2026-02-20", "psi": 1453}, {"date": "2026-02-27", "psi": 1450}], "weeklyPsi": 3.2, "dailyPsi": 0.6, "reposDays": 44, "limitPsi": 36.51}, {"id": "g_co100", "controlNo": "CO-100", "cylinderNo": "", "formula": "CO/N2", "gasType": "Monoxido de Carbono/Nitrogeno", "concNominal": "100 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C01", "position": 1, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CO-100*", "readings": [{"date": "2026-02-01", "psi": 3321}, {"date": "2026-02-06", "psi": 3316}, {"date": "2026-02-13", "psi": 3311}, {"date": "2026-02-20", "psi": 3306}, {"date": "2026-02-27", "psi": 3300}], "weeklyPsi": 5.3, "dailyPsi": 1.1, "reposDays": 44, "limitPsi": 60.85}, {"id": "g_co50", "controlNo": "CO-50", "cylinderNo": "", "formula": "CO/N2", "gasType": "Monoxido de Carbono/Nitrogeno", "concNominal": "50 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C02", "position": 2, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CO-50*", "readings": [{"date": "2026-02-01", "psi": 3146}, {"date": "2026-02-06", "psi": 3135}, {"date": "2026-02-13", "psi": 3123}, {"date": "2026-02-20", "psi": 3111}, {"date": "2026-02-27", "psi": 3100}], "weeklyPsi": 11.7, "dailyPsi": 2.3, "reposDays": 44, "limitPsi": 133.87}, {"id": "g_co20", "controlNo": "CO-20", "cylinderNo": "", "formula": "CO/N2", "gasType": "Monoxido de Carbono/Nitrogeno", "concNominal": "20 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C03", "position": 3, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CO-20*", "readings": [{"date": "2026-02-01", "psi": 1105}, {"date": "2026-02-06", "psi": 1092}, {"date": "2026-02-13", "psi": 1078}, {"date": "2026-02-20", "psi": 1064}, {"date": "2026-02-27", "psi": 1050}], "weeklyPsi": 13.8, "dailyPsi": 2.8, "reposDays": 44, "limitPsi": 158.21}, {"id": "g_co10", "controlNo": "CO-10", "cylinderNo": "", "formula": "CO/N2", "gasType": "Monoxido de Carbono/Nitrogeno", "concNominal": "10 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C04", "position": 4, "status": "Spare", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CO-10*", "readings": [{"date": "2026-02-01", "psi": 3500}, {"date": "2026-02-06", "psi": 3500}, {"date": "2026-02-13", "psi": 3500}, {"date": "2026-02-20", "psi": 3500}, {"date": "2026-02-27", "psi": 3500}], "weeklyPsi": 0, "dailyPsi": 0, "reposDays": 44, "limitPsi": 0}, {"id": "g_no02", "controlNo": "NO-02", "cylinderNo": "", "formula": "NO/N2", "gasType": "Oxido Nitrico/Nitrogeno", "concNominal": "2 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C05", "position": 5, "status": "Spare", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*NO-02*", "readings": [{"date": "2026-02-01", "psi": 2000}, {"date": "2026-02-06", "psi": 2000}, {"date": "2026-02-13", "psi": 2000}, {"date": "2026-02-20", "psi": 2000}, {"date": "2026-02-27", "psi": 2000}], "weeklyPsi": 0, "dailyPsi": 0, "reposDays": 44, "limitPsi": 0}, {"id": "g_no05", "controlNo": "NO-05", "cylinderNo": "", "formula": "NO/N2", "gasType": "Oxido Nitrico/Nitrogeno", "concNominal": "5 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C06", "position": 6, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*NO-05*", "readings": [{"date": "2026-02-01", "psi": 1388}, {"date": "2026-02-06", "psi": 1379}, {"date": "2026-02-13", "psi": 1369}, {"date": "2026-02-20", "psi": 1360}, {"date": "2026-02-27", "psi": 1350}], "weeklyPsi": 9.6, "dailyPsi": 1.9, "reposDays": 44, "limitPsi": 109.53}, {"id": "g_no10", "controlNo": "NO-10", "cylinderNo": "", "formula": "NO/N2", "gasType": "Oxido Nitrico/Nitrogeno", "concNominal": "10 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C07", "position": 7, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*NO-10*", "readings": [{"date": "2026-02-01", "psi": 2588}, {"date": "2026-02-06", "psi": 2579}, {"date": "2026-02-13", "psi": 2569}, {"date": "2026-02-20", "psi": 2560}, {"date": "2026-02-27", "psi": 2550}], "weeklyPsi": 9.6, "dailyPsi": 1.9, "reposDays": 44, "limitPsi": 109.53}, {"id": "g_no50", "controlNo": "NO-50", "cylinderNo": "", "formula": "NO/N2", "gasType": "Oxido Nitrico/Nitrogeno", "concNominal": "50 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C08", "position": 8, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*NO-50*", "readings": [{"date": "2026-02-01", "psi": 1612}, {"date": "2026-02-06", "psi": 1609}, {"date": "2026-02-13", "psi": 1606}, {"date": "2026-02-20", "psi": 1603}, {"date": "2026-02-27", "psi": 1600}], "weeklyPsi": 3.2, "dailyPsi": 0.6, "reposDays": 44, "limitPsi": 36.51}, {"id": "g_co205p", "controlNo": "CO2-05p", "cylinderNo": "", "formula": "CO2/N2", "gasType": "Bioxido de Carbono/Nitrogeno", "concNominal": "0.5 %v", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C09", "position": 9, "status": "Spare", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CO2-05p*", "readings": [{"date": "2026-02-01", "psi": 1600}, {"date": "2026-02-06", "psi": 1600}, {"date": "2026-02-13", "psi": 1600}, {"date": "2026-02-20", "psi": 1600}, {"date": "2026-02-27", "psi": 1600}], "weeklyPsi": 0, "dailyPsi": 0, "reposDays": 44, "limitPsi": 0}, {"id": "g_co21p", "controlNo": "CO2-1p", "cylinderNo": "", "formula": "CO2/N2", "gasType": "Bioxido de Carbono/Nitrogeno", "concNominal": "1 %v", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C10", "position": 10, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CO2-1p*", "readings": [{"date": "2026-02-01", "psi": 684}, {"date": "2026-02-06", "psi": 676}, {"date": "2026-02-13", "psi": 667}, {"date": "2026-02-20", "psi": 659}, {"date": "2026-02-27", "psi": 650}], "weeklyPsi": 8.5, "dailyPsi": 1.7, "reposDays": 44, "limitPsi": 97.36}, {"id": "g_co22p", "controlNo": "CO2-2p", "cylinderNo": "", "formula": "CO2/N2", "gasType": "Bioxido de Carbono/Nitrogeno", "concNominal": "2 %v", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C11", "position": 11, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*CO2-2p*", "readings": [{"date": "2026-02-01", "psi": 2888}, {"date": "2026-02-06", "psi": 2879}, {"date": "2026-02-13", "psi": 2869}, {"date": "2026-02-20", "psi": 2860}, {"date": "2026-02-27", "psi": 2850}], "weeklyPsi": 9.6, "dailyPsi": 1.9, "reposDays": 44, "limitPsi": 109.53}, {"id": "g_n2o05", "controlNo": "N2O-05", "cylinderNo": "", "formula": "N2O/N2", "gasType": "Oxido Nitroso/Nitrogeno", "concNominal": "0.5 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "C12", "position": 12, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*N2O-05*", "readings": [{"date": "2026-02-01", "psi": 1554}, {"date": "2026-02-06", "psi": 1553}, {"date": "2026-02-13", "psi": 1552}, {"date": "2026-02-20", "psi": 1551}, {"date": "2026-02-27", "psi": 1550}], "weeklyPsi": 1.1, "dailyPsi": 0.2, "reposDays": 44, "limitPsi": 12.17}, {"id": "g_n2o25", "controlNo": "N2O-25", "cylinderNo": "", "formula": "N2O/N2", "gasType": "Oxido Nitroso/Nitrogeno", "concNominal": "2.5 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "D01", "position": 1, "status": "Spare", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*N2O-25*", "readings": [{"date": "2026-02-01", "psi": 1750}, {"date": "2026-02-06", "psi": 1750}, {"date": "2026-02-13", "psi": 1750}, {"date": "2026-02-20", "psi": 1750}, {"date": "2026-02-27", "psi": 1750}], "weeklyPsi": 0, "dailyPsi": 0, "reposDays": 44, "limitPsi": 0}, {"id": "g_n2o5", "controlNo": "N2O-5", "cylinderNo": "", "formula": "N2O/N2", "gasType": "Oxido Nitroso/Nitrogeno", "concNominal": "5 ppm", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "D02", "position": 2, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Referencia", "barcode": "*N2O-5*", "readings": [{"date": "2026-02-01", "psi": 1554}, {"date": "2026-02-06", "psi": 1553}, {"date": "2026-02-13", "psi": 1552}, {"date": "2026-02-20", "psi": 1551}, {"date": "2026-02-27", "psi": 1550}], "weeklyPsi": 1.1, "dailyPsi": 0.2, "reposDays": 21, "limitPsi": 5.81}, {"id": "g_n255", "controlNo": "N2-55", "cylinderNo": "", "formula": "N2", "gasType": "Nitrogeno 5.5", "concNominal": "99.9995%", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "E01", "position": 1, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Trabajo", "barcode": "*N2-55*", "readings": [{"date": "2026-02-01", "psi": 3987}, {"date": "2026-02-06", "psi": 3941}, {"date": "2026-02-13", "psi": 3894}, {"date": "2026-02-20", "psi": 3847}, {"date": "2026-02-27", "psi": 3800}], "weeklyPsi": 46.8, "dailyPsi": 9.4, "reposDays": 21, "limitPsi": 255.57}, {"id": "g_n248", "controlNo": "N2-48", "cylinderNo": "", "formula": "N2", "gasType": "Nitrogeno 4.8", "concNominal": "99.998%", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "E02", "position": 2, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Trabajo", "barcode": "*N2-48*", "readings": [{"date": "2026-02-01", "psi": 3825}, {"date": "2026-02-06", "psi": 3819}, {"date": "2026-02-13", "psi": 3813}, {"date": "2026-02-20", "psi": 3806}, {"date": "2026-02-27", "psi": 3800}], "weeklyPsi": 6.4, "dailyPsi": 1.3, "reposDays": 21, "limitPsi": 34.85}, {"id": "g_zeroair", "controlNo": "ZERO-AIR", "cylinderNo": "", "formula": "ZERO", "gasType": "Aire Cero Emision Vehicular", "concNominal": "AIR O2 rojo", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "E03", "position": 3, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Trabajo", "barcode": "*ZERO-AIR*", "readings": [{"date": "2026-02-01", "psi": 4219}, {"date": "2026-02-06", "psi": 4190}, {"date": "2026-02-13", "psi": 4160}, {"date": "2026-02-20", "psi": 4130}, {"date": "2026-02-27", "psi": 4100}], "weeklyPsi": 29.8, "dailyPsi": 6.0, "reposDays": 21, "limitPsi": 162.64}, {"id": "g_zeron219", "controlNo": "ZERO-N2-19", "cylinderNo": "", "formula": "ZERO", "gasType": "Balance Nitrogeno con Impurezas", "concNominal": "O 19-12%", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "E04", "position": 4, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Trabajo", "barcode": "*ZERO-N2-19*", "readings": [{"date": "2026-02-01", "psi": 3998}, {"date": "2026-02-06", "psi": 3974}, {"date": "2026-02-13", "psi": 3949}, {"date": "2026-02-20", "psi": 3925}, {"date": "2026-02-27", "psi": 3900}], "weeklyPsi": 24.5, "dailyPsi": 4.9, "reposDays": 44, "limitPsi": 279.91}, {"id": "g_o243", "controlNo": "O2-43", "cylinderNo": "", "formula": "O2/N2", "gasType": "Oxigeno Ultra Alta Pureza", "concNominal": "4.3", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "E05", "position": 5, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Trabajo", "barcode": "*O2-43*", "readings": [{"date": "2026-02-01", "psi": 2468}, {"date": "2026-02-06", "psi": 2451}, {"date": "2026-02-13", "psi": 2434}, {"date": "2026-02-20", "psi": 2417}, {"date": "2026-02-27", "psi": 2400}], "weeklyPsi": 17.0, "dailyPsi": 3.4, "reposDays": 21, "limitPsi": 92.94}, {"id": "g_h2he", "controlNo": "H2-He", "cylinderNo": "", "formula": "H2/He", "gasType": "Mezcla FID Hidrogeno/Helio", "concNominal": "40%v", "concReal": "", "traceability": "EPA", "validUntil": "2026-12-31", "zone": "E06", "position": 6, "status": "In use", "regDate": "2026-01-01", "gasCategory": "Trabajo", "barcode": "*H2-He*", "readings": [{"date": "2026-02-01", "psi": 3944}, {"date": "2026-02-06", "psi": 3908}, {"date": "2026-02-13", "psi": 3872}, {"date": "2026-02-20", "psi": 3836}, {"date": "2026-02-27", "psi": 3800}], "weeklyPsi": 36.2, "dailyPsi": 7.2, "reposDays": 21, "limitPsi": 197.49}];
        console.log('INV: Preloaded ' + invState.gases.length + ' gases');
    }
    if (!invState.fuelTanks || invState.fuelTanks.length === 0) {
        invState.fuelTanks = [{"id": "fuel_carblev3", "name": "CARB LEV III Regular", "fuelType": "Gasolina Referencia", "octane": "87 AKI", "supplier": "Haltermann Carless", "capacity": 400, "currentLevel": 315, "unit": "L", "regulation": "CARB LEV III", "readings": [{"date": "2026-02-20", "level": 315}], "regDate": "2026-01-01"}, {"id": "fuel_eurovi_prev", "name": "EURO VI (Orden Anterior)", "fuelType": "Gasolina Referencia", "octane": "95 RON", "supplier": "Haltermann Carless", "capacity": 400, "currentLevel": 379.5, "unit": "L", "regulation": "EURO VI", "readings": [{"date": "2026-02-20", "level": 379.5}], "regDate": "2025-10-01"}, {"id": "fuel_eurovi_act", "name": "EURO VI (Orden Actual)", "fuelType": "Gasolina Referencia", "octane": "95 RON", "supplier": "Haltermann Carless", "capacity": 400, "currentLevel": 400, "unit": "L", "regulation": "EURO VI", "readings": [{"date": "2026-02-20", "level": 400}], "regDate": "2026-02-01"}];
        console.log('INV: Preloaded ' + invState.fuelTanks.length + ' fuel tanks');
    }
    if (invState.equipment.length === 0) {
        invState.equipment = [{"id": "eq_th0033", "name": "Termohigrometro HVAC", "type": "Thermometer/Humidity", "serialNo": "N/A", "kmmId": "TH-0033", "brand": "Kimo", "model": "TH210B0SP", "traceability": "EMA", "calLab": "METROLAB", "location": "HVAC Room", "magnitude": "Temperature/Humidity", "lastCalDate": "2025-02-21", "nextCalDate": "2026-02-21", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_th004301", "name": "Sensor Hum/Temp VETS 1", "type": "Humidity sensor", "serialNo": "W4754750", "kmmId": "TH-0043-01", "brand": "Vaisala", "model": "INDIGO520", "traceability": "EMA", "calLab": "Vaisala", "location": "VETS", "magnitude": "Hum y Temp", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_th004302", "name": "Barometro VETS 1", "type": "Barometer", "serialNo": "W3850023", "kmmId": "TH-0043-02", "brand": "Vaisala", "model": "INDIGO520", "traceability": "EMA", "calLab": "Vaisala", "location": "VETS", "magnitude": "Presion", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_th004303", "name": "Transmisor VETS 1", "type": "Barometer", "serialNo": "W4831243", "kmmId": "TH-0043-03", "brand": "Vaisala", "model": "INDIGO520", "traceability": "EMA", "calLab": "Vaisala", "location": "VETS", "magnitude": "Transmisor corriente", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_th004401", "name": "Sensor Hum/Temp VETS 2", "type": "Humidity sensor", "serialNo": "W4917201", "kmmId": "TH-0044-01", "brand": "Vaisala", "model": "INDIGO520", "traceability": "EMA", "calLab": "Vaisala", "location": "VETS", "magnitude": "Hum y Temp", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_th004402", "name": "Barometro VETS 2", "type": "Thermometer", "serialNo": "W3850033", "kmmId": "TH-0044-02", "brand": "Vaisala", "model": "INDIGO520", "traceability": "EMA", "calLab": "Vaisala", "location": "VETS", "magnitude": "Presion", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_pr018", "name": "Propane Injection CFO", "type": "Propane injection", "serialNo": "7005035500", "kmmId": "PR-018", "brand": "Horiba", "model": "5102514973", "traceability": "ANAB", "calLab": "Horiba USA", "location": "CFO", "magnitude": "Flux", "lastCalDate": "2024-05-31", "nextCalDate": "2025-05-31", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_ot0038", "name": "Gas Divider", "type": "Gas Divider", "serialNo": "S2001362117000020", "kmmId": "OT-0038", "brand": "Horiba", "model": "ONE", "traceability": "ANAB", "calLab": "Horiba USA", "location": "GDC", "magnitude": "Flux", "lastCalDate": "2024-11-19", "nextCalDate": "2025-11-19", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_bubbler", "name": "Heater Bubbler", "type": "Heater bubbler", "serialNo": "8001005048", "kmmId": "", "brand": "Horiba", "model": "Heated Bubler", "traceability": "NIST", "calLab": "Horiba USA", "location": "Emission Room", "magnitude": "", "lastCalDate": "2024-06-19", "nextCalDate": "2025-06-19", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_th0036", "name": "Termopar RMT1", "type": "Thermocouple", "serialNo": "N/A", "kmmId": "TH-0036", "brand": "N/A", "model": "S1-8", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room RMT1", "magnitude": "Temperature", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_pr0017", "name": "Manometro RMT1", "type": "Pressure gauge", "serialNo": "N/A", "kmmId": "PR-0017", "brand": "ManoStar", "model": "WO801", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room RMT1", "magnitude": "Abs Pressure", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_pr0016", "name": "Manometro CVS Out", "type": "Pressure gauge", "serialNo": "N/A", "kmmId": "PR-0016", "brand": "ManoStar", "model": "WO81", "traceability": "EMA", "calLab": "CIDESI", "location": "CVS", "magnitude": "Abs Pressure", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_dyno_dw", "name": "Dinamometro Dead Weight", "type": "Dead Weight", "serialNo": "-", "kmmId": "", "brand": "A&G", "model": "CDE4200-002", "traceability": "T-EMA", "calLab": "Emissions Lab", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-03-01", "nextCalDate": "2026-03-01", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_dyno_roller_f", "name": "Dyno Roller Diameter Front", "type": "Roller diameter", "serialNo": "-", "kmmId": "OT-0032", "brand": "A&G", "model": "CDE 4200-002 Front", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room Dyno", "magnitude": "Dimensional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_dyno_roller_r", "name": "Dyno Roller Diameter Rear", "type": "Roller diameter", "serialNo": "-", "kmmId": "", "brand": "A&G", "model": "CDE 4200-002 Rear", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room Dyno", "magnitude": "Dimensional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_dyno_arm", "name": "Dyno Arm", "type": "Arm", "serialNo": "-", "kmmId": "", "brand": "A&G", "model": "CDE4200-002", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Dimensional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_dyno_speed_f", "name": "Dyno Angular Speed Front", "type": "Angular speed", "serialNo": "-", "kmmId": "OT-0037", "brand": "A&G", "model": "CDE 4200-002 Front", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Tachometer", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_dyno_torque_f", "name": "Dyno Torque Front", "type": "Torque", "serialNo": "-", "kmmId": "", "brand": "A&G", "model": "CDE 4200-002 Front", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Torque", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_dyno_torque_r", "name": "Dyno Torque Rear", "type": "Torque", "serialNo": "-", "kmmId": "", "brand": "A&G", "model": "CDE 4200-002 Rear", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Torque", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_th0020", "name": "Termometro FLUKE Lab", "type": "Thermometer", "serialNo": "30850092WS", "kmmId": "TH-0020", "brand": "FLUKE", "model": "52 II", "traceability": "EMA", "calLab": "CIDESI", "location": "Control Room", "magnitude": "Electrical", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_pr0002", "name": "Manometro Inspeccion", "type": "Pressure gauge", "serialNo": "PS 055 497", "kmmId": "PR-0002", "brand": "GRIPPER", "model": "SA-1U1A1E1J2", "traceability": "EMA", "calLab": "CIDESI", "location": "Inspection Room", "magnitude": "Pressure", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_mass_01", "name": "Dyno Mass 1", "type": "Mass", "serialNo": "1", "kmmId": "WE-0016-01", "brand": "A&G", "model": "-", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_mass_02", "name": "Dyno Mass 2", "type": "Mass", "serialNo": "2", "kmmId": "WE-0016-02", "brand": "A&G", "model": "-", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_mass_03", "name": "Dyno Mass 3", "type": "Mass", "serialNo": "3", "kmmId": "WE-0016-03", "brand": "A&G", "model": "-", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_mass_04", "name": "Dyno Mass 4", "type": "Mass", "serialNo": "4", "kmmId": "WE-0016-04", "brand": "A&G", "model": "-", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_mass_05", "name": "Dyno Mass 5", "type": "Mass", "serialNo": "5", "kmmId": "WE-0016-05", "brand": "A&G", "model": "-", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_mass_06", "name": "Dyno Mass 6", "type": "Mass", "serialNo": "6", "kmmId": "WE-0016-06", "brand": "A&G", "model": "-", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_mass_07", "name": "Dyno Mass 7", "type": "Mass", "serialNo": "7", "kmmId": "WE-0016-07", "brand": "A&G", "model": "-", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_mass_08", "name": "Dyno Mass 8", "type": "Mass", "serialNo": "8", "kmmId": "WE-0016-08", "brand": "A&G", "model": "-", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_mass_09", "name": "Dyno Mass 9", "type": "Mass", "serialNo": "9", "kmmId": "WE-0016-09", "brand": "A&G", "model": "-", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calFreq": "Anual", "critical": "Si"}, {"id": "eq_mass_10", "name": "Dyno Mass 10", "type": "Mass", "serialNo": "10", "kmmId": "WE-0016-10", "brand": "A&G", "model": "-", "traceability": "EMA", "calLab": "CIDESI", "location": "Emission Room", "magnitude": "Mass", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calFreq": "Anual", "critical": "Si"}];
        console.log('INV: Preloaded ' + invState.equipment.length + ' equipment');
    }
    // v16.5: el mapa dejó de ser un plano SVG editable — el layout manual ya no se usa
    if (invState.zoneLayout) delete invState.zoneLayout;
    invSave();
    _invMigrateF11();
}

// ══════════════════════════════════════════════════
// COP15-F11 — Plan Maestro de Mantenimiento y Calibración (v16.4)
// Seeds de la rev. 03 del formato oficial + migración única e idempotente.
// ══════════════════════════════════════════════════
var INV_ASSETS_SEED_F11 = [{"id": "E-001", "name": "HVAC", "lab": "Emisiones", "brand": "Kimo", "model": "Varios (ver Calibración)", "serialNo": "2F150708994", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-002", "name": "VETS", "lab": "Emisiones", "brand": "Vaisala", "model": "INDIGO520", "serialNo": "Varios", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-003", "name": "Clean Cham", "lab": "Emisiones", "brand": "Shynyei", "model": "Varios (ver Calibración)", "serialNo": "Varios", "status": "Activo", "notes": "", "blocksTesting": true}, {"id": "E-004", "name": "CFO", "lab": "Emisiones", "brand": "Horiba", "model": "5102514973", "serialNo": "7005035500", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-005", "name": "CPC-100", "lab": "Emisiones", "brand": "Horiba", "model": "CPC-100", "serialNo": "C100152302", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-006", "name": "Rack", "lab": "Emisiones", "brand": "Horiba", "model": "Rack con venturi", "serialNo": "69161", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-007", "name": "Venturi", "lab": "Emisiones", "brand": "Horiba", "model": "cilindro venturi", "serialNo": "69015", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-008", "name": "GDC", "lab": "Emisiones", "brand": "Horiba", "model": "ONE", "serialNo": "S2001362117000020", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-009", "name": "Bubbler", "lab": "Emisiones", "brand": "Horiba", "model": "Heated Bubler", "serialNo": "8001005048", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-010", "name": "RMT1-TS", "lab": "Emisiones", "brand": "", "model": "S1-8", "serialNo": "", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-011", "name": "Manometer 1", "lab": "Emisiones", "brand": "ManoStar", "model": "WO801", "serialNo": "", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-012", "name": "Manometer 2", "lab": "Emisiones", "brand": "ManoStar", "model": "WO81", "serialNo": "", "status": "Activo", "notes": "", "blocksTesting": false}, {"id": "E-013", "name": "Dynamometer", "lab": "Emisiones", "brand": "A&G", "model": "Varios (ver Calibración)", "serialNo": "Varios", "status": "Activo", "notes": "", "blocksTesting": true}, {"id": "E-014", "name": "Laboratorio", "lab": "Emisiones", "brand": "FLUKE", "model": "Varios (ver Calibración)", "serialNo": "Varios", "status": "Activo", "notes": "", "blocksTesting": false}];
var INV_CAL_SEED_F11 = [{"f11Id": "C-001", "assetId": "E-001", "name": "Thermometer HVAC", "type": "Thermometer", "magnitude": "Thermometer", "brand": "Kimo", "model": "TH210-B0SP", "serialNo": "2F150708994", "kmmId": "", "requiresCal": "No", "calType": "", "calFreq": "", "calLab": "", "traceability": "", "calPlace": "", "lastCalDate": "", "nextCalDate": "", "calCertNo": "", "rangeMax": "-20…+80°C", "rangeUse": "0…+50°C", "maxError": "± 0.25°C", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-002", "assetId": "E-001", "name": "Humidity sensor HVAC", "type": "Humidity sensor", "magnitude": "Humidity sensor", "brand": "Kimo", "model": "TH210-B0SP", "serialNo": "2F150708994", "kmmId": "", "requiresCal": "No", "calType": "", "calFreq": "", "calLab": "", "traceability": "", "calPlace": "", "lastCalDate": "", "nextCalDate": "", "calCertNo": "", "rangeMax": "0…100%HR", "rangeUse": "0…100%HR", "maxError": "± 1.5 %RH", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-003", "assetId": "E-001", "name": "Thermometer HVAC", "type": "Thermometer", "magnitude": "Thermometer", "brand": "Kimo", "model": "TH210B0SP", "serialNo": "", "kmmId": "TH-0033", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "METROLAB", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-02-21", "nextCalDate": "2026-02-21", "calCertNo": "T-2199-2023", "rangeMax": "-20…+80°C", "rangeUse": "0…+50°C", "maxError": "± 0.25°C", "location": "Soaking Room", "critical": "Si", "comments": ""}, {"f11Id": "C-004", "assetId": "E-001", "name": "Humidity sensor HVAC", "type": "Humidity sensor", "magnitude": "Humidity sensor", "brand": "Kimo", "model": "TH210B0SP", "serialNo": "", "kmmId": "TH-0033", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "METROLAB", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-02-21", "nextCalDate": "2026-02-21", "calCertNo": "H-0438-2023", "rangeMax": "0…100%HR", "rangeUse": "0…100%HR", "maxError": "± 1.5 %RH", "location": "Soaking Room", "critical": "Si", "comments": ""}, {"f11Id": "C-005", "assetId": "E-002", "name": "Barometer VETS", "type": "Barometer", "magnitude": "Barometer", "brand": "Vaisala", "model": "INDIGO520", "serialNo": "W4831243", "kmmId": "TH-0043-03", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "Vaisala", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calCertNo": "", "rangeMax": "0-20 mA / 0-10 V", "rangeUse": "95%", "maxError": "±0.004 mA /± 0.0002 V", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-006", "assetId": "E-002", "name": "Thermometer VETS", "type": "Thermometer", "magnitude": "Thermometer", "brand": "Vaisala", "model": "INDIGO520", "serialNo": "W3850023", "kmmId": "TH-0043-02", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "Vaisala", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calCertNo": "", "rangeMax": "500-1100hPa", "rangeUse": "95%", "maxError": "± 0.7hPa", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-007", "assetId": "E-002", "name": "Humidity sensor VETS", "type": "Humidity sensor", "magnitude": "Humidity sensor", "brand": "Vaisala", "model": "INDIGO520", "serialNo": "W4754750", "kmmId": "TH-0043-01", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "Vaisala", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calCertNo": "", "rangeMax": "0-100%HR/20°C", "rangeUse": "95%", "maxError": "± 0.5 %RH/0.10°C", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-008", "assetId": "E-002", "name": "Barometer VETS", "type": "Barometer", "magnitude": "Barometer", "brand": "Vaisala", "model": "INDIGO520", "serialNo": "W4831244", "kmmId": "TH-0044-03", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "Vaisala", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calCertNo": "", "rangeMax": "0-20 mA / 0-10 V", "rangeUse": "95%", "maxError": "±0.004 mA /± 0.0002 V", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-009", "assetId": "E-002", "name": "Thermometer VETS", "type": "Thermometer", "magnitude": "Thermometer", "brand": "Vaisala", "model": "INDIGO520", "serialNo": "W3850033", "kmmId": "TH-0044-02", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "Vaisala", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calCertNo": "", "rangeMax": "500-1100hPa", "rangeUse": "95%", "maxError": "± 0.7hPa", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-010", "assetId": "E-002", "name": "Humidity sensor VETS", "type": "Humidity sensor", "magnitude": "Humidity sensor", "brand": "Vaisala", "model": "INDIGO520", "serialNo": "W4917201", "kmmId": "TH-0044-01", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "Vaisala", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-05-01", "nextCalDate": "2026-05-01", "calCertNo": "", "rangeMax": "0-100%HR/20°C", "rangeUse": "95%", "maxError": "± 0.5 %RH/0.10°C", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-011", "assetId": "E-003", "name": "Humidity sensor Clean Cham", "type": "Humidity sensor", "magnitude": "Humidity sensor", "brand": "Shynyei", "model": "DewStar S-BS-4C", "serialNo": "", "kmmId": "", "requiresCal": "Si", "calType": "", "calFreq": "Anual", "calLab": "TECHMASTER", "traceability": "ANAB", "calPlace": "En sitio", "lastCalDate": "2018-03-16", "nextCalDate": "2019-03-16", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-012", "assetId": "E-003", "name": "Barometer Clean Cham", "type": "Barometer", "magnitude": "Barometer", "brand": "Vaisala", "model": "PTB330", "serialNo": "L2540408", "kmmId": "", "requiresCal": "No", "calType": "", "calFreq": "", "calLab": "", "traceability": "", "calPlace": "", "lastCalDate": "", "nextCalDate": "", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-013", "assetId": "E-003", "name": "Thermometer Clean Cham", "type": "Thermometer", "magnitude": "Thermometer", "brand": "Horiba", "model": "TH-0027 Clean Chamber", "serialNo": "K-150019C", "kmmId": "", "requiresCal": "Si", "calType": "", "calFreq": "Anual", "calLab": "CALMET", "traceability": "ILAC - MRA", "calPlace": "", "lastCalDate": "2017-11-17", "nextCalDate": "2018-11-17", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-014", "assetId": "E-003", "name": "Humidity sensor Clean Cham", "type": "Humidity sensor", "magnitude": "Humidity sensor", "brand": "Horiba", "model": "TH-0027 Clean Chamber", "serialNo": "K-150019C", "kmmId": "", "requiresCal": "No", "calType": "", "calFreq": "", "calLab": "", "traceability": "", "calPlace": "", "lastCalDate": "", "nextCalDate": "", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-015", "assetId": "E-003", "name": "Barometer Clean Cham", "type": "Barometer", "magnitude": "Barometer", "brand": "Horiba", "model": "TH-0027 Clean Chamber", "serialNo": "K-150019C", "kmmId": "", "requiresCal": "No", "calType": "", "calFreq": "", "calLab": "", "traceability": "", "calPlace": "", "lastCalDate": "", "nextCalDate": "", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-016", "assetId": "E-003", "name": "Bascula Digital Clean Cham", "type": "Bascula Digital", "magnitude": "Bascula Digital", "brand": "Mettler Toledo", "model": "XP2U", "serialNo": "B8601948655", "kmmId": "", "requiresCal": "Si", "calType": "Interna", "calFreq": "Anual", "calLab": "KIA Cal Lab", "traceability": "OIML", "calPlace": "En sitio", "lastCalDate": "2018-04-18", "nextCalDate": "2019-04-18", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-017", "assetId": "E-004", "name": "Propane injection CFO", "type": "Propane injection", "magnitude": "Propane injection", "brand": "Horiba", "model": "5102514973", "serialNo": "7005035500", "kmmId": "PR-018", "requiresCal": "Si", "calType": "Externa", "calFreq": "Bianual", "calLab": "Horiba USA", "traceability": "ANAB", "calPlace": "Externo USA", "lastCalDate": "2024-05-31", "nextCalDate": "2026-05-31", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "Si", "comments": "EN CALIBRACION"}, {"f11Id": "C-018", "assetId": "E-005", "name": "Particle counter CPC-100", "type": "Particle counter", "magnitude": "Particle counter", "brand": "Horiba", "model": "CPC-100", "serialNo": "C100152302", "kmmId": "", "requiresCal": "Si", "calType": "", "calFreq": "", "calLab": "Horiba USA", "traceability": "TSI", "calPlace": "Externo USA", "lastCalDate": "", "nextCalDate": "", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-019", "assetId": "E-006", "name": "Subsonic venturi Rack", "type": "Subsonic venturi", "magnitude": "Subsonic venturi", "brand": "Horiba", "model": "Rack con venturi", "serialNo": "69161", "kmmId": "", "requiresCal": "Si", "calType": "", "calFreq": "Bianual", "calLab": "Horiba USA", "traceability": "NVLAP", "calPlace": "", "lastCalDate": "2022-05-05", "nextCalDate": "2024-05-04", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-020", "assetId": "E-007", "name": "Subsonic venturi Venturi", "type": "Subsonic venturi", "magnitude": "Subsonic venturi", "brand": "Horiba", "model": "cilindro venturi", "serialNo": "69015", "kmmId": "", "requiresCal": "Si", "calType": "", "calFreq": "Bianual", "calLab": "Horiba USA", "traceability": "NVLAP", "calPlace": "", "lastCalDate": "2022-05-20", "nextCalDate": "2024-05-19", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-021", "assetId": "E-008", "name": "Gas Divider GDC", "type": "Gas Divider", "magnitude": "Gas Divider", "brand": "Horiba", "model": "ONE", "serialNo": "S2001362117000020", "kmmId": "OT-0038", "requiresCal": "Si", "calType": "Externa", "calFreq": "Bianual", "calLab": "Horiba USA", "traceability": "ANAB", "calPlace": "Externo USA", "lastCalDate": "2024-11-19", "nextCalDate": "2026-11-19", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "Si", "comments": "EN CALIBRACION"}, {"f11Id": "C-022", "assetId": "E-009", "name": "Heater bubbler Bubbler", "type": "Heater bubbler", "magnitude": "Heater bubbler", "brand": "Horiba", "model": "Heated Bubler", "serialNo": "8001005048", "kmmId": "", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "Horiba USA", "traceability": "NIST", "calPlace": "Externo USA", "lastCalDate": "2024-06-19", "nextCalDate": "2025-06-19", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-023", "assetId": "E-010", "name": "Thermocouple RMT1-TS", "type": "Thermocouple", "magnitude": "Thermocouple", "brand": "", "model": "S1-8", "serialNo": "", "kmmId": "TH-0036", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "En sitio", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "20 - 30°C", "rangeUse": "20 °C", "maxError": "0.01", "location": "Emission Room RMT1", "critical": "Si", "comments": ""}, {"f11Id": "C-024", "assetId": "E-011", "name": "RMT1 Manometer 1", "type": "RMT1", "magnitude": "RMT1", "brand": "ManoStar", "model": "WO801", "serialNo": "", "kmmId": "PR-0017", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "En sitio", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "50 - 500 Pa", "rangeUse": "70 kPa", "maxError": "1", "location": "Emission Room RMT1", "critical": "Si", "comments": ""}, {"f11Id": "C-025", "assetId": "E-012", "name": "CVS Out Manometer 2", "type": "CVS Out", "magnitude": "CVS Out", "brand": "ManoStar", "model": "WO81", "serialNo": "", "kmmId": "PR-0016", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "En sitio", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "3 - 30kPa", "rangeUse": "30 Kpa", "maxError": "1", "location": "Emission Room CVS", "critical": "Si", "comments": ""}, {"f11Id": "C-026", "assetId": "E-013", "name": "Cooling Fan Dynamometer", "type": "Cooling Fan", "magnitude": "Cooling Fan", "brand": "A&G", "model": "HS185KR209", "serialNo": "15F-496E13-001BFT", "kmmId": "", "requiresCal": "Si", "calType": "", "calFreq": "", "calLab": "CALMET", "traceability": "ILAC * MRA", "calPlace": "En sitio", "lastCalDate": "", "nextCalDate": "", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "No", "comments": ""}, {"f11Id": "C-027", "assetId": "E-013", "name": "Death Weight Dynamometer", "type": "Death Weight", "magnitude": "Death Weight", "brand": "A&G", "model": "CDE4200-002", "serialNo": "", "kmmId": "", "requiresCal": "Si", "calType": "Interna", "calFreq": "Anual", "calLab": "Emissions Lab", "traceability": "T-EMA", "calPlace": "En sitio", "lastCalDate": "2025-03-01", "nextCalDate": "2026-03-01", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-028", "assetId": "E-013", "name": "Roller diameter Dynamometer", "type": "Roller diameter", "magnitude": "Roller diameter", "brand": "A&G", "model": "CDE 4200-002 Front", "serialNo": "", "kmmId": "OT-0032", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "En sitio", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room Dyno", "critical": "Si", "comments": ""}, {"f11Id": "C-029", "assetId": "E-013", "name": "Roller diameter Dynamometer", "type": "Roller diameter", "magnitude": "Roller diameter", "brand": "A&G", "model": "CDE 4200-002 Rear", "serialNo": "", "kmmId": "", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "En sitio", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room Dyno", "critical": "", "comments": ""}, {"f11Id": "C-030", "assetId": "E-013", "name": "Arm Dynamometer", "type": "Arm", "magnitude": "Arm", "brand": "A&G", "model": "CDE4200-002", "serialNo": "", "kmmId": "", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "En sitio", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-031", "assetId": "E-013", "name": "Mass 1 Dynamometer", "type": "Mass 1", "magnitude": "Mass 1", "brand": "A&G", "model": "", "serialNo": "1", "kmmId": "WE-0016-01", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calCertNo": "", "rangeMax": "22.8kg 50 lb", "rangeUse": "22.8kg", "maxError": "+0.01g", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-032", "assetId": "E-013", "name": "Mass 2 Dynamometer", "type": "Mass 2", "magnitude": "Mass 2", "brand": "A&G", "model": "", "serialNo": "2", "kmmId": "WE-0016-02", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calCertNo": "", "rangeMax": "22.8kg 50 lb", "rangeUse": "22.8kg", "maxError": "+0.01g", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-033", "assetId": "E-013", "name": "Mass 3 Dynamometer", "type": "Mass 3", "magnitude": "Mass 3", "brand": "A&G", "model": "", "serialNo": "3", "kmmId": "WE-0016-03", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calCertNo": "", "rangeMax": "22.8kg 50 lb", "rangeUse": "22.8kg", "maxError": "+0.01g", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-034", "assetId": "E-013", "name": "Mass 4 Dynamometer", "type": "Mass 4", "magnitude": "Mass 4", "brand": "A&G", "model": "", "serialNo": "4", "kmmId": "WE-0016-04", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calCertNo": "", "rangeMax": "22.8kg 50 lb", "rangeUse": "22.8kg", "maxError": "+0.01g", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-035", "assetId": "E-013", "name": "Mass 5 Dynamometer", "type": "Mass 5", "magnitude": "Mass 5", "brand": "A&G", "model": "", "serialNo": "5", "kmmId": "WE-0016-05", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calCertNo": "", "rangeMax": "22.8kg 50 lb", "rangeUse": "22.8kg", "maxError": "+0.01g", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-036", "assetId": "E-013", "name": "Mass 6 Dynamometer", "type": "Mass 6", "magnitude": "Mass 6", "brand": "A&G", "model": "", "serialNo": "6", "kmmId": "WE-0016-06", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calCertNo": "", "rangeMax": "22.8kg 50 lb", "rangeUse": "22.8kg", "maxError": "+0.01g", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-037", "assetId": "E-013", "name": "Mass 7 Dynamometer", "type": "Mass 7", "magnitude": "Mass 7", "brand": "A&G", "model": "", "serialNo": "7", "kmmId": "WE-0016-07", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calCertNo": "", "rangeMax": "22.8kg 50 lb", "rangeUse": "22.8kg", "maxError": "+0.01g", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-038", "assetId": "E-013", "name": "Mass 8 Dynamometer", "type": "Mass 8", "magnitude": "Mass 8", "brand": "A&G", "model": "", "serialNo": "8", "kmmId": "WE-0016-08", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calCertNo": "", "rangeMax": "22.8kg 50 lb", "rangeUse": "22.8kg", "maxError": "+0.01g", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-039", "assetId": "E-013", "name": "Mass 9 Dynamometer", "type": "Mass 9", "magnitude": "Mass 9", "brand": "A&G", "model": "", "serialNo": "9", "kmmId": "WE-0016-09", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calCertNo": "", "rangeMax": "22.8kg 50 lb", "rangeUse": "22.8kg", "maxError": "+0.01g", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-040", "assetId": "E-013", "name": "Mass 10 Dynamometer", "type": "Mass 10", "magnitude": "Mass 10", "brand": "A&G", "model": "", "serialNo": "10", "kmmId": "WE-0016-10", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-09-18", "nextCalDate": "2026-09-18", "calCertNo": "", "rangeMax": "22.8kg 50 lb", "rangeUse": "22.8kg", "maxError": "+0.01g", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-041", "assetId": "E-013", "name": "D center to load cell Dynamometer", "type": "D center to load cell", "magnitude": "D center to load cell", "brand": "A&G", "model": "CDE 4200-002 Front", "serialNo": "", "kmmId": "", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-042", "assetId": "E-013", "name": "D center to load cell Dynamometer", "type": "D center to load cell", "magnitude": "D center to load cell", "brand": "A&G", "model": "CDE 4200-002 Rear", "serialNo": "", "kmmId": "", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-043", "assetId": "E-013", "name": "Angular speed Dynamometer", "type": "Angular speed", "magnitude": "Angular speed", "brand": "A&G", "model": "CDE 4200-002 Front", "serialNo": "", "kmmId": "OT-0037", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-044", "assetId": "E-013", "name": "Angular speed Dynamometer", "type": "Angular speed", "magnitude": "Angular speed", "brand": "A&G", "model": "CDE 4200-002 Rear", "serialNo": "", "kmmId": "", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-045", "assetId": "E-013", "name": "Torque Dynamometer", "type": "Torque", "magnitude": "Torque", "brand": "A&G", "model": "CDE 4200-002 Front", "serialNo": "", "kmmId": "", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-046", "assetId": "E-013", "name": "Torque Dynamometer", "type": "Torque", "magnitude": "Torque", "brand": "A&G", "model": "CDE 4200-002 Rear", "serialNo": "", "kmmId": "", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Emission Room", "critical": "Si", "comments": ""}, {"f11Id": "C-047", "assetId": "E-014", "name": "Thermometer Laboratorio", "type": "Thermometer", "magnitude": "Thermometer", "brand": "FLUKE", "model": "52 II", "serialNo": "30850092WS", "kmmId": "TH-0020", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Control Room", "critical": "Si", "comments": ""}, {"f11Id": "C-048", "assetId": "E-014", "name": "Pressure gauge Laboratorio", "type": "Pressure gauge", "magnitude": "Pressure gauge", "brand": "GRIPPER", "model": "SA-1U1A1E1J2", "serialNo": "PS 055 497", "kmmId": "PR-0002", "requiresCal": "Si", "calType": "Externa", "calFreq": "Anual", "calLab": "CIDESI", "traceability": "EMA", "calPlace": "Externo Nacional", "lastCalDate": "2025-10-07", "nextCalDate": "2026-10-07", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Inspection Room", "critical": "Si", "comments": ""}, {"f11Id": "C-049", "assetId": "E-014", "name": "Thermometer Laboratorio", "type": "Thermometer", "magnitude": "Thermometer", "brand": "TRUPER", "model": "METE-500", "serialNo": "", "kmmId": "", "requiresCal": "No", "calType": "", "calFreq": "", "calLab": "", "traceability": "", "calPlace": "", "lastCalDate": "", "nextCalDate": "", "calCertNo": "", "rangeMax": "", "rangeUse": "", "maxError": "", "location": "Control Room", "critical": "No", "comments": ""}];
var INV_MTTO_ACT_SEED_F11 = [{"id": "A-01", "assetId": "E-013", "desc": "Limpieza (soplado)", "freq": "Mensual", "startWeek": 2, "responsible": "Técnico", "active": true}, {"id": "A-02", "assetId": "E-001", "desc": "Inspección general de filtros", "freq": "Trimestral", "startWeek": 1, "responsible": "Técnico", "active": true}, {"id": "A-03", "assetId": "E-003", "desc": "Reemplazo (componentes)", "freq": "Semestral", "startWeek": 26, "responsible": "General", "active": true}];
// invState.equipment[].id (legado) -> f11Id (C-xxx) de los 31 instrumentos ya capturados
var INV_F11_LEGACY_MAP = {"eq_th0033": "C-003", "eq_th004303": "C-005", "eq_th004302": "C-006", "eq_th004301": "C-007", "eq_th004402": "C-009", "eq_th004401": "C-010", "eq_pr018": "C-017", "eq_ot0038": "C-021", "eq_bubbler": "C-022", "eq_th0036": "C-023", "eq_pr0017": "C-024", "eq_pr0016": "C-025", "eq_dyno_dw": "C-027", "eq_dyno_roller_f": "C-028", "eq_dyno_roller_r": "C-029", "eq_dyno_arm": "C-030", "eq_dyno_torque_f": "C-045", "eq_dyno_torque_r": "C-046", "eq_th0020": "C-047", "eq_pr0002": "C-048", "eq_mass_01": "C-031", "eq_mass_02": "C-032", "eq_mass_03": "C-033", "eq_mass_04": "C-034", "eq_mass_05": "C-035", "eq_mass_06": "C-036", "eq_mass_07": "C-037", "eq_mass_08": "C-038", "eq_mass_09": "C-039", "eq_mass_10": "C-040", "eq_dyno_speed_f": "C-043"};

function _invMigrateF11() {
    if (invState.f11Seed >= 3) return;
    var linked = 0, created = 0;

    if (!invState.assets || invState.assets.length === 0) {
        invState.assets = JSON.parse(JSON.stringify(INV_ASSETS_SEED_F11));
    }

    var f11ByLegacy = {};
    Object.keys(INV_F11_LEGACY_MAP).forEach(function(lid) { f11ByLegacy[INV_F11_LEGACY_MAP[lid]] = lid; });

    var byF11Id = {}, byKmm = {}, bySerial = {};
    invState.equipment.forEach(function(eq) {
        if (eq.f11Id) byF11Id[eq.f11Id] = eq;
        if (eq.kmmId) byKmm[eq.kmmId] = eq;
        if (eq.serialNo && eq.serialNo !== 'N/A' && eq.serialNo !== '-' && eq.serialNo !== 'Varios') bySerial[eq.serialNo] = eq;
    });

    INV_CAL_SEED_F11.forEach(function(seed) {
        var legacyId = f11ByLegacy[seed.f11Id];
        var target = byF11Id[seed.f11Id]
            || (legacyId ? invState.equipment.find(function(e) { return e.id === legacyId; }) : null)
            || (seed.kmmId ? byKmm[seed.kmmId] : null)
            || (seed.serialNo ? bySerial[seed.serialNo] : null);

        if (target) {
            // Consumir el objetivo de los mapas de respaldo: dos filas de Calibración pueden
            // compartir KMM ID/serie (un mismo instrumento físico mide dos magnitudes, p.ej.
            // TH-0033 = termómetro + higrómetro) — sin esto, la segunda fila reclamaría de
            // nuevo el mismo equipo ya enlazado en vez de darse de alta como registro propio.
            if (target.kmmId && byKmm[target.kmmId] === target) delete byKmm[target.kmmId];
            if (target.serialNo && bySerial[target.serialNo] === target) delete bySerial[target.serialNo];
            target.f11Id = seed.f11Id;
            if (!target.assetId) target.assetId = seed.assetId;
            Object.keys(seed).forEach(function(k) {
                if (k === 'f11Id' || k === 'assetId') return;
                if (target[k] === undefined || target[k] === null || target[k] === '') target[k] = seed[k];
            });
            if (!target.calHistory) target.calHistory = [];
            byF11Id[seed.f11Id] = target;
            linked++;
        } else {
            var neu = JSON.parse(JSON.stringify(seed));
            neu.id = 'eq_f11_' + seed.f11Id.toLowerCase().replace('-', '');
            neu.status = 'active';
            neu.calHistory = [];
            invState.equipment.push(neu);
            created++;
        }
    });

    if (!invState.maintActivities || invState.maintActivities.length === 0) {
        invState.maintActivities = JSON.parse(JSON.stringify(INV_MTTO_ACT_SEED_F11));
    }

    invState.f11Seed = 3;
    invSave();
    if (typeof auditLog === 'function') auditLog('inv', 'f11_migrado', { type: 'equipment', label: 'COP15-F11 rev03' }, linked + ' enlazados, ' + created + ' nuevos');
    console.log('INV: F11 migrado — ' + linked + ' enlazados, ' + created + ' nuevos');
}

// ══════════════════════════════════════════════════
// COP15-F11 — Derivadas de calibración y mantenimiento (una sola definición cada una)
// ══════════════════════════════════════════════════

// Estatus de calibración de un instrumento — semáforo del F11 (umbral 60 días).
function invCalStatus(eq) {
    if (!eq) return { code: 'noaplica', days: null, color: '#94a3b8', label: 'N/A' };
    if (eq.requiresCal === 'No') return { code: 'noaplica', days: null, color: '#94a3b8', label: 'No aplica' };
    if (!eq.nextCalDate) return { code: 'sinregistro', days: null, color: '#64748b', label: 'Sin registro' };
    var days = Math.round((new Date(eq.nextCalDate + 'T00:00:00') - new Date(localToday() + 'T00:00:00')) / 86400000);
    if (days < 0) return { code: 'vencido', days: days, color: '#ef4444', label: 'Vencido ' + Math.abs(days) + 'd' };
    if (days <= 60) return { code: 'porvencer', days: days, color: '#f59e0b', label: 'Vence en ' + days + 'd' };
    return { code: 'vigente', days: days, color: '#10b981', label: 'Vigente ' + days + 'd' };
}

// Próxima fecha de calibración a partir de la última y la frecuencia (hoja Listas).
function invCalNextDate(lastISO, freq) {
    if (!lastISO) return '';
    var days = INV_CAL_FREQ_DAYS[freq] || 365;
    var d = new Date(lastISO + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Réplica viva de la hoja Dashboard del F11 (sección Calibración).
function invCalSummary() {
    var total = invState.equipment.length, requiere = 0, vigentes = 0, porVencer = 0, vencidos = 0, sinRegistro = 0;
    invState.equipment.forEach(function(eq) {
        if (eq.requiresCal === 'No') return;
        requiere++;
        var st = invCalStatus(eq);
        if (st.code === 'vigente') vigentes++;
        else if (st.code === 'porvencer') porVencer++;
        else if (st.code === 'vencido') vencidos++;
        else if (st.code === 'sinregistro') sinRegistro++;
    });
    var pct = requiere > 0 ? Math.round((vigentes / requiere) * 1000) / 10 : 0;
    return { total: total, requiere: requiere, vigentes: vigentes, porVencer: porVencer, vencidos: vencidos, sinRegistro: sinRegistro, pct: pct };
}

// Semana del año (1-52), partición simple estilo Excel WEEKNUM (semana 1 = la que contiene el 1-ene).
// Límite conocido: el lunes de la semana 1 puede caer en diciembre del año anterior (p.ej. si el
// 1-ene es jueves); invWeekOfYear sobre esa fecha usará el año calendario de diciembre, no el de la
// matriz. Afecta como mucho la última semana de diciembre / primera de enero — sin impacto el resto del año.
function invWeekOfYear(dateISO) {
    var d = new Date(dateISO + 'T00:00:00');
    var year = d.getFullYear();
    var jan1 = new Date(year, 0, 1);
    var jan1MonOffset = (jan1.getDay() + 6) % 7; // 0 = jan1 es lunes
    var daysSinceJan1 = Math.round((d - jan1) / 86400000);
    var week = Math.floor((daysSinceJan1 + jan1MonOffset) / 7) + 1;
    if (week < 1) week = 1;
    if (week > 52) week = 52;
    return week;
}
// Lunes (ISO date string) de la semana N de un año, inverso de invWeekOfYear.
function invMondayOfWeek(year, week) {
    var jan1 = new Date(year, 0, 1);
    var jan1MonOffset = (jan1.getDay() + 6) % 7;
    var firstMonday = new Date(year, 0, 1 - jan1MonOffset);
    var monday = new Date(firstMonday);
    monday.setDate(firstMonday.getDate() + (week - 1) * 7);
    return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
}

// Semanas planeadas (1-52) de una actividad de mantenimiento según su frecuencia.
function invMaintWeeksFor(act, year) {
    var weeks = [];
    var freqW = INV_MTTO_FREQ_WEEKS[act.freq] || 4;
    var w = act.startWeek || 1;
    while (w <= 52) { weeks.push(w); w += freqW; }
    return weeks;
}

// Matriz de 52 semanas del Plan Maestro — SIEMPRE calculada, nunca guardada.
function invMaintMatrix(year) {
    var acts = (invState.maintActivities || []).filter(function(a) { return a.active !== false; });
    var log = invState.maintLog || [];
    var curYear = new Date().getFullYear();
    var curWeek = invWeekOfYear(localToday());
    return acts.map(function(act) {
        var asset = (invState.assets || []).find(function(a) { return a.id === act.assetId; });
        var plannedWeeks = invMaintWeeksFor(act, year);
        var doneWeeks = {};
        log.forEach(function(l) {
            if (l.activityId === act.id && l.date && l.date.slice(0, 4) === String(year)) doneWeeks[invWeekOfYear(l.date)] = true;
        });
        var weeks = [];
        for (var n = 1; n <= 52; n++) {
            var planned = plannedWeeks.indexOf(n) >= 0;
            var done = !!doneWeeks[n];
            var overdue = planned && !done && (year < curYear || (year === curYear && n < curWeek));
            weeks.push({ n: n, planned: planned, done: done, overdue: overdue });
        }
        return { act: act, asset: asset, weeks: weeks };
    });
}

// Cumplimiento de mantenimiento — réplica viva de la hoja Dashboard del F11.
function invMaintCompliance(year) {
    var matrix = invMaintMatrix(year);
    var planned = 0, doneOnWeek = 0, byAsset = {};
    matrix.forEach(function(row) {
        var assetName = row.asset ? row.asset.name : (row.act.assetId || '?');
        if (!byAsset[assetName]) byAsset[assetName] = { name: assetName, plan: 0, real: 0 };
        row.weeks.forEach(function(w) {
            if (w.planned) { planned++; byAsset[assetName].plan++; }
            if (w.planned && w.done) { doneOnWeek++; byAsset[assetName].real++; }
        });
    });
    var logged = (invState.maintLog || []).filter(function(l) { return l.date && l.date.slice(0, 4) === String(year); }).length;
    var pct = planned > 0 ? Math.round((doneOnWeek / planned) * 1000) / 10 : 0;
    var byAssetArr = Object.keys(byAsset).map(function(k) {
        var b = byAsset[k];
        b.pct = b.plan > 0 ? Math.round((b.real / b.plan) * 1000) / 10 : null;
        return b;
    });
    return { planned: planned, doneOnWeek: doneOnWeek, logged: logged, pct: pct, byAsset: byAssetArr };
}

// Mantenimientos programados para la semana actual y aún no marcados.
function invMaintDueThisWeek() {
    var year = new Date().getFullYear();
    var curWeek = invWeekOfYear(localToday());
    var matrix = invMaintMatrix(year);
    var result = [];
    matrix.forEach(function(row) {
        var wk = row.weeks[curWeek - 1];
        if (wk && wk.planned && !wk.done) result.push({ act: row.act, asset: row.asset, week: curWeek });
    });
    return result;
}

// Actividades con semanas planeadas ya pasadas y sin registrar (una fila por actividad).
function invMaintOverdue() {
    var year = new Date().getFullYear();
    var matrix = invMaintMatrix(year);
    var result = [];
    matrix.forEach(function(row) {
        var overdueWeeks = row.weeks.filter(function(w) { return w.overdue; }).map(function(w) { return w.n; });
        if (overdueWeeks.length > 0) {
            result.push({ act: row.act, asset: row.asset, weeks: overdueWeeks, count: overdueWeeks.length, lastWeek: overdueWeeks[overdueWeeks.length - 1] });
        }
    });
    return result;
}

// Actividades planeadas para la semana de un lunes dado (integración con Plan → Disponibilidad).
function invMaintPlannedForWeek(mondayISO) {
    var d = new Date(mondayISO + 'T00:00:00');
    var year = d.getFullYear();
    var week = invWeekOfYear(mondayISO);
    var matrix = invMaintMatrix(year);
    var result = [];
    matrix.forEach(function(row) {
        var wk = row.weeks[week - 1];
        if (wk && wk.planned) result.push({ act: row.act, asset: row.asset, week: week });
    });
    return result;
}

// Registrar un mantenimiento ejecutado — un toque desde HOY, Mantenimiento o el Plan Maestro.
function invMaintMarkDone(activityId, opts) {
    opts = opts || {};
    var act = (invState.maintActivities || []).find(function(a) { return a.id === activityId; });
    if (!act) { if (typeof showToast === 'function') showToast('Actividad no encontrada', 'error'); return null; }
    var by = opts.by || ((typeof authState !== 'undefined' && authState.currentUser && authState.currentUser.name) || 'Laboratorio');
    var entry = {
        id: invGenId(), date: opts.date || localToday(), assetId: act.assetId, activityId: activityId,
        by: by, hours: opts.hours || null, comments: opts.comments || '', createdAt: new Date().toISOString()
    };
    invState.maintLog.push(entry);
    invSave();
    if (typeof auditLog === 'function') auditLog('inv', 'mtto_ejecutado', { type: 'maintenance', id: activityId, label: act.desc }, by + (entry.comments ? ' — ' + entry.comments : ''));
    if (typeof showToast === 'function') showToast('Mantenimiento registrado', 'success');
    return entry;
}

// Registrar una calibración — dos toques: fecha + certificado; calcula la próxima fecha sola.
function invCalRegister(eqId, opts) {
    opts = opts || {};
    var eq = invState.equipment.find(function(e) { return e.id === eqId; });
    if (!eq) { if (typeof showToast === 'function') showToast('Instrumento no encontrado', 'error'); return null; }
    var date = opts.date || localToday();
    var certNo = opts.certNo || '';
    var provider = opts.provider || eq.calLab || '';
    eq.lastCalDate = date;
    eq.calCertNo = certNo;
    if (provider) eq.calLab = provider;
    eq.nextCalDate = invCalNextDate(date, eq.calFreq);
    if (!eq.calHistory) eq.calHistory = [];
    eq.calHistory.push({ date: date, certNo: certNo, provider: provider, by: (typeof authState !== 'undefined' && authState.currentUser && authState.currentUser.name) || 'Laboratorio', at: new Date().toISOString() });
    invSave();
    if (typeof auditLog === 'function') auditLog('inv', 'calibracion_registrada', { type: 'equipment', id: eqId, label: eq.name }, 'Cert: ' + (certNo || '-') + ' · próxima: ' + eq.nextCalDate);
    if (typeof fbPostCalibration === 'function') fbPostCalibration(eq.name);
    if (typeof showToast === 'function') showToast('Calibración registrada', 'success');
    return eq;
}


var _invTabs = ['inv-dashboard','inv-gases','inv-equipment','inv-maint','inv-readings','inv-predict','inv-fuel','inv-zonemap','inv-charts','inv-config','inv-report','inv-trace'];

// [v17.3] #invModal es reutilizado por ~20 funciones distintas (invShowAddGas,
// invAddEquipment, invShowZoneModal, invAddMaintActivity, escáner de código de barras...)
// que lo abren/cierran fijando `style.display` directo, sin pasar por una función común.
// En vez de tocar cada uno de esos cierres, se observa el propio contenedor: cuando se hace
// visible se activa a11yDialog (trampa de foco + Escape + devuelve el foco), y cuando se
// oculta — sin importar qué botón lo haya hecho — se libera el listener de teclado.
(function () {
    var modal = document.getElementById('invModal');
    if (!modal || typeof a11yDialog !== 'function') return;
    var closeFn = null;
    var guard = false;
    function isVisible() {
        var d = modal.style.display;
        return !!d && d !== 'none';
    }
    var mo = new MutationObserver(function () {
        if (guard) return;
        var visible = isVisible();
        if (visible && !closeFn) {
            closeFn = a11yDialog(modal, { onClose: function () {
                guard = true;
                modal.style.display = 'none';
                guard = false;
            }});
        } else if (!visible && closeFn) {
            var fn = closeFn; closeFn = null;
            guard = true;
            fn();
            guard = false;
        }
    });
    mo.observe(modal, { attributes: true, attributeFilter: ['style'] });
})();

function invSwitchTab(tabId) {
    invState.activeTab = tabId;
    localStorage.setItem('kia_inv_activeTab', tabId);
    document.querySelectorAll('#inv-tabs-bar .tp-tab').forEach(function(b){b.classList.remove('active');});
    // Resaltar el botón por su tabId (robusto en llamadas programáticas como dashGo,
    // donde el `event` global no corresponde al tab). event.target solo de respaldo.
    var targetBtn = document.querySelector('#inv-tabs-bar .tp-tab[onclick*="' + tabId + '"]');
    if (targetBtn) targetBtn.classList.add('active');
    else if (typeof event !== 'undefined' && event && event.target && event.target.classList && event.target.classList.contains('tp-tab')) event.target.classList.add('active');
    if (typeof a11yTablist === 'function') a11yTablist(document.getElementById('inv-tabs-bar'));
    if (typeof a11yTablistSync === 'function') {
        a11yTablistSync(document.getElementById('inv-tabs-bar'), targetBtn || document.querySelector('#inv-tabs-bar .tp-tab.active'));
    }
    invRender();
}
function invRestoreTab() {
    var saved = localStorage.getItem('kia_inv_activeTab');
    if (saved) { invSwitchTab(saved); }
    else if (typeof invRender === 'function') { invRender(); } // sin tab guardado: render del tab por defecto (no dejar en blanco)
}

// Proactive alerts on module open (runs once per session)
var _invAlertShown = false;
function invCheckProactiveAlerts() {
    if (_invAlertShown) return;
    _invAlertShown = true;
    var criticals = [];
    invState.gases.forEach(function(g) {
        if (invGasExpiry(g).status === 'expired') criticals.push(g.formula + ' #' + g.controlNo + ' VENCIDO');
        if (invGasLevel(g).pct < 10 && invGasLevel(g).pct >= 0) criticals.push(g.formula + ' #' + g.controlNo + ' nivel critico');
    });
    invState.equipment.forEach(function(e) {
        if (!e.nextCalDate) return;
        var diff = Math.round((new Date(e.nextCalDate) - new Date()) / (1000*60*60*24));
        if (diff < 0) criticals.push(e.name + ' calibracion vencida');
    });
    if (criticals.length > 0) {
        showToast(criticals.length + ' alertas criticas en inventario', 'error');
    }
}

function _invGetRenderer(tabId) {
    if (tabId === 'inv-dashboard') return invRenderDashboard;
    if (tabId === 'inv-gases') return invRenderGases;
    if (tabId === 'inv-equipment') return invRenderEquipment;
    if (tabId === 'inv-maint') return invRenderMaint;
    if (tabId === 'inv-readings') return invRenderReadings;
    if (tabId === 'inv-predict') return invRenderPredict;
    if (tabId === 'inv-fuel') return invRenderFuel;
    if (tabId === 'inv-zonemap') return invRenderZoneMap;
    if (tabId === 'inv-charts') return invRenderCharts;
    if (tabId === 'inv-config') return invRenderConfig;
    if (tabId === 'inv-report') return invRenderReport;
    if (tabId === 'inv-trace') return invRenderTrace;
    return null;
}

function invRender() {
    if (!document.getElementById('inv-content')) return;
    if (!_tabCache['inv']) tabCacheInit('inv', _invTabs);
    invCheckProactiveAlerts();
    var tab = invState.activeTab;
    var renderer = _invGetRenderer(tab);
    if (renderer) tabCacheSwitch('inv', tab, renderer);
    // v16.0: banners/tooltips de ayuda — tabCacheSwitch puede diferir el render real a un RAF
    if (typeof cascadeInjectTooltipsDeferred === 'function') cascadeInjectTooltipsDeferred();
    if (typeof helpInjectBannerDeferred === 'function') helpInjectBannerDeferred('inv', tab);
    // [v17.3] Mismo problema de RAF diferido: los <div onclick> de la pestaña activa
    // (mapa de zonas, tarjetas de equipo/mantenimiento) necesitan quedar alcanzables
    // por teclado sin importar qué pestaña se acabe de renderizar.
    if (typeof a11yClickables === 'function') {
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var content = document.getElementById('inv-content');
                if (content) a11yClickables(content);
            });
        });
    }
}

function invUpdateBadges() {
    var b = document.getElementById('inv-count-badge');
    if (b) b.textContent = invState.gases.length + ' gases' + ((invState.fuelTanks||[]).length > 0 ? ', ' + invState.fuelTanks.length + ' tambos' : '');
    // Expiration alert badge on platform tab
    var expired = invState.gases.filter(function(g){ return invGasExpiry(g).status === 'expired'; }).length;
    var warning = invState.gases.filter(function(g){ return invGasExpiry(g).status === 'warning'; }).length;
    var alertCount = expired + warning;
    var alertBadge = document.getElementById('inv-alert-badge');
    if (alertBadge) {
        if (alertCount > 0) {
            alertBadge.textContent = alertCount;
            alertBadge.style.display = 'inline-block';
            alertBadge.style.background = expired > 0 ? '#ef4444' : '#f59e0b';
        } else {
            alertBadge.style.display = 'none';
        }
    }
}

function invGenId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// Generate unique barcode serial: KIA-YYYYMMDD-XXXX (deterministic from controlNo, or unique for new)
function invGenerateSerial(controlNo) {
    // Format: KIA-{date}-{seq} where seq is a 4-char alphanumeric from controlNo hash
    var hash = 0;
    var str = controlNo + 'kia-emlab';
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    var hex = Math.abs(hash).toString(36).toUpperCase().slice(0, 4);
    while (hex.length < 4) hex = '0' + hex;
    // Check for collisions with existing serials
    var serial = 'KIA-' + controlNo.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() + '-' + hex;
    var existing = invState.gases.map(function(g) { return g.barcode; });
    if (existing.indexOf(serial) >= 0) {
        // Add random suffix to break collision
        serial += Math.random().toString(36).slice(2, 4).toUpperCase();
    }
    return serial;
}

function invAutoControlNo() {
    var today = localToday().replace(/-/g,'');
    var todayCount = invState.gases.filter(function(g){ return g.controlNo && g.controlNo.startsWith(today); }).length;
    return today + '-' + String(todayCount + 1).padStart(2,'0');
}

// v16.5: autollenado — primera posición libre (menor interacción al dar de alta un cilindro)
function _invNextFreeSlot() {
    for (var zi = 0; zi < invState.zones.length; zi++) {
        var z = invState.zones[zi];
        for (var i = 1; i <= z.slots; i++) {
            var code = z.id + (i < 10 ? '0' : '') + i;
            if (!invState.gases.some(function(g) { return g.zone === code; })) return code;
        }
    }
    return '';
}
// v16.5: autollenado — trazabilidad/proveedor del último cilindro dado de alta
function _invLastGasTraceSupplier() {
    if (!invState.gases.length) return { traceability: 'EPA', supplier: '' };
    var last = invState.gases[invState.gases.length - 1];
    return { traceability: last.traceability || 'EPA', supplier: last.supplier || '' };
}

// Gas status helpers
function invGasExpiry(g) {
    if (!g.validUntil) return {status:'unknown',text:'Sin fecha',days:0,color:'#94a3b8'};
    var now = new Date(); var exp = new Date(g.validUntil);
    var days = Math.round((exp - now) / (1000*60*60*24));
    if (days < 0) return {status:'expired',text:'Vencido hace ' + Math.abs(days) + 'd',days:days,color:'#ef4444'};
    if (days < 30) return {status:'warning',text:'Vence en ' + days + 'd',days:days,color:'#f59e0b'};
    return {status:'ok',text:'Vigente ' + days + 'd',days:days,color:'#10b981'};
}

function invGasLevel(g) {
    if (!g.readings || g.readings.length === 0) return {pct:100,text:'Sin lecturas',color:'#94a3b8'};
    var last = g.readings[g.readings.length-1];
    var first = g.readings[0];
    var pct = first.psi > 0 ? Math.round((last.psi / first.psi) * 100) : 0;
    if (pct > 100) pct = 100;
    if (pct < 0) pct = 0;
    if (pct < 15) return {pct:pct,text:last.psi + ' psi (' + pct + '%)',color:'#ef4444'};
    if (pct < 30) return {pct:pct,text:last.psi + ' psi (' + pct + '%)',color:'#f59e0b'};
    return {pct:pct,text:last.psi + ' psi (' + pct + '%)',color:'#10b981'};
}

// Daily reading status for the reception dashboard ("Hoy").
// Returns { inUseTotal, capturedToday, daysSinceLast } — null-safe even if
// the inventory module / localStorage has not been initialized yet.
function invReadingStatusToday() {
    var safe = { inUseTotal: 0, capturedToday: 0, daysSinceLast: null };
    if (typeof invState === 'undefined' || !invState) return safe;
    var todayISO = localToday();
    var inUse = (invState.gases || []).filter(function(g){ return g.status !== 'Empty'; });
    var capturedToday = inUse.filter(function(g){
        return g.readings && g.readings.length && g.readings[g.readings.length-1].date === todayISO;
    }).length;

    // Most recent reading date: prefer lastReadingDate, else scan readings.
    var lastDate = invState.lastReadingDate || null;
    if (!lastDate) {
        (invState.gases || []).forEach(function(g){
            (g.readings || []).forEach(function(r){ if (r.date && (!lastDate || r.date > lastDate)) lastDate = r.date; });
        });
        (invState.fuelTanks || []).forEach(function(t){
            (t.readings || []).forEach(function(r){ if (r.date && (!lastDate || r.date > lastDate)) lastDate = r.date; });
        });
    }
    var daysSinceLast = null;
    if (lastDate) {
        var diff = (new Date(todayISO) - new Date(lastDate)) / 86400000;
        daysSinceLast = Math.max(0, Math.round(diff));
    }
    return { inUseTotal: inUse.length, capturedToday: capturedToday, daysSinceLast: daysSinceLast };
}

// ══════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════
function invRenderDashboard(el) {
    var gases = invState.gases;
    var equip = invState.equipment;
    var expired = gases.filter(function(g){ return invGasExpiry(g).status === 'expired'; }).length;
    var warning = gases.filter(function(g){ return invGasExpiry(g).status === 'warning'; }).length;
    var lowLevel = gases.filter(function(g){ return invGasLevel(g).pct < 20; }).length;
    var eqExpired = equip.filter(function(e){ var d = new Date(e.nextCalDate); return d < new Date(); }).length;
    var eqWarn = equip.filter(function(e){ var d = new Date(e.nextCalDate); var diff = (d - new Date())/(1000*60*60*24); return diff > 0 && diff < 30; }).length;

    var html = '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button class="tp-btn tp-btn-ghost" onclick="switchPlatform(\'panel\');if(typeof pnSwitchTab===\'function\')pnSwitchTab(\'pn-dashboard\');" style="font-size: var(--fs-xs);" title="Resumen cross-módulo del laboratorio">📊 Ver Resumen del Lab →</button></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;margin-bottom:12px;">';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">' + gases.length + '</div><div class="tp-metric-label">Cilindros</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">' + expired + '</div><div class="tp-metric-label">Vencidos</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">' + warning + '</div><div class="tp-metric-label"><30 dias</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--danger-text)">' + lowLevel + '</div><div class="tp-metric-label">Nivel bajo</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">' + equip.length + '</div><div class="tp-metric-label">Equipos</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (eqExpired > 0 ? 'var(--tp-red)' : 'var(--tp-green)') + '">' + eqExpired + '</div><div class="tp-metric-label">Cal. vencida</div></div>';
    html += '</div>';

    // v15.9: Consumo proyectado (modelo aprendido) — ¿alcanza para las pruebas pendientes?
    var forecast = (typeof invForecastGasNeeds === 'function') ? invForecastGasNeeds() : [];
    if (forecast.length > 0) {
        html += '<div class="tp-card" style="border-left:3px solid ' + (forecast.some(function(f) { return f.severidad === 'critical'; }) ? 'var(--tp-red)' : 'var(--tp-amber)') + ';">';
        html += '<div class="tp-card-title"><span>⛽ Consumo proyectado — faltantes</span>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invSwitchTab(\'inv-predict\')" style="font-size: var(--fs-xs);">Ver predicción</button></div>';
        forecast.slice(0, 5).forEach(function(f) {
            var color = f.severidad === 'critical' ? 'var(--tp-red)' : 'var(--tp-amber)';
            html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;">';
            html += '<span style="font-size:13px;">' + (f.kind === 'fuel' ? '⛽' : '🧪') + '</span>';
            html += '<div style="flex:1;"><div style="font-weight:700;font-size: var(--fs-sm);">' + f.name + ' <span style="font-weight:400;color:var(--tp-dim);">(' + (f.scope === 'semana' ? 'esta semana' : 'plan completo') + ')</span></div>';
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Requerido ~' + f.requerido + ' ' + f.unit + ' para ' + f.pruebasPend + ' pruebas · disponible ' + f.disponible + '</div></div>';
            html += '<div style="font-weight:800;font-size: var(--fs-sm);color:' + color + ';">−' + f.deficit + ' ' + f.unit + '</div>';
            html += '</div>';
        });
        html += '</div>';
    }

    // Top 3 cilindros a reponer (menor nivel)
    var refill = gases.filter(function(g){ return g.status !== 'Empty'; })
        .map(function(g){ return { g: g, lvl: invGasLevel(g) }; })
        .filter(function(x){ return x.lvl.pct >= 0; })
        .sort(function(a,b){ return a.lvl.pct - b.lvl.pct; })
        .slice(0, 3);
    if (refill.length > 0) {
        html += '<div class="tp-card"><div class="tp-card-title"><span>🔻 Top 3 a Reponer</span>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invSwitchTab(\'inv-readings\')" style="font-size: var(--fs-xs);">Capturar</button></div>';
        refill.forEach(function(x){
            html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;">';
            html += '<div style="flex:1;"><div style="font-weight:700;font-size: var(--fs-sm);">' + x.g.formula + ' #' + x.g.controlNo + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + (x.g.zone||'?') + ' · ' + x.lvl.text + '</div></div>';
            html += '<div style="min-width:70px;"><div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;"><div style="height:100%;width:' + Math.max(2, x.lvl.pct) + '%;background:' + x.lvl.color + ';"></div></div></div>';
            html += '<div style="font-weight:800;font-size: var(--fs-sm);color:' + x.lvl.color + ';min-width:38px;text-align:right;">' + x.lvl.pct + '%</div>';
            html += '</div>';
        });
        html += '</div>';
    }

    // Alerts
    var alerts = [];
    gases.forEach(function(g) {
        var exp = invGasExpiry(g);
        var lvl = invGasLevel(g);
        if (exp.status === 'expired') alerts.push({sev:'red', msg: g.formula + ' #' + g.controlNo + ' (' + g.zone + ') — ' + exp.text});
        else if (exp.status === 'warning') alerts.push({sev:'amber', msg: g.formula + ' #' + g.controlNo + ' — ' + exp.text});
        if (lvl.pct < 15 && lvl.pct >= 0) alerts.push({sev:'red', msg: g.formula + ' #' + g.controlNo + ' — Nivel critico: ' + lvl.text});
        else if (lvl.pct < 30) alerts.push({sev:'amber', msg: g.formula + ' #' + g.controlNo + ' — Nivel bajo: ' + lvl.text});
    });
    equip.forEach(function(e) {
        if (!e.nextCalDate) return;
        var d = new Date(e.nextCalDate); var diff = Math.round((d - new Date())/(1000*60*60*24));
        if (diff < 0) alerts.push({sev:'red', msg: e.name + ' (S/N ' + e.serialNo + ') — Cal. vencida hace ' + Math.abs(diff) + 'd'});
        else if (diff < 30) alerts.push({sev:'amber', msg: e.name + ' — Cal. vence en ' + diff + 'd'});
    });

    if (alerts.length > 0) {
        alerts.sort(function(a,b){ return a.sev === 'red' ? -1 : 1; });
        html += '<div class="tp-card" style="border-left:3px solid var(--tp-red);"><div class="tp-card-title"><span style="color:var(--tp-red);">Alertas (' + alerts.length + ')</span></div>';
        alerts.slice(0, 15).forEach(function(a) {
            html += '<div style="padding:3px 8px;font-size: var(--fs-xs);color:' + (a.sev==='red'?'#fca5a5':'#fde68a') + ';border:1px solid ' + (a.sev==='red'?'rgba(239,68,68,0.2)':'rgba(245,158,11,0.2)') + ';border-radius:4px;margin-bottom:2px;">' + a.msg + '</div>';
        });
        html += '</div>';
    } else if (gases.length > 0) {
        html += '<div class="tp-card" style="border-left:3px solid var(--tp-green);text-align:center;padding:20px;color:var(--tp-green);">Sin alertas de vigencia/nivel. Todos los gases y equipos OK.</div>';
    }

    // Anomaly detection banner
    html += invRenderAnomalyBanner();

    // Reorder alerts (projected depletion)
    html += invRenderReorderAlerts();

    // Zone map (simplified visual)
    html += '<div class="tp-card"><div class="tp-card-title"><span>Mapa de Zonas</span></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;">';
    invState.zones.forEach(function(z) {
        var zGases = gases.filter(function(g){ return g.zone && g.zone.startsWith(z.id); });
        var occupied = zGases.length;
        var hasAlert = zGases.some(function(g){ var e = invGasExpiry(g); return e.status==='expired'; });
        var borderClr = hasAlert ? 'var(--tp-red)' : occupied > 0 ? 'var(--tp-green)' : 'var(--tp-border)';
        html += '<div style="padding:8px;border:2px solid ' + borderClr + ';border-radius:8px;background:var(--tp-card);cursor:pointer;" onclick="invShowZone(\'' + z.id + '\')">';
        html += '<div style="font-weight:800;font-size:13px;margin-bottom:2px;">' + z.id + '</div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + z.label + ' (' + z.type + ')</div>';
        html += '<div style="font-size: var(--fs-xs);font-weight:700;color:' + (occupied > 0 ? 'var(--tp-amber)' : 'var(--tp-dim)') + ';">' + occupied + '/' + z.slots + '</div>';
        // Mini dots
        html += '<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:3px;">';
        for (var s = 1; s <= z.slots; s++) {
            var slotGas = zGases.find(function(g){ return g.position === s; });
            var dotClr = '#334155';
            if (slotGas) { var ex = invGasExpiry(slotGas); dotClr = ex.color; }
            html += '<div style="width:8px;height:8px;border-radius:50%;background:' + dotClr + ';"></div>';
        }
        html += '</div></div>';
    });
    html += '</div></div>';

    if (gases.length === 0) {
        html += '<div class="tp-card" style="text-align:center;padding:30px;color:var(--tp-dim);">Sin cilindros registrados.<br><button class="tp-btn tp-btn-primary" onclick="invSwitchTab(\'inv-gases\')" style="margin-top:12px;">➕ Agregar Gas</button></div>';
    }

    el.innerHTML = html;
}

// ══════════════════════════════════════════════════
// GASES MANAGEMENT
// ══════════════════════════════════════════════════
function invRenderGases(el) {
    var gases = invState.gases;
    var filterZone = window._invGasFilterZone || 'ALL';
    var allZones = invState.zones.map(function(z){return z.id;});
    var filtered = filterZone === 'ALL' ? gases : gases.filter(function(g){ return g.zone && g.zone.startsWith(filterZone); });

    var _invGasCompact = getViewMode('inv-gases') === 'compact';
    var html = '<div class="tp-card"><div class="tp-card-title" data-help="inv-gases-help"><span>Gestion de Cilindros (' + gases.length + ')</span>';
    html += '<div style="display:flex;gap:5px;align-items:center;">' + renderViewModeToggle('inv-gases', false);
    html += '<button class="tp-btn tp-btn-primary" onclick="invShowAddGas()" style="font-size: var(--fs-xs);">+ Nuevo Cilindro</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="invExportGases()" style="font-size: var(--fs-xs);">Exportar</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="invImportGases()" style="font-size: var(--fs-xs);">Importar</button></div></div>';
    html += '<input type="file" id="inv-import-file" accept=".json" style="display:none;" onchange="invHandleImport(event)">';

    // Filters
    html += '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">';
    html += '<select class="tp-select" onchange="window._invGasFilterZone=this.value;_invDebouncedRender();" style="font-size: var(--fs-xs);"><option value="ALL">Todas zonas</option>';
    allZones.forEach(function(z){ html += '<option value="' + z + '" ' + (z===filterZone?'selected':'') + '>' + z + '</option>'; });
    html += '</select></div>';

    if (filtered.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Sin cilindros' + (filterZone !== 'ALL' ? ' en zona ' + filterZone : '') + '</div>';
    } else {
        html += '<div class="inv-row-list-2col ' + (_invGasCompact ? 'list-compact' : '') + '" style="max-height:500px;overflow-y:auto;">';
        filtered.sort(function(a,b){ return (a.zone||'').localeCompare(b.zone||''); }).forEach(function(g) {
            var exp = invGasExpiry(g);
            var lvl = invGasLevel(g);
            html += '<div style="position:relative;display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;border-left:3px solid ' + exp.color + ';background:var(--tp-card);flex-wrap:wrap;gap:4px;">';
            if (exp.status === 'expired') {
                html += '<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(239,68,68,0.08);pointer-events:none;border-radius:6px;"></div>';
                html += '<div style="position:absolute;top:2px;right:8px;font-size: var(--fs-xs);font-weight:900;color:var(--danger-text);transform:rotate(-12deg);opacity:0.6;">VENCIDO</div>';
            }
            html += '<div style="flex:1;min-width:180px;">';
            html += '<div style="font-weight:700;font-size: var(--fs-sm);">' + g.formula + ' <span style="color:var(--tp-dim);font-weight:400;">' + (g.concNominal||'') + '</span></div>';
            html += '<div class="compact-hide" style="font-size: var(--fs-xs);color:var(--tp-dim);">#' + g.controlNo + ' | Cil: ' + (g.cylinderNo||'?') + ' | ' + (g.zone||'?') + '</div>';
            html += '</div>';
            html += '<div style="display:flex;gap:6px;align-items:center;">';
            html += '<span style="font-size: var(--fs-xs);padding:2px 6px;border-radius:4px;background:' + exp.color + '20;color:' + exp.color + ';border:1px solid ' + exp.color + '30;">' + exp.text + '</span>';
            html += '<span style="font-size: var(--fs-xs);padding:2px 6px;border-radius:4px;background:' + lvl.color + '20;color:' + lvl.color + ';">' + lvl.text + '</span>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="invEditGas(\'' + g.id + '\')" style="font-size: var(--fs-xs);" title="Editar" aria-label="Editar cilindro">\u270F</button>';
            if (g.readings && g.readings.length >= 2) html += '<button class="tp-btn tp-btn-ghost" onclick="invShowTrendChart(\'' + g.id + '\')" style="font-size: var(--fs-xs);" title="Tendencia" aria-label="Ver tendencia de consumo">&#x1F4C8;</button>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="invShowBarcode(\'' + g.id + '\')" style="font-size: var(--fs-xs);" title="C\u00F3digo de barras" aria-label="Ver c\u00F3digo de barras">\u{1F4CB}</button>';
            html += '</div></div>';
        });
        html += '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
}

// ══════════════════════════════════════════════════
// ADD/EDIT GAS MODAL
// ══════════════════════════════════════════════════
function invShowAddGas(editId) {
    var g = editId ? invState.gases.find(function(x){return x.id===editId;}) : null;
    var isEdit = !!g;
    var title = isEdit ? 'Modificar Cilindro' : 'Nuevo Cilindro';
    var nextFree = isEdit ? '' : _invNextFreeSlot();
    var lastTS = isEdit ? { traceability: g.traceability, supplier: g.supplier } : _invLastGasTraceSupplier();
    var inpStyle = 'width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;';
    var lblStyle = 'font-size: var(--fs-sm);color:#475569;font-weight:600;';

    var zoneOpts = invState.zones.map(function(z) {
        var opts = '';
        for (var i = 1; i <= z.slots; i++) {
            var code = z.id + (i<10?'0':'') + i;
            var occupied = invState.gases.some(function(x){ return x.zone === code && (!isEdit || x.id !== g.id); });
            var selected = g ? g.zone === code : code === nextFree;
            opts += '<option value="' + code + '" ' + (selected?'selected':'') + ' ' + (occupied?'disabled':'') + '>' + code + (occupied?' (ocupado)':'') + '</option>';
        }
        return opts;
    }).join('');

    var gasTypeOpts = invState.gasTypes.map(function(gt) {
        return '<option value="' + gt.name + '" ' + (g && g.gasType===gt.name?'selected':'') + '>' + gt.name + ' (' + gt.formula + ')</option>';
    }).join('');

    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:460px;margin:30px auto;background:#fff;border-radius:14px;padding:20px;position:relative;max-height:90vh;overflow-y:auto;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">\u2715</button>' +
        '<h3 style="margin:0 0 12px;">' + title + '</h3>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<div><label style="' + lblStyle + '">Tipo de Gas *</label><select id="inv-g-type" onchange="invUpdateConcOpts()" style="' + inpStyle + '"><option value="">Seleccionar\u2026</option>' + gasTypeOpts + '</select></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div><label style="' + lblStyle + '">Conc. Nominal</label><select id="inv-g-conc" style="' + inpStyle + '"></select></div>' +
        '<div><label style="' + lblStyle + '">Zona + Posici\u00f3n *</label><select id="inv-g-zone" style="' + inpStyle + '"><option value="">Seleccionar\u2026</option>' + zoneOpts + '</select></div>' +
        '</div>' +
        '<div><label style="' + lblStyle + '">Vigencia</label><input id="inv-g-valid" type="date" value="' + (g?g.validUntil:'') + '" style="' + inpStyle + '"></div>' +
        '</div>' +
        '<details style="margin-top:10px;"><summary style="font-size: var(--fs-sm);color:#475569;font-weight:700;cursor:pointer;padding:6px 0;">M\u00e1s detalles (control, estatus, lote, trazabilidad\u2026)</summary>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
        '<div style="grid-column:1/-1;"><label style="' + lblStyle + '">No. Control <button onclick="document.getElementById(\x27inv-g-control\x27).value=invAutoControlNo()" style="font-size: var(--fs-xs);background:#0f766e;color:#fff;border:none;border-radius:4px;padding:1px 6px;cursor:pointer;">Auto-ID</button></label><input id="inv-g-control" value="' + (g?g.controlNo:invAutoControlNo()) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Estatus</label><select id="inv-g-status" style="' + inpStyle + '"><option ' + (g&&g.status==='Stock'?'selected':'') + '>Stock</option><option ' + ((g&&g.status==='In use')||!isEdit?'selected':'') + '>In use</option><option ' + (g&&g.status==='Empty'?'selected':'') + '>Empty</option><option ' + (g&&g.status==='Spare'?'selected':'') + '>Spare</option></select></div>' +
        '<div><label style="' + lblStyle + '">No. Cilindro</label><input id="inv-g-cylinder" value="' + (g?g.cylinderNo:'') + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Conc. Real</label><input id="inv-g-concreal" value="' + (g?g.concReal:'') + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Trazabilidad</label><select id="inv-g-trace" style="' + inpStyle + '"><option ' + (lastTS.traceability==='EPA'?'selected':'') + '>EPA</option><option ' + (lastTS.traceability==='CENAM'?'selected':'') + '>CENAM</option><option ' + (lastTS.traceability==='NIST'?'selected':'') + '>NIST</option></select></div>' +
        '<div><label style="' + lblStyle + '">Fecha recibido</label><input id="inv-g-regdate" type="date" value="' + (g?g.regDate:localToday()) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">No. Lote</label><input id="inv-g-lot" value="' + (g?g.lotNumber||'':'') + '" placeholder="Lote del proveedor" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Proveedor</label><input id="inv-g-supplier" value="' + (g ? (g.supplier||'') : (lastTS.supplier||'')) + '" placeholder="Nombre del proveedor" style="' + inpStyle + '"></div>' +
        '</div></details>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveGas(\x27' + (editId||'') + '\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        (isEdit ? '<button onclick="showConfirm(\'Eliminar cilindro?\',function(){invDeleteGas(\x27' + editId + '\x27);},{title:\'Eliminar\',type:\'danger\',confirmText:\'Eliminar\'})" style="padding:10px;background:var(--danger-fill);color:#fff;border:none;border-radius:8px;cursor:pointer;">Eliminar</button>' : '') +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';

    if (g) { invUpdateConcOpts(); document.getElementById('inv-g-conc').value = g.concNominal || ''; }
    else { invUpdateConcOpts(); }
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function invEditGas(id) { invShowAddGas(id); }

function invUpdateConcOpts() {
    var sel = document.getElementById('inv-g-type');
    var concSel = document.getElementById('inv-g-conc');
    if (!sel || !concSel) return;
    var gt = invState.gasTypes.find(function(t){ return t.name === sel.value; });
    concSel.innerHTML = '<option value="">--</option>';
    if (gt) gt.concs.forEach(function(c){ concSel.innerHTML += '<option value="' + c + '">' + c + '</option>'; });
}

function invSaveGas(editId) {
    var controlNo = document.getElementById('inv-g-control').value.trim();
    var zone = document.getElementById('inv-g-zone').value;
    if (!controlNo) { showToast('No. Control es requerido', 'error'); return; }

    var gasType = document.getElementById('inv-g-type').value;
    var gt = invState.gasTypes.find(function(t){ return t.name === gasType; });

    var obj = {
        controlNo: controlNo,
        cylinderNo: document.getElementById('inv-g-cylinder').value.trim(),
        gasType: gasType,
        formula: gt ? gt.formula : '',
        concNominal: document.getElementById('inv-g-conc').value,
        concReal: document.getElementById('inv-g-concreal').value.trim(),
        traceability: document.getElementById('inv-g-trace').value,
        validUntil: document.getElementById('inv-g-valid').value,
        zone: zone,
        position: zone ? parseInt(zone.slice(1)) : 0,
        status: document.getElementById('inv-g-status').value,
        regDate: document.getElementById('inv-g-regdate').value,
        barcode: invGenerateSerial(controlNo),
        lotNumber: document.getElementById('inv-g-lot').value.trim(),
        supplier: document.getElementById('inv-g-supplier').value.trim()
    };

    if (editId) {
        var idx = invState.gases.findIndex(function(g){ return g.id === editId; });
        if (idx >= 0) {
            var old = invState.gases[idx];
            obj.id = old.id;
            obj.readings = old.readings || [];
            obj.timeline = old.timeline || [];
            // Log status change
            if (old.status !== obj.status) {
                obj.timeline.push({date:new Date().toISOString(),action:'Cambio estatus: ' + old.status + ' → ' + obj.status});
            }
            if (old.zone !== obj.zone) {
                obj.timeline.push({date:new Date().toISOString(),action:'Reubicado: ' + (old.zone||'?') + ' → ' + obj.zone});
            }
            obj.timeline.push({date:new Date().toISOString(),action:'Modificado'});
            invState.gases[idx] = obj;
            auditLog('inv', 'gas_modified', {type:'gas', id:obj.id, label:obj.controlNo}, 'Formula: ' + obj.formula);
        }
    } else {
        obj.id = invGenId();
        obj.readings = [];
        obj.timeline = [{date:new Date().toISOString(),action:'Alta — Recibido'}];
        invState.gases.push(obj);
        auditLog('inv', 'gas_created', {type:'gas', id:obj.id, label:obj.controlNo}, 'Formula: ' + obj.formula);
    }

    invSave(); invPreloadData(); invRender(); invUpdateBadges();
    document.getElementById('invModal').style.display = 'none';
}

function invDeleteGas(id) {
    var _delGas = invState.gases.find(function(g){ return g.id === id; });
    if (_delGas) auditLog('inv', 'gas_deleted', {type:'gas', id:id, label:_delGas.controlNo}, 'Formula: ' + _delGas.formula);
    invState.gases = invState.gases.filter(function(g){ return g.id !== id; });
    invSave(); invPreloadData(); invRender(); invUpdateBadges();
    document.getElementById('invModal').style.display = 'none';
}

function invShowBarcode(id) {
    var g = invState.gases.find(function(x){return x.id===id;});
    if (!g) return;

    // Ensure barcode serial exists (backfill for old cylinders)
    if (!g.barcode || g.barcode.startsWith('*')) {
        g.barcode = invGenerateSerial(g.controlNo);
        invSave();
    }

    var exp = invGasExpiry(g);
    var lvl = invGasLevel(g);
    var lastR = g.readings && g.readings.length > 0 ? g.readings[g.readings.length - 1] : null;

    var modal = document.getElementById('invModal');
    modal.style.display = 'block';

    // ── Print-optimized layout: barcode label strip + data sheet ──
    var html = '<div id="inv-print-page" style="max-width:700px;margin:20px auto;background:#fff;border-radius:14px;padding:0;color:#0f172a;">';

    // === BARCODE LABEL STRIP (designed to be cut out) ===
    html += '<div id="inv-barcode-label" style="border:2px dashed #94a3b8;border-radius:10px;padding:12px 20px;margin:20px;page-break-after:auto;">';
    html += '<div style="display:flex;align-items:center;gap:16px;">';
    // Left: barcode
    html += '<div id="inv-barcode-container" style="flex-shrink:0;"></div>';
    // Right: key info for the label
    html += '<div style="flex:1;border-left:1px solid #e2e8f0;padding-left:14px;">';
    html += '<div style="font-size:16px;font-weight:800;">' + g.formula + ' <span style="font-weight:400;color:#64748b;">' + (g.concNominal || '') + '</span></div>';
    html += '<div style="font-size: var(--fs-sm);color:#334155;margin-top:2px;">' + (g.gasType || '') + '</div>';
    html += '<table style="font-size: var(--fs-xs);margin-top:6px;border-collapse:collapse;">';
    html += '<tr><td style="color:#64748b;padding-right:8px;">Control:</td><td style="font-weight:700;">' + g.controlNo + '</td></tr>';
    html += '<tr><td style="color:#64748b;padding-right:8px;">Cilindro:</td><td style="font-weight:700;">' + (g.cylinderNo || '—') + '</td></tr>';
    html += '<tr><td style="color:#64748b;padding-right:8px;">Zona:</td><td style="font-weight:700;">' + (g.zone || '—') + '</td></tr>';
    html += '<tr><td style="color:#64748b;padding-right:8px;">Vence:</td><td style="font-weight:700;color:' + (exp.days < 30 ? '#dc2626' : '#0f172a') + ';">' + (g.validUntil || '—') + '</td></tr>';
    html += '</table>';
    html += '</div></div>';
    html += '<div style="text-align:center;margin-top:4px;font-size: var(--fs-xs);color:var(--muted);letter-spacing:1px;">✂ RECORTAR POR LINEA PUNTEADA ✂</div>';
    html += '</div>';

    // === FICHA DE RECEPCION DE CILINDRO ===
    html += '<div style="padding:0 24px 24px;">';

    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;border-bottom:2px solid #0f172a;padding-bottom:8px;">';
    html += '<div>';
    html += '<div style="font-size:20px;font-weight:800;">KIA Emissions Lab</div>';
    html += '<div style="font-size: var(--fs-sm);color:#64748b;">Ficha de Recepcion de Cilindro de Gas</div>';
    html += '</div>';
    html += '<div style="text-align:right;font-size: var(--fs-sm);color:#475569;font-weight:600;">';
    html += '<div>Fecha recepcion: <strong style="color:#0f172a;font-size:12px;">' + (g.regDate || localToday()) + '</strong></div>';
    html += '<div>Folio: ' + g.controlNo + '</div>';
    html += '</div></div>';

    // Identification table
    html += '<div style="font-size: var(--fs-sm);font-weight:700;margin-bottom:4px;color:#334155;">1. Identificacion del Cilindro</div>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #cbd5e1;">';
    var idFields = [
        ['Formula / Gas', g.formula],
        ['Tipo de Gas', g.gasType || '—'],
        ['No. Control Interno', g.controlNo],
        ['No. Cilindro (proveedor)', g.cylinderNo || '—'],
        ['Conc. Nominal', g.concNominal || '—'],
        ['Conc. Real (certificado)', g.concReal || '—'],
        ['Trazabilidad / Lote', g.traceability || '—'],
        ['Serial Barcode', g.barcode],
        ['Zona Asignada', g.zone || '—'],
        ['Fecha de Vigencia', g.validUntil || '—']
    ];
    for (var i = 0; i < idFields.length; i += 2) {
        html += '<tr>';
        html += '<td style="padding:3px 8px;font-size: var(--fs-xs);color:#64748b;border:1px solid #e2e8f0;width:22%;background:#f8fafc;">' + idFields[i][0] + '</td>';
        html += '<td style="padding:3px 8px;font-size: var(--fs-xs);font-weight:600;border:1px solid #e2e8f0;width:28%;">' + idFields[i][1] + '</td>';
        if (i + 1 < idFields.length) {
            html += '<td style="padding:3px 8px;font-size: var(--fs-xs);color:#64748b;border:1px solid #e2e8f0;width:22%;background:#f8fafc;">' + idFields[i+1][0] + '</td>';
            html += '<td style="padding:3px 8px;font-size: var(--fs-xs);font-weight:600;border:1px solid #e2e8f0;width:28%;">' + idFields[i+1][1] + '</td>';
        } else {
            html += '<td colspan="2" style="border:1px solid #e2e8f0;"></td>';
        }
        html += '</tr>';
    }
    html += '</table>';

    // Checklist de recepcion
    html += '<div style="font-size: var(--fs-sm);font-weight:700;margin-bottom:4px;color:#334155;">2. Checklist de Recepcion</div>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #cbd5e1;font-size: var(--fs-xs);">';
    html += '<thead><tr style="background:#f8fafc;"><th style="padding:3px 8px;border:1px solid #e2e8f0;text-align:left;width:60%;">Verificacion</th><th style="padding:3px 8px;border:1px solid #e2e8f0;width:10%;">OK</th><th style="padding:3px 8px;border:1px solid #e2e8f0;width:10%;">N/A</th><th style="padding:3px 8px;border:1px solid #e2e8f0;text-align:left;">Observaciones</th></tr></thead><tbody>';
    var checks = [
        'Cilindro sin dano visible (golpes, corrosion, abolladuras)',
        'Valvula en buenas condiciones y cierra correctamente',
        'Etiqueta del proveedor legible y coincide con certificado',
        'Certificado de analisis recibido y archivado',
        'Concentracion real dentro de tolerancia vs nominal',
        'Fecha de vigencia vigente al momento de recepcion',
        'Presion inicial registrada (ver seccion 3)',
        'Regulador/adaptador compatible verificado',
        'Zona de almacenamiento asignada y etiquetada'
    ];
    checks.forEach(function(c) {
        html += '<tr><td style="padding:3px 8px;border:1px solid #e2e8f0;">' + c + '</td>';
        html += '<td style="padding:3px 8px;border:1px solid #e2e8f0;text-align:center;">&#9744;</td>';
        html += '<td style="padding:3px 8px;border:1px solid #e2e8f0;text-align:center;">&#9744;</td>';
        html += '<td style="padding:3px 8px;border:1px solid #e2e8f0;"></td></tr>';
    });
    html += '</tbody></table>';

    // Presion inicial
    html += '<div style="font-size: var(--fs-sm);font-weight:700;margin-bottom:4px;color:#334155;">3. Presion Inicial</div>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #cbd5e1;font-size: var(--fs-xs);">';
    html += '<tr>';
    html += '<td style="padding:6px 8px;border:1px solid #e2e8f0;width:30%;background:#f8fafc;">Presion al recibir (psi):</td>';
    html += '<td style="padding:6px 8px;border:1px solid #e2e8f0;width:20%;font-size:14px;font-weight:700;min-height:24px;">&nbsp;</td>';
    html += '<td style="padding:6px 8px;border:1px solid #e2e8f0;width:25%;background:#f8fafc;">Fecha de lectura:</td>';
    html += '<td style="padding:6px 8px;border:1px solid #e2e8f0;width:25%;">' + (g.regDate || '') + '</td>';
    html += '</tr></table>';

    // Bitacora de lecturas (blank rows to fill by hand)
    html += '<div style="font-size: var(--fs-sm);font-weight:700;margin-bottom:4px;color:#334155;">4. Bitacora de Lecturas de Presion</div>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;border:1px solid #cbd5e1;font-size: var(--fs-xs);">';
    html += '<thead><tr style="background:#f8fafc;">';
    html += '<th style="padding:3px 6px;border:1px solid #e2e8f0;width:18%;">Fecha</th>';
    html += '<th style="padding:3px 6px;border:1px solid #e2e8f0;width:14%;">PSI</th>';
    html += '<th style="padding:3px 6px;border:1px solid #e2e8f0;width:14%;">Temp. (&deg;C)</th>';
    html += '<th style="padding:3px 6px;border:1px solid #e2e8f0;">Operador</th>';
    html += '<th style="padding:3px 6px;border:1px solid #e2e8f0;">Observaciones</th>';
    html += '</tr></thead><tbody>';
    for (var r = 0; r < 15; r++) {
        html += '<tr>';
        html += '<td style="padding:5px 6px;border:1px solid #e2e8f0;height:18px;">&nbsp;</td>';
        html += '<td style="padding:5px 6px;border:1px solid #e2e8f0;">&nbsp;</td>';
        html += '<td style="padding:5px 6px;border:1px solid #e2e8f0;">&nbsp;</td>';
        html += '<td style="padding:5px 6px;border:1px solid #e2e8f0;">&nbsp;</td>';
        html += '<td style="padding:5px 6px;border:1px solid #e2e8f0;">&nbsp;</td>';
        html += '</tr>';
    }
    html += '</tbody></table>';

    // Firmas
    html += '<div style="font-size: var(--fs-sm);font-weight:700;margin-bottom:8px;color:#334155;">5. Firmas de Recepcion</div>';
    html += '<div style="display:flex;gap:20px;margin-bottom:14px;">';
    html += '<div style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:8px;text-align:center;">';
    html += '<div style="height:50px;"></div>';
    html += '<div style="border-top:1px solid #0f172a;padding-top:4px;font-size: var(--fs-xs);color:#64748b;">Recibio — Nombre y firma</div></div>';
    html += '<div style="flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:8px;text-align:center;">';
    html += '<div style="height:50px;"></div>';
    html += '<div style="border-top:1px solid #0f172a;padding-top:4px;font-size: var(--fs-xs);color:#64748b;">Verifico — Nombre y firma</div></div>';
    html += '</div>';

    // Notas
    html += '<div style="border:1px solid #e2e8f0;border-radius:6px;padding:8px;min-height:40px;">';
    html += '<div style="font-size: var(--fs-xs);color:var(--muted);">Notas / Observaciones:</div>';
    html += '</div>';

    html += '</div>'; // end data sheet

    // === ACTION BUTTONS (hidden on print) ===
    html += '<div class="inv-no-print" style="display:flex;gap:8px;justify-content:center;padding:0 24px 24px;">';
    html += '<button onclick="invPrintBarcodePage()" style="padding:10px 24px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Imprimir</button>';
    html += '<button onclick="invDownloadBarcode(\'' + g.id + '\')" style="padding:10px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Descargar Barcode</button>';
    html += '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px 24px;background:#e2e8f0;color:#334155;border:none;border-radius:8px;cursor:pointer;">Cerrar</button>';
    html += '</div>';

    html += '</div>'; // end inv-print-page
    modal.innerHTML = html;

    // Render real barcode using JsBarcode
    var container = document.getElementById('inv-barcode-container');
    if (typeof JsBarcode !== 'undefined') {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'inv-barcode-svg';
        container.appendChild(svg);
        try {
            JsBarcode(svg, g.barcode, {
                format: 'CODE128',
                width: 2,
                height: 50,
                displayValue: true,
                fontSize: 12,
                font: 'monospace',
                textMargin: 3,
                margin: 5,
                background: '#ffffff',
                lineColor: '#000000'
            });
        } catch(e) {
            container.innerHTML = '<div style="font-size:28px;font-family:monospace;letter-spacing:3px;">' + g.barcode + '</div>' +
                '<div style="font-size: var(--fs-xs);color:var(--danger-text);">Error: ' + e.message + '</div>';
        }
    } else {
        container.innerHTML = '<div style="font-size:28px;font-family:monospace;letter-spacing:3px;">' + g.barcode + '</div>' +
            '<div style="font-size: var(--fs-xs);color:var(--warn-text);">JsBarcode no cargado.</div>';
    }
}

function invPrintBarcodePage() {
    // Add print styles dynamically
    var styleId = 'inv-print-styles';
    if (!document.getElementById(styleId)) {
        var style = document.createElement('style');
        style.id = styleId;
        style.textContent = '@media print { body > *:not(#invModal) { display:none !important; } #invModal { position:static !important; background:#fff !important; overflow:visible !important; } .inv-no-print { display:none !important; } #inv-print-page { margin:0 !important; border-radius:0 !important; box-shadow:none !important; } #inv-barcode-label { border:2px dashed #999 !important; } }';
        document.head.appendChild(style);
    }
    window.print();
}

function invDownloadBarcode(id) {
    var g = invState.gases.find(function(x){return x.id===id;});
    if (!g) return;
    var svg = document.getElementById('inv-barcode-svg');
    if (!svg) { showToast('No se pudo generar imagen', 'error'); return; }

    // Convert SVG to canvas then download as PNG
    var svgData = new XMLSerializer().serializeToString(svg);
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var img = new Image();
    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        var link = document.createElement('a');
        link.download = 'barcode-' + g.controlNo + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
}


function invShowTimeline(id) {
    var g = invState.gases.find(function(x){return x.id===id;});
    if (!g) return;
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    var tl = g.timeline || [];
    var exp = invGasExpiry(g);
    var lvl = invGasLevel(g);
    var html = '<div style="max-width:450px;margin:30px auto;background:#fff;border-radius:14px;padding:20px;max-height:85vh;overflow-y:auto;position:relative;">';
    html += '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">\u2715</button>';
    html += '<h3 style="margin:0 0 4px;color:#0f172a;">' + g.formula + ' ' + (g.concNominal||'') + '</h3>';
    html += '<div style="font-size: var(--fs-sm);color:#64748b;margin-bottom:12px;">Control: ' + g.controlNo + ' | Cilindro: ' + (g.cylinderNo||'?') + ' | Zona: ' + (g.zone||'?') + '</div>';
    // Status badges
    html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">';
    var statusClr = g.status==='In use'?'#dcfce7;color:#16a34a':g.status==='Empty'?'#fef2f2;color:var(--danger-text)':'#fef9c3;color:#ca8a04';
    html += '<span style="font-size: var(--fs-xs);padding:3px 8px;border-radius:12px;background:' + statusClr + ';">' + g.status + '</span>';
    html += '<span style="font-size: var(--fs-xs);padding:3px 8px;border-radius:12px;background:' + exp.color + '20;color:' + exp.color + ';">' + exp.text + '</span>';
    html += '<span style="font-size: var(--fs-xs);padding:3px 8px;border-radius:12px;background:' + lvl.color + '20;color:' + lvl.color + ';">' + lvl.text + '</span>';
    html += '</div>';
    // Info grid
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size: var(--fs-xs);margin-bottom:12px;color:#334155;">';
    html += '<div><span style="color:var(--muted);">Recibido:</span> ' + (g.regDate||'?') + '</div>';
    html += '<div><span style="color:var(--muted);">Vigencia:</span> ' + (g.validUntil||'?') + '</div>';
    html += '<div><span style="color:var(--muted);">Trazabilidad:</span> ' + (g.traceability||'?') + '</div>';
    html += '<div><span style="color:var(--muted);">Conc. Real:</span> ' + (g.concReal||'?') + '</div>';
    html += '</div>';
    // Timeline
    html += '<div style="font-size: var(--fs-sm);font-weight:700;color:#0f172a;margin-bottom:6px;">Historial</div>';
    if (tl.length === 0) { html += '<div style="font-size: var(--fs-xs);color:var(--muted);">Sin historial.</div>'; }
    else {
        tl.slice().reverse().forEach(function(e) {
            var d = new Date(e.date);
            html += '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f1f5f9;">';
            html += '<div style="font-size: var(--fs-xs);color:var(--muted);min-width:70px;">' + d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'}) + '</div>';
            html += '<div style="font-size: var(--fs-xs);color:#334155;">' + e.action + '</div>';
            html += '</div>';
        });
    }
    // Last 5 readings
    if (g.readings && g.readings.length > 0) {
        html += '<div style="font-size: var(--fs-sm);font-weight:700;color:#0f172a;margin:10px 0 6px;">Ultimas Lecturas</div>';
        g.readings.slice(-5).reverse().forEach(function(r) {
            html += '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size: var(--fs-xs);color:#334155;border-bottom:1px solid #f8fafc;">';
            html += '<span>' + r.date + '</span><span style="font-weight:700;">' + r.psi + ' psi</span>';
            html += '</div>';
        });
    }
    // Quick reading inline form
    html += '<div style="margin-top:12px;border-top:1px solid #e2e8f0;padding-top:10px;">';
    html += '<button onclick="invMapQuickRead(\'' + g.id + '\')" id="inv-map-read-btn" style="width:100%;padding:10px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;">Registrar Lectura</button>';
    html += '<div id="inv-map-read-area" style="display:none;margin-top:8px;">';
    html += '<div style="display:flex;gap:6px;align-items:center;">';
    html += '<input id="inv-map-psi" type="number" inputmode="numeric" placeholder="psi" style="flex:1;padding:10px;font-size:16px;font-weight:700;text-align:center;border:2px solid #8b5cf6;border-radius:8px;background:#f8fafc;color:#0f172a;">';
    html += '<input id="inv-map-date" type="date" value="' + localToday() + '" style="padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size: var(--fs-xs);color:#334155;">';
    html += '</div>';
    html += '<div style="display:flex;gap:6px;margin-top:6px;">';
    html += '<button onclick="document.getElementById(\'inv-map-read-area\').style.display=\'none\';document.getElementById(\'inv-map-read-btn\').style.display=\'block\';" style="flex:1;padding:8px;background:#e2e8f0;color:#334155;border:none;border-radius:6px;cursor:pointer;font-size: var(--fs-sm);">Cancelar</button>';
    html += '<button onclick="invMapQuickReadSave(\'' + g.id + '\')" style="flex:2;padding:8px;background:#8b5cf6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:12px;">Guardar</button>';
    html += '</div></div></div>';
    html += '</div>';
    modal.innerHTML = html;
}

function invMapQuickRead(gasId) {
    var area = document.getElementById('inv-map-read-area');
    var btn = document.getElementById('inv-map-read-btn');
    if (area) area.style.display = 'block';
    if (btn) btn.style.display = 'none';
    setTimeout(function() { var inp = document.getElementById('inv-map-psi'); if (inp) inp.focus(); }, 100);
}

function invMapQuickReadSave(gasId) {
    var inp = document.getElementById('inv-map-psi');
    var dateInp = document.getElementById('inv-map-date');
    if (!inp || !inp.value) { showToast('Ingresa la presion', 'error'); return; }

    var psi = parseFloat(inp.value);
    if (isNaN(psi) || psi < 0) { showToast('Presion invalida', 'error'); return; }

    var date = dateInp ? dateInp.value : localToday();
    var gas = invState.gases.find(function(g) { return g.id === gasId; });
    if (!gas) { showToast('Cilindro no encontrado', 'error'); return; }

    if (!gas.readings) gas.readings = [];

    // Check for duplicate reading on same date
    var existing = gas.readings.find(function(r) { return r.date === date; });

    function _doSaveMapRead() {
        if (existing) { existing.psi = psi; } else { gas.readings.push({ date: date, psi: psi }); }
        invSave();
        if (typeof auditLog === 'function') auditLog('inv', 'gas_reading', {type:'gas', id:gas.id, label:gas.controlNo}, gas.formula + ': ' + psi + ' psi (' + date + ')');
        if (typeof fbPostGasReading === 'function') fbPostGasReading(gas.formula + ' ' + gas.controlNo, date);
        showToast(gas.formula + ' #' + gas.controlNo + ': ' + psi + ' psi', 'success');
        invShowTimeline(gasId);
    }

    if (existing) {
        showConfirmDialog({ title: '⚠️ Lectura duplicada', message: 'Ya existe lectura del ' + date + ' (' + existing.psi + ' psi). Reemplazar?', type: 'warning', confirmText: 'Reemplazar', cancelText: 'Cancelar' }).then(function(ok) { if (ok) _doSaveMapRead(); });
    } else {
        _doSaveMapRead();
    }
}

function invShowZone(zoneId) {
    window._invGasFilterZone = zoneId;
    invState.activeTab = 'inv-gases';
    localStorage.setItem('kia_inv_activeTab', 'inv-gases');
    document.querySelectorAll('#inv-tabs-bar .tp-tab').forEach(function(b){b.classList.remove('active');});
    var btn = document.querySelector('#inv-tabs-bar .tp-tab[onclick*="inv-gases"]');
    if (btn) btn.classList.add('active');
    invRender();
}

// ══════════════════════════════════════════════════
// READINGS (Daily pressure readings)
// ══════════════════════════════════════════════════
function invRenderReadings(el) {
    var gases = invState.gases.filter(function(g){ return g.status !== 'Empty'; });
    var html = invRenderAnomalyBanner();
    html += '<div class="tp-card"><div class="tp-card-title" data-help="inv-readings-help"><span>Captura Diaria — Gases (psi)</span>';
    html += '<div style="display:flex;gap:6px;">';
    html += '<button class="tp-btn tp-btn-ghost" onclick="invStartReadingRound()" style="font-size: var(--fs-xs);border-color:var(--ok-text);color:var(--ok-text);">🔄 Ronda</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="invScanBarcode()" style="font-size: var(--fs-xs);border-color:#8b5cf6;color:#8b5cf6;">📷 Escanear</button>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invSaveDailyCapture()" style="font-size: var(--fs-xs);">💾 Guardar Captura</button>';
    html += '</div></div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Registra la presion (psi) de cada cilindro en uso y los niveles de combustible. Un solo botón guarda todo.</div>';

    if (invState.gases.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Aún no hay cilindros registrados. <button class="tp-btn tp-btn-primary" onclick="invSwitchTab(\'inv-gases\')" style="font-size: var(--fs-xs);margin-left:6px;">🔴 Dar de alta un cilindro →</button></div>';
    } else if (gases.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Sin cilindros en uso.</div>';
    } else {
        html += '<div style="max-height:500px;overflow-y:auto;">';
        gases.forEach(function(g) {
            var lastR = g.readings.length > 0 ? g.readings[g.readings.length-1] : null;
            var lvl = invGasLevel(g);
            html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;background:var(--tp-card);flex-wrap:wrap;">';
            html += '<div style="min-width:100px;"><div style="font-weight:700;font-size: var(--fs-xs);">' + g.formula + ' ' + (g.concNominal||'') + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">#' + g.controlNo + ' | ' + (g.zone||'?') + '</div></div>';
            html += '<div style="flex:1;min-width:180px;display:flex;gap:3px;flex-wrap:wrap;">';
            var last5 = (g.readings||[]).slice(-5);
            if (last5.length > 0) {
                last5.forEach(function(r){ html += '<span style="font-size: var(--fs-xs);padding:1px 4px;border-radius:3px;background:rgba(255,255,255,0.05);border:1px solid var(--tp-border);color:var(--tp-dim);">' + r.date.slice(5) + ': <strong style="color:#fff;">' + r.psi + '</strong></span>'; });
            } else { html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">Sin lecturas</span>'; }
            html += '</div>';
            html += '<input type="number" inputmode="numeric" id="inv-rd-' + g.id + '" placeholder="psi" style="width:90px;min-height:40px;padding:8px 10px;border:1px solid var(--tp-border);border-radius:8px;background:#1e293b;color:#fff;font-size:14px;text-align:center;font-weight:600;">';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    // ── Fuel tanks capture (unified daily capture) ──
    var tanks = invState.fuelTanks || [];
    html += '<div class="tp-card"><div class="tp-card-title" data-help="inv-readings-fuel-help"><span>⛽ Captura Diaria — Combustible</span></div>';
    if (tanks.length === 0) {
        html += '<div style="text-align:center;padding:15px;color:var(--tp-dim);">Sin tanques configurados.</div>';
    } else {
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Registra el nivel actual de cada tanque.</div>';
        tanks.forEach(function(t) {
            var lastR = (t.readings && t.readings.length) ? t.readings[t.readings.length-1] : null;
            html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;background:var(--tp-card);flex-wrap:wrap;">';
            html += '<div style="min-width:120px;"><div style="font-weight:700;font-size: var(--fs-xs);">' + (t.name||'Tanque') + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">Actual: ' + (t.currentLevel!=null?t.currentLevel:'?') + ' ' + (t.unit||'L') + (lastR?(' | '+lastR.date.slice(5)):'') + '</div></div>';
            html += '<input type="number" inputmode="decimal" id="inv-fuel-rd-' + t.id + '" placeholder="' + (t.unit||'L') + '" style="width:100px;min-height:40px;padding:8px 10px;border:1px solid var(--tp-border);border-radius:8px;background:#1e293b;color:#fff;font-size:14px;text-align:center;font-weight:600;">';
            html += '</div>';
        });
    }
    html += '</div>';

    // Recent readings history
    html += '<div class="tp-card"><div class="tp-card-title"><span>Ultimas lecturas</span></div>';
    var allReadings = [];
    invState.gases.forEach(function(g) {
        (g.readings||[]).forEach(function(r) { allReadings.push({gas:g.formula+' '+g.controlNo, date:r.date, psi:r.psi, zone:g.zone}); });
    });
    allReadings.sort(function(a,b){ return b.date.localeCompare(a.date); });
    if (allReadings.length > 0) {
        html += '<div style="max-height:200px;overflow-y:auto;"><table class="tp-table" style="width:100%;"><thead><tr><th>Fecha</th><th>Gas</th><th>Zona</th><th>psi</th></tr></thead><tbody>';
        allReadings.slice(0,30).forEach(function(r) {
            html += '<tr><td style="font-size: var(--fs-xs);">' + r.date + '</td><td style="font-size: var(--fs-xs);">' + r.gas + '</td><td style="font-size: var(--fs-xs);">' + (r.zone||'') + '</td><td style="font-weight:700;">' + r.psi + '</td></tr>';
        });
        html += '</tbody></table></div>';
    } else { html += '<div style="text-align:center;padding:15px;color:var(--tp-dim);">Sin lecturas registradas.</div>'; }
    html += '</div>';
    el.innerHTML = html;
}

// Unified daily capture: saves gas PSI + fuel levels in a single action.
function invSaveDailyCapture() {
    var date = localToday();
    var count = 0;
    (invState.gases || []).filter(function(g){ return g.status !== 'Empty'; }).forEach(function(g) {
        var inp = document.getElementById('inv-rd-' + g.id);
        if (inp && inp.value !== '') {
            var psi = parseFloat(inp.value);
            if (!isNaN(psi) && psi >= 0) { if (!g.readings) g.readings = []; g.readings.push({date: date, psi: psi}); count++; }
        }
    });
    var fuelCount = 0;
    (invState.fuelTanks || []).forEach(function(t) {
        var inp = document.getElementById('inv-fuel-rd-' + t.id);
        if (inp && inp.value !== '') {
            var lvl = parseFloat(inp.value);
            if (!isNaN(lvl) && lvl >= 0) { t.currentLevel = lvl; if (!t.readings) t.readings = []; t.readings.push({date: date, level: lvl}); fuelCount++; }
        }
    });
    if (count === 0 && fuelCount === 0) { showToast('No se ingresaron capturas', 'warning'); return; }
    invState.lastReadingDate = date;
    if (typeof auditLog === 'function') auditLog('inv', 'daily_capture', {type:'reading', label:date}, count + ' gases, ' + fuelCount + ' combustibles');
    invUpdateConsumptionModel(); // v15.9: re-aprender con la información nueva del día
    invSave(); invRender();
    if (count > 0 && typeof fbPostGasReading === 'function') fbPostGasReading(count + ' cilindros', date);
    showToast(count + ' lecturas de gas y ' + fuelCount + ' de combustible guardadas (' + date + ')', 'success');
}

// ══════════════════════════════════════════════════
// BARCODE SCANNER + QUICK READING
// ══════════════════════════════════════════════════

function invScanBarcode() {
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';

    var hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    var hasLib = typeof Html5Qrcode !== 'undefined';

    var html = '<div style="max-width:420px;margin:20px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">';
    html += '<button onclick="invScanStop();document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>';
    html += '<h3 style="margin:0 0 10px;color:#8b5cf6;">Lectura Rapida</h3>';

    if (hasCamera && hasLib) {
        html += '<div id="inv-scan-area" style="position:relative;margin-bottom:12px;">';
        html += '<div id="inv-scan-reader" style="width:100%;border-radius:8px;overflow:hidden;"></div>';
        html += '<div id="inv-scan-status" style="text-align:center;font-size: var(--fs-xs);color:#8b5cf6;margin-top:6px;">Apunta al codigo de barras...</div>';
        html += '</div>';
    } else if (!hasLib) {
        html += '<div style="padding:10px;background:#1e293b;border-radius:8px;margin-bottom:12px;font-size: var(--fs-xs);color:var(--warn-text);">Libreria de escaneo no cargada. Usa la busqueda rapida abajo.</div>';
    } else {
        html += '<div style="padding:10px;background:#1e293b;border-radius:8px;margin-bottom:12px;font-size: var(--fs-xs);color:var(--warn-text);">Camara no disponible. Usa la busqueda rapida abajo.</div>';
    }

    // Quick search fallback (always shown)
    html += '<div style="margin-bottom:12px;">';
    html += '<label style="font-size: var(--fs-xs);color:#94a3b8;">Busqueda rapida (No. Control, cilindro o formula)</label>';
    html += '<input id="inv-scan-search" aria-label="Buscar cilindro" placeholder="Escribe para buscar..." oninput="_debouncedInvScanFilter()" style="width:100%;padding:10px;margin-top:4px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:13px;">';
    html += '</div>';

    // Search results
    html += '<div id="inv-scan-results" style="max-height:250px;overflow-y:auto;"></div>';

    html += '</div>';
    modal.innerHTML = html;

    // Show all in-use gases initially
    invScanFilter();

    // Start camera scanner if available
    if (hasCamera && hasLib) {
        invScanStart();
    }
}

var _invHtml5Scanner = null;

function invScanStart() {
    var readerEl = document.getElementById('inv-scan-reader');
    if (!readerEl) return;

    _invHtml5Scanner = new Html5Qrcode('inv-scan-reader');

    _invHtml5Scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 100 }, formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.QR_CODE
        ]},
        function onSuccess(code) {
            var statusEl = document.getElementById('inv-scan-status');
            if (statusEl) statusEl.textContent = 'Detectado: ' + code;

            // Find matching gas cylinder
            var gas = invState.gases.find(function(g) {
                return g.barcode === code || g.controlNo === code || g.cylinderNo === code;
            });

            if (gas) {
                invScanStop();
                invQuickReadPopup(gas);
            } else {
                if (statusEl) statusEl.textContent = 'Codigo ' + code + ' — no encontrado en inventario';
            }
        },
        function onError() {
            // Silence continuous scan misses
        }
    ).catch(function(err) {
        console.warn('Camera scanner failed:', err);
        var statusEl = document.getElementById('inv-scan-status');
        if (statusEl) statusEl.textContent = 'Error de camara: ' + (err.message || err);
        var area = document.getElementById('inv-scan-area');
        if (area) area.style.display = 'none';
    });
}

function invScanStop() {
    if (_invHtml5Scanner) {
        _invHtml5Scanner.stop().then(function() {
            _invHtml5Scanner.clear();
            _invHtml5Scanner = null;
        }).catch(function() {
            _invHtml5Scanner = null;
        });
    }
}

function invScanFilter() {
    var input = document.getElementById('inv-scan-search');
    var container = document.getElementById('inv-scan-results');
    if (!container) return;
    var q = input ? input.value.toLowerCase().trim() : '';

    var gases = invState.gases.filter(function(g) { return g.status !== 'Empty'; });
    if (q.length > 0) {
        gases = gases.filter(function(g) {
            return (g.controlNo || '').toLowerCase().includes(q) ||
                   (g.cylinderNo || '').toLowerCase().includes(q) ||
                   (g.formula || '').toLowerCase().includes(q) ||
                   (g.gasType || '').toLowerCase().includes(q) ||
                   (g.barcode || '').toLowerCase().includes(q);
        });
    }

    if (gases.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:15px;color:#64748b;font-size: var(--fs-sm);">Sin resultados</div>';
        return;
    }

    var html = '';
    gases.forEach(function(g) {
        var lastR = g.readings && g.readings.length > 0 ? g.readings[g.readings.length - 1] : null;
        var lvl = invGasLevel(g);
        html += '<button onclick="invScanStop();invQuickReadPopup(invState.gases.find(function(x){return x.id===\x27' + g.id + '\x27}))" style="display:block;width:100%;padding:10px;margin-bottom:4px;background:#1e293b;border:1px solid #334155;border-radius:8px;cursor:pointer;text-align:left;color:#e2e8f0;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<div><strong style="font-size:12px;">' + g.formula + '</strong> <span style="font-size: var(--fs-xs);color:#94a3b8;">' + (g.concNominal || '') + '</span>';
        html += '<div style="font-size: var(--fs-xs);color:#64748b;">#' + g.controlNo + ' | Cil: ' + (g.cylinderNo || '?') + ' | ' + (g.zone || '?') + '</div></div>';
        html += '<div style="text-align:right;">';
        if (lastR) {
            html += '<div style="font-size:14px;font-weight:700;color:' + lvl.color + ';">' + lastR.psi + ' psi</div>';
            html += '<div style="font-size: var(--fs-xs);color:#64748b;">' + lastR.date + '</div>';
        } else {
            html += '<div style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Sin lecturas</div>';
        }
        html += '</div></div></button>';
    });
    container.innerHTML = html;
}

function invQuickReadPopup(g) {
    if (!g) return;
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';

    var lastR = g.readings && g.readings.length > 0 ? g.readings[g.readings.length - 1] : null;
    var lvl = invGasLevel(g);
    var today = localToday();

    var html = '<div style="max-width:400px;margin:30px auto;background:#0f172a;border-radius:14px;padding:24px;position:relative;color:#e2e8f0;">';
    html += '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>';

    // Cylinder header
    html += '<div style="text-align:center;margin-bottom:16px;">';
    html += '<div style="font-size:20px;font-weight:700;">' + g.formula + ' <span style="color:#94a3b8;font-weight:400;">' + (g.concNominal || '') + '</span></div>';
    html += '<div style="font-size: var(--fs-sm);color:#64748b;">' + (g.gasType || '') + '</div>';
    html += '<div style="display:flex;justify-content:center;gap:12px;margin-top:6px;">';
    html += '<span style="font-size: var(--fs-xs);padding:2px 8px;background:#1e293b;border-radius:10px;border:1px solid #334155;">Control: <strong>' + g.controlNo + '</strong></span>';
    html += '<span style="font-size: var(--fs-xs);padding:2px 8px;background:#1e293b;border-radius:10px;border:1px solid #334155;">Cil: <strong>' + (g.cylinderNo || '?') + '</strong></span>';
    html += '<span style="font-size: var(--fs-xs);padding:2px 8px;background:#1e293b;border-radius:10px;border:1px solid #334155;">Zona: <strong>' + (g.zone || '?') + '</strong></span>';
    html += '</div></div>';

    // Previous reading
    html += '<div style="background:#1e293b;border-radius:10px;padding:14px;margin-bottom:16px;border:1px solid #334155;">';
    html += '<div style="font-size: var(--fs-sm);color:#475569;font-weight:600;margin-bottom:6px;">Lectura anterior</div>';
    if (lastR) {
        html += '<div style="display:flex;justify-content:space-between;align-items:baseline;">';
        html += '<span style="font-size:28px;font-weight:700;color:' + lvl.color + ';">' + lastR.psi + ' <span style="font-size:14px;font-weight:400;">psi</span></span>';
        html += '<span style="font-size: var(--fs-sm);color:#64748b;">' + lastR.date + '</span>';
        html += '</div>';
        html += '<div style="margin-top:6px;height:4px;background:#0f172a;border-radius:2px;overflow:hidden;">';
        html += '<div style="width:' + Math.min(lvl.pct, 100) + '%;height:100%;background:' + lvl.color + ';border-radius:2px;"></div></div>';
        html += '<div style="font-size: var(--fs-xs);color:#64748b;margin-top:3px;">' + lvl.text + '</div>';
    } else {
        html += '<div style="font-size:13px;color:#64748b;">Sin lecturas previas</div>';
    }
    html += '</div>';

    // New reading input
    html += '<div style="background:#0c1a2e;border:2px solid #8b5cf6;border-radius:10px;padding:16px;margin-bottom:16px;">';
    html += '<div style="font-size: var(--fs-sm);color:#8b5cf6;font-weight:700;margin-bottom:8px;">Nueva lectura</div>';
    html += '<div style="display:flex;gap:10px;align-items:center;">';
    html += '<div style="flex:1;">';
    html += '<input id="inv-quick-psi" type="number" inputmode="numeric" placeholder="0" autofocus style="width:100%;padding:14px;font-size:24px;font-weight:700;text-align:center;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#fff;">';
    html += '<div style="text-align:center;font-size: var(--fs-sm);color:#475569;font-weight:600;margin-top:3px;">psi</div>';
    html += '</div>';
    html += '<div>';
    html += '<input id="inv-quick-date" type="date" value="' + today + '" style="padding:8px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size: var(--fs-sm);">';
    html += '</div>';
    html += '</div></div>';

    // Action buttons
    html += '<div style="display:flex;gap:8px;">';
    html += '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="flex:1;padding:12px;background:#334155;color:#e2e8f0;border:none;border-radius:8px;cursor:pointer;font-size:12px;">Cancelar</button>';
    html += '<button onclick="invQuickReadSave(\x27' + g.id + '\x27)" style="flex:2;padding:12px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Guardar Lectura</button>';
    html += '</div>';

    // Quick: scan another
    html += '<button onclick="invScanBarcode()" style="width:100%;margin-top:8px;padding:8px;background:transparent;color:#8b5cf6;border:1px solid #8b5cf6;border-radius:8px;cursor:pointer;font-size: var(--fs-sm);">📷 Escanear otro cilindro</button>';

    html += '</div>';
    modal.innerHTML = html;

    // Auto-focus the input
    setTimeout(function() {
        var inp = document.getElementById('inv-quick-psi');
        if (inp) inp.focus();
    }, 100);
}

function invQuickReadSave(gasId) {
    var inp = document.getElementById('inv-quick-psi');
    var dateInp = document.getElementById('inv-quick-date');
    if (!inp || !inp.value) { showToast('Ingresa la presion', 'error'); return; }

    var psi = parseFloat(inp.value);
    if (isNaN(psi) || psi < 0) { showToast('Presion invalida', 'error'); return; }

    var date = dateInp ? dateInp.value : localToday();
    var gas = invState.gases.find(function(g) { return g.id === gasId; });
    if (!gas) { showToast('Cilindro no encontrado', 'error'); return; }

    if (!gas.readings) gas.readings = [];

    // Check for duplicate reading on same date
    var existingToday = gas.readings.find(function(r) { return r.date === date; });

    function _doSaveQuickRead() {
        if (existingToday) { existingToday.psi = psi; } else { gas.readings.push({ date: date, psi: psi }); }
        invSave();
        invRender();
        if (typeof auditLog === 'function') auditLog('inv', 'gas_reading', {type:'gas', id:gas.id, label:gas.controlNo}, gas.formula + ': ' + psi + ' psi (' + date + ')');
        if (typeof fbPostGasReading === 'function') fbPostGasReading(gas.formula + ' ' + gas.controlNo, date);
        showToast(gas.formula + ' #' + gas.controlNo + ': ' + psi + ' psi guardado', 'success');
        document.getElementById('invModal').style.display = 'none';
    }

    if (existingToday) {
        showConfirmDialog({ title: '⚠️ Lectura duplicada', message: 'Ya existe una lectura del ' + date + ' (' + existingToday.psi + ' psi). ¿Reemplazar?', type: 'warning', confirmText: 'Reemplazar', cancelText: 'Cancelar' }).then(function(ok) { if (ok) _doSaveQuickRead(); });
    } else {
        _doSaveQuickRead();
    }
}

// ══════════════════════════════════════════════════
// EQUIPMENT — Equipos y Calibración (COP15-F11, v16.4)
// ══════════════════════════════════════════════════
function invRenderEquipment(el) {
    var equip = invState.equipment;
    var assets = invState.assets || [];
    var summary = invCalSummary();
    var filter = window._invEqFilter || 'all';
    var search = (window._invEqSearch || '').toLowerCase();

    var html = '<div class="tp-card"><div class="tp-card-title" data-help="inv-equipment-help"><span>🔧 Equipos y Calibración (' + equip.length + ')</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invAddEquipment()" style="font-size: var(--fs-xs);">+ Instrumento</button></div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:6px;margin-bottom:10px;">';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--ok-text)">' + summary.vigentes + '</div><div class="tp-metric-label">Vigentes</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--warn-text)">' + summary.porVencer + '</div><div class="tp-metric-label">Por vencer ≤60d</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--danger-text)">' + summary.vencidos + '</div><div class="tp-metric-label">VENCIDOS</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:#64748b">' + summary.sinRegistro + '</div><div class="tp-metric-label">Sin registro</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (summary.pct >= 80 ? '#10b981' : summary.pct >= 50 ? '#f59e0b' : '#ef4444') + '">' + summary.pct + '%</div><div class="tp-metric-label">% Vigencia</div></div>';
    html += '</div>';

    var criticalOverdue = equip.filter(function(e) { return e.critical === 'Si' && invCalStatus(e).code === 'vencido'; });
    if (criticalOverdue.length > 0) {
        html += '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;margin-bottom:10px;">';
        html += '<div style="font-weight:800;color:#b91c1c;font-size: var(--fs-sm);margin-bottom:4px;">⚠️ ' + criticalOverdue.length + ' instrumento(s) CRÍTICO(S) con calibración vencida — identificar como NO OPERABLE</div>';
        criticalOverdue.forEach(function(e) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size: var(--fs-xs);color:#7f1d1d;">' +
                '<span>' + escapeHtml(e.name) + '</span>' +
                '<button class="tp-btn tp-btn-danger" onclick="invShowCalRegisterModal(\'' + e.id + '\')" style="font-size: var(--fs-xs);padding:3px 8px;">Calibrar</button></div>';
        });
        html += '</div>';
    }

    html += '<div style="margin-bottom:8px;"><input type="text" aria-label="Buscar instrumento, KMM o equipo" placeholder="Buscar instrumento, KMM, equipo..." value="' + escapeHtml(window._invEqSearch || '') + '" oninput="window._invEqSearch=this.value;_invDebouncedRender();" style="width:100%;padding:6px 8px;border:1px solid var(--tp-border);border-radius:6px;font-size: var(--fs-sm);"></div>';

    var chips = [['all', 'Todos'], ['vencido', '🔴 Vencidos'], ['porvencer', '🟠 Por vencer'], ['vigente', '🟢 Vigentes'], ['noaplica', '⚪ No aplica']];
    html += '<div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap;">';
    chips.forEach(function(c) {
        var active = filter === c[0];
        html += '<button class="tp-btn ' + (active ? 'tp-btn-primary' : 'tp-btn-ghost') + '" onclick="window._invEqFilter=\'' + c[0] + '\';_invDebouncedRender();" style="font-size: var(--fs-xs);padding:4px 8px;">' + c[1] + '</button>';
    });
    html += '</div>';

    var byAsset = {}, noAsset = [];
    equip.forEach(function(e) {
        var hay = (e.name + ' ' + (e.kmmId || '') + ' ' + (e.model || '') + ' ' + (e.serialNo || '') + ' ' + (e.magnitude || '')).toLowerCase();
        if (search && hay.indexOf(search) < 0) return;
        var st = invCalStatus(e).code;
        if (filter !== 'all' && st !== filter) return;
        var asset = assets.find(function(a) { return a.id === e.assetId; });
        if (!asset) { noAsset.push(e); return; }
        if (!byAsset[asset.id]) byAsset[asset.id] = { asset: asset, items: [] };
        byAsset[asset.id].items.push(e);
    });
    var groups = assets.map(function(a) { return byAsset[a.id]; }).filter(Boolean);
    if (noAsset.length > 0) groups.push({ asset: null, items: noAsset });

    if (groups.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Sin instrumentos que coincidan.</div>';
    } else {
        var order = { vencido: 4, sinregistro: 3, porvencer: 2, vigente: 1, noaplica: 0 };
        var colorOf = { vencido: '#ef4444', sinregistro: '#64748b', porvencer: '#f59e0b', vigente: '#10b981', noaplica: '#94a3b8' };
        groups.forEach(function(g) {
            var worst = 'noaplica';
            g.items.forEach(function(e) { var c = invCalStatus(e).code; if (order[c] > order[worst]) worst = c; });
            var okCount = g.items.filter(function(e) { return invCalStatus(e).code === 'vigente'; }).length;
            var openAttr = (worst === 'vencido' || worst === 'sinregistro') ? ' open' : '';
            html += '<details' + openAttr + ' style="margin-bottom:8px;border:1px solid var(--tp-border);border-radius:8px;overflow:hidden;">';
            html += '<summary style="cursor:pointer;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;background:var(--tp-card);border-left:4px solid ' + colorOf[worst] + ';list-style:none;">';
            html += '<span style="font-weight:700;font-size:12px;">' + (g.asset ? escapeHtml(g.asset.name) : 'Sin equipo padre') + '</span>';
            html += '<span style="display:flex;gap:6px;align-items:center;">';
            html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">' + okCount + '/' + g.items.length + ' vigentes</span>';
            if (g.asset) html += '<button class="tp-btn tp-btn-ghost" onclick="event.stopPropagation();event.preventDefault();invAddAsset(\'' + g.asset.id + '\')" style="font-size: var(--fs-xs);" title="Editar equipo" aria-label="Editar equipo padre">✏️</button>';
            html += '</span></summary>';
            html += '<div style="padding:6px 8px;">';
            g.items.forEach(function(e) {
                var st = invCalStatus(e);
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 6px;margin-bottom:3px;border-bottom:1px solid var(--tp-border);flex-wrap:wrap;gap:4px;">';
                html += '<div style="flex:1;min-width:150px;"><div style="font-weight:600;font-size: var(--fs-sm);">' + escapeHtml(e.magnitude || e.type || e.name) + '</div>';
                html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + (e.kmmId ? 'KMM ' + escapeHtml(e.kmmId) + ' · ' : '') + (e.nextCalDate ? 'próxima ' + e.nextCalDate : 'sin fecha') + '</div></div>';
                html += '<div style="display:flex;gap:5px;align-items:center;">';
                html += '<span style="font-size: var(--fs-xs);padding:2px 6px;border-radius:4px;background:' + st.color + '20;color:' + st.color + ';">' + st.label + '</span>';
                if (e.requiresCal !== 'No') html += '<button class="tp-btn tp-btn-primary" onclick="invShowCalRegisterModal(\'' + e.id + '\')" style="font-size: var(--fs-xs);padding:4px 8px;">✅ Calibrado</button>';
                html += '<button class="tp-btn tp-btn-ghost" onclick="invEditEquipment(\'' + e.id + '\')" style="font-size: var(--fs-xs);" title="Editar" aria-label="Editar instrumento">✏️</button>';
                html += '</div></div>';
            });
            html += '</div></details>';
        });
    }
    html += '</div>';
    el.innerHTML = html;
}

// ── Modal mínimo de calibración diaria: fecha + certificado + proveedor ──
function invShowCalRegisterModal(eqId) {
    var eq = invState.equipment.find(function(e) { return e.id === eqId; });
    if (!eq) return;
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:380px;margin:60px auto;background:#fff;border-radius:14px;padding:20px;position:relative;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">✕</button>' +
        '<h3 style="margin:0 0 4px;color:#0f172a;">✅ Calibración realizada</h3>' +
        '<div style="font-size: var(--fs-sm);color:#64748b;margin-bottom:14px;">' + escapeHtml(eq.name) + (eq.magnitude ? ' — ' + escapeHtml(eq.magnitude) : '') + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Fecha</label><input id="inv-calreg-date" type="date" value="' + localToday() + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">No. de Certificado</label><input id="inv-calreg-cert" value="" placeholder="Ej. T-2199-2026" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Proveedor</label><input id="inv-calreg-prov" value="' + escapeHtml(eq.calLab || '') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveCalRegister(\x27' + eqId + '\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function invSaveCalRegister(eqId) {
    var date = document.getElementById('inv-calreg-date').value;
    var certNo = document.getElementById('inv-calreg-cert').value.trim();
    var provider = document.getElementById('inv-calreg-prov').value.trim();
    if (!date) { showToast('Fecha requerida', 'error'); return; }
    invCalRegister(eqId, { date: date, certNo: certNo, provider: provider });
    document.getElementById('invModal').style.display = 'none';
    invRender(); invUpdateBadges();
}

// Recalcula "Próxima Cal." al cambiar fecha/frecuencia — sigue siendo editable a mano después.
function invEqRecalcNext() {
    var last = document.getElementById('inv-eq-lastcal');
    var freq = document.getElementById('inv-eq-freq');
    var next = document.getElementById('inv-eq-nextcal');
    if (!last || !freq || !next || !last.value) return;
    next.value = invCalNextDate(last.value, freq.value);
}

// v16.5: último instrumento capturado del mismo equipo padre — fuente del autollenado
function _invLastInstrumentOfAsset(assetId) {
    if (!assetId) return null;
    var matches = invState.equipment.filter(function(e) { return e.assetId === assetId; });
    return matches.length ? matches[matches.length - 1] : null;
}
// Al elegir el equipo padre, hereda marca/proveedor/trazabilidad/lugar/frecuencia del último
// instrumento capturado de ese mismo equipo — menos que teclear en instrumentos que se repiten.
function invEqAutofillFromAsset() {
    var assetSel = document.getElementById('inv-eq-asset');
    if (!assetSel) return;
    var last = _invLastInstrumentOfAsset(assetSel.value);
    if (!last) return;
    var setVal = function(id, val) { var el = document.getElementById(id); if (el && val) el.value = val; };
    setVal('inv-eq-brand', last.brand);
    setVal('inv-eq-model', last.model);
    setVal('inv-eq-callab', last.calLab);
    setVal('inv-eq-trace', last.traceability);
    setVal('inv-eq-place', last.calPlace);
    setVal('inv-eq-freq', last.calFreq);
}

function invAddEquipment(editId) {
    var e = editId ? invState.equipment.find(function(x) { return x.id === editId; }) : null;
    var isEdit = !!e;
    var v = function(f, d) { return e ? (e[f] != null && e[f] !== '' ? e[f] : (d || '')) : (d || ''); };
    var assets = invState.assets || [];
    var assetOpts = '<option value="">— sin equipo padre —</option>' + assets.map(function(a) {
        return '<option value="' + a.id + '" ' + (v('assetId') === a.id ? 'selected' : '') + '>' + escapeHtml(a.name) + '</option>';
    }).join('');
    var freqOpts = Object.keys(INV_CAL_FREQ_DAYS).map(function(f) {
        return '<option value="' + f + '" ' + (v('calFreq', 'Anual') === f ? 'selected' : '') + '>' + f + '</option>';
    }).join('');
    var reqOpts = ['Si', 'No'].map(function(o) { return '<option value="' + o + '" ' + (v('requiresCal', 'Si') === o ? 'selected' : '') + '>' + (o === 'Si' ? 'Sí' : 'No') + '</option>'; }).join('');
    var typeOpts = '<option value=""></option>' + INV_CAL_TYPES.map(function(o) { return '<option value="' + o + '" ' + (v('calType') === o ? 'selected' : '') + '>' + o + '</option>'; }).join('');
    var placeOpts = '<option value=""></option>' + INV_CAL_PLACES.map(function(o) { return '<option value="' + o + '" ' + (v('calPlace') === o ? 'selected' : '') + '>' + o + '</option>'; }).join('');
    var critOpts = ['No', 'Si'].map(function(o) { return '<option value="' + o + '" ' + (v('critical', 'No') === o ? 'selected' : '') + '>' + (o === 'Si' ? 'Sí' : 'No') + '</option>'; }).join('');
    var inpStyle = 'width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;';
    var lblStyle = 'font-size: var(--fs-sm);color:#475569;font-weight:600;';

    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:14px;padding:20px;position:relative;max-height:92vh;overflow-y:auto;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">✕</button>' +
        '<h3 style="margin:0 0 12px;color:#0f172a;">' + (isEdit ? 'Editar Instrumento' : 'Nuevo Instrumento') + '</h3>' +

        '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<div><label style="' + lblStyle + '">Nombre *</label><input id="inv-eq-name" value="' + escapeHtml(v('name')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Equipo padre</label><select id="inv-eq-asset" onchange="invEqAutofillFromAsset()" style="' + inpStyle + '">' + assetOpts + '</select></div>' +
        '<div><label style="' + lblStyle + '" data-help="inv-eq-magnitude">Magnitud</label><input id="inv-eq-magnitude" value="' + escapeHtml(v('magnitude')) + '" placeholder="Ej. Thermometer" style="' + inpStyle + '"></div>' +
        '</div>' +

        '<details style="margin-top:10px;"><summary style="cursor:pointer;font-weight:700;font-size:12px;padding:6px 0;">🏷️ Identificación</summary>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:6px;">' +
        '<div><label style="' + lblStyle + '">Marca</label><input id="inv-eq-brand" value="' + escapeHtml(v('brand')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Modelo</label><input id="inv-eq-model" value="' + escapeHtml(v('model')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">No. Serie</label><input id="inv-eq-serial" value="' + escapeHtml(v('serialNo')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">KMM ID</label><input id="inv-eq-kmmid" value="' + escapeHtml(v('kmmId')) + '" style="' + inpStyle + '"></div>' +
        '</div></details>' +

        '<details style="margin-top:8px;"><summary data-help="inv-eq-calsection" style="cursor:pointer;font-weight:700;font-size:12px;padding:6px 0;">📏 Calibración</summary>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:6px;">' +
        '<div><label style="' + lblStyle + '" data-help="inv-eq-requires">¿Requiere calibración?</label><select id="inv-eq-requires" style="' + inpStyle + '">' + reqOpts + '</select></div>' +
        '<div><label style="' + lblStyle + '" data-help="inv-eq-caltype">Tipo</label><select id="inv-eq-caltype" style="' + inpStyle + '">' + typeOpts + '</select></div>' +
        '<div><label style="' + lblStyle + '" data-help="inv-eq-freq">Frecuencia</label><select id="inv-eq-freq" onchange="invEqRecalcNext()" style="' + inpStyle + '">' + freqOpts + '</select></div>' +
        '<div><label style="' + lblStyle + '">Proveedor</label><input id="inv-eq-callab" value="' + escapeHtml(v('calLab')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '" data-help="inv-eq-trace">Trazabilidad</label><input id="inv-eq-trace" value="' + escapeHtml(v('traceability', 'EMA')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '" data-help="inv-eq-place">Lugar</label><select id="inv-eq-place" style="' + inpStyle + '">' + placeOpts + '</select></div>' +
        '<div><label style="' + lblStyle + '">Última Cal.</label><input id="inv-eq-lastcal" type="date" value="' + v('lastCalDate') + '" onchange="invEqRecalcNext()" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Próxima Cal.</label><input id="inv-eq-nextcal" type="date" value="' + v('nextCalDate') + '" style="' + inpStyle + '"></div>' +
        '<div style="grid-column:1/-1;"><label style="' + lblStyle + '">No. Certificado</label><input id="inv-eq-cert" value="' + escapeHtml(v('calCertNo')) + '" style="' + inpStyle + '"></div>' +
        '</div></details>' +

        '<details style="margin-top:8px;"><summary style="cursor:pointer;font-weight:700;font-size:12px;padding:6px 0;">🔬 Metrología</summary>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:6px;">' +
        '<div><label style="' + lblStyle + '">Rango máximo</label><input id="inv-eq-rangemax" value="' + escapeHtml(v('rangeMax')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Rango de uso</label><input id="inv-eq-rangeuse" value="' + escapeHtml(v('rangeUse')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '" data-help="inv-eq-maxerror">Error máx. permitido</label><input id="inv-eq-maxerror" value="' + escapeHtml(v('maxError')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Ubicación física</label><input id="inv-eq-loc" value="' + escapeHtml(v('location')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '" data-help="inv-eq-critical">Crítico NMX</label><select id="inv-eq-critical" style="' + inpStyle + '">' + critOpts + '</select></div>' +
        '<div style="grid-column:1/-1;"><label style="' + lblStyle + '">Comentarios</label><input id="inv-eq-comments" value="' + escapeHtml(v('comments')) + '" style="' + inpStyle + '"></div>' +
        '</div></details>' +

        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveEquipment(\x27' + (editId || '') + '\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        (isEdit ? '<button onclick="showConfirm(\'Eliminar instrumento?\',function(){invState.equipment=invState.equipment.filter(function(x){return x.id!==\x27' + editId + '\x27;});invSave();invRender();document.getElementById(\x27invModal\x27).style.display=\x27none\x27;},{title:\'Eliminar\',type:\'danger\',confirmText:\'Eliminar\'})" style="padding:10px;background:var(--danger-fill);color:#fff;border:none;border-radius:8px;cursor:pointer;">Eliminar</button>' : '') +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function invSaveEquipment(editId) {
    var magnitude = document.getElementById('inv-eq-magnitude').value.trim();
    var obj = {
        name: document.getElementById('inv-eq-name').value.trim(),
        assetId: document.getElementById('inv-eq-asset').value,
        magnitude: magnitude,
        type: magnitude,
        brand: document.getElementById('inv-eq-brand').value.trim(),
        model: document.getElementById('inv-eq-model').value.trim(),
        serialNo: document.getElementById('inv-eq-serial').value.trim(),
        kmmId: document.getElementById('inv-eq-kmmid').value.trim(),
        requiresCal: document.getElementById('inv-eq-requires').value,
        calType: document.getElementById('inv-eq-caltype').value,
        calFreq: document.getElementById('inv-eq-freq').value,
        calLab: document.getElementById('inv-eq-callab').value.trim(),
        traceability: document.getElementById('inv-eq-trace').value.trim(),
        calPlace: document.getElementById('inv-eq-place').value,
        lastCalDate: document.getElementById('inv-eq-lastcal').value,
        nextCalDate: document.getElementById('inv-eq-nextcal').value,
        calCertNo: document.getElementById('inv-eq-cert').value.trim(),
        rangeMax: document.getElementById('inv-eq-rangemax').value.trim(),
        rangeUse: document.getElementById('inv-eq-rangeuse').value.trim(),
        maxError: document.getElementById('inv-eq-maxerror').value.trim(),
        location: document.getElementById('inv-eq-loc').value.trim(),
        critical: document.getElementById('inv-eq-critical').value,
        comments: document.getElementById('inv-eq-comments').value.trim()
    };
    if (!obj.name) { showToast('Nombre requerido', 'error'); return; }
    if (editId) {
        var e = invState.equipment.find(function(x) { return x.id === editId; });
        if (e) {
            var oldCalDate = e.lastCalDate;
            Object.assign(e, obj);
            if (obj.lastCalDate && obj.lastCalDate !== oldCalDate && typeof fbPostCalibration === 'function') fbPostCalibration(obj.name);
            auditLog('inv', 'equipment_modified', { type: 'equipment', id: editId, label: obj.name }, 'S/N: ' + (obj.serialNo || ''));
        }
    } else {
        obj.id = invGenId();
        obj.status = 'active';
        obj.calHistory = [];
        invState.equipment.push(obj);
        auditLog('inv', 'equipment_created', { type: 'equipment', id: obj.id, label: obj.name }, 'S/N: ' + (obj.serialNo || ''));
    }
    invSave(); invRender(); invUpdateBadges();
    document.getElementById('invModal').style.display = 'none';
}

function invEditEquipment(id) { invAddEquipment(id); }

// ── Registro de equipos padre (sección 4.4 del plan): se administra desde la tarjeta de grupo ──
function invAddAsset(editId) {
    var a = editId ? (invState.assets || []).find(function(x) { return x.id === editId; }) : null;
    var isEdit = !!a;
    var v = function(f, d) { return a ? (a[f] != null && a[f] !== '' ? a[f] : (d || '')) : (d || ''); };
    var labOpts = INV_LABS.map(function(l) { return '<option value="' + l + '" ' + (v('lab', 'Emisiones') === l ? 'selected' : '') + '>' + l + '</option>'; }).join('');
    var statusOpts = ['Activo', 'Inactivo', 'Fuera de servicio'].map(function(s) { return '<option value="' + s + '" ' + (v('status', 'Activo') === s ? 'selected' : '') + '>' + s + '</option>'; }).join('');
    var inpStyle = 'width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;';
    var lblStyle = 'font-size: var(--fs-sm);color:#475569;font-weight:600;';

    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:420px;margin:50px auto;background:#fff;border-radius:14px;padding:20px;position:relative;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">✕</button>' +
        '<h3 style="margin:0 0 12px;">' + (isEdit ? 'Editar Equipo' : 'Nuevo Equipo') + '</h3>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<div><label style="' + lblStyle + '">Nombre *</label><input id="inv-asset-name" value="' + escapeHtml(v('name')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Laboratorio</label><select id="inv-asset-lab" style="' + inpStyle + '">' + labOpts + '</select></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div><label style="' + lblStyle + '">Marca</label><input id="inv-asset-brand" value="' + escapeHtml(v('brand')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Modelo</label><input id="inv-asset-model" value="' + escapeHtml(v('model')) + '" style="' + inpStyle + '"></div></div>' +
        '<div><label style="' + lblStyle + '">No. Serie</label><input id="inv-asset-serial" value="' + escapeHtml(v('serialNo')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Estatus</label><select id="inv-asset-status" style="' + inpStyle + '">' + statusOpts + '</select></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="inv-asset-blocks" ' + (v('blocksTesting') ? 'checked' : '') + '> Si está en mantenimiento, bloquea pruebas</label></div>' +
        '<div><label style="' + lblStyle + '">Notas</label><input id="inv-asset-notes" value="' + escapeHtml(v('notes')) + '" style="' + inpStyle + '"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveAsset(\x27' + (editId || '') + '\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        (isEdit ? '<button onclick="showConfirm(\'Eliminar equipo? Sus instrumentos quedaran sin equipo padre.\',function(){invState.assets=invState.assets.filter(function(x){return x.id!==\x27' + editId + '\x27;});invSave();invRender();document.getElementById(\x27invModal\x27).style.display=\x27none\x27;},{title:\'Eliminar\',type:\'danger\',confirmText:\'Eliminar\'})" style="padding:10px;background:var(--danger-fill);color:#fff;border:none;border-radius:8px;cursor:pointer;">Eliminar</button>' : '') +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function invSaveAsset(editId) {
    var obj = {
        name: document.getElementById('inv-asset-name').value.trim(),
        lab: document.getElementById('inv-asset-lab').value,
        brand: document.getElementById('inv-asset-brand').value.trim(),
        model: document.getElementById('inv-asset-model').value.trim(),
        serialNo: document.getElementById('inv-asset-serial').value.trim(),
        status: document.getElementById('inv-asset-status').value,
        blocksTesting: document.getElementById('inv-asset-blocks').checked,
        notes: document.getElementById('inv-asset-notes').value.trim(),
        updatedAt: new Date().toISOString()
    };
    if (!obj.name) { showToast('Nombre requerido', 'error'); return; }
    if (editId) {
        var a = (invState.assets || []).find(function(x) { return x.id === editId; });
        if (a) { Object.assign(a, obj); auditLog('inv', 'asset_modified', { type: 'asset', id: editId, label: obj.name }, ''); }
    } else {
        obj.id = invGenId();
        invState.assets.push(obj);
        auditLog('inv', 'asset_created', { type: 'asset', id: obj.id, label: obj.name }, '');
    }
    invSave(); invRender();
    document.getElementById('invModal').style.display = 'none';
}

// ══════════════════════════════════════════════════
// MANTENIMIENTO — Plan Maestro 52 semanas (COP15-F11, v16.4)
// ══════════════════════════════════════════════════
function invRenderMaint(el) {
    var year = window._invMaintYear || new Date().getFullYear();
    var overdue = invMaintOverdue();
    var dueThisWeek = invMaintDueThisWeek();
    var compliance = invMaintCompliance(year);
    var curWeek = invWeekOfYear(localToday());

    var html = '<div class="tp-card"><div class="tp-card-title" data-help="inv-maint-help"><span>🛠️ Mantenimiento</span>'
        + '<button class="tp-btn tp-btn-ghost" onclick="invImportF11()" style="font-size: var(--fs-xs);" title="Actualizar en bloque desde el CSV de Calibración del formato COP15-F11">📥 Importar F11</button></div>'
        + '<input type="file" id="inv-f11-import-file" accept=".csv" style="display:none;" onchange="invHandleF11Import(event)"></div>';

    // v16.6: banner de proyecto abierto ligado a un equipo (ej. "Reparación del Dinamómetro")
    if (typeof pnActiveProjectForAsset === 'function') {
        var linkedProjects = (invState.assets || []).map(function(a) {
            return { asset: a, project: pnActiveProjectForAsset(a.id) };
        }).filter(function(x) { return x.project; });
        if (linkedProjects.length > 0) {
            html += '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;margin-bottom:10px;">';
            linkedProjects.forEach(function(x) {
                var prog = typeof pnProjectProgress === 'function' ? pnProjectProgress(x.project) : { done: 0, total: 0, pct: 0 };
                html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;padding:3px 0;">';
                html += '<span style="font-size: var(--fs-sm);"><b>' + escapeHtml(x.asset.name) + '</b>: 🗂️ Proyecto abierto — ' + escapeHtml(x.project.name) + ' (' + prog.done + '/' + prog.total + ' pasos, ' + prog.pct + '%)</span>';
                html += '<button class="tp-btn tp-btn-ghost" onclick="window._pnSelectedProject=\'' + x.project.id + '\';dashGo(\'panel\',\'pn-projects\')" style="font-size: var(--fs-xs);">Ver →</button>';
                html += '</div>';
            });
            html += '</div>';
        }
    }

    if (overdue.length > 0) {
        html += '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;margin-bottom:10px;">';
        html += '<div style="font-weight:800;color:#b91c1c;font-size: var(--fs-sm);margin-bottom:6px;">⚠️ ' + overdue.length + ' mantenimiento(s) vencido(s)</div>';
        overdue.forEach(function(o) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #fecaca;flex-wrap:wrap;gap:4px;">';
            html += '<div><div style="font-size: var(--fs-sm);font-weight:700;">' + escapeHtml(o.asset ? o.asset.name : '?') + ' — ' + escapeHtml(o.act.desc) + '</div>';
            html += '<div style="font-size: var(--fs-xs);color:#7f1d1d;">Vencido desde semana ' + o.lastWeek + ' (' + o.count + ' semana' + (o.count > 1 ? 's' : '') + ' sin registrar)</div></div>';
            html += '<button class="tp-btn tp-btn-danger" onclick="invMaintMarkDone(\'' + o.act.id + '\');invRender();" style="font-size: var(--fs-xs);padding:4px 10px;">✔ Hecho</button>';
            html += '</div>';
        });
        html += '</div>';
    }

    html += '<div class="tp-card" style="margin-bottom:10px;"><div class="tp-card-title"><span>📅 Semana ' + curWeek + ' · ' + dueThisWeek.length + ' programado(s)</span></div>';
    if (dueThisWeek.length === 0) {
        html += '<div style="text-align:center;padding:10px;color:var(--tp-dim);font-size: var(--fs-sm);">Sin mantenimientos programados esta semana.</div>';
    } else {
        dueThisWeek.forEach(function(d) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 4px;border-bottom:1px solid var(--tp-border);flex-wrap:wrap;gap:4px;">';
            html += '<div><div style="font-size: var(--fs-sm);font-weight:700;">' + escapeHtml(d.asset ? d.asset.name : '?') + ' — ' + escapeHtml(d.act.desc) + '</div>';
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + escapeHtml(d.act.responsible || '') + '</div></div>';
            html += '<div style="display:flex;gap:5px;">';
            html += '<button class="tp-btn tp-btn-primary" onclick="invMaintMarkDone(\'' + d.act.id + '\');invRender();" style="font-size: var(--fs-xs);padding:4px 10px;">✔ Hecho</button>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="invShowMaintDetailModal(\'' + d.act.id + '\')" style="font-size: var(--fs-xs);">…con detalle</button>';
            html += '</div></div>';
        });
    }
    html += '</div>';

    html += '<div class="tp-card" style="margin-bottom:10px;"><div class="tp-card-title" data-help="inv-maint-compliance-help"><span>📊 Cumplimiento ' + year + '</span></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:6px;margin-bottom:8px;">';
    html += '<div class="tp-metric"><div class="tp-metric-val">' + compliance.planned + '</div><div class="tp-metric-label">Planeados</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--ok-text)">' + compliance.doneOnWeek + '</div><div class="tp-metric-label">En semana</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val">' + compliance.logged + '</div><div class="tp-metric-label">Registros (año)</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (compliance.pct >= 80 ? '#10b981' : compliance.pct >= 50 ? '#f59e0b' : '#ef4444') + '">' + compliance.pct + '%</div><div class="tp-metric-label">% Cumplimiento</div></div>';
    html += '</div>';
    if (compliance.byAsset.length > 0) {
        html += '<div style="overflow-x:auto;"><table style="width:100%;font-size: var(--fs-xs);border-collapse:collapse;"><thead><tr style="text-align:left;color:var(--tp-dim);"><th style="padding:4px;">Equipo</th><th style="padding:4px;">Plan</th><th style="padding:4px;">Real</th><th style="padding:4px;">%</th></tr></thead><tbody>';
        compliance.byAsset.forEach(function(b) {
            html += '<tr style="border-top:1px solid var(--tp-border);"><td style="padding:4px;">' + escapeHtml(b.name) + '</td><td style="padding:4px;">' + b.plan + '</td><td style="padding:4px;">' + b.real + '</td><td style="padding:4px;">' + (b.pct !== null ? b.pct + '%' : '—') + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }
    html += '</div>';

    var matrix = invMaintMatrix(year);
    var monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    html += '<details style="margin-bottom:10px;border:1px solid var(--tp-border);border-radius:8px;overflow:hidden;"><summary data-help="inv-maint-plan-help" style="cursor:pointer;padding:8px 10px;background:var(--tp-card);font-weight:700;font-size:12px;">🗓️ Plan Maestro — 52 semanas</summary>';
    html += '<div style="padding:8px;">';
    html += '<div style="margin-bottom:8px;"><label style="font-size: var(--fs-xs);color:var(--tp-dim);">Año: </label><select onchange="window._invMaintYear=parseInt(this.value);invRender();" style="padding:4px 8px;border:1px solid var(--tp-border);border-radius:6px;font-size: var(--fs-sm);">';
    for (var yy = year - 1; yy <= year + 1; yy++) html += '<option value="' + yy + '" ' + (yy === year ? 'selected' : '') + '>' + yy + '</option>';
    html += '</select></div>';
    if (matrix.length === 0) {
        html += '<div style="text-align:center;padding:14px;color:var(--tp-dim);font-size: var(--fs-sm);">Sin actividades activas. Agrega el catálogo abajo.</div>';
    } else {
        html += '<div style="overflow-x:auto;"><table style="border-collapse:collapse;font-size: var(--fs-xs);min-width:900px;">';
        html += '<tr><td style="min-width:130px;position:sticky;left:0;background:var(--tp-bg);"></td>';
        var wk = 1;
        while (wk <= 52) {
            var mon = new Date(invMondayOfWeek(year, wk) + 'T00:00:00').getMonth();
            var span = 0, w2 = wk;
            while (w2 <= 52 && new Date(invMondayOfWeek(year, w2) + 'T00:00:00').getMonth() === mon) { span++; w2++; }
            html += '<td colspan="' + span + '" style="text-align:center;padding:2px;color:var(--tp-dim);text-transform:uppercase;">' + monthNames[mon] + '</td>';
            wk = w2;
        }
        html += '</tr><tr><td style="position:sticky;left:0;background:var(--tp-bg);"></td>';
        for (var n = 1; n <= 52; n++) {
            html += '<td style="text-align:center;padding:1px;color:var(--tp-dim);' + (n === curWeek ? 'background:rgba(15,118,110,0.15);font-weight:800;' : '') + '">' + n + '</td>';
        }
        html += '</tr>';
        matrix.forEach(function(row) {
            html += '<tr><td style="position:sticky;left:0;background:var(--tp-card);padding:3px 6px;white-space:nowrap;font-weight:600;border-top:1px solid var(--tp-border);">' + escapeHtml(row.asset ? row.asset.name : '?') + '<div style="font-weight:400;color:var(--tp-dim);">' + escapeHtml(row.act.desc) + '</div></td>';
            row.weeks.forEach(function(w) {
                var cell = w.done ? '✓' : (w.planned ? 'P' : '');
                var bg = w.overdue ? 'background:#fecaca;' : (w.done ? 'background:#d1fae5;' : '');
                var clickable = w.planned && !w.done;
                html += '<td style="text-align:center;padding:1px;border-top:1px solid var(--tp-border);' + bg + (w.n === curWeek ? 'outline:1px solid #0f766e;' : '') + (clickable ? 'cursor:pointer;' : '') + '"' + (clickable ? ' onclick="invMaintMarkDone(\'' + row.act.id + '\',{date:\'' + invMondayOfWeek(year, w.n) + '\'});invRender();" title="Marcar hecho"' : '') + '>' + cell + '</td>';
            });
            html += '</tr>';
        });
        html += '</table></div>';
    }
    html += '</div></details>';

    html += '<details style="margin-bottom:10px;border:1px solid var(--tp-border);border-radius:8px;overflow:hidden;"><summary data-help="inv-maint-catalog-help" style="cursor:pointer;padding:8px 10px;background:var(--tp-card);font-weight:700;font-size:12px;">🔧 Catálogo de actividades (' + (invState.maintActivities || []).length + ')</summary>';
    html += '<div style="padding:8px;">';
    html += '<div style="text-align:right;margin-bottom:6px;"><button class="tp-btn tp-btn-primary" onclick="invAddMaintActivity()" style="font-size: var(--fs-xs);">+ Actividad</button></div>';
    (invState.maintActivities || []).forEach(function(a) {
        var asset = (invState.assets || []).find(function(x) { return x.id === a.assetId; });
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid var(--tp-border);flex-wrap:wrap;gap:4px;' + (a.active === false ? 'opacity:0.5;' : '') + '">';
        html += '<div><div style="font-size: var(--fs-sm);font-weight:700;">' + escapeHtml(asset ? asset.name : '?') + ' — ' + escapeHtml(a.desc) + '</div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + a.freq + ' · desde sem ' + a.startWeek + ' · ' + escapeHtml(a.responsible || '') + (a.active === false ? ' · INACTIVA' : '') + '</div></div>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invAddMaintActivity(\'' + a.id + '\')" style="font-size: var(--fs-xs);">✏️</button>';
        html += '</div>';
    });
    html += '</div></details>';

    var log = (invState.maintLog || []).slice().sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); }).slice(0, 50);
    html += '<details style="border:1px solid var(--tp-border);border-radius:8px;overflow:hidden;"><summary style="cursor:pointer;padding:8px 10px;background:var(--tp-card);font-weight:700;font-size:12px;">📋 Historial (' + (invState.maintLog || []).length + ')</summary>';
    html += '<div style="padding:8px;">';
    if (log.length === 0) {
        html += '<div style="text-align:center;padding:10px;color:var(--tp-dim);font-size: var(--fs-sm);">Sin mantenimientos registrados.</div>';
    } else {
        log.forEach(function(l) {
            var act = (invState.maintActivities || []).find(function(a) { return a.id === l.activityId; });
            var asset = act ? (invState.assets || []).find(function(x) { return x.id === act.assetId; }) : null;
            html += '<div style="display:flex;justify-content:space-between;padding:5px 4px;border-bottom:1px solid var(--tp-border);font-size: var(--fs-xs);flex-wrap:wrap;gap:4px;">';
            html += '<div>' + l.date + ' — ' + escapeHtml(asset ? asset.name : '?') + ' — ' + escapeHtml(act ? act.desc : '?') + '</div>';
            html += '<div style="color:var(--tp-dim);">' + escapeHtml(l.by || '') + (l.hours ? ' · ' + l.hours + 'h' : '') + '</div>';
            html += '</div>';
        });
    }
    html += '</div></details>';

    el.innerHTML = html;
}

function invShowMaintDetailModal(activityId) {
    var act = (invState.maintActivities || []).find(function(a) { return a.id === activityId; });
    if (!act) return;
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:380px;margin:60px auto;background:#fff;border-radius:14px;padding:20px;position:relative;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">✕</button>' +
        '<h3 style="margin:0 0 4px;">✔ Registrar mantenimiento</h3>' +
        '<div style="font-size: var(--fs-sm);color:#64748b;margin-bottom:14px;">' + escapeHtml(act.desc) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Fecha</label><input id="inv-mdet-date" type="date" value="' + localToday() + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Horas</label><input id="inv-mdet-hours" type="number" step="0.5" min="0" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Comentarios</label><input id="inv-mdet-comments" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveMaintDetail(\x27' + activityId + '\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function invSaveMaintDetail(activityId) {
    var date = document.getElementById('inv-mdet-date').value;
    var hours = parseFloat(document.getElementById('inv-mdet-hours').value) || null;
    var comments = document.getElementById('inv-mdet-comments').value.trim();
    invMaintMarkDone(activityId, { date: date, hours: hours, comments: comments });
    document.getElementById('invModal').style.display = 'none';
    invRender();
}

function invAddMaintActivity(editId) {
    var a = editId ? (invState.maintActivities || []).find(function(x) { return x.id === editId; }) : null;
    var isEdit = !!a;
    var v = function(f, d) { return a ? (a[f] != null ? a[f] : (d != null ? d : '')) : (d != null ? d : ''); };
    var assets = invState.assets || [];
    var assetOpts = assets.map(function(x) { return '<option value="' + x.id + '" ' + (v('assetId') === x.id ? 'selected' : '') + '>' + escapeHtml(x.name) + '</option>'; }).join('');
    var freqOpts = Object.keys(INV_MTTO_FREQ_WEEKS).map(function(f) { return '<option value="' + f + '" ' + (v('freq', 'Mensual') === f ? 'selected' : '') + '>' + f + '</option>'; }).join('');
    var inpStyle = 'width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;';
    var lblStyle = 'font-size: var(--fs-sm);color:#475569;font-weight:600;';

    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:420px;margin:50px auto;background:#fff;border-radius:14px;padding:20px;position:relative;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">✕</button>' +
        '<h3 style="margin:0 0 12px;">' + (isEdit ? 'Editar Actividad' : 'Nueva Actividad') + '</h3>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<div><label style="' + lblStyle + '">Equipo *</label><select id="inv-mact-asset" style="' + inpStyle + '">' + assetOpts + '</select></div>' +
        '<div><label style="' + lblStyle + '">Descripción *</label><input id="inv-mact-desc" value="' + escapeHtml(v('desc')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '" data-help="inv-mtto-freq">Frecuencia</label><select id="inv-mact-freq" style="' + inpStyle + '">' + freqOpts + '</select></div>' +
        '</div>' +
        '<details style="margin-top:10px;"><summary style="cursor:pointer;font-weight:700;font-size:12px;padding:6px 0;">Más detalles (semana, responsable…)</summary>' +
        '<div style="display:flex;flex-direction:column;gap:10px;padding-top:6px;">' +
        '<div><label style="' + lblStyle + '" data-help="inv-mtto-startweek">Semana inicio (1-52)</label><input id="inv-mact-startweek" type="number" min="1" max="52" value="' + v('startWeek', isEdit ? 1 : invWeekOfYear(localToday())) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="' + lblStyle + '">Responsable</label><input id="inv-mact-resp" value="' + escapeHtml(v('responsible', (typeof authState !== 'undefined' && authState.currentUser && authState.currentUser.name) || '')) + '" style="' + inpStyle + '"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="inv-mact-active" ' + (v('active', true) !== false ? 'checked' : '') + '> Activa</label></div>' +
        '</div></details>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveMaintActivity(\x27' + (editId || '') + '\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        (isEdit ? '<button onclick="showConfirm(\'Eliminar actividad?\',function(){invState.maintActivities=invState.maintActivities.filter(function(x){return x.id!==\x27' + editId + '\x27;});invSave();invRender();document.getElementById(\x27invModal\x27).style.display=\x27none\x27;},{title:\'Eliminar\',type:\'danger\',confirmText:\'Eliminar\'})" style="padding:10px;background:var(--danger-fill);color:#fff;border:none;border-radius:8px;cursor:pointer;">Eliminar</button>' : '') +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function invSaveMaintActivity(editId) {
    var obj = {
        assetId: document.getElementById('inv-mact-asset').value,
        desc: document.getElementById('inv-mact-desc').value.trim(),
        freq: document.getElementById('inv-mact-freq').value,
        startWeek: Math.max(1, Math.min(52, parseInt(document.getElementById('inv-mact-startweek').value) || 1)),
        responsible: document.getElementById('inv-mact-resp').value.trim(),
        active: document.getElementById('inv-mact-active').checked,
        updatedAt: new Date().toISOString()
    };
    if (!obj.desc) { showToast('Descripción requerida', 'error'); return; }
    if (editId) {
        var a = (invState.maintActivities || []).find(function(x) { return x.id === editId; });
        if (a) { Object.assign(a, obj); auditLog('inv', 'mtto_actividad_modificada', { type: 'maintenance', id: editId, label: obj.desc }, ''); }
    } else {
        obj.id = 'A-' + invGenId();
        invState.maintActivities.push(obj);
        auditLog('inv', 'mtto_actividad_creada', { type: 'maintenance', id: obj.id, label: obj.desc }, '');
    }
    invSave(); invRender();
    document.getElementById('invModal').style.display = 'none';
}

// ══════════════════════════════════════════════════
// PREDICTIONS
// ══════════════════════════════════════════════════
function invRenderPredict(el) {
    var gases = invState.gases.filter(function(g) { return g.readings && g.readings.length >= 2 && g.status === 'In use'; });
    var log = invState.usageLog || [];
    var rates = invCalcConsumptionRates();

    // ── Get test plan data for forward projection ──
    var tpAnalysis = [];
    var pendingByReg = {};
    try {
        if (typeof tpGetAnalysis === 'function') {
            tpAnalysis = tpGetAnalysis();
            tpAnalysis.forEach(function(a) {
                if (a.deficit > 0) {
                    var reg = (a.reg || a.desc.split(' ')[0] || 'General');
                    pendingByReg[reg] = (pendingByReg[reg] || 0) + a.deficit;
                }
            });
        }
    } catch (e) { /* Test Plan not loaded */ }
    var totalPending = Object.keys(pendingByReg).reduce(function(s, k) { return s + pendingByReg[k]; }, 0);

    // ── Count unique tests by regulation ──
    var regTestCounts = {};
    var seenVins = {};
    log.forEach(function(l) {
        var key = l.date + '|' + l.vin;
        if (seenVins[key]) return;
        seenVins[key] = true;
        var reg = l.regulation || 'General';
        regTestCounts[reg] = (regTestCounts[reg] || 0) + 1;
    });

    var html = '';

    // ═══════════════════════════════════════════════
    // 1. LEARNING STATUS HEADER
    // ═══════════════════════════════════════════════
    var hasAdaptiveData = rates.dataPoints > 0;
    var confidenceLabel = rates.dataPoints >= 20 ? 'Alta' : rates.dataPoints >= 5 ? 'Media' : rates.dataPoints > 0 ? 'Baja' : 'Sin datos';
    var confidenceClr = rates.dataPoints >= 20 ? '#10b981' : rates.dataPoints >= 5 ? '#f59e0b' : '#ef4444';

    html += '<div class="tp-card" style="border-left:3px solid ' + (hasAdaptiveData ? '#8b5cf6' : 'var(--tp-border)') + ';">';
    html += '<div class="tp-card-title" data-help="inv-predict-model"><span>Prediccion Activa de Consumo</span>';
    html += '<span style="font-size: var(--fs-xs);padding:2px 8px;border-radius:10px;background:' + confidenceClr + '20;color:' + confidenceClr + ';border:1px solid ' + confidenceClr + '30;">Confianza: ' + confidenceLabel + ' (' + rates.dataPoints + ' pts)</span></div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Modelo adaptativo: aprende del consumo real por regulacion. Se actualiza con cada lectura y liberacion de vehiculo.</div>';
    if (!hasAdaptiveData) {
        html += '<div style="text-align:center;padding:14px;color:var(--tp-dim);font-size: var(--fs-sm);">Aun no hay suficientes lecturas para predecir. La prediccion aprende de tus capturas diarias reales. <button class="tp-btn tp-btn-primary" onclick="invSwitchTab(\'inv-readings\')" style="font-size: var(--fs-xs);margin-left:6px;">📏 Ir a Capturar →</button></div>';
    }

    // Regulation test count badges
    var regKeys = Object.keys(regTestCounts);
    if (regKeys.length > 0) {
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">';
        regKeys.forEach(function(r) {
            html += '<span style="font-size: var(--fs-xs);padding:3px 8px;border-radius:4px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);color:#a78bfa;">' + r + ': ' + regTestCounts[r] + ' veh.</span>';
        });
        html += '</div>';
    }
    html += '</div>';

    // ═══════════════════════════════════════════════
    // 2. PER-REGULATION CONSUMPTION RATES
    // ═══════════════════════════════════════════════
    var allRegs = {};
    Object.keys(rates.gas).forEach(function(f) {
        Object.keys(rates.gas[f]).forEach(function(r) { allRegs[r] = true; });
    });
    Object.keys(rates.fuel).forEach(function(r) { allRegs[r] = true; });

    if (Object.keys(allRegs).length > 0) {
        html += '<div class="tp-card" style="border-left:3px solid #8b5cf6;">';
        html += '<div class="tp-card-title"><span>Consumo por Regulacion (EWMA)</span></div>';

        Object.keys(allRegs).sort().forEach(function(reg) {
            var pending = pendingByReg[reg] || 0;
            html += '<div style="margin-bottom:10px;padding:8px;border:1px solid var(--tp-border);border-radius:6px;background:rgba(139,92,246,0.03);">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
            html += '<span style="font-weight:800;font-size:12px;color:#a78bfa;">' + reg + '</span>';
            if (pending > 0) html += '<span style="font-size: var(--fs-xs);padding:2px 6px;border-radius:4px;background:rgba(59,130,246,0.1);color:var(--tp-blue);border:1px solid rgba(59,130,246,0.2);">' + pending + ' pruebas pendientes</span>';
            html += '</div>';

            // Gas rates for this regulation
            var gasFormulas = Object.keys(rates.gas).filter(function(f) { return rates.gas[f][reg]; });
            if (gasFormulas.length > 0) {
                html += '<div style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-dim);margin-bottom:3px;">Gas (psi/prueba):</div>';
                html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:3px;">';
                gasFormulas.forEach(function(f) {
                    var r = rates.gas[f][reg];
                    var conf = r.n >= 10 ? '#10b981' : r.n >= 3 ? '#f59e0b' : '#94a3b8';
                    html += '<div style="font-size: var(--fs-xs);padding:3px 6px;border-radius:4px;background:var(--tp-card);border:1px solid var(--tp-border);">';
                    html += '<span style="color:var(--tp-dim);">' + f + ':</span> <strong style="color:var(--tp-amber);">' + r.ewma.toFixed(1) + '</strong> psi';
                    html += ' <span style="font-size: var(--fs-xs);color:' + conf + ';">(' + r.n + ' obs)</span>';
                    html += '</div>';
                });
                html += '</div>';
            }

            // Fuel rate for this regulation
            if (rates.fuel[reg] && rates.fuel[reg].ewma > 0) {
                html += '<div style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-dim);margin-top:4px;margin-bottom:2px;">Combustible (' + (rates.fuel[reg].unit || 'L') + '/prueba):</div>';
                html += '<div style="font-size: var(--fs-xs);padding:3px 6px;border-radius:4px;background:var(--tp-card);border:1px solid var(--tp-border);display:inline-block;">';
                html += '<span style="color:var(--tp-dim);">' + (rates.fuel[reg].tankName || reg) + ':</span> <strong style="color:#f97316;">' + rates.fuel[reg].ewma.toFixed(1) + '</strong> ' + (rates.fuel[reg].unit || 'L');
                html += ' <span style="font-size: var(--fs-xs);color:' + (rates.fuel[reg].n >= 5 ? '#10b981' : '#f59e0b') + ';">(' + rates.fuel[reg].n + ' obs)</span>';
                html += '</div>';
            }

            html += '</div>';
        });
        html += '</div>';
    }

    // ═══════════════════════════════════════════════
    // 3. FORWARD PROJECTION (Test Plan Integration)
    // ═══════════════════════════════════════════════
    if (totalPending > 0 && hasAdaptiveData) {
        html += '<div class="tp-card" style="border-left:3px solid var(--tp-blue);">';
        html += '<div class="tp-card-title"><span>Proyeccion: Plan de Pruebas (' + totalPending + ' pendientes)</span></div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Consumo estimado para completar las pruebas pendientes del Test Plan.</div>';

        // Gas projection
        html += '<div style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-amber);margin-bottom:4px;">Gases</div>';
        var gasAlerts = [];
        invState.gases.filter(function(g) { return g.status === 'In use' && g.readings && g.readings.length > 0; }).forEach(function(g) {
            var lastPsi = g.readings[g.readings.length - 1].psi;
            var totalNeeded = 0;
            Object.keys(pendingByReg).forEach(function(reg) {
                if (rates.gas[g.formula] && rates.gas[g.formula][reg]) {
                    totalNeeded += rates.gas[g.formula][reg].ewma * pendingByReg[reg];
                }
            });
            if (totalNeeded > 0) {
                var sufficient = lastPsi >= totalNeeded;
                var pctUsed = Math.round((totalNeeded / lastPsi) * 100);
                var clr = sufficient ? (pctUsed > 70 ? '#f59e0b' : '#10b981') : '#ef4444';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;margin-bottom:2px;border-radius:4px;border:1px solid ' + clr + '30;background:' + clr + '08;">';
                html += '<span style="font-size: var(--fs-xs);">' + g.formula + ' ' + (g.concNominal || '') + ' <span style="color:var(--tp-dim);">#' + g.controlNo + '</span></span>';
                html += '<span style="font-size: var(--fs-xs);">necesita <strong>' + totalNeeded.toFixed(0) + '</strong> / tiene <strong>' + lastPsi + '</strong> psi';
                html += ' <span style="font-weight:700;color:' + clr + ';">' + (sufficient ? 'OK' : 'INSUFICIENTE') + '</span></span>';
                html += '</div>';
                if (!sufficient) gasAlerts.push(g.formula + ' ' + (g.concNominal || ''));
            }
        });

        // Fuel projection
        var fuelRegs = Object.keys(rates.fuel).filter(function(r) { return rates.fuel[r].ewma > 0 && pendingByReg[r]; });
        if (fuelRegs.length > 0) {
            html += '<div style="font-size: var(--fs-xs);font-weight:700;color:#f97316;margin-top:8px;margin-bottom:4px;">Combustible</div>';
            fuelRegs.forEach(function(reg) {
                var needed = rates.fuel[reg].ewma * pendingByReg[reg];
                (invState.fuelTanks || []).filter(function(t) { return t.regulation === reg; }).forEach(function(t) {
                    var sufficient = t.currentLevel >= needed;
                    var clr = sufficient ? '#10b981' : '#ef4444';
                    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;margin-bottom:2px;border-radius:4px;border:1px solid ' + clr + '30;background:' + clr + '08;">';
                    html += '<span style="font-size: var(--fs-xs);">' + t.name + '</span>';
                    html += '<span style="font-size: var(--fs-xs);">necesita <strong>' + needed.toFixed(1) + '</strong> / tiene <strong>' + t.currentLevel + '</strong> ' + (t.unit || 'L');
                    html += ' <span style="font-weight:700;color:' + clr + ';">' + (sufficient ? 'OK' : 'INSUFICIENTE') + '</span></span>';
                    html += '</div>';
                });
            });
        }

        if (gasAlerts.length > 0) {
            html += '<div style="margin-top:6px;padding:6px 10px;border-radius:6px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);font-size: var(--fs-xs);color:#fca5a5;">Atencion: ' + gasAlerts.join(', ') + ' no alcanzan para completar el plan.</div>';
        }
        html += '</div>';
    } else if (totalPending > 0 && !hasAdaptiveData) {
        html += '<div class="tp-card" style="border-left:3px solid var(--tp-border);"><div class="tp-card-title"><span>Proyeccion Plan (' + totalPending + ' pendientes)</span></div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);padding:10px;">El modelo aun no tiene suficientes datos. Conforme se liberen vehiculos y se registren lecturas, las predicciones por regulacion apareceran aqui.</div></div>';
    }

    // ═══════════════════════════════════════════════
    // 3.5 WEEKLY PLAN FORECAST (Mejora D)
    // ═══════════════════════════════════════════════
    var weeklyForecast = invForecastForWeeklyPlan(rates);
    if (weeklyForecast && weeklyForecast.items.length > 0) {
        var wf = weeklyForecast;
        var criticalCount = wf.items.filter(function(i) { return i.needsReorder; }).length;
        var borderColor = criticalCount > 0 ? '#ef4444' : '#10b981';
        html += '<div class="tp-card" style="border-left:3px solid ' + borderColor + ';">';
        html += '<div class="tp-card-title"><span>🗓 Forecast Semanal: ' + wf.planLabel + '</span>';
        if (criticalCount > 0) html += '<span style="font-size: var(--fs-xs);padding:2px 8px;border-radius:10px;background:rgba(239,68,68,0.15);color:var(--danger-text);border:1px solid rgba(239,68,68,0.3);">⚠ ' + criticalCount + ' requieren reorden</span>';
        html += '</div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Consumo estimado para el plan semanal aceptado (' + wf.testCount + ' pruebas). Basado en tasas EWMA aprendidas.</div>';

        // Gas forecast table
        var gasItems = wf.items.filter(function(i) { return i.type === 'gas'; });
        if (gasItems.length > 0) {
            html += '<div style="font-size: var(--fs-xs);font-weight:700;color:var(--tp-amber);margin-bottom:4px;">Gases</div>';
            gasItems.forEach(function(item) {
                var clr = item.needsReorder ? '#ef4444' : item.pctUsage > 50 ? '#f59e0b' : '#10b981';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;margin-bottom:2px;border-radius:4px;border:1px solid ' + clr + '30;background:' + clr + '08;flex-wrap:wrap;gap:4px;">';
                html += '<span style="font-size: var(--fs-xs);">' + item.name + '</span>';
                html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">';
                html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">Actual: <strong>' + item.currentLevel + '</strong> psi</span>';
                html += '<span style="font-size: var(--fs-xs);color:var(--tp-amber);">Uso plan: <strong>' + item.estimatedUsage.toFixed(0) + '</strong> psi</span>';
                html += '<span style="font-size: var(--fs-xs);color:' + clr + ';">Post-plan: <strong>' + item.postPlanLevel.toFixed(0) + '</strong> psi</span>';
                html += '<span style="font-size: var(--fs-xs);font-weight:700;color:' + clr + ';">' + item.recommendation + '</span>';
                html += '</div></div>';
            });
        }

        // Fuel forecast table
        var fuelItems = wf.items.filter(function(i) { return i.type === 'fuel'; });
        if (fuelItems.length > 0) {
            html += '<div style="font-size: var(--fs-xs);font-weight:700;color:#f97316;margin-top:8px;margin-bottom:4px;">Combustible</div>';
            fuelItems.forEach(function(item) {
                var clr = item.needsReorder ? '#ef4444' : item.pctUsage > 50 ? '#f59e0b' : '#10b981';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;margin-bottom:2px;border-radius:4px;border:1px solid ' + clr + '30;background:' + clr + '08;flex-wrap:wrap;gap:4px;">';
                html += '<span style="font-size: var(--fs-xs);">' + item.name + '</span>';
                html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">';
                html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">Actual: <strong>' + item.currentLevel + '</strong> ' + (item.unit || 'L') + '</span>';
                html += '<span style="font-size: var(--fs-xs);color:var(--tp-amber);">Uso plan: <strong>' + item.estimatedUsage.toFixed(1) + '</strong> ' + (item.unit || 'L') + '</span>';
                html += '<span style="font-size: var(--fs-xs);color:' + clr + ';">Post-plan: <strong>' + item.postPlanLevel.toFixed(1) + '</strong> ' + (item.unit || 'L') + '</span>';
                html += '<span style="font-size: var(--fs-xs);font-weight:700;color:' + clr + ';">' + item.recommendation + '</span>';
                html += '</div></div>';
            });
        }

        // Export button
        html += '<div style="margin-top:8px;display:flex;gap:8px;">';
        html += '<button onclick="invExportWeeklyForecast()" class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);">📤 Exportar CSV</button>';
        html += '</div>';
        html += '</div>';
    }

    // ═══════════════════════════════════════════════
    // 4. INDIVIDUAL GAS PREDICTIONS
    // ═══════════════════════════════════════════════
    if (gases.length === 0) {
        html += '<div class="tp-card" style="text-align:center;padding:20px;color:var(--tp-dim);">Necesitas al menos 2 lecturas en cilindros activos para ver predicciones individuales.</div>';
    } else {
        html += '<div class="tp-card"><div class="tp-card-title"><span>Estado Individual de Cilindros</span></div>';
        var predictions = gases.map(function(g) {
            var rdgs = g.readings;
            var first = rdgs[0]; var last = rdgs[rdgs.length - 1];
            var daysDiff = Math.max(1, Math.round((new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24)));
            var psiDrop = first.psi - last.psi;
            var dailyRate = psiDrop / daysDiff;

            // Use adaptive rate if available, otherwise fallback to linear
            var adaptiveRateLabel = '';
            var adaptivePsiPerTest = 0;
            if (rates.gas[g.formula]) {
                var regRates = rates.gas[g.formula];
                var regs = Object.keys(regRates);
                if (regs.length > 0) {
                    // Weighted average across regulations based on pending tests
                    var totalW = 0; var sumW = 0;
                    regs.forEach(function(r) {
                        var w = pendingByReg[r] || regTestCounts[r] || 1;
                        sumW += regRates[r].ewma * w;
                        totalW += w;
                    });
                    adaptivePsiPerTest = totalW > 0 ? sumW / totalW : 0;
                    adaptiveRateLabel = regs.map(function(r) {
                        return r + ': ' + regRates[r].ewma.toFixed(1);
                    }).join(', ');
                }
            }

            // Estimate tests remaining
            var testsRemaining = adaptivePsiPerTest > 0 ? Math.floor(last.psi / adaptivePsiPerTest) : 0;
            var weeklyRate = dailyRate * 7;
            var daysLeft = dailyRate > 0 ? Math.round(last.psi / dailyRate) : 999;
            var emptyDate = new Date(); emptyDate.setDate(emptyDate.getDate() + daysLeft);
            var pctLeft = first.psi > 0 ? Math.round((last.psi / first.psi) * 100) : 0;

            return { g: g, dailyRate: dailyRate, weeklyRate: weeklyRate, daysLeft: daysLeft, emptyDate: emptyDate, pctLeft: pctLeft, adaptivePsiPerTest: adaptivePsiPerTest, adaptiveRateLabel: adaptiveRateLabel, testsRemaining: testsRemaining, lastPsi: last.psi, readings: rdgs.length };
        }).sort(function(a, b) { return a.daysLeft - b.daysLeft; });

        predictions.forEach(function(p) {
            var g = p.g;
            var borderClr = p.daysLeft < 14 ? '#ef4444' : p.daysLeft < 30 ? '#f59e0b' : '#10b981';
            html += '<div style="padding:10px;margin-bottom:6px;border:1px solid var(--tp-border);border-radius:8px;border-left:3px solid ' + borderClr + ';background:var(--tp-card);">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">';
            html += '<div><span style="font-weight:700;font-size: var(--fs-sm);">' + g.formula + ' ' + (g.concNominal || '') + '</span> <span style="font-size: var(--fs-xs);color:var(--tp-dim);">#' + g.controlNo + ' (' + (g.zone || '?') + ')</span></div>';
            html += '<span style="font-size: var(--fs-xs);font-weight:700;color:' + borderClr + ';">' + (p.daysLeft > 365 ? '>1 ano' : '~' + p.daysLeft + ' dias') + '</span>';
            html += '</div>';
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:4px;margin-top:6px;">';
            html += '<div style="font-size: var(--fs-xs);"><span style="color:var(--tp-dim);">Actual:</span> <strong>' + p.lastPsi + ' psi</strong></div>';
            html += '<div style="font-size: var(--fs-xs);"><span style="color:var(--tp-dim);">psi/dia:</span> <strong>' + p.dailyRate.toFixed(1) + '</strong></div>';
            html += '<div style="font-size: var(--fs-xs);"><span style="color:var(--tp-dim);">psi/sem:</span> <strong>' + p.weeklyRate.toFixed(0) + '</strong></div>';
            if (p.adaptivePsiPerTest > 0) {
                html += '<div style="font-size: var(--fs-xs);"><span style="color:var(--tp-dim);">psi/prueba:</span> <strong style="color:#a78bfa;">' + p.adaptivePsiPerTest.toFixed(1) + '</strong></div>';
                html += '<div style="font-size: var(--fs-xs);"><span style="color:var(--tp-dim);">Pruebas rest.:</span> <strong style="color:var(--tp-amber);">' + p.testsRemaining + '</strong></div>';
            }
            html += '<div style="font-size: var(--fs-xs);"><span style="color:var(--tp-dim);">Vacio:</span> <strong>' + (p.daysLeft > 365 ? '>1 ano' : p.emptyDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })) + '</strong></div>';
            html += '</div>';
            // Per-regulation breakdown
            if (p.adaptiveRateLabel) {
                html += '<div style="font-size: var(--fs-xs);color:#a78bfa;margin-top:3px;">Tasa adaptativa: ' + p.adaptiveRateLabel + ' psi/prueba</div>';
            }
            html += '<div class="tp-bar" style="width:100%;margin-top:4px;height:6px;"><div class="tp-bar-fill" style="width:' + p.pctLeft + '%;background:' + (p.pctLeft < 15 ? '#ef4444' : p.pctLeft < 30 ? '#f59e0b' : '#10b981') + ';"></div></div>';
            html += '</div>';
        });
        html += '</div>';
    }

    // ═══════════════════════════════════════════════
    // 5. FUEL PREDICTIONS
    // ═══════════════════════════════════════════════
    var fuelTanks = invState.fuelTanks || [];
    var fuelWithReadings = fuelTanks.filter(function(t) { return t.readings && t.readings.length >= 1; });
    if (fuelWithReadings.length > 0) {
        html += '<div class="tp-card"><div class="tp-card-title"><span>Prediccion Combustible</span></div>';
        fuelWithReadings.forEach(function(t) {
            var rdgs = t.readings;
            var last = rdgs[rdgs.length - 1];
            var pct = t.capacity > 0 ? Math.round((last.level / t.capacity) * 100) : 0;
            var dailyRate = 0; var daysLeft = 999;
            if (rdgs.length >= 2) {
                var first = rdgs[0];
                var daysDiff = Math.max(1, Math.round((new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24)));
                var drop = first.level - last.level;
                dailyRate = drop / daysDiff;
                daysLeft = dailyRate > 0 ? Math.round(last.level / dailyRate) : 999;
            }
            var adaptiveFuelPerTest = (t.regulation && rates.fuel[t.regulation]) ? rates.fuel[t.regulation].ewma : 0;
            var testsRemaining = adaptiveFuelPerTest > 0 ? Math.floor(last.level / adaptiveFuelPerTest) : 0;
            var clr = daysLeft < 14 ? '#ef4444' : daysLeft < 30 ? '#f59e0b' : '#10b981';
            html += '<div style="padding:8px;margin-bottom:4px;border:1px solid var(--tp-border);border-radius:6px;border-left:3px solid ' + clr + ';background:var(--tp-card);">';
            html += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;">';
            html += '<div><strong>' + t.name + '</strong> <span style="font-size: var(--fs-xs);color:var(--tp-dim);">(' + (t.regulation || t.fuelType || '') + ')</span></div>';
            html += '<span style="font-size: var(--fs-xs);font-weight:700;color:' + clr + ';">' + (daysLeft > 365 ? '>1 ano' : '~' + daysLeft + ' dias') + '</span>';
            html += '</div>';
            html += '<div style="display:flex;gap:12px;font-size: var(--fs-xs);margin-top:4px;flex-wrap:wrap;">';
            html += '<span>Nivel: <strong>' + last.level + '/' + t.capacity + ' ' + (t.unit || 'L') + '</strong></span>';
            if (dailyRate > 0) html += '<span>' + (t.unit || 'L') + '/dia: <strong>' + dailyRate.toFixed(1) + '</strong></span>';
            if (dailyRate > 0) html += '<span>' + (t.unit || 'L') + '/sem: <strong>' + (dailyRate * 7).toFixed(1) + '</strong></span>';
            if (adaptiveFuelPerTest > 0) {
                html += '<span style="color:#f97316;">' + (t.unit || 'L') + '/prueba: <strong>' + adaptiveFuelPerTest.toFixed(1) + '</strong></span>';
                html += '<span style="color:var(--tp-amber);">Pruebas rest.: <strong>' + testsRemaining + '</strong></span>';
            }
            html += '</div>';
            html += '<div class="tp-bar" style="width:100%;margin-top:4px;height:6px;"><div class="tp-bar-fill" style="width:' + pct + '%;background:' + (pct < 15 ? '#ef4444' : pct < 30 ? '#f59e0b' : '#10b981') + ';"></div></div>';
            html += '</div>';
        });
        html += '</div>';
    }

    el.innerHTML = html;
}

// ══════════════════════════════════════════════════
// EXPORT / IMPORT
// ══════════════════════════════════════════════════
function invExportGases() {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(invState, null, 2)], {type:'application/json'}));
    a.download = 'kia_inventory_' + localToday() + '.json';
    a.click();
}
function invImportGases() { document.getElementById('inv-import-file').click(); }
function invHandleImport(event) {
    var f = event.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            if (data.gases) invState.gases = data.gases;
            if (data.equipment) invState.equipment = data.equipment;
            if (data.zones) invState.zones = data.zones;
            if (data.usageLog) invState.usageLog = data.usageLog;
            if (data.fuelTanks) invState.fuelTanks = data.fuelTanks;
            invSave(); invPreloadData(); invRender(); invUpdateBadges();
            showToast('Importado: ' + (invState.gases.length) + ' gases, ' + (invState.equipment.length) + ' equipos', 'success');
        } catch(err) { showToast('Error: ' + err.message, 'error'); }
    };
    r.readAsText(f);
    event.target.value = '';
}


// ══════════════════════════════════════════════════
// INVENTORY: CASCADE USAGE LOGGING
// ══════════════════════════════════════════════════
// opts.skipSave: el llamador (cascada de liberación) hace un único invSave al final
function invLogTestUsage(vehicle, opts) {
    if (!vehicle) return;
    var date = localToday();
    var regulation = vehicle.configCode ? vehicle.configCode.split(' ')[0] : '';

    // Capture specific cylinders "In use" with full traceability
    var inUseCylinders = invState.gases.filter(function(g) { return g.status === 'In use'; });
    var cylinderSnapshot = inUseCylinders.map(function(g) {
        var lastPsi = (g.readings && g.readings.length > 0) ? g.readings[g.readings.length - 1].psi : null;
        return {
            id: g.id,
            controlNo: g.controlNo,
            formula: g.formula,
            lotNumber: g.lotNumber || '',
            supplier: g.supplier || '',
            concNominal: g.concNominal || '',
            psi: lastPsi,
            validUntil: g.validUntil || ''
        };
    });

    // PSI snapshot (maintain backward compatibility for consumption rate calc)
    var psiSnapshot = {};
    inUseCylinders.forEach(function(g) {
        if (g.readings && g.readings.length > 0) {
            psiSnapshot[g.formula] = g.readings[g.readings.length - 1].psi;
        }
    });

    // Snapshot fuel levels for matching regulation
    var fuelSnapshot = {};
    (invState.fuelTanks || []).forEach(function(t) {
        if (t.regulation === regulation || !t.regulation) {
            fuelSnapshot[t.id] = t.currentLevel;
        }
    });

    // v15.9: modelo fresco ANTES de registrar esta prueba (aprende de lo anterior; esta
    // prueba entra al aprendizaje cuando lleguen las siguientes lecturas manuales)
    var model = invUpdateConsumptionModel();
    var typeRates = (model.perType && model.perType[regulation]) || null;

    var entry = {
        date: date,
        vin: vehicle.vin || '',
        configCode: vehicle.configCode || '',
        purpose: vehicle.purpose || '',
        regulation: regulation,
        cycle: (vehicle.testData && vehicle.testData.preconditioning && vehicle.testData.preconditioning.cycle) || '',
        timestamp: new Date().toISOString(),
        cylinders: cylinderSnapshot,
        psiSnap: psiSnapshot,
        fuelSnap: fuelSnapshot
    };

    // [V7-A2 → v15.9] Descuento de PSI APRENDIDO por tipo de prueba (regulación) y fórmula.
    // Fallback INV_PSI_FALLBACK (50) mientras n=0. Un estimado de 0 es legítimo ("este gas
    // no se consume en este tipo de prueba") y no genera lectura.
    var gasDeducted = {};
    inUseCylinders.forEach(function(g) {
        if (g.readings && g.readings.length > 0) {
            var lastReading = g.readings[g.readings.length - 1];
            var currentPsi = lastReading.psi;
            if (typeof currentPsi === 'number' && currentPsi > 0) {
                var learned = typeRates && typeRates.gases[g.formula] && typeRates.gases[g.formula].n > 0;
                var psiDeduct = Math.max(0, Math.round(learned ? typeRates.gases[g.formula].est : INV_PSI_FALLBACK));
                gasDeducted[g.formula] = psiDeduct;
                if (psiDeduct === 0) return;
                var newPsi = Math.max(0, currentPsi - psiDeduct);
                g.readings.push({
                    date: date,
                    psi: newPsi,
                    note: 'Auto-deducción por prueba (' + psiDeduct + ' psi ' + (learned ? 'aprendido' : 'estimado') + ') VIN:' + (vehicle.vin || '').slice(-4),
                    auto: true
                });
                // Alert if below 25%
                var maxPsi = g.initialPsi || 2200;
                var pct = (newPsi / maxPsi) * 100;
                if (pct < 25 && pct >= 0) {
                    showToast(g.formula + ' #' + g.controlNo + ' al ' + Math.round(pct) + '% - Considere reemplazo', 'warning');
                    if (typeof emitEvent === 'function') emitEvent('inventory:lowGas', { gas: g, pct: pct });
                }
            }
        }
    });
    entry.gasDeducted = gasDeducted;

    // v15.9: AUTO-DESCUENTO DE GASOLINA al tanque de la regulación de la prueba (el de
    // registro más reciente con nivel > 0 — resuelve tanques duplicados orden anterior/actual).
    var fuelDeducted = null;
    var tankCandidates = (invState.fuelTanks || []).filter(function(t) {
        return t.regulation === regulation && (t.currentLevel || 0) > 0;
    });
    if (tankCandidates.length) {
        tankCandidates.sort(function(a, b) { return String(b.regDate || '').localeCompare(String(a.regDate || '')); });
        var tank = tankCandidates[0];
        var fuelLearned = typeRates && typeRates.fuelL && typeRates.fuelL.n > 0;
        var liters = Math.round((fuelLearned ? typeRates.fuelL.est : INV_FUEL_FALLBACK_L) * 10) / 10;
        if (liters > 0) {
            tank.currentLevel = Math.max(0, Math.round((tank.currentLevel - liters) * 10) / 10);
            if (!tank.readings) tank.readings = [];
            tank.readings.push({
                date: date,
                level: tank.currentLevel,
                auto: true,
                note: 'Auto-descuento por prueba (' + liters + ' L ' + (fuelLearned ? 'aprendido' : 'estimado') + ') VIN:' + (vehicle.vin || '').slice(-4)
            });
            fuelDeducted = { tankId: tank.id, tankName: tank.name, liters: liters, learned: !!fuelLearned };
            if (typeof auditLog === 'function') {
                auditLog('inv', 'fuel_auto_deduct', { type: 'fuel', id: tank.id, label: tank.name },
                    liters + ' L (' + (fuelLearned ? 'aprendido' : 'estimado inicial') + ') · VIN ' + (vehicle.vin || ''));
            }
        }
    }
    entry.fuelDeducted = fuelDeducted;

    invState.usageLog.push(entry);

    // Keep log manageable
    if (invState.usageLog.length > 3000) invState.usageLog = invState.usageLog.slice(-2000);
    if (typeof emitEvent === 'function') emitEvent('inventory:consumption', { regulation: regulation, gasDeducted: gasDeducted, fuelDeducted: fuelDeducted });
    if (!(opts && opts.skipSave)) invSave();
}

// ══════════════════════════════════════════════════
// GAS LOT → TEST TRACEABILITY
// ══════════════════════════════════════════════════

// Find all tests where a specific cylinder was used
function invTraceByGas(gasId) {
    return (invState.usageLog || []).filter(function(entry) {
        if (!entry.cylinders) return false;
        return entry.cylinders.some(function(c) { return c.id === gasId; });
    });
}

// Find all tests linked to a specific lot number
function invTraceByLot(lotNumber) {
    if (!lotNumber) return [];
    var lot = lotNumber.trim().toLowerCase();
    return (invState.usageLog || []).filter(function(entry) {
        if (!entry.cylinders) return false;
        return entry.cylinders.some(function(c) { return (c.lotNumber || '').toLowerCase() === lot; });
    });
}

// Find which cylinders were used for a specific VIN
function invTraceByVin(vin) {
    if (!vin) return [];
    var vinUp = vin.trim().toUpperCase();
    return (invState.usageLog || []).filter(function(entry) {
        return (entry.vin || '').toUpperCase().indexOf(vinUp) !== -1 && entry.cylinders;
    });
}

// Traceability tab renderer
function invRenderTrace(el) {
    var html = '<div class="tp-card" style="margin-bottom:10px;">' +
        '<div class="tp-card-title"><span>🔗 Trazabilidad Gas ↔ Prueba</span></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">' +
        '<div style="flex:1;min-width:140px;">' +
        '<label style="font-size: var(--fs-sm);color:#475569;font-weight:600;display:block;margin-bottom:3px;">Buscar por</label>' +
        '<select id="inv-trace-mode" onchange="invTraceSearch()" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;">' +
        '<option value="gas">Cilindro</option><option value="lot">No. Lote</option><option value="vin">VIN</option></select></div>' +
        '<div style="flex:2;min-width:200px;" id="inv-trace-input-wrap">' +
        '<label style="font-size: var(--fs-sm);color:#475569;font-weight:600;display:block;margin-bottom:3px;">Valor</label>' +
        '<input id="inv-trace-q" aria-label="Buscar en trazabilidad" placeholder="Escribe para buscar..." onkeyup="invTraceSearch()" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;">' +
        '</div>' +
        '<button onclick="invTraceSearch()" class="tp-btn tp-btn-primary" style="padding:8px 14px;">Buscar</button>' +
        '</div></div>' +
        '<div id="inv-trace-results" style="font-size:12px;"></div>';

    // Also show gas dropdown for "gas" mode
    html += '<div id="inv-trace-gas-select" style="display:none;margin-bottom:8px;">' +
        '<select id="inv-trace-gas-id" onchange="invTraceSearch()" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;">' +
        '<option value="">— Seleccionar cilindro —</option>';
    invState.gases.forEach(function(g) {
        html += '<option value="' + g.id + '">' + g.controlNo + ' — ' + g.formula + (g.lotNumber ? ' (Lote: ' + g.lotNumber + ')' : '') + '</option>';
    });
    html += '</select></div>';

    el.innerHTML = html;

    // Wire up mode switching to show/hide gas dropdown
    var modeEl = document.getElementById('inv-trace-mode');
    if (modeEl) {
        modeEl.addEventListener('change', function() {
            var gasSelect = document.getElementById('inv-trace-gas-select');
            var inputWrap = document.getElementById('inv-trace-input-wrap');
            if (this.value === 'gas') {
                gasSelect.style.display = 'block';
                inputWrap.style.display = 'none';
            } else {
                gasSelect.style.display = 'none';
                inputWrap.style.display = 'block';
                document.getElementById('inv-trace-q').placeholder = this.value === 'lot' ? 'Número de lote...' : 'VIN completo o parcial...';
            }
        });
        // Trigger initial state
        modeEl.dispatchEvent(new Event('change'));
    }
}

function invTraceSearch() {
    var mode = document.getElementById('inv-trace-mode').value;
    var results = [];

    if (mode === 'gas') {
        var gasId = document.getElementById('inv-trace-gas-id').value;
        if (gasId) results = invTraceByGas(gasId);
    } else if (mode === 'lot') {
        var lot = document.getElementById('inv-trace-q').value;
        if (lot.trim()) results = invTraceByLot(lot);
    } else {
        var vin = document.getElementById('inv-trace-q').value;
        if (vin.trim()) results = invTraceByVin(vin);
    }

    var el = document.getElementById('inv-trace-results');
    if (!el) return;

    if (results.length === 0) {
        el.innerHTML = '<div class="tp-card" style="text-align:center;padding:20px;color:var(--muted);">Sin resultados' + (mode === 'gas' && !document.getElementById('inv-trace-gas-id').value ? ' — selecciona un cilindro' : '') + '</div>';
        return;
    }

    var html = '<div style="margin-bottom:6px;font-weight:600;color:var(--accent-results);">' + results.length + ' prueba' + (results.length !== 1 ? 's' : '') + ' encontrada' + (results.length !== 1 ? 's' : '') + '</div>';

    results.sort(function(a, b) { return (b.timestamp || b.date || '').localeCompare(a.timestamp || a.date || ''); });

    results.forEach(function(entry) {
        html += '<div class="tp-card" style="padding:10px 12px;margin-bottom:6px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-weight:600;">VIN: ' + (entry.vin || '?') + '</span>' +
            '<span style="font-size: var(--fs-xs);color:var(--muted);">' + (entry.date || (entry.timestamp || '').slice(0,10)) + '</span></div>' +
            '<div style="font-size: var(--fs-sm);color:#64748b;margin-top:3px;">Config: ' + (entry.configCode || '?') + ' · ' + (entry.purpose || '') + '</div>';

        // Show cylinders
        if (entry.cylinders && entry.cylinders.length > 0) {
            html += '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">';
            entry.cylinders.forEach(function(c) {
                var highlight = '';
                if (mode === 'gas' && c.id === document.getElementById('inv-trace-gas-id').value) highlight = 'border:2px solid #0f766e;';
                if (mode === 'lot' && (c.lotNumber || '').toLowerCase() === (document.getElementById('inv-trace-q').value || '').trim().toLowerCase()) highlight = 'border:2px solid #0f766e;';
                html += '<div style="background:#f0fdf4;border-radius:6px;padding:4px 8px;font-size: var(--fs-xs);' + highlight + '">' +
                    '<strong>' + c.controlNo + '</strong> ' + c.formula +
                    (c.lotNumber ? ' <span style="color:var(--accent-results);">Lote: ' + c.lotNumber + '</span>' : '') +
                    (c.psi !== null ? ' · ' + c.psi + ' PSI' : '') +
                    '</div>';
            });
            html += '</div>';
        }

        html += '</div>';
    });

    el.innerHTML = html;
}

// ══════════════════════════════════════════════════
// ACTIVE PREDICTION ENGINE — Consumption Rate Calculator
// ══════════════════════════════════════════════════
// v15.9 — Fallbacks del modelo de consumo (mientras no hay aprendizaje suficiente, n=0)
var INV_PSI_FALLBACK = 50;    // PSI/prueba (mismo valor que el descuento fijo histórico)
var INV_FUEL_FALLBACK_L = 15; // L de gasolina/prueba

function invCalcConsumptionRates() {
    var rates = { gas: {}, fuel: {}, lastCalc: new Date().toISOString(), dataPoints: 0 };
    var log = invState.usageLog || [];
    if (log.length === 0) return rates;

    var ALPHA = 0.3; // EWMA weight for newest observation

    // ── GAS RATES: correlate readings with test events ──
    var gasFormulas = {};
    invState.gases.forEach(function(g) {
        if (g.status !== 'In use' || !g.readings || g.readings.length < 2) return;
        if (!gasFormulas[g.formula]) gasFormulas[g.formula] = [];
        gasFormulas[g.formula].push(g);
    });

    Object.keys(gasFormulas).forEach(function(formula) {
        var formulaLog = log.filter(function(l) {
            // Backward compat: old entries have gasFormula, new entries have cylinders[]
            if (l.gasFormula) return l.gasFormula === formula;
            if (l.cylinders) return l.cylinders.some(function(c) { return c.formula === formula; });
            return false;
        });
        if (formulaLog.length === 0) return;

        // Use primary cylinder for rate calc.
        // v15.9: SOLO lecturas manuales — las lecturas auto (descuento por prueba) generan
        // drops sintéticos que envenenan el aprendizaje. Las caídas entre lecturas manuales
        // sí reflejan consumo real aunque en medio haya lecturas auto.
        var g = gasFormulas[formula][0];
        var readings = (g.readings || []).filter(function(r) { return !r.auto; })
            .slice().sort(function(a, b) { return a.date.localeCompare(b.date); });
        if (readings.length < 2) return;

        // EWMA en línea, cronológico. est[reg] = estimado vigente (para reparto proporcional
        // en días con tipos mezclados); bootstrap = INV_PSI_FALLBACK.
        var est = {};
        var getEst = function(reg) { return est[reg] !== undefined ? est[reg] : INV_PSI_FALLBACK; };
        var pushObs = function(reg, ppt, cnt, d1, d2) {
            if (!rates.gas[formula]) rates.gas[formula] = {};
            if (!rates.gas[formula][reg]) rates.gas[formula][reg] = { obs: [], ewma: 0, n: 0 };
            var r = rates.gas[formula][reg];
            r.obs.push({ ppt: ppt, cnt: cnt, d1: d1, d2: d2 });
            est[reg] = (r.n === 0) ? ppt : (ALPHA * ppt + (1 - ALPHA) * est[reg]);
            r.ewma = est[reg];
            r.n += cnt;
            rates.dataPoints += cnt;
        };

        for (var i = 0; i < readings.length - 1; i++) {
            var d1 = readings[i].date;
            var d2 = readings[i + 1].date;
            var psiDrop = readings[i].psi - readings[i + 1].psi;
            // v15.9: drop de 0 CON pruebas en medio = observación legítima de consumo cero
            // ("este gas no se usa en este tipo de prueba") — antes se descartaba y el gas
            // sin consumo seguía descontando el fallback de 50. Negativo = recarga, se omite.
            if (psiDrop < 0) continue;

            var testsBetween = formulaLog.filter(function(l) {
                return l.date >= d1 && l.date <= d2;
            });
            if (testsBetween.length === 0) continue;

            // Group by regulation
            var regCounts = {};
            testsBetween.forEach(function(l) {
                var reg = l.regulation || 'General';
                regCounts[reg] = (regCounts[reg] || 0) + 1;
            });
            var totalTests = testsBetween.length;
            var regKeys = Object.keys(regCounts);

            if (regKeys.length === 1) {
                // Un solo tipo — medición directa
                pushObs(regKeys[0], psiDrop / totalTests, totalTests, d1, d2);
            } else {
                // Tipos mezclados — reparto proporcional a los estimados vigentes
                // (la suma de las porciones cierra exactamente con el drop observado)
                var sumW = 0;
                regKeys.forEach(function(reg) { sumW += regCounts[reg] * getEst(reg); });
                regKeys.forEach(function(reg) {
                    var share = sumW > 0
                        ? psiDrop * (regCounts[reg] * getEst(reg)) / sumW
                        : psiDrop / regKeys.length;
                    pushObs(reg, share / regCounts[reg], regCounts[reg], d1, d2);
                });
            }
        }
    });

    // ── FUEL RATES: correlate fuel readings with test events ──
    (invState.fuelTanks || []).forEach(function(t) {
        if (!t.readings || !t.regulation) return;
        // v15.9: solo lecturas manuales (las auto del descuento por prueba no enseñan nada nuevo)
        var readings = t.readings.filter(function(r) { return !r.auto; })
            .slice().sort(function(a, b) { return a.date.localeCompare(b.date); });
        if (readings.length < 2) return;
        var reg = t.regulation;

        // Deduplicate tests by date+vin (one release = one fuel usage)
        var regTests = log.filter(function(l) { return l.regulation === reg; });
        var uniqueTests = [];
        var seen = {};
        regTests.forEach(function(l) {
            var key = l.date + '|' + l.vin;
            if (!seen[key]) { seen[key] = true; uniqueTests.push(l); }
        });

        if (!rates.fuel[reg]) rates.fuel[reg] = { obs: [], ewma: 0, n: 0, unit: t.unit || 'L', tankName: t.name };

        for (var i = 0; i < readings.length - 1; i++) {
            var d1 = readings[i].date;
            var d2 = readings[i + 1].date;
            var levelDrop = readings[i].level - readings[i + 1].level;
            if (levelDrop < 0) continue; // negativo = recarga; 0 con pruebas = consumo cero legítimo

            var testsBetween = uniqueTests.filter(function(l) { return l.date >= d1 && l.date <= d2; });
            if (testsBetween.length === 0) continue;

            rates.fuel[reg].obs.push({ fpt: levelDrop / testsBetween.length, cnt: testsBetween.length, d1: d1, d2: d2 });
        }

        // EWMA for fuel
        if (rates.fuel[reg].obs.length > 0) {
            rates.fuel[reg].obs.sort(function(a, b) { return a.d1.localeCompare(b.d1); });
            var ewma = rates.fuel[reg].obs[0].fpt;
            for (var j = 1; j < rates.fuel[reg].obs.length; j++) {
                ewma = ALPHA * rates.fuel[reg].obs[j].fpt + (1 - ALPHA) * ewma;
            }
            rates.fuel[reg].ewma = ewma;
            rates.fuel[reg].n = rates.fuel[reg].obs.reduce(function(s, v) { return s + v.cnt; }, 0);
            rates.dataPoints += rates.fuel[reg].n;
        }
    });

    return rates;
}

// v15.9 — Modelo de consumo persistido en invState.consumption. Es un CACHE DETERMINISTA
// derivado de usageLog + readings (ambos ya sincronizados): cada dispositivo lo recomputa
// tras capturas/pruebas/pull — nunca se mergea. Consumidores: descuento por prueba
// (invLogTestUsage), predicción (invForecastGasNeeds), tablero HOY y alertas del Panel.
function invUpdateConsumptionModel() {
    var rates = invCalcConsumptionRates();
    var perType = {};
    Object.keys(rates.gas).forEach(function(formula) {
        Object.keys(rates.gas[formula]).forEach(function(reg) {
            var r = rates.gas[formula][reg];
            if (!perType[reg]) perType[reg] = { gases: {}, fuelL: null };
            perType[reg].gases[formula] = { est: Math.round(r.ewma * 10) / 10, n: r.n };
        });
    });
    Object.keys(rates.fuel).forEach(function(reg) {
        var r = rates.fuel[reg];
        if (r.n === 0) return;
        if (!perType[reg]) perType[reg] = { gases: {}, fuelL: null };
        perType[reg].fuelL = { est: Math.round(r.ewma * 10) / 10, n: r.n, unit: r.unit || 'L', tankName: r.tankName || '' };
    });
    invState.consumption = {
        perType: perType,
        updatedAt: new Date().toISOString(),
        dataPoints: rates.dataPoints,
        version: 1
    };
    return invState.consumption;
}

// ══════════════════════════════════════════════════
// INVENTORY: FUEL MANAGEMENT
// ══════════════════════════════════════════════════
function invRenderFuel(el) {
    if (!invState.fuelTanks) invState.fuelTanks = [];
    var tanks = invState.fuelTanks;

    var html = '<div class="tp-card"><div class="tp-card-title" data-help="inv-fuel-help"><span>Combustible de Referencia</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invAddFuelTank()" style="font-size: var(--fs-xs);">+ Agregar Tambo</button></div>';

    if (tanks.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Sin tambos registrados. Agrega tus tambos de gasolina, diesel, etc.</div>';
    } else {
        tanks.forEach(function(t) {
            var pct = t.capacity > 0 ? Math.round((t.currentLevel / t.capacity) * 100) : 0;
            var clr = pct < 15 ? '#ef4444' : pct < 30 ? '#f59e0b' : '#10b981';
            html += '<div style="padding:10px;margin-bottom:6px;border:1px solid var(--tp-border);border-radius:8px;border-left:3px solid ' + clr + ';background:var(--tp-card);">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">';
            html += '<div><span style="font-weight:700;font-size:12px;">' + t.name + '</span>';
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + (t.fuelType||'') + ' | ' + (t.octane||'') + ' | ' + (t.supplier||'') + '</div></div>';
            html += '<div style="display:flex;gap:6px;align-items:center;">';
            html += '<span style="font-size: var(--fs-xs);font-weight:700;color:' + clr + ';">' + t.currentLevel + '/' + t.capacity + ' ' + (t.unit||'L') + ' (' + pct + '%)</span>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="invEditFuelTank(\x27' + t.id + '\x27)" style="font-size: var(--fs-xs);" title="Editar" aria-label="Editar tanque">\u270F</button>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="invFuelReading(\x27' + t.id + '\x27)" style="font-size: var(--fs-xs);" title="Registrar lectura" aria-label="Registrar lectura de nivel">\u{1F4CF}</button>';
            html += '</div></div>';
            // Progress bar
            html += '<div class="tp-bar" style="width:100%;margin-top:4px;height:8px;"><div class="tp-bar-fill" style="width:' + pct + '%;background:' + clr + ';"></div></div>';
            // Readings mini history
            if (t.readings && t.readings.length > 0) {
                html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:4px;">Ultimas: ' + t.readings.slice(-5).map(function(r){return r.date + ': ' + r.level + (t.unit||'L');}).join(' | ') + '</div>';
            }
            html += '</div>';
        });
    }
    html += '</div>';
    el.innerHTML = html;
}

function invAddFuelTank(editId) {
    var t = editId ? (invState.fuelTanks||[]).find(function(x){return x.id===editId;}) : null;
    var isEdit = !!t;
    var v = function(f,d){ return t ? (t[f]||'') : (d||''); };
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:450px;margin:30px auto;background:#fff;border-radius:14px;padding:20px;position:relative;max-height:90vh;overflow-y:auto;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">\u2715</button>' +
        '<h3 style="margin:0 0 12px;color:#0f172a;">' + (isEdit ? 'Editar Tambo' : 'Nuevo Tambo') + '</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div style="grid-column:1/-1;"><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Nombre *</label><input id="inv-ft-name" value="' + v('name','Tambo') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Tipo combustible</label><input id="inv-ft-type" value="' + v('fuelType','Gasolina Referencia') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Regulacion</label><input id="inv-ft-reg" value="' + v('regulation') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Octanaje/Spec</label><input id="inv-ft-octane" value="' + v('octane','87 AKI') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Proveedor</label><input id="inv-ft-supplier" value="' + v('supplier') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Capacidad</label><input id="inv-ft-cap" type="number" value="' + v('capacity','400') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Nivel actual</label><input id="inv-ft-level" type="number" value="' + v('currentLevel','400') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Unidad</label><select id="inv-ft-unit" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"><option ' + (v('unit')==='L'?'selected':'') + '>L</option><option ' + (v('unit')==='gal'?'selected':'') + '>gal</option></select></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Fecha recepcion</label><input id="inv-ft-date" type="date" value="' + v('regDate',localToday()) + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Estatus</label><select id="inv-ft-status" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"><option ' + (v('fuelStatus')==='Abierto'?'selected':'') + '>Abierto</option><option ' + (v('fuelStatus')==='Cerrado'?'selected':'') + '>Cerrado</option></select></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveFuelTank(\x27' + (editId||'') + '\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        (isEdit ? '<button onclick="showConfirm(\'Eliminar tanque?\',function(){invState.fuelTanks=invState.fuelTanks.filter(function(x){return x.id!==\x27' + editId + '\x27;});invSave();invRender();document.getElementById(\x27invModal\x27).style.display=\x27none\x27;},{title:\'Eliminar\',type:\'danger\',confirmText:\'Eliminar\'})" style="padding:10px;background:var(--danger-fill);color:#fff;border:none;border-radius:8px;cursor:pointer;">Eliminar</button>' : '') +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}

function invSaveFuelTank(editId) {
    var obj = {
        name: document.getElementById('inv-ft-name').value.trim(),
        fuelType: document.getElementById('inv-ft-type').value.trim(),
        regulation: document.getElementById('inv-ft-reg').value.trim(),
        octane: document.getElementById('inv-ft-octane').value.trim(),
        supplier: document.getElementById('inv-ft-supplier').value.trim(),
        capacity: parseFloat(document.getElementById('inv-ft-cap').value) || 0,
        currentLevel: parseFloat(document.getElementById('inv-ft-level').value) || 0,
        unit: document.getElementById('inv-ft-unit').value,
        regDate: document.getElementById('inv-ft-date').value,
        fuelStatus: document.getElementById('inv-ft-status').value
    };
    if (!obj.name) { showToast('Nombre requerido', 'error'); return; }
    if (editId) {
        var t = (invState.fuelTanks||[]).find(function(x){return x.id===editId;});
        if (t) {
            if (!t.timeline) t.timeline = [];
            if (t.fuelStatus !== obj.fuelStatus) t.timeline.push({date:new Date().toISOString(),action:'Estatus: ' + (t.fuelStatus||'?') + ' → ' + obj.fuelStatus});
            t.timeline.push({date:new Date().toISOString(),action:'Modificado'});
            Object.assign(t, obj);
            t.readings = t.readings || [];
            auditLog('inv', 'fuel_modified', {type:'fuel', id:editId, label:obj.name}, obj.fuelType + ' ' + obj.octane);
        }
    } else {
        if (!invState.fuelTanks) invState.fuelTanks = [];
        obj.id = invGenId();
        obj.readings = [];
        obj.timeline = [{date:new Date().toISOString(),action:'Recepcion'}];
        invState.fuelTanks.push(obj);
        auditLog('inv', 'fuel_created', {type:'fuel', id:obj.id, label:obj.name}, obj.fuelType + ' ' + obj.octane);
    }
    invSave(); invRender();
    document.getElementById('invModal').style.display = 'none';
}

function invEditFuelTank(id) { invAddFuelTank(id); }

function invFuelReading(tankId) {
    var t = (invState.fuelTanks||[]).find(function(x){return x.id===tankId;});
    if (!t) return;
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:360px;margin:40px auto;background:#fff;border-radius:14px;padding:20px;position:relative;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">\u2715</button>' +
        '<h3 style="margin:0 0 12px;color:#0f172a;">Lectura: ' + t.name + '</h3>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Nivel actual (' + (t.unit||'L') + ')</label>' +
        '<input id="inv-fuel-level" type="number" step="0.1" value="' + (t.currentLevel||0) + '" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:6px;font-size:16px;margin-top:4px;"></div>' +
        '<button onclick="invSaveFuelReading(\x27' + tankId + '\x27)" style="width:100%;margin-top:14px;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar Lectura</button>' +
        '</div>';
    setTimeout(function(){ var inp = document.getElementById('inv-fuel-level'); if(inp) inp.focus(); }, 100);
}

function invSaveFuelReading(tankId) {
    var t = (invState.fuelTanks||[]).find(function(x){return x.id===tankId;});
    if (!t) return;
    var level = parseFloat(document.getElementById('inv-fuel-level').value);
    if (isNaN(level)) { showToast('Nivel inválido', 'error'); return; }
    t.currentLevel = level;
    if (!t.readings) t.readings = [];
    var fuelDate = localToday();
    t.readings.push({ date: fuelDate, level: level });
    invState.lastReadingDate = fuelDate;
    if (typeof auditLog === 'function') auditLog('inv', 'fuel_reading', {type:'fuel', id:t.id, label:(t.name||t.id)}, level + ' ' + (t.unit||'L') + ' (' + fuelDate + ')');
    invSave(); invRender();
    document.getElementById('invModal').style.display = 'none';
    showToast('Lectura guardada: ' + level + ' ' + (t.unit||'L'), 'success');
}

// ══════════════════════════════════════════════════
// INVENTORY: CONFIGURATION
// ══════════════════════════════════════════════════

// ══════════════════════════════════════════════════
// INVENTORY: WEEKLY REPORT (email-style)
// ══════════════════════════════════════════════════
function invRenderReport(el) {
    var today = new Date();
    var monday = new Date(today); monday.setDate(today.getDate() - today.getDay() + 1);
    var friday = new Date(monday); friday.setDate(monday.getDate() + 4);
    var fmt = function(d){ return d.toLocaleDateString('en-US',{month:'long',day:'numeric'}); };
    var weekLabel = fmt(monday) + ' - ' + fmt(friday) + ', ' + today.getFullYear();

    var html = '<div class="tp-card"><div class="tp-card-title" data-help="inv-report-help"><span>Reporte Semanal de Consumibles</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invExportReport()" style="font-size: var(--fs-xs);">Copiar HTML</button></div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Semana: ' + weekLabel + '</div>';

    // ── FUEL SECTION ──
    html += '<h3 style="margin:12px 0 6px;font-size:13px;color:var(--tp-text);">1. Reference fuel consumption status</h3>';
    var tanks = invState.fuelTanks || [];
    tanks.forEach(function(t) {
        var used = t.capacity - t.currentLevel;
        var remaining = t.currentLevel;
        var pctUsed = t.capacity > 0 ? Math.round((used / t.capacity) * 100) : 0;
        var pctRemaining = 100 - pctUsed;
        // Stacked bar chart (CSS)
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-weight:700;font-size: var(--fs-sm);color:var(--tp-amber);margin-bottom:4px;">' + (t.regulation||t.name) + '</div>';
        html += '<div style="display:flex;align-items:center;gap:10px;">';
        // Chart
        html += '<div style="width:200px;height:120px;border:1px solid var(--tp-border);border-radius:6px;padding:8px;background:var(--tp-card);position:relative;">';
        html += '<div style="font-size: var(--fs-xs);text-align:center;margin-bottom:4px;">Fuel Status ' + (t.regulation||t.name) + '</div>';
        html += '<div style="display:flex;height:80px;align-items:flex-end;justify-content:center;gap:0;">';
        var barH = 70;
        html += '<div style="width:80px;height:' + barH + 'px;display:flex;flex-direction:column;">';
        html += '<div style="height:' + (pctRemaining * barH / 100) + 'px;background:#22c55e;display:flex;align-items:center;justify-content:center;color:#fff;font-size: var(--fs-xs);font-weight:700;">' + remaining + '</div>';
        html += '<div style="height:' + (pctUsed * barH / 100) + 'px;background:#c2410c;display:flex;align-items:center;justify-content:center;color:#fff;font-size: var(--fs-xs);font-weight:700;">' + (used > 0 ? used : '') + '</div>';
        html += '</div></div></div>';
        // Stats
        html += '<div style="font-size: var(--fs-xs);">';
        html += '<div>Capacidad: <strong>' + t.capacity + ' ' + (t.unit||'L') + '</strong></div>';
        html += '<div>Restante: <strong style="color:#22c55e;">' + remaining + ' ' + (t.unit||'L') + '</strong></div>';
        html += '<div>Usado: <strong style="color:#c2410c;">' + used + ' ' + (t.unit||'L') + '</strong></div>';
        // Prediction
        if (t.readings && t.readings.length >= 2) {
            var r0 = t.readings[0]; var rn = t.readings[t.readings.length-1];
            var days = Math.max(1, Math.round((new Date(rn.date) - new Date(r0.date))/(1000*60*60*24)));
            var drop = r0.level - rn.level;
            var dailyRate = drop / days;
            var daysLeft = dailyRate > 0 ? Math.round(rn.level / dailyRate) : 999;
            html += '<div style="margin-top:4px;color:var(--tp-amber);">Consumo/sem: <strong>' + (dailyRate*7).toFixed(1) + ' ' + (t.unit||'L') + '</strong></div>';
            if (daysLeft < 365) html += '<div>Vacio en: <strong>~' + daysLeft + ' dias</strong></div>';
        }
        html += '</div></div></div>';
    });

    // ── GAS SECTION ──
    html += '<h3 style="margin:12px 0 6px;font-size:13px;color:var(--tp-text);">2. Reference gas consumption status</h3>';
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size: var(--fs-xs);">';
    html += '<thead><tr style="background:#0e7490;color:#fff;">';
    html += '<th style="padding:4px 6px;text-align:left;">Tipo</th>';
    html += '<th style="padding:4px 6px;text-align:left;">Consumible</th>';
    html += '<th style="padding:4px 6px;text-align:center;">Inventario (PSI)</th>';
    html += '<th style="padding:4px 6px;text-align:center;">Consumo Sem (PSI)</th>';
    html += '<th style="padding:4px 6px;text-align:center;">Consumo Dia (PSI)</th>';
    html += '<th style="padding:4px 6px;text-align:center;">Repos. (dias)</th>';
    html += '<th style="padding:4px 6px;text-align:center;">Limite Inf (PSI)</th>';
    html += '<th style="padding:4px 6px;text-align:center;">Status</th>';
    html += '</tr></thead><tbody>';

    invState.gases.forEach(function(g) {
        var lastPsi = g.readings && g.readings.length > 0 ? g.readings[g.readings.length-1].psi : g.currentPsi || 0;
        var weekly = g.weeklyPsi || 0;
        var daily = g.dailyPsi || 0;
        var repos = g.reposDays || 44;
        var limit = g.limitPsi || 0;
        var isOk = lastPsi > limit || limit === 0;
        var catColor = g.gasCategory === 'Trabajo' ? '#fef9c3' : '#e0f2fe';
        html += '<tr style="background:' + catColor + '20;border-bottom:1px solid rgba(255,255,255,0.05);">';
        html += '<td style="padding:3px 6px;font-size: var(--fs-xs);color:var(--tp-dim);">' + (g.gasCategory||'Ref') + '</td>';
        html += '<td style="padding:3px 6px;">' + g.gasType.toUpperCase().slice(0,20) + ' ' + g.concNominal + '</td>';
        html += '<td style="padding:3px 6px;text-align:center;font-weight:700;">' + lastPsi + '</td>';
        html += '<td style="padding:3px 6px;text-align:center;">' + weekly.toFixed(1) + '</td>';
        html += '<td style="padding:3px 6px;text-align:center;">' + daily.toFixed(1) + '</td>';
        html += '<td style="padding:3px 6px;text-align:center;">' + repos + '</td>';
        html += '<td style="padding:3px 6px;text-align:center;color:var(--tp-amber);">' + limit.toFixed(2) + '</td>';
        html += '<td style="padding:3px 6px;text-align:center;font-weight:700;color:' + (isOk?'#22c55e':'#ef4444') + ';">' + (isOk?'OK':'BAJO') + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';

    // ── CALIBRATION SECTION ──
    html += '<h3 style="margin:12px 0 6px;font-size:13px;color:var(--tp-text);">3. Equipment calibration status</h3>';
    var eqAlerts = invState.equipment.filter(function(e) {
        if (!e.nextCalDate) return false;
        var days = Math.round((new Date(e.nextCalDate) - new Date())/(1000*60*60*24));
        return days < 60;
    });
    if (eqAlerts.length > 0) {
        html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size: var(--fs-xs);">';
        html += '<thead><tr style="background:#7c3aed;color:#fff;"><th style="padding:4px;">Equipo</th><th>ID</th><th>Vencimiento</th><th>Dias</th><th>Status</th></tr></thead><tbody>';
        eqAlerts.forEach(function(e) {
            var days = Math.round((new Date(e.nextCalDate) - new Date())/(1000*60*60*24));
            var clr = days < 0 ? '#ef4444' : days < 30 ? '#f59e0b' : '#22c55e';
            html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:3px 6px;">' + e.name + '</td><td>' + (e.kmmId||e.serialNo||'') + '</td><td>' + e.nextCalDate + '</td><td style="color:' + clr + ';font-weight:700;">' + days + '</td><td style="color:' + clr + ';">' + (days<0?'VENCIDO':days+'d') + '</td></tr>';
        });
        html += '</tbody></table></div>';
    } else {
        html += '<div style="text-align:center;padding:10px;color:var(--tp-green);font-size: var(--fs-sm);">Todas las calibraciones vigentes (>60 dias)</div>';
    }

    html += '</div>';
    el.innerHTML = html;
}

function invExportReport() {
    var content = document.getElementById('inv-content').innerHTML;
    var blob = new Blob([
        '<html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial;background:#fff;color:#333;padding:20px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ddd;padding:4px 8px;font-size: var(--fs-sm);}th{background:#0e7490;color:#fff;}</style></head><body>' +
        '<h2>KMX Emissions Laboratory Consumables Status ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + '</h2>' +
        content + '</body></html>'
    ], {type:'text/html'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'consumables_report_' + localToday() + '.html';
    a.click();
    showToast('Reporte HTML descargado', 'success');
}

// ══════════════════════════════════════════════════
// ZONE VISUAL MAP
// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// SVG FLOOR PLAN — Interactive Zone Map
// ══════════════════════════════════════════════════

// ══════════════════════════════════════════════════
// ZONE MAP — retícula responsiva (v16.5)
// Reemplaza el plano SVG editable: cada tarjeta de zona crece solo lo que
// necesitan sus slots (una zona de 2 no ocupa lo mismo que una de 14), sin
// espacio muerto y con objetivos táctiles de tamaño real (≥44px). El
// arrastre de cilindros (invInitZoneDrag/invDropCylinder/invUndoLastMove,
// más abajo) es el mismo motor que ya existía — solo dejó de tener quien
// emitiera `.inv-zone-slot` desde que el mapa pasó a SVG.
// ══════════════════════════════════════════════════
function _invCylColor(gas) {
    var expiry = invGasExpiry(gas);
    if (expiry.status === 'expired') return 'expired';
    var lvl = invGasLevel(gas);
    if (lvl.pct > 50) return 'ok';
    if (lvl.pct > 25) return 'mid';
    return 'low';
}

function invRenderZoneMap(el) {
    var search = (window._invZoneMapSearch || '').toLowerCase();

    var html = '<div class="inv-zonemap-toolbar" data-help="inv-zonemap-help">';
    html += '<input type="text" aria-label="Buscar cilindro, fórmula o zona" placeholder="Buscar cilindro, fórmula, zona…" value="' + escapeHtml(window._invZoneMapSearch || '') + '" oninput="window._invZoneMapSearch=this.value;_invDebouncedRender();" style="flex:1;min-width:140px;padding:8px 10px;border:1px solid var(--tp-border);border-radius:8px;font-size:12px;">';
    if (_invUndoStack.length > 0) {
        html += '<button class="tp-btn tp-btn-ghost" onclick="invUndoLastMove()" style="font-size: var(--fs-sm);white-space:nowrap;">↶ Deshacer (' + _invUndoStack.length + ')</button>';
    }
    html += '</div>';

    html += '<div class="inv-zonemap-grid">';
    invState.zones.forEach(function(z) {
        var zGases = invState.gases.filter(function(g) { return g.zone && g.zone.startsWith(z.id); });
        var occPct = z.slots > 0 ? Math.round((zGases.length / z.slots) * 100) : 0;
        var tone = occPct > 80 ? 'danger' : occPct > 50 ? 'warn' : 'ok';

        html += '<div class="inv-zone-card inv-zone-card--' + tone + '">';
        html += '<div class="inv-zone-card-header"><span>' + escapeHtml(z.id) + ' · ' + escapeHtml(z.label) + '</span><span>' + zGases.length + '/' + z.slots + ' · ' + occPct + '%</span></div>';
        if (z.type) html += '<div class="inv-zone-card-type">' + escapeHtml(z.type) + '</div>';
        html += '<div class="inv-zone-slots">';
        for (var s = 1; s <= z.slots; s++) {
            var code = z.id + (s < 10 ? '0' : '') + s;
            var slotGas = zGases.find(function(g) { return g.zone === code; });
            if (slotGas) {
                var hay = (slotGas.formula + ' ' + (slotGas.controlNo || '') + ' ' + code).toLowerCase();
                var isMatch = !!search && hay.indexOf(search) >= 0;
                var isDim = !!search && !isMatch;
                var status = _invCylColor(slotGas);
                var lvl = invGasLevel(slotGas);
                html += '<button type="button" class="inv-zone-slot inv-zone-slot--' + status + (isMatch ? ' inv-zone-slot--match' : '') + (isDim ? ' inv-zone-slot--dim' : '') + '" data-zone-code="' + code + '" data-gas-id="' + slotGas.id + '" aria-label="' + code + ': ' + escapeHtml(slotGas.formula) + (slotGas.concNominal ? ' ' + escapeHtml(slotGas.concNominal) : '') + ', ' + lvl.pct + '%. Enter para seleccionar y mover." title="' + escapeHtml(slotGas.formula) + (slotGas.concNominal ? ' ' + escapeHtml(slotGas.concNominal) : '') + ' — ' + lvl.pct + '%">';
                html += '<span class="inv-zone-slot-formula">' + escapeHtml(slotGas.formula.split('/')[0]) + '</span>';
                html += '<span class="inv-zone-slot-meta">' + lvl.pct + '%</span>';
                html += '</button>';
            } else {
                html += '<button type="button" class="inv-zone-slot inv-zone-slot--empty" data-zone-code="' + code + '" aria-label="' + code + ': posición vacía">' + s + '</button>';
            }
        }
        html += '</div></div>';
    });
    html += '</div>';

    el.innerHTML = html;
    invInitZoneDrag(el);
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
}


// ══════════════════════════════════════════════════
// LEGACY ZONE MAP (fallback)
// ══════════════════════════════════════════════════
function invShowZoneSlotDetail(code) {
    var gas = invState.gases.find(function(g){ return g.zone === code; });
    if (gas) {
        invShowTimeline(gas.id);
    } else {
        showToast('Posicion ' + code + ' libre', 'info');
    }
}

// ── Zone Map: Drag-and-Drop ──
/**
 * [v20] Envoltura sobre `gridDragInit` (app.js). Este motor NACIÓ aquí (v16.5, con la
 * alternativa de teclado añadida en v17.8) y era el único de la plataforma; al aparecer
 * el tablero de "Mi semana" hacían falta exactamente las mismas dos cosas, así que se
 * generalizó en vez de copiarlo. El comportamiento del mapa de gases no cambia: mismo
 * long-press de 380 ms, mismo umbral de 15 px, mismo Enter/Espacio con `detail === 0`,
 * misma clase `.inv-zone-slot--kbdsel`.
 */
function invInitZoneDrag(container) {
    if (typeof gridDragInit !== 'function') return;   // app.js carga antes; guarda por si acaso
    gridDragInit(container, {
        ns: 'inv-zone',
        itemSelector: '.inv-zone-slot',
        idAttr: 'data-gas-id',
        cellAttr: 'data-zone-code',
        selectedClass: 'inv-zone-slot--kbdsel',
        ghostWidth: 52,
        label: function(gasId) {
            var g = (invState.gases || []).find(function(x) { return x.id === gasId; });
            return g ? (g.formula + (g.controlNo ? ' #' + g.controlNo : '')) : 'Cilindro';
        },
        // Sólo las posiciones VACÍAS aceptan: es la regla que el mapa siempre tuvo.
        canDrop: function(gasId, from, to, el) { return !!to && to !== from && el && !el.getAttribute('data-gas-id'); },
        onDrop: function(gasId, from, to) { invDropCylinder(gasId, from, to); },
        onTap: function(code) { if (code) invShowZoneSlotDetail(code); }
    });
}

/** Compatibilidad: el estado del teclado ahora vive en app.js (`_gridKbd`). */
function invZoneKeySelect(slotEl) {
    if (typeof gridKbdSelect !== 'function') return;
    gridKbdSelect(slotEl, {
        ns: 'inv-zone', itemSelector: '.inv-zone-slot',
        idAttr: 'data-gas-id', cellAttr: 'data-zone-code', selectedClass: 'inv-zone-slot--kbdsel',
        label: function(gasId) {
            var g = (invState.gases || []).find(function(x) { return x.id === gasId; });
            return g ? (g.formula + (g.controlNo ? ' #' + g.controlNo : '')) : 'Cilindro';
        },
        canDrop: function(gasId, from, to, el) { return !!to && to !== from && el && !el.getAttribute('data-gas-id'); },
        onDrop: function(gasId, from, to) { invDropCylinder(gasId, from, to); }
    });
}

function invZoneKeyCancel() { if (typeof gridKbdCancel === 'function') gridKbdCancel(); }

function invDropCylinder(gasId, sourceCode, targetCode) {
    var gas = invState.gases.find(function(g) { return g.id === gasId; });
    if (!gas) return;

    // Check if target is occupied
    var occupant = invState.gases.find(function(g) { return g.zone === targetCode; });
    if (occupant) {
        showToast('Posicion ' + targetCode + ' ocupada', 'warning');
        return;
    }

    // Push to undo stack before moving
    _invUndoStack.push({ gasId: gasId, fromZone: sourceCode, toZone: targetCode, formula: gas.formula });
    if (_invUndoStack.length > _invUndoMaxSize) _invUndoStack.shift();

    // Move cylinder
    gas.zone = targetCode;
    // Update position number from code
    gas.position = parseInt(targetCode.substring(1), 10);
    // Timeline entry
    if (!gas.timeline) gas.timeline = [];
    gas.timeline.push({ date: new Date().toISOString(), action: 'Reubicado: ' + sourceCode + ' → ' + targetCode });

    invSave();
    invRender();
    if (typeof fbPushModule === 'function') fbPushModule('inventory');
    showToast(gas.formula + ' movido a ' + targetCode, 'success');
}

function invUndoLastMove() {
    if (_invUndoStack.length === 0) { showToast('Sin movimientos para deshacer', 'info'); return; }
    var last = _invUndoStack.pop();
    var gas = invState.gases.find(function(g) { return g.id === last.gasId; });
    if (!gas) { showToast('Gas no encontrado', 'error'); return; }
    // Check if original slot is now occupied
    var occupant = invState.gases.find(function(g) { return g.zone === last.fromZone && g.id !== last.gasId; });
    if (occupant) { showToast('Posicion ' + last.fromZone + ' ya ocupada — no se puede deshacer', 'warning'); return; }
    gas.zone = last.fromZone;
    gas.position = parseInt(last.fromZone.substring(1), 10);
    if (!gas.timeline) gas.timeline = [];
    gas.timeline.push({ date: new Date().toISOString(), action: 'Deshecho: ' + last.toZone + ' → ' + last.fromZone });
    invSave(); invRender();
    if (typeof fbPushModule === 'function') fbPushModule('inventory');
    showToast('Deshecho: ' + last.formula + ' regresado a ' + last.fromZone, 'success');
}

// ══════════════════════════════════════════════════
// CONSUMPTION CHARTS (Chart.js)
// ══════════════════════════════════════════════════
function invRenderCharts(el) {
    var chartType = window._invChartType || 'gas_psi';

    var html = '<div class="tp-card"><div class="tp-card-title" data-help="inv-charts-help"><span>Graficas de Consumo</span></div>';
    html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">';
    html += '<button class="tp-btn ' + (chartType === 'gas_psi' ? 'tp-btn-primary' : 'tp-btn-ghost') +
        '" onclick="window._invChartType=\'gas_psi\';invRender();" style="font-size: var(--fs-xs);">PSI por Cilindro</button>';
    html += '<button class="tp-btn ' + (chartType === 'fuel_level' ? 'tp-btn-primary' : 'tp-btn-ghost') +
        '" onclick="window._invChartType=\'fuel_level\';invRender();" style="font-size: var(--fs-xs);">Combustible</button>';
    html += '<button class="tp-btn ' + (chartType === 'gas_compare' ? 'tp-btn-primary' : 'tp-btn-ghost') +
        '" onclick="window._invChartType=\'gas_compare\';invRender();" style="font-size: var(--fs-xs);">Comparar Gases</button>';
    html += '</div>';

    var _invChartId = 'inv_' + chartType;
    html += (typeof chartConfigBuildPanel === 'function' ? chartConfigBuildPanel(_invChartId, '_invChartInstance', {rerenderFn:'invRender();'}) : '');
    var _invCH = typeof chartConfigGet === 'function' ? chartConfigGet(_invChartId).height : 300;
    html += '<div id="' + _invChartId + '-wrapper" style="position:relative;height:' + _invCH + 'px;margin-bottom:12px;">';
    html += '<canvas id="inv-chart-main"></canvas>';
    html += '</div>';

    if (chartType === 'gas_psi') {
        var gasesWithReadings = invState.gases.filter(function(g){ return g.readings && g.readings.length >= 2; });
        html += '<div style="margin-bottom:8px;"><select id="inv-chart-gas-sel" onchange="invDrawMainChart()" style="width:100%;padding:8px;background:#1e293b;border:1px solid var(--tp-border);border-radius:6px;color:#e2e8f0;font-size: var(--fs-sm);">';
        gasesWithReadings.forEach(function(g) {
            html += '<option value="' + g.id + '">' + g.formula + ' ' + (g.concNominal||'') + ' #' + g.controlNo + '</option>';
        });
        html += '</select></div>';
    }

    html += '</div>';
    el.innerHTML = html;
    setTimeout(function(){ invDrawMainChart(); }, 50);
}

function invDrawMainChart() {
    var canvas = document.getElementById('inv-chart-main');
    if (!canvas || typeof Chart === 'undefined') return;
    if (window._invChartInstance) window._invChartInstance.destroy();

    var chartType = window._invChartType || 'gas_psi';
    var colors = ['#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#3b82f6','#84cc16'];

    if (chartType === 'gas_psi') {
        var sel = document.getElementById('inv-chart-gas-sel');
        var gasId = sel ? sel.value : null;
        var g = invState.gases.find(function(x){ return x.id === gasId; });
        if (!g || !g.readings || g.readings.length < 2) return;

        var readings = g.readings;
        var labels = readings.map(function(r){ return r.date.slice(5); });
        var psiVals = readings.map(function(r){ return r.psi; });

        // Projection (4 weeks)
        var n = psiVals.length;
        var dailyDrop = 0;
        if (n >= 2) {
            var d1 = new Date(readings[0].date), d2 = new Date(readings[n-1].date);
            var daySpan = Math.max(1, (d2 - d1) / 86400000);
            dailyDrop = (psiVals[0] - psiVals[n-1]) / daySpan;
        }
        var projLabels = [], projVals = [];
        var lastDate = new Date(readings[n-1].date);
        for (var w = 1; w <= 4; w++) {
            var pd = new Date(lastDate); pd.setDate(pd.getDate() + 7*w);
            projLabels.push(pd.toISOString().slice(5,10));
            projVals.push(Math.max(0, Math.round(psiVals[n-1] - dailyDrop*7*w)));
        }
        var allLabels = labels.concat(projLabels);
        var actualData = psiVals.concat(new Array(4).fill(null));
        var projData = new Array(n).fill(null);
        projData[n-1] = psiVals[n-1];
        projData = projData.concat(projVals);

        window._invChartInstance = new Chart(canvas, {
            type:'line', data:{ labels:allLabels, datasets:[
                { label:'PSI Actual', data:actualData, borderColor:'#06b6d4', backgroundColor:'rgba(6,182,212,0.1)', fill:true, tension:0.3, pointRadius:3 },
                { label:'Proyeccion', data:projData, borderColor:'#f59e0b', borderDash:[5,3], pointRadius:2, fill:false, tension:0.3 }
            ]},
            options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#94a3b8', font:{size:10} } } }, scales:{ x:{ ticks:{ color:'#64748b', font:{size:9} } }, y:{ ticks:{ color:'#64748b', font:{size:9} }, title:{ display:true, text:'PSI', color:'#94a3b8' } } } }
        });
    }
    else if (chartType === 'fuel_level') {
        var tanks = (invState.fuelTanks || []).filter(function(t){ return t.readings && t.readings.length >= 1; });
        var allDates = {};
        tanks.forEach(function(t){ t.readings.forEach(function(r){ allDates[r.date] = true; }); });
        var labels = Object.keys(allDates).sort();
        var datasets = tanks.map(function(t, i) {
            var data = labels.map(function(d) {
                var r = t.readings.find(function(rd){ return rd.date === d; });
                return r ? r.level : null;
            });
            return { label:t.name, data:data, borderColor:colors[i % colors.length], fill:false, spanGaps:true, tension:0.3, pointRadius:3 };
        });

        window._invChartInstance = new Chart(canvas, {
            type:'line', data:{ labels:labels.map(function(l){ return l.slice(5); }), datasets:datasets },
            options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#94a3b8', font:{size:9} } } }, scales:{ x:{ ticks:{ color:'#64748b', font:{size:9} } }, y:{ ticks:{ color:'#64748b', font:{size:9} }, title:{ display:true, text:'Litros', color:'#94a3b8' } } } }
        });
    }
    else if (chartType === 'gas_compare') {
        var gases = invState.gases.filter(function(g){ return g.status === 'In use' && g.readings && g.readings.length >= 2; });
        var allDates = {};
        gases.forEach(function(g){ g.readings.forEach(function(r){ allDates[r.date] = true; }); });
        var labels = Object.keys(allDates).sort();
        var datasets = gases.map(function(g, i) {
            var firstPsi = g.readings[0].psi;
            var data = labels.map(function(d) {
                var r = g.readings.find(function(rd){ return rd.date === d; });
                return r ? Math.round((r.psi / firstPsi) * 100) : null;
            });
            return { label:g.formula + ' ' + (g.concNominal||''), data:data, borderColor:colors[i % colors.length], fill:false, spanGaps:true, tension:0.3, pointRadius:2 };
        });

        window._invChartInstance = new Chart(canvas, {
            type:'line', data:{ labels:labels.map(function(l){ return l.slice(5); }), datasets:datasets },
            options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#94a3b8', font:{size:8} } } }, scales:{ x:{ ticks:{ color:'#64748b', font:{size:9} } }, y:{ ticks:{ color:'#64748b', font:{size:9} }, title:{ display:true, text:'% Restante', color:'#94a3b8' } } } }
        });
    }
}

function invRenderConfig(el) {
    var html = '<div class="tp-card"><div class="tp-card-title"><span>Configuracion de Zonas</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invAddZone()" style="font-size: var(--fs-xs);">+ Agregar Zona</button></div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Edita el layout de tu cuarto de gases. Cada zona tiene un ID, nombre, slots y tipo.</div>';

    invState.zones.forEach(function(z, idx) {
        var occupied = invState.gases.filter(function(g){ return g.zone && g.zone.startsWith(z.id); }).length;
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;background:var(--tp-card);flex-wrap:wrap;">';
        html += '<div style="font-weight:800;font-size:14px;width:30px;text-align:center;color:var(--tp-amber);">' + z.id + '</div>';
        html += '<div style="flex:1;min-width:120px;"><div style="font-size: var(--fs-sm);font-weight:600;">' + z.label + '</div><div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + z.slots + ' slots | ' + z.type + ' | ' + occupied + ' ocupados</div></div>';
        html += '<div style="display:flex;gap:4px;">';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invEditZone(' + idx + ')" style="font-size: var(--fs-xs);" title="Editar" aria-label="Editar zona">\u270F</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invDeleteZone(' + idx + ')" style="font-size: var(--fs-xs);color:var(--tp-red);" title="Eliminar" aria-label="Eliminar zona">\u2715</button>';
        html += '</div></div>';
    });
    html += '</div>';

    // Gas types config
    html += '<div class="tp-card"><div class="tp-card-title"><span>Tipos de Gas</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invAddGasType()" style="font-size: var(--fs-xs);">+ Agregar Tipo</button></div>';
    invState.gasTypes.forEach(function(gt, idx) {
        html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;margin-bottom:2px;border:1px solid var(--tp-border);border-radius:5px;background:var(--tp-card);">';
        html += '<div style="flex:1;font-size: var(--fs-xs);"><strong>' + gt.formula + '</strong> — ' + gt.name + '</div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + gt.concs.join(', ') + '</div>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invEditGasType(' + idx + ')" style="font-size: var(--fs-xs);" title="Editar" aria-label="Editar tipo de gas">\u270F</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invDeleteGasType(' + idx + ')" style="font-size: var(--fs-xs);color:var(--tp-red);" title="Eliminar" aria-label="Eliminar tipo de gas">\u2715</button>';
        html += '</div>';
    });
    html += '</div>';

    // Fuel types config  
    html += '<div class="tp-card"><div class="tp-card-title"><span>Combustibles Registrados</span></div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">' + ((invState.fuelTanks||[]).length) + ' tambos. Administralos desde la pestana Combustible.</div>';
    html += '</div>';

    // Data management
    html += '<div class="tp-card"><div class="tp-card-title"><span>Datos</span></div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    html += '<button class="tp-btn tp-btn-ghost" onclick="invExportGases()" style="font-size: var(--fs-xs);">Exportar JSON</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="invImportGases()" style="font-size: var(--fs-xs);">Importar JSON</button>';
    html += '<button class="tp-btn tp-btn-danger" onclick="showConfirm(\'Borrar TODOS los datos de inventario?\',function(){if(typeof undoPush===\\x27function\\x27)undoPush(\\x27inventory\\x27,\\x27Resetear inventario\\x27);invState.gases=[];invState.equipment=[];invState.fuelTanks=[];invState.usageLog=[];invSave();invRender();invUpdateBadges();showToast(\\x27Inventario reseteado\\x27,\\x27success\\x27,null,undoPop);},{title:\'Resetear inventario\',type:\'danger\',confirmText:\'Borrar todo\'})" style="font-size: var(--fs-xs);">Resetear</button>';
    html += '</div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:4px;">' + invState.gases.length + ' gases, ' + invState.equipment.length + ' equipos, ' + (invState.usageLog||[]).length + ' registros de uso</div>';
    html += '</div>';

    el.innerHTML = html;
}

function invAddZone() {
    invShowZoneModal(null);
}

function invEditZone(idx) {
    invShowZoneModal(idx);
}

// v16.5: siguiente letra libre para el ID de zona \u2014 se precarga, sigue siendo editable
function _invNextFreeZoneId() {
    var used = {};
    invState.zones.forEach(function(z) { used[z.id] = true; });
    for (var c = 65; c <= 90; c++) {
        var letter = String.fromCharCode(c);
        if (!used[letter]) return letter;
    }
    return '';
}

function invShowZoneModal(idx) {
    var z = (idx !== null && idx !== undefined) ? invState.zones[idx] : null;
    var isEdit = !!z;
    var v = function(f,d){ return z ? (z[f]||'') : (d||''); };
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:400px;margin:40px auto;background:#fff;border-radius:14px;padding:20px;position:relative;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">\u2715</button>' +
        '<h3 style="margin:0 0 12px;color:#0f172a;">' + (isEdit ? 'Editar Zona ' + v('id') : 'Nueva Zona') + '</h3>' +
        '<div style="display:grid;gap:10px;">' +
        (!isEdit ? '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">ID</label><input id="inv-zone-id" maxlength="2" value="' + _invNextFreeZoneId() + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;font-size:16px;text-transform:uppercase;"></div>' : '') +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Nombre</label><input id="inv-zone-label" value="' + v('label', 'Zona') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Cantidad de slots</label><input id="inv-zone-slots" type="number" value="' + v('slots', '10') + '" min="1" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '</div>' +
        '<details style="margin-top:10px;"><summary style="font-size: var(--fs-sm);color:#475569;font-weight:700;cursor:pointer;padding:6px 0;">M\u00e1s detalles (tipo de zona)</summary>' +
        '<div style="padding-top:6px;"><select id="inv-zone-type" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;">' +
        '<option value="online"' + (v('type')==='online'?' selected':'') + '>Online</option>' +
        '<option value="offline"' + (v('type','offline')==='offline'?' selected':'') + '>Offline</option>' +
        '<option value="special"' + (v('type')==='special'?' selected':'') + '>Special</option>' +
        '<option value="fuel"' + (v('type')==='fuel'?' selected':'') + '>Fuel</option>' +
        '</select></div></details>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveZoneModal(' + (isEdit ? idx : -1) + ')" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
}

function invSaveZoneModal(idx) {
    var isEdit = idx >= 0;
    var id, label, slots, type;

    if (!isEdit) {
        id = (document.getElementById('inv-zone-id').value || '').trim().toUpperCase();
        if (!id || id.length > 2) { showToast('ID debe ser 1-2 caracteres', 'error'); return; }
        if (invState.zones.some(function(z){ return z.id === id; })) { showToast('Zona ' + id + ' ya existe', 'error'); return; }
    }

    label = document.getElementById('inv-zone-label').value.trim();
    slots = parseInt(document.getElementById('inv-zone-slots').value);
    type = document.getElementById('inv-zone-type').value;

    if (!label) { showToast('Nombre requerido', 'error'); return; }

    if (isEdit) {
        var z = invState.zones[idx];
        z.label = label;
        if (!isNaN(slots) && slots > 0) z.slots = slots;
        z.type = type;
    } else {
        invState.zones.push({ id: id, label: label, slots: slots || 10, type: type || 'offline' });
    }

    invSave(); invRender();
    document.getElementById('invModal').style.display = 'none';
}

function invDeleteZone(idx) {
    var z = invState.zones[idx]; if (!z) return;
    var occupied = invState.gases.filter(function(g){ return g.zone && g.zone.startsWith(z.id); }).length;
    if (occupied > 0) { showToast('Zona ' + z.id + ' tiene ' + occupied + ' cilindros. Reubícalos primero.', 'warning'); return; }
    showConfirmDialog({ title: '⚠️ Eliminar zona', message: 'Eliminar zona ' + z.id + '?', type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;
        invState.zones.splice(idx, 1);
        invSave(); invRender();
    });
}

function invAddGasType() {
    invShowGasTypeModal(null);
}

function invEditGasType(idx) {
    invShowGasTypeModal(idx);
}

function invShowGasTypeModal(idx) {
    var gt = (idx !== null && idx !== undefined) ? invState.gasTypes[idx] : null;
    var isEdit = !!gt;
    var v = function(f,d){ return gt ? (gt[f]||'') : (d||''); };
    var concsVal = gt ? gt.concs.join(', ') : '';
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:400px;margin:40px auto;background:#fff;border-radius:14px;padding:20px;position:relative;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">\u2715</button>' +
        '<h3 style="margin:0 0 12px;color:#0f172a;">' + (isEdit ? 'Editar Tipo de Gas' : 'Nuevo Tipo de Gas') + '</h3>' +
        '<div style="display:grid;gap:10px;">' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Nombre completo (ej: Propano/Aire)</label><input id="inv-gt-name" value="' + v('name') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Formula (ej: C3H8/Air)</label><input id="inv-gt-formula" value="' + v('formula') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size: var(--fs-sm);color:#475569;font-weight:600;">Concentraciones (separadas por coma)</label><input id="inv-gt-concs" value="' + concsVal + '" placeholder="ej: 2 ppm, 5 ppm, 10 ppm" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveGasTypeModal(' + (isEdit ? idx : -1) + ')" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        (isEdit ? '<button onclick="showConfirm(\'Eliminar tipo de gas?\',function(){invState.gasTypes.splice(' + idx + ',1);invSave();invRender();document.getElementById(\x27invModal\x27).style.display=\x27none\x27;},{title:\'Eliminar\',type:\'danger\',confirmText:\'Eliminar\'})" style="padding:10px;background:var(--danger-fill);color:#fff;border:none;border-radius:8px;cursor:pointer;">Eliminar</button>' : '') +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
}

function invSaveGasTypeModal(idx) {
    var isEdit = idx >= 0;
    var name = document.getElementById('inv-gt-name').value.trim();
    var formula = document.getElementById('inv-gt-formula').value.trim();
    var concsStr = document.getElementById('inv-gt-concs').value.trim();

    if (!name) { showToast('Nombre requerido', 'error'); return; }

    var concs = concsStr ? concsStr.split(',').map(function(c){ return c.trim(); }) : ['-'];

    if (isEdit) {
        var gt = invState.gasTypes[idx];
        gt.name = name;
        gt.formula = formula || name;
        gt.concs = concs;
    } else {
        invState.gasTypes.push({ name: name, formula: formula || name, concs: concs });
    }

    invSave(); invRender();
    document.getElementById('invModal').style.display = 'none';
}

function invDeleteGasType(idx) {
    showConfirmDialog({ title: '⚠️ Eliminar tipo', message: 'Eliminar tipo ' + invState.gasTypes[idx].name + '?', type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }).then(function(ok) {
        if (!ok) return;
        invState.gasTypes.splice(idx, 1);
        invSave(); invRender();
    });
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [QW3] TREND CHART — Gas consumption over time (Chart.js)          ║
// ╚══════════════════════════════════════════════════════════════════════╝

function invShowTrendChart(gasId) {
    var g = invState.gases.find(function(x) { return x.id === gasId; });
    if (!g || !g.readings || g.readings.length < 2) {
        showToast('Necesita al menos 2 lecturas para graficar', 'info');
        return;
    }

    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:520px;margin:20px auto;background:#0f172a;border-radius:14px;padding:20px;position:relative;color:#e2e8f0;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">\u2715</button>' +
        '<h3 style="margin:0 0 2px;color:#06b6d4;">' + g.formula + ' ' + (g.concNominal || '') + '</h3>' +
        '<div style="font-size: var(--fs-sm);color:#475569;font-weight:600;margin-bottom:12px;">#' + g.controlNo + ' | Zona ' + (g.zone || '?') + ' | ' + g.readings.length + ' lecturas</div>' +
        '<canvas id="inv-trend-canvas" style="width:100%;height:220px;"></canvas>' +
        '<div id="inv-trend-stats" style="margin-top:10px;"></div>' +
        '</div>';

    // Slight delay to ensure DOM is ready
    setTimeout(function() { invDrawTrendChart(g); }, 50);
}

function invDrawTrendChart(g) {
    var canvas = document.getElementById('inv-trend-canvas');
    if (!canvas || typeof Chart === 'undefined') {
        showToast('Chart.js no disponible', 'error');
        return;
    }

    var readings = g.readings;
    var labels = readings.map(function(r) { return r.date; });
    var psiVals = readings.map(function(r) { return r.psi; });

    // Calculate linear regression for projection
    var n = psiVals.length;
    var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (var i = 0; i < n; i++) {
        sumX += i; sumY += psiVals[i]; sumXY += i * psiVals[i]; sumXX += i * i;
    }
    var slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    var intercept = (sumY - slope * sumX) / n;
    var dailyDrop = 0;
    if (n >= 2) {
        var firstDate = new Date(readings[0].date);
        var lastDate = new Date(readings[n - 1].date);
        var daySpan = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
        dailyDrop = (psiVals[0] - psiVals[n - 1]) / daySpan;
    }

    // Project 4 more weeks
    var projLabels = [];
    var projVals = [];
    var lastDate = new Date(readings[n - 1].date);
    var lastPsi = psiVals[n - 1];
    for (var w = 1; w <= 4; w++) {
        var d = new Date(lastDate);
        d.setDate(d.getDate() + 7 * w);
        var projPsi = Math.max(0, lastPsi - dailyDrop * 7 * w);
        projLabels.push(d.toISOString().slice(5, 10));
        projVals.push(Math.round(projPsi));
    }

    var allLabels = labels.map(function(l) { return l.slice(5); }).concat(projLabels);
    var actualData = psiVals.concat(new Array(4).fill(null));
    var projData = new Array(n).fill(null);
    projData[n - 1] = psiVals[n - 1]; // connect line
    projData = projData.concat(projVals);

    // Depletion line at threshold
    var depletionPsi = g.limitPsi || 150;

    // Destruir la instancia previa: recrear sobre el mismo canvas lanza
    // "Canvas is already in use" y fuga contextos (patrón window._* de CLAUDE.md)
    if (window._invForecastChart) { try { window._invForecastChart.destroy(); } catch(e) {} }
    window._invForecastChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'PSI Actual',
                    data: actualData,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6,182,212,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#06b6d4',
                    borderWidth: 2
                },
                {
                    label: 'Proyeccion',
                    data: projData,
                    borderColor: '#f59e0b',
                    borderDash: [6, 3],
                    fill: false,
                    tension: 0,
                    pointRadius: 3,
                    pointBackgroundColor: '#f59e0b',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { color: '#94a3b8', font: { size: 10 } } },
                annotation: undefined
            },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(71,85,105,0.2)' } },
                y: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(71,85,105,0.2)' }, beginAtZero: false }
            }
        }
    });

    // Stats below chart
    var daysToEmpty = dailyDrop > 0 ? Math.round(lastPsi / dailyDrop) : 999;
    var emptyDate = new Date(lastDate);
    emptyDate.setDate(emptyDate.getDate() + daysToEmpty);
    var weeklyDrop = dailyDrop * 7;
    var statsEl = document.getElementById('inv-trend-stats');
    if (statsEl) {
        statsEl.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:6px;">' +
            '<div style="padding:6px;border:1px solid #1e293b;border-radius:6px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#06b6d4;">' + lastPsi + '</div><div style="font-size: var(--fs-xs);color:#64748b;">PSI actual</div></div>' +
            '<div style="padding:6px;border:1px solid #1e293b;border-radius:6px;text-align:center;"><div style="font-size:14px;font-weight:700;color:var(--warn-text);">' + dailyDrop.toFixed(1) + '</div><div style="font-size: var(--fs-xs);color:#64748b;">PSI/dia</div></div>' +
            '<div style="padding:6px;border:1px solid #1e293b;border-radius:6px;text-align:center;"><div style="font-size:14px;font-weight:700;color:var(--warn-text);">' + weeklyDrop.toFixed(0) + '</div><div style="font-size: var(--fs-xs);color:#64748b;">PSI/semana</div></div>' +
            '<div style="padding:6px;border:1px solid #1e293b;border-radius:6px;text-align:center;"><div style="font-size:14px;font-weight:700;color:' + (daysToEmpty < 30 ? '#ef4444' : '#10b981') + ';">' + (daysToEmpty > 365 ? '>1a' : daysToEmpty + 'd') + '</div><div style="font-size: var(--fs-xs);color:#64748b;">dias restantes</div></div>' +
            '<div style="padding:6px;border:1px solid #1e293b;border-radius:6px;text-align:center;"><div style="font-size:14px;font-weight:700;color:' + (daysToEmpty < 30 ? '#ef4444' : '#10b981') + ';">' + (daysToEmpty > 365 ? '>1 ano' : emptyDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })) + '</div><div style="font-size: var(--fs-xs);color:#64748b;">fecha vacio</div></div>' +
            '</div>';
    }
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [QW4] REORDER ALERTS — Smart alerts with reorder specs           ║
// ╚══════════════════════════════════════════════════════════════════════╝

function invCheckReorderAlerts() {
    var alerts = [];
    var WEEKS_THRESHOLD = 6; // Alert when gas projected to last < 6 weeks

    invState.gases.forEach(function(g) {
        if (g.status !== 'In use' || !g.readings || g.readings.length < 2) return;

        var rdgs = g.readings;
        var first = rdgs[0];
        var last = rdgs[rdgs.length - 1];
        var daysDiff = Math.max(1, Math.round((new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24)));
        var dailyDrop = (first.psi - last.psi) / daysDiff;
        if (dailyDrop <= 0) return;

        var daysLeft = last.psi / dailyDrop;
        var weeksLeft = daysLeft / 7;

        if (weeksLeft < WEEKS_THRESHOLD) {
            // Check if there's a spare of the same formula+concentration
            var hasSpare = invState.gases.some(function(s) {
                return s.id !== g.id && s.formula === g.formula && s.concNominal === g.concNominal && s.status === 'Spare';
            });

            alerts.push({
                gasId: g.id,
                controlNo: g.controlNo,
                formula: g.formula,
                concNominal: g.concNominal,
                gasType: g.gasType,
                traceability: g.traceability || 'EPA',
                zone: g.zone,
                currentPsi: last.psi,
                dailyDrop: dailyDrop,
                daysLeft: Math.round(daysLeft),
                weeksLeft: Math.round(weeksLeft * 10) / 10,
                hasSpare: hasSpare,
                urgency: weeksLeft < 2 ? 'critica' : weeksLeft < 4 ? 'alta' : 'media'
            });
        }
    });

    alerts.sort(function(a, b) { return a.daysLeft - b.daysLeft; });
    return alerts;
}

function invRenderReorderAlerts() {
    var alerts = invCheckReorderAlerts();
    if (alerts.length === 0) return '';

    var html = '<div class="tp-card" style="border-left:3px solid #f97316;">';
    html += '<div class="tp-card-title"><span style="color:#f97316;">Alertas de Reorden (' + alerts.length + ')</span></div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Cilindros que se proyectan a agotarse en menos de 6 semanas.</div>';

    alerts.forEach(function(a) {
        var urgClr = a.urgency === 'critica' ? '#ef4444' : a.urgency === 'alta' ? '#f59e0b' : '#3b82f6';
        html += '<div style="padding:8px 10px;margin-bottom:4px;border:1px solid ' + urgClr + '30;border-radius:6px;background:' + urgClr + '08;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">';
        html += '<div>';
        html += '<span style="font-weight:700;font-size: var(--fs-sm);">' + a.formula + ' ' + (a.concNominal || '') + '</span>';
        html += ' <span style="font-size: var(--fs-xs);color:var(--tp-dim);">#' + a.controlNo + ' (' + (a.zone || '?') + ')</span>';
        html += '</div>';
        html += '<span style="font-size: var(--fs-xs);font-weight:700;padding:2px 8px;border-radius:10px;background:' + urgClr + '20;color:' + urgClr + ';border:1px solid ' + urgClr + '40;">' + a.urgency.toUpperCase() + ' ~' + a.weeksLeft + ' sem</span>';
        html += '</div>';
        html += '<div style="display:flex;gap:8px;margin-top:4px;font-size: var(--fs-xs);flex-wrap:wrap;">';
        html += '<span style="color:var(--tp-dim);">Actual: <strong>' + a.currentPsi + ' psi</strong></span>';
        html += '<span style="color:var(--tp-dim);">Consumo: <strong>' + a.dailyDrop.toFixed(1) + ' psi/dia</strong></span>';
        html += '<span style="color:var(--tp-dim);">Vacio en: <strong style="color:' + urgClr + ';">' + a.daysLeft + ' dias</strong></span>';
        if (a.hasSpare) {
            html += '<span style="color:var(--ok-text);font-weight:700;">Spare disponible</span>';
        } else {
            html += '<span style="color:var(--danger-text);font-weight:700;">SIN SPARE</span>';
        }
        html += '</div>';
        // Reorder spec
        html += '<div style="margin-top:6px;padding:4px 8px;border-radius:4px;background:rgba(249,115,22,0.06);border:1px dashed ' + urgClr + '30;font-size: var(--fs-xs);color:#f97316;">';
        html += '<strong>Reorden:</strong> ' + a.gasType + ' | ' + (a.concNominal || '') + ' | Trazabilidad: ' + a.traceability;
        html += '</div>';
        html += '</div>';
    });

    html += '</div>';
    return html;
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [INV-ANOMALY] Anomaly Detection — Leak & Unusual Consumption      ║
// ╚══════════════════════════════════════════════════════════════════════╝

function invDetectAnomalies() {
    var anomalies = [];
    invState.gases.forEach(function(g) {
        if (g.status === 'Empty' || !g.readings || g.readings.length < 3) return;
        var rdgs = g.readings.slice().sort(function(a, b) { return a.date.localeCompare(b.date); });

        // Calculate average daily drop rate from all consecutive pairs
        var drops = [];
        for (var i = 1; i < rdgs.length; i++) {
            var daysDiff = Math.max(1, Math.round((new Date(rdgs[i].date) - new Date(rdgs[i-1].date)) / 86400000));
            var psiDrop = rdgs[i-1].psi - rdgs[i].psi;
            if (psiDrop > 0) drops.push(psiDrop / daysDiff);
        }
        if (drops.length < 2) return;

        // Mean and std deviation of daily drop rates
        var mean = drops.reduce(function(s, v) { return s + v; }, 0) / drops.length;
        var variance = drops.reduce(function(s, v) { return s + (v - mean) * (v - mean); }, 0) / drops.length;
        var std = Math.sqrt(variance);
        if (mean <= 0) return;

        // Check latest drop against historical pattern
        var lastDrop = rdgs[rdgs.length - 2].psi - rdgs[rdgs.length - 1].psi;
        var lastDays = Math.max(1, Math.round((new Date(rdgs[rdgs.length - 1].date) - new Date(rdgs[rdgs.length - 2].date)) / 86400000));
        var lastRate = lastDrop / lastDays;

        if (lastDrop <= 0) return; // refill or no change

        var zScore = std > 0 ? (lastRate - mean) / std : 0;
        var ratio = lastRate / mean;

        if (ratio >= 3 || zScore >= 3) {
            anomalies.push({
                gasId: g.id, controlNo: g.controlNo, formula: g.formula,
                concNominal: g.concNominal, zone: g.zone,
                type: 'leak', severity: 'critica',
                message: 'Posible FUGA: caida de ' + lastDrop.toFixed(0) + ' psi en ' + lastDays + 'd (' + ratio.toFixed(1) + 'x promedio)',
                lastPsi: rdgs[rdgs.length - 1].psi, drop: lastDrop, ratio: ratio,
                date: rdgs[rdgs.length - 1].date
            });
        } else if (ratio >= 2 || zScore >= 2) {
            anomalies.push({
                gasId: g.id, controlNo: g.controlNo, formula: g.formula,
                concNominal: g.concNominal, zone: g.zone,
                type: 'unusual', severity: 'alta',
                message: 'Consumo inusual: caida de ' + lastDrop.toFixed(0) + ' psi en ' + lastDays + 'd (' + ratio.toFixed(1) + 'x promedio)',
                lastPsi: rdgs[rdgs.length - 1].psi, drop: lastDrop, ratio: ratio,
                date: rdgs[rdgs.length - 1].date
            });
        }
    });

    anomalies.sort(function(a, b) { return a.severity === 'critica' ? -1 : 1; });
    return anomalies;
}

function invRenderAnomalyBanner() {
    var anomalies = invDetectAnomalies();
    if (anomalies.length === 0) return '';

    var html = '<div class="tp-card" style="border-left:3px solid #ef4444;background:rgba(239,68,68,0.04);">';
    html += '<div class="tp-card-title"><span style="color:var(--danger-text);">Anomalias Detectadas (' + anomalies.length + ')</span></div>';
    html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-bottom:8px;">Cilindros con consumo inusual vs. su patron historico.</div>';

    anomalies.forEach(function(a) {
        var clr = a.severity === 'critica' ? '#ef4444' : '#f59e0b';
        var icon = a.type === 'leak' ? '🚨' : '⚠️';
        html += '<div style="padding:8px 10px;margin-bottom:4px;border:1px solid ' + clr + '30;border-radius:6px;background:' + clr + '08;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">';
        html += '<div>';
        html += '<span style="font-size:13px;">' + icon + '</span> ';
        html += '<span style="font-weight:700;font-size: var(--fs-sm);">' + a.formula + ' ' + (a.concNominal || '') + '</span>';
        html += ' <span style="font-size: var(--fs-xs);color:var(--tp-dim);">#' + a.controlNo + ' (' + (a.zone || '?') + ')</span>';
        html += '</div>';
        html += '<span style="font-size: var(--fs-xs);font-weight:700;padding:2px 8px;border-radius:10px;background:' + clr + '20;color:' + clr + ';border:1px solid ' + clr + '40;text-transform:uppercase;">' + a.severity + '</span>';
        html += '</div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:4px;">' + a.message + '</div>';
        html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:2px;">Actual: <strong>' + a.lastPsi + ' psi</strong> | Fecha: ' + a.date + '</div>';
        html += '</div>';
    });

    html += '</div>';
    return html;
}

// ══════════════════════════════════════════════════
// IMPROVED PREDICTION — Bayesian blend with reference rates
// ══════════════════════════════════════════════════

var INV_REFERENCE_RATES = {
    'CO/N2': 3.5, 'NO/N2': 3.0, 'CO2/N2': 2.5, 'CH4/Air': 2.0,
    'C3H8/Air': 2.8, 'N2O/N2': 2.0, 'ZERO': 1.5, 'H2/He': 1.0, 'O2/N2': 1.5
};

// ══════════════════════════════════════════════════
// MEJORA D: WEEKLY PLAN FORECAST
// ══════════════════════════════════════════════════

// v15.9 — Forecast normalizado para superficies (tablero HOY, tarjeta de inventario, alertas
// del Panel): "¿alcanza el gas/gasolina para las pruebas pendientes?" en dos alcances:
// 'semana' (plan semanal aceptado) y 'plan' (déficit total del plan de producción).
// Números vivos: se recalcula cuando cambia el modelo de consumo, el plan o el día.
var _invForecastCache = { key: '', data: null };
function invForecastGasNeeds() {
    var modelAt = (invState.consumption && invState.consumption.updatedAt) || '';
    var planKey = '';
    if (typeof tpState !== 'undefined' && tpState.weeklyPlans && tpState.weeklyPlans.length) {
        var lp = tpState.weeklyPlans[tpState.weeklyPlans.length - 1];
        planKey = (lp.weekDate || '') + ':' + (lp.items ? lp.items.filter(function(i) { return !i.completed; }).length : 0);
    }
    var key = modelAt + '|' + planKey + '|' + localToday();
    if (_invForecastCache.key === key && _invForecastCache.data) return _invForecastCache.data;

    if (!invState.consumption) invUpdateConsumptionModel();
    var perType = (invState.consumption && invState.consumption.perType) || {};
    var out = [];

    // 1) Alcance SEMANA — reutiliza el forecast del plan semanal aceptado
    var weekly = invForecastForWeeklyPlan();
    if (weekly && weekly.items) {
        weekly.items.forEach(function(it) {
            if (it.recommendation !== 'AGOTADO' && it.recommendation !== 'REORDENAR') return;
            out.push({
                kind: it.type, scope: 'semana', name: it.name, formula: it.formula || null,
                requerido: Math.round(it.estimatedUsage), disponible: Math.round(it.currentLevel),
                deficit: Math.max(0, Math.round(it.estimatedUsage - it.currentLevel)),
                pruebasPend: weekly.testCount, unit: it.unit,
                severidad: it.recommendation === 'AGOTADO' ? 'critical' : 'warning'
            });
        });
    }

    // 2) Alcance PLAN — déficit total del plan de producción (tpGetAnalysis) × consumo aprendido
    if (typeof tpGetAnalysis === 'function') {
        var pendingByReg = {}, totalPend = 0;
        try {
            tpGetAnalysis().forEach(function(a) {
                if (a.deficit > 0) {
                    var r = a.reg || 'General';
                    pendingByReg[r] = (pendingByReg[r] || 0) + a.deficit;
                    totalPend += a.deficit;
                }
            });
        } catch (e) {}
        // Gas: requerido por fórmula (solo estimados aprendidos, n>0); disponible = In use + Full
        var needByFormula = {};
        Object.keys(pendingByReg).forEach(function(reg) {
            var t = perType[reg];
            if (!t) return;
            Object.keys(t.gases).forEach(function(f) {
                if (!(t.gases[f].n > 0)) return;
                needByFormula[f] = (needByFormula[f] || 0) + t.gases[f].est * pendingByReg[reg];
            });
        });
        Object.keys(needByFormula).forEach(function(f) {
            var req = Math.round(needByFormula[f]);
            if (req <= 0) return;
            var avail = 0;
            (invState.gases || []).forEach(function(g) {
                if (g.formula !== f) return;
                if (g.status === 'In use' && g.readings && g.readings.length) avail += g.readings[g.readings.length - 1].psi || 0;
                else if (g.status === 'Full') avail += g.initialPsi || 2200;
            });
            if (avail >= req) return; // alcanza — sin alerta
            out.push({
                kind: 'gas', scope: 'plan', name: f, formula: f,
                requerido: req, disponible: Math.round(avail), deficit: req - Math.round(avail),
                pruebasPend: totalPend, unit: 'psi',
                severidad: avail < req * 0.5 ? 'critical' : 'warning'
            });
        });
        // Gasolina por regulación
        Object.keys(pendingByReg).forEach(function(reg) {
            var t = perType[reg];
            if (!t || !t.fuelL || !(t.fuelL.n > 0)) return;
            var req = Math.round(t.fuelL.est * pendingByReg[reg]);
            if (req <= 0) return;
            var avail = 0;
            (invState.fuelTanks || []).forEach(function(tank) {
                if (tank.regulation === reg) avail += tank.currentLevel || 0;
            });
            if (avail >= req) return;
            out.push({
                kind: 'fuel', scope: 'plan', name: 'Gasolina ' + reg, formula: null,
                requerido: req, disponible: Math.round(avail), deficit: req - Math.round(avail),
                pruebasPend: pendingByReg[reg], unit: t.fuelL.unit || 'L',
                severidad: avail < req * 0.5 ? 'critical' : 'warning'
            });
        });
    }

    _invForecastCache = { key: key, data: out };
    return out;
}

function invForecastForWeeklyPlan(rates) {
    // Get latest accepted weekly plan from Test Plan module
    if (typeof tpState === 'undefined' || !tpState.weeklyPlans) return null;
    var plan = tpState.weeklyPlans.slice().reverse().find(function(p) { return p.accepted && p.items; });
    if (!plan) return null;

    var pendingItems = plan.items.filter(function(i) { return !i.completed; });
    if (pendingItems.length === 0) return null;

    if (!rates) rates = invCalcConsumptionRates();

    // Count tests by regulation
    var regCounts = {};
    pendingItems.forEach(function(item) {
        var reg = item.reg || (item.desc ? item.desc.split(' ')[0] : 'General');
        regCounts[reg] = (regCounts[reg] || 0) + 1;
    });

    var result = {
        planLabel: 'Semana ' + (plan.weekDate || ''),
        testCount: pendingItems.length,
        items: []
    };

    // Gas forecast
    invState.gases.filter(function(g) {
        return g.status === 'In use' && g.readings && g.readings.length > 0;
    }).forEach(function(g) {
        var lastPsi = g.readings[g.readings.length - 1].psi;
        var totalNeeded = 0;

        Object.keys(regCounts).forEach(function(reg) {
            if (rates.gas[g.formula] && rates.gas[g.formula][reg]) {
                totalNeeded += rates.gas[g.formula][reg].ewma * regCounts[reg];
            }
        });

        if (totalNeeded <= 0) return;

        var postPlan = lastPsi - totalNeeded;
        var pctUsage = lastPsi > 0 ? Math.round((totalNeeded / lastPsi) * 100) : 100;
        var depletion = invPredictDepletion(g);
        var daysAfterPlan = depletion ? depletion.daysLeft : 999;
        var needsReorder = postPlan < 200 || pctUsage > 80;

        var recommendation = 'OK';
        if (postPlan <= 0) recommendation = 'AGOTADO';
        else if (needsReorder) recommendation = 'REORDENAR';
        else if (pctUsage > 50) recommendation = 'MONITOREAR';

        result.items.push({
            type: 'gas',
            name: g.formula + ' ' + (g.concNominal || '') + ' #' + g.controlNo,
            formula: g.formula,
            currentLevel: lastPsi,
            estimatedUsage: totalNeeded,
            postPlanLevel: postPlan,
            pctUsage: pctUsage,
            daysAfterPlan: daysAfterPlan,
            needsReorder: needsReorder,
            recommendation: recommendation,
            unit: 'psi'
        });
    });

    // Fuel forecast
    (invState.fuelTanks || []).filter(function(t) {
        return t.readings && t.readings.length >= 1 && t.regulation;
    }).forEach(function(t) {
        var lastLevel = t.readings[t.readings.length - 1].level;
        var reg = t.regulation;
        if (!regCounts[reg]) return;
        if (!rates.fuel[reg] || rates.fuel[reg].ewma <= 0) return;

        var totalNeeded = rates.fuel[reg].ewma * regCounts[reg];
        var postPlan = lastLevel - totalNeeded;
        var pctUsage = lastLevel > 0 ? Math.round((totalNeeded / lastLevel) * 100) : 100;
        var needsReorder = postPlan < (t.capacity * 0.15) || pctUsage > 80;

        var recommendation = 'OK';
        if (postPlan <= 0) recommendation = 'AGOTADO';
        else if (needsReorder) recommendation = 'REORDENAR';
        else if (pctUsage > 50) recommendation = 'MONITOREAR';

        result.items.push({
            type: 'fuel',
            name: t.name,
            currentLevel: lastLevel,
            estimatedUsage: totalNeeded,
            postPlanLevel: postPlan,
            pctUsage: pctUsage,
            needsReorder: needsReorder,
            recommendation: recommendation,
            unit: t.unit || 'L'
        });
    });

    return result;
}

function invExportWeeklyForecast() {
    var rates = invCalcConsumptionRates();
    var forecast = invForecastForWeeklyPlan(rates);
    if (!forecast || forecast.items.length === 0) {
        showToast('No hay forecast disponible', 'warning');
        return;
    }

    var csv = 'Consumible,Tipo,Nivel Actual,Uso Estimado Plan,Nivel Post-Plan,% Uso,Recomendacion\n';
    forecast.items.forEach(function(item) {
        csv += '"' + item.name + '",' + item.type + ',' + item.currentLevel + ',' +
               item.estimatedUsage.toFixed(1) + ',' + item.postPlanLevel.toFixed(1) + ',' +
               item.pctUsage + '%,' + item.recommendation + '\n';
    });

    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'forecast_semanal_' + localToday() + '.csv';
    a.click();
    showToast('Forecast exportado', 'success');
}

// ══════════════════════════════════════════════════
// COP15-F11 — Exportación CSV/PDF e importación en bloque (v16.4)
// ══════════════════════════════════════════════════
function _invCsvCell(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
}
function _invDownloadCsv(csv, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = filename;
    a.click();
    if (typeof showToast === 'function') showToast('Exportado: ' + filename, 'success');
}
function _invParseCsvLine(line) {
    var result = [], cur = '', inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (inQuotes) {
            if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; } }
            else cur += c;
        } else {
            if (c === '"') inQuotes = true;
            else if (c === ',') { result.push(cur); cur = ''; }
            else cur += c;
        }
    }
    result.push(cur);
    return result;
}

function invExportF11Equipos() {
    var csv = 'ID,Equipo,Laboratorio,Marca,Modelo,No. Serie,Estatus,¿Requiere calibración? (auto),Cal. vencidas (auto),Notas\n';
    (invState.assets || []).forEach(function(a) {
        var instrs = invState.equipment.filter(function(e) { return e.assetId === a.id; });
        var requiere = instrs.some(function(e) { return e.requiresCal !== 'No'; }) ? 'Sí' : 'No';
        var vencidas = instrs.filter(function(e) { return invCalStatus(e).code === 'vencido'; }).length;
        csv += [a.id, a.name, a.lab, a.brand, a.model, a.serialNo, a.status, requiere, vencidas, a.notes || ''].map(_invCsvCell).join(',') + '\n';
    });
    _invDownloadCsv(csv, 'COP15-F11_Equipos_' + localToday() + '.csv');
}

function invExportF11Calibracion() {
    var csv = 'No.,Equipo,Laboratorio (auto),Marca,Descripción / Magnitud calibrada,Modelo,No. Serie,ID KMM,¿Requiere calibración?,Tipo,Frecuencia,Proveedor (¿quién calibra?),Trazabilidad,Lugar,Última calibración,Próxima calibración (auto),Estatus (auto),No. Certificado,Rango máximo,Rango de uso,Error máx. permitido,Ubicación física,Crítico NMX,Certificado PDF / Comentarios\n';
    invState.equipment.forEach(function(e, i) {
        var asset = (invState.assets || []).find(function(a) { return a.id === e.assetId; });
        var st = invCalStatus(e);
        var statusLabel = { noaplica: 'NO APLICA', sinregistro: 'SIN REGISTRO', vencido: 'VENCIDO', porvencer: 'POR VENCER', vigente: 'VIGENTE' }[st.code];
        csv += [
            e.f11Id || ('E' + (i + 1)), asset ? asset.name : '', asset ? asset.lab : '', e.brand || '', e.magnitude || e.type || '', e.model || '', e.serialNo || '',
            e.kmmId || '', e.requiresCal === 'Si' ? 'Sí' : 'No', e.calType || '', e.calFreq || '', e.calLab || '', e.traceability || '', e.calPlace || '',
            e.lastCalDate || '', e.nextCalDate || '', statusLabel, e.calCertNo || '', e.rangeMax || '', e.rangeUse || '', e.maxError || '', e.location || '',
            e.critical === 'Si' ? 'Sí' : 'No', e.comments || ''
        ].map(_invCsvCell).join(',') + '\n';
    });
    _invDownloadCsv(csv, 'COP15-F11_Calibracion_' + localToday() + '.csv');
}

function invExportF11Actividades() {
    var csv = 'ID Act.,Equipo,Actividad,Frecuencia,Semana inicio (1-52),Responsable\n';
    (invState.maintActivities || []).forEach(function(a) {
        var asset = (invState.assets || []).find(function(x) { return x.id === a.assetId; });
        csv += [a.id, asset ? asset.name : '', a.desc, a.freq, a.startWeek, a.responsible || ''].map(_invCsvCell).join(',') + '\n';
    });
    _invDownloadCsv(csv, 'COP15-F11_Actividades_' + localToday() + '.csv');
}

function invExportF11Historial() {
    var csv = 'Fecha,Equipo,Actividad,Realizado por,Horas,Comentarios,Semana (auto),Año (auto)\n';
    (invState.maintLog || []).forEach(function(l) {
        var act = (invState.maintActivities || []).find(function(a) { return a.id === l.activityId; });
        var asset = act ? (invState.assets || []).find(function(x) { return x.id === act.assetId; }) : null;
        var week = l.date ? invWeekOfYear(l.date) : '';
        var year = l.date ? l.date.slice(0, 4) : '';
        csv += [l.date, asset ? asset.name : '', act ? act.desc : '', l.by || '', l.hours || '', l.comments || '', week, year].map(_invCsvCell).join(',') + '\n';
    });
    _invDownloadCsv(csv, 'COP15-F11_Historial_' + localToday() + '.csv');
}

// Actualización en bloque desde el CSV de Calibración (mismo formato del exportador) —
// solo actualiza fecha/certificado/proveedor de instrumentos existentes; pide confirmación antes de escribir.
function invImportF11CSV(csvText) {
    var lines = csvText.trim().split('\n');
    if (lines.length < 2) { showToast('CSV vacío', 'error'); return; }
    var header = _invParseCsvLine(lines[0]);
    var idx = {};
    header.forEach(function(h, i) { idx[h.trim()] = i; });
    if (idx['No.'] === undefined) { showToast('CSV sin columna "No." (ID del F11)', 'error'); return; }

    var updates = [], news = 0, unchanged = 0;
    for (var i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        var cols = _invParseCsvLine(lines[i]);
        var f11Id = cols[idx['No.']];
        if (!f11Id) continue;
        var target = invState.equipment.find(function(e) { return e.f11Id === f11Id; })
            || (idx['ID KMM'] !== undefined && cols[idx['ID KMM']] ? invState.equipment.find(function(e) { return e.kmmId && e.kmmId === cols[idx['ID KMM']]; }) : null)
            || (idx['No. Serie'] !== undefined && cols[idx['No. Serie']] ? invState.equipment.find(function(e) { return e.serialNo && e.serialNo === cols[idx['No. Serie']]; }) : null);
        var row = {
            lastCalDate: idx['Última calibración'] !== undefined ? cols[idx['Última calibración']] : '',
            calCertNo: idx['No. Certificado'] !== undefined ? cols[idx['No. Certificado']] : '',
            calLab: idx['Proveedor (¿quién calibra?)'] !== undefined ? cols[idx['Proveedor (¿quién calibra?)']] : ''
        };
        if (target) {
            var changed = (row.lastCalDate && row.lastCalDate !== target.lastCalDate) || (row.calCertNo && row.calCertNo !== target.calCertNo);
            if (changed) updates.push({ target: target, row: row }); else unchanged++;
        } else {
            news++;
        }
    }

    if (updates.length === 0 && news === 0) { showToast('Sin cambios respecto al CSV (' + unchanged + ' sin cambio)', 'info'); return; }

    showConfirmDialog({
        title: 'Importar COP15-F11',
        message: updates.length + ' actualizados, ' + news + ' nuevos (se omiten — usa "+ Instrumento" para altas), ' + unchanged + ' sin cambio. ¿Aplicar?',
        type: 'info', confirmText: 'Aplicar'
    }).then(function(ok) {
        if (!ok) return;
        if (typeof undoPush === 'function') undoPush('inventory', 'Importar F11');
        updates.forEach(function(u) {
            var t = u.target, r = u.row;
            if (r.lastCalDate) t.lastCalDate = r.lastCalDate;
            if (r.calCertNo) t.calCertNo = r.calCertNo;
            if (r.calLab) t.calLab = r.calLab;
            if (r.lastCalDate) t.nextCalDate = invCalNextDate(r.lastCalDate, t.calFreq);
            if (!t.calHistory) t.calHistory = [];
            if (r.lastCalDate) t.calHistory.push({ date: r.lastCalDate, certNo: r.calCertNo || '', provider: r.calLab || t.calLab || '', by: 'Importación CSV', at: new Date().toISOString() });
        });
        invSave(); invRender(); invUpdateBadges();
        if (typeof auditLog === 'function') auditLog('inv', 'f11_importado', { type: 'equipment', label: 'COP15-F11' }, updates.length + ' actualizados');
        showToast('Importados ' + updates.length + ' cambios', 'success');
    });
}

function invImportF11() { document.getElementById('inv-f11-import-file').click(); }
function invHandleF11Import(event) {
    var f = event.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function(e) { invImportF11CSV(e.target.result); };
    r.readAsText(f);
    event.target.value = '';
}

// Plan Maestro (52 semanas) + Dashboard de cumplimiento en PDF, formato COP15-F11.
function invMaintPlanPDF(opts) {
    if (typeof window.jspdf === 'undefined') {
        if (!(opts && opts.silent) && typeof showToast === 'function') showToast('jsPDF no esta disponible. Verifica la conexion CDN.', 'error');
        return;
    }
    var year = window._invMaintYear || new Date().getFullYear();
    if (!(opts && opts.silent) && typeof showOverlayLoading === 'function') showOverlayLoading('Generando PDF del Plan Maestro...');
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    var W = doc.internal.pageSize.getWidth();
    var ML = 10, MR = 10, CW = W - ML - MR;
    var y = 12;

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('PLAN MAESTRO DE MANTENIMIENTO Y CALIBRACIÓN — ' + year, ML, y);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Código: COP15-F11 · Revisión: 03 · Generado: ' + localToday(), ML, y + 5);
    y += 12;

    var comp = invMaintCompliance(year);
    var calSum = invCalSummary();
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Mantenimiento: ' + comp.planned + ' planeados · ' + comp.doneOnWeek + ' en semana · ' + comp.pct + '% cumplimiento', ML, y);
    doc.text('Calibración: ' + calSum.vigentes + ' vigentes · ' + calSum.vencidos + ' vencidos · ' + calSum.sinRegistro + ' sin registro · ' + calSum.pct + '% vigencia', ML, y + 5);
    y += 12;

    var matrix = invMaintMatrix(year);
    var curWeek = (year === new Date().getFullYear()) ? invWeekOfYear(localToday()) : -1;
    var labelW = 55, cellW = (CW - labelW) / 52;
    doc.setFontSize(6);
    matrix.forEach(function(row, ri) {
        if (y > 190) { doc.addPage(); y = 15; }
        var asset = row.asset ? row.asset.name : '?';
        doc.setFont('helvetica', 'bold');
        doc.text((asset + ' - ' + row.act.desc).substring(0, 40), ML, y + 3);
        var x = ML + labelW;
        row.weeks.forEach(function(w) {
            if (w.n === curWeek) { doc.setFillColor(220, 240, 235); doc.rect(x, y, cellW, 5, 'F'); }
            if (w.overdue) doc.setTextColor(220, 38, 38);
            else if (w.done) doc.setTextColor(16, 185, 129);
            else doc.setTextColor(60, 60, 60);
            doc.setFont('helvetica', 'normal');
            var cell = w.done ? '✓' : (w.planned ? 'P' : '');
            if (cell) doc.text(cell, x + cellW / 2, y + 3.5, { align: 'center' });
            x += cellW;
        });
        doc.setTextColor(0, 0, 0);
        y += 6;
    });

    doc.save('Plan_Maestro_COP15-F11_' + year + '_' + localToday() + '.pdf');
    if (!(opts && opts.silent) && typeof hideOverlayLoading === 'function') hideOverlayLoading();
    if (!(opts && opts.silent) && typeof showToast === 'function') showToast('PDF generado', 'success');
}


// Also integrate forecast warning into tpSmartGenerate via global hook
function invGetPlanImpactWarning(planItems) {
    if (!planItems || planItems.length === 0) return '';
    var rates = invCalcConsumptionRates();
    if (rates.dataPoints === 0) return '';

    var regCounts = {};
    planItems.forEach(function(item) {
        if (item.completed) return;
        var reg = item.reg || (item.desc ? item.desc.split(' ')[0] : 'General');
        regCounts[reg] = (regCounts[reg] || 0) + 1;
    });

    var criticalGases = [];
    invState.gases.filter(function(g) {
        return g.status === 'In use' && g.readings && g.readings.length > 0;
    }).forEach(function(g) {
        var lastPsi = g.readings[g.readings.length - 1].psi;
        var totalNeeded = 0;
        Object.keys(regCounts).forEach(function(reg) {
            if (rates.gas[g.formula] && rates.gas[g.formula][reg]) {
                totalNeeded += rates.gas[g.formula][reg].ewma * regCounts[reg];
            }
        });
        if (totalNeeded > 0 && lastPsi < totalNeeded) {
            criticalGases.push(g.formula + ' (' + lastPsi + '/' + totalNeeded.toFixed(0) + ' psi)');
        }
    });

    if (criticalGases.length === 0) return '';
    return 'Este plan agotaria: ' + criticalGases.join(', ');
}

function invPredictDepletion(g) {
    if (!g.readings || g.readings.length < 2) {
        // Use reference rate if available
        var refRate = INV_REFERENCE_RATES[g.formula] || 0;
        if (refRate > 0 && g.readings && g.readings.length === 1) {
            var lastPsi = g.readings[0].psi;
            var daysLeft = lastPsi / refRate;
            return { daysLeft: Math.round(daysLeft), weeksLeft: Math.round(daysLeft / 7 * 10) / 10, confidence: 'baja', source: 'referencia', dailyRate: refRate };
        }
        return null;
    }

    var rdgs = g.readings.slice().sort(function(a, b) { return a.date.localeCompare(b.date); });
    var first = rdgs[0], last = rdgs[rdgs.length - 1];
    var daysDiff = Math.max(1, Math.round((new Date(last.date) - new Date(first.date)) / 86400000));
    var totalDrop = first.psi - last.psi;
    if (totalDrop <= 0) return null;

    var observedRate = totalDrop / daysDiff;
    var refRate = INV_REFERENCE_RATES[g.formula] || observedRate;
    var n = rdgs.length;

    // Bayesian blend: more data → trust observed more
    var weight = Math.min(n / 10, 1); // full trust at 10+ readings
    var blendedRate = observedRate * weight + refRate * (1 - weight);

    var daysLeft = last.psi / blendedRate;
    var confidence = n >= 10 ? 'alta' : n >= 5 ? 'media' : 'baja';

    return {
        daysLeft: Math.round(daysLeft),
        weeksLeft: Math.round(daysLeft / 7 * 10) / 10,
        confidence: confidence,
        source: weight >= 1 ? 'historico' : 'mixto',
        dailyRate: Math.round(blendedRate * 10) / 10,
        observedRate: Math.round(observedRate * 10) / 10,
        dataPoints: n
    };
}

// [R3-M3] Debounced version for scan filter input
var _debouncedInvScanFilter = debounce(function() { invScanFilter(); }, 200);

// ══════════════════════════════════════════════════════════════════════
// [R5-M8] Templates — Inventory Quick Actions
// ══════════════════════════════════════════════════════════════════════

/** Duplicate a gas cylinder with new auto-incremented control number. */
/** Batch add multiple gas cylinders of the same type. */
function _invFindLeastFullZone() {
    var zones = invState.zones || [];
    if (zones.length === 0) return '';
    var counts = {};
    zones.forEach(function(z) { counts[z.name] = 0; });
    invState.gases.forEach(function(g) {
        if (g.zone && counts[g.zone] !== undefined) counts[g.zone]++;
    });
    var minZone = zones[0].name;
    zones.forEach(function(z) {
        if ((counts[z.name] || 0) < (counts[minZone] || 0)) minZone = z.name;
    });
    return minZone;
}

// ══════════════════════════════════════════════════════════════════════
// [R5-M5] Batch Reading Round — One-at-a-time gas reading experience
// ══════════════════════════════════════════════════════════════════════

var _readingRound = null;

function invStartReadingRound() {
    var gases = invState.gases.filter(function(g) { return g.status === 'active'; });
    if (gases.length === 0) { showToast('No hay cilindros activos', 'warning'); return; }

    _readingRound = {
        gases: gases,
        index: 0,
        results: [],
        startTime: Date.now()
    };
    _invRoundRenderCurrent();
}

function _invRoundRenderCurrent() {
    if (!_readingRound) return;
    var gas = _readingRound.gases[_readingRound.index];
    var total = _readingRound.gases.length;
    var idx = _readingRound.index;

    // Get last reading
    var lastReading = gas.readings && gas.readings.length > 0 ? gas.readings[gas.readings.length - 1] : null;
    var lastVal = lastReading ? (lastReading.psi || lastReading.value || '') : '';

    // Build sparkline data
    var sparkData = (gas.readings || []).slice(-5).map(function(r) { return r.psi || r.value || 0; });
    var sparkHtml = _invRoundSparkline(sparkData);

    var pct = Math.round(((idx) / total) * 100);

    var html = '<div class="reading-round-overlay">' +
        '<div class="reading-round-card">' +
        // Header
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<span style="font-size:12px;font-weight:700;color:var(--tp-dim);">' + (idx + 1) + ' de ' + total + '</span>' +
        '<button onclick="_invRoundCancel()" style="background:none;border:none;color:var(--danger-text);cursor:pointer;font-size:18px;font-weight:700;">✕</button>' +
        '</div>' +
        // Progress bar
        '<div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin-bottom:16px;overflow:hidden;">' +
        '<div style="height:100%;width:' + pct + '%;background:var(--tp-green);border-radius:2px;transition:width 0.3s;"></div>' +
        '</div>' +
        // Gas info
        '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="font-size:14px;font-weight:800;color:var(--tp-text);">' + escapeHtml(gas.gasType || 'Gas') + '</div>' +
        '<div style="font-size: var(--fs-sm);color:var(--tp-dim);margin-top:2px;">' + escapeHtml(gas.controlNo || gas.id) + ' · Zona: ' + escapeHtml(gas.zone || '—') + '</div>' +
        '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:2px;">Conc: ' + escapeHtml(gas.concNominal || '—') + ' / ' + escapeHtml(gas.concReal || '—') + '</div>' +
        '</div>' +
        // Sparkline
        (sparkHtml ? '<div style="text-align:center;margin-bottom:12px;">' + sparkHtml + '<div style="font-size: var(--fs-xs);color:var(--tp-dim);margin-top:2px;">Últimas 5 lecturas</div></div>' : '') +
        // Last value
        (lastVal ? '<div style="text-align:center;margin-bottom:8px;font-size: var(--fs-xs);color:var(--tp-dim);">Última lectura: <strong style="color:var(--tp-text);">' + lastVal + ' PSI</strong></div>' : '') +
        // Input
        '<div style="text-align:center;margin-bottom:16px;">' +
        '<input type="number" id="round-reading-input" placeholder="PSI" value="' + (lastVal || '') + '" ' +
        'style="width:120px;padding:12px 16px;font-size:24px;font-weight:800;text-align:center;border:2px solid var(--tp-border);border-radius:12px;background:var(--tp-card);color:var(--tp-text);" ' +
        'onkeydown="if(event.key===\'Enter\')invRoundNext()">' +
        '</div>' +
        // Buttons
        '<div style="display:flex;gap:8px;justify-content:center;">' +
        (idx > 0 ? '<button onclick="invRoundPrev()" class="btn-secondary" style="padding:10px 20px;">← Anterior</button>' : '') +
        (lastVal ? '<button onclick="_invRoundSameValue()" class="btn-secondary" style="padding:10px 20px;background:rgba(16,185,129,0.1);color:var(--ok-text);border-color:var(--ok-text);">= Igual</button>' : '') +
        '<button onclick="invRoundNext()" class="btn-primary" style="padding:10px 24px;">' + (idx < total - 1 ? 'Siguiente →' : 'Finalizar ✓') + '</button>' +
        '</div>' +
        '</div></div>';

    // Show as overlay
    var overlay = document.getElementById('reading-round-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'reading-round-overlay';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = html;
    overlay.style.display = 'block';

    // Focus input
    setTimeout(function() {
        var inp = document.getElementById('round-reading-input');
        if (inp) { inp.focus(); inp.select(); }
    }, 100);
}

function invRoundNext() {
    if (!_readingRound) return;
    _invRoundSaveCurrentReading();
    _readingRound.index++;
    if (_readingRound.index >= _readingRound.gases.length) {
        invRoundFinish();
    } else {
        _invRoundRenderCurrent();
    }
}

function invRoundPrev() {
    if (!_readingRound || _readingRound.index <= 0) return;
    _readingRound.index--;
    _invRoundRenderCurrent();
}

function _invRoundSameValue() {
    // Keep the pre-filled value (last reading) and advance
    invRoundNext();
}

function _invRoundSaveCurrentReading() {
    if (!_readingRound) return;
    var gas = _readingRound.gases[_readingRound.index];
    var inp = document.getElementById('round-reading-input');
    var val = inp ? parseFloat(inp.value) : NaN;
    if (isNaN(val)) return;

    gas.readings = gas.readings || [];
    var lastVal = gas.readings.length > 0 ? (gas.readings[gas.readings.length - 1].psi || gas.readings[gas.readings.length - 1].value || 0) : 0;

    gas.readings.push({
        psi: val,
        value: val,
        timestamp: new Date().toISOString(),
        source: 'round'
    });

    // Track result
    var dropPct = lastVal > 0 ? Math.round(((lastVal - val) / lastVal) * 100) : 0;
    _readingRound.results.push({
        gasId: gas.id,
        controlNo: gas.controlNo,
        gasType: gas.gasType,
        value: val,
        prev: lastVal,
        alert: dropPct > 15
    });
}

function invRoundFinish() {
    if (!_readingRound) return;
    invSave();

    var elapsed = Math.round((Date.now() - _readingRound.startTime) / 1000);
    var mins = Math.floor(elapsed / 60);
    var secs = elapsed % 60;
    var alerts = _readingRound.results.filter(function(r) { return r.alert; });

    var html = '<div class="reading-round-overlay">' +
        '<div class="reading-round-card">' +
        '<div style="text-align:center;margin-bottom:16px;">' +
        '<div style="font-size:36px;margin-bottom:8px;">✅</div>' +
        '<div style="font-size:16px;font-weight:800;color:var(--tp-text);">Ronda Completada</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">' +
        '<div class="tp-card" style="text-align:center;padding:10px;">' +
        '<div style="font-size:20px;font-weight:800;color:var(--tp-green);">' + _readingRound.results.length + '</div>' +
        '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Lecturas</div></div>' +
        '<div class="tp-card" style="text-align:center;padding:10px;">' +
        '<div style="font-size:20px;font-weight:800;color:' + (alerts.length > 0 ? '#ef4444' : 'var(--tp-green)') + ';">' + alerts.length + '</div>' +
        '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Alertas</div></div>' +
        '<div class="tp-card" style="text-align:center;padding:10px;">' +
        '<div style="font-size:20px;font-weight:800;color:var(--tp-blue);">' + mins + ':' + String(secs).padStart(2, '0') + '</div>' +
        '<div style="font-size: var(--fs-xs);color:var(--tp-dim);">Tiempo</div></div>' +
        '</div>';

    if (alerts.length > 0) {
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size: var(--fs-sm);font-weight:700;color:var(--danger-text);margin-bottom:6px;">⚠ Alertas de presión:</div>';
        alerts.forEach(function(a) {
            html += '<div style="font-size: var(--fs-xs);color:var(--tp-dim);padding:2px 0;">' +
                escapeHtml(a.controlNo) + ' (' + escapeHtml(a.gasType) + '): ' + a.prev + ' → ' + a.value + ' PSI</div>';
        });
        html += '</div>';
    }

    html += '<div style="display:flex;gap:8px;justify-content:center;">' +
        '<button onclick="_invRoundCopyReport()" class="btn-secondary" style="padding:8px 16px;">📋 Copiar Resumen</button>' +
        '<button onclick="_invRoundCancel()" class="btn-primary" style="padding:8px 20px;">Cerrar</button>' +
        '</div></div></div>';

    var overlay = document.getElementById('reading-round-overlay');
    if (overlay) overlay.innerHTML = html;

    invRender();
    _readingRound = null;
}

function _invRoundCancel() {
    var overlay = document.getElementById('reading-round-overlay');
    if (overlay) overlay.style.display = 'none';
    _readingRound = null;
}

function _invRoundCopyReport() {
    if (!_readingRound && document.getElementById('reading-round-overlay')) {
        // Use the last results stored
    }
    var text = 'Ronda de Lecturas — ' + new Date().toLocaleString('es-MX') + '\n';
    var overlay = document.getElementById('reading-round-overlay');
    // Simple copy of visible text
    if (navigator.clipboard) {
        navigator.clipboard.writeText(overlay ? overlay.textContent : text);
        showToast('Resumen copiado', 'success');
    }
}

function _invRoundSparkline(data) {
    if (!data || data.length < 2) return '';
    var max = Math.max.apply(null, data);
    var min = Math.min.apply(null, data);
    var range = max - min || 1;
    var w = 100, h = 30;
    var points = data.map(function(v, i) {
        var x = (i / (data.length - 1)) * w;
        var y = h - ((v - min) / range) * h;
        return x + ',' + y;
    }).join(' ');
    return '<svg width="' + w + '" height="' + h + '" style="display:inline-block;">' +
        '<polyline points="' + points + '" fill="none" stroke="var(--tp-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
}

// ══════════════════════════════════════════════════
// v16.0: Ayuda — banners de pestaña y tooltips de campo
// ══════════════════════════════════════════════════
if (typeof HELP_TABS !== 'undefined') Object.assign(HELP_TABS, {
    'inv-dashboard': { title: 'Inventario — resumen', text: 'Estado de cilindros y equipos: vencidos, niveles bajos y consumo proyectado contra las pruebas pendientes.', tips: [
        'Los focos rojo/ámbar indican vencimientos o niveles críticos — atiéndelos primero.',
        'La tarjeta ⛽ de consumo proyectado usa el modelo aprendido de Predicción.',
        '"Ver Resumen del Lab" te lleva al panel cruzado con Test Plan y HOY.'
    ]},
    'inv-gases': { title: 'Cilindros', text: 'Alta y gestión de cilindros de gas de calibración: fórmula, concentración, presión inicial, lote y vencimiento.', tips: [
        'Usa "+ Nuevo Cilindro" y llena Tipo de Gas, Zona/Posición y Vigencia como mínimo.',
        'El código de zona (ej. A03) marca su ubicación física en el Mapa.',
        'Exporta/Importa en JSON para respaldar o mover el catálogo entre dispositivos.'
    ]},
    'inv-equipment': { title: 'Equipos y Calibración (COP15-F11)', text: 'Instrumentos del laboratorio agrupados por equipo padre, con semáforo de calibración (60 días para "por vencer"). Un crítico vencido debe identificarse como NO OPERABLE.', tips: [
        'Botón "✅ Calibrado" en cada instrumento: solo pide fecha, certificado y proveedor — la próxima fecha se calcula sola.',
        'Los filtros 🔴🟠🟢⚪ arriba muestran solo lo que necesita atención.',
        'El ✏️ del encabezado de cada grupo edita el equipo padre (laboratorio, marca, si bloquea pruebas).'
    ]},
    'inv-maint': { title: 'Mantenimiento (COP15-F11)', text: 'Plan Maestro de mantenimiento preventivo: vencidos y programados de la semana arriba, la matriz de 52 semanas y el catálogo de actividades abajo, plegados.', tips: [
        '"✔ Hecho" registra el mantenimiento con un toque (fecha de hoy y tu usuario); "…con detalle" agrega horas y comentarios.',
        'La matriz de 52 semanas es de solo consulta — tócala en una celda planeada para marcarla hecha directamente ahí.',
        '"📥 Importar F11" actualiza calibraciones en bloque desde el CSV oficial exportado por la plataforma.'
    ]},
    'inv-readings': { title: 'Captura diaria', text: 'Captura una vez al día el PSI de cada cilindro en uso y el nivel de los tanques. De estas lecturas la plataforma APRENDE cuánto consume cada tipo de prueba — sin capturas no hay predicción.', tips: [
        'Captura todos los cilindros "En uso" cada día, aunque el valor no haya cambiado.',
        'Las lecturas manuales (no automáticas) son las que alimentan el modelo de consumo.',
        'Revisa la sección ⛽ Combustible para registrar también el nivel de los tambos.'
    ]},
    'inv-predict': { title: 'Predicción', text: 'Consumo aprendido por tipo de prueba y proyección: ¿alcanza el gas/gasolina para el plan? Los números se actualizan con cada lectura y cada prueba.', tips: [
        'La confianza (Alta/Media/Baja) depende de cuántas lecturas manuales hay acumuladas.',
        'Si dice "Sin datos", ve a Captura Diaria y registra unos días de lecturas reales.',
        'Las pruebas pendientes vienen del Plan; el pronóstico se recalcula automático.'
    ]},
    'inv-fuel': { title: 'Combustible', text: 'Tanques de gasolina por regulación. Cada prueba descuenta automáticamente los litros aprendidos del tanque correspondiente.', tips: [
        'Cada tambo se asocia a una Regulación; el descuento automático usa esa relación.',
        'Registra el nivel real de vez en cuando con el botón 📏 para corregir desviaciones.',
        'El color de la barra indica nivel crítico (rojo) / bajo (ámbar) / normal (verde).'
    ]},
    'inv-zonemap': { title: 'Mapa', text: 'Cilindros agrupados por zona, coloreados por nivel/vencimiento — toca uno para ver su detalle.', tips: [
        'Mantén presionado un cilindro y arrástralo a otra posición para reubicarlo (touch o mouse).',
        'Toca un cilindro para ver su detalle rápido; toca una posición vacía para ver que está libre.',
        'El botón ↶ Deshacer revierte el último movimiento si te equivocas.'
    ]},
    'inv-charts': { title: 'Gráficas', text: 'Tendencia de consumo de PSI por cilindro y de nivel de combustible, para detectar fugas o consumo anormal.', tips: [
        'Cambia entre PSI por Cilindro, Combustible y Comparar Gases con los botones superiores.',
        'Una caída más rápida de lo normal puede indicar una fuga — revisa el cilindro físicamente.'
    ]},
    'inv-config': { title: 'Configuración', text: 'Define el layout de zonas del cuarto de gases y el catálogo de tipos de gas disponibles.', tips: [
        'Cada zona necesita un ID único, nombre, número de slots y tipo.',
        'Los Tipos de Gas definidos aquí alimentan el selector de "Nuevo Cilindro".'
    ]},
    'inv-report': { title: 'Reporte semanal', text: 'Genera un reporte de consumo de combustible y gases listo para copiar y compartir por correo.', tips: [
        'Usa "Copiar HTML" y pégalo directo en tu cliente de correo.',
        'Cubre la semana actual (lunes a viernes) automáticamente.'
    ]},
    'inv-trace': { title: 'Trazabilidad', text: 'Busca qué cilindro o lote de gas se usó en qué prueba/VIN — útil para auditorías de calidad.', tips: [
        'Busca por Cilindro, No. de Lote o VIN según lo que tengas a la mano.',
        'El resultado muestra todas las pruebas donde ese gas/lote fue usado.'
    ]}
});
if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
    'inv-g-type': { title: 'Tipo de gas', text: 'Selecciona el gas de calibración del cilindro (ej. CO 2.5% Bal N2). Define qué concentraciones nominales estarán disponibles.' },
    'inv-g-conc': { title: 'Concentración nominal', text: 'Concentración certificada del cilindro según su etiqueta/certificado (ej. 2.005%). Se llena según el Tipo de Gas elegido.' },
    'inv-g-valid': { title: 'Vigencia', text: 'Fecha de vencimiento del certificado del cilindro. La plataforma avisa cuando se acerca o ya venció.' },
    'inv-g-zone': { title: 'Zona + posición', text: 'Dónde vive físicamente el cilindro en el cuarto de gases (ej. A03). Las posiciones ocupadas no se pueden repetir.' },
    'inv-eq-nextcal': { title: 'Próxima calibración', text: 'Fecha en la que el equipo debe recalibrarse. La plataforma avisa 30 y 7 días antes de vencer.' },
    'inv-predict-model': { title: 'Modelo de predicción', text: 'Aprende de tus capturas diarias reales (no de lecturas automáticas). Entre más lecturas manuales captures, más confiable es la proyección de cuánto gas/combustible te queda.' },
    'inv-gases-help': { title: 'Cilindros de gas', text: 'Catálogo de cilindros de calibración: alta, edición, vencimientos y nivel actual por cilindro.' },
    'inv-equipment-help': { title: 'Equipos y calibración', text: 'Instrumentos del laboratorio agrupados por equipo padre (analizadores, dinamómetro, CVS…) con su semáforo de calibración según el formato COP15-F11.' },
    'inv-eq-magnitude': { title: 'Magnitud', text: 'Qué mide este instrumento (ej. Thermometer, Humidity sensor, Mass). Un mismo equipo físico puede tener varias filas si mide varias magnitudes.' },
    'inv-eq-requires': { title: '¿Requiere calibración?', text: 'Si es "No", el instrumento queda fuera del semáforo y de los porcentajes de cumplimiento (ej. una referencia fija que no se calibra).' },
    'inv-eq-caltype': { title: 'Tipo de calibración', text: 'Interna: la hace el propio laboratorio. Externa: la realiza un proveedor certificado.' },
    'inv-eq-freq': { title: 'Frecuencia de calibración', text: 'Cada cuánto se recalibra este instrumento (Semestral/Anual/Bianual). Al cambiarla se recalcula la próxima fecha.' },
    'inv-eq-trace': { title: 'Trazabilidad', text: 'Organismo que respalda la calibración (ej. EMA, ANAB, NVLAP) — evidencia de que el certificado es válido.' },
    'inv-eq-place': { title: 'Lugar de calibración', text: 'Dónde se realiza: en sitio (en el laboratorio), externo nacional o externo en EUA.' },
    'inv-eq-maxerror': { title: 'Error máximo permitido', text: 'Tolerancia del instrumento según su certificado (ej. ± 0.25°C). Referencia metrológica, no se calcula automáticamente.' },
    'inv-eq-critical': { title: 'Crítico NMX', text: 'Marca si el instrumento es crítico para la validez de la prueba bajo la norma. Si está vencido, dispara el aviso de NO OPERABLE.' },
    'inv-eq-calsection': { title: 'Datos de calibración', text: 'Frecuencia, proveedor, trazabilidad y fechas — lo que alimenta el semáforo y las alertas.' },
    'inv-mtto-freq': { title: 'Frecuencia de mantenimiento', text: 'Cada cuánto se repite esta actividad (Semanal a Anual). Define las semanas "P" en el Plan Maestro.' },
    'inv-mtto-startweek': { title: 'Semana de inicio', text: 'Semana del año (1-52) en la que arranca el ciclo; a partir de ahí se repite según la frecuencia.' },
    'inv-maint-plan-help': { title: 'Plan Maestro 52 semanas', text: 'Matriz automática: "P" = semana planeada, "✓" = ejecutada, rojo = planeada y vencida. Toca una celda planeada para marcarla hecha.' },
    'inv-maint-compliance-help': { title: 'Cumplimiento', text: '% de mantenimientos ejecutados en su semana planeada, por equipo y global — el mismo cálculo que el Dashboard del formato oficial.' },
    'inv-maint-catalog-help': { title: 'Catálogo de actividades', text: 'Qué se mantiene, cada cuánto y quién lo hace. Cambios aquí regeneran el Plan Maestro automáticamente.' },
    'inv-maint-help': { title: 'Mantenimiento preventivo', text: 'Vencidos y de esta semana arriba para atender de un toque; el Plan Maestro de 52 semanas y el catálogo quedan plegados abajo para consulta.' },
    'inv-fuel-help': { title: 'Tanques de combustible', text: 'Tambos de gasolina/diesel de referencia por regulación; se descuentan automáticamente al liberar una prueba.' },
    'inv-report-help': { title: 'Reporte semanal', text: 'Resumen de consumo de la semana en curso, listo para copiar y enviar por correo.' },
    'inv-charts-help': { title: 'Gráficas de consumo', text: 'Tendencia histórica de PSI y nivel de combustible por cilindro/tanque.' },
    'inv-zonemap-help': { title: 'Mapa del cuarto de gases', text: 'Cada tarjeta es una zona; arrastra un cilindro entre posiciones para reubicarlo.' },
    'inv-readings-fuel-help': { title: 'Captura de combustible', text: 'Registra el nivel actual de cada tambo de combustible. Estas lecturas alimentan el descuento automático por prueba.' }
});
