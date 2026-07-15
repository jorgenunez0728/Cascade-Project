# Changelog — KIA EmLab

All notable changes to this project, organized by development round.

## v16.2 — "Conteos correctos" (2026-07-15)

El usuario reportó que en Análisis de Gap el volumen de prueba requerido (REQ) no
correspondía entre configuraciones parecidas. La causa: `tpGetRule` comparaba región y
regulación con igualdad estricta (sin trim ni mayúsculas/minúsculas) — cualquier
inconsistencia de captura hacía que TODAS las reglas específicas fallaran en silencio y el
cálculo cayera a la regla comodín. Se aprovechó para una auditoría general de variables del
Plan de Pruebas y sus consumidores cross-módulo.

- **Fix del bug reportado**: `tpGetRule` normaliza región/regulación (trim + mayúsculas) al
  buscar coincidencia; ahora expone qué regla se usó y de qué tipo (exacta/región/comodín/
  default). La celda REQ del Análisis de Gap muestra la fórmula completa al pasar el mouse
  y un punto ámbar ● cuando no hay regla específica para esa región/regulación. La pestaña
  Reglas muestra "aplica a N configs" por regla y una lista de configs sin regla específica.
- **Bug crítico corregido — HOY mostraba "0% cobertura" y "Deficit: NaN tests" siempre**:
  `renderLabDashboard` (tarjeta de riesgo de HOY/Panel) leía `tpGetAnalysis()` como si fuera
  un objeto agregado (`.totalReq`, `.totalDone`, `.coveragePct`) cuando en realidad es un
  arreglo por configuración — esos campos nunca existieron. La alerta de cobertura del plan
  nunca se disparaba.
- **Una sola definición de cobertura en toda la plataforma** (`tpCoverageSummary()`: %
  de configuraciones vigentes con su REQ cumplido): antes el badge del Plan, Datos →
  Ejecutivo y HOY calculaban 3 números distintos que nunca coincidían entre sí. El
  % por volumen de pruebas se conserva como métrica secundaria, etiquetado "pruebas
  cumplidas" para no confundirlo con la cobertura de configuraciones.
- **Configuraciones sin volumen ya no exigen una prueba mínima** ni cuentan en la
  cobertura (antes `max(1, …)` forzaba 1 prueba incluso con volumen 0, arrastrando el %
  con configuraciones retiradas).
- **Configuraciones "dormidas"** (3+ meses seguidos sin volumen planeado): aparecen en el
  Análisis de Gap con un chip "¿seguir contabilizando?" — Pausar (deja de exigir pruebas)
  o Confirmar activa. Familias muestra cuántas configs pausadas/dormidas tiene cada una.
  Los flags se preservan al re-importar el CSV.
- **Producción**: la tabla de Detalle ahora tiene scroll horizontal (antes los meses después
  de julio quedaban recortados sin aviso) y muestra cuántos meses hay cargados; la celda
  TOTAL marca con ⚠ cuando el Total_Calc del CSV no coincide con la suma de los meses
  visibles (sin perder el dato — solo avisando). El parser de encabezados de mes ahora
  acepta más formatos (espacio en vez de guión, nombre completo, año de 4 dígitos, ISO
  "2026-08") y el diff de importación lista qué meses se detectaron y qué columnas no se
  reconocieron.
- **panel.js leía campos muertos** (`tpState.plans`/`.records`, que nunca existieron en
  testplan.js): la correlación "Consumo de Gas vs Volumen de Pruebas", "Velocidad del Plan"
  y los reportes de antigüedad de datos del Plan siempre estuvieron vacíos — ahora leen
  `testedList`/`weeklyPlans`, las fuentes vivas.
- **Cache de análisis**: `tpSave()` ahora invalida también el cache de `tpGetAnalysis()`
  (antes solo el de familias) — editar una regla o pausar una configuración sin cambiar el
  conteo de configs/probadas dejaba el análisis obsoleto. Los merges/seeds de sincronización
  también invalidan correctamente.

## v16.1 — "Fix cascada EV" (2026-07-15)

El SV1m (eléctrico) no se podía dar de alta: su "regulación" es el voltaje de carga
(220V/120V), sin perfil de límites, y la cascada **ocultaba** los chips de regulaciones sin
perfil — imposible completar la configuración (mismo problema latente: BRAZIL L8 del CL4).

