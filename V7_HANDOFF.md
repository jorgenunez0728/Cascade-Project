# Handoff Document — KIA EmLab v7 "Smart Workflow"

## Context

La v6 completó el upgrade visual (Glass + Neumorphism, SVG floor plan, transiciones). El siguiente salto es hacer la vida del **técnico** más fácil en su día a día. Hoy el técnico hace ~13 clicks para registrar un vehículo, navega manualmente entre módulos, y no tiene un "¿qué sigue?" después de completar cada paso. La v7 convierte la app en un **asistente inteligente que guía al técnico paso a paso**.

### Data de referencia del flujo actual
- **Alta de vehículo**: 13 clicks mínimo (8 en cascade filter + 5 más)
- **Precondicionamiento**: 12+ campos de captura
- **Test/Dyno**: 20+ campos con dependencias complejas (fan mode)
- **Liberación**: 1 vehículo a la vez, sin batch
- **Soak timer**: Notifica completado pero NO guía al siguiente paso
- **Dashboard**: Sin "Mis Tareas" ni acciones rápidas
- **Último vehículo**: NO se recuerda al recargar la app

---

## Cambios a CLAUDE.md

### 1. Descripción del proyecto
```
~620 functions, ~23,500 lines of JS. 6 rounds + UI/UX v6 overhaul (Glass+Neumorphism, SVG floor plan, unified components, transitions).
```

### 2. Line counts actualizados
```
styles.css              ← All CSS (~3,000 lines) — Glass + Neumorphism design system
js/app.js               ← Config, utilities, chart engine, undo, notes, PDF, transitions (~2,340 lines)
js/inventory.js         ← Lab Inventory + SVG Floor Plan Map (~3,580 lines)
kia-emlab-unified.html  ← GENERATED FILE — do not edit directly (~28,000 lines)
CHANGELOG.md            ← Detailed changelog of all 6 development rounds
```

### 3. Nueva sección "UI/UX Design System (v6)"
```markdown
## UI/UX Design System (v6)

### CSS Architecture
- Design tokens in `:root`: `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--glass-*`
- Neumorphic shadows: `--shadow-sm` to `--shadow-xl` (dual light/dark offset)
- Glass: `--glass-bg`, `--glass-blur`, `--glass-border`
- Pressed: `--shadow-pressed`, `--shadow-inset`

### Unified Components
- Buttons: `.btn`, `.btn-primary/.secondary/.ghost/.danger`, `.btn-sm/.lg`
- Cards: `.card`, `.tp-card` — neumorphic base with hover elevation
- Badges: `.badge-success/.warning/.danger/.info/.neutral`
- Titles: `.section-title`, `.card-title`, `.label-title`

### Transitions
- Tabs: `.tab-content-enter/.exit` (200ms)
- Drill-down: `navigateToDetail(containerId, renderFn)` in app.js
- Accordions: CSS animation on `details[open]`
- Modals: Glassmorphism backdrop + bounce

### Inventory Floor Plan
- `invRenderFloorPlan()` — SVG interactive map
- `invState.zoneLayout` — persisted zone positions
- Edit mode: drag, resize, snap-to-grid
- Cylinders: color-coded circles with tooltips
```

### 4. localStorage key nuevo
```
| `kia_lab_inventory.zoneLayout` | Floor plan zone positions for SVG map |
```

---

## TIER A — Smart Integration Engine
**Prioridad: CRÍTICA** | **Archivos: `js/app.js`, `js/cop15.js`, `js/inventory.js`, `js/testplan.js`**

> Sin cambios respecto al plan anterior. Necesario como fundamento.

### A1. Event Bus (`js/app.js`)
- `emitEvent(name, data)` / `onEvent(name, handler)` para desacoplar módulos

### A2. Auto-deducción de Gas (`js/inventory.js` ~línea 1628)
- `invLogTestUsage()` ahora deduce PSI estimado del cilindro
- Alerta si baja de 25%

### A3. Verificación de Disponibilidad en Plan (`js/testplan.js` ~línea 351)
- `tpBuildFamilies()` verifica gas suficiente → indicador 🟢/🟡/🔴

### A4. Feedback Calidad → Plan (`js/results.js`)
- `raFeedbackToTestPlan()`: Cpk < 1.33 → badge de re-test en plan

