# KIA EmLab — Claude Code Project Guide

## What is this project?

Single-page web application for KIA Mexico's Emissions Laboratory. 7 functional modules + panel +
daily dashboard, ~30,000 lines of JS across `js/*.js`. Offline-first (localStorage) with an **optional
shared Firebase cloud sync** so every device sees the same lab dataset. Used daily on
smartphones/tablets by lab technicians. History: 6 improvement rounds + UI/UX v6 overhaul
(Glass+Neumorphism) + **v15 "Simplify & Sync"** (dead-code cleanup, single Lab Overview, Reports
Center, Test Recovery Plan, family-linked CoP validator, dynamic production months, shared sync,
no-login operator picker, synced change history).

### Navigation: 5 Root Tabs + topbar controls

```
┌─────────┬──────────┬──────────┬──────────┬──────────┐
│   HOY   │   PLAN   │ PRUEBAS  │  DATOS   │   CoP    │
└─────────┴──────────┴──────────┴──────────┴──────────┘
```

| Root Tab | Contains | Internal Section IDs |
|----------|----------|---------------------|
| **Hoy** | Daily dashboard (incl. shared Lab Overview strip), quick actions | `platform-today` |
| **Plan** | **v20**: abre en **📅 Mi semana** (tablero por día) + **🎛️ Armar semana** (perillas + propuesta en vivo), **🚑 Recuperación**, familias, calendario, simulador, producción | `platform-testplan` |
| **Pruebas** | COP15 (Alta, Operacion, Liberacion, Cola, Historial) + Consumibles (Inventory) | `platform-cop15`, `platform-inventory` |
| **Datos** | Panel (dashboard, **📤 Reportes**, alerts, 🔍 Auditoría, system, **☁️ Archivos**, **🗂️ Proyectos**) | `platform-panel` |
| **CoP** | **v19.0**: 4 vistas — **📊 Panorama** (todas las familias del alcance de un vistazo), 📋 Validador (+ gauge de la banda A(n)–B(n)), **📈 Control SPC** (I-MR, Nelson, Cpk, alarmas), **🗂️ Expediente** (cronología + PDF de auditoría) | `platform-cop` |

Legacy platform names (`cop15`, `testplan`, `inventory`, `panel`) are aliased in
`switchPlatform()`. Topbar (`index.html`) also has: **👤 operator picker** (`#op-picker`, no password),
**🕘 change history** (deep-links to Panel → Auditoría), Firebase sync indicator, notificaciones y un
menú **⋯** que colapsa los controles secundarios (**v17.9**: ≤1600px, no ≤768px — la barra
expandida mide ~1900px reales; ≤1024px las 5 tabs se ocultan y navega la bottom-nav). Todo el estilo
de la franja derecha vive en `styles.css` (`.topbar-sync`, `.topbar-op`, `.topbar-icon-btn`,
`.tbm-*`), **no en atributos `style`** — el `margin-left:auto` en línea del indicador de sync era
inanulable desde las media queries y hacía que el header envolviera a una segunda fila vacía. En la
barra solo `.topbar-sync` puede encogerse (`.platform-bar > * { flex-shrink: 0 }`).
**v15.5**: tema claro único (el dark mode se eliminó por completo).
**v15.6**: `results.js` (Results Analyzer) y `approvals.js` (Power Automate) se **eliminaron
definitivamente** (estaban fuera del build desde mayo 2026; el flujo PA/VETS fue reemplazado por la
aprobación doble-ciego interna de la pestaña Liberación). **v15.6 también reactivó la seguridad**:
Firebase Auth (contraseña de laboratorio por dispositivo) + Security Rules (`firestore.rules`) +
**muro de PIN por operador** (SHA-256 `pinHash2`, lockout 60 s tras 5 fallos, auditoría de accesos).
El `#op-picker` sin contraseña se reemplazó por un chip 👤 con "Cambiar usuario". Ver README →
"Seguridad — setup una sola vez" para los pasos de consola. El service worker (`sw.js` →
`sw.build.js` vía `build.sh`) se versiona por build para que la PWA se auto-actualice
(nunca dejar un timestamp pegado en `sw.js`).

## Project Structure

```
index.html              ← Development entry point (modular, uses <script src>)
styles.css              ← All CSS — Glass + Neumorphism design system
js/
  app.js                ← Config, utils, chart engine, undo, notes, PDF, audit, gridDragInit, bootstrap (~5,660 lines)
  cop15.js              ← COP15 Cascade module + Soak Timer + Field Tooltips (~6,290 lines)
  testplan.js           ← Mi semana + Armar semana + Recuperación + meses dinámicos (~6,900 lines)
  inventory.js          ← Lab Inventory + Zone Map grid (~5,000 lines)
  panel.js              ← Dashboard, Lab Overview, Reports Center, Users, Alerts, Audit, Health (~3,840 lines)
  projects.js           ← Proyectos: importador Excel, 6 vistas, CPM/línea base (~1,900 lines)
  firebase-sync.js      ← Shared-workspace cloud sync layer (~2,900 lines)
  auth.js               ← Operator identity + PIN wall (~490 lines)
  cop_validator.js      ← CoP Type 1: Panorama, validador, Control SPC, expediente + PDF (~2,830 lines)
  homolog.js            ← Homologación EU: catálogo ICMS + f0/f1/f2/TM + CO₂ + familias IP del WVTA (~1,280 lines)
  bugreport.js          ← Botón 🐞 flotante: captura → comentario → GitHub Issue + bandeja (~600 lines)
  signatures.js         ← Digital signature capture (SignaturePad overlay) (~100 lines)
build.sh                ← Generates kia-emlab-unified.html (single-file for production)
kia-emlab-unified.html  ← GENERATED FILE — do not edit directly
manifest.json           ← PWA manifest
sw.js                   ← Service worker for PWA
CHANGELOG.md            ← Detailed changelog
```

## Module Responsibilities

| Module | File | Prefix | Key State | localStorage Key |
|--------|------|--------|-----------|-----------------|
| App Core | `js/app.js` | — | `db`, `allConfigurations`, `CONFIG` | `kia_db_v11` |
| COP15 Cascade | `js/cop15.js` | — | Uses `db` from app.js | — |
| Test Plan Manager | `js/testplan.js` | `tp` | `tpState` | `kia_testplan_v1` |
| Lab Inventory | `js/inventory.js` | `inv` | `invState` | `kia_lab_inventory` |
| Panel | `js/panel.js` | `pn` | `pnState` | `kia_panel_v1` |
| CoP Validator | `js/cop_validator.js` | `cop` | `copState` (+ `copState.families`) | `kia_cop_v1` |
| Proyectos | `js/projects.js` | `pnProject*` | `pnState.projects` (vive en panel) | — (dentro de `kia_panel_v1`) |
| Auth / Operator | `js/auth.js` | `auth` | `authState` (lightweight) | `kia_current_operator` |
| Signatures | `js/signatures.js` | `sig` | overlay-based | — (in `vehicle.testData.signatures`) |
| Firebase Sync | `js/firebase-sync.js` | `fb` | `fbSync`, queue | `kia_firebase_queue` |
| Homologación EU | `js/homolog.js` | `homo` | `homoState` (+ `homoState.ipFamilies`) | `kia_homolog_v1` |
| Reporte de Bugs | `js/bugreport.js` | `bug` | cola local (sin state global) | `kia_bug_queue`, `kia_bug_settings` |

### Additional localStorage Keys

| Key | Purpose |
|-----|---------|
| `kia_audit_trail` | **Change history** (auditLog, cap 5000 / 90-day purge) — synced across devices |
| `kia_cop_v1` | CoP validator working state + saved judgments — synced |
| `kia_current_operator` | Current operator for attribution (no-password picker) |
| `kia_fb_station` | Sync workspace id — forced to shared `KIA-EMLAB` |
| `kia_fb_device` | Per-device id (`writer`) to distinguish own vs remote live-sync echoes |
| `kia_fb_sync_modules` | Which modules sync (cop15, testplan, inventory, panel, cop, audit) |
| `kia_chart_configs` | Chart Config Engine settings |
| `kia_entity_notes` | Entity Notes (per-vehicle/per-test annotations) |
| `kia_soak_timer` | Soak timer persistence |
| `kia_autoplan_lastrun` | Guard: ISO date of next Monday auto-plan already ran |
| `plannerCfg` (en `kia_testplan_v1`) | Cuota/caducidad de la cola + filtros de la semana — leer SIEMPRE con `tpPlannerCfg()` |
| `kia_homolog_v1` | Catálogo de homologación Europa (ICMS) + enlaces config→MC code + tolerancia CO₂ — synced |
| `kia_bug_queue` | Reportes de bug pendientes de publicar (cap 3, con captura) |
| `kia_bug_settings` | Cache local del token/repo de GitHub (la fuente es el doc compartido en Firestore) |

**`tpState` sub-fields added in v15:** `months` (dynamic production month labels), `priorityRules`
(editable P1..P10 classification for Recovery), `weekAvailability`, `maxTiers`, `recoveryUntil`.

**v16.2 — cobertura y reglas:** `tpGetRule(cfg)` normaliza región/regulación (trim + mayúsculas)
al buscar coincidencia y devuelve `_matchType` ('exacta'|'region'|'comodín'|'default') — nunca
comparar `cfg.rgn`/`cfg.reg` con `===` directo contra `tpState.rules`, siempre pasar por
`tpGetRule`. **`tpCoverageSummary()` es LA única definición de cobertura** en toda la
plataforma (% de configs vigentes con REQ cumplido — vigente = `required > 0`); todo consumidor
nuevo debe llamarla (guard `typeof`) en vez de recalcular su propio %. Config por config
(`tpState.planData[i]`) admite `c.paused`/`c.pausedDecided` (3+ meses sin volumen planeado,
`tpIsDormant(cfg)`) — pausada = `required` 0, fuera de la cobertura; ambos flags se preservan
al re-importar el CSV (`tpImportPlanCSV`). **`tpGetAnalysis()` devuelve un ARRAY** por
configuración (`{...cfg, testedN, required, deficit, compliance, status, score, ruleInfo}`) —
nunca un objeto agregado con `.totalReq`/`.coveragePct` (ese bug dejaba "HOY" en 0%/NaN
permanentemente). `tpSave()` invalida el cache de `tpGetAnalysis()` además del de familias;
los merges/seeds de Firebase sync pasan por `_fbTpUISync()`, que hace lo mismo.

**v16.3 — Almacén de Archivos:** pestaña `pn-files` (Datos → ⋯ Más → ☁️ Archivos) — espacio
compartido de 5MB TOTAL (todo el laboratorio) para subir/bajar un documento entre
dispositivos. **Solo Firestore, sin Firebase Storage** (se descartó a propósito: Storage
exige el plan de pago Blaze/tarjeta; Firestore ya lo usa toda la app gratis) — el archivo se
convierte a base64 y se parte en fragmentos <1MB en una subcolección
(`stations/KIA-EMLAB/files/{id}/chunks/{i}`); el metadato (nombre/tamaño/quién/cuándo/
`chunkCount`) vive en `stations/KIA-EMLAB/files/{id}`, reutilizando `isLabUser()` de
`firestore.rules` sin tocarla — **no hay reglas nuevas que desplegar**. Helpers en
`firebase-sync.js`: `fbFilesEnsureReady/List/Subscribe/Unsubscribe/Upload/Delete/Download`
(`Upload` sube fragmento por fragmento y luego el metadato; `Download` los junta y arma un
Blob local; `Delete` borra todos los fragmentos + el metadato); UI en `panel.js`:
`pnRenderFiles`/`pnFiles*`. La cuota de 5MB (tamaño real, no el base64 inflado) se controla
en el cliente sumando metadatos antes de subir.

## Cross-Module Dependencies

- **COP15 → Test Plan**: `tpAutoFeedFromRelease()`, `tpAutoMarkWeeklyCompletion()`
- **COP15 → Inventory**: `invLogTestUsage()`
- **COP15 → Signatures**: `sigCaptureOpen()` releaser gate in `finishRelease()`
- **Test Plan → Inventory**: prediction checks inventory for gas/fuel sufficiency
- **CoP → Test Plan**: `copFamilies()` reuses the family grouping (`tpFamilyKeyForCfg`); **CoP → COP15**:
  auto-populates VINes from `db.vehicles` of the selected family; **CoP SPC → COP15**: I-MR charts read
  final verified `gasResults` per released vehicle; **CoP SPC → Panel**: `copSpcScanAlarms()` feeds
  `pnGetActiveAlerts()` (source "CoP SPC", guarded with `typeof`)
- **Inventory (Mantenimiento) → Test Plan**: `invMaintPlannedForWeek()` warns (never blocks)
  `tpRenderAvailability` when a `blocksTesting` asset has preventive maintenance scheduled
  that week; **Inventory → Panel/HOY**: `invCalStatus()`/`invMaintOverdue()`/
  `invMaintDueThisWeek()` feed `pnGetActiveAlerts()` (source "Mantenimiento") and
  `dashCollectActivities()`, guarded with `typeof`
- **Panel (Proyectos) → Inventory/Panel/HOY**: `pnActiveProjectForAsset()` feeds a banner in
  `invRenderMaint` (guarded with `typeof`); `pnProjectsOverdueSteps()`/`pnProjectMilestones()`
  feed `pnGetActiveAlerts()` (source "Proyectos"), `dashCollectActivities()` (category
  `proyectos`) and `_pnCollectCalendarEvents()`
- **Panel → All**: Lab Overview (`renderLabOverview`) + Intelligence read `db`, `tpState`, `invState`
- **Firebase Sync → All**: pushes/pulls per-module state to `stations/KIA-EMLAB/{module}/current`
- **App Core → All**: chart engine (`chartConfig*`), undo (`undoPush/Pop`), notes (`note*`),
  search (`globalVinSearch`), **audit (`auditLog`)**

## Script Load Order (matters!)

`app.js` → `cop15.js` → `inventory.js` → `testplan.js` → `panel.js` → **`projects.js`** → `auth.js` →
`signatures.js` → `firebase-sync.js` → `cop_validator.js` → **`homolog.js`** → **`bugreport.js`** (last; registra
`pnRenderBugs`, que `panel.js` referencia con guarda `typeof`, y sus helpers `fbBugs*` viven en
firebase-sync.js). `projects.js` usa `pnState`/`pnSave`/`pnRender` de panel.js, por eso va
justo después; panel.js llama de vuelta con guardas `typeof`. `initializeSystem()` in app.js runs on `DOMContentLoaded` and bootstraps everything.

