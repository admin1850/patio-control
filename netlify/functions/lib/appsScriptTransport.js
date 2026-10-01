/**
 * Transporte HTTP hacia el Web App de Apps Script (PatioBridge.gs).
 * Env: PATIO_APPS_SCRIPT_URL, PATIO_APPS_SCRIPT_SECRET, PATIO_SPREADSHEET_ID.
 * El secreto va en el cuerpo y en Authorization. No se escribe en los errores.
 */

const DEFAULT_TIMEOUT_MS = 20000

export function readAppsScriptEnv(env = process.env) {
  const source = env ?? process.env
  return {
    url: String(source.PATIO_APPS_SCRIPT_URL ?? '').trim(),
    secret: String(source.PATIO_APPS_SCRIPT_SECRET ?? '').trim(),
    spreadsheetId: String(source.PATIO_SPREADSHEET_ID ?? '').trim(),
  }
}

export function hasAppsScriptEnv(env = process.env) {
  const c = readAppsScriptEnv(env)
  return Boolean(c.url && c.secret && c.spreadsheetId)
}

function scriptError(message, status, code = 'APPS_SCRIPT') {
  const err = new Error(message)
  err.status = status
  err.code = code
  return err
}

function redact(message, secret) {
  const text = String(message ?? '')
  if (!secret) return text
  return text.split(secret).join('[redactado]')
}

function snippet(text) {
  return String(text || '').replace(/\s+/g, ' ').slice(0, 180)
}

function statusFor(data) {
  const code = String(data?.code || '')
  const numeric = Number(data?.status)
  if (Number.isFinite(numeric) && numeric >= 400) return numeric
  if (code === 'SECRET' || code === 'NO_CONFIG' || code === 'BUSY') return 503
  if (code === 'NOT_IMPLEMENTED') return 501
  if (code === 'NOT_IN_FOLDER' || code === 'NOT_FOUND') return 404
  if (code === 'MIME') return 415
  if (code === 'TOO_BIG') return 413
  if (code === 'GRID') return 400
  return 502
}

function normalizeMeta(data) {
  const sheets = Array.isArray(data?.sheets) ? data.sheets : []
  return {
    sheets: sheets.map((sheet) => {
      const props = sheet?.properties
      const title = props?.title || sheet?.title || sheet?.name || ''
      if (props?.title) {
        return {
          properties: {
            sheetId: props.sheetId,
            title: props.title,
            gridProperties: props.gridProperties || {},
          },
        }
      }
      return {
        properties: {
          sheetId: sheet?.sheetId,
          title,
          gridProperties: sheet?.gridProperties || {
            columnCount: sheet?.columnCount,
            rowCount: sheet?.rowCount,
          },
        },
      }
    }),
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ url?: string, secret?: string, spreadsheetId?: string, fetch?: typeof fetch, timeoutMs?: number, folderId?: string }} [opts]
 */
export function createAppsScriptTransport(env = process.env, opts = {}) {
  const fromEnv = readAppsScriptEnv(env)
  const url = String(opts.url ?? fromEnv.url ?? '').trim()
  const secret = String(opts.secret ?? fromEnv.secret ?? '').trim()
  const spreadsheetId = String(opts.spreadsheetId ?? fromEnv.spreadsheetId ?? '').trim()
  const fetchImpl = opts.fetch ?? globalThis.fetch
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS
  const folderId = String(opts.folderId ?? env?.PATIO_DRIVE_FOLDER_ID ?? '').trim()

  async function postJson(payload) {
    if (!url || !secret) {
      throw scriptError('Falta PATIO_APPS_SCRIPT_URL o PATIO_APPS_SCRIPT_SECRET.', 503, 'NO_CONFIG')
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let current = url
    try {
      for (let hop = 0; hop < 5; hop++) {
        let res
        try {
          res = await fetchImpl(current, {
            method: 'POST',
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${secret}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(payload),
          })
        } catch (err) {
          if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
            throw scriptError('Apps Script no respondió a tiempo.', 503, 'TIMEOUT')
          }
          throw scriptError(redact(`No se pudo contactar el puente Apps Script. ${err?.message || ''}`.trim(), secret), 503, 'NETWORK')
        }
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location')
          if (!loc) throw scriptError('Apps Script redirigió sin destino.', 502, 'REDIRECT')
          current = new URL(loc, current).href
          continue
        }
        const text = await res.text().catch(() => '')
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          throw scriptError(
            'Apps Script no está publicado como aplicación web (acceso: Cualquiera) o la URL no es /exec.',
            503,
            'APPS_SCRIPT_HTTP',
          )
        }
        let data
        try {
          data = JSON.parse(text)
        } catch {
          throw scriptError(
            redact(`Apps Script no devolvió JSON (${res.status}). ${snippet(text)}`.trim(), secret),
            502,
            'APPS_SCRIPT_BAD_RESPONSE',
          )
        }
        if (!data || typeof data !== 'object') {
          throw scriptError('Apps Script devolvió una respuesta vacía.', 502, 'APPS_SCRIPT_BAD_RESPONSE')
        }
        if (data.ok === false) {
          const status = statusFor(data)
          throw scriptError(redact(data.error || 'Apps Script rechazó la operación.', secret), status, data.code || 'APPS_SCRIPT')
        }
        return data
      }
      throw scriptError('Apps Script redirigió demasiadas veces.', 502, 'REDIRECT')
    } finally {
      clearTimeout(timer)
    }
  }

  function call(action, fields = {}) {
    const payload = { ...fields, secret, action }
    if (spreadsheetId && payload.spreadsheetId == null) payload.spreadsheetId = spreadsheetId
    return postJson(payload)
  }

  return {
    async sheetsGet(range) {
      const data = await call('get', { range })
      return Array.isArray(data.values) ? data.values : []
    },
    async sheetsAppend(range, values) {
      return call('append', { range, values })
    },
    async sheetsUpdate(range, values) {
      return call('update', { range, values })
    },
    async getSpreadsheetMeta() {
      return normalizeMeta(await call('meta'))
    },
    async batchUpdate(requests) {
      return call('batchUpdate', { requests })
    },
    async uploadJpeg(input = {}) {
      const bytesBase64 = input.bytesBase64 || (input.buffer ? Buffer.from(input.buffer).toString('base64') : '')
      return call('uploadJpeg', {
        name: input.name,
        mimeType: input.mimeType,
        bytesBase64,
        folderId: input.folderId || input.parents?.[0] || folderId,
        appProperties: input.appProperties,
      })
    },
    async downloadJpeg(input = {}) {
      const fileId = typeof input === 'string' ? input : input.fileId
      return call('downloadJpeg', {
        fileId,
        folderId: (typeof input === 'object' && input.folderId) || folderId,
      })
    },
    async fileMeta(input = {}) {
      const fileId = typeof input === 'string' ? input : input.fileId
      return call('fileMeta', {
        fileId,
        folderId: (typeof input === 'object' && input.folderId) || folderId,
      })
    },
  }
}
