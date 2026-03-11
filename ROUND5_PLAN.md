# Round 5 — Experiencia Nativa y UX Inteligente

**8 mejoras centradas en hacer que la app se sienta como software nativo, reduzca fricción y genere impresiones inmediatas.**

> Filosofía: El producto es funcionalmente completo. Ahora debe **sentirse** diferente — menos clics, más inteligencia contextual, transiciones que inspiren confianza. Cada mejora debe hacer que el técnico diga "¿cómo trabajábamos antes sin esto?"

---

## M1: Modo App Nativa (Immersive Mode)

**Problema**: La app corre en un navegador con barra de URL, tabs del browser y header de la app siempre visible. En smartphones/tablets se pierde ~120px de espacio útil. Los técnicos nunca supieron cómo "lanzarla como app real".

**Solución**:

1. **Botón "Modo App"** visible en el header — al tocarlo:
   - Entra en `Fullscreen API` (`document.documentElement.requestFullscreen()`)
   - El header colapsa a una barra mínima de 36px (solo logo + módulo actual + reloj)
   - Las tabs de módulos se mueven a un **bottom navigation bar** estilo app móvil (5 iconos con label)
   - Un gesto de swipe-down desde arriba restaura el header completo

2. **Splash Screen al abrir** — pantalla de carga con logo KIA + barra de progreso animada que muestra:
   - "Cargando base de datos..." → "Verificando inventario..." → "Listo"
   - Desaparece con fade-out suave al completar `initializeSystem()`

3. **Navegación por gestos** (tablets):
   - Swipe izquierda/derecha entre módulos (COP15 → Test Plan → Results → ...)
   - Transición tipo slide horizontal (como cambiar pantallas en iOS/Android)

4. **Manifest mejorado**:
   - `"display": "standalone"` ya existe — agregar `"display_override": ["window-controls-overlay"]`
   - App shortcuts: "Nuevo Vehículo", "Lectura Rápida", "Plan Semanal"
   - Screenshots para el prompt de instalación

**Archivos**: `js/app.js`, `styles.css`, `index.html`, `manifest.json`
**Funciones nuevas**: `immersiveEnter()`, `immersiveExit()`, `immersiveToggle()`, `_immersiveBuildBottomNav()`, `_immersiveSplashShow()`, `_immersiveSplashHide()`, `_immersiveSwipeInit()`
**CSS nuevo**: `.immersive-mode`, `.bottom-nav`, `.splash-screen`, `@keyframes slideLeft/slideRight`
**~350 líneas**

**Wow factor**: Al activar Modo App, la interfaz se transforma visualmente — desaparece el "feeling de página web" y aparece una app de verdad con bottom nav, transiciones suaves y cero chrome del browser.

---

## M2: Auto-Guardado Inteligente

**Problema**: Al editar la operación de un vehículo y cambiar de tab, aparece un modal bloqueante "¿Guardar cambios?" que interrumpe el flujo. El indicador de "cambios sin guardar" es un punto rojo pequeño fácil de ignorar. Si el técnico cierra el browser por accidente, pierde todo.

**Solución**:

1. **Auto-save silencioso** cada 3 segundos mientras el usuario edita el formulario de operación
   - Indicador sutil: icono de nube/check que aparece brevemente ("Guardado ✓") con fade-out
   - Sin modal de confirmación al cambiar tabs — simplemente guarda y navega
   - El punto rojo de "unsaved" desaparece, reemplazado por timestamp: "Último guardado: 14:32"

2. **Protección contra pérdida** (beforeunload):
   - Si hay cambios en los últimos 2 segundos (guardado en tránsito), mostrar warning del browser
   - Si ya se auto-guardó, dejar salir sin warning

3. **Indicador visual de guardado**:
   - Animación tipo "pulse" sutil en el botón guardar cuando auto-save ejecuta
   - Transición de color: gris → verde → gris (0.5s) para confirmar visualmente

4. **Aplica a todos los módulos**: COP15 (operación), Test Plan (edición de items), Inventory (lecturas), Results (edición de tests)

**Archivos**: `js/cop15.js`, `js/app.js`, `styles.css`
**Funciones nuevas**: `autoSaveInit(module, saveFn, interval)`, `autoSaveDestroy(module)`, `_autoSaveTick()`, `_autoSaveIndicator(state)`
**Modifica**: `markUnsaved()` → ahora inicia timer de auto-save, `handleTabSwitch()` → elimina modal de confirmación
**~200 líneas**

