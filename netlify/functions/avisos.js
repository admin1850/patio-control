/**
 * POST /api/avisos/resumen-diario
 * POST /api/avisos/revisar-etr
 * POST /api/avisos/suscripciones
 *
 * El cron de las 7:00 (centro) vive en avisos-diario.js. Este endpoint es el disparo manual.
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { createAvisosService } from './lib/avisosService.js'
import { createOtService } from './lib/otService.js'
import { normalizeRol } from './lib/permisos.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function avisosFrom(deps) {
  if (deps?.avisos) return deps.avisos
  return createAvisosService(deps?.repo ?? getSheetsRepo(), { now: deps?.now })
}

export function rutaAvisos(event) {
  const bits = [event?.path, event?.rawPath, event?.rawUrl].filter(Boolean).map((value) => String(value).split('?')[0])
  const joined = bits.join(' ')
  if (/avisos\/resumen-diario/.test(joined)) return 'resumen'
  if (/avisos\/revisar-etr/.test(joined)) return 'etr'
  if (/avisos\/suscripciones/.test(joined)) return 'suscripciones'
  const op = event?.queryStringParameters?.op
  if (op === 'resumen' || op === 'etr' || op === 'suscripciones') return op
  return ''
}

function puedeResumen(session) {
  const rol = normalizeRol(session?.rol)
  return rol === 'admin' || rol === 'encargado_yarda'
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (String(event.httpMethod || '').toUpperCase() !== 'POST') return json(event, 405, { error: 'Usa POST.' })

  const ruta = rutaAvisos(event)
  if (!ruta) return json(event, 404, { error: 'Ruta de avisos no reconocida.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error
  if ((ruta === 'resumen' || ruta === 'suscripciones') && !puedeResumen(auth.session)) {
    return json(event, 403, { error: 'El resumen y las suscripciones los dispara el encargado de yarda o admin.' }, auth.headers)
  }

  const parsed = parseJsonBody(event)
  if (parsed.error) return parsed.error

  try {
    const avisos = avisosFrom(deps)
    if (ruta === 'suscripciones') {
      const suscripcion = await avisos.upsertSuscripcion(parsed.body || {})
      return json(event, 200, { suscripcion }, { ...auth.headers, 'Cache-Control': 'no-store' })
    }
    if (ruta === 'resumen') {
      const resumen = await avisos.resumenDiario()
      return json(event, 200, resumen, { ...auth.headers, 'Cache-Control': 'no-store' })
    }
    const repo = deps?.repo ?? getSheetsRepo()
    const ot = deps?.ot ?? createOtService(repo, { now: deps?.now })
    const tablero = await ot.tablero({ yarda: parsed.body?.yarda })
    const revision = await avisos.revisarEtrVencidas(tablero)
    return json(event, 200, revision, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo registrar el aviso.', code: err?.code }, auth.headers)
  }
}
