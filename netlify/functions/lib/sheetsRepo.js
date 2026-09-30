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
