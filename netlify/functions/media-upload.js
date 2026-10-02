/**
 * POST /api/media/upload
 * Body: { fileName, dataUrl | base64, yardaId, movimientoId, slotId }
 * Sube un JPEG/PNG privado a Drive (cuenta de servicio o Apps Script) y devuelve { fileId, viewPath, hash }.
 * Requiere sesión. 120/min por email.
 */

import { createHash } from 'node:crypto'
import { enforceRateLimit, json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { decodeImageBytes, getDriveRepo, mediaViewPath, safeFileName } from './lib/driveRepo.js'

const UPLOADS_PER_MIN = 120

function drive(deps) {
  return deps?.drive ?? getDriveRepo()
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (event.httpMethod !== 'POST') return json(event, 405, { error: 'Solo POST' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  const limited = enforceRateLimit(event, `media-upload:${auth.session.email}`, UPLOADS_PER_MIN, auth.headers)
  if (limited) return limited

  const parsed = parseJsonBody(event)
  if (parsed.error) return parsed.error
  const body = parsed.body || {}

  try {
    const decoded = decodeImageBytes(body.dataUrl || body.base64 || body.bytesBase64 || '')
    const hash = createHash('sha256').update(decoded.buffer).digest('hex')
    const repo = drive(deps)
    const slot = String(body.slotId || 'foto').replace(/[^\w.-]+/g, '-').slice(0, 60)
    const yarda = String(body.yardaId || 'yarda').replace(/[^\w.-]+/g, '-').slice(0, 40)
    const mov = String(body.movimientoId || '').replace(/[^\w.-]+/g, '-').slice(0, 40)
    const fallback = `${yarda}-${slot}${mov ? `-${mov}` : ''}.${decoded.mimeType === 'image/png' ? 'png' : 'jpg'}`
    const uploaded = await repo.uploadPrivateJpeg({
      name: safeFileName(body.fileName, fallback),
      buffer: decoded.buffer,
      mimeType: decoded.mimeType,
      parents: [repo.folderId],
      appProperties: {
        yardaId: body.yardaId || '',
        movimientoId: body.movimientoId || '',
        slotId: body.slotId || '',
        uploadedBy: auth.session.email,
        contentHash: hash,
      },
    })
    const viewPath = mediaViewPath(uploaded.id)
    return json(
      event,
      200,
      { fileId: uploaded.id, viewPath, hash },
      { ...auth.headers, 'Cache-Control': 'no-store' },
    )
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo guardar la foto.' }, auth.headers)
  }
}
