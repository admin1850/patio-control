/**
 * POST /api/diesel/anomalias
 * Lee movimientos y encola DIESEL_ANOMALIA (una vez por tramo y día).
 * El cálculo también vive en la página de KPIs, sin esperar a este POST.
 */

import { json, preflight, requireSession } from './lib/http.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'
import { createAvisosService } from './lib/avisosService.js'
import { resumenDiesel } from '../../src/lib/dieselRendimiento.js'
import { fechaMxISO } from '../../src/lib/vigenciaDocumentos.js'

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (String(event.httpMethod || '').toUpperCase() !== 'POST') return json(event, 405, { error: 'Usa POST.' })
  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error
  const repo = deps?.repo ?? getSheetsRepo()
  try {
    const movimientos = typeof repo.listMovimientos === 'function' ? await repo.listMovimientos() : []
    const res = resumenDiesel(movimientos)
    const hoy = fechaMxISO()
    let encoladas = 0
    if (typeof repo.appendAvisoLog === 'function' && typeof repo.listAvisosLog === 'function') {
      const avisos = createAvisosService(repo)
      for (const tramo of res.anomalias) {
        await avisos.enqueue('DIESEL_ANOMALIA', {
          unidadId: tramo.unidadId,
          mensaje: `${tramo.placa} rindió ${tramo.kmPorLitro.toFixed(2)} km/L (${tramo.deltaKm.toFixed(0)} km / ${tramo.deltaLitros.toFixed(0)} L)${tramo.operador ? ` · ${tramo.operador}` : ''}.`,
          dedupeKey: `DIESEL_ANOMALIA|${tramo.unidadId}|${tramo.hasta}|${hoy}`,
        })
        encoladas += 1
      }
    }
    return json(event, 200, {
      tramos: res.tramos.length,
      anomalias: res.anomalias.length,
      porUnidad: res.porUnidad,
      porOperador: res.porOperador,
      encoladas,
    }, auth.headers)
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo calcular el diésel.' }, auth.headers)
  }
}
