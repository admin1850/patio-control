/**
 * POST /api/movimientos
 * Body = movimiento JSON (el mismo que arma la caseta, con fotos ya en http).
 * Append-only, permisos por tipo, idempotente por id, audita crear_movimiento.
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { aplicarCumplimientoServidor, createGateService, persistirDefectos } from './lib/gateService.js'
import { createMovimientosService } from './lib/movimientosService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'

function sheets(deps) {
  return deps?.repo ?? getSheetsRepo()
}

function movimientoFromBody(body) {
  if (body && typeof body.movimiento === 'object' && body.movimiento && !body.tipo) return body.movimiento
  return body
}

/**
 * Gate fuerte de salida. El cliente no decide `validadoGate`.
 * Si las pestañas de Fase 1 no existen (503), la salida sigue y el cumplimiento queda sin validar.
 * La bitácora del override la escribe el gate; un segundo intento cercano no duplica el evento.
 */
async function gateSalida(event, session, mov, repo, headers) {
  if (String(mov?.tipo ?? '').trim().toLowerCase() !== 'salida') return null
  if (typeof repo?.listEstadoUnidad !== 'function' || typeof repo?.listOrdenesTrabajo !== 'function') {
    aplicarCumplimientoServidor(mov, { validacionServidor: false, resultado: 'SIN_VALIDACION' })
    return null
  }
  const relacionados = [mov.placaCaja1, mov.placaCaja2]
    .filter(Boolean)
    .map((placa) => ({ placa, tipo: 'caja' }))
  if (mov.equipoTipo === 'dolly') relacionados.push({ unidadId: mov.equipoId, placa: mov.placa, tipo: 'dolly' })
  try {
    const gate = await createGateService(repo).validarSalida(session, {
      equipoId: mov.equipoId,
      placa: mov.placa,
      relacionados,
      overrideMotivo: mov.overrideMotivo,
      trasladoTallerExterno: mov.trasladoTallerExterno === true || mov.motivoSalida === 'TRASLADO_TALLER_EXTERNO',
      motivo: mov.motivo,
      selloCapturado: mov.selloCapturado || mov.selloNumero,
      kilometros: mov.kilometros,
      cartaPorteUuid: mov.cartaPorteUuid || mov.cumplimiento?.cartaPorteUuid,
      licenciaFederal: mov.licenciaFederal || mov.cumplimiento?.licenciaFederal,
      llevaRefrigerada: mov.llevaRefrigerada,
      setPoint: mov.setPoint ?? mov.refrigerada?.setPoint,
      tempReal: mov.tempReal ?? mov.refrigerada?.temperaturaReal,
      dieselThermo: mov.dieselThermo ?? mov.refrigerada?.dieselThermo,
      horometro: mov.horometro ?? mov.refrigerada?.horometroThermo,
      refrigerada: mov.refrigerada,
      cumplimiento: mov.cumplimiento,
    })
    aplicarCumplimientoServidor(mov, gate)
    if (gate.resultado === 'PERMITIDO') return null
    return json(
      event,
      409,
      {
        error: gate.mensaje,
        resultado: gate.resultado,
        motivos: gate.motivos,
        unidades: gate.unidades,
        puedeAutorizar: gate.puedeAutorizar,
      },
      headers,
    )
  } catch (err) {
    if ((Number(err?.status) || 500) === 503) {
      aplicarCumplimientoServidor(mov, { validacionServidor: false, resultado: 'SIN_VALIDACION' })
      return null
    }
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
    const repo = sheets(deps)
    const svc = createMovimientosService(repo)
    const result = await svc.crear(auth.session, mov)
    const avisos = []
    if (String(mov?.tipo ?? '').trim().toLowerCase() === 'salida' && !result.idempotent) {
      try {
        await persistirDefectos(repo, auth.session, { ...mov, id: result.movimiento.id }, result.movimiento.horaServidor)
      } catch (err) {
        if ((Number(err?.status) || 500) === 503) {
          avisos.push('La salida quedó registrada. La hoja Defectos no está; corre npm run migrate:fase3.')
        } else {
          avisos.push(err?.message || 'No se pudieron guardar los daños nuevos.')
        }
      }
    }
    return json(
      event,
      200,
      { movimiento: result.movimiento, idempotent: Boolean(result.idempotent), avisos },
      { ...auth.headers, 'Cache-Control': 'no-store' },
    )
  } catch (err) {
    const status = Number(err?.status) || 500
    return json(event, status, { error: err?.message || 'No se pudo registrar el movimiento.' }, auth.headers)
  }
}
