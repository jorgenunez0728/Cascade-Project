// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — Lab Inventory Module                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M30] LAB INVENTORY — Gas Cylinders, Equipment, Readings         ║
// ╚══════════════════════════════════════════════════════════════════════╝

const INV_LS_KEY = 'kia_lab_inventory';
let invState = JSON.parse(localStorage.getItem(INV_LS_KEY)) || {
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
    fuelTanks: [] // {id, name, fuelType, octane, supplier, capacity, currentLevel, unit, readings}
};

function invSave() {
    try { localStorage.setItem(INV_LS_KEY, JSON.stringify(invState)); }
    catch(e) { console.warn('INV: localStorage full'); }
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
    invSave();
}

function invSwitchTab(tabId) {
    invState.activeTab = tabId;
    document.querySelectorAll('#inv-tabs-bar .tp-tab').forEach(function(b){b.classList.remove('active');});
    event.target.classList.add('active');
    invRender();
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

function invRender() {
    var el = document.getElementById('inv-content');
    if (!el) return;
    invCheckProactiveAlerts();
    var t = invState.activeTab;
    if (t === 'inv-dashboard') invRenderDashboard(el);
    else if (t === 'inv-gases') invRenderGases(el);
    else if (t === 'inv-equipment') invRenderEquipment(el);
    else if (t === 'inv-readings') invRenderReadings(el);
    else if (t === 'inv-predict') invRenderPredict(el);
    else if (t === 'inv-fuel') invRenderFuel(el);
    else if (t === 'inv-config') invRenderConfig(el);
    else if (t === 'inv-report') invRenderReport(el);
}

function invUpdateBadges() {
    var b = document.getElementById('inv-count-badge');
    if (b) b.textContent = invState.gases.length + ' gases' + ((invState.fuelTanks||[]).length > 0 ? ', ' + invState.fuelTanks.length + ' tambos' : '');
}

function invGenId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function invAutoControlNo() {
    var today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    var todayCount = invState.gases.filter(function(g){ return g.controlNo && g.controlNo.startsWith(today); }).length;
    return today + '-' + String(todayCount + 1).padStart(2,'0');
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

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;margin-bottom:12px;">';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">' + gases.length + '</div><div class="tp-metric-label">Cilindros</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-red)">' + expired + '</div><div class="tp-metric-label">Vencidos</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-amber)">' + warning + '</div><div class="tp-metric-label"><30 dias</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:#ef4444">' + lowLevel + '</div><div class="tp-metric-label">Nivel bajo</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--tp-blue)">' + equip.length + '</div><div class="tp-metric-label">Equipos</div></div>';
    html += '<div class="tp-metric"><div class="tp-metric-val" style="color:' + (eqExpired > 0 ? 'var(--tp-red)' : 'var(--tp-green)') + '">' + eqExpired + '</div><div class="tp-metric-label">Cal. vencida</div></div>';
    html += '</div>';

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
            html += '<div style="padding:3px 8px;font-size:10px;color:' + (a.sev==='red'?'#fca5a5':'#fde68a') + ';border:1px solid ' + (a.sev==='red'?'rgba(239,68,68,0.2)':'rgba(245,158,11,0.2)') + ';border-radius:4px;margin-bottom:2px;">' + a.msg + '</div>';
        });
        html += '</div>';
    } else if (gases.length > 0) {
        html += '<div class="tp-card" style="border-left:3px solid var(--tp-green);text-align:center;padding:20px;color:var(--tp-green);">Sin alertas. Todos los gases y equipos OK.</div>';
    }

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
        html += '<div style="font-size:9px;color:var(--tp-dim);">' + z.label + ' (' + z.type + ')</div>';
        html += '<div style="font-size:10px;font-weight:700;color:' + (occupied > 0 ? 'var(--tp-amber)' : 'var(--tp-dim)') + ';">' + occupied + '/' + z.slots + '</div>';
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
        html += '<div class="tp-card" style="text-align:center;padding:30px;color:var(--tp-dim);">Sin cilindros registrados. Ve a la pestana Gases para agregar.</div>';
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

    var html = '<div class="tp-card"><div class="tp-card-title"><span>Gestion de Cilindros (' + gases.length + ')</span>';
    html += '<div style="display:flex;gap:5px;"><button class="tp-btn tp-btn-primary" onclick="invShowAddGas()" style="font-size:10px;">+ Nuevo Cilindro</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="invExportGases()" style="font-size:10px;">Exportar</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="invImportGases()" style="font-size:10px;">Importar</button></div></div>';
    html += '<input type="file" id="inv-import-file" accept=".json" style="display:none;" onchange="invHandleImport(event)">';

    // Filters
    html += '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">';
    html += '<select class="tp-select" onchange="window._invGasFilterZone=this.value;invRender();" style="font-size:10px;"><option value="ALL">Todas zonas</option>';
    allZones.forEach(function(z){ html += '<option value="' + z + '" ' + (z===filterZone?'selected':'') + '>' + z + '</option>'; });
    html += '</select></div>';

    if (filtered.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Sin cilindros' + (filterZone !== 'ALL' ? ' en zona ' + filterZone : '') + '</div>';
    } else {
        html += '<div style="max-height:500px;overflow-y:auto;">';
        filtered.sort(function(a,b){ return (a.zone||'').localeCompare(b.zone||''); }).forEach(function(g) {
            var exp = invGasExpiry(g);
            var lvl = invGasLevel(g);
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;border-left:3px solid ' + exp.color + ';background:var(--tp-card);flex-wrap:wrap;gap:4px;">';
            html += '<div style="flex:1;min-width:180px;">';
            html += '<div style="font-weight:700;font-size:11px;">' + g.formula + ' <span style="color:var(--tp-dim);font-weight:400;">' + (g.concNominal||'') + '</span></div>';
            html += '<div style="font-size:9px;color:var(--tp-dim);">#' + g.controlNo + ' | Cil: ' + (g.cylinderNo||'?') + ' | ' + (g.zone||'?') + '</div>';
            html += '</div>';
            html += '<div style="display:flex;gap:6px;align-items:center;">';
            html += '<span style="font-size:8px;padding:2px 6px;border-radius:4px;background:' + exp.color + '20;color:' + exp.color + ';border:1px solid ' + exp.color + '30;">' + exp.text + '</span>';
            html += '<span style="font-size:8px;padding:2px 6px;border-radius:4px;background:' + lvl.color + '20;color:' + lvl.color + ';">' + lvl.text + '</span>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="invEditGas(\'' + g.id + '\')" style="font-size:9px;">\u270F</button>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="invShowBarcode(\'' + g.id + '\')" style="font-size:9px;">\u{1F4CB}</button>';
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

    var zoneOpts = invState.zones.map(function(z) {
        var opts = '';
        for (var i = 1; i <= z.slots; i++) {
            var code = z.id + (i<10?'0':'') + i;
            var occupied = invState.gases.some(function(x){ return x.zone === code && (!isEdit || x.id !== g.id); });
            opts += '<option value="' + code + '" ' + (g && g.zone===code?'selected':'') + ' ' + (occupied?'disabled':'') + '>' + code + (occupied?' (ocupado)':'') + '</option>';
        }
        return opts;
    }).join('');

    var gasTypeOpts = invState.gasTypes.map(function(gt) {
        return '<option value="' + gt.name + '" ' + (g && g.gasType===gt.name?'selected':'') + '>' + gt.name + ' (' + gt.formula + ')</option>';
    }).join('');

    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:500px;margin:30px auto;background:#fff;border-radius:14px;padding:20px;position:relative;max-height:90vh;overflow-y:auto;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">\u2715</button>' +
        '<h3 style="margin:0 0 12px;">' + title + '</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div><label style="font-size:10px;color:#64748b;">No. Control * <button onclick="document.getElementById(\x27inv-g-control\x27).value=invAutoControlNo()" style="font-size:8px;background:#0f766e;color:#fff;border:none;border-radius:4px;padding:1px 6px;cursor:pointer;">Auto-ID</button></label><input id="inv-g-control" value="' + (g?g.controlNo:invAutoControlNo()) + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">No. Cilindro</label><input id="inv-g-cylinder" value="' + (g?g.cylinderNo:'') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div style="grid-column:1/-1;"><label style="font-size:10px;color:#64748b;">Tipo de Gas *</label><select id="inv-g-type" onchange="invUpdateConcOpts()" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"><option value="">Seleccionar...</option>' + gasTypeOpts + '</select></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Conc. Nominal</label><select id="inv-g-conc" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></select></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Conc. Real</label><input id="inv-g-concreal" value="' + (g?g.concReal:'') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Trazabilidad</label><select id="inv-g-trace" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"><option ' + (g&&g.traceability==='EPA'?'selected':'') + '>EPA</option><option ' + (g&&g.traceability==='CENAM'?'selected':'') + '>CENAM</option><option ' + (g&&g.traceability==='NIST'?'selected':'') + '>NIST</option></select></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Vigencia</label><input id="inv-g-valid" type="date" value="' + (g?g.validUntil:'') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Zona + Posicion *</label><select id="inv-g-zone" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"><option value="">Seleccionar...</option>' + zoneOpts + '</select></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Estatus</label><select id="inv-g-status" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"><option ' + (g&&g.status==='Stock'?'selected':'') + '>Stock</option><option ' + (g&&g.status==='In use'?'selected':'') + '>In use</option><option ' + (g&&g.status==='Empty'?'selected':'') + '>Empty</option><option ' + (g&&g.status==='Spare'?'selected':'') + '>Spare</option></select></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Fecha recibido</label><input id="inv-g-regdate" type="date" value="' + (g?g.regDate:new Date().toISOString().slice(0,10)) + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveGas(\x27' + (editId||'') + '\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        (isEdit ? '<button onclick="if(confirm(\x27Eliminar cilindro?\x27)){invDeleteGas(\x27' + editId + '\x27);}" style="padding:10px;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;">Eliminar</button>' : '') +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';

    if (g) { invUpdateConcOpts(); document.getElementById('inv-g-conc').value = g.concNominal || ''; }
    else { invUpdateConcOpts(); }
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
        barcode: '*' + controlNo + '*'
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
        }
    } else {
        obj.id = invGenId();
        obj.readings = [];
        obj.timeline = [{date:new Date().toISOString(),action:'Alta — Recibido'}];
        invState.gases.push(obj);
    }

    invSave(); invPreloadData(); invRender(); invUpdateBadges();
    document.getElementById('invModal').style.display = 'none';
}

function invDeleteGas(id) {
    invState.gases = invState.gases.filter(function(g){ return g.id !== id; });
    invSave(); invPreloadData(); invRender(); invUpdateBadges();
    document.getElementById('invModal').style.display = 'none';
}

function invShowBarcode(id) {
    var g = invState.gases.find(function(x){return x.id===id;});
    if (!g) return;
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:350px;margin:40px auto;background:#fff;border-radius:14px;padding:30px;text-align:center;">' +
        '<h3 style="margin:0 0 10px;">' + g.formula + ' ' + (g.concNominal||'') + '</h3>' +
        '<div style="font-size:48px;font-family:monospace;letter-spacing:4px;margin:20px 0;">' + g.barcode + '</div>' +
        '<div style="font-size:14px;color:#64748b;">Control: ' + g.controlNo + '</div>' +
        '<div style="font-size:12px;color:#94a3b8;">Cilindro: ' + (g.cylinderNo||'?') + ' | Zona: ' + (g.zone||'?') + '</div>' +
        '<button onclick="window.print()" style="margin-top:15px;padding:8px 20px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;">Imprimir</button>' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="margin-top:15px;margin-left:8px;padding:8px 20px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cerrar</button>' +
        '</div>';
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
    html += '<div style="font-size:11px;color:#64748b;margin-bottom:12px;">Control: ' + g.controlNo + ' | Cilindro: ' + (g.cylinderNo||'?') + ' | Zona: ' + (g.zone||'?') + '</div>';
    // Status badges
    html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">';
    var statusClr = g.status==='In use'?'#dcfce7;color:#16a34a':g.status==='Empty'?'#fef2f2;color:#dc2626':'#fef9c3;color:#ca8a04';
    html += '<span style="font-size:10px;padding:3px 8px;border-radius:12px;background:' + statusClr + ';">' + g.status + '</span>';
    html += '<span style="font-size:10px;padding:3px 8px;border-radius:12px;background:' + exp.color + '20;color:' + exp.color + ';">' + exp.text + '</span>';
    html += '<span style="font-size:10px;padding:3px 8px;border-radius:12px;background:' + lvl.color + '20;color:' + lvl.color + ';">' + lvl.text + '</span>';
    html += '</div>';
    // Info grid
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:10px;margin-bottom:12px;color:#334155;">';
    html += '<div><span style="color:#94a3b8;">Recibido:</span> ' + (g.regDate||'?') + '</div>';
    html += '<div><span style="color:#94a3b8;">Vigencia:</span> ' + (g.validUntil||'?') + '</div>';
    html += '<div><span style="color:#94a3b8;">Trazabilidad:</span> ' + (g.traceability||'?') + '</div>';
    html += '<div><span style="color:#94a3b8;">Conc. Real:</span> ' + (g.concReal||'?') + '</div>';
    html += '</div>';
    // Timeline
    html += '<div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px;">Historial</div>';
    if (tl.length === 0) { html += '<div style="font-size:10px;color:#94a3b8;">Sin historial.</div>'; }
    else {
        tl.slice().reverse().forEach(function(e) {
            var d = new Date(e.date);
            html += '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f1f5f9;">';
            html += '<div style="font-size:9px;color:#94a3b8;min-width:70px;">' + d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'}) + '</div>';
            html += '<div style="font-size:10px;color:#334155;">' + e.action + '</div>';
            html += '</div>';
        });
    }
    // Last 5 readings
    if (g.readings && g.readings.length > 0) {
        html += '<div style="font-size:11px;font-weight:700;color:#0f172a;margin:10px 0 6px;">Ultimas Lecturas</div>';
        g.readings.slice(-5).reverse().forEach(function(r) {
            html += '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:10px;color:#334155;border-bottom:1px solid #f8fafc;">';
            html += '<span>' + r.date + '</span><span style="font-weight:700;">' + r.psi + ' psi</span>';
            html += '</div>';
        });
    }
    html += '</div>';
    modal.innerHTML = html;
}

function invShowZone(zoneId) {
    window._invGasFilterZone = zoneId;
    invState.activeTab = 'inv-gases';
    document.querySelectorAll('#inv-tabs-bar .tp-tab').forEach(function(b,i){b.classList.toggle('active',i===1);});
    invRender();
}

// ══════════════════════════════════════════════════
// READINGS (Daily pressure readings)
// ══════════════════════════════════════════════════
function invRenderReadings(el) {
    var gases = invState.gases.filter(function(g){ return g.status === 'In use'; });
    var html = '<div class="tp-card"><div class="tp-card-title"><span>Lecturas Diarias de Presion</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invBulkReading()" style="font-size:10px;">Guardar Lecturas</button></div>';
    html += '<div style="font-size:10px;color:var(--tp-dim);margin-bottom:8px;">Registra la presion (psi) de cada cilindro en uso.</div>';

    if (gases.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Sin cilindros en uso.</div>';
    } else {
        html += '<div style="max-height:500px;overflow-y:auto;">';
        gases.forEach(function(g) {
            var lastR = g.readings.length > 0 ? g.readings[g.readings.length-1] : null;
            var lvl = invGasLevel(g);
            html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;background:var(--tp-card);flex-wrap:wrap;">';
            html += '<div style="min-width:100px;"><div style="font-weight:700;font-size:10px;">' + g.formula + ' ' + (g.concNominal||'') + '</div><div style="font-size:8px;color:var(--tp-dim);">#' + g.controlNo + ' | ' + (g.zone||'?') + '</div></div>';
            html += '<div style="flex:1;min-width:180px;display:flex;gap:3px;flex-wrap:wrap;">';
            var last5 = (g.readings||[]).slice(-5);
            if (last5.length > 0) {
                last5.forEach(function(r){ html += '<span style="font-size:7px;padding:1px 4px;border-radius:3px;background:rgba(255,255,255,0.05);border:1px solid var(--tp-border);color:var(--tp-dim);">' + r.date.slice(5) + ': <strong style="color:#fff;">' + r.psi + '</strong></span>'; });
            } else { html += '<span style="font-size:8px;color:var(--tp-dim);">Sin lecturas</span>'; }
            html += '</div>';
            html += '<input type="number" id="inv-rd-' + g.id + '" placeholder="psi" style="width:70px;padding:5px;border:1px solid var(--tp-border);border-radius:5px;background:#1e293b;color:#fff;font-size:11px;text-align:center;">';
            html += '</div>';
        });
        html += '</div>';
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
            html += '<tr><td style="font-size:9px;">' + r.date + '</td><td style="font-size:9px;">' + r.gas + '</td><td style="font-size:9px;">' + (r.zone||'') + '</td><td style="font-weight:700;">' + r.psi + '</td></tr>';
        });
        html += '</tbody></table></div>';
    } else { html += '<div style="text-align:center;padding:15px;color:var(--tp-dim);">Sin lecturas registradas.</div>'; }
    html += '</div>';
    el.innerHTML = html;
}

