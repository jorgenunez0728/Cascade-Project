# Setup del flow de Power Automate — Aprobación de Emisiones

A partir del último cambio (commit que combina COP15-F05 + foto en un solo PDF), el webhook ya **no** manda `pdf` y `scannedReport` por separado. Manda **un solo `pdf` de 2 páginas**: página 1 = COP15-F05, página 2 = foto de la hoja de resultados con header.

Este documento explica cómo consumir el webhook en el flow para que el correo salga con el PDF adjunto correctamente (con extensión `.pdf`, peso real, abre en cualquier visor).

---

## ⭐ TL;DR — expresiones listas para pegar (solo `triggerBody`, sin Parse JSON)

Si tu trigger HTTP **no** tiene un JSON Schema definido, `triggerBody()` te devuelve el cuerpo como **string** y `?['pdf']` te da `null`. Solución: envuelve con `json()` para forzar el parseo.

**En el step "Send an email (V2)" → Show advanced options → Attachments:**

| Campo | Expresión |
|---|---|
| **Attachments Name - 1** | `json(triggerBody())?['pdf']?['filename']` |
| **Attachments Content - 1** | `base64ToBinary(json(triggerBody())?['pdf']?['base64'])` |

Eso es todo. Con `json(triggerBody())` parseas el body a objeto cada vez. Con `base64ToBinary(...)` el adjunto llega como PDF real (con extensión, abre normal). Sin esos dos envoltorios el archivo te sale como blob opaco sin extensión — el bug que tenías.

**Subject sugerido:**
```
COP15-F05 Liberación VIN @{json(triggerBody())?['vehicle']?['vin']} — @{json(triggerBody())?['vehicle']?['resultado']}
```

**Cuerpo (HTML):**
```html
<p>Hola,</p>
<p>Se liberó el vehículo VIN <b>@{json(triggerBody())?['vehicle']?['vin']}</b>.</p>
<ul>
  <li><b>Modelo:</b> @{json(triggerBody())?['vehicle']?['model']}</li>
  <li><b>Motor:</b> @{json(triggerBody())?['vehicle']?['engine']}</li>
  <li><b>Transmisión:</b> @{json(triggerBody())?['vehicle']?['transmission']}</li>
  <li><b>Regulación:</b> @{json(triggerBody())?['vehicle']?['regulation']}</li>
  <li><b>Propósito:</b> @{json(triggerBody())?['vehicle']?['purpose']}</li>
  <li><b>Resultado:</b> @{json(triggerBody())?['vehicle']?['resultado']}</li>
  <li><b>Operador de registro:</b> @{json(triggerBody())?['vehicle']?['registeredBy']}</li>
  <li><b>Estación:</b> @{json(triggerBody())?['station']}</li>
</ul>
<p>Adjunto el PDF COP15-F05 (página 2 incluye la foto de la hoja de resultados del equipo VETS).</p>
<p>Saludos,<br>KIA EmLab</p>
```

**Si quieres confirmar primero que el JSON sí llega bien:** agrega un step **Compose** entre el trigger y el Send email con valor:
```
json(triggerBody())?['pdf']?['filename']
```
Corre el flow una vez. El output del Compose debe mostrar `COP15-F05_<VIN>_<fecha>.pdf`. Si muestra `null`, el body no es JSON o no llegó. Si muestra el filename, el resto va a funcionar.

---

## Por qué `triggerBody()?['pdf']?['base64']` venía null

El trigger HTTP de Power Automate, **sin schema definido**, recibe el body como string. Las expresiones `?['propiedad']` solo funcionan sobre objetos parseados, así que sobre un string te devuelven `null` en silencio.

Tres formas de arreglarlo (escoge la que prefieras):

**Opción A · Forzar parseo con `json()`** ← lo más simple, lo de arriba.

**Opción B · Pegar el schema en el trigger**
1. Edita el step "When a HTTP request is received".
2. En el campo "Request Body JSON Schema" pega el schema que está más abajo en este doc.
3. Después de eso, `triggerBody()?['pdf']?['base64']` (sin `json()`) ya funciona.

**Opción C · Agregar un step "Parse JSON"**
1. Después del trigger, agrega un step **Parse JSON**.
2. Content: `triggerBody()`
3. Schema: pegar el schema más abajo.
4. Usa `body('Parse_JSON')?['pdf']?['base64']`.

Las tres son equivalentes. **Opción A no requiere tocar la configuración del trigger ni meter steps extra**, por eso es la más rápida.

---

## El JSON que llega al trigger

Cuando se libera un vehículo de emisiones, el webhook HTTP recibe este JSON. Es lo que ves en el step "When a HTTP request is received".

