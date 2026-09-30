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
| `GET /api/movimientos?limit=500` | Lista movimientos (sesión). Solo lectura, más reciente primero. Con sesión de servidor el refresh del patio usa esta lista |
| `GET /api/estado-unidades` | Filas de `EstadoUnidad` (sesión) para los chips del patio |
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
Después se intenta el `POST` del movimiento. Si hay sesión de servidor, **no** se agrega la fila desde el
navegador (ni cuando el API responde ni cuando está caído: el registro queda en cola). Si no hay sesión
de servidor y el API no está (503 sin configurar, 404/405 en `vite dev` sin `netlify dev`, u otra caída),
se conserva el append directo a Sheets. Un 400/401/403/409 no cae al camino legado ni entra a la cola
offline: la regla del servidor se muestra en pantalla. Si el `POST` falla por red y había sesión de
servidor, el movimiento queda en el outbox IndexedDB (`src/lib/outbox.js`) y se reintenta al volver en
línea. Sin sesión de servidor, la cola sigue siendo `localStorage` (`patio-control-offline-queue`).
`fechaHora` es la hora del dispositivo; `horaServidor` y `usuarioEmail` los escribe el servidor y el
cliente no puede pisarlos. El servidor no limpia la hoja.

Con `sesionServidor`, Actualizar datos y la recuperación de sesión leen `GET /api/movimientos` (y
`GET /api/estado-unidades` para los chips). Equipos y refrigeración siguen en Sheets. Si ese GET no está
(503/404), la lista de movimientos vuelve a Sheets para no trabar la caseta. Workspace **sin** sesión de
servidor —solo OAuth de Sheets, antes de que Netlify tenga las variables— mantiene ese híbrido.
**Modo Local sin sesión de servidor es solo lectura**: se ve el dashboard y el historial desde la caché
de este dispositivo, pero no se registra entrada, salida, parado, baja ni se edita el catálogo. El aviso
es «Conecta Cloud con tu cuenta autorizada para registrar». Cloud sigue en el menú para poder entrar.

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
npm run test:fase0                      # auth + movimientos + Drive privado + outbox + cierre (Local solo lectura)
npm run migrate:fase1 -- --dry-run      # pestañas OT reales + EstadoUnidad
npm run migrate:fase1
npm run test:fase1                      # OT, ETR, semáforo, bloqueo de salida
npm run migrate:fase3 -- --dry-run      # pestaña Defectos
npm run test:fase3                      # sello ciego, documentos, Thermo y daños
npm run test:fase4                      # preventivo, avisos y KPIs
npm run migrate:fase5 -- --dry-run      # columna viajeId (AJ) + pestaña LlegadasEsperadas
npm run test:fase5                      # App Chofer, Frotcom y ERP
npm test                                # fase 0 a fase 5
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

## Fase 3 — salida fuerte

`POST /api/gate/validar-salida` sigue respondiendo `PERMITIDO`, `BLOQUEADO` (con `motivos[]`) o `REQUIERE_AUTORIZACION`. Además del bloqueo de mantenimiento/baja:

- Sello ciego: el cliente envía `selloCapturado`. El servidor lo compara con la entrada y no devuelve el sello esperado.
- Km: si viene, no puede ser menor al último registro (tampoco con override).
- Carta Porte (UUID) y licencia federal, salvo autorización del encargado.
- Caja refrigerada: set point, temperatura real, diésel y horómetro. Si la temperatura se aleja más de 2°C o el diésel es menor a 25, pide autorización.
- `validadoGate` lo escribe el servidor. Un `true` del cliente no cuenta.

En la salida corta no se muestra el sello de entrada ni se rellenan km/diésel. Cada ángulo de daño se marca `SIN_CAMBIO` o `DANO_NUEVO`; el daño nuevo puede abrir una OT `CORRECTIVO`. `npm run migrate:fase3` agrega la pestaña `Defectos` (solo encabezados, no borra filas). Si el API responde 503, la caseta avisa y deja registrar.

## Fase 4 — preventivo, avisos y KPIs

`npm run migrate:fase4` solo agrega encabezados (no borra filas):

| Pestaña | Columnas |
|---------|----------|
| `PlanPreventivo` | tipoUnidad, cadaKm, cadaDias, cadaHorasThermo, avisoPct |
| `ServicioProgramado` | id, unidadId, planId, proximoKm, proximaFecha, proximoHorometro, estatus (`PENDIENTE` \| `AVISO` \| `VENCIDO` \| `HECHO`), otId |
| `AvisosLog` | id, tipo, yarda, unidadId, canal, estatus, destino, mensaje, dedupeKey, horaServidor, detalle |
| `AvisosSuscripciones` | id, tipo, yarda, canal, destino, activo |