### A5. Detección de Conflictos (`js/app.js`)
- `checkResourceConflicts()`: no dos tests al mismo cilindro/dyno

---

## TIER B — Executive Dashboard + Compliance
**Prioridad: ALTA** | **Archivos: `js/panel.js`, `js/results.js`**

> Sin cambios respecto al plan anterior. El gerente necesita esto.

### B1. KPI Executive Tab (`pn-executive`)
- Throughput/velocity, compliance scorecard, resource utilization, team metrics

### B2. Vehicle Turnaround Analytics (`pn-turnaround`)
- Tiempo promedio por etapa desde `vehicle.timeline[]`

### B3. Predictive Resource Planner
- Proyección de agotamiento de gas, tests requeridos vs capacidad

### B4. Rolling Cpk Alert (`js/results.js`)
- Alerta automática si Cpk rolling < 1.33

---

## TIER C — "Continuar Donde Me Quedé" (Session Memory)
**Prioridad: ALTA** | **Archivos: `js/cop15.js`, `js/app.js`**

### Problema
El técnico abre la app y no sabe dónde quedó. Debe re-seleccionar su vehículo, re-navegar al tab correcto, re-encontrar el campo donde estaba. Pierde 20-30 clicks por sesión.

### Cambios

#### C1. Remember Active Vehicle (`js/cop15.js`)
- Al cargar/seleccionar vehículo, guardar en `localStorage.kia_active_vehicle`:
  ```js
  { vehicleId, vin, lastTab, lastAccordion, scrollPosition, timestamp }
  ```
- **En `initializeSystem()` (app.js)**: Si hay vehículo activo < 24h, mostrar toast:
  ```
  "Retomar VIN ...4832? [Sí] [No]"
  ```
- Si acepta: cargar vehículo, navegar al tab/accordion correcto, scroll a posición
- **Funciones**: Modificar `loadVehicle()` (cop15.js ~línea 615) para guardar contexto
- **Funciones**: Crear `resumeLastSession()` en app.js

#### C2. Per-Field Auto-Save Draft
- Si el técnico estaba llenando el formulario y cierra la app, los campos parciales se pierden
- **Crear**: `saveDraft(vehicleId)` que guarda TODOS los campos del formulario actual
- Guardar en `localStorage.kia_cop15_draft_{vehicleId}`
- Al cargar vehículo, detectar draft y restaurar campos
- Mostrar banner: "Se restauraron campos guardados" con botón [Descartar]

#### C3. Last Module Memory
- Guardar último módulo/tab visitado: `localStorage.kia_last_module = 'inventory:inv-zonemap'`
- En startup, si no hay vehículo activo, navegar al último módulo usado
- **Funciones**: Hook en `switchPlatform()` (app.js ~línea 1211) y en cada `*SwitchTab()`

---

## TIER D — Guided Workflow ("¿Qué Sigue?")
**Prioridad: ALTA** | **Archivos: `js/cop15.js`, `js/app.js`**

### Problema
Después de cada acción el técnico debe decidir qué hacer. El soak termina y el técnico no sabe que debe ir al formulario de dyno. Registra un vehículo y no sabe que el siguiente paso es precondicionamiento.

### Cambios

#### D1. Next Step Engine (`js/cop15.js`)
- **Crear**: `getNextStep(vehicle)` que retorna la acción recomendada:
  ```js
  function getNextStep(vehicle) {
    if (status === 'registered')
      return { action: 'Iniciar Precondicionamiento', goto: 'acc-precond', icon: '🔧' };
    if (status === 'in-progress' && precondComplete && !soakStarted)
      return { action: 'Iniciar Soak Timer', goto: 'soak-section', icon: '⏱️' };
    if (status === 'in-progress' && soakComplete && !testStarted)
      return { action: 'Iniciar Prueba de Emisiones', goto: 'acc-dyno', icon: '🏭' };
    if (status === 'testing' && testComplete)
      return { action: 'Verificar y Liberar', goto: 'release-tab', icon: '✅' };
    if (status === 'ready-release')
      return { action: 'Liberar Vehículo', goto: 'release-action', icon: '🚗' };
  }
  ```