```json
{
  "event": "vehicle_released",
  "timestamp": "2026-04-27T17:30:00.000Z",
  "station": "KIA EmLab México",
  "vehicle": {
    "id": 42,
    "vin": "KNAFW6A8XR1234567",
    "configCode": "BL7m / 1600cc GAMMA / 6AT / ...",
    "purpose": "COP-Emisiones",
    "model": "BL7m",
    "engine": "1600cc GAMMA",
    "regulation": "EURO-5",
    "transmission": "6AT",
    "registeredBy": "Operador Lab",
    "registeredAt": "2026-04-27T08:00:00.000Z",
    "status": "archived",
    "archivedAt": "2026-04-27T17:25:00.000Z",
    "resultado": "PASS",
    "testSummary": { "etw": 1500, "targetA": 4.7, "...": "..." }
  },
  "signatures": {
    "technician": { "dataUrl": "data:image/png;base64,...", "...": "..." },
    "releaser":   { "dataUrl": "data:image/png;base64,...", "...": "..." }
  },
  "pdf": {
    "base64": "JVBERi0xLjQKJ...",
    "filename": "COP15-F05_KNAFW6A8XR1234567_2026-04-27.pdf",
    "contentType": "application/pdf"
  },
  "scannedReportEmbedded": {
    "pageInPdf": 2,
    "capturedAt": "2026-04-27T17:20:00.000Z"
  }
}
```

Variantes a tener en cuenta:

- Si la foto **no** estaba en este equipo (por ejemplo después de Smart Merge desde otra estación), `scannedReportEmbedded` no aparece y en su lugar viene `scannedReportMissing: { reason: "captured-on-another-station", flaggedAt: "..." }`. El `pdf` será de **1 sola página**.
- Si el vehículo no es de emisiones, no hay `pdf`. Puede haber `scannedReport` (foto separada) si por alguna razón existe.

---

## Schema para "Parse JSON" (recomendado)

Pega esto en el step **Parse JSON** justo después del trigger HTTP. Te da intellisense para todos los campos.

```json
{
  "type": "object",
  "properties": {
    "event": { "type": "string" },
    "timestamp": { "type": "string" },
    "station": { "type": "string" },
    "vehicle": {
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "vin": { "type": "string" },
        "configCode": { "type": "string" },
        "purpose": { "type": "string" },
        "model": { "type": "string" },
        "engine": { "type": "string" },
        "regulation": { "type": "string" },
        "transmission": { "type": "string" },
        "registeredBy": { "type": "string" },
        "registeredAt": { "type": "string" },
        "status": { "type": "string" },
        "archivedAt": { "type": "string" },
        "resultado": { "type": "string" }
      }
    },
    "pdf": {
      "type": "object",
      "properties": {
        "base64": { "type": "string" },
        "filename": { "type": "string" },
        "contentType": { "type": "string" }
      }
    },
    "scannedReportEmbedded": {
      "type": "object",
      "properties": {
        "pageInPdf": { "type": "integer" },
        "capturedAt": { "type": "string" }
      }
    },
    "scannedReportMissing": {
      "type": "object",
      "properties": {
        "reason": { "type": "string" },
        "flaggedAt": { "type": "string" }
      }
    }
  }
}
```

---

## Send an email (V2) — paso a paso

Tu error original (archivo "binario sin extensión" de ~100KB) ocurre cuando se pone el string base64 directamente en el campo de attachment. **Power Automate necesita que conviertas el string a binario antes de adjuntarlo.**

### Configuración correcta del attachment

En el step **Send an email (V2)** → **Show advanced options** → **Attachments**:

| Campo | Valor (expresión) |
|---|---|
| **Attachments Name - 1** | `body('Parse_JSON')?['pdf']?['filename']` |
| **Attachments Content - 1** | `base64ToBinary(body('Parse_JSON')?['pdf']?['base64'])` |

Si **no** usas Parse JSON, usa `triggerBody()` en lugar de `body('Parse_JSON')`:

| Campo | Valor (expresión) |
|---|---|
| **Attachments Name - 1** | `triggerBody()?['pdf']?['filename']` |
| **Attachments Content - 1** | `base64ToBinary(triggerBody()?['pdf']?['base64'])` |

### Por qué esto funciona

- `pdf.filename` ya viene con `.pdf` al final (`COP15-F05_<VIN>_<fecha>.pdf`). Outlook lo respeta.
- `pdf.contentType` es `application/pdf`. Outlook lee el filename y/o el contenido para deducir el tipo. La función `base64ToBinary()` convierte el string a bytes reales para que el adjunto sea un PDF válido y no un blob opaco.

### Cuerpo del correo — referenciar el PDF

Si quieres mencionar el adjunto en el cuerpo:

