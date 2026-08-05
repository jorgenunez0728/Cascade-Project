# Integrar COP15-F11 (Plan Maestro de Mantenimiento y Calibración) a KIA EmLab

## Context

Los jefes formalizaron el control de mantenimiento y calibración del laboratorio en el formato
**COP15-F11 rev 03** (archivo Excel adjunto). Ese archivo hoy vive fuera de la plataforma: se
actualiza a mano, nadie lo ve desde el piso del laboratorio y sus vencimientos no disparan nada.

La plataforma ya cubre **una parte**: `Pruebas → 📦 Consumibles → 🔧 Equipos` tiene 31 instrumentos
con `lastCalDate`/`nextCalDate`. Le faltan: los campos formales del F11 (magnitud, tipo de
calibración, proveedor, lugar, rango, error máximo, crítico NMX), 18 instrumentos, el registro de
equipos padre, **todo el mantenimiento preventivo** (catálogo de actividades, Plan Maestro de 52
semanas, historial de ejecución) y el dashboard de cumplimiento.

**Resultado buscado:** que el F11 completo viva dentro de la plataforma, con la disciplina de la
casa — **la menor interacción posible**: registrar una calibración o un mantenimiento debe ser un
toque, no llenar un formulario; consultar el estado debe ser abrir una pestaña, no leer una matriz.
El Excel sigue existiendo para los jefes, pero se **genera** desde la plataforma (CSV/PDF), no se
captura aparte.

**Decisiones ya tomadas con el usuario:**
1. Vive **dentro de Consumibles** (reusa `invState`/`invSave`/sync/tabCache). Sin módulo nuevo.
2. Los 49 instrumentos del Excel se **fusionan sin perder nada** con los 31 actuales (lo capturado
   en la app gana; el Excel solo rellena campos vacíos y agrega los 18 faltantes).
3. Mantenimiento **avisa** al Plan (semanas no disponibles), **no bloquea** solo.
4. Salidas: **CSV por hoja + PDF del Plan Maestro + importación CSV**.

**Archivo fuente:** `/root/.claude/uploads/90dae966-7c26-5615-ad6e-861e6ffa7e55/1105af88-COP15F11_Plan_Maestro_Mantenimiento_y_Calibracion2.xlsx`
(hojas: Instrucciones, Equipos ×14, Actividades ×3, Plan Maestro 52 sem, Historial, Calibración ×49,
Dashboard, Listas). **Copiarlo al repo** como `docs/COP15-F11_rev03.xlsx` antes de tocar código, para
que el seed sea reproducible cuando el upload expire.

---

## 1. Modelo de datos — solo `invState` (`js/inventory.js`)

Agregar 4 campos a `invState` (declaración ~línea 13). **Nada derivado se guarda**: la matriz de 52
semanas y el % de cumplimiento se calculan en cada render.

```js
assets: [],          // {id:'E-001', name, lab, brand, model, serialNo, status, notes, blocksTesting}
maintActivities: [], // {id:'A-01', assetId:'E-013', desc, freq:'Mensual', startWeek:2, responsible, active:true}
maintLog: [],        // {id, date:'YYYY-MM-DD', assetId, activityId, by, hours, comments, createdAt}
f11Seed: 0           // guard de migración (=3 cuando ya se aplicó la rev 03)
```

`equipment[]` (los instrumentos = hoja Calibración) **reusa los campos que ya existen** —
`name, type, brand, model, serialNo, kmmId, location, traceability, calLab, calFreq, magnitude,
lastCalDate, nextCalDate, calCertNo, critical` — y solo suma los que faltan:
`f11Id ('C-001')`, `assetId`, `requiresCal ('Sí'|'No')`, `calType ('Interna'|'Externa')`,
`calPlace ('En sitio'|'Externo Nacional'|'Externo USA')`, `rangeMax`, `rangeUse`, `maxError`,
`comments`, `calHistory: [{date, certNo, provider, by, at}]`.

