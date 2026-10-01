/**
 * PatioBridge — puente de PatioControl (Apps Script, runtime V8).
 *
 * Netlify hace POST JSON. Este script habla con Sheets y Drive como el usuario
 * que lo desplegó (Ejecutar como: Yo). No hace falta un JSON de cuenta de servicio.
 *
 * Secreto: Proyecto → Configuración del proyecto → Propiedades del script
 *   PATIO_SECRET = el mismo valor que PATIO_APPS_SCRIPT_SECRET en Netlify.
 * El Web App no entrega el header Authorization, así que el secreto va en body.secret.
 * El cliente igual manda Authorization: Bearer por si un proxy lo reenvía.
 *
 * Opcional: PATIO_DRIVE_FOLDER_ID si el POST no trae folderId.
 *
 * Cuerpo: { secret, action, spreadsheetId?, range?, values?, requests?, fileId?, folderId?, bytesBase64?, name?, mimeType? }
 * Acciones: get | append | update | meta | batchUpdate | uploadJpeg | downloadJpeg | fileMeta
 *
 * Apps Script responde HTTP 200 siempre. El error va en { ok:false, error }.
 * Escrituras RAW: setValues tal cual. Un texto que empieza con "=" se guarda como texto.
 */
var PATIO_SECRET_PROP = 'PATIO_SECRET';
var PATIO_FOLDER_PROP = 'PATIO_DRIVE_FOLDER_ID';
var MAX_IMAGE_BYTES = 4 * 1024 * 1024;
var MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

function doGet() {
  return jsonOut({
    ok: true,
    service: 'PatioBridge',
    hint: 'Usa POST con secret y action. La URL de Netlify es la de /exec, no /dev.',
  });
}

function doPost(e) {
  try {
    var body = parseBody(e);
    var gate = verifySecret(body);
    if (!gate.ok) return jsonOut(gate);
    var action = String(body.action || '').trim();
    var result = isMutation(action) ? withLock(function () { return dispatch(action, body); }) : dispatch(action, body);
    if (result && result.ok === false) return jsonOut(result);
    if (!result || typeof result !== 'object') result = {};
    if (result.ok == null) result.ok = true;
    return jsonOut(result);
  } catch (err) {
    return jsonOut(classifyError(err));
  }
}

function parseBody(e) {
  var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    throw new Error('JSON inválido.');
  }
}

/** Compara body.secret con la propiedad PATIO_SECRET. No escribe el secreto en la respuesta. */
function verifySecret(body) {
  var expected = String(PropertiesService.getScriptProperties().getProperty(PATIO_SECRET_PROP) || '');
  if (!expected) {
    return {
      ok: false,
      error: 'Falta la propiedad de script PATIO_SECRET.',
      code: 'NO_CONFIG',
      status: 503,
    };
  }
  var got = body && body.secret != null ? String(body.secret) : '';
  if (!secretEquals(expected, got)) {
    return { ok: false, error: 'Secreto inválido.', code: 'SECRET', status: 503 };
  }
  return { ok: true };
}