```
Hola,

Se liberó el vehículo VIN @{body('Parse_JSON')?['vehicle']?['vin']}
(@{body('Parse_JSON')?['vehicle']?['model']} — @{body('Parse_JSON')?['vehicle']?['regulation']}).

Resultado: @{body('Parse_JSON')?['vehicle']?['resultado']}

Adjunto el PDF COP15-F05 con la documentación completa, incluyendo
la foto de la hoja de resultados del equipo VETS en la página 2.

Saludos,
KIA EmLab
```

**No insertes la foto inline** en el cuerpo HTML — ya está en la página 2 del PDF. Ahorras peso al correo y mantienes la auditoría limpia.

---

## Caso especial — vehículo SIN foto local (post Smart Merge)

Si recibes `scannedReportMissing` en lugar de `scannedReportEmbedded`, el PDF es de 1 página. Decide qué hacer:

**Opción A · seguir mandando el correo**: el step "Send email" funciona igual, solo que el adjunto es la página COP15-F05 sin la captura de VETS. Útil si tu cadena de aprobación no requiere la foto físicamente.

**Opción B · bloquear y alertar al técnico**: usa una **Condition** después del Parse JSON:
- Si `body('Parse_JSON')?['scannedReportMissing']` `is not equal to` `null` →
  - "Send an email" a tu equipo: "Falta foto de hoja de resultados — vehículo @{...['vin']} fue liberado pero la foto solo existe en otra estación. Pídele al operador que la recapture en esta PC y vuelva a enviar."
  - Termina el flow con `Terminate` status `Failed`.
- En el camino "yes" (foto presente) sigue al Send email normal con el PDF.

---

## Verificar que funciona

Después de configurar:

1. Liberar un vehículo de emisiones desde la app (ya con foto capturada).
2. En el run history del flow → ver el trigger output → verificar que llega `pdf.base64` (string largo) y `pdf.filename` con `.pdf`.
3. En el output del Parse JSON → verificar que las propiedades se leen.
4. Recibir el correo → el adjunto debe:
   - Llamarse `COP15-F05_<VIN>_<fecha>.pdf` (con extensión visible)
   - Pesar entre 150 y 400 KB típicamente
   - Abrir como PDF en cualquier visor (Adobe, Edge, Preview)
   - Tener **2 páginas**: la primera es el COP15-F05 con todos los datos del test, la segunda es la foto de la hoja de resultados con header y fecha de captura

---

## Si pasa esto → es esto otro

| Síntoma | Causa | Cómo arreglar |
|---|---|---|
| `triggerBody()?['pdf']` o `triggerBody()?['pdf']?['base64']` devuelven `null` | El trigger HTTP no tiene JSON Schema, así que `triggerBody()` devuelve un string y `?['propiedad']` te da null | Envuelve con `json()`: `base64ToBinary(json(triggerBody())?['pdf']?['base64'])`. O pega el schema en el trigger. Ver sección TL;DR arriba. |
| Adjunto sin extensión, no abre como PDF | Pegaste el base64 en "Attachments Content" sin envolver en `base64ToBinary()` | Cambia el campo a `base64ToBinary(json(triggerBody())?['pdf']?['base64'])` |
| El correo llega con un archivo de 0 KB | `pdf.base64` viene vacío en el trigger — probablemente el vehículo no es de emisiones o `includePdfOnRelease` está apagado en la config de la app | Revisa la config en KIA EmLab → Power Automate, marca "Incluir PDF COP15-F05 al liberar" |
| Llegan DOS adjuntos como antes | Versión vieja de la app — sigue mandando `pdf` y `scannedReport` separados | Confirma que la PWA actualizó (recargar fuerte / desinstalar y reinstalar). El indicador de versión debe coincidir con el último build |
| El PDF se abre pero solo tiene 1 página y la foto sí estaba | Probablemente `payload.scannedReportEmbedded` no llegó — revisa el trigger output, posiblemente la imagen no se cargó a tiempo (`img.onload` falló). Mira la consola del navegador en la estación origen |
| El correo dice "From: noreply" en lugar de tu cuenta | Configura el connector de Outlook 365 con tu cuenta (no la genérica). Settings del flow → Connections |
| La foto de la página 2 sale recortada o estirada | El header de la página ocupa 24mm verticales; la foto se ajusta al área restante manteniendo aspect ratio. Si tu foto tiene un aspecto muy raro (ej. 1:3) podría dejar barras blancas — eso es normal |

---

## Resumen del cambio para tu flow actual

Si ya tenías un flow que usaba `triggerBody()?['pdf']` Y `triggerBody()?['scannedReport']` como dos attachments separados:

- **Quita** el segundo attachment (`scannedReport`).
- **Mantén** el primero pero usa `base64ToBinary()` (probablemente ya lo tenías para `pdf`).
- Listo — la foto ya viaja como página 2 del mismo PDF.
