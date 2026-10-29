# Citas con QR en caseta

Transportistas, proveedores y visitas. Al crear la cita, el código (por ejemplo `CITA-1`) es el contenido del QR. En caseta se pega o se escribe y se valida una sola vez. Hay 12 horas de gracia después de la ETA.

```bash
npm run migrate:citas -- --dry-run
npm run migrate:citas
```

No se cambia `PatioBridge.gs`. Hace falta la vía de Sheets del patio. No hay secretos nuevos.