- **Regulaciones sin perfil ahora seleccionables** en la cascada de Alta: los EVs
  (220V/120V/EV, detectados por `_isEVRegulation`) aparecen con ⚡ y sin tono de advertencia;
  el resto con ⚠ y aviso de configurar el perfil antes de liberar emisiones (link directo a
  Datos → Regulaciones).
- **Resultado EV-consciente**: al completar una configuración eléctrica, el mensaje dice
  "⚡ Vehículo eléctrico — sin emisiones de escape" en vez del warning de perfil faltante.
- **Autorelleno de regulación vacía** (`_normalizeRegulation`): si en el catálogo (embebido o
  importado) o en el CSV del plan de producción la celda viene vacía, se rellena `EV` cuando
  el motor es eléctrico (capacidad en KW) o `N/A` visible si no — la cascada ya no se atora
  con datos incompletos y las claves de familia no divergen entre catálogo y plan.
- Los valores `220V`/`120V` existentes NO se renombran (los usan las reglas P5 EV del plan y
  el agrupamiento por familias).

## v16.0 — "Plataforma autoguiada" (2026-07-10)

Inflexión total de accesibilidad: cualquier persona nueva debe llegar a cualquier pantalla y
saber qué es, qué hacer y qué capturar, sin depender de que alguien le explique.

- **Tooltips de campo completos**: `CASCADE_TOOLTIPS` (antes solo COP15, 36 campos) ahora cubre
  los 7 módulos — decenas de campos nuevos en Alta/Operación/Liberación/Historial (COP15), plan
  semanal/recuperación/reglas/producción (Test Plan), cilindros/equipos/predicción/combustible
  (Inventario), reportes/operadores/bitácora/alertas/auditoría (Panel), validador/Control SPC
  (CoP) y el tablero de actividades (HOY). Nuevo modo de inyección vía `[data-help="clave"]`
  para títulos y encabezados sin campo de formulario asociado.
- **Banners por pestaña**: cada pestaña de cada módulo (~40 en total) explica en 1-2 líneas qué
  se hace ahí y el primer paso, con "Ver más" (tips accionables) y "Entendido ✓" (descartable
  por dispositivo, releíble desde el botón ℹ️/menú de ayuda).
- **Recorridos guiados por módulo**: el tour único de 5 pasos se volvió `TOURS` — un recorrido
  corto y específico por módulo (Hoy, Plan, Inventario, Datos, CoP, Pruebas) que se lanza solo
  la primera vez que visitas cada uno (solo escritorio) y se puede relanzar desde el botón ?.
- **Glosario del laboratorio**: ~22 términos (Soak, CoP, ETW, I-MR, Reglas de Nelson, Cpk, PSI,
  DTC, etc.) con buscador, accesible desde el menú de ayuda y desde cualquier banner.
- **Estados vacíos guiados**: predicción de inventario sin lecturas, CoP sin plan de producción
  o sin liberaciones, ahora explican por qué están vacíos y ofrecen un botón directo a la
  sección que los llena.
- **Accesibilidad ligera**: `aria-label` en los botones de icono principales (editar/eliminar de
  cilindros, equipos, tanques, zonas; acciones del tablero de HOY; chip de ETA; alarmas SPC;
  firma digital) y checkboxes del tablero.

## v15.9 — "HOY como tablero de actividades + consumo inteligente" (2026-07-09)

### 📌 HOY = tracker de actividades (estilo Monday/Asana)
La pestaña HOY dejó de ser 9 secciones con formatos distintos: ahora es UN tablero de filas
homogéneas agrupadas por categoría (Vehículos / Plan de hoy / Inventario / Calidad / Manuales),
cada fila con icono, título, chip de estado (Pendiente/En curso/Hecho/Atrasado), progreso,
responsable y botón de acción con deep-link (`dashCollectActivities`/`dashRenderBoard`, app.js):

- **Vehículos con etapa "N de 8"**: stepper visual (Alta → Recepción → Preacond → Soak → Prueba
  → Verificación → Liberación → Aprobación, `cascadeVehicleStage` en cop15.js), soak restante
  en la fila y **fecha esperada de liberación** (chip 📅 verde/ámbar/rojo): auto-estimada
  (`cascadeVehicleETA`: fin de soak, día de prueba del plan) con **override manual auditado**
  (`expected_release_set`) tocando el chip
- **Plan de hoy**: las pruebas/preacondicionamientos cuyo `testDay`/`preconDay` es HOY, con
  checkbox que marca el item del plan semanal
