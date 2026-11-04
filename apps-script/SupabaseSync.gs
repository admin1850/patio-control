/**
 * SupabaseSync — importación y respaldo de PatioControl.
 *
 * Pegar este archivo en el mismo proyecto de Apps Script que PatioBridge.gs.
 * No reemplaza al puente: el Web App sigue hablando con el Sheet.
 *
 * Propiedades del script:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   PATIO_SPREADSHEET_ID  (opcional; si falta se usa el Sheet de Patio)
 *
 * Desde el editor:
 *   importarSheetsASupabase     hoja → Supabase (upsert por llave; se puede repetir)
 *   compararConteosSupabase     filas con llave vs conteo de Supabase
 *   instalarRespaldoDiario      06:00 America/Chihuahua → respaldoSupabaseASheets
 *   respaldoSupabaseASheets     Supabase → pestañas BAK_* (nunca pisa las originales)
 *
 * UrlFetchApp no implementa HEAD. El conteo es GET con Prefer: count=exact y Range: 0-0.
 */
var PATIO_SHEET_DEFAULT = '1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0';
var PATIO_TABLES = [
  {
    "sheet": "Autorizados",
    "table": "patio_autorizados",
    "pk": "email",
    "normalizePk": "lower",
    "headerAliases": [
      "email",
      "correo",
      "correoelectronico",
      "e-mail"
    ],
    "columns": [
      "email",
      "nombre",
      "apellido",
      "celular",
      "whatsapp",
      "rol",
      "ubicacion",
      "clave",
      "activo",
      "entrada",
      "salida",
      "parado",
      "baja",
      "historial",
      "kpis",
      "equipos",
      "workspace",
      "notas",
      "claveHash"
    ]
  },
  {
    "sheet": "Movimientos",
    "table": "patio_movimientos",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "tipo",
      "equipoId",
      "placa",
      "numeroEconomico",
      "equipoTipo",
      "fechaHora",
      "operador",
      "chofer",
      "origenDestino",
      "kilometros",
      "dieselPorcentaje",
      "dieselLitros",
      "checklistJson",
      "fotosUrls",
      "condicionGeneral",
      "observaciones",
      "creadoEn",
      "yardaId",
      "selloNumero",
      "firmaNombre",
      "firmaUrl",
      "geoLat",
      "fotosEvidenciaJson",
      "geoLng",
      "cumplimientoJson",
      "placasExtraJson",
      "empresaId",
      "refrigeradaJson",
      "whatsapp",
      "motivoParo",
      "paradoDesde",
      "zonaSlot",
      "usuarioEmail",
      "horaServidor",
      "viajeId"
    ]
  },
  {
    "sheet": "Equipos",
    "table": "patio_equipos",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "tipo",
      "placa",
      "numeroEconomico",
      "marca",
      "modelo",
      "notas",
      "creadoEn",
      "operadorAsignado"
    ]
  },
  {
    "sheet": "Refrigeracion",
    "table": "patio_refrigeracion",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "marca",
      "modelo",
      "numeroActivo",
      "economicoMontado",
      "horometro",
      "estatus",
      "notas",
      "creadoEn"
    ]
  },
  {
    "sheet": "Auditoria",
    "table": "patio_auditoria",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "horaServidor",
      "usuarioEmail",
      "rol",
      "accion",
      "entidad",
      "entidadId",
      "antes",
      "despues",
      "dispositivoId"
    ]
  },
  {
    "sheet": "OrdenesTrabajo",
    "table": "patio_ordenes_trabajo",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "folio",
      "unidadId",
      "unidadesRelacionadasJson",
      "yarda",
      "tipo",
      "motivo",
      "prioridad",
      "tallerTipo",
      "proveedorId",
      "ubicacionTaller",
      "responsableEmail",
      "reportadoPor",
      "fechaEntradaTaller",
      "etr",
      "fechaLista",
      "fechaLiberada",
      "estatus",
      "kmEntrada",
      "kmSalida",
      "horometroEntrada",
      "horometroSalida",
      "costoEstimado",
      "costoRefacciones",
      "costoManoObra",
      "costoExterno",
      "factura",
      "refaccionesJson",
      "fotosAntesJson",
      "fotosDespuesJson",
      "notas",
      "movimientoOrigenId",
      "etrOriginal",
      "etrMovimientosCount",
      "activo"
    ]
  },
  {
    "sheet": "OT_Eventos",
    "table": "patio_ot_eventos",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "otId",
      "tipoEvento",
      "valorAnterior",
      "valorNuevo",
      "motivo",
      "usuarioEmail",
      "horaServidor",
      "rol",
      "dispositivoId"
    ]
  },
  {
    "sheet": "EstadoUnidad",
    "table": "patio_estado_unidad",
    "pk": "unidad_id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "unidadId",
      "tipo",
      "yarda",
      "zona",
      "slot",
      "ubicacion",
      "estatusOperativo",
      "estatusCarga",
      "desde",
      "otAbiertaId",
      "actualizadoEn",
      "clienteCarga",
      "folioCarga",
      "enganchadaA"
    ]
  },
  {
    "sheet": "ZonasSlots",
    "table": "patio_zonas_slots",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "yardaId",
      "zona",
      "slot",
      "tipo",
      "capacidad",
      "activo"
    ]
  },
  {
    "sheet": "ConteosFisicos",
    "table": "patio_conteos_fisicos",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "yardaId",
      "zona",
      "iniciadoEn",
      "cerradoEn",
      "usuarioEmail",
      "resumenJson",
      "activo"
    ]
  },
  {
    "sheet": "Defectos",
    "table": "patio_defectos",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "movimientoId",
      "equipoId",
      "angulo",
      "tipo",
      "fotosJson",
      "otId",
      "usuarioEmail",
      "horaServidor"
    ]
  },
  {
    "sheet": "PlanPreventivo",
    "table": "patio_plan_preventivo",
    "pk": "tipo_unidad",
    "normalizePk": "lower",
    "headerAliases": [],
    "columns": [
      "tipoUnidad",
      "cadaKm",
      "cadaDias",
      "cadaHorasThermo",
      "avisoPct"
    ]
  },
  {
    "sheet": "ServicioProgramado",
    "table": "patio_servicio_programado",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "unidadId",
      "planId",
      "proximoKm",
      "proximaFecha",
      "proximoHorometro",
      "estatus",
      "otId"
    ]
  },
  {
    "sheet": "AvisosLog",
    "table": "patio_avisos_log",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "tipo",
      "yarda",
      "unidadId",
      "canal",
      "estatus",
      "destino",
      "mensaje",
      "dedupeKey",
      "horaServidor",
      "detalle"
    ]
  },
  {
    "sheet": "AvisosSuscripciones",
    "table": "patio_avisos_suscripciones",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "tipo",
      "yarda",
      "canal",
      "destino",
      "activo"
    ]
  },
  {
    "sheet": "LlegadasEsperadas",
    "table": "patio_llegadas_esperadas",
    "pk": "id",
    "normalizePk": "",
    "headerAliases": [],
    "columns": [
      "id",
      "viajeId",
      "placas",
      "cajasJson",
      "dolly",
      "sello",
      "cartaPorte",
      "eta",
      "yardaId",
      "horaServidor",
      "estatus"
    ]
  }
];

