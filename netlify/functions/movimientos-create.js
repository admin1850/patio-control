/**
 * POST /api/movimientos
 * Body = movimiento JSON (el mismo que arma la caseta, con fotos ya en http).
 * Append-only, permisos por tipo, idempotente por id, audita crear_movimiento.
 */

import { json, parseJsonBody, preflight, requireSession } from './lib/http.js'
import { intentarAviso } from './lib/avisosService.js'
import { aplicarCumplimientoServidor, createGateService, persistirDefectos } from './lib/gateService.js'
import { createEquiposService } from './lib/equiposService.js'
import { createMovimientosService } from './lib/movimientosService.js'
import { marcarLlegadaRecibida } from './lib/llegadasService.js'
import { lecturaDeMovimiento, createPreventivoService } from './lib/preventivoService.js'
import { getSheetsRepo } from './lib/sheetsRepo.js'
import { esMovimientoRapido } from '../../src/lib/movimientoRapido.js'

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
  if (esMovimientoRapido(mov)) {
    aplicarCumplimientoServidor(mov, { resultado: 'RAPIDO', validacionServidor: true })
    return null
  }
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
    if (!result.idempotent) {
      // El horómetro del Thermo no puede tumbar un movimiento que ya quedó guardado.
      try {
        await createEquiposService(repo).aplicarHorometro(result.movimiento)
      } catch (err) {
        console.warn('[movimientos] No se pudo actualizar el horómetro:', err?.message || err)
      }
      const lectura = lecturaDeMovimiento(result.movimiento)
      if ((lectura.km != null || lectura.horometro != null) && typeof repo.listPlanesPreventivo === 'function') {
        try {
          const preventivo = await createPreventivoService(repo).recalcularPorMovimiento(result.movimiento)
          if (preventivo?.servicio?.estatus === 'VENCIDO') {
            await intentarAviso(repo, (avisosSvc) => avisosSvc.enqueue('PREVENTIVO_VENCIDO', {
              yarda: result.movimiento.yardaId || result.movimiento.yarda,
              unidadId: result.movimiento.equipoId,
              mensaje: `Preventivo vencido · ${result.movimiento.placa || result.movimiento.equipoId} · plan ${preventivo.servicio.planId}`,
              dedupeKey: `PREVENTIVO_VENCIDO|${preventivo.servicio.id}|${String(result.movimiento.horaServidor || '').slice(0, 10)}`,
            }))
          }
        } catch (err) {
          if ((Number(err?.status) || 500) === 503) {
            avisos.push('El movimiento quedó registrado. Falta la hoja de preventivo; corre npm run migrate:fase4.')
          } else {
            avisos.push(err?.message || 'No se pudo recalcular el preventivo.')
          }
        }
      }
      await intentarAviso(repo, async (avisosSvc) => {
        const guardado = result.movimiento
        if (guardado.selloCoincideEntrada === false) {
          await avisosSvc.enqueue('SELLO_DISTINTO', {
            yarda: guardado.yardaId,
            unidadId: guardado.equipoId,
            mensaje: `Sello distinto · ${guardado.placa || guardado.equipoId}`,
            dedupeKey: `SELLO_DISTINTO|${guardado.id}`,
          })
        }
        if (guardado.cumplimiento?.thermoAlerta) {
          await avisosSvc.enqueue('THERMO_FUERA', {
            yarda: guardado.yardaId,
            unidadId: guardado.equipoId,
            mensaje: `Thermo fuera de rango · ${guardado.placa || guardado.equipoId}`,
            dedupeKey: `THERMO_FUERA|${guardado.id}`,
          })
        }
        if (guardado.cumplimiento?.gateVia === 'OVERRIDE') {
          await avisosSvc.enqueue('OVERRIDE_GATE', {
            yarda: guardado.yardaId,
            unidadId: guardado.equipoId,
            mensaje: `Salida con autorización de encargado · ${guardado.placa || guardado.equipoId}`,
            dedupeKey: `OVERRIDE_GATE|${guardado.id}`,
          })
        }
      })
    }
    if (result.movimiento?.viajeId) {
      await marcarLlegadaRecibida(repo, result.movimiento.viajeId)
    }
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
