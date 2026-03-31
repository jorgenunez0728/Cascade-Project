# KIA EmLab — Roadmap de Versiones: 7.1 → 7.2 → 7.3 → 8.0

## Contexto

La app tiene 5 rondas de mejoras completadas (~25K líneas JS, ~550 funciones, 8 módulos). El overhaul UI/UX v6 (Glass+Neumorphism) fue exitoso. El V7_HANDOFF.md define el "Smart Workflow" pero NO está implementado aún. La app es usada diariamente por técnicos en tablets/smartphones, 100% offline con localStorage.

**Problema central**: La app funciona bien como herramienta, pero aún requiere demasiados clicks, no guía al técnico, pierde contexto al recargar, y la arquitectura interna (global scope, sin event bus, sin tests) limita la velocidad de evolución.

**Pregunta clave del usuario**: ¿Vale la pena migrar a Vue?

---

## Recomendación sobre Vue: NO para 7.x, EVALUAR para 8.0

### Por qué NO migrar a Vue ahora:
1. **Riesgo de producción** — La app se usa diariamente. Un rewrite de 50-70% del código (12-16 semanas) es un riesgo enorme para una herramienta en producción.
2. **Constraint de single-file offline** — Vue + Vite genera bundles con imports. Mantener el modelo de un solo HTML requiere configuración extra y pierde ventajas del framework.
3. **ROI bajo** — Los problemas actuales (muchos clicks, sin guía, sin memoria de sesión) son problemas de **producto**, no de **framework**. Vue no los resuelve automáticamente.
4. **Alpine.js ya está parcialmente integrado** — El panel ya usa Alpine 3.14.9. Expandir Alpine es incremental, no disruptivo.

### Camino recomendado: Modernización Progresiva
| Versión | Arquitectura | Framework |
|---------|-------------|-----------|
| 7.1 | Event bus + state centralizado | Vanilla JS + Alpine.js expandido |
| 7.2 | Smart Workflow features | Alpine.js para UI reactiva |
| 7.3 | Testing + optimización | Vitest + Playwright básico |
| 8.0 | Decisión: Vue/Svelte o Alpine maduro | Basada en datos reales de 7.x |

**La migración a Vue (o Svelte) solo tiene sentido si en 7.x descubrimos que Alpine no escala.** Svelte sería mejor candidato que Vue por su modelo reactivo más compatible con localStorage y su compilación a vanilla JS.

---

## Versión 7.1 — "Cimientos Inteligentes" (Arquitectura + Quick Wins)

**Filosofía**: Preparar la infraestructura que habilita todo lo demás, con wins visibles para los técnicos.

### A. Infraestructura (invisible para el usuario, crítica para el futuro)

#### A1. Event Bus Ligero
- Crear `eventBus` en `js/app.js` (publish/subscribe simple, ~50 líneas)
- Reemplazar las llamadas directas cross-module más críticas:
  - `releaseVehicle()` → emite `vehicle:released` → testplan y inventory escuchan
  - `saveDB()` → emite `db:saved` → firebase-sync escucha
- **No reemplazar todo de golpe** — solo las 5-8 integraciones más frágiles
- Archivo: `js/app.js` (agregar eventBus), `js/cop15.js`, `js/testplan.js`, `js/inventory.js` (suscripciones)

#### A2. State Manager Centralizado
- Crear capa delgada sobre localStorage: `StateManager` en `js/app.js`
- API: `state.get('testplan')`, `state.set('testplan', data)`, `state.onChange('testplan', callback)`
- Los módulos siguen usando sus objetos (`tpState`, etc.) pero las lecturas/escrituras pasan por el manager
- Habilita: reactividadligera, debugging centralizado, futuro sync
- Archivo: `js/app.js` (nuevo StateManager ~80 líneas)

#### A3. Setup de Testing Básico
- Agregar Vitest al proyecto (ya hay Vite como devDependency)
- Migrar los 21 tests de `tests.html` a Vitest
- Agregar tests para las funciones críticas: `safeParse`, `escapeHtml`, `cascadeFilter`, `tpBuildFamilies`
- Archivo: nuevo `tests/` directorio, `package.json` (agregar vitest)

### B. Quick Wins Visibles (del V7_HANDOFF.md Tier E)

#### B1. Session Memory (Tier C del handoff)
- Guardar contexto activo: `vehicleId`, `lastTab`, `lastModule`, `scrollPosition`
- Al recargar: toast "¿Retomar VIN ...4832?" con botón directo
- localStorage key: `kia_session_context`
- Archivo: `js/app.js` (guardar/restaurar contexto en `initializeSystem()`)

