/**
 * GET  /api/preventivo/proximos?yarda=
 * POST /api/preventivo/ot        { servicioId, yarda?, etr?, motivo? }
 * POST /api/preventivo/planes    { tipoUnidad, cadaKm, cadaDias, cadaHorasThermo, avisoPct }
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { createPreventivoService } from './lib/preventivoService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function serviceFrom(deps) {
  if (deps?.service) return deps.service
  return createPreventivoService(deps?.repo ?? getSheetsRepo(), { now: deps?.now })
}

export function rutaPreventivo(event) {
  const bits = [event?.path, event?.rawPath, event?.rawUrl].filter(Boolean).map((value) => String(value).split('?')[0])
  const joined = bits.join(' ')
  if (/preventivo\/proximos/.test(joined)) return 'proximos'
  if (/preventivo\/planes/.test(joined)) return 'planes'
  if (/preventivo\/ot/.test(joined)) return 'ot'
  const op = event?.queryStringParameters?.op
  if (op === 'proximos' || op === 'planes' || op === 'ot') return op
  return ''
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  const method = String(event.httpMethod || '').toUpperCase()
  const ruta = rutaPreventivo(event)
  if (!ruta) return json(event, 404, { error: 'Ruta de preventivo no reconocida.' })
  if (ruta === 'proximos' && method !== 'GET') return json(event, 405, { error: 'Usa GET.' })
  if (ruta !== 'proximos' && method !== 'POST') return json(event, 405, { error: 'Usa POST.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  try {
    const svc = serviceFrom(deps)
    if (ruta === 'proximos') {
      const q = event.queryStringParameters || {}
      const data = await svc.listProximos({
        yarda: q.yarda,
        incluirHechos: q.hechos === '1' || q.hechos === 'true',
      })
      return json(event, 200, data, { ...auth.headers, 'Cache-Control': 'no-store' })
    }
    const parsed = parseJsonBody(event)
    if (parsed.error) return parsed.error
    if (ruta === 'planes') {
      const plan = await svc.upsertPlan(auth.session, parsed.body || {})
      return json(event, 200, { plan }, { ...auth.headers, 'Cache-Control': 'no-store' })
    }
    const result = await svc.abrirOt(auth.session, parsed.body || {})
    return json(
      event,
      200,
      { orden: result.ot, servicio: result.servicio, linked: Boolean(result.linked) },
      { ...auth.headers, 'Cache-Control': 'no-store' },
    )
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo consultar el preventivo.', code: err?.code }, auth.headers)
  }
}
