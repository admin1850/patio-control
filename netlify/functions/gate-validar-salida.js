/**
 * POST /api/gate/validar-salida
 * { equipoId, placa, relacionados[], overrideMotivo?, trasladoTallerExterno? }
 * → PERMITIDO | BLOQUEADO | REQUIERE_AUTORIZACION
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { createOtService } from './lib/otService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function serviceFrom(deps) {
  if (deps?.service) return deps.service
  return createOtService(deps?.repo ?? getSheetsRepo())
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (String(event.httpMethod || '').toUpperCase() !== 'POST') return json(event, 405, { error: 'Usa POST.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  const parsed = parseJsonBody(event)
  if (parsed.error) return parsed.error

  try {
    const body = parsed.body || {}
    const gate = await serviceFrom(deps).validarSalida(auth.session, body, { auditar: body.consultar !== true })
    return json(event, 200, gate, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo validar la salida.', code: err?.code }, auth.headers)
  }
}