function invBulkReading() {
    var date = new Date().toISOString().slice(0,10);
    var count = 0;
    invState.gases.filter(function(g){ return g.status === 'In use'; }).forEach(function(g) {
        var inp = document.getElementById('inv-rd-' + g.id);
        if (inp && inp.value) {
            var psi = parseFloat(inp.value);
            if (!isNaN(psi) && psi >= 0) {
                if (!g.readings) g.readings = [];
                g.readings.push({date: date, psi: psi});
                count++;
            }
        }
    });
    if (count === 0) { showToast('No se ingresaron lecturas', 'warning'); return; }
    invSave(); invRender();
    showToast(count + ' lecturas guardadas para ' + date, 'success');
}

// ══════════════════════════════════════════════════
// EQUIPMENT
// ══════════════════════════════════════════════════
function invRenderEquipment(el) {
    var equip = invState.equipment;
    var html = '<div class="tp-card"><div class="tp-card-title"><span>Equipos y Calibraciones (' + equip.length + ')</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invAddEquipment()" style="font-size:10px;">+ Agregar</button></div>';

    if (equip.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Sin equipos. Agrega analizadores, dinamometro, CVS, etc.</div>';
    } else {
        equip.forEach(function(e) {
            var now = new Date();
            var nextCal = e.nextCalDate ? new Date(e.nextCalDate) : null;
            var daysLeft = nextCal ? Math.round((nextCal - now)/(1000*60*60*24)) : null;
            var clr = daysLeft === null ? '#94a3b8' : daysLeft < 0 ? '#ef4444' : daysLeft < 30 ? '#f59e0b' : '#10b981';
            var statusTxt = daysLeft === null ? 'Sin fecha' : daysLeft < 0 ? 'Vencido ' + Math.abs(daysLeft) + 'd' : 'Vigente ' + daysLeft + 'd';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;border-left:3px solid ' + clr + ';background:var(--tp-card);flex-wrap:wrap;gap:4px;">';
            html += '<div style="flex:1;min-width:140px;"><div style="font-weight:700;font-size:11px;">' + e.name + '</div>';
            html += '<div style="font-size:9px;color:var(--tp-dim);">S/N: ' + (e.serialNo||'?') + ' | ' + (e.type||'') + ' | ' + (e.location||'') + '</div></div>';
            html += '<div style="display:flex;gap:6px;align-items:center;">';
            html += '<span style="font-size:8px;padding:2px 6px;border-radius:4px;background:' + clr + '20;color:' + clr + ';">' + statusTxt + '</span>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="invEditEquipment(\'' + e.id + '\')" style="font-size:9px;">\u270F</button>';
            html += '</div></div>';
        });
    }
    html += '</div>';
    el.innerHTML = html;
}

