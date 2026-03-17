# KIA EmLab — Claude Code Project Guide

## What is this project?

Single-page web application for KIA Mexico's Emissions Laboratory. 7 modules + panel + auth, ~580 functions, ~21,400 lines of JS. 100% offline using localStorage (images in IndexedDB). Used daily on smartphones/tablets by lab technicians. 5 rounds of improvements completed + UI/UX overhaul + SOP guided tour rewrite.

## Project Structure

```
index.html              ← Development entry point (modular, uses <script src>)
styles.css              ← All CSS (~1,252 lines)
js/
  app.js                ← Config, constants, utilities, chart engine, undo, notes, PDF (~2,272 lines)
  cop15.js              ← COP15 Cascade module + Soak Timer (~4,449 lines)
  testplan.js           ← Test Plan Manager module (~3,214 lines)
  results.js            ← Results Analyzer module + Cpk/Ppk + SPC (~2,390 lines)
  inventory.js          ← Lab Inventory module (~3,127 lines)
  panel.js              ← Dashboard, Users, Shift Log, Alerts, Intelligence, System Health (~1,368 lines)
  sop.js                ← SOP Guided Tour module — reads/writes db.vehicles (~1,675 lines)
  auth.js               ← PIN/WebAuthn authentication (~459 lines)
  firebase-sync.js      ← Optional Firebase cloud sync layer (~2,501 lines)
build.sh                ← Generates kia-emlab-unified.html (single-file for production)
kia-emlab-unified.html  ← GENERATED FILE — do not edit directly (~22,000 lines)
manifest.json           ← PWA manifest
sw.js                   ← Service worker for PWA
CHANGELOG.md            ← Detailed changelog of all 4 development rounds
```

## Module Responsibilities

| Module | File | Prefix | Key State | localStorage Key |
|--------|------|--------|-----------|-----------------|
| App Core | `js/app.js` | — | `db`, `allConfigurations`, `CONFIG` | `kia_db_v11` |
| COP15 Cascade | `js/cop15.js` | — | Uses `db` from app.js | — |
| Test Plan Manager | `js/testplan.js` | `tp` | `tpState` | `kia_testplan_v1` |
| Results Analyzer | `js/results.js` | `ra` | `raState` | `kia_results_v1` |
| Lab Inventory | `js/inventory.js` | `inv` | `invState` | `kia_lab_inventory` |
| Panel | `js/panel.js` | `pn` | `pnState` | `kia_panel_v1` |
| SOP Guided Tour | `js/sop.js` | `sop` | `sopState` | `kia_sop_v1` |
| Auth | `js/auth.js` | — | session-based | `kia_auth_session` |
| Firebase Sync | `js/firebase-sync.js` | `fb` | queue-based | `kia_firebase_queue` |

### Additional localStorage Keys

| Key | Purpose |
|-----|---------|
| `kia_chart_configs` | Chart Config Engine settings for all Chart.js instances |
| `kia_entity_notes` | Entity Notes system (per-vehicle, per-test annotations) |
| `kia_soak_timer` | Soak timer persistence across page reloads |
| `sopImageDB` (IndexedDB) | SOP step images stored as blobs (not localStorage) |

## Cross-Module Dependencies

- **COP15 → Test Plan**: `tpAutoFeedFromRelease()`, `tpAutoMarkWeeklyCompletion()`
- **COP15 → Inventory**: `invLogTestUsage()`
- **Test Plan → Results**: `tpBuildFamilies()` uses `raState.tests`
- **Test Plan → Inventory**: Prediction checks inventory for gas/fuel sufficiency
- **App Core → All**: Chart config engine (`chartConfig*`), undo engine (`undoPush/Pop`), notes (`note*`), search (`globalVinSearch`)
- **Panel → All**: Intelligence correlations read from `db`, `raState`, `tpState`, `invState`
- **COP15 → SOP**: `sopOnVehicleRegistered(vehicle)` called from `saveNewVehicle()` in cop15.js
- **SOP → COP15**: `sopGoToCascade(vehicleId)` sets `activeVehSelect` and calls `loadVehicle()`
- **SOP ↔ Cascade**: SOP reads/writes `db.vehicles[].testData.*` — same data source as Cascade forms

## Script Load Order (matters!)

