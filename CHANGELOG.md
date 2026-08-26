# Changelog — KIA EmLab

All notable changes to this project, organized by development round.

## v19.1 — Familias de interpolación del WVTA (2026-08-26)

Cierra el pendiente que v19.0 dejó anotado. La **familia de interpolación (IP)** es la agrupación
**oficial** del CoP en Europa: la declara el certificado de homologación (Whole Vehicle Type
Approval, Reg. UE 2018/858) en su punto **0.2.3.1**, por variante y versión.

### De dónde sale cada dato — la regla que no se debe romper

| Dato | Fuente |
|---|---|
| Identidad de la familia (código IP), miembros, TML/TMH, rango de CO₂ VL–VH | **WVTA** |
| Coeficientes f0/f1/f2 y CO₂ declarado **de cada vehículo** | **ICMS** |

El WVTA *sí* trae f0/f1/f2, pero **solo los de los vehículos extremos VL y VH** que acotan la
familia — no los del vehículo que se va a ensayar, que se obtienen interpolando entre ambos. Esa
interpolación es justamente lo que el ICMS entrega ya resuelto por MC code. Copiar los coeficientes
del certificado a un vehículo concreto sería usar los del extremo de la familia en vez de los
suyos. Por eso `homoState.ipFamilies` **no tiene campos f0/f1/f2**, y así está escrito en el propio
archivo, en la tarjeta de la pantalla y en `CLAUDE.md`.

### Lector del certificado

`homoIpParseWVTA(text)` es una función **pura** (sin DOM, testeable en Node) que interpreta el
texto pegado del PDF. Pedirle a alguien que teclee 5 familias × 5 campos por certificado es la
forma segura de que la función no se use.

Dos cosas que el PDF hace y que hubo que resolver con el documento real en la mano:

- **Parte los códigos entre renglones** cuando la columna es angosta
  (`IP-0401789-` / `3KP`) — `_homoWvtaJoinSplitCodes` los vuelve a pegar antes de interpretar.
- **No siempre etiqueta igual el encabezado de columnas**: en un mismo certificado aparece como
  `Interpolation family …` en una página y como `Version(s) IP-…` en la siguiente. Por eso se toma
  como encabezado cualquier renglón con códigos IP que no sea el `IP Family` del bloque 0.2.3.1.

**Verificado contra un certificado real** (`e4*2018/858*00261*00 Cor.01`, tipo CL4m / K4): las 5
familias salen con sus variantes, versiones, TML/TMH y CO₂ VL–VH idénticos a lo impreso.

### La variante sola no basta — y la app no adivina

En ese certificado **`B5P22` pertenece a dos familias distintas** según su versión
(`M61A11` → IP-0401788-3KP, `D71A11` → IP-0401787-3KP). `homoIpFamilyForVehicle()` es LA definición
de la resolución y va en este orden: sello explícito en el vehículo → variante + versión → los del
catálogo ICMS por MC code → variante sola **solo si no es ambigua** → `null`. Una variante repartida
entre familias devuelve `null` en vez de escoger una.

### Chequeo de rango: estructura del WVTA contra números del ICMS

`homoIpMassCheck` / `homoIpCo2Check` / `homoIpScanOutliers` marcan un vehículo cuya masa de ensayo
o CO₂ declarado (datos del **ICMS**) caen fuera del rango de su propia familia IP (rango del
**WVTA**). O el dato está mal capturado, o el vehículo no pertenece a esa familia: en los dos casos
es algo que corregir antes de que lo encuentre un auditor. Entra al Panorama como motivo de
**atención**, sin tocar el veredicto — es un problema de evidencia, no de emisiones.

### Integración con el CoP

- El Panorama muestra la familia IP en la tarjeta y los atípicos como motivo de riesgo.
- `copFamilyPDF()` cita la familia IP, sus masas TML/TMH y el número y fecha del certificado.
- **La clave de agrupación NO cambia**: sigue siendo `copVehicleFamilyKey`, que es la identidad de
  las series SPC y de todos los juicios ya guardados. La familia IP es informativa sobre la fila.
  Reemplazarla huerfanaría el histórico completo.

### Sync

`_mergedHomo` se arma desde cero en `fbPullApply`, así que una clave que no se liste ahí **se pierde
en cada pull**. `ipFamilies` se fusiona por código (gana `updatedAt`). `homoSyncReload` invalida el
índice de resolución y el cache del Panorama.

### Detalle de UI

La tarjeta seguía diciendo "aún no hay familias IP" con las familias ya guardadas: las pestañas del
Panel están cacheadas y `pnRender()` solo no repinta la pestaña actual. Se resuelve con
`tabCacheInvalidate('pn', 'pn-homolog')`, el mismo patrón de `_pnProjNav` (v16.8).

## v19.0 — CoP: de calculadora a tablero de conformidad (2026-08-26)

Pedido del laboratorio: el CoP es lo que muestra el seguimiento y lo que probablemente se
comparta en una auditoría, así que tenía que ser **muy visual y profesional**. Cuatro carencias
concretas, todas verificadas en el código antes de tocar nada.

### El módulo era una calculadora, no un sistema de registro

- **No había panorama.** Había que elegir UNA familia en un `<select>` para ver algo. Ninguna
  pantalla respondía "¿cómo va el CoP del laboratorio?".
- **No había seguimiento en el tiempo.** `copState.saved` era una lista plana pintada como
  renglones diminutos. Peor: `copAutoPopulateVins` **reasignaba `copState.vehicles` entero** al
  cambiar de familia, así que solo existía la mesa de trabajo de UNA familia y cambiar de familia
  borraba sin avisar lo capturado a mano en la anterior.
- **No había nada que entregar.** Cero exportaciones, y el Centro de Reportes tenía 17 renglones
  y **ninguno de CoP**.
- **No tenía identidad visual.** `grep -c "\.cop-" styles.css` = **0**: era 100% `style=""` en
  línea, contra `.tp-*` (40 clases), `.inv-*` (25), `.pn-*` (127), `.dash-*` (38).

### Los límites estaban mal para el 38% del catálogo

Al verificar el validador salió un bug real: `COP_PI_LIMITS`/`COP_CI_LIMITS` tienen los límites
Euro 6 **escritos a fuego** y nunca consultan `getRegulationProfile()`, aunque `_copRegCombinesTHC`
ya leía el perfil para otra cosa. De 173 configuraciones del catálogo:

| Norma | cfgs | Qué pasaba |
|---|---|---|
| EURO-5 / PRE-EURO 7 / EURO-6C | 97 | correcto **por casualidad** (mismos valores) |
| **EURO-2** | 28 | CO 2.2 real vs **1.0 aplicado**; THC+NOx 0.5 vs **THC 0.1** → falsos NO CONCORDANTE |
| **EURO-4** | 22 | NOx 0.08 real vs **0.06 aplicado** → falsos NO CONCORDANTE |
| **SULEV 30** | 15 | NOx 0.02 y NMHC 0.01 en **g/mi**, comparados contra límites en g/km → el sentido peligroso: **aprobar lo que falla** |
| EURO-3, BRAZIL L8 | 7 | sin perfil definido |

**Resuelto acotando el alcance** a lo que el laboratorio realmente certifica: `COP_SCOPE_DEFAULT`
= EURO-5 / EURO-6E / PRE-EURO 7 en EUROPE y MIDDLE EAST (45 de 173 configuraciones). Esas tres
normas comparten exactamente los valores ya codificados, así que **ningún veredicto cambia**.
`copInScope()` es LA definición del alcance y todo filtra por ahí; `copOutOfScopeSummary()`
**declara** lo que queda fuera y por qué — una configuración que desaparece sin explicación es
justo lo que un auditor pregunta. `copLimitsForFamily()` compara en cada render el límite aplicado
contra el perfil real y avisa si difieren, para que el agujero no vuelva si mañana entra una norma
nueva al alcance. Se agregó el perfil `EURO-6E` (mismos límites de Tipo 1 que 6C: Euro 6e cambió
los factores de conformidad de RDE, no el Tipo 1), y `loadRegulations()` ahora siembra los perfiles
nuevos en dispositivos que ya tenían `kia_regulations_v1` escrito — antes esa rama solo corría en
un dispositivo virgen.

**El SPC NO se acotó**: es control de proceso, no juicio de conformidad, y apagarle al Panel las
alarmas de las 31 configuraciones EURO-5 de MEXICO sería perder una red de seguridad que nadie
pidió quitar. `copSpcScanAlarms()` sigue barriendo todo y marca cada alarma con `inScope`.

### Panorama (vista nueva, y ahora la de arranque)

`copPortfolioRows()` es **LA definición** del estado CoP de todas las familias. No agrega
matemática: compone `copCalcStats`, `copSpcStats`/`copSpcFlags` y `tpBuildFamilies` (ya cacheada
por `_tpGetPlanHash`). **Memoizada** — `pnGetActiveAlerts` corre en cada render del Panel y sin
memo el Panel se arrastra. Une lo que el plan exige con lo que ya se probó, así que una familia
planeada y nunca ensayada aparece **en gris** en vez de desaparecer.

`copFamilyRisk()` es LA definición del semáforo, y es **pura** (recibe la fila, se prueba sin DOM).
Reglas de honestidad, deliberadas y comentadas en el código:

- Con `n < 3` el nivel es **`sin-datos`, nunca verde**: el muestreo secuencial no decide nada con
  esa muestra y pintar verde afirmaría algo que la estadística no sostiene.
- El texto dice **qué se observó**, no qué va a pasar. La pantalla lo etiqueta como aviso interno
  anticipado, no como veredicto regulatorio.
- **Margen delgado con veredicto PASS es ámbar, no rojo.** Pintar un PASS del mismo rojo que un NO
  CONCORDANTE confunde dos situaciones muy distintas y quema la credibilidad del tablero. Sube a
  rojo solo si además el Cpk dice que el proceso no puede sostener ese margen.
- `confidence` baja sola con n chico o con la familia sin ensayar hace mucho.

### Que se entienda a simple vista

El muestreo secuencial se presentaba como una tabla de `U`, `A(n)`, `B(n)` que nadie ajeno al
laboratorio puede leer. Ahora hay una **barra por gas** con las tres zonas y la marca de U: se ve
de qué lado cayó y cuánto le falta para decidir. La escala se verificó: monótona, acotada, las
fronteras A(n)/B(n) caen exactamente en el borde de su zona y un U extremo se clava en el extremo
sin reventar la escala. Se dibuja igual en pantalla (CSS) que en el PDF (vectorial).

El veredicto de familia pasa de tarjeta delgada a **banner protagonista**, y **82 clases `.cop-*`**
nuevas en `styles.css` (antes cero) dan al módulo el vocabulario que los demás ya tenían, incluido
un **modo presentación** con alcance a `body.cop-present` — sube la escala solo dentro del CoP,
nunca la global, que es la que usan los técnicos en el celular todos los días.

### Expediente y evidencia

`copFamilyHistory()` **deriva** la cronología (juicios + ensayos + alarmas) en vez de guardarla —
mismo principio que `pnProjectTimeline` y `v.timeline`. `copVerdictAt()` pinta la franja de 12
meses; un mes sin juicio va **en gris, nunca verde por omisión**.

Los juicios ahora **congelan** los límites, los A(n)/B(n), la estadística por contaminante, el
operador y la versión de la app: un registro que solo guarda "FAIL" deja de ser reproducible si
mañana cambia un perfil, y por tanto deja de ser evidencia. `_copTrimSaved` **compacta en vez de
borrar** (patrón `snapshotPurged` de v18.1) y nunca toca el juicio vigente de una familia.

`copFamilyPDF()` arma el expediente en 10 secciones, separando **procedimiento** (R154/R83) de
**norma de emisiones** — son dos cosas distintas que la pantalla confundía. Sin juicio guardado
sale marcado **PRELIMINAR**: el documento no puede sonar más seguro que la pantalla.

### Mesa de trabajo por familia

`copState.families` guarda la tabla por clave de familia. `copState.vehicles` **sigue siendo un
alias vivo** del array de la familia abierta, así que los ~20 sitios que leen o mutan filas no se
tocaron; los seis que reasignaban el array pasan por `_copSetVehicles()`.

**Regla para código nuevo: nunca `copState.vehicles = ...` directo, siempre `_copSetVehicles()`.**

`copSyncVinsFromTests` reemplaza a `copAutoPopulateVins`: fusiona en vez de reemplazar. Las filas
manuales no se tocan y **una celda con valor no se sobrescribe jamás** — si el laboratorio tiene
otro número se marca `staleAuto` y se avisa con un botón para traerlo. Reescribir en silencio un
valor sobre el que ya se emitió un juicio es exactamente el hallazgo que este módulo existe para
evitar.

`_fbMergeCopFamilies` fusiona por clave (gana `updatedAt`) y dentro de la ganadora agrega los VINes
que solo tenía la perdedora. En una frase: **dos técnicos que capturan familias distintas conservan
ambas; si capturan la misma, se queda la más reciente más los VINes que el otro había agregado.**
Renumera las filas siempre, porque la fusión es donde chocan datos de dos equipos y dos filas con
el mismo id harían que `copRemoveRow` borre las dos.

### Otras correcciones encontradas al probar

- **`fbPullApply` tomaba `copState` del remoto entero.** La vista, la familia abierta y la mesa de
  trabajo saltaban porque otro técnico tocó su pantalla. Esos campos son estado de UI por
  dispositivo y ahora gana el local.
- **`copSyncReload` repintaba encima de lo que estabas capturando** (rehace el `innerHTML`
  completo). Ahora difiere el repintado hasta que sueltes el campo.
- **Al abrir una familia sin mesa guardada**, `copState.vehicles` seguía apuntando al array de la
  familia anterior y la nueva **heredaba sus VINes**, incluidos los manuales.
- **El selector de familia leía solo `tpState.planData`**, así que una familia con ensayos pero sin
  plan importado salía como "Familia (0)" aun estando abierta y con datos en pantalla.
- **`HELP_TABS` traía entradas del CoP desde v16.0 pero nadie llamaba `helpBannerHTML()` aquí**:
  los banners de ayuda nunca se habían visto en esta plataforma.
- La cabecera decía "Euro 6" fijo y llamaba "Reglamento" al procedimiento de ensayo.

### Deuda conocida

- **Familias IP (WVTA) pendientes**: la agrupación oficial de interpolación para Europa queda para
  la siguiente ronda, en cuanto lleguen las fotos de los certificados. Los coeficientes f0/f1/f2
  seguirán viniendo del **ICMS**, no del WVTA.
- `undoPush('cop', …)` sigue siendo un **no-op** (`undoPush` solo conoce cop15/testplan/inventory).
  Ningún código nuevo del CoP lo llama, precisamente por eso.
- La migración de estilos en línea a `.cop-*` es **parcial y deliberada**: el código nuevo usa las
  clases, lo viejo se convierte oportunísticamente en vez de reescribir 1290 líneas de una vez.

## v18.6 — Cuota de sync, cola que perdía liberaciones y PDF sin CDN (2026-08-25)

Reportado desde el laboratorio: el panel de sync marcaba **75/60 escrituras/hora**, **211 operaciones
bloqueadas hoy** y **50 pendientes en cola**. Más los issues **#107** (PDF) y **#108** (vehículo
manual que "vuelve a aparecer al recargar").

### El tope era nuestro, no de Firebase

`FB_QUOTA_LIMITS` estaba en **500 escrituras/día**. La cuota gratuita real de Firestore (Spark) es de
**20.000 escrituras y 50.000 lecturas al día** por proyecto: nos estábamos limitando al **2,5%**, y el
tope por hora (60) reventaba en un turno normal con varios módulos sincronizando.

Nuevos topes **por dispositivo**: 500/hora y 2.000/día de escritura (1.500 y 10.000 de lectura). Con
`FB_ASSUMED_DEVICES = 5` equipos **al tope**, el techo entre todos es 10.000/día = **50% de lo
gratuito**; el uso esperado queda muy por debajo. El panel ahora muestra ese margen real en vez de
sugerir que el laboratorio está al límite.

### La cola descartaba justo lo más importante — causa de #108

```js
fbOfflineQueue.sort(function(a, b) { return a.priority - b.priority; });  // 1 = más importante
if (fbOfflineQueue.length > 50) fbOfflineQueue = fbOfflineQueue.slice(-50);   // ← conserva las ÚLTIMAS
```

La lista queda ordenada **ascendente**, así que `slice(-50)` conservaba las de **menor** prioridad y
tiraba las de mayor. `FB_PRIORITY_MAP` da prioridad **1** a `cop15` — las liberaciones de vehículos —
frente a 3 de `backups` y `merge-history`. **Al llenarse la cola, lo primero en desaparecer eran las
liberaciones, y sobrevivían los respaldos.**

Esa es la cadena de #108: se archiva el vehículo → se guarda local ✓ → `fbPush('cop15')` lo encola
porque la cuota está agotada → la cola se desborda y **descarta ese registro** → la nube nunca se
entera → cualquier pull posterior restituye el estado previo. Corregido a `slice(0, FB_QUEUE_MAX)` y
el tope de la cola sube de 50 a 200.

### El contador "diario" medía la última hora

`fbQuotaCheck` calculaba `dailyCount` desde `fbQuota.writes.length`, pero ese array lo **poda
`fbQuotaPrune` a los últimos 60 minutos**. Por eso el panel mostraba el mismo `75` en "por hora" y en
"límite diario", y el tope diario no podía dispararse nunca (60/hora salta mucho antes). Se añaden
acumuladores `dayWrites`/`dayReads` que solo se reinician al cambiar de día.

### #107 — el PDF mostraba el aviso y no generaba archivo

`generateCOP15PDF` hacía `const { jsPDF } = window.jspdf;` **sin guarda**, y eso lanza al
desestructurar `undefined` — pero **después** de `showOverlayLoading('Generando PDF...')`, así que el
aviso quedaba pegado, sin archivo y sin error legible. Ocurre cuando la librería no cargó: la red del
laboratorio bloquea CDNs (el mismo motivo por el que Alpine ya estaba vendorizado, y por el que esa
laptop no llega a Firestore).

- **jsPDF vendorizado** (`vendor/jspdf.umd.min.js`, inyectado por `build.sh` con el mismo patrón de
  Alpine). El PDF COP15-F05 es el entregable del laboratorio: no puede depender de un CDN.
- Guarda explícita que oculta el aviso y explica el problema si aun así faltara.

### Verificación

