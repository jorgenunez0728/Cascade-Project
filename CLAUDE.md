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
| **Plan** | Test Plan Manager (weekly plan, **🚑 Recuperación**, families, calendar, simulator, production) | `platform-testplan` |
| **Pruebas** | COP15 (Alta, Operacion, Liberacion, Cola, Historial) + Consumibles (Inventory) | `platform-cop15`, `platform-inventory` |
| **Datos** | Panel (dashboard, **📤 Reportes**, alerts, 🔍 Auditoría, system, **☁️ Archivos**, **🗂️ Proyectos**) | `platform-panel` |
| **CoP** | CoP Type 1 statistical Conformity-of-Production validator (family + VINes, live verdict) + **📈 Control SPC** (v15.7: cartas I-MR por familia×gas, Nelson, Cpk, alarmas) | `platform-cop` |

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
  app.js                ← Config, utils, chart engine, undo, notes, PDF, audit log, bootstrap (~3,990 lines)
  cop15.js              ← COP15 Cascade module + Soak Timer + Field Tooltips (~6,290 lines)
  testplan.js           ← Test Plan Manager + Recovery Plan + dynamic months (~5,090 lines)
  inventory.js          ← Lab Inventory + Zone Map grid (~5,000 lines)
  panel.js              ← Dashboard, Lab Overview, Reports Center, Users, Alerts, Audit, Health (~3,840 lines)
  projects.js           ← Proyectos: importador Excel, 6 vistas, CPM/línea base (~1,900 lines)
  firebase-sync.js      ← Shared-workspace cloud sync layer (~2,900 lines)
  auth.js               ← Operator identity + PIN wall (~490 lines)
  cop_validator.js      ← CoP Type 1 statistical validator + Control SPC (I-MR/Nelson/Cpk) (~1,170 lines)
  homolog.js            ← Homologación Europa: catálogo ICMS + f0/f1/f2/TM + CO₂ declarado (~560 lines)
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
| CoP Validator | `js/cop_validator.js` | `cop` | `copState` | `kia_cop_v1` |
| Proyectos | `js/projects.js` | `pnProject*` | `pnState.projects` (vive en panel) | — (dentro de `kia_panel_v1`) |
| Auth / Operator | `js/auth.js` | `auth` | `authState` (lightweight) | `kia_current_operator` |
| Signatures | `js/signatures.js` | `sig` | overlay-based | — (in `vehicle.testData.signatures`) |
| Firebase Sync | `js/firebase-sync.js` | `fb` | `fbSync`, queue | `kia_firebase_queue` |
| Homologación EU | `js/homolog.js` | `homo` | `homoState` | `kia_homolog_v1` |
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

## Working with this project

- Edit `js/*.js` / `styles.css` / `index.html` → `./build.sh` → `node --check` (file + bundle).
- **Cada ronda que se documenta en `CHANGELOG.md` también actualiza `APP_VERSION` y agrega una
  entrada al PRINCIPIO de `APP_VERSION_HISTORY` (ambos en `js/app.js`)** — si no, el pill de
  versión del topbar y el historial de Datos → Sistema quedan desincronizados del changelog real
  (pasó entre v14 y v16.6: `APP_VERSION` quedó pegado en `'14.0'` varias rondas).
- New function: add to the right module file; global scope makes it cross-available.
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
