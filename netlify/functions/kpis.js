/**
 * GET /api/kpis?yarda=&desde=&hasta=&format=csv
 * Disponibilidad, downtime/MTTR, % de OT dentro del ETR original y dwell.
 * format=csv descarga el resumen. Sin format responde JSON.
 */

import { corsHeaders, json, preflight, requireSession } from './lib/http.js'
import { createKpiService, kpisToCsv } from './lib/kpiService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function serviceFrom(deps) {
  if (deps?.service) return deps.service
  return createKpiService(deps?.repo ?? getSheetsRepo(), { now: deps?.now })
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (String(event.httpMethod || '').toUpperCase() !== 'GET') return json(event, 405, { error: 'Usa GET.' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error
  if (auth.session?.permisos && auth.session.permisos.kpis === false) {
    return json(event, 403, { error: 'No tienes permiso para ver los KPIs.' }, auth.headers)
  }

  try {
    const q = event.queryStringParameters || {}
    const kpis = await serviceFrom(deps).resumen({ yarda: q.yarda, desde: q.desde, hasta: q.hasta })
    const format = String(q.format || '').trim().toLowerCase()
    if (format === 'csv') {
      const yarda = kpis.yarda || 'todas'
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders(event),
          ...auth.headers,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="kpis-${yarda}.csv"`,
          'Cache-Control': 'no-store',
        },
        body: `\uFEFF${kpisToCsv(kpis)}`,
      }
    }
    return json(event, 200, { kpis }, { ...auth.headers, 'Cache-Control': 'no-store' })
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudieron calcular los KPIs.', code: err?.code }, auth.headers)
  }
}