## Conventions

- All functions use global scope (no ES modules) — intentional for single-file offline compatibility
- Function naming: `tp*`=Test Plan, `inv*`=Inventory, `pn*`=Panel, `pnProject*`/`pnProj*`=Proyectos, `cop*`=CoP validator,
  `fb*`=Firebase sync, `auth*`=operator, `homo*`=Homologación EU, `bug*`=Reporte de bugs, `note*`=Entity Notes, `chartConfig*`=Chart,
  `undo*`=Undo, `cascade*`=Cascade tooltips, no prefix = COP15/shared
- State stored in localStorage as JSON; TP/Inventory/Panel/CoP render HTML dynamically via JS
- CSS custom properties in `:root`; unified light theme with per-module `--accent-*`
- Destructive actions call `undoPush(module, label)` first; important state changes call
  `auditLog(module, action, entity, details)` so they appear in the change history
- Verify syntax with `node --check js/<file>.js`; run `./build.sh` after changes; verify the bundle's
  largest inline `<script>` with `node --check` too

## v15 — Simplify & Sync (current state)

- **Dead-code cleanup**: 39 unused functions removed.
- **Single Lab Overview**: `renderLabOverview(el, opts)` in panel.js is the one source for cross-module
  KPIs + pipeline + weekly plan + alerts; used by both HOY (`dailyDashRender`) and Panel dashboard.
  Module dashboards link to it via "📊 Ver Resumen del Lab".
- **Reports Center**: Panel tab `pn-reports` (`pnRenderReports`/`pnRunReport`) — one hub that dispatches
  to existing exporters (plan JSON, gap CSV, inventory, forecast, shift log, alerts, audit, PDF).
- **Test Recovery Plan**: Plan tab `tp-recovery` (`tpRenderRecovery`, `tpBuildRecoveryPlan`,
  `tpClassifyTier`). Mark weeks unavailable, set per-week capacity/days + a "plan until" date; classify
  pending tests into **editable priority levels (P1..P10)** via **cascade-filtered dropdowns**
  (Familia, Región, Regulación, Modelo, Cilindrada, Body, Manejo — options narrow like COP15 Cascade);
  computes order/ETA/shortfall/deadline-risk and can **materialize** into real weekly plans.
- **Production import**: `tpImportPlanCSV` now **merges** (preserves prior months, adds new ones) and
  months are **dynamic** (`tpState.months` / `tpMonths()`), not a fixed 6-slot array.
- **CoP validator** (`cop_validator.js`): select **Región + Familia**, rows = **VINes** (auto from
  probados + manual) × columns = gases; **live "Familia CONCORDANTE / NO CONCORDANTE"** verdict
  (sequential-sampling `copCalcStats`, needs n≥3); **save** judgments (`copSaveJudgment`), synced.
- **Shared sync**: `FB_SHARED_WORKSPACE='KIA-EMLAB'` (all devices → same Firestore path); `FB_DEVICE_ID`
  `writer` field distinguishes own vs remote live changes; initial **seed push**; hardened `fbPullApply`
  (never overwrite richer local with an emptier remote); **CoP + audit** now synced.
- **Login wall (reactivado en v15.6)**: `authInit()` valida `kia_auth_session` (12 h); sin sesión
  vigente → `authShowLogin()` y `initializeSystem()` se detiene. PIN por operador con SHA-256
  (`pinHash2`, migra `pinHash` legacy), lockout de 60 s tras 5 fallos (`kia_pin_lockout`), auditoría
  (`auditLog('auth', …)`). Bypasses solo en setup inicial. La contraseña de dispositivo (Email/Password)
  la gestiona `firebase-sync.js` (`fbEnsureAuth`/`fbShowAuthPrompt`).
- **Change history surfaced**: topbar **🕘** → Panel `pn-audit`; more `auditLog` coverage (gas/fuel
  readings, production import, CoP save); synced (`audit` collection, merge by id).

## v15.7 — Control SPC + calidad de captura

Mejoras adaptadas del tablero VETS de un laboratorio hermano (comparativa completa en CHANGELOG):

- **Control SPC**: sub-pestaña en la plataforma CoP (`copState.view`, `copBuildSpcHTML`,
  `copSpcRenderCharts`). Carta I-MR por familia×gas sobre `gasResults` finales (aprobador→liberador),
  familia = `copVehicleFamilyKey`. σ = MR̄/1.128; UCL/LCL = ±3σ; Cpk = (Límite−media)/3σ (n≥8);
  reglas Nelson R1/R2/R3 (`copSpcFlags`); alarmas `copSpcScanAlarms()` (n≥4, CO2 excluido) — también
  visibles en Datos → Alertas. Toggles: Zonas σ / Límite / **% del límite**. Charts:
  `window._copSpcIChart` / `_copSpcMrChart`.
- **Captura de liberación** (cop15.js): estado con **% del límite**; `GAS_PLAUSIBLE_BOUNDS` marca
  valores improbables en ámbar (avisa sin bloquear, audita `gas_fuera_de_rango` al guardar);
  **FE informativa** por balance de carbono bajo CO2 (`_libFuelEconomyFromCO2`). PDF con % y FE.
- NO adoptado a propósito: desglose por fase/bolsa (solo valores finales verificados), tema oscuro,
  conteo fijo CoP de 3/familia (nuestro muestreo secuencial es superior).

## v15.8 — Edición retroactiva + visión anual del plan

- **Historial → 📝 Completar**: modal de edición retroactiva para archivados incompletos
  (`histOpenCompleteModal` en cop15.js). Descriptor único `PDF_REQUIRED_FIELDS` (junto a
  `validatePdfCompleteness`) alimenta validador y modal — **añadir un campo obligatorio al PDF =
  añadir una entrada ahí** (path, label, section, refId del input de index.html, num/si/when).
  Faltantes editables; existentes 🔒 (modificar = razón ≥5 chars + firma → `retroSignatures`);
  timeline "Datos completados retroactivamente" + auditoría `retro_edit`. Botón 🕘 =
  `histShowTimelineModal` (control de cambios). El vehículo nunca sale de `archived`.
- **Plan**: tarjeta Presupuesto Anual (`tpRenderAnnualBudgetCard`); propósito por región al
  iniciar prueba (`tpState.startPurposeByRegion`, `tpPurposeForRegion`, UI en Reglas); reglas
  default P4 Legacy/P5 EV (`tpEnsurePriorityRuleDefaults`, maxTiers default 5); badge
  "⏱ última prueba" por familia (`tpLastTestBadge`, `f.lastTestDate/daysSinceTest`) y evidencia
  ordenada DESC.

## v15.9 — HOY tablero de actividades + consumo inteligente

- **HOY** ya no son secciones sueltas: tablero estilo Monday (`dashCollectActivities` →
  `dashRenderBoard`/`dashRenderRow` en app.js; CSS `.dash-*`). Fuentes normalizadas: toma de
  gases (`invReadingStatusToday`), pruebas de HOY del plan (`testDay`/`preconDay`), vehículos
  con stepper **N/8** (`cascadeVehicleStage`/`CASCADE_STAGES`, cop15.js) + ETA
  (`cascadeVehicleETA`, override manual `v.expectedReleaseAt` auditado via
  `dashSetExpectedRelease`), alertas de inventario, consumo, `pnGetActiveAlerts` (sin duplicar
  Inventario/Consumo), aprobaciones y **tareas manuales** `pnState.tasks`
  (`pnTaskAdd/Toggle/Delete`, merge por id `_fbMergeTasks` en fbPullApply, tombstones).
  Refresco: listener `data:saved` (debounce 400 ms) + tick 60 s solo con HOY visible.
- **`kia_soak_timer` ahora persiste `{endTime, totalMs, vehicleId, vin}`** — getNextStep y el
  stepper ignoran soaks ajenos; tarjeta de soak del Panel corregida al esquema real.
- **Consumo aprendido** (inventory.js): `invCalcConsumptionRates` usa SOLO lecturas manuales
  (`!r.auto`), reparto proporcional en días mixtos, y drop 0 con pruebas = consumo cero.
  `invUpdateConsumptionModel()` persiste `invState.consumption` (cache determinista — se
  recomputa, nunca se mergea; hook tras pull en firebase-sync). `invLogTestUsage` descuenta
  el estimado aprendido por gas (fallback `INV_PSI_FALLBACK=50`) y **descuenta gasolina**
  (`INV_FUEL_FALLBACK_L=15`, tanque por regulación más reciente, auditoría `fuel_auto_deduct`).
  `invForecastGasNeeds()` (cacheado) alimenta HOY, la tarjeta ⛽ del dashboard de inventario y
  la fuente 'Consumo' de `pnGetActiveAlerts`.

## v16.0 — Plataforma autoguiada (ayuda total + accesibilidad)

Inflexión de accesibilidad: cualquier persona nueva debe entender cada pantalla y campo sin que
alguien le explique. Cuatro piezas, todas en archivos existentes (sin JS nuevo):

- **`CASCADE_TOOLTIPS`** (registro global, definido en cop15.js) ahora cubre los 7 módulos.
  Cada archivo (testplan.js/inventory.js/panel.js/cop_validator.js) agrega sus claves con
  `Object.assign(CASCADE_TOOLTIPS, {...})` al final del archivo (cargan después de cop15.js).
  `app.js` (HOY) carga ANTES de cop15.js, así que sus claves se registran en tiempo de
  ejecución vía `_dashRegisterHelp()` (guard idempotente) dentro de `dailyDashRender`, no al
  parsear. `cascadeInjectTooltips()` tiene dos modos: (1) el original, busca `label[for=id]` o
  el `<label>` del `.form-group`/contenedor padre de un campo; (2) nuevo, escanea
  `[data-help="clave"]` para títulos de tarjeta/encabezados sin campo asociado. Idempotente
  (borra todos los `.cascade-help-btn` antes de re-inyectar) — se llama al final de cada
  render/switch de pestaña (`tpSwitchTab`, `invSwitchTab`, `pnSwitchTab`, `copRender`,
  `dailyDashRender`, `loadVehicle`, `loadRelease`, y en modales que se inyectan vía innerHTML
  directo como `invShowAddGas`/`invAddEquipment`/`dashTaskModalOpen`).
- **Banners por pestaña** (`HELP_TABS` en app.js + `helpBannerHTML(tabId)`/`helpDismiss(tabId)`):
  franja descartable con "Ver más" (modal `helpShowTab`) y "Entendido ✓"; dismissal persiste
  por dispositivo en `localStorage['kia_help_dismissed']`. Tres mecanismos de inyección según
  la arquitectura de render de cada módulo: tabs cacheadas por `tabCacheSwitch` (tp-*/inv-*/pn-*
  no-Alpine) usan `helpInjectBannerDeferred(moduleId, tab)` (doble `requestAnimationFrame`,
  porque `tabCacheSwitch` puede diferir el render real); los 6 tabs Alpine del Panel
  (`_pnAlpineTabs`) usan un slot estático `#help-banner-slot-<tabId>` poblado desde
  `pnSwitchTab`; COP15 (tabs por classList, no cacheadas) usa slots estáticos
  `#help-banner-slot-cop15-<tab>` poblados en el handler de click de `.tab`. HOY antepone el
  banner directo al string HTML en `dailyDashRender`.
- **Tours por módulo** (`TOURS` en app.js, reemplaza el `_tourSteps` único): `TOURS.global` (el
  tour original de 5 pasos) + `TOURS.today/testplan/inventory/panel/cop/cop15`. `startTour(moduleKey)`
  fija `_tourModule` y persiste por módulo en `kia_tour_done_<module>` (`kia_tour_done` se
  mantiene como alias de `global`). Si el `target` de un paso no existe en el DOM, `_renderTourStep`
  lo salta automáticamente (no rompe). Disparo de primera visita por módulo:
  `_tourMaybeAutoStart(sectionId)` desde `switchPlatform`, solo desktop (`innerWidth>=768`),
  con `setTimeout` 800ms. El botón **?** del topbar abre `helpMenuOpen()` (tour de este módulo /
  tour general / glosario) en vez de lanzar el tour directo.
- **Glosario** (`HELP_GLOSSARY` + `helpShowGlossary()`/`helpFilterGlossary(q)` en app.js): ~22
  términos del laboratorio, modal con buscador simple.

**Regla para nuevo código:** toda pestaña nueva agrega una entrada a `HELP_TABS`; todo campo de
captura no trivial agrega una entrada a `CASCADE_TOOLTIPS` (con `data-help="clave"` en su
título/label si no tiene `<label for>` propio). Ver ejemplos ya escritos en cada módulo.

## v16.4 — Plan Maestro de Mantenimiento y Calibración (COP15-F11)

Integración del formato oficial **COP15-F11 rev. 03** (Excel de mantenimiento preventivo y
calibración) dentro de Consumibles — sin módulo nuevo, reusa `invState`/`invSave`/sync.

- **Estado** (`js/inventory.js`): `invState.assets` (14 equipos padre), `invState.equipment`
  (instrumentos — ya existía, ahora con los campos F11: `f11Id`, `assetId`, `requiresCal`,
  `calType`, `calPlace`, `rangeMax`, `rangeUse`, `maxError`, `comments`, `calHistory[]`),
  `invState.maintActivities` (catálogo de mantenimiento preventivo), `invState.maintLog`
  (historial de ejecución), `invState.f11Seed` (guard de migración). Listas cerradas:
  `INV_CAL_FREQ_DAYS`, `INV_MTTO_FREQ_WEEKS`, `INV_LABS`, `INV_CAL_PLACES`, `INV_CAL_TYPES`.
- **Migración `_invMigrateF11()`**: una sola vez por dispositivo (`f11Seed>=3`), fusiona los
  49 instrumentos del F11 con los 31 ya capturados por `f11Id` → `INV_F11_LEGACY_MAP` → KMM
  ID → serie; solo rellena campos vacíos (lo capturado en la app gana), da de alta los
  faltantes. Idempotente — corre tras cada `invPreloadData()`.
