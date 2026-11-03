/**
 * Respaldo diario, solo lectura, de PostgREST a un Google Sheet.
 *
 * Proyecto de Apps Script aparte de PatioBridge. Lo ejecuta la cuenta dueña
 * (nestor.riggs@gmail.com). No usa JSON de cuenta de servicio: la organización
 * de Google Cloud no deja crear llaves. No escribe en Supabase.
 *
 * Propiedades del script (no van en git):
 *   SUPABASE_URL               https://<ref>.supabase.co  (sin /rest/v1)
 *   SUPABASE_SERVICE_ROLE_KEY  service_role de ese proyecto
 *   BACKUP_SPREADSHEET_ID      Sheet de respaldo, distinto al operativo
 *
 * PatioControl no tiene cliente ni proyecto Supabase en el repo. El catálogo
 * de abajo son las pestañas que la app sí usa. El script las lee por PostgREST
 * en el proyecto que indiquen las propiedades, cada una en la pestaña BAK_<tabla>.
 * El proyecto compartido reloj-checador (gnqsctwskvwpbhxcfwhq) no tiene estas
 * tablas: no pongas su URL aquí.
 *
 * Conteos: GET con Prefer: count=exact y Range: 0-0. UrlFetchApp rechaza HEAD.
 * Una tabla vacía responde 416 y Content-Range * / 0; eso es 0 filas, no un error.
 * Más de 1000 filas se pide por páginas. La pestaña se reescribe completa.
 */

var SUPABASE_URL_PROP = 'SUPABASE_URL';
var SUPABASE_KEY_PROP = 'SUPABASE_SERVICE_ROLE_KEY';
var BACKUP_SPREADSHEET_PROP = 'BACKUP_SPREADSHEET_ID';
var OPERATIONAL_SPREADSHEET_ID = '1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0';
var PAGE_SIZE = 1000;
var WRITE_CHUNK = 1000;
var MAX_CELL_CHARS = 49000;
var MAX_PAGES = 200;
var TRIGGER_HANDLER = 'respaldoSupabaseASheets';
var TRIGGER_HOUR = 6;
var TRIGGER_TIMEZONE = 'America/Mexico_City';
var SUMMARY_SHEET = 'BAK__resumen';

/** name = recurso PostgREST. order = columna estable para paginar. */
var PATIO_TABLES = [
  { name: 'Autorizados', order: 'email', purpose: 'Kardex de acceso: correo, rol, permisos y clave' },
  { name: 'Movimientos', order: 'id', purpose: 'Entradas, salidas, parados y bajas del patio' },
  { name: 'Equipos', order: 'id', purpose: 'Catálogo de unidades' },
  { name: 'Refrigeracion', order: 'id', purpose: 'Catálogo Thermo y horómetro' },
  { name: 'Auditoria', order: 'id', purpose: 'Bitácora de acciones de la app' },
  { name: 'OrdenesTrabajo', order: 'id', purpose: 'Órdenes de taller, ETR y costos' },
  { name: 'OT_Eventos', order: 'id', purpose: 'Cambios de OT y autorizaciones de salida' },
  { name: 'EstadoUnidad', order: 'unidadId', purpose: 'Estatus operativo, zona y carga de cada unidad' },
  { name: 'ZonasSlots', order: 'id', purpose: 'Slots de patio por yarda' },
  { name: 'ConteosFisicos', order: 'id', purpose: 'Conteos físicos de patio' },
  { name: 'Defectos', order: 'id', purpose: 'Daños nuevos marcados en la salida' },
  { name: 'PlanPreventivo', order: 'tipoUnidad', purpose: 'Intervalos de servicio por tipo de unidad' },
  { name: 'ServicioProgramado', order: 'id', purpose: 'Próximo servicio de cada unidad' },
  { name: 'AvisosLog', order: 'id', purpose: 'Avisos enviados o solo registrados' },
  { name: 'AvisosSuscripciones', order: 'id', purpose: 'Destinos de WhatsApp y correo' },
  { name: 'LlegadasEsperadas', order: 'id', purpose: 'Preavisos de llegada de App Chofer' },
];

