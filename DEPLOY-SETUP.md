# Setup de despliegue automático — sin terminal

Una sola configuración, ~5 minutos, todo desde el navegador. Después cada cambio que hagas en `main` despliega solo a `https://kia-emlab-test-system.web.app`.

---

## Paso 1 · Activar Firebase Hosting (1 minuto)

1. Abre **https://console.firebase.google.com/project/kia-emlab-test-system/hosting/main**
2. Si te pide "Get started" o "Empezar", haz clic. Sigue los pasos:
   - "Install Firebase CLI" → **Skip / Saltar** (no lo necesitas)
   - "Initialize your project" → **Skip / Saltar**
   - "Deploy to Firebase Hosting" → **Skip / Saltar / Continuar al panel**
3. Cuando llegues al dashboard de Hosting, listo. Verás "No deploys yet" — eso es normal.

---

## Paso 2 · Generar la llave de servicio (2 minutos)

1. Abre **https://console.firebase.google.com/project/kia-emlab-test-system/settings/serviceaccounts/adminsdk**
2. En la pestaña **Service accounts**, clic en el botón azul **"Generate new private key"**
3. Confirma → se descarga un archivo JSON (algo como `kia-emlab-test-system-firebase-adminsdk-xxxxx.json`).
4. **Abre ese archivo con cualquier editor de texto** (Bloc de notas / TextEdit / etc.) y selecciona TODO el contenido (`Ctrl+A` / `Cmd+A`) y cópialo (`Ctrl+C` / `Cmd+C`). Lo necesitas en el siguiente paso.

⚠️ Ese JSON es una llave secreta. No la subas al repo, no la compartas. Solo va al secret de GitHub.

---

## Paso 3 · Pegar la llave como secret en GitHub (1 minuto)

1. Abre **https://github.com/jorgenunez0728/cascade-project/settings/secrets/actions**
2. Clic en **"New repository secret"** (botón verde arriba a la derecha)
3. Llena:
   - **Name:** `FIREBASE_SERVICE_ACCOUNT`  ← exactamente así, mayúsculas y guiones bajos
   - **Secret:** pega el JSON completo que copiaste (`Ctrl+V`)
4. Clic en **"Add secret"**

Listo. GitHub ya tiene la credencial para deployar a Firebase.

---

## Paso 4 · Mergear el PR (30 segundos)

1. Abre **https://github.com/jorgenunez0728/cascade-project/pulls**
2. Encuentra el PR de la branch `claude/vehicle-registration-dashboard-utpZ4` (o crea uno nuevo si no existe).
3. Mientras el PR está abierto, GitHub Actions deployará una **preview** automáticamente — un bot va a comentar en el PR con una URL temporal `https://kia-emlab-test-system--<id>.web.app`. Ábrela en tu tablet y prueba la cámara, instala como PWA, etc.
4. Cuando estés conforme, clic en **"Merge pull request"** → confirmar.
5. Eso dispara el deploy a producción. En ~30 segundos estará listo en **https://kia-emlab-test-system.web.app**.

---

## A partir de aquí

- **Cualquier cambio nuevo:** se hace en una branch, se abre PR, GitHub Actions deploya preview, mergeas, deploya a live. Cero terminal.
- **Para urgencias:** push directo a `main` también deploya solo (sin preview).
- **URL para el lab:** `https://kia-emlab-test-system.web.app` — esa la guardas en favoritos / la mandas por Teams a los técnicos.
- **Instalar como PWA:** abrir la URL en Chrome/Edge → menú ⋮ → "Instalar app" / "Agregar a pantalla de inicio". Aparece el icono KIA rojo en home.
- **Ver el progreso de cada deploy:** **https://github.com/jorgenunez0728/cascade-project/actions** — pestaña Actions del repo. Verde = ok, rojo = falló (clic para ver el error).

---

## Si algo sale mal

| Síntoma | Causa probable | Cómo arreglar |
|---|---|---|
| Action falla con "Permission denied" o "403" | El secret no se pegó completo o el nombre está mal | Repite Paso 2 y 3. Asegura que copiaste TODO el JSON (debe empezar con `{` y terminar con `}`) |
| Action falla con "Site Not Found" | Hosting no está activado en el proyecto | Repite Paso 1 |
| URL `https://kia-emlab-test-system.web.app` da 404 | Aún no se ha mergeado nada a `main` | Mergea un PR a main |
| La PWA no aparece para instalar | Caché del navegador | Cierra todas las tabs de Chrome → vuelve a abrir → la app va a registrar el SW + manifest. Aparece "Instalar" |
| Cámara dice "Permission denied" al abrir desde la URL | El permiso de cámara está bloqueado en Chrome | Toca el candado en la barra de URL → Permisos → Cámara → Permitir |

---

## Lo que NO necesitas hacer

- Instalar Firebase CLI
- Instalar Node.js
- Correr `firebase login`, `firebase init`, `firebase deploy`
- Correr `git commit` o `git push` desde la terminal (puedes editar archivos directo en el web de GitHub si quieres)
- Mantener actualizado nada local

Todo el build (correr `build.sh`, generar el unified HTML, comprimir, copiar a `dist/`, etc.) lo hace GitHub Actions en sus servidores cada vez que pusheas.
