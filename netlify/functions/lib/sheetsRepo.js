/**
 * Repositorio de Google Sheets.
 * Dos vías. Si las dos están definidas, gana la cuenta de servicio:
 *   1. GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, PATIO_SPREADSHEET_ID
 *   2. Puente Apps Script (sin JSON): PATIO_APPS_SCRIPT_URL, PATIO_APPS_SCRIPT_SECRET, PATIO_SPREADSHEET_ID
 * La hoja se comparte (Editor) con la cuenta de servicio, o el script corre como el dueño de la hoja.
 *
 * Reglas: nunca se limpian pestañas; Auditoria es solo append.
 * Escrituras con valueInputOption=RAW para que un texto tipo "=FORMULA" no se evalúe.
 * En modo Apps Script, setValues escribe el texto tal cual (un "=" inicial se guarda como texto).
 */

import { SignJWT, importPKCS8 } from 'jose'
import { v4 as uuidv4 } from 'uuid'
import { createAppsScriptTransport, hasAppsScriptEnv, readAppsScriptEnv } from './appsScriptTransport.js'
import { parseAutorizadoRow } from './permisos.js'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

export const AUDITORIA_SHEET = 'Auditoria'
export const AUDITORIA_HEADERS = [
  'id',
  'horaServidor',
  'usuarioEmail',
  'rol',
  'accion',
  'entidad',
  'entidadId',
  'antes',
  'despues',
  'dispositivoId',
]

/** Columnas A:AJ de Movimientos, mismo orden que App.jsx (Qt / Yt). AJ es viajeId (Fase 5). */
export const MOVIMIENTO_COLUMNS = [
  'id',
  'tipo',
  'equipoId',
  'placa',
  'numeroEconomico',
  'equipoTipo',
  'fechaHora',
  'operador',
  'chofer',
  'origenDestino',
  'kilometros',
  'dieselPorcentaje',
  'dieselLitros',
  'checklistJson',
  'fotosUrls',
  'condicionGeneral',
  'observaciones',
  'creadoEn',
  'yardaId',
  'selloNumero',
  'firmaNombre',
  'firmaUrl',
  'geoLat',
  'fotosEvidenciaJson',
  'geoLng',
  'cumplimientoJson',
  'placasExtraJson',
  'empresaId',
  'refrigeradaJson',
  'whatsapp',
  'motivoParo',
  'paradoDesde',
  'zonaSlot',
  'usuarioEmail',
  'horaServidor',
  'viajeId',
]

export const MOVIMIENTOS_READ_RANGE = 'Movimientos!A2:AJ'
export const MOVIMIENTOS_APPEND_RANGE = 'Movimientos!A:AJ'
/** Lectura anterior a Fase 5, si la cuadrícula todavía no llega a AJ. */
export const MOVIMIENTOS_READ_RANGE_FASE4 = 'Movimientos!A2:AI'
export const MOVIMIENTOS_APPEND_RANGE_FASE4 = 'Movimientos!A:AI'

export const OT_SHEET = 'OrdenesTrabajo'
export const OT_EVENTOS_SHEET = 'OT_Eventos'
export const ESTADO_UNIDAD_SHEET = 'EstadoUnidad'

/** OrdenesTrabajo A:AI. Los arreglos viven como JSON en la celda. */
export const OT_COLUMNS = [
  'id',
  'folio',
  'unidadId',
  'unidadesRelacionadasJson',
  'yarda',
  'tipo',
  'motivo',
  'prioridad',
  'tallerTipo',
  'proveedorId',
  'ubicacionTaller',
  'responsableEmail',
  'reportadoPor',
  'fechaEntradaTaller',
  'etr',
  'fechaLista',
  'fechaLiberada',
  'estatus',
  'kmEntrada',
  'kmSalida',
  'horometroEntrada',
  'horometroSalida',
  'costoEstimado',
  'costoRefacciones',
  'costoManoObra',
  'costoExterno',
  'factura',
  'refaccionesJson',
  'fotosAntesJson',
  'fotosDespuesJson',
  'notas',
  'movimientoOrigenId',
  'etrOriginal',
  'etrMovimientosCount',
  'activo',
]

export const OT_EVENTO_COLUMNS = [
  'id',
  'otId',
  'tipoEvento',
  'valorAnterior',
  'valorNuevo',
  'motivo',
  'usuarioEmail',
  'horaServidor',
]

export const ESTADO_UNIDAD_COLUMNS = [
  'unidadId',
  'tipo',
  'yarda',
  'zona',
  'slot',
  'ubicacion',
  'estatusOperativo',
  'estatusCarga',
  'desde',
  'otAbiertaId',
  'actualizadoEn',
  'clienteCarga',
  'folioCarga',
  'enganchadaA',
]

/** Encabezados de EstadoUnidad antes de Fase 2 (A:K). La migración solo agrega L:N. */
export const ESTADO_UNIDAD_FASE1_COLUMNS = ESTADO_UNIDAD_COLUMNS.slice(0, 11)

export const ZONAS_SLOTS_SHEET = 'ZonasSlots'
export const ZONAS_SLOTS_COLUMNS = ['id', 'yardaId', 'zona', 'slot', 'tipo', 'capacidad', 'activo']

export const CONTEOS_SHEET = 'ConteosFisicos'
export const CONTEOS_COLUMNS = ['id', 'yardaId', 'zona', 'iniciadoEn', 'cerradoEn', 'usuarioEmail', 'resumenJson', 'activo']

/** Daños nuevos detectados en la salida (Fase 3). Solo se agregan filas. */
export const DEFECTOS_SHEET = 'Defectos'
export const DEFECTOS_COLUMNS = ['id', 'movimientoId', 'equipoId', 'angulo', 'tipo', 'fotosJson', 'otId', 'usuarioEmail', 'horaServidor']

/** Plan de servicio por tipo de unidad (Fase 4). Una fila por tipoUnidad. */
export const PLAN_PREVENTIVO_SHEET = 'PlanPreventivo'
export const PLAN_PREVENTIVO_COLUMNS = ['tipoUnidad', 'cadaKm', 'cadaDias', 'cadaHorasThermo', 'avisoPct']

/** Próximo servicio de una unidad. estatus: PENDIENTE | AVISO | VENCIDO | HECHO */
export const SERVICIO_PROGRAMADO_SHEET = 'ServicioProgramado'
export const SERVICIO_PROGRAMADO_COLUMNS = ['id', 'unidadId', 'planId', 'proximoKm', 'proximaFecha', 'proximoHorometro', 'estatus', 'otId']

export const ESTATUS_SERVICIO_PROGRAMADO = ['PENDIENTE', 'AVISO', 'VENCIDO', 'HECHO']

/** Bitácora de avisos. canal: whatsapp | email | log. estatus: ENVIADO | ERROR | LOG */
export const AVISOS_LOG_SHEET = 'AvisosLog'
export const AVISOS_LOG_COLUMNS = ['id', 'tipo', 'yarda', 'unidadId', 'canal', 'estatus', 'destino', 'mensaje', 'dedupeKey', 'horaServidor', 'detalle']

/** A quién avisar. tipo `*` = todos. yarda `todas` = todas. canal whatsapp | email */
export const AVISOS_SUSCRIPCIONES_SHEET = 'AvisosSuscripciones'
export const AVISOS_SUSCRIPCIONES_COLUMNS = ['id', 'tipo', 'yarda', 'canal', 'destino', 'activo']

/** Preaviso de App Chofer (Fase 5). estatus: PENDIENTE | RECIBIDA */
export const LLEGADAS_ESPERADAS_SHEET = 'LlegadasEsperadas'
export const LLEGADAS_ESPERADAS_COLUMNS = [
  'id',
  'viajeId',
  'placas',
  'cajasJson',
  'dolly',
  'sello',
  'cartaPorte',
  'eta',
  'yardaId',
  'horaServidor',
  'estatus',
]

/** Catálogo de unidades. A:I, mismo orden que la app (Ht / Ut). */
export const EQUIPOS_SHEET = 'Equipos'
export const EQUIPOS_COLUMNS = ['id', 'tipo', 'placa', 'numeroEconomico', 'marca', 'modelo', 'notas', 'creadoEn', 'operadorAsignado']
export const EQUIPOS_READ_RANGE = 'Equipos!A2:I'
export const EQUIPOS_APPEND_RANGE = 'Equipos!A:I'

/** Equipos Thermo. A:I, mismo orden que la app (sn / cn). F es el horómetro. */
export const REFRIGERACION_SHEET = 'Refrigeracion'
export const REFRIGERACION_COLUMNS = ['id', 'marca', 'modelo', 'numeroActivo', 'economicoMontado', 'horometro', 'estatus', 'notas', 'creadoEn']
export const REFRIGERACION_READ_RANGE = 'Refrigeracion!A2:I'
export const REFRIGERACION_APPEND_RANGE = 'Refrigeracion!A:I'