#### B2. VIN Smart Input (Tier E4)
- Auto-uppercase, strip espacios, validación checksum
- Detección de duplicados en tiempo real
- Archivo: `js/cop15.js` (mejorar campo VIN)

#### B3. Quick-Pick de Propósitos Recientes (Tier E1)
- Chips con los últimos 3 propósitos usados arriba del dropdown
- Un tap en lugar de abrir dropdown + scroll + seleccionar
- Archivo: `js/cop15.js` (agregar chips al form de alta)

### Archivos tocados: `js/app.js`, `js/cop15.js`, `js/testplan.js`, `js/inventory.js`, `package.json`
### Complejidad: Media — ~400-600 líneas nuevas, ~100 líneas modificadas

---

## Versión 7.2 — "Smart Workflow" (El corazón del V7)

**Filosofía**: El técnico nunca se pregunta "¿qué sigue?" — la app lo guía.

### A. Guided Workflow Engine (Tier D del handoff)

#### A1. Motor `getNextStep(vehicle)`
- Función que analiza el estado del vehículo y retorna la acción recomendada
- Estados: registrado → en soak → listo para prueba → en prueba → listo para liberar → liberado
- Archivo: `js/cop15.js` (nuevo motor ~120 líneas)

#### A2. Banner Flotante "Siguiente Paso"
- Barra persistente abajo de la pantalla mostrando la acción recomendada
- Botón directo que navega al tab/form correcto
- Se actualiza reactivamente via eventBus (de 7.1)
- Archivo: `js/cop15.js`, `styles.css`, `index.html`

#### A3. Auto-Prompt Post-Soak
- Cuando el soak timer termina → modal "Soak completo. ¿Ir al formulario de prueba?"
- Usa la Notification API existente + modal in-app
- Archivo: `js/cop15.js` (hook en soak timer completion)

#### A4. Post-Release Quick Actions (Tier D4)
- Al liberar: card con "Registrar Otro", "Ver en Plan", "Ir a Dashboard"
- Archivo: `js/cop15.js`

### B. Form Speed Boosters (Tier E)

#### B1. Smart Config Suggestions (E2)
- Cards con las 3 configuraciones más frecuentes del técnico
- Un tap para pre-llenar modelo/año/motor
- Archivo: `js/cop15.js`

#### B2. Favoritos/Templates Mejorados (E3)
- Guardar configuraciones completas como templates nombrados
- Acceso rápido desde el form de alta
- Archivo: `js/cop15.js`

#### B3. Batch Release (E5)
- Selección múltiple de vehículos "listos para liberar"
- Liberación en lote con confirmación
- Archivo: `js/cop15.js`

#### B4. One-Tap Frequent Values (E6)
- Chips para valores frecuentes en campos de precondición
- Tipo combustible, presión llantas, etc.
- Archivo: `js/cop15.js`, `styles.css`

### C. Mi Turno Dashboard (Tier F)

#### C1. Card "Mi Turno" en HOY
- Vehículos activos del operador actual con status y tiempo restante
- Quick actions: "Ver Timer", "Liberar", "Continuar"
- Archivo: `js/panel.js`, `js/app.js` (sección HOY en index.html)

#### C2. Progress Ring
- Anillo visual "5/8 objetivo del día"
- Archivo: `js/panel.js`, `styles.css`

### Archivos tocados: `js/cop15.js` (principal), `js/panel.js`, `js/app.js`, `styles.css`, `index.html`
### Complejidad: Alta — ~800-1200 líneas nuevas, ~200 líneas modificadas

---

## Versión 7.3 — "Calidad y Rendimiento"

**Filosofía**: Estabilizar, optimizar, y preparar métricas para decidir sobre v8.

### A. Executive Dashboard (Tier B del handoff)

#### A1. KPI Scorecard
- Throughput, velocidad, compliance, utilización de recursos
- Archivo: `js/panel.js`

#### A2. Vehicle Turnaround Analytics
- Tiempo promedio por etapa (del timeline data)
- Archivo: `js/panel.js`, `js/results.js`

#### A3. Predictive Resource Planner
- Proyección de agotamiento de gas
- Capacidad de pruebas por semana
- Archivo: `js/panel.js`, `js/inventory.js`

### B. Testing & Calidad