1. `app.js` — Config, DB initialization, utilities (must be first)
2. `cop15.js` — COP15 module (depends on `db`, `CONFIG` from app.js)
3. `inventory.js` — Inventory (depends on global scope)
4. `testplan.js` — Test Plan (depends on cop15 + inventory functions)
5. `results.js` — Results Analyzer (depends on testplan for families)
6. `sop.js` — SOP Guided Tour (depends on `db`, `CONFIG`, `isEmissionsPurpose`)
7. `panel.js` — Panel module (depends on all modules for intelligence/health)
8. `auth.js` — Authentication (depends on global scope)
9. `firebase-sync.js` — Cloud sync (must be last, hooks into all save functions)

The `initializeSystem()` function in app.js runs on `DOMContentLoaded` and bootstraps all modules.

## Conventions

- All functions use global scope (no ES modules) — this is intentional for single-file offline compatibility
- Function naming: `tp*` = Test Plan, `ra*` = Results Analyzer, `inv*` = Inventory, `pn*` = Panel, `sop*` = SOP Guided Tour, `fb*` = Firebase sync, `note*` = Entity Notes, `chartConfig*` = Chart system, `undo*` = Undo engine, no prefix = COP15/shared
- State is stored in localStorage as JSON objects
- HTML content for TP, RA, Inventory, and Panel is rendered dynamically via JS (minimal static HTML)
- COP15 has the most static HTML (forms for vehicle registration, operation, release)
- CSS uses custom properties (CSS variables) defined in `:root`
- UI follows unified light theme with per-module accent colors (CSS variables `--accent-*`)
- Charts use `chartConfigBuildPanel(chartId, instanceVar, opts)` for reusable config UI
- Destructive actions should call `undoPush(module, label)` before executing, and show toast with undo callback

## Working with this project

### To make changes
1. Edit the relevant file in `js/` or `styles.css` or `index.html`
2. For development testing, open `index.html` in browser (needs a local server for cross-file loading, or use the build)
3. Run `./build.sh` to generate the unified production file
4. Verify syntax: `node --check js/filename.js`

### To add a new function
- Identify which module it belongs to
- Add it to the corresponding `js/*.js` file
- If it needs cross-module access, it's automatically available via global scope
- Run `./build.sh` after changes

### To add a new chart
1. Create Chart.js instance as usual, store on `window._yourChartVar`
2. Add config panel: `chartConfigBuildPanel('your_chart_id', '_yourChartVar', {rerenderFn:'yourRender();'})`
3. Wrap canvas in `<div id="your_chart_id-wrapper">` for height management
4. Config is auto-persisted to `kia_chart_configs` localStorage

### Common patterns
- Saving state: call `tpSave()`, `raSave()`, `invSave()`, `pnSave()`, `sopSave()`, or `saveDB()` after mutations
- Rendering: call `tpRender()`, `raRender()`, `invRender()`, `pnRender()`, `sopRender()`, or `refreshAllLists()` to update UI
- Tab switching: `tpSwitchTab('id')`, `raSwitchTab('id')`, `invSwitchTab('id')`, `pnSwitchTab('id')`, `sopSwitchTab('id')`
- Undo: call `undoPush('module', 'label')` before destructive operations
- Notes: use `noteBuildButton('entityType', 'entityId')` to add note buttons to UI elements

## Important Notes

- **Never edit `kia-emlab-unified.html` directly** — it is generated by `build.sh`
- **localStorage has a 5MB limit** — System Health Monitor in Panel shows usage breakdown; Results Analyzer includes compaction logic
- **Offline-first** — no external API calls, all data in localStorage
- **CDN dependencies**: signature_pad (signatures), jsPDF (PDF), Chart.js 4.4.7 (charts), chartjs-plugin-zoom (pan/zoom), JsBarcode (barcodes), html5-qrcode (QR scanning), Firebase SDK (optional cloud sync)
- The `CSV_CONFIGURATIONS` constant in `app.js` contains vehicle configuration data (~175 lines of CSV embedded in JS)
- **Soak Timer** in COP15 persists across page reloads via `kia_soak_timer` localStorage key and uses browser Notification API
- **Cpk/Ppk** in Results Analyzer uses regulatory limits from profiles to calculate process capability indices
- **SPC Charts** — I-chart and mR-chart with UCL/LCL control limits for statistical process control
- **Firebase Sync** is optional — enabled by filling `FIREBASE_CONFIG` in `js/firebase-sync.js`. Without config, app runs fully offline
- **Timeline compaction** — COP15 timeline entries store only summary data to reduce localStorage usage
- **Command Palette** (`Ctrl+K`) — provides quick access to all actions; `>` prefix triggers cross-module power search
- **Undo Engine** — `Ctrl+Z` restores previous state from circular buffer (max 10 snapshots)
- **Chart Config Engine** — unified configuration for all Chart.js instances with PNG/PDF export
- **PWA** — installable via manifest.json + sw.js service worker

