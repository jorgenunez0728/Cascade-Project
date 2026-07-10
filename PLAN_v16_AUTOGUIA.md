# v16.0 — Plataforma autoguiada (ayuda total + accesibilidad)

> **NOTA PARA EL EJECUTOR (Sonnet 5):** Este plan fue escrito por Fable 5 tras explorar el repo
> a fondo. Está diseñado para que lo ejecutes SIN re-derivar decisiones. Sigue las secciones en
> orden, respeta los PITFALLS (§P) al pie de la letra, y usa la receta de verificación (§V) tal
> cual — ya está probada en este repo. Cuando este plan diga "escribe el texto siguiendo la
> plantilla", la calidad del español importa tanto como el código: lee §C1 antes de redactar.

## Contexto

El usuario (jefe del laboratorio de emisiones KIA México) quiere una "inflexión total de
accesibilidad": que cualquier persona nueva llegue a CUALQUIER pantalla y sepa qué es, qué hacer
y qué capturar en cada campo — tooltips, explicaciones por pestaña, estados vacíos guiados —
sin depender de que alguien le explique. Hoy el único sistema de ayuda estructurado es
`CASCADE_TOOLTIPS` (36 campos, solo COP15); Test Plan, Inventario, Panel, CoP y HOY están
"pelones" (Panel tiene CERO ayudas).

**Decisiones asumidas** (el usuario no respondió las preguntas de alcance; se tomaron las
opciones recomendadas — si el usuario pide otra cosa al aprobar, ajustar):
- Autoguía completa (tooltips + explicación por pestaña + empty states + placeholders).
- Tours cortos por módulo, relanzables (extensión del tour existente).
- Accesibilidad técnica LIGERA (aria-labels en botones de icono, sin auditoría WCAG).
- Glosario del laboratorio enlazado desde la ayuda.
- Formato: **banner descartable por pestaña** (persistido por dispositivo) + botón ℹ️ para
  releerlo cuando se quiera. Nada "siempre visible" que estorbe a los veteranos.

## Hechos del repo que DEBES conocer (verificados)

- SPA JS global sin módulos; español; tema claro único. `index.html` = desarrollo;
  `kia-emlab-unified.html` = **GENERADO por `./build.sh` — NUNCA editarlo**.
- Sistema existente `CASCADE_TOOLTIPS` (cop15.js:6032) = `{ fieldId: {title, text} }`;
  `cascadeInjectTooltips()` (cop15.js:6160) es **idempotente** (borra todos los
  `.cascade-help-btn` y re-inyecta), busca `label[for=id]` o el `<label>` del `.form-group`
  padre, y NO depende de COP15 — es generalizable. Popup: `cascadeShowTooltip(fieldId)`
  (cop15.js:6198). Hoy solo se invoca en cop15.js:718 y :765.
- Tour existente: `_tourSteps` (app.js:3667, 5 pasos `{target, title, text, position, tab?}`),
  `startTour()` :3676, `_renderTourStep()` :3681, persiste `kia_tour_done`; primera visita
  app.js:2999; botón `?` del topbar (index.html:79) lo relanza. **En móvil el tour está oculto**
  (`styles.css:1358` `.tour-overlay{display:none!important}`) — los banners cubren móvil.
- Renders por módulo (hook points para re-inyectar ayuda tras cada render):
  `dailyDashRender` (app.js), `tpRender`/`tpSwitchTab` (testplan.js:682), `invRender`/
  `invSwitchTab` (inventory.js:101), `pnRender`/`pnSwitchTab` (panel.js:99), `copRender`
  (cop_validator.js:399), y en COP15 `loadVehicle`/`loadRelease` (re-render de acordeones).
- Persistencia de flags UI: claves sueltas `localStorage 'kia_*'` (patrón `kia_tour_done`).
- Focus-visible ya está bien cubierto (styles.css:929, :2831). Touch targets ≥44px ya
  (styles.css:136). aria-label bueno en topbar estático, débil en HTML generado por JS.
- z-index en uso: tour 100000 · cascade-tooltip 9998/9999 · hist-complete 10050 ·
  dash-task 10060. **Usa 10070+ para lo nuevo.**
- Inventario COMPLETO de pestañas y campos sin ayuda: ver §C3/§C4 (ya enumerado, no re-explorar).