/** Ubicación de la unidad (columna `ubicacion` cuando el valor es de Fase 2). */
export const UBICACIONES_UNIDAD = ['EN_PATIO', 'EN_RUTA', 'EN_TALLER_EXTERNO', 'EN_CLIENTE']
export const ESTATUS_CARGA = ['VACIA', 'CARGADA', 'EN_CARGA', 'NA']
export const TIPOS_SLOT = ['LINEA', 'ANDEN', 'TALLER', 'LAVADO', 'CUARENTENA', 'OTRO']

/** 0 → A, 25 → Z, 26 → AA */
export function columnLetter(index) {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export const OT_READ_RANGE = `${OT_SHEET}!A2:${columnLetter(OT_COLUMNS.length - 1)}`
export const OT_APPEND_RANGE = `${OT_SHEET}!A:${columnLetter(OT_COLUMNS.length - 1)}`
export const OT_EVENTOS_READ_RANGE = `${OT_EVENTOS_SHEET}!A2:${columnLetter(OT_EVENTO_COLUMNS.length - 1)}`
export const OT_EVENTOS_APPEND_RANGE = `${OT_EVENTOS_SHEET}!A:${columnLetter(OT_EVENTO_COLUMNS.length - 1)}`
export const ESTADO_UNIDAD_READ_RANGE = `${ESTADO_UNIDAD_SHEET}!A2:${columnLetter(ESTADO_UNIDAD_COLUMNS.length - 1)}`
export const ESTADO_UNIDAD_APPEND_RANGE = `${ESTADO_UNIDAD_SHEET}!A:${columnLetter(ESTADO_UNIDAD_COLUMNS.length - 1)}`
export const ZONAS_SLOTS_READ_RANGE = `${ZONAS_SLOTS_SHEET}!A2:${columnLetter(ZONAS_SLOTS_COLUMNS.length - 1)}`
export const ZONAS_SLOTS_APPEND_RANGE = `${ZONAS_SLOTS_SHEET}!A:${columnLetter(ZONAS_SLOTS_COLUMNS.length - 1)}`
export const CONTEOS_READ_RANGE = `${CONTEOS_SHEET}!A2:${columnLetter(CONTEOS_COLUMNS.length - 1)}`
export const CONTEOS_APPEND_RANGE = `${CONTEOS_SHEET}!A:${columnLetter(CONTEOS_COLUMNS.length - 1)}`
export const DEFECTOS_READ_RANGE = `${DEFECTOS_SHEET}!A2:${columnLetter(DEFECTOS_COLUMNS.length - 1)}`
export const DEFECTOS_APPEND_RANGE = `${DEFECTOS_SHEET}!A:${columnLetter(DEFECTOS_COLUMNS.length - 1)}`
export const PLAN_PREVENTIVO_READ_RANGE = `${PLAN_PREVENTIVO_SHEET}!A2:${columnLetter(PLAN_PREVENTIVO_COLUMNS.length - 1)}`
export const PLAN_PREVENTIVO_APPEND_RANGE = `${PLAN_PREVENTIVO_SHEET}!A:${columnLetter(PLAN_PREVENTIVO_COLUMNS.length - 1)}`
export const SERVICIO_PROGRAMADO_READ_RANGE = `${SERVICIO_PROGRAMADO_SHEET}!A2:${columnLetter(SERVICIO_PROGRAMADO_COLUMNS.length - 1)}`
export const SERVICIO_PROGRAMADO_APPEND_RANGE = `${SERVICIO_PROGRAMADO_SHEET}!A:${columnLetter(SERVICIO_PROGRAMADO_COLUMNS.length - 1)}`
export const AVISOS_LOG_READ_RANGE = `${AVISOS_LOG_SHEET}!A2:${columnLetter(AVISOS_LOG_COLUMNS.length - 1)}`
export const AVISOS_LOG_APPEND_RANGE = `${AVISOS_LOG_SHEET}!A:${columnLetter(AVISOS_LOG_COLUMNS.length - 1)}`
export const AVISOS_SUSCRIPCIONES_READ_RANGE = `${AVISOS_SUSCRIPCIONES_SHEET}!A2:${columnLetter(AVISOS_SUSCRIPCIONES_COLUMNS.length - 1)}`
export const AVISOS_SUSCRIPCIONES_APPEND_RANGE = `${AVISOS_SUSCRIPCIONES_SHEET}!A:${columnLetter(AVISOS_SUSCRIPCIONES_COLUMNS.length - 1)}`
export const LLEGADAS_ESPERADAS_READ_RANGE = `${LLEGADAS_ESPERADAS_SHEET}!A2:${columnLetter(LLEGADAS_ESPERADAS_COLUMNS.length - 1)}`
export const LLEGADAS_ESPERADAS_APPEND_RANGE = `${LLEGADAS_ESPERADAS_SHEET}!A:${columnLetter(LLEGADAS_ESPERADAS_COLUMNS.length - 1)}`

/**
 * Índice dentro de `A:A` (la fila 1 es el encabezado, índice 0, y no cuenta).
 * La fila de Sheets es `índice + 1`.
 * @param {unknown[][] | null | undefined} columnAValues
 * @param {string} id
 */
export function findDataRowIndex(columnAValues, id) {
  const want = String(id ?? '').trim()
  if (!want) return -1
  const rows = columnAValues ?? []
  for (let i = 1; i < rows.length; i++) {
    const cell = Array.isArray(rows[i]) ? rows[i][0] : rows[i]
    if (String(cell ?? '').trim() === want) return i
  }
  return -1
}

/** Rango de una sola fila. Nunca abarca la hoja completa. */
export function singleRowRange(sheetTitle, rowNumber1Based, columnCount) {
  const end = columnLetter(Math.max(1, columnCount) - 1)
  return `${sheetTitle}!A${rowNumber1Based}:${end}${rowNumber1Based}`
}

/** Cierran la entrada abierta de un equipo (ciclo, parado o baja). */
export const TIPOS_QUE_CIERRAN_ENTRADA = Object.freeze(['salida', 'parado', 'baja'])

export function normalizePrivateKey(raw) {
  let k = String(raw ?? '').trim()
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1)
  }
  return k.replace(/\\n/g, '\n')
}

export function readServiceAccountEnv(env = process.env) {
  return {
    email: String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '').trim(),
    privateKey: normalizePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    spreadsheetId: String(env.PATIO_SPREADSHEET_ID ?? '').trim(),
  }
}

export function hasServiceAccountEnv(env = process.env) {
  const c = readServiceAccountEnv(env)
  return Boolean(c.email && c.privateKey && c.spreadsheetId)
}

/** Hay backend de Sheets: cuenta de servicio o puente Apps Script. */
export function hasSheetsBackendEnv(env = process.env) {
  return hasServiceAccountEnv(env) || hasAppsScriptEnv(env)
}

function repoError(message, status, code = 'SHEETS') {
  const err = new Error(message)
  err.status = status
  err.code = code
  return err
}

function toCell(v) {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

function textCell(v) {
  if (v == null) return ''
  return String(v)
}

function numCell(v) {
  if (v == null || v === '') return ''
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : ''
}

function numOrNull(v) {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : null
}

function parseJsonCell(raw) {
  if (raw == null || raw === '') return undefined
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw))
  } catch {
    return undefined
  }
}

function jsonArrayCell(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : ''
  return JSON.stringify(value)
}

function readJsonArray(raw) {
  if (raw == null || raw === '') return []
  const parsed = parseJsonCell(raw)
  return Array.isArray(parsed) ? parsed : []
}

function readActivo(raw) {
  const t = String(raw ?? '').trim().toUpperCase()
  if (['NO', 'N', '0', 'FALSE'].includes(t)) return 'NO'
  return 'SI'
}

function readCount(raw) {
  const n = numOrNull(raw)
  return n == null ? 0 : n
}

function cellAt(row, columns, name) {
  return row?.[columns.indexOf(name)]
}

/**
 * OT → fila A:AI. Append o update de esa fila; no limpia la pestaña.
 * @param {Record<string, any>} ot
 */
