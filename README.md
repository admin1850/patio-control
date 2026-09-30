# PatioControl

Control de accesos y salidas en yardas (Camir / API / Carbal-Pia).

- App en producción: https://patiocontrol.netlify.app
- Sheet: https://docs.google.com/spreadsheets/d/1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0/edit
- Evidencias Drive: https://drive.google.com/drive/folders/1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh

## OCR de placas

Tras cada foto de slot `silhouette: plate` (post `re(file, 1280, 0.72)`):

| Slot | Campo |
|------|--------|
| `placa-camion-frontal` | `placa` |
| `placa-camion-trasera` | `placaCamionTrasera` → `placasExtraJson` |
| `placa-caja-1-trasera` | `placaCaja1` |
| `placa-caja-2-trasera` | `placaCaja2` |

- Cliente: `src/lib/placaOcr.js` (`normalizePlacaMX`, `ocrPlacaFromDataUrl`)
- Función: `netlify/functions/ocr-placa.js`
- Env Netlify: `GOOGLE_VISION_API_KEY` (o `GCP_VISION_API_KEY`)
- Sin key → captura manual (mismo espíritu que Carta Porte / BarcodeDetector)

## Fase 0 backend

Base para que el navegador deje de hablar directo con Sheets/Drive. **Modo dual**: el login legado
(OAuth Google en el navegador + Sheets API) sigue funcionando igual; el backend corre en paralelo.

| Endpoint | Función |
|----------|---------|
| `POST /api/auth/login` `{ idToken, clave, dispositivoId }` | Google ID token → kardex Autorizados → cookie `patio_session` |
| `GET /api/auth/me` | Usuario de la sesión (cookie o `Authorization: Bearer`) o 401 |
| `POST /api/auth/logout` | Borra la cookie |
| `GET /api/movimientos?limit=500` | Lista movimientos (sesión). Solo lectura, más reciente primero |
| `POST /api/movimientos` | Alta **append-only** (sesión + permiso del `tipo`). Idempotente por `id`. Audita `crear_movimiento` |
| `POST /api/media/upload` | Sube JPEG/PNG **privado** a Drive (sesión). 120/min por email. Devuelve `{ fileId, viewPath }` |
| `GET /api/media?id=<fileId>` | Sirve esa evidencia con la cuenta de servicio (sesión). También `GET /api/media/<fileId>` |

Variables de entorno en Netlify (Site settings → Environment variables):

| Variable | Requerida | Uso |
|----------|-----------|-----|
| `PATIO_SESSION_SECRET` | sí (login) | Secreto HMAC de sesiones, ≥32 caracteres aleatorios (`openssl rand -base64 48`). **Al definirla, `/api/ocr-placa` y `/api/patio-grok` exigen sesión** (ver nota). |
| `PATIO_GOOGLE_CLIENT_ID` | sí (login) | OAuth Client ID web (el mismo de la pantalla Workspace); acepta varios separados por coma |
| `PATIO_GOOGLE_HOSTED_DOMAIN` | recomendado | p. ej. `camircapital.com`: solo cuentas de ese dominio |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | sí (login) | Cuenta de servicio con acceso **Editor** al Sheet |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | sí (login) | `private_key` del JSON de la cuenta de servicio (los `\n` literales se convierten) |
| `PATIO_SPREADSHEET_ID` | sí (login) | `1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0` |
| `PATIO_ALLOWED_ORIGIN` | recomendado | `https://patiocontrol.netlify.app` (lista por comas). Sin ella CORS responde `*` |
| `PATIO_SESSION_TTL_SEC` | no | Duración de sesión, default `43200` (12 h) |
| `PATIO_DRIVE_FOLDER_ID` | no | Carpeta de evidencias. Default `1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh`. Compártela con la cuenta de servicio como **Content manager** o Editor |

Flujo de conexión (pantalla Workspace): clave del kardex → **ID token de Google** (Google Identity
Services, `google.accounts.id.prompt`) → token OAuth de Sheets/Drive (sincronización legada, igual que
antes) → `POST /api/auth/login`. Si el backend responde 503 (variables faltantes) o no existe
(`npm run dev` sin `netlify dev`), la app valida el kardex en el navegador como antes. 401/403 del
backend sí bloquean la conexión. Al abrir la app, `GET /api/auth/me` recupera rol/permisos si hay sesión
(sin forzar modo nube). Desconectar también llama a `/api/auth/logout`.

