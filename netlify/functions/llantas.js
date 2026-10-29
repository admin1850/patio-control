/**
 * GET /api/llantas?placa=
 * POST { placa, posicion, numero, dot, profundidad, presion }
 * Si número o DOT cambian y no hay OT abierta, encola LLANTA_SIN_OT.
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'
import { createAvisosService } from './lib/avisosService.js'
import { POSICIONES_LLANTA, cambioDeLlanta, hayOtAbierta } from '../../src/lib/llantas.js'

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error
  const repo = deps?.repo ?? getSheetsRepo()
  const method = String(event.httpMethod || '').toUpperCase()
  try {
    if (method === 'GET') {
      const placa = String(event.queryStringParameters?.placa || '').trim().toUpperCase()
      const filas = await repo.listLlantas()
      return json(event, 200, {
        posiciones: POSICIONES_LLANTA,
        llantas: placa ? filas.filter((fila) => fila.placa === placa) : filas,
      }, auth.headers)
    }
    if (method !== 'POST') return json(event, 405, { error: 'Usa GET o POST.' }, auth.headers)
    const body = parseJsonBody(event)
    const placa = String(body.placa || '').trim().toUpperCase()
    const posicion = String(body.posicion || '').trim().toUpperCase()
    if (!placa || !POSICIONES_LLANTA.some((item) => item.id === posicion)) {
      return json(event, 400, { error: 'Placa y posición (DI, DD, TI, TD, REF).' }, auth.headers)
    }
    const previas = await repo.listLlantas()
    const anterior = [...previas].reverse().find((fila) => fila.placa === placa && fila.posicion === posicion)
    const captura = {
      id: `ll-${placa}-${posicion}-${Date.now()}`,
      placa,
      posicion,
      numero: String(body.numero || '').trim().toUpperCase(),
      dot: String(body.dot || '').trim().toUpperCase(),
      profundidad: body.profundidad == null ? '' : String(body.profundidad),
      presion: body.presion == null ? '' : String(body.presion),
      capturadoEn: new Date().toISOString(),
    }
    await repo.appendLlanta(captura)
    let alerta = false
    if (cambioDeLlanta(anterior, captura)) {
      const ots = typeof repo.listOrdenesTrabajo === 'function' ? await repo.listOrdenesTrabajo() : []
      if (!hayOtAbierta(ots, placa)) {
        alerta = true
        if (typeof repo.appendAvisoLog === 'function' && typeof repo.listAvisosLog === 'function') {
          const avisos = createAvisosService(repo)
          await avisos.enqueue('LLANTA_SIN_OT', {
            unidadId: placa,
            mensaje: `Cambió la llanta ${posicion} de ${placa} (${anterior.numero || 's/n'}/${anterior.dot || 's/DOT'} → ${captura.numero || 's/n'}/${captura.dot || 's/DOT'}) y no hay OT abierta.`,
            dedupeKey: `LLANTA_SIN_OT|${placa}|${posicion}|${captura.numero}|${captura.dot}`,
          })
        }
      }
    }
    return json(event, 200, { llanta: captura, alerta }, auth.headers)
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo guardar la llanta.' }, auth.headers)
  }
}