- **Inventario**: toma de gases del día (X/Y con progreso), captura de producción atrasada,
  gases vencidos/bajos y calibraciones con deep-link por ítem, y las alertas de consumo (abajo)
- **Calidad**: aprobaciones doble-ciego pendientes, alarmas SPC, desacuerdos críticos
- **➕ Actividad**: tareas manuales con título/categoría/responsable/fecha (`pnState.tasks`,
  sincronizadas entre dispositivos con merge por id y tombstones — `_fbMergeTasks`);
  checkbox para completar, auditadas (task_add/task_done/task_delete)
- Toggle **"Solo míos"**, contadores de pendientes por grupo, refresco vivo (data:saved con
  debounce + tick 60 s), Mi Turno compacto y Acceso Rápido se conservan
- **Soak ligado a su vehículo**: `kia_soak_timer` ahora persiste vehicleId/vin — se corrigió el
  bug latente donde un soak ajeno marcaba "soak listo" a TODOS los vehículos (getNextStep), y
  la tarjeta de soak del Panel leía un esquema que nunca se escribía (jamás aparecía)

### ⛽ Consumo inteligente: aprendizaje real + predicción viva
Antes: descuento FIJO de 50 PSI/prueba a todos los cilindros y la gasolina solo se
"fotografiaba" (nunca se descontaba). Ahora el consumo se APRENDE de la operación:

- **Aprendizaje corregido** (`invCalcConsumptionRates`): solo lecturas manuales (las lecturas
  auto del descuento envenenaban el modelo con drops sintéticos de 50); días con tipos de
  prueba mezclados se reparten proporcional a los estimados vigentes; **drop de 0 con pruebas
  = consumo cero legítimo** (antes se descartaba y el gas sin uso seguía descontando 50)
- **Modelo persistido** `invState.consumption.perType[regulación] = {gases:{fórmula:{est,n}},
  fuelL:{est,n}}` — cache determinista de usageLog+readings: cada dispositivo lo recomputa
  (al capturar lecturas, al cerrar prueba, tras pull de sync); nunca se mergea
- **Descuento por prueba APRENDIDO**: cada gas descuenta su estimado por tipo de prueba
  (fallback 50 solo sin datos); estimado 0 = no descuenta. **La gasolina ahora SÍ se descuenta
  por prueba** al tanque de la regulación (el más reciente con nivel), con lectura auto,
  registro en usageLog (`gasDeducted`/`fuelDeducted` + `cycle`) y auditoría `fuel_auto_deduct`
- **Predicción viva** (`invForecastGasNeeds`): "faltarán ~N psi de X para las M pruebas
  pendientes" en dos alcances (semana del plan / plan completo, disponible = In use + Full);
  visible como filas de alerta en HOY, tarjeta "⛽ Consumo proyectado" en Inventario y fuente
  'Consumo' en Datos → Alertas

## v15.8 — "Edición retroactiva + visión anual del plan" (2026-07-05)

### 📝 Completar datos retroactivos (Historial)
El endurecimiento del PDF (v15.7 y anteriores) dejó a los vehículos archivados ANTES del cambio
sin campos obligatorios, sin PDF y sin ninguna ruta de edición. Ahora, en Cascade → Historial:

- Botón **"📝 Completar (N)"** en cada archivado incompleto (emisiones) → modal de edición
  retroactiva agrupado por sección: **faltantes editables** (ámbar), **existentes bloqueados 🔒**
- Modificar un valor ya guardado exige **razón escrita** (botón ✏️, mín. 5 caracteres) y
  **firma digital** al guardar (`sigCaptureOpen`); solo llenar faltantes no pide firma
  (se atribuye al operador actual)
- Gases faltantes con validación en vivo (✓/✗ vs límite, % del límite, rangos plausibles);
  firmas de Liberador/Aprobador capturables retroactivamente (quedan marcadas `retro:true`)
- Todo queda asentado: `vehicle.timeline` ("Datos completados retroactivamente" con
  añadidos/modificados/razones), `testData.retroSignatures[]`, y auditoría `retro_edit`
- Botón **🕘** por vehículo: historial + control de cambios (tabla campo/antes/después/razón)
  — primera vista de timeline disponible para archivados
- Refactor interno: descriptor único `PDF_REQUIRED_FIELDS` alimenta `validatePdfCompleteness`
  y el modal (salida verificada idéntica en 6 fixtures antes/después)
- El vehículo **nunca sale de archivado** (no se re-dispara la cascada de aprobación)

