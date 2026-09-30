/**
 * GET /api/movimientos?limit=500
 * Lista movimientos de la hoja (sesión requerida). No escribe.
 */

import { json, preflight, requireSession } from './lib/http.js'
import { createMovimientosService } from './lib/movimientosService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function sheets(deps) {
  return deps?.repo ?? getSheetsRepo()
}

export function parseLimit(event, fallback = 500, max = 2000) {
  const raw = event?.queryStringParameters?.limit
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(max, Math.floor(n))
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (event.httpMethod !== 'GET') return json(event, 405, { error: 'Solo GET' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  try {
    const svc = createMovimientosService(sheets(deps))
    const movimientos = await svc.listar({ limit: parseLimit(event) })
    return json(event, 200, { movimientos }, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudieron leer los movimientos.' }, auth.headers)
  }
}