export function otToRow(ot) {
  const o = ot && typeof ot === 'object' ? ot : {}
  const row = Array(OT_COLUMNS.length).fill('')
  const set = (name, value) => {
    row[OT_COLUMNS.indexOf(name)] = value
  }
  set('id', textCell(o.id))
  set('folio', textCell(o.folio))
  set('unidadId', textCell(o.unidadId))
  set('unidadesRelacionadasJson', jsonArrayCell(o.unidadesRelacionadasJson ?? o.unidadesRelacionadas))
  set('yarda', textCell(o.yarda ?? o.yardaId))
  set('tipo', textCell(o.tipo))
  set('motivo', textCell(o.motivo))
  set('prioridad', textCell(o.prioridad || 'MEDIA'))
  set('tallerTipo', textCell(o.tallerTipo || 'INTERNO'))
  set('proveedorId', textCell(o.proveedorId))
  set('ubicacionTaller', textCell(o.ubicacionTaller))
  set('responsableEmail', textCell(o.responsableEmail))
  set('reportadoPor', textCell(o.reportadoPor))
  set('fechaEntradaTaller', textCell(o.fechaEntradaTaller))
  set('etr', textCell(o.etr))
  set('fechaLista', textCell(o.fechaLista))
  set('fechaLiberada', textCell(o.fechaLiberada))
  set('estatus', textCell(o.estatus))
  set('kmEntrada', numCell(o.kmEntrada))
  set('kmSalida', numCell(o.kmSalida))
  set('horometroEntrada', numCell(o.horometroEntrada))
  set('horometroSalida', numCell(o.horometroSalida))
  set('costoEstimado', numCell(o.costoEstimado))
  set('costoRefacciones', numCell(o.costoRefacciones))
  set('costoManoObra', numCell(o.costoManoObra))
  set('costoExterno', numCell(o.costoExterno))
  set('factura', textCell(o.factura))
  set('refaccionesJson', jsonArrayCell(o.refaccionesJson ?? o.refacciones))
  set('fotosAntesJson', jsonArrayCell(o.fotosAntesJson ?? o.fotosAntes))
  set('fotosDespuesJson', jsonArrayCell(o.fotosDespuesJson ?? o.fotosDespues))
  set('notas', textCell(o.notas))
  set('movimientoOrigenId', textCell(o.movimientoOrigenId))
  set('etrOriginal', textCell(o.etrOriginal ?? o.etr))
  set('etrMovimientosCount', numCell(o.etrMovimientosCount ?? 0))
  set('activo', textCell(o.activo || 'SI'))
  return row
}

/** @param {unknown[] | null | undefined} e */
export function rowToOt(e) {
  if (!e?.[0]) return null
  const at = (name) => cellAt(e, OT_COLUMNS, name)
  return {
    id: String(at('id')),
    folio: String(at('folio') ?? ''),
    unidadId: String(at('unidadId') ?? ''),
    unidadesRelacionadasJson: readJsonArray(at('unidadesRelacionadasJson')),
    yarda: String(at('yarda') ?? ''),
    tipo: String(at('tipo') ?? ''),
    motivo: String(at('motivo') ?? ''),
    prioridad: String(at('prioridad') ?? '') || 'MEDIA',
    tallerTipo: String(at('tallerTipo') ?? '') || 'INTERNO',
    proveedorId: String(at('proveedorId') ?? ''),
    ubicacionTaller: String(at('ubicacionTaller') ?? ''),
    responsableEmail: String(at('responsableEmail') ?? ''),
    reportadoPor: String(at('reportadoPor') ?? ''),
    fechaEntradaTaller: String(at('fechaEntradaTaller') ?? ''),
    etr: String(at('etr') ?? ''),
    fechaLista: String(at('fechaLista') ?? ''),
    fechaLiberada: String(at('fechaLiberada') ?? ''),
    estatus: String(at('estatus') ?? ''),
    kmEntrada: numOrNull(at('kmEntrada')),
    kmSalida: numOrNull(at('kmSalida')),
    horometroEntrada: numOrNull(at('horometroEntrada')),
    horometroSalida: numOrNull(at('horometroSalida')),
    costoEstimado: numOrNull(at('costoEstimado')),
    costoRefacciones: numOrNull(at('costoRefacciones')),
    costoManoObra: numOrNull(at('costoManoObra')),
    costoExterno: numOrNull(at('costoExterno')),
    factura: String(at('factura') ?? ''),
    refaccionesJson: readJsonArray(at('refaccionesJson')),
    fotosAntesJson: readJsonArray(at('fotosAntesJson')),
    fotosDespuesJson: readJsonArray(at('fotosDespuesJson')),
    notas: String(at('notas') ?? ''),
    movimientoOrigenId: String(at('movimientoOrigenId') ?? ''),
    etrOriginal: String(at('etrOriginal') ?? ''),
    etrMovimientosCount: readCount(at('etrMovimientosCount')),
    activo: readActivo(at('activo')),
  }
}

/** @param {Record<string, any>} ev */
export function otEventoToRow(ev) {
  const o = ev && typeof ev === 'object' ? ev : {}
  return [
    textCell(o.id),
    textCell(o.otId),
    textCell(o.tipoEvento),
    textCell(o.valorAnterior),
    textCell(o.valorNuevo),
    textCell(o.motivo),
    textCell(o.usuarioEmail),
    textCell(o.horaServidor),
  ]
}

/** @param {unknown[] | null | undefined} e */
export function rowToOtEvento(e) {
  if (!e?.[0]) return null
  return {
    id: String(e[0]),
    otId: String(e[1] ?? ''),
    tipoEvento: String(e[2] ?? ''),
    valorAnterior: String(e[3] ?? ''),
    valorNuevo: String(e[4] ?? ''),
    motivo: String(e[5] ?? ''),
    usuarioEmail: String(e[6] ?? ''),
    horaServidor: String(e[7] ?? ''),
  }
}

/** @param {Record<string, any>} eu */
export function estadoUnidadToRow(eu) {
  const o = eu && typeof eu === 'object' ? eu : {}
  const row = Array(ESTADO_UNIDAD_COLUMNS.length).fill('')
  const set = (name, value) => {
    row[ESTADO_UNIDAD_COLUMNS.indexOf(name)] = value
  }
  set('unidadId', textCell(o.unidadId))
  set('tipo', textCell(o.tipo))
  set('yarda', textCell(o.yarda))
  set('zona', textCell(o.zona))
  set('slot', textCell(o.slot))
  set('ubicacion', textCell(o.ubicacion))
  set('estatusOperativo', textCell(o.estatusOperativo))
  set('estatusCarga', textCell(o.estatusCarga))
  set('desde', textCell(o.desde))
  set('otAbiertaId', textCell(o.otAbiertaId))
  set('actualizadoEn', textCell(o.actualizadoEn))
  set('clienteCarga', textCell(o.clienteCarga))
  set('folioCarga', textCell(o.folioCarga))
  set('enganchadaA', textCell(o.enganchadaA))
  return row
}

/** @param {unknown[] | null | undefined} e */
export function rowToEstadoUnidad(e) {
  if (!e?.[0]) return null
  const at = (name) => cellAt(e, ESTADO_UNIDAD_COLUMNS, name)
  return {
    unidadId: String(at('unidadId')),
    tipo: String(at('tipo') ?? ''),
    yarda: String(at('yarda') ?? ''),
    zona: String(at('zona') ?? ''),
    slot: String(at('slot') ?? ''),
    ubicacion: String(at('ubicacion') ?? ''),
    estatusOperativo: String(at('estatusOperativo') ?? ''),
    estatusCarga: String(at('estatusCarga') ?? ''),
    desde: String(at('desde') ?? ''),
    otAbiertaId: String(at('otAbiertaId') ?? ''),
    actualizadoEn: String(at('actualizadoEn') ?? ''),
    clienteCarga: String(at('clienteCarga') ?? ''),
    folioCarga: String(at('folioCarga') ?? ''),
    enganchadaA: String(at('enganchadaA') ?? ''),
  }
}

/** @param {Record<string, any>} slot */
export function zonaSlotToRow(slot) {
  const o = slot && typeof slot === 'object' ? slot : {}
  return [
    textCell(o.id),
    textCell(o.yardaId),
    textCell(o.zona),
    textCell(o.slot),
    textCell(o.tipo),
    numCell(o.capacidad),
    textCell(o.activo || 'SI'),
  ]
}

/** @param {unknown[] | null | undefined} e */
export function rowToZonaSlot(e) {
  if (!e?.[0]) return null
  const capacidad = numOrNull(e[5])
  return {
    id: String(e[0]),
    yardaId: String(e[1] ?? ''),
    zona: String(e[2] ?? ''),
    slot: String(e[3] ?? ''),
    tipo: String(e[4] ?? ''),
    capacidad: capacidad == null ? 1 : capacidad,
    activo: readActivo(e[6]),
  }
}

