/**
 * POST /api/integraciones/frotcom/conciliar
 * También corre cada 30 min (Netlify scheduled). Sin FROTCOM_API_URL/FROTCOM_TOKEN
 * responde ok:true, dryRun y alertas vacías — no escribe AvisosLog.
 *
 * Auth manual: sesión de patio o X-Patio-Key. El cron de Netlify (next_run) no pide llave.
 */

import { esInvocacionProgramada } from './avisos-diario.js'
import { json, preflight, requireSessionOrIntegration } from './lib/http.js'
import { conciliarFrotcom } from './lib/frotcomService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

export const config = {
  schedule: '*/30 * * * *',
}

export async function handler(event, deps) {
  const scheduled = !deps?.forceManual && esInvocacionProgramada(event)
  let headers = {}
  if (!scheduled) {
    if (event?.httpMethod === 'OPTIONS') return preflight(event)
    if (String(event?.httpMethod || 'POST').toUpperCase() !== 'POST') return json(event, 405, { error: 'Usa POST.' })
    const auth = requireSessionOrIntegration(event)
    if (auth.error) return auth.error
    headers = auth.headers
  }
  try {
    const result = await conciliarFrotcom(deps?.repo ?? getSheetsRepo(), {
      env: deps?.env ?? process.env,
      provider: deps?.provider,
      fetch: deps?.fetch,
      now: deps?.now,
    })
    return json(event, 200, result, { ...headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { ok: false, dryRun: false, alertas: [], error: err?.message || 'No se pudo conciliar Frotcom.' }, headers)
  }
}