function invAddEquipment(editId) {
    var e = editId ? invState.equipment.find(function(x){return x.id===editId;}) : null;
    var isEdit = !!e;
    var v = function(f,d){ return e ? (e[f]||'') : (d||''); };
    var modal = document.getElementById('invModal');
    modal.style.display = 'block';
    modal.innerHTML = '<div style="max-width:500px;margin:30px auto;background:#fff;border-radius:14px;padding:20px;position:relative;max-height:90vh;overflow-y:auto;">' +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;">\u2715</button>' +
        '<h3 style="margin:0 0 12px;color:#0f172a;">' + (isEdit ? 'Editar Equipo' : 'Nuevo Equipo') + '</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<div style="grid-column:1/-1;"><label style="font-size:10px;color:#64748b;">Nombre *</label><input id="inv-eq-name" value="' + v('name') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Tipo</label><input id="inv-eq-type" value="' + v('type') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Marca</label><input id="inv-eq-brand" value="' + v('brand') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Modelo</label><input id="inv-eq-model" value="' + v('model') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">No. Serie</label><input id="inv-eq-serial" value="' + v('serialNo') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">KMM ID</label><input id="inv-eq-kmmid" value="' + v('kmmId') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Ubicacion</label><input id="inv-eq-loc" value="' + v('location') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Trazabilidad</label><input id="inv-eq-trace" value="' + v('traceability','EMA') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Lab Calibracion</label><input id="inv-eq-callab" value="' + v('calLab') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Ultima Cal.</label><input id="inv-eq-lastcal" type="date" value="' + v('lastCalDate') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Proxima Cal.</label><input id="inv-eq-nextcal" type="date" value="' + v('nextCalDate') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">No. Certificado</label><input id="inv-eq-cert" value="' + v('calCertNo') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveEquipment(\x27' + (editId||'') + '\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        (isEdit ? '<button onclick="if(confirm(\x27Eliminar?\x27)){invState.equipment=invState.equipment.filter(function(x){return x.id!==\x27' + editId + '\x27;});invSave();invRender();document.getElementById(\x27invModal\x27).style.display=\x27none\x27;}" style="padding:10px;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;">Eliminar</button>' : '') +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
}

function invSaveEquipment(editId) {
    var obj = {
        name: document.getElementById('inv-eq-name').value.trim(),
        type: document.getElementById('inv-eq-type').value.trim(),
        brand: document.getElementById('inv-eq-brand').value.trim(),
        model: document.getElementById('inv-eq-model').value.trim(),
        serialNo: document.getElementById('inv-eq-serial').value.trim(),
        kmmId: document.getElementById('inv-eq-kmmid').value.trim(),
        location: document.getElementById('inv-eq-loc').value.trim(),
        traceability: document.getElementById('inv-eq-trace').value.trim(),
        calLab: document.getElementById('inv-eq-callab').value.trim(),
        lastCalDate: document.getElementById('inv-eq-lastcal').value,
        nextCalDate: document.getElementById('inv-eq-nextcal').value,
        calCertNo: document.getElementById('inv-eq-cert').value.trim()
    };
    if (!obj.name) { showToast('Nombre requerido', 'error'); return; }
    if (editId) {
        var e = invState.equipment.find(function(x){return x.id===editId;});
        if (e) Object.assign(e, obj);
    } else {
        obj.id = invGenId();
        obj.status = 'active';
        invState.equipment.push(obj);
    }
    invSave(); invRender(); invUpdateBadges();
    document.getElementById('invModal').style.display = 'none';
}

function invEditEquipment(id) { invAddEquipment(id); }

// ══════════════════════════════════════════════════
// PREDICTIONS
// ══════════════════════════════════════════════════
function invRenderPredict(el) {
    var gases = invState.gases.filter(function(g){ return g.readings && g.readings.length >= 2 && g.status === 'In use'; });
    var log = invState.usageLog || [];

    var html = '<div class="tp-card"><div class="tp-card-title"><span>Prediccion de Consumo</span></div>';
    html += '<div style="font-size:10px;color:var(--tp-dim);margin-bottom:10px;">Basado en lecturas + pruebas de Cascade. Se perfecciona con cada lectura.</div>';

    // Usage per regulation summary
    var regUsage = {};
    log.forEach(function(l) {
        var key = l.regulation || 'General';
        if (!regUsage[key]) regUsage[key] = { tests: 0, entries: [] };
        regUsage[key].tests++;
        regUsage[key].entries.push(l);
    });

    if (Object.keys(regUsage).length > 0) {
        html += '<div style="margin-bottom:10px;"><div style="font-size:10px;font-weight:700;color:var(--tp-amber);margin-bottom:4px;">Pruebas registradas por regulacion</div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
        Object.keys(regUsage).forEach(function(r) {
            html += '<span style="font-size:9px;padding:3px 8px;border-radius:4px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);color:var(--tp-amber);">' + r + ': ' + regUsage[r].tests + ' pruebas</span>';
        });
        html += '</div></div>';
    }

    if (gases.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Necesitas al menos 2 lecturas en cilindros activos.</div>';
    } else {
        // Sort by days remaining
        var predictions = gases.map(function(g) {
            var rdgs = g.readings;
            var first = rdgs[0]; var last = rdgs[rdgs.length-1];
            var daysDiff = Math.max(1, Math.round((new Date(last.date) - new Date(first.date)) / (1000*60*60*24)));
            var psiDrop = first.psi - last.psi;
            var dailyRate = psiDrop / daysDiff;

            // Enhanced: calculate psi per test from usage log
            var gasLog = log.filter(function(l) { return l.gasFormula === g.formula; });
            var psiPerTest = 0;
            if (gasLog.length >= 2 && rdgs.length >= 2) {
                // Find readings that bracket test dates
                var totalPsiUsed = first.psi - last.psi;
                var totalTests = gasLog.filter(function(l) {
                    return l.date >= first.date && l.date <= last.date;
                }).length;
                psiPerTest = totalTests > 0 ? (totalPsiUsed / totalTests) : 0;
            }

            var weeklyRate = dailyRate * 7;
            var daysLeft = dailyRate > 0 ? Math.round(last.psi / dailyRate) : 999;
            var emptyDate = new Date(); emptyDate.setDate(emptyDate.getDate() + daysLeft);
            var pctLeft = first.psi > 0 ? Math.round((last.psi / first.psi) * 100) : 0;

            return { g:g, dailyRate:dailyRate, weeklyRate:weeklyRate, daysLeft:daysLeft, emptyDate:emptyDate, pctLeft:pctLeft, psiPerTest:psiPerTest, lastPsi:last.psi, readings:rdgs.length };
        }).sort(function(a,b) { return a.daysLeft - b.daysLeft; });

        predictions.forEach(function(p) {
            var g = p.g;
            html += '<div style="padding:10px;margin-bottom:6px;border:1px solid var(--tp-border);border-radius:8px;border-left:3px solid ' + (p.daysLeft < 14 ? '#ef4444' : p.daysLeft < 30 ? '#f59e0b' : '#10b981') + ';background:var(--tp-card);">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">';
            html += '<div><span style="font-weight:700;font-size:11px;">' + g.formula + ' ' + (g.concNominal||'') + '</span> <span style="font-size:9px;color:var(--tp-dim);">#' + g.controlNo + ' (' + (g.zone||'?') + ')</span></div>';
            html += '<span style="font-size:9px;font-weight:700;color:' + (p.daysLeft < 14 ? '#ef4444' : p.daysLeft < 30 ? '#f59e0b' : '#10b981') + ';">' + (p.daysLeft > 365 ? '>1 ano' : '~' + p.daysLeft + ' dias') + '</span>';
            html += '</div>';
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:4px;margin-top:6px;">';
            html += '<div style="font-size:9px;"><span style="color:var(--tp-dim);">Actual:</span> <strong>' + p.lastPsi + ' psi</strong></div>';
            html += '<div style="font-size:9px;"><span style="color:var(--tp-dim);">psi/dia:</span> <strong>' + p.dailyRate.toFixed(1) + '</strong></div>';
            html += '<div style="font-size:9px;"><span style="color:var(--tp-dim);">psi/sem:</span> <strong>' + p.weeklyRate.toFixed(0) + '</strong></div>';
            if (p.psiPerTest > 0) html += '<div style="font-size:9px;"><span style="color:var(--tp-dim);">psi/prueba:</span> <strong style="color:var(--tp-amber);">' + p.psiPerTest.toFixed(1) + '</strong></div>';
            html += '<div style="font-size:9px;"><span style="color:var(--tp-dim);">Vacio:</span> <strong>' + (p.daysLeft > 365 ? '>1 ano' : p.emptyDate.toLocaleDateString('es-MX',{day:'numeric',month:'short'})) + '</strong></div>';
            html += '<div style="font-size:9px;"><span style="color:var(--tp-dim);">Lecturas:</span> <strong>' + p.readings + '</strong></div>';
            html += '</div>';
            html += '<div class="tp-bar" style="width:100%;margin-top:4px;height:6px;"><div class="tp-bar-fill" style="width:' + p.pctLeft + '%;background:' + (p.pctLeft < 15 ? '#ef4444' : p.pctLeft < 30 ? '#f59e0b' : '#10b981') + ';"></div></div>';
            html += '</div>';
        });

        // Weekly plan estimation
        var wp = (typeof tpState !== 'undefined' && tpState.weeklyPlans) ? tpState.weeklyPlans : [];
        if (wp.length > 0) {
            var lastWp = wp[wp.length - 1];
            var pending = lastWp.items ? lastWp.items.filter(function(i){return !i.completed;}).length : 0;
            if (pending > 0) {
                html += '<div class="tp-card" style="border-left:3px solid var(--tp-blue);margin-top:8px;"><div class="tp-card-title"><span>Estimacion para plan semanal (' + pending + ' pruebas pendientes)</span></div>';
                var hasData = predictions.some(function(p){ return p.psiPerTest > 0; });
                if (hasData) {
                    html += '<div style="font-size:10px;color:var(--tp-dim);margin-bottom:6px;">Basado en consumo promedio por prueba:</div>';
                    predictions.filter(function(p){return p.psiPerTest > 0;}).forEach(function(p) {
                        var needed = p.psiPerTest * pending;
                        var sufficient = p.lastPsi >= needed;
                        html += '<div style="font-size:10px;padding:3px 6px;margin-bottom:2px;color:' + (sufficient?'var(--tp-green)':'var(--tp-red)') + ';">' + p.g.formula + ': necesita ~' + needed.toFixed(0) + ' psi, tiene ' + p.lastPsi + ' psi ' + (sufficient ? 'OK' : 'INSUFICIENTE') + '</div>';
                    });
                } else {
                    html += '<div style="font-size:10px;color:var(--tp-dim);">Aun no hay datos suficientes de psi/prueba. Se calcula conforme se liberen vehiculos y se registren lecturas.</div>';
                }
                html += '</div>';
            }
        }
    }
    html += '</div>';

    // Fuel prediction
    var fuelTanks = invState.fuelTanks || [];
    var fuelWithReadings = fuelTanks.filter(function(t){ return t.readings && t.readings.length >= 1; });
    if (fuelWithReadings.length > 0) {
        html += '<div class="tp-card" style="margin-top:8px;"><div class="tp-card-title"><span>Prediccion Combustible</span></div>';
        fuelWithReadings.forEach(function(t) {
            var rdgs = t.readings;
            var last = rdgs[rdgs.length-1];
            var pct = t.capacity > 0 ? Math.round((last.level / t.capacity) * 100) : 0;
            var dailyRate = 0; var daysLeft = 999;
            if (rdgs.length >= 2) {
                var first = rdgs[0];
                var daysDiff = Math.max(1, Math.round((new Date(last.date) - new Date(first.date))/(1000*60*60*24)));
                var drop = first.level - last.level;
                dailyRate = drop / daysDiff;
                daysLeft = dailyRate > 0 ? Math.round(last.level / dailyRate) : 999;
            }
            var clr = daysLeft < 14 ? '#ef4444' : daysLeft < 30 ? '#f59e0b' : '#10b981';
            html += '<div style="padding:8px;margin-bottom:4px;border:1px solid var(--tp-border);border-radius:6px;border-left:3px solid ' + clr + ';background:var(--tp-card);">';
            html += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;">';
            html += '<div><strong>' + t.name + '</strong> <span style="font-size:9px;color:var(--tp-dim);">(' + (t.regulation||t.fuelType||'') + ')</span></div>';
            html += '<span style="font-size:10px;font-weight:700;color:' + clr + ';">' + (daysLeft > 365 ? '>1 ano' : '~' + daysLeft + ' dias') + '</span>';
            html += '</div>';
            html += '<div style="display:flex;gap:12px;font-size:9px;margin-top:4px;">';
            html += '<span>Nivel: <strong>' + last.level + '/' + t.capacity + ' ' + (t.unit||'L') + '</strong></span>';
            if (dailyRate > 0) html += '<span>Consumo/dia: <strong>' + dailyRate.toFixed(1) + ' ' + (t.unit||'L') + '</strong></span>';
            if (dailyRate > 0) html += '<span>Consumo/sem: <strong>' + (dailyRate*7).toFixed(1) + ' ' + (t.unit||'L') + '</strong></span>';
            html += '</div>';
            html += '<div class="tp-bar" style="width:100%;margin-top:4px;height:6px;"><div class="tp-bar-fill" style="width:' + pct + '%;background:' + (pct<15?'#ef4444':pct<30?'#f59e0b':'#10b981') + ';"></div></div>';
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
    a.download = 'kia_inventory_' + new Date().toISOString().slice(0,10) + '.json';
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
function invLogTestUsage(vehicle) {
    if (!vehicle) return;
    var entry = {
        date: new Date().toISOString().slice(0,10),
        vin: vehicle.vin || '',
        configCode: vehicle.configCode || '',
        purpose: vehicle.purpose || '',
        regulation: vehicle.configCode ? vehicle.configCode.split(' ')[0] : '',
        gasFormula: '', // Will be populated per gas type used
        timestamp: new Date().toISOString()
    };
    // Log one entry per gas type in use (they all get consumed per test)
    var inUse = invState.gases.filter(function(g){ return g.status === 'In use'; });
    var formulas = {};
    inUse.forEach(function(g) { formulas[g.formula] = true; });
    Object.keys(formulas).forEach(function(f) {
        var logEntry = JSON.parse(JSON.stringify(entry));
        logEntry.gasFormula = f;
        invState.usageLog.push(logEntry);
    });
    // Keep log manageable
    if (invState.usageLog.length > 2000) invState.usageLog = invState.usageLog.slice(-1500);
    invSave();
}

// ══════════════════════════════════════════════════
// INVENTORY: FUEL MANAGEMENT
// ══════════════════════════════════════════════════
function invRenderFuel(el) {
    if (!invState.fuelTanks) invState.fuelTanks = [];
    var tanks = invState.fuelTanks;

    var html = '<div class="tp-card"><div class="tp-card-title"><span>Combustible de Referencia</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invAddFuelTank()" style="font-size:10px;">+ Agregar Tambo</button></div>';

    if (tanks.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);">Sin tambos registrados. Agrega tus tambos de gasolina, diesel, etc.</div>';
    } else {
        tanks.forEach(function(t) {
            var pct = t.capacity > 0 ? Math.round((t.currentLevel / t.capacity) * 100) : 0;
            var clr = pct < 15 ? '#ef4444' : pct < 30 ? '#f59e0b' : '#10b981';
            html += '<div style="padding:10px;margin-bottom:6px;border:1px solid var(--tp-border);border-radius:8px;border-left:3px solid ' + clr + ';background:var(--tp-card);">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">';
            html += '<div><span style="font-weight:700;font-size:12px;">' + t.name + '</span>';
            html += '<div style="font-size:9px;color:var(--tp-dim);">' + (t.fuelType||'') + ' | ' + (t.octane||'') + ' | ' + (t.supplier||'') + '</div></div>';
            html += '<div style="display:flex;gap:6px;align-items:center;">';
            html += '<span style="font-size:10px;font-weight:700;color:' + clr + ';">' + t.currentLevel + '/' + t.capacity + ' ' + (t.unit||'L') + ' (' + pct + '%)</span>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="invEditFuelTank(\x27' + t.id + '\x27)" style="font-size:9px;">\u270F</button>';
            html += '<button class="tp-btn tp-btn-ghost" onclick="invFuelReading(\x27' + t.id + '\x27)" style="font-size:9px;">\u{1F4CF}</button>';
            html += '</div></div>';
            // Progress bar
            html += '<div class="tp-bar" style="width:100%;margin-top:4px;height:8px;"><div class="tp-bar-fill" style="width:' + pct + '%;background:' + clr + ';"></div></div>';
            // Readings mini history
            if (t.readings && t.readings.length > 0) {
                html += '<div style="font-size:8px;color:var(--tp-dim);margin-top:4px;">Ultimas: ' + t.readings.slice(-5).map(function(r){return r.date + ': ' + r.level + (t.unit||'L');}).join(' | ') + '</div>';
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
        '<div style="grid-column:1/-1;"><label style="font-size:10px;color:#64748b;">Nombre *</label><input id="inv-ft-name" value="' + v('name','Tambo') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Tipo combustible</label><input id="inv-ft-type" value="' + v('fuelType','Gasolina Referencia') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Regulacion</label><input id="inv-ft-reg" value="' + v('regulation') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Octanaje/Spec</label><input id="inv-ft-octane" value="' + v('octane','87 AKI') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Proveedor</label><input id="inv-ft-supplier" value="' + v('supplier') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Capacidad</label><input id="inv-ft-cap" type="number" value="' + v('capacity','400') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Nivel actual</label><input id="inv-ft-level" type="number" value="' + v('currentLevel','400') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Unidad</label><select id="inv-ft-unit" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"><option ' + (v('unit')==='L'?'selected':'') + '>L</option><option ' + (v('unit')==='gal'?'selected':'') + '>gal</option></select></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Fecha recepcion</label><input id="inv-ft-date" type="date" value="' + v('regDate',new Date().toISOString().slice(0,10)) + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Estatus</label><select id="inv-ft-status" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"><option ' + (v('fuelStatus')==='Abierto'?'selected':'') + '>Abierto</option><option ' + (v('fuelStatus')==='Cerrado'?'selected':'') + '>Cerrado</option></select></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveFuelTank(\x27' + (editId||'') + '\x27)" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        (isEdit ? '<button onclick="if(confirm(\x27Eliminar?\x27)){invState.fuelTanks=invState.fuelTanks.filter(function(x){return x.id!==\x27' + editId + '\x27;});invSave();invRender();document.getElementById(\x27invModal\x27).style.display=\x27none\x27;}" style="padding:10px;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;">Eliminar</button>' : '') +
        '<button onclick="document.getElementById(\x27invModal\x27).style.display=\x27none\x27" style="padding:10px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
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
        }
    } else {
        if (!invState.fuelTanks) invState.fuelTanks = [];
        obj.id = invGenId();
        obj.readings = [];
        obj.timeline = [{date:new Date().toISOString(),action:'Recepcion'}];
        invState.fuelTanks.push(obj);
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
        '<div><label style="font-size:10px;color:#64748b;">Nivel actual (' + (t.unit||'L') + ')</label>' +
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
    t.readings.push({ date: new Date().toISOString().slice(0,10), level: level });
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

    var html = '<div class="tp-card"><div class="tp-card-title"><span>Reporte Semanal de Consumibles</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invExportReport()" style="font-size:10px;">Copiar HTML</button></div>';
    html += '<div style="font-size:10px;color:var(--tp-dim);margin-bottom:8px;">Semana: ' + weekLabel + '</div>';

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
        html += '<div style="font-weight:700;font-size:11px;color:var(--tp-amber);margin-bottom:4px;">' + (t.regulation||t.name) + '</div>';
        html += '<div style="display:flex;align-items:center;gap:10px;">';
        // Chart
        html += '<div style="width:200px;height:120px;border:1px solid var(--tp-border);border-radius:6px;padding:8px;background:var(--tp-card);position:relative;">';
        html += '<div style="font-size:9px;text-align:center;margin-bottom:4px;">Fuel Status ' + (t.regulation||t.name) + '</div>';
        html += '<div style="display:flex;height:80px;align-items:flex-end;justify-content:center;gap:0;">';
        var barH = 70;
        html += '<div style="width:80px;height:' + barH + 'px;display:flex;flex-direction:column;">';
        html += '<div style="height:' + (pctRemaining * barH / 100) + 'px;background:#22c55e;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;">' + remaining + '</div>';
        html += '<div style="height:' + (pctUsed * barH / 100) + 'px;background:#c2410c;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;">' + (used > 0 ? used : '') + '</div>';
        html += '</div></div></div>';
        // Stats
        html += '<div style="font-size:10px;">';
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
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:9px;">';
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
        html += '<td style="padding:3px 6px;font-size:8px;color:var(--tp-dim);">' + (g.gasCategory||'Ref') + '</td>';
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
        html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:9px;">';
        html += '<thead><tr style="background:#7c3aed;color:#fff;"><th style="padding:4px;">Equipo</th><th>ID</th><th>Vencimiento</th><th>Dias</th><th>Status</th></tr></thead><tbody>';
        eqAlerts.forEach(function(e) {
            var days = Math.round((new Date(e.nextCalDate) - new Date())/(1000*60*60*24));
            var clr = days < 0 ? '#ef4444' : days < 30 ? '#f59e0b' : '#22c55e';
            html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:3px 6px;">' + e.name + '</td><td>' + (e.kmmId||e.serialNo||'') + '</td><td>' + e.nextCalDate + '</td><td style="color:' + clr + ';font-weight:700;">' + days + '</td><td style="color:' + clr + ';">' + (days<0?'VENCIDO':days+'d') + '</td></tr>';
        });
        html += '</tbody></table></div>';
    } else {
        html += '<div style="text-align:center;padding:10px;color:var(--tp-green);font-size:11px;">Todas las calibraciones vigentes (>60 dias)</div>';
    }

    html += '</div>';
    el.innerHTML = html;
}

function invExportReport() {
    var content = document.getElementById('inv-content').innerHTML;
    var blob = new Blob([
        '<html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial;background:#fff;color:#333;padding:20px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ddd;padding:4px 8px;font-size:11px;}th{background:#0e7490;color:#fff;}</style></head><body>' +
        '<h2>KMX Emissions Laboratory Consumables Status ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + '</h2>' +
        content + '</body></html>'
    ], {type:'text/html'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'consumables_report_' + new Date().toISOString().slice(0,10) + '.html';
    a.click();
    showToast('Reporte HTML descargado', 'success');
}

function invRenderConfig(el) {
    var html = '<div class="tp-card"><div class="tp-card-title"><span>Configuracion de Zonas</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invAddZone()" style="font-size:10px;">+ Agregar Zona</button></div>';
    html += '<div style="font-size:10px;color:var(--tp-dim);margin-bottom:8px;">Edita el layout de tu cuarto de gases. Cada zona tiene un ID, nombre, slots y tipo.</div>';

    invState.zones.forEach(function(z, idx) {
        var occupied = invState.gases.filter(function(g){ return g.zone && g.zone.startsWith(z.id); }).length;
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:3px;border:1px solid var(--tp-border);border-radius:6px;background:var(--tp-card);flex-wrap:wrap;">';
        html += '<div style="font-weight:800;font-size:14px;width:30px;text-align:center;color:var(--tp-amber);">' + z.id + '</div>';
        html += '<div style="flex:1;min-width:120px;"><div style="font-size:11px;font-weight:600;">' + z.label + '</div><div style="font-size:9px;color:var(--tp-dim);">' + z.slots + ' slots | ' + z.type + ' | ' + occupied + ' ocupados</div></div>';
        html += '<div style="display:flex;gap:4px;">';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invEditZone(' + idx + ')" style="font-size:9px;">\u270F</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invDeleteZone(' + idx + ')" style="font-size:9px;color:var(--tp-red);">\u2715</button>';
        html += '</div></div>';
    });
    html += '</div>';

    // Gas types config
    html += '<div class="tp-card"><div class="tp-card-title"><span>Tipos de Gas</span>';
    html += '<button class="tp-btn tp-btn-primary" onclick="invAddGasType()" style="font-size:10px;">+ Agregar Tipo</button></div>';
    invState.gasTypes.forEach(function(gt, idx) {
        html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;margin-bottom:2px;border:1px solid var(--tp-border);border-radius:5px;background:var(--tp-card);">';
        html += '<div style="flex:1;font-size:10px;"><strong>' + gt.formula + '</strong> — ' + gt.name + '</div>';
        html += '<div style="font-size:8px;color:var(--tp-dim);">' + gt.concs.join(', ') + '</div>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invEditGasType(' + idx + ')" style="font-size:8px;">\u270F</button>';
        html += '<button class="tp-btn tp-btn-ghost" onclick="invDeleteGasType(' + idx + ')" style="font-size:8px;color:var(--tp-red);">\u2715</button>';
        html += '</div>';
    });
    html += '</div>';

    // Fuel types config  
    html += '<div class="tp-card"><div class="tp-card-title"><span>Combustibles Registrados</span></div>';
    html += '<div style="font-size:10px;color:var(--tp-dim);">' + ((invState.fuelTanks||[]).length) + ' tambos. Administralos desde la pestana Combustible.</div>';
    html += '</div>';

    // Data management
    html += '<div class="tp-card"><div class="tp-card-title"><span>Datos</span></div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    html += '<button class="tp-btn tp-btn-ghost" onclick="invExportGases()" style="font-size:10px;">Exportar JSON</button>';
    html += '<button class="tp-btn tp-btn-ghost" onclick="invImportGases()" style="font-size:10px;">Importar JSON</button>';
    html += '<button class="tp-btn tp-btn-danger" onclick="if(confirm(\x27Borrar TODOS los datos de inventario?\x27)){invState.gases=[];invState.equipment=[];invState.fuelTanks=[];invState.usageLog=[];invSave();invRender();invUpdateBadges();}" style="font-size:10px;">Resetear</button>';
    html += '</div>';
    html += '<div style="font-size:9px;color:var(--tp-dim);margin-top:4px;">' + invState.gases.length + ' gases, ' + invState.equipment.length + ' equipos, ' + (invState.usageLog||[]).length + ' registros de uso</div>';
    html += '</div>';

    el.innerHTML = html;
}

function invAddZone() {
    invShowZoneModal(null);
}

function invEditZone(idx) {
    invShowZoneModal(idx);
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
        (!isEdit ? '<div><label style="font-size:10px;color:#64748b;">ID (1-2 caracteres, ej: I, J)</label><input id="inv-zone-id" maxlength="2" value="" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;font-size:16px;text-transform:uppercase;"></div>' : '') +
        '<div><label style="font-size:10px;color:#64748b;">Nombre</label><input id="inv-zone-label" value="' + v('label', 'Zona') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Cantidad de slots</label><input id="inv-zone-slots" type="number" value="' + v('slots', '10') + '" min="1" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Tipo</label><select id="inv-zone-type" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;">' +
        '<option value="online"' + (v('type')==='online'?' selected':'') + '>Online</option>' +
        '<option value="offline"' + (v('type','offline')==='offline'?' selected':'') + '>Offline</option>' +
        '<option value="special"' + (v('type')==='special'?' selected':'') + '>Special</option>' +
        '<option value="fuel"' + (v('type')==='fuel'?' selected':'') + '>Fuel</option>' +
        '</select></div>' +
        '</div>' +
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
    if (!confirm('Eliminar zona ' + z.id + '?')) return;
    invState.zones.splice(idx, 1);
    invSave(); invRender();
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
        '<div><label style="font-size:10px;color:#64748b;">Nombre completo (ej: Propano/Aire)</label><input id="inv-gt-name" value="' + v('name') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Formula (ej: C3H8/Air)</label><input id="inv-gt-formula" value="' + v('formula') + '" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '<div><label style="font-size:10px;color:#64748b;">Concentraciones (separadas por coma)</label><input id="inv-gt-concs" value="' + concsVal + '" placeholder="ej: 2 ppm, 5 ppm, 10 ppm" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button onclick="invSaveGasTypeModal(' + (isEdit ? idx : -1) + ')" style="flex:1;padding:10px;background:#0f766e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Guardar</button>' +
        (isEdit ? '<button onclick="if(confirm(\x27Eliminar tipo de gas?\x27)){invState.gasTypes.splice(' + idx + ',1);invSave();invRender();document.getElementById(\x27invModal\x27).style.display=\x27none\x27;}" style="padding:10px;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;">Eliminar</button>' : '') +
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
    if (!confirm('Eliminar tipo ' + invState.gasTypes[idx].name + '?')) return;
    invState.gasTypes.splice(idx, 1);
    invSave(); invRender();
}