/** @param {Record<string, any>} conteo */
export function conteoToRow(conteo) {
  const o = conteo && typeof conteo === 'object' ? conteo : {}
  const resumen = o.resumenJson ?? o.resumen
  return [
    textCell(o.id),
    textCell(o.yardaId),
    textCell(o.zona),
    textCell(o.iniciadoEn),
    textCell(o.cerradoEn),
    textCell(o.usuarioEmail),
    resumen == null || resumen === '' ? '' : typeof resumen === 'string' ? resumen : JSON.stringify(resumen),
    textCell(o.activo || 'SI'),
  ]
}

/** @param {unknown[] | null | undefined} e */
export function rowToConteo(e) {
  if (!e?.[0]) return null
  const resumen = parseJsonCell(e[6])
  return {
    id: String(e[0]),
    yardaId: String(e[1] ?? ''),
    zona: String(e[2] ?? ''),
    iniciadoEn: String(e[3] ?? ''),
    cerradoEn: String(e[4] ?? ''),
    usuarioEmail: String(e[5] ?? ''),
    resumenJson: resumen && typeof resumen === 'object' ? resumen : {},
    activo: readActivo(e[7]),
  }
}

/** @param {Record<string, any>} defecto */
export function defectoToRow(defecto) {
  const o = defecto && typeof defecto === 'object' ? defecto : {}
  const fotos = o.fotosJson ?? o.fotos ?? []
  return [
    textCell(o.id),
    textCell(o.movimientoId),
    textCell(o.equipoId),
    textCell(o.angulo),
    textCell(o.tipo || 'DANO_NUEVO'),
    fotos == null || fotos === '' ? '[]' : typeof fotos === 'string' ? fotos : JSON.stringify(fotos),
    textCell(o.otId),
    textCell(o.usuarioEmail),
    textCell(o.horaServidor),
  ]
}

/** @param {unknown[] | null | undefined} e */
export function rowToDefecto(e) {
  if (!e?.[0]) return null
  const fotos = parseJsonCell(e[5])
  return {
    id: String(e[0]),
    movimientoId: String(e[1] ?? ''),
    equipoId: String(e[2] ?? ''),
    angulo: String(e[3] ?? ''),
    tipo: String(e[4] ?? ''),
    fotosJson: Array.isArray(fotos) ? fotos : [],
    otId: String(e[6] ?? ''),
    usuarioEmail: String(e[7] ?? ''),
    horaServidor: String(e[8] ?? ''),
  }
}

/** @param {Record<string, any>} plan */
export function planPreventivoToRow(plan) {
  const o = plan && typeof plan === 'object' ? plan : {}
  return [
    textCell(o.tipoUnidad).toLowerCase(),
    numCell(o.cadaKm),
    numCell(o.cadaDias),
    numCell(o.cadaHorasThermo),
    numCell(o.avisoPct == null || o.avisoPct === '' ? 80 : o.avisoPct),
  ]
}

/** @param {unknown[] | null | undefined} e */
export function rowToPlanPreventivo(e) {
  const tipo = String(e?.[0] ?? '').trim().toLowerCase()
  if (!tipo || tipo === 'tipounidad') return null
  const aviso = numOrNull(e[4])
  return {
    tipoUnidad: tipo,
    cadaKm: numOrNull(e[1]),
    cadaDias: numOrNull(e[2]),
    cadaHorasThermo: numOrNull(e[3]),
    avisoPct: aviso == null ? 80 : aviso,
  }
}

/** @param {Record<string, any>} servicio */
export function servicioProgramadoToRow(servicio) {
  const o = servicio && typeof servicio === 'object' ? servicio : {}
  const estatus = String(o.estatus || 'PENDIENTE').trim().toUpperCase()
  return [
    textCell(o.id),
    textCell(o.unidadId),
    textCell(o.planId).toLowerCase(),
    numCell(o.proximoKm),
    textCell(o.proximaFecha),
    numCell(o.proximoHorometro),
    ESTATUS_SERVICIO_PROGRAMADO.includes(estatus) ? estatus : 'PENDIENTE',
    textCell(o.otId),
  ]
}

/** @param {unknown[] | null | undefined} e */
export function rowToServicioProgramado(e) {
  if (!e?.[0]) return null
  const estatus = String(e[6] ?? '').trim().toUpperCase()
  return {
    id: String(e[0]),
    unidadId: String(e[1] ?? ''),
    planId: String(e[2] ?? '').trim().toLowerCase(),
    proximoKm: numOrNull(e[3]),
    proximaFecha: String(e[4] ?? ''),
    proximoHorometro: numOrNull(e[5]),
    estatus: ESTATUS_SERVICIO_PROGRAMADO.includes(estatus) ? estatus : 'PENDIENTE',
    otId: String(e[7] ?? ''),
  }
}

/** @param {Record<string, any>} aviso */
export function avisoLogToRow(aviso) {
  const o = aviso && typeof aviso === 'object' ? aviso : {}
  return [
    textCell(o.id),
    textCell(o.tipo).toUpperCase(),
    textCell(o.yarda).toLowerCase(),
    textCell(o.unidadId),
    textCell(o.canal || 'log').toLowerCase(),
    textCell(o.estatus || 'LOG').toUpperCase(),
    textCell(o.destino),
    textCell(o.mensaje),
    textCell(o.dedupeKey),
    textCell(o.horaServidor),
    textCell(o.detalle),
  ]
}

/** @param {unknown[] | null | undefined} e */
export function rowToAvisoLog(e) {
  if (!e?.[0]) return null
  return {
    id: String(e[0]),
    tipo: String(e[1] ?? '').trim().toUpperCase(),
    yarda: String(e[2] ?? '').trim().toLowerCase(),
    unidadId: String(e[3] ?? ''),
    canal: String(e[4] ?? 'log').trim().toLowerCase() || 'log',
    estatus: String(e[5] ?? 'LOG').trim().toUpperCase() || 'LOG',
    destino: String(e[6] ?? ''),
    mensaje: String(e[7] ?? ''),
    dedupeKey: String(e[8] ?? ''),
    horaServidor: String(e[9] ?? ''),
    detalle: String(e[10] ?? ''),
  }
}

/** @param {Record<string, any>} sub */
export function avisoSuscripcionToRow(sub) {
  const o = sub && typeof sub === 'object' ? sub : {}
  const canal = String(o.canal || 'whatsapp').trim().toLowerCase()
  return [
    textCell(o.id),
    textCell(o.tipo || '*').toUpperCase(),
    textCell(o.yarda || 'todas').toLowerCase(),
    canal === 'correo' ? 'email' : canal,
    textCell(o.destino),
    textCell(o.activo || 'SI'),
  ]
}

/** @param {unknown[] | null | undefined} e */
export function rowToAvisoSuscripcion(e) {
  if (!e?.[0]) return null
  const canalRaw = String(e[3] ?? '').trim().toLowerCase()
  return {
    id: String(e[0]),
    tipo: String(e[1] ?? '*').trim().toUpperCase() || '*',
    yarda: String(e[2] ?? 'todas').trim().toLowerCase() || 'todas',
    canal: canalRaw === 'correo' ? 'email' : canalRaw || 'whatsapp',
    destino: String(e[4] ?? ''),
    activo: readActivo(e[5]),
  }
}

function readStringList(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (item && typeof item === 'object') return String(item.placa || item.id || '').trim()
        return String(item ?? '').trim()
      })
      .filter(Boolean)
  }
  const text = String(raw).trim()
  if (text.startsWith('[')) {
    const parsed = parseJsonCell(text)
    if (Array.isArray(parsed)) return readStringList(parsed)
  }
  return text.split(/[|,]/).map((part) => part.trim()).filter(Boolean)
}

function readCajas(raw) {
  if (Array.isArray(raw)) return raw
  const parsed = parseJsonCell(raw)
  if (Array.isArray(parsed)) return parsed
  if (raw == null || raw === '') return []
  return String(raw).split(/[|,]/).map((part) => part.trim()).filter(Boolean)
}

/** @param {Record<string, any>} llegada */
export function llegadaToRow(llegada) {
  const o = llegada && typeof llegada === 'object' ? llegada : {}
  const estatus = String(o.estatus || 'PENDIENTE').trim().toUpperCase() === 'RECIBIDA' ? 'RECIBIDA' : 'PENDIENTE'
  return [
    textCell(o.id),
    textCell(o.viajeId),
    jsonArrayCell(readStringList(o.placas)),
    jsonArrayCell(readCajas(o.cajas ?? o.cajasJson)),
    textCell(o.dolly),
    textCell(o.sello).toUpperCase(),
    textCell(o.cartaPorte),
    textCell(o.eta),
    textCell(o.yardaId).toLowerCase(),
    textCell(o.horaServidor),
    estatus,
  ]
}

