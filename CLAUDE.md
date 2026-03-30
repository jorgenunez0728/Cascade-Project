# KIA EmLab — Claude Code Project Guide

## What is this project?

Single-page web application for KIA Mexico's Emissions Laboratory. 6 modules + panel + auth + daily dashboard, ~620 functions, ~23,500 lines of JS. 100% offline using localStorage. Used daily on smartphones/tablets by lab technicians. 6 rounds of improvements + UI/UX v6 overhaul (Glass+Neumorphism design system, SVG floor plan map, unified components, smooth transitions).

## Project Structure

```
index.html              ← Development entry point (modular, uses <script src>)
styles.css              ← All CSS (~3,000 lines) — Glass + Neumorphism design system
js/
  app.js                ← Config, utilities, chart engine, undo, notes, PDF, transitions (~2,340 lines)
  cop15.js              ← COP15 Cascade module + Soak Timer + Field Tooltips (~4,900 lines)
  testplan.js           ← Test Plan Manager module (~3,214 lines)
  results.js            ← Results Analyzer module + Cpk/Ppk + SPC (~2,390 lines)
  inventory.js          ← Lab Inventory + SVG Floor Plan Map (~3,580 lines)
  panel.js              ← Dashboard, Users, Shift Log, Alerts, Intelligence, System Health (~1,368 lines)
  auth.js               ← PIN/WebAuthn authentication (~459 lines)
  firebase-sync.js      ← Optional Firebase cloud sync layer (~2,501 lines)
build.sh                ← Generates kia-emlab-unified.html (single-file for production)
kia-emlab-unified.html  ← GENERATED FILE — do not edit directly (~28,000 lines)
manifest.json           ← PWA manifest
sw.js                   ← Service worker for PWA
CHANGELOG.md            ← Detailed changelog of all 6 development rounds
V7_HANDOFF.md           ← Next version planning document (Smart Workflow upgrade)
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
| Auth | `js/auth.js` | — | session-based | `kia_auth_session` |
| Firebase Sync | `js/firebase-sync.js` | `fb` | queue-based | `kia_firebase_queue` |

### Additional localStorage Keys

| Key | Purpose |
|-----|---------|
| `kia_chart_configs` | Chart Config Engine settings for all Chart.js instances |
| `kia_entity_notes` | Entity Notes system (per-vehicle, per-test annotations) |
| `kia_soak_timer` | Soak timer persistence across page reloads |
| `kia_lab_inventory.zoneLayout` | Floor plan zone positions for SVG map |

## Cross-Module Dependencies

- **COP15 → Test Plan**: `tpAutoFeedFromRelease()`, `tpAutoMarkWeeklyCompletion()`
- **COP15 → Inventory**: `invLogTestUsage()`
- **Test Plan → Results**: `tpBuildFamilies()` uses `raState.tests`
- **Test Plan → Inventory**: Prediction checks inventory for gas/fuel sufficiency
- **App Core → All**: Chart config engine (`chartConfig*`), undo engine (`undoPush/Pop`), notes (`note*`), search (`globalVinSearch`)
- **Panel → All**: Intelligence correlations read from `db`, `raState`, `tpState`, `invState`

## Script Load Order (matters!)

1. `app.js` — Config, DB initialization, utilities (must be first)
2. `cop15.js` — COP15 module (depends on `db`, `CONFIG` from app.js)
3. `inventory.js` — Inventory (depends on global scope)
4. `testplan.js` — Test Plan (depends on cop15 + inventory functions)
5. `results.js` — Results Analyzer (depends on testplan for families)
6. `panel.js` — Panel module (depends on all modules for intelligence/health)
7. `auth.js` — Authentication (depends on global scope)
8. `firebase-sync.js` — Cloud sync (must be last, hooks into all save functions)

The `initializeSystem()` function in app.js runs on `DOMContentLoaded` and bootstraps all modules.

## Conventions

- All functions use global scope (no ES modules) — this is intentional for single-file offline compatibility
- Function naming: `tp*` = Test Plan, `ra*` = Results Analyzer, `inv*` = Inventory, `pn*` = Panel, `fb*` = Firebase sync, `note*` = Entity Notes, `chartConfig*` = Chart system, `undo*` = Undo engine, `cascade*` = Cascade tooltips, no prefix = COP15/shared
- State is stored in localStorage as JSON objects
- HTML content for TP, RA, Inventory, and Panel is rendered dynamically via JS (minimal static HTML)
- COP15 has the most static HTML (forms for vehicle registration, operation, release)
- CSS uses custom properties (CSS variables) defined in `:root`
- UI follows unified light theme with per-module accent colors (CSS variables `--accent-*`)
- Charts use `chartConfigBuildPanel(chartId, instanceVar, opts)` for reusable config UI
- Destructive actions should call `undoPush(module, label)` before executing, and show toast with undo callback

## UI/UX Design System (v6)

### CSS Architecture
- **Design tokens** in `:root`: `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--glass-*`
- **Neumorphic shadows**: `--shadow-sm` to `--shadow-xl` use dual light/dark offset shadows for depth
- **Glass effect**: `--glass-bg`, `--glass-blur`, `--glass-border` for frosted glass headers/modals
- **Pressed state**: `--shadow-pressed` and `--shadow-inset` for button press and input depth

### Unified Components
- **Buttons**: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-lg` — all with neumorphic shadow and `:active` press effect
- **Cards**: `.card`, `.tp-card`, `.daily-dash-card` — shared neumorphic base with hover elevation
- **Badges**: `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info`, `.badge-neutral`
- **Titles**: `.section-title` (large), `.card-title` (medium, red border-bottom), `.label-title` (small, uppercase)