## Arquitectura (4 piezas, TODAS en archivos existentes — NO crear archivos JS nuevos,
## build.sh podría no recogerlos)

### A1. Registro de tooltips unificado (extender lo que existe)

- `CASCADE_TOOLTIPS` se convierte en el registro GLOBAL. Cada módulo agrega sus claves en su
  propio archivo, a nivel de parse (cop15.js carga antes que testplan/inventory/panel/cop):
  ```js
  // en testplan.js / inventory.js / panel.js / cop_validator.js (al final del archivo):
  if (typeof CASCADE_TOOLTIPS !== 'undefined') Object.assign(CASCADE_TOOLTIPS, {
      'tp-weekly-cap': { title: 'Capacidad semanal', text: '…' },
      ...
  });
  ```
- **Extender `cascadeInjectTooltips()`** (cop15.js) con un segundo modo para HTML dinámico sin
  `<label for>`: además del recorrido actual por ids, escanear `document.querySelectorAll('[data-help]')`
  y añadir el botón `?` DENTRO del elemento (después de su texto), usando la clave de
  `data-help="clave"` contra el mismo registro. Mantener idempotencia (el borrado inicial de
  `.cascade-help-btn` ya lo garantiza). Así los renders dinámicos solo añaden
  `data-help="clave"` a títulos de tarjetas/controles.
- **Llamar `cascadeInjectTooltips()` al final de**: `tpSwitchTab`, `invSwitchTab`, `pnSwitchTab`,
  `copRender`, `dailyDashRender`, `loadVehicle`, `loadRelease` (guard `typeof`). Es barata.

### A2. Banners por pestaña + botón ℹ️ (nuevo, en app.js)

```js
// app.js — junto al tour (~línea 3660)
var HELP_TABS = { '<tabId>': { title: '…', text: '…', tips: ['…','…'] }, ... }; // contenido en §C3
function helpDismissed() { try { return JSON.parse(localStorage.getItem('kia_help_dismissed')) || {}; } catch(e) { return {}; } }
function helpDismiss(tabId) { var d = helpDismissed(); d[tabId] = 1; localStorage.setItem('kia_help_dismissed', JSON.stringify(d)); var el = document.getElementById('help-banner-' + tabId); if (el) el.remove(); }
// Banner corto (se muestra si no está descartado). Devuelve '' o el HTML.
function helpBannerHTML(tabId) {
    var h = HELP_TABS[tabId]; if (!h || helpDismissed()[tabId]) return '';
    return '<div class="help-banner" id="help-banner-' + tabId + '">💡 <b>' + h.title + ':</b> ' + h.text +
           ' <button class="help-banner-more" onclick="helpShowTab(\'' + tabId + '\')">Ver más</button>' +
           '<button class="help-banner-ok" onclick="helpDismiss(\'' + tabId + '\')">Entendido ✓</button></div>';
}
// Modal completo (título + text + tips como lista) — reutilizar showModal({showCancel:false}).
function helpShowTab(tabId) { … }
```
- **Integración**: cada función de render de pestaña PREPENDE `helpBannerHTML(tabId)` a su HTML
  (primer elemento del contenedor). Además, junto al título de cada pestaña (o en el tab bar),
  un botón `ℹ️` → `helpShowTab(tabId)` SIEMPRE disponible (aria-label="Ayuda de esta pestaña").
  Para tabs Alpine del Panel (`_pnAlpineTabs`: users/shift/alerts/system/calendar/audit) el
  banner se inyecta desde `pnSwitchTab` (insertar al inicio del contenedor visible del tab,
  con `insertAdjacentHTML`, guard para no duplicar por id).
- CSS `.help-banner` (styles.css, al final): franja suave `background:#eff6ff`, borde
  `#bfdbfe`, radio 8px, font ≥12px, botones compactos; márgen-bottom 10px; en móvil se apila.

### A3. Tours por módulo (refactor del existente, app.js)

