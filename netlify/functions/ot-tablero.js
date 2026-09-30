/**
 * GET /api/ot/tablero?yarda=
 * Tablero "En mantenimiento" con semáforo por ETR.
 */

import { json, preflight, requireSession } from './lib/http.js'
import { intentarAviso } from './lib/avisosService.js'
import { createOtService } from './lib/otService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function serviceFrom(deps) {
  if (deps?.service) return deps.service
  return createOtService(deps?.repo ?? getSheetsRepo())
}

/** En producción engancha avisos. Un doble de prueba sin repo no toca Sheets. */
function repoParaAvisos(deps) {
  if (deps?.repo) return deps.repo
  if (deps?.service) return null
  return getSheetsRepo()
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (String(event.httpMethod || '').toUpperCase() !== 'GET') return json(event, 405, { error: 'Usa GET.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  try {
    const yarda = event.queryStringParameters?.yarda
    const tablero = await serviceFrom(deps).tablero({ yarda })
    await intentarAviso(repoParaAvisos(deps), (avisos) => avisos.revisarEtrVencidas(tablero))
    return json(event, 200, { tablero, estados: tablero.estados }, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo armar el tablero.', code: err?.code }, auth.headers)
  }
}