#### B1. Tests de Integración
- Playwright tests para los 3 workflows críticos:
  1. Registro → Soak → Prueba → Liberación
  2. Creación de plan semanal → Ejecución → Burndown
  3. Lectura de cilindros → Alertas de gas bajo
- Archivo: `tests/e2e/`

#### B2. Performance Monitoring
- Métricas de startup time, render time, localStorage usage
- Dashboard de métricas en System Health (ya existe estructura)
- Archivo: `js/panel.js`, `js/app.js`

### C. Optimización

#### C1. Lazy Loading de CDN
- Chart.js y jsPDF solo cargan cuando se necesitan
- Archivo: `js/app.js`, `index.html`

#### C2. Render Caching Mejorado
- Expandir `_tabCache` a todos los módulos
- Invalidación inteligente via eventBus
- Archivo: todos los módulos JS

### D. UI/UX Polish

#### D1. Dark Mode
- El toggle ya existe en UI pero no está implementado
- Usar CSS variables existentes, agregar variantes dark
- Archivo: `styles.css`

#### D2. Transiciones entre Tabs
- Animaciones fade+slide al cambiar de módulo/tab
- Usar las clases `.tab-content-enter`/`.tab-content-exit` que ya existen
- Archivo: `styles.css`, `js/app.js`

### Archivos tocados: todos los JS, `styles.css`, `index.html`, nuevo `tests/e2e/`
### Complejidad: Media-Alta

---

## Versión 8.0 — "La Gran Evolución" (Decisión Arquitectónica)

**Filosofía**: Con 7.x estable y con tests, ahora sí podemos tomar decisiones informadas sobre el futuro.

### Decisión Framework: Basada en Datos de 7.x

| Si en 7.x encontramos que... | Entonces en 8.0... |
|------|------|
| Alpine.js escala bien, el event bus funciona | Quedarnos con Alpine, agregar Alpine stores formales |
| Alpine limita (forms complejos, reactividad profunda) | Migrar a **Svelte** (compila a vanilla JS, compatible con single-file) |
| Se necesita ecosistema rico (routing, i18n, devtools) | Migrar a **Vue 3** con Vite build customizado para single-file |
| Performance es el cuello de botella | Considerar **Preact** (3KB, API compatible con React) |

### Posibles Rutas para 8.0

#### Ruta A: "Alpine Maduro" (si 7.x funciona bien)
- Alpine.js stores formales para estado
- Web Components para encapsulación
- Service Worker mejorado con cache strategies
- **Esfuerzo**: Bajo (4-6 semanas)

#### Ruta B: "Migración Gradual a Svelte" (recomendada si se necesita framework)
- Svelte compila a vanilla JS — compatible con offline single-file
- Migración módulo por módulo (empezar por Panel, luego Inventory, etc.)
- SvelteKit para routing si se decide salir de SPA
- **Esfuerzo**: Medio (8-12 semanas, sin rewrite completo)

#### Ruta C: "Vue 3 Full Migration"
- Solo si se decide abandonar el constraint de single-file
- O con plugin custom de Vite para inline todo en un HTML
- Vue Router, Pinia stores, Composition API
- **Esfuerzo**: Alto (12-16 semanas, 50-70% rewrite)

### Otras Mejoras Candidatas para 8.0
- **IndexedDB** en lugar de localStorage (supera límite de 5MB)
- **Web Workers** para cálculos pesados (SPC, Cpk/Ppk)
- **Offline-first sync** mejorado (CRDTs o similar para conflictos)
- **Multi-idioma** (i18n — actualmente todo en español)
- **Role-based access** (técnico vs supervisor vs gerente)
- **Reportes PDF avanzados** con branding KIA

---

## Timeline Sugerido

```
7.1 "Cimientos"     ──── 2-3 semanas ────▶ Event bus, state manager, session memory, quick wins
7.2 "Smart Workflow" ──── 3-4 semanas ────▶ Guided workflow, form speed, Mi Turno
7.3 "Calidad"        ──── 2-3 semanas ────▶ Executive dashboard, tests, dark mode, performance
8.0 "Evolución"      ──── Decisión basada en datos de 7.x ────▶ Framework o Alpine maduro
```

## Verificación

Para validar cada versión:
1. `node --check js/*.js` — verificar sintaxis de todos los archivos
2. `./build.sh` — generar unified HTML y verificar que no rompe
3. Abrir en browser y probar flujos críticos manualmente
4. Ejecutar `npm test` (a partir de 7.1 con Vitest)
5. Para 7.3+: Ejecutar tests e2e con Playwright