function respaldoSupabaseDryRun(opts) {
  return runRespaldo(conOpciones(opts, true));
}

function respaldoSupabaseASheets(opts) {
  return runRespaldo(conOpciones(opts, false));
}

function conOpciones(opts, dryRun) {
  if (!opts || !opts.fetch) return { dryRun: dryRun };
  opts.dryRun = dryRun;
  return opts;
}

/**
 * Borra los triggers previos de este respaldo y deja uno diario.
 * Apps Script dispara atHour en la ventana de esa hora (06:00–07:00).
 */
function instalarRespaldoDiario(opts) {
  opts = opts || {};
  var scriptApp = opts.scriptApp || ScriptApp;
  var triggers = scriptApp.getProjectTriggers();
  var borrados = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === TRIGGER_HANDLER) {
      scriptApp.deleteTrigger(triggers[i]);
      borrados += 1;
    }
  }
  scriptApp.newTrigger(TRIGGER_HANDLER).timeBased().atHour(TRIGGER_HOUR).everyDays(1).inTimezone(TRIGGER_TIMEZONE).create();
  return {
    ok: true,
    handler: TRIGGER_HANDLER,
    hora: TRIGGER_HOUR,
    timezone: TRIGGER_TIMEZONE,
    triggersBorrados: borrados,
    nota: 'El trigger corre una vez al día entre las 06:00 y las 07:00 (America/Mexico_City).',
  };
}

function runRespaldo(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun === true;
  var config = leerConfig(opts.properties);
  var fetch = opts.fetch || function (url, params) {
    return UrlFetchApp.fetch(url, params);
  };
  var lock = null;
  if (!opts.skipLock) {
    var locks = opts.lockService || LockService;
    lock = locks.getScriptLock();
    lock.waitLock(30000);
  }
  try {
    var spreadsheet = abrirRespaldo(config.spreadsheetId, opts.spreadsheet);
    var tablas = [];
    for (var i = 0; i < PATIO_TABLES.length; i++) {
      tablas.push(respaldarTabla(PATIO_TABLES[i], config, fetch, spreadsheet, dryRun));
    }
    var fallas = [];
    for (var f = 0; f < tablas.length; f++) {
      if (!tablas[f].ok) fallas.push(tablas[f].tabla);
    }
    var reporte = {
      ok: fallas.length === 0,
      dryRun: dryRun,
      tablas: tablas,
      hora: new Date().toISOString(),
    };
    if (!dryRun) escribirResumen(spreadsheet, reporte);
    if (!dryRun && fallas.length) {
      throw new Error('Respaldo incompleto: ' + fallas.join(', '));
    }
    return reporte;
  } finally {
    if (lock) lock.releaseLock();
  }
}

function leerConfig(properties) {
  var bag = properties;
  if (!bag) {
    var stored = PropertiesService.getScriptProperties();
    bag = {};
    bag[SUPABASE_URL_PROP] = stored.getProperty(SUPABASE_URL_PROP);
    bag[SUPABASE_KEY_PROP] = stored.getProperty(SUPABASE_KEY_PROP);
    bag[BACKUP_SPREADSHEET_PROP] = stored.getProperty(BACKUP_SPREADSHEET_PROP);
  }
  var url = normalizarSupabaseUrl(bag[SUPABASE_URL_PROP]);
  var key = String(bag[SUPABASE_KEY_PROP] || '').trim();
  var spreadsheetId = String(bag[BACKUP_SPREADSHEET_PROP] || '').trim();
  if (!url) throw new Error('Falta la propiedad de script SUPABASE_URL (https://<ref>.supabase.co, sin /rest/v1).');
  if (!key) throw new Error('Falta la propiedad de script SUPABASE_SERVICE_ROLE_KEY.');
  if (!spreadsheetId) throw new Error('Falta la propiedad de script BACKUP_SPREADSHEET_ID.');
  if (spreadsheetId === OPERATIONAL_SPREADSHEET_ID) {
    throw new Error('BACKUP_SPREADSHEET_ID es el Sheet operativo de Patio. Crea otro Sheet para el respaldo.');
  }
  return { url: url, key: key, spreadsheetId: spreadsheetId };
}

