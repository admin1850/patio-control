/**
 * POST /api/integraciones/chofer/preaviso
 *   { viajeId, placas, cajas[], dolly, sello, cartaPorte, eta, yardaId }
 * GET  /api/integraciones/chofer/preaviso            → llegadas pendientes
 * GET  /api/integraciones/chofer/preaviso?viajeId=  → match + sello esperado
 * GET  /api/integraciones/chofer/preaviso?q=        → mismo match (texto de QR)
 *
 * Auth: cookie/Bearer de patio o header X-Patio-Key.
 */

import { json, parseJsonBody, preflight, requireSessionOrIntegration } from './lib/http.js'
import { createLlegadasService } from './lib/llegadasService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function serviceFrom(deps) {
  if (deps?.service) return deps.service
  return createLlegadasService(deps?.repo ?? getSheetsRepo(), { now: deps?.now })
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  const method = String(event.httpMethod || '').toUpperCase()
  if (method !== 'GET' && method !== 'POST') return json(event, 405, { error: 'Usa GET o POST.' })

  const auth = requireSessionOrIntegration(event)
  if (auth.error) return auth.error

  try {
    const svc = serviceFrom(deps)
    if (method === 'POST') {
      const parsed = parseJsonBody(event)
      if (parsed.error) return parsed.error
      const result = await svc.registrar(parsed.body || {})
      return json(event, 200, { ok: true, ...result }, { ...auth.headers, 'Cache-Control': 'no-store' })
    }
    const q = event.queryStringParameters || {}
    const raw = q.q || q.viajeId || q.qr || ''
    if (String(raw).trim()) {
      const match = await svc.buscar(raw)
      return json(event, 200, { ok: true, match }, { ...auth.headers, 'Cache-Control': 'no-store' })
    }
    const llegadas = await svc.listar({ yarda: q.yarda, estatus: q.estatus || 'PENDIENTE' })
    return json(event, 200, { ok: true, llegadas }, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo guardar el preaviso.', code: err?.code }, auth.headers)
  }
}