### Transitions & Micro-interactions
- **Tab switching**: `.tab-content-enter` / `.tab-content-exit` animations (200ms fade + translate)
- **Drill-down navigation**: `navigateToDetail(containerId, renderFn)` utility in app.js
- **Accordion smoothing**: CSS animation on `details[open]` with `scroll-margin-top` to prevent page jumps
- **Modal polish**: Glassmorphism backdrop blur (8px) + bounce entrance via `cubic-bezier(0.34, 1.56, 0.64, 1)`
- **Detail panel**: `.detail-panel` slide-in from right (300ms) with backdrop

### Inventory Floor Plan Map
- **SVG-based interactive map**: `invRenderFloorPlan()` in inventory.js
- **Zone layout**: Stored in `invState.zoneLayout`, persisted to localStorage
- **Edit mode**: Drag zones to reposition, resize handles on corners, snap-to-grid
- **Cylinders**: Color-coded circles (green >50%, orange 25-50%, red <25%, dashed=empty)
- **Interactions**: Tooltip on hover, click for detail, drag-and-drop in edit mode
- **Helpers**: `_invEnsureZoneLayout()`, `_invCalcViewBox()`, `_invFloorPlanBindCylinders()`, `_invFloorPlanBindEditDrag()`

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
- Saving state: call `tpSave()`, `raSave()`, `invSave()`, `pnSave()`, or `saveDB()` after mutations
- Rendering: call `tpRender()`, `raRender()`, `invRender()`, `pnRender()`, or `refreshAllLists()` to update UI
- Tab switching: `tpSwitchTab('id')`, `raSwitchTab('id')`, `invSwitchTab('id')`, `pnSwitchTab('id')`
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
- **Cascade Field Tooltips** — `?` buttons next to confusing form fields with popup explanations (ETW, DTC, inertia params, etc.)

## Cascade Field Tooltips (`CASCADE_TOOLTIPS` in cop15.js)

Small `?` icon buttons next to Cascade form labels that show contextual help popups when tapped. Designed for lab technicians unfamiliar with technical terms.

### How to Add a New Tooltip
Add an entry to `CASCADE_TOOLTIPS` in `cop15.js`:
```js
CASCADE_TOOLTIPS.myFieldId = {
    title: 'Human-readable field name',
    text: 'Explanation in Spanish of what this field means and how to fill it.'
};
```
The field must have a `<label>` element associated with it (either via `for` attribute or as a sibling in `.form-group`).

### CSS Classes
`.cascade-help-btn`, `.cascade-tooltip-overlay`, `.cascade-tooltip-popup`, `.cascade-tooltip-title`, `.cascade-tooltip-text`, `.cascade-tooltip-close`
