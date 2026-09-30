/**
 * POST /api/movimientos
 * Body = movimiento JSON (el mismo que arma la caseta, con fotos ya en http).
 * Append-only, permisos por tipo, idempotente por id, audita crear_movimiento.
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { createMovimientosService } from './lib/movimientosService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function sheets(deps) {
  return deps?.repo ?? getSheetsRepo()
}

function movimientoFromBody(body) {
  if (body && typeof body.movimiento === 'object' && body.movimiento && !body.tipo) return body.movimiento
  return body
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (event.httpMethod !== 'POST') return json(event, 405, { error: 'Solo POST' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  const parsed = parseJsonBody(event)
  if (parsed.error) return parsed.error

  try {
    const svc = createMovimientosService(sheets(deps))
    const result = await svc.crear(auth.session, movimientoFromBody(parsed.body))
    return json(
      event,
      200,
      { movimiento: result.movimiento, idempotent: Boolean(result.idempotent) },
      { ...auth.headers, 'Cache-Control': 'no-store' },
    )
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo registrar el movimiento.' }, auth.headers)
  }
}
