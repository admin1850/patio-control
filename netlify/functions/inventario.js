/**
 * GET /api/inventario?yarda=
 * Agregados por tipo × estatus, unidades y ocupación de slots.
 */

import { json, preflight, requireSession } from './lib/http.js'
import { createInventarioService } from './lib/inventarioService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function serviceFrom(deps) {
  if (deps?.service) return deps.service
  return createInventarioService(deps?.repo ?? getSheetsRepo())
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (String(event.httpMethod || '').toUpperCase() !== 'GET') return json(event, 405, { error: 'Solo GET.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  try {
    const yarda = event.queryStringParameters?.yarda || ''
    const inventario = await serviceFrom(deps).consultar(auth.session, { yarda })
    return json(event, 200, { inventario }, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo leer el inventario.', code: err?.code }, auth.headers)
  }
}
