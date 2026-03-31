# KIA EmLab — Roadmap de Versiones: 7.1 → 8.0

## Estado Actual (2026-03-31)

La app tiene **6 rondas de mejoras completadas** + el V7 "Smart Workflow" **completamente implementado**:

### V7 Features — Implementados (100%)

| Tier | Feature | Archivo | Línea |
|------|---------|---------|-------|
| A1 | Event Bus (publish/subscribe) | `app.js` | 339 |
| A2 | Auto-deducción de gas PSI por prueba | `inventory.js` | 1679 |
| A3 | Indicadores de disponibilidad 🟢🟡🔴 en plan | `testplan.js` | 2503 |
| A5 | Detección de conflictos de recursos | `app.js` | 358 |
| B1 | Executive Dashboard KPI Scorecard | `panel.js` | 2202 |
| B2 | Vehicle Turnaround Analytics | `panel.js` | 2343 |
| B3 | Predictive Resource Planner | `panel.js` | 2271 |
| C1 | Session Memory (retomar VIN) | `app.js` | 395 |
| C2 | Per-field draft auto-save | `cop15.js` | 5252 |
| C3 | Restore last module on startup | `app.js` | 459 |
| D1 | `getNextStep(vehicle)` engine | `cop15.js` | 5086 |
| D2 | Banner flotante "Siguiente Paso" | `app.js` | 3771 |
| D3 | Auto-prompt post-soak modal | `cop15.js` | 5138 |
| D4 | Post-release quick actions | `cop15.js` | 5213 |
| E1 | Quick-pick propósitos recientes | `cop15.js` | 5317 |
| E2 | Smart config suggestions | `cop15.js` | 5369 |
| E3 | Favoritos auto-detectados | `cop15.js` | 5417 |
| E4 | VIN smart input + duplicados | `cop15.js` | 5448 |
| E5 | Batch release | `cop15.js` | 5492 |
| E6 | One-tap precond values | `cop15.js` | 5545 |
| F1 | Mi Turno card en dashboard HOY | `app.js` | 1521 |
| F3 | Progress ring (objetivo del día) | `app.js` | 3726 |
| — | Dark mode completo (~300 líneas CSS) | `styles.css` | 2238 |
| — | Field validation engine | `app.js` | 582 |

**Total**: ~25K líneas JS, ~620 funciones, 8 módulos, dark mode, Glass+Neumorphism design system.

---

## Recomendación sobre Vue: NO para 7.x, EVALUAR para 8.0

### Por qué NO migrar a Vue ahora:
1. **Riesgo de producción** — Un rewrite de 50-70% (12-16 semanas) en una herramienta que se usa diariamente.
2. **Constraint de single-file offline** — Vue + Vite genera bundles con imports, incompatible con el modelo actual.
3. **ROI bajo** — Los problemas restantes son de arquitectura interna, no de framework.
4. **Alpine.js ya parcialmente integrado** — Panel usa Alpine 3.14.9. Expandir es incremental.

### Camino: Modernización Progresiva
| Versión | Foco | Framework |
|---------|------|-----------|
| 7.1 | State Manager + Event Bus mejorado + Testing | Vanilla JS + Alpine expandido |
| 7.2 | Nuevas capacidades (workflow multi-vehículo, analytics avanzados) | Alpine.js reactivo |
| 8.0 | Decisión: Vue/Svelte o Alpine maduro | Basada en datos reales de 7.x |

---

## Versión 7.1 — "Infraestructura Moderna"

**Filosofía**: La funcionalidad V7 ya existe. Ahora consolidar la arquitectura interna para evolucionar más rápido.

### A. State Manager Centralizado ✅ IMPLEMENTADO
- Capa sobre localStorage con API unificada: `stateManager.get()`, `stateManager.set()`, `stateManager.onChange()`
- Reactividadligera: callbacks se disparan cuando un módulo cambia su estado
- Debugging: `stateManager.snapshot()` para inspección del estado completo
- Los módulos siguen usando sus objetos (`tpState`, etc.) pero las escrituras pasan por el manager
- Archivo: `js/app.js`

