# Llantas

En Inventario se captura, por posición, número, DOT, profundidad y presión. La posición es DI, DD, TI, TD o REF.

Si el número o el DOT cambian respecto a la lectura anterior de esa placa y posición, y no hay una OT `ABIERTA` de esa unidad, se encola `LLANTA_SIN_OT`.

```bash
npm run migrate:llantas -- --dry-run
npm run migrate:llantas
```

No se cambia Apps Script. El aviso sale por WhatsApp o correo solo si esas variables ya están en Netlify; si no, queda en `AvisosLog`.
