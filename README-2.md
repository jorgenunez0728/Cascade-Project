# KIA EmLab — Plataforma Integrada de Laboratorio de Emisiones

> Sistema unificado de gestión para el laboratorio de emisiones vehiculares de KIA México. 4 módulos, 180 funciones, una sola aplicación web offline-first.

---

## Descripción

KIA EmLab es una plataforma web monolítica (single-file HTML) diseñada para digitalizar y automatizar las operaciones del Laboratorio de Emisiones de KIA México (KMX). Reemplaza múltiples procesos manuales — hojas COP15-F05 en papel, Excels con macros VBA para control de gases, reportes por email en Outlook — con una interfaz unificada optimizada para uso en smartphones y tablets de piso.

La plataforma opera 100% offline usando localStorage como base de datos, sin dependencia de servidores ni conexión a internet. Todos los datos se exportan/importan como JSON para respaldo.

---

## Módulos

### 🔬 COP15 Cascade — Gestión de Vehículos en Prueba
Ciclo de vida completo del vehículo dentro del laboratorio:

- **Alta**: Registro con selección en cascada (Modelo → Año → Transmisión → Environment Package → Regulación → Drive Type → Motor → Llanta → Región → Body Type → Engine Package). OCR para VIN con cámara del dispositivo. Firma digital del inspector.
- **Preacondicionamiento**: Tracking de tiempos con registro de operador y condiciones.
- **Prueba**: Formularios diferenciados por propósito — COP-Emisiones y ND-Emisiones usan formulario completo de emisiones; COP-OBD2, EO-OBD2 y ND-OBD2 usan formulario simplificado. Captura de resultados por Bag.
- **Liberación**: Archivo automático, exportación JSON individual, alimentación automática al Test Plan Manager.
- **PDF**: Generación del formato oficial COP15-F05 idéntico al original, con checkmarks, datos de inspección, fotografías y firma digital.
- **Historial**: Timeline completo de cada vehículo con todas las acciones registradas. Botón de purga individual con exportación previa.
- **Alertas**: Detección automática de vehículos estancados (>48h sin cambio de estatus).

**Propósitos soportados**: Correlación, Investigación, COP-Emisiones, EO-Emisiones, COP-OBD2, EO-OBD2, ND-Emisiones (no cuenta para plan), ND-OBD2 (no cuenta para plan).

### 📊 Test Plan Manager — Planificación de Producción
Gestión del plan anual de pruebas COP por familia de configuración:

- **Importación CSV**: Carga del plan de producción con detección automática de cambios (configuraciones nuevas, retiradas, cambios de volumen). Historial de importaciones con diff.
- **Análisis**: Cálculo de requerimiento por regla COP (√N, mínimos, máximos por regulación). Puntaje de prioridad compuesto (déficit × volumen × urgencia).
- **Plan Semanal**: Generación automática basada en capacidad diaria, con picks manuales, exportación para WhatsApp/email, y carry-over de semanas previas.
- **Plan vs Actual**: Dashboard de cumplimiento con progreso visual por configuración.
- **Familias**: Agrupación por Modelo+Regulación+Región con desglose de diferencias (Body Type, Environment Package, Engine Package). Badges de llantas y diff-only display.
- **Auto-feed desde Cascade**: Cada vehículo liberado se registra automáticamente como prueba completada y marca ítems pendientes en el plan semanal.

### 🧪 Results Analyzer — Análisis de Resultados VETS
Importación y análisis estadístico de resultados de pruebas de emisiones:

- **Importación batch**: Carpeta completa de resultados VETS (~600 pruebas). Lee CustomFields.csv, CycleResults.csv, SampleResults.csv y TestDetails.csv recursivamente. Detección de duplicados y manejo de localStorage lleno con compactación automática.
- **Importación individual**: 4 archivos CSV por prueba.
- **Dashboard**: Métricas generales, distribución por regulación, tendencias temporales.
- **Tendencias**: Gráficas por grupo (Regulación + TestType) con líneas de control UCL (3σ) y warning (2σ). Colores por severidad: verde=OK, naranja=>2σ, morado=>3σ, rojo=>límite.
- **Outliers**: Detección configurable (1.5σ a 3σ) por métrica seleccionable (FuelConsumption, BagCO, BagCO2, BagTHC, BagNOX, etc.). Tabla de detalle ordenada por distancia σ.
- **Búsqueda avanzada**: Filtros por VIN, operador, rango de fechas, regulación.
- **Perfiles**: Configuración de límites y preferencias por regulación.
- **Detalle por prueba**: Vista completa con todos los datos VETS importados.

### 📦 Lab Inventory — Inventario de Laboratorio
Control de gases de calibración, combustible de referencia y equipos:

- **Gases de Calibración** (28 cilindros precargados): Alta con formulario completo (No. Control auto-generado, No. Cilindro proveedor, tipo de gas, fórmula, concentración nominal/real, trazabilidad EPA/CENAM/NIST, vigencia, zona+posición, estatus Stock/In use/Empty/Spare). Código de barras imprimible. Timeline de historial de cambios. Zonas A-H configurables con mapa visual.
- **Combustible de Referencia** (3 tambos precargados: CARB LEV III, EURO VI): Tracking de nivel con lecturas periódicas, estatus Abierto/Cerrado, fecha de recepción, proveedor, regulación asociada.
- **Equipos y Calibraciones** (31 equipos precargados del plan COP15-F11): Semáforo automático de vigencia (verde/amarillo/rojo), campos completos (marca, modelo, serie, KMM ID, trazabilidad, laboratorio de calibración, magnitud, ubicación, criticidad NMX).
- **Lecturas Diarias**: Captura bulk de presión en psi para todos los cilindros en uso, con historial de últimas 5 lecturas inline.
- **Predicción**: Consumo diario/semanal por cilindro basado en lecturas históricas. PSI por prueba calculado desde log de Cascade. Fecha estimada de agotamiento. Estimación de suficiencia vs plan semanal. Predicción equivalente para combustible.
- **Reporte Semanal**: Formato idéntico al email de consumibles (tabla de gases con inventario/consumo/status + gráficas de combustible). Exportable como HTML para Outlook.
- **Configuración**: Editor de zonas (agregar, modificar, eliminar), editor de tipos de gas con concentraciones, gestión de datos.

