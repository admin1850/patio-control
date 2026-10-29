# Documentos por vencer

Unidad y operador: licencia, seguro, tarjeta de circulación, verificación físico-mecánica, emisiones y permiso SICT.

La captura está en **Equipos**, arriba del catálogo. La fecha se guarda en la pestaña `Vigencias`.

- A 30 días y a 15 días entra un aviso `DOC_POR_VENCER` (el mismo canal que el resto: `AvisosLog` y, si está configurado, WhatsApp o correo).
- El día del vencimiento la salida queda `BLOQUEADO` o `REQUIERE_AUTORIZACION`. El encargado o admin puede autorizarla con el motivo que ya usa el gate. No es un bloqueo duro como el de kilómetros.

## Deploy

No hay que volver a pegar Apps Script. `PatioBridge.gs` ya escribe cualquier pestaña.

```bash
npm run migrate:vigencias -- --dry-run
npm run migrate:vigencias
```

Sin credenciales el comando solo imprime el plan y cómo revertir. Con cuenta de servicio o con `PATIO_APPS_SCRIPT_URL` + `PATIO_APPS_SCRIPT_SECRET` crea la pestaña si no existe. No borra filas.

Si la pestaña no está, la salida sigue igual (no se bloquea por un documento que nadie capturó).