function secretEquals(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isMutation(action) {
  return action === 'append' || action === 'update' || action === 'batchUpdate' || action === 'uploadJpeg';
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (err) {
    throw new Error('Puente ocupado. Reintenta.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function dispatch(action, body) {
  if (action === 'get') return { values: readValues(openSheet(body), body.range) };
  if (action === 'append') return appendValues(openSheet(body), body.range, body.values);
  if (action === 'update') return updateValues(openSheet(body), body.range, body.values);
  if (action === 'meta') return metaOf(openSheet(body));
  if (action === 'batchUpdate') return batchUpdate(openSheet(body), body.requests);
  if (action === 'uploadJpeg') return uploadJpeg(body);
  if (action === 'downloadJpeg') return downloadJpeg(body);
  if (action === 'fileMeta') return fileMeta(body);
  return {
    ok: false,
    error: 'Acción no implementada en el puente Apps Script (501): ' + action,
    code: 'NOT_IMPLEMENTED',
    status: 501,
  };
}

function openSheet(body) {
  var id = String((body && body.spreadsheetId) || '').trim();
  if (!id) throw new Error('Falta spreadsheetId.');
  return SpreadsheetApp.openById(id);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function classifyError(err) {
  var message = String(err && err.message ? err.message : err);
  if (/NOT_IN_FOLDER/.test(message)) {
    return { ok: false, error: 'No se encontró la evidencia.', code: 'NOT_IN_FOLDER', status: 404 };
  }
  if (/no es una imagen/i.test(message)) {
    return { ok: false, error: 'El archivo no es una imagen.', code: 'MIME', status: 415 };
  }
  if (/demasiado grande/i.test(message)) {
    return { ok: false, error: 'La imagen es demasiado grande.', code: 'TOO_BIG', status: 413 };
  }
  if (/exceeds grid limits|grid limits/i.test(message)) {
    return { ok: false, error: message, code: 'GRID', status: 400 };
  }
  if (/Unable to parse range/i.test(message)) {
    return { ok: false, error: message, code: 'NO_SHEET', status: 404 };
  }
  if (/No item with the given ID|File not found/i.test(message)) {
    return { ok: false, error: 'No se encontró la evidencia.', code: 'NOT_FOUND', status: 404 };
  }
  if (/Puente ocupado/i.test(message)) {
    return { ok: false, error: message, code: 'BUSY', status: 503 };
  }
  if (/JSON inválido/i.test(message)) {
    return { ok: false, error: message, code: 'BAD_JSON', status: 400 };
  }
  return { ok: false, error: message, code: 'APPS_SCRIPT', status: 502 };
}

function colToIndex(letters) {
  var n = 0;
  var s = String(letters || '').toUpperCase();
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

function indexToCol(index) {
  var n = index;
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Separa "Pestaña!A2:S" (también 'Nombre con !'!A1). */
function splitSheetA1(rangeA1) {
  var raw = String(rangeA1 || '').trim();
  if (!raw) throw new Error('Unable to parse range: vacío');
  if (raw.charAt(0) === "'") {
    var end = 1;
    while (end < raw.length) {
      if (raw.charAt(end) === "'") {
        if (raw.charAt(end + 1) === "'") {
          end += 2;
          continue;
        }
        end += 1;
        break;
      }
      end += 1;
    }
    var name = raw.substring(1, end - 1).replace(/''/g, "'");
    var rest = raw.substring(end);
    if (rest.charAt(0) !== '!') throw new Error('Unable to parse range: ' + raw + ' (not found)');
    return { sheetName: name, a1: rest.substring(1).replace(/\$/g, '') };
  }
  var bang = raw.indexOf('!');
  if (bang < 0) throw new Error('Unable to parse range: ' + raw + ' (not found)');
  return { sheetName: raw.substring(0, bang), a1: raw.substring(bang + 1).replace(/\$/g, '') };
}

function parseA1Range(rangeA1) {
  var parts = splitSheetA1(rangeA1);
  var a1 = parts.a1;
  var match = /^([A-Za-z]*)(\d*)(?::([A-Za-z]*)(\d*))?$/.exec(a1);
  if (!match || (!match[1] && !match[2])) throw new Error('Unable to parse range: ' + rangeA1 + ' (not found)');
  var hasColon = a1.indexOf(':') !== -1;
  var startCol = match[1] ? colToIndex(match[1]) : 1;
  var startRow = match[2] ? parseInt(match[2], 10) : 1;
  var endCol = null;
  var endRow = null;
  if (!hasColon) {
    endCol = match[1] ? colToIndex(match[1]) : null;
    endRow = match[2] ? parseInt(match[2], 10) : null;
  } else {
    endCol = match[3] ? colToIndex(match[3]) : null;
    endRow = match[4] ? parseInt(match[4], 10) : null;
  }
  return {
    sheetName: parts.sheetName,
    startCol: startCol,
    startRow: startRow,
    endCol: endCol,
    endRow: endRow,
  };
}

function sheetByName(ss, name, rangeA1) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Unable to parse range: "' + name + '" not found (' + rangeA1 + ')');
  return sheet;
}

function gridLimitError(rangeA1, sheet) {
  return new Error(
    'Range (' + rangeA1 + ') exceeds grid limits. Max rows: ' + sheet.getMaxRows() + ', max columns: ' + sheet.getMaxColumns(),
  );
}

function cellOut(value) {
  if (value == null) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'America/Mexico_City', "yyyy-MM-dd'T'HH:mm:ss");
  }
  return value;
}

function rawCell(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && value.charAt(0) === '=') return "'" + value;
  return value;
}

function asGrid(values) {
  if (!values || !values.length) throw new Error('values vacío.');
  var rows = [];
  var width = 0;
  for (var i = 0; i < values.length; i++) {
    var row = Array.isArray(values[i]) ? values[i] : [values[i]];
    rows.push(row);
    if (row.length > width) width = row.length;
  }
  if (!width) throw new Error('values vacío.');
  var grid = [];
  for (var r = 0; r < rows.length; r++) {
    var out = [];
    for (var c = 0; c < width; c++) out.push(rawCell(c < rows[r].length ? rows[r][c] : ''));
    grid.push(out);
  }
  return grid;
}

function rowEmpty(row) {
  for (var i = 0; i < row.length; i++) {
    if (row[i] != null && row[i] !== '') return false;
  }
  return true;
}

function trimTrailingEmptyRows(values) {
  var end = values.length;
  while (end > 0 && rowEmpty(values[end - 1])) end--;
  if (end === values.length) return values;
  return values.slice(0, end);
}

function readValues(ss, rangeA1) {
  var parsed = parseA1Range(rangeA1);
  var sheet = sheetByName(ss, parsed.sheetName, rangeA1);
  var maxRows = sheet.getMaxRows();
  var maxCols = sheet.getMaxColumns();
  var startRow = parsed.startRow || 1;
  var startCol = parsed.startCol || 1;
  var endCol = parsed.endCol || maxCols;
  if (startCol > maxCols || endCol > maxCols || startRow > maxRows || (parsed.endRow && parsed.endRow > maxRows)) {
    throw gridLimitError(rangeA1, sheet);
  }
  var endRow = parsed.endRow;
  if (!endRow) {
    var lastRow = sheet.getLastRow();
    if (lastRow < startRow) return [];
    endRow = lastRow;
  }
  if (endRow < startRow) return [];
  var numRows = endRow - startRow + 1;
  var numCols = endCol - startCol + 1;
  // getRange(fila, columna, numFilas, numColumnas) — el 3.º y 4.º son cantidades, no el final.
  var values = sheet.getRange(startRow, startCol, numRows, numCols).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var row = [];
    for (var c = 0; c < values[r].length; c++) row.push(cellOut(values[r][c]));
    out.push(row);
  }
  if (!parsed.endRow) out = trimTrailingEmptyRows(out);
  return out;
}

/** Append al estilo values.append: después de la última fila, dentro de las columnas del rango. */
function appendValues(ss, rangeA1, values) {
  var parsed = parseA1Range(rangeA1);
  var sheet = sheetByName(ss, parsed.sheetName, rangeA1);
  var grid = asGrid(values);
  var writeCols = grid[0].length;
  if ((parsed.endCol && parsed.endCol > sheet.getMaxColumns()) || parsed.startCol + writeCols - 1 > sheet.getMaxColumns()) {
    throw gridLimitError(rangeA1, sheet);
  }
  var startRow = Math.max(sheet.getLastRow() + 1, parsed.startRow || 1);
  var need = startRow + grid.length - 1;
  if (need > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), need - sheet.getMaxRows());
  }
  sheet.getRange(startRow, parsed.startCol, grid.length, writeCols).setValues(grid);
  var endColLetter = indexToCol(parsed.startCol + writeCols - 1);
  var updated = parsed.sheetName + '!' + indexToCol(parsed.startCol) + startRow + ':' + endColLetter + (startRow + grid.length - 1);
  return { updates: { updatedRows: grid.length, updatedColumns: writeCols, updatedRange: updated } };
}

