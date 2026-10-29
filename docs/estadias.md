# Estadías por cliente

El reloj arranca cuando la conciliación de Frotcom ve la unidad **dentro** de una geocerca y todavía no hay una estadía abierta de esa placa. El cliente sale de la última entrada. Las horas libres salen de la fila `libre:<cliente>` (si no existe, 24).

El reporte está en KPIs: horas transcurridas y excedente.

```bash
npm run migrate:estadias -- --dry-run
npm run migrate:estadias
```

No se redespliega Apps Script. Hacen falta `FROTCOM_API_URL`, `FROTCOM_TOKEN` y `PATIO_GEOCERCAS_JSON` para que el reloj corra. Sin ellas la conciliación sigue en seco y no abre estadías.