| Endpoint | Uso |
|----------|-----|
| `GET /api/preventivo/proximos?yarda=` | Próximos servicios con semáforo (verde en tiempo, amarillo aviso, rojo vencido) |
| `POST /api/preventivo/ot` | Abre OT `PREVENTIVO` de un servicio en aviso o vencido |
| `POST /api/preventivo/planes` | Alta o actualización del plan por tipo de unidad |
| `GET /api/kpis?yarda=&desde=&hasta=` | Disponibilidad, downtime/MTTR, % de OT dentro del ETR original, dwell |
| `GET /api/kpis?format=csv` | El mismo resumen en CSV |
| `POST /api/avisos/resumen-diario` | Resumen por yarda (manual; encargado o admin) |
| `POST /api/avisos/revisar-etr` | Revisa ETR vencidos del tablero y los encola |
| `POST /api/avisos/suscripciones` | Destino de WhatsApp o correo |

Al crear un movimiento con km u horómetro, el servidor recalcula el servicio del tipo de unidad. Si las pestañas no existen (503), el movimiento **sí se guarda** y la respuesta trae un aviso. En Taller, la sección **Preventivo** lista los próximos y tiene el botón **Abrir OT**. Si el API no está, el taller sigue igual.

El semáforo del preventivo usa `avisoPct` (default 80): al consumir ese porcentaje del intervalo pasa a aviso; al llegar al próximo km, fecha u horómetro, a vencido. Cerrar la OT marca el servicio `HECHO` y programa el siguiente.

### Avisos

Tipos: `ETR_VENCIDA`, `UNIDAD_LISTA`, `SELLO_DISTINTO`, `OVERRIDE_GATE`, `PARADO_AGING`, `THERMO_FUERA`, `PREVENTIVO_VENCIDO`, `RESUMEN_DIARIO`.

Siempre se escribe `AvisosLog`. Si están `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID`, o `SENDGRID_API_KEY`, o `SMTP` / `SMTP_HOST`, se intenta el envío al destino de `AvisosSuscripciones` (o a `AVISOS_WHATSAPP_TO` / `AVISOS_EMAIL_TO`). Si no hay canal, la fila queda `canal=log`. No hace falta la aprobación de WhatsApp Business para dejar el stub listo.

El tablero de OT encola `ETR_VENCIDA` cuando el ETR ya venció (una vez por OT y día). La función programada `avisos-diario` corre `0 13 * * *` (07:00 hora del centro, UTC−6). Netlify la dispara con `{ "next_run" }`. A mano: `POST /api/avisos/resumen-diario`.