- Reemplazar `_tourSteps` por:
  ```js
  var TOURS = {
      global:   [ …los 5 pasos actuales tal cual… ],
      today:    [ {target:'.dash-board-header', title:'Tablero de hoy', text:'…'}, {target:'.dash-group--vehiculos', …}, {target:'.dash-eta', …}, … ],
      testplan: [ … 4-6 pasos: tabs bar, capacidad semanal, botón Smart, Recuperación, Familias … ],
      inventory:[ … captura diaria, alta de cilindro, predicción … ],
      panel:    [ … reportes, alertas, auditoría … ],
      cop:      [ … familia+VINes, veredicto, sub-pestaña SPC … ],
      cop15:    [ … alta cascada, acordeones de operación, liberación doble-ciego, historial … ]
  };
  function startTour(moduleKey) { _tourModule = moduleKey || 'global'; _tourCurrent = 0; _renderTourStep(); }
  ```
  `_renderTourStep`/`_tourNext`/`_tourPrev`/`_tourSkip` pasan a leer `TOURS[_tourModule]`;
  la persistencia pasa a `kia_tour_done_<module>` (mantener `kia_tour_done` como alias del
  global para no re-mostrar a usuarios existentes).
- **Disparo**: primera visita a cada módulo (hook en `switchPlatform`, tras el render, solo
  desktop `window.innerWidth >= 768`, con `setTimeout` 800ms) si no existe su flag. El botón
  `?` del topbar ahora abre un mini-menú (overlay simple): "Tour de este módulo · Tour general
  · 📖 Glosario" (`helpMenuOpen()` en app.js).
- Los `target` de cada paso DEBEN ser selectores que existen tras el render del módulo
  (verifícalos con el smoke §V; si un target no existe, `_renderTourStep` debe saltar al
  siguiente paso en vez de romperse — añade ese guard).

### A4. Glosario (app.js)

- `var HELP_GLOSSARY = [ { term:'Soak', def:'…' }, … ];` + `helpShowGlossary()` → modal
  scrollable (reusar `showModal`) con buscador simple (input que filtra por `indexOf`).
  Contenido completo en §C5. Enlazado desde el menú `?` y desde `helpShowTab` (link al final).

## Contenido (§C) — LO QUE HAY QUE ESCRIBIR

### C1. Reglas de redacción (aplican a TODO texto nuevo)
- Español de México, tono directo, SIN tecnicismos sin explicar. Audiencia: técnico de
  laboratorio nuevo en su primer día.