> No crear `calProvider`: el proveedor es el `calLab` que ya existe. No crear `nextCalibration`:
> ese nombre es el bug del punto 6.

**Listas cerradas** (hoja Listas), como constantes globales en inventory.js:
```js
var INV_CAL_FREQ_DAYS  = { Semestral:182, Anual:365, Bianual:730 };
var INV_MTTO_FREQ_WEEKS= { Semanal:1, Quincenal:2, Mensual:4, Bimestral:8, Trimestral:13, Semestral:26, Anual:52 };
var INV_LABS = ['Emisiones','Materiales','Calibración'];
var INV_CAL_PLACES = ['En sitio','Externo Nacional','Externo USA'];
```

**Tope de crecimiento:** `maintLog` se poda en `invCompactReadings()` (ya existe, ~línea 70):
conservar los últimos 1000 registros o 3 años, lo que sea mayor.

---

## 2. Seeds y migración única (`js/inventory.js`)

Tres literales + una función, junto al preload existente de `equipment` (~línea 92).

- `INV_ASSETS_SEED_F11` — 14 equipos, tal cual la hoja Equipos:
  E-001 HVAC/Kimo, E-002 VETS/Vaisala, E-003 Clean Cham/Shynyei, E-004 CFO/Horiba,
  E-005 CPC-100/Horiba, E-006 Rack/Horiba, E-007 Venturi/Horiba, E-008 GDC/Horiba,
  E-009 Bubbler/Horiba, E-010 RMT1-TS, E-011 Manometer 1/ManoStar, E-012 Manometer 2/ManoStar,
  E-013 Dynamometer/A&G, E-014 Laboratorio/FLUKE — todos `lab:'Emisiones'`, `status:'Activo'`.
  Marcar `blocksTesting:true` en **E-013 Dynamometer** y **E-003 Clean Cham** (los que paran pruebas).
- `INV_CAL_SEED_F11` — 49 filas (C-001…C-049) con las 24 columnas de la hoja Calibración, más
  `assetId` y `legacyId` (ver tabla abajo). Extraerlas del xlsx con openpyxl y pegarlas como literal
  JS; no inventar valores: las celdas vacías van como `''`.
- `INV_MTTO_ACT_SEED_F11` — las 3 actividades reales de la hoja Actividades:
  `A-01 Dynamometer · Limpieza (soplado) · Mensual · sem 2 · Técnico`,
  `A-02 HVAC · Inspección general de filtros · Trimestral · sem 1 · Técnico`,
  `A-03 Clean Cham · Reemplazo (componentes) · Semestral · sem 26 · General`.
  **No** sembrar la fila de ejemplo de la hoja Historial (dice "EJEMPLO — sustituir").

**`_invMigrateF11()`** — corre una sola vez por dispositivo, guardada por `invState.f11Seed >= 3`,
**después** del preload existente de `equipment` y **antes** del primer render; idempotente (segura
tras cada sync):
1. Si `assets` está vacío → sembrar los 14.
2. Por cada fila del seed de calibración, buscar el instrumento existente en este orden:
   `f11Id` → `legacyId` → `kmmId` no vacío → `serialNo` no vacío.
   - **Encontrado:** fijar `f11Id`/`assetId` y **rellenar únicamente los campos vacíos o ausentes**
     (`if (!eq[k]) eq[k] = seed[k]`). Nunca sobrescribir nombre, fechas ni certificados capturados.
   - **No encontrado:** `push` como nuevo con `id: 'eq_f11_c001'`.
3. Si `maintActivities` está vacío → sembrar las 3.
4. `invState.f11Seed = 3`; `invSave()`; `auditLog('inv','f11_migrado',{type:'equipment',label:'COP15-F11 rev03'}, 'N enlazados, M nuevos')`.

