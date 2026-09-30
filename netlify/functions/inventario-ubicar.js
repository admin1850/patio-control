/**
 * POST /api/inventario/ubicar
 * Actualiza zona, slot y ubicación de EstadoUnidad después de un movimiento.
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { createInventarioService } from './lib/inventarioService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function serviceFrom(deps) {
  if (deps?.service) return deps.service
  return createInventarioService(deps?.repo ?? getSheetsRepo())
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (String(event.httpMethod || '').toUpperCase() !== 'POST') return json(event, 405, { error: 'Solo POST.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  const parsed = parseJsonBody(event)
  if (parsed.error) return parsed.error

  try {
    const estado = await serviceFrom(deps).ubicarUnidad(auth.session, parsed.body || {})
    return json(event, 200, { estado }, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo ubicar la unidad.', code: err?.code }, auth.headers)
  }
}