- Tooltip de campo: 1-3 frases → **qué es + qué poner + ejemplo real** ("Kilometraje actual del
  odómetro en km, tal como aparece en el tablero. Ej: 1250").
- Banner de pestaña: 1-2 líneas → **qué se hace aquí + primer paso** ("Aquí generas el plan de
  pruebas de la semana. Define la capacidad y pulsa ⚡ Generación Inteligente.").
- `tips` del modal "Ver más": 2-4 bullets accionables (flujo típico, errores comunes).
- Datos de dominio: sácalos de CLAUDE.md y CHANGELOG.md (v15.x documenta cada feature). NO
  inventes límites/valores regulatorios: si no estás seguro de un dato de dominio, describe la
  mecánica de la UI sin afirmar el dato.

### C2. Tooltips de campos FALTANTES (registro por módulo)

**COP15 (añadir a CASCADE_TOOLTIPS en cop15.js — completar los huecos):** los 11 selects de
cascada (`cfg_model`, `cfg_year`, `cfg_engine`, `cfg_transmission`, `cfg_regulation`,
`cfg_envpkg`, `cfg_region`, `cfg_tires`, `cfg_body`, `cfg_drive`, `cfg_enginepkg` — texto común:
qué es el nivel + que las opciones se filtran en cascada), `reg_operator`, `reg_datetime`,
`op_recep`, `op_odo`, `op_datetime`, `fuel_typein`, `tank_capacity`, `op_notes`,
`precond_responsible`, `precond_datetime`, `tire_pressure`, `odo_pretest`, `test_responsible`,
`test_datetime`, `test_dyno_on`, `test_fan_mode`, `test_verify_notes`, `simple_operator`,
`simple_datetime`, `simple_notes`, `activeVehSelect`, `releaseVehSelect`, `approvalVehSelect`,
`op_status`, `historyFilterBar` (data-help). **Gases de liberación**: `_libRenderGasEntry` debe
añadir un `data-help="lib-gas-help"` en el encabezado de la tabla (clave que explica: valores
FINALES verificados del reporte, con el % del límite y la advertencia ámbar de rango).
**Modal retroactivo** (`histOpenCompleteModal`): `data-help="hist-retro-help"` en el header.

**Ejemplos resueltos (copia este nivel de calidad):**
```js
op_odo: { title: 'Odómetro', text: 'Kilometraje del vehículo al recibirlo, en km, tal como marca el tablero. Ejemplo: 1250. Se usa para comparar contra el odómetro pre-prueba.' },
cfg_regulation: { title: 'Regulación de emisiones', text: 'Norma a la que se probará (EURO-5, SULEV 30…). Se filtra según el modelo/motor elegidos y define qué gases y límites aplican en la liberación.' },
'tp-weekly-cap': { title: 'Capacidad semanal', text: 'Cuántas pruebas puede correr el laboratorio esta semana (default 8). El generador no planeará más que esto. Ajústalo si hay días festivos o mantenimiento.' },
'lib-gas-help': { title: 'Resultados de emisiones', text: 'Captura los valores FINALES verificados del reporte oficial (no lecturas crudas del analizador). El estado muestra ✓/✗ contra el límite y el % del límite; si un valor se sale del rango plausible se marca en ámbar (puedes guardar, queda auditado).' },
```

**Test Plan (testplan.js):** `tp-weekly-date`, `tp-weekly-cap`, botones Smart/Mes (title= ya;
añadir data-help en títulos de tarjeta), editor de reglas de ratio (región/regulación/ratio/por),
sliders de pesos, prioridad por región, propósito por región (v15.8), reglas P1..P5 del
Recovery, "Planear hasta", capacidad por semana, import CSV de producción, filtros de Familias,
badge ⏱ última prueba (title ya existe — no duplicar), simulador (capacidad/semanas).

**Inventario (inventory.js):** captura diaria (inputs psi y combustible — un data-help general
en el título "📏 Captura"), alta de cilindro (formula, concentración, presión inicial,
vencimiento, zona), equipo (nextCalDate), predicción (qué significa el modelo aprendido,
`invState.consumption` — explicar "aprende de tus lecturas: exige capturas diarias reales"),
tanques de combustible (regulación → a qué pruebas descuenta), mapa de zona.

**Panel (panel.js):** data-help por tarjeta/título en las 12 tabs (el módulo no tiene inputs
complejos; basta banner §C3 + data-help en los botones de export de Reportes explicando QUÉ
exporta cada CSV).

**CoP (cop_validator.js):** región/familia (de dónde salen: plan de producción), tabla de VINes
(auto vs manual), U/A(n)/B(n) (ya hay "Ver fórmula" — añadir tooltip al veredicto CONCORDANTE),
SPC: familia/gas/toggles (ya hay `<details>` de ayuda — añadir data-help en el panel de alarmas).

**HOY (app.js):** data-help en: header del tablero ("qué es este tablero"), chip ETA (ya tiene
title; añadir clave con explicación de auto vs manual), stepper (title ya), toggle Solo míos,
botón ➕ Actividad; tooltips en los 4 campos del modal de tarea (`dash-task-title/cat/assignee/due`).

### C3. Banners por pestaña — CONTENIDO COMPLETO de HELP_TABS (usa estos textos como base;
puedes pulir redacción manteniendo el sentido)

| tabId | title | text (banner) |
|---|---|---|
| today | Tu día en un vistazo | Todo lo pendiente de hoy en un solo tablero: vehículos con su etapa, pruebas del plan, inventario y tareas. Toca cualquier fila para ir directo a resolverla. |
| alta | Alta de vehículo | Registra un vehículo nuevo: elige el propósito, arma la configuración con la cascada (cada selección filtra las siguientes) y captura el VIN de 17 caracteres. |
| seguimiento | Operación | Aquí capturas el flujo completo del vehículo activo: recepción → preacondicionamiento → soak → dinamómetro → verificación. Abre cada acordeón en orden y GUARDA AVANCE al terminar cada bloque. |
| liberacion | Liberación doble-ciego | El Liberador captura los resultados finales de gases y firma; después el Aprobador los captura DE NUEVO sin verlos — si coinciden a 3 cifras, se archiva. Así se evitan errores de dedo. |
| kanban | Cola de vehículos | Vista rápida de todos los vehículos activos por estado. Arrastra o toca uno para abrirlo en Operación. |
| dashboard (cop15) | Historial | Vehículos archivados: genera su PDF COP15-F05, completa datos retroactivos (📝) si el PDF pide campos que no existían, y consulta su control de cambios (🕘). |
| tp-dashboard | Plan — resumen | Cobertura del plan de producción: cuántas pruebas exige el año, cuántas van y el presupuesto anual. Rojo = configuraciones críticas sin probar. |
| tp-weekly | Plan semanal | Genera el plan de la semana: define capacidad y fecha y usa ⚡ Generación Inteligente (valida inventario). Marca cada prueba al completarla. |
| tp-recovery | Recuperación | Clasifica TODO lo pendiente por prioridad (P1 Europa COP → P5 EV), reparte en las semanas disponibles y avisa qué no alcanza. Marca semanas no disponibles y define "planear hasta". |
| tp-production | Producción | Importa aquí el CSV del plan de producción (se FUSIONA con lo anterior, no lo borra). De estos volúmenes salen las pruebas requeridas. |
| tp-tested | Probados | Registro manual de pruebas ya realizadas que no pasaron por la plataforma. |
| tp-families | Familias | Agrupación por familia de emisiones: cobertura, evidencia de VINes (📋) y hace cuánto no se prueba cada familia (⏱). |
| tp-rules | Reglas | Cuántas pruebas por cada 1000 unidades según región/regulación, pesos de priorización y el propósito precargado por región (COP solo Europa). |
| tp-simulator | Simulador | "¿Qué pasa si corro N pruebas/semana?" — proyecta cuándo llegas a 100% de cobertura con distintas capacidades. Útil para pedir recursos. |
| tp-calendar | Calendario | Las pruebas planificadas/ejecutadas por día del mes. |
| tp-planactual / tp-planhistory / tp-weekhistory | (breves equivalentes) | … |
| inv-dashboard | Inventario — resumen | Estado de cilindros y equipos: vencidos, niveles bajos y consumo proyectado contra las pruebas pendientes. |
| inv-readings | Captura diaria | Captura una vez al día el PSI de cada cilindro en uso y el nivel de los tanques. De estas lecturas la plataforma APRENDE cuánto consume cada tipo de prueba — sin capturas no hay predicción. |
| inv-gases | Cilindros | Alta y gestión de cilindros de gas de calibración: fórmula, concentración, presión inicial, lote y vencimiento. |
| inv-equipment | Equipos | Equipos del laboratorio y sus fechas de calibración — la plataforma avisa 30/7 días antes de vencer. |
| inv-predict | Predicción | Consumo aprendido por tipo de prueba y proyección: ¿alcanza el gas/gasolina para el plan? Los números se actualizan con cada lectura y cada prueba. |
| inv-fuel | Combustible | Tanques de gasolina por regulación. Cada prueba descuenta automáticamente los litros aprendidos del tanque correspondiente. |
| inv-zonemap | Mapa | Ubicación física de cilindros por zona, con lectura rápida desde el plano. |
| pn-dashboard | Datos — resumen | El resumen cruzado del laboratorio (mismo que ve HOY). |
| pn-reports | Reportes | Centro de exportación: cada botón genera un CSV/PDF distinto (gap de cobertura, pronóstico de gas, bitácora, alertas, auditoría). Pasa el mouse por cada uno para ver qué incluye. |
| pn-alerts | Alertas | Todas las alertas activas de todos los módulos, ordenadas por severidad, incluidas las de consumo y las alarmas SPC. |
| pn-audit | Auditoría | El control de cambios de TODA la plataforma: quién hizo qué y cuándo. Exportable a CSV. |
| pn-users / pn-shift / pn-executive / pn-turnaround / pn-intelligence / pn-system / pn-calendar / pn-regulations | (1 línea cada uno) | … |
| cop-validator | Validador CoP | Valida la conformidad de producción de una familia: elige región y familia, la tabla se llena con los VINes ya probados, y el veredicto CONCORDANTE se calcula en vivo (muestreo secuencial, mínimo 3 VINes). |
| cop-spc | Control SPC | Carta de control I-MR por familia y gas: detecta corrimientos y tendencias (reglas de Nelson) ANTES de fallar un límite. Cpk = margen del proceso contra el límite. |

(Para los tabIds marcados "…" escribe tú el texto siguiendo C1; el explorador ya documentó qué
hace cada tab.) `tips` del modal: 2-4 bullets por tab con el flujo típico — derívalos de los
banners v15.x del CHANGELOG.

### C4. Empty states con CTA (revisar y completar)
Patrón a copiar: tp-dashboard "No hay plan de producción cargado → Ir a Producción" (testplan.js
~832). Asegurar equivalente en: inv-readings sin cilindros ("Da de alta cilindros primero →
Cilindros"), inv-predict sin lecturas ("La predicción aprende de tus capturas diarias →
Capturar"), cop-validator sin plan (ya existe texto — añadir botón), cop-spc sin liberaciones
(ya existe — añadir CTA a Liberación), pn-alerts sin alertas (positivo: "✓ Sin alertas"),
tp-recovery sin pendientes, historial sin archivados, HOY ya lo tiene.

### C5. Glosario (~20 términos, escribir definiciones de 1-2 frases)
Soak · Preacondicionamiento · Doble ciego · CoP (Conformity of Production) · Quality Audit ·
VIN · ETW · Target/Dyno Set A/B/C (coast-down) · Bin/LimitSet · % del límite · FE por balance
de carbono · I-MR · Reglas de Nelson (R1/R2/R3) · Cpk · UCL/LCL · σ (sigma) · Familia de
emisiones · Déficit / ratio por 1000 · Tier/Prioridad (P1..P5) · PSI · DTC · Carta de captura
diaria. Basar I-MR/Nelson/Cpk en los textos ya escritos en `copBuildSpcHTML` (details de ayuda).

## Accesibilidad técnica ligera (§D)

- aria-label en botones de icono generados por JS (los principales): Historial 🕘/🗑/📝,
  `dash-row-action--ghost` 🗑, checkboxes del tablero (`aria-label="Marcar completada: <título>"`),
  botones ✕ de modales (hist-complete, dash-task, sig), chips ETA (`role="button"`,
  `aria-label`), toggles del SPC. Patrón: añadir el atributo en el template string.
- El nuevo UI de ayuda: fuentes ≥12px, botones ≥28px alto, cerrable con Escape (listener en
  helpShowTab/helpMenuOpen/glosario) y click en overlay.
- NO hacer barrido global de font-size ni de colores (riesgo de romper layouts) — fuera de alcance.

## PITFALLS (§P) — LÉELOS ANTES DE ESCRIBIR CÓDIGO

1. **NUNCA edites `kia-emlab-unified.html`** (generado). Edita `js/*.js`, `index.html`,
   `styles.css` y corre `./build.sh` después.
2. Tras CUALQUIER cambio JS: `node --check js/<archivo>.js`. Tras build:
   extrae el `<script>` inline más grande del bundle y pásale `node --check` (receta en §V).
3. Los renders son `innerHTML` totales: los botones `?` inyectados MUEREN en cada render.
   Por eso la inyección se llama al FINAL de cada switch/render (§A1). No optimices esto con
   MutationObserver — mantenlo simple.
4. En template strings con `onclick="…"`, escapa comillas simples de claves
   (`\'` o usa dobles) — hay ejemplos por todo el repo; copia el patrón local.
5. `escapeHtml()` existe (app.js) — úsalo para cualquier texto que venga de datos.
6. Orden de carga: app.js → cop15.js → inventory.js → testplan.js → panel.js → auth.js →
   signatures.js → firebase-sync.js → cop_validator.js. `CASCADE_TOOLTIPS` se define en
   cop15.js: los `Object.assign` de módulos que cargan DESPUÉS (inventory/testplan/panel/cop)
   funcionan directo; para app.js (HOY, carga ANTES) registra sus claves dentro de
   `dailyDashRender` con guard `typeof CASCADE_TOOLTIPS !== 'undefined'` (una sola vez, flag).
7. El tour NO funciona en móvil (CSS lo oculta) — no lo dispares si `innerWidth < 768`.
8. Los tabs Alpine del Panel no pasan por renderer clásico — banner vía `pnSwitchTab` +
   `insertAdjacentHTML` con guard de duplicado.
9. z-index nuevo ≥10070. Tema claro. Español. Fuentes ≥11px en lo nuevo.
10. No toques la lógica de negocio: esta ronda es SOLO capa de ayuda + aria. Si un empty state
    requiere detectar datos, usa los getters existentes (`invReadingStatusToday`,
    `tpState.planData.length`, etc.), no dupliques cálculos.
11. Commits: en la rama `claude/claude-md-review-ce38dk`, mensaje en español estilo del repo
    ("v16.0: plataforma autoguiada — …"). NO menciones modelos de IA en commits/código.
12. Si `AskUserQuestion`/dudas de contenido de dominio: NO bloquees — describe la mecánica de
    la UI sin afirmar datos regulatorios (regla C1).

## Orden de implementación

1. **Framework** (A1 data-help + A2 banners + menú ? + A4 glosario) — app.js/cop15.js/styles.css.
2. **Contenido COP15** (huecos de C2) + llamadas de inyección en todos los módulos.
3. **Contenido Test Plan → Inventario → Panel → CoP → HOY** (C2+C3 por módulo; banner + data-help
   + empty states de ese módulo en la misma pasada — un commit por módulo está bien).
4. **Tours por módulo** (A3) — al final, cuando los targets ya existen.
5. **aria-labels** (§D) en la pasada de cada módulo.
6. Docs: CHANGELOG v16.0 + CLAUDE.md (sección "v16.0 — Autoguía": describe HELP_TABS,
   data-help, kia_help_dismissed, TOURS, glosario, y la regla "cada pestaña/campo nuevo DEBE
   registrar su ayuda").

## Verificación (§V) — receta probada en ESTE repo

1. `node --check` de cada js tocado → `./build.sh` → extraer y checar bundle:
   ```bash
   python3 - <<'EOF'
   import re
   html = open('kia-emlab-unified.html', encoding='utf-8').read()
   s = re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', html, re.S)
   open('/tmp/bundle_inline.js','w').write(max(s, key=len))
   EOF
   node --check /tmp/bundle_inline.js
   ```
2. Smoke Playwright (patrón EXACTO de sesiones previas — cópialo):
   - `npm install playwright chart.js@4.4.7 chartjs-plugin-zoom@2.0.1` en un dir temporal;
     `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`;
     `browser.newContext({ serviceWorkers: 'block' })`.
   - `page.route('**/chart.umd.min.js', …fulfill desde node_modules/chart.js/dist/chart.umd.js)`
     y `'**/chartjs-plugin-zoom.min.js'` igual (los CDN están bloqueados en el sandbox).
   - Servir el repo: `python3 -m http.server 8123`.
   - `addInitScript`: sembrar `kia_auth_session` `{operatorId, operatorName, role, loginAt,
     expiresAt:+11h}` y `kia_db_v11` `{version:'11.0', vehicles:[…], lastId}`; para probar
     "primera visita" NO sembrar `kia_tour_done*` ni `kia_help_dismissed`.
   - Tras goto: ocultar `#fb-auth-overlay` y saltar el tour si estorba
     (`document.querySelectorAll('button')… 'Saltar'`).
   - **Asserts mínimos**: (a) cada plataforma muestra su banner y `helpDismiss` lo quita y
     persiste tras `page.reload()`; (b) conteo de `.cascade-help-btn` > N esperado en cada
     módulo (COP15 ≥ 60, testplan/inventory ≥ 10 c/u, panel ≥ 8, cop ≥ 5, HOY ≥ 4);
     (c) `cascadeShowTooltip` abre y cierra; (d) `startTour('testplan')` renderiza
     `.tour-tooltip` y Siguiente avanza; targets inexistentes no rompen; (e) glosario abre y
     filtra; (f) auditoría de aria: `document.querySelectorAll('button:not([aria-label])')`
     que solo contengan emoji/1 char → debe bajar respecto al conteo previo (imprimir número);
     (g) 0 `pageerror`.
   - Screenshots: banner + tooltip abierto en COP15, tour en testplan, glosario → enviar al
     usuario con `SendUserFile`.
3. Commit + push (`git push -u origin claude/claude-md-review-ce38dk`).
4. Nota al usuario: `build.sh` publica la versión en Firebase (app/version) — los dispositivos
   la reciben al desplegar con `deploy.sh`.