function normalizarSupabaseUrl(value) {
  var url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (url.indexOf('@') !== -1 || !/^https:\/\/[^/\s]+$/i.test(url)) {
    throw new Error('SUPABASE_URL tiene que ser https://<ref>.supabase.co, sin ruta y sin la llave.');
  }
  return url;
}

function abrirRespaldo(spreadsheetId, injected) {
  if (injected) return injected;
  return SpreadsheetApp.openById(spreadsheetId);
}

function respaldarTabla(tabla, config, fetch, spreadsheet, dryRun) {
  var item = {
    tabla: tabla.name,
    proposito: tabla.purpose,
    filas: null,
    ok: false,
    error: '',
  };
  try {
    var conteo = contarTabla(config.url, config.key, tabla, fetch);
    item.filas = conteo.filas;
    if (dryRun) {
      item.ok = true;
      return item;
    }
    var rows = conteo.filas === 0 ? [] : leerTodasLasFilas(config.url, config.key, tabla, conteo.filas, fetch);
    if (rows.length !== conteo.filas) {
      throw new Error(tabla.name + ' contó ' + conteo.filas + ' y leyó ' + rows.length + '.');
    }
    escribirTabla(spreadsheet, tabla.name, rows);
    item.filas = rows.length;
    item.ok = true;
    return item;
  } catch (err) {
    item.ok = false;
    item.error = mensajeSeguro(err, config.key);
    return item;
  }
}

function contarTabla(url, key, tabla, fetch) {
  var req = solicitudConteo(url, tabla.name);
  var res = fetch(req.url, parametrosGet(key, req.headers));
  var code = res.getResponseCode();
  var total = parseContentRange(headerValue(res, 'Content-Range'));
  if (code === 416 && total === 0) return { filas: 0 };
  if (code !== 200 && code !== 206) {
    throw new Error(tabla.name + ' respondió HTTP ' + code + ' al contar. ' + recorte(textoRespuesta(res), 180));
  }
  if (total === null) throw new Error(tabla.name + ' no trajo Content-Range. No se puede contar.');
  return { filas: total };
}

function leerTodasLasFilas(url, key, tabla, total, fetch) {
  var rows = [];
  var offset = 0;
  var pages = 0;
  while (offset < total) {
    if (pages >= MAX_PAGES) {
      throw new Error(tabla.name + ' superó ' + MAX_PAGES + ' páginas de ' + PAGE_SIZE + '.');
    }
    var req = solicitudPagina(url, tabla, offset, PAGE_SIZE);
    var res = fetch(req.url, parametrosGet(key, req.headers));
    var code = res.getResponseCode();
    if (code === 416) break;
    if (code !== 200 && code !== 206) {
      throw new Error(tabla.name + ' respondió HTTP ' + code + ' al leer filas. ' + recorte(textoRespuesta(res), 180));
    }
    var page = parseFilas(textoRespuesta(res), tabla.name);
    if (!page.length) break;
    for (var i = 0; i < page.length; i++) rows.push(page[i]);
    offset += page.length;
    pages += 1;
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** GET de conteo. Range 0-0, nunca HEAD. */
function solicitudConteo(url, table) {
  return {
    url: urlTabla(url, table, ''),
    headers: { Prefer: 'count=exact', Range: '0-0' },
  };
}

function solicitudPagina(url, tabla, offset, limit) {
  var end = offset + limit - 1;
  var order = tabla.order ? '&order=' + encodeURIComponent(tabla.order) + '.asc' : '';
  return {
    url: urlTabla(url, tabla.name, order),
    headers: { Range: offset + '-' + end },
  };
}

function urlTabla(url, table, extraQuery) {
  return url + '/rest/v1/' + encodeURIComponent(table) + '?select=*' + (extraQuery || '');
}

function parametrosGet(key, extraHeaders) {
  var headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    Accept: 'application/json',
  };
  var names = Object.keys(extraHeaders || {});
  for (var i = 0; i < names.length; i++) headers[names[i]] = extraHeaders[names[i]];
  return {
    method: 'get',
    muteHttpExceptions: true,
    headers: headers,
  };
}

function parseFilas(text, table) {
  if (!String(text || '').trim()) return [];
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(table + ' no devolvió JSON.');
  }
  if (!Array.isArray(parsed)) throw new Error(table + ' no devolvió una lista.');
  return parsed;
}

