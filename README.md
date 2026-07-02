# KIA EmLab — Emissions Laboratory Management System

> Single-page offline-first web application for KIA Mexico's Emissions Laboratory. Built for daily use by lab technicians on smartphones and tablets.

## Overview

KIA EmLab manages the complete emissions testing workflow: vehicle registration (COP15 cascade), test planning, results analysis with statistical process control, and laboratory inventory tracking. It runs **100% offline** using `localStorage` — no backend server required.

**Production file:** `kia-emlab-unified.html` — a single self-contained HTML file (~22,000 lines) that can be opened directly in any browser.

## Modules

| Module | File | Functions | Description |
|--------|------|-----------|-------------|
| **COP15 Cascade** | `js/cop15.js` | 121 | Vehicle registration, operation tracking, cascade testing workflow, soak timer |
| **Test Plan Manager** | `js/testplan.js` | 79 | Weekly/monthly test planning, burndown charts, family tracking, predictions |
| **Lab Inventory** | `js/inventory.js` | 88 | Gas cylinders, fuel tracking, equipment management, consumption charts |
| **Panel** | `js/panel.js` | 28 | Dashboard, user management, shift log, alerts, intelligence, system health |
| **App Core** | `js/app.js` | 88 | Config, utilities, chart config engine, undo system, search, notes, PDF |
| **Firebase Sync** | `js/firebase-sync.js` | 73 | Optional cloud sync layer (Firestore), offline queue, merge resolution |
| **Auth** | `js/auth.js` | 18 | PIN/WebAuthn authentication, session management |