### 📅 Plan de pruebas — visión anual y política por región (de la comparativa con el lab hermano)
- **Presupuesto Anual** en Plan → Dashboard: requeridas/probadas/pendiente del año vs capacidad
  restante (semanas restantes × capacidad, respeta `weekAvailability`), barra apilada del
  pendiente por prioridad P1..Pn y veredicto verde/ámbar/rojo ("¿alcanza el año?")
- **Propósito por región** al iniciar prueba desde el plan: EUROPE → COP-Emisiones, resto →
  EO-Emisiones por default (regla corporativa "COP solo Europa"); configurable en Plan → Reglas
  ("Propósito al iniciar prueba desde el plan"); el técnico siempre puede cambiarlo en Alta
- **P4 Legacy (Euro 2/3/4) y P5 EV (120V/220V)** como reglas default del Recovery (antes solo
  P1–P3); `maxTiers` default 5; migración suave que respeta reglas personalizadas
- **⏱ Última prueba por familia**: badge en Familias (verde <30d, ámbar 30–90d, rojo >90d,
  "Nunca"); evidencia de familia ordenada **más reciente primero** con fecha destacada
  ("ÚLTIMA", hace Nd) y CSV con el mismo orden

## v15.7 — "Control SPC + calidad de captura" (2026-07-03)

Mejoras adaptadas del tablero de emisiones VETS de un laboratorio hermano (Kia/Hyundai),
tras comparar ambos proyectos: se adoptó lo que no teníamos y aplicaba a nuestro flujo.

### Control SPC (nueva sub-pestaña en CoP)
- La plataforma **CoP** ahora tiene 2 sub-pestañas: **📋 Validador CoP** (igual que antes) y
  **📈 Control SPC** (`copBuildSpcHTML`, `copSpcRenderCharts` en `cop_validator.js`)
- **Carta I-MR por familia × gas** sobre los valores finales verificados de cada liberación
  (`gasResults.aprobador`, fallback `liberador`), ordenados por fecha de captura y agrupados
  con la misma llave de familia del Plan (`copVehicleFamilyKey`)
- Estadística: media; σ = MR̄/1.128; UCL/LCL = media ± 3σ; MR-UCL = 3.267·MR̄;
  **Cpk = (Límite − media)/(3σ)** con n≥8 (semáforo: ≥1.33 verde, ≥1.0 ámbar, <1.0 rojo)
- **Reglas de alarma (Nelson)**: R1 punto fuera de ±3σ · R2 corrimiento (8 seguidos del mismo
  lado) · R3 tendencia (6 en fila monótonos). Umbrales: n<4 sin límites de control;
  4–7 preliminares; ≥8 confiables
- **Panel de alarmas retráctil** (familias con n≥4, gases con límite; CO2 se grafica para
  vigilancia pero no alarma); cada alarma navega a su carta. Las alarmas también aparecen en
  **Datos → Alertas** (`pnGetActiveAlerts`, fuente "CoP SPC")
- Toggles: Zonas σ, Límite regulatorio (línea ámbar) y **% del límite** (re-escala la carta a
  porcentaje — la tendencia gas-vs-límite del proyecto hermano)
- Charts con Chart.js (`window._copSpcIChart` / `_copSpcMrChart`), puntos verde/ámbar/rojo
  según reglas disparadas; ayuda en `<details>` explicando I-MR/Nelson/Cpk

### Calidad de captura en Liberación (cop15.js)
- **% del límite** junto al veredicto: "✓ PASA · 43% del lím." / "✗ FALLA · 112% del lím."
  (antes solo booleano). También en el PDF de liberación
- **Rangos plausibles por gas** (`GAS_PLAUSIBLE_BOUNDS`): un valor fuera de rango (error de
  dedo / dato basura del analizador) marca la fila en ámbar "⚠ Valor improbable" — **avisa sin
  bloquear** (el técnico decide) y deja rastro en auditoría al guardar (`gas_fuera_de_rango`)
- **FE informativa por balance de carbono** bajo el CO2 registrado: ≈ L/100 km y mpg
  (`mpg = 8887/(CO2_g/km × 1.609344)`; no es la FE certificada). También en el PDF

### Qué NO se adoptó del proyecto hermano (y por qué)
- Desglose por fase/bolsa del ciclo: nuestro flujo captura solo valores FINALES verificados
  (decisión de diseño, ver comentario en cop15.js) — el juicio regulatorio no usa bolsas crudas
