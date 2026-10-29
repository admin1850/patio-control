/**
 * GET /api/movimientos-patio
 * POST { accion: 'crear'|'tomar'|'cerrar', ... }
 * Cerrar actualiza el spot de la placa (último `hacia` cerrado).
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'
import { cerrarOrden, crearOrden, mapaSpots, tomarOrden } from '../../src/lib/movimientosPatio.js'

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error
  const repo = deps?.repo ?? getSheetsRepo()
  const method = String(event.httpMethod || '').toUpperCase()
  try {
    const ordenes = await repo.listMovimientosPatio()
    if (method === 'GET') return json(event, 200, { ordenes, mapa: mapaSpots(ordenes) }, auth.headers)
    if (method !== 'POST') return json(event, 405, { error: 'Usa GET o POST.' }, auth.headers)
    const body = parseJsonBody(event)
    const accion = String(body.accion || '').trim().toLowerCase()
    if (accion === 'crear') {
      const orden = crearOrden(body)
      await repo.appendMovimientoPatio(orden)
      return json(event, 200, { orden, mapa: mapaSpots(ordenes) }, auth.headers)
    }
    const actual = ordenes.find((orden) => orden.id === body.id)
    if (!actual) return json(event, 404, { error: 'No está esa orden.' }, auth.headers)
    const siguiente = accion === 'tomar'
      ? tomarOrden(actual, body.quien || auth.session?.email)
      : accion === 'cerrar'
        ? cerrarOrden(actual)
        : null
    if (!siguiente) return json(event, 400, { error: 'accion debe ser crear, tomar o cerrar.' }, auth.headers)
    await repo.updateMovimientoPatio(siguiente)
    const mapa = mapaSpots(ordenes.map((orden) => orden.id === siguiente.id ? siguiente : orden))
    return json(event, 200, { orden: siguiente, mapa }, auth.headers)
  } catch (err) {
    const status = Number(err?.status) || (String(err?.message || '').includes('Solo se') || String(err?.message || '').includes('Falta') ? 400 : 500)
    return json(event, status, { error: err?.message || 'No se pudo mover la unidad.' }, auth.headers)
  }
}
