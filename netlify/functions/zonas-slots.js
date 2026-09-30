/**
 * GET /api/zonas-slots?yarda=
 * POST /api/zonas-slots  — alta o actualización de un slot (no limpia la hoja)
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
  const method = String(event.httpMethod || '').toUpperCase()
  if (method !== 'GET' && method !== 'POST') return json(event, 405, { error: 'Usa GET o POST.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  try {
    const svc = serviceFrom(deps)
    if (method === 'GET') {
      const q = event.queryStringParameters || {}
      const slots = await svc.listarSlots(auth.session, {
        yarda: q.yarda,
        incluirInactivos: q.inactivos === '1' || q.inactivos === 'true',
      })
      return json(event, 200, { slots }, { ...auth.headers, 'Cache-Control': 'no-store' })
    }
    const parsed = parseJsonBody(event)
    if (parsed.error) return parsed.error
    const slot = await svc.guardarSlot(auth.session, parsed.body || {})
    return json(event, 200, { slot }, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudieron guardar los slots.', code: err?.code }, auth.headers)
  }
}
