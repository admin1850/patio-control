/**
 * GET /api/integraciones/erp/costos-ot.csv?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Pull diario de sys.carbalmotors.com. Auth: sesión de patio o X-Patio-Key.
 */

import { corsHeaders, json, preflight, requireSessionOrIntegration } from './lib/http.js'
import { costosOtToCsv, fechaQuery, filasCostoOt } from './lib/erpCostos.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (String(event.httpMethod || '').toUpperCase() !== 'GET') return json(event, 405, { error: 'Usa GET.' })

  const auth = requireSessionOrIntegration(event)
  if (auth.error) return auth.error

  try {
    const q = event.queryStringParameters || {}
    const desde = fechaQuery(q.desde, 'desde')
    const hasta = fechaQuery(q.hasta, 'hasta')
    const repo = deps?.repo ?? getSheetsRepo()
    const ots = deps?.ots ?? (await repo.listOrdenesTrabajo())
    const filas = filasCostoOt(ots, { desde, hasta })
    const stamp = desde && hasta ? `${desde}_${hasta}` : 'todas'
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(event),
        ...auth.headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="costos-ot-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
      body: `\uFEFF${costosOtToCsv(filas)}`,
    }
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo exportar los costos de OT.', code: err?.code }, auth.headers)
  }
}