**Wow factor**: El técnico simplemente trabaja. No más "¿guardaste?" ni clics de confirmación. La app cuida los datos en silencio.

---

## M3: Formularios con Inteligencia Contextual

**Problema**: El formulario de operación COP15 tiene 50+ campos en secciones accordion. Todos se muestran aunque muchos no apliquen al status actual. Campos como fecha de preacondicionamiento requieren tipeo manual. "Copy from last vehicle" exige confirmación y copia todo-o-nada.

**Solución**:

1. **Progressive disclosure por status**:
   - Status "registered" → solo muestra sección Recepción (3 campos)
   - Status "in-progress" → agrega Preacondicionamiento + DTC
   - Status "testing" → agrega Verificación de Prueba + Coeficientes Dinamo
   - Status "ready-release" → muestra resumen tipo "tarjeta de revisión" (sin formularios)
   - Secciones futuras aparecen colapsadas con candado: "Se desbloquea al avanzar a Testing ◻"

2. **Smart defaults y sugerencias inline**:
   - Fecha preacondicionamiento: botón "Ayer 6AM" (el patrón más común) + "Ahora" + selector
   - Presión de llantas: pre-llena con último valor del mismo modelo (en vez de vacío)
   - Fan mode/chains/slings: si el último vehículo del mismo config usó los mismos valores, auto-llena con indicador "(sugerido del último vehículo)"
   - ETW/coeficientes: auto-detecta del `CSV_CONFIGURATIONS` si el config tiene valores únicos → auto-llena sin preguntar

3. **Copy inteligente** (evolución de "Copy from Last Vehicle"):
   - En vez de modal con lista, muestra banner inline: "Se encontraron datos del último [Modelo] — Aplicar todo | Seleccionar campos"
   - "Seleccionar campos" abre checklist rápido (no modal) con toggles
   - Campos "seguros" (presión, fan mode, cadenas) se auto-copian con label "(copiado)" en gris

4. **Badges de completitud en accordion headers**:
   - Cada sección muestra "3/6 ✓" al lado del título
   - Al completar una sección, el header cambia de gris a verde con animación
   - Sección incompleta muestra cuántos campos faltan: "Faltan 2 campos"

**Archivos**: `js/cop15.js`, `styles.css`
**Funciones nuevas**: `smartFormApplyByStatus(status)`, `smartFormSuggestDefaults(vehicle)`, `smartFormCopyInline(sourceVehicle)`, `_smartFormBadgeUpdate(section)`, `_smartFormAutoFill(field, value, source)`
**~400 líneas**

**Wow factor**: El formulario "sabe" en qué etapa estás y solo muestra lo relevante. Los campos se llenan solos cuando el contexto es obvio. El técnico siente que la app entiende su trabajo.

---

## M4: Micro-Animaciones y Pulido Visual

**Problema**: La app tiene transiciones básicas (0.2-0.4s en botones/tabs) pero carece de las micro-interacciones que hacen sentir una app "viva". Los cambios de status, conteos KPI y listas aparecen instantáneamente sin feedback visual.

**Solución**:

1. **Animated counters** en Dashboard KPIs:
   - Los números no aparecen estáticos — cuentan desde 0 hasta el valor final en 0.8s
   - Efecto "odómetro" para contadores grandes (vehículos totales, pruebas completadas)
   - Cuando un KPI cambia, el número nuevo hace "bounce" con highlight amarillo por 1s

2. **Status transitions con animación**:
   - Al cambiar status de vehículo: badge viejo hace slide-out → badge nuevo hace slide-in con color
   - Progreso visual: barra de avance debajo del badge que muestra % de campos completados
   - Al llegar a "Released": animación de confetti sutil (3-4 partículas CSS, sin JS pesado)

3. **Staggered list animations**:
   - Listas de vehículos, pruebas, gases: items aparecen con fade-in + slide-up escalonado (50ms delay entre items)
   - Nuevo item insertado: flash de highlight verde que desaparece en 1s
   - Item eliminado: slide-out horizontal + height collapse suave

4. **Card elevation y glassmorphism** (sutil):
   - Cards en hover: elevan con sombra 0→8px + scale(1.01)
   - Panel de Quick Review: fondo glassmorphism (`backdrop-filter: blur(10px)`)
   - Tabs activas: underline animado que se desliza entre tabs (no aparece/desaparece)