- Tema oscuro: eliminado aquí en v15.5 (tema claro único)
- Su conteo fijo de pruebas CoP (3/familia): nuestro validador secuencial R83/R154 es superior

## v15.6 — "Sync confiable + Seguridad real + Limpieza final" (2026-07-02)

Tres frentes pedidos por el usuario: que **todo dispositivo vea siempre lo último**,
**volver a tener seguridad**, y **borrar definitivamente** los módulos muertos.

### Sync siempre actualizado (causa raíz del celular vacío + versión vieja)
- **Service worker descongelado**: `sw.js` tenía `CACHE_VERSION` pegado desde el 28/abr (un build
  interrumpido dejó el literal; `build.sh` buscaba un placeholder inexistente). El SW salía
  byte-idéntico en cada deploy → los dispositivos nunca recibían actualizaciones. Ahora `build.sh`
  genera el artefacto `sw.build.js` (guard que aborta si el placeholder se pierde) y `deploy.sh`
  despliega ese artefacto versionado. **Este es el fix que recupera el celular.**
- **Auto-actualización de la PWA**: `reg.update()` al arrancar y al volver a la app; al llegar el SW
  nuevo, recarga en la ventana segura (<15 s, sin modal) o banner "Actualizar ahora"
- **Pull inicial robusto**: un dispositivo vacío siempre puede descargar (excepción de quota),
  con reintentos y feedback visible; el indicador ya no dice "conectado" con 0 datos
- **Guard anti-vaciado**: un dispositivo vacío nunca sube `{vehicles:[]}` y pisa la nube (había un
  push de semilla a los 6 s sin protección)
- **CSV de producción en vivo a todas las estaciones** (pedido explícito): el live-sync ya no
  descarta los cambios de plan; adopta `planData` + `months` del import más nuevo
- Indicador honesto ("⚠ sin datos — toca para descargar") + botón "🔄 Actualizar datos" en el menú ⋯

### Seguridad real (nube + PIN)
- **Firebase Auth + Security Rules**: `firestore.rules` versionadas — `stations/**` solo para
  sesiones Email/Password (antes: sign-in anónimo + sin reglas = workspace abierto a cualquiera con
  la URL). Login de dispositivo con contraseña del laboratorio (una vez por dispositivo)
- **Muro de PIN por operador**: SHA-256 con sal (`pinHash2`, migra los hashes de 32 bits viejos);
  lockout de 60 s tras 5 fallos; auditoría de accesos (login/login_failed/logout)
- Ver README → "Seguridad — setup una sola vez" para los pasos de consola y el orden de rollout

### Limpieza final
- **Eliminados definitivamente** `js/results.js` (Results Analyzer) y `js/approvals.js` (Power
  Automate) — fuera del build desde mayo 2026. De paso se arreglaron **2 crashes latentes**
  (`fbMergeExecute` y `fbBackupNow` usaban `raState` inexistente → el merge manual y el backup a la
  nube crasheaban). ~3,800 líneas menos + docs actualizados.


## v15.5 — "Pulir y Endurecer" (2026-07-02)

**16 commits: corrección de bugs de fondo, performance medible y UX móvil — sin módulos nuevos.**
Verificado end-to-end con 31 checks de Playwright/Chromium (arranque, XSS, timezone, CoP, audit, charts, modales, filtros, móvil 390×844).

### Seguridad y datos
- **XSS almacenado corregido**: nombres de operador, VIN y descripciones se escapan en todos los
  renders (login, picker 👤, Panel→Usuarios, Lab Overview, modal de sustitución); `authBypassForOperator`
  resuelve por índice (ya no interpola el nombre en `onclick`)
- **Fechas en hora local** (`localToday`/`localDateStr`/`parseLocalDate`): "Liberados Hoy", bitácora,
  KPI ejecutivo, buckets semanales y defaults de fecha ya no ruedan al día siguiente después de las
  ~18:00 (el lab opera en UTC−6); `tpISOWeekKey` sin corrimiento UTC
- **QuotaExceededError manejado** en `saveDB`/`tpSave`/`copPersist`: error visible en vez de fallo
  silencioso; `copSaveJudgment` ya no reporta "guardado" cuando no persistió
- **CoP: auto-llenado real** (`copResultValue`): gases por VIN desde los valores finales verificados
  de liberación/aprobación (nunca bolsas crudas); `HCNOx` = THC+NOx o el combinado EURO-2; los juicios
  se suben a la nube al guardarse (antes esperaban el ciclo completo)
