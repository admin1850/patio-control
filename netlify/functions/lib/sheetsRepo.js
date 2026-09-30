/**
 * Repositorio de Google Sheets vía cuenta de servicio (servidor).
 * Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, PATIO_SPREADSHEET_ID
 * La hoja debe estar compartida (Editor) con GOOGLE_SERVICE_ACCOUNT_EMAIL.
 *
 * Reglas: nunca se limpian pestañas; Auditoria es solo append.
 * Escrituras con valueInputOption=RAW para que un texto tipo "=FORMULA" no se evalúe.
 */

import { SignJWT, importPKCS8 } from 'jose'
import { v4 as uuidv4 } from 'uuid'
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

/** Columnas A:AI de Movimientos, mismo orden que App.jsx (Qt / Yt), incluidas AE:AI. */
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
]

export const MOVIMIENTOS_READ_RANGE = 'Movimientos!A2:AI'
export const MOVIMIENTOS_APPEND_RANGE = 'Movimientos!A:AI'

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
 * Movimiento de la app → fila A:AI. Append-only; no interpreta fórmulas (el repo escribe RAW).
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
  return row
}

/**
 * Fila A:AI → movimiento público (misma forma que Yt en App.jsx).
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
 * @param {{ email?: string, privateKey?: string, spreadsheetId?: string, fetch?: typeof fetch }} [opts]
 */
export function createSheetsRepo(opts = {}) {
  const env = readServiceAccountEnv()
  const email = opts.email ?? env.email
  const privateKey = opts.privateKey != null ? normalizePrivateKey(opts.privateKey) : env.privateKey
  const spreadsheetId = opts.spreadsheetId ?? env.spreadsheetId
  const fetchImpl = opts.fetch ?? globalThis.fetch

  let cached = { token: '', exp: 0 }

  function assertConfig() {
    if (!email || !privateKey || !spreadsheetId) {
      throw repoError(
        'Backend Sheets no configurado (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / PATIO_SPREADSHEET_ID)',
        503,
        'NO_CONFIG',
      )
    }
  }

  async function getAccessToken() {
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
    const data = await request(`/values/${encodeURIComponent(range)}`)
    return data.values ?? []
  }

  /** @param {string} range @param {unknown[][]} values */
  async function sheetsAppend(range, values) {
    return request(
      `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: values.map((r) => r.map(toCell)) }) },
    )
  }

  /** @param {string} range @param {unknown[][]} values */
  async function sheetsUpdate(range, values) {
    return request(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: values.map((r) => r.map(toCell)) }),
    })
  }

  async function getSpreadsheetMeta() {
    return request(`?fields=${encodeURIComponent('sheets(properties(sheetId,title,gridProperties))')}`)
  }

  /** @param {object[]} requests */
  async function batchUpdate(requests) {
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

  /** Filas A2:AI en orden de hoja (más antiguo primero). */
  async function listMovimientos() {
    const rows = await sheetsGet(MOVIMIENTOS_READ_RANGE)
    return rows.map(rowToMovimiento).filter(Boolean)
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
        throw repoError(
          'La hoja Movimientos no tiene columnas hasta AI. Ejecuta npm run migrate:fase0.',
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

export function getSheetsRepo() {
  return repo()
}