**Tabla de correspondencia `legacyId` → `f11Id`** (los 31 actuales; es la parte riesgosa — muchas
filas del Excel no tienen KMM ID ni serie, así que el enlace va explícito en el seed, no por heurística):

| legacyId | f11Id | | legacyId | f11Id | | legacyId | f11Id |
|---|---|---|---|---|---|---|---|
| eq_th0033 | C-003 | | eq_bubbler | C-022 | | eq_dyno_torque_r | C-046 |
| eq_th004303 | C-005 | | eq_th0036 | C-023 | | eq_th0020 | C-047 |
| eq_th004302 | C-006 | | eq_pr0017 | C-024 | | eq_pr0002 | C-048 |
| eq_th004301 | C-007 | | eq_pr0016 | C-025 | | eq_mass_01 | C-031 |
| eq_th004402 | C-009 | | eq_dyno_dw | C-027 | | eq_mass_02 | C-032 |
| eq_th004401 | C-010 | | eq_dyno_roller_f | C-028 | | … | … |
| eq_pr018 | C-017 | | eq_dyno_roller_r | C-029 | | eq_mass_10 | C-040 |
| eq_ot0038 | C-021 | | eq_dyno_arm | C-030 | | eq_dyno_speed_f | C-043 |
| | | | eq_dyno_torque_f | C-045 | | | |

`eq_mass_01..10` → `C-031..C-040` en orden. Los **18 restantes son altas nuevas**:
C-001, C-002, C-004, C-008, C-011, C-012, C-013, C-014, C-015, C-016, C-018, C-019, C-020, C-026,
C-041, C-042, C-044, C-049. (31 enlazados + 18 nuevos = 49 ✓ — usar este conteo como prueba.)

---

## 3. Funciones derivadas (`js/inventory.js`) — una sola definición cada una

Misma disciplina que `tpCoverageSummary()`: **estas son LA definición**; ningún consumidor recalcula.

| Función | Devuelve |
|---|---|
| `invCalStatus(eq)` | `{code:'vigente'\|'porvencer'\|'vencido'\|'noaplica'\|'sinregistro', days, color, label}`. Umbral **60 días** (ámbar) según el F11; `requiresCal==='No'` → `noaplica`; requiere pero sin `lastCalDate` → `sinregistro`. |
| `invCalNextDate(lastISO, freq)` | Próxima fecha usando `INV_CAL_FREQ_DAYS` (default Anual). |
| `invCalSummary()` | `{total, requiere, vigentes, porVencer, vencidos, sinRegistro, pct}` — replica la hoja Dashboard. |
| `invWeekOfYear(dateISO)` / `invMondayOfWeek(year, week)` | Semana ISO 1-52. **No existe helper de semana en el repo** — crearlos aquí. |
| `invMaintWeeksFor(act, year)` | Semanas planeadas: `startWeek`, `+INV_MTTO_FREQ_WEEKS[freq]`, … ≤52. |
| `invMaintMatrix(year)` | `[{act, asset, weeks:[{n, planned, done, overdue}]}]` — la matriz, calculada, nunca guardada. |
| `invMaintCompliance(year)` | `{planned, doneOnWeek, logged, pct, byAsset:[{name, plan, real, pct}]}` — hoja Dashboard. |
| `invMaintDueThisWeek()` / `invMaintOverdue()` | Alimentan HOY y las alertas del Panel. |
| `invMaintPlannedForWeek(mondayISO)` | Actividades de esa semana; filtrable por `asset.blocksTesting` (integración con Plan). |
| `invMaintMarkDone(activityId, opts)` | Escribe en `maintLog` (`by` = operador actual), `invSave()`, `auditLog('inv','mtto_ejecutado',…)`. |
| `invCalRegister(eqId, {date, certNo, provider})` | Fija `lastCalDate`/`calCertNo`/`calLab`, calcula `nextCalDate`, hace push a `calHistory`, `auditLog('inv','calibracion_registrada',…)`, y llama `fbPostCalibration(name)` (ya existe). |

