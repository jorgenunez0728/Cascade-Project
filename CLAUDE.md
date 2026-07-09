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
| **Datos** | Panel (dashboard, **📤 Reportes**, alerts, 🔍 Auditoría, system) | `platform-panel` |
| **CoP** | CoP Type 1 statistical Conformity-of-Production validator (family + VINes, live verdict) + **📈 Control SPC** (v15.7: cartas I-MR por familia×gas, Nelson, Cpk, alarmas) | `platform-cop` |

Legacy platform names (`cop15`, `testplan`, `inventory`, `panel`) are aliased in
`switchPlatform()`. Topbar (`index.html`) also has: **👤 operator picker** (`#op-picker`, no password),
**🕘 change history** (deep-links to Panel → Auditoría), Firebase sync indicator, notificaciones y un
menú **⋯** que colapsa los controles secundarios en móvil (<768px; en móvil las 5 tabs se ocultan —
la bottom-nav navega). **v15.5**: tema claro único (el dark mode se eliminó por completo).
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
  inventory.js          ← Lab Inventory + SVG Floor Plan Map (~4,150 lines)
  panel.js              ← Dashboard, Lab Overview, Reports Center, Users, Alerts, Audit, Health (~2,610 lines)
  firebase-sync.js      ← Shared-workspace cloud sync layer (~2,900 lines)
  auth.js               ← Operator identity + PIN wall (~490 lines)
  cop_validator.js      ← CoP Type 1 statistical validator + Control SPC (I-MR/Nelson/Cpk) (~1,170 lines)
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
| Auth / Operator | `js/auth.js` | `auth` | `authState` (lightweight) | `kia_current_operator` |
| Signatures | `js/signatures.js` | `sig` | overlay-based | — (in `vehicle.testData.signatures`) |
| Firebase Sync | `js/firebase-sync.js` | `fb` | `fbSync`, queue | `kia_firebase_queue` |

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

**`tpState` sub-fields added in v15:** `months` (dynamic production month labels), `priorityRules`
(editable P1..P10 classification for Recovery), `weekAvailability`, `maxTiers`, `recoveryUntil`.

## Cross-Module Dependencies

- **COP15 → Test Plan**: `tpAutoFeedFromRelease()`, `tpAutoMarkWeeklyCompletion()`
- **COP15 → Inventory**: `invLogTestUsage()`
- **COP15 → Signatures**: `sigCaptureOpen()` releaser gate in `finishRelease()`
- **Test Plan → Inventory**: prediction checks inventory for gas/fuel sufficiency
- **CoP → Test Plan**: `copFamilies()` reuses the family grouping (`tpFamilyKeyForCfg`); **CoP → COP15**:
  auto-populates VINes from `db.vehicles` of the selected family; **CoP SPC → COP15**: I-MR charts read
  final verified `gasResults` per released vehicle; **CoP SPC → Panel**: `copSpcScanAlarms()` feeds
  `pnGetActiveAlerts()` (source "CoP SPC", guarded with `typeof`)
- **Panel → All**: Lab Overview (`renderLabOverview`) + Intelligence read `db`, `tpState`, `invState`
- **Firebase Sync → All**: pushes/pulls per-module state to `stations/KIA-EMLAB/{module}/current`
- **App Core → All**: chart engine (`chartConfig*`), undo (`undoPush/Pop`), notes (`note*`),
  search (`globalVinSearch`), **audit (`auditLog`)**

## Script Load Order (matters!)

`app.js` → `cop15.js` → `inventory.js` → `testplan.js` → `panel.js` → `auth.js` → `signatures.js` →
`firebase-sync.js` → `cop_validator.js` (last; reuses `tpFamilyKeyForCfg`/`tpState` — guard with
`typeof`). `initializeSystem()` in app.js runs on `DOMContentLoaded` and bootstraps everything.

## Conventions

- All functions use global scope (no ES modules) — intentional for single-file offline compatibility
- Function naming: `tp*`=Test Plan, `inv*`=Inventory, `pn*`=Panel, `cop*`=CoP validator,
  `fb*`=Firebase sync, `auth*`=operator, `note*`=Entity Notes, `chartConfig*`=Chart, `undo*`=Undo,
  `cascade*`=Cascade tooltips, no prefix = COP15/shared
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

## Working with this project

- Edit `js/*.js` / `styles.css` / `index.html` → `./build.sh` → `node --check` (file + bundle).
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
- `CSV_CONFIGURATIONS` in `app.js` holds the embedded vehicle configuration catalog.
- **Soak Timer** persists via `kia_soak_timer` + Notification API. **Command Palette** `Ctrl+K`.
  **Undo** `Ctrl+Z` (max 10 snapshots). **PWA** installable.

## Cascade Field Tooltips (`CASCADE_TOOLTIPS` in cop15.js)

Small `?` buttons next to Cascade form labels showing contextual help. Add via:
```js
CASCADE_TOOLTIPS.myFieldId = { title: 'Field name', text: 'Explicación en español.' };
```
The field needs an associated `<label>`. CSS: `.cascade-help-btn`, `.cascade-tooltip-overlay`,
`.cascade-tooltip-popup`, `.cascade-tooltip-title`, `.cascade-tooltip-text`, `.cascade-tooltip-close`.