5. **Skeleton loading**:
   - Al cargar módulo, mostrar placeholders grises pulsantes (skeleton screens) por 200-400ms
   - Reemplaza el "flash" de contenido apareciendo de golpe

**Archivos**: `styles.css`, `js/app.js`
**CSS nuevo**: `@keyframes countUp`, `@keyframes fadeInUp`, `@keyframes slideInRight`, `@keyframes confetti`, `@keyframes shimmer`, `.card-elevated`, `.glass-panel`, `.skeleton`, `.stagger-item`, `.animated-counter`
**Funciones nuevas**: `animateCounter(element, from, to, duration)`, `animateStatusChange(element, oldStatus, newStatus)`, `animateListInsert(element)`, `animateListRemove(element)`, `skeletonShow(container)`, `skeletonHide(container)`
**Respeta**: `prefers-reduced-motion` (ya soportado en R3) — todas las animaciones se desactivan
**~300 líneas (CSS) + ~150 líneas (JS)**

**Wow factor**: La app se siente "viva". Los números cuentan, las cards respiran, los status transicionan con color. Es la diferencia entre una hoja de Excel y una app profesional.

---

## M5: Lectura Rápida en Lote (Inventario)

**Problema**: Para registrar lecturas de presión (PSI) al inicio de turno, el técnico debe: abrir inventario → tab lecturas → scroll por 10-20 cilindros → tipear cada valor uno por uno → guardar. Son ~40 taps para 12 cilindros.

**Solución**:

1. **Modo "Ronda de Lecturas"** — botón prominente "Iniciar Ronda" que abre experiencia dedicada:
   - Pantalla completa con UN solo cilindro visible a la vez
   - Muestra: nombre del gas, zona, último valor, campo de entrada grande (dedo-friendly)
   - Sparkline de últimas 5 lecturas inline (tendencia visual inmediata)
   - Botón "Siguiente →" avanza al siguiente cilindro (o Enter en teclado)
   - Progreso: "4 de 12 cilindros" con barra visual

2. **Pre-fill inteligente**:
   - Si la presión no cambió mucho (±5% del último valor), pre-llenar con último valor
   - Botón "= Igual" para confirmar sin tipear (1 tap en vez de 4)
   - Si el valor baja >15% desde la última lectura, mostrar warning inline con color naranja

3. **Integración con barcode scanner**:
   - Modo alternativo: escanear barcode → auto-navega al cilindro → ingresa valor → escanear siguiente
   - Sin cerrar modal entre escaneos (flujo continuo)

4. **Resumen al finalizar ronda**:
   - Tarjeta resumen: "12 lecturas registradas, 2 alertas de presión baja, tiempo: 3:42"
   - Botón "Compartir Resumen" (clipboard) para reportar al supervisor

**Archivos**: `js/inventory.js`, `styles.css`
**Funciones nuevas**: `invStartReadingRound()`, `invRoundNext()`, `invRoundPrev()`, `invRoundSave()`, `invRoundFinish()`, `_invRoundRenderCurrent(index)`, `_invRoundSparkline(gasId)`, `_invRoundSummary(results)`
**~350 líneas**

**Wow factor**: Lo que antes tomaba 5 minutos de scroll y taps ahora es una experiencia guiada de 90 segundos. Un cilindro a la vez, un tap para confirmar, con feedback visual instantáneo.

---

## M6: Reporte Estructurado de Cambio de Turno

**Problema**: El shift log registra actividad pero el handoff entre turnos es informal. El operador entrante no tiene visibilidad rápida de qué quedó pendiente, qué alertas están activas, ni qué recursos están bajos.

**Solución**:

1. **Botón "Cerrar Turno"** en Panel → Turno que genera reporte automático:
   - **Vehículos en progreso**: lista con status actual y % de completitud
   - **Pruebas pendientes del plan semanal**: items del weekly plan sin completar
   - **Alertas activas**: gas bajo, calibraciones vencidas, vehículos estancados
   - **Consumo del turno**: gases usados, pruebas completadas, vehículos liberados
   - **Notas del operador**: campo de texto libre para observaciones

2. **Formato visual tipo "tarjeta ejecutiva"**:
   - Diseño limpio con secciones colapsables
   - KPIs del turno con iconos de color (verde/amarillo/rojo)
   - Timeline del turno: hora inicio → actividades → hora fin