#### D2. Floating Next Step Banner
- Banner persistente abajo de la pantalla (tipo action bar) que muestra:
  ```
  ┌─────────────────────────────────────────┐
  │ ⏱️ Siguiente: Iniciar Soak Timer  [→]  │
  └─────────────────────────────────────────┘
  ```
- Click en [→] navega directamente: abre accordion correcto, scroll al campo, focus
- Se actualiza automáticamente cuando el status del vehículo cambia
- Usa `renderAutoAdvanceSuggestion()` existente (cop15.js ~línea 1649) como base, pero siempre visible

#### D3. Soak Complete → Auto-Prompt
- Cuando `soakTimerTick()` detecta 100% (cop15.js ~línea 4051):
  - Además de notificación browser, mostrar **modal con acción**:
    ```
    ⏱️ ¡Soak Completado!
    VIN: ...4832 está listo para prueba.
    [Ir a Formulario de Prueba]  [Después]
    ```
  - "Ir a Formulario" → carga vehículo, abre `acc-dyno`, focus en primer campo
  - Si la app estaba cerrada y soak expiró, mostrar este modal en el próximo `initializeSystem()`

#### D4. Post-Release Quick Actions
- Después de `finishRelease()` (cop15.js ~línea 1983), mostrar:
  ```
  ✅ VIN ...4832 liberado exitosamente.
  [Registrar Otro] [Ver en Plan] [Ir a Dashboard]
  ```
- "Registrar Otro" → limpia formulario, focus en propósito
- Reduce navegación entre release y siguiente alta

---

## TIER E — Form Speed Boosters
**Prioridad: ALTA** | **Archivos: `js/cop15.js`, `js/inventory.js`**

### Problema
13 clicks para un alta. 20+ campos en dyno. Cada campo es manual. El técnico repite las mismas configuraciones docenas de veces.

### Cambios

#### E1. Quick-Pick de Propósito (cop15.js ~línea 130)
- Encima del dropdown, mostrar los últimos 3 propósitos como botones:
  ```
  [COP-Emisiones] [EO-Emisiones] [COP-OBD2]
  ```
- Un tap selecciona y avanza al siguiente campo
- Guardar en `localStorage.kia_purpose_history` (max 5)

#### E2. Smart Config Suggestion (cop15.js ~línea 164)
- Al iniciar cascade, mostrar las 5 configuraciones más usadas como cards:
  ```
  Configuraciones frecuentes:
  [Seltos 2.0L AT EURO-6C] [Sportage 1.6T DCT SULEV30] [Forte 2.0L MT EURO-5]
  ```
- Un tap = cascade completo pre-llenado instantáneamente
- Auto-calcula frecuencia desde `db.vehicles` archivados por `configCode`
- Se actualiza cada vez que se archiva un vehículo
- Persistir ranking en `localStorage.kia_config_ranking`

#### E3. Favorites / Templates Rápidos (cop15.js)
- Botón "⭐ Favoritos" que guarda configuraciones frecuentes:
  ```
  ⭐ Seltos 2.0L AT EURO-6C (12 usos)
  ⭐ Sportage 1.6T DCT SULEV30 (8 usos)
  ```
- Un tap = cascade pre-llenado, solo falta VIN y operador
- Auto-detectar frecuencia de `db.vehicles` por configCode
- Persistir en `localStorage.kia_config_favorites`

#### E4. VIN Smart Input (cop15.js ~línea 500)
- Auto-uppercase al escribir
- Auto-strip espacios y guiones
- Validación checksum (posición 9 del VIN estándar)
- Si VIN ya existe en `db`, mostrar: "⚠️ VIN ya registrado [Ver vehículo]"
- Si VIN fue archivado, ofrecer: "Re-test de VIN anterior? [Copiar config]"

#### E5. Batch Release (cop15.js ~línea 1983)
- Botón "Liberar Todos los Listos" cuando hay 2+ vehículos en `ready-release`
- Loop por cada uno, ejecuta `finishRelease()` con progress bar
- Summary al final: "✅ Liberados 4 vehículos"
- Undo disponible para todo el batch

#### E6. One-Tap Precond Fields
- Para campos repetitivos (fuel type, tire pressure, cycle), mostrar valor más frecuente como chip:
  ```
  Presión neumáticos: [32 psi ⭐] [___]
  Combustible: [Gasolina ⭐] [___]
  ```