function patioTablas() {
  return PATIO_TABLES;
}

function toSnake(header) {
  return String(header == null ? '' : header)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function normHeader(value) {
  return toSnake(String(value == null ? '' : value).trim()).replace(/_/g, '');
}

function textoCelda(value) {
  if (value == null || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    var tz = Session.getScriptTimeZone() || 'America/Chihuahua';
    return Utilities.formatDate(value, tz, "yyyy-MM-dd'T'HH:mm:ss");
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizePk(tabla, value) {
  var raw = String(value == null ? '' : value).trim();
  if (tabla && tabla.normalizePk === 'lower') return raw.toLowerCase();
  return raw;
}

function rowToRecord(tabla, row) {
  var record = {};
  for (var i = 0; i < tabla.columns.length; i++) {
    var cell = row && i < row.length ? row[i] : '';
    record[toSnake(tabla.columns[i])] = textoCelda(cell);
  }
  record[tabla.pk] = normalizePk(tabla, record[tabla.pk]);
  return record;
}

function isBlankRow(row) {
  if (!row || !row.length) return true;
  for (var i = 0; i < row.length; i++) {
    if (String(row[i] == null ? '' : row[i]).trim() !== '') return false;
  }
  return true;
}

function looksLikeHeader(tabla, row) {
  if (!row || !row.length) return false;
  var matches = 0;
  var limit = Math.min(tabla.columns.length, row.length, 4);
  for (var i = 0; i < limit; i++) {
    var cell = normHeader(row[i]);
    if (!cell) continue;
    if (cell === normHeader(tabla.columns[i])) matches += 1;
  }
  if (matches >= 2) return true;
  var first = normHeader(row[0]);
  var second = normHeader(row[1]);
  var aliases = tabla.headerAliases || [];
  for (var a = 0; a < aliases.length; a++) {
    if (aliases[a] === first && second === normHeader(tabla.columns[1])) return true;
  }
  return false;
}

function prepararFilas(tabla, rows) {
  var byPk = {};
  var order = [];
  var duplicados = 0;
  var omitidas = 0;
  var list = rows || [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    if (isBlankRow(row) || looksLikeHeader(tabla, row)) {
      omitidas += 1;
      continue;
    }
    var record = rowToRecord(tabla, row);
    if (!record[tabla.pk]) {
      omitidas += 1;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(byPk, record[tabla.pk])) duplicados += 1;
    else order.push(record[tabla.pk]);
    byPk[record[tabla.pk]] = record;
  }
  var records = [];
  for (var k = 0; k < order.length; k++) records.push(byPk[order[k]]);
  return { records: records, duplicados: duplicados, omitidas: omitidas };
}

function parseContentRange(header) {
  var raw = String(header == null ? '' : header).trim();
  var match = /\/(\d+)\s*$/.exec(raw);
  if (!match) throw new Error('Content-Range inválido: ' + (raw || '(vacío)'));
  return Number(match[1]);
}

function nombreBak(sheetName) {
  var name = String(sheetName || '');
  if (!name || name.indexOf('BAK_') === 0) {
    throw new Error('El respaldo no puede usar la pestaña original ni otra BAK_: ' + name);
  }
  return 'BAK_' + name;
}

function hojaBak(ss, sheetName) {
  var name = nombreBak(sheetName);
  if (name === sheetName) throw new Error('El respaldo no puede escribir la pestaña original ' + sheetName);
  var original = ss.getSheetByName(sheetName);
  var bak = ss.getSheetByName(name);
  if (!bak) bak = ss.insertSheet(name);
  if (original && bak.getSheetId() === original.getSheetId()) {
    throw new Error('El respaldo apuntó a la pestaña original ' + sheetName);
  }
  if (bak.getName() !== name || bak.getName().indexOf('BAK_') !== 0) {
    throw new Error('Nombre de respaldo inesperado: ' + bak.getName());
  }
  return bak;
}

function supabaseConfig() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/+$/, '');
  var key = String(props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '');
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Propiedades del script.');
  }
  return { url: url, key: key };
}