3. **Al iniciar sesión** — si existe reporte del turno anterior:
   - Modal de bienvenida: "Resumen del turno de [Operador anterior]"
   - Muestra items pendientes con checkboxes para "asumir" o "descartar"
   - Desaparece con un tap en "Entendido" o se puede consultar después

4. **Exportable**: PDF (con jsPDF) y clipboard (texto plano formateado)

**Archivos**: `js/panel.js`, `js/app.js`, `styles.css`
**Funciones nuevas**: `pnGenerateShiftReport()`, `pnRenderShiftReport(report)`, `pnShiftReportPDF(report)`, `pnShowTurnoverOnLogin()`, `_pnCollectTurnoverData()`
**Extiende**: `kia_panel_v1` con array `shiftReports[]` (últimos 30)
**~350 líneas**

**Wow factor**: El cambio de turno deja de ser "¿qué quedó pendiente?" verbal. Es un reporte profesional que el equipo puede mostrar a supervisores.

---

## M7: Calendario Unificado de Eventos

**Problema**: Las calibraciones de equipo están en Inventario, la depleción de gas en otra tab, el plan semanal en Test Plan, y las fechas de release en COP15. No hay una sola vista que muestre "qué viene esta semana/mes".

**Solución**:

1. **Nueva sub-tab "Calendario" en Panel**:
   - Vista mensual con celdas por día
   - Indicadores de color por tipo de evento:
     - 🔴 Rojo: calibración vencida, gas agotado
     - 🟠 Naranja: calibración próxima (≤30d), gas bajo (≤20%), soak timer activo
     - 🔵 Azul: pruebas planificadas (del weekly plan)
     - 🟢 Verde: releases programados, calibraciones completadas
   - Click en día → panel lateral con lista detallada de eventos

2. **Agregación automática de fuentes** (sin configuración):
   - `invState.equipment` → `nextCalDate` para calibraciones
   - `invState.gases` → predicción de depleción (del EWMA engine existente)
   - `tpState.weeklyPlans` → items planificados por semana
   - `db.vehicles` → fechas de release estimadas (de `autoSuggestDates`)
   - `pnState.alerts` → alertas con fecha de vencimiento

3. **Navegación**:
   - Flechas ← → para mes anterior/siguiente
   - Botón "Hoy" para volver al mes actual
   - Mini-resumen debajo del calendario: "Esta semana: 3 calibraciones, 5 pruebas planificadas, 1 release"

4. **Sin dependencias externas** — calendario renderizado con CSS Grid puro (7 columnas × 5-6 filas)

**Archivos**: `js/panel.js`, `styles.css`
**Funciones nuevas**: `pnRenderCalendar(year, month)`, `_pnCollectCalendarEvents()`, `_pnCalendarDayClick(date)`, `_pnCalendarNav(dir)`, `_pnCalendarBuildGrid(year, month)`, `_pnCalendarWeekSummary()`
**~350 líneas**

**Wow factor**: Una sola vista que unifica todo lo que viene. El supervisor abre el calendario y en 5 segundos sabe el estado del laboratorio esta semana.

---

## M8: Plantillas y Presets Rápidos

**Problema**: Los técnicos registran los mismos modelos de vehículo repetidamente con valores similares. En Results Analyzer, deben configurar perfiles de columnas manualmente. En Inventory, deben tipear los mismos tipos de gas y concentraciones. Mucho trabajo repetitivo que la app debería recordar.

**Solución**:

1. **Plantillas de Operación** (COP15):
   - Botón "Guardar como Plantilla" al completar una operación exitosa
   - Nombre personalizable: "Sportage 2025 Invierno", "Seltos EURO-6 Estándar"
   - Al registrar nuevo vehículo del mismo config: "Aplicar plantilla [nombre]" con un tap
   - Hasta 20 plantillas guardadas, ordenadas por frecuencia de uso
   - Editar/eliminar plantillas desde un gestor simple

2. **Presets de Filtros** (Results Analyzer):
   - Botón "Guardar Vista" al lado de los filtros de trend/compliance
   - Guarda: regulación seleccionada, modo de test, columnas visibles, agrupación, rango de fechas
   - Aparecen como botones rápidos encima de los filtros: `[WLTP CO₂] [México NOx] [Euro-6 HC+NOx]`
   - Un tap = filtros aplicados instantáneamente

