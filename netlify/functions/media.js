/**
 * GET /api/media?id=<fileId>  y  GET /api/media/<fileId>
 * Requiere sesión. Entrega la imagen con el token de la cuenta de servicio
 * (alt=media). No redirige a un enlace público de Drive.
 */

import { corsHeaders, json, preflight, requireSession } from './lib/http.js'
import { getDriveRepo } from './lib/driveRepo.js'

function drive(deps) {
  return deps?.drive ?? getDriveRepo()
}

export function extractMediaFileId(event) {
  const q = event?.queryStringParameters || {}
  const fromQuery = q.id || q.fileId
  if (fromQuery) return String(fromQuery).trim()
  const candidates = [event?.path, event?.rawPath, event?.rawUrl]
  for (const c of candidates) {
    if (!c) continue
    const path = String(c).split('?')[0]
    const m = path.match(/\/(?:api\/)?media\/([^/]+)$/)
    if (m && m[1] && m[1] !== 'upload') {
      try {
        return decodeURIComponent(m[1])
      } catch {
        return m[1]
      }
    }
  }
  return ''
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (event.httpMethod !== 'GET') return json(event, 405, { error: 'Solo GET' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  const fileId = extractMediaFileId(event)
  if (!fileId) {
    return json(event, 400, { error: 'Falta el id de la evidencia.' }, auth.headers)
  }

  try {
    const file = await drive(deps).downloadPrivateFile(fileId)
    const cors = corsHeaders(event)
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...cors,
        ...auth.headers,
        'Content-Type': file.mimeType || 'image/jpeg',
        'Cache-Control': 'private, max-age=60',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
      body: Buffer.from(file.bytes).toString('base64'),
    }
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo abrir la evidencia.' }, auth.headers)
  }
}
