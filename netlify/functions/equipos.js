/**
 * /api/equipos
 * GET lista (sesión o X-Patio-Key).
 * POST alta o cambio por id (sesión). El cuerpo es el equipo.
 * DELETE ?id= deja en blanco esa fila (sesión, permiso equipos).
 */

import { json, parseJsonBody, preflight, requireSession, requireSessionOrIntegration } from './lib/http.js'
import { createEquiposService } from './lib/equiposService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function serviceFrom(deps) {
  if (deps?.service) return deps.service
  return createEquiposService(deps?.repo ?? getSheetsRepo())
}

function fail(event, err, headers, fallback) {
  const status = Number(err?.status) || 500
  return json(event, status, { error: err?.message || fallback, code: err?.code }, headers)
}

export async function handler(event, deps) {
  const method = String(event?.httpMethod || '').toUpperCase()
  if (method === 'OPTIONS') return preflight(event)

  if (method === 'GET') {
    const auth = requireSessionOrIntegration(event, { optionalWithoutSecret: false })
    if (auth.error) return auth.error
    try {
      const equipos = await serviceFrom(deps).listarEquipos()
      return json(event, 200, { equipos }, { ...auth.headers, 'Cache-Control': 'no-store' })
    } catch (err) {
      return fail(event, err, auth.headers, 'No se pudieron leer los equipos.')
    }
  }

  if (method === 'POST') {
    const auth = requireSession(event, { optionalWithoutSecret: false })
    if (auth.error) return auth.error
    const parsed = parseJsonBody(event)
    if (parsed.error) return parsed.error
    try {
      const result = await serviceFrom(deps).guardarEquipo(auth.session, parsed.body)
      return json(
        event,
        200,
        { equipo: result.equipo, created: Boolean(result.created) },
        { ...auth.headers, 'Cache-Control': 'no-store' },
      )
    } catch (err) {
      return fail(event, err, auth.headers, 'No se pudo guardar el equipo.')
    }
  }

  if (method === 'DELETE') {
    const auth = requireSession(event, { optionalWithoutSecret: false })
    if (auth.error) return auth.error
    try {
      const result = await serviceFrom(deps).eliminarEquipo(auth.session, event.queryStringParameters?.id)
      return json(event, 200, { ok: true, id: result.id }, { ...auth.headers, 'Cache-Control': 'no-store' })
    } catch (err) {
      return fail(event, err, auth.headers, 'No se pudo eliminar el equipo.')
    }
  }

  return json(event, 405, { error: 'Usa GET, POST o DELETE.' })
}