## SOP Guided Tour Module (`js/sop.js`)

The SOP module was rewritten from a basic checklist system to a **guided tour** that reads/writes vehicle data directly to `db.vehicles` (shared with COP15 Cascade).

### Architecture
```
Vehicle registered in Cascade (saveNewVehicle → sopOnVehicleRegistered)
  → User opens SOP → selects vehicle from dropdown
  → Auto-generated procedure based on vehicle.purpose (emissions vs simple)
  → Each step = question + field input (select/number/text/action)
  → Answer writes to vehicle.testData.* via sopSaveField → saveDB()
  → Data appears in Cascade form fields when user switches back
  → Images stored in IndexedDB (sopImageDB), NOT localStorage
  → Custom edits saved to sopState.customizations in kia_sop_v1
```

### Code Structure (sections labeled [S00]-[S21])
| Section | Description |
|---------|-------------|
| `[S00]` | State & constants |
| `[S01]` | Emissions step definitions (47 steps, 7 sections) |
| `[S02]` | Simple (non-emissions) step definitions (3 steps) |
| `[S03]` | Alta (read-only registration info) steps |
| `[S04]` | IndexedDB image engine (save/get/delete/capture/overlay) |
| `[S05]` | Data bridge: `sopGetFieldValue`, `sopSetFieldValue`, `sopSaveField` |
| `[S06]` | Procedure generation based on vehicle purpose |
| `[S07]` | Init & state persistence |
| `[S08]` | Tab switching & main render |
| `[S09]` | Vehicle selector |
| `[S10]` | Main guide renderer (sections + progress) |
| `[S11]` | Step renderer (field types: select/number/text/textarea/datetime/action/readonly) |
| `[S12]` | Field change handlers |
| `[S13]` | Checklist state (per-step sub-items) |
| `[S14]` | Step editing (title, desc, checklist items, reorder) |
| `[S15]` | Progress tracking |
| `[S16]` | Async image loading |
| `[S17]` | History & export |
| `[S18]` | Templates view |
| `[S19]` | Cascade integration (banner, sopGoToCascade, sopStartAndShow) |
| `[S20]` | Helpers |
| `[S21]` | Initialize |

### Key Data Path Mapping
Steps use `dataPath` to map to vehicle fields. Examples:
- `testData.operator` → reception operator
- `testData.preconditioning.fuelTypeIn` → fuel type at reception
- `testData.etw` → dynamometer test weight
- `testData.testVerification.tunnel` → test tunnel selection
- `testData.simple.operator` → simple mode operator

### How to Add a New SOP Step
Add an object to `SOP_EMISSIONS_STEPS` or `SOP_SIMPLE_STEPS`:
```js
{
    title: '¿Pregunta al usuario?',
    description: 'Texto explicativo.',
    fieldType: 'select',              // select | number | text | textarea | datetime | action | readonly
    cascadeFieldId: 'dom_element_id', // corresponding Cascade DOM field (for reference)
    dataPath: 'testData.path.to.field', // path in vehicle object
    options: [{ value: 'x', label: 'X' }], // for select type, or '__operators__'
    section: 'section_id',
    sectionLabel: 'Section Name',     // only on first step of new section
    sectionIcon: '🔧'                 // only on first step of new section
}
```

### CSS Classes (in styles.css)
Existing: `.sop-step`, `.sop-step-active`, `.sop-step-completed`, `.sop-checklist`, `.sop-check-item`, `.sop-progress`, `.sop-progress-bar`, `.sop-context-banner`, `.sop-procedure-card`, `.sop-data-input`, `.sop-summary`, `.sop-history-item`
New (guided tour): `.sop-vehicle-banner`, `.sop-vehicle-selector`, `.sop-section-header`, `.sop-section-progress-mini`, `.sop-section-body`, `.sop-field-group`, `.sop-field-readonly`, `.sop-action-btn`, `.sop-edit-toggle`, `.sop-camera-btn`, `.sop-image-gallery`, `.sop-image-thumb`, `.sop-image-overlay`