function abrirPatio() {
  var id = PropertiesService.getScriptProperties().getProperty('PATIO_SPREADSHEET_ID') || PATIO_SHEET_DEFAULT;
  return SpreadsheetApp.openById(String(id).trim());
}

function leerFilas(sheet, width) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];
  var cols = Math.max(width, sheet.getLastColumn(), 1);
  var values = sheet.getRange(1, 1, lastRow, cols).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var row = [];
    for (var c = 0; c < width; c++) row.push(textoCelda(c < values[r].length ? values[r][c] : ''));
    out.push(row);
  }
  return out;
}

function subirEnLotes(cfg, tabla, records) {
  var size = 100;
  for (var i = 0; i < records.length; i += size) {
    var batch = records.slice(i, i + size);
    var url = cfg.url + '/rest/v1/' + tabla.table + '?on_conflict=' + encodeURIComponent(tabla.pk);
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: {
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      payload: JSON.stringify(batch),
    });
    var code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Upsert ' + tabla.table + ' HTTP ' + code + ' ' + String(res.getContentText() || '').slice(0, 200));
    }
  }
}

function importarSheetsASupabase() {
  var cfg = supabaseConfig();
  var ss = abrirPatio();
  var resumen = [];
  for (var i = 0; i < PATIO_TABLES.length; i++) {
    var tabla = PATIO_TABLES[i];
    var sheet = ss.getSheetByName(tabla.sheet);
    if (!sheet) {
      Logger.log('Se omite ' + tabla.sheet + ' (la pestaña no existe).');
      resumen.push({ sheet: tabla.sheet, table: tabla.table, omitida: true });
      continue;
    }
    var preparado = prepararFilas(tabla, leerFilas(sheet, tabla.columns.length));
    subirEnLotes(cfg, tabla, preparado.records);
    Logger.log(tabla.sheet + ' → ' + tabla.table + ' ' + preparado.records.length);
    resumen.push({
      sheet: tabla.sheet,
      table: tabla.table,
      subidas: preparado.records.length,
      duplicados: preparado.duplicados,
      omitidas: preparado.omitidas,
    });
  }
  Logger.log(JSON.stringify(resumen));
  return resumen;
}