**Total: ~551 functions across ~19,780 lines of JavaScript**

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  index.html                      │
│              (development entry)                 │
├────────┬──────────┬──────────┬──────────┬───────┤
│ app.js │ cop15.js │ inventory│ testplan │results│
│ (core) │          │   .js    │   .js    │  .js  │
├────────┴──────────┴──────────┴──────────┴───────┤
│              panel.js + auth.js                  │
├─────────────────────────────────────────────────┤
│          firebase-sync.js (optional)             │
├─────────────────────────────────────────────────┤
│              localStorage (5MB)                  │
└─────────────────────────────────────────────────┘
```

- **No ES modules** — all functions in global scope (intentional for offline single-file compatibility)
- **No build tools** — just a `build.sh` script that concatenates everything into one HTML file
- **No backend** — all data persisted in `localStorage` as JSON
- **CDN dependencies** — Chart.js 4.4.7, jsPDF 2.5.1, signature_pad, JsBarcode, html5-qrcode, Firebase SDK

## Quick Start

### Development
```bash
# Open index.html with a local server
python3 -m http.server 8080
# Then open http://localhost:8080
```

### Production Build
```bash
./build.sh
# Generates kia-emlab-unified.html (~22,000 lines, ~1.3MB)
# Open this single file in any browser — works fully offline
```

## Key Features

### Core Workflow
- **COP15 Cascade** — Vehicle registration with VIN validation, multi-step operation workflow (register, test, release), digital signatures, cascade tree visualization
- **Soak Timer** — Persistent countdown timer with browser notifications, survives page reloads
- **Test Plan Manager** — Create plans by family/regulation, track completion with burndown charts, weekly predictions with inventory sufficiency checks
- **Lab Inventory** — Gas cylinder PSI tracking with usage logs, fuel level monitoring, equipment management with barcode/QR scanning

### Cross-Module Intelligence (Round 4)
- **Chart Config Engine** — Native configuration tool for all Chart.js instances: height, axes, colors, palettes, grid, legend, animation, PNG/PDF export
- **Undo Engine** — Ctrl+Z with circular buffer (10 snapshots), toast with undo button
- **Cross-Module Search** — Global search across all 4 modules from command palette (`Ctrl+K`)
- **Intelligence Panel** — Auto-correlation: gas consumption vs test volume, fail rate vs gas age, plan velocity vs pipeline
- **Results Comparison** — Side-by-side diff of any two tests with radar chart overlay
- **Entity Notes** — Per-entity annotations (vehicles, tests) with badge counts
- **System Health Monitor** — Storage breakdown per module, data aging analysis, purge tools, performance metrics

### Infrastructure
- **PWA** — Service worker + manifest for installable app
- **Firebase Sync** — Optional cloud sync with Firestore, offline queue, multi-device merge
- **Command Palette** — `Ctrl+K` for quick actions, power search with `>` prefix
- **PDF Reports** — Weekly status with embedded charts
- **Accessibility** — ARIA labels, keyboard navigation, reduced motion support

## Data Storage

| Key | Module | Description |
|-----|--------|-------------|
| `kia_db_v11` | COP15 | Vehicles, configurations, timeline |
| `kia_testplan_v1` | Test Plan | Plans, records, families |
| `kia_results_v1` | Results | Tests, profiles, limits |
| `kia_lab_inventory` | Inventory | Gas, fuel, equipment items |
| `kia_panel_v1` | Panel | Operators, shift log, alerts |
| `kia_chart_configs` | Charts | All chart configuration settings |
| `kia_entity_notes` | Notes | Per-entity annotations |
| `kia_soak_timer` | COP15 | Active soak timer state |

## Development History

| Round | Commit | Changes |
|-------|--------|---------|
| **R1** | `383d1c3` | 10 UX improvements — clipboard, kanban, soak timer, notifications, command palette, charts |
| **R2** | `59427cc` | 10 heavyweight functional improvements — SPC, Cpk/Ppk, burndown, predictions, cascade tree |
| **R3** | `5335591` | 9 cross-discipline — PWA, a11y, security, performance, data integrity, onboarding |
| **R4** | `adf638a` | 8 improvements — chart config engine, undo, PDF charts, cross-search, intelligence, compare, notes, system health |

**Total: 37 improvements across 4 rounds of development.**

## File Structure

```
Cascade-Project/
├── index.html                  ← Development entry point
├── styles.css                  ← All CSS (~1,252 lines)
├── js/
│   ├── app.js                  ← Core: config, utilities, chart engine, undo, notes (~2,272 lines)
│   ├── cop15.js                ← COP15 Cascade + Soak Timer (~4,449 lines)
│   ├── testplan.js             ← Test Plan Manager (~3,214 lines)
│   ├── inventory.js            ← Lab Inventory (~3,127 lines)
│   ├── panel.js                ← Dashboard, Users, Intelligence, System Health (~1,368 lines)
│   ├── firebase-sync.js        ← Optional Firebase cloud sync (~2,501 lines)
│   └── auth.js                 ← Authentication (~459 lines)
├── build.sh                    ← Build script → generates unified HTML
├── kia-emlab-unified.html      ← GENERATED production file (do not edit)
├── manifest.json               ← PWA manifest
├── sw.js                       ← Service worker
├── CLAUDE.md                   ← Claude Code project instructions
└── README.md                   ← This file
```

## Conventions for Contributors

- **Function naming**: `tp*` = Test Plan, `inv*` = Inventory, `pn*` = Panel, `cop*` = CoP validator, `fb*` = Firebase, `auth*` = operador, `note*` = Notes, `chartConfig*` = Chart system, no prefix = COP15/shared
- **State saving**: Always call `saveDB()`, `tpSave()`, `invSave()`, `pnSave()` or `copPersist()` after mutations
- **Rendering**: Call `refreshAllLists()`, `tpRender()`, `invRender()`, `pnRender()` or `copRender()` to update UI
- **Dark theme** for TP/RA/Inventory/Panel, **light theme** for COP15
- **Never edit** `kia-emlab-unified.html` — always edit source files and run `build.sh`
- **Script load order matters**: app.js → cop15.js → inventory.js → testplan.js → panel.js → auth.js → signatures.js → firebase-sync.js → cop_validator.js

## Potential Future Improvements

- [ ] Vehicle configuration templates for faster registration
- [ ] Offline-first data export/import (JSON backup/restore without Firebase)
- [ ] Multi-language support (currently Spanish only)
- [ ] Dark mode toggle for COP15 module
- [ ] Historical trend dashboard across quarters
- [ ] Automated regulatory limit updates
- [ ] Batch test result import from CSV/Excel
- [ ] Print-optimized views for all modules
- [ ] Unit/integration test suite
- [ ] Notification scheduling for upcoming test deadlines