- **Sync sin pérdida de datos**: `fbPullApply` mergea por elemento (reutiliza `fbMergeAnalyze/Execute`)
  en vez de reemplazar por conteo — dos altas concurrentes ya no se pierden; subcampos v15 de `tpState`
  preservados; operadores con merge por id + tombstones (los borrados no resucitan); cap del audit
  unificado (el pull ya no encoge la historia a 1000)

### Performance
- **`auditLog` en memoria** con persist/push debounced: antes cada evento re-serializaba hasta 5000
  entradas y subía el arreglo completo a Firestore; ahora ráfagas = 1 escritura + 1 subida; flush en
  `pagehide`; cap 2000 (lejos del límite de 1MB/documento)
- **Cascada de liberación coalescida**: un `tpSave` + un `invSave` por liberación (antes 2×tp + 1×inv
  por vehículo, también en batch)
- Sliders sin serialización por tick (guardan en `change`); `tpBuildFamilies` sin O(familias²);
  fuga del chart de pronóstico de gas corregida ("canvas already in use"); `renderLabOverview`
  memoizado (HOY/Panel ya no re-escanean todos los módulos por visita); timeline compactado al archivar

### UX / Estética
- **Solo tema claro**: eliminadas 242 reglas de dark mode, el auto-cambio por preferencia del sistema
  y sus parches frágiles (−44KB de CSS); font stack de sistema; tipografía mínima 11px en móvil
- **Topbar móvil de una fila**: las 5 tabs se ocultan en <768px (la bottom-nav ya navega); controles
  secundarios en menú ⋯; touch targets ≥44px; `:focus-visible` global de marca
- **Modales legacy unificados**: ESC, click-fuera, animación de entrada y retorno de foco en
  substitution/config/inv/fb (cerrar el escáner con ESC también apaga la cámara)
- Transición corta por defecto entre plataformas (sin corte seco) + scroll instantáneo;
  el filtro VIN del Historial ya no pierde el foco al teclear (`preserveFocus`);
  ripple en botones TP y shake en validaciones fallidas
- CSS deduplicado: 3 definiciones de `.skeleton` → 1, `[x-cloak]` ×2 → 1, dos `@media 1024px`
  fusionados, view-transitions muertas eliminadas

### Notas
- `results.js` y `approvals.js` son **módulos latentes**: siguen en `js/` pero están fuera de
  `index.html` y `build.sh` desde mayo 2026 (reemplazo del flujo PA/VETS por doble ciego). Esta
  versión solo silencia sus efectos colaterales (error de `raInit` en consola, push de estado
  indefinido al sync). Revivirlos o eliminarlos es una decisión de producto pendiente.

## Round 5 — (2026-03-11)

**8 improvements focused on native app experience, smart UX, and operational efficiency.**

### M1: Immersive Mode (App Nativa)
- Fullscreen toggle button (`⛶`) in header — enters Fullscreen API
- Auto-collapsing header on scroll down in immersive mode (scroll up reveals)
- Splash screen with animated progress bar during `initializeSystem()`
- Remembers immersive preference across sessions (`kia_immersive_prefs`)
- Enhanced `manifest.json` with app shortcuts (Nuevo Vehículo, Plan Semanal, Lectura Rápida)
- Syncs with ESC key / browser fullscreen exit

### M2: Smart Auto-Save (On Blur)
- Auto-saves COP15 operation form on field blur, tab switch, visibility change, and window blur
- Replaces blocking "unsaved changes" confirmation modal with silent auto-save
- Visual indicator: green "✓ Guardado HH:MM" badge with fade animation
- `saveProgress({silent:true})` mode skips button animation and toast
- Extensible engine: `autoSaveInit(module, saveFn, dirtyFn)` for any module
- `beforeunload` flushes pending changes

### M3: Contextual Smart Forms
- Progressive disclosure: accordion sections lock/unlock based on vehicle status
- Lock overlay shows "🔒 Se desbloquea en: [status]" for future sections
- Completion badges on accordion headers: "3/6 ✓" with color coding (green/yellow/gray)
- Smart defaults: "Ayer 6AM" and "Ahora" quick buttons for precond datetime
- Auto-fill from CSV_CONFIGURATIONS (ETW, target coefficients)
- Silent copy of safe fields from last same-config vehicle with inline banner notification
- Badges update in real-time via debounced input/change listeners