---

## 4. UI — dos pestañas, ambas "abrir y entender"

En `index.html` (~línea 1031, barra `#inv-tabs-bar`): sacar **🔧 Equipos** del menú `⋯ Más` a la barra
principal y agregar **🛠️ Mtto** junto a él. Registrar `'inv-maint'` en `_invTabs` (~línea 99) y en
`_invGetRenderer` (~línea 141). Ambas son pestañas normales de `tabCacheSwitch` — sin patrones nuevos.

### 4.1 `inv-equipment` → "Equipos y Calibración" (`invRenderEquipment`, reescribir)

1. **5 tiles arriba** (mismo `.tp-metric` de siempre): Vigentes / Por vencer ≤60d / **VENCIDOS** /
   Sin registro / **% de vigencia** — desde `invCalSummary()`.
2. **Banner rojo** si hay instrumentos `critical==='Sí'` vencidos: *"N instrumentos críticos vencidos —
   identificar el equipo como NO OPERABLE"* (texto del punto 3 de las Instrucciones del F11), con los
   nombres y un botón por instrumento.
3. **Buscador + chips de filtro** (Todos / 🔴 Vencidos / 🟠 Por vencer / 🟢 Vigentes / ⚪ No aplica).
   Reusar `_invDebouncedRender`.
4. **Agrupado por equipo padre**: 14 tarjetas plegables (`<details>`, abiertas solo las que tienen
   algo vencido), cada una con el punto de color del peor estatus y "n/m vigentes". Dentro, una fila
   por instrumento: magnitud · KMM ID · próxima fecha · badge de días.
5. **Acción principal por fila: `✅ Calibrado`** → modal mínimo de **3 campos** (fecha = hoy
   precargada, No. de certificado, proveedor precargado con el anterior) → `invCalRegister()` calcula
   la próxima fecha sola. Ese es el flujo diario: dos toques y el número de certificado.
   Secundaria `✏️` → `invAddEquipment()` completo (ver 4.3).

### 4.2 `inv-maint` → "Mantenimiento" (`invRenderMaint`, nueva)

El orden importa: **primero lo que hay que hacer, la matriz hasta abajo y plegada.**

1. **⚠️ Vencidos** (`invMaintOverdue()`) — rojo, arriba de todo, con `✔ Hecho` de un toque.
2. **📅 Esta semana** — "Semana 32 · 3 mantenimientos programados". Cada fila: equipo · actividad ·
   responsable · botón **`✔ Hecho`** (registra fecha=hoy y operador actual; sin modal). Enlace
   pequeño "…con detalle" para capturar horas/comentarios.
3. **📊 Cumplimiento** (`invMaintCompliance(year)`) — tiles Planeados / Realizados en semana /
   % Global + tabla por equipo. Es la hoja Dashboard del Excel, viva.
4. **🗓️ Plan Maestro 52 semanas** — dentro de `<details>` **cerrado por defecto**. Selector de año
   (default: año actual). Grid con scroll horizontal propio (`overflow-x:auto`), encabezado de mes +
   número de semana, filas agrupadas por equipo: `P` planeada, `✓` ejecutada, celda roja = planeada,
   pasada y sin registro. Tap en celda → `✔ marcar hecho`. Columna de la semana actual resaltada.
5. **🔧 Catálogo de actividades** (`<details>` cerrado) — alta/edición: equipo (select de `assets`),
   descripción, frecuencia (select de las 7), semana inicio (1-52), responsable, activa. Al guardar,
   el Plan Maestro se regenera solo (es derivado).
6. **📋 Historial** (`<details>` cerrado) — últimos 50, filtro por equipo/año, botón de exportar.

### 4.3 Modal de instrumento (`invAddEquipment`, extender)

