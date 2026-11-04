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

## Supabase (importación y respaldo)

`SupabaseSync.gs` vive en el mismo proyecto. No cambia el Web App: se corre desde el editor y con un activador.

Propiedades del script, además de `PATIO_SECRET`: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. `PATIO_SPREADSHEET_ID` es opcional (si falta, usa el Sheet de Patio).

1. Aplicar `supabase/migrations/20261104030000_patio_tables.sql` en el proyecto Supabase (no toca las tablas que ya están).
2. Ejecutar `importarSheetsASupabase` (se puede repetir: hace upsert por llave y se salta pestañas que no existan).
3. Ejecutar `compararConteosSupabase`.
4. En Netlify, `DATA_BACKEND=dual` más las mismas `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Sin `dual`, el servidor sigue solo con el Sheet.
5. Ejecutar `instalarRespaldoDiario` una vez. A las 06:00 America/Chihuahua escribe pestañas `BAK_*` y no modifica las originales.