### M4: Micro-Animations & Visual Polish
- Animated counters on Dashboard KPIs (count-up with easeOutCubic, bounce on change)
- Staggered fade-in+slide-up for list items (kanban cards, KPI grid)
- Card hover elevation (translateY + shadow) on kanban and dashboard cards
- Confetti burst (6 CSS particles) on vehicle release
- Skeleton loading CSS (shimmer animation for placeholder content)
- Glassmorphism panel class (backdrop-filter blur)
- Status badge enter animation (scale+fade)
- Progress ring SVG builder (`buildProgressRing()`)
- All animations respect `prefers-reduced-motion`

### M5: Batch Reading Rounds (Inventory)
- "🔄 Ronda" button in readings tab launches guided one-at-a-time experience
- Fullscreen overlay: one cylinder visible with gas info, zone, concentration
- SVG sparkline of last 5 readings for instant trend visibility
- Pre-fills with last reading value; "= Igual" button for 1-tap confirmation
- Warning detection: flags >15% pressure drop from last reading
- Summary screen on completion: count, alerts, elapsed time
- Clipboard copy of round summary report

### M6: Structured Shift Report
- "🔄 Cerrar Turno" button in Panel → Bitácora generates automatic report
- Collects: vehicles in progress, pending tests, low gases, daily releases
- Visual report card with color-coded KPIs and detailed vehicle list
- Operator notes field for free-text observations
- "📋 Copiar" exports as formatted plaintext to clipboard
- `pnShowTurnoverOnLogin()` shows last report on next session (if <24h old)
- Stored in `pnState.shiftReports[]` (last 30 reports)

### M7: Unified Calendar
- New "📅 Calendario" tab in Panel module
- Monthly CSS Grid view with day cells and colored event dots
- Aggregates from 4 sources: equipment calibrations, gas depletion predictions, test plan items, vehicle releases
- Color legend: red (expired/depleted), orange (upcoming), blue (planned), green (release)
- Click any day → modal with detailed event list
- Week summary below calendar: "Esta semana: 3 calibraciones, 5 pruebas"
- Month navigation (← → Hoy)

### M8: Templates & Quick Presets
- Unified template engine in app.js: `templateSave/Apply/Delete/GetAll(module, ...)`
- COP15: "📌 Plantilla" button saves operation form as reusable template
- COP15: "📂 Mis Plantillas" opens template manager with apply/delete
- Results Analyzer: `raPresetSave/Apply()` for filter presets (groupBy, metric, dates)
- Inventory: `invDuplicateGas(id)` clones cylinder with auto-incremented control number
- Inventory: `invBatchAddGas(type, conc, real, count, zone)` creates multiple cylinders
- Auto-assigns to least-full zone when zone not specified
- Templates persisted in `kia_templates` localStorage (max 20 per module)
- Quick-access buttons via `templateRenderQuickButtons()`

---

## Round 4 — `adf638a` (2026-03-11)

**8 improvements focused on native chart tooling, cross-module intelligence, and system observability.**

### M1: Chart Config Engine (Centerpiece)
- Centralized `chartConfigGet/Set/Apply/Reset()` registry persisted to `kia_chart_configs` localStorage
- Reusable `chartConfigBuildPanel(chartId, instanceVar, opts)` generates `<details>` accordion UI with sliders/selects
- Controls: height, Y-axis min/max, point radius, border width, line tension, legend position/size, grid color/toggle, tick size/color, animation duration
- 4 color palettes: default, vivid, pastel, monochrome — applied via `chartConfigApplyColors()`
- Auto-fit button analyzes dataset to set optimal Y-axis range
- PNG export (`chartExportPNG`) and PDF export (`chartExportPDF`) per chart
- Applied to all chart instances: `ra_trend`, `ra_compliance`, `ra_spc_i`, `ra_spc_mr`, `tp_burndown`, `tp_dashboard`, `inv_*`
- Old `raChartSetHeight/SetYRange/AutoFit` functions redirected to unified system

### M2: Snapshot Undo Engine
- In-memory circular buffer (`_undoStack`, max 10 entries)
- `undoPush(module, actionLabel)` snapshots full module state as JSON
- `undoPop()` restores most recent snapshot + calls module's render function
- `showToast()` extended with optional 4th parameter (undo callback) — shows "Deshacer" button
- `Ctrl+Z` keyboard shortcut + "Deshacer Ultima Accion" in command palette
- Hooked into destructive actions: "Borrar TODAS las pruebas" (RA), "Borrar todos los registros" (TP), "Resetear inventario" (INV)