Agregar los campos F11 faltantes **sin volverlo un muro**: sección 1 abierta (Identificación:
nombre, equipo padre, magnitud, marca, modelo, serie, KMM ID); secciones 2 y 3 en `<details>`
(Calibración: requiere/tipo/frecuencia/proveedor/trazabilidad/lugar/última/próxima/certificado —
**la próxima se autocalcula** al elegir última+frecuencia, editable; Metrología: rango máximo, rango
de uso, error máx., ubicación física, crítico NMX, comentarios). Selects, no texto libre, donde la
hoja Listas define valores cerrados. Al final del modal, la llamada a `cascadeInjectTooltips()` que
ya está.

### 4.4 Registro de equipos padre

No merece pestaña propia: se administra desde el encabezado de cada tarjeta de grupo en
`inv-equipment` (`✏️` sobre el nombre del equipo) — id, nombre, laboratorio, marca, modelo, serie,
estatus, `blocksTesting`, notas.

---

## 5. Integraciones cross-módulo

- **HOY** (`dashCollectActivities`, `js/app.js` ~2117): reemplazar el bloque actual de equipos por
  uno basado en `invCalStatus` (umbral 60 d, no 30) y **agregar mantenimiento**: vencidos
  (`urgency:3`) y de esta semana (`urgency:2`), `cat:'inventario'`, icono 🛠️, con
  `checkbox: {js:'invMaintMarkDone("A-01");dailyDashRender();'}` — el mismo patrón que ya usan los
  ítems del plan semanal, o sea **un toque desde HOY sin entrar al módulo**. Registrar las claves de
  ayuda dentro de `_dashRegisterHelp()`.
- **Alertas del Panel** (`pnGetActiveAlerts`, `js/panel.js:1684-1695`): **corregir un bug existente** —
  lee `eq.nextCalibration`, campo que no existe (el real es `nextCalDate`), así que **las alertas de
  calibración nunca se han disparado**. Apuntarlo a `invCalStatus(eq)` y sumar una fuente
  `'Mantenimiento'` con los vencidos. Ojo: `dashCollectActivities` filtra por `a.source` — al agregar
  la fuente nueva, incluirla en el filtro anti-duplicado del punto 8 de esa función (`js/app.js:2148`).
- **Lab Overview** (`renderLabOverview`, panel.js — única fuente de KPIs cross-módulo): una línea
  compacta *"🔧 Calibración X% vigente · N vencidos · M mtto pendientes"*, con `typeof` guard.
- **Plan → Disponibilidad** (`tpRenderAvailability`, `js/testplan.js` ~3016): por cada semana, si
  `invMaintPlannedForWeek(monday)` trae actividades de equipos con `blocksTesting`, mostrar
  *"🛠️ Mantenimiento programado: Dynamometer — Limpieza (soplado)"* y un botón **"Marcar no
  disponible"** que fija `weekAvailability[monday].available=false` + `note`. **Solo avisa; nada se
  marca solo** (decisión del usuario). Guardar con `typeof invMaintPlannedForWeek === 'function'`.
- **Bitácora** (opcional, barato): al registrar un mantenimiento, ofrecer alta en el shift log con
  categoría `'Mantenimiento'` — la categoría ya existe en `panel.js:1475`.

---

## 6. Sincronización (`js/firebase-sync.js`)

Sin esto, un pull puede **borrar** el mantenimiento capturado en otro dispositivo: el inventario se
resuelve por *score* y reemplaza `invState` completo (`_fbPullSeed`, línea ~1218).

1. `_fbPullLocalScore('inventory')` (línea 1188) y el `_invScoreFn` gemelo (línea 1258): sumar
   `(assets||[]).length + (maintActivities||[]).length + (maintLog||[]).length`.
2. En la rama `inventory` de `_fbPullSeed` (y en `_fbPullAdoptByCount`): guardar los arrays locales
   **antes** de reemplazar y volver a fusionarlos después —
   `maintLog` unión por `id` (append-only, gana el `createdAt` mayor), `maintActivities` y `assets`
   unión por `id` (gana el más reciente). Copiar el patrón de `_fbMergeTasks` (línea ~1350).