/** @param {unknown[] | null | undefined} e */
export function rowToLlegada(e) {
  if (!e?.[0] && !e?.[1]) return null
  const estatus = String(e[10] ?? '').trim().toUpperCase() === 'RECIBIDA' ? 'RECIBIDA' : 'PENDIENTE'
  return {
    id: String(e[0] ?? ''),
    viajeId: String(e[1] ?? ''),
    placas: readStringList(e[2]),
    cajas: readCajas(e[3]),
    dolly: String(e[4] ?? ''),
    sello: String(e[5] ?? ''),
    cartaPorte: String(e[6] ?? ''),
    eta: String(e[7] ?? ''),
    yardaId: String(e[8] ?? '').trim().toLowerCase(),
    horaServidor: String(e[9] ?? ''),
    estatus,
  }
}

function origenCell(m) {
  if (m.cliente || m.origen || m.destino) {
    return JSON.stringify({
      cliente: m.cliente ?? '',
      origen: m.origen ?? '',
      destino: m.destino ?? '',
    })
  }
  return textCell(m.origenDestino)
}

function parseOrigen(raw) {
  if (raw == null || raw === '') return {}
  const t = parseJsonCell(raw)
  if (t && typeof t === 'object' && !Array.isArray(t)) {
    const out = {}
    if (t.cliente) out.cliente = String(t.cliente)
    if (t.origen) out.origen = String(t.origen)
    if (t.destino) out.destino = String(t.destino)
    return out
  }
  if (typeof raw === 'object') return {}
  const text = String(raw)
  return { origenDestino: text, origen: text }
}

function placasCell(m) {
  const has =
    m.placaCamionTrasera || m.placaCaja1 || m.placaCaja2 || m.traePlacaTrasera != null || m.motivoSinPlacaTrasera
  if (!has) return ''
  return JSON.stringify({
    placaCamionTrasera: m.placaCamionTrasera ?? '',
    placaCaja1: m.placaCaja1 ?? '',
    placaCaja2: m.placaCaja2 ?? '',
    ...(m.traePlacaTrasera == null ? {} : { traePlacaTrasera: m.traePlacaTrasera }),
    ...(m.motivoSinPlacaTrasera ? { motivoSinPlacaTrasera: m.motivoSinPlacaTrasera } : {}),
  })
}

function parsePlacas(raw) {
  const t = parseJsonCell(raw)
  if (!t || typeof t !== 'object' || Array.isArray(t)) return {}
  const out = {}
  if (t.placaCamionTrasera) out.placaCamionTrasera = String(t.placaCamionTrasera)
  if (t.placaCaja1) out.placaCaja1 = String(t.placaCaja1)
  if (t.placaCaja2) out.placaCaja2 = String(t.placaCaja2)
  if (typeof t.traePlacaTrasera === 'boolean') out.traePlacaTrasera = t.traePlacaTrasera
  if (t.motivoSinPlacaTrasera) out.motivoSinPlacaTrasera = String(t.motivoSinPlacaTrasera)
  return out
}

function parseEvidencia(raw, fotos) {
  if (raw) {
    const parsed = parseJsonCell(raw)
    if (Array.isArray(parsed)) return parsed
  }
  return fotos.map((url, i) => ({ slotId: `legacy-${i}`, label: `Foto ${i + 1}`, url }))
}

function parseCumplimiento(raw) {
  if (raw == null || raw === '') return {}
  const obj = parseJsonCell(raw)
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const { selloCoincideEntrada, ...rest } = obj
  return { cumplimiento: rest, selloCoincideEntrada }
}

function parseRefrigerada(raw) {
  const t = parseJsonCell(raw)
  if (t && typeof t === 'object' && !Array.isArray(t) && Array.isArray(t.inocuidad)) return t
  return undefined
}

function motivoCell(m) {
  if (!m.motivoParo) return ''
  if (m.motivoParo === 'otro' && m.motivoParoOtro) return `otro|${m.motivoParoOtro}`
  return String(m.motivoParo)
}

function parseFase0(e) {
  const motivoRaw = String(e[30] ?? '').trim()
  const sep = motivoRaw.indexOf('|')
  const motivoParo = sep >= 0 ? motivoRaw.slice(0, sep).trim() : motivoRaw
  const motivoParoOtro = sep >= 0 ? motivoRaw.slice(sep + 1).trim() : ''
  return {
    ...(motivoParo ? { motivoParo } : {}),
    ...(motivoParoOtro ? { motivoParoOtro } : {}),
    ...(e[31] ? { paradoDesde: String(e[31]) } : {}),
    ...(e[32] ? { zonaSlot: String(e[32]) } : {}),
    ...(e[33] ? { usuarioEmail: String(e[33]) } : {}),
    ...(e[34] ? { horaServidor: String(e[34]) } : {}),
  }
}

/**
 * Movimiento de la app → fila A:AJ. Append-only; no interpreta fórmulas (el repo escribe RAW).
 * @param {Record<string, any>} mov
 * @returns {unknown[]}
 */
export function movimientoToRow(mov) {
  const m = mov && typeof mov === 'object' ? mov : {}
  const fotos = Array.isArray(m.fotos) ? m.fotos.map((f) => String(f ?? '').trim()).filter(Boolean) : []
  const checklist = Array.isArray(m.checklist) ? m.checklist : []
  const evidencia = Array.isArray(m.fotosEvidencia) ? m.fotosEvidencia : []
  const cumplimiento = {
    ...(m.cumplimiento && typeof m.cumplimiento === 'object' && !Array.isArray(m.cumplimiento) ? m.cumplimiento : {}),
  }
  delete cumplimiento.selloCoincideEntrada
  const row = Array(MOVIMIENTO_COLUMNS.length).fill('')
  row[0] = textCell(m.id)
  row[1] = textCell(m.tipo)
  row[2] = textCell(m.equipoId)
  row[3] = textCell(m.placa)
  row[4] = textCell(m.numeroEconomico)
  row[5] = textCell(m.equipoTipo)
  row[6] = textCell(m.fechaHora)
  row[7] = textCell(m.operador)
  row[8] = textCell(m.chofer)
  row[9] = origenCell(m)
  row[10] = numCell(m.kilometros)
  row[11] = numCell(m.dieselPorcentaje)
  row[12] = numCell(m.dieselLitros)
  row[13] = JSON.stringify(checklist)
  row[14] = fotos.join('|')
  row[15] = textCell(m.condicionGeneral)
  row[16] = textCell(m.observaciones)
  row[17] = textCell(m.creadoEn)
  row[18] = textCell(m.yardaId)
  row[19] = textCell(m.selloNumero)
  row[20] = textCell(m.firmaNombre)
  row[21] = textCell(m.firmaUrl)
  row[22] = numCell(m.geoLat)
  row[23] = JSON.stringify(evidencia)
  row[24] = numCell(m.geoLng)
  row[25] = JSON.stringify({ ...cumplimiento, selloCoincideEntrada: m.selloCoincideEntrada ?? null })
  row[26] = placasCell(m)
  row[27] = textCell(m.empresaId ?? 'api')
  row[28] = m.llevaRefrigerada && m.refrigerada ? JSON.stringify(m.refrigerada) : ''
  row[29] = textCell(m.whatsapp)
  row[30] = motivoCell(m)
  row[31] = textCell(m.paradoDesde)
  row[32] = textCell(m.zonaSlot)
  row[33] = textCell(m.usuarioEmail)
  row[34] = textCell(m.horaServidor)
  row[MOVIMIENTO_COLUMNS.indexOf('viajeId')] = textCell(m.viajeId)
  return row
}

/**
 * Fila A:AJ → movimiento público (misma forma que Yt en App.jsx).
 * @param {unknown[] | null | undefined} e
 */
