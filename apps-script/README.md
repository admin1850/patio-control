# Puente Apps Script (sin JSON de cuenta de servicio)

Netlify lee y escribe el Sheet (y las fotos) con un Web App. El script corre **como tú**. No se pega ningún JSON de cuenta de servicio.

El mismo secreto va en dos lados. No lo subas a git.

1. Abre el Sheet de Patio → **Extensiones → Apps Script**.
2. Pega `PatioBridge.gs` (borra el `Código.gs` de ejemplo si está vacío).
3. **Configuración del proyecto → Propiedades del script** → `PATIO_SECRET` = una cadena aleatoria (`openssl rand -base64 32`). Opcional: `PATIO_DRIVE_FOLDER_ID` si quieres un respaldo de la carpeta de evidencias.
4. **Implementar → Nueva implementación → Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
   - Autoriza Sheets y Drive cuando Google lo pida.
5. Copia la URL que termina en `/exec` (no uses `/dev`) y dásela a quien configura Netlify, o ponla tú en `PATIO_APPS_SCRIPT_URL`.
6. En Netlify, el mismo secreto es `PATIO_APPS_SCRIPT_SECRET`. `PATIO_SPREADSHEET_ID` ya está. El script abre ese id con `openById` (el Sheet tiene que ser tuyo o estar compartido contigo como editor).

La carpeta de evidencias tiene que ser accesible para la misma cuenta de Google. Las fotos se crean privadas: el script no las comparte con «cualquiera». Quien las ve es la sesión de Patio (`/api/media`).

El Web App no ve el header `Authorization`. El secreto viaja en `body.secret` (Netlify también manda `Authorization: Bearer`). Si `ok` es `false`, Netlify lo trata como error.

## Respaldo diario Supabase → Sheet

`SupabaseSync.gs` es otro proyecto de Apps Script. No lo pegues encima de PatioBridge y no lo publiques como Web App. Corre como **nestor.riggs@gmail.com**. No usa JSON de cuenta de servicio.

PatioControl no llama a Supabase. Los datos de la app siguen en el Sheet operativo (`1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0`). En la organización de Supabase solo está el proyecto `gnqsctwskvwpbhxcfwhq` (reloj-checador), con tablas de reloj y de App Chofer. No tiene tablas de patio. Este respaldo no apunta a ese proyecto: la URL va en una propiedad del script cuando exista un proyecto de Patio.

El catálogo que sí respalda es el de las pestañas que la app ya usa. Cada una se reescribe en `BAK_<tabla>` del Sheet de respaldo. El conteo es un GET con `Prefer: count=exact` y `Range: 0-0` (el total sale de `Content-Range`). UrlFetchApp no acepta HEAD. Una tabla vacía responde 416 con `*/0` y cuenta como 0. Si hay más de 1000 filas, se piden por páginas.

| Tabla | Para qué |
|-------|----------|
| `Autorizados` | Kardex de acceso (incluye Clave y ClaveHash: el Sheet de respaldo no se comparte) |
| `Movimientos` | Entradas, salidas, parados y bajas |
| `Equipos` | Catálogo de unidades |
| `Refrigeracion` | Catálogo Thermo y horómetro |
| `Auditoria` | Bitácora de acciones |
| `OrdenesTrabajo` | Órdenes de taller, ETR y costos |
| `OT_Eventos` | Cambios de OT y autorizaciones de salida |
| `EstadoUnidad` | Estatus operativo, zona y carga |
| `ZonasSlots` | Slots por yarda |
| `ConteosFisicos` | Conteos físicos |
| `Defectos` | Daños nuevos de la salida |
| `PlanPreventivo` | Intervalos de servicio por tipo de unidad |
| `ServicioProgramado` | Próximo servicio de cada unidad |
| `AvisosLog` | Avisos enviados o solo registrados |
| `AvisosSuscripciones` | Destinos de WhatsApp y correo |
| `LlegadasEsperadas` | Preavisos de App Chofer |

`BAK__resumen` guarda la última corrida (tabla, filas, estado). No es una tabla de Supabase.

1. Entra a [script.google.com](https://script.google.com) con **nestor.riggs@gmail.com** → **Nuevo proyecto**.
2. Borra el `Código.gs` de ejemplo y pega `SupabaseSync.gs`.
3. **Configuración del proyecto** → zona horaria **America/Ciudad de México**.
4. **Propiedades del script** (nada de esto va en git):
   - `SUPABASE_URL` = `https://<ref>.supabase.co` (sin `/rest/v1` y sin la llave)
   - `SUPABASE_SERVICE_ROLE_KEY` = la llave `service_role` de ese proyecto
   - `BACKUP_SPREADSHEET_ID` = un Sheet **nuevo**, de esa cuenta. No uses el Sheet operativo.
5. Elige `respaldoSupabaseDryRun` → **Ejecutar**. Autoriza Sheets y las solicitudes externas. No escribe celdas. En el registro tiene que verse el conteo de cada tabla.
6. Elige `instalarRespaldoDiario` → **Ejecutar**. Deja un trigger diario de `respaldoSupabaseASheets` entre las 06:00 y las 07:00 (America/Mexico_City). Si lo vuelves a correr, reemplaza ese trigger y no toca otros.
7. Elige `respaldoSupabaseASheets` → **Ejecutar** una vez para el primer respaldo. Revisa las pestañas `BAK_*` y `BAK__resumen`.

El script solo hace GET. No hay migraciones ni escrituras a Supabase. Si una tabla no existe en ese proyecto, el conteo queda en error y las demás siguen. En la corrida real, al final se lanza un error para que el trigger avise.