function updateValues(ss, rangeA1, values) {
  var parsed = parseA1Range(rangeA1);
  var sheet = sheetByName(ss, parsed.sheetName, rangeA1);
  var grid = asGrid(values);
  var numRows = grid.length;
  var numCols = grid[0].length;
  var startRow = parsed.startRow || 1;
  var startCol = parsed.startCol || 1;
  if (startRow + numRows - 1 > sheet.getMaxRows() || startCol + numCols - 1 > sheet.getMaxColumns()) {
    throw gridLimitError(rangeA1, sheet);
  }
  sheet.getRange(startRow, startCol, numRows, numCols).setValues(grid);
  return { updatedRows: numRows, updatedColumns: numCols, updatedRange: rangeA1 };
}

function sheetProps(sheet) {
  return {
    sheetId: sheet.getSheetId(),
    title: sheet.getName(),
    gridProperties: {
      rowCount: sheet.getMaxRows(),
      columnCount: sheet.getMaxColumns(),
      frozenRowCount: sheet.getFrozenRows(),
    },
  };
}

function metaOf(ss) {
  var sheets = ss.getSheets().map(function (sheet) {
    var props = sheetProps(sheet);
    return { title: props.title, properties: props };
  });
  return { sheets: sheets };
}

function findSheetById(ss, sheetId) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === sheetId) return sheets[i];
  }
  return null;
}