- **`invCalStatus(eq)` es LA definición** del semáforo de calibración (umbral 60 días,
  colores/labels vigente/porvencer/vencido/sinregistro/noaplica) — todo consumidor nuevo
  debe llamarla en vez de leer `nextCalDate` directo. `invCalSummary()` es LA definición del
  resumen (réplica de la hoja Dashboard del F11). `invMaintMatrix(year)`/`invMaintCompliance(year)`
  son LA definición del Plan Maestro de 52 semanas y su cumplimiento — se calculan en cada
  render, nunca se guardan. `invWeekOfYear`/`invMondayOfWeek`: partición simple de semana
  1-52 (no ISO 8601 estricto — el lunes de la semana 1 puede caer en diciembre del año
  anterior; sin impacto salvo la última semana de diciembre / primera de enero).
- **UI**: `Pruebas → Consumibles → 🔧 Equipos` (barra principal, ya no en "⋯ Más") rediseñada
  con semáforo/tiles/filtros/agrupado por equipo padre y botón **"✅ Calibrado"** (2 campos:
  fecha + certificado). Pestaña nueva **🛠️ Mtto**: vencidos/esta semana arriba con
  **"✔ Hecho"** de un toque, Plan Maestro y catálogo plegados (`<details>`) abajo.
- **Cross-módulo**: HOY (`dashCollectActivities`) muestra calibraciones/mantenimientos
  vencidos y de la semana con check de un toque. `pnGetActiveAlerts` — **bug corregido**:
  leía el campo inexistente `eq.nextCalibration` (nunca `eq.nextCalDate`), la alerta de
  calibración vencida nunca se había disparado. Plan → Disponibilidad avisa (no bloquea
  solo) cuando una semana tiene mantenimiento programado de un `asset.blocksTesting`.
- **Sync** (`firebase-sync.js`): `assets`/`maintActivities` mergean por id con `updatedAt`
  (gana el más reciente); `maintLog` es append-only (unión por id); `equipment[].calHistory`
  se une por fecha+certificado — antes una calibración de otro dispositivo no se mergeaba
  con el `equipment` local (solo se detectaban altas nuevas, nunca ediciones).
- **Exportación**: 4 CSV con encabezados exactos del Excel (`invExportF11Equipos/Calibracion/
  Actividades/Historial`) + PDF del Plan Maestro (`invMaintPlanPDF`), todo en el Centro de
  Reportes. **Importación** `invImportF11CSV` actualiza calibraciones en bloque (empata por
  `f11Id` → KMM → serie), con resumen y confirmación antes de escribir.

## v16.5 — Mapa como retícula + menos campos + sin espacio muerto

- **El mapa del cuarto de gases ya NO es un plano SVG editable.** `invRenderZoneMap()`
  (`js/inventory.js`) pinta una retícula responsiva (`.inv-zonemap-grid`): cada zona es una
  tarjeta que crece según su número de slots — sin cajas de tamaño fijo, sin `invState.zoneLayout`
  (se borra una sola vez en `invPreloadData`). El arrastrar-y-soltar de cilindros sigue siendo
  `invInitZoneDrag()`/`invDropCylinder()`/`invUndoLastMove()` — **no se reescribió**, solo se
  reconectó emitiendo botones `.inv-zone-slot` (antes ese motor estaba huérfano). `_invCylColor(gas)`
  sigue siendo la única definición del semáforo de un cilindro (nivel + vencimiento).
- **Formularios cortos con autollenado**: patrón `<details>Más detalles</details>` en Cilindro
  (`invShowAddGas`), Instrumento (`invAddEquipment`), Actividad de mantenimiento
  (`invAddMaintActivity`) y Zona (`invShowZoneModal`) — solo 2-4 campos visibles, el resto sigue
  ahí pero plegado. Helpers de autollenado: `_invNextFreeSlot()`, `_invLastGasTraceSupplier()`,
  `_invLastInstrumentOfAsset(assetId)` + `invEqAutofillFromAsset()`, `_invNextFreeZoneId()`. Los
  `save*` no cambiaron — siguen leyendo por `getElementById`, que sigue existiendo aunque el campo
  esté dentro de un `<details>` cerrado.
- **`--content-max` (styles.css)** centraliza el ancho máximo de contenido (1400px) que antes solo
  tenía `.tp-main`; `.daily-dash` (HOY) ahora también lo respeta — antes no tenía `max-width` y en
  pantallas anchas se estiraba de borde a borde. `.dash-group` (HOY) y `.inv-row-list-2col`
  (listas de una fila por elemento en Consumibles) pasan a 2 columnas en `min-width:1024px` en vez
  de dejar el ancho sobrante vacío.

## v16.6 — Seguimiento de Proyectos (bitácora + timeline + Gantt)

- **Nuevo módulo Proyectos** (`js/panel.js`, pestaña `pn-projects`, Datos → ⋯ Más → 🗂️
  Proyectos): seguimiento general (reparaciones, proyectos de inversión, cualquier iniciativa)
  con pasos/responsables/fechas — **no solo mantenimiento**. `pnState.projects[]` =
  `{id, name, desc, assetId, owner, status, steps[], log[]}`. `steps[]` son las filas capturadas
  (tabla tipo Loop: Paso/Responsable/Estatus/Fecha objetivo/Cumplimiento/Obstáculo); `log[]` son
  notas libres. **La línea de tiempo NUNCA se guarda** — `pnProjectTimeline(p)` la deriva
  mezclando `log[]` con los cambios de estado de los pasos, sorteados desc — mismo patrón que
  `v.timeline`/`g.timeline`. `pnProjectProgress(p)` es LA definición de avance/vencidos/bloqueados
  de un proyecto — todo consumidor nuevo debe llamarla. Sin proyecto seleccionado
  (`window._pnSelectedProject`): retícula de tarjetas (`.pn-proj-grid`, patrón de
  `.inv-zonemap-grid` de v16.5). Con uno seleccionado: 📋 Tabla / 🕒 Línea de tiempo / 📊 Gantt
  (semanal, mismo patrón de colspan que el Plan Maestro de 52 semanas de v16.4). Navegación
  interna vía `_pnProjNav()` (invalida `tabCacheSwitch` + `pnRender()`) — necesario porque
  `pn-projects` usa el render clásico (no está en `_pnAlpineTabs`), y moverse dentro de la MISMA
  pestaña (retícula→detalle, cambiar de vista) no dispara un cambio de pestaña real.
- **Integraciones**: proyecto ligado a un equipo del F11 (`assetId`) → banner "🗂️ Proyecto
  abierto" en Consumibles → Mtto (`invRenderMaint`, guardado con `typeof pnActiveProjectForAsset`).
  Hitos (pasos con fecha objetivo) en Datos → Calendario (`pnProjectMilestones`, sumado en
  `_pnCollectCalendarEvents`). Pasos vencidos/bloqueados de proyectos activos → HOY (categoría
  nueva `proyectos` en `DASH_CATS`/`DASH_CAT_ORDER`, checkbox de un toque → `pnProjectStepDone`) y
  → Alertas (`pnGetActiveAlerts`, fuente `'Proyectos'`) — con el filtro anti-duplicado del punto 8
  de `dashCollectActivities` excluyendo `'Proyectos'` para no repetirlas en HOY.
- **Arreglo de reactividad Alpine (Datos)**: las pestañas de Datos sobre Alpine (Alertas,
  Calendario, Usuarios, Bitácora, Sistema, Auditoría — `_pnAlpineTabs`) leen
  `pnGetActiveAlerts()`/`_pnCollectCalendarEvents()`, funciones planas que tocan el `pnState`
  global fuera de la reactividad de Alpine — sin una prop reactiva de por medio, Alpine nunca
  detectaba que debían reevaluarse (bug preexistente que afectaba a TODAS las fuentes de alerta,
  no solo Proyectos — confirmado con Mantenimiento). `panelAlpineComponent()` ahora tiene
  `_dataVersion` (se lee, sin usarse, dentro de `activeAlerts()`/`calendarEvents()` para que
  Alpine SÍ las trackee); `_bump()` la avanza; `pnSave()` ahora dispara `data:saved` (como ya
  hacen `saveDB()`/`invSave()`) — el listener que llama `_bump()` en `data:saved` ya existía,
  solo faltaba emitirse desde `pnSave()`.
- **Sync** (`firebase-sync.js`): `_fbMergeProjects` mergea proyectos por id (gana `updatedAt`) y,
  dentro de cada proyecto, `steps[]`/`log[]` también por id vía `_fbMergeProjectSubArray` — dos
  técnicos editando pasos distintos del mismo proyecto en dispositivos distintos no se pisan.
- **Exportación**: `pnExportProjectCSV`/`pnExportAllProjectsCSV`, encabezados idénticos al
  tablero de Loop del usuario (`Step,Responsible,Status,Target Date,Completion Date,
  Roadblock/Comments`), en el Centro de Reportes.
- **Arreglo Plan → Familias** (`js/testplan.js`, `tpRenderFamilies`): restos hardcodeados del
  tema oscuro eliminado en v15.5 (`#0f1826`/`#12192b`/`#e2e8f0`/`rgba(255,255,255,0.0x)`)
  pintaban franjas negras dentro de tarjetas blancas — reemplazados por `var(--tp-dark)`/
  `var(--tp-text)`/`var(--tp-border)`; fuentes de 8-9px subidas al mínimo del proyecto (11px).

## v16.8 — Proyectos como Project Manager completo (`js/projects.js`)

El módulo salió de `panel.js` a **su propio archivo** (convención: un módulo = un archivo). Los
puntos de registro se quedaron en `panel.js` (`_pnTabs`, `_pnGetRenderer` —ahora con guarda
`typeof`—, la fila del Centro de Reportes, la rama de `pnGetActiveAlerts`, la llamada en
`_pnCollectCalendarEvents` y `pnState.projects = []` en `pnInit()`).

- **Importador (`pnProjImportOpen`)** — `.xlsx`/`.xls`/`.csv` y pegado TSV. **No hay formato
  obligatorio**, solo se pide una fila de encabezados: `_pnProjDetectHeader` la ubica y
  `_pnProjAutoMap` mapea con los sinónimos de **`PN_IMPORT_FIELDS`** (agregar un sinónimo ahí es
  todo lo que hace falta para que un tablero nuevo se detecte solo). **SheetJS se carga diferido**
  (`_pnProjLoadXLSX`, `PN_XLSX_CDN`) al abrir el importador — nunca en el arranque; sin red, Pegar
  y CSV siguen funcionando. `_pnNormStatus` evalúa **negaciones primero** ("Not started" ≠ started)
  y `_pnNormDate` arma la cadena desde los números (nunca `new Date(y,m,d)`) para no correr la zona
  horaria; `_pnProjDetectDMY` decide dd/mm vs mm/dd **con los datos**. Fusionar empata por título
  de paso, así que reimportar actualiza en vez de duplicar.
- **6 vistas de detalle** (`window._pnProjectView`): `table`, `kanban`, `timeline`, `gantt`,
  `scurve`, `workload` — más `window._pnGridView='portfolio'` a nivel retícula. **Definiciones
  únicas** (todo consumidor nuevo debe llamarlas, no recalcular): `pnProjectProgress`,
  `pnProjectWorkload`, `pnProjectSCurve`, `pnPortfolioRows` (salud RAG), `pnProjectCPM`.
- **`pnProjectCPM(p)`** — pasada adelante/atrás con orden topológico. **No reprograma** las fechas
  capturadas: las usa como ancla y devuelve `{info:{stepId:{es,ef,ls,lf,slack,critical,atRisk,risk}},
  cycle, order}`. Un **ciclo se detecta y se reporta**, nunca cuelga; `_pnProjDescendants` evita
  que se capture uno desde el modal.
- **Campos nuevos del paso**, todos opcionales/retrocompatibles: `isMilestone`, `baselineTarget` +
  `baselineAt`, `startDate`, `durationDays`, `dependsOn[]`. La **línea de tiempo sigue sin
  guardarse**: el evento "fecha recorrida" se DERIVA comparando `baselineTarget` con `targetDate`.
- **Gráfica**: `window._pnProjSCurveChart` + wrapper `#pn-proj-scurve-wrapper` +
  `chartConfigBuildPanel('pn_proj_scurve', …)`. `_pnRenderProjectDetail` **destruye la instancia al
  salir de la vista** — sin eso Chart.js truena con "canvas is already in use" al volver.
- **Puente con HOY (conectar, no fusionar)**: `pnProjectStepAddQuick` y `pnProjectPickerOptions`
  alimentan el selector de proyecto del modal ➕ Actividad (`dashTaskModalOpen`/`dashTaskModalSave`
  en `app.js`); `pnPromoteTaskToProject` mueve una tarea suelta a un proyecto dejando tombstone.
  **`dashCollectActivities` ahora pasa `assignee`** en pasos de proyecto y mantenimientos — sin eso
  el filtro "Solo míos" (`!a.assignee || a.assignee === currentOp`) los dejaba pasar siempre.
  `dashRenderRow` admite `action2` (acción secundaria opcional en la fila).
- **Sync**: sin cambios — `_fbMergeProjectSubArray` mergea `steps[]`/`log[]` por id quedándose con
  el objeto ganador completo, así que los campos nuevos (incluido `dependsOn`) viajan solos.
  Verificado con un merge A/B real.

## v17.13 — Reporte de bugs con captura (`js/bugreport.js`)

Botón 🐞 flotante (`bugFabInit()`, llamado desde `initializeSystem()`) visible en toda la
plataforma. `bugCaptureStart()` carga **html2canvas diferido** (`_bugLoadHtml2Canvas`, copia literal
del patrón `_pnProjLoadXLSX`) y rasteriza SOLO el viewport; `bugModalOpen(dataUrl)` pide el
comentario y ofrece Enviar / **Descartar** (descartar no persiste nada en ningún lado).

- **La captura NUNCA se guarda si no se envía**: vive en `_bugPendingShot` mientras el modal está
  abierto y se anula al cerrarlo.
- **`bugBuildIssueBody(report, shotUrls)` es una función PURA** (sin DOM) — se puede probar en Node
  y es LA definición del cuerpo markdown del issue.
- **Las capturas van a la rama `bug-shots`, nunca a `main`** (`BUG_GH_BRANCH`), vía Contents API;
  `_bugEnsureBranch` la crea desde el HEAD de la rama por defecto la primera vez y tolera el 422
  de carrera entre dispositivos. Un fallo al subir la imagen NO cancela el issue.
- **Cola offline** `kia_bug_queue` (cap `BUG_QUEUE_MAX`=3). `_bugQueueSave` sacrifica las capturas
  más viejas antes de rendirse ante un `QuotaExceededError` — el texto del técnico es lo que no se
  puede perder. Reintentos: evento `online`, arranque (a los 6 s, tras `bugLoadSettings`) y botón
  manual. `bugTrySendAll` se auto-excluye con `_bugSending` para no duplicar issues.
