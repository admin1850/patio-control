/**
 * POST /api/movimientos
 * Body = movimiento JSON (el mismo que arma la caseta, con fotos ya en http).
 * Append-only, permisos por tipo, idempotente por id, audita crear_movimiento.
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { createMovimientosService } from './lib/movimientosService.js'
import { createOtService } from './lib/otService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function sheets(deps) {
  return deps?.repo ?? getSheetsRepo()
}

function movimientoFromBody(body) {
  if (body && typeof body.movimiento === 'object' && body.movimiento && !body.tipo) return body.movimiento
  return body
}

/**
 * Bloquea la salida en el servidor si la unidad (o su caja/dolly) no está operable.
 * Si las pestañas de Fase 1 no existen (503), no rompe el gate: la salida sigue.
 * La bitácora del override la escribe validarSalida; un segundo intento cercano no duplica el evento.
 */
async function gateSalida(event, session, mov, repo, headers) {
  if (String(mov?.tipo ?? '').trim().toLowerCase() !== 'salida') return null
  if (typeof repo?.listEstadoUnidad !== 'function' || typeof repo?.listOrdenesTrabajo !== 'function') return null
  const relacionados = [mov.placaCaja1, mov.placaCaja2]
    .filter(Boolean)
    .map((placa) => ({ placa, tipo: 'caja' }))
  if (mov.equipoTipo === 'dolly') relacionados.push({ unidadId: mov.equipoId, placa: mov.placa, tipo: 'dolly' })
  try {
    const gate = await createOtService(repo).validarSalida(session, {
      equipoId: mov.equipoId,
      placa: mov.placa,
      relacionados,
      overrideMotivo: mov.overrideMotivo,
      trasladoTallerExterno: mov.trasladoTallerExterno === true || mov.motivoSalida === 'TRASLADO_TALLER_EXTERNO',
    })
    if (gate.resultado === 'PERMITIDO') return null
    return json(
      event,
      409,
      {
        error: gate.mensaje,
        resultado: gate.resultado,
        unidades: gate.unidades,
        puedeAutorizar: gate.puedeAutorizar,
      },
      headers,
    )
  } catch (err) {
    if ((Number(err?.status) || 500) === 503) return null
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo validar la salida.' }, headers)
  }
}

export async function handler(event, deps) {
  if (event.httpMethod === 'OPTIONS') return preflight(event)
  if (event.httpMethod !== 'POST') return json(event, 405, { error: 'Solo POST' })

  const auth = requireSession(event, { optionalWithoutSecret: false })
  if (auth.error) return auth.error

  const parsed = parseJsonBody(event)
  if (parsed.error) return parsed.error

  const mov = movimientoFromBody(parsed.body)
  const bloqueo = await gateSalida(event, auth.session, mov, sheets(deps), auth.headers)
  if (bloqueo) return bloqueo

  try {
    const svc = createMovimientosService(sheets(deps))
    const result = await svc.crear(auth.session, mov)
    return json(
      event,
      200,
      { movimiento: result.movimiento, idempotent: Boolean(result.idempotent) },
      { ...auth.headers, 'Cache-Control': 'no-store' },
    )
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo registrar el movimiento.' }, auth.headers)
  }
}