| Variable | Uso |
|----------|-----|
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | WhatsApp Cloud API |
| `AVISOS_WHATSAPP_TO` | Destino si no hay suscripción |
| `SENDGRID_API_KEY`, `SENDGRID_FROM` o `SMTP_FROM` | Correo por SendGrid |
| `SMTP` o `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Correo SMTP |
| `AVISOS_EMAIL_TO` o `SMTP_TO` | Destino si no hay suscripción |
| `AVISOS_CRON_SECRET` | Opcional, header `X-Avisos-Cron` si el cron no manda `next_run` |
| `PARADO_AGING_HORAS` | Horas para avisar un parado (default 48) |

### KPIs

`GET /api/kpis` (permiso de KPIs en el kardex):

- **Disponibilidad %** — `100 × (1 − horas de downtime / (unidades × horas del periodo))`, entre 0 y 100. Unidades: `EstadoUnidad` que no están en baja.
- **Downtime / MTTR** — downtime es el traslape de las OT (cerradas y abiertas) con el periodo. MTTR es el promedio de horas de las OT cerradas en el periodo.
- **% OT dentro del ETR original** — cerradas cuya `fechaLiberada` no pasa de `etrOriginal` (o del ETR si no se movió).
- **Dwell** — ciclos entrada→salida. Si ambas traen `horaServidor`, se usa esa hora; si no, `fechaHora`.

En la página de KPIs, las tarjetas nuevas aparecen cuando el API responde. Si no (local, 503, sin sesión), se quedan los KPIs que ya calculaba el dispositivo.

```bash
npm run migrate:fase4 -- --dry-run
npm run test:fase4
npm run test:fase5
npm test                                # fase 0 + fase 1 + fase 2 + fase 3 + fase 4 + fase 5
```

## Fase 5 — App Chofer, Frotcom y ERP (stubs)

Los tres canales hablan con PatioControl. PatioControl no exige sus credenciales para operar: sin llave externa el patio sigue igual y Frotcom responde en seco.

Auth de `/api/integraciones/*`: cookie `patio_session` (o `Authorization: Bearer`) **o** header `X-Patio-Key` con el valor de `PATIO_INTEGRATION_KEY`. Si no hay secreto de sesión ni llave, la auth queda opcional (mismo modo dual que el resto).

`npm run migrate:fase5` solo agrega (no borra filas):

| Dónde | Qué |
|-------|-----|
| `Movimientos!AJ` | `viajeId` opcional. Si la cuadrícula no llega a AJ, el movimiento se guarda igual y el viajeId se omite |
| `LlegadasEsperadas` | id, viajeId, placas, cajasJson, dolly, sello, cartaPorte, eta, yardaId, horaServidor, estatus (`PENDIENTE` \| `RECIBIDA`) |

### App Chofer

App Chofer hace el POST cuando el viaje va a la yarda. PatioControl no la llama.

```http
POST /api/integraciones/chofer/preaviso
X-Patio-Key: <PATIO_INTEGRATION_KEY>
Content-Type: application/json

{
  "viajeId": "VJ-100",
  "placas": ["ABC123A"],
  "cajas": ["CAJA1"],
  "dolly": "DOLLY1",
  "sello": "SELLO1",
  "cartaPorte": "uuid-carta",
  "eta": "2026-09-30T18:30:00.000Z",
  "yardaId": "chihuahua"
}
```

El mismo `viajeId` actualiza la fila (no duplica). `GET /api/integraciones/chofer/preaviso` lista las pendientes para el panel **Llegadas esperadas** (solo si hay filas). `GET /api/integraciones/chofer/preaviso?q=` acepta el viajeId, un JSON `{"viajeId":"…"}` o una URL con `?viajeId=`. La respuesta trae `match.selloEsperado` para rellenar el sello en la entrada. Al guardar la entrada con ese `viajeId`, el preaviso pasa a `RECIBIDA`.

En la entrada, el campo **viajeId o texto del QR** es opcional: al pegar el QR se consulta ese GET y, si hay match, se llena el sello esperado.

### Frotcom

`proveedorGPS()` en `netlify/functions/lib/gpsProvider.js` es el contrato. El stub de Frotcom lee `FROTCOM_API_URL` y `FROTCOM_TOKEN`. Sin las dos, `POST /api/integraciones/frotcom/conciliar` responde `{ ok: true, dryRun: true, alertas: [] }` y no escribe nada.

Con credenciales, compara la última posición contra `Movimientos` en ±30 min y las geocercas de `PATIO_GEOCERCAS_JSON`:

```json
[{ "yardaId": "chihuahua", "lat": 28.635, "lng": -106.089, "radioMetros": 500 }]
```

| Alerta en `AvisosLog` | Cuándo |
|----------------------|--------|
| `MOV_NO_REGISTRADO` | El GPS está dentro de la geocerca y no hay entrada/salida de esa unidad en ±30 min |
| `SIN_CONFIRMACION_GPS` | Hay entrada o salida en los últimos 30 min y el GPS no la confirma dentro de la geocerca |

La función `frotcom-conciliar` también corre `*/30 * * * *` (Netlify manda `{ "next_run" }`). A mano: el POST con sesión o `X-Patio-Key`.

La ruta HTTP (`/vehicles/last-positions`) y el JSON son un stub. El contrato real de Frotcom se cambia solo en `gpsProvider.js`.

### ERP (sys.carbalmotors.com)

Pull diario, no hay push. Una vez al día (después de las 07:00, hora del centro) el ERP pide el día anterior:

```http
GET /api/integraciones/erp/costos-ot.csv?desde=2026-09-29&hasta=2026-09-29
X-Patio-Key: <PATIO_INTEGRATION_KEY>
```

CSV: `unidad, otFolio, fecha, concepto, importe, proveedor`. Conceptos: `refacciones`, `mano de obra`, `externo` (o `estimado` si esos tres no vienen). `fecha` es la de liberación, lista o entrada a taller, en calendario de América/México. `desde` y `hasta` son `YYYY-MM-DD` e inclusivos; si se omiten, salen todas las OT con costo.

### Variables

| Variable | Uso |
|----------|-----|
| `PATIO_INTEGRATION_KEY` | Valor del header `X-Patio-Key` para App Chofer, Frotcom y el ERP. En Netlify: Site settings → Environment variables. No se muestra en la tablet |
| `FROTCOM_API_URL`, `FROTCOM_TOKEN` | Stub GPS. Sin ellas, conciliación en seco |
| `PATIO_GEOCERCAS_JSON` | Geocercas por yarda (lat, lng, radioMetros) |

En Cloud, un admin ve el recordatorio de dónde vive `PATIO_INTEGRATION_KEY`. La llave no se guarda en el dispositivo.

WhatsApp sigue como en Fase 4: sin `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID` las alertas nuevas quedan en `AvisosLog` con `canal=log`.

```bash
npm run migrate:fase5 -- --dry-run
npm run test:fase5
npm test
```

```bash
npm install
npm run dev
npm run build && npm run preview
# con funciones:
npx netlify dev
```