3. `equipment[].calHistory`: unión por `date+certNo` al fusionar, misma idea.
4. `f11Seed` no se sincroniza como dato de negocio: si el remoto trae `f11Seed` menor, dejar el mayor.

---

## 7. Salidas COP15-F11 (`js/inventory.js` + `pnRenderReports`)

Funciones nuevas en inventory.js, registradas en el **Centro de Reportes** (`js/panel.js:741`,
array `reports`) — el despachador `pnRunReport` ya resuelve por nombre global, no hay que tocarlo:

- `invExportF11Equipos()` / `invExportF11Calibracion()` / `invExportF11Actividades()` /
  `invExportF11Historial()` — CSV con **exactamente los encabezados del Excel**, en el mismo orden,
  para pegar directo en el formato oficial. Reusar el patrón de blob/descarga de `invExportReport`
  (`js/inventory.js:4047`).
- `invImportF11CSV(csvText)` — actualización en bloque desde el mismo formato. Empata por `f11Id`,
  luego `kmmId`, luego `serialNo`; **muestra un resumen "N actualizados, M nuevos, K sin cambio" y
  pide confirmación antes de escribir**; `undoPush('inventory','Importar F11')` primero,
  `auditLog` después. Mismo espíritu de merge que `tpImportPlanCSV` (`js/testplan.js:645`).
- `invMaintPlanPDF()` — Plan Maestro 52 semanas + dashboard de cumplimiento, **landscape/letter**,
  con el encabezado del formato (Código COP15-F11 · Revisión 03 · año). Copiar la estructura de
  `generateWeeklyStatusPDF` (`js/app.js:2644`): guard de `window.jspdf`, `showOverlayLoading`,
  helpers `setF`/`addSection`.

Cinco filas nuevas en el array `reports` de `pnRenderReports`, con icono 🔧/🛠️ y descripción corta.

---

## 8. Ayuda y accesibilidad (regla v16.0 — obligatoria, no opcional)

- `HELP_TABS`: actualizar `'inv-equipment'` a la semántica F11 (semáforo 60 d, NO OPERABLE) y crear
  `'inv-maint'` — ambos con `title`, `text` y 3 `tips`. Van en el `Object.assign(HELP_TABS, {...})`
  del final de `js/inventory.js` (~línea 4374). El banner se inyecta solo: `invRender` ya llama
  `helpInjectBannerDeferred('inv', tab)` (línea 162).
- `CASCADE_TOOLTIPS` (mismo bloque del final del archivo) para cada campo no obvio:
  `inv-eq-freq`, `inv-eq-caltype`, `inv-eq-place`, `inv-eq-trace`, `inv-eq-maxerror`,
  `inv-eq-critical`, `inv-eq-requires`, `inv-mtto-freq`, `inv-mtto-startweek`, y con `data-help=`
  en los títulos sin `<label for>`: `inv-cal-semaforo-help`, `inv-maint-plan-help`,
  `inv-maint-compliance-help`, `inv-maint-catalog-help`.
- `TOURS.inventory` (`js/app.js:3719`): dos pasos nuevos — `✅ Calibrado` y `✔ Hecho` de la semana.
- `HELP_GLOSSARY`: Trazabilidad, EMA/ANAB/NVLAP, calibración Interna vs Externa, semana ISO,
  NO OPERABLE, Crítico NMX.

---

## 9. Archivos que se tocan