3. **Presets de Cilindros** (Inventario):
   - "Duplicar cilindro" — crea copia con nuevo control number (auto-incrementado)
   - "Lote de cilindros" — "Agregar 5 cilindros de CO₂ al 5.02%" con un solo formulario
   - Auto-asignar zona al slot más vacío si no se especifica

4. **Motor de plantillas unificado**:
   - Guardado en `kia_templates` localStorage
   - Accesibles desde command palette: `> plantilla sportage` → aplica directamente

**Archivos**: `js/cop15.js`, `js/results.js`, `js/inventory.js`, `js/app.js`, `styles.css`
**Funciones nuevas**: `templateSave(module, name, data)`, `templateApply(module, templateId)`, `templateDelete(id)`, `templateRenderManager(module)`, `templateRenderQuickButtons(module)`, `raPresetSave(name)`, `raPresetApply(presetId)`, `invDuplicateGas(gasId)`, `invBatchAddGas(type, conc, count)`
**localStorage nuevo**: `kia_templates`
**~400 líneas**

**Wow factor**: El técnico guarda su configuración favorita una vez y la aplica con un tap para siempre. Lo que tomaba 15 campos de tipeo ahora es un botón.

---

## Resumen Ejecutivo

| # | Mejora | Tema | Líneas est. | Impacto UX |
|---|--------|------|-------------|------------|
| M1 | Modo App Nativa | Experiencia inmersiva | ~350 | La app deja de verse como "página web" |
| M2 | Auto-Guardado Inteligente | Cero fricción | ~200 | Nunca más "¿guardaste?" |
| M3 | Formularios Inteligentes | Reducción de clics | ~400 | 60% menos interacciones en formularios |
| M4 | Micro-Animaciones | Pulido visual | ~450 | La app se siente "viva" y profesional |
| M5 | Lectura Rápida en Lote | Eficiencia operativa | ~350 | Ronda de lecturas 3x más rápida |
| M6 | Reporte de Cambio de Turno | Handoff profesional | ~350 | Cambio de turno estructurado |
| M7 | Calendario Unificado | Visibilidad total | ~350 | Una vista = todo lo que viene |
| M8 | Plantillas y Presets | Eliminar repetición | ~400 | 1 tap reemplaza 15 campos |
| | **Total** | | **~2,850** | |

## Orden de Implementación Sugerido

1. **M2** (Auto-Guardado) → fundamento para todo lo demás, elimina friction inmediatamente
2. **M4** (Micro-Animaciones) → transforma la percepción visual de toda la app
3. **M1** (Modo App) → el cambio más visible, genera el "wow" más fuerte
4. **M3** (Formularios Inteligentes) → mejora la experiencia diaria del técnico
5. **M8** (Plantillas) → reduce trabajo repetitivo acumulativo
6. **M5** (Lectura en Lote) → mejora operación específica de alta frecuencia
7. **M7** (Calendario) → visibilidad estratégica para supervisores
8. **M6** (Reporte de Turno) → profesionaliza el handoff entre equipos

## Patrones Existentes a Reusar

| Patrón | Ubicación actual | Se reutiliza en |
|--------|-----------------|-----------------|
| `showToast(msg, type, undoFn)` | app.js | M2 (indicador guardado), M5 (resumen ronda) |
| `chartConfigBuildPanel()` | app.js | M7 (gráfica mini del calendario) |
| `undoPush(module, label)` | app.js | M8 (antes de aplicar plantilla) |
| `safeParse(key, fallback)` | app.js | M8 (lectura de templates), M6 (shift reports) |
| `showConfirm()` / `showModal()` | app.js | M6 (modal de handoff), M8 (gestor de plantillas) |
| `_globalCrossSearchForPalette()` | app.js | M8 (buscar plantillas desde command palette) |
| `prefers-reduced-motion` | styles.css | M4 (desactivar todas las animaciones) |
| `animateStatusChange()` | nuevo M4 | M3 (transición de status en formulario) |

## Nuevas Keys de localStorage

| Key | Mejora | Contenido | Tamaño est. |
|-----|--------|-----------|-------------|
| `kia_templates` | M8 | `{cop15: [{id,name,data,usageCount}], results: [{id,name,filters}], inventory: [...]}` | ~2-5 KB |
| `kia_autosave_ts` | M2 | Timestamp del último auto-guardado por módulo | <100 bytes |
| `kia_shift_reports` | M6 | Últimos 30 reportes de turno | ~3-5 KB |
| `kia_immersive_prefs` | M1 | Preferencias de modo inmersivo | <200 bytes |