### M3: PDF Reports with Embedded Charts
- Extended `generateWeeklyStatusPDF()` to embed chart images
- Uses `chart.toBase64Image()` → `doc.addImage()` for jsPDF
- Embeds up to 4 charts: Burndown, Compliance Rate, Trend Analysis, Inventory Consumption
- Graceful fallback if charts aren't rendered

### M4: Cross-Module Global Search
- Extended `globalVinSearch()` to search across all 4 modules
- Inventory: searches gas names, equipment names, gas types
- COP15: searches configCode, model, operator
- Results: searches operator, testDescription, regulation
- Power search prefix `>` in command palette triggers `_globalCrossSearchForPalette(q)`
- Results shown as command palette entries with module badges

### M5: Cross-Module Intelligence Panel
- New "Inteligencia" tab in Panel module
- **Correlation 1**: Gas Consumption vs Test Volume — weekly bar+line chart (dual Y-axis)
- **Correlation 2**: Fail Rate vs Gas Age — grouped bar chart by age bucket (<30d, 30-90d, >90d)
- **Correlation 3**: Plan Velocity vs Pipeline Load — bar chart per plan
- Summary stats grid: total tests, vehicles, gas cylinders, fail rate
- File: `js/panel.js` — functions: `pnRenderIntelligence()`, `_pnIntelRenderCharts()`

### M6: Results Comparison Side-by-Side
- Compare any two tests from RA detail view
- Two-column layout with color-coded differences (green = better, red = worse)
- Radar chart overlay when >= 3 comparable numeric fields
- Reference line at 100% (regulatory limit) on radar chart
- Uses `raRenderCompare()` function

### M7: Entity Notes System
- `noteAdd/Get/Delete/Count()` functions with `kia_entity_notes` localStorage key
- `noteBuildButton(entityType, entityId)` returns HTML button with badge count
- `noteShowModal()` opens modal with notes list + text input
- Added to COP15 vehicle timeline and RA test detail view
- Notes stored as `{id, text, ts}` arrays keyed by `entityType:entityId`

### M8: System Health Monitor
- New "Sistema" tab in Panel module
- **Storage breakdown**: per-module byte count with progress bar (vs 5MB limit)
- **Data aging table**: counts per module by age bucket (30-60d, 60-90d, >90d)
- **Purge tools**: delete old data by module with confirmation dialog
- **Performance metrics**: localStorage key count, DOM nodes, JS heap memory, active Chart.js instances
- File: `js/panel.js` — functions: `pnRenderSystemHealth()`, `_pnFormatBytes()`, `_pnMeasurePerformance()`, `pnPurgeOldData()`

---

## Round 3 — `5335591`

**9 cross-discipline improvements: PWA, accessibility, security, performance, data integrity, motion, print, onboarding.**

- Progressive Web App (service worker + manifest)
- ARIA labels and keyboard navigation
- Content Security Policy headers
- Lazy rendering and virtual scrolling for large lists
- Data integrity validation on load
- `prefers-reduced-motion` support
- Print stylesheet optimization
- Interactive onboarding tour
- Safe parse wrappers for JSON

---

## Round 2 — `59427cc`

**10 heavyweight functional improvements.**

- SPC I-charts and mR-charts for statistical process control
- Cpk/Ppk process capability indices with regulatory limits
- Burndown chart for test plan progress
- Weekly prediction engine with inventory sufficiency checks
- Visual cascade tree for COP15 vehicle flow
- Enhanced timeline with filtering
- Gas consumption trend analysis
- Equipment barcode/QR code generation and scanning
- Shift log and operator management panel
- Automated alert system with configurable thresholds

---

## Round 1 — `383d1c3`

**10 UX improvements.**

- Clipboard copy for VIN and test data
- Kanban-style board for test plan status
- Soak timer with browser notifications
- Toast notification system
- Command palette (Ctrl+K)
- Chart.js integration with zoom plugin
- Outlier detection in results
- Operation transparency log
- Lab zone map
- Compact/detailed view toggle

---

## Pre-Round (Foundation)

- Core COP15 vehicle registration workflow
- Basic test plan manager
- Results entry and storage
- Lab inventory tracking (gas, fuel, equipment)
- CSV configuration import
- Firebase sync layer (optional)
- PDF report generation with jsPDF
- Digital signatures with signature_pad