/** addSheet y appendDimension. Cualquier otra operación del batch se rechaza (501) sin aplicar. */
function batchUpdate(ss, requests) {
  if (!Array.isArray(requests)) throw new Error('batchUpdate sin requests.');
  for (var i = 0; i < requests.length; i++) {
    var probe = requests[i] || {};
    if (!probe.addSheet && !probe.appendDimension) {
      return {
        ok: false,
        error: 'batchUpdate: operación no implementada en el puente Apps Script (501).',
        code: 'NOT_IMPLEMENTED',
        status: 501,
      };
    }
  }
  var replies = [];
  for (var r = 0; r < requests.length; r++) {
    var req = requests[r];
    if (req.addSheet) {
      var propsIn = req.addSheet.properties || {};
      var title = String(propsIn.title || '').trim();
      if (!title) throw new Error('addSheet sin título.');
      var existing = ss.getSheetByName(title);
      var sheet = existing || ss.insertSheet(title);
      var grid = propsIn.gridProperties || {};
      if (!existing) {
        if (grid.rowCount && grid.rowCount > sheet.getMaxRows()) {
          sheet.insertRowsAfter(sheet.getMaxRows(), grid.rowCount - sheet.getMaxRows());
        }
        if (grid.columnCount && grid.columnCount > sheet.getMaxColumns()) {
          sheet.insertColumnsAfter(sheet.getMaxColumns(), grid.columnCount - sheet.getMaxColumns());
        }
        if (grid.frozenRowCount) sheet.setFrozenRows(Number(grid.frozenRowCount) || 0);
      }
      replies.push({ addSheet: { properties: sheetProps(sheet) } });
      continue;
    }
    var dim = req.appendDimension || {};
    var target = findSheetById(ss, dim.sheetId);
    if (!target) throw new Error('appendDimension: no existe sheetId ' + dim.sheetId);
    var length = Number(dim.length) || 0;
    var dimension = String(dim.dimension || '').toUpperCase();
    if (length > 0 && dimension === 'COLUMNS') target.insertColumnsAfter(target.getMaxColumns(), length);
    else if (length > 0 && dimension === 'ROWS') target.insertRowsAfter(target.getMaxRows(), length);
    replies.push({});
  }
  return { replies: replies };
}

