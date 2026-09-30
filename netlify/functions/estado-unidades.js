/**
 * GET /api/estado-unidades
 * Lista las filas de EstadoUnidad (sesión). No escribe.
 * Los chips del patio lo usan para no depender solo del tablero de OT.
 */

import { json, preflight, requireSession } from './lib/http.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function repoFrom(deps) {
  return deps?.repo ?? getSheetsRepo()
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (String(event.httpMethod || '').toUpperCase() !== 'GET') {
    return json(event, 405, { error: 'Solo GET' })
  }

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  try {
    const estados = await repoFrom(deps).listEstadoUnidad()
    return json(event, 200, { estados: Array.isArray(estados) ? estados : [] }, {
      ...auth.headers,
      'Cache-Control': 'no-store',
    })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudieron leer los estados de unidad.' }, auth.headers)
  }
}