Movimientos (`/api/movimientos`): con sesión de servidor la caseta intenta subir cada foto a
`POST /api/media/upload` (cuenta de servicio, archivo **privado**, sin permiso "anyone") y guarda en la
hoja la ruta `/api/media?id=…`. Quien abre la foto necesita sesión: `GET /api/media` la entrega con el
token de la cuenta de servicio (`alt=media`), no con un enlace público. Si ese upload responde 503/404
(Drive sin configurar, o `vite dev` sin funciones), se usa el upload legado del navegador a Drive.
Después se intenta el `POST` del movimiento. Si el API responde, **no** se vuelve a agregar la fila desde el
navegador (evita duplicados). Si el API no está (503 sin configurar, 404/405 en `vite dev` sin
`netlify dev`, u otra caída), se conserva el append directo a Sheets. Un 400/401/403/409 no cae al camino
legado ni entra a la cola offline: la regla del servidor se muestra en pantalla. Si el `POST` falla por
red y había sesión de servidor, el movimiento queda en el outbox IndexedDB (`src/lib/outbox.js`) y se
reintenta al volver en línea. Sin sesión de servidor, la cola sigue siendo `localStorage`
(`patio-control-offline-queue`). `fechaHora` es la hora
del dispositivo; `horaServidor` y `usuarioEmail` los escribe el servidor y el cliente no puede pisarlos.
El servidor no limpia la hoja. La sincronización de la lista (`en`) sigue leyendo Sheets; `listMovimientosServer`
queda listo para una fase posterior.

Fotos: comparte la carpeta de Evidencias con `GOOGLE_SERVICE_ACCOUNT_EMAIL` como Content manager (o Editor).
Sin ese permiso el upload de servidor responde 503 y la tablet vuelve al flujo legado. El service worker
usa `registerType: 'prompt'` y `skipWaiting: false`: si hay captura abierta (`window.__PATIO_CAPTURE_OPEN`)
u outbox pendiente, muestra «Actualización lista — reinicia al terminar» en lugar de recargar solo.

Nota de despliegue: puedes definir `PATIO_SESSION_SECRET` (y las demás variables) en un **Deploy
Preview** de Netlify para probar el login de servidor; con ella, OCR y Grok exigen sesión. Para
producción todavía falta: cuenta de servicio con acceso Editor al Sheet, `npm run migrate:fase0`, y
agregar el dominio del sitio en *Authorized JavaScript origins* del Client ID. Sin `PATIO_SESSION_SECRET`,
OCR y Grok siguen abiertos como hoy (`X-Patio-Auth: optional`) y el login cae al flujo legado.
Límites en memoria por instancia: OCR 60/min y Grok 30/min por email (por IP sin sesión); login 20/min por IP.

Claves: el login valida contra `ClaveHash` (columna S, bcrypt) si existe; si no, contra `Clave` (H) en texto
plano. Nunca se devuelven al cliente. Cada login (y cada intento denegado) se agrega a la pestaña `Auditoria`.

Migración del Sheet (solo agrega columnas/pestañas; no borra datos):

```bash
npm run migrate:fase0 -- --dry-run      # ver cambios
npm run migrate:fase0                   # aplicar (dry-run automático sin credenciales)
npm run migrate:fase0 -- --hash-claves  # además llena ClaveHash desde Clave
npm run test:fase0                      # auth + movimientos + Drive privado + outbox
npm run migrate:fase1 -- --dry-run      # pestañas OT reales + EstadoUnidad
npm run migrate:fase1
npm run test:fase1                      # OT, ETR, semáforo, bloqueo de salida
npm test                                # fase 0 + fase 1
```

Agrega `Movimientos!AE:AI` (`motivoParo, paradoDesde, zonaSlot, usuarioEmail, horaServidor`),
`Autorizados!S` (`ClaveHash`) y las pestañas `Auditoria`, `OrdenesTrabajo`, `OT_Eventos` (encabezados provisionales).
El script imprime cómo revertir.

## Fase 1 — órdenes de trabajo, ETR y bloqueo de salida

| Endpoint | Uso |
|----------|-----|
| `GET/POST /api/ot` | Lista y abre OT (ETR obligatorio; si ya hay una abierta de la unidad, se enlaza) |
| `PATCH /api/ot/:id` | Estatus, mover ETR (`motivo` obligatorio) o `{ cerrar: true }` |
| `GET /api/ot/tablero?yarda=` | Tablero En mantenimiento con semáforo |
| `POST /api/gate/validar-salida` | `PERMITIDO`, `BLOQUEADO` o `REQUIERE_AUTORIZACION` |

Estatus operativo de la unidad: `DISPONIBLE`, `EN_MANTENIMIENTO`, `DANADO_NO_OPERABLE`, `BAJA`. Solo cambia con evento (abrir/cerrar OT, daño, baja). La salida se bloquea si la unidad o la caja/dolly relacionada está en mantenimiento, dañada o de baja, salvo `TRASLADO_TALLER_EXTERNO` o autorización escrita de encargado/admin (queda en `OT_Eventos`).

`npm run migrate:fase1` crea `OrdenesTrabajo`, `OT_Eventos` y `EstadoUnidad` si no existen (solo encabezados). Si Fase 0 dejó encabezados provisionales y no hay filas, reescribe la fila 1. No limpia la hoja. Sin credenciales imprime el plan y cómo revertir.

En la tablet: pestaña **Taller**. Si el API responde 503, la caseta avisa «Sin validación de servidor» y deja registrar la salida.

```bash
npm install
npm run dev
npm run build && npm run preview
# con funciones:
npx netlify dev
```