function resolveFolderId(body) {
  var fromBody = String((body && body.folderId) || '').trim();
  if (fromBody) return fromBody;
  return String(PropertiesService.getScriptProperties().getProperty(PATIO_FOLDER_PROP) || '').trim();
}

function safeName(name, mime) {
  var fallback = mime === 'image/png' ? 'evidencia.png' : 'evidencia.jpg';
  var base = String(name || fallback)
    .replace(/[\/\\?%*:|"<>#]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) base = fallback;
  if (base.length > 180) base = base.substring(0, 180);
  return base;
}

function decodeImage(body) {
  var mime = String((body && body.mimeType) || 'image/jpeg').toLowerCase();
  var b64 = String((body && body.bytesBase64) || '');
  var dataUrl = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(b64);
  if (dataUrl) {
    if (!body.mimeType) mime = String(dataUrl[1] || mime).toLowerCase();
    b64 = dataUrl[2];
  }
  b64 = b64.replace(/\s/g, '');
  if (!b64) throw new Error('Falta la imagen.');
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if (mime !== 'image/jpeg' && mime !== 'image/png') throw new Error('Solo se aceptan fotos JPEG o PNG.');
  var bytes = Utilities.base64Decode(b64);
  if (!bytes || !bytes.length) throw new Error('Falta la imagen.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('La imagen es demasiado grande.');
  return { bytes: bytes, mime: mime };
}

/** Crea un archivo privado en la carpeta. No se comparte con "cualquiera". */
function uploadJpeg(body) {
  var folderId = resolveFolderId(body);
  if (!folderId) throw new Error('Falta la carpeta de evidencias (folderId o propiedad PATIO_DRIVE_FOLDER_ID).');
  var image = decodeImage(body);
  var name = safeName(body.name, image.mime);
  var folder = DriveApp.getFolderById(folderId);
  var blob = Utilities.newBlob(image.bytes, image.mime, name);
  var file = folder.createFile(blob);
  if (body.appProperties && typeof body.appProperties === 'object') {
    try {
      file.setDescription(JSON.stringify(body.appProperties).substring(0, 7000));
    } catch (ignore) {
      // La descripción es opcional. El archivo ya quedó privado en la carpeta.
    }
  }
  return { fileId: file.getId(), id: file.getId(), name: file.getName(), mimeType: file.getMimeType() || image.mime };
}

function assertInFolder(file, folderId) {
  var want = String(folderId || '').trim();
  if (!want) return;
  var parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === want) return;
  }
  throw new Error('NOT_IN_FOLDER');
}

function downloadJpeg(body) {
  var fileId = String((body && body.fileId) || '').trim();
  if (!fileId) throw new Error('Falta fileId.');
  var file = DriveApp.getFileById(fileId);
  assertInFolder(file, resolveFolderId(body));
  var mime = String(file.getMimeType() || '');
  if (mime.indexOf('image/') !== 0) throw new Error('El archivo no es una imagen.');
  var bytes = file.getBlob().getBytes();
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error('La imagen es demasiado grande.');
  return {
    fileId: file.getId(),
    id: file.getId(),
    name: file.getName(),
    mimeType: mime,
    bytesBase64: Utilities.base64Encode(bytes),
  };
}

function fileMeta(body) {
  var fileId = String((body && body.fileId) || '').trim();
  if (!fileId) throw new Error('Falta fileId.');
  var file = DriveApp.getFileById(fileId);
  var parents = [];
  var it = file.getParents();
  while (it.hasNext()) parents.push(it.next().getId());
  return { id: file.getId(), name: file.getName(), mimeType: file.getMimeType(), parents: parents };
}