- **Respaldo en Firestore**: helpers `fbBugs*` en `firebase-sync.js`, junto a los de Archivos y con
  su mismo esqueleto de fragmentos (`stations/KIA-EMLAB/bugreports/{id}` + `chunks/`). **Las reglas
  ya cubren cualquier subcolección de `stations/` — no hay `firestore.rules` que tocar.**
- **Los `fbBugs*` tienen DOS caminos, como `fbPush`/`fbPull`**: el SDK, y la **API REST** cuando
  el transporte del SDK está roto (el topbar lo muestra como "REST Sync"). Los primitivos REST
  (`_fbBugsRestSend/Url/DocToObj`) reusan `_fbIdTokenPromise`/`fbToFirestoreValue`. `fbBugsUpdateMeta`
  manda `updateMask.fieldPaths` en REST: sin él PATCH reemplaza el documento entero y marcar un
  issue como resuelto borraría el comentario y la captura.
- **NO basta con mirar `fbSync._useREST` para elegir camino**: ese flag se enciende recién cuando
  la prueba de conexión hace **timeout (12 s)**, así que en los primeros segundos el SDK puede
  estar roto y el flag seguir en `false`. **`_fbBugsSdkOrRest(sdkCall, onSdkOk, restCall)` es LA
  forma de llamar a Firestore en este módulo**: usa REST directo si el flag ya está puesto, y ante
  CUALQUIER fallo del SDK (rechazo, throw síncrono, o no devolver promesa) reintenta por REST en
  vez de rendirse. Sin eso, guardar el token justo al abrir la app fallaba definitivamente aunque
  el dispositivo cayera a modo REST un instante después. Todas las operaciones escriben por id con
  `set`/PATCH, así que reintentar es idempotente.
- **`fbBugsEnsureReady()`** es la condición de "listo" de este módulo (NO `fbFilesEnsureReady`, que
  exige el SDK y por eso deja fuera el modo REST).
- **Cada llamada al SDK va envuelta en `try/catch`**, no solo `.catch()`: el SDK a veces lanza
  `INTERNAL ASSERTION FAILED` de forma SÍNCRONA durante una reconexión, y ese throw se propagaba
  hasta `tabCacheSwitch` borrando la pestaña entera.
- **Token/repo compartidos** en `stations/KIA-EMLAB/settings/bugreports` (`fbBugsGetSettings`/
  `fbBugsSaveSettings`), con cache local `kia_bug_settings` para arrancar offline. El token **nunca**
  se escribe en la auditoría ni se muestra completo (`bugMaskToken`).
- **`window._bugRecentErrors`** (`app.js`, cap 20, solo RAM) lo llenan los listeners `error` y
  `unhandledrejection`; se adjuntan al issue. No se persiste ni se envía nada por su cuenta.
- La pestaña `pn-bugs` se registra en `panel.js` con guarda `typeof` (patrón de Proyectos v16.8);
  `pnRenderBugs` y los `pnBugs*` viven en bugreport.js.

## v17.14 — Homologación Europa (`js/homolog.js`)

Para vehículos **EUROPE**, los coeficientes de dinamómetro (f0/f1/f2/TM) y el CO₂ declarado vienen
del **ICMS de HMG**. Se importan como catálogo y se capturan **en el Alta**, no al preacondicionar.

- **`homoIsEurope(region)` es LA definición** de "este vehículo necesita ficha" (acepta EUROPE y
  EUROPA). El bloque del Alta (`#homo-alta-box`, en index.html) se muestra/oculta desde
  `homoAltaSync()`, llamada al final de **`renderCascadeTree()`** (cop15.js) — ahí es donde se
  entera de la región elegida.
- **La ficha se guarda en el VEHÍCULO** (`vehicle.homolog`), nunca en la configuración: es la
  evidencia de con qué coeficientes se corrió *ese* vehículo. `homoVehicleData(v)` es LA definición
  de leerla; se audita al registrar (`homologacion_capturada`).
- **`homoState.links`** (configCode → MC code) es lo que hace que del segundo vehículo de la misma
  config en adelante el Alta se autollene solo. Se escribe en `homoAltaPick` y al registrar.
- **El importador fusiona por MC code / Work Order**, así que las dos descargas del ICMS
  (coeficientes y CO₂) se pueden subir por separado y la segunda completa la primera —
  `homoImportApply` solo pisa campos que traen valor. Reimportar actualiza, no duplica.
  SheetJS se carga diferido reusando `_pnProjLoadXLSX` de projects.js (por eso homolog.js va
  después). Agregar un sinónimo a `HOMO_IMPORT_FIELDS` basta para reconocer un encabezado nuevo.
- **CO₂ NO entra al muestreo secuencial del CoP**: no tiene límite regulatorio fijo, su referencia
  es el valor declarado de cada vehículo. `homoCo2Deviation` y **`homoCo2Assess` son LA definición**
  del veredicto (promedio de desviaciones % vs `homoState.co2TolerancePct`). `cop_validator.js` solo
  pinta (`_copBuildCo2HTML`) — la lógica vive en homolog.js.
- **Sync**: `fbSyncModules.homolog`; el merge en `fbPullApply` empata filas por MC code / Work Order
  y se queda con la más reciente (`at`), y une los `links` de ambos lados.
- Alcance actual: **solo CO₂ combinado**. Las fases y el consumo se importan y guardan pero aún no
  se comparan.

## v18.0 — Planificador semanal (`js/testplan.js`, pestaña `tp-weekly`)

El generador llenaba la capacidad con **toda** la cola de arrastre antes de mirar el déficit fresco,
así que con capacidad 4 y cola de 20+ el paso de déficit **nunca corría**. Ahora la cola tiene techo.

- **`tpSelectWeeklyItems` sigue siendo LA definición** de la selección semanal, ahora en 4 pasos:
  obligatorias → **cola acotada por cuota** (`carryoverMaxPct`, piso de 1 con capacidad ≥ 2) →
  déficit fresco (que ya **siempre** corre) → relleno con cola si sobran huecos. `opts` nuevos y
  retrocompatibles: `exclude[]`, `dryRun`, `ignoreFilters`. Sigue siendo **pura respecto a
  `tpState`**, que es lo que permite llamarla en cada tecla para la vista previa.
- **`tpPlannerCfg()` es LA forma de leer la configuración del planificador**, nunca
  `tpState.plannerCfg.x` directo: `_fbPullSeed` (`firebase-sync.js`) hace `tpState = remoteData` y
  solo rellena una lista fija, así que un pull desde código viejo dejaría `plannerCfg` en
  `undefined` y la migración de arranque ya no vuelve a correr. El accesor reaplica defaults en cada
  lectura; `plannerCfg` y `autoPlanLastRun` se sumaron a la lista de preservación de `:1217`.
- **La caducidad de la cola es DERIVADA** (`tpBacklogEligible()` → `{eligible, expired, filtered}`):
  no guarda estado, sobrevive al sync, se autocorrige al cambiarla y **no toca `deficit`** — por eso
  `tpCoverageSummary()` no cambia. Caducar o descartar no es haber probado.
- **`tpPassesWeekFilter(cfg)`** reusa `_tpRuleMatchField`/`tpRuleFieldOptions` **sin modificarlos**:
  `plannerCfg.filters` tiene a propósito la forma de una regla de prioridad (vacío y `'*'` = comodín).
  Cero código de matching nuevo. Aplica al déficit fresco **y** a la cola; las obligatorias quedan
  exentas y se reportan en `outOfFilter`.
- **`tpAgingBoost` se acota a la caducidad**: si no, una config caducada que alguien fija conserva
  el empuje completo y le gana a todo. Sus sliders (`perWeek`/`max`) por fin existen — antes
  `tpState.agingBoost` se sincronizaba pero no tenía UI en ninguna pantalla.
- **UI**: `tpBuildPriorityKnobsHTML(opts)` es el builder único de las perillas de ranking, montado
  en `tp-weekly` **y** en `tp-rules` (`opts.onInput` decide qué se repinta). Las reglas de ratio se
  quedan solo en Reglas porque cambian `required`/`deficit` de todo el sistema.
  `tpRenderPlannerPreview()` escribe **solo** `#tp-planner-preview` (nunca `tpRender()`), se protege
  con `if (!host) return` porque el debounce puede caer tras cambiar de pestaña, y termina en
  `cascadeInjectTooltipsDeferred()`. El primer pintado va con doble RAF (tpRenderWeekly ya corre
  dentro del RAF de `tabCacheSwitch`). Patrón de sliders: `oninput` → mutar + `tpInvalidateCache()` +
  `_tpDebouncedPreview()`; `onchange` → `tpSave()`.
- **`tpAssignSchedule(items, workDays, {shuffle:false})`** para la vista previa (si no, los días
  bailan en cada tecla). **Nunca** llamarla sobre una semana ya publicada: baraja.
  `tpAssignSlotForItem(plan, item)` es lo que usa `tpAddToWeek` para ocupar el primer par libre.
- **El auto-plan ya NO acepta solo** (aceptar es lo que estampa `carryover` en `weekHistory`, y
  corría al cargar la página en cada dispositivo). Deja una propuesta con distintivo; su guard es
  `tpState.autoPlanLastRun` (sincronizado) y el dedupe mira cualquier plan de esa semana.
- **Deuda conocida**: `tpGenerateMonthly`, `tpRunSimulation` y `tpBuildRecoveryPlan` son copias
  cercanas del mismo lazo greedy y **no** conocen la cuota ni los filtros. La pantalla lo advierte.

## v18.1 — Almacenamiento local (`pnStorageScan`, `storageHousekeeping`)

El presupuesto es del **navegador** (~5 MB por origen) y lo comparte toda la app. **Firebase no lo
amplía**: la nube es la copia compartida, pero cada dispositivo trabaja primero contra su
localStorage. Confundir ambas cosas fue la duda del usuario cuando se llenó.

- **`pnStorageScan()` (panel.js) es LA definición** del uso de almacenamiento — todo consumidor
  nuevo debe llamarla en vez de recorrer `localStorage` por su cuenta. Antes había DOS lazos ad-hoc
  (panel y Centro de Reportes) que conocían 9 claves y metían el resto en un bucket ciego **"Otros"**;
  cuando el laboratorio se quedó sin espacio, "Otros" era el **90%** del uso y ninguna Herramienta de
  Limpieza lo tocaba.
- **`PN_STORAGE_REGISTRY` clasifica cada clave** en `core` (dato del laboratorio — nunca se ofrece
  para borrar), `cache` (se regenera solo; `pnReclaimSpace()` lo purga sin preguntar) y `review`
  (pesado y puede traer trabajo sin enviar — `pnStorageDeleteKey()`, uno por uno). **Toda clave
  nueva de localStorage agrega su entrada aquí**; sin ella cae en `review` y se lista con su nombre
  crudo.
- **Nunca guardar copias completas de `db`/`tpState`/`invState` en una lista.** Ese fue el bug:
  `kia_merge_history` guardaba 20 fusiones **cada una con un snapshot completo** (~500 KB → hasta
  10 MB) cuando `fbMergeUndo` solo lee el del último. `_fbMergeTrimHistory` conserva
  `FB_MERGE_SNAPSHOT_KEEP` (=1) y marca el resto `snapshotPurged`.
- **`storageHousekeeping()` (app.js) corre al inicio de `initializeSystem()`**, antes que nada: un
  localStorage lleno hace que todo lo de abajo falle en silencio. Purga snapshots de fusión
  ilegibles, borradores `kia_cop15_draft_*` caducados (la caducidad de 24 h de `v7RestoreDraft` solo
  se aplicaba **al abrir ese vehículo**, así que el borrador de un archivado no moría nunca) y
  `kia_fb_prerestore_snapshot` vencido (7 días; ahora sella `savedAt`).
- **Un `saveDB()` que devuelve `false` NO es cosmético.** `approveAndArchive`/`v7BatchRelease` lo
  ignoraban y seguían con `tpSave()`/`invSave()`, que escriben **claves distintas** y sí cabían: el
  plan quedaba marcado como cumplido y el gas descontado con el vehículo sin archivar. Todo código
  que escriba en varios módulos debe (1) llamar `_releasePreflightStorage(label[, bytes])` antes de
  mutar y (2) abortar la cascada si `saveDB()` devuelve `false`.

## v18.2 — Devolución al liberador + unidades de captura (`gasConvert`, `returnToReleaser`)

- **`gasConvert(v, from, to)` (app.js) es LA definición** de la conversión entre unidades de gas
  (base g/km; `g/mi` = 1/1.609344). Ante una unidad desconocida devuelve el valor **sin tocar**.
  `gasCaptureUnit(gas)` es LA forma de saber en qué unidad se teclea un gas.
- **`gas.captureUnit` es SOLO presentación.** El valor se guarda siempre en `gas.unit` (la del
  límite). `_libCollectGasValues` convierte en la frontera de lectura y `_libRenderGasEntry` en la
  de escritura — por eso comparación, PDF, SPC y CoP no cambiaron. **Todo código nuevo que lea un
  input de gas debe pasar por `_libCollectGasValues`**, nunca leer `input.value` directo. Un perfil
  sin `captureUnit` se comporta igual que antes de v18.2.
- **`_libNormalizeVal` usa cifras significativas (9), no decimales fijos.** Redondear a 3 decimales
  guardaba NOx `0.0013` como `0.001` y hacía que `0.0013` y `0.0014` se dieran por coincidentes en
  el doble ciego. No volver a redondear a decimales fijos: los gases viven en 1e-3 g/km.
- **No forzar mayúsculas en `gas.field`.** Los valores de cada vehículo están indexados por esa
  clave exacta (`NOx`), así que normalizarla a `NOX` deja huérfano el histórico.
- **`showModal` soporta `body` (HTML) + `buttons` (lista propia)** además de `message`/`confirmText`.
  El editor de Regulaciones ya llamaba con esa forma y salía **vacío** — el modal era inusable.
  Los llamadores cierran con `document.getElementById('globalModal').style.display='none'`; el
  overlay lleva ese id y se completa el cierre tras el `onclick`.
- **`returnToReleaser()`** (cop15.js) devuelve `pending-approval` → `ready-release`, borra
  `gasResults.liberador` y `signatures.releaser`, exige motivo ≥5 chars, y escribe
  `returnHistory[]` (permanente) + `pendingReturn` (aviso, se borra al reenviar). **El motivo no
  debe contener los valores del aprobador** — la UI lo advierte, porque dictarlos anula el doble
  ciego.

