/**
 * POST /api/conteo/iniciar
 * POST /api/conteo/:id/captura
 * POST /api/conteo/:id/cerrar
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { createInventarioService } from './lib/inventarioService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function serviceFrom(deps) {
  if (deps?.service) return deps.service
  return createInventarioService(deps?.repo ?? getSheetsRepo())
}

export function parseConteoRequest(event) {
  const bits = [event?.path, event?.rawPath, event?.rawUrl].filter(Boolean).map((value) => String(value).split('?')[0])
  for (const path of bits) {
    const match = path.match(/\/conteo\/([^/]+)\/(captura|cerrar)\/?$/)
    if (match?.[1] && match[1] !== 'iniciar') {
      try {
        return { op: match[2], id: decodeURIComponent(match[1]) }
      } catch {
        return { op: match[2], id: match[1] }
      }
    }
  }
  if (bits.some((path) => /\/conteo\/iniciar\/?$/.test(path) || /\/functions\/conteo\/?$/.test(path) || /\/conteo\/?$/.test(path))) {
    return { op: 'iniciar', id: '' }
  }
  const q = event?.queryStringParameters || {}
  if (q.op === 'iniciar') return { op: 'iniciar', id: '' }
  if (q.id && (q.op === 'captura' || q.op === 'cerrar')) return { op: q.op, id: String(q.id) }
  return { op: '', id: '' }
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (String(event.httpMethod || '').toUpperCase() !== 'POST') return json(event, 405, { error: 'Solo POST.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  const parsed = parseJsonBody(event)
  if (parsed.error) return parsed.error
  const route = parseConteoRequest(event)
  if (!route.op) return json(event, 404, { error: 'Ruta de conteo no reconocida.' }, auth.headers)

  try {
    const svc = serviceFrom(deps)
    if (route.op === 'iniciar') {
      const result = await svc.iniciarConteo(auth.session, parsed.body || {})
      return json(event, 200, result, { ...auth.headers, 'Cache-Control': 'no-store' })
    }
    if (route.op === 'captura') {
      const result = await svc.capturar(auth.session, route.id, parsed.body || {})
      return json(event, 200, result, { ...auth.headers, 'Cache-Control': 'no-store' })
    }
    const result = await svc.cerrarConteo(auth.session, route.id, parsed.body || {})
    return json(event, 200, result, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo registrar el conteo.', code: err?.code }, auth.headers)
  }
}
