# Variables de Netlify

Dónde se ponen: **Site settings → Environment variables** del sitio `patiocontrol`.
El repo no trae los valores. `.env.example` solo lista los nombres.

El código de login de servidor, WhatsApp y Frotcom ya está. Si la variable no está en Netlify, esa parte no se enciende y el patio sigue operando como hoy.

## Login de servidor

Hoy la tablet entra con correo y clave del kardex. Si el servidor responde 503 (faltan variables), valida el kardex en el navegador.

Para que `POST /api/auth/login` abra la cookie `patio_session` hacen falta **todas** estas:

| Variable | Obligatoria |
|---|---|
| `PATIO_SESSION_SECRET` | sí. Cadena aleatoria de al menos 32 caracteres. Generarla en la máquina del dueño; no commitearla. |
| `PATIO_SPREADSHEET_ID` | sí. Id del Sheet de producción. |
| Una vía de Sheets | sí. Cuenta de servicio **o** Apps Script. |

Cuenta de servicio (las dos):

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (el `private_key` del JSON; los `\n` literales se aceptan)

Apps Script (las dos, ver `apps-script/README.md`):

- `PATIO_APPS_SCRIPT_URL` (URL `/exec`)
- `PATIO_APPS_SCRIPT_SECRET` (el mismo que la propiedad de script `PATIO_SECRET`)

Si las dos vías están definidas, se usa la cuenta de servicio.

Opcionales de ese login:

| Variable | Si falta |
|---|---|
| `PATIO_GOOGLE_CLIENT_ID` | El camino correo+clave no la usa. Hace falta solo para el ID token de Google. |
| `PATIO_GOOGLE_HOSTED_DOMAIN` | No se filtra el dominio de Google. |
| `PATIO_SESSION_TTL_SEC` | La sesión dura 12 h. |
| `PATIO_ALLOWED_ORIGIN` | CORS responde `*`. Conviene `https://patiocontrol.netlify.app`. |
| `PATIO_DRIVE_FOLDER_ID` | Fotos en la carpeta que ya usa el sitio. |

## WhatsApp

El envío está en `netlify/functions/lib/avisosService.js`. Sin las dos variables, la fila se escribe en `AvisosLog` con `canal=log` y no sale de ahí.

| Variable | Obligatoria para enviar |
|---|---|
| `WHATSAPP_TOKEN` | sí |
| `WHATSAPP_PHONE_ID` | sí |
| `AVISOS_WHATSAPP_TO` | no. Destino si no hay fila activa en `AvisosSuscripciones`. |

No hace falta la aprobación de WhatsApp Business para dejar el registro en la hoja. Hace falta para que el mensaje salga.

## Frotcom

`proveedorGPS()` lee `FROTCOM_API_URL` y `FROTCOM_TOKEN`. Sin las dos, `POST /api/integraciones/frotcom/conciliar` responde `{ ok: true, dryRun: true, alertas: [] }` y no escribe.

| Variable | Obligatoria para conciliar de verdad |
|---|---|
| `FROTCOM_API_URL` | sí |
| `FROTCOM_TOKEN` | sí |
| `PATIO_GEOCERCAS_JSON` | no, pero sin geocercas no hay patio contra el cual comparar. Formato: `[{ "yardaId", "lat", "lng", "radioMetros" }]`. |
| `PATIO_INTEGRATION_KEY` | no para el cron de Netlify (manda `next_run`). Sí si alguien llama el POST a mano con `X-Patio-Key`. |

La ruta HTTP del stub es `/vehicles/last-positions`. El contrato real se cambia solo en `netlify/functions/lib/gpsProvider.js`.

## Correo, OCR y Grok

No bloquean el patio.

| Para | Variables | Si faltan |
|---|---|---|
| Correo de avisos | `SENDGRID_API_KEY` o `SMTP` / `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) | El aviso queda en `AvisosLog`. |
| Destino de correo | `AVISOS_EMAIL_TO` o `SMTP_TO` | Se usa la suscripción de la hoja, si existe. |
| Cron de avisos sin `next_run` | `AVISOS_CRON_SECRET` (header `X-Avisos-Cron`) | El cron de Netlify que manda `next_run` no la necesita. |
| Parado viejo | `PARADO_AGING_HORAS` | 48 h. |
| OCR de placas | `GOOGLE_VISION_API_KEY` o `GCP_VISION_API_KEY` | Captura manual. |
| ¿Dudas? / Grok | `XAI_API_KEY` o `GROK_API_KEY` | El botón no llama al modelo. |

## Qué revisar en producción

Este repo no puede leer los valores de Netlify. En el sitio, confirmar que existen los **nombres** (no hace falta abrir el valor):

1. Login de servidor: `PATIO_SESSION_SECRET`, `PATIO_SPREADSHEET_ID` y una vía de Sheets.
2. WhatsApp: `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID`.
3. Frotcom: `FROTCOM_API_URL` y `FROTCOM_TOKEN`.

`diagnosticoConfig` en `netlify/functions/lib/envCatalog.js` devuelve solo sí/no y la lista de nombres que faltan.