## v18.5 — Permisos de usuario (`_pnEnsureAdminExists`, `_authNormalizeRole`)

- **`AUTH_ROLE_PERMS` (auth.js) es LA definición de permisos** y los roles son fijos (no hay
  permisos sueltos por persona). Las competencias certificadas otorgan permisos extra vía
  `grants`/`minLvl` del catálogo (`_authSkillGrants`) — esa es la única vía de ajuste fino.
- **Nunca comparar `op.role` contra el mapa directo.** `_authNormalizeRole(role)` es LA forma de
  empatar un rol (ignora mayúsculas, acentos y espacios) y `authRoleHas(role, perm)` la de
  preguntar sin sesión de por medio. El lookup literal dejaba a `'SUPERVISOR'` o `' Supervisor'`
  con **cero permisos en silencio**.
- **El laboratorio nunca debe quedar sin alguien con `users.manage`.** `_pnEnsureAdminExists()`
  (final de `pnInit`, que corre **antes** de `authInit`) lo garantiza: era un candado circular —
  todos nacen `Técnico`, pero cambiar un rol exige `users.manage`, así que nadie podía otorgar el
  permiso para otorgar permisos (issues #100/#103/#105). Es idempotente.
- **`authState.currentUser.role` es una COPIA** tomada al iniciar sesión. Todo código que cambie un
  rol debe llamar **`authRefreshCurrentRole()`** (lo hace `pnOpUpdate`), o el cambio no aplica hasta
  recargar. Y `can()` en el componente Alpine lee `_dataVersion` para que los `:disabled` se
  reevalúen.
- **El candado va en la capa de datos, no solo en la vista.** `pnOpAdd/Update/SetActive/Delete/
  UpdateProfile/SetSkill` llevan su propio `authRequire`; ocultar el botón es UX, no seguridad.
- **Nunca meter objetos de Alpine en `pnState`.** `_syncAndSave` hacía `pnState.operators =
  this.operators`, metiendo el Proxy reactivo: a partir de ahí las reasignaciones dejaban de
  disparar repintado (**sin lanzar errores**) y `pnSave` serializaba los hashes de PIN a través del
  proxy. Los `pnOp*` mutan `pnState` directamente; lo que venga de Alpine se desenvuelve primero.
- **La identidad de un operador es su `id`.** El merge de sync clava por id (antes `id|nombre`, y
  `'Jorge Nuñez'` vs `'Jorge Núñez'` sobrevivían duplicados mientras la sesión tomaba el primero);
  `_pnDedupeOperators()` repara los duplicados al arrancar, conservando PIN y competencias.

## v19.0 — CoP: tablero de conformidad (`js/cop_validator.js`)

El módulo pasó de calculadora de una familia a tablero con 4 vistas
(`copState.view`: `overview` | `validator` | `spc` | `dossier`; arranca en `overview`).

- **`copInScope(cfgOrVehicle)` es LA definición del alcance CoP** y todo filtra por ahí.
  `COP_SCOPE_DEFAULT` = EURO-5 / EURO-6E / PRE-EURO 7 en EUROPE y MIDDLE EAST (45 de las 173
  configuraciones). Esto **tapa un agujero real**: `COP_PI_LIMITS` tiene los límites Euro 6
  escritos a fuego y nunca consulta `getRegulationProfile()`; fuera del alcance eso juzgaba mal
  65 configuraciones (EURO-2/EURO-4 demasiado estricto; **SULEV 30 en g/km contra datos en
  g/mi**, que puede aprobar lo que falla). Dentro del alcance las tres normas comparten los
  mismos valores, así que no cambia ningún veredicto. **`copLimitsForFamily()` lo verifica en
  cada render** — si mañana entra una norma nueva al alcance, avisa en vez de juzgar mal en
  silencio. Lo que queda fuera **se declara** (`copOutOfScopeSummary()`), nunca se oculta.
- **El SPC NO se acota al alcance a propósito**: es control de proceso, no conformidad.
  `copSpcScanAlarms()` barre TODO (el Panel depende de esas alarmas) y marca cada una con
  `inScope`; `copSpcFamilies(opts)` sí filtra salvo `opts.allScopes`.
- **`copPortfolioRows()` es LA definición** del estado CoP de todas las familias — todo
  consumidor nuevo la llama en vez de recalcular. Une plan (`copFamilies`) + probado
  (`copSpcFamilies`), y **compone** `copCalcStats`/`copSpcStats`/`copSpcFlags`/`tpBuildFamilies`
  sin agregar matemática. **Memoizada obligatoriamente** (`_copRev`, `copInvalidateCache()`):
  `pnGetActiveAlerts` corre en cada render del Panel.
- **`copFamilyRisk(row)` es LA definición del semáforo y es PURA** (recibe la fila; testeable sin
  DOM). Es un **aviso interno anticipado, nunca un veredicto regulatorio**, y la UI lo dice con
  esas palabras. Con `n < 3` devuelve `sin-datos`, **jamás verde**. Margen delgado con veredicto
  PASS es ámbar, no rojo.
- **Mesa de trabajo por familia**: `copState.families[key]`. `copState.vehicles` sigue siendo un
  **alias vivo** del array de la familia abierta. **REGLA: nunca escribir `copState.vehicles = …`
  directo — siempre `_copSetVehicles(arr)`**, que es el único punto de reasignación y sella
  `updatedAt`. Al abrir una familia sin mesa guardada hay que **arrancar en limpio** o hereda los
  VINes de la anterior.
- **`copSyncVinsFromTests(key)` fusiona, no reemplaza**: filas manuales intactas y **una celda con
  valor NO se sobrescribe jamás** — se marca `staleAuto` y se ofrece `copAcceptLabValues(id)`.
- **Los juicios CONGELAN** límites, A(n)/B(n), estadística por contaminante, operador y
  `appVersion`: sin eso un registro deja de ser reproducible cuando cambia un perfil, y por tanto
  deja de ser evidencia. `_copTrimSaved()` **compacta en vez de borrar** (patrón `snapshotPurged`
  de v18.1) y nunca toca el juicio vigente de una familia.
- **`copFamilyHistory(key)` / `copVerdictAt(key, iso)` DERIVAN**, no guardan (patrón
  `pnProjectTimeline`). Un mes sin juicio se pinta **gris, nunca verde por omisión**.
- **Sync**: la rama `cop` de `fbPullApply` tomaba `remoteData` entero — `view`/`region`/
  `familyKey`/`vehicles`/`spc`/`present` son **estado de UI por dispositivo** y ahora gana el
  local (antes la pantalla saltaba porque otro técnico tocó la suya). `_fbMergeCopFamilies`
  fusiona por clave (gana `updatedAt`) uniendo VINes, y **renumera siempre** las filas.
- **CSS**: 82 clases `.cop-*` (antes CERO — era 100% `style=""` en línea). Modo presentación con
  alcance a **`body.cop-present`**: nunca subir la escala global. Migración de estilos en línea
  deliberadamente parcial — código nuevo con clases, lo viejo se convierte oportunísticamente.
- **`copFamilyPDF()`** separa **procedimiento** (R154/R83) de **norma de emisiones** (son dos
  cosas distintas) y sale marcado **PRELIMINAR** si no hay juicio guardado.
- **Ojo**: `undoPush('cop', …)` es un **no-op** — `undoPush` (app.js) solo conoce
  `cop15`/`testplan`/`inventory`. No llamarlo desde el CoP creyendo que hace algo.
## v19.1 — Familias de interpolación del WVTA (`js/homolog.js`)

`homoState.ipFamilies` = `[{id, code, members:[{variant,version}], tml, tmh, co2Low, co2High,
wvta, wvtaDate, type, commercialName, updatedAt}]`.

- **REGLA QUE NO SE ROMPE: f0/f1/f2 vienen del ICMS (`homoState.catalog`), NUNCA del WVTA.**
  El certificado sí los trae, pero solo los de los vehículos extremos **VL y VH** que acotan la
  familia — no los del vehículo que se va a ensayar, que salen de interpolar entre ambos, que es
  justo lo que el ICMS entrega ya resuelto por MC code. Por eso `ipFamilies` **no tiene campos
  f0/f1/f2** y no se le deben agregar. Del WVTA salen: identidad de la familia, miembros,
  TML/TMH y el rango de CO₂ VL–VH.
- **`homoIpFamilyForVehicle(v)` es LA definición** de la resolución: sello explícito
  (`vehicle.homolog.ipFamilyId`) → variante + versión → las del catálogo ICMS por MC code →
  variante sola **solo si no es ambigua** → `null`. **La variante sola NO basta**: en un
  certificado real `B5P22` está en dos familias según su versión. Ante ambigüedad devuelve
  `null`, no adivina. Solo resuelve para región Europa (`homoIsEurope`).
- **`homoIpParseWVTA(text)` es PURA** (sin DOM, testeable en Node) y lee el texto pegado del PDF.
  Dos rarezas del formato ya resueltas: los códigos se **parten entre renglones**
  (`IP-0401789-` / `3KP`, lo repara `_homoWvtaJoinSplitCodes`) y el encabezado de columnas del
  bloque 3.1 **no siempre se llama igual** (`Interpolation family` en una página, `Version(s)` en
  la siguiente), así que se toma como encabezado cualquier renglón con códigos IP que no sea el
  `IP Family` del bloque 0.2.3.1.
- **`homoIpMassCheck`/`homoIpCo2Check`/`homoIpScanOutliers`**: rango del WVTA contra valor del
  ICMS. Un vehículo fuera de rango es un problema de **evidencia**, no de emisiones — entra como
  motivo de atención en el Panorama y **no toca el veredicto**.
- **La clave de agrupación del CoP NO cambia**: sigue siendo `copVehicleFamilyKey`, que es la
  identidad de las series SPC y de todos los juicios guardados. `row.ipFamilies` es informativo.
  Si alguna vez se agrupa por IP, debe ir **encima** con prefijo `IP:`, nunca reemplazándola.
- **Sync**: `_mergedHomo` en `fbPullApply` se arma **desde cero**, así que toda clave nueva de
  `homoState` debe listarse ahí o se pierde en cada pull. `ipFamilies` mergea por código
  (gana `updatedAt`).
- **UI**: tras cambiar familias hay que llamar `_homoIpRepaint()`
  (`tabCacheInvalidate('pn','pn-homolog')` + `pnRender()`) — las pestañas del Panel están
  cacheadas y `pnRender()` solo no repinta la pestaña actual (patrón `_pnProjNav`, v16.8).

## v20.0 — Planificador semanal: overhaul (`js/testplan.js`, `js/app.js`)

El módulo pasó de un formulario de 223 líneas de `innerHTML` a un tablero por día. Dos
definiciones nuevas son la columna vertebral (mismo patrón que `copPortfolioRows`/`copFamilyRisk`
de v19):

- **`tpWeekBoardRows(opts)` es LA definición del estado de la semana** — plan + soak resuelto +
  vehículos de COP15 + `testedList` + riesgo. **Memoizada obligatoriamente** (`_tpBoardCache`,
  `tpBoardInvalidate()`, encadenada a `tpInvalidateCache()`): la lee HOY en cada render. Todo
  consumidor nuevo la llama en vez de rebuscar en `tpState.weeklyPlans`. Ya migrados:
  `dashCollectActivities` (app.js), `pnGetActiveAlerts`, `renderLabOverview`, `_pnReportWeeklyPlan`
  y el resumen de turno (panel.js) — todos leían `weeklyPlans[length-1]`, el último plan **creado**,
  que puede ser el de la semana que entra.
- **`tpWeekItemRisk(row, ctx)` es LA definición del semáforo de UNA prueba y es PURA** (recibe la
  fila; testeable en Node). Sin día asignado devuelve `atencion`, **jamás verde**. Es un aviso
  interno anticipado, no un juicio, y la UI lo dice con esas palabras.

### Modelo de días — reposo real, no un supuesto

- **`tpSoakHoursFor(cfg)` es LA definición de cuánto reposa una config** (familia → norma →
  laboratorio) y devuelve la procedencia, como `ruleInfo._matchType`. Vive en `tpState.soak`,
  **NO en `DEFAULT_REGULATION_PROFILES`**: esos perfiles son evidencia de emisiones (los congela
  cada juicio CoP) y el soak es ocupación de celda — mezclarlos invitaría a editar un perfil
  regulatorio para arreglar un calendario.
- `tpSlotsForSoak(horas, workDays)` reemplaza al motor que exigía días **consecutivos**
  (`dayOrder[i+1]`) asumiendo 12 h, cuando el default real de la app es **24 h**. Desfase =
  `Math.max(1, ceil(h/24))`. Lo que se derrama a la semana siguiente sale con `spillsNextWeek` y
  **se declara**, no se pierde. **`tpBuildTestSlots` queda como shim** sobre el soak default, así
  que Mes/Simulador/Recuperación heredan el modelo nuevo gratis y **con 24 h la salida es idéntica
  a la de v19**.
- **NO hay opción de "prohibir que repose el fin de semana"**: la semana se modela como un arreglo
  dom→sáb, así que un día intermedio de fin de semana exigiría preacondicionar antes del sábado y
  probar después del domingo — los dos extremos del arreglo. Es imposible por construcción. Una
  perilla que nunca puede hacer nada es peor que no tenerla.

### Ciclo de vida del plan

- **`tpPlanId(plan)` es la identidad; `weekNum` era un ÍNDICE DE ARRAY.** Tras un splice el
  histórico dejaba de corresponder. `tpMigrateWeekHistoryIds()` migra una sola vez (guarda en
  `tpState._migr.weekIds`, **preservado en `_fbPullSeed`** junto con `soak`), **deduplica** el daño
  de los dobles-aceptar y conserva como `orphan` lo que ya no tiene plan vivo — **no se tira**.
- `tpAcceptWeeklyPlan` es **idempotente**. `tpSyncWeekHistoryFor(planId)` re-sincroniza la foto
  archivada desde el plan vivo (antes se congelaba en `completed:false` para siempre). **Todo
  mutador del plan pasa por `_tpTouchPlan(weekIdx)`** — un helper único es lo que evita que se
  olvide uno.
- `tpUnacceptWeeklyPlan` / `tpDeleteWeeklyPlan` con `undoPush('testplan', …)` + `auditLog` +
  `authRequire('plan.manage')`. Borrar **se niega** sobre una semana aceptada.
- **`undoPush('tp', …)` es un no-op** — `undoPush` (app.js) solo conoce `cop15`/`testplan`/
  `inventory`. Siempre `'testplan'`. (La misma trampa que CLAUDE.md registra del CoP.)
- El merge de `weeklyPlans` en `firebase-sync.js` empataba por **`w.week`, campo que ningún
  generador escribe**: todos los planes colapsaban en un bucket. Ahora `tpPlanId`, con los items
  empatados por `desc + testDay` y `completed:true` ganando.

### La palomita manual

- `tpToggleWeeklyItem` escribe en `testedList` con `source:'plan-manual'`, `verified:false`,
  `planId` e `itemIdx`. **`verified` es OPT-OUT: su ausencia significa verificada** — así las ~500
  filas existentes no necesitan migración y un pull desde código viejo no las degrada.
- **Despalomear empata por `planId + itemIdx`, NUNCA por `desc`**: dos semanas comparten
  descripción.
- `tpAutoFeedFromRelease` **asciende** la declarada (la retira al llegar la liberación real): era
  un marcador de posición, no una segunda prueba.
- **`tpCoverageSummary()` sigue siendo LA definición** y solo se le AGREGARON `totalVerified`,
  `totalDeclared`, `okVerified`, `pctVerified`. `pct` y `deficit` **siguen contando las
  declaradas** —si no bajaran el déficit, la config volvería la semana siguiente y la palomita
  sería inútil— pero el número solo-verificadas va **al lado, siempre visible**.
- `tpGetAnalysis` devuelve además `testedVerified`/`testedDeclared`, y **su clave de cache incluye
  `_lastSave`**: quitar y agregar una prueba el mismo día la dejaba idéntica.

### Mover y sustituir

- **`tpMoveItemToDay(weekIdx, itemIdx, day, opts)`** — no existía NINGUNA función que cambiara el
  día de una prueba. Deriva el preacondicionamiento legal con `tpSlotsForSoak` y, si no hay
  ninguno, **rechaza con el motivo escrito**. Sobrecupo se consiente y queda **marcado**
  (`item.overCapacity`).
- **`plannedTestDay` es una SOMBRA**: se estampa una vez y jamás se reescribe. **"Movida" se
  DERIVA** (`tpItemMoved`), sin bandera que mantener sincronizada. `moves[]` es append-only, tope
  10. `soakHours`/`soakSource` se **congelan** al mover: si cambia la tabla, un plan publicado no
  debe empezar a mentir.
- **`tpSubstituteCandidatesFor(item)` / `tpSwapItemConfig`** son la dirección que faltaba ("el
  vehículo no llegó, ¿qué corro en su lugar?"). Reusan las MISMAS `_tpCoreFields`/`_tpFlexFields`
  que la liberación, así que las dos direcciones no se pueden desincronizar. **Sustituir NO marca
  como hecha** (`tpSubstituteItem`, que sí acredita, sigue siendo lo de la cascada de liberación —
  son dos cosas distintas y se quedan separadas).

### Enfoque de la semana

- **`tpSetFocus(key)` SUBE `weights.region` y redistribuye.** `tpState.weights.region` puede quedar
  legítimamente en **0** (la migración de arranque lo pone así) y con region=0 los 10 sliders de
  prioridad por región **no hacen absolutamente nada**: un chip que solo tocara `regionPriority`
  sería decorativo. Cuando el peso está en 0, la pantalla **lo dice**.
- `tpCurrentFocus()` **deriva** qué chip está activo; no hay bandera guardada. `⚙️ A medida` pasa
  `opts.openRegions` a `tpBuildPriorityKnobsHTML`, que ya lo aceptaba desde v18 sin que nadie se lo
  pasara.

### `gridDragInit` — un solo motor de arrastre + teclado (app.js)

Generaliza `invInitZoneDrag` (v16.5) con su alternativa de teclado (v17.8); `invInitZoneDrag` queda
como envoltura y `_invDrag`/`_invKbdMove` se mudaron a `_gridDrag`/`_gridKbd`.

- **El origen tiene que ser un `<button>`**: Enter/Espacio disparan un `click` con `detail === 0`
  (un clic real siempre trae `detail ≥ 1`). Ése es el truco que distingue teclado de tap. La
  tarjeta del tablero no puede serlo (contiene botones): el origen es el asa `.tp-week-grip`.
- **Origen y destino pueden ANIDAR** (el asa vive dentro de la columna) → `stopPropagation()` en
  `onPointerDown` y en el handler de teclado, o el mismo gesto se procesa dos veces y se cancela
  solo.
- La clase de selección viaja **con la selección** (`_gridKbd.cls`): listarlas en `gridKbdCancel`
  dejaba la marca pegada.
- `itemSelector` puede ser una LISTA separada por comas → pasar `refocusSelector` para el foco
  post-movimiento (`.a, .b[attr]` sólo filtra el último).
- Listeners de movimiento en `document` (si no, el arrastre se corta al salir del elemento);
  `touchmove` con `{passive:false}` (único modo en que `preventDefault` frena el scroll).

### Blindaje de `tpState` (v20, etapa 0)

**`_tpEnsureState()` corre al parsear testplan.js y repara `weights`, `rules`, `planData` y demás.**
`let tpState = safeParse(...) || {defaults}` hacía que los defaults **solo aplicaran en un
dispositivo virgen**: un pull de sync sin esos campos reventaba `tpPriorityScore` →
`tpGetAnalysis` → `tpCoverageSummary` → `tpUpdateBadges` → **`switchPlatform`**, o sea la
plataforma entera. Reproducido y corregido.

### Deuda conocida (heredada de v18.0)

`tpGenerateMonthly`, `tpRunSimulation` y `tpBuildRecoveryPlan` son copias cercanas del mismo lazo
greedy y **no** conocen la cuota ni los filtros. En Recuperación, `effCap` ya no ignora `slots`
(agendaba el doble), pero el lazo sigue duplicado.

## v20.1 — Mi semana: repetir, agregar y vincular (`js/testplan.js`)

- **Dos vehículos IDÉNTICOS en la misma semana estaban bloqueados en CUATRO sitios**: el Set
  `used` de `tpSelectWeeklyItems`, el `.includes()` de `tpAddManualPick`, el filtro del
  desplegable de `tpAddToWeek`, y —el peor— `tpWeekBoardRows`, que apuntaba las dos filas al
  MISMO vehículo. **Regla:** el generador AUTOMÁTICO sigue sin repetir por su cuenta (gasta
  capacidad que el déficit necesita); lo que se pide a mano SÍ se repite. `take()` recibe
  `allowRepeat` y sólo las obligatorias lo pasan.
- **`tpAddItemToWeekDay(weekIdx, desc, day, opts)` es LA definición de agregar una prueba al
  plan** desde el tablero — no filtra duplicados a propósito. `tpDuplicateItem` es el atajo
  ("⧉ Otra unidad igual"). Todo consumidor nuevo llama a `tpAddItemToWeekDay`, no empuja a
  `plan.items` directo (se perdería el soak congelado, el par legal y la auditoría).
- **`tpWeekBoardRows` REPARTE los vehículos** (`_usados`): cada vehículo acredita a lo sumo
  una fila. Las repetidas se numeran `dupIdx`/`dupTotal`.
- **`row.vehicle` sigue significando "vivo, en curso"** (de eso dependen el semáforo y la
  ETA); **`row.vehicleAny` es el vehículo RESUELTO**, archivado incluido. Con dos pruebas
  idénticas la segunda suele quedar cubierta por uno ya liberado y sin `vehicleAny` la
  tarjeta se veía vacía. Código nuevo que quiera "¿tiene vehículo?" usa `vehicleAny`.
- **`tpLinkableVehiclesFor` / `tpLinkVehicleToItem` / `tpUnlinkVehicleFromItem`** — el
  respaldo manual de `tpAutoFeedFromRelease`, que sólo acredita con `configCode` EXACTO y
  alta desde el plan. **Vincular es lo contrario de declarar**: si la fila venía declarada a
  mano se asciende y su placeholder se retira; si la configuración difiere se registra como
  SUSTITUCIÓN con diffs, nunca como si se hubiera corrido lo planeado. `item.linkedVehicleId`
  manda sobre la resolución automática. Desvincular NO borra la evidencia de `testedList`.
- **`TP_SUBST_SCOPES` (familia | norma | region) es LA definición de los alcances de
  sustitución.** Fuera de `familia` las diferencias se listan sobre `_tpCoreFields` TAMBIÉN
  (lo que cambia puede ser el motor), las candidatas que rompen el núcleo se marcan
  `breaksCore` y van al final, y **el nivel se GRABA en `substitution.scope`**: una
  sustitución "misma región" no es lo mismo que una equivalente.
- **El chip "↪ movida" NO se pinta en la tarjeta.** Que el plan se reacomode es normal, no una
  excepción que señalar a diario. El dato vive en `moves[]`, la auditoría, el menú ⋯ y el
  `title` del asa. No volver a agregarlo a `marcas`.

## v21.1 — Nivel absoluto, un solo umbral, y la gasolina en la nube

- **`invGasLevel(g)` es LA definición del nivel y es ABSOLUTA**: el % va contra la presión
  nominal (`g.initialPsi` si está declarada, si no el **máximo histórico**), no contra
  `readings[0]`. Antes el % dependía de en qué estado se tomó la PRIMERA lectura: un
  cilindro al 13% real se reportaba al 63% y en verde. Devuelve
  `{pct, psi, nominal, status:'sinlecturas'|'critico'|'bajo'|'ok', text, color, bg}` —
  `color` es texto/relleno y `bg` el tinte; **no concatenar alfa a mano** (`color + '20'`
  reventaba en cuanto los colores pasaron a ser tokens).
- **`invGasIsLow(g)` es LA definición de "¿está bajo?"** y `INV_LEVEL_CRITICAL_PCT` /
  `INV_LEVEL_LOW_PCT` los únicos umbrales. Había **cinco criterios en conflicto** (15/30 en
  invGasLevel, 25/50 en `_invCylColor`, <20 en el dashboard, <10 en alertas proactivas, <15
  en HOY) más **PSI absolutos** (200/500) en `pnGetActiveAlerts` y en las alertas de app.js.
  Todo consumidor nuevo llama a estas dos, nunca compara PSI por su cuenta.
  **`reorderPSI`/`criticalPSI` ya no se usan en ningún lado** — nunca se escribieron.
- **`invGasBurnRate(g)` es LA definición del ritmo de consumo de UN cilindro** (diario,
  semanal, días a nivel bajo), calculada de sus lecturas **humanas** y descartando los tramos
  donde la presión sube (una recarga no es consumo negativo). Reemplaza a `weeklyPsi`/
  `dailyPsi`/`reposDays`/`limitPsi`, que venían en la semilla y **nunca se recalculaban**.
  No confundir con `invCalcConsumptionRates`, que es el consumo por TIPO DE PRUEBA.
- `initialPsi` por fin se escribe (campo opcional en el alta). Sin él nada se rompe: la
  nominal cae al máximo histórico.

### ⛽ El combustible en `firebase-sync.js`

- **`fuelTanks` no aparecía NI UNA VEZ en ese archivo.** Los tanques ahora entran a
  `_fbAnalyzeMerge` (`newFuelTanks` / `fuelUpdates`), al merge, a `hasWork` y al
  **`_fbPullLocalScore`** — sin lo último, un dispositivo cuyo único dato nuevo eran lecturas
  de gasolina puntuaba 0 y `_fbPullSeed` lo reemplazaba entero.
- **`_fbPullSeed` preserva subcampos locales de inventario** (`fuelTanks`, `assets`,
  `maintActivities`, `maintLog`, `consumption`, `f11Seed`) que un remoto de código viejo no
  trae — mismo patrón que ya tenía `testplan`. Toda clave nueva de `invState` debe listarse
  ahí o se pierde en cada pull.
- **`_fbMergeReadings(locales, remotas)` une series sin perder lecturas.** El conflicto de un
  cilindro hacía `invState.gases[idx] = c.remote`, tirando lo capturado en este dispositivo.
  Regla: una fecha aparece una sola vez, gana la **humana** sobre la `auto:true`, y entre dos
  humanas gana la **local**. El nivel autoritativo del tanque se recalcula de la última
  lectura de la serie ya unida.
- La `regulation` del tanque es un **selector** (`_invRegulationSelectHTML`), no texto libre:
  es la llave con la que `invLogTestUsage` decide de qué tanque descontar. Conserva como
  opción el valor heredado para no perder de vista uno que no empate con ningún perfil.

## v21.0 — El motor único de captura de lecturas (`js/inventory.js`)

- **`invAddReading(gasId, psi, opts)` e `invAddFuelReading(tankId, level, opts)` son LA
  definición de registrar una lectura.** Validan, deduplican por fecha, atribuyen operador
  (`by`), guardan, auditan, **reentrenan el modelo de consumo** y publican a la nube.
  **Nunca volver a empujar a `readings[]` directo** — había CUATRO caminos de gas y DOS de
  combustible haciéndolo, con tres políticas de deduplicación distintas y solo uno de los
  cuatro reentrenando el modelo. `opts`: `{date, by, source, silent, skipSave}`; devuelve
  `{ok, reading, replaced, warning}` o `{ok:false, reason}`.
- **Un cilindro/tanque tiene A LO MÁS una lectura HUMANA por fecha.** `invFindReadingOn`
  ignora a propósito las `auto:true` (puede haber varias por día, una por prueba corrida) y
  `_invDropAutoReadingsOn` las retira cuando llega la medición real: el manómetro manda
  sobre la estimación.
- **La auto-deducción por prueba (`invLogTestUsage`) NO pasa por el motor, y así debe
  quedarse**: sus filas llevan `auto:true`, que es lo que hace que `invCalcConsumptionRates`
  las excluya (`!r.auto`) y no envenene el aprendizaje con caídas sintéticas.
- **`invReadingWarning` / `invFuelReadingWarning` son PURAS** (sin DOM, testeables en Node) y
  **avisan sin bloquear**, igual que `GAS_PLAUSIBLE_BOUNDS` en la liberación. La nominal sale
  del **máximo histórico**, nunca de `readings[0]`: un cilindro estrenado a media carga hacía
  ver imposible toda recarga legítima (es el mismo defecto que `invGasLevel` sigue teniendo al
  medir el % contra la primera lectura — ahí no se corrigió).
- `invAddReading` **ordena `readings[]` por fecha** tras insertar: el orden cronológico es un
  supuesto de `invGasLevel`, del EWMA y de las gráficas, y la captura retrofechada lo rompería.

### La ronda (`invStartReadingRound`)

- **Nunca había corrido**: filtraba `status === 'active'`, estado que la app no escribe (los
  reales son `Stock|In use|Empty|Spare`), y guardaba un esquema **sin campo `date`** que
  habría reventado `invCalcConsumptionRates` (`a.date.localeCompare`), el nivel, HOY y las
  gráficas. Si se toca este código, **el filtro correcto es `status !== 'Empty'`** (el mismo
  que la pestaña Captura) y **se escribe por el motor**, nunca a mano.
- **`invRoundItems()` es LA definición de los puntos del recorrido**: gases ordenados por
  zona con `localeCompare(..., {numeric:true})` (para que A10 vaya después de A02) y el
  combustible al final. El orden en pantalla es el orden de la caminata.
- El avance vive en `kia_inv_round` (registrado en `PN_STORAGE_REGISTRY` como **`core`**: es
  trabajo del turno sin guardar). `_invRoundCancel` **conserva** la llave para poder retomar;
  solo `invRoundFinish` la limpia.
- La ronda escribe con `skipSave:true` y guarda **una sola vez** al final.

### Fase 2 — captura desde donde estés

- La fila `act-gasread` de HOY (`app.js:dashCollectActivities`) lanza la ronda directo; la
  retícula queda como `action2`. La app abre en HOY, así que es un toque hasta capturar.
- La retícula tiene **fecha de lote** (`#inv-capture-date`): retrofechar es el caso normal de
  quien pasa lo anotado en papel.
- **`invReadingStatusToday` busca la lectura de hoy en TODA la serie**, no solo en la última
  — con captura retrofechada la última puede ser de otro día y el contador se quedaba corto.
- Las superficies de captura salieron del **tema oscuro de v15.5** (`#0f172a`/`#1e293b`) a los
  tokens y a las utilidades `u-*`. No volver a propagar hex oscuros en este módulo.

## v20.10 — Una semana, un plan (el Gantt contaba doble)

- **`tpState.weeklyPlans` puede tener VARIOS planes de la misma `weekDate`** — cada
  "Generar" empuja uno nuevo, así que lo normal es el aceptado + N propuestas viejas.
  Todo consumidor que agregue por semana debe resolver el **plan vigente** primero:
  el/los `accepted`, y si no hay ninguno, la propuesta con `created` más reciente.
  `tpFamilyWeeklyProgress` ya lo hace y devuelve `proposal:true` cuando la semana no
  tiene plan aceptado. Antes devolvía **una fila por plan**, así que el Gantt pintaba
  la última (`byWeek[weekDate]` se sobrescribe) pero sumaba todas en el total.
- **`tpDeleteWeeklyPlan` ya está expuesta** (🗑 por propuesta en `tpBuildWeekIndexHTML`).
  Existía desde v20 sin ninguna UI que la llamara. Los planes aceptados no llevan botón:
  la función ya redirigía a desaceptar primero, y esa validación se respeta en la vista.
- Las filas de `tpBuildWeekIndexHTML` pasaron de `<button>` a `<div onclick>` porque
  llevan un `<button>` anidado — mismo patrón (y misma razón) que `_copFamCardHTML` en
  v20.5, con `a11yClickables(el)` al final de `tpRenderWeekly` para el teclado.

## v20.9 — El REQ es de la familia, por lotes de producción

- **`tpFamilyRequired(vol)` (testplan.js) es LA definición del REQ de una familia** y todo
  consumidor nuevo debe llamarla en vez de sumar el REQ de las configuraciones. Regla:
  `TP_COP_LOT_TESTS` (3) ensayos por cada `TP_COP_LOT_UNITS` (5 000) unidades, con el
  escalón corrido `TP_COP_LOT_ROLLOVER` (2 500) hacia atrás — **no es `ceil(vol/5000)`**:
  el segundo lote entra al SUPERAR 7 501, no al pasar 5 000. `≤7 500 → 3 · 7 501–12 500 → 6`.
  Volumen 0 → 0 (misma regla que `tpCalcRequired`).
- **`tpCalcRequired` (por configuración) NO fue reemplazada** — son dos preguntas distintas
  y deben seguir separadas: cuántos ensayos exige la norma (familia, `f.totalRequired`) y
  qué variante conviene correr (configuración, `configs[].required`, lo que lee el
  planificador semanal vía `tpGetAnalysis`). La suma por variante se conserva en
  `f.configRequiredSum` — si algún consumidor viejo la necesitaba, está ahí.
- **`f.activeVol`** es el volumen que cuenta para el REQ: excluye las configuraciones
  `paused`, igual que ya hacía el REQ por configuración. Toda regla nueva de volumen a
  nivel familia debe usarlo, no `totalVol + totalHist` (que incluye pausadas).
- `f.coverage` se acota a 1: con el REQ de familia es normal correr de más.
- **`tpCoverageSummary()` sigue siendo otra cosa y NO cambió**: mide configuraciones
  vigentes con su REQ *por configuración* cumplido. No intentar reconciliar los dos números
  — miden unidades distintas a propósito.

## v20.8 — La carrocería es familia, y el candado de vinculación

- **`tpFamilyKeyForCfg` tiene 8 segmentos, no 7** — `body` entró a la identidad:
  `mod|eng|tx|my|reg|ep|engpkg|body`. Una 5DR y una WGN **no se prueban juntas**, así que
  son familias distintas con contador, tarjeta y veredicto propios. `tpBuildFamilies` ya
  no duplica la fórmula: llama a `tpFamilyKeyForCfg`. `copVehicleFamilyKey` (que replica
  la clave desde los headers crudos de `v.config`) suma `BODY TYPE` — **las dos definiciones
  tienen que cambiar juntas o las series SPC dejan de empatar con el plan.**
- **`_tpMigrateFamilyKeysBody()` (testplan.js) remapea lo guardado con clave vieja**
  (`familyOverrides`, `soak.byFamily`) duplicándolo a cada carrocería que esa familia
  agrupaba en el catálogo. Solo actúa sobre claves de 7 segmentos, así que es idempotente
  y **corre en `_tpEnsureState()` Y al principio de `tpBuildFamilies()`**: un pull de sync
  desde un dispositivo sin actualizar puede reintroducir claves viejas en cualquier momento.
- **Los juicios CoP guardados NUNCA se reescriben** — son evidencia congelada. Se empatan
  por prefijo con **`_copJudgmentMatchesFamily(j, key)`** (el juicio de la familia combinada
  cubría ambas carrocerías, así que sale en la historia de las dos). Todo consumidor nuevo
  de `copState.saved` debe usarla en vez de `j.familyKey === key`. Ya migrados:
  `copPortfolioRows`, `copFamilyHistory`, `copVerdictAt`.
- Las **mesas de trabajo** (`copState.families`) solo se adoptan a la clave nueva si la
  familia tenía UNA sola carrocería; con varias se quedan con la clave vieja, inofensivas —
  los VINes capturados son de una carrocería concreta y repartirlos sería inventar.
  `ovHidden` sí se duplica a todas: ocultar era una intención sobre el grupo entero.
- **`_copFamilyEmissionReg` lee `parts[4]`** (índice desde el inicio), así que sobrevivió al
  cambio. Cualquier parseo nuevo de la clave debe indexar desde el inicio, nunca desde el final.

### 🔒 Un vehículo acredita UNA prueba

- **`_tpVehicleLinksElsewhere(excludeItem)` es LA definición de "qué vehículos ya están
  vinculados"** y barre **TODOS** los `tpState.weeklyPlans`, no solo la semana abierta —
  ese era el bug: el mismo VIN se vinculaba otra vez en otra semana sin ningún aviso.
  La usan `tpLinkableVehiclesFor` (para no ofrecerlo), `tpLinkVehicleToItem` (para
  rechazarlo, diciendo en qué semana está) y `tpWeekBoardRows` (para reservarlo).
- **Un archivado solo respalda una fila YA completada** (`tpWeekBoardRows`): un liberado es
  una prueba que ocurrió, y si esta fila fuera esa prueba estaría marcada
  (`tpAutoMarkWeeklyCompletion` la marca al liberar). Prestárselo a una fila pendiente
  pintaba el mismo VIN "liberado" en dos semanas con una sola prueba real.
- Los vínculos explícitos se **reservan antes** de resolver ninguna fila: si no, una fila
  auto-resuelta que se procesa primero le gana el vehículo a una vinculada a mano.
- El candado impide el **descuido**, no el caso legítimo: dos pruebas que de verdad
  necesitan el mismo VIN se logran desvinculando la anterior primero.

## v20.5 — Panorama: ocultar familias y Gantt de progreso semanal

- **`copState.ovHidden`** = `{familyKey: true}`, estado de UI POR DISPOSITIVO (se agregó a la
  misma lista de exclusión de `fbPullApply` que `view`/`region`/`ovFilter`/`spc` — v19.0: "gana
  el local"). `copHideFamily`/`copShowFamily`/`copShowAllFamilies` son los únicos mutadores.
  **Ocultar es declutter de la lectura, NUNCA del tracking**: `copPortfolioRows()` (KPIs,
  `pnGetActiveAlerts`, SPC) sigue viendo TODAS las familias — el filtro por `ovHidden` vive
  solo dentro de `copBuildOverviewHTML()`, al construir `visible`/`hidden` a partir de `shown`.
- **`_copFamCardHTML` pasó de `<button>` a `<div onclick=...>`** porque ahora lleva un
  `<button>` real anidado (🙈 ocultar, con `event.stopPropagation()`) — un `<button>` no puede
  contener otro. El teclado lo sigue manejando igual: `a11yClickables()` (ya se llama al final
  de `copRender()`) le pone `role="button"`/`tabindex` y el listener global de Enter/Espacio de
  app.js hace el resto. Patrón ya usado en otras filas clicables de la app (`event.
  stopPropagation()` en un botón anidado) — no es nuevo, solo su primer uso en una tarjeta CoP.
- **`tpFamilyWeeklyProgress(familyKey)`** (testplan.js) es LA definición de "qué semanas del
  plan tocan a esta familia": recorre `tpState.weeklyPlans` (vivo — las semanas aceptadas se
  quedan ahí, nunca se mudan a `weekHistory` solamente), resuelve cada item a su config vía
  `tpState.planData` (mismo patrón que `tpWeekBoardRows`, porque un item de un plan viejo solo
  trae `desc` + un puñado de campos) y agrupa por `tpFamilyKeyForCfg`. Devuelve `done`
  (completed, separado en `verified`/`declared`) y `planned` (sin completar todavía) por
  semana — **no reconcilia esto con `planTested`/cobertura** (que cuenta TODO `testedList`,
  incluida evidencia fuera de cualquier plan semanal): es a propósito una lente más angosta,
  "según lo que pasó por Mi semana".
- **`_copFamilyGanttHTML(rows)`** (cop_validator.js) consume lo anterior para las familias
  `visible` (no ocultas) del Panorama: eje de semanas COMPARTIDO entre todas las filas (unión
  de fechas con actividad, tope 12 columnas, se queda con las más recientes/próximas), y la
  columna final "En el Plan" suma sobre el arreglo COMPLETO de `tpFamilyWeeklyProgress` (sin el
  tope de 12), no solo lo visible, para que el total/pendiente no se lea mal cuando hay más de
  12 semanas de historia. No guarda nada — se recalcula en cada render de `copBuildOverviewHTML`.

## v20.4 — Catálogo de configuraciones actualizado a producción

- **`CSV_CONFIGURATIONS` (`js/app.js`) se reemplazó con el CSV de producción más reciente**:
  173 → 248 configuraciones (10 descontinuadas, 85 nuevas, familia nueva **CL4MH**). Mismo
  formato/orden de columnas de siempre (`codigo_config_text,Modelo,MODEL YEAR (VIN),
  TRANSMISSION,ENVIRONMENT PACKAGE,EMISSION REGULATION,DRIVE TYPE,ENGINE CAPACITY,TIRE ASSY,
  REGION,BODY TYPE,ENGINE PACKAGE`) — el CSV de producción trae además `codigo_config` (id
  interno) y columnas de volumen mensual (`count_hist`, `Aug-26`…`Total_Calc`) que **no** son
  parte del catálogo y se descartan al hornear; esas mismas columnas de volumen sí alimentan el
  importador de producción del Plan (`tpImportPlanCSV`), pero eso el laboratorio lo sube desde
  la propia app, no se hornea.
- **Por qué se hornea en vez de usar el importador de la app (`kia_config_csv_raw`)**: ese
  importador guarda el CSV en `localStorage` de un solo dispositivo y **no está en la lista de
  sync de `firebase-sync.js`** — un catálogo importado ahí se ve en el equipo donde se subió y
  en ningún otro. Un catálogo nuevo que deba verse igual en todos los dispositivos va horneado
  en `CSV_CONFIGURATIONS` (vía código + `./build.sh`), no por el importador.

## v20.3 — Modal sin scroll y gráficas SPC en blanco

- **`.custom-modal-box` (styles.css) no tenía `overflow`**, solo `max-height:80vh` — cualquier
  `showModal({body:…})` con contenido largo (p. ej. **Mi semana → 🔄 Sustituir** con varias
  candidatas) se recortaba en silencio sin scroll. Ahora la caja es `flex column` con título y
  botones fijos y **`.custom-modal-message` es la única región que hace scroll** (`flex:1;
  overflow-y:auto`). Código nuevo que use `showModal` con `body` largo no necesita nada extra.
- **`copSpcRenderCharts()` (cop_validator.js) llamaba a `new Chart()` síncrono**, en el mismo
  tick en que `copRender()` acaba de pasar la pestaña de oculta a visible — Chart.js medía el
  canvas antes del reflow y lo creaba a 0×0 (cartas I-MR/MR en blanco). `copRender()` ahora la
  llama con `setTimeout(fn, 30)`, el mismo patrón que ya usa `pnProjSCurveRender` (projects.js,
  con el comentario "canvas is already in use" — ahí es el mismo problema de timing). **Toda
  gráfica nueva que se cree justo tras un cambio de pestaña/vista debe usar este patrón**, no
  `new Chart()` directo tras el `innerHTML`.

## v20.2 — CO₂ en el CoP: verificación estadística de familia (`js/cop_validator.js`)

El CO₂ pasó de un % de tolerancia inventado por la app a la prueba real de la norma. El Excel de
referencia (con el extracto oficial adjunto) corre DOS fórmulas en paralelo — se implementaron
las dos, no una:

- **`copCo2CalcStats(rows, fcf, evc)` es LA definición del veredicto de CO₂**, y devuelve AMBAS
  pruebas: `appendixI` (Reg. (UE) 2017/1151 Anexo XXI Ap.I §4, "A menos varianza" — `Xtests <
  A−VAR` / `Xtests > A−((n−3)/13)·VAR`, PRINCIPAL: es la que describe la conclusión) y `r154`
  (UN R154 §3.3.1, Tabla A2/3 con t por tamaño de muestra — CONFIRMACIÓN). Los campos de nivel
  superior (`decision`, `passBound`, `failBound`) son un alias de `appendixI` para que el resto
  de la pantalla (gauge, congelado del juicio) no necesite saber que hay dos pruebas. **Si las
  dos no coinciden, la conclusión lo declara en rojo — nunca se elige una en silencio.**
- **Verificado byte-exacto contra los valores CACHEADOS del Excel de referencia** (media,
  varianza, límites, decisión) — no es una aproximación de la fórmula, reproduce sus números
  dígito por dígito. `COP_CO2_TABLE` (n=3..16) es la Tabla A2/3 transcrita del extracto oficial;
  a n=16 las dos pruebas colapsan su banda exactamente al mismo punto (por diseño de la norma,
  no coincidencia) — por eso comparten tope de muestra.
- **`COP_CO2_A = 1,01` es fijo por la norma, NO configurable** — a diferencia del % de tolerancia
  que reemplaza (v17.14-v20.1, retirado). Lo que SÍ es de la familia y SÍ se configura son
  **FCF (Family Correction Factor) y Evolution Factor** (`copFamilyState(key).co2Fcf/.co2Evc`,
  `copCo2Factors()`/`copSetCo2Factors()`), editables directo en CoP → Validador — no en una
  pantalla de settings separada, a propósito: es donde se ve el efecto al instante.
  `x_i = (CO2_medido × EvC × FCF) / CO2_declarado`.
- **`_copBuildCo2HTML()` NO vive en `copBuildStatsHTML()`** — está un nivel arriba, en
  `copBuildValidatorHTML()`. `copSetCo2Factors()` llama a `copRender()` completo, NUNCA
  `copRenderStats()` (que solo repinta `#cop-stats-section`) — ese fue el bug real que apareció
  al construir esto: guardar el ajuste actualizaba el estado pero la tarjeta seguía mostrando el
  veredicto viejo, porque el repintado parcial no llegaba hasta ahí.
- **El juicio guardado (`copSaveJudgment`) congela `co2` con las DOS pruebas** (`appendixI` +
  `r154`, más `fcf`/`evc`/`mean`/`s`/`var`/`n` de cuando se decidió) — mismo principio que ya
  aplicaba a los gases: un registro debe ser reproducible aunque después cambie un ajuste. El
  PDF de expediente usa el congelado si hay juicio guardado, o lo calcula en vivo (PRELIMINAR)
  si no — mismo patrón que el resto del documento.
- **Se retiró `homoCo2Assess`/`homoState.co2TolerancePct`/`homoSaveTolerance`** (homolog.js) por
  quedar superados — sin usos que quedaran huérfanos, se confirmó con grep antes de borrar.
  **`homoCo2Deviation` SÍ se conserva**: la sigue usando la columna de desviación % por vehículo
  en la tabla, que es informativa y no decide el veredicto. La clave `co2TolerancePct` se quitó
  también de `_mergedHomo` en `fbPullApply` (se arma desde cero, así que basta con no listarla).

## v22.0 — Aire: densidad de la interfaz y tokens que por fin mandan

- **`uiPref(k[, v])` (app.js) es LA definición de las preferencias de interfaz** —
  `kia_ui_prefs` = `{density, onlyMine, searchScope, cards}`. Toda preferencia nueva de UI va
  ahí, NO en una clave propia. Reaplica defaults en **cada lectura** (patrón `tpPlannerCfg`,
  v18.0). **No se sincroniza a propósito** (criterio de `copState.ovHidden`, v20.5): el gusto
  de un técnico no le cambia la pantalla a otro.
- **`densityGet/Apply/Set` (app.js) + `data-density` en `<html>`**, tres modos
  (`compacto` | `comodo` | `amplio`), mismo patrón que `data-theme`. Se aplica **al parsear
  app.js**, no en `DOMContentLoaded`: esperar al bootstrap dejaba un parpadeo visible.
- **REGLA QUE NO SE ROMPE: un modo de densidad SOLO redeclara tokens, nunca reglas.** Nada de
  `calc()` ni multiplicadores — cada valor es un peldaño real de la rejilla de 4px, escrito a
  mano. Si una pantalla necesita una regla propia para caber en compacto, el problema es la
  pantalla, no la densidad.
- **`--fs-2xs` (12px) es el piso ABSOLUTO** y significa metadato verdadero. `--fs-xs` es 13px
  en cómodo. Deuda conocida: `--fs-xs` todavía carga ~775 usos en JS que son texto de CUERPO
  mal clasificado (era el tamaño de facto de la app); reclasificarlos a `--fs-sm` por módulo
  es trabajo pendiente, y hasta entonces `--fs-xs` está inflado a propósito.
- **`--lh-base` es la palanca barata**: `line-height` se hereda, así que subirlo da altura de
  caja a los ~900 sitios que fijan `font-size` en línea sin tocar ninguno.
- **PROHIBIDO px crudo en `padding`/`margin`/`gap`/`border-radius`** en `styles.css`: usar la
  escala (`--space-*`, `--radius-*`). Quedan 71 excepciones, todas deliberadas.
- **El chrome de navegación NO escala con la densidad.** `.platform-bar`, `.platform-tab`,
  `.topbar`, `.tbm-*`, `.bottom-nav` quedaron fuera del codemod a propósito: la barra mide
  ~1900px expandida y engordar su `padding: 14px 28px` trae de vuelta el envolvimiento a
  segunda fila que v17.9 corrigió. Verificar con `.platform-bar` a 50px de alto.
- **`pnRenderSystemHealth` NO pinta la pestaña `pn-system`.** Está registrada en
  `_pnGetRenderer`, pero `pn-system` vive en `_pnAlpineTabs` y la plantilla Alpine de
  `index.html` gana; esa función solo la llama una acción de limpieza. Todo contenido nuevo de
  una pestaña Alpine va a su plantilla en `index.html` y se puebla desde `pnSwitchTab`, como
  el slot del banner de ayuda y ahora `pnDensityRenderChoices()`.
- `var(--radius)` y `var(--shadow)` (sin sufijo) se **usaban sin estar declaradas** desde hacía
  meses — `.card` y `.tab-panel` con esquinas cuadradas. Ahora son alias de `--radius-lg` /
  `--shadow-md`. No volver a introducir un token sin declararlo: el CSS falla en silencio.

### v22.1 — Objetivos táctiles y color de fila

- **`.u-hit` es LA técnica para crecer un objetivo táctil sin crecer su caja**: la caja se queda
  del tamaño que se ve y un `::after` absoluto extiende el ÁREA, que se estira a `--target-min`
  solo bajo `@media (pointer: coarse)` (el escritorio conserva su densidad, la tablet gana el
  objetivo). **Va sobre un `<label>` u otro elemento normal, NUNCA sobre el `<input>`**: los
  pseudo-elementos no aplican a elementos reemplazados, así que `input.u-hit::after` es CSS
  muerto. Envolver el input en `<label>` además hace que toda el área alterne la casilla.
- **`*-tint` es un cuarto nivel de color, más claro que `*-bg`.** Regla: `*-bg` es el fondo del
  CHIP, `*-tint` el de la FILA que lo contiene. Una fila resaltada y un chip encima no pueden
  compartir token o el chip se queda sin contraste contra su propia fila.
- **`--dash-col-min` es un token de densidad** (380/440/520px), consumido por
  `.dash-group-rows`. Toda retícula nueva de tarjetas debe usarlo en vez de un `minmax()` fijo:
  con un mínimo fijo, subir la tipografía empeora el envolvimiento en vez de mejorarlo.
- **Campos de captura a `--fs-base` (16px) como mínimo**: por debajo de 16px iOS hace zoom
  automático al enfocar y no vuelve solo.
- **Al verificar en navegador**, dos trampas ya pagadas: el overlay del tour tapa la página y
  bloquea los clics — suprimirlo exige `kia_tour_done` **a secas** para el tour general (es un
  alias que NO sigue el patrón `kia_tour_done_<módulo>`); y `scrollIntoView` es animado por
  `scroll-behavior: smooth`, así que hay que esperar antes de medir o se lee la posición vieja.

## Working with this project

- Edit `js/*.js` / `styles.css` / `index.html` → `./build.sh` → `node --check` (file + bundle).
- **Cada ronda que se documenta en `CHANGELOG.md` también actualiza `APP_VERSION` y agrega una
  entrada al PRINCIPIO de `APP_VERSION_HISTORY` (ambos en `js/app.js`)** — si no, el pill de
  versión del topbar y el historial de Datos → Sistema quedan desincronizados del changelog real
  (pasó entre v14 y v16.6: `APP_VERSION` quedó pegado en `'14.0'` varias rondas).
- New function: add to the right module file; global scope makes it cross-available.
- **Toda clave nueva de `localStorage` agrega su entrada a `PN_STORAGE_REGISTRY`** (v18.1) y, si
  vive dentro de `tpState`, a la lista de preservación de `_fbPullSeed` (v18.0/v20).
- Saving state: `tpSave()`, `invSave()`, `pnSave()`, `saveDB()`, `copPersist()`.
- Rendering: `tpRender()`, `invRender()`, `pnRender()`, `copRender()`, `refreshAllLists()`.
- Tab switching: `tpSwitchTab`, `invSwitchTab`, `pnSwitchTab`; platforms via `switchPlatform`.
- New chart: create Chart.js on `window._yourChartVar`; `chartConfigBuildPanel('id','_var',{rerenderFn})`;
  wrap canvas in `<div id="id-wrapper">`; config persists to `kia_chart_configs`.

## Important Notes

- **Never edit `kia-emlab-unified.html`** — generated by `build.sh`.
- **Offline-first**; localStorage ~5MB limit (System Health in Panel; Results has compaction).
- **Firebase Sync**: enabled via `FIREBASE_CONFIG` in `firebase-sync.js`. **Shared workspace by default**
  — every device/user reads-writes `stations/KIA-EMLAB/...`, so all see the same data (no per-user
  namespacing). When unifying devices, open the one with the most complete data first (it seeds the
  cloud); merges prefer the more-complete/newer side to avoid data loss.
- **Auth (v15.6)**: muro de PIN por operador (SHA-256 `pinHash2` + lockout + auditoría) **y** login de
  dispositivo con contraseña de laboratorio (Firebase Email/Password) — juntos, no solo cosméticos.
  Las **Security Rules** (`firestore.rules`) son la protección real de los datos; el PIN es atribución
  fuerte. Ver README → "Seguridad — setup una sola vez". WebAuthn queda como acceso rápido opcional.
- **CDN deps**: signature_pad, jsPDF, Chart.js 4.4.7 (+zoom), JsBarcode, html5-qrcode, Firebase SDK.
- `CSV_CONFIGURATIONS` in `app.js` holds the embedded vehicle configuration catalog. Las
  configuraciones dadas de alta a mano (`kia_manual_configs`, Gestor de Configuraciones) se
  fusionan al final de **`parseCSV()`** vía `_mergeManualConfigsIntoAll()` — **v17.9**: antes solo
  se fusionaban al guardarlas, así que desaparecían de la cascada en la siguiente recarga.
  Cualquier código nuevo que reconstruya `allConfigurations` debe volver a llamarla. **v16.1**:
  regulaciones sin perfil son SELECCIONABLES en la cascada (⚡ EVs `220V`/`120V`/`EV` vía
  `_isEVRegulation`, ⚠ resto); celda de regulación vacía se autorrellena (`_normalizeRegulation`
  en cop15.js, reutilizada por `tpImportPlanCSV`): motor en KW → `EV`, si no → `N/A`.
- **Identidad de un vehículo (v17.12)**: `vehicle.id` debe ser único ENTRE DISPOSITIVOS —
  `nextVehicleId()` (app.js) es la única forma válida de emitir uno; nunca volver a usar
  `++db.lastId` (era un contador local y el sync fusiona por VIN conservando el id de origen, así
  que dos equipos emitían el mismo id). `dedupeVehicleIds()` repara duplicados al arrancar y tras
  CADA escritura de `db` venida de la nube; todo código nuevo que reemplace `db` debe llamarla.
  Al borrar un vehículo, filtrar por identidad del objeto, no por id.
- **Regulación de un vehículo (v17.10)**: `_libGetVehicleRegulation(vehicle)` (cop15.js) es **LA
  definición** de contra qué norma se comparan sus gases — antepone `vehicle.regulationOverride`
  (elegida a mano por el liberador: `{name, original, by, at}`, solo modificable en
  `ready-release`) al `config['EMISSION REGULATION']` del alta. Nunca leer el campo del config
  directo para validar/imprimir resultados (el PDF lo hacía y podía citar otra norma); sí se sigue
  usando el dato del alta para **identidad**: `copVehicleFamilyKey`, `tpFamilyKeyForCfg`. El alta
  manual (`_altaManualConfig()`, única definición de esa config) ofrece la regulación como
  selector de perfiles + "Otra" + "Definir al liberar", y un campo opcional de Transmisión.
- **Soak Timer** persists via `kia_soak_timer` + Notification API. **Command Palette** `Ctrl+K`.
  **Undo** `Ctrl+Z` (max 10 snapshots). **PWA** installable.

## Cascade Field Tooltips (`CASCADE_TOOLTIPS` in cop15.js)

Small `?` buttons next to Cascade form labels showing contextual help. Add via:
```js
CASCADE_TOOLTIPS.myFieldId = { title: 'Field name', text: 'Explicación en español.' };
```
The field needs an associated `<label>`. CSS: `.cascade-help-btn`, `.cascade-tooltip-overlay`,
`.cascade-tooltip-popup`, `.cascade-tooltip-title`, `.cascade-tooltip-text`, `.cascade-tooltip-close`.
