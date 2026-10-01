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