function parseContentRange(value) {
  var text = String(value || '').trim();
  var match = text.match(/\/(\d+)\s*$/);
  if (!match) return null;
  return Number(match[1]);
}

function headerValue(res, name) {
  var bags = [];
  if (res && res.getHeaders) bags.push(res.getHeaders() || {});
  if (res && res.getAllHeaders) bags.push(res.getAllHeaders() || {});
  var want = String(name || '').toLowerCase();
  for (var b = 0; b < bags.length; b++) {
    var keys = Object.keys(bags[b]);
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i]).toLowerCase() === want) {
        var value = bags[b][keys[i]];
        return Array.isArray(value) ? value.join(',') : String(value);
      }
    }
  }
  return '';
}

function textoRespuesta(res) {
  if (!res || !res.getContentText) return '';
  return String(res.getContentText() || '');
}

function escribirTabla(spreadsheet, table, rows) {
  var sheet = hoja(spreadsheet, backupTabName(table));
  var grid = filasAGrid(rows);
  escribirGrid(sheet, grid);
}

function escribirResumen(spreadsheet, reporte) {
  var sheet = hoja(spreadsheet, SUMMARY_SHEET);
  var grid = [['tabla', 'proposito', 'filas', 'estado', 'detalle', 'hora']];
  for (var i = 0; i < reporte.tablas.length; i++) {
    var item = reporte.tablas[i];
    grid.push([
      item.tabla,
      item.proposito,
      item.filas === null || item.filas === undefined ? '' : item.filas,
      item.ok ? 'ok' : 'error',
      item.error || '',
      reporte.hora,
    ]);
  }
  escribirGrid(sheet, grid);
}

function hoja(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (sheet) return sheet;
  return spreadsheet.insertSheet(name);
}

function escribirGrid(sheet, grid) {
  sheet.clearContents();
  if (!grid.length || !grid[0].length) return;
  var width = grid[0].length;
  for (var i = 0; i < grid.length; i += WRITE_CHUNK) {
    var slice = grid.slice(i, i + WRITE_CHUNK);
    sheet.getRange(i + 1, 1, slice.length, width).setValues(slice);
  }
}

function filasAGrid(rows) {
  if (!rows.length) return [];
  var columns = columnasDe(rows);
  var grid = [columns];
  for (var r = 0; r < rows.length; r++) {
    var line = [];
    for (var c = 0; c < columns.length; c++) line.push(valorCelda(rows[r][columns[c]]));
    grid.push(line);
  }
  return grid;
}

function columnasDe(rows) {
  var seen = {};
  var columns = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r] && typeof rows[r] === 'object' ? rows[r] : {};
    var keys = Object.keys(row);
    for (var i = 0; i < keys.length; i++) {
      if (seen[keys[i]]) continue;
      seen[keys[i]] = true;
      columns.push(keys[i]);
    }
  }
  return columns;
}

function valorCelda(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object') return recorte(JSON.stringify(value), MAX_CELL_CHARS);
  var text = String(value);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return recorte(text, MAX_CELL_CHARS);
}

function backupTabName(table) {
  var name = 'BAK_' + String(table || '').trim();
  if (!/^BAK_[A-Za-z][A-Za-z0-9_]*$/.test(name) || name.length > 100) {
    throw new Error('Nombre de pestaña inválido para ' + table + '.');
  }
  return name;
}

function mensajeSeguro(err, key) {
  return redactar(String(err && err.message ? err.message : err), key);
}

function redactar(text, key) {
  var out = String(text || '');
  if (key) out = out.split(key).join('[redacted]');
  return recorte(out, 300);
}

function recorte(text, max) {
  var value = String(text || '');
  if (value.length <= max) return value;
  return value.slice(0, max) + '…';
}