- El técnico toca el chip → campo llenado. Solo escribe si es diferente.
- Calcula frecuencias de `db.vehicles` archivados con mismo `configCode`

---

## TIER F — Mi Turno (Personalized Dashboard)
**Prioridad: MEDIA** | **Archivos: `js/app.js`, `js/cop15.js`, `js/panel.js`**

### Problema
El dashboard muestra todo para todos. El técnico no sabe cuáles son SUS vehículos, SUS tareas pendientes, SU progreso del día.

### Cambios

#### F1. "Mi Turno" Card en Daily Dashboard (app.js ~línea 2464)
- Basado en operador loggeado (de `kia_last_operator` o sesión auth):
  ```
  ┌─ Mi Turno ─────────────────────┐
  │ 👤 Operador: Jorge N.           │
  │ 📋 Mis vehículos: 3 activos    │
  │  • ...4832 → Soak (14hr restantes) │
  │  • ...7291 → Listo para liberar │
  │  • ...0156 → En precond         │
  │ 📊 Hoy: 2 liberados, 1 en test │
  │ [Ver mis vehículos]             │
  └─────────────────────────────────┘
  ```
- Filtra `db.vehicles` por `operator === currentOperator` (campos `reg_operator`, `testResponsible`)

#### F2. Quick Actions desde Dashboard
- Botones de acción directa en cada vehículo del "Mi Turno":
  ```
  ...4832 → Soak ⏱️ [Ver Timer]
  ...7291 → Listo ✅ [Liberar Ahora]
  ...0156 → Precond 🔧 [Continuar]
  ```
- Un tap → navega directo al vehículo en el formulario correcto

#### F3. Shift Progress Ring
- Anillo visual: "Hoy: 5/8 target" (si hay target definido)
- Se llena a medida que el técnico libera vehículos
- Usa `buildProgressRing()` existente en app.js

---

## Orden de Implementación

```
Tier A (Integration)     ← Fundamento de datos integrados
  ↓
Tier C (Session Memory)  ← Quick win ENORME: "Retomar donde me quedé"
  ↓
Tier D (Guided Workflow) ← El técnico nunca se pierde: siempre sabe qué sigue
  ↓
Tier E (Form Speed)      ← De 13 clicks a 3-4 clicks por alta
  ↓
Tier F (Mi Turno)        ← Dashboard personalizado
  ↓
Tier B (Executive)       ← Para el gerente, usa data del Tier A
```

---

## Verificación

1. **Session Memory (C)**: Cerrar app con vehículo abierto → reabrir → verificar prompt "Retomar?"
2. **Next Step (D)**: Registrar vehículo → verificar banner "Siguiente: Iniciar Precond" → click → va al lugar correcto
3. **Soak Prompt (D3)**: Iniciar soak de 5 seg → esperar → verificar modal "Ir a Formulario"
4. **Quick-Pick (E1)**: Registrar 3 vehículos → verificar que propósitos aparecen como botones
5. **Config Search (E2)**: Pegar código de config → verificar cascade se resuelve instantáneamente
6. **Batch Release (E5)**: Tener 3 vehículos ready → "Liberar Todos" → verificar los 3 archivados
7. **Mi Turno (F)**: Loggearse como operador → verificar que dashboard muestra solo mis vehículos
8. **Integration (A)**: Liberar vehículo → verificar inventario actualizado + plan reconoce
9. **Build**: `./build.sh` sin errores, `node --check js/*.js` todos pasan

## Archivos Críticos

| Archivo | Tiers |
|---------|-------|
| `js/app.js` | A1/A5 (event bus), C1/C3 (session memory), D (next step banner), F1 (mi turno) |
| `js/cop15.js` | C1/C2 (vehicle memory + drafts), D1-D4 (guided workflow), E1-E6 (form speed) |
| `js/inventory.js` | A2 (auto-deduction) |
| `js/testplan.js` | A3 (availability check) |
| `js/results.js` | A4 (quality feedback), B4 (Cpk alerts) |
| `js/panel.js` | B1-B3 (executive), F2 (quick actions) |
| `styles.css` | Next step banner, mi turno card, quick-pick chips, progress ring |