---

## Arquitectura Técnica

| Aspecto | Detalle |
|---------|---------|
| **Stack** | HTML + CSS + Vanilla JavaScript (single-file, ~450 KB) |
| **Almacenamiento** | localStorage (keys: `kia_cop15_db`, `kia_testplan_v1`, `kia_results_v1`, `kia_lab_inventory`) |
| **Dependencias externas** | jsPDF (CDN) para generación de PDF |
| **Funciones** | 180 funciones: 67 COP15, 45 Test Plan, 24 Results, 44 Inventory |
| **Líneas** | ~7,400 líneas |
| **Offline** | 100% — no requiere servidor ni conexión |
| **Dispositivos** | Responsive: desktop, tablet, smartphone (optimizado para celulares de técnicos) |
| **Respaldo** | Export/Import JSON por módulo |

### Estructura de Datos

```
localStorage
├── kia_cop15_db         → {vehicles:[], configCSV, ...}
├── kia_testplan_v1      → {planData:[], testedList:[], weeklyPlans:[], planHistory:[], ...}
├── kia_results_v1       → {tests:[], profiles:[], activeTab, ...}
├── kia_lab_inventory    → {gases:[], equipment:[], fuelTanks:[], zones:[], gasTypes:[], usageLog:[], ...}
└── kia_config_csv_raw   → CSV personalizado de configuraciones (opcional)
```

### Integraciones Inter-módulo

- **Cascade → Test Plan**: `tpAutoFeedFromRelease()` registra cada vehículo liberado. `tpAutoMarkWeeklyCompletion()` marca ítems del plan semanal.
- **Cascade → Inventory**: `invLogTestUsage()` registra consumo de gas por prueba para alimentar predicción.
- **Test Plan → Inventory**: La predicción estima si hay suficiente gas/combustible para las pruebas pendientes del plan semanal.
- **Results → Test Plan**: `tpBuildFamilies()` cruza resultados importados con familias de configuración para cobertura por prueba.

---

## Instalación y Uso

1. Descargar `kia-emlab-unified-v23.html`
2. Abrir en cualquier navegador moderno (Chrome recomendado para cámara/OCR)
3. Los datos precargados (gases, equipos, combustible) se cargan automáticamente la primera vez
4. Para respaldo: usar Export JSON en cada módulo

### Datos Precargados

- 28 cilindros de gas de referencia y trabajo (CH4, C3H8, CO, NO, CO2, N2O, N2, Zero Air, O2, H2/He) con 5 lecturas históricas cada uno
- 3 tambos de combustible (CARB LEV III Regular, EURO VI Orden Anterior, EURO VI Orden Actual)
- 31 equipos de calibración (termohigrómetros, barómetros Vaisala, propane injection, gas divider, bubbler, dinamómetro completo con 10 masas, etc.)

---

## Historial de Versiones

| Versión | Funciones | Líneas | Cambios principales |
|---------|-----------|--------|---------------------|
| v1-v12 | ~80 | ~3,500 | COP15 Cascade base, PDF, OCR, firma digital |
| v13 | 92 | 4,200 | Unificación plataformas, Test Plan Manager |
| v14-v16 | 110 | 5,100 | Results Analyzer, familias, weekly plan |
| v17-v18 | 120 | 5,600 | Plan vs Actual, carry-over, config panel |
| v19 | 132 | 6,062 | Plan comparison, ND-Emisiones/OBD2, stalled alerts, purge |
| v20 | 136 | 6,225 | RA outliers, advanced search, 2σ trends |
| v21 | 173 | 7,098 | Lab Inventory module complete |
| v22 | 176 | 7,280 | Real data preload, weekly report, fuel prediction |
| v23 | 180 | 7,438 | Timeline history, auto-ID, modal forms, readings inline |

---

## Roadmap

### Corto plazo
- Overlay charts para comparación de familias en Results Analyzer
- PDF export de tendencias y flags desde Results Analyzer
- Scatter plots de correlación (temperatura vs emisiones)
- Timer de preacondicionamiento con cuenta regresiva y notificaciones
- QR code en PDF del COP15-F05 enlazando al registro digital

### Mediano plazo
- Captura de fotos con timestamp (odómetro/VIN via cámara del dispositivo)
- Dashboard de tiempos por fase (alta → prueba → liberación)
- Heatmap de cobertura del plan por región/regulación
- PDF de cobertura para auditorías
- Botón de duplicar vehículo para llegadas en lote

### Largo plazo
- Migración a Firebase/Supabase para multi-usuario y sincronización
- App PWA con push notifications
- Integración directa con sistema VETS para importación automática de resultados
- Dashboard ejecutivo para management (KPI, tendencias, productividad)

---

## Autor

**Jorge** — Laboratory Leader, Emissions Department, KIA México (KMX)

Desarrollado iterativamente desde operaciones reales del laboratorio, resolviendo problemas del día a día: inspecciones en papel con errores de transcripción, Excels VBA frágiles para control de gases, reportes manuales por email, planificación en hojas de cálculo desconectadas.

---

*Plataforma Integrada v14.0 — KIA Laboratorio de Emisiones*
