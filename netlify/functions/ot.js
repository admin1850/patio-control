/**
 * GET /api/ot — lista
 * POST /api/ot — abre una orden (ETR obligatorio) o enlaza la abierta de la unidad
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
  const method = String(event.httpMethod || '').toUpperCase()
  if (method !== 'GET' && method !== 'POST') return json(event, 405, { error: 'Usa GET o POST.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  try {
    const svc = serviceFrom(deps)
    if (method === 'GET') {
      const q = event.queryStringParameters || {}
      const ordenes = await svc.listOTs({
        yarda: q.yarda,
        unidadId: q.unidadId,
        estatus: q.estatus,
        soloAbiertas: q.abiertas === '1' || q.abiertas === 'true',
        includeInactivas: q.inactivas === '1',
      })
      return json(event, 200, { ordenes }, { ...auth.headers, 'Cache-Control': 'no-store' })
    }

    const parsed = parseJsonBody(event)
    if (parsed.error) return parsed.error
    const result = await svc.createOT(auth.session, parsed.body || {})
    return json(
      event,
      200,
      { orden: result.ot, linked: Boolean(result.linked), idempotent: Boolean(result.idempotent), estado: result.estado || null },
      { ...auth.headers, 'Cache-Control': 'no-store' },
    )
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo registrar la orden de trabajo.', code: err?.code }, auth.headers)
  }
}