function contarSupabase(cfg, tabla) {
  var url = cfg.url + '/rest/v1/' + tabla.table + '?select=' + encodeURIComponent(tabla.pk);
  // UrlFetchApp no soporta HEAD. Prefer count=exact + Range 0-0 devuelve Content-Range.
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      Accept: 'application/json',
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  var code = res.getResponseCode();
  if (code !== 200 && code !== 206 && code !== 416) {
    throw new Error('Conteo ' + tabla.table + ' HTTP ' + code + ' ' + String(res.getContentText() || '').slice(0, 200));
  }
  var headers = res.getHeaders() || {};
  var range = headers['Content-Range'] || headers['content-range'] || headers['Content-range'] || '';
  return parseContentRange(range);
}

function compararConteosSupabase() {
  var cfg = supabaseConfig();
  var ss = abrirPatio();
  var out = [];
  for (var i = 0; i < PATIO_TABLES.length; i++) {
    var tabla = PATIO_TABLES[i];
    var sheet = ss.getSheetByName(tabla.sheet);
    if (!sheet) {
      out.push({ sheet: tabla.sheet, table: tabla.table, omitida: true });
      continue;
    }
    var preparado = prepararFilas(tabla, leerFilas(sheet, tabla.columns.length));
    var enSupabase = contarSupabase(cfg, tabla);
    out.push({
      sheet: tabla.sheet,
      table: tabla.table,
      enHoja: preparado.records.length,
      enSupabase: enSupabase,
      duplicados: preparado.duplicados,
      igual: preparado.records.length === enSupabase,
    });
  }
  Logger.log(JSON.stringify(out));
  return out;
}

function registroAFila(tabla, registro) {
  var fila = [];
  for (var i = 0; i < tabla.columns.length; i++) {
    var value = registro[toSnake(tabla.columns[i])];
    var text = value == null ? '' : String(value);
    fila.push(text.charAt(0) === '=' ? "'" + text : text);
  }
  return fila;
}

function escribirBak(ss, tabla, registros) {
  var bak = hojaBak(ss, tabla.sheet);
  bak.clearContents();
  var filas = [tabla.columns.slice()];
  for (var i = 0; i < registros.length; i++) filas.push(registroAFila(tabla, registros[i]));
  var chunk = 500;
  for (var start = 0; start < filas.length; start += chunk) {
    var slice = filas.slice(start, start + chunk);
    bak.getRange(start + 1, 1, slice.length, tabla.columns.length).setValues(slice);
  }
  return bak.getName();
}

function leerTablaSupabase(cfg, tabla) {
  var cols = [];
  for (var c = 0; c < tabla.columns.length; c++) cols.push(toSnake(tabla.columns[c]));
  var pageSize = 1000;
  var from = 0;
  var all = [];
  while (true) {
    var to = from + pageSize - 1;
    var url =
      cfg.url +
      '/rest/v1/' +
      tabla.table +
      '?select=' +
      encodeURIComponent(cols.join(',')) +
      '&order=' +
      encodeURIComponent(tabla.pk + '.asc');
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        apikey: cfg.key,
        Authorization: 'Bearer ' + cfg.key,
        Accept: 'application/json',
        Range: from + '-' + to,
      },
    });
    var code = res.getResponseCode();
    if (code === 416) break;
    if (code !== 200 && code !== 206) {
      throw new Error('Lectura ' + tabla.table + ' HTTP ' + code + ' ' + String(res.getContentText() || '').slice(0, 200));
    }
    var batch = JSON.parse(res.getContentText() || '[]');
    if (!batch || !batch.length) break;
    for (var i = 0; i < batch.length; i++) all.push(batch[i]);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function respaldoSupabaseASheets() {
  var cfg = supabaseConfig();
  var ss = abrirPatio();
  var errores = [];
  for (var i = 0; i < PATIO_TABLES.length; i++) {
    var tabla = PATIO_TABLES[i];
    try {
      var registros = leerTablaSupabase(cfg, tabla);
      var nombre = escribirBak(ss, tabla, registros);
      Logger.log(tabla.sheet + ' → ' + nombre + ' (' + registros.length + ')');
    } catch (err) {
      var message = err && err.message ? err.message : String(err);
      errores.push(tabla.sheet + ': ' + message);
      Logger.log('Respaldo falló ' + tabla.sheet + ': ' + message);
    }
  }
  if (errores.length) throw new Error(errores.join(' | '));
  return { ok: true };
}

/** Una vez. Dispara respaldoSupabaseASheets todos los días a las 06:00 America/Chihuahua. */
function instalarRespaldoDiario() {
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'respaldoSupabaseASheets') {
      ScriptApp.deleteTrigger(existentes[i]);
    }
  }
  ScriptApp.newTrigger('respaldoSupabaseASheets')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(0)
    .inTimezone('America/Chihuahua')
    .create();
  Logger.log('Respaldo diario a las 06:00 America/Chihuahua, en pestañas BAK_.');
}