export function rowToMovimiento(e) {
  if (!e?.[0] || !e?.[1]) return null
  const fotosPipe = String(e[14] ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  const evidencia = parseEvidencia(e[23], fotosPipe)
  const ref = parseRefrigerada(e[28])
  const checklist = parseJsonCell(e[13])
  return {
    id: String(e[0]),
    tipo: String(e[1]),
    equipoId: e[2] == null ? '' : String(e[2]),
    placa: e[3] == null ? '' : String(e[3]),
    numeroEconomico: e[4] == null ? '' : String(e[4]),
    equipoTipo: e[5] || 'camion',
    fechaHora: e[6] == null ? '' : String(e[6]),
    operador: e[7] == null ? '' : String(e[7]),
    ...(e[8] ? { chofer: String(e[8]) } : {}),
    ...(e[29] ? { whatsapp: String(e[29]) } : {}),
    ...parseOrigen(e[9]),
    kilometros: numOrNull(e[10]),
    dieselPorcentaje: numOrNull(e[11]),
    dieselLitros: numOrNull(e[12]),
    checklist: Array.isArray(checklist) ? checklist : [],
    fotos: evidencia.map((item) => item?.url).filter((url) => typeof url === 'string' && url),
    condicionGeneral: e[15] || 'buena',
    ...(e[16] ? { observaciones: String(e[16]) } : {}),
    creadoEn: e[17] || e[6] || '',
    yardaId: e[18] || 'chihuahua',
    ...(e[19] ? { selloNumero: String(e[19]) } : {}),
    ...(e[20] ? { firmaNombre: String(e[20]) } : {}),
    ...(e[21] ? { firmaUrl: String(e[21]) } : {}),
    geoLat: numOrNull(e[22]),
    geoLng: numOrNull(e[24]),
    fotosEvidencia: evidencia,
    ...parseCumplimiento(e[25]),
    ...parsePlacas(e[26]),
    empresaId: e[27] || 'api',
    ...(ref ? { llevaRefrigerada: true, refrigerada: ref } : {}),
    ...parseFase0(e),
    ...(e[35] ? { viajeId: String(e[35]) } : {}),
  }
}

/**
 * Equipo → fila A:I. Igual que Ut: la placa va en C y el económico vacío no se inventa aquí.
 * @param {Record<string, any>} equipo
 */
export function equipoToRow(equipo) {
  const e = equipo && typeof equipo === 'object' ? equipo : {}
  return [e.id, e.tipo, e.placa, e.numeroEconomico, e.marca ?? '', e.modelo ?? '', e.notas ?? '', e.creadoEn, e.operadorAsignado ?? '']
}

/**
 * Fila A:I → equipo. Sin id (A) o sin placa (C) no cuenta, igual que Ht.
 * @param {unknown[] | null | undefined} e
 */
export function rowToEquipo(e) {
  if (!e?.[0] || !e?.[2]) return null
  return {
    id: e[0],
    tipo: e[1] || 'camion',
    placa: e[2],
    numeroEconomico: e[3] || e[2],
    marca: e[4] || undefined,
    modelo: e[5] || undefined,
    notas: e[6] || undefined,
    creadoEn: e[7] || new Date().toISOString(),
    operadorAsignado: e[8] || undefined,
  }
}

/**
 * Refrigeración → fila A:I. Igual que cn: el horómetro vacío queda en blanco (columna F).
 * @param {Record<string, any>} refri
 */
export function refrigeracionToRow(refri) {
  const e = refri && typeof refri === 'object' ? refri : {}
  return [e.id, e.marca, e.modelo, e.numeroActivo, e.economicoMontado, e.horometro ?? '', e.estatus, e.notas ?? '', e.creadoEn]
}

/**
 * Fila A:I → refrigeración. Sin id o sin número de activo (D) no cuenta, igual que sn.
 * @param {unknown[] | null | undefined} e
 */
export function rowToRefrigeracion(e) {
  if (!e?.[0] || !e?.[3]) return null
  return {
    id: e[0],
    marca: e[1] || '',
    modelo: e[2] || '',
    numeroActivo: e[3],
    economicoMontado: e[4] || '',
    horometro: e[5] === '' || e[5] == null ? null : Number(e[5]),
    estatus: e[6] || 'operando',
    notas: e[7] || undefined,
    creadoEn: e[8] || new Date().toISOString(),
  }
}

/**
 * Entrada de `equipoId` que no tiene después una salida, parado o baja del mismo equipo.
 * Recorre en orden de hoja (append), no por fecha del dispositivo.
 * @param {Array<{ id?: string, tipo?: string, equipoId?: string, placa?: string }> | null | undefined} movimientos
 * @param {string} equipoId
 */
export function findOpenEntradaIn(movimientos, equipoId) {
  const want = String(equipoId ?? '').trim()
  if (!want) return null
  let open = null
  for (const m of movimientos ?? []) {
    if (String(m?.equipoId ?? '').trim() !== want) continue
    const tipo = String(m?.tipo ?? '').trim().toLowerCase()
    if (tipo === 'entrada') open = m
    else if (TIPOS_QUE_CIERRAN_ENTRADA.includes(tipo)) open = null
  }
  return open
}

/**
 * @param {{ email?: string, privateKey?: string, spreadsheetId?: string, fetch?: typeof fetch, env?: NodeJS.ProcessEnv, appsScriptUrl?: string, appsScriptSecret?: string, timeoutMs?: number }} [opts]
 */
export function createSheetsRepo(opts = {}) {
  const envSource = opts.env ?? process.env
  const env = readServiceAccountEnv(envSource)
  const email = opts.email ?? env.email
  const privateKey = opts.privateKey != null ? normalizePrivateKey(opts.privateKey) : env.privateKey
  const spreadsheetId = String(opts.spreadsheetId ?? env.spreadsheetId ?? '').trim()
  const fetchImpl = opts.fetch ?? globalThis.fetch
  const appsEnv = readAppsScriptEnv(envSource)
  const appsUrl = String(opts.appsScriptUrl ?? appsEnv.url ?? '').trim()
  const appsSecret = String(opts.appsScriptSecret ?? appsEnv.secret ?? '').trim()
  // La cuenta de servicio gana si email, llave y spreadsheet están completos.
  const saReady = Boolean(email && privateKey && spreadsheetId)
  const appsReady = !saReady && Boolean(appsUrl && appsSecret && spreadsheetId)
  const appsTransport = appsReady
    ? createAppsScriptTransport(envSource, {
        fetch: fetchImpl,
        url: appsUrl,
        secret: appsSecret,
        spreadsheetId,
        timeoutMs: opts.timeoutMs,
      })
    : null

  let cached = { token: '', exp: 0 }

  function assertConfig() {
    if (saReady || appsReady) return
    throw repoError(
      'Backend Sheets no configurado. Cuenta de servicio: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / PATIO_SPREADSHEET_ID. O puente Apps Script (sin JSON): PATIO_APPS_SCRIPT_URL / PATIO_APPS_SCRIPT_SECRET / PATIO_SPREADSHEET_ID.',
      503,
      'NO_CONFIG',
    )
  }

  async function getAccessToken() {
    if (appsReady) {
      throw repoError('Apps Script mode: esta ruta no usa token de cuenta de servicio.', 501, 'APPS_SCRIPT')
    }
    assertConfig()
    const now = Math.floor(Date.now() / 1000)
    if (cached.token && cached.exp - 60 > now) return cached.token
    const key = await importPKCS8(privateKey, 'RS256')
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(email)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key)
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.access_token) {
      throw repoError(`Token de cuenta de servicio falló: ${data.error_description || data.error || res.status}`, 502, 'SA_TOKEN')
    }
    cached = { token: data.access_token, exp: now + Number(data.expires_in || 3600) }
    return cached.token
  }

  async function request(pathAndQuery, init = {}) {
    const token = await getAccessToken()
    const res = await fetchImpl(`${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}${pathAndQuery}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw repoError(`Sheets error ${res.status}: ${text.slice(0, 300)}`, res.status >= 500 ? 502 : res.status)
    }
    return res.json()
  }

  /** @param {string} range A1 (p. ej. `Autorizados!A2:S`) */
  async function sheetsGet(range) {
    if (appsReady) return appsTransport.sheetsGet(range)
    const data = await request(`/values/${encodeURIComponent(range)}`)
    return data.values ?? []
  }

  /** @param {string} range @param {unknown[][]} values */
  async function sheetsAppend(range, values) {
    const grid = values.map((r) => r.map(toCell))
    if (appsReady) return appsTransport.sheetsAppend(range, grid)
    return request(
      `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: grid }) },
    )
  }

  /** @param {string} range @param {unknown[][]} values */
  async function sheetsUpdate(range, values) {
    const grid = values.map((r) => r.map(toCell))
    if (appsReady) return appsTransport.sheetsUpdate(range, grid)
    return request(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: grid }),
    })
  }

  async function getSpreadsheetMeta() {
    if (appsReady) return appsTransport.getSpreadsheetMeta()
    return request(`?fields=${encodeURIComponent('sheets(properties(sheetId,title,gridProperties))')}`)
  }

  /** @param {object[]} requests */
  async function batchUpdate(requests) {
    if (appsReady) return appsTransport.batchUpdate(requests)
    return request(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) })
  }

  async function loadAutorizados() {
    const rows = await sheetsGet('Autorizados!A2:S')
    return rows.map(parseAutorizadoRow).filter(Boolean)
  }

  let auditoriaHeaderOk = false
  async function ensureAuditoriaHeader() {
    if (auditoriaHeaderOk) return
    const row = (await sheetsGet(`${AUDITORIA_SHEET}!A1:J1`))[0] ?? []
    if (!row.some((c) => String(c ?? '').trim())) {
      await sheetsUpdate(`${AUDITORIA_SHEET}!A1:J1`, [AUDITORIA_HEADERS])
    }
    auditoriaHeaderOk = true
  }

  /**
   * @param {{ usuarioEmail?: string, rol?: string, accion: string, entidad?: string, entidadId?: string, antes?: unknown, despues?: unknown, dispositivoId?: string }} entry
   */
  async function appendAuditoria(entry) {
    await ensureAuditoriaHeader()
    const row = [
      uuidv4(),
      new Date().toISOString(),
      entry.usuarioEmail ?? '',
      entry.rol ?? '',
      entry.accion,
      entry.entidad ?? '',
      entry.entidadId ?? '',
      entry.antes == null ? '' : JSON.stringify(entry.antes),
      entry.despues == null ? '' : JSON.stringify(entry.despues),
      entry.dispositivoId ?? '',
    ]
    await sheetsAppend(`${AUDITORIA_SHEET}!A:J`, [row])
    return row[0]
  }

  /** Filas A2:AJ en orden de hoja (más antiguo primero). Si AJ no existe, lee A:AI. */
  async function listMovimientos() {
    try {
      const rows = await sheetsGet(MOVIMIENTOS_READ_RANGE)
      return rows.map(rowToMovimiento).filter(Boolean)
    } catch (err) {
      if (/exceeds grid limits|grid limits/i.test(String(err?.message ?? ''))) {
        const rows = await sheetsGet(MOVIMIENTOS_READ_RANGE_FASE4)
        return rows.map(rowToMovimiento).filter(Boolean)
      }
      throw err
    }
  }

  async function findMovimientoById(id) {
    const want = String(id ?? '').trim()
    if (!want) return null
    const all = await listMovimientos()
    return all.find((m) => String(m.id) === want) ?? null
  }

  /**
   * Agrega una fila. Nunca limpia ni reescribe la pestaña Movimientos.
   * @param {unknown[]} rowValues
   */
  async function appendMovimiento(rowValues) {
    if (!Array.isArray(rowValues) || rowValues.length === 0) {
      throw repoError('Fila de movimiento vacía', 400, 'ROW')
    }
    try {
      return await sheetsAppend(MOVIMIENTOS_APPEND_RANGE, [rowValues])
    } catch (err) {
      if (/exceeds grid limits|grid limits/i.test(String(err?.message ?? ''))) {
        if (rowValues.length > 35) {
          try {
            return await sheetsAppend(MOVIMIENTOS_APPEND_RANGE_FASE4, [rowValues.slice(0, 35)])
          } catch (retryErr) {
            if (!/exceeds grid limits|grid limits/i.test(String(retryErr?.message ?? ''))) throw retryErr
          }
        }
        throw repoError(
          'La hoja Movimientos no tiene columnas hasta AJ (viajeId). Ejecuta npm run migrate:fase0 y npm run migrate:fase5.',
          503,
          'GRID',
        )
      }
      throw err
    }
  }

  async function findOpenEntrada(equipoId) {
    return findOpenEntradaIn(await listMovimientos(), equipoId)
  }

  function migrateHint(title) {
    if (title === LLEGADAS_ESPERADAS_SHEET) return 'npm run migrate:fase5'
    if (
      title === PLAN_PREVENTIVO_SHEET ||
      title === SERVICIO_PROGRAMADO_SHEET ||
      title === AVISOS_LOG_SHEET ||
      title === AVISOS_SUSCRIPCIONES_SHEET
    ) {
      return 'npm run migrate:fase4'
    }
    if (title === DEFECTOS_SHEET) return 'npm run migrate:fase3'
    if (title === ZONAS_SLOTS_SHEET || title === CONTEOS_SHEET) return 'npm run migrate:fase2'
    if (title === ESTADO_UNIDAD_SHEET) return 'npm run migrate:fase2'
    if (title === OT_SHEET || title === OT_EVENTOS_SHEET) return 'npm run migrate:fase1'
    return 'npm run migrate:fase0'
  }

  function missingSheet(err, title) {
    if (/unable to parse range|not found|Requested entity was not found/i.test(String(err?.message ?? ''))) {
      throw repoError(`Falta la pestaña ${title}. Ejecuta ${migrateHint(title)}.`, 503, 'NO_SHEET')
    }
    return err
  }

  async function sheetsGetTab(range, title) {
    try {
      return await sheetsGet(range)
    } catch (err) {
      throw missingSheet(err, title)
    }
  }

  /**
   * Actualiza UNA fila (la que tiene `id` en la columna A). No limpia ni reescribe el resto.
   * @param {string} sheetTitle
   * @param {string[]} columns
   * @param {string} id
   * @param {unknown[]} rowValues
   */
  async function updateRowById(sheetTitle, columns, id, rowValues) {
    const want = String(id ?? '').trim()
    if (!want) throw repoError('Falta el id para actualizar.', 400, 'ID')
    if (!Array.isArray(rowValues) || rowValues.length === 0) throw repoError('Fila vacía', 400, 'ROW')
    const padded = Array(columns.length).fill('')
    for (let i = 0; i < columns.length; i++) padded[i] = rowValues[i] ?? ''
    const colA = await sheetsGetTab(`${sheetTitle}!A:A`, sheetTitle)
    const idx = findDataRowIndex(colA, want)
    if (idx < 0) throw repoError(`No se encontró ${want} en ${sheetTitle}.`, 404, 'NOT_FOUND')
    const range = singleRowRange(sheetTitle, idx + 1, columns.length)
    await sheetsUpdate(range, [padded])
    return { rowNumber: idx + 1, range }
  }

  async function appendTab(range, title, rowValues) {
    if (!Array.isArray(rowValues) || rowValues.length === 0) throw repoError('Fila vacía', 400, 'ROW')
    try {
      return await sheetsAppend(range, [rowValues])
    } catch (err) {
      if (/exceeds grid limits|grid limits/i.test(String(err?.message ?? ''))) {
        throw repoError(`La hoja ${title} no tiene las columnas necesarias. Ejecuta ${migrateHint(title)}.`, 503, 'GRID')
      }
      throw missingSheet(err, title)
    }
  }

  async function listOrdenesTrabajo() {
    const rows = await sheetsGetTab(OT_READ_RANGE, OT_SHEET)
    return rows.map(rowToOt).filter(Boolean)
  }

  async function appendOrdenTrabajo(rowValues) {
    return appendTab(OT_APPEND_RANGE, OT_SHEET, rowValues)
  }

  async function updateOrdenTrabajoById(id, rowValues) {
    return updateRowById(OT_SHEET, OT_COLUMNS, id, rowValues)
  }

  async function listOtEventos() {
    const rows = await sheetsGetTab(OT_EVENTOS_READ_RANGE, OT_EVENTOS_SHEET)
    return rows.map(rowToOtEvento).filter(Boolean)
  }

  async function appendOtEvento(rowValues) {
    return appendTab(OT_EVENTOS_APPEND_RANGE, OT_EVENTOS_SHEET, rowValues)
  }

  async function listEstadoUnidad() {
    const rows = await sheetsGetTab(ESTADO_UNIDAD_READ_RANGE, ESTADO_UNIDAD_SHEET)
    return rows.map(rowToEstadoUnidad).filter(Boolean)
  }

  async function appendEstadoUnidad(rowValues) {
    return appendTab(ESTADO_UNIDAD_APPEND_RANGE, ESTADO_UNIDAD_SHEET, rowValues)
  }

  async function updateEstadoUnidadById(unidadId, rowValues) {
    return updateRowById(ESTADO_UNIDAD_SHEET, ESTADO_UNIDAD_COLUMNS, unidadId, rowValues)
  }

  async function listZonasSlots() {
    const rows = await sheetsGetTab(ZONAS_SLOTS_READ_RANGE, ZONAS_SLOTS_SHEET)
    return rows.map(rowToZonaSlot).filter(Boolean)
  }

  async function appendZonaSlot(rowValues) {
    return appendTab(ZONAS_SLOTS_APPEND_RANGE, ZONAS_SLOTS_SHEET, rowValues)
  }

  async function updateZonaSlotById(id, rowValues) {
    return updateRowById(ZONAS_SLOTS_SHEET, ZONAS_SLOTS_COLUMNS, id, rowValues)
  }

  async function listConteos() {
    const rows = await sheetsGetTab(CONTEOS_READ_RANGE, CONTEOS_SHEET)
    return rows.map(rowToConteo).filter(Boolean)
  }

  async function appendConteo(rowValues) {
    return appendTab(CONTEOS_APPEND_RANGE, CONTEOS_SHEET, rowValues)
  }

  async function updateConteoById(id, rowValues) {
    return updateRowById(CONTEOS_SHEET, CONTEOS_COLUMNS, id, rowValues)
  }

  async function listDefectos() {
    const rows = await sheetsGetTab(DEFECTOS_READ_RANGE, DEFECTOS_SHEET)
    return rows.map(rowToDefecto).filter(Boolean)
  }

  async function appendDefecto(rowValues) {
    return appendTab(DEFECTOS_APPEND_RANGE, DEFECTOS_SHEET, rowValues)
  }

  async function listPlanesPreventivo() {
    const rows = await sheetsGetTab(PLAN_PREVENTIVO_READ_RANGE, PLAN_PREVENTIVO_SHEET)
    return rows.map(rowToPlanPreventivo).filter(Boolean)
  }

  async function appendPlanPreventivo(rowValues) {
    return appendTab(PLAN_PREVENTIVO_APPEND_RANGE, PLAN_PREVENTIVO_SHEET, rowValues)
  }

  async function updatePlanPreventivoByTipo(tipoUnidad, rowValues) {
    return updateRowById(
      PLAN_PREVENTIVO_SHEET,
      PLAN_PREVENTIVO_COLUMNS,
      String(tipoUnidad || '').trim().toLowerCase(),
      rowValues,
    )
  }

  async function listServiciosProgramados() {
    const rows = await sheetsGetTab(SERVICIO_PROGRAMADO_READ_RANGE, SERVICIO_PROGRAMADO_SHEET)
    return rows.map(rowToServicioProgramado).filter(Boolean)
  }

  async function appendServicioProgramado(rowValues) {
    return appendTab(SERVICIO_PROGRAMADO_APPEND_RANGE, SERVICIO_PROGRAMADO_SHEET, rowValues)
  }

  async function updateServicioProgramadoById(id, rowValues) {
    return updateRowById(SERVICIO_PROGRAMADO_SHEET, SERVICIO_PROGRAMADO_COLUMNS, id, rowValues)
  }

  async function listAvisosLog() {
    const rows = await sheetsGetTab(AVISOS_LOG_READ_RANGE, AVISOS_LOG_SHEET)
    return rows.map(rowToAvisoLog).filter(Boolean)
  }

  async function appendAvisoLog(rowValues) {
    return appendTab(AVISOS_LOG_APPEND_RANGE, AVISOS_LOG_SHEET, rowValues)
  }

  async function listAvisosSuscripciones() {
    const rows = await sheetsGetTab(AVISOS_SUSCRIPCIONES_READ_RANGE, AVISOS_SUSCRIPCIONES_SHEET)
    return rows.map(rowToAvisoSuscripcion).filter(Boolean)
  }

  async function appendAvisoSuscripcion(rowValues) {
    return appendTab(AVISOS_SUSCRIPCIONES_APPEND_RANGE, AVISOS_SUSCRIPCIONES_SHEET, rowValues)
  }

  async function updateAvisoSuscripcionById(id, rowValues) {
    return updateRowById(AVISOS_SUSCRIPCIONES_SHEET, AVISOS_SUSCRIPCIONES_COLUMNS, id, rowValues)
  }

  async function listLlegadasEsperadas() {
    const rows = await sheetsGetTab(LLEGADAS_ESPERADAS_READ_RANGE, LLEGADAS_ESPERADAS_SHEET)
    return rows.map(rowToLlegada).filter((item) => item && (item.id || item.viajeId))
  }

  async function appendLlegadaEsperada(rowValues) {
    return appendTab(LLEGADAS_ESPERADAS_APPEND_RANGE, LLEGADAS_ESPERADAS_SHEET, rowValues)
  }

  async function updateLlegadaEsperadaById(id, rowValues) {
    return updateRowById(LLEGADAS_ESPERADAS_SHEET, LLEGADAS_ESPERADAS_COLUMNS, id, rowValues)
  }

  async function listEquipos() {
    const rows = await sheetsGetTab(EQUIPOS_READ_RANGE, EQUIPOS_SHEET)
    return rows.map(rowToEquipo).filter(Boolean)
  }

  async function appendEquipo(rowValues) {
    return appendTab(EQUIPOS_APPEND_RANGE, EQUIPOS_SHEET, rowValues)
  }

  async function updateEquipoById(id, rowValues) {
    return updateRowById(EQUIPOS_SHEET, EQUIPOS_COLUMNS, id, rowValues)
  }

  async function listRefrigeracion() {
    const rows = await sheetsGetTab(REFRIGERACION_READ_RANGE, REFRIGERACION_SHEET)
    return rows.map(rowToRefrigeracion).filter(Boolean)
  }

  async function appendRefrigeracion(rowValues) {
    return appendTab(REFRIGERACION_APPEND_RANGE, REFRIGERACION_SHEET, rowValues)
  }

  async function updateRefrigeracionById(id, rowValues) {
    return updateRowById(REFRIGERACION_SHEET, REFRIGERACION_COLUMNS, id, rowValues)
  }

  /**
   * Deja en blanco una sola fila (la del id en la columna A).
   * No limpia el resto de la pestaña ni reescribe A2:I.
   * @param {string} sheetTitle
   * @param {string[]} columns
   * @param {string} id
   */
  async function clearRowById(sheetTitle, columns, id) {
    const blank = Array(columns.length).fill('')
    return updateRowById(sheetTitle, columns, id, blank)
  }

  async function clearEquipoById(id) {
    return clearRowById(EQUIPOS_SHEET, EQUIPOS_COLUMNS, id)
  }

  async function clearRefrigeracionById(id) {
    return clearRowById(REFRIGERACION_SHEET, REFRIGERACION_COLUMNS, id)
  }

  return {
    spreadsheetId,
    getAccessToken,
    sheetsGet,
    sheetsAppend,
    sheetsUpdate,
    getSpreadsheetMeta,
    batchUpdate,
    loadAutorizados,
    ensureAuditoriaHeader,
    appendAuditoria,
    listMovimientos,
    findMovimientoById,
    appendMovimiento,
    findOpenEntrada,
    listOrdenesTrabajo,
    appendOrdenTrabajo,
    updateOrdenTrabajoById,
    listOtEventos,
    appendOtEvento,
    listEstadoUnidad,
    appendEstadoUnidad,
    updateEstadoUnidadById,
    listZonasSlots,
    appendZonaSlot,
    updateZonaSlotById,
    listConteos,
    appendConteo,
    updateConteoById,
    listDefectos,
    appendDefecto,
    listPlanesPreventivo,
    appendPlanPreventivo,
    updatePlanPreventivoByTipo,
    listServiciosProgramados,
    appendServicioProgramado,
    updateServicioProgramadoById,
    listAvisosLog,
    appendAvisoLog,
    listAvisosSuscripciones,
    appendAvisoSuscripcion,
    updateAvisoSuscripcionById,
    listLlegadasEsperadas,
    appendLlegadaEsperada,
    updateLlegadaEsperadaById,
    listEquipos,
    appendEquipo,
    updateEquipoById,
    listRefrigeracion,
    appendRefrigeracion,
    updateRefrigeracionById,
    clearRowById,
    clearEquipoById,
    clearRefrigeracionById,
  }
}