### B. Event Bus Mejorado ✅ IMPLEMENTADO
- `offEvent(name, handler)` — remover listeners (previene memory leaks)
- `onceEvent(name, handler)` — listener que se auto-remueve después de una ejecución
- `emitEvent(name, data)` — ya existía, ahora con logging en modo debug
- Archivo: `js/app.js`

### C. Vitest Setup
- Configurar Vitest (ya existe Vite como devDependency)
- Migrar 21+ assertions de `tests.html` a Vitest
- Tests unitarios para funciones críticas: `safeParse`, `escapeHtml`, `getNextStep`, `tpBuildFamilies`
- Archivo: `tests/`, `package.json`, `vitest.config.js`

---

## Versión 7.2 — "Multi-Vehículo y Analytics"

**Filosofía**: Features nuevos que los técnicos necesitan pero aún no existen.

### A. Workflow Multi-Vehículo
- Cola inteligente de vehículos: ver todos los vehículos en progreso del operador en un solo panel
- Cambio rápido entre vehículos activos (swipe o selector)
- Notificaciones cuando un soak termina en un vehículo que no es el activo
- Timeline consolidada: ver acciones de todos los vehículos del turno

### B. Analytics Avanzados
- Heatmap de productividad por hora/día (¿cuándo se hacen más pruebas?)
- Tendencia de turnaround time (¿estamos mejorando?)
- Comparativa entre operadores (respetuosa, para coaching)
- Export de reportes ejecutivos a PDF con gráficos

### C. Inventory Intelligence
- Alertas proactivas: "A este ritmo, el gas X se agotará el viernes"
- Sugerencia automática de reorden basada en consumo histórico
- Dashboard de costos estimados de gas por prueba

### D. Smart Notifications
- Centro de notificaciones mejorado con prioridad y agrupación
- Notificaciones push via Service Worker (no solo in-app)
- Resumen diario automático al inicio del turno

---

## Versión 8.0 — "La Gran Evolución"

**Filosofía**: Con 7.x estable y con tests, decisión informada sobre el futuro.

### Decisión Framework: Basada en Datos de 7.x

| Si encontramos que... | Entonces en 8.0... |
|------|------|
| Alpine.js escala bien, event bus + state manager funcionan | Quedarnos con Alpine + stores formales |
| Alpine limita en forms complejos o reactividad profunda | Migrar a **Svelte** (compila a vanilla JS) |
| Se necesita ecosistema rico (routing, i18n, devtools) | Migrar a **Vue 3** con build custom para single-file |

### Mejoras Candidatas para 8.0
- **IndexedDB** en lugar de localStorage (supera límite de 5MB)
- **Web Workers** para cálculos pesados (SPC, Cpk/Ppk)
- **Offline-first sync** mejorado (CRDTs para conflictos)
- **Multi-idioma** (i18n — actualmente todo en español)
- **Role-based access** (técnico vs supervisor vs gerente con permisos granulares)
- **Reportes PDF avanzados** con branding KIA corporativo
- **Integración con sistemas externos** (SAP, LIMS) via API gateway

---

## Timeline

```
7.1 "Infraestructura"  ──── Ahora ────────▶ State Manager, Event Bus++, Vitest
7.2 "Multi-Vehículo"   ──── Siguiente ────▶ Workflow paralelo, analytics, inventory intelligence
8.0 "Evolución"         ──── Futuro ───────▶ Framework decision, IndexedDB, i18n, roles
```

## Verificación

Para validar cada versión:
1. `node --check js/*.js` — verificar sintaxis
2. `npm test` — ejecutar Vitest (a partir de 7.1)
3. `./build.sh` — generar unified HTML
4. Probar flujos críticos en browser