| Archivo | Qué |
|---|---|
| `js/inventory.js` | Todo el núcleo: estado, seeds, migración, derivadas, `invRenderEquipment` reescrito, `invRenderMaint` nuevo, modales, exportadores, importador, PDF, ayuda. **~1200 líneas nuevas.** |
| `index.html` | Barra `#inv-tabs-bar` (~1031): 🔧 Equipos a la barra principal + 🛠️ Mtto. |
| `js/app.js` | `dashCollectActivities` (~2117), `_dashRegisterHelp`, `TOURS.inventory`, `HELP_GLOSSARY`. |
| `js/panel.js` | `pnGetActiveAlerts` (1684, incluye el fix del bug), `renderLabOverview`, array `reports` (741). |
| `js/testplan.js` | `tpRenderAvailability` (~3016): aviso de mantenimiento + botón. |
| `js/firebase-sync.js` | Scores (1188, 1258) y merge de los arrays nuevos (~1218). |
| `docs/COP15-F11_rev03.xlsx` | Copia del Excel fuente (trazabilidad del seed). |
| `CHANGELOG.md`, `CLAUDE.md` | Entrada v16.4 + sección de módulo/localStorage. |

**Nunca editar `kia-emlab-unified.html`** — lo genera `build.sh`.

---

## 10. Verificación

1. `node --check js/inventory.js js/app.js js/panel.js js/testplan.js js/firebase-sync.js`
2. `./build.sh`, luego `node --check` sobre el `<script>` inline más grande del bundle generado
   (`kia-emlab-unified.html`) — convención del proyecto.
3. Abrir `index.html` en el navegador (Chromium está preinstalado) y comprobar:
   - **Migración:** consola sin errores; `invState.equipment.length === 49`,
     `invState.assets.length === 14`, `invState.maintActivities.length === 3`,
     `invState.f11Seed === 3`. Recargar dos veces: los números **no cambian** (idempotente).
   - **Sin pérdida:** un instrumento previamente editado a mano conserva su nombre y sus fechas;
     los que estaban vacíos ahora traen magnitud/proveedor/rango del Excel.
   - **Contra el Excel:** los tiles deben dar **25 vigentes / 16 vencidos / 2 sin registro /
     43 requieren / 58.1 %** — exactamente la hoja Dashboard del archivo.
   - **Un toque:** `✅ Calibrado` en un instrumento Anual con fecha de hoy → `nextCalDate` = hoy+365
     y desaparece del rojo. `✔ Hecho` en un mantenimiento de esta semana → `✓` en la matriz y sube
     el % de cumplimiento.
   - **Plan Maestro:** con A-01 (Dynamometer, Mensual, semana 2) las columnas 2, 6, 10, 14… traen `P`;
     las pasadas sin registro salen en rojo.
   - **HOY:** aparecen las calibraciones vencidas y el mantenimiento de la semana, y el check las
     cierra sin salir de HOY.
   - **Plan → Disponibilidad:** la semana 26 (A-03, Clean Cham) muestra el aviso 🛠️ y el botón
     "Marcar no disponible"; **nada se marca solo**.
   - **Alertas del Panel:** ahora sí listan calibraciones vencidas (antes el bug de `nextCalibration`
     las silenciaba) y no se duplican en HOY.
4. **Round-trip:** exportar los 4 CSV → abrir uno, cambiar una fecha → reimportar con
   `invImportF11CSV` → confirmar el resumen previo, que el cambio se aplique y que `Ctrl+Z` lo
   revierta. Generar el PDF del Plan Maestro y revisar que quepan las 52 semanas en landscape.
5. **Sync:** con Firebase activo, registrar un mantenimiento en el dispositivo A y una calibración en
   el B; sincronizar ambos y verificar que **ninguno de los dos registros se pierde**.
6. Móvil (<768 px): la barra de pestañas no se desborda y la matriz de 52 semanas hace scroll
   horizontal **dentro de su contenedor**, sin mover la página.

## 11. Entrega

Commits temáticos (modelo+migración → UI → integraciones → exportaciones → ayuda/docs) en la rama
`claude/plan-integracion-mantenimientos-0qiafp`, y `git push -u origin` a esa rama. Sin PR salvo que
el usuario lo pida.