let defaultRepo = null
function repo() {
  if (!defaultRepo) defaultRepo = createSheetsRepo()
  return defaultRepo
}

export const getAccessToken = () => repo().getAccessToken()
export const sheetsGet = (range) => repo().sheetsGet(range)
export const sheetsAppend = (range, values) => repo().sheetsAppend(range, values)
export const sheetsUpdate = (range, values) => repo().sheetsUpdate(range, values)
export const loadAutorizados = () => repo().loadAutorizados()
export const ensureAuditoriaHeader = () => repo().ensureAuditoriaHeader()
export const appendAuditoria = (entry) => repo().appendAuditoria(entry)
export const listMovimientos = () => repo().listMovimientos()
export const findMovimientoById = (id) => repo().findMovimientoById(id)
export const appendMovimiento = (rowValues) => repo().appendMovimiento(rowValues)
export const findOpenEntrada = (equipoId) => repo().findOpenEntrada(equipoId)
export const listEquipos = () => repo().listEquipos()
export const appendEquipo = (rowValues) => repo().appendEquipo(rowValues)
export const updateEquipoById = (id, rowValues) => repo().updateEquipoById(id, rowValues)
export const listRefrigeracion = () => repo().listRefrigeracion()
export const appendRefrigeracion = (rowValues) => repo().appendRefrigeracion(rowValues)
export const updateRefrigeracionById = (id, rowValues) => repo().updateRefrigeracionById(id, rowValues)
export const clearRowById = (sheetTitle, columns, id) => repo().clearRowById(sheetTitle, columns, id)
export const clearEquipoById = (id) => repo().clearEquipoById(id)
export const clearRefrigeracionById = (id) => repo().clearRefrigeracionById(id)

export function getSheetsRepo() {
  return repo()
}