`test_quota_queue.js` — 16 comprobaciones: una liberación sobrevive al desbordamiento de la cola (y
la prueba demuestra que el `slice(-N)` anterior sí la tiraba), el contador diario sobrevive al paso
de las horas mientras el horario se reinicia, los topes dejan margen contra el plan gratuito, y sin
jsPDF `generateCOP15PDF` devuelve `null` sin lanzar y sin dejar el aviso pegado. Los **19** archivos
de prueba del proyecto pasan.

**Pendiente de confirmar en campo:** no pude reproducir localmente el "vuelve a aparecer" de #108
(archivar y recargar persiste bien, manual o no). La cadena descrita arriba lo explica y queda
corregida, pero hay que verificarlo en el dispositivo con datos reales.

---

## v18.5 — Usuarios: el candado circular de permisos (2026-08-25)

Tercer reporte seguido sobre la misma pantalla (**#100**, **#103**, **#105**): en Datos → Usuarios no
se podía modificar nada, ni escribir ni usar los dropdowns, **sin ningún error en consola**. Las dos
rondas anteriores corrigieron defectos reales (`skillCatalog` indefinido en v18.3, clave `x-for`
duplicada en v18.4) pero **ninguno era la causa**.

### Causa raíz — reproducida, no inferida

Con el estado real del dispositivo (sesión de Jorge Nuñez, `operatorId: 4`):

```
usuario:  { id: 4, name: 'Jorge Nuñez', role: 'Técnico' }
authCan('users.manage') → false     authCan('users.skills') → false
campos del perfil: 22 visibles, 22 DESHABILITADOS, 0 habilitados
errores JS: 0
```

**Un candado circular:**

1. `pnInit` siembra los operadores de `CONFIG.operators` con `role: 'Técnico'`.
2. `AUTH_ROLE_PERMS` da `users.manage` **solo** a `Supervisor` y `Coordinador`.
3. El único camino para cambiar un rol (`pnEditOperator` → `pnOpUpdate`) exige... `users.manage`.

Nadie podía otorgarse ni otorgar el permiso para otorgar permisos. Todo caía por
`:disabled="!can('users.manage')"` y `x-show`, **sin toast, sin error, sin explicación**.

La supuesta salida de emergencia estaba rota por partida doble: `authBypassLogin` era **inalcanzable**
(comprueba que no haya operadores, y `pnInit` siempre los siembra antes) y además asignaba
`role: 'Admin'`, que **no existe** en `AUTH_ROLE_PERMS` → cero permisos.

### Corregido

- **`_pnEnsureAdminExists()`** (`js/panel.js`, al final de `pnInit`, que corre **antes** de
  `authInit`): si ningún operador activo tiene `users.manage`, promueve a Coordinador — al jefe de
  laboratorio si está en el roster, si no al primer activo — sellando `updatedAt` y con
  `auditLog('rol_desbloqueado')`. **Idempotente**: con un administrador presente no toca nada.
- **`_authNormalizeRole` / `authRoleHas`** (`js/auth.js`): el lookup era literal, así que
  `' Supervisor'`, `'SUPERVISOR'` o `'Tecnico'` daban `[]` — **cero permisos en silencio**. Ahora se
  empatan ignorando mayúsculas, acentos y espacios; un rol inventado cae a `Técnico`.
- **`authBypassLogin`**: `'Admin'` → `'Coordinador'`.
- **`authRefreshCurrentRole()`**: `authState.currentUser.role` es una COPIA tomada al iniciar sesión,
  así que promover a alguien no surtía efecto hasta el siguiente tick o una recarga. Se extrae de
  `authSessionCheck` y se llama también desde `pnOpUpdate`.
- **`can()` lee `_dataVersion`** para que Alpine reevalúe los `:disabled` al cambiar el rol.
- **Aviso que explica el bloqueo** (`index.html`, pestaña `pn-users`): qué rol tienes, cuál hace
  falta y qué sí puedes hacer — en vez de 22 campos grises.
- **`pnOpEditModal(opId)`**: formulario con `<select>` de rol y los permisos que otorga cada uno,
  vía `showModal({body, buttons})` (v18.2). Reemplaza dos `prompt()` encadenados donde el rol se
  **tecleaba a mano** y, si se escribía distinto, `pnOpUpdate` lo descartaba **en silencio** (ahora
  avisa). Se añade además una fila **Rol** en el perfil, que es donde uno lo busca.
- **`_pnDedupeOperators()`**: el merge empataba por `id|nombre` pero la sesión busca **solo por id** y
  toma el primero, así que `'Jorge Nuñez'` y `'Jorge Núñez'` con la misma id sobrevivían duplicados y
  podía ganar el marcador provisional sin permisos. Se fusionan conservando PIN y competencias, y el
  merge de `firebase-sync.js` pasa a clavar por id y a normalizar el rol.
- **Defensa en profundidad**: `pnOpUpdateProfile` y `pnOpSetSkill` llevan su propio `authRequire`; el
  candado vivía solo en la capa de vista.
- **Higiene**: `_syncAndSave` metía el **Proxy reactivo de Alpine dentro de `pnState`**, por donde
  luego pasaba todo el código clásico y el `JSON.stringify` que serializa los hashes de PIN — y
  además las reasignaciones dejaban de disparar repintado (reactividad rota **sin errores**). Ya no
  copia `operators` de vuelta (los `pnOp*` mutan `pnState` directo) y desenvuelve la bitácora.

### Verificado que NO estaba roto

Se sospechó del `<textarea x-text>` de Notas y de los `<option :selected>` sin `x-model`. Probados en
navegador: **muestran y guardan bien**. No se tocaron.

### Verificación

`test_users_permissions.js` — **27 comprobaciones** en 8 escenarios: el estado real del dispositivo
(0 campos bloqueados, escribir y dropdowns persisten), la regla general sin Jorge en el roster,
idempotencia, normalización de grafías, deduplicado conservando PIN, el aviso que ve un Técnico,
promoción aplicada sin recargar, y que `pnState` ya no recibe el Proxy. Los **18** archivos de prueba
del proyecto pasan.

---

## v18.4 — Una clave repetida tumbaba el Panel entero (2026-08-25)

Dos reportes desde producción sobre v18.3, ambos con el **mismo error adjunto**:

- **#102** — "Historial de versiones no funciona" (`panel → pn-system`)
- **#103** — "Ningún campo funciona aún, no permite hacer ninguna modificación" (`panel → pn-users`)

```
Uncaught TypeError: Cannot read properties of undefined (reading 'after')
```

### Causa raíz

Localizada por bisección sobre las 32 plantillas `x-for` (desactivándolas por mitades hasta que el
error desaparecía). La culpable resultó ser, literalmente, la del issue #102:

```html
<template x-for="(v, vi) in versionHistory" :key="v.version + vi">
```

`v.version` es texto y `vi` un número, y se concatenan **sin separador**:

| entrada | índice | clave |
|---|---|---|
| `'17.11'` | 9 | `"17.119"` |
| `'17.1'` | 19 | `"17.119"` |

Dos filas distintas producen la misma clave. Con una clave repetida, el `x-for` de Alpine falla al
buscar el nodo ancla (`lookup[key]` → `undefined`) y lanza `undefined.after`. **Ese throw mata el
efecto del componente Alpine completo**, así que deja de reaccionar TODA la pestaña de Datos — de ahí
que #103 reportara que ningún campo respondía, en una pantalla distinta a la del defecto.

**Corrección de una afirmación previa:** en v18.3 dije que este error era "transitorio y se recupera
solo". Era incorrecto: es fatal para el componente. Lo que me confundió fue que las listas ya
pintadas se quedan visibles en el DOM aunque la reactividad esté muerta.

### Corregido

- `:key="vi"` — el índice por sí solo es único y la lista es estática.
- **`test_alpine_keys.js`**: recorre las 7 pestañas Alpine del Panel más el perfil de operador, y
  falla si CUALQUIER `x-for` tiene claves repetidas (leyendo `_x_prevKeys` de Alpine). Es una
  comprobación general, no caso por caso: esta misma clase de defecto ya había aparecido en v18.3
  con `:key="a.message"` en la lista de alertas. También verifica que el Historial de Versiones
  liste sus 41 entradas y que un campo del Panel guarde de verdad.

### Verificación

4/4 en `test_alpine_keys.js`; los 17 archivos de prueba del proyecto pasan.

---

## v18.3 — Niveles de operador + dispositivos fuera del espacio compartido (2026-08-25)

Dos reportes desde producción: el issue **#100** (llegó por el botón 🐞) y una foto de la laptop de
trabajo mostrando `Error (LAPTOP-TRABAJO-JORGE)`.

### Issue #100 — "No puedo modificar el nivel de autoridad de los operadores"

El propio reporte traía la causa en los errores JS adjuntos: `ReferenceError: skillCatalog is not
defined`, en `panel → pn-users`.

La plantilla del perfil (`index.html`) hacía `x-for="grp in skillCatalog"`, pero el componente Alpine
solo exponía `skillCatalogFlat()` — **no existe ninguna propiedad `skillCatalog`**, y además la
plantilla necesita datos AGRUPADOS (`grp.group` / `grp.items`), no la lista plana. Alpine lanzaba el
ReferenceError y la tarjeta **🎓 Competencias se renderizaba vacía, con cero selectores**.
Reproducido en navegador: `{cardFound: true, selects: 0}`.

Como una habilidad puede otorgar permisos (`grants` — un Técnico certificado como Aprobador CoP gana
`test.approve` sin cambiar de rol), la tarjeta rota significaba que **nadie podía dar ni quitar
autoridad a nadie**. Corregido con `skillCatalogGrouped()` en el componente (lee `_dataVersion` para
que Alpine la trackee, patrón v16.6). Verificado: 18 selectores con los 4 niveles, y el cambio
persiste en el operador.

### Dispositivos que se salían del espacio compartido

El campo de los ajustes de sync decía **"ID de Estación (identifica este dispositivo)"** con
placeholder `ej: CELDA-1, LAB-TABLET`: invitaba a escribir el nombre del equipo. Pero `stationId` no
es una etiqueta — es la **ruta del espacio compartido en Firestore** (`stations/{id}/...`). Escribir
el nombre de la laptop la mandó a `stations/LAPTOP-TRABAJO-JORGE`, un dataset privado: dejó de ver
los datos del laboratorio y de encontrar el token de reportes (que vive en
`stations/KIA-EMLAB/settings/bugreports`) — de ahí que el celular sí reportara bugs y la laptop no.
Resto de antes de v15, cuando cada estación tenía su propio namespace; el campo correcto para
nombrar el equipo (`kia_fb_device_name`) ya existía justo debajo.

- El campo pasa a **solo lectura**, con aviso y botón **Reparar** si el equipo está fuera.
- `fbSetStation` **rechaza** cualquier ruta distinta de `FB_SHARED_WORKSPACE` (sigue siendo global y
  llamable desde consola o código viejo).
- **`fbRepairStationIfStray()`** devuelve el dispositivo al espacio compartido al arrancar, con aviso
  y `auditLog('workspace_reparado')`. Se llama desde `initializeSystem`, **no** desde `fbInit`: con
  Firestore caído `fbInit` ni siquiera llega a esa línea, y es justo el dispositivo desconectado el
  que necesita la reparación. (La primera versión la puse en `fbInit` y la prueba la cazó.)

**No corregido, porque no es de la app:** el `Firestore no disponible` de esa laptop es un fallo de
transporte de la red corporativa, no de configuración. La app ya cae a REST cuando el SDK no
responde; el espacio de trabajo era un problema independiente que habría persistido igual.

### Corregido de paso

`:key="a.message"` en la lista de alertas: dos alertas con el mismo texto (p. ej. la misma
calibración en dos instrumentos) daban claves duplicadas y rompían el `x-for` de Alpine con
`Cannot read properties of undefined (reading 'after')` — el error que aparecía repetido en TODOS
los reportes de bug. Ahora la clave es `source + índice`. Quedaba otro caso transitorio en el
arranque de Alpine que se recupera solo (todas las listas terminan pintadas); no se persiguió más.

### Verificación

`test_users_workspace.js` — 10 checks: la tarjeta rinde 18 selectores con los 4 niveles, el cambio
persiste, no hay `skillCatalog is not defined`; y sembrando `kia_fb_station = 'LAPTOP-TRABAJO-JORGE'`
(el estado real de la laptop) el dispositivo se repara solo al arrancar, queda auditado,
`fbSetStation('OTRA-COSA')` ya no lo desconecta y el campo libre desapareció. Los 16 archivos de
prueba pasan.

---

## v18.2 — Devolver al liberador + unidades de captura de gases (2026-08-25)

Reportado desde el laboratorio con un escenario simulado a propósito: el liberador transcribe mal
un gas, el aprobador lo captura bien, y **el aprobador se queda sin salida** — el botón de aprobar
está deshabilitado y no hay forma de pedir la corrección.

### Devolver al liberador

- **`returnToReleaser()`** regresa el vehículo a `ready-release`, borra `gasResults.liberador` y la
  firma del liberador (tiene que recapturar y volver a firmar) y limpia la alarma de desacuerdo.
- **Exige un motivo (≥5 caracteres)** y advierte explícitamente que no se escriban ahí los valores
  propios: si el aprobador le dicta el número, la verificación doble ciego deja de servir.
- `vehicle.returnHistory[]` guarda cada devolución (quién, cuándo, por qué, qué gases) como
  registro permanente; `vehicle.pendingReturn` es el aviso que ve el liberador y se apaga al
  reenviar. Timeline + `auditLog('returned_to_releaser')`.
- El botón se resalta automáticamente cuando hay desacuerdo.

### Unidades de captura (`captureUnit`)

El banco entrega CO/THC/NOx/NMHC en **mg/km** y CO₂ en **g/km**, mientras que el límite vive en
g/km: el técnico dividía entre 1000 de cabeza y tecleaba `.0243` a partir de un `24.3`. Ahí se
colaba el error de transcripción.

- **`gasConvert(v, from, to)` es LA definición** de la conversión (base g/km; `g/mi` = 1/1.609344).
  Ante una unidad desconocida devuelve el valor **sin tocar** — nunca corrompe un dato por un typo.
- `captureUnit` es **solo** cómo se teclea y se muestra. `_libCollectGasValues` convierte a `g.unit`
  en la frontera de lectura, así que comparación, PDF, SPC y CoP **no cambiaron una línea** y el
  histórico sigue siendo válido. Un perfil sin `captureUnit` se comporta exactamente como antes.
- El límite se muestra convertido (CO 1 g/km → **1000 mg/km**) para comparar contra lo tecleado.
- Editor: columna **Captura** por gas + preset **"⚡ Captura como el banco"** (todo en mg salvo CO₂,
  respetando la base km/mi del perfil). Soporta `g/km`, `mg/km`, `g/mi`, `mg/mi`.

### Corregido (preexistente, encontrado al implementar)

- **El editor de Regulaciones nunca funcionó.** `_pnRegShowModal` llamaba `showModal({body, buttons})`
  pero `showModal` solo entendía `message`/`confirmText`: el modal salía **vacío**, con "Cancelar/
  Aceptar" y sin un solo campo. Verificado en navegador antes y después. `showModal` ahora soporta
  `body` + `buttons` (con el id `globalModal` que los llamadores ya usaban para cerrar).
- **Pérdida de precisión en los gases.** `_libNormalizeVal` redondeaba a **3 decimales fijos**:
  NOx `0.0013` g/km se guardaba como `0.001` (−23%), y `0.0013` vs `0.0014` quedaban idénticos, así
  que el doble ciego los daba por **coincidentes**. Ahora conserva 9 cifras significativas.
- **Las claves de gas se conservan.** El editor hacía `.toUpperCase()`, así que guardar un perfil
  convertía `NOx` en `NOX` y dejaba huérfano todo el histórico de ese gas. Latente mientras el modal
  estuvo roto; activo en cuanto se arregló.

### Verificación

`test_gasunits.js` (32) con los valores reales del reporte: 24.3 mg/km → 0.0243 g/km exacto, ida y
vuelta sin pérdida, km↔mi, y que una unidad desconocida o un campo vacío nunca alteran el dato.
`test_return_flow.js` (24) en navegador: captura en mg/km, detección del desacuerdo, rechazo de un
motivo corto, devolución completa (estado, valores y firma borrados, historial, auditoría) y que el
aviso al liberador **no filtra** el valor del aprobador. Los 15 archivos de prueba pasan.

---

## v18.1 — Almacenamiento local: la fuga que impedía liberar vehículos (2026-08-25)

Reportado desde producción: `Datos → Sistema` marcaba **5.02 MB / 5 MB (100.4%)** con **"Otros"
en 4.53 MB (90.2%)**, y el laboratorio **no pudo liberar un vehículo**. Las tres Herramientas de
Limpieza existentes (COP15 / Test Plan / Notas >90 días) no tocaban nada de ese 90%.

### Causa raíz

`fbMergeApply` (`js/firebase-sync.js`) guardaba en `kia_merge_history` las **últimas 20 fusiones,
cada una con un `snapshot` que es una copia COMPLETA de `db` + `tpState` + `invState`**. Con datos
reales eso es ~500 KB por registro → **hasta 10 MB en una sola clave**, contra un presupuesto total
de 5 MB. El "keep last 20" estaba escrito como si cada registro fuera una línea de bitácora.

`fbMergeUndo` solo lee `hist[hist.length - 1].snapshot`: los snapshots de los 19 registros
anteriores eran **peso muerto que ningún código podía leer**. Y como `kia_merge_history` no estaba
en la lista de 9 claves conocidas del panel, caía entera en el bucket ciego "Otros".

### Corregido

- **`_fbMergeTrimHistory`** conserva el snapshot solo de la fusión más reciente (`FB_MERGE_SNAPSHOT_KEEP`)
  y capa la bitácora en 20 registros de metadatos. Los anteriores quedan marcados `snapshotPurged`
  y `fbMergeUndo` lo explica en vez de fallar.
- **`fbMergePurgeOldSnapshots()`** recorta lo ya guardado al arrancar — es lo que libera el espacio
  en los dispositivos que ya venían llenos. Verificado: **9.28 MB liberados** en la reproducción.
- **`storageHousekeeping()`** (`js/app.js`) corre al inicio de `initializeSystem()`: purga snapshots
  de fusión, borradores `kia_cop15_draft_*` caducados y `kia_fb_prerestore_snapshot` vencido (7 días,
  ahora sella `savedAt`). Los borradores ya caducaban a 24 h, pero **solo al abrir ese vehículo**:
  el de un vehículo archivado no se volvía a abrir nunca y por lo tanto no se borraba nunca.
- **Integridad de la liberación** (`js/cop15.js`) — el hallazgo más serio. `approveAndArchive` y
  `v7BatchRelease` llamaban `saveDB()` **ignorando su valor de retorno** y seguían con `tpSave()` e
  `invSave()`. Con el almacenamiento lleno el vehículo se marcaba archivado en memoria, `saveDB()`
  fallaba en silencio, pero el plan y el inventario **sí escribían sus propias claves**: quedaba el
  plan marcado como cumplido y el gas descontado, con el vehículo sin archivar. Ahora hay preflight
  (`_releasePreflightStorage`) antes de pedir la firma, y si `saveDB()` devuelve `false` se revierte
  y **no se persiste nada más**.

### Añadido

- **`pnStorageScan()` es LA definición** del uso de almacenamiento; sustituye los dos lazos ad-hoc
  (panel y Centro de Reportes) que tenían su propio bucket "Otros". `PN_STORAGE_REGISTRY` clasifica
  cada clave en `core` (dato del laboratorio, nunca se ofrece), `cache` (regenerable, se purga sin
  preguntar) y `review` (pesado y con posible trabajo sin enviar, uno por uno con consentimiento).
- **Desglose clave por clave** en Datos → Sistema, con etiqueta de tipo y botón de borrado para las
  de tier `review`. Ya no existe el renglón "Otros".
- **`pnReclaimSpace()`** — botón "🧹 Liberar N MB regenerables" que anuncia de antemano cuánto
  recupera y no toca datos del laboratorio ni la cola de reportes 🐞 sin enviar.
- Aviso explícito en pantalla de que el límite es **del navegador y de este dispositivo**, y que
  estar en Firebase no lo amplía. Toast al arrancar por encima del 90%.

### Verificación

`test_storage.js` — 17 comprobaciones sobre el escenario real reproducido (20 fusiones × 500 KB =
10.26 MB): la purga libera 9.28 MB y devuelve el dispositivo por debajo del límite; la fusión más
reciente conserva su respaldo; `kia_db_v11` / `kia_testplan_v1` / `kia_lab_inventory` quedan intactos
y clasificados como `core`; la purga es idempotente; la bitácora nunca acumula más de un snapshot.

---

## v18.0 — Plan Semanal: una sola pantalla, con vista previa en vivo (2026-08-24)

### El problema
El plan semanal proponía **casi puro arrastre** (carryover) de semanas anteriores, aunque las
prioridades ya hubieran cambiado. La causa era estructural, no de configuración:
`tpSelectWeeklyItems` llenaba la capacidad en tres pasos —obligatorias, **toda** la cola, y recién
después el déficit fresco—. Con capacidad real de 4 pruebas/semana y una cola de 20+, los dos
primeros pasos agotaban los lugares y **el tercero nunca corría**: una configuración recién
repriorizada literalmente no podía entrar al plan.

Se sumaban tres agravantes: el empuje por antigüedad (`agingBoost`, hasta +30 puntos) **no tenía
control en ninguna pantalla**, así que lo viejo trepaba solo; el arrastre **no caducaba nunca**; y
el auto-plan del viernes **aceptaba la semana él solo al cargar la página**, y aceptar es
justamente lo que marca cada pendiente como arrastre.

### La cola ahora tiene techo
- **Cuota**: por defecto la cola puede ocupar como máximo el **50%** de la semana. El resto queda
  reservado para las prioridades de hoy, así que el paso de déficit fresco **siempre** corre.
  Con capacidad 4: 2 de cola + 2 frescas, en vez de 4 de cola.
- **Caducidad** configurable (4 semanas por defecto): lo que lleva demasiado arrastrándose deja de
  proponerse. Es un cálculo **derivado** — no toca el déficit, así que `tpCoverageSummary()` no
  cambia: caducar no es haber probado.
- **Interruptor** para apagar el arrastre por completo y planear solo con lo de hoy.
- El empuje por antigüedad queda **acotado a la caducidad** y por fin tiene sliders.

### Todo en una pantalla, con vista previa en vivo
Plan → **Plan Semanal** se reorganizó en dos paneles: a la izquierda se decide **cómo** se elige
(ponderación de déficit/volumen/región, peso por región, cola y filtros) y a la derecha se ve **qué**
se propondría, actualizándose al instante. La propuesta es *exactamente* lo que creará "🚀 Generar":
muestra día de preacondicionamiento y prueba, puntaje y de dónde salió cada fila (obligatoria, cola
o déficit), con **📌 fijar** y **🚫 excluir** por fila y un desplegable de "siguientes candidatos"
con ➕ para añadir. Las perillas de ranking siguen también en Reglas (mismo builder, sin duplicar
código); las reglas de ratio se quedan solo ahí porque cambian el déficit de todo el sistema.

### Filtros de la semana
Siete selectores en cascada (Familia, Región, Regulación, Modelo, Cilindrada, **Body**, Manejo) que
se estrechan entre sí como la cascada del Alta, para dedicar la semana a un solo tipo de vehículo.
Aplican **tanto al déficit fresco como a la cola**. Lo que se fija a mano entra aunque no cumpla el
filtro, y se avisa.

### Cambios de comportamiento (avisados a propósito)
- **El auto-plan del viernes ya no acepta solo**: deja una **propuesta** con el distintivo
  "⏳ Propuesta — falta aceptar". Aceptar sigue siendo lo que archiva la semana y genera arrastre,
  pero ahora es una decisión de una persona.
- Su guard pasó de `localStorage` (que no se sincronizaba, y por eso cada dispositivo generaba su
  propia semana) a `tpState.autoPlanLastRun`, sincronizado; y el dedupe ahora mira cualquier plan
  de esa semana, no solo los aceptados.
- **Descartar de la cola caduca**: se guarda el déficit del momento (`deficitAt`) y si más adelante
  el déficit **crece** por encima de ese valor, la configuración vuelve a la cola sola. Los
  descartes viejos conservan la semántica permanente.
- **Agregar en modo edición** ahora respeta la capacidad (pregunta antes de excederla), calcula el
  detalle de puntaje y **asigna día**: antes el vehículo agregado caía siempre en "sin día".
  Quitar del plan gana Deshacer y queda en el control de cambios.

### Notas técnicas
`tpPlannerCfg()` es LA forma de leer la configuración del planificador: `_fbPullSeed` reemplaza
`tpState` completo y solo rellena una lista fija de campos, así que un pull desde un dispositivo con
código anterior dejaría `plannerCfg` en `undefined` y la migración de arranque ya no vuelve a correr
— el accesor reaplica los defaults en cada lectura, y `plannerCfg`/`autoPlanLastRun` se sumaron a la
lista de preservación de `firebase-sync.js`. `tpPassesWeekFilter` reusa `_tpRuleMatchField` /
`tpRuleFieldOptions` sin modificarlos (los filtros tienen a propósito la forma de una regla de
prioridad). `tpAssignSchedule` acepta `{shuffle:false}` para que la vista previa no reordene los días
en cada tecla. **Fuera de alcance esta ronda**: "Generar Mes", el Simulador y Recuperación son copias
cercanas del mismo lazo greedy y siguen ignorando la cola y estos filtros — la pantalla lo advierte.

## v17.14 — Homologación Europa: coeficientes de dinamómetro y CO₂ desde el Alta (2026-08-24)

### Por qué
Para los vehículos **Europa**, los coeficientes con los que se carga el dinamómetro (f0, f1, f2, TM)
y el CO₂ declarado viven en el **ICMS de HMG**, y había que entrar a buscarlos **vehículo por
vehículo** — normalmente ya empezada la prueba, cuando esos datos deberían existir desde el primer
paso. Además, el validador CoP no comparaba CO₂ en absoluto.

### Catálogo importable (Datos → ⋯ Más → 🇪🇺 Homologación)
Se importa **una sola vez** el Excel/CSV que baja el ICMS y a partir de ahí el Alta se autollena.
Las **dos descargas se pueden subir por separado** (la de *WLTP Driving energy* con f0/f1/f2/TM y la
de *WLTP - ICE/HEV* con el CO₂): se **fusionan por MC code**, así que la segunda completa las filas
de la primera sin borrar nada. Reimportar actualiza, no duplica. Sin internet, `.csv` y pegado
siguen funcionando (SheetJS se carga diferido, patrón de `projects.js`).

### En el Alta — primer paso, no al preacondicionar
El bloque **🇪🇺 Datos de homologación** aparece **solo si la región es EUROPE**. Se escribe el MC
code, se elige de la lista y se autollenan los cinco valores. **A partir del segundo vehículo de la
misma configuración ya no hay que buscar nada**: `homoState.links` recuerda el enlace
configuración → MC code y lo autollena solo. Si falta algo, avisa sin bloquear el registro.

La ficha se guarda **en el vehículo** (`vehicle.homolog`), no en la configuración: queda constancia
de con qué coeficientes y contra qué CO₂ declarado se corrió **ese** vehículo, y se audita al
registrar (`homologacion_capturada`).

### En el CoP — CO₂ contra el valor declarado
Sección nueva **🌱 CO₂ vs valor declarado**. El CO₂ **no entra al muestreo secuencial** de los demás
contaminantes porque no tiene límite regulatorio fijo: su referencia es el valor declarado de cada
vehículo. Se evalúa aparte — desviación % por vehículo contra **su** target, y el promedio de la
familia contra una **tolerancia configurable** (4% por defecto, editable en Homologación). La tabla
lista por VIN el CO₂ medido, el declarado, la desviación y **los f0/f1/f2/TM con los que se corrió**,
que es justo la evidencia que hacía falta.

### Definiciones únicas (todo consumidor nuevo debe llamarlas)
`homoIsEurope`, `homoSearch`, `homoSuggestForConfig`, `homoVehicleData`, `homoCo2Deviation`,
`homoCo2Assess`, `homoMeasuredCo2`. El catálogo **se sincroniza** entre dispositivos
(`fbSyncModules.homolog`, merge por MC code quedándose con la fila más reciente).

### Alcance de esta ronda
Se comparó el **CO₂ combinado**. Las fases (Low/Medium/High/Extra High) y el consumo de combustible
se importan y se guardan, pero todavía no se comparan — agregarlos después no requiere rehacer nada.

## v17.13b — El token de bugs ya se comparte de verdad con todos los dispositivos (2026-08-24)

Guardar el token de GitHub seguía respondiendo *"Guardado en este dispositivo… no se pudo copiar a
los demás"* en un celular cuyo indicador decía **"REST Sync"** — justo el modo que v17.13a había
añadido. La causa no era el camino REST, sino **cuándo** se decide usarlo.

`fbSync._useREST` se enciende únicamente cuando la prueba de conexión del SDK hace **timeout, a los
12 segundos**. Si el técnico pica *Guardar* dentro de esa ventana (indicador todavía en
"Conectando..."), el flag sigue en `false`, se toma el camino del SDK —que en ese dispositivo está
roto— y la operación falla **definitivamente**, aunque un segundo después el dispositivo pase a
modo REST. En la captura del reporte se veía exactamente eso: el mensaje de error viejo junto a un
indicador que ya decía "REST Sync".

**`_fbBugsSdkOrRest(sdkCall, onSdkOk, restCall)`** pasa a ser la única forma de llamar a Firestore
en este módulo: usa REST directo si el flag ya está puesto y, ante **cualquier** fallo del SDK
(promesa rechazada, throw síncrono, o ni siquiera devolver una promesa), **reintenta por REST** en
lugar de rendirse. Como todas las operaciones escriben por id con `set`/PATCH, reintentar es
idempotente. Los siete helpers `fbBugs*` pasaron a usarlo.

Efecto práctico: el token se configura **una sola vez, desde cualquier dispositivo**, y llega al
resto del laboratorio aunque quien lo guarde tenga el SDK de Firestore roto o acabe de abrir la app.

## v17.13a — Correcciones del reporte de bugs en dispositivos con "REST Sync" (2026-08-24)

Dos fallas reportadas desde un celular del laboratorio al estrenar el botón 🐞, ambas del mismo
origen: **la app puede estar corriendo en modo REST** (el indicador del topbar dice "REST Sync")
porque el transporte del SDK de Firestore está roto en ese dispositivo, y los helpers `fbBugs*`
nuevos solo sabían hablar por el SDK.

### 1. "Error al renderizar esta sección — INTERNAL ASSERTION FAILED"
Al abrir Datos → 🐞 Bugs mientras el topbar decía "Conectando...", la pestaña **entera** se
reemplazaba por una caja de error cruda (se perdían de vista la cola pendiente y la configuración).

El SDK de Firestore, durante una reconexión, puede lanzar ese error de forma **síncrona** en vez de
rechazar la promesa. Los helpers tenían `.catch()` (para rechazos) pero no `try/catch` (para el
throw), así que la excepción subía hasta el `try/catch` de `tabCacheSwitch` en `app.js`, cuyo
trabajo es justamente reemplazar la pestaña. Ahora cada llamada al SDK va envuelta y ese caso se
convierte en el mismo error controlado de siempre: la pestaña sigue en pie y **solo** la sección
que falló muestra el aviso.

### 2. "Guardado en este dispositivo, pero no se pudo compartir"
Guardar el token de GitHub fallaba en el paso de compartirlo con los demás dispositivos, porque en
modo REST `fbSync.db` **existe pero no responde** — y `fbFilesEnsureReady()`, que solo comprueba
que exista, daba luz verde.

Los siete helpers `fbBugs*` tienen ahora **dos caminos**, igual que `fbPush`/`fbPull`: el SDK
cuando funciona y la **API REST** cuando `fbSync._useREST` está activo, reusando los primitivos que
ya existían (`_fbIdTokenPromise`, `fbToFirestoreValue`, el patrón de `fbRESTUrl`). La condición de
"listo" pasa a ser `fbBugsEnsureReady()`, que acepta el modo REST.

Detalle que valía una prueba propia: en REST, `fbBugsUpdateMeta` manda `updateMask.fieldPaths`.
Sin eso, un PATCH reemplaza el documento completo y marcar un issue como resuelto **habría borrado
el comentario del técnico y su captura**.

### 3. "Probar conexión" pedía guardar primero
Con el token ya escrito en pantalla, el botón respondía "Falta el token — guárdalo primero", porque
solo miraba lo ya guardado. Ahora prueba lo que está en los campos, así que se puede validar un
token antes de guardarlo. El mensaje de guardado parcial también se reescribió: dice explícitamente
que el botón 🐞 **ya funciona en ese dispositivo** y qué hacer para los demás.

## v17.13 — Botón 🐞 para reportar fallas con captura de pantalla (2026-08-22)

### Por qué
Los técnicos usan la plataforma a diario en tablets y teléfonos, y hasta ahora no había forma de
avisar de una falla en el momento en que ocurre: había que acordarse, encontrar a quién decirle y
describir de memoria una pantalla que ya no está. El resultado práctico era que la mayoría de los
problemas nunca se reportaban.

### Qué se agregó
Un **botón 🐞 flotante, visible en cualquier pantalla** (abajo a la izquierda, espejo del
temporizador de soak). Al tocarlo:

1. Toma **solo** una captura de lo que se está viendo (sin pedir permisos del navegador).
2. Abre una ventana con la vista previa y un campo **"¿Qué pasó?"**.
3. **Descartar** tira la captura sin guardar absolutamente nada — ni local, ni en la nube.
4. **Enviar reporte** publica un **issue en GitHub** con la captura embebida y el contexto técnico
   ya adjunto (versión de la app, en qué pantalla estaba, operador, tamaño de pantalla, navegador
   y los últimos errores internos de JavaScript). El técnico no tiene que explicar nada de eso.

### Offline-first, como el resto de la plataforma
Sin internet o sin token configurado el reporte **no se pierde**: queda en una cola local
(`kia_bug_queue`, máximo 3) y el 🐞 muestra cuántos esperan. Se reintenta solo al recuperar
conexión, al arrancar, y con un botón manual en la bandeja. Si `localStorage` se llena, se
sacrifican las capturas más viejas antes que el texto del técnico.

`html2canvas` se carga **diferido** desde CDN al picar el botón (mismo patrón que SheetJS en
`projects.js`): la app arranca igual de rápido. Si el CDN no responde, el reporte se puede enviar
igual, solo con texto.

### Bandeja: Datos → ⋯ Más → 🐞 Bugs
- **En espera de envío**: los pendientes, con miniatura, quién y cuándo, el error del último
  intento, y botones para reintentar o descartar.
- **Reportes enviados**: respaldo en la nube compartida de cada reporte publicado, con enlace a su
  issue y su estado. **"Actualizar estados"** le pregunta a GitHub cuáles issues ya cerraste y los
  marca ✅ Resuelto aquí — el ciclo se cierra desde GitHub, que es donde se arreglan.
- **Conexión con GitHub**: token, dueño y repositorio. Se configura **una sola vez** desde
  cualquier dispositivo y se comparte con todos los demás del laboratorio. Incluye "Probar
  conexión", que además avisa si el repositorio es público.

### Detalles de implementación
- **Módulo nuevo `js/bugreport.js`** (prefijo `bug*`), cargado al final. Los puntos de registro en
  `panel.js` son tres líneas (`_pnTabs`, `_pnGetRenderer` con guarda `typeof`, y la entrada del
  menú en `index.html`) — mismo patrón que Proyectos en v16.8.
- **Las capturas van a una rama dedicada `bug-shots`**, nunca a `main`: no ensucian la historia ni
  disparan workflows de despliegue. La rama se crea sola la primera vez.
- **Respaldo en Firestore** en `stations/KIA-EMLAB/bugreports/{id}` + captura fragmentada en su
  subcolección `chunks/`, reutilizando el mecanismo del Almacén de Archivos de v16.3. Las reglas
  actuales ya cubren cualquier subcolección de `stations/` (`match /{path=**}`): **no hay reglas
  nuevas que desplegar**.
- **Buffer de errores** (`window._bugRecentErrors`, cap 20, solo en RAM) alimentado por los
  listeners `error` y `unhandledrejection` de `app.js`. Nada se persiste ni se envía solo.
- Ayuda contextual completa (banner de pestaña + tooltips `?`), según la regla de v16.0.

### Aviso de seguridad
El token se guarda en la nube **compartida**: cualquier dispositivo con sesión del laboratorio
puede leerlo. Debe ser un *fine-grained token* limitado a ese repositorio, con permisos mínimos
(**Issues** y **Contents**, lectura y escritura) y fecha de expiración. Y si el repositorio es
**público**, los issues y las capturas —que pueden mostrar VINs, resultados y nombres— quedan
visibles para cualquiera en internet: conviene volverlo privado. Ver README → "Reporte de bugs".

## v17.12 — Bug grave: dos vehículos podían compartir el mismo identificador (2026-08-21)

### El síntoma
En **Operación**, elegir un vehículo distinto en "Seleccionar Vehículo Activo" dejaba la ficha
con el vehículo ANTERIOR: el selector decía `3KPFT4DE8TE410605 | COP-Emisiones` y abajo seguía
`VIN: 3KPFT5115VE000063 | ND-Emisiones | MANUAL`.

### La causa
`saveNewVehicle` asignaba `id: ++db.lastId`, un contador **puramente local**. La sincronización
fusiona vehículos **por VIN** y conserva el id del dispositivo que los creó, pero nunca adelantaba
`db.lastId` en el dispositivo que los recibe:

```
Tablet A: crea los vehículos 1..10        (lastId = 10)
Tablet B: los recibe por sync             (lastId sigue en 3)
Tablet B: da de alta uno nuevo → id 4     ← ya existía
```

A partir de ahí, **toda** búsqueda `db.vehicles.find(v => v.id == id)` devuelve el primero de los
dos. De ahí el síntoma, y dos consecuencias peores que no daban ninguna señal:

- El borrador de captura vive en `localStorage['kia_cop15_draft_<id>']` → **dos vehículos
  distintos compartían borrador**, y restaurarlo podía pegar los datos de uno en el otro.
- `deleteVehicleCascade` hacía `db.vehicles.filter(x => x.id != vehicleId)` → borrar un vehículo
  **borraba los dos**.

### La corrección
- **`nextVehicleId()`** (`js/app.js`) emite un id irrepetible entre dispositivos (marca de tiempo
  en microsegundos + azar, verificado contra los ya usados; siempre dentro de
  `Number.MAX_SAFE_INTEGER`). Reemplaza a `++db.lastId` en el alta y en la importación de
  archivos. `db.lastId` se conserva como "último id emitido" por compatibilidad.
- **`dedupeVehicleIds()`** repara los duplicados que ya existan: conserva el id del primero y
  reasigna uno nuevo a los demás. Corre al arrancar —antes de poblar cualquier selector, porque
  los `<option>` llevan el id como valor— y después de **cada** escritura de `db` que venga de la
  nube (`_fbPullSeed`, `fbMergeExecute`, deshacer, restaurar respaldo, restaurar snapshot). Deja
  constancia en Datos → Auditoría (`id_duplicado_reparado`) y avisa con un toast.
- **Referencias reparadas**: el temporizador de soak (`kia_soak_timer`) y el contexto de vehículo
  activo (`kia_active_vehicle`) guardan también el VIN, así que se reapuntan sin ambigüedad — y
  solo si el VIN coincide. El borrador compartido se descarta a propósito: su contenido es
  ambiguo. Las notas de entidad (`kia_entity_notes`, clave `vehicle:<id>`) quedan con el vehículo
  que conserva el id; separarlas sería adivinar.
- **`deleteVehicleCascade`** elimina el objeto por identidad (`x !== v`), no por id.

### Además: ninguna pantalla se queda con datos viejos
`loadVehicle`, `loadRelease` y `saveProgress` hacían `if (!vehicle) return;` — un regreso mudo que
dejaba en pantalla el vehículo anterior (o el botón "Guardando..." girando) sin decir nada. Ahora
limpian la selección, avisan y refrescan la lista.

## v17.11 — "Ad-hoc" pasa a llamarse "Fuera de Plan" + filtros de Historial (2026-08-21)

### Renombrado: ad-hoc → Fuera de Plan
El término "ad-hoc" no le decía nada a quien entra por primera vez, y lo que la marca realmente
significa es *esta prueba no viene del plan semanal aprobado*. Renombrado en toda la interfaz:

- Casilla del Alta: **"Prueba fuera de plan — no contabilizar al plan semanal"**.
- Distintivo en el Historial y en la Cola: **"Fuera de Plan"** (clase CSS `.adhoc-badge` →
  `.offplan-badge`, con `white-space: nowrap` porque la etiqueta nueva es más larga).
- Entrada de la línea de tiempo del vehículo: *"Vehículo Registrado (fuera de plan)"*.
- Comentarios y logs internos de `cop15.js`/`testplan.js`.

El campo de datos sigue siendo `vehicle.adhoc` — renombrarlo rompería los vehículos ya guardados
y sincronizados; solo cambió lo que se muestra.

De paso, el texto de ayuda de esa casilla afirmaba *"La aprobación en Power Automate sí se
enviará"*, un flujo eliminado en v15.6. Ahora dice que la liberación y la aprobación siguen su
curso normal. Se agregó su entrada en `CASCADE_TOOLTIPS` (`vehicleAdhoc`).

### Historial: filtro por Propósito y Estado completo
- **Propósito** es un filtro nuevo (`window._histFilterPurpose`), con las opciones derivadas de
  los propósitos que existen en `db.vehicles` — mismo patrón que el filtro de año, así la lista
  nunca ofrece un propósito sin registros ni omite uno capturado a mano.
- **Estado** no ofrecía `pending-approval`: un vehículo esperando aprobación no se podía filtrar
  aunque el estado exista desde la liberación doble-ciego. Agregado.
- **"Fuera de Plan"** se suma como opción del filtro de Estado (junto a los atajos "Activos" y
  "Archivados" que ya vivían ahí), para listar de un toque las pruebas que no cuentan al plan.
- Los cuatro filtros se combinan entre sí y "Limpiar" los reinicia todos.

## v17.10 — Liberación: elegir contra qué regulación se comparan los gases (2026-08-21)

### El problema
Un vehículo dado de alta en **modo manual** con "6DCT" (una transmisión) en el campo *Regulación*
llegaba a la Liberación y se topaba con un callejón sin salida: *"⚠️ La regulación 6DCT no tiene
perfil de gases configurado"* y un solo botón, "⚗️ Configurar regulaciones", que saca al técnico
del flujo. `ENVIAR A APROBACIÓN` quedaba deshabilitado sin manera de avanzar desde esa pantalla.
Pasa lo mismo con cualquier valor que no sea una norma con límites: `N/A`, el voltaje de un EV
(`220V`), o simplemente una regulación real cuyo perfil todavía no se ha creado.

### La corrección
**1. El liberador elige contra qué comparar.** El aviso ámbar ahora trae el selector de
regulaciones configuradas y un botón *"Comparar contra esta"*. Al elegir una, la tabla de gases se
arma con sus límites y la liberación sigue su curso normal.

**2. También cuando ya hay perfil.** Arriba de la tabla de gases aparece la franja
`⚖️ Comparando contra <norma>` con un botón **Cambiar** — corregir un alta equivocada ya no
obliga a repetir la prueba ni a re-registrar el vehículo.

**3. Queda registrado, no escondido.** La elección se guarda en `vehicle.regulationOverride`
(`{name, original, by, at}`), se anota en la línea de tiempo del vehículo y en la auditoría
(`regulacion_comparacion`, con la regulación del alta al lado), y se muestra en la pantalla del
**aprobador** — que necesita saber que está verificando contra una norma elegida a mano y no
contra la del alta. Solo puede cambiarse mientras el vehículo está en `ready-release`: una vez
enviado a aprobación, el liberador ya firmó valores contra un perfil concreto y moverlo
invalidaría la doble verificación ciega.

**4. `_libGetVehicleRegulation()` es LA definición** de contra qué regulación se compara un
vehículo (ahora antepone la elección manual al dato del alta). El **PDF COP15-F05** re-derivaba la
regulación por su cuenta leyendo `config['EMISSION REGULATION']`: podía citar una norma distinta
de la que se usó para validar en pantalla. Ahora llama al helper, y el encabezado de la sección
imprime *"Resultados de Emisiones — EURO-5"* en vez de solo el título genérico. Las llaves de
familia (`copVehicleFamilyKey`, `tpFamilyKeyForCfg`) siguen usando el dato del catálogo a
propósito: son identidad del vehículo, no base de comparación.

### El hueco de origen: el alta manual
El campo *Regulación Manual* era un `<input type="text">` libre, y el modo manual no tenía dónde
capturar la transmisión — de ahí que "6DCT" acabara guardado como norma de emisiones. Ahora:

- **Regulación** es un `<select>` con los perfiles configurados, más *"Otra (escribir)…"* (texto
  libre, para normas sin perfil todavía) y **"Definir al liberar"** como opción por defecto, que
  deja la decisión explícitamente para la pantalla de Liberación.
- Se agregó **Transmisión Manual** (opcional) → `config['TRANSMISSION']`.
- El resumen de confirmación muestra la transmisión y marca *"(se elegirá al liberar)"* cuando la
  regulación queda pendiente.
- `_altaManualConfig()` es ahora la única definición de la configuración capturada a mano (la
  construían por separado `confirmAlta` y `saveNewVehicle`, con riesgo de divergir).
- Ayuda contextual nueva (`CASCADE_TOOLTIPS`) en los cuatro campos del alta manual, con la
  advertencia explícita de que la transmisión **no** es la regulación.

## v17.9 — Topbar en una sola fila + menú "⋯" legible + configuraciones manuales que sobreviven (2026-08-21)

### Topbar: se acabó la segunda fila vacía
En tablet y teléfono la barra superior envolvía a una segunda fila que quedaba casi vacía (solo
🕘 y ⋯, con todo el ancho restante en blanco). Dos causas, ambas corregidas:

- `.platform-bar` traía `flex-wrap: wrap` en las media queries de 640px y 768px. Con las 5
  pestañas ya ocultas desde v16.8 (≤1024px navega la bottom-nav), no queda nada que envolver:
  ahora es `flex-wrap: nowrap` en ≤1024px.
- El `margin-left:auto` del indicador de sincronización vivía en el atributo `style` del elemento,
  así que la regla `#fb-sync-indicator { margin-left: 0 }` de la media query **nunca ganaba**
  (estilo en línea > hoja de estilos). Pasó a la clase `.topbar-sync`, que además recorta el texto
  con elipsis en vez de forzar el salto de línea.

Todo el estilo de la franja derecha estaba en atributos `style`: wrappers `<div>` con padding
propio, botones sin ninguna regla compartida. Ahora vive en `styles.css` (`.topbar-sync`,
`.topbar-op`, `.topbar-icon-btn`, `.topbar-badge`) con una sola escala de espaciado.

### Menú "⋯": filas de menú de verdad
Los ítems del desplegable eran una mezcla de `<button>` sueltos y `<div>` con padding, estirados a
`align-self: stretch` — de ahí las cajas altas medio vacías, el ⛶ y el 🔍 flotando en el aire y el
🟢 solo en su propia línea. Se reescribió el marcado como filas uniformes icono + etiqueta
(`.tbm-item`): mismo alto (42px), misma sangría, texto siempre visible, `role="menu"`/`menuitem`,
y el estado de conexión + el pill de versión juntos en un pie separado por una línea. En
escritorio (≥1401px), donde el grupo es `display:contents`, se siguen viendo solo los iconos —
la apariencia de la barra ancha no cambia.

Como efecto secundario del marcado nuevo: `immersiveEnter/Exit` reescribían el `innerHTML` del
botón de pantalla completa, lo que borraba su etiqueta; ahora actualizan solo el texto
(`_immersiveSyncButton`) y de paso el ítem dice "Salir de pantalla completa" cuando está activo.

### Bug: las configuraciones manuales desaparecían al recargar
`_mergeManualConfigsIntoAll()` solo se llamaba desde `_doSaveManualConfig`, es decir en la sesión
en la que se capturaba la configuración. Al recargar la página, `parseCSV()` reconstruía
`allConfigurations` desde el CSV y las borraba de la cascada: seguían listadas en el Gestor de
Configuraciones pero ya no aparecían en ninguno de los desplegables de Alta. La fusión se movió al
final de `parseCSV()`, junto al parseo, que es donde pertenece.

### Cascada sin resultados: salida a un toque
`displayConfigResult` mostraba "⚠️ No hay configuraciones que coincidan" y ahí terminaba — el
operador no tenía forma de saber que el catálogo se puede ampliar. Ahora esa tarjeta explica el
caso (por ejemplo, una variante HEV que no está en el CSV embebido) y ofrece el botón
**➕ Nueva configuración manual**.

## v17.8 — Mapa de zonas por teclado + limpieza final de tipografía (2026-08-15)

Cierra los dos pendientes documentados al final del overhaul v17.0-v17.7.

### Mapa de zonas operable por teclado
El mapa de zonas de Consumibles (`invRenderZoneMap`) solo permitía mover un cilindro con
mouse/dedo (mantener presionado + arrastrar). Se agregó una alternativa de teclado completa, sin
tocar el motor de arrastre existente:

- **Enter/Espacio sobre un cilindro** lo selecciona (resaltado con foco amarillo) y anuncia qué se
  seleccionó y qué hacer después.
- **Enter/Espacio sobre una posición vacía** ejecuta el movimiento — reutiliza el mismo
  `invDropCylinder()` que usa el arrastre, así que el historial, el deshacer y la sincronización
  funcionan idénticos por cualquiera de los dos caminos.
- **Enter/Espacio sobre la misma posición** cancela la selección; sobre **otra posición ocupada**
  cambia la selección a ese cilindro. **Escape** cancela en cualquier momento.
- El foco se restaura sobre el cilindro en su nueva posición después de moverlo — sin esto se
  habría perdido por completo, porque `invDropCylinder` reconstruye todo el mapa al guardar.
- Técnicamente: un solo listener de `click` por casilla, filtrado por `e.detail === 0` (un clic de
  mouse real siempre trae `detail>=1`; Enter/Espacio sobre un `<button>` dispara un `click`
  sintético con `detail===0`) — así conviven sin interferirse con el `mousedown`/`touchstart` que
  ya maneja el arrastre.

### Tipografía sub-12px: cero en todo el repositorio
`js/auth.js` (pantalla de login/PIN) y `js/firebase-sync.js` (ajustes de sincronización) quedaron
fuera de los 7 módulos planeados del overhaul — con esta ronda también se migran. Además se
encontraron y corrigieron 5 tamaños en decimales (`8.5px`/`10.5px`/`11.5px`) que los barridos
anteriores no habían detectado (buscaban solo enteros). Verificado con grep de cierre: **cero**
declaraciones de texto por debajo de 12px en todo el proyecto.

### Bug de contraste encontrado en el camino
Al revisar `auth.js` para la limpieza de tipografía, los 7 colores de avatar de operador
(`AUTH_AVATAR_COLORS` — la pantalla de "elige tu usuario", lo primero que ve cualquier técnico al
abrir la app) fallaban como texto (2.15–4.23:1). Misma técnica de corrección que la paleta P1-P10
de Plan (v17.4): mismos matices, oscurecidos hasta pasar 4.5:1. También se corrigió un tono
"por vencer" del mapa de zonas que quedaba justo debajo del mínimo (4.43:1 → 5.72:1).

## v17.7 — Accesibilidad módulo CoP (Fase 8, última) — cierre del overhaul UI (2026-08-15)

Octavo y último módulo migrado sobre la fundación de v17.0. Alcance: `js/cop_validator.js` —
validador estadístico CoP Type 1 y Control SPC (cartas I-MR).

### Tabla de captura VIN × gases
La tabla donde se capturan los valores de emisiones por VIN y gas no tenía `scope` en sus
encabezados ni forma de que un lector de pantalla asociara una casilla numérica con su columna —
solo "campo numérico en blanco", sin saber si era CO, NOx o Formaldehído, ni de qué VIN. Corregido:
`<th scope="col">`, `<caption>` (visualmente oculto, `.sr-only`), y `aria-label` por celda
compuesto del gas y el VIN ("Formaldehído — VIN 3N1...").

### Otros hallazgos
Tres `<select>` de región/familia (validador y Control SPC) sin etiqueta reciben `aria-label`.

### Cierre del overhaul (v17.0 → v17.7)
Con esta ronda quedan migrados los 7 módulos de la plataforma (HOY, Pruebas/COP15, Consumibles,
Plan, Datos/Panel, Proyectos, CoP) sobre la fundación de tokens/foco/semántica de v17.0. Resumen de
lo encontrado en el camino:

- **Bugs de contraste reales** (no solo teóricos, todos medidos y corregidos): textos casi
  invisibles en HOY (resabios de un tema oscuro eliminado en v15.5), la ficha de detalle de
  cilindro en Consumibles, y una paleta completa de 10 colores de prioridad en Plan que fallaba en
  9 de 10.
- **El modal con menos accesibilidad de toda la app resultó ser el más crítico**: la firma digital
  que bloquea la liberación de un vehículo (Fase 3) no tenía ni trampa de foco, ni Escape, ni
  devolución de foco.
- **Dos mejoras al helper compartido `a11yDialog`** surgidas de casos reales (Fase 4: ~20 modales
  reutilizando un mismo contenedor; Fase 7: un wizard que reconstruye su ventana en cada paso) que
  terminaron beneficiando a los ~30 modales de toda la app, no solo a los módulos que las motivaron.
- **La interfaz Alpine del Panel (Fase 6) ya estaba mejor construida de lo esperado**: 27 de 28
  `@click` ya vivían sobre botones reales; solo el calendario necesitó corrección.
- **Pendiente para una ronda futura**: alternativa de teclado para el mapa de zonas de Consumibles
  (drag-and-drop sin equivalente), y la tipografía de `js/auth.js`/`js/firebase-sync.js`
  (infraestructura transversal, fuera de los 7 módulos planeados).

## v17.6 — Accesibilidad módulo Proyectos — Fase 7 de overhaul UI (2026-08-15)

Séptimo módulo migrado sobre la fundación de v17.0. Alcance: `js/projects.js` — retícula de
tarjetas/portafolio y las 6 vistas de detalle (Tabla, Kanban, Línea de tiempo, Gantt, Curva S,
Carga por responsable), más el importador de Excel/CSV/pegado.

### Mejora al helper compartido, no solo a este módulo
El importador de Excel reconstruye su ventana completa (`#pn-import-overlay`) en cada paso del
wizard (elegir archivo → mapear columnas → confirmar) — un `a11yDialog` atado a la primera
instancia quedaría apuntando a un nodo ya desmontado en el paso 2. En vez de instrumentar el
wizard con lógica especial de limpieza, se corrigió el propio `a11yDialog` compartido (`js/app.js`):
ahora comprueba `document.contains(el)` en cada tecla y se autodesactiva silenciosamente si su nodo
ya no está en el documento, sin disparar `onClose` ni robar el foco. Es un cambio aditivo y
retrocompatible que **protege a los ~30 modales de toda la app que ya usan este helper** (Fases 1-7),
no solo al importador — cualquier módulo futuro que reconstruya su overlay en pasos queda cubierto
gratis.

### Otros hallazgos
- Los indicadores de avance/vencidos/bloqueados del detalle de un proyecto (`tp-metric-val`)
  migrados a los tokens de contraste verificado.
- Un campo de texto para pegar tablas (`Ctrl+C` desde Excel/Loop) sin etiqueta recibe `aria-label`.
- Las vistas de proyecto (🗃️ Tarjetas/📊 Portafolio, 📋 Tabla/🕒 Línea de tiempo/📊 Gantt…) ya eran
  botones reales — alcanzables por teclado sin cambios.
- Los `<div onclick>` de las tarjetas de proyecto quedan cubiertos por el mismo hook de
  `a11yClickables` en `pnRender()` que se instrumentó en la Fase 6 (Proyectos comparte el
  despachador de renderizado de Datos/Panel).

## v17.5 — Accesibilidad módulo Datos/Panel — Fase 6 de overhaul UI (2026-08-15)

Sexto módulo migrado sobre la fundación de v17.0. Alcance: `js/panel.js` — Dashboard, Reportes,
Ejecutivo, Turnaround, Usuarios, Bitácora, Alertas, Inteligencia, Sistema, Calendario, Proyectos,
Regulaciones, Archivos. Es el único módulo que mezcla renderizado clásico con las 6 pestañas sobre
Alpine.js (`_pnAlpineTabs`).

### El único hueco real de teclado en Alpine: el calendario
Se revisó cada `@click` del módulo uno por uno (28 en total) para confirmar si vivía sobre un
`<button>` real o un `<div>`. **27 de 28 ya eran botones** — la interfaz Alpine de este módulo
estaba mejor construida de lo esperado. La única excepción: las celdas del calendario
(`<div @click="calendarDayClick(...)">`) no tenían equivalente de teclado. Corregido con los
modificadores nativos de Alpine (`@keydown.enter`, `@keydown.space.prevent`) y `:role`/`:tabindex`
condicionales — sin tocar la lógica de `calendarDayClick`.

### Contraste
30+ colores de estado migrados de hex fijo a los tokens verificados: severidad de alertas, matriz
de habilidades por operador, indicadores de auditoría. El badge de alertas del topbar (`#fbbf24`/
`#34d399` sobre el fondo oscuro de la barra) se verificó por separado — ya pasaba con holgura
(7.45:1 / 6.47:1), tonos elegidos correctamente desde el inicio para ese contexto oscuro.

### Teclado
Las 13 pestañas de Datos (Dashboard/Reportes/Alertas/Regulaciones + 9 en "⋯ Más") navegan con
flechas/Home/End (`a11yTablist`). Hook en `pnRender()` (mismo patrón RAF de las Fases 2-5) para las
pestañas de renderizado clásico; las pestañas Alpine no lo necesitan porque ya usan botones reales.

## v17.4 — Accesibilidad módulo Plan — Fase 5 de overhaul UI (2026-08-15)

Quinto módulo migrado sobre la fundación de v17.0. Alcance: `js/testplan.js` — Dashboard, Plan
Semanal, 🚑 Recuperación, Producción, Probados, Familias, Reglas, Historial Semanal, Calendario,
Simulador.

### Bug sistémico: paleta de prioridad P1..P10
La barra de "Test Recovery Plan" clasifica los pendientes en 10 niveles de prioridad (P1..P10),
cada uno con su color, mostrados como relleno de barra con texto blanco encima. **9 de los 10
colores fallaban contraste AA** (el más grave, `#84cc16` lima, apenas 1.98:1 — el texto blanco era
casi invisible). Solo el gris de "sin prioridad" pasaba. Se recalculó la paleta completa
programáticamente: mismos matices (mantiene la asociación visual P1=rojo…P10=gris), oscurecidos
justo hasta superar 4.5:1, verificado uno por uno.

| Prioridad | Antes | Ratio | Después | Ratio |
|---|---|---|---|---|
| P1 | `#ef4444` | 3.76 ✗ | `#eb1515` | 4.52 ✓ |
| P2 | `#f59e0b` | 2.15 ✗ | `#9e6506` | 4.86 ✓ |
| P3 | `#3b82f6` | 3.68 ✗ | `#1e6ff5` | 4.52 ✓ |
| P4 | `#8b5cf6` | 4.23 ✗ | `#8452f5` | 4.66 ✓ |
| P5 | `#10b981` | 2.54 ✗ | `#0b815a` | 4.88 ✓ |
| P6 | `#ec4899` | 3.53 ✗ | `#e0177a` | 4.59 ✓ |
| P7 | `#06b6d4` | 2.43 ✗ | `#047a8f` | 5.02 ✓ |
| P8 | `#f97316` | 2.80 ✗ | `#c35305` | 4.61 ✓ |
| P9 | `#84cc16` | 1.98 ✗ | `#54820e` | 4.59 ✓ |
| P10 (sin prioridad) | `#94a3b8` | 2.56 ✗ | `--border-strong` | 4.62 ✓ |

### Otros hallazgos
- Las tarjetas de configuración (`tpConfigBadges`, los chips de Modelo/Motor/Transmisión/Año MY/
  Regulación/Región/Tracción que aparecen en prácticamente cada tabla del módulo) tenían el texto a
  7px por defecto y 8px en sus ~8 sitios de uso — subidas al mínimo del proyecto (12px).
- 3 textos más sobre fondo claro con gris ilegible (`#94a3b8`/`#65a30d`) en el resumen "Pendientes
  esta semana" y el modal de continuidad entre Model Years — migrados a los tokens.

### Sin overlays propios
A diferencia de Consumibles (Fase 4), este módulo ya usaba `showModal()` para el 100% de sus
diálogos — no había ningún overlay artesanal que arreglar.

## v17.3 — Accesibilidad módulo Consumibles — Fase 4 de overhaul UI (2026-08-15)

Cuarto módulo migrado sobre la fundación de v17.0. Alcance: `js/inventory.js` — el módulo más
grande hasta ahora (12 pestañas: Gases, Equipos, Mtto, Captura, Predicción, Combustible, Mapa de
zonas, Gráficas, Config, Reporte, Trazabilidad).

### Un solo arreglo cubre ~20 modales
La mayoría de las altas/ediciones (Cilindro, Instrumento, Actividad de mantenimiento, Escáner de
código de barras, lectura rápida…) reutilizan un mismo contenedor (`#invModal`) que cada función
abre y cierra fijando `style.display` directo, sin pasar por una función de cierre común — tocar
cada uno habría significado editar ~20 sitios distintos. En vez de eso se observa el propio
contenedor con `MutationObserver`: cuando se hace visible se activa `a11yDialog` (trampa de foco +
Escape + devuelve el foco), y cuando se oculta — sin importar qué botón lo haya hecho — se libera
el listener. Cubre los ~20 modales con un solo bloque de código.

### Bug de contraste real encontrado
La ficha de detalle de un cilindro de gas (fecha de recepción, vigencia, trazabilidad, concentración
real, historial de eventos) tenía sus etiquetas en gris claro (`#94a3b8`, 2.56:1) sobre fondo blanco
— prácticamente invisible. Corregido a `var(--muted)` (5.90:1).

**Aviso de una corrección a medio aplicar**: al migrar ese mismo gris en bloque, dos botones de
cierre ✕ que sí viven sobre fondo oscuro quedaron con el token equivocado (`var(--muted)`, calibrado
para fondo claro, cae a 3.03:1 sobre oscuro) — detectado y revertido al valor correcto en la misma
ronda antes de cerrar el PR.

### Teclado
- Las 12 pestañas de Consumibles ya se navegan con flechas/Home/End (`a11yTablist`).
- Un solo hook en el despachador `invRender()` (mismo patrón de doble `requestAnimationFrame` que ya
  usa `cascadeInjectTooltipsDeferred`) hace alcanzables por Tab los `<div onclick>` de cualquier
  pestaña — mapa de zonas, tarjetas de equipo, filas de mantenimiento — sin tener que instrumentar
  cada función de render por separado.
- 4 campos de búsqueda sin etiqueta (escáner, instrumentos, trazabilidad, mapa de zonas) reciben
  `aria-label`.

### Alcance no cubierto en esta ronda
El mapa de zonas (arrastrar un cilindro a una posición) sigue siendo solo por mouse/dedo — no tiene
alternativa por teclado. Es una interacción nueva a diseñar (seleccionar con teclado, confirmar
destino, anunciar el resultado), no un ajuste de presentación, así que queda documentado para una
ronda futura en vez de intentarse de prisa aquí.

## v17.2 — Accesibilidad módulo Pruebas/COP15 — Fase 3 de overhaul UI (2026-08-14)

Tercer módulo migrado sobre la fundación de v17.0/v17.1. Alcance: `js/cop15.js` (Alta, Operación,
Liberación, Cola/Kanban, Historial, Consumibles — los formularios más largos y de mayor tráfico
diario de la app) y `js/signatures.js` (captura de firma digital).

### El hallazgo más importante: la firma digital no tenía NADA de accesibilidad
`sigCaptureOpen()` — el modal que se abre para capturar la firma del liberador/aprobador, un
requisito de seguridad real del proceso de doble-ciego — no atrapaba el foco, no cerraba con
Escape, y no regresaba el foco al botón que lo abrió. Es probablemente el modal más crítico de toda
la aplicación (bloquea la liberación de un vehículo) y era el que menos accesibilidad tenía.
Corregido con `a11yDialog`.

### Teclado
- Las 6 pestañas de Pruebas (1. Alta / 2. Operación / 3. Liberación / Cola / Historial /
  📦 Consumibles) ya se navegan con flechas, Home y End (`a11yTablist`), con `aria-selected` y
  `tabindex` sincronizados en cada cambio.
- El modal de edición retroactiva (Historial → 📝 Completar) usa `a11yDialog`.
- Las tarjetas del kanban de vehículos y el checklist de preacondicionamiento en lote (antes
  `<div onclick>` solo operables con mouse/dedo) ahora son alcanzables con Tab vía
  `a11yClickables`, reutilizando el helper introducido en la Fase 2.
- Campos de búsqueda/orden del kanban sin etiqueta reciben `aria-label`.

### Contraste
Más de 60 colores de estado migrados de hex fijo a los tokens verificados de v17.0 — cubre los
veredictos "✓ PASA / ✗ FALLA" del checklist de disponibilidad, los indicadores de doble
verificación (aprobador/liberador), las tarjetas del kanban por estatus, el timer de soak, y las
validaciones en tiempo real del formulario de Alta (contador de VIN, checksum, avisos). Se revisó
cada grupo de colores con el mismo cuidado que en la Fase 1/2 — texto vs. relleno vs. fondo — sin
encontrar bugs de contraste tan severos como los de HOY (v17.1); este módulo ya usaba principalmente
superficies claras de forma consistente.

## v17.1 — Accesibilidad módulo HOY — Fase 2 de overhaul UI (2026-08-14)

Primer módulo migrado sobre la fundación de v17.0, en el orden acordado (HOY primero, por ser la
pantalla más vista). Alcance: `js/app.js` — dashboard diario, "Lab Status" consolidado, backup,
buscador global, centro de notificaciones, panel de configuración de gráficos.

### Bugs de contraste reales encontrados (no solo teóricos)
Migrar los estilos inline a tokens obligó a revisar cada color en su contexto real, y salieron tres
fallos que el sistema previo nunca había expuesto porque nadie los había medido:
- **Encabezados "🏭 Lab Status" y "💾 Backup & Almacenamiento"**: `#c4b5fd` (lavanda) sobre fondo
  blanco — **1.85:1**. Resabio de un tema oscuro que ya no existe en la app (v15.5 lo eliminó por
  completo, pero estos dos colores nunca se migraron).
- **Texto de mensaje en las alertas del Lab Status**: `#e2e8f0` sobre fondo casi blanco —
  **1.18:1**, prácticamente invisible. Mismo origen.
- **Fechas y pie del buscador global de VIN**: `#475569` sobre fondo `#1e293b` (el propio buscador
  SÍ es un componente oscuro, correcto) — pero ese gris quedaba en **1.93:1** sobre su propio fondo
  oscuro. Corregido al mismo tono claro que ya usa el resto del componente (6.9:1).

### Teclado y foco
- Nuevo helper compartido `a11yClickables()` (patrón idéntico a `cascadeInjectTooltips` — barrido
  idempotente tras cada render): hace alcanzables por Tab los `<div onclick>` de tarjetas y filas de
  alerta, con un listener delegado único que activa Enter/Espacio. Se reutilizará en los 6 módulos
  siguientes en vez de reescribir esta lógica por módulo.
- El modal "➕ Nueva actividad" de HOY usa ahora `a11yDialog` (trampa de foco, Escape, devuelve el
  foco al botón que lo abrió). El buscador global de VIN y el centro de notificaciones cierran con
  Escape. `showModal()` (usado por los menús de ayuda) ya tenía trampa de foco y `role="dialog"`
  correctos desde antes — no hizo falta tocarlo.
- 11 campos sin etiqueta (`aria-label` agregado): sliders de configuración de gráficos, buscador del
  glosario, campo de nota rápida, fecha de liberación estimada.

## v17.0 — "Fundación de accesibilidad" — Fase 1 de overhaul UI (2026-08-14)

Punto de partida: se pidió llevar toda la interfaz (no solo los gráficos) a un nivel de limpieza y
cumplimiento de accesibilidad inspirado en GOV.UK, conservando la identidad de marca KIA. Medición
inicial del código: 839 declaraciones de texto por debajo de 12px, 3 408 estilos inline con hex fijo,
4 `label for=` contra 93 campos de formulario, 553 `onclick` (muchos en `<div>`, inalcanzables por
teclado), y los cuatro colores de estado (`--success`, `--warning`, `--danger`, `#94a3b8`) fallando
contraste AA tanto como texto como en botones sólidos con texto blanco. El rojo de marca KIA
(`#bb162b`, 6.44:1) sí pasaba — conservar la identidad y cumplir accesibilidad resultaron compatibles.

Esta ronda es la **Fase 1: fundación** (decisión explícita: fundación primero, luego módulo por
módulo). Sin cambios funcionales — solo presentación y accesibilidad.

### Tokens de color en tres niveles
Se reemplazan los tokens de estado fundidos (`--success`/`--warning`/`--danger`/`--info`, que se
usaban indistintamente como texto y como fondo) por tres niveles explícitos por estado —
`*-text` (≥4.5:1 sobre blanco), `*-fill` (relleno con texto blanco ≥4.5:1) y `*-bg` (tinte de
fondo con texto oscuro ≥15:1) — para `ok`/`warn`/`danger`/`info`. Los nombres viejos quedan como
alias apuntando a `*-fill` para no romper el código existente durante la migración por módulos.

### Foco de teclado, una sola definición
Había **tres** reglas `:focus-visible` compitiendo entre sí y **ocho** sitios con `outline: none`
que además ganaban la especificidad CSS sobre el foco global, dejándolo invisible en formularios de
Test Plan, firma digital y el PIN de auth. Se consolida en una sola regla con el patrón GDS
(amarillo + subrayado negro), visible sobre cualquier fondo.

### Semántica y navegación por teclado
- Las 5 pestañas raíz (`platform-bar`) y la barra inferior móvil pasan de `<div onclick>` a
  `<button role="tab">`/`<button aria-current>`, con navegación por flechas/Home/End.
- Un solo `<main>` envuelve las 6 secciones de plataforma (antes cada una llevaba su propio
  `role="main"` — problemático durante la animación de swipe entre módulos, donde ambas secciones
  quedan visibles a la vez por un instante).
- Enlace "Saltar al contenido principal", etiqueta real en el buscador global de VIN, barra de
  progreso con `role="progressbar"`.
- `<title>` corregido (decía v14.0 desde hacía varias rondas; real: 16.8) y ya no lleva número de
  versión fijo para no volver a quedar desincronizado.

### Tipografía y superficie
Escala tipográfica unificada (antes había dos compitiendo) con mínimo absoluto de 12px — las 839
declaraciones sub-12px se elevan. Se elimina el efecto glass/neumorfismo de la barra superior y las
pestañas (gradiente oscuro y opacidades bajas con contraste al límite) por bordes planos y sombras
sutiles tokenizadas.

### Helpers compartidos nuevos (`js/app.js`)
`a11yTablist`/`a11yTablistSync` (navegación de pestañas por teclado, patrón APG, reutilizado por
`switchPlatform`), `a11yDialog` (trampa de foco + Escape + devolución de foco, listo para cablear en
los modales existentes), `a11yAnnounce` (región `aria-live` única para notificaciones), y
`tokenColor`/`tokenRGB`/`tokenAlpha` — puente porque `var(--token)` no sirve dentro de Chart.js
(`backgroundColor`/`borderColor`) ni jsPDF (`setFillColor`/`setTextColor`, que exigen RGB numérico);
sin este puente, migrar el CSS habría dejado gráficos y PDFs con la paleta vieja.

### Migración de estilos inline (parcial — fundación)
`index.html` migra sus estilos inline con hex fijo a los tokens nuevos (badges de estado, chips de
alerta CRITICA/ALTA/MEDIA, panel de notificaciones, PIN de soak timer que había quedado con colores
del tema oscuro eliminado en v15.5). Se agregan clases utilitarias (`.u-chip`, `.u-tile`, `.u-row`,
`.u-section-head`, `.u-empty`, `.u-bar`) para que el markup nuevo no vuelva a nacer con estilos
inline. **La migración de los ~3 000 estilos inline restantes en `js/*.js` queda para las fases
siguientes, módulo por módulo** (HOY → Pruebas/COP15 → Consumibles → Plan → Datos/Panel →
Proyectos → CoP), junto con etiquetado de campos, `a11yDialog` en cada modal, y áreas táctiles
mínimas — sin eso todavía.

### Radix UI (nota)
Se instaló y desinstaló `@radix-ui/themes` en el curso de esta ronda: son componentes React, y el
proyecto es JS de ámbito global + Alpine.js sin framework. No se adoptó ninguna dependencia de Radix
— los valores de color de referencia se tomaron y se pegaron directo en `:root` (un `@import` de
`@radix-ui/colors` habría roto el bundle offline de un solo archivo que genera `build.sh`).

## v16.8 — "Proyectos como Project Manager completo" (2026-08-06)

El usuario pidió tres cosas sobre el módulo de Proyectos (v16.6): poder **cargar sus listas desde
Excel** para no recapturar los tableros que ya tiene, **todas las visualizaciones de un Project
Manager** que faltaran, y opinión sobre **fusionar Proyectos con el tablero tipo Monday de HOY**.
Pregunta explícita: *"¿es necesario que todas tengan un formato en específico?"* → **no**.

### Importar desde Excel, CSV o pegando — sin formato obligatorio
Lo único que se pide es una fila de encabezados. El importador la detecta, adivina qué columna es
cuál con un diccionario de sinónimos ES+EN (`PN_IMPORT_FIELDS`) y muestra una **vista previa donde
cualquier columna se puede reasignar** antes de escribir nada.

- **Tres entradas al mismo flujo**: 📄 archivo `.xlsx`/`.xls`/`.csv` y 📋 pegar (lo que copias de
  Excel/Loop llega como TSV). **SheetJS se inyecta solo al abrir el importador**, nunca en el
  arranque: la app sigue cargando igual de rápido y offline-first, y si el CDN no responde el modal
  lo explica y ofrece Pegar/CSV, que no necesitan librería.
- **Fechas**: se decide día/mes vs mes/día **con los datos** (si algún número pasa de 12 no hay
  ambigüedad) y se puede voltear con un clic viendo un ejemplo real del archivo. Las rutas con
  regex arman la cadena desde los números, sin pasar por `new Date()`, así no hay corrimiento de
  zona horaria.
- **Fusionar en un proyecto existente empata por nombre de paso**: reimportar el mismo archivo
  actualiza, no duplica. El mapeo se recuerda por dispositivo.
- Bug corregido en el camino: **"Not started"** —un estatus muy común en tableros en inglés— se
  leía como "En curso" porque "started" empataba con la regla de en-curso. Las negaciones se
  evalúan primero.

### Cuatro vistas nuevas (el detalle pasa de 3 a 6, más una cross-proyecto)
- **📌 Kanban** por estatus, con arrastre (mismo gesto táctil del mapa de gases, sirve en tablet) y
  menú de estatus por tarjeta como camino accesible.
- **👥 Carga por responsable**: barras de vencidos/bloqueados/abiertos/completados, por proyecto o
  por todos. Responde quién es el cuello de botella.
- **📈 Curva S**: acumulado comprometido vs real por semana, con veredicto en palabras ("va 20
  puntos ABAJO del plan"). La línea real **se corta en hoy** — proyectarla sería inventar avance.
- **🗂️ Portafolio**: una fila por proyecto con semáforo, avance, vencidos, bloqueados y próximo
  hito. La vista para reportar hacia arriba; exportable a CSV.

### Hitos, línea base y ruta crítica
Campos nuevos del paso, todos opcionales y retrocompatibles: `isMilestone`, `baselineTarget`,
`startDate`, `durationDays`, `dependsOn[]`.

- `pnProjectCPM` hace pasada hacia adelante y hacia atrás (ES/EF/LS/LF/holgura). **No reprograma
  las fechas capturadas** — el laboratorio las trae de su Excel y reescribirlas sería pelearse con
  su dato: se usan como ancla, y las dependencias sirven para marcar la ruta crítica y avisar qué
  pasos están **en riesgo en palabras accionables** ("Refacciones está bloqueado").
- Un **ciclo de dependencias no cuelga la vista**: se detecta (Kahn), se reporta y esos pasos
  quedan fuera del cálculo. Además el modal ya no ofrece como dependencia nada que cerraría el
  círculo, así se evita desde la captura.
- **Línea base**: congela lo comprometido; el Gantt dibuja el plan original debajo del real, y
  mover una fecha genera evento de línea de tiempo (derivado, no guardado) y queda en auditoría.

### HOY + Proyectos: conectar, no fusionar
HOY responde "¿qué hago hoy?" (feed de triaje) y Proyectos "¿cómo va esta iniciativa?" (workspace
de meses) — Monday mismo separa "My Work" de "Boards". Se mantienen separados, pero:

- El modal **➕ Actividad de HOY gana un selector de proyecto**: al elegir uno, el pendiente **nace
  como paso de ese proyecto** en vez de quedar como tarea suelta (lo que pidió el usuario).
- Una tarea suelta se puede **mover a un proyecto** con la acción 🗂️ de su fila (con tombstone,
  para que el merge entre dispositivos no la resucite).
- **Bug preexistente corregido**: los pasos de proyecto y los mantenimientos no traían `assignee`,
  y como el filtro es `!a.assignee || a.assignee === currentOp`, **"Solo míos" los dejaba pasar
  siempre** — mostraba los pendientes de los demás.

### Scroll horizontal en tablet (bug preexistente encontrado al verificar)
Midiendo el desbordamiento a 390/820/1920px salió que **a 820px —un iPad en vertical, y el
laboratorio trabaja con tablets— la página tenía 536px de scroll horizontal**, sin relación con
Proyectos: la barra superior pedía 981px y no cabía.

- El grupo **⋯ Más** solo se colapsaba en `max-width: 768px`; entre 769px y ~1400px se dibujaba
  expandido completo. El corte sube a **1400px** (en pantalla ancha no cambia nada).
- La **bottom-nav es `position:fixed` sin media query**, o sea que siempre está — pero las 5
  pestañas de la topbar solo se ocultaban por debajo de 768px, así que en tablet se veían las **dos
  navegaciones a la vez** y encima no cabían. El corte de esa regla sube de 768px a **1024px**,
  siguiendo la razón que ya estaba escrita en v15.5.
- Resultado verificado a 390 / 600 / 820 / 1024 / 1366 / 1440 / 1920 px: **0px de desbordamiento de
  página** en las 6 vistas del proyecto, el Portafolio y HOY. El Gantt y el Kanban scrollean dentro
  de su propio contenedor, como debe ser.

### Organización
El módulo se extrajo de `panel.js` a **`js/projects.js`** (convención del proyecto: un módulo, un
archivo). `panel.js` bajó de 4,361 a 3,840 líneas y conserva solo los puntos de registro.

## v16.7 — "Versión siempre visible + historial completo" (2026-08-06)

El usuario reportó que 🗂️ Proyectos (recién agregado en v16.6) no le aparecía, y de paso pidió que
el indicador de versión de la esquina fuera más visible y de verdad se actualizara, y que Datos
tuviera un historial de qué trajo cada versión — "que venga todo el histórico" — para saber
siempre exactamente en cuál está parado.

- **`APP_VERSION` estaba congelado en `'14.0'`** desde hacía varias rondas — nadie lo actualizaba
  en cada release, así que el pill del topbar nunca reflejó la versión real (v16.x) por la que ya
  iba la plataforma. Corregido a `16.7`; regla nueva documentada en "Working with this project"
  para no volver a olvidarlo.
- **Pill de versión del topbar rediseñado**: antes era texto de 10px con 40% de opacidad, casi
  invisible, y solo reaccionaba a un click si había una actualización pendiente. Ahora es un chip
  con borde y fondo (`.app-version-pill`), **siempre clickeable** — sin actualización pendiente
  lleva directo al historial completo (Datos → Sistema); con una pendiente, prioriza abrirla.
- **Nuevo "🗂️ Historial de Versiones"** en Datos → Sistema (`APP_VERSION_HISTORY` en `app.js`):
  lista TODAS las rondas de mejoras desde la fundación de la plataforma hasta la actual (marcada
  "ACTUAL" y expandida por default), cada una con fecha y 1-4 bullets de qué trajo — resumen
  curado de `CHANGELOG.md`. Estático, no depende de la reactividad de Alpine; expuesto al
  componente (`appVersion`/`versionHistory`/`appVersionInfo()`) en vez de referenciar los
  globales sueltos en el template, siguiendo el patrón del resto de `panelAlpineComponent()`.
- **Hallazgo real, fuera del código**: al revisar por qué 🗂️ Proyectos no aparecía en el
  dispositivo del usuario, se encontró que ningún workflow de GitHub Actions (`firebase-hosting-
  merge.yml`, el que despliega a producción en cada merge a `main`) corrió desde el merge de la
  ronda v16.5 (2026-08-05 21:16) — ni siquiera el workflow de preview de PRs se disparó para el
  PR de v16.6/v16.7 pese a múltiples pushes/merges. El código está correcto y mergeado a `main`;
  el bloqueo está en GitHub Actions (cuota/facturación o Actions deshabilitado a nivel repositorio
  u organización) — requiere revisión manual en la configuración de GitHub, fuera del alcance de
  este cambio de código.

## v16.6 — "Seguimiento de Proyectos (bitácora + timeline + Gantt)" (2026-08-06)

El usuario mandó tres capturas: Plan → Familias con franjas negras dentro de tarjetas blancas, un
tablero de Microsoft Loop ("Emission Cell Upgrade Monitoring") que usa **fuera de la plataforma**
para dar seguimiento a proyectos de inversión, y un Gantt de ejemplo. Pidió traer ese seguimiento
adentro — no solo mantenimiento, seguimiento general (reparaciones, proyectos de inversión,
cualquier iniciativa) — y de paso arreglar la vista rota.

- **Arreglo de Plan → Familias** (`js/testplan.js`): las franjas negras eran restos hardcodeados
  del tema oscuro eliminado en v15.5 (`#0f1826`/`#12192b`/`#e2e8f0`/`rgba(255,255,255,0.0x)`) que
  sobrevivieron en `tpRenderFamilias` y en la rejilla de la gráfica de déficit — reemplazados por
  las variables de tema (`var(--tp-dark)`, `var(--tp-text)`, `var(--tp-border)`). De paso: todo el
  bloque usaba `font-size:8px`/`9px`, por debajo del mínimo propio de la plataforma (`--fs-2xs:
  11px`); subido a 11px con `flex-wrap` para que la fila de variante no desborde.
- **Nuevo módulo Proyectos** (`js/panel.js`, pestaña `pn-projects` en Datos → ⋯ Más): seguimiento
  general con pasos, responsables, fechas y una bitácora — igual que el tablero de Loop del
  usuario, pero adentro. `pnState.projects[]` (`{..., steps[], log[]}`); `steps[]` son las filas
  capturadas (tabla tipo Loop: Paso/Responsable/Estatus/Fecha objetivo/Cumplimiento/Obstáculo);
  `log[]` son notas libres. **La línea de tiempo nunca se guarda** — se deriva mezclando `log[]`
  con los cambios de estado de los pasos (`pnProjectTimeline`), el mismo patrón que
  `v.timeline`/`g.timeline` en otros módulos. Retícula de tarjetas con progreso al entrar sin
  proyecto seleccionado; con uno seleccionado, tres vistas: 📋 Tabla, 🕒 Línea de tiempo (con caja
  para agregar notas) y 📊 Gantt semanal (mismo patrón de colspan que el Plan Maestro de 52
  semanas de v16.4). Alta de proyecto/paso con formulario corto (3 campos + "Más detalles"),
  patrón de v16.5.
- **Integraciones**: un proyecto puede ligarse a un equipo del F11 — banner "🗂️ Proyecto abierto"
  en Consumibles → Mtto (`invRenderMaint`). Los hitos (pasos con fecha objetivo) aparecen en
  Datos → Calendario (`pnProjectMilestones`). Pasos vencidos/bloqueados de proyectos activos
  entran a HOY (categoría nueva "Proyectos" en `DASH_CATS`, con check de un toque para completar)
  y a Alertas (`pnGetActiveAlerts`, fuente "Proyectos"), sin duplicarse entre ambos.
- **Hallazgo y arreglo de reactividad en Alpine (Datos)**: las pestañas de Datos que corren sobre
  Alpine (Alertas, Calendario, Usuarios, Bitácora, Sistema, Auditoría) leen `pnGetActiveAlerts()`/
  `_pnCollectCalendarEvents()` — funciones planas que tocan el `pnState` global, fuera de la
  reactividad de Alpine. Sin una propiedad reactiva de por medio, Alpine nunca detectaba que debía
  reevaluar esas vistas: un paso de Proyectos recién bloqueado (o, se confirmó, cualquier alerta
  nueva de Inventario/Mantenimiento) no aparecía en Alertas hasta recargar la página por completo,
  incluso cambiando de pestaña y regresando. `pnSave()` nunca disparaba el evento `data:saved` que
  el propio componente Alpine ya escuchaba (sí lo hacen `saveDB()` e `invSave()`) — conectado, más
  una `_dataVersion` reactiva que `activeAlerts()`/`calendarEvents()` leen para quedar bajo el
  radar de Alpine y `_bump()` avanza. Corrige la staleness para TODAS las fuentes de alerta, no
  solo Proyectos.
- **Sincronización** (`js/firebase-sync.js`): `_fbMergeProjects` mergea proyectos por id
  (gana `updatedAt`) y, dentro de cada proyecto, `steps[]`/`log[]` también por id — dos técnicos
  editando pasos distintos del mismo proyecto en dispositivos distintos no se pisan.
- **Exportación**: `pnExportProjectCSV`/`pnExportAllProjectsCSV` con encabezados idénticos al
  tablero de Loop (`Step,Responsible,Status,Target Date,Completion Date,Roadblock/Comments`),
  registrado en el Centro de Reportes.

## v16.5 — "Mapa como retícula + menos campos + sin espacio muerto" (2026-08-05)

El usuario mandó capturas de la plataforma corriendo en PC: el mapa del cuarto de gases se veía
roto (zonas de 2 slots ocupando la misma caja que zonas de 14) y el tablero de HOY tenía un vacío
blanco enorme en el centro de la pantalla. Overhaul dirigido a esos dos problemas más una pasada de
"menos campos que llenar" en los formularios de captura.

- **Mapa del cuarto de gases — de plano SVG editable a retícula responsiva**: se eliminaron ~510
  líneas de edición manual (arrastrar/redimensionar zonas, zoom, leyenda) que asignaban una caja
  fija de 200×180 a **toda** zona sin importar su número de slots — la causa real de las cajas
  vacías. `invRenderZoneMap()` reemplaza a `invRenderFloorPlan()`: cada tarjeta de zona
  (`.inv-zonemap-grid`) crece solo lo que necesitan sus slots, con objetivos táctiles reales
  (≥44px) en vez de círculos SVG de radio 12. **Hallazgo:** el sistema de arrastrar-y-soltar
  cilindros (`invInitZoneDrag`/`invDropCylinder`/`invUndoLastMove`) ya existía completo y probado,
  pero estaba huérfano — operaba sobre `.inv-zone-slot`, una clase que ningún render emitía desde
  que el mapa pasó a SVG. La retícula nueva lo reactiva sin escribir arrastre otra vez.
- **Formularios más cortos**: Cilindro, Instrumento (F11), Actividad de mantenimiento y Zona
  ahora muestran solo 2-4 campos esenciales; el resto vive en "Más detalles" (nada se perdió) con
  autollenado — zona = primera posición libre, trazabilidad/proveedor = del último cilindro dado
  de alta, marca/proveedor/frecuencia de un instrumento = heredados del último capturado del mismo
  equipo padre, semana de una actividad = la semana actual, ID de zona = siguiente letra libre.
- **Cero espacio muerto en pantallas anchas**: `.daily-dash` (HOY) no tenía `max-width` — a
  diferencia de `.tp-main`, que sí estaba topado a 1400px — así que en una laptop el tablero se
  estiraba de borde a borde dejando un vacío entre el título y los botones. Nueva variable
  `--content-max` centraliza ese ancho; el tablero de HOY y las listas de una-fila-por-elemento
  (cilindros) pasan a 2 columnas en pantallas ≥1024px en vez de dejar el ancho sobrante vacío.

## v16.4 — "Plan Maestro de Mantenimiento y Calibración (COP15-F11)" (2026-08-05)

El laboratorio formalizó el control de mantenimiento preventivo y calibración de equipos en
el formato oficial **COP15-F11 rev. 03** (Excel). Esta ronda integra ese formato completo a
la plataforma — vive dentro de Consumibles, sin módulo nuevo — para que se consulte y
actualice desde el mismo lugar donde ya vivía la calibración, con la menor interacción
posible: calibrar es dos toques (fecha + certificado), registrar un mantenimiento es un
toque (✔ Hecho).

- **Equipos y Calibración** (`Pruebas → Consumibles → 🔧 Equipos`, ahora en la barra
  principal): rediseñada con semáforo de 60 días (verde/ámbar/rojo/sin registro/no aplica),
  tiles de resumen, banner de instrumentos críticos vencidos ("identificar como NO
  OPERABLE"), filtros y agrupado por equipo padre. Botón **"✅ Calibrado"** por instrumento:
  fecha + certificado + proveedor, la próxima fecha se calcula sola (`invCalRegister`,
  `invCalStatus`, `invCalSummary` — únicas definiciones del semáforo y el resumen).
- **Migración de los 31 instrumentos existentes**: `_invMigrateF11()` fusiona los 49
  instrumentos del F11 con los 31 ya capturados en la plataforma por KMM ID → serie →
  nombre, **sin perder nada** (rellena solo campos vacíos; lo capturado en la app gana) y
  da de alta los 18 faltantes. Corre una sola vez por dispositivo (`invState.f11Seed`),
  idempotente. Se conservó el registro de equipos padre (14, `invState.assets`).
- **🛠️ Mantenimiento** (pestaña nueva junto a Equipos): vencidos y programados de esta
  semana arriba con `✔ Hecho` de un toque; Plan Maestro de 52 semanas y catálogo de
  actividades plegados abajo para consulta (`invMaintMatrix`, `invMaintCompliance` —
  reproduce exacto el Dashboard del Excel, validado: 19 mantenimientos planeados/año con
  las 3 actividades reales del catálogo).
- **Integraciones**: HOY muestra calibraciones y mantenimientos vencidos/de la semana con
  check de un toque; Panel → Alertas ahora sí dispara alertas de calibración vencida (bug
  corregido: leía el campo inexistente `eq.nextCalibration`, nunca `eq.nextCalDate` — la
  alerta jamás se había disparado) y suma mantenimiento vencido; Lab Overview resume
  % de vigencia; Plan → Disponibilidad avisa (no bloquea solo) cuando una semana tiene
  mantenimiento programado de un equipo que detiene pruebas (`asset.blocksTesting`).
- **Sincronización**: `assets`/`maintActivities`/`maintLog` se fusionan por id (gana el más
  reciente vía `updatedAt`, el historial es append-only) en vez de reemplazarse; el
  historial de calibración de un instrumento (`calHistory`) se une por fecha+certificado —
  antes una calibración registrada en otro dispositivo simplemente no se traía de vuelta.
- **Exportación/importación**: 4 CSV con los encabezados exactos del Excel oficial
  (Equipos/Calibración/Actividades/Historial) + PDF del Plan Maestro, todos desde el Centro
  de Reportes; **"📥 Importar F11"** actualiza calibraciones en bloque desde ese mismo CSV
  (empata por ID del F11 → KMM → serie, resumen y confirmación antes de escribir).

## v16.3 — "Almacén de Archivos" (2026-07-16)

Nueva pestaña **Datos → ⋯ Más → ☁️ Archivos**: un espacio compartido de 5MB (todo el
laboratorio, no por dispositivo) para subir un documento desde un equipo y bajarlo desde
otro — pensado para pasar un .zip, PDF u hoja de cálculo sin depender de USB/correo.

- **Almacenamiento — solo Firestore, sin Firebase Storage**: el archivo se convierte a
  base64 y se parte en fragmentos de <1MB guardados en una subcolección
  (`stations/KIA-EMLAB/files/{id}/chunks/{i}`); el metadato (nombre, tamaño, quién, cuándo,
  N° de fragmentos) vive en `stations/KIA-EMLAB/files/{id}`. Se descartó Firebase Storage a
  propósito: Google exige el plan de pago "Blaze" (con tarjeta) para usarlo, aunque no
  cobre bajo la cuota gratis. Firestore ya lo usa el resto de la app en el plan gratis
  "Spark" (sin tarjeta) — el Almacén reutiliza esa misma base de datos y las mismas reglas
  de sesión (`firestore.rules`, sin cambios), así que **no hay nada que desplegar
  manualmente**: queda activo en cuanto se publica el código.
- **Cuota de 5MB total** (tamaño real del archivo, no el base64 inflado): se controla en el
  cliente sumando los tamaños de los metadatos antes de subir (`fbFilesUpload`); si no
  alcanza, avisa cuántos KB quedan libres. Barra de cuota con color según % usado.
- **Formatos aceptados**: .zip, .pdf, .xls/.xlsx, .csv, .doc/.docx, .png, .jpg/.jpeg —
  validado del lado del cliente antes de intentar subir.
- **Lista en vivo**: `fbFilesSubscribe`/`onSnapshot` refleja subidas/borrados de otros
  dispositivos sin recargar; se desconecta al salir de la pestaña. Descargar reconstruye
  los fragmentos en un Blob local (`fbFilesDownload`); eliminar (con confirmación) borra
  metadato + todos sus fragmentos. Cada subida/borrado queda en `auditLog`.
- Probado con un archivo real de 1.76MB (caso de uso: carpeta de instalación del programa
  J1699 comprimida) — se parte en 4 fragmentos y se reconstruye byte a byte sin pérdida.

## v16.2 — "Conteos correctos" (2026-07-15)

El usuario reportó que en Análisis de Gap el volumen de prueba requerido (REQ) no
correspondía entre configuraciones parecidas. La causa: `tpGetRule` comparaba región y
regulación con igualdad estricta (sin trim ni mayúsculas/minúsculas) — cualquier
inconsistencia de captura hacía que TODAS las reglas específicas fallaran en silencio y el
cálculo cayera a la regla comodín. Se aprovechó para una auditoría general de variables del
Plan de Pruebas y sus consumidores cross-módulo.

- **Fix del bug reportado**: `tpGetRule` normaliza región/regulación (trim + mayúsculas) al
  buscar coincidencia; ahora expone qué regla se usó y de qué tipo (exacta/región/comodín/
  default). La celda REQ del Análisis de Gap muestra la fórmula completa al pasar el mouse
  y un punto ámbar ● cuando no hay regla específica para esa región/regulación. La pestaña
  Reglas muestra "aplica a N configs" por regla y una lista de configs sin regla específica.
- **Bug crítico corregido — HOY mostraba "0% cobertura" y "Deficit: NaN tests" siempre**:
  `renderLabDashboard` (tarjeta de riesgo de HOY/Panel) leía `tpGetAnalysis()` como si fuera
  un objeto agregado (`.totalReq`, `.totalDone`, `.coveragePct`) cuando en realidad es un
  arreglo por configuración — esos campos nunca existieron. La alerta de cobertura del plan
  nunca se disparaba.
- **Una sola definición de cobertura en toda la plataforma** (`tpCoverageSummary()`: %
  de configuraciones vigentes con su REQ cumplido): antes el badge del Plan, Datos →
  Ejecutivo y HOY calculaban 3 números distintos que nunca coincidían entre sí. El
  % por volumen de pruebas se conserva como métrica secundaria, etiquetado "pruebas
  cumplidas" para no confundirlo con la cobertura de configuraciones.
- **Configuraciones sin volumen ya no exigen una prueba mínima** ni cuentan en la
  cobertura (antes `max(1, …)` forzaba 1 prueba incluso con volumen 0, arrastrando el %
  con configuraciones retiradas).
- **Configuraciones "dormidas"** (3+ meses seguidos sin volumen planeado): aparecen en el
  Análisis de Gap con un chip "¿seguir contabilizando?" — Pausar (deja de exigir pruebas)
  o Confirmar activa. Familias muestra cuántas configs pausadas/dormidas tiene cada una.
  Los flags se preservan al re-importar el CSV.
- **Producción**: la tabla de Detalle ahora tiene scroll horizontal (antes los meses después
  de julio quedaban recortados sin aviso) y muestra cuántos meses hay cargados; la celda
  TOTAL marca con ⚠ cuando el Total_Calc del CSV no coincide con la suma de los meses
  visibles (sin perder el dato — solo avisando). El parser de encabezados de mes ahora
  acepta más formatos (espacio en vez de guión, nombre completo, año de 4 dígitos, ISO
  "2026-08") y el diff de importación lista qué meses se detectaron y qué columnas no se
  reconocieron.
- **panel.js leía campos muertos** (`tpState.plans`/`.records`, que nunca existieron en
  testplan.js): la correlación "Consumo de Gas vs Volumen de Pruebas", "Velocidad del Plan"
  y los reportes de antigüedad de datos del Plan siempre estuvieron vacíos — ahora leen
  `testedList`/`weeklyPlans`, las fuentes vivas.
- **Cache de análisis**: `tpSave()` ahora invalida también el cache de `tpGetAnalysis()`
  (antes solo el de familias) — editar una regla o pausar una configuración sin cambiar el
  conteo de configs/probadas dejaba el análisis obsoleto. Los merges/seeds de sincronización
  también invalidan correctamente.

## v16.1 — "Fix cascada EV" (2026-07-15)

El SV1m (eléctrico) no se podía dar de alta: su "regulación" es el voltaje de carga
(220V/120V), sin perfil de límites, y la cascada **ocultaba** los chips de regulaciones sin
perfil — imposible completar la configuración (mismo problema latente: BRAZIL L8 del CL4).

- **Regulaciones sin perfil ahora seleccionables** en la cascada de Alta: los EVs
  (220V/120V/EV, detectados por `_isEVRegulation`) aparecen con ⚡ y sin tono de advertencia;
  el resto con ⚠ y aviso de configurar el perfil antes de liberar emisiones (link directo a
  Datos → Regulaciones).
- **Resultado EV-consciente**: al completar una configuración eléctrica, el mensaje dice
  "⚡ Vehículo eléctrico — sin emisiones de escape" en vez del warning de perfil faltante.
- **Autorelleno de regulación vacía** (`_normalizeRegulation`): si en el catálogo (embebido o
  importado) o en el CSV del plan de producción la celda viene vacía, se rellena `EV` cuando
  el motor es eléctrico (capacidad en KW) o `N/A` visible si no — la cascada ya no se atora
  con datos incompletos y las claves de familia no divergen entre catálogo y plan.
- Los valores `220V`/`120V` existentes NO se renombran (los usan las reglas P5 EV del plan y
  el agrupamiento por familias).

## v16.0 — "Plataforma autoguiada" (2026-07-10)

Inflexión total de accesibilidad: cualquier persona nueva debe llegar a cualquier pantalla y
saber qué es, qué hacer y qué capturar, sin depender de que alguien le explique.

- **Tooltips de campo completos**: `CASCADE_TOOLTIPS` (antes solo COP15, 36 campos) ahora cubre
  los 7 módulos — decenas de campos nuevos en Alta/Operación/Liberación/Historial (COP15), plan
  semanal/recuperación/reglas/producción (Test Plan), cilindros/equipos/predicción/combustible
  (Inventario), reportes/operadores/bitácora/alertas/auditoría (Panel), validador/Control SPC
  (CoP) y el tablero de actividades (HOY). Nuevo modo de inyección vía `[data-help="clave"]`
  para títulos y encabezados sin campo de formulario asociado.
- **Banners por pestaña**: cada pestaña de cada módulo (~40 en total) explica en 1-2 líneas qué
  se hace ahí y el primer paso, con "Ver más" (tips accionables) y "Entendido ✓" (descartable
  por dispositivo, releíble desde el botón ℹ️/menú de ayuda).
- **Recorridos guiados por módulo**: el tour único de 5 pasos se volvió `TOURS` — un recorrido
  corto y específico por módulo (Hoy, Plan, Inventario, Datos, CoP, Pruebas) que se lanza solo
  la primera vez que visitas cada uno (solo escritorio) y se puede relanzar desde el botón ?.
- **Glosario del laboratorio**: ~22 términos (Soak, CoP, ETW, I-MR, Reglas de Nelson, Cpk, PSI,
  DTC, etc.) con buscador, accesible desde el menú de ayuda y desde cualquier banner.
- **Estados vacíos guiados**: predicción de inventario sin lecturas, CoP sin plan de producción
  o sin liberaciones, ahora explican por qué están vacíos y ofrecen un botón directo a la
  sección que los llena.
- **Accesibilidad ligera**: `aria-label` en los botones de icono principales (editar/eliminar de
  cilindros, equipos, tanques, zonas; acciones del tablero de HOY; chip de ETA; alarmas SPC;
  firma digital) y checkboxes del tablero.

## v15.9 — "HOY como tablero de actividades + consumo inteligente" (2026-07-09)

### 📌 HOY = tracker de actividades (estilo Monday/Asana)
La pestaña HOY dejó de ser 9 secciones con formatos distintos: ahora es UN tablero de filas
homogéneas agrupadas por categoría (Vehículos / Plan de hoy / Inventario / Calidad / Manuales),
cada fila con icono, título, chip de estado (Pendiente/En curso/Hecho/Atrasado), progreso,
responsable y botón de acción con deep-link (`dashCollectActivities`/`dashRenderBoard`, app.js):

- **Vehículos con etapa "N de 8"**: stepper visual (Alta → Recepción → Preacond → Soak → Prueba
  → Verificación → Liberación → Aprobación, `cascadeVehicleStage` en cop15.js), soak restante
  en la fila y **fecha esperada de liberación** (chip 📅 verde/ámbar/rojo): auto-estimada
  (`cascadeVehicleETA`: fin de soak, día de prueba del plan) con **override manual auditado**
  (`expected_release_set`) tocando el chip
- **Plan de hoy**: las pruebas/preacondicionamientos cuyo `testDay`/`preconDay` es HOY, con
  checkbox que marca el item del plan semanal
- **Inventario**: toma de gases del día (X/Y con progreso), captura de producción atrasada,
  gases vencidos/bajos y calibraciones con deep-link por ítem, y las alertas de consumo (abajo)
- **Calidad**: aprobaciones doble-ciego pendientes, alarmas SPC, desacuerdos críticos
- **➕ Actividad**: tareas manuales con título/categoría/responsable/fecha (`pnState.tasks`,
  sincronizadas entre dispositivos con merge por id y tombstones — `_fbMergeTasks`);
  checkbox para completar, auditadas (task_add/task_done/task_delete)
- Toggle **"Solo míos"**, contadores de pendientes por grupo, refresco vivo (data:saved con
  debounce + tick 60 s), Mi Turno compacto y Acceso Rápido se conservan
- **Soak ligado a su vehículo**: `kia_soak_timer` ahora persiste vehicleId/vin — se corrigió el
  bug latente donde un soak ajeno marcaba "soak listo" a TODOS los vehículos (getNextStep), y
  la tarjeta de soak del Panel leía un esquema que nunca se escribía (jamás aparecía)

### ⛽ Consumo inteligente: aprendizaje real + predicción viva
Antes: descuento FIJO de 50 PSI/prueba a todos los cilindros y la gasolina solo se
"fotografiaba" (nunca se descontaba). Ahora el consumo se APRENDE de la operación:

- **Aprendizaje corregido** (`invCalcConsumptionRates`): solo lecturas manuales (las lecturas
  auto del descuento envenenaban el modelo con drops sintéticos de 50); días con tipos de
  prueba mezclados se reparten proporcional a los estimados vigentes; **drop de 0 con pruebas
  = consumo cero legítimo** (antes se descartaba y el gas sin uso seguía descontando 50)
- **Modelo persistido** `invState.consumption.perType[regulación] = {gases:{fórmula:{est,n}},
  fuelL:{est,n}}` — cache determinista de usageLog+readings: cada dispositivo lo recomputa
  (al capturar lecturas, al cerrar prueba, tras pull de sync); nunca se mergea
- **Descuento por prueba APRENDIDO**: cada gas descuenta su estimado por tipo de prueba
  (fallback 50 solo sin datos); estimado 0 = no descuenta. **La gasolina ahora SÍ se descuenta
  por prueba** al tanque de la regulación (el más reciente con nivel), con lectura auto,
  registro en usageLog (`gasDeducted`/`fuelDeducted` + `cycle`) y auditoría `fuel_auto_deduct`
- **Predicción viva** (`invForecastGasNeeds`): "faltarán ~N psi de X para las M pruebas
  pendientes" en dos alcances (semana del plan / plan completo, disponible = In use + Full);
  visible como filas de alerta en HOY, tarjeta "⛽ Consumo proyectado" en Inventario y fuente
  'Consumo' en Datos → Alertas

## v15.8 — "Edición retroactiva + visión anual del plan" (2026-07-05)

### 📝 Completar datos retroactivos (Historial)
El endurecimiento del PDF (v15.7 y anteriores) dejó a los vehículos archivados ANTES del cambio
sin campos obligatorios, sin PDF y sin ninguna ruta de edición. Ahora, en Cascade → Historial:

- Botón **"📝 Completar (N)"** en cada archivado incompleto (emisiones) → modal de edición
  retroactiva agrupado por sección: **faltantes editables** (ámbar), **existentes bloqueados 🔒**
- Modificar un valor ya guardado exige **razón escrita** (botón ✏️, mín. 5 caracteres) y
  **firma digital** al guardar (`sigCaptureOpen`); solo llenar faltantes no pide firma
  (se atribuye al operador actual)
- Gases faltantes con validación en vivo (✓/✗ vs límite, % del límite, rangos plausibles);
  firmas de Liberador/Aprobador capturables retroactivamente (quedan marcadas `retro:true`)
- Todo queda asentado: `vehicle.timeline` ("Datos completados retroactivamente" con
  añadidos/modificados/razones), `testData.retroSignatures[]`, y auditoría `retro_edit`
- Botón **🕘** por vehículo: historial + control de cambios (tabla campo/antes/después/razón)
  — primera vista de timeline disponible para archivados
- Refactor interno: descriptor único `PDF_REQUIRED_FIELDS` alimenta `validatePdfCompleteness`
  y el modal (salida verificada idéntica en 6 fixtures antes/después)
- El vehículo **nunca sale de archivado** (no se re-dispara la cascada de aprobación)

### 📅 Plan de pruebas — visión anual y política por región (de la comparativa con el lab hermano)
- **Presupuesto Anual** en Plan → Dashboard: requeridas/probadas/pendiente del año vs capacidad
  restante (semanas restantes × capacidad, respeta `weekAvailability`), barra apilada del
  pendiente por prioridad P1..Pn y veredicto verde/ámbar/rojo ("¿alcanza el año?")
- **Propósito por región** al iniciar prueba desde el plan: EUROPE → COP-Emisiones, resto →
  EO-Emisiones por default (regla corporativa "COP solo Europa"); configurable en Plan → Reglas
  ("Propósito al iniciar prueba desde el plan"); el técnico siempre puede cambiarlo en Alta
- **P4 Legacy (Euro 2/3/4) y P5 EV (120V/220V)** como reglas default del Recovery (antes solo
  P1–P3); `maxTiers` default 5; migración suave que respeta reglas personalizadas
- **⏱ Última prueba por familia**: badge en Familias (verde <30d, ámbar 30–90d, rojo >90d,
  "Nunca"); evidencia de familia ordenada **más reciente primero** con fecha destacada
  ("ÚLTIMA", hace Nd) y CSV con el mismo orden

## v15.7 — "Control SPC + calidad de captura" (2026-07-03)

Mejoras adaptadas del tablero de emisiones VETS de un laboratorio hermano (Kia/Hyundai),
tras comparar ambos proyectos: se adoptó lo que no teníamos y aplicaba a nuestro flujo.

### Control SPC (nueva sub-pestaña en CoP)
- La plataforma **CoP** ahora tiene 2 sub-pestañas: **📋 Validador CoP** (igual que antes) y
  **📈 Control SPC** (`copBuildSpcHTML`, `copSpcRenderCharts` en `cop_validator.js`)
- **Carta I-MR por familia × gas** sobre los valores finales verificados de cada liberación
  (`gasResults.aprobador`, fallback `liberador`), ordenados por fecha de captura y agrupados
  con la misma llave de familia del Plan (`copVehicleFamilyKey`)
- Estadística: media; σ = MR̄/1.128; UCL/LCL = media ± 3σ; MR-UCL = 3.267·MR̄;
  **Cpk = (Límite − media)/(3σ)** con n≥8 (semáforo: ≥1.33 verde, ≥1.0 ámbar, <1.0 rojo)
- **Reglas de alarma (Nelson)**: R1 punto fuera de ±3σ · R2 corrimiento (8 seguidos del mismo
  lado) · R3 tendencia (6 en fila monótonos). Umbrales: n<4 sin límites de control;
  4–7 preliminares; ≥8 confiables
- **Panel de alarmas retráctil** (familias con n≥4, gases con límite; CO2 se grafica para
  vigilancia pero no alarma); cada alarma navega a su carta. Las alarmas también aparecen en
  **Datos → Alertas** (`pnGetActiveAlerts`, fuente "CoP SPC")
- Toggles: Zonas σ, Límite regulatorio (línea ámbar) y **% del límite** (re-escala la carta a
  porcentaje — la tendencia gas-vs-límite del proyecto hermano)
- Charts con Chart.js (`window._copSpcIChart` / `_copSpcMrChart`), puntos verde/ámbar/rojo
  según reglas disparadas; ayuda en `<details>` explicando I-MR/Nelson/Cpk

### Calidad de captura en Liberación (cop15.js)
- **% del límite** junto al veredicto: "✓ PASA · 43% del lím." / "✗ FALLA · 112% del lím."
  (antes solo booleano). También en el PDF de liberación
- **Rangos plausibles por gas** (`GAS_PLAUSIBLE_BOUNDS`): un valor fuera de rango (error de
  dedo / dato basura del analizador) marca la fila en ámbar "⚠ Valor improbable" — **avisa sin
  bloquear** (el técnico decide) y deja rastro en auditoría al guardar (`gas_fuera_de_rango`)
- **FE informativa por balance de carbono** bajo el CO2 registrado: ≈ L/100 km y mpg
  (`mpg = 8887/(CO2_g/km × 1.609344)`; no es la FE certificada). También en el PDF

### Qué NO se adoptó del proyecto hermano (y por qué)
- Desglose por fase/bolsa del ciclo: nuestro flujo captura solo valores FINALES verificados
  (decisión de diseño, ver comentario en cop15.js) — el juicio regulatorio no usa bolsas crudas
- Tema oscuro: eliminado aquí en v15.5 (tema claro único)
- Su conteo fijo de pruebas CoP (3/familia): nuestro validador secuencial R83/R154 es superior

## v15.6 — "Sync confiable + Seguridad real + Limpieza final" (2026-07-02)

Tres frentes pedidos por el usuario: que **todo dispositivo vea siempre lo último**,
**volver a tener seguridad**, y **borrar definitivamente** los módulos muertos.

### Sync siempre actualizado (causa raíz del celular vacío + versión vieja)
- **Service worker descongelado**: `sw.js` tenía `CACHE_VERSION` pegado desde el 28/abr (un build
  interrumpido dejó el literal; `build.sh` buscaba un placeholder inexistente). El SW salía
  byte-idéntico en cada deploy → los dispositivos nunca recibían actualizaciones. Ahora `build.sh`
  genera el artefacto `sw.build.js` (guard que aborta si el placeholder se pierde) y `deploy.sh`
  despliega ese artefacto versionado. **Este es el fix que recupera el celular.**
- **Auto-actualización de la PWA**: `reg.update()` al arrancar y al volver a la app; al llegar el SW
  nuevo, recarga en la ventana segura (<15 s, sin modal) o banner "Actualizar ahora"
- **Pull inicial robusto**: un dispositivo vacío siempre puede descargar (excepción de quota),
  con reintentos y feedback visible; el indicador ya no dice "conectado" con 0 datos
- **Guard anti-vaciado**: un dispositivo vacío nunca sube `{vehicles:[]}` y pisa la nube (había un
  push de semilla a los 6 s sin protección)
- **CSV de producción en vivo a todas las estaciones** (pedido explícito): el live-sync ya no
  descarta los cambios de plan; adopta `planData` + `months` del import más nuevo
- Indicador honesto ("⚠ sin datos — toca para descargar") + botón "🔄 Actualizar datos" en el menú ⋯

### Seguridad real (nube + PIN)
- **Firebase Auth + Security Rules**: `firestore.rules` versionadas — `stations/**` solo para
  sesiones Email/Password (antes: sign-in anónimo + sin reglas = workspace abierto a cualquiera con
  la URL). Login de dispositivo con contraseña del laboratorio (una vez por dispositivo)
- **Muro de PIN por operador**: SHA-256 con sal (`pinHash2`, migra los hashes de 32 bits viejos);
  lockout de 60 s tras 5 fallos; auditoría de accesos (login/login_failed/logout)
- Ver README → "Seguridad — setup una sola vez" para los pasos de consola y el orden de rollout

### Limpieza final
- **Eliminados definitivamente** `js/results.js` (Results Analyzer) y `js/approvals.js` (Power
  Automate) — fuera del build desde mayo 2026. De paso se arreglaron **2 crashes latentes**
  (`fbMergeExecute` y `fbBackupNow` usaban `raState` inexistente → el merge manual y el backup a la
  nube crasheaban). ~3,800 líneas menos + docs actualizados.


## v15.5 — "Pulir y Endurecer" (2026-07-02)

**16 commits: corrección de bugs de fondo, performance medible y UX móvil — sin módulos nuevos.**
Verificado end-to-end con 31 checks de Playwright/Chromium (arranque, XSS, timezone, CoP, audit, charts, modales, filtros, móvil 390×844).

### Seguridad y datos
- **XSS almacenado corregido**: nombres de operador, VIN y descripciones se escapan en todos los
  renders (login, picker 👤, Panel→Usuarios, Lab Overview, modal de sustitución); `authBypassForOperator`
  resuelve por índice (ya no interpola el nombre en `onclick`)
- **Fechas en hora local** (`localToday`/`localDateStr`/`parseLocalDate`): "Liberados Hoy", bitácora,
  KPI ejecutivo, buckets semanales y defaults de fecha ya no ruedan al día siguiente después de las
  ~18:00 (el lab opera en UTC−6); `tpISOWeekKey` sin corrimiento UTC
- **QuotaExceededError manejado** en `saveDB`/`tpSave`/`copPersist`: error visible en vez de fallo
  silencioso; `copSaveJudgment` ya no reporta "guardado" cuando no persistió
- **CoP: auto-llenado real** (`copResultValue`): gases por VIN desde los valores finales verificados
  de liberación/aprobación (nunca bolsas crudas); `HCNOx` = THC+NOx o el combinado EURO-2; los juicios
  se suben a la nube al guardarse (antes esperaban el ciclo completo)
- **Sync sin pérdida de datos**: `fbPullApply` mergea por elemento (reutiliza `fbMergeAnalyze/Execute`)
  en vez de reemplazar por conteo — dos altas concurrentes ya no se pierden; subcampos v15 de `tpState`
  preservados; operadores con merge por id + tombstones (los borrados no resucitan); cap del audit
  unificado (el pull ya no encoge la historia a 1000)

### Performance
- **`auditLog` en memoria** con persist/push debounced: antes cada evento re-serializaba hasta 5000
  entradas y subía el arreglo completo a Firestore; ahora ráfagas = 1 escritura + 1 subida; flush en
  `pagehide`; cap 2000 (lejos del límite de 1MB/documento)
- **Cascada de liberación coalescida**: un `tpSave` + un `invSave` por liberación (antes 2×tp + 1×inv
  por vehículo, también en batch)
- Sliders sin serialización por tick (guardan en `change`); `tpBuildFamilies` sin O(familias²);
  fuga del chart de pronóstico de gas corregida ("canvas already in use"); `renderLabOverview`
  memoizado (HOY/Panel ya no re-escanean todos los módulos por visita); timeline compactado al archivar

### UX / Estética
- **Solo tema claro**: eliminadas 242 reglas de dark mode, el auto-cambio por preferencia del sistema
  y sus parches frágiles (−44KB de CSS); font stack de sistema; tipografía mínima 11px en móvil
- **Topbar móvil de una fila**: las 5 tabs se ocultan en <768px (la bottom-nav ya navega); controles
  secundarios en menú ⋯; touch targets ≥44px; `:focus-visible` global de marca
- **Modales legacy unificados**: ESC, click-fuera, animación de entrada y retorno de foco en
  substitution/config/inv/fb (cerrar el escáner con ESC también apaga la cámara)
- Transición corta por defecto entre plataformas (sin corte seco) + scroll instantáneo;
  el filtro VIN del Historial ya no pierde el foco al teclear (`preserveFocus`);
  ripple en botones TP y shake en validaciones fallidas
- CSS deduplicado: 3 definiciones de `.skeleton` → 1, `[x-cloak]` ×2 → 1, dos `@media 1024px`
  fusionados, view-transitions muertas eliminadas

### Notas
- `results.js` y `approvals.js` son **módulos latentes**: siguen en `js/` pero están fuera de
  `index.html` y `build.sh` desde mayo 2026 (reemplazo del flujo PA/VETS por doble ciego). Esta
  versión solo silencia sus efectos colaterales (error de `raInit` en consola, push de estado
  indefinido al sync). Revivirlos o eliminarlos es una decisión de producto pendiente.

## Round 5 — (2026-03-11)

**8 improvements focused on native app experience, smart UX, and operational efficiency.**

### M1: Immersive Mode (App Nativa)
- Fullscreen toggle button (`⛶`) in header — enters Fullscreen API
- Auto-collapsing header on scroll down in immersive mode (scroll up reveals)
- Splash screen with animated progress bar during `initializeSystem()`
- Remembers immersive preference across sessions (`kia_immersive_prefs`)
- Enhanced `manifest.json` with app shortcuts (Nuevo Vehículo, Plan Semanal, Lectura Rápida)
- Syncs with ESC key / browser fullscreen exit

### M2: Smart Auto-Save (On Blur)
- Auto-saves COP15 operation form on field blur, tab switch, visibility change, and window blur
- Replaces blocking "unsaved changes" confirmation modal with silent auto-save
- Visual indicator: green "✓ Guardado HH:MM" badge with fade animation
- `saveProgress({silent:true})` mode skips button animation and toast
- Extensible engine: `autoSaveInit(module, saveFn, dirtyFn)` for any module
- `beforeunload` flushes pending changes

### M3: Contextual Smart Forms
- Progressive disclosure: accordion sections lock/unlock based on vehicle status
- Lock overlay shows "🔒 Se desbloquea en: [status]" for future sections
- Completion badges on accordion headers: "3/6 ✓" with color coding (green/yellow/gray)
- Smart defaults: "Ayer 6AM" and "Ahora" quick buttons for precond datetime
- Auto-fill from CSV_CONFIGURATIONS (ETW, target coefficients)
- Silent copy of safe fields from last same-config vehicle with inline banner notification
- Badges update in real-time via debounced input/change listeners

### M4: Micro-Animations & Visual Polish
- Animated counters on Dashboard KPIs (count-up with easeOutCubic, bounce on change)
- Staggered fade-in+slide-up for list items (kanban cards, KPI grid)
- Card hover elevation (translateY + shadow) on kanban and dashboard cards
- Confetti burst (6 CSS particles) on vehicle release
- Skeleton loading CSS (shimmer animation for placeholder content)
- Glassmorphism panel class (backdrop-filter blur)
- Status badge enter animation (scale+fade)
- Progress ring SVG builder (`buildProgressRing()`)
- All animations respect `prefers-reduced-motion`

### M5: Batch Reading Rounds (Inventory)
- "🔄 Ronda" button in readings tab launches guided one-at-a-time experience
- Fullscreen overlay: one cylinder visible with gas info, zone, concentration
- SVG sparkline of last 5 readings for instant trend visibility
- Pre-fills with last reading value; "= Igual" button for 1-tap confirmation
- Warning detection: flags >15% pressure drop from last reading
- Summary screen on completion: count, alerts, elapsed time
- Clipboard copy of round summary report

### M6: Structured Shift Report
- "🔄 Cerrar Turno" button in Panel → Bitácora generates automatic report
- Collects: vehicles in progress, pending tests, low gases, daily releases
- Visual report card with color-coded KPIs and detailed vehicle list
- Operator notes field for free-text observations
- "📋 Copiar" exports as formatted plaintext to clipboard
- `pnShowTurnoverOnLogin()` shows last report on next session (if <24h old)
- Stored in `pnState.shiftReports[]` (last 30 reports)

### M7: Unified Calendar
- New "📅 Calendario" tab in Panel module
- Monthly CSS Grid view with day cells and colored event dots
- Aggregates from 4 sources: equipment calibrations, gas depletion predictions, test plan items, vehicle releases
- Color legend: red (expired/depleted), orange (upcoming), blue (planned), green (release)
- Click any day → modal with detailed event list
- Week summary below calendar: "Esta semana: 3 calibraciones, 5 pruebas"
- Month navigation (← → Hoy)

### M8: Templates & Quick Presets
- Unified template engine in app.js: `templateSave/Apply/Delete/GetAll(module, ...)`
- COP15: "📌 Plantilla" button saves operation form as reusable template
- COP15: "📂 Mis Plantillas" opens template manager with apply/delete
- Results Analyzer: `raPresetSave/Apply()` for filter presets (groupBy, metric, dates)
- Inventory: `invDuplicateGas(id)` clones cylinder with auto-incremented control number
- Inventory: `invBatchAddGas(type, conc, real, count, zone)` creates multiple cylinders
- Auto-assigns to least-full zone when zone not specified
- Templates persisted in `kia_templates` localStorage (max 20 per module)
- Quick-access buttons via `templateRenderQuickButtons()`

---

## Round 4 — `adf638a` (2026-03-11)

**8 improvements focused on native chart tooling, cross-module intelligence, and system observability.**

### M1: Chart Config Engine (Centerpiece)
- Centralized `chartConfigGet/Set/Apply/Reset()` registry persisted to `kia_chart_configs` localStorage
- Reusable `chartConfigBuildPanel(chartId, instanceVar, opts)` generates `<details>` accordion UI with sliders/selects
- Controls: height, Y-axis min/max, point radius, border width, line tension, legend position/size, grid color/toggle, tick size/color, animation duration
- 4 color palettes: default, vivid, pastel, monochrome — applied via `chartConfigApplyColors()`
- Auto-fit button analyzes dataset to set optimal Y-axis range
- PNG export (`chartExportPNG`) and PDF export (`chartExportPDF`) per chart
- Applied to all chart instances: `ra_trend`, `ra_compliance`, `ra_spc_i`, `ra_spc_mr`, `tp_burndown`, `tp_dashboard`, `inv_*`
- Old `raChartSetHeight/SetYRange/AutoFit` functions redirected to unified system

### M2: Snapshot Undo Engine
- In-memory circular buffer (`_undoStack`, max 10 entries)
- `undoPush(module, actionLabel)` snapshots full module state as JSON
- `undoPop()` restores most recent snapshot + calls module's render function
- `showToast()` extended with optional 4th parameter (undo callback) — shows "Deshacer" button
- `Ctrl+Z` keyboard shortcut + "Deshacer Ultima Accion" in command palette
- Hooked into destructive actions: "Borrar TODAS las pruebas" (RA), "Borrar todos los registros" (TP), "Resetear inventario" (INV)

### M3: PDF Reports with Embedded Charts
- Extended `generateWeeklyStatusPDF()` to embed chart images
- Uses `chart.toBase64Image()` → `doc.addImage()` for jsPDF
- Embeds up to 4 charts: Burndown, Compliance Rate, Trend Analysis, Inventory Consumption
- Graceful fallback if charts aren't rendered

### M4: Cross-Module Global Search
- Extended `globalVinSearch()` to search across all 4 modules
- Inventory: searches gas names, equipment names, gas types
- COP15: searches configCode, model, operator
- Results: searches operator, testDescription, regulation
- Power search prefix `>` in command palette triggers `_globalCrossSearchForPalette(q)`
- Results shown as command palette entries with module badges

### M5: Cross-Module Intelligence Panel
- New "Inteligencia" tab in Panel module
- **Correlation 1**: Gas Consumption vs Test Volume — weekly bar+line chart (dual Y-axis)
- **Correlation 2**: Fail Rate vs Gas Age — grouped bar chart by age bucket (<30d, 30-90d, >90d)
- **Correlation 3**: Plan Velocity vs Pipeline Load — bar chart per plan
- Summary stats grid: total tests, vehicles, gas cylinders, fail rate
- File: `js/panel.js` — functions: `pnRenderIntelligence()`, `_pnIntelRenderCharts()`

### M6: Results Comparison Side-by-Side
- Compare any two tests from RA detail view
- Two-column layout with color-coded differences (green = better, red = worse)
- Radar chart overlay when >= 3 comparable numeric fields
- Reference line at 100% (regulatory limit) on radar chart
- Uses `raRenderCompare()` function

### M7: Entity Notes System
- `noteAdd/Get/Delete/Count()` functions with `kia_entity_notes` localStorage key
- `noteBuildButton(entityType, entityId)` returns HTML button with badge count
- `noteShowModal()` opens modal with notes list + text input
- Added to COP15 vehicle timeline and RA test detail view
- Notes stored as `{id, text, ts}` arrays keyed by `entityType:entityId`

### M8: System Health Monitor
- New "Sistema" tab in Panel module
- **Storage breakdown**: per-module byte count with progress bar (vs 5MB limit)
- **Data aging table**: counts per module by age bucket (30-60d, 60-90d, >90d)
- **Purge tools**: delete old data by module with confirmation dialog
- **Performance metrics**: localStorage key count, DOM nodes, JS heap memory, active Chart.js instances
- File: `js/panel.js` — functions: `pnRenderSystemHealth()`, `_pnFormatBytes()`, `_pnMeasurePerformance()`, `pnPurgeOldData()`

---

## Round 3 — `5335591`

**9 cross-discipline improvements: PWA, accessibility, security, performance, data integrity, motion, print, onboarding.**

- Progressive Web App (service worker + manifest)
- ARIA labels and keyboard navigation
- Content Security Policy headers
- Lazy rendering and virtual scrolling for large lists
- Data integrity validation on load
- `prefers-reduced-motion` support
- Print stylesheet optimization
- Interactive onboarding tour
- Safe parse wrappers for JSON

---

## Round 2 — `59427cc`

**10 heavyweight functional improvements.**

- SPC I-charts and mR-charts for statistical process control
- Cpk/Ppk process capability indices with regulatory limits
- Burndown chart for test plan progress
- Weekly prediction engine with inventory sufficiency checks
- Visual cascade tree for COP15 vehicle flow
- Enhanced timeline with filtering
- Gas consumption trend analysis
- Equipment barcode/QR code generation and scanning
- Shift log and operator management panel
- Automated alert system with configurable thresholds

---

## Round 1 — `383d1c3`

**10 UX improvements.**

- Clipboard copy for VIN and test data
- Kanban-style board for test plan status
- Soak timer with browser notifications
- Toast notification system
- Command palette (Ctrl+K)
- Chart.js integration with zoom plugin
- Outlier detection in results
- Operation transparency log
- Lab zone map
- Compact/detailed view toggle

---

## Pre-Round (Foundation)

- Core COP15 vehicle registration workflow
- Basic test plan manager
- Results entry and storage
- Lab inventory tracking (gas, fuel, equipment)
- CSV configuration import
- Firebase sync layer (optional)
- PDF report generation with jsPDF
- Digital signatures with signature_pad
