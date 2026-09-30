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

Nota de despliegue: la app todavía no llama a `/api/auth/login` (usa el token OAuth, no un ID token),
así que **no definas `PATIO_SESSION_SECRET` en producción** hasta conectar el login del cliente; sin la
variable, OCR y Grok siguen abiertos como hoy y responden `X-Patio-Auth: optional`.
Límites en memoria por instancia: OCR 60/min y Grok 30/min por email (por IP sin sesión); login 20/min por IP.

Claves: el login valida contra `ClaveHash` (columna S, bcrypt) si existe; si no, contra `Clave` (H) en texto
plano. Nunca se devuelven al cliente. Cada login (y cada intento denegado) se agrega a la pestaña `Auditoria`.

Migración del Sheet (solo agrega columnas/pestañas; no borra datos):

```bash
npm run migrate:fase0 -- --dry-run      # ver cambios
npm run migrate:fase0                   # aplicar (dry-run automático sin credenciales)
npm run migrate:fase0 -- --hash-claves  # además llena ClaveHash desde Clave
npm run test:fase0                      # pruebas de sesión, claves, permisos y handlers
```

Agrega `Movimientos!AE:AI` (`motivoParo, paradoDesde, zonaSlot, usuarioEmail, horaServidor`),
`Autorizados!S` (`ClaveHash`) y las pestañas `Auditoria`, `OrdenesTrabajo`, `OT_Eventos` (solo encabezados).
El script imprime cómo revertir.

```bash
npm install
npm run dev
npm run build && npm run preview
# con funciones:
npx netlify dev
```
